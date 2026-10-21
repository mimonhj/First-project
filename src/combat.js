// Combat rules of the "Boarders Away!" update (SPEC2 §2, §3): where and how a cannonball hurts
// (range, rakes, crits, ammo, the Phantom's ghost crew), crew and surrender, boarding odds and
// their resolution, capture and plunder gold.
//
// Pure: no three.js, imports nothing (the Node tests load it as a data: URL, like upgrades.js).
// Every number lives in exactly one table below (§3.8), so balance changes touch one place;
// main.js and boarding.js apply the results.
//
// Conventions (§0.1): a ship with heading h faces (sin h, cos h); `along` > 0 is toward her bow.
// Every function takes junk (missing fields, NaN, wrong types, throwing getters) without throwing
// and still returns well-formed, finite results (the one infinity is R for a defender with no crew).

// ---------------------------------------------------------------------------------------- tables

function freeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v);
  return Object.freeze(o);
}

/** Range fall-off (§2.1): ×1.25 point blank (≤ 10), full damage 14..24, down to ×0.75 from 34 on. */
export const RANGE = freeze({ pointBlank: 10, pointBlankMul: 1.25, fadeEnd: 14, falloffStart: 24, falloffEnd: 34, falloffMin: 0.75 });

/** A rake: the ball flies within acos(0.8) ≈ 36.9° of her keel. Entering at the stern ×2, at the bow ×1.5. */
export const RAKE = freeze({ cos: 0.8, stern: 2.0, bow: 1.5 });

/**
 * Crits (§2.3), player shots only. Chance = base[Master gunner tier] + stern/bow rake + point blank,
 * capped. effectGap: seconds between two new effects on one target; bosses keep effects for
 * bossDuration × their time; hitStop: frame dt × scale for `time` s of real time, at most once per `gap` s.
 */
export const CRIT = freeze({
  base: [0.06, 0.09, 0.12, 0.15], stern: 0.12, bow: 0.06, pointBlank: 0.05, cap: 0.35, mul: 1.75,
  effectGap: 3, bossDuration: 0.5, hitStop: { scale: 0.1, time: 0.07, gap: 0.5 },
});

/**
 * What a crit (or a chain-shot hit) does to her (§2.2, §2.3). turn/speed are multipliers on top of
 * speedCap() (the smallest active one wins), time in seconds. keg: `burst` damage at once (× the shot's
 * ghostMul), then `dps` for `time` s. routed: extra crew killed. chain: per hit, refreshed, at most `max` s.
 */
export const EFFECTS = freeze({
  rudder: { turn: 0.25, time: 6 },
  mast: { speed: 0.5, time: 8 },
  keg: { burst: 12, dps: 2, time: 4 },
  routed: { crew: 2 },
  chain: { speed: 0.55, turn: 0.7, time: 6, max: 10 },
});

/** Visible damage (§2.4): battered below 60 % hull, wrecked below 30 %. */
export const STATES = freeze({ battered: 0.6, wrecked: 0.3 });

/**
 * Ammo (§2.2), player only (enemies always fire round shot). hull: damage factor; crew: sailors killed
 * per hit (+ rakeCrew on a rake); range: flight clamp; reloadMul, spreadMul: on the ship's reload and aim
 * spread; pad / top: hitsShip() padding and height; unlock: needs state.unlocked ≥ unlock.
 */
export const AMMO = freeze({
  round: { hull: 1, crew: 0, rakeCrew: 0, range: 34, reloadMul: 1, spreadMul: 1, pad: 0.3, top: 3.8, unlock: 1 },
  chain: { hull: 0.4, crew: 0, rakeCrew: 0, range: 26, reloadMul: 1.15, spreadMul: 1.2, pad: 0.8, top: 9, unlock: 2 },
  grape: { hull: 0.3, crew: 1, rakeCrew: 1, range: 20, reloadMul: 0.85, spreadMul: 2.5, pad: 0.6, top: 3.8, unlock: 3 },
});

/** Ammo in cycling order (R, 1 / 2 / 3, the touch Ammo pill). */
export const AMMO_IDS = freeze(['round', 'chain', 'grape']);

/** Switching ammo: each side's reload becomes max(current, AMMO_SWAP). */
export const AMMO_SWAP = 0.5;

/** Round and chain shot on the Phantom while her ghost crew stands (grape ×1). */
export const GHOST = freeze({ hullMul: 0.5 });

/**
 * Crew (§3.1). Hull damage thins an enemy crew by up to hullShare of it; she strikes at strike × crew0
 * (the surrender notch); the player needs minToBoard hands to grapple and gets waveRefill hands with the
 * reinforcements and captureRefill per capture.
 */
export const CREW = freeze({ hullShare: 0.5, strike: 0.2, minToBoard: 3, waveRefill: 3, captureRefill: 2 });

/**
 * Boarding (§3.2–3.4). range / reel by Long grapples tier; the odds formula's slope, minFrac, lossK, minR,
 * homeDefence, enemyMorale; fightAt: the FIGHT! label; phases in simulated seconds.
 * homeLossCap (not in the §3.8 listing, from §3.3): a player defending its own deck loses at most
 * ceil(homeLossCap × crew) hands.
 */
export const BOARD = freeze({
  cooldown: 6, range: [14, 17, 20], lenFactor: 0.25, reel: [1.2, 1.0, 0.8], heaveStep: 0.04, heaveMax: 0.2,
  slope: 0.45, minFrac: 0.15, lossK: 0.3, minR: 0.5, hullPerKill: 2, homeDefence: 1.5, enemyMorale: 0.5,
  fightAt: 1.2, slotGap: 0.7, glueSpeed: 2, pushApart: { speed: 4, time: 1 }, breakFree: 3,
  phases: { hook: 0.45, swing: 0.7, brawl: 2.0, result: 0.65 }, partyShown: 4, defendersShown: 4,
  homeLossCap: 0.6,
});

/**
 * Raiders that board you (§3.6). Not in the §3.8 listing (main.js's RAID_GAP / RAID_SHEER, moved here so raider
 * balance lives in one table): gap: after any boarding, s before a raider may throw its hooks again (on top of
 * its own cooldown); sheer: a raider whose ropes were cut (or who was beaten off) sheers away and circles wide
 * until its own cooldown is down to this many s.
 */
export const RAIDERS = freeze({
  reach: 10, threat: 1.5, reel: 1.0, cutTaps: 3, cutHold: 0.8, cooldownCut: 10, cooldownFight: 12, minCrew: 4,
  plunder: 0.25, counterWindow: 3, beside: 6,
  gap: 3, sheer: 4,
});

/** Capture (§3.7): type.gold × goldMul + flat at once, hull and crew back, a prize bonus at level end. */
export const CAPTURE = freeze({ goldMul: 20, flat: 25, hull: 15, crew: 2, prizeBonus: 50, sailAway: 5, sailSpeed: 7 });

// The pop words (§2.3, §2.5) and preview labels (§3.3), so every screen says the same thing.
// The rake words follow the RAKE table. (An addition to the §9.1 export list.)
const times = (v) => String(Math.round(v * 100) / 100);
export const WORDS = freeze({
  stern: `STERN RAKE ×${times(RAKE.stern)}!`,
  bow: `BOW RAKE ×${times(RAKE.bow)}!`,
  pointBlank: 'POINT BLANK!',
  crit: 'CRIT!',
  chain: 'SAILS SHREDDED!',
  rudder: 'RUDDER SMASHED!',
  mast: 'MAST DOWN!',
  keg: 'POWDER KEG!',
  routed: 'CREW ROUTED!',
  capture: 'CAPTURE!',
  fight: 'FIGHT!',
  risky: 'RISKY!',
  take: 'TAKE HER!',
});

const EFFECT_IDS = ['rudder', 'mast', 'keg', 'routed'];

// ---------------------------------------------------------------------------------------- helpers

// Float noise is dropped where the spec states decimals: 0.06 + 0.12 + 0.05 is 0.22999999999999998,
// 12 × 0.5 × 0.6 is 3.5999999999999996 (which must floor to 3, and does: the noise is far below EPS).
const EPS = 1e-9;
const tidy = (v) => Math.round(v * 1e9) / 1e9;
const roundHalfUp = (v) => Math.floor(v + 0.5 + EPS);
const floorTidy = (v) => Math.floor(v + EPS);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const finite = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

// Caps that keep junk finite (no real ship comes near them).
const MAX_DAMAGE = 1e6;
const MAX_CREW = 1e4;
const MAX_STRENGTH = 100;
const MAX_GOLD = 1e9;

// Read one field; a non-object, a throwing getter or a hostile proxy just counts as missing.
function field(o, k) {
  if (o === null || (typeof o !== 'object' && typeof o !== 'function')) return undefined;
  try {
    return o[k];
  } catch {
    return undefined;
  }
}

// A head count: a whole number ≥ 0 (fractions round down; junk is 0).
const count = (v) => (typeof v === 'number' && Number.isFinite(v) ? clamp(Math.floor(v), 0, MAX_CREW) : 0);

const ammoId = (id) => (typeof id === 'string' && Object.prototype.hasOwnProperty.call(AMMO, id) ? id : null);

// ---------------------------------------------------------------------------------------- shots

/** A seedable PRNG (mulberry32): the same seed always gives the same numbers in [0, 1). */
export function mulberry32(seed) {
  let a = finite(seed, 0) >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Damage factor for a ball that flew `dist` from the muzzle (§2.1): 1.25 point blank … 0.75 at long range. */
export function rangeMul(dist) {
  if (typeof dist !== 'number' || Number.isNaN(dist)) return 1;
  const r = RANGE;
  if (dist <= r.pointBlank) return r.pointBlankMul;
  if (dist < r.fadeEnd) return tidy(r.pointBlankMul - ((r.pointBlankMul - 1) * (dist - r.pointBlank)) / (r.fadeEnd - r.pointBlank));
  if (dist <= r.falloffStart) return 1;
  if (dist < r.falloffEnd) return tidy(1 - ((1 - r.falloffMin) * (dist - r.falloffStart)) / (r.falloffEnd - r.falloffStart));
  return r.falloffMin;
}

/**
 * Which way a ball with velocity (vx, vz) meets a ship heading targetH. cos is the cosine between the
 * ball's flight and her heading: ≥ 0.8 it flies the way she faces, so it came in over her stern
 * ('stern'); ≤ −0.8 it came in over her bow ('bow'); anything else hits her side (null).
 */
export function aspectOf(vx, vz, targetH) {
  const x = finite(vx, 0);
  const z = finite(vz, 0);
  const h = finite(targetH, 0);
  const speed = Math.hypot(x, z);
  if (!(speed > 0) || !Number.isFinite(speed)) return { aspect: null, cos: 0 };
  const cos = clamp((x * Math.sin(h) + z * Math.cos(h)) / speed, -1, 1);
  if (!Number.isFinite(cos)) return { aspect: null, cos: 0 };
  const aspect = Math.abs(cos) >= RAKE.cos - EPS ? (cos > 0 ? 'stern' : 'bow') : null;
  return { aspect, cos };
}

/** Hit zone from the impact's `along` (ship-local, bow +): beyond len/6 'bow', below −len/6 'stern', else 'mid'. */
export function hitZone(along, len) {
  const a = finite(along, 0);
  const edge = Math.max(0, finite(len, 0)) / 6;
  return a > edge ? 'bow' : a < -edge ? 'stern' : 'mid';
}

/** Crit chance of a player shot: critBase (Master gunner) + rake + point blank, capped at CRIT.cap. */
export function critChance(opts) {
  let p = clamp(finite(field(opts, 'critBase'), CRIT.base[0]), 0, CRIT.cap);
  const aspect = field(opts, 'aspect');
  if (aspect === 'stern') p += CRIT.stern;
  else if (aspect === 'bow') p += CRIT.bow;
  const dist = field(opts, 'dist');
  if (typeof dist === 'number' && dist <= RANGE.pointBlank) p += CRIT.pointBlank;
  return tidy(Math.min(CRIT.cap, p));
}

/** Whether an ammo is unlocked with this much progress (state.unlocked); round shot always is. */
export function ammoUnlocked(id, unlockedLevel) {
  const a = ammoId(id);
  if (!a) return false;
  return AMMO[a].unlock <= 1 || finite(unlockedLevel, 0) >= AMMO[a].unlock;
}

/** The crit effect of a ball (§2.3): chain → mast, grape → routed, round by zone (stern rudder, mid mast, bow keg). */
export function effectFor(opts) {
  const ammo = field(opts, 'ammo');
  if (ammo === 'chain') return 'mast';
  if (ammo === 'grape') return 'routed';
  const zone = field(opts, 'zone');
  return zone === 'stern' ? 'rudder' : zone === 'bow' ? 'keg' : 'mast';
}

/**
 * Everything about one ball that hit a ship (§2.1):
 *   dmg = base × AMMO[ammo].hull × rangeMul(dist) × aspectMul × critMul × ghostMul   (not rounded)
 * opts: { ammo, base (shooter's type.dmg), dist (muzzle to impact), vx, vz (ball velocity),
 *         target: { h, len, ghost (her ghost crew stands), boss }, along (impact, ship-local),
 *         shooter: { player, critBase } | { player: false, enemyRake (level, 0..1) },
 *         rng (() => [0, 1), one draw per player shot), force (tests) }
 * force: null | 'none' (never crits) | 'crit' (crits with the natural effect) | 'rudder' | 'mast' |
 * 'keg' | 'routed' (crits with that effect); a forced shot draws no number. Enemies never crit and
 * draw no number. Without an rng function a player shot does not crit.
 * Returns { dmg, rangeMul, aspect, aspectMul, pointBlank, crit, critEffect, zone, crewKill, slow, tags,
 * critMul, ghostMul }. crewKill is the ammo's kill (grape 1, 2 on a rake) WITHOUT the routed bonus and dmg
 * is WITHOUT the keg burst: main adds those when it applies the effect (one new effect per 3 s).
 * tags: the hitmark stickers, e.g. ['RAKE ×2', 'CRIT!', 'POINT BLANK'].
 */
export function shotResult(opts) {
  const ammo = ammoId(field(opts, 'ammo')) || 'round';
  const kind = AMMO[ammo];
  const base = clamp(finite(field(opts, 'base'), 0), 0, MAX_DAMAGE);
  const rawDist = field(opts, 'dist');
  // An unknown distance counts as mid range (×1, not point blank).
  const dist = typeof rawDist === 'number' && !Number.isNaN(rawDist) ? Math.max(0, rawDist) : RANGE.fadeEnd;
  const target = field(opts, 'target');
  const shooter = field(opts, 'shooter');
  const player = !!field(shooter, 'player');

  const rMul = rangeMul(dist);
  const pointBlank = dist <= RANGE.pointBlank;
  const { aspect } = aspectOf(field(opts, 'vx'), field(opts, 'vz'), field(target, 'h'));
  const raw = aspect === 'stern' ? RAKE.stern : aspect === 'bow' ? RAKE.bow : 1;
  const enemyRake = clamp(finite(field(shooter, 'enemyRake'), 1), 0, 1);
  const aspectMul = player ? raw : tidy(1 + (raw - 1) * enemyRake);
  const zone = hitZone(field(opts, 'along'), field(target, 'len'));

  let crit = false;
  let critEffect = null;
  if (player) {
    const force = field(opts, 'force');
    if (force === 'crit') crit = true;
    else if (EFFECT_IDS.includes(force)) {
      crit = true;
      critEffect = force;
    } else if (force !== 'none') {
      const rng = field(opts, 'rng');
      let roll = NaN;
      if (typeof rng === 'function') {
        try {
          roll = rng();
        } catch {
          roll = NaN;
        }
      }
      crit = typeof roll === 'number' && roll < critChance({ critBase: field(shooter, 'critBase'), aspect, dist });
    }
    if (crit && !critEffect) critEffect = effectFor({ ammo, zone });
  }

  const critMul = crit ? CRIT.mul : 1;
  const ghostMul = field(target, 'ghost') && ammo !== 'grape' ? GHOST.hullMul : 1;
  const dmg = tidy(base * kind.hull * rMul * aspectMul * critMul * ghostMul);
  const tags = [];
  if (aspect) tags.push(`RAKE ×${times(aspectMul)}`);
  if (crit) tags.push('CRIT!');
  if (pointBlank) tags.push('POINT BLANK');
  return {
    dmg,
    rangeMul: rMul,
    aspect,
    aspectMul,
    pointBlank,
    crit,
    critEffect,
    zone,
    crewKill: kind.crew + (aspect ? kind.rakeCrew : 0),
    slow: ammo === 'chain',
    tags,
    critMul,
    ghostMul,
  };
}

/**
 * Armour ("The Kraken Seas", SPEC3 §4.1, §4.2): the damage factor of a hit on an armoured ship. `armour` is her
 * type's own number (the Iron Turtle's type.armour 0.5; there is no separate armour table): a hit on her beam
 * (aspect null) does × armour ("CLANG!"); a rake ('stern' or 'bow') does full damage, and so does a crit when
 * `crit` is true (§4.2: rakes, crits, burns and KA-BOOM do full damage). 1 without armour; an armour that isn't
 * a number in [0, 1] counts as none.
 */
export function armourMul(aspect, armour, crit) {
  if (typeof armour !== 'number' || !(armour >= 0 && armour <= 1)) return 1;
  if (aspect === 'stern' || aspect === 'bow' || crit === true) return 1;
  return armour;
}

// ---------------------------------------------------------------------------------------- crew

/**
 * An enemy's fighting crew (§3.1): max(0, crew0 − floor(crew0 × 0.5 × (1 − hpLow / maxHp)) − killed).
 * hpLow is the lowest hp she has had, so hull repairs never bring sailors back; hull damage alone takes
 * at most half the crew.
 */
export function crewNow(opts) {
  const crew0 = count(field(opts, 'crew0'));
  const maxHp = finite(field(opts, 'maxHp'), 0);
  const hpLow = finite(field(opts, 'hpLow'), maxHp);
  const frac = maxHp > 0 ? clamp(hpLow / maxHp, 0, 1) : 1;
  const thinned = floorTidy(crew0 * CREW.hullShare * (1 - frac));
  return Math.max(0, crew0 - thinned - count(field(opts, 'killed')));
}

/** The surrender notch: she strikes when her crew is at or below floor(0.2 × crew0). */
export function strikeAt(crew0) {
  return floorTidy(CREW.strike * count(crew0));
}

// ---------------------------------------------------------------------------------------- boarding

// One side of a boarding: { crew, crew0, blade | grit, hpFrac } → clean numbers.
function party(o) {
  const crew = count(field(o, 'crew'));
  const c0 = field(o, 'crew0');
  const crew0 = typeof c0 === 'number' && Number.isFinite(c0) ? count(c0) : crew;
  const blade = field(o, 'blade');
  const grit = field(o, 'grit');
  const ok = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const strength = Math.min(MAX_STRENGTH, ok(blade) ? blade : ok(grit) ? grit : 1);
  const hpFrac = clamp(finite(field(o, 'hpFrac'), 1), 0, 1);
  return { crew, crew0, strength, hpFrac };
}

function odds(a, d, opts) {
  const heave = clamp(finite(field(opts, 'heave'), 0), 0, BOARD.heaveMax);
  const enemyAttacks = !!field(opts, 'enemyAttacks');
  const P = a.crew * a.strength * (1 + heave);
  const M = 1 + (enemyAttacks ? BOARD.enemyMorale : 1) * (1 - d.hpFrac);
  const D = d.crew * d.strength * (field(opts, 'home') ? BOARD.homeDefence : 1);
  const R = d.crew <= 0 ? Infinity : (P * M) / D;
  return { P, M, D, R };
}

/**
 * The boarding odds (§3.3), the same formula both ways:
 *   P = att.crew × att.blade (player: Cutlass drills; enemy: grit) × (1 + heave)
 *   M = 1 + w × (1 − def.hpFrac)      w = 1 when the player attacks, 0.5 when an enemy does
 *   D = def.crew × def.grit (player: blade) × (home ? 1.5 : 1)
 *   R = P × M / D                      (Infinity when the defender has no crew)
 * heave is clamped to [0, BOARD.heaveMax].
 */
export function boardingOdds(att, def, opts) {
  return odds(party(att), party(def), opts);
}

/**
 * Resolve a boarding (§3.3). opts: { heave, enemyAttacks, home, playerAttacks, playerDefends }.
 *   defLoss = min(def.crew, round(def.crew × clamp(0.45 R, 0.15, 1)));  attLoss = round(def.crew × 0.3 / max(R, 0.5))
 *   caps: player attacking attLoss ≤ att.crew − 1; player defending defLoss ≤ min(def.crew − 1, ceil(0.6 def.crew));
 *         nobody loses more hands than they have
 *   hullDmg = 2 × defLoss (main keeps her at ≥ 1 hp)
 *   player attacking → captured = defLeft ≤ strikeAt(def.crew0)
 *   enemy attacking  → overrun = R ≥ 1; attackerStrikes = attLeft ≤ strikeAt(att.crew0)
 * When playerAttacks / playerDefends are not given they follow enemyAttacks (an enemy only ever boards
 * the player, and the player only ever boards an enemy), so the player can never lose its whole crew.
 */
export function resolveBoarding(att, def, opts) {
  const a = party(att);
  const d = party(def);
  const { P, M, D, R } = odds(a, d, opts);
  const enemyAttacks = !!field(opts, 'enemyAttacks');
  const pa = field(opts, 'playerAttacks');
  const pd = field(opts, 'playerDefends');
  const playerAttacks = pa === undefined ? !enemyAttacks : !!pa;
  const playerDefends = pd === undefined ? enemyAttacks : !!pd;

  let defLoss = d.crew === 0 ? 0 : Math.min(d.crew, roundHalfUp(d.crew * clamp(BOARD.slope * R, BOARD.minFrac, 1)));
  let attLoss = d.crew === 0 ? 0 : roundHalfUp((d.crew * BOARD.lossK) / Math.max(R, BOARD.minR));
  if (playerAttacks) attLoss = Math.min(attLoss, Math.max(0, a.crew - 1));
  if (playerDefends) defLoss = Math.min(defLoss, Math.max(0, Math.min(d.crew - 1, Math.ceil(BOARD.homeLossCap * d.crew - EPS))));
  attLoss = Math.min(attLoss, a.crew);
  const defLeft = d.crew - defLoss;
  const attLeft = a.crew - attLoss;
  return {
    P,
    M,
    D,
    R,
    defLoss,
    attLoss,
    defLeft,
    attLeft,
    hullDmg: BOARD.hullPerKill * defLoss,
    captured: !enemyAttacks && defLeft <= strikeAt(d.crew0),
    overrun: enemyAttacks && R >= 1 - EPS,
    attackerStrikes: enemyAttacks && attLeft <= strikeAt(a.crew0),
  };
}

/**
 * The preview label (§3.3) of a resolveBoarding() result computed with heave 0: 'take' for a surrendered
 * target, 'capture' when she would be captured, 'fight' when R ≥ 1.2, else 'risky'.
 */
export function previewLabel(result, opts) {
  if (field(opts, 'surrendered')) return 'take';
  if (field(result, 'captured') === true) return 'capture';
  const R = field(result, 'R');
  return typeof R === 'number' && R >= BOARD.fightAt - EPS ? 'fight' : 'risky';
}

// ---------------------------------------------------------------------------------------- gold

/** Gold for capturing a ship whose type drops `goldCoins` coins: goldCoins × 20 + 25 (paid at once). */
export function captureGold(goldCoins) {
  return clamp(finite(goldCoins, 0), 0, MAX_GOLD) * CAPTURE.goldMul + CAPTURE.flat;
}

/** What overrunning raiders grab: floor(0.25 × max(0, this level's plunder)). */
export function plunderGold(levelGold) {
  return floorTidy(RAIDERS.plunder * clamp(finite(levelGold, 0), 0, MAX_GOLD));
}
