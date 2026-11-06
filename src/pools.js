// Voyage IV's wave pools and the voyage4 record (SPEC4 §3.5, §10.1): every wave of a level 10-12 is drawn once, at
// startLevel, from its pool with a seed taken from saved progress (poolSeed(level, plays)), so Try again replays the
// same waves and a new play after a clear draws new ones; and the pirates-ahoy-voyage4 record (plays, the kinds met,
// the Shellback won, Voyage IV's one-time tips, the prizes of the three new ship types).
//
// Pure: imports nothing (the Node tests load it as a data: URL). Every number lives in one table here: KIND_COST,
// INTRO, POOL_RULES, PACKS, MEET and the levels' pools, POOLS (act4.js's defs carry them as `pool`).
//
// A pool is one entry a wave, { budget, slots, must, from, attackers? }:
//   must      the kind the wave starts with (the kind it introduces, INTRO); null (marked `lacked: true`): one
//             Voyage IV kind of `from` that the previous wave lacked, picked once by weight (§3.5's level 12 · wave 2)
//   from      the kinds the rest of the wave is drawn from, by weight (Voyage IV kinds 2, older kinds 1), while they
//             fit the budget left and the rules (POOL_RULES); a wave equal (as a set) to the previous one, or spending
//             less than its budget − POOL_RULES.slack, is drawn again, at most POOL_RULES.redraws times, then the last
//             draw stands
//   attackers that wave's maxAttackers (main reads it; the draw does not)
// A kind may be drawn only after its introducing wave (INTRO) and never at it but as its `must`, so a new kind always
// arrives first in its wave, alone and announced, and the draw never depends on voyage4.met (which only drives the
// meet card): Try again stays identical even though the first try met new kinds.
//
// How main uses it (Stage 2, SPEC4 §11.2):
//   startLevel   plays = voyage4.plays[n − 10]; seed = poolSeed(n, plays) (or __game.v4.seed's);
//                state.waves = drawWaves(n, def.pool, seed); combatRng = mulberry32(seed)   (levels 10-12 only)
//   the HUD      pending = slotsOf(each wave still to come); isPseudo(kind) guards every SHIP_TYPES[kind]
//   finishLevel  voyage4 = notePlay(voyage4, n), written before the level's gold is banked (§10.2)
//   spawnWave    { rec, first } = meet(voyage4, kind): the meet card when first, the record written at once
//   tips, prizes markTip(voyage4, bit) (§8.4's bits 1..128); notePrize(voyage4, type) beside feats.prizes
//   saves        loadRecord('pirates-ahoy-voyage4', parseVoyage4, serializeVoyage4); the storage listener
//                mergeVoyage4(this tab's, the stored text)
// The record is { v: 1, plays: [p10, p11, p12], met, won, tips, prizes: { stinger?, netsloop?, witch? } }. Every
// record function takes it as an object or as its stored text (or junk: missing, garbage, tampered), validates it
// with parseVoyage4 first, never throws and never changes what it is given (it returns a fresh record).

// ---------------------------------------------------------------------------------------- tables

// The Voyage IV kinds, in met-bit order: kind i is met when voyage4.met & (1 << i).
export const V4_KINDS = Object.freeze(['jolly', 'stinger', 'netsloop', 'puffer', 'witch', 'coilback', 'fort', 'shellback']);

// The kinds that are not ships (parts in main's pseudo-target registry, §3.7); a pack or a patch is one wave slot.
const PSEUDO = Object.freeze(['jolly', 'puffer', 'coilback', 'fort', 'shellback']);

function freeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v);
  return Object.freeze(o);
}

// §3.5: what a kind costs from a wave's budget (a pack or a patch is one slot). The kinds a Voyage IV pool may hold:
// the fire ship and Voyage I's cutters, prahus and junks are not among them.
export const KIND_COST = freeze({
  corsair: 2,
  privateer: 2,
  shark: 2,
  skiff: 2,
  puffer: 2,
  bombketch: 3,
  jolly: 3,
  stinger: 3,
  netsloop: 3,
  fort: 3,
  ironclad: 4,
  witch: 4,
  coilback: 5,
});
// §3.5: the wave [level, index] (index 0 = the level's first wave) that introduces each kind as its `must`; no wave
// before it may hold the kind, and no wave but its `must` at it.
export const INTRO = freeze({
  jolly: [10, 0],
  stinger: [10, 1],
  netsloop: [10, 2],
  puffer: [11, 0],
  witch: [11, 1],
  coilback: [11, 2],
  fort: [12, 0],
});
// §3.5's rules (waveProblems and the 1,000-seed Node test check them).
export const POOL_RULES = freeze({
  slots: 3, // at most this many slots a wave
  perKind: 2, // at most two of a kind
  patches: 1, // at most one puffer patch a wave
  alive: 4, // at most this many slots alive at once (a level's nextWaveAt + its waves' slots)
  puffersAlive: 6, // puffers alive in all (foes4.js: a patch rises with min(4, 6 − alive), the Witch's min(3, 6 − alive))
  never: [['netsloop', 'netsloop'], ['witch', 'bombketch']], // never in one wave
  oneOf: ['witch', 'coilback', 'fort'], // at most one of these a wave
  redraws: 8, // a wave equal to the last, or spending under its budget − slack, is drawn again at most this many times
  slack: 1,
  weight: { v4: 2, old: 1 },
});
// A pack's boats and a patch's puffers (one wave slot each).
export const PACKS = freeze({ jolly: 5, puffer: 4 });
// §3.4: the meet card's time on screen, the hold after it shows, the NEW tag's time.
export const MEET = freeze({ card: 3.5, grace: 4, newTag: 10 });

// §3.5's table: each level's waves (budget, slots, must, from). act4.js's defs carry them as `pool`.
const FROM11 = ['jolly', 'stinger', 'netsloop', 'corsair', 'privateer', 'bombketch', 'ironclad'];
const FROM12 = ['jolly', 'stinger', 'netsloop', 'puffer', 'witch', 'coilback', 'corsair', 'privateer', 'shark', 'skiff', 'bombketch', 'ironclad'];
export const POOLS = freeze({
  10: [
    { budget: 5, slots: 2, must: 'jolly', from: ['corsair', 'privateer', 'shark'] },
    { budget: 6, slots: 2, must: 'stinger', from: ['corsair', 'privateer', 'shark', 'jolly'] },
    { budget: 8, slots: 3, must: 'netsloop', from: ['corsair', 'privateer', 'shark', 'jolly', 'stinger'] },
  ],
  11: [
    { budget: 6, slots: 2, must: 'puffer', from: [...FROM11] },
    { budget: 7, slots: 2, must: 'witch', from: [...FROM11, 'puffer'] },
    { budget: 9, slots: 3, must: 'coilback', from: [...FROM11, 'puffer', 'witch', 'shark', 'skiff'], attackers: 3 },
  ],
  12: [
    { budget: 8, slots: 3, must: 'fort', from: [...FROM12] },
    // (one Voyage IV kind that wave 1 lacked, by weight; the fort is wave 1's alone)
    { budget: 9, slots: 3, must: null, lacked: true, from: [...FROM12] },
  ],
});

// ---------------------------------------------------------------------------------------- helpers

const PLAIN_INT = /^-?\d{1,16}$/;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const MAX_WAVES = 16; // a pool longer than this is cut (a real level has 2 or 3 waves)
const MAX_LIST = 256; // a wave or a `from` list is read up to this many entries
// A missing or unreadable pool, or a wave that finds nothing to draw: Stage 0's stand-in, one Corsair Cutter, so a
// level always has a wave to play.
const FALLBACK = 'cutter';
const DRAW_SALT = 0x504f4f4c; // the draw's own stream ("POOL"): combatRng = mulberry32(seed) rolls differently

// Read an own property; a non-object, a throwing getter or a hostile proxy just counts as missing.
function ownField(o, k) {
  try {
    return o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
  } catch {
    return undefined;
  }
}
function isRecord(o) {
  try {
    return o !== null && typeof o === 'object' && !Array.isArray(o);
  } catch {
    return false; // a revoked proxy
  }
}
function isArray(o) {
  try {
    return Array.isArray(o);
  } catch {
    return false;
  }
}
// An array's entries (own ones, at most `max`; holes and hostile entries read as undefined), or null.
function listOf(o, max = MAX_LIST) {
  if (!isArray(o)) return null;
  const len = ownField(o, 'length');
  const n = typeof len === 'number' && Number.isSafeInteger(len) ? clamp(len, 0, max) : 0;
  const out = [];
  for (let i = 0; i < n; i++) out.push(ownField(o, i));
  return out;
}
// A stored count: a plain integer (number or digit string), clamped to lo..hi; anything else -> null.
function readInt(v, lo, hi) {
  let n = null;
  if (typeof v === 'number' && Number.isSafeInteger(v)) n = v;
  else if (typeof v === 'string' && PLAIN_INT.test(v.trim())) {
    const k = Number(v.trim());
    if (Number.isSafeInteger(k)) n = k;
  }
  return n === null ? null : clamp(n, lo, hi) + 0; // + 0 turns -0 into 0
}
// A level or a wave index: an integer, else NaN (which comes before and after nothing).
const intOf = (v) => (typeof v === 'number' && Number.isInteger(v) ? v : NaN);
const isKind = (k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(KIND_COST, k);
const isV4 = (k) => typeof k === 'string' && V4_KINDS.includes(k);
const weightOf = (k) => (isV4(k) ? POOL_RULES.weight.v4 : POOL_RULES.weight.old);
const costOf = (wave) => wave.reduce((s, k) => s + (isKind(k) ? KIND_COST[k] : 0), 0);
const countOf = (wave, k) => wave.reduce((n, x) => n + (x === k ? 1 : 0), 0);
const sameSet = (a, b) => {
  const A = new Set(a);
  const B = new Set(b);
  return A.size === B.size && [...A].every((k) => B.has(k));
};
// Is the wave (level, index) before the kind's introducing wave? Is it that wave?
const intro = (k) => (Object.prototype.hasOwnProperty.call(INTRO, k) ? INTRO[k] : null);
const beforeIntro = (k, level, index) => {
  const at = intro(k);
  return !!at && !(level > at[0] || (level === at[0] && index >= at[1]));
};
const introducedAt = (k, level, index) => {
  const at = intro(k);
  return !!at && at[0] === level && at[1] === index;
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------- the draw

/** §3.5: the pool seed of a level's play (plays: the clears of that level so far). */
export function poolSeed(level, plays) {
  const L = Number.isFinite(level) ? Math.floor(level) : 0;
  const P = Number.isFinite(plays) ? Math.floor(plays) : 0;
  return (L * 7919 + 13 + P * 104729) >>> 0;
}

// A pool entry as the draw reads it: { budget, slots, must, from } (from: known kinds, each once), or null.
function readEntry(e) {
  if (!isRecord(e)) return null;
  const budget = readInt(ownField(e, 'budget'), 0, 99);
  const slots = readInt(ownField(e, 'slots'), 1, POOL_RULES.slots);
  const must = ownField(e, 'must');
  const from = [];
  for (const k of listOf(ownField(e, 'from')) || []) if (isKind(k) && !from.includes(k)) from.push(k);
  return { budget: budget ?? 0, slots: slots ?? POOL_RULES.slots, must: isKind(must) ? must : null, from };
}
// The entry of wave `index`: from a level's pool (an array), or the entry itself.
function entryOf(pool, index) {
  if (isArray(pool)) return Number.isInteger(index) && index >= 0 && index < MAX_WAVES ? readEntry(ownField(pool, index)) : null;
  return isRecord(pool) && ownField(pool, 'budget') !== undefined ? readEntry(pool) : null;
}

// May kind k join this (partly drawn) wave as a drawn pick? The rules of §3.5 (POOL_RULES) and INTRO: never before
// its introducing wave, and at it only as the must (so a drawn pick is never new).
function allowed(wave, k, level, index) {
  const R = POOL_RULES;
  if (countOf(wave, k) >= R.perKind) return false;
  if (k === 'puffer' && countOf(wave, k) >= R.patches) return false;
  for (const [a, b] of R.never) {
    if (a === b ? k === a && wave.includes(a) : (k === a && wave.includes(b)) || (k === b && wave.includes(a))) return false;
  }
  if (R.oneOf.includes(k) && wave.some((x) => R.oneOf.includes(x))) return false;
  return !beforeIntro(k, level, index) && !introducedAt(k, level, index);
}
// One of the kinds, by weight (Voyage IV kinds 2, older kinds 1).
function pick(kinds, rng) {
  const total = kinds.reduce((s, k) => s + weightOf(k), 0);
  let r = rng() * total;
  for (const k of kinds) {
    r -= weightOf(k);
    if (r < 0) return k;
  }
  return kinds[kinds.length - 1];
}
// The Voyage IV kinds of `from` the previous wave lacked that may start this wave (a `must` of null).
const lacking = (e, prev, level, index) => e.from.filter((k) => isV4(k) && !prev.includes(k) && KIND_COST[k] <= e.budget && allowed([], k, level, index));

// One draw of the wave from its first kind (its must, or the one picked for a must of null).
function attempt(e, first, level, index, rng) {
  const wave = [];
  let left = e.budget;
  if (first) {
    wave.push(first);
    left -= KIND_COST[first];
  }
  while (wave.length < e.slots) {
    const fits = e.from.filter((k) => KIND_COST[k] <= left && allowed(wave, k, level, index));
    if (!fits.length) break;
    const k = pick(fits, rng);
    wave.push(k);
    left -= KIND_COST[k];
  }
  return wave;
}
function drawWave(e, prev, level, index, rng) {
  if (!e) return [FALLBACK];
  // The wave starts from its must; a must of null is picked once, by weight, so the redraws below (which draw the rest
  // again) never tilt it toward the kinds that fill a budget more easily.
  let first = e.must;
  if (!first) {
    const can = lacking(e, prev, level, index);
    if (can.length) first = pick(can, rng);
  }
  let wave = [];
  for (let t = 0; t <= POOL_RULES.redraws; t++) {
    wave = attempt(e, first, level, index, rng);
    if (costOf(wave) >= e.budget - POOL_RULES.slack && !(prev.length && sameSet(wave, prev))) break;
  }
  if (wave.length) return wave;
  // Nothing fits (a broken pool): the cheapest kind of `from` (a wave is never empty), else the stand-in.
  const cheap = [...e.from].sort((a, b) => KIND_COST[a] - KIND_COST[b])[0];
  return [cheap || FALLBACK];
}

/**
 * Every wave of the level, drawn from its pool with this seed (§3.5): one string[] of kinds a pool entry, each
 * starting with its `must`. Deterministic (the same level, pool and seed give the same waves; the result is a fresh
 * array every call) and never throws: a missing or unreadable pool gives one wave of one Corsair Cutter (Stage 0's
 * stand-in), so a level always has a wave to play.
 */
export function drawWaves(level, pool, seed) {
  try {
    const list = listOf(pool, MAX_WAVES);
    if (!list || !list.length) return [[FALLBACK]];
    const L = intOf(level);
    const s = typeof seed === 'number' && Number.isFinite(seed) ? seed >>> 0 : 0;
    const rng = mulberry32((s ^ DRAW_SALT) >>> 0);
    const waves = [];
    let prev = [];
    list.forEach((raw, i) => {
      const wave = drawWave(readEntry(raw), prev, L, i, rng);
      waves.push(wave);
      prev = wave;
    });
    return waves;
  } catch {
    return [[FALLBACK]];
  }
}

const say = (v) => (typeof v === 'string' ? `"${v.slice(0, 24)}"` : typeof v === 'symbol' || typeof v === 'bigint' ? String(v) : `a ${v === null ? 'null' : typeof v}`);

/**
 * What a wave breaks of §3.5's rules ([] when it keeps every one). `prev` is the wave before it (or null), `pool` the
 * level's pool (or just this wave's entry; without one only the rules that need no entry are checked). Each problem
 * starts with its rule: kind, empty, slots, budget, must, from, perKind, patches, never, oneOf, intro, new. The two
 * soft rules of the draw (spending at least the budget − 1, differing from the previous wave) are not problems: after
 * eight redraws the last draw stands. Never throws.
 */
export function waveProblems(level, index, wave, prev, pool) {
  const out = [];
  try {
    const R = POOL_RULES;
    const L = intOf(level);
    const I = intOf(index);
    const w = listOf(wave);
    if (!w) return ['kind: the wave is not a list of kinds'];
    if (!w.length) out.push('empty: a wave has at least one slot');
    for (const k of w) if (!isKind(k)) out.push(`kind: ${say(k)} is not a Voyage IV pool kind`);
    const p = (listOf(prev) || []).filter(isKind);
    const e = entryOf(pool, I);
    if (w.length > R.slots) out.push(`slots: ${w.length} slots (at most ${R.slots} a wave)`);
    if (e && w.length > e.slots) out.push(`slots: ${w.length} slots (this wave has ${e.slots})`);
    if (e && costOf(w) > e.budget) out.push(`budget: spends ${costOf(w)} of ${e.budget}`);
    if (e && e.must && w[0] !== e.must) out.push(`must: starts with ${say(w[0])}, not its must "${e.must}"`);
    if (e && !e.must) {
      const can = lacking(e, p, L, I);
      if (can.length && !can.includes(w[0])) out.push(`must: starts with ${say(w[0])}, not a Voyage IV kind the previous wave lacked (${can.join(', ')})`);
    }
    // (the first slot is the must's; with a must of null it is drawn from `from` too)
    if (e) w.forEach((k, i) => (i > 0 || !e.must) && isKind(k) && !e.from.includes(k) && out.push(`from: "${k}" is not in this wave's list`));
    for (const k of new Set(w.filter(isKind))) {
      const n = countOf(w, k);
      if (n > R.perKind) out.push(`perKind: ${n} × "${k}" (at most ${R.perKind} of a kind)`);
      if (k === 'puffer' && n > R.patches) out.push(`patches: ${n} puffer patches (at most ${R.patches} a wave)`);
      if (beforeIntro(k, L, I)) out.push(`intro: "${k}" before its introducing wave (level ${INTRO[k][0]}, wave ${INTRO[k][1] + 1})`);
      if (introducedAt(k, L, I) && (n > 1 || w[0] !== k)) out.push(`new: "${k}" is new here, so it comes first and alone`);
    }
    for (const [a, b] of R.never) {
      if (a === b ? countOf(w, a) > 1 : w.includes(a) && w.includes(b)) out.push(`never: "${a}" with "${b}"`);
    }
    const ones = w.filter((k) => R.oneOf.includes(k));
    if (ones.length > 1) out.push(`oneOf: ${ones.join(' and ')} (at most one of ${R.oneOf.join(', ')})`);
    const fresh = new Set(w.filter((k) => introducedAt(k, L, I)));
    if (fresh.size > 1) out.push(`new: ${fresh.size} new kinds (at most one a wave)`);
  } catch {
    out.push('kind: the wave could not be read');
  }
  return out;
}

/** The wave slots a wave takes: one each for a ship, a pack, a patch, the Coilback and a fort (0 for junk). */
export function slotsOf(wave) {
  const w = listOf(wave);
  return w ? w.filter((k) => typeof k === 'string' && k.length > 0).length : 0;
}

/** Is this kind a part (a pack, a sea creature, a fort, the Shellback), not a ship? */
export function isPseudo(kind) {
  return typeof kind === 'string' && PSEUDO.includes(kind);
}

// ---------------------------------------------------------------------------------------- the voyage4 record

const MAX_RAW = 2048; // §10.1: ≤ 2 KB (a real record is about 100 characters)
const MAX_PLAYS = 9999;
const MAX_MET = 255; // a bit each of V4_KINDS
const MAX_TIPS = 65535; // §8.4's bits
const MAX_PRIZE = 9999; // cosmetics.js's MAX_PRIZE: the cap of the feats.prizes these restore
const PRIZE_TYPES = Object.freeze(['stinger', 'netsloop', 'witch']); // the three new ship types, in record order
const LEVEL0 = 10; // plays[i] is level 10 + i's

// Number literals that are not plain integers in the JSON text ("1e1", "2.0") are rejected too, where the engine
// tells the reviver the source text (as upgrades.js does).
const BAD = Symbol('bad');
function reviver(key, value, context) {
  if (typeof value === 'number' && context && typeof context.source === 'string' && !PLAIN_INT.test(context.source)) return BAD;
  return value;
}

/** The record of a save that never sailed Voyage IV (§10.1). A fresh object every call. */
export function defaultVoyage4() {
  return { v: 1, plays: [0, 0, 0], met: 0, won: 0, tips: 0, prizes: {} };
}

function cleanVoyage4(obj) {
  const r = defaultVoyage4();
  if (!isRecord(obj)) return r;
  const plays = listOf(ownField(obj, 'plays'), r.plays.length);
  if (plays) {
    plays.forEach((v, i) => {
      const n = readInt(v, 0, MAX_PLAYS);
      if (n !== null) r.plays[i] = n;
    });
  }
  const met = readInt(ownField(obj, 'met'), 0, MAX_MET);
  if (met !== null) r.met = met;
  const won = readInt(ownField(obj, 'won'), 0, 1);
  if (won !== null) r.won = won;
  const tips = readInt(ownField(obj, 'tips'), 0, MAX_TIPS);
  if (tips !== null) r.tips = tips;
  const prizes = ownField(obj, 'prizes');
  if (isRecord(prizes)) {
    for (const t of PRIZE_TYPES) {
      const n = readInt(ownField(prizes, t), 0, MAX_PRIZE);
      if (n) r.prizes[t] = n; // zero counts are left out
    }
  }
  return r;
}

/**
 * Read a stored voyage4 record (the string from storage, or null; a record object is validated the same way).
 * Never throws: ≤ 2 KB, JSON, `plays` 3 plain integers 0..9999 (else 0), `met` 0..255, `won` 0..1, `tips`
 * 0..65535 (integers out of range clamped), `prizes` only stinger / netsloop / witch as 1..9,999 (zeros left out),
 * own properties only, unknown fields dropped, "v" ignored (written back as 1); unreadable input gives the default.
 */
export function parseVoyage4(raw) {
  try {
    if (typeof raw === 'string') {
      if (raw.length > MAX_RAW) return defaultVoyage4();
      let obj = JSON.parse(raw); // bad JSON -> catch -> the default
      try {
        obj = JSON.parse(raw, reviver); // a reviver recurses, so very deep junk could overflow it
      } catch {
        // keep the plain parse
      }
      return cleanVoyage4(obj);
    }
    return cleanVoyage4(raw);
  } catch {
    return defaultVoyage4();
  }
}

/** JSON for storage, validated first: always {"v":1,"plays":[…],"met":…,"won":…,"tips":…,"prizes":{…}}. */
export function serializeVoyage4(rec) {
  return JSON.stringify(parseVoyage4(rec));
}

/** Two tabs (§10.2): plays the larger per level, met and tips or-ed, won the larger, prizes the larger per type. */
export function mergeVoyage4(a, b) {
  const A = parseVoyage4(a);
  const B = parseVoyage4(b);
  const out = defaultVoyage4();
  out.plays = A.plays.map((n, i) => Math.max(n, B.plays[i]));
  out.met = (A.met | B.met) & MAX_MET;
  out.won = Math.max(A.won, B.won);
  out.tips = (A.tips | B.tips) & MAX_TIPS;
  for (const t of PRIZE_TYPES) {
    const n = Math.max(A.prizes[t] || 0, B.prizes[t] || 0);
    if (n) out.prizes[t] = n;
  }
  return out;
}

/** A clear of `level` (10-12): its plays + 1, at most 9999 (another level: the record unchanged). */
export function notePlay(rec, level) {
  const r = parseVoyage4(rec);
  const i = Number.isInteger(level) ? level - LEVEL0 : -1;
  if (i >= 0 && i < r.plays.length) r.plays[i] = Math.min(MAX_PLAYS, r.plays[i] + 1);
  return r;
}

/** A kind spawns (§3.4): { rec (its met bit set), first (true the first time ever on this record) }. */
export function meet(rec, kind) {
  const r = parseVoyage4(rec);
  const i = typeof kind === 'string' ? V4_KINDS.indexOf(kind) : -1;
  if (i < 0) return { rec: r, first: false };
  const bit = 1 << i;
  const first = (r.met & bit) === 0;
  r.met = (r.met | bit) & MAX_MET;
  return { rec: r, first };
}

/** A one-time tip shown (§8.4): its bit (1, 2, 4 … 32768; a mask of several is fine) set. Junk: unchanged. */
export function markTip(rec, bit) {
  const r = parseVoyage4(rec);
  if (Number.isSafeInteger(bit) && bit > 0 && bit <= MAX_TIPS) r.tips = (r.tips | bit) & MAX_TIPS;
  return r;
}

/** A capture of one of the three new ship types: its prizes count + 1, at most 9,999 (mirrors feats.prizes). */
export function notePrize(rec, type) {
  const r = parseVoyage4(rec);
  if (typeof type !== 'string' || !PRIZE_TYPES.includes(type)) return r;
  r.prizes[type] = Math.min(MAX_PRIZE, (r.prizes[type] || 0) + 1);
  return cleanVoyage4(r); // (the prizes in record order)
}
