import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, gradientMap, setOutline, ensureIndex } from './style.js';

// Cartoon townsfolk and pirates for Sparrow's Floating Island.
//
// A person is ONE SkinnedMesh with rigid skinning: every vertex follows exactly one
// bone (weight 1), so it animates like a puppet of separate pivoting parts (hips,
// torso, head, upper/lower arms and legs, tool) but draws as one mesh with 3 draw
// calls (4 with a glowing lantern): bold ink for silhouettes, a thin ink line for
// interior details (eyes, noses, knots, cuffs: line-weight hierarchy keeps faces crisp
// close up and uncluttered far away) and no ink for pupils, brows, mouths and dots.
// Colours are vertex colours, so stripes, aprons, vests and trims are painted on the
// smooth lathed bodies instead of being extra meshes, and every person shares the same
// few cel-shaded materials (the toon gradient and ink-outline settings from style.js).
//
// Geometry contract: origin at the feet, facing +z, ~1.22 tall bare-headed at scale 1
// (~1.3 with a hat; kids are built smaller and default to scale 0.78). The person's
// left is +x. Seated actions ('sit', 'fish') put the seat (bottom of the hips) at
// y = SEAT_HEIGHT with the legs dangling; 'lean' rests the forearms on a rail at
// RAIL.y, RAIL.z; 'scrub' with { wall: true } scrubs a wall WALL_Z in front of the feet; 'mop'
// with { sweep: 0..1 } makes shorter strokes.
// Tools follow the hands: two-handed tools run through where the hands really are.

const PI = Math.PI;
const TAU = PI * 2;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => {
  x = clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
};
const frac = (x) => x - Math.floor(x);

export const ACTIONS = ['idle', 'walk', 'mop', 'scrub', 'wave', 'carry', 'fish', 'sit', 'cheer', 'hammer', 'fiddle', 'lean'];
/** Seat height for 'sit' / 'fish' (person units, multiply by the person's scale). */
export const SEAT_HEIGHT = 0.3;
/** Rail that 'lean' rests on: height and distance in front of the feet (person units). */
export const RAIL = { y: 0.64, z: 0.34 };
/** 'scrub' with { wall: true } scrubs a wall (a hull side) this far in front of the feet. */
export const WALL_Z = 0.45;
const BRUSH_H = 0.15; // hand height when the brush's suds touch the deck
const MOP_LEN = 1.3; // mop handle length (long, so it shows above a ship's rail while mopping)
const ROD_TIP = 1.43; // rod tip distance from the lower grip

const KINDS = ['pirate', 'man', 'woman', 'kid', 'old'];
const HATS = ['tricorn', 'bandana', 'cap', 'straw', 'kerchief', 'none'];
const TOOLS = ['mop', 'brush', 'bucket', 'crate', 'rod', 'fiddle', 'hammer', 'lantern', 'none'];

// ---------------------------------------------------------------------------
// Materials: shared by every person, never disposed
// ---------------------------------------------------------------------------
const LINE = { thickness: 0.0048 }; // people are small on screen: a little lighter than hull ink
const THIN_LINE = { thickness: 0.0026 };
let SHARED = null;
function materials() {
  if (!SHARED) {
    const make = (name, outline) => {
      const m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap(3) });
      m.name = name;
      return setOutline(m, outline);
    };
    SHARED = [
      make('people:ink', LINE), // silhouettes: heads, bodies, limbs, hats, tools
      make('people:thin', THIN_LINE), // interior details: eyes, noses, ears, knots, cuffs (light line weight)
      make('people:flat', false), // pupils, brows, mouths, blush, dots: no ink (stay readable when small)
      toon(0xffc04a, { emissive: 0xffa526, emissiveIntensity: 1.15, outline: false }), // lantern glass
    ];
  }
  return SHARED;
}
const INK = 0;
const THIN = 1;
const FLAT = 2;
const GLOW = 3;

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------
const SKIN = [0xffdcbf, 0xf9c9a0, 0xefb488, 0xe0a172, 0xc98756, 0xa86a43, 0x87502f];
const HAIR = [0x2b1d16, 0x4a2c1a, 0x7a4220, 0xc8641e, 0xe8b64a, 0x1d1b26, 0x5c3a24];
const GREY = [0xf4f2ee, 0xd8dce2, 0xbfc5cf];
const STRIPE = [0xe2383d, 0x2f5fd0, 0x26232e, 0x16a5a2, 0xe2383d, 0x2f5fd0];
const SHIRT = [0xe2383d, 0x3a6fd8, 0x16a5a2, 0xffc93c, 0x4fb35a, 0x8a5bd6, 0xf28a2e, 0xfaf3e3, 0xf58cb0, 0x6cc6e8];
const BLOUSE = [0xfff8ea, 0xfdf1d0, 0xfde0e6, 0xe2f3ff, 0xfff2b8];
const PANTS = [0x7a4a2b, 0x2c3e7a, 0xc9a56b, 0x5b5b6e, 0x3b3442, 0x6d7a3a, 0x8a3b3b, 0x3d5a8a];
const DRESS = [0xe2383d, 0x3a6fd8, 0x8a5bd6, 0x2fa84f, 0xf28a2e, 0xf06aa0, 0x16a5a2, 0xf5b82e];
const ACCENT = [0xe2383d, 0xffc93c, 0x8a5bd6, 0x2fa84f, 0x2f86ea, 0xf28a2e, 0xff5fa2, 0x16a5a2];
const VEST = [0x7a2f2f, 0x2f4a7a, 0x3e5a35, 0x5a3a26, 0x2a2a33, 0x8a5bd6];
const BOOTS = [0x3a2a24, 0x5a3420, 0x22202a, 0x6b4528];
const HATCOL = [0x2b2433, 0x3a2a24, 0x2c2f4a];
const STRAW = 0xf2cf6b;
const WHITE = 0xfffaf0;
const DARK = 0x1d1620;
const GOLD = 0xffcc3a;
const WOOD = 0xb67b45;
const IRON = 0x3b3a44;

function mix(a, b, t) {
  const ch = (c, s) => (c >> s) & 255;
  const m = (s) => Math.round(lerp(ch(a, s), ch(b, s), t));
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let autoSeed = 1;

// ---------------------------------------------------------------------------
// Look (all the random choices) and body proportions
// ---------------------------------------------------------------------------
function resolveLook(opts) {
  const seed = Number.isFinite(opts.seed) ? Math.floor(opts.seed) : (autoSeed++ * 7919) % 1000003;
  const rng = mulberry(Math.imul(seed | 0, 0x9e3779b1) ^ 0x85ebca6b);
  const pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length];
  const chance = (p) => rng() < p;
  const rk = pick(['pirate', 'pirate', 'man', 'woman', 'woman', 'kid', 'old']);
  const kind = KINDS.includes(opts.kind) ? opts.kind : rk;
  const hex = (v, d) => (Number.isFinite(v) ? v : d);

  const L = { kind, seed, phase: rng() * 50, blink: 2.8 + rng() * 2.2 };
  const girl = chance(0.5);
  L.girl = kind === 'woman' || ((kind === 'kid' || kind === 'old') && girl);
  L.skin = hex(opts.skin, pick(SKIN));
  const hairCol = pick(HAIR);
  L.hair = kind === 'old' ? pick(GREY) : hairCol;
  const accent = pick(ACCENT);
  L.accent = hex(opts.accent, accent);
  const stripeCol = pick(STRIPE);
  const shirtCol = pick(SHIRT);
  const blouseCol = pick(BLOUSE);
  const pantsCol = pick(PANTS);
  const dressCol = pick(DRESS);
  const vestCol = pick(VEST);
  L.boots = pick(BOOTS);
  const r1 = rng();
  const r2 = rng();
  const r3 = rng();
  const r4 = rng();
  const r5 = rng();
  const r6 = rng();
  let hat = 'none';
  L.stripes = false;
  L.sleeves = 'long';
  L.vest = null;
  L.apron = null;
  L.bodice = null;
  L.skirt = null;
  L.sash = null;
  L.belt = 0x4a2e1e;
  L.shorts = false;
  L.stockings = null;
  L.beard = null;
  L.moustache = false;
  L.eyepatch = false;
  L.pegLeg = false;
  L.earring = false;
  L.glasses = false;
  L.freckles = false;
  L.bald = false;
  L.hairStyle = 'crop';
  L.brow = 0.18; // brow tilt: + friendly/raised inner ends, - gruff
  L.nose = mix(L.skin, 0xe0573e, 0.18);
  L.hatColor = pick(HATCOL);
  L.hatTrim = GOLD;
  if (kind === 'pirate') {
    L.stripes = r1 < 0.7;
    L.shirt = hex(opts.shirt, L.stripes ? stripeCol : pick([0xfaf3e3, 0xfdebc8, shirtCol]));
    L.shirt2 = WHITE;
    L.sleeves = r2 < 0.55 ? 'rolled' : 'long';
    L.vest = !L.stripes && r3 < 0.7 ? vestCol : null;
    L.sash = L.accent;
    L.belt = null;
    L.shorts = r4 < 0.45;
    L.stockings = L.shorts ? pick([WHITE, L.skin, 0xe9e2cf]) : null;
    hat = pick(['bandana', 'bandana', 'tricorn', 'tricorn', 'none']);
    L.beard = chance(0.6) ? pick(['full', 'full', 'goatee']) : null;
    L.moustache = L.beard === 'full' || chance(0.5);
    L.eyepatch = r5 < 0.3;
    L.pegLeg = r6 < 0.18;
    L.earring = chance(0.5);
    L.brow = -0.12;
    L.nose = mix(L.skin, 0xe0573e, 0.3);
    L.bald = hat === 'none' && chance(0.4);
  } else if (kind === 'man') {
    L.shirt = hex(opts.shirt, shirtCol);
    L.shirt2 = mix(L.shirt, WHITE, 0.6);
    L.vest = r1 < 0.4 ? vestCol : null;
    L.apron = r2 < 0.3 ? pick([WHITE, 0xf2e6c8, 0xd9c8a8]) : null;
    hat = pick(['cap', 'straw', 'none', 'none', 'cap']);
    L.moustache = r3 < 0.4;
    L.beard = r4 < 0.15 ? 'goatee' : null;
    L.stripes = !L.vest && !L.apron && r5 < 0.25;
    L.shirt2 = L.stripes ? WHITE : L.shirt2;
  } else if (kind === 'woman') {
    L.shirt = hex(opts.shirt, blouseCol);
    L.shirt2 = L.shirt;
    L.sleeves = r1 < 0.6 ? 'puff' : 'long';
    L.bodice = L.accent === dressCol ? mix(dressCol, DARK, 0.35) : mix(dressCol, DARK, 0.25);
    L.skirt = dressCol;
    L.skirtTrim = L.accent;
    L.apron = r2 < 0.5 ? pick([WHITE, 0xfff1d6]) : null;
    L.stockings = pick([WHITE, 0xf2e8d8, L.skin]);
    L.belt = null;
    hat = pick(['kerchief', 'straw', 'none', 'none']);
    L.hairStyle = pick(['bun', 'long', 'ponytail', 'bun']);
    L.brow = 0.3;
  } else if (kind === 'kid') {
    if (L.girl) {
      L.shirt = hex(opts.shirt, blouseCol);
      L.shirt2 = L.shirt;
      L.sleeves = 'puff';
      L.skirt = dressCol;
      L.skirtTrim = WHITE;
      L.bodice = dressCol;
      L.stockings = pick([WHITE, L.skin]);
      L.belt = null;
      hat = pick(['none', 'none', 'straw', 'kerchief']);
      L.hairStyle = pick(['pigtails', 'pigtails', 'ponytail']);
    } else {
      L.stripes = r1 < 0.5;
      L.shirt = hex(opts.shirt, L.stripes ? stripeCol : shirtCol);
      L.shirt2 = WHITE;
      L.sleeves = 'rolled';
      L.shorts = true;
      L.stockings = L.skin;
      hat = pick(['cap', 'bandana', 'none', 'none']);
      L.hairStyle = 'mop';
    }
    L.freckles = r3 < 0.5;
    L.brow = 0.35;
  } else if (L.girl) {
    // grandma: shawl over a long skirt, grey bun, spectacles
    L.shirt = hex(opts.shirt, pick([0xfaf3e3, 0xf3e6f0, 0xe2f3ff]));
    L.shirt2 = L.shirt;
    L.bodice = pick([0x8a5bd6, 0x2f4a7a, 0x7a2f2f, 0x3e7a5a, 0xc0607a]);
    L.skirt = pick([0x5a4a7a, 0x2f4a7a, 0x6b4528, 0x3e5a35, 0x8a3b3b]);
    L.skirtTrim = mix(L.skirt, WHITE, 0.45);
    L.apron = r1 < 0.4 ? WHITE : null;
    L.stockings = 0x4a4a55;
    L.belt = null;
    L.glasses = r2 < 0.7;
    L.hairStyle = 'bun';
    hat = pick(['none', 'none', 'kerchief', 'straw']);
    L.brow = 0.3;
  } else {
    // old
    L.shirt = hex(opts.shirt, pick([0xfaf3e3, 0xcfe0f0, 0xe8d9b8, shirtCol]));
    L.shirt2 = L.shirt;
    L.vest = r1 < 0.6 ? vestCol : null;
    L.glasses = r2 < 0.65;
    L.beard = r3 < 0.5 ? 'full' : null;
    L.moustache = !L.beard && r4 < 0.6;
    L.bald = r5 < 0.6;
    hat = pick(['none', 'none', 'cap', 'straw']);
    L.brow = 0.25;
    L.nose = mix(L.skin, 0xe0573e, 0.22);
  }
  L.pants = hex(opts.pants, pantsCol);
  L.hat = HATS.includes(opts.hat) ? opts.hat : hat;
  if (L.hat === 'bandana') L.hatColor = kind === 'pirate' ? pick([0xe2383d, 0xe2383d, 0x2f5fd0, 0x2fa84f, 0x8a5bd6]) : L.accent;
  if (L.hat === 'kerchief') L.hatColor = L.accent === L.skirt ? mix(L.accent, WHITE, 0.4) : L.accent;
  if (L.hat === 'cap') L.hatColor = pick([0x2c3e7a, 0x3b3442, 0x6b4528, 0x5b5b6e, 0xe2383d]);
  if (L.hat === 'straw') L.hatColor = STRAW;
  if (typeof opts.beard === 'boolean') {
    L.beard = opts.beard ? L.beard || 'full' : null;
    if (!opts.beard) L.moustache = false;
    if (opts.beard) L.moustache = true;
  }
  if (typeof opts.eyepatch === 'boolean') L.eyepatch = opts.eyepatch;
  if (typeof opts.pegLeg === 'boolean') L.pegLeg = opts.pegLeg;
  if (L.kind === 'kid') L.beard = null;
  if (L.kind === 'kid' || L.skirt) L.pegLeg = false; // the peg needs a trouser leg
  L.tool = TOOLS.includes(opts.tool) ? opts.tool : 'none';
  const defScale = kind === 'kid' ? 0.78 : kind === 'old' ? 0.96 : 1;
  L.scale = Number.isFinite(opts.scale) && opts.scale > 0 ? opts.scale : defScale;
  return L;
}

function proportions(L) {
  const P = {
    hipY: 0.41, legX: 0.085, legY: -0.05, thigh: 0.18, shin: 0.18, thighR: 0.066, shinR: 0.056,
    torsoY: 0.05, torsoH: 0.34, rw: 0.15, rb: 0.182, rc: 0.178, rs: 0.165, zs: 0.84,
    shX: 0.188, shY: 0.25, headY: 0.33, R: 0.2, a: 0.155, b: 0.165, armR: 0.054, foreR: 0.047, handR: 0.066,
    pelvisR: 0.158, hunch: 0, boot: 0.075,
  };
  if (L.kind === 'pirate') Object.assign(P, { rw: 0.158, rb: 0.198, rc: 0.188, rs: 0.17, shX: 0.196, pelvisR: 0.165 });
  if (L.kind === 'woman') {
    Object.assign(P, { rw: 0.128, rb: 0.15, rc: 0.165, rs: 0.148, shX: 0.168, armR: 0.048, foreR: 0.042, handR: 0.06,
      thighR: 0.058, shinR: 0.05, R: 0.196, pelvisR: 0.15, boot: 0.066 });
  }
  if (L.kind === 'kid') {
    Object.assign(P, {
      hipY: 0.31, thigh: 0.13, shin: 0.13, thighR: 0.056, shinR: 0.049, torsoH: 0.27, rw: 0.13, rb: 0.152, rc: 0.145,
      rs: 0.13, shX: 0.148, shY: 0.195, headY: 0.262, R: 0.215, a: 0.12, b: 0.13, armR: 0.045, foreR: 0.04, handR: 0.058,
      pelvisR: 0.135, boot: 0.064,
    });
  }
  if (L.kind === 'old') {
    if (L.girl) {
      Object.assign(P, { rw: 0.14, rb: 0.165, rc: 0.17, rs: 0.15, shX: 0.172, armR: 0.05, foreR: 0.044, handR: 0.06,
        thighR: 0.058, shinR: 0.05, R: 0.196, pelvisR: 0.155, boot: 0.066 });
    }
    Object.assign(P, { hunch: 0.2, rb: L.girl ? P.rb : 0.19 });
  }
  P.C = P.R; // head centre above the head bone
  P.reach = P.a + P.b;
  return P;
}

// ---------------------------------------------------------------------------
// Geometry kit: template primitives (cloned when baked), painted lathes, part list
// ---------------------------------------------------------------------------
const tmpl = new Map();
function cached(key, make) {
  let g = tmpl.get(key);
  if (!g) {
    g = make();
    tmpl.set(key, g);
  }
  return g;
}
const SPH = () => cached('s', () => new THREE.SphereGeometry(1, 14, 10));
const SPH_LO = () => cached('sl', () => new THREE.SphereGeometry(1, 8, 6));
const SPH_MID = () => cached('sm', () => new THREE.SphereGeometry(1, 11, 8));
const SPH_HI = () => cached('sh', () => new THREE.SphereGeometry(1, 20, 14));
/** Sphere resolution by size: small details don't need many triangles. */
function sphereFor(r) {
  return r < 0.03 ? SPH_LO() : r < 0.062 ? SPH_MID() : SPH();
}

// Low detail (buildPerson's `detail: 'low'`), for people only ever seen a few dozen pixels tall
// (the townsfolk behind the shipyard): about a third of the triangles. Spheres, lathes, rings and
// tubes get fewer segments and specks under SPECK (eye glints, freckles, rivets) are left out; the
// silhouette, colours and ink lines stay the same. Set only while buildPerson runs.
let LOW = false;
const SPECK = 0.01;
const SPH_TINY = () => cached('st', () => new THREE.SphereGeometry(1, 6, 4));
const SPH_HEAD_LO = () => cached('shl', () => new THREE.SphereGeometry(1, 11, 8));
function coarse(geo) {
  const p = geo.parameters;
  if (!p) return geo; // lathes are built coarse (paintLathe), rounded boxes are plain already
  const fewer = (n, k, min) => Math.max(min, Math.round(n * k));
  switch (geo.type) {
    case 'SphereGeometry':
      if (p.thetaLength < PI) return cached(`cap-lo${p.thetaLength}`, () => new THREE.SphereGeometry(1, 10, 5, 0, TAU, 0, p.thetaLength));
      return p.widthSegments >= 20 ? SPH_HEAD_LO() : p.widthSegments >= 14 ? SPH_LO() : SPH_TINY();
    case 'TorusGeometry':
      return torus(p.radius, p.tube, fewer(p.tubularSegments, 0.5, 6), fewer(p.radialSegments, 0.6, 3), p.arc);
    case 'CylinderGeometry':
      return cyl(p.radiusTop, p.radiusBottom, p.height, fewer(p.radialSegments, 0.6, 5), p.openEnded);
    case 'ConeGeometry':
      return cone(p.radius, p.height, fewer(p.radialSegments, 0.6, 5));
    case 'CapsuleGeometry':
      return cached(`c-lo${p.radius.toFixed(4)},${p.length.toFixed(4)}`, () => new THREE.CapsuleGeometry(p.radius, p.length, 1, fewer(p.radialSegments, 0.75, 5)));
    default:
      return geo;
  }
}
const CAP_SEG = (r) => cached(`cap${r}`, () => new THREE.SphereGeometry(1, 18, 8, 0, TAU, 0, r));
const capsule = (r, len, seg = 8) =>
  cached(`c${r.toFixed(4)},${len.toFixed(4)},${seg}`, () => new THREE.CapsuleGeometry(r, Math.max(0.001, len), 2, seg));
const cyl = (rt, rb, h, seg = 12, open = false) =>
  cached(`y${rt},${rb},${h},${seg},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
const torus = (R, r, ts = 18, rs = 6, arc = TAU) =>
  cached(`t${R},${r},${ts},${rs},${arc.toFixed(4)}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc));
const rbox = (w, h, d, r = 0.02) =>
  cached(`b${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2, h / 2, d / 2) * 0.999));
const cone = (r, h, seg = 10) => cached(`o${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg, 1));

/**
 * Lathe with per-quad colours and analytic smooth normals (so the ink outline stays
 * unbroken across colour edges). ctrl: [[r, y], ...] bottom to top; it is smoothed and
 * resampled into `rows` rows of equal arc length. paint(row, y, ang, down) -> hex, where ang
 * is the angle from the front (+z), -PI..PI, positive towards +x, and down is true on
 * rows facing downwards (undersides).
 */
function paintLathe(ctrl, rows, segs, paint) {
  if (LOW) {
    rows = Math.max(4, Math.ceil(rows * 0.5));
    segs = Math.max(8, Math.ceil(segs * 0.55));
  }
  const curve = new THREE.SplineCurve(ctrl.map(([r, y]) => new THREE.Vector2(r, y)));
  const pts = curve.getSpacedPoints(rows);
  for (const p of pts) p.x = Math.max(0, p.x);
  if (ctrl[0][0] === 0) pts[0].x = 0;
  if (ctrl[ctrl.length - 1][0] === 0) pts[rows].x = 0;
  const n = pts.length;
  const nr = new Float32Array(n);
  const ny = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const a = pts[Math.max(0, k - 1)];
    const b = pts[Math.min(n - 1, k + 1)];
    let x = b.y - a.y;
    let y = -(b.x - a.x);
    const l = Math.hypot(x, y) || 1;
    x /= l;
    y /= l;
    if (pts[k].x < 1e-5) {
      x = 0;
      y = k === 0 ? -1 : 1;
    }
    nr[k] = x;
    ny[k] = y;
  }
  // vertices are shared between neighbouring quads of the same colour and split only
  // along colour edges (sharp stripes), so plain areas cost no more than a normal lathe
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];
  const map = new Map();
  const c = new THREE.Color();
  const vert = (kk, jj, hex) => {
    const key = (kk * (segs + 1) + jj) * 16777216 + hex;
    let v = map.get(key);
    if (v !== undefined) return v;
    v = pos.length / 3;
    const a = (jj / segs) * TAU;
    const sn = Math.sin(a);
    const co = Math.cos(a);
    pos.push(pts[kk].x * sn, pts[kk].y, pts[kk].x * co);
    nor.push(nr[kk] * sn, ny[kk], nr[kk] * co);
    c.setHex(hex);
    col.push(c.r, c.g, c.b);
    map.set(key, v);
    return v;
  };
  for (let k = 0; k < n - 1; k++) {
    for (let j = 0; j < segs; j++) {
      let am = ((j + 0.5) / segs) * TAU;
      if (am > PI) am -= TAU;
      const hex = paint(k, (pts[k].y + pts[k + 1].y) / 2, am, ny[k] + ny[k + 1] < -1.1) & 0xffffff;
      const a = vert(k, j, hex);
      const b = vert(k + 1, j, hex);
      const cc = vert(k + 1, j + 1, hex);
      const d = vert(k, j + 1, hex);
      idx.push(a, d, cc, a, cc, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** Lathe profile of a (tapered) capsule: bottom sphere r0 at y0, top sphere r1 at y1. */
function capsuleProfile(r0, y0, r1, y1, steps = 3) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = -PI / 2 + (i / steps) * (PI / 2);
    pts.push([r0 * Math.cos(a), y0 + r0 * Math.sin(a)]);
  }
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (PI / 2);
    pts.push([r1 * Math.cos(a), y1 + r1 * Math.sin(a)]);
  }
  pts[0][0] = 0;
  pts[pts.length - 1][0] = 0;
  return pts;
}

class Kit {
  constructor() {
    this.bones = [];
    this.parts = [];
  }
  bone(name, parent, x = 0, y = 0, z = 0) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    b.userData.rest = b.position.clone();
    if (parent) parent.add(b);
    this.bones.push(b);
    return b;
  }
  /** Add a part to a bone: geo (template, cloned when baked), colour (hex, or null when
   *  the geometry carries its own colours), material slot, position / Euler / scale. */
  put(bone, geo, color, slot = INK, p, r, s) {
    if (geo === SPH() && s !== undefined) geo = sphereFor(typeof s === 'number' ? s : Math.max(s[0], s[1], s[2]));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    if (r) q.setFromEuler(new THREE.Euler(r[0], r[1], r[2], r[3] || 'XYZ'));
    const sc = s === undefined ? V3(1, 1, 1) : typeof s === 'number' ? V3(s, s, s) : V3(s[0], s[1], s[2]);
    m.compose(p ? V3(p[0], p[1], p[2]) : V3(), q, sc);
    this.add(bone, geo, color, slot, m);
    return m;
  }
  /** Add a part with an explicit matrix. */
  putM(bone, geo, color, slot, m) {
    if (geo === SPH()) geo = sphereFor(m.getMaxScaleOnAxis());
    this.add(bone, geo, color, slot, m);
  }
  add(bone, geo, color, slot, m) {
    if (LOW) {
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      if (geo.boundingSphere.radius * m.getMaxScaleOnAxis() < SPECK) return;
      geo = coarse(geo);
    }
    this.parts.push({ bone, geo, color, slot, m });
  }
  /** Ellipsoid stretched between two points (tails, brims, moustaches). */
  blob(bone, color, slot, a, b, w, h, roll = 0) {
    const d = V3().subVectors(b, a);
    const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), d.clone().normalize());
    if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), roll));
    const m = new THREE.Matrix4().compose(a.clone().addScaledVector(d, 0.5), q, V3(w, h, len / 2));
    this.putM(bone, SPH(), color, slot, m);
  }
  /** Capsule between two points. */
  rod(bone, color, slot, a, b, r, seg = 8) {
    const d = V3().subVectors(b, a);
    const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
    const m = new THREE.Matrix4().compose(a.clone().addScaledVector(d, 0.5), q, V3(1, 1, 1));
    this.putM(bone, capsule(r, len, seg), color, slot, m);
  }
}

// ---------------------------------------------------------------------------
// Body parts
// ---------------------------------------------------------------------------

/** Head surface helper: point on the skull ellipsoid in front, plus an orientation whose +z is the surface normal. */
function skull(P) {
  const ax = P.R;
  const ay = P.R * 0.97;
  const az = P.R * 0.93;
  return (x, y, lift = 0) => {
    const yy = y - P.C;
    const k = 1 - (x / ax) ** 2 - (yy / ay) ** 2;
    const z = az * Math.sqrt(Math.max(0, k));
    const n = V3(x / (ax * ax), yy / (ay * ay), z / (az * az)).normalize();
    const p = V3(x, y, z).addScaledVector(n, lift);
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), n);
    return { p, q, n };
  };
}

function buildHead(K, head, eyes, mouth, L, P) {
  const R = P.R;
  const C = P.C;
  const on = skull(P);
  const skin = L.skin;
  const hair = L.hair;
  // neck + skull + ears + nose
  K.put(head, capsule(0.055, 0.08, 8), skin, INK, [0, 0.03, 0]);
  K.put(head, SPH_HI(), skin, INK, [0, C, 0], null, [R, R * 0.97, R * 0.93]);
  // a fuller jaw for grown-up men
  if (L.kind === 'pirate' || L.kind === 'man' || (L.kind === 'old' && !L.girl)) {
    K.put(head, SPH(), skin, THIN, [0, C - R * 0.36, R * 0.08], null, [R * 0.86, R * 0.62, R * 0.82]);
  }
  for (const sd of [-1, 1]) {
    K.put(head, SPH(), skin, THIN, [sd * R * 0.97, C - 0.012, -0.01], [0, 0, sd * 0.15], [R * 0.17, R * 0.27, R * 0.21]);
  }
  const np = on(0, C - R * 0.17, R * 0.12);
  const noseS = L.kind === 'pirate' ? 1.15 : L.kind === 'kid' ? 0.8 : L.kind === 'woman' ? 0.78 : 1;
  K.put(head, SPH(), L.nose, THIN, [np.p.x, np.p.y, np.p.z], null, [R * 0.27 * noseS, R * 0.24 * noseS, R * 0.26 * noseS]);

  // eyes (on the 'eyes' bone so they can blink)
  const ey = C + R * 0.1;
  const ex = R * 0.37;
  const eyeW = R * 0.27;
  const eyeH = R * (L.kind === 'kid' ? 0.4 : 0.35);
  for (const sd of [-1, 1]) {
    const patched = L.eyepatch && sd < 0; // patch over the right eye (-x)
    const s = on(sd * ex, ey, -R * 0.02);
    // the eyes bone sits at (0, ey, 0) in head space
    const local = V3(s.p.x, s.p.y - ey, s.p.z);
    if (patched) {
      const pp = on(sd * ex, ey, 0.0);
      K.putM(head, SPH(), DARK, THIN, new THREE.Matrix4().compose(pp.p, pp.q, V3(eyeW * 1.15, eyeH * 0.95, R * 0.08)));
      continue;
    }
    K.putM(eyes, SPH(), WHITE, THIN, new THREE.Matrix4().compose(local, s.q, V3(eyeW, eyeH, R * 0.2)));
    // pupil looks slightly inward and down: friendly
    const pl = local.clone().add(V3(-sd * eyeW * 0.18, -eyeH * 0.08, 0)).addScaledVector(s.n, R * 0.16);
    K.putM(eyes, SPH(), DARK, FLAT, new THREE.Matrix4().compose(pl, s.q, V3(eyeW * 0.55, eyeH * 0.55, R * 0.06)));
    const hl = pl.clone().add(V3(eyeW * 0.2, eyeH * 0.22, 0)).addScaledVector(s.n, R * 0.05);
    K.putM(eyes, SPH_LO(), 0xffffff, FLAT, new THREE.Matrix4().compose(hl, s.q, V3(R * 0.05, R * 0.05, R * 0.02)));
  }
  // eyepatch strap
  if (L.eyepatch) {
    const m = new THREE.Matrix4().compose(V3(0, C + R * 0.12, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.18, 0, 0.42)), V3(1, 1, 0.94));
    K.putM(head, torus(R * 1.01, R * 0.035, 28, 4), DARK, FLAT, m);
  }
  // brows
  for (const sd of [-1, 1]) {
    if (L.eyepatch && sd < 0) continue;
    const b = on(sd * ex, ey + eyeH + R * 0.13, R * 0.01);
    const q = b.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), PI / 2 - sd * L.brow));
    const col = L.kind === 'old' ? mix(hair, 0x8a8a8a, 0.3) : mix(hair, DARK, 0.35);
    K.putM(head, capsule(R * 0.055, R * 0.24, 6), col, FLAT, new THREE.Matrix4().compose(b.p, q, V3(1, 1, 0.6)));
  }
  // smile, open mouth, blush, freckles
  const my = C - R * 0.43;
  const mp = on(0, my, -R * 0.005);
  const arc = PI * 0.62;
  const smileQ = mp.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), -PI / 2 - arc / 2));
  if (!(L.beard === 'full')) {
    K.putM(head, torus(R * 0.22, R * 0.045, 12, 5, arc), DARK, FLAT, new THREE.Matrix4().compose(mp.p.clone().add(V3(0, R * 0.12, 0)), smileQ, V3(1, 1, 1)));
  }
  // open mouth lives on the mouth bone (scaled to nothing when closed)
  const om = on(0, my + R * 0.02, -R * 0.03);
  const omL = om.p.clone().sub(V3(0, my, 0));
  K.putM(mouth, SPH(), 0x5a1620, FLAT, new THREE.Matrix4().compose(omL, om.q, V3(R * 0.2, R * 0.16, R * 0.09)));
  K.putM(mouth, SPH_LO(), 0xff7a8a, FLAT, new THREE.Matrix4().compose(omL.clone().add(V3(0, -R * 0.07, R * 0.03)), om.q, V3(R * 0.12, R * 0.06, R * 0.06)));
  const blush = mix(L.skin, 0xff6f7d, 0.45);
  for (const sd of [-1, 1]) {
    const c = on(sd * R * 0.6, C - R * 0.28, R * 0.0);
    K.putM(head, SPH_LO(), blush, FLAT, new THREE.Matrix4().compose(c.p, c.q, V3(R * 0.17, R * 0.11, R * 0.05)));
    if (L.freckles) {
      for (let k = 0; k < 3; k++) {
        const f = on(sd * R * (0.48 + 0.09 * k), C - R * (0.2 + (k % 2) * 0.07), R * 0.01);
        K.putM(head, SPH_LO(), mix(L.skin, 0x8a4a22, 0.55), FLAT, new THREE.Matrix4().compose(f.p, f.q, V3(R * 0.035, R * 0.035, R * 0.02)));
      }
    }
  }
  // beard and moustache
  if (L.beard === 'full') {
    K.put(head, SPH(), hair, INK, [0, C - R * 0.62, R * 0.42], null, [R * 0.8, R * 0.62, R * 0.55]);
    K.put(head, SPH(), hair, THIN, [0, C - R * 0.92, R * 0.48], null, [R * 0.5, R * 0.42, R * 0.38]);
    for (const sd of [-1, 1]) {
      K.put(head, SPH(), hair, THIN, [sd * R * 0.66, C - R * 0.25, R * 0.12], null, [R * 0.28, R * 0.5, R * 0.42]);
    }
  } else if (L.beard === 'goatee') {
    K.put(head, SPH(), hair, THIN, [0, C - R * 0.78, R * 0.62], [0.4, 0, 0], [R * 0.3, R * 0.36, R * 0.22]);
  }
  if (L.moustache) {
    for (const sd of [-1, 1]) {
      const a = on(sd * R * 0.05, C - R * 0.3, R * 0.05).p;
      const b = on(sd * R * 0.42, C - R * 0.42, R * 0.06).p;
      K.blob(head, hair, THIN, a, b, R * 0.12, R * 0.12);
    }
  }
  if (L.earring) K.put(head, torus(R * 0.1, R * 0.025, 10, 4), GOLD, FLAT, [-R * 0.99, C - R * 0.27, 0], [0, PI / 2, 0]);
  if (L.glasses) {
    for (const sd of [-1, 1]) {
      const g = on(sd * ex, ey, R * 0.2);
      K.putM(head, torus(R * 0.33, R * 0.04, 16, 4), DARK, FLAT, new THREE.Matrix4().compose(g.p, g.q, V3(1, 1, 1)));
    }
    const br = on(0, ey + R * 0.05, R * 0.2).p;
    K.rod(head, DARK, FLAT, br.clone().add(V3(-R * 0.08, 0, 0)), br.clone().add(V3(R * 0.08, 0, 0)), R * 0.035, 5);
  }
  buildHair(K, head, L, P);
  buildHat(K, head, L, P);
}

function buildHair(K, head, L, P) {
  const R = P.R;
  const C = P.C;
  const hair = L.hair;
  const hat = L.hat;
  const covered = hat === 'bandana' || hat === 'kerchief' || hat === 'tricorn' || hat === 'cap';
  if (L.bald) {
    // fringe around the back and sides only
    K.put(head, SPH(), hair, INK, [0, C - R * 0.1, -R * 0.42], null, [R * 0.92, R * 0.55, R * 0.62]);
    for (const sd of [-1, 1]) K.put(head, SPH(), hair, THIN, [sd * R * 0.82, C + R * 0.05, -R * 0.1], [0, 0, sd * 0.3], [R * 0.26, R * 0.36, R * 0.42]);
    return;
  }
  if (!covered && hat !== 'straw') {
    // a cartoon hair "helmet" sitting on top and round the back, clear of the brows
    K.put(head, SPH(), hair, INK, [0, C + R * 0.36, -R * 0.3], null, [R * 1.07, R * 0.76, R * 0.98]);
    if (L.kind === 'kid' && !L.girl) {
      // a tousled kid's mop: three tufts over the forehead
      for (let k = -1; k <= 1; k++) {
        K.put(head, SPH(), hair, THIN, [k * R * 0.38, C + R * 0.74, R * 0.42], [0.5, 0, -k * 0.4], [R * 0.3, R * 0.22, R * 0.36]);
      }
    } else if (!L.girl) {
      K.put(head, SPH(), hair, THIN, [R * 0.18, C + R * 0.82, R * 0.28], [0.6, 0, -0.3], [R * 0.42, R * 0.24, R * 0.4]);
    } else {
      // side-swept fringe
      K.put(head, SPH(), hair, THIN, [R * 0.25, C + R * 0.74, R * 0.4], [0.7, 0, -0.5], [R * 0.48, R * 0.24, R * 0.36]);
      K.put(head, SPH(), hair, THIN, [-R * 0.3, C + R * 0.72, R * 0.38], [0.7, 0, 0.6], [R * 0.4, R * 0.22, R * 0.32]);
    }
  } else {
    // just a little hair showing under the hat at the back
    K.put(head, SPH(), hair, INK, [0, C - R * 0.12, -R * 0.42], null, [R * 0.88, R * 0.58, R * 0.6]);
  }
  if (L.girl || L.kind === 'woman') {
    if (L.hairStyle === 'bun' && hat !== 'straw') {
      K.put(head, SPH(), hair, INK, [0, C + R * 0.62, -R * 0.78], null, R * 0.42);
    } else if (L.hairStyle === 'long') {
      K.put(head, SPH(), hair, INK, [0, C - R * 0.55, -R * 0.6], [0.2, 0, 0], [R * 0.98, R * 1.05, R * 0.48]);
    } else if (L.hairStyle === 'ponytail') {
      K.put(head, SPH(), mix(L.accent, WHITE, 0.1), THIN, [0, C + R * 0.3, -R * 0.96], null, R * 0.15);
      K.blob(head, hair, INK, V3(0, C + R * 0.3, -R * 1.02), V3(0, C - R * 0.75, -R * 1.25), R * 0.26, R * 0.3);
    } else if (L.hairStyle === 'pigtails') {
      for (const sd of [-1, 1]) {
        K.blob(head, hair, INK, V3(sd * R * 0.95, C + R * 0.05, -R * 0.2), V3(sd * R * 1.25, C - R * 0.75, -R * 0.25), R * 0.25, R * 0.27);
        K.put(head, SPH(), L.accent, THIN, [sd * R * 1.0, C + R * 0.02, -R * 0.2], null, R * 0.14);
      }
    }
  }
}

function buildHat(K, head, L, P) {
  const R = P.R;
  const C = P.C;
  const hat = L.hat;
  const col = L.hatColor;
  if (hat === 'bandana' || hat === 'kerchief') {
    // a domed cloth cap, tipped up at the front so it clears the brows
    const tilt = hat === 'bandana' ? -0.5 : -0.62;
    const m = new THREE.Matrix4().compose(V3(0, C + R * 0.06, -R * 0.03),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0)), V3(R * 1.08, R * 1.05, R * 1.06));
    K.putM(head, CAP_SEG(PI * 0.5), col, INK, m);
    // knot and tails at the back
    const kz = -R * 1.02;
    const ky = hat === 'bandana' ? C + R * 0.05 : C - R * 0.12;
    K.put(head, SPH(), col, THIN, [0, ky, kz], null, [R * 0.22, R * 0.2, R * 0.16]);
    for (const sd of [-1, 1]) {
      K.blob(head, col, THIN, V3(sd * R * 0.06, ky - R * 0.02, kz - R * 0.04), V3(sd * R * 0.32, ky - R * 0.62, kz - R * 0.2), R * 0.12, R * 0.05, sd * 0.3);
    }
    if (hat === 'bandana') {
      // white polka dots on the cloth
      const dots = [[0.0, 0.25], [0.9, 0.42], [-0.9, 0.42], [1.9, 0.5], [-1.9, 0.5], [2.8, 0.35], [-2.8, 0.35], [0.45, 0.62], [-0.45, 0.62]];
      for (const [az, el] of dots) {
        const dir = V3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
        const v = dir.clone().applyEuler(new THREE.Euler(tilt, 0, 0));
        const p = V3(v.x * R * 1.09, v.y * R * 1.06 + C + R * 0.06, v.z * R * 1.07 - R * 0.03);
        const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), v.clone().normalize());
        if (v.y > 0.02) K.putM(head, SPH_LO(), WHITE, FLAT, new THREE.Matrix4().compose(p, q, V3(R * 0.085, R * 0.085, R * 0.025)));
      }
    }
  } else if (hat === 'tricorn') {
    const y0 = C + R * 0.62;
    // crown
    K.put(head, SPH(), col, INK, [0, y0 + R * 0.12, -R * 0.02], null, [R * 0.86, R * 0.62, R * 0.86]);
    // brim floor
    K.put(head, SPH(), col, INK, [0, y0, 0], null, [R * 1.32, R * 0.12, R * 1.32]);
    // three turned-up walls meeting in points (front, back-left, back-right)
    for (let k = 0; k < 3; k++) {
      const face = (k * TAU) / 3 + PI / 3; // direction the wall faces
      const e = R * 2.5;
      const rho = R * 1.0 + e;
      const half = 0.43;
      const m = new THREE.Matrix4();
      // the torus lies in its xy plane; turn it flat (xz) and aim the arc at `face`
      const q = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), face - PI / 2);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), PI / 2));
      q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), -half));
      m.compose(V3(-Math.sin(face) * e, y0 + R * 0.17, -Math.cos(face) * e), q, V3(1, 1, 2.9));
      K.putM(head, torus(rho, R * 0.075, 14, 6, half * 2), col, INK, m);
      const mt = new THREE.Matrix4().compose(V3(-Math.sin(face) * e, y0 + R * 0.37, -Math.cos(face) * e), q, V3(1, 1, 1));
      K.putM(head, torus(rho + R * 0.01, R * 0.035, 14, 4, half * 2), L.hatTrim, FLAT, mt);
    }
    // a little skull badge at the front point
    K.put(head, SPH_LO(), WHITE, FLAT, [0, y0 + R * 0.26, R * 1.3], null, [R * 0.12, R * 0.11, R * 0.05]);
  } else if (hat === 'cap') {
    const m = new THREE.Matrix4().compose(V3(0, C + R * 0.12, -R * 0.02),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.32, 0, 0)), V3(R * 1.08, R * 0.8, R * 1.08));
    K.putM(head, CAP_SEG(PI * 0.5), col, INK, m);
    K.put(head, SPH(), mix(col, DARK, 0.25), INK, [0, C + R * 0.42, R * 0.92], [-0.25, 0, 0], [R * 0.62, R * 0.08, R * 0.45]);
    K.put(head, SPH_LO(), mix(col, WHITE, 0.4), THIN, [0, C + R * 0.98, 0.0], null, R * 0.09);
  } else if (hat === 'straw') {
    const band = L.kind === 'woman' || L.girl ? L.accent : 0x8a3b3b;
    const brimR = R * 1.75;
    const prof = [[0, -R * 0.06], [R * 0.9, -R * 0.07], [brimR * 0.98, -R * 0.06], [brimR, -R * 0.02], [brimR * 0.96, R * 0.0],
      [R * 0.9, R * 0.04], [R * 0.82, R * 0.12], [R * 0.82, R * 0.34], [R * 0.72, R * 0.46], [0, R * 0.5]];
    const g = paintLathe(prof, 14, 20, (row, y) => (y > R * 0.08 && y < R * 0.2 ? band : STRAW));
    const m = new THREE.Matrix4().compose(V3(0, C + R * 0.74, -R * 0.02),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.14, 0, 0.06)), V3(1, 1, 1));
    K.putM(head, g, null, INK, m);
  }
}

/** Torso: painted lathe with stripes / vest / bodice / apron, plus the sash or belt on the hips. */
function buildBody(K, hips, torso, skirtBone, L, P) {
  const h = P.torsoH;
  const ctrl = [[0, -0.05], [P.rw * 0.8, -0.045], [P.rw, 0.0], [P.rb, h * 0.28], [P.rc, h * 0.55], [P.rs, h * 0.76],
    [P.rs * 0.78, h * 0.88], [P.rs * 0.45, h * 0.96], [0, h]];
  const stripeEvery = 2;
  const g = paintLathe(ctrl, 18, 18, (row, y, ang) => {
    const a = Math.abs(ang);
    const t = y / h;
    if (L.apron && t < 0.62 && a < 0.85 - t * 0.25) return L.apron;
    if (L.vest && a > 0.28 + 0.6 * t * t && t < 0.9) return L.vest;
    if (L.bodice && t < 0.5) return L.bodice;
    if (L.stripes && t > 0.02 && Math.floor(row / stripeEvery) % 2 === 0) return L.shirt2;
    return L.shirt;
  });
  K.putM(torso, g, null, INK, new THREE.Matrix4().makeScale(1, 1, P.zs));
  // buttons on vests / bodices, lacing dots
  if (L.vest || L.bodice) {
    for (let i = 0; i < 3; i++) {
      const y = h * (0.12 + i * 0.14);
      const z = P.rb * P.zs + 0.006;
      K.put(torso, SPH_LO(), L.bodice ? WHITE : GOLD, FLAT, [0, y, z * (1 - 0.02 * i)], null, [0.014, 0.014, 0.01]);
    }
  }
  // apron neck strap
  if (L.apron) {
    for (const sd of [-1, 1]) {
      K.rod(torso, L.apron, THIN, V3(sd * P.rc * 0.42, h * 0.6, P.rc * P.zs * 0.85), V3(sd * P.rs * 0.35, h * 0.95, 0.0), 0.012, 5);
    }
  }
  // collar / neckerchief
  if (L.kind === 'pirate') {
    const kc = L.hat === 'bandana' ? L.hatColor : L.sash;
    K.put(torso, SPH(), kc, THIN, [0, h * 0.93, P.rs * 0.5], [0.5, 0, 0], [0.034, 0.026, 0.022]);
    for (const sd of [-1, 1]) {
      K.blob(torso, kc, THIN, V3(sd * 0.008, h * 0.92, P.rs * 0.56), V3(sd * 0.04, h * 0.8, P.rs * 0.74), 0.02, 0.009, sd * 0.3);
    }
  } else if (L.kind === 'woman' || L.girl) {
    K.put(torso, torus(P.rs * 0.5, 0.016, 16, 5), WHITE, THIN, [0, h * 0.92, 0], [PI / 2, 0, 0], [1, P.zs * 1.05, 1]);
  }

  // pelvis / shorts / trousers top
  const pr = P.pelvisR;
  const pctrl = [[0, -0.13], [pr * 0.62, -0.125], [pr * 0.92, -0.09], [pr, -0.03], [pr * 0.98, 0.03], [pr * 0.86, 0.07], [0, 0.085]];
  const pg = paintLathe(pctrl, 9, 16, (row, y, ang) => (L.apron && !L.skirt && Math.abs(ang) < 0.8 ? L.apron : L.skirt ? L.skirt : L.pants));
  K.putM(hips, pg, null, INK, new THREE.Matrix4().makeScale(1, 1, P.zs + 0.04));
  // sash or belt
  const wy = P.torsoY;
  if (L.sash) {
    K.put(hips, torus(P.rw + 0.012, 0.034, 22, 6), L.sash, INK, [0, wy, 0], [PI / 2, 0, 0], [1, P.zs + 0.02, 1.3]);
    // knot and tails on the left hip
    const kx = P.rw * 0.78;
    const kz = P.rw * 0.55;
    K.put(hips, SPH(), L.sash, THIN, [kx, wy - 0.005, kz], null, [0.04, 0.038, 0.032]);
    K.blob(hips, L.sash, THIN, V3(kx + 0.01, wy - 0.02, kz), V3(kx + 0.05, wy - 0.16, kz - 0.01), 0.026, 0.014, 0.4);
    K.blob(hips, L.sash, THIN, V3(kx - 0.01, wy - 0.02, kz + 0.01), V3(kx + 0.005, wy - 0.13, kz + 0.04), 0.024, 0.013, -0.3);
  } else if (L.belt && !L.skirt) {
    K.put(hips, torus(P.rw + 0.006, 0.02, 22, 5), L.belt, THIN, [0, wy, 0], [PI / 2, 0, 0], [1, P.zs + 0.02, 1]);
    K.put(hips, rbox(0.06, 0.045, 0.02, 0.008), GOLD, THIN, [0, wy, (P.rw + 0.02) * (P.zs + 0.02)]);
  }

  // skirt on its own bone (it can tilt forward over the knees when sitting)
  if (L.skirt && skirtBone) {
    const s = L.kind === 'kid' ? 0.75 : 1;
    const top = 0.075;
    const hem = -0.3 * s;
    const sr = 0.26 * s;
    const sctrl = [[0, hem + 0.03], [sr * 0.75, hem + 0.01], [sr, hem], [sr * 1.0, hem + 0.04], [sr * 0.9, hem * 0.55],
      [P.rw * 1.2, hem * 0.15], [P.rw * 1.05, top - 0.02], [P.rw * 0.7, top + 0.005], [0, top + 0.01]];
    const inside = mix(L.skirt, DARK, 0.55);
    const sg = paintLathe(sctrl, 14, 22, (row, y, ang, down) => {
      if (down) return inside;
      if (y < hem + 0.045) return L.skirtTrim;
      if (L.apron && Math.abs(ang) < 0.7 && y < top - 0.02) return L.apron;
      return L.skirt;
    });
    K.putM(skirtBone, sg, null, INK, new THREE.Matrix4().makeScale(1, 1, 0.92));
  }
}

function buildArm(K, arm, fore, sd, L, P) {
  const sleeve = L.shirt;
  const stripes = L.stripes;
  // shoulder ball + upper sleeve
  const puff = L.sleeves === 'puff';
  const shoulderCol = L.vest && L.kind !== 'woman' ? L.shirt : L.shirt;
  K.put(arm, SPH(), shoulderCol, INK, [0, -0.01, 0], null, puff ? [P.armR * 1.7, P.armR * 1.55, P.armR * 1.6] : P.armR * 1.28);
  const upperSkin = puff;
  const ug = paintLathe(capsuleProfile(P.armR, -P.a, P.armR * 1.05, -0.01, 2), 8, 10, (row) => {
    if (upperSkin) return L.skin;
    if (stripes && row % 4 < 2) return L.shirt2;
    return sleeve;
  });
  K.putM(arm, ug, null, INK, new THREE.Matrix4());
  // forearm: sleeve to the wrist, or rolled up showing skin
  const bare = L.sleeves === 'rolled' || puff;
  const fg = paintLathe(capsuleProfile(P.foreR, -P.b + 0.03, P.foreR * 1.08, -0.005, 2), 7, 10, (row) => {
    if (bare) return L.skin;
    if (stripes && row % 4 < 2) return L.shirt2;
    return sleeve;
  });
  K.putM(fore, fg, null, INK, new THREE.Matrix4());
  if (L.sleeves === 'rolled' && !puff) K.put(fore, torus(P.foreR * 1.15, 0.018, 12, 5), L.shirt, THIN, [0, -0.012, 0], [PI / 2, 0, 0]);
  else if (!bare) K.put(fore, torus(P.foreR * 0.95, 0.014, 12, 5), mix(sleeve, WHITE, 0.45), THIN, [0, -P.b + 0.05, 0], [PI / 2, 0, 0]);
  // mitten hand + thumb
  const hr = P.handR;
  K.put(fore, SPH(), L.skin, INK, [0, -P.b, 0.004], null, [hr * 0.86, hr, hr * 0.9]);
  K.put(fore, SPH(), L.skin, THIN, [-sd * hr * 0.62, -P.b + hr * 0.38, hr * 0.42], [0, 0, -sd * 0.5], [hr * 0.36, hr * 0.5, hr * 0.38]);
}

function buildLeg(K, leg, shin, sd, L, P) {
  const thighCol = L.skirt ? L.stockings : L.pants;
  const tg = paintLathe(capsuleProfile(P.shinR * 1.08, -P.thigh, P.thighR, -0.005, 2), 8, 10, () => thighCol);
  K.putM(leg, tg, null, INK, new THREE.Matrix4());
  const peg = L.pegLeg && sd < 0;
  if (peg) {
    // wooden peg below a rolled trouser cuff
    K.put(shin, torus(P.shinR * 1.05, 0.026, 14, 5), L.pants, THIN, [0, -0.01, 0], [PI / 2, 0, 0]);
    K.put(shin, SPH(), L.pants, THIN, [0, 0, 0], null, [P.shinR * 1.08, P.shinR * 0.8, P.shinR * 1.08]);
    const pg = paintLathe([[0, -P.shin], [0.026, -P.shin], [0.03, -P.shin + 0.02], [0.034, -P.shin * 0.55], [0.045, -0.03], [0.04, 0.0], [0, 0.01]], 9, 10,
      (row, y) => (y < -P.shin + 0.05 && y > -P.shin + 0.025 ? IRON : WOOD));
    K.putM(shin, pg, null, INK, new THREE.Matrix4());
    return;
  }
  const lowerCol = L.shorts || L.skirt ? L.stockings : L.pants;
  const striped = L.kind === 'kid' && L.girl;
  const sg = paintLathe(capsuleProfile(P.shinR * 0.92, -P.shin + 0.08, P.shinR, -0.005, 2), 7, 10, (row) =>
    striped && row % 2 === 0 ? mix(L.skirtTrim || WHITE, WHITE, 0.2) : lowerCol);
  K.putM(shin, sg, null, INK, new THREE.Matrix4());
  if (L.shorts && !L.skirt) {
    // trouser leg ends at the knee
    K.put(shin, torus(P.shinR * 1.12, 0.022, 14, 5), L.pants, THIN, [0, 0.0, 0], [PI / 2, 0, 0]);
  }
  // boot: shaft with a turned-down cuff, then a flat-soled foot
  const b = P.boot;
  const tall = L.kind === 'pirate';
  const shaftTop = tall ? -P.shin * 0.42 : -P.shin * 0.72;
  const cuff = tall ? mix(L.boots, 0xc9a56b, 0.35) : L.boots;
  const bg = paintLathe([[0, -P.shin + 0.03], [b * 0.88, -P.shin + 0.03], [b * 0.92, (shaftTop - P.shin) / 2], [b, shaftTop - 0.012], [b * 1.12, shaftTop], [b * 1.06, shaftTop + 0.03], [0, shaftTop + 0.03]],
    8, 12, (row, y) => (tall && y > shaftTop - 0.02 ? cuff : L.boots));
  K.putM(shin, bg, null, INK, new THREE.Matrix4());
  const fl = b * 1.55;
  const fg = paintLathe([[0, 0], [b * 0.8, 0], [b * 0.98, 0.012], [b, 0.035], [b * 0.84, 0.065], [b * 0.4, 0.08], [0, 0.082]], 7, 14,
    (row) => (row === 0 ? mix(L.boots, DARK, 0.5) : L.boots));
  K.putM(shin, fg, null, INK, new THREE.Matrix4().compose(V3(0, -P.shin, 0.035), new THREE.Quaternion(), V3(1, 1, fl / b)));
}

// ---------------------------------------------------------------------------
// Tools (on the tool bone; toolB carries a second piece: the fiddle bow, the fishing line)
// ---------------------------------------------------------------------------
function buildTool(K, tool, toolB, L) {
  const kind = L.tool;
  if (kind === 'mop') {
    // origin on the deck under the mop head; handle along +y
    K.rod(tool, 0xd8a868, INK, V3(0, 0.07, 0), V3(0, MOP_LEN, 0), 0.025, 7);
    K.put(tool, cyl(0.04, 0.045, 0.06, 10), IRON, THIN, [0, 0.08, 0]);
    K.put(tool, SPH(), 0xe9e4d6, INK, [0, 0.065, 0], null, [0.13, 0.075, 0.13]);
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.3;
      const r = 0.19 + (i % 3) * 0.03;
      const end = V3(Math.sin(a) * r, 0.025, Math.cos(a) * r);
      K.rod(tool, i % 2 ? 0xdcd6c6 : 0xf4f0e6, THIN, V3(Math.sin(a) * 0.04, 0.07, Math.cos(a) * 0.04), end, 0.03, 6);
    }
  } else if (kind === 'brush') {
    // origin in the fist; a big deck brush hangs below with soap suds on the bristles
    K.put(tool, rbox(0.075, 0.06, 0.055, 0.022), 0xa86b3c, THIN, [0, 0.0, 0]);
    K.put(tool, rbox(0.23, 0.06, 0.12, 0.026), 0xc0392b, INK, [0, -0.055, 0]);
    K.put(tool, rbox(0.21, 0.055, 0.105, 0.02), 0xffd24a, INK, [0, -0.11, 0]);
    const suds = [[-0.09, 0.05, 0.034], [-0.03, -0.05, 0.03], [0.04, 0.05, 0.036], [0.1, -0.03, 0.03], [0.0, 0.0, 0.028], [0.13, 0.05, 0.022]];
    for (const [x, z, r] of suds) K.put(tool, SPH_LO(), WHITE, THIN, [x, -0.135, z], null, [r, r * 0.75, r]);
  } else if (kind === 'bucket') {
    // origin at the top of the handle; bucket hangs below
    const g = paintLathe([[0, -0.34], [0.09, -0.34], [0.1, -0.32], [0.12, -0.13], [0.125, -0.12], [0.11, -0.12], [0.1, -0.15], [0, -0.15]], 9, 16,
      (row, y) => ((y > -0.31 && y < -0.29) || (y > -0.18 && y < -0.155) ? IRON : 0xa86b3c));
    K.putM(tool, g, null, INK, new THREE.Matrix4());
    K.put(tool, torus(0.12, 0.009, 16, 4, PI), IRON, THIN, [0, -0.12, 0], [0, 0, 0]);
    K.put(tool, cyl(0.105, 0.105, 0.012, 16), 0x56c2f0, FLAT, [0, -0.148, 0]);
    for (const [x, z, r] of [[0.03, 0.02, 0.035], [-0.04, -0.01, 0.03], [0.0, -0.05, 0.025], [-0.02, 0.05, 0.022]]) {
      K.put(tool, SPH_LO(), WHITE, FLAT, [x, -0.14, z], null, r);
    }
  } else if (kind === 'crate') {
    // origin at the centre
    K.put(tool, rbox(0.38, 0.26, 0.28, 0.03), 0xd29a58, INK, [0, 0, 0]);
    for (const y of [-0.075, 0.075]) K.put(tool, rbox(0.4, 0.05, 0.3, 0.02), 0x9a6233, THIN, [0, y, 0]);
    // apples piled on top
    const fruit = [[-0.1, 0.05], [0.0, -0.06], [0.1, 0.04], [0.04, 0.07], [-0.05, -0.04]];
    for (const [i, [x, z]] of fruit.entries()) {
      K.put(tool, SPH(), i % 3 === 2 ? 0x9ad14a : 0xe2383d, THIN, [x, 0.15 + (i === 3 ? 0.04 : 0), z], null, 0.05);
    }
  } else if (kind === 'rod') {
    // origin at the lower grip; rod along +y
    K.rod(tool, 0x8a5530, INK, V3(0, -0.12, 0), V3(0, 0.18, 0), 0.022, 7);
    K.put(tool, cyl(0.012, 0.02, 1.25, 6), 0x6b4528, INK, [0, 0.8, 0]);
    K.put(tool, cyl(0.035, 0.035, 0.03, 10), IRON, THIN, [0.035, 0.05, 0], [0, 0, PI / 2]);
    K.put(tool, SPH_LO(), 0xe2383d, THIN, [0, 1.43, 0], null, 0.016);
    // line + bobber hang from the tip (toolB)
    K.put(toolB, cyl(0.004, 0.004, 0.8, 4), 0xf4f0e6, FLAT, [0, -0.4, 0]);
    K.put(toolB, SPH(), 0xe2383d, THIN, [0, -0.82, 0], null, [0.04, 0.035, 0.04]);
    K.put(toolB, SPH(), WHITE, THIN, [0, -0.79, 0], null, [0.03, 0.025, 0.03]);
  } else if (kind === 'hammer') {
    // origin in the fist; handle along +y, head at the top facing +z
    K.rod(tool, 0xc89a5c, INK, V3(0, -0.06, 0), V3(0, 0.2, 0), 0.02, 6);
    K.put(tool, rbox(0.06, 0.06, 0.17, 0.018), IRON, INK, [0, 0.22, 0.01]);
  } else if (kind === 'lantern') {
    // origin at the ring in the fist; lantern hangs below
    K.put(tool, torus(0.035, 0.009, 10, 4), IRON, THIN, [0, 0, 0]);
    K.put(tool, cone(0.085, 0.07, 10), IRON, INK, [0, -0.07, 0]);
    K.put(tool, SPH(), 0xffd36a, GLOW, [0, -0.15, 0], null, [0.065, 0.085, 0.065]);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + PI / 4;
      K.rod(tool, IRON, THIN, V3(Math.sin(a) * 0.066, -0.1, Math.cos(a) * 0.066), V3(Math.sin(a) * 0.066, -0.21, Math.cos(a) * 0.066), 0.008, 4);
    }
    K.put(tool, cyl(0.075, 0.065, 0.035, 10), IRON, INK, [0, -0.23, 0]);
  } else if (kind === 'fiddle') {
    // origin at the body centre; neck along +y, front face +z
    const body = 0xd9742a;
    K.put(tool, SPH(), body, INK, [0, -0.06, 0], null, [0.12, 0.115, 0.045]);
    K.put(tool, SPH(), body, INK, [0, 0.085, 0], null, [0.09, 0.09, 0.042]);
    for (const sd of [-1, 1]) K.put(tool, SPH_LO(), 0x5a2a10, FLAT, [sd * 0.035, 0.01, 0.04], [0, 0, sd * 0.2], [0.008, 0.035, 0.008]);
    K.put(tool, rbox(0.045, 0.26, 0.035, 0.014), 0x3a2418, INK, [0, 0.27, 0.018]);
    K.put(tool, SPH(), 0x3a2418, THIN, [0, 0.42, 0.0], null, [0.03, 0.04, 0.03]);
    K.put(tool, rbox(0.055, 0.014, 0.025, 0.006), 0xf2e6c8, THIN, [0, -0.075, 0.045]);
    // bow: origin at the frog (in the fist), stick along +x
    K.put(toolB, rbox(0.04, 0.04, 0.03, 0.012), 0x3a2418, THIN, [0.0, 0, 0]);
    K.rod(toolB, 0x7a4a2b, THIN, V3(0.0, 0.0, 0), V3(0.62, 0.0, 0), 0.011, 5);
    K.rod(toolB, 0xfff6dc, THIN, V3(0.03, -0.028, 0), V3(0.6, -0.016, 0), 0.007, 4);
  }
}

// ---------------------------------------------------------------------------
// Bake: one SkinnedMesh with rigid skinning
// ---------------------------------------------------------------------------
function bake(K) {
  const slots = [[], [], [], []];
  const boneIndex = new Map(K.bones.map((b, i) => [b, i]));
  const c = new THREE.Color();
  for (const part of K.parts) {
    const g = new THREE.BufferGeometry();
    const src = part.geo;
    g.setAttribute('position', src.attributes.position.clone());
    g.setAttribute('normal', src.attributes.normal.clone());
    if (src.index) g.setIndex(src.index.clone());
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(part.bone.matrixWorld, part.m));
    const n = g.attributes.position.count;
    if (part.color === null && src.attributes.color) {
      g.setAttribute('color', src.attributes.color.clone());
    } else {
      c.setHex(part.color ?? 0xff00ff);
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const bi = boneIndex.get(part.bone);
    for (let i = 0; i < n; i++) {
      si[i * 4] = bi;
      sw[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    ensureIndex(g);
    slots[part.slot].push(g);
  }
  const all = materials();
  const geos = [];
  const mats = [];
  for (let s = 0; s < slots.length; s++) {
    if (!slots[s].length) continue;
    geos.push(slots[s].length === 1 ? slots[s][0] : mergeGeometries(slots[s], false));
    mats.push(all[s]);
    for (const g of slots[s]) if (slots[s].length > 1) g.dispose();
  }
  const geometry = mergeGeometries(geos, true);
  for (const g of geos) g.dispose();
  return { geometry, mats };
}

// ---------------------------------------------------------------------------
// Public: build
// ---------------------------------------------------------------------------

/**
 * Build a cartoon person. Returns a THREE.Group (origin at the feet, facing +z).
 * group.userData = { kind, look, parts: { hips, torso, head, armL, armR, legL, legR, tool,
 *   foreL, foreR, shinL, shinR, eyes, mouth, skirt, toolB }, mesh, skeleton, keep: true }.
 * The pivots are THREE.Bone objects. Materials are shared (see disposePerson).
 * opts.detail = 'low' builds a lighter person (about a third of the triangles) for crowds that are
 * only ever seen small; it looks the same from a distance.
 */
export function buildPerson(opts = {}) {
  LOW = !!opts && opts.detail === 'low';
  try {
    return build(opts || {});
  } finally {
    LOW = false;
  }
}
function build(opts) {
  const L = resolveLook(opts);
  const P = proportions(L);
  const K = new Kit();
  const group = new THREE.Group();
  group.name = `person:${L.kind}`;

  // skeleton (rest pose)
  const hips = K.bone('hips', null, 0, P.hipY, 0);
  const torso = K.bone('torso', hips, 0, P.torsoY, 0);
  const head = K.bone('head', torso, 0, P.headY, 0);
  const eyes = K.bone('eyes', head, 0, P.C + P.R * 0.1, 0);
  const mouth = K.bone('mouth', head, 0, P.C - P.R * 0.43, 0);
  const armL = K.bone('armL', torso, P.shX, P.shY, 0);
  const foreL = K.bone('foreL', armL, 0, -P.a, 0);
  const armR = K.bone('armR', torso, -P.shX, P.shY, 0);
  const foreR = K.bone('foreR', armR, 0, -P.a, 0);
  const legL = K.bone('legL', hips, P.legX, P.legY, 0);
  const shinL = K.bone('shinL', legL, 0, -P.thigh, 0);
  const legR = K.bone('legR', hips, -P.legX, P.legY, 0);
  const shinR = K.bone('shinR', legR, 0, -P.thigh, 0);
  const skirt = K.bone('skirt', hips, 0, 0, 0);
  const tool = K.bone('tool', null, 0, 0, 0);
  const toolB = K.bone('toolB', null, 0, 0, 0);
  group.add(hips, tool, toolB);
  group.updateMatrixWorld(true);

  buildHead(K, head, eyes, mouth, L, P);
  buildBody(K, hips, torso, L.skirt ? skirt : null, L, P);
  buildArm(K, armL, foreL, 1, L, P);
  buildArm(K, armR, foreR, -1, L, P);
  buildLeg(K, legL, shinL, 1, L, P);
  buildLeg(K, legR, shinR, -1, L, P);
  buildTool(K, tool, toolB, L);

  const { geometry, mats } = bake(K);
  const mesh = new THREE.SkinnedMesh(geometry, mats.length === 1 ? mats[0] : mats);
  mesh.name = 'person-body';
  // generous fixed bounds (the pose changes; skinned bounds would cost a pass over every vertex)
  const reach = L.tool === 'rod' ? 2.0 : L.tool === 'mop' ? 1.45 : 1.15;
  mesh.boundingSphere = new THREE.Sphere(V3(0, 0.62, 0.15), reach);
  mesh.boundingBox = new THREE.Box3(V3(-reach, -0.2, -reach), V3(reach, 1.9, reach));
  geometry.boundingSphere = mesh.boundingSphere.clone();
  geometry.boundingBox = mesh.boundingBox.clone();
  group.add(mesh);
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(K.bones);
  mesh.bind(skeleton, mesh.matrixWorld);
  group.scale.setScalar(L.scale);

  const parts = { hips, torso, head, armL, armR, legL, legR, tool, foreL, foreR, shinL, shinR, eyes, mouth, skirt, toolB };
  group.userData = {
    kind: L.kind,
    look: L,
    keep: true, // mergeStatic() must leave people alone
  };
  // object references are non-enumerable so Object3D.clone() / toJSON() never walk them
  const hidden = (v) => ({ value: v, enumerable: false, writable: true, configurable: true });
  Object.defineProperties(group.userData, {
    parts: hidden(parts),
    mesh: hidden(mesh),
    skeleton: hidden(skeleton),
    rig: hidden(makeRig(parts, L, P)),
  });
  animatePerson(group, 0, 'idle');
  return group;
}

/**
 * Ground speed (world units per second) that matches the stride of 'walk' or 'carry'
 * at the given tempo, so a caller moving the group along a path keeps the feet from sliding.
 */
export function walkSpeed(person, action = 'walk', speed = 1) {
  const R = person && person.userData && person.userData.rig;
  if (!R) return 0;
  const legLen = R.P.thigh + R.P.shin;
  const [A, f] = action === 'carry' ? [0.38, 0.95] : [0.5, 1.05];
  return 4 * legLen * Math.sin(A) * f * (Number.isFinite(speed) ? speed : 1) * person.scale.x;
}

/**
 * Free a person's own GPU resources: its geometry and bone texture. The materials are
 * shared by every person and are never disposed. Removes it from its parent. Safe to
 * call more than once.
 */
export function disposePerson(person) {
  if (!person) return;
  if (person.parent) person.parent.remove(person);
  const u = person.userData || {};
  if (u.disposed) return;
  u.disposed = true;
  if (u.mesh && u.mesh.geometry) u.mesh.geometry.dispose();
  if (u.skeleton) u.skeleton.dispose();
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------
const _m1 = new THREE.Matrix4();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _u = new THREE.Vector3();
const _f = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _basis = new THREE.Matrix4();
const ONE = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler();

function makeRig(parts, L, P) {
  const bones = Object.values(parts);
  return {
    ...parts,
    bones,
    L,
    P,
    tk: L.tool,
    mht: new THREE.Matrix4(), // person <- torso
    mhti: new THREE.Matrix4(), // torso <- person
    qht: new THREE.Quaternion(),
    hand: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() },
    s: Array.from({ length: 8 }, () => new THREE.Vector3()), // pose scratch (helpers never touch these)
    armsL: [parts.armL, parts.foreL],
    armsR: [parts.armR, parts.foreR],
  };
}
// Left (+1) then right (-1): the animation loops over the sides every frame, without a new array each time.
const SIDES = Object.freeze([1, -1]);

function reset(R) {
  for (const b of R.bones) {
    b.position.copy(b.userData.rest);
    b.quaternion.identity();
    b.scale.copy(ONE);
  }
}

/** Two-bone IK: aim `upper` (pivot S, hanging along -y) and bend `lower` so the end reaches T.
 *  All vectors are in upper's parent space. flip=true bends backwards (knees). */
function ik2(upper, lower, S, T, pole, a, b, flip = false) {
  _d.subVectors(T, S);
  let d = _d.length();
  if (d < 1e-6) {
    _d.set(0, -1, 0);
    d = 1e-6;
  } else _d.divideScalar(d);
  d = clamp(d, Math.abs(a - b) + 1e-4, (a + b) * 0.9999);
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-10) _p.set(_d.y, -_d.x, 0.3);
  _p.normalize();
  _u.copy(_d).multiplyScalar(cosA).addScaledVector(_p, sinA);
  _f.copy(_d).multiplyScalar(d).addScaledVector(_u, -a).normalize();
  _y.copy(_u).negate();
  _z.copy(_f).addScaledVector(_u, -_f.dot(_u));
  if (_z.lengthSq() < 1e-10) _z.copy(_p).negate();
  _z.normalize();
  if (flip) _z.negate();
  _x.crossVectors(_y, _z);
  _basis.makeBasis(_x, _y, _z);
  upper.quaternion.setFromRotationMatrix(_basis);
  const bend = Math.acos(clamp(_f.dot(_u), -1, 1));
  lower.rotation.set(flip ? bend : -bend, 0, 0);
}

function local(o, out) {
  return out.compose(o.position, o.quaternion, ONE);
}

/** Cache person<-torso transforms after the hips / torso are posed. */
function bodyDone(R) {
  local(R.hips, R.mht);
  R.mht.multiply(local(R.torso, _m1));
  R.mhti.copy(R.mht).invert();
  R.qht.copy(R.hips.quaternion).multiply(R.torso.quaternion);
}

function armBones(R, s) {
  return s > 0 ? R.armsL : R.armsR;
}

/** IK an arm to a target given in PERSON space. */
function reachP(R, s, x, y, z, px = s * 0.5, py = -0.4, pz = -0.8) {
  const [arm, fore] = armBones(R, s);
  _v1.set(x, y, z).applyMatrix4(R.mhti);
  _v2.set(px, py, pz);
  ik2(arm, fore, arm.position, _v1, _v2, R.P.a, R.P.b);
}
/** IK an arm to a target given in TORSO space. */
function reachT(R, s, x, y, z, px = s * 0.5, py = -0.4, pz = -0.8) {
  const [arm, fore] = armBones(R, s);
  _v1.set(x, y, z);
  _v2.set(px, py, pz);
  ik2(arm, fore, arm.position, _v1, _v2, R.P.a, R.P.b);
}
/** Euler arm pose: x swings forward (-) / back (+), z raises sideways (+ outward), bend >= 0 bends the elbow forward. */
function armE(R, s, x, z, bend, y = 0) {
  const [arm, fore] = armBones(R, s);
  arm.rotation.set(x, y * s, z * s, 'XYZ');
  fore.rotation.set(-bend, 0, 0);
}

/** Hand centre and orientation in person space. */
function handFrame(R, s) {
  const [arm, fore] = armBones(R, s);
  const H = R.hand;
  H.pos.set(0, -R.P.a, 0).applyQuaternion(arm.quaternion).add(arm.position);
  _q1.copy(arm.quaternion).multiply(fore.quaternion);
  _v3.set(0, -R.P.b, 0).applyQuaternion(_q1);
  H.pos.add(_v3).applyMatrix4(R.mht);
  H.quat.copy(R.qht).multiply(_q1);
  return H;
}

/** Put the tool in the hand: grip rotation as Euler (applied in the hand frame). */
function toolInHand(R, s, gx = 0, gy = 0, gz = 0, bone = R.tool) {
  const H = handFrame(R, s);
  bone.position.copy(H.pos);
  _e.set(gx, gy, gz);
  bone.quaternion.copy(H.quat).multiply(_q2.setFromEuler(_e));
}
/** Hang the tool from the hand, staying upright (buckets, lanterns). */
function toolHang(R, s, swing = 0, yaw = 0) {
  const H = handFrame(R, s);
  R.tool.position.copy(H.pos);
  _e.set(swing, yaw, 0);
  R.tool.quaternion.setFromEuler(_e);
}
function hideTool(R, bone = R.tool) {
  bone.scale.setScalar(1e-4);
  bone.position.set(0, 0.6, 0);
}

// --- lower body helpers -----------------------------------------------------
function legsStand(R, spread = 0.04) {
  R.legL.rotation.z = spread;
  R.legR.rotation.z = -spread;
}

/**
 * Walk cycle in place. ph is the cycle phase (radians), A the stride angle. In stance the
 * foot moves back under the hip at a constant speed (so a caller moving the group at
 * walkSpeed() keeps it planted) and the hip rides on the straight stance leg; in swing the
 * knee folds to lift the foot clear and it eases forward again.
 */
function walkLegs(R, ph, A = 0.5, bounce = 1) {
  const P = R.P;
  const L = P.thigh + P.shin;
  const D = L * Math.sin(A);
  const u0 = frac(ph / TAU - 0.25);
  let stanceY = L;
  for (const sd of SIDES) {
    const leg = sd > 0 ? R.legL : R.legR;
    const shin = sd > 0 ? R.shinL : R.shinR;
    const u = frac(u0 + (sd > 0 ? 0 : 0.5));
    let x;
    let swing = 0;
    if (u < 0.5) {
      x = D * (1 - 4 * u);
    } else {
      const v = (u - 0.5) * 2;
      x = -D * Math.cos(PI * v);
      swing = Math.sin(PI * v);
    }
    const th = Math.asin(clamp(x / L, -1, 1));
    leg.rotation.x = -th - 0.25 * swing * bounce;
    leg.rotation.z = sd * 0.03;
    shin.rotation.x = (1.05 * swing + 0.25 * swing * bounce) * (0.6 + 0.4 * bounce);
    if (u < 0.5) stanceY = L * Math.cos(th);
  }
  const s = Math.sin(ph);
  R.hips.position.y = stanceY - P.legY;
  R.hips.rotation.y = 0.12 * s;
  R.hips.rotation.z = 0.035 * Math.cos(ph);
  R.torso.rotation.y = -0.16 * s;
  R.torso.rotation.x = 0.06 + R.P.hunch;
  R.head.rotation.y = 0.1 * s;
}

/** Plant a foot at a PERSON-space point with a knee pole. */
function footAt(R, sd, x, y, z, pole = 1) {
  const leg = sd > 0 ? R.legL : R.legR;
  const shin = sd > 0 ? R.shinL : R.shinR;
  local(R.hips, _m1).invert();
  _v1.set(x, y, z).applyMatrix4(_m1);
  _v2.set(sd * 0.15, 0, pole);
  ik2(leg, shin, leg.position, _v1, _v2, R.P.thigh, R.P.shin, true);
}

/** Seated: pelvis bottom on SEAT_HEIGHT, thighs forward, shins dangling (kick swings them). */
function seated(R, t, kick = 0.2) {
  R.hips.position.y = SEAT_HEIGHT + 0.125;
  R.hips.position.z = -0.03;
  for (const sd of SIDES) {
    const leg = sd > 0 ? R.legL : R.legR;
    const shin = sd > 0 ? R.shinL : R.shinR;
    leg.rotation.x = -PI / 2 + 0.08;
    leg.rotation.z = sd * 0.08;
    shin.rotation.x = PI / 2 - 0.15 + kick * Math.sin(t * 2.2 + (sd > 0 ? 0 : 2.1));
  }
  if (R.skirt) {
    // the skirt drapes forward over the knees
    R.skirt.rotation.x = -0.8;
    R.skirt.scale.set(1.04, 0.74, 1.16);
    R.skirt.position.z = 0.03;
  }
  R.torso.rotation.x = R.P.hunch * 0.7;
}

function breathe(R, t, amt = 1) {
  R.torso.rotation.x += 0.025 * amt * Math.sin(t * 1.7);
  R.head.rotation.x -= 0.02 * amt * Math.sin(t * 1.7 + 0.5);
}

function lookAround(R, t, amt = 1) {
  R.head.rotation.y += amt * (0.42 * Math.sin(t * 0.37) + 0.16 * Math.sin(t * 1.13 + 1));
  R.head.rotation.x += amt * 0.06 * Math.sin(t * 0.61);
  R.head.rotation.z += amt * 0.05 * Math.sin(t * 0.5 + 2);
}

/** A relaxed arm hanging at the side, swinging a little. */
function restArm(R, s, t, swing = 0.06) {
  armE(R, s, swing * Math.sin(t * 1.7 + (s > 0 ? 0 : PI)), 0.14, 0.22);
}

/** Hand on hip (akimbo). */
function handOnHip(R, s) {
  reachT(R, s, s * (R.P.rw + 0.06), -0.01, 0.02, s * 1, 0.1, -0.6);
}

// --- tool helpers ----------------------------------------------------------
const UPV = new THREE.Vector3(0, 1, 0);
const XV = new THREE.Vector3(1, 0, 0);

/** Hand centre (person space) copied into `out`. */
function handP(R, s, out) {
  return out.copy(handFrame(R, s).pos);
}

/** Put a tool bone at `base` with its +y pointing at `toward` (person space). */
function toolAlong(R, base, toward, spin = 0, bone = R.tool) {
  bone.position.copy(base);
  _v3.subVectors(toward, base);
  if (_v3.lengthSq() < 1e-10) _v3.set(0, 1, 0);
  bone.quaternion.setFromUnitVectors(UPV, _v3.normalize());
  if (spin) bone.quaternion.multiply(_q2.setFromAxisAngle(UPV, spin));
}

/** Reach a hand to the point of a line (person space: P0 + u * dir, u in [u0, u1]) nearest its shoulder. */
function gripLine(R, s, P0, dir, u0, u1, px, py, pz) {
  const [arm] = armBones(R, s);
  const S = R.s[7].copy(arm.position).applyMatrix4(R.mht);
  const u = clamp(S.sub(P0).dot(dir), u0, u1);
  const T = R.s[7].copy(P0).addScaledVector(dir, u);
  reachP(R, s, T.x, T.y, T.z, px, py, pz);
}

/** Yaw of the torso in person space (for upright props). */
function torsoYaw(R) {
  return R.hips.rotation.y + R.torso.rotation.y;
}

// --- tool at rest (held while doing something that doesn't use it) ----------
function toolRest(R, t, walking = 0, swing = 0) {
  const k = R.tk;
  const P = R.P;
  const [A, B, C] = R.s;
  if (k === 'none') return false;
  if (k === 'mop') {
    if (walking) {
      // shouldered: right hand in front of the shoulder, handle over it, mop head up behind
      reachT(R, -1, -0.1, P.shY - 0.07 + 0.012 * Math.sin(swing * 2), 0.17, -0.8, -0.6, -0.2);
      handP(R, -1, A);
      B.set(-P.shX * 0.9, P.shY + P.armR * 1.5, -0.02).applyMatrix4(R.mht);
      C.subVectors(B, A).normalize();
      B.copy(A).addScaledVector(C, 0.68);
      toolAlong(R, B, A);
      return true;
    }
    // standing beside the right foot like a staff
    B.set(-0.37, 0, 0.13);
    reachP(R, -1, -0.33, 0.6 + 0.01 * Math.sin(t), 0.12, -0.7, -0.5, -0.4);
    handP(R, -1, A);
    toolAlong(R, B, A);
    return true;
  }
  if (k === 'bucket' || k === 'lantern') {
    if (k === 'lantern') armE(R, -1, -0.55 - 0.08 * walking * Math.sin(swing), 0.12, 0.85);
    else armE(R, -1, -0.12 - 0.18 * walking * Math.sin(swing), 0.2, 0.2);
    toolHang(R, -1, 0.15 * walking * Math.sin(swing + 0.6), torsoYaw(R));
    return true;
  }
  if (k === 'brush' || k === 'hammer') {
    armE(R, -1, -0.1 + 0.4 * walking * Math.sin(swing), 0.12, 0.35);
    if (k === 'hammer') toolInHand(R, -1, PI / 2 + 0.5, 0, 0);
    else toolInHand(R, -1, 0.15, 0, 0);
    return true;
  }
  if (k === 'crate') {
    const bob = walking ? 0.012 * Math.cos(2 * swing) : 0;
    holdCrate(R, 0.04 + bob, 0.26);
    return 'both';
  }
  if (k === 'rod') {
    // rod sloped up over the right shoulder
    armE(R, -1, -0.55 + 0.15 * walking * Math.sin(swing), 0.12, 0.95);
    handP(R, -1, A);
    B.set(-0.25, 1, -0.45).applyAxisAngle(UPV, torsoYaw(R)).add(A);
    toolAlong(R, A, B);
    hideTool(R, R.toolB);
    return true;
  }
  if (k === 'fiddle') {
    // fiddle held by the neck, hanging at the side; the bow in the same hand
    armE(R, -1, -0.1 + 0.25 * walking * Math.sin(swing), 0.16, 0.25);
    handP(R, -1, A);
    B.copy(A).add(C.set(0.02, -0.4, 0.05));
    toolAlong(R, B, A, torsoYaw(R) + PI / 2);
    R.toolB.position.copy(A);
    R.toolB.quaternion.setFromUnitVectors(XV, C.set(0.15, -1, 0.2).normalize());
    return true;
  }
  return false;
}

/** Put a crate, bucket or lantern down on the floor beside the right foot; hide anything else. */
function setDown(R) {
  const k = R.tk;
  const y = k === 'crate' ? 0.13 : k === 'bucket' ? 0.34 : k === 'lantern' ? 0.255 : -1;
  if (y < 0) {
    hideTool(R);
  } else {
    R.tool.position.set(-0.4, y, 0.12);
    R.tool.quaternion.setFromAxisAngle(UPV, 0.3);
  }
  hideTool(R, R.toolB);
}

/** Both hands on the sides of the crate at torso-space height y, depth z; crate follows the hands. */
function holdCrate(R, y, z) {
  const [A, B, C] = R.s;
  reachT(R, 1, 0.205, y, z, 1, -0.7, -0.3);
  reachT(R, -1, -0.205, y, z, -1, -0.7, -0.3);
  handP(R, 1, A);
  handP(R, -1, B);
  C.addVectors(A, B).multiplyScalar(0.5);
  C.y += 0.035;
  R.tool.position.copy(C);
  R.tool.quaternion.copy(R.qht);
}

// ---------------------------------------------------------------------------
// The actions
// ---------------------------------------------------------------------------
const POSES = {
  idle(R, t) {
    R.hips.position.x = 0.012 * Math.sin(t * 0.5);
    R.hips.rotation.z = 0.03 * Math.sin(t * 0.5);
    R.torso.rotation.x = R.P.hunch;
    R.torso.rotation.z = -0.03 * Math.sin(t * 0.5);
    legsStand(R, 0.05);
    R.legL.rotation.z -= R.hips.rotation.z;
    R.legR.rotation.z -= R.hips.rotation.z;
    breathe(R, t);
    lookAround(R, t);
    bodyDone(R);
    const busy = toolRest(R, t);
    if (busy !== 'both') {
      restArm(R, 1, t);
      if (!busy) restArm(R, -1, t);
    }
  },

  walk(R, t) {
    const ph = t * TAU * 1.05; // keep in step with walkSpeed()
    walkLegs(R, ph, 0.5);
    R.head.rotation.x = -0.04;
    bodyDone(R);
    const busy = toolRest(R, t, 1, ph);
    if (busy !== 'both') {
      armE(R, 1, 0.55 * Math.sin(ph), 0.12, 0.35 + 0.25 * Math.max(0, -Math.sin(ph)));
      if (!busy) armE(R, -1, -0.55 * Math.sin(ph), 0.12, 0.35 + 0.25 * Math.max(0, Math.sin(ph)));
    }
  },

  mop(R, t, o) {
    const P = R.P;
    const [A, B, C, D] = R.s;
    const w = t * TAU * 0.5;
    const s = Math.sin(w);
    const c = Math.cos(w);
    // the sweep: everything yaws side to side (offset centres the mop head); { sweep: 0..1 } makes
    // the strokes shorter, for a cramped deck
    const k = Number.isFinite(o.sweep) ? clamp(o.sweep, 0, 1) : 1;
    const psi = -0.42 + 0.62 * k * s;
    // wide stance, knees bending deepest in the middle of each stroke, leaning into it
    R.hips.position.y = P.hipY - (0.04 + 0.035 * Math.abs(c));
    R.hips.position.x = 0.06 * k * s;
    R.hips.rotation.y = 0.4 * psi;
    for (const sd of SIDES) footAt(R, sd, sd * (P.legX + 0.11), 0, -sd * 0.03, 1);
    R.torso.rotation.set(0.24 + 0.08 * Math.abs(c) + P.hunch * 0.5, 0.65 * psi, -0.2 * k * s);
    R.head.rotation.set(-0.1 + 0.06 * Math.abs(c), -0.4 * psi - 0.1, 0.16 * k * s);
    bodyDone(R);
    // grips at chest height in a frame that yaws with the sweep (person space); push / pull
    const cy = Math.cos(psi);
    const sy = Math.sin(psi);
    const push = 0.05 * c;
    const hy = P.hipY + P.torsoY + P.shY;
    const rot = (x, y, z, out) => out.set(x * cy + z * sy, y, -x * sy + z * cy);
    // handle diagonal across the body: its top end passes the right shoulder, clear of the face
    rot(-0.14, hy - 0.06 + 0.02 * c, 0.17 + push, A); // upper hand (right)
    rot(0.02, hy - 0.2 + 0.02 * c, 0.29 + push, B); // lower hand (left)
    reachP(R, -1, A.x, A.y, A.z, -0.8, -0.4, -0.5);
    reachP(R, 1, B.x, B.y, B.z, 0.9, -0.5, -0.3);
    // the handle runs through both hands (where they really are) down to the deck
    handP(R, -1, A);
    handP(R, 1, B);
    D.subVectors(B, A).normalize();
    if (D.y > -0.4) {
      D.y = -0.4;
      D.normalize();
    }
    C.copy(A).addScaledVector(D, A.y / -D.y);
    toolAlong(R, C, A, 0.7 * s);
    if (R.tk !== 'mop') hideTool(R);
    hideTool(R, R.toolB);
  },

  scrub(R, t, o) {
    const P = R.P;
    const [A] = R.s;
    const w = t * TAU * 1.6;
    const s = Math.sin(w);
    const c = Math.cos(w);
    if (o.wall) {
      // kneeling upright facing a wall / hull side WALL_Z in front, scrubbing circles at chest height
      R.hips.position.y = P.shinR * 1.05 + P.thigh * 0.97 - P.legY;
      for (const sd of SIDES) {
        const leg = sd > 0 ? R.legL : R.legR;
        const shin = sd > 0 ? R.shinL : R.shinR;
        leg.rotation.set(-0.1, 0, sd * 0.12);
        shin.rotation.x = PI / 2 + 0.1 + 0.25 * Math.max(0, Math.sin(w * 0.5 + sd)) ** 2;
      }
      if (R.skirt) R.skirt.scale.set(1, 0.85, 1);
      R.torso.rotation.set(0.32 + 0.05 * s + P.hunch * 0.4, 0.14 * c, 0.06 * c);
      R.head.rotation.set(-0.12, -0.15 * c, 0.0);
      bodyDone(R);
      const cx = -0.09 + 0.1 * c;
      const cyy = P.hipY + P.torsoY + P.shY * 0.6 + 0.085 * s;
      reachP(R, -1, cx, cyy, WALL_Z - 0.15, -0.8, -0.6, -0.2);
      const H = handFrame(R, -1);
      R.tool.position.copy(H.pos);
      R.tool.quaternion.setFromEuler(_e.set(-PI / 2, torsoYaw(R), 0.4 * c, 'YXZ'));
      // other hand flat on the wall
      reachP(R, 1, 0.17, cyy - 0.04, WALL_Z - 0.06, 0.9, -0.6, -0.1);
    } else {
      // on both knees, bent right over, brush going round in circles on the deck
      R.hips.position.y = P.shinR * 1.05 + P.thigh * 0.86 - P.legY;
      R.hips.position.z = 0.02;
      for (const sd of SIDES) {
        const leg = sd > 0 ? R.legL : R.legR;
        const shin = sd > 0 ? R.shinL : R.shinR;
        leg.rotation.set(-0.5, 0, sd * 0.14);
        // feet up behind, wiggling
        shin.rotation.x = PI / 2 + 0.5 + 0.12 + 0.3 * Math.max(0, Math.sin(w * 0.5 + (sd > 0 ? 0 : PI))) ** 2;
      }
      if (R.skirt) {
        R.skirt.rotation.x = -0.5;
        R.skirt.scale.set(1, 0.8, 1);
      }
      R.torso.rotation.set(1.12 + 0.07 * s + P.hunch * 0.2, 0.16 * c, 0.08 * c);
      R.head.rotation.set(-0.75, -0.2 * c, 0.06 * c);
      bodyDone(R);
      const bx = -0.15 + 0.085 * c;
      const bz = 0.38 + 0.065 * s;
      reachP(R, -1, bx, BRUSH_H + 0.01 * s, bz, -0.6, 0.5, -0.6);
      handP(R, -1, A);
      R.tool.position.copy(A);
      R.tool.quaternion.setFromEuler(_e.set(0, 0.4 * c + torsoYaw(R), 0));
      // other hand propped on the deck
      reachP(R, 1, 0.16, 0.07, 0.3, 0.9, 0.3, -0.6);
    }
    if (R.tk !== 'brush') hideTool(R);
    hideTool(R, R.toolB);
  },

  wave(R, t) {
    const w = t * TAU * 1.5;
    const s = Math.sin(w);
    legsStand(R, 0.05);
    R.hips.position.y += 0.012 * Math.abs(s);
    // wave with the free hand: the left one when the right holds something
    const sd = R.tk === 'none' || R.tk === 'crate' ? -1 : 1;
    R.torso.rotation.set(R.P.hunch * 0.6 - 0.04, 0.0, -sd * 0.12);
    R.head.rotation.set(-0.1, sd * 0.12, sd * 0.14 + 0.05 * s);
    bodyDone(R);
    reachT(R, sd, sd * (R.P.shX + 0.18 + 0.1 * s), R.P.shY + R.P.reach * 0.74, 0.08, sd * 1, -0.5, -0.3);
    if (sd < 0) {
      handOnHip(R, 1);
      setDown(R);
    } else {
      const busy = toolRest(R, t);
      if (!busy) handOnHip(R, -1);
    }
    R.mouth.scale.set(0.8, 0.55, 1);
  },

  carry(R, t) {
    const P = R.P;
    const ph = t * TAU * 0.95; // keep in step with walkSpeed()
    walkLegs(R, ph, 0.38, 0.8);
    R.torso.rotation.x = -0.1 + P.hunch * 0.5;
    R.head.rotation.x = 0.06;
    bodyDone(R);
    if (R.tk === 'crate') {
      // crate held up in front of the chest, bobbing with the steps
      holdCrate(R, P.shY - 0.06 + 0.015 * Math.cos(2 * ph), 0.25);
    } else {
      const busy = toolRest(R, t, 1, ph);
      if (busy !== 'both') {
        armE(R, 1, 0.45 * Math.sin(ph), 0.12, 0.35);
        if (!busy) armE(R, -1, -0.45 * Math.sin(ph), 0.12, 0.35);
      }
    }
  },

  fish(R, t, o) {
    if (R.tk !== 'rod') {
      POSES.sit(R, t, o);
      return;
    }
    const [A, B, C] = R.s;
    seated(R, t, 0.22);
    R.torso.rotation.x += 0.12;
    breathe(R, t, 0.6);
    // every few seconds the line tugs and the rod twitches up
    const q = frac(t / 4.3);
    const twitch = q < 0.14 ? Math.sin((q / 0.14) * PI) : 0;
    R.head.rotation.set(0.15 - 0.15 * twitch, 0.08 * Math.sin(t * 0.4), 0.05 * Math.sin(t * 0.3));
    bodyDone(R);
    // rod butt in the right hand by the right hip; rod angled out over the water, away from the face
    reachT(R, -1, -0.1, -0.02, 0.17, -0.8, -0.6, -0.3);
    handP(R, -1, A);
    C.set(-0.16, 0.5 + 0.5 * twitch + 0.03 * Math.sin(t * 1.1), 0.85).normalize().applyQuaternion(R.qht);
    gripLine(R, 1, A, C, 0.06, 0.3, 0.8, -0.6, -0.3);
    B.copy(A).add(C);
    toolAlong(R, A, B);
    // the line hangs straight down from the tip
    R.toolB.position.copy(A).addScaledVector(C, ROD_TIP);
    R.toolB.quaternion.setFromEuler(_e.set(0.06 * Math.sin(t * 0.9) - 0.2 * twitch, 0, 0.04 * Math.sin(t * 0.7)));
    if (R.tk !== 'rod') {
      hideTool(R);
      hideTool(R, R.toolB);
    }
  },

  sit(R, t) {
    const [A] = R.s;
    seated(R, t, 0.12);
    breathe(R, t);
    lookAround(R, t, 0.9);
    bodyDone(R);
    // hands resting on the knees
    for (const sd of SIDES) {
      const leg = sd > 0 ? R.legL : R.legR;
      A.set(0, -R.P.thigh, 0).applyQuaternion(leg.quaternion).add(leg.position);
      A.applyMatrix4(local(R.hips, _m1));
      reachP(R, sd, A.x + sd * 0.015, A.y + 0.075, A.z - 0.03, sd * 0.8, -0.3, -0.5);
    }
    setDown(R);
  },

  cheer(R, t) {
    const [A, B] = R.s;
    const w = t * TAU * 1.25;
    const hop = Math.abs(Math.sin(w));
    const air = Math.max(0, hop - 0.25) / 0.75;
    R.hips.position.y += 0.1 * air;
    for (const sd of SIDES) {
      const leg = sd > 0 ? R.legL : R.legR;
      const shin = sd > 0 ? R.shinL : R.shinR;
      leg.rotation.x = -0.35 * air;
      leg.rotation.z = sd * (0.06 + 0.1 * air);
      shin.rotation.x = 0.7 * air;
    }
    R.torso.rotation.set(-0.1 + R.P.hunch * 0.5, 0.0, 0.04 * Math.sin(w * 0.5));
    R.head.rotation.set(-0.22, 0.1 * Math.sin(w * 0.5), 0.0);
    bodyDone(R);
    const pump = 0.06 * Math.sin(w * 2);
    for (const sd of SIDES) reachT(R, sd, sd * 0.36, R.P.shY + R.P.reach * 0.86 + pump, 0.06, sd * 1, -0.5, -0.2);
    const k = R.tk;
    if (k === 'mop') {
      // mop raised like a trophy, head up
      handP(R, -1, A);
      B.copy(A).add(_v1.set(-0.05, 0.62, 0.02));
      toolAlong(R, B, A);
    } else if (k === 'lantern') {
      toolHang(R, -1, 0.25 * Math.sin(w), torsoYaw(R));
    } else if (k === 'crate' || k === 'bucket') {
      setDown(R);
    } else if (k === 'rod' || k === 'hammer' || k === 'brush' || k === 'fiddle') {
      handP(R, -1, A);
      B.copy(A).add(_v1.set(-0.1, 1, 0.1));
      toolAlong(R, k === 'brush' || k === 'fiddle' ? B : A, k === 'brush' || k === 'fiddle' ? A : B);
    } else if (k !== 'none') hideTool(R);
    hideTool(R, R.toolB);
    R.mouth.scale.set(1, 1, 1);
  },

  hammer(R, t) {
    const P = R.P;
    // down on one knee, hammering a nail into the deck in front
    R.hips.position.y = P.shinR * 1.05 + P.thigh * 0.95 - P.legY - 0.01;
    R.hips.position.z = -0.05;
    R.legL.rotation.set(-0.08, 0, 0.1);
    R.shinL.rotation.x = PI / 2 + 0.25;
    footAt(R, -1, -P.legX - 0.07, 0, 0.24, 1);
    const q = frac(t * 1.1);
    // raise slowly, strike fast, settle
    let lift;
    if (q < 0.55) lift = smooth(q / 0.55);
    else if (q < 0.64) lift = 1 - smooth((q - 0.55) / 0.09);
    else lift = 0;
    const hit = q >= 0.64 && q < 0.76 ? 1 - (q - 0.64) / 0.12 : 0;
    R.torso.rotation.set(0.55 - 0.2 * lift + 0.06 * hit + P.hunch * 0.3, 0.15, 0.04 * lift);
    R.head.rotation.set(-0.35 + 0.1 * lift, -0.12, 0);
    bodyDone(R);
    armE(R, -1, lerp(-0.62, -2.7, lift), 0.22, lerp(0.45, 1.65, lift));
    toolInHand(R, -1, PI / 2 + lerp(0.5, 0.15, lift), 0, 0);
    // the other hand holds the nail on the plank
    reachP(R, 1, 0.0, 0.07, 0.44, 0.9, 0.3, -0.6);
    if (R.tk !== 'hammer') hideTool(R);
    hideTool(R, R.toolB);
    R.mouth.scale.set(0.5, hit * 0.5, 1);
  },

  fiddle(R, t) {
    const P = R.P;
    const [O, N, F, X, A, C] = R.s;
    const beat = t * TAU * 1.3;
    const tap = Math.max(0, Math.sin(beat));
    legsStand(R, 0.06);
    R.legR.rotation.x = -0.14 * tap;
    R.shinR.rotation.x = 0.26 * tap;
    R.hips.position.y += 0.014 * Math.abs(Math.cos(beat));
    R.hips.rotation.z = 0.03 * Math.sin(beat * 0.5);
    R.torso.rotation.set(0.04 + P.hunch * 0.6, 0.2 + 0.08 * Math.sin(beat * 0.5), 0.09 * Math.sin(beat * 0.5));
    R.head.rotation.set(0.15, 0.3, 0.38);
    bodyDone(R);
    // fiddle on the left collarbone, under the chin, neck pointing forward-left (torso space)
    O.set(P.shX * 0.5, P.shY + 0.065, 0.13);
    N.set(0.48, -0.08, 0.87).normalize(); // neck direction
    F.set(-0.42, 0.9, 0.1); // face normal
    F.addScaledVector(N, -F.dot(N)).normalize();
    X.crossVectors(N, F).normalize(); // fiddle local x
    _basis.makeBasis(X, N, F);
    R.tool.position.copy(O).applyMatrix4(R.mht);
    R.tool.quaternion.setFromRotationMatrix(_basis).premultiply(R.qht);
    // left hand round the neck
    reachT(R, 1, O.x + N.x * 0.24, O.y + N.y * 0.24 - 0.025, O.z + N.z * 0.24, 1, -0.8, -0.2);
    // the bow saws back and forth across the strings near the bridge
    C.copy(O).addScaledVector(N, -0.02).addScaledVector(F, 0.06); // contact point
    X.crossVectors(N, F).normalize();
    if (X.x > 0) X.negate(); // towards the player's right
    X.y -= 0.25;
    X.normalize();
    const reachOut = 0.1 + 0.27 * (0.5 + 0.5 * Math.sin(beat));
    A.copy(C).addScaledVector(X, reachOut); // frog (torso space)
    reachT(R, -1, A.x, A.y, A.z, -0.9, -0.6, -0.3);
    handP(R, -1, A);
    C.applyMatrix4(R.mht);
    R.toolB.position.copy(A);
    R.toolB.quaternion.setFromUnitVectors(XV, C.sub(A).normalize());
    if (R.tk !== 'fiddle') {
      hideTool(R);
      hideTool(R, R.toolB);
    }
    R.mouth.scale.set(0.6, 0.45, 1);
  },

  lean(R, t) {
    const P = R.P;
    // leaning forward on a rail, one ankle crossed behind the other
    R.hips.position.z = -0.08;
    R.hips.position.y -= 0.01;
    R.hips.rotation.y = 0.04 * Math.sin(t * 0.4);
    footAt(R, -1, -P.legX - 0.03, 0, 0.0, 1);
    footAt(R, 1, -0.02, 0.05, -0.08, 1);
    R.torso.rotation.set(0.62 + 0.03 * Math.sin(t * 1.2), 0.0, 0.0);
    R.head.rotation.set(-0.5, 0.0, 0.0);
    lookAround(R, t, 0.8);
    bodyDone(R);
    for (const sd of SIDES) reachP(R, sd, sd * 0.08, RAIL.y + 0.05, RAIL.z + 0.06, sd * 1, -0.8, -0.2);
    setDown(R);
  },
};

const NO_OPTS = Object.freeze({});
/**
 * Pose a person for time t (seconds). Deterministic in t; transforms only.
 * opts: { phase? (seconds, defaults to a per-person offset), speed? (tempo, default 1),
 *         wall? ('scrub' only: true scrubs a wall/hull in front instead of the deck),
 *         sweep? ('mop' only: 0..1, shorter strokes; default 1) }
 */
export function animatePerson(person, t, action = 'idle', opts = NO_OPTS) {
  const u = person && person.userData;
  if (!u || !u.rig) return;
  const R = u.rig;
  const o = opts || NO_OPTS;
  const speed = Number.isFinite(o.speed) ? o.speed : 1;
  const phase = Number.isFinite(o.phase) ? o.phase : R.L.phase;
  const tt = (Number.isFinite(t) ? t : 0) * speed + phase;
  reset(R);
  R.mouth.scale.set(1, 0.001, 1);
  // (own keys only: an action named like an Object.prototype member falls back to idle too)
  const pose = Object.prototype.hasOwnProperty.call(POSES, action) ? POSES[action] : POSES.idle;
  pose(R, tt, o);
  // tools that the action didn't place stay hidden
  if (R.tk === 'none') {
    hideTool(R);
    hideTool(R, R.toolB);
  } else if (R.tk !== 'rod' && R.tk !== 'fiddle') {
    hideTool(R, R.toolB);
  }
  // blink every few seconds
  const b = frac(tt / R.L.blink);
  R.eyes.scale.y = b < 0.035 ? 0.12 : 1;
}
