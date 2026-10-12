import * as THREE from 'three';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
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
// Renderer
// ---------------------------------------------------------------------------
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const ratio = () => Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
  renderer.setPixelRatio(ratio());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // keep cartoon colours exact
  const effect = new OutlineEffect(renderer, { defaultThickness: OUTLINE_THICKNESS, defaultColor: INK });
  return {
    renderer,
    effect,
    setSize(cssW, cssH) {
      renderer.setPixelRatio(ratio());
      renderer.setSize(Math.max(1, Math.round(cssW)), Math.max(1, Math.round(cssH)), false);
    },
    render(scene, camera) {
      effect.render(scene, camera);
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
];
const OCEAN_SNAP = 16; // coarsest spacing: recentring by multiples keeps every vertex on its lattice
const MAX_FOAM = 64;
const MAX_CLOUD_SHADOWS = 24;

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
uniform vec3 uShore[${MAX_FOAM}];
uniform int uShoreN;
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

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
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

  // ---- painted body colour: deep / mid / light bands following the swell
  vec2 bandNoise = vec2(vnoise(p * 0.045 + vec2(t * 0.02, 0.0)), vnoise(p * 0.11 - vec2(0.0, t * 0.05)));
  float tone = 0.75 * hn + 0.38 * (bandNoise.x - 0.5) + 0.18 * (bandNoise.y - 0.5);
  tone += 2.2 * (dot(n, L) - L.y * 0.98);
  vec3 midCol = mix(uDeep, uShallow, 0.42);
  vec3 col = mix(uDeep, midCol, edge(tone, -0.12));
  col = mix(col, uShallow, edge(tone, 0.42));

  // far water picks up the sky: a lighter band towards the horizon
  float graze = 1.0 - clamp(V.y * 3.2, 0.0, 1.0);
  col = mix(col, mix(uShallow, vec3(1.0), 0.15), 0.45 * edge(graze, 0.82));

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

  // ---- foam squiggles: broken white lines riding the swell (cells drift slowly)
  vec2 fp = p * 0.24 + vec2(t * 0.06, t * 0.04);
  vec2 wr = worley(fp, t * 0.6);
  float breakup = vnoise(p * 0.32 + vec2(t * 0.1, -t * 0.07));
  float lineMask = smoothstep(0.1, 0.5, hn + (vnoise(p * 0.05 + 3.1) - 0.5) * 1.1) * smoothstep(0.45, 0.62, breakup);
  float lw = 0.03 + 0.035 * lineMask;
  float aaw = fwidth(wr.y);
  float lines = 1.0 - smoothstep(lw - aaw, lw + aaw, wr.y);
  lines *= step(0.01, lineMask) * near * (1.0 - smoothstep(0.04, 0.09, aaw));

  // ---- white caps on the highest crests
  float capField = hn + (0.3 - wr.x) * 0.35 + (bandNoise.y - 0.5) * 0.35;
  float caps = edge(capField, 0.86) * (0.4 + 0.6 * near);

  // ---- sun glints: little twinkling stars where the water mirrors the sun
  vec3 R = reflect(-V, n);
  float sunR = max(dot(R, L), 0.0);
  float sunPath = pow(sunR, 18.0);
  col = mix(col, mix(col, uShallow + uSunColor * 0.25, 0.65), edge(sunPath, 0.35));
  vec2 gc = p * 0.5;
  vec2 gi = floor(gc);
  vec2 gr = hash22(gi + 17.0);
  vec2 gq = fract(gc) - 0.5 - (gr - 0.5) * 0.5;
  float tw = 0.5 + 0.5 * sin(t * (2.0 + 3.0 * gr.y) + gr.x * 40.0);
  float glintChance = pow(sunR, 10.0) * 0.9 + 0.006;
  float gsize = 0.26 * tw * step(gr.x, glintChance);
  float star = min(abs(gq.x) + abs(gq.y) * 6.0, abs(gq.y) + abs(gq.x) * 6.0);
  float glint = (1.0 - edge(star, gsize)) * near * step(0.001, gsize);

  // ---- shorelines: lighter shallows, a wobbly surf band and incoming wave lines
  float sd = 1e4;
  for (int i = 0; i < ${MAX_FOAM}; i++) {
    if (i >= uShoreN) break;
    vec3 c = uShore[i];
    sd = smin(sd, length(p - c.xy) - c.z, 4.0);
  }
  float surf = 0.0;
  if (sd < 16.0) {
    float wob = 0.55 * sin(p.x * 0.42 + t * 1.3) * cos(p.y * 0.37 - t * 1.1) + 0.3 * sin((p.x - p.y) * 0.9 + t * 2.0);
    float sdw = sd - wob;
    float shallow = 1.0 - edge(sdw * 0.6 + sd * 0.4, 8.0);
    vec3 shCol = mix(uShallow, uFoam, 0.32);
    col = mix(col, mix(uShallow, uFoam, 0.12), 1.0 - edge(sd + wob * 0.4, 13.0));
    col = mix(col, shCol, shallow);
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

  float foam = max(max(lines, caps), max(surf, glint));
  col = mix(col, uFoam, clamp(foam, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export function createOcean(scene) {
  const geometry = buildOceanGeometry();
  const shore = Array.from({ length: MAX_FOAM }, () => new THREE.Vector3(0, 0, -1));
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uTime: { value: 0 },
    uAmp: { value: DEFAULT_PALETTE.waveAmp },
    uDeep: { value: new THREE.Color() },
    uShallow: { value: new THREE.Color() },
    uFoam: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
    uShore: { value: shore },
    uShoreN: { value: 0 },
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
  let circles = [];
  let lastPick = null;

  // With more than MAX_FOAM circles, keep the ones nearest the focus.
  function pickShore(cx, cz) {
    let list = circles;
    if (circles.length > MAX_FOAM) {
      list = circles
        .map((c) => ({ c, d: Math.hypot(c.x - cx, c.z - cz) - c.r }))
        .sort((a, b) => a.d - b.d)
        .slice(0, MAX_FOAM)
        .map((o) => o.c);
    }
    for (let i = 0; i < MAX_FOAM; i++) {
      const c = list[i];
      if (c) shore[i].set(c.x, c.z, c.r);
      else shore[i].set(0, 0, -1);
    }
    uniforms.uShoreN.value = Math.min(list.length, MAX_FOAM);
    lastPick = { x: cx, z: cz };
  }

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
    },
    /** circles: [{x, z, r}] shorelines (r = shoreline radius); extra fields are ignored. */
    setFoam(list) {
      circles = (list || []).filter((c) => c && Number.isFinite(c.x) && Number.isFinite(c.z) && c.r > 0);
      pickShore(lastPick ? lastPick.x : 0, lastPick ? lastPick.z : 0);
    },
    update(t, cx = 0, cz = 0) {
      uniforms.uTime.value = t;
      mesh.position.set(Math.round(cx / OCEAN_SNAP) * OCEAN_SNAP, 0, Math.round(cz / OCEAN_SNAP) * OCEAN_SNAP);
      mesh.updateMatrix();
      if (circles.length > MAX_FOAM && (!lastPick || Math.hypot(cx - lastPick.x, cz - lastPick.z) > 8)) pickShore(cx, cz);
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

// height profile (in elevation) of a row of puffy cloud tops around the horizon
float bankTop(float az, float cells, float seed, float lift, float puff) {
  float W = 6.2831853 / cells;
  float x = az / W;
  float ci = floor(x);
  float top = -1.0;
  for (int k = -2; k <= 2; k++) {
    float c = ci + float(k);
    vec2 r = hash22(vec2(mod(c, cells), seed));
    vec2 r2 = hash22(vec2(mod(c, cells) + 31.0, seed + 7.0));
    float cx = (c + 0.5 + (r.x - 0.5) * 0.7) * W;
    float rad = W * (0.5 + 0.8 * r.y);
    float dx = az - cx;
    float hgt = sqrt(max(rad * rad - dx * dx, 0.0)) * puff * (0.6 + 0.8 * r2.x) + lift * (0.4 + 0.9 * r2.y);
    if (abs(dx) < rad) top = max(top, hgt);
  }
  return top;
}

void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  float az = atan(d.z, d.x);
  vec3 L = normalize(uSunDir);

  // gradient with a few painterly, slightly uneven strokes
  float g = pow(clamp(e, 0.0, 1.0), 0.55);
  float stroke = (vnoise(vec2(az * 2.2, e * 7.0)) - 0.5) * 0.10 + (vnoise(vec2(az * 6.0, e * 22.0)) - 0.5) * 0.04;
  g = clamp(g + stroke * (1.0 - g) * 1.4, 0.0, 1.0);
  vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.95, g));

  // warm glow along the horizon on the sun side
  vec2 dh = normalize(d.xz + 1e-5);
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
  float back = bankTop(az, 34.0, 3.0, 0.022, 0.32);
  float front = bankTop(az + 0.37, 52.0, 11.0, 0.008, 0.3);
  vec3 hazeCloud = mix(uCloud, uHorizon, 0.45);
  vec3 hazeShade = mix(uCloudShade, uHorizon, 0.4);
  vec3 lit = mix(hazeCloud, mix(uCloud, uSunColor, 0.4), sunSide * 0.6);
  float inBack = 1.0 - edge(e, back);
  float rimB = (1.0 - edge(e, back)) * edge(e, back - 0.006);
  col = mix(col, mix(hazeShade, hazeCloud, 0.55), inBack * 0.85);
  float inFront = 1.0 - edge(e, front);
  float shadeLine = 1.0 - edge(e, front * 0.45);
  vec3 fcol = mix(lit, hazeShade, shadeLine);
  col = mix(col, fcol, inFront);
  col = mix(col, mix(hazeShade, uTop, 0.35), rimB * 0.5);

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
varying vec3 vN;
varying float vLocalY;
varying float vDepth;
void main() {
  vec3 nv = normalize(normalMatrix * normal);
  vN = normalize((vec4(nv, 0.0) * viewMatrix).xyz);
  vLocalY = position.y;
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
varying vec3 vN;
varying float vLocalY;
varying float vDepth;
float edge(float v, float th) {
  float w = max(fwidth(v), 1e-4) * 0.75;
  return smoothstep(th - w, th + w, v);
}
void main() {
  vec3 n = normalize(vN);
  vec3 L = normalize(uSunDir);
  float l = dot(n, L) * 0.75 + n.y * 0.35;
  vec3 mid = mix(uShade, uLit, 0.55);
  vec3 col = mix(uShade, mid, edge(l, -0.12));
  col = mix(col, uLit, edge(l, 0.22));
  // the underside is always in shade
  col = mix(uShade * 0.93, col, edge(vLocalY, -1.3));
  float f = smoothstep(uFogNear, uFogFar, vDepth) * uFogAmount;
  gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
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
const WIND = new THREE.Vector2(0.86, 0.5).normalize();
const WIND_SPEED = 2.2;

export function createClouds(scene) {
  const group = new THREE.Group();
  group.name = 'clouds';
  scene.add(group);
  const geometries = CLOUD_SHAPES.map(buildCloudGeometry);
  const uniforms = {
    uLit: { value: new THREE.Color() },
    uShade: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
    uFogColor: { value: new THREE.Color() },
    uFogNear: { value: 120 },
    uFogFar: { value: 320 },
    uFogAmount: { value: 0.55 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'CartoonCloud',
    uniforms,
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    fog: false,
  });
  setOutline(material, { thickness: OUTLINE_THICKNESS * 0.85 });

  let clouds = [];
  let focus = { x: 0, z: 0 };
  const sunDir = new THREE.Vector3(0.5, 0.8, 0.3).normalize();

  function build(count) {
    for (const c of clouds) group.remove(c.mesh);
    clouds = [];
    const rng = mulberry32(1234567);
    const half = CLOUD_AREA / 2;
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
      const shape = i % CLOUD_SHAPES.length;
      const mesh = new THREE.Mesh(geometries[shape], material);
      const s = 1.1 + rng() * 0.9;
      const y = 45 + rng() * 45;
      mesh.rotation.y = (rng() - 0.5) * 0.7 + (rng() < 0.5 ? Math.PI : 0);
      mesh.userData.keep = true;
      group.add(mesh);
      // shadow ellipse radii in world units (clouds are ~2.4x wider than deep)
      const width = 15 * s;
      clouds.push({ mesh, x: pt.x + focus.x, z: pt.z + focus.z, y, s, rx: width, rz: width * 0.45, rot: mesh.rotation.y });
      void half;
    });
    place(0);
  }

  function place(dt) {
    const half = CLOUD_AREA / 2;
    const fade = 40;
    let n = 0;
    for (const c of clouds) {
      c.x += WIND.x * WIND_SPEED * dt;
      c.z += WIND.y * WIND_SPEED * dt;
      while (c.x - focus.x > half) c.x -= CLOUD_AREA;
      while (c.x - focus.x < -half) c.x += CLOUD_AREA;
      while (c.z - focus.z > half) c.z -= CLOUD_AREA;
      while (c.z - focus.z < -half) c.z += CLOUD_AREA;
      // shrink away near the wrap border so clouds never pop
      const edgeDist = half - Math.max(Math.abs(c.x - focus.x), Math.abs(c.z - focus.z));
      const k = Math.min(1, Math.max(0, edgeDist / fade));
      const sc = c.s * (k * k * (3 - 2 * k));
      c.mesh.visible = sc > 0.02;
      c.mesh.scale.setScalar(Math.max(sc, 0.001));
      c.mesh.position.set(c.x, c.y, c.z);
      // shadow on the sea, projected along the sun
      if (n < MAX_CLOUD_SHADOWS && sunDir.y > 0.2 && sc > 0.02) {
        const sx = c.x - (sunDir.x / sunDir.y) * c.y;
        const sz = c.z - (sunDir.z / sunDir.y) * c.y;
        // ellipse aligned to the cloud's rotation (approximate with axis radii)
        const ca = Math.abs(Math.cos(c.rot));
        const sa = Math.abs(Math.sin(c.rot));
        const rx = (c.rx * ca + c.rz * sa) * (sc / c.s) * 0.85;
        const rz = (c.rx * sa + c.rz * ca) * (sc / c.s) * 0.85;
        cloudShadow.list.value[n++].set(sx, sz, rx, rz);
      }
    }
    cloudShadow.count.value = n;
  }

  const api = {
    group,
    setPalette(p) {
      const P = withDefaults(p);
      uniforms.uLit.value.setHex(P.cloudColor);
      uniforms.uShade.value.setHex(P.cloudShade);
      sunDir.fromArray(P.sunDir).normalize();
      uniforms.uSunDir.value.copy(sunDir);
      uniforms.uFogColor.value.setHex(P.fogColor);
      uniforms.uFogNear.value = P.fogNear;
      uniforms.uFogFar.value = P.fogFar * 1.6;
      cloudShadow.strength.value = 0.16 * Math.min(1, Math.max(0, (sunDir.y - 0.2) / 0.3));
      const count = Math.max(0, Math.round(P.cloudCount));
      if (count !== clouds.length) build(count);
      else place(0);
    },
    update(dt, cx = 0, cz = 0) {
      focus.x = cx;
      focus.z = cz;
      place(dt || 0);
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
