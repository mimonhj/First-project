// Building up Sparrow's Floating Island (SPEC3 §8): ten fixed plots on today's shack platforms (four homes
// that bring villagers, six amenities with one small perk each), the town's rank, the villagers' gift and
// the Market Hall's share of a cleared level's gold, and the island record (pirates-ahoy-island, §10.1).
//
// Pure: imports nothing (the Node tests load it as a data: URL). Every price and perk lives in PLOTS, the
// ranks in RANKS and the two caps in GIFT and MARKET, so balance changes touch one place.
//
// The island record is { v: 1, t: { homeA: 0..3, ..., park: 0..3 } } (a tier per plot, 0 = today's shack).
// Every function takes the record as an object or as its stored text (or junk: missing, garbage, tampered),
// validates it with parseIsland first, never throws and never changes what it is given.
//
// How main uses it (Stages 2 and 3):
//   spawnWave     player.hp += maxHp × perks(island).wavePatch      (0.35 = today's WAVE_REPAIR at tier 0)
//   startLevel    specials.startLoads(powder, tierOf(island, 'windmill'))   (= +perks().extraLoads loads)
//   launchBomb    warn + perks(island).warnBonus                     (warnBonus() in the mechanics / Kraken ctx)
//   quiz          perks(island).hints lifebuoys a round
//   finishLevel   base = state.gold − goldAtLevelStart; state.gold += market(island, base) + gift(island)
//   the panel     build(island, purse, id): the record is saved first, then the chest (SPEC3 §0.1)

// ---------------------------------------------------------------------------------------- helpers

const MAX_TIER = 3;
const MAX_RAW = 4096; // §10.1: ≤ 4 KB (a real record is about 130 characters)
const PLAIN_INT = /^-?\d{1,16}$/;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

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
function freeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v);
  return Object.freeze(o);
}

// ---------------------------------------------------------------------------------------- tables

const home = (id, name, platform, x, z) => ({
  id,
  name,
  platform,
  x,
  z,
  kind: 'home',
  tiers: ['Cottage', 'Townhouse', 'Manor'],
  costs: [100, 250, 500],
  perk: { villagers: [2, 4, 6] },
  height: 7,
});

/**
 * §8.1: the plots in the panel's order (homes, then amenities). Each row: id, name, the platform it stands on
 * (sparrow.js's scenery shack platform) and that platform's x / z, kind 'home' | 'amenity', the names of tiers
 * 1..3, costs[t] = the price of going from tier t to t + 1, perk = { <key>: [tier 1, tier 2, tier 3] } (one key a
 * plot; the keys perks() returns, or villagers for a home), and the tier-3 building's height cap in world units.
 */
export const PLOTS = freeze([
  home('homeA', 'Tavern Row', 's16', -17.6, -17.4),
  home('homeB', 'Lagoon End', 's3', -0.5, -29.5),
  home('homeC', "Tailor's Lane", 's2', 13.4, -23.2),
  home('homeD', 'Yard Corner', 's7', 21.5, -22.5),
  { id: 'bakery', name: 'Biscuit Bakery', platform: 's8', x: -24, z: -9, kind: 'amenity', tiers: ['Bread oven', 'Bakery', 'Bakery & café'], costs: [200, 450, 800], perk: { wavePatch: [0.45, 0.55, 0.65] }, height: 7 },
  { id: 'windmill', name: 'Powder Windmill', platform: 's6', x: -26, z: -26, kind: 'amenity', tiers: ['Post mill', 'Stone mill', 'Powder mill'], costs: [250, 500, 900], perk: { extraLoads: [1, 2, 3] }, height: 10 },
  { id: 'lighthouse', name: 'Lighthouse', platform: 's18', x: 35, z: -12.5, kind: 'amenity', tiers: ['Beacon', 'Tower', 'Great light'], costs: [200, 450, 800], perk: { warnBonus: [0.3, 0.6, 0.9] }, height: 12 },
  { id: 'market', name: 'Market Hall', platform: 's15', x: -31, z: -16, kind: 'amenity', tiers: ['Stalls', 'Market hall', 'Grand bazaar'], costs: [250, 500, 900], perk: { marketPct: [5, 10, 15] }, height: 8 },
  { id: 'school', name: 'Sea School', platform: 's13', x: -21.5, z: 2.0, kind: 'amenity', tiers: ['Schoolroom', 'Bell tower', 'Academy'], costs: [150, 350, 600], perk: { hints: [1, 2, 3] }, height: 8 },
  { id: 'park', name: 'Flower Park', platform: 's14', x: -29, z: -4.5, kind: 'amenity', tiers: ['Flower beds', 'Fountain', 'Bandstand'], costs: [150, 350, 600], perk: { giftMul: [1.25, 1.5, 2] }, height: 5 },
]);

/** §8.1: the town's rank by tiers built (of 30): a rank holds from `from` tiers up to the next rank's. */
export const RANKS = freeze([
  { name: 'Hamlet', from: 0 },
  { name: 'Village', from: 5 },
  { name: 'Town', from: 12 },
  { name: 'Harbour Town', from: 20 },
  { name: 'Pirate Capital', from: 30 },
]);

/** §8.1: each cleared level (finales too) the villagers bank 5 × villagers × the Flower Park's multiplier, ≤ 240. */
export const GIFT = freeze({ perVillager: 5, cap: 240 });
/** §8.1: the Market Hall's share of a cleared level's banked gold is at most 300 a level. */
export const MARKET = freeze({ cap: 300 });
/** §8.4: at most 8 villagers are drawn walking the town; the rest are "at home". */
export const VILLAGER_CAP = 8;

// The perks of an island with nothing built: today's numbers. wavePatch 0.35 is main's WAVE_REPAIR (the share of
// the hull the crew patches when reinforcements arrive); giftMul 1 is the gift without the Flower Park.
const PERKS0 = freeze({ wavePatch: 0.35, extraLoads: 0, warnBonus: 0, marketPct: 0, hints: 0, giftMul: 1 });

// What a tier gives, in the build panel's words (the row's "Now: …" and "Next: …").
const pct = (v) => Math.round(v * 100);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const PERK_WORDS = {
  villagers: (v) => plural(v, 'villager'),
  wavePatch: (v) => `crew patches ${pct(v)}% of the hull`,
  extraLoads: (v) => `+${v} of each special shot`,
  warnBonus: (v) => `warnings ${v} s longer`,
  marketPct: (v) => `+${v}% of a level's gold`,
  hints: (v) => `${plural(v, 'lifebuoy')} a quiz`,
  giftMul: (v) => `villagers' gift +${pct(v - 1)}%`,
};

const plotOf = (id) => (typeof id === 'string' ? PLOTS.find((p) => p.id === id) || null : null);
const perkKey = (p) => Object.keys(p.perk)[0];
// Gold in the chest: a finite number, whole gold, never below 0; anything else is an empty chest.
const gold = (purse) => (typeof purse === 'number' && Number.isFinite(purse) ? Math.max(0, Math.floor(purse)) : 0);

// ---------------------------------------------------------------------------------------- the record

/** A fresh island: every plot at tier 0 (today's shacks). A fresh object every call. */
export function defaultIsland() {
  const t = {};
  for (const p of PLOTS) t[p.id] = 0;
  return { v: 1, t };
}

// A stored tier: a plain integer (number or digit string), clamped to 0..3; anything else -> null (tier 0).
function readTier(v) {
  let n = null;
  if (typeof v === 'number' && Number.isSafeInteger(v)) n = v;
  else if (typeof v === 'string' && PLAIN_INT.test(v.trim())) {
    const k = Number(v.trim());
    if (Number.isSafeInteger(k)) n = k;
  }
  return n === null ? null : clamp(n, 0, MAX_TIER) + 0; // + 0 turns -0 into 0
}

// Number literals that are not plain integers in the JSON text ("1e0", "2.0") are rejected too, where the
// engine tells the reviver the source text (as upgrades.js does).
const BAD = Symbol('bad');
function reviver(key, value, context) {
  if (typeof value === 'number' && context && typeof context.source === 'string' && !PLAIN_INT.test(context.source)) return BAD;
  return value;
}

function cleanIsland(obj) {
  const s = defaultIsland();
  if (!isRecord(obj)) return s;
  const t = ownField(obj, 't');
  if (!isRecord(t)) return s;
  for (const p of PLOTS) {
    const tier = readTier(ownField(t, p.id));
    if (tier !== null) s.t[p.id] = tier;
  }
  return s;
}

/**
 * Read a stored island record (the string from storage, or null; a record object is validated the same way).
 * Never throws: ≤ 4 KB, JSON, each tier a plain integer clamped to 0..3 (else 0), known plot ids only, own
 * properties only, unknown fields dropped, "v" ignored (written back as 1); unreadable input gives the default.
 */
export function parseIsland(raw) {
  try {
    if (typeof raw === 'string') {
      if (raw.length > MAX_RAW) return defaultIsland();
      let obj = JSON.parse(raw); // bad JSON -> catch -> the default
      try {
        obj = JSON.parse(raw, reviver); // a reviver recurses, so very deep junk could overflow it
      } catch {
        // keep the plain parse
      }
      return cleanIsland(obj);
    }
    return cleanIsland(raw);
  } catch {
    return defaultIsland();
  }
}

/** JSON for storage, validated first: always {"v":1,"t":{"homeA":t,…,"park":t}} in PLOTS order. */
export function serializeIsland(s) {
  const c = parseIsland(s);
  return JSON.stringify({ v: 1, t: c.t });
}

/** Two tabs (§10.2): tiers only go up, so the merge of two records keeps each plot's larger tier. */
export function mergeIsland(a, b) {
  const ia = parseIsland(a);
  const ib = parseIsland(b);
  const out = defaultIsland();
  for (const p of PLOTS) out.t[p.id] = Math.max(ia.t[p.id], ib.t[p.id]);
  return out;
}

// ---------------------------------------------------------------------------------------- plots and prices

/** A plot's tier, 0..3 (0 for an unknown plot). */
export function tierOf(s, id) {
  const p = plotOf(id);
  return p ? parseIsland(s).t[p.id] : 0;
}

/** The next tier's price, or null when the plot is fully built (or unknown). */
export function nextCost(s, id) {
  const p = plotOf(id);
  if (!p) return null;
  const t = parseIsland(s).t[p.id];
  return t < p.costs.length ? p.costs[t] : null;
}

/** The sums of every tier's price: homes 3,400, amenities 8,400, the whole island 11,800 (§8.1, §9). */
export function totals() {
  const sum = (kind) => PLOTS.filter((p) => p.kind === kind).reduce((n, p) => n + p.costs.reduce((a, b) => a + b, 0), 0);
  const homes = sum('home');
  const amenities = sum('amenity');
  return { homes, amenities, all: homes + amenities };
}

// "Cottage · 2 villagers": a tier's name and what it gives.
function tierWords(p, tier) {
  const v = p.perk[perkKey(p)][tier - 1];
  const say = PERK_WORDS[perkKey(p)];
  return say ? `${p.tiers[tier - 1]} · ${say(v)}` : p.tiers[tier - 1];
}

/**
 * What the build panel shows for a plot (§8.3), with `purse` gold in the chest:
 *   tier        0..3;  cost: the next tier's price (null when fully built)
 *   affordable  the chest holds the price;  maxed: fully built
 *   label       the button: "Build Cottage — 100 gold" | "Upgrade to Townhouse — 250 gold" | "Need 30 more gold" |
 *               "Fully built" (the storage refusal is the panel's own: it comes from main's save, not from here)
 *   now / next  "Cottage · 2 villagers" (tier 0: "a little shack") / "Townhouse · 4 villagers" ("all done!")
 * An unknown plot: tier 0, cost null, nothing affordable, every text ''.
 */
export function plotState(s, purse, id) {
  const p = plotOf(id);
  if (!p) return { tier: 0, cost: null, affordable: false, maxed: false, label: '', now: '', next: '' };
  const tier = parseIsland(s).t[p.id];
  const maxed = tier >= p.costs.length;
  const cost = maxed ? null : p.costs[tier];
  const have = gold(purse);
  const affordable = !maxed && have >= cost;
  let label;
  if (maxed) label = 'Fully built';
  else if (!affordable) label = `Need ${cost - have} more gold`;
  else if (tier === 0) label = `Build ${p.tiers[0]} — ${cost} gold`;
  else label = `Upgrade to ${p.tiers[tier]} — ${cost} gold`;
  const now = tier === 0 ? 'a little shack' : tierWords(p, tier);
  const next = maxed ? 'all done!' : tierWords(p, tier + 1);
  return { tier, cost, affordable, maxed, label, now, next };
}

/**
 * Build a plot's next tier from the chest. { ok, island, cost, reason }: ok → island has the plot one tier up and
 * cost is that tier's price (take it from the chest only after the island record is saved, §0.1), reason null;
 * else cost 0, island unchanged and reason 'unknown' (no such plot) | 'maxed' (fully built) | 'poor' (the chest
 * holds less than the price), checked in that order. island is always a fresh, validated record.
 */
export function build(s, purse, id) {
  const island = parseIsland(s);
  const no = (reason) => ({ ok: false, island, cost: 0, reason });
  const p = plotOf(id);
  if (!p) return no('unknown');
  const tier = island.t[p.id];
  if (tier >= p.costs.length) return no('maxed');
  const cost = p.costs[tier];
  if (gold(purse) < cost) return no('poor');
  island.t[p.id] = tier + 1;
  return { ok: true, island, cost, reason: null };
}

// ---------------------------------------------------------------------------------------- what the island gives

/**
 * The perks the island gives now (§8.1), each from its amenity's tier (tier 0: today's numbers):
 *   wavePatch   share of the hull the crew patches when reinforcements arrive: 0.35 / 0.45 / 0.55 / 0.65 (Bakery)
 *   extraLoads  extra loads of each special at every level start: 0 / 1 / 2 / 3 (Powder Windmill)
 *   warnBonus   seconds added to every hazard warning: 0 / 0.3 / 0.6 / 0.9 (Lighthouse)
 *   marketPct   percent of a cleared level's banked gold: 0 / 5 / 10 / 15 (Market Hall; see market())
 *   hints       lifebuoy hints a quiz round: 0 / 1 / 2 / 3 (Sea School)
 *   giftMul     the villagers' gift multiplier: 1 / 1.25 / 1.5 / 2 (Flower Park; see gift())
 */
export function perks(s) {
  const c = parseIsland(s);
  const out = { ...PERKS0 };
  for (const p of PLOTS) {
    const key = perkKey(p);
    const tier = c.t[p.id];
    if (key in PERKS0 && tier > 0) out[key] = p.perk[key][tier - 1];
  }
  return out;
}

/** Villagers living on the island: 2 / 4 / 6 a home by its tier, 24 at most (VILLAGER_CAP of them are drawn). */
export function villagers(s) {
  const c = parseIsland(s);
  let n = 0;
  for (const p of PLOTS) if (p.perk.villagers && c.t[p.id] > 0) n += p.perk.villagers[c.t[p.id] - 1];
  return n;
}

/** Tiers built over every plot: 0..30 (the feats' `island`, the Governor's coat at 30). */
export function tiersBuilt(s) {
  const c = parseIsland(s);
  let n = 0;
  for (const p of PLOTS) n += c.t[p.id];
  return n;
}

/** The town's rank: { name, tiers (built), next: the tiers the next rank needs, or null as the Pirate Capital }. */
export function rank(s) {
  const tiers = tiersBuilt(s);
  let k = 0;
  for (let j = 0; j < RANKS.length; j++) if (tiers >= RANKS[j].from) k = j;
  return { name: RANKS[k].name, tiers, next: k + 1 < RANKS.length ? RANKS[k + 1].from : null };
}

/** The villagers' gift for a cleared level: 5 × villagers × the Flower Park's multiplier, rounded, ≤ 240 (§8.1). */
export function gift(s) {
  const raw = GIFT.perVillager * villagers(s) * perks(s).giftMul;
  return Math.min(GIFT.cap, Math.round(raw));
}

/**
 * The Market Hall's share of a cleared level's banked gold: marketPct % of `banked` (whole gold, rounded), ≤ 300
 * (§8.1). banked: the gold won on the level (main: state.gold − goldAtLevelStart); junk or below 0 counts as 0.
 */
export function market(s, banked) {
  const pctNow = perks(s).marketPct;
  const base = gold(banked);
  if (pctNow <= 0 || base <= 0) return 0;
  return Math.min(MARKET.cap, Math.round((Math.min(base, 1e9) * pctNow) / 100));
}
