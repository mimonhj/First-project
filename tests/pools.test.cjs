// Unit checks for Voyage IV's wave pools and the voyage4 record in src/pools.js (SPEC4 §3.5, §10.1, §13.1), plain
// Node, no browser:
// - the tables exactly (V4_KINDS, KIND_COST, INTRO, POOL_RULES, PACKS, MEET, and POOLS, §3.5's table of the levels'
//   waves); the kinds are ships or parts, never both (SHIP_TYPES from shipTypes.js)
// - poolSeed: (level × 7919 + 13 + plays × 104729) >>> 0
// - drawWaves over 1,000 seeds per level (each level's own poolSeed(level, 0..999), and 1,000 random seeds more),
//   checked by this file's own reading of §3.5's rules (not by waveProblems): each wave starts with its must, keeps
//   ≤ 3 slots, ≤ 2 of a kind, at most one puffer patch, none of the never-pairs, at most one of {witch, coilback,
//   fort}, draws only from its list, never a kind before its INTRO wave; spends ≥ budget − 1 in ≥ 95 % of draws;
//   level 12's wave 2 holds a Voyage IV kind wave 1 lacked; waveProblems agrees with every draw
// - a whole voyage (levels 10, 11, 12): no unmet kind and at most one new kind a wave (first in it, alone)
// - determinism: the same (level, plays) gives the same waves (Try again), no hidden state, plays + 1 changes at least
//   one wave in ≥ 90 % of seeds; the redraw rule (equal to the previous wave, under budget) on made-up pools
// - waveProblems catches each rule broken on its own; slotsOf, isPseudo; nextWaveAt keeps ≤ 4 slots alive (§2.3–2.5's
//   values, and act4.js's levels once they carry pools)
// - parseVoyage4 with the garbage battery of upgrades.test.cjs (cut JSON, arrays, __proto__, constructor, throwing
//   getters and proxies, megabytes, deep nesting, 1e1, 2.0, 2.5, Infinity, negatives, null, digit strings, unknown
//   prize keys), round trips, the rewrite of a record that needed fixing; mergeVoyage4; notePlay (caps at 9999), meet
//   (the first time once), markTip, notePrize; junk in every argument of every function
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

// pools.js, shipTypes.js and cosmetics.js import nothing: they load from their source as data: URLs (no build step,
// no "module type" warning). act4.js imports the env modules (three.js), swapped for stand-ins, and pools.js.
const dataUrl = (src) => 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');
const source = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
async function load(rel) {
  const src = source(rel);
  if (/^\s*import\s[^(]/m.test(src)) throw new Error(`${rel} has imports now; load it another way`);
  return import(dataUrl(src));
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isInt = (v) => Number.isInteger(v) && !Object.is(v, -0);
const show = (v) => {
  if (typeof v === 'string') return JSON.stringify(v.length > 60 ? v.slice(0, 60) + '…' : v);
  if (typeof v === 'symbol' || typeof v === 'function' || typeof v === 'bigint') return String(v);
  try {
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s.length > 70 ? s.slice(0, 70) + '…' : s;
  } catch {
    return '[a hostile object]';
  }
};
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pct = (n, d) => `${((100 * n) / d).toFixed(1)} %`;

// ---------------------------------------------------------------------------------------- the contract (§3.5, §10.1)
// This file's own copy of the numbers: the module's tables are checked against it, then the draws are checked with it.
const V4 = ['jolly', 'stinger', 'netsloop', 'puffer', 'witch', 'coilback', 'fort', 'shellback'];
const COST = { corsair: 2, privateer: 2, shark: 2, skiff: 2, puffer: 2, bombketch: 3, jolly: 3, stinger: 3, netsloop: 3, fort: 3, ironclad: 4, witch: 4, coilback: 5 };
const INTRO_AT = { jolly: [10, 0], stinger: [10, 1], netsloop: [10, 2], puffer: [11, 0], witch: [11, 1], coilback: [11, 2], fort: [12, 0] };
const PSEUDO = ['jolly', 'puffer', 'coilback', 'fort', 'shellback'];
const SHIPS4 = ['stinger', 'netsloop', 'witch'];
const F11 = ['jolly', 'stinger', 'netsloop', 'corsair', 'privateer', 'bombketch', 'ironclad'];
const F12 = ['jolly', 'stinger', 'netsloop', 'puffer', 'witch', 'coilback', 'corsair', 'privateer', 'shark', 'skiff', 'bombketch', 'ironclad'];
const WANT_POOLS = {
  10: [
    { budget: 5, slots: 2, must: 'jolly', from: ['corsair', 'privateer', 'shark'] },
    { budget: 6, slots: 2, must: 'stinger', from: ['corsair', 'privateer', 'shark', 'jolly'] },
    { budget: 8, slots: 3, must: 'netsloop', from: ['corsair', 'privateer', 'shark', 'jolly', 'stinger'] },
  ],
  11: [
    { budget: 6, slots: 2, must: 'puffer', from: F11 },
    { budget: 7, slots: 2, must: 'witch', from: [...F11, 'puffer'] },
    { budget: 9, slots: 3, must: 'coilback', from: [...F11, 'puffer', 'witch', 'shark', 'skiff'], attackers: 3 },
  ],
  12: [
    { budget: 8, slots: 3, must: 'fort', from: F12 },
    { budget: 9, slots: 3, must: null, lacked: true, from: F12 }, // one Voyage IV kind that wave 1 lacked, by weight
  ],
};
const NEXT_WAVE_AT = { 10: 1, 11: 1, 12: 0 }; // §2.3–2.5's defs: nextWaveAt 1 on L10–11, 0 on L12
const LEVELS = [10, 11, 12];
const sum = (w) => w.reduce((s, k) => s + (COST[k] || 0), 0);
const count = (w, k) => w.filter((x) => x === k).length;
const before = (k, level, i) => !!INTRO_AT[k] && (level < INTRO_AT[k][0] || (level === INTRO_AT[k][0] && i < INTRO_AT[k][1]));
const introducedAt = (k, level, i) => !!INTRO_AT[k] && INTRO_AT[k][0] === level && INTRO_AT[k][1] === i;
const setOf = (w) => [...new Set(w)].sort().join();
const bag = (w) => [...w].sort().join();

// §3.5's hard rules for wave i of a level, read independently of the module: what this wave breaks.
function breaks(level, i, wave, prev, e) {
  const out = [];
  if (!Array.isArray(wave) || !wave.length) return ['empty'];
  for (const k of wave) if (typeof k !== 'string' || !(k in COST)) out.push(`unknown ${show(k)}`);
  if (wave.length > 3 || wave.length > e.slots) out.push(`${wave.length} slots`);
  if (sum(wave) > e.budget) out.push(`spends ${sum(wave)} > ${e.budget}`);
  if (e.must) {
    if (wave[0] !== e.must) out.push(`starts with ${wave[0]}, not ${e.must}`);
  } else if (!(V4.includes(wave[0]) && e.from.includes(wave[0]) && !prev.includes(wave[0]))) {
    out.push(`starts with ${wave[0]}, not a Voyage IV kind of its list the last wave lacked`);
  }
  wave.forEach((k, j) => (j > 0 || !e.must) && !e.from.includes(k) && out.push(`${k} is not in its list`));
  for (const k of new Set(wave)) {
    if (count(wave, k) > 2) out.push(`${count(wave, k)} × ${k}`);
    if (before(k, level, i)) out.push(`${k} before its INTRO wave`);
    if (introducedAt(k, level, i) && (count(wave, k) > 1 || wave[0] !== k)) out.push(`${k} new but not first and alone`);
  }
  if (count(wave, 'puffer') > 1) out.push('two puffer patches');
  if (count(wave, 'netsloop') > 1) out.push('two Net Sloops');
  if (wave.includes('witch') && wave.includes('bombketch')) out.push('a Witch with a Bomb Ketch');
  if (wave.filter((k) => ['witch', 'coilback', 'fort'].includes(k)).length > 1) out.push('more than one of witch, coilback, fort');
  return out;
}

// The hostile values every parser and every argument meets.
function hostiles() {
  const hostile = {};
  for (const k of ['v', 'plays', 'met', 'won', 'tips', 'prizes', 'budget', 'slots', 'must', 'from', '0', 'length', 'valueOf', 'toString']) {
    Object.defineProperty(hostile, k, { enumerable: true, get() { throw new Error('getter'); } });
  }
  const trap = () => { throw new Error('proxy'); };
  const proxy = new Proxy({}, { get: trap, has: trap, ownKeys: trap, getOwnPropertyDescriptor: trap, getPrototypeOf: trap });
  const arrayProxy = new Proxy([1, 2, 3], { get: trap, has: trap, ownKeys: trap, getOwnPropertyDescriptor: trap });
  const { proxy: revoked, revoke } = Proxy.revocable({}, {});
  revoke();
  const { proxy: revokedArray, revoke: revokeArray } = Proxy.revocable([], {});
  revokeArray();
  return { hostile, proxy, arrayProxy, revoked, revokedArray };
}

(async () => {
  const P = await load('src/pools.js');
  const { SHIP_TYPES } = await load('src/shipTypes.js');
  const C = await load('src/cosmetics.js');

  // ------------------------------------------------------------------ exports
  {
    const fns = ['poolSeed', 'drawWaves', 'waveProblems', 'slotsOf', 'isPseudo', 'defaultVoyage4', 'parseVoyage4', 'serializeVoyage4', 'mergeVoyage4', 'notePlay', 'meet', 'markTip', 'notePrize'];
    const consts = ['V4_KINDS', 'KIND_COST', 'INTRO', 'POOL_RULES', 'PACKS', 'MEET', 'POOLS'];
    const missing = [...fns.filter((k) => typeof P[k] !== 'function'), ...consts.filter((k) => !(k in P))];
    check(missing.length === 0, `every §11.1 export is there (${consts.length - 1} tables, ${fns.length} functions) and POOLS, §3.5's table of the levels' waves${missing.length ? ' -> missing ' + missing.join(', ') : ''}`);
    check(!/^\s*import\s/m.test(source('src/pools.js')), 'pools.js is pure: it imports nothing');
  }

  // ------------------------------------------------------------------ the tables exactly
  {
    check(same(P.V4_KINDS, V4), `V4_KINDS in met-bit order: ${P.V4_KINDS.join(', ')} (the Shellback is bit ${1 << P.V4_KINDS.indexOf('shellback')})`);
    check(same(P.KIND_COST, COST) && Object.keys(P.KIND_COST).length === 13, `KIND_COST: corsair, privateer, shark, skiff, puffer 2; bombketch, jolly, stinger, netsloop, fort 3; ironclad, witch 4; coilback 5 (${show(P.KIND_COST)})`);
    check(['fireship', 'cutter', 'prahu', 'junk', 'shellback', 'kraken', 'manowar'].every((k) => !(k in P.KIND_COST)), 'the fire ship and Voyage I\'s cutters, prahus and junks (and the bosses) are not pool kinds');
    check(same(P.INTRO, INTRO_AT), `INTRO: each new kind's introducing wave [level, index] (${show(P.INTRO)})`);
    const R = P.POOL_RULES;
    check(R.slots === 3 && R.perKind === 2 && R.patches === 1 && R.alive === 4 && R.puffersAlive === 6 && R.redraws === 8 && R.slack === 1 &&
      same(R.never, [['netsloop', 'netsloop'], ['witch', 'bombketch']]) && same(R.oneOf, ['witch', 'coilback', 'fort']) && same(R.weight, { v4: 2, old: 1 }),
      `POOL_RULES: ≤ 3 slots, ≤ 2 of a kind, 1 puffer patch, ≤ 4 alive, ≤ 6 puffers, never two Net Sloops or a Witch with a Bomb Ketch, one of {witch, coilback, fort}, 8 redraws under budget − 1, weights 2 / 1 (${show(R)})`);
    check(same(P.PACKS, { jolly: 5, puffer: 4 }) && same(P.MEET, { card: 3.5, grace: 4, newTag: 10 }), `PACKS ${show(P.PACKS)}, MEET ${show(P.MEET)}`);
    check(same(P.POOLS, WANT_POOLS), `POOLS is §3.5's table: L10 5/2 jolly, 6/2 stinger, 8/3 netsloop; L11 6/2 puffer, 7/2 witch, 9/3 coilback (attackers 3); L12 8/3 fort, 9/3 a kind wave 1 lacked (must null, lacked: true)`);
    // The draw reads a must of null as the lacked rule, with or without the marker.
    const unmarked = P.POOLS[12].map((e) => ({ budget: e.budget, slots: e.slots, must: e.must, from: e.from }));
    check([0, 1, 2, 77, 4096].every((p) => same(P.drawWaves(12, unmarked, P.poolSeed(12, p)), P.drawWaves(12, P.POOLS[12], P.poolSeed(12, p)))), 'a must of null draws the same with or without `lacked: true` (the marker only names the rule)');
    const frozen = (o) => Object.isFrozen(o) && Object.values(o).every((v) => !v || typeof v !== 'object' || frozen(v));
    check(['V4_KINDS', 'KIND_COST', 'INTRO', 'POOL_RULES', 'PACKS', 'MEET', 'POOLS'].every((k) => frozen(P[k])), 'every table is frozen all the way down');
    // INTRO and POOLS agree: each introducing wave's must is its kind; every Voyage IV kind but the Shellback has a cost
    // and an introducing wave.
    const bad = Object.entries(INTRO_AT).filter(([k, [L, i]]) => !P.POOLS[L] || P.POOLS[L][i].must !== k).map(([k]) => k);
    check(bad.length === 0 && V4.filter((k) => k !== 'shellback').every((k) => k in COST && k in INTRO_AT), `each kind's INTRO wave has it as its must; every Voyage IV kind but the Shellback has a cost and an INTRO${bad.length ? ' -> ' + bad.join(', ') : ''}`);
    // Not ships (§0.1): the pool's ship kinds are SHIP_TYPES keys, its parts are not, and isPseudo tells them apart.
    const wrong = [...Object.keys(COST), 'shellback'].filter((k) => P.isPseudo(k) === k in SHIP_TYPES || P.isPseudo(k) !== PSEUDO.includes(k));
    check(wrong.length === 0, `every pool kind is a ship (a SHIP_TYPES key) or a part (isPseudo), never both: parts ${PSEUDO.join(', ')}${wrong.length ? ' -> ' + wrong.join(', ') : ''}`);
  }

  // ------------------------------------------------------------------ poolSeed
  {
    const bad = [];
    for (const L of LEVELS) for (let p = 0; p <= 9999; p += 7) {
      const want = (L * 7919 + 13 + p * 104729) >>> 0;
      if (P.poolSeed(L, p) !== want) bad.push(`${L}/${p}`);
    }
    check(bad.length === 0 && P.poolSeed(10, 0) === 79203 && P.poolSeed(12, 1) === 199770 && P.poolSeed(11, 9999) === (11 * 7919 + 13 + 9999 * 104729) >>> 0,
      `poolSeed(level, plays) = (level × 7919 + 13 + plays × 104729) >>> 0 (L10 play 0: ${P.poolSeed(10, 0)}, the level's n × 7919 + 13)${bad.length ? ' -> ' + bad.slice(0, 4).join(', ') : ''}`);
    const junk = [undefined, null, NaN, Infinity, -Infinity, '10', {}, [], 1e300, -5, 10.7];
    const out = junk.flatMap((j) => [P.poolSeed(j, 0), P.poolSeed(10, j)]);
    check(out.every((s) => Number.isInteger(s) && s >= 0 && s <= 0xffffffff) && P.poolSeed(10.7, 0.9) === P.poolSeed(10, 0), 'poolSeed of junk is still a uint32 (non-finite reads as 0, fractions floor)');
  }

  // ------------------------------------------------------------------ drawWaves: 1,000 seeds per level, every rule
  for (const L of LEVELS) {
    const pool = P.POOLS[L];
    const N = 1000;
    const broke = [];
    const disagree = [];
    const spend = pool.map(() => 0);
    const same2 = pool.map(() => 0);
    let lacked = 0;
    const kinds = new Set();
    const draws = new Set();
    const run = (seed, soft) => {
      const waves = P.drawWaves(L, pool, seed);
      if (!Array.isArray(waves) || waves.length !== pool.length) {
        broke.push(`seed ${seed}: ${show(waves)}`);
        return;
      }
      draws.add(JSON.stringify(waves));
      waves.forEach((w, i) => {
        const prev = i ? waves[i - 1] : [];
        const b = breaks(L, i, w, prev, pool[i]);
        if (b.length) broke.push(`seed ${seed} wave ${i + 1} ${show(w)}: ${b.join('; ')}`);
        const wp = P.waveProblems(L, i, w, i ? prev : null, pool);
        if (!Array.isArray(wp) || wp.length !== b.length || (b.length === 0) !== (wp.length === 0)) disagree.push(`seed ${seed} wave ${i + 1} ${show(w)}: ${show(wp)}`);
        w.forEach((k) => kinds.add(k));
        if (!soft) return;
        if (sum(w) >= pool[i].budget - 1) spend[i]++;
        if (i && setOf(w) === setOf(prev)) same2[i]++;
      });
      if (soft && L === 12 && waves[1].some((k) => V4.includes(k) && !waves[0].includes(k))) lacked++;
    };
    for (let p = 0; p < N; p++) run(P.poolSeed(L, p), true);
    const r = mulberry32(0xbeef + L);
    for (let k = 0; k < N; k++) run(Math.floor(r() * 4294967296), false);
    check(broke.length === 0, `L${L}: ${N} seeds (poolSeed(${L}, 0..${N - 1})) + ${N} random seeds: every wave starts with its must, ≤ 3 slots and its own, within budget, ≤ 2 of a kind, one puffer patch at most, no never-pair, one of {witch, coilback, fort} at most, only its list, no kind before its INTRO wave (${draws.size} different voyages, kinds ${[...kinds].join(', ')})${broke.length ? ' -> ' + broke.slice(0, 3).join(' | ') : ''}`);
    check(disagree.length === 0, `L${L}: waveProblems finds nothing in any of these draws, as this file's own reading of the rules${disagree.length ? ' -> ' + disagree.slice(0, 3).join(' | ') : ''}`);
    check(spend.every((n) => n >= 0.95 * N), `L${L}: each wave spends ≥ its budget − 1 in ≥ 95 % of the ${N} draws (${spend.map((n, i) => `wave ${i + 1} ${pct(n, N)}`).join(', ')})`);
    check(same2.every((n) => n === 0), `L${L}: no wave equals the wave before it as a set (${same2.slice(1).join(', ')} of ${N}; the redraw rule itself is checked on made-up pools below)`);
    if (L === 12) check(lacked === N, `L12: wave 2 holds a Voyage IV kind wave 1 lacked in every draw (${lacked} of ${N})`);
  }

  // ------------------------------------------------------------------ a whole voyage: no unmet kind, one new kind a wave
  {
    const bad = [];
    let allMet = 0;
    const N = 1000;
    for (let k = 0; k < N; k++) {
      const plays = { 10: k, 11: (k * 31 + 7) % N, 12: (k * 97 + 3) % N }; // each level at its own number of plays
      const met = new Set();
      for (const L of LEVELS) {
        P.drawWaves(L, P.POOLS[L], P.poolSeed(L, plays[L])).forEach((w, i) => {
          const fresh = [...new Set(w.filter((x) => V4.includes(x) && !met.has(x)))];
          if (fresh.length > 1) bad.push(`L${L} wave ${i + 1} ${show(w)}: ${fresh.length} new kinds`);
          else if (fresh.length === 1 && (w[0] !== fresh[0] || count(w, fresh[0]) !== 1 || !introducedAt(fresh[0], L, i))) bad.push(`L${L} wave ${i + 1} ${show(w)}: ${fresh[0]} new but not its first and only one, or not its INTRO wave`);
          w.forEach((x) => met.add(x));
        });
      }
      if (Object.keys(INTRO_AT).every((x) => met.has(x))) allMet++;
    }
    check(bad.length === 0, `${N} voyages (L10 → L11 → L12, each at its own plays): a wave holds no kind the voyage hasn't met but its must, and at most one new kind, first and alone${bad.length ? ' -> ' + bad.slice(0, 3).join(' | ') : ''}`);
    check(allMet === N, `every voyage meets all seven new kinds, each at its introducing wave (${allMet} of ${N})`);
    check(P.drawWaves.length === 3, 'the draw takes (level, pool, seed) only: it never reads voyage4.met, so Try again is identical after the first try met new kinds');
  }

  // ------------------------------------------------------------------ determinism, Try again, variety
  {
    const bad = [];
    for (const L of LEVELS) for (let p = 0; p < 200; p++) {
      const s = P.poolSeed(L, p);
      const a = P.drawWaves(L, P.POOLS[L], s);
      const b = P.drawWaves(L, JSON.parse(JSON.stringify(P.POOLS[L])), s); // a copy of the pool draws the same
      if (!same(a, b)) bad.push(`${L}/${p}`);
    }
    check(bad.length === 0, `the same (level, plays) gives the same waves, from the pool or a copy of it (Try again replays them)${bad.length ? ' -> ' + bad.slice(0, 4).join(', ') : ''}`);
    // No hidden state: a draw between two others doesn't change them; the result is fresh; the pool is untouched.
    const first = P.drawWaves(11, P.POOLS[11], 12345);
    for (const L of LEVELS) P.drawWaves(L, P.POOLS[L], 777);
    const again = P.drawWaves(11, P.POOLS[11], 12345);
    again[0].push('corsair');
    again.push(['fort']);
    const third = P.drawWaves(11, P.POOLS[11], 12345);
    const copy = JSON.parse(JSON.stringify(WANT_POOLS[11]));
    const before = JSON.stringify(copy);
    P.drawWaves(11, copy, 1);
    check(same(first, third) && !same(again, third) && JSON.stringify(copy) === before, 'no hidden state: other draws in between change nothing, the waves are a fresh array every call, and the pool is never changed');
    // plays + 1 draws new seas: at least one wave changes (as a bag of kinds) in ≥ 90 % of seeds.
    const N = 1000;
    for (const L of LEVELS) {
      let changed = 0;
      for (let p = 0; p < N; p++) {
        const a = P.drawWaves(L, P.POOLS[L], P.poolSeed(L, p));
        const b = P.drawWaves(L, P.POOLS[L], P.poolSeed(L, p + 1));
        if (a.some((w, i) => bag(w) !== bag(b[i]))) changed++;
      }
      check(changed >= 0.9 * N, `L${L}: a clear (plays + 1) changes at least one wave in ≥ 90 % of seeds (${pct(changed, N)})`);
    }
  }

  // ------------------------------------------------------------------ the redraw rule, on made-up pools
  {
    const N = 1000;
    // Two waves that come out equal (as a set) half the time: the redraws make it rare.
    const twin = { budget: 4, slots: 2, must: 'corsair', from: ['privateer', 'corsair'] };
    let equal = 0;
    for (let s = 0; s < N; s++) {
      const [a, b] = P.drawWaves(10, [twin, twin], s * 2654435761);
      if (setOf(a) === setOf(b)) equal++;
    }
    check(equal <= 0.02 * N, `a wave equal to the wave before it (as a set) is drawn again: ${equal} of ${N} still equal (half would be, without the redraws; ≤ 0.2 % expected after 8)`);
    // Under budget − 1 half the time: drawn again.
    const thin = { budget: 6, slots: 2, must: 'corsair', from: ['privateer', 'ironclad'] };
    let under = 0;
    for (let s = 0; s < N; s++) if (sum(P.drawWaves(10, [thin], s * 40503 + 1)[0]) < 5) under++;
    check(under <= 0.02 * N, `a wave spending under its budget − 1 is drawn again: ${under} of ${N} still under (half would be without the redraws)`);
    // When no other draw is possible, the last draw stands (no endless loop, no throw).
    const only = { budget: 2, slots: 1, must: 'corsair', from: [] };
    const stuck = P.drawWaves(10, [only, only, { budget: 9, slots: 3, must: 'corsair', from: [] }], 3);
    check(same(stuck, [['corsair'], ['corsair'], ['corsair']]), `after 8 redraws the last draw stands: a wave equal to the last, or under budget, when nothing else can be drawn (${show(stuck)})`);
  }

  // ------------------------------------------------------------------ weights, and a pool that lists kinds too early
  {
    // L10 wave 2's second slot: corsair, privateer, shark (1 each) and jolly (2): jolly 2 / 5 of the time, not 1 / 4.
    const N = 4000;
    let jolly = 0;
    const picked = {};
    const expect = {}; // each kind's expected picks: 1 / (the candidates' count) in every draw it was a candidate
    for (let p = 0; p < N; p++) {
      if (P.drawWaves(10, P.POOLS[10], P.poolSeed(10, p))[1][1] === 'jolly') jolly++;
      const ws = P.drawWaves(12, P.POOLS[12], P.poolSeed(12, p));
      const can = F12.filter((k) => V4.includes(k) && !ws[0].includes(k)); // (every Voyage IV kind weighs 2, all fit)
      for (const k of can) expect[k] = (expect[k] || 0) + 1 / can.length;
      picked[ws[1][0]] = (picked[ws[1][0]] || 0) + 1;
    }
    const off = Object.keys(expect).filter((k) => Math.abs((picked[k] || 0) - expect[k]) > 0.1 * expect[k]);
    check(Math.abs(jolly / N - 0.4) < 0.03, `picks by weight, Voyage IV kinds 2 and older kinds 1: L10 wave 2's second slot is the Monkey Jollyboats ${pct(jolly, N)} of the time (2 / 5 = 40 %; 25 % if unweighted)`);
    check(off.length === 0 && Object.keys(picked).every((k) => k in expect), `L12 wave 2's must is one Voyage IV kind wave 1 lacked, by weight: each kind picked as often as its share of the candidates says (${Object.keys(expect).map((k) => `${k} ${picked[k] || 0} / ${expect[k].toFixed(0)}`).join(', ')})`);
    // A pool that lists kinds before their INTRO wave (or the wave's own new kind) never draws them there.
    const early = [{ budget: 9, slots: 3, must: 'jolly', from: ['puffer', 'witch', 'fort', 'stinger', 'netsloop', 'jolly', 'corsair'] }];
    const drawn = new Set();
    for (let s = 0; s < 500; s++) P.drawWaves(10, early, s * 7 + 1)[0].forEach((k, i) => i > 0 && drawn.add(k));
    check(same([...drawn], ['corsair']), `the draw never takes a kind before its INTRO wave, nor a wave's new kind (jolly here) but as its must, even from a pool that lists them (drawn after the must: ${[...drawn].join(', ')})`);
  }

  // ------------------------------------------------------------------ waveProblems: each rule broken on its own
  {
    const has = (list, rule) => Array.isArray(list) && list.some((p) => typeof p === 'string' && p.startsWith(rule + ':'));
    const W = WANT_POOLS;
    const cases = [
      // [what, level, index, wave, prev, pool, rule]
      ['an unknown kind (a Voyage I cutter)', 10, 2, ['netsloop', 'cutter'], ['stinger', 'jolly'], W[10], 'kind'],
      ['a junk entry', 10, 2, ['netsloop', 42], ['stinger', 'jolly'], W[10], 'kind'],
      ['the Shellback in a wave', 12, 1, ['shellback'], ['fort'], W[12], 'kind'],
      ['an empty wave', 10, 0, [], null, W[10], 'empty'],
      ['four slots', 12, 0, ['fort', 'corsair', 'privateer', 'shark'], null, W[12], 'slots'],
      ['three slots in a two-slot wave', 10, 1, ['stinger', 'corsair', 'shark'], ['jolly', 'shark'], W[10], 'slots'],
      ['over budget', 10, 2, ['netsloop', 'jolly', 'stinger'], ['stinger', 'jolly'], W[10], 'budget'],
      ['not starting with its must', 10, 0, ['corsair', 'jolly'], null, W[10], 'must'],
      ['L12 wave 2 starting with a kind wave 1 had', 12, 1, ['stinger', 'corsair'], ['fort', 'stinger', 'corsair'], W[12], 'must'],
      ['L12 wave 2 starting with an old kind', 12, 1, ['corsair', 'witch'], ['fort', 'stinger', 'corsair'], W[12], 'must'],
      ['a kind not in its list', 10, 0, ['jolly', 'skiff'], null, W[10], 'from'],
      ['three of a kind', 12, 1, ['corsair', 'corsair', 'corsair'], null, null, 'perKind'],
      ['two puffer patches', 11, 2, ['coilback', 'puffer', 'puffer'], ['witch', 'jolly'], W[11], 'patches'],
      ['a Witch with a Bomb Ketch', 11, 1, ['witch', 'bombketch'], ['puffer', 'jolly'], W[11], 'never'],
      ['two Net Sloops', 11, 2, ['coilback', 'netsloop', 'netsloop'], ['witch', 'jolly'], W[11], 'never'],
      ['a Witch with Old Coilback', 12, 1, ['witch', 'coilback'], ['fort', 'jolly'], W[12], 'oneOf'],
      ['a fort with a Witch', 12, 0, ['fort', 'witch'], null, W[12], 'oneOf'],
      ['two forts', 12, 0, ['fort', 'fort'], null, null, 'oneOf'],
      ['puffers on level 10', 10, 0, ['jolly', 'puffer'], null, W[10], 'intro'],
      ['a Net Sloop in wave 2 of level 10', 10, 1, ['stinger', 'netsloop'], ['jolly', 'shark'], W[10], 'intro'],
      ['a Witch in wave 1 of level 11', 11, 0, ['puffer', 'witch'], null, null, 'intro'],
      ['the new kind second', 10, 1, ['corsair', 'stinger'], ['jolly', 'shark'], null, 'new'],
      ['the new kind twice', 10, 1, ['stinger', 'stinger'], ['jolly', 'shark'], null, 'new'],
    ];
    const bad = cases.filter(([, L, i, w, prev, pool, rule]) => !has(P.waveProblems(L, i, w, prev, pool), rule)).map(([what, L, i, w, prev, pool, rule]) => `${what}: ${show(P.waveProblems(L, i, w, prev, pool))} (want ${rule})`);
    check(bad.length === 0, `waveProblems catches each rule broken on its own (${cases.length} waves: unknown kinds, slots, budget, must, list, ≤ 2 of a kind, puffer patches, never-pairs, one of {witch, coilback, fort}, INTRO, the new kind)${bad.length ? ' -> ' + bad.join(' | ') : ''}`);
    const good = [
      [10, 0, ['jolly', 'shark'], null, W[10]],
      [10, 2, ['netsloop', 'jolly', 'corsair'], ['stinger', 'jolly'], W[10]],
      [11, 2, ['coilback', 'puffer', 'skiff'], ['witch', 'puffer'], W[11]],
      [12, 0, ['fort', 'jolly', 'puffer'], null, W[12]],
      [12, 1, ['coilback', 'ironclad'], ['fort', 'jolly', 'puffer'], W[12]],
      [12, 1, ['puffer', 'bombketch', 'bombketch'], ['fort', 'shark', 'privateer'], W[12][1]], // (the entry itself)
      [9, 0, ['corsair', 'shark'], null, null], // (old kinds anywhere)
    ];
    const badGood = good.filter(([L, i, w, prev, pool]) => P.waveProblems(L, i, w, prev, pool).length).map(([L, i, w, prev, pool]) => `L${L} wave ${i + 1} ${show(w)}: ${show(P.waveProblems(L, i, w, prev, pool))}`);
    check(badGood.length === 0, `waveProblems finds nothing in waves that keep every rule (${good.length} waves)${badGood.length ? ' -> ' + badGood.join(' | ') : ''}`);
    const many = P.waveProblems(10, 0, ['corsair', 'puffer', 'puffer', 'fort', 'witch'], null, W[10]);
    check(['slots', 'budget', 'must', 'from', 'patches', 'intro', 'oneOf'].every((r) => has(many, r)), `a wave breaking seven rules names all seven (${many.length} problems)`);
  }

  // ------------------------------------------------------------------ drawWaves and waveProblems never throw
  {
    const { hostile, proxy, arrayProxy, revoked, revokedArray } = hostiles();
    const junk = [undefined, null, NaN, Infinity, -1, 0, 0.5, '', 'pool', '__proto__', true, [], [null], [1, 2], {}, () => 1, Symbol('x'), 10n, new Date(0), new Map(), hostile, proxy, arrayProxy, revoked, revokedArray,
      [hostile, proxy, revoked], [{ budget: 'lots', slots: -4, must: 'kraken', from: 'corsair' }], [{ budget: 6, slots: 2, must: '__proto__', from: ['__proto__', 'constructor', 'toString', 'cutter', 'fireship'] }],
      [{ budget: 6, slots: 2, must: 'jolly', from: hostile }], [{ budget: 1e9, slots: 1e9, must: 'coilback', from: Array(1e5).fill('corsair') }], Array(1e5).fill(WANT_POOLS[10][0])];
    const problems = [];
    const okWaves = (ws) => Array.isArray(ws) && ws.length >= 1 && ws.length <= 16 && ws.every((w) => Array.isArray(w) && w.length >= 1 && w.length <= 3 && w.every((k) => typeof k === 'string' && (k in COST || k === 'cutter')));
    const t0 = Date.now();
    for (const j of junk) {
      for (const args of [[10, j, 5], [j, WANT_POOLS[10], 5], [10, WANT_POOLS[10], j], [j, j, j]]) {
        try {
          const ws = P.drawWaves(...args);
          if (!okWaves(ws)) problems.push(`drawWaves(${args.map(show).join(', ')}) -> ${show(ws)}`);
        } catch (e) {
          problems.push(`drawWaves(${args.map(show).join(', ')}) threw ${e && e.message}`);
        }
      }
      for (const args of [[j, 0, ['jolly'], null, WANT_POOLS[10]], [10, j, ['jolly'], null, WANT_POOLS[10]], [10, 0, j, null, WANT_POOLS[10]], [10, 0, ['jolly'], j, WANT_POOLS[10]], [10, 0, ['jolly'], null, j], [j, j, j, j, j]]) {
        try {
          const wp = P.waveProblems(...args);
          if (!Array.isArray(wp) || !wp.every((p) => typeof p === 'string' && p.length > 0)) problems.push(`waveProblems(${args.map(show).join(', ')}) -> ${show(wp)}`);
        } catch (e) {
          problems.push(`waveProblems(${args.map(show).join(', ')}) threw ${e && e.message}`);
        }
      }
    }
    const ms = Date.now() - t0;
    check(problems.length === 0 && ms < 5000, `${junk.length} kinds of junk in every argument of drawWaves and waveProblems (throwing getters, proxies, 100,000-entry pools and lists…): no throws, 1–16 waves of 1–3 known kinds, lists of problems (${ms} ms)${problems.length ? ' -> ' + problems.slice(0, 4).join(' | ') : ''}`);
    check(same(P.drawWaves(10, null, 1), [['cutter']]) && same(P.drawWaves(10, [], 1), [['cutter']]) && same(P.drawWaves(10, 'x', 1), [['cutter']]) && same(P.drawWaves(10, [null, WANT_POOLS[10][0]], 1)[0], ['cutter']),
      'a missing or unreadable pool (or wave entry) gives Stage 0\'s stand-in, one Corsair Cutter, so a level always has a wave to play');
    check(same(P.drawWaves(10, WANT_POOLS[10], NaN), P.drawWaves(10, WANT_POOLS[10], 0)) && same(P.drawWaves(10, WANT_POOLS[10], 2 ** 32 + 5), P.drawWaves(10, WANT_POOLS[10], 5)), 'a junk seed draws as seed 0; seeds are read as uint32');
    const junkFrom = P.drawWaves(10, [{ budget: 6, slots: 2, must: 'jolly', from: ['kraken', 'cutter', '__proto__', 'corsair'] }], 9)[0];
    check(same(junkFrom, ['jolly', 'corsair']), `unknown kinds in a pool are never drawn (${show(junkFrom)})`);
  }

  // ------------------------------------------------------------------ slotsOf, isPseudo
  {
    const { hostile, proxy, revoked } = hostiles();
    const cases = [[[], 0], [['jolly'], 1], [['jolly', 'corsair'], 2], [['fort', 'puffer', 'witch'], 3], [['corsair', 'corsair', 'corsair', 'shark', 'cutter'], 5], [[1, 'x', null, ''], 1], [null, 0], [undefined, 0], ['jolly', 0], [{}, 0], [hostile, 0], [proxy, 0], [revoked, 0]];
    const bad = cases.filter(([w, n]) => P.slotsOf(w) !== n).map(([w, n]) => `${show(w)} -> ${P.slotsOf(w)} (want ${n})`);
    check(bad.length === 0, `slotsOf: one slot a ship, a pack, a patch, the Coilback or a fort (${cases.length} cases, junk 0)${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    const yes = PSEUDO.filter((k) => P.isPseudo(k) === true);
    const no = ['stinger', 'netsloop', 'witch', 'corsair', 'cutter', 'kraken', 'player', '__proto__', 'Jolly', ' jolly', '', null, undefined, 3, {}, ['jolly']].filter((k) => P.isPseudo(k) !== false);
    check(yes.length === 5 && no.length === 0, `isPseudo: ${PSEUDO.join(', ')} are parts; the three new ships, old ships and junk are not${no.length ? ' -> ' + no.map(show).join(', ') : ''}`);
  }

  // ------------------------------------------------------------------ nextWaveAt keeps ≤ 4 slots alive
  {
    const bad = [];
    for (const L of LEVELS) {
      const most = Math.max(...WANT_POOLS[L].slice(1).map((e) => e.slots));
      if (NEXT_WAVE_AT[L] + most > 4) bad.push(`L${L}: ${NEXT_WAVE_AT[L]} + ${most}`);
    }
    check(bad.length === 0 && WANT_POOLS[10][0].slots <= 4, `§2.3–2.5's nextWaveAt (1, 1, 0) + the most slots of a later wave ≤ 4 slots alive at once (L10 1 + 3, L11 1 + 3, L12 0 + 3)${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    // act4.js's levels, once they carry their pools (Stage 0's stub has pool: null).
    let levels = null;
    let why = '';
    try {
      const envStub = (name) => `const ${name} = { stub: '${name}', meta: { name: '${name}' } };`;
      let src = source('src/act4.js')
        .replace(/^import \* as (\w+) from '\.\/env\/(\w+)\.js';$/gm, (_, name) => envStub(name))
        .replace(/from '\.\/(\w+)\.js'/g, (m, name) => {
          const dep = source(`src/${name}.js`);
          if (/^\s*import\s[^(]/m.test(dep)) throw new Error(`act4.js imports ${name}.js, which imports more`);
          return `from '${dataUrl(dep)}'`;
        });
      if (/^\s*import\s[^(][^;]*from '(?!data:)/m.test(src)) throw new Error('act4.js imports something else');
      levels = (await import(dataUrl(src))).ACT4_LEVELS;
    } catch (e) {
      why = e && e.message;
    }
    check(Array.isArray(levels) && levels.length === 3, `act4.js loads with its env modules stubbed (${Array.isArray(levels) ? levels.length + ' levels' : why})`);
    if (Array.isArray(levels) && levels.every((d) => d && d.pool == null)) {
      console.log('SKIP  act4.js\'s levels carry no pools yet (Stage 0\'s stub): their pools and nextWaveAt are checked once they do');
    } else if (Array.isArray(levels)) {
      const off = [];
      levels.forEach((d, k) => {
        const L = 10 + k;
        if (!Array.isArray(d.pool)) return off.push(`L${L}: no pool`);
        // (field by field: an entry may mark its must of null with `lacked: true`; extra keys are not numbers)
        const numbers = (pool) => pool.map((e) => ({ budget: e.budget, slots: e.slots, must: e.must ?? null, from: e.from, attackers: e.attackers ?? null }));
        if (!same(numbers(d.pool), numbers(WANT_POOLS[L]))) off.push(`L${L}: its pool's numbers are not POOLS[${L}]'s (${show(d.pool)})`);
        const most = Math.max(...d.pool.slice(1).map((e) => e.slots));
        if (!(Number.isInteger(d.nextWaveAt) && d.nextWaveAt + most <= 4)) off.push(`L${L}: nextWaveAt ${d.nextWaveAt} + ${most} slots`);
        for (let p = 0; p < 1000; p++) {
          const ws = P.drawWaves(L, d.pool, P.poolSeed(L, p));
          const b = ws.flatMap((w, i) => breaks(L, i, w, i ? ws[i - 1] : [], WANT_POOLS[L][i] || d.pool[i]));
          if (b.length) {
            off.push(`L${L} play ${p}: ${b.join('; ')}`);
            break;
          }
        }
        if (!same(d.waves, P.drawWaves(L, d.pool, P.poolSeed(L, 0)))) off.push(`L${L}: waves are not the fallback draw drawWaves(${L}, pool, poolSeed(${L}, 0))`);
      });
      check(off.length === 0, `act4.js's levels: each pool has POOLS's numbers (one table), keeps every rule over 1,000 plays, nextWaveAt + slots ≤ 4, waves = drawWaves(level, pool, poolSeed(level, 0))${off.length ? ' -> ' + off.join(' | ') : ''}`);
    }
  }

  // ================================================================== the voyage4 record (§10.1)
  const TEXT0 = '{"v":1,"plays":[0,0,0],"met":0,"won":0,"tips":0,"prizes":{}}';
  const DEFAULT = JSON.parse(TEXT0);
  const rec = (o = {}) => ({ v: 1, plays: o.plays || [0, 0, 0], met: o.met || 0, won: o.won || 0, tips: o.tips || 0, prizes: o.prizes || {} });
  const okRec = (r) => {
    try {
      return !!r && Object.keys(r).join() === 'v,plays,met,won,tips,prizes' && r.v === 1 && Array.isArray(r.plays) && r.plays.length === 3 &&
        r.plays.every((n) => isInt(n) && n >= 0 && n <= 9999) && isInt(r.met) && r.met >= 0 && r.met <= 255 && (r.won === 0 || r.won === 1) &&
        isInt(r.tips) && r.tips >= 0 && r.tips <= 65535 && r.prizes && typeof r.prizes === 'object' && !Array.isArray(r.prizes) &&
        Object.keys(r.prizes).every((k) => SHIPS4.includes(k)) && Object.keys(r.prizes).join() === SHIPS4.filter((k) => k in r.prizes).join() &&
        Object.values(r.prizes).every((n) => isInt(n) && n >= 1 && n <= 9999) && Object.getPrototypeOf(r.prizes) === Object.prototype;
    } catch {
      return false;
    }
  };
  const parse = (raw) => {
    try {
      const r = P.parseVoyage4(raw);
      return okRec(r) ? { r } : { error: `invalid result ${show(r)}` };
    } catch (e) {
      return { error: `threw ${e && e.message}` };
    }
  };

  // ------------------------------------------------------------------ defaults
  {
    const a = P.defaultVoyage4();
    const b = P.defaultVoyage4();
    a.plays[0] = 5;
    a.prizes.witch = 1;
    check(same(b, DEFAULT) && a.plays !== b.plays && a.prizes !== b.prizes && P.serializeVoyage4(P.defaultVoyage4()) === TEXT0 && P.serializeVoyage4(null) === TEXT0,
      `defaultVoyage4: ${TEXT0} (§10.1's text exactly), a fresh object every call`);
    const MAX_PRIZE = Number((source('src/cosmetics.js').match(/const MAX_PRIZE = (\d+);/) || [])[1]);
    check(MAX_PRIZE === 9999 && same(P.parseVoyage4({ prizes: { witch: 99999 } }).prizes, { witch: MAX_PRIZE }) && SHIPS4.every((t) => C.FEAT_PRIZE_TYPES.includes(t)),
      `voyage4.prizes caps at cosmetics.js's MAX_PRIZE (${MAX_PRIZE}), the cap of the feats.prizes they restore; its three types are FEAT_PRIZE_TYPES`);
  }

  // ------------------------------------------------------------------ parseVoyage4: the garbage battery
  {
    const { hostile, proxy, arrayProxy, revoked, revokedArray } = hostiles();
    const hostilePlays = { plays: [1, 2, 3], met: 4 };
    Object.defineProperty(hostilePlays.plays, '1', { enumerable: true, get() { throw new Error('getter'); } });
    const junk = [
      null, undefined, '', ' ', 'garbage', 'garbage{', '{', '}', '{}', '[]', '[1,2,3]', 'null', 'true', 'false', '42', '"str"', 'NaN', 'Infinity', '-Infinity', '1e400',
      '{"plays":null}', '{"plays":"1,2,3"}', '{"plays":{"0":5,"1":5,"2":5,"length":3}}', '{"met":"all"}', '{"prizes":[1,2,3]}', '{"prizes":"witch"}', '[{"plays":[1,2,3]}]',
      '{"PLAYS":[1,2,3],"Met":5}', '{"v":1,"play":[1,2,3],"meet":5,"tip":1,"prize":{"witch":1}}', 42, -1, NaN, Infinity, true, false, [], [1, 2], {}, () => 1, Symbol('x'), 10n,
      new Date(0), /x/, new Map([['plays', [1, 2, 3]]]), new Set(['plays']), hostile, proxy, arrayProxy, revoked, revokedArray, { plays: revokedArray, prizes: revoked, met: proxy },
      '\u0000', '\ud800', '{"plays":[1,2,3]', '{"v":1,"plays":[1,2,3],"met":5', // a broken surrogate, JSON cut short
    ];
    const bad = [];
    for (const raw of junk) {
      const r = parse(raw);
      if (r.error) bad.push(`${show(raw)}: ${r.error}`);
      else if (!same(r.r, DEFAULT)) bad.push(`${show(raw)}: ${show(r.r)}`);
    }
    check(bad.length === 0, `parseVoyage4: ${junk.length} kinds of junk (cut JSON, arrays, wrong types, throwing getters, proxies, revoked proxies, a Map…) all give the default${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    check(same(parse(hostilePlays).r, rec({ plays: [1, 0, 3], met: 4 })), 'a throwing getter on one play counts as 0; the other fields are kept');

    // Each field: a plain integer (number or digit string), clamped to its range; anything else is its default.
    let sourceText = false;
    JSON.parse('1', (k, v, ctx) => {
      sourceText = !!(ctx && typeof ctx.source === 'string');
      return v;
    });
    const common = [
      ['"1e0"', 0], ['"2.5"', 0], ['"0x2"', 0], ['"Infinity"', 0], ['"NaN"', 0], ['""', 0], ['" "', 0], ['"1 2"', 0], ['"+1"', 0], ['"two"', 0],
      ['2.5', 0], ['1.5', 0], ['-0.5', 0], ['1e400', 0], ['-1e400', 0], ['123456789012345678901', 0], ['"123456789012345678901"', 0],
      ['null', 0], ['true', 0], ['false', 0], ['[1]', 0], ['{"v":1}', 0], ['{"__proto__":3}', 0], ['-0', 0], ['"-0"', 0],
      ...(sourceText ? [['1e0', 0], ['2.0', 0], ['1E0', 0], ['3.0', 0], ['30e-1', 0]] : []),
    ];
    const FIELDS = {
      plays: { put: (lit) => `{"v":1,"plays":[7,${lit},8],"met":3}`, get: (r) => (r.plays[0] === 7 && r.plays[2] === 8 && r.met === 3 ? r.plays[1] : 'lost a neighbour'), cases: [['1', 1], ['42', 42], ['9999', 9999], ['10000', 9999], ['99999999', 9999], ['-1', 0], ['-30', 0], ['"5"', 5], ['" 12 "', 12], ['"0012"', 12], ['0', 0]] },
      met: { put: (lit) => `{"v":1,"plays":[1,2,3],"met":${lit}}`, get: (r) => (same(r.plays, [1, 2, 3]) ? r.met : 'lost the plays'), cases: [['1', 1], ['5', 5], ['255', 255], ['256', 255], ['65535', 255], ['-1', 0], ['"128"', 128]] },
      won: { put: (lit) => `{"won":${lit},"tips":4}`, get: (r) => (r.tips === 4 ? r.won : 'lost the tips'), cases: [['1', 1], ['0', 0], ['2', 1], ['9', 1], ['-1', 0], ['"1"', 1]] },
      tips: { put: (lit) => `{"tips":${lit},"won":1}`, get: (r) => (r.won === 1 ? r.tips : 'lost won'), cases: [['1', 1], ['16', 16], ['255', 255], ['65535', 65535], ['65536', 65535], ['-8', 0], ['"64"', 64]] },
      prize: { put: (lit) => `{"prizes":{"stinger":${lit},"witch":3}}`, get: (r) => (r.prizes.witch === 3 ? r.prizes.stinger ?? 0 : 'lost the witch'), cases: [['1', 1], ['9999', 9999], ['10000', 9999], ['-5', 0], ['"7"', 7], ['0', 0]] },
    };
    const badF = [];
    let n = 0;
    for (const [name, f] of Object.entries(FIELDS)) {
      for (const [lit, want] of [...f.cases, ...common]) {
        n++;
        const r = parse(f.put(lit));
        const got = r.error || f.get(r.r);
        if (got !== want) badF.push(`${name} ${lit} -> ${got} (want ${want})`);
      }
    }
    check(badF.length === 0, `parseVoyage4: plays 0..9999, met 0..255, won 0..1, tips 0..65535 and prizes 1..9999 are plain integers clamped to their range, else 0 (${n} cases${sourceText ? ', incl. number literals like 1e0 and 2.0' : ''})${badF.length ? ' -> ' + badF.join('; ') : ''}`);
    if (!sourceText) console.log('SKIP  this Node cannot see JSON number literals (1e0, 2.0), only their values; those cases were not run');
    const objectCases = [
      [1, 1], [9999, 9999], [12345, 9999], [-7, 0], [-0, 0], [NaN, 0], [Infinity, 0], [-Infinity, 0], [2.5, 0], [1 + Number.EPSILON, 0], [Number.MAX_SAFE_INTEGER + 2, 0],
      ['1', 1], [' 2 ', 2], ['1e1', 0], [null, 0], [true, 0], [[1], 0], [{ valueOf: () => 1 }, 0], [new Number(1), 0], [new String('2'), 0], [1n, 0], [Symbol('1'), 0],
    ];
    const badO = [];
    for (const [v, want] of objectCases) {
      const r = parse({ plays: [v, 4, v], met: v, tips: 2, prizes: { netsloop: v, witch: 1 } });
      const got = r.error || r.r.plays[0];
      const want2 = Math.min(want, 255);
      if (got !== want || Object.is(got, -0) || r.r.plays[1] !== 4 || r.r.plays[2] !== want || r.r.met !== want2 || r.r.tips !== 2 || (r.r.prizes.netsloop ?? 0) !== want || r.r.prizes.witch !== 1) badO.push(`${show(v)} -> ${show(r.r || r.error)}`);
    }
    check(badO.length === 0, `parseVoyage4 on a record object: the same rules (NaN, ±Infinity, 2.5, -0, boxed numbers, bigints, symbols, too big…)${badO.length ? ' -> ' + badO.join('; ') : ''}`);
    const fbf = parse('{"v":1,"plays":["1e1",2.5,"7"],"met":"x","won":5,"tips":[1],"prizes":{"stinger":"1e1","netsloop":-3,"witch":"4"}}');
    check(!fbf.error && same(fbf.r, rec({ plays: [0, 0, 7], won: 1, prizes: { witch: 4 } })), `parseVoyage4 falls back field by field (${show(fbf.r || fbf.error)})`);
    const lens = [parse('{"plays":[5]}'), parse('{"plays":[1,2,3,4,5]}'), parse('{"plays":[]}'), parse('{"plays":[1,,3]}'), parse({ plays: [1, , 3] })]; // eslint-disable-line no-sparse-arrays
    check(same(lens.map((x) => x.r && x.r.plays), [[5, 0, 0], [1, 2, 3], [0, 0, 0], [0, 0, 0], [1, 0, 3]]), `plays: three numbers whatever the stored list's length (missing ones and holes 0, extra ones dropped; ${show(lens.map((x) => x.r ? x.r.plays : x.error))})`);

    // Unknown fields and prize keys, prototype tricks, inherited fields, other versions.
    const extra = parse('{"v":1,"plays":[1,0,0],"gold":999999,"level":12,"prizes":{"witch":2,"cutter":5,"kraken":1,"galleon":3,"toString":1,"constructor":2,"Witch":4},"seen":7}');
    check(!extra.error && same(extra.r, rec({ plays: [1, 0, 0], prizes: { witch: 2 } })), `unknown fields and prize keys are dropped (only stinger, netsloop, witch: ${show(extra.r || extra.error)})`);
    const proto = parse('{"__proto__":{"plays":[9,9,9],"met":255},"prizes":{"__proto__":{"witch":9},"constructor":{"prototype":{"polluted":1}}},"plays":{"__proto__":[5,5,5]}}');
    const polluted = ({}).polluted !== undefined || Object.prototype.polluted !== undefined || ({}).witch !== undefined || ({}).plays !== undefined || ({}).met !== undefined;
    check(!proto.error && same(proto.r, DEFAULT) && !polluted, `__proto__ / constructor tricks give the default and pollute nothing (${show(proto.r || proto.error)})`);
    const inherited = parse(Object.create({ plays: [3, 3, 3], met: 9 }));
    const inheritedPrize = parse({ prizes: Object.create({ witch: 3 }), plays: Object.assign(Object.create([7, 7, 7]), { length: 3 }) });
    check(!inherited.error && same(inherited.r, DEFAULT) && same(inheritedPrize.r, DEFAULT), 'inherited (non-own) fields, prizes and plays are ignored');
    const v2 = parse('{"v":2,"plays":[0,4,0]}');
    const noV = parse('{"met":6}');
    check(same(v2.r, rec({ plays: [0, 4, 0] })) && same(noV.r, rec({ met: 6 })) && P.serializeVoyage4(noV.r) === TEXT0.replace('"met":0', '"met":6'), 'the fields are read whatever "v" says (or without it), and written back as v 1');

    // Size: ≤ 2 KB; megabytes and deep nesting are refused quickly.
    const valid = '{"v":1,"plays":[2,1,0],"met":7}';
    const at2k = valid.slice(0, -1) + ' '.repeat(2048 - valid.length) + '}';
    const over = valid.slice(0, -1) + ' '.repeat(2049 - valid.length) + '}';
    check(at2k.length === 2048 && same(parse(at2k).r, rec({ plays: [2, 1, 0], met: 7 })) && over.length === 2049 && same(parse(over).r, DEFAULT),
      'a record of exactly 2 KB (2048 characters) is read; 2049 characters are refused (the default)');
    const times = [];
    const timed = (raw) => {
      const t0 = process.hrtime.bigint();
      const res = parse(raw);
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
      return res;
    };
    const huge = [
      ['2 MB of garbage', 'x'.repeat(2e6)],
      ['a 1 MB record', JSON.stringify({ v: 1, plays: [1, 2, 3], pad: 'a'.repeat(1e6) })],
      ['a 1 MB play', `{"plays":["${'1'.repeat(1e6)}",0,0]}`],
      ['100k nested arrays', '['.repeat(1e5) + ']'.repeat(1e5)],
      ['1000 nested arrays (inside 2 KB)', '['.repeat(1000) + ']'.repeat(1000)],
      ['a deep list in the plays', `{"plays":${'['.repeat(900)}1${']'.repeat(900)}}`],
      ['a deep object around the record', '{"met":'.repeat(250) + '1' + '}'.repeat(250)],
      ['a megabyte object', { plays: ['9'.repeat(1e6), 0, 0], prizes: { witch: 'x'.repeat(1e6) } }],
      ['a million plays', { plays: Array(1e6).fill(5) }],
    ];
    const badH = [];
    for (const [name, raw] of huge) {
      const res = timed(raw);
      const want = name === 'a million plays' ? rec({ plays: [5, 5, 5] }) : DEFAULT;
      if (res.error) badH.push(`${name}: ${res.error}`);
      else if (!same(res.r, want)) badH.push(`${name}: ${show(res.r)}`);
    }
    check(badH.length === 0 && Math.max(...times) < 1000, `megabytes and deep nesting give the default quickly (slowest ${Math.max(...times).toFixed(1)} ms)${badH.length ? ' -> ' + badH.join('; ') : ''}`);

    // Round trips; serialize validates; a record that needed fixing is rewritten (main's loadRecord).
    const r = mulberry32(4);
    const badRT = [];
    const recs = [DEFAULT, rec({ plays: [9999, 9999, 9999], met: 255, won: 1, tips: 65535, prizes: { stinger: 9999, netsloop: 9999, witch: 9999 } })];
    for (let k = 0; k < 2000; k++) {
      const prizes = {};
      for (const t of SHIPS4) if (r() < 0.5) prizes[t] = 1 + Math.floor(r() * 9999);
      recs.push(rec({ plays: [0, 1, 2].map(() => Math.floor(r() * 10000)), met: Math.floor(r() * 256), won: r() < 0.5 ? 1 : 0, tips: Math.floor(r() * 65536), prizes }));
    }
    for (const x of recs) {
      const text = P.serializeVoyage4(x);
      const back = parse(text);
      if (back.error || !same(back.r, x) || P.serializeVoyage4(back.r) !== text || text !== JSON.stringify(x)) badRT.push(text);
    }
    check(badRT.length === 0, `serialize → parse round trips ${recs.length} records (every field at its limits and 2,000 random ones), in §10.1's text${badRT.length ? ' -> ' + badRT.slice(0, 3).join('; ') : ''}`);
    const rewrite = ['{"plays":[1,0,0]}', TEXT0.replace('}}', '},"x":1}'), TEXT0.replace('"met":0', '"met":"0"'), TEXT0.replace('"tips":0', '"tips":70000'), ' ' + TEXT0,
      '{"v":1,"met":0,"plays":[0,0,0],"won":0,"tips":0,"prizes":{}}', TEXT0.replace('{}}', '{"witch":0}}'), TEXT0.replace('{}}', '{"witch":1,"stinger":1}}'), TEXT0.replace('[0,0,0]', '[0,0,0,0]'), TEXT0.replace('"v":1', '"v":2')];
    check(rewrite.every((raw) => P.serializeVoyage4(P.parseVoyage4(raw)) !== raw) && P.serializeVoyage4(P.parseVoyage4(TEXT0)) === TEXT0,
      'a stored record that needed fixing (missing fields, extra fields, digit strings, out of range, another key or prize order, a zero prize, four plays, v 2) serializes differently, so loadRecord rewrites it; the canonical text is left alone');
    let text;
    let threw = '';
    try {
      text = [P.serializeVoyage4({ plays: [3, 'x', 10001], met: 300, won: 7, tips: -1, prizes: { witch: 2, kraken: 1 }, extra: true }), ...[null, undefined, 'garbage', 42, Symbol('x'), proxy, revoked].map((v) => P.serializeVoyage4(v))];
    } catch (e) {
      threw = e.message;
    }
    check(!threw && text[0] === '{"v":1,"plays":[3,0,9999],"met":255,"won":1,"tips":0,"prizes":{"witch":2}}' && text.slice(1).every((t) => t === TEXT0), `serializeVoyage4 validates before writing; junk writes the default${threw ? ' -> ' + threw : ''}`);
  }

  // ------------------------------------------------------------------ mergeVoyage4 (the storage listener, two tabs)
  {
    const { proxy } = hostiles();
    const m = P.mergeVoyage4('{"v":1,"plays":[3,0,7],"met":5,"won":0,"tips":1,"prizes":{"witch":2}}', { plays: [1, 4, 2], met: 10, won: 1, tips: 16, prizes: { witch: 1, stinger: 3 } });
    check(same(m, rec({ plays: [3, 4, 7], met: 15, won: 1, tips: 17, prizes: { stinger: 3, witch: 2 } })), `mergeVoyage4: plays the larger per level, met and tips or-ed, won the larger, prizes the larger per type (${show(m)})`);
    const r = mulberry32(9);
    const rand = () => P.parseVoyage4({ plays: [r() * 50 | 0, r() * 50 | 0, r() * 50 | 0], met: r() * 256 | 0, won: r() < 0.3 ? 1 : 0, tips: r() * 65536 | 0, prizes: { stinger: r() * 5 | 0, netsloop: r() * 5 | 0, witch: r() * 5 | 0 } });
    let ok = true;
    for (let k = 0; k < 500; k++) {
      const a = rand();
      const b = rand();
      const ab = P.mergeVoyage4(a, b);
      const up = ab.plays.every((n, i) => n >= a.plays[i] && n >= b.plays[i]) && (ab.met & a.met) === a.met && (ab.met & b.met) === b.met && (ab.tips & a.tips) === a.tips && ab.won >= a.won && SHIPS4.every((t) => (ab.prizes[t] || 0) >= (a.prizes[t] || 0));
      if (!same(ab, P.mergeVoyage4(b, a)) || !same(P.mergeVoyage4(a, a), a) || !same(P.mergeVoyage4(a, P.defaultVoyage4()), a) || !up || !okRec(ab)) ok = false;
    }
    check(ok && same(P.mergeVoyage4('junk', proxy), DEFAULT), 'mergeVoyage4 on 500 random pairs: the same either way round, a record merged with itself or the default is itself, nothing ever goes down; junk merges to the default');
  }

  // ------------------------------------------------------------------ notePlay, meet, markTip, notePrize
  {
    const base = rec({ plays: [2, 5, 0], met: 3, tips: 4 });
    const frozenBase = JSON.stringify(base);
    const plays = [10, 11, 12].map((L) => P.notePlay(base, L).plays);
    const same0 = [9, 13, 0, -10, '10', 10.5, NaN, null, undefined, {}].map((L) => P.notePlay(base, L));
    check(same(plays, [[3, 5, 0], [2, 6, 0], [2, 5, 1]]) && same0.every((x) => same(x, base)) && JSON.stringify(base) === frozenBase && P.notePlay(base, 10) !== base,
      `notePlay: a clear of level 10 / 11 / 12 adds one to its plays (${show(plays)}); any other level changes nothing; the record given is never changed`);
    const top = P.notePlay(P.notePlay(rec({ plays: [9998, 0, 9999] }), 10), 10);
    check(same(top.plays, [9999, 0, 9999]) && same(P.notePlay(top, 12).plays, [9999, 0, 9999]) && same(P.notePlay(TEXT0, 11).plays, [0, 1, 0]), 'notePlay caps at 9999 and reads stored text too');

    // meet: the first time once, a bit each of V4_KINDS.
    let r = P.defaultVoyage4();
    const firsts = [];
    for (const k of V4) {
      const a = P.meet(r, k);
      const b = P.meet(a.rec, k);
      firsts.push([a.first, b.first, a.rec.met, b.rec.met]);
      r = b.rec;
    }
    check(firsts.every(([a, b, m1, m2], i) => a === true && b === false && m1 === m2 && (m1 & (1 << i)) && m1 === (1 << (i + 1)) - 1) && r.met === 255,
      `meet: each Voyage IV kind's first spawn is first: true once and sets its bit (1 << its V4_KINDS index); every later spawn is first: false (met ${firsts.map((f) => f[2]).join(', ')})`);
    const rand = mulberry32(21);
    let rr = P.defaultVoyage4();
    const seen = {};
    for (let k = 0; k < 400; k++) {
      const kind = V4[Math.floor(rand() * V4.length)];
      const m = P.meet(rr, kind);
      if (m.first) seen[kind] = (seen[kind] || 0) + 1;
      rr = m.rec;
    }
    const before = JSON.stringify(rr);
    const unknown = ['corsair', 'cutter', 'kraken', 'Jolly', '__proto__', 'toString', '', null, 3, {}, undefined].map((k) => P.meet(P.defaultVoyage4(), k));
    check(Object.values(seen).every((n) => n === 1) && Object.keys(seen).length === V4.length && unknown.every((m) => m.first === false && same(m.rec, DEFAULT)) && JSON.stringify(rr) === before,
      `meet over 400 random spawns reports each kind's first time exactly once; old ships, unknown kinds and junk are never first and set nothing`);
    const fromText = P.meet('{"v":1,"plays":[0,0,0],"met":1,"won":0,"tips":0,"prizes":{}}', 'jolly');
    check(fromText.first === false && fromText.rec.met === 1 && P.meet(base, 'fort').rec !== base && JSON.stringify(base) === frozenBase, 'meet reads stored text (jolly already met there) and never changes the record given');

    // markTip: §8.4's bits (1, 2, 4 … 128), or-ed; junk changes nothing.
    let t = P.defaultVoyage4();
    for (const bit of [1, 2, 4, 8, 16, 32, 64, 128]) t = P.markTip(t, bit);
    const twice = P.markTip(P.markTip(P.defaultVoyage4(), 8), 8);
    const junkTips = [0, -1, 65536, 65537, 131071, 1.5, '4', NaN, Infinity, null, undefined, {}, 2 ** 40, 2 ** 40 + 1].map((b) => P.markTip(rec({ tips: 4 }), b).tips);
    check(t.tips === 255 && twice.tips === 8 && P.markTip(rec({ tips: 3 }), 32768).tips === 32771 && P.markTip(P.defaultVoyage4(), 65535).tips === 65535 && junkTips.every((n) => n === 4),
      `markTip sets §8.4's bits (all eight: ${t.tips}), a bit twice is the same, 16 bits at most; junk bits change nothing`);

    // notePrize: the three new ship types only, + 1 up to 9,999, in record order.
    let p = P.defaultVoyage4();
    p = P.notePrize(p, 'witch');
    p = P.notePrize(p, 'stinger');
    p = P.notePrize(p, 'witch');
    const others = ['corsair', 'cutter', 'kraken', 'galleon', '__proto__', '', null, 5].map((k) => P.notePrize(rec({ prizes: { netsloop: 2 } }), k));
    const capped = P.notePrize(rec({ prizes: { netsloop: 9999 } }), 'netsloop');
    check(same(p.prizes, { stinger: 1, witch: 2 }) && Object.keys(p.prizes).join() === 'stinger,witch' && others.every((x) => same(x.prizes, { netsloop: 2 })) && capped.prizes.netsloop === 9999,
      `notePrize counts captures of the Sting Sloop, Net Sloop and Witch's Barge (+1, at most 9,999, record order: ${show(p.prizes)}); other types and junk change nothing`);
  }

  // ------------------------------------------------------------------ junk in every argument of every record function
  {
    const { hostile, proxy, arrayProxy, revoked, revokedArray } = hostiles();
    const junk = [undefined, null, NaN, Infinity, -Infinity, -1, 0, -0, 0.5, 1e308, 10, 12, '12', '', 'jolly', 'witch', '__proto__', true, false, [], [1, 2], {}, () => 1, Symbol('x'), 10n, new Date(0),
      hostile, proxy, arrayProxy, revoked, revokedArray, { plays: [NaN, -5, Infinity], met: hostile, prizes: proxy }, { plays: hostile }, TEXT0];
    const problems = [];
    const tryIt = (name, fn, ok) => {
      try {
        const r = fn();
        if (!ok(r)) problems.push(`${name}: ${show(r)}`);
      } catch (e) {
        problems.push(`${name}: threw ${e && e.message}`);
      }
    };
    for (const j of junk) {
      const J = show(j);
      tryIt(`parseVoyage4(${J})`, () => [P.parseVoyage4(j), P.mergeVoyage4(j, j), P.mergeVoyage4(TEXT0, j), P.mergeVoyage4(j, TEXT0), P.defaultVoyage4()], (rs) => rs.every(okRec));
      tryIt(`serializeVoyage4(${J})`, () => P.serializeVoyage4(j), (t) => typeof t === 'string' && t.length <= 2048 && okRec(JSON.parse(t)));
      tryIt(`notePlay(${J})`, () => [P.notePlay(j, j), P.notePlay(j, 10), P.notePlay(TEXT0, j)], (rs) => rs.every(okRec));
      tryIt(`meet(${J})`, () => [P.meet(j, j), P.meet(j, 'jolly'), P.meet(TEXT0, j)], (rs) => rs.every((m) => m && typeof m.first === 'boolean' && okRec(m.rec)));
      tryIt(`markTip(${J})`, () => [P.markTip(j, j), P.markTip(j, 4), P.markTip(TEXT0, j)], (rs) => rs.every(okRec));
      tryIt(`notePrize(${J})`, () => [P.notePrize(j, j), P.notePrize(j, 'witch'), P.notePrize(TEXT0, j)], (rs) => rs.every(okRec));
      tryIt(`slotsOf / isPseudo / poolSeed(${J})`, () => [P.slotsOf(j), P.isPseudo(j), P.poolSeed(j, j)], ([s, ps, seed]) => isInt(s) && s >= 0 && typeof ps === 'boolean' && Number.isInteger(seed) && seed >= 0);
    }
    const more = problems.length > 6 ? ` (+${problems.length - 6} more)` : '';
    check(problems.length === 0, `${junk.length} kinds of junk (missing, NaN, ±Infinity, strings, arrays, functions, symbols, bigints, throwing getters, proxies, broken records) in every argument of every record function: no throws, valid records${problems.length ? ' -> ' + problems.slice(0, 6).join('; ') + more : ''}`);
  }

  console.log(failures ? `\n${failures} check(s) failed` : `\nAll pools checks passed (${passes})`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
