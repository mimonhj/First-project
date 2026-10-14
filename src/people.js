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
//
// The captain, uniforms and the tailor's shop add options (all optional; a call without them
// resolves and builds exactly as before): outfit 'pirate' on any body, the hats 'bicorne',
// 'plumed', 'crown' and 'horned' (+ hatColor), a long coat (coat, coatTrim) with tails on the
// 'skirt' bone, beard styles, hair colour and style, stripes / shirt2 / vest, a parrot on the
// shoulder (pet bones), the tools 'cutlass', 'tape' and 'scissors', and share: true (geometry
// shared by every person with the same resolved look, see releaseSharedPeople). The captain
// (outfit 'pirate') is built at mid detail, which keeps every outfit under 12k triangles.

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

export const ACTIONS = ['idle', 'walk', 'mop', 'scrub', 'wave', 'carry', 'fish', 'sit', 'cheer', 'hammer', 'fiddle', 'lean',
  'run', 'proud', 'steer', 'point', 'swing', 'fight', 'fall', 'surrender', 'haul', 'measure', 'snip'];
/** Seat height for 'sit' / 'fish' (person units, multiply by the person's scale). */
export const SEAT_HEIGHT = 0.3;
/** Rail that 'lean' rests on: height and distance in front of the feet (person units). */
export const RAIL = { y: 0.64, z: 0.34 };
/** 'scrub' with { wall: true } scrubs a wall (a hull side) this far in front of the feet. */
export const WALL_Z = 0.45;
const BRUSH_H = 0.15; // hand height when the brush's suds touch the deck
const MOP_LEN = 1.3; // mop handle length (long, so it shows above a ship's rail while mopping)
const ROD_TIP = 1.43; // rod tip distance from the lower grip

/** 'steer': the wheel's centre (height, distance in front of the feet) and the radius the hands hold,
 *  in person units. At scale 1.1 it matches the Sea Biscuit's wheel seen from the helm spot. */
export const WHEEL = Object.freeze({ y: 0.7, z: 0.31, r: 0.3 });
/** 'haul': the rope runs forward (+z) at this height through x = 0 (person units). */
export const HAUL = Object.freeze({ y: 0.74 });
/** 'fight': one guard → slash → recover loop lasts `period` seconds; the blade lands at `hit` of it. */
export const FIGHT = Object.freeze({ period: 1, hit: 0.62 });
const RUN_A = 0.8; // 'run' stride angle
const RUN_F = 1.45; // 'run' cycles per second at tempo 1
const RUN_STANCE = 0.36; // fraction of a cycle each foot is planted (the rest is a flight)

const KINDS = ['pirate', 'man', 'woman', 'kid', 'old'];
export const HATS = ['tricorn', 'bandana', 'cap', 'straw', 'kerchief', 'none', 'bicorne', 'plumed', 'crown', 'horned'];
export const TOOLS = ['mop', 'brush', 'bucket', 'crate', 'rod', 'fiddle', 'hammer', 'lantern', 'none', 'cutlass', 'tape', 'scissors'];
export const BEARDS = ['full', 'goatee', 'stubble', 'braids', 'handlebar', 'none'];
export const HAIR_STYLES = ['crop', 'long', 'ponytail', 'bald'];

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
const BRASS = 0xe0a93a;
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
  // ---- The captain's and the uniforms' options (SPEC2 §7.10). None of them draws a random number,
  // and each one only adds its fields to the look when it is given, so every call without them
  // resolves to exactly the same look as before.
  if (opts.outfit === 'pirate' && kind !== 'pirate') {
    // pirate clothes on another body: shirt, sash, trousers and tall boots (never a skirt or apron)
    L.outfit = 'pirate';
    L.stripes = false;
    L.sleeves = 'long';
    L.vest = null;
    L.apron = null;
    L.bodice = null;
    L.skirt = null;
    delete L.skirtTrim;
    L.sash = L.accent;
    L.belt = null;
    L.shorts = false;
    L.stockings = null;
  }
  if (typeof opts.stripes === 'boolean') L.stripes = opts.stripes;
  if (Number.isFinite(opts.shirt2)) L.shirt2 = opts.shirt2;
  else if (opts.stripes === true && L.shirt2 === L.shirt) L.shirt2 = WHITE;
  if (opts.vest === null || opts.vest === false) L.vest = null;
  else if (Number.isFinite(opts.vest)) L.vest = opts.vest;
  if (Number.isFinite(opts.hatColor)) L.hatColor = opts.hatColor;
  else if (L.hat === 'crown') L.hatColor = GOLD;
  else if (L.hat === 'horned') L.hatColor = 0x9aa3b5;
  if (opts.hatBadge === 'skull') L.hatBadge = 'skull';
  if (typeof opts.beard === 'string' && BEARDS.includes(opts.beard)) {
    const b = opts.beard;
    L.beard = b === 'none' || b === 'handlebar' ? null : b;
    L.moustache = b === 'handlebar' ? 'handlebar' : b === 'full' || b === 'goatee' || b === 'braids';
  }
  if (typeof opts.earring === 'boolean') L.earring = opts.earring;
  if (Number.isFinite(opts.hair)) L.hair = opts.hair;
  if (HAIR_STYLES.includes(opts.hairStyle)) {
    L.bald = opts.hairStyle === 'bald';
    if (!L.bald) L.hairStyle = opts.hairStyle;
  }
  if (Number.isFinite(opts.coat)) {
    L.coat = opts.coat;
    L.coatTrim = hex(opts.coatTrim, GOLD);
    L.sleeves = 'long';
  }
  if (opts.pet === 'parrot') {
    const pc = opts.petColor && typeof opts.petColor === 'object' ? opts.petColor : {};
    L.pet = 'parrot';
    L.petColor = { body: hex(pc.body, 0xe2383d), wing: hex(pc.wing, 0x2f86ea), head: hex(pc.head, 0xe2383d) };
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
// Mid detail (`detail: 'mid'`, the captain's default): about two thirds of the triangles, for people
// seen at most half a screen tall (the captain in the town and at the tailor's). Every part is kept;
// spheres are picked by their size and lathes, rings and tubes get a few fewer segments.
let MID = false;
const SPH_HEAD_MID = () => cached('shm', () => new THREE.SphereGeometry(1, 16, 11));
function coarseMid(geo, size) {
  const p = geo.parameters;
  if (!p) return geo; // lathes are built at mid detail (paintLathe), rounded boxes are plain already
  const fewer = (n, k, min) => Math.max(min, Math.round(n * k));
  switch (geo.type) {
    case 'SphereGeometry':
      if (p.thetaLength < PI) return cached(`cap-mid${p.thetaLength}`, () => new THREE.SphereGeometry(1, 14, 7, 0, TAU, 0, p.thetaLength));
      if (p.widthSegments >= 20) return SPH_HEAD_MID();
      return size >= 0.13 ? SPH() : size >= 0.06 ? SPH_MID() : size >= 0.028 ? SPH_LO() : SPH_TINY();
    case 'TorusGeometry':
      return torus(p.radius, p.tube, fewer(p.tubularSegments, 0.75, 8), fewer(p.radialSegments, 0.8, 4), p.arc);
    case 'CylinderGeometry':
      return cyl(p.radiusTop, p.radiusBottom, p.height, fewer(p.radialSegments, 0.75, 6), p.openEnded);
    case 'ConeGeometry':
      return cone(p.radius, p.height, fewer(p.radialSegments, 0.75, 6));
    case 'CapsuleGeometry':
      return cached(`c-mid${p.radius.toFixed(4)},${p.length.toFixed(4)},${p.radialSegments}`, () => new THREE.CapsuleGeometry(p.radius, p.length, 1, fewer(p.radialSegments, 0.85, 5)));
    default:
      return geo;
  }
}
/** Template cache tag of the detail level being built. */
const tier = () => (LOW ? 'low' : MID ? 'mid' : 'full');
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
  } else if (MID) {
    rows = Math.max(4, Math.ceil(rows * 0.75));
    segs = Math.max(8, Math.ceil(segs * 0.8));
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
    } else if (MID) {
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      geo = coarseMid(geo, geo.boundingSphere.radius * m.getMaxScaleOnAxis());
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

/** The jaw ellipsoid (unit sphere, scaled by the caller) painted with stubble: under the mouth,
 *  along the jaw to the ears and a shadow over the upper lip. */
function stubbleJaw(L) {
  const stub = mix(L.skin, mix(L.hair, DARK, 0.3), 0.42);
  const prof = [[0, -1], [0.5, -0.866], [0.866, -0.5], [1, 0], [0.866, 0.5], [0.5, 0.866], [0, 1]];
  return paintLathe(prof, 18, 24, (row, y, ang) => {
    const a = Math.abs(ang);
    if (y < -0.3 + 0.6 * smooth((a - 0.5) / 0.9)) return stub;
    if (a < 0.45 && y > 0.0 && y < 0.17) return stub;
    return L.skin;
  });
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
  // a fuller jaw for grown-up men (painted with stubble when asked)
  if (L.beard === 'stubble') {
    K.putM(head, stubbleJaw(L), null, THIN, new THREE.Matrix4().compose(V3(0, C - R * 0.36, R * 0.08), new THREE.Quaternion(), V3(R * 0.86, R * 0.62, R * 0.82)));
  } else if (L.kind === 'pirate' || L.kind === 'man' || (L.kind === 'old' && !L.girl)) {
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
  if (L.beard !== 'full' && L.beard !== 'braids') {
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
  if (L.beard === 'full' || L.beard === 'braids') {
    K.put(head, SPH(), hair, INK, [0, C - R * 0.62, R * 0.42], null, [R * 0.8, R * 0.62, R * 0.55]);
    K.put(head, SPH(), hair, THIN, [0, C - R * 0.92, R * 0.48], null, [R * 0.5, R * 0.42, R * 0.38]);
    for (const sd of [-1, 1]) {
      K.put(head, SPH(), hair, THIN, [sd * R * 0.66, C - R * 0.25, R * 0.12], null, [R * 0.28, R * 0.5, R * 0.42]);
    }
    if (L.beard === 'braids') {
      // Blackbeard's two braided tails, each tied off with a gold bead
      for (const sd of SIDES) {
        for (let k = 0; k < 3; k++) {
          const y = C - R * (1.18 + k * 0.17);
          K.put(head, SPH(), hair, THIN, [sd * R * (0.22 + 0.02 * k) + (k % 2 ? -sd : sd) * R * 0.03, y, R * (0.62 + 0.05 * k)], [0.3, 0, (k % 2 ? 1 : -1) * 0.35], [R * 0.13, R * 0.12, R * 0.11]);
        }
        K.put(head, SPH(), GOLD, THIN, [sd * R * 0.27, C - R * 1.68, R * 0.76], null, R * 0.095);
        K.blob(head, hair, THIN, V3(sd * R * 0.27, C - R * 1.72, R * 0.77), V3(sd * R * 0.3, C - R * 1.92, R * 0.8), R * 0.07, R * 0.06);
      }
    }
  } else if (L.beard === 'goatee') {
    K.put(head, SPH(), hair, THIN, [0, C - R * 0.78, R * 0.62], [0.4, 0, 0], [R * 0.3, R * 0.36, R * 0.22]);
  }
  if (L.moustache === 'handlebar') {
    // a big handlebar moustache, its ends curled up
    for (const sd of SIDES) {
      const a = on(sd * R * 0.04, C - R * 0.29, R * 0.07).p;
      const b = on(sd * R * 0.5, C - R * 0.36, R * 0.09).p;
      K.blob(head, hair, THIN, a, b, R * 0.17, R * 0.14);
      // the curl: an arc in the cheek's plane starting under its centre, sweeping out, up and back in
      const e = on(sd * R * 0.58, C - R * 0.27, R * 0.1);
      const q = e.q.clone();
      if (sd < 0) q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), PI));
      q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), -PI / 2));
      K.putM(head, torus(R * 0.09, R * 0.05, 12, 6, PI * 1.4), hair, THIN, new THREE.Matrix4().compose(e.p, q, V3(1, 1, 1)));
      K.put(head, SPH(), hair, THIN, [e.p.x - sd * R * 0.02, e.p.y + R * 0.02, e.p.z], null, R * 0.045);
    }
  } else if (L.moustache) {
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
  const covered = hat === 'bandana' || hat === 'kerchief' || hat === 'tricorn' || hat === 'cap' || hat === 'plumed' || hat === 'bicorne' || hat === 'horned';
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
  if (L.girl || L.kind === 'woman' || L.hairStyle === 'long' || L.hairStyle === 'ponytail') {
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

/** A small skull and crossbones at p, facing along q's +z (badges on bandanas). */
function skullBadge(K, bone, p, q, size) {
  const put = (geo, color, slot, x, y, z, s, rz = 0) => {
    const m = new THREE.Matrix4().compose(V3(x, y, z).multiplyScalar(size).applyQuaternion(q).add(p),
      q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), rz)), s);
    K.putM(bone, geo, color, slot, m);
  };
  for (const sd of SIDES) put(capsule(0.06, 0.62, 5), WHITE, FLAT, 0, -0.05, -0.02, V3(size, size, size * 0.4), sd * 0.8);
  put(SPH(), WHITE, FLAT, 0, 0.08, 0, V3(size * 0.34, size * 0.3, size * 0.12));
  put(SPH(), WHITE, FLAT, 0, -0.14, 0.01, V3(size * 0.2, size * 0.14, size * 0.1));
  for (const sd of SIDES) put(SPH_LO(), DARK, FLAT, sd * 0.12, 0.06, 0.1, V3(size * 0.085, size * 0.1, size * 0.04));
}

/** Bend a unit-sized template so its ends droop: y -= k x^2 (normals follow the bend). */
function bend(g, k) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setY(i, p.getY(i) - k * x * x);
    const nx = n.getX(i) + 2 * k * x * n.getY(i);
    const l = Math.hypot(nx, n.getY(i), n.getZ(i)) || 1;
    n.setXYZ(i, nx / l, n.getY(i) / l, n.getZ(i) / l);
  }
  return g;
}

/** The bicorne's crescent (unit size: x and y ±1, z ±1, scaled by the caller): a lens turned about
 *  the front-back axis so its rim, where the two walls meet, carries the gold piping. */
function bicorneGeo(col, trim) {
  return cached(`bic${col},${trim},${tier()}`, () => {
    const prof = [[0, -1], [0.45, -0.88], [0.8, -0.55], [1, 0], [0.8, 0.55], [0.45, 0.88], [0, 1]];
    const g = paintLathe(prof, 16, 26, (row, y) => (Math.abs(y) < 0.3 ? trim : col));
    g.rotateX(-PI / 2); // lathe axis y -> z: the rim faces up, down and sideways
    return bend(g, 0.32);
  });
}

/** A curling horn (unit size): starts at the origin pointing +x, sweeps up and in, tapering to a point. */
function hornGeo() {
  return cached(`horn${tier()}`, () => {
    const N = LOW ? 6 : MID ? 8 : 11;
    const M = LOW ? 6 : MID ? 7 : 9;
    const ivory = 0xf3e9cf;
    const tip = 0xcdb68a;
    const pos = [];
    const nor = [];
    const col = [];
    const idx = [];
    const c = new THREE.Color();
    const turn = 1.7;
    const Rc = 0.62;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const f = s * turn;
      const cx = Rc * Math.sin(f);
      const cy = Rc * (1 - Math.cos(f));
      const r = 0.24 * Math.pow(1 - s, 0.85);
      const nx = -Math.sin(f);
      const ny = Math.cos(f);
      c.setHex(s > 0.72 ? tip : ivory);
      for (let j = 0; j < M; j++) {
        const a = (j / M) * TAU;
        const ox = nx * Math.cos(a);
        const oy = ny * Math.cos(a);
        const oz = Math.sin(a);
        pos.push(cx + r * ox, cy + r * oy, r * oz);
        nor.push(ox, oy, oz);
        col.push(c.r, c.g, c.b);
      }
    }
    const base = pos.length / 3;
    pos.push(0, 0, 0);
    nor.push(-1, 0, 0);
    col.push(c.setHex(ivory).r, c.g, c.b);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M; j++) {
        const a = i * M + j;
        const b = i * M + ((j + 1) % M);
        const d = (i + 1) * M + j;
        const e = (i + 1) * M + ((j + 1) % M);
        idx.push(a, e, d, a, b, e);
      }
    }
    for (let j = 0; j < M; j++) idx.push(base, (j + 1) % M, j);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  });
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
    if (hat === 'bandana' && L.hatBadge === 'skull') {
      // a skull and crossbones on the front of the cloth
      const v = V3(0, Math.sin(0.24), Math.cos(0.24)).applyEuler(new THREE.Euler(tilt, 0, 0));
      const p = V3(v.x * R * 1.1, v.y * R * 1.07 + C + R * 0.06, v.z * R * 1.08 - R * 0.03);
      skullBadge(K, head, p, new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), v.clone().normalize()), R * 0.62);
    } else if (hat === 'bandana') {
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
  } else if (hat === 'tricorn' || hat === 'plumed') {
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
    if (hat === 'plumed') {
      // the cavalier's feather: three blobs rising off the left wall, arching back over the crown and
      // drooping off the back (broad side facing out)
      const red = 0xe2383d;
      const p0 = V3(R * 0.6, y0 + R * 0.32, R * 0.55);
      const p1 = V3(R * 0.82, y0 + R * 0.95, -R * 0.02);
      const p2 = V3(R * 0.78, y0 + R * 0.86, -R * 0.86);
      const p3 = V3(R * 0.55, y0 + R * 0.2, -R * 1.3);
      K.blob(head, red, INK, p0, p1, R * 0.17, R * 0.34, -0.35);
      K.blob(head, red, INK, p1, p2, R * 0.17, R * 0.36, -0.15);
      K.blob(head, mix(red, WHITE, 0.25), THIN, p2, p3, R * 0.14, R * 0.27, 0.2);
      K.rod(head, mix(red, WHITE, 0.6), FLAT, p0.clone().lerp(p1, 0.12), p2.clone().lerp(p3, 0.3), R * 0.028, 4);
    }
  } else if (hat === 'bicorne') {
    // the admiral's bicorne, worn athwartships: a tall gold-piped crescent from ear to ear over a
    // low crown, with a cockade on the front
    K.put(head, SPH(), col, INK, [0, C + R * 0.62, -R * 0.03], null, [R * 0.88, R * 0.5, R * 0.86]);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.06, 0, 0.05));
    const base = V3(0, C + R * 0.9, -R * 0.06);
    K.putM(head, bicorneGeo(col, L.hatTrim), null, INK, new THREE.Matrix4().compose(base, q, V3(R * 1.62, R * 0.74, R * 0.6)));
    const ck = V3(R * 0.62, R * 0.2, R * 0.49).applyQuaternion(q).add(base);
    K.putM(head, SPH(), 0xe2383d, THIN, new THREE.Matrix4().compose(ck, q, V3(R * 0.17, R * 0.17, R * 0.06)));
    K.putM(head, SPH_LO(), GOLD, FLAT, new THREE.Matrix4().compose(ck.clone().add(V3(0, 0, R * 0.05).applyQuaternion(q)), q, V3(R * 0.07, R * 0.07, R * 0.03)));
  } else if (hat === 'crown') {
    // the Pirate King's crown, set at a jaunty angle on top of the hair: a gold band with five
    // points, jewels round it and a red velvet cap inside
    const F = new THREE.Matrix4().compose(V3(0, C + R * 0.8, -R * 0.02), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0, -0.16)), V3(1, 1, 1));
    const at = (geo, color, slot, p, r, sc) => {
      const m = new THREE.Matrix4().compose(V3(p[0], p[1], p[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2])), typeof sc === 'number' ? V3(sc, sc, sc) : V3(sc[0], sc[1], sc[2]));
      K.putM(head, geo, color, slot, F.clone().multiply(m));
    };
    const bandR = R * 0.84;
    at(SPH(), 0xb3203a, INK, [0, R * 0.14, 0], [0, 0, 0], [R * 0.78, R * 0.48, R * 0.78]);
    at(torus(bandR, R * 0.11, 26, 8), col, INK, [0, R * 0.12, 0], [PI / 2, 0, 0], [1, 1, 1.7]);
    const gems = [0xe2383d, 0x2f86ea, 0x2fa84f];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      const sn = Math.sin(a);
      const cs = Math.cos(a);
      at(cone(R * 0.15, R * 0.36, 8), col, INK, [sn * bandR, R * 0.48, cs * bandR], [cs * 0.18, 0, -sn * 0.18], 1);
      at(SPH(), col, THIN, [sn * bandR * 1.04, R * 0.7, cs * bandR * 1.04], [0, 0, 0], R * 0.075);
      const b = a + PI / 5;
      at(SPH(), gems[k % 3], THIN, [Math.sin(b) * (bandR + R * 0.1), R * 0.12, Math.cos(b) * (bandR + R * 0.1)], [0, b, 0], [R * 0.085, R * 0.1, R * 0.05]);
    }
    at(SPH(), col, THIN, [0, R * 0.62, 0], [0, 0, 0], R * 0.09);
  } else if (hat === 'horned') {
    // a raider's horned helmet: iron dome, bronze rim and crest band, nose guard, curling horns
    const bronze = 0xc9963a;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.14, 0, 0));
    const base = V3(0, C + R * 0.12, -R * 0.03);
    K.putM(head, CAP_SEG(PI * 0.5), col, INK, new THREE.Matrix4().compose(base, q, V3(R * 1.1, R * 1.04, R * 1.08)));
    const qr = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), PI / 2));
    K.putM(head, torus(R * 1.1, R * 0.085, 28, 6), bronze, INK, new THREE.Matrix4().compose(base, qr, V3(1, 1.08 / 1.1, 1)));
    const qc = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), PI / 2));
    K.putM(head, torus(R * 1.08, R * 0.06, 20, 5, PI), bronze, THIN, new THREE.Matrix4().compose(base, qc, V3(1, 1.04 / 1.08, 1)));
    const nTop = V3(0, 0, R * 1.1).applyQuaternion(q).add(base);
    K.rod(head, col, THIN, nTop, nTop.clone().add(V3(0, -R * 0.36, -R * 0.06)), R * 0.065, 6);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + PI / 8;
      const p = V3(Math.sin(a) * R * 1.19, 0, Math.cos(a) * R * 1.17).applyQuaternion(q).add(base);
      K.put(head, SPH_LO(), 0xffe08a, FLAT, [p.x, p.y, p.z], null, R * 0.035);
    }
    for (const sd of SIDES) {
      const p = V3(sd * R * 0.98, R * 0.36, -R * 0.02).applyQuaternion(q).add(base);
      const qh = q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sd > 0 ? 0.25 : PI - 0.25, 0.12)));
      K.putM(head, hornGeo(), null, INK, new THREE.Matrix4().compose(p, qh, V3(R * 0.95, R * 0.95, R * 0.95)));
    }
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

/** The torso lathe's profile (torso space, bottom to top). */
function TORSO_CTRL(P) {
  const h = P.torsoH;
  return [[0, -0.05], [P.rw * 0.8, -0.045], [P.rw, 0.0], [P.rb, h * 0.28], [P.rc, h * 0.55], [P.rs, h * 0.76],
    [P.rs * 0.78, h * 0.88], [P.rs * 0.45, h * 0.96], [0, h]];
}

/** Torso: painted lathe with stripes / vest / bodice / apron / coat, plus the sash or belt on the
 *  hips, and the skirt or coat tails on the skirt bone. */
function buildBody(K, hips, torso, skirtBone, L, P) {
  const h = P.torsoH;
  const ctrl = TORSO_CTRL(P);
  const stripeEvery = 2;
  const coat = L.coat;
  const g = paintLathe(ctrl, 18, coat !== undefined ? 30 : 18, (row, y, ang) => {
    const a = Math.abs(ang);
    const t = y / h;
    if (coat !== undefined && t > 0) {
      // long coat: open down the front, lapels / facings in the trim colour
      const o = coatOpen(t);
      if (a > o + coatLapel(t)) return coat;
      if (a > o) return L.coatTrim;
    }
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
  // six gold buttons down the coat's front edges
  if (coat !== undefined) {
    for (let i = 0; i < 3; i++) {
      const t = 0.2 + i * 0.19;
      const r = profileR(ctrl, t * h) + 0.004;
      const a = coatOpen(t) + coatLapel(t) + 0.15;
      for (const sd of SIDES) K.put(torso, SPH(), GOLD, THIN, [sd * r * Math.sin(a), t * h, r * Math.cos(a) * P.zs], [0, sd * a, 0], [0.019, 0.019, 0.011]);
    }
  }
  // apron neck strap
  if (L.apron) {
    for (const sd of [-1, 1]) {
      K.rod(torso, L.apron, THIN, V3(sd * P.rc * 0.42, h * 0.6, P.rc * P.zs * 0.85), V3(sd * P.rs * 0.35, h * 0.95, 0.0), 0.012, 5);
    }
  }
  // collar / neckerchief
  if (L.kind === 'pirate' || L.outfit === 'pirate') {
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
  // coat tails on the same bone (they swing when walking and running)
  if (coat !== undefined && skirtBone) {
    const s = L.skirt ? 1.12 : 1;
    K.putM(skirtBone, coatTailsGeo(P, coat, L.coatTrim), null, INK, new THREE.Matrix4().makeScale(s, 1, 0.94 * s));
  }
}

/** Half-width (radians from the front) of a coat's open front at torso height t (0 waist .. 1 neck), and its lapel band. */
const coatOpen = (t) => 0.26 + 0.2 * t;
const coatLapel = (t) => 0.2 + 0.16 * t;

/** Radius of a lathe profile (as paintLathe smooths it) at height y. */
function profileR(ctrl, y) {
  const pts = new THREE.SplineCurve(ctrl.map(([r, yy]) => new THREE.Vector2(r, yy))).getSpacedPoints(64);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) return Math.max(0, lerp(a.x, b.x, (y - a.y) / (b.y - a.y)));
  }
  return 0;
}

/**
 * Coat tails (hips space): a thick shell of revolution from the waist (under the sash) to the knee,
 * open at the front so the legs stride and sit through the gap. Outside in the coat colour with a
 * trimmed hem and front edges, inside a darker lining. Smooth normals; edge strips share their
 * vertices with the surfaces so the ink outline stays closed.
 */
function coatTailsGeo(P, coat, trim) {
  const rows = LOW ? 5 : MID ? 7 : 9;
  const segs = LOW ? 12 : MID ? 16 : 22;
  const top = P.torsoY + 0.03;
  const hem = P.legY - P.thigh * 1.08;
  const pts = new THREE.SplineCurve([
    new THREE.Vector2(P.rw * 1.07, top),
    new THREE.Vector2(P.pelvisR * 1.13, -0.02),
    new THREE.Vector2(P.pelvisR * 1.27, (hem - 0.02) * 0.55),
    new THREE.Vector2(P.pelvisR * 1.5, hem),
  ]).getSpacedPoints(rows);
  const n = pts.length;
  const nr = [];
  const ny = [];
  for (let k = 0; k < n; k++) {
    const a = pts[Math.max(0, k - 1)];
    const b = pts[Math.min(n - 1, k + 1)];
    // outward normal of a profile running downwards: (-dy, dr)
    const x = -(b.y - a.y);
    const y = b.x - a.x;
    const l = Math.hypot(x, y) || 1;
    nr.push(x / l);
    ny.push(y / l);
  }
  const thick = 0.013;
  const open0 = 0.8;
  const open1 = 1.12;
  const lining = mix(coat, DARK, 0.42);
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];
  const map = new Map();
  const c = new THREE.Color();
  // vertex (k, j) on the outer (side 0) or inner (side 1) surface, split only by colour
  const vert = (k, j, side, hex) => {
    const key = ((k * (segs + 1) + j) * 2 + side) * 16777216 + hex;
    let v = map.get(key);
    if (v !== undefined) return v;
    v = pos.length / 3;
    const o = lerp(open0, open1, k / rows);
    const a = o + (TAU - 2 * o) * (j / segs);
    const sn = Math.sin(a);
    const co = Math.cos(a);
    const r = pts[k].x - (side ? thick * nr[k] : 0);
    const y = pts[k].y - (side ? thick * ny[k] : 0);
    const f = side ? -1 : 1;
    pos.push(r * sn, y, r * co);
    nor.push(f * nr[k] * sn, f * ny[k], f * nr[k] * co);
    c.setHex(hex);
    col.push(c.r, c.g, c.b);
    map.set(key, v);
    return v;
  };
  const P0 = V3();
  const P1 = V3();
  const P2 = V3();
  const at = (v, out) => out.set(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
  // a quad facing along `want` (corners in any cyclic order)
  const quad = (a, b, cc, d, want) => {
    at(a, P0);
    at(b, P1).sub(P0);
    at(cc, P2).sub(P0);
    if (P1.cross(P2).dot(want) >= 0) idx.push(a, b, cc, a, cc, d);
    else idx.push(a, cc, b, a, d, cc);
  };
  const W = V3();
  const dirAt = (k, j, out) => {
    const o = lerp(open0, open1, k / rows);
    const a = o + (TAU - 2 * o) * (j / segs);
    return out.set(nr[k] * Math.sin(a), ny[k], nr[k] * Math.cos(a));
  };
  for (let k = 0; k < rows; k++) {
    for (let j = 0; j < segs; j++) {
      const hex = k === rows - 1 || j === 0 || j === segs - 1 ? trim : coat;
      dirAt(k, j + 0.5, W);
      quad(vert(k, j, 0, hex), vert(k, j + 1, 0, hex), vert(k + 1, j + 1, 0, hex), vert(k + 1, j, 0, hex), W);
      quad(vert(k, j, 1, lining), vert(k, j + 1, 1, lining), vert(k + 1, j + 1, 1, lining), vert(k + 1, j, 1, lining), W.negate());
    }
  }
  // front edges (facing the opening) and the hem / waist rims
  for (let k = 0; k < rows; k++) {
    for (const j of [0, segs]) {
      const o = lerp(open0, open1, (k + 0.5) / rows);
      const a = o + (TAU - 2 * o) * (j / segs);
      const sgn = j === 0 ? -1 : 1;
      W.set(sgn * Math.cos(a), 0, -sgn * Math.sin(a));
      quad(vert(k, j, 0, trim), vert(k + 1, j, 0, trim), vert(k + 1, j, 1, trim), vert(k, j, 1, trim), W);
    }
  }
  for (const k of [0, rows]) {
    for (let j = 0; j < segs; j++) {
      const hex = k === rows ? trim : coat;
      W.set(0, k === rows ? -1 : 1, 0);
      quad(vert(k, j, 0, hex), vert(k, j + 1, 0, hex), vert(k, j + 1, 1, hex), vert(k, j, 1, hex), W);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function buildArm(K, arm, fore, sd, L, P) {
  const coat = L.coat;
  const sleeve = coat !== undefined ? coat : L.shirt;
  const stripes = L.stripes && coat === undefined;
  // shoulder ball + upper sleeve
  const puff = L.sleeves === 'puff';
  const shoulderCol = sleeve;
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
  const cuffY = -P.b + 0.1;
  const fg = paintLathe(capsuleProfile(P.foreR, -P.b + 0.03, P.foreR * 1.08, -0.005, 2), 7, 10, (row, y) => {
    if (bare) return L.skin;
    if (coat !== undefined) return y < cuffY ? L.coatTrim : coat;
    if (stripes && row % 4 < 2) return L.shirt2;
    return sleeve;
  });
  K.putM(fore, fg, null, INK, new THREE.Matrix4());
  if (coat !== undefined) {
    // a deep turned-back cuff in the trim colour, a lace ruffle at the wrist
    K.put(fore, torus(P.foreR * 1.18, 0.017, 14, 5), L.coatTrim, THIN, [0, cuffY, 0], [PI / 2, 0, 0]);
    K.put(fore, torus(P.foreR * 0.88, 0.017, 12, 5), WHITE, THIN, [0, -P.b + 0.04, 0], [PI / 2, 0, 0]);
  } else if (L.sleeves === 'rolled' && !puff) K.put(fore, torus(P.foreR * 1.15, 0.018, 12, 5), L.shirt, THIN, [0, -0.012, 0], [PI / 2, 0, 0]);
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
  const striped = L.kind === 'kid' && L.girl && !L.outfit;
  const sg = paintLathe(capsuleProfile(P.shinR * 0.92, -P.shin + 0.08, P.shinR, -0.005, 2), 7, 10, (row) =>
    striped && row % 2 === 0 ? mix(L.skirtTrim || WHITE, WHITE, 0.2) : lowerCol);
  K.putM(shin, sg, null, INK, new THREE.Matrix4());
  if (L.shorts && !L.skirt) {
    // trouser leg ends at the knee
    K.put(shin, torus(P.shinR * 1.12, 0.022, 14, 5), L.pants, THIN, [0, 0.0, 0], [PI / 2, 0, 0]);
  }
  // boot: shaft with a turned-down cuff, then a flat-soled foot
  const b = P.boot;
  const tall = L.kind === 'pirate' || L.outfit === 'pirate';
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
function buildTool(K, tool, toolB, L, P) {
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
  } else if (kind === 'cutlass') {
    // origin in the fist; the blade runs along +y with its edge facing +z, curving back to the tip
    K.rod(tool, 0x4a2e1e, INK, V3(0, -0.06, 0), V3(0, 0.06, 0), 0.02, 7);
    K.put(tool, SPH(), BRASS, THIN, [0, -0.077, 0], null, 0.025);
    K.put(tool, SPH(), BRASS, INK, [0, 0.07, 0.01], null, [0.036, 0.017, 0.056]);
    K.put(tool, torus(0.075, 0.011, 14, 5, 2.4), BRASS, THIN, [0, -0.002, 0.006], [0, -PI / 2, -1.2]);
    K.putM(tool, bladeGeo(), null, INK, new THREE.Matrix4());
  } else if (kind === 'tape') {
    // a tailor's tape round the neck (the tool bone sits at the base of the neck, turned with the
    // torso) ...
    const yel = 0xffd84a;
    const h = P.torsoH;
    const y0 = h * 0.94;
    const rr = P.rs * 0.62;
    K.put(tool, torus(rr, 0.013, 18, 4, PI * 1.2), yel, THIN, [0, 0, 0], [PI / 2, 0, PI * 0.9], [1, P.zs * 1.05, 0.5]);
    // ... its two ends hanging down the chest, clear of the shirt
    const chest = (y, x) => Math.sqrt(Math.max(0, profileR(TORSO_CTRL(P), y) ** 2 - x * x)) * P.zs + 0.014;
    for (const sd of SIDES) {
      const a = V3(sd * rr * 0.95, 0, rr * 0.33 * P.zs);
      const b = V3(sd * rr * 0.78, -0.07, chest(y0 - 0.07, rr * 0.78));
      const e = V3(sd * rr * 0.62, sd > 0 ? -0.2 : -0.24, chest(y0 + (sd > 0 ? -0.2 : -0.24), rr * 0.62));
      K.blob(tool, yel, THIN, a, b, 0.021, 0.006);
      K.blob(tool, yel, THIN, b, e, 0.021, 0.006);
      K.put(tool, SPH(), IRON, THIN, [e.x, e.y - 0.004, e.z], null, [0.022, 0.012, 0.009]);
      for (let k = 1; k <= 3; k++) {
        const m = b.clone().lerp(e, k / 4.2);
        K.put(tool, SPH_LO(), 0x5a4030, FLAT, [m.x, m.y, m.z + 0.006], null, [0.013, 0.003, 0.003]);
      }
    }
    // the length held stretched between the hands ('measure'): unit long along +x, scaled to the gap
    K.put(toolB, rbox(1, 0.026, 0.006, 0.0029), yel, THIN, [0.5, 0, 0]);
  } else if (kind === 'scissors') {
    // barber's shears: two halves pivoting at the origin (tool and toolB open them), blades along +y,
    // finger rings below the pivot
    for (const [bone, sd] of [[tool, 1], [toolB, -1]]) {
      K.blob(bone, 0xe3e8f0, INK, V3(sd * 0.006, -0.004, 0), V3(-sd * 0.004, 0.17, 0), 0.012, 0.0045, 0);
      K.rod(bone, 0x3a3440, THIN, V3(0, 0, 0), V3(sd * 0.02, -0.035, 0), 0.0065, 5);
      K.put(bone, torus(0.02, 0.006, 12, 4), 0x3a3440, THIN, [sd * 0.03, -0.055, 0]);
    }
    K.put(tool, SPH_LO(), BRASS, FLAT, [0, 0, 0.006], null, [0.008, 0.008, 0.004]);
  }
}

/** The cutlass blade (tool space): a lens-section blade from the guard, widening and curving back
 *  to a clipped point; the edge side is a lighter steel. */
function bladeGeo() {
  return cached(`blade${tier()}`, () => {
    const N = LOW ? 6 : MID ? 9 : 12;
    const M = LOW ? 6 : MID ? 8 : 10;
    const steel = new THREE.Color(0xc4cfdc);
    const edge = new THREE.Color(0xf6f9fc);
    const pos = [];
    const nor = [];
    const col = [];
    const idx = [];
    const c = new THREE.Color();
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const y = 0.075 + 0.52 * s;
      const zc = -0.075 * s * s;
      const w = (0.022 + 0.016 * s) * (s > 0.8 ? Math.sqrt(Math.max(0, (1 - s) / 0.2)) : 1);
      const th = 0.0075 * (1 - 0.45 * s);
      const zs = zc + (s > 0.8 ? -0.02 * (s - 0.8) / 0.2 : 0); // the point sits towards the spine
      for (let j = 0; j < M; j++) {
        const a = (j / M) * TAU;
        const x = th * Math.sin(a);
        const z = zs + w * Math.cos(a);
        pos.push(x, y, z);
        const nx = Math.sin(a) / th;
        const nz = Math.cos(a) / Math.max(w, 1e-3);
        const l = Math.hypot(nx, nz) || 1;
        nor.push(nx / l, 0, nz / l);
        c.copy(steel).lerp(edge, smooth((Math.cos(a) - 0.35) / 0.5));
        col.push(c.r, c.g, c.b);
      }
    }
    const base = pos.length / 3;
    pos.push(0, 0.075, 0);
    nor.push(0, -1, 0);
    col.push(steel.r, steel.g, steel.b);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M; j++) {
        const a = i * M + j;
        const b = i * M + ((j + 1) % M);
        const d = (i + 1) * M + j;
        const e = (i + 1) * M + ((j + 1) % M);
        idx.push(a, b, e, a, e, d);
      }
    }
    for (let j = 0; j < M; j++) idx.push(base, (j + 1) % M, j);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  });
}

// ---------------------------------------------------------------------------
// The parrot (pet bones: the body perched on the left shoulder, its head and two wings)
// ---------------------------------------------------------------------------
function buildPet(K, pet, head, wingL, wingR, L) {
  const c = L.petColor;
  const beak = 0xf4e3c3;
  // toes gripping the shoulder
  for (const sd of SIDES) K.put(pet, SPH(), 0x6b6470, THIN, [sd * 0.017, 0.007, 0.014], null, [0.012, 0.008, 0.02]);
  // an upright egg of a body, tail feathers hanging down behind the shoulder
  K.put(pet, SPH(), c.body, INK, [0, 0.082, 0], [0.22, 0, 0], [0.047, 0.074, 0.048]);
  K.blob(pet, c.wing, INK, V3(0, 0.05, -0.03), V3(0, -0.085, -0.075), 0.024, 0.011);
  K.blob(pet, c.body, THIN, V3(0, -0.06, -0.07), V3(0, -0.115, -0.083), 0.017, 0.009);
  // head: hooked pale beak with a dark lower bill, white face patches, beady eyes
  K.put(head, SPH(), c.head, INK, [0, 0.026, 0.004], null, [0.041, 0.041, 0.043]);
  K.blob(head, beak, THIN, V3(0, 0.034, 0.034), V3(0, -0.004, 0.066), 0.016, 0.019);
  K.put(head, SPH(), 0x3a3440, THIN, [0, 0.006, 0.044], null, [0.012, 0.011, 0.014]);
  for (const sd of SIDES) {
    K.put(head, SPH(), WHITE, THIN, [sd * 0.029, 0.031, 0.02], [0, sd * 0.7, 0], [0.012, 0.016, 0.011]);
    K.put(head, SPH_LO(), DARK, FLAT, [sd * 0.036, 0.034, 0.024], null, [0.006, 0.0075, 0.0065]);
  }
  // wings folded against the body (they hang from their pivots and flap out)
  for (const [bone, sd] of [[wingL, 1], [wingR, -1]]) {
    K.blob(bone, c.wing, INK, V3(0, 0.004, 0.006), V3(sd * 0.004, -0.085, -0.026), 0.011, 0.034);
    K.blob(bone, mix(c.wing, 0xffd84a, 0.55), THIN, V3(sd * 0.006, -0.004, 0.012), V3(sd * 0.008, -0.04, 0.0), 0.007, 0.022);
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
 *   foreL, foreR, shinL, shinR, eyes, mouth, skirt, toolB (+ pet, petHead, petWingL, petWingR with a
 *   parrot) }, mesh, skeleton, keep: true (+ shared: the cache entry of a share: true person) }.
 * The pivots are THREE.Bone objects. Materials are shared (see disposePerson).
 * opts.share = true takes the geometry from a cache keyed by the resolved look (boarding parties,
 * overboard tumblers): only the bones and Skeleton are new; see releaseSharedPeople.
 * opts.detail = 'low' builds a lighter person (about a third of the triangles) for crowds that are
 * only ever seen small; it looks the same from a distance. 'mid' (about two thirds) is the default
 * for the captain (outfit 'pirate'), which stays under 12k triangles in every outfit; 'full' forces
 * full detail.
 */
export function buildPerson(opts = {}) {
  const o = opts || {};
  LOW = o.detail === 'low';
  MID = !LOW && o.detail !== 'full' && (o.detail === 'mid' || o.outfit === 'pirate');
  try {
    return build(o);
  } finally {
    LOW = false;
    MID = false;
  }
}
function build(opts) {
  const L = resolveLook(opts);
  const P = proportions(L);
  const K = new Kit();
  const group = new THREE.Group();
  group.name = `person:${L.kind}`;
  const key = opts.share === true ? lookKey(L) : null;
  const shared = key !== null ? SHARE.get(key) : undefined;

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
  // the parrot perches on the left shoulder (its bones exist only when it does)
  const pet = L.pet ? K.bone('pet', torso, P.shX + 0.03, P.shY + P.armR * 1.2, -0.02) : null;
  const petHead = pet ? K.bone('petHead', pet, 0, 0.148, 0.008) : null;
  const petWingL = pet ? K.bone('petWingL', pet, 0.042, 0.122, -0.006) : null;
  const petWingR = pet ? K.bone('petWingR', pet, -0.042, 0.122, -0.006) : null;
  group.add(hips, tool, toolB);
  group.updateMatrixWorld(true);

  let geometry;
  let mats;
  if (shared) {
    // same resolved look as a person built before: reuse its geometry, only the bones are new
    ({ geometry, mats } = shared);
    shared.refs++;
  } else {
    buildHead(K, head, eyes, mouth, L, P);
    buildBody(K, hips, torso, L.skirt || L.coat !== undefined ? skirt : null, L, P);
    buildArm(K, armL, foreL, 1, L, P);
    buildArm(K, armR, foreR, -1, L, P);
    buildLeg(K, legL, shinL, 1, L, P);
    buildLeg(K, legR, shinR, -1, L, P);
    buildTool(K, tool, toolB, L, P);
    if (pet) buildPet(K, pet, petHead, petWingL, petWingR, L);
    ({ geometry, mats } = bake(K));
  }
  const entry = shared || (key !== null ? { key, geometry, mats, refs: 1, orphan: false } : null);
  if (entry && !shared) SHARE.set(key, entry);
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
  if (pet) Object.assign(parts, { pet, petHead, petWingL, petWingR });
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
  if (entry) Object.defineProperty(group.userData, 'shared', hidden(entry));
  animatePerson(group, 0, 'idle');
  return group;
}

/**
 * Ground speed (world units per second) that matches the stride of 'walk', 'carry' or 'run'
 * at the given tempo, so a caller moving the group along a path keeps the feet from sliding.
 */
export function walkSpeed(person, action = 'walk', speed = 1) {
  const R = person && person.userData && person.userData.rig;
  if (!R) return 0;
  const legLen = R.P.thigh + R.P.shin;
  if (action === 'run') {
    // a planted foot travels 2 D (D = legLen sin RUN_A) while it is down, RUN_STANCE of a cycle
    return ((2 * legLen * Math.sin(RUN_A) * RUN_F) / RUN_STANCE) * (Number.isFinite(speed) ? speed : 1) * person.scale.x;
  }
  const [A, f] = action === 'carry' ? [0.38, 0.95] : [0.5, 1.05];
  return 4 * legLen * Math.sin(A) * f * (Number.isFinite(speed) ? speed : 1) * person.scale.x;
}

/**
 * World position of a hand's centre (s = +1 left, -1 right) in the current pose, e.g. to tie the
 * 'swing' rope or the 'haul' line to it. Updates the person's world matrices.
 */
export function handPosition(person, s = -1, out = new THREE.Vector3()) {
  const R = person && person.userData && person.userData.rig;
  if (!R) return out.set(0, 0, 0);
  person.updateMatrixWorld(true);
  return out.set(0, -R.P.b, 0).applyMatrix4((s > 0 ? R.foreL : R.foreR).matrixWorld);
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
  if (u.shared) {
    // shared geometry: one reference fewer (freed by releaseSharedPeople, or now if already released)
    const e = u.shared;
    e.refs = Math.max(0, e.refs - 1);
    if (e.refs === 0 && e.orphan) e.geometry.dispose();
  } else if (u.mesh && u.mesh.geometry) u.mesh.geometry.dispose();
  if (u.skeleton) u.skeleton.dispose();
}

// ---------------------------------------------------------------------------
// Shared geometry (buildPerson({ share: true })): people with the same resolved look draw the same
// geometry; each still has its own bones and Skeleton.
// ---------------------------------------------------------------------------
const SHARE = new Map();
/** Cache key of a resolved look: everything that shapes the geometry (not the animation phase,
 *  blink rate, seed or scale) and the detail level. */
function lookKey(L) {
  const { phase, blink, seed, scale, ...rest } = L;
  return `${tier()}|${JSON.stringify(rest)}`;
}

/**
 * Empty the shared-geometry cache (main calls it on level change). Geometry nobody uses any more is
 * freed now; geometry still worn by a living person is freed when its last person is disposed.
 */
export function releaseSharedPeople() {
  for (const e of SHARE.values()) {
    if (e.refs === 0) e.geometry.dispose();
    else e.orphan = true;
  }
  SHARE.clear();
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
const ZV = new THREE.Vector3(0, 0, 1);

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
  if (k === 'cutlass') {
    // carried in the right hand, blade forward and down
    armE(R, -1, -0.2 + 0.4 * walking * Math.sin(swing), 0.16, 0.6);
    toolInHand(R, -1, PI / 2 + 0.7, 0, 0);
    return true;
  }
  if (k === 'scissors') {
    armE(R, -1, -0.3 + 0.3 * walking * Math.sin(swing), 0.1, 1.15);
    toolInHand(R, -1, PI / 2 - 0.35, 0, 0);
    return true;
  }
  return false;
}

// --- worn things, placed after every action ---------------------------------
/** A cutlass the action has no use for goes through the sash on the left hip, hilt up in front. */
function sheathe(R) {
  const P = R.P;
  const [A, B] = R.s;
  // blade direction (hips space): down, back and a little out
  B.set(0.22, -0.72, -0.66).normalize().applyQuaternion(R.hips.quaternion);
  A.set(P.rw + 0.035, P.torsoY - 0.005, 0.07).applyQuaternion(R.hips.quaternion).add(R.hips.position);
  A.addScaledVector(B, -0.085); // the guard rests on the sash
  R.tool.scale.setScalar(1);
  toolAlong(R, A, _v1.copy(A).add(B), 0.4);
}
/** The tailor's tape lies round the neck whatever the action. */
function drapeTape(R) {
  R.tool.position.set(0, R.P.torsoH * 0.94, 0).applyMatrix4(R.mht);
  R.tool.quaternion.copy(R.qht);
  R.tool.scale.setScalar(1);
}
/** The second shear follows the first, opened by R.snip radians about the pivot. */
function shears(R) {
  if (R.tool.scale.x < 0.01) {
    hideTool(R, R.toolB);
    return;
  }
  R.toolB.position.copy(R.tool.position);
  R.toolB.quaternion.copy(R.tool.quaternion).multiply(_q2.setFromAxisAngle(ZV, R.snip / 2));
  R.tool.quaternion.multiply(_q2.setFromAxisAngle(ZV, -R.snip / 2));
}
/**
 * Coat tails (on the skirt bone): they trail behind a stride, swing with the steps (R.tailSwing, set by
 * 'walk' / 'run'), lie back over a seat and fold up out of the deck when kneeling.
 */
function fitTails(R, action) {
  const sk = R.skirt;
  const P = R.P;
  let rx = Math.max(0, R.legL.rotation.x, R.legR.rotation.x) * 0.75 + R.tailSwing;
  let sy = 1;
  if (action === 'sit' || action === 'fish') {
    rx = 0.6;
    sy = 0.85;
  } else {
    // kneeling / crouching: shorten the tails so the hem stays off the deck
    const drop = P.hipY - R.hips.position.y;
    if (drop > 0.05) {
      sy = clamp(1 - (drop - 0.05) * 3.2, 0.42, 1);
      rx = Math.max(rx, 0.35);
    }
  }
  sk.position.set(0, 0, 0);
  sk.rotation.set(rx, 0, 0);
  sk.scale.set(1 + 0.12 * (1 - sy), sy, 1 + 0.12 * (1 - sy));
}
/**
 * The parrot: looks about and bobs its head every 3 s on the shoulder; flaps when running. When the
 * left arm goes up (cheering, waving, hands up, swinging, falling) it flutters up over the hat.
 */
function petPose(R, t, action) {
  const P = R.P;
  const q = frac(t / 3);
  const bob = q < 0.18 ? Math.sin((q / 0.18) * PI) : 0;
  // how far the left upper arm is raised (0 hanging or forward, 1 above the shoulder)
  _v1.set(0, -1, 0).applyQuaternion(R.armL.quaternion);
  const forced = action === 'cheer' || action === 'surrender' || action === 'swing' || action === 'fall';
  const fly = forced ? 1 : smooth((_v1.y - 0.05) / 0.45);
  const flap = fly > 0 || action === 'run';
  R.pet.rotation.set(-0.2 * fly, (0.35 + 0.15 * Math.sin(t * 0.31)) * (1 - fly), 0);
  R.petHead.rotation.set(0.5 * bob - 0.05 + 0.35 * fly, 0.45 * Math.sin(t * 0.53 + 1) * (1 - 0.5 * fly), 0.12 * bob);
  if (fly > 0) {
    const rest = R.pet.userData.rest;
    const hat = R.L.hat === 'none' || R.L.hat === 'bandana' || R.L.hat === 'kerchief' ? 0.05 : 0.15;
    const hover = P.headY + P.R * 2 + hat + 0.025 * Math.sin(t * TAU * 1.6);
    R.pet.position.set(lerp(rest.x, 0.1, fly), lerp(rest.y, hover, fly), lerp(rest.z, -0.13, fly));
  }
  if (flap) {
    const f = 0.5 + 0.5 * Math.sin(t * TAU * 4.5);
    const k = Math.max(fly, 0.6);
    R.petWingL.rotation.set(0, 0, k * (0.35 + 1.15 * f));
    R.petWingR.rotation.set(0, 0, -k * (0.35 + 1.15 * f));
    R.pet.position.y += 0.012 * f * (1 - fly);
  }
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
    R.tailSwing = 0.05 + 0.04 * Math.sin(2 * ph); // coat tails only
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
    const sd = R.tk === 'none' || R.tk === 'crate' || R.tk === 'tape' ? -1 : 1;
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
    } else if (k === 'rod' || k === 'hammer' || k === 'brush' || k === 'fiddle' || k === 'cutlass' || k === 'scissors') {
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

  run(R, t) {
    const P = R.P;
    const ph = t * TAU * RUN_F; // keep in step with walkSpeed()
    runLegs(R, ph);
    R.torso.rotation.x = 0.13 + P.hunch * 0.5 + 0.03 * Math.cos(2 * ph);
    R.head.rotation.x = -0.2;
    bodyDone(R);
    // arms pumping, elbows bent, opposite to the legs
    const busy = toolRest(R, t, 1, ph);
    if (busy !== 'both') {
      armE(R, 1, 0.85 * Math.sin(ph) - 0.15, 0.16, 1.45 - 0.35 * Math.sin(ph));
      if (!busy) armE(R, -1, -0.85 * Math.sin(ph) - 0.15, 0.16, 1.45 + 0.35 * Math.sin(ph));
    }
    R.tailSwing = 0.3 + 0.08 * Math.sin(2 * ph);
    R.mouth.scale.set(0.55, 0.3, 1);
  },

  proud(R, t) {
    const P = R.P;
    // feet apart, chest out, chin up, fists on the hips
    legsStand(R, 0.11);
    R.hips.rotation.z = 0.02 * Math.sin(t * 0.5);
    R.legL.rotation.z -= R.hips.rotation.z;
    R.legR.rotation.z -= R.hips.rotation.z;
    R.torso.rotation.set(-0.08 + P.hunch * 0.4 + 0.02 * Math.sin(t * 1.7), 0.05 * Math.sin(t * 0.4), 0);
    R.head.rotation.set(-0.2 + 0.02 * Math.sin(t * 1.7 + 0.5), 0.3 * Math.sin(t * 0.29), 0.04);
    bodyDone(R);
    handOnHip(R, 1);
    handOnHip(R, -1);
    setDown(R);
  },

  steer(R, t, o) {
    const P = R.P;
    const turn = Number.isFinite(o.turn) ? clamp(o.turn, -1, 1) : 0;
    // feet braced, leaning into the turn, hands on the spokes at ten and two (WHEEL)
    legsStand(R, 0.09);
    R.hips.rotation.z = 0.04 * turn;
    R.hips.position.x = -0.02 * turn;
    R.torso.rotation.set(0.14 + P.hunch * 0.4, -0.12 * turn, 0.08 * turn);
    R.head.rotation.set(-0.1, -0.1 * turn + 0.22 * Math.sin(t * 0.23), -0.04 * turn);
    bodyDone(R);
    const rot = -0.7 * turn + 0.04 * Math.sin(t * 1.3);
    for (const sd of SIDES) {
      const a = sd * 1.0 + rot; // from the top of the wheel, + towards the left (+x)
      reachP(R, sd, Math.sin(a) * WHEEL.r, WHEEL.y + Math.cos(a) * WHEEL.r, WHEEL.z - 0.03, sd * 0.9, -0.5, -0.4);
    }
    setDown(R);
  },

  point(R, t) {
    const P = R.P;
    const [A, B] = R.s;
    // "Fire!": right foot forward, the right arm thrust out ahead, left fist on the hip
    R.hips.position.y -= 0.012;
    R.hips.position.z = 0.02;
    footAt(R, -1, -P.legX - 0.02, 0, 0.15, 1);
    footAt(R, 1, P.legX + 0.04, 0, -0.08, 1);
    const jab = 0.5 + 0.5 * Math.sin(t * TAU * 1.6);
    R.torso.rotation.set(0.1 + P.hunch * 0.4 + 0.02 * jab, 0.3, 0.04);
    R.head.rotation.set(-0.12, -0.3, 0.05);
    bodyDone(R);
    reachP(R, -1, -0.1, P.hipY + P.torsoY + P.shY + 0.16 + 0.02 * jab, 0.55, -0.6, -0.6, -0.3);
    handOnHip(R, 1);
    if (R.tk === 'cutlass') {
      // pointing with the blade, along the arm and a little up
      handP(R, -1, A);
      B.set(-P.shX, P.shY, 0).applyMatrix4(R.mht);
      B.subVectors(A, B).normalize();
      B.y += 0.25;
      toolAlong(R, A, B.normalize().add(A), PI / 2);
    } else setDown(R);
    R.mouth.scale.set(1, 1, 1);
  },

  swing(R, t) {
    const P = R.P;
    // hanging from a rope above (the caller moves the group along the arc): hands stacked up in
    // front of the right shoulder, knees tucked, yelling
    R.hips.position.y = P.hipY + 0.02;
    for (const sd of SIDES) {
      const leg = sd > 0 ? R.legL : R.legR;
      const shin = sd > 0 ? R.shinL : R.shinR;
      const k = Math.sin(t * 5.5 + (sd > 0 ? 0 : 2));
      leg.rotation.set(-1.2 + 0.12 * k, 0, sd * 0.16);
      shin.rotation.x = 1.75 - 0.15 * k;
    }
    R.torso.rotation.set(-0.06 + P.hunch * 0.3, -0.3, 0.05);
    R.head.rotation.set(-0.22, 0.32, 0.0);
    bodyDone(R);
    const top = P.hipY + P.torsoY + P.shY;
    reachP(R, -1, -0.15, top + 0.3, 0.14, -0.7, -0.2, -0.6);
    reachP(R, 1, -0.11, top + 0.16, 0.2, 0.9, -0.4, -0.4);
    hideTool(R); // in mid-air nothing can be set down (a cutlass goes in the sash)
    hideTool(R, R.toolB);
    R.mouth.scale.set(0.9, 1.1, 1);
  },

  fight(R, t) {
    const P = R.P;
    const [A, B] = R.s;
    // a 1 s loop (FIGHT.period): guard, wind up over the shoulder, a lunging slash, recover
    const q = frac(t / FIGHT.period);
    let i = 0;
    while (i < FIGHT_KEYS.length - 2 && q >= FIGHT_KEYS[i + 1].q) i++;
    const k0 = FIGHT_KEYS[i];
    const k1 = FIGHT_KEYS[i + 1];
    const u = smooth((q - k0.q) / (k1.q - k0.q));
    const at = (n, j) => (j === undefined ? lerp(k0[n], k1[n], u) : lerp(k0[n][j], k1[n][j], u));
    const f = (P.hipY + P.torsoY + P.shY) / 0.71; // keys are for a grown-up: scale to this body
    const bob = 0.008 * Math.sin(t * TAU * 2);
    R.hips.position.set(0, P.hipY - at('drop') * f + bob, at('lunge') * f);
    R.hips.rotation.y = at('yaw') * 0.5;
    footAt(R, -1, -P.legX - 0.03, 0, at('foot') * f, 1); // right foot leads
    footAt(R, 1, P.legX + 0.07, 0, -0.13 * f, 1);
    R.torso.rotation.set(at('lean') + P.hunch * 0.3, at('yaw') * 0.6, -0.05);
    R.head.rotation.set(-0.08 - at('lean') * 0.4, -at('yaw') * 0.9, 0);
    bodyDone(R);
    reachP(R, -1, at('hand', 0) * f, at('hand', 1) * f, at('hand', 2) * f, -0.7, -0.5, -0.5);
    // the free arm held out behind for balance
    armE(R, 1, 0.35 + 0.25 * at('lean'), 0.6, 0.9);
    if (R.tk === 'cutlass') {
      handP(R, -1, A);
      B.set(at('blade', 0), at('blade', 1), at('blade', 2)).normalize().add(A);
      toolAlong(R, A, B, PI / 2);
    } else setDown(R);
    const slash = q > 0.55 && q < 0.8 ? 1 : 0.25;
    R.mouth.scale.set(0.8, slash, 1);
  },

  fall(R, t) {
    const P = R.P;
    // overboard: arms windmilling, legs bicycling, mouth wide open; { since } starts the flail from
    // standing (the caller moves and spins the group)
    const e = R.elapsed;
    const k = e === null ? 1 : smooth(e / 0.2);
    const w = (e === null ? t : e) * TAU * 2.4 + R.L.phase;
    for (const sd of SIDES) {
      const leg = sd > 0 ? R.legL : R.legR;
      const shin = sd > 0 ? R.shinL : R.shinR;
      const s = Math.sin(w + (sd > 0 ? 0 : PI));
      leg.rotation.set(k * (-0.55 + 0.6 * s), 0, sd * (0.04 + 0.22 * k));
      shin.rotation.x = k * (0.95 + 0.6 * Math.sin(w + (sd > 0 ? 0 : PI) + 1.2));
    }
    R.torso.rotation.set(-0.28 * k + P.hunch * 0.3, 0.15 * k * Math.sin(w * 0.5), 0.12 * k * Math.sin(w * 0.7));
    R.head.rotation.set(-0.35 * k, 0.2 * k * Math.sin(w * 0.6), 0.1 * k * Math.sin(w * 0.4));
    bodyDone(R);
    for (const sd of SIDES) {
      const s = Math.sin(w * 1.15 + (sd > 0 ? 0 : PI));
      armE(R, sd, k * (-1.7 + 1.1 * s), 0.14 + k * (0.55 + 0.25 * s), 0.25 + k * 0.35 * (1 - s));
    }
    hideTool(R);
    hideTool(R, R.toolB);
    R.mouth.scale.set(0.9, k, 1);
  },

  surrender(R, t) {
    const P = R.P;
    // hands up, head down, knees knocking a little
    legsStand(R, 0.05);
    R.hips.position.y -= 0.012;
    R.hips.position.x = 0.004 * Math.sin(t * 23);
    R.torso.rotation.set(0.08 + P.hunch * 0.5, 0, 0.02 * Math.sin(t * 1.3));
    R.head.rotation.set(0.38 + 0.03 * Math.sin(t * 2.1), 0.15 * Math.sin(t * 0.4), 0.0);
    bodyDone(R);
    const shake = 0.012 * Math.sin(t * 17);
    for (const sd of SIDES) reachT(R, sd, sd * (P.shX + 0.12), P.shY + P.reach * 0.78 + shake, 0.1, sd * 1, -0.6, -0.4);
    if (R.tk === 'cutlass') {
      // the blade dropped on the deck at the feet
      R.tool.position.set(-0.12, 0.018, 0.34);
      R.tool.quaternion.setFromEuler(_e.set(0, 0.5, PI / 2, 'YXZ'));
    } else setDown(R);
    R.mouth.scale.set(0.45, 0.5, 1);
  },

  haul(R, t) {
    const P = R.P;
    // hand over hand on a rope running out ahead at HAUL.y, feet braced, leaning back
    const cyc = t / 1.1;
    const tug = 0.5 + 0.5 * Math.sin(cyc * TAU * 2);
    R.hips.position.set(0, R.hips.position.y - 0.04, -0.05 - 0.02 * tug);
    footAt(R, 1, P.legX + 0.02, 0, 0.13, 1);
    footAt(R, -1, -P.legX - 0.03, 0, -0.13, 1);
    R.torso.rotation.set(-0.16 - 0.06 * tug + P.hunch * 0.3, 0.08 * Math.sin(cyc * TAU), 0);
    R.head.rotation.set(0.14, -0.04 * Math.sin(cyc * TAU), 0);
    bodyDone(R);
    for (const sd of SIDES) {
      const u = frac(cyc + (sd > 0 ? 0 : 0.5));
      let z;
      let y = HAUL.y;
      if (u < 0.55) z = lerp(0.32, 0.08, smooth(u / 0.55));
      else {
        const v = smooth((u - 0.55) / 0.45);
        z = lerp(0.08, 0.32, v);
        y += 0.07 * Math.sin(PI * v);
      }
      reachP(R, sd, sd * 0.03, y, z, sd * 0.8, -0.6, -0.3);
    }
    setDown(R);
    R.mouth.scale.set(0.5, 0.3 + 0.3 * tug, 1);
  },

  measure(R, t) {
    const P = R.P;
    const [A, B] = R.s;
    // the tailor at work: tape stretched between the hands at chest height, sliding it along, then
    // lifting it to read the number
    const cyc = frac(t / 3.2);
    const read = cyc > 0.55 && cyc < 0.9 ? Math.sin((PI * (cyc - 0.55)) / 0.35) : 0;
    const w = Math.sin(cyc * TAU * 2.5);
    legsStand(R, 0.07);
    R.hips.rotation.y = 0.08 * Math.sin(t * 0.6);
    R.torso.rotation.set(0.14 - 0.08 * read + P.hunch * 0.5, 0.05 * Math.sin(t * 0.9), 0.04 * w * (1 - read));
    R.head.rotation.set(0.28 + 0.12 * read, 0.1 * Math.sin(t * 0.7), 0.08 * read);
    bodyDone(R);
    const spread = (0.13 + 0.05 * w * (1 - read)) * (1 - 0.3 * read);
    const y = P.hipY + P.torsoY + P.shY + lerp(-0.09, 0.0, read);
    const z = lerp(0.26, 0.29, read);
    reachP(R, 1, spread, y, z, 0.8, -0.6, -0.3);
    reachP(R, -1, -spread, y + 0.01 * w, z, -0.8, -0.6, -0.3);
    if (R.tk === 'tape') {
      handP(R, -1, A);
      handP(R, 1, B);
      _v1.subVectors(B, A);
      const d = _v1.length();
      R.toolB.position.copy(A);
      R.toolB.quaternion.setFromUnitVectors(XV, _v1.normalize());
      R.toolB.scale.set(Math.max(1e-3, d), 1, 1);
    } else {
      setDown(R);
      hideTool(R, R.toolB);
    }
    R.mouth.scale.set(0.35, 0.3 * read, 1);
  },

  snip(R, t) {
    const P = R.P;
    // the barber: shears up at a customer's head in front, snipping in bursts, the other hand holding
    // the lock being cut
    const cyc = frac(t / 2.4);
    const burst = cyc < 0.5;
    const spot = Math.floor(t / 2.4);
    const sx = 0.05 * Math.sin(spot * 2.1);
    const sy = 0.035 * Math.cos(spot * 1.3);
    legsStand(R, 0.07);
    R.hips.position.x = 0.025 * Math.sin(t * 0.8);
    R.torso.rotation.set(0.08 + P.hunch * 0.2, 0.1 + 0.08 * Math.sin(t * 0.8), 0.04 * Math.sin(t * 0.8));
    R.head.rotation.set(0.2 - P.hunch * 0.5, -0.2 + 0.06 * Math.sin(t * 0.8), 0.08);
    bodyDone(R);
    const y = P.hipY + P.torsoY + P.shY - 0.06;
    reachP(R, -1, -0.14 + sx, y + sy, 0.34, -0.9, -0.7, -0.1);
    reachP(R, 1, 0.03 + sx, y + sy - 0.04, 0.32, 0.8, -0.5, -0.4);
    if (R.tk === 'scissors') {
      toolInHand(R, -1, PI / 2 - 0.35, 0, 0.5);
      R.snip = burst ? 0.08 + 0.42 * (0.5 + 0.5 * Math.cos(t * TAU * 4)) : 0.1;
    } else setDown(R);
    R.mouth.scale.set(0.3, burst ? 0.15 : 0.001, 1);
  },
};

// 'fight' keyframes (a grown-up's numbers, person space): loop position q, hips lunge forward and
// drop, stance yaw, forward lean, leading foot z, sword hand position, blade direction
const FIGHT_GUARD = { q: 0, lunge: 0, drop: 0.05, yaw: 0.42, lean: 0.12, foot: 0.12, hand: [-0.1, 0.8, 0.3], blade: [0.12, 0.75, 0.62] };
const FIGHT_KEYS = [
  FIGHT_GUARD,
  { q: 0.42, lunge: 0, drop: 0.05, yaw: 0.42, lean: 0.12, foot: 0.12, hand: [-0.12, 0.82, 0.29], blade: [0.12, 0.8, 0.55] },
  { q: 0.56, lunge: -0.02, drop: 0.04, yaw: 0.68, lean: 0.04, foot: 0.12, hand: [-0.24, 1.02, 0.02], blade: [0.1, 0.55, -0.8] },
  { q: 0.66, lunge: 0.1, drop: 0.1, yaw: -0.12, lean: 0.3, foot: 0.27, hand: [0.06, 0.64, 0.42], blade: [0.65, -0.35, 0.55] },
  { q: 0.76, lunge: 0.09, drop: 0.1, yaw: -0.08, lean: 0.28, foot: 0.27, hand: [0.04, 0.66, 0.4], blade: [0.6, -0.3, 0.6] },
  { ...FIGHT_GUARD, q: 1 },
];

/**
 * Run cycle in place: each foot is planted for RUN_STANCE of the cycle, moving back at a constant
 * speed (walkSpeed('run')), then kicks up behind and swings through with the knee high; between the
 * stances both feet are off the ground and the hips ride a little higher.
 */
function runLegs(R, ph) {
  const P = R.P;
  const L = P.thigh + P.shin;
  const D = L * Math.sin(RUN_A);
  const u0 = frac(ph / TAU - 0.25);
  const w = frac(u0 * 2); // half cycle: one foot's stance, then a flight
  const S2 = 2 * RUN_STANCE;
  const H = L * Math.cos(RUN_A);
  const hipJ = w < S2 ? H - 0.03 * Math.sin((PI * w) / S2) : H + 0.035 * Math.sin((PI * (w - S2)) / (1 - S2));
  const s = Math.sin(ph);
  R.hips.position.y = hipJ - P.legY;
  R.hips.rotation.set(0.07, 0.15 * s, 0.03 * Math.cos(ph));
  R.torso.rotation.y = -0.22 * s;
  R.head.rotation.y = 0.12 * s;
  for (const sd of SIDES) {
    const u = frac(u0 + (sd > 0 ? 0 : 0.5));
    let z;
    let y = 0;
    if (u < RUN_STANCE) z = D * (1 - (2 * u) / RUN_STANCE);
    else {
      const v = (u - RUN_STANCE) / (1 - RUN_STANCE);
      z = -D * Math.cos(PI * v) - 0.22 * L * Math.sin(PI * Math.min(1, v * 1.6)) * (1 - v);
      y = L * 0.62 * Math.sin(PI * Math.min(1, v * 1.25)) ** 1.3;
    }
    footAt(R, sd, sd * (P.legX + 0.01), y, z, 1);
  }
}

const NO_OPTS = Object.freeze({});
/**
 * Pose a person for time t (seconds). Deterministic in t; transforms only.
 * opts: { phase? (seconds, defaults to a per-person offset), speed? (tempo, default 1),
 *         wall? ('scrub' only: true scrubs a wall/hull in front instead of the deck),
 *         sweep? ('mop' only: 0..1, shorter strokes; default 1),
 *         turn? ('steer' only: -1..1, + turns to starboard), since? ('fall' only: the time t the fall
 *         began; without it the tumble loops) }
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
  R.tailSwing = 0;
  R.snip = 0.1;
  R.elapsed = action === 'fall' && Number.isFinite(o.since) && Number.isFinite(t) ? Math.max(0, t - o.since) * speed : null;
  // (own keys only: an action named like an Object.prototype member falls back to idle too)
  const own = Object.prototype.hasOwnProperty.call(POSES, action);
  const pose = own ? POSES[action] : POSES.idle;
  pose(R, tt, o);
  // worn things: a spare cutlass in the sash, the tape round the neck, the shears' second half,
  // coat tails and the parrot
  const k = R.tk;
  if (k === 'cutlass' && R.tool.scale.x < 0.01) sheathe(R);
  else if (k === 'tape') {
    drapeTape(R);
    if (action !== 'measure' || !own) hideTool(R, R.toolB);
  } else if (k === 'scissors') shears(R);
  if (R.L.coat !== undefined && !R.L.skirt) fitTails(R, own ? action : 'idle');
  if (R.pet) petPose(R, tt, own ? action : 'idle');
  // tools that the action didn't place stay hidden
  if (R.tk === 'none') {
    hideTool(R);
    hideTool(R, R.toolB);
  } else if (R.tk !== 'rod' && R.tk !== 'fiddle' && R.tk !== 'tape' && R.tk !== 'scissors') {
    hideTool(R, R.toolB);
  }
  // blink every few seconds
  const b = frac(tt / R.L.blink);
  R.eyes.scale.y = b < 0.035 ? 0.12 : 1;
}
