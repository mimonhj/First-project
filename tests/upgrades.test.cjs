// Unit checks for the shipyard data and logic in src/upgrades.js (plain Node, no browser):
// - the upgrade table (values, costs, display order) and the paint jobs
// - defaults, maxed tiers and the price of the next tier
// - playerType(): the ship's stats at every tier, never changing the stock ship type
// - parseShipConfig(): whatever is in storage (garbage, tampered or huge) gives a valid config,
//   field by field, without throwing; serializeShipConfig() round trips
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

// The game's modules are browser ES modules in a package without "type": "module". These two
// import nothing, so they are loaded from their source as data: URLs: no build step, no
// "module type" warning, and it works on every Node version in package.json "engines".
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
  const U = await load('src/upgrades.js');
  const { SHIP_TYPES } = await load('src/shipTypes.js');
  const { UPGRADES, LOOKS } = U;

  // The contract: values per tier and the price of each next tier.
  const TABLE = {
    guns: { values: [3, 4, 5], costs: [300, 700] },
    shot: { values: [10, 12, 14, 16], costs: [150, 350, 650] },
    crew: { values: [1.5, 1.35, 1.2, 1.05], costs: [150, 350, 650] },
    hull: { values: [120, 140, 165, 195], costs: [120, 300, 600] },
    sails: { values: [12, 13, 14], costs: [150, 400] },
    carpenter: { values: [2, 3, 4.5], costs: [100, 300] },
  };
  const IDS = Object.keys(TABLE);
  // Stats that ride along with a tier: sails -> accel and turn, carpenter -> regen delay.
  const ACCEL = [4, 4.5, 5];
  const TURN = [1.4, 1.5, 1.6];
  const DELAY = [5, 4, 3];
  // playerType() field for each upgrade's main stat.
  const FIELD = { guns: 'guns', shot: 'dmg', crew: 'reload', hull: 'hp', sails: 'maxSpeed', carpenter: 'regen' };
  const DEFAULT = { up: { guns: 0, shot: 0, crew: 0, hull: 0, sails: 0, carpenter: 0 }, look: { hull: 'honey', sails: 'cream', flag: 'pennant' } };

  // A valid config: exactly these fields, integer tiers in range, known paint ids.
  function invalid(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return 'not an object';
    if (Object.keys(c).sort().join() !== 'look,up') return `fields ${Object.keys(c)}`;
    if (Object.keys(c.up).sort().join() !== [...IDS].sort().join()) return `upgrade fields ${Object.keys(c.up)}`;
    for (const id of IDS) {
      const t = c.up[id];
      if (!Number.isInteger(t) || t < 0 || t > TABLE[id].values.length - 1 || Object.is(t, -0)) return `${id} tier ${String(t)}`;
    }
    if (Object.keys(c.look).sort().join() !== 'flag,hull,sails') return `look fields ${Object.keys(c.look)}`;
    for (const part of ['hull', 'sails', 'flag']) if (!LOOKS[part].some((l) => l.id === c.look[part])) return `${part} paint ${show(c.look[part])}`;
    return '';
  }
  // parseShipConfig() must never throw and always give a valid config.
  function parse(raw) {
    try {
      const c = U.parseShipConfig(raw);
      const bad = invalid(c);
      return bad ? { error: `invalid result (${bad})` } : { c };
    } catch (e) {
      return { error: `threw ${e && e.message}` };
    }
  }

  // ------------------------------------------------------------------ the upgrade table
  check(same(UPGRADES.map((u) => u.id), IDS), `upgrades in display order (${UPGRADES.map((u) => u.id).join(', ')})`);
  for (const u of UPGRADES) {
    const want = TABLE[u.id];
    const texts = ['name', 'blurb', 'stat'].every((k) => typeof u[k] === 'string' && u[k].trim().length > 0);
    check(
      want && same(u.values, want.values) && same(u.costs, want.costs) && u.costs.length === u.values.length - 1 && texts && u.costs.every((c) => Number.isInteger(c) && c > 0),
      `${u.id}: values ${show(u.values)}, costs ${show(u.costs)}, with a name, blurb and stat label ("${u.name}")`,
    );
  }
  // Tier 0 is the stock ship: buying nothing must not change how the game plays.
  const stock = SHIP_TYPES.player;
  const tier0 = U.playerType(stock, U.defaultShipConfig());
  const stockFields = ['hp', 'maxSpeed', 'accel', 'turn', 'reload', 'guns', 'dmg'];
  check(stockFields.every((k) => tier0[k] === stock[k]) && tier0.regen === 2 && tier0.regenDelay === 5, `tier 0 is the stock Sea Biscuit (${stockFields.map((k) => `${k} ${tier0[k]}`).join(', ')}, repairs ${tier0.regen} hp/s after ${tier0.regenDelay} s)`);

  const maxes = IDS.map((id) => U.maxTier(id));
  check(same(maxes, IDS.map((id) => TABLE[id].values.length - 1)) && U.maxTier('nope') === 0 && U.maxTier(undefined) === 0, `maxTier: ${IDS.map((id, i) => `${id} ${maxes[i]}`).join(', ')}; unknown ids 0`);

  // ------------------------------------------------------------------ paint
  const LOOK_IDS = {
    hull: ['honey', 'royal', 'crimson', 'emerald', 'plum', 'driftwood'],
    sails: ['cream', 'snow', 'crimson', 'midnight', 'sunset', 'sky'],
    flag: ['pennant', 'scarlet', 'gold', 'jolly'],
  };
  const colour = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffff;
  const HULL_COLOURS = ['top', 'stripe', 'bottom', 'wall', 'rim', 'cabin', 'cap', 'trim', 'accent', 'crest'];
  for (const part of ['hull', 'sails', 'flag']) {
    const list = LOOKS[part] || [];
    const problems = [];
    for (const l of list) {
      if (typeof l.name !== 'string' || !l.name.trim()) problems.push(`${l.id}: no name`);
      if (!Array.isArray(l.swatch) || !l.swatch.length || !l.swatch.every(colour)) problems.push(`${l.id}: bad swatch`);
      if (part === 'hull' && !HULL_COLOURS.every((k) => colour(l[k]))) problems.push(`${l.id}: missing hull colours`);
      if (part === 'sails' && !colour(l.cloth)) problems.push(`${l.id}: no cloth colour`);
      if (part === 'flag' && (!['pennant', 'jolly'].includes(l.kind) || !colour(l.color))) problems.push(`${l.id}: bad flag`);
    }
    check(same(list.map((l) => l.id), LOOK_IDS[part]) && problems.length === 0, `paint ${part}: ${list.map((l) => l.id).join(', ')} (default ${list[0] && list[0].id}), each named with swatch colours${problems.length ? ' -> ' + problems.join('; ') : ''}`);
  }
  check(LOOKS.flag.find((l) => l.id === 'jolly').kind === 'jolly', 'the Jolly Roger is a real Jolly Roger flag');
  check(U.findLook('hull', 'royal') === LOOKS.hull[1] && U.findLook('sails', 'nope') === LOOKS.sails[0] && U.findLook('flag', '__proto__') === LOOKS.flag[0] && U.findLook('constructor', 'x') === null, 'findLook: known ids, the default for unknown ones, null for an unknown part');

  // ------------------------------------------------------------------ defaults
  const d1 = U.defaultShipConfig();
  const d2 = U.defaultShipConfig();
  d1.up.guns = 2;
  d1.look.hull = 'royal';
  check(same(d2, DEFAULT) && d1.up !== d2.up && d1.look !== d2.look, `defaultShipConfig: ${show(d2)}, a fresh object every call`);

  // ------------------------------------------------------------------ prices
  {
    const problems = [];
    for (const id of IDS) {
      const { values, costs } = TABLE[id];
      for (let t = 0; t < values.length; t++) {
        const cfg = U.defaultShipConfig();
        cfg.up[id] = t;
        const want = t < costs.length ? costs[t] : null;
        const got = U.nextCost(cfg, id);
        const fromJson = U.nextCost(JSON.stringify(cfg), id);
        if (got !== want || fromJson !== want) problems.push(`${id} tier ${t}: ${got}/${fromJson}, want ${want}`);
      }
    }
    check(problems.length === 0, `nextCost: the price of every next tier, null once maxed${problems.length ? ' -> ' + problems.join('; ') : ''}`);
    check(U.nextCost(U.defaultShipConfig(), 'nope') === null && U.nextCost(null, 'guns') === 300 && U.nextCost('garbage', 'hull') === 120, 'nextCost: null for an unknown upgrade; a missing or broken config prices from tier 0');
    const total = IDS.reduce((s, id) => s + TABLE[id].costs.reduce((a, b) => a + b, 0), 0);
    check(total === 5270, `buying everything costs ${total} gold`);
  }

  // ------------------------------------------------------------------ stats per tier
  {
    const frozen = JSON.parse(JSON.stringify(stock));
    const base = Object.freeze({ ...stock });
    const problems = [];
    for (const id of IDS) {
      for (let t = 0; t < TABLE[id].values.length; t++) {
        const cfg = U.defaultShipConfig();
        cfg.up[id] = t;
        let p;
        try {
          p = U.playerType(base, cfg);
        } catch (e) {
          problems.push(`${id} ${t}: threw ${e.message}`);
          continue;
        }
        const want = { ...tier0, [FIELD[id]]: TABLE[id].values[t] };
        if (id === 'sails') Object.assign(want, { accel: ACCEL[t], turn: TURN[t] });
        if (id === 'carpenter') want.regenDelay = DELAY[t];
        const off = Object.keys(want).filter((k) => p[k] !== want[k]);
        if (off.length) problems.push(`${id} ${t}: ${off.map((k) => `${k} ${p[k]} (want ${want[k]})`).join(', ')}`);
        if (p === base) problems.push(`${id} ${t}: returned the base object`);
      }
    }
    check(problems.length === 0, `playerType: each upgrade changes its own stats at every tier and nothing else${problems.length ? ' -> ' + problems.slice(0, 6).join('; ') : ''}`);
    const all = U.defaultShipConfig();
    for (const id of IDS) all.up[id] = U.maxTier(id);
    const top = U.playerType(stock, all);
    const got = ['hp', 'maxSpeed', 'accel', 'turn', 'reload', 'guns', 'dmg', 'regen', 'regenDelay'].map((k) => top[k]);
    check(same(got, [195, 14, 5, 1.6, 1.05, 5, 16, 4.5, 3]), `everything maxed: ${got.join(', ')} (hp, speed, accel, turn, reload, guns, damage, repairs, repair delay)`);
    check(top.name === stock.name && top.len === stock.len && top.wid === stock.wid, 'playerType keeps the base type\'s other fields (name, length, width)');
    check(JSON.stringify(stock) === JSON.stringify(frozen) && top !== stock, `playerType never changes SHIP_TYPES.player (still ${stock.guns} guns, ${stock.hp} hp)`);
    const junk = U.playerType(stock, '{"up":{"guns":"lots"}}');
    check(stockFields.every((k) => junk[k] === stock[k]), 'playerType with a broken config gives the stock stats');
  }

  // ------------------------------------------------------------------ statText
  {
    const want = [
      ['guns', 0, '3 guns'], ['guns', 2, '5 guns'], ['shot', 1, '12 damage'], ['crew', 0, '1.5 s'], ['crew', 1, '1.35 s'],
      ['crew', 3, '1.05 s'], ['hull', 1, '140 hp'], ['sails', 1, '13 knots'], ['carpenter', 2, '4.5 hp/s'],
      ['guns', 99, '5 guns'], ['guns', -1, '3 guns'], ['shot', NaN, '10 damage'], ['nope', 1, ''],
    ];
    const bad = want.filter(([id, t, s]) => U.statText(id, t) !== s).map(([id, t, s]) => `${id} ${t}: "${U.statText(id, t)}" (want "${s}")`);
    check(bad.length === 0, `statText: "3 guns", "1.35 s", "140 hp"... clamped to the real tiers, '' for unknown ids${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    const missing = [];
    for (const id of IDS) TABLE[id].values.forEach((v, t) => { if (!U.statText(id, t).includes(String(v))) missing.push(`${id} ${t}`); });
    check(missing.length === 0, `statText shows the stat's value at every tier${missing.length ? ' -> ' + missing.join(', ') : ''}`);
  }

  // ------------------------------------------------------------------ parseShipConfig: junk -> defaults
  {
    const hostile = {};
    Object.defineProperty(hostile, 'up', { enumerable: true, get() { throw new Error('getter'); } });
    const proxy = new Proxy({}, { get() { throw new Error('proxy'); }, has() { throw new Error('proxy'); }, ownKeys() { throw new Error('proxy'); }, getOwnPropertyDescriptor() { throw new Error('proxy'); } });
    const junk = [
      null, undefined, '', ' ', 'garbage', 'garbage{', '{', '}', '{}', '[]', '[1,2,3]', 'null', 'true', 'false', '42', '"str"',
      'NaN', 'Infinity', '-Infinity', '1e400', '{"up":null,"look":null}', '{"up":[],"look":[]}', '{"up":"guns","look":"royal"}',
      '[{"up":{"guns":2}}]', '{"UP":{"guns":2}}', 42, -1, NaN, Infinity, true, false, [], [1, 2], {}, () => 1, Symbol('x'), 10n,
      new Date(0), /x/, new Map(), hostile, proxy,
      '\u0000', '\ud800', '{"up":{"guns":1}', // a broken surrogate, JSON cut short
    ];
    const bad = [];
    for (const raw of junk) {
      const r = parse(raw);
      if (r.error) bad.push(`${show(raw)}: ${r.error}`);
      else if (!same(r.c, DEFAULT)) bad.push(`${show(raw)}: ${show(r.c)}`);
    }
    check(bad.length === 0, `parseShipConfig: ${junk.length} kinds of junk (missing, garbage, cut short, wrong types, throwing getters, proxies...) all give the default config${bad.length ? ' -> ' + bad.join('; ') : ''}`);
  }

  // ------------------------------------------------------------------ parseShipConfig: tiers
  {
    // Does this engine tell JSON.parse revivers the source text? Then number literals that are
    // not plain integers (1e1, 2.0) are caught too; older engines read them as numbers.
    let sourceText = false;
    JSON.parse('1', (k, v, ctx) => { sourceText = !!(ctx && typeof ctx.source === 'string'); return v; });
    const tierOf = (lit, id = 'guns') => {
      const r = parse(`{"up":{"${id}":${lit}},"look":{"hull":"royal"}}`);
      return r.error ? r.error : r.c.look.hull !== 'royal' ? 'lost the hull paint' : r.c.up[id];
    };
    const cases = [
      ['1', 1], ['2', 2], ['0', 0], ['-0', 0], ['99999', 2], ['-3', 0], ['"1"', 1], ['" 2 "', 2], ['"2"', 2],
      ['"1e1"', 0], ['"2.5"', 0], ['"0x2"', 0], ['"Infinity"', 0], ['"NaN"', 0], ['""', 0], ['" "', 0], ['"1 2"', 0], ['"+1"', 0],
      ['2.5', 0], ['1.5', 0], ['-0.5', 0], ['1e400', 0], ['-1e400', 0], ['123456789012345678901', 0], ['"123456789012345678901"', 0],
      ['null', 0], ['true', 0], ['false', 0], ['[1]', 0], ['{"v":1}', 0],
      ...(sourceText ? [['1e1', 0], ['2.0', 0], ['1E0', 0]] : []),
    ];
    const bad = cases.filter(([lit, want]) => tierOf(lit) !== want).map(([lit, want]) => `${lit} -> ${tierOf(lit)} (want ${want})`);
    check(bad.length === 0, `parseShipConfig: tiers must be plain integers, clamped to the upgrade's tiers (${cases.length} cases${sourceText ? ', incl. number literals like 1e1 and 2.0' : ''})${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    if (!sourceText) console.log('SKIP  this Node cannot see JSON number literals (1e1, 2.0), only their values; those cases were not run');

    const objectCases = [
      [1, 1], [5, 2], [-7, 0], [-0, 0], [NaN, 0], [Infinity, 0], [-Infinity, 0], [2.5, 0], [Number.MAX_SAFE_INTEGER + 2, 0],
      ['1', 1], [' 2 ', 2], ['1e1', 0], [null, 0], [true, 0], [[1], 0], [{ valueOf: () => 1 }, 0], [new Number(1), 0], [1n, 0],
    ];
    const badObj = [];
    for (const [v, want] of objectCases) {
      const r = parse({ up: { guns: v, hull: 1 } });
      const got = r.error || r.c.up.guns;
      if (got !== want || Object.is(got, -0) || (!r.error && r.c.up.hull !== 1)) badObj.push(`${show(v)} -> ${got}`);
    }
    check(badObj.length === 0, `parseShipConfig on a config object: the same tier rules (NaN, ±Infinity, 2.5, -0, too big...)${badObj.length ? ' -> ' + badObj.join('; ') : ''}`);

    // Field by field: one bad tier does not throw away the good ones.
    const r = parse('{"up":{"guns":"1e1","shot":2.5,"crew":-3,"hull":99,"sails":null,"carpenter":"2"},"look":{"hull":"nope","sails":"crimson","flag":{}}}');
    const want = { up: { guns: 0, shot: 0, crew: 0, hull: 3, sails: 0, carpenter: 2 }, look: { hull: 'honey', sails: 'crimson', flag: 'pennant' } };
    check(!r.error && same(r.c, want), `parseShipConfig falls back field by field (${show(r.c || r.error)})`);
  }

  // ------------------------------------------------------------------ parseShipConfig: paint
  {
    const cases = [
      [{ hull: 'royal', sails: 'snow', flag: 'jolly' }, { hull: 'royal', sails: 'snow', flag: 'jolly' }],
      [{ hull: 'Royal', sails: 'SNOW', flag: 'Jolly' }, DEFAULT.look],
      [{ hull: 'nope', sails: 'midnight', flag: 'gold' }, { hull: 'honey', sails: 'midnight', flag: 'gold' }],
      [{ hull: ['royal'], sails: { id: 'snow' }, flag: 3 }, DEFAULT.look],
      [{ hull: '__proto__', sails: 'constructor', flag: 'toString' }, DEFAULT.look],
      [{ hull: ' royal', sails: 'snow ', flag: '' }, DEFAULT.look],
      [{ hull: 'crimson', sails: 'crimson', flag: 'scarlet' }, { hull: 'crimson', sails: 'crimson', flag: 'scarlet' }],
      [{ hull: 'sky', sails: 'royal', flag: 'pennant' }, DEFAULT.look], // ids of another part
    ];
    const bad = [];
    for (const [look, want] of cases) {
      for (const raw of [{ look }, JSON.stringify({ look })]) {
        const r = parse(raw);
        if (r.error || !same(r.c.look, want)) bad.push(`${show(look)} -> ${show(r.c ? r.c.look : r.error)}`);
      }
    }
    check(bad.length === 0, `parseShipConfig: only known paint ids are kept, each part on its own${bad.length ? ' -> ' + bad.join('; ') : ''}`);
  }

  // ------------------------------------------------------------------ parseShipConfig: extra fields, prototype tricks, size
  {
    const r = parse('{"up":{"guns":1,"cannons":9,"toString":1},"look":{"hull":"plum","glitter":"yes"},"gold":999999,"purse":5}');
    check(!r.error && same(r.c, { up: { ...DEFAULT.up, guns: 1 }, look: { ...DEFAULT.look, hull: 'plum' } }), `unknown fields are dropped (${show(r.c || r.error)})`);
    const p = parse('{"__proto__":{"polluted":1,"up":{"guns":2}},"up":{"__proto__":{"guns":2},"constructor":{"prototype":{"polluted":1}}},"look":{"__proto__":{"hull":"royal"}}}');
    const polluted = ({}).polluted !== undefined || Object.prototype.polluted !== undefined;
    check(!p.error && same(p.c, DEFAULT) && !polluted, `__proto__ / constructor tricks give the defaults and pollute nothing (${show(p.c || p.error)})`);
    const inherited = parse(Object.create({ up: { guns: 2 }, look: { hull: 'royal' } }));
    check(!inherited.error && same(inherited.c, DEFAULT), 'inherited (non-own) fields are ignored');

    const sizes = [];
    const timed = (raw) => {
      const t0 = process.hrtime.bigint();
      const res = parse(raw);
      sizes.push(Number(process.hrtime.bigint() - t0) / 1e6);
      return res;
    };
    const huge = [
      ['2 MB of garbage', 'x'.repeat(2e6), DEFAULT],
      ['a 1 MB config', JSON.stringify({ up: { guns: 1 }, look: { hull: 'royal' }, pad: 'a'.repeat(1e6) }), null],
      ['a 1 MB tier string', `{"up":{"guns":"${'1'.repeat(1e6)}"}}`, null],
      ['100k nested arrays', '['.repeat(1e5) + ']'.repeat(1e5), DEFAULT],
      ['50k nested objects', '{"up":'.repeat(5e4) + '1' + '}'.repeat(5e4), DEFAULT],
      ['a deep object in a tier', `{"up":{"guns":${'{"a":'.repeat(2000)}1${'}'.repeat(2000)}}}`, DEFAULT],
    ];
    const bad = [];
    for (const [name, raw, want] of huge) {
      const res = timed(raw);
      if (res.error) bad.push(`${name}: ${res.error}`);
      else if (want && !same(res.c, want)) bad.push(`${name}: ${show(res.c)}`);
    }
    check(bad.length === 0 && Math.max(...sizes) < 1000, `huge and deeply nested input gives a valid config quickly (slowest ${Math.max(...sizes).toFixed(1)} ms)${bad.length ? ' -> ' + bad.join('; ') : ''}`);
  }

  // ------------------------------------------------------------------ serialize / parse round trip
  {
    let n = 0;
    const bad = [];
    const lists = IDS.map((id) => TABLE[id].values.length);
    const combos = lists.reduce((a, b) => a * b, 1);
    for (let k = 0; k < combos; k++) {
      const cfg = U.defaultShipConfig();
      let rest = k;
      IDS.forEach((id, i) => { cfg.up[id] = rest % lists[i]; rest = Math.floor(rest / lists[i]); });
      cfg.look = { hull: LOOK_IDS.hull[k % 6], sails: LOOK_IDS.sails[(k >> 2) % 6], flag: LOOK_IDS.flag[(k >> 3) % 4] };
      const text = U.serializeShipConfig(cfg);
      const back = parse(text);
      n++;
      if (back.error || !same(back.c, cfg) || U.serializeShipConfig(back.c) !== text) bad.push(`${text} -> ${show(back.c || back.error)}`);
    }
    for (const hull of LOOK_IDS.hull) for (const sails of LOOK_IDS.sails) for (const flag of LOOK_IDS.flag) {
      const cfg = { up: { ...DEFAULT.up }, look: { hull, sails, flag } };
      const back = parse(U.serializeShipConfig(cfg));
      n++;
      if (back.error || !same(back.c, cfg)) bad.push(`${hull}/${sails}/${flag}`);
    }
    check(bad.length === 0, `serialize -> parse round trips every tier combination and paint job (${n} configs)${bad.length ? ' -> ' + bad.slice(0, 3).join('; ') : ''}`);
    let text;
    let threw = '';
    try {
      text = U.serializeShipConfig({ up: { guns: 9, shot: 'x', hack: 1 }, look: { hull: 'royal', flag: 'nope' }, extra: true });
    } catch (e) {
      threw = e.message;
    }
    check(!threw && text === JSON.stringify({ up: { ...DEFAULT.up, guns: 2 }, look: { ...DEFAULT.look, hull: 'royal' } }), `serializeShipConfig validates before writing (${threw || text})`);
    let junkText;
    try {
      junkText = [null, undefined, 'garbage', 42, Symbol('x')].map((v) => U.serializeShipConfig(v));
    } catch (e) {
      junkText = [e.message];
    }
    check(junkText.every((t) => t === JSON.stringify(DEFAULT)), 'serializeShipConfig of junk writes the defaults');
  }

  // ================================================================== appended: SPEC3 §3.1 / §10.1, the Big rudder & wheel
  // RUDDER and SHIPYARD (UPGRADES stays the six rows above), the sparse up.rudder (absent at tier 0, written
  // from tier 1, junk clamped or dropped; today's records stay canonical byte for byte), playerType's turn and
  // turnLow at every rudder tier with every sails tier, statText('rudder', t), and the shipyard's prices.
  {
    const { RUDDER, SHIPYARD } = U;
    const RUD = { id: 'rudder', name: 'Big rudder & wheel', stat: 'Turning when slow', values: [0.35, 0.5, 0.65, 0.8], turnMul: [1, 1.05, 1.1, 1.15], costs: [120, 300, 550] };
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const rising = (a) => a.every((v, i) => i === 0 || v > a[i - 1]);
    // parse() above with the sparse rudder allowed: the six tiers, then up.rudder only as 1..3
    const parse = (raw) => {
      let c;
      try {
        c = U.parseShipConfig(raw);
      } catch (e) {
        return { error: `threw ${e && e.message}` };
      }
      const has = !!c && !!c.up && Object.prototype.hasOwnProperty.call(c.up, 'rudder');
      const r = has ? c.up.rudder : undefined;
      if (has && !(Number.isInteger(r) && r >= 1 && r <= 3)) return { error: `invalid result (rudder ${show(r)})` };
      const six = has ? { ...c, up: Object.fromEntries(Object.entries(c.up).filter(([k]) => k !== 'rudder')) } : c;
      const bad = invalid(six) || (has && Object.keys(c.up).pop() !== 'rudder' ? 'rudder is not written last' : '');
      return bad ? { error: `invalid result (${bad})` } : { c };
    };

    // ---- the table
    const okTable = !!RUDDER && RUDDER.id === RUD.id && RUDDER.name === RUD.name && RUDDER.stat === RUD.stat &&
      typeof RUDDER.blurb === 'string' && RUDDER.blurb.trim().length > 0 && same(RUDDER.values, RUD.values) &&
      same(RUDDER.turnMul, RUD.turnMul) && same(RUDDER.costs, RUD.costs) && RUDDER.costs.length === RUDDER.values.length - 1 &&
      RUDDER.turnMul.length === RUDDER.values.length && RUDDER.costs.every((c) => Number.isInteger(c) && c > 0);
    check(okTable, `RUDDER: "${RUDDER && RUDDER.name}", turning when slow ${show(RUDDER && RUDDER.values)}, at speed ×${show(RUDDER && RUDDER.turnMul)}, costs ${show(RUDDER && RUDDER.costs)}, with a blurb and a stat label`);
    check(okTable && RUDDER.values[0] === 0.35 && RUDDER.turnMul[0] === 1 && rising(RUDDER.values) && rising(RUDDER.turnMul) && RUDDER.values.every((v) => v > 0 && v < 1),
      'RUDDER tier 0 is the stock rudder (35% of the turn at a standstill, ×1 at speed: every enemy keeps it); each tier turns better, never past the full rate');
    const rudderGold = okTable ? sum(RUDDER.costs) : NaN;
    const yardGold = Array.isArray(SHIPYARD) ? sum(SHIPYARD.map((u) => sum(u.costs))) : NaN;
    check(rudderGold === 970 && yardGold === 6240, `the rudder costs ${rudderGold} gold (970) and the whole shipyard ${yardGold} (5,270 + 970 = 6,240)`);
    check(Array.isArray(SHIPYARD) && SHIPYARD.length === 7 && UPGRADES.every((u, i) => SHIPYARD[i] === u) && SHIPYARD[6] === RUDDER && UPGRADES.length === 6 && !UPGRADES.includes(RUDDER),
      `SHIPYARD is [...UPGRADES, RUDDER] (${Array.isArray(SHIPYARD) ? SHIPYARD.map((u) => u.id).join(', ') : show(SHIPYARD)}); UPGRADES keeps its six rows`);

    // ---- maxTier / nextCost know 'rudder', reading the sparse field
    {
      const bad = [];
      if (U.maxTier('rudder') !== 3) bad.push(`maxTier ${U.maxTier('rudder')}`);
      const at = (t) => {
        const cfg = U.defaultShipConfig();
        if (t !== undefined) cfg.up.rudder = t;
        return cfg;
      };
      const want = [[undefined, 120], [0, 120], [1, 300], [2, 550], [3, null]];
      for (const [t, cost] of want) {
        const got = [U.nextCost(at(t), 'rudder'), U.nextCost(JSON.stringify(at(t)), 'rudder')];
        if (got[0] !== cost || got[1] !== cost) bad.push(`tier ${t}: ${got} (want ${cost})`);
      }
      if (U.nextCost(null, 'rudder') !== 120 || U.nextCost('garbage', 'rudder') !== 120 || U.nextCost('{"up":{"rudder":"9"}}', 'rudder') !== null) bad.push('missing / broken / clamped configs');
      // the shipyard's buy: (up[id] ?? 0) + 1 up to maxTier, paying nextCost each time (SPEC3 §10.2)
      let cfg = U.defaultShipConfig();
      let paid = 0;
      const tiers = [];
      for (let k = 0; k < 5; k++) {
        const cost = U.nextCost(cfg, 'rudder');
        if (cost === null) break;
        paid += cost;
        cfg.up.rudder = Math.min(U.maxTier('rudder'), (cfg.up.rudder ?? 0) + 1);
        cfg = U.parseShipConfig(U.serializeShipConfig(cfg));
        tiers.push(cfg.up.rudder);
      }
      if (paid !== 970 || tiers.join() !== '1,2,3') bad.push(`buying every tier: paid ${paid}, tiers ${tiers}`);
      check(bad.length === 0, `maxTier('rudder') 3; nextCost 120 / 300 / 550 / null with up.rudder missing, 0, 1, 2, 3 (objects and stored text); buying tier by tier pays 970${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    }

    // ---- the sparse field: absent at 0, written from 1, junk dropped or clamped
    {
      check(!('rudder' in U.defaultShipConfig().up) && Object.keys(U.defaultShipConfig().up).join() === IDS.join(), 'defaultShipConfig has no up.rudder (tier 0 is the missing field)');
      let sourceText = false;
      JSON.parse('1', (k, v, ctx) => { sourceText = !!(ctx && typeof ctx.source === 'string'); return v; });
      const NONE = 'absent';
      const cases = [
        ['1', 1], ['2', 2], ['3', 3], ['0', NONE], ['-0', NONE], ['4', 3], ['99999', 3], ['-2', NONE], ['"2"', 2], ['" 1 "', 1], ['"0"', NONE],
        ['"1e1"', NONE], ['"2.5"', NONE], ['"+1"', NONE], ['""', NONE], ['2.5', NONE], ['0.5', NONE], ['1e400', NONE], ['123456789012345678901', NONE],
        ['null', NONE], ['true', NONE], ['false', NONE], ['[2]', NONE], ['{"tier":2}', NONE], ['"big"', NONE],
        ...(sourceText ? [['1e0', NONE], ['2.0', NONE], ['3E0', NONE]] : []),
      ];
      const bad = [];
      for (const [lit, want] of cases) {
        const r = parse(`{"up":{"guns":1,"rudder":${lit},"sails":2},"look":{"hull":"royal"}}`);
        if (r.error) {
          bad.push(`${lit}: ${r.error}`);
          continue;
        }
        const has = Object.prototype.hasOwnProperty.call(r.c.up, 'rudder');
        const got = has ? r.c.up.rudder : NONE;
        const keys = Object.keys(r.c.up).join();
        const wantKeys = want === NONE ? IDS.join() : [...IDS, 'rudder'].join();
        if (got !== want || keys !== wantKeys || r.c.up.guns !== 1 || r.c.up.sails !== 2 || r.c.look.hull !== 'royal') bad.push(`${lit} -> ${show(r.c.up)}`);
      }
      const hostileUp = { guns: 1 };
      Object.defineProperty(hostileUp, 'rudder', { enumerable: true, get() { throw new Error('getter'); } });
      const objCases = [
        [{ guns: 1, rudder: 2 }, 2], [{ guns: 1, rudder: 3 }, 3], [{ guns: 1, rudder: 7 }, 3], [{ guns: 1, rudder: -0 }, NONE], [{ guns: 1, rudder: 0 }, NONE],
        [{ guns: 1, rudder: NaN }, NONE], [{ guns: 1, rudder: Infinity }, NONE], [{ guns: 1, rudder: 1.5 }, NONE], [{ guns: 1, rudder: 2n }, NONE],
        [{ guns: 1, rudder: new Number(2) }, NONE], [{ guns: 1, rudder: { valueOf: () => 2 } }, NONE], [Object.assign(Object.create({ rudder: 2 }), { guns: 1 }), NONE], [hostileUp, NONE],
      ];
      for (const [up, want] of objCases) {
        const r = parse({ up, look: { hull: 'royal' } });
        const got = r.error ? r.error : Object.prototype.hasOwnProperty.call(r.c.up, 'rudder') ? r.c.up.rudder : NONE;
        if (got !== want || (!r.error && r.c.up.guns !== 1)) bad.push(`${show(up)} -> ${got}`);
      }
      const proto = parse('{"up":{"guns":1,"__proto__":{"rudder":2}},"__proto__":{"up":{"rudder":3}}}');
      if (proto.error || 'rudder' in proto.c.up || ({}).rudder !== undefined) bad.push(`__proto__ -> ${show(proto.c || proto.error)}`);
      check(bad.length === 0, `parseShipConfig: up.rudder is kept only as a plain integer 1..3 (above 3 clamped to 3), written after the six tiers; 0, junk and inherited values leave it out, the other fields kept (${cases.length + objCases.length + 1} cases)${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    }

    // ---- today's records stay canonical byte for byte; rudder records are written exactly once
    {
      const TODAY = [
        JSON.stringify(DEFAULT),
        '{"up":{"guns":2,"shot":3,"crew":3,"hull":3,"sails":2,"carpenter":2},"look":{"hull":"plum","sails":"midnight","flag":"jolly"}}',
        '{"up":{"guns":1,"shot":0,"crew":2,"hull":0,"sails":1,"carpenter":0},"look":{"hull":"royal","sails":"snow","flag":"gold"}}',
      ];
      const kept = TODAY.filter((t) => U.serializeShipConfig(U.parseShipConfig(t)) !== t);
      check(kept.length === 0, `today's ship records (no rudder) are already canonical, so loading never rewrites them${kept.length ? ' -> ' + kept.join('; ') : ''}`);
      const withRudder = '{"up":{"guns":0,"shot":0,"crew":0,"hull":0,"sails":0,"carpenter":0,"rudder":2},"look":{"hull":"honey","sails":"cream","flag":"pennant"}}';
      const fixes = [
        [withRudder, withRudder],
        [withRudder.replace('"rudder":2', '"rudder":0'), JSON.stringify(DEFAULT)],
        [withRudder.replace('"rudder":2', '"rudder":9'), withRudder.replace('"rudder":2', '"rudder":3')],
        [withRudder.replace('"rudder":2', '"rudder":"2"'), withRudder],
        [withRudder.replace('{"guns":0', '{"rudder":1,"guns":0').replace(',"rudder":2', ''), withRudder.replace('"rudder":2', '"rudder":1')],
      ];
      const bad = fixes.filter(([raw, want]) => U.serializeShipConfig(U.parseShipConfig(raw)) !== want).map(([raw]) => `${raw} -> ${U.serializeShipConfig(U.parseShipConfig(raw))}`);
      check(bad.length === 0, `serializeShipConfig writes up.rudder last and only from tier 1 (a stored 0 is dropped, 9 becomes 3, "2" becomes 2, a rudder written first moves last)${bad.length ? ' -> ' + bad.join('; ') : ''}`);

      let n = 0;
      const badTrip = [];
      const lists = IDS.map((id) => TABLE[id].values.length);
      const combos = lists.reduce((a, b) => a * b, 1);
      for (let k = 0; k < combos; k++) {
        for (let r = 0; r <= 3; r++) {
          const cfg = U.defaultShipConfig();
          let rest = k;
          IDS.forEach((id, i) => { cfg.up[id] = rest % lists[i]; rest = Math.floor(rest / lists[i]); });
          if (r) cfg.up.rudder = r;
          cfg.look = { hull: LOOK_IDS.hull[(k + r) % 6], sails: LOOK_IDS.sails[k % 6], flag: LOOK_IDS.flag[r] };
          const text = U.serializeShipConfig(cfg);
          const back = parse(text);
          n++;
          if (back.error || !same(back.c, cfg) || U.serializeShipConfig(back.c) !== text || text.includes('"rudder"') !== r > 0) badTrip.push(`${text} -> ${show(back.c || back.error)}`);
        }
      }
      check(badTrip.length === 0, `serialize -> parse round trips every tier combination with each rudder tier (${n} configs)${badTrip.length ? ' -> ' + badTrip.slice(0, 3).join('; ') : ''}`);
    }

    // ---- playerType: the rudder sets turnLow and multiplies the sails' turn
    {
      const MUL = RUD.turnMul;
      const LOW = RUD.values;
      const bad = [];
      const baseFor = (s) => U.playerType(stock, { up: { sails: s } });
      for (let s = 0; s < TURN.length; s++) {
        const ref = baseFor(s);
        if (ref.turn !== TURN[s] || ref.turnLow !== 0.35) bad.push(`sails ${s} without a rudder: turn ${ref.turn}, turnLow ${ref.turnLow}`);
        for (let r = 0; r < LOW.length; r++) {
          for (const cfg of [{ up: { sails: s, rudder: r } }, JSON.stringify({ up: { sails: s, rudder: r } })]) {
            const p = U.playerType(stock, cfg);
            const want = TURN[s] * MUL[r];
            if (!(Math.abs(p.turn - want) < 1e-9) || Number(p.turn.toFixed(6)) !== p.turn) bad.push(`sails ${s} rudder ${r}: turn ${p.turn} (want ${want})`);
            if (p.turnLow !== LOW[r]) bad.push(`sails ${s} rudder ${r}: turnLow ${p.turnLow}`);
            const other = Object.keys(ref).filter((k) => k !== 'turn' && k !== 'turnLow' && p[k] !== ref[k]);
            if (other.length) bad.push(`sails ${s} rudder ${r} changed ${other}`);
          }
        }
      }
      check(bad.length === 0, `playerType: turn = racing sails' turn × the rudder's turnMul and turnLow = its value at every rudder tier with every sails tier (${TURN.length * LOW.length} pairs); nothing else changes${bad.length ? ' -> ' + bad.slice(0, 6).join('; ') : ''}`);
      // main's turnRate (SPEC3 §3.1): the full rate times (low + (1 - low) × speed share)
      const rate = (p, speed) => p.turn * (p.turnLow + (1 - p.turnLow) * Math.min(1, speed / p.maxSpeed));
      const stock0 = U.playerType(stock, U.defaultShipConfig());
      const r3 = U.playerType(stock, { up: { rudder: 3 } });
      const best = U.playerType(stock, { up: { sails: 2, rudder: 3 } });
      const nums = [rate(stock0, 0), rate(r3, 0), rate(best, best.maxSpeed), rate(U.playerType(stock, { up: { sails: 2 } }), 14)];
      check(Math.abs(nums[0] - 0.49) < 1e-9 && nums[1].toFixed(2) === '1.29' && Math.abs(nums[2] - 1.84) < 1e-9 && Math.abs(nums[3] - 1.6) < 1e-9 && rate(stock0, stock0.maxSpeed) === stock.turn,
        `the turn rates of §3.1: a stock ship at a standstill ${nums[0].toFixed(2)} rad/s (0.49), tier 3 ${nums[1].toFixed(3)} (1.29); the best ship at full speed ${nums[2].toFixed(2)} (1.84, today ${nums[3].toFixed(2)})`);
      const junk = ['{"up":{"rudder":"lots"}}', '{"up":{"rudder":2.5}}', '{"up":{"rudder":-1}}', { up: { rudder: NaN } }, { up: Object.create({ rudder: 3 }) }].map((c) => U.playerType(stock, c));
      const clamped = U.playerType(stock, '{"up":{"rudder":99}}');
      check(junk.every((p) => p.turn === stock.turn && p.turnLow === 0.35) && clamped.turnLow === 0.8 && Math.abs(clamped.turn - 1.4 * 1.15) < 1e-9,
        'playerType with a junk rudder tier gives the stock rudder; a tier above 3 counts as tier 3');
      check(JSON.stringify(stock) === JSON.stringify({ ...SHIP_TYPES.player }) && !('turnLow' in stock), 'playerType never adds turnLow (or anything) to SHIP_TYPES.player itself');
    }

    // ---- statText('rudder', t)
    {
      const want = [[0, '35% turn when slow'], [1, '50% turn when slow'], [2, '65% turn when slow'], [3, '80% turn when slow'], [9, '80% turn when slow'], [-1, '35% turn when slow'], [NaN, '35% turn when slow'], [1.4, '50% turn when slow'], [Infinity, '35% turn when slow']];
      const bad = want.filter(([t, s]) => U.statText('rudder', t) !== s).map(([t, s]) => `${t}: "${U.statText('rudder', t)}" (want "${s}")`);
      check(bad.length === 0, `statText('rudder', t): "50% turn when slow"..., clamped to the real tiers${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    }
  }

  console.log(failures ? `\n${failures} check(s) failed` : `\nAll upgrade checks passed (${passes})`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
