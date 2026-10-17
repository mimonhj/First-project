// Special ammo for "The Kraken Seas" (SPEC3 §2): Fire, Frost and Stink shot, the statuses they put on a
// ship, the recipes bought once at the tavern's Powder room and the loads that refill at every level start.
//
// Pure: imports nothing (the Node tests load it as a data: URL). Every number lives in one of the tables
// below, so balance changes touch one place.
//
// STAGE 0 SCAFFOLD: the final §11.1 API with its tables, and functions that return safe defaults (a ship
// never has a status, nothing is owned, no loads). Stage 1A writes the rules; main.js already calls
// newStatus() and statusMuls() (identity) in Stage 0.

export const SPECIAL_IDS = ['fire', 'frost', 'stink'];
export const ALL_AMMO = ['round', 'chain', 'grape', 'fire', 'frost', 'stink']; // keys 1–6, the R cycle order

/** §2.1: the three shots. hull: × the round shot's hull damage; range, reload ×, spread ×; hit pad / top (y). */
export const SPECIAL = {
  fire: { name: 'Fire shot', key: '4', hull: 0.7, crew: 0, rakeCrew: 0, range: 30, reloadMul: 1.1, spreadMul: 1.0, pad: 0.4, top: 3.8, status: 'fire' },
  frost: { name: 'Frost shot', key: '5', hull: 0.6, crew: 0, rakeCrew: 0, range: 28, reloadMul: 1.1, spreadMul: 1.1, pad: 0.4, top: 3.8, status: 'frost' },
  stink: { name: 'Stink shot', key: '6', hull: 0.2, crew: 0, rakeCrew: 0, range: 22, reloadMul: 1.2, spreadMul: 1.5, pad: 0.8, top: 5.0, status: 'stink' },
};

/** §2.5: a recipe's price and the level whose clear puts it on sale (`unlocked` ≥ sale). */
export const RECIPES = { fire: { price: 300, sale: 4 }, frost: { price: 300, sale: 6 }, stink: { price: 500, sale: 7 } };

/** §2.5: loads at every level start (+ the Powder Windmill's tier), powder crates. */
export const LOADS = { base: 4, windmill: [0, 1, 2, 3], crate: 1, crateGold: 20, crateReach: 3 };

/** §2.2: what each status does and how long it lasts (bosses: `boss` s, frost × bossMul). */
export const STATUS = {
  fire: { dps: 3, time: 6, boss: 3 },
  frost: { speed: 0.5, turn: 0.6, time: 5, add: 2, max: 8, bossMul: 0.5 },
  stink: { time: 4, boss: 2, immune: 10, bossImmune: 20, grit: 0.75, decel: 2 },
  kaboom: { burst: 15 },
};

/** §2.2: the only two immunities (ship type → status ids); their words are in WORDS3.immune. */
export const IMMUNE = { inferno: ['fire'], phantom: ['stink'] };

/** Every new pop and hint word (§2.2–2.7), so every screen says the same thing. */
export const WORDS3 = {
  fire: 'ON FIRE!',
  frost: 'FROZEN!',
  stink: 'STINKY!',
  pegs: 'Clothes-pegs!',
  kaboom: 'KA-BOOM!',
  fireOut: 'FIRE OUT! SSSS!',
  doused: 'FIRE OUT!',
  immunePop: 'IMMUNE!',
  clang: 'CLANG!',
  immune: { inferno: 'The Maw laughs at fire!', phantom: "Ghosts can't smell!" },
  hot: 'Too hot to board! Wait for the fire to go out.',
};

// Shared answers of the stubs (frozen: callers must never change them).
const NO_MULS = Object.freeze({ speed: 1, turn: 1, noFire: false, noBoard: false, noRam: false, noMortar: false, grit: 1, noGrapple: false });

export function isSpecial(id) {
  return typeof id === 'string' && SPECIAL_IDS.includes(id);
}

/** Is this recipe on sale with `unlocked` levels open? (Stage 0: never.) */
export function onSale(id, unlocked) {
  return false;
}

/** §2.6: a round-shot result turned into this special's. (Stage 0: the info, unchanged.) */
export function specialShot(info, id) {
  return info;
}

/** A ship's status record: `id` null means no status. */
export function newStatus() {
  return { id: null, t: 0, max: 0, immune: 0 };
}

/** Put status `id` on a ship. (Stage 0: nothing takes hold.) */
export function applyStatus(st, id, opts) {
  return { st: st && typeof st === 'object' ? st : newStatus(), events: [], burst: 0, burn: null };
}

/** Run a status for dt simulated seconds. (Stage 0: nothing runs.) */
export function stepStatus(st, dt) {
  return { st: st && typeof st === 'object' ? st : newStatus(), ended: null };
}

/** What a status does to a ship now: multipliers and refusals. (Stage 0: none, a shared identity.) */
export function statusMuls(st) {
  return NO_MULS;
}

/** Water and frost put out a fire. (Stage 0: nothing to put out.) */
export function douse(st) {
  return { st: st && typeof st === 'object' ? st : newStatus(), doused: false };
}

/** Loads at a level start for each recipe owned. (Stage 0: none owned.) */
export function startLoads(powder, windmillTier) {
  return { fire: 0, frost: 0, stink: 0 };
}

/** Spend one load of `id` (one broadside of one side). (Stage 0: there are none.) */
export function spendLoad(loads, id) {
  return { loads: loads && typeof loads === 'object' ? loads : { fire: 0, frost: 0, stink: 0 }, ok: false };
}

/** A powder crate picked up. (Stage 0: nothing in it.) */
export function crateLoad(loads, powder) {
  return { loads: loads && typeof loads === 'object' ? loads : { fire: 0, frost: 0, stink: 0 }, id: null, gold: 0 };
}

/** The powder record (§10.1): which recipes are owned. */
export function defaultPowder() {
  return { v: 1, own: { fire: 0, frost: 0, stink: 0 } };
}

/** Read a stored powder record. Never throws. (Stage 0: the default.) */
export function parsePowder(raw) {
  return defaultPowder();
}

export function serializePowder(p) {
  const own = (p && typeof p === 'object' && p.own) || {};
  const bit = (v) => (v === 1 ? 1 : 0);
  return JSON.stringify({ v: 1, own: { fire: bit(own.fire), frost: bit(own.frost), stink: bit(own.stink) } });
}

/** Buy a recipe from the chest. (Stage 0: never.) */
export function buyRecipe(powder, purse, id, unlocked) {
  return { ok: false, powder: powder && typeof powder === 'object' ? powder : defaultPowder(), cost: 0, reason: isSpecial(id) ? 'locked' : 'unknown' };
}
