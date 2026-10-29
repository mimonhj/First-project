import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, setOutline, noOutline, mergeStatic, INK } from '../style.js';
import { waveHeight } from '../scenery.js';

// Level 9, "The Kraken's Deep" (SPEC3 §5.6), the finale: a moonlit night that glows.
//
// Map (north = -z, east = +x; the sea is the disc of radius WORLD_R round 0,0):
// - you start in the south (0, 48) facing north, across the open water of the Kraken's arena (KRAKEN_ARENA:
//   centre (0, -5), radius 64, every collider at least 10 clear of it) toward the Kraken Crew's lair in the
//   north: a sea cave carved like an octopus head (a violet rock dome with frowning brows, two eye sockets
//   with purple torches burning in them, a cave mouth at the waterline with a little pier and two more
//   torches, and eight stone tentacles curling out over the sea; the crew's flag on top). Behind it a huge,
//   low, cratered moon sits on the horizon (it follows the camera like the sky, so it stays at the horizon),
//   with a glittering moon path on the water and stars above.
// - round the arena: three wrecks lying on their sides (a galleon with a lantern still burning, a brig, a
//   sloop), a whale-skeleton arch you can sail through (the spine arches 19 high over a 15-wide channel; the
//   skull and the tail are the colliders at its feet), and rocks with glowing barnacles; tall sea stacks
//   stand far out on the horizon (decoration).
// - the foam glows cyan (palette.waterFoam), so wakes and splashes are trails of light; glowing jellyfish
//   (one InstancedMesh of up to JELLY.max, noOutline, plus their glow on the water: a bell with ringed crown and
//   seven swaying tentacles, floating with its rim just clear of the water) drift near the rocks, the wrecks,
//   the arch and in the open sea.
// - hazards drawn here from update()'s `hazards` (the mechanics' visuals() snapshot): the ink slicks
//   (`hazards.slicks`: [{ x, z, r, t, T }], t its age and T its life in s, or { x, z, r, k } with k 0..1; one
//   InstancedMesh of up to SLICK_MAX; a slick grows in over 0.4 s and shrinks away over its last SLICK_FADE s).
//   Geysers, ink pots, the Kraken and its rings
//   are drawn by main.js and krakenView.js.
//
// The Kraken: setDread(k) (0..1, eased over EASE.dread s; a cut under reduced motion) darkens the water,
// the sky and the fog, sends the jellyfish under and boils bubbles up round the camera's focus (strongest
// as the dread rises, then a light trickle); setDawn(k) (default 1, eased over EASE.dawn s, a cut under
// reduced motion) eases the sky to dawn gold: the sun comes up low in the east, the moon pales and sets,
// the stars fade, the water turns morning blue. Both repaint the shared sky, ocean, clouds, lights and
// fog (found by name among the scene's children) from this level's palette; dispose() puts the palette
// back. With both at 0 nothing of the shared scenery is touched.
//
// Photosensitivity (SPEC3 §15): nothing here flashes. Every glow that pulses (jellyfish, torches,
// barnacles, the stars' twinkle) pulses at PULSE_HZ_MAX (1 Hz) or slower; dread and dawn are slow eases
// (or one cut); there is no flash overlay at all. Reduced motion (ctx.reducedMotion: a boolean or a function,
// else the media query): no jellyfish pulse, drift or tentacle sway, bubbles fade in place, dread and dawn cut.
//
// build(scene, { rng, reducedMotion? }) -> { worldRadius, colliders, playerStart, enemySpawns, reefs,
//   crateSpots, krakenArena ({ x, z, r }), setDread(k), setDawn(k = 1), dread, dawn (current, eased),
//   stats (read-only numbers for tests), update(t, dt, { simTime, camera, hazards }), dispose(), group }

export const meta = {
  name: "The Kraken's Deep",
  subtitle: 'A moonlit sea that glows. The Kraken Crew guards the Deep.',
};

export const palette = {
  skyTop: 0x0f1638,
  skyHorizon: 0x3a3f7a,
  sunColor: 0xcfe0ff,
  sunDir: [0.2, 0.7, -0.5],
  sunIntensity: 1.2,
  hemiSky: 0x7a86c8,
  hemiGround: 0x101833,
  hemiIntensity: 1.2,
  fogColor: 0x232a5a,
  fogNear: 70,
  fogFar: 300,
  waterDeep: 0x0b2a4a,
  waterShallow: 0x1f8f9a,
  waterFoam: 0x9ff7ff,
  waveAmp: 0.75,
  cloudColor: 0x4a5080,
  cloudShade: 0x232a4a,
  cloudCount: 10,
};

// What setDread(1) and setDawn(1) paint over the palette (the rest of the palette stays). The dread keeps
// the lights nearly as they are (the Kraken fight happens under it: ships must stay readable) and darkens
// the water, the sky and the fog; the glowing foam stands out the more. waterSunColor is the water's own copy
// of the sun's colour (the lights keep sunColor): the shared ocean paints the sun's reflection as 88 % of
// the shallow tone and 12 % of the sun's colour, so over the nearly black dread water the pale night sun
// turned those patches into big grey blobs; a dimmer water sun keeps them a faint teal shimmer.
const DREAD = {
  skyTop: 0x070b22,
  skyHorizon: 0x2a2156,
  fogColor: 0x161838,
  fogNear: 60,
  fogFar: 260,
  waterDeep: 0x040f1f,
  waterShallow: 0x0d4450,
  waterSunColor: 0x3a4f7a,
  hemiIntensity: 1.1,
  sunIntensity: 1.0,
  cloudColor: 0x2f2a58,
  cloudShade: 0x15132e,
};
// The water mirrors a higher sun than the sky shows, on the same bearing (as frost.js and doubloon.js do with
// palette.waterSunDir): a low dawn sun makes the shared ocean paint a wide path of pale gold dashes that reads
// as sandbars. The sky's sun disc and the lights keep sunDir.
function higherSun([x, , z], y) {
  const k = Math.sqrt(1 - y * y) / Math.hypot(x, z);
  return [x * k, y, z * k];
}
// Dawn: the sun low in the east (bearing ~100°), gold horizon, morning water.
const DAWN = {
  skyTop: 0x4f6cc6,
  skyHorizon: 0xffc488,
  sunColor: 0xffd9a8,
  sunDir: [0.94, 0.25, 0.17],
  waterSunDir: higherSun([0.94, 0.25, 0.17], 0.62),
  sunIntensity: 2.0,
  hemiSky: 0xffe0cc,
  hemiGround: 0x3e4a80,
  hemiIntensity: 1.35,
  fogColor: 0xf0bfa0,
  fogNear: 110,
  fogFar: 360,
  waterDeep: 0x1b4e8a,
  waterShallow: 0x47c0c6,
  waterFoam: 0xe6fdff,
  cloudColor: 0xffe2d4,
  cloudShade: 0xb07a9c,
};
const EASE = { dread: 2.5, dawn: 3 }; // seconds from 0 to 1 (a cut under reduced motion)
const PULSE_HZ_MAX = 1; // SPEC3 §15: every glow pulses at 1 Hz or slower

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
const WORLD_R = 140;
const DEG = Math.PI / 180;
const AMP = palette.waveAmp;
// map bearing (degrees clockwise from north) and radius -> x, z
const at = (bearing, r) => ({ x: +(r * Math.sin(bearing * DEG)).toFixed(2), z: +(-r * Math.cos(bearing * DEG)).toFixed(2) });

const PLAYER_START = { x: 0, z: 48, h: Math.PI }; // south, facing north across the arena to the lair
const KRAKEN_ARENA = { x: 0, z: -5, r: 64 };
const ARENA_CLEAR = 10; // every collider stays this far outside the arena
const LAIR = { ...at(8, 114), r: 16.2, h: 25 };
const WRECKS = [
  // bow: the bearing her bow points to (degrees; she lies about 45° to the line from the arena, so from the
  // middle of the sea you see her hull and her sails three-quarter on); roll: onto her side (+: port up)
  { ...at(320, 96), bow: 10, len: 16, wid: 5.2, depth: 2.7, roll: 1.02, pitch: 0.14, masts: [0.2, -0.17], lantern: true, seed: 11 },
  { ...at(100, 104), bow: 150, len: 13, wid: 4.4, depth: 2.3, roll: -1.08, pitch: 0.18, masts: [0.1], seed: 23 },
  { ...at(160, 96), bow: 112, len: 9.5, wid: 3.4, depth: 1.8, roll: 1.15, pitch: 0.24, masts: [0.05], seed: 37 },
];
const ARCH = { ...at(235, 100), half: 9.5, height: 19 }; // the spine's feet lie on the radial line, ±half
const ROCKS = [
  // [bearing, radius, size]
  [48, 100, 5.2],
  [55, 109, 2.6],
  [41, 110, 2.3],
  [200, 118, 3.2],
  [285, 120, 4.0],
  [130, 122, 3.5],
  [345, 119, 3.4],
  [27, 128, 3.0],
  [262, 127, 2.8],
  [176, 129, 3.0],
];
// any prefix is well spread, the first one ahead of the start; all in open water 64-110 from the start
const ENEMY_SPAWNS = [
  { x: 0, z: -30 },
  { x: -62, z: 10 },
  { x: 62, z: 8 },
  { x: -58, z: 92 },
  { x: 68, z: 62 },
  { x: -38, z: -25 },
  { x: 40, z: -28 },
];
const CRATE_SPOTS = [
  { x: -24, z: 14 },
  { x: 26, z: 16 },
  { x: -16, z: -40 },
  { x: 20, z: -50 },
  { x: 0, z: 86 },
];
// the moon: bearing and elevation (degrees) of its centre, angular radius, distance from the camera
const MOON = { bearing: 9, elev: 3, radius: 7.5, dist: 700, halo: 1.75, setBy: 6 };
const STARS = 170;
const SEA_EDGE = 640; // how far the ocean mesh reaches round the camera (scenery.js OCEAN_EXTENT)
const JELLY = {
  max: 120,
  // groves: [x, z, spread, count]
  groves: [
    [-6, -88, 10, 13],
    [36, -90, 9, 11],
    [-50, -58, 10, 12],
    [-80, 56, 7, 10],
    [64, -54, 9, 10],
    [90, 32, 8, 9],
    [22, 80, 7, 8],
    [-24, 30, 6, 5],
    [26, 36, 5, 5],
  ],
  loose: 18, // drifting alone in the open sea
  tentacles: 7,
  swayHz: 0.3, // the tentacles sway (not under reduced motion)
  reach: 1.5, // how far the tentacles hang below the bell (bell radii)
  lift: 0.55, // how far the bell's rim floats clear of the water (bell radii)
  dive: 2.6, // how deep they go under the dread (enough for the biggest bell on a wave crest)
  hz: [0.42, 0.78], // pulse rates (≤ PULSE_HZ_MAX)
  colors: [0x7ff8ff, 0xff9ee0, 0xb99cff, 0x9dffd0, 0x7fd4ff],
};
const BUBBLES = { max: 48, radius: 24, near: 20, wobbleHz: 0.9 };
const SLICK_MAX = 8;
const SLICK_R = 7; // the Inkheart's slick radius (mechanics3 INK.slick.r) when a snapshot gives none
const SLICK_FADE = 1; // a slick fades over its last second (mechanics3 INK.slick.fade)
const GLOW_HZ = 0.45; // torches, the lair's eyes, barnacles
// The lair's eye-socket fires burn low while the Kraken's dread is up (eased with it: never a flash), so the only
// eyes glowing in the fight are the Kraken's own amber ones and the carved lair behind it doesn't read as a second
// monster (Stage 3 polish): their glow × (1 − glow), their flames × (1 − flame).
const LAIR_DIM = { glow: 0.85, flame: 0.6 };
// the torches' flames (rad/s): their size breathes, they sway and lick upward, all under 1 Hz
const FLAME_W = { breathe: 5.3, breathe2: 3.1, sway: 4.2, lick: 6.0 };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const linear = (hex) => new THREE.Color(hex); // THREE.Color stores linear values
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A lumpy rock: smooth-normal sphere pushed around by a few sines, flattish bottom. */
function lumpGeo(seed, amp = 0.22, ws = 12, hs = 9) {
  let g = new THREE.SphereGeometry(1, ws, hs);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const r = mulberry32(seed);
  const k = [r() * 6, r() * 6, r() * 6];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    let y = p.getY(i);
    const z = p.getZ(i);
    const n = 1 + amp * (0.6 * Math.sin(x * 2.1 + k[0]) * Math.sin(y * 1.7 + k[1]) + 0.4 * Math.sin(z * 3.3 + k[2] + x * 1.3));
    if (y < -0.35) y = -0.35 + (y + 0.35) * 0.45;
    p.setXYZ(i, x * n, y * n, z * n);
  }
  g.computeVertexNormals();
  return g;
}

// LatheGeometry faces point outwards only when the profile runs bottom to top.
const upward = (pts) => (pts[0][1] > pts[pts.length - 1][1] ? [...pts].reverse() : pts);
function lathe(profile, seg = 16) {
  return new THREE.LatheGeometry(upward(profile).map(([a, b]) => new THREE.Vector2(a, b)), seg);
}
/** A lathe made irregular: radius scaled by a function of the angle and height (craggy rock). */
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
/** A sea stack: a few-sided spire with ledges, twisted a little by sines. */
function spireGeo(seed, R, H, sides = 7) {
  const r = mulberry32(seed);
  const k = [r() * 6, r() * 6, r() * 6, 0.5 + r() * 0.5];
  const prof = [
    [R * 1.32, -2.6],
    [R * 1.12, 0.5],
    [R * 1.0, H * 0.15],
    [R * 0.8, H * 0.27],
    [R * 0.86, H * 0.32],
    [R * 0.66, H * 0.46],
    [R * 0.6, H * 0.6],
    [R * 0.45, H * 0.69],
    [R * 0.47, H * 0.73],
    [R * 0.26 * k[3] + R * 0.1, H * 0.87],
    [R * 0.07, H],
    [0, H + 0.01],
  ];
  return wonkyLathe(prof, sides, (a, y) => 1 + 0.2 * Math.sin(a * 2 + k[0] + y * 0.15) + 0.12 * Math.sin(a * 3 + k[1] - y * 0.21) + 0.06 * Math.sin(a * 5 + k[2]));
}
function mesh(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
/** A tube along `pts` (Vector3) whose radius runs from r0 to r1 (eased by `ease(u)`): tentacles, bones. */
function taperTube(pts, r0, r1, radial = 8, segs = 0, ease = null) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const n = segs || pts.length * 6;
  const g = new THREE.TubeGeometry(curve, n, 1, radial, false);
  const p = g.attributes.position;
  const c = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    curve.getPointAt(u, c);
    const rad = lerp(r0, r1, ease ? ease(u) : u);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      p.setXYZ(k, c.x + (p.getX(k) - c.x) * rad, c.y + (p.getY(k) - c.y) * rad, c.z + (p.getZ(k) - c.z) * rad);
    }
  }
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const m = mergeVertices(g);
  m.computeVertexNormals();
  return { geo: m, curve };
}
const rbox = (w, h, d, r = 0.08) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.01, h / 2.01, d / 2.01));

/**
 * A hull: a U section lofted from a round stern to a pointed bow (u 0 stern .. 1 bow, along +z), the rim at
 * y ≈ 0 with a sheer, the keel at -depth. Returns { hull, deck } (the deck is a separate part for its own
 * colour), both indexed with smooth normals.
 */
function hullGeo(L, W, D) {
  const NU = 18;
  const NV = 10;
  const prof = (u) => {
    const hw = (W / 2) * (u < 0.45 ? 0.74 + 0.26 * Math.sin(((u / 0.45) * Math.PI) / 2) : 0.03 + 0.97 * Math.sqrt(Math.max(0, 1 - ((u - 0.45) / 0.56) ** 2)));
    const rim = D * 0.3 * (2 * u - 1) ** 2 + (u > 0.75 ? D * 0.35 * ((u - 0.75) / 0.25) ** 2 : 0);
    const dd = D * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, 0.15 + u * 0.95)));
    return [hw, rim, dd];
  };
  const pos = [];
  const idx = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU;
    const [hw, rim, dd] = prof(u);
    for (let j = 0; j <= NV; j++) {
      const th = (j / NV) * Math.PI;
      pos.push(hw * Math.cos(th), rim - dd * Math.pow(Math.sin(th), 0.8), (u - 0.5) * L);
    }
  }
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < NV; j++) {
      const a = i * (NV + 1) + j;
      const b = a + NV + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  // transom: a fan closing the stern
  const t0 = pos.length / 3;
  const [, rim0, d0] = prof(0);
  pos.push(0, rim0 - d0 * 0.45, -L / 2);
  for (let j = 0; j < NV; j++) idx.push(t0, j, j + 1);
  let hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hull.setIndex(idx);
  hull = mergeVertices(hull);
  hull.computeVertexNormals();
  // outward faces: the keel's normal must point down
  {
    const p = hull.attributes.position;
    let keel = 0;
    for (let i = 1; i < p.count; i++) if (p.getY(i) < p.getY(keel)) keel = i;
    if (hull.attributes.normal.getY(keel) > 0) {
      const ix = hull.index.array;
      for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
      hull.computeVertexNormals();
    }
  }
  // the deck: a thin slab inside the rim, a little below it
  const shape = new THREE.Shape();
  for (let i = 0; i <= NU; i++) {
    const u = i / NU;
    const [hw] = prof(u);
    const x = hw * 0.9;
    const z = (u - 0.5) * L * 0.97;
    if (i === 0) shape.moveTo(-x, z);
    else shape.lineTo(-x, z);
  }
  for (let i = NU; i >= 0; i--) {
    const u = i / NU;
    const [hw] = prof(u);
    shape.lineTo(hw * 0.9, (u - 0.5) * L * 0.97);
  }
  const deck = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false, curveSegments: 1 });
  deck.rotateX(Math.PI / 2); // shape y -> +z (along the hull), extrude +z -> down
  deck.translate(0, -D * 0.1, 0);
  deck.computeVertexNormals();
  return { hull, deck, prof };
}

// ---------------------------------------------------------------------------
// The sea's swell on the GPU: scenery.js keeps its wave table private, so this mirrors it (same
// constants, same rounding, as doubloon.js and maelstrom.js do); checkWaves() verifies the mirror once.
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
let wavesChecked = false;
function checkWaves() {
  if (wavesChecked) return;
  wavesChecked = true;
  for (const [x, z, t] of [[0, 0, 0], [13.7, -42.1, 3.3], [-97.2, 55.5, 41.9], [120.4, 8.8, 777.7], [-3.1, -131, 12345.6]]) {
    let h = 0;
    for (const w of SEA_WAVES) h += w.a * Math.sin(w.kx * x + w.kz * z - w.w * t + w.ph);
    if (Math.abs(h * AMP - waveHeight(x, z, t, AMP)) > 1e-6) {
      console.error('deep.js: SEA_WAVES no longer matches the waves in scenery.js; update the mirror');
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Shaders (all noOutline)
// ---------------------------------------------------------------------------
const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
const TAU_GLSL = '6.2831853';

// The moon: a camera-facing card at the horizon. A cel-shaded cream disc with an ink rim, a shaded
// crescent and craters, a soft halo round it; it sinks into the horizon haze at its foot.
const MOON_VERT = /* glsl */ `
varying vec2 vUv2;
varying vec3 vDir;
void main() {
  vUv2 = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const MOON_FRAG = /* glsl */ `
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uCrater;
uniform vec3 uRim;
uniform vec3 uHalo;
uniform vec3 uHaze;
uniform float uAlpha;
uniform float uHaloK;
uniform float uDip; // sine of the visible horizon's dip below level (the sea's far edge, seen from the camera)
varying vec2 vUv2;
varying vec3 vDir;
float disc(vec2 p, vec2 c, float r, float aa) { return 1.0 - smoothstep(r - aa, r + aa, length(p - c)); }
void main() {
  vec2 p = (vUv2 * 2.0 - 1.0) * ${glslNum(MOON.halo)};
  float r = length(p);
  float aa = max(fwidth(r), 1e-4) * 1.2;
  float body = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
  // lit from the upper left: the shade is a crescent on the lower right
  float lit = disc(p, vec2(-0.3, 0.26), 1.2, aa);
  vec3 col = mix(uShade, uLit, lit);
  // craters: a darker bowl, its upper-left wall in shadow
  vec3 CR[8];
  CR[0] = vec3(-0.38, 0.34, 0.22);
  CR[1] = vec3(0.22, 0.52, 0.13);
  CR[2] = vec3(0.42, -0.02, 0.2);
  CR[3] = vec3(-0.12, -0.32, 0.27);
  CR[4] = vec3(-0.58, -0.18, 0.12);
  CR[5] = vec3(0.12, 0.12, 0.08);
  CR[6] = vec3(0.5, -0.5, 0.11);
  CR[7] = vec3(-0.2, 0.7, 0.09);
  for (int i = 0; i < 8; i++) {
    vec3 c = CR[i];
    float inC = disc(p, c.xy, c.z, aa);
    float bowl = disc(p, c.xy + vec2(0.24, -0.24) * c.z, c.z * 0.84, aa);
    vec3 cc = mix(uCrater * 0.82, uCrater, bowl);
    col = mix(col, cc * mix(0.86, 1.0, lit), inC);
  }
  // ink rim
  col = mix(col, uRim, smoothstep(0.955 - aa, 0.955 + aa, r));
  float e = normalize(vDir).y + uDip;
  col = mix(col, uHaze, (1.0 - smoothstep(0.0, 0.07, e)) * 0.45);
  float halo = (1.0 - body) * exp(-(r - 1.0) * 3.0) * uHaloK * (1.0 - smoothstep(1.25, ${glslNum(MOON.halo - 0.02)}, r));
  float a = max(body, halo) * uAlpha * smoothstep(-0.006, 0.012, e);
  if (a < 0.003) discard;
  gl_FragColor = vec4(mix(uHalo, col, body), a);
  #include <colorspace_fragment>
}
`;

// Stars: points on the sky round the camera; a slow, small twinkle (≤ 0.5 Hz); the brightest get a cross.
const STAR_VERT = /* glsl */ `
attribute vec3 aStar; // size (px), brightness, phase
uniform float uTime;
varying float vB;
varying float vCross;
void main() {
  vec3 d = normalize(position);
  vec4 wp = vec4(cameraPosition + d * 650.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
  float tw = 0.82 + 0.18 * sin(uTime * ${TAU_GLSL} * (0.12 + 0.3 * fract(aStar.z * 0.37)) + aStar.z);
  vB = aStar.y * tw * smoothstep(0.03, 0.09, d.y);
  vCross = step(0.86, aStar.y);
  gl_PointSize = aStar.x * (1.0 + vCross * 1.6);
}
`;
const STAR_FRAG = /* glsl */ `
uniform float uAlpha;
uniform vec3 uColor;
varying float vB;
varying float vCross;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float a = 1.0 - smoothstep(0.12, 0.5, length(q) * (1.0 + vCross * 1.4));
  float cross = vCross * (1.0 - smoothstep(0.02, 0.07, min(abs(q.x), abs(q.y)))) * (1.0 - smoothstep(0.1, 0.5, max(abs(q.x), abs(q.y))));
  a = max(a, cross) * vB * uAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

// The moon path: glints on the water from the camera toward the moon (a strip that follows the camera,
// the glints fixed in the world so they don't swim; they drift slowly).
const GLINT_VERT = /* glsl */ `
uniform float uTime;
uniform float uAmp;
varying vec2 vW;
varying vec2 vL;
varying float vFogD;
${WAVE_GLSL}
void main() {
  vL = position.xz;
  vec4 wp = modelMatrix * vec4(position.x, 0.0, position.z, 1.0);
  float far = abs(wp.x - cameraPosition.x) + abs(wp.z - cameraPosition.z);
  wp.y = waveH(wp.xz, uTime, uAmp) + 0.1 + far * 0.0016;
  vW = wp.xz;
  vec4 mv = viewMatrix * wp;
  vFogD = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const GLINT_FRAG = /* glsl */ `
uniform float uDrift; // the glints' slow drift (still under reduced motion)
uniform float uGain;
uniform vec3 uColor;
uniform float uLen;
varying vec2 vW;
varying vec2 vL;
varying float vFogD;
float hash12(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  // vL.y: distance along the path; vL.x: across it
  float along = vL.y;
  float halfW = 2.5 + along * 0.075;
  float across = abs(vL.x) / halfW;
  float core = 1.0 - smoothstep(0.15, 1.0, across);
  // dashes: cells stretched across the path (glints are wider than long)
  vec2 g = vec2(vW.x * 0.55, vW.y * 1.6) + vec2(uDrift * 0.11, -uDrift * 0.05);
  g.x += floor(g.y) * 0.37; // stagger the rows
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash12(cell);
  float h2 = hash12(cell + 17.3);
  f += vec2(h2 - 0.5, fract(h2 * 7.1) - 0.5) * vec2(0.4, 0.3); // jitter each glint in its cell
  float len = 0.16 + 0.22 * fract(h * 13.7);
  float on = step(1.0 - (0.16 + 0.3 * core), h);
  float dash = (1.0 - smoothstep(0.1, 0.26, abs(f.y))) * (1.0 - smoothstep(len, len + 0.14, abs(f.x)));
  float a = on * dash * core;
  a *= smoothstep(14.0, 60.0, along) * (1.0 - smoothstep(uLen * 0.6, uLen, along));
  a *= uGain * (1.0 - 0.35 * smoothstep(80.0, 300.0, vFogD));
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

// Soft round glows (torches, the lair's eyes, the lantern, barnacles), pulled toward the camera so they sit
// in front of what they light. The pulse is GLOW_HZ (≤ 1 Hz) and small.
const GLOW_VERT = /* glsl */ `
attribute vec4 aGlow;   // half size, intensity, phase, pull towards the camera
attribute vec3 aColor;
attribute float aDim;   // 1: the lair's eyes, which go dim as the Kraken's dread rises (uDread)
uniform float uTime;
uniform float uDread;
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
  vI = aGlow.y * (0.88 + 0.12 * sin(uTime * ${TAU_GLSL} * ${glslNum(GLOW_HZ)} + aGlow.z)) * (1.0 - ${glslNum(LAIR_DIM.glow)} * aDim * uDread);
  vFogD = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const GLOW_FRAG = /* glsl */ `
uniform float fogNear;
uniform float fogFar;
uniform float uGain;
varying vec2 vC;
varying vec3 vCol;
varying float vI;
varying float vFogD;
void main() {
  float d = length(vC);
  float a = 1.0 - smoothstep(0.0, 1.0, d);
  a = a * a * vI * uGain;
  a *= 1.0 - 0.55 * smoothstep(fogNear, fogFar * 1.3, vFogD);
  a *= smoothstep(2.0, 8.0, vFogD);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol, a);
  #include <colorspace_fragment>
}
`;

// Cartoon flames as camera-facing cards: a teardrop with a pale core and an ink rim (the torches). The
// flame sways and licks; its size breathes at under 1 Hz.
const FLAME_VERT = /* glsl */ `
attribute vec4 aFl;   // half width, height, phase, 1 for the lair's eyes (they burn low under the dread)
uniform float uTime;
uniform float uDread;
varying vec2 vUv2;
varying float vPh;
varying float vFogD;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float f = 1.0 + 0.07 * sin(uTime * ${glslNum(FLAME_W.breathe)} + aFl.z) + 0.04 * sin(uTime * ${glslNum(FLAME_W.breathe2)} + aFl.z * 2.3);
  float low = 1.0 - ${glslNum(LAIR_DIM.flame)} * aFl.w * uDread;
  f *= low;
  mv.x += (uv.x - 0.5) * 2.0 * aFl.x * 1.35 * low;
  mv.y += (uv.y - 0.08) * aFl.y * f;
  vUv2 = uv;
  vPh = aFl.z;
  vFogD = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const FLAME_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uOuter;
uniform vec3 uMid;
uniform vec3 uCore;
uniform vec3 uInk;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec2 vUv2;
varying float vPh;
varying float vFogD;
float flameW(float y) {
  float q = (y - 0.3) / 0.3;
  float belly = sqrt(max(0.0, 1.0 - q * q));
  float top = pow(max(0.0, 1.0 - (y - 0.3) / 0.68), 1.25);
  return y < 0.3 ? belly : top;
}
void main() {
  float y = (vUv2.y - 0.08) / 0.92;
  float x = (vUv2.x - 0.5) * 2.0 * 1.35;
  x -= 0.36 * y * y * sin(uTime * ${glslNum(FLAME_W.sway)} + vPh + y * 3.0);
  float w = flameW(y) * (1.0 + 0.1 * sin(y * 11.0 - uTime * ${glslNum(FLAME_W.lick)} + vPh));
  float d = abs(x) / max(w, 1e-3);
  float fw = max(fwidth(d), 1e-3);
  if (y < 0.0 || y > 1.0 || d > 1.0 + fw) discard;
  vec3 col = uOuter;
  float w2 = flameW(y * 1.3 + 0.02) * 0.62;
  col = mix(col, uMid, 1.0 - smoothstep(w2 - 0.03, w2 + 0.03, abs(x)));
  float w3 = flameW(y * 1.9 + 0.05) * 0.36;
  col = mix(col, uCore, 1.0 - smoothstep(w3 - 0.03, w3 + 0.03, abs(x)));
  col = mix(col, uInk, smoothstep(1.0 - 2.2 * fw, 1.0 - fw, d));
  col = mix(col, fogColor, smoothstep(fogNear, fogFar, vFogD) * 0.55);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

// Jellyfish bells (instanced): a glowing body colour, a pale crown highlight, a brighter frilly skirt and a
// glowing rim. uGlow dims them (dread, dawn).
const JELLY_VERT = /* glsl */ `
uniform float uTime;
varying vec3 vCol;
varying vec3 vL;
varying vec3 vN;
varying vec3 vV;
varying float vFogD;
void main() {
  // the tentacles (below the bell) sway, more toward their tips; each jellyfish in its own phase
  vec3 pos = position;
  float hang = clamp(-pos.y, 0.0, 2.0);
  float ph = instanceMatrix[3].x * 0.71 + instanceMatrix[3].z * 0.53 + pos.y * 2.6;
  pos.x += 0.1 * hang * sin(uTime * ${TAU_GLSL} * ${glslNum(JELLY.swayHz)} + ph);
  pos.z += 0.1 * hang * cos(uTime * ${TAU_GLSL} * ${glslNum(JELLY.swayHz * 0.8)} + ph * 1.3);
  vec4 wp = modelMatrix * instanceMatrix * vec4(pos, 1.0);
  vec4 mv = viewMatrix * wp;
  #ifdef USE_INSTANCING_COLOR
  vCol = instanceColor;
  #else
  vCol = vec3(0.5, 0.97, 1.0);
  #endif
  vL = position;
  vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vV = normalize(-mv.xyz);
  vFogD = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const JELLY_FRAG = /* glsl */ `
uniform float uGlow;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec3 vCol;
varying vec3 vL;
varying vec3 vN;
varying vec3 vV;
varying float vFogD;
void main() {
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float rim = 1.0 - facing;
  vec3 body = vCol * (0.45 + 0.4 * uGlow);
  vec3 col = mix(body * 0.78, body, step(0.42, facing));          // two cel tones
  float skirt = smoothstep(0.32, 0.05, vL.y);
  col = mix(col, mix(vCol, vec3(1.0), 0.55), skirt * (0.5 + 0.5 * uGlow));  // the frilly skirt glows
  col += vCol * smoothstep(0.55, 0.85, rim) * 0.55 * uGlow;       // glowing rim
  // four rings on the crown, like a moon jellyfish's
  float ring = 0.0;
  for (int k = 0; k < 4; k++) {
    float a = 0.785398 + float(k) * 1.570796;
    float d = length(vL.xz - vec2(cos(a), sin(a)) * 0.3);
    ring = max(ring, 1.0 - smoothstep(0.035, 0.06, abs(d - 0.11)));
  }
  ring *= step(0.55, vL.y);
  col = mix(col, mix(vCol, vec3(1.0), 0.7), ring * (0.55 + 0.45 * uGlow));
  // a crisp highlight on the crown
  col = mix(col, vec3(1.0), (1.0 - step(0.15, length((vL - vec3(-0.34, 0.74, 0.22)) * vec3(1.0, 1.3, 1.6)))) * 0.85);
  col = mix(col, fogColor, smoothstep(fogNear, fogFar, vFogD) * 0.5);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;
// The jellyfish's glow on the water (instanced discs, additive); pulses with the bell (≤ 1 Hz).
const JGLOW_VERT = /* glsl */ `
attribute vec2 aPulse; // hz, phase
uniform float uTime;
uniform float uAmp;
varying vec2 vP;
varying vec3 vCol;
varying float vK;
varying float vFogD;
${WAVE_GLSL}
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  float far = abs(wp.x - cameraPosition.x) + abs(wp.z - cameraPosition.z);
  wp.y = waveH(wp.xz, uTime, uAmp) + 0.09 + far * 0.0016;
  vP = position.xz;
  #ifdef USE_INSTANCING_COLOR
  vCol = instanceColor;
  #else
  vCol = vec3(0.5, 0.97, 1.0);
  #endif
  vK = 0.74 + 0.26 * sin(uTime * ${TAU_GLSL} * aPulse.x + aPulse.y);
  vec4 mv = viewMatrix * wp;
  vFogD = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const JGLOW_FRAG = /* glsl */ `
uniform float uGain;
uniform float fogNear;
uniform float fogFar;
varying vec2 vP;
varying vec3 vCol;
varying float vK;
varying float vFogD;
void main() {
  float d = length(vP);
  float a = 1.0 - smoothstep(0.0, 1.0, d);
  a = a * a * vK * uGain;
  a *= 1.0 - 0.6 * smoothstep(fogNear, fogFar, vFogD);
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol, a);
  #include <colorspace_fragment>
}
`;
// Bubbles (instanced): pale cyan domes with a white glint and a brighter rim.
const BUBBLE_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying float vFogD;
void main() {
  vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vV = normalize(-mv.xyz);
  vFogD = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const BUBBLE_FRAG = /* glsl */ `
uniform vec3 uBody;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec3 vN;
varying vec3 vV;
varying float vFogD;
void main() {
  vec3 n = normalize(vN);
  float facing = abs(dot(n, normalize(vV)));
  float rim = 1.0 - smoothstep(0.35, 0.75, facing);
  vec3 col = mix(uBody * 0.75, uBody, rim);
  float glint = step(0.9, dot(n, normalize(vec3(-0.45, 0.6, 0.66))));
  col = mix(col, vec3(1.0), glint);
  col = mix(col, fogColor, smoothstep(fogNear, fogFar, vFogD) * 0.6);
  gl_FragColor = vec4(col, max(0.32 + 0.6 * rim, glint));
  #include <colorspace_fragment>
}
`;
// Ink slicks (instanced): a dark violet puddle riding the swell, a lighter rim and a glossy streak.
const SLICK_VERT = /* glsl */ `
attribute float aRad;
uniform float uTime;
uniform float uAmp;
varying float vR;
varying vec2 vP;
varying float vFogD;
${WAVE_GLSL}
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  float far = abs(wp.x - cameraPosition.x) + abs(wp.z - cameraPosition.z);
  wp.y = waveH(wp.xz, uTime, uAmp) + 0.12 + far * 0.0016;
  vR = aRad;
  vP = position.xz;
  vec4 mv = viewMatrix * wp;
  vFogD = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const SLICK_FRAG = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uEdge;
uniform vec3 uGloss;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying float vR;
varying vec2 vP;
varying float vFogD;
void main() {
  vec3 col = mix(uCore, uEdge, step(0.8, vR));
  // a glossy streak across the upper left, and a few bubbles of shine
  vec2 q = vP - vec2(-0.28, -0.3);
  float streak = (1.0 - smoothstep(0.05, 0.09, abs(length(q) - 0.42))) * step(0.0, -q.x - q.y * 0.4) * step(vR, 0.76);
  col = mix(col, uGloss, streak * 0.85);
  float dots = 1.0 - smoothstep(0.04, 0.06, length(vP - vec2(0.3, 0.22)));
  dots = max(dots, 1.0 - smoothstep(0.025, 0.04, length(vP - vec2(0.42, 0.06))));
  col = mix(col, uGloss, dots * 0.7);
  col = mix(col, fogColor, smoothstep(fogNear, fogFar, vFogD) * 0.7);
  gl_FragColor = vec4(col, 0.93);
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
export function build(scene, ctx = {}) {
  checkWaves();
  // prefers-reduced-motion: ctx.reducedMotion (a boolean, as main.js passes it at build time, or a function read
  // every frame), else the media query (as maelstrom.js and atolls.js do)
  const reduced = () => {
    if (typeof ctx?.reducedMotion === 'function') return !!ctx.reducedMotion();
    if (typeof ctx?.reducedMotion === 'boolean') return ctx.reducedMotion;
    try {
      return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    } catch {
      return false;
    }
  };
  const root = new THREE.Group();
  root.name = 'env-deep';
  scene.add(root);
  const stat = new THREE.Group(); // static scenery, merged per material at the end
  stat.name = 'deep-static';
  root.add(stat);
  const ownMaterials = [];
  const own = (m) => {
    ownMaterials.push(m);
    return m;
  };
  const ownGeos = [];
  const colliders = [];
  const glows = []; // { x, y, z, size, intensity, color, pull }
  const flames = []; // { x, y, z, w, h }
  const rand = mulberry32(9 * 7919 + 101);

  // Faceted toon for rock: lit per face, smooth normals kept for an unbroken ink line.
  const rockRamp = new THREE.DataTexture(new Uint8Array([78, 78, 78, 255, 140, 140, 140, 255, 200, 200, 200, 255, 255, 255, 255, 255]), 4, 1);
  rockRamp.minFilter = rockRamp.magFilter = THREE.NearestFilter;
  rockRamp.generateMipmaps = false;
  rockRamp.needsUpdate = true;
  const faceted = (color, emissive = 0x000000) => {
    const m = own(new THREE.MeshToonMaterial({ color, emissive, gradientMap: rockRamp }));
    m.flatShading = true;
    return setOutline(m, true);
  };
  const M = {
    rock: faceted(0x4a5294, 0x0b0d24),
    lair: faceted(0x6a55a6, 0x120a26),
    lairDark: toon(0x170d2c),
    sucker: toon(0xc8a8e8),
    barnacle: toon(0xd9d4ea),
    weed: toon(0x2c7a74),
    bone: toon(0xeee4c8),
    wood: toon(0x7a5a40),
    woodDark: toon(0x4e3a2c),
    deck: toon(0x96734f),
    hole: toon(0x1a1020),
    sail: toon(0xbab4c4),
    iron: toon(0x2c2a3c),
    flag: toon(0x5b2d8e, { side: THREE.DoubleSide }),
    flagMark: toon(0xf4efe0, { side: THREE.DoubleSide }),
    gold: toon(0xffcc44, { emissive: 0x6a4a00, emissiveIntensity: 0.6 }),
    farRock: toon(0x3a417c),
  };
  const glowDot = own(new THREE.MeshBasicMaterial({ color: 0x8ffcff }));
  noOutline(glowDot);
  const lanternGlass = own(new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  noOutline(lanternGlass);

  const sphere = (() => {
    const g = new THREE.SphereGeometry(1, 10, 7);
    ownGeos.push(g);
    return g;
  })();
  const smallSphere = (() => {
    const g = new THREE.SphereGeometry(1, 7, 5);
    ownGeos.push(g);
    return g;
  })();
  const toWorld = (obj, x, y, z) => {
    obj.updateWorldMatrix(true, false);
    return new THREE.Vector3(x, y, z).applyMatrix4(obj.matrixWorld);
  };
  // Barnacles (pale bumps) and glowing dots scattered round a point, on a surface facing `n`.
  function barnacles(parent, p, n, count, spread, size = 0.28, glow = 0.35) {
    const t1 = new THREE.Vector3(n.y, -n.x, 0.3).cross(n).normalize();
    const t2 = new THREE.Vector3().crossVectors(n, t1);
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * spread;
      const s = size * (0.6 + rand() * 0.8);
      const q = p.clone().addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r);
      const isGlow = rand() < glow;
      const m = mesh(parent, isGlow ? smallSphere : sphere, isGlow ? glowDot : M.barnacle, q.x, q.y, q.z);
      m.scale.setScalar(isGlow ? s * 0.55 : s);
      if (!isGlow) m.scale.multiply(new THREE.Vector3(1, 0.6, 1));
    }
  }

  // =========================================================================
  // 1. The Kraken Crew's lair: a sea cave carved like an octopus head
  // =========================================================================
  {
    const g = new THREE.Group();
    g.name = 'deep-lair';
    g.position.set(LAIR.x, 0, LAIR.z);
    g.rotation.y = Math.atan2(KRAKEN_ARENA.x - LAIR.x, KRAKEN_ARENA.z - LAIR.z); // local +z faces the arena
    stat.add(g);
    // the mantle dome, leaning back a little
    const dome = new THREE.Group();
    dome.rotation.x = -0.07;
    g.add(dome);
    const domeGeo = wonkyLathe(
      [
        [15.4, -2.5],
        [15.9, 1.0],
        [15.6, 5.0],
        [14.8, 9.0],
        [13.5, 13.0],
        [11.5, 17.0],
        [8.8, 20.5],
        [5.5, 23.2],
        [2.3, 24.7],
        [0, 25.2],
      ],
      40,
      (a, y) => 1 + 0.035 * Math.sin(a * 3 + y * 0.3) + 0.025 * Math.sin(a * 7 - y * 0.5) + 0.02 * Math.sin(a * 13 + y),
    );
    ownGeos.push(domeGeo);
    mesh(dome, domeGeo, M.lair);
    // bumps and ridges on the crown (a carved mantle, not a smooth bowl)
    for (const [a, y, s] of [[2.6, 19, 2.6], [3.6, 16, 2.2], [-2.4, 18, 2.4], [0.4, 21.5, 2.0], [-0.9, 14, 2.6], [1.5, 12, 2.4]]) {
      const rr = 13.6 - (y - 12) * 0.62;
      const m = mesh(dome, lumpGeo(Math.round(a * 100 + y), 0.18, 9, 7), M.lair, Math.sin(a) * rr, y, Math.cos(a) * rr);
      ownGeos.push(m.geometry);
      m.scale.set(s, s * 0.7, s);
    }
    // the eye sockets, each with a purple torch burning in it; frowning stone brows above
    for (const side of [-1, 1]) {
      const ex = side * 5.6;
      const ey = 12.4;
      const ez = 12.4;
      const yaw = side * Math.atan2(5.6, 12.6);
      const sock = mesh(dome, sphere, M.lairDark, ex, ey, ez);
      sock.scale.set(3.3, 2.8, 1.35);
      sock.rotation.set(0.12, yaw, 0);
      const bowl = mesh(dome, lathe([[0.15, -0.6], [0.95, 0.15], [1.05, 0.35], [0.85, 0.3]], 12), M.iron, ex * 1.02, ey - 1.5, ez + 1.15);
      ownGeos.push(bowl.geometry);
      const fw = toWorld(dome, ex * 1.03, ey - 1.3, ez + 1.45);
      flames.push({ x: fw.x, y: fw.y, z: fw.z, w: 1.25, h: 4.2, dim: 1 });
      const gw = toWorld(dome, ex * 1.03, ey + 0.6, ez + 2.4);
      glows.push({ x: gw.x, y: gw.y, z: gw.z, size: 8.5, intensity: 0.9, color: 0xb36bff, pull: 2.5, dim: 1 });
      const brow = taperTube(
        [new THREE.Vector3(side * 1.4, 15.3, 13.2), new THREE.Vector3(side * 4.6, 16.6, 12.9), new THREE.Vector3(side * 8.6, 16.4, 11.0), new THREE.Vector3(side * 10.3, 15.2, 9.6)],
        1.25,
        0.75,
        9,
        24,
      );
      ownGeos.push(brow.geo);
      mesh(dome, brow.geo, M.lair);
      barnacles(dome, new THREE.Vector3(side * 9.5, 8.5, 11.6), new THREE.Vector3(side * 0.6, 0.1, 0.8).normalize(), 7, 1.8, 0.3, 0.45);
    }
    // the cave mouth at the waterline: a dark arch with a rock lip and a few stone teeth
    {
      const mouth = mesh(dome, sphere, M.lairDark, 0, 1.2, 15.0);
      mouth.scale.set(4.7, 6.6, 1.5);
      const lipGeo = new THREE.TorusGeometry(5.1, 1.05, 8, 22, Math.PI);
      ownGeos.push(lipGeo);
      const lip = mesh(dome, lipGeo, M.lair, 0, 0.4, 15.35);
      lip.scale.set(1, 1.32, 1);
      for (const [x, y, l] of [[-2.3, 6.3, 1.5], [0, 6.9, 1.9], [2.3, 6.3, 1.5]]) {
        const tooth = mesh(dome, lathe([[0, -l], [0.42, -l * 0.35], [0.55, 0], [0, 0.05]], 8), M.bone, x, y, 15.9);
        ownGeos.push(tooth.geometry);
      }
    }
    // the little pier out of the mouth: planks on posts, barrels, a chest of gold, two torches
    {
      for (let k = 0; k < 5; k++) {
        const plank = mesh(g, rbox(4.2, 0.3, 1.25, 0.08), M.wood, 0, 1.15, 15.5 + k * 1.35);
        ownGeos.push(plank.geometry);
        plank.rotation.z = (rand() - 0.5) * 0.06;
      }
      for (const [x, z] of [[-1.8, 16.5], [1.8, 16.5], [-1.8, 21.1], [1.8, 21.1]]) {
        const post = mesh(g, new THREE.CylinderGeometry(0.22, 0.26, 3.2, 8), M.woodDark, x, -0.3, z);
        ownGeos.push(post.geometry);
      }
      for (const [x, z, ry] of [[-1.2, 17.0, 0.4], [-0.3, 16.4, 1.2]]) {
        const b = mesh(g, lathe([[0, -0.55], [0.42, -0.55], [0.52, 0], [0.42, 0.55], [0, 0.55]], 12), M.woodDark, x, 1.85, z);
        ownGeos.push(b.geometry);
        b.rotation.y = ry;
      }
      const chest = mesh(g, rbox(1.3, 0.8, 0.9, 0.12), M.wood, 1.2, 1.7, 16.6);
      ownGeos.push(chest.geometry);
      chest.rotation.y = -0.3;
      for (let k = 0; k < 6; k++) {
        const c = mesh(g, new THREE.CylinderGeometry(0.2, 0.2, 0.07, 10), M.gold, 1.0 + (rand() - 0.5) * 1.1, 2.15 + rand() * 0.15, 16.5 + (rand() - 0.5) * 0.6);
        ownGeos.push(c.geometry);
        c.rotation.set(rand() * 0.6, 0, rand() * 0.6);
      }
      for (const side of [-1, 1]) {
        const pole = mesh(g, new THREE.CylinderGeometry(0.17, 0.22, 4.4, 8), M.woodDark, side * 2.4, 2.9, 21.3);
        ownGeos.push(pole.geometry);
        const cup = mesh(g, lathe([[0.1, -0.4], [0.6, 0.1], [0.7, 0.3], [0.55, 0.25]], 10), M.iron, side * 2.4, 5.2, 21.3);
        ownGeos.push(cup.geometry);
        const fw = toWorld(g, side * 2.4, 5.35, 21.3);
        flames.push({ x: fw.x, y: fw.y, z: fw.z, w: 0.6, h: 2.0 });
        const gw = toWorld(g, side * 2.4, 6.3, 21.3);
        glows.push({ x: gw.x, y: gw.y, z: gw.z, size: 4.5, intensity: 0.75, color: 0xb36bff, pull: 1.5 });
      }
      const gw = toWorld(g, 0, 3.2, 17.5);
      glows.push({ x: gw.x, y: gw.y, z: gw.z, size: 5.5, intensity: 0.45, color: 0x9a5cff, pull: 1 });
    }
    // eight stone tentacles curling out over the sea, with suckers along them
    const ARMS = [
      // [angle from the front (deg), length, curl (rad), base height]
      [-31, 30, -0.3, 2.2],
      [31, 30, 0.3, 2.2],
      [-72, 26, 0.26, 2.0],
      [72, 27, -0.24, 2.0],
      [-118, 22, -0.3, 1.8],
      [118, 22, 0.3, 1.8],
      [-160, 18, -0.25, 1.6],
      [160, 18, 0.25, 1.6],
    ];
    const lairGroupInv = g;
    for (const [deg, len, curl, h0] of ARMS) {
      const a0 = deg * DEG;
      const ys = [h0, 1.3, -1.0, 0.9, 0.1, 2.4];
      const pts = [];
      for (let k = 0; k < ys.length; k++) {
        const u = k / (ys.length - 1);
        const rr = 12.4 + len * u;
        const a = a0 + curl * u * u;
        pts.push(new THREE.Vector3(Math.sin(a) * rr, ys[k], Math.cos(a) * rr));
      }
      // the tip curls up and back over itself
      const aT = a0 + curl;
      const rT = 12.4 + len;
      pts.push(new THREE.Vector3(Math.sin(aT + curl * 0.15) * (rT + 1.0), 4.1, Math.cos(aT + curl * 0.15) * (rT + 1.0)));
      pts.push(new THREE.Vector3(Math.sin(aT + curl * 0.3) * (rT - 0.6), 5.0, Math.cos(aT + curl * 0.3) * (rT - 0.6)));
      const r0 = 2.9;
      const r1 = 0.36;
      const ease = (u) => Math.pow(u, 0.75);
      const arm = taperTube(pts, r0, r1, 10, 70, ease);
      ownGeos.push(arm.geo);
      mesh(g, arm.geo, M.lair);
      const tip = mesh(g, sphere, M.lair, pts[pts.length - 1].x, pts[pts.length - 1].y, pts[pts.length - 1].z);
      tip.scale.setScalar(r1 * 1.05);
      // suckers on both sides, above the water
      const c = new THREE.Vector3();
      const tng = new THREE.Vector3();
      const side = new THREE.Vector3();
      for (let u = 0.2; u < 0.93; u += 0.055) {
        arm.curve.getPointAt(u, c);
        arm.curve.getTangentAt(u, tng);
        side.set(tng.z, 0, -tng.x).normalize();
        const rad = lerp(r0, r1, ease(u));
        for (const s of [-1, 1]) {
          const q = c.clone().addScaledVector(side, s * rad * 0.9);
          q.y += rad * 0.25;
          if (q.y < 0.25) continue;
          const sm = mesh(g, smallSphere, M.sucker, q.x, q.y, q.z);
          sm.scale.set(rad * 0.36, rad * 0.36, rad * 0.36);
          sm.lookAt(toWorld(g, q.x + side.x * s * 3, q.y + 0.6, q.z + side.z * s * 3));
          sm.scale.z *= 0.45;
        }
      }
      if (len >= 26) {
        arm.curve.getPointAt(0.42, c);
        barnacles(g, c.clone().setY(c.y + 1.2), new THREE.Vector3(0, 1, 0), 5, 1.2, 0.26, 0.6);
      }
      // colliders along the arm where it is out of the water, closer together where it is thin
      const armLen = arm.curve.getLength();
      for (let u = 0.12; u <= 1.0001; ) {
        arm.curve.getPointAt(Math.min(u, 1), c);
        const rad = lerp(r0, r1, ease(Math.min(u, 1)));
        u += Math.min(5, Math.max(3, rad * 1.8)) / armLen;
        if (c.y + rad < 0.3) continue;
        const w = toWorld(lairGroupInv, c.x, c.y, c.z);
        const d0 = Math.hypot(w.x - LAIR.x, w.z - LAIR.z);
        if (d0 < LAIR.r - 1) continue; // inside the dome's own collider
        colliders.push({ x: +w.x.toFixed(2), z: +w.z.toFixed(2), r: +(rad + 0.6).toFixed(2), h: +(c.y + rad + 0.5).toFixed(2) });
      }
    }
    // barnacles and glowing spots on the dome's skirt
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + 0.3;
      const y = 2.5 + rand() * 5;
      const rr = 15.9 - y * 0.08;
      const p = new THREE.Vector3(Math.sin(a) * rr, y, Math.cos(a) * rr);
      barnacles(dome, p, new THREE.Vector3(Math.sin(a), 0.15, Math.cos(a)).normalize(), 6, 1.6, 0.32, 0.4);
    }
    // the Kraken Crew's flag on the crown: purple, with a white octopus face
    {
      const pole = mesh(dome, new THREE.CylinderGeometry(0.2, 0.26, 8, 8), M.woodDark, 0, 28.6, -0.4);
      ownGeos.push(pole.geometry);
      const knob = mesh(dome, sphere, M.gold, 0, 32.7, -0.4);
      knob.scale.setScalar(0.38);
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.bezierCurveTo(1.6, 0.35, 3.0, -0.3, 4.6, 0.05);
      s.lineTo(4.1, -0.7);
      s.lineTo(4.7, -1.35);
      s.lineTo(4.0, -1.95);
      s.lineTo(4.5, -2.75);
      s.bezierCurveTo(3.0, -3.0, 1.6, -2.35, 0, -2.8);
      s.lineTo(0, 0);
      const flagGeo = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false, curveSegments: 6 });
      flagGeo.translate(0, 0, -0.04);
      // a little wave in the cloth
      {
        const p = flagGeo.attributes.position;
        for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + 0.35 * Math.sin(p.getX(i) * 1.4));
        flagGeo.computeVertexNormals();
      }
      ownGeos.push(flagGeo);
      const flag = mesh(dome, flagGeo, M.flag, 0.15, 32.3, -0.4);
      flag.rotation.y = 0.25;
      // the emblem, on both faces: a round head with two eyes and three curly legs
      for (const f of [1, -1]) {
        const em = new THREE.Group();
        em.position.set(2.15, -1.25, f * (0.12 + 0.35 * Math.sin(2.15 * 1.4)));
        flag.add(em);
        const head = mesh(em, new THREE.CircleGeometry(0.62, 16), M.flagMark, 0, 0.18, 0);
        ownGeos.push(head.geometry);
        head.scale.set(1, 0.9, 1);
        if (f < 0) head.rotation.y = Math.PI;
        for (const ex of [-0.22, 0.22]) {
          const eye = mesh(em, new THREE.CircleGeometry(0.13, 10), M.flag, ex, 0.22, f * 0.01);
          ownGeos.push(eye.geometry);
          if (f < 0) eye.rotation.y = Math.PI;
        }
        for (const lx of [-0.42, 0, 0.42]) {
          const leg = mesh(em, rbox(0.16, 0.62, 0.04, 0.06), M.flagMark, lx, -0.6, 0);
          ownGeos.push(leg.geometry);
          leg.rotation.z = lx * -0.9;
        }
      }
    }
    colliders.push({ x: LAIR.x, z: LAIR.z, r: LAIR.r, h: LAIR.h });
  }

  // =========================================================================
  // 2. Wrecks lying on their sides
  // =========================================================================
  for (const w of WRECKS) {
    const r = mulberry32(w.seed);
    const g = new THREE.Group();
    g.name = 'deep-wreck';
    const yaw = Math.PI - w.bow * DEG; // a ship's heading h: forward (sin h, cos h); bearing b is (sin b, -cos b)
    g.position.set(w.x, 0, w.z);
    g.rotation.y = yaw; // local +z (her bow) toward bearing w.bow
    stat.add(g);
    const pitch = new THREE.Group();
    pitch.rotation.x = -w.pitch; // bow up
    pitch.position.y = w.wid * 0.12;
    g.add(pitch);
    const hullG = new THREE.Group();
    hullG.rotation.z = w.roll; // on her side
    pitch.add(hullG);
    const { hull, deck, prof } = hullGeo(w.len, w.wid, w.depth);
    ownGeos.push(hull, deck);
    mesh(hullG, hull, M.wood);
    mesh(hullG, deck, M.deck);
    // the side that faces up: +x for a positive roll
    const up = Math.sign(w.roll);
    // a gunwale rail, broken planks and holes in the side, barnacles and weed at the waterline
    for (let k = 0; k < 3; k++) {
      const u = 0.25 + k * 0.22 + r() * 0.06;
      const [hw, rim, dd] = prof(u);
      const hole = mesh(hullG, sphere, M.hole, up * hw * 0.93, rim - dd * (0.3 + r() * 0.2), (u - 0.5) * w.len);
      hole.scale.set(0.35, 0.55 + r() * 0.3, 0.75 + r() * 0.4);
      hole.rotation.z = up * 0.3;
    }
    for (let k = 0; k < 5; k++) {
      const u = 0.12 + k * 0.17;
      const [hw, rim, dd] = prof(u);
      barnacles(hullG, new THREE.Vector3(up * hw * 0.98, rim - dd * 0.62, (u - 0.5) * w.len), new THREE.Vector3(up, -0.4, 0).normalize(), 6, 1.0, 0.24, 0.4);
    }
    // ribs where the stern broke open
    for (let k = 0; k < 3; k++) {
      const [hw, rim] = prof(0.04 + k * 0.05);
      const ribGeo = new THREE.TorusGeometry(hw * 0.95, 0.14, 6, 12, Math.PI * 0.9);
      ownGeos.push(ribGeo);
      const rib = mesh(hullG, ribGeo, M.woodDark, 0, rim + 0.3, -w.len / 2 - 0.4 - k * 0.7);
      rib.rotation.z = Math.PI + 0.15;
    }
    // bowsprit
    {
      const [, rimB] = prof(1);
      const bs = mesh(hullG, new THREE.CylinderGeometry(0.12, 0.2, w.len * 0.36, 7), M.woodDark, 0, rimB + 0.6, w.len / 2 + w.len * 0.12);
      ownGeos.push(bs.geometry);
      bs.rotation.x = Math.PI / 2 - 0.35;
    }
    // masts: lying over the sea, a torn sail hanging off each into the water
    for (const mz of w.masts) {
      const mh = w.len * (0.78 + r() * 0.1);
      const mast = mesh(hullG, new THREE.CylinderGeometry(0.16, 0.24, mh, 8), M.woodDark, 0, mh / 2, mz * w.len);
      ownGeos.push(mast.geometry);
      // a broken top: the last bit hangs at an angle
      // the crow's nest near the top
      const nest = mesh(hullG, lathe([[0.25, -0.35], [0.75, -0.3], [0.85, 0.35], [0.7, 0.4]], 12), M.wood, 0, mh * 0.86, mz * w.len);
      ownGeos.push(nest.geometry);
      // the sail: a tattered sheet hanging from the yard (it hangs down toward the sea, i.e. along -x after the roll)
      const s = new THREE.Shape();
      const sw = w.wid * 1.55;
      const sh = mh * 0.4;
      s.moveTo(-sw / 2, 0);
      s.lineTo(sw / 2, 0);
      const teeth = 6;
      for (let k = 0; k <= teeth; k++) {
        const x = sw / 2 - (k / teeth) * sw;
        const y = -sh * (0.7 + 0.3 * r()) + (k % 2 ? sh * 0.18 : 0);
        s.lineTo(x, y);
      }
      s.lineTo(-sw / 2, 0);
      const sg = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false, curveSegments: 1 });
      // billow
      {
        const p = sg.attributes.position;
        for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + 0.5 * Math.sin((p.getX(i) / sw + 0.5) * Math.PI) * Math.min(1, -p.getY(i) / sh + 0.2));
        sg.computeVertexNormals();
      }
      ownGeos.push(sg);
      // hang the sheet from the mast toward the sea: after the roll, world-down is (nearly) local -x for a
      // positive roll, +x for a negative one; the shape's top edge runs along the mast
      const sail = mesh(hullG, sg, M.sail, 0, mh * 0.58, mz * w.len);
      sail.rotation.set(0.15 * up, 0, (-up * Math.PI) / 2);
      // weed trailing off the mast
      const wv = toWorld(hullG, 0, mh * 0.95, mz * w.len);
      const weed = taperTube([wv.clone(), wv.clone().add(new THREE.Vector3(0.3, -0.9, 0.2)), wv.clone().add(new THREE.Vector3(-0.2, -1.8, 0.4))], 0.1, 0.05, 5, 10);
      ownGeos.push(weed.geo);
      mesh(stat, weed.geo, M.weed);
    }
    if (w.lantern) {
      // a stern lantern, still burning (a warm light in the cold night)
      const [hw, rim] = prof(0.02);
      const lp = new THREE.Vector3(up * hw * 0.6, rim + 1.2, -w.len / 2 + 0.2);
      const lan = mesh(hullG, lathe([[0, -0.45], [0.32, -0.42], [0.36, 0.2], [0.2, 0.42], [0, 0.48]], 10), lanternGlass, lp.x, lp.y, lp.z);
      ownGeos.push(lan.geometry);
      const cap = mesh(hullG, lathe([[0.36, 0], [0.2, 0.22], [0.05, 0.3], [0, 0.3]], 10), M.iron, lp.x, lp.y + 0.42, lp.z);
      ownGeos.push(cap.geometry);
      const gw = toWorld(hullG, lp.x, lp.y + 0.1, lp.z);
      glows.push({ x: gw.x, y: gw.y, z: gw.z, size: 4.2, intensity: 0.8, color: 0xffb84a, pull: 1.2 });
    }
    // a cannon poking out and two barrels floating by
    {
      const [hw, rim] = prof(0.55);
      const cn = mesh(hullG, new THREE.CylinderGeometry(0.2, 0.28, 1.6, 9), M.iron, up * (hw + 0.4), rim - 0.5, 0.05 * w.len);
      ownGeos.push(cn.geometry);
      cn.rotation.z = (up * Math.PI) / 2;
    }
    for (let k = 0; k < 2; k++) {
      const a = r() * Math.PI * 2;
      const d = w.wid * 0.8 + 1.5 + r() * 2;
      const b = mesh(stat, lathe([[0, -0.5], [0.4, -0.5], [0.5, 0], [0.4, 0.5], [0, 0.5]], 10), M.woodDark, w.x + Math.sin(a) * d, 0.05, w.z + Math.cos(a) * d);
      ownGeos.push(b.geometry);
      b.rotation.set(Math.PI / 2 - 0.2, r() * 3, 0.3);
    }
    // colliders: two circles along her length
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const cr = Math.max(w.wid * 0.62, w.len * 0.24) + 0.6;
    for (const s of [-1, 1]) {
      colliders.push({ x: +(w.x + fx * s * w.len * 0.24).toFixed(2), z: +(w.z + fz * s * w.len * 0.24).toFixed(2), r: +cr.toFixed(2), h: +(w.wid * 0.8 + 1).toFixed(2) });
    }
  }

  // =========================================================================
  // 3. The whale-skeleton arch: a spine arching over a channel, the skull and the tail at its feet
  // =========================================================================
  {
    // the arch stands square to the line from the middle of the sea, so it is seen side-on from the arena and
    // the channel under it runs outward; ux, uz: along the arch (tangential); nx, nz: across it (radial)
    const cx = ARCH.x;
    const cz = ARCH.z;
    const len = Math.hypot(cx, cz);
    const nx = cx / len;
    const nz = cz / len;
    const ux = -nz;
    const uz = nx;
    const A = new THREE.Vector3(cx - ux * ARCH.half, 0, cz - uz * ARCH.half); // the skull's foot
    const B = new THREE.Vector3(cx + ux * ARCH.half, 0, cz + uz * ARCH.half); // the tail's foot
    const spine = (s) => {
      const p = new THREE.Vector3().lerpVectors(A, B, s);
      p.y = -2.2 + (ARCH.height + 2.2) * Math.pow(Math.sin(Math.PI * s), 0.75);
      return p;
    };
    const N = 21;
    const tn = new THREE.Vector3();
    // the spinal cord: one bone tube through every vertebra, so the arch reads as one spine, not a dotted line
    {
      const pts = [];
      for (let k = 0; k <= 16; k++) {
        const p = spine(0.02 + (k / 16) * 0.96);
        if (p.y > -1.6) pts.push(p);
      }
      const cord = taperTube(pts, 0.62, 0.3, 9, 64);
      ownGeos.push(cord.geo);
      mesh(stat, cord.geo, M.bone);
    }
    const vertGeo = lathe([[0, -0.75], [0.95, -0.7], [1.15, -0.35], [1.0, 0], [1.15, 0.35], [0.95, 0.7], [0, 0.75]], 10);
    const spikeGeo = lathe([[0, 0], [0.5, 0.05], [0.36, 0.7], [0.12, 1.35], [0, 1.42]], 7);
    ownGeos.push(vertGeo, spikeGeo);
    const yAxis = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < N; i++) {
      const s = 0.035 + (i / (N - 1)) * 0.93;
      const p = spine(s);
      if (p.y < -1.2) continue;
      tn.subVectors(spine(Math.min(1, s + 0.01)), spine(Math.max(0, s - 0.01))).normalize();
      // the skull end is bigger; the tail dwindles
      const k = 1.25 - 0.55 * s;
      const v = mesh(stat, vertGeo, M.bone, p.x, p.y, p.z);
      v.quaternion.setFromUnitVectors(yAxis, tn);
      v.scale.set(k, k * 0.95, k);
      // the spine's spike points outward from the arch (up and away)
      const out = new THREE.Vector3(-tn.y * ux, tn.x * ux + tn.z * uz, -tn.y * uz); // the arch-plane normal-to-tangent
      if (out.y < 0) out.negate();
      const sp = mesh(stat, spikeGeo, M.bone, p.x + out.x * k * 0.8, p.y + out.y * k * 0.8, p.z + out.z * k * 0.8);
      sp.quaternion.setFromUnitVectors(yAxis, out.clone().addScaledVector(tn, -0.25).normalize());
      sp.scale.setScalar(k);
      if (i % 4 === 1) barnacles(stat, p.clone().addScaledVector(out, -k * 0.9), out.clone().negate(), 3, 0.5, 0.18, 0.7);
    }
    // the skull, half sunk at its foot, its snout pointing away from the arch (out of the channel)
    {
      const sk = new THREE.Group();
      sk.position.set(A.x - ux * 0.5, -0.4, A.z - uz * 0.5);
      sk.rotation.y = Math.atan2(-ux, -uz);
      sk.rotation.z = 0.16;
      stat.add(sk);
      const cran = mesh(sk, lumpGeo(77, 0.08, 16, 11), M.bone, 0, 1.4, 1.2);
      ownGeos.push(cran.geometry);
      cran.scale.set(3.6, 2.6, 3.4);
      const snout = mesh(sk, lathe([[0, -0.01], [1.9, 0], [1.75, 2.2], [1.25, 4.6], [0.6, 6.4], [0, 6.8]], 12), M.bone, 0, 0.9, 2.6);
      ownGeos.push(snout.geometry);
      snout.rotation.x = Math.PI / 2 - 0.08;
      snout.scale.set(1, 1, 0.55);
      for (const sd of [-1, 1]) {
        const eye = mesh(sk, sphere, M.hole, sd * 2.75, 2.2, 2.8);
        eye.scale.set(0.5, 0.75, 0.75);
        const jaw = taperTube([new THREE.Vector3(sd * 2.2, -0.2, 0.6), new THREE.Vector3(sd * 2.5, 0.2, 4.0), new THREE.Vector3(sd * 1.7, 0.5, 7.2), new THREE.Vector3(sd * 0.6, 0.4, 9.4)], 0.55, 0.3, 8, 18);
        ownGeos.push(jaw.geo);
        mesh(sk, jaw.geo, M.bone);
      }
      barnacles(sk, new THREE.Vector3(1.8, 2.8, 0.2), new THREE.Vector3(0.5, 0.8, 0.2).normalize(), 6, 1.3, 0.26, 0.5);
      const c = toWorld(sk, 0, 0, 2.6);
      colliders.push({ x: +c.x.toFixed(2), z: +c.z.toFixed(2), r: 4.4, h: 4.5 });
      const c2 = toWorld(sk, 0, 0, 7.8);
      colliders.push({ x: +c2.x.toFixed(2), z: +c2.z.toFixed(2), r: 2.4, h: 2 });
    }
    // ribs rising out of the sea beyond the tail's foot (outside the channel)
    {
      const across = new THREE.Vector3(nx, 0, nz);
      for (let k = 0; k < 4; k++) {
        const base = B.clone().addScaledVector(new THREE.Vector3(ux, 0, uz), 1.5 + k * 2.1);
        for (const sd of [-1, 1]) {
          const top = base.clone().add(new THREE.Vector3(0, 5.4 - k * 0.8, 0));
          const foot = base.clone().addScaledVector(across, sd * (4.2 - k * 0.4));
          foot.y = -1;
          const mid = base.clone().addScaledVector(across, sd * (3.6 - k * 0.3));
          mid.y = 3.6 - k * 0.6;
          const rib = taperTube([top, mid, foot], 0.32, 0.22, 7, 14);
          ownGeos.push(rib.geo);
          mesh(stat, rib.geo, M.bone);
        }
      }
      const tailC = B.clone().addScaledVector(new THREE.Vector3(ux, 0, uz), 4);
      colliders.push({ x: +B.x.toFixed(2), z: +B.z.toFixed(2), r: 2.0, h: 6 });
      colliders.push({ x: +tailC.x.toFixed(2), z: +tailC.z.toFixed(2), r: 4.4, h: 5 });
      const tailD = B.clone().addScaledVector(new THREE.Vector3(ux, 0, uz), 8);
      colliders.push({ x: +tailD.x.toFixed(2), z: +tailD.z.toFixed(2), r: 3.4, h: 3 });
      const inner = spine(0.03);
      colliders.push({ x: +A.x.toFixed(2), z: +A.z.toFixed(2), r: 2.0, h: Math.max(6, inner.y + 2) });
    }
  }

  // =========================================================================
  // 4. Rocks with glowing barnacles
  // =========================================================================
  ROCKS.forEach(([bearing, rr, size], i) => {
    const { x, z } = at(bearing, rr);
    const lumps = size > 3 ? 3 : 2;
    for (let k = 0; k < lumps; k++) {
      const s = k === 0 ? size : size * (0.38 + rand() * 0.2);
      const a = rand() * Math.PI * 2;
      const off = k === 0 ? 0 : size * (0.75 + rand() * 0.3);
      const m = mesh(stat, lumpGeo(300 + i * 7 + k, 0.24), M.rock, x + Math.sin(a) * off, -0.3 * s, z + Math.cos(a) * off);
      ownGeos.push(m.geometry);
      m.scale.set(s, s * (k === 0 ? 1.15 : 0.9), s * (0.85 + rand() * 0.3));
      m.rotation.y = rand() * 6;
      if (k === 0) {
        const p = new THREE.Vector3(x, s * 0.35, z);
        const n = new THREE.Vector3(-x, 2, -z).normalize(); // the side facing the middle of the sea
        barnacles(stat, p.clone().addScaledVector(n, s * 0.85), n, Math.round(4 + size), s * 0.5, 0.26, 0.55);
      }
    }
    colliders.push({ x, z, r: +(size * 1.05 + 0.3).toFixed(2), h: +(size * 1.1).toFixed(2) });
  });

  // =========================================================================
  // 5. Far sea stacks on the horizon (decoration; beyond the sea's edge)
  // =========================================================================
  {
    const r = mulberry32(4242);
    for (let k = 0; k < 13; k++) {
      const bearing = k * 27.7 + (r() - 0.5) * 12;
      const off = Math.abs(((bearing - MOON.bearing + 540) % 360) - 180);
      if (off < 14) continue; // keep the moon clear
      const rr = 200 + r() * 60;
      const R = 11 + r() * 8;
      const H = 18 + r() * 16;
      const { x, z } = at(bearing, rr);
      const g = spireGeo(900 + k, R, H, 8);
      ownGeos.push(g);
      const m = mesh(stat, g, M.farRock, x, -1, z);
      m.rotation.y = r() * 6;
      m.scale.set(1, 1, 0.75 + r() * 0.4);
      // a lower shoulder beside it
      const g2 = spireGeo(950 + k, R * 0.8, H * 0.45, 7);
      ownGeos.push(g2);
      const a = r() * Math.PI * 2;
      mesh(stat, g2, M.farRock, x + Math.sin(a) * R * 1.3, -1, z + Math.cos(a) * R * 1.3).rotation.y = r() * 6;
    }
  }

  mergeStatic(stat);

  // =========================================================================
  // 6. Torches and glows
  // =========================================================================
  const flameMesh = (() => {
    const pos = [];
    const uv = [];
    const aF = [];
    const index = [];
    flames.forEach((f, n) => {
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        pos.push(f.x, f.y, f.z);
        uv.push(u, v);
        aF.push(f.w, f.h, n * 2.3 + 0.7, f.dim ? 1 : 0);
      }
      const b = n * 4;
      index.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aFl', new THREE.Float32BufferAttribute(aF, 4));
    geo.setIndex(index);
    ownGeos.push(geo);
    const material = own(
      new THREE.ShaderMaterial({
        name: 'deep-flames',
        uniforms: {
          ...fogUniforms(),
          uTime: { value: 0 },
          uDread: { value: 0 },
          uOuter: { value: linear(0x8a2fe0) },
          uMid: { value: linear(0xd07bff) },
          uCore: { value: linear(0xfbeaff) },
          uInk: { value: new THREE.Color().setRGB(INK[0], INK[1], INK[2] + 0.02) },
        },
        vertexShader: FLAME_VERT,
        fragmentShader: FLAME_FRAG,
        fog: true,
        side: THREE.DoubleSide,
      }),
    );
    noOutline(material);
    const m = new THREE.Mesh(geo, material);
    m.name = 'deep-flames';
    m.frustumCulled = false;
    root.add(m);
    return m;
  })();
  // the barnacles' glow: a few soft cyan glows on the rocks and the arch
  for (const [bearing, rr, size] of ROCKS) {
    if (size < 3) continue;
    const { x, z } = at(bearing, rr);
    const n = new THREE.Vector3(-x, 0, -z).normalize();
    glows.push({ x: x + n.x * size, y: size * 0.6, z: z + n.z * size, size: size * 1.4, intensity: 0.35, color: 0x6ff6ff, pull: 1 });
  }
  const glowMesh = (() => {
    const pos = [];
    const uv = [];
    const aG = [];
    const aC = [];
    const aD = [];
    const index = [];
    glows.forEach((g, n) => {
      const c = linear(g.color);
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        pos.push(g.x, g.y, g.z);
        uv.push(u, v);
        aG.push(g.size, g.intensity, n * 1.7, g.pull);
        aC.push(c.r, c.g, c.b);
        aD.push(g.dim ? 1 : 0);
      }
      const b = n * 4;
      index.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aGlow', new THREE.Float32BufferAttribute(aG, 4));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(aC, 3));
    geo.setAttribute('aDim', new THREE.Float32BufferAttribute(aD, 1));
    geo.setIndex(index);
    ownGeos.push(geo);
    const material = own(
      new THREE.ShaderMaterial({
        name: 'deep-glows',
        uniforms: { ...fogUniforms(), uTime: { value: 0 }, uGain: { value: 1 }, uDread: { value: 0 } },
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: true,
      }),
    );
    noOutline(material);
    const m = new THREE.Mesh(geo, material);
    m.name = 'deep-glows';
    m.frustumCulled = false;
    m.renderOrder = 4;
    root.add(m);
    return m;
  })();

  // =========================================================================
  // 7. The moon, the stars and the moon path
  // =========================================================================
  const moonDir = new THREE.Vector3();
  const moonAt = (elevDeg) => {
    const b = MOON.bearing * DEG;
    const e = elevDeg * DEG;
    return moonDir.set(Math.sin(b) * Math.cos(e), Math.sin(e), -Math.cos(b) * Math.cos(e));
  };
  const moonMat = own(
    new THREE.ShaderMaterial({
      name: 'deep-moon',
      uniforms: {
        uLit: { value: linear(0xfff3d2) },
        uShade: { value: linear(0xd8cfb8) },
        uCrater: { value: linear(0xe4d9b8) },
        uRim: { value: linear(0x2a2a52) },
        uHalo: { value: linear(0xbcd0ff) },
        uHaze: { value: linear(palette.skyHorizon) },
        uAlpha: { value: 1 },
        uHaloK: { value: 0.42 },
        uDip: { value: 0 },
      },
      vertexShader: MOON_VERT,
      fragmentShader: MOON_FRAG,
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  );
  noOutline(moonMat);
  const moonGeo = new THREE.PlaneGeometry(2, 2);
  moonGeo.deleteAttribute('normal');
  ownGeos.push(moonGeo);
  const moon = new THREE.Mesh(moonGeo, moonMat);
  moon.name = 'deep-moon';
  moon.frustumCulled = false;
  moon.renderOrder = -998;
  moon.scale.setScalar(MOON.dist * Math.tan(MOON.radius * DEG) * MOON.halo);
  root.add(moon);

  const starMat = own(
    new THREE.ShaderMaterial({
      name: 'deep-stars',
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 }, uColor: { value: linear(0xf2f6ff) } },
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  );
  noOutline(starMat);
  const stars = (() => {
    const r = mulberry32(31337);
    const pos = [];
    const aS = [];
    for (let i = 0; i < STARS; i++) {
      const az = r() * Math.PI * 2;
      const e = (2.5 + Math.pow(r(), 1.6) * 52) * DEG;
      pos.push(Math.sin(az) * Math.cos(e), Math.sin(e), Math.cos(az) * Math.cos(e));
      const b = 0.35 + 0.65 * Math.pow(r(), 2.2);
      aS.push(1.6 + r() * 1.6, b, r() * 50);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aStar', new THREE.Float32BufferAttribute(aS, 3));
    ownGeos.push(geo);
    const p = new THREE.Points(geo, starMat);
    p.name = 'deep-stars';
    p.frustumCulled = false;
    p.renderOrder = -999;
    root.add(p);
    return p;
  })();

  const GLINT_LEN = 420;
  const glintMat = own(
    new THREE.ShaderMaterial({
      name: 'deep-moonpath',
      uniforms: {
        ...fogUniforms(),
        uTime: { value: 0 },
        uDrift: { value: 0 },
        uAmp: { value: AMP },
        uGain: { value: 0.8 },
        uLen: { value: GLINT_LEN },
        uColor: { value: linear(0xfff1cf) },
      },
      vertexShader: GLINT_VERT,
      fragmentShader: GLINT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    }),
  );
  noOutline(glintMat);
  const glint = (() => {
    // a fan from the camera toward the moon: local +z along the path, x across, growing wider
    const pos = [];
    const index = [];
    const NL = 40;
    for (let i = 0; i <= NL; i++) {
      const z = 10 + (i / NL) ** 1.6 * (GLINT_LEN - 10);
      const w = 2.5 + z * 0.075;
      for (const x of [-w, -w * 0.33, w * 0.33, w]) pos.push(x, 0, z);
    }
    for (let i = 0; i < NL; i++) {
      for (let j = 0; j < 3; j++) {
        const a = i * 4 + j;
        index.push(a, a + 4, a + 1, a + 1, a + 4, a + 5); // facing up
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(index);
    ownGeos.push(geo);
    const m = new THREE.Mesh(geo, glintMat);
    m.name = 'deep-moonpath';
    m.frustumCulled = false;
    m.renderOrder = 2;
    root.add(m);
    return m;
  })();

  // =========================================================================
  // 8. Glowing jellyfish (decor): bells + their glow on the water
  // =========================================================================
  const jellies = [];
  {
    const r = mulberry32(2718);
    const clear = (x, z, pad) => colliders.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + pad);
    const add = (x, z) => {
      if (jellies.length >= JELLY.max) return;
      if (!clear(x, z, 1.4) || Math.hypot(x, z) > WORLD_R + 6) return;
      const hz = lerp(JELLY.hz[0], JELLY.hz[1], r());
      jellies.push({
        x,
        z,
        hx: x,
        hz: z,
        size: 0.55 + r() * 0.6,
        hzP: Math.min(hz, PULSE_HZ_MAX),
        ph: r() * Math.PI * 2,
        orbit: 0.6 + r() * 2.2,
        w: (2 * Math.PI) / (28 + r() * 40) * (r() < 0.5 ? -1 : 1),
        a0: r() * Math.PI * 2,
        yaw: r() * Math.PI * 2,
        color: JELLY.colors[Math.floor(r() * JELLY.colors.length)],
      });
    };
    for (const [gx, gz, spread, count] of JELLY.groves) {
      for (let k = 0; k < count; k++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * spread;
        add(gx + Math.sin(a) * d, gz + Math.cos(a) * d);
      }
    }
    for (let k = 0, tries = 0; k < JELLY.loose && tries < 200; tries++) {
      const a = r() * Math.PI * 2;
      const d = 20 + r() * 100;
      const before = jellies.length;
      add(Math.sin(a) * d, Math.cos(a) * d);
      if (jellies.length > before) k++;
    }
  }
  const JN = jellies.length;
  const bellGeo = (() => {
    let g = lathe(
      [
        [0, -0.12],
        [0.88, -0.12],
        [1.0, 0.04],
        [0.99, 0.24],
        [0.9, 0.46],
        [0.72, 0.68],
        [0.46, 0.85],
        [0.2, 0.93],
        [0, 0.95],
      ],
      20,
    );
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g = mergeVertices(g);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      // a scalloped skirt
      const k = 1 + 0.07 * smoothstep(0.25, -0.1, y) * Math.cos(Math.atan2(z, x) * 8);
      p.setX(i, x * k);
      p.setZ(i, z * k);
    }
    g.computeVertexNormals();
    // JELLY.tentacles wavy tentacles hanging from under the rim and curling out (they glow like the skirt; the bell
    // floats with its rim just clear of the water, so their tops show and the rest trails under the sea)
    const parts = [g];
    for (let k = 0; k < JELLY.tentacles; k++) {
      const a = (k / JELLY.tentacles) * Math.PI * 2 + 0.4;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const pts = [];
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        const r = 0.6 + 0.2 * u + 0.14 * Math.sin(u * Math.PI * 2.2 + k);
        const side = 0.22 * Math.sin(u * Math.PI * 2.4 + k * 1.3);
        pts.push(new THREE.Vector3(ca * r - sa * side, -0.06 - u * JELLY.reach, sa * r + ca * side));
      }
      const t = taperTube(pts, 0.065, 0.02, 3, 12);
      parts.push(t.geo);
    }
    const merged = mergeGeometries(parts, false);
    for (const q of parts) q.dispose();
    return merged;
  })();
  ownGeos.push(bellGeo);
  const jellyMat = own(
    new THREE.ShaderMaterial({
      name: 'deep-jelly',
      uniforms: { ...fogUniforms(), uGlow: { value: 1 }, uTime: { value: 0 } },
      vertexShader: JELLY_VERT,
      fragmentShader: JELLY_FRAG,
      fog: true,
    }),
  );
  noOutline(jellyMat);
  const jellyMesh = new THREE.InstancedMesh(bellGeo, jellyMat, Math.max(1, JN));
  jellyMesh.name = 'deep-jellyfish';
  jellyMesh.frustumCulled = false;
  jellyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  jellyMesh.count = JN;
  const discGeo = (() => {
    const g = new THREE.CircleGeometry(1, 20);
    g.rotateX(-Math.PI / 2);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    return g;
  })();
  const jglowGeo = discGeo;
  {
    const pulse = new Float32Array(Math.max(1, JN) * 2);
    jellies.forEach((j, i) => {
      pulse[i * 2] = j.hzP;
      pulse[i * 2 + 1] = j.ph;
    });
    jglowGeo.setAttribute('aPulse', new THREE.InstancedBufferAttribute(pulse, 2));
  }
  ownGeos.push(jglowGeo);
  const jglowMat = own(
    new THREE.ShaderMaterial({
      name: 'deep-jellyglow',
      uniforms: { ...fogUniforms(), uTime: { value: 0 }, uAmp: { value: AMP }, uGain: { value: 0.6 } },
      vertexShader: JGLOW_VERT,
      fragmentShader: JGLOW_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    }),
  );
  noOutline(jglowMat);
  const jglowMesh = new THREE.InstancedMesh(jglowGeo, jglowMat, Math.max(1, JN));
  jglowMesh.name = 'deep-jellyglow';
  jglowMesh.frustumCulled = false;
  jglowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  jglowMesh.count = JN;
  jglowMesh.renderOrder = 3;
  {
    const c = new THREE.Color();
    jellies.forEach((j, i) => {
      jellyMesh.setColorAt(i, c.setHex(j.color));
      jglowMesh.setColorAt(i, c);
    });
    if (!JN) {
      jellyMesh.setColorAt(0, c.setHex(JELLY.colors[0]));
      jglowMesh.setColorAt(0, c);
    }
  }
  root.add(jellyMesh, jglowMesh);

  // =========================================================================
  // 9. Dread bubbles and ink slicks
  // =========================================================================
  const bubbleGeo = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.6);
  ownGeos.push(bubbleGeo);
  const bubbleMat = own(
    new THREE.ShaderMaterial({
      name: 'deep-bubbles',
      uniforms: { ...fogUniforms(), uBody: { value: linear(0x9ff2ff) } },
      vertexShader: BUBBLE_VERT,
      fragmentShader: BUBBLE_FRAG,
      transparent: true,
      fog: true,
    }),
  );
  noOutline(bubbleMat);
  const bubbleMesh = new THREE.InstancedMesh(bubbleGeo, bubbleMat, BUBBLES.max);
  bubbleMesh.name = 'deep-bubbles';
  bubbleMesh.frustumCulled = false;
  bubbleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bubbleMesh.count = 0;
  bubbleMesh.visible = false;
  root.add(bubbleMesh);
  const bubbles = [];
  {
    const r = mulberry32(161803);
    for (let i = 0; i < BUBBLES.max; i++) bubbles.push({ x: 0, z: 0, t0: -99, life: 1.0 + r() * 1.0, size: 0.3 + r() * 0.4, r });
  }

  const slickGeo = (() => {
    const pos = [0, 0, 0];
    const rad = [0];
    const index = [];
    const NS = 28;
    for (const ring of [0.55, 0.8, 0.86, 1.0]) {
      for (let i = 0; i < NS; i++) {
        const a = (i / NS) * Math.PI * 2;
        const wob = 1 + 0.09 * Math.sin(a * 3 + 0.7) + 0.06 * Math.sin(a * 5 + 2.1);
        pos.push(Math.cos(a) * ring * wob, 0, Math.sin(a) * ring * wob);
        rad.push(ring);
      }
    }
    for (let i = 0; i < NS; i++) index.push(0, 1 + ((i + 1) % NS), 1 + i);
    for (let k = 0; k < 3; k++) {
      const b0 = 1 + k * NS;
      const b1 = 1 + (k + 1) * NS;
      for (let i = 0; i < NS; i++) {
        const i1 = (i + 1) % NS;
        index.push(b0 + i, b0 + i1, b1 + i, b0 + i1, b1 + i1, b1 + i);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aRad', new THREE.Float32BufferAttribute(rad, 1));
    g.setIndex(index);
    return g;
  })();
  ownGeos.push(slickGeo);
  const slickMat = own(
    new THREE.ShaderMaterial({
      name: 'deep-slicks',
      uniforms: {
        ...fogUniforms(),
        uTime: { value: 0 },
        uAmp: { value: AMP },
        uCore: { value: linear(0x1b0f30) },
        uEdge: { value: linear(0x5b3c92) },
        uGloss: { value: linear(0x9a84d0) },
      },
      vertexShader: SLICK_VERT,
      fragmentShader: SLICK_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    }),
  );
  noOutline(slickMat);
  const slickMesh = new THREE.InstancedMesh(slickGeo, slickMat, SLICK_MAX);
  slickMesh.name = 'deep-slicks';
  slickMesh.frustumCulled = false;
  slickMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  slickMesh.count = 0;
  slickMesh.visible = false;
  slickMesh.renderOrder = 2;
  root.add(slickMesh);

  // =========================================================================
  // 10. Dread and dawn: repainting the shared sky, sea, clouds, lights and fog
  // =========================================================================
  const COLOR_KEYS = ['skyTop', 'skyHorizon', 'sunColor', 'waterSunColor', 'hemiSky', 'hemiGround', 'fogColor', 'waterDeep', 'waterShallow', 'waterFoam', 'cloudColor', 'cloudShade'];
  const NUM_KEYS = ['sunIntensity', 'hemiIntensity', 'fogNear', 'fogFar'];
  const toLinear = (p) => {
    const out = {};
    for (const k of COLOR_KEYS) if (p[k] !== undefined) out[k] = linear(p[k]);
    // the water mirrors the sun's own colour unless a palette gives it one (as scenery.js's setPalette does)
    if (p.waterSunColor === undefined && p.sunColor !== undefined) out.waterSunColor = linear(p.sunColor);
    for (const k of NUM_KEYS) if (p[k] !== undefined) out[k] = p[k];
    if (p.sunDir) out.sunDir = new THREE.Vector3().fromArray(p.sunDir).normalize();
    if (p.waterSunDir || p.sunDir) out.waterSunDir = new THREE.Vector3().fromArray(p.waterSunDir || p.sunDir).normalize();
    return out;
  };
  const BASE_L = toLinear(palette);
  const DREAD_L = { ...BASE_L, ...toLinear(DREAD) };
  const DAWN_L = { ...BASE_L, ...toLinear(DAWN) };
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
  let painted = false;
  function mix(kd, kw) {
    for (const k of COLOR_KEYS) P[k].copy(BASE_L[k]).lerp(DREAD_L[k], kd).lerp(DAWN_L[k], kw);
    for (const k of NUM_KEYS) P[k] = lerp(lerp(BASE_L[k], DREAD_L[k], kd), DAWN_L[k], kw);
    P.sunDir.copy(BASE_L.sunDir).lerp(DAWN_L.sunDir, kw).normalize();
    P.waterSunDir.copy(BASE_L.waterSunDir).lerp(DAWN_L.waterSunDir, kw).normalize();
    return P;
  }
  function paint(kd, kw) {
    const p = mix(kd, kw);
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
      u.uSunDir?.value.copy(p.waterSunDir);
      u.uSkyHorizon?.value.copy(p.skyHorizon);
      if (u.uCloudStrength) u.uCloudStrength.value = 0.16 * clamp01((p.sunDir.y - 0.2) / 0.3);
    }
    if (sky) {
      const u = sky.material.uniforms;
      u.uTop.value.copy(p.skyTop);
      u.uHorizon?.value.copy(p.skyHorizon);
      u.uFog?.value.copy(p.fogColor);
      u.uSunColor?.value.copy(p.sunColor);
      u.uSunDir?.value.copy(p.sunDir);
      u.uCloud?.value.copy(p.cloudColor);
      u.uCloudShade?.value.copy(p.cloudShade);
    }
    const cu = cloudUniforms(clouds);
    if (cu) {
      cu.uLit.value.copy(p.cloudColor);
      cu.uShade?.value.copy(p.cloudShade);
      cu.uSunDir?.value.copy(p.sunDir);
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
      sun.position.copy(p.sunDir).multiplyScalar(200);
    }
    moonMat.uniforms.uHaze.value.copy(p.skyHorizon);
    painted = kd > 0 || kw > 0;
  }

  const want = { dread: 0, dawn: 0 };
  const cur = { dread: 0, dawn: 0 };
  let dreadRise = -99; // when the dread last rose (for the burst of bubbles)
  let now = 0;
  let disposed = false;
  const level = (k, dflt) => (finite(k) ? clamp01(k) : dflt);
  function setDread(k = 1, opts = null) {
    const v = level(k, 1);
    if (v > want.dread + 1e-6) dreadRise = now;
    want.dread = v;
    if (reduced() || opts?.instant) cur.dread = v;
  }
  function setDawn(k = 1, opts = null) {
    const v = level(k, 1);
    want.dawn = v;
    if (reduced() || opts?.instant) cur.dawn = v;
  }
  let paintedD = 0;
  let paintedW = 0;

  // =========================================================================
  // 11. Per frame
  // =========================================================================
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e3 = new THREE.Euler();
  const pv = new THREE.Vector3();
  const sv = new THREE.Vector3();
  const look = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const stats = {
    jellies: JN,
    bubbles: 0,
    slicks: 0,
    // the fastest periodic change of any glow or light: glows, jellyfish, the torches' flames, the stars'
    // twinkle (≤ 0.42 Hz), the dread bubbles' wobble
    maxPulseHz: Math.max(GLOW_HZ, ...jellies.map((j) => j.hzP), ...Object.values(FLAME_W).map((w) => w / (2 * Math.PI)), 0.42, BUBBLES.wobbleHz),
    flashes: 0, // this sea never flashes (SPEC3 §15)
  };

  function update(t, dt, frame) {
    if (disposed) return;
    const step = finite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
    now = finite(t) ? t : now + step;
    const calm = reduced();

    // ---- dread and dawn ----
    for (const key of ['dread', 'dawn']) {
      if (calm) cur[key] = want[key];
      else {
        const d = want[key] - cur[key];
        const s = step / EASE[key];
        cur[key] = Math.abs(d) <= s ? want[key] : cur[key] + Math.sign(d) * s;
      }
    }
    const kd = smoothstep(0, 1, cur.dread) * (1 - smoothstep(0, 1, cur.dawn));
    const kw = smoothstep(0, 1, cur.dawn);
    if (kd !== paintedD || kw !== paintedW) {
      paint(kd, kw);
      paintedD = kd;
      paintedW = kw;
    }

    // ---- the camera: the moon and the stars stay on the sky round it; the moon path runs from it ----
    const cam = frame?.camera;
    const cx = cam?.position ? cam.position.x : PLAYER_START.x;
    const cy = cam?.position ? cam.position.y : 10;
    const cz = cam?.position ? cam.position.z : PLAYER_START.z + 17;
    // the moon sits on the visible horizon: the sea's far edge dips below level as the camera climbs
    const dip = Math.atan2(Math.max(0, cy), SEA_EDGE);
    moonMat.uniforms.uDip.value = Math.sin(dip);
    const elev = MOON.elev - MOON.setBy * kw - dip / DEG;
    moonAt(elev);
    moon.position.set(cx + moonDir.x * MOON.dist, cy + moonDir.y * MOON.dist, cz + moonDir.z * MOON.dist);
    moon.lookAt(cx, cy, cz);
    moonMat.uniforms.uAlpha.value = (1 - kw) * (1 - 0.2 * kd);
    moonMat.uniforms.uHaloK.value = 0.42 * (1 - kw);
    moon.visible = kw < 0.999;
    starMat.uniforms.uTime.value = now;
    starMat.uniforms.uAlpha.value = (1 - kw) * (1 - 0.35 * kd);
    stars.visible = kw < 0.999;
    glint.position.set(cx, 0, cz);
    glint.rotation.y = Math.atan2(moonDir.x, moonDir.z);
    glintMat.uniforms.uTime.value = now;
    glintMat.uniforms.uDrift.value = calm ? 0 : now;
    glintMat.uniforms.uGain.value = 0.8 * (1 - 0.85 * kw) * (1 - 0.4 * kd);
    glint.visible = kw < 0.99;

    // ---- torches and glows ----
    flameMesh.material.uniforms.uTime.value = now;
    flameMesh.material.uniforms.uDread.value = kd;
    glowMesh.material.uniforms.uTime.value = now;
    glowMesh.material.uniforms.uGain.value = 1 - 0.45 * kw;
    glowMesh.material.uniforms.uDread.value = kd;

    // ---- jellyfish: drift on slow loops, ride the swell, pulse (≤ 1 Hz); under the dread they dive ----
    const glow = (1 - 0.75 * kd) * (1 - 0.5 * kw);
    jellyMat.uniforms.uGlow.value = glow;
    if (!calm) jellyMat.uniforms.uTime.value = now; // (still under reduced motion)
    jglowMat.uniforms.uTime.value = now;
    jglowMat.uniforms.uGain.value = 0.6 * glow;
    const sink = JELLY.dive * kd;
    for (let i = 0; i < JN; i++) {
      const j = jellies[i];
      if (!calm) {
        const a = j.a0 + now * j.w;
        j.x = j.hx + Math.cos(a) * j.orbit;
        j.z = j.hz + Math.sin(a) * j.orbit;
      }
      const pulse = calm ? 0 : Math.sin(now * 2 * Math.PI * j.hzP + j.ph);
      const s = j.size;
      const y = waveHeight(j.x, j.z, now, AMP) + JELLY.lift * s - sink - (calm ? 0 : 0.05 * pulse);
      sv.set(s * (1 + 0.1 * pulse), s * (1 - 0.12 * pulse), s * (1 + 0.1 * pulse));
      e3.set(0.08 * Math.sin(now * 0.7 + j.ph), j.yaw, 0.08 * Math.cos(now * 0.6 + j.ph));
      q.setFromEuler(e3);
      m4.compose(pv.set(j.x, y, j.z), q, sv);
      jellyMesh.setMatrixAt(i, m4);
      const gs = s * 2.3;
      m4.makeScale(gs, 1, gs).setPosition(j.x, 0, j.z);
      jglowMesh.setMatrixAt(i, m4);
    }
    jellyMesh.instanceMatrix.needsUpdate = true;
    jglowMesh.instanceMatrix.needsUpdate = true;

    // ---- dread bubbles boiling up round the view's focus ----
    const fresh = 1 - smoothstep(4, 9, now - dreadRise);
    const amount = kd * (0.3 + 0.7 * fresh);
    const active = Math.round(BUBBLES.max * amount);
    if (active > 0) {
      if (cam?.matrixWorld) {
        cam.getWorldDirection(fwd);
        if (fwd.y < -0.05) {
          const k = Math.min(cy / -fwd.y, 60);
          look.set(cx + fwd.x * k, 0, cz + fwd.z * k);
        } else look.set(cx + fwd.x * 30, 0, cz + fwd.z * 30);
      } else look.set(PLAYER_START.x, 0, PLAYER_START.z);
      let n = 0;
      for (let i = 0; i < BUBBLES.max && n < active; i++) {
        const b = bubbles[i];
        let age = now - b.t0;
        if (age > b.life || age < 0) {
          const prev = i > 0 ? bubbles[i - 1] : null;
          if (prev && b.r() < 0.6 && Math.hypot(prev.x - look.x, prev.z - look.z) < BUBBLES.radius + 6) {
            const a = b.r() * Math.PI * 2;
            b.x = prev.x + Math.sin(a) * (0.8 + b.r() * 1.2);
            b.z = prev.z + Math.cos(a) * (0.8 + b.r() * 1.2);
          } else {
            const a = b.r() * Math.PI * 2;
            const d = 4 + Math.sqrt(b.r()) * BUBBLES.radius;
            b.x = look.x + Math.sin(a) * d;
            b.z = look.z + Math.cos(a) * d;
          }
          // never right under the lens
          const ox = b.x - cx;
          const oz = b.z - cz;
          const od = Math.hypot(ox, oz);
          if (od < BUBBLES.near) {
            const k = BUBBLES.near / Math.max(od, 1e-3);
            b.x = cx + (od > 1e-3 ? ox : fwd.x) * k;
            b.z = cz + (od > 1e-3 ? oz : fwd.z) * k;
          }
          b.t0 = now - b.r() * (b.t0 < -50 ? b.life * 0.7 : 0.2);
          age = now - b.t0;
        }
        const u = age / b.life;
        const grow = calm ? smoothstep(0, 0.2, u) * (1 - smoothstep(0.85, 1, u)) : smoothstep(0, 0.55, u) * (1 - smoothstep(0.88, 1, u)) * (1 + 0.12 * Math.sin(age * 2 * Math.PI * BUBBLES.wobbleHz));
        const s = Math.max(0.001, b.size * grow * (0.6 + 0.4 * amount));
        m4.makeScale(s, s * 0.85, s).setPosition(b.x, waveHeight(b.x, b.z, now, AMP) - s * 0.2, b.z);
        bubbleMesh.setMatrixAt(n++, m4);
      }
      bubbleMesh.count = n;
      bubbleMesh.visible = n > 0;
      bubbleMesh.instanceMatrix.needsUpdate = true;
      stats.bubbles = n;
    } else if (bubbleMesh.visible) {
      bubbleMesh.visible = false;
      bubbleMesh.count = 0;
      stats.bubbles = 0;
    }

    // ---- ink slicks from the mechanics' snapshot ----
    const list = frame?.hazards?.slicks;
    slickMat.uniforms.uTime.value = now;
    let ns = 0;
    if (list && list.length) {
      for (let i = 0; i < list.length && ns < SLICK_MAX; i++) {
        const s = list[i];
        if (!s || !finite(s.x) || !finite(s.z)) continue;
        const R = finite(s.r) && s.r > 0 ? s.r : SLICK_R;
        let k = 1;
        if (finite(s.k)) k = clamp01(s.k);
        else if (finite(s.t) && finite(s.T) && s.T > 0) k = smoothstep(0, 0.4, s.t) * (1 - smoothstep(s.T - SLICK_FADE, s.T, s.t));
        if (k <= 0.01) continue;
        const rr = R * (0.35 + 0.65 * k);
        e3.set(0, (finite(s.id) ? s.id : i) * 2.1 + s.x * 0.37, 0); // by id: steady when the oldest goes
        q.setFromEuler(e3);
        m4.compose(pv.set(s.x, 0, s.z), q, sv.set(rr, 1, rr));
        slickMesh.setMatrixAt(ns++, m4);
      }
    }
    slickMesh.count = ns;
    slickMesh.visible = ns > 0;
    if (ns) slickMesh.instanceMatrix.needsUpdate = true;
    stats.slicks = ns;
  }
  update(0, 0, null);

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (painted) paint(0, 0); // give the shared scenery its palette back
    scene.remove(root);
    const geos = new Set(ownGeos);
    root.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
      if (o.isInstancedMesh) o.dispose();
    });
    for (const g of geos) g.dispose();
    for (const m of ownMaterials) m.dispose();
    rockRamp.dispose();
  }

  return {
    worldRadius: WORLD_R,
    colliders,
    playerStart: { ...PLAYER_START },
    enemySpawns: ENEMY_SPAWNS.map((s) => ({ ...s })),
    reefs: [],
    crateSpots: CRATE_SPOTS.map((s) => ({ ...s })),
    krakenArena: { ...KRAKEN_ARENA },
    setDread,
    setDawn,
    get dread() {
      return cur.dread;
    },
    get dawn() {
      return cur.dawn;
    },
    stats,
    update,
    dispose,
    group: root,
  };
}

export const LAYOUT = { arenaClear: ARENA_CLEAR, moon: MOON, ease: EASE, pulseHzMax: PULSE_HZ_MAX };
