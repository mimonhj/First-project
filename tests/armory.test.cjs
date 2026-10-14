// Unit checks for the tavern upgrades in src/armory.js (plain Node, no browser):
// - the upgrade table (values, costs, display order, labels) and its total price
// - defaults, maxed tiers and the price of the next tier
// - armoryStats(): crew, boarding strength, grapple range and reel, crit chance at every tier
// - armoryStatText(): "15 hands", "×1.2", "17 paces", "9%"
// - the numbers the battle rules repeat (combat.js BOARD.range / BOARD.reel / CRIT.base) agree
// - parseArmoryConfig(): whatever is in storage (garbage, tampered or huge) gives a valid config,
//   field by field, without throwing; serializeArmoryConfig() round trips and is canonical
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

// The game's modules are browser ES modules in a package without "type": "module". The pure ones
// import nothing, so they are loaded from their source as data: URLs (as in upgrades.test.cjs).
async function load(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (/^\s*import\s[^(]/m.test(src)) throw new Error(`${rel} has imports now; load it another way`);
  return import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = (v) => {
  if (typeof v === 'string') return JSON.stringify(v.length > 60 ? v.slice(0, 60) + '…' : v);
  if (typeof v === 'symbol' || typeof v === 'function' || typeof v === 'bigint') return String(v);
  try {
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s.length > 60 ? s.slice(0, 60) + '…' : s;
  } catch {
    return Object.prototype.toString.call(v);
  }
};

(async () => {
  const A = await load('src/armory.js');
  const { ARMORY } = A;

  // The contract (SPEC2 §4): values per tier and the price of each next tier.
  const TABLE = {
    boarders: { name: 'Boarding party', stat: 'Crew', values: [12, 15, 18, 22], costs: [200, 450, 800] },
    cutlass: { name: 'Cutlass drills', stat: 'Boarding strength', values: [1.0, 1.2, 1.4, 1.6], costs: [150, 350, 650] },
    grapple: { name: 'Long grapples', stat: 'Grapple range', values: [14, 17, 20], costs: [150, 400] },
    gunner: { name: 'Master gunner', stat: 'Critical hits', values: [0.06, 0.09, 0.12, 0.15], costs: [200, 450, 800] },
  };
  const IDS = Object.keys(TABLE);
  const REEL = [1.2, 1.0, 0.8]; // Long grapples: reel time per tier
  // armoryStats() field for each upgrade's main stat.
  const FIELD = { boarders: 'crew', cutlass: 'blade', grapple: 'grappleRange', gunner: 'critBase' };
  const STOCK = { crew: 12, blade: 1, grappleRange: 14, reel: 1.2, critBase: 0.06 };
  const DEFAULT = { up: { boarders: 0, cutlass: 0, grapple: 0, gunner: 0 } };
  const DEFAULT_TEXT = '{"up":{"boarders":0,"cutlass":0,"grapple":0,"gunner":0}}'; // SPEC2 §8, exactly

  // A valid config: exactly these fields, integer tiers in range.
  function invalid(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return 'not an object';
    if (Object.keys(c).join() !== 'up') return `fields ${Object.keys(c)}`;
    if (!c.up || typeof c.up !== 'object' || Object.keys(c.up).join() !== IDS.join()) return `upgrade fields ${c.up && Object.keys(c.up)}`;
    for (const id of IDS) {
      const t = c.up[id];
      if (!Number.isInteger(t) || t < 0 || t > TABLE[id].values.length - 1 || Object.is(t, -0)) return `${id} tier ${String(t)}`;
    }
    if (Object.getPrototypeOf(c) !== Object.prototype || Object.getPrototypeOf(c.up) !== Object.prototype) return 'odd prototype';
    return '';
  }
  // parseArmoryConfig() must never throw and always give a valid config.
  function parse(raw) {
    try {
      const c = A.parseArmoryConfig(raw);
      const bad = invalid(c);
      return bad ? { error: `invalid result (${bad})` } : { c };
    } catch (e) {
      return { error: `threw ${e && e.message}` };
    }
  }

  // ------------------------------------------------------------------ the table
  check(same(ARMORY.map((u) => u.id), IDS), `tavern upgrades in display order (${ARMORY.map((u) => u.id).join(', ')})`);
  for (const u of ARMORY) {
    const want = TABLE[u.id];
    const texts = ['name', 'blurb', 'stat'].every((k) => typeof u[k] === 'string' && u[k].trim().length > 0);
    const extra = u.extra === undefined || (typeof u.extra === 'string' && u.extra.trim().length > 0);
    check(
      !!want && u.name === want.name && u.stat === want.stat && same(u.values, want.values) && same(u.costs, want.costs) &&
        u.costs.length === u.values.length - 1 && texts && extra && u.costs.every((c) => Number.isInteger(c) && c > 0),
      `${u.id}: "${u.name}" (${u.stat}) values ${show(u.values)}, costs ${show(u.costs)}, with a blurb${u.extra ? ` and "${u.extra}"` : ''}`,
    );
  }
  {
    const total = IDS.reduce((s, id) => s + TABLE[id].costs.reduce((a, b) => a + b, 0), 0);
    const real = ARMORY.reduce((s, u) => s + u.costs.reduce((a, b) => a + b, 0), 0);
    check(total === 4600 && real === 4600, `buying every tavern upgrade costs ${real} gold (4,600)`);
  }
  {
    const maxes = IDS.map((id) => A.armoryMaxTier(id));
    const junkIds = ['nope', undefined, null, '__proto__', 'constructor', 'toString', 'BOARDERS', ' boarders', 3, {}, Symbol('x')];
    const junkMax = junkIds.map((id) => {
      try {
        return A.armoryMaxTier(id);
      } catch (e) {
        return `threw ${e.message}`;
      }
    });
    check(same(maxes, [3, 3, 2, 3]) && junkMax.every((m) => m === 0), `armoryMaxTier: ${IDS.map((id, i) => `${id} ${maxes[i]}`).join(', ')}; unknown ids 0 (${junkMax.join(',')})`);
  }

  // ------------------------------------------------------------------ defaults
  {
    const d1 = A.defaultArmoryConfig();
    const d2 = A.defaultArmoryConfig();
    d1.up.boarders = 2;
    check(same(d2, DEFAULT) && d1.up !== d2.up && d1 !== d2, `defaultArmoryConfig: ${show(d2)}, a fresh object every call`);
    check(A.serializeArmoryConfig(A.defaultArmoryConfig()) === DEFAULT_TEXT && A.serializeArmoryConfig(null) === DEFAULT_TEXT, `the stored default record is exactly ${DEFAULT_TEXT}`);
  }

  // ------------------------------------------------------------------ prices
  {
    const problems = [];
    for (const id of IDS) {
      const { values, costs } = TABLE[id];
      for (let t = 0; t < values.length; t++) {
        const cfg = A.defaultArmoryConfig();
        cfg.up[id] = t;
        const want = t < costs.length ? costs[t] : null;
        const got = A.armoryNextCost(cfg, id);
        const fromJson = A.armoryNextCost(JSON.stringify(cfg), id);
        if (got !== want || fromJson !== want) problems.push(`${id} tier ${t}: ${got}/${fromJson}, want ${want}`);
      }
    }
    check(problems.length === 0, `armoryNextCost: the price of every next tier, null once maxed${problems.length ? ' -> ' + problems.join('; ') : ''}`);
    let junk;
    try {
      junk = [
        A.armoryNextCost(A.defaultArmoryConfig(), 'nope'), A.armoryNextCost(A.defaultArmoryConfig(), '__proto__'), A.armoryNextCost(undefined, undefined),
        A.armoryNextCost(null, 'boarders'), A.armoryNextCost('garbage', 'cutlass'), A.armoryNextCost('{"up":{"grapple":"lots"}}', 'grapple'), A.armoryNextCost(42, 'gunner'),
      ];
    } catch (e) {
      junk = [`threw ${e.message}`];
    }
    check(same(junk, [null, null, null, 200, 150, 150, 200]), `armoryNextCost: null for an unknown upgrade; a missing or broken config prices from tier 0 (${show(junk)})`);
  }

  // ------------------------------------------------------------------ stats per tier
  {
    const problems = [];
    let n = 0;
    for (const id of IDS) {
      for (let t = 0; t < TABLE[id].values.length; t++) {
        const cfg = A.defaultArmoryConfig();
        cfg.up[id] = t;
        let s;
        try {
          s = A.armoryStats(cfg);
        } catch (e) {
          problems.push(`${id} ${t}: threw ${e.message}`);
          continue;
        }
        n++;
        const want = { ...STOCK, [FIELD[id]]: TABLE[id].values[t] };
        if (id === 'grapple') want.reel = REEL[t];
        if (Object.keys(s).sort().join() !== Object.keys(STOCK).sort().join()) problems.push(`${id} ${t}: fields ${Object.keys(s)}`);
        const off = Object.keys(want).filter((k) => s[k] !== want[k]);
        if (off.length) problems.push(`${id} ${t}: ${off.map((k) => `${k} ${s[k]} (want ${want[k]})`).join(', ')}`);
      }
    }
    check(problems.length === 0 && n === 15, `armoryStats: each upgrade changes its own stat at every tier and nothing else (${n} tiers)${problems.length ? ' -> ' + problems.slice(0, 6).join('; ') : ''}`);
    check(same(A.armoryStats(A.defaultArmoryConfig()), STOCK), `tier 0 is the stock crew: ${show(A.armoryStats(null))}`);
    const all = A.defaultArmoryConfig();
    for (const id of IDS) all.up[id] = A.armoryMaxTier(id);
    const top = A.armoryStats(all);
    check(same(top, { crew: 22, blade: 1.6, grappleRange: 20, reel: 0.8, critBase: 0.15 }), `everything maxed: ${show(top)}`);
    const a = A.armoryStats(all);
    a.crew = 999;
    check(A.armoryStats(all).crew === 22 && ARMORY[0].values[3] === 22, 'armoryStats returns a fresh object (changing it changes nothing)');
    const junk = [];
    for (const raw of [null, undefined, 'garbage', '{"up":{"boarders":"lots"}}', 42, [], () => 1, Symbol('x')]) {
      try {
        if (!same(A.armoryStats(raw), STOCK)) junk.push(show(raw));
      } catch (e) {
        junk.push(`${show(raw)} threw ${e.message}`);
      }
    }
    check(junk.length === 0, `armoryStats with a missing or broken config gives the stock crew${junk.length ? ' -> ' + junk.join('; ') : ''}`);
  }

  // ------------------------------------------------------------------ armoryStatText
  {
    const want = [
      ['boarders', 0, '12 hands'], ['boarders', 1, '15 hands'], ['boarders', 2, '18 hands'], ['boarders', 3, '22 hands'],
      ['cutlass', 0, '×1.0'], ['cutlass', 1, '×1.2'], ['cutlass', 2, '×1.4'], ['cutlass', 3, '×1.6'],
      ['grapple', 0, '14 paces'], ['grapple', 1, '17 paces'], ['grapple', 2, '20 paces'],
      ['gunner', 0, '6%'], ['gunner', 1, '9%'], ['gunner', 2, '12%'], ['gunner', 3, '15%'],
      ['boarders', 99, '22 hands'], ['grapple', 3, '20 paces'], ['cutlass', -1, '×1.0'], ['gunner', NaN, '6%'], ['gunner', Infinity, '6%'],
      ['grapple', 1.4, '17 paces'], ['boarders', '2', '12 hands'], ['boarders', undefined, '12 hands'], ['boarders', null, '12 hands'],
      ['nope', 1, ''], ['__proto__', 1, ''], [undefined, 0, ''], ['constructor', 0, ''],
    ];
    const bad = [];
    for (const [id, t, s] of want) {
      let got;
      try {
        got = A.armoryStatText(id, t);
      } catch (e) {
        got = `threw ${e.message}`;
      }
      if (got !== s) bad.push(`${String(id)} ${String(t)}: "${got}" (want "${s}")`);
    }
    check(bad.length === 0, `armoryStatText: "15 hands", "×1.2", "17 paces", "9%"... clamped to the real tiers, '' for unknown ids (${want.length} cases)${bad.length ? ' -> ' + bad.join('; ') : ''}`);
  }

  // ------------------------------------------------------------------ the battle rules agree
  {
    let C = null;
    let why = '';
    if (!fs.existsSync(path.join(ROOT, 'src/combat.js'))) why = 'src/combat.js does not exist yet';
    else {
      try {
        C = await load('src/combat.js');
      } catch (e) {
        why = `src/combat.js did not load (${e.message})`;
      }
      if (C && !(C.BOARD && C.CRIT)) {
        why = 'src/combat.js has no BOARD / CRIT tables yet';
        C = null;
      }
    }
    if (!C) console.log(`SKIP  armory vs combat.js tables: ${why}`);
    else {
      const range = C.BOARD.range;
      const reel = C.BOARD.reel;
      const crit = C.CRIT.base;
      const statsAt = (id, t) => {
        const cfg = A.defaultArmoryConfig();
        cfg.up[id] = t;
        return A.armoryStats(cfg);
      };
      const rangeOk = same(range, TABLE.grapple.values) && range.every((r, t) => statsAt('grapple', t).grappleRange === r);
      const reelOk = same(reel, REEL) && reel.every((r, t) => statsAt('grapple', t).reel === r);
      const critOk = same(crit, TABLE.gunner.values) && crit.every((c, t) => statsAt('gunner', t).critBase === c);
      check(rangeOk && reelOk && critOk, `armory matches combat.js: BOARD.range ${show(range)}, BOARD.reel ${show(reel)}, CRIT.base ${show(crit)}`);
    }
  }

  // ------------------------------------------------------------------ parseArmoryConfig: junk -> defaults
  {
    const hostile = {};
    Object.defineProperty(hostile, 'up', { enumerable: true, get() { throw new Error('getter'); } });
    const hostileUp = { up: {} };
    Object.defineProperty(hostileUp.up, 'boarders', { enumerable: true, get() { throw new Error('getter'); } });
    const thrower = () => { throw new Error('proxy'); };
    const proxy = new Proxy({}, { get: thrower, has: thrower, ownKeys: thrower, getOwnPropertyDescriptor: thrower, getPrototypeOf: thrower });
    const arrayProxy = new Proxy([], { get: thrower, ownKeys: thrower, getOwnPropertyDescriptor: thrower });
    const { proxy: revoked, revoke } = Proxy.revocable({ up: { boarders: 2 } }, {});
    revoke();
    const { proxy: revokedUp, revoke: revokeUp } = Proxy.revocable({ boarders: 2 }, {});
    revokeUp();
    const junk = [
      null, undefined, '', ' ', 'garbage', 'garbage{', '{', '}', '{}', '[]', '[1,2,3]', 'null', 'true', 'false', '42', '"str"',
      'NaN', 'Infinity', '-Infinity', '1e400', '{"up":null}', '{"up":[]}', '{"up":"boarders"}', '{"up":[3,3,2,3]}', '{"up":{"0":3}}',
      '[{"up":{"boarders":2}}]', '{"UP":{"boarders":2}}', '{"up":{"Boarders":2,"CUTLASS":1}}', '{"up":{" boarders":2}}',
      42, -1, NaN, Infinity, true, false, [], [1, 2], {}, () => 1, Symbol('x'), 10n, Object.create(null),
      new Date(0), /x/, new Map([['up', { boarders: 2 }]]), new Set(), new String('{"up":{"boarders":2}}'), [{ up: { boarders: 2 } }],
      hostile, hostileUp, proxy, arrayProxy, revoked, { up: revokedUp }, { up: proxy }, { up: arrayProxy },
      '\u0000', '\ud800', '{"up":{"boarders":1}', '{"up":{"boarders":1}}}', '{"up":{"boarders":1},}', "{'up':{'boarders':1}}", // cut short, trailing junk
    ];
    const bad = [];
    for (const raw of junk) {
      const r = parse(raw);
      if (r.error) bad.push(`${show(raw)}: ${r.error}`);
      else if (!same(r.c, DEFAULT)) bad.push(`${show(raw)}: ${show(r.c)}`);
    }
    check(bad.length === 0, `parseArmoryConfig: ${junk.length} kinds of junk (missing, garbage, cut short, wrong types, throwing getters, proxies, revoked proxies...) all give the default config${bad.length ? ' -> ' + bad.join('; ') : ''}`);
  }

  // ------------------------------------------------------------------ parseArmoryConfig: tiers
  {
    // Does this engine tell JSON.parse revivers the source text? Then number literals that are
    // not plain integers (1e1, 2.0) are caught too; older engines read them as numbers.
    let sourceText = false;
    JSON.parse('1', (k, v, ctx) => { sourceText = !!(ctx && typeof ctx.source === 'string'); return v; });
    const tierOf = (lit, id) => {
      const r = parse(`{"up":{"${id}":${lit},"cutlass":2}}`);
      return r.error ? r.error : id !== 'cutlass' && r.c.up.cutlass !== 2 ? 'lost the cutlass tier' : r.c.up[id];
    };
    // [literal, tier for boarders (max 3), tier for grapple (max 2)]
    const cases = [
      ['1', 1, 1], ['2', 2, 2], ['3', 3, 2], ['0', 0, 0], ['-0', 0, 0], ['99999', 3, 2], ['-3', 0, 0], ['"1"', 1, 1], ['" 2 "', 2, 2],
      ['"3"', 3, 2], ['"1e1"', 0, 0], ['"2.5"', 0, 0], ['"2.0"', 0, 0], ['"0x2"', 0, 0], ['"Infinity"', 0, 0], ['"NaN"', 0, 0], ['""', 0, 0], ['" "', 0, 0],
      ['"1 2"', 0, 0], ['"+1"', 0, 0], ['"-1"', 0, 0], ['2.5', 0, 0], ['1.5', 0, 0], ['-0.5', 0, 0], ['1e400', 0, 0], ['-1e400', 0, 0],
      ['123456789012345678901', 0, 0], ['"123456789012345678901"', 0, 0], ['9007199254740993', 0, 0], ['null', 0, 0], ['true', 0, 0],
      ['false', 0, 0], ['[1]', 0, 0], ['[]', 0, 0], ['{"v":1}', 0, 0], ['{}', 0, 0],
      ...(sourceText ? [['1e1', 0, 0], ['2.0', 0, 0], ['1E0', 0, 0], ['3e0', 0, 0], ['-0.0', 0, 0]] : []),
    ];
    const bad = [];
    for (const [lit, wantB, wantG] of cases) {
      const b = tierOf(lit, 'boarders');
      const g = tierOf(lit, 'grapple');
      if (b !== wantB || g !== wantG) bad.push(`${lit} -> boarders ${b}, grapple ${g} (want ${wantB}, ${wantG})`);
    }
    check(bad.length === 0, `parseArmoryConfig: tiers must be plain integers, clamped to each upgrade's tiers (${cases.length} cases × 2 upgrades${sourceText ? ', incl. number literals like 1e1 and 2.0' : ''})${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    if (!sourceText) console.log('SKIP  this Node cannot see JSON number literals (1e1, 2.0), only their values; those cases were not run');

    const objectCases = [
      [1, 1], [3, 3], [5, 3], [-7, 0], [-0, 0], [NaN, 0], [Infinity, 0], [-Infinity, 0], [2.5, 0], [2.0, 2], [1e1, 3], [Number.MAX_SAFE_INTEGER + 2, 0],
      ['1', 1], [' 2 ', 2], ['1e1', 0], ['2.0', 0], [null, 0], [undefined, 0], [true, 0], [[1], 0], [{ valueOf: () => 1 }, 0], [new Number(1), 0],
      [new String('1'), 0], [1n, 0], [Symbol('x'), 0], [() => 1, 0],
    ];
    const badObj = [];
    for (const [v, want] of objectCases) {
      const r = parse({ up: { boarders: v, gunner: 1 } });
      const got = r.error || r.c.up.boarders;
      if (got !== want || Object.is(got, -0) || (!r.error && r.c.up.gunner !== 1)) badObj.push(`${show(v)} -> ${got}`);
    }
    check(badObj.length === 0, `parseArmoryConfig on a config object: the same tier rules (NaN, ±Infinity, 2.5, -0, too big, boxed numbers...)${badObj.length ? ' -> ' + badObj.join('; ') : ''}`);

    // Field by field: one bad tier does not throw away the good ones.
    const r = parse('{"up":{"boarders":"1e1","cutlass":2.5,"grapple":99,"gunner":"2"}}');
    check(!r.error && same(r.c, { up: { boarders: 0, cutlass: 0, grapple: 2, gunner: 2 } }), `parseArmoryConfig falls back field by field (${show(r.c || r.error)})`);
    const r2 = parse('{"up":{"cutlass":3}}');
    check(!r2.error && same(r2.c, { up: { boarders: 0, cutlass: 3, grapple: 0, gunner: 0 } }), `missing tiers are tier 0 (${show(r2.c || r2.error)})`);
  }

  // ------------------------------------------------------------------ extra fields, prototype tricks, size
  {
    const r = parse('{"up":{"boarders":1,"cannons":9,"toString":1,"guns":2},"look":{"hull":"plum"},"gold":999999,"purse":5,"v":2}');
    check(!r.error && same(r.c, { up: { ...DEFAULT.up, boarders: 1 } }), `unknown fields are dropped (${show(r.c || r.error)})`);
    const p = parse('{"__proto__":{"polluted":1,"up":{"boarders":2}},"up":{"__proto__":{"boarders":2},"constructor":{"prototype":{"polluted":1}}}}');
    const polluted = ({}).polluted !== undefined || Object.prototype.polluted !== undefined;
    check(!p.error && same(p.c, DEFAULT) && !polluted, `__proto__ / constructor tricks give the defaults and pollute nothing (${show(p.c || p.error)})`);
    const inherited = parse(Object.create({ up: { boarders: 2 } }));
    const inheritedTier = parse({ up: Object.create({ boarders: 2 }) });
    check(!inherited.error && same(inherited.c, DEFAULT) && !inheritedTier.error && same(inheritedTier.c, DEFAULT), 'inherited (non-own) fields are ignored');
    const frozen = Object.freeze({ up: Object.freeze({ boarders: 2, grapple: 1 }) });
    const fr = parse(frozen);
    check(!fr.error && same(fr.c, { up: { boarders: 2, cutlass: 0, grapple: 1, gunner: 0 } }) && fr.c !== frozen && fr.c.up !== frozen.up, 'a frozen config object is read, and a fresh config returned');
    const nullProto = Object.assign(Object.create(null), { up: Object.assign(Object.create(null), { gunner: 3 }) });
    const np = parse(nullProto);
    check(!np.error && np.c.up.gunner === 3, 'a config object without a prototype is read too');

    const times = [];
    const timed = (raw) => {
      const t0 = process.hrtime.bigint();
      const res = parse(raw);
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
      return res;
    };
    const huge = [
      ['2 MB of garbage', 'x'.repeat(2e6), DEFAULT],
      ['a 1 MB config', JSON.stringify({ up: { boarders: 1 }, pad: 'a'.repeat(1e6) }), DEFAULT],
      ['a config just over 64 KB', JSON.stringify({ up: { boarders: 1 }, pad: 'a'.repeat(64 * 1024) }), DEFAULT],
      ['a config just under 64 KB', JSON.stringify({ up: { boarders: 1 }, pad: 'a'.repeat(60 * 1024) }), { up: { ...DEFAULT.up, boarders: 1 } }],
      ['a 1 MB tier string', `{"up":{"boarders":"${'1'.repeat(1e6)}"}}`, DEFAULT],
      ['a 60 KB tier string', `{"up":{"boarders":"${'1'.repeat(6e4)}"}}`, DEFAULT],
      ['100k nested arrays', '['.repeat(1e5) + ']'.repeat(1e5), DEFAULT],
      ['30k nested arrays (under the size cap)', '['.repeat(3e4) + ']'.repeat(3e4), DEFAULT],
      ['50k nested objects', '{"up":'.repeat(5e4) + '1' + '}'.repeat(5e4), DEFAULT],
      ['5k nested objects (under the size cap)', '{"up":'.repeat(5e3) + '1' + '}'.repeat(5e3), DEFAULT],
      ['a deep object in a tier', `{"up":{"boarders":${'{"a":'.repeat(4000)}1${'}'.repeat(4000)}}}`, DEFAULT],
      ['a 1M-entry array object', { up: new Array(1e6).fill(3) }, DEFAULT],
      ['an object with 100k keys', { up: Object.fromEntries(Array.from({ length: 1e5 }, (_, i) => [`k${i}`, 1]).concat([['grapple', 1]])) }, { up: { ...DEFAULT.up, grapple: 1 } }],
    ];
    const bad = [];
    for (const [name, raw, want] of huge) {
      const res = timed(raw);
      if (res.error) bad.push(`${name}: ${res.error}`);
      else if (want && !same(res.c, want)) bad.push(`${name}: ${show(res.c)}`);
    }
    check(bad.length === 0 && Math.max(...times) < 1000, `huge and deeply nested input gives a valid config quickly (slowest ${Math.max(...times).toFixed(1)} ms)${bad.length ? ' -> ' + bad.join('; ') : ''}`);
  }

  // ------------------------------------------------------------------ serialize / parse round trip
  {
    let n = 0;
    const bad = [];
    const lists = IDS.map((id) => TABLE[id].values.length);
    const combos = lists.reduce((a, b) => a * b, 1);
    for (let k = 0; k < combos; k++) {
      const cfg = A.defaultArmoryConfig();
      let rest = k;
      IDS.forEach((id, i) => {
        cfg.up[id] = rest % lists[i];
        rest = Math.floor(rest / lists[i]);
      });
      const text = A.serializeArmoryConfig(cfg);
      const back = parse(text);
      n++;
      if (back.error || !same(back.c, cfg) || A.serializeArmoryConfig(back.c) !== text || text !== JSON.stringify(cfg)) bad.push(`${text} -> ${show(back.c || back.error)}`);
    }
    check(bad.length === 0 && n === 192, `serialize -> parse round trips every tier combination (${n} configs)${bad.length ? ' -> ' + bad.slice(0, 3).join('; ') : ''}`);

    let text;
    let threw = '';
    try {
      text = A.serializeArmoryConfig({ up: { boarders: 9, cutlass: 'x', grapple: '1', hack: 1 }, look: { hull: 'royal' }, extra: true });
    } catch (e) {
      threw = e.message;
    }
    check(!threw && text === '{"up":{"boarders":3,"cutlass":0,"grapple":1,"gunner":0}}', `serializeArmoryConfig validates before writing (${threw || text})`);
    let junkText;
    try {
      junkText = [null, undefined, 'garbage', 42, Symbol('x'), () => 1, [], new Proxy({}, { ownKeys() { throw new Error('x'); } })].map((v) => A.serializeArmoryConfig(v));
    } catch (e) {
      junkText = [e.message];
    }
    check(junkText.every((t) => t === DEFAULT_TEXT), 'serializeArmoryConfig of junk writes the defaults');

    // main's loadRecord() rewrites a record when serialize(parse(raw)) !== raw: canonical records are
    // left alone, anything that needed fixing is rewritten.
    const canonical = [DEFAULT_TEXT, '{"up":{"boarders":3,"cutlass":2,"grapple":1,"gunner":0}}'];
    const fixable = [
      '{"up":{"cutlass":2,"boarders":3,"grapple":1,"gunner":0}}', // key order
      '{"up":{"boarders":"3","cutlass":2,"grapple":1,"gunner":0}}', // digit string
      '{"up":{"boarders":3,"cutlass":2,"grapple":1}}', // missing tier
      '{"up":{"boarders":3,"cutlass":2,"grapple":5,"gunner":0}}', // out of range
      '{"up":{"boarders":0,"cutlass":0,"grapple":0,"gunner":0},"x":1}', // extra field
      ' {"up":{"boarders":0,"cutlass":0,"grapple":0,"gunner":0}}', // whitespace
      'garbage',
    ];
    const keep = canonical.filter((raw) => A.serializeArmoryConfig(A.parseArmoryConfig(raw)) !== raw);
    const fix = fixable.filter((raw) => A.serializeArmoryConfig(A.parseArmoryConfig(raw)) === raw);
    check(keep.length === 0 && fix.length === 0, `canonical records are kept as they are; ${fixable.length} records that needed fixing would be rewritten${keep.length + fix.length ? ' -> ' + [...keep, ...fix].join('; ') : ''}`);
  }

  // ------------------------------------------------------------------ nothing ever throws
  {
    const thrower = () => { throw new Error('x'); };
    const junk = [undefined, null, 0, -1, NaN, Infinity, '', 'x', '{}', 'boarders', [], {}, Symbol('s'), 1n, () => 1,
      new Proxy({}, { get: thrower, ownKeys: thrower, getOwnPropertyDescriptor: thrower, has: thrower })];
    const fns = ['armoryMaxTier', 'armoryNextCost', 'armoryStatText', 'armoryStats', 'parseArmoryConfig', 'serializeArmoryConfig'];
    const bad = [];
    let calls = 0;
    for (const f of fns) {
      for (const a of junk) {
        for (const b of junk) {
          calls++;
          try {
            A[f](a, b);
          } catch (e) {
            bad.push(`${f}(${show(a)}, ${show(b)}): ${e.message}`);
          }
        }
      }
    }
    check(bad.length === 0, `no armory function throws on junk arguments (${calls} calls)${bad.length ? ' -> ' + bad.slice(0, 4).join('; ') : ''}`);
    const before = JSON.stringify(ARMORY);
    A.armoryStats({ up: { boarders: 3 } });
    A.parseArmoryConfig('{"up":{"boarders":3}}');
    check(JSON.stringify(ARMORY) === before, 'the ARMORY table is never changed by the functions');
  }

  console.log(failures ? `\n${failures} check(s) failed` : `\nAll armory checks passed (${passes})`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
