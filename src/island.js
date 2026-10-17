// Building up Sparrow's Floating Island (SPEC3 §8): ten fixed plots on today's shack platforms (four homes
// that bring villagers, six amenities with one small perk each), the town's rank, the villagers' gift and
// the Market Hall's share of a cleared level's gold, and the island record (pirates-ahoy-island, §10.1).
//
// Pure: imports nothing (the Node tests load it as a data: URL). Every price and perk lives in PLOTS.
//
// STAGE 0 SCAFFOLD: the tables and the final §11.1 API returning safe defaults (nothing built, no perks
// beyond today's numbers). Stage 1D writes the rules and the record's validation.

const HOME = {
  kind: 'home',
  tiers: ['Cottage', 'Townhouse', 'Manor'],
  costs: [100, 250, 500],
  perk: { villagers: [2, 4, 6] },
  height: 7,
};

/** §8.1: the plots, their platforms, tiers, prices, perks and tier-3 height caps. */
export const PLOTS = [
  { id: 'homeA', name: 'Tavern Row', platform: 's16', x: -17.6, z: -17.4, ...HOME },
  { id: 'homeB', name: 'Lagoon End', platform: 's3', x: -0.5, z: -29.5, ...HOME },
  { id: 'homeC', name: "Tailor's Lane", platform: 's2', x: 13.4, z: -23.2, ...HOME },
  { id: 'homeD', name: 'Yard Corner', platform: 's7', x: 21.5, z: -22.5, ...HOME },
  { id: 'bakery', name: 'Biscuit Bakery', platform: 's8', x: -24, z: -9, kind: 'amenity', tiers: ['Bread oven', 'Bakery', 'Bakery & café'], costs: [200, 450, 800], perk: { wavePatch: [0.45, 0.55, 0.65] }, height: 7 },
  { id: 'windmill', name: 'Powder Windmill', platform: 's6', x: -26, z: -26, kind: 'amenity', tiers: ['Post mill', 'Stone mill', 'Powder mill'], costs: [250, 500, 900], perk: { extraLoads: [1, 2, 3] }, height: 10 },
  { id: 'lighthouse', name: 'Lighthouse', platform: 's18', x: 35, z: -12.5, kind: 'amenity', tiers: ['Beacon', 'Tower', 'Great light'], costs: [200, 450, 800], perk: { warnBonus: [0.3, 0.6, 0.9] }, height: 12 },
  { id: 'market', name: 'Market Hall', platform: 's15', x: -31, z: -16, kind: 'amenity', tiers: ['Stalls', 'Market hall', 'Grand bazaar'], costs: [250, 500, 900], perk: { marketPct: [5, 10, 15] }, height: 8 },
  { id: 'school', name: 'Sea School', platform: 's13', x: -21.5, z: 2.0, kind: 'amenity', tiers: ['Schoolroom', 'Bell tower', 'Academy'], costs: [150, 350, 600], perk: { hints: [1, 2, 3] }, height: 8 },
  { id: 'park', name: 'Flower Park', platform: 's14', x: -29, z: -4.5, kind: 'amenity', tiers: ['Flower beds', 'Fountain', 'Bandstand'], costs: [150, 350, 600], perk: { giftMul: [1.25, 1.5, 2] }, height: 5 },
];

/** §8.1: the town's rank by tiers built (of 30). */
export const RANKS = [
  { name: 'Hamlet', from: 0 },
  { name: 'Village', from: 5 },
  { name: 'Town', from: 12 },
  { name: 'Harbour Town', from: 20 },
  { name: 'Pirate Capital', from: 30 },
];

export const GIFT = { perVillager: 5, cap: 240 };
export const MARKET = { cap: 300 };
export const VILLAGER_CAP = 8;
const WAVE_PATCH = 0.35; // today's reinforcements patch (main's WAVE_REPAIR)

/** A fresh island: every plot at tier 0 (today's shacks). */
export function defaultIsland() {
  const t = {};
  for (const p of PLOTS) t[p.id] = 0;
  return { v: 1, t };
}

/** Read a stored island record. Never throws. (Stage 0: the default.) */
export function parseIsland(raw) {
  return defaultIsland();
}

export function serializeIsland(s) {
  const t = {};
  for (const p of PLOTS) t[p.id] = 0;
  return JSON.stringify({ v: 1, t });
}

export function tierOf(s, id) {
  return 0;
}

/** The next tier's price, or null for an unknown plot. (Stage 0: tier 1's.) */
export function nextCost(s, id) {
  const p = PLOTS.find((q) => q.id === id);
  return p ? p.costs[0] : null;
}

/** The sums of every tier's price: homes, amenities, the whole island. */
export function totals() {
  const sum = (kind) => PLOTS.filter((p) => p.kind === kind).reduce((n, p) => n + p.costs.reduce((a, b) => a + b, 0), 0);
  const homes = sum('home');
  const amenities = sum('amenity');
  return { homes, amenities, all: homes + amenities };
}

/** What the build panel shows for a plot. (Stage 0: tier 0, not affordable.) */
export function plotState(s, purse, id) {
  const p = PLOTS.find((q) => q.id === id);
  return { tier: 0, cost: p ? p.costs[0] : null, affordable: false, maxed: false, label: p ? p.name : '', now: '', next: p ? p.tiers[0] : '' };
}

/** Build a plot's next tier. (Stage 0: never.) */
export function build(s, purse, id) {
  return { ok: false, island: s && typeof s === 'object' ? s : defaultIsland(), cost: 0, reason: PLOTS.some((p) => p.id === id) ? 'poor' : 'unknown' };
}

/** The perks the island gives now. (Stage 0: today's numbers.) */
export function perks(s) {
  return { wavePatch: WAVE_PATCH, extraLoads: 0, warnBonus: 0, marketPct: 0, hints: 0, giftMul: 1 };
}

export function villagers(s) {
  return 0;
}

export function tiersBuilt(s) {
  return 0;
}

export function rank(s) {
  return { name: RANKS[0].name, tiers: 0, next: RANKS[1].from };
}

export function gift(s) {
  return 0;
}

export function market(s, banked) {
  return 0;
}
