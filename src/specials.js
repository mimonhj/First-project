// Special ammo for "The Kraken Seas" (SPEC3 §2): Fire, Frost and Stink shot, the statuses they put on a
// ship, the recipes bought once at the tavern's Powder room (the powder record, §10.1) and the loads that
// refill at every level start.
//
// Pure: imports nothing (the Node tests load it as a data: URL). Every number lives in one of the tables
// below, so balance changes touch one place; main.js applies the results.
//
// How a special ball is resolved (§2.6): main runs it through combat.js shotResult() as round shot, then
//   info = specialShot(info, id)        hull × SPECIAL.hull, no crit effect, no crew, the status to apply
//   info.dmg *= armourMul(...)          combat.js (the Iron Turtle's beam)
//   damage(...)                         applies info.status with applyStatus(), once per volley per target
//
// A ship's status (§2.2) is the record newStatus() makes, { id, t, max, immune }:
//   id      'fire' | 'frost' | 'stink', or null for none (tags.js: id == null means no badge)
//   t       seconds left;  max: the seconds it had when it last took hold (tags draw t / max as 8 dots)
//   immune  seconds left of the "Clothes-pegs!" window that follows a stink (no stink takes hold meanwhile)
// While she is stinky the record also carries `pegs`: the window that stink leaves behind (10 s, a boss 20 s),
// because stepStatus() is told nothing about the ship. Statuses run in simulated time (stepStatus in step()).
// Every function returns fresh records and never changes what it is given.
//
// Every function takes junk (missing fields, NaN, wrong types, throwing getters, proxies) without throwing
// and returns well-formed, finite results.

// ---------------------------------------------------------------------------------------- helpers

const EPS = 1e-9;
const tidy = (v) => Math.round(v * 1e9) / 1e9; // 12 × 0.7 is 8.399999999999999: the spec says 8.4
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const finite = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

// Caps that keep junk finite (nothing real comes near them).
const MAX_TIME = 1e4; // s
const MAX_DAMAGE = 1e6;
const MAX_LOADS = 999;
const MAX_RATE = 1e4; // hp/s

// Read one field; a non-object, a throwing getter or a hostile proxy just counts as missing.
function field(o, k) {
  if (o === null || (typeof o !== 'object' && typeof o !== 'function')) return undefined;
  try {
    return o[k];
  } catch {
    return undefined;
  }
}
// The same, own properties only (stored records: nothing inherited, no __proto__ tricks).
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
const time = (v) => clamp(finite(v, 0), 0, MAX_TIME);
const loadCount = (v) => (typeof v === 'number' && Number.isFinite(v) ? clamp(Math.floor(v), 0, MAX_LOADS) : 0);

// ---------------------------------------------------------------------------------------- tables

function freeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v);
  return Object.freeze(o);
}

export const SPECIAL_IDS = freeze(['fire', 'frost', 'stink']);
export const ALL_AMMO = freeze(['round', 'chain', 'grape', 'fire', 'frost', 'stink']); // keys 1–6, the R cycle order

/**
 * §2.1: the three shots, with the same fields as combat.js AMMO rows (but `unlock`), so fire() reads either.
 * hull: × the round shot's hull damage; crew / rakeCrew: sailors killed (none); range: flight clamp; reloadMul,
 * spreadMul: on the ship's reload and aim spread; pad / top: hitsShip() padding and height; status: what it puts on her.
 */
export const SPECIAL = freeze({
  fire: { name: 'Fire shot', key: '4', hull: 0.7, crew: 0, rakeCrew: 0, range: 30, reloadMul: 1.1, spreadMul: 1.0, pad: 0.4, top: 3.8, status: 'fire' },
  frost: { name: 'Frost shot', key: '5', hull: 0.6, crew: 0, rakeCrew: 0, range: 28, reloadMul: 1.1, spreadMul: 1.1, pad: 0.4, top: 3.8, status: 'frost' },
  stink: { name: 'Stink shot', key: '6', hull: 0.2, crew: 0, rakeCrew: 0, range: 22, reloadMul: 1.2, spreadMul: 1.5, pad: 0.8, top: 5.0, status: 'stink' },
});

/** §2.5: a recipe's price and the progress that puts it on sale (`unlocked` ≥ sale: the level before is cleared). */
export const RECIPES = freeze({ fire: { price: 300, sale: 4 }, frost: { price: 300, sale: 6 }, stink: { price: 500, sale: 7 } });

/**
 * §2.5: loads at every level start for each recipe owned (base + the Powder Windmill's windmill[tier], §8.1);
 * a powder crate gives `crate` load of the owned special with the fewest, or `crateGold` with none owned, when
 * you sail within `crateReach` u of it.
 */
export const LOADS = freeze({ base: 4, windmill: [0, 1, 2, 3], crate: 1, crateGold: 20, crateReach: 3 });

/**
 * §2.2: what each status does and how long it lasts.
 * fire: burns dps hp/s for time s (a boss: `boss` s). frost: speed cap × speed, turning × turn for time s; hit
 * again + add s, at most max s; a boss × bossMul on all three. stink: speed and turning 0, no firing, boarding,
 * ram or mortar for time s (a boss `boss` s), she coasts to a stop at decel × her accel, her crew fights at
 * grit ×; then immune (bossImmune) s of clothes-pegs. kaboom: fire on a stinky ship bursts the cloud for burst.
 */
export const STATUS = freeze({
  fire: { dps: 3, time: 6, boss: 3 },
  frost: { speed: 0.5, turn: 0.6, time: 5, add: 2, max: 8, bossMul: 0.5 },
  stink: { time: 4, boss: 2, immune: 10, bossImmune: 20, grit: 0.75, decel: 2 },
  kaboom: { burst: 15 },
});

/** §2.2: the only two immunities (ship type → the status ids she shrugs off); their words are WORDS3.immune. */
export const IMMUNE = freeze({ inferno: ['fire'], phantom: ['stink'] });

// Word helpers (the templates in WORDS3 take junk without throwing).
const nameOf = (id) => (isSpecial(id) ? SPECIAL[id].name : 'Special shot');
const shortOf = (id) => nameOf(id).replace(/ shot$/, '');
const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
const secs = (v) => String(Math.round(v * 100) / 100);
// "The Iron Turtle" from 'Iron Turtle' (type names like 'The Molten Maw' already have it).
const the = (ship) => {
  const n = typeof ship === 'string' && ship.trim() ? ship.trim() : 'ship';
  return /^the /i.test(n) ? 'The' + n.slice(3) : `The ${n}`;
};
const SALE_AFTER = { fire: 'the Volcano', frost: 'Frostbite Straits', stink: 'the Maelstrom' };
const tip = (id, keys, after) => ({
  keys: `${keys} Press <kbd>${SPECIAL[id].key}</kbd>${after}`,
  touch: `${keys} Tap Ammo${after}`,
});

/**
 * Every new pop and hint word of special ammo (§2.2–2.7, §6.1–6.5), so every screen says the same thing.
 * The strings are pop words; the functions are templates (ids, counts and ship names in, a string out).
 */
export const WORDS3 = freeze({
  // pops (pops.js styles fire / frost / stink; IMMUNE! is style info)
  fire: 'ON FIRE!',
  frost: 'FROZEN!',
  stink: 'STINKY!',
  pegs: 'Clothes-pegs!',
  kaboom: 'KA-BOOM!',
  fireOut: 'FIRE OUT! SSSS!',
  doused: 'FIRE OUT!',
  immunePop: 'IMMUNE!',
  clang: 'CLANG!',
  // the status badge's word beside its shape (#boss-status, §6.3: shape + word, never colour alone)
  badge: { fire: 'ON FIRE', frost: 'FROZEN', stink: 'STINKY' },
  // why an immune ship shrugs a shot off (by ship type), and the rumour-board line once that recipe is owned
  immune: { inferno: 'The Maw laughs at fire!', phantom: "Ghosts can't smell!" },
  powderTip: { fire: 'Powder tip: The Maw laughs at fire!', stink: "Powder tip: Ghosts can't smell!" },
  // boarding
  hot: 'Too hot to board! Wait for the fire to go out.',
  hotShip: 'Too hot to board! Freeze her first.', // a fire ship that hasn't struck (§4.2)
  ropes: 'Ropes dropped!', // a stinky raider's or skiff's biting hooks
  stinkBoard: 'Stink, then board!', // the boarding preview while she is stinky
  boardHot: (t) => `HOT! ${Math.max(1, Math.ceil(time(t) - EPS))} s`, // the Board cell: seconds left of her fire
  boardPill: 'Hot!', // the touch Board pill on a burning target (§6.2)
  // ammo (keys 4–6, the tray, the Ammo cell, the out-of-loads fallback, powder crates)
  saleAfter: SALE_AFTER,
  cell: (id, n) => `${shortOf(id)} ×${num(n)}`, // "Fire ×4"
  count: (n) => `×${num(n)}`, // #ammo-count after the ammo's name (§6.3)
  // the tavern's Powder room rows (§2.5): what each recipe does, said before it is bought (no hidden traps)
  blurb: {
    fire: `Balls wrapped in burning pitch: she burns for ${secs(STATUS.fire.time)} s. You can't board a burning ship.`,
    frost: `Icy balls that freeze her sails: she sails at half speed and turns slowly for ${secs(STATUS.frost.time)} s.`,
    stink: `Clay pots of rotten fish: she can't move or shoot for ${secs(STATUS.stink.time)} s. Then sail round and rake her!`,
  },
  loaded: (id, n) => `${nameOf(id)} loaded, ${num(n)} load${num(n) === 1 ? '' : 's'} left`,
  buy: (id) => `Buy ${nameOf(id)} at the Salty Sparrow`,
  locked: (id) => (isSpecial(id) ? `${nameOf(id)} goes on sale after ${SALE_AFTER[id]}` : ''),
  empty: (id) => `No ${nameOf(id)} left this level`,
  out: (id) => `Out of ${nameOf(id)}! Round shot loaded.`,
  crate: (id) => `+${LOADS.crate} ${nameOf(id).toUpperCase()}!`, // "+1 FROST SHOT!"
  crateGold: (gold) => `+${num(gold)} gold`,
  // #game-live (ship names as in SHIP_TYPES)
  live: {
    fire: (ship) => `${the(ship)} is on fire`,
    frost: (ship) => `${the(ship)} is frozen`,
    stink: (ship) => `${the(ship)} stinks! She can't move`,
    kaboom: (ship) => `KA-BOOM! ${the(ship)}'s stink cloud blew up`,
    fireOut: (ship) => `${the(ship)}'s fire is out`,
    pegs: (ship) => `${the(ship)}'s crew have clothes-pegs on their noses! Stink won't work for a while`,
  },
  // the one-time tips at the first level start with each recipe owned (§6.5 bits 256 / 512 / 1024)
  tips: {
    fire: tip('fire', `New: Fire shot burns for ${secs(STATUS.fire.time)} s!`, ". You can't board a burning ship."),
    frost: tip('frost', 'New: Frost shot slows ships down!', ''),
    stink: tip('stink', `New: Stink shot! They can't move or shoot for ${secs(STATUS.stink.time)} s.`, ''),
  },
});

// ---------------------------------------------------------------------------------------- shots

/** Is this one of the three special shots? */
export function isSpecial(id) {
  return typeof id === 'string' && SPECIAL_IDS.includes(id);
}

/** Is this recipe on sale with `unlocked` levels open (§2.1: Fire from 4, Frost from 6, Stink from 7)? */
export function onSale(id, unlocked) {
  return isSpecial(id) && typeof unlocked === 'number' && unlocked >= RECIPES[id].sale;
}

/** Does this ship type shrug that status off (§2.2: the Molten Maw fire, the Phantom stink)? */
export function isImmune(typeKey, id) {
  return typeof typeKey === 'string' && Object.prototype.hasOwnProperty.call(IMMUNE, typeKey) && IMMUNE[typeKey].includes(id);
}

/**
 * §2.6: a round-shot result (combat.js shotResult, run with ammo 'round') turned into this special's: dmg ×
 * SPECIAL[id].hull, critEffect null (a crit still does ×1.75 and pops CRIT!), crewKill 0, slow false, and
 * status: the status to apply ('fire' | 'frost' | 'stink'); also special (the id) and hullMul. A fresh object:
 * info is never changed. An id that isn't special gives a copy of info unchanged.
 */
export function specialShot(info, id) {
  let out;
  try {
    out = isRecord(info) ? { ...info } : {};
  } catch {
    out = {}; // a hostile getter or proxy
  }
  if (Array.isArray(out.tags)) out.tags = out.tags.slice();
  if (!isSpecial(id)) return out;
  const s = SPECIAL[id];
  out.dmg = tidy(clamp(finite(field(info, 'dmg'), 0), 0, MAX_DAMAGE) * s.hull);
  out.critEffect = null;
  out.crewKill = s.crew;
  out.slow = false;
  out.status = s.status;
  out.special = id;
  out.hullMul = s.hull;
  if (!Array.isArray(out.tags)) out.tags = [];
  return out;
}

// ---------------------------------------------------------------------------------------- statuses

/** A ship's status record: `id` null means no status. */
export function newStatus() {
  return { id: null, t: 0, max: 0, immune: 0 };
}

// Any status-ish value → a clean record (the four fields, + pegs while stinky).
function readStatus(st) {
  const raw = field(st, 'id');
  const id = isSpecial(raw) ? raw : null;
  const t = time(field(st, 't'));
  const immune = time(field(st, 'immune'));
  const pegsRaw = time(field(st, 'pegs'));
  const pegs = pegsRaw > 0 ? pegsRaw : STATUS.stink.immune;
  if (!id || t <= EPS) {
    // a stink that ran out without being stepped still leaves its clothes-pegs behind
    return { id: null, t: 0, max: 0, immune: id === 'stink' ? Math.max(immune, pegs) : immune };
  }
  const max = Math.max(t, time(field(st, 'max')));
  return id === 'stink' ? { id, t, max, immune, pegs } : { id, t, max, immune };
}

const SFX = { fire: 'ignite', frost: 'freeze', stink: 'stink' };

/**
 * Put status `id` on a ship (§2.2, §2.3). opts: { typeKey (SHIP_TYPES key), boss (type.boss), burning (optional:
 * main's shared burn is running, e.g. a POWDER KEG, so frost puts that fire out too) }.
 * Returns { st, events, burst, burn, stopBurn, pop, why, sfx }:
 *   st       the new status record (st itself is never changed)
 *   events   'applied' (a status took hold), 'extended' (the same one hit again: fire restarts, frost + add s),
 *            'kaboom' (fire on a stinky ship), 'fireOut' (frost on a burning ship), 'immune' (her type shrugs it
 *            off), 'pegs' (a stink inside the clothes-peg window): e.g. ['kaboom', 'applied']; [] = nothing
 *            happened (stink on a stinky ship, frost already at its cap)
 *   burst    damage at once (KA-BOOM: STATUS.kaboom.burst, ignores armour), else 0
 *   burn     { rate, time } of a burn to start (merge it with mergeBurn: one burn per ship), else null
 *   stopBurn the fire is out (frost on a burning ship, or the fire replaced): stop the ship's burn
 *   pop      the one pop word (WORDS3), or null;  why: the immune reason (#game-live), or null
 *   sfx      the sound ('ignite' | 'freeze' | 'stink' | 'blast' | 'sizzle'), or null
 * Every other combination replaces the old status; a stink that ends any way (time, replaced, KA-BOOM) starts
 * her clothes-peg window.
 */
export function applyStatus(st, id, opts) {
  const cur = readStatus(st);
  const typeKey = field(opts, 'typeKey');
  const boss = !!field(opts, 'boss');
  const burning = !!field(opts, 'burning');
  const out = { st: cur, events: [], burst: 0, burn: null, stopBurn: false, pop: null, why: null, sfx: null };
  if (!isSpecial(id)) return out;
  const ev = out.events;
  if (isImmune(typeKey, id)) {
    ev.push('immune');
    out.pop = WORDS3.immunePop;
    out.why = WORDS3.immune[typeKey];
    return out;
  }
  // the clothes-peg window this stink would leave behind, if she is stinky now
  const pegsNow = cur.id === 'stink' ? cur.pegs : cur.immune;
  if (id === 'stink') {
    if (cur.id === 'stink') return out; // hit again: no change
    if (cur.immune > EPS) {
      ev.push('pegs');
      out.pop = WORDS3.pegs;
      return out;
    }
    const t = boss ? STATUS.stink.boss : STATUS.stink.time;
    out.stopBurn = cur.id === 'fire';
    out.st = { id: 'stink', t, max: t, immune: 0, pegs: boss ? STATUS.stink.bossImmune : STATUS.stink.immune };
    ev.push('applied');
  } else if (id === 'fire') {
    const t = boss ? STATUS.fire.boss : STATUS.fire.time;
    if (cur.id === 'stink') {
      ev.push('kaboom', 'applied');
      out.burst = STATUS.kaboom.burst;
    } else ev.push(cur.id === 'fire' ? 'extended' : 'applied');
    out.st = { id: 'fire', t, max: t, immune: pegsNow };
    out.burn = { rate: STATUS.fire.dps, time: t };
  } else {
    const k = boss ? STATUS.frost.bossMul : 1;
    const t0 = STATUS.frost.time * k;
    const add = STATUS.frost.add * k;
    const cap = STATUS.frost.max * k;
    const fireOut = cur.id === 'fire' || burning;
    if (fireOut) {
      ev.push('fireOut');
      out.stopBurn = true;
    }
    if (cur.id === 'frost') {
      const t = Math.max(cur.t, Math.min(cap, cur.t + add));
      if (t > cur.t + EPS) {
        ev.push('extended');
        out.st = { id: 'frost', t, max: t, immune: cur.immune };
      }
    } else {
      out.st = { id: 'frost', t: t0, max: t0, immune: pegsNow };
      ev.push('applied');
    }
  }
  const has = (e) => ev.includes(e);
  if (has('kaboom')) {
    out.pop = WORDS3.kaboom;
    out.sfx = 'blast';
  } else if (has('fireOut')) {
    out.pop = WORDS3.fireOut;
    out.sfx = 'sizzle';
  } else if (has('applied') || has('extended')) {
    out.pop = WORDS3[id];
    out.sfx = SFX[id];
  }
  return out;
}

/**
 * Run a status for dt simulated seconds. Returns { st, ended }: ended is the id that just ran out (else null).
 * When a stink ends its clothes-peg window starts; the window only runs while she isn't stinky.
 */
export function stepStatus(st, dt) {
  const cur = readStatus(st);
  const d = time(dt);
  const wear = (v) => (v - d > EPS ? v - d : 0);
  if (!cur.id) return { st: { id: null, t: 0, max: 0, immune: wear(cur.immune) }, ended: null };
  const t = cur.t - d;
  if (t > EPS) {
    const next = { ...cur, t };
    if (cur.id !== 'stink') next.immune = wear(cur.immune);
    return { st: next, ended: null };
  }
  const over = Math.max(0, -t); // the part of dt after it ran out
  const immune = cur.id === 'stink' ? (cur.pegs - over > EPS ? cur.pegs - over : 0) : wear(cur.immune);
  return { st: { id: null, t: 0, max: 0, immune }, ended: cur.id };
}

// What each status does now (frozen, shared: callers only read them).
const MULS = freeze({
  none: { speed: 1, turn: 1, noFire: false, noBoard: false, noRam: false, noMortar: false, grit: 1, noGrapple: false, noRegen: false, decel: 1 },
  fire: { speed: 1, turn: 1, noFire: false, noBoard: false, noRam: false, noMortar: false, grit: 1, noGrapple: true, noRegen: true, decel: 1 },
  frost: {
    speed: STATUS.frost.speed, turn: STATUS.frost.turn, noFire: false, noBoard: false, noRam: false, noMortar: false, grit: 1, noGrapple: false,
    noRegen: false, decel: 1,
  },
  stink: {
    speed: 0, turn: 0, noFire: true, noBoard: true, noRam: true, noMortar: true, grit: STATUS.stink.grit, noGrapple: false, noRegen: false,
    decel: STATUS.stink.decel,
  },
});

/**
 * What a status does to a ship now (§2.2): speed (× her speed cap) and turn (× her turning) join the "smallest
 * multiplier wins" rule; noFire, noBoard (no boarding attempt; a raider's biting hooks drop), noRam, noMortar;
 * grit (× her crew's grit in a boarding); noGrapple (you can't board her: she burns); noRegen; decel (× her accel
 * while she coasts to her new cap). A shared frozen object: read it, don't change it.
 */
export function statusMuls(st) {
  // main calls this several times a ship every 1/120 s step, so it reads the two fields it needs and makes
  // nothing (the same answer as readStatus(st).id)
  const id = field(st, 'id');
  if (!isSpecial(id)) return MULS.none;
  const t = field(st, 't');
  return typeof t === 'number' && Number.isFinite(t) && t > EPS ? MULS[id] : MULS.none;
}

/**
 * Water puts out fire (§2.3: a rogue wave, a waterspout's core): { st, doused }. opts.burning (optional): her
 * shared burn is running (a POWDER KEG), which water puts out too. doused: stop her burn and pop FIRE OUT!.
 */
export function douse(st, opts) {
  const cur = readStatus(st);
  if (cur.id === 'fire') return { st: { id: null, t: 0, max: 0, immune: cur.immune }, doused: true };
  return { st: cur, doused: !!field(opts, 'burning') };
}

/**
 * §2.2 "one burn per ship": Fire and the POWDER KEG crit share one burn. cur = what burns now { rate, hp } (hp
 * left to burn, whole ticks; none: null or hp 0), next = a new burn { rate, time } (applyStatus().burn, or the keg
 * EFFECTS.keg.dps for its time). The one with more hp left to burn wins (a tie: the new one, so a fresh hit
 * restarts it). Returns { rate, hp, time, took } (took: the new burn won).
 */
export function mergeBurn(cur, next) {
  const rate = (v) => clamp(finite(v, 0), 0, MAX_RATE);
  const curRate = rate(field(cur, 'rate'));
  const curHp = clamp(Math.floor(finite(field(cur, 'hp'), 0)), 0, MAX_DAMAGE);
  const nextRate = rate(field(next, 'rate'));
  const nextTime = time(field(next, 'time'));
  const nextHp = Math.min(MAX_DAMAGE, Math.floor(nextRate * nextTime + 0.5 + EPS));
  if (nextHp > 0 && nextHp >= curHp) return { rate: nextRate, hp: nextHp, time: nextTime, took: true };
  return { rate: curRate, hp: curHp, time: curRate > 0 ? tidy(curHp / curRate) : 0, took: false };
}

// ---------------------------------------------------------------------------------------- loads

function readLoads(loads) {
  const out = {};
  for (const id of SPECIAL_IDS) out[id] = loadCount(field(loads, id));
  return out;
}

/** Loads at a level start (§2.5): LOADS.base + LOADS.windmill[tier] of each recipe owned, 0 of the others. */
export function startLoads(powder, windmillTier) {
  const p = parsePowder(powder);
  const top = LOADS.windmill.length - 1;
  const tier = typeof windmillTier === 'number' && Number.isFinite(windmillTier) ? clamp(Math.floor(windmillTier), 0, top) : 0;
  const n = LOADS.base + LOADS.windmill[tier];
  const out = {};
  for (const id of SPECIAL_IDS) out[id] = p.own[id] === 1 ? n : 0;
  return out;
}

/**
 * Spend one load of `id`: one broadside of one side, whatever the guns (Space fires both sides: each side that
 * fires a special spends one). { loads, ok }: ok false (loads unchanged) when there is none left, so that side
 * fires round shot instead (main: state.ammo = 'round' directly, hint WORDS3.out(id)), or the id isn't special.
 */
export function spendLoad(loads, id) {
  const l = readLoads(loads);
  if (!isSpecial(id) || l[id] < 1) return { loads: l, ok: false };
  l[id] -= 1;
  return { loads: l, ok: true };
}

/**
 * A powder crate picked up (§2.5): +LOADS.crate load of the owned special with the fewest loads (a tie: the
 * first in SPECIAL_IDS), pop WORDS3.crate(id); with no recipe owned, LOADS.crateGold gold instead (id null).
 */
export function crateLoad(loads, powder) {
  const l = readLoads(loads);
  const p = parsePowder(powder);
  let pick = null;
  for (const id of SPECIAL_IDS) if (p.own[id] === 1 && (pick === null || l[id] < l[pick])) pick = id;
  if (pick === null) return { loads: l, id: null, gold: LOADS.crateGold };
  l[pick] = Math.min(MAX_LOADS, l[pick] + LOADS.crate);
  return { loads: l, id: pick, gold: 0 };
}

/**
 * Can this special be loaded now (keys 4–6, R, the tray)? opts: { powder, loads, unlocked }.
 * { ok, reason, word }: reason null | 'unknown' (not a special) | 'locked' (not on sale yet) | 'notOwned' (on sale,
 * not bought) | 'empty' (no loads left this level); word: the hint (or, when ok, "Fire shot loaded, 4 loads left").
 */
export function ammoReady(id, opts) {
  if (!isSpecial(id)) return { ok: false, reason: 'unknown', word: '' };
  const p = parsePowder(field(opts, 'powder'));
  if (p.own[id] !== 1) {
    if (!onSale(id, field(opts, 'unlocked'))) return { ok: false, reason: 'locked', word: WORDS3.locked(id) };
    return { ok: false, reason: 'notOwned', word: WORDS3.buy(id) };
  }
  const n = readLoads(field(opts, 'loads'))[id];
  if (n < 1) return { ok: false, reason: 'empty', word: WORDS3.empty(id) };
  return { ok: true, reason: null, word: WORDS3.loaded(id, n) };
}

// ---------------------------------------------------------------------------------------- the powder record

const MAX_RAW = 4096; // §10.1: ≤ 4 KB (a real record is 45 characters)
const PLAIN_INT = /^-?\d{1,16}$/;

/** The powder record (§10.1): which recipes are owned (1) or not (0). A fresh object every call. */
export function defaultPowder() {
  return { v: 1, own: { fire: 0, frost: 0, stink: 0 } };
}

// A stored flag: a plain integer (number or digit string) that is 0 or 1; anything else is 0.
function readBit(v) {
  let n = null;
  if (typeof v === 'number' && Number.isSafeInteger(v)) n = v;
  else if (typeof v === 'string' && PLAIN_INT.test(v.trim())) n = Number(v.trim());
  return n === 1 ? 1 : 0;
}

// Number literals that are not plain integers in the JSON text ("1e0", "1.0") are rejected too, where the
// engine tells the reviver the source text (as upgrades.js does).
const BAD = Symbol('bad');
function reviver(key, value, context) {
  if (typeof value === 'number' && context && typeof context.source === 'string' && !PLAIN_INT.test(context.source)) return BAD;
  return value;
}

function cleanPowder(obj) {
  const p = defaultPowder();
  if (!isRecord(obj)) return p;
  const own = ownField(obj, 'own');
  if (isRecord(own)) for (const id of SPECIAL_IDS) p.own[id] = readBit(ownField(own, id));
  return p;
}

/**
 * Read a stored powder record (the string from storage, or null; a record object is validated the same way).
 * Never throws: ≤ 4 KB, JSON, each flag a plain integer 0 or 1 (else 0), own properties only, unknown fields
 * dropped; unreadable input gives the default.
 */
export function parsePowder(raw) {
  try {
    if (typeof raw === 'string') {
      if (raw.length > MAX_RAW) return defaultPowder();
      let obj = JSON.parse(raw); // bad JSON -> catch -> the default
      try {
        obj = JSON.parse(raw, reviver); // a reviver recurses, so very deep junk could overflow it
      } catch {
        // keep the plain parse
      }
      return cleanPowder(obj);
    }
    return cleanPowder(raw);
  } catch {
    return defaultPowder();
  }
}

/** JSON for storage, validated first: always {"v":1,"own":{"fire":f,"frost":f,"stink":f}}. */
export function serializePowder(p) {
  const c = parsePowder(p);
  return JSON.stringify({ v: 1, own: c.own });
}

/** Two tabs (§10.2): owned only goes up, so the merge of two records owns what either owns. */
export function mergePowder(a, b) {
  const pa = parsePowder(a);
  const pb = parsePowder(b);
  const out = defaultPowder();
  for (const id of SPECIAL_IDS) out.own[id] = pa.own[id] === 1 || pb.own[id] === 1 ? 1 : 0;
  return out;
}

/**
 * Buy a recipe from the chest (§2.5, the tavern's Powder room). purse: the gold in the chest.
 * { ok, powder, cost, reason }: ok → powder owns it and cost is its price (take it from the chest only after the
 * record is saved, §0.1); else cost 0, powder unchanged, reason 'unknown' | 'owned' | 'locked' (not on sale) |
 * 'poor'. powder is always a fresh, validated record.
 */
export function buyRecipe(powder, purse, id, unlocked) {
  const p = parsePowder(powder);
  const no = (reason) => ({ ok: false, powder: p, cost: 0, reason });
  if (!isSpecial(id)) return no('unknown');
  if (p.own[id] === 1) return no('owned');
  if (!onSale(id, unlocked)) return no('locked');
  const price = RECIPES[id].price;
  if (!(typeof purse === 'number' && purse >= price)) return no('poor');
  p.own[id] = 1;
  return { ok: true, powder: p, cost: price, reason: null };
}
