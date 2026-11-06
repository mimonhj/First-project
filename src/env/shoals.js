import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, setOutline, noOutline, mergeStatic, gradientMap, ensureIndex } from '../style.js';
import { waveHeight } from '../scenery.js';

// Level 12, "Shellback Shoals" (SPEC4 §2.5), the finale: a coral-pink sunset over golden sandbanks.
//
// Map (north = -z, east = +x; the sea is the disc of radius WORLD_R round 0,0):
// - in the middle of the bay sleeps the Shellback (LAIR): a crab-shaped island with a ruined fort on its back. The
//   crab itself is drawn by shellbackView.js (asleep it IS the island: shell, folded legs, eyes lying flat, the fort,
//   two little palms, its snore bubbles); this module draws its bed: a golden sandbank round it, dunes banked up
//   against its shell, beach grass, shells and a starfish, so the sleeping crab reads as an island in a sandbank.
//   It sleeps facing +z (shellback.js: heading 0 until it wakes), so you start in the south (START, 82 u off),
//   facing north up the bay at its face and its snores: the fly-in's first framing.
// - round the bay, outside the Shellback's arena (ARENA: open water, r 70 round the lair): the golden sandbanks of
//   the shoals: Whale Bank in the north (a whale's skeleton half-buried in the sand, its ribs arching up out of it),
//   Shell Isle in the north-east (a giant scallop standing on edge, a giant conch lying in the sand, palms), Palm Cay
//   in the east (palms, a giant clam with its pearl), South Bank behind the start (a starfish as big as a rowboat, an
//   upturned dinghy), Conch Bank in the west; tall sandstone sea stacks with gulls' nests in the north-west and two
//   more round the rim; and four low sea stacks for the Rock Forts (FORT_SPOTS: foesView.js draws the fort on top, at
//   y 4.3, on its own rocky crown, r 2.9; the stack under it is drawn here: its shoulder at y 2.62, r ≈ 2.75, and a
//   rocky dome above that stays inside the fort's crown).
// - gulls wheel over the stacks and banks, little red crabs scuttle sideways along the beaches; far islets with
//   palms and far sea stacks stand on the horizon (decoration).
//
// Gameplay data (fixed: the layout never depends on ctx.rng; checked by the harness and the smoke layout rules):
// - colliders: every sandbank lump (its shoreline is the same smooth union the terrain is built from), every sea
//   stack (the fort stacks included: r 4.4, h 3.6; main tests a ball against the fort, a pseudo target of r 3, before
//   the land). The lair is NOT a
//   collider (the Shellback is never land, SPEC4 §3.6.3): its bed is art only.
// - fortSpots: the four fort stacks' centres { x, z }, in order of preference (the first 35 u abeam of the start, so
//   wave 1's fort sights you soon after the fly-in; the second 48 u off; two spares far round the rim); each ≥ 30 u
//   from playerStart and ≥ 15 u from the lair.
// - tideBars: 4 sandbars, capsules { ax, az, bx, bz, r } (mechanics4.js makeBar), outside the arena by ≥ 6, never on
//   the start, each with open water all round it (a ring r + 9 round every bar clear of land by ≥ 3 u and inside
//   worldRadius − 10): a ship can always sail round either side.
// - shellbackLair { x, z, r: 12 } (the sleeping island's keep-off ring), shellbackArena { x, z, r: 70 } (open water
//   clear of every collider by ≥ 12 and of every tide bar by ≥ 6; checked at load, LAYOUT.checks).
// - enemySpawns: open water 58–95 from the start, clear of colliders by r + 12, of the bars by r + 6 and of the lair by
//   r + 10, inside worldRadius − 16, ordered so that any prefix is well spread (the first ahead of the start)
// - crateSpots: open water 30–100 from the start, clear of colliders by r + 8, of the bars by r + 3 and of the lair by
//   r + 8, inside worldRadius − 20, spread the same way
// - reefs: none (the ebb tide's bars are this sea's shallows)
//
// Hazards: update(t, dt, { simTime, camera, hazards }) draws the ebb tide of hazards.tide (mechanics4.js visuals():
// null at high tide, or { state: 'warning' | 'low' | 'fading', t, T, k, bars: [{ id, x, z, r }] }; bar id i + 1 is
// tideBars[i]). One mesh over all four bars (noOutline, riding the swell): at high tide a faint lighter patch of
// shallow water (where the bars are: no trap is hidden); in the warning pale water bubbling up over them; at low
// tide wet golden sand awash with a lacy foam rim; 'fading' (the Shellback woke) fades them out over its T and they
// stay gone. No hazards (or a paused game, which skips update) draws the high-tide look.
//
// The Shellback: setAwake(k = 1) (0..1, eased over EASE.awake s; a cut under reduced motion): the sand slides off the
// crab island: the dunes slump outward and slide into the sea, the bed sinks under the water and a cloud of stirred
// sand spreads round it and settles (shellbackView boils the bubbles); the tide's bars go for good. setCalm(k = 1)
// (eased over EASE.calm s, a cut under reduced motion): the sky eases to a golden evening (the shared sky, sea,
// clouds, lights and fog repainted from this level's palette, found by name among the scene's children) and a soft
// rainbow arc stands in the sky where the camera looked when the calm began (it follows the camera like the sky;
// opacity ≤ RAINBOW.alpha 0.35). With both at 0 nothing of the shared scenery is touched; dispose() puts the palette
// back.
//
// Photosensitivity (SPEC4 §15): nothing here flashes. The tide's bubbles each grow and pop over 1.6 s, out of step
// (no area brightens as one); the foam lace breathes at 0.11 Hz; the calm and the sand slide are slow eases (or one
// cut). Reduced motion (ctx.reducedMotion: a boolean or a function, else the media query): gulls and crabs hold
// still, the tide's bubbles and foam lace hold still, the sand slide and the calm cut.
//
// warmables() -> the hidden meshes to warm-draw (SPEC4 §11.2, §14): the tide, the sand cloud and the rainbow, each
// with at least one triangle on screen when drawn.
//
// Draw calls (both outline passes): the static scene is baked into a handful of meshes (the sandbanks' terrain and
// the sea stacks, painted per pixel by their own shaders; one vertex-coloured mesh for every plain prop and one for
// the few without an ink line), the bed (sand, dunes and its little props: 3 outlined meshes), the gulls and crabs
// (one mesh moved on the CPU), the tide (one mesh): the env alone is 16 calls (measured, both passes, the whole
// sea in view), +1 for the sand cloud while the sand settles and +1 for the rainbow once calm.
//
// build(scene, { rng, reducedMotion? }) -> { worldRadius, colliders, playerStart, enemySpawns, reefs, crateSpots,
//   tideBars, fortSpots, shellbackLair, shellbackArena, setAwake(k), setCalm(k), awake, calm (current, eased),
//   warmables() -> [Object3D], stats (read-only numbers for tests), update(t, dt, { simTime, camera, hazards }),
//   dispose(), group }

export const meta = {
  name: 'Shellback Shoals',
  subtitle: 'A coral-pink sunset over golden sandbanks. The island in the bay… snores.',
};

// The water mirrors a higher sun than the sky shows, on the same bearing (palette.waterSunDir, read by the shared
// ocean, as frost.js and doubloon.js do): the low sunset sun made the ocean paint a wide path of pale peach dashes
// that read as sandbars, and this sea's sandbars are a hazard a child must be able to tell apart. The sky's sun disc
// and the lights keep sunDir.
function higherSun([x, , z], y) {
  const k = Math.sqrt(1 - y * y) / Math.hypot(x, z);
  return [+(x * k).toFixed(4), y, +(z * k).toFixed(4)];
}

export const palette = {
  skyTop: 0x5a3a8a,
  skyHorizon: 0xffa88a,
  sunColor: 0xffc0a0,
  sunDir: [0.6, 0.2, -0.5],
  waterSunDir: higherSun([0.6, 0.2, -0.5], 0.62), // the sun the water mirrors (see higherSun)
  sunIntensity: 2.1,
  hemiSky: 0xffd8d0,
  hemiGround: 0x4a3a5a,
  hemiIntensity: 1.25,
  fogColor: 0xf0b8b0,
  fogNear: 110,
  fogFar: 360,
  waterDeep: 0x1a5a8a,
  waterShallow: 0x4fd0c8,
  waterFoam: 0xfff4ec,
  waveAmp: 0.7,
  cloudColor: 0xffd0e0,
  cloudShade: 0x7a5a8a,
  cloudCount: 14,
};

// What setCalm(1) paints over the palette (the rest of the palette stays): a golden evening, the same low sun.
const CALM = {
  skyTop: 0x6c62b4,
  skyHorizon: 0xffd68a,
  sunColor: 0xffe2a6,
  sunIntensity: 2.2,
  hemiSky: 0xffe8c4,
  hemiGround: 0x5a4a5c,
  hemiIntensity: 1.32,
  fogColor: 0xf8d6a4,
  fogNear: 130,
  fogFar: 390,
  waterDeep: 0x1d5f8a,
  waterShallow: 0x5cd8c4,
  waterFoam: 0xfff8e6,
  cloudColor: 0xffe4b4,
  cloudShade: 0xa8806e,
};
const EASE = { awake: 3, calm: 3 }; // seconds from 0 to 1 (a cut under reduced motion)
const RAINBOW = { alpha: 0.35, dist: 620, radius: 10.5, width: 0.16 }; // radius: degrees of arc; width: of the radius
const PULSE_HZ_MAX = 1; // SPEC4 §15: every glow pulses at 1 Hz or slower
const BUBBLE_T = 1.6; // s: a tide bubble grows and pops in this long
const FLASH_MAX = 0; // this sea never flashes

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
const WORLD_R = 150;
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const AMP = palette.waveAmp;
const r2 = (v) => Math.round(v * 100) / 100;
// the sleeping Shellback, and the open water round it where it may walk
const LAIR = { x: 0, z: -24, r: 12 };
const ARENA = { x: 0, z: -24, r: 70 };
const ARENA_CLEAR = 12; // every collider stays this far outside the arena (SPEC4 §2.5)
const BAR_CLEAR = 6; // every tide bar stays this far outside it
// map bearing (degrees clockwise from north) and distance from the lair -> { x, z }
const at = (bearing, r) => ({ x: r2(LAIR.x + r * Math.sin(bearing * DEG)), z: r2(LAIR.z - r * Math.cos(bearing * DEG)) });
const lump = (bearing, r, size) => {
  const p = at(bearing, r);
  return [p.x, p.z, size];
};
// in the south, 82 u off, facing north up the bay at the crab's face
const START = { x: 0, z: 58, h: Math.PI };
// the Rock Forts' sea stacks (fortSpots, in order of preference); STACK_R: the collider (the stack's foot)
const STACK_R = 4.4;
const FORT_TOP = 2.62; // the stack's flat top (foesView.js's fort root stands at y 4.3 on its own crown, r 2.9)
const FORT_SPOTS = [at(203, 90), at(149, 94), at(66, 98), at(293, 97)];
// the sandbanks: unions of lumps [x, z, r] (r = the shoreline = the collider)
const BANKS = {
  whale: { lumps: [lump(343, 99, 8), lump(356, 98, 10), lump(9, 99, 9.5), lump(21, 101, 7)], beach: 5.2, hillH: 0.4, hillW: 4, res: 0.8 },
  shell: { lumps: [lump(38, 106, 11), lump(47, 112, 7)], beach: 4.6, hillH: 0.9, hillW: 3, res: 0.75 },
  palm: { lumps: [lump(116, 106, 9), lump(125, 110, 6)], beach: 4.0, hillH: 0.8, hillW: 2.5, res: 0.75 },
  south: { lumps: [lump(174, 134, 10), lump(183, 133, 8)], beach: 4.8, hillH: 0.7, hillW: 3, res: 0.8 },
  conch: { lumps: [lump(250, 110, 10), lump(259, 116, 6.5)], beach: 4.6, hillH: 0.8, hillW: 3, res: 0.75 },
};
// tall sea stacks (scenery and colliders): [bearing, distance, foot radius, height]
const STACKS = [
  [320, 97, 4.6, 15],
  [327, 108, 3.6, 11],
  [313, 109, 3.2, 8.5],
  [93, 118, 3.4, 10],
  [214, 126, 3.8, 12],
];
// the ebb tide's sandbars (capsules: mechanics4.js makeBar's { ax, az, bx, bz, r })
const BARS = [
  [at(222, 88), at(236, 95), 5],
  [at(165, 104), at(181, 108), 5],
  [at(84, 88), at(99, 94), 4.5],
  [at(282, 84), at(272, 94), 4.5],
].map(([a, b, r]) => ({ ax: a.x, az: a.z, bx: b.x, bz: b.z, r }));
// far islets and stacks on the horizon (decoration, no colliders): [bearing from 0,0, distance, size]
const FAR_ISLES = [[18, 214, 9], [52, 236, 7], [128, 222, 8], [205, 238, 10], [238, 212, 6], [300, 228, 9], [336, 244, 7]];
const FAR_STACKS = [[34, 196, 4, 14], [72, 214, 3.5, 18], [150, 206, 3.2, 12], [262, 200, 4.2, 16], [318, 210, 3.6, 13]];

// The Shellback's model as shellbackView.js draws it asleep (its SHELL, STAND.low; facing +z): the bed's dunes bank up
// against this shell. Mirrored here (shellbackView.js is a view, not data): if its shell changes, change BED.shell.
const BED = {
  shell: { rx: 7.5, ry: 3.2, rz: 6.6, y: 3.1, z: -0.4, low: -2.6 },
  r: 11.2, // the sandbank's shoreline round the lair (inside the keep-off ring, r 12)
  top: 0.34, // its top over the sea's mean level
  sink: 1.7, // how far it sinks as the crab wakes
  // dunes banked against the shell: [bearing in the crab's frame (0 = its face, +z), distance, radius, height]
  dunes: [[58, 7.6, 2.5, 0.85], [102, 8.1, 2.8, 0.95], [146, 7.6, 2.6, 0.8], [196, 7.2, 2.4, 0.75], [252, 8.0, 2.8, 0.95], [300, 7.6, 2.5, 0.8]],
  slide: 4.5, // u each dune slides outward as it slumps into the sea
  cloud: { r0: 9, r1: 19, life: 7, alpha: 0.5 },
};

// ---------------------------------------------------------------------------
// Colours (cel-shaded materials from style.js; the props are baked into vertex colours)
// ---------------------------------------------------------------------------
const C = {
  sand: 0xf6d690, wetSand: 0xd9ad6c, grass: 0xa2b456, grass2: 0x8aa24a, grassInk: 0x3d4a1e,
  rockA: 0xb48c6c, rockB: 0x9a765e, rockWet: 0x5a4238, rockTop: 0xe2ca98,
  palmTrunk: 0xb27c4e, frond: [0x5fae45, 0x4a9440], coconut: 0x6e4424, tuft: 0xb0b25c, tuftDry: 0xc8b46a,
  bone: 0xf4e9d2, boneShade: 0xdccaa6, socket: 0x3a2e2a,
  scallop: 0xf7946e, scallopRib: 0xffdcc0, scallopEar: 0xee7c5a,
  conch: [0xfbe8cc, 0xf3b48e], conchLip: 0xff9fb1, conchKnob: 0xfff4e2,
  clam: 0xf0e4cc, clamRib: 0xd8c8ac, mantle: 0x48b8b0, mantleSpot: 0x9ae4d8, pearl: 0xfffaf2,
  star: [0xff7a3c, 0xe8607e, 0xffaa3a], starDot: 0xfff0d0, sandDollar: 0xf2e2c4, shells: [0xffd2bc, 0xf4a4b0, 0xfff0d8, 0xe9b98a],
  drift: 0xb9a68c, driftDark: 0x8c7a62, dinghy: 0x9a6a40, dinghyKeel: 0x5e3e26, oar: 0xc8a070,
  gull: 0xfcfcfa, gullWing: 0xc9ced8, gullTip: 0x2a2630, beak: 0xffb02a, leg: 0xff9a3a,
  crab: 0xe8503a, crabClaw: 0xf06a48, crabEye: 0x1c1626, nest: 0x9a7a4a, egg: 0xe8f0e8,
  farSand: 0xeac48c, farGreen: 0x7f9a52, farRock: 0x9a7e74,
  bedDune: 0xf8dc98, bedDuneDark: 0xe2bc78,
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
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const lerp = (a, b, k) => a + (b - a) * k;
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

// Shared vertex-coloured toon materials: the whole static prop scene bakes into one outlined mesh and one without an
// ink line.
function vcMaterial(outline) {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(3) });
  setOutline(m, outline);
  return m;
}

// Bake every plain mesh under `group` into vertex-coloured meshes: one with the ink line, one without. Meshes under a
// node with userData.keep are left alone. Written straight into two geometries (a level has a couple of thousand
// small props: copying and merging them one by one is slow).
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
    if (o.material.emissive && o.material.emissiveIntensity > 0) c.add(o.material.emissive.clone().multiplyScalar(o.material.emissiveIntensity * 0.6));
    const m4 = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const op = o.material.userData.outlineParameters;
    const kind = op && op.visible === false ? 'flat' : 'line';
    (parts[kind] || (parts[kind] = [])).push({ g, own: g !== o.geometry, m4, c });
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
      for (let i = 0; i < n; i++) {
        const x = pa.getX(i);
        const y = pa.getY(i);
        const z = pa.getZ(i);
        const o3 = (v0 + i) * 3;
        P[o3] = e[0] * x + e[4] * y + e[8] * z + e[12];
        P[o3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        P[o3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const a = na.getX(i);
        const b = na.getY(i);
        const cz = na.getZ(i);
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
// The sea's swell, mirrored for the shaders that ride it (the tide's bars, the sand cloud). scenery.js keeps its wave
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
const NOISE_GLSL = `float sHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float sNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), u.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`;
let wavesChecked = false;
function checkWaves() {
  if (wavesChecked) return;
  wavesChecked = true;
  for (const [x, z, t] of [[0, 0, 0], [13.7, -42.1, 3.3], [-97.2, 55.5, 41.9], [120.4, 8.8, 777.7], [-3.1, -131, 12345.6]]) {
    let h = 0;
    for (const w of SEA_WAVES) h += w.a * Math.sin(w.kx * x + w.kz * z - w.w * t + w.ph);
    if (Math.abs(h * AMP - waveHeight(x, z, t, AMP)) > 1e-6) {
      console.error('shoals.js: SEA_WAVES no longer matches the waves in scenery.js; update the mirror');
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Painted materials (own instances, never the shared toon cache)
// ---------------------------------------------------------------------------
// Terrain: uv.x = distance inland past the grass line (< 0 sand, > 0 dune grass), uv.y = patch noise. The colours are
// picked per pixel so the grass edge is crisp and gets a hand-drawn ink line; the sand darkens at the waterline and
// shows soft wind ripples.
function makeTerrainMaterial(name) {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(3) });
  m.name = name;
  setOutline(m, true);
  const U = {
    uSand: { value: new THREE.Color(C.sand) },
    uWet: { value: new THREE.Color(C.wetSand) },
    uGrass: { value: new THREE.Color(C.grass) },
    uGrass2: { value: new THREE.Color(C.grass2) },
    uInkCol: { value: new THREE.Color(C.grassInk) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vZone;\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZone = uv;\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vZone;\nvarying vec3 vWP;\nuniform vec3 uSand, uWet, uGrass, uGrass2, uInkCol;')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float gz = vZone.x;
        float fw = max(fwidth(gz), 1e-4);
        float grassK = smoothstep(-fw, fw, gz);
        float wy = vWP.y + 0.06 * sin(vWP.x * 1.3 + vWP.z * 0.9);
        float wfw = max(fwidth(wy), 1e-4);
        vec3 sandCol = mix(uWet, uSand, smoothstep(0.36 - wfw, 0.36 + wfw, wy));
        float rp = sin(dot(vWP.xz, vec2(0.71, 0.7)) * 2.1 + 1.1 * sin(vWP.x * 0.23 - vWP.z * 0.17));
        sandCol *= 1.0 - 0.05 * smoothstep(0.6, 0.9, rp) * smoothstep(0.5, 0.8, wy);
        float pn = vZone.y;
        float pfw = max(fwidth(pn), 1e-4);
        vec3 grassCol = mix(uGrass, uGrass2, smoothstep(0.6 - pfw, 0.6 + pfw, pn));
        vec3 tcol = mix(sandCol, grassCol, grassK);
        float ink = 1.0 - smoothstep(0.7 * fw, 1.5 * fw, abs(gz - 0.6 * fw));
        tcol = mix(tcol, uInkCol, ink * 0.9);
        vec4 diffuseColor = vec4(tcol, opacity);`,
      );
  };
  m.customProgramCacheKey = () => 'shoals-terrain-v1';
  return m;
}

// Sandstone: painted per pixel from world position and normal, so every rock shares one material: wobbly strata in
// two warm browns, a dark wet band at the waterline, pale sand and guano on the flat tops. uv.x = tone (0 dark ..
// 1 light), uv.y = how much of a top it may have (0 none .. 1).
function makeRockMaterial() {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(3) });
  m.name = 'shoals-rock';
  setOutline(m, true);
  const U = {
    uRockA: { value: new THREE.Color(C.rockA) },
    uRockB: { value: new THREE.Color(C.rockB) },
    uRockWet: { value: new THREE.Color(C.rockWet) },
    uTop: { value: new THREE.Color(C.rockTop) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRW;\nvarying vec3 vRN;\nvarying vec2 vRT;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRN = mat3(modelMatrix) * objectNormal;\nvRT = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRW;\nvarying vec3 vRN;\nvarying vec2 vRT;\nuniform vec3 uRockA, uRockB, uRockWet, uTop;')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec3 rn = normalize(vRN);
        float sy = (vRW.y + 0.22 * vRW.x - 0.12 * vRW.z + 0.45 * sin(vRW.x * 0.5 + vRW.z * 0.4) + 0.3 * sin(vRW.z * 0.9 - vRW.x * 0.6)) / 1.9;
        float tri = abs(fract(sy) - 0.5) * 2.0;
        float sfw = max(fwidth(sy) * 2.0, 1e-4);
        vec3 rc = mix(uRockA, uRockB, smoothstep(0.62 - sfw, 0.62 + sfw, tri) * 0.8);
        rc *= mix(0.86, 1.06, vRT.x);
        float wfw = max(fwidth(vRW.y), 1e-4);
        rc = mix(rc, uRockWet, (1.0 - smoothstep(0.55 - wfw, 0.55 + wfw, vRW.y + 0.14 * sin(vRW.x * 2.1 + vRW.z * 1.7))) * 0.82);
        float tn = rn.y + 0.12 * sin(vRW.x * 1.9) * sin(vRW.z * 2.3) - (1.0 - vRT.y) * 2.0;
        float tfw = max(fwidth(tn), 1e-4);
        rc = mix(rc, uTop, smoothstep(0.72 - tfw, 0.72 + tfw, tn));
        vec4 diffuseColor = vec4(rc, opacity);`,
      );
  };
  m.customProgramCacheKey = () => 'shoals-rock-v1';
  return m;
}
/** Tag a rock geometry with its tone and how much of a top it may have (read by the rock material through uv). */
function rockTag(g, tone, top = 0) {
  const n = g.attributes.position.count;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    uv[i * 2] = tone;
    uv[i * 2 + 1] = top;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// ---------------------------------------------------------------------------
// Terrain: sandbanks are unions of circles; their shoreline IS the collider set (the height field is built from the
// same smooth-min distance the ocean shader uses for its foam).
// isl: { lumps: [[x, z, r]], beach, hillH, hillW, res, far? }
// ---------------------------------------------------------------------------
function islandSampler(isl, noise) {
  const { lumps, beach, hillH, hillW } = isl;
  const beachTop = isl.far ? 1.2 : 1.0;
  const seed = lumps[0][0] * 0.37 + lumps[0][1] * 0.11;
  return (x, z) => {
    let sd = 1e4;
    for (const L of lumps) sd = smin(sd, Math.hypot(x - L[0], z - L[1]) - L[2], 4);
    const u = -sd;
    const bw = beach + (noise(x * 0.11 + seed, z * 0.11) - 0.5) * 1.8;
    const g = u - bw;
    let h;
    if (u <= 0) h = -Math.min(3.2, 0.42 * sd + 0.06 * sd * sd);
    else h = beachTop * (1 - Math.exp(-u * 0.38));
    if (g > 0) {
      h += 0.25 * smooth(0, 0.6, g);
      const k = Math.min(g / hillW, 1);
      h += hillH * (1 - Math.pow(1 - k, 2.6));
      h += (noise(x * 0.17 + 40, z * 0.17) - 0.45) * 0.45 * smooth(0, 3.5, g);
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
// Outward direction of a sandbank's shoreline at (x, z).
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
// A tuft of beach grass: thin blades fanning out of the sand.
function addTuft(parent, x, y, z, s, rng) {
  const blade = geo('blade', () => {
    const g = new THREE.ConeGeometry(0.07, 1, 4);
    g.translate(0, 0.5, 0);
    return g;
  });
  const n = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng() * 0.6;
    const lean = 0.25 + rng() * 0.45;
    const m = mesh(parent, blade, toon(rng() < 0.3 ? C.tuftDry : C.tuft), x + Math.cos(a) * 0.08, y - 0.05, z + Math.sin(a) * 0.08);
    m.rotation.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean);
    m.scale.set(s, s * (0.7 + rng() * 0.6), s);
  }
}
// A five-armed starfish lying on the sand (local +y up), r = arm length.
function starGeo() {
  return geo('star', () => {
    const sh = new THREE.Shape();
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * TAU + Math.PI / 2;
      const rr = i % 2 ? 0.42 : 1;
      if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.12, bevelSegments: 2 });
    g.rotateX(-Math.PI / 2);
    return g;
  });
}
function addStar(parent, x, y, z, s, rng, col) {
  const m = mesh(parent, starGeo(), toon(col ?? C.star[Math.floor(rng() * C.star.length)]), x, y, z, rng() * TAU);
  m.scale.set(s, s, s);
  m.rotation.x = (rng() - 0.5) * 0.12;
  return m;
}
// A little shell or sand dollar on the beach.
function addShell(parent, x, y, z, s, rng) {
  const k = rng();
  if (k < 0.35) {
    const m = mesh(parent, cyl(0.5, 0.5, 0.08, 14), toon(C.sandDollar), x, y, z, rng() * TAU);
    m.scale.setScalar(s);
    m.rotation.x = (rng() - 0.5) * 0.3;
  } else if (k < 0.7) {
    // a little scallop: a flattened half-dome with ribs
    const m = mesh(parent, geo('miniScallop', () => scallopGeo(1, 9, 0.35, 0.12)), toon(C.shells[Math.floor(rng() * C.shells.length)]), x, y, z, rng() * TAU);
    m.rotation.x = -Math.PI / 2 + 0.15;
    m.scale.setScalar(s * 0.55);
  } else {
    // a little spiral shell
    const m = mesh(parent, cone(0.3, 0.9, 9), toon(C.shells[Math.floor(rng() * C.shells.length)]), x, y + 0.1 * s, z, rng() * TAU);
    m.rotation.z = Math.PI / 2 - 0.2;
    m.scale.setScalar(s);
  }
}
// A bleached driftwood log with a stub of a branch.
function addDriftwood(parent, x, y, z, ry, s) {
  const g = group(parent, x, y, z, ry, s);
  const pts = [V3(-1.8, 0.05, 0.1), V3(-0.6, 0.12, -0.1), V3(0.6, 0.1, 0.05), V3(1.9, 0.02, -0.15)];
  mesh(g, tubeAlong(pts, (t) => 0.28 - 0.1 * t, 7), toon(C.drift));
  const br = [V3(0.2, 0.12, 0), V3(0.5, 0.3, 0.55), V3(0.6, 0.38, 1.1)];
  mesh(g, tubeAlong(br, (t) => 0.12 - 0.06 * t, 6), toon(C.driftDark));
  return g;
}

// A scallop's shell as a ribbed fan (the hinge at the origin, opening along +y, bulging toward +z): R radius, ribs
// the number of ribs, depth its bulge, back the back face's bulge. Closed (front and back meet at the rim).
function scallopGeo(R, ribs, depth, back = 0.18) {
  const NU = 12;
  const NV = ribs * 4;
  const span = 72 * DEG;
  const pos = [];
  const idx = [];
  const face = (sign, d) => {
    const base = pos.length / 3;
    for (let i = 0; i <= NU; i++) {
      const u = i / NU;
      for (let j = 0; j <= NV; j++) {
        const v = j / NV;
        const a = (v * 2 - 1) * span;
        // the scalloped rim: each rib reaches a little further than the groove beside it
        const rib = Math.cos(v * ribs * TAU);
        const rr = R * u * (1 + 0.035 * rib * u);
        const bulge = d * Math.sqrt(Math.max(0, 1 - u * u)) * Math.pow(u, 0.35) * (1 + 0.22 * rib * u);
        pos.push(rr * Math.sin(a), rr * Math.cos(a), sign * bulge);
      }
    }
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NV; j++) {
        const a = base + i * (NV + 1) + j;
        const b = a + 1;
        const c = a + NV + 1;
        const e = c + 1;
        if (sign > 0) idx.push(a, b, c, b, e, c);
        else idx.push(a, c, b, b, c, e);
      }
    }
  };
  face(1, depth * R);
  face(-1, back * R);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// A giant scallop standing on edge, half buried, its face toward `ry` (radians, the way it looks). About 7 u tall.
function addScallop(parent, x, y, z, ry, s) {
  const g = group(parent, x, y, z, ry, s);
  const R = 6.6;
  const body = mesh(g, geo('scallop', () => scallopGeo(R, 11, 0.24, 0.12)), toon(C.scallop), 0, -1.6, 0);
  body.rotation.x = -0.18;
  // cream ridges along the ribs' crests
  const ridge = (j) => {
    const ribs = 11;
    const v = (j + 0.5) / ribs;
    const a = (v * 2 - 1) * 72 * DEG;
    const pts = [];
    for (let i = 1; i <= 10; i++) {
      const u = 0.18 + (i / 10) * 0.8;
      const rr = R * u * 1.03;
      const bulge = 0.24 * R * Math.sqrt(Math.max(0, 1 - u * u)) * Math.pow(u, 0.35) * (1 + 0.22 * u) + 0.06;
      pts.push(V3(rr * Math.sin(a), rr * Math.cos(a), bulge));
    }
    return tubeAlong(pts, (t) => 0.2 * (1 - 0.5 * t) + 0.05, 5);
  };
  for (let j = 0; j < 11; j++) {
    const m = mesh(g, geo(`scallopRidge${j}`, () => ridge(j)), toon(C.scallopRib), 0, -1.6, 0);
    m.rotation.x = -0.18;
  }
  // the two ears at the hinge, buried a little
  for (const sd of [-1, 1]) {
    const e = mesh(g, rbox(1.6, 1.1, 0.5, 0.18), toon(C.scallopEar), sd * 0.95, -1.2, 0.1);
    e.rotation.set(-0.18, 0, sd * 0.25);
  }
  return g;
}
// A giant conch lying on its side in the sand: whorls stacked into a twisting spire with knobs on their shoulders,
// the flared pink lip. Lies along local +x (spire), about 7 long (× s).
function addConch(parent, x, y, z, ry, s) {
  const outer = group(parent, x, y, z, ry, s);
  const g = new THREE.Group();
  g.rotation.set(0, 0, -Math.PI / 2 + 0.12);
  outer.add(g);
  const whorls = [[3.15, 0.55, 0.62], [2.35, 1.5, 0.6], [1.68, 2.3, 0.58], [1.1, 2.95, 0.56], [0.66, 3.45, 0.55]];
  whorls.forEach(([r, wy, fy], k) => {
    const a = k * 1.25;
    const off = k === 0 ? 0 : 0.16 * r;
    const w = mesh(g, sphere(18, 10), toon(C.conch[k % 2]), Math.cos(a) * off, wy, Math.sin(a) * off);
    w.scale.set(r, r * fy, r);
    const nk = Math.max(5, Math.round(r * 2.6));
    const ks = Math.max(0.55, r / 2.1);
    for (let i = 0; i < nk; i++) {
      const b = (i / nk) * Math.PI * 2 + k * 0.4;
      const kn = mesh(g, cone(0.3 * ks, 0.7 * ks, 7), toon(C.conchKnob), Math.cos(a) * off + Math.cos(b) * r * 0.84, wy + r * fy * 0.5, Math.sin(a) * off + Math.sin(b) * r * 0.84);
      kn.rotation.set(Math.sin(b) * 1.05, 0, -Math.cos(b) * 1.05);
    }
  });
  mesh(g, cone(0.4, 0.9, 10), toon(C.conch[1]), 0.05, 4.1, 0.05);
  const mouth = new THREE.Group();
  mouth.position.set(0.55, 0.75, 2.7);
  mouth.rotation.set(-0.28, -0.22, 0);
  g.add(mouth);
  mesh(mouth, sphere(16, 10), toon(C.conchLip)).scale.set(1.25, 1.2, 0.5);
  mesh(mouth, geo('conchRim', () => new THREE.TorusGeometry(1, 0.2, 7, 22)), toon(C.conchKnob), 0, 0, 0.08).scale.set(1.3, 1.25, 1.3);
  return outer;
}
// A giant clam, open, a pearl inside: two ribbed half-shells with wavy rims, the lower one bedded in the sand.
function clamHalfGeo(flip) {
  return geo(`clamHalf${flip}`, () => {
    const g = new THREE.SphereGeometry(1, 28, 10, 0, TAU, Math.PI / 2, Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const a = Math.atan2(z, x);
      const rim = 1 - Math.min(1, -y); // 1 at the rim, 0 at the bottom
      // deep wavy folds that reach the rim
      const fold = 0.13 * Math.cos(a * 5) * Math.pow(rim, 1.5);
      p.setXYZ(i, x * (1 + 0.08 * Math.cos(a * 5)), (y + fold) * 0.55 * (flip ? -1 : 1), z * 0.82);
    }
    if (flip) g.index.array.reverse();
    return smoothGeo(g);
  });
}
function addClam(parent, x, y, z, ry, s) {
  const g = group(parent, x, y, z, ry, s);
  mesh(g, clamHalfGeo(0), toon(C.clam), 0, 0.15, 0).scale.set(2.2, 1.6, 2.2);
  // the mantle inside, teal with pale spots, and the pearl
  const mant = mesh(g, sphere(18, 8), toon(C.mantle), 0, 0.05, 0.1);
  mant.scale.set(1.85, 0.32, 1.55);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.3;
    const sp = mesh(g, sphere(7, 5), toon(C.mantleSpot, { outline: false }), Math.cos(a) * 1.1, 0.28, 0.1 + Math.sin(a) * 0.9);
    sp.scale.set(0.22, 0.06, 0.22);
  }
  mesh(g, sphere(16, 12), toon(C.pearl, { emissive: 0xfff2e0, emissiveIntensity: 0.25 }), 0.25, 0.75, 0.55).scale.setScalar(0.62);
  // the upper half, propped open
  const top = new THREE.Group();
  top.position.set(0, 0.2, -1.6);
  top.rotation.x = -0.95;
  g.add(top);
  mesh(top, clamHalfGeo(1), toon(C.clam), 0, 0, 1.6).scale.set(2.2, 1.6, 2.2);
  return g;
}

// The whale's skeleton half-buried along a sandbank: from `tail` to `head` ({ x, z }), y = sand height there.
function addWhale(parent, tail, head, sandAt) {
  const dx = head.x - tail.x;
  const dz = head.z - tail.z;
  const L = Math.hypot(dx, dz);
  const ux = dx / L;
  const uz = dz / L;
  const nx = -uz;
  const nz = ux;
  const P = (s, side = 0, y = 0) => {
    // a gently bowed spine
    const bow = Math.sin(s * Math.PI) * 1.2;
    const x = tail.x + ux * s * L + nx * (side + bow);
    const z = tail.z + uz * s * L + nz * (side + bow);
    return V3(x, sandAt(x, z) + y, z);
  };
  const bone = toon(C.bone);
  const shade = toon(C.boneShade);
  // the spine: vertebrae from the tail to the skull, bigger toward the middle
  const nVert = 22;
  for (let i = 0; i < nVert; i++) {
    const s = 0.04 + (i / (nVert - 1)) * 0.78;
    const p = P(s, 0, 0.15 + 0.55 * Math.sin(Math.min(1, s * 1.4) * Math.PI * 0.5));
    const k = 0.45 + 0.7 * Math.sin(Math.min(1, s * 1.25) * Math.PI * 0.55);
    const v = mesh(parent, rbox(0.9, 0.9, 0.7, 0.28), i % 2 ? shade : bone, p.x, p.y, p.z, Math.atan2(ux, uz));
    v.scale.setScalar(k);
    // the spinous process sticking up
    const sp = mesh(parent, cone(0.22, 0.9, 6), bone, p.x, p.y + 0.6 * k, p.z);
    sp.scale.setScalar(k);
  }
  // the ribs: pairs arching up out of the sand and curling in over the spine (their tips don't meet)
  const nRibs = 9;
  for (let i = 0; i < nRibs; i++) {
    const s = 0.34 + (i / (nRibs - 1)) * 0.38;
    const hk = Math.sin(((i + 0.8) / (nRibs + 0.6)) * Math.PI); // tallest in the middle
    const H = 4.2 + 3.2 * hk;
    const W = 2.6 + 1.6 * hk;
    for (const sd of [-1, 1]) {
      const a = P(s, sd * 0.7, 0.3);
      const c1 = P(s - 0.01, sd * (W + 2.2), H * 0.95);
      const b = P(s - 0.02, sd * (W * 0.12 + 0.5), H);
      const pts = bez(a, c1, b, 14);
      mesh(parent, tubeAlong(pts, (t) => 0.44 - 0.26 * t, 7), bone);
    }
  }
  // the skull: a broad wedge with two eye holes, the long jaws splayed on the sand ahead of it
  const sk = P(0.86, 0, 1.0);
  const skull = group(parent, sk.x, sk.y, sk.z, Math.atan2(ux, uz), 1.3);
  mesh(skull, sphere(18, 12), bone).scale.set(2.6, 1.35, 3.2);
  mesh(skull, sphere(14, 10), shade, 0, 0.55, -0.9).scale.set(2.0, 0.9, 1.8);
  for (const sd of [-1, 1]) mesh(skull, sphere(10, 8), toon(C.socket, { outline: false }), sd * 1.75, 0.35, 0.6).scale.set(0.45, 0.42, 0.55);
  // the rostrum (the long snout bone) and two jaws
  const sn = mesh(skull, cone(0.95, 6.2, 10), bone, 0, 0.1, 5.2);
  sn.rotation.x = Math.PI / 2;
  sn.scale.set(1, 1, 0.55);
  for (const sd of [-1, 1]) {
    const j0 = V3(sd * 1.7, -0.7, 0.6);
    const j1 = V3(sd * 2.6, -0.85, 4.2);
    const j2 = V3(sd * 1.6, -0.9, 8.4);
    mesh(skull, tubeAlong(bez(j0, j1, j2, 10), (t) => 0.5 - 0.28 * t, 7), shade);
  }
  return { skullTop: V3(sk.x, sk.y + 1.4, sk.z), ribTop: P(0.53, 0.8, 7.1) };
}

// A sea stack: a sandstone column in eroded tiers, leaning a little, its foot in a ring of tumbled boulders. flat:
// a fort stack (a low column with a rocky dome on top that the fort's own crown hides; FORT_TOP is its shoulder).
function stackGeo(R, H, seed, flat) {
  const noise = makeNoise(seed);
  const prof = flat
    ? [[R * 1.22, -2.2], [R * 1.1, -0.5], [R * 1.02, 0.6], [R * 0.94, 1.3], [R * 0.99, 1.9], [R * 0.93, 2.35], [R * 0.86, FORT_TOP], [2.3, 3.0], [1.6, 3.45], [0.8, 3.75], [0, 3.85]]
    : [[R * 1.28, -2.2], [R * 1.14, 0.2], [R * 1.02, H * 0.16], [R * 0.86, H * 0.22], [R * 0.97, H * 0.38], [R * 0.84, H * 0.52], [R * 0.9, H * 0.64], [R * 0.74, H * 0.8], [R * 0.66, H * 0.92], [R * 0.42, H * 0.985], [0, H]];
  const g = lathe(prof, 11);
  const p = g.attributes.position;
  const lean = (noise(3.3, 7.7) - 0.5) * 0.08;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    // chunky, uneven faces; the fort stack's dome keeps inside the fort's crown
    const dome = flat ? 1 - 0.6 * smooth(FORT_TOP - 0.2, FORT_TOP + 0.3, y) : 1;
    const k = 1 + dome * (0.16 * (noise(a * 1.6 + 3, y * 0.32) - 0.5) * 2 + 0.05 * Math.sin(y * 1.7 + a * 3));
    const sh = flat ? 0 : lean * Math.max(0, y);
    p.setXYZ(i, x * k + sh, y, z * k);
  }
  return smoothGeo(g);
}

// The bed's dunes: mounds banked against the sleeping crab's shell (art only, never a collider).
function shellTop(lx, lz) {
  // the sleeping shell's upper surface over the sea (shellbackView.js's SHELL, root at STAND.low), or -Infinity
  const S = BED.shell;
  const q = 1 - (lx / S.rx) ** 2 - ((lz - S.z) / S.rz) ** 2;
  return q > 0 ? S.low + S.y + S.ry * Math.sqrt(q) : -Infinity;
}
function bedTop(lx, lz, noise) {
  // the sandbank round the lair: flat on top, sloping into the sea at about BED.r (a wobbly shoreline)
  const r = Math.hypot(lx, lz);
  const a = Math.atan2(lz, lx);
  const edge = BED.r + 0.45 * Math.sin(3 * a + 1.1) + 0.3 * Math.sin(5 * a + 2.3) + 0.25 * (noise(lx * 0.3, lz * 0.3) - 0.5);
  const u = edge - r; // > 0 on the bank
  if (u >= 0) return BED.top * (1 - Math.exp(-u * 0.9)) + 0.06 * (noise(lx * 0.5 + 9, lz * 0.5) - 0.5);
  return -Math.min(1.6, 0.5 * -u + 0.08 * u * u);
}

// ---------------------------------------------------------------------------
// The ebb tide: one mesh over the four bars (noOutline, riding the swell, painted in the shader)
// ---------------------------------------------------------------------------
const TIDE_RINGS = [0, 0.3, 0.55, 0.75, 0.86, 0.93, 1.0, 1.06, 1.14];
function capsulePoint(b, d, k, nSide, nCap) {
  // the point at normalised distance d (× r) from the bar's centre line, at index k round its outline
  const ax = b.ax;
  const az = b.az;
  const dx = b.bx - ax;
  const dz = b.bz - az;
  const L = Math.hypot(dx, dz) || 1;
  const ux = dx / L;
  const uz = dz / L;
  const nx = -uz;
  const nz = ux;
  const R = b.r * d;
  // order: side +n from a to b, the cap round b, side -n from b to a, the cap round a
  const total = 2 * nSide + 2 * nCap;
  const i = ((k % total) + total) % total;
  if (i < nSide) {
    const t = i / nSide;
    return [ax + dx * t + nx * R, az + dz * t + nz * R];
  }
  if (i < nSide + nCap) {
    const ph = ((i - nSide) / nCap) * Math.PI; // from +n round the end to -n
    const cx = Math.cos(ph);
    const sx = Math.sin(ph);
    return [b.bx + (nx * cx + ux * sx) * R, b.bz + (nz * cx + uz * sx) * R];
  }
  if (i < 2 * nSide + nCap) {
    const t = (i - nSide - nCap) / nSide;
    return [b.bx - dx * t - nx * R, b.bz - dz * t - nz * R];
  }
  const ph = ((i - 2 * nSide - nCap) / nCap) * Math.PI; // from -n round the a end to +n
  const cx = Math.cos(ph);
  const sx = Math.sin(ph);
  return [ax + (-nx * cx - ux * sx) * R, az + (-nz * cx - uz * sx) * R];
}
function buildTide(bars, timeU, ampU) {
  const pos = [];
  const ext = [];
  const index = [];
  for (let bi = 0; bi < bars.length; bi++) {
    const b = bars[bi];
    const L = Math.hypot(b.bx - b.ax, b.bz - b.az);
    const nSide = Math.max(6, Math.round(L / 1.4));
    const nCap = 14;
    const total = 2 * nSide + 2 * nCap;
    const rows = [];
    for (const d of TIDE_RINGS) {
      const row = [];
      for (let k = 0; k < total; k++) {
        const [x, z] = capsulePoint(b, d, k, nSide, nCap);
        pos.push(x, 0, z);
        ext.push(d, bi);
        row.push(pos.length / 3 - 1);
      }
      rows.push(row);
    }
    for (let ri = 1; ri < rows.length; ri++) {
      const A = rows[ri - 1];
      const B = rows[ri];
      for (let k = 0; k < total; k++) {
        const k1 = (k + 1) % total;
        index.push(A[k], B[k], B[k1], A[k], B[k1], A[k1]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aExt', new THREE.Float32BufferAttribute(ext, 2));
  g.setIndex(index);
  g.computeBoundingSphere();
  const U = {
    uTime: timeU,
    uAmp: ampU,
    uLow: { value: 0 },
    uWarn: { value: 0 },
    uFade: { value: 1 },
    uStill: { value: 0 },
    uShelf: { value: new THREE.Color(0x9ff2e2) },
    uPale: { value: new THREE.Color(0xd8fff6) },
    uSand: { value: new THREE.Color(0xf6d89a) },
    uWet: { value: new THREE.Color(0xd8b076) },
  };
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, fog: true });
  m.name = 'shoals-tide';
  noOutline(m);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform float uAmp;
uniform float uLow;
attribute vec2 aExt;
varying vec2 vExt;
varying vec2 vWxz;
${WAVE_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vExt = aExt;
{
  vec2 wxz = (modelMatrix * vec4(position.x, 0.0, position.z, 1.0)).xz;
  vWxz = wxz;
  float far = abs(wxz.x - cameraPosition.x) + abs(wxz.y - cameraPosition.z);
  // the sand rises a little as the tide goes out (awash, never dry: the waves still wash over it)
  float rise = uLow * 0.16 * (1.0 - smoothstep(0.75, 1.0, aExt.x));
  transformed.y = waveH(wxz, uTime, uAmp) + 0.07 + rise + far * 0.0013;
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime, uLow, uWarn, uFade, uStill;
uniform vec3 uShelf, uPale, uSand, uWet;
varying vec2 vExt;
varying vec2 vWxz;
${NOISE_GLSL}
// a field of bubbles: each cell's bubble grows and pops in ${glslNum(BUBBLE_T)} s, out of step with its neighbours
float bubbles(vec2 p, float t, float cell) {
  vec2 c = floor(p / cell);
  vec2 f = fract(p / cell);
  float h = sHash(c);
  float life = uStill > 0.5 ? 0.45 + 0.3 * h : fract(t / ${glslNum(BUBBLE_T)} + h * 7.0);
  vec2 o = vec2(0.3 + 0.4 * sHash(c + 3.1), 0.3 + 0.4 * sHash(c + 7.7));
  float d = length(f - o) * cell;
  float r = 0.1 + 0.42 * life;
  float ring = 1.0 - smoothstep(0.035, 0.085, abs(d - r));
  float dot0 = 1.0 - smoothstep(r * 0.35, r * 0.55, d);
  return max(ring, dot0 * 0.55) * (1.0 - smoothstep(0.75, 1.0, life)) * step(0.25, h);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    float t = vExt.x;
    float fw = max(fwidth(t), 1e-4);
    float wob = uStill > 0.5 ? 0.0 : 0.02 * sin(vWxz.x * 1.1 + vWxz.y * 0.8 + uTime * 0.7) + 0.012 * sin(vWxz.x * 2.6 - vWxz.y * 2.2 - uTime * 0.4);
    float inside = 1.0 - smoothstep(1.0, 1.14, t);
    // high tide: a faint lighter patch of shallow water over the bar
    vec4 hi = vec4(uShelf, 0.26 * inside * (0.75 + 0.25 * (1.0 - smoothstep(0.6, 1.0, t))));
    // the warning: pale water, bubbling up over the bar
    float bub = max(bubbles(vWxz, uTime, 1.5), bubbles(vWxz + 0.75, uTime + 0.8, 1.9)) * (1.0 - smoothstep(0.92, 1.04, t));
    vec4 warn = vec4(mix(uPale, vec3(1.0), bub), (0.5 + 0.45 * bub) * inside);
    // low tide: wet golden sand awash, soft ripples, a lacy foam rim, the shelf round it
    float rp = sin(dot(vWxz, vec2(0.83, 0.56)) * 1.8 + 0.9 * sin(vWxz.x * 0.21 + vWxz.y * 0.13));
    float wetK = smoothstep(0.35, 0.8, t) + 0.25 * sNoise(vWxz * 0.6);
    vec3 sand = mix(uSand, uWet, clamp(wetK, 0.0, 1.0)) * (1.0 - 0.07 * smoothstep(0.55, 0.85, rp));
    float sandK = 1.0 - smoothstep(0.86 + wob - fw, 0.86 + wob + fw, t);
    float foam = smoothstep(0.86 + wob - fw, 0.86 + wob + fw, t) * (1.0 - smoothstep(0.97 + wob * 0.5 - fw, 0.97 + wob * 0.5 + fw, t));
    foam *= 0.75 + 0.25 * step(0.35, sNoise(vWxz * 1.7 + uTime * 0.05));
    vec4 low = mix(vec4(uShelf, 0.62 * inside), vec4(sand, 0.97), sandK);
    low = mix(low, vec4(1.0, 1.0, 1.0, 0.93), foam);
    vec4 col = mix(hi, warn, uWarn);
    col = mix(col, low, uLow);
    col.a *= uFade;
    if (col.a < 0.004) discard;
    diffuseColor = col;
  }`);
  };
  m.customProgramCacheKey = () => 'shoals-tide-v1';
  const me = new THREE.Mesh(g, m);
  me.name = 'shoals-tide';
  me.frustumCulled = false; // displaced on the GPU
  me.renderOrder = 2;
  return { mesh: me, U };
}

// ---------------------------------------------------------------------------
// The sand stirred up as the crab wakes: a soft cloud in the water round the lair (one disc, riding the swell)
// ---------------------------------------------------------------------------
function buildCloud(timeU, ampU) {
  const g = new THREE.CircleGeometry(1, 48, 0, TAU);
  g.rotateX(-Math.PI / 2);
  const U = { uTime: timeU, uAmp: ampU, uK: { value: 0 }, uR: { value: BED.cloud.r0 }, uCol: { value: new THREE.Color(0xe9cc8e) } };
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, fog: true });
  m.name = 'shoals-sandcloud';
  noOutline(m);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime, uAmp, uR;
varying vec2 vLoc;
varying vec2 vWxz;
${WAVE_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vLoc = position.xz;
transformed.xz *= uR;
{
  vec2 wxz = (modelMatrix * vec4(transformed.x, 0.0, transformed.z, 1.0)).xz;
  vWxz = wxz;
  transformed.y = waveH(wxz, uTime, uAmp) + 0.05;
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uK;
uniform vec3 uCol;
varying vec2 vLoc;
varying vec2 vWxz;
${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    float r = length(vLoc) + 0.22 * (sNoise(vWxz * 0.35) - 0.5) + 0.1 * (sNoise(vWxz * 1.1) - 0.5);
    float a = (1.0 - smoothstep(0.55, 1.0, r)) * uK * ${glslNum(BED.cloud.alpha)};
    if (a < 0.004) discard;
    diffuseColor = vec4(uCol, a);
  }`);
  };
  m.customProgramCacheKey = () => 'shoals-sandcloud-v1';
  const me = new THREE.Mesh(g, m);
  me.name = 'shoals-sandcloud';
  me.frustumCulled = false;
  me.renderOrder = 2;
  return { mesh: me, U };
}

// ---------------------------------------------------------------------------
// The calm's rainbow: a half ring of soft bands on the sky (it stays round the camera, like the sky)
// ---------------------------------------------------------------------------
const RAINBOW_VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const RAINBOW_FRAG = /* glsl */ `
uniform float uAlpha;
varying vec2 vP;
void main() {
  float r = length(vP);
  float a = atan(vP.y, vP.x); // 0 .. PI over the arc
  float w = ${glslNum(RAINBOW.width)};
  float u = (r - (1.0 - w)) / w; // 0 inside .. 1 outside
  // violet inside, red outside
  vec3 c0 = vec3(0.62, 0.48, 0.95);
  vec3 c1 = vec3(0.45, 0.62, 1.0);
  vec3 c2 = vec3(0.45, 0.9, 0.55);
  vec3 c3 = vec3(1.0, 0.93, 0.42);
  vec3 c4 = vec3(1.0, 0.66, 0.34);
  vec3 c5 = vec3(1.0, 0.42, 0.42);
  float k = clamp(u, 0.0, 1.0) * 5.0;
  vec3 col = mix(c0, c1, smoothstep(0.0, 1.0, k));
  col = mix(col, c2, smoothstep(1.0, 2.0, k));
  col = mix(col, c3, smoothstep(2.0, 3.0, k));
  col = mix(col, c4, smoothstep(3.0, 4.0, k));
  col = mix(col, c5, smoothstep(4.0, 5.0, k));
  float edge = smoothstep(0.0, 0.18, u) * (1.0 - smoothstep(0.82, 1.0, u));
  // it fades out toward the sea at both ends
  float ends = smoothstep(0.0, 0.32, a) * smoothstep(0.0, 0.32, 3.14159265 - a);
  float alpha = uAlpha * edge * ends;
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;
function buildRainbow() {
  const g = new THREE.RingGeometry(1 - RAINBOW.width, 1, 96, 2, 0, Math.PI);
  const m = new THREE.ShaderMaterial({
    name: 'shoals-rainbow',
    uniforms: { uAlpha: { value: 0 } },
    vertexShader: RAINBOW_VERT,
    fragmentShader: RAINBOW_FRAG,
    transparent: true,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  noOutline(m);
  const me = new THREE.Mesh(g, m);
  me.name = 'shoals-rainbow';
  me.frustumCulled = false;
  me.renderOrder = -1;
  return me;
}

// ---------------------------------------------------------------------------
// Critters on one rig: pieces moved on the CPU (one mesh, one draw call and its ink pass)
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
      base.set(q.geom.attributes.position.array, v0 * 3);
      baseN.set(q.geom.attributes.normal.array, v0 * 3);
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
  const pos = geom.attributes.position.array;
  const nor = geom.attributes.normal.array;
  const e = new Float32Array(16);
  return {
    mesh: m,
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
// A gull in two pieces: the body, then both wings (flapped by scaling). Local +z = forward.
function gullPieces() {
  const body = new THREE.Group();
  const b = mesh(body, sphere(9, 6), toon(C.gull));
  b.scale.set(0.3, 0.3, 0.66);
  mesh(body, sphere(7, 5), toon(C.gull), 0, 0.16, 0.5).scale.setScalar(0.23);
  const bk = mesh(body, cone(0.07, 0.36, 6), toon(C.beak), 0, 0.14, 0.78);
  bk.rotation.x = Math.PI / 2;
  const tl = mesh(body, cone(0.16, 0.5, 5), toon(C.gull), 0, 0.02, -0.8);
  tl.rotation.x = -Math.PI / 2;
  tl.scale.set(1, 1, 0.4);
  const wings = new THREE.Group();
  for (const side of [1, -1]) {
    const inner = mesh(wings, sphere(9, 5), toon(C.gullWing), side * 0.52, 0.12, 0.04);
    inner.scale.set(0.55, 0.06, 0.32);
    inner.rotation.z = side * 0.38;
    const outer = mesh(wings, sphere(9, 5), toon(C.gullWing), side * 1.5, 0.17, -0.12);
    outer.scale.set(0.6, 0.05, 0.23);
    outer.rotation.order = 'YXZ';
    outer.rotation.y = side * 0.3;
    outer.rotation.z = -side * 0.32;
    const tip = mesh(wings, sphere(7, 4), toon(C.gullTip), side * 2.02, 0.05, -0.24);
    tip.scale.set(0.24, 0.045, 0.14);
    tip.rotation.z = -side * 0.32;
  }
  return [body, wings];
}
// A little red crab (one piece): a round body, two raised claws, eyes on stalks, legs. Walks sideways (local x).
function crabPiece() {
  const g = new THREE.Group();
  mesh(g, sphere(10, 7), toon(C.crab), 0, 0.22, 0).scale.set(0.42, 0.2, 0.32);
  for (const sd of [-1, 1]) {
    const arm = mesh(g, cyl(0.04, 0.05, 0.3, 5), toon(C.crab), sd * 0.3, 0.3, 0.26);
    arm.rotation.set(0.6, 0, -sd * 0.7);
    mesh(g, sphere(8, 6), toon(C.crabClaw), sd * 0.42, 0.42, 0.38).scale.set(0.15, 0.12, 0.13);
    const st = mesh(g, cyl(0.02, 0.02, 0.16, 4), toon(C.crab), sd * 0.11, 0.42, 0.2);
    st.rotation.x = 0.2;
    mesh(g, sphere(6, 4), toon(C.crabEye), sd * 0.11, 0.51, 0.22).scale.setScalar(0.05);
    for (let k = 0; k < 3; k++) {
      const leg = mesh(g, cyl(0.025, 0.03, 0.42, 4), toon(C.crab), sd * 0.42, 0.13, -0.15 + k * 0.14);
      leg.rotation.z = sd * 1.05;
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// Layout checks and the spread-out spots
// ---------------------------------------------------------------------------
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const L = dx * dx + dz * dz;
  const t = L > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
const barGap = (b, x, z) => segDist(x, z, b.ax, b.az, b.bx, b.bz) - b.r;
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
function openWater(start, colliders, { dMin, dMax, rim, colPad, barPad, lairPad }) {
  const cand = [];
  for (let x = -WORLD_R; x <= WORLD_R; x += 3) {
    for (let z = -WORLD_R; z <= WORLD_R; z += 3) {
      if (Math.hypot(x, z) > WORLD_R - rim) continue;
      const ds = Math.hypot(x - start.x, z - start.z);
      if (ds < dMin || ds > dMax) continue;
      if (colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + colPad)) continue;
      if (BARS.some((b) => barGap(b, x, z) < barPad)) continue;
      if (Math.hypot(x - LAIR.x, z - LAIR.z) < LAIR.r + lairPad) continue;
      cand.push({ x, z });
    }
  }
  return cand;
}
function computeSpawns(start, colliders) {
  const cand = openWater(start, colliders, { dMin: 58, dMax: 95, rim: 16, colPad: 12, barPad: 6, lairPad: 10 });
  const ahead = { x: start.x + Math.sin(start.h) * 72, z: start.z + Math.cos(start.h) * 72 };
  return spreadOrder(cand, ahead, 12);
}
function computeCrates(start, colliders) {
  const cand = openWater(start, colliders, { dMin: 30, dMax: 100, rim: 20, colPad: 8, barPad: 3, lairPad: 8 });
  // the first crate a little ahead and to the side of the start
  const first = { x: start.x + Math.sin(start.h + 0.7) * 42, z: start.z + Math.cos(start.h + 0.7) * 42 };
  return spreadOrder(cand, first, 8);
}
// The rules of SPEC4 §2.5 on this layout (the harness and a test read them: LAYOUT.checks(env)).
function layoutChecks(colliders, playerStart, fortSpots) {
  const out = { arenaColliderGap: Infinity, arenaBarGap: Infinity, barStartGap: Infinity, barRingLand: Infinity, barRingEdge: Infinity, fortStart: Infinity, fortLair: Infinity, problems: [] };
  for (const c of colliders) {
    const gap = Math.hypot(c.x - ARENA.x, c.z - ARENA.z) - c.r - ARENA.r;
    out.arenaColliderGap = Math.min(out.arenaColliderGap, gap);
  }
  for (const b of BARS) {
    out.arenaBarGap = Math.min(out.arenaBarGap, barGap(b, ARENA.x, ARENA.z) - ARENA.r);
    out.barStartGap = Math.min(out.barStartGap, barGap(b, playerStart.x, playerStart.z));
    // a ring r + 9 round the bar: open water a ship can sail round it on (either side)
    const L = Math.hypot(b.bx - b.ax, b.bz - b.az);
    const nSide = Math.max(6, Math.round(L / 1.4));
    const total = 2 * nSide + 28;
    for (let k = 0; k < total; k++) {
      const [x, z] = capsulePoint(b, (b.r + 9) / b.r, k, nSide, 14);
      for (const c of colliders) out.barRingLand = Math.min(out.barRingLand, Math.hypot(x - c.x, z - c.z) - c.r);
      out.barRingEdge = Math.min(out.barRingEdge, WORLD_R - Math.hypot(x, z));
    }
  }
  for (const f of fortSpots) {
    out.fortStart = Math.min(out.fortStart, Math.hypot(f.x - playerStart.x, f.z - playerStart.z));
    out.fortLair = Math.min(out.fortLair, Math.hypot(f.x - LAIR.x, f.z - LAIR.z));
  }
  if (out.arenaColliderGap < ARENA_CLEAR) out.problems.push(`a collider is ${out.arenaColliderGap.toFixed(2)} from the arena`);
  if (out.arenaBarGap < BAR_CLEAR) out.problems.push(`a tide bar is ${out.arenaBarGap.toFixed(2)} from the arena`);
  if (out.barStartGap < 10) out.problems.push('a tide bar is on the start');
  if (out.barRingLand < 3 || out.barRingEdge < 10) out.problems.push('a tide bar has no water to sail round it');
  if (out.fortStart < 30 || out.fortLair < 15) out.problems.push('a fort spot is too near the start or the lair');
  return out;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
export function build(scene, ctx = {}) {
  checkWaves();
  // prefers-reduced-motion: ctx.reducedMotion (a boolean, or a function read every frame), else the media query
  const reduced = () => {
    try {
      if (typeof ctx.reducedMotion === 'function') return !!ctx.reducedMotion();
      if (typeof ctx.reducedMotion === 'boolean') return ctx.reducedMotion;
      return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    } catch {
      return false;
    }
  };
  const rand = mulberry32(0x5e11ba7c); // fixed: the level always looks the same
  const noise = makeNoise(23);
  GEO = new Map();
  const root = new THREE.Group();
  root.name = 'env:shoals';
  scene.add(root);
  const painted = new THREE.Group(); // terrain and rock (own shaders), merged per material
  const props = new THREE.Group(); // everything else: baked into vertex colours
  root.add(painted, props);
  const own = [];
  const ownGeos = [];
  const timeU = { value: 0 };
  const ampU = { value: AMP };
  const terrainMat = makeTerrainMaterial('shoals-terrain');
  const rockMat = makeRockMaterial();
  own.push(terrainMat, rockMat);
  const colliders = [];
  const addCol = (x, z, r, h) => colliders.push({ x: r2(x), z: r2(z), r: r2(r), h: r2(h) });
  const perch = []; // where gulls stand (baked into the props)

  // ----- sandbanks: terrain, colliders, palms, grass and shells -----
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
        addCol(x, z, r, Math.min(12, Math.max(3, hMax + (opts.tall ?? 6))));
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
    const spot = () => {
      const [lx, lz, lr] = pick();
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * lr;
      return [lx + Math.cos(a) * d, lz + Math.sin(a) * d];
    };
    // leaning palms along the beach, leaning out over the sea
    for (let i = 0, tries = 0; i < (opts.palms || 0) && tries < 600; tries++) {
      const [x, z] = spot();
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
    if (lo) return;
    // beach grass on the dunes and the upper beach
    for (let i = 0, tries = 0; i < (opts.tufts || 0) && tries < 500; tries++) {
      const [x, z] = spot();
      const [h, g, sd] = sample(x, z);
      if (sd > -2 || h < 0.55 || g < -1.2) continue;
      if (!free(x, z, 0.8)) continue;
      placed.push([x, z, 0.8]);
      addTuft(props, x, h, z, 0.75 + rand() * 0.6, rand);
      i++;
    }
    // shells, sand dollars and starfish on the beach
    for (let i = 0, tries = 0; i < (opts.shells || 0) && tries < 500; tries++) {
      const [x, z] = spot();
      const [h, g, sd] = sample(x, z);
      if (sd > -0.6 || g > -0.5 || h < 0.25) continue;
      if (!free(x, z, 0.6)) continue;
      placed.push([x, z, 0.6]);
      if (rand() < 0.25) addStar(props, x, h + 0.02, z, 0.42 + rand() * 0.2, rand);
      else addShell(props, x, h + 0.04, z, 0.6 + rand() * 0.5, rand);
      i++;
    }
    // driftwood
    for (let i = 0, tries = 0; i < (opts.drift || 0) && tries < 200; tries++) {
      const [x, z] = spot();
      const [h, g, sd] = sample(x, z);
      if (sd > -1.0 || g > -0.3 || h < 0.3) continue;
      if (!free(x, z, 2)) continue;
      placed.push([x, z, 2]);
      addDriftwood(props, x, h, z, rand() * TAU, 0.8 + rand() * 0.4);
      i++;
    }
  }
  const bankSample = {};
  // the whale's bank in the north: the skeleton lies along it
  {
    const isl = BANKS.whale;
    const sample = island(isl, { tall: 7 });
    bankSample.whale = sample;
    const L = isl.lumps;
    const tail = { x: L[0][0] + 1.5, z: L[0][1] + 1.0 };
    const head = { x: L[3][0] - 2.5, z: L[3][1] + 1.5 };
    const w = addWhale(props, tail, head, (x, z) => Math.max(-0.4, sample(x, z)[0] - 0.55));
    perch.push(w.skullTop, w.ribTop);
    decorate(isl, sample, { palms: 3, tufts: 16, shells: 10, drift: 2, palmInland: 1, keepOut: [[(tail.x + head.x) / 2, (tail.z + head.z) / 2, 13], [head.x, head.z, 7]] });
  }
  // Shell Isle in the north-east: a giant scallop on edge facing the bay, a giant conch lying in the sand
  {
    const isl = BANKS.shell;
    const sample = island(isl, { tall: 8 });
    bankSample.shell = sample;
    const [cx, cz] = isl.lumps[0];
    const face = Math.atan2(LAIR.x - cx, LAIR.z - cz);
    const sx = cx + Math.sin(face) * 1.5 - Math.cos(face) * 2.5;
    const sz = cz + Math.cos(face) * 1.5 + Math.sin(face) * 2.5;
    addScallop(props, sx, sample(sx, sz)[0], sz, face, 1);
    const kx = cx + Math.sin(face + 2.2) * 5.2;
    const kz = cz + Math.cos(face + 2.2) * 5.2;
    addConch(props, kx, sample(kx, kz)[0] + 0.9, kz, face + 0.9, 1.1);
    decorate(isl, sample, { palms: 6, tufts: 14, shells: 12, drift: 1, keepOut: [[sx, sz, 5], [kx, kz, 5]] });
  }
  // Palm Cay in the east: palms and a giant clam with its pearl
  {
    const isl = BANKS.palm;
    const sample = island(isl, { tall: 8 });
    bankSample.palm = sample;
    const [cx, cz] = isl.lumps[0];
    const face = Math.atan2(LAIR.x - cx, LAIR.z - cz);
    const qx = cx + Math.sin(face) * 3.6;
    const qz = cz + Math.cos(face) * 3.6;
    addClam(props, qx, sample(qx, qz)[0] - 0.25, qz, face, 1.1);
    decorate(isl, sample, { palms: 9, tufts: 12, shells: 10, drift: 1, keepOut: [[qx, qz, 3.6]] });
  }
  // South Bank, behind the start: a starfish as big as a rowboat, an upturned dinghy
  {
    const isl = BANKS.south;
    const sample = island(isl, { tall: 7 });
    bankSample.south = sample;
    const [cx, cz] = isl.lumps[0];
    const sx = cx - 2;
    const sz = cz - 3.5;
    addStar(props, sx, sample(sx, sz)[0] + 0.05, sz, 2.4, rand, C.star[0]);
    const [dx, dz] = [isl.lumps[1][0] + 1, isl.lumps[1][1] - 2.5];
    const dg = group(props, dx, sample(dx, dz)[0] + 0.15, dz, 0.6);
    const hull = mesh(dg, sphere(16, 8), toon(C.dinghy));
    hull.scale.set(1.25, 0.62, 2.4);
    mesh(dg, rbox(0.22, 0.22, 4.4, 0.08), toon(C.dinghyKeel), 0, 0.6, 0);
    const oar = mesh(dg, cyl(0.07, 0.07, 3.2, 6), toon(C.oar), 1.6, -0.2, 0.4);
    oar.rotation.set(Math.PI / 2, 0.3, 0);
    decorate(isl, sample, { palms: 7, tufts: 12, shells: 12, drift: 2, keepOut: [[sx, sz, 3], [dx, dz, 3]] });
  }
  // Conch Bank in the west: a second, smaller conch and palms
  {
    const isl = BANKS.conch;
    const sample = island(isl, { tall: 8 });
    bankSample.conch = sample;
    const [cx, cz] = isl.lumps[0];
    const face = Math.atan2(LAIR.x - cx, LAIR.z - cz);
    const kx = cx + Math.sin(face) * 3.5;
    const kz = cz + Math.cos(face) * 3.5;
    addConch(props, kx, sample(kx, kz)[0] + 0.7, kz, face - 1.2, 0.85);
    decorate(isl, sample, { palms: 7, tufts: 12, shells: 10, drift: 1, keepOut: [[kx, kz, 4]] });
  }

  // ----- sea stacks: the four fort stacks (flat tops) and the tall ones -----
  FORT_SPOTS.forEach((f, i) => {
    const m = mesh(painted, rockTag(stackGeo(3.2, FORT_TOP, 50 + i, true), 0.55, 1), rockMat, f.x, 0, f.z, i * 1.3);
    m.scale.set(1, 1, 1);
    addCol(f.x, f.z, STACK_R, 3.6);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + i * 0.9 + rand() * 0.8;
      const d = 3.7 + rand() * 0.9;
      const b = mesh(painted, rockTag(bumpy(300 + i * 7 + k, 0.22, 12, 9), 0.5 + 0.1 * (k % 3), 0), rockMat, f.x + Math.cos(a) * d, -0.15, f.z + Math.sin(a) * d, rand() * 6);
      b.scale.set(0.9 + rand() * 0.4, 0.8 + rand() * 0.3, 0.8 + rand() * 0.4);
    }
  });
  STACKS.forEach(([b, d, R, H], i) => {
    const p = at(b, d);
    mesh(painted, rockTag(stackGeo(R, H, 80 + i, false), 0.5 + 0.08 * (i % 3), 1), rockMat, p.x, 0, p.z, i * 0.8);
    addCol(p.x, p.z, R, H);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + i + rand() * 0.6;
      const dd = R * 1.05 + rand() * 0.8;
      const bb = mesh(painted, rockTag(bumpy(400 + i * 5 + k, 0.22, 12, 9), 0.5, 0), rockMat, p.x + Math.cos(a) * dd, -0.15, p.z + Math.sin(a) * dd, rand() * 6);
      bb.scale.set(0.9 + rand() * 0.6, 0.8 + rand() * 0.4, 0.8 + rand() * 0.5);
    }
    // tumbled blocks on its crown, a grassy cap with tufts, and a gulls' nest on top
    const top = H * 1.0;
    for (let k = 0; k < 2; k++) {
      const a = i * 1.7 + k * 2.6;
      const blk = mesh(painted, rockTag(bumpy(500 + i * 3 + k, 0.2, 10, 8), 0.62, 1), rockMat, p.x + Math.cos(a) * R * 0.32, top - 0.35, p.z + Math.sin(a) * R * 0.32, a);
      blk.scale.set(R * 0.36, R * 0.3, R * 0.3);
    }
    const cap = mesh(props, sphere(10, 6), toon(C.grass2), p.x, top - 0.1, p.z);
    cap.scale.set(R * 0.5, 0.35, R * 0.5);
    for (let k = 0; k < 3; k++) addTuft(props, p.x + Math.cos(k * 2.1 + i) * R * 0.3, top + 0.05, p.z + Math.sin(k * 2.1 + i) * R * 0.3, 0.9, rand);
    const nest = mesh(props, geo('nest', () => new THREE.TorusGeometry(0.5, 0.2, 6, 12)), toon(C.nest), p.x + 0.4, top + 0.25, p.z - 0.2);
    nest.rotation.x = Math.PI / 2;
    for (let k = 0; k < 2; k++) mesh(props, sphere(7, 5), toon(C.egg), p.x + 0.3 + k * 0.25, top + 0.32, p.z - 0.2).scale.set(0.15, 0.2, 0.15);
    perch.push(V3(p.x - 0.6, top + 0.15, p.z + 0.4));
  });
  // far on the horizon: islets with palms, and sea stacks (decoration)
  for (const [b, d, s] of FAR_ISLES) {
    const x = Math.sin(b * DEG) * d;
    const z = -Math.cos(b * DEG) * d;
    const isl = { lumps: [[x, z, s], [x + s * 0.9, z + s * 0.4, s * 0.6]], beach: 3, hillH: 0.8, hillW: 3, res: 1.8, far: true };
    const sample = island(isl, { colliders: false });
    decorate(isl, sample, { palms: 3 });
  }
  FAR_STACKS.forEach(([b, d, R, H], i) => {
    const x = Math.sin(b * DEG) * d;
    const z = -Math.cos(b * DEG) * d;
    mesh(painted, rockTag(stackGeo(R, H, 120 + i, false), 0.6, 0.6), rockMat, x, 0, z, i);
  });
  // gulls standing about (baked)
  for (const p of perch) {
    const [body] = gullPieces();
    const g = group(props, p.x, p.y + 0.3, p.z, rand() * TAU, 1.0);
    g.add(body);
    for (const sd of [-1, 1]) {
      mesh(g, cyl(0.03, 0.03, 0.4, 4), toon(C.leg), sd * 0.1, -0.2, 0);
    }
    const wingL = mesh(g, sphere(8, 5), toon(C.gullWing), 0, 0.12, -0.1);
    wingL.scale.set(0.34, 0.2, 0.6);
  }

  // ----- the Shellback's bed: the sandbank round the sleeping crab, its dunes, its grass and shells -----
  const bed = new THREE.Group();
  bed.name = 'shoals-bed';
  bed.position.set(LAIR.x, 0, LAIR.z);
  root.add(bed);
  {
    // the sandbank: a polar grid round the lair (it reaches under the shell)
    const NR = 22;
    const NA = 72;
    const R1 = BED.r + 2.6;
    const pos = [];
    const uv = [];
    const idx = [];
    for (let i = 0; i <= NR; i++) {
      const rr = (i / NR) * R1;
      for (let j = 0; j < NA; j++) {
        const a = (j / NA) * TAU;
        const x = Math.cos(a) * rr;
        const z = Math.sin(a) * rr;
        pos.push(x, bedTop(x, z, noise), z);
        uv.push(-5, noise(x * 0.3 + 2, z * 0.3));
      }
    }
    for (let i = 0; i < NR; i++) {
      for (let j = 0; j < NA; j++) {
        const j1 = (j + 1) % NA;
        const a = i * NA + j;
        const b = i * NA + j1;
        const c = (i + 1) * NA + j;
        const d = (i + 1) * NA + j1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const sand = mesh(bed, g, terrainMat);
    sand.name = 'shoals-bed-sand';
    sand.userData.keep = true;
    ownGeos.push(g);
  }
  // the bed's little props (baked into their own mesh, which sinks with the bed)
  const bedProps = new THREE.Group();
  bed.add(bedProps);
  {
    const brand = mulberry32(0xbedbed);
    const spots = [];
    for (let i = 0, tries = 0; i < 26 && tries < 600; tries++) {
      const a = brand() * TAU;
      const d = 8.1 + brand() * 2.6;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      // the crab's face (+z) and its claws stay clear
      if (Math.abs(Math.atan2(x, z)) < 52 * DEG) continue;
      const h = bedTop(x, z, noise);
      if (h < 0.12) continue;
      if (spots.some((p) => Math.hypot(p[0] - x, p[1] - z) < 1.4)) continue;
      spots.push([x, z]);
      if (i % 3 === 0) addTuft(bedProps, x, h, z, 0.7 + brand() * 0.4, brand);
      else if (i % 7 === 1) addStar(bedProps, x, h + 0.02, z, 0.45, brand);
      else addShell(bedProps, x, h + 0.04, z, 0.6 + brand() * 0.4, brand);
      i++;
    }
  }
  // the dunes: rebuilt on the CPU while they slide (their rest shape kept)
  const dune = (() => {
    const NRD = 7;
    const NAD = 18;
    const list = [];
    const pos = [];
    const col = [];
    const idx = [];
    const cA = new THREE.Color(C.bedDune);
    const cB = new THREE.Color(C.bedDuneDark);
    const tmp = new THREE.Color();
    for (const [bear, dist, R, H] of BED.dunes) {
      const a = bear * DEG;
      const cx = Math.sin(a) * dist;
      const cz = Math.cos(a) * dist;
      const first = pos.length / 3;
      const verts = [];
      for (let i = 0; i <= NRD; i++) {
        const rho = i / NRD;
        for (let j = 0; j < (i === 0 ? 1 : NAD); j++) {
          const ph = (j / NAD) * TAU;
          const wob = 1 + 0.12 * Math.sin(3 * ph + bear) * rho;
          const ox = Math.cos(ph) * rho * R * wob;
          const oz = Math.sin(ph) * rho * R * wob * 0.8;
          // the dune's long axis runs round the shell
          const lx = cx + ox * Math.cos(a) + oz * Math.sin(a);
          const lz = cz - ox * Math.sin(a) + oz * Math.cos(a);
          const bump = H * Math.pow(Math.max(0, 1 - rho * rho), 1.5);
          verts.push({ lx, lz, bump, rho });
          pos.push(lx, 0, lz);
          tmp.copy(cA).lerp(cB, smooth(0.5, 1, rho));
          col.push(tmp.r, tmp.g, tmp.b);
        }
      }
      // fan round the centre, then quads ring by ring
      for (let j = 0; j < NAD; j++) idx.push(first, first + 1 + ((j + 1) % NAD), first + 1 + j);
      for (let i = 1; i < NRD; i++) {
        const r0 = first + 1 + (i - 1) * NAD;
        const r1 = first + 1 + i * NAD;
        for (let j = 0; j < NAD; j++) {
          const j1 = (j + 1) % NAD;
          idx.push(r0 + j, r0 + j1, r1 + j, r0 + j1, r1 + j1, r1 + j);
        }
      }
      list.push({ verts, first, ux: Math.sin(a), uz: Math.cos(a), delay: (list.length % 3) * 0.12 });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const mat = vcMaterial(true);
    mat.name = 'shoals-dunes';
    own.push(mat);
    const m = new THREE.Mesh(g, mat);
    m.name = 'shoals-dunes';
    m.userData.keep = true;
    bed.add(m);
    ownGeos.push(g);
    const P = g.attributes.position.array;
    let shaped = -1;
    // shape at slide k (0 = banked against the shell, 1 = slumped out into the sea)
    function shape(k) {
      if (Math.abs(k - shaped) < 1e-4) return;
      shaped = k;
      for (const d of list) {
        const s = smooth(d.delay, d.delay + 0.75, k);
        const off = BED.slide * s;
        const sink = BED.sink * 1.1 * s * s;
        for (let v = 0; v < d.verts.length; v++) {
          const q = d.verts[v];
          const x = q.lx + d.ux * off;
          const z = q.lz + d.uz * off;
          // banked against the shell (it lies on the shell where the shell is higher than the bank), sliding off it
          const sh = shellTop(x, z);
          const onShell = Number.isFinite(sh) ? Math.min(sh - 0.05, 1.6) - 2.5 * s : -1e9;
          const base = Math.max(bedTop(x, z, noise), onShell);
          const o3 = (d.first + v) * 3;
          P[o3] = x;
          P[o3 + 1] = base + q.bump * (1 - 0.5 * s) - sink;
          P[o3 + 2] = z;
        }
      }
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
      g.computeBoundingSphere();
    }
    shape(0);
    return { mesh: m, shape, count: list.length };
  })();
  const cloud = buildCloud(timeU, ampU);
  cloud.mesh.position.set(LAIR.x, 0, LAIR.z);
  cloud.mesh.visible = false;
  root.add(cloud.mesh);
  own.push(cloud.mesh.material);
  ownGeos.push(cloud.mesh.geometry);

  // ----- the ebb tide's bars -----
  const tide = buildTide(BARS, timeU, ampU);
  root.add(tide.mesh);
  own.push(tide.mesh.material);
  ownGeos.push(tide.mesh.geometry);

  // ----- the calm's rainbow -----
  const rainbow = buildRainbow();
  rainbow.visible = false;
  root.add(rainbow);
  own.push(rainbow.material);
  ownGeos.push(rainbow.geometry);

  // ----- bake: the props into vertex colours, the painted parts merged per material -----
  const lineMat = vcMaterial(true);
  const flatMat = vcMaterial(false);
  own.push(lineMat, flatMat);
  bakeVC(props, { line: lineMat, flat: flatMat }, 'shoals-props');
  bakeVC(bedProps, { line: lineMat, flat: flatMat }, 'shoals-bed-props');
  mergeStatic(painted);
  for (const grp of [painted, props, bedProps]) {
    grp.traverse((o) => {
      o.updateMatrix();
      o.matrixAutoUpdate = false;
      if (o.isMesh) ownGeos.push(o.geometry);
    });
  }
  for (const g of GEO.values()) g.dispose();
  GEO = null;

  // ----- gulls wheeling and crabs scuttling: one rig -----
  GEO = new Map();
  const gulls = [];
  const crabs = [];
  const critterPieces = [];
  {
    const st = STACKS.map(([b, d]) => at(b, d));
    const birds = [
      { c: [st[0].x, st[0].z], r: 12, y: 20, w: 0.3 },
      { c: [st[1].x + 4, st[1].z], r: 9, y: 16, w: -0.36 },
      { c: [BANKS.whale.lumps[1][0], BANKS.whale.lumps[1][1]], r: 16, y: 14, w: 0.26 },
      { c: [BANKS.shell.lumps[0][0], BANKS.shell.lumps[0][1]], r: 13, y: 15, w: -0.3 },
      { c: [FORT_SPOTS[0].x, FORT_SPOTS[0].z], r: 14, y: 17, w: 0.28 },
      { c: [BANKS.south.lumps[0][0], BANKS.south.lumps[0][1]], r: 15, y: 13, w: -0.27 },
      { c: [LAIR.x + 4, LAIR.z - 2], r: 22, y: 24, w: 0.22 },
    ];
    for (const b of birds) {
      const first = critterPieces.length;
      critterPieces.push(...gullPieces());
      gulls.push({ ...b, first, ph: rand() * TAU });
    }
    // crabs: each scuttles to and fro along an arc of a beach, just above the waterline
    const runs = [
      ['south', 0, 1.8, 0.0],
      ['south', 1, 1.6, 2.6],
      ['palm', 0, 1.7, 3.6],
      ['palm', 1, 1.5, 1.0],
      ['shell', 0, 1.8, 3.9],
      ['conch', 0, 1.7, 0.8],
      ['conch', 1, 1.5, 4.2],
      ['whale', 1, 1.8, 1.6],
      ['whale', 2, 1.8, 2.1],
    ];
    for (const [bank, li, inset, a0] of runs) {
      const [lx, lz, lr] = BANKS[bank].lumps[li];
      const r = lr - inset;
      const ym = bankSample[bank](lx + Math.cos(a0) * r, lz + Math.sin(a0) * r)[0];
      const first = critterPieces.length;
      critterPieces.push(crabPiece());
      crabs.push({ lx, lz, r, a0, y: Math.max(0.2, ym) - 0.02, first, ph: rand() * TAU, span: 0.12 + rand() * 0.1, speed: 0.35 + rand() * 0.25 });
    }
  }
  const critterMat = vcMaterial(true);
  critterMat.name = 'shoals-critters';
  own.push(critterMat);
  const critters = buildRig(critterPieces, critterMat, 'shoals-critters');
  root.add(critters.mesh);
  for (const g of GEO.values()) g.dispose();
  GEO = null;

  // ----- gameplay data -----
  const playerStart = { ...START };
  const enemySpawns = computeSpawns(playerStart, colliders);
  const crateSpots = computeCrates(playerStart, colliders);
  const fortSpots = FORT_SPOTS.map((f) => ({ x: f.x, z: f.z }));
  const tideBars = BARS.map((b) => ({ ...b }));
  const checks = layoutChecks(colliders, playerStart, fortSpots);
  if (checks.problems.length) console.error('shoals.js layout:', checks.problems.join('; '));

  // =========================================================================
  // Awake and calm: the bed's sand slides off; the sky repainted for the golden evening
  // =========================================================================
  const linear = (hex) => new THREE.Color(hex);
  const COLOR_KEYS = ['skyTop', 'skyHorizon', 'sunColor', 'waterSunColor', 'hemiSky', 'hemiGround', 'fogColor', 'waterDeep', 'waterShallow', 'waterFoam', 'cloudColor', 'cloudShade'];
  const NUM_KEYS = ['sunIntensity', 'hemiIntensity', 'fogNear', 'fogFar'];
  const toLinear = (p) => {
    const out = {};
    for (const k of COLOR_KEYS) if (p[k] !== undefined) out[k] = linear(p[k]);
    if (p.waterSunColor === undefined && p.sunColor !== undefined) out.waterSunColor = linear(p.sunColor);
    for (const k of NUM_KEYS) if (p[k] !== undefined) out[k] = p[k];
    if (p.sunDir) out.sunDir = new THREE.Vector3().fromArray(p.sunDir).normalize();
    return out;
  };
  const BASE_L = toLinear(palette);
  const CALM_L = { ...BASE_L, ...toLinear(CALM) };
  const P = toLinear(palette); // the painted mix (reused)
  let parts = null;
  const sceneParts = () => {
    const ok = parts && [parts.ocean, parts.sky, parts.clouds, parts.hemi, parts.sun].every((o) => !o || o.parent === scene);
    if (!ok) {
      const kids = scene.children;
      parts = {
        ocean: kids.find((o) => o.name === 'ocean' && o.material?.uniforms?.uDeep) || null,
        sky: kids.find((o) => o.name === 'sky' && o.material?.uniforms?.uTop) || null,
        clouds: kids.find((o) => o.name === 'clouds') || null,
        hemi: kids.find((o) => o.name === 'hemi' && o.isHemisphereLight) || kids.find((o) => o.isHemisphereLight) || null,
        sun: kids.find((o) => o.name === 'sun' && o.isDirectionalLight) || kids.find((o) => o.isDirectionalLight) || null,
      };
    }
    return parts;
  };
  const cloudUniforms = (clouds) => {
    if (!clouds) return null;
    for (const c of clouds.children) if (c.material?.uniforms?.uLit) return c.material.uniforms;
    return null;
  };
  let painted0 = false;
  function paint(k) {
    for (const key of COLOR_KEYS) P[key].copy(BASE_L[key]).lerp(CALM_L[key], k);
    for (const key of NUM_KEYS) P[key] = lerp(BASE_L[key], CALM_L[key], k);
    const p = P;
    const { ocean, sky, clouds, hemi, sun } = sceneParts();
    if (scene.fog && scene.fog.isFog) {
      scene.fog.color.copy(p.fogColor);
      scene.fog.near = p.fogNear;
      scene.fog.far = p.fogFar;
    }
    if (scene.background && scene.background.isColor) scene.background.copy(p.fogColor);
    if (ocean) {
      const u = ocean.material.uniforms;
      u.uDeep.value.copy(p.waterDeep);
      u.uShallow?.value.copy(p.waterShallow);
      u.uFoam?.value.copy(p.waterFoam);
      u.uSunColor?.value.copy(p.waterSunColor);
      u.uSkyHorizon?.value.copy(p.skyHorizon);
    }
    if (sky) {
      const u = sky.material.uniforms;
      u.uTop.value.copy(p.skyTop);
      u.uHorizon?.value.copy(p.skyHorizon);
      u.uFog?.value.copy(p.fogColor);
      u.uSunColor?.value.copy(p.sunColor);
      u.uCloud?.value.copy(p.cloudColor);
      u.uCloudShade?.value.copy(p.cloudShade);
    }
    const cu = cloudUniforms(clouds);
    if (cu) {
      cu.uLit.value.copy(p.cloudColor);
      cu.uShade?.value.copy(p.cloudShade);
      cu.uFogColor?.value.copy(p.fogColor);
      if (cu.uFogNear) cu.uFogNear.value = p.fogNear;
      if (cu.uFogFar) cu.uFogFar.value = p.fogFar * 1.6;
    }
    if (hemi) {
      hemi.color.copy(p.hemiSky);
      hemi.groundColor.copy(p.hemiGround);
      hemi.intensity = p.hemiIntensity;
    }
    if (sun) {
      sun.color.copy(p.sunColor);
      sun.intensity = p.sunIntensity;
    }
    painted0 = k > 0;
  }

  const want = { awake: 0, calm: 0 };
  const cur = { awake: 0, calm: 0 };
  let disposed = false;
  const level = (k, dflt) => (finite(k) ? clamp01(k) : dflt);
  function setAwake(k = 1, opts = null) {
    if (disposed) return;
    want.awake = level(k, 1);
    if (reduced() || opts?.instant) cur.awake = want.awake;
  }
  function setCalm(k = 1, opts = null) {
    if (disposed) return;
    want.calm = level(k, 1);
    if (reduced() || opts?.instant) cur.calm = want.calm;
  }
  let paintedCalm = 0;
  let shapedAwake = -1;
  const rainbowDir = new THREE.Vector3(0, 0, -1);
  let rainbowSet = false;
  const tideState = { low: 0, warn: 0, fade: 1, stopped: false };
  const cloudState = { t: -1, k: 0 };

  // =========================================================================
  // Per frame
  // =========================================================================
  const m4 = new THREE.Matrix4();
  const mA = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3(1, 1, 1);
  const fwd = new THREE.Vector3();
  const stats = {
    colliders: colliders.length,
    tideBars: BARS.length,
    fortSpots: fortSpots.length,
    dunes: dune.count,
    gulls: gulls.length,
    crabs: crabs.length,
    // the fastest periodic change of anything that glows or brightens: the tide's bubbles (each 1 / BUBBLE_T Hz,
    // out of step), the foam lace (0.11 Hz)
    maxPulseHz: Math.max(1 / BUBBLE_T, 0.7 / TAU),
    pulseHzMax: PULSE_HZ_MAX,
    flashes: FLASH_MAX,
    rainbowAlpha: 0,
    rainbowAlphaMax: RAINBOW.alpha,
    tide: { low: 0, warn: 0, fade: 1 },
    checks,
  };
  let now = 0;
  function tideTargets(tv) {
    // targets for the bars' look from the mechanics' tide (null = high tide)
    const st = tv && typeof tv === 'object' ? (tv.state ?? tv.phase) : null;
    const T = st && finite(tv.T) && tv.T > 0 ? tv.T : 0;
    const k = !st ? 0 : finite(tv.k) ? clamp01(tv.k) : T > 0 && finite(tv.t) ? clamp01(tv.t / T) : 0;
    // the Shellback woke: the bars fade over the mechanics' T and stay gone
    if (st === 'fading') tideState.stopped = true;
    if (tideState.stopped) {
      if (st === 'fading') return { low: tideState.low, warn: tideState.warn * (1 - k), fade: Math.min(tideState.fade, 1 - smooth(0, 1, k)), direct: true };
      return { low: 0, warn: 0, fade: 0 };
    }
    if (st === 'warning') return { low: 0.18 * k, warn: 1, fade: 1 };
    if (st === 'low') {
      // out over its first second, back in over its last
      const t = finite(tv.t) ? tv.t : k * T;
      const rest = T > 0 ? T - t : 1;
      return { low: smooth(0, 1, t) * smooth(0, 0.8, rest), warn: Math.max(0, 1 - t * 1.5) * 0.6, fade: 1 };
    }
    return { low: 0, warn: 0, fade: 1 };
  }
  function update(t, dt, frame) {
    if (disposed) return;
    const step = finite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
    now = finite(t) ? t : now + step;
    const still = reduced();
    timeU.value = now;

    // ---- awake and calm: eased toward what was asked (a cut under reduced motion) ----
    for (const key of ['awake', 'calm']) {
      if (still) cur[key] = want[key];
      else {
        const d = want[key] - cur[key];
        const s = step / EASE[key];
        cur[key] = Math.abs(d) <= s ? want[key] : cur[key] + Math.sign(d) * s;
      }
    }
    const ka = cur.awake;
    if (ka !== shapedAwake) {
      shapedAwake = ka;
      dune.shape(ka);
      // the bank sinks under the sea after the dunes start to go
      bed.position.y = -BED.sink * smooth(0.15, 1, ka);
      bed.visible = ka < 0.999;
    }
    // the stirred-up sand: spreads while the dunes slide, then settles over BED.cloud.life s
    if (ka > 0.02 && cloudState.t < 0) cloudState.t = now;
    if (ka <= 0.001) cloudState.t = -1;
    if (cloudState.t >= 0) {
      const age = Math.max(0, now - cloudState.t);
      const grow = still ? 1 : smooth(0, 3, age);
      const k = still ? (ka >= 1 ? 0.6 : 0.8) * (1 - smooth(0, 1, age / BED.cloud.life)) : smooth(0, 0.6, age) * (1 - smooth(BED.cloud.life * 0.45, BED.cloud.life, age));
      cloud.U.uK.value = k;
      cloud.U.uR.value = lerp(BED.cloud.r0, BED.cloud.r1, grow);
      cloud.mesh.visible = k > 0.004;
    } else if (cloud.mesh.visible) cloud.mesh.visible = false;
    if (ka >= 0.5) tideState.stopped = true;

    const kc = smooth(0, 1, cur.calm);
    if (kc !== paintedCalm) {
      paint(kc);
      paintedCalm = kc;
    }
    // ---- the rainbow: where the camera looked when the calm began, round the camera like the sky ----
    const cam = frame?.camera;
    const cx = cam?.position ? cam.position.x : START.x;
    const cy = cam?.position ? cam.position.y : 10;
    const cz = cam?.position ? cam.position.z : START.z + 17;
    if (kc > 0) {
      if (!rainbowSet) {
        rainbowSet = true;
        if (cam?.getWorldDirection) {
          cam.getWorldDirection(fwd);
          fwd.y = 0;
          if (fwd.lengthSq() > 1e-6) rainbowDir.copy(fwd.normalize());
        } else rainbowDir.set(0, 0, -1);
      }
      const D = RAINBOW.dist;
      const rad = D * Math.tan(RAINBOW.radius * DEG);
      rainbow.position.set(cx + rainbowDir.x * D, cy - 4, cz + rainbowDir.z * D);
      rainbow.scale.setScalar(rad);
      rainbow.lookAt(cx, cy - 4, cz);
      const a = RAINBOW.alpha * kc;
      rainbow.material.uniforms.uAlpha.value = a;
      rainbow.visible = a > 0.003;
      stats.rainbowAlpha = a;
    } else {
      rainbowSet = false;
      if (rainbow.visible) rainbow.visible = false;
      stats.rainbowAlpha = 0;
    }

    // ---- the ebb tide's bars ----
    const tt = tideTargets(frame?.hazards?.tide);
    const rate = step * 2.2;
    if (tt.direct) {
      tideState.warn = tt.warn;
      tideState.fade = tt.fade;
    } else {
      tideState.low = still ? tt.low : tideState.low + Math.max(-rate, Math.min(rate, tt.low - tideState.low));
      tideState.warn = still ? tt.warn : tideState.warn + Math.max(-rate * 1.5, Math.min(rate * 1.5, tt.warn - tideState.warn));
      tideState.fade = still ? tt.fade : tideState.fade + Math.max(-rate, Math.min(rate, tt.fade - tideState.fade));
    }
    tide.U.uLow.value = tideState.low;
    tide.U.uWarn.value = tideState.warn;
    tide.U.uFade.value = tideState.fade;
    tide.U.uStill.value = still ? 1 : 0;
    tide.mesh.visible = tideState.fade > 0.003;
    stats.tide.low = tideState.low;
    stats.tide.warn = tideState.warn;
    stats.tide.fade = tideState.fade;

    // ---- gulls: wheeling, a few beats then a glide (under reduced motion they hang still on the wind) ----
    const tc = still ? 0 : now;
    for (const b of gulls) {
      const a = b.ph + tc * b.w;
      const x = b.c[0] + Math.cos(a) * b.r;
      const z = b.c[1] + Math.sin(a) * b.r;
      const dir = Math.sign(b.w);
      p.set(x, b.y + (still ? 0 : Math.sin(now * 0.6 + b.ph) * 1.4), z);
      e.set(0, Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir), 0.28 * dir, 'YXZ');
      q.setFromEuler(e);
      m4.compose(p, q, sc.set(1.35, 1.35, 1.35));
      critters.set(b.first, m4);
      const glide = 0.5 + 0.5 * Math.sin(now * 0.8 + b.ph);
      const flap = still ? 0.6 : glide > 0.45 ? 0.25 + 1.2 * Math.abs(Math.sin(now * 7 + b.ph)) : 0.5;
      mA.makeScale(1, flap, 1);
      critters.set(b.first + 1, mA.premultiply(m4));
    }
    // ---- crabs: a few quick sideways steps along the beach, a pause, back again ----
    for (const c of crabs) {
      const u = still ? 0 : Math.sin(now * c.speed + c.ph);
      const a = c.a0 + c.span * Math.max(-1, Math.min(1, u * 1.4));
      const x = c.lx + Math.cos(a) * c.r;
      const z = c.lz + Math.sin(a) * c.r;
      const moving = !still && Math.abs(Math.cos(now * c.speed + c.ph)) > 0.25 && Math.abs(u * 1.4) < 1;
      p.set(x, c.y + (moving ? 0.04 * Math.abs(Math.sin(now * 14 + c.ph)) : 0), z);
      // facing the sea (the beach's outward normal), walking along it
      e.set(0, Math.atan2(Math.cos(a), Math.sin(a)), 0, 'YXZ');
      q.setFromEuler(e);
      m4.compose(p, q, sc.set(1.25, 1.25, 1.25));
      critters.set(c.first, m4);
    }
    critters.commit();
  }
  update(0, 0, null);

  function warmables() {
    // each with something on screen when drawn: the tide (its faint high-tide patch), the cloud and the rainbow (warm
    // values, put back by the next update)
    cloud.U.uK.value = Math.max(cloud.U.uK.value, 0.05);
    rainbow.material.uniforms.uAlpha.value = Math.max(rainbow.material.uniforms.uAlpha.value, 0.01);
    tide.U.uFade.value = Math.max(tide.U.uFade.value, 0.05);
    return [tide.mesh, cloud.mesh, rainbow];
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (painted0) paint(0); // give the shared scenery its palette back
    scene.remove(root);
    const geos = new Set(ownGeos);
    root.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
    });
    for (const g of geos) g.dispose();
    critters.dispose();
    for (const m of own) m.dispose();
  }

  return {
    worldRadius: WORLD_R,
    colliders,
    playerStart,
    enemySpawns,
    reefs: [],
    crateSpots,
    tideBars,
    fortSpots,
    shellbackLair: { ...LAIR },
    shellbackArena: { ...ARENA },
    setAwake,
    setCalm,
    get awake() {
      return cur.awake;
    },
    get calm() {
      return cur.calm;
    },
    warmables,
    stats,
    update,
    dispose,
    group: root,
  };
}

export const LAYOUT = {
  lair: LAIR,
  arena: ARENA,
  arenaClear: ARENA_CLEAR,
  barClear: BAR_CLEAR,
  start: START,
  fortSpots: FORT_SPOTS,
  fortTop: FORT_TOP,
  bars: BARS,
  bed: BED,
  ease: EASE,
  rainbow: RAINBOW,
  pulseHzMax: PULSE_HZ_MAX,
};
