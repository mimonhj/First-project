import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, setOutline, noOutline, gradientMap, ensureIndex, INK } from '../style.js';
import { waveHeight } from '../scenery.js';

// Level 11, "The Sunken Spires" (SPEC4 §2.4): turquoise noon over a drowned city.
//
// Map (north = -z, east = +x; the arena is the disc of radius WORLD_R round 0,0):
// - you start in the south (START), facing north. 18 u ahead stands the Sea Gate, a great stone arch you sail under,
//   and through it, 86 u ahead (the fly-in's first framing), King Coral: a half-sunk stone king's head 18 u tall with
//   big friendly eyes, a curly stone beard going down into the sea and a stone crown overgrown with coral (a little
//   crab on his beard, a gull on his crown, gold earrings)
// - round the King the three coral currents swirl (counter-clockwise on the map: east past his face, north up the
//   east side, west behind him, south down the west side), three arcs of one ring with a gap between each, so a ship
//   riding one is handed toward the next: the King's Street in front of him, the Coral Run behind him (it runs under
//   the Coral Arch, the second arch, half fallen and furred with coral) and the Spire Run down the west side
// - beyond the currents the drowned city: three spires in the west (one leaning, one broken), a pillared temple on its
//   steps in the east, the palace with its gold onion dome in the north-west, a sunken theatre in the north, two
//   tall spires in the north-east, a toppled colonnade in the south-west and the King's own stone hand holding up a
//   golden orb in the south-east; broken columns standing alone, and gold domes bobbing like buoys (fallen tower
//   tops, floating); glowing coral gardens round every ruin's foot (in the water and seen through it, pulsing at
//   <= 0.45 Hz), the drowned streets' paving seen through the water round the ruins, kelp hanging from the arches and
//   swaying round the ruins; and the skyline of the rest of the city on the horizon, outside the arena
//
// Gameplay data (fixed: the layout never depends on ctx.rng; checked by the harness and the smoke layout rules):
// - colliders: King Coral (h 19), the arches' piers (the spans are not colliders), every spire, the temple, the
//   palace, the theatre, the colonnade, the hand, every floating dome (they bob in place) and lone column
// - reefs: none (this sea's hazard is the currents)
// - currents: 3 open polylines { id, points: [{ x, z }], width: 8 } (mechanics4.js CURRENT: a ship whose centre is
//   inside a lane drifts 3 u/s along it, from its first point to its last). Every point of every lane, and every
//   segment between, keeps the 8 u band clear of every collider by LANE.clear and the player's start by START_CLEAR
//   (SPEC4 §2.4: never through a collider, none within 15 u of the start), and stays inside worldRadius - 20.
// - enemySpawns: open water 58-110 from the start, outside the currents' ring, clear of colliders by r + 12 and of
//   the lanes by 12, inside worldRadius - 16, ordered so that any prefix is well spread (the first ahead of the start)
// - crateSpots: open water 30-100 from the start, clear of colliders by r + 8 and of the lanes by 7, inside
//   worldRadius - 20, spread the same way
//
// Hazards: update(t, dt, { simTime, camera, hazards }) draws the currents of hazards.currents (mechanics4.js
// visuals(): [{ id, points, width, speed, flow }], id = the lane's index in env.currents + 1; flow = how far the
// arrows have scrolled, u): each lane is a band of scrolling white foam chevrons over a pale veil, its edges a dashed
// foam line (one strip mesh for all three, noOutline), and silver fish leaping along it with the flow (one
// InstancedMesh with its ink twin). A lane missing from a snapshot that has `currents` fades out; with no snapshot
// (hazards null, or no `currents` in it: mechanics4 not running, as in Stage 1's ?v4=1 preview) the lanes show and
// scroll with the simulated time at CURRENT's 3 u/s, so the sea always reads right.
//
// warmables() -> the hazard meshes (the lanes' strip and the fish, each with at least one instance), for main's
// warmDraw (SPEC4 §11.2, §14).
//
// Draw calls (both outline passes): the stone (painted per pixel by its own shader: weathered limestone, a green
// weed band and wet stone at the waterline) is one mesh, the sand banks one more, every plain prop one vertex-coloured
// mesh, one for the few without an ink line and one unlit one for the glowing coral (pulsing in its shader); the
// floating domes and the fish are one InstancedMesh each with an inverted-hull ink twin, the kelp one swaying mesh,
// the drowned streets and gardens seen through the water one mesh, the lanes one mesh, the gulls one rig: the env
// alone is about 20 calls.
//
// Photosensitivity (SPEC3 §15, SPEC4 §0.1, §15): nothing here flashes. The glowing coral pulses at 0.18-0.45 Hz
// (PULSE_HZ.coral, <= 0.5 Hz), the gardens under the water at <= 0.3 Hz, a gentle breathing, never a flash; the kelp
// sways at 0.3 Hz, the domes bob with the swell. Reduced motion (ctx.reducedMotion: a boolean or a function, else
// the media query): the coral glows steady, the kelp hangs still, the arrows hold still (the chevrons still point
// the way) and the fish don't leap.
//
// build(scene, { rng, reducedMotion? }) -> { worldRadius, colliders, playerStart, enemySpawns, reefs, crateSpots,
//   currents, warmables() -> [Object3D], stats (read-only numbers for tests), update(t, dt, { simTime, camera,
//   hazards }), dispose(), group }

export const meta = {
  name: 'The Sunken Spires',
  subtitle: 'Turquoise noon over a drowned city. Coral currents run through the streets.',
};

export const palette = {
  skyTop: 0x2a7fd8,
  skyHorizon: 0xc8f4ff,
  sunColor: 0xfffbe8,
  sunDir: [0.2, 0.9, 0.3],
  sunIntensity: 2.4,
  hemiSky: 0xe0f8ff,
  hemiGround: 0x3a6a7a,
  hemiIntensity: 1.35,
  fogColor: 0xbff0f0,
  fogNear: 140,
  fogFar: 400,
  waterDeep: 0x0e8aa0,
  waterShallow: 0x5ff0e0,
  waterFoam: 0xffffff,
  waveAmp: 0.5,
  cloudColor: 0xffffff,
  cloudShade: 0xc0d8e8,
  cloudCount: 12,
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
const WORLD_R = 150;
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const START_CLEAR = 15; // SPEC4 §2.4: no current within 15 u of the player's start
// SPEC3 §15 / SPEC4 §15: every glow pulses at 1 Hz or slower; the coral at most 0.5 Hz
const PULSE_HZ = { max: 1, coralMax: 0.5, coral: [0.18, 0.45], gardens: [0.12, 0.3] };
const START = { x: 0, z: 100, h: Math.PI };
// King Coral: his head's centre on the water at (x, z), facing +z (the start); r the collider (beard and all).
const KING = { x: 0, z: 14, r: 10.5, h: 19 };
// The arches: piers at ±half along the arch's own x (rotated by ry: its x axis runs along (cos ry, 0, -sin ry), so a
// ship passes along its z axis, the heading ry), pier = the piers' width, spring = where the arch springs from the
// piers; the arch's opening is a half circle of radius half - pier / 2 over it (the Sea Gate: 11.2, apex 16.4 over
// the water, 13.3 over a hull stopped by a pier's collider; the tallest mast of level 11's ships is 10.6). footR = the
// piers' collider. The Sea Gate stays low enough that the fly-in's first frame sees King Coral's face over it.
const GATE = { x: 0, z: 82, ry: 0, half: 14, pier: 5.6, depth: 4.8, spring: 5.2, footR: 4.4, h: 23 };
// The Coral Arch spans the Coral Run where it passes nearest `near` (its ry is the lane's heading there).
const CORAL_ARCH = { near: [50, -6], half: 13, pier: 5.2, depth: 4.4, spring: 6.6, footR: 4.0, h: 23 };
// The coral currents: three arcs of one wobbly ring round the King (degrees on the ring, measured from +x toward +z;
// a lane flows from `from` to `to`, so they all run the same way round), sampled every LANE.step u along a smooth
// curve through LANE.ctrl degrees apart.
const RING = { x: 0, z: 14, rx: 58, rz: 38 };
const LANE = { width: 8, step: 5, ctrl: 18, clear: 3, viewStep: 2 };
const ARCS = [
  { id: 'street', from: 142, to: 40, wob: [2, 0.05, 0.3] },
  { id: 'coral', from: 20, to: -80, wob: [3, 0.05, 1.1] },
  { id: 'spire', from: -100, to: -200, wob: [2, 0.06, 2.0] },
];
// The spires: [x, z, r (collider), height, roof ('teal' | 'tile' | 'gold' | null: broken), lean (rad), lean dir]
const SPIRES = [
  { id: 'wA', x: -86, z: -4, r: 4.2, h: 31, roof: 'teal', lean: 0, dir: 0 },
  { id: 'wB', x: -96, z: 12, r: 3.6, h: 24, roof: 'tile', lean: 0.13, dir: 2.4 },
  { id: 'wC', x: -80, z: 14, r: 3.6, h: 17, roof: null, lean: 0.04, dir: -0.6 },
  { id: 'neA', x: 74, z: -70, r: 4.0, h: 33, roof: 'gold', lean: 0, dir: 0 },
  { id: 'neB', x: 86, z: -56, r: 3.4, h: 25, roof: 'teal', lean: 0.08, dir: 1.0 },
];
// The temple on its steps (east), facing the King; the palace (north-west): its great tower with the gold onion dome
// and a little tower; the sunken theatre (north), open to the south.
const TEMPLE = { x: 88, z: 20, r: 12, h: 15 };
const PALACE = { x: -62, z: -66, r: 11, h: 35, side: { x: -50, z: -75, r: 4.6, h: 23 } };
const THEATRE = { x: 10, z: -100, r: 13, h: 10 };
// The toppled colonnade (south-west): its bank's lumps; the King's hand with the golden orb (south-east).
const COLONNADE = { lumps: [[-56, 76, 7.2], [-48, 83, 4.6]], h: 10 };
const HAND = { x: 56, z: 80, r: 5, h: 14 };
// Gold domes bobbing like buoys: [x, z, r (collider; the dome is r / 2.6 times the model)].
const DOMES = [[-30, 88, 2.6], [36, 82, 2.6], [104, -26, 2.8], [-110, -36, 2.8], [-18, -58, 2.6], [70, 54, 2.6], [-100, 60, 2.8], [112, 72, 2.6], [30, -64, 2.4], [-82, 104, 2.6]];
// Lone broken columns: [x, z, r (collider), height].
const STUMPS = [[-24, 108, 1.7, 6.5], [26, 110, 1.7, 8], [-118, 20, 1.9, 9], [124, 12, 1.9, 7], [-36, -96, 1.9, 9.5], [52, -98, 1.9, 7.5]];
// Sand and rubble banks under the ruins: lumps [x, z, r] (r = the collider; the sand lies INSET inside it).
const INSET = 1.4;
// The far city on the horizon (outside the arena; no colliders): [bearing deg, distance, kind, size].
const SKYLINE = [
  [8, 300, 'spire', 1.5], [22, 330, 'dome', 1.6], [37, 286, 'arch', 1.3], [52, 316, 'spire', 1.2], [64, 340, 'dome', 1.8],
  [118, 306, 'spire', 1.4], [131, 336, 'cols', 1.4], [146, 292, 'dome', 1.3], [163, 322, 'spire', 1.7], [176, 288, 'arch', 1.4],
  [196, 330, 'dome', 1.5], [214, 298, 'spire', 1.3], [228, 322, 'cols', 1.2], [252, 340, 'spire', 1.8], [268, 306, 'dome', 1.4],
  [284, 326, 'arch', 1.5], [302, 290, 'spire', 1.4], [318, 324, 'dome', 1.7], [334, 300, 'cols', 1.3], [348, 336, 'spire', 1.6],
];
// Gulls wheeling: centre, radius, height, angular speed (rad/s).
const GULLS = [
  { c: [0, 14], r: 15, y: 24, w: 0.3 },
  { c: [-88, 6], r: 12, y: 34, w: -0.26 },
  { c: [-62, -66], r: 14, y: 40, w: 0.22 },
  { c: [88, 20], r: 16, y: 21, w: -0.28 },
];
// The lanes' look: chevrons every `chev` u, the edges' foam dashes every `dash` u; the fish per lane and their leaps.
const LANE_VIEW = { chev: 7, dash: 2.6, fade: 1.2, fish: 9, leap: [0.8, 1.1], every: [2.6, 4.6], height: [0.9, 1.5], extra: 3 };
const SWAY_HZ = [0.3, 0.23];

// ---------------------------------------------------------------------------
// Colours (cel-shaded materials from style.js; the props are baked into vertex colours)
// ---------------------------------------------------------------------------
const C = {
  stoneA: 0xf2e9d2, stoneB: 0xe0d2b0, wet: 0x3e7a72, weed: 0x4aa684, weed2: 0x6fbf8c, salt: 0xf6f4e6,
  face: 0xfff4e4, faceDark: 0xe6d6ba, beard: 0xd8cbb0, crownStone: 0xf2e4c2,
  sand: 0xf3dfb0, sandWet: 0xc4ad7a, sandInk: 0x8a7650,
  eyeWhite: 0xf8f4ea, pupil: 0x26313a, socket: 0x2f3c44, window: 0x2a3a46, door: 0x24323c,
  gold: 0xf6c434, goldDark: 0xc98e1e, goldLit: 0xfff0a8,
  teal: 0x4fb8a2, tealDark: 0x37907e, tile: 0xd9774a, tileDark: 0xb05a36,
  coral: [0xff6fa3, 0xff9040, 0xa66bff, 0xffd447, 0xff5a6e, 0x46d0c0],
  coralGlow: [0xff74b4, 0xffa048, 0xb27cff, 0x3fe6cc, 0xffde3a],
  kelp: 0x3f9a5a, kelp2: 0x74c25e,
  fishBack: 0x5f8fbc, fishSide: 0xd8e6f0, fishBelly: 0xf4f8fb, fishFin: 0x9cc0d8,
  star: 0xff7a4a, starDot: 0xffc29a, crab: 0xe8483a, crabDark: 0xb83226,
  gull: 0xfbfbf6, gullWing: 0xb4c0c8, gullTip: 0x3a4248, beak: 0xf2b432, leg: 0xf09a3a,
  barnacle: 0xe8e2d0, urchin: 0x5b3c8c,
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
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
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
function group(parent, x = 0, y = 0, z = 0, ry = 0, s = 1) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.scale.setScalar(s);
  parent.add(g);
  return g;
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
const rbox = (w, h, d, r = 0.14, seg = 2) => geo(`rb${w},${h},${d},${r},${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01)));
const torus = (R, r, rs = 6, ts = 20, arc = TAU) => geo(`to${R},${r},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc));
const capsule = (r, len, cs = 3, rs = 8) => geo(`ca${r},${len},${cs},${rs}`, () => new THREE.CapsuleGeometry(r, len, cs, rs));
function lathe(profile, seg = 20, phiStart = 0, phiLength = TAU) {
  const pts = profile[0][1] > profile[profile.length - 1][1] ? profile.slice().reverse() : profile;
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), seg, phiStart, phiLength);
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
// Points along a quadratic Bezier a -> b (control c).
function bez(a, c, b, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push(V3(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y, u * u * a.z + 2 * u * t * c.z + t * t * b.z));
  }
  return out;
}
// A lumpy blob: a sphere pushed in and out by a little value noise (smooth normals for the ink line).
function bumpy(seed, amp = 0.16, w = 14, h = 10, f = 2.1) {
  const g = new THREE.SphereGeometry(1, w, h);
  const noise = makeNoise(seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + amp * (noise(x * f + 5, z * f + y * 1.3) - 0.5) * 2;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  return smoothGeo(g);
}
// A column shaft from y 0 to 1 (scaled by the caller): radius 1 with `flutes` shallow grooves; broken > 0 gives it a
// jagged snapped top (heights fall by up to `broken` of the shaft, a fixed noise round the rim).
function shaftGeo(flutes, broken, seed) {
  const seg = flutes > 0 ? flutes * 3 : 16;
  const g = new THREE.CylinderGeometry(1, 1, 1, seg, 4, false);
  g.translate(0, 0.5, 0);
  const noise = makeNoise(seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    let y = p.getY(i);
    const z = p.getZ(i);
    const th = Math.atan2(z, x);
    const rr = Math.hypot(x, z);
    const k = flutes > 0 ? 1 - 0.07 * (0.5 + 0.5 * Math.cos(flutes * th)) : 1;
    if (broken > 0 && y > 0.99) {
      const cut = rr < 0.01 ? 0.45 : noise(Math.cos(th) * 2.3 + 7, Math.sin(th) * 2.3 + 3) * 0.75 + 0.25 * Math.abs(Math.sin(th * 2 + seed));
      y = 1 - broken * cut;
    } else if (broken > 0 && y > 0.74) {
      // (the row under the rim keeps under the lowest notch)
      y = Math.min(y, 1 - broken * 1.02);
    }
    p.setXYZ(i, x * k, y, z * k);
  }
  return smoothGeo(g);
}

// Shared vertex-coloured toon materials: the whole static prop scene bakes into one outlined mesh, one without an
// ink line, and one unlit one (with its ink line) for the glowing coral.
function vcMaterial(outline, side = THREE.FrontSide) {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(3), side });
  setOutline(m, outline);
  return m;
}
// An unlit material for things that glow (the glowing coral): baked into the glow mesh.
const glowCache = new Map();
function glow(color) {
  let m = glowCache.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    m.userData.glow = true;
    glowCache.set(color, m);
  }
  return m;
}

// Bake every plain mesh under `group` into vertex-coloured meshes: the stone (materials marked userData.stone: the
// painted stone mesh), one with the ink line, one without, and one unlit (materials marked userData.glow). Meshes under a node with userData.keep are left alone. Written straight into
// three geometries (a level has a couple of thousand small props: copying and merging them one by one is slow).
function bakeVC(group, mats, name) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const parts = {};
  const victims = [];
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.material || Array.isArray(o.material) || !o.material.color) return;
    for (let p = o; p && p !== group; p = p.parent) if (p.userData.keep) return;
    let g = o.geometry;
    if (!g.attributes.normal) {
      g = g.index ? g.toNonIndexed() : g.clone();
      g.computeVertexNormals();
    }
    const c = o.material.color.clone();
    const m4 = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const op = o.material.userData.outlineParameters;
    const ud = o.material.userData;
    const kind = ud.stone ? 'stone' : ud.glow ? 'glow' : op && op.visible === false ? 'flat' : 'line';
    (parts[kind] || (parts[kind] = [])).push({ g, own: g !== o.geometry, m4, c, kind });
    victims.push(o);
  });
  for (const v of victims) v.parent.remove(v);
  const out = [];
  const nm = new THREE.Matrix3();
  for (const key of Object.keys(parts)) {
    const list = parts[key];
    if (!list.length || !mats[key]) continue;
    let nv = 0;
    let ni = 0;
    for (const q of list) {
      nv += q.g.attributes.position.count;
      ni += q.g.index ? q.g.index.count : q.g.attributes.position.count;
    }
    const P = new Float32Array(nv * 3);
    const N = new Float32Array(nv * 3);
    const K = new Float32Array(nv * 3);
    const I = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
    let v0 = 0;
    let i0 = 0;
    for (const q of list) {
      const pa = q.g.attributes.position;
      const na = q.g.attributes.normal;
      const e = q.m4.elements;
      nm.getNormalMatrix(q.m4);
      const f = nm.elements;
      const n = pa.count;
      const pA = pa.isInterleavedBufferAttribute ? null : pa.array;
      const nA = na.isInterleavedBufferAttribute ? null : na.array;
      for (let i = 0; i < n; i++) {
        const x = pA ? pA[i * 3] : pa.getX(i);
        const y = pA ? pA[i * 3 + 1] : pa.getY(i);
        const z = pA ? pA[i * 3 + 2] : pa.getZ(i);
        const o3 = (v0 + i) * 3;
        P[o3] = e[0] * x + e[4] * y + e[8] * z + e[12];
        P[o3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        P[o3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const a = nA ? nA[i * 3] : na.getX(i);
        const b = nA ? nA[i * 3 + 1] : na.getY(i);
        const cz = nA ? nA[i * 3 + 2] : na.getZ(i);
        let ox = f[0] * a + f[3] * b + f[6] * cz;
        let oy = f[1] * a + f[4] * b + f[7] * cz;
        let oz = f[2] * a + f[5] * b + f[8] * cz;
        const l = Math.hypot(ox, oy, oz) || 1;
        ox /= l;
        oy /= l;
        oz /= l;
        N[o3] = ox;
        N[o3 + 1] = oy;
        N[o3 + 2] = oz;
        K[o3] = q.c.r;
        K[o3 + 1] = q.c.g;
        K[o3 + 2] = q.c.b;
      }
      if (q.g.index) {
        const ix = q.g.index.array;
        for (let k = 0; k < ix.length; k++) I[i0 + k] = ix[k] + v0;
        i0 += ix.length;
      } else {
        for (let k = 0; k < n; k++) I[i0 + k] = k + v0;
        i0 += n;
      }
      v0 += n;
      if (q.own) q.g.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(P, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    merged.setAttribute('color', new THREE.BufferAttribute(K, 3));
    merged.setIndex(new THREE.BufferAttribute(I, 1));
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, mats[key]);
    m.name = `${name}-${key}`;
    group.add(m);
    out.push(m);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The sea's swell, mirrored for the shaders that ride it (the lanes and the drowned streets). scenery.js keeps its
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
const NOISE_GLSL = `float mHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float mNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mHash(i), mHash(i + vec2(1.0, 0.0)), u.x), mix(mHash(i + vec2(0.0, 1.0)), mHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float mHash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float mNoise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(mHash3(i), mHash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(mHash3(i + vec3(0.0, 1.0, 0.0)), mHash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(mHash3(i + vec3(0.0, 0.0, 1.0)), mHash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(mHash3(i + vec3(0.0, 1.0, 1.0)), mHash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}`;
let wavesChecked = false;
function checkWaves() {
  if (wavesChecked) return;
  wavesChecked = true;
  for (const [x, z, t] of [[0, 0, 0], [13.7, -42.1, 3.3], [-97.2, 55.5, 41.9], [120.4, 8.8, 777.7], [-3.1, -131, 12345.6]]) {
    let h = 0;
    for (const w of SEA_WAVES) h += w.a * Math.sin(w.kx * x + w.kz * z - w.w * t + w.ph);
    if (Math.abs(h * 0.5 - waveHeight(x, z, t, 0.5)) > 1e-6) {
      console.error('spires.js: SEA_WAVES no longer matches the waves in scenery.js; update the mirror');
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Painted materials (own instances, never the shared toon cache)
// ---------------------------------------------------------------------------
// The stone of the drowned city: painted per pixel from world position so every ruin shares one material: weathered
// limestone in two cel tones with a few darker pits, and at the waterline the wet stone under it, a band of green
// weed with drips above it and a pale salt line on top. The vertex colour (white, or a tint baked from the piece's
// material) tints it: King Coral's face is warmer, his beard greyer.
function makeStoneMaterial() {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(3), vertexColors: true });
  m.name = 'spires-stone';
  setOutline(m, true);
  const U = {
    uStoneA: { value: new THREE.Color(C.stoneA) },
    uStoneB: { value: new THREE.Color(C.stoneB) },
    uWet: { value: new THREE.Color(C.wet) },
    uWeed: { value: new THREE.Color(C.weed) },
    uWeed2: { value: new THREE.Color(C.weed2) },
    uSalt: { value: new THREE.Color(C.salt) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vSW;
uniform vec3 uStoneA, uStoneB, uWet, uWeed, uWeed2, uSalt;
${NOISE_GLSL}`)
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float bn = mNoise3(vSW * vec3(0.3, 0.42, 0.3));
        float bfw = max(fwidth(bn), 1e-4);
        vec3 st = mix(uStoneA, uStoneB, smoothstep(0.6 - bfw, 0.6 + bfw, bn));
        float pn = mNoise3(vSW * 1.6 + 3.1);
        float pfw = max(fwidth(pn), 1e-4);
        st *= 1.0 - 0.08 * smoothstep(0.76 - pfw, 0.76 + pfw, pn);
        float wl = 0.12 + 0.1 * sin(vSW.x * 0.8 + vSW.z * 0.6);
        float yfw = max(fwidth(vSW.y), 1e-4);
        float top = wl + 0.75 + 0.6 * mNoise(vec2(vSW.x + vSW.z, vSW.z - vSW.x) * 1.4);
        float weed = 1.0 - smoothstep(top - yfw, top + yfw, vSW.y);
        vec3 wc = mix(uWeed, uWeed2, step(0.55, mNoise(vSW.xz * 0.8 + vSW.y * 0.5)));
        vec3 c = mix(st, wc, weed);
        float saltL = 1.0 - smoothstep(0.045, 0.045 + 1.5 * yfw, abs(vSW.y - top - 0.09));
        c = mix(c, uSalt, saltL * 0.75);
        c = mix(uWet, c, smoothstep(wl - yfw, wl + yfw, vSW.y));
        vec4 diffuseColor = vec4(c, opacity);`,
      );
  };
  m.customProgramCacheKey = () => 'spires-stone-v1';
  return m;
}

// The sand banks under the ruins: uv.x = distance inland past the waterline (< 0 wet sand, > 0 dry), uv.y = patch
// noise. Wet sand at the water, pale dry sand above with a crisp hand-drawn edge and a few darker ripples.
function makeSandMaterial() {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(3) });
  m.name = 'spires-sand';
  setOutline(m, true);
  const U = {
    uWet: { value: new THREE.Color(C.sandWet) },
    uSand: { value: new THREE.Color(C.sand) },
    uInkCol: { value: new THREE.Color(C.sandInk) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vZone;\nvarying vec3 vSW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZone = uv;\nvSW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vZone;\nvarying vec3 vSW;\nuniform vec3 uWet, uSand, uInkCol;')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float gz = vZone.x;
        float fw = max(fwidth(gz), 1e-4);
        float dry = smoothstep(-fw, fw, gz);
        vec3 tcol = mix(uWet, uSand, dry);
        float rp = sin(dot(vSW.xz, vec2(0.83, 0.56)) * 2.2 + 1.3 * sin(vSW.x * 0.31 + vSW.z * 0.23));
        float rfw = max(fwidth(rp), 1e-4);
        tcol *= 1.0 - 0.06 * smoothstep(0.82 - rfw, 0.82 + rfw, rp) * dry;
        float ink = 1.0 - smoothstep(0.7 * fw, 1.5 * fw, abs(gz - 0.6 * fw));
        tcol = mix(tcol, uInkCol, ink * 0.7);
        vec4 diffuseColor = vec4(tcol, opacity);`,
      );
  };
  m.customProgramCacheKey = () => 'spires-sand-v1';
  return m;
}

// The glowing coral: unlit vertex colours (its ink line kept) breathing softly, each clump at its own rate (0.18-0.45
// Hz from a hash of where it grows, PULSE_HZ.coral) and phase; steady under reduced motion. A breathing, never a flash:
// the brightness moves between 0.78 and 1.1 of its colour.
function makeCoralGlowMaterial(timeU, motionU) {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  m.name = 'spires-coral-glow';
  setOutline(m, true);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU;
    sh.uniforms.uMotion = motionU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform float uMotion;
varying vec3 vGW;
float gHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    float h = gHash(floor(vGW.xz / 2.5) + 0.5);
    float hz = ${glslNum(PULSE_HZ.coral[0])} + ${glslNum(PULSE_HZ.coral[1] - PULSE_HZ.coral[0])} * fract(h * 7.13);
    float p = 0.5 + 0.5 * sin(${glslNum(TAU)} * hz * uTime + h * ${glslNum(TAU)});
    diffuseColor.rgb *= mix(0.94, 0.78 + 0.32 * p, uMotion);
  }`);
  };
  m.customProgramCacheKey = () => 'spires-coral-glow-v1';
  return m;
}

// The drowned city's stone: each tint is its own little material (never the shared toon cache), marked so the bake
// sends it to the painted stone mesh; the tint becomes the vertex colour the stone shader multiplies by.
const stoneCache = new Map();
function stone(tint = 0xffffff) {
  let m = stoneCache.get(tint);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color: tint });
    m.userData.stone = true;
    stoneCache.set(tint, m);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Sand banks: a bank is a union of circles; the circles are its colliders and its sand lies INSET inside them (the
// height field is built from the same smooth-min distance the ocean shader uses for its foam).
// isl: { lumps: [[x, z, r]], bank, hillH, res }
// ---------------------------------------------------------------------------
function bankSampler(isl, noise) {
  const { lumps } = isl;
  const bank = isl.bank ?? 1.1;
  const hillH = isl.hillH ?? 0.35;
  const top = 0.45;
  const seed = lumps[0][0] * 0.37 + lumps[0][1] * 0.11;
  return (x, z) => {
    let sd = 1e4;
    for (const L of lumps) sd = smin(sd, Math.hypot(x - L[0], z - L[1]) - (L[2] - INSET), 4);
    const u = -sd;
    const bw = bank + (noise(x * 0.17 + seed, z * 0.17) - 0.5) * 0.9;
    const g = u - bw;
    let h;
    if (u <= 0) h = -Math.min(2.4, 0.6 * -u + 0.08 * u * u);
    else h = top * (1 - Math.exp(-u * 1.1));
    if (g > 0) {
      h += 0.1 * smooth(0, 0.5, g);
      h += hillH * (1 - Math.pow(1 - Math.min(g / 3, 1), 2.2));
      h += (noise(x * 0.31 + 40, z * 0.31) - 0.45) * 0.22 * smooth(0, 2, g);
    }
    return [h, g, sd];
  };
}
function buildBankGeometry(isl, sample, noise) {
  const res = isl.res ?? 0.8;
  const pad = 3;
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
      if (Math.max(hs[a], hs[b], hs[c], hs[d]) < -1.1) continue;
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

// ---------------------------------------------------------------------------
// Props (stone pieces bake into the painted stone mesh, the rest into vertex colours at the end of build())
// T: the build's kit { root, rand, kelpHang[], kelpStand[] }
// ---------------------------------------------------------------------------
// A coral clump (local y 0 = where it sits). kind: 'stag' | 'fan' | 'brain' | 'tube' | 'anemone' | 'ball'.
function coral(T, parent, x, y, z, s, kind, glowing, ci = -1) {
  const rand = T.rand;
  const pick = (list) => list[ci >= 0 ? ci % list.length : Math.floor(rand() * list.length)];
  const mat = glowing ? glow(pick(C.coralGlow)) : toon(pick(C.coral));
  const g = group(parent, x, y, z, rand() * TAU, s);
  if (kind === 'brain') {
    const m = mesh(g, geo(`brain${Math.floor(rand() * 3)}`, () => bumpy(900 + GEO.size, 0.13, 11, 7, 3.2)), mat, 0, 0.1, 0);
    m.scale.set(0.95, 0.62, 0.9);
  } else if (kind === 'fan') {
    const m = mesh(g, geo(`fan${Math.floor(rand() * 2)}`, () => bumpy(940 + GEO.size, 0.12, 10, 7, 2.6)), mat, 0, 0.75, 0);
    m.scale.set(0.95, 0.75, 0.12);
    mesh(g, cyl(0.07, 0.09, 0.5, 6), mat, 0, 0.1, 0);
  } else if (kind === 'tube') {
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand();
      const h = 0.45 + rand() * 0.5;
      const t = mesh(g, cyl(0.17, 0.2, 1, 7), mat, Math.cos(a) * 0.28, h / 2, Math.sin(a) * 0.28);
      t.scale.set(1, h, 1);
      t.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2);
      mesh(g, cyl(0.12, 0.12, 0.04, 7), toon(C.pupil), Math.cos(a) * 0.28 + Math.cos(a) * 0.1 * h, h + 0.01, Math.sin(a) * 0.28 + Math.sin(a) * 0.1 * h).scale.set(1, 1, 1);
    }
  } else if (kind === 'anemone') {
    mesh(g, sphere(9, 6), mat, 0, 0.12, 0).scale.set(0.42, 0.3, 0.42);
    const f = capsule(0.06, 0.32, 1, 5);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      const t = mesh(g, f, mat, Math.cos(a) * 0.26, 0.38, Math.sin(a) * 0.26);
      t.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
    }
  } else if (kind === 'ball') {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + rand();
      const r = 0.25 + rand() * 0.15;
      mesh(g, sphere(9, 6), mat, Math.cos(a) * 0.3, r * 0.8 + (i === 3 ? 0.3 : 0), Math.sin(a) * 0.3).scale.setScalar(r);
    }
  } else {
    // stag (finger) coral: soft rounded fingers splaying out
    const finger = capsule(0.15, 0.7, 2, 6);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand();
      const k = 0.75 + rand() * 0.45;
      const m = mesh(g, finger, mat, Math.cos(a) * 0.28, 0.42 * k, Math.sin(a) * 0.28);
      m.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      m.scale.setScalar(k);
    }
  }
  return g;
}
const CORAL_KINDS = ['stag', 'fan', 'brain', 'tube', 'anemone', 'ball'];
// A garden of coral clumps round (x, z) on a ring from r0 to r1 at heights round y0, `n` clumps, about a third glowing.
function garden(T, x, z, r0, r1, n, y0 = -0.15, spread = 0.35) {
  const rand = T.rand;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rand() * 0.5;
    const d = r0 + rand() * (r1 - r0);
    const kind = CORAL_KINDS[Math.floor(rand() * CORAL_KINDS.length)];
    coral(T, T.root, x + Math.cos(a) * d, y0 + (rand() - 0.5) * spread, z + Math.sin(a) * d, 0.8 + rand() * 0.7, kind, rand() < 0.36);
  }
}
// A rough stone block half sunk at the waterline (rubble).
function rubble(T, parent, x, z, s, y = -0.25) {
  const rand = T.rand;
  const b = mesh(parent, rbox(1.4, 0.9, 1.0, 0.2, 1), stone(rand() < 0.5 ? 0xffffff : 0xf0ebe0), x, y + 0.2 * s, z, rand() * TAU);
  b.scale.set(s * (0.8 + rand() * 0.5), s * (0.7 + rand() * 0.5), s * (0.8 + rand() * 0.4));
  b.rotation.x = (rand() - 0.5) * 0.5;
  b.rotation.z = (rand() - 0.5) * 0.5;
  return b;
}
// A starfish lying on a surface (local y up), orange with pale dots.
function starfish(parent, x, y, z, s, rx = 0, rz = 0) {
  const g = group(parent, x, y, z, 0, s);
  g.rotation.set(rx, 0, rz);
  const arm = capsule(0.16, 0.55, 2, 6);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const m = mesh(g, arm, toon(C.star), Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38);
    m.rotation.set(0, -a, Math.PI / 2);
    m.scale.set(1, 1, 0.55);
    mesh(g, sphere(6, 4), toon(C.starDot), Math.cos(a) * 0.45, 0.08, Math.sin(a) * 0.45).scale.setScalar(0.06);
  }
  mesh(g, sphere(10, 6), toon(C.star), 0, 0.02, 0).scale.set(0.26, 0.12, 0.26);
  return g;
}
// Barnacles: a cluster of little volcano cones on a surface (local y up).
function barnacles(T, parent, x, y, z, n, s = 1, rx = 0, rz = 0) {
  const g = group(parent, x, y, z, 0, s);
  g.rotation.set(rx, 0, rz);
  for (let i = 0; i < n; i++) {
    const a = T.rand() * TAU;
    const d = Math.sqrt(T.rand()) * 0.6;
    const k = 0.6 + T.rand() * 0.6;
    mesh(g, cyl(0.07, 0.17, 0.2, 7), toon(C.barnacle), Math.cos(a) * d, 0.08 * k, Math.sin(a) * d).scale.setScalar(k);
  }
  return g;
}
// A little red crab (local +z forward), claws up as if waving.
function crab(parent, x, y, z, ry, s) {
  const g = group(parent, x, y, z, ry, s);
  mesh(g, sphere(12, 8), toon(C.crab), 0, 0.25, 0).scale.set(0.62, 0.3, 0.48);
  for (const sx of [-1, 1]) {
    mesh(g, capsule(0.07, 0.3, 2, 5), toon(C.crab), sx * 0.5, 0.42, 0.22).rotation.set(0.6, 0, sx * -0.9);
    mesh(g, sphere(9, 6), toon(C.crab), sx * 0.68, 0.62, 0.38).scale.set(0.2, 0.26, 0.14);
    mesh(g, sphere(8, 6), toon(C.eyeWhite), sx * 0.15, 0.62, 0.32).scale.setScalar(0.1);
    mesh(g, sphere(6, 4), toon(C.pupil), sx * 0.15, 0.64, 0.41).scale.setScalar(0.05);
    for (let k = 0; k < 3; k++) {
      const leg = mesh(g, capsule(0.04, 0.32, 2, 4), toon(C.crabDark), sx * 0.55, 0.12, -0.18 + k * 0.17);
      leg.rotation.set(0, 0, sx * 1.1);
    }
  }
  return g;
}
// A gull standing (local +z forward).
function gullStanding(parent, x, y, z, ry, s) {
  const g = group(parent, x, y, z, ry, s);
  mesh(g, sphere(12, 8), toon(C.gull), 0, 0.55, 0).scale.set(0.28, 0.3, 0.5);
  mesh(g, sphere(10, 7), toon(C.gull), 0, 0.92, 0.32).scale.setScalar(0.2);
  mesh(g, cone(0.06, 0.26, 6), toon(C.beak), 0, 0.9, 0.6).rotation.x = Math.PI / 2;
  for (const sx of [-1, 1]) {
    mesh(g, sphere(10, 6), toon(C.gullWing), sx * 0.2, 0.62, -0.08).scale.set(0.1, 0.2, 0.46);
    mesh(g, sphere(6, 4), toon(C.pupil), sx * 0.12, 0.98, 0.42).scale.setScalar(0.035);
    mesh(g, cyl(0.025, 0.025, 0.36, 4), toon(C.leg), sx * 0.09, 0.18, 0);
  }
  mesh(g, sphere(8, 5), toon(C.gullTip), 0, 0.6, -0.5).scale.set(0.16, 0.08, 0.18);
  return g;
}

// A column standing at (x, z) with its foot at y0 (under the water): plinth, moulding, fluted shaft of radius r and
// height h, a capital (or a jagged snapped top when broken, with coral on it). Returns its top height (world y).
function column(T, parent, x, z, o) {
  const rand = T.rand;
  const r = o.r ?? 0.7;
  const h = o.h ?? 8;
  const y0 = o.y0 ?? -1.2;
  const g = group(parent, x, y0, z, o.ry ?? rand() * TAU);
  if (o.tilt) g.rotation.set(o.tilt[0], g.rotation.y, o.tilt[1]);
  const tint = o.tint ?? 0xffffff;
  mesh(g, rbox(2.7, 0.7, 2.7, 0.16), stone(tint), 0, 0.35, 0).scale.set(r, 1, r);
  mesh(g, torus(1.08, 0.2, 7, 22), stone(tint), 0, 0.82, 0).rotation.x = Math.PI / 2;
  g.children[g.children.length - 1].scale.set(r, r, 1);
  const broken = o.broken ?? 0;
  const seed = Math.floor(rand() * 1000);
  const bk = broken > 0 ? Math.round((broken / h + 0.1) * 20) / 20 : 0;
  const sh = mesh(g, geo(`shaft${broken > 0 ? seed % 4 : 'w'},${bk}`, () => shaftGeo(12, bk, seed % 4)), stone(tint), 0, 0.9, 0);
  sh.scale.set(r, h, r);
  let top = y0 + 0.9 + h;
  if (!broken) {
    if (o.capital === 'ionic') {
      mesh(g, cyl(r * 1.05, r * 0.95, 0.35, 16), stone(tint), 0, 0.9 + h + 0.17, 0);
      mesh(g, rbox(2.8 * r, 0.45, 1.5 * r, 0.12), stone(tint), 0, 0.9 + h + 0.5, 0);
      for (const sx of [-1, 1]) mesh(g, cyl(0.42 * r, 0.42 * r, 1.6 * r, 14), stone(tint), sx * 1.25 * r, 0.9 + h + 0.38, 0).rotation.x = Math.PI / 2;
      mesh(g, rbox(2.9 * r, 0.35, 2.9 * r, 0.1), stone(tint), 0, 0.9 + h + 0.9, 0);
      top += 1.07;
    } else {
      mesh(g, cyl(r * 1.35, r * 0.95, 0.55, 16), stone(tint), 0, 0.9 + h + 0.27, 0);
      mesh(g, rbox(2.9 * r, 0.42, 2.9 * r, 0.1), stone(tint), 0, 0.9 + h + 0.75, 0);
      top += 0.96;
    }
  } else if (o.coral !== false) {
    // coral and a starfish on the snapped top
    const ty = 0.9 + h - broken * 0.6;
    coral(T, g, 0, ty, 0, r * 1.4, rand() < 0.5 ? 'stag' : 'brain', rand() < 0.5);
    if (rand() < 0.6) coral(T, g, r * 0.5, ty - 0.1, -r * 0.3, r * 0.9, 'tube', false);
    top = y0 + 0.9 + h - broken * 0.3;
  }
  return top;
}
// A column lying toppled at the water: `n` drums along the heading ry from (x, z), each a little off line and half sunk.
function fallenColumn(T, parent, x, z, ry, n, r = 0.75, y = 0.05) {
  const rand = T.rand;
  const dx = Math.sin(ry);
  const dz = Math.cos(ry);
  let d = 0;
  for (let i = 0; i < n; i++) {
    const len = 1.8 + rand() * 0.6;
    const cx = x + dx * (d + len / 2) + (rand() - 0.5) * 0.4;
    const cz = z + dz * (d + len / 2) + (rand() - 0.5) * 0.4;
    const m = mesh(parent, geo('drum', () => shaftGeo(12, 0, 0)), stone(), cx, y - (y > 0.5 ? 0 : i * 0.12 + (rand() - 0.5) * 0.2), cz);
    m.scale.set(r, len, r);
    m.rotation.set(Math.PI / 2 + (rand() - 0.5) * 0.25, ry + (rand() - 0.5) * 0.3, 0, 'YXZ');
    // (the shaft's foot is its origin: shift it back half its length so the drum is centred)
    m.position.x -= dx * len * 0.5;
    m.position.z -= dz * len * 0.5;
    d += len + 0.12;
  }
  return d;
}

// An arch over the water (the Sea Gate, the Coral Arch): two piers of stone courses, a half circle of voussoirs with
// a big keystone, spandrels filled with blocks and an entablature on top. ruined: a corner gone, blocks in the water.
function archway(T, A, ruined) {
  const rand = T.rand;
  const g = group(T.root, A.x, 0, A.z, A.ry);
  const pw = A.pier;
  const dep = A.depth;
  const rIn = A.half - pw / 2;
  const ring = 2.5;
  const rMid = rIn + ring / 2;
  const rOut = rIn + ring;
  const ys = A.spring;
  // the piers: a wide plinth at the water, then courses
  for (const s of [-1, 1]) {
    const px = s * A.half;
    mesh(g, rbox(pw + 1.3, 2.6, dep + 1.3, 0.3), stone(0xf2ede2), px, -0.5, 0);
    let y = 0.8;
    let k = 0;
    while (y < ys - 0.2) {
      const hgt = Math.min(1.55, ys - y);
      const c = mesh(g, rbox(pw - 0.1 * (k % 2), hgt - 0.06, dep - 0.12 * ((k + 1) % 2), 0.22, 1), stone(k % 3 === 1 ? 0xf6efe2 : 0xffffff), px + (rand() - 0.5) * 0.12, y + hgt / 2, (rand() - 0.5) * 0.1);
      c.rotation.y = (rand() - 0.5) * 0.04;
      y += hgt;
      k++;
    }
    // the impost the arch springs from
    mesh(g, rbox(pw + 0.7, 0.7, dep + 0.5, 0.18), stone(0xfff8ec), px, ys + 0.05, 0);
    // engaged half columns on both faces of the pier
    for (const sz of [-1, 1]) {
      const cg = group(g, px, 0.8, sz * (dep / 2 + 0.05));
      const sh = mesh(cg, geo('shaft-w,0', () => shaftGeo(12, 0, 0)), stone(), 0, 0, 0);
      sh.scale.set(0.62, ys - 1.25, 0.62);
      mesh(cg, cyl(0.85, 0.62, 0.45, 14), stone(), 0, ys - 1.0, 0);
    }
  }
  // the voussoirs and the keystone
  const n = 13;
  for (let i = 0; i < n; i++) {
    const am = (Math.PI * (i + 0.5)) / n;
    const len = (rMid * Math.PI) / n - 0.1;
    const key = i === (n - 1) / 2;
    const b = mesh(g, rbox(len + (key ? 0.5 : 0), ring + (key ? 0.7 : 0) - 0.06, dep + (key ? 0.5 : 0), 0.22), stone(key ? 0xfff6e6 : i % 2 ? 0xfaf3e6 : 0xffffff), Math.cos(am) * (rMid + (key ? 0.3 : 0)), ys + Math.sin(am) * (rMid + (key ? 0.3 : 0)), 0);
    b.rotation.z = am - Math.PI / 2;
  }
  // the spandrels: rows of blocks between the ring and the entablature
  const yTop = ys + rOut + 0.5;
  for (const s of [-1, 1]) {
    for (let y = ys + 0.6; y < yTop - 0.2; y += 1.5) {
      const hgt = Math.min(1.5, yTop - y);
      const ym = y + hgt * 0.5;
      const dy = ym - ys;
      const xin = dy < rOut ? Math.sqrt(rOut * rOut - dy * dy) - 0.4 : 0;
      const xout = A.half + pw / 2;
      if (xout - xin < 0.8) continue;
      if (ruined && s > 0 && y > yTop - 3.2) continue; // a corner fallen
      mesh(g, rbox(xout - xin, hgt - 0.06, dep - 0.3, 0.22, 1), stone(0xf7f1e4), s * (xin + xout) / 2, ym, 0);
    }
  }
  // the entablature and its cornice
  const span = 2 * A.half + pw;
  if (ruined) {
    mesh(g, rbox(span * 0.62, 1.5, dep + 0.3, 0.25), stone(0xfff8ec), -span * 0.19, yTop + 0.75, 0);
    mesh(g, rbox(span * 0.55, 0.6, dep + 1.0, 0.2), stone(0xffffff), -span * 0.22, yTop + 1.8, 0);
    // the fallen corner, in the water by its pier
    for (let i = 0; i < 4; i++) rubble(T, g, A.half + 2.5 + rand() * 2.5, (rand() - 0.5) * 7, 1.6 + rand() * 0.9, -0.4);
  } else {
    mesh(g, rbox(span, 1.5, dep + 0.3, 0.25), stone(0xfff8ec), 0, yTop + 0.75, 0);
    mesh(g, rbox(span + 1.0, 0.6, dep + 1.0, 0.2), stone(0xffffff), 0, yTop + 1.8, 0);
    // a low attic over the keystone with the King's gold crown on its faces (the King's gate)
    mesh(g, rbox(7.5, 1.3, dep - 0.2, 0.25), stone(0xfff4e2), 0, yTop + 2.75, 0);
    for (const sz of [-1, 1]) {
      const cr = group(g, 0, yTop + 2.7, sz * (dep / 2 - 0.02));
      cr.rotation.y = sz > 0 ? 0 : Math.PI;
      mesh(cr, rbox(2.6, 0.45, 0.3, 0.12), toon(C.gold), 0, -0.25, 0);
      for (let i = 0; i < 5; i++) {
        const x = -1.0 + i * 0.5;
        mesh(cr, cone(0.2, 0.65 + (i === 2 ? 0.2 : 0), 6), toon(C.gold), x, 0.25 + (i === 2 ? 0.1 : 0), 0.05);
        mesh(cr, sphere(6, 5), toon(C.coralGlow[i % 4]), x, 0.66 + (i === 2 ? 0.2 : 0), 0.05).scale.setScalar(0.12);
      }
    }
  }
  // a shell carved on the keystone, both faces
  for (const sz of [-1, 1]) {
    const sg = group(g, 0, ys + rMid + 0.3, sz * (dep / 2 + 0.3));
    sg.rotation.y = sz > 0 ? 0 : Math.PI;
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + (i / 4) * 1.8;
      const rib = mesh(sg, capsule(0.16, 0.8, 2, 6), stone(0xfff0d8), Math.sin(a) * 0.45, 0.1 + Math.cos(a) * 0.45, 0);
      rib.rotation.z = -a;
    }
  }
  // the kelp hanging from the arch's underside
  for (let i = 0; i < (ruined ? 16 : 11); i++) {
    const am = 0.25 + (i / ((ruined ? 16 : 11) - 1)) * (Math.PI - 0.5);
    const lx = Math.cos(am) * (rIn - 0.05);
    const ly = ys + Math.sin(am) * (rIn - 0.05);
    const zz = (rand() - 0.5) * (dep - 0.8);
    const p = new THREE.Vector3(lx, ly, zz).applyMatrix4(new THREE.Matrix4().makeRotationY(A.ry)).add(V3(A.x, 0, A.z));
    T.kelpHang.push({ x: p.x, y: p.y, z: p.z, len: (ruined ? 2.8 : 1.6) + rand() * (ruined ? 3.4 : 2.0), w: 0.32 });
  }
  // coral on the piers' feet, in the water round them
  for (const s of [-1, 1]) {
    const px = A.x + Math.cos(A.ry) * s * A.half;
    const pz = A.z - Math.sin(A.ry) * s * A.half;
    garden(T, px, pz, A.footR - 0.6, A.footR + 0.5, ruined ? 12 : 7);
    if (ruined) {
      for (let i = 0; i < 5; i++) {
        const y = 2 + rand() * (ys - 2);
        const side = rand() < 0.5 ? -1 : 1;
        const a = A.ry + (side > 0 ? 0 : Math.PI);
        coral(T, T.root, px + Math.sin(a) * (dep / 2 + 0.3) + Math.cos(A.ry) * (rand() - 0.5) * 3, y, pz + Math.cos(a) * (dep / 2 + 0.3) - Math.sin(A.ry) * (rand() - 0.5) * 3, 0.7 + rand() * 0.4, rand() < 0.5 ? 'brain' : 'ball', rand() < 0.5);
      }
    }
  }
  if (ruined) {
    // coral furring the top of the entablature
    for (let i = 0; i < 9; i++) {
      const lx = -A.half - 1 + rand() * (span * 0.6);
      const p = new THREE.Vector3(lx, yTop + 2.1, (rand() - 0.5) * 2.5).applyMatrix4(new THREE.Matrix4().makeRotationY(A.ry)).add(V3(A.x, 0, A.z));
      coral(T, T.root, p.x, p.y, p.z, 0.9 + rand() * 0.6, CORAL_KINDS[Math.floor(rand() * 6)], rand() < 0.4);
    }
  }
  return yTop + (ruined ? 2.1 : 3.4);
}

// A spire: a slender round tower with a balcony, a belfry with arched openings and a pointed roof (teal copper,
// red tiles, or a gold onion dome), leaning a little, or broken off with coral on the stump.
function spireTower(T, S) {
  const rand = T.rand;
  const g = group(T.root, S.x, 0, S.z, rand() * TAU);
  g.rotation.x = Math.cos(S.dir) * S.lean;
  g.rotation.z = Math.sin(S.dir) * S.lean;
  const r = S.r * 0.62;
  const H = S.h;
  const tint = 0xffffff;
  if (!S.roof) {
    // the broken stump: a plain shaft snapped off, coral and kelp on it
    mesh(g, lathe([[r * 1.5, -2], [r * 1.42, 0.7], [r * 1.18, 1.2], [r * 1.05, 1.7], [r * 1.0, 2.2]], 24), stone(tint));
    const sh = mesh(g, geo('spireStump', () => shaftGeo(0, 0.18, 7)), stone(tint), 0, 2.1, 0);
    sh.scale.set(r, H - 2.1, r);
    const ty = H - (H - 2.1) * 0.12;
    for (let i = 0; i < 4; i++) coral(T, g, (rand() - 0.5) * r, ty - 0.2, (rand() - 0.5) * r, 0.9 + rand() * 0.5, CORAL_KINDS[i % 6], i % 2 === 0);
    for (let i = 0; i < 3; i++) {
      const a = rand() * TAU;
      mesh(g, rbox(0.9, 0.5, 0.6, 0.12), toon(C.window), Math.cos(a) * r * 0.98, 4 + i * 3.4, Math.sin(a) * r * 0.98, -a + Math.PI / 2).scale.set(1, 1.6, 1);
    }
  } else {
    const yb = H * 0.6;
    const yf = H * 0.8;
    mesh(g, lathe([[r * 1.5, -2], [r * 1.42, 0.7], [r * 1.18, 1.2], [r * 1.05, 1.7], [r * 1.0, 2.2], [r * 0.94, yb - 0.4], [r * 1.0, yb]], 24), stone(tint));
    // the balcony
    mesh(g, cyl(r * 1.32, r * 1.12, 0.55, 24), stone(0xfff6e8), 0, yb + 0.25, 0);
    mesh(g, torus(r * 1.27, 0.12, 6, 28), stone(0xfff6e8), 0, yb + 1.2, 0).rotation.x = Math.PI / 2;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      mesh(g, cyl(0.09, 0.09, 0.7, 5), stone(0xfff6e8), Math.cos(a) * r * 1.27, yb + 0.85, Math.sin(a) * r * 1.27);
    }
    // the belfry and its cornice
    mesh(g, lathe([[r * 0.9, yb + 0.5], [r * 0.9, yf], [r * 1.08, yf + 0.25], [r * 1.08, yf + 0.7], [r * 0.95, yf + 0.85]], 24), stone(0xfffaf0));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      const w = mesh(g, rbox(r * 0.62, (yf - yb) * 0.55, 0.3, r * 0.3), toon(C.window), Math.cos(a) * r * 0.86, (yb + yf) / 2 + 0.3, Math.sin(a) * r * 0.86);
      w.rotation.y = -a + Math.PI / 2;
    }
    // slit windows down the shaft and a door half sunk at the water
    for (let i = 0; i < 3; i++) {
      const a = 0.4 + i * 2.2;
      const w = mesh(g, rbox(0.42, 1.2, 0.3, 0.16), toon(C.window), Math.cos(a) * r * 0.97, 4.5 + i * (yb - 6) / 3, Math.sin(a) * r * 0.97);
      w.rotation.y = -a + Math.PI / 2;
    }
    {
      const a = 0.4 + Math.PI;
      const w = mesh(g, rbox(1.3, 2.2, 0.4, 0.5), toon(C.door), Math.cos(a) * r * 1.15, 0.7, Math.sin(a) * r * 1.15);
      w.rotation.y = -a + Math.PI / 2;
    }
    const yr = yf + 0.8;
    const rh = H - yr;
    if (S.roof === 'gold') {
      mesh(g, lathe([[r * 1.0, 0], [r * 1.3, rh * 0.22], [r * 1.18, rh * 0.45], [r * 0.7, rh * 0.68], [r * 0.25, rh * 0.86], [0.08, rh * 0.98]], 22), toon(C.gold), 0, yr, 0);
      mesh(g, torus(r * 1.27, 0.12, 6, 26), toon(C.goldDark), 0, yr + rh * 0.24, 0).rotation.x = Math.PI / 2;
    } else {
      const col = S.roof === 'teal' ? C.teal : C.tile;
      const dark = S.roof === 'teal' ? C.tealDark : C.tileDark;
      mesh(g, cone(r * 1.22, rh * 0.95, 20), toon(col), 0, yr + rh * 0.475, 0);
      mesh(g, torus(r * 1.12, 0.1, 5, 22), toon(dark), 0, yr + 0.15, 0).rotation.x = Math.PI / 2;
      mesh(g, torus(r * 0.6, 0.08, 5, 18), toon(dark), 0, yr + rh * 0.48, 0).rotation.x = Math.PI / 2;
    }
    mesh(g, sphere(10, 7), toon(C.gold), 0, H + 0.05, 0).scale.setScalar(0.32);
    mesh(g, cone(0.1, 1.0, 6), toon(C.gold), 0, H + 0.75, 0);
    // a little kelp off the balcony
    for (let i = 0; i < 4; i++) {
      const a = rand() * TAU;
      const p = new THREE.Vector3(Math.cos(a) * r * 1.3, yb + 0.05, Math.sin(a) * r * 1.3);
      g.updateMatrixWorld(true);
      p.applyMatrix4(g.matrixWorld);
      T.kelpHang.push({ x: p.x, y: p.y, z: p.z, len: 1.2 + rand() * 1.4, w: 0.24 });
    }
  }
  // rubble and coral round the foot
  for (let i = 0; i < 6; i++) {
    const a = rand() * TAU;
    rubble(T, T.root, S.x + Math.cos(a) * (S.r - 0.4), S.z + Math.sin(a) * (S.r - 0.4), 0.9 + rand() * 0.7);
  }
  garden(T, S.x, S.z, S.r - 0.8, S.r + 0.4, 7);
  for (let i = 0; i < 5; i++) {
    const a = rand() * TAU;
    T.kelpStand.push({ x: S.x + Math.cos(a) * (S.r + 0.6 + rand()), z: S.z + Math.sin(a) * (S.r + 0.6 + rand()), len: 1.4 + rand() * 1.4 });
  }
}

// King Coral: the half-sunk stone king's head (local +z = his face), with a curly beard down into the sea, big
// friendly eyes, a crown overgrown with coral, gold earrings, a crab on his beard, a starfish on his cheek, barnacles
// and a gull on his crown.
function kingCoral(T) {
  const rand = T.rand;
  const g = group(T.root, KING.x, 0, KING.z, 0);
  const face = 0xfff0de;
  const beard = 0xd8dad0;
  const skull = mesh(g, sphere(44, 30), stone(face), 0, 8.2, 0);
  skull.scale.set(8.6, 9.8, 8.0);
  // ears, earrings
  for (const sx of [-1, 1]) {
    mesh(g, sphere(16, 12), stone(face), sx * 8.55, 9.1, 0.4).scale.set(1.15, 2.3, 1.6);
    mesh(g, sphere(12, 8), stone(0xf0dcc4), sx * 9.25, 9.2, 0.75).scale.set(0.45, 1.5, 0.9);
    const ring = mesh(g, torus(0.85, 0.2, 8, 20), toon(C.gold), sx * 9.1, 6.15, 0.75);
    ring.rotation.y = Math.PI / 2;
  }
  // hair curls at the back and sides, under the crown
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    const c = mesh(g, geo('curl', () => bumpy(77, 0.12, 12, 9)), stone(beard), Math.cos(a) * 7.9, 10.6 + (i % 2) * 1.1, Math.sin(a) * 7.3 - 0.4);
    c.scale.setScalar(1.6 + (i % 3) * 0.2);
  }
  // brows
  for (const sx of [-1, 1]) {
    const pts = bez(V3(sx * 1.0, 12.4, 7.25), V3(sx * 3.3, 13.6, 7.05), V3(sx * 5.6, 12.5, 5.6), 10);
    mesh(g, tubeAlong(pts, (t) => 0.62 + 0.25 * Math.sin(Math.PI * t), 10), stone(beard));
  }
  // eyes: sockets, whites, pupils looking a little to his right and down (at you), a sparkle
  for (const sx of [-1, 1]) {
    mesh(g, sphere(20, 14), stone(0xe8dcc6), sx * 3.15, 10.55, 6.55).scale.set(1.8, 1.5, 0.9);
    mesh(g, sphere(20, 14), toon(C.eyeWhite), sx * 3.15, 10.55, 7.0).scale.set(1.46, 1.22, 0.78);
    mesh(g, sphere(14, 10), toon(C.pupil), sx * 3.0 - 0.15, 10.3, 7.6).scale.set(0.66, 0.72, 0.32);
    mesh(g, sphere(8, 6), toon(C.eyeWhite, { outline: false }), sx * 3.0 + 0.1, 10.6, 7.86).scale.setScalar(0.2);
  }
  // nose, cheeks
  mesh(g, sphere(20, 14), stone(face), 0, 8.8, 8.0).scale.set(1.45, 2.2, 1.55);
  mesh(g, sphere(20, 14), stone(face), 0, 7.65, 8.75).scale.set(1.4, 1.25, 1.2);
  for (const sx of [-1, 1]) mesh(g, sphere(18, 12), stone(0xfff0e4), sx * 4.35, 7.9, 6.25).scale.set(2.0, 1.7, 1.4);
  // the beard: a broad mass down into the sea, rows of curls on it
  mesh(g, sphere(30, 20), stone(beard), 0, 2.4, 4.9).scale.set(7.4, 5.4, 4.4);
  const curl = geo('curl', () => bumpy(77, 0.12, 12, 9));
  const rows = [[4.9, 6, 8.2, 1.05], [2.9, 5, 9.0, 1.15], [0.9, 6, 9.1, 1.15], [-0.6, 5, 8.6, 1.1]];
  rows.forEach(([y, n, z, s], ri) => {
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 2.2 + (ri % 2) * 0.3;
      const zz = z - Math.abs(x) * 0.28;
      const c = mesh(g, curl, stone(ri % 2 ? beard : 0xcfd2c8), x, y, zz);
      c.scale.set(s, s * 1.1, s * 0.85);
    }
  });
  // the mustache, curling up at the ends; a little smile under it
  for (const sx of [-1, 1]) {
    const pts = [V3(sx * 0.2, 6.9, 8.95), V3(sx * 1.6, 6.35, 8.85), V3(sx * 3.2, 6.15, 8.25), V3(sx * 4.6, 6.6, 7.2), V3(sx * 5.3, 7.5, 6.5), V3(sx * 5.05, 8.25, 6.35)];
    mesh(g, tubeAlong(pts, (t) => 0.95 - 0.6 * t, 10), stone(beard));
  }
  mesh(g, tubeAlong(bez(V3(-1.3, 5.45, 8.55), V3(0, 4.9, 8.95), V3(1.3, 5.45, 8.55), 8), () => 0.26, 6), stone(0xe8b8a4));
  // the crown: a band with seven points, gold balls on them and a gold medallion at the front
  const cg = group(g, 0, 0, 0);
  mesh(cg, lathe([[7.35, 12.3], [7.85, 12.65], [7.9, 14.5], [7.6, 14.95], [6.6, 15.1]], 40), stone(0xfffaee));
  mesh(cg, torus(7.85, 0.26, 7, 40), stone(0xfff4e0), 0, 13.55, 0).rotation.x = Math.PI / 2;
  for (let i = 0; i < 7; i++) {
    const a = Math.PI / 2 + (i / 7) * TAU;
    const px = Math.cos(a) * 7.25;
    const pz = Math.sin(a) * 6.9;
    const pt = mesh(cg, cone(1.25, 3.4, 12), stone(0xfffaee), px, 16.5, pz);
    pt.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
    mesh(cg, sphere(12, 8), toon(C.gold), px * 1.02, 18.35, pz * 1.02).scale.setScalar(0.52);
  }
  {
    const md = mesh(cg, cyl(1.1, 1.1, 0.4, 20), toon(C.gold), 0, 13.6, 7.95);
    md.rotation.x = Math.PI / 2;
    mesh(cg, sphere(14, 10), toon(C.coralGlow[3]), 0, 13.6, 8.25).scale.set(0.6, 0.6, 0.3);
  }
  // coral growing all over the crown
  for (let i = 0; i < 22; i++) {
    const a = rand() * TAU;
    const onBand = i < 13;
    const rr = onBand ? 6.8 + rand() * 0.9 : rand() * 5.2;
    const y = onBand ? 15.0 + rand() * 0.3 : 8.2 + 9.8 * Math.sqrt(1 - (rr / 8.3) ** 2) - 0.25;
    const kind = onBand ? ['stag', 'fan', 'tube', 'ball'][i % 4] : ['brain', 'stag', 'anemone'][i % 3];
    coral(T, g, Math.cos(a) * rr, y, Math.sin(a) * rr * 0.93, 0.9 + rand() * 0.7, kind, rand() < 0.42);
  }
  // seaweed hanging off the band down his temples and the back of his head
  for (let i = 0; i < 16; i++) {
    const a = Math.PI / 2 + 0.75 + (i / 15) * (TAU - 1.5);
    T.kelpHang.push({ x: KING.x + Math.cos(a) * 7.95, y: 12.35, z: KING.z + Math.sin(a) * 7.55, len: 2.6 + rand() * 4.2, w: 0.34 });
  }
  // a starfish on his left cheek, barnacles on his right temple and beard
  starfish(g, 4.9, 8.4, 7.15, 0.95, 1.2, -0.45);
  barnacles(T, g, -6.6, 11.8, 4.2, 9, 1.1, 0.8, 0.9);
  barnacles(T, g, 3.6, 1.4, 8.7, 7, 1.0, 1.3, -0.2);
  barnacles(T, g, -5.6, 2.2, 7.4, 6, 1.0, 1.0, 0.5);
  // a little crab on his beard, waving; a gull on his front crown point
  crab(g, -2.4, 3.95, 9.8, 0.2, 0.95);
  gullStanding(g, 0, 18.75, 6.95, 0.4, 1.3);
  // coral and rubble round him in the water
  garden(T, KING.x, KING.z, KING.r - 2.6, KING.r - 0.4, 15, -0.1, 0.3);
  for (let i = 0; i < 8; i++) {
    const a = rand() * TAU;
    rubble(T, T.root, KING.x + Math.cos(a) * (KING.r - 1.2), KING.z + Math.sin(a) * (KING.r - 1.6), 1 + rand() * 0.8);
  }
  for (let i = 0; i < 10; i++) {
    const a = rand() * TAU;
    T.kelpStand.push({ x: KING.x + Math.cos(a) * (KING.r + 0.4 + rand() * 1.5), z: KING.z + Math.sin(a) * (KING.r + 0.4 + rand() * 1.5), len: 1.6 + rand() * 1.6 });
  }
}

// The temple on its steps (east): a portico of fluted columns under a pediment with a gold shell in it, the cella's
// back row broken, a column fallen down the steps; facing the King.
function temple(T) {
  const rand = T.rand;
  const P = TEMPLE;
  const ry = Math.atan2(KING.x - P.x, KING.z - P.z);
  const g = group(T.root, P.x, 0, P.z, ry);
  // the steps
  mesh(g, rbox(17.5, 2.4, 13.5, 0.35), stone(0xf7f1e4), 0, -0.7, 0);
  mesh(g, rbox(16, 1.0, 12, 0.3), stone(), 0, 0.9, 0);
  mesh(g, rbox(14.6, 0.9, 10.6, 0.28), stone(0xfaf4e8), 0, 1.75, 0);
  const y0 = 2.2;
  const colH = 8.4;
  // front row: four whole columns; back row: one whole, two broken
  const xs = [-4.5, -1.5, 1.5, 4.5];
  for (const x of xs) column(T, g, x, 3.6, { r: 0.68, h: colH, y0, ry: 0, capital: 'ionic' });
  column(T, g, -4.5, -3.6, { r: 0.68, h: colH, y0, ry: 0, capital: 'ionic' });
  column(T, g, -1.5, -3.6, { r: 0.68, h: 5.2, y0, ry: 0.4, broken: 1.0 });
  column(T, g, 4.5, -3.6, { r: 0.68, h: 3.1, y0, ry: 1.2, broken: 0.8 });
  fallenColumn(T, g, -4.2, 0.2, Math.PI / 2 + 0.06, 4, 0.66, y0 + 0.62);
  const yA = y0 + 0.9 + colH + 1.07;
  // the architrave and frieze
  mesh(g, rbox(11.2, 1.0, 1.7, 0.2), stone(0xfff8ec), 0, yA + 0.5, 3.6);
  mesh(g, rbox(11.6, 0.8, 1.9, 0.2), stone(), 0, yA + 1.4, 3.6);
  mesh(g, rbox(1.7, 1.0, 8.6, 0.2), stone(0xfff8ec), -4.5, yA + 0.5, 0);
  // the pediment: a bevelled triangle with raking cornices and a gold shell in it
  {
    const sh = new THREE.Shape();
    sh.moveTo(-5.6, 0);
    sh.lineTo(5.6, 0);
    sh.lineTo(0, 3.0);
    sh.lineTo(-5.6, 0);
    const pg = geo('pediment', () => {
      const e = new THREE.ExtrudeGeometry(sh, { depth: 1.2, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 2, curveSegments: 1 });
      e.translate(0, 0, -0.6);
      return e;
    });
    mesh(g, pg, stone(0xfffaf0), 0, yA + 1.8, 3.6);
    const slope = Math.atan2(3.0, 5.6);
    const len = Math.hypot(5.6, 3.0) + 0.6;
    for (const s of [-1, 1]) {
      const rc = mesh(g, rbox(len, 0.5, 2.1, 0.18), stone(), s * 2.8, yA + 1.8 + 1.62, 3.6);
      rc.rotation.z = -s * slope;
    }
    const shell = group(g, 0, yA + 2.55, 4.45);
    for (let i = 0; i < 7; i++) {
      const a = -1.1 + (i / 6) * 2.2;
      const rib = mesh(shell, capsule(0.15, 0.95, 2, 6), toon(C.gold), Math.sin(a) * 0.55, Math.cos(a) * 0.55, 0);
      rib.rotation.z = -a;
    }
    mesh(shell, sphere(10, 6), toon(C.goldDark), 0, -0.05, 0).scale.set(0.36, 0.24, 0.2);
  }
  // rubble, coral and kelp round the steps
  for (let i = 0; i < 10; i++) {
    const a = rand() * TAU;
    const d = 8.5 + rand() * 2.8;
    rubble(T, T.root, P.x + Math.cos(a) * d, P.z + Math.sin(a) * d, 1.1 + rand() * 0.8);
  }
  garden(T, P.x, P.z, P.r - 2.2, P.r - 0.2, 17);
  for (let i = 0; i < 10; i++) {
    const a = rand() * TAU;
    T.kelpStand.push({ x: P.x + Math.cos(a) * (P.r + 0.2 + rand() * 1.5), z: P.z + Math.sin(a) * (P.r + 0.2 + rand() * 1.5), len: 1.4 + rand() * 1.8 });
  }
}

// The palace (north-west): a great round tower in its drowned walls, arched windows in rows, a gallery and a big gold
// onion dome; a little tower with a teal roof joined to it by a crenellated wall; its gate half sunk at the water.
function palace(T) {
  const rand = T.rand;
  const P = PALACE;
  const g = group(T.root, P.x, 0, P.z, 0);
  const R = 6.4;
  mesh(g, lathe([[R * 1.12, -2], [R * 1.08, 0.9], [R * 1.0, 1.6], [R * 0.97, 20], [R * 1.1, 20.6], [R * 1.1, 21.1], [R * 1.02, 21.3], [R * 1.02, 24.4], [R * 1.12, 24.8], [R * 1.1, 25.3], [R * 0.86, 25.5], [R * 0.86, 26.6]], 40), stone());
  // rows of arched windows and the gallery's arches
  for (const [y, n, h] of [[6.5, 6, 2.6], [12.5, 6, 2.6], [17.5, 8, 2.0], [22.8, 10, 2.4]]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + y * 0.1;
      const rr = y > 22 ? R * 1.0 : R * 0.97;
      const w = mesh(g, rbox(y > 22 ? 1.35 : 1.15, h, 0.4, 0.5), toon(C.window), Math.cos(a) * rr, y, Math.sin(a) * rr);
      w.rotation.y = -a + Math.PI / 2;
    }
  }
  // the gate, half sunk, facing the King
  {
    const a = Math.atan2(KING.z - P.z, KING.x - P.x);
    const w = mesh(g, rbox(3.2, 4.4, 0.5, 1.4), toon(C.door), Math.cos(a) * R * 1.06, 0.9, Math.sin(a) * R * 1.06);
    w.rotation.y = -a + Math.PI / 2;
    const arch = mesh(g, torus(1.85, 0.35, 8, 18, Math.PI), stone(0xfff6e6), Math.cos(a) * R * 1.12, 2.4, Math.sin(a) * R * 1.12);
    arch.rotation.y = -a + Math.PI / 2;
  }
  // the gold onion dome with its finial
  const yd = 26.5;
  mesh(g, lathe([[R * 0.88, 0], [R * 1.08, 1.4], [R * 1.12, 2.6], [R * 0.95, 4.0], [R * 0.6, 5.5], [R * 0.25, 6.9], [0.1, 7.9]], 32), toon(C.gold), 0, yd, 0);
  mesh(g, torus(R * 1.1, 0.2, 7, 36), toon(C.goldDark), 0, yd + 2.2, 0).rotation.x = Math.PI / 2;
  mesh(g, sphere(12, 8), toon(C.gold), 0, yd + 8.1, 0).scale.setScalar(0.5);
  mesh(g, cone(0.14, 1.4, 6), toon(C.gold), 0, yd + 9.2, 0);
  // the little tower with its teal roof
  const S = P.side;
  const sg = group(T.root, S.x, 0, S.z, 0);
  const r = 2.9;
  mesh(sg, lathe([[r * 1.25, -2], [r * 1.2, 0.8], [r * 1.0, 1.4], [r * 0.96, 16.5], [r * 1.12, 16.9], [r * 1.12, 17.4], [r * 1.0, 17.5]], 24), stone(0xfaf4e8));
  mesh(sg, cone(r * 1.28, 5.8, 20), toon(C.teal), 0, 17.4 + 2.9, 0);
  mesh(sg, torus(r * 1.18, 0.12, 5, 22), toon(C.tealDark), 0, 17.55, 0).rotation.x = Math.PI / 2;
  mesh(sg, sphere(10, 7), toon(C.gold), 0, 23.3, 0).scale.setScalar(0.3);
  for (let i = 0; i < 3; i++) {
    const a = 1 + i * 2.1;
    const w = mesh(sg, rbox(0.5, 1.4, 0.3, 0.2), toon(C.window), Math.cos(a) * r * 0.97, 5 + i * 4, Math.sin(a) * r * 0.97);
    w.rotation.y = -a + Math.PI / 2;
  }
  // the wall between them, crenellated, with two arched windows
  {
    const dx = S.x - P.x;
    const dz = S.z - P.z;
    const L = Math.hypot(dx, dz) - R - r * 0.6;
    const mid = (R + L / 2) / Math.hypot(dx, dz);
    const wg = group(T.root, P.x + dx * mid, 0, P.z + dz * mid, Math.atan2(-dz, dx));
    mesh(wg, rbox(L + 0.6, 10, 2.2, 0.3), stone(0xf7f1e4), 0, 3.5, 0);
    for (let i = 0; i < Math.floor(L / 1.6); i++) mesh(wg, rbox(0.9, 1.0, 2.3, 0.15), stone(0xf7f1e4), -L / 2 + 0.6 + i * 1.6, 9.0, 0);
    for (const sx of [-0.25, 0.25]) for (const sz of [-1, 1]) mesh(wg, rbox(1.2, 2.4, 0.3, 0.5), toon(C.window), sx * L, 5.2, sz * 1.1);
  }
  // rubble, coral and kelp round it
  for (let i = 0; i < 12; i++) {
    const a = rand() * TAU;
    const d = 7.6 + rand() * 2.6;
    rubble(T, T.root, P.x + Math.cos(a) * d, P.z + Math.sin(a) * d, 1.1 + rand() * 0.9);
  }
  garden(T, P.x, P.z, P.r - 2.0, P.r - 0.2, 16);
  garden(T, S.x, S.z, S.r - 1.4, S.r - 0.2, 7);
  for (let i = 0; i < 10; i++) {
    const a = rand() * TAU;
    T.kelpStand.push({ x: P.x + Math.cos(a) * (P.r + 0.3 + rand() * 1.5), z: P.z + Math.sin(a) * (P.r + 0.3 + rand() * 1.5), len: 1.4 + rand() * 1.8 });
  }
  for (let i = 0; i < 8; i++) {
    const a = rand() * TAU;
    T.kelpHang.push({ x: P.x + Math.cos(a) * R * 1.11, y: 20.55, z: P.z + Math.sin(a) * R * 1.11, len: 1.4 + rand() * 2.2, w: 0.3 });
  }
}

// The sunken theatre (north): a half bowl of stone tiers open to the south, end walls, broken columns along its top and
// a mermaid statue holding up a gold shell.
function theatre(T) {
  const rand = T.rand;
  const P = THEATRE;
  const g = group(T.root, P.x, 0, P.z, 0);
  const prof = [[3.6, -1.2], [3.6, 0.3], [5.8, 0.3], [5.8, 1.3], [7.8, 1.3], [7.8, 2.3], [9.8, 2.3], [9.8, 3.3], [11.8, 3.3], [11.8, 4.5], [12.3, 4.5], [12.5, 3.6], [12.5, -1.6]];
  // (a lathe round y; the back half, the side away from +z)
  const bowl = geo('theatre', () => {
    const pts = [];
    for (let i = 0; i < prof.length; i++) {
      const [r, y] = prof[i];
      pts.push([r, y]);
      if (i + 1 < prof.length) {
        const [r1, y1] = prof[i + 1];
        pts.push([r + (r1 - r) * 0.02, y + (y1 - y) * 0.02], [r + (r1 - r) * 0.98, y + (y1 - y) * 0.98]);
      }
    }
    // (outermost first: the tiers' faces then look up and into the bowl)
    return new THREE.LatheGeometry(pts.reverse().map(([r, y]) => new THREE.Vector2(r, y)), 36, Math.PI / 2, Math.PI);
  });
  mesh(g, bowl, stone());
  for (const s of [-1, 1]) mesh(g, rbox(9.4, 6.2, 1.1, 0.3), stone(0xf7f1e4), s * 8.0, 1.5, 0.45);
  // broken columns along the top
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 2 + ((i + 0.5) / 6) * Math.PI;
    if (i === 2 || i === 3) continue;
    column(T, g, Math.sin(a) * 12.0, Math.cos(a) * 12.0, { r: 0.55, h: 2.2 + rand() * 3.5, y0: 4.0, broken: 0.9 });
  }
  // the mermaid statue at the top centre, holding up a gold shell
  {
    const mg = group(g, 0, 4.4, -11.4, 0);
    mesh(mg, rbox(2.2, 1.0, 2.2, 0.2), stone(0xfaf4e8), 0, 0.5, 0);
    const tail = [V3(0.2, 1.0, 0.4), V3(0.5, 1.5, 0.1), V3(0.3, 2.5, -0.1), V3(0, 3.6, 0)];
    mesh(mg, tubeAlong(tail, (t) => 0.42 + 0.2 * Math.sin(Math.PI * t), 10), stone());
    for (const sx of [-1, 1]) mesh(mg, sphere(10, 6), stone(), 0.3 + sx * 0.38, 0.95, 0.75).scale.set(0.45, 0.12, 0.3);
    mesh(mg, capsule(0.48, 1.1, 3, 10), stone(), 0, 4.3, 0);
    mesh(mg, sphere(14, 10), stone(0xfff2e2), 0, 5.6, 0.05).scale.setScalar(0.52);
    mesh(mg, sphere(12, 8), stone(0xe8dcc4), 0, 5.75, -0.18).scale.set(0.58, 0.6, 0.52);
    for (const sx of [-1, 1]) {
      const arm = [V3(sx * 0.42, 4.7, 0), V3(sx * 0.75, 5.6, 0.1), V3(sx * 0.45, 6.6, 0.15)];
      mesh(mg, tubeAlong(arm, () => 0.16, 6), stone());
    }
    const sh = group(mg, 0, 6.95, 0.15);
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + (i / 4) * 1.8;
      const rib = mesh(sh, capsule(0.12, 0.6, 2, 6), toon(C.gold), Math.sin(a) * 0.38, Math.cos(a) * 0.38, 0);
      rib.rotation.z = -a;
    }
  }
  for (let i = 0; i < 9; i++) {
    const a = Math.PI / 2 + rand() * Math.PI;
    rubble(T, T.root, P.x + Math.sin(a) * (P.r - 0.8), P.z + Math.cos(a) * (P.r - 0.8), 1.1 + rand() * 0.8);
  }
  garden(T, P.x, P.z, P.r - 1.6, P.r + 0.2, 15);
  // coral on the tiers
  for (let i = 0; i < 12; i++) {
    const a = Math.PI / 2 + 0.2 + rand() * (Math.PI - 0.4);
    const k = Math.floor(rand() * 4);
    const rr = [6.8, 8.8, 10.8, 4.6][k];
    coral(T, g, Math.sin(a) * rr, [1.3, 2.3, 3.3, 0.3][k], Math.cos(a) * rr, 0.8 + rand() * 0.5, CORAL_KINDS[Math.floor(rand() * 6)], rand() < 0.4);
  }
}

// The King's own stone hand (south-east), rising out of the sea with a gold bracelet, holding up the golden orb.
function kingsHand(T) {
  const rand = T.rand;
  const P = HAND;
  const ry = Math.atan2(START.x - P.x, START.z - P.z) + 0.5;
  const g = group(T.root, P.x, 0, P.z, ry);
  const fore = [V3(0, -2.5, 0.4), V3(0.15, 2, 0.1), V3(0.3, 6.6, -0.5)];
  mesh(g, tubeAlong(fore, (t) => 2.15 - 0.35 * t, 14), stone(0xfff2e2));
  mesh(g, torus(1.95, 0.42, 9, 28), toon(C.gold), 0.25, 5.0, -0.35).rotation.x = Math.PI / 2 + 0.08;
  // the palm, cupped, and the thumb
  const palm = mesh(g, geo('palm', () => bumpy(31, 0.06, 18, 12)), stone(0xfff2e2), 0.35, 8.1, -0.4);
  palm.scale.set(2.35, 1.9, 1.35);
  const thumb = [V3(2.0, 7.6, 0.2), V3(2.95, 9.0, 0.5), V3(2.85, 10.6, 0.7), V3(2.2, 11.6, 1.0)];
  mesh(g, tubeAlong(thumb, (t) => 0.62 - 0.12 * t, 10), stone(0xfff2e2));
  // four fingers curling up round the front of the orb, their tips on it
  for (let i = 0; i < 4; i++) {
    const x = -1.65 + i * 1.08;
    const L = [0.9, 1.0, 0.97, 0.84][i];
    const pts = [V3(x, 8.6, 0.6), V3(x * 1.08, 9.0, 1.75), V3(x * 1.02, 9.0 + 1.5 * L, 2.35), V3(x * 0.92, 9.4 + 2.3 * L, 2.05)];
    mesh(g, tubeAlong(pts, (t) => 0.6 - 0.12 * t, 10), stone(0xfff2e2));
    mesh(g, sphere(8, 6), stone(0xfff6ea), x * 1.06, 9.05, 1.75).scale.setScalar(0.62);
  }
  // the golden orb with its band and its little cross
  const oy = 11.4;
  mesh(g, sphere(28, 20), toon(C.gold), 0.25, oy, -0.2).scale.setScalar(2.05);
  mesh(g, torus(2.07, 0.16, 7, 34), toon(C.goldDark), 0.25, oy, -0.2).rotation.x = Math.PI / 2;
  mesh(g, torus(2.07, 0.14, 7, 34), toon(C.goldDark), 0.25, oy, -0.2);
  mesh(g, cyl(0.16, 0.16, 1.3, 8), toon(C.gold), 0.25, oy + 2.6, -0.2);
  mesh(g, cyl(0.16, 0.16, 0.9, 8), toon(C.gold), 0.25, oy + 2.7, -0.2).rotation.z = Math.PI / 2;
  mesh(g, sphere(10, 8), toon(C.coralGlow[0]), 0.25, oy + 0.4, 1.83).scale.set(0.45, 0.45, 0.2);
  barnacles(T, g, -1.6, 1.4, 1.2, 8, 1.1, 0.4, 1.0);
  starfish(g, 1.6, 3.2, 1.6, 0.9, 1.0, 0.6);
  garden(T, P.x, P.z, P.r - 2.4, P.r - 0.3, 12);
  for (let i = 0; i < 5; i++) {
    const a = rand() * TAU;
    rubble(T, T.root, P.x + Math.cos(a) * (P.r - 1.2), P.z + Math.sin(a) * (P.r - 1.2), 1.0 + rand() * 0.6);
  }
  for (let i = 0; i < 6; i++) {
    const a = rand() * TAU;
    T.kelpStand.push({ x: P.x + Math.cos(a) * (P.r + 0.3 + rand()), z: P.z + Math.sin(a) * (P.r + 0.3 + rand()), len: 1.4 + rand() * 1.4 });
  }
}

// The toppled colonnade (south-west): a sand bank with a row of columns, two still holding up their lintel, the
// rest broken, and one lying fallen in the water.
function colonnade(T) {
  const rand = T.rand;
  const [a, b] = COLONNADE.lumps;
  const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
  const g = group(T.root, a[0], 0, a[1], ry);
  const dz = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const zs = [-4.6, -1.8, 1.0, 3.8, 6.6, 9.4];
  zs.forEach((z, i) => {
    if (i === 4) return;
    const whole = i === 1 || i === 2;
    column(T, g, 0, z * (dz / 9.4) * 0.9, { r: 0.72, h: whole ? 8.0 : 2.5 + rand() * 3.5, y0: -0.6, ry: rand(), capital: whole ? 'doric' : null, broken: whole ? 0 : 0.9 });
  });
  // the lintel on the two whole columns
  mesh(g, rbox(2.4, 1.1, 4.6, 0.22), stone(0xfff8ec), 0, -0.6 + 0.9 + 8.0 + 0.96 + 0.55, (zs[1] + zs[2]) / 2 * (dz / 9.4) * 0.9);
  fallenColumn(T, g, 2.6, -2.5, 0.9, 4, 0.72);
  for (let i = 0; i < 8; i++) rubble(T, g, (rand() - 0.5) * 7, (rand() - 0.5) * 12 + 2, 1.0 + rand() * 0.8, -0.1);
  garden(T, a[0], a[1], a[2] - 2.0, a[2] - 0.2, 14);
  garden(T, b[0], b[1], b[2] - 1.6, b[2] - 0.2, 8);
  for (let i = 0; i < 8; i++) {
    const t = rand();
    const c = rand() < 0.6 ? a : b;
    const an = rand() * TAU;
    T.kelpStand.push({ x: c[0] + Math.cos(an) * (c[2] + 0.3 + t * 1.5), z: c[1] + Math.sin(an) * (c[2] + 0.3 + t * 1.5), len: 1.4 + rand() * 1.4 });
  }
}

// The far city on the horizon (outside the arena): plain silhouettes, fogged by distance.
function skyline(T) {
  const rand = T.rand;
  for (const [deg, d, kind, s] of SKYLINE) {
    const a = deg * DEG;
    const g = group(T.root, Math.cos(a) * d, 0, Math.sin(a) * d, -a + Math.PI / 2, s * 1.6);
    if (kind === 'spire') {
      mesh(g, cyl(1.8, 2.3, 22, 10), stone(), 0, 10, 0);
      mesh(g, cyl(2.5, 2.3, 1.0, 10), stone(), 0, 20.5, 0);
      mesh(g, cone(2.4, 8, 10), toon(rand() < 0.5 ? C.teal : C.tile), 0, 25, 0);
    } else if (kind === 'dome') {
      mesh(g, cyl(4.2, 4.6, 12, 14), stone(), 0, 5, 0);
      mesh(g, lathe([[4.2, 0], [4.9, 1.6], [4.4, 3.6], [2.4, 5.6], [0.1, 7.2]], 14), toon(C.gold), 0, 11, 0);
    } else if (kind === 'arch') {
      for (const sx of [-1, 1]) mesh(g, rbox(3, 11, 3, 0.3), stone(), sx * 6, 4.5, 0);
      const t = mesh(g, torus(6, 1.5, 6, 14, Math.PI), stone(), 0, 10, 0);
      t.scale.set(1, 1, 1.2);
      mesh(g, rbox(16, 2, 3.2, 0.3), stone(), 0, 17, 0);
    } else {
      for (let i = 0; i < 4; i++) mesh(g, cyl(0.9, 1.0, i === 3 ? 6 : 11, 8), stone(), -6 + i * 4, i === 3 ? 2 : 4.5, 0);
      mesh(g, rbox(10, 1.4, 2.4, 0.2), stone(), -2, 10.6, 0);
    }
  }
}

// ---------------------------------------------------------------------------
// The coral currents' paths (pure data, made once): each arc of the ring sampled every LANE.ctrl degrees, a smooth
// curve through those points sampled every LANE.step u. The Coral Arch stands where the Coral Run passes nearest
// CORAL_ARCH.near, square across it.
// ---------------------------------------------------------------------------
function catmull(ctrl, step) {
  const P = ctrl;
  const ext = [{ x: 2 * P[0].x - P[1].x, z: 2 * P[0].z - P[1].z }, ...P, { x: 2 * P[P.length - 1].x - P[P.length - 2].x, z: 2 * P[P.length - 1].z - P[P.length - 2].z }];
  const pts = [];
  for (let i = 1; i < ext.length - 2; i++) {
    const p0 = ext[i - 1];
    const p1 = ext[i];
    const p2 = ext[i + 1];
    const p3 = ext[i + 2];
    const n = Math.max(2, Math.round(Math.hypot(p2.x - p1.x, p2.z - p1.z) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push({ x: r2(f(p0.x, p1.x, p2.x, p3.x)), z: r2(f(p0.z, p1.z, p2.z, p3.z)) });
    }
  }
  const last = P[P.length - 1];
  pts.push({ x: r2(last.x), z: r2(last.z) });
  return pts;
}
function makeLanes() {
  return ARCS.map((A) => {
    const n = Math.max(4, Math.round(Math.abs(A.to - A.from) / LANE.ctrl));
    const ctrl = [];
    for (let i = 0; i <= n; i++) {
      const th = (A.from + (A.to - A.from) * (i / n)) * DEG;
      const w = 1 + A.wob[1] * Math.sin(A.wob[0] * th + A.wob[2]);
      ctrl.push({ x: RING.x + Math.cos(th) * RING.rx * w, z: RING.z + Math.sin(th) * RING.rz * w });
    }
    return { id: A.id, points: catmull(ctrl, LANE.step), width: LANE.width };
  });
}
const LANES = makeLanes();
{
  const P = LANES[1].points;
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < P.length - 1; i++) {
    const d = Math.hypot(P[i].x - CORAL_ARCH.near[0], P[i].z - CORAL_ARCH.near[1]);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  const a = P[best];
  const b = P[best + 1];
  CORAL_ARCH.x = r2((a.x + b.x) / 2);
  CORAL_ARCH.z = r2((a.z + b.z) / 2);
  CORAL_ARCH.ry = Math.atan2(b.x - a.x, b.z - a.z);
}
// The arches' feet (the colliders), on the arch's x axis.
const archFeet = (A) => [-1, 1].map((s) => ({ x: r2(A.x + Math.cos(A.ry) * A.half * s), z: r2(A.z - Math.sin(A.ry) * A.half * s) }));

// A polyline with its running length, and the point and heading `s` u along it (clamped to its ends).
function pathOf(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  return { pts: points, cum, len: cum[cum.length - 1] };
}
function pathAt(P, s, out) {
  const d = Math.min(Math.max(s, 0), P.len);
  let lo = 0;
  let hi = P.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (P.cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const a = P.pts[lo];
  const b = P.pts[hi];
  const L = P.cum[hi] - P.cum[lo] || 1;
  const t = (d - P.cum[lo]) / L;
  out.x = a.x + (b.x - a.x) * t;
  out.z = a.z + (b.z - a.z) * t;
  out.dx = (b.x - a.x) / L;
  out.dz = (b.z - a.z) / L;
  return out;
}

// ---------------------------------------------------------------------------
// The lanes on the water: one strip mesh for all three, riding the swell on the GPU. aL = (u along the lane, across
// -1..1 at its edges, lane index). Scrolling chevrons point the way, a dashed foam line marks each edge, over a pale
// veil; the scroll is uFlow (the snapshot's `flow`), the fade uOn.
// ---------------------------------------------------------------------------
const ACROSS = [-1.16, -0.66, -0.33, 0, 0.33, 0.66, 1.16];
function buildLanes(lanes, timeU, ampU) {
  const pos = [];
  const aL = [];
  const index = [];
  const lens = [];
  lanes.forEach((L, li) => {
    const P = pathOf(L.points);
    lens.push(P.len);
    const hw = L.width / 2;
    // rows every LANE.viewStep u, and one more each end past it (the rounded ends of the lane's band)
    const ss = [-hw];
    for (let s = 0; s < P.len; s += LANE.viewStep) ss.push(s);
    ss.push(P.len, P.len + hw);
    const q = {};
    const base = pos.length / 3;
    for (const s of ss) {
      pathAt(P, s, q);
      // (the heading: averaged across a corner)
      const q2 = pathAt(P, s + 1.0, {});
      const q1 = pathAt(P, s - 1.0, {});
      let dx = q2.x - q1.x;
      let dz = q2.z - q1.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const x0 = s < 0 ? P.pts[0].x + q.dx * s : s > P.len ? P.pts[P.pts.length - 1].x + q.dx * (s - P.len) : q.x;
      const z0 = s < 0 ? P.pts[0].z + q.dz * s : s > P.len ? P.pts[P.pts.length - 1].z + q.dz * (s - P.len) : q.z;
      for (const a of ACROSS) {
        pos.push(x0 + dz * a * hw, 0, z0 - dx * a * hw);
        aL.push(s, a, li);
      }
    }
    const W = ACROSS.length;
    for (let r = 0; r < ss.length - 1; r++) {
      for (let k = 0; k < W - 1; k++) {
        const a = base + r * W + k;
        const b = a + W;
        index.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aL', new THREE.Float32BufferAttribute(aL, 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  const U = {
    uTime: timeU,
    uAmp: ampU,
    uFlow: { value: new THREE.Vector3() },
    uOn: { value: new THREE.Vector3(1, 1, 1) },
    uLen: { value: new THREE.Vector3(lens[0] ?? 0, lens[1] ?? 0, lens[2] ?? 0) },
    uVeil: { value: new THREE.Color(0xe4fffa) },
    uFoam: { value: new THREE.Color(0xffffff) },
  };
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, fog: true });
  m.name = 'spires-lanes';
  noOutline(m);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform float uAmp;
attribute vec3 aL;
varying vec3 vL;
${WAVE_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vL = aL;
{
  vec2 wxz = (modelMatrix * vec4(position.x, 0.0, position.z, 1.0)).xz;
  float far = abs(wxz.x - cameraPosition.x) + abs(wxz.y - cameraPosition.z);
  transformed.y = waveH(wxz, uTime, uAmp) + 0.09 + far * 0.0013;
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uFlow, uOn, uLen, uVeil, uFoam;
varying vec3 vL;`)
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float s = vL.x;
        float a = vL.y;
        float li = vL.z;
        float flow = li < 0.5 ? uFlow.x : (li < 1.5 ? uFlow.y : uFlow.z);
        float on = li < 0.5 ? uOn.x : (li < 1.5 ? uOn.y : uOn.z);
        float len = li < 0.5 ? uLen.x : (li < 1.5 ? uLen.y : uLen.z);
        float aa = abs(a);
        float fa = max(fwidth(aa), 1e-4);
        float fs = max(fwidth(s), 1e-4);
        // the pale veil over the lane, a little brighter in its middle
        float inside = 1.0 - smoothstep(1.0 - fa, 1.0 + fa, aa);
        vec3 col = uVeil;
        float alpha = inside * (0.28 + 0.14 * (1.0 - aa));
        // soft foam streaks riding the flow
        float sk = sin((s - flow) * 0.55 + a * 7.0) * sin((s - flow) * 0.23 - a * 3.0 + 1.7);
        float streak = smoothstep(0.55, 0.85, sk) * inside;
        alpha = max(alpha, streak * 0.5);
        // its edges: a wavy dashed foam line scrolling with the flow
        float ew = 0.94 + 0.025 * sin((s - flow) * 0.9);
        float edge = 1.0 - smoothstep(0.055, 0.055 + 1.5 * fa, abs(aa - ew));
        float dsh = fract((s - flow) / ${glslNum(LANE_VIEW.dash)});
        float ed = edge * smoothstep(0.04, 0.1, dsh) * (1.0 - smoothstep(0.66, 0.72, dsh));
        col = mix(col, uFoam, ed);
        alpha = max(alpha, ed * 0.92);
        // the arrows: bold chevrons pointing the way it flows
        float u = fract((s - flow) / ${glslNum(LANE_VIEW.chev)}) * ${glslNum(LANE_VIEW.chev)};
        float c = u - (${glslNum(LANE_VIEW.chev * 0.62)} - aa * 3.0);
        float fc = fs + 3.0 * fa;
        float chev = (1.0 - smoothstep(0.85 - fc, 0.85 + fc, abs(c))) * (1.0 - smoothstep(0.76 - fa, 0.76 + fa, aa));
        col = mix(col, uFoam, chev);
        alpha = max(alpha, chev * 0.95);
        // the lane's rounded ends fade
        alpha *= smoothstep(-3.6, 1.2, s) * (1.0 - smoothstep(len - 1.2, len + 3.6, s)) * on;
        vec4 diffuseColor = vec4(col, alpha);`,
      );
  };
  m.customProgramCacheKey = () => 'spires-lanes-v1';
  const me = new THREE.Mesh(g, m);
  me.name = 'spires-lanes';
  me.userData.keep = true;
  me.frustumCulled = false; // displaced on the GPU
  me.renderOrder = 3;
  return { mesh: me, uniforms: U, lens };
}

// ---------------------------------------------------------------------------
// Instanced floaters (vertex colours) with inverted-hull ink twins (InstancedMesh is never outlined by the outline
// pass): the gold domes and the silver fish.
// ---------------------------------------------------------------------------
// Merge [geometry, colour, skipInHull] parts into one vertex-coloured geometry; push > 0 grows every part along its
// own normals (the ink hull). `paint(i, x, y, z, nx, ny, nz) -> hex | null` may recolour a part's vertices.
function colouredParts(parts, push = 0) {
  const geos = parts.map(([g0, c, skipInHull, paint]) => {
    if (push > 0 && skipInHull) return null;
    const g = g0.index && !g0.attributes.normal ? g0.toNonIndexed() : g0.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position;
    const nr = g.attributes.normal;
    if (push > 0) {
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + nr.getX(i) * push, p.getY(i) + nr.getY(i) * push, p.getZ(i) + nr.getZ(i) * push);
    }
    ensureIndex(g);
    const col = new THREE.Color(c);
    const tmp = new THREE.Color();
    const n = g.attributes.position.count;
    const ca = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const h = paint ? paint(g.attributes.position.getX(i), g.attributes.position.getY(i), g.attributes.position.getZ(i), g.attributes.normal.getX(i), g.attributes.normal.getY(i), g.attributes.normal.getZ(i)) : null;
      (h != null ? tmp.setHex(h) : col).toArray(ca, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    return g;
  }).filter(Boolean);
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return merged;
}
function placed(g, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  const out = g.clone();
  out.applyMatrix4(new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V3(sx, sy, sz)));
  return out;
}
// A floating gold dome (model scale 1 = a 2.6 collider): its drum with dark arched windows sunk to the waterline (local
// y 0), a cornice, the onion dome with a band and the sun's glint on it, a finial.
function domeParts() {
  const parts = [];
  const sunL = new THREE.Vector3(palette.sunDir[0], palette.sunDir[1] * 0.4, palette.sunDir[2]).normalize();
  const drum = new THREE.CylinderGeometry(1.95, 2.05, 2.6, 22, 1, true);
  parts.push([placed(drum, 0, -0.6, 0), C.stoneA]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    parts.push([placed(new RoundedBoxGeometry(0.62, 1.1, 0.3, 2, 0.24), Math.sin(a) * 1.96, 0.1, Math.cos(a) * 1.96, 1, 1, 1, 0, a, 0), C.window, true]);
  }
  parts.push([placed(new THREE.TorusGeometry(2.08, 0.2, 6, 26), 0, 0.72, 0, 1, 1, 1, Math.PI / 2), C.goldDark]);
  const onion = lathe([[2.0, 0], [2.45, 0.85], [2.38, 1.75], [1.75, 2.65], [0.95, 3.35], [0.38, 3.95], [0.1, 4.35]], 26);
  const glint = (x, y, z, nx, ny, nz) => (nx * sunL.x + ny * sunL.y + nz * sunL.z > 0.82 ? C.goldLit : null);
  parts.push([placed(onion, 0, 0.8, 0), C.gold, false, glint]);
  parts.push([placed(new THREE.TorusGeometry(2.42, 0.13, 6, 28), 0, 1.75, 0, 1, 1, 1, Math.PI / 2), C.goldDark]);
  parts.push([placed(new THREE.SphereGeometry(1, 10, 8), 0, 5.25, 0, 0.3, 0.3, 0.3), C.gold, false, glint]);
  parts.push([placed(new THREE.ConeGeometry(0.1, 0.9, 6), 0, 5.9, 0), C.gold]);
  onion.dispose();
  drum.dispose();
  return parts;
}
// A silver fish (local +z forward, about 1.9 u long): a blue back, silver sides, a white belly, fins and big eyes.
function fishParts() {
  const s = new THREE.SphereGeometry(1, 12, 8);
  const s2 = new THREE.SphereGeometry(1, 8, 6);
  return [
    [placed(s, 0, 0, 0, 0.27, 0.32, 0.78), C.fishSide],
    [placed(s, 0, 0.1, -0.04, 0.2, 0.22, 0.66), C.fishBack],
    [placed(s, 0, -0.1, 0.04, 0.2, 0.18, 0.6), C.fishBelly],
    [placed(s2, 0, 0.28, -0.15, 0.04, 0.2, 0.3, -0.3), C.fishFin],
    [placed(s2, 0, 0.12, -0.92, 0.05, 0.3, 0.2, -0.65), C.fishFin],
    [placed(s2, 0, -0.12, -0.92, 0.05, 0.3, 0.2, 0.65), C.fishFin],
    [placed(s2, -0.16, 0.08, 0.45, 0.1, 0.11, 0.1), C.eyeWhite],
    [placed(s2, 0.16, 0.08, 0.45, 0.1, 0.11, 0.1), C.eyeWhite],
    [placed(s2, -0.21, 0.08, 0.49, 0.06, 0.07, 0.05), C.pupil, true],
    [placed(s2, 0.21, 0.08, 0.49, 0.06, 0.07, 0.05), C.pupil, true],
  ];
}
function buildFloaters(own, ownGeos, root) {
  const inkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(INK[0], INK[1], INK[2]), side: THREE.BackSide });
  noOutline(inkMat);
  own.push(inkMat);
  const make = (key, parts, push, n) => {
    const g = colouredParts(parts, 0);
    const hg = push > 0 ? colouredParts(parts, push) : null;
    for (const [pg] of parts) pg.dispose();
    const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(3) });
    noOutline(m);
    own.push(m);
    ownGeos.push(g);
    if (hg) ownGeos.push(hg);
    const me = new THREE.InstancedMesh(g, m, Math.max(1, n));
    const hull = hg ? new THREE.InstancedMesh(hg, inkMat, Math.max(1, n)) : null;
    me.name = `spires-${key}`;
    if (hull) hull.name = `spires-${key}-ink`;
    for (const x of [me, hull]) {
      if (!x) continue;
      x.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      x.userData.keep = true;
      x.frustumCulled = false; // they move every frame
      x.count = n;
      root.add(x);
    }
    return { mesh: me, hull };
  };
  return { make };
}

// ---------------------------------------------------------------------------
// The drowned city seen through the water round the ruins: rings of pale paving (some slabs gone) and coral beds that
// glow softly (<= PULSE_HZ.gardens[1] Hz), under a turquoise tint, riding exactly the ocean's swell. aP = (0 at the
// inner edge .. 1 at the outer, the patch's seed).
// ---------------------------------------------------------------------------
function buildDrowned(patches, timeU, ampU, motionU) {
  const pos = [];
  const aP = [];
  const index = [];
  for (const P of patches) {
    const seg = Math.max(24, Math.round(P.r1 * 3.2));
    const rings = [0, 0.15, 0.4, 0.7, 1];
    const base = pos.length / 3;
    for (const t of rings) {
      for (let k = 0; k < seg; k++) {
        const th = (k / seg) * TAU;
        const w = 1 + 0.06 * Math.sin(3 * th + P.seed * 5.1) + 0.04 * Math.sin(5 * th + P.seed * 2.3);
        const r = P.r0 + (P.r1 - P.r0) * t * w;
        pos.push(P.x + Math.cos(th) * r, 0, P.z + Math.sin(th) * r);
        aP.push(t, P.seed);
      }
    }
    for (let ri = 0; ri < rings.length - 1; ri++) {
      for (let k = 0; k < seg; k++) {
        const k1 = (k + 1) % seg;
        const a = base + ri * seg + k;
        const b = base + ri * seg + k1;
        const c = base + (ri + 1) * seg + k;
        const d = base + (ri + 1) * seg + k1;
        index.push(a, b, c, b, d, c);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aP', new THREE.Float32BufferAttribute(aP, 2));
  g.setIndex(index);
  g.computeBoundingSphere();
  const U = {
    uTime: timeU,
    uAmp: ampU,
    uMotion: motionU,
    uPaveA: { value: new THREE.Color(0xe6dcc0) },
    uPaveB: { value: new THREE.Color(0xd2c6a6) },
    uJoint: { value: new THREE.Color(0x2e8c90) },
    uWater: { value: new THREE.Color(0x58d8d0) },
    uDeep: { value: new THREE.Color(0x1d8f9c) },
    uCoral: { value: [new THREE.Color(0xff7ab4), new THREE.Color(0xffa04a), new THREE.Color(0xb27cff), new THREE.Color(0x6ff0dc)] },
  };
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, fog: true });
  m.name = 'spires-drowned';
  noOutline(m);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform float uAmp;
attribute vec2 aP;
varying vec2 vP;
varying vec2 vWxz;
${WAVE_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vP = aP;
{
  vec2 wxz = (modelMatrix * vec4(position.x, 0.0, position.z, 1.0)).xz;
  vWxz = wxz;
  float far = abs(wxz.x - cameraPosition.x) + abs(wxz.y - cameraPosition.z);
  transformed.y = waveH(wxz, uTime, uAmp) + 0.05 + far * 0.0012;
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform float uMotion;
uniform vec3 uPaveA, uPaveB, uJoint, uWater, uDeep;
uniform vec3 uCoral[4];
varying vec2 vP;
varying vec2 vWxz;
${NOISE_GLSL}`)
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float sd = vP.y;
        float ca = cos(sd * 3.1), sa = sin(sd * 3.1);
        vec2 q = mat2(ca, -sa, sa, ca) * vWxz / 2.3;
        vec2 cell = floor(q);
        vec2 f = fract(q);
        float ed = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
        float fw = max(fwidth(q.x) + fwidth(q.y), 1e-4);
        float joint = 1.0 - smoothstep(0.05, 0.05 + fw, ed);
        float h = mHash(cell + sd * 17.0);
        vec3 col = mix(uPaveA, uPaveB, step(0.5, h));
        // (sand drifts over the paving in places)
        float drift = smoothstep(0.42, 0.62, mNoise(vWxz * 0.21 + sd * 7.0));
        col = mix(col, uJoint, joint * 0.7 * (1.0 - drift));
        col = mix(col, uDeep, step(0.84, h) * 0.6 * (1.0 - drift));
        // coral beds on the paving, breathing softly
        vec2 bp = vWxz * 0.42 + sd * 13.0;
        float n = mNoise(bp) * 0.7 + mNoise(bp * 2.3) * 0.3;
        float nfw = max(fwidth(n), 1e-4);
        float bed = smoothstep(0.6 - nfw, 0.6 + nfw, n);
        float ch = mHash(floor(bp * 0.5) + 3.0);
        vec3 cc = ch < 0.25 ? uCoral[0] : (ch < 0.5 ? uCoral[1] : (ch < 0.75 ? uCoral[2] : uCoral[3]));
        float hz = ${glslNum(PULSE_HZ.gardens[0])} + ${glslNum(PULSE_HZ.gardens[1] - PULSE_HZ.gardens[0])} * fract(ch * 5.3);
        float pulse = 0.5 + 0.5 * sin(${glslNum(TAU)} * hz * uTime + ch * 40.0);
        col = mix(col, cc * mix(1.0, 0.86 + 0.24 * pulse, uMotion), bed);
        // seen through the turquoise water
        col = mix(col, uWater, 0.38);
        float t = vP.x;
        float alpha = smoothstep(0.0, 0.16, t) * (1.0 - smoothstep(0.5, 1.0, t)) * mix(0.55, 0.35, drift);
        vec4 diffuseColor = vec4(col, alpha);`,
      );
  };
  m.customProgramCacheKey = () => 'spires-drowned-v1';
  const me = new THREE.Mesh(g, m);
  me.name = 'spires-drowned';
  me.userData.keep = true;
  me.frustumCulled = false; // displaced on the GPU
  me.renderOrder = 2;
  return me;
}

// ---------------------------------------------------------------------------
// Kelp: one mesh of double-sided wavy ribbons that sway in the vertex shader (no ink line: a crossed pair of ribbons
// each), hanging from the arches, the crown and the balconies, or standing up out of the water round the ruins.
// aSw = (freedom 0..1: 0 where it hangs from or stands in, 1 at its free end; phase).
// ---------------------------------------------------------------------------
function buildKelp(hang, stand, rng, timeU, motionU) {
  const pos = [];
  const col = [];
  const sw = [];
  const index = [];
  const cA = new THREE.Color(C.kelp);
  const cB = new THREE.Color(C.kelp2);
  const ribbon = (x, y, z, len, w0, w1, up, c0, c1, ph, ang) => {
    const N = 7;
    for (const turn of [0, Math.PI / 2]) {
      const ux = Math.cos(ang + turn);
      const uz = Math.sin(ang + turn);
      const b = pos.length / 3;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        // a kelp blade: widest a little past the middle, wavy along its length
        const w = (w0 + (w1 - w0) * t) * (0.55 + 0.9 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.08))) / 2;
        const yy = up ? y + len * t : y - len * t;
        const zig = 0.1 * Math.sin(t * 11 + ph) * len * 0.35;
        const cx = x + zig * ux;
        const cz = z + zig * uz;
        const c = c0.clone().lerp(c1, t);
        for (const sgn of [-1, 1]) {
          pos.push(cx + ux * w * sgn, yy, cz + uz * w * sgn);
          col.push(c.r, c.g, c.b);
          sw.push(t, ph);
        }
      }
      for (let i = 0; i < N; i++) {
        const a = b + i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  };
  for (const k of hang) ribbon(k.x, k.y, k.z, k.len, k.w, 0.06, false, cA, rng() < 0.5 ? cB : cA, rng() * TAU, rng() * TAU);
  for (const k of stand) ribbon(k.x, -0.4, k.z, k.len + 0.4, 0.34, 0.1, true, cA, cB, rng() * TAU, rng() * TAU);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSw', new THREE.Float32BufferAttribute(sw, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(3), side: THREE.DoubleSide });
  m.name = 'spires-kelp';
  noOutline(m);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU;
    sh.uniforms.uMotion = motionU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uMotion;\nattribute vec2 aSw;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float f = aSw.x * aSw.x * uMotion;
  transformed.x += f * 0.24 * sin(uTime * ${glslNum(TAU * SWAY_HZ[0])} + aSw.y);
  transformed.z += f * 0.18 * cos(uTime * ${glslNum(TAU * SWAY_HZ[1])} + aSw.y * 1.3);
}`);
  };
  m.customProgramCacheKey = () => 'spires-kelp-v1';
  const me = new THREE.Mesh(g, m);
  me.name = 'spires-kelp';
  me.userData.keep = true;
  me.frustumCulled = false; // swayed on the GPU
  return me;
}

// ---------------------------------------------------------------------------
// The rig: the gulls wheeling share one vertex-coloured mesh whose pieces are moved on the CPU (a few thousand
// vertices): 2 draw calls with its ink line.
// ---------------------------------------------------------------------------
function buildRig(pieces, material, name) {
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
    vertices: nv,
    // Place piece i with the matrix m4 (THREE.Matrix4).
    set(i, m4) {
      const [first, count] = ranges[i];
      m4.toArray(e);
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
// A gull in two pieces: the body (local +z forward), then both wings (flapped by scaling).
function gullPieces() {
  const body = new THREE.Group();
  const w = toon(C.gull);
  mesh(body, sphere(10, 7), w, 0, 0, 0).scale.set(0.24, 0.24, 0.62);
  mesh(body, sphere(10, 7), w, 0, 0.12, 0.5).scale.setScalar(0.19);
  mesh(body, cone(0.06, 0.28, 6), toon(C.beak), 0, 0.1, 0.78).rotation.x = Math.PI / 2;
  mesh(body, sphere(8, 5), w, 0, 0, -0.62).scale.set(0.16, 0.06, 0.24);
  const wings = new THREE.Group();
  for (const s of [-1, 1]) {
    const wg = mesh(wings, sphere(10, 6), toon(C.gullWing), s * 0.7, 0.04, 0.02);
    wg.scale.set(0.72, 0.05, 0.26);
    wg.rotation.z = s * -0.12;
    const tip = mesh(wings, sphere(8, 5), toon(C.gullTip), s * 1.32, 0.0, -0.04);
    tip.scale.set(0.2, 0.04, 0.16);
  }
  return [body, wings];
}

// ---------------------------------------------------------------------------
// Gameplay data
// ---------------------------------------------------------------------------
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const L2 = dx * dx + dz * dz;
  const k = L2 > 1e-9 ? clamp01(((px - ax) * dx + (pz - az) * dz) / L2) : 0;
  return Math.hypot(px - (ax + dx * k), pz - (az + dz * k));
}
// The shortest distance from (x, z) to an open polyline.
function laneDist(pts, x, z) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) best = Math.min(best, segDist(x, z, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z));
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
const inRing = (x, z, k = 1.1) => ((x - RING.x) / RING.rx) ** 2 + ((z - RING.z) / RING.rz) ** 2 < k;
function openWater(start, colliders, lanes, { dMin, dMax, rim, colPad, lanePad, ring }) {
  const cand = [];
  for (let x = -WORLD_R; x <= WORLD_R; x += 3) {
    for (let z = -WORLD_R; z <= WORLD_R; z += 3) {
      if (Math.hypot(x, z) > WORLD_R - rim) continue;
      const ds = Math.hypot(x - start.x, z - start.z);
      if (ds < dMin || ds > dMax) continue;
      if (colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + colPad)) continue;
      if (lanes.some((L) => laneDist(L.points, x, z) < L.width / 2 + lanePad)) continue;
      if (ring && inRing(x, z)) continue;
      cand.push({ x, z });
    }
  }
  return cand;
}
function computeSpawns(start, colliders, lanes) {
  const cand = openWater(start, colliders, lanes, { dMin: 58, dMax: 110, rim: 16, colPad: 12, lanePad: 8, ring: true });
  const ahead = { x: start.x + Math.sin(start.h) * 72, z: start.z + Math.cos(start.h) * 72 };
  return spreadOrder(cand, ahead, 12);
}
function computeCrates(start, colliders, lanes) {
  const cand = openWater(start, colliders, lanes, { dMin: 30, dMax: 100, rim: 20, colPad: 8, lanePad: 3, ring: false });
  // the first crate a little ahead and to the side of the start
  const first = { x: start.x + Math.sin(start.h + 0.6) * 42, z: start.z + Math.cos(start.h + 0.6) * 42 };
  return spreadOrder(cand, first, 8);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
export function build(scene, ctx = {}) {
  checkWaves();
  const c0 = ctx && typeof ctx === 'object' ? ctx : {};
  // prefers-reduced-motion: ctx.reducedMotion (a boolean, or a function read every frame), else the media query
  const reduced = () => {
    if (typeof c0.reducedMotion === 'function') {
      try {
        return !!c0.reducedMotion();
      } catch {
        return false;
      }
    }
    if (typeof c0.reducedMotion === 'boolean') return c0.reducedMotion;
    try {
      return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    } catch {
      return false;
    }
  };
  const rand = mulberry32(20261105); // fixed: the level always looks the same (ctx.rng is never drawn)
  const noise = makeNoise(41);
  GEO = new Map();
  glowCache.clear();
  stoneCache.clear();
  const root = new THREE.Group();
  root.name = 'env:spires';
  scene.add(root);
  const props = new THREE.Group(); // every stone and plain prop: baked at the end
  const banks = new THREE.Group(); // the sand banks (own shader): merged into one mesh
  root.add(props, banks);
  const own = [];
  const ownGeos = [];
  const timeU = { value: 0 };
  const ampU = { value: palette.waveAmp };
  const motionU = { value: reduced() ? 0 : 1 };
  const stoneMat = makeStoneMaterial();
  const sandMat = makeSandMaterial();
  const coralMat = makeCoralGlowMaterial(timeU, motionU);
  own.push(stoneMat, sandMat, coralMat);
  const colliders = [];
  const addCol = (x, z, r, h) => colliders.push({ x: r2(x), z: r2(z), r: r2(r), h: r2(h) });
  const T = { root: props, rand, kelpHang: [], kelpStand: [] };

  // ----- the sand banks under the bigger ruins -----
  const bankList = [
    { lumps: [[TEMPLE.x, TEMPLE.z, TEMPLE.r]], hillH: 0.2 },
    { lumps: [[PALACE.x, PALACE.z, PALACE.r], [PALACE.side.x, PALACE.side.z, PALACE.side.r]] },
    { lumps: [[THEATRE.x, THEATRE.z, THEATRE.r]], hillH: 0.2 },
    { lumps: COLONNADE.lumps.map((l) => l.slice()) },
  ];
  for (const isl of bankList) {
    const sample = bankSampler(isl, noise);
    mesh(banks, buildBankGeometry(isl, sample, noise), sandMat);
  }

  // ----- King Coral -----
  kingCoral(T);
  addCol(KING.x, KING.z, KING.r, KING.h);

  // ----- the arches -----
  archway(T, GATE, false);
  for (const f of archFeet(GATE)) addCol(f.x, f.z, GATE.footR, GATE.h);
  archway(T, CORAL_ARCH, true);
  for (const f of archFeet(CORAL_ARCH)) addCol(f.x, f.z, CORAL_ARCH.footR, CORAL_ARCH.h);

  // ----- the spires -----
  for (const S of SPIRES) {
    spireTower(T, S);
    addCol(S.x, S.z, S.r, S.h);
  }

  // ----- the temple, the palace, the theatre, the colonnade, the hand -----
  temple(T);
  addCol(TEMPLE.x, TEMPLE.z, TEMPLE.r, TEMPLE.h);
  palace(T);
  addCol(PALACE.x, PALACE.z, PALACE.r, PALACE.h);
  addCol(PALACE.side.x, PALACE.side.z, PALACE.side.r, PALACE.side.h);
  theatre(T);
  addCol(THEATRE.x, THEATRE.z, THEATRE.r, THEATRE.h);
  colonnade(T);
  for (const [x, z, r] of COLONNADE.lumps) addCol(x, z, r, COLONNADE.h);
  kingsHand(T);
  addCol(HAND.x, HAND.z, HAND.r, HAND.h);

  // ----- lone broken columns -----
  for (const [x, z, r, h] of STUMPS) {
    column(T, props, x, z, { r: r * 0.5, h, y0: -1.2, broken: 1.1 });
    garden(T, x, z, r - 0.5, r + 0.4, 5);
    for (let i = 0; i < 3; i++) {
      const a = rand() * TAU;
      T.kelpStand.push({ x: x + Math.cos(a) * (r + 0.4), z: z + Math.sin(a) * (r + 0.4), len: 1.2 + rand() * 1.4 });
    }
    addCol(x, z, r, h);
  }

  // ----- the far city on the horizon -----
  skyline(T);

  // ----- the floating domes' colliders (the domes themselves are instanced, below) -----
  for (const [x, z, r] of DOMES) addCol(x, z, r, 6);

  // ----- bake: the stone and the props into vertex colours, the sand banks merged -----
  const lineMat = vcMaterial(true);
  const flatMat = vcMaterial(false);
  own.push(lineMat, flatMat);
  bakeVC(props, { stone: stoneMat, line: lineMat, flat: flatMat, glow: coralMat }, 'spires');
  {
    const list = banks.children.map((m) => m.geometry);
    banks.clear();
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    merged.computeBoundingSphere();
    const bm = new THREE.Mesh(merged, sandMat);
    bm.name = 'spires-sand';
    banks.add(bm);
  }
  for (const grp of [props, banks]) {
    grp.traverse((o) => {
      o.updateMatrix();
      o.matrixAutoUpdate = false;
      if (o.isMesh) ownGeos.push(o.geometry);
    });
  }
  for (const g of GEO.values()) g.dispose();
  GEO = null;
  for (const m of glowCache.values()) m.dispose();
  glowCache.clear();
  for (const m of stoneCache.values()) m.dispose();
  stoneCache.clear();

  // ----- the drowned streets and gardens seen through the water -----
  const patches = [
    { x: KING.x, z: KING.z, r0: KING.r + 1.2, r1: KING.r + 9, seed: 0.13 },
    { x: TEMPLE.x, z: TEMPLE.z, r0: TEMPLE.r + 1.0, r1: TEMPLE.r + 7, seed: 0.41 },
    { x: PALACE.x, z: PALACE.z, r0: PALACE.r + 1.0, r1: PALACE.r + 7, seed: 0.67 },
    { x: THEATRE.x, z: THEATRE.z, r0: THEATRE.r + 1.0, r1: THEATRE.r + 6.5, seed: 0.29 },
    { x: COLONNADE.lumps[0][0], z: COLONNADE.lumps[0][1], r0: COLONNADE.lumps[0][2] + 1.0, r1: COLONNADE.lumps[0][2] + 6.5, seed: 0.83 },
    { x: HAND.x, z: HAND.z, r0: HAND.r + 1.0, r1: HAND.r + 6, seed: 0.55 },
  ];
  const drowned = buildDrowned(patches, timeU, ampU, motionU);
  root.add(drowned);
  own.push(drowned.material);
  ownGeos.push(drowned.geometry);

  // ----- the kelp (one swaying mesh) -----
  const kelp = buildKelp(T.kelpHang, T.kelpStand, mulberry32(0x6e1b), timeU, motionU);
  root.add(kelp);
  own.push(kelp.material);
  ownGeos.push(kelp.geometry);

  // ----- the coral currents -----
  const currents = LANES.map((L) => ({ id: L.id, points: L.points.map((p) => ({ x: p.x, z: p.z })), width: L.width }));
  const lanesView = buildLanes(currents, timeU, ampU);
  root.add(lanesView.mesh);
  own.push(lanesView.mesh.material);
  ownGeos.push(lanesView.mesh.geometry);
  const lanePaths = currents.map((L) => pathOf(L.points));

  // ----- the floating domes and the fish (instanced, with ink twins) -----
  GEO = new Map(); // (the floaters' and the rig's source parts; disposed once all are built)
  const fl = buildFloaters(own, ownGeos, root);
  const fr = mulberry32(0xf15b);
  const domes = DOMES.map(([x, z, r]) => ({ x, z, s: r / 2.6, ph: fr() * TAU, sink: 0.05 + fr() * 0.2 }));
  const domeK = fl.make('domes', domeParts(), 0.05, domes.length);
  const fish = [];
  currents.forEach((L, li) => {
    for (let j = 0; j < LANE_VIEW.fish; j++) {
      fish.push({
        lane: li,
        off: (j + fr() * 0.6) / LANE_VIEW.fish,
        lat: (fr() - 0.5) * 0.9 * (L.width / 2),
        every: LANE_VIEW.every[0] + fr() * (LANE_VIEW.every[1] - LANE_VIEW.every[0]),
        leap: LANE_VIEW.leap[0] + fr() * (LANE_VIEW.leap[1] - LANE_VIEW.leap[0]),
        height: LANE_VIEW.height[0] + fr() * (LANE_VIEW.height[1] - LANE_VIEW.height[0]),
        ph: fr() * 10,
        s: 0.85 + fr() * 0.3,
      });
    }
  });
  const fishK = fl.make('fish', fishParts(), 0.035, fish.length);

  // ----- the gulls: one rig -----
  const rigPieces = [];
  const birds = [];
  for (const b of GULLS) {
    birds.push({ ...b, first: rigPieces.length, ph: fr() * TAU });
    rigPieces.push(...gullPieces());
  }
  const rigMat = vcMaterial(true, THREE.DoubleSide);
  own.push(rigMat);
  const rig = buildRig(rigPieces, rigMat, 'spires-gulls');
  root.add(rig.mesh);
  for (const g of GEO.values()) g.dispose();
  GEO = null;

  // ----- gameplay data -----
  const playerStart = { ...START };
  const reefs = [];
  const enemySpawns = computeSpawns(playerStart, colliders, currents);
  const crateSpots = computeCrates(playerStart, colliders, currents);

  const stats = {
    lanes: currents.length,
    laneLength: lanePaths.map((P) => Math.round(P.len)),
    fish: fish.length,
    fishShown: 0,
    domes: domes.length,
    kelp: T.kelpHang.length + T.kelpStand.length,
    // the fastest periodic change of any glow, sway or bob (the coral's glow, the gardens', the kelp)
    maxPulseHz: Math.max(PULSE_HZ.coral[1], PULSE_HZ.gardens[1], ...SWAY_HZ),
    coralPulseHz: PULSE_HZ.coral.slice(),
    flashes: 0, // this sea never flashes (SPEC3 §15)
    lanesOn: [1, 1, 1],
    flow: [0, 0, 0],
    source: 'none', // where the lanes' scroll comes from: 'hazards' (mechanics4's snapshot) or 'own' (none running)
    reduced: false, // reduced motion: the arrows hold still, no fish leap
    rigVertices: rig.vertices,
  };

  const m4 = new THREE.Matrix4();
  const mA = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3(1, 1, 1);
  const at = {};
  const flows = [0, 0, 0];
  const ons = [1, 1, 1];
  let disposed = false;
  let now = 0;
  let lastSim = null;
  let ownFlow = 0;
  function bob(x, z, t, amp, lift) {
    const y = waveHeight(x, z, t, amp) + lift;
    const sx = (waveHeight(x + 0.8, z, t, amp) - waveHeight(x - 0.8, z, t, amp)) / 1.6;
    const sz = (waveHeight(x, z + 0.8, t, amp) - waveHeight(x, z - 0.8, t, amp)) / 1.6;
    return [y, sx, sz];
  }
  // The lanes' scroll and show from the snapshot (hazards.currents, by id = index + 1); without one, the env's own.
  function readLanes(hz, sim, step) {
    const list = hz && typeof hz === 'object' ? hz.currents : undefined;
    if (Array.isArray(list)) {
      stats.source = 'hazards';
      for (let i = 0; i < flows.length; i++) {
        let v = null;
        for (const L of list) {
          if (L && typeof L === 'object' && Number(L.id) === i + 1) {
            v = L;
            break;
          }
        }
        const want = v ? 1 : 0;
        if (v && finite(v.flow)) flows[i] = v.flow;
        ons[i] += (want - ons[i]) * Math.min(1, step / LANE_VIEW.fade);
        if (step <= 0) ons[i] = want;
      }
    } else {
      // no rules running (Stage 1's preview, a harness): the lanes show and scroll at CURRENT's 3 u/s of sim time
      stats.source = 'own';
      if (finite(sim)) {
        if (lastSim !== null && sim >= lastSim && sim - lastSim < 1) ownFlow += (sim - lastSim) * 3;
        lastSim = sim;
      } else {
        ownFlow += step * 3;
      }
      for (let i = 0; i < flows.length; i++) {
        flows[i] = ownFlow;
        ons[i] += (1 - ons[i]) * Math.min(1, step / LANE_VIEW.fade);
        if (step <= 0) ons[i] = 1;
      }
    }
  }
  function update(t, dt, fctx) {
    if (disposed) return;
    const step = finite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
    now = finite(t) ? t : now + step;
    const calm = reduced();
    timeU.value = now;
    motionU.value = calm ? 0 : 1;
    const amp = palette.waveAmp;
    const fc = fctx && typeof fctx === 'object' ? fctx : null;
    readLanes(fc ? fc.hazards : null, fc ? fc.simTime : undefined, step);
    // the arrows hold still under reduced motion (the chevrons still point the way)
    const U = lanesView.uniforms;
    if (!calm) U.uFlow.value.set(flows[0], flows[1], flows[2]);
    U.uOn.value.set(ons[0], ons[1], ons[2]);
    stats.reduced = calm;
    stats.lanesOn = ons.map((v) => Math.round(v * 100) / 100);
    stats.flow = flows.map((v) => Math.round(v * 10) / 10);
    // the gold domes bob like buoys
    domes.forEach((d, i) => {
      const [y, sx, sz] = bob(d.x, d.z, now, amp, -d.sink);
      const sway = calm ? 0 : 0.04;
      e.set(-sz * 0.55 + sway * Math.sin(now * 0.55 + d.ph), d.ph, sx * 0.55 + sway * Math.cos(now * 0.43 + d.ph), 'XZY');
      q.setFromEuler(e);
      m4.compose(p.set(d.x, y * 0.85, d.z), q, sc.setScalar(d.s));
      domeK.mesh.setMatrixAt(i, m4);
      domeK.hull.setMatrixAt(i, m4);
    });
    domeK.mesh.instanceMatrix.needsUpdate = true;
    domeK.hull.instanceMatrix.needsUpdate = true;
    // the silver fish leap along the lanes with the flow (none under reduced motion)
    let shown = 0;
    fish.forEach((f, i) => {
      const P = lanePaths[f.lane];
      const on = ons[f.lane];
      const cyc = (((now + f.ph) % f.every) + f.every) % f.every;
      if (calm || on < 0.5 || cyc > f.leap || P.len < 20) {
        m4.makeScale(0, 0, 0);
      } else {
        const u = cyc / f.leap;
        const use = P.len - 12;
        const s0 = (((f.off * use + flows[f.lane]) % use) + use) % use;
        const s = 6 + s0 + LANE_VIEW.extra * cyc;
        pathAt(P, s, at);
        const x = at.x + at.dz * f.lat;
        const z = at.z - at.dx * f.lat;
        const y = waveHeight(x, z, now, amp) + f.height * 4 * u * (1 - u) - 0.3;
        const pitch = Math.atan2(f.height * 4 * (1 - 2 * u), (3 + LANE_VIEW.extra) * f.leap);
        e.set(-pitch, Math.atan2(at.dx, at.dz), 0.15 * Math.sin(u * 6.3), 'YXZ');
        q.setFromEuler(e);
        m4.compose(p.set(x, y, z), q, sc.setScalar(f.s));
        shown++;
      }
      fishK.mesh.setMatrixAt(i, m4);
      fishK.hull.setMatrixAt(i, m4);
    });
    fishK.mesh.instanceMatrix.needsUpdate = true;
    fishK.hull.instanceMatrix.needsUpdate = true;
    stats.fishShown = shown;
    // gulls: wheeling, a few beats then a long glide
    for (const b of birds) {
      const a = b.ph + now * b.w;
      const x = b.c[0] + Math.cos(a) * b.r;
      const z = b.c[1] + Math.sin(a) * b.r;
      const dir = Math.sign(b.w);
      p.set(x, b.y + Math.sin(now * 0.5 + b.ph) * 1.0, z);
      e.set(0, Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir), 0.28 * dir, 'YXZ');
      q.setFromEuler(e);
      m4.compose(p, q, sc.setScalar(1.5));
      rig.set(b.first, m4);
      const glide = 0.5 + 0.5 * Math.sin(now * 0.6 + b.ph);
      const flap = calm ? 1 : glide > 0.5 ? 0.35 + 1.1 * Math.abs(Math.sin(now * 4.2 + b.ph)) : 0.7;
      mA.makeScale(1, flap, 1);
      rig.set(b.first + 1, mA.premultiply(m4));
    }
    rig.commit();
  }
  // the first frame's poses (a level's first render may come before its first update)
  update(0, 0, null);

  // The hazard meshes main warm-draws behind the fly-in (each has at least one instance).
  function warmables() {
    return [lanesView.mesh, fishK.mesh, fishK.hull];
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(root);
    for (const k of [domeK, fishK]) {
      k.mesh.dispose();
      if (k.hull) k.hull.dispose();
    }
    for (const g of ownGeos) g.dispose();
    rig.dispose();
    for (const m of own) m.dispose();
  }

  return {
    worldRadius: WORLD_R,
    colliders,
    playerStart,
    enemySpawns,
    reefs,
    crateSpots,
    currents,
    warmables,
    stats,
    update,
    dispose,
    group: root,
  };
}

// Layout numbers for tests (read-only).
export const LAYOUT = Object.freeze({
  startClear: START_CLEAR,
  laneClear: LANE.clear,
  laneWidth: LANE.width,
  ring: Object.freeze({ ...RING }),
  king: Object.freeze({ ...KING }),
  gate: Object.freeze({ x: GATE.x, z: GATE.z, ry: GATE.ry, half: GATE.half, footR: GATE.footR, clear: r2(GATE.spring + GATE.half - GATE.pier / 2) }),
  coralArch: Object.freeze({ x: CORAL_ARCH.x, z: CORAL_ARCH.z, ry: CORAL_ARCH.ry, half: CORAL_ARCH.half, footR: CORAL_ARCH.footR, clear: r2(CORAL_ARCH.spring + CORAL_ARCH.half - CORAL_ARCH.pier / 2) }),
  pulseHz: Object.freeze({ max: PULSE_HZ.max, coralMax: PULSE_HZ.coralMax, coral: PULSE_HZ.coral.slice(), gardens: PULSE_HZ.gardens.slice() }),
  laneView: Object.freeze({ ...LANE_VIEW }),
});
