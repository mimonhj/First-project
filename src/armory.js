// Tavern upgrades for the crew of the Sea Biscuit (pure data + logic, no three.js, no imports,
// so the game, the tests and Node can all load it). Bought at The Salty Sparrow with the same
// treasure chest as the shipyard, but kept in their own record (SPEC2 §4, §8): upgrades.js and
// its `pirates-ahoy-ship` record are untouched.
//
// An armory config is { up: { <upgrade id>: tier, ... } }; tiers are integers 0..armoryMaxTier(id),
// tier 0 being the crew you start with. It is stored as JSON (serializeArmoryConfig) and read back
// with parseArmoryConfig, which accepts anything (missing, blocked or tampered storage) and never
// throws: field by field, plain integers only, clamped, own properties only, unknown fields dropped.
//
// Numbers the battle rules also know (combat.js BOARD.range / BOARD.reel / CRIT.base) are repeated
// here because pure modules import nothing; tests/armory.test.cjs checks the two stay equal.

/**
 * Upgrades in display order. values[tier] is the stat at that tier, costs[tier] the gold price of
 * going from `tier` to `tier + 1` (so costs has one entry fewer). `extra` is an optional UI line.
 */
export const ARMORY = [
  {
    id: 'boarders',
    name: 'Boarding party',
    blurb: 'Sign on more cutthroats at the Salty Sparrow: more hands to swing across, and to hold your own deck.',
    stat: 'Crew',
    values: [12, 15, 18, 22],
    costs: [200, 450, 800],
    extra: 'New hands join at the next level start.',
  },
  {
    id: 'cutlass',
    name: 'Cutlass drills',
    blurb: 'Steel, sand and sweat on the quarterdeck every dawn. Your boarders fight like a crew twice their size.',
    stat: 'Boarding strength',
    values: [1.0, 1.2, 1.4, 1.6],
    costs: [150, 350, 650],
  },
  {
    id: 'grapple',
    name: 'Long grapples',
    blurb: 'Longer lines and sharper hooks. Grapple a ship from further off and reel her in faster.',
    stat: 'Grapple range',
    values: [14, 17, 20],
    costs: [150, 400],
    extra: 'Reels in faster too, and coils of grapples hang on your rail.',
  },
  {
    id: 'gunner',
    name: 'Master gunner',
    blurb: 'A one-eyed old gunner who knows where every ship is soft. More of your shots land as critical hits.',
    stat: 'Critical hits',
    values: [0.06, 0.09, 0.12, 0.15],
    costs: [200, 450, 800],
  },
];

// Extra stats that ride along with an upgrade's tier.
const REEL = [1.2, 1.0, 0.8]; // Long grapples: seconds to reel a grappled ship alongside

const MAX_RAW = 64 * 1024; // a real record is ~60 characters; anything far bigger is junk
const PLAIN_INT = /^-?\d{1,16}$/;
const own = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function upgrade(id) {
  for (const u of ARMORY) if (u.id === id) return u;
  return null;
}

/** A fresh config: no tavern upgrades. */
export function defaultArmoryConfig() {
  const up = {};
  for (const u of ARMORY) up[u.id] = 0;
  return { up };
}

/** Highest tier of a tavern upgrade (0 for an unknown id). */
export function armoryMaxTier(id) {
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
// rejected too, where the engine tells the reviver the source text (newer engines).
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
function isRecord(o) {
  if (o === null || typeof o !== 'object') return false;
  try {
    return !Array.isArray(o); // throws on a revoked proxy: that counts as missing too
  } catch {
    return false;
  }
}

/** Validate any object field by field into a fresh config (unknown fields are dropped). */
function clean(obj) {
  const cfg = defaultArmoryConfig();
  if (!isRecord(obj)) return cfg;
  const up = field(obj, 'up');
  if (isRecord(up)) {
    for (const u of ARMORY) {
      const t = readTier(field(up, u.id), u.values.length - 1);
      if (t !== null) cfg.up[u.id] = t;
    }
  }
  return cfg;
}

/**
 * Read a stored armory record. raw is the string from storage (or null). Never throws:
 * unreadable input gives the defaults, and each tier falls back on its own.
 * (A config object is accepted too and validated the same way.)
 */
export function parseArmoryConfig(raw) {
  try {
    if (typeof raw === 'string') {
      if (raw.length > MAX_RAW) return defaultArmoryConfig();
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
    return defaultArmoryConfig();
  }
}

/** JSON for storage (validated first, so only known fields are written, in display order). */
export function serializeArmoryConfig(config) {
  return JSON.stringify({ up: parseArmoryConfig(config).up });
}

// Tier of an upgrade in a (validated) config.
const tierOf = (c, id) => c.up[id] ?? 0;

/** Gold needed for the next tier of a tavern upgrade, or null when it is maxed (or unknown). */
export function armoryNextCost(config, id) {
  const u = upgrade(id);
  if (!u) return null;
  const t = tierOf(parseArmoryConfig(config), id);
  return t < u.costs.length ? u.costs[t] : null;
}

/**
 * What the tavern upgrades do in battle: a NEW object every call.
 * crew: the player's full complement; blade: boarding strength; grappleRange: paces (centre to
 * centre, before the target's length bonus); reel: seconds to reel her in; critBase: crit chance.
 */
export function armoryStats(config) {
  const c = parseArmoryConfig(config);
  const v = (id) => upgrade(id).values[tierOf(c, id)];
  return {
    crew: v('boarders'),
    blade: v('cutlass'),
    grappleRange: v('grapple'),
    reel: REEL[tierOf(c, 'grapple')],
    critBase: v('gunner'),
  };
}

/** Short UI text for a tavern upgrade's stat at a tier: "15 hands", "×1.2", "17 paces", "9%". */
export function armoryStatText(id, tier) {
  const u = upgrade(id);
  if (!u) return '';
  const n = Number.isFinite(tier) ? Math.round(tier) : 0;
  const val = u.values[clamp(n, 0, u.values.length - 1)];
  switch (id) {
    case 'boarders':
      return `${val} hands`;
    case 'cutlass':
      return `×${val.toFixed(1)}`;
    case 'grapple':
      return `${val} paces`;
    case 'gunner':
      return `${Math.round(val * 100)}%`;
    default:
      return String(val);
  }
}
