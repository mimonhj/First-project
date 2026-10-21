// Unit checks for the player's settings in src/settings.js (plain Node, no browser), SPEC3 §3.2, §10.1, §13.1:
// - STEER_MODES, the defaults ({"v":1,"steer":"buttons"}), a fresh object every call
// - both modes read and written, and round trips
// - parseSettings with the garbage battery of upgrades.test.cjs (cut JSON, arrays, __proto__, constructor,
//   throwing getters and proxies, megabytes, deep nesting, wrong types, near-miss mode names), ≤ 1 KB
// - a record that needed fixing serializes differently (so main's loadRecord rewrites it)
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

// The game's modules are browser ES modules in a package without "type": "module". This one imports
// nothing, so it is loaded from its source as a data: URL (as in upgrades.test.cjs).
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

(async () => {
  const S = await load('src/settings.js');
  const DEFAULT = { v: 1, steer: 'buttons' };
  const WHEEL = { v: 1, steer: 'wheel' };
  const TEXT0 = '{"v":1,"steer":"buttons"}';
  const TEXTW = '{"v":1,"steer":"wheel"}';
  const parse = (raw) => {
    try {
      const s = S.parseSettings(raw);
      const okShape = s && Object.keys(s).join() === 'v,steer' && s.v === 1 && (s.steer === 'buttons' || s.steer === 'wheel');
      return okShape ? { s } : { error: `invalid result ${show(s)}` };
    } catch (e) {
      return { error: `threw ${e && e.message}` };
    }
  };

  // ------------------------------------------------------------------ exports and defaults
  {
    const fns = ['defaultSettings', 'parseSettings', 'serializeSettings'];
    const missing = fns.filter((k) => typeof S[k] !== 'function');
    check(missing.length === 0 && Array.isArray(S.STEER_MODES), `every §11.1 export is there (STEER_MODES, ${fns.join(', ')})${missing.length ? ' -> missing ' + missing.join(', ') : ''}`);
    check(same(S.STEER_MODES, ['buttons', 'wheel']) && Object.isFrozen(S.STEER_MODES), "STEER_MODES is ['buttons', 'wheel'] (the default first), frozen");
    const d1 = S.defaultSettings();
    const d2 = S.defaultSettings();
    d1.steer = 'wheel';
    check(same(d2, DEFAULT) && d1 !== d2 && S.serializeSettings(S.defaultSettings()) === TEXT0, `defaultSettings: ${TEXT0} (the §10.1 text): the ◀ ▶ buttons stay the default; a fresh object every call`);
  }

  // ------------------------------------------------------------------ both modes
  {
    const cases = [
      [TEXT0, DEFAULT], [TEXTW, WHEEL], [DEFAULT, DEFAULT], [WHEEL, WHEEL], [{ steer: 'wheel' }, WHEEL], [{ steer: 'buttons' }, DEFAULT],
      ['{"steer":"wheel"}', WHEEL], ['{"v":7,"steer":"wheel"}', WHEEL], ['{"v":"x","steer":"wheel"}', WHEEL], [' {"v":1,"steer":"wheel"} ', WHEEL],
    ];
    const bad = cases.filter(([raw, want]) => !same(parse(raw).s, want)).map(([raw]) => `${show(raw)} -> ${show(parse(raw).s || parse(raw).error)}`);
    check(bad.length === 0, `parseSettings reads both modes, from the stored text or a record object, whatever "v" says${bad.length ? ' -> ' + bad.join('; ') : ''}`);
    check(S.serializeSettings(WHEEL) === TEXTW && S.serializeSettings(DEFAULT) === TEXT0 && S.serializeSettings(S.parseSettings(TEXTW)) === TEXTW && S.serializeSettings({ steer: 'wheel' }) === TEXTW,
      `serializeSettings writes ${TEXT0} or ${TEXTW}, and each round trips`);
    const back = S.parseSettings(S.serializeSettings(S.parseSettings(TEXTW)));
    check(same(back, WHEEL) && back !== WHEEL, 'parse → serialize → parse keeps the wheel; parse always returns a fresh record');
  }

  // ------------------------------------------------------------------ the garbage battery
  {
    const hostile = {};
    Object.defineProperty(hostile, 'steer', { enumerable: true, get() { throw new Error('getter'); } });
    const proxy = new Proxy({}, { get() { throw new Error('proxy'); }, has() { throw new Error('proxy'); }, ownKeys() { throw new Error('proxy'); }, getOwnPropertyDescriptor() { throw new Error('proxy'); } });
    const { proxy: revoked, revoke } = Proxy.revocable({}, {});
    revoke();
    const junk = [
      null, undefined, '', ' ', 'garbage', 'garbage{', '{', '}', '{}', '[]', '[1,2,3]', 'null', 'true', 'false', '42', '"str"', '"wheel"',
      'NaN', 'Infinity', '-Infinity', '1e400', '{"steer":null}', '{"steer":[]}', '{"steer":["wheel"]}', '{"steer":{"wheel":1}}', '[{"steer":"wheel"}]',
      '{"STEER":"wheel"}', '{"Steer":"wheel"}', '{"v":1,"mode":"wheel"}', 42, -1, NaN, Infinity, true, false, [], ['wheel'], {}, () => 1, Symbol('x'), 10n,
      new Date(0), /x/, new Map([['steer', 'wheel']]), new Set(['wheel']), new String('{"steer":"wheel"}'), hostile, proxy, revoked,
      '\u0000', '\ud800', '{"steer":"wheel"', '{"v":1,"steer":"wheel"', // a broken surrogate, JSON cut short
    ];
    const bad = [];
    for (const raw of junk) {
      const r = parse(raw);
      if (r.error) bad.push(`${show(raw)}: ${r.error}`);
      else if (!same(r.s, DEFAULT)) bad.push(`${show(raw)}: ${show(r.s)}`);
    }
    check(bad.length === 0, `parseSettings: ${junk.length} kinds of junk (cut JSON, arrays, wrong types, throwing getters, proxies, a revoked proxy, a Map, a boxed string…) all give the defaults${bad.length ? ' -> ' + bad.join('; ') : ''}`);

    // steer must be exactly one of the modes: near misses, other types and prototype names are the default.
    const values = ['Wheel', 'WHEEL', ' wheel', 'wheel ', 'wheels', 'whee', 'Buttons', 'button', '', ' ', 'joystick', 'arrows', 'tap', '__proto__', 'constructor',
      'toString', 'hasOwnProperty', 'length', '0', '1', 1, 0, -0, NaN, true, false, null, ['wheel'], { toString: () => 'wheel' }, new String('wheel'), Symbol('wheel'), 1n];
    const badV = [];
    for (const v of values) {
      for (const raw of typeof v === 'symbol' || typeof v === 'bigint' || (v && typeof v === 'object') ? [{ steer: v }] : [{ steer: v }, JSON.stringify({ v: 1, steer: v })]) {
        const r = parse(raw);
        if (r.error || !same(r.s, DEFAULT)) badV.push(`${show(v)} -> ${show(r.s || r.error)}`);
      }
    }
    check(badV.length === 0, `steer is exactly 'buttons' or 'wheel', else 'buttons' (${values.length} near misses: 'Wheel', ' wheel', 'joystick', '__proto__', a boxed string, numbers…)${badV.length ? ' -> ' + badV.join('; ') : ''}`);

    // Unknown fields, prototype tricks, inherited fields.
    const extra = parse('{"v":1,"steer":"wheel","volume":11,"quality":"high","toString":1}');
    check(!extra.error && same(extra.s, WHEEL) && Object.keys(extra.s).join() === 'v,steer', `unknown fields are dropped (${show(extra.s || extra.error)})`);
    const proto = parse('{"__proto__":{"steer":"wheel"},"constructor":{"prototype":{"polluted":1}}}');
    const protoDeep = parse('{"steer":{"__proto__":"wheel"}}');
    const polluted = ({}).polluted !== undefined || Object.prototype.polluted !== undefined || ({}).steer !== undefined;
    check(!proto.error && same(proto.s, DEFAULT) && same(protoDeep.s, DEFAULT) && !polluted, `__proto__ / constructor tricks give the defaults and pollute nothing (${show(proto.s || proto.error)})`);
    const inherited = parse(Object.create({ steer: 'wheel' }));
    check(!inherited.error && same(inherited.s, DEFAULT), 'an inherited (non-own) steer is ignored');

    // Size: ≤ 1 KB; megabytes and deep nesting are refused quickly.
    const at1k = TEXTW.slice(0, -1) + ' '.repeat(1024 - TEXTW.length) + '}';
    const over = TEXTW.slice(0, -1) + ' '.repeat(1025 - TEXTW.length) + '}';
    check(at1k.length === 1024 && same(parse(at1k).s, WHEEL) && over.length === 1025 && same(parse(over).s, DEFAULT),
      'a record of exactly 1 KB (1024 characters) is read; 1025 characters are refused (the defaults)');
    const times = [];
    const huge = [
      ['2 MB of garbage', 'x'.repeat(2e6)],
      ['a 1 MB record', JSON.stringify({ v: 1, steer: 'wheel', pad: 'a'.repeat(1e6) })],
      ['a 1 MB mode', `{"steer":"${'w'.repeat(1e6)}"}`],
      ['100k nested arrays', '['.repeat(1e5) + ']'.repeat(1e5)],
      ['500 nested arrays (inside 1 KB)', '['.repeat(500) + ']'.repeat(500)],
      ['a deep object around the record', '{"steer":'.repeat(100) + '"wheel"' + '}'.repeat(100)],
      ['a megabyte mode in an object', { steer: 'wheel'.repeat(2e5) }],
    ];
    const badH = [];
    for (const [name, raw] of huge) {
      const t0 = process.hrtime.bigint();
      const r = parse(raw);
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
      if (r.error) badH.push(`${name}: ${r.error}`);
      else if (!same(r.s, DEFAULT)) badH.push(`${name}: ${show(r.s)}`);
    }
    check(badH.length === 0 && Math.max(...times) < 1000, `megabytes and deep nesting give the defaults quickly (slowest ${Math.max(...times).toFixed(1)} ms)${badH.length ? ' -> ' + badH.join('; ') : ''}`);

    // A record that needed fixing is rewritten (main's loadRecord); serialize validates; junk writes the defaults.
    const rewrite = ['{"steer":"wheel"}', '{"v":1,"steer":"Wheel"}', '{"v":1,"steer":"wheel","x":1}', '{"steer":"wheel","v":1}', ' ' + TEXT0, '{"v":2,"steer":"buttons"}'];
    check(rewrite.every((raw) => S.serializeSettings(S.parseSettings(raw)) !== raw) && S.serializeSettings(S.parseSettings(TEXT0)) === TEXT0 && S.serializeSettings(S.parseSettings(TEXTW)) === TEXTW,
      'a stored record that needed fixing (no "v", another order, a near-miss mode, extra fields) serializes differently, so loadRecord rewrites it; the two canonical texts are left alone');
    let text;
    let threw = '';
    try {
      text = [S.serializeSettings({ steer: 'wheel', volume: 11, v: 9 }), ...[null, undefined, 'garbage', 42, Symbol('x'), hostile, proxy, revoked, { steer: 'helm' }].map((v) => S.serializeSettings(v))];
    } catch (e) {
      threw = e.message;
    }
    check(!threw && text[0] === TEXTW && text.slice(1).every((t) => t === TEXT0), `serializeSettings validates before writing; junk writes the defaults${threw ? ' -> ' + threw : ''}`);
  }

  // ------------------------------------------------------------------ junk in every argument
  {
    const proxy = new Proxy({}, { get() { throw new Error('proxy'); }, getOwnPropertyDescriptor() { throw new Error('proxy'); } });
    const junk = [undefined, null, NaN, Infinity, -1, 0, '', 'wheel', TEXTW, true, [], {}, () => 1, Symbol('x'), 10n, proxy];
    const problems = [];
    for (const j of junk) {
      try {
        const d = S.defaultSettings(j);
        const p = S.parseSettings(j, j);
        const t = S.serializeSettings(j, j);
        if (!same(d, DEFAULT) || !(p && (p.steer === 'buttons' || p.steer === 'wheel')) || !(t === TEXT0 || t === TEXTW)) problems.push(`${show(j)}: ${show(p)} ${t}`);
      } catch (e) {
        problems.push(`${show(j)}: threw ${e && e.message}`);
      }
    }
    check(problems.length === 0, `${junk.length} kinds of junk in every argument of every function: no throws, well-formed results${problems.length ? ' -> ' + problems.join('; ') : ''}`);
  }

  console.log(failures ? `\n${failures} check(s) failed` : `\nAll settings checks passed (${passes})`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
