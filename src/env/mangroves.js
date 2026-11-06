import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, setOutline, noOutline, gradientMap, ensureIndex, INK } from '../style.js';
import { waveHeight } from '../scenery.js';

// Level 10, "Misty Mangroves" (SPEC4 §2.3): a green-gold dusk in a mangrove maze.
//
// Map (north = -z, east = +x; the arena is the disc of radius WORLD_R round 0,0):
// - you start mid-channel in the south (START), facing north up the main channel. 70 u ahead (the fly-in's first
//   framing) stands the Banyan Arch: one giant mangrove whose two root-feet stand either side of the channel and whose
//   braided trunks meet in a bough 17+ u over the water (you sail under it), a crown of leaves on top, curtains of
//   aerial roots and hanging moss at its feet and a row of paper lanterns along its underside. Two islets close the
//   gate to either side; open water runs round both ends.
// - north of the arch: the lagoon, open water with a mud flat in the middle where herons stand
// - north-west: the monkey temple ruin (where the jollyboats live): a stepped stone pyramid gone green with moss and
//   strangler roots, a carved monkey face on its shrine, broken columns, a stone dock with three tubby jollyboats,
//   coconut piles and banana bunches, monkeys sitting about, two braziers
// - east: the stilt village round a little island: thatched huts on stilts with glowing windows, plank walks, paper
//   lanterns on strings between the roofs, canoes tied up
// - everywhere: mangrove islets on arching prop roots (a low mud bank under a dense crown, the roots arching out into
//   the water with a dark wet tide mark), hanging moss, mangrove knees, lily pads with pink lotus and frogs that croak
//   (their throats puff), reeds round the mud flats, egrets wheeling, fireflies (one InstancedMesh of FIREFLY.n,
//   noOutline, each glowing at 0.3-0.8 Hz) and a wall of mangrove forest round the rim (outside the arena), open to
//   the low sun in the south-west
//
// Gameplay data (fixed: the layout never depends on ctx.rng; checked by the harness and the smoke layout rules):
// - colliders: every islet lump (r = its root ring), the arch's two feet (h 26: the bough is not a collider), the
//   temple island, the stilt village (huts, walks and the water they close in: one circle), and the rim forest just
//   outside the arena (it gives the rim its surf)
// - reefs: 5 mud flats { x, z, r } (deep hulls ×0.45, today's REEF_SLOW)
// - fogLoops: 3 closed polylines { points: [{ x, z }], closed: true } (72 points each), the loops mechanics4.js's FOG
//   banks ride: one round the lagoon, one round the west islet, one round the east islet. Every point of every loop
//   (and every segment between) stays clear of every collider by FOG_CLEAR (the bank's half-length 15 + 4), at least
//   START_CLEAR + 10 from the player's start and inside worldRadius - 20.
// - enemySpawns: open water 58-92 from the start, clear of colliders by r + 12, of the mud flats by r + 8 and of the
//   fog loops by 12, inside worldRadius - 16, ordered so that any prefix is well spread (the first ahead of the start)
// - crateSpots: open water 30-100 from the start, clear of colliders by r + 8, of mud flats by r + 3, inside
//   worldRadius - 20, spread the same way
//
// Hazards: update(t, dt, { simTime, camera, hazards, focus? }) draws the fog banks of hazards.fog (mechanics4.js
// visuals()): [{ id, x, z, h, len, wid }] (h the long axis), at most FOG_VIEW.slots at once, a stable `id` keeping each
// bank on its own slot (without one, the nearest slot within 12 u). A bank is FOG_VIEW.puffs cel-shaded white puffs
// (one InstancedMesh for every bank: <= 150 puffs, noOutline) over a low disc of mist on the water (one InstancedMesh):
// 2 draw calls in all. A bank fades in over FOG_VIEW.fade s when it appears and out when it leaves the snapshot. The
// puffs never hide your own ship: they fade within FOG_VIEW.clear u of the camera's target (`focus` { x, z } when
// main passes it, else the point the camera looks at, 1.5 u above the water), along the line from the camera to it,
// and right in front of the camera. Reduced motion: the puffs don't swirl or breathe. No hazards (or a paused game,
// which skips update) draws no fog.
//
// warmables() -> the hidden hazard meshes (the fog's puffs and discs), each with at least one instance, for main's
// warmDraw (SPEC4 §11.2, §14).
//
// Draw calls (both outline passes): the static scene is baked into a handful of meshes (the mud terrain and the
// wood, painted per pixel by their own shaders; one vertex-coloured mesh for every plain prop, one for the few without
// an ink line, one unlit one for what glows: lanterns, windows, braziers), the floating lily pads, lotus and frogs are
// one InstancedMesh each with an inverted-hull ink twin, the frogs' throats one more, the egrets and the moored boats
// share one mesh moved on the CPU, the hanging moss and reeds are one swaying mesh, the shallows, the fireflies and
// the lanterns' halos one mesh each: the env alone is about 22 calls, +2 while fog banks show.
//
// Photosensitivity (SPEC3 §15, SPEC4 §0.1): nothing here flashes. Every glow that pulses (fireflies 0.3-0.8 Hz, the
// lanterns' halos <= 0.45 Hz) pulses at PULSE_HZ_MAX (1 Hz) or slower; the moss sways at 0.3 Hz, the frogs croak at
// <= 0.6 Hz. Reduced motion (ctx.reducedMotion: a boolean or a function, else the media query): fireflies hold a
// steady glow where they are, the halos don't pulse, the moss and reeds hang still, the frogs don't croak, the fog
// doesn't swirl.
//
// build(scene, { rng, reducedMotion? }) -> { worldRadius, colliders, playerStart, enemySpawns, reefs, crateSpots,
//   fogLoops, warmables() -> [Object3D], stats (read-only numbers for tests), update(t, dt, { simTime, camera,
//   hazards, focus? }), dispose(), group }

export const meta = {
  name: 'Misty Mangroves',
  subtitle: 'A green-gold dusk in a mangrove maze. Fog banks drift through the channels.',
};

export const palette = {
  skyTop: 0x2f4f6f,
  skyHorizon: 0xf2c66b,
  sunColor: 0xffd89a,
  sunDir: [-0.5, 0.3, 0.6],
  sunIntensity: 2.0,
  hemiSky: 0xd8e8b8,
  hemiGround: 0x3a4a2a,
  hemiIntensity: 1.25,
  fogColor: 0xc8d8a8,
  fogNear: 90,
  fogFar: 320,
  waterDeep: 0x1f5a4a,
  waterShallow: 0x5fb08a,
  waterFoam: 0xf4ffe0,
  waveAmp: 0.4,
  cloudColor: 0xffe8c0,
  cloudShade: 0x8a7a6a,
  cloudCount: 10,
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
const WORLD_R = 145;
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const PULSE_HZ_MAX = 1; // SPEC3 §15: every glow pulses at 1 Hz or slower
const FOG_CLEAR = 19; // SPEC4 §2.3: a fog loop keeps clear of colliders by the bank's half-length (15) + 4
const START_CLEAR = 20; // SPEC4 §2.3: no fog loop within 20 u of the player's start
// mid-channel in the south, looking north up the main channel at the Banyan Arch
const START = { x: 4, z: 86, h: Math.PI };
// The Banyan Arch: its feet stand at x ± half (radius footR, the colliders), the bough runs from footTop over the
// channel to apex (its centreline); bough = the bough's radius at the apex. The clear water between the feet is
// 2 × (half − footR) = 20.4 u and the bough's underside is 16.5+ u over all of it.
const ARCH = { x: 2, z: 14, half: 17, footR: 6.8, footTop: 12.5, apex: 23.5, bough: 1.9 };
// The sun's side (palette.sunDir on the water plane), for the sunlit tops of the crowns.
const SUN_XZ = (() => {
  const l = Math.hypot(palette.sunDir[0], palette.sunDir[2]);
  return [palette.sunDir[0] / l, palette.sunDir[2] / l];
})();
// Mangrove islets: lumps [x, z, r] (r = the root ring = the collider; the mud bank lies INSET inside it).
// trees: how many (else from the area); s: tree size.
const INSET = 2.0;
const ISLETS = [
  // the start channel, west bank and east bank
  { id: 'sw1', lumps: [[-27, 70, 8], [-33, 82, 6.5]] },
  { id: 'sw2', lumps: [[-37, 95, 7.5], [-28, 106, 6]] },
  { id: 'sw3', lumps: [[-64, 84, 8]] },
  { id: 'se1', lumps: [[36, 74, 8], [42, 86, 6.5]] },
  { id: 'se2', lumps: [[40, 100, 7], [46, 110, 6]] },
  { id: 'se3', lumps: [[66, 92, 8]] },
  { id: 'se4', lumps: [[68, 60, 7]] },
  { id: 'se5', lumps: [[96, 64, 7.5]] },
  // the gate either side of the arch's feet
  { id: 'gw', lumps: [[-30, 18, 8]] },
  { id: 'ge', lumps: [[34, 18, 8]] },
  // the islets the west and east fog banks circle
  { id: 'wh', lumps: [[-90, 24, 8]], s: 1.15, trees: 6 },
  { id: 'eh', lumps: [[72, -62, 7]], s: 1.1, trees: 5 },
  // north of the lagoon
  { id: 'n1', lumps: [[-26, -98, 8], [-38, -104, 6]] },
  { id: 'n2', lumps: [[2, -112, 7.5]] },
  { id: 'n3', lumps: [[28, -102, 7], [38, -110, 6]] },
  { id: 'n4', lumps: [[-58, -116, 6.5]] },
  // the west and the east
  { id: 'wn', lumps: [[-122, -26, 7]] },
  { id: 'ws', lumps: [[-100, 92, 7.5]] },
  { id: 'cw', lumps: [[-68, -40, 5.5]] },
  { id: 'en', lumps: [[122, -6, 7]] },
  { id: 'ce', lumps: [[66, 6, 7]] },
  { id: 'ss', lumps: [[-78, 112, 6]] },
  { id: 'sse', lumps: [[100, 100, 7]] },
  { id: 'nne', lumps: [[64, -122, 6]] },
];
// The monkey temple's island (north-west); the temple faces the lagoon.
const TEMPLE = { x: -84, z: -76, lumps: [[-84, -76, 15], [-99, -74, 9]] };
// The stilt village (east): the little island at its heart, the huts on stilts round its west side (bearings from
// +x toward +z, degrees), the ring they stand on, and the one collider circle over all of it.
const VILLAGE = { x: 104, z: 8, isle: 7.5, ring: 15, huts: [128, 162, 196, 230, 262], R: 19.5 };
// Mud flats (env.reefs): shallows that slow deep hulls; herons: how many stand on it.
const FLATS = [
  { x: -18, z: 46, r: 7, herons: 1 },
  { x: 60, z: 30, r: 7.5, herons: 0 },
  { x: -48, z: 50, r: 6.5, herons: 0 },
  { x: -4, z: -44, r: 7, herons: 2 },
  { x: 12, z: -86, r: 6, herons: 1 },
];
// The fog banks' loops: wobbly rings (centre, half-axes, rotation, wobble), sampled to `n` points.
const FOG_RINGS = [
  { id: 'lagoon', cx: -4, cz: -44, rx: 38, rz: 24, rot: 0.06, wob: 0.05, ph: 0.4, n: 72 },
  { id: 'west', cx: -90, cz: 24, rx: 30, rz: 32, rot: -0.1, wob: 0.04, ph: 2.2, n: 72 },
  { id: 'east', cx: 72, cz: -62, rx: 30, rz: 28, rot: 0.3, wob: 0.04, ph: 4.1, n: 72 },
];
// The rim forest, outside the arena: lumps on a ring (bearings from +x toward +z), with a gap toward the low sun.
const RIM = { r0: 157, r1: 168, step: 9, gap: [108, 152], lumpR: [9, 12] };
// Lily pad patches: [x, z, radius, pads, frogs, lotus] (just off the islets' roots, in quiet water).
const LILIES = [
  [-14, 66, 3.6, 11, 2, 2],
  [24, 64, 3.2, 9, 1, 1],
  [-36, 30, 3.4, 10, 1, 2],
  [44, 30, 3.0, 8, 1, 1],
  [-84, 6, 3.4, 10, 2, 1],
  [80, -50, 3.2, 9, 1, 2],
  [-60, -30, 3.0, 8, 1, 1],
  [-14, -92, 3.4, 10, 1, 2],
  [86, 56, 3.0, 9, 1, 1],
  [-64, -64, 3.6, 11, 2, 2],
  [-46, 90, 3.0, 8, 1, 1],
  [56, 98, 3.2, 9, 1, 1],
  [88, 28, 3.0, 8, 1, 1],
  [-2, -36, 2.6, 7, 1, 1],
];
// Egrets wheeling: centre, radius, height, angular speed (rad/s).
const EGRETS = [
  { c: [-4, -44], r: 16, y: 14, w: 0.26 },
  { c: [104, 8], r: 20, y: 17, w: -0.22 },
  { c: [-84, -76], r: 18, y: 20, w: 0.2 },
  { c: [-90, 24], r: 13, y: 13, w: -0.3 },
];

// The fireflies: how many, their pulse rates (Hz, <= PULSE_HZ_MAX), wander radius, size.
const FIREFLY = { n: 150, hz: [0.3, 0.8], wander: [0.5, 1.4], size: [0.42, 0.62] };
// The lanterns' halos: pulse rates and depth (a gentle breathing, never a flash).
const HALO = { hz: [0.2, 0.45], depth: 0.18 };
// Moss and reeds sway (Hz).
const SWAY_HZ = [0.3, 0.23];
// The frogs croak: their throats puff at these rates (Hz).
const CROAK_HZ = [0.35, 0.6];
// The fog banks' view: slots, puffs a bank (slots × puffs <= 150), fades (s), and the clear zone round the camera's
// target (u, SPEC4 §2.6: the puffs fade within 8 u of it).
const FOG_VIEW = { slots: 4, puffs: 37, fade: 1.6, clear: 8, lane: 6, opacity: 0.9, near: 40 };

// ---------------------------------------------------------------------------
// Colours (cel-shaded materials from style.js; the props are baked into vertex colours)
// ---------------------------------------------------------------------------
const C = {
  wetMud: 0x3d3322, mud: 0x6a5634, moss: 0x5a8236, moss2: 0x6d9541, mossInk: 0x263617,
  barkA: 0x7c6852, barkB: 0x5e4e3c, wetBark: 0x352d22, salt: 0xbab296,
  leaf: [0x3f7d3c, 0x4b8b3f, 0x356e37, 0x56913f], leafLit: [0x86aa4c, 0x9cb75a], leafFar: [0x466f3f, 0x3d6739, 0x527a44],
  mossStrand: 0x9aa67a, reed: 0x8ea24c, reedTop: 0x6a4a2a, knee: 0x5c4b38,
  stone: [0x8f9585, 0x7e8677, 0xa1a393], stoneDark: 0x5f6658, stoneMoss: 0x5f8a3c, carve: 0xb9b39b, socket: 0x2c2e28,
  thatch: 0xb39a52, thatch2: 0x957c3e, woven: 0xcaa96b, wovenDark: 0x9f8250, plank: 0x9b7448, plankDark: 0x6e5034,
  post: 0x5d4530, door: 0x4a3222, rope: 0x8a7a5a, cap: 0x5a2a20, net: 0xd8d0b0,
  win: 0xffd27a, fire: 0xffb648, lanterns: [0xff6a4a, 0xffa448, 0xffd86a, 0xff8fae],
  pad: 0x5aa24a, padRim: 0x3f7f36, lotus: 0xf6a2c4, lotusIn: 0xfff0f4, lotusCore: 0xffd84a,
  frog: 0x6cbf46, frogDark: 0x4e9a34, frogBelly: 0xe2f2a8, eye: 0xffffff, pupil: 0x1c1626, sac: 0xf4f2c0,
  fur: 0x8a5a32, furDark: 0x6a4224, furLight: 0xe0be92, face: 0xf0d2a8,
  coconut: 0x6e4424, banana: 0xf4d84a, bananaStem: 0x8a9a3a,
  boat: 0xa0703e, boatIn: 0x7a5230, boatTrim: [0xf2c64a, 0xe8584a, 0x5ab0e0], flag: 0x5ab84a,
  egret: 0xfbfbf4, beak: 0xf0c040, leg: 0x2a2a2a, heron: 0x9aa4ac, heronDark: 0x5c6670, heronCap: 0x2c3036,
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
const rbox = (w, h, d, r = 0.12, seg = 2) => geo(`rb${w},${h},${d},${r},${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01)));
const torus = (R, r, rs = 6, ts = 20, arc = TAU) => geo(`to${R},${r},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc));
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
// A sagging rope's points from a to b (sag at the middle).
function sagPts(a, b, sag, n = 10) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(V3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t), a.z + (b.z - a.z) * t));
  }
  return out;
}
// A lumpy blob: a sphere pushed in and out by a little value noise (smooth normals for the ink line).
function bumpy(seed, amp = 0.16, w = 14, h = 10) {
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
const leafGeo = (k) => geo(`leaf${k}`, () => bumpy(300 + k * 7, 0.2, 10, 7));
const leafLo = (k) => geo(`leafLo${k}`, () => bumpy(500 + k * 7, 0.18, 8, 6));

// Shared vertex-coloured toon materials: the whole static prop scene bakes into one outlined mesh, one without an
// ink line, and one unlit one (with its ink line) for what glows.
function vcMaterial(outline, side = THREE.FrontSide) {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(3), side });
  setOutline(m, outline);
  return m;
}
function glowVcMaterial() {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  setOutline(m, true);
  return m;
}
// An unlit material for things that glow (lanterns, windows, braziers): baked into the glow mesh.
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

// Bake every plain mesh under `group` into vertex-coloured meshes: one with the ink line, one without, and one
// unlit (materials marked userData.glow). Meshes under a node with userData.keep are left alone. Written straight into
// three geometries (a level has a couple of thousand small props: copying and merging them one by one is slow).
function bakeVC(group, mats) {
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
    if (o.material.emissive && o.material.emissiveIntensity > 0) c.add(o.material.emissive.clone().multiplyScalar(o.material.emissiveIntensity * 0.6));
    const m4 = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const op = o.material.userData.outlineParameters;
    const kind = o.material.userData.glow ? 'glow' : op && op.visible === false ? 'flat' : 'line';
    (parts[kind] || (parts[kind] = [])).push({ g, own: g !== o.geometry, m4, c, kind });
    victims.push(o);
  });
  for (const v of victims) v.parent.remove(v);
  const out = [];
  const nm = new THREE.Matrix3();
  for (const key of Object.keys(parts)) {
    const list = parts[key];
    if (!list.length) continue;
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
    const m = new THREE.Mesh(merged, mats[list[0].kind]);
    m.name = `mangroves-props-${key}`;
    group.add(m);
    out.push(m);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The sea's swell, mirrored for the shaders that ride it (the shallows and the fog's mist). scenery.js keeps its wave
// table private, so this mirrors it (same constants, same rounding); checkWaves() verifies the mirror once.
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
    if (Math.abs(h * 0.4 - waveHeight(x, z, t, 0.4)) > 1e-6) {
      console.error('mangroves.js: SEA_WAVES no longer matches the waves in scenery.js; update the mirror');
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Painted materials (own instances, never the shared toon cache)
// ---------------------------------------------------------------------------
// Terrain: uv.x = distance inland past the moss line (< 0 mud, > 0 moss), uv.y = patch noise. The colours are picked
// per pixel so the moss edge is crisp and gets a hand-drawn ink line; the mud is darker and wet at the waterline.
function makeTerrainMaterial() {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(3) });
  m.name = 'mangroves-terrain';
  setOutline(m, true);
  const U = {
    uWet: { value: new THREE.Color(C.wetMud) },
    uMud: { value: new THREE.Color(C.mud) },
    uMoss: { value: new THREE.Color(C.moss) },
    uMoss2: { value: new THREE.Color(C.moss2) },
    uInkCol: { value: new THREE.Color(C.mossInk) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vZone;\nvarying float vWY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZone = uv;\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vZone;\nvarying float vWY;\nuniform vec3 uWet, uMud, uMoss, uMoss2, uInkCol;')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float gz = vZone.x;
        float fw = max(fwidth(gz), 1e-4);
        float mossK = smoothstep(-fw, fw, gz);
        float wfw = max(fwidth(vWY), 1e-4);
        vec3 mudCol = mix(uWet, uMud, smoothstep(0.22 - wfw, 0.22 + wfw, vWY));
        float pn = vZone.y;
        float pfw = max(fwidth(pn), 1e-4);
        vec3 mossCol = mix(uMoss, uMoss2, smoothstep(0.6 - pfw, 0.6 + pfw, pn));
        vec3 tcol = mix(mudCol, mossCol, mossK);
        float ink = 1.0 - smoothstep(0.7 * fw, 1.5 * fw, abs(gz - 0.6 * fw));
        tcol = mix(tcol, uInkCol, ink * 0.85);
        vec4 diffuseColor = vec4(tcol, opacity);`,
      );
  };
  m.customProgramCacheKey = () => 'mangroves-terrain-v1';
  return m;
}

// Wood (trunks, prop roots, the arch, strangler roots): painted per pixel from world position so every root shares
// one material: two bark tones in cel blotches, a dark wet band below the tide mark with a pale salt line on it.
// uv.x = tone (0 dark .. 1 light).
function makeWoodMaterial() {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(3) });
  m.name = 'mangroves-wood';
  setOutline(m, true);
  const U = {
    uBarkA: { value: new THREE.Color(C.barkA) },
    uBarkB: { value: new THREE.Color(C.barkB) },
    uWet: { value: new THREE.Color(C.wetBark) },
    uSalt: { value: new THREE.Color(C.salt) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRW;\nvarying vec2 vRT;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRT = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vRW;
varying vec2 vRT;
uniform vec3 uBarkA, uBarkB, uWet, uSalt;
${NOISE_GLSL}`)
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float bn = mNoise3(vRW * vec3(0.9, 0.35, 0.9));
        float bfw = max(fwidth(bn), 1e-4);
        vec3 bark = mix(uBarkA, uBarkB, smoothstep(0.56 - bfw, 0.56 + bfw, bn) * 0.9);
        bark *= mix(0.86, 1.1, vRT.x);
        float wl = 0.62 + 0.08 * sin(vRW.x * 1.7 + vRW.z * 1.3);
        float wfw = max(fwidth(vRW.y), 1e-4);
        vec3 wc = mix(uWet, bark, smoothstep(wl - wfw, wl + wfw, vRW.y));
        float tl = 1.0 - smoothstep(0.035, 0.035 + 1.5 * wfw, abs(vRW.y - wl - 0.07));
        wc = mix(wc, uSalt, tl * 0.6);
        vec4 diffuseColor = vec4(wc, opacity);`,
      );
  };
  m.customProgramCacheKey = () => 'mangroves-wood-v1';
  return m;
}
// ---------------------------------------------------------------------------
// Terrain: an islet is a union of circles; the circles are its colliders (the root ring) and its mud bank lies
// INSET inside them (the height field is built from the same smooth-min distance the ocean shader uses for its foam).
// isl: { lumps: [[x, z, r]], bank, hillH, hillW, res }
// ---------------------------------------------------------------------------
function isletSampler(isl, noise) {
  const { lumps } = isl;
  const bank = isl.bank ?? 1.2;
  const hillH = isl.hillH ?? 0.45;
  const hillW = isl.hillW ?? 2.5;
  const top = 0.55;
  const seed = lumps[0][0] * 0.37 + lumps[0][1] * 0.11;
  return (x, z) => {
    let sd = 1e4;
    for (const L of lumps) sd = smin(sd, Math.hypot(x - L[0], z - L[1]) - (L[2] - INSET), 4);
    const u = -sd;
    const bw = bank + (noise(x * 0.13 + seed, z * 0.13) - 0.5) * 1.2;
    const g = u - bw;
    let h;
    if (u <= 0) h = -Math.min(2.6, 0.55 * -u + 0.07 * u * u);
    else h = top * (1 - Math.exp(-u * 0.9));
    if (g > 0) {
      h += 0.12 * smooth(0, 0.5, g);
      const k = Math.min(g / hillW, 1);
      h += hillH * (1 - Math.pow(1 - k, 2.4));
      h += (noise(x * 0.21 + 40, z * 0.21) - 0.45) * 0.35 * smooth(0, 2.5, g);
    }
    return [h, g, sd];
  };
}
function buildTerrainGeometry(isl, sample, noise) {
  const res = isl.res ?? 0.9;
  const pad = 4;
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
      if (Math.max(hs[a], hs[b], hs[c], hs[d]) < -1.2) continue;
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
// Props (plain toon materials; baked into vertex colours at the end of build())
// T: the build's kit { props, wood, woodMat, rand, ground(x, z), moss[], reeds[], flies[], lanterns[] }
// ---------------------------------------------------------------------------
function woodTube(T, pts, rFn, radial, tone) {
  T.wood.tube(pts, rFn, radial, tone);
}
// Every wooden tube of the level (trunks, prop roots, the arch, strangler roots, knees) written straight into one
// geometry for the wood material (thousands of small tubes: building and merging them one by one is slow). The same
// rings as tubeAlong, with the ring's own radial direction as the normal, capped at both ends.
function makeWoodBatch() {
  const pos = [];
  const nor = [];
  const uv = [];
  const index = [];
  let nrmx = 0;
  let nrmy = 0;
  let nrmz = 0;
  return {
    tube(points, radiusFn, radial, tone) {
      const n = points.length;
      if (n < 2) return;
      const base = pos.length / 3;
      let has = false;
      let tx;
      let ty;
      let tz;
      for (let i = 0; i < n; i++) {
        const a = points[Math.max(0, i - 1)];
        const b = points[Math.min(n - 1, i + 1)];
        tx = b.x - a.x;
        ty = b.y - a.y;
        tz = b.z - a.z;
        const tl = Math.hypot(tx, ty, tz) || 1;
        tx /= tl;
        ty /= tl;
        tz /= tl;
        if (!has) {
          if (Math.abs(ty) < 0.9) {
            nrmx = 0;
            nrmy = 1;
            nrmz = 0;
          } else {
            nrmx = 1;
            nrmy = 0;
            nrmz = 0;
          }
          has = true;
        }
        const d = nrmx * tx + nrmy * ty + nrmz * tz;
        nrmx -= tx * d;
        nrmy -= ty * d;
        nrmz -= tz * d;
        const nl = Math.hypot(nrmx, nrmy, nrmz) || 1;
        nrmx /= nl;
        nrmy /= nl;
        nrmz /= nl;
        const bx = ty * nrmz - tz * nrmy;
        const by = tz * nrmx - tx * nrmz;
        const bz = tx * nrmy - ty * nrmx;
        const r = radiusFn(i / (n - 1));
        const p = points[i];
        for (let k = 0; k < radial; k++) {
          const ang = (k / radial) * Math.PI * 2;
          const c = Math.cos(ang);
          const s = Math.sin(ang);
          const ox = nrmx * c + bx * s;
          const oy = nrmy * c + by * s;
          const oz = nrmz * c + bz * s;
          pos.push(p.x + ox * r, p.y + oy * r, p.z + oz * r);
          nor.push(ox, oy, oz);
          uv.push(tone, 0);
        }
      }
      for (let i = 0; i < n - 1; i++) {
        for (let k = 0; k < radial; k++) {
          const a = base + i * radial + k;
          const b = base + i * radial + ((k + 1) % radial);
          const c = a + radial;
          const d = b + radial;
          index.push(a, b, c, b, d, c);
        }
      }
      // the caps: a centre vertex each, facing out along the tube
      const p0 = points[0];
      const p1 = points[1];
      const q0 = points[n - 1];
      const q1 = points[n - 2];
      const cap = (p, from, ring) => {
        let dx = p.x - from.x;
        let dy = p.y - from.y;
        let dz = p.z - from.z;
        const l = Math.hypot(dx, dy, dz) || 1;
        dx /= l;
        dy /= l;
        dz /= l;
        const c = pos.length / 3;
        pos.push(p.x, p.y, p.z);
        nor.push(dx, dy, dz);
        uv.push(tone, 0);
        for (let k = 0; k < radial; k++) {
          const a = base + ring * radial + k;
          const b = base + ring * radial + ((k + 1) % radial);
          if (ring === 0) index.push(c, b, a);
          else index.push(c, a, b);
        }
      };
      cap(p0, p1, 0);
      cap(q0, q1, n - 1);
    },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(index);
      g.computeBoundingSphere();
      return g;
    },
    get vertices() {
      return pos.length / 3;
    },
  };
}
// A mangrove: a short trunk on a crown of prop roots arching out into the water, a dense lumpy crown of leaves with
// a sunlit top, a few strands of hanging moss. o: { out (radians: the open water's side), tall, wide, roots, lo }.
// Returns the crown's top height.
function mangrove(T, x, z, s, o = {}) {
  const rng = T.rand;
  const lo = !!o.lo;
  const tone = rng();
  const y0 = o.base !== undefined ? o.base : Math.max(T.ground(x, z), -0.4);
  const crown = Math.max(y0, 0) + (1.5 + rng() * 0.9) * s;
  const top = crown + (2.4 + rng() * 1.6) * s * (o.tall ?? 1);
  const la = o.out !== undefined ? o.out + (rng() - 0.5) * 1.2 : rng() * TAU;
  const lean = (0.3 + rng() * 0.8) * s;
  const tx = x + Math.cos(la) * lean;
  const tz = z + Math.sin(la) * lean;
  // the trunk
  const tp = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const k = t * t;
    tp.push(V3(x + (tx - x) * k, crown - 0.7 + (top - crown + 1.2) * t, z + (tz - z) * k));
  }
  woodTube(T, tp, (t) => (0.34 - 0.12 * t) * s, lo ? 5 : 6, tone);
  // the prop roots, arching out and down into the water (or onto the mud)
  const nR = o.roots ?? (lo ? 2 : 4 + Math.floor(rng() * 2));
  const a0 = rng() * TAU;
  for (let i = 0; i < nR; i++) {
    const a = a0 + (i / nR) * TAU + (rng() - 0.5) * 0.5;
    let reach = (1.6 + rng() * 1.4) * s;
    if (o.out !== undefined) reach *= 0.7 + 0.55 * Math.max(0, Math.cos(a - o.out));
    const sy = crown - 0.25 + rng() * 0.75 * s;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const S = V3(x + ca * 0.18 * s, sy, z + sa * 0.18 * s);
    const ex = x + ca * reach;
    const ez = z + sa * reach;
    const E = V3(ex, Math.max(T.ground(ex, ez), -0.7) - 0.25, ez);
    const Cc = V3(x + ca * reach * 0.5, sy + (0.45 + rng() * 0.25) * s, z + sa * reach * 0.5);
    woodTube(T, bez(S, Cc, E, lo ? 4 : 5), (t) => (0.13 - 0.05 * t) * s, 4, tone);
  }
  // the crown
  const nB = o.blobs ?? (lo ? 3 : 3 + Math.floor(rng() * 2));
  const blobs = [];
  let hi = top;
  for (let i = 0; i < nB; i++) {
    const a = rng() * TAU;
    const d = (i === 0 ? 0.2 : 0.9 + rng() * 0.9) * s * (o.wide ?? 1);
    const r = (1.9 + rng() * 1.0) * s * (o.wide ?? 1);
    const bx = tx + Math.cos(a) * d;
    const bz = tz + Math.sin(a) * d;
    const by = top + (0.4 + rng() * 0.8) * s;
    const b = mesh(T.props, lo ? leafLo(i % 3) : leafGeo(i % 4), toon(lo ? C.leafFar[i % 3] : C.leaf[Math.floor(rng() * C.leaf.length)]), bx, by, bz, rng() * TAU);
    b.scale.set(r, r * 0.62, r * (0.88 + rng() * 0.24));
    blobs.push([bx, by, bz, r]);
    hi = Math.max(hi, by + r * 0.62);
  }
  // a sunlit cap toward the low sun
  if (!lo) {
    const [bx, by, bz, r] = blobs[0];
    const c = mesh(T.props, leafGeo(3), toon(C.leafLit[Math.floor(rng() * 2)]), bx + SUN_XZ[0] * r * 0.35, by + r * 0.38, bz + SUN_XZ[1] * r * 0.35, rng() * TAU);
    c.scale.set(r * 0.62, r * 0.36, r * 0.6);
    // a branch out to the crown's farthest blob
    {
      let far = blobs[0];
      for (const b of blobs) if (Math.hypot(b[0] - tx, b[2] - tz) > Math.hypot(far[0] - tx, far[2] - tz)) far = b;
      const [qx, qy, qz] = far;
      if (Math.hypot(qx - tx, qz - tz) > 1.2 * s) woodTube(T, [V3(tx, top - 0.4 * s, tz), V3((tx + qx) / 2, top + 0.1 * s, (tz + qz) / 2), V3(qx, qy - 0.3 * s, qz)], (t) => (0.16 - 0.06 * t) * s, 4, tone);
    }
    // hanging moss under the crown's rim
    const nm = o.moss ?? (rng() < 0.6 ? 2 + Math.floor(rng() * 3) : 0);
    for (let i = 0; i < nm; i++) {
      const [bx2, by2, bz2, r2b] = blobs[Math.floor(rng() * blobs.length)];
      const a = rng() * TAU;
      T.moss.push({ x: bx2 + Math.cos(a) * r2b * 0.78, y: by2 - r2b * 0.3, z: bz2 + Math.sin(a) * r2b * 0.78, len: (0.9 + rng() * 1.6) * s, w: 0.3 * s });
    }
    // fireflies like the shade under the crowns
    if (rng() < 0.7) T.flies.push({ x: tx, y: crown + 0.6, z: tz, r: 2.6 * s });
  }
  return hi;
}
// Mangrove knees (pneumatophores): little root spikes poking out of the mud and the water round a shore.
function knees(T, x, z, h, n, spread, s = 1) {
  const rng = T.rand;
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU;
    const d = Math.sqrt(rng()) * spread;
    const kh = (0.35 + rng() * 0.45) * s;
    const kx = x + Math.cos(a) * d;
    const kz = z + Math.sin(a) * d;
    T.wood.tube([V3(kx, h - 0.3, kz), V3(kx + 0.03, h + kh * 0.6, kz), V3(kx + 0.05, h + kh, kz + 0.02)], (t) => (0.09 - 0.07 * t) * s, 4, 0.2);
  }
}
// A clump of reeds (they sway with the moss).
function reeds(T, x, z, n, s = 1) {
  const rng = T.rand;
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU;
    const d = rng() * 0.9 * s;
    T.reeds.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, len: (1.2 + rng() * 1.1) * s, lean: (rng() - 0.5) * 0.5, top: rng() < 0.4 });
  }
}
// A paper lantern (local origin at its cord's top): a glowing round body with dark caps and a tassel.
function paperLantern(T, x, y, z, s, col, cord = 0.5) {
  const g = group(T.props, x, y, z, 0, s);
  if (cord > 0) mesh(g, cyl(0.025, 0.025, cord, 4), toon(C.rope), 0, -cord / 2, 0);
  const b = mesh(g, sphere(10, 7), glow(col), 0, -cord - 0.5, 0);
  b.scale.set(0.42, 0.5, 0.42);
  mesh(g, cyl(0.2, 0.22, 0.12, 10), toon(C.cap), 0, -cord - 0.02, 0);
  mesh(g, cyl(0.22, 0.2, 0.12, 10), toon(C.cap), 0, -cord - 0.98, 0);
  const tas = mesh(g, cone(0.07, 0.3, 6), toon(C.cap), 0, -cord - 1.18, 0);
  tas.rotation.x = Math.PI;
  T.lanterns.push({ x, y: y - (cord + 0.5) * s, z, s, col });
}
// A heron standing in the shallows (local +z = the way it looks).
function heron(T, x, y, z, ry, s) {
  const g = group(T.props, x, y, z, ry, s);
  for (const sx of [-0.08, 0.08]) mesh(g, cyl(0.035, 0.04, 1.2, 5), toon(C.leg), sx, 0.6, 0);
  const body = mesh(g, sphere(12, 9), toon(C.heron), 0, 1.45, -0.05);
  body.scale.set(0.34, 0.36, 0.62);
  body.rotation.x = -0.35;
  const wing = mesh(g, sphere(10, 7), toon(C.heronDark), 0, 1.52, -0.2);
  wing.scale.set(0.36, 0.24, 0.55);
  wing.rotation.x = -0.35;
  const neck = [V3(0, 1.62, 0.32), V3(0, 1.95, 0.42), V3(0, 2.05, 0.2), V3(0, 2.32, 0.24)];
  mesh(g, tubeAlong(neck, (t) => 0.08 - 0.02 * t, 6), toon(C.heron));
  mesh(g, sphere(9, 7), toon(C.heron), 0, 2.38, 0.28).scale.setScalar(0.14);
  mesh(g, sphere(7, 5), toon(C.heronCap), 0, 2.46, 0.22).scale.set(0.1, 0.06, 0.16);
  const bk = mesh(g, cone(0.05, 0.42, 6), toon(C.beak), 0, 2.36, 0.56);
  bk.rotation.x = Math.PI / 2;
}
// A monkey sitting (local +z = front). pose 0: hands on knees; 1: one arm up, waving; 2: eating a banana.
function monkey(T, x, y, z, ry, s, pose = 0) {
  const g = group(T.props, x, y, z, ry, s);
  const fur = toon(C.fur);
  const b = mesh(g, sphere(10, 7), fur, 0, 0.5, 0);
  b.scale.set(0.42, 0.5, 0.38);
  mesh(g, sphere(8, 6), toon(C.furLight), 0, 0.48, 0.2).scale.set(0.28, 0.34, 0.2);
  mesh(g, sphere(10, 7), fur, 0, 1.12, 0.02).scale.setScalar(0.36);
  mesh(g, sphere(8, 6), toon(C.face), 0, 1.08, 0.24).scale.set(0.27, 0.24, 0.15);
  for (const sx of [-1, 1]) {
    mesh(g, sphere(7, 5), toon(C.face), sx * 0.35, 1.18, 0).scale.set(0.13, 0.13, 0.06);
    mesh(g, sphere(7, 5), toon(C.pupil), sx * 0.1, 1.15, 0.37).scale.setScalar(0.055);
    mesh(g, sphere(7, 5), fur, sx * 0.22, 0.2, 0.22).scale.set(0.16, 0.14, 0.24);
  }
  mesh(g, sphere(7, 5), toon(C.socket), 0, 1.0, 0.39).scale.set(0.08, 0.03, 0.03);
  // arms
  for (const sx of [-1, 1]) {
    const up = pose === 1 && sx > 0;
    const arm = mesh(g, geo('mArm', () => new THREE.CapsuleGeometry(0.07, 0.42, 3, 6)), fur, sx * 0.36, up ? 1.05 : 0.48, up ? 0.05 : 0.2);
    arm.rotation.set(up ? 0 : 0.9, 0, up ? sx * -2.6 : sx * 0.3);
    if (pose === 2 && sx < 0) {
      const ban = mesh(g, geo('banana', () => tubeAlong([V3(0, 0, 0), V3(0.05, 0.12, 0.02), V3(0.04, 0.26, 0.0), V3(-0.02, 0.36, -0.03)], (t) => 0.05 + 0.02 * Math.sin(t * Math.PI), 6)), toon(C.banana), -0.12, 0.72, 0.36);
      ban.rotation.x = -0.5;
    }
  }
  // the tail, curled
  const tail = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const a = t * 4.2;
    tail.push(V3(0.05 + Math.sin(a) * 0.25 * t, 0.25 + t * 0.55 + Math.cos(a) * 0.12 * t, -0.3 - t * 0.5 + Math.cos(a) * 0.15 * t));
  }
  mesh(g, tubeAlong(tail, (t) => 0.06 - 0.025 * t, 5), fur);
}
// A pile of coconuts and a bunch of bananas.
function coconuts(T, x, y, z, n) {
  const rng = T.rand;
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU;
    const d = rng() * 0.55;
    mesh(T.props, sphere(8, 6), toon(C.coconut), x + Math.cos(a) * d, y + 0.18 + (i > 4 ? 0.28 : 0), z + Math.sin(a) * d).scale.setScalar(0.22);
  }
}
function bananas(T, x, y, z) {
  mesh(T.props, cyl(0.05, 0.05, 0.7, 5), toon(C.bananaStem), x, y + 0.35, z);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const b = mesh(T.props, geo('banana', () => tubeAlong([V3(0, 0, 0), V3(0.05, 0.12, 0.02), V3(0.04, 0.26, 0.0), V3(-0.02, 0.36, -0.03)], (t) => 0.05 + 0.02 * Math.sin(t * Math.PI), 6)), toon(C.banana), x + Math.cos(a) * 0.1, y + 0.25 + (i % 2) * 0.12, z + Math.sin(a) * 0.1);
    b.rotation.set(Math.sin(a) * 2.4, 0, -Math.cos(a) * 2.4);
  }
}

// ---------------------------------------------------------------------------
// The shallows on the GPU: the mud flats (translucent golden mud with ripples and a soft pale rim) and the pale water
// under the stilt village, riding exactly the ocean's swell.
// ---------------------------------------------------------------------------
function buildShallows(flats, pools, rng, timeU, ampU) {
  const pos = [];
  const col = [];
  const ext = [];
  const index = [];
  const add = (x, z, c, a, mud = 0, t = -1) => {
    pos.push(x, 0, z);
    col.push(c.r, c.g, c.b, a);
    ext.push(mud, 0, t);
    return pos.length / 3 - 1;
  };
  const disc = (x, z, R, rings, seg, rimmed = true) => {
    const c0 = add(x, z, rings[0][1], rings[0][2], rings[0][3], rimmed ? 0 : -1);
    let prev = null;
    for (let ri = 1; ri < rings.length; ri++) {
      const [t, c, a, m] = rings[ri];
      const row = [];
      for (let k = 0; k < seg; k++) {
        const th = (k / seg) * Math.PI * 2;
        const r = R(th) * t;
        row.push(add(x + Math.cos(th) * r, z + Math.sin(th) * r, c, a, m, rimmed ? t : -1));
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
  const cCore = hex(0xc9b47a);
  const cMud = hex(0xb4a066);
  const cEdge = hex(0x9a9a5e);
  const cShelf = hex(0x86c49a);
  for (const f of flats) {
    const a1 = rng() * 6.28;
    const a2 = rng() * 6.28;
    const R = (th) => f.r * (1 + 0.08 * Math.sin(3 * th + a1) + 0.05 * Math.sin(5 * th + a2));
    disc(f.x, f.z, R, [[0, cCore, 0.92, 1], [0.45, cCore, 0.9, 1], [0.75, cMud, 0.84, 1], [0.9, cEdge, 0.66, 0], [1.1, cShelf, 0.42, 0]], 44);
  }
  const cPool = hex(0x7fc8a0);
  const cPoolIn = hex(0x96d4a8);
  for (const p of pools) disc(p.x, p.z, () => p.r, [[0, cPoolIn, 0.62, 0], [0.6, cPoolIn, 0.58, 0], [0.85, cPool, 0.42, 0], [1, cPool, 0, 0]], 48, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setAttribute('aExt', new THREE.Float32BufferAttribute(ext, 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: true });
  m.name = 'mangroves-shallows';
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
  transformed.y = waveH(wxz, uTime, uAmp) + 0.06 + far * 0.0013;
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vExt;\nvarying vec2 vWxz;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    // mud ripples: soft wavy bands across the flat
    float rp = sin(dot(vWxz, vec2(0.71, 0.7)) * 1.9 + 0.9 * sin(vWxz.x * 0.23 + vWxz.y * 0.17));
    diffuseColor.rgb *= 1.0 - 0.09 * smoothstep(0.5, 0.85, rp) * vExt.x;
    // a soft pale rim where the mud meets the water, breathing a little
    if (vExt.z >= 0.0) {
      float t = vExt.z;
      float wob = 0.018 * sin(vWxz.x * 1.1 + vWxz.y * 0.8 + uTime * 0.5);
      float fw = max(fwidth(t), 1e-4);
      float rim = smoothstep(0.86 + wob - fw, 0.86 + wob + fw, t) * (1.0 - smoothstep(0.93 + wob - fw, 0.93 + wob + fw, t));
      diffuseColor = mix(diffuseColor, vec4(0.93, 0.95, 0.8, 0.7), rim * 0.75);
    }
  }`);
  };
  m.customProgramCacheKey = () => 'mangroves-shallows-v1';
  const me = new THREE.Mesh(g, m);
  me.name = 'mangroves-shallows';
  me.userData.keep = true;
  me.frustumCulled = false; // displaced on the GPU
  me.renderOrder = 2;
  return me;
}

// ---------------------------------------------------------------------------
// Moss and reeds: one mesh of thin double-sided strands that sway in the vertex shader (no ink line: a crossed pair
// of ribbons each). aSw = (freedom 0..1: 0 where it hangs from or stands in, 1 at its free end; phase).
// ---------------------------------------------------------------------------
function buildSway(moss, reedList, rng, timeU, motionU) {
  const pos = [];
  const col = [];
  const sw = [];
  const index = [];
  const cM = new THREE.Color(C.mossStrand);
  const cM2 = new THREE.Color(0x8a9868);
  const cR = new THREE.Color(C.reed);
  const cT = new THREE.Color(C.reedTop);
  // a ribbon from (x, y, z) along `dir` (0 = down: moss; 1 = up: reeds)
  const ribbon = (x, y, z, len, w0, w1, up, c0, c1, ph, lean, ang, f0 = 0) => {
    const N = 5;
    for (const turn of [0, Math.PI / 2]) {
      const ux = Math.cos(ang + turn);
      const uz = Math.sin(ang + turn);
      const b = pos.length / 3;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const w = (w0 + (w1 - w0) * t) / 2;
        const yy = up ? y + len * t : y - len * t;
        const zig = (up ? lean * t * t : 0.08 * Math.sin(t * 9 + ph)) * len;
        const cx = x + (up ? Math.cos(ang) * zig : zig * ux);
        const cz = z + (up ? Math.sin(ang) * zig : zig * uz);
        const c = c0.clone().lerp(c1, t);
        for (const sgn of [-1, 1]) {
          pos.push(cx + ux * w * sgn, yy, cz + uz * w * sgn);
          col.push(c.r, c.g, c.b);
          sw.push(f0 + (1 - f0) * t, ph);
        }
      }
      for (let i = 0; i < N; i++) {
        const a = b + i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  };
  for (const m of moss) ribbon(m.x, m.y, m.z, m.len, m.w, 0.04, false, cM, rng() < 0.5 ? cM2 : cM, rng() * TAU, 0, rng() * TAU);
  for (const r of reedList) {
    const ang = rng() * TAU;
    const ph = rng() * TAU;
    const L = r.len + 0.3;
    ribbon(r.x, -0.3, r.z, L, 0.09, 0.02, true, cR, cR, ph, r.lean, ang);
    if (r.top) ribbon(r.x + Math.cos(ang) * r.lean * L * 0.8, r.len - 0.75, r.z + Math.sin(ang) * r.lean * L * 0.8, 0.5, 0.15, 0.12, true, cT, cT, ph, 0, ang, 0.8);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSw', new THREE.Float32BufferAttribute(sw, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(3), side: THREE.DoubleSide });
  m.name = 'mangroves-sway';
  noOutline(m);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU;
    sh.uniforms.uMotion = motionU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uMotion;\nattribute vec2 aSw;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float f = aSw.x * aSw.x * uMotion;
  transformed.x += f * 0.2 * sin(uTime * ${glslNum(TAU * SWAY_HZ[0])} + aSw.y);
  transformed.z += f * 0.15 * cos(uTime * ${glslNum(TAU * SWAY_HZ[1])} + aSw.y * 1.3);
}`);
  };
  m.customProgramCacheKey = () => 'mangroves-sway-v1';
  const me = new THREE.Mesh(g, m);
  me.name = 'mangroves-sway';
  me.userData.keep = true;
  me.frustumCulled = false; // swayed on the GPU
  return me;
}

// ---------------------------------------------------------------------------
// Glows: camera-facing quads placed and pulsed in the vertex shader (one InstancedMesh: the fireflies; one more: the
// lanterns' halos). aG = (pulse Hz, phase, wander radius, size); additive, no ink line.
// ---------------------------------------------------------------------------
const GLOW_VERT = /* glsl */ `
attribute vec4 aG;
uniform float uTime;
uniform float uMotion;
uniform float uDepth;
uniform float uDrift;
varying vec2 vUv2;
varying float vGlow;
varying float vFogD;
void main() {
  vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float ph = aG.y;
  c += vec3(sin(uTime * 0.37 + ph * 3.1), 0.55 * sin(uTime * 0.29 + ph * 1.7), cos(uTime * 0.31 + ph * 2.3)) * aG.z * uMotion * uDrift;
  vec4 mv = viewMatrix * vec4(c, 1.0);
  float pulse = 0.5 + 0.5 * sin(${glslNum(TAU)} * aG.x * uTime + ph);
  vGlow = 1.0 - uDepth * mix(0.35, 1.0 - pulse, uMotion);
  mv.xy += (uv - 0.5) * aG.w * 2.0;
  vUv2 = uv;
  vFogD = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const GLOW_FRAG = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uHalo;
uniform float uFogNear;
uniform float uFogFar;
varying vec2 vUv2;
varying float vGlow;
varying float vFogD;
void main() {
  float d = length(vUv2 - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = 1.0 - smoothstep(0.14, 0.3, d);
  float halo = pow(1.0 - smoothstep(0.2, 1.0, d), 2.0) * 0.55;
  vec3 col = uCore * core + uHalo * halo;
  float a = vGlow * (1.0 - smoothstep(uFogNear, uFogFar, vFogD));
  gl_FragColor = vec4(col * a, 1.0);
  #include <colorspace_fragment>
}
`;
function buildGlows(list, name, opts) {
  const n = Math.max(1, list.length);
  const g = new THREE.PlaneGeometry(1, 1);
  const aG = new Float32Array(n * 4);
  list.forEach((p, i) => aG.set([p.hz, p.ph, p.wander, p.size], i * 4));
  g.setAttribute('aG', new THREE.InstancedBufferAttribute(aG, 4));
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: opts.timeU,
      uMotion: opts.motionU,
      uDepth: { value: opts.depth },
      uDrift: { value: opts.drift },
      uCore: { value: new THREE.Color(opts.core) },
      uHalo: { value: new THREE.Color(opts.halo) },
      uFogNear: { value: palette.fogNear },
      uFogFar: { value: palette.fogFar * 0.8 },
    },
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  m.name = name;
  noOutline(m);
  const me = new THREE.InstancedMesh(g, m, n);
  me.name = name;
  me.userData.keep = true;
  me.frustumCulled = false; // placed on the GPU
  me.renderOrder = 6;
  const m4 = new THREE.Matrix4();
  list.forEach((p, i) => me.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
  if (!list.length) me.count = 0;
  return me;
}

// ---------------------------------------------------------------------------
// The floaters: lily pads, lotus flowers and frogs, one InstancedMesh each (vertex colours) with an inverted-hull ink
// twin (InstancedMesh is never outlined by the outline pass), bobbing on the swell; the frogs' throats puff.
// ---------------------------------------------------------------------------
// Merge [geometry, colour] parts into one vertex-coloured geometry; push > 0 grows every part along its own normals
// (the ink hull).
function colouredParts(parts, push = 0) {
  const geos = parts.map(([g0, c, skipInHull]) => {
    if (push > 0 && skipInHull) return null;
    const g = g0.index && !g0.attributes.normal ? g0.toNonIndexed() : g0.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (push > 0) {
      const p = g.attributes.position;
      const nr = g.attributes.normal;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + nr.getX(i) * push, p.getY(i) + nr.getY(i) * push, p.getZ(i) + nr.getZ(i) * push);
    }
    ensureIndex(g);
    const col = new THREE.Color(c);
    const n = g.attributes.position.count;
    const ca = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.toArray(ca, i * 3);
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
// A lily pad: a thin disc with its notch, and its ink line drawn into it as a dark rim (a flat disc's inverted hull
// would sink under the water).
function padParts() {
  const top = new THREE.CylinderGeometry(1, 1, 0.07, 16, 1, false, 0.3, TAU - 0.6);
  const rim = [];
  rim.push(V3(0, 0.04, 0));
  for (let i = 0; i <= 16; i++) {
    const th = 0.3 + (i / 16) * (TAU - 0.6);
    rim.push(V3(Math.sin(th) * 0.985, 0.04, Math.cos(th) * 0.985));
  }
  rim.push(V3(0, 0.04, 0));
  const line = tubeAlong(rim, () => 0.03, 3);
  const vein = tubeAlong([V3(0, 0.045, 0), V3(Math.sin(Math.PI) * 0.8, 0.045, Math.cos(Math.PI) * 0.8)], () => 0.012, 3);
  return [[top, C.pad], [line, 0x1c2a14], [vein, C.padRim]];
}
function lotusParts() {
  const parts = [];
  const petal = new THREE.SphereGeometry(1, 7, 4);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    parts.push([placed(petal, Math.cos(a) * 0.26, 0.16, Math.sin(a) * 0.26, 0.13, 0.08, 0.3, -0.85, -a + Math.PI / 2, 0), C.lotus]);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.3;
    parts.push([placed(petal, Math.cos(a) * 0.12, 0.26, Math.sin(a) * 0.12, 0.1, 0.07, 0.22, -0.45, -a + Math.PI / 2, 0), C.lotusIn]);
  }
  parts.push([placed(new THREE.CylinderGeometry(1, 1, 1, 8), 0, 0.3, 0, 0.09, 0.08, 0.09), C.lotusCore, true]);
  const leaf = new THREE.CylinderGeometry(1, 1, 0.05, 12, 1, false, 0.3, TAU - 0.6);
  parts.push([placed(leaf, 0, 0.0, 0, 0.62, 1, 0.62), C.pad]);
  return parts;
}
function frogParts() {
  const s = new THREE.SphereGeometry(1, 9, 7);
  const s2 = new THREE.SphereGeometry(1, 6, 5);
  return [
    [placed(s, 0, 0.3, 0, 0.42, 0.3, 0.5, -0.25), C.frog],
    [placed(s, 0, 0.26, 0.16, 0.3, 0.2, 0.34, -0.3), C.frogBelly],
    [placed(s2, -0.33, 0.14, -0.12, 0.17, 0.13, 0.3), C.frogDark],
    [placed(s2, 0.33, 0.14, -0.12, 0.17, 0.13, 0.3), C.frogDark],
    [placed(s2, -0.18, 0.1, 0.32, 0.08, 0.1, 0.12), C.frog],
    [placed(s2, 0.18, 0.1, 0.32, 0.08, 0.1, 0.12), C.frog],
    // big round eyes bulging up out of the head, white with a black pupil looking ahead
    [placed(s, -0.17, 0.55, 0.2, 0.15, 0.15, 0.15), C.frog],
    [placed(s, 0.17, 0.55, 0.2, 0.15, 0.15, 0.15), C.frog],
    [placed(s, -0.18, 0.64, 0.24, 0.12, 0.12, 0.12), C.eye],
    [placed(s, 0.18, 0.64, 0.24, 0.12, 0.12, 0.12), C.eye],
    [placed(s2, -0.19, 0.66, 0.34, 0.06, 0.07, 0.04), C.pupil, true],
    [placed(s2, 0.19, 0.66, 0.34, 0.06, 0.07, 0.04), C.pupil, true],
    [placed(new THREE.TorusGeometry(0.2, 0.018, 4, 12, Math.PI * 0.8), 0, 0.33, 0.4, 1, 1, 1, Math.PI / 2 + 0.25, 0, Math.PI + 0.3), C.pupil, true],
  ];
}
function buildFloaters(own, ownGeos, root) {
  const inkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(INK[0], INK[1], INK[2]), side: THREE.BackSide });
  noOutline(inkMat);
  own.push(inkMat);
  const kinds = {};
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
    me.name = `mangroves-${key}`;
    if (hull) hull.name = `mangroves-${key}-ink`;
    for (const x of [me, hull]) {
      if (!x) continue;
      x.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      x.userData.keep = true;
      x.frustumCulled = false; // they bob every frame
      x.count = n;
      root.add(x);
    }
    kinds[key] = { mesh: me, hull };
    return kinds[key];
  };
  return { make, kinds };
}

// ---------------------------------------------------------------------------
// The rig: the egrets wheeling and the moored boats bobbing share one vertex-coloured mesh whose pieces are moved on
// the CPU (a few thousand vertices): 2 draw calls with its ink line.
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
// An egret in two pieces: the body (local +z forward, legs trailing), then both wings (flapped by scaling).
function egretPieces() {
  const body = new THREE.Group();
  const w = toon(C.egret);
  const b = mesh(body, sphere(10, 7), w);
  b.scale.set(0.26, 0.26, 0.6);
  const neck = [V3(0, 0.08, 0.45), V3(0, 0.2, 0.62), V3(0, 0.16, 0.82), V3(0, 0.2, 0.95)];
  mesh(body, tubeAlong(neck, (t) => 0.09 - 0.03 * t, 5), w);
  mesh(body, sphere(8, 6), w, 0, 0.22, 0.98).scale.setScalar(0.12);
  const bk = mesh(body, cone(0.045, 0.34, 6), toon(C.beak), 0, 0.21, 1.2);
  bk.rotation.x = Math.PI / 2;
  for (const sx of [-0.06, 0.06]) {
    const lg = mesh(body, cyl(0.025, 0.025, 0.9, 4), toon(C.leg), sx, -0.05, -0.85);
    lg.rotation.x = Math.PI / 2;
  }
  const wings = new THREE.Group();
  for (const side of [1, -1]) {
    const inner = mesh(wings, sphere(9, 5), w, side * 0.5, 0.1, 0.02);
    inner.scale.set(0.55, 0.06, 0.32);
    inner.rotation.z = side * 0.3;
    const outer = mesh(wings, sphere(9, 5), w, side * 1.45, 0.16, -0.1);
    outer.scale.set(0.6, 0.05, 0.25);
    outer.rotation.order = 'YXZ';
    outer.rotation.y = side * 0.25;
    outer.rotation.z = -side * 0.25;
  }
  return [body, wings];
}
// A jollyboat (the monkeys' tub: a round little rowboat with a striped rim and a banana-leaf flag). Local +z = bow.
function jollyboatPiece(trim) {
  const g = new THREE.Group();
  const hull = mesh(g, geo('jollyHull', () => lathe([[0.0, -0.55], [0.9, -0.5], [1.22, -0.18], [1.3, 0.22], [1.16, 0.3]], 16)), toon(C.boat));
  hull.scale.set(1, 1, 1.25);
  mesh(g, geo('jollyFloor', () => new THREE.CylinderGeometry(1.05, 1.05, 0.08, 16)), toon(C.boatIn), 0, 0.02, 0).scale.set(1, 1, 1.25);
  const rim = mesh(g, geo('jollyRim', () => new THREE.TorusGeometry(1.22, 0.1, 6, 22)), toon(trim), 0, 0.28, 0);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1, 1.25, 1);
  mesh(g, cyl(0.045, 0.05, 1.8, 5), toon(C.plankDark), 0, 1.1, 0.4);
  const flag = mesh(g, sphere(8, 5), toon(C.flag), 0.32, 1.75, 0.4);
  flag.scale.set(0.34, 0.16, 0.05);
  mesh(g, rbox(1.9, 0.1, 0.3, 0.04, 1), toon(C.plankDark), 0, 0.15, -0.2);
  return g;
}
// A dugout canoe (local +z = bow).
function canoePiece() {
  const g = new THREE.Group();
  const hull = mesh(g, geo('canoeHull', () => {
    const hg = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const p = hg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const zz = p.getZ(i);
      p.setXYZ(i, p.getX(i) * 0.55 * (1 - 0.5 * zz * zz), p.getY(i) * 0.5, zz * 2.6);
    }
    hg.computeVertexNormals();
    return hg;
  }), toon(C.boat), 0, 0.18, 0);
  hull.rotation.x = Math.PI;
  mesh(g, rbox(0.8, 0.08, 4.4, 0.04, 1), toon(C.boatIn), 0, 0.17, 0);
  const pad = mesh(g, rbox(0.12, 0.05, 1.6, 0.02, 1), toon(C.plankDark), -0.2, 0.3, -1.2);
  pad.rotation.y = 0.5;
  return g;
}

// ---------------------------------------------------------------------------
// The fog banks (drawn from the mechanics' snapshot; see the header)
// ---------------------------------------------------------------------------
const PUFF_VERT = /* glsl */ `
attribute float aFade;
varying vec3 vN;
varying vec3 vV;
varying float vFade;
varying float vFogD;
varying float vY;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec4 mv = viewMatrix * wp;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  vFade = aFade;
  vFogD = -mv.z;
  vY = wp.y;
  gl_Position = projectionMatrix * mv;
}
`;
const PUFF_FRAG = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uRim;
uniform float uOpacity;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec3 vN;
varying vec3 vV;
varying float vFade;
varying float vFogD;
varying float vY;
void main() {
  vec3 n = normalize(vN);
  float l = dot(n, uSun);
  float lfw = max(fwidth(l), 1e-3);
  vec3 col = mix(uShade, uLit, smoothstep(-0.08 - lfw, -0.08 + lfw, l));
  col = mix(col, uRim, smoothstep(0.45 - lfw, 0.45 + lfw, l) * 0.4);
  float facing = abs(dot(n, normalize(vV)));
  float a = uOpacity * vFade * smoothstep(0.04, 0.8, facing) * smoothstep(-0.4, 0.7, vY);
  col = mix(col, fogColor, smoothstep(fogNear, fogFar, vFogD) * 0.85);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;
const MIST_VERT = /* glsl */ `
attribute float aFade;
uniform float uTime;
uniform float uAmp;
varying vec2 vL;
varying vec2 vW;
varying float vFade;
varying float vFogD;
${WAVE_GLSL}
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  wp.y = waveH(wp.xz, uTime, uAmp) + 0.16;
  vec4 mv = viewMatrix * wp;
  vL = position.xz;
  vW = wp.xz;
  vFade = aFade;
  vFogD = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const MIST_FRAG = /* glsl */ `
uniform float uTime;
uniform float uMotion;
uniform vec3 uCol;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec2 vL;
varying vec2 vW;
varying float vFade;
varying float vFogD;
${NOISE_GLSL}
void main() {
  float r = length(vL);
  float a = (1.0 - smoothstep(0.45, 1.0, r)) * 0.62 * vFade;
  float wisp = mNoise(vW * 0.11 + vec2(uTime * 0.05, -uTime * 0.035) * uMotion) * 0.6 + mNoise(vW * 0.27 - vec2(uTime * 0.03, uTime * 0.02) * uMotion) * 0.4;
  a *= 0.62 + 0.38 * smoothstep(0.35, 0.7, wisp);
  vec3 col = mix(uCol, fogColor, smoothstep(fogNear, fogFar, vFogD) * 0.8);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;
// The puffs of one bank, in bank units: u along the long axis (-1..1 × len/2), v across (× wid/2), height, radius,
// phase and swirl speed. A low dome: big puffs down the middle, smaller ones toward the rim, a few on top.
function puffLayout(n) {
  const r = mulberry32(0xf06b);
  const out = [];
  const core = Math.round(n * 0.24);
  const top = Math.round(n * 0.14);
  const ring = Math.round(n * 0.32);
  const edge = n - core - top - ring;
  for (let i = 0; i < core; i++) out.push({ u: -0.72 + (1.44 * i) / Math.max(1, core - 1) + (r() - 0.5) * 0.08, v: (r() - 0.5) * 0.3, y: 2.3 + r() * 0.7, s: 4.4 + r() * 0.9 });
  for (let i = 0; i < top; i++) out.push({ u: -0.5 + (1.0 * i) / Math.max(1, top - 1) + (r() - 0.5) * 0.1, v: (r() - 0.5) * 0.25, y: 4.8 + r() * 0.8, s: 3.0 + r() * 0.6 });
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * TAU + r() * 0.2;
    const k = 0.55 + r() * 0.15;
    out.push({ u: Math.cos(a) * k, v: Math.sin(a) * k, y: 1.7 + r() * 0.6, s: 3.4 + r() * 0.7 });
  }
  for (let i = 0; i < edge; i++) {
    const a = (i / edge) * TAU + 0.4 + r() * 0.15;
    const k = 0.86 + r() * 0.1;
    out.push({ u: Math.cos(a) * k, v: Math.sin(a) * k, y: 1.0 + r() * 0.4, s: 2.4 + r() * 0.6 });
  }
  for (const p of out) {
    p.ph = r() * TAU;
    p.sp = (0.08 + r() * 0.1) * (r() < 0.5 ? -1 : 1);
  }
  return out;
}
function readBank(b, i) {
  if (!b || typeof b !== 'object') return null;
  const x = b.x;
  const z = b.z;
  if (!finite(x) || !finite(z)) return null;
  const h = finite(b.h) ? b.h : 0;
  const len = finite(b.len) && b.len > 0 ? Math.min(b.len, 80) : 30;
  const wid = finite(b.wid) && b.wid > 0 ? Math.min(b.wid, 60) : 18;
  return { id: b.id !== undefined && b.id !== null ? String(b.id) : null, x, z, h, len, wid, i };
}
function createFogView(root, own, ownGeos, reduced, timeU, ampU, motionU) {
  const S = FOG_VIEW.slots;
  const P = FOG_VIEW.puffs;
  const layout = puffLayout(P);
  // puffs
  const pg = new THREE.SphereGeometry(1, 14, 10);
  const fade = new Float32Array(S * P);
  const fadeAttr = new THREE.InstancedBufferAttribute(fade, 1).setUsage(THREE.DynamicDrawUsage);
  pg.setAttribute('aFade', fadeAttr);
  const sun = new THREE.Vector3(...palette.sunDir).normalize();
  const pm = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uSun: { value: sun },
      uLit: { value: new THREE.Color(0xfbf8ea) },
      uShade: { value: new THREE.Color(0xc2cfbb) },
      uRim: { value: new THREE.Color(0xffe2a2) },
      uOpacity: { value: FOG_VIEW.opacity },
    }]),
    vertexShader: PUFF_VERT,
    fragmentShader: PUFF_FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  pm.name = 'mangroves-fog';
  noOutline(pm);
  const puffs = new THREE.InstancedMesh(pg, pm, S * P);
  puffs.name = 'mangroves-fog';
  puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  puffs.frustumCulled = false;
  puffs.userData.keep = true;
  puffs.renderOrder = 4;
  // the low mist on the water, one disc a bank
  const dg = new THREE.CircleGeometry(1, 40);
  dg.rotateX(-Math.PI / 2);
  const dfade = new Float32Array(S);
  const dfadeAttr = new THREE.InstancedBufferAttribute(dfade, 1).setUsage(THREE.DynamicDrawUsage);
  dg.setAttribute('aFade', dfadeAttr);
  const dm = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCol: { value: new THREE.Color(0xf2f4e4) } }]),
    vertexShader: MIST_VERT,
    fragmentShader: MIST_FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  dm.uniforms.uTime = timeU;
  dm.uniforms.uAmp = ampU;
  dm.uniforms.uMotion = motionU;
  dm.name = 'mangroves-mist';
  noOutline(dm);
  const discs = new THREE.InstancedMesh(dg, dm, S);
  discs.name = 'mangroves-mist';
  discs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  discs.frustumCulled = false;
  discs.userData.keep = true;
  discs.renderOrder = 3;
  own.push(pm, dm);
  ownGeos.push(pg, dg);
  root.add(discs, puffs);
  const hide = () => {
    // (one instance, scaled to nothing, so a warm draw still draws)
    puffs.count = 1;
    discs.count = 1;
    puffs.setMatrixAt(0, zero);
    discs.setMatrixAt(0, zero);
    fade[0] = 0;
    dfade[0] = 0;
    puffs.instanceMatrix.needsUpdate = true;
    discs.instanceMatrix.needsUpdate = true;
    fadeAttr.needsUpdate = true;
    dfadeAttr.needsUpdate = true;
    puffs.visible = false;
    discs.visible = false;
  };
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const slots = [];
  for (let i = 0; i < S; i++) slots.push({ id: null, k: 0, alive: false, x: 0, z: 0, h: 0, len: 30, wid: 18 });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pv = new THREE.Vector3();
  const sv = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const camP = new THREE.Vector3();
  let drawn = 0;
  let banks = 0;
  hide();
  function update(t, dt, list, frame) {
    const step = finite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
    for (const s of slots) s.alive = false;
    const items = [];
    if (Array.isArray(list)) for (let i = 0; i < list.length && items.length < S * 2; i++) {
      const b = readBank(list[i], i);
      if (b) items.push(b);
    }
    for (const b of items) {
      let slot = b.id !== null ? slots.find((s) => s.id === b.id) : null;
      if (!slot && b.id === null) {
        let best = null;
        let bd = 12;
        for (const s of slots) {
          if (s.alive || s.k <= 0) continue;
          const d = Math.hypot(s.x - b.x, s.z - b.z);
          if (d < bd) {
            bd = d;
            best = s;
          }
        }
        slot = best;
      }
      if (!slot) slot = slots.find((s) => !s.alive && s.k <= 0) || null;
      if (!slot || slot.alive) continue;
      slot.alive = true;
      slot.id = b.id;
      slot.x = b.x;
      slot.z = b.z;
      slot.h = b.h;
      slot.len = b.len;
      slot.wid = b.wid;
    }
    for (const s of slots) {
      s.k = clamp01(s.k + (s.alive ? step : -step) / FOG_VIEW.fade);
      if (!s.alive && s.k <= 0) s.id = null;
    }
    // the camera's target: main's focus, else where the camera looks, 1.5 u over the water
    let hasFocus = false;
    const cam = frame && frame.camera && frame.camera.isCamera ? frame.camera : null;
    if (cam) camP.setFromMatrixPosition(cam.matrixWorld);
    const fo = frame && frame.focus;
    if (fo && finite(fo.x) && finite(fo.z)) {
      focus.set(fo.x, 1.5, fo.z);
      hasFocus = true;
    } else if (cam) {
      // (the chase view looks at a point 1.5 over the water just ahead of your ship, about 26 u from the camera; a
      // far look, like the fly-in's, has no target to keep clear)
      cam.getWorldDirection(fwd);
      if (fwd.y < -0.02) {
        const d = (1.5 - camP.y) / fwd.y;
        if (d > 0 && d < FOG_VIEW.near) {
          focus.copy(camP).addScaledVector(fwd, d);
          hasFocus = true;
        }
      }
    }
    const calm = reduced();
    let n = 0;
    let nd = 0;
    banks = 0;
    for (const s of slots) {
      if (s.k <= 0) continue;
      banks++;
      const ease = s.k * s.k * (3 - 2 * s.k);
      const fx = Math.sin(s.h);
      const fz = Math.cos(s.h);
      const a = s.len / 2;
      const w = s.wid / 2;
      // the mist on the water (a little bigger than the bank)
      q.setFromAxisAngle(up, s.h);
      m4.compose(pv.set(s.x, 0, s.z), q, sv.set(w * 1.25, 1, a * 1.18));
      discs.setMatrixAt(nd, m4);
      dfade[nd] = ease;
      nd++;
      const scaleK = a / 15;
      for (let i = 0; i < P; i++) {
        const p = layout[i];
        let du = p.u * a;
        let dv = p.v * w;
        let y = p.y * Math.min(1.3, Math.max(0.7, scaleK));
        let r = p.s * Math.min(1.3, Math.max(0.6, scaleK));
        if (!calm) {
          const ang = p.ph + t * p.sp;
          du += Math.cos(ang) * 0.9;
          dv += Math.sin(ang) * 0.7;
          y += 0.25 * Math.sin(t * 0.4 + p.ph);
          r *= 1 + 0.06 * Math.sin(t * 0.55 + p.ph * 1.7);
        }
        // (local u along the heading, v to its right: x = u·sin h + v·cos h, z = u·cos h − v·sin h)
        const px = s.x + du * fx + dv * fz;
        const pz = s.z + du * fz - dv * fx;
        let f = ease;
        if (hasFocus) {
          // a clear lane over the water from under the camera to its target (your ship sits in it): no puff
          // within FOG_VIEW.clear of it
          const ax = cam ? camP.x : focus.x;
          const az = cam ? camP.z : focus.z;
          const dl = segDist(px, pz, ax, az, focus.x, focus.z) - r * 0.35;
          const dt = Math.hypot(px - focus.x, pz - focus.z) - r * 0.35;
          f *= smooth(FOG_VIEW.lane - 1, FOG_VIEW.lane + 3, dl) * smooth(FOG_VIEW.clear - 1, FOG_VIEW.clear + 3, dt);
        }
        if (cam && f > 0) {
          // and none right in front of the camera
          pv.set(px, y, pz);
          f *= smooth(1, 6, pv.distanceTo(camP) - r);
        }
        if (f <= 0.002) continue;
        // (a fading puff shrinks too, so it never hangs about as a ghostly disc)
        r *= 0.55 + 0.45 * f;
        q.setFromAxisAngle(up, s.h + p.ph);
        m4.compose(pv.set(px, y, pz), q, sv.set(r, r * 0.68, r));
        puffs.setMatrixAt(n, m4);
        fade[n] = f;
        n++;
      }
    }
    drawn = n;
    if (!nd) {
      hide();
      return;
    }
    puffs.visible = n > 0;
    discs.visible = true;
    if (!n) {
      puffs.setMatrixAt(0, zero);
      fade[0] = 0;
    }
    puffs.count = Math.max(1, n);
    discs.count = nd;
    puffs.instanceMatrix.needsUpdate = true;
    discs.instanceMatrix.needsUpdate = true;
    fadeAttr.needsUpdate = true;
    dfadeAttr.needsUpdate = true;
  }
  return {
    update,
    meshes: [puffs, discs],
    get drawn() {
      return drawn;
    },
    get banks() {
      return banks;
    },
    reset: hide,
  };
}

// ---------------------------------------------------------------------------
// Gameplay data
// ---------------------------------------------------------------------------
function ringPoints(R) {
  const out = [];
  const c = Math.cos(R.rot);
  const s = Math.sin(R.rot);
  for (let i = 0; i < R.n; i++) {
    const th = (i / R.n) * TAU;
    const w = 1 + R.wob * Math.sin(3 * th + R.ph) + R.wob * 0.5 * Math.sin(5 * th + R.ph * 2);
    const u = R.rx * w * Math.cos(th);
    const v = R.rz * w * Math.sin(th);
    out.push({ x: r2(R.cx + u * c - v * s), z: r2(R.cz + u * s + v * c) });
  }
  return out;
}
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const L2 = dx * dx + dz * dz;
  const k = L2 > 1e-9 ? clamp01(((px - ax) * dx + (pz - az) * dz) / L2) : 0;
  return Math.hypot(px - (ax + dx * k), pz - (az + dz * k));
}
// The shortest distance from (x, z) to a closed polyline.
function loopDist(pts, x, z) {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    best = Math.min(best, segDist(x, z, a.x, a.z, b.x, b.z));
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
      if (loopPad > 0 && loops.some((L) => loopDist(L.points, x, z) < loopPad)) continue;
      cand.push({ x, z });
    }
  }
  return cand;
}
function computeSpawns(start, colliders, reefs, loops) {
  const opts = { dMin: 58, dMax: 92, rim: 16, colPad: 12, reefPad: 8, loopPad: 12 };
  let cand = openWater(start, colliders, reefs, loops, opts);
  if (cand.length < 12) cand = openWater(start, colliders, reefs, loops, { ...opts, loopPad: 0 });
  const ahead = { x: start.x + Math.sin(start.h) * 72, z: start.z + Math.cos(start.h) * 72 };
  return spreadOrder(cand, ahead, 12);
}
function computeCrates(start, colliders, reefs, loops) {
  const cand = openWater(start, colliders, reefs, loops, { dMin: 30, dMax: 100, rim: 20, colPad: 8, reefPad: 3, loopPad: 0 });
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
  const rng = typeof c0.rng === 'function' ? c0.rng : mulberry32(20261105);
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
  const rand = mulberry32(19851105); // fixed: the level always looks the same
  const noise = makeNoise(23);
  GEO = new Map();
  glowCache.clear();
  const root = new THREE.Group();
  root.name = 'env:mangroves';
  scene.add(root);
  const painted = new THREE.Group(); // terrain and wood (own shaders): one mesh each
  const props = new THREE.Group(); // everything else: baked into vertex colours
  root.add(painted, props);
  const own = [];
  const ownGeos = [];
  const timeU = { value: 0 };
  const ampU = { value: palette.waveAmp };
  const motionU = { value: reduced() ? 0 : 1 };
  const terrainMat = makeTerrainMaterial();
  const woodMat = makeWoodMaterial();
  own.push(terrainMat, woodMat);
  const colliders = [];
  const addCol = (x, z, r, h) => colliders.push({ x: r2(x), z: r2(z), r: r2(r), h: r2(h) });
  // every terrain sampler, for the props' ground height
  const samplers = [];
  const ground = (x, z) => {
    let h = -2.6;
    for (const s of samplers) {
      if (Math.abs(x - s.cx) > s.reach || Math.abs(z - s.cz) > s.reach) continue;
      h = Math.max(h, s.sample(x, z)[0]);
    }
    return h;
  };
  const wood = makeWoodBatch();
  const T = { props, wood, rand, ground, moss: [], reeds: [], flies: [], lanterns: [] };

  function terrain(isl) {
    const sample = isletSampler(isl, noise);
    mesh(painted, buildTerrainGeometry(isl, sample, noise), terrainMat);
    let cx = 0;
    let cz = 0;
    for (const L of isl.lumps) {
      cx += L[0] / isl.lumps.length;
      cz += L[1] / isl.lumps.length;
    }
    let reach = 0;
    for (const L of isl.lumps) reach = Math.max(reach, Math.hypot(L[0] - cx, L[1] - cz) + L[2] + 2);
    samplers.push({ sample, cx, cz, reach });
    return sample;
  }
  // A mangrove islet: the mud bank, its fringe of mangroves, knees round the shore; its colliders' height is the
  // tallest crown on each lump.
  function islet(isl, opts = {}) {
    const sample = terrain(isl);
    const lumps = isl.lumps;
    const area = lumps.reduce((s, l) => s + Math.PI * (l[2] - INSET) ** 2, 0);
    const n = isl.trees ?? Math.max(2, Math.min(8, Math.round(area / 24)));
    const s0 = isl.s ?? 1.1;
    const tops = lumps.map(() => 6);
    const placedT = [];
    const pick = () => {
      let t = rand() * area;
      for (let i = 0; i < lumps.length; i++) {
        t -= Math.PI * (lumps[i][2] - INSET) ** 2;
        if (t <= 0) return i;
      }
      return 0;
    };
    for (let i = 0, tries = 0; i < n && tries < 400; tries++) {
      const li = i === 0 ? 0 : pick();
      const [lx, lz, lr] = lumps[li];
      const a = rand() * TAU;
      const inner = i === 0 && !opts.noCentre;
      const d = inner ? rand() * 0.6 : (lr - INSET) * (0.4 + 0.5 * Math.sqrt(rand()));
      const x = lx + Math.cos(a) * d;
      const z = lz + Math.sin(a) * d;
      if (sample(x, z)[2] > -0.3) continue;
      if (opts.keepOut && opts.keepOut.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr)) continue;
      const s = s0 * (inner ? 1.15 : 0.82 + rand() * 0.3);
      if (placedT.some((p) => Math.hypot(p[0] - x, p[1] - z) < (p[2] + s) * 1.25)) continue;
      placedT.push([x, z, s]);
      const top = mangrove(T, x, z, s, { out: inner ? undefined : Math.atan2(z - lz, x - lx), tall: inner ? 1.25 : 1 });
      tops[li] = Math.max(tops[li], top);
      i++;
    }
    lumps.forEach(([x, z, r], i) => addCol(x, z, r, Math.max(6, opts.h ?? 0, tops[i] + 0.5)));
    // knees round the shore
    if (opts.knees !== false) {
      for (const [lx, lz, lr] of lumps) {
        const k = Math.round(lr * 0.6);
        for (let i = 0; i < k; i++) {
          const a = rand() * TAU;
          const d = lr - INSET + (rand() - 0.3) * 1.6;
          const x = lx + Math.cos(a) * d;
          const z = lz + Math.sin(a) * d;
          knees(T, x, z, Math.max(-0.2, sample(x, z)[0]), 1 + (i % 2), 0.5);
        }
      }
    }
    return sample;
  }

  // ----- the mangrove islets -----
  for (const isl of ISLETS) islet(isl);

  // ----- the Banyan Arch -----
  {
    const A = ARCH;
    const archY = (u) => A.footTop + (A.apex - A.footTop) * (1 - (2 * u - 1) ** 2);
    const tone = 0.55;
    // the bough: a thick main limb and two thinner ones braided round it
    const main = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      main.push(V3(A.x + (u - 0.5) * 2 * (A.half - 1.5), archY(u), A.z));
    }
    woodTube(T, main, (t) => A.bough + 0.9 * (2 * t - 1) ** 2, 12, tone);
    for (const [ph, dz, rr] of [[0, 1.5, 0.95], [Math.PI, -1.4, 0.8]]) {
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const u = i / 24;
        pts.push(V3(A.x + (u - 0.5) * 2 * (A.half - 1.2), archY(u) + 0.7 * Math.sin(u * Math.PI * 3 + ph), A.z + dz * Math.cos(u * Math.PI * 2 + ph)));
      }
      woodTube(T, pts, (t) => rr + 0.5 * (2 * t - 1) ** 2, 8, tone + 0.15);
    }
    // the feet: braided trunks rising out of a flare of great prop roots
    for (const side of [-1, 1]) {
      const fx = A.x + side * A.half;
      const fz = A.z;
      for (let k = 0; k < 5; k++) {
        const a0 = (k / 5) * TAU + side * 0.4;
        const pts = [];
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          const a = a0 + t * 1.6 * side;
          const rad = (2.6 + (k % 2) * 0.8) * (1 - t * 0.6);
          // they lean in toward the channel as they rise, meeting the bough's end
          pts.push(V3(fx + Math.cos(a) * rad - side * t * t * 2.2, -0.8 + t * (A.footTop + 0.5), fz + Math.sin(a) * rad));
        }
        woodTube(T, pts, (t) => (1.15 - 0.4 * t) * (k === 0 ? 1.25 : 1), 9, tone + (k % 3) * 0.12);
      }
      // the root flare
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * TAU + side * 0.2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const S = V3(fx + ca * 1.6, 3.2 + (k % 3) * 0.7, fz + sa * 1.6);
        const E = V3(fx + ca * (A.footR - 0.4), -0.7, fz + sa * (A.footR - 0.4));
        const Cc = V3(fx + ca * 4.2, 4.2 + (k % 2) * 0.6, fz + sa * 4.2);
        woodTube(T, bez(S, Cc, E, 10), (t) => 0.42 - 0.16 * t, 7, tone - 0.1);
      }
      // aerial roots hanging from the bough's ends to the water (all inside the foot's ring)
      for (let k = 0; k < 6; k++) {
        const u = side < 0 ? 0.04 + k * 0.018 : 0.96 - k * 0.018;
        const x = A.x + (u - 0.5) * 2 * (A.half - 1.5);
        const zz = A.z + (k % 2 ? 1 : -1) * (1.2 + (k % 3) * 0.7);
        const y0 = archY(u) - 1.2;
        const pts = [];
        for (let i = 0; i <= 6; i++) {
          const t = i / 6;
          pts.push(V3(x + 0.25 * Math.sin(t * 5 + k), y0 + (-0.6 - y0) * t, zz + 0.2 * Math.cos(t * 4 + k)));
        }
        woodTube(T, pts, (t) => 0.17 - 0.04 * t, 5, tone);
      }
      addCol(fx, fz, A.footR, 26);
      // knees and a few small mangroves crowding the foot
      knees(T, fx, fz, -0.2, 14, A.footR - 0.6, 1.2);
    }
    // the crown: a great canopy over the bough (its underside over the channel stays above the apex)
    const cr = mulberry32(0xba7a);
    for (let i = 0; i < 18; i++) {
      const a = cr() * TAU;
      const k = Math.sqrt(cr());
      const bx = A.x + Math.cos(a) * k * 25;
      const bz = A.z + Math.sin(a) * k * 9;
      const over = Math.abs(bx - A.x) < A.half - A.footR + 2;
      const r = 3.6 + cr() * 2.6;
      const by = A.apex + 2.2 + cr() * 4 - (over ? 0 : Math.max(0, Math.abs(bx - A.x) - 12) * 0.45);
      const yy = Math.max(by, over ? A.apex + r * 0.62 * 0.6 + 0.6 : 13 + r * 0.4);
      const b = mesh(props, leafGeo(i % 4), toon(C.leaf[i % C.leaf.length]), bx, yy, bz, cr() * TAU);
      b.scale.set(r, r * 0.62, r * (0.85 + cr() * 0.3));
      if (i < 6) {
        const c = mesh(props, leafGeo(3), toon(C.leafLit[i % 2]), bx + SUN_XZ[0] * r * 0.3, yy + r * 0.4, bz + SUN_XZ[1] * r * 0.3, cr() * TAU);
        c.scale.set(r * 0.6, r * 0.34, r * 0.58);
      }
      if (cr() < 0.55) T.moss.push({ x: bx + Math.cos(a) * r * 0.7, y: yy - r * 0.3, z: bz + Math.sin(a) * r * 0.7, len: over ? 1.0 : 1.6 + cr() * 2.2, w: 0.42 });
    }
    // moss curtains from the bough's underside: they never hang lower than 16 over the water
    for (let i = 0; i < 26; i++) {
      const u = 0.05 + (i / 25) * 0.9;
      const x = A.x + (u - 0.5) * 2 * (A.half - 1.5);
      const under = archY(u) - (A.bough + 0.9 * (2 * u - 1) ** 2) * 0.8;
      const overWater = Math.abs(x - A.x) < A.half - A.footR;
      const len = overWater ? Math.max(0.4, Math.min(2.2, under - 16.2)) : 1.6 + ((i * 7) % 5) * 0.5;
      T.moss.push({ x, y: under, z: A.z + ((i % 3) - 1) * 0.9, len, w: 0.36 });
    }
    // a row of paper lanterns along the bough's underside (the lowest at 16.5+)
    for (let i = 0; i < 7; i++) {
      const u = 0.29 + (i / 6) * 0.42;
      const x = A.x + (u - 0.5) * 2 * (A.half - 1.5);
      const under = archY(u) - (A.bough + 0.9 * (2 * u - 1) ** 2) * 0.85;
      paperLantern(T, x, under, A.z + (i % 2 ? 0.5 : -0.5), 1.35, C.lanterns[i % C.lanterns.length], 0.4);
    }
    T.flies.push({ x: A.x - A.half, y: 4, z: A.z, r: 6 }, { x: A.x + A.half, y: 4, z: A.z, r: 6 }, { x: A.x, y: 12, z: A.z, r: 7 });
  }

  // ----- the monkey temple -----
  {
    const P = TEMPLE;
    const face = Math.atan2(-4 - P.x, -44 - P.z); // toward the lagoon
    const fx = Math.sin(face);
    const fz = Math.cos(face);
    // the dock runs out of the temple's front (local +z) into the water; its moorings are a collider of their own
    const dockAt = (d) => [P.x + fx * d, P.z + fz * d];
    const keepOut = [[P.x, P.z, 10.5], [...dockAt(12), 3.4], [...dockAt(16), 3.4]];
    const isl = { lumps: P.lumps, bank: 1.6, hillH: 2.4, hillW: 5, res: 0.9 };
    const sample = islet(isl, { noCentre: true, keepOut, h: 17 });
    addCol(...dockAt(19), 6, 4);
    const h0 = sample(P.x, P.z)[0];
    const base = h0 - 0.4;
    const g = group(props, P.x, base, P.z, face);
    g.updateMatrixWorld(true);
    const L = (lx, ly, lz) => V3(lx, ly, lz).applyMatrix4(g.matrixWorld);
    // local height of the ground (or the water, 0) under a local point
    const gl = (lx, lz) => {
      const w = L(lx, 0, lz);
      return Math.max(0.05, sample(w.x, w.z)[0]) - base;
    };
    const wy = (y) => y - base; // a world height in the temple's frame
    const stone = (i) => toon(C.stone[((i % 3) + 3) % 3]);
    // a buried skirt so the slope never shows under the lowest tier, then the three tiers
    mesh(g, rbox(13.6, 3.0, 13.6, 0.3), stone(2), 0, -1.3, 0);
    const tiers = [[13, 2.4], [9.6, 2.3], [6.6, 2.2]];
    const tops = [];
    let y = 0;
    tiers.forEach(([w, h], i) => {
      mesh(g, rbox(w, h, w, 0.35), stone(i), 0, y + h / 2, 0);
      // moss on the ledge (a patch, not the whole ledge)
      const mm = mesh(g, rbox(w * 0.7, 0.2, w * 0.55, 0.1), toon(C.stoneMoss), (i - 1) * 1.1, y + h + 0.02, -w * 0.18 + i * 0.4);
      mm.rotation.y = 0.12 * (i - 1);
      // a band of slightly proud blocks across the front and the sides
      for (const [sxz, ry] of [[1, 0], [-1, Math.PI / 2], [1, Math.PI / 2]]) {
        for (let k = 0; k < 3; k++) {
          const off = (k - 1) * w * 0.31;
          const bl = mesh(g, rbox(w * 0.27, h * 0.4, 0.4, 0.12, 1), toon(C.stone[(i + k + 1) % 3]), 0, y + h * 0.34, 0);
          bl.rotation.y = ry;
          if (ry === 0) bl.position.set(off, y + h * 0.34, w / 2 + 0.05);
          else bl.position.set(sxz * (w / 2 + 0.05), y + h * 0.34, off);
        }
      }
      y += h;
      tops.push(y);
    });
    // the stair up the front, and paving down to the dock
    for (let k = 0; k < 11; k++) mesh(g, rbox(2.6, 0.5, 0.9, 0.1, 1), stone(k + 1), 0, 0.35 + k * 0.62, 7.1 - k * 0.45);
    for (let z = 7.9; z < 11.4; z += 0.95) mesh(g, rbox(3.0, 0.4, 0.9, 0.12, 1), stone(Math.round(z)), 0, gl(0, z) + 0.1, z);
    // the shrine with the monkey face
    const sh = group(g, 0, y, 0);
    mesh(sh, rbox(4.4, 3.2, 3.8, 0.3), stone(2), 0, 1.6, 0);
    mesh(sh, rbox(5.2, 0.6, 4.6, 0.2), stone(1), 0, 3.5, 0);
    mesh(sh, cyl(1.4, 1.9, 1.0, 12), stone(0), 0, 4.2, 0);
    mesh(sh, sphere(12, 8), stone(2), 0, 4.9, 0).scale.set(1.1, 0.9, 1.1);
    mesh(sh, cone(0.45, 1.3, 10), stone(1), 0, 6.1, 0);
    // the face: round, two big eyes, ears, a muzzle with a cheeky grin
    const f = group(sh, 0, 1.75, 1.92);
    mesh(f, cyl(1.35, 1.35, 0.3, 18), toon(C.carve)).rotation.x = Math.PI / 2;
    for (const sx of [-1, 1]) {
      mesh(f, cyl(0.55, 0.55, 0.28, 12), toon(C.carve), sx * 1.45, 0.35, -0.1).rotation.x = Math.PI / 2;
      mesh(f, cyl(0.38, 0.38, 0.12, 12), toon(C.socket), sx * 0.5, 0.3, 0.17).rotation.x = Math.PI / 2;
      mesh(f, sphere(8, 6), toon(C.carve), sx * 0.5, 0.36, 0.22).scale.setScalar(0.13);
      const brow = mesh(f, rbox(0.85, 0.2, 0.2, 0.08), stone(0), sx * 0.5, 0.78, 0.18);
      brow.rotation.z = sx * -0.25;
    }
    const muz = mesh(f, sphere(14, 9), toon(C.carve), 0, -0.45, 0.25);
    muz.scale.set(0.85, 0.55, 0.35);
    const grin = mesh(f, torus(0.42, 0.07, 5, 14, Math.PI), toon(C.socket), 0, -0.45, 0.55);
    grin.rotation.z = Math.PI;
    // broken columns either side of the paving, a fallen drum
    for (const sx of [-1, 1]) {
      const hh = sx < 0 ? 3.4 : 1.8;
      const gy = gl(sx * 3.4, 8.6);
      mesh(g, cyl(0.62, 0.7, hh, 12), stone(1), sx * 3.4, gy + hh / 2 - 0.1, 8.6);
      mesh(g, cyl(0.8, 0.8, 0.35, 12), stone(2), sx * 3.4, gy + hh + 0.05, 8.6);
    }
    const drum = mesh(g, cyl(0.62, 0.62, 1.4, 12), stone(0), 5.0, gl(5.0, 10.4) + 0.5, 10.4);
    drum.rotation.set(0, 0.6, Math.PI / 2);
    // tumbled blocks
    for (const [bx, bz, ry] of [[-7.4, 3, 0.4], [7.6, -2, 0.9], [-6.2, -6.5, 0.2]]) {
      const b = mesh(g, rbox(1.4, 0.9, 1.1, 0.15), stone(2), bx, gl(bx, bz) + 0.35, bz);
      b.rotation.set(0.15, ry, 0.1);
    }
    // strangler roots: from a fig on the shrine's roof, down the shrine's side and over each ledge to the ground
    const halfs = [6.5, 4.8, 3.3];
    const figL = V3(0.6, y + 3.8, -1.4);
    for (const [ux, uz] of [[-0.8, -0.6], [-1, -0.1], [-0.6, 0.8], [0.75, -0.66], [1, 0.2], [0.3, -1]]) {
      const l = Math.hypot(ux, uz);
      const dx = ux / l;
      const dz = uz / l;
      const m = Math.max(Math.abs(dx), Math.abs(dz));
      const e = (half) => half / m;
      const es = Math.min(2.2 / Math.max(Math.abs(dx), 1e-3), 1.9 / Math.max(Math.abs(dz), 1e-3));
      const at = (d, yy) => V3(figL.x + dx * d, yy, figL.z + dz * d);
      const pts = [figL.clone(), at(es + 0.15, y + 3.85), at(es + 0.35, y + 0.3), at(e(halfs[2]) - 0.1, tops[2] + 0.25), at(e(halfs[2]) + 0.25, tops[1] + 0.25),
        at(e(halfs[1]) - 0.1, tops[1] + 0.25), at(e(halfs[1]) + 0.25, tops[0] + 0.25), at(e(halfs[0]) - 0.1, tops[0] + 0.25), at(e(halfs[0]) + 0.45, 0.6), at(e(halfs[0]) + 1.4, gl(figL.x + dx * (e(halfs[0]) + 1.4), figL.z + dz * (e(halfs[0]) + 1.4)) - 0.3)];
      // two rounds of corner cutting, so the root bends round each ledge
      let path = pts;
      for (let it = 0; it < 2; it++) {
        const nx = [path[0]];
        for (let i = 0; i < path.length - 1; i++) nx.push(path[i].clone().lerp(path[i + 1], 0.25), path[i].clone().lerp(path[i + 1], 0.75));
        nx.push(path[path.length - 1]);
        path = nx;
      }
      woodTube(T, path.map((v) => v.applyMatrix4(g.matrixWorld)), (t) => 0.3 - 0.13 * t, 6, 0.3);
    }
    const fig = L(figL.x, figL.y, figL.z);
    mangrove(T, fig.x, fig.z, 1.2, { blobs: 4, wide: 1.1, roots: 0, base: fig.y - 1.6 });
    // the dock out into the water, with bollards; braziers at the foot of the paving
    const dockY = wy(0.5);
    for (let k = 0; k < 6; k++) mesh(g, rbox(3.2, 0.7, 1.9, 0.12, 1), stone(k), 0, dockY - 0.2, 11.8 + k * 1.95);
    for (const sx of [-1.35, 1.35]) for (const dz of [13, 17.4, 21.6]) mesh(g, cyl(0.2, 0.24, 0.8, 8), stone(2), sx, dockY + 0.45, dz);
    for (const sx of [-1, 1]) {
      const gy = gl(sx * 2.4, 10.6);
      mesh(g, cyl(0.42, 0.3, 1.1, 10), stone(0), sx * 2.4, gy + 0.5, 10.6);
      mesh(g, cyl(0.62, 0.42, 0.36, 12), toon(C.stoneDark), sx * 2.4, gy + 1.15, 10.6);
      mesh(g, sphere(10, 8), glow(C.fire), sx * 2.4, gy + 1.5, 10.6).scale.set(0.42, 0.55, 0.42);
      const p = L(sx * 2.4, gy + 1.55, 10.6);
      T.lanterns.push({ x: p.x, y: p.y, z: p.z, s: 1.3, col: C.fire });
    }
    const cp = L(0.9, dockY + 0.15, 13.6);
    coconuts(T, cp.x, cp.y, cp.z, 7);
    const bp = L(-0.9, dockY + 0.15, 15.4);
    bananas(T, bp.x, bp.y, bp.z);
    // the monkeys (on the ledges, the shrine's roof, the dock and the paving)
    const mk = [[3.2, tops[0], 5.6, 0.2, 0], [-4.0, tops[1], -2.0, -0.6, 2], [1.6, y + 3.8, 1.6, 0, 1], [-1.0, dockY + 0.15, 19.6, 0.4, 0], [4.4, gl(4.4, 9.3), 9.3, -0.3, 2]];
    for (const [mx, my, mz, ry, pose] of mk) {
      const p = L(mx, my, mz);
      monkey(T, p.x, p.y, p.z, face + ry, 1.1, pose);
    }
    const dk = L(0, 0, 12);
    T.flies.push({ x: P.x, y: h0 + 5, z: P.z, r: 9 }, { x: dk.x, y: 2.5, z: dk.z, r: 5 });
    T.templeDock = [dockAt(18.4), dockAt(20.9), dockAt(23.2)].map(([x, z], i) => ({ x: x + fz * (i === 1 ? 2.9 : -2.7), z: z - fx * (i === 1 ? 2.9 : -2.7) }));
    T.templeFace = face;
  }

  // ----- the stilt village -----
  {
    const V = VILLAGE;
    const isl = { lumps: [[V.x, V.z, V.isle]], bank: 1.0, hillH: 0.5, hillW: 2, res: 0.8 };
    const sample = terrain(isl);
    const y0 = 2.5;
    mangrove(T, V.x + 1.5, V.z + 1, 1.35, { tall: 1.45, moss: 3, roots: 5 });
    knees(T, V.x, V.z, -0.1, 12, V.isle - 1.4);
    // the village square: a round deck on posts round the old mangrove
    mesh(props, cyl(4.8, 4.8, 0.3, 24), toon(C.plank), V.x, y0 - 0.05, V.z);
    mesh(props, torus(4.8, 0.12, 5, 28), toon(C.plankDark), V.x, y0 + 0.08, V.z).rotation.x = Math.PI / 2;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      mesh(props, cyl(0.12, 0.14, y0 + 0.4, 6), toon(C.post), V.x + Math.cos(a) * 4.3, y0 / 2 - 0.25, V.z + Math.sin(a) * 4.3);
    }
    const huts = [];
    for (const deg of V.huts) {
      const a = deg * DEG;
      const hx = V.x + Math.cos(a) * V.ring;
      const hz = V.z + Math.sin(a) * V.ring;
      const face = Math.atan2(Math.cos(a), Math.sin(a)); // the door looks outward
      huts.push({ x: hx, z: hz, a, face });
      const g = group(props, hx, 0, hz, face);
      // stilts and braces
      for (const [px, pz] of [[-1.7, -1.5], [1.7, -1.5], [-1.7, 1.5], [1.7, 1.5], [0, 2.4]]) mesh(g, cyl(0.13, 0.16, y0 + 1.5, 7), toon(C.post), px, (y0 - 1.5) / 2, pz);
      for (const sx of [-1, 1]) {
        const br = mesh(g, cyl(0.06, 0.06, 3.0, 5), toon(C.post), sx * 1.7, y0 - 1.2, 0);
        br.rotation.x = 0.95;
      }
      // the deck and its porch
      mesh(g, rbox(4.0, 0.28, 3.6, 0.08, 1), toon(C.plank), 0, y0, 0);
      mesh(g, rbox(4.0, 0.22, 1.4, 0.06, 1), toon(C.plankDark), 0, y0 - 0.02, 2.4);
      // the woven walls with darker bands, the door, two glowing windows
      mesh(g, rbox(3.3, 2.1, 2.8, 0.14, 1), toon(C.woven), 0, y0 + 1.2, -0.2);
      for (const by of [0.55, 1.75]) mesh(g, rbox(3.4, 0.14, 2.9, 0.05, 1), toon(C.wovenDark), 0, y0 + by, -0.2);
      mesh(g, rbox(0.95, 1.5, 0.14, 0.06, 1), toon(C.door), 0, y0 + 0.9, 1.24);
      for (const sx of [-1, 1]) {
        mesh(g, rbox(0.62, 0.56, 0.1, 0.05, 1), glow(C.win), sx * 1.05, y0 + 1.35, 1.25);
        mesh(g, rbox(0.06, 0.6, 0.12, 0.02, 1), toon(C.door), sx * 1.05, y0 + 1.35, 1.29);
      }
      // the thatched roof: a deep four-sided cone with a darker underside and a tuft on top
      const roof = mesh(g, geo('roofCone', () => new THREE.ConeGeometry(3.25, 2.4, 4, 1)), toon(C.thatch), 0, y0 + 3.4, -0.2);
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(1.08, 1, 1);
      const under = mesh(g, geo('roofUnder', () => new THREE.ConeGeometry(3.1, 0.5, 4, 1, true)), toon(C.thatch2), 0, y0 + 2.3, -0.2);
      under.rotation.y = Math.PI / 4;
      under.scale.set(1.08, 1, 1);
      mesh(g, cone(0.35, 0.6, 6), toon(C.thatch2), 0, y0 + 4.75, -0.2);
      // a ladder down to the water, and a lantern at the porch corner
      for (const sx of [-0.4, 0.4]) {
        const rail = mesh(g, cyl(0.06, 0.06, 2.8, 5), toon(C.plankDark), sx, y0 - 1.1, 3.25);
        rail.rotation.x = -0.22;
      }
      for (let k = 0; k < 4; k++) {
        const rung = mesh(g, cyl(0.045, 0.045, 0.8, 5), toon(C.plankDark), 0, y0 - 0.15 - k * 0.66, 3.05 + k * 0.15);
        rung.rotation.z = Math.PI / 2;
      }
      g.updateMatrixWorld(true);
      const lp = V3(1.75, y0 + 2.2, 2.9).applyMatrix4(g.matrixWorld);
      mesh(g, cyl(0.07, 0.07, 2.6, 5), toon(C.post), 1.75, y0 + 1.2, 2.9);
      paperLantern(T, lp.x, lp.y, lp.z, 0.9, C.lanterns[huts.length % C.lanterns.length], 0.3);
      T.flies.push({ x: hx, y: y0 + 1.5, z: hz, r: 4 });
    }
    // plank walks: each hut to the island, and hut to hut
    const walk = (ax, az, bx, bz) => {
      const L = Math.hypot(bx - ax, bz - az);
      const ry = Math.atan2(bx - ax, bz - az);
      const n = Math.max(2, Math.round(L / 0.85));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const p = mesh(props, rbox(1.3, 0.12, 0.72, 0.04, 1), toon(k % 3 ? C.plank : C.plankDark), ax + (bx - ax) * t, y0 - 0.08 + 0.04 * Math.sin(k * 1.7), az + (bz - az) * t, ry);
        p.rotation.z = 0.03 * Math.sin(k * 2.3);
      }
      const posts = Math.max(1, Math.round(L / 2.6));
      for (let k = 0; k <= posts; k++) {
        const t = k / posts;
        for (const side of [-0.6, 0.6]) {
          const px = ax + (bx - ax) * t + Math.cos(ry) * side;
          const pz = az + (bz - az) * t - Math.sin(ry) * side;
          mesh(props, cyl(0.09, 0.11, y0 + 1.2, 6), toon(C.post), px, (y0 - 1.2) / 2 - 0.1, pz);
        }
      }
    };
    huts.forEach((h, i) => {
      const bx = h.x - Math.cos(h.a) * 2.2;
      const bz = h.z - Math.sin(h.a) * 2.2;
      walk(bx, bz, V.x + Math.cos(h.a) * 4.6, V.z + Math.sin(h.a) * 4.6);
      if (i > 0) {
        const p = huts[i - 1];
        const a1 = p.a + 0.16;
        const a2 = h.a - 0.16;
        walk(V.x + Math.cos(a1) * (V.ring - 0.3), V.z + Math.sin(a1) * (V.ring - 0.3), V.x + Math.cos(a2) * (V.ring - 0.3), V.z + Math.sin(a2) * (V.ring - 0.3));
        // a string of lanterns from eave to eave
        const dx = h.x - p.x;
        const dz = h.z - p.z;
        const dl = Math.hypot(dx, dz);
        const ra = V3(p.x + (dx / dl) * 2.9, y0 + 2.35, p.z + (dz / dl) * 2.9);
        const rb = V3(h.x - (dx / dl) * 2.9, y0 + 2.35, h.z - (dz / dl) * 2.9);
        const rope = sagPts(ra, rb, 0.55, 12);
        mesh(props, tubeAlong(rope, () => 0.035, 4), toon(C.rope));
        for (const k of [4, 8]) {
          const q = rope[k];
          paperLantern(T, q.x, q.y, q.z, 0.6, C.lanterns[(i + k) % C.lanterns.length], 0.15);
        }
      }
    });
    // a fishing net drying on poles, and a lantern pole on the island
    {
      const a = 300 * DEG;
      const nx = V.x + Math.cos(a) * (V.isle - 2);
      const nz = V.z + Math.sin(a) * (V.isle - 2);
      const hh = Math.max(0, sample(nx, nz)[0]);
      for (const d of [-1.4, 1.4]) mesh(props, cyl(0.08, 0.1, 2.6, 6), toon(C.post), nx + d * 0.7, hh + 1.3, nz + d * 0.7);
      const net = mesh(props, sphere(12, 6), toon(C.net), nx, hh + 1.7, nz, Math.PI / 4);
      net.scale.set(1.9, 0.75, 0.1);
      mesh(props, cyl(0.1, 0.12, 4.2, 7), toon(C.post), V.x - 3.6, 2.0, V.z + 1.2);
      paperLantern(T, V.x - 3.6, 4.1, V.z + 1.2, 1.0, C.lanterns[1], 0.2);
    }
    addCol(V.x, V.z, V.R, 9);
    T.villageHuts = huts;
  }

  // ----- the mud flats: reeds, knees, herons -----
  for (const f of FLATS) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + f.x * 0.1;
      reeds(T, f.x + Math.cos(a) * f.r * 0.86, f.z + Math.sin(a) * f.r * 0.86, 5, 1);
    }
    knees(T, f.x, f.z, -0.1, 10, f.r * 0.7, 0.9);
    for (let i = 0; i < f.herons; i++) {
      const a = i * 2.4 + f.z * 0.1;
      heron(T, f.x + Math.cos(a) * f.r * 0.35, 0.1, f.z + Math.sin(a) * f.r * 0.35, a + 1.2, 1.15);
    }
  }
  // reeds along a few shores too
  for (const isl of ISLETS.filter((_, i) => i % 3 === 0)) {
    const [lx, lz, lr] = isl.lumps[0];
    const a = rand() * TAU;
    reeds(T, lx + Math.cos(a) * (lr + 0.6), lz + Math.sin(a) * (lr + 0.6), 6, 1);
  }

  // ----- the rim forest, outside the arena (and a hazy second row behind it) -----
  {
    const rr = mulberry32(0x41a1);
    for (let deg = 0; deg < 360; deg += RIM.step) {
      if (deg > RIM.gap[0] && deg < RIM.gap[1]) continue;
      const a = (deg + (rr() - 0.5) * 4) * DEG;
      const R = RIM.r0 + rr() * (RIM.r1 - RIM.r0);
      const lr = RIM.lumpR[0] + rr() * (RIM.lumpR[1] - RIM.lumpR[0]);
      const x = Math.cos(a) * R;
      const z = Math.sin(a) * R;
      addCol(x, z, lr, 12);
      // a low mud bank under a row of big crowns, roots arching toward the arena
      const isl = { lumps: [[x, z, lr]], bank: 0.8, hillH: 0.3, res: 2.0 };
      terrain(isl);
      for (let k = 0; k < 2; k++) {
        const b = (k - 0.5) * 0.06;
        const px = Math.cos(a + b) * (R - k * 2.5);
        const pz = Math.sin(a + b) * (R - k * 2.5);
        mangrove(T, px, pz, 1.8 + rr() * 0.6, { lo: true, out: a + Math.PI, wide: 1.5, tall: 1.1, blobs: 2 });
      }
    }
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU + rr() * 0.1;
      const deg = ((a / DEG) % 360 + 360) % 360;
      if (deg > RIM.gap[0] + 6 && deg < RIM.gap[1] - 6) continue;
      const R = 205 + rr() * 30;
      const r = 13 + rr() * 8;
      const b = mesh(props, leafLo(i % 3), toon(C.leafFar[i % 3]), Math.cos(a) * R, 4 + r * 0.35, Math.sin(a) * R, rr() * TAU);
      b.scale.set(r * 1.5, r * 0.62, r);
      b.rotation.y = -a - Math.PI / 2;
    }
  }

  // ----- the shallows (mud flats; pale water under the village) -----
  const shallows = buildShallows(FLATS, [{ x: VILLAGE.x, z: VILLAGE.z, r: VILLAGE.R + 2 }], rand, timeU, ampU);
  root.add(shallows);
  own.push(shallows.material);
  ownGeos.push(shallows.geometry);

  // ----- moss and reeds (one swaying mesh) -----
  const sway = buildSway(T.moss, T.reeds, rand, timeU, motionU);
  root.add(sway);
  own.push(sway.material);
  ownGeos.push(sway.geometry);

  // ----- bake: the props into vertex colours, the painted parts merged per material -----
  const lineMat = vcMaterial(true);
  const flatMat = vcMaterial(false);
  const glowMat = glowVcMaterial();
  own.push(lineMat, flatMat, glowMat);
  bakeVC(props, { line: lineMat, flat: flatMat, glow: glowMat });
  // the terrain: every islet's mud bank merged into one mesh; the wood batch is one more
  {
    const list = painted.children.map((m) => m.geometry);
    painted.clear();
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    merged.computeBoundingSphere();
    const tm = new THREE.Mesh(merged, terrainMat);
    tm.name = 'mangroves-terrain';
    const wm = new THREE.Mesh(wood.build(), woodMat);
    wm.name = 'mangroves-wood';
    painted.add(tm, wm);
  }
  for (const grp of [painted, props]) {
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

  // ----- fireflies and the lanterns' halos -----
  const fr = mulberry32(0xf1ee);
  const flyList = [];
  {
    // little swarms: every few of the shady spots gets three or four
    const all = T.flies;
    const step = Math.max(1, Math.ceil(all.length / 42));
    const spots = all.filter((_, i) => i % step === 0);
    for (let i = 0; i < FIREFLY.n && spots.length; i++) {
      const sp = spots[i % spots.length];
      const a = fr() * TAU;
      const d = Math.sqrt(fr()) * sp.r;
      flyList.push({
        x: sp.x + Math.cos(a) * d,
        y: Math.max(1.0, sp.y + (fr() - 0.4) * 2.6),
        z: sp.z + Math.sin(a) * d,
        hz: FIREFLY.hz[0] + fr() * (FIREFLY.hz[1] - FIREFLY.hz[0]),
        ph: fr() * TAU,
        wander: FIREFLY.wander[0] + fr() * (FIREFLY.wander[1] - FIREFLY.wander[0]),
        size: FIREFLY.size[0] + fr() * (FIREFLY.size[1] - FIREFLY.size[0]),
      });
    }
  }
  const flies = buildGlows(flyList, 'mangroves-fireflies', { timeU, motionU, depth: 0.85, drift: 1, core: 0xf6ffa0, halo: 0xb6ff4a });
  root.add(flies);
  const haloList = T.lanterns.map((l) => ({
    x: l.x,
    y: l.y,
    z: l.z,
    hz: HALO.hz[0] + fr() * (HALO.hz[1] - HALO.hz[0]),
    ph: fr() * TAU,
    wander: 0,
    size: 1.25 * l.s,
  }));
  const halos = buildGlows(haloList, 'mangroves-halos', { timeU, motionU, depth: HALO.depth, drift: 0, core: 0x9a5a20, halo: 0xff9a40 });
  root.add(halos);
  own.push(flies.material, halos.material);
  ownGeos.push(flies.geometry, halos.geometry);

  // ----- lily pads, lotus and frogs (instanced, with ink twins) -----
  GEO = new Map(); // (the floaters', the rig's and the fog's source parts; disposed once all are built)
  const fl = buildFloaters(own, ownGeos, root);
  const lr = mulberry32(0x1117);
  const pads = [];
  const lotus = [];
  const frogs = [];
  for (const [cx, cz, R, n, nf, nl] of LILIES) {
    const here = [];
    for (let i = 0, tries = 0; i < n && tries < 80; tries++) {
      const a = lr() * TAU;
      const d = Math.sqrt(lr()) * R;
      const r = 0.45 + lr() * 0.6;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      if (here.some((p) => Math.hypot(p.x - x, p.z - z) < (p.r + r) * 0.92)) continue;
      const p = { x, z, r, ry: lr() * TAU, tint: 0.85 + lr() * 0.3, ph: lr() * TAU };
      here.push(p);
      pads.push(p);
      i++;
    }
    const big = here.slice().sort((a, b) => b.r - a.r);
    for (let i = 0; i < nf && i < big.length; i++) {
      const p = big[i];
      frogs.push({ pad: p, ry: lr() * TAU, s: 0.75 + lr() * 0.25, hz: CROAK_HZ[0] + lr() * (CROAK_HZ[1] - CROAK_HZ[0]), ph: lr() * TAU });
    }
    for (let i = 0; i < nl; i++) {
      const a = lr() * TAU;
      const d = R * (0.4 + lr() * 0.5);
      lotus.push({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, ry: lr() * TAU, s: 0.85 + lr() * 0.4, ph: lr() * TAU });
    }
  }
  const padK = fl.make('pads', padParts(), 0, pads.length);
  const lotusK = fl.make('lotus', lotusParts(), 0.04, lotus.length);
  const frogK = fl.make('frogs', frogParts(), 0.035, frogs.length);
  const tintC = new THREE.Color();
  pads.forEach((p, i) => padK.mesh.setColorAt(i, tintC.setRGB(p.tint * 0.95, p.tint, p.tint * 0.9)));
  if (padK.mesh.instanceColor) padK.mesh.instanceColor.needsUpdate = true;
  // the frogs' throats (no ink line)
  const sacGeo = new THREE.SphereGeometry(1, 10, 8);
  const sacMat = new THREE.MeshToonMaterial({ color: C.sac, gradientMap: gradientMap(3) });
  noOutline(sacMat);
  const sacs = new THREE.InstancedMesh(sacGeo, sacMat, Math.max(1, frogs.length));
  sacs.name = 'mangroves-croak';
  sacs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sacs.frustumCulled = false;
  sacs.userData.keep = true;
  sacs.count = frogs.length;
  root.add(sacs);
  own.push(sacMat);
  ownGeos.push(sacGeo);

  // ----- the egrets and the moored boats: one rig -----
  const rigPieces = [];
  const boats = [];
  const birds = [];
  for (let i = 0; i < T.templeDock.length; i++) {
    const p = T.templeDock[i];
    boats.push({ x: p.x, z: p.z, h: T.templeFace + (i - 1) * 0.35, first: rigPieces.length, ph: i * 1.7, s: 1 });
    rigPieces.push(jollyboatPiece(C.boatTrim[i % 3]));
  }
  for (let i = 0; i < 2; i++) {
    const h = T.villageHuts[i * 3];
    const a = h.a + 0.2;
    boats.push({ x: VILLAGE.x + Math.cos(a) * (VILLAGE.ring + 4.5), z: VILLAGE.z + Math.sin(a) * (VILLAGE.ring + 4.5), h: a + Math.PI / 2, first: rigPieces.length, ph: 3 + i, s: 1 });
    rigPieces.push(canoePiece());
  }
  for (const b of EGRETS) {
    birds.push({ ...b, first: rigPieces.length, ph: rng() * TAU });
    rigPieces.push(...egretPieces());
  }
  const rigMat = vcMaterial(true, THREE.DoubleSide);
  own.push(rigMat);
  const rig = buildRig(rigPieces, rigMat, 'mangroves-rig');
  root.add(rig.mesh);

  // ----- the fog banks (drawn from the hazards snapshot) -----
  const fog = createFogView(root, own, ownGeos, reduced, timeU, ampU, motionU);
  for (const g of GEO.values()) g.dispose();
  GEO = null;

  // ----- gameplay data -----
  const reefs = FLATS.map((f) => ({ x: f.x, z: f.z, r: f.r }));
  const playerStart = { ...START };
  const fogLoops = FOG_RINGS.map((R) => ({ id: R.id, points: ringPoints(R), closed: true }));
  const enemySpawns = computeSpawns(playerStart, colliders, reefs, fogLoops);
  const crateSpots = computeCrates(playerStart, colliders, reefs, fogLoops);

  const flyHz = flyList.map((f) => f.hz);
  const stats = {
    fireflies: flyList.length,
    fireflyHz: flyList.length ? [Math.min(...flyHz), Math.max(...flyHz)] : [0, 0],
    lanterns: haloList.length,
    // the fastest periodic change of any glow, sway or croak
    maxPulseHz: Math.max(...flyHz, ...haloList.map((h) => h.hz), ...SWAY_HZ, ...frogs.map((f) => f.hz), 0),
    flashes: 0, // this sea never flashes (SPEC3 §15)
    pads: pads.length,
    frogs: frogs.length,
    lotus: lotus.length,
    rigVertices: rig.vertices,
    fogBanks: 0,
    fogPuffs: 0,
    fogPuffsMax: FOG_VIEW.slots * FOG_VIEW.puffs,
  };

  const m4 = new THREE.Matrix4();
  const mA = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3(1, 1, 1);
  let disposed = false;
  let now = 0;
  function bob(x, z, t, amp, lift) {
    const y = waveHeight(x, z, t, amp) + lift;
    const sx = (waveHeight(x + 0.6, z, t, amp) - waveHeight(x - 0.6, z, t, amp)) / 1.2;
    const sz = (waveHeight(x, z + 0.6, t, amp) - waveHeight(x, z - 0.6, t, amp)) / 1.2;
    return [y, sx, sz];
  }
  function update(t, dt, fctx) {
    if (disposed) return;
    const step = finite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
    now = finite(t) ? t : now + step;
    const calm = reduced();
    timeU.value = now;
    motionU.value = calm ? 0 : 1;
    const amp = palette.waveAmp;
    // lily pads, lotus and frogs ride the swell
    pads.forEach((pd, i) => {
      const [y, sx, sz] = bob(pd.x, pd.z, now, amp, 0.05);
      pd.y = y;
      pd.sx = sx;
      pd.sz = sz;
      e.set(-sz * 0.8, pd.ry, sx * 0.8, 'XZY');
      q.setFromEuler(e);
      m4.compose(p.set(pd.x, y, pd.z), q, sc.set(pd.r, 1, pd.r));
      padK.mesh.setMatrixAt(i, m4);
    });
    lotus.forEach((lo, i) => {
      const [y, sx, sz] = bob(lo.x, lo.z, now, amp, 0.05);
      e.set(-sz * 0.8, lo.ry, sx * 0.8, 'XZY');
      q.setFromEuler(e);
      m4.compose(p.set(lo.x, y, lo.z), q, sc.setScalar(lo.s));
      lotusK.mesh.setMatrixAt(i, m4);
      lotusK.hull.setMatrixAt(i, m4);
    });
    frogs.forEach((f, i) => {
      const pd = f.pad;
      e.set(-(pd.sz ?? 0) * 0.8, f.ry, (pd.sx ?? 0) * 0.8, 'XZY');
      q.setFromEuler(e);
      m4.compose(p.set(pd.x, (pd.y ?? 0) + 0.04, pd.z), q, sc.setScalar(f.s));
      frogK.mesh.setMatrixAt(i, m4);
      frogK.hull.setMatrixAt(i, m4);
      // the throat puffs out and in (never under reduced motion)
      const k = calm ? 0 : Math.max(0, Math.sin(TAU * f.hz * now + f.ph)) ** 2;
      mA.makeTranslation(0, 0.22, 0.36);
      mA.premultiply(m4);
      const r = 0.04 + 0.17 * k;
      m4.makeScale(r, r * 0.85, r);
      mA.multiply(m4);
      sacs.setMatrixAt(i, mA);
    });
    for (const k of [padK, lotusK, frogK]) {
      k.mesh.instanceMatrix.needsUpdate = true;
      if (k.hull) k.hull.instanceMatrix.needsUpdate = true;
    }
    sacs.instanceMatrix.needsUpdate = true;
    // the boats bob at their moorings
    for (const b of boats) {
      const [y, sx, sz] = bob(b.x, b.z, now, amp, 0.12);
      e.set(-sz * 0.7 + 0.03 * Math.sin(now * 0.9 + b.ph), b.h, sx * 0.7, 'XZY');
      q.setFromEuler(e);
      m4.compose(p.set(b.x, y, b.z), q, sc.setScalar(b.s));
      rig.set(b.first, m4);
    }
    // egrets: wheeling, a few slow beats then a long glide
    for (const b of birds) {
      const a = b.ph + now * b.w;
      const x = b.c[0] + Math.cos(a) * b.r;
      const z = b.c[1] + Math.sin(a) * b.r;
      const dir = Math.sign(b.w);
      p.set(x, b.y + Math.sin(now * 0.5 + b.ph) * 1.2, z);
      e.set(0, Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir), 0.25 * dir, 'YXZ');
      q.setFromEuler(e);
      m4.compose(p, q, sc.setScalar(1.5));
      rig.set(b.first, m4);
      const glide = 0.5 + 0.5 * Math.sin(now * 0.6 + b.ph);
      const flap = glide > 0.5 ? 0.3 + 1.1 * Math.abs(Math.sin(now * 4.4 + b.ph)) : 0.55;
      mA.makeScale(1, flap, 1);
      rig.set(b.first + 1, mA.premultiply(m4));
    }
    rig.commit();
    // the fog banks
    const hz = fctx && typeof fctx === 'object' ? fctx.hazards : null;
    fog.update(now, step, hz && typeof hz === 'object' && Array.isArray(hz.fog) ? hz.fog : null, fctx && typeof fctx === 'object' ? fctx : null);
    stats.fogBanks = fog.banks;
    stats.fogPuffs = fog.drawn;
  }
  // the first frame's poses (a level's first render may come before its first update)
  update(0, 0, null);

  function warmables() {
    return fog.meshes.slice();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(root);
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
    fogLoops,
    warmables,
    stats,
    update,
    dispose,
    group: root,
  };
}

// Layout numbers for tests (read-only).
export const LAYOUT = Object.freeze({ fogClear: FOG_CLEAR, startClear: START_CLEAR, arch: ARCH, fireflies: FIREFLY, fogView: FOG_VIEW, pulseHzMax: PULSE_HZ_MAX });
