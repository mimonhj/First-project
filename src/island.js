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

// ======================================================================================== the Sunset Isles (SPEC4 §4)
//
// Eleven new plots (PLOTS4): three homes that bring 2 / 4 / 6 villagers each and eight amenities, on the seven
// remaining shack platforms and on two new islets, Sunset Beach and Lookout Hill. Their tiers live in their own
// record, pirates-ahoy-island4 ({ v: 1, t: { homeE: 0..3, …, grotto: 0..3 } }), so a stale tab that only knows the
// ten SPEC3 plots never drops them (SPEC4 §0.1). Everything above (PLOTS, RANKS, GIFT, MARKET, VILLAGER_CAP and every
// SPEC3 function) is unchanged: the new rules are new exports only.
//
// The perk rule (SPEC4 §0.1): no new building changes a Voyage I–III battle. Each new perk is gold (paid per cleared
// level, per capture, per creature driven off or per wreck, each with its own cap), a delight (goats, the town tune)
// or acts only on Voyage IV things (the Forge's hold on a net, the Observatory's spyglass in fog). PERK4_SCOPE says
// which, and the Node test checks it.
//
// How main and the town use it (Stages 2 and 3):
//   G / CUT!     a net is cut by a hold of perks4(island4).cutHold s (0.8 without the Forge: combat.js RAIDERS.cutHold)
//   fog          a ship in a bank is hidden from a viewer more than 14 + perks4(island4).spyglass u away
//   finishLevel  state.gold += gift4(island, island4) + catchGold(island4) + museumGold(island4, captures this level)
//                + aquariumGold(island4, creatures driven off this level), before the level is banked
//   playerSunk   rescue(island4, plunder lost) goes to the chest ("The merfolk saved 45 gold!")
//   the panel    build4(island4, purse, id, progress): the island4 record is saved first, then the chest (§0.1)
//   the town     perks4().goats goats graze; perks4().musicLayers is audio.setTownLayers(n); rank4() on the plaque

/**
 * §4.1: the new plots in the table's (and the record's) order. Each row: id, name, its district (islandPlan's
 * DISTRICTS id) and platform (a shack platform `s4`…`s17`, or the islet `beach` / `hill`; islandPlan's PADS holds the
 * pad), kind 'home' | 'amenity', the names of tiers 1..3, costs[t] = the price of going from tier t to t + 1, perk =
 * { <key>: [tier 1, tier 2, tier 3] } (one key a plot: a perks4() key, or villagers for a home), height (the tier-3
 * building's height cap in world units), tier0 (what stands there before tier 1, the panel's "Now"), and sale: when
 * it goes on sale (null: always; { unlocked: n }: once level n is open; { captures: n }: after n captures), with the
 * panel's words for a row not yet on sale.
 */
const KRAKEN_DONE = "Opens after The Kraken's Deep";
export const PLOTS4 = freeze([
  { id: 'homeE', name: 'Treehouse', district: 'beach', platform: 'beach', kind: 'home', tiers: ['Rope Swing House', 'Treehouse', 'Treetop Lodge'], costs: [150, 350, 650], perk: { villagers: [2, 4, 6] }, height: 11, tier0: 'a giant palm', sale: null },
  { id: 'homeF', name: 'Houseboat Moorings', district: 'lighthouse', platform: 's17', kind: 'home', tiers: ['Rowboat Home', 'Houseboat', 'Floating Manor'], costs: [150, 350, 650], perk: { villagers: [2, 4, 6] }, height: 8, tier0: 'a little shack', sale: null },
  { id: 'homeG', name: 'Hilltop Villa', district: 'hill', platform: 'hill', kind: 'home', tiers: ['Cottage', 'Villa', 'Domed Villa'], costs: [150, 350, 650], perk: { villagers: [2, 4, 6] }, height: 9, tier0: 'a grassy plot', sale: null },
  { id: 'forge', name: "Blacksmith's Forge", district: 'lantern', platform: 's4', kind: 'amenity', tiers: ['Anvil', 'Smithy', 'Iron Works'], costs: [250, 550, 950], perk: { cutHold: [0.6, 0.45, 0.3] }, height: 8, tier0: 'a little shack', sale: { unlocked: 10, why: KRAKEN_DONE } },
  { id: 'fishing', name: 'Fishing Hut', district: 'lighthouse', platform: 's9', kind: 'amenity', tiers: ['Drying Rack', 'Fishing Hut', 'Fish Market'], costs: [150, 350, 650], perk: { catchGold: [20, 40, 60] }, height: 7, tier0: 'a little shack', sale: null },
  { id: 'farm', name: 'Goat Farm', district: 'lantern', platform: 's10', kind: 'amenity', tiers: ['Goat Pen', 'Barn', 'Dairy & Orchard'], costs: [200, 450, 800], perk: { goats: [2, 4, 6] }, height: 6, tier0: 'a little shack', sale: null },
  { id: 'music', name: 'Music Hall', district: 'lantern', platform: 's5', kind: 'amenity', tiers: ["Fiddler's Stump", 'Bandstand', 'Shell Hall'], costs: [200, 450, 800], perk: { musicLayers: [1, 2, 3] }, height: 8, tier0: 'a little shack', sale: null },
  { id: 'museum', name: 'Trophy Museum', district: 'lantern', platform: 's11', kind: 'amenity', tiers: ['Curio Shed', 'Museum', 'Grand Gallery'], costs: [250, 500, 900], perk: { museumGold: [15, 30, 50] }, height: 9, tier0: 'a little shack', sale: { captures: 1, why: 'Opens after your first capture' } },
  { id: 'observatory', name: 'Observatory', district: 'hill', platform: 'hill', kind: 'amenity', tiers: ['Spyglass Post', 'Star Tower', 'Great Dome'], costs: [300, 600, 1000], perk: { spyglass: [6, 12, 18] }, height: 11, tier0: 'a grassy hilltop', sale: { unlocked: 10, why: KRAKEN_DONE } },
  { id: 'aquarium', name: 'Aquarium', district: 'lantern', platform: 's12', kind: 'amenity', tiers: ['Tide Pool', 'Aquarium', 'Grand Aquarium'], costs: [300, 600, 1000], perk: { aquariumGold: [10, 20, 30] }, height: 7, tier0: 'a little shack', sale: { unlocked: 11, why: 'Opens after Misty Mangroves' } },
  { id: 'grotto', name: 'Mermaid Grotto', district: 'beach', platform: 'beach', kind: 'amenity', tiers: ['Rock Pool', 'Grotto', 'Coral Palace'], costs: [200, 400, 700], perk: { rescuePct: [10, 20, 30] }, height: 6, tier0: 'a sandy shore', sale: { unlocked: 12, why: 'Opens after The Sunken Spires' } },
]);

/** §4.2: the rank by tiers built over all 21 plots (of 63), with the flag; RANKS stays for the flag-off game. */
export const RANKS4 = freeze([
  { name: 'Hamlet', from: 0 },
  { name: 'Village', from: 5 },
  { name: 'Town', from: 12 },
  { name: 'Harbour Town', from: 20 },
  { name: 'Pirate Capital', from: 30 },
  { name: 'Grand Port', from: 45 },
  { name: 'Jewel of the Seas', from: 63 },
]);

/** §4.1: the new homes' villagers bank 5 × villagers × the Flower Park's multiplier each cleared level, ≤ 120 (a cap
 *  of its own, beside GIFT's 240, so SPEC3's pinned gift holds). */
export const GIFT4 = freeze({ perVillager: 5, cap: 120 });
/** §4.1: the Trophy Museum pays per ship captured, at most 200 a level. */
export const MUSEUM = freeze({ cap: 200 });
/** §4.1: the Aquarium pays per Voyage IV creature driven off, at most 150 a level. */
export const AQUARIUM = freeze({ cap: 150 });
/** §4.1: the Mermaid Grotto's merfolk save part of the plunder you lose in a wreck, at most 150. */
export const RESCUE = freeze({ cap: 150 });

/**
 * The perk rule (SPEC4 §0.1, §13.1): what each perks4() key acts on. 'v4': only on Voyage IV things (nets, fog, Old
 * Coilback), never on a Voyage I–III battle; 'gold': gold paid by its own trigger with its own cap; 'delight':
 * changes nothing in a battle or the purse.
 */
export const PERK4_SCOPE = freeze({ cutHold: 'v4', spyglass: 'v4', catchGold: 'gold', museumGold: 'gold', aquariumGold: 'gold', rescuePct: 'gold', musicLayers: 'delight', goats: 'delight' });

// The perks of an island4 with nothing built. cutHold 0.8 is combat.js's RAIDERS.cutHold (the net's hold without the
// Forge); the rest are nothing at all.
const PERKS4_0 = freeze({ cutHold: 0.8, catchGold: 0, museumGold: 0, spyglass: 0, aquariumGold: 0, rescuePct: 0, musicLayers: 0, goats: 0 });

const LAYERS = ['', 'a fiddle in the town tune', 'a fiddle and a drum', 'the whole band; the town dances'];
const PERK4_WORDS = {
  villagers: (v) => plural(v, 'villager'),
  cutHold: (v) => `cut a net in ${v} s`,
  catchGold: (v) => `+${v} gold a cleared level`,
  goats: (v) => plural(v, 'goat'),
  musicLayers: (v) => LAYERS[v] || '',
  museumGold: (v) => `+${v} gold a ship captured`,
  spyglass: (v) => `see ${v} u further in fog`,
  aquariumGold: (v) => `+${v} gold a sea creature`,
  rescuePct: (v) => `merfolk save ${v}% in a wreck`,
};

const plotOf4 = (id) => (typeof id === 'string' ? PLOTS4.find((p) => p.id === id) || null : null);
// A count from the game (captures this level, creatures driven off): a plain non-negative integer, else 0.
const count = (n) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.min(1e6, Math.floor(n)) : 0);

// ---------------------------------------------------------------------------------------- the island4 record

/** A fresh island4: every new plot at tier 0 (the seven shacks; the islets' empty plots). A fresh object every call. */
export function defaultIsland4() {
  const t = {};
  for (const p of PLOTS4) t[p.id] = 0;
  return { v: 1, t };
}

function cleanIsland4(obj) {
  const s = defaultIsland4();
  if (!isRecord(obj)) return s;
  const t = ownField(obj, 't');
  if (!isRecord(t)) return s;
  for (const p of PLOTS4) {
    const tier = readTier(ownField(t, p.id));
    if (tier !== null) s.t[p.id] = tier;
  }
  return s;
}

/**
 * Read a stored pirates-ahoy-island4 record (the string from storage, or null; a record object is validated the same
 * way), exactly as parseIsland reads the SPEC3 record: never throws; ≤ 4 KB; JSON with the plain-integer reviver; each
 * tier a plain integer clamped to 0..3 (else 0); the eleven known ids only (a SPEC3 id there is dropped); own
 * properties only; unknown fields dropped; "v" ignored (written back as 1); unreadable input gives the default.
 */
export function parseIsland4(raw) {
  try {
    if (typeof raw === 'string') {
      if (raw.length > MAX_RAW) return defaultIsland4();
      let obj = JSON.parse(raw); // bad JSON -> catch -> the default
      try {
        obj = JSON.parse(raw, reviver); // a reviver recurses, so very deep junk could overflow it
      } catch {
        // keep the plain parse
      }
      return cleanIsland4(obj);
    }
    return cleanIsland4(raw);
  } catch {
    return defaultIsland4();
  }
}

/** JSON for storage, validated first: always {"v":1,"t":{"homeE":t,…,"grotto":t}} in PLOTS4 order (§10.1). */
export function serializeIsland4(s4) {
  const c = parseIsland4(s4);
  return JSON.stringify({ v: 1, t: c.t });
}

/** Two tabs (§10.2): tiers only go up, so the merge keeps each new plot's larger tier. */
export function mergeIsland4(a, b) {
  const ia = parseIsland4(a);
  const ib = parseIsland4(b);
  const out = defaultIsland4();
  for (const p of PLOTS4) out.t[p.id] = Math.max(ia.t[p.id], ib.t[p.id]);
  return out;
}

// ---------------------------------------------------------------------------------------- plots, prices and sale

/** A new plot's tier, 0..3 (0 for an unknown plot). */
export function tierOf4(s4, id) {
  const p = plotOf4(id);
  return p ? parseIsland4(s4).t[p.id] : 0;
}

/** The next tier's price, or null when the plot is fully built (or unknown). */
export function nextCost4(s4, id) {
  const p = plotOf4(id);
  if (!p) return null;
  const t = parseIsland4(s4).t[p.id];
  return t < p.costs.length ? p.costs[t] : null;
}

/** The sums of every new tier's price: homes 3,450, amenities 12,550, the eleven plots 16,000 (§4.1, §9). */
export function totals4() {
  const sum = (kind) => PLOTS4.filter((p) => p.kind === kind).reduce((n, p) => n + p.costs.reduce((a, b) => a + b, 0), 0);
  const homes = sum('home');
  const amenities = sum('amenity');
  return { homes, amenities, all: homes + amenities };
}

// The progress that decides what is on sale: { unlocked: the highest level open (1..), captures: ships captured
// ever (feats.captures) }; anything missing or junk counts as a fresh save (level 1, no captures).
function readProgress(progress) {
  const num = (v, lo, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.floor(v)) : d);
  return { unlocked: num(ownField(progress, 'unlocked'), 1, 1), captures: num(ownField(progress, 'captures'), 0, 0) };
}

/**
 * Is a new plot on sale (§4.1's "On sale" column, §4.2)? { ok, why }: ok → why ''; else why is the panel's row text
 * ("Opens after The Kraken's Deep", "…Misty Mangroves", "…The Sunken Spires", "…your first capture"). progress:
 * { unlocked, captures } (junk: a fresh save). An unknown plot: { ok: false, why: '' }.
 */
export function onSale4(id, progress) {
  const p = plotOf4(id);
  if (!p) return { ok: false, why: '' };
  const g = readProgress(progress);
  const s = p.sale;
  const ok = !s || ((s.unlocked === undefined || g.unlocked >= s.unlocked) && (s.captures === undefined || g.captures >= s.captures));
  return { ok, why: ok ? '' : s.why };
}

function tierWords4(p, tier) {
  const key = perkKey(p);
  const say = PERK4_WORDS[key];
  const words = say ? say(p.perk[key][tier - 1]) : '';
  return words ? `${p.tiers[tier - 1]} · ${words}` : p.tiers[tier - 1];
}

/**
 * What the build panel shows for a new plot (§8.6), with `purse` gold in the chest and the save's `progress`:
 *   tier, cost, affordable, maxed   as plotState (cost null when fully built)
 *   onSale, why                     onSale4's answer (why '' when on sale)
 *   label   "Build Rope Swing House — 150 gold" | "Upgrade to Treehouse — 350 gold" | "Need 30 more gold" |
 *           "Fully built" | the not-on-sale reason ("Opens after The Kraken's Deep")
 *   now / next   "Rope Swing House · 2 villagers" (tier 0: its tier0 text, "a little shack") / the next tier's ("all done!")
 * An unknown plot: tier 0, cost null, nothing affordable or on sale, every text ''.
 */
export function plotState4(s4, purse, id, progress) {
  const p = plotOf4(id);
  if (!p) return { tier: 0, cost: null, affordable: false, maxed: false, onSale: false, why: '', label: '', now: '', next: '' };
  const tier = parseIsland4(s4).t[p.id];
  const maxed = tier >= p.costs.length;
  const cost = maxed ? null : p.costs[tier];
  const sale = onSale4(p.id, progress);
  const have = gold(purse);
  const affordable = !maxed && sale.ok && have >= cost;
  let label;
  if (maxed) label = 'Fully built';
  else if (!sale.ok) label = sale.why;
  else if (have < cost) label = `Need ${cost - have} more gold`;
  else if (tier === 0) label = `Build ${p.tiers[0]} — ${cost} gold`;
  else label = `Upgrade to ${p.tiers[tier]} — ${cost} gold`;
  const now = tier === 0 ? p.tier0 : tierWords4(p, tier);
  const next = maxed ? 'all done!' : tierWords4(p, tier + 1);
  return { tier, cost, affordable, maxed, onSale: sale.ok, why: sale.why, label, now, next };
}

/**
 * Build a new plot's next tier from the chest. { ok, island4, cost, reason }: ok → island4 has the plot one tier up and
 * cost is that tier's price (taken from the chest only after the island4 record is saved, §0.1), reason null; else
 * cost 0, island4 unchanged and reason 'unknown' (no such plot) | 'maxed' (fully built) | 'closed' (not on sale yet) |
 * 'poor' (the chest holds less than the price), checked in that order. island4 is always a fresh, validated record.
 */
export function build4(s4, purse, id, progress) {
  const island4 = parseIsland4(s4);
  const no = (reason) => ({ ok: false, island4, cost: 0, reason });
  const p = plotOf4(id);
  if (!p) return no('unknown');
  const tier = island4.t[p.id];
  if (tier >= p.costs.length) return no('maxed');
  if (!onSale4(p.id, progress).ok) return no('closed');
  const cost = p.costs[tier];
  if (gold(purse) < cost) return no('poor');
  island4.t[p.id] = tier + 1;
  return { ok: true, island4, cost, reason: null };
}

// ---------------------------------------------------------------------------------------- what the new plots give

/**
 * The new plots' perks now (§4.1), each from its plot's tier (tier 0: nothing, and the net's hold without the Forge):
 *   cutHold       seconds to hold G / CUT! to cut a net: 0.8 / 0.6 / 0.45 / 0.3 (Blacksmith's Forge; nets only)
 *   catchGold     gold each cleared level: 0 / 20 / 40 / 60 (Fishing Hut; see catchGold())
 *   museumGold    gold for each ship captured: 0 / 15 / 30 / 50 (Trophy Museum; ≤ 200 a level, see museumGold())
 *   spyglass      u further you see into fog (and Old Coilback's bubbles on the minimap from tier 1): 0 / 6 / 12 / 18
 *   aquariumGold  gold for each Voyage IV creature driven off: 0 / 10 / 20 / 30 (Aquarium; ≤ 150, aquariumGold())
 *   rescuePct     % of the plunder the merfolk save in a wreck: 0 / 10 / 20 / 30 (Mermaid Grotto; ≤ 150, rescue())
 *   musicLayers   the town tune's extra instruments: 0..3 (Music Hall; audio.setTownLayers; 3: the plaza dance)
 *   goats         goats grazing the pen and Lookout Hill: 0 / 2 / 4 / 6 (Goat Farm)
 */
export function perks4(s4) {
  const c = parseIsland4(s4);
  const out = { ...PERKS4_0 };
  for (const p of PLOTS4) {
    const key = perkKey(p);
    const tier = c.t[p.id];
    if (key in PERKS4_0 && tier > 0) out[key] = p.perk[key][tier - 1];
  }
  return out;
}

/** The new homes' villagers: 2 / 4 / 6 a home by its tier, 18 at most (they walk the town as the named islanders). */
export function villagers4(s4) {
  const c = parseIsland4(s4);
  let n = 0;
  for (const p of PLOTS4) if (p.perk.villagers && c.t[p.id] > 0) n += p.perk.villagers[c.t[p.id] - 1];
  return n;
}

/** Tiers built over the eleven new plots: 0..33 (the feats' `island4`, the Jewelled tricorn at 33). */
export function tiersBuilt4(s4) {
  const c = parseIsland4(s4);
  let n = 0;
  for (const p of PLOTS4) n += c.t[p.id];
  return n;
}

/** The town's rank over all 21 plots (§4.2): { name, tiers (built, 0..63), next: the tiers the next rank needs, or
 *  null as the Jewel of the Seas }. s: the SPEC3 island record, s4: the island4 record. */
export function rank4(s, s4) {
  const tiers = tiersBuilt(s) + tiersBuilt4(s4);
  let k = 0;
  for (let j = 0; j < RANKS4.length; j++) if (tiers >= RANKS4[j].from) k = j;
  return { name: RANKS4[k].name, tiers, next: k + 1 < RANKS4.length ? RANKS4[k + 1].from : null };
}

/** The new homes' gift for a cleared level: 5 × villagers4 × the Flower Park's multiplier, rounded, ≤ 120 (§4.1),
 *  paid beside gift() and shown in the same line ("Villagers' gift +N"). */
export function gift4(s, s4) {
  const raw = GIFT4.perVillager * villagers4(s4) * perks(s).giftMul;
  return Math.min(GIFT4.cap, Math.round(raw));
}

/** The Fishers' catch for a cleared level: 20 / 40 / 60 gold by the Fishing Hut's tier (0 without it). */
export function catchGold(s4) {
  return perks4(s4).catchGold;
}

/** The Trophy Museum's gold for `captures` ships captured on a level: 15 / 30 / 50 each, ≤ 200 (§4.1). For the n-th
 *  capture's pop ("+30 Museum") main shows museumGold(s4, n) − museumGold(s4, n − 1). Junk counts as 0. */
export function museumGold(s4, captures) {
  return Math.min(MUSEUM.cap, perks4(s4).museumGold * count(captures));
}

/** The Aquarium's gold for `creatures` Voyage IV creatures driven off on a level (each puffer, Old Coilback, the
 *  Shellback): 10 / 20 / 30 each, ≤ 150 (§4.1). Junk counts as 0. */
export function aquariumGold(s4, creatures) {
  return Math.min(AQUARIUM.cap, perks4(s4).aquariumGold * count(creatures));
}

/** The Mermaid Grotto's rescue in a wreck: 10 / 20 / 30 % of the plunder lost (whole gold, rounded), ≤ 150 (§4.1).
 *  plunder: the gold the wreck loses (main: state.gold − goldAtLevelStart); junk or below 0 counts as 0. */
export function rescue(s4, plunder) {
  const pctNow = perks4(s4).rescuePct;
  const base = gold(plunder);
  if (pctNow <= 0 || base <= 0) return 0;
  return Math.min(RESCUE.cap, Math.round((Math.min(base, 1e9) * pctNow) / 100));
}
