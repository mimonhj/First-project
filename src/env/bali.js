import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, setOutline, noOutline, mergeStatic, gradientMap } from '../style.js';
import * as scenery from '../scenery.js';

// Level 2: "Bali Islands". A warm turquoise lagoon dotted with jungle islands,
// a Balinese temple (split gate, meru towers, tiki torches), a rice-terrace
// island, outrigger boats on the beaches, coral reefs, a sea-temple rock, a
// barrier reef with breaking surf at the edge and Mount Agung on the horizon.
// Everything lives in one group; static parts are merged per material.

export const meta = {
  name: 'Bali Islands',
  subtitle: 'Temple isles, coral reefs and the raiders of the Dragon Junk',
};

export const palette = {
  skyTop: 0x1b9ae6,
  skyHorizon: 0xfff0c6,
  sunColor: 0xfff0c2,
  sunDir: [-0.62, 0.62, -0.42],
  sunIntensity: 2.5,
  hemiSky: 0xfff4dc,
  hemiGround: 0x4f8a80,
  hemiIntensity: 1.45,
  fogColor: 0xf3eed2,
  fogNear: 140,
  fogFar: 390,
  waterDeep: 0x0596aa,
  waterShallow: 0x3fe0cf,
  waterFoam: 0xffffff,
  waveAmp: 0.8,
  cloudColor: 0xffffff,
  cloudShade: 0xf2cbbd,
  cloudCount: 12,
};

const WORLD_R = 140;
const START = { x: 0, z: -108, h: 0 };

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------
const C = {
  sand: 0xfff0c4,
  wetSand: 0xf2cf92,
  grass: 0x64c64a,
  grass2: 0x4cab40,
  canopy: [0x3da64a, 0x2f8f42, 0x58bf4e],
  trunk: 0x8a5a33,
  palmTrunk: 0xb98a55,
  palmRing: 0x8f6338,
  frond: [0x52c53f, 0x3ca23a],
  coconut: 0x6e4424,
  brick: 0xc9553b,
  brickDark: 0xa8432f,
  stone: 0x4d4b58,
  stoneLight: 0x6f6c7c,
  gold: 0xf3c34a,
  thatch: 0x2f2b33,
  wood: 0x9a3a2a,
  woodDark: 0x6b3a22,
  bamboo: 0xdcbf62,
  torchHead: 0x7a4b25,
  hull: 0xfbf5e8,
  hullStripe: [0x2f9fe0, 0xe8463a, 0xffc22e, 0x2fbf8c],
  boom: 0x8a5a33,
  sail: 0xff6a3d,
  umbrella: 0xffcf3a,
  frill: 0xfff6e0,
  coral: [0xff6fa3, 0xff9a3c, 0x9b6bff, 0xffd447, 0xff5a5a],
  rockA: 0x9c8672,
  rockB: 0x7d6858,
  rockWet: 0x4b4654,
  reefRock: 0xf3c9a8,
  path: 0xd8cbb2,
  egret: 0xffffff,
  beak: 0xffb52e,
};

// ---------------------------------------------------------------------------
// Layout. Islands are unions of circles; their shoreline IS the collider set
// (the terrain height field is built from the same smooth-min distance the
// ocean shader uses for its foam), so colliders hug the visible land exactly.
// lumps: [x, z, r]; bumps: [x, z, radius, height]; flats: [x, z, r] (no bumps)
// ---------------------------------------------------------------------------
const TEMPLE_C = [-30, -3];
const INNER = [
  {
    id: 'temple', lumps: [[-30, -3, 16], [-45, 7, 10], [-16, 4, 8]], beach: 4.4, hillH: 1.1, hillW: 4,
    bumps: [[-47, 10, 9, 6.5], [-39, 15, 7, 3.5], [-14, 7, 6, 2.5]], flats: [[-29, -4, 12]],
    trees: 0.05, palms: 9, boats: [215, 352], res: 0.85,
  },
  {
    id: 'terraces', lumps: [[54, 32, 19], [70, 45, 11], [40, 48, 9]], beach: 4.2, hillH: 0.5, hillW: 3,
    bumps: [[72, 47, 8, 5], [39, 51, 6, 2.5]], flats: [[55, 33, 14]], palmClear: [55, 33, 212, 38],
    trees: 0.045, palms: 9, boats: [235], res: 0.9,
  },
  {
    id: 'jungleW', lumps: [[-84, 58, 13], [-71, 71, 9]], beach: 3.8, hillH: 4.5, hillW: 6,
    bumps: [[-86, 58, 8, 4.5], [-71, 72, 5, 2]], trees: 0.075, palms: 7, boats: [300], torches: 0, res: 0.95,
  },
  {
    id: 'jungleN', lumps: [[6, 96, 12], [21, 101, 8]], beach: 3.8, hillH: 4, hillW: 5,
    bumps: [[5, 97, 7, 4.5]], trees: 0.075, palms: 6, boats: [250], res: 0.95,
  },
  {
    id: 'isletE', lumps: [[90, -36, 7]], beach: 3.6, hillH: 0.8, hillW: 2, bumps: [], trees: 0.03, palms: 4,
    boats: [200], res: 0.7,
  },
  {
    id: 'isletSW', lumps: [[-66, -62, 8], [-57, -71, 5]], beach: 3.8, hillH: 1.4, hillW: 3,
    bumps: [[-67, -60, 4, 1.5]], trees: 0.04, palms: 5, boats: [60], torches: 2, res: 0.7,
  },
  {
    id: 'isletS', lumps: [[34, -62, 6]], beach: 4.5, hillH: 0.3, hillW: 2, bumps: [], trees: 0, palms: 3,
    boats: [], res: 0.7,
  },
];

// Big islands beyond the arena edge (coarser, hazy in the fog).
const OUTER = [
  { id: 'o1', lumps: [[-150, 122, 22], [-128, 142, 14]], hillH: 7, hillW: 9, bumps: [[-152, 124, 12, 5]] },
  { id: 'o2', lumps: [[-188, 22, 28]], hillH: 9, hillW: 12, bumps: [[-192, 30, 14, 6]] },
  { id: 'o3', lumps: [[-162, -100, 20], [-145, -120, 12]], hillH: 6, hillW: 8, bumps: [] },
  { id: 'o4', lumps: [[-62, -192, 24]], hillH: 7, hillW: 10, bumps: [[-66, -196, 10, 5]] },
  { id: 'o5', lumps: [[72, -188, 20], [52, -174, 10]], hillH: 6, hillW: 8, bumps: [] },
  { id: 'o6', lumps: [[178, -92, 24]], hillH: 8, hillW: 10, bumps: [[182, -94, 10, 5]] },
  { id: 'o7', lumps: [[192, 40, 26], [171, 64, 14]], hillH: 9, hillW: 11, bumps: [[196, 38, 12, 7]] },
  { id: 'o8', lumps: [[132, 152, 22]], hillH: 7, hillW: 9, bumps: [] },
  { id: 'o9', lumps: [[-42, 186, 18]], hillH: 3, hillW: 7, bumps: [] },
  { id: 'o10', lumps: [[66, 204, 16]], hillH: 2.5, hillW: 6, bumps: [] },
];
for (const o of OUTER) Object.assign(o, { beach: 5, trees: 0.0042, palms: 3, res: 1.8, far: true, boats: [] });

// A loose ring of rocks and palm islets just outside the playable edge.
const RING = [
  [8, 152, 4, 'palm'], [36, 156, 3, 'rock'], [62, 150, 4.5, 'palm'], [92, 157, 3.5, 'rock'],
  [122, 151, 4, 'palm'], [150, 158, 3, 'rock'], [178, 152, 4.5, 'palm'], [205, 156, 3.5, 'rock'],
  [232, 150, 4, 'palm'], [258, 157, 3, 'rock'], [284, 152, 4, 'rock'], [310, 156, 4.5, 'palm'],
  [337, 151, 3.5, 'rock'],
].map(([deg, rad, r, kind]) => {
  const a = (deg * Math.PI) / 180;
  return { x: Math.cos(a) * rad, z: Math.sin(a) * rad, r, kind };
});

// Sea stacks inside the arena: a Tanah-Lot-style sea temple rock and a pair of stacks.
// [x, z, waterline radius, height, kind]
const SEA_ROCKS = [
  [-30, -60, 6.2, 7.5, 'temple'],
  [66, -90, 3.6, 7, 'stack'],
  [74, -84, 2.6, 5, 'stack'],
];

// Coral reefs (shallows that slow deep hulls). Every wave spawns 58-92 units from
// START and sails at the player, so the fights happen in the southern half: five
// reefs sit on the lanes between START, the spawn ring and the islands there
// (dead ahead, south-west, south-east, east, west), with clear channels of 13+
// units to the nearest land. Two more dress the lagoon in the north. Each reef
// edge is >= 15 from START and <= WORLD_R - 10 from the centre; computeSpawns
// keeps the spawns >= 8 off every reef edge.
const REEFS = [
  { x: 2, z: -62, r: 9 }, // dead ahead of START, on the lane to the northern spawns
  { x: -38, z: -96, r: 10 }, // south-west, between START and the SW islet
  { x: 40, z: -98, r: 10 }, // south-east, between START and the sea stacks
  { x: 62, z: -60, r: 9 }, // east, between the S islet, the stacks and the E islet
  { x: -57, z: -33, r: 9 }, // west, between the temple island and the SW islet
  { x: 13, z: 25, r: 10 },
  { x: -44, z: 47, r: 9 },
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
// Same polynomial smooth-min the ocean shader uses to blend shoreline circles.
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function makeNoise(seed) {
  const hash = (i, j) => {
    let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  return (x, z) => {
    const i = Math.floor(x);
    const j = Math.floor(z);
    const fx = x - i;
    const fz = z - j;
    const u = fx * fx * (3 - 2 * fx);
    const v = fz * fz * (3 - 2 * fz);
    const a = hash(i, j);
    const b = hash(i + 1, j);
    const c = hash(i, j + 1);
    const d = hash(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** Recompute normals, then average them across coincident vertices (seams), so outlines don't crack. */
function smoothNormals(geo) {
  geo.computeVertexNormals();
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * 1000)},${Math.round(p.getY(i) * 1000)},${Math.round(p.getZ(i) * 1000)}`;
    let e = map.get(k);
    if (!e) map.set(k, (e = [0, 0, 0, []]));
    e[0] += n.getX(i);
    e[1] += n.getY(i);
    e[2] += n.getZ(i);
    e[3].push(i);
  }
  for (const e of map.values()) {
    const l = Math.hypot(e[0], e[1], e[2]) || 1;
    for (const i of e[3]) n.setXYZ(i, e[0] / l, e[1] / l, e[2] / l);
  }
  n.needsUpdate = true;
  return geo;
}

function mesh(parent, geo, mat, x = 0, y = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  parent.add(m);
  return m;
}

const rbox = (w, h, d, r = 0.15) =>
  new RoundedBoxGeometry(w, h, d, Math.min(w, h, d) < 0.6 ? 1 : 2, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));

// Shared low-poly-but-round primitives (geometries are cloned by mergeStatic).
const GEO = {};
function geo(key, make) {
  return GEO[key] || (GEO[key] = make());
}
const sphere = (lo) => geo(lo ? 'sphLo' : 'sph', () => new THREE.SphereGeometry(1, lo ? 9 : 12, lo ? 6 : 7));
const tinySphere = () => geo('sphTiny', () => new THREE.SphereGeometry(1, 7, 5));
const nutSphere = () => geo('sphNut', () => new THREE.SphereGeometry(1, 6, 4));

// ---------------------------------------------------------------------------
// Materials with small shader tweaks (own instances, never the shared toon cache)
// ---------------------------------------------------------------------------
// Terrain: uv.x = distance inland past the grass line (< 0 sand, > 0 grass),
// uv.y = patch noise. Colours are picked per pixel so the grass edge is crisp
// and gets a hand-drawn ink line; sand darkens just above the waterline.
function makeTerrainMaterial() {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(3) });
  m.name = 'bali-terrain';
  setOutline(m, true);
  const U = {
    uSand: { value: new THREE.Color(C.sand) },
    uWet: { value: new THREE.Color(C.wetSand) },
    uGrass: { value: new THREE.Color(C.grass) },
    uGrass2: { value: new THREE.Color(C.grass2) },
    uInkCol: { value: new THREE.Color(0x24401c) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vZone;\nvarying float vWY;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvZone = uv;\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;',
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vZone;\nvarying float vWY;\nuniform vec3 uSand, uWet, uGrass, uGrass2, uInkCol;',
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float gz = vZone.x;
        float fw = max(fwidth(gz), 1e-4);
        float grassK = smoothstep(-fw, fw, gz);
        vec3 sandCol = mix(uWet, uSand, smoothstep(0.32, 0.42, vWY));
        float pn = vZone.y;
        float pfw = max(fwidth(pn), 1e-4);
        vec3 grassCol = mix(uGrass, uGrass2, smoothstep(0.62 - pfw, 0.62 + pfw, pn));
        vec3 tcol = mix(sandCol, grassCol, grassK);
        float ink = 1.0 - smoothstep(0.7 * fw, 1.5 * fw, abs(gz - 0.6 * fw));
        tcol = mix(tcol, uInkCol, ink * 0.9);
        vec4 diffuseColor = vec4(tcol, opacity);`,
      );
  };
  m.customProgramCacheKey = () => 'bali-terrain-v1';
  return m;
}

// Flames: uv.x = per-flame phase, uv.y = height fraction. Painted like a cartoon
// flame: a pale yellow core where the surface faces the viewer, orange body and a
// red rim/tip, licking around via a time uniform (no per-frame geometry work). No outline.
function makeFlameMaterial(timeU) {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
  m.name = 'bali-flame';
  noOutline(m);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vFl;\nvarying vec3 vFlN;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vFl = uv;
        vFlN = normalize(normalMatrix * normal);
        float fk = uv.y * uv.y;
        transformed.x += sin(uTime * 9.0 + uv.x * 6.2831) * 0.2 * fk;
        transformed.z += cos(uTime * 7.3 + uv.x * 12.7) * 0.16 * fk;
        transformed.y += (sin(uTime * 13.0 + uv.x * 21.0) * 0.5 + 0.25) * 0.28 * uv.y;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vFl;\nvarying vec3 vFlN;')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float facing = abs(normalize(vFlN).z);
        float fy = vFl.y + 0.07 * sin(uTime * 10.0 + vFl.x * 9.0);
        vec3 fcol = vec3(0.95, 0.22, 0.05);
        if (facing > 0.42 - 0.25 * fy) fcol = vec3(1.0, 0.55, 0.08);
        if (facing > 0.78 - 0.1 * fy && fy < 0.62) fcol = vec3(1.0, 0.93, 0.5);
        vec4 diffuseColor = vec4(fcol, opacity);`,
      );
  };
  m.customProgramCacheKey = () => 'bali-flame-v2';
  return m;
}

// Rocks: painted per pixel from world position and normal, so every rock in
// the level shares one material (one merged mesh): wobbly horizontal strata in
// two warm tones, a dark wet band at the waterline and moss with an ink edge
// on the upward-facing ledges. uv.x = tone (0 dark .. 1 light), uv.y = moss amount.
function makeRockMaterial() {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(3) });
  m.name = 'bali-rock';
  setOutline(m, true);
  const U = {
    uRockA: { value: new THREE.Color(C.rockA) },
    uRockB: { value: new THREE.Color(C.rockB) },
    uRockWet: { value: new THREE.Color(C.rockWet) },
    uMoss: { value: new THREE.Color(C.grass) },
    uMoss2: { value: new THREE.Color(C.grass2) },
    uMossInk: { value: new THREE.Color(0x24401c) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRW;\nvarying vec3 vRN;\nvarying vec2 vRT;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vRW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vRN = mat3(modelMatrix) * objectNormal;
        vRT = uv;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vRW;
        varying vec3 vRN;
        varying vec2 vRT;
        uniform vec3 uRockA, uRockB, uRockWet, uMoss, uMoss2, uMossInk;`,
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec3 rn = normalize(vRN);
        // strata: a triangle wave over a wobbly height gives two crisp edges per layer
        float sy = (vRW.y + 0.35 * sin(vRW.x * 0.8 + vRW.z * 0.35) + 0.22 * sin(vRW.z * 1.25 - vRW.x * 0.4)) / 1.35;
        float tri = abs(fract(sy) - 0.5) * 2.0;
        float sfw = max(fwidth(sy) * 2.0, 1e-4);
        vec3 rc = mix(uRockA, uRockB, smoothstep(0.5 - sfw, 0.5 + sfw, tri));
        rc *= mix(0.8, 1.1, vRT.x);
        // wet rock just above the waterline
        float wfw = max(fwidth(vRW.y), 1e-4);
        rc = mix(rc, uRockWet, (1.0 - smoothstep(0.55 - wfw, 0.55 + wfw, vRW.y + 0.12 * sin(vRW.x * 2.1 + vRW.z * 1.7))) * 0.85);
        // moss on ledges (top-facing), with a hand-inked edge
        float mn = rn.y + 0.16 * sin(vRW.x * 1.9) * sin(vRW.z * 2.3) - (1.0 - vRT.y) * 0.65 - (1.0 - smoothstep(0.9, 1.6, vRW.y)) * 2.0;
        float mfw = max(fwidth(mn), 1e-4);
        float moss = smoothstep(0.55 - mfw, 0.55 + mfw, mn);
        vec3 mc = mix(uMoss2, uMoss, step(0.0, sin(vRW.x * 0.9 + 1.3) * sin(vRW.z * 0.8)));
        rc = mix(rc, mc, moss);
        float mink = 1.0 - smoothstep(0.6 * mfw, 1.5 * mfw, abs(mn - 0.55 + 0.6 * mfw));
        rc = mix(rc, uMossInk, mink * 0.9 * step(0.01, vRT.y));
        vec4 diffuseColor = vec4(rc, opacity);`,
      );
  };
  m.customProgramCacheKey = () => 'bali-rock-v1';
  return m;
}

/** Tag a rock geometry with its tone and moss amount (read by the rock material through uv). */
function rockTag(g, tone, moss) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, tone, moss);
  return g;
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------
function islandSampler(isl, noise) {
  const { lumps, beach, hillH, hillW } = isl;
  const bumps = isl.bumps || [];
  const flats = isl.flats || [];
  const beachTop = isl.far ? 1.2 : 1.05;
  const seed = lumps[0][0] * 0.37 + lumps[0][1] * 0.11;
  return (x, z) => {
    let sd = 1e4;
    for (const L of lumps) sd = smin(sd, Math.hypot(x - L[0], z - L[1]) - L[2], 4);
    const u = -sd;
    const bw = beach + (noise(x * 0.11 + seed, z * 0.11) - 0.5) * 2.4;
    const g = u - bw;
    let h;
    if (u <= 0) h = -Math.min(3.2, 0.42 * sd + 0.06 * sd * sd);
    else h = beachTop * (1 - Math.exp(-u * 0.4));
    if (g > 0) {
      let flat = 0;
      for (const f of flats) flat = Math.max(flat, 1 - smooth(f[2] * 0.7, f[2], Math.hypot(x - f[0], z - f[1])));
      h += 0.32 * smooth(0, 0.6, g);
      const k = Math.min(g / hillW, 1);
      h += hillH * (1 - Math.pow(1 - k, 2.6));
      const inl = smooth(0, 3.5, g) * (1 - flat);
      for (const b of bumps) {
        const d = Math.hypot(x - b[0], z - b[1]) / b[2];
        if (d < 1) h += b[3] * (1 - d * d) * (1 - d * d) * inl;
      }
      h += (noise(x * 0.17 + 40, z * 0.17) - 0.45) * 0.9 * inl;
    }
    return [h, g, sd];
  };
}

function buildTerrainGeometry(isl, sample, noise) {
  const res = isl.res;
  const pad = 7;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [x, z, r] of isl.lumps) {
    x0 = Math.min(x0, x - r - pad);
    x1 = Math.max(x1, x + r + pad);
    z0 = Math.min(z0, z - r - pad);
    z1 = Math.max(z1, z + r + pad);
  }
  const nx = Math.ceil((x1 - x0) / res);
  const nz = Math.ceil((z1 - z0) / res);
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
  const uv = new Float32Array((nx + 1) * (nz + 1) * 2);
  const hs = new Float32Array((nx + 1) * (nz + 1));
  let k = 0;
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      const x = x0 + i * res;
      const z = z0 + j * res;
      const [h, g] = sample(x, z);
      pos[k * 3] = x;
      pos[k * 3 + 1] = h;
      pos[k * 3 + 2] = z;
      uv[k * 2] = g;
      uv[k * 2 + 1] = noise(x * 0.085 + 11, z * 0.085 - 7);
      hs[k] = h;
      k++;
    }
  }
  const index = [];
  const id = (i, j) => i * (nz + 1) + j;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const a = id(i, j);
      const b = id(i, j + 1);
      const c = id(i + 1, j);
      const d = id(i + 1, j + 1);
      if (Math.max(hs[a], hs[b], hs[c], hs[d]) < -1.3) continue;
      index.push(a, b, c, c, b, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function gradSd(isl, x, z) {
  const sd = (px, pz) => {
    let d = 1e4;
    for (const L of isl.lumps) d = smin(d, Math.hypot(px - L[0], pz - L[1]) - L[2], 4);
    return d;
  };
  const e = 0.5;
  const gx = sd(x + e, z) - sd(x - e, z);
  const gz = sd(x, z + e) - sd(x, z - e);
  const l = Math.hypot(gx, gz) || 1;
  return [gx / l, gz / l];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
function addTree(parent, x, y, z, s, rng, lo) {
  const trunkH = 1.6 * s;
  const trunk = geo('treeTrunk', () => new THREE.CylinderGeometry(0.26, 0.36, 1, 8));
  const t = mesh(parent, trunk, toon(C.trunk), x, y + trunkH / 2 - 0.3, z);
  t.scale.set(s, trunkH + 0.3, s);
  const sph = sphere(lo);
  const ci = Math.floor(rng() * 3);
  const main = mesh(parent, sph, toon(C.canopy[ci]), x, y + trunkH + s * 1.1, z, rng() * 6);
  main.scale.set(1.55 * s, 1.35 * s, 1.55 * s);
  const n = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const r = (0.6 + rng() * 0.25) * s;
    const b = mesh(parent, sphere(true), toon(C.canopy[(ci + 1 + i) % 3]), x + Math.cos(a) * 1.1 * s, y + trunkH + s * (0.55 + rng() * 0.9), z + Math.sin(a) * 1.1 * s);
    b.scale.set(r * 1.6, r * 1.4, r * 1.6);
  }
}

function tubeAlong(points, radiusFn, radial = 8) {
  // A tube with a varying radius along a polyline of THREE.Vector3 (smooth normals, closed seam).
  const pos = [];
  const index = [];
  const n = points.length;
  let prevN = null;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const tan = points[Math.min(n - 1, i + 1)].clone().sub(points[Math.max(0, i - 1)]).normalize();
    let nrm;
    if (!prevN) {
      nrm = Math.abs(tan.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      nrm = nrm.sub(tan.clone().multiplyScalar(nrm.dot(tan))).normalize();
    } else {
      nrm = prevN.clone().sub(tan.clone().multiplyScalar(prevN.dot(tan))).normalize();
    }
    prevN = nrm;
    const bin = new THREE.Vector3().crossVectors(tan, nrm);
    const r = radiusFn(i / (n - 1));
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(p.x + (nrm.x * c + bin.x * s) * r, p.y + (nrm.y * c + bin.y * s) * r, p.z + (nrm.z * c + bin.z * s) * r);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k;
      const b = i * radial + ((k + 1) % radial);
      const c = (i + 1) * radial + k;
      const d = (i + 1) * radial + ((k + 1) % radial);
      index.push(a, b, c, b, d, c);
    }
  }
  // caps
  const base = pos.length / 3;
  pos.push(points[0].x, points[0].y, points[0].z, points[n - 1].x, points[n - 1].y, points[n - 1].z);
  for (let k = 0; k < radial; k++) {
    index.push(base, (k + 1) % radial, k);
    index.push(base + 1, (n - 1) * radial + k, (n - 1) * radial + ((k + 1) % radial));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function frondGeometry() {
  return geo('frond', () => {
    const g = new THREE.SphereGeometry(1, 10, 3);
    g.scale(0.5, 0.12, 1.75);
    g.translate(0, 0, 1.65);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      const x = p.getX(i);
      // V-fold along the midrib, arch up then droop, and taper to a point
      p.setY(i, p.getY(i) + 0.42 * Math.abs(x) + 0.42 * z - 0.2 * z * z);
      p.setX(i, x * (1 - 0.3 * Math.max(0, z - 1.4)));
    }
    return smoothNormals(g);
  });
}

function addPalm(parent, x, y, z, dirX, dirZ, s, rng, lo) {
  const H = (5.2 + rng() * 2.4) * s;
  const lean = (1.4 + rng() * 2.2) * s;
  const pts = [];
  const N = lo ? 7 : 11;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const off = lean * Math.pow(t, 1.7);
    pts.push(new THREE.Vector3(x + dirX * off, y - 0.4 + (H + 0.4) * t, z + dirZ * off));
  }
  const trunkGeo = tubeAlong(pts, (t) => (0.36 - 0.13 * t) * s * (1 + 0.12 * Math.max(0, Math.sin(t * Math.PI * 9))), lo ? 6 : 7);
  mesh(parent, trunkGeo, toon(C.palmTrunk));
  const top = pts[N];
  const frond = frondGeometry();
  const nF = lo ? 5 : 8;
  const a0 = rng() * 6;
  for (let i = 0; i < nF; i++) {
    const m = mesh(parent, frond, toon(C.frond[i % 2]), top.x, top.y, top.z);
    m.rotation.order = 'YXZ';
    m.rotation.y = a0 + (i / nF) * Math.PI * 2 + (rng() - 0.5) * 0.4;
    m.rotation.x = -0.1 + (rng() - 0.5) * 0.3;
    m.scale.setScalar(s * (0.95 + rng() * 0.2));
  }
  const tuft = mesh(parent, tinySphere(), toon(C.frond[0]), top.x, top.y + 0.15 * s, top.z);
  tuft.scale.set(0.55 * s, 0.4 * s, 0.55 * s);
  if (!lo) {
    for (let i = 0; i < 2; i++) {
      const a = a0 + i * 2.6;
      const c = mesh(parent, nutSphere(), toon(C.coconut), top.x + Math.cos(a) * 0.38 * s, top.y - 0.35 * s, top.z + Math.sin(a) * 0.38 * s);
      c.scale.setScalar(0.3 * s);
    }
  }
}

function roofGeometry() {
  // Flared, concave thatch roof on a rounded-square ("squircle") plan, unit size.
  return geo('roof', () => {
    const prof = [
      [0.0, -0.07], [0.45, -0.07], [0.94, -0.12], [1.02, -0.07], [1.0, 0.0], [0.82, 0.08],
      [0.6, 0.22], [0.38, 0.42], [0.2, 0.58], [0.08, 0.66], [0.0, 0.68],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(prof, 16);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const a = Math.atan2(z, x);
      const f = 1 / Math.pow(Math.pow(Math.abs(Math.cos(a)), 4) + Math.pow(Math.abs(Math.sin(a)), 4), 0.25);
      p.setX(i, x * f);
      p.setZ(i, z * f);
    }
    g.deleteAttribute('normal');
    return smoothNormals(g);
  });
}

function addMeru(parent, x, y, z, ry, tiers, s) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.scale.setScalar(s);
  parent.add(g);
  mesh(g, rbox(4.6, 2.2, 4.6, 0.2), toon(C.stone), 0, -0.6, 0);
  mesh(g, rbox(4.0, 1.4, 4.0, 0.15), toon(C.brick), 0, 1.15, 0);
  mesh(g, rbox(4.5, 0.32, 4.5, 0.12), toon(C.stoneLight), 0, 1.95, 0);
  // little stair on the front
  for (let i = 0; i < 3; i++) mesh(g, rbox(1.4, 0.4, 0.6, 0.1), toon(C.stoneLight), 0, 0.25 + i * 0.45, 2.55 - i * 0.35);
  // shrine room
  mesh(g, rbox(2.6, 1.7, 2.6, 0.18), toon(C.wood), 0, 2.95, 0);
  mesh(g, rbox(1.0, 1.25, 0.25, 0.08), toon(C.gold), 0, 2.85, 1.27);
  const postGeo = geo('meruPost', () => new THREE.CylinderGeometry(0.42, 0.42, 1, 10));
  const roof = roofGeometry();
  const gap = 0.92;
  const y0 = 3.95;
  const post = mesh(g, postGeo, toon(C.woodDark), 0, y0 + (tiers * gap) / 2, 0);
  post.scale.set(1, tiers * gap + 0.2, 1);
  for (let i = 0; i < tiers; i++) {
    const k = tiers === 1 ? 0 : i / (tiers - 1);
    const w = lerp(2.55, 0.95, Math.pow(k, 0.9));
    const r = mesh(g, roof, toon(C.thatch), 0, y0 + i * gap, 0);
    r.scale.set(w, 1.15, w);
  }
  const top = y0 + (tiers - 1) * gap + 0.8;
  const fin = mesh(g, sphere(true), toon(C.gold), 0, top, 0);
  fin.scale.setScalar(0.32);
  mesh(g, geo('spike', () => new THREE.ConeGeometry(0.2, 0.9, 10)), toon(C.gold), 0, top + 0.55, 0);
  return y0 + tiers * gap + 1.2;
}

function addCandiBentar(parent, x, y, z, ry, s) {
  // Split gate: two mirrored stepped towers, the inner faces sheer like a cut.
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.scale.setScalar(s);
  parent.add(g);
  const gap = 2.6;
  const tiers = [
    [3.3, 2.0, 3.4, C.stone],
    [2.9, 2.1, 2.8, C.brick],
    [3.15, 0.36, 3.0, C.stoneLight],
    [2.45, 1.6, 2.35, C.brick],
    [2.7, 0.32, 2.55, C.stoneLight],
    [1.95, 1.3, 1.85, C.brick],
    [2.2, 0.3, 2.05, C.stoneLight],
    [1.4, 1.0, 1.35, C.brick],
    [1.6, 0.28, 1.5, C.stoneLight],
    [0.9, 0.75, 0.9, C.stone],
  ];
  for (const side of [-1, 1]) {
    let yy = -0.9;
    for (const [w, h, d, col] of tiers) {
      mesh(g, rbox(w, h, d, Math.min(0.16, h * 0.4)), toon(col), side * (gap / 2 + w / 2), yy + h / 2, 0);
      yy += h;
    }
    // crown finial and side "wing" ornaments
    const fin = mesh(g, sphere(true), toon(C.stone), side * (gap / 2 + 0.45), yy + 0.25, 0);
    fin.scale.set(0.4, 0.5, 0.4);
    mesh(g, geo('spikeS', () => new THREE.ConeGeometry(0.22, 0.8, 10)), toon(C.gold), side * (gap / 2 + 0.45), yy + 0.85, 0);
    for (const [ty, w] of [[1.25, 2.9], [3.3, 2.45], [5.0, 1.95]]) {
      const orn = mesh(g, sphere(true), toon(C.stoneLight), side * (gap / 2 + w + 0.05), ty, 0);
      orn.scale.set(0.32, 0.5, 0.75);
    }
    // gold ornament on the face of each tower
    const gem = mesh(g, sphere(true), toon(C.gold), side * (gap / 2 + 1.25), 2.35, 1.42);
    gem.scale.set(0.38, 0.38, 0.14);
    // enclosure wall running sideways and back
    const wx = side * (gap / 2 + 3.3 + 2.0);
    mesh(g, rbox(4.0, 1.7, 0.9, 0.2), toon(C.brick), wx, 0.0, -0.3);
    mesh(g, rbox(4.3, 0.32, 1.15, 0.12), toon(C.stoneLight), wx, 0.95, -0.3);
    const bx = side * (gap / 2 + 3.3 + 4.0);
    mesh(g, rbox(0.9, 1.7, 8.5, 0.2), toon(C.brick), bx, 0.0, -4.6);
    mesh(g, rbox(1.15, 0.32, 8.8, 0.12), toon(C.stoneLight), bx, 0.95, -4.6);
    mesh(g, rbox(1.3, 2.4, 1.3, 0.2), toon(C.stone), bx, 0.3, -0.3);
    const cap = mesh(g, sphere(true), toon(C.stoneLight), bx, 1.75, -0.3);
    cap.scale.set(0.55, 0.45, 0.55);
  }
  // stairs leading up through the gap
  for (let i = 0; i < 4; i++) mesh(g, rbox(gap - 0.2, 0.42, 1.0, 0.1), toon(C.stoneLight), 0, -0.55 + i * 0.36, 2.4 - i * 0.62);
}

function addTorch(parent, x, y, z, phase, flameMat, s = 1) {
  const pole = geo('torchPole', () => new THREE.CylinderGeometry(0.15, 0.19, 1, 8));
  const p = mesh(parent, pole, toon(C.bamboo), x, y + 1.35 * s, z);
  p.scale.set(s, 3.3 * s, s);
  for (const yy of [1.0, 2.1]) {
    const b = mesh(parent, geo('torchBand', () => new THREE.CylinderGeometry(0.23, 0.23, 0.16, 8)), toon(C.torchHead), x, y + yy * s, z);
    b.scale.setScalar(s);
  }
  const cup = geo('torchCup', () => new THREE.LatheGeometry([[0, 0], [0.18, 0], [0.4, 0.5], [0.33, 0.56], [0, 0.5]].map(([a, b]) => new THREE.Vector2(a, b)), 10));
  const c = mesh(parent, cup, toon(C.torchHead), x, y + 2.95 * s, z);
  c.scale.setScalar(s);
  const tongues = [
    [0, 0, 0, 1.05, 0],
    [0.17, 0.05, 0.4, 0.55, 0.33],
  ];
  for (const [ox, oy, tilt, k, dph] of tongues) {
    const fl = flameGeometry(phase + dph);
    const f = mesh(parent, fl, flameMat, x + ox * s, y + (3.3 + oy) * s, z + ox * 0.4 * s);
    f.rotation.z = tilt * 0.5;
    f.scale.setScalar(s * k);
  }
}

function flameGeometry(phase) {
  const prof = [[0, 0], [0.3, 0.1], [0.44, 0.32], [0.4, 0.62], [0.27, 0.95], [0.13, 1.25], [0.04, 1.5], [0, 1.58]];
  const g = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 10);
  const uv = g.attributes.uv;
  const p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, phase % 1, p.getY(i) / 1.58);
  return g;
}

function addUmbrella(parent, x, y, z, s) {
  const pole = mesh(parent, geo('umbPole', () => new THREE.CylinderGeometry(0.12, 0.14, 1, 8)), toon(C.wood), x, y + 2.1 * s, z);
  pole.scale.set(s, 4.6 * s, s);
  const dome = geo('umbDome', () => new THREE.LatheGeometry([[0, -0.05], [1.5, -0.05], [1.52, 0.02], [1.2, 0.3], [0.6, 0.52], [0, 0.6]].map(([a, b]) => new THREE.Vector2(a, b)), 16));
  const d = mesh(parent, dome, toon(C.umbrella), x, y + 4.3 * s, z);
  d.scale.setScalar(s);
  const frill = geo('umbFrill', () => new THREE.LatheGeometry([[1.36, -0.5], [1.5, -0.5], [1.56, -0.02], [1.4, 0.0]].map(([a, b]) => new THREE.Vector2(a, b)), 16));
  const f = mesh(parent, frill, toon(C.frill), x, y + 4.3 * s, z);
  f.scale.setScalar(s);
  const knob = mesh(parent, sphere(true), toon(C.gold), x, y + 5.0 * s, z);
  knob.scale.setScalar(0.22 * s);
}

function addPenjor(parent, x, y, z, ax, az, s) {
  // Tall bamboo pole arching over (ax, az) with a hanging ornament.
  const pts = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const out = 3.6 * Math.pow(t, 2.2);
    const up = 8.2 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5) - 1.3 * Math.max(0, t - 0.75) * 4;
    pts.push(new THREE.Vector3(x + ax * out * s, y - 0.3 + up * s, z + az * out * s));
  }
  mesh(parent, tubeAlong(pts, (t) => (0.2 - 0.08 * t) * s, 7), toon(C.bamboo));
  const tip = pts[N];
  const orn = geo('penjorOrn', () =>
    new THREE.LatheGeometry([[0, -1.3], [0.22, -1.0], [0.42, -0.5], [0.3, -0.1], [0, 0]].map(([a, b]) => new THREE.Vector2(a, b)), 10),
  );
  const o = mesh(parent, orn, toon(C.frill), tip.x, tip.y, tip.z);
  o.scale.setScalar(s);
  for (let i = 4; i < N; i += 3) {
    const b = mesh(parent, sphere(true), toon(C.umbrella), pts[i].x, pts[i].y - 0.25 * s, pts[i].z);
    b.scale.set(0.2 * s, 0.32 * s, 0.2 * s);
  }
  const base = mesh(parent, sphere(true), toon(C.woodDark), x, y, z);
  base.scale.set(0.5 * s, 0.35 * s, 0.5 * s);
}

function addJukung(parent, x, y, z, ry, pitch, rng) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.order = 'YXZ';
  g.rotation.set(-pitch, ry, 0);
  parent.add(g);
  const stripe = C.hullStripe[Math.floor(rng() * C.hullStripe.length)];
  const hull = mesh(g, sphere(), toon(C.hull), 0, 0.42, 0);
  hull.scale.set(0.62, 0.5, 3.0);
  const band = mesh(g, sphere(), toon(stripe), 0, 0.62, 0);
  band.scale.set(0.66, 0.2, 3.04);
  // upswept "swordfish" beak and tail
  const beakGeo = geo('beak', () => new THREE.ConeGeometry(0.22, 1.9, 10));
  const beak = mesh(g, beakGeo, toon(stripe), 0, 1.05, 3.05);
  beak.rotation.x = 1.05;
  const tail = mesh(g, beakGeo, toon(stripe), 0, 1.0, -2.95);
  tail.rotation.x = -1.2;
  tail.scale.set(0.8, 0.6, 0.8);
  for (const side of [-1, 1]) {
    const eye = mesh(g, sphere(true), toon(0xffffff), side * 0.42, 0.72, 2.15);
    eye.scale.set(0.1, 0.17, 0.17);
    const pup = mesh(g, sphere(true), toon(0x1a1a22), side * 0.5, 0.72, 2.2);
    pup.scale.set(0.06, 0.1, 0.1);
    // outrigger float
    const fl = mesh(g, geo('float', () => new THREE.CapsuleGeometry(0.17, 4.2, 4, 8)), toon(C.bamboo), side * 2.1, 0.22, 0.1);
    fl.rotation.x = Math.PI / 2;
  }
  // arched booms to the outriggers
  for (const bz of [-1.2, 1.3]) {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const xx = lerp(-2.1, 2.1, t);
      pts.push(new THREE.Vector3(xx, 0.25 + 0.9 * (1 - (xx / 2.1) * (xx / 2.1)), bz));
    }
    mesh(g, tubeAlong(pts, () => 0.11, 6), toon(C.boom));
  }
  // mast lying across with a furled sail
  const mast = mesh(g, geo('jmast', () => new THREE.CapsuleGeometry(0.1, 3.4, 4, 6)), toon(C.boom), 0.15, 1.0, -0.2);
  mast.rotation.set(Math.PI / 2, 0, 0.12);
  const sail = mesh(g, geo('jsail', () => new THREE.CapsuleGeometry(0.22, 2.4, 4, 8)), toon(C.sail), 0.25, 1.22, -0.2);
  sail.rotation.set(Math.PI / 2, 0, 0.12);
}

function addSeaRock(parent, x, z, r, h, kind, rng, mats, nextPhase) {
  // waterline radius r: a bumpy dome whose cross-section at y = 0 is about r wide
  const { rock: rockMat, flame: flameMat } = mats;
  const bodyH = h * 0.62 + 1.2;
  const base = mesh(parent, rockTag(bumpyRock(rng, false), kind === 'temple' ? 0.6 : 0.45, 1), rockMat, x, -1.2, z, rng() * 6);
  base.scale.set(r * 1.02, bodyH, r * 1.02);
  const topY = -1.2 + bodyH * 0.86;
  const upper = mesh(parent, rockTag(bumpyRock(rng, false), 0.9, kind === 'temple' ? 0.72 : 0.9), rockMat, x + 0.3, topY - 0.4, z - 0.2, rng() * 6);
  upper.scale.set(r * 0.72, h * 0.42, r * 0.72);
  const capY = topY - 0.4 + h * 0.42 * 0.78;
  const cap = mesh(parent, sphere(), toon(C.grass), x + 0.3, capY, z - 0.2);
  cap.scale.set(r * 0.62, 0.9, r * 0.62);
  const groundY = capY + 0.55;
  // the front faces the player's start
  let fx = START.x - x;
  let fz = START.z - z;
  const fl = Math.hypot(fx, fz);
  fx /= fl;
  fz /= fl;
  const lx = -fz;
  const lz = fx;
  const at = (a, b) => [x + 0.3 + fx * a + lx * b, z - 0.2 + fz * a + lz * b];
  if (kind === 'temple') {
    // a stair carved into the rock, spiralling up to the shrine on the summit
    base.updateMatrixWorld();
    upper.updateMatrixWorld();
    cap.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    ray.far = 40;
    const o = new THREE.Vector3();
    const d = new THREE.Vector3();
    const thEnd = Math.atan2(fz, fx) + 0.25;
    const y0 = 0.3;
    const y1 = groundY - 0.35;
    const n = Math.max(4, Math.round((y1 - y0) / 0.44));
    const stepGeo = geo('rockStep', () => rbox(1.5, 0.46, 0.95, 0.14));
    for (let i = 0; i <= n; i++) {
      const y = lerp(y0, y1, i / n);
      const th = thEnd - (n - i) * 0.13;
      d.set(-Math.cos(th), 0, -Math.sin(th));
      o.set(x + 0.15 + Math.cos(th) * 30, y + 0.1, z - 0.1 + Math.sin(th) * 30);
      ray.set(o, d);
      const hit = ray.intersectObjects([base, upper, cap], false)[0];
      if (!hit) continue;
      const rr = Math.hypot(hit.point.x - x - 0.15, hit.point.z - z + 0.1) - 0.12;
      mesh(parent, stepGeo, toon(C.path), x + 0.15 + Math.cos(th) * rr, y - 0.1, z - 0.1 + Math.sin(th) * rr, -th);
    }
    const [mx, mz] = at(-0.6, 0);
    addMeru(parent, mx, groundY - 0.1, mz, Math.atan2(fx, fz), 5, 0.66);
    {
      const [tx, tz] = at(-r * 0.32, r * 0.36);
      addTree(parent, tx, groundY - 0.3, tz, 0.75, rng, false);
    }
    {
      const [tx, tz] = at(-r * 0.2, -r * 0.42);
      addTree(parent, tx, groundY - 0.3, tz, 0.65, rng, false);
    }
    {
      const [px, pz] = at(r * 0.12, r * 0.42);
      addPalm(parent, px, groundY - 0.2, pz, lx * 0.8 + fx * 0.3, lz * 0.8 + fz * 0.3, 0.8, rng, false);
    }
    // bushes spilling over the rim
    for (const [a, b, s] of [[r * 0.2, -r * 0.5, 0.8], [-r * 0.45, -r * 0.1, 0.95]]) {
      const [bx, bz] = at(a, b);
      const bush = mesh(parent, sphere(true), toon(C.canopy[1]), bx, groundY - 0.55, bz);
      bush.scale.set(1.1 * s, 0.75 * s, 1.1 * s);
    }
    const tth = thEnd + 0.06;
    for (const side of [-1, 1]) {
      const th2 = tth + side * 0.3;
      const rr = r * 0.5;
      addTorch(parent, x + 0.15 + Math.cos(th2) * rr, groundY - 0.25, z - 0.1 + Math.sin(th2) * rr, nextPhase(), flameMat, 0.6);
    }
  } else {
    addTree(parent, x + 0.2, groundY - 0.3, z, 0.6 + r * 0.06, rng, false);
    if (r > 3) addPalm(parent, x - 0.6, groundY - 0.2, z + 0.4, -0.7, 0.7, 0.8, rng, false);
  }
}

function bumpyRock(rng, lo) {
  const g = new THREE.SphereGeometry(1, lo ? 9 : 12, lo ? 7 : 9);
  const p = g.attributes.position;
  const a = rng() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const f = 1 + 0.16 * Math.sin(x * 2.3 + a) * Math.cos(z * 2.1 + a) + 0.08 * Math.sin(y * 3.1 + a * 2);
    p.setXYZ(i, x * f, y * f, z * f);
  }
  return smoothNormals(g);
}

const CORAL_KINDS = ['brain', 'fan', 'stag', 'tube'];

function coralFanGeometry() {
  // an upright half-disc with a frilly edge, extruded thin and smooth-shaded
  return geo('coralFan', () => {
    const sh = new THREE.Shape();
    const N = 16;
    sh.moveTo(0.12, 0);
    for (let i = 0; i <= N; i++) {
      const th = lerp(0.18, Math.PI - 0.18, i / N);
      const r = i % 2 ? 0.9 : 1.04;
      sh.lineTo(Math.cos(th) * r, 0.1 + Math.sin(th) * r);
    }
    sh.lineTo(-0.12, 0);
    sh.lineTo(0.12, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1, curveSegments: 2 });
    g.translate(0, 0, -0.04);
    g.deleteAttribute('normal');
    return smoothNormals(g);
  });
}

// Ships sail right over the reefs, so the coral there stays low: nothing rises above
// CORAL_TOP (a deck sits at hull + 1.2 and the hull rides the swell within +-0.48,
// so the lowest a deck gets is ~0.7). The heads break the surface in the wave
// troughs and are washed over at the crests. Tall coral (tall = true) only grows
// where ships can't reach, out on the barrier reef.
const CORAL_TOP = 0.45;
const _coralBox = new THREE.Box3();

function addCoral(parent, x, z, rng, kind, tall = false) {
  const col = C.coral[Math.floor(rng() * C.coral.length)];
  const g = new THREE.Group(); // one coral head, lowered as a whole if it pokes up too far
  parent.add(g);
  const base = tall ? -1.4 : -1.1;
  if (kind === 'brain') {
    // brain coral: a lumpy little cluster of domes (broad and flat on the reef)
    const r = tall ? 0.75 + rng() * 0.4 : 0.85 + rng() * 0.4;
    const fl = tall ? 0.75 : 0.55;
    const m = mesh(g, bumpyRock(rng, true), toon(col), x, base + 1.0 + r * 0.25, z);
    m.scale.set(r, r * fl, r);
    for (let i = 0; i < 2; i++) {
      const a = rng() * Math.PI * 2;
      const rr = r * (0.5 + rng() * 0.2);
      const b = mesh(g, bumpyRock(rng, true), toon(col), x + Math.cos(a) * r * 0.8, base + 0.9 + rr * 0.2, z + Math.sin(a) * r * 0.8);
      b.scale.set(rr, rr * fl, rr);
    }
  } else if (kind === 'fan') {
    // sea fan: a frilly half-disc on a short stalk
    const s = tall ? 1.0 + rng() * 0.3 : 0.85 + rng() * 0.3;
    const fan = mesh(g, coralFanGeometry(), toon(col), x, -0.35, z, rng() * Math.PI);
    fan.scale.set(s, s, 1);
    const st = mesh(g, geo('fanStalk', () => new THREE.CylinderGeometry(0.12, 0.2, 1, 6)), toon(col), x, -0.8, z);
    st.scale.set(1, 1.2, 1);
  } else if (kind === 'stag') {
    // staghorn: branches fanning up (and out, on the reef flats)
    const n = 3 + Math.floor(rng() * 3);
    const br = geo('coralBranch', () => new THREE.CapsuleGeometry(0.27, 1.2, 3, 7));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng();
      const tilt = tall ? 0.25 + rng() * 0.4 : 0.55 + rng() * 0.4;
      const len = tall ? 0.85 + rng() * 0.45 : 0.75 + rng() * 0.3;
      const m = mesh(g, br, toon(col), x + Math.cos(a) * 0.5, base + 1.3 + len * 0.25, z + Math.sin(a) * 0.5);
      m.rotation.order = 'YXZ';
      m.rotation.y = -a + Math.PI / 2;
      m.rotation.x = tilt;
      m.scale.set(1, len * 1.25, 1);
    }
  } else {
    // tube sponges: flared tubes with dark mouths
    const n = 3 + Math.floor(rng() * 2);
    const tube = geo('coralTube', () =>
      new THREE.LatheGeometry([[0.3, 0.3], [0.32, 0.5], [0.37, 0.88], [0.47, 0.99], [0.42, 1.03], [0.3, 0.98], [0.26, 0.9]].map(([a, b]) => new THREE.Vector2(a, b)), 8),
    );
    const mouth = geo('coralMouth', () => new THREE.CircleGeometry(0.28, 8).rotateX(-Math.PI / 2));
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const d = i === 0 ? 0 : 0.55 + rng() * 0.3;
      const h = tall ? (i === 0 ? 2.6 : 2.0) + rng() * 0.6 : (i === 0 ? 1.45 : 1.15) + rng() * 0.25;
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      const m = mesh(g, tube, toon(col), px, base, pz);
      m.scale.set(1, h, 1);
      mesh(g, mouth, toon(0x4a2140, { outline: false }), px, base + h * 0.9 + 0.01, pz);
    }
  }
  if (!tall) {
    // keep the whole head under the cap (a little lower at random, so the tops vary)
    g.updateMatrixWorld(true);
    const top = _coralBox.setFromObject(g, true).max.y;
    const cap = CORAL_TOP - rng() * 0.15;
    if (top > cap) g.position.y -= top - cap;
  }
  return g;
}

// ---------------------------------------------------------------------------
// Rice terraces: a wavy stepped hill, colours per vertex (crisp via duplicated rings)
// ---------------------------------------------------------------------------
function buildTerraces(cx, cz, y0, R, levels, rng) {
  const SEG = 60;
  const a1 = rng() * 6.28;
  const a2 = rng() * 6.28;
  const wob = (th) => 1 + 0.1 * Math.sin(2 * th + a1) + 0.06 * Math.sin(3 * th + a2) + 0.03 * Math.sin(7 * th + a1 * 2);
  const stepH = 1.15;
  const colRiser = new THREE.Color(0x4a8a36);
  const colDike = new THREE.Color(0x8fd24c);
  const paddy = [0xbce85c, 0x9fe3ec, 0xd2e96c, 0xa8e055, 0x9fe3ec, 0xd8e46a, 0xbce85c].map((h) => new THREE.Color(h));
  // profile rows: [radiusFactor, y, colour, centreShift]
  const rows = [];
  const lean = 0.18; // terraces drift towards -z as they climb
  for (let i = 0; i < levels; i++) {
    const r0 = Math.pow(1 - i / (levels + 0.7), 0.85);
    const r1 = Math.pow(1 - (i + 1) / (levels + 0.7), 0.85);
    const yb = y0 + i * stepH;
    const yt = yb + stepH;
    const pc = paddy[i % paddy.length];
    const sh = i * lean;
    const rr = (v) => v * R;
    // extra rows near each crease keep the flats flat and the risers steep in the shading
    rows.push([rr(r0), i === 0 ? y0 - 1.2 : yb, colRiser, sh]);
    rows.push([rr(r0) - 0.01, (i === 0 ? y0 - 1.2 : yb) + 0.14, colRiser, sh]);
    rows.push([rr(r0) - 0.13, yt - 0.18, colRiser, sh]);
    rows.push([rr(r0) - 0.14, yt - 0.05, colRiser, sh]);
    rows.push([rr(r0) - 0.14, yt - 0.05, colDike, sh]);
    rows.push([rr(r0) - 0.3, yt + 0.14, colDike, sh]);
    rows.push([rr(r0) - 0.5, yt, colDike, sh]);
    rows.push([rr(r0) - 0.5, yt, pc, sh]);
    rows.push([rr(r0) - 0.62, yt, pc, sh]);
    rows.push([Math.max(rr(r1) + 0.17, 0.5), yt, pc, sh]);
    rows.push([Math.max(rr(r1) + 0.05, 0.4), yt, pc, sh]);
    if (i === levels - 1) {
      rows.push([Math.max(rr(r1) * 0.5, 0.2), yt + 0.05, pc, sh]);
      rows.push([0, yt + 0.08, pc, sh]);
    } else rows.push([Math.max(rr(r1) + 0.05, 0.4), yt, colRiser, (i + 1) * lean]);
  }
  const pos = [];
  const col = [];
  for (const [r, y, c, sh] of rows) {
    for (let k = 0; k <= SEG; k++) {
      const th = (k / SEG) * Math.PI * 2;
      const w = r * wob(th);
      pos.push(cx + Math.cos(th) * w, y, cz + Math.sin(th) * w - sh);
      col.push(c.r, c.g, c.b);
    }
  }
  const index = [];
  for (let j = 0; j < rows.length - 1; j++) {
    for (let k = 0; k < SEG; k++) {
      const a = j * (SEG + 1) + k;
      const b = a + 1;
      const c = a + SEG + 1;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);
  smoothNormals(g);
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap(3) });
  m.name = 'bali-terraces';
  setOutline(m, true);
  const me = new THREE.Mesh(g, m);
  me.userData.keep = true;
  const top = y0 + levels * stepH;
  // middle of paddy `lvl` at angle th (radius between its dike and the next riser)
  const spot = (th, lvl) => {
    const r0 = Math.pow(1 - lvl / (levels + 0.7), 0.85) * R - 0.5;
    const r1 = Math.pow(1 - (lvl + 1) / (levels + 0.7), 0.85) * R;
    const r = ((r0 + r1) / 2) * wob(th);
    return [cx + Math.cos(th) * r, y0 + (lvl + 1) * stepH, cz + Math.sin(th) * r - lvl * lean];
  };
  return { mesh: me, top, topShift: (levels - 1) * lean, spot };
}

// ---------------------------------------------------------------------------
// Distant volcano silhouettes (Mount Agung + Batur): hazy blue, outlined in a
// softer navy, not fogged, fading into haze at the foot.
// ---------------------------------------------------------------------------
function buildMountains() {
  const haze = new THREE.Color(palette.fogColor);
  const parts = [];
  const mk = (cx, cz, R, H, rTop, body, top, crater) => {
    const prof = [];
    const N = 22;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const r = R - (R - rTop) * s;
      const y = -6 + (H + 6) * Math.pow(s, 1.65);
      prof.push(new THREE.Vector2(r, y));
    }
    prof.push(new THREE.Vector2(rTop * 0.75, H - crater * 0.4), new THREE.Vector2(rTop * 0.45, H - crater), new THREE.Vector2(0, H - crater));
    const g = new THREE.LatheGeometry(prof, 44); // bottom-up profile -> outward faces
    const p = g.attributes.position;
    const cb = new THREE.Color(body);
    const ct = new THREE.Color(top);
    const cols = [];
    const tmp = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const y = p.getY(i);
      // gentle ridges so the silhouette isn't a perfect cone
      const a = Math.atan2(z, x);
      const ridge = 1 + 0.035 * Math.sin(a * 7 + 1) + 0.025 * Math.sin(a * 13 + 2);
      p.setX(i, x * ridge + cx);
      p.setZ(i, z * ridge + cz);
      const k = clamp01(y / H);
      tmp.copy(cb).lerp(ct, smooth(0.55, 0.95, k));
      tmp.lerp(haze, 1 - smooth(0.0, 0.3, k));
      cols.push(tmp.r, tmp.g, tmp.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    smoothNormals(g);
    parts.push(g);
  };
  mk(28, 410, 150, 66, 10, 0x5d79c8, 0x7f95d8, 6); // Agung
  mk(205, 352, 105, 36, 16, 0x86a0d8, 0x98b0e0, 4); // Batur
  mk(-215, 330, 120, 30, 30, 0x8fa8dc, 0x9fb5e2, 2); // a far ridge
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap(2), fog: false });
  mat.name = 'bali-mountains';
  setOutline(mat, { color: [0.05, 0.07, 0.2] });
  // painted gullies running down the upper flanks (uv.x = around, uv.y = up the profile)
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMt;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMt = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMt;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float ga = vMt.x * 6.2831853;
        float gw = sin(ga * 13.0 + 1.1 * sin(ga * 3.0) + 2.5 * vMt.y);
        float gk = smoothstep(0.48, 0.62, vMt.y) * (1.0 - smoothstep(0.83, 0.88, vMt.y));
        float th = 1.0 - 0.36 * gk * (1.25 - vMt.y);
        float gfw = max(fwidth(gw), 1e-4);
        float gully = smoothstep(th - gfw, th + gfw, gw) * step(0.01, gk);
        diffuseColor.rgb *= 1.0 - 0.16 * gully;
        // a lighter ash cap at the summit
        float afw = max(fwidth(vMt.y), 1e-4);
        float ash = smoothstep(0.8 - afw, 0.8 + afw, vMt.y + 0.015 * sin(ga * 9.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.12 + 0.04, ash);`,
      );
  };
  mat.customProgramCacheKey = () => 'bali-mountains-v2';
  const group = new THREE.Group();
  group.userData.keep = true;
  for (const g of parts) group.add(new THREE.Mesh(g, mat));
  // a lazy wisp of smoke over Agung
  const smokeMat = toon(0xe9eef8, { fog: false, outline: { color: [0.12, 0.14, 0.28] } });
  const smoke = new THREE.Group();
  smoke.position.set(28, 66, 410);
  const puffs = [
    [0, 6, 0, 9],
    [9, 15, 3, 11],
    [22, 22, 6, 12],
    [38, 27, 9, 10],
  ];
  for (const [x, y, z, r] of puffs) {
    const m = new THREE.Mesh(geo('smokeSph', () => new THREE.SphereGeometry(1, 14, 10)), smokeMat);
    m.position.set(x, y, z);
    m.scale.set(r * 1.3, r * 0.75, r);
    smoke.add(m);
  }
  group.add(smoke);
  return { group, mat, smoke, puffs: smoke.children.map((m) => ({ m, s: m.scale.clone(), p: m.position.clone() })) };
}

// ---------------------------------------------------------------------------
// Reef waves on the GPU. The reef patches must ride exactly the same swell as
// the ocean shader, so their vertex shader evaluates the same height field.
// scenery.js's WAVE_GLSL is used when it is exported; otherwise this mirror of
// its WAVES table (same constants, same rounding, same GLSL) is used, and
// checkReefWaves() verifies it against scenery.waveHeight() once.
// ---------------------------------------------------------------------------
const r6 = (v) => Number(v.toFixed(6));
const REEF_WAVES = [
  { deg: 37, len: 52, a: 0.22, ph: 0.0 },
  { deg: 117, len: 33, a: 0.16, ph: 1.3 },
  { deg: -14, len: 22, a: 0.12, ph: 2.7 },
  { deg: 233, len: 16, a: 0.1, ph: 4.1 },
].map(({ deg, len, a, ph }) => {
  const k = (2 * Math.PI) / len;
  const ang = (deg * Math.PI) / 180;
  return { kx: r6(Math.cos(ang) * k), kz: r6(Math.sin(ang) * k), w: r6(0.8 * Math.sqrt(9.8 * k)), a, ph };
});
const glslNum = (v) => {
  const s = Number(v).toFixed(6);
  return s.includes('.') ? s : s + '.0';
};
const HAS_SCENERY_WAVES = typeof scenery.WAVE_GLSL === 'string' && scenery.WAVE_GLSL.includes('float waveH(');
const REEF_WAVE_GLSL = HAS_SCENERY_WAVES
  ? scenery.WAVE_GLSL
  : `float waveH(vec2 p, float t, float amp) {
  float h = 0.0;
${REEF_WAVES.map((w) => `  h += ${glslNum(w.a)} * sin(${glslNum(w.kx)} * p.x + ${glslNum(w.kz)} * p.y - ${glslNum(w.w)} * t + ${glslNum(w.ph)});`).join('\n')}
  return h * amp;
}`;
let reefWavesChecked = false;
function checkReefWaves() {
  if (reefWavesChecked || HAS_SCENERY_WAVES) return;
  reefWavesChecked = true;
  for (const [x, z, t] of [[0, 0, 0], [13.7, -42.1, 3.3], [-97.2, 55.5, 41.9], [120.4, 8.8, 777.7], [-3.1, -131, 12345.6]]) {
    let h = 0;
    for (const w of REEF_WAVES) h += w.a * Math.sin(w.kx * x + w.kz * z - w.w * t + w.ph);
    if (Math.abs(h * 0.8 - scenery.waveHeight(x, z, t, 0.8)) > 1e-6) {
      console.error('bali.js: REEF_WAVES no longer matches scenery.js WAVES; export WAVE_GLSL from scenery.js or update the mirror');
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Reef surface: translucent shallow patches with a bright rim that ride the
// waves (displaced in the vertex shader, see REEF_WAVE_GLSL), plus small foam
// rings around the coral heads. The geometry itself is static.
// ---------------------------------------------------------------------------
function buildReefSurface(reefs, rng, coralSpots, arcs, farSpots, timeU, ampU) {
  const bx = [];
  const bz = [];
  const lift = [];
  const col = [];
  const arcA = []; // per vertex: (distance along the arc, across the band 0..1, taper); y < 0 = not an arc
  const index = [];
  const add = (x, z, c, a, l = 0, arc = null) => {
    bx.push(x);
    bz.push(z);
    lift.push(l);
    col.push(c.r, c.g, c.b, a);
    if (arc) arcA.push(arc[0], arc[1], arc[2]);
    else arcA.push(0, -1, 0);
    return bx.length - 1;
  };
  // a closed fan of rings around (x, z): rings = [[radiusFactor, colour, alpha]], R(th) = radius
  const disc = (x, z, R, rings, seg, l = 0) => {
    const c0 = add(x, z, rings[0][1], rings[0][2], l);
    let prev = null;
    for (let ri = 1; ri < rings.length; ri++) {
      const [t, c, a] = rings[ri];
      const row = [];
      for (let k = 0; k < seg; k++) {
        const th = (k / seg) * Math.PI * 2;
        const r = R(th) * t;
        row.push(add(x + Math.cos(th) * r, z + Math.sin(th) * r, c, a, l));
      }
      for (let k = 0; k < seg; k++) {
        const k1 = (k + 1) % seg;
        if (!prev) index.push(c0, row[k1], row[k]);
        else if (rings[ri][0] !== rings[ri - 1][0]) index.push(prev[k], row[k1], row[k], prev[k], prev[k1], row[k1]);
      }
      prev = row;
    }
  };
  const cIn = new THREE.Color(0x63efd9);
  const cMid = new THREE.Color(0x7af3df);
  const cRim = new THREE.Color(0xb6fbef);
  const cSand = new THREE.Color(0xc9f7d8);
  const white = new THREE.Color(0xffffff);
  // submerged coral beds painted into the shallows (the ocean is opaque, so only shapes on the surface show)
  const beds = [0x1fa8ac, 0xe07fae, 0x8f84e4, 0x1fa8ac, 0xf0ad7c].map((h) => new THREE.Color(h));
  for (const rf of reefs) {
    const a1 = rng() * 6.28;
    const a2 = rng() * 6.28;
    disc(rf.x, rf.z, (th) => rf.r * (1 + 0.06 * Math.sin(3 * th + a1) + 0.04 * Math.sin(5 * th + a2)), [
      [0.0, cSand, 0.7],
      [0.35, cIn, 0.62],
      [0.84, cMid, 0.62],
      [0.9, cRim, 0.8],
      [0.95, cRim, 0.8],
      [0.95, white, 0.92],
      [1.0, white, 0.92],
    ], 40);
    const nb = 6;
    const placed = [];
    for (let i = 0, tries = 0; i < nb && tries < 60; tries++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * rf.r * 0.62;
      const x = rf.x + Math.cos(a) * d;
      const z = rf.z + Math.sin(a) * d;
      const br = 1.1 + rng() * 1.3;
      if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < p[2] + br + 0.4)) continue;
      placed.push([x, z, br]);
      const c = beds[i % beds.length];
      const ph = rng() * 6.28;
      disc(x, z, (th) => br * (1 + 0.22 * Math.sin(3 * th + ph) + 0.1 * Math.sin(5 * th + ph * 2)), [
        [0.0, c, 0.62],
        [1.0, c, 0.62],
      ], 14, 0.01);
      i++;
    }
  }
  // barrier-reef arcs around the lagoon edge: [centre deg, half-width deg, inner r, outer r]
  // Lagoon side: pale water fading in softly. Sea side: a thick white breaker whose
  // scalloped (cloud-like) inner edge is drawn per pixel by the material (see aArc).
  for (const [deg, half, r0, r1] of arcs) {
    const span = ((half * 2 * Math.PI) / 180) * ((r0 + r1) / 2);
    const COLS = Math.max(16, Math.round(span / 1.4));
    const ph = rng() * 6.28;
    const s0 = rng() * 20;
    const ids = [];
    for (let c = 0; c <= COLS; c++) {
      const u = c / COLS;
      const a = ((deg + (u * 2 - 1) * half) * Math.PI) / 180;
      const taper = Math.pow(Math.sin(Math.PI * u), 0.45);
      const mid = (r0 + r1) / 2 + Math.sin(u * 7 + ph) * 1.2;
      const hw = ((r1 - r0) / 2) * Math.max(0.1, taper) * (1 + 0.15 * Math.sin(u * 11 + ph * 2));
      const rows = [
        [0.0, cMid, 0.0],
        [0.24, cMid, 0.6 * taper],
        [0.6, cRim, 0.82 * taper],
        [0.97, cRim, 0.6 * taper],
        [1.08, cRim, 0.0],
      ];
      const colIds = [];
      for (const [t, cc, al] of rows) {
        const r = mid + (t * 2 - 1) * hw;
        colIds.push(add(Math.cos(a) * r, Math.sin(a) * r, cc, al, 0, [s0 + u * span, t, taper]));
      }
      ids.push(colIds);
    }
    for (let c = 0; c < COLS; c++) {
      for (let k = 0; k < 4; k++) {
        const p0 = ids[c][k];
        const p1 = ids[c][k + 1];
        const q0 = ids[c + 1][k];
        const q1 = ids[c + 1][k + 1];
        // angle grows with c, radius with k: (p0, q0, p1) faces up
        index.push(p0, q0, p1, q0, q1, p1);
      }
    }
  }
  // foam collars around coral outcrops and barrier rocks that break the surface
  const collars = (spots) => {
    for (const [x, z, r] of spots) {
      const SEG = r > 1.8 ? 18 : 14;
      const inner = [];
      const outer = [];
      const ph = x * 1.7 + z;
      for (let k = 0; k < SEG; k++) {
        const th = (k / SEG) * Math.PI * 2;
        const w = 1 + 0.15 * Math.sin(th * 3 + ph);
        inner.push(add(x + Math.cos(th) * r * w, z + Math.sin(th) * r * w, white, 0.9, 0.02));
        outer.push(add(x + Math.cos(th) * (r + 0.6) * w, z + Math.sin(th) * (r + 0.6) * w, white, 0.0, 0.02));
      }
      for (let k = 0; k < SEG; k++) {
        const k1 = (k + 1) % SEG;
        index.push(inner[k], outer[k1], outer[k], inner[k], inner[k1], outer[k1]);
      }
    }
  };
  collars(farSpots);
  collars(coralSpots);
  // Static geometry: x, z in world space (the env root sits at the origin) and the
  // per-vertex lift above the swell in y. The vertex shader adds the wave height.
  const n = bx.length;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = bx[i];
    pos[i * 3 + 1] = lift[i];
    pos[i * 3 + 2] = bz[i];
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setAttribute('aArc', new THREE.Float32BufferAttribute(arcA, 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: true });
  m.name = 'bali-reef';
  noOutline(m);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU;
    sh.uniforms.uAmp = ampU;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform float uAmp;
attribute vec3 aArc;
varying vec3 vArc;
${REEF_WAVE_GLSL}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vArc = aArc;
{
  // ride the ocean swell; 0.07 clears the water, and the ocean mesh gets coarser
  // away from the camera, so lift a little more there (position.y = per-vertex lift)
  vec2 wxz = (modelMatrix * vec4(position.x, 0.0, position.z, 1.0)).xz;
  float far = abs(wxz.x - cameraPosition.x) + abs(wxz.y - cameraPosition.z);
  transformed.y = waveH(wxz, uTime, uAmp) + 0.07 + position.y + far * 0.0013;
}`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vArc;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (vArc.y > -0.5) {
          // breaker: white between a scalloped inner edge and a wavy outer edge, breathing slowly
          float sA = vArc.x;
          float lobe = pow(abs(sin(sA * 0.66)), 0.7);
          float tb = 0.66 - 0.2 * lobe * vArc.z + 0.035 * sin(uTime * 1.4 + sA * 0.21);
          float tOut = 0.94 + 0.035 * sin(sA * 0.47) * vArc.z;
          float fw = max(fwidth(vArc.y), 1e-4);
          float wk = smoothstep(tb - fw, tb + fw, vArc.y) * (1.0 - smoothstep(tOut - fw, tOut + fw, vArc.y));
          diffuseColor = mix(diffuseColor, vec4(1.0, 1.0, 1.0, 0.95), wk * smoothstep(0.08, 0.3, vArc.z));
        }`,
      );
  };
  m.customProgramCacheKey = () => (HAS_SCENERY_WAVES ? 'bali-reef-v3s' : 'bali-reef-v3');
  const me = new THREE.Mesh(g, m);
  me.userData.keep = true;
  me.frustumCulled = false; // displaced on the GPU, so the bounding sphere is only approximate
  me.renderOrder = 2;
  return { mesh: me };
}

// ---------------------------------------------------------------------------
// Egrets gliding over the islands
// ---------------------------------------------------------------------------
function buildBird() {
  const g = new THREE.Group();
  g.userData.keep = true;
  const white = toon(C.egret);
  const bodyG = new THREE.Group();
  const body = new THREE.Mesh(sphere(true), white);
  body.scale.set(0.42, 0.38, 1.0);
  bodyG.add(body);
  const head = new THREE.Mesh(sphere(true), white);
  head.position.set(0, 0.32, 0.95);
  head.scale.setScalar(0.3);
  bodyG.add(head);
  const beak = new THREE.Mesh(geo('egretBeak', () => new THREE.ConeGeometry(0.1, 0.6, 8)), toon(C.beak));
  beak.position.set(0, 0.3, 1.45);
  beak.rotation.x = Math.PI / 2;
  bodyG.add(beak);
  g.add(mergeStatic(bodyG)); // body + head in one mesh, beak in another
  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.3, 0.12, 0.05);
    const w = new THREE.Mesh(sphere(true), white);
    w.scale.set(1.35, 0.1, 0.5);
    w.position.x = side * 1.3;
    pivot.add(w);
    g.add(pivot);
    wings.push({ pivot, side });
  }
  return { g, wings };
}

// ---------------------------------------------------------------------------
// Spawn points: grid candidates that satisfy the contract, ordered by
// farthest-point sampling so the first few are well spread out.
// ---------------------------------------------------------------------------
function computeSpawns(colliders, reefs, start, R) {
  const cands = [];
  for (let x = -R; x <= R; x += 3) {
    for (let z = -R; z <= R; z += 3) {
      if (Math.hypot(x, z) > R - 18) continue;
      const dS = Math.hypot(x - start.x, z - start.z);
      if (dS < 58 || dS > 92) continue;
      if (colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 12)) continue;
      if (reefs.some((r) => Math.hypot(x - r.x, z - r.z) < r.r + 8)) continue;
      cands.push({ x, z });
    }
  }
  const out = [];
  // first: straight ahead of the player, about 75 out
  const fx = Math.sin(start.h);
  const fz = Math.cos(start.h);
  let best = null;
  let bd = Infinity;
  for (const c of cands) {
    const d = Math.hypot(c.x - (start.x + fx * 75), c.z - (start.z + fz * 75));
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  if (best) out.push(best);
  while (out.length < 12 && out.length < cands.length) {
    let pick = null;
    let pd = -1;
    for (const c of cands) {
      let m = Infinity;
      for (const o of out) m = Math.min(m, Math.hypot(c.x - o.x, c.z - o.z));
      if (m > pd) {
        pd = m;
        pick = c;
      }
    }
    if (!pick || pd < 1) break;
    out.push(pick);
  }
  return out.map((p) => ({ x: p.x, z: p.z }));
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
export function build(scene, ctx = {}) {
  const rng = typeof ctx.rng === 'function' ? ctx.rng : mulberry32(20241012);
  const noise = makeNoise(7);
  const root = new THREE.Group();
  root.name = 'env-bali';
  scene.add(root);
  const ownMats = [];
  const timeU = { value: 0 };

  const terrainMat = makeTerrainMaterial();
  const flameMat = makeFlameMaterial(timeU);
  const rockMat = makeRockMaterial();
  ownMats.push(terrainMat, flameMat, rockMat);

  const colliders = [];
  const samplers = new Map();
  const statics = new THREE.Group();
  root.add(statics);
  let torchPhase = 0;
  const nextPhase = () => (torchPhase = (torchPhase + 0.37) % 1);

  // ---- islands
  const temple = {}; // temple frame, filled below
  const excludes = new Map(); // island id -> [[x, z, r]] kept free of trees and palms
  {
    const [cx, cz] = TEMPLE_C;
    const dx = START.x - cx;
    const dz = START.z - cz;
    const l = Math.hypot(dx, dz);
    temple.fx = dx / l;
    temple.fz = dz / l;
    temple.lx = -temple.fz;
    temple.lz = temple.fx;
    temple.gx = cx + temple.fx * 8.2;
    temple.gz = cz + temple.fz * 8.2;
    temple.ry = Math.atan2(temple.fx, temple.fz);
    // P(a, b): a = sideways, b = distance behind the gate (inland)
    temple.P = (a, b) => [temple.gx + temple.lx * a - temple.fx * b, temple.gz + temple.lz * a - temple.fz * b];
    const [qx, qz] = temple.P(0.5, 6.5);
    excludes.set('temple', [[qx, qz, 12.5]]);
  }
  excludes.set('terraces', [[55, 33, 13.5]]);

  const all = [...INNER, ...OUTER];
  for (const isl of all) {
    const sample = islandSampler(isl, noise);
    samplers.set(isl.id, sample);
    const tg = buildTerrainGeometry(isl, sample, noise);
    mesh(statics, tg, terrainMat);
    // colliders: one per lump, height from the land under it
    for (const [x, z, r] of isl.lumps) {
      let hMax = 0;
      for (let k = 0; k < 9; k++) {
        const a = (k / 8) * Math.PI * 2;
        const d = k === 8 ? 0 : r * 0.5;
        hMax = Math.max(hMax, sample(x + Math.cos(a) * d, z + Math.sin(a) * d)[0]);
      }
      const treeTop = isl.trees > 0 ? 4 : 1.5;
      colliders.push({ x, z, r, h: Math.round(Math.min(14, Math.max(3, hMax + treeTop)) * 10) / 10 });
    }
    decorateIsland(isl, sample, statics, rng);
  }

  function excluded(isl, x, z, pad = 0) {
    for (const e of excludes.get(isl.id) || []) if (Math.hypot(x - e[0], z - e[1]) < e[2] + pad) return true;
    return false;
  }

  function decorateIsland(isl, sample, parent, rnd) {
    const lo = !!isl.far;
    const area = isl.lumps.reduce((s, l) => s + Math.PI * l[2] * l[2], 0);
    const placed = [];
    const free = (x, z, r) => placed.every((p) => Math.hypot(p[0] - x, p[1] - z) > p[2] + r);
    const lumpPick = () => {
      let t = rnd() * area;
      for (const l of isl.lumps) {
        t -= Math.PI * l[2] * l[2];
        if (t <= 0) return l;
      }
      return isl.lumps[0];
    };
    // outrigger boats pulled up on the sand, bow inland
    for (const deg of isl.boats || []) {
      const a = (deg * Math.PI) / 180;
      const [lx, lz] = isl.lumps[0];
      let px = lx;
      let pz = lz;
      for (let d = 0; d < 60; d += 0.25) {
        const x = lx + Math.cos(a) * d;
        const z = lz + Math.sin(a) * d;
        if (sample(x, z)[0] < 0.12) {
          px = x;
          pz = z;
          break;
        }
      }
      const [ox, oz] = gradSd(isl, px, pz);
      const cxp = px - ox * 2.1;
      const czp = pz - oz * 2.1;
      const hb = sample(cxp - ox * 2.8, czp - oz * 2.8)[0];
      const hs = sample(cxp + ox * 2.8, czp + oz * 2.8)[0];
      const pitch = Math.max(-0.12, Math.min(0.12, Math.atan2(hb - hs, 5.6)));
      const yc = Math.max(sample(cxp, czp)[0], (hb + hs) / 2);
      addJukung(parent, cxp, yc - 0.12, czp, Math.atan2(-ox, -oz), pitch, rnd);
      placed.push([cxp, czp, 3.5]);
    }
    // jungle trees
    const nTrees = Math.round(area * isl.trees);
    const sizeK = lo ? 2.45 : 1;
    for (let i = 0, tries = 0; i < nTrees && tries < nTrees * 30; tries++) {
      const [lx, lz, lr] = lumpPick();
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * lr;
      const x = lx + Math.cos(a) * d;
      const z = lz + Math.sin(a) * d;
      const [h, g] = sample(x, z);
      const s = (0.85 + rnd() * 0.55) * sizeK;
      if (g < 1.0 + s * 1.2) continue;
      if (excluded(isl, x, z, s * 1.5)) continue;
      if (!free(x, z, s * 1.35)) continue;
      placed.push([x, z, s * 1.35]);
      addTree(parent, x, h, z, s, rnd, lo);
      i++;
    }
    // leaning palms along the beach
    for (let i = 0, tries = 0; i < isl.palms && tries < 400; tries++) {
      const [lx, lz, lr] = lumpPick();
      const a = rnd() * Math.PI * 2;
      const d = lr - isl.beach * (0.35 + rnd() * 0.45);
      const x = lx + Math.cos(a) * d;
      const z = lz + Math.sin(a) * d;
      const [h, g, sd] = sample(x, z);
      if (sd > -1.3 || g > 0.6 || h < 0.35) continue;
      if (isl.palmClear) {
        const [c0, c1, deg, half] = isl.palmClear;
        const da = Math.abs(((Math.atan2(z - c1, x - c0) * 180) / Math.PI - deg + 540) % 360 - 180);
        if (da < half) continue;
      }
      if (excluded(isl, x, z, 1.5)) continue;
      if (!free(x, z, 2.2)) continue;
      placed.push([x, z, 2.2]);
      const [ox, oz] = gradSd(isl, x, z);
      const ja = (rnd() - 0.5) * 0.8;
      const dx = ox * Math.cos(ja) - oz * Math.sin(ja);
      const dz = ox * Math.sin(ja) + oz * Math.cos(ja);
      addPalm(parent, x, h, z, dx, dz, lo ? 1.5 : 0.95 + rnd() * 0.25, rnd, lo);
      i++;
    }
    // a pair of torches on small inhabited islets
    for (let i = 0; i < (isl.torches || 0); i++) {
      const [lx, lz, lr] = isl.lumps[0];
      const a = 0.9 + i * 0.5;
      const x = lx + Math.cos(a) * (lr - isl.beach - 0.5);
      const z = lz + Math.sin(a) * (lr - isl.beach - 0.5);
      addTorch(parent, x, sample(x, z)[0] - 0.15, z, nextPhase(), flameMat);
    }
    return placed;
  }

  // ---- temple island: split gate, meru towers, torches, umbrellas, penjor
  {
    const sample = samplers.get('temple');
    const P = temple.P;
    const ground = (x, z, rad) => {
      let m = Infinity;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        m = Math.min(m, sample(x + Math.cos(a) * rad, z + Math.sin(a) * rad)[0]);
      }
      return Math.min(m, sample(x, z)[0]);
    };
    const gy = ground(temple.gx, temple.gz, 3) + 0.15;
    addCandiBentar(statics, temple.gx, gy, temple.gz, temple.ry, 1.0);
    const merus = [
      [-5.6, 8.5, 9, 1.0],
      [2.0, 11.0, 7, 0.95],
      [8.2, 6.8, 5, 0.9],
    ];
    for (const [a, b, tiers, s] of merus) {
      const [x, z] = P(a, b);
      addMeru(statics, x, ground(x, z, 2.6 * s) + 0.25, z, temple.ry, tiers, s);
    }
    // stepping-stone path from the beach to the gate, lined with torches
    for (let i = 0; i < 4; i++) {
      const [x, z] = P((i % 2 ? 0.25 : -0.25), -3.3 - i * 1.55);
      const y = sample(x, z)[0];
      const st = mesh(statics, bumpyRock(rng, true), toon(0xb9b2a6), x, y - 0.05, z, temple.ry + (rng() - 0.5) * 0.6);
      st.scale.set(0.95, 0.2, 0.62);
    }
    for (const b of [-2.4, -5.6]) {
      for (const side of [-1, 1]) {
        const [x, z] = P(side * 2.1, b);
        addTorch(statics, x, sample(x, z)[0] - 0.1, z, nextPhase(), flameMat);
      }
    }
    for (const side of [-1, 1]) {
      const [x, z] = P(side * 7.3, 3.2);
      addTorch(statics, x, sample(x, z)[0] - 0.1, z, nextPhase(), flameMat, 0.9);
    }
    for (const side of [-1, 1]) {
      const [x, z] = P(side * 3.3, -1.6);
      addUmbrella(statics, x, sample(x, z)[0] - 0.1, z, 0.9);
    }
    for (const side of [-1, 1]) {
      const [x, z] = P(side * 6.4, -2.2);
      const ax = side * temple.lx * 0.55 + temple.fx;
      const az = side * temple.lz * 0.55 + temple.fz;
      const al = Math.hypot(ax, az);
      addPenjor(statics, x, sample(x, z)[0], z, ax / al, az / al, 0.95);
    }
  }

  // ---- rice-terrace island
  {
    const T = buildTerraces(55, 33, 0.9, 11.5, 6, rng);
    root.add(T.mesh);
    ownMats.push(T.mesh.material);
    const sample = samplers.get('terraces');
    // a little thatched shrine on the summit, palms dotted on the steps
    addMeru(statics, 55, T.top - 0.15, 33 - T.topShift, 0.5, 3, 0.62);
    for (const [a, lvl] of [[0.35, 1], [1.3, 2]]) {
      const [x, y, z] = T.spot(a, lvl);
      addPalm(statics, x, y, z, Math.cos(a), Math.sin(a), 0.85, rng, false);
    }
    // farmer's hut (bale) at the foot of the terraces
    {
      const [x, z] = [41.5, 22.5];
      const y = sample(x, z)[0];
      for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const post = mesh(statics, geo('balePost', () => new THREE.CylinderGeometry(0.16, 0.16, 1, 8)), toon(C.woodDark), x + px * 1.1, y + 1.0, z + pz * 1.1);
        post.scale.set(1, 2.4, 1);
      }
      mesh(statics, rbox(2.9, 0.35, 2.9, 0.12), toon(C.bamboo), x, y + 0.7, z);
      const r = mesh(statics, roofGeometry(), toon(0xd6a94e), x, y + 2.15, z, 0.3);
      r.scale.set(2.0, 1.7, 2.0);
    }
    for (const [x, z] of [[44.5, 19.5], [38.5, 25.5]]) addTorch(statics, x, sample(x, z)[0] - 0.1, z, nextPhase(), flameMat, 0.9);
  }

  // ---- sea stacks and the sea-temple rock
  for (const [x, z, r, h, kind] of SEA_ROCKS) {
    addSeaRock(statics, x, z, r, h, kind, rng, { rock: rockMat, flame: flameMat }, nextPhase);
    colliders.push({ x, z, r, h: Math.min(14, h + 3) });
  }

  // ---- edge ring: rocks and tiny palm islets just outside the arena (ships get within ~10 of them)
  for (const rk of RING) {
    if (rk.kind === 'palm') {
      const isl = { id: `ring${colliders.length}`, lumps: [[rk.x, rk.z, rk.r]], beach: 2.0, hillH: 0.9, hillW: 1.6, bumps: [], res: 0.9, trees: 0, palms: 0 };
      const sample = islandSampler(isl, noise);
      mesh(statics, buildTerrainGeometry(isl, sample, noise), terrainMat);
      // palms lean away from each other, a round bush tucked between them
      const a0 = rng() * 6.28;
      const n = rk.r >= 4 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const a = a0 + i * 2.6;
        const x = rk.x + Math.cos(a) * rk.r * 0.3;
        const z = rk.z + Math.sin(a) * rk.r * 0.3;
        addPalm(statics, x, sample(x, z)[0], z, Math.cos(a), Math.sin(a), 1.05 + rng() * 0.2, rng, false);
      }
      const ba = a0 + 1.3;
      const bx = rk.x + Math.cos(ba) * rk.r * 0.22;
      const bz = rk.z + Math.sin(ba) * rk.r * 0.22;
      const bush = mesh(statics, sphere(true), toon(C.canopy[Math.floor(rng() * 3)]), bx, sample(bx, bz)[0] + 0.25, bz);
      bush.scale.set(1.25, 0.95, 1.25);
      colliders.push({ x: rk.x, z: rk.z, r: rk.r, h: 4 });
    } else {
      // a cluster of dark volcanic rocks whose waterline matches r
      const n = 3;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng();
        const d = i === 0 ? 0 : rk.r * 0.45;
        const rr = i === 0 ? rk.r * 0.78 : rk.r * 0.5;
        const g = rockTag(bumpyRock(rng, true), i === 0 ? 0.25 : 0.55, i === 0 ? 0.7 : 0);
        const m = mesh(statics, g, rockMat, rk.x + Math.cos(a) * d, -0.6, rk.z + Math.sin(a) * d);
        m.scale.set(rr, rr * (i === 0 ? 1.5 : 1.0), rr);
        m.rotation.y = rng() * 6;
      }
      colliders.push({ x: rk.x, z: rk.z, r: rk.r, h: 5 });
    }
  }

  // ---- coral reefs: a few outcrops per reef, each a pale reef-rock mound ringed by coral heads
  const coralSpots = [];
  for (const rf of REEFS) {
    const nC = rf.r >= 10 ? 4 : 3;
    const clusters = [];
    for (let i = 0, tries = 0; i < nC && tries < 300; tries++) {
      const a = rng() * Math.PI * 2;
      const d = (0.25 + 0.75 * Math.sqrt(rng())) * rf.r * 0.56;
      const x = rf.x + Math.cos(a) * d;
      const z = rf.z + Math.sin(a) * d;
      if (clusters.some((c) => Math.hypot(c[0] - x, c[1] - z) < 5.4)) continue;
      clusters.push([x, z]);
      // a pale reef-rock mound just awash (flatter and lower than a sea rock: ships sail over it)
      const mr = 0.85 + rng() * 0.35;
      const mound = mesh(statics, bumpyRock(rng, true), toon(C.reefRock), x, -0.4, z, rng() * 6);
      mound.scale.set(mr * 1.45, mr * 0.7, mr * 1.25);
      mound.updateMatrixWorld(true);
      mound.position.y -= Math.max(0, _coralBox.setFromObject(mound, true).max.y - (CORAL_TOP - 0.1));
      const nh = 3 + Math.floor(rng() * 2);
      const a0 = rng() * 6.28;
      const k0 = Math.floor(rng() * 4);
      for (let k = 0; k < nh; k++) {
        const ha = a0 + (k / nh) * Math.PI * 2 + (rng() - 0.5) * 0.5;
        const hd = 1.25 + rng() * 0.5;
        addCoral(statics, x + Math.cos(ha) * hd, z + Math.sin(ha) * hd, rng, CORAL_KINDS[(k0 + k) % 4]);
      }
      coralSpots.push([x, z, 2.5]);
      i++;
    }
  }
  // barrier reef: arcs between the ring islets, with rocks breaking the surf
  const arcs = [];
  const rockSpots = [];
  for (let i = 0; i < RING.length; i++) {
    const a0 = Math.atan2(RING[i].z, RING[i].x);
    const a1 = Math.atan2(RING[(i + 1) % RING.length].z, RING[(i + 1) % RING.length].x);
    let da = a1 - a0;
    if (da < 0) da += Math.PI * 2;
    const mid = ((a0 + da / 2) * 180) / Math.PI;
    const half = ((da * 180) / Math.PI) * 0.36;
    arcs.push([mid, half, 146 + rng() * 3, 154 + rng() * 4]);
    for (let k = 0; k < 3; k++) {
      const aa = ((mid + (k - 1) * half * 0.55 + (rng() - 0.5) * 4) * Math.PI) / 180;
      const rr = 149 + rng() * 5;
      const px = Math.cos(aa) * rr;
      const pz = Math.sin(aa) * rr;
      const rk = mesh(statics, rockTag(bumpyRock(rng, true), k === 1 ? 0.2 : 0.5, 0), rockMat, px, -0.7, pz, rng() * 6);
      rk.scale.set(1.1 + rng() * 0.8, 1.2 + rng() * 0.6, 1.0 + rng() * 0.7);
      rockSpots.push([px, pz, Math.max(rk.scale.x, rk.scale.z) * 0.95]);
      if (k !== 1) {
        // the tall tube sponges and staghorn grow out here, beside the outer rocks,
        // where no ship can reach (ships stop at WORLD_R; these sit at 149+)
        const off = (k === 0 ? -1 : 1) * (2.3 + rng() * 0.7);
        addCoral(statics, px - Math.sin(aa) * off, pz + Math.cos(aa) * off, rng, (i + k / 2) % 2 ? 'tube' : 'stag', true);
      }
    }
  }
  checkReefWaves();
  const reefSurf = buildReefSurface(REEFS, rng, coralSpots, arcs, rockSpots, timeU, { value: palette.waveAmp });
  root.add(reefSurf.mesh);
  ownMats.push(reefSurf.mesh.material);

  // ---- Mount Agung and friends on the horizon
  const mountains = buildMountains();
  root.add(mountains.group);
  ownMats.push(mountains.mat);

  // ---- egrets
  const birds = [];
  const flocks = [
    [-30, 4, 16, 15, 0.22],
    [-30, 4, 13, 17, -0.27],
    [55, 36, 15, 16, 0.2],
    [-80, 62, 12, 14, -0.24],
  ];
  for (const [x, z, r, y, w] of flocks) {
    const b = buildBird();
    root.add(b.g);
    birds.push({ ...b, x, z, r, y, w, ph: rng() * 6.28 });
  }

  mergeStatic(statics);
  for (const m of [terrainMat]) m.needsUpdate = true;

  // ---- contract data
  const reefs = REEFS.map((r) => ({ ...r }));
  const enemySpawns = computeSpawns(colliders, reefs, START, WORLD_R);

  function update(t, dt) {
    // reef patches ride the swell in their vertex shader (same t as ocean.update)
    timeU.value = t;
    for (const b of birds) {
      const a = b.ph + t * b.w;
      const x = b.x + Math.cos(a) * b.r;
      const z = b.z + Math.sin(a) * b.r;
      b.g.position.set(x, b.y + Math.sin(t * 0.7 + b.ph) * 1.2, z);
      // tangent heading
      const dx = -Math.sin(a) * Math.sign(b.w);
      const dz = Math.cos(a) * Math.sign(b.w);
      b.g.rotation.set(0, Math.atan2(dx, dz), -Math.sign(b.w) * 0.25);
      const flap = Math.sin(t * 5.5 + b.ph);
      const glide = Math.sin(t * 0.5 + b.ph) > 0.2 ? 0.25 : 1;
      for (const w of b.wings) w.pivot.rotation.z = w.side * (0.15 + flap * 0.55 * glide);
    }
    for (let i = 0; i < mountains.puffs.length; i++) {
      const p = mountains.puffs[i];
      const k = 1 + 0.06 * Math.sin(t * 0.4 + i * 1.7);
      p.m.scale.set(p.s.x * k, p.s.y * k, p.s.z * k);
      p.m.position.set(p.p.x + Math.sin(t * 0.15 + i) * 2, p.p.y + Math.sin(t * 0.2 + i * 2) * 1, p.p.z);
    }
    void dt;
  }

  function dispose() {
    scene.remove(root);
    root.traverse((o) => {
      if (o.isMesh && o.geometry) o.geometry.dispose();
    });
    for (const m of ownMats) m.dispose();
  }

  return {
    worldRadius: WORLD_R,
    colliders,
    playerStart: { ...START },
    enemySpawns,
    reefs,
    update,
    dispose,
  };
}
