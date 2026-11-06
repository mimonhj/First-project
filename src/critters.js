// The island's animals (SPEC4 §7.1): cats, dogs, goats, parrots and an owl, monkeys, crabs and turtles. Each species
// is one InstancedMesh and its ink twin (an inverted hull, volcano.js's method; both noOutline: the outline pass never
// draws an InstancedMesh right), so all seven cost <= 14 calls, and every animal is animated through its instance
// matrix (hop, bob, waddle, scuttle) and one instanced vec4 (its tail's wag, its legs' or wings' swing, its head's
// nod, and which variant it is: a calico's patches, a parrot or an owl, a hermit crab's shell), read by a few lines of
// vertex shader shared by both meshes, so the ink follows the parts. They never block the captain: no blocker, never
// in folk(), and one within 1.2 u of him as he walks hops 1.5 u aside (visual only).
//
// createCritters(scene, { reducedMotion, walk, where, layout }) -> { set(list), update(t, dt, captain), pick(ray) ->
//   i | null, near(captain) -> i | null, react(i) -> { id, name, species, word, sound, x, y, z } | null (its pet: one
//   per 2 s), visible(on), dispose(), and get list, get triangles, get calls, warmables(), group }
// scene: the town's root (the group is added to it); reducedMotion: a function or a boolean; walk: env.walk (or a
// walk.js instance) to keep wandering and hops on the planks and off the pads; where(id, lag): the islander an animal
// follows, `lag` s back along their own round (folk4's trail), or null; layout: islandPlan's exports (the default):
// a named spot's wander radius and line from its ANIMAL_SPOTS, a building's pet beside its PLOT_PLACES place (never
// in the circle where the captain reads the board). list: islanders.roster(...).animals ([{ id, species, name, at,
// follow, x, y, z, word, sound, colour?, bird? }]); an animal whose x / z the layout did not give lives at critters'
// own spot for its `at` (SPOTS). captain: { x, z, y? } or null. i: the index in the list given to set().
// The shipyard view hides them: the town calls visible(false) there (and visible(true) in the walk view).

import * as THREE from 'three';
import { gradientMap, noOutline, INK } from './style.js';
import { createWalk } from './walk.js';
import { ANIMALS, TALK } from './islanders.js';
import * as islandPlan from './islandPlan.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const lerp = (a, b, k) => a + (b - a) * k;
const arr = (v) => (Array.isArray(v) ? v : []);
const wrap = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const ease = (k) => k * k * (3 - 2 * k);
function own(o, k) {
  try {
    return o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
  } catch {
    return undefined;
  }
}
// a small hash: 0..1 from an integer seed and a step
function hash(seed, k) {
  let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
function seedOf(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------------------------------------------------------------------------------------- the numbers
/** How the animals live (u, s): the cull, the hop aside, the pet's cooldown, the cat's rub. */
export const CRITTERS = Object.freeze({
  cull: 40, // only animals within 40 u of the captain are updated and drawn (§14.2)
  hop: Object.freeze({ near: 1.2, dist: 1.5, secs: 0.5, high: 0.35, walking: 0.3 }), // §6.5: never in his way
  pet: Object.freeze({ reach: TALK.reach, every: 2, secs: 1.6 }), // §7.4: one word and heart per 2 s per animal
  rub: Object.freeze({ still: 1.5, near: 4, r: 0.55, secs: 10 }), // a cat rubs round his legs if he stands still
  home: 0.35, // u/s an animal strolls back to its round after a hop or a rub
  ink: 0.016, // the ink hull's width (u)
});
const CH = { NONE: 0, WAG: 1, LIMB: 2, HEAD: 3 };
// each species: its round (P: s a step, v: u/s, r: the wander radius), what it does at rest, how big (the pick sphere)
const SPEC = {
  cat: { P: 16, v: 0.45, r: 0.7, rests: ['nap', 'sit', 'stretch', 'sit', 'nap'], size: 0.35, follow: 2.2, stride: 9 },
  dog: { P: 10, v: 0.9, r: 1.2, rests: ['sit', 'sniff', 'sit', 'lie'], size: 0.45, follow: 2.8, stride: 10 },
  goat: { P: 12, v: 0.4, r: 1.4, rests: ['graze', 'graze', 'climb', 'stand'], size: 0.6, follow: 1.6, stride: 7 },
  bird: { P: 7, v: 0.35, r: 0.3, rests: ['perch', 'hop', 'preen', 'perch'], size: 0.3, fly: 20, stride: 14 },
  monkey: { P: 11, v: 0.6, r: 0.8, rests: ['peel', 'swing', 'peel', 'scratch'], size: 0.4, stride: 9 },
  crab: { P: 6, v: 0.9, r: 1.0, rests: ['dig', 'claws', 'stand'], size: 0.22, stride: 18 },
  turtle: { P: 26, v: 0.12, r: 0.8, rests: ['rest', 'rest', 'blink'], size: 0.4, stride: 4 },
};
export const SPECIES = Object.freeze(Object.keys(SPEC));
// colours (sRGB hex): fur is white in the geometry, tinted per animal (instance colour)
const FUR = {
  cat: { ginger: 0xf29a3e, black: 0x3a3442, calico: 0xfff4e4, _: [0xf29a3e, 0x9b9aa6, 0xfff4e4] },
  dog: { _: [0xd9a868, 0x6b4a34, 0xe8c48a, 0xf4ecdf] },
  goat: { _: [0xf8f3ea, 0xb98552, 0xf8f3ea, 0x8f8a86, 0xeedfc6, 0x5a4c46] },
  bird: { parrot: [0xe2383d, 0x2f86ea, 0x2fa84f, 0xffc93c], owl: [0xa8774a] },
  monkey: { _: [0x9a6238, 0x7d4e2c, 0xa8703e] },
  crab: { _: [0xf2552c, 0xe8432f, 0xf26a3a, 0xd9402a] },
  turtle: { _: [0x6cbf4f, 0x55a64a, 0x7fc75a, 0x4f9a52] },
};
const NAMED = { salty: 0xd9a868, bolt: 0x4a3a34, biscuit: 0xe8b46a, polly: 0xe2383d, ruby: 0xe2383d, sky: 0x2f86ea, mango: 0x2fa84f, hoot: 0xa8774a, hermit: 0xf2552c, nibbles: 0xf8f3ea, clover: 0xb98552 };

/**
 * Where an animal lives when the layout names no spot for it (§7.1, the plan's geography): world { x, y, z, r }
 * (r: how far it wanders; a roof or a perch keeps it close). islandPlan's ANIMAL_SPOTS (1N) and PLOT_PLACES win.
 */
export const SPOTS = Object.freeze({
  tavernRoof: Object.freeze({ x: -7.1, y: 10.1, z: -20.62, r: 0.1, along: Object.freeze([2.5, -0.1]) }), // on the ridge cap
  harbour: Object.freeze({ x: 3.6, y: 1.3, z: -12.2, r: 1.6 }),
  palms: Object.freeze({ x: -15.3, y: 1.56, z: -6.7, r: 0.8 }),
  beach: Object.freeze({ x: -37, y: 1.86, z: -29.4, r: 2.2 }),
  pier: Object.freeze({ x: 43.5, y: 1.3, z: -13.5, r: 1.6, along: Object.freeze([2.5, 0]) }),
  pen: Object.freeze({ x: -15.1, y: 1.6, z: -36.0, r: 0.9 }),
  hill: Object.freeze({ x: -2.6, y: 3.2, z: -52.6, r: 1.8 }),
  barnRoof: Object.freeze({ x: -18.0, y: 4.9, z: -38.4, r: 0.1 }),
  pool: Object.freeze({ x: 0.2, y: 1.6, z: -37.6, r: 0.7 }),
  grotto: Object.freeze({ x: -34.6, y: 1.8, z: -33.4, r: 0.8 }),
});
// a plot's porch (its platform's front strip, from sparrow.js's platforms and islandPlan's PADS; the islets' plots on
// their sand), world { x, y, z, r }: where a building's pet lives when no PLOT_PLACES entry places it
const PLATS = {
  s2: [13.4, -23.2, 5, 0.12, 1.3], s3: [-0.5, -29.5, 5.4, 0.05, 1.6], s4: [-7.6, -33.6, 5, -0.1, 1.5], s5: [9.2, -31.5, 5.2, -0.05, 1.8],
  s6: [-26, -26, 5.2, 0.3, 1.3], s7: [21.5, -22.5, 5, -0.25, 1.3], s8: [-24, -9, 5, 0.45, 1.3], s9: [25, -6, 5, -0.5, 1.3],
  s10: [-17.5, -38, 5.5, 0.1, 1.6], s11: [18, -36, 5.5, -0.2, 1.6], s12: [2, -40, 5.5, 0, 1.6], s13: [-21.5, 2, 5, 0.55, 1.3],
  s14: [-29, -4.5, 5, 0.25, 1.3], s15: [-31, -16, 5.2, 0.1, 1.3], s16: [-17.6, -17.4, 5, -0.08, 1.3], s17: [29.5, -25, 5.4, -0.35, 1.6],
  s18: [35, -12.5, 5, -0.7, 1.3],
};
const PLOT_PLAT = { homeA: 's16', homeB: 's3', homeC: 's2', homeD: 's7', bakery: 's8', windmill: 's6', lighthouse: 's18', market: 's15', school: 's13', park: 's14', forge: 's4', music: 's5', fishing: 's9', farm: 's10', museum: 's11', aquarium: 's12', homeF: 's17' };
const ISLET = { homeE: [-35.2, 1.85, -28.6], grotto: [-35.0, 1.8, -33.2], homeG: [5.4, 3.0, -51.6], observatory: [-0.8, 3.6, -52.0] };
function plotSpot(id) {
  if (ISLET[id]) return { x: ISLET[id][0], y: ISLET[id][1], z: ISLET[id][2], r: 0.6 };
  const pl = PLATS[PLOT_PLAT[id]];
  if (!pl) return null;
  const [cx, cz, d, ry, y] = pl;
  const lx = 1.4;
  const lz = d / 2 - 0.45; // on the front strip, to one side of the board
  return { x: cx + lx * Math.cos(ry) + lz * Math.sin(ry), y, z: cz - lx * Math.sin(ry) + lz * Math.cos(ry), r: 0.3, along: [Math.cos(ry) * 0.9, -Math.sin(ry) * 0.9] };
}

// ---------------------------------------------------------------------------------------- the models
// A model is a list of parts (a primitive, its colour, where it sits, which channel moves it about which pivot and
// axis, whether its colour is the animal's fur, which variants show it, whether it has ink), merged into one geometry
// (and its hull: the inked parts pushed out along their normals). Each faces +z with its feet at the origin.
const G = {
  sph: (w, h) => new THREE.SphereGeometry(1, w, h),
  cyl: (rt, rb, hgt, seg = 5, open = true) => new THREE.CylinderGeometry(rt, rb, hgt, seg, 1, open),
  cone: (r, hgt, seg = 4) => new THREE.ConeGeometry(r, hgt, seg, 1, false),
};
const DARK = 0x2a2230;
const PINK = 0xf59aa6;
const CREAM = 0xfff1d6;
const WHITE = 0xfffaf2;
function part(geo, colour, o = {}) {
  return { geo, colour, at: o.at || [0, 0, 0], rot: o.rot || [0, 0, 0], s: o.s ?? 1, ch: o.ch || CH.NONE, axis: o.axis || [1, 0, 0], pivot: o.pivot || o.at || [0, 0, 0], fur: o.fur ? 1 : 0, mask: o.mask ?? 255, ink: o.ink !== false, paint: o.paint || null };
}
// legs in diagonal pairs (front-left with back-right swing one way): a limb channel with the axis's sign alternating
function legs(out, { x, zf, zb, y, len, r, colour, fur = true, paint = null, seg = 4 }) {
  for (const [sx, sz, sg] of [[1, zf, 1], [-1, zf, -1], [1, zb, -1], [-1, zb, 1]]) {
    out.push(part(G.cyl(r, r * 0.85, len, seg), colour, { at: [sx * x, y - len / 2, sz], ch: CH.LIMB, axis: [sg, 0, 0], pivot: [sx * x, y, sz], fur, paint }));
  }
}
const eyes = (out, x, y, z, r = 0.022, ch = CH.NONE, pivot, mask) => {
  for (const sx of [-1, 1]) out.push(part(G.sph(4, 3), DARK, { at: [sx * x, y, z], s: [r, r * 1.25, r * 0.8], ink: false, ch, axis: [1, 0, 0], pivot, mask }));
};

const MODELS = {
  cat() {
    const o = [];
    const head = { ch: CH.HEAD, axis: [1, 0, 0], pivot: [0, 0.28, 0.13] };
    o.push(part(G.sph(7, 5), WHITE, { at: [0, 0.2, -0.01], s: [0.13, 0.12, 0.2], fur: true }));
    o.push(part(G.sph(7, 5), WHITE, { at: [0, 0.33, 0.19], s: [0.12, 0.11, 0.11], fur: true, ...head }));
    for (const sx of [-1, 1]) o.push(part(G.cone(0.045, 0.1, 4), WHITE, { at: [sx * 0.065, 0.44, 0.18], rot: [0, 0, -sx * 0.32], fur: true, ...head }));
    o.push(part(G.sph(5, 3), CREAM, { at: [0, 0.3, 0.285], s: [0.06, 0.04, 0.035], ...head, ink: false }));
    o.push(part(G.sph(4, 2), PINK, { at: [0, 0.325, 0.31], s: 0.016, ...head, ink: false }));
    eyes(o, 0.046, 0.355, 0.285, 0.02, CH.HEAD, head.pivot);
    // the tail curls up behind: two pieces on one wag
    const tail = { ch: CH.WAG, axis: [0, 1, 0], pivot: [0, 0.22, -0.17] };
    o.push(part(G.cyl(0.026, 0.03, 0.17, 4), WHITE, { at: [0, 0.27, -0.23], rot: [-0.55, 0, 0], fur: true, ...tail }));
    o.push(part(G.cyl(0.024, 0.026, 0.14, 4), WHITE, { at: [0, 0.39, -0.27], rot: [0.15, 0, 0], fur: true, ...tail }));
    o.push(part(G.sph(4, 3), WHITE, { at: [0, 0.46, -0.26], s: 0.026, fur: true, ...tail }));
    legs(o, { x: 0.065, zf: 0.1, zb: -0.11, y: 0.15, len: 0.15, r: 0.03, colour: WHITE });
    // the calico's patches (variant 1 only)
    o.push(part(G.sph(4, 3), 0xf29a3e, { at: [0.05, 0.27, -0.06], s: [0.09, 0.06, 0.1], mask: 2, ink: false }));
    o.push(part(G.sph(4, 3), 0x3a3442, { at: [-0.06, 0.26, 0.06], s: [0.08, 0.06, 0.08], mask: 2, ink: false }));
    return o;
  },
  dog() {
    const o = [];
    const head = { ch: CH.HEAD, axis: [1, 0, 0], pivot: [0, 0.42, 0.2] };
    o.push(part(G.sph(7, 5), WHITE, { at: [0, 0.3, -0.02], s: [0.15, 0.15, 0.26], fur: true }));
    o.push(part(G.sph(7, 5), WHITE, { at: [0, 0.5, 0.25], s: [0.13, 0.12, 0.13], fur: true, ...head }));
    o.push(part(G.sph(5, 3), WHITE, { at: [0, 0.46, 0.37], s: [0.075, 0.065, 0.09], fur: true, ...head, paint: () => 0xf3e6d0 }));
    o.push(part(G.sph(4, 2), DARK, { at: [0, 0.49, 0.455], s: 0.028, ...head, ink: false }));
    eyes(o, 0.05, 0.54, 0.35, 0.021, CH.HEAD, head.pivot);
    for (const sx of [-1, 1]) o.push(part(G.sph(4, 3), 0x7a5a44, { at: [sx * 0.12, 0.5, 0.23], rot: [0, 0, sx * 0.25], s: [0.035, 0.09, 0.06], ...head }));
    o.push(part(G.cyl(0.035, 0.035, 0.05, 6), 0xe2383d, { at: [0, 0.42, 0.17], rot: [1.1, 0, 0], ink: false, s: [3.3, 1, 3.0] }));
    o.push(part(G.cyl(0.018, 0.032, 0.2, 4), WHITE, { at: [0, 0.42, -0.29], rot: [-0.7, 0, 0], fur: true, ch: CH.WAG, axis: [0, 1, 0], pivot: [0, 0.36, -0.24] }));
    legs(o, { x: 0.08, zf: 0.13, zb: -0.14, y: 0.24, len: 0.24, r: 0.04, colour: WHITE });
    // a patch over one eye (variant 1)
    o.push(part(G.sph(4, 3), 0x5a3f2c, { at: [0.055, 0.545, 0.33], s: [0.05, 0.05, 0.03], mask: 2, ink: false, ...head }));
    return o;
  },
  goat() {
    const o = [];
    const head = { ch: CH.HEAD, axis: [1, 0, 0], pivot: [0, 0.52, 0.24] };
    o.push(part(G.sph(7, 5), WHITE, { at: [0, 0.4, -0.02], s: [0.18, 0.17, 0.28], fur: true }));
    o.push(part(G.cyl(0.07, 0.09, 0.2, 5), WHITE, { at: [0, 0.54, 0.27], rot: [0.5, 0, 0], fur: true, ...head }));
    o.push(part(G.sph(6, 4), WHITE, { at: [0, 0.66, 0.36], s: [0.09, 0.1, 0.13], rot: [0.35, 0, 0], fur: true, ...head }));
    for (const sx of [-1, 1]) {
      o.push(part(G.cone(0.025, 0.14, 4), 0x8a7a6a, { at: [sx * 0.045, 0.77, 0.31], rot: [-0.7, 0, sx * 0.25], ...head }));
      o.push(part(G.sph(4, 2), WHITE, { at: [sx * 0.1, 0.69, 0.32], s: [0.06, 0.022, 0.03], rot: [0, 0, sx * -0.35], fur: true, ...head }));
    }
    o.push(part(G.cone(0.025, 0.08, 4), 0xe8e0d0, { at: [0, 0.54, 0.43], rot: [Math.PI, 0, 0], ...head, ink: false }));
    eyes(o, 0.06, 0.69, 0.42, 0.018, CH.HEAD, head.pivot);
    o.push(part(G.cone(0.03, 0.08, 4), WHITE, { at: [0, 0.54, -0.29], rot: [-0.9, 0, 0], fur: true, ch: CH.WAG, axis: [0, 1, 0], pivot: [0, 0.5, -0.26] }));
    legs(o, { x: 0.09, zf: 0.15, zb: -0.15, y: 0.3, len: 0.3, r: 0.037, colour: WHITE, paint: (p) => (p.y < -0.12 ? 0x4a3a34 : null) });
    o.push(part(G.sph(4, 3), 0xffc93c, { at: [0, 0.42, 0.25], s: 0.04, mask: 2, ink: false })); // a bell (variant 1)
    return o;
  },
  bird() {
    const o = [];
    const PARROT = 1;
    const OWL = 2;
    const head = { ch: CH.HEAD, axis: [0, 1, 0], pivot: [0, 0.26, 0.0] };
    o.push(part(G.sph(7, 5), WHITE, { at: [0, 0.15, 0], s: [0.085, 0.12, 0.085], rot: [0.2, 0, 0], fur: true }));
    o.push(part(G.sph(7, 5), WHITE, { at: [0, 0.29, 0.02], s: 0.075, fur: true, ...head }));
    // wings fold at the sides, flap about the shoulders
    for (const sx of [-1, 1]) {
      o.push(part(G.sph(5, 3), WHITE, { at: [sx * 0.08, 0.15, -0.01], s: [0.03, 0.09, 0.06], rot: [0.25, 0, sx * 0.12], fur: true, ch: CH.LIMB, axis: [0, 0, -sx], pivot: [sx * 0.06, 0.22, 0], paint: (p) => (p.y < -0.35 ? { c: 0x9a98b0, fur: true } : null) }));
      o.push(part(G.cyl(0.008, 0.008, 0.06, 3), 0x8a8494, { at: [sx * 0.03, 0.03, 0.01], ink: false }));
    }
    // the parrot: a hooked beak, white cheeks, a long tail
    o.push(part(G.sph(4, 3), 0xf3e6c0, { at: [0, 0.27, 0.095], s: [0.028, 0.04, 0.035], rot: [0.4, 0, 0], mask: PARROT, ...head }));
    for (const sx of [-1, 1]) o.push(part(G.sph(4, 2), WHITE, { at: [sx * 0.04, 0.3, 0.06], s: [0.025, 0.03, 0.012], mask: PARROT, ink: false, ...head }));
    o.push(part(G.sph(5, 3), WHITE, { at: [0, 0.04, -0.1], s: [0.035, 0.1, 0.02], rot: [-0.55, 0, 0], fur: true, mask: PARROT, ch: CH.WAG, axis: [1, 0, 0], pivot: [0, 0.09, -0.05], paint: () => 0x2f86ea }));
    eyes(o, 0.034, 0.31, 0.068, 0.013, CH.HEAD, head.pivot, PARROT);
    // the owl: ear tufts, big eye discs, a little beak
    for (const sx of [-1, 1]) {
      o.push(part(G.cone(0.022, 0.06, 4), WHITE, { at: [sx * 0.045, 0.37, 0.0], rot: [0, 0, -sx * 0.4], fur: true, mask: OWL, ...head }));
      o.push(part(G.sph(5, 3), 0xfff1c8, { at: [sx * 0.033, 0.3, 0.06], s: [0.03, 0.03, 0.012], mask: OWL, ink: false, ...head }));
      o.push(part(G.sph(4, 2), DARK, { at: [sx * 0.033, 0.3, 0.072], s: [0.015, 0.016, 0.006], mask: OWL, ink: false, ...head }));
    }
    o.push(part(G.cone(0.012, 0.03, 3), 0xffa630, { at: [0, 0.275, 0.085], rot: [Math.PI / 2 + 0.6, 0, 0], mask: OWL, ink: false, ...head }));
    return o;
  },
  monkey() {
    const o = [];
    const head = { ch: CH.HEAD, axis: [1, 0, 0], pivot: [0, 0.31, 0.0] };
    o.push(part(G.sph(7, 5), WHITE, { at: [0, 0.2, 0], s: [0.11, 0.13, 0.1], fur: true }));
    o.push(part(G.sph(7, 5), WHITE, { at: [0, 0.39, 0.02], s: 0.1, fur: true, ...head }));
    o.push(part(G.sph(5, 3), 0xf1c9a0, { at: [0, 0.37, 0.085], s: [0.07, 0.06, 0.04], ...head, ink: false }));
    eyes(o, 0.03, 0.41, 0.105, 0.015, CH.HEAD, head.pivot);
    for (const sx of [-1, 1]) o.push(part(G.sph(4, 3), 0xf1c9a0, { at: [sx * 0.1, 0.41, 0.0], s: [0.04, 0.045, 0.02], ...head }));
    // arms (one holds the banana) and legs
    for (const sx of [-1, 1]) {
      o.push(part(G.cyl(0.025, 0.02, 0.17, 4), WHITE, { at: [sx * 0.11, 0.22, 0.05], rot: [1.0, 0, sx * 0.3], fur: true, ch: CH.LIMB, axis: [sx, 0, 0], pivot: [sx * 0.09, 0.28, 0.0] }));
      o.push(part(G.cyl(0.03, 0.025, 0.12, 4), WHITE, { at: [sx * 0.07, 0.06, 0.07], rot: [1.3, 0, 0], fur: true }));
    }
    o.push(part(G.sph(4, 3), 0xffd84a, { at: [0.12, 0.25, 0.16], s: [0.022, 0.07, 0.022], rot: [0.5, 0, 0.4], ch: CH.LIMB, axis: [1, 0, 0], pivot: [0.09, 0.28, 0.0] }));
    // the tail curls up behind
    const tail = { ch: CH.WAG, axis: [0, 1, 0], pivot: [0, 0.1, -0.08] };
    o.push(part(G.cyl(0.018, 0.022, 0.2, 4), WHITE, { at: [0, 0.07, -0.18], rot: [-1.3, 0, 0], fur: true, ...tail }));
    o.push(part(G.cyl(0.016, 0.018, 0.16, 4), WHITE, { at: [0, 0.16, -0.3], rot: [0.2, 0, 0], fur: true, ...tail }));
    o.push(part(G.cyl(0.014, 0.016, 0.1, 4), WHITE, { at: [0, 0.26, -0.27], rot: [0.9, 0, 0], fur: true, ...tail }));
    return o;
  },
  crab() {
    const o = [];
    const HERMIT = 2;
    o.push(part(G.sph(7, 4), WHITE, { at: [0, 0.08, 0], s: [0.12, 0.055, 0.085], fur: true }));
    for (const sx of [-1, 1]) {
      o.push(part(G.cyl(0.008, 0.008, 0.06, 3), WHITE, { at: [sx * 0.035, 0.15, 0.06], fur: true, ink: false }));
      o.push(part(G.sph(4, 3), WHITE, { at: [sx * 0.035, 0.185, 0.06], s: 0.018, ink: true, paint: (p) => (p.z > 0.3 ? DARK : 0xfffaf2) }));
      // the claws: an arm and a pincer, snapping
      o.push(part(G.cyl(0.014, 0.014, 0.08, 3), WHITE, { at: [sx * 0.12, 0.085, 0.07], rot: [Math.PI / 2, 0, -sx * 0.6], fur: true, ch: CH.LIMB, axis: [1, 0, 0], pivot: [sx * 0.09, 0.08, 0.04] }));
      o.push(part(G.sph(5, 3), WHITE, { at: [sx * 0.15, 0.1, 0.12], s: [0.04, 0.03, 0.05], fur: true, ch: CH.LIMB, axis: [1, 0, 0], pivot: [sx * 0.09, 0.08, 0.04] }));
      // three legs a side scuttling
      for (let k = 0; k < 3; k++) {
        const z = -0.05 + k * 0.045;
        o.push(part(G.cyl(0.008, 0.007, 0.1, 3), WHITE, { at: [sx * 0.13, 0.04, z], rot: [0, 0, sx * 1.0], fur: true, ink: false, ch: CH.WAG, axis: [0, 0, ((k % 2) * 2 - 1) * sx], pivot: [sx * 0.09, 0.07, z] }));
      }
    }
    // the baby hermit crab's coral shell (variant 1)
    o.push(part(G.sph(6, 4), 0xff7f86, { at: [0, 0.14, -0.04], s: [0.09, 0.1, 0.11], rot: [-0.4, 0, 0], mask: HERMIT, paint: (p) => (Math.abs(p.x) < 0.25 ? 0xfff3b0 : null) }));
    o.push(part(G.sph(4, 3), 0xffa0a6, { at: [0, 0.23, -0.12], s: [0.05, 0.055, 0.06], rot: [-0.6, 0, 0], mask: HERMIT, paint: (p) => (p.y > 0.5 ? 0xfff3b0 : null) }));
    return o;
  },
  turtle() {
    const o = [];
    const head = { ch: CH.HEAD, axis: [1, 0, 0], pivot: [0, 0.08, 0.2] };
    o.push(part(G.sph(8, 5), WHITE, { at: [0, 0.07, 0], s: [0.19, 0.12, 0.23], fur: true, paint: (p) => (p.y > 0.55 ? 0xc6e88a : null) }));
    o.push(part(G.cyl(0.19, 0.2, 0.04, 8, false), 0xd8c08a, { at: [0, 0.03, 0], s: [1, 1, 1.2], ink: false }));
    o.push(part(G.sph(5, 4), 0x9ad07a, { at: [0, 0.1, 0.28], s: [0.06, 0.055, 0.075], ...head }));
    eyes(o, 0.032, 0.125, 0.325, 0.012, CH.HEAD, head.pivot);
    for (const [sx, z, sg] of [[1, 0.13, 1], [-1, 0.13, -1], [1, -0.13, -1], [-1, -0.13, 1]]) {
      o.push(part(G.sph(4, 3), 0x9ad07a, { at: [sx * 0.17, 0.03, z], s: [0.065, 0.025, 0.04], rot: [0, sx * 0.5, 0], ch: CH.LIMB, axis: [0, sg, 0], pivot: [sx * 0.12, 0.03, z] }));
    }
    o.push(part(G.cone(0.02, 0.06, 3), 0x9ad07a, { at: [0, 0.04, -0.25], rot: [-Math.PI / 2, 0, 0], ink: false }));
    return o;
  },
};

const _m = new THREE.Matrix4();
const _n = new THREE.Matrix3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
/** Merge a model's parts into one geometry (hull: the inked parts only, pushed out along their normals). */
function mergeModel(parts, hull) {
  const pos = [];
  const nor = [];
  const col = [];
  const piv = [];
  const axs = [];
  const misc = [];
  const idx = [];
  for (const p of parts) {
    if (hull && !p.ink) continue;
    const g = p.geo;
    const P = g.attributes.position;
    const N = g.attributes.normal;
    _e.set(p.rot[0], p.rot[1], p.rot[2]);
    _q.setFromEuler(_e);
    if (typeof p.s === 'number') _s.setScalar(p.s);
    else _s.set(p.s[0], p.s[1], p.s[2]);
    _m.compose(_v.set(p.at[0], p.at[1], p.at[2]), _q, _s);
    _n.getNormalMatrix(_m);
    const base = pos.length / 3;
    const ax = new THREE.Vector3(p.axis[0], p.axis[1], p.axis[2]).normalize();
    for (let i = 0; i < P.count; i++) {
      _w.fromBufferAttribute(N, i).applyMatrix3(_n).normalize();
      _v.fromBufferAttribute(P, i);
      const local = { x: _v.x, y: _v.y, z: _v.z };
      _v.applyMatrix4(_m);
      if (hull) _v.addScaledVector(_w, CRITTERS.ink);
      pos.push(_v.x, _v.y, _v.z);
      nor.push(_w.x, _w.y, _w.z);
      // a painted vertex keeps its own colour ({ c, fur: true }: a shade of the fur)
      const pv = p.paint ? p.paint(local) : null;
      const hex = pv === null || pv === undefined ? p.colour : typeof pv === 'object' ? pv.c : pv;
      _c.setHex(hex);
      const furV = p.fur && (pv === null || pv === undefined || (typeof pv === 'object' && pv.fur)) ? 1 : 0;
      col.push(_c.r, _c.g, _c.b);
      piv.push(p.pivot[0], p.pivot[1], p.pivot[2]);
      axs.push(ax.x, ax.y, ax.z, p.ch);
      misc.push(p.mask, furV);
    }
    const I = g.index;
    if (I) for (let i = 0; i < I.count; i++) idx.push(base + I.getX(i));
    else for (let i = 0; i < P.count; i++) idx.push(base + i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (!hull) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aPivot', new THREE.Float32BufferAttribute(piv, 3));
  geo.setAttribute('aAxis', new THREE.Float32BufferAttribute(axs, 4));
  geo.setAttribute('aMisc', new THREE.Float32BufferAttribute(misc, 2));
  geo.setIndex(idx);
  return geo;
}
/** Triangles in each species' model (and its hull), for the budget (§14.2: the animals <= 15k in all). */
export function modelTriangles() {
  const out = {};
  for (const [sp, make] of Object.entries(MODELS)) {
    const parts = make();
    const body = mergeModel(parts, false);
    const hull = mergeModel(parts, true);
    out[sp] = { body: body.index.count / 3, hull: hull.index.count / 3, max: ANIMALS[sp] ? ANIMALS[sp].max : 0 };
    body.dispose();
    hull.dispose();
    for (const p of parts) p.geo.dispose();
  }
  return out;
}

// the vertex shader's few lines: a part turns about its pivot by its channel's angle; a part another variant wears
// folds to its pivot (no area); a fur part takes the animal's colour (instance colour), the rest keep their own
const HEAD = /* glsl */ `
attribute vec3 aPivot;
attribute vec4 aAxis;
attribute vec2 aMisc;
attribute vec4 iAnim;
vec3 critRot(vec3 v, vec3 k, float a) {
  float c = cos(a);
  float s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}
float critAngle() {
  float ch = aAxis.w;
  return ch < 0.5 ? 0.0 : ch < 1.5 ? iAnim.x : ch < 2.5 ? iAnim.y : iAnim.z;
}
float critShown() {
  return mod(floor(aMisc.x / exp2(iAnim.w) + 0.001), 2.0);
}
`;
const POS = /* glsl */ `#include <begin_vertex>
{
  float ca = critAngle();
  if (ca != 0.0) transformed = aPivot + critRot(transformed - aPivot, aAxis.xyz, ca);
  if (critShown() < 0.5) transformed = aPivot;
}`;
const NORMAL = /* glsl */ `#include <beginnormal_vertex>
{
  float cn = critAngle();
  if (cn != 0.0) objectNormal = critRot(objectNormal, aAxis.xyz, cn);
}`;
const COLOR = /* glsl */ `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
  vColor.xyz = color.xyz * mix(vec3(1.0), instanceColor.xyz, aMisc.y);
#endif`;
function materials() {
  const body = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap(3) });
  body.name = 'critters:body';
  noOutline(body);
  body.onBeforeCompile = (sh) => {
    sh.vertexShader = HEAD + sh.vertexShader.replace('#include <beginnormal_vertex>', NORMAL).replace('#include <begin_vertex>', POS).replace('#include <color_vertex>', COLOR);
  };
  body.customProgramCacheKey = () => 'critters-body';
  const ink = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(INK[0], INK[1], INK[2]), side: THREE.BackSide });
  ink.name = 'critters:ink';
  noOutline(ink);
  ink.onBeforeCompile = (sh) => {
    sh.vertexShader = HEAD + sh.vertexShader.replace('#include <begin_vertex>', POS);
  };
  ink.customProgramCacheKey = () => 'critters-ink';
  return { body, ink };
}

// ---------------------------------------------------------------------------------------- the module
export function createCritters(scene, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const reduced = () => {
    const r = own(o, 'reducedMotion');
    try {
      return !!(typeof r === 'function' ? r() : r);
    } catch {
      return false;
    }
  };
  const where = typeof own(o, 'where') === 'function' ? o.where : null;
  // islandPlan's exports (the default): its ANIMAL_SPOTS (a spot's wander radius and the line its animals stand along)
  // and its PLOT_PLACES (a building's pet lives beside its plot board's place, never in it)
  const layout = own(o, 'layout') || islandPlan;
  // the walk: a walk.js instance, or env.walk's data (made into one when first needed)
  let walkI = null;
  const walkSrc = own(o, 'walk');
  function walk() {
    if (walkI !== null) return walkI || null;
    walkI = false;
    try {
      if (walkSrc && typeof walkSrc.inside === 'function') walkI = walkSrc;
      else if (walkSrc && Array.isArray(walkSrc.areas)) walkI = createWalk(walkSrc);
    } catch {
      walkI = false;
    }
    return walkI || null;
  }
  // on the planks and clear of every blocker (a building's pad, a crate): where an animal may stand
  const onWalk = (x, z) => {
    const w = walk();
    if (!w) return true;
    try {
      return w.inside(x, z) && !(typeof w.blocked === 'function' && w.blocked(x, z, 0.15));
    } catch {
      return true;
    }
  };

  const group = new THREE.Group();
  group.name = 'critters';
  group.userData.keep = true;
  if (scene && scene.isObject3D) scene.add(group);
  const mats = materials();
  // one InstancedMesh and its ink twin per species, sized for the species' most
  const kinds = {};
  for (const sp of SPECIES) {
    const parts = MODELS[sp]();
    const geo = mergeModel(parts, false);
    const hullGeo = mergeModel(parts, true);
    for (const p of parts) p.geo.dispose();
    const cap = Math.max(1, ANIMALS[sp] ? ANIMALS[sp].max : 4);
    const anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    anim.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iAnim', anim);
    hullGeo.setAttribute('iAnim', anim);
    const mesh = new THREE.InstancedMesh(geo, mats.body, cap);
    const hull = new THREE.InstancedMesh(hullGeo, mats.ink, cap);
    hull.instanceMatrix = mesh.instanceMatrix; // (one matrix buffer for both)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.name = `critters:${sp}`;
    hull.name = `critters:${sp}:ink`;
    const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
    for (const m of [mesh, hull]) {
      m.count = 0;
      m.visible = false;
      m.boundingSphere = sphere;
      m.userData.keep = true;
      group.add(m);
    }
    mesh.setColorAt(0, _c.setRGB(1, 1, 1)); // (makes the instance colour buffer)
    kinds[sp] = { mesh, hull, anim, cap, sphere, tris: geo.index.count / 3, hullTris: hullGeo.index.count / 3, slots: [] };
  }

  /** @type {any[]} */
  let list = [];
  let shown = true;
  let lastT = 0;
  let cap = null;
  let capStill = 0;
  let capSpeed = 0;
  let rubber = null; // the cat rubbing round his legs

  // a named spot: the layout's ANIMAL_SPOTS entry, else critters' own
  function named(at) {
    if (typeof at !== 'string') return null;
    const q = own(own(layout, 'ANIMAL_SPOTS'), at);
    if (q && fin(own(q, 'x')) && fin(own(q, 'z'))) return { x: q.x, y: fin(own(q, 'y')) ? q.y : null, z: q.z, r: fin(own(q, 'r')) ? q.r : null, along: Array.isArray(own(q, 'along')) ? q.along : null };
    return Object.prototype.hasOwnProperty.call(SPOTS, at) ? { ...SPOTS[at] } : null;
  }
  // beside a plot board's place (outside its circle, on the planks, clear of the pad): where a building's pet lives
  // (n: how many share it; they stand in a line along the porch, beside the place)
  function besidePlace(at, n, x, z) {
    const pl = arr(own(layout, 'PLOT_PLACES')).find((p) => own(p, 'id') === at && fin(own(p, 'x')) && fin(own(p, 'z')));
    // (only where the roster put it at the place itself: a spot given elsewhere is kept)
    if (!pl || (fin(x) && fin(z) && Math.hypot(x - pl.x, z - pl.z) > 0.01)) return null;
    const h = fin(own(pl, 'face')) ? pl.face : 0;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const r = fin(own(pl, 'r')) ? pl.r : 1;
    const d0 = r + 0.55 + (n > 1 ? 0.5 : 0);
    for (const d of [d0, d0 + 0.4, d0 + 0.8]) {
      for (const [sx, sz] of [[fz, -fx], [-fz, fx], [-fx, -fz]]) {
        const x = pl.x + sx * d;
        const z = pl.z + sz * d;
        if (onWalk(x, z)) return { x, y: null, z, r: 0.3, along: [sx * 0.5, sz * 0.5] };
      }
    }
    return { x: pl.x, y: null, z: pl.z, r: 0.3, along: [fz * 0.5, -fx * 0.5] };
  }
  function spotFor(a, k, n) {
    // the layout's place, else critters' own; animals sharing a spot stand apart
    let s = null;
    const x = own(a, 'x');
    const z = own(a, 'z');
    const at = own(a, 'at');
    const nm = named(at);
    if (typeof at === 'string' && at.startsWith('plot:')) s = besidePlace(at, n, x, z) || (fin(x) && fin(z) ? { x, y: fin(own(a, 'y')) ? a.y : null, z, r: fin(own(a, 'r')) ? a.r : 0.3 } : plotSpot(at.slice(5)));
    else if (fin(x) && fin(z)) s = { x, y: fin(own(a, 'y')) ? a.y : null, z, r: fin(own(a, 'r')) ? a.r : nm ? nm.r : null, along: nm ? nm.along : null };
    else if (nm) s = nm;
    if (!s) return null;
    const along = s.along || null;
    if (n > 1) {
      const bx = s.x;
      const bz = s.z;
      if (along) {
        const f = n === 1 ? 0 : (k / (n - 1)) * 2 - 1;
        s.x += along[0] * f;
        s.z += along[1] * f;
      } else {
        const ang = (k / n) * TAU + 0.6;
        const rr = 0.55 + 0.1 * n;
        s.x += Math.cos(ang) * rr;
        s.z += Math.sin(ang) * rr;
      }
      // (a mate spread off the planks stands at the spot itself)
      if (onWalk(bx, bz) && !onWalk(s.x, s.z)) {
        s.x = bx;
        s.z = bz;
      }
    }
    if (!fin(s.y)) {
      const w = walk();
      const y = w ? w.heightAt(s.x, s.z) : null;
      s.y = fin(y) ? y : 1.3;
    }
    return s;
  }
  /** Who is out: islanders.roster(...).animals. Animals beyond a species' most are left out. Returns how many. */
  function set(animals) {
    const src = Array.isArray(animals) ? animals : [];
    const per = {};
    const byAt = {};
    const rows = [];
    for (const a of src) {
      const sp = own(a, 'species');
      const id = own(a, 'id');
      if (!Object.prototype.hasOwnProperty.call(SPEC, sp) || typeof id !== 'string') {
        rows.push(null);
        continue;
      }
      per[sp] = (per[sp] || 0) + 1;
      if (per[sp] > kinds[sp].cap) {
        rows.push(null);
        continue;
      }
      const key = `${own(a, 'x')},${own(a, 'z')},${own(a, 'at')}`;
      (byAt[key] = byAt[key] || []).push(rows.length);
      rows.push({ a, sp, id, key });
    }
    list = rows.map((r) => {
      if (!r) return null;
      const mates = byAt[r.key];
      const home = spotFor(r.a, mates.indexOf(rows.indexOf(r)), mates.length);
      if (!home) return null;
      const S = SPEC[r.sp];
      const seed = seedOf(r.id);
      const colourHex = NAMED[r.id] ?? pickColour(r.sp, r.a, seed);
      const variant = r.sp === 'cat' && own(r.a, 'colour') === 'calico' ? 1 : r.sp === 'bird' && own(r.a, 'bird') === 'owl' ? 1 : r.sp === 'crab' && r.id === 'hermit' ? 1 : r.sp === 'goat' && hash(seed, 7) < 0.4 ? 1 : r.sp === 'dog' && r.id === 'bolt' ? 1 : 0;
      const onDeck = onWalk(home.x, home.z);
      const rr = fin(home.r) ? home.r : onDeck ? S.r : 0.12;
      return {
        id: r.id,
        species: r.sp,
        name: typeof own(r.a, 'name') === 'string' ? r.a.name : r.id,
        word: typeof own(r.a, 'word') === 'string' ? r.a.word : ANIMALS[r.sp].word,
        sound: own(r.a, 'sound') !== undefined ? r.a.sound : ANIMALS[r.sp].sound,
        follow: typeof own(r.a, 'follow') === 'string' ? r.a.follow : null,
        home,
        r: rr,
        onDeck,
        seed,
        phase: hash(seed, 1) * 100,
        size: r.id === 'hermit' ? 0.75 : r.sp === 'bird' ? 1.2 : 1, // (a parrot reads on a phone at 1.2)
        colour: new THREE.Color(colourHex),
        variant,
        // the dynamic part: an offset from its round (a hop, a rub, a pet's circle), the reaction, the follow state
        x: home.x,
        y: home.y,
        z: home.z,
        h: hash(seed, 2) * TAU,
        off: { x: 0, z: 0 },
        hop: null,
        react: null,
        lastPet: -Infinity,
        fx: home.x,
        fz: home.z,
        fh: 0,
        drawn: false,
        moving: false,
        act: 'rest',
      };
    });
    rubber = null;
    return list.filter(Boolean).length;
  }
  function pickColour(sp, a, seed) {
    const F = FUR[sp];
    if (sp === 'cat' && typeof own(a, 'colour') === 'string' && F[a.colour]) return F[a.colour];
    if (sp === 'bird') {
      const pal = own(a, 'bird') === 'owl' ? F.owl : F.parrot;
      return pal[Math.floor(hash(seed, 3) * pal.length) % pal.length];
    }
    const pal = F._;
    return pal[Math.floor(hash(seed, 3) * pal.length) % pal.length];
  }

  // ----- each animal's round: a pure function of t (its own waypoints round its home) -----
  function waypoint(A, k) {
    if (A.r <= 0.15) return { x: A.home.x + Math.cos(k * 2.1) * A.r, z: A.home.z + Math.sin(k * 1.7) * A.r };
    for (let tries = 0; tries < 3; tries++) {
      const ang = hash(A.seed, k * 3 + tries) * TAU;
      const rr = Math.sqrt(hash(A.seed, k * 3 + tries + 101)) * A.r;
      const x = A.home.x + Math.cos(ang) * rr;
      const z = A.home.z + Math.sin(ang) * rr;
      if (!A.onDeck || onWalk(x, z)) return { x, z };
    }
    return { x: A.home.x, z: A.home.z };
  }
  function round(A, t) {
    const S = SPEC[A.species];
    const tt = t + A.phase;
    const k = Math.floor(tt / S.P);
    const u = tt - k * S.P;
    const a = waypoint(A, k);
    const b = waypoint(A, k + 1);
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const mt = Math.min(d / S.v, S.P * 0.55);
    const rt = S.P - mt;
    const rest = S.rests[Math.floor(hash(A.seed, k + 500) * S.rests.length) % S.rests.length];
    if (u < rt || d < 0.05) {
      const p = waypoint(A, k - 1);
      const hd = Math.hypot(a.x - p.x, a.z - p.z) > 0.05 ? Math.atan2(a.x - p.x, a.z - p.z) : hash(A.seed, k) * TAU;
      return { x: a.x, z: a.z, h: hd, moving: false, speed: 0, act: rest, k: rt > 0 ? u / rt : 0, u };
    }
    const f = (u - rt) / mt;
    return { x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f), h: Math.atan2(b.x - a.x, b.z - a.z), moving: true, speed: d / mt, act: 'walk', k: f, u };
  }
  // following an islander (Sardine after Finn, Salty after Jib, Bolt after Ada): their round, 1 s behind
  function follow(A, dt) {
    if (!where || !A.follow) return null;
    let q = null;
    let me = null;
    try {
      q = where(A.follow, A.species === 'cat' ? 1.4 : 1.0);
      me = where(A.follow, 0);
    } catch {
      q = null;
    }
    if (!q || !fin(q.x) || !fin(q.z)) return null;
    let tx = q.x;
    let tz = q.z;
    if (me && fin(me.x) && !me.moving && Math.hypot(tx - me.x, tz - me.z) < 0.7) {
      // they stand still: sit beside and a little behind them
      const h = fin(me.h) ? me.h : 0;
      tx = me.x - Math.sin(h) * 0.6 + Math.cos(h) * 0.45;
      tz = me.z - Math.cos(h) * 0.6 - Math.sin(h) * 0.45;
    }
    const S = SPEC[A.species];
    const dx = tx - A.fx;
    const dz = tz - A.fz;
    const d = Math.hypot(dx, dz);
    if (d > 8) {
      // too far behind (a fresh roster, a jump of the clock): there at once
      A.fx = tx;
      A.fz = tz;
      return { x: tx, z: tz, h: A.fh, moving: false, speed: 0, act: 'sit', k: 0, y: q.y };
    }
    const step = Math.min(d, (S.follow || 2) * dt * (d > 1.5 ? 1.3 : 1));
    const moving = d > 0.08;
    if (moving) {
      A.fx += (dx / d) * step;
      A.fz += (dz / d) * step;
      A.fh = Math.atan2(dx, dz);
    } else if (me && fin(me.h)) A.fh = turnTo(A.fh, me.h, 2 * dt);
    return { x: A.fx, z: A.fz, h: A.fh, moving, speed: moving && dt > 0 ? step / dt : 0, act: moving ? 'walk' : 'sit', k: 0, y: q.y };
  }
  const turnTo = (a, b, step) => {
    const d = wrap(b - a);
    return Math.abs(d) <= step ? b : a + Math.sign(d) * step;
  };

  // ----- each frame -----
  const tmpM = new THREE.Matrix4();
  const tmpP = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
  const tmpS = new THREE.Vector3();
  function readCap(c) {
    if (!c || typeof c !== 'object') return null;
    const x = own(c, 'x');
    const z = own(c, 'z');
    if (!fin(x) || !fin(z)) return null;
    const y = own(c, 'y');
    return { x, z, y: fin(y) ? y : null };
  }
  function update(t, dt0, captain) {
    const tt = fin(t) ? t : lastT;
    const dt = clamp(fin(dt0) ? dt0 : tt - lastT, 0, 0.1);
    lastT = tt;
    const c = readCap(captain);
    if (c && cap && dt > 0) capSpeed = Math.hypot(c.x - cap.x, c.z - cap.z) / dt;
    else capSpeed = 0;
    cap = c;
    if (cap && cap.y === null) {
      const w = walk();
      const y = w ? w.heightAt(cap.x, cap.z) : null;
      cap.y = fin(y) ? y : null;
    }
    capStill = cap && capSpeed < 0.2 ? capStill + dt : 0;
    const rm = reduced();
    for (const sp of SPECIES) kinds[sp].slots.length = 0;
    // the cat that comes to rub round his legs (the nearest within 4 u on his level, once he has stood still 1.5 s)
    if (!cap || capStill < CRITTERS.rub.still) rubber = null;
    else if (!rubber) {
      let best = null;
      for (const A of list) {
        if (!A || A.species !== 'cat' || A.react || A.hop) continue;
        const d = Math.hypot(A.x - cap.x, A.z - cap.z);
        if (d > CRITTERS.rub.near || (cap.y !== null && Math.abs(A.y - cap.y) > 0.5) || (best && d >= best.d)) continue;
        best = { A, d };
      }
      if (best) rubber = { A: best.A, t0: tt, ang: Math.atan2(best.A.x - cap.x, best.A.z - cap.z) };
    }
    if (rubber && tt - rubber.t0 > CRITTERS.rub.secs) rubber = null;
    for (let i = 0; i < list.length; i++) {
      const A = list[i];
      if (!A) continue;
      A.drawn = false;
      if (!shown) continue;
      if (cap && Math.hypot(A.home.x - cap.x, A.home.z - cap.z) > CRITTERS.cull && Math.hypot(A.x - cap.x, A.z - cap.z) > CRITTERS.cull) continue;
      stepOne(A, tt, dt, rm);
      A.drawn = true;
      kinds[A.species].slots.push(A);
    }
    // write the instances: the drawn ones first, the count trimmed to them
    for (const sp of SPECIES) {
      const K = kinds[sp];
      const n = K.slots.length;
      K.mesh.count = K.hull.count = n;
      K.mesh.visible = K.hull.visible = n > 0;
      if (!n) continue;
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let s = 0; s < n; s++) {
        const A = K.slots[s];
        A.slot = s;
        K.mesh.setMatrixAt(s, A.matrix);
        K.mesh.setColorAt(s, A.colour);
        K.anim.array.set(A.anim, s * 4);
        cx += A.x;
        cy += A.y;
        cz += A.z;
      }
      cx /= n;
      cy /= n;
      cz /= n;
      let r = 0;
      for (const A of K.slots) r = Math.max(r, Math.hypot(A.x - cx, A.y - cy, A.z - cz));
      K.sphere.center.set(cx, cy, cz);
      K.sphere.radius = r + 3;
      K.mesh.instanceMatrix.needsUpdate = true;
      if (K.mesh.instanceColor) K.mesh.instanceColor.needsUpdate = true;
      K.anim.needsUpdate = true;
    }
  }

  function stepOne(A, t, dt, rm) {
    const S = SPEC[A.species];
    // where its round puts it (or its owner's heels)
    let R = follow(A, dt) || round(A, t);
    // a bird's short flight every 20 s (the gulls' way: out round a loop and home), not with reduced motion
    let fly = 0;
    if (A.species === 'bird' && !rm && !A.react) {
      const F = S.fly;
      const u = (((t + A.phase * 0.37) % F) + F) % F;
      if (u < 3.2) {
        fly = Math.sin((u / 3.2) * Math.PI);
        const ang = (u / 3.2) * TAU;
        const side = hash(A.seed, 9) < 0.5 ? 1 : -1;
        R = { x: A.home.x + Math.sin(ang) * 1.6 * side, z: A.home.z + (1 - Math.cos(ang)) * 1.1, h: Math.atan2(Math.cos(ang) * side, Math.sin(ang)), moving: true, speed: 2, act: 'fly', k: u / 3.2 };
      }
    }
    // the captain: a hop aside when he walks up (never under his feet), a cat's rub when he stands still
    const near = cap ? Math.hypot(A.x - cap.x, A.z - cap.z) : Infinity;
    const level = !cap || cap.y === null || Math.abs(A.y - cap.y) < 0.9;
    if (cap && !A.hop && level && fly === 0 && near < CRITTERS.hop.near && capSpeed > CRITTERS.hop.walking) startHop(A, t);
    let target = null;
    if (rubber && rubber.A === A && cap && !A.hop) {
      // round his legs at 0.55 u, a lap every 5 s
      const d = Math.hypot(A.x - cap.x, A.z - cap.z);
      if (d < CRITTERS.rub.r + 0.25) rubber.ang += dt * 1.25;
      const tx = cap.x + Math.sin(rubber.ang) * CRITTERS.rub.r;
      const tz = cap.z + Math.cos(rubber.ang) * CRITTERS.rub.r;
      if (onWalk(tx, tz)) target = { x: tx, z: tz };
    }
    if (A.react && A.react.kind === 'circle' && cap) {
      const k = (t - A.react.t0) / (A.react.until - A.react.t0);
      const ang = A.react.ang + k * TAU;
      const tx = cap.x + Math.sin(ang) * 0.9;
      const tz = cap.z + Math.cos(ang) * 0.9;
      if (onWalk(tx, tz)) target = { x: tx, z: tz };
    }
    let moving = R.moving;
    let speed = R.speed;
    let h = R.h;
    let dy = 0;
    if (A.hop) {
      const k = clamp((t - A.hop.t0) / CRITTERS.hop.secs, 0, 1);
      A.off.x = lerp(A.hop.ox, A.hop.tx, ease(k));
      A.off.z = lerp(A.hop.oz, A.hop.tz, ease(k));
      dy = (rm ? 0.3 : 1) * CRITTERS.hop.high * Math.sin(k * Math.PI);
      h = A.hop.h;
      moving = true;
      speed = 3;
      if (k >= 1) A.hop = null;
    } else if (target) {
      // walk the offset towards the target
      const wx = target.x - R.x;
      const wz = target.z - R.z;
      const dx = wx - A.off.x;
      const dz = wz - A.off.z;
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, 1.1 * dt);
      if (d > 1e-4) {
        A.off.x += (dx / d) * step;
        A.off.z += (dz / d) * step;
      }
      moving = d > 0.02;
      speed = moving ? 1.1 : 0;
      h = moving ? Math.atan2(dx, dz) : cap ? Math.atan2(cap.x - A.x, cap.z - A.z) + Math.PI / 2 : h;
    } else {
      // stroll back onto its round once he is away
      const d = Math.hypot(A.off.x, A.off.z);
      if (d > 1e-3 && (!cap || near > 2.5)) {
        const step = Math.min(d, CRITTERS.home * dt);
        A.off.x -= (A.off.x / d) * step;
        A.off.z -= (A.off.z / d) * step;
        if (!R.moving) {
          moving = true;
          speed = CRITTERS.home;
          h = Math.atan2(-A.off.x, -A.off.z);
        }
      }
    }
    // (an offset from a hop or a rub never carries it off the planks as its round moves on: it shrinks till it fits)
    if (A.onDeck && (A.off.x || A.off.z) && !onWalk(R.x + A.off.x, R.z + A.off.z)) {
      let k = 0.66;
      while (k > 0.05 && !onWalk(R.x + A.off.x * k, R.z + A.off.z * k)) k -= 0.33;
      A.off.x *= Math.max(0, k);
      A.off.z *= Math.max(0, k);
      if (A.hop) A.hop = null;
    }
    const x = R.x + A.off.x;
    const z = R.z + A.off.z;
    let y = fin(R.y) && A.follow ? R.y : A.home.y;
    if (A.onDeck && (A.follow || Math.hypot(A.off.x, A.off.z) > 0.01 || A.r > 0.15)) {
      const w = walk();
      const yy = w ? w.heightAt(x, z, y) : null;
      if (fin(yy)) y = yy;
    }
    A.h = moving ? turnTo(A.h, h, 10 * dt) : turnTo(A.h, h, 3 * dt);
    if (A.species === 'crab' && moving && !A.hop) A.h = turnTo(A.h, h + Math.PI / 2, 10 * dt); // crabs go sideways
    A.x = x;
    A.y = y;
    A.z = z;
    A.moving = moving;
    A.act = moving ? 'walk' : R.act;
    pose(A, t, speed, dy, fly, rm, near);
  }
  function startHop(A, t) {
    const ax = A.x - cap.x;
    const az = A.z - cap.z;
    const base = Math.hypot(ax, az) > 1e-3 ? Math.atan2(ax, az) : hash(A.seed, Math.floor(t)) * TAU;
    for (const da of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
      const a = base + da;
      const lx = A.x + Math.sin(a) * CRITTERS.hop.dist;
      const lz = A.z + Math.cos(a) * CRITTERS.hop.dist;
      if (A.onDeck && !onWalk(lx, lz)) continue;
      A.hop = { t0: t, ox: A.off.x, oz: A.off.z, tx: A.off.x + (lx - A.x), tz: A.off.z + (lz - A.z), h: a };
      if (rubber && rubber.A === A) rubber = null;
      return;
    }
  }

  // the instance's matrix and its vec4 (wag, limbs, head, variant) for this moment
  function pose(A, t, speed, dy, fly, rm, near) {
    const S = SPEC[A.species];
    const ph = t + A.phase;
    const calm = rm ? 0.35 : 1;
    let pitch = 0;
    let roll = 0;
    let sy = 1;
    let sz = 1;
    let lift = dy;
    let wag = 0;
    let limb = 0;
    let head = 0;
    const walking = A.moving;
    const stride = walking ? Math.sin(ph * S.stride * clamp(speed / S.v, 0.5, 2.5) * (rm ? 0.7 : 1)) : 0;
    const R = A.react && t < A.react.until ? A.react : null;
    if (A.react && !R) A.react = null;
    const rk = R ? (t - R.t0) / (R.until - R.t0) : 0;
    const act = A.act;
    switch (A.species) {
      case 'cat':
      case 'dog': {
        const dog = A.species === 'dog';
        limb = stride * 0.55;
        lift += walking ? Math.abs(stride) * 0.02 : 0;
        wag = dog ? Math.sin(ph * (near < 3 ? 14 : 8)) * (near < 3 ? 0.7 : 0.35) * calm : Math.sin(ph * 1.8) * 0.3 * calm;
        if (!walking) {
          if (act === 'nap' || act === 'lie') {
            sy = 0.74;
            lift -= 0.05;
            head = 0.35;
            limb = 0;
            wag *= 0.3;
          } else if (act === 'sit') {
            pitch = -0.24;
            lift -= 0.03;
            head = -0.2;
            limb = 0;
          } else if (act === 'stretch') {
            const k = Math.sin(clamp(ph % S.P, 0, 3) / 3 * Math.PI);
            pitch = 0.22 * k;
            sz = 1 + 0.12 * k;
          } else if (act === 'sniff') {
            head = 0.45 + 0.08 * Math.sin(ph * 9);
            pitch = 0.08;
          }
        }
        if (R) {
          if (R.kind === 'purr') {
            wag = Math.sin(ph * 4) * 0.6;
            head = -0.2 + 0.1 * Math.sin(ph * 3);
            roll = 0.08 * Math.sin(ph * 3);
          } else {
            lift += rm ? 0 : Math.abs(Math.sin(rk * Math.PI * 3)) * 0.12;
            wag = Math.sin(ph * 18) * 0.8;
          }
        }
        break;
      }
      case 'goat': {
        limb = stride * 0.45;
        wag = Math.sin(ph * 6) * 0.25 * (hash(A.seed, Math.floor(ph / 3)) < 0.3 ? 1 : 0) * calm;
        if (!walking) {
          if (act === 'graze') head = 0.75 + 0.06 * Math.sin(ph * 6);
          else if (act === 'climb' && !rm) {
            const u = ph % S.P;
            const k = clamp(u / 0.8, 0, 1);
            lift += k < 1 ? Math.sin(k * Math.PI) * 0.35 : 0;
            pitch = k < 1 ? -0.3 * Math.sin(k * Math.PI) : 0;
          } else head = -0.1 + 0.05 * Math.sin(ph * 0.7);
        }
        if (R) {
          lift += rm ? 0 : Math.sin(clamp(rk * 1.5, 0, 1) * Math.PI) * 0.3;
          head = -0.3;
        }
        break;
      }
      case 'bird': {
        if (fly > 0) {
          limb = 0.4 + 0.9 * Math.sin(ph * 20);
          lift += fly * 1.4;
          pitch = 0.25;
          roll = 0.25 * Math.sin(ph * 2);
        } else {
          limb = act === 'preen' ? 0.25 + 0.15 * Math.sin(ph * 6) : 0.05 * Math.max(0, Math.sin(ph * 0.9) - 0.9) * 10;
          head = act === 'preen' ? 0.7 * Math.sin(ph * 1.5) : 0.35 * Math.sin(ph * 0.6) * (hash(A.seed, Math.floor(ph / 2)) < 0.5 ? 1 : 0);
          if (walking || act === 'hop') lift += rm ? 0 : Math.abs(Math.sin(ph * 7)) * 0.06;
          wag = 0.15 * Math.sin(ph * 2);
        }
        if (R) {
          limb = 0.3 + 0.8 * Math.abs(Math.sin(ph * 16));
          lift += rm ? 0 : Math.sin(clamp(rk * 1.4, 0, 1) * Math.PI) * 0.25;
        }
        break;
      }
      case 'monkey': {
        wag = Math.sin(ph * 1.4) * 0.4 * calm;
        limb = walking ? stride * 0.6 : act === 'peel' ? -0.5 + 0.25 * Math.sin(ph * 2.2) : act === 'scratch' ? 0.8 + 0.2 * Math.sin(ph * 12) : 0;
        head = act === 'peel' ? 0.15 : -0.05 * Math.sin(ph);
        if (walking) lift += Math.abs(stride) * 0.04;
        if (!walking && act === 'swing' && !rm) {
          // a cartwheel hop: up, round and down
          const u = (ph % S.P) % 3.5;
          const k = clamp(u / 1.0, 0, 1);
          if (k < 1) {
            lift += Math.sin(k * Math.PI) * 0.5;
            roll = k * TAU;
          }
        }
        if (R) {
          limb = -1.6 + 0.3 * Math.sin(ph * 10); // a cheeky wave
          lift += rm ? 0 : Math.abs(Math.sin(rk * Math.PI * 2)) * 0.15;
          head = -0.2;
        }
        break;
      }
      case 'crab': {
        wag = walking ? Math.sin(ph * 26) * 0.5 : 0;
        limb = act === 'claws' ? 0.35 * Math.sin(ph * 5) : 0.05 * Math.sin(ph * 1.3);
        if (!walking && act === 'dig') {
          lift -= 0.06 * Math.min(1, (ph % S.P) / 1.5);
          roll = 0.06 * Math.sin(ph * 14);
        }
        if (R) {
          lift -= 0.07 * Math.sin(clamp(rk * 1.2, 0, 1) * Math.PI); // ducks into its shell
          limb = -0.5;
        }
        break;
      }
      case 'turtle': {
        limb = walking ? Math.sin(ph * S.stride) * 0.45 : 0;
        head = walking ? -0.1 : act === 'blink' ? 0.2 * Math.max(0, Math.sin(ph * 1.2)) : 0;
        lift += walking ? 0.008 * Math.sin(ph * 8) : 0;
        if (R) head = 0.3 * Math.sin(rk * Math.PI); // a slow blink (a nod of the head)
        break;
      }
    }
    if (walking && (A.species === 'goat' || A.species === 'dog' || A.species === 'cat')) roll += 0.03 * stride;
    tmpE.set(pitch, A.h, roll, 'YXZ');
    tmpQ.setFromEuler(tmpE);
    const s = A.size;
    tmpS.set(s, s * sy, s * sz);
    tmpP.set(A.x, A.y + lift, A.z);
    A.matrix = A.matrix || new THREE.Matrix4();
    A.matrix.compose(tmpP, tmpQ, tmpS);
    A.anim = A.anim || new Float32Array(4);
    A.anim[0] = wag;
    A.anim[1] = limb;
    A.anim[2] = head;
    A.anim[3] = A.variant;
  }

  // ----- what the town asks -----
  /** The animal a tap's ray hits (its round body, a little generous for a finger), or null. */
  function pick(ray) {
    const org = ray && ray.origin;
    const dir = ray && ray.direction;
    if (!org || !dir || !fin(org.x) || !fin(dir.x)) return null;
    let best = null;
    for (let i = 0; i < list.length; i++) {
      const A = list[i];
      if (!A || !A.drawn) continue;
      const S = SPEC[A.species];
      const r = S.size * 0.6 * A.size + 0.12;
      const cx = A.x - org.x;
      const cy = A.y + S.size * 0.45 * A.size - org.y;
      const cz = A.z - org.z;
      const along = cx * dir.x + cy * dir.y + cz * dir.z;
      if (along < 0) continue;
      const d2 = cx * cx + cy * cy + cz * cz - along * along;
      if (d2 > r * r || (best && along >= best.t)) continue;
      best = { i, t: along };
    }
    return best ? best.i : null;
  }
  /** The nearest animal within petting reach (1.6 u) of the captain, on his level, or null. */
  function near(captain) {
    const c = readCap(captain);
    if (!c) return null;
    let best = null;
    for (let i = 0; i < list.length; i++) {
      const A = list[i];
      if (!A || !A.drawn) continue;
      const d = Math.hypot(A.x - c.x, A.z - c.z);
      if (d > CRITTERS.pet.reach || (c.y !== null && Math.abs(A.y - c.y) > 1.2) || (best && d >= best.d)) continue;
      best = { i, d };
    }
    return best ? best.i : null;
  }
  /** Pet animal i: its little show, and what the town pops and plays ({ word, sound (null: a turtle), … }), at most
   *  once per 2 s per animal (else null). */
  function react(i) {
    const A = Number.isInteger(i) ? list[i] : null;
    if (!A || !A.drawn || lastT - A.lastPet < CRITTERS.pet.every) return null;
    A.lastPet = lastT;
    const kind = A.species === 'cat' ? 'purr' : A.species === 'dog' && cap ? 'circle' : 'hop';
    A.react = { t0: lastT, until: lastT + (kind === 'circle' ? 1.8 : CRITTERS.pet.secs), kind, ang: cap ? Math.atan2(A.x - cap.x, A.z - cap.z) : 0 };
    if (kind === 'purr' && cap && !rubber) rubber = { A, t0: lastT, ang: Math.atan2(A.x - cap.x, A.z - cap.z) };
    return { i, id: A.id, name: A.name, species: A.species, word: A.word, sound: A.sound, x: A.x, y: A.y + SPEC[A.species].size, z: A.z };
  }
  function visible(on) {
    shown = !!on;
    group.visible = shown;
  }
  function dispose() {
    for (const sp of SPECIES) {
      const K = kinds[sp];
      K.mesh.geometry.dispose();
      K.hull.geometry.dispose();
      K.mesh.dispose();
    }
    mats.body.dispose();
    mats.ink.dispose();
    if (group.parent) group.parent.remove(group);
    list = [];
  }

  return {
    set,
    update,
    pick,
    near,
    react,
    visible,
    dispose,
    /** The meshes to warm-draw at dock open (main's warmDraw): every species' body and ink. */
    warmables() {
      return SPECIES.flatMap((sp) => [kinds[sp].mesh, kinds[sp].hull]);
    },
    group,
    get list() {
      return list.map((A, i) => (A ? { i, id: A.id, name: A.name, species: A.species, x: A.x, y: A.y, z: A.z, h: A.h, home: { x: A.home.x, y: A.home.y, z: A.home.z, r: A.r }, onDeck: A.onDeck, drawn: A.drawn, moving: A.moving, act: A.act, follow: A.follow, hopping: !!A.hop, rubbing: !!(rubber && rubber.A === A), word: A.word, sound: A.sound } : null));
    },
    /** Triangles drawn this frame (both meshes of every species) and the draw calls they take. */
    get triangles() {
      let n = 0;
      for (const sp of SPECIES) n += kinds[sp].mesh.count * (kinds[sp].tris + kinds[sp].hullTris);
      return n;
    },
    get calls() {
      let n = 0;
      for (const sp of SPECIES) if (kinds[sp].mesh.visible && shown) n += 2;
      return n;
    },
  };
}
