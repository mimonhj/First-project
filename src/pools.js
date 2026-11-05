// Voyage IV's wave pools and the voyage4 record (SPEC4 §3.5, §10.1): every wave of a level 10-12 is drawn once, at
// startLevel, from its pool with a seed taken from saved progress (poolSeed(level, plays)), so Try again replays the
// same waves and a new play after a clear draws new ones; and the pirates-ahoy-voyage4 record (plays, the kinds met,
// the Shellback won, Voyage IV's one-time tips, the prizes of the three new ship types).
//
// Pure: imports nothing (the Node tests load it as a data: URL). Every number lives in one table here: KIND_COST,
// INTRO, POOL_RULES, PACKS, MEET.
//
// STAGE 0 SCAFFOLD: the final API (SPEC4 §11.1) with safe answers. drawWaves() returns [['cutter']] for any
// level (so act4.js and main build against it), waveProblems() finds nothing, the record functions keep the default
// record. Stage 1 (1A) writes the draw, the rules and the record.

// The Voyage IV kinds, in met-bit order: kind i is met when voyage4.met & (1 << i).
export const V4_KINDS = Object.freeze(['jolly', 'stinger', 'netsloop', 'puffer', 'witch', 'coilback', 'fort', 'shellback']);

// The kinds that are not ships (parts in main's pseudo-target registry, §3.7); a pack or a patch is one wave slot.
const PSEUDO = Object.freeze(['jolly', 'puffer', 'coilback', 'fort', 'shellback']);

function freeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v);
  return Object.freeze(o);
}

// §3.5: what a kind costs from a wave's budget (a pack or a patch is one slot).
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
// §3.5: the wave (level, index) that introduces each kind (its `must`); no wave before it may hold it.
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
  alive: 4, // at most this many slots alive at once
  puffersAlive: 6, // puffers alive in all
  never: [['netsloop', 'netsloop'], ['witch', 'bombketch']], // never in one wave
  oneOf: ['witch', 'coilback', 'fort'], // at most one of these a wave
  redraws: 8, // a wave equal to the last or under budget - 1 is drawn again, at most this many times
  weight: { v4: 2, old: 1 },
});
// A pack's boats and a patch's puffers (one wave slot each).
export const PACKS = freeze({ jolly: 5, puffer: 4 });
// §3.4: the meet card's time on screen, the hold after it shows, the NEW tag's time.
export const MEET = freeze({ card: 3.5, grace: 4, newTag: 10 });

/** §3.5: the pool seed of a level's play (plays: the clears of that level so far). */
export function poolSeed(level, plays) {
  const L = Number.isFinite(level) ? Math.floor(level) : 0;
  const P = Number.isFinite(plays) ? Math.floor(plays) : 0;
  return (L * 7919 + 13 + P * 104729) >>> 0;
}

/** Every wave of the level, drawn from its pool with this seed (deterministic; never throws). Stage 0: one cutter. */
export function drawWaves(level, pool, seed) {
  return [['cutter']];
}

/** What a wave breaks of §3.5's rules ([] when it keeps every one). Stage 0: nothing. */
export function waveProblems(level, index, wave, prev, pool) {
  return [];
}

/** The wave slots a wave takes (a pack, a patch, a ship: one each). */
export function slotsOf(wave) {
  return Array.isArray(wave) ? wave.length : 0;
}

/** Is this kind a part (a pack, a sea creature, a fort, the Shellback), not a ship? */
export function isPseudo(kind) {
  return typeof kind === 'string' && PSEUDO.includes(kind);
}

// ---------------------------------------------------------------------------------------- the voyage4 record

/** The record of a save that never sailed Voyage IV (§10.1). */
export function defaultVoyage4() {
  return { v: 1, plays: [0, 0, 0], met: 0, won: 0, tips: 0, prizes: {} };
}

/** The stored text (or junk) as a valid record; never throws. Stage 0: the default record. */
export function parseVoyage4(raw) {
  return defaultVoyage4();
}

/** The record as its stored text. */
export function serializeVoyage4(rec) {
  const r = rec && typeof rec === 'object' ? rec : defaultVoyage4();
  const d = defaultVoyage4();
  return JSON.stringify({ v: 1, plays: Array.isArray(r.plays) ? r.plays : d.plays, met: r.met ?? 0, won: r.won ?? 0, tips: r.tips ?? 0, prizes: r.prizes && typeof r.prizes === 'object' ? r.prizes : {} });
}

/** Two tabs' records joined (plays the larger per level, met and tips or-ed, won the larger, prizes the larger). */
export function mergeVoyage4(a, b) {
  return defaultVoyage4();
}

/** A clear of `level` (10-12): its plays + 1 (capped at 9999). Stage 0: the record unchanged. */
export function notePlay(rec, level) {
  return rec;
}

/** A kind spawns: { rec (its met bit set), first (true the first time ever) }. Stage 0: never first. */
export function meet(rec, kind) {
  return { rec, first: false };
}

/** A one-time tip shown (§8.4): its bit set. Stage 0: the record unchanged. */
export function markTip(rec, bit) {
  return rec;
}

/** A capture of a new ship type: its prizes count + 1 (mirrors feats.prizes). Stage 0: the record unchanged. */
export function notePrize(rec, type) {
  return rec;
}
