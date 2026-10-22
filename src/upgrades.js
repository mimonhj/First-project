// Shipyard upgrades and paint jobs for the player's ship (pure data + logic, no three.js,
// so it can be imported by the game, the tests and Node alike).
//
// A ship config is { up: { <upgrade id>: tier, ... }, look: { hull, sails, flag } }:
// - tiers are integers 0..maxTier(id); tier 0 is the stock ship
// - the Big rudder & wheel (RUDDER, the shipyard's 7th row) is a SPARSE field: up.rudder is there only
//   at tier 1 or more, and a config without it is at tier 0, so every record written before it
//   existed is still read and written byte for byte (SPEC3 §3.1, §10.1)
// - looks are ids from LOOKS (paint is free)
// It is stored as JSON (serializeShipConfig) and read back with parseShipConfig, which
// accepts anything (missing, blocked or tampered storage) and never throws.

/**
 * Upgrades in display order. values[tier] is the stat at that tier, costs[tier] the
 * gold price of going from `tier` to `tier + 1` (so costs has one entry fewer).
 */
export const UPGRADES = [
  {
    id: 'guns',
    name: 'Extra cannons',
    blurb: 'Cut new gun ports and wheel in more cannons. More guns, bigger broadsides!',
    stat: 'Guns per side',
    values: [3, 4, 5],
    costs: [300, 700],
  },
  {
    id: 'shot',
    name: 'Heavy shot',
    blurb: 'Bigger bronze barrels and heavier cannonballs that hit like a kraken.',
    stat: 'Damage per ball',
    values: [10, 12, 14, 16],
    costs: [150, 350, 650],
  },
  {
    id: 'crew',
    name: 'Gun crew drills',
    blurb: 'Powder kegs at hand and a crew drilled day and night. Reload faster!',
    stat: 'Reload',
    values: [1.5, 1.35, 1.2, 1.05],
    costs: [150, 350, 650],
  },
  {
    id: 'hull',
    name: 'Iron-banded hull',
    blurb: 'Iron bands, rivets and an armoured bow to shrug off enemy shot.',
    stat: 'Hull strength',
    values: [120, 140, 165, 195],
    costs: [120, 300, 600],
  },
  {
    id: 'sails',
    name: 'Racing sails',
    blurb: 'Extra canvas and slick racing trim. Faster, quicker off the mark, nimbler.',
    stat: 'Top speed',
    values: [12, 13, 14],
    costs: [150, 400],
  },
  {
    id: 'carpenter',
    name: "Ship's carpenter",
    blurb: 'A carpenter with spare planks patches holes sooner and faster.',
    stat: 'Repairs',
    values: [2, 3, 4.5],
    costs: [100, 300],
  },
];

/**
 * The Big rudder & wheel (SPEC3 §3.1), the shipyard's 7th row: values[tier] is the share of the full turn
 * rate the ship keeps at a standstill (turnLow), turnMul[tier] multiplies the full rate (at speed).
 * values[0] (0.35) is the stock rudder's, which every enemy ship keeps too. Not in UPGRADES, which stays
 * the six rows it always was; the shipyard lists SHIPYARD.
 */
export const RUDDER = {
  id: 'rudder',
  name: 'Big rudder & wheel',
  blurb: 'A bigger rudder and wheel: spin round when slow, turn quicker at full sail.',
  stat: 'Turning when slow',
  values: [0.35, 0.5, 0.65, 0.8],
  turnMul: [1, 1.05, 1.1, 1.15],
  costs: [120, 300, 550],
};

/** Every shipyard row in display order: the six upgrades, then the rudder. */
export const SHIPYARD = [...UPGRADES, RUDDER];

// Rows stored only from tier 1 up (a missing field reads as tier 0).
const SPARSE = new Set([RUDDER.id]);

// Extra stats that ride along with an upgrade's tier.
const SAIL_ACCEL = [4, 4.5, 5];
const SAIL_TURN = [1.4, 1.5, 1.6];
const REGEN_DELAY = [5, 4, 3]; // seconds without damage before repairs start

/**
 * Paint jobs (free). Each entry: { id, name, swatch: [hex, ...] (for the UI), ...colours for ships.js }.
 * The first entry of each list is the default.
 *
 * hull:  bottom (the main hull colour), top (the band under the cap rail), stripe (thin line between them),
 *        wall (inner bulwark), rim (cap rail, rails, door, cutwater), cabin, cap (cabin cap rim, crest disc),
 *        trim (gun port and window frames, flower boxes), accent (crest ring, knobs, flowers), crest (crest biscuit),
 *        emblem (the sail anchor on light sails)
 * sails: cloth, emblem (anchor; null = the hull paint's emblem colour), trim (racing trim band)
 * flag:  kind ('pennant' | 'jolly'), color, emblem (Jolly Roger skull colour)
 */
export const LOOKS = {
  hull: [
    {
      id: 'honey',
      name: 'Honey & Teal',
      swatch: [0xf3b23f, 0x16a5a2],
      top: 0x16a5a2, stripe: 0x0d7c7e, bottom: 0xf3b23f, wall: 0xc9782f, rim: 0x7a4426,
      cabin: 0xf3b23f, cap: 0x16a5a2, trim: 0x0d7c7e, accent: 0xffd23f, crest: 0xf3b23f, emblem: 0x16a5a2,
    },
    {
      id: 'royal',
      name: 'Royal Blue & Gold',
      swatch: [0x2b5fd6, 0xf5c33b],
      top: 0xf5c33b, stripe: 0x17327f, bottom: 0x2b5fd6, wall: 0x2149a8, rim: 0x6a3a1e,
      cabin: 0x2b5fd6, cap: 0xf5c33b, trim: 0xe0a92a, accent: 0xffe27a, crest: 0x2b5fd6, emblem: 0x2b5fd6,
    },
    {
      id: 'crimson',
      name: 'Crimson & Black',
      swatch: [0x3a3443, 0xd8343c],
      top: 0xd8343c, stripe: 0xf2c14a, bottom: 0x3a3443, wall: 0x8f2a30, rim: 0x3b2b2c,
      cabin: 0xd8343c, cap: 0x3a3443, trim: 0xb3262f, accent: 0xf2c14a, crest: 0xf3ead6, emblem: 0xd8343c,
    },
    {
      id: 'emerald',
      name: 'Emerald & Cream',
      swatch: [0x1fa463, 0xf6ead0],
      top: 0xf6ead0, stripe: 0x137a49, bottom: 0x1fa463, wall: 0x16804c, rim: 0x6b4226,
      cabin: 0xf6ead0, cap: 0x1fa463, trim: 0x137a49, accent: 0xffd23f, crest: 0x1fa463, emblem: 0x1fa463,
    },
    {
      id: 'plum',
      name: 'Plum & Silver',
      swatch: [0x8d4fbf, 0xc7d0dd],
      top: 0xc7d0dd, stripe: 0x5d2d88, bottom: 0x8d4fbf, wall: 0x6c3a98, rim: 0x4c2b3f,
      cabin: 0xc7d0dd, cap: 0x8d4fbf, trim: 0x5d2d88, accent: 0xeef3fa, crest: 0x8d4fbf, emblem: 0x8d4fbf,
    },
    {
      id: 'driftwood',
      name: 'Driftwood & Sea Green',
      swatch: [0xbf9e78, 0x3db89e],
      top: 0x3db89e, stripe: 0x24857a, bottom: 0xbf9e78, wall: 0x9c7b58, rim: 0x5a4030,
      cabin: 0xbf9e78, cap: 0x3db89e, trim: 0x24857a, accent: 0xf3e2bf, crest: 0x3db89e, emblem: 0x24857a,
    },
  ],
  sails: [
    { id: 'cream', name: 'Cream canvas', swatch: [0xfff3d6], cloth: 0xfff3d6, emblem: null, trim: 0xe0453a },
    { id: 'snow', name: 'Snow white', swatch: [0xffffff], cloth: 0xffffff, emblem: null, trim: 0x2f86ea },
    { id: 'crimson', name: 'Crimson', swatch: [0xd9363e], cloth: 0xd9363e, emblem: 0xfff3d6, trim: 0xfff3d6 },
    { id: 'midnight', name: 'Midnight', swatch: [0x2c3166], cloth: 0x2c3166, emblem: 0xffd23f, trim: 0xffd23f },
    { id: 'sunset', name: 'Sunset orange', swatch: [0xff8a3d], cloth: 0xff8a3d, emblem: 0xfff3d6, trim: 0x8a2b5e },
    { id: 'sky', name: 'Sky blue', swatch: [0x86c8f4], cloth: 0x86c8f4, emblem: 0xffffff, trim: 0xffffff },
  ],
  flag: [
    { id: 'pennant', name: 'Blue pennant', swatch: [0x2f86ea], kind: 'pennant', color: 0x2f86ea },
    { id: 'scarlet', name: 'Scarlet pennant', swatch: [0xe0352f], kind: 'pennant', color: 0xe0352f },
    { id: 'gold', name: 'Gold pennant', swatch: [0xffc93c], kind: 'pennant', color: 0xffc93c },
    { id: 'jolly', name: 'Jolly Roger', swatch: [0x1d1a22, 0xf6f1e4], kind: 'jolly', color: 0x1d1a22, emblem: 0xf6f1e4 },
  ],
};

const MAX_RAW = 64 * 1024; // a real config is ~150 characters; anything far bigger is junk
const PLAIN_INT = /^-?\d{1,16}$/;
const own = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function upgrade(id) {
  for (const u of SHIPYARD) if (u.id === id) return u;
  return null;
}

/** The look entry for a part ('hull' | 'sails' | 'flag') and id, or that part's default. */
export function findLook(part, id) {
  const list = Object.prototype.hasOwnProperty.call(LOOKS, part) ? LOOKS[part] : null;
  if (!list) return null;
  for (const l of list) if (l.id === id) return l;
  return list[0];
}

function isLook(part, id) {
  return typeof id === 'string' && LOOKS[part].some((l) => l.id === id);
}

/** A fresh stock config: no upgrades (the sparse rudder is left out at tier 0), the default paint. */
export function defaultShipConfig() {
  const up = {};
  for (const u of UPGRADES) up[u.id] = 0;
  return { up, look: { hull: LOOKS.hull[0].id, sails: LOOKS.sails[0].id, flag: LOOKS.flag[0].id } };
}

/** Highest tier of an upgrade (0 for an unknown id). */
export function maxTier(id) {
  const u = upgrade(id);
  return u ? u.values.length - 1 : 0;
}

// A stored tier: a plain integer (number or digit string), clamped; anything else -> null.
function readTier(v, max) {
  let n = null;
  if (typeof v === 'number' && Number.isSafeInteger(v)) n = v;
  else if (typeof v === 'string' && PLAIN_INT.test(v.trim())) {
    const k = Number(v.trim());
    if (Number.isSafeInteger(k)) n = k;
  }
  return n === null ? null : clamp(n, 0, max) + 0; // + 0 turns -0 into 0
}

// Number literals that are not plain integers in the JSON text ("1e1", "2.0", "-0.5") are
// rejected too, where the browser tells the reviver the source text (newer engines).
const BAD = Symbol('bad');
function reviver(key, value, context) {
  if (typeof value === 'number' && context && typeof context.source === 'string' && !PLAIN_INT.test(context.source)) return BAD;
  return value;
}

// Read one field; a hostile object (throwing getter or proxy) just counts as missing.
function field(o, k) {
  try {
    return own(o, k) ? o[k] : undefined;
  } catch {
    return undefined;
  }
}
const isRecord = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);

/** Validate any object field by field into a fresh config (unknown fields are dropped). */
function clean(obj) {
  const cfg = defaultShipConfig();
  if (!isRecord(obj)) return cfg;
  const up = field(obj, 'up');
  if (isRecord(up)) {
    for (const u of SHIPYARD) {
      const t = readTier(field(up, u.id), u.values.length - 1);
      if (t !== null && (t > 0 || !SPARSE.has(u.id))) cfg.up[u.id] = t; // a sparse row only from tier 1
    }
  }
  const look = field(obj, 'look');
  if (isRecord(look)) {
    for (const part of ['hull', 'sails', 'flag']) {
      const id = field(look, part);
      if (isLook(part, id)) cfg.look[part] = id;
    }
  }
  return cfg;
}

/**
 * Read a stored config. raw is the string from storage (or null). Never throws:
 * unreadable input gives the defaults, and each field falls back on its own.
 * (A config object is accepted too and validated the same way.)
 */
export function parseShipConfig(raw) {
  try {
    if (typeof raw === 'string') {
      if (raw.length > MAX_RAW) return defaultShipConfig();
      let obj = JSON.parse(raw); // bad JSON -> catch -> defaults
      try {
        obj = JSON.parse(raw, reviver); // a reviver recurses, so very deep junk can overflow it
      } catch {
        // keep the plain parse
      }
      return clean(obj);
    }
    return clean(raw);
  } catch {
    return defaultShipConfig();
  }
}

/** JSON for storage (validated first, so only known fields are written; up.rudder only from tier 1). */
export function serializeShipConfig(config) {
  const c = parseShipConfig(config);
  return JSON.stringify({ up: c.up, look: c.look });
}

// Tier of an upgrade in a (validated) config (a sparse row that is missing is at tier 0).
const tierOf = (c, id) => c.up[id] ?? 0;
// A product of two table numbers, without the float dust (1.4 × 1.05 is 1.47, not 1.4700000000000002).
const tidy = (x) => Math.round(x * 1e6) / 1e6;

/** Gold needed for the next tier of an upgrade, or null when it is maxed (or unknown). */
export function nextCost(config, id) {
  const u = upgrade(id);
  if (!u) return null;
  const t = tierOf(parseShipConfig(config), id);
  return t < u.costs.length ? u.costs[t] : null;
}

/**
 * Gameplay stats of the player's ship with these upgrades: a NEW object based on
 * baseType (SHIP_TYPES.player); baseType itself is never changed. turn is the full turn rate (the racing
 * sails' times the rudder's turnMul) and turnLow the share of it kept at a standstill (the rudder's
 * values; main's turnRate() blends the two by speed, SPEC3 §3.1).
 */
export function playerType(baseType, config) {
  const c = parseShipConfig(config);
  const t = (id) => tierOf(c, id);
  const v = (id) => upgrade(id).values[t(id)];
  return {
    ...(baseType || {}),
    hp: v('hull'),
    maxSpeed: v('sails'),
    accel: SAIL_ACCEL[t('sails')],
    turn: tidy(SAIL_TURN[t('sails')] * RUDDER.turnMul[t('rudder')]),
    turnLow: v('rudder'),
    reload: v('crew'),
    guns: v('guns'),
    dmg: v('shot'),
    regen: v('carpenter'),
    regenDelay: REGEN_DELAY[t('carpenter')],
  };
}

/**
 * Short UI text for an upgrade's stat at a tier, e.g. "4 guns", "1.35 s", "140 hp", "50%". The rudder's is the bare
 * percentage: its row already reads "Turning when slow: 50%" (RUDDER.stat), like "Reload: 1.35 s".
 */
export function statText(id, tier) {
  const u = upgrade(id);
  if (!u) return '';
  const n = Number.isFinite(tier) ? Math.round(tier) : 0;
  const t = clamp(n, 0, u.values.length - 1);
  const val = u.values[t];
  switch (id) {
    case 'guns':
      return `${val} guns`;
    case 'shot':
      return `${val} damage`;
    case 'crew':
      return `${val.toFixed(2).replace(/0$/, '')} s`;
    case 'hull':
      return `${val} hp`;
    case 'sails':
      return `${val} knots`;
    case 'carpenter':
      return `${val} hp/s`;
    case 'rudder':
      return `${Math.round(val * 100)}%`;
    default:
      return String(val);
  }
}
