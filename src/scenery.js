import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { INK, OUTLINE_THICKNESS, DEFAULT_PALETTE, noOutline, setOutline } from './style.js';

// Scenery shared by every level: renderer + ink outlines, painted sky dome,
// cartoon ocean, puffy clouds and the two lights. Each part takes a level
// palette (see DEFAULT_PALETTE in style.js) through setPalette / applyPalette.

const withDefaults = (p) => ({ ...DEFAULT_PALETTE, ...(p || {}) });
const glslNum = (v) => {
  const s = Number(v).toFixed(6);
  return s.includes('.') ? s : s + '.0';
};

// ---------------------------------------------------------------------------
// Ink outlines
// ---------------------------------------------------------------------------
// The outline pass of three r170's OutlineEffect (vendor/addons/effects/), with the
// same shader and the same per-material options (material.userData.outlineParameters:
// thickness, color, alpha, visible): every mesh with normals is drawn a second time,
// back faces only, pushed out along its normals in clip space and filled with ink.
//
// Only the bookkeeping differs. The vendored effect keeps a key for every mesh it
// has ever drawn (it assigns `undefined` but never deletes) and walks all of them
// every frame, so each cannonball, coin and level load made every later frame a bit
// slower; and outline materials with `keepAlive` were never evicted (nor disposed,
// so the renderer kept them as well). Here the per-frame swap list is a reused
// array, and an outline material unused for EVICT_FRAMES frames is disposed.
const OUTLINE_VERTEX = `
#include <common>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
uniform float outlineThickness;
vec4 calculateOutline( vec4 pos, vec3 normal, vec4 skinned ) {
	float thickness = outlineThickness;
	const float ratio = 1.0;
	vec4 pos2 = projectionMatrix * modelViewMatrix * vec4( skinned.xyz + normal, 1.0 );
	vec4 norm = normalize( pos - pos2 );
	return pos + norm * thickness * pos.w * ratio;
}
void main() {
	#include <uv_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	vec3 outlineNormal = - objectNormal; // the outline material is always rendered with BackSide
	gl_Position = calculateOutline( gl_Position, outlineNormal, vec4( transformed, 1.0 ) );
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`;
const OUTLINE_FRAGMENT = `
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
uniform vec3 outlineColor;
uniform float outlineAlpha;
void main() {
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( outlineColor, outlineAlpha );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`;
const EVICT_FRAMES = 60;
const noHook = () => {};
const outlinePasses = new WeakMap(); // renderer -> pass (for outlineStats)

function createOutlinePass(renderer, { thickness = 0.003, color = [0, 0, 0] } = {}) {
  const uniformsOutline = {
    outlineThickness: { value: thickness },
    outlineColor: { value: new THREE.Color().fromArray(color) },
    outlineAlpha: { value: 1 },
  };
  // original material uuid -> { material, frame } (keyed by uuid so that a dropped
  // level's materials are not kept alive until their entries are evicted)
  const cache = new Map();
  const arrays = new WeakMap(); // original material array -> { materials, frame }
  let frame = 0;
  // Swapped (or hidden) during the current outline render; emptied right after it.
  const swapped = [];
  const originals = [];
  const hooks = [];
  const hidden = [];

  // Copy the original material's state and outline options onto its outline material.
  function sync(m, o) {
    const p = o.userData.outlineParameters;
    const u = m.uniforms;
    m.fog = o.fog;
    m.toneMapped = o.toneMapped;
    m.premultipliedAlpha = o.premultipliedAlpha;
    m.displacementMap = o.displacementMap;
    u.outlineAlpha.value = o.opacity;
    if (p !== undefined) {
      m.visible = o.visible === false ? false : p.visible !== undefined ? p.visible : true;
      m.transparent = p.alpha !== undefined && p.alpha < 1 ? true : o.transparent;
      if (p.thickness !== undefined) u.outlineThickness.value = p.thickness;
      if (p.color !== undefined) u.outlineColor.value.fromArray(p.color);
      if (p.alpha !== undefined) u.outlineAlpha.value = p.alpha;
    } else {
      m.transparent = o.transparent;
      m.visible = o.visible;
    }
    if (o.wireframe === true || o.depthTest === false) m.visible = false;
    if (o.clippingPlanes) {
      m.clipping = true;
      m.clippingPlanes = o.clippingPlanes;
      m.clipIntersection = o.clipIntersection;
      m.clipShadows = o.clipShadows;
    }
    if (o.displacementMap) {
      u.displacementMap.value = o.displacementMap;
      u.displacementScale.value = o.displacementScale;
      u.displacementBias.value = o.displacementBias;
    }
    m.version = o.version; // recompile the outline when the original needs it
  }

  function outlineFor(o) {
    let e = cache.get(o.uuid);
    if (e === undefined) {
      const material = new THREE.ShaderMaterial({
        type: 'OutlineEffect',
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, THREE.UniformsLib.displacementmap, uniformsOutline]),
        vertexShader: OUTLINE_VERTEX,
        fragmentShader: OUTLINE_FRAGMENT,
        side: THREE.BackSide,
      });
      e = { material, frame: -1 };
      cache.set(o.uuid, e);
    }
    if (e.frame !== frame) {
      e.frame = frame;
      sync(e.material, o);
    }
    return e.material;
  }

  function outlineArray(list) {
    let e = arrays.get(list);
    if (e === undefined) {
      e = { materials: [], frame: -1 };
      arrays.set(list, e);
    }
    if (e.frame !== frame) {
      e.frame = frame;
      e.materials.length = list.length;
      for (let i = 0; i < list.length; i++) e.materials[i] = outlineFor(list[i]);
    }
    return e.materials;
  }

  // Meshes with normals get their outline material (also when hidden, which keeps
  // their cache entry alive, like OutlineEffect's scene.traverse). Anything else
  // (sprites, points, lines, normal-less meshes) would be drawn a second time with
  // its own material, doubling the opacity of labels and particles: hide it.
  const prepare = (o) => {
    if (o.isMesh === true && o.material !== undefined && o.geometry !== undefined && o.geometry.attributes.normal !== undefined) {
      swapped.push(o);
      originals.push(o.material);
      hooks.push(o.onBeforeRender);
      o.material = Array.isArray(o.material) ? outlineArray(o.material) : outlineFor(o.material);
      o.onBeforeRender = noHook;
    } else if (o.visible && (o.isSprite || o.isPoints || o.isLine || (o.isMesh && o.children.length === 0))) {
      o.visible = false;
      hidden.push(o);
    }
  };

  function evict() {
    for (const [uuid, e] of cache) {
      if (frame - e.frame > EVICT_FRAMES) {
        e.material.dispose();
        cache.delete(uuid);
      }
    }
  }

  const pass = {
    enabled: true,
    autoClear: renderer.autoClear,
    renderOutline(scene, camera) {
      frame++;
      const autoClear = renderer.autoClear;
      const autoUpdate = scene.matrixWorldAutoUpdate;
      const background = scene.background;
      const shadows = renderer.shadowMap.enabled;
      scene.matrixWorldAutoUpdate = false; // matrices are fresh from the colour pass
      scene.background = null;
      renderer.autoClear = false;
      renderer.shadowMap.enabled = false;
      try {
        scene.traverse(prepare);
        // Same frame as the colour pass: three updates skeletons (bone textures), geometry and
        // instance matrices once per info.render.frame, which each render() counts up. They are
        // already up to date, so don't let this second render upload them all again.
        renderer.info.render.frame--;
        renderer.render(scene, camera);
      } finally {
        for (let i = 0; i < swapped.length; i++) {
          swapped[i].material = originals[i];
          swapped[i].onBeforeRender = hooks[i];
        }
        for (let i = 0; i < hidden.length; i++) hidden[i].visible = true;
        swapped.length = originals.length = hooks.length = hidden.length = 0;
        scene.matrixWorldAutoUpdate = autoUpdate;
        scene.background = background;
        renderer.autoClear = autoClear;
        renderer.shadowMap.enabled = shadows;
      }
      if (frame % EVICT_FRAMES === 0) evict();
    },
    /** Bookkeeping sizes, for tests. */
    stats() {
      return { cache: cache.size, pending: swapped.length + hidden.length, frame };
    },
  };
  outlinePasses.set(renderer, pass);
  return pass;
}

/** Outline bookkeeping sizes of a renderer made by createRenderer (for tests and debugging). */
export function outlineStats(renderer) {
  const pass = outlinePasses.get(renderer);
  return pass ? pass.stats() : null;
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const ratio = () => Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
  renderer.setPixelRatio(ratio());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // keep cartoon colours exact
  const effect = createOutlinePass(renderer, { thickness: OUTLINE_THICKNESS, color: INK });
  return {
    renderer,
    effect,
    setSize(cssW, cssH) {
      renderer.setPixelRatio(ratio());
      renderer.setSize(Math.max(1, Math.round(cssW)), Math.max(1, Math.round(cssH)), false);
    },
    render(scene, camera) {
      if (effect.enabled === false) {
        renderer.render(scene, camera);
        return;
      }
      const autoClear = renderer.autoClear;
      renderer.autoClear = effect.autoClear;
      renderer.render(scene, camera);
      renderer.autoClear = autoClear;
      effect.renderOutline(scene, camera);
    },
  };
}

// ---------------------------------------------------------------------------
// Waves: one analytic height field shared by the ocean shader and the ships.
// Four travelling sines, wavelengths 16-52 units, amplitudes summing to 0.6,
// so |h| <= 0.6 * amp. Constants are rounded once and used verbatim in both
// the JS and GLSL versions so they agree.
// ---------------------------------------------------------------------------
const r6 = (v) => Number(v.toFixed(6));
const WAVES = [
  { deg: 37, len: 52, a: 0.22, ph: 0.0 },
  { deg: 117, len: 33, a: 0.16, ph: 1.3 },
  { deg: -14, len: 22, a: 0.12, ph: 2.7 },
  { deg: 233, len: 16, a: 0.1, ph: 4.1 },
].map(({ deg, len, a, ph }) => {
  const k = (2 * Math.PI) / len;
  const ang = (deg * Math.PI) / 180;
  return { kx: r6(Math.cos(ang) * k), kz: r6(Math.sin(ang) * k), w: r6(0.8 * Math.sqrt(9.8 * k)), a, ph };
});

/** Height of the sea surface at (x, z) and time t. Identical to the ocean vertex shader. */
export function waveHeight(x, z, t, amp = 1) {
  let h = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const w = WAVES[i];
    h += w.a * Math.sin(w.kx * x + w.kz * z - w.w * t + w.ph);
  }
  return h * amp;
}

const WAVE_GLSL = /* glsl */ `
float waveH(vec2 p, float t, float amp) {
  float h = 0.0;
${WAVES.map((w) => `  h += ${glslNum(w.a)} * sin(${glslNum(w.kx)} * p.x + ${glslNum(w.kz)} * p.y - ${glslNum(w.w)} * t + ${glslNum(w.ph)});`).join('\n')}
  return h * amp;
}
// x: height, y: dh/dx, z: dh/dz
vec3 waveHG(vec2 p, float t, float amp) {
  vec3 r = vec3(0.0);
  float ph;
${WAVES.map((w) => `  ph = ${glslNum(w.kx)} * p.x + ${glslNum(w.kz)} * p.y - ${glslNum(w.w)} * t + ${glslNum(w.ph)};
  r += ${glslNum(w.a)} * vec3(sin(ph), ${glslNum(w.kx)} * cos(ph), ${glslNum(w.kz)} * cos(ph));`).join('\n')}
  return r * amp;
}
`;

const NOISE_GLSL = /* glsl */ `
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

// ---------------------------------------------------------------------------
// Ocean
// ---------------------------------------------------------------------------
// Nested square rings (a tiny clipmap): fine near the focus, coarser outside.
// Ring edges are multiples of the next ring's spacing, and the odd vertices on a
// fine ring's outer edge average their neighbours' heights, so there are no cracks.
const OCEAN_LEVELS = [
  { s: 2, e: 96 },
  { s: 4, e: 192 },
  { s: 8, e: 320 },
  { s: 16, e: 448 },
  { s: 32, e: 640 },
];
const OCEAN_SNAP = 32; // coarsest spacing: recentring by multiples keeps every vertex on its lattice
const OCEAN_EXTENT = OCEAN_LEVELS[OCEAN_LEVELS.length - 1].e;
const MAX_CLOUD_SHADOWS = 24;

// ---------------------------------------------------------------------------
// Shorelines: the foam circles are baked once (per setFoam) into a signed
// distance texture, so any number of circles costs one texture fetch per pixel
// and nothing pops as the player moves. Distances are smooth-min blended so a
// chain of overlapping circles reads as one coastline.
// ---------------------------------------------------------------------------
const SHORE_CLAMP = 16; // shore effects end before this distance from land
const SHORE_MIN = -8; // deep inside land nothing is visible
const SHORE_K = 4; // smooth-min radius between neighbouring circles
// A circle further than this (from its rim) cannot change a texel: smin(a, b, k)
// equals min(a, b) when |a - b| >= k, and anything above SHORE_CLAMP is clamped.
const SHORE_REACH = SHORE_CLAMP + SHORE_K + 2;

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Bakes circles into a half-float distance field; returns {data, res, x0, z0, size}. */
function bakeShoreField(circles) {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const c of circles) {
    const m = c.r + SHORE_REACH;
    x0 = Math.min(x0, c.x - m);
    z0 = Math.min(z0, c.z - m);
    x1 = Math.max(x1, c.x + m);
    z1 = Math.max(z1, c.z + m);
  }
  const size = Math.max(x1 - x0, z1 - z0, 1);
  // about one texel per world unit (0.6-1.3 for arenas up to ~1300 units across)
  const res = Math.min(1024, Math.max(256, 2 ** Math.ceil(Math.log2(size / 1.3))));
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  x0 = cx - size / 2;
  z0 = cz - size / 2;
  const cell = size / res;
  const field = new Float32Array(res * res).fill(1e4);
  for (const c of circles) {
    const reach = c.r + SHORE_REACH;
    const i0 = Math.max(0, Math.floor((c.x - reach - x0) / cell));
    const i1 = Math.min(res - 1, Math.ceil((c.x + reach - x0) / cell));
    const j0 = Math.max(0, Math.floor((c.z - reach - z0) / cell));
    const j1 = Math.min(res - 1, Math.ceil((c.z + reach - z0) / cell));
    for (let j = j0; j <= j1; j++) {
      const dz = z0 + (j + 0.5) * cell - c.z;
      const row = j * res;
      for (let i = i0; i <= i1; i++) {
        const dx = x0 + (i + 0.5) * cell - c.x;
        const d = Math.sqrt(dx * dx + dz * dz) - c.r;
        if (d > reach - c.r) continue;
        field[row + i] = smin(field[row + i], d, SHORE_K);
      }
    }
  }
  const open = THREE.DataUtils.toHalfFloat(SHORE_CLAMP);
  const data = new Uint16Array(res * res).fill(open);
  for (let i = 0; i < field.length; i++) {
    if (field[i] < SHORE_CLAMP) data[i] = THREE.DataUtils.toHalfFloat(Math.max(SHORE_MIN, field[i]));
  }
  return { data, res, x0, z0, size };
}

function buildOceanGeometry() {
  const pos = [];
  const morph = [];
  const index = [];
  let inner = 0;
  OCEAN_LEVELS.forEach(({ s, e }, li) => {
    const n = Math.round((2 * e) / s);
    const last = li === OCEAN_LEVELS.length - 1;
    const ids = new Map();
    const vid = (i, j) => {
      const key = i * (n + 1) + j;
      let id = ids.get(key);
      if (id !== undefined) return id;
      id = pos.length / 3;
      ids.set(key, id);
      pos.push(-e + i * s, 0, -e + j * s);
      let mx = 0;
      let mz = 0;
      if (!last) {
        if ((i === 0 || i === n) && j % 2 === 1) mz = s; // edge along z
        else if ((j === 0 || j === n) && i % 2 === 1) mx = s; // edge along x
      }
      morph.push(mx, mz);
      return id;
    };
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const cx = -e + (i + 0.5) * s;
        const cz = -e + (j + 0.5) * s;
        if (Math.abs(cx) < inner && Math.abs(cz) < inner) continue;
        const a = vid(i, j);
        const b = vid(i + 1, j);
        const c = vid(i, j + 1);
        const d = vid(i + 1, j + 1);
        index.push(a, c, b, b, c, d);
      }
    }
    inner = e;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // Normals are unused by the shader but let OutlineEffect recognise (and skip) the mesh.
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aMorph', new THREE.Float32BufferAttribute(morph, 2));
  g.setIndex(index);
  const E = OCEAN_LEVELS[OCEAN_LEVELS.length - 1].e;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), E * Math.SQRT2);
  return g;
}

// Cloud shadows, shared between createClouds (writer) and createOcean (reader).
const cloudShadow = {
  list: { value: Array.from({ length: MAX_CLOUD_SHADOWS }, () => new THREE.Vector4()) },
  count: { value: 0 },
  strength: { value: 0 },
};

const OCEAN_VERT = /* glsl */ `
uniform float uTime;
uniform float uAmp;
attribute vec2 aMorph;
varying vec3 vWorld;
#include <fog_pars_vertex>
${WAVE_GLSL}
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float h;
  if (aMorph.x != 0.0 || aMorph.y != 0.0) {
    // stitch vertex: follow the coarser neighbour ring's straight edge
    h = 0.5 * (waveH(wp.xz - aMorph, uTime, uAmp) + waveH(wp.xz + aMorph, uTime, uAmp));
  } else {
    h = waveH(wp.xz, uTime, uAmp);
  }
  wp.y += h;
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const OCEAN_FRAG = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uSkyHorizon;
uniform sampler2D uShoreTex; // signed distance to the nearest shoreline (world units)
uniform vec4 uShoreXf; // xy: world xz of the texture's corner, z: 1 / size, w: 1 if any shore
uniform vec2 uCenter; // xz centre of the ocean mesh (its far edge fades into the fog)
uniform vec4 uCloudSh[${MAX_CLOUD_SHADOWS}];
uniform int uCloudN;
uniform float uCloudStrength;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
${WAVE_GLSL}
${NOISE_GLSL}

// x: distance to the nearest feature point, y: F2 - F1 (cell edges)
vec2 worley(vec2 p, float t) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float f1 = 9.0, f2 = 9.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 b = vec2(float(x), float(y));
      vec2 o = hash22(i + b);
      o = 0.5 + 0.38 * sin(t + 6.2831 * o);
      vec2 r = b + o - f;
      float d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  f1 = sqrt(f1);
  return vec2(f1, sqrt(f2) - f1);
}

// crisp cartoon edge with ~1px anti-aliasing
float edge(float v, float th) {
  float w = max(fwidth(v), 1e-4) * 0.75;
  return smoothstep(th - w, th + w, v);
}

void main() {
  vec2 p = vWorld.xz;
  float t = uTime;
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec3 L = normalize(uSunDir);

  // fade fine detail with distance so it never shimmers
  float near = 1.0 - smoothstep(70.0, 190.0, dist);

  vec3 hg = waveHG(p, t, uAmp);
  float maxH = 0.6 * max(uAmp, 0.05);
  float hn = clamp(hg.x / maxH, -1.0, 1.0);

  // shading normal: the real waves plus small ripples (shading only)
  vec2 d1 = vec2(0.83, 0.55), d2 = vec2(-0.42, 0.91);
  float r1 = dot(p, d1) * 1.05 - t * 2.3;
  float r2 = dot(p, d2) * 1.6 - t * 2.9;
  vec2 rip = (d1 * cos(r1) * 0.07 + d2 * cos(r2) * 0.05) * near;
  vec3 n = normalize(vec3(-(hg.y + rip.x), 1.0, -(hg.z + rip.y)));

  // ---- painted body colour: deep / mid / light bands following the swell.
  // Bands are stretched along the crests of the main swell and gently warped.
  vec2 d0 = normalize(vec2(${glslNum(WAVES[0].kx)}, ${glslNum(WAVES[0].kz)}));
  float su = dot(p, d0);
  float sv = dot(p, vec2(-d0.y, d0.x));
  float ph0 = ${glslNum(WAVES[0].kx)} * p.x + ${glslNum(WAVES[0].kz)} * p.y - ${glslNum(WAVES[0].w)} * t + ${glslNum(WAVES[0].ph)};
  vec2 bandNoise = vec2(vnoise(vec2(su * 0.06, sv * 0.022) + vec2(t * 0.02, 0.0)), vnoise(p * 0.11 - vec2(0.0, t * 0.05)));
  float swell = sin(ph0 + (bandNoise.x - 0.5) * 3.0);
  float tone = 0.5 * hn + 0.34 * swell + 0.3 * (vnoise(vec2(su * 0.1, sv * 0.035) - t * 0.03) - 0.5) + 0.14 * (bandNoise.y - 0.5);
  tone += 2.2 * (dot(n, L) - L.y * 0.98);
  tone = mix(tone, 0.15, smoothstep(140.0, 300.0, dist)); // calm, even water far away
  vec3 midCol = mix(uDeep, uShallow, 0.42);
  vec3 col = mix(uDeep, midCol, edge(tone, -0.12));
  col = mix(col, uShallow, edge(tone, 0.42));

  // far water mirrors the sky near the horizon: two painted bands of reflection
  float graze = 1.0 - clamp(V.y * 3.2, 0.0, 1.0);
  vec3 skyRefl = mix(uShallow, uSkyHorizon, 0.55);
  col = mix(col, skyRefl, 0.4 * edge(graze, 0.82) + 0.25 * edge(graze, 0.93));

  // ---- cloud shadows drifting over the water
  float shadow = 0.0;
  for (int i = 0; i < ${MAX_CLOUD_SHADOWS}; i++) {
    if (i >= uCloudN) break;
    vec4 c = uCloudSh[i];
    vec2 q = (p - c.xy) / c.zw;
    float wob = 0.12 * sin(q.x * 3.0 + q.y * 2.0 + t * 0.2);
    shadow = max(shadow, 1.0 - edge(dot(q, q) + wob, 1.0));
  }
  col *= 1.0 - shadow * uCloudStrength;

  // ---- crest highlights: a broken white rim along the top of the light bands
  float lineFade = 1.0 - smoothstep(35.0, 120.0, dist);
  // short brush strokes: the dash noise both cuts the rim and tapers its width
  float dash = vnoise(p * vec2(0.55, 0.42) + vec2(t * 0.08, -t * 0.06));
  float taper = smoothstep(0.52 - 0.1 * clamp(uAmp - 1.0, 0.0, 1.0), 0.72, dash);
  float tw0 = fwidth(tone);
  float rim = 1.0 - smoothstep(0.4 + 1.1 * taper, 0.9 + 1.2 * taper, abs(tone - 0.5) / max(tw0, 1e-4));
  float lines = rim * step(0.001, taper) * lineFade;

  // ---- white caps: a foam patch on the highest crests with a bubbly fringe
  vec2 wr = worley(p * 0.8 + vec2(t * 0.05, t * 0.03), t * 0.7);
  float capField = hn + (bandNoise.y - 0.5) * 0.5;
  float bubbleR = 0.27 * smoothstep(0.7, 0.98, capField);
  float caps = (1.0 - edge(wr.x, bubbleR)) * step(0.02, bubbleR) * lineFade;
  // rougher seas (waveAmp > 1) break into more white caps
  float rough = clamp(uAmp - 1.0, 0.0, 1.0);
  caps = max(caps, edge(capField - (wr.x - 0.4) * 0.12 + rough * 0.12, 1.0) * (1.0 - smoothstep(110.0, 210.0, dist)));

  // ---- sun glints: little twinkling stars where the water mirrors the sun
  vec3 R = reflect(-V, n);
  float sunR = max(dot(R, L), 0.0);
  float sunPath = pow(sunR, 50.0) * (0.55 + 0.9 * clamp(tone, 0.0, 1.0));
  // a low sun paints a warm glitter path (gold at sunset), a high one a light one
  // (painted as opaque strokes: blending an orange sun into teal water turns grey)
  float lowSun = 1.0 - smoothstep(0.15, 0.6, L.y);
  float warm = smoothstep(0.05, 0.45, lowSun);
  vec3 sunGold = min(uSunColor * 1.08, vec3(1.0));
  vec3 pathCol = mix(uShallow * 1.18, sunGold, 0.12 + 0.88 * warm);
  // low sun: a wider tier of horizontal dashes (stripes across the sun's azimuth,
  // so perspective makes them thinner with distance), broken into segments
  vec2 sunAz = normalize(L.xz + 1e-5);
  float su2 = dot(p, sunAz);
  float sunDash = 0.5 + 0.5 * sin(su2 * 1.15 + (bandNoise.x - 0.5) * 6.0 - t * 0.7);
  // stripes thinner than ~3 px would shimmer: far away they merge into one bright band
  sunDash = mix(sunDash, 0.62, smoothstep(0.7, 2.0, fwidth(su2) * 1.15));
  float seg = vnoise(vec2(dot(p, vec2(-sunAz.y, sunAz.x)) * 0.2, su2 * 0.45));
  float pathWide = pow(sunR, 13.0) * (0.25 + 0.75 * sunDash) * (0.55 + 0.8 * seg) * (0.75 + 0.5 * clamp(tone + 0.3, 0.0, 1.0)) * warm;
  col = mix(col, uSunColor * 0.8, edge(pathWide, 0.55));
  sunPath *= mix(1.0, 0.55 + 0.7 * sunDash, warm);
  col = mix(col, pathCol, (0.8 + 0.2 * warm) * edge(sunPath, 0.45));
  vec2 gc = p * 0.5;
  vec2 gi = floor(gc);
  vec2 gr = hash22(gi + 17.0);
  vec2 gq = fract(gc) - 0.5 - (gr - 0.5) * 0.5;
  float tw = 0.5 + 0.5 * sin(t * (2.0 + 3.0 * gr.y) + gr.x * 40.0);
  // dense only right in the sun's reflection, a sprinkle elsewhere
  float glintChance = pow(sunR, 22.0) * 0.6 + pow(sunR, 80.0) * 0.35 + 0.005;
  float gpx = max(length(fwidth(gc)), 1e-5); // one pixel, in cell units
  float gsize = min((0.17 + 0.11 * gr.y) * tw, 9.0 * gpx) * step(gr.x, glintChance);
  float star = min(abs(gq.x) + abs(gq.y) * 6.0, abs(gq.y) + abs(gq.x) * 6.0);
  // stars under ~2 px would only read as dust: fade them out
  float glintFade = smoothstep(1.6, 3.2, gsize / gpx) * (1.0 - smoothstep(60.0, 140.0, dist));
  float glint = (1.0 - edge(star, gsize)) * glintFade * step(0.001, gsize);

  // ---- shorelines: lighter shallows, a wobbly surf band and incoming wave lines
  // (the baked field is clamped to ${SHORE_CLAMP}; outside the texture it is open sea)
  float sd = ${glslNum(SHORE_CLAMP)};
  if (uShoreXf.w > 0.5) {
    vec2 suv = (p - uShoreXf.xy) * uShoreXf.z;
    sd = texture2D(uShoreTex, clamp(suv, 0.0, 1.0)).r;
  }
  float surf = 0.0;
  {
    float wob = 0.55 * sin(p.x * 0.42 + t * 1.3) * cos(p.y * 0.37 - t * 1.1) + 0.3 * sin((p.x - p.y) * 0.9 + t * 2.0);
    float sdw = sd - wob;
    float shallow = 1.0 - edge(sdw * 0.6 + sd * 0.4, 8.0);
    // shallows: a brighter, still saturated version of the shallow colour
    vec3 shCol = mix(uShallow * 1.32 + uFoam * 0.1, mix(uShallow, uFoam, 0.3), 0.45);
    float outerShallow = 1.0 - edge(sd + wob * 0.4, 13.0);
    col = mix(col, mix(uShallow, shCol, 0.35), outerShallow);
    col = mix(col, shCol, shallow);
    lines *= 1.0 - outerShallow; // keep the beach clean of crest strokes
    // two wave lines rolling in towards the beach
    for (int k = 0; k < 2; k++) {
      float ph = fract(t * 0.16 + float(k) * 0.5);
      float lp = 9.5 - ph * 6.0;
      float lineW = 0.28 + 0.25 * (1.0 - ph);
      float ln = 1.0 - edge(abs(sdw - lp), lineW);
      ln *= smoothstep(0.0, 0.2, ph) * (1.0 - smoothstep(0.8, 1.0, ph));
      surf = max(surf, ln);
    }
    // surf band hugging the land, with a bubbly broken outer edge
    float bubbles = (wr.x - 0.35) * 1.6;
    surf = max(surf, 1.0 - edge(sdw + bubbles, 3.0));
  }

  float foam = max(max(lines * 0.85, caps), surf);
  col = mix(col, uFoam, clamp(foam, 0.0, 1.0));
  col = mix(col, mix(vec3(1.0), uSunColor, 0.3 + 0.35 * lowSun), glint);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #ifdef USE_FOG
  // whatever the palette's fog distance, the square edge of the sea never shows
  vec2 rel = abs(vWorld.xz - uCenter);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(${glslNum(OCEAN_EXTENT - 150)}, ${glslNum(OCEAN_EXTENT - 24)}, max(rel.x, rel.y)));
  #endif
}
`;

export function createOcean(scene) {
  const geometry = buildOceanGeometry();
  const makeShoreTex = (data, res) => {
    const tex = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.HalfFloatType);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  };
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uTime: { value: 0 },
    uAmp: { value: DEFAULT_PALETTE.waveAmp },
    uDeep: { value: new THREE.Color() },
    uShallow: { value: new THREE.Color() },
    uFoam: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
    uSkyHorizon: { value: new THREE.Color() },
    uShoreTex: { value: makeShoreTex(new Uint16Array([THREE.DataUtils.toHalfFloat(SHORE_CLAMP)]), 1) },
    uShoreXf: { value: new THREE.Vector4(0, 0, 1, 0) },
    uCenter: { value: new THREE.Vector2() },
    uCloudSh: cloudShadow.list,
    uCloudN: cloudShadow.count,
    uCloudStrength: cloudShadow.strength,
  };
  const material = new THREE.ShaderMaterial({
    name: 'CartoonOcean',
    uniforms,
    vertexShader: OCEAN_VERT,
    fragmentShader: OCEAN_FRAG,
    fog: true,
  });
  noOutline(material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ocean';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);

  let amp = DEFAULT_PALETTE.waveAmp;

  const api = {
    mesh,
    setPalette(p) {
      const P = withDefaults(p);
      amp = P.waveAmp;
      uniforms.uAmp.value = amp;
      uniforms.uDeep.value.setHex(P.waterDeep);
      uniforms.uShallow.value.setHex(P.waterShallow);
      uniforms.uFoam.value.setHex(P.waterFoam);
      uniforms.uSunColor.value.setHex(P.sunColor);
      uniforms.uSunDir.value.fromArray(P.sunDir).normalize();
      uniforms.uSkyHorizon.value.setHex(P.skyHorizon);
    },
    /**
     * circles: [{x, z, r}] shorelines (r = shoreline radius), any number; extra
     * fields are ignored, so colliders can be passed directly. Bakes a distance
     * field (a few ms), so call it once per level, not per frame.
     */
    setFoam(list) {
      const circles = (list || []).filter((c) => c && Number.isFinite(c.x) && Number.isFinite(c.z) && Number.isFinite(c.r) && c.r > 0);
      if (!circles.length) {
        uniforms.uShoreXf.value.w = 0;
        return;
      }
      const f = bakeShoreField(circles);
      const old = uniforms.uShoreTex.value;
      if (old.image.width === f.res) {
        old.image.data = f.data;
        old.needsUpdate = true;
      } else {
        old.dispose();
        uniforms.uShoreTex.value = makeShoreTex(f.data, f.res);
      }
      uniforms.uShoreXf.value.set(f.x0, f.z0, 1 / f.size, 1);
    },
    update(t, cx = 0, cz = 0) {
      uniforms.uTime.value = t;
      if (!Number.isFinite(cx) || !Number.isFinite(cz)) cx = cz = 0;
      mesh.position.set(Math.round(cx / OCEAN_SNAP) * OCEAN_SNAP, 0, Math.round(cz / OCEAN_SNAP) * OCEAN_SNAP);
      mesh.updateMatrix();
      uniforms.uCenter.value.set(mesh.position.x, mesh.position.z);
    },
    heightAt(x, z, t) {
      return waveHeight(x, z, t, amp);
    },
  };
  api.setPalette(DEFAULT_PALETTE);
  mesh.updateMatrix();
  return api;
}

// ---------------------------------------------------------------------------
// Sky: painted gradient dome, cartoon sun with halo rings, and a soft bank of
// distant cumulus along the horizon. Follows the camera.
// ---------------------------------------------------------------------------
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uFog;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uCloud;
uniform vec3 uCloudShade;
varying vec3 vDir;
${NOISE_GLSL}

float edge(float v, float th) {
  float w = max(fwidth(v), 1e-5) * 0.75;
  return smoothstep(th - w, th + w, v);
}

// Elevation of the top of a ring of distant cumulus clusters around the horizon
// (-1 where there is no cloud). Each cluster is a few round bumps, with gaps between.
float bankTop(float az, float cells, float seed, float scale) {
  float W = 6.2831853 / cells;
  float ci = floor(az / W);
  float top = -1.0;
  for (int k = -1; k <= 1; k++) {
    float c = ci + float(k);
    float cm = mod(c, cells);
    vec2 ra = hash22(vec2(cm, seed));
    vec2 rb = hash22(vec2(cm + 17.0, seed + 3.0));
    if (rb.y < 0.22) continue; // gap in the bank
    float cx = (c + 0.5 + (ra.x - 0.5) * 0.3) * W;
    float hw = W * (0.3 + 0.22 * ra.y);
    float dx = (az - cx) / hw;
    for (int b = 0; b < 4; b++) {
      float fb = float(b);
      vec2 rc = hash22(vec2(cm * 4.0 + fb, seed + 9.0));
      float inner = (b == 1 || b == 2) ? 1.0 : 0.0;
      float bx = -0.68 + fb * 0.45 + (rc.x - 0.5) * 0.18;
      float br = 0.3 + 0.16 * rc.y + 0.12 * inner;
      float dd = dx - bx;
      if (abs(dd) < br) top = max(top, (sqrt(br * br - dd * dd) * 0.8 + 0.08 + 0.22 * inner * rb.x) * hw * scale);
    }
  }
  return top;
}

void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  float az = atan(d.z, d.x);
  vec3 L = normalize(uSunDir);

  // gradient with a few painterly, slightly uneven strokes
  float g = 1.0 - pow(1.0 - clamp(e, 0.0, 1.0), 4.0);
  // (noise sampled on the horizontal unit circle so it wraps around without a seam)
  vec2 dh = normalize(d.xz + 1e-5);
  float stroke = (vnoise(dh * 1.6 + vec2(e * 7.0, 0.0)) - 0.5) * 0.10 + (vnoise(dh * 4.5 + vec2(0.0, e * 22.0)) - 0.5) * 0.04;
  g = clamp(g + stroke * (1.0 - g) * 1.4, 0.0, 1.0);
  vec3 col = mix(uHorizon, uTop, g);
  // keep the blend between warm and cool colours from going grey
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = max(mix(vec3(luma), col, 1.0 + 0.9 * g * (1.0 - g)), 0.0);

  // warm glow along the horizon on the sun side
  vec2 lh = normalize(L.xz + 1e-5);
  float sunSide = pow(max(dot(dh, lh), 0.0), 3.0);
  col = mix(col, mix(col, uSunColor, 0.55), sunSide * (1.0 - smoothstep(0.0, 0.35, e)) * 0.6);

  // ---- sun: halo rings and a solid disc
  float cosA = dot(d, L);
  float ang = acos(clamp(cosA, -1.0, 1.0));
  float glow = exp(-ang * 5.0);
  col = mix(col, uSunColor, glow * 0.35);
  col = mix(col, mix(col, uSunColor, 0.38), 1.0 - edge(ang, 0.19));
  col = mix(col, mix(col, uSunColor, 0.55), 1.0 - edge(ang, 0.115));
  vec3 core = mix(uSunColor, vec3(1.0), 0.6);
  col = mix(col, mix(uSunColor, core, 0.4), 1.0 - edge(ang, 0.068));
  col = mix(col, core, 1.0 - edge(ang, 0.058));

  // ---- distant cloud banks (two layers), drawn over the sun
  vec3 hazeCloud = mix(uCloud, uHorizon, 0.5);
  vec3 hazeShade = mix(uCloudShade, uHorizon, 0.45);
  vec3 litCloud = mix(hazeCloud, mix(uCloud, uSunColor, 0.45), sunSide * 0.7);
  float back = bankTop(az, 15.0, 3.0, 0.75);
  float inBack = 1.0 - edge(e, back);
  col = mix(col, mix(mix(hazeShade, hazeCloud, 0.5), uHorizon, 0.35), inBack);
  float front = bankTop(az + 0.21, 23.0, 11.0, 0.6);
  float inFront = 1.0 - edge(e, front);
  float lowerPart = 1.0 - edge(e, front * 0.5);
  vec3 fcol = mix(litCloud, hazeShade, lowerPart);
  float rimF = inFront * edge(e, front - 0.0035);
  fcol = mix(fcol, mix(hazeShade, uTop, 0.25), rimF * 0.55);
  col = mix(col, fcol, inFront);

  // below the horizon the fog colour takes over (meets the fogged ocean)
  col = mix(uFog, col, smoothstep(-0.015, 0.045, e));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createSky(scene) {
  const uniforms = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uFog: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
    uCloud: { value: new THREE.Color() },
    uCloudShade: { value: new THREE.Color() },
  };
  const material = new THREE.ShaderMaterial({
    name: 'CartoonSky',
    uniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  noOutline(material);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  scene.add(mesh);
  const api = {
    mesh,
    setPalette(p) {
      const P = withDefaults(p);
      uniforms.uTop.value.setHex(P.skyTop);
      uniforms.uHorizon.value.setHex(P.skyHorizon);
      uniforms.uFog.value.setHex(P.fogColor);
      uniforms.uSunColor.value.setHex(P.sunColor);
      uniforms.uSunDir.value.fromArray(P.sunDir).normalize();
      uniforms.uCloud.value.setHex(P.cloudColor);
      uniforms.uCloudShade.value.setHex(P.cloudShade);
    },
    update(camera) {
      mesh.position.copy(camera.position);
      // stay inside the far plane
      mesh.scale.setScalar((camera.far || 1000) * 0.85);
    },
  };
  api.setPalette(DEFAULT_PALETTE);
  return api;
}

// ---------------------------------------------------------------------------
// Clouds: clusters of smooth spheres with a flattened bottom, cel shaded with
// cloudColor / cloudShade and inked by the outline effect.
// ---------------------------------------------------------------------------
const CLOUD_VERT = /* glsl */ `
uniform vec3 uEllC;
uniform vec3 uEllK;
varying vec3 vN;
varying vec3 vE;
varying vec3 vLocal;
varying float vDepth;
void main() {
  vN = normalize(mat3(modelMatrix) * normal);
  vLocal = position;
  // gradient of an ellipsoid around the whole cloud (interpolated, normalised per pixel)
  vE = mat3(modelMatrix) * ((position - uEllC) * uEllK);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const CLOUD_FRAG = /* glsl */ `
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uSunDir;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFogAmount;
uniform float uOpacity;
varying vec3 vN;
varying vec3 vE;
varying vec3 vLocal;
varying float vDepth;
float edge(float v, float th) {
  float w = max(fwidth(v), 1e-4) * 0.75;
  return smoothstep(th - w, th + w, v);
}
void main() {
  // Bend each puff's normal towards the whole cloud's ellipsoid normal: light and
  // shade sweep across the cloud as one soft shape while the inked silhouette stays lumpy.
  vec3 n = normalize(normalize(vN) * 0.12 + normalize(vE) * 0.88);
  vec3 L = normalize(uSunDir);
  // two main tones (sunlit body / shaded side) and a thin soft mid band between them;
  // the terminator gets a gentle scalloped wobble like a painted cloud
  float scallop = 0.07 * sin(vLocal.x * 0.75 + vLocal.z * 0.4) + 0.04 * sin(vLocal.x * 1.7 - vLocal.y * 0.9);
  // (a strong "lit top, shaded belly" term keeps them fluffy white even when backlit)
  float l = dot(n, L) * 0.5 + n.y * 0.62 + 0.1 + scallop;
  vec3 mid = mix(uShade, uLit, 0.55);
  vec3 col = mix(uShade, mid, edge(l, -0.12));
  col = mix(col, uLit, edge(l, -0.02));
  // the flat underside is always in shade
  col = mix(uShade * 0.94, col, edge(vLocal.y, -1.6));
  float f = smoothstep(uFogNear, uFogFar, vDepth) * uFogAmount;
  gl_FragColor = vec4(mix(col, uFogColor, f), uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Cloud blueprints: [x, y, z, radius] puffs. Shapes are wide and lumpy.
const CLOUD_SHAPES = [
  [[0, 0, 0, 7], [-7.5, -1, 1, 5.5], [7.5, -1.2, -0.5, 5.8], [-2.5, 4.2, 0.5, 5.4], [3.8, 3.4, -1, 4.8], [-13, -2.2, 0, 3.8], [13, -2.4, 1, 3.6]],
  [[0, 0, 0, 6.5], [-6, 2.5, 0, 5], [6, -0.5, 1.2, 5.6], [1.5, 5, -0.5, 4.4], [-11, -1.5, 0.5, 4.2]],
  [[0, 0, 0, 8], [8.5, -1.5, 0.5, 5.5], [-8.5, -1, -0.5, 6], [-2, 5.2, 0, 5.8], [5, 4.3, 1, 4.3], [-15, -2.5, 1, 3.8], [15.5, -3, -1, 3.5], [-6.5, 3, 2, 4]],
  [[0, 0, 0, 5.4], [-5.5, -0.8, 0, 4.2], [5.5, -0.6, 0.5, 4.5], [0.5, 3.6, 0, 4]],
  [[0, 0, 0, 6], [-6.5, 1.5, 0.8, 5.2], [6.5, 0.5, -0.5, 5.4], [-1, 5, 0, 4.6], [11.5, -1.8, 0, 3.6], [-12, -1.8, 0, 3.5], [3.5, 3.8, 1.5, 3.8]],
];
const CLOUD_FLOOR = -2.4; // flat bottom (template space)

function buildCloudGeometry(shape) {
  const parts = shape.map(([x, y, z, r]) => {
    const big = r > 5;
    const g = new THREE.SphereGeometry(r, big ? 16 : 14, big ? 12 : 10);
    g.translate(x, y, z);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) < CLOUD_FLOOR) p.setY(i, CLOUD_FLOOR + (p.getY(i) - CLOUD_FLOOR) * 0.08);
    }
    g.deleteAttribute('uv');
    return g;
  });
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  // Ellipsoid around the whole cloud, used by the shader to soften the shading.
  merged.computeBoundingBox();
  const bb = merged.boundingBox;
  const c = bb.getCenter(new THREE.Vector3());
  const h = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  c.y -= h.y * 0.25;
  merged.userData.ellC = c;
  merged.userData.ellK = new THREE.Vector3(1 / (h.x * h.x), 1 / (h.y * h.y), 1 / (h.z * h.z));
  merged.computeBoundingSphere();
  return merged;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CLOUD_AREA = 500; // clouds wrap inside this square around the focus
// v wrapped into [-size/2, size/2)
const wrapCentered = (v, size) => v - size * Math.floor(v / size + 0.5);
const WIND = new THREE.Vector2(0.86, 0.5).normalize();
const WIND_SPEED = 2.2;

export function createClouds(scene) {
  const group = new THREE.Group();
  group.name = 'clouds';
  scene.add(group);
  const geometries = CLOUD_SHAPES.map(buildCloudGeometry);
  const shared = {
    uLit: { value: new THREE.Color() },
    uShade: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
    uFogColor: { value: new THREE.Color() },
    uFogNear: { value: 120 },
    uFogFar: { value: 320 },
    uFogAmount: { value: 0.55 },
  };
  // One material per cloud (same shader program) so each can fade out on its own,
  // ink outline included, when it wraps around the edge of the cloud area.
  const makeMaterial = (geo) => {
    const m = new THREE.ShaderMaterial({
      name: 'CartoonCloud',
      uniforms: { ...shared, uOpacity: { value: 1 }, uEllC: { value: geo.userData.ellC }, uEllK: { value: geo.userData.ellK } },
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      transparent: true,
      fog: false,
    });
    setOutline(m, { thickness: OUTLINE_THICKNESS * 0.85 });
    return m;
  };

  // Depth-only twin drawn just before a fading cloud, so only its front surface blends.
  const depthMat = noOutline(new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true }));

  let clouds = [];
  const focus = { x: 0, z: 0 };
  const sunDir = new THREE.Vector3(0.5, 0.8, 0.3).normalize();

  function build(count) {
    for (const c of clouds) {
      group.remove(c.mesh);
      c.mesh.material.dispose();
    }
    clouds = [];
    const rng = mulberry32(1234567);
    // spread them out: best-of-k candidates with toroidal distance
    const pts = [];
    for (let i = 0; i < count; i++) {
      let best = null;
      let bestD = -1;
      for (let k = 0; k < 24; k++) {
        const x = (rng() - 0.5) * CLOUD_AREA;
        const z = (rng() - 0.5) * CLOUD_AREA;
        let dmin = Infinity;
        for (const q of pts) {
          let dx = Math.abs(q.x - x);
          let dz = Math.abs(q.z - z);
          dx = Math.min(dx, CLOUD_AREA - dx);
          dz = Math.min(dz, CLOUD_AREA - dz);
          dmin = Math.min(dmin, Math.hypot(dx, dz));
        }
        if (dmin > bestD) {
          bestD = dmin;
          best = { x, z };
        }
      }
      pts.push(best);
    }
    pts.forEach((pt, i) => {
      const geo = geometries[i % CLOUD_SHAPES.length];
      const prepass = new THREE.Mesh(geo, depthMat); // created first: lower id sorts first
      const mesh = new THREE.Mesh(geo, makeMaterial(geo));
      mesh.add(prepass);
      const s = 1.1 + rng() * 0.9;
      const y = 45 + 45 * rng() * rng(); // mostly low, so they show from the chase cam
      mesh.rotation.y = (rng() - 0.5) * 0.7 + (rng() < 0.5 ? Math.PI : 0);
      mesh.scale.setScalar(s);
      mesh.userData.keep = true;
      group.add(mesh);
      const width = 15 * s; // shadow ellipse radii (clouds are ~2.2x wider than deep)
      clouds.push({ mesh, prepass, x: pt.x + focus.x, z: pt.z + focus.z, y, s, rx: width, rz: width * 0.45, rot: mesh.rotation.y });
    });
    place(0);
  }

  function place(dt) {
    const half = CLOUD_AREA / 2;
    const fade = 36;
    let n = 0;
    for (const c of clouds) {
      c.x += WIND.x * WIND_SPEED * dt;
      c.z += WIND.y * WIND_SPEED * dt;
      c.x = focus.x + wrapCentered(c.x - focus.x, CLOUD_AREA);
      c.z = focus.z + wrapCentered(c.z - focus.z, CLOUD_AREA);
      // fade out near the wrap border so clouds never pop
      const edgeDist = half - Math.max(Math.abs(c.x - focus.x), Math.abs(c.z - focus.z));
      let k = Math.min(1, Math.max(0, edgeDist / fade));
      k = k * k * (3 - 2 * k);
      k *= k; // spend little time half-faded
      const mat = c.mesh.material;
      mat.uniforms.uOpacity.value = k;
      mat.userData.outlineParameters.alpha = k;
      c.mesh.visible = k > 0.01;
      c.prepass.visible = k < 0.995;
      c.mesh.position.set(c.x, c.y, c.z);
      // shadow on the sea, projected along the sun
      if (n < MAX_CLOUD_SHADOWS && sunDir.y > 0.2 && k > 0.01) {
        const sx = c.x - (sunDir.x / sunDir.y) * c.y;
        const sz = c.z - (sunDir.z / sunDir.y) * c.y;
        const ca = Math.abs(Math.cos(c.rot));
        const sa = Math.abs(Math.sin(c.rot));
        const rx = (c.rx * ca + c.rz * sa) * 0.85 * (0.5 + 0.5 * k);
        const rz = (c.rx * sa + c.rz * ca) * 0.85 * (0.5 + 0.5 * k);
        cloudShadow.list.value[n++].set(sx, sz, rx, rz);
      }
    }
    cloudShadow.count.value = n;
  }

  const api = {
    group,
    setPalette(p) {
      const P = withDefaults(p);
      shared.uLit.value.setHex(P.cloudColor);
      shared.uShade.value.setHex(P.cloudShade);
      sunDir.fromArray(P.sunDir).normalize();
      shared.uSunDir.value.copy(sunDir);
      shared.uFogColor.value.setHex(P.fogColor);
      shared.uFogNear.value = P.fogNear;
      shared.uFogFar.value = P.fogFar * 1.6;
      cloudShadow.strength.value = 0.16 * Math.min(1, Math.max(0, (sunDir.y - 0.2) / 0.3));
      const count = Math.max(0, Math.round(P.cloudCount));
      if (count !== clouds.length) build(count);
      else place(0);
    },
    update(dt, cx = 0, cz = 0) {
      if (Number.isFinite(cx) && Number.isFinite(cz)) {
        focus.x = cx;
        focus.z = cz;
      }
      place(Number.isFinite(dt) ? dt : 0);
    },
  };
  api.setPalette(DEFAULT_PALETTE);
  return api;
}

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------
export function createLights(scene) {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  hemi.name = 'hemi';
  sun.name = 'sun';
  scene.add(hemi, sun);
  const api = {
    hemi,
    sun,
    setPalette(p) {
      const P = withDefaults(p);
      hemi.color.setHex(P.hemiSky);
      hemi.groundColor.setHex(P.hemiGround);
      hemi.intensity = P.hemiIntensity;
      sun.color.setHex(P.sunColor);
      sun.intensity = P.sunIntensity;
      sun.position.fromArray(P.sunDir).normalize().multiplyScalar(200);
    },
  };
  api.setPalette(DEFAULT_PALETTE);
  return api;
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
export function applyPalette(scene, p, parts = {}) {
  const P = withDefaults(p);
  if (scene.fog && scene.fog.isFog) {
    scene.fog.color.setHex(P.fogColor);
    scene.fog.near = P.fogNear;
    scene.fog.far = P.fogFar;
  } else {
    scene.fog = new THREE.Fog(P.fogColor, P.fogNear, P.fogFar);
  }
  if (scene.background && scene.background.isColor) scene.background.setHex(P.fogColor);
  else scene.background = new THREE.Color(P.fogColor);
  const { ocean, sky, clouds, lights } = parts || {};
  if (ocean) ocean.setPalette(P);
  if (sky) sky.setPalette(P);
  if (clouds) clouds.setPalette(P);
  if (lights) lights.setPalette(P);
}
