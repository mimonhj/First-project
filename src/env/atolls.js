import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, setOutline, noOutline, mergeStatic, gradientMap, ensureIndex } from '../style.js';
import { waveHeight } from '../scenery.js';

// Level 7, "The Turtle Atolls" (SPEC3 §5.4): South Seas noon.
//
// Map (north = -z, east = +x; the arena is the disc of radius WORLD_R round 0,0). The whole arena is the lagoon of a
// great atoll: its rim of white-sand motus with palms runs round the edge, outside the arena, open to the east.
// - north-east: Turtle Island, an island shaped like a giant turtle: a shell hill of green plates (palms on its
//   back), a head rock with big friendly eyes looking down the lagoon, four flippers on white-sand spits, a stub tail
// - north: a small ring atoll round its own turquoise lagoon; north-west: a candy-striped lighthouse that toppled off
//   its coral rock and lies with its lantern in the sea
// - west: the stilt village, huts with conch-shell roofs on stilts round a palm island, joined by plank walks over
//   a pale reef flat
// - south-west: an old wreck heeled over on a coral reef; south-east: a second ring atoll
// - sandbars (env.reefs) all over the lagoon, two with a dry cay where flamingos stand; sea turtles paddle in the
//   shallows and terns wheel over the islands
// - east, over the horizon: a bruise-purple storm wall trailing rain curtains (one mesh): the waterspouts come from it
//
// Gameplay data (fixed: the layout never depends on ctx.rng; checked by the harness and the smoke layout rules):
// - colliders: the islands' lumps (their shorelines are the same smooth union the terrain is built from), the turtle's
//   head and flippers, the lighthouse rock and tower, the village (huts, walks and the water they close in), the wreck,
//   the flamingo cays, and the rim motus just outside the arena (they give the rim its surf)
// - reefs: 7 sandbars { x, z, r } (deep hulls ×0.45)
// - spoutLoops: the waterspouts' fixed loops { cx, cz, rx, rz, w, phase }: a spout rides
//   (cx + rx·cos(w·t + phase), cz + rz·sin(w·t + phase)) at about 2.5 u/s; every loop stays clear of every collider
//   and of the player start by more than the pull zone (r 14) + 8, and inside worldRadius − 20
// - enemySpawns: open water 58–92 from the start, clear of colliders by r + 12, of sandbars by r + 8 and of the spout
//   loops by 16, inside worldRadius − 16, ordered so that any prefix is well spread (the first ahead of the start)
// - crateSpots: open water 30–100 from the start, clear of colliders by r + 8, of sandbars by r + 3 and of the spout
//   loops by 18, inside worldRadius − 20, spread the same way
//
// Hazards: update(t, dt, { simTime, camera, hazards }) draws the waterspouts of hazards.spouts (mechanics3.js
// visuals()), at most 4 at once: [{ id, x, z, state: 'forming' | 'active' | 'collapsing', k }], k = 0..1 through the
// current state (or `t` / `T`, seconds in it / its length; `phase` / `stage` are read as the state too). A stable `id`
// keeps each spout on its own slot (without one, the nearest slot within 9 u). A spout that leaves the snapshot winds
// down by itself in 0.8 s; no hazards (or a paused game, which skips update) draws nothing new. A spout is
// 4 meshes without an ink line: the cloud disc, the funnel (three twisting cel bands, white, pale grey and blue-grey),
// the water (the dark swirl ring of r 6 that warns while it forms, faint spiral streaks out to the pull zone r 14 and
// the spray skirt), and the debris (two barrels and a startled fish circling up), which every spout shares.
//
// Draw calls: the static scene is baked into a handful of meshes (terrain, painted rock, one vertex-coloured mesh for
// every plain prop and one for the few without an ink line), the sea turtles and terns share one mesh moved on the CPU,
// the storm wall, the rain curtains and the shallows are one mesh each: the env alone is 12 calls (the four outlined
// meshes twice, for the ink pass), +3 per spout and 1 for the flotsam they share.

export const meta = {
  name: 'The Turtle Atolls',
  subtitle: 'White-sand atolls and turquoise lagoons. Waterspouts dance under the storm wall.',
};

export const palette = {
  skyTop: 0x2f7fe0,
  skyHorizon: 0xbfeff0,
  sunColor: 0xfff4d6,
  sunDir: [0.3, 0.8, 0.4],
  sunIntensity: 2.3,
  hemiSky: 0xd8f4ff,
  hemiGround: 0x4a7a8a,
  hemiIntensity: 1.3,
  fogColor: 0xbfe8e8,
  fogNear: 140,
  fogFar: 380,
  waterDeep: 0x0f7f9a,
  waterShallow: 0x48e0d0,
  waterFoam: 0xffffff,
  waveAmp: 0.6,
  cloudColor: 0xffffff,
  cloudShade: 0xb8c8e0,
  cloudCount: 12,
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
const WORLD_R = 145;
const DEG = Math.PI / 180;
// mid-lagoon, looking north-east past Turtle Island to the storm wall
const START = { x: -22, z: 44, h: 2.28 };

// Turtle Island: centre, the shell hill's radius and height; the turtle looks back down the lagoon at the start.
const TURTLE = { x: 42, z: -60, shellR: 16.8, shellH: 12, islandR: 20 };
// The small ring atolls: centre, ring radius, number of motus, motu radii, seed.
const ATOLLS = [
  { id: 'atollN', x: -14, z: -110, R: 12.5, n: 9, r0: 4.4, r1: 5.6, seed: 31 },
  { id: 'atollSE', x: 56, z: 104, R: 11.5, n: 9, r0: 4.2, r1: 5.3, seed: 57 },
];
// The stilt village: the palm island, and the huts on stilts round its lagoon side (bearings from east, + toward south).
const VILLAGE = { x: -114, z: 2, r: 11, hutR: 20, huts: [-66, -33, 0, 33, 66] };
// The toppled lighthouse's coral rock, and the bearing its tower fell along.
const LIGHT = { x: -66, z: -88, r: 6.5, fall: 72 * DEG, len: 15.5 };
// The wreck on its coral reef.
const WRECK = { x: -75.5, z: 84.5, r: 5.2 };
// Sandbars (env.reefs): shallows that slow deep hulls. kind: 'sand' (pale gold), 'coral' (the wreck's reef);
// cay: a dry sand cay in the middle (a collider) where flamingos stand.
const SANDBARS = [
  { x: -42, z: -34, r: 9, kind: 'sand', cay: 2.8, flamingos: 5 },
  { x: -86, z: 52, r: 9.5, kind: 'sand', cay: 3.0, flamingos: 4 },
  { x: -76, z: 84, r: 13, kind: 'coral' },
  { x: 10, z: 84, r: 8, kind: 'sand' },
  { x: -6, z: -66, r: 7.5, kind: 'sand' },
  { x: 102, z: -48, r: 8, kind: 'sand' },
  { x: 104, z: 60, r: 7.5, kind: 'sand' },
];
// The waterspouts' loops (mechanics3.js 'spouts' rides them): centre, half-axes; w and phase are set below so each
// loop is ridden at about SPOUT_SPEED.
const SPOUT_SPEED = 2.5;
const LOOPS = [
  { cx: 96, cz: -8, rx: 16, rz: 22, dir: 1, phase: 0.4 },
  { cx: 72, cz: 46, rx: 19, rz: 12, dir: -1, phase: 2.1 },
  { cx: 14, cz: 4, rx: 14, rz: 10, dir: 1, phase: 4.0 },
  { cx: -24, cz: 104, rx: 15, rz: 8, dir: -1, phase: 1.2 },
  { cx: -94, cz: -54, rx: 12, rz: 9, dir: 1, phase: 5.3 },
  { cx: -58, cz: 24, rx: 10, rz: 9, dir: -1, phase: 3.3 },
];
// The rim of the great atoll, outside the arena: [bearing deg (0 = east, 90 = south), radius, lumps, lump r].
// Open to the east (the storm), from -64° to +66°.
const RIM = [
  [70, 160, 3, 6], [93, 167, 2, 5.5], [116, 158, 3, 6.5], [139, 170, 2, 5], [160, 156, 3, 6], [184, 168, 3, 6.5],
  [207, 158, 2, 5.5], [228, 170, 3, 6], [250, 160, 2, 5.5], [272, 168, 3, 6.5], [294, 158, 2, 5],
];
// Far atolls on the horizon (decoration only): [bearing deg, radius, lumps, lump r].
const FAR_ATOLLS = [[100, 230, 4, 9], [150, 215, 3, 8], [196, 236, 4, 9], [236, 214, 3, 8], [268, 240, 4, 10], [312, 222, 3, 8]];
// High green islands on the horizon: [bearing deg, radius, r, height].
const FAR_HILLS = [[214, 285, 44, 36], [146, 305, 36, 26], [262, 320, 30, 22]];
// The storm wall: bearings it spans, its distance, the cloud base.
const STORM = { from: -64, to: 64, dist: 400, base: 12 };

// ---------------------------------------------------------------------------
// Colours (cel-shaded materials from style.js; the props are baked into vertex colours)
// ---------------------------------------------------------------------------
const C = {
  sand: 0xfff6df, wetSand: 0xf0d9a8, grass: 0x72c94f, grass2: 0x5cb145,
  palmTrunk: 0xb98a55, frond: [0x52c53f, 0x3ca23a], coconut: 0x6e4424, bush: [0x3fa64a, 0x2f8f42, 0x58bf4e],
  seam: 0x37532f, plate: [0x82b058, 0x71a14c], plateM: 0x5e8b43, plateIn: 0xa3cc70,
  skin: 0x9ab878, skinSpot: 0x76985a, eye: 0xffffff, pupil: 0x1c1626, mouth: 0x3a2626, cheek: 0xf4a0a0,
  woven: 0xdcb27a, wovenDark: 0xb98e58, plank: 0xa9784a, plankDark: 0x7a5232, stilt: 0x6b4a2e,
  conch: [0xfbe8cc, 0xf3b48e], conchLip: 0xff9fb1, conchKnob: 0xfff4e2, door: 0x5a3a24,
  canoe: 0xd2483c, canoeTrim: 0xfff2dc, rope: 0xd8c08a, net: 0xe8dcc0,
  lhRed: 0xe8443f, lhWhite: 0xfbf7ee, lhDark: 0x2e3a3c, glass: 0xfff1a6, gold: 0xffc93c,
  hull: 0x6b4528, hullLight: 0x9a6a40, sail: 0xf1e3c4, chest: 0xa35a2c,
  flamingo: 0xff8fb0, flamingoWing: 0xf0628c, flamingoLeg: 0xf37ea0, beakTip: 0x231b24, beakBase: 0xfbe6e6,
  tern: 0xfdfdfd, ternWing: 0xdfe7f0, ternCap: 0x2a2630, ternBeak: 0xff8a2a,
  turtleShell: 0x6f8f4c, turtlePlate: 0x93b261, turtleSkin: 0xa9c78c, turtleBelly: 0xf2e2b0,
  coral: [0xff6fa3, 0xff9a3c, 0x9b6bff, 0xffd447, 0xff5a5a],
  rockA: 0xe8c0a8, rockB: 0xd09c86, rockWet: 0x6a5560,
  hill: 0x5fae4a, hill2: 0x4f9a40, hillRock: 0x8e8aa6,
  barrel: 0x9a6a40, hoop: 0x4b3a2c, fish: 0xff9f2e, fishFin: 0xff6a1e,
};

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
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const r2 = (v) => Math.round(v * 100) / 100;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
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
function smoothGeo(g) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  const w = mergeVertices(g, 1e-3);
  w.computeVertexNormals();
  return w;
}

function mesh(parent, geo, mat, x = 0, y = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  parent.add(m);
  return m;
}

// Geometries made while a level is built: the props are baked into a few meshes at the end of build(), so every
// source geometry is disposed there (GEO lives only during one build()).
let GEO = null;
function geo(key, make) {
  let g = GEO.get(key);
  if (!g) {
    g = make();
    GEO.set(key, g);
  }
  return g;
}
const sphere = (w = 14, h = 10) => geo(`sp${w},${h}`, () => new THREE.SphereGeometry(1, w, h));
const cyl = (rt, rb, h, seg = 12) => geo(`cy${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const cone = (r, h, seg = 12) => geo(`co${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg));
const rbox = (w, h, d, r = 0.12) => geo(`rb${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01)));
function lathe(profile, seg = 20) {
  const pts = profile[0][1] > profile[profile.length - 1][1] ? profile.slice().reverse() : profile;
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

// A tube with a varying radius along a polyline of THREE.Vector3 (smooth normals, capped).
function tubeAlong(points, radiusFn, radial = 8) {
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

// A lumpy rock: a sphere pushed in and out by a little value noise (smooth normals for the ink line).
function bumpyRock(seed, amp = 0.16, w = 14, h = 10) {
  const g = new THREE.SphereGeometry(1, w, h);
  const noise = makeNoise(seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + amp * (noise(x * 2.1 + 5, z * 2.1 + y * 1.3) - 0.5) * 2;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  return smoothGeo(g);
}

// Shared vertex-coloured toon materials: the whole static prop scene bakes into one outlined mesh and one without
// an ink line (eyes' glints, glass).
function vcMaterial(outline) {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(3) });
  setOutline(m, outline);
  return m;
}

// Bake every plain-toon mesh under `group` into vertex-coloured meshes: one with the ink line and one without.
// Meshes under a node with userData.keep are left alone. Returns the new meshes.
function bakeVC(group, matLine, matFlat) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const parts = { line: [], flat: [] };
  const victims = [];
  const m4 = new THREE.Matrix4();
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.material || Array.isArray(o.material) || !o.material.color) return;
    for (let p = o; p && p !== group; p = p.parent) if (p.userData.keep) return;
    const src = o.geometry;
    const g = src.index && !src.attributes.normal ? src.toNonIndexed() : new THREE.BufferGeometry().copy(src);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    for (const k of Object.keys(g.morphAttributes)) delete g.morphAttributes[k];
    if (!g.attributes.normal) g.computeVertexNormals();
    ensureIndex(g);
    g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
    const c = o.material.color.clone();
    if (o.material.emissive && o.material.emissiveIntensity > 0) c.add(o.material.emissive.clone().multiplyScalar(o.material.emissiveIntensity * 0.6));
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const op = o.material.userData.outlineParameters;
    (op && op.visible === false ? parts.flat : parts.line).push(g);
    victims.push(o);
  });
  for (const v of victims) v.parent.remove(v);
  const out = [];
  for (const [key, mat] of [['line', matLine], ['flat', matFlat]]) {
    if (!parts[key].length) continue;
    const merged = mergeGeometries(parts[key], false);
    for (const g of parts[key]) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, mat);
    m.name = `atolls-props-${key}`;
    group.add(m);
    out.push(m);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The sea's swell, mirrored for the shaders that ride it (the shallows and the spouts' water). scenery.js keeps its
// wave table private, so this mirrors it (same constants, same rounding); checkWaves() verifies the mirror once.
// ---------------------------------------------------------------------------
const r6 = (v) => Number(v.toFixed(6));
const SEA_WAVES = [
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
const WAVE_GLSL = `float waveH(vec2 p, float t, float amp) {
  float h = 0.0;
${SEA_WAVES.map((w) => `  h += ${glslNum(w.a)} * sin(${glslNum(w.kx)} * p.x + ${glslNum(w.kz)} * p.y - ${glslNum(w.w)} * t + ${glslNum(w.ph)});`).join('\n')}
  return h * amp;
}`;
const NOISE_GLSL = `float aHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float aNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(aHash(i), aHash(i + vec2(1.0, 0.0)), u.x), mix(aHash(i + vec2(0.0, 1.0)), aHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`;
let wavesChecked = false;
function checkWaves() {
  if (wavesChecked) return;
  wavesChecked = true;
  for (const [x, z, t] of [[0, 0, 0], [13.7, -42.1, 3.3], [-97.2, 55.5, 41.9], [120.4, 8.8, 777.7], [-3.1, -131, 12345.6]]) {
    let h = 0;
    for (const w of SEA_WAVES) h += w.a * Math.sin(w.kx * x + w.kz * z - w.w * t + w.ph);
    if (Math.abs(h * 0.6 - waveHeight(x, z, t, 0.6)) > 1e-6) {
      console.error('atolls.js: SEA_WAVES no longer matches the waves in scenery.js; update the mirror');
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Painted materials (own instances, never the shared toon cache)
// ---------------------------------------------------------------------------
// Terrain: uv.x = distance inland past the grass line (< 0 sand, > 0 grass), uv.y = patch noise. The colours are
// picked per pixel so the grass edge is crisp and gets a hand-drawn ink line; the sand darkens at the waterline.
function makeTerrainMaterial() {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(3) });
  m.name = 'atolls-terrain';
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
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZone = uv;\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vZone;\nvarying float vWY;\nuniform vec3 uSand, uWet, uGrass, uGrass2, uInkCol;')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float gz = vZone.x;
        float fw = max(fwidth(gz), 1e-4);
        float grassK = smoothstep(-fw, fw, gz);
        vec3 sandCol = mix(uWet, uSand, smoothstep(0.3, 0.42, vWY));
        float pn = vZone.y;
        float pfw = max(fwidth(pn), 1e-4);
        vec3 grassCol = mix(uGrass, uGrass2, smoothstep(0.62 - pfw, 0.62 + pfw, pn));
        vec3 tcol = mix(sandCol, grassCol, grassK);
        float ink = 1.0 - smoothstep(0.7 * fw, 1.5 * fw, abs(gz - 0.6 * fw));
        tcol = mix(tcol, uInkCol, ink * 0.9);
        vec4 diffuseColor = vec4(tcol, opacity);`,
      );
  };
  m.customProgramCacheKey = () => 'atolls-terrain-v1';
  return m;
}

// Coral rock: painted per pixel from world position and normal, so every rock shares one material: wobbly strata in
// two warm pinks, a dark wet band at the waterline. uv.x = tone (0 dark .. 1 light).
function makeRockMaterial() {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(3) });
  m.name = 'atolls-rock';
  setOutline(m, true);
  const U = {
    uRockA: { value: new THREE.Color(C.rockA) },
    uRockB: { value: new THREE.Color(C.rockB) },
    uRockWet: { value: new THREE.Color(C.rockWet) },
    uMoss: { value: new THREE.Color(C.grass) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRW;\nvarying vec3 vRN;\nvarying vec2 vRT;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRN = mat3(modelMatrix) * objectNormal;\nvRT = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRW;\nvarying vec3 vRN;\nvarying vec2 vRT;\nuniform vec3 uRockA, uRockB, uRockWet, uMoss;')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec3 rn = normalize(vRN);
        float sy = (vRW.y + 0.35 * sin(vRW.x * 0.8 + vRW.z * 0.35) + 0.22 * sin(vRW.z * 1.25 - vRW.x * 0.4)) / 1.2;
        float tri = abs(fract(sy) - 0.5) * 2.0;
        float sfw = max(fwidth(sy) * 2.0, 1e-4);
        vec3 rc = mix(uRockA, uRockB, smoothstep(0.5 - sfw, 0.5 + sfw, tri));
        rc *= mix(0.84, 1.08, vRT.x);
        float wfw = max(fwidth(vRW.y), 1e-4);
        rc = mix(rc, uRockWet, (1.0 - smoothstep(0.5 - wfw, 0.5 + wfw, vRW.y + 0.12 * sin(vRW.x * 2.1 + vRW.z * 1.7))) * 0.8);
        float mn = rn.y + 0.16 * sin(vRW.x * 1.9) * sin(vRW.z * 2.3) - (1.0 - vRT.y) * 2.0 - (1.0 - smoothstep(2.5, 3.5, vRW.y)) * 2.0;
        float mfw = max(fwidth(mn), 1e-4);
        rc = mix(rc, uMoss, smoothstep(0.6 - mfw, 0.6 + mfw, mn));
        vec4 diffuseColor = vec4(rc, opacity);`,
      );
  };
  m.customProgramCacheKey = () => 'atolls-rock-v1';
  return m;
}
/** Tag a rock geometry with its tone and moss amount (read by the rock material through uv). */
function rockTag(g, tone, moss = 0) {
  const n = g.attributes.position.count;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    uv[i * 2] = tone;
    uv[i * 2 + 1] = moss;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// ---------------------------------------------------------------------------
// Terrain: islands are unions of circles; their shoreline IS the collider set (the height field is built from the
// same smooth-min distance the ocean shader uses for its foam).
// isl: { lumps: [[x, z, r]], beach, hillH, hillW, res, far? }
// ---------------------------------------------------------------------------
function islandSampler(isl, noise) {
  const { lumps, beach, hillH, hillW } = isl;
  const beachTop = isl.far ? 1.2 : 1.05;
  const seed = lumps[0][0] * 0.37 + lumps[0][1] * 0.11;
  return (x, z) => {
    let sd = 1e4;
    for (const L of lumps) sd = smin(sd, Math.hypot(x - L[0], z - L[1]) - L[2], 4);
    const u = -sd;
    const bw = beach + (noise(x * 0.11 + seed, z * 0.11) - 0.5) * 1.8;
    const g = u - bw;
    let h;
    if (u <= 0) h = -Math.min(3.2, 0.42 * sd + 0.06 * sd * sd);
    else h = beachTop * (1 - Math.exp(-u * 0.4));
    if (g > 0) {
      h += 0.3 * smooth(0, 0.6, g);
      const k = Math.min(g / hillW, 1);
      h += hillH * (1 - Math.pow(1 - k, 2.6));
      h += (noise(x * 0.17 + 40, z * 0.17) - 0.45) * 0.5 * smooth(0, 3.5, g);
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
// Outward direction of an island's shoreline at (x, z).
function gradSd(lumps, x, z) {
  const sd = (px, pz) => {
    let d = 1e4;
    for (const L of lumps) d = smin(d, Math.hypot(px - L[0], pz - L[1]) - L[2], 4);
    return d;
  };
  const e = 0.5;
  const gx = sd(x + e, z) - sd(x - e, z);
  const gz = sd(x, z + e) - sd(x, z - e);
  const l = Math.hypot(gx, gz) || 1;
  return [gx / l, gz / l];
}

// The motus of a ring atoll: lumps on a slightly wobbly ring, overlapping so the ring is closed.
function ringLumps(a) {
  const r = mulberry32(a.seed);
  const out = [];
  const a0 = r() * 6.28;
  for (let i = 0; i < a.n; i++) {
    const ang = a0 + (i / a.n) * Math.PI * 2 + (r() - 0.5) * 0.14;
    const rr = a.R * (1 + (r() - 0.5) * 0.1);
    out.push([r2(a.x + Math.cos(ang) * rr), r2(a.z + Math.sin(ang) * rr), r2(a.r0 + r() * (a.r1 - a.r0))]);
  }
  return out;
}
// A motu along an arc of the atoll rim: `n` lumps laid along the tangent at bearing `deg`, radius `rad`.
function arcLumps(deg, rad, n, r) {
  const a = deg * DEG;
  const cx = Math.cos(a) * rad;
  const cz = Math.sin(a) * rad;
  const tx = -Math.sin(a);
  const tz = Math.cos(a);
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * r * 1.35;
    const rr = r * (i === 0 || i === n - 1 ? 0.8 : 1);
    out.push([r2(cx + tx * o), r2(cz + tz * o), r2(rr)]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Props (plain toon materials; baked into vertex colours at the end of build())
// ---------------------------------------------------------------------------
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
    return smoothGeo(g);
  });
}
// A coconut palm leaning along (dirX, dirZ).
function addPalm(parent, x, y, z, dirX, dirZ, s, rng, lo = false) {
  const H = (5.2 + rng() * 2.4) * s;
  const lean = (1.4 + rng() * 2.4) * s;
  const pts = [];
  const N = lo ? 6 : 10;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const off = lean * Math.pow(t, 1.7);
    pts.push(new THREE.Vector3(x + dirX * off, y - 0.4 + (H + 0.4) * t, z + dirZ * off));
  }
  mesh(parent, tubeAlong(pts, (t) => (0.36 - 0.13 * t) * s * (1 + 0.12 * Math.max(0, Math.sin(t * Math.PI * 9))), lo ? 6 : 7), toon(C.palmTrunk));
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
  const tuft = mesh(parent, sphere(8, 6), toon(C.frond[0]), top.x, top.y + 0.15 * s, top.z);
  tuft.scale.set(0.55 * s, 0.4 * s, 0.55 * s);
  if (!lo) {
    for (let i = 0; i < 3; i++) {
      const a = a0 + i * 2.1;
      const c = mesh(parent, sphere(7, 5), toon(C.coconut), top.x + Math.cos(a) * 0.38 * s, top.y - 0.35 * s, top.z + Math.sin(a) * 0.38 * s);
      c.scale.setScalar(0.3 * s);
    }
  }
  return top;
}
// A round tropical shrub of two or three blobs.
function addBush(parent, x, y, z, s, rng) {
  const ci = Math.floor(rng() * 3);
  const b = mesh(parent, sphere(11, 8), toon(C.bush[ci]), x, y + 0.45 * s, z, rng() * 6);
  b.scale.set(1.2 * s, 0.85 * s, 1.1 * s);
  if (rng() < 0.7) {
    const a = rng() * 6.28;
    const b2 = mesh(parent, sphere(9, 7), toon(C.bush[(ci + 1) % 3]), x + Math.cos(a) * 0.9 * s, y + 0.35 * s, z + Math.sin(a) * 0.9 * s);
    b2.scale.set(0.8 * s, 0.6 * s, 0.8 * s);
  }
}
// Coral heads just awash at the waterline: brain, fan, stag and tube.
function addCoral(parent, x, z, rng, kind) {
  const col = toon(C.coral[Math.floor(rng() * C.coral.length)]);
  if (kind === 'brain') {
    const m = mesh(parent, geo(`brain${Math.floor(rng() * 3)}`, () => bumpyRock(900 + GEO.size, 0.12, 12, 8)), col, x, -0.35, z, rng() * 6);
    const s = 0.7 + rng() * 0.5;
    m.scale.set(s * 1.1, s * 0.6, s);
  } else if (kind === 'fan') {
    const m = mesh(parent, sphere(12, 8), col, x, 0.05, z, rng() * 6);
    m.scale.set(1.0 + rng() * 0.4, 0.75 + rng() * 0.3, 0.12);
  } else {
    // finger coral (soft rounded fingers; 'stag' ones splay out further)
    const splay = kind === 'stag' ? 0.55 : 0.25;
    const finger = geo('coralFinger', () => new THREE.CapsuleGeometry(0.17, 0.75, 3, 8));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.28 + rng();
      const s = 0.75 + rng() * 0.45;
      const m = mesh(parent, finger, col, x + Math.cos(a) * 0.3, -0.25 + 0.4 * s, z + Math.sin(a) * 0.3);
      m.rotation.set(Math.sin(a) * splay, 0, -Math.cos(a) * splay);
      m.scale.setScalar(s);
    }
  }
}

// A conch-shell roof: whorls stacked into a twisting spire with knobs on their shoulders, the flared pink lip over
// the door (local -z is the front). Base at y = 0, about 4 tall, 3.2 across at the base (× s).
function conchRoof(parent, x, y, z, ry, s) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.scale.setScalar(s);
  parent.add(g);
  const whorls = [
    [3.15, 0.55, 0.62], [2.35, 1.5, 0.6], [1.68, 2.3, 0.58], [1.1, 2.95, 0.56], [0.66, 3.45, 0.55],
  ];
  whorls.forEach(([r, wy, fy], k) => {
    // each whorl leans a little round the spire, so the stack twists
    const a = k * 1.25;
    const off = k === 0 ? 0 : 0.16 * r;
    const w = mesh(g, sphere(18, 10), toon(C.conch[k % 2]), Math.cos(a) * off, wy, Math.sin(a) * off);
    w.scale.set(r, r * fy, r);
    const nk = Math.max(5, Math.round(r * 2.6));
    const ks = Math.max(0.55, r / 2.1); // the knobs grow with the whorl: spikes round the big ones
    for (let i = 0; i < nk; i++) {
      const b = (i / nk) * Math.PI * 2 + k * 0.4;
      const kn = mesh(g, cone(0.3 * ks, 0.7 * ks, 7), toon(C.conchKnob), Math.cos(a) * off + Math.cos(b) * r * 0.84, wy + r * fy * 0.5, Math.sin(a) * off + Math.sin(b) * r * 0.84);
      kn.rotation.set(Math.sin(b) * 1.05, 0, -Math.cos(b) * 1.05);
    }
  });
  mesh(g, cone(0.4, 0.9, 10), toon(C.conch[1]), 0.05, 4.1, 0.05);
  // the shell's opening over the front, a little to one side: its glossy pink inside in a rolled cream lip
  const mouth = new THREE.Group();
  mouth.position.set(0.55, 0.75, -2.7);
  mouth.rotation.set(0.28, 0.22, 0);
  g.add(mouth);
  mesh(mouth, sphere(16, 10), toon(C.conchLip)).scale.set(1.25, 1.2, 0.5);
  mesh(mouth, geo('conchRim', () => new THREE.TorusGeometry(1, 0.2, 7, 22)), toon(C.conchKnob), 0, 0, -0.08).scale.set(1.3, 1.25, 1.3);
  return g;
}

// A hut on stilts: a plank deck on poles over the water, a woven round wall, a door facing `face` (radians, the way
// out), a ladder down to the sea and a conch-shell roof. y0 = deck height.
function stiltHut(parent, x, z, face, s, y0 = 2.6) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = face;
  g.scale.setScalar(s);
  parent.add(g);
  // (local +z is the way out)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    mesh(g, cyl(0.17, 0.2, y0 + 2.6, 7), toon(C.stilt), Math.cos(a) * 2.45, (y0 - 2.6) / 2, Math.sin(a) * 2.45);
  }
  mesh(g, cyl(3.05, 3.05, 0.34, 18), toon(C.plank), 0, y0, 0);
  mesh(g, cyl(3.12, 3.12, 0.12, 18), toon(C.plankDark), 0, y0 - 0.2, 0);
  mesh(g, cyl(2.25, 2.3, 2.3, 16), toon(C.woven), 0, y0 + 1.3, 0);
  for (const hy of [0.6, 1.3, 2.0]) mesh(g, geo('wovenBand', () => new THREE.TorusGeometry(2.3, 0.07, 5, 24)), toon(C.wovenDark), 0, y0 + hy, 0).rotation.x = Math.PI / 2;
  mesh(g, rbox(1.05, 1.65, 0.3, 0.12), toon(C.door), 0, y0 + 1.0, 2.2);
  const win = mesh(g, cyl(0.32, 0.32, 0.3, 10), toon(C.door), 1.7, y0 + 1.5, 1.45);
  win.rotation.set(Math.PI / 2, 0, 0);
  win.rotation.y = 0.85;
  // ladder down to the sea
  for (const sx of [-0.45, 0.45]) {
    const rail = mesh(g, cyl(0.07, 0.07, 3.0, 6), toon(C.plankDark), sx, y0 - 1.2, 3.35);
    rail.rotation.x = -0.25;
  }
  for (let k = 0; k < 4; k++) {
    const rung = mesh(g, cyl(0.05, 0.05, 0.9, 5), toon(C.plankDark), 0, y0 - 0.15 - k * 0.7, 3.12 + k * 0.18);
    rung.rotation.z = Math.PI / 2;
  }
  conchRoof(g, 0, y0 + 2.4, 0, Math.PI, 1);
  return g;
}

// An outrigger canoe (local +z = bow).
function canoe(parent, x, z, ry, y = 0.15) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  parent.add(g);
  const hull = mesh(g, geo('canoeHull', () => {
    const hg = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const p = hg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const zz = p.getZ(i);
      p.setXYZ(i, p.getX(i) * 0.55 * (1 - 0.5 * zz * zz), p.getY(i) * 0.5, zz * 2.6);
    }
    hg.computeVertexNormals();
    return hg;
  }), toon(C.canoe), 0, 0.18, 0);
  hull.rotation.x = Math.PI;
  mesh(g, rbox(0.9, 0.08, 4.6, 0.04), toon(C.canoeTrim), 0, 0.2, 0);
  for (const bz of [-0.9, 0.9]) {
    const boom = mesh(g, cyl(0.06, 0.06, 2.6, 5), toon(C.plankDark), 1.2, 0.35, bz);
    boom.rotation.z = Math.PI / 2 + 0.12;
  }
  const fl = mesh(g, geo('canoeFloat', () => new THREE.CapsuleGeometry(0.17, 2.4, 3, 8)), toon(C.plank), 2.45, 0.05, 0);
  fl.rotation.x = Math.PI / 2;
  const pad = mesh(g, rbox(0.12, 0.05, 1.6, 0.02), toon(C.plankDark), -0.2, 0.32, -1.2);
  pad.rotation.y = 0.5;
  return g;
}

// A flamingo standing in the shallows (local +z = the way it looks). pose 0: on one leg; 1: on two; 2: head down.
function flamingo(parent, x, y, z, ry, s, pose) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.scale.setScalar(s);
  parent.add(g);
  const pink = toon(C.flamingo);
  const leg = toon(C.flamingoLeg);
  mesh(g, cyl(0.04, 0.05, 1.35, 6), leg, 0.07, 0.67, 0);
  if (pose === 1) mesh(g, cyl(0.04, 0.05, 1.35, 6), leg, -0.09, 0.67, 0.02);
  else {
    const th = mesh(g, cyl(0.04, 0.04, 0.6, 6), leg, -0.05, 1.12, -0.12);
    th.rotation.x = -0.9;
    const sh = mesh(g, cyl(0.035, 0.04, 0.55, 6), leg, -0.05, 0.95, 0.06);
    sh.rotation.x = 1.3;
  }
  const body = mesh(g, sphere(14, 10), pink, 0, 1.55, 0);
  body.scale.set(0.38, 0.33, 0.66);
  const wing = mesh(g, sphere(12, 8), toon(C.flamingoWing), 0, 1.66, -0.12);
  wing.scale.set(0.34, 0.2, 0.52);
  const tip = mesh(g, cone(0.16, 0.42, 7), toon(C.beakTip), 0, 1.66, -0.62);
  tip.rotation.x = -Math.PI / 2 - 0.2;
  tip.scale.set(1.3, 1, 0.5);
  const neckPts = pose === 2
    ? [[0, 1.62, 0.5], [0, 1.95, 0.85], [0, 1.8, 1.15], [0, 1.2, 1.25], [0, 0.55, 1.15]]
    : [[0, 1.65, 0.5], [0, 2.05, 0.78], [0, 2.4, 0.55], [0, 2.62, 0.32], [0, 2.86, 0.42]];
  const pts = neckPts.map(([a, b, c]) => new THREE.Vector3(a, b, c));
  mesh(g, tubeAlong(pts, (t) => 0.085 - 0.02 * t, 6), pink);
  const head = pts[pts.length - 1];
  mesh(g, sphere(10, 8), pink, head.x, head.y, head.z).scale.setScalar(0.14);
  const down = pose === 2;
  const beak = mesh(g, cone(0.07, 0.36, 7), toon(C.beakBase), head.x, head.y + (down ? -0.16 : -0.06), head.z + (down ? 0.02 : 0.18));
  beak.rotation.x = down ? Math.PI : Math.PI / 2 + 0.7;
  const bt = mesh(g, cone(0.05, 0.16, 6), toon(C.beakTip), head.x, head.y + (down ? -0.4 : -0.18), head.z + (down ? 0.02 : 0.32));
  bt.rotation.x = down ? Math.PI : Math.PI / 2 + 1.2;
  return g;
}

// A tern perched (static, baked).
function perchedTern(parent, x, y, z, ry, s = 1) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.scale.setScalar(s);
  parent.add(g);
  const b = mesh(g, sphere(10, 8), toon(C.tern), 0, 0.32, 0);
  b.scale.set(0.24, 0.24, 0.45);
  mesh(g, sphere(9, 7), toon(C.ternCap), 0, 0.55, 0.32).scale.setScalar(0.17);
  const bk = mesh(g, cone(0.06, 0.32, 6), toon(C.ternBeak), 0, 0.53, 0.55);
  bk.rotation.x = Math.PI / 2;
  const w = mesh(g, sphere(9, 6), toon(C.ternWing), 0, 0.38, -0.12);
  w.scale.set(0.26, 0.12, 0.5);
  return g;
}

// Ship hull for the wreck (the Doubloon Bay merchantman's lines): u = 0 stern .. 1 bow.
function hullProfile(u, L, W, D) {
  const hw = (W / 2) * (u < 0.2 ? 0.8 + 0.2 * Math.sin((u / 0.2) * Math.PI * 0.5) : Math.pow(Math.max(0, Math.cos(((u - 0.2) / 0.8) * Math.PI * 0.5)), 0.55));
  const rim = 0.45 * Math.pow(Math.max(0, (u - 0.66) / 0.34), 2) + 0.7 * Math.pow(Math.max(0, (0.22 - u) / 0.22), 1.5);
  const dd = D * (u < 0.5 ? 0.86 + 0.14 * (u / 0.5) : 1 - 0.38 * ((u - 0.5) / 0.5));
  return [Math.max(0.06, hw), rim, dd];
}
function hullGeo(L, W, D, u0 = 0) {
  const NU = 18;
  const NV = 12;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= NU; i++) {
    const u = u0 + ((1 - u0) * i) / NU;
    const [hw, rim, dd] = hullProfile(u, L, W, D);
    for (let j = 0; j <= NV; j++) {
      const th = (j / NV) * Math.PI;
      pos.push(hw * Math.cos(th), rim - dd * Math.pow(Math.sin(th), 0.8), (u - 0.5) * L);
    }
  }
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < NV; j++) {
      const a = i * (NV + 1) + j;
      const b = a + NV + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const c = pos.length / 3;
  pos.push(0, -0.05, 0);
  const ring = [];
  for (let i = 0; i <= NU; i++) ring.push(i * (NV + 1));
  for (let i = NU; i >= 0; i--) ring.push(i * (NV + 1) + NV);
  for (let k = 0; k < ring.length; k++) idx.push(c, ring[k], ring[(k + 1) % ring.length]);
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g = smoothGeo(g);
  // outward faces: the keel's normal must point down
  const p = g.attributes.position;
  let keel = 0;
  for (let i = 1; i < p.count; i++) if (p.getY(i) < p.getY(keel)) keel = i;
  if (g.attributes.normal.getY(keel) > 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
    g.computeVertexNormals();
  }
  return g;
}
function barrelGeo() {
  return geo('barrel', () => lathe([[0, -0.75], [0.48, -0.75], [0.6, -0.3], [0.64, 0], [0.6, 0.3], [0.48, 0.75], [0, 0.75]], 12));
}
function addBarrel(parent, x, y, z, rx, rz, s = 1) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.set(rx, 0, rz);
  g.scale.setScalar(s);
  parent.add(g);
  mesh(g, barrelGeo(), toon(C.barrel));
  for (const hy of [-0.42, 0.42]) mesh(g, geo('hoop', () => new THREE.TorusGeometry(0.62, 0.07, 5, 14)), toon(C.hoop), 0, hy, 0).rotation.x = Math.PI / 2;
  return g;
}
function hillGeometry() {
  return lathe([[1.0, 0], [0.92, 0.18], [0.74, 0.42], [0.52, 0.66], [0.3, 0.86], [0.12, 0.97], [0, 1.0]], 22);
}

// ---------------------------------------------------------------------------
// Shallows on the GPU: sandbars, the wreck's coral reef and the atolls' inner lagoons, translucent patches with a
// bright rim that ride exactly the ocean's swell.
// ---------------------------------------------------------------------------
function buildShallows(bars, lagoons, flats, rng, timeU, ampU) {
  const pos = [];
  const col = [];
  const ext = []; // per vertex: (sand ripples 0..1, unused, rim parameter t or -1)
  const index = [];
  const add = (x, z, c, a, sand = 0, lift = 0, t = -1) => {
    pos.push(x, lift, z);
    col.push(c.r, c.g, c.b, a);
    ext.push(sand, 0, t);
    return pos.length / 3 - 1;
  };
  const disc = (x, z, R, rings, seg, lift = 0, rimmed = true) => {
    const c0 = add(x, z, rings[0][1], rings[0][2], rings[0][3], lift, rimmed ? 0 : -1);
    let prev = null;
    for (let ri = 1; ri < rings.length; ri++) {
      const [t, c, a, s] = rings[ri];
      const row = [];
      for (let k = 0; k < seg; k++) {
        const th = (k / seg) * Math.PI * 2;
        const r = R(th) * t;
        row.push(add(x + Math.cos(th) * r, z + Math.sin(th) * r, c, a, s, lift, rimmed ? t : -1));
      }
      for (let k = 0; k < seg; k++) {
        const k1 = (k + 1) % seg;
        if (!prev) index.push(c0, row[k1], row[k]);
        else index.push(prev[k], row[k1], row[k], prev[k], prev[k1], row[k1]);
      }
      prev = row;
    }
  };
  const hex = (h) => new THREE.Color(h);
  const cCore = hex(0xfdeec2);
  const cSand = hex(0xf6e0a6);
  const cEdge = hex(0xecd08e);
  const cShelf = hex(0x9ff0dc);
  const cReef = hex(0x7ff0dc);
  const cReefIn = hex(0x9af6e4);
  const beds = [0xe07fae, 0x8f84e4, 0x1fa8ac, 0xf0ad7c, 0xf5d36a].map(hex);
  for (const sb of bars) {
    const a1 = rng() * 6.28;
    const a2 = rng() * 6.28;
    const R = (th) => sb.r * (1 + 0.07 * Math.sin(3 * th + a1) + 0.045 * Math.sin(5 * th + a2));
    if (sb.kind === 'coral') {
      disc(sb.x, sb.z, R, [[0, cReefIn, 0.72, 0], [0.5, cReefIn, 0.7, 0], [0.82, cReef, 0.66, 0], [0.9, cShelf, 0.62, 0], [1.08, cShelf, 0.5, 0]], 48);
      // coral beds painted into the reef
      const placed = [];
      for (let i = 0, tries = 0; i < 9 && tries < 90; tries++) {
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(rng()) * sb.r * 0.72;
        const x = sb.x + Math.cos(a) * d;
        const z = sb.z + Math.sin(a) * d;
        const br = 1.1 + rng() * 1.4;
        if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < p[2] + br + 0.3)) continue;
        placed.push([x, z, br]);
        const c = beds[i % beds.length];
        const ph = rng() * 6.28;
        disc(x, z, (th) => br * (1 + 0.22 * Math.sin(3 * th + ph) + 0.1 * Math.sin(5 * th + ph * 2)), [[0, c, 0.66, 0], [1, c, 0.62, 0]], 14, 0.01, false);
        i++;
      }
    } else {
      // [radius factor, colour, alpha, sand ripples]; the shader draws the lacy foam rim round t = 0.9 .. 1.0
      disc(sb.x, sb.z, R, [[0, cCore, 0.95, 1], [0.45, cSand, 0.93, 1], [0.78, cEdge, 0.86, 1], [0.9, cShelf, 0.7, 0], [1.08, cShelf, 0.6, 0]], 48);
    }
  }
  // reef flats (under the stilt village): pale turquoise over the shore foam, the lacy foam rim at the edge
  const cFlat = hex(0x8fefdc);
  const cFlatIn = hex(0xb6f4e0);
  for (const f of flats) {
    disc(f.x, f.z, f.R, [[0, cFlatIn, 0.9, 1], [0.55, cFlatIn, 0.9, 1], [0.8, cFlat, 0.86, 0], [0.9, cShelf, 0.72, 0], [1.0, cShelf, 0.62, 0]], 64);
  }
  // the atolls' inner lagoons: calm turquoise over the shore foam, a sandy floor and a few coral beds
  const cLag = hex(0x8ef4e2);
  const cLagIn = hex(0xb4f7e4);
  for (const lg of lagoons) {
    disc(lg.x, lg.z, () => lg.r, [[0, cLagIn, 0.92, 1], [0.45, cLagIn, 0.9, 1], [0.8, cLag, 0.88, 0], [1, cLag, 0.0, 0]], 40, 0.0, false);
    for (let i = 0; i < 4; i++) {
      const a = rng() * Math.PI * 2;
      const d = (0.3 + 0.35 * rng()) * lg.r;
      const br = 0.8 + rng() * 0.7;
      const c = beds[(i + 1) % beds.length];
      const ph = rng() * 6.28;
      disc(lg.x + Math.cos(a) * d, lg.z + Math.sin(a) * d, (th) => br * (1 + 0.2 * Math.sin(3 * th + ph)), [[0, c, 0.55, 0], [1, c, 0.5, 0]], 12, 0.01, false);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setAttribute('aExt', new THREE.Float32BufferAttribute(ext, 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: true });
  m.name = 'atolls-shallows';
  noOutline(m);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU;
    sh.uniforms.uAmp = ampU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform float uAmp;
attribute vec3 aExt;
varying vec3 vExt;
varying vec2 vWxz;
${WAVE_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vExt = aExt;
{
  vec2 wxz = (modelMatrix * vec4(position.x, 0.0, position.z, 1.0)).xz;
  vWxz = wxz;
  float far = abs(wxz.x - cameraPosition.x) + abs(wxz.y - cameraPosition.z);
  transformed.y = waveH(wxz, uTime, uAmp) + 0.07 + position.y + far * 0.0013;
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vExt;\nvarying vec2 vWxz;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    // sand ripples: soft wavy bands across the bar
    float rp = sin(dot(vWxz, vec2(0.83, 0.56)) * 1.7 + 0.9 * sin(vWxz.x * 0.21 + vWxz.y * 0.13));
    float band = smoothstep(0.55, 0.85, rp) * vExt.x;
    diffuseColor.rgb *= 1.0 - 0.08 * band;
    // rims: a band of lacy white foam, breathing a little, with a crisp outer edge
    if (vExt.z >= 0.0) {
      float t = vExt.z;
      float wob = 0.022 * sin(vWxz.x * 1.1 + vWxz.y * 0.8 + uTime * 0.7) + 0.014 * sin(vWxz.x * 2.6 - vWxz.y * 2.2 - uTime * 0.4);
      float inner = 0.925 + wob;
      float outer = 1.0 + wob * 0.4;
      float fw = max(fwidth(t), 1e-4);
      float foam = smoothstep(inner - fw, inner + fw, t);
      diffuseColor = mix(diffuseColor, vec4(1.0, 1.0, 1.0, 0.93), foam);
      diffuseColor.a *= 1.0 - smoothstep(outer - fw, outer + fw, t);
    }
  }`);
  };
  m.customProgramCacheKey = () => 'atolls-shallows-v1';
  const me = new THREE.Mesh(g, m);
  me.name = 'atolls-shallows';
  me.userData.keep = true;
  me.frustumCulled = false; // displaced on the GPU
  me.renderOrder = 2;
  return me;
}

// ---------------------------------------------------------------------------
// The storm wall on the eastern horizon: towering bruise-purple thunderheads (one mesh, painted in cel bands by its
// own shader, which lets only some of the fog in so it still reads purple far away), and the rain curtains hanging
// from its base (one mesh, streaks falling).
// ---------------------------------------------------------------------------
const STORM_VERT = `
varying vec3 vN;
varying vec3 vW;
varying float vDepth;
void main() {
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const STORM_FRAG = `
uniform vec3 uLit;
uniform vec3 uMid;
uniform vec3 uShade;
uniform vec3 uBase;
uniform vec3 uSunDir;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFogAmount;
uniform float uCloudBase;
varying vec3 vN;
varying vec3 vW;
varying float vDepth;
float edge(float v, float th) {
  float w = max(fwidth(v), 1e-4) * 0.75;
  return smoothstep(th - w, th + w, v);
}
void main() {
  vec3 n = normalize(vN);
  vec3 L = normalize(uSunDir);
  float scallop = 0.08 * sin(vW.x * 0.09 + vW.z * 0.05) + 0.05 * sin(vW.y * 0.13 - vW.z * 0.07);
  float l = dot(n, L) * 0.55 + n.y * 0.5 + scallop;
  vec3 col = mix(uShade, uMid, edge(l, -0.05));
  col = mix(col, uLit, edge(l, 0.42));
  // the dark, flat underside over the rain
  col = mix(uBase, col, edge(vW.y - uCloudBase + 4.0 * sin(vW.z * 0.04 + vW.x * 0.03), 7.0));
  float f = smoothstep(uFogNear, uFogFar, vDepth) * uFogAmount;
  gl_FragColor = vec4(mix(col, uFog, f), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function buildStorm(own) {
  const r = mulberry32(5150);
  const parts = [];
  const a0 = STORM.from * DEG;
  const a1 = STORM.to * DEG;
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n + (r() - 0.5) * 0.04;
    const mid = 1 - Math.abs((i / n) * 2 - 1); // 1 in the east, 0 at the ends
    const dist = STORM.dist + r() * 40 - 22 * mid;
    const cx = Math.cos(a) * dist;
    const cz = Math.sin(a) * dist;
    const H = (34 + r() * 40) * (0.45 + 0.75 * mid) + 20;
    const base = STORM.base + (r() - 0.5) * 4;
    const nP = 3 + Math.floor(H / 22);
    for (let k = 0; k < nP; k++) {
      const f = k / Math.max(1, nP - 1);
      const rr = (30 - 12 * f) * (0.8 + r() * 0.4);
      const g = new THREE.SphereGeometry(rr, 16, 11);
      const y = base + rr * 0.55 + f * (H - rr * 0.6);
      g.translate(cx + (r() - 0.5) * 18, y, cz + (r() - 0.5) * 18);
      // flat bottoms on the lowest puffs (the cloud base)
      const p = g.attributes.position;
      for (let v = 0; v < p.count; v++) if (p.getY(v) < base) p.setY(v, base + (p.getY(v) - base) * 0.1);
      g.deleteAttribute('uv');
      parts.push(g);
    }
    // anvils on the tallest towers
    if (H > 70 && r() < 0.7) {
      const g = new THREE.SphereGeometry(1, 18, 9);
      g.scale(44 + r() * 16, 10, 30 + r() * 10);
      g.rotateY(-a);
      g.translate(cx + (r() - 0.5) * 10, base + H + 8, cz);
      g.deleteAttribute('uv');
      parts.push(g);
    }
  }
  const geom = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  geom.computeVertexNormals();
  const material = new THREE.ShaderMaterial({
    name: 'atolls-storm',
    uniforms: {
      uLit: { value: new THREE.Color(0xb89dd2) },
      uMid: { value: new THREE.Color(0x7a5e9e) },
      uShade: { value: new THREE.Color(0x4f3c74) },
      uBase: { value: new THREE.Color(0x342852) },
      uSunDir: { value: new THREE.Vector3().fromArray(palette.sunDir).normalize() },
      uFog: { value: new THREE.Color(palette.fogColor) },
      uFogNear: { value: 150 },
      uFogFar: { value: 560 },
      uFogAmount: { value: 0.42 },
      uCloudBase: { value: STORM.base },
    },
    vertexShader: STORM_VERT,
    fragmentShader: STORM_FRAG,
    fog: false,
  });
  noOutline(material);
  own.push(material);
  const m = new THREE.Mesh(geom, material);
  m.name = 'atolls-storm';
  m.userData.keep = true;
  m.frustumCulled = false;
  return m;
}
const RAIN_VERT = `
attribute vec3 aRain;
varying vec3 vRain;
varying float vDepth;
void main() {
  vRain = aRain;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const RAIN_FRAG = `
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFogAmount;
varying vec3 vRain;
varying float vDepth;
${NOISE_GLSL}
void main() {
  float s = vRain.x; // metres along the curtain
  float v = vRain.y; // 0 at the sea .. 1 at the cloud base
  float fade = vRain.z; // 0 at the curtain's ends
  float streak = aNoise(vec2(s * 0.55, v * 2.0 + uTime * 0.9)) * 0.6 + aNoise(vec2(s * 1.7, v * 5.0 + uTime * 2.3)) * 0.4;
  float a = (0.34 + 0.32 * smoothstep(0.35, 0.75, streak)) * smoothstep(0.0, 0.25, fade) * (0.55 + 0.45 * smoothstep(0.0, 0.35, v));
  float f = smoothstep(uFogNear, uFogFar, vDepth) * uFogAmount;
  gl_FragColor = vec4(mix(uColor, uFog, f), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function buildRain(own, timeU) {
  const r = mulberry32(8080);
  const pos = [];
  const att = [];
  const idx = [];
  const curtains = [[-46, 9], [-30, 6], [-13, 10], [4, 7], [20, 9], [37, 7], [52, 8]];
  for (const [deg, half] of curtains) {
    const rad = STORM.dist - 30 + r() * 20;
    const top = STORM.base + 6;
    const cols = 18;
    const rows = 4;
    const tilt = (r() - 0.5) * 10; // the curtain slants a little in the wind
    const start = pos.length / 3;
    let s = 0;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const a = (deg + (u * 2 - 1) * half) * DEG;
      const wob = Math.sin(u * 9 + deg) * 3;
      if (c) s += (half * 2 * DEG * rad) / cols;
      for (let k = 0; k <= rows; k++) {
        const v = k / rows;
        const rr = rad + wob + tilt * (1 - v);
        pos.push(Math.cos(a) * rr, -1 + v * (top + 1 + 2 * Math.sin(u * 7 + deg)), Math.sin(a) * rr);
        att.push(s, v, Math.sin(Math.PI * u));
      }
    }
    for (let c = 0; c < cols; c++) {
      for (let k = 0; k < rows; k++) {
        const a = start + c * (rows + 1) + k;
        const b = a + rows + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aRain', new THREE.Float32BufferAttribute(att, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({
    name: 'atolls-rain',
    uniforms: {
      uTime: timeU,
      uColor: { value: new THREE.Color(0x5c4c86) },
      uFog: { value: new THREE.Color(palette.fogColor) },
      uFogNear: { value: 150 },
      uFogFar: { value: 560 },
      uFogAmount: { value: 0.42 },
    },
    vertexShader: RAIN_VERT,
    fragmentShader: RAIN_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  noOutline(material);
  own.push(material);
  const m = new THREE.Mesh(g, material);
  m.name = 'atolls-rain';
  m.userData.keep = true;
  m.frustumCulled = false;
  m.renderOrder = 3;
  return m;
}

// ---------------------------------------------------------------------------
// Rigs: rigid pieces sharing ONE vertex-coloured mesh, each moved by its own matrix on the CPU every frame (a few
// thousand vertices): the sea turtles and the terns cost 2 draw calls (with their ink line), the spouts' flotsam 1.
// ---------------------------------------------------------------------------
function buildRig(pieces, material, name) {
  // pieces: [THREE.Group] each built round its own pivot
  const flat = [];
  let nv = 0;
  let ni = 0;
  for (const g of pieces) {
    g.updateMatrixWorld(true);
    const parts = [];
    g.traverse((o) => {
      if (!o.isMesh) return;
      const src = o.geometry;
      const geom = src.index && !src.attributes.normal ? src.toNonIndexed() : new THREE.BufferGeometry().copy(src);
      for (const k of Object.keys(geom.attributes)) if (k !== 'position' && k !== 'normal') geom.deleteAttribute(k);
      if (!geom.attributes.normal) geom.computeVertexNormals();
      ensureIndex(geom);
      geom.applyMatrix4(o.matrixWorld);
      parts.push({ geom, color: o.material.color.clone() });
      nv += geom.attributes.position.count;
      ni += geom.index.count;
    });
    flat.push(parts);
  }
  const base = new Float32Array(nv * 3);
  const baseN = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
  const ranges = [];
  let v0 = 0;
  let i0 = 0;
  for (const parts of flat) {
    const first = v0;
    for (const q of parts) {
      const p = q.geom.attributes.position.array;
      const n = q.geom.attributes.normal.array;
      base.set(p, v0 * 3);
      baseN.set(n, v0 * 3);
      for (let k = 0; k < q.geom.attributes.position.count; k++) q.color.toArray(col, (v0 + k) * 3);
      const ix = q.geom.index.array;
      for (let k = 0; k < ix.length; k++) idx[i0 + k] = ix[k] + v0;
      i0 += ix.length;
      v0 += q.geom.attributes.position.count;
      q.geom.dispose();
    }
    ranges.push([first, v0 - first]);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(base), 3).setUsage(THREE.DynamicDrawUsage));
  geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(baseN), 3).setUsage(THREE.DynamicDrawUsage));
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geom.setIndex(new THREE.BufferAttribute(idx, 1));
  const m = new THREE.Mesh(geom, material);
  m.name = name;
  m.frustumCulled = false; // the pieces move every frame
  m.userData.keep = true;
  const pos = geom.attributes.position.array;
  const nor = geom.attributes.normal.array;
  const e = new Float32Array(16);
  return {
    mesh: m,
    // Place piece i with the matrix m4 (THREE.Matrix4); scale 0 hides it.
    set(i, m4) {
      const [first, count] = ranges[i];
      m4.toArray(e);
      // normals: the matrix without its (uniform or per-axis) scale, renormalised below
      for (let v = first * 3, end = (first + count) * 3; v < end; v += 3) {
        const x = base[v];
        const y = base[v + 1];
        const z = base[v + 2];
        pos[v] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pos[v + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pos[v + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const nx = baseN[v];
        const ny = baseN[v + 1];
        const nz = baseN[v + 2];
        let ox = e[0] * nx + e[4] * ny + e[8] * nz;
        let oy = e[1] * nx + e[5] * ny + e[9] * nz;
        let oz = e[2] * nx + e[6] * ny + e[10] * nz;
        const l = Math.hypot(ox, oy, oz) || 1;
        ox /= l;
        oy /= l;
        oz /= l;
        nor[v] = ox;
        nor[v + 1] = oy;
        nor[v + 2] = oz;
      }
    },
    commit() {
      geom.attributes.position.needsUpdate = true;
      geom.attributes.normal.needsUpdate = true;
    },
    dispose() {
      geom.dispose();
    },
  };
}

// A sea turtle in pieces (each round its pivot): the body, then the flippers FL, FR, BL, BR. Local +z = forward.
function turtlePieces() {
  const body = new THREE.Group();
  const shell = mesh(body, sphere(12, 8), toon(C.turtleShell), 0, 0.05, 0);
  shell.scale.set(0.95, 0.42, 1.2);
  const belly = mesh(body, sphere(10, 6), toon(C.turtleBelly), 0, -0.08, 0);
  belly.scale.set(0.9, 0.22, 1.12);
  for (const [px, pz, r] of [[0, 0.45, 0.32], [0, -0.2, 0.34], [0.45, 0.15, 0.26], [-0.45, 0.15, 0.26], [0.42, -0.5, 0.24], [-0.42, -0.5, 0.24]]) {
    const pl = mesh(body, geo('plate6', () => new THREE.CylinderGeometry(1, 1, 0.08, 6, 1)), toon(C.turtlePlate), px, 0.36 - Math.hypot(px, pz) * 0.18, pz);
    pl.scale.set(r, 1, r);
    pl.rotation.set(-pz * 0.3, 0, px * 0.45);
  }
  const head = mesh(body, sphere(10, 7), toon(C.turtleSkin), 0, 0.12, 1.45);
  head.scale.set(0.34, 0.28, 0.4);
  for (const sx of [-0.18, 0.18]) mesh(body, sphere(6, 4), toon(C.pupil), sx, 0.2, 1.68).scale.setScalar(0.06);
  const tail = mesh(body, cone(0.12, 0.4, 6), toon(C.turtleSkin), 0, 0, -1.3);
  tail.rotation.x = -Math.PI / 2;
  const flipper = (side, front) => {
    const g = new THREE.Group();
    const f = mesh(g, sphere(10, 6), toon(C.turtleSkin), side * (front ? 0.75 : 0.45), 0, front ? -0.2 : -0.1);
    f.scale.set(front ? 0.8 : 0.42, 0.07, front ? 0.3 : 0.24);
    f.rotation.y = side * (front ? -0.45 : 0.4);
    return g;
  };
  return [body, flipper(1, true), flipper(-1, true), flipper(1, false), flipper(-1, false)];
}
// A tern in two pieces: the body, then both wings (flapped by scaling).
function ternPieces() {
  const body = new THREE.Group();
  const b = mesh(body, sphere(9, 6), toon(C.tern));
  b.scale.set(0.28, 0.28, 0.62);
  mesh(body, sphere(7, 5), toon(C.ternCap), 0, 0.14, 0.48).scale.setScalar(0.2);
  const bk = mesh(body, cone(0.07, 0.38, 6), toon(C.ternBeak), 0, 0.12, 0.78);
  bk.rotation.x = Math.PI / 2;
  // a forked tail: two streamers splayed in a V
  for (const side of [1, -1]) {
    const tl = mesh(body, cone(0.09, 0.62, 5), toon(C.tern), side * 0.1, 0.02, -0.82);
    tl.rotation.set(-Math.PI / 2, 0, 0);
    tl.rotation.order = 'YXZ';
    tl.rotation.y = -side * 0.32;
    tl.scale.set(1, 1, 0.45);
  }
  // gull wings: the inner half raised, the outer half angled down and swept back, so the bird reads as a bird and
  // not a little aeroplane when it glides
  const wings = new THREE.Group();
  for (const side of [1, -1]) {
    const inner = mesh(wings, sphere(9, 5), toon(C.ternWing), side * 0.5, 0.12, 0.04);
    inner.scale.set(0.52, 0.06, 0.3);
    inner.rotation.z = side * 0.42;
    const outer = mesh(wings, sphere(9, 5), toon(C.ternWing), side * 1.44, 0.17, -0.12);
    outer.scale.set(0.58, 0.05, 0.22);
    outer.rotation.order = 'YXZ';
    outer.rotation.y = side * 0.3;
    outer.rotation.z = -side * 0.34;
  }
  return [body, wings];
}

// ---------------------------------------------------------------------------
// Waterspouts (drawn from the mechanics' snapshot; see the header)
// ---------------------------------------------------------------------------
const SPOUT = { cloudY: 22, cloudR: 10, funnelW: 4.4, core: 6, pull: 14, slots: 4 };
const FUNNEL_VERT = `
uniform float uTime;
uniform float uLen;
uniform float uWidth;
uniform float uSway;
uniform vec3 uSunDir;
varying vec2 vUv;
varying float vShade;
#include <common>
#include <fog_pars_vertex>
void main() {
  float v = uv.y; // 0 at the cloud .. 1 at the sea
  float ang = uv.x * 6.2831853;
  // a bell that grows out of the cloud's underside and narrows into a rope, flaring a little where it meets the sea
  float bell = 1.0 - smoothstep(0.0, 0.24, v);
  float prof = mix(1.0, 0.3, pow(v, 0.6)) + 0.32 * smoothstep(0.84, 1.0, v) + 0.95 * bell * bell;
  float wob = 1.0 + 0.09 * sin(ang * 3.0 + v * 11.0 - uTime * 7.0);
  float rad = uWidth * prof * wob;
  vec2 off = vec2(sin(uTime * 0.9 + v * 2.4), cos(uTime * 0.7 + v * 2.0)) * uSway * v * v;
  vec3 p = vec3(cos(ang) * rad + off.x, -v * uLen, sin(ang) * rad + off.y);
  vec3 n = normalize(vec3(cos(ang), 0.2, sin(ang)));
  vShade = dot(normalize(mat3(modelMatrix) * n), normalize(uSunDir));
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FUNNEL_FRAG = `
uniform float uTime;
uniform float uTwist;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uInk;
varying vec2 vUv;
varying float vShade;
#include <common>
#include <fog_pars_fragment>
void main() {
  // three bands (white, pale grey, blue-grey) wound twice round the funnel, twisting up as they turn
  float b3 = fract(vUv.x * 2.0 + vUv.y * uTwist - uTime * 0.85) * 3.0;
  vec3 col = b3 < 1.0 ? uC0 : (b3 < 2.0 ? uC1 : uC2);
  float fb = max(fwidth(b3), 1e-4);
  float d = min(fract(b3), 1.0 - fract(b3));
  col = mix(col, uInk, (1.0 - smoothstep(0.6 * fb, 1.6 * fb, d)) * 0.6);
  float fs = max(fwidth(vShade), 1e-4);
  col *= mix(0.8, 1.0, smoothstep(-0.12 - fs, -0.12 + fs, vShade));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
const SKIRT_VERT = `
uniform float uTime;
uniform float uAmp;
uniform float uSpray;
attribute vec3 aSk;
varying vec3 vSk;
#include <common>
#include <fog_pars_vertex>
${WAVE_GLSL}
void main() {
  vSk = aSk;
  vec4 wp = modelMatrix * vec4(position.x, 0.0, position.z, 1.0);
  if (aSk.z < 0.5) {
    wp.y = waveH(wp.xz, uTime, uAmp) + 0.12;
  } else {
    vec2 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
    wp.y = waveH(c, uTime, uAmp) + position.y * (0.35 + 0.65 * uSpray);
  }
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const SKIRT_FRAG = `
uniform float uTime;
uniform float uSwirl;
uniform float uSpray;
uniform float uSpin;
uniform vec3 uDark;
uniform vec3 uFoam;
uniform vec3 uSprayCol;
varying vec3 vSk;
#include <common>
#include <fog_pars_fragment>
${NOISE_GLSL}
void main() {
  vec4 col;
  if (vSk.z < 0.5) {
    float r = vSk.x;
    float a = vSk.y;
    // three spiral arms winding in, turning
    float arms = fract(a / 6.2831853 * 3.0 + log(max(r, 0.4)) * 1.4 + uSpin);
    float fa = max(fwidth(arms), 1e-4) * 1.2;
    float arm = smoothstep(0.0, 0.06 + fa, arms) * (1.0 - smoothstep(0.3, 0.36 + fa, arms));
    float fr = max(fwidth(r), 1e-4);
    float core = 1.0 - smoothstep(6.0 - fr, 6.0 + fr, r);
    float ring = 1.0 - smoothstep(0.3 - fr, 0.3 + fr, abs(r - 6.0));
    float outer = (1.0 - core) * (1.0 - smoothstep(10.0, 14.0, r));
    // the core: dark water with paler arms; outside: thin white streaks drifting in (the pull)
    float aCore = core * (0.66 + 0.16 * arm);
    float aOut = outer * arm * 0.42;
    float aRing = ring * 0.95;
    vec3 cCore = mix(uDark, mix(uDark, uFoam, 0.5), arm);
    float al = aCore + aOut + aRing;
    vec3 c = (cCore * aCore + uFoam * (aOut + aRing)) / max(al, 1e-4);
    col = vec4(c, min(al, 1.0) * uSwirl);
  } else {
    float u = vSk.x;
    float v = vSk.y;
    float n = aNoise(vec2(u * 16.0 + uTime * 1.5, v * 3.5 - uTime * 2.6)) * 0.6 + aNoise(vec2(u * 7.0 - uTime * 0.6, v * 2.2 - uTime * 1.9) + 7.3) * 0.4;
    float fn = max(fwidth(n), 1e-4);
    float puff = smoothstep(0.56 - fn, 0.56 + fn, n + (1.0 - v) * 0.42 - v * 0.15);
    col = vec4(mix(uFoam, uSprayCol, v), puff * uSpray * smoothstep(0.0, 0.06, v + 0.03));
  }
  gl_FragColor = col;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function funnelGeometry() {
  const NA = 30;
  const NY = 28;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= NY; i++) {
    for (let j = 0; j <= NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      pos.push(Math.cos(a) * 4, -(i / NY) * SPOUT.cloudY, Math.sin(a) * 4); // (the shader places the vertices)
      uv.push(j / NA, i / NY);
    }
  }
  for (let i = 0; i < NY; i++) {
    for (let j = 0; j < NA; j++) {
      const a = i * (NA + 1) + j;
      const b = a + NA + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
function skirtGeometry() {
  const pos = [];
  const att = [];
  const idx = [];
  // the water disc: polar rings out to the pull zone
  const SEG = 48;
  const radii = [0.4, 1, 1.8, 2.7, 3.6, 4.5, 5.3, 5.75, 6.0, 6.25, 6.7, 7.6, 8.8, 10.2, 11.8, 13.2, 14.6];
  for (const r of radii) {
    for (let k = 0; k <= SEG; k++) {
      const a = (k / SEG) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      att.push(r, a, 0);
    }
  }
  for (let i = 0; i < radii.length - 1; i++) {
    for (let k = 0; k < SEG; k++) {
      const a = i * (SEG + 1) + k;
      const b = a + SEG + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  // the spray skirt: a ragged white bell round the funnel's foot
  const start = pos.length / 3;
  const SA = 32;
  const rows = 7;
  for (let i = 0; i <= rows; i++) {
    const v = i / rows;
    const rr = 5.6 - 3.3 * Math.pow(v, 0.8);
    for (let k = 0; k <= SA; k++) {
      const a = (k / SA) * Math.PI * 2;
      pos.push(Math.cos(a) * rr, v * 5.5, Math.sin(a) * rr);
      att.push(k / SA, v, 1);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let k = 0; k < SA; k++) {
      const a = start + i * (SA + 1) + k;
      const b = a + SA + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSk', new THREE.Float32BufferAttribute(att, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
function cloudGeometry() {
  // a squat swirling storm cloud: lumps round a dark flat underside (vertex colours: paler on top)
  const parts = [];
  const r = mulberry32(4242);
  const top = new THREE.Color(0x766a9c);
  const under = new THREE.Color(0x3b3160);
  const lumps = [[0, 1.5, 0, 6.5]];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.3;
    const d = 6 + r() * 3;
    lumps.push([Math.cos(a) * d, 0.6 + r() * 1.6, Math.sin(a) * d, 3.6 + r() * 1.6]);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.7;
    lumps.push([Math.cos(a) * 3, 3.6 + r(), Math.sin(a) * 3, 3.4 + r()]);
  }
  for (const [x, y, z, rr] of lumps) {
    const g = new THREE.SphereGeometry(rr, 14, 10);
    g.translate(x, y, z);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let v = 0; v < p.count; v++) {
      if (p.getY(v) < 0) p.setY(v, p.getY(v) * 0.15);
      c.copy(under).lerp(top, smooth(-0.2, 2.4, p.getY(v)));
      c.toArray(col, v * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    parts.push(g);
  }
  const g = mergeGeometries(parts, false);
  for (const q of parts) q.dispose();
  g.computeVertexNormals();
  return g;
}
// Spout flotsam, one set per spout slot: two barrels and a startled fish (each round its own pivot).
function debrisPieces() {
  const barrel = () => {
    const g = new THREE.Group();
    mesh(g, barrelGeo(), toon(C.barrel));
    for (const hy of [-0.42, 0.42]) mesh(g, geo('hoop', () => new THREE.TorusGeometry(0.62, 0.07, 5, 14)), toon(C.hoop), 0, hy, 0).rotation.x = Math.PI / 2;
    return g;
  };
  const fish = new THREE.Group();
  const b = mesh(fish, sphere(14, 10), toon(C.fish));
  b.scale.set(0.42, 0.62, 1.05);
  const tail = mesh(fish, cone(0.55, 0.8, 8), toon(C.fishFin), 0, 0, -1.25);
  tail.rotation.x = Math.PI / 2;
  tail.scale.set(0.25, 1, 1);
  const fin = mesh(fish, cone(0.3, 0.6, 6), toon(C.fishFin), 0, 0.6, -0.1);
  fin.scale.set(0.25, 1, 1);
  // big startled eyes
  for (const sx of [-0.33, 0.33]) {
    mesh(fish, sphere(10, 8), toon(C.eye), sx, 0.18, 0.55).scale.setScalar(0.24);
    mesh(fish, sphere(8, 6), toon(C.pupil), sx * 1.25, 0.2, 0.62).scale.setScalar(0.08);
  }
  const mouth = mesh(fish, geo('fishMouth', () => new THREE.TorusGeometry(0.12, 0.04, 5, 10)), toon(C.mouth), 0, -0.12, 1.02);
  mouth.scale.set(1, 1.3, 1);
  return [barrel(), barrel(), fish];
}

// Read one spout of the mechanics' snapshot: { id, x, z, form (0..1, 1 = touched down), collapse (0..1) } or null.
function readSpout(s, i) {
  if (!s || typeof s !== 'object' || !finite(s.x) || !finite(s.z)) return null;
  const st = String(s.state ?? s.phase ?? s.stage ?? 'active').toLowerCase();
  let k = finite(s.k) ? s.k : finite(s.t) && finite(s.T) && s.T > 0 ? s.t / s.T : null;
  if (k === null && finite(s.age) && finite(s.life) && s.life > 0) k = s.age / s.life;
  k = clamp01(k ?? 0.5);
  let form = 1;
  let collapse = 0;
  if (st.startsWith('form') || st === 'warn' || st === 'warning') form = k;
  else if (st.startsWith('collap') || st === 'dying' || st === 'end' || st === 'gone') collapse = st === 'gone' ? 1 : k;
  const id = s.id ?? s.key ?? null;
  return { id: id === null ? null : String(id), x: s.x, z: s.z, form, collapse, i };
}

function createSpoutView(root, own, reduced, ampU) {
  const sunDir = new THREE.Vector3().fromArray(palette.sunDir).normalize();
  const fGeo = funnelGeometry();
  const sGeo = skirtGeometry();
  const cGeo = cloudGeometry();
  const cMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(3) });
  noOutline(cMat);
  own.push(cMat);
  const geos = [fGeo, sGeo, cGeo];
  const slots = [];
  for (let i = 0; i < SPOUT.slots; i++) {
    const group = new THREE.Group();
    group.name = `atolls-spout-${i}`;
    group.visible = false;
    group.userData.keep = true;
    const cloud = new THREE.Mesh(cGeo, cMat);
    cloud.position.y = SPOUT.cloudY;
    cloud.frustumCulled = false;
    const fu = {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: { value: 0 },
      uLen: { value: 0 },
      uWidth: { value: SPOUT.funnelW },
      uSway: { value: 1.6 },
      uTwist: { value: 2.2 },
      uSunDir: { value: sunDir },
      uC0: { value: new THREE.Color(0xf6f9ff) },
      uC1: { value: new THREE.Color(0xc4cedd) },
      uC2: { value: new THREE.Color(0x7c8eab) },
      uInk: { value: new THREE.Color(0x3d4a66) },
    };
    const fMat = new THREE.ShaderMaterial({ name: 'atolls-funnel', uniforms: fu, vertexShader: FUNNEL_VERT, fragmentShader: FUNNEL_FRAG, fog: true, side: THREE.DoubleSide });
    noOutline(fMat);
    const funnel = new THREE.Mesh(fGeo, fMat);
    funnel.position.y = SPOUT.cloudY + 0.5;
    funnel.frustumCulled = false;
    const su = {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: { value: 0 },
      uAmp: ampU,
      uSwirl: { value: 0 },
      uSpray: { value: 0 },
      uSpin: { value: 0 },
      uDark: { value: new THREE.Color(0x232e5c) },
      uFoam: { value: new THREE.Color(0xffffff) },
      uSprayCol: { value: new THREE.Color(0xd2e2f2) },
    };
    const sMat = new THREE.ShaderMaterial({ name: 'atolls-spout-water', uniforms: su, vertexShader: SKIRT_VERT, fragmentShader: SKIRT_FRAG, fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    noOutline(sMat);
    const skirt = new THREE.Mesh(sGeo, sMat);
    skirt.frustumCulled = false;
    skirt.renderOrder = 3;
    group.add(cloud, funnel, skirt);
    root.add(group);
    own.push(fMat, sMat);
    slots.push({ group, cloud, funnel, skirt, fu, su, id: null, x: 0, z: 0, form: 0, collapse: 0, live: false, gone: 0, act: 0, spin: 0, seed: i * 1.7 });
  }
  // the flotsam: one shared rig for every slot (3 pieces per slot)
  const dMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(3) });
  noOutline(dMat);
  own.push(dMat);
  const pieces = [];
  for (let i = 0; i < SPOUT.slots; i++) pieces.push(...debrisPieces());
  const rig = buildRig(pieces, dMat, 'atolls-spout-flotsam');
  rig.mesh.renderOrder = 1;
  root.add(rig.mesh);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < SPOUT.slots * 3; i++) rig.set(i, zero);
  rig.commit();
  rig.mesh.visible = false;

  let last = 0;
  function update(t, dt, list) {
    const step = finite(dt) ? Math.min(0.1, Math.max(0, dt)) : Math.max(0, Math.min(0.1, t - last));
    last = t;
    const reducedMotion = reduced(); // (calm: no sway, a slower twist and swirl)
    const spouts = [];
    if (Array.isArray(list)) for (let i = 0; i < list.length && spouts.length < 8; i++) {
      const s = readSpout(list[i], i);
      if (s) spouts.push(s);
    }
    // match the snapshot to the slots: by id, then by place (a spout moves at ~2.5 u/s), then a free slot
    for (const sl of slots) sl.seen = false;
    for (const s of spouts) {
      let sl = s.id !== null ? slots.find((o) => o.live && o.id === s.id) : null;
      if (!sl && s.id === null) {
        let best = 9;
        for (const o of slots) {
          if (!o.live || o.seen || o.id !== null) continue;
          const d = Math.hypot(o.x - s.x, o.z - s.z);
          if (d < best) {
            best = d;
            sl = o;
          }
        }
      }
      if (!sl) {
        sl = slots.find((o) => !o.live && !o.group.visible) || slots.find((o) => !o.live);
        if (!sl) continue;
        sl.live = true;
        sl.id = s.id;
        sl.gone = 0;
        sl.act = 0;
        sl.spin = 0;
      }
      sl.seen = true;
      sl.x = s.x;
      sl.z = s.z;
      sl.form = s.form;
      sl.collapse = s.collapse;
    }
    let anyDebris = false;
    slots.forEach((sl, si) => {
      // a spout gone from the snapshot winds down on its own (visual only)
      if (sl.live && !sl.seen) {
        sl.live = false;
        sl.gone = Math.max(sl.collapse, 0.001);
      }
      if (!sl.live) {
        if (sl.gone > 0) sl.gone = Math.min(1, sl.gone + step / 0.8);
        if (!sl.gone || sl.gone >= 1) {
          sl.group.visible = false;
          sl.gone = 0;
          for (let k = 0; k < 3; k++) rig.set(si * 3 + k, zero);
          return;
        }
      }
      const form = sl.live ? sl.form : 1;
      const col = sl.live ? sl.collapse : sl.gone;
      const touched = form >= 1 && col <= 0;
      sl.act = touched ? sl.act + step : Math.max(0, sl.act - step);
      sl.spin += step * (reducedMotion ? 0.35 : 0.8);
      const ease = (x) => x * x * (3 - 2 * x);
      sl.group.visible = true;
      sl.group.position.set(sl.x, 0, sl.z);
      // the cloud gathers, then the funnel lowers out of it and touches down as the warning ends
      const cs = (0.35 + 0.65 * ease(clamp01(form * 1.6))) * (1 - 0.75 * col);
      sl.cloud.scale.set(cs * (SPOUT.cloudR / 9), cs, cs * (SPOUT.cloudR / 9));
      sl.cloud.rotation.y = -sl.spin * 0.6;
      const down = ease(clamp01((form - 0.12) / 0.88));
      sl.fu.uTime.value = reducedMotion ? t * 0.4 : t;
      sl.fu.uSway.value = reducedMotion ? 0 : 1.6;
      sl.fu.uLen.value = SPOUT.cloudY * 1.02 * down * (1 - col);
      sl.fu.uWidth.value = SPOUT.funnelW * (0.55 + 0.45 * down) * (1 - 0.7 * col);
      sl.funnel.visible = sl.fu.uLen.value > 0.3;
      sl.su.uTime.value = t;
      sl.su.uSpin.value = sl.spin;
      sl.su.uSwirl.value = Math.min(smooth(0, 0.3, form), 1 - col);
      sl.su.uSpray.value = Math.min(smooth(0, 0.7, sl.act), 1 - col) * (touched || col > 0 ? 1 : 0);
      // flotsam: the barrels bob in toward the swirl while it forms, then fly round the funnel; the fish leaps
      const base = si * 3;
      const wv = (x, z) => waveHeight(x, z, t, ampU.value);
      const lift = smooth(0, 1.2, sl.act) * (1 - col);
      for (let k = 0; k < 3; k++) {
        const fishK = k === 2;
        const ph = sl.seed + k * 2.1;
        const show = fishK ? lift : Math.min(smooth(0.2, 0.6, form), 1 - col);
        if (show <= 0.01) {
          rig.set(base + k, zero);
          continue;
        }
        anyDebris = true;
        const ang = ph + sl.spin * (fishK ? 3.2 : 2.4) * (1 + 0.15 * k);
        const rad = fishK ? 3.2 : (1 - lift) * (11 - 5 * smooth(0, 1, form)) + lift * (4.3 + 0.6 * k);
        const x = sl.x + Math.cos(ang) * rad;
        const z = sl.z + Math.sin(ang) * rad;
        const bob = wv(x, z) - 0.15;
        const rise = fishK ? 5 + 5 * (0.5 - 0.5 * Math.cos(t * 1.3 + ph)) : (2 + 7 * (0.5 - 0.5 * Math.cos(t * (0.9 + 0.2 * k) + ph)));
        p.set(x, bob + rise * lift, z);
        if (fishK) e.set(Math.sin(t * 6 + ph) * 0.3, -ang, Math.sin(t * 9) * 0.25);
        else e.set(t * (1.1 + k * 0.4) * lift + ph, ph, t * 0.7 * lift + Math.PI / 2);
        q.setFromEuler(e);
        sc.setScalar(show * (fishK ? 0.9 : 1));
        rig.set(base + k, m4.compose(p, q, sc));
      }
    });
    rig.mesh.visible = anyDebris;
    if (anyDebris) rig.commit();
  }
  function dispose() {
    for (const g of geos) g.dispose();
    rig.dispose();
  }
  return { update, dispose, slots };
}

// ---------------------------------------------------------------------------
// Gameplay data
// ---------------------------------------------------------------------------
// Each loop gets the angular speed that rides it at about SPOUT_SPEED (Ramanujan's ellipse perimeter).
function makeLoops() {
  return LOOPS.map((L) => {
    const a = L.rx;
    const b = L.rz;
    const per = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
    const w = (SPOUT_SPEED * 2 * Math.PI) / per;
    return { cx: L.cx, cz: L.cz, rx: L.rx, rz: L.rz, w: r6(w * L.dir), phase: L.phase };
  });
}
// The shortest distance from (x, z) to a loop's path.
function loopDist(L, x, z) {
  let best = Infinity;
  for (let k = 0; k < 96; k++) {
    const a = (k / 96) * Math.PI * 2;
    best = Math.min(best, Math.hypot(L.cx + L.rx * Math.cos(a) - x, L.cz + L.rz * Math.sin(a) - z));
  }
  return best;
}
// Farthest-point order: the first point nearest `first`, then each next one farthest from those picked.
function spreadOrder(cand, first, max) {
  if (!cand.length) return [];
  let f = cand[0];
  for (const c of cand) if (Math.hypot(c.x - first.x, c.z - first.z) < Math.hypot(f.x - first.x, f.z - first.z)) f = c;
  const out = [f];
  const minD = cand.map((c) => Math.hypot(c.x - f.x, c.z - f.z));
  while (out.length < max) {
    let bi = -1;
    let bd = -1;
    for (let i = 0; i < cand.length; i++) {
      if (minD[i] > bd) {
        bd = minD[i];
        bi = i;
      }
    }
    if (bi < 0 || bd < 6) break;
    const c = cand[bi];
    out.push(c);
    for (let i = 0; i < cand.length; i++) minD[i] = Math.min(minD[i], Math.hypot(cand[i].x - c.x, cand[i].z - c.z));
  }
  return out.map((p) => ({ x: p.x, z: p.z }));
}
function openWater(start, colliders, reefs, loops, { dMin, dMax, rim, colPad, reefPad, loopPad }) {
  const cand = [];
  for (let x = -WORLD_R; x <= WORLD_R; x += 3) {
    for (let z = -WORLD_R; z <= WORLD_R; z += 3) {
      if (Math.hypot(x, z) > WORLD_R - rim) continue;
      const ds = Math.hypot(x - start.x, z - start.z);
      if (ds < dMin || ds > dMax) continue;
      if (colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + colPad)) continue;
      if (reefs.some((r) => Math.hypot(x - r.x, z - r.z) < r.r + reefPad)) continue;
      if (loopPad > 0 && loops.some((L) => loopDist(L, x, z) < loopPad)) continue;
      cand.push({ x, z });
    }
  }
  return cand;
}
function computeSpawns(start, colliders, reefs, loops) {
  const opts = { dMin: 58, dMax: 92, rim: 16, colPad: 12, reefPad: 8, loopPad: 16 };
  let cand = openWater(start, colliders, reefs, loops, opts);
  if (cand.length < 12) cand = openWater(start, colliders, reefs, loops, { ...opts, loopPad: 0 });
  const ahead = { x: start.x + Math.sin(start.h) * 72, z: start.z + Math.cos(start.h) * 72 };
  return spreadOrder(cand, ahead, 12);
}
function computeCrates(start, colliders, reefs, loops) {
  const cand = openWater(start, colliders, reefs, loops, { dMin: 30, dMax: 100, rim: 20, colPad: 8, reefPad: 3, loopPad: 18 });
  // the first crate a little ahead and to the side of the start
  const first = { x: start.x + Math.sin(start.h + 0.9) * 45, z: start.z + Math.cos(start.h + 0.9) * 45 };
  return spreadOrder(cand, first, 8);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
export function build(scene, ctx = {}) {
  checkWaves();
  const rng = typeof ctx.rng === 'function' ? ctx.rng : mulberry32(20261017);
  // prefers-reduced-motion: ctx.reducedMotion (a boolean, or a function read every frame), else the media query
  const reduced = () => {
    if (typeof ctx.reducedMotion === 'function') return !!ctx.reducedMotion();
    if (typeof ctx.reducedMotion === 'boolean') return ctx.reducedMotion;
    try {
      return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    } catch {
      return false;
    }
  };
  const rand = mulberry32(19740307); // fixed: the level always looks the same
  const noise = makeNoise(11);
  GEO = new Map();
  const root = new THREE.Group();
  root.name = 'env:atolls';
  scene.add(root);
  const painted = new THREE.Group(); // terrain and rock (own shaders), merged per material
  const props = new THREE.Group(); // everything else: baked into vertex colours
  root.add(painted, props);
  const own = [];
  const ownGeos = [];
  const timeU = { value: 0 };
  const ampU = { value: palette.waveAmp };
  const terrainMat = makeTerrainMaterial();
  const rockMat = makeRockMaterial();
  own.push(terrainMat, rockMat);
  const colliders = [];
  const addCol = (x, z, r, h) => colliders.push({ x: r2(x), z: r2(z), r: r2(r), h: r2(h) });

  // ----- islands: terrain, colliders, palms and shrubs -----
  function island(isl, opts = {}) {
    const sample = islandSampler(isl, noise);
    mesh(painted, buildTerrainGeometry(isl, sample, noise), terrainMat);
    if (opts.colliders !== false) {
      for (const [x, z, r] of isl.lumps) {
        let hMax = 0;
        for (let k = 0; k < 9; k++) {
          const a = (k / 8) * Math.PI * 2;
          const d = k === 8 ? 0 : r * 0.5;
          hMax = Math.max(hMax, sample(x + Math.cos(a) * d, z + Math.sin(a) * d)[0]);
        }
        addCol(x, z, r, Math.min(14, Math.max(3, hMax + (opts.tall ?? 6))));
      }
    }
    return sample;
  }
  function decorate(isl, sample, opts) {
    const lo = !!isl.far;
    const placed = (opts.keepOut || []).slice();
    const free = (x, z, r) => placed.every((p) => Math.hypot(p[0] - x, p[1] - z) > p[2] + r);
    const area = isl.lumps.reduce((s, l) => s + Math.PI * l[2] * l[2], 0);
    const pick = () => {
      let t = rand() * area;
      for (const l of isl.lumps) {
        t -= Math.PI * l[2] * l[2];
        if (t <= 0) return l;
      }
      return isl.lumps[0];
    };
    // leaning palms along the beach, leaning out over the sea
    for (let i = 0, tries = 0; i < (opts.palms || 0) && tries < 600; tries++) {
      const [lx, lz, lr] = pick();
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * lr;
      const x = lx + Math.cos(a) * d;
      const z = lz + Math.sin(a) * d;
      const [h, g, sd] = sample(x, z);
      if (sd > -1.2 || h < 0.4 || g > (opts.palmInland ?? 3)) continue;
      if (!free(x, z, lo ? 3.4 : 2.1)) continue;
      placed.push([x, z, lo ? 3.4 : 2.1]);
      const [ox, oz] = gradSd(isl.lumps, x, z);
      const ja = (rand() - 0.5) * 0.9;
      const dx = ox * Math.cos(ja) - oz * Math.sin(ja);
      const dz = ox * Math.sin(ja) + oz * Math.cos(ja);
      addPalm(props, x, h, z, dx, dz, lo ? 1.6 : 0.9 + rand() * 0.3, rand, lo);
      i++;
    }
    // shrubs on the grass
    for (let i = 0, tries = 0; i < (opts.bushes || 0) && tries < 400; tries++) {
      const [lx, lz, lr] = pick();
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * lr;
      const x = lx + Math.cos(a) * d;
      const z = lz + Math.sin(a) * d;
      const [h, g] = sample(x, z);
      if (g < 0.6) continue;
      const s = (lo ? 2.2 : 0.8 + rand() * 0.6);
      if (!free(x, z, s * 1.1)) continue;
      placed.push([x, z, s * 1.1]);
      addBush(props, x, h - 0.15, z, s, rand);
      i++;
    }
  }

  // the small ring atolls
  const lagoons = [];
  for (const a of ATOLLS) {
    const isl = { lumps: ringLumps(a), beach: 3.0, hillH: 0.45, hillW: 2, res: 0.8 };
    const sample = island(isl, { tall: 7 });
    decorate(isl, sample, { palms: 13, bushes: 8, keepOut: [[a.x, a.z, a.R - 3.5]] });
    lagoons.push({ x: a.x, z: a.z, r: a.R - 4.2 });
  }

  // ----- Turtle Island -----
  const T = TURTLE;
  const tf = (() => {
    const dx = START.x - T.x;
    const dz = START.z - T.z;
    const l = Math.hypot(dx, dz);
    return { fx: dx / l, fz: dz / l };
  })();
  const tsx = -tf.fz; // the turtle's side (one of them; the other is -)
  const tsz = tf.fx;
  const TP = (along, side) => [T.x + tf.fx * along + tsx * side, T.z + tf.fz * along + tsz * side];
  const polar = (deg, r) => TP(Math.cos(deg * DEG) * r, Math.sin(deg * DEG) * r);
  const turtleFace = Math.atan2(tf.fx, tf.fz);
  {
    const lumps = [[T.x, T.z, T.islandR]];
    const add = ([x, z], r) => lumps.push([r2(x), r2(z), r]);
    add(TP(21.5, 0), 5);
    add(TP(26.5, 0), 4.6);
    for (const s of [1, -1]) {
      add(polar(56 * s, 21), 4.6);
      add(polar(74 * s, 27.5), 3.4);
      add(polar(136 * s, 19.5), 4.2);
      add(polar(151 * s, 23.5), 3.0);
    }
    add(TP(-21.5, 0), 2.8);
    const isl = { lumps, beach: 5.2, hillH: 0.2, hillW: 2, res: 0.85 };
    const sample = islandSampler(isl, noise);
    mesh(painted, buildTerrainGeometry(isl, sample, noise), terrainMat);
    // colliders: the shell hill, the neck, the head rock, the flippers and the tail
    addCol(T.x, T.z, T.islandR, 14);
    for (const L of lumps.slice(1)) addCol(L[0], L[1], L[2], 3);
    const [hx, hz] = TP(28, 0);
    addCol(hx, hz, 5.2, 8);
    // the shell hill: a dome of green plates over dark seams, the marginal plates round its rim
    const R = T.shellR;
    const H = T.shellH;
    const shell = new THREE.Group();
    props.add(shell);
    const prof = [];
    for (let i = 0; i <= 16; i++) {
      const ph = (i / 16) * Math.PI * 0.5;
      prof.push([R * Math.cos(ph), H * Math.sin(ph)]);
    }
    prof.unshift([R * 1.02, -0.8]);
    mesh(shell, lathe(prof, 48), toon(C.seam), T.x, 0.25, T.z);
    const surf = (x, z) => {
      const dx = x - T.x;
      const dz = z - T.z;
      const rho = Math.min(R * 0.995, Math.hypot(dx, dz));
      const y = H * Math.sqrt(Math.max(0, 1 - (rho * rho) / (R * R)));
      const n = new THREE.Vector3(dx / (R * R), y / (H * H), dz / (R * R)).normalize();
      return { p: new THREE.Vector3(x, y + 0.25, z), n };
    };
    const up = new THREE.Vector3(0, 1, 0);
    const plate = (x, z, r, colour, inner) => {
      const { p, n } = surf(x, z);
      const q = new THREE.Quaternion().setFromUnitVectors(up, n);
      const qy = new THREE.Quaternion().setFromAxisAngle(up, turtleFace + Math.PI / 6);
      const g = new THREE.Group();
      g.position.copy(p).addScaledVector(n, 0.12);
      g.quaternion.copy(q).multiply(qy);
      shell.add(g);
      mesh(g, cyl(r, r * 1.04, 0.8, 6), toon(colour));
      if (inner) mesh(g, cyl(r * 0.52, r * 0.56, 0.4, 6), toon(C.plateIn), 0, 0.42, 0);
    };
    // vertebral row, costal plates either side, marginal ring
    for (const a of [-9.6, -4.8, 0, 4.8, 9.6]) plate(...TP(a, 0), 2.55, C.plate[0], true);
    for (const a of [-7.2, -2.4, 2.4, 7.2]) for (const s of [1, -1]) plate(...TP(a, s * 5.6), 2.55, C.plate[1], true);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + 0.07;
      const [x, z] = TP(Math.cos(a) * 14.4, Math.sin(a) * 14.4);
      plate(x, z, 1.75, C.plateM, false);
    }
    // palms and a shrub growing on its back
    for (const [a, s, k] of [[-2.4, 2.6, 1.0], [2.0, -2.2, 0.92], [-7.0, -1.0, 0.82]]) {
      const [x, z] = TP(a, s);
      const { p } = surf(x, z);
      const dx = x - T.x;
      const dz = z - T.z;
      const l = Math.hypot(dx, dz) || 1;
      addPalm(props, x, p.y + 0.5, z, dx / l, dz / l, k, rand);
    }
    {
      const [x, z] = TP(5, 1.5);
      addBush(props, x, surf(x, z).p.y + 0.35, z, 1.1, rand);
    }
    // the neck and the head rock, with big friendly eyes and a smile
    const neckPts = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      const [x, z] = TP(14.5 + u * 11.5, 0);
      neckPts.push(new THREE.Vector3(x, 5.2 - 2.0 * u + 0.8 * Math.sin(u * Math.PI), z));
    }
    mesh(props, tubeAlong(neckPts, (u) => 2.9 - 0.5 * u, 14), toon(C.skin));
    const head = new THREE.Group();
    const [hx2, hz2] = TP(28.2, 0);
    head.position.set(hx2, 4.3, hz2);
    head.rotation.y = turtleFace;
    props.add(head);
    const skull = mesh(head, geo('turtleHead', () => bumpyRock(77, 0.05, 22, 16)), toon(C.skin));
    skull.scale.set(4.1, 3.5, 4.7);
    for (const [sx, sy, sz, sr] of [[1.6, 2.4, -1.5, 0.7], [-1.9, 2.1, -1.0, 0.55], [0.4, 3.1, -2.6, 0.6], [-0.9, 1.0, -3.6, 0.5], [2.9, 0.3, -2.4, 0.5], [-3.0, -0.2, -2.0, 0.6]]) {
      const sp = mesh(head, sphere(10, 8), toon(C.skinSpot), sx, sy, sz);
      sp.scale.set(sr, sr * 0.45, sr);
      sp.lookAt(new THREE.Vector3(sx * 3, sy * 3, sz * 3).add(head.position));
    }
    for (const s of [1, -1]) {
      const ex = s * 2.35;
      mesh(head, sphere(16, 12), toon(C.eye), ex, 1.35, 3.0).scale.setScalar(1.35);
      mesh(head, sphere(12, 10), toon(C.pupil), ex * 0.97, 1.3, 4.2).scale.setScalar(0.62);
      mesh(head, sphere(8, 6), toon(0xffffff, { outline: false }), ex * 0.93 + 0.18, 1.62, 4.72).scale.setScalar(0.19);
      // a friendly brow
      const brow = mesh(head, geo('brow', () => new THREE.TorusGeometry(1, 0.085, 6, 14, Math.PI * 0.56)), toon(C.mouth), ex, 1.4, 3.05);
      brow.rotation.set(0.62, 0, Math.PI * 0.22);
      brow.scale.setScalar(1.6);
      // a rosy cheek
      const ck = mesh(head, sphere(10, 8), toon(C.cheek), s * 2.9, -0.45, 2.6);
      ck.scale.set(0.75, 0.42, 0.5);
      ck.rotation.y = s * 0.7;
    }
    const smile = mesh(head, geo('smile', () => new THREE.TorusGeometry(1.7, 0.17, 6, 18, Math.PI * 0.75)), toon(C.mouth), 0, -0.55, 4.05);
    smile.rotation.set(0.25, 0, Math.PI + Math.PI * 0.125);
    for (const s of [1, -1]) mesh(head, sphere(8, 6), toon(C.mouth), s * 0.5, 0.75, 4.62).scale.setScalar(0.17);
    // flippers lying on their sand spits, and the tail
    const flip = (base, tip, w, th) => {
      const [bx, bz] = base;
      const [ex, ez] = tip;
      const g = new THREE.Group();
      g.position.set((bx + ex) / 2, 0.75, (bz + ez) / 2);
      g.rotation.y = Math.atan2(ex - bx, ez - bz);
      props.add(g);
      const len = Math.hypot(ex - bx, ez - bz) + w * 1.4;
      const f = mesh(g, sphere(18, 10), toon(C.skin));
      f.scale.set(w, th, len / 2);
      const sp = mesh(g, sphere(10, 8), toon(C.skinSpot), 0, th * 0.75, len * 0.15);
      sp.scale.set(w * 0.35, th * 0.3, w * 0.45);
    };
    for (const s of [1, -1]) {
      flip(polar(50 * s, 17.5), polar(76 * s, 28.5), 2.4, 0.95);
      flip(polar(132 * s, 17), polar(152 * s, 24.2), 1.9, 0.8);
    }
    const tail = mesh(props, cone(1.25, 4.4, 10), toon(C.skin), ...(() => {
      const [x, z] = TP(-21.2, 0);
      return [x, 0.85, z];
    })());
    tail.rotation.set(-Math.PI / 2 + 0.12, 0, 0);
    tail.rotation.order = 'YXZ';
    tail.rotation.y = turtleFace + Math.PI;
  }

  // ----- the stilt village -----
  {
    const V = VILLAGE;
    const isl = { lumps: [[V.x, V.z, V.r], [V.x - 5, V.z - 8, 6], [V.x - 4, V.z + 8, 6.5]], beach: 3.4, hillH: 1.3, hillW: 3.5, res: 0.8 };
    const sample = island(isl, { tall: 7 });
    const huts = V.huts.map((deg) => {
      const a = deg * DEG;
      return { a, x: V.x + Math.cos(a) * V.hutR, z: V.z + Math.sin(a) * V.hutR };
    });
    const keepOut = [];
    // plank walks on posts: an arc through the huts, spokes to the island
    const walk = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / 2.2));
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n;
        const x = x0 + (x1 - x0) * u;
        const z = z0 + (z1 - z0) * u;
        const pl = mesh(props, rbox(1.5, 0.16, (len / n) * 0.92, 0.05), toon(k % 3 ? C.plank : C.plankDark), x, 2.25, z);
        pl.rotation.y = Math.atan2(x1 - x0, z1 - z0);
        if (k % 2 === 0) for (const s of [-0.7, 0.7]) {
          const nx = (z1 - z0) / len;
          const nz = -(x1 - x0) / len;
          mesh(props, cyl(0.11, 0.13, 4.2, 6), toon(C.stilt), x + nx * s, 0.2, z + nz * s);
        }
      }
    };
    for (let i = 0; i < huts.length - 1; i++) {
      const a = huts[i];
      const b = huts[i + 1];
      const ux = b.x - a.x;
      const uz = b.z - a.z;
      const l = Math.hypot(ux, uz);
      walk(a.x + (ux / l) * 3.1, a.z + (uz / l) * 3.1, b.x - (ux / l) * 3.1, b.z - (uz / l) * 3.1);
    }
    for (const h of [huts[0], huts[2], huts[4]]) {
      const ix = V.x + Math.cos(h.a) * (V.r - 1.5);
      const iz = V.z + Math.sin(h.a) * (V.r - 1.5);
      walk(ix, iz, h.x - Math.cos(h.a) * 3.1, h.z - Math.sin(h.a) * 3.1);
    }
    huts.forEach((h, i) => {
      stiltHut(props, h.x, h.z, Math.atan2(Math.cos(h.a), Math.sin(h.a)), i === 2 ? 1.12 : 0.95 + (i % 2) * 0.08);
      addCol(h.x, h.z, 3.8, 11); // (as tall as the conch's tip: the camera keeps out of the roofs)
    });
    // the water the walks close in, and the walks themselves
    for (let deg = V.huts[0]; deg <= V.huts[V.huts.length - 1]; deg += 6) {
      const a = deg * DEG;
      addCol(V.x + Math.cos(a) * 15.6, V.z + Math.sin(a) * 15.6, 3.6, 3);
    }
    for (let i = 0; i < huts.length - 1; i++) {
      const a = (huts[i].a + huts[i + 1].a) / 2;
      addCol(V.x + Math.cos(a) * (V.hutR - 0.4), V.z + Math.sin(a) * (V.hutR - 0.4), 2.2, 3);
    }
    // canoes moored by the huts, a big hut and a fire ring on the island, nets drying
    for (const [deg, d, ry] of [[-48, 24.6, 0.4], [17, 25, -0.3], [50, 24.4, 0.9]]) {
      const a = deg * DEG;
      canoe(props, V.x + Math.cos(a) * d, V.z + Math.sin(a) * d, a + ry + Math.PI / 2);
    }
    {
      const x = V.x - 3;
      const z = V.z - 1;
      const y = sample(x, z)[0];
      mesh(props, cyl(3.4, 3.6, 0.5, 18), toon(C.plank), x, y + 0.2, z);
      mesh(props, cyl(2.5, 2.55, 2.4, 16), toon(C.woven), x, y + 1.6, z);
      for (const hy of [0.9, 1.7]) mesh(props, geo('wovenBand2', () => new THREE.TorusGeometry(2.55, 0.07, 5, 24)), toon(C.wovenDark), x, y + 0.6 + hy, z).rotation.x = Math.PI / 2;
      mesh(props, rbox(1.1, 1.7, 0.3, 0.12), toon(C.door), x + 2.45, y + 1.2, z, Math.PI / 2);
      conchRoof(props, x, y + 2.75, z, -Math.PI / 2, 1.18);
      keepOut.push([x, z, 5]);
      const fx = V.x + 4.5;
      const fz = V.z + 3.5;
      const fy = sample(fx, fz)[0];
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const st = mesh(props, sphere(8, 6), toon(0x9a8f88), fx + Math.cos(a) * 0.95, fy + 0.08, fz + Math.sin(a) * 0.95);
        st.scale.set(0.34, 0.24, 0.3);
      }
      for (const r of [0.5, -0.6]) {
        const lg = mesh(props, cyl(0.13, 0.13, 1.5, 6), toon(C.plankDark), fx, fy + 0.2, fz, r);
        lg.rotation.z = Math.PI / 2;
      }
      keepOut.push([fx, fz, 2]);
      const nx = V.x - 6;
      const nz = V.z + 7;
      const ny = sample(nx, nz)[0];
      for (const o of [-1.8, 1.8]) mesh(props, cyl(0.09, 0.11, 2.4, 6), toon(C.plankDark), nx + o, ny + 1.0, nz);
      const net = mesh(props, rbox(3.6, 1.3, 0.1, 0.04), toon(C.net), nx, ny + 1.35, nz);
      net.rotation.z = 0.05;
      keepOut.push([nx, nz, 2.6]);
    }
    decorate(isl, sample, { palms: 14, bushes: 10, keepOut, palmInland: 5 });
  }

  // ----- the toppled lighthouse on its coral rock -----
  {
    const L = LIGHT;
    const rocks = [[0, 0, 6.2, 4.6, 0.55], [3.3, -2.6, 3.4, 2.4, 0.3], [-3.4, 2.2, 3.0, 2.0, 0.75]];
    rocks.forEach(([ox, oz, r, h, tone], i) => {
      const m = mesh(painted, rockTag(bumpyRock(300 + i, 0.18, 18, 12), tone, i === 0 ? 1 : 0), rockMat, L.x + ox, -0.9, L.z + oz, rand() * 6);
      m.scale.set(r, h, r * 0.92);
    });
    addCol(L.x, L.z, L.r, 7);
    // coral heads round the rock's foot
    const kinds = ['brain', 'fan', 'stag', 'tube'];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rand() * 0.4;
      const d = L.r + 0.6 + rand() * 1.6;
      addCoral(props, L.x + Math.cos(a) * d, L.z + Math.sin(a) * d, rand, kinds[i % 4]);
    }
    // the stump where it snapped, white below and red above, its top jagged
    const top = 3.4;
    const stumpG = geo('stump', () => {
      const g = new THREE.CylinderGeometry(2.05, 2.2, 2.4, 16, 3);
      const p = g.attributes.position;
      const r = mulberry32(12);
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 1.1) p.setY(i, p.getY(i) - r() * 0.9);
      g.computeVertexNormals();
      return g;
    });
    const sx = L.x - Math.cos(L.fall) * 1.0;
    const sz = L.z - Math.sin(L.fall) * 1.0;
    mesh(props, stumpG, toon(C.lhWhite), sx, top + 1.1, sz);
    mesh(props, cyl(2.24, 2.24, 0.9, 16), toon(C.lhRed), sx, top + 0.25, sz);
    // the fallen tower: base by the stump, lantern in the sea
    const fx = Math.cos(L.fall);
    const fz = Math.sin(L.fall);
    const bx = sx + fx * 2.6;
    const bz = sz + fz * 2.6;
    const by = top + 1.3;
    const tilt = Math.atan2(by - 1.0, L.len);
    const tower = new THREE.Group();
    tower.position.set(bx, by, bz);
    tower.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(fx * Math.cos(tilt), -Math.sin(tilt), fz * Math.cos(tilt)));
    props.add(tower);
    const bands = 7;
    for (let k = 0; k < bands; k++) {
      const y0 = (k / bands) * 13.6;
      const y1 = ((k + 1) / bands) * 13.6;
      const rb = 2.1 - 0.5 * (y0 / 13.6);
      const rt = 2.1 - 0.5 * (y1 / 13.6);
      mesh(tower, cyl(rt, rb, y1 - y0 + 0.02, 18), toon(k % 2 ? C.lhRed : C.lhWhite), 0, (y0 + y1) / 2, 0);
    }
    // the broken end: a jagged white rim
    mesh(tower, geo('brokenRim', () => {
      const g = new THREE.CylinderGeometry(2.1, 2.12, 0.9, 16, 2, true);
      const p = g.attributes.position;
      const r = mulberry32(19);
      for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.2) p.setY(i, p.getY(i) - r() * 0.8);
      g.computeVertexNormals();
      return g;
    }), toon(C.lhWhite), 0, -0.2, 0);
    for (let k = 0; k < 3; k++) {
      const w = mesh(tower, rbox(0.5, 0.9, 0.3, 0.1), toon(C.lhDark), 0, 3 + k * 3.6, 1.95 - k * 0.12);
      w.rotation.x = -0.04;
    }
    mesh(tower, cyl(2.35, 2.35, 0.32, 18), toon(C.lhDark), 0, 13.75, 0);
    mesh(tower, geo('rail', () => new THREE.TorusGeometry(2.25, 0.08, 6, 24)), toon(C.lhDark), 0, 14.6, 0).rotation.x = Math.PI / 2;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      mesh(tower, cyl(0.06, 0.06, 0.8, 5), toon(C.lhDark), Math.cos(a) * 2.25, 14.2, Math.sin(a) * 2.25);
      mesh(tower, cyl(0.08, 0.08, 1.9, 5), toon(C.lhDark), Math.cos(a + 0.2) * 1.32, 14.9, Math.sin(a + 0.2) * 1.32);
    }
    mesh(tower, cyl(1.25, 1.25, 1.8, 16), toon(C.glass), 0, 14.85, 0);
    mesh(tower, geo('lhDome', () => new THREE.SphereGeometry(1.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), toon(C.lhRed), 0, 15.8, 0);
    mesh(tower, sphere(10, 8), toon(C.gold), 0, 17.45, 0).scale.setScalar(0.32);
    mesh(tower, cyl(0.07, 0.07, 0.4, 5), toon(C.lhDark), 0, 17.2, 0);
    for (const along of [8.4, 13]) addCol(bx + fx * along, bz + fz * along, 2.5, 4);
    // terns on the fallen tower
    tower.updateMatrixWorld(true);
    for (const [ty, a, ry] of [[4.5, 0.3, 0.6], [9.6, -0.2, 2.6]]) {
      const p = new THREE.Vector3(Math.cos(a) * 1.9, ty, Math.sin(a) * 1.9).applyMatrix4(tower.matrixWorld);
      perchedTern(props, p.x, p.y + 0.15, p.z, ry, 1.15);
    }
  }

  // ----- the wreck on its coral reef -----
  {
    const W = WRECK;
    const g = new THREE.Group();
    g.position.set(W.x, 1.05, W.z);
    g.rotation.order = 'YXZ';
    g.rotation.set(-0.2, 2.4, 0.7);
    props.add(g);
    mesh(g, hullGeo(11.5, 4.0, 2.1, 0.18), toon(C.hull), 0, 0.6, 0.9);
    mesh(g, rbox(3.6, 0.14, 8.0, 0.05), toon(C.hullLight), 0, 0.62, 2.0);
    // deck planking and an open hatch, so the slab reads as her deck
    for (const px of [-1.05, -0.35, 0.35, 1.05]) mesh(g, rbox(0.07, 0.04, 7.6, 0.015), toon(C.plankDark), px, 0.71, 2.0);
    mesh(g, rbox(1.3, 0.12, 1.2, 0.04), toon(C.hull), 0, 0.72, 3.3);
    mesh(g, rbox(0.95, 0.14, 0.85, 0.03), toon(0x2a1a10), 0, 0.74, 3.3);
    // the broken stern: ribs standing out of the sea
    for (let k = 0; k < 4; k++) {
      const rib = mesh(g, geo('rib', () => new THREE.TorusGeometry(1.85, 0.17, 6, 12, Math.PI * 1.05)), toon(C.hullLight), 0, 0.75, -4.0 - k * 0.85);
      rib.rotation.z = Math.PI + 0.05;
      rib.scale.set(1, 0.9 - k * 0.12, 1);
    }
    mesh(g, cyl(0.22, 0.28, 3.4, 8), toon(C.hull), 0, 2.4, 1.4);
    g.updateMatrixWorld(true);
    const mast = mesh(props, cyl(0.2, 0.26, 9, 8), toon(C.hull), W.x + 3.8, 0.55, W.z + 1.4, -0.6);
    mast.rotation.z = Math.PI / 2 - 0.04;
    const sail = mesh(props, geo('tornSail', () => {
      const s = new THREE.Shape();
      const pts = [[-2.2, 0], [2.2, 0], [2.0, -1.3], [1.4, -2.4], [0.8, -1.6], [0.1, -2.7], [-0.7, -1.7], [-1.4, -2.3], [-2.2, -1.1], [-2.2, 0]];
      s.moveTo(...pts[0]);
      for (const q of pts.slice(1)) s.lineTo(...q);
      return new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 });
    }), toon(C.sail), W.x + 3.2, 0.62, W.z + 2.6, 0);
    sail.rotation.set(-Math.PI / 2 + 0.06, 0, 0.9);
    addBarrel(props, W.x - 4.6, 0.3, W.z - 3.4, 1.4, 0.3);
    addBarrel(props, W.x + 1.2, 0.2, W.z - 5.6, 0.2, 1.5, 0.9);
    {
      const ch = new THREE.Group();
      ch.position.set(W.x - 2.4, 0.55, W.z + 4.2);
      ch.rotation.set(0.2, 0.7, 0.15);
      props.add(ch);
      mesh(ch, rbox(1.5, 0.9, 1.0, 0.12), toon(C.chest));
      const lid = mesh(ch, geo('chestLid', () => new THREE.CylinderGeometry(0.5, 0.5, 1.5, 12, 1, false, 0, Math.PI)), toon(C.chest), 0, 0.42, -0.25);
      lid.rotation.set(-0.9, 0, Math.PI / 2);
      for (let k = 0; k < 5; k++) mesh(ch, cyl(0.16, 0.16, 0.06, 10), toon(C.gold, { emissive: 0x8a5a00, emissiveIntensity: 0.5 }), -0.4 + k * 0.2, 0.48 + (k % 2) * 0.05, 0.05 * k).rotation.x = 0.2;
    }
    addCol(W.x, W.z, W.r, 4);
    // her bow and stern ends (the hull is 11.5 long)
    for (const along of [4.6, -3.4]) addCol(W.x + Math.sin(2.4) * along, W.z + Math.cos(2.4) * along, 2.6, 4);
    // reef rocks and coral heads awash round it
    const kinds = ['brain', 'fan', 'stag', 'tube'];
    for (let i = 0; i < 12; i++) {
      const a = rand() * Math.PI * 2;
      const d = 6.5 + rand() * 4.5;
      addCoral(props, W.x + Math.cos(a) * d, W.z + Math.sin(a) * d, rand, kinds[i % 4]);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      const m = mesh(painted, rockTag(bumpyRock(400 + i, 0.2, 12, 9), 0.4 + 0.15 * i, 0), rockMat, W.x + Math.cos(a) * 5.4, -0.55, W.z + Math.sin(a) * 5.4, rand() * 6);
      m.scale.set(1.3 + rand() * 0.6, 0.9, 1.1 + rand() * 0.5);
    }
  }

  // ----- sandbars: the flamingos' cays -----
  for (const sb of SANDBARS) {
    if (!sb.cay) continue;
    const isl = { lumps: [[sb.x, sb.z, sb.cay]], beach: 4, hillH: 0, hillW: 1, res: 0.6 };
    const sample = island(isl, { tall: 1 });
    colliders[colliders.length - 1].h = 3;
    for (let i = 0; i < sb.flamingos; i++) {
      // a couple on the dry cay, the rest wading on the bar round it
      const a = (i / sb.flamingos) * Math.PI * 2 + rand() * 0.6;
      const d = i < 2 ? sb.cay * (0.3 + rand() * 0.4) : sb.cay + 0.8 + rand() * (sb.r * 0.62 - sb.cay - 0.8);
      const x = sb.x + Math.cos(a) * d;
      const z = sb.z + Math.sin(a) * d;
      flamingo(props, x, Math.max(0, sample(x, z)[0]) - 0.05, z, rand() * 6.28, 1.05 + rand() * 0.15, i % 3);
    }
    // a tuft of beach grass and a shell or two
    addBush(props, sb.x + 0.4, Math.max(0.2, sample(sb.x + 0.4, sb.z)[0]) - 0.2, sb.z - 0.3, 0.45, rand);
  }

  // ----- the rim of the great atoll (outside the arena), far atolls and hills on the horizon -----
  for (const [deg, rad, n, r] of RIM) {
    const isl = { lumps: arcLumps(deg, rad, n, r), beach: 3.2, hillH: 0.5, hillW: 2, res: 1.0 };
    const sample = island(isl, { tall: 7 });
    decorate(isl, sample, { palms: Math.round(n * 2.2), bushes: n + 1 });
  }
  for (const [deg, rad, n, r] of FAR_ATOLLS) {
    const isl = { lumps: arcLumps(deg, rad, n, r), beach: 4, hillH: 0.6, hillW: 3, res: 1.8, far: true };
    const sample = island(isl, { colliders: false });
    decorate(isl, sample, { palms: n + 2, bushes: 0 });
  }
  for (const [deg, rad, r, h] of FAR_HILLS) {
    const a = deg * DEG;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    const hm = mesh(props, geo('hill', hillGeometry), toon(C.hill2), x, -1, z, a);
    hm.scale.set(r, h, r * 0.72);
    const peak = mesh(props, geo('hill', hillGeometry), toon(C.hill), x + r * 0.12, -1, z - r * 0.1, a + 1);
    peak.scale.set(r * 0.5, h * 1.35, r * 0.42);
    const beach = mesh(props, cyl(1, 1.08, 1, 24), toon(C.sand), x, -0.2, z, a);
    beach.scale.set(r * 1.05, 1.2, r * 0.77);
  }

  // ----- the storm wall and its rain curtains -----
  const storm = buildStorm(own);
  root.add(storm);
  const rain = buildRain(own, timeU);
  root.add(rain);

  // ----- the shallows (sandbars, the wreck's reef, the atolls' lagoons) -----
  // the reef flat under the village: wide on the lagoon side (round the huts and walks), tucked under the island behind
  const flats = [{ x: VILLAGE.x, z: VILLAGE.z, R: (th) => 15 + 13.5 * smooth(-0.4, 0.22, Math.cos(th)) }];
  const shallows = buildShallows(SANDBARS, lagoons, flats, rand, timeU, ampU);
  root.add(shallows);
  own.push(shallows.material);

  // ----- bake: the props into vertex colours, the painted parts merged per material -----
  const lineMat = vcMaterial(true);
  const flatMat = vcMaterial(false);
  own.push(lineMat, flatMat);
  bakeVC(props, lineMat, flatMat);
  mergeStatic(painted);
  for (const grp of [painted, props]) {
    grp.traverse((o) => {
      o.updateMatrix();
      o.matrixAutoUpdate = false;
      if (o.isMesh) ownGeos.push(o.geometry);
    });
  }
  for (const g of GEO.values()) g.dispose();
  GEO = null;

  // ----- sea turtles paddling and terns wheeling: one rig -----
  GEO = new Map(); // (the critters' and the spouts' source parts; disposed once both are built)
  const turtles = [];
  const terns = [];
  const critterPieces = [];
  {
    const tw = [
      { c: TP(40, 9), r: 7, w: 0.16 },
      { c: TP(4, -33), r: 6, w: -0.14 },
      { c: [ATOLLS[1].x - 22, ATOLLS[1].z - 4], r: 6.5, w: 0.15 },
      { c: [VILLAGE.x + 30, VILLAGE.z + 26], r: 6, w: -0.17 },
    ];
    for (const t of tw) {
      const first = critterPieces.length;
      critterPieces.push(...turtlePieces());
      turtles.push({ ...t, first, ph: rng() * 6.28, s: 1.15 + rng() * 0.3 });
    }
    const birds = [
      { c: [LIGHT.x, LIGHT.z], r: 13, y: 15, w: 0.33 },
      { c: [VILLAGE.x + 6, VILLAGE.z], r: 18, y: 18, w: -0.28 },
      { c: [T.x, T.z], r: 22, y: 24, w: 0.24 },
      { c: [WRECK.x, WRECK.z], r: 11, y: 13, w: -0.36 },
    ];
    for (const b of birds) {
      const first = critterPieces.length;
      critterPieces.push(...ternPieces());
      terns.push({ ...b, first, ph: rng() * 6.28 });
    }
  }
  const critterMat = vcMaterial(true);
  own.push(critterMat);
  const critters = buildRig(critterPieces, critterMat, 'atolls-critters');
  root.add(critters.mesh);

  // ----- the waterspouts (drawn from the hazards snapshot) -----
  const spouts = createSpoutView(root, own, reduced, ampU);
  for (const g of GEO.values()) g.dispose();
  GEO = null;

  // ----- gameplay data -----
  const reefs = SANDBARS.map((s) => ({ x: s.x, z: s.z, r: s.r }));
  const playerStart = { ...START };
  const spoutLoops = makeLoops();
  const enemySpawns = computeSpawns(playerStart, colliders, reefs, spoutLoops);
  const crateSpots = computeCrates(playerStart, colliders, reefs, spoutLoops);

  const m4 = new THREE.Matrix4();
  const mA = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3(1, 1, 1);
  const FLIP = [[0.62, 0.02, 0.45], [-0.62, 0.02, 0.45], [0.45, 0, -0.62], [-0.45, 0, -0.62]];
  function update(t, dt, fctx) {
    timeU.value = t;
    const amp = palette.waveAmp;
    // sea turtles: round and round their patch of shallows, paddling
    for (const tu of turtles) {
      const a = tu.ph + t * tu.w;
      const x = tu.c[0] + Math.cos(a) * tu.r;
      const z = tu.c[1] + Math.sin(a) * tu.r;
      const dir = Math.sign(tu.w);
      const h = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir);
      const y = waveHeight(x, z, t, amp) - 0.12 + 0.06 * Math.sin(t * 1.3 + tu.ph);
      p.set(x, y, z);
      e.set(0.04 * Math.sin(t * 1.1 + tu.ph), h, 0.05 * Math.sin(t * 0.9 + tu.ph) - 0.12 * dir);
      q.setFromEuler(e);
      sc.setScalar(tu.s);
      m4.compose(p, q, sc);
      critters.set(tu.first, m4);
      const stroke = Math.sin(t * 2.2 + tu.ph);
      for (let k = 0; k < 4; k++) {
        const side = k % 2 ? -1 : 1;
        const front = k < 2;
        const f = FLIP[k];
        e.set(0, side * (front ? 0.55 * stroke : 0.3 * Math.sin(t * 2.2 + tu.ph + 1.2)), side * (front ? 0.22 * Math.cos(t * 2.2 + tu.ph) : 0.08));
        q.setFromEuler(e);
        mA.compose(p.set(f[0], f[1], f[2]), q, sc.set(1, 1, 1));
        critters.set(tu.first + 1 + k, mA.premultiply(m4));
      }
    }
    // terns: wheeling, a few quick beats then a glide
    for (const b of terns) {
      const a = b.ph + t * b.w;
      const x = b.c[0] + Math.cos(a) * b.r;
      const z = b.c[1] + Math.sin(a) * b.r;
      const dir = Math.sign(b.w);
      p.set(x, b.y + Math.sin(t * 0.6 + b.ph) * 1.4, z);
      e.set(0, Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir), 0.28 * dir);
      e.order = 'YXZ';
      q.setFromEuler(e);
      e.order = 'XYZ';
      m4.compose(p, q, sc.set(1.3, 1.3, 1.3));
      critters.set(b.first, m4);
      const glide = 0.5 + 0.5 * Math.sin(t * 0.8 + b.ph);
      const flap = glide > 0.45 ? 0.25 + 1.2 * Math.abs(Math.sin(t * 8 + b.ph)) : 0.5;
      mA.makeScale(1, flap, 1);
      critters.set(b.first + 1, mA.premultiply(m4));
    }
    critters.commit();
    const hz = fctx && fctx.hazards;
    spouts.update(t, dt, hz && Array.isArray(hz.spouts) ? hz.spouts : null);
  }

  function dispose() {
    scene.remove(root);
    for (const g of ownGeos) g.dispose();
    storm.geometry.dispose();
    rain.geometry.dispose();
    shallows.geometry.dispose();
    critters.dispose();
    spouts.dispose();
    for (const m of own) m.dispose();
  }

  return {
    worldRadius: WORLD_R,
    colliders,
    playerStart,
    enemySpawns,
    reefs,
    crateSpots,
    spoutLoops,
    update,
    dispose,
    group: root,
  };
}
