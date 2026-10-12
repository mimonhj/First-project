import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, setOutline, noOutline, mergeStatic, gradientMap, INK } from '../style.js';
import { waveHeight } from '../scenery.js';

// Level 3, "The Volcano": open sea at dusk, dominated by a huge smoking volcano.
//
// Map (north = -z, east = +x; the arena is the disc of radius WORLD_R around 0,0):
// - the volcano island sits north-east of the centre (VX, VZ), shoreline radius ~30, crater rim
//   at y = TOP. Three lava rivers spill through notches in the rim and run down the arena-facing
//   flanks into the sea, where they hiss into steam. A thick plume of ash rises from the crater
//   and leans away on the wind into a big ash cloud; embers drift everywhere.
// - the rest of the arena is open water, broken up by black basalt sea stacks, three smoking
//   sea vents and a burnt shipwreck stranded on a rocky shoal.
// - a ring of tall basalt stacks and sea arches stands just outside the arena edge, with hazy
//   islands (one with its own small volcano) far beyond.
//
// The volcano island is one vertex-coloured, analytically defined height field; `heightAt`
// below is the same function, so the lava ribbons, rocks and trees sit exactly on it.

export const meta = {
  name: 'The Volcano',
  subtitle: 'Fire, ash and molten seas. Ember Corsairs guard the lair of the Molten Maw.',
};

export const palette = {
  skyTop: 0x2c1850,
  skyHorizon: 0xff8a48,
  sunColor: 0xffa865,
  sunDir: [-0.62, 0.36, 0.7], // low sun in the south-west: lights the arena-facing flanks
  sunIntensity: 2.3,
  hemiSky: 0xffa47c,
  hemiGround: 0x2a1c4a,
  hemiIntensity: 1.35,
  fogColor: 0xc8644e,
  fogNear: 120,
  fogFar: 430,
  waterDeep: 0x0a3442,
  waterShallow: 0x1a7078,
  waterFoam: 0xffe2cc,
  waveAmp: 1.4,
  cloudColor: 0xff9e6e,
  cloudShade: 0x56306e,
  cloudCount: 12,
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
const WORLD_R = 140;
const DEG = Math.PI / 180;
const VX = 48; // volcano island centre
const VZ = -42;
const SHORE_R = 30; // mean shoreline radius
const TOP = 46; // crater rim height
const U_RIM = 0.24; // rim radius as a fraction of the shoreline radius
const U_FLOOR = 0.15;
const FLOOR_Y = TOP - 6.5;
const LAKE_Y = TOP - 2.4;
const PEXP = 1.42; // flank profile exponent (>1 = concave, classic stratovolcano)
const RIDGE = 1.7; // radial ridges and gullies on the flanks
const NOTCH = 2.9; // rim notches where the lava spills over
const LIP = 0.035;
const LIP_NORM = Math.sqrt(1 + LIP * LIP) - LIP;
const WIND = new THREE.Vector3(-1, 0, -0.38).normalize(); // the plume leans west-north-west

const PLAYER_START = { x: -20, z: 90, h: Math.atan2(20, -90) }; // facing the arena centre

// lava rivers: angle (polar about the island centre, x = cos, z = sin), meander, half width
const RIVERS = [
  { th: 98 * DEG, m: 0.1, f: 1.3, w: 1.5 },
  { th: 142 * DEG, m: -0.12, f: 0.4, w: 1.75 },
  { th: 190 * DEG, m: 0.1, f: 2.2, w: 1.45 },
];
const U0_RIVER = U_RIM - 0.045;
const U1_RIVER = 1.14;
const NRS = 96;

// a small parasitic cone with a fumarole on the west flank
const CONE_TH = 166 * DEG;
const CONE_U = 0.6;

// inner obstacles (basalt stacks, vents, wreck): kept clear of the volcano and of each other
const STACKS = [
  { x: -28, z: 12, R: 5, H: 15 },
  { x: -76, z: -30, R: 5.5, H: 12 },
  { x: -32, z: -80, R: 4.5, H: 10 },
  { x: 30, z: 45, R: 4, H: 8.5 },
  { x: 96, z: 34, R: 5, H: 11 },
  { x: -100, z: 46, R: 4.5, H: 9 },
  { x: 6, z: -106, R: 4, H: 9.5 },
  { x: 100, z: -62, R: 4, H: 8 },
];
const VENTS = [
  { x: 0, z: -26 },
  { x: -56, z: 2 },
  { x: 62, z: 40 },
];
const WRECK = { x: -50, z: 32, ry: Math.PI - 0.26 }; // port side faces the arena

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Volcano height field
// ---------------------------------------------------------------------------
function shoreR(th) {
  return SHORE_R + 2.0 * Math.sin(3 * th + 0.8) + 1.4 * Math.sin(5 * th + 2.1) + 0.8 * Math.sin(9 * th + 0.3);
}
function riverTheta(rv, u) {
  return rv.th + rv.m * Math.sin(u * 7 + rv.f) * Math.max(0, u - U_RIM) * 2.2;
}
function riverHalfW(rv, u) {
  return rv.w * (0.75 + 0.55 * clamp01((u - U_RIM) / 0.7)) + 2.4 * smoothstep(0.9, 1.12, u);
}
const polar = (u, th) => {
  const r = u * shoreR(th);
  return [VX + Math.cos(th) * r, VZ + Math.sin(th) * r];
};
const RIVER_LINES = RIVERS.map((rv) => {
  const pts = [];
  for (let i = 0; i <= NRS; i++) {
    const u = lerp(U0_RIVER, U1_RIVER, i / NRS);
    const [x, z] = polar(u, riverTheta(rv, u));
    pts.push({ x, z, u, hw: riverHalfW(rv, u) });
  }
  return pts;
});
const CONE = (() => {
  const [x, z] = polar(CONE_U, CONE_TH);
  return { x, z, h: 5.5, r: 4.6, pit: 2.2, pr: 1.3 };
})();

/** 0..1 weight of how close (x, z) is to a lava river (1 on its centre line), and the depth factor. */
function riverField(x, z) {
  let best = 0;
  let depth = 0;
  for (const line of RIVER_LINES) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i];
      const b = line[i + 1];
      if (Math.abs(x - a.x) > 9 || Math.abs(z - a.z) > 9) continue;
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const t = clamp01(((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz || 1));
      const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
      const hw = a.hw + (b.hw - a.hw) * t;
      const w = Math.exp(-((d / (hw * 1.25)) ** 2));
      if (w > best) {
        best = w;
        depth = 1 - 0.65 * smoothstep(0.9, 1.06, a.u);
      }
    }
  }
  return { w: best, carve: 0.95 * best * depth };
}

function baseH(u, th) {
  let h;
  if (u <= U_FLOOR) h = FLOOR_Y + 0.8 * (u / U_FLOOR) ** 2;
  else if (u <= U_RIM) {
    const k = (u - U_FLOOR) / (U_RIM - U_FLOOR);
    h = FLOOR_Y + 0.8 + (TOP - FLOOR_Y - 0.8) * Math.sin((k * Math.PI) / 2);
  } else {
    // soft-abs rounds the rim into a lip instead of a knife edge
    const k = Math.min(1, (u - U_RIM) / (1 - U_RIM));
    const kk = (Math.sqrt(k * k + LIP * LIP) - LIP) / LIP_NORM;
    h = TOP * (1 - kk) ** PEXP;
  }
  const ra = RIDGE * Math.sin(Math.PI * clamp01((u - U_RIM - 0.02) / (0.96 - U_RIM - 0.02)));
  h += ra * (0.55 * Math.sin(7 * th + 1.3) + 0.3 * Math.sin(12 * th + 0.4) + 0.15 * Math.sin(19 * th + 2));
  let notch = 0;
  for (const rv of RIVERS) notch = Math.max(notch, Math.exp(-((angDiff(th, rv.th) / 0.2) ** 2)));
  h -= NOTCH * notch * Math.exp(-(((u - U_RIM) / 0.07) ** 2));
  h -= 4.6 * smoothstep(0.97, 1.3, u);
  return h;
}

/** Height of the volcano island's ground at (x, z) (negative under the sea). */
function heightAt(x, z) {
  const dx = x - VX;
  const dz = z - VZ;
  const th = Math.atan2(dz, dx);
  const u = Math.hypot(dx, dz) / shoreR(th);
  let h = baseH(u, th);
  const cd2 = (x - CONE.x) ** 2 + (z - CONE.z) ** 2;
  h += CONE.h * Math.exp(-cd2 / (CONE.r * CONE.r)) - CONE.pit * Math.exp(-cd2 / (CONE.pr * CONE.pr));
  if (u < 1.3) h -= riverField(x, z).carve;
  return h;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
/** A lumpy rock: smooth-normal sphere pushed around by a few sines, flattish bottom. */
function lumpGeo(seed, amp = 0.22, ws = 12, hs = 9) {
  let g = new THREE.SphereGeometry(1, ws, hs);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const r = mulberry32(seed);
  const k = [r() * 6, r() * 6, r() * 6, r() * 6];
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const n = 1 + amp * (0.6 * Math.sin(x * 2.1 + k[0]) * Math.sin(y * 1.7 + k[1]) + 0.4 * Math.sin(z * 3.3 + k[2] + x * 1.3));
    if (y < -0.35) y = -0.35 + (y + 0.35) * 0.45;
    p.setXYZ(i, x * n, y * n, z * n);
  }
  g.computeVertexNormals();
  return g;
}

// LatheGeometry faces point outwards only when the profile runs bottom to top.
const upward = (pts) => (pts[0][1] > pts[pts.length - 1][1] ? [...pts].reverse() : pts);

/** Hexagonal basalt column with a chamfered top (a 6-sided lathe keeps the outline whole). */
function columnGeo(r, y0, y1, flare = 1.1) {
  const h = y1;
  return lathe(
    [
      [r * flare, y0],
      [r * 1.02, lerp(y0, h, 0.55)],
      [r, h - r * 0.3],
      [r * 0.9, h - r * 0.08],
      [r * 0.6, h],
      [0, h],
    ],
    6,
  );
}

function lathe(profile, seg = 16) {
  return new THREE.LatheGeometry(upward(profile).map(([a, b]) => new THREE.Vector2(a, b)), seg);
}

/** A lathe made irregular: radius scaled by a few sines of the angle (for craggy cones). */
function wonkyLathe(profile, seg, wobble) {
  let g = lathe(profile, seg);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const k = wobble(Math.atan2(z, x), p.getY(i));
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function mesh(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

const linear = (hex) => new THREE.Color(hex); // THREE.Color stores linear values

// ---------------------------------------------------------------------------
// Shaders (all noOutline; they carry a normal attribute so OutlineEffect skips them
// in its outline pass instead of drawing them a second time)
// ---------------------------------------------------------------------------
const LAVA_VERT = /* glsl */ `
#include <fog_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const LAVA_FRAG = /* glsl */ `
uniform float uTime;
uniform float uPulse;
uniform vec3 uHot;
uniform vec3 uMid;
uniform vec3 uDeep;
uniform vec3 uCrust;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  float a = abs(vUv.x - 0.5) * 2.0;      // 0 on the centre line, 1 at the banks
  float y = vUv.y;                        // world units along the flow
  float t = uTime;
  float w1 = sin(y * 0.5 - t * 2.2 + sin(vUv.x * 7.0 + y * 0.21) * 1.6);
  float w2 = sin(y * 1.25 - t * 3.4 + vUv.x * 5.0);
  float heat = 1.0 - a + 0.2 * w1 + 0.1 * w2 + 0.12 * (uPulse - 1.0) * 4.0;
  vec3 c = uDeep;
  c = mix(c, uMid, step(0.3, heat));
  c = mix(c, uHot, step(0.7, heat));
  // drifting crust plates
  float plates = sin(y * 0.8 - t * 2.2 + 3.0 * sin(vUv.x * 3.1 + y * 0.13)) * sin(vUv.x * 8.0 + y * 0.6 - t * 1.1);
  c = mix(c, uCrust, step(0.78, plates) * step(0.3, a));
  // inky banks
  c = mix(c, uCrust * 0.6, step(0.88, a + 0.05 * w2));
  c *= 0.92 + 0.08 * uPulse;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const GLOW_VERT = /* glsl */ `
attribute vec4 aGlow;   // half size, intensity, phase, pull towards the camera
attribute vec3 aColor;
uniform float uTime;
varying vec2 vC;
varying vec3 vCol;
varying float vI;
varying float vFogD;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  mv.xyz += normalize(-mv.xyz) * aGlow.w;
  vC = uv * 2.0 - 1.0;
  mv.xy += vC * aGlow.x;
  vCol = aColor;
  vI = aGlow.y * (0.84 + 0.16 * sin(uTime * 2.3 + aGlow.z) * sin(uTime * 3.7 + aGlow.z * 1.7));
  vFogD = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const GLOW_FRAG = /* glsl */ `
uniform float fogNear;
uniform float fogFar;
varying vec2 vC;
varying vec3 vCol;
varying float vI;
varying float vFogD;
void main() {
  float d = length(vC);
  float a = (1.0 - smoothstep(0.0, 1.0, d));
  a = a * a * vI;
  a *= 1.0 - smoothstep(fogNear, fogFar * 1.3, vFogD);
  a *= smoothstep(2.0, 9.0, vFogD); // no orange haze filling the screen when the camera skims a vent
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol, a);
  #include <colorspace_fragment>
}
`;

const EMBER_VERT = /* glsl */ `
attribute vec4 aP;   // phase, speed (1/life), half size, rise
attribute vec3 aD;   // drift over one life
uniform float uTime;
varying vec2 vC;
varying float vA;
varying float vHot;
varying float vFogD;
void main() {
  float life = fract(aP.x + uTime * aP.y);
  vec3 p = position + aD * life + vec3(0.0, aP.w * life, 0.0);
  p.x += sin(uTime * 1.3 + aP.x * 40.0) * 0.9 * life;
  p.z += cos(uTime * 1.1 + aP.x * 23.0) * 0.9 * life;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vC = uv * 2.0 - 1.0;
  // embers pop in and out (and twinkle) by size, not by alpha, so they stay crisp opaque dots;
  // they also shrink away right in front of the camera instead of blowing up into blobs
  float grow = smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.65, 1.0, life));
  grow *= smoothstep(5.0, 14.0, -mv.z) * (0.82 + 0.18 * sin(uTime * 9.0 + aP.x * 50.0));
  mv.xy += vC * aP.z * (1.0 - life * 0.55) * grow;
  vA = step(0.02, grow);
  vHot = 1.0 - life;
  vFogD = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const EMBER_FRAG = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uHalo;
uniform vec3 uCool;
uniform float fogNear;
uniform float fogFar;
varying vec2 vC;
varying float vA;
varying float vHot;
varying float vFogD;
void main() {
  float d = length(vC);
  float core = 1.0 - smoothstep(0.4, 0.55, d);   // a crisp cartoon dot, no soft halo
  float hot = 1.0 - smoothstep(0.0, 0.3, d);
  vec3 col = mix(mix(uCool, uHalo, smoothstep(0.0, 0.5, vHot)), uCore, hot * smoothstep(0.2, 0.7, vHot));
  float a = core * vA;
  a *= 1.0 - smoothstep(fogNear, fogFar * 1.2, vFogD);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;

function fogUniforms() {
  return THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
}

// ---------------------------------------------------------------------------
// build(scene, { rng }) -> {
//   worldRadius, colliders [{x,z,r,h}], playerStart {x,z,h}, enemySpawns [{x,z}] (12, spread-first),
//   reefs: [], volcano: { x, z, craterY, r } (crater centre, rim height and rim radius, for lava bombs),
//   heightAt(x, z) (ground height of the volcano island, extra), update(t, dt), dispose() }
// ---------------------------------------------------------------------------
export function build(scene, ctx = {}) {
  const rng = ctx?.rng || mulberry32(3);
  const root = new THREE.Group();
  root.name = 'env-volcano';
  scene.add(root);
  const stat = new THREE.Group(); // static scenery, merged per material at the end
  stat.name = 'volcano-static';
  root.add(stat);

  const ownMaterials = [];
  const own = (m) => {
    ownMaterials.push(m);
    return m;
  };
  const colliders = [];
  const glows = []; // {x,y,z,size,intensity,color,pull}
  const puffs = []; // smoke / steam instances
  const emberSets = [];

  // Faceted toon: lit per face (flatShading), but the geometry keeps smooth normals, so the
  // OutlineEffect hull stays unbroken. Makes hexagonal basalt read as crisp prisms, not logs.
  // A 4-tone, higher-contrast ramp than the shared one, so every visible face of a hexagonal
  // column gets its own tone even when the sun is behind the camera.
  const rockRamp = new THREE.DataTexture(new Uint8Array([46, 46, 46, 255, 120, 120, 120, 255, 190, 190, 190, 255, 255, 255, 255, 255]), 4, 1);
  rockRamp.minFilter = rockRamp.magFilter = THREE.NearestFilter;
  rockRamp.generateMipmaps = false;
  rockRamp.needsUpdate = true;
  const faceted = (color) => {
    const m = own(new THREE.MeshToonMaterial({ color, gradientMap: rockRamp }));
    m.flatShading = true; // not a constructor option of MeshToonMaterial, but its shader supports it
    return setOutline(m, true);
  };
  // The dusk light is strongly orange, so "black" rock needs a cool, blue-violet albedo to
  // render as dark slate-violet rather than as brown wood.
  const M = {
    basalt: faceted(0x3c4ca8),
    basalt2: faceted(0x4650a2),
    basaltCap: faceted(0x7a70c4), // column tops catch the warm sunset light
    boulder: toon(0x2c2f66),
    slopeRock: toon(0x40304a),
    rimRock: toon(0x2a2444),
    char: toon(0x1e1820),
    hull: toon(0x3c2a2c),
    deck: toon(0x54403e),
    wale: toon(0x8e2c22),
    hole: toon(0x140e12),
    sail: toon(0x8a7c7c),
    flag: toon(0x1d1720),
    wood: toon(0x8a5a36),
    bush: toon(0x557c30),
    bushDark: toon(0x3e6128),
    palmTrunk: toon(0x8a5e3a),
    palmLeaf: toon(0x5a9a34),
    farIsle: toon(0x4e3a66),
    farIsle2: toon(0x5a4270),
    farSmoke: toon(0x9a8098, { outline: false }),
    ventRock: toon(0x36346a),
  };
  // glowing bits get their own materials so update() can pulse them
  const ventGlow = own(
    new THREE.MeshToonMaterial({ color: 0xff8a2a, emissive: 0xff5a10, emissiveIntensity: 1, gradientMap: gradientMap(3) }),
  );
  setOutline(ventGlow, true);
  const crackGlow = own(new THREE.MeshBasicMaterial({ color: 0xff7a24 }));
  noOutline(crackGlow);

  // =========================================================================
  // 1. The volcano island (one height-field mesh, painted in crisp cel bands)
  // =========================================================================
  // The colour bands are not baked into vertex colours (those blur over a ring of vertices and
  // look airbrushed); instead each vertex carries the smooth fields the bands are cut from
  // (wobbly radius, far-side sector, distance to the lava, ash-streak wave), and the fragment
  // shader thresholds them, so every boundary is a crisp, painted-looking line at any distance.
  const BANDS = {
    crater: 0xff7a2e,
    craterWall: 0xc8441f,
    scorch: 0x24244e,
    ash: 0x3c3a76,
    rust: 0x6a4062,
    tan: 0x7c5254,
    green: 0x4a7a2c,
    sand: 0x2c2c54,
    under: 0x2a3442,
    crust: 0x2a1b22,
    hot: 0xc4451c,
  };
  const P = Object.fromEntries(Object.entries(BANDS).map(([k, v]) => [k, linear(v)]));
  const glslVec = (c) => `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`;
  const terrainMat = own(new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap(3) }));
  setOutline(terrainMat, true);
  terrainMat.customProgramCacheKey = () => 'volcano-terrain-bands';
  terrainMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec4 aPaint;\nattribute vec3 aPaint2;\nvarying vec4 vPaint;\nvarying vec3 vPaint2;\nvarying float vWY;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvPaint = aPaint;\nvPaint2 = aPaint2;\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec4 vPaint;   // wobbly radius u, far-side sector (>0 inside), lava proximity, ash-streak wave
varying vec3 vPaint2;  // crater weight, overhang shade, plain u
varying float vWY;     // world height
float aastep(float e, float x) { float w = max(fwidth(x) * 0.7, 1e-5); return smoothstep(e - w, e + w, x); }`,
      )
      .replace(
        '#include <color_fragment>',
        `{
  vec3 c = ${glslVec(P.scorch)};
  c = mix(c, ${glslVec(P.ash)}, aastep(0.36, vPaint.x));
  c = mix(c, ${glslVec(P.rust)}, aastep(0.60, vPaint.x));
  c = mix(c, ${glslVec(P.tan)}, aastep(0.84, vPaint.x));
  c = mix(c, ${glslVec(P.green)}, aastep(0.0, vPaint.y) * aastep(0.71, vPaint.x) * (1.0 - aastep(0.96, vPaint.x)));
  c *= 1.0 - 0.18 * aastep(0.66, vPaint.w) * (1.0 - aastep(0.6, vPaint.x));
  c = mix(c, vColor, vPaint2.x);
  c = mix(c, ${glslVec(P.sand)}, aastep(0.9, vPaint2.z) * (1.0 - aastep(1.0, vWY)));
  c = mix(c, ${glslVec(P.under)}, 1.0 - aastep(-0.5, vWY));
  c = mix(c, ${glslVec(P.crust)}, aastep(0.26, vPaint.z));
  c = mix(c, ${glslVec(P.hot)}, aastep(0.62, vPaint.z));
  diffuseColor.rgb *= c * vPaint2.y;
}`,
      );
  };
  {
    const rings = [];
    for (let u = 0.02; u < 0.159; u += 0.02) rings.push(u);
    for (let u = 0.16; u < 0.319; u += 0.008) rings.push(u);
    for (let u = 0.32; u < 0.899; u += 0.02) rings.push(u);
    for (let u = 0.9; u < 1.37; u += 0.025) rings.push(u);
    const NA = 132;
    const nV = 1 + rings.length * NA;
    const pos = new Float32Array(nV * 3);
    const uth = new Float32Array(nV * 2);
    pos.set([VX, heightAt(VX + 0.001, VZ), VZ], 0);
    uth.set([0, 0], 0);
    for (let j = 0; j < rings.length; j++) {
      for (let i = 0; i < NA; i++) {
        const th = (i / NA) * Math.PI * 2;
        const [x, z] = polar(rings[j], th);
        const k = 1 + j * NA + i;
        pos[k * 3] = x;
        pos[k * 3 + 1] = heightAt(x, z);
        pos[k * 3 + 2] = z;
        uth[k * 2] = rings[j];
        uth[k * 2 + 1] = th;
      }
    }
    const idx = [];
    for (let i = 0; i < NA; i++) idx.push(0, 1 + ((i + 1) % NA), 1 + i);
    for (let j = 0; j < rings.length - 1; j++) {
      for (let i = 0; i < NA; i++) {
        const a0 = 1 + j * NA + i;
        const a1 = 1 + j * NA + ((i + 1) % NA);
        const b0 = a0 + NA;
        const b1 = a1 + NA;
        idx.push(a0, b1, b0, a0, a1, b1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;
    const col = new Float32Array(nV * 3); // crater interior colours (scorch outside it)
    const paint = new Float32Array(nV * 4);
    const paint2 = new Float32Array(nV * 3);
    const c = new THREE.Color();
    for (let k = 0; k < nV; k++) {
      const u = uth[k * 2];
      const th = uth[k * 2 + 1];
      const x = pos[k * 3];
      const z = pos[k * 3 + 2];
      const inCrater = u < U_RIM;
      // wobbly band boundaries, like hand-painted background art
      paint[k * 4] = u + 0.03 * Math.sin(5 * th + 2.0 + u * 9) + 0.015 * Math.sin(13 * th);
      // the far (north) side keeps a little jungle: positive inside a wavy ~140 degree sector
      paint[k * 4 + 1] = 69.5 * DEG - (Math.abs(angDiff(th, 300 * DEG)) - 0.25 * Math.sin(th * 6));
      // dark crusted levees along the lava, red-hot right next to it
      paint[k * 4 + 2] = u > U_RIM - 0.03 && u < 1.2 ? riverField(x, z).w : 0;
      // darker ash streaks on the steep upper slopes
      paint[k * 4 + 3] = Math.sin(th * 23 + Math.sin(th * 5) * 3);
      if (inCrater) {
        c.copy(P.crater).lerp(P.craterWall, smoothstep(U_FLOOR, U_FLOOR + 0.03, u)).lerp(P.scorch, smoothstep(U_FLOOR + 0.03, U_RIM, u));
      } else c.copy(P.scorch);
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
      paint2[k * 3] = inCrater ? 1 : 0;
      // a touch of shading on overhangs keeps the cone readable
      paint2[k * 3 + 1] = inCrater ? 1 : 1 - 0.1 * (1 - smoothstep(0.3, 0.4, nrm.getY(k)));
      paint2[k * 3 + 2] = u;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aPaint', new THREE.BufferAttribute(paint, 4));
    geo.setAttribute('aPaint2', new THREE.BufferAttribute(paint2, 3));
    const terrain = new THREE.Mesh(geo, terrainMat);
    terrain.name = 'volcano-island';
    terrain.userData.keep = true;
    root.add(terrain);
  }

  // colliders hugging the shoreline: one big core circle plus a ring of smaller ones
  {
    let minS = Infinity;
    for (let i = 0; i < 180; i++) minS = Math.min(minS, shoreR((i / 180) * Math.PI * 2));
    colliders.push({ x: VX, z: VZ, r: +(minS * 0.99 - 3.5).toFixed(2), h: TOP });
    const K = 22;
    const rr = 6.5;
    for (let k = 0; k < K; k++) {
      const th = (k / K) * Math.PI * 2;
      const s = shoreR(th) * 0.995;
      const cx = VX + Math.cos(th) * (s - rr);
      const cz = VZ + Math.sin(th) * (s - rr);
      colliders.push({ x: +cx.toFixed(2), z: +cz.toFixed(2), r: rr, h: +Math.max(2, heightAt(cx, cz) + 1).toFixed(2) });
    }
  }

  // =========================================================================
  // 2. Lava: three rivers + the brimming crater lake (one ShaderMaterial mesh)
  // =========================================================================
  const lavaMat = own(
    new THREE.ShaderMaterial({
      name: 'volcano-lava',
      uniforms: {
        ...fogUniforms(),
        uTime: { value: 0 },
        uPulse: { value: 1 },
        uHot: { value: linear(0xfff27a) },
        uMid: { value: linear(0xff9a1e) },
        uDeep: { value: linear(0xe2401a) },
        uCrust: { value: linear(0x3a1214) },
      },
      vertexShader: LAVA_VERT,
      fragmentShader: LAVA_FRAG,
      fog: true,
    }),
  );
  noOutline(lavaMat);
  const mouths = [];
  {
    const positions = [];
    const uvs = [];
    const index = [];
    const ACROSS = 7;
    for (let r = 0; r < RIVERS.length; r++) {
      const line = RIVER_LINES[r];
      const base = positions.length / 3;
      let s = 0;
      let prev = null;
      for (let i = 0; i < line.length; i++) {
        const p = line[i];
        const q = line[Math.min(i + 1, line.length - 1)];
        const o = line[Math.max(i - 1, 0)];
        let tx = q.x - o.x;
        let tz = q.z - o.z;
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl;
        tz /= tl;
        const sx = -tz;
        const sz = tx;
        const yc = heightAt(p.x, p.z);
        if (prev) s += Math.hypot(p.x - prev.x, yc - prev.y, p.z - prev.z);
        prev = { x: p.x, y: yc, z: p.z };
        for (let k = 0; k < ACROSS; k++) {
          const a = (k / (ACROSS - 1)) * 2 - 1;
          const px = p.x + sx * a * p.hw;
          const pz = p.z + sz * a * p.hw;
          const y = heightAt(px, pz) + 0.3 + 0.2 * (1 - a * a);
          positions.push(px, y, pz);
          uvs.push(k / (ACROSS - 1), s);
        }
        if (!mouths[r] && p.u >= 1.0) mouths[r] = { x: p.x, z: p.z, tx, tz, hw: p.hw };
      }
      for (let i = 0; i < line.length - 1; i++) {
        for (let k = 0; k < ACROSS - 1; k++) {
          const a = base + i * ACROSS + k;
          const b = a + ACROSS;
          index.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
      // a mid-slope glow along each river
      const mid = line[Math.round(line.length * 0.62)];
      glows.push({ x: mid.x, y: heightAt(mid.x, mid.z) + 1.5, z: mid.z, size: 7, intensity: 0.35, color: 0xff6a20, pull: 3 });
    }
    // crater lake: a polar disc whose rim is buried in the inner crater wall
    {
      const base = positions.length / 3;
      const NA = 48;
      const RR = [0, 0.35, 0.7, 1];
      for (let j = 0; j < RR.length; j++) {
        for (let i = 0; i <= NA; i++) {
          const th = (i / NA) * Math.PI * 2;
          const [x, z] = polar((U_FLOOR + 0.075) * RR[j], th);
          positions.push(x, LAKE_Y, z);
          uvs.push(0.5 + 0.5 * RR[j] * (i % 2 ? 1 : 0.96), th * 7);
        }
      }
      for (let j = 0; j < RR.length - 1; j++) {
        for (let i = 0; i < NA; i++) {
          const a = base + j * (NA + 1) + i;
          const b = a + NA + 1;
          index.push(a, b + 1, b, a, a + 1, b + 1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    const lava = new THREE.Mesh(geo, lavaMat);
    lava.name = 'volcano-lava';
    lava.userData.keep = true;
    root.add(lava);
  }

  // =========================================================================
  // 3. Island dressing: rim crown, boulders, burnt trees, a green far side
  // =========================================================================
  const lumps = [11, 23, 37, 41, 59, 71].map((s) => lumpGeo(s, 0.22, 10, 7));
  const lump = (i) => lumps[i % lumps.length];
  const nearRiver = (x, z) => riverField(x, z).w > 0.04;
  const notchAt = (th) => RIVERS.some((rv) => Math.abs(angDiff(th, rv.th)) < 0.24);
  {
    // jagged rocks crowning the crater rim
    for (let i = 0; i < 16; i++) {
      const th = (i / 16) * Math.PI * 2 + rng() * 0.15;
      if (notchAt(th)) continue;
      const [x, z] = polar(U_RIM + 0.012, th);
      const s = 1.5 + rng() * 1.3;
      const m = mesh(stat, lump(i), M.rimRock, x, heightAt(x, z) - s * 0.25, z);
      m.scale.set(s * (0.9 + rng() * 0.4), s * (1.0 + rng() * 0.6), s * (0.9 + rng() * 0.4));
      m.rotation.set(rng() * 0.4, rng() * 6, rng() * 0.4);
    }
    // a few big lava bombs half buried in the slopes (same family of colour as the ground)
    for (let n = 0, tries = 0; n < 14 && tries < 200; tries++) {
      const th = rng() * Math.PI * 2;
      const u = 0.45 + rng() * 0.42;
      const [x, z] = polar(u, th);
      if (riverField(x, z).w > 0.03) continue;
      const s = 1.2 + rng() * 1.0;
      const m = mesh(stat, lump(n + 2), M.slopeRock, x, heightAt(x, z) - s * 0.3, z);
      m.scale.set(s * 1.2, s * 0.75, s);
      m.rotation.set(0, rng() * 6, 0);
      n++;
    }
    // shore boulders in the surf
    for (let n = 0, tries = 0; n < 30 && tries < 200; tries++) {
      const th = rng() * Math.PI * 2;
      const u = 0.94 + rng() * 0.05;
      const [x, z] = polar(u, th);
      if (riverField(x, z).w > 0.02) continue;
      const s = 0.8 + rng() * 0.9;
      const m = mesh(stat, lump(n), M.boulder, x, heightAt(x, z) - 0.3, z);
      m.scale.set(s * 1.2, s * 0.8, s);
      m.rotation.y = rng() * 6;
      n++;
    }
    // the far (north) side still has a little jungle: round bushes and a few palms
    const leafGeo = new THREE.SphereGeometry(1, 10, 6);
    const palmTrunk = new THREE.CylinderGeometry(0.22, 0.32, 1, 7);
    for (let n = 0, tries = 0; n < 40 && tries < 400; tries++) {
      const th = 300 * DEG + (rng() - 0.5) * 120 * DEG;
      const u = 0.74 + rng() * 0.2;
      const [x, z] = polar(u, th);
      const y = heightAt(x, z);
      if (y < 1.1 || nearRiver(x, z)) continue;
      if (n % 6 === 5) {
        // palm: a bent trunk of stacked segments and drooping leaves
        const p = new THREE.Group();
        p.position.set(x, y - 0.2, z);
        p.rotation.y = rng() * 6;
        let px = 0;
        let py = 0;
        const lean = 0.18 + rng() * 0.12;
        for (let i = 0; i < 5; i++) {
          const seg = mesh(p, palmTrunk, M.palmTrunk, px, py + 0.5, 0);
          seg.rotation.z = -lean * (1 + i * 0.25);
          px += Math.sin(lean * (1 + i * 0.25)) * 1.0;
          py += Math.cos(lean * (1 + i * 0.25)) * 1.0;
        }
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const l = mesh(p, leafGeo, M.palmLeaf, px + Math.cos(a) * 1.0, py - 0.15, Math.sin(a) * 1.0);
          l.scale.set(1.5, 0.16, 0.45);
          l.rotation.set(0, -a, -0.45);
        }
        stat.add(p);
      } else {
        const s = 1.0 + rng() * 0.9;
        const b = mesh(stat, leafGeo, n % 2 ? M.bush : M.bushDark, x, y + s * 0.35, z);
        b.scale.set(s * 1.2, s * 0.9, s * 1.1);
      }
      n++;
    }
  }

  // parasitic cone fumarole
  puffStream(puffs, rng, {
    x: CONE.x, y: heightAt(CONE.x, CONE.z) + 0.6, z: CONE.z, n: 5, life: 8, rise: 15, drift: 10, spread: 1.2,
    r0: 0.9, r1: 3.0, c0: 0xe4dcea, c1: 0xbab0cc, c2: 0x958aac, fade: 0.64,
  });

  // =========================================================================
  // 4. Basalt sea stacks, arches and the outer ring
  // =========================================================================
  // A tight bundle of hexagonal basalt columns, stepping down around a tall central one
  // like a spiral stair (think Giant's Causeway), with rubble at the waterline.
  function stackCluster(x, z, R, H, opts = {}) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const cols = [{ dx: 0, dz: 0, r: R * 0.42, h: H }];
    const m = opts.n ?? Math.max(5, Math.round(R * 1.1));
    const a0 = rng() * 6;
    for (let i = 0; i < m; i++) {
      const a = a0 + (i / m) * Math.PI * 2 + (rng() - 0.5) * 0.25;
      const d = R * (0.52 + rng() * 0.06);
      const step = 1 - i / m; // spiral stair: each ring column a bit lower than the last
      cols.push({ dx: Math.cos(a) * d, dz: Math.sin(a) * d, r: R * (0.3 + rng() * 0.05), h: H * (0.28 + 0.52 * step) + rng() * 0.8 });
    }
    // a few short stumps on the outside
    const ns = opts.stumps ?? 3;
    for (let i = 0; i < ns; i++) {
      const a = a0 + Math.PI * (0.3 + (1.4 * i) / Math.max(1, ns - 1)) + rng() * 0.3;
      const d = R * 0.84;
      cols.push({ dx: Math.cos(a) * d, dz: Math.sin(a) * d, r: R * 0.19, h: 0.9 + rng() * Math.min(3, H * 0.15) });
    }
    let ext = 0;
    let veins = opts.veins ?? 0;
    for (const [ci, c] of cols.entries()) {
      const capH = Math.min(c.r * 0.55, c.h * 0.35);
      const cg = new THREE.Group();
      cg.position.set(c.dx, 0, c.dz);
      cg.rotation.set((rng() - 0.5) * 0.09, rng() * Math.PI, (rng() - 0.5) * 0.09);
      g.add(cg);
      const top = c.h - capH * 0.6;
      mesh(cg, columnGeo(c.r, -4, top, 1.1), rng() < 0.4 ? M.basalt2 : M.basalt);
      mesh(cg, columnGeo(c.r * 1.05, c.h - capH, c.h, 1.03), M.basaltCap);
      // glowing magma seams climbing the tallest columns
      if (veins > 0 && (ci === 0 || ci === 2) && c.h > 5) {
        veins--;
        const ym = lerp(-4, top, 0.55);
        const R = (y) => (y < ym ? lerp(c.r * 1.1, c.r * 1.02, (y + 4) / (ym + 4)) : lerp(c.r * 1.02, c.r, (y - ym) / (top - c.r * 0.3 - ym)));
        const face0 = Math.PI / 6 + (Math.PI / 3) * Math.floor(rng() * 6);
        for (const face of [face0, face0 + Math.PI]) {
          const pts = [];
          const y1 = c.h * (0.6 + rng() * 0.15);
          for (let k = 0; k <= 7; k++) {
            const y = lerp(0.2, y1, k / 7);
            const a = face + (k % 2 ? 0.13 : -0.13) * (k > 0 && k < 7 ? 1 : 0.3);
            const rr = (R(y) * 0.866) / Math.cos(a - face) + 0.03;
            pts.push(new THREE.Vector3(Math.sin(a) * rr, y, Math.cos(a) * rr));
          }
          mesh(cg, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 28, 0.22, 5, false), crackGlow);
        }
      }
      ext = Math.max(ext, Math.hypot(c.dx, c.dz) + c.r * 1.08);
    }
    // rubble at the waterline, kept inside the footprint
    const nb = opts.rubble ?? 4;
    for (let i = 0; i < nb; i++) {
      const a = rng() * Math.PI * 2;
      const s = R * (0.13 + rng() * 0.08);
      const d = ext - s * 0.6;
      const b = mesh(g, lump(i + 3), M.boulder, Math.cos(a) * d, -0.15, Math.sin(a) * d);
      b.scale.set(s * 1.25, s * 0.85, s);
      b.rotation.y = rng() * 6;
    }
    g.rotation.y = rng() * 6;
    stat.add(g);
    return { x, z, r: +(ext + 0.3).toFixed(2), h: H };
  }

  for (const s of STACKS) colliders.push(stackCluster(s.x, s.z, s.R, s.H, { veins: s.H > 9 ? 2 : 1 }));

  function seaArch(x, z, a, span, H) {
    const px = Math.cos(a);
    const pz = Math.sin(a);
    const A = stackCluster(x - px * span * 0.5, z - pz * span * 0.5, 6, H, { n: 4 });
    const B = stackCluster(x + px * span * 0.5, z + pz * span * 0.5, 5.5, H * 0.9, { n: 4 });
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x - px * span * 0.5, H - 3, z - pz * span * 0.5),
      new THREE.Vector3(x - px * span * 0.22, H + 2.4, z - pz * span * 0.22),
      new THREE.Vector3(x + px * span * 0.22, H + 1.8, z + pz * span * 0.22),
      new THREE.Vector3(x + px * span * 0.5, H * 0.9 - 3, z + pz * span * 0.5),
    ]);
    mesh(stat, new THREE.TubeGeometry(curve, 20, 2.6, 10, false), M.basalt);
    return [A, B];
  }

  // outer ring of basalt just beyond the arena edge, so the playable disc has a visible rim
  {
    const N = 17;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2 + (rng() - 0.5) * 0.12;
      const d = WORLD_R + 14 + rng() * 22;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (k === 4 || k === 12) {
        colliders.push(...seaArch(x, z, a + Math.PI / 2, 22, 17 + rng() * 6));
      } else {
        colliders.push(stackCluster(x, z, 6 + rng() * 4, 14 + rng() * 14));
      }
    }
  }

  // =========================================================================
  // 5. Smoking sea vents: craggy little cones with a magma pool and glowing seams
  // =========================================================================
  {
    const VENT_PROFILE = [[4.6, -2], [4.25, 0.1], [3.3, 1.5], [2.3, 2.65], [1.75, 3.05], [1.35, 2.95], [0.95, 2.45], [0.5, 2.25], [0, 2.2]];
    const ventRadius = (y) => {
      for (let i = 0; i < VENT_PROFILE.length - 1; i++) {
        const [r0, y0] = VENT_PROFILE[i];
        const [r1, y1] = VENT_PROFILE[i + 1];
        if (y <= y1 || i === VENT_PROFILE.length - 2) return lerp(r0, r1, clamp01((y - y0) / (y1 - y0)));
      }
      return 0;
    };
    const poolGeo = new THREE.SphereGeometry(1.15, 16, 8);
    for (const [vi, v] of VENTS.entries()) {
      const k1 = rng() * 6;
      const k2 = rng() * 6;
      const wob = (a, y) => 1 + 0.1 * Math.sin(3 * a + k1) + 0.06 * Math.sin(5 * a + k2) + 0.04 * Math.sin(a * 2 + y);
      const g = new THREE.Group();
      g.position.set(v.x, 0, v.z);
      mesh(g, wonkyLathe(VENT_PROFILE, 18, wob), M.ventRock);
      const pool = mesh(g, poolGeo, ventGlow, 0, 2.55, 0); // a glowing magma dome brimming in the mouth
      pool.scale.set(1.05, 0.42, 1.05);
      // glowing seams running down the flanks
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + vi;
        const pts = [];
        for (let k = 0; k <= 8; k++) {
          const t = k / 8;
          const y = lerp(2.75, -0.3, t);
          const aa = a + Math.sin(t * 7 + i * 2) * 0.13;
          const r = ventRadius(y) * wob(aa, y) + 0.02;
          pts.push(new THREE.Vector3(Math.cos(aa) * r, y, Math.sin(aa) * r));
        }
        mesh(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.17, 5, false), crackGlow);
      }
      for (let i = 0; i < 5; i++) {
        const a = rng() * Math.PI * 2;
        const s = 0.7 + rng() * 0.5;
        const b = mesh(g, lump(i), M.boulder, Math.cos(a) * 4.2, -0.25, Math.sin(a) * 4.2);
        b.scale.set(s * 1.2, s * 0.8, s);
      }
      stat.add(g);
      colliders.push({ x: v.x, z: v.z, r: 5.0, h: 3.0 });
      glows.push({ x: v.x, y: 3.2, z: v.z, size: 6, intensity: 0.55, color: 0xff7a2a, pull: 2.5 });
      puffStream(puffs, rng, {
        x: v.x, y: 2.9, z: v.z, n: 9, life: 7, rise: 17, drift: 10, spread: 1.2,
        r0: 1.3, r1: 3.1, c0: 0xffb27a, c1: 0x938cad, c2: 0x736c90, cT: 0.14, fade: 0.66,
      });
      emberSets.push({ kind: 'vent', x: v.x, y: 2.8, z: v.z, n: 16 });
    }
  }

  // =========================================================================
  // 6. The burnt shipwreck: a listing bow section rising out of the water and the
  //    broken-off stern castle, stranded on a rocky shoal and still smouldering
  // =========================================================================
  {
    const g = new THREE.Group();
    g.position.set(WRECK.x, 0, WRECK.z);
    g.rotation.y = WRECK.ry;

    const L = 14;
    const W = 5;
    const D = 3;
    const shape = (x, y, z) => {
      let X = x * (W / 2);
      const Z = z * (L / 2);
      if (z > 0) X *= 1 - 0.4 * z * z; // pointier bow
      else X *= 1 - 0.12 * z * z;
      let Y = y > 0 ? y * 0.35 : y * D * (1 - 0.25 * z * z);
      Y += 0.9 * z * z + (z > 0 ? 0.6 * z * z * z : 0); // sheer, rising at the bow
      return [X, Y, Z];
    };
    const half = (top) => {
      let geo = new THREE.SphereGeometry(1, 24, top ? 5 : 9, 0, Math.PI * 2, top ? 0 : Math.PI / 2, Math.PI / 2);
      geo.deleteAttribute('uv');
      geo.deleteAttribute('normal');
      geo = mergeVertices(geo);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, ...shape(p.getX(i), p.getY(i), p.getZ(i)));
      geo.computeVertexNormals();
      return geo;
    };
    const bow = new THREE.Group();
    bow.position.set(0, 1.25, 0.6);
    bow.rotation.set(-0.2, 0, 0.2); // bow up, listing towards the arena so its deck shows
    g.add(bow);
    mesh(bow, half(false), M.hull);
    mesh(bow, half(true), M.deck);
    // the wale (old red paint) hides the seam between hull and deck
    const walePts = [];
    for (let i = 0; i < 56; i++) {
      const a = (i / 56) * Math.PI * 2;
      walePts.push(new THREE.Vector3(...shape(Math.cos(a), 0, Math.sin(a))));
    }
    mesh(bow, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(walePts, true), 72, 0.28, 7, true), M.wale);
    // plank seams along the port side
    for (const yy of [-0.55, -1.15]) {
      const pts = [];
      for (let k = 0; k <= 12; k++) {
        const zz = lerp(-0.85, 0.82, k / 12);
        const yv = yy / D; // unit-sphere y for this seam
        const xr = -Math.sqrt(Math.max(0, 1 - zz * zz - yv * yv));
        const [X, Y, Z] = shape(xr, yv, zz);
        pts.push(new THREE.Vector3(X * 1.01 - 0.02, Y, Z));
      }
      mesh(bow, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.09, 5, false), M.char);
    }
        // a burnt-through hole in the deck with charred beams across it
    const hole = mesh(bow, lumpGeo(5, 0.12, 12, 8), M.hole, -0.3, 0.3, -1.9);
    hole.scale.set(1.45, 0.3, 2.3);
    const beam = new THREE.CylinderGeometry(0.17, 0.17, 3.0, 7);
    for (let i = 0; i < 3; i++) {
      const b = mesh(bow, beam, M.char, -0.3, 0.5, -3.2 + i * 1.15);
      b.rotation.set(0.1 * i, 0.15 * (i - 1), Math.PI / 2 + 0.12 * (i - 1));
    }
    const ribGeo = new THREE.TorusGeometry(1.4, 0.17, 6, 12, Math.PI * 0.62);
    // scorch blotches along the hull
    for (const [bx, by, bz, s] of [[-1, -0.3, 2.6, 0.7], [-1, -0.4, 4.6, 0.5], [1, -0.2, 1.0, 0.8], [1, -0.4, -3.0, 0.7]]) {
      const b = mesh(bow, lump(Math.abs(bz * 3) | 0), M.hole, bx * W * 0.46 * (1 - 0.3 * Math.max(0, bz / 7) ** 2), by, bz);
      b.scale.set(0.22, 0.5 * s, 0.9 * s);
    }
    // main mast, snapped near the top, with a dangling yard and a tattered, holed sail
    const mg = new THREE.Group();
    mg.position.set(0, 0.25, 0.9);
    mg.rotation.set(0.08, 0, 0.1);
    bow.add(mg);
    mesh(mg, new THREE.CylinderGeometry(0.27, 0.34, 7.2, 8), M.char, 0, 3.6, 0);
    mesh(mg, new THREE.ConeGeometry(0.3, 1.0, 5), M.char, 0.05, 7.6, 0).rotation.z = 0.15;
    const yard = new THREE.Group();
    yard.position.set(0, 5.6, 0.32);
    yard.rotation.set(0, 0.85, 0.42); // braced round so the torn sail faces the arena
    mg.add(yard);
    mesh(yard, new THREE.CylinderGeometry(0.17, 0.17, 6, 7), M.char).rotation.z = Math.PI / 2;
    {
      const s = new THREE.Shape();
      const pts = [[-2.5, 0], [2.5, 0], [2.3, -1.4], [1.9, -2.7], [1.4, -2.0], [0.9, -3.4], [0.35, -2.4], [-0.2, -3.1], [-0.8, -2.1], [-1.5, -2.8], [-2.0, -1.6], [-2.5, 0]];
      s.moveTo(...pts[0]);
      for (const q of pts.slice(1)) s.lineTo(...q);
      const h1 = new THREE.Path();
      h1.absellipse(1.0, -1.1, 0.42, 0.34, 0, Math.PI * 2, true);
      const h2 = new THREE.Path();
      h2.absellipse(-1.2, -0.95, 0.3, 0.42, 0, Math.PI * 2, true);
      s.holes.push(h1, h2);
      const sg = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 6 });
      const sail = mesh(yard, sg, M.sail, 0, -0.15, 0.12);
      sail.rotation.set(0.12, 0, -0.32); // hangs straighter than the broken yard
    }
    // a ragged black flag still clinging to the masthead
    {
      const s = new THREE.Shape();
      const pts = [[0, 0], [1.7, 0.1], [1.4, -0.35], [1.8, -0.7], [1.2, -0.8], [1.5, -1.15], [0, -1.1], [0, 0]];
      s.moveTo(...pts[0]);
      for (const q of pts.slice(1)) s.lineTo(...q);
      const fg = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 });
      const flag = mesh(mg, fg, M.flag, 0.2, 7.0, 0);
      flag.rotation.set(0, -0.5, -0.12);
    }
    // foremast stump and bowsprit
    mesh(bow, new THREE.CylinderGeometry(0.25, 0.32, 2.6, 8), M.char, 0, 2.0, 4.4).rotation.x = 0.18;
    mesh(bow, new THREE.ConeGeometry(0.27, 0.8, 5), M.char, 0, 3.55, 4.68).rotation.x = 0.18;
    const sprit = mesh(bow, new THREE.CylinderGeometry(0.15, 0.22, 3.6, 7), M.char, 0, 3.3, 7.6);
    sprit.rotation.x = 1.1;
    // smouldering embers on the deck
    const emberGeo = new THREE.SphereGeometry(0.34, 8, 6);
    const deckY = (lz) => 0.35 + 0.9 * (lz / 7) ** 2 + (lz > 0 ? 0.6 * (lz / 7) ** 3 : 0);
    for (const [ex, ez] of [[0.7, -1.6], [-0.9, -2.8], [1.0, 2.3], [-0.5, 0.6], [0.3, -4.0]]) {
      const e = mesh(bow, emberGeo, ventGlow, ex, deckY(ez) - 0.05, ez);
      e.scale.set(1.4, 0.55, 1.15);
    }
    // the ship broke in two: bare ribs curve up out of the water between the pieces
    const ribU = new THREE.TorusGeometry(2.1, 0.2, 6, 14, Math.PI * 1.12);
    for (let i = 0; i < 4; i++) {
      const r = mesh(g, ribU, M.char, 0.5 + i * 0.35, 1.5 - i * 0.18, -4.7 - i * 1.05);
      r.rotation.set(0.12, 0, Math.PI * 0.94 - 0.18 + i * 0.05); // a U opening upwards
      r.scale.set(1 - i * 0.06, 1 - i * 0.04, 1);
    }
    mesh(g, new THREE.CylinderGeometry(0.22, 0.22, 4.4, 7), M.char, 0.9, -0.55, -6.2).rotation.x = Math.PI / 2 - 0.12; // keelson
    // the broken-off stern castle, lying on its side with its windows to the sky
    const stern = new THREE.Group();
    stern.position.set(2.6, 0.5, -8.6);
    stern.rotation.set(0.3, 0.45, -0.62);
    g.add(stern);
    mesh(stern, new RoundedBoxGeometry(4.4, 3.6, 3.0, 2, 0.5), M.hull);
    const sw = new RoundedBoxGeometry(0.8, 1.0, 0.3, 2, 0.15);
    for (const wx of [-1.2, 0, 1.2]) mesh(stern, sw, M.hole, wx, 0.45, -1.5);
    mesh(stern, new RoundedBoxGeometry(4.8, 0.42, 3.3, 2, 0.18), M.wale, 0, 1.85, 0);
    mesh(stern, new RoundedBoxGeometry(4.8, 0.36, 3.3, 2, 0.16), M.deck, 0, -0.6, 0);
    for (let i = 0; i < 3; i++) {
      const r = mesh(stern, ribGeo, M.char, -1.2 + i * 1.2, -0.2, 1.55);
      r.rotation.set(0, 0, Math.PI * 0.2);
      r.scale.setScalar(0.8);
    }
    // the shoal it ran aground on
    for (const [bx, bz, s] of [[2.9, 2.2, 1.5], [-2.6, 4.8, 1.2], [-2.2, -4.0, 1.7], [3.2, -4.6, 1.3], [0.6, 7.6, 1.0], [-1.0, -9.6, 1.2]]) {
      const b = mesh(g, lump(Math.round(Math.abs(bx * 7 + bz)) % 6), M.boulder, bx, -0.25, bz);
      b.scale.set(s * 1.3, s * 0.85, s);
    }
    stat.add(g);

    g.updateMatrixWorld(true);
    for (const [lx, lz, r] of [[0, -4.2, 3.4], [0, 0.6, 3.6], [0, 5.4, 3.2], [2.6, -8.8, 3.3]]) {
      const p = new THREE.Vector3(lx, 0, lz).applyMatrix4(g.matrixWorld);
      colliders.push({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), r, h: 3.5 });
    }
    for (const [lx, lz] of [[0.7, -1.6], [-0.5, 0.6], [1.0, 2.3]]) {
      const p = new THREE.Vector3(lx, deckY(lz) + 0.5, lz).applyMatrix4(bow.matrixWorld);
      glows.push({ x: p.x, y: p.y, z: p.z, size: 2.8, intensity: 0.6, color: 0xff6a1c, pull: 1 });
    }
    for (const [lx, lz] of [[0.7, -1.6]]) {
      const p = new THREE.Vector3(lx, deckY(lz) + 0.3, lz).applyMatrix4(bow.matrixWorld);
      puffStream(puffs, rng, {
        x: p.x, y: p.y, z: p.z, n: 6, life: 6, rise: 10, drift: 7, spread: 0.8,
        r0: 0.45, r1: 1.6, c0: 0xff9a5a, c1: 0x6a6488, c2: 0x5a5478, cT: 0.12, fade: 0.6,
      });
    }
    emberSets.push({ kind: 'vent', x: WRECK.x, y: 1.6, z: WRECK.z, n: 14 });
  }

  // =========================================================================
  // 7. Far away: hazy islands and a smaller sister volcano on the horizon
  // =========================================================================
  {
    const isles = [
      { a: 200, d: 330, r: 42, h: 20 },
      { a: 246, d: 390, r: 62, h: 30, volcano: true },
      { a: 292, d: 310, r: 32, h: 15 },
      { a: 330, d: 360, r: 48, h: 22 },
      { a: 30, d: 340, r: 40, h: 18 },
      { a: 100, d: 380, r: 52, h: 24 },
      { a: 150, d: 350, r: 36, h: 16 },
    ];
    for (const [i, s] of isles.entries()) {
      const x = Math.cos(s.a * DEG) * s.d;
      const z = Math.sin(s.a * DEG) * s.d;
      if (s.volcano) {
        const cone = mesh(stat, lathe([[0, 30], [4, 30.5], [6, 33], [9, 31], [20, 18], [34, 7], [50, 1], [62, -3]], 20), M.farIsle, x, -1, z);
        cone.scale.set(1, s.h / 33, 1);
        for (let k = 0; k < 5; k++) {
          const p = mesh(stat, lump(k), M.farSmoke, x - 6 - k * 9, s.h + 6 + k * 5, z - 3 - k * 3);
          p.scale.setScalar(5 + k * 1.6);
        }
      } else {
        const m = mesh(stat, lumpGeo(100 + i, 0.18, 18, 10), i % 2 ? M.farIsle : M.farIsle2, x, -2, z);
        m.scale.set(s.r, s.h, s.r * 0.7);
        m.rotation.y = s.a * DEG;
        const m2 = mesh(stat, lump(i), i % 2 ? M.farIsle2 : M.farIsle, x + s.r * 0.6, -2, z + s.r * 0.3);
        m2.scale.set(s.r * 0.5, s.h * 0.6, s.r * 0.4);
      }
    }
  }

  // =========================================================================
  // 8. Smoke, steam and the ash plume (instanced spheres with an inverted-hull ink line)
  // =========================================================================
  const CRATER = { x: VX, y: TOP - 1.5, z: VZ };
  puffStream(puffs, rng, {
    x: CRATER.x, y: CRATER.y, z: CRATER.z, n: 30, life: 26, rise: 70, drift: 50, spread: 4,
    r0: 4.2, r1: 11, c0: 0xffa050, c1: 0x46415f, c2: 0x5c5580, cT: 0.14, fade: 0.9,
  });
  {
    // the ash cloud the plume spreads into
    const ax = CRATER.x + WIND.x * 50;
    const ay = CRATER.y + 70;
    const az = CRATER.z + WIND.z * 50;
    const side = new THREE.Vector3(-WIND.z, 0, WIND.x);
    const spots = [
      [0, 0, 0, 13], [-11, 3, 7, 10], [11, -2, -5, 11], [6, 7, 10, 9.5], [-5, -4, -11, 10],
      [19, 2, 7, 10], [27, 6, -3, 9], [37, 4, 5, 8], [-15, 1, -3, 9], [8, 10, -2, 9], [47, 6, 0, 7], [31, 10, 7, 7],
    ];
    for (const [along, up, across, r] of spots) {
      puffs.push({
        canopy: true, r0: r, seed: rng() * 100,
        x: ax + WIND.x * along + side.x * across, y: ay + up, z: az + WIND.z * along + side.z * across,
        c0: rng() < 0.5 ? 0x58527a : 0x645d88,
      });
    }
  }
  // steam where the lava meets the sea
  for (const m of mouths) {
    if (!m) continue;
    puffStream(puffs, rng, {
      x: m.x + m.tx * 1.5, y: 0.3, z: m.z + m.tz * 1.5, n: 8, life: 4, rise: 12, drift: 6, spread: 2.4,
      r0: 1.0, r1: 3.4, c0: 0xffffff, c1: 0xf4f0fa, c2: 0xdcd6ea, fade: 0.6,
    });
    const gx = m.x - m.tx * 3;
    const gz = m.z - m.tz * 3;
    glows.push({ x: gx, y: heightAt(gx, gz) + 2.2, z: gz, size: 7, intensity: 0.45, color: 0xff8a2c, pull: 3 });
  }
  const skyGlows = [{ x: CRATER.x, y: TOP + 3, z: CRATER.z, size: 17, intensity: 0.3, color: 0xff6a1a, pull: 10 }];

  const smoke = buildSmoke(puffs, ownMaterials);
  root.add(smoke.mesh, smoke.hull);

  // =========================================================================
  // 9. Embers and glows
  // =========================================================================
  emberSets.unshift({ kind: 'plume', x: CRATER.x, y: TOP, z: CRATER.z, n: 170 }, { kind: 'sea', n: 520 });
  const embers = buildEmbers(emberSets, rng, ownMaterials);
  root.add(embers.mesh);
  const glow = buildGlows(glows, ownMaterials, THREE.NormalBlending);
  const skyGlow = buildGlows(skyGlows, ownMaterials, THREE.AdditiveBlending); // the crater halo brightens sky and smoke
  root.add(glow.mesh, skyGlow.mesh);

  const craterLight = new THREE.PointLight(0xff7a33, 1400, 105, 2);
  craterLight.position.set(CRATER.x, TOP + 5, CRATER.z);
  root.add(craterLight);

  // =========================================================================
  // 10. Floating wreckage (bobs on the waves)
  // =========================================================================
  const debris = [];
  {
    const barrel = lathe([[0, -0.75], [0.48, -0.75], [0.6, -0.3], [0.64, 0], [0.6, 0.3], [0.48, 0.75], [0, 0.75]], 12);
    const crate = new RoundedBoxGeometry(1.3, 1.1, 1.3, 2, 0.18);
    const plank = new RoundedBoxGeometry(3.2, 0.3, 0.7, 2, 0.12);
    const items = [
      [barrel, M.wood, -41, 40, 0.0],
      [barrel, M.hull, -45, 47, 1.3],
      [crate, M.wood, -38, 30, 2.1],
      [plank, M.deck, -58, 50, 0.4],
    ];
    for (const [geo, mat, x, z, ph] of items) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, 0, z);
      if (geo === barrel) m.rotation.z = Math.PI / 2;
      m.userData.base = { x, z, ph, rx: m.rotation.x, rz: m.rotation.z, ry: ph * 2 };
      m.userData.keep = true;
      root.add(m);
      debris.push(m);
    }
  }

  // =========================================================================
  // merge the static scenery
  // =========================================================================
  mergeStatic(stat);

  // =========================================================================
  // spawns
  // =========================================================================
  const playerStart = { ...PLAYER_START };
  const enemySpawns = computeSpawns(colliders, playerStart);

  const AMP = palette.waveAmp;
  const crater = { x: VX, z: VZ, craterY: TOP, r: +(U_RIM * SHORE_R).toFixed(2) };

  function update(t /* , dt */) {
    const pulse = 1 + 0.5 * Math.sin(t * 1.7) * Math.sin(t * 0.63 + 1);
    lavaMat.uniforms.uTime.value = t;
    lavaMat.uniforms.uPulse.value = pulse;
    glow.material.uniforms.uTime.value = t;
    skyGlow.material.uniforms.uTime.value = t;
    embers.material.uniforms.uTime.value = t;
    ventGlow.emissiveIntensity = 0.85 + 0.35 * Math.sin(t * 3.1) * Math.sin(t * 1.3 + 0.5);
    craterLight.intensity = 1400 * (0.85 + 0.15 * pulse);
    smoke.update(t);
    for (const d of debris) {
      const b = d.userData.base;
      d.position.y = waveHeight(b.x, b.z, t, AMP) - 0.15;
      d.rotation.x = b.rx + 0.18 * Math.sin(t * 1.1 + b.ph);
      d.rotation.z = b.rz + 0.14 * Math.sin(t * 0.9 + b.ph * 2);
      d.rotation.y = b.ry + 0.1 * Math.sin(t * 0.3 + b.ph);
    }
  }
  update(0);

  function dispose() {
    scene.remove(root);
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose(); // frees the instance matrix / colour buffers too
    });
    for (const m of ownMaterials) m.dispose();
    rockRamp.dispose();
    for (const g of lumps) g.dispose();
  }

  return {
    worldRadius: WORLD_R,
    colliders,
    playerStart,
    enemySpawns,
    reefs: [],
    volcano: crater,
    heightAt,
    update,
    dispose,
  };
}

// ---------------------------------------------------------------------------
// Smoke: one InstancedMesh of toon spheres + one of black back-faces (the ink line)
// ---------------------------------------------------------------------------
function puffStream(list, rng, o) {
  for (let i = 0; i < o.n; i++) {
    list.push({ ...o, phase: (i + rng() * 0.6) / o.n, seed: rng() * 100, k: 0.78 + rng() * 0.44, spin: (rng() - 0.5) * 0.5 });
  }
}

/** A cauliflower-shaped billow: a few merged spheres. `push` grows it along the normals (ink hull). */
function puffGeometry(push = 0) {
  const lobes = [
    [0, 0, 0, 1],
    [0.72, 0.14, 0.22, 0.68],
    [-0.64, 0.2, -0.3, 0.66],
    [-0.05, 0.5, 0.6, 0.6],
  ];
  const geos = lobes.map(([x, y, z, r]) => {
    const g = new THREE.SphereGeometry(r + push * r, 10, 7);
    g.deleteAttribute('uv');
    g.translate(x, y - 0.1, z);
    return g;
  });
  const g = mergeGeometries(geos, false);
  for (const x of geos) x.dispose();
  return g;
}

function buildSmoke(puffs, ownMaterials) {
  const geo = puffGeometry(0);
  const hullGeo = puffGeometry(0.075);
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, emissive: 0x241e3a, gradientMap: gradientMap(3) });
  noOutline(mat);
  const hullMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(INK[0], INK[1], INK[2]), side: THREE.BackSide });
  noOutline(hullMat);
  // A puff the camera flies into would fill the screen with its black ink hull (back faces seen
  // from inside), e.g. when the chase cam passes over a vent or the steam at a lava mouth. So
  // each puff shrinks away around its own centre as the camera comes within about its radius.
  const nearFade = (m, rScale, key) => {
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 pc = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float pr = ${rScale.toFixed(3)} * length(instanceMatrix[0].xyz);
          transformed *= smoothstep(pr + 0.5, pr + 6.0, length(pc.xyz));
        }`,
      );
    };
    m.customProgramCacheKey = () => key;
  };
  nearFade(mat, 1.5, 'volcano-smoke-fade');
  nearFade(hullMat, 1.5 / 1.1, 'volcano-smoke-ink-fade');
  ownMaterials.push(mat, hullMat);
  const n = puffs.length;
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const hull = new THREE.InstancedMesh(hullGeo, hullMat, n);
  mesh.name = 'volcano-smoke';
  hull.name = 'volcano-smoke-ink';
  for (const m of [mesh, hull]) {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.userData.keep = true;
  }
  const cols = puffs.map((p) => [linear(p.c0), linear(p.c1 ?? p.c0), linear(p.c2 ?? p.c1 ?? p.c0)]);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) mesh.setColorAt(i, cols[i][0]);

  function update(t) {
    for (let i = 0; i < n; i++) {
      const p = puffs[i];
      let r;
      if (p.canopy) {
        r = p.r0 * (1 + 0.05 * Math.sin(t * 0.45 + p.seed));
        pos.set(p.x + Math.sin(t * 0.2 + p.seed) * 1.2, p.y + Math.sin(t * 0.33 + p.seed * 2) * 0.8, p.z);
        c.copy(cols[i][0]);
        e.set(0, p.seed + t * 0.03, 0);
      } else {
        const s = (t / p.life + p.phase) % 1;
        const sd = Math.pow(s, 1.35) * p.drift;
        const wob = p.spread * (0.35 + s);
        pos.set(
          p.x + WIND.x * sd + Math.sin(p.seed + s * 5) * wob,
          p.y + p.rise * Math.pow(s, 0.85),
          p.z + WIND.z * sd + Math.cos(p.seed * 1.3 + s * 4) * wob,
        );
        r = lerp(p.r0, p.r1, Math.sqrt(s)) * p.k * smoothstep(0, 0.1, s) * (1 - smoothstep(p.fade, 1, s));
        const cT = p.cT ?? 0.35;
        if (s < cT) c.copy(cols[i][0]).lerp(cols[i][1], s / cT);
        else c.copy(cols[i][1]).lerp(cols[i][2], (s - cT) / (1 - cT));
        e.set(0.3 * Math.sin(p.seed), p.seed + s * p.spin * 6, 0.3 * Math.cos(p.seed));
      }
      r = Math.max(r, 0.001);
      q.setFromEuler(e);
      scl.set(r, r * 0.9, r);
      m4.compose(pos, q, scl);
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, c);
      // the ink hull is pushed 7.5% along the normals, plus up to 0.08 so small puffs still read
      // (the extra shrinks with the puff, so a dying puff never leaves a black speck behind)
      const k = 1 + Math.min(0.08, 0.16 * r) / r;
      scl.multiplyScalar(k);
      m4.compose(pos, q, scl);
      hull.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
    hull.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  return { mesh, hull, update };
}

// ---------------------------------------------------------------------------
// Embers: camera-facing quads animated entirely in the vertex shader
// ---------------------------------------------------------------------------
function buildEmbers(sets, rng, ownMaterials) {
  const pos = [];
  const uv = [];
  const aP = [];
  const aD = [];
  const index = [];
  let n = 0;
  const add = (x, y, z, phase, speed, size, rise, dx, dy, dz) => {
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      pos.push(x, y, z);
      uv.push(u, v);
      aP.push(phase, speed, size, rise);
      aD.push(dx, dy, dz);
    }
    const b = n * 4;
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
    n++;
  };
  for (const s of sets) {
    for (let i = 0; i < s.n; i++) {
      if (s.kind === 'plume') {
        const a = rng() * Math.PI * 2;
        const d = rng() * 6;
        const drift = 25 + rng() * 30;
        add(s.x + Math.cos(a) * d, s.y - 2 + rng() * 4, s.z + Math.sin(a) * d, rng(), 1 / (5 + rng() * 5), 0.55 + rng() * 0.45,
          35 + rng() * 40, WIND.x * drift + (rng() - 0.5) * 16, 0, WIND.z * drift + (rng() - 0.5) * 16);
      } else if (s.kind === 'sea') {
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(rng()) * 165;
        const drift = 8 + rng() * 10;
        add(Math.cos(a) * d, 0.8 + rng() * 9, Math.sin(a) * d, rng(), 1 / (7 + rng() * 6), 0.22 + rng() * 0.18,
          10 + rng() * 14, WIND.x * drift + (rng() - 0.5) * 6, 0, WIND.z * drift + (rng() - 0.5) * 6);
      } else {
        const a = rng() * Math.PI * 2;
        const d = rng() * 1.6;
        add(s.x + Math.cos(a) * d, s.y, s.z + Math.sin(a) * d, rng(), 1 / (2.5 + rng() * 2.5), 0.18 + rng() * 0.12,
          5 + rng() * 6, WIND.x * 3 + (rng() - 0.5) * 3, 0, WIND.z * 3 + (rng() - 0.5) * 3);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aP', new THREE.Float32BufferAttribute(aP, 4));
  geo.setAttribute('aD', new THREE.Float32BufferAttribute(aD, 3));
  geo.setIndex(index);
  const material = new THREE.ShaderMaterial({
    name: 'volcano-embers',
    uniforms: {
      ...fogUniforms(),
      uTime: { value: 0 },
      uCore: { value: linear(0xffd25a) },
      uHalo: { value: linear(0xff7a1c) },
      uCool: { value: linear(0xc8381a) },
    },
    vertexShader: EMBER_VERT,
    fragmentShader: EMBER_FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  noOutline(material);
  ownMaterials.push(material);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'volcano-embers';
  mesh.frustumCulled = false;
  mesh.userData.keep = true;
  mesh.renderOrder = 5;
  return { mesh, material };
}

function buildGlows(list, ownMaterials, blending) {
  const pos = [];
  const uv = [];
  const aG = [];
  const aC = [];
  const index = [];
  list.forEach((g, n) => {
    const c = linear(g.color);
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      pos.push(g.x, g.y, g.z);
      uv.push(u, v);
      aG.push(g.size, g.intensity, n * 1.7, g.pull);
      aC.push(c.r, c.g, c.b);
    }
    const b = n * 4;
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aGlow', new THREE.Float32BufferAttribute(aG, 4));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(aC, 3));
  geo.setIndex(index);
  const material = new THREE.ShaderMaterial({
    name: 'volcano-glow',
    uniforms: { ...fogUniforms(), uTime: { value: 0 } },
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    transparent: true,
    depthWrite: false,
    blending,
    fog: true,
  });
  noOutline(material);
  ownMaterials.push(material);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'volcano-glows';
  mesh.frustumCulled = false;
  mesh.userData.keep = true;
  mesh.renderOrder = 4;
  return { mesh, material };
}

// ---------------------------------------------------------------------------
// Enemy spawns: open water 58-92 from the start, ordered by farthest-point sampling
// ---------------------------------------------------------------------------
function computeSpawns(colliders, start) {
  const cand = [];
  for (let x = -136; x <= 136; x += 4) {
    for (let z = -136; z <= 136; z += 4) {
      const dS = Math.hypot(x - start.x, z - start.z);
      if (dS < 58 || dS > 92) continue;
      if (Math.hypot(x, z) > WORLD_R - 17) continue;
      let ok = true;
      for (const c of colliders) {
        if (Math.hypot(x - c.x, z - c.z) < c.r + 13) {
          ok = false;
          break;
        }
      }
      if (ok) cand.push({ x, z });
    }
  }
  const fx = Math.sin(start.h);
  const fz = Math.cos(start.h);
  const ax = start.x + fx * 75;
  const az = start.z + fz * 75;
  const out = [];
  let first = null;
  let bd = Infinity;
  for (const c of cand) {
    const d = Math.hypot(c.x - ax, c.z - az);
    if (d < bd) {
      bd = d;
      first = c;
    }
  }
  if (first) out.push(first);
  while (out.length < 12 && out.length < cand.length) {
    let best = null;
    let bm = -1;
    for (const c of cand) {
      let m = Infinity;
      for (const o of out) m = Math.min(m, Math.hypot(c.x - o.x, c.z - o.z));
      if (m > bm) {
        bm = m;
        best = c;
      }
    }
    if (!best || bm <= 0) break;
    out.push(best);
  }
  return out.map((c) => ({ x: c.x, z: c.z }));
}
