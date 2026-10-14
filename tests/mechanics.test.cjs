// Unit checks for the Act II level mechanics in src/mechanics.js and the Act II level definitions in
// src/act2.js (plain Node, no browser), SPEC2 §6.3–6.6, §11.1. The hooks run against a mock of the
// ctx main.js hands them, with the real ship types from src/shipTypes.js:
// - the API: exact exports, the null object (no ids, unknown ids, junk ctx and junk ships never throw)
// - convoy: convoy starts, the far gate, cruise and flee speeds, the zig-zag (away from you first,
//   switching every 4 s), the hold-fire rule, escapes at the gate (once, banner, announce), objective /
//   summary / bonus strings, the minimap, wave 0 picked up by init(), a level without gates
// - floes: a crunch is 6 damage, once per 1.5 s per ship, only above speed 6, only on ice, floes moved
//   in place are followed
// - current: the drift formula at d 20, 40, 74, 76 (zero outside r) and its swirl direction, eye
//   damage 5 hp/s, ghosts ignored, the eye banner once, avoid() and minimap circles, the Phantom rising
//   18 u from the centre in open water facing you
// - act2.js: the three levels exactly as §6.4–6.6, every ship type and mechanic id known, and the
//   act slots into levels.js behind ?act2=1
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

// The game's modules are browser ES modules in a package without "type": "module". mechanics.js and
// shipTypes.js import nothing, so they are loaded from their source as data: URLs (as in
// upgrades.test.cjs). act2.js and levels.js import the env modules (three.js): those imports are
// swapped for stand-ins first, which is all a data test of the level tables needs.
function dataUrl(src) {
  return 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');
}
async function load(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (/^\s*import\s[^(]/m.test(src)) throw new Error(`${rel} has imports now; load it another way`);
  return import(dataUrl(src));
}

const near = (a, b, eps = 1e-9) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= eps;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const f3 = (v) => (typeof v === 'number' ? v.toFixed(3) : String(v));
const wrap = (a) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};
const DT = 1 / 120; // main's simulation substep

(async () => {
  const M = await load('src/mechanics.js');
  const { SHIP_TYPES } = await load('src/shipTypes.js');
  const { createMechanics, MECHANIC_IDS } = M;

  // ---------------------------------------------------------------- a mock of main's ctx
  // relative() exactly as main.js: distance along the bow and to starboard (lat > 0).
  function relative(ship, tx, tz) {
    const dx = tx - ship.x;
    const dz = tz - ship.z;
    return {
      along: dx * Math.sin(ship.h) + dz * Math.cos(ship.h),
      lat: dx * -Math.cos(ship.h) + dz * Math.sin(ship.h),
      dist: Math.hypot(dx, dz),
    };
  }
  function ship(typeName, x, z, h = 0, extra = {}) {
    const type = SHIP_TYPES[typeName];
    return {
      kind: typeName === 'player' ? 'player' : 'enemy',
      typeName,
      type,
      x,
      z,
      h,
      speed: 0,
      hp: type.hp,
      maxHp: type.hp,
      sinking: 0,
      ...extra,
    };
  }
  function mock({ env = {}, player = null, enemies = [], def = {}, types, extra = {} } = {}) {
    const log = { damage: [], escape: [], pop: [], banner: [], announce: [], sfx: [] };
    const ctx = {
      env: () => env,
      player: () => player,
      enemies,
      fighting: (e) => e.hp > 0 && !e.captured && !e.escaped && !e.surrendered,
      relative,
      damage: (s, amount, x, z, source) => {
        log.damage.push({ s, amount, x, z, source });
        s.hp -= amount;
      },
      escape: (e) => {
        log.escape.push(e);
        e.escaped = true;
      },
      pop: (text, x, y, z, style) => log.pop.push({ text, x, y, z, style }),
      showBanner: (html, seconds) => log.banner.push({ html, seconds }),
      announce: (text) => log.announce.push(text),
      sfx: (name, x, z) => log.sfx.push({ name, x, z }),
      rng: () => 0.5,
      time: () => 0,
      def,
      ...(types ? { types } : {}),
      ...extra,
    };
    return { ctx, log };
  }
  const L4_WAVES = [['galleon', 'cutter', 'cutter'], ['galleon', 'privateer', 'corsair']];

  // ---------------------------------------------------------------- API and the null object
  {
    check(same(MECHANIC_IDS, ['convoy', 'floes', 'current']), `MECHANIC_IDS is ['convoy', 'floes', 'current'] (${JSON.stringify(MECHANIC_IDS)})`);
    check(same(Object.keys(M).sort(), ['MECHANIC_IDS', 'createMechanics']), `exports exactly MECHANIC_IDS and createMechanics (${Object.keys(M)})`);
    const API = ['init', 'onSpawn', 'onCapture', 'onSink', 'onRemove', 'step', 'steer', 'holdFire', 'drift', 'avoid', 'objective', 'minimap', 'summary', 'bonus', 'dispose'];
    const m = createMechanics(MECHANIC_IDS, mock().ctx);
    const missing = API.filter((k) => typeof m[k] !== 'function');
    const desc = Object.getOwnPropertyDescriptor(m, 'state');
    check(missing.length === 0 && !!desc && typeof desc.get === 'function', `createMechanics returns every hook of §6.3 and a state getter${missing.length ? ' -> missing ' + missing : ''}`);

    const p = ship('player', 0, 0);
    const e = ship('cutter', 30, 0);
    const nul = createMechanics([], mock({ player: p, enemies: [e] }).ctx);
    nul.init();
    nul.onSpawn(e, 0);
    nul.step(DT);
    const out = {
      steer: nul.steer(e, DT),
      holdFire: nul.holdFire(e),
      drift: nul.drift(e),
      avoid: nul.avoid(),
      objective: nul.objective(),
      minimap: nul.minimap(),
      summary: nul.summary(),
      bonus: nul.bonus(),
    };
    check(
      same(out, { steer: null, holdFire: false, drift: null, avoid: [], objective: null, minimap: [], summary: [], bonus: 0 }) && e.x === 30 && e.z === 0,
      `no mechanics (Act I): every hook is a no-op (${JSON.stringify(out)})`
    );
    check(same(nul.state, { ids: [], time: DT }), `no mechanics: state is { ids: [], time } (${JSON.stringify(nul.state)})`);

    const ids = createMechanics(['convoy', 'convoy', 'nope', 5, null, 'current', '__proto__', 'toString'], mock().ctx).state.ids;
    check(same(ids, ['convoy', 'current']), `unknown, junk and repeated ids are ignored (${JSON.stringify(ids)})`);
    let threw = '';
    for (const junkIds of [undefined, null, 5, 'convoy', {}, { 0: 'convoy', length: 1 }]) {
      try {
        const j = createMechanics(junkIds, mock().ctx);
        if (j.state.ids.length) threw += ` ${String(junkIds)} gave ${j.state.ids}`;
      } catch (err) {
        threw += ` ${String(junkIds)}: ${err.message}`;
      }
    }
    check(threw === '', `ids that are not an array give no mechanics and never throw${threw}`);

    // Junk ctx and junk ships: every hook survives.
    const junkCtx = [
      undefined,
      null,
      5,
      'ctx',
      {},
      { env: 5, player: 'x', enemies: 7, fighting: 1, relative: 'r', damage: null },
      { env: () => null, player: () => null, enemies: null },
      { env: () => ({ reefs: 'x', escapes: 7, convoyStarts: {}, current: 5, colliders: 'c' }), player: () => ({}) },
      { env: () => ({ reefs: [null, 5, { ice: true }], escapes: [null, { x: 'a' }], convoyStarts: [null], current: { x: 'a', r: -5, eye: NaN } }) },
      { env: () => ({}), player: () => ship('player', 0, 0), enemies: [null, 5, {}, ship('galleon', 1, 1)], def: { waves: 'x' } },
      { def: { waves: [null, 5, ['galleon', 7, null]] }, relative: () => null, fighting: () => true },
    ];
    const junkShips = [undefined, null, 0, 'ship', {}, { x: NaN, z: 0 }, { x: 1, z: 1, type: null }, { x: 1, z: 1, hp: 'x', type: { merchant: true } }, ship('galleon', 1, 2), ship('phantom', 3, 4)];
    const bad = [];
    junkCtx.forEach((jc, i) => {
      try {
        const j = createMechanics(MECHANIC_IDS, jc);
        j.init();
        for (const s of junkShips) {
          j.onSpawn(s, 0);
          j.onSpawn(s, 'x');
          j.steer(s, DT);
          j.steer(s, NaN);
          j.holdFire(s);
          j.drift(s);
          j.onCapture(s);
          j.onSink(s);
          j.onRemove(s);
        }
        j.step(DT);
        j.step(NaN);
        j.step(-1);
        j.step(Infinity);
        j.avoid();
        j.objective();
        j.minimap();
        j.summary();
        const b = j.bonus();
        const st = JSON.stringify(j.state);
        if (!Number.isFinite(b) || typeof st !== 'string') bad.push(`ctx ${i}: bonus ${b}`);
        j.dispose();
        j.dispose();
      } catch (err) {
        bad.push(`ctx ${i}: ${err.message}`);
      }
    });
    check(bad.length === 0, `junk ctx (${junkCtx.length} kinds) and junk ships (${junkShips.length} kinds) never throw; bonus stays finite${bad.length ? ' -> ' + bad.join('; ') : ''}`);
  }

  // ---------------------------------------------------------------- convoy (Doubloon Bay)
  const bayEnv = () => ({
    worldRadius: 150,
    playerStart: { x: 0, z: 30, h: Math.PI },
    colliders: [],
    reefs: [],
    escapes: [
      { x: -55, z: -112, r: 10 },
      { x: 55, z: -112, r: 10 },
    ],
    convoyStarts: [
      { x: -30, z: 118, h: Math.PI },
      { x: 10, z: 122, h: Math.PI * 0.9 },
      { x: 45, z: 112, h: -Math.PI * 0.9 },
    ],
  });
  {
    // Starts and gates.
    const env = bayEnv();
    const p = ship('player', 40, 20, Math.PI);
    const g1 = ship('galleon', -60, 80);
    const g2 = ship('galleon', -60, 80);
    const enemies = [g1];
    const { ctx } = mock({ env, player: p, enemies, def: { waves: L4_WAVES } });
    const m = createMechanics(['convoy'], ctx);
    m.onSpawn(g1, 0);
    m.init();
    check(g1.x === -30 && g1.z === 118 && near(wrap(g1.h - Math.PI), 0), `a wave's galleon moves to the nearest convoy start, with its heading (${g1.x}, ${g1.z}, h ${f3(g1.h)})`);
    let st = m.state.convoy;
    check(st.runners.length === 1 && st.runners[0].gate === 0, `she runs for the gate farthest from the player: player at (40, 20) → gate 0 at (-55, -112) (gate ${st.runners[0]?.gate})`);
    enemies.push(g2);
    g1.x = 0; // she has sailed off: her start is clear, but it has been used
    g1.z = 0;
    m.onSpawn(g2, 1);
    check(g2.x === 10 && g2.z === 122 && near(wrap(g2.h - Math.PI * 0.9), 0), `the next galleon takes the nearest UNUSED start (${g2.x}, ${g2.z})`);
    p.x = -40;
    const g3 = ship('galleon', 0, 0);
    enemies.push(g3);
    m.onSpawn(g3, 1);
    st = m.state.convoy;
    check(st.runners[2].gate === 1 && g3.x === 45 && g3.z === 112, `with the player at (-40, 20) the far gate is gate 1 (gate ${st.runners[2].gate}, start ${g3.x}, ${g3.z})`);
    check(st.runners[0].gate === 0, 'a galleon keeps the gate it picked when it set out');
    const g4 = ship('galleon', 7, 9, 0.3);
    enemies.push(g4);
    m.onSpawn(g4, -1);
    m.onSpawn(g4, 1); // a second call for the same ship changes nothing
    check(g4.x === 7 && g4.z === 9 && g4.h === 0.3, `a test spawn (waveIndex -1, G.spawn) keeps its position and heading; onSpawn is idempotent (${g4.x}, ${g4.z}, ${g4.h})`);
    check(m.state.convoy.runners.length === 4, 'every galleon is registered once');
    check(JSON.stringify(JSON.parse(JSON.stringify(m.state))) === JSON.stringify(m.state), 'state is a plain JSON-able snapshot');

    // The player parked on the nearest start: the galleon goes to another one.
    const env2 = bayEnv();
    const p2 = ship('player', -30, 112);
    const g5 = ship('galleon', -40, 110);
    const m2 = createMechanics(['convoy'], mock({ env: env2, player: p2, enemies: [g5], def: { waves: L4_WAVES } }).ctx);
    m2.onSpawn(g5, 0);
    check(Math.hypot(g5.x - p2.x, g5.z - p2.z) >= 35, `a convoy start under the player's guns is skipped (start ${g5.x}, ${g5.z})`);
  }
  {
    // Cruise, flee and the zig-zag.
    const env = bayEnv();
    const g = ship('galleon', 0, 0, 0);
    const p = ship('player', 0, 0, 0);
    const { ctx } = mock({ env, player: p, enemies: [g], def: { waves: L4_WAVES } });
    const m = createMechanics(['convoy'], ctx);
    m.onSpawn(g, -1); // stays at (0, 0); the far gate from (0, 0) is gate 0 (first of two at equal distance)
    const gate = m.state.convoy.runners[0];
    const toGate = Math.atan2(gate.gateX - g.x, gate.gateZ - g.z);
    g.h = toGate;
    p.x = 50;
    p.z = 50;
    let s = m.steer(g, DT);
    check(!!s && near(s.speed, 4.55) && near(s.h, wrap(toGate)), `nobody near: she cruises for her gate at 0.7 × 6.5 = 4.55 (speed ${f3(s?.speed)}, h ${f3(s?.h)} vs ${f3(toGate)})`);
    // The player 30 u off her starboard beam.
    const rx = -Math.cos(g.h);
    const rz = Math.sin(g.h);
    p.x = g.x + rx * 30;
    p.z = g.z + rz * 30;
    s = m.steer(g, DT);
    const awayDot = (h) => Math.sin(h) * rx + Math.cos(h) * rz; // how much heading h closes on the player
    check(!!s && near(s.speed, 6.5), `the player within 35 u: full speed 6.5 (${f3(s?.speed)})`);
    check(near(Math.abs(wrap(s.h - toGate)), 0.4, 1e-9), `fleeing she zig-zags ±0.4 rad off her gate's bearing (${f3(wrap(s.h - toGate))})`);
    check(awayDot(s.h) < awayDot(toGate), 'the first zig turns away from a player on her starboard side');
    // Zig-zag period: the offset flips every 4 s of simulated time.
    const flips = [];
    let last = Math.sign(wrap(s.h - toGate));
    let t = 0;
    let steady = true;
    for (let i = 0; i < 13 * 120; i++) {
      t += DT;
      const r = m.steer(g, DT);
      const off = wrap(r.h - toGate);
      if (!near(Math.abs(off), 0.4, 1e-9) || !near(r.speed, 6.5)) steady = false;
      if (Math.sign(off) !== last) {
        flips.push(t);
        last = Math.sign(off);
      }
    }
    check(
      steady && flips.length === 3 && flips.every((ft, i) => Math.abs(ft - 4 * (i + 1)) <= DT + 1e-9),
      `the zig-zag switches every 4 s (flips at ${flips.map(f3).join(', ')} s)`
    );
    // A player on her port side: the first zig turns the other way, still away.
    const g2 = ship('galleon', 0, 0, toGate);
    const m2 = createMechanics(['convoy'], mock({ env, player: p, enemies: [g2] }).ctx);
    m2.onSpawn(g2, -1);
    p.x = g2.x - rx * 25;
    p.z = g2.z - rz * 25;
    const s2 = m2.steer(g2, DT);
    check(awayDot(s2.h) > awayDot(toGate) && near(s2.speed, 6.5), 'the first zig turns away from a player on her port side too');
    // The player drops back beyond 35 u: cruising again, straight for the gate.
    p.x = g.x + rx * 36;
    p.z = g.z + rz * 36;
    s = m.steer(g, DT);
    check(near(s.speed, 4.55) && near(s.h, wrap(toGate)), `outside 35 u she cruises straight for the gate again (speed ${f3(s.speed)})`);
    p.x = g.x + rx * 34.9;
    p.z = g.z + rz * 34.9;
    const again = m.steer(g, DT);
    check(near(again.speed, 6.5) && awayDot(again.h) < awayDot(toGate), 'at 34.9 u she runs at full speed again, the new chase starting with a zig away from you');
    p.hp = 0;
    check(near(m.steer(g, DT).speed, 4.55), 'a sunk player chases nobody: she cruises');
    p.hp = 100;

    // Only fighting galleons are steered; other ships keep main's AI.
    const cutter = ship('cutter', 5, 5);
    check(m.steer(cutter, DT) === null, 'steer() leaves non-merchants to main (null)');
    g.surrendered = true;
    const sur = m.steer(g, DT);
    g.surrendered = false;
    g.captured = true;
    const cap = m.steer(g, DT);
    g.captured = false;
    check(sur === null && cap === null, 'steer() leaves surrendered and captured galleons to main (null)');
  }
  {
    // Hold fire: a galleon fires only at a player abeam within 18 u.
    const g = ship('galleon', 0, 0, 0.7);
    const p = ship('player', 0, 0);
    const m = createMechanics(['convoy'], mock({ env: bayEnv(), player: p, enemies: [g] }).ctx);
    m.onSpawn(g, -1);
    const at = (along, lat) => {
      p.x = g.x + Math.sin(g.h) * along - Math.cos(g.h) * lat;
      p.z = g.z + Math.cos(g.h) * along + Math.sin(g.h) * lat;
      return m.holdFire(g);
    };
    const cases = [
      [0, 15, false, 'abeam to starboard at 15 u'],
      [0, -15, false, 'abeam to port at 15 u'],
      [0, 17.99, false, 'abeam at 17.99 u'],
      [0, 18.2, true, 'abeam at 18.2 u (out of reach)'],
      [5, 12, false, '|along| 5 < 0.45 × 12 = 5.4'],
      [-5, -12, false, 'astern-ish quarter |along| 5 < 5.4'],
      [6, 12, true, '|along| 6 ≥ 5.4: not abeam'],
      [5.7, 12, true, '|along| 5.7 ≥ 5.4: not abeam'],
      [5.3, -12, false, '|along| 5.3 < 5.4 to port'],
      [10, 0, true, 'dead ahead'],
      [-10, 1, true, 'dead astern'],
    ];
    const wrong = cases.filter(([a, l, want]) => at(a, l) !== want).map(([, , , what]) => what);
    check(wrong.length === 0, `holdFire: a galleon fires only at a player abeam (|along| < |lat| × 0.45) within 18 u (${cases.length} cases)${wrong.length ? ' -> wrong: ' + wrong.join('; ') : ''}`);
    at(0, 10);
    p.hp = 0;
    const deadHold = m.holdFire(g);
    p.hp = 100;
    const cutter = ship('cutter', 0, 10);
    check(deadHold === true && m.holdFire(cutter) === false, 'no target when the player is sunk; other ships never held by the convoy');
  }
  {
    // Escapes at the gate.
    const env = bayEnv();
    const p = ship('player', 60, 40);
    const g = ship('galleon', 0, 0);
    const enemies = [g];
    const { ctx, log } = mock({ env, player: p, enemies, def: { waves: L4_WAVES } });
    const m = createMechanics(['convoy'], ctx);
    m.onSpawn(g, -1);
    const gi = m.state.convoy.runners[0].gate;
    const own = env.escapes[gi];
    const other = env.escapes[1 - gi];
    g.x = other.x;
    g.z = other.z;
    m.step(DT);
    check(log.escape.length === 0, 'sailing through the other gate is not an escape');
    g.x = own.x + 10.1;
    g.z = own.z;
    m.step(DT);
    check(log.escape.length === 0, 'just outside her gate (r 10 + 0.1): not yet');
    g.surrendered = true;
    g.x = own.x + 3;
    m.step(DT);
    check(log.escape.length === 0, 'a surrendered galleon drifting into the gate does not escape');
    g.surrendered = false;
    g.x = own.x + 9.9;
    m.step(DT);
    m.step(DT);
    check(log.escape.length === 1 && log.escape[0] === g && g.escaped === true, `a fighting galleon inside her gate escapes, once (${log.escape.length} escape calls)`);
    check(log.banner.some((b) => b.html === 'The galleon escaped with its gold!'), `banner "The galleon escaped with its gold!" (${JSON.stringify(log.banner.map((b) => b.html))})`);
    check(log.announce.length === 1 && /escaped/.test(log.announce[0]), `the escape is announced for screen readers (${JSON.stringify(log.announce)})`);
    check(m.state.convoy.escaped === 1, 'escaped counts 1');
  }
  {
    // Objective, summary and bonus over a whole Doubloon Bay.
    const env = bayEnv();
    const p = ship('player', 0, 30);
    const enemies = [];
    const { ctx } = mock({ env, player: p, enemies, def: { waves: L4_WAVES } });
    const m = createMechanics(['convoy'], ctx);
    check(m.objective() === 'Galleons: 0 taken · 0 escaped · 2 to go', `before wave 0, both galleons are to go (${m.objective()})`);
    const wave0 = L4_WAVES[0].map((t, i) => ship(t, -60 + i * 20, 80));
    enemies.push(...wave0);
    m.init(); // wave 0 was spawned before the mechanics existed
    const [g1] = wave0;
    check(g1.x === -30 && g1.z === 118, `init() picks up wave 0 spawned before the mechanics existed (galleon at ${g1.x}, ${g1.z})`);
    for (const e of wave0) m.onSpawn(e, 0);
    check(m.state.convoy.runners.length === 1 && g1.x === -30, 'init() + onSpawn for the same wave register each ship once');
    check(m.objective() === 'Galleons: 0 taken · 0 escaped · 2 to go', `wave 0 out: "Galleons: 0 taken · 0 escaped · 2 to go" (${m.objective()})`);
    g1.captured = true;
    m.onCapture(g1);
    m.onCapture(g1);
    m.onCapture(wave0[1]); // a cutter: not a galleon
    check(m.objective() === 'Galleons: 1 taken · 0 escaped · 1 to go', `one captured: "Galleons: 1 taken · 0 escaped · 1 to go" (${m.objective()})`);
    check(m.bonus() === 150, `bonus 150 × taken = 150 (${m.bonus()})`);
    m.onRemove(g1);
    check(m.objective() === 'Galleons: 1 taken · 0 escaped · 1 to go', 'removing the captured galleon changes nothing');
    const wave1 = L4_WAVES[1].map((t, i) => ship(t, 30 + i * 20, 90));
    enemies.push(...wave1);
    for (const e of wave1) m.onSpawn(e, 1);
    check(m.objective() === 'Galleons: 1 taken · 0 escaped · 1 to go', `wave 1 out: still 1 to go (${m.objective()})`);
    const g2 = wave1[0];
    const r2 = m.state.convoy.runners.find((r) => r.index === enemies.indexOf(g2));
    g2.x = r2.gateX;
    g2.z = r2.gateZ;
    m.step(DT);
    check(m.objective() === 'Galleons: 1 taken · 1 escaped · 0 to go', `the second escapes: "Galleons: 1 taken · 1 escaped · 0 to go" (${m.objective()})`);
    check(same(m.summary(), ['Galleons taken: 1 of 2']), `summary ["Galleons taken: 1 of 2"] (${JSON.stringify(m.summary())})`);
    check(m.bonus() === 150, 'an escaped galleon pays nothing: bonus still 150');
    const st = m.state.convoy;
    check(st.total === 2 && st.taken === 1 && st.escaped === 1 && st.toGo === 0 && st.unspawned === 0, `state.convoy counts (${JSON.stringify({ total: st.total, taken: st.taken, escaped: st.escaped, toGo: st.toGo })})`);

    // Sinking one is neither taken nor escaped, but she is no longer to go.
    const enemies2 = [];
    const m2 = createMechanics(['convoy'], mock({ env: bayEnv(), player: p, enemies: enemies2, def: { waves: L4_WAVES } }).ctx);
    const s1 = ship('galleon', 0, 0);
    enemies2.push(s1);
    m2.onSpawn(s1, 0);
    s1.hp = 0;
    m2.onSink(s1);
    m2.onSink(s1);
    check(m2.objective() === 'Galleons: 0 taken · 0 escaped · 1 to go' && same(m2.summary(), ['Galleons taken: 0 of 2']) && m2.bonus() === 0, `a sunk galleon: "${m2.objective()}", ${JSON.stringify(m2.summary())}, bonus ${m2.bonus()}`);

    // Two captured → 300.
    const m3 = createMechanics(['convoy'], mock({ env: bayEnv(), player: p, enemies: [], def: { waves: L4_WAVES } }).ctx);
    const a = ship('galleon', 0, 0);
    const b = ship('galleon', 9, 9);
    m3.onSpawn(a, 0);
    m3.onSpawn(b, 1);
    m3.onCapture(a);
    m3.onCapture(b);
    check(m3.bonus() === 300 && m3.objective() === 'Galleons: 2 taken · 0 escaped · 0 to go' && same(m3.summary(), ['Galleons taken: 2 of 2']), `both taken: bonus 300, "${m3.objective()}"`);

    // A level whose waves hold no galleon: no objective.
    const m4 = createMechanics(['convoy'], mock({ env: bayEnv(), player: p, enemies: [], def: { waves: [['cutter'], ['corsair']] } }).ctx);
    check(m4.objective() === null && same(m4.summary(), []) && m4.bonus() === 0, 'no galleons in the waves: no objective, no summary line, no bonus');

    // ctx.types (SHIP_TYPES) decides which wave names are merchants when main passes it.
    const types = { ...SHIP_TYPES, cutter: { ...SHIP_TYPES.cutter, merchant: true } };
    const m5 = createMechanics(['convoy'], mock({ env: bayEnv(), player: p, enemies: [], def: { waves: L4_WAVES }, types }).ctx);
    check(m5.objective() === 'Galleons: 0 taken · 0 escaped · 4 to go', `with ctx.types the merchant flag counts the planned galleons (${m5.objective()})`);
  }
  {
    // Minimap and a level without gates or starts (the Stage 0 stub sea).
    const env = bayEnv();
    const p = ship('player', 0, 30);
    const g = ship('galleon', 20, 60);
    const m = createMechanics(['convoy'], mock({ env, player: p, enemies: [g] }).ctx);
    m.onSpawn(g, 0);
    let mm = m.minimap();
    const gates = mm.filter((o) => o.kind === 'gate');
    const gal = mm.filter((o) => o.kind === 'galleon');
    check(
      gates.length === 2 && gates.every((o, i) => o.x === env.escapes[i].x && o.z === env.escapes[i].z && o.r === 10) && gal.length === 1 && gal[0].x === g.x && gal[0].z === g.z,
      `minimap: both gates (r 10) and the galleon (${JSON.stringify(mm)})`
    );
    g.escaped = true;
    mm = m.minimap();
    check(mm.filter((o) => o.kind === 'galleon').length === 0, 'an escaped galleon leaves the minimap');

    const stub = { worldRadius: 150, playerStart: { x: 0, z: 0, h: 0 }, colliders: [], reefs: [], escapes: [], convoyStarts: [] };
    const q = ship('player', 0, 0);
    const h = ship('galleon', 30, 40);
    const ms = createMechanics(['convoy'], mock({ env: stub, player: q, enemies: [h], def: { waves: L4_WAVES } }).ctx);
    ms.init();
    const run = ms.state.convoy.runners[0];
    const d = Math.hypot(run.gateX, run.gateZ);
    const away = (run.gateX * 30 + run.gateZ * 40) / (d * 50);
    check(h.x === 30 && h.z === 40 && near(d, 125) && near(away, 1), `no gates or starts in the env: she stays put and runs for the world edge (125 u out) straight away from you (gate ${f3(run.gateX)}, ${f3(run.gateZ)})`);
    const s = ms.steer(h, DT);
    check(!!s && near(s.h, Math.atan2(run.gateX - h.x, run.gateZ - h.z)), 'and steers for it');
    const edge = ms.minimap().filter((o) => o.kind === 'gate');
    check(edge.length === 1 && near(edge[0].x, run.gateX) && edge[0].r === 10, `the edge gate (r 10) shows on the minimap while she runs for it (${JSON.stringify(edge)})`);
    h.x = run.gateX;
    h.z = run.gateZ;
    ms.step(DT);
    check(ms.state.convoy.escaped === 1 && ms.minimap().length === 0, 'reaching it is an escape; then nothing is left to show');
  }

  // ---------------------------------------------------------------- floes (Frostbite Straits)
  {
    const floe = { x: 0, z: 0, r: 4, ice: true };
    const reef = { x: 40, z: 0, r: 6 };
    const env = { worldRadius: 140, reefs: [floe, reef], colliders: [] };
    const p = ship('player', 1, 0, 0, { speed: 7 });
    const e = ship('raider', 60, 0, 0, { speed: 7 });
    const enemies = [e];
    const { ctx, log } = mock({ env, player: p, enemies });
    const m = createMechanics(['floes'], ctx);
    m.init();
    m.step(DT);
    const d0 = log.damage[0];
    check(log.damage.length === 1 && d0.s === p && d0.amount === 6 && d0.source === 'ice', `a fast hull in a floe takes 6 damage, source 'ice' (${JSON.stringify(log.damage.map((d) => [d.amount, d.source]))})`);
    check(log.pop.length === 1 && log.pop[0].text === 'CRUNCH!' && log.pop[0].style === 'bad' && log.sfx.length === 1 && log.sfx[0].name === 'crunch', `pop "CRUNCH!" (style 'bad' on the player) and sfx 'crunch' (${JSON.stringify(log.pop.map((q) => q.text + '/' + q.style))}, ${log.sfx.map((q) => q.name)})`);
    // Held in the floe at speed 7: once per 1.5 s.
    const times = [DT];
    let t = DT;
    for (let i = 0; i < 4.4 * 120; i++) {
      t += DT;
      const before = log.damage.length;
      m.step(DT);
      if (log.damage.length > before) times.push(t);
    }
    const gaps = times.slice(1).map((v, i) => v - times[i]);
    check(times.length === 3 && gaps.every((g) => g >= 1.5 - 1e-9 && g <= 1.5 + DT + 1e-9), `grinding through ice: one crunch per 1.5 s (at ${times.map(f3).join(', ')} s)`);
    // Speed 6 exactly: no crunch; 6.01: crunch.
    const { ctx: c2, log: l2 } = mock({ env, player: ship('player', 0, 1, 0, { speed: 6 }), enemies: [] });
    const m2 = createMechanics(['floes'], c2);
    for (let i = 0; i < 240; i++) m2.step(DT);
    const { ctx: c3, log: l3 } = mock({ env, player: ship('player', 0, 1, 0, { speed: 6.01 }), enemies: [] });
    const m3 = createMechanics(['floes'], c3);
    m3.step(DT);
    check(l2.damage.length === 0 && l3.damage.length === 1, `only above speed 6: at 6.0 no crunch (${l2.damage.length}), at 6.01 a crunch (${l3.damage.length})`);
    // A normal reef never crunches; outside the floe nothing happens.
    const { ctx: c4, log: l4 } = mock({ env, player: ship('player', 40, 1, 0, { speed: 9 }), enemies: [ship('cutter', 4.5, 0, 0, { speed: 9 })] });
    const m4 = createMechanics(['floes'], c4);
    for (let i = 0; i < 240; i++) m4.step(DT);
    check(l4.damage.length === 0, 'a normal reef or a hull just outside the floe (r 4, at 4.5) never crunches');
    // Each ship has its own cooldown; enemies get the 'dmg' pop style.
    const { ctx: c5, log: l5 } = mock({ env, player: ship('player', 1, 1, 0, { speed: 8 }), enemies: [ship('raider', -1, -1, 0, { speed: 8 }), ship('cutter', 0, 2, 0, { speed: 8 })] });
    const m5 = createMechanics(['floes'], c5);
    m5.step(DT);
    check(l5.damage.length === 3 && l5.pop.filter((q) => q.style === 'dmg').length === 2, `every ship crunches on its own cooldown (${l5.damage.length} crunches, enemy pops 'dmg')`);
    // Floes moved in place by env.step are followed.
    const env6 = { reefs: [{ x: 0, z: 0, r: 4, ice: true }] };
    const s6 = ship('cutter', 30, 0, 0, { speed: 8 });
    const { ctx: c6, log: l6 } = mock({ env: env6, player: null, enemies: [s6] });
    const m6 = createMechanics(['floes'], c6);
    m6.init();
    m6.step(DT);
    env6.reefs[0].x = 29;
    m6.step(DT);
    check(l6.damage.length === 1 && m6.minimap()[0].x === 29, 'a floe moved in place (env.step) crunches where it is now, and the minimap follows it');
    env6.reefs.push({ x: 90, z: 0, r: 3, ice: true }, { x: -90, z: 0, r: 3 });
    const s6b = ship('raider', 90, 1, 0, { speed: 9 });
    c6.enemies.push(s6b);
    m6.step(DT);
    check(l6.damage.length === 2 && l6.damage[1].s === s6b && m6.minimap().length === 2, 'a floe added to env.reefs later is found too');
    // Captured, escaped and sinking ships are left alone.
    const gone = [ship('cutter', 0, 0, 0, { speed: 8, captured: true }), ship('cutter', 0, 1, 0, { speed: 8, escaped: true }), ship('cutter', 1, 0, 0, { speed: 8, sinking: 0.5, hp: 0 })];
    const { ctx: c7, log: l7 } = mock({ env, player: null, enemies: gone });
    const m7 = createMechanics(['floes'], c7);
    m7.step(DT);
    check(l7.damage.length === 0, 'captured, escaped and sinking ships never crunch');
    const mm = m.minimap();
    check(same(mm, [{ kind: 'floe', x: 0, z: 0, r: 4 }]), `minimap: the ice floes only (${JSON.stringify(mm)})`);
    check(m.state.floes.count === 1 && m.state.floes.crunches === 3, `state.floes counts floes and crunches (${JSON.stringify(m.state.floes)})`);
    check(m.objective() === null && m.bonus() === 0 && same(m.summary(), []) && same(m.avoid(), []) && m.drift(p) === null, 'floes add no objective, bonus, summary, avoid circles or drift');
  }

  // ---------------------------------------------------------------- current (The Maelstrom)
  const stormEnv = (cx = 0, cz = 0) => ({
    worldRadius: 140,
    playerStart: { x: 0, z: 95, h: Math.PI },
    colliders: [],
    reefs: [],
    current: { x: cx, z: cz, r: 75, pull: 3.2, swirl: 2.8, eye: 12, eyeDps: 5 },
  });
  {
    // Drift: vx = −pull·k·dx/d + swirl·k·dz/d, vz = −pull·k·dz/d − swirl·k·dx/d, k = 1 − d/r.
    const bad = [];
    for (const [cx, cz] of [[0, 0], [30, -20]]) {
      const m = createMechanics(['current'], mock({ env: stormEnv(cx, cz) }).ctx);
      for (const d of [20, 40, 74]) {
        for (const a of [0, 1, 2.5, -2, Math.PI]) {
          const dx = Math.sin(a) * d;
          const dz = Math.cos(a) * d;
          const s = ship('cutter', cx + dx, cz + dz);
          const v = m.drift(s);
          const k = 1 - d / 75;
          const wx = (-3.2 * k * dx) / d + (2.8 * k * dz) / d;
          const wz = (-3.2 * k * dz) / d - (2.8 * k * dx) / d;
          // Inward pull and the swirl of a disc whose rotation.y increases: d/dθ of
          // (x cos θ + z sin θ, −x sin θ + z cos θ) at θ = 0 is (z, −x).
          const inward = v ? (v.vx * -dx + v.vz * -dz) / d : NaN;
          const swirl = v ? (v.vx * dz + v.vz * -dx) / d : NaN;
          if (!v || !near(v.vx, wx, 1e-9) || !near(v.vz, wz, 1e-9) || !near(inward, 3.2 * k) || !near(swirl, 2.8 * k)) {
            bad.push(`c(${cx},${cz}) d ${d} a ${a}: ${JSON.stringify(v)}`);
          }
        }
      }
      for (const d of [75, 76, 120]) {
        if (m.drift(ship('cutter', cx + d, cz)) !== null) bad.push(`d ${d} not zero`);
      }
    }
    check(bad.length === 0, `drift at d 20, 40, 74 follows the §6.3 formula (pull 3.2·k inward, swirl 2.8·k with rotation.y), zero at 75, 76, 120${bad.length ? ' -> ' + bad.slice(0, 3).join('; ') : ''}`);
    const m = createMechanics(['current'], mock({ env: stormEnv() }).ctx);
    const v20 = m.drift(ship('cutter', 20, 0));
    check(near(v20.vx, -3.2 * (1 - 20 / 75)) && near(v20.vz, -2.8 * (1 - 20 / 75)), `at (20, 0): (${f3(v20.vx)}, ${f3(v20.vz)}) = (−2.347, −2.053)`);
    check(m.drift(ship('phantom', 20, 0)) === null, 'the Phantom (ghost) ignores the current');
    check(same(m.drift(ship('cutter', 0, 0)), { vx: 0, vz: 0 }), 'dead centre: no drift (no division by zero)');
    check(same(m.avoid(), [{ x: 0, z: 0, r: 16 }]), `avoid(): the eye + 4 (${JSON.stringify(m.avoid())})`);
    check(same(m.minimap(), [{ kind: 'vortex', x: 0, z: 0, r: 75 }, { kind: 'eye', x: 0, z: 0, r: 12 }]), `minimap: the vortex ring and the eye (${JSON.stringify(m.minimap())})`);
    check(m.objective() === null && m.bonus() === 0 && same(m.summary(), []) && m.steer(ship('cutter', 0, 30), DT) === null, 'the current adds no objective, bonus, summary or steering');
    const none = createMechanics(['current'], mock({ env: { worldRadius: 140 } }).ctx);
    check(none.drift(ship('cutter', 5, 5)) === null && same(none.avoid(), []) && same(none.minimap(), []), 'an env without a current: no drift, no circles');
  }
  {
    // Eye damage: 1 hp every 0.2 s (5 hp/s) to every non-ghost ship inside the eye.
    const p = ship('player', 0, 30);
    const e = ship('privateer', 5, 0);
    const out = ship('cutter', 12.5, 0);
    const ghost = ship('phantom', -3, 2);
    const cap = ship('cutter', 0, -4, 0, { captured: true });
    const enemies = [e, out, ghost, cap];
    const { ctx, log } = mock({ env: stormEnv(), player: p, enemies });
    const m = createMechanics(['current'], ctx); // no init(): it would raise the Phantom as a wave-0 spawn
    for (let i = 0; i < 120; i++) m.step(DT);
    const onE = log.damage.filter((d) => d.s === e);
    check(onE.length === 5 && onE.every((d) => d.amount === 1 && d.source === 'maelstrom'), `1 s in the eye: 5 × 1 hp, source 'maelstrom' (${onE.length} hits)`);
    for (let i = 0; i < 120; i++) m.step(DT);
    check(log.damage.filter((d) => d.s === e).length === 10 && e.hp === SHIP_TYPES.privateer.hp - 10, `2 s: 10 hp, i.e. 5 hp/s (hp ${e.hp})`);
    check(log.damage.every((d) => d.s === e), 'outside the eye (12.5 u), the Phantom and a captured ship take nothing');
    check(log.banner.length === 0, 'no banner while the player is outside the eye');
    p.x = 0;
    p.z = 6;
    for (let i = 0; i < 120; i++) m.step(DT);
    const onP = log.damage.filter((d) => d.s === p).length;
    check(onP === 5, `the player in the eye takes 5 hp/s too (${onP})`);
    p.z = 40;
    m.step(DT);
    p.z = 6;
    for (let i = 0; i < 60; i++) m.step(DT);
    const eyeBanners = log.banner.filter((b) => /^The maelstrom pulls you in!/.test(b.html));
    check(eyeBanners.length === 1 && log.banner.length === 1, `banner "The maelstrom pulls you in!" the first time only (${JSON.stringify(log.banner.map((b) => b.html))})`);
    check(m.state.current.eyeDamage === log.damage.length && m.state.current.warned === true && m.state.current.r === 75, `state.current (${JSON.stringify(m.state.current)})`);
    // A ship sunk by the eye stops taking damage.
    const tiny = ship('cutter', 2, 2, 0, { hp: 1 });
    const { ctx: c2, log: l2 } = mock({ env: stormEnv(), player: null, enemies: [tiny] });
    const m2 = createMechanics(['current'], c2);
    for (let i = 0; i < 240; i++) {
      m2.step(DT);
      if (tiny.hp <= 0) tiny.sinking = 0.01;
    }
    check(l2.damage.length === 1, `a ship sunk by the eye takes no more eye damage (${l2.damage.length})`);
  }
  {
    // The Phantom Galleon rises 18 u from the centre in open water, facing the player.
    const p = ship('player', 0, 95);
    const ph = ship('phantom', 70, 10);
    const { ctx, log } = mock({ env: stormEnv(), player: p, enemies: [ph] });
    const m = createMechanics(['current'], ctx);
    m.onSpawn(ph, 1);
    const r = Math.hypot(ph.x, ph.z);
    const facing = Math.atan2(p.x - ph.x, p.z - ph.z);
    check(near(r, 18) && near(ph.h, facing) && ph.rise === 3, `she rises 18 u from the centre (${f3(r)}), facing the player (h ${f3(ph.h)}), rise 3 (${ph.rise})`);
    check(Math.abs(wrap(Math.atan2(ph.x, ph.z) - Math.atan2(p.x, p.z))) < 1e-9, 'on the player\'s side of the whirlpool when the water is open');
    check(log.banner.some((b) => /^The Phantom Galleon rises!/.test(b.html)) && log.sfx.some((s) => s.name === 'ghost'), `banner "The Phantom Galleon rises!" and sfx 'ghost' (${JSON.stringify(log.banner.map((b) => b.html))})`);
    check(m.holdFire(ph) === true, 'she holds fire while rising');
    ph.rise = 0;
    check(m.holdFire(ph) === false, 'and fires normally once risen');
    // Land on that bearing: she rises elsewhere on the 18 u ring, clear of it.
    const env2 = stormEnv();
    env2.colliders = [{ x: 0, z: 18, r: 6 }];
    const ph2 = ship('phantom', 70, 10);
    const m2 = createMechanics(['current'], mock({ env: env2, player: p, enemies: [ph2] }).ctx);
    m2.onSpawn(ph2, 1);
    const clear = Math.hypot(ph2.x - 0, ph2.z - 18);
    check(near(Math.hypot(ph2.x, ph2.z), 18) && clear >= 6 + 17 / 2 + 4 && near(ph2.h, Math.atan2(p.x - ph2.x, p.z - ph2.z)), `with land on the player's bearing she rises in open water (${f3(clear)} u from the rock's centre)`);
    // The player close to the eye: never under the player's keel.
    const p3 = ship('player', 0, 20);
    const ph3 = ship('phantom', 70, 10);
    const m3 = createMechanics(['current'], mock({ env: stormEnv(), player: p3, enemies: [ph3] }).ctx);
    m3.onSpawn(ph3, 1);
    check(near(Math.hypot(ph3.x, ph3.z), 18) && Math.hypot(ph3.x - p3.x, ph3.z - p3.z) >= 25, `the player near the eye: she rises ≥ 25 u away (${f3(Math.hypot(ph3.x - p3.x, ph3.z - p3.z))})`);
    // A test spawn keeps its position; other ships are never moved.
    const ph4 = ship('phantom', 40, -30, 1);
    const cor = ship('corsair', 50, 50, 2);
    const m4 = createMechanics(['current'], mock({ env: stormEnv(), player: p, enemies: [ph4, cor] }).ctx);
    m4.onSpawn(ph4, -1);
    m4.onSpawn(cor, 0);
    check(ph4.x === 40 && ph4.z === -30 && ph4.h === 1 && ph4.rise === 3 && cor.x === 50 && cor.z === 50 && cor.h === 2 && cor.rise === undefined, 'a test spawn of the Phantom stays put (but still rises); other ships are untouched');
  }

  // ---------------------------------------------------------------- several mechanics at once
  {
    const env = { ...bayEnv(), ...stormEnv(), reefs: [{ x: 50, z: 50, r: 5, ice: true }] };
    const p = ship('player', 0, 95);
    const g = ship('galleon', 30, 30);
    const m = createMechanics(['convoy', 'floes', 'current'], mock({ env, player: p, enemies: [g], def: { waves: L4_WAVES } }).ctx);
    m.init();
    const kinds = [...new Set(m.minimap().map((o) => o.kind))].sort();
    check(same(kinds, ['eye', 'floe', 'galleon', 'gate', 'vortex']), `combined: every minimap kind (${kinds})`);
    check(/^Galleons: /.test(m.objective()) && !!m.steer(g, DT) && !!m.drift(ship('cutter', 20, 0)) && m.avoid().length === 1, 'combined: the convoy objective and steering, the current drift and the eye circle');
    check(same(m.state.ids, ['convoy', 'floes', 'current']) && 'convoy' in m.state && 'floes' in m.state && 'current' in m.state, `state has a snapshot per mechanic (${Object.keys(m.state)})`);
    let t = 0;
    for (let i = 0; i < 60; i++) {
      m.step(DT);
      t += DT;
    }
    check(near(m.state.time, t, 1e-9), `state.time is the simulated time given to step() (${f3(m.state.time)})`);
    m.dispose();
  }

  // ---------------------------------------------------------------- act2.js: the level definitions
  {
    const envStub = (name) => `const ${name} = { stub: '${name}', meta: { name: '${name}' } };`;
    const src = fs.readFileSync(path.join(ROOT, 'src/act2.js'), 'utf8');
    const stubbed = src.replace(/^import \* as (\w+) from '\.\/env\/(\w+)\.js';$/gm, (_, name) => envStub(name));
    check(!/^\s*import\s/m.test(stubbed), 'act2.js imports only the three env modules');
    const { ACT2_LEVELS } = await import(dataUrl(stubbed));
    check(Array.isArray(ACT2_LEVELS) && ACT2_LEVELS.length === 3, `ACT2_LEVELS has three levels (${ACT2_LEVELS?.length})`);
    const WANT = [
      {
        env: 'doubloon', difficulty: 'Tricky', act: 2, stars: 4, scene: 'doubloon',
        waves: [['galleon', 'cutter', 'cutter'], ['galleon', 'privateer', 'corsair']],
        nextWaveAt: 1, maxAttackers: 2, lead: 0.6, spreadMul: 1.0, grace: 4, enemyRake: 1, mechanics: ['convoy'], bonus: 500,
        mechanic: 'Treasure galleons are running for the open sea! Catch them, thin their crews and board them for a fortune.',
        rumour: { title: 'Doubloon Bay', lines: ['The treasure fleet sails at dusk.', 'Sink a galleon and her gold sinks too: board her instead!'], ammo: 'chain' },
        lockText: 'Beat the Molten Maw',
      },
      {
        env: 'frost', difficulty: 'Tough', act: 2, stars: 5, scene: 'frost',
        waves: [['raider', 'raider', 'privateer'], ['raider', 'raider', 'manowar']],
        nextWaveAt: 1, maxAttackers: 3, lead: 0.65, spreadMul: 0.95, grace: 3, enemyRake: 1, mechanics: ['floes'], bonus: 700,
        mechanic: 'Longship raiders board YOU! Press G three times (or hold it) to cut their ropes.',
        rumour: { title: 'Frostbite Straits', lines: ['Raiders with horned helmets row out of the fog.', 'Chain shot slows their longships; cut their ropes fast!'], ammo: 'chain' },
      },
      {
        env: 'maelstrom', difficulty: 'Legendary', act: 2, stars: 6, scene: 'maelstrom',
        waves: [['corsair', 'raider', 'corsair'], ['phantom', 'raider']],
        nextWaveAt: 0, maxAttackers: 2, lead: 0.7, spreadMul: 0.9, grace: 3, enemyRake: 1, mechanics: ['current'], bonus: 1000,
        bombs: { kind: 'lightning', every: [5, 8], spread: 8, radius: 5, damage: 14, warn: [1.4, 1.6] },
        finale: true, finaleText: 'The Phantom Galleon is yours! You are the Legend of the Seven Seas.',
        mechanic: "The maelstrom pulls you in! Scatter the Phantom's ghost crew with grape shot, then board her.",
        rumour: { title: 'The Maelstrom', lines: ['A ghost ship sails where the sea swallows itself.', "Round shot barely scratches her. Grape and cutlasses don't!"], ammo: 'grape' },
      },
    ];
    WANT.forEach((want, i) => {
      const lv = ACT2_LEVELS[i] || {};
      const wrong = Object.keys(want).filter((k) => (k === 'env' ? lv.env?.stub !== want.env : !same(lv[k], want[k])));
      check(wrong.length === 0, `level ${i + 4} (${want.difficulty}): every §6.${i + 4} field exact${wrong.length ? ' -> wrong: ' + wrong.map((k) => `${k} ${JSON.stringify(k === 'env' ? lv.env?.stub : lv[k])}`).join('; ') : ''}`);
    });
    const L5 = ACT2_LEVELS[1] || {};
    check(typeof L5.mechanicTouch === 'string' && /Tap CUT! three times or hold it/.test(L5.mechanicTouch), `Frostbite Straits has the touch wording "Tap CUT! three times or hold it" (${L5.mechanicTouch})`);
    check(ACT2_LEVELS.filter((l) => l.finale).length === 1 && ACT2_LEVELS[2].finale === true && ACT2_LEVELS[0].lockText === 'Beat the Molten Maw', 'only The Maelstrom is a finale; Doubloon Bay has the "Beat the Molten Maw" lock text');
    const unknownTypes = ACT2_LEVELS.flatMap((l) => l.waves.flat()).filter((t) => !SHIP_TYPES[t] || t === 'player');
    const unknownIds = ACT2_LEVELS.flatMap((l) => l.mechanics).filter((id) => !MECHANIC_IDS.includes(id));
    check(unknownTypes.length === 0 && unknownIds.length === 0, `every wave names a known enemy type and every mechanic id is known${unknownTypes.length || unknownIds.length ? ' -> ' + [...unknownTypes, ...unknownIds] : ''}`);
    const flags = ACT2_LEVELS.map((l) => l.waves.flat().map((t) => SHIP_TYPES[t]));
    check(
      flags[0].some((t) => t.merchant) && flags[1].filter((t) => t.boarder).length === 4 && flags[2].some((t) => t.ghost && t.boss) && flags[2].some((t) => t.boarder),
      'Doubloon Bay has treasure galleons, the Straits four raiders, the Maelstrom the Phantom and a raider'
    );
    const numbersOk = ACT2_LEVELS.every(
      (l) =>
        l.waves.every((w) => w.length > 0 && w.length <= 6) &&
        Number.isInteger(l.nextWaveAt) && l.nextWaveAt >= 0 &&
        l.maxAttackers >= 1 && l.lead > 0 && l.lead <= 1 && l.spreadMul > 0 && l.grace >= 0 && l.bonus > 0 &&
        typeof l.mechanic === 'string' && l.rumour.lines.length === 2 && ['chain', 'grape', null].includes(l.rumour.ammo)
    );
    check(numbersOk, 'every Act II level has sane knobs (waves of 1–6 ships, nextWaveAt, maxAttackers, lead 0..1, spread, grace, bonus, a mechanic line, a 2-line rumour)');
    check(ACT2_LEVELS.map((l) => l.bonus).every((b, i, a) => i === 0 || b > a[i - 1]) && ACT2_LEVELS.map((l) => l.stars).join() === '4,5,6', 'bonus and stars rise level by level');

    // The act slots into levels.js: hidden without ?act2=1, appended after Act I with it.
    const levelsSrc = fs.readFileSync(path.join(ROOT, 'src/levels.js'), 'utf8');
    const levelsStubbed = levelsSrc
      .replace(/^import \* as (\w+) from '\.\/env\/(\w+)\.js';$/gm, (_, name) => envStub(name))
      .replace(/^import \{ ACT2_LEVELS \} from '\.\/act2\.js';$/m, 'const ACT2_LEVELS = globalThis.__act2Levels;');
    check(!/^\s*import\s/m.test(levelsStubbed), 'levels.js imports the Act I envs and act2.js only');
    globalThis.__act2Levels = ACT2_LEVELS;
    const plain = await import(dataUrl(levelsStubbed + '\n// plain'));
    globalThis.location = { search: '?quality=low&act2=1' };
    const withAct2 = await import(dataUrl(levelsStubbed + '\n// act2'));
    delete globalThis.location;
    check(plain.WITH_ACT2 === false && plain.LEVELS.length === 3, `without ?act2=1 the voyage is Act I only (${plain.LEVELS.length} levels)`);
    check(
      withAct2.WITH_ACT2 === true && withAct2.LEVELS.length === 6 && withAct2.LEVELS.slice(3).every((l, i) => l === ACT2_LEVELS[i]),
      `with ?act2=1 Act II follows Act I (${withAct2.LEVELS.length} levels)`
    );
    const act1Keys = new Set(plain.ACT1.flatMap((l) => Object.keys(l)).filter((k) => !['bombs', 'finale', 'finaleText', 'mechanic', 'rumour', 'lockText'].includes(k)));
    const missing = ACT2_LEVELS.flatMap((l, i) => [...act1Keys].filter((k) => !(k in l)).map((k) => `L${i + 4} ${k}`));
    check(missing.length === 0, `Act II levels have every field Act I levels have${missing.length ? ' -> missing ' + missing : ''}`);
  }

  console.log(failures ? `\n${failures} check(s) failed` : `\nAll mechanics checks passed (${passes})`);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
