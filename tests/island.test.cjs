// Unit checks for the island rules in src/island.js (plain Node, no browser), SPEC3 §8.1, §10.1, §13.1:
// - the PLOTS table exactly (ids, names, platforms, kinds, tier names, prices, perks, heights), RANKS, GIFT,
//   MARKET and VILLAGER_CAP, frozen; the totals 3,400 / 8,400 / 11,800 (from totals() and summed here)
// - tierOf / nextCost at every tier; build(): one tier at a time, its price, the reasons unknown / maxed / poor
//   (in that order), never changing its input; the whole island costs 11,800 exactly
// - plotState(): the panel's button text, "Now" and "Next", affordable and maxed, agreeing with build()
// - perks at every tier (tier 0 = today's numbers: main's WAVE_REPAIR, specials.js LOADS.windmill)
// - villagers 2 / 4 / 6 per home, 24 at most; the gift 5 × villagers × parkMul ≤ 240; the Market ≤ 300
// - ranks at 0, 4, 5, 11, 12, 19, 20, 29, 30 built tiers
// - parseIsland with the garbage battery of upgrades.test.cjs (cut JSON, arrays, __proto__, constructor,
//   throwing getters and proxies, megabytes, deep nesting, 1e1, 2.0, 2.5, Infinity, negatives, null, digit
//   strings); round trips; a record that needed fixing serializes differently (so main's loadRecord rewrites it)
// - mergeIsland (two tabs: each tier the larger)
// - junk in every argument of every function: no throws, well-formed results
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failures = 0;
let passes = 0;
function check(cond, msg) {
  console.log(`${cond === true ? 'PASS' : 'FAIL'}  ${msg}`);
  if (cond === true) passes++;
  else failures++;
}

// The game's modules are browser ES modules in a package without "type": "module". These import
// nothing, so they are loaded from their source as data: URLs (as in upgrades.test.cjs).
async function load(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (/^\s*import\s[^(]/m.test(src)) throw new Error(`${rel} has imports now; load it another way`);
  return import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = (v) => {
  if (typeof v === 'string') return JSON.stringify(v.length > 60 ? v.slice(0, 60) + '…' : v);
  if (typeof v === 'symbol' || typeof v === 'function' || typeof v === 'bigint') return String(v);
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
  try {
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s.length > 60 ? s.slice(0, 60) + '…' : s;
  } catch {
    try {
      return Object.prototype.toString.call(v);
    } catch {
      return '[a hostile object]';
    }
  }
};
const isInt = (v) => Number.isInteger(v) && !Object.is(v, -0);
// a seeded rng (mulberry32), so the random islands are the same every run
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

(async () => {
  const I = await load('src/island.js');

  // ------------------------------------------------------------------ the tables (§8.1)
  // [id, name, platform, x, z, kind, tier names, prices, perk key, perk at tiers 1..3, tier-3 height]
  const HOME_TIERS = ['Cottage', 'Townhouse', 'Manor'];
  const ROWS = [
    ['homeA', 'Tavern Row', 's16', -17.6, -17.4, 'home', HOME_TIERS, [100, 250, 500], 'villagers', [2, 4, 6], 7],
    ['homeB', 'Lagoon End', 's3', -0.5, -29.5, 'home', HOME_TIERS, [100, 250, 500], 'villagers', [2, 4, 6], 7],
    ['homeC', "Tailor's Lane", 's2', 13.4, -23.2, 'home', HOME_TIERS, [100, 250, 500], 'villagers', [2, 4, 6], 7],
    ['homeD', 'Yard Corner', 's7', 21.5, -22.5, 'home', HOME_TIERS, [100, 250, 500], 'villagers', [2, 4, 6], 7],
    ['bakery', 'Biscuit Bakery', 's8', -24, -9, 'amenity', ['Bread oven', 'Bakery', 'Bakery & café'], [200, 450, 800], 'wavePatch', [0.45, 0.55, 0.65], 7],
    ['windmill', 'Powder Windmill', 's6', -26, -26, 'amenity', ['Post mill', 'Stone mill', 'Powder mill'], [250, 500, 900], 'extraLoads', [1, 2, 3], 10],
    ['lighthouse', 'Lighthouse', 's18', 35, -12.5, 'amenity', ['Beacon', 'Tower', 'Great light'], [200, 450, 800], 'warnBonus', [0.3, 0.6, 0.9], 12],
    ['market', 'Market Hall', 's15', -31, -16, 'amenity', ['Stalls', 'Market hall', 'Grand bazaar'], [250, 500, 900], 'marketPct', [5, 10, 15], 8],
    ['school', 'Sea School', 's13', -21.5, 2.0, 'amenity', ['Schoolroom', 'Bell tower', 'Academy'], [150, 350, 600], 'hints', [1, 2, 3], 8],
    ['park', 'Flower Park', 's14', -29, -4.5, 'amenity', ['Flower beds', 'Fountain', 'Bandstand'], [150, 350, 600], 'giftMul', [1.25, 1.5, 2], 5],
  ];
  const IDS = ROWS.map((r) => r[0]);
  const HOMES = ROWS.filter((r) => r[5] === 'home').map((r) => r[0]);
  const AMENITIES = ROWS.filter((r) => r[5] === 'amenity').map((r) => r[0]);
  const ROW = Object.fromEntries(ROWS.map((r) => [r[0], r]));
  const PERKS0 = { wavePatch: 0.35, extraLoads: 0, warnBonus: 0, marketPct: 0, hints: 0, giftMul: 1 };
  const DEFAULT = { v: 1, t: Object.fromEntries(IDS.map((id) => [id, 0])) };
  const TEXT0 = '{"v":1,"t":{"homeA":0,"homeB":0,"homeC":0,"homeD":0,"bakery":0,"windmill":0,"lighthouse":0,"market":0,"school":0,"park":0}}';
  const island = (t = {}) => ({ v: 1, t: { ...DEFAULT.t, ...t } });

  {
    const fns = ['defaultIsland', 'parseIsland', 'serializeIsland', 'tierOf', 'nextCost', 'totals', 'plotState', 'build', 'perks', 'villagers', 'tiersBuilt', 'rank', 'gift', 'market'];
    const missing = [...fns, 'mergeIsland'].filter((k) => typeof I[k] !== 'function');
    check(missing.length === 0 && ['PLOTS', 'RANKS', 'GIFT', 'MARKET', 'VILLAGER_CAP'].every((k) => k in I), `every §11.1 export is there (PLOTS, RANKS, GIFT, MARKET, VILLAGER_CAP, ${fns.length} functions), and the helper mergeIsland (the storage listener)${missing.length ? ' -> missing ' + missing.join(', ') : ''}`);

    const want = ROWS.map(([id, name, platform, x, z, kind, tiers, costs, key, perk, height]) => ({ id, name, platform, x, z, kind, tiers, costs, perk: { [key]: perk }, height }));
    const bad = want.filter((w, i) => !same(I.PLOTS[i], w)).map((w) => `${w.id}: ${show(I.PLOTS.find((p) => p.id === w.id))}`);
    check(Array.isArray(I.PLOTS) && I.PLOTS.length === 10 && bad.length === 0, `PLOTS is exactly SPEC3 §8.1's table, in the panel's order (${IDS.join(', ')})${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    check(new Set(I.PLOTS.map((p) => p.id)).size === 10 && new Set(I.PLOTS.map((p) => p.platform)).size === 10, 'every plot has its own id and its own shack platform (one owner a plot)');
    const rising = I.PLOTS.every((p) => p.tiers.length === 3 && p.costs.length === 3 && p.costs.every((c, k) => isInt(c) && c > 0 && (k === 0 || c > p.costs[k - 1])) &&
      Object.keys(p.perk).length === 1 && Object.values(p.perk)[0].every((v, k, a) => typeof v === 'number' && v > 0 && (k === 0 || v > a[k - 1])) && p.tiers.every((n) => typeof n === 'string' && n.trim() === n && n.length > 0));
    check(rising, 'each plot has three named tiers; each tier costs more than the last and gives more than the last');
    check(same(I.RANKS, [{ name: 'Hamlet', from: 0 }, { name: 'Village', from: 5 }, { name: 'Town', from: 12 }, { name: 'Harbour Town', from: 20 }, { name: 'Pirate Capital', from: 30 }]), `RANKS: Hamlet 0–4, Village 5–11, Town 12–19, Harbour Town 20–29, Pirate Capital 30`);
    check(same(I.GIFT, { perVillager: 5, cap: 240 }) && same(I.MARKET, { cap: 300 }) && I.VILLAGER_CAP === 8, 'GIFT { perVillager: 5, cap: 240 }, MARKET { cap: 300 }, VILLAGER_CAP 8');
    const deepFrozen = (o) => !o || typeof o !== 'object' || (Object.isFrozen(o) && Object.values(o).every(deepFrozen));
    check(deepFrozen(I.PLOTS) && deepFrozen(I.RANKS) && deepFrozen(I.GIFT) && deepFrozen(I.MARKET), 'every table is frozen all the way down, so nothing can change a price or a perk by accident');
    const shared = I.PLOTS.filter((p) => p.kind === 'home');
    check(shared.every((p) => p !== shared[0] ? p.tiers !== shared[0].tiers && p.costs !== shared[0].costs && p.perk !== shared[0].perk : true), 'each home row has its own arrays (no row aliases another)');
  }

  // ------------------------------------------------------------------ totals (§8.1, §9): the exit check
  {
    const sum = (ids) => ids.reduce((n, id) => n + ROW[id][7].reduce((a, b) => a + b, 0), 0);
    const mine = { homes: sum(HOMES), amenities: sum(AMENITIES), all: sum(IDS) };
    const fromPlots = I.PLOTS.reduce((n, p) => n + p.costs.reduce((a, b) => a + b, 0), 0);
    const t = I.totals();
    check(same(t, { homes: 3400, amenities: 8400, all: 11800 }) && same(mine, t) && fromPlots === 11800,
      `totals: homes ${t.homes}, amenities ${t.amenities}, the island ${t.all} (the table summed here: ${mine.homes} / ${mine.amenities} / ${mine.all}; PLOTS summed: ${fromPlots})`);
    const tiers = I.PLOTS.reduce((n, p) => n + p.costs.length, 0);
    check(tiers === 30 && I.RANKS[I.RANKS.length - 1].from === tiers, `${tiers} tiers in all: the Pirate Capital (and the Governor's coat, cosmetics.js island ≥ 30) needs every one`);
  }

  // ------------------------------------------------------------------ the record: defaults
  {
    const d1 = I.defaultIsland();
    const d2 = I.defaultIsland();
    d1.t.homeA = 3;
    check(same(d2, DEFAULT) && d1.t !== d2.t && I.serializeIsland(I.defaultIsland()) === TEXT0, `defaultIsland: ${TEXT0} (the §10.1 text), a fresh object every call`);
    check(I.tiersBuilt(I.defaultIsland()) === 0 && I.villagers(I.defaultIsland()) === 0 && I.rank(I.defaultIsland()).name === 'Hamlet' && I.gift(I.defaultIsland()) === 0 && I.market(I.defaultIsland(), 5000) === 0,
      'a fresh island: nothing built, no villagers, a Hamlet, no gift and no Market share');
  }

  // ------------------------------------------------------------------ tierOf / nextCost
  {
    const problems = [];
    for (const id of IDS) {
      for (let t = 0; t <= 3; t++) {
        const rec = island({ [id]: t });
        for (const s of [rec, JSON.stringify(rec)]) {
          const want = t < 3 ? ROW[id][7][t] : null;
          if (I.tierOf(s, id) !== t) problems.push(`tierOf ${id} ${t}: ${I.tierOf(s, id)}`);
          if (I.nextCost(s, id) !== want) problems.push(`nextCost ${id} ${t}: ${I.nextCost(s, id)} (want ${want})`);
        }
      }
    }
    check(problems.length === 0, `tierOf and nextCost at every tier of every plot (from the record and from its text); null once fully built${problems.length ? ' -> ' + problems.slice(0, 6).join('; ') : ''}`);
    const unknown = ['nope', 'homeE', 'HOMEA', ' homeA', '', '__proto__', 'constructor', 'toString', 'hasOwnProperty', null, undefined, 1, {}, ['homeA'], Symbol('homeA')];
    const full = island(Object.fromEntries(IDS.map((id) => [id, 3])));
    const badU = unknown.filter((id) => I.tierOf(full, id) !== 0 || I.nextCost(DEFAULT, id) !== null).map(show);
    check(badU.length === 0, `unknown plots (${unknown.length}: '__proto__', 'constructor', wrong case, symbols…): tier 0, no price${badU.length ? ' -> ' + badU.join(', ') : ''}`);
    check(I.nextCost(null, 'homeA') === 100 && I.nextCost('garbage', 'lighthouse') === 200 && I.tierOf(undefined, 'park') === 0, 'a missing or broken record prices from tier 0');
  }

  // ------------------------------------------------------------------ build: order and reasons
  {
    const problems = [];
    for (const id of IDS) {
      let rec = I.defaultIsland();
      for (let t = 0; t < 3; t++) {
        const before = JSON.stringify(rec);
        const price = ROW[id][7][t];
        const r = I.build(rec, price, id);
        const wantT = { ...rec.t, [id]: t + 1 };
        if (!(r.ok === true && r.cost === price && r.reason === null && same(r.island, { v: 1, t: wantT }))) problems.push(`${id} ${t}->${t + 1}: ${show(r)}`);
        if (JSON.stringify(rec) !== before || r.island === rec || r.island.t === rec.t) problems.push(`${id} ${t}: changed or returned its input`);
        const poor = I.build(rec, price - 1, id);
        if (!(poor.ok === false && poor.reason === 'poor' && poor.cost === 0 && same(poor.island, rec))) problems.push(`${id} ${t} with ${price - 1}: ${show(poor)}`);
        rec = r.island;
      }
      const top = I.build(rec, 1e9, id);
      if (!(top.ok === false && top.reason === 'maxed' && top.cost === 0 && same(top.island, rec))) problems.push(`${id} at tier 3: ${show(top)}`);
    }
    check(problems.length === 0, `build: one tier at a time (0 → 1 → 2 → 3), each for exactly its price; a gold short is 'poor'; tier 3 is 'maxed'; the input is never changed${problems.length ? ' -> ' + problems.slice(0, 6).join('; ') : ''}`);

    const purses = [99, 0, -100, 99.9, NaN, Infinity, -Infinity, undefined, null, '1000', [1000], { valueOf: () => 1000 }, true, 1000n];
    const badP = purses.filter((p) => {
      const r = I.build(DEFAULT, p, 'homeA');
      return !(r.ok === false && r.reason === 'poor' && r.cost === 0 && same(r.island, DEFAULT));
    }).map(show);
    check(badP.length === 0, `build: a chest that isn't a finite number of gold ≥ the price is 'poor' (${purses.length} purses: 99, 99.9, NaN, Infinity, '1000', boxed, bigints…)${badP.length ? ' -> ' + badP.join(', ') : ''}`);
    const ok100 = I.build(DEFAULT, 100, 'homeA');
    const ok100s = I.build(TEXT0, 100.7, 'homeA');
    check(ok100.ok && ok100.cost === 100 && ok100s.ok && ok100s.cost === 100 && I.serializeIsland(ok100.island) === TEXT0.replace('"homeA":0', '"homeA":1'), 'build: a chest of exactly the price builds (from the record or its text); the new record is canonical');

    const unknownIds = ['nope', 'HOMEA', '__proto__', 'constructor', 'toString', '', null, undefined, 7, Symbol('x')];
    const badU = unknownIds.filter((id) => {
      const r = I.build(DEFAULT, 1e9, id);
      return !(r.ok === false && r.reason === 'unknown' && r.cost === 0 && same(r.island, DEFAULT));
    }).map(show);
    check(badU.length === 0, `build: an unknown plot is 'unknown' (${unknownIds.length} ids)${badU.length ? ' -> ' + badU.join(', ') : ''}`);
    const full = island(Object.fromEntries(IDS.map((id) => [id, 3])));
    check(I.build(DEFAULT, 0, 'castle').reason === 'unknown' && I.build(full, 0, 'park').reason === 'maxed' && I.build(full, NaN, 'nope').reason === 'unknown', "build: the reasons are checked in order (unknown, then maxed, then poor): an empty chest at a full plot is 'maxed', not 'poor'");
    const frozen = Object.freeze({ v: 1, t: Object.freeze({ ...DEFAULT.t, park: 2 }) });
    let threw = '';
    let fr;
    try {
      fr = I.build(frozen, 600, 'park');
    } catch (e) {
      threw = e.message;
    }
    check(!threw && fr.ok && fr.island.t.park === 3 && frozen.t.park === 2, 'build works on a frozen record (it never writes to its input)');

    // The whole island, bought with exactly 11,800 gold, in the panel's order and in 50 random orders.
    const runs = [];
    const orders = [IDS.flatMap((id) => [id, id, id])];
    const r = rng(7);
    for (let k = 0; k < 50; k++) {
      const bag = IDS.flatMap((id) => [id, id, id]);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      orders.push(bag);
    }
    let allOk = true;
    for (const order of orders) {
      let rec = I.defaultIsland();
      let purse = 11800;
      for (const id of order) {
        const b = I.build(rec, purse, id);
        if (!b.ok) {
          allOk = false;
          break;
        }
        purse -= b.cost;
        rec = b.island;
      }
      runs.push(purse);
      if (I.tiersBuilt(rec) !== 30 || purse !== 0 || I.build(rec, 1e9, order[0]).reason !== 'maxed') allOk = false;
    }
    // one gold short: the last build of the panel's order is refused
    let rec = I.defaultIsland();
    let purse = 11799;
    let last = null;
    for (const id of orders[0]) {
      last = I.build(rec, purse, id);
      if (!last.ok) break;
      purse -= last.cost;
      rec = last.island;
    }
    check(allOk && runs.every((p) => p === 0) && last.reason === 'poor' && I.tiersBuilt(rec) === 29, `the whole island (30 tiers) costs exactly 11,800 gold, in the panel's order and in 50 random orders; with 11,799 the last tier is 'poor'`);
  }

  // ------------------------------------------------------------------ plotState: what the panel shows (§8.3)
  {
    const cases = [
      [DEFAULT, 500, 'homeA', { tier: 0, cost: 100, affordable: true, maxed: false, label: 'Build Cottage — 100 gold', now: 'a little shack', next: 'Cottage · 2 villagers' }],
      [DEFAULT, 70, 'homeA', { tier: 0, cost: 100, affordable: false, maxed: false, label: 'Need 30 more gold', now: 'a little shack', next: 'Cottage · 2 villagers' }],
      [island({ homeA: 1 }), 250, 'homeA', { tier: 1, cost: 250, affordable: true, maxed: false, label: 'Upgrade to Townhouse — 250 gold', now: 'Cottage · 2 villagers', next: 'Townhouse · 4 villagers' }],
      [island({ homeB: 2 }), 0, 'homeB', { tier: 2, cost: 500, affordable: false, maxed: false, label: 'Need 500 more gold', now: 'Townhouse · 4 villagers', next: 'Manor · 6 villagers' }],
      [island({ homeC: 3 }), 9999, 'homeC', { tier: 3, cost: null, affordable: false, maxed: true, label: 'Fully built', now: 'Manor · 6 villagers', next: 'all done!' }],
      [DEFAULT, 200, 'bakery', { tier: 0, cost: 200, affordable: true, maxed: false, label: 'Build Bread oven — 200 gold', now: 'a little shack', next: 'Bread oven · crew patches 45% of the hull' }],
      [island({ bakery: 1 }), 449, 'bakery', { tier: 1, cost: 450, affordable: false, maxed: false, label: 'Need 1 more gold', now: 'Bread oven · crew patches 45% of the hull', next: 'Bakery · crew patches 55% of the hull' }],
      [island({ windmill: 2 }), 900, 'windmill', { tier: 2, cost: 900, affordable: true, maxed: false, label: 'Upgrade to Powder mill — 900 gold', now: 'Stone mill · +2 of each special shot', next: 'Powder mill · +3 of each special shot' }],
      [island({ lighthouse: 1 }), 0, 'lighthouse', { tier: 1, cost: 450, affordable: false, maxed: false, label: 'Need 450 more gold', now: 'Beacon · warnings 0.3 s longer', next: 'Tower · warnings 0.6 s longer' }],
      [island({ market: 3 }), 0, 'market', { tier: 3, cost: null, affordable: false, maxed: true, label: 'Fully built', now: "Grand bazaar · +15% of a level's gold", next: 'all done!' }],
      [island({ school: 0 }), 150, 'school', { tier: 0, cost: 150, affordable: true, maxed: false, label: 'Build Schoolroom — 150 gold', now: 'a little shack', next: 'Schoolroom · 1 lifebuoy a quiz' }],
      [island({ school: 1 }), 350, 'school', { tier: 1, cost: 350, affordable: true, maxed: false, label: 'Upgrade to Bell tower — 350 gold', now: 'Schoolroom · 1 lifebuoy a quiz', next: 'Bell tower · 2 lifebuoys a quiz' }],
      [island({ park: 2 }), 600, 'park', { tier: 2, cost: 600, affordable: true, maxed: false, label: 'Upgrade to Bandstand — 600 gold', now: "Fountain · villagers' gift +50%", next: "Bandstand · villagers' gift +100%" }],
      [DEFAULT, NaN, 'park', { tier: 0, cost: 150, affordable: false, maxed: false, label: 'Need 150 more gold', now: 'a little shack', next: "Flower beds · villagers' gift +25%" }],
      [DEFAULT, 99.5, 'homeD', { tier: 0, cost: 100, affordable: false, maxed: false, label: 'Need 1 more gold', now: 'a little shack', next: 'Cottage · 2 villagers' }],
      [island({ homeD: 1 }), -40, 'homeD', { tier: 1, cost: 250, affordable: false, maxed: false, label: 'Need 250 more gold', now: 'Cottage · 2 villagers', next: 'Townhouse · 4 villagers' }],
      [DEFAULT, 100, 'castle', { tier: 0, cost: null, affordable: false, maxed: false, label: '', now: '', next: '' }],
    ];
    const bad = cases.filter(([s, p, id, want]) => !same(I.plotState(s, p, id), want)).map(([s, p, id]) => `${id} (${show(p)} gold): ${JSON.stringify(I.plotState(s, p, id))}`);
    check(bad.length === 0, `plotState: the button ("Build Cottage — 100 gold", "Upgrade to Townhouse — 250 gold", "Need 30 more gold", "Fully built"), "Now" and "Next" (${cases.length} cases)${bad.length ? ' -> ' + bad.join('; ') : ''}`);

    // Every plot, every tier, a range of purses: plotState agrees with nextCost and build.
    const problems = [];
    for (const id of IDS) {
      for (let t = 0; t <= 3; t++) {
        const rec = island({ [id]: t });
        for (const purse of [0, 1, 99, 100, 149, 150, 499, 500, 899, 900, 5000, -5, NaN]) {
          const st = I.plotState(rec, purse, id);
          const b = I.build(rec, purse, id);
          const cost = I.nextCost(rec, id);
          const keys = Object.keys(st).join();
          if (keys !== 'tier,cost,affordable,maxed,label,now,next') problems.push(`${id} ${t}: fields ${keys}`);
          if (st.tier !== t || st.cost !== cost || st.maxed !== (t === 3) || st.affordable !== b.ok) problems.push(`${id} ${t} ${purse}: ${show(st)} vs build ${b.ok}`);
          if (!st.label || !st.now || !st.next || (b.ok && !st.label.endsWith(`${cost} gold`)) || (!b.ok && t < 3 && !/^Need \d+ more gold$/.test(st.label))) problems.push(`${id} ${t} ${purse}: label "${st.label}"`);
          if (t > 0 && !st.now.startsWith(ROW[id][6][t - 1])) problems.push(`${id} ${t}: now "${st.now}"`);
          if (t < 3 && !st.next.startsWith(ROW[id][6][t])) problems.push(`${id} ${t}: next "${st.next}"`);
        }
      }
    }
    check(problems.length === 0, `plotState at every tier of every plot with 13 purses: tier, price and maxed from the record, affordable exactly when build() succeeds, every text set${problems.length ? ' -> ' + problems.slice(0, 6).join('; ') : ''}`);
  }

  // ------------------------------------------------------------------ perks at every tier
  {
    check(same(I.perks(I.defaultIsland()), PERKS0) && same(I.perks(null), PERKS0) && same(I.perks('garbage'), PERKS0),
      `perks with nothing built are today's numbers: ${show(PERKS0)}`);
    // main.js's WAVE_REPAIR is what the reinforcements patch today; perks() at tier 0 must give the same.
    const mainSrc = (() => {
      try {
        return fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
      } catch {
        return '';
      }
    })();
    const wr = mainSrc.match(/const WAVE_REPAIR = ([\d.]+)/);
    if (wr) check(Number(wr[1]) === I.perks(I.defaultIsland()).wavePatch, `tier 0's wavePatch ${I.perks(I.defaultIsland()).wavePatch} is main.js's WAVE_REPAIR (${wr[1]}), so an island with no Bakery plays exactly as today`);
    else console.log('SKIP  main.js has no WAVE_REPAIR constant to compare with (main reads perks().wavePatch now)');
    // specials.js LOADS.windmill writes the Windmill's +1 / +2 / +3 too: they must agree.
    let S = null;
    try {
      S = await load('src/specials.js');
    } catch {
      S = null;
    }
    const mill = [0, 1, 2, 3].map((t) => I.perks(island({ windmill: t })).extraLoads);
    if (S && S.LOADS && Array.isArray(S.LOADS.windmill)) check(same(mill, S.LOADS.windmill), `the Powder Windmill gives +${mill.join(' / +')} loads at tiers 0–3, as specials.js LOADS.windmill (${S.LOADS.windmill.join(', ')})`);
    else console.log('SKIP  specials.js has no LOADS.windmill to compare with');

    const problems = [];
    for (const id of IDS) {
      for (let t = 0; t <= 3; t++) {
        const p = I.perks(island({ [id]: t }));
        const want = { ...PERKS0 };
        if (ROW[id][8] in PERKS0 && t > 0) want[ROW[id][8]] = ROW[id][9][t - 1];
        if (!same(p, want)) problems.push(`${id} ${t}: ${show(p)}`);
      }
    }
    check(problems.length === 0, 'perks at every tier of every plot: each amenity changes only its own perk (homes change none)');
    const r = rng(11);
    const badR = [];
    for (let k = 0; k < 500; k++) {
      const t = Object.fromEntries(IDS.map((id) => [id, Math.floor(r() * 4)]));
      const p = I.perks(JSON.stringify({ v: 1, t }));
      const want = { ...PERKS0 };
      for (const id of AMENITIES) if (t[id] > 0) want[ROW[id][8]] = ROW[id][9][t[id] - 1];
      if (!same(p, want)) badR.push(show(t));
    }
    check(badR.length === 0, `perks of 500 random islands: every perk read from its own plot's tier${badR.length ? ' -> ' + badR.slice(0, 3).join('; ') : ''}`);
    const top = I.perks(island(Object.fromEntries(IDS.map((id) => [id, 3]))));
    check(same(top, { wavePatch: 0.65, extraLoads: 3, warnBonus: 0.9, marketPct: 15, hints: 3, giftMul: 2 }), `everything built: ${show(top)}`);
  }

  // ------------------------------------------------------------------ villagers and the gift
  {
    const problems = [];
    let most = 0;
    for (let k = 0; k < 256; k++) {
      const t = Object.fromEntries(HOMES.map((id, i) => [id, (k >> (2 * i)) & 3]));
      const want = HOMES.reduce((n, id) => n + [0, 2, 4, 6][t[id]], 0);
      for (const park of [0, 1, 2, 3]) {
        const amen = Object.fromEntries(AMENITIES.map((id) => [id, id === 'park' ? park : (k + park) % 4]));
        const rec = island({ ...t, ...amen });
        const v = I.villagers(rec);
        const g = I.gift(rec);
        const wantG = Math.min(240, Math.round(5 * want * [1, 1.25, 1.5, 2][park]));
        if (v !== want) problems.push(`villagers ${show(t)}: ${v} (want ${want})`);
        if (g !== wantG || !isInt(g) || g < 0 || g > 240) problems.push(`gift ${show(t)} park ${park}: ${g} (want ${wantG})`);
        most = Math.max(most, v);
      }
    }
    check(problems.length === 0 && most === 24, `villagers: 2 / 4 / 6 a home by its tier, 24 at most, over all 256 home tiers (the amenities bring none); the gift 5 × villagers × the park's 1 / 1.25 / 1.5 / 2, whole gold, ≤ 240, at all 1,024 home and park tiers${problems.length ? ' -> ' + problems.slice(0, 6).join('; ') : ''}`);
    const ex = [
      [{ homeA: 1 }, 10], [{ homeA: 1, park: 1 }, 13], [{ homeA: 1, park: 3 }, 20], [{ homeA: 3, homeB: 3, homeC: 3, homeD: 3 }, 120],
      [{ homeA: 3, homeB: 3, homeC: 3, homeD: 3, park: 2 }, 180], [{ homeA: 3, homeB: 3, homeC: 3, homeD: 3, park: 3 }, 240], [{ park: 3 }, 0],
    ];
    const badE = ex.filter(([t, want]) => I.gift(island(t)) !== want).map(([t, want]) => `${show(t)}: ${I.gift(island(t))} (want ${want})`);
    check(badE.length === 0, `the gift: a cottage 10, with flower beds 13 (12.5 rounded), with the bandstand 20; 24 villagers 120, with the fountain 180, with the bandstand 240 (the cap); a park alone 0${badE.length ? ' -> ' + badE.join('; ') : ''}`);
  }

  // ------------------------------------------------------------------ the Market Hall
  {
    const cases = [
      [0, 1000, 0], [1, 1000, 50], [2, 1000, 100], [3, 1000, 150], [3, 2000, 300], [3, 2001, 300], [2, 5000, 300], [1, 6000, 300], [1, 1e6, 300],
      [1, 333, 17], [1, 330, 17], [1, 329, 16], [2, 15, 2], [3, 3, 0], [3, 0, 0], [3, -500, 0], [3, NaN, 0], [3, Infinity, 0], [3, undefined, 0], [3, '1000', 0], [3, null, 0], [3, 1e308, 300], [0, 1e308, 0], [2, 999.9, 100],
    ];
    const bad = cases.filter(([t, b, want]) => I.market(island({ market: t }), b) !== want).map(([t, b, want]) => `tier ${t}, ${show(b)} banked: ${I.market(island({ market: t }), b)} (want ${want})`);
    check(bad.length === 0, `market: 5 / 10 / 15 % of the level's banked gold (whole gold, rounded), at most 300, nothing without the Market Hall or on junk (${cases.length} cases)${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    let ok = true;
    for (let t = 0; t <= 3; t++) for (let b = 0; b <= 4000; b += 7) {
      const m = I.market(island({ market: t }), b);
      if (!isInt(m) || m < 0 || m > 300 || m !== Math.min(300, Math.round((b * [0, 5, 10, 15][t]) / 100))) ok = false;
    }
    check(ok, 'market at every tier for 0..4,000 banked gold: whole gold, 0..300');
  }

  // ------------------------------------------------------------------ ranks
  {
    const withTiers = (n) => {
      const t = {};
      for (const id of IDS) {
        const k = Math.min(3, n);
        t[id] = k;
        n -= k;
      }
      return island(t);
    };
    const want = [[0, 'Hamlet', 5], [4, 'Hamlet', 5], [5, 'Village', 12], [11, 'Village', 12], [12, 'Town', 20], [19, 'Town', 20], [20, 'Harbour Town', 30], [29, 'Harbour Town', 30], [30, 'Pirate Capital', null]];
    const bad = want.filter(([n, name, next]) => !same(I.rank(withTiers(n)), { name, tiers: n, next })).map(([n]) => `${n}: ${show(I.rank(withTiers(n)))}`);
    check(bad.length === 0, `rank at 0, 4, 5, 11, 12, 19, 20, 29, 30 tiers built: ${want.map(([n, name]) => `${n} ${name}`).join(', ')} (with the tiers the next rank needs)${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    let mono = true;
    let prev = -1;
    for (let n = 0; n <= 30; n++) {
      const r = I.rank(withTiers(n));
      const k = I.RANKS.findIndex((x) => x.name === r.name);
      if (I.tiersBuilt(withTiers(n)) !== n || k < prev || r.tiers !== n || (r.next !== null && r.next <= n)) mono = false;
      prev = k;
    }
    check(mono, 'tiersBuilt counts every tier on every plot; the rank only ever rises as the island grows');
  }

  // ------------------------------------------------------------------ parseIsland: the garbage battery (§10.1)
  {
    const parse = (raw) => {
      try {
        const s = I.parseIsland(raw);
        const okShape = s && Object.keys(s).join() === 'v,t' && s.v === 1 && Object.keys(s.t).join() === IDS.join() && Object.values(s.t).every((v) => isInt(v) && v >= 0 && v <= 3);
        return okShape ? { s } : { error: `invalid result ${show(s)}` };
      } catch (e) {
        return { error: `threw ${e && e.message}` };
      }
    };
    const hostile = {};
    Object.defineProperty(hostile, 't', { enumerable: true, get() { throw new Error('getter'); } });
    const hostileTier = { t: { homeB: 2 } };
    Object.defineProperty(hostileTier.t, 'homeA', { enumerable: true, get() { throw new Error('getter'); } });
    const proxy = new Proxy({}, { get() { throw new Error('proxy'); }, has() { throw new Error('proxy'); }, ownKeys() { throw new Error('proxy'); }, getOwnPropertyDescriptor() { throw new Error('proxy'); } });
    const { proxy: revoked, revoke } = Proxy.revocable({}, {});
    revoke();
    const junk = [
      null, undefined, '', ' ', 'garbage', 'garbage{', '{', '}', '{}', '[]', '[1,2,3]', 'null', 'true', 'false', '42', '"str"',
      'NaN', 'Infinity', '-Infinity', '1e400', '{"t":null}', '{"t":[]}', '{"t":[3,3,3,3,3,3,3,3,3,3]}', '{"t":"homeA"}', '[{"t":{"homeA":3}}]',
      '{"T":{"homeA":3}}', '{"v":1,"t":{"HomeA":3,"PARK":3}}', '{"v":1,"tiers":{"homeA":3}}', 42, -1, NaN, Infinity, true, false, [], [1, 2], {}, () => 1, Symbol('x'), 10n,
      new Date(0), /x/, new Map([['t', { homeA: 3 }]]), new Set(['homeA']), hostile, proxy, revoked,
      '\u0000', '\ud800', '{"t":{"homeA":3}', '{"v":1,"t":{"homeA":1,"park":2}', // a broken surrogate, JSON cut short
    ];
    const bad = [];
    for (const raw of junk) {
      const r = parse(raw);
      if (r.error) bad.push(`${show(raw)}: ${r.error}`);
      else if (!same(r.s, DEFAULT)) bad.push(`${show(raw)}: ${show(r.s)}`);
    }
    check(bad.length === 0, `parseIsland: ${junk.length} kinds of junk (cut JSON, arrays, wrong types, throwing getters, proxies, a revoked proxy, a Map…) all give the default${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    check(same(parse(hostileTier).s, island({ homeB: 2 })), 'a throwing getter on one tier counts as tier 0; the other tiers are kept');

    // Each tier: a plain integer (number or digit string), clamped to 0..3; anything else is 0.
    let sourceText = false;
    JSON.parse('1', (k, v, ctx) => {
      sourceText = !!(ctx && typeof ctx.source === 'string');
      return v;
    });
    const tierFrom = (lit, id = 'market') => {
      const r = parse(`{"v":1,"t":{"homeA":2,"${id}":${lit}}}`);
      return r.error ? r.error : r.s.t.homeA !== 2 ? 'lost the homeA tier' : r.s.t[id];
    };
    const cases = [
      ['1', 1], ['2', 2], ['3', 3], ['0', 0], ['-0', 0], ['4', 3], ['99999', 3], ['-1', 0], ['-3', 0], ['"1"', 1], ['" 2 "', 2], ['"3"', 3], ['"03"', 3], ['"7"', 3],
      ['"1e0"', 0], ['"2.5"', 0], ['"0x2"', 0], ['"Infinity"', 0], ['"NaN"', 0], ['""', 0], ['" "', 0], ['"1 2"', 0], ['"+1"', 0], ['"two"', 0],
      ['2.5', 0], ['1.5', 0], ['-0.5', 0], ['1e400', 0], ['-1e400', 0], ['123456789012345678901', 0], ['"123456789012345678901"', 0],
      ['null', 0], ['true', 0], ['false', 0], ['[1]', 0], ['{"v":1}', 0], ['{"__proto__":3}', 0],
      ...(sourceText ? [['1e0', 0], ['2.0', 0], ['1E0', 0], ['3.0', 0], ['30e-1', 0]] : []),
    ];
    const badT = cases.filter(([lit, want]) => tierFrom(lit) !== want).map(([lit, want]) => `${lit} -> ${tierFrom(lit)} (want ${want})`);
    check(badT.length === 0, `parseIsland: each tier is a plain integer clamped to 0..3, else 0 (${cases.length} cases${sourceText ? ', incl. number literals like 1e0 and 2.0' : ''})${badT.length ? ' -> ' + badT.join('; ') : ''}`);
    if (!sourceText) console.log('SKIP  this Node cannot see JSON number literals (1e0, 2.0), only their values; those cases were not run');
    const objectCases = [
      [1, 1], [3, 3], [4, 3], [-7, 0], [-0, 0], [NaN, 0], [Infinity, 0], [-Infinity, 0], [2.5, 0], [1 + Number.EPSILON, 0], [Number.MAX_SAFE_INTEGER + 2, 0],
      ['1', 1], [' 2 ', 2], ['1e1', 0], [null, 0], [true, 0], [[1], 0], [{ valueOf: () => 1 }, 0], [new Number(1), 0], [new String('2'), 0], [1n, 0], [Symbol('1'), 0],
    ];
    const badO = [];
    for (const [v, want] of objectCases) {
      const r = parse({ t: { park: v, school: 1 } });
      const got = r.error || r.s.t.park;
      if (got !== want || Object.is(got, -0) || (!r.error && r.s.t.school !== 1)) badO.push(`${show(v)} -> ${got}`);
    }
    check(badO.length === 0, `parseIsland on a record object: the same tier rules (NaN, ±Infinity, 2.5, -0, boxed numbers, bigints, too big…)${badO.length ? ' -> ' + badO.join('; ') : ''}`);
    const fbf = parse('{"v":1,"t":{"homeA":"1e1","homeB":2.5,"homeC":-3,"homeD":99,"bakery":null,"windmill":"2","lighthouse":1,"market":3,"school":"x","park":[2]}}');
    check(!fbf.error && same(fbf.s.t, { homeA: 0, homeB: 0, homeC: 0, homeD: 3, bakery: 0, windmill: 2, lighthouse: 1, market: 3, school: 0, park: 0 }), `parseIsland falls back tier by tier (${show(fbf.s || fbf.error)})`);

    // Unknown fields and plots, prototype tricks, inherited fields, other versions.
    const extra = parse('{"v":1,"t":{"homeA":1,"homeE":3,"castle":3,"toString":1,"constructor":3},"gold":999999,"villagers":24}');
    check(!extra.error && same(extra.s, island({ homeA: 1 })), `unknown fields and plot ids are dropped (${show(extra.s || extra.error)})`);
    const proto = parse('{"__proto__":{"t":{"homeA":3}},"t":{"__proto__":{"homeB":3},"constructor":{"prototype":{"polluted":1}}}}');
    const polluted = ({}).polluted !== undefined || Object.prototype.polluted !== undefined || ({}).homeB !== undefined || ({}).t !== undefined;
    check(!proto.error && same(proto.s, DEFAULT) && !polluted, `__proto__ / constructor tricks give the default and pollute nothing (${show(proto.s || proto.error)})`);
    const inherited = parse(Object.create({ t: { homeA: 3 } }));
    const inheritedTier = parse({ t: Object.create({ homeA: 3 }) });
    check(!inherited.error && same(inherited.s, DEFAULT) && same(inheritedTier.s, DEFAULT), 'inherited (non-own) fields and tiers are ignored');
    const v2 = parse('{"v":2,"t":{"park":2}}');
    const noV = parse('{"t":{"lighthouse":1}}');
    check(same(v2.s.t, island({ park: 2 }).t) && same(noV.s.t, island({ lighthouse: 1 }).t) && I.serializeIsland(noV.s) === TEXT0.replace('"lighthouse":0', '"lighthouse":1'),
      'the tiers are read whatever "v" says (or without it), and written back as v 1');

    // Size: ≤ 4 KB; megabytes and deep nesting are refused quickly.
    const valid = '{"v":1,"t":{"homeA":3,"park":1}}';
    const at4k = valid.slice(0, -1) + ' '.repeat(4096 - valid.length) + '}';
    const over = valid.slice(0, -1) + ' '.repeat(4097 - valid.length) + '}';
    check(at4k.length === 4096 && same(parse(at4k).s, island({ homeA: 3, park: 1 })) && over.length === 4097 && same(parse(over).s, DEFAULT),
      'a record of exactly 4 KB (4096 characters) is read; 4097 characters are refused (the default)');
    const times = [];
    const timed = (raw) => {
      const t0 = process.hrtime.bigint();
      const res = parse(raw);
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
      return res;
    };
    const huge = [
      ['2 MB of garbage', 'x'.repeat(2e6)],
      ['a 1 MB record', JSON.stringify({ v: 1, t: { homeA: 3 }, pad: 'a'.repeat(1e6) })],
      ['a 1 MB tier', `{"t":{"homeA":"${'1'.repeat(1e6)}"}}`],
      ['100k nested arrays', '['.repeat(1e5) + ']'.repeat(1e5)],
      ['2000 nested arrays (inside 4 KB)', '['.repeat(2000) + ']'.repeat(2000)],
      ['a deep object in a tier', `{"t":{"homeA":${'{"a":'.repeat(500)}1${'}'.repeat(500)}}}`],
      ['a deep object around the record', '{"t":'.repeat(500) + '1' + '}'.repeat(500)],
      ['a megabyte object', { t: { homeA: 'x'.repeat(1e6) } }],
    ];
    const badH = [];
    for (const [name, raw] of huge) {
      const res = timed(raw);
      if (res.error) badH.push(`${name}: ${res.error}`);
      else if (!same(res.s, DEFAULT)) badH.push(`${name}: ${show(res.s)}`);
    }
    check(badH.length === 0 && Math.max(...times) < 1000, `megabytes and deep nesting give the default quickly (slowest ${Math.max(...times).toFixed(1)} ms)${badH.length ? ' -> ' + badH.join('; ') : ''}`);

    // Round trips; serialize validates; a record that needed fixing is rewritten (main's loadRecord).
    const badRT = [];
    const recs = [];
    for (const id of IDS) for (let t = 0; t <= 3; t++) recs.push(island({ [id]: t }));
    const r = rng(3);
    for (let k = 0; k < 2000; k++) recs.push({ v: 1, t: Object.fromEntries(IDS.map((id) => [id, Math.floor(r() * 4)])) });
    for (const rec of recs) {
      const text = I.serializeIsland(rec);
      const back = parse(text);
      if (back.error || !same(back.s, rec) || I.serializeIsland(back.s) !== text || text !== JSON.stringify(rec)) badRT.push(text);
    }
    check(badRT.length === 0, `serialize → parse round trips every plot at every tier and 2,000 random islands, in the §10.1 text${badRT.length ? ' -> ' + badRT.slice(0, 3).join('; ') : ''}`);
    const rewrite = ['{"t":{"homeA":1}}', TEXT0.replace('}}', '},"x":1}'), TEXT0.replace('"park":0', '"park":"0"'), TEXT0.replace('"homeA":0', '"homeA":7'), ' ' + TEXT0, '{"v":1,"t":{"park":0,"homeA":0,"homeB":0,"homeC":0,"homeD":0,"bakery":0,"windmill":0,"lighthouse":0,"market":0,"school":0}}'];
    check(rewrite.every((raw) => I.serializeIsland(I.parseIsland(raw)) !== raw) && I.serializeIsland(I.parseIsland(TEXT0)) === TEXT0,
      'a stored record that needed fixing (missing plots, extra fields, digit strings, out of range, another key order) serializes differently, so loadRecord rewrites it; the canonical text is left alone');
    let text;
    let threw = '';
    try {
      text = [I.serializeIsland({ t: { homeA: 7, park: 'x', castle: 3, school: 2 }, extra: true }), ...[null, undefined, 'garbage', 42, Symbol('x'), proxy, revoked].map((v) => I.serializeIsland(v))];
    } catch (e) {
      threw = e.message;
    }
    check(!threw && text[0] === TEXT0.replace('"homeA":0', '"homeA":3').replace('"school":0', '"school":2') && text.slice(1).every((t) => t === TEXT0), `serializeIsland validates before writing; junk writes the default${threw ? ' -> ' + threw : ''}`);

    // Two tabs: each tier the larger (tiers only ever go up).
    const m = I.mergeIsland('{"v":1,"t":{"homeA":2,"park":1}}', { t: { homeA: 1, park: 3, market: 2 } });
    const full = island(Object.fromEntries(IDS.map((id) => [id, 3])));
    check(same(m, island({ homeA: 2, park: 3, market: 2 })) && same(I.mergeIsland(full, I.defaultIsland()), full) && same(I.mergeIsland('junk', proxy), DEFAULT), 'mergeIsland (the storage listener): each plot keeps the larger tier of the two tabs');
  }

  // ------------------------------------------------------------------ junk in, well-formed results out
  {
    const hostile = {};
    for (const k of ['v', 't', 'homeA', 'park', 'market', 'valueOf', 'toString']) {
      Object.defineProperty(hostile, k, { enumerable: true, get() { throw new Error('getter'); } });
    }
    const proxy = new Proxy({}, { get() { throw new Error('proxy'); }, has() { throw new Error('proxy'); }, ownKeys() { throw new Error('proxy'); }, getOwnPropertyDescriptor() { throw new Error('proxy'); } });
    const { proxy: revoked, revoke } = Proxy.revocable({}, {});
    revoke();
    const junk = [undefined, null, NaN, Infinity, -Infinity, -1, 0, -0, 0.5, 1e308, -1e308, '12', '', 'homeA', 'park', '__proto__', true, false, [], [1, 2], {}, () => 1, Symbol('x'), 10n, new Date(0), hostile, proxy, revoked,
      { v: 1, t: { homeA: NaN, park: -5, market: Infinity } }, { t: hostile }, TEXT0];
    const problems = [];
    const tryIt = (name, fn, ok) => {
      try {
        const r = fn();
        const why = ok(r);
        if (why !== true) problems.push(`${name}: ${why === false ? show(r) : why}`);
      } catch (e) {
        problems.push(`${name}: threw ${e && e.message}`);
      }
    };
    const okRec = (s) => s && s.v === 1 && Object.keys(s.t).join() === IDS.join() && Object.values(s.t).every((v) => isInt(v) && v >= 0 && v <= 3);
    const fin = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
    const okState = (st) => st && isInt(st.tier) && st.tier <= 3 && (st.cost === null || isInt(st.cost)) && typeof st.affordable === 'boolean' && typeof st.maxed === 'boolean' && ['label', 'now', 'next'].every((k) => typeof st[k] === 'string');
    const okBuild = (b) => b && typeof b.ok === 'boolean' && okRec(b.island) && isInt(b.cost) && (b.ok ? b.reason === null : ['unknown', 'maxed', 'poor'].includes(b.reason));
    const okPerks = (p) => p && Object.keys(p).join() === Object.keys(PERKS0).join() && Object.values(p).every(fin);
    const okRank = (r) => r && I.RANKS.some((x) => x.name === r.name) && isInt(r.tiers) && r.tiers <= 30 && (r.next === null || isInt(r.next));
    for (const j of junk) {
      const J = show(j);
      tryIt(`parseIsland(${J})`, () => [I.parseIsland(j), I.mergeIsland(j, j), I.mergeIsland(TEXT0, j), I.defaultIsland()], (rs) => rs.every(okRec));
      tryIt(`serializeIsland(${J})`, () => I.serializeIsland(j), (t) => typeof t === 'string' && okRec(JSON.parse(t)));
      tryIt(`tierOf(${J})`, () => [I.tierOf(j, j), I.tierOf(j, 'homeA'), I.tierOf(TEXT0, j)], (rs) => rs.every((t) => isInt(t) && t >= 0 && t <= 3));
      tryIt(`nextCost(${J})`, () => [I.nextCost(j, j), I.nextCost(j, 'park'), I.nextCost(TEXT0, j)], (rs) => rs.every((c) => c === null || isInt(c)));
      tryIt(`plotState(${J})`, () => [I.plotState(j, j, j), I.plotState(j, 500, 'homeA'), I.plotState(TEXT0, j, 'park'), I.plotState(TEXT0, 500, j)], (rs) => rs.every(okState));
      tryIt(`build(${J})`, () => [I.build(j, j, j), I.build(j, 1e6, 'homeA'), I.build(TEXT0, j, 'park'), I.build(TEXT0, 1e6, j)], (rs) => rs.every(okBuild));
      tryIt(`perks(${J})`, () => I.perks(j), okPerks);
      tryIt(`villagers(${J})`, () => [I.villagers(j), I.tiersBuilt(j)], ([v, t]) => isInt(v) && v >= 0 && v <= 24 && isInt(t) && t >= 0 && t <= 30);
      tryIt(`rank(${J})`, () => I.rank(j), okRank);
      tryIt(`gift(${J})`, () => [I.gift(j), I.market(j, j), I.market(j, 1000), I.market(TEXT0, j)], (rs) => rs.every((g) => isInt(g) && g >= 0 && g <= 300));
      tryIt(`totals(${J})`, () => I.totals(j), (t) => same(t, { homes: 3400, amenities: 8400, all: 11800 }));
    }
    const more = problems.length > 6 ? ` (+${problems.length - 6} more)` : '';
    check(problems.length === 0, `${junk.length} kinds of junk (missing, NaN, ±Infinity, huge, strings, arrays, functions, symbols, bigints, throwing getters, proxies, broken records) ` +
      `in every argument of every function: no throws, well-formed results${problems.length ? ' -> ' + problems.slice(0, 6).join('; ') + more : ''}`);
  }

  console.log(failures ? `\n${failures} check(s) failed` : `\nAll island checks passed (${passes})`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
