// Unit checks for Voyage III's rules in src/mechanics3.js and the Voyage III level definitions in src/act3.js
// (plain Node, no browser), SPEC3 §4.2, §5.3–5.6, §11.1, §13.1. The hooks run against a mock of the ctx main.js
// hands them (SPEC2's mechanics ctx + SPEC3's ctx3 members), with the real ship types from src/shipTypes.js:
// - the API: exact exports, the tables exactly as SPEC3, the null object, junk ids / ctx / ships never throw
// - waterspouts: two at once in wave 1 and three in wave 2, forming 3 s (+ the Lighthouse's bonus) and harmless,
//   active 22 s, collapsing 2 s, the next 6–9 s later at a loop point ≥ 30 u from you, riding their loops; the
//   pull (2 u/s inside r 14, none at r 15), the core (4 hp/s, spin, fling after 1.5 s, puts fire out), avoid()
// - rogue waves: the first at 30 s of combat, then every 24–32 s, one at a time; the warning ≥ 4 s (+ bonus, and
//   the start 16 u farther per bonus second); 49° surfs, 50° and 130° take 10 and the push, 131° rides; every
//   wave puts fire out; the directions come from env.rogueDirs; bosses turn bow-in
// - the Shark Raider's ram: a 1.5 s wind-up before any surge, the surge at 16 (frost: 8), contact damage that
//   scales with speed (10 / 5), 8 to her, the push apart, CRUNCH!, the 6 s cooldown; stink cancels it
// - the Bomb Ketch: the range window 25–48, every 6–8 s, the shell's numbers and lead, stink pauses, her course
// - the Fire Ship: lit at 30 u, never a blast before 1.6 s lit, the blast and its falloff (pirates too), a blast
//   when sunk while lit (none when sunk before), frost → she strikes and never explodes
// - the Inkheart's ink pots (2 every 10 s, ±6 u) and slicks (≤ 3, speed ×0.6 inside, INKY! once per entry, 6 s)
// - the flagship's fall: every other fighting ship flees (to the edge at 7, gone after 5 s), struck ships are
//   taken, the slicks fade, and krakenDue waits for the boarding, the struck ships and the fleeing ones
// - the hazards wait while ctx.hold() is true; the same seed gives the same run
// - composeMechanics with a real createMechanics instance (SPEC3 §11.1's rules)
// - act3.js: the three levels exactly as §5.4–5.6, every field Act II levels have, known types and ids, bonus and
//   stars rise, ≤ 3 ships a wave and nextWaveAt keeps ≤ 4 afloat
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

// mechanics3.js, mechanics.js and shipTypes.js import nothing: they load from their source as data: URLs.
// act3.js (and act2.js / levels.js) import the env modules (three.js): those imports are swapped for stand-ins.
function dataUrl(src) {
  return 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');
}
async function load(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (/^\s*import\s[^(]/m.test(src)) throw new Error(`${rel} has imports now; load it another way`);
  return import(dataUrl(src));
}

const near = (a, b, eps = 1e-6) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= eps;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const f3 = (v) => (typeof v === 'number' ? v.toFixed(3) : String(v));
const wrap = (a) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};
const DT = 1 / 120; // main's simulation substep
const RAD = Math.PI / 180;
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

(async () => {
  const M3 = await load('src/mechanics3.js');
  const { createMechanics, MECHANIC_IDS } = await load('src/mechanics.js');
  const { SHIP_TYPES } = await load('src/shipTypes.js');
  const { MECHANIC3_IDS, SPOUTS, ROGUE, RAM, MORTAR, FIRESHIP, INK, FLEE, createMechanics3, composeMechanics } = M3;

  // ---------------------------------------------------------------- a mock of main's ctx
  function relative(ship, tx, tz) {
    const dx = tx - ship.x;
    const dz = tz - ship.z;
    return {
      along: dx * Math.sin(ship.h) + dz * Math.cos(ship.h),
      lat: dx * -Math.cos(ship.h) + dz * Math.sin(ship.h),
      dist: Math.hypot(dx, dz),
    };
  }
  let nextId = 1;
  function ship(typeName, x, z, h = 0, extra = {}) {
    const type = SHIP_TYPES[typeName];
    return {
      id: nextId++,
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
      status: { id: null, t: 0, max: 0, immune: 0 },
      ...extra,
    };
  }
  // world(): a mechanics3 instance over a mock ctx. damage() lowers hp and, like main, sinks a ship at 0 and
  // calls onSink. The log keeps every call main would see.
  function world({ ids = [], env = {}, player = null, enemies = [], def = {}, rng = () => 0.5, extra = {} } = {}) {
    const log = { damage: [], escape: [], pop: [], banner: [], announce: [], sfx: [], bombs: [], flee: [], explode: [], douse: [], surrender: [], capture: [] };
    const w = { log, enemies, player, m: null, hold: false, boarding: false, attacking: () => true, warn: 0, turn: 0, turnRate: 0 };
    const ctx = {
      env: () => env,
      player: () => w.player,
      enemies,
      fighting: (e) => e.hp > 0 && !e.sinking && !e.captured && !e.escaped && !e.surrendered && !e.fleeing && !e.boarded,
      relative,
      damage: (s, amount, x, z, source) => {
        log.damage.push({ s, amount, x, z, source });
        s.hp -= amount;
        if (s.hp <= 0 && !s.sinking) {
          s.hp = 0;
          s.sinking = 0.001;
          if (s !== w.player && w.m) w.m.onSink(s);
        }
      },
      escape: (e) => {
        log.escape.push(e);
        e.escaped = true;
      },
      pop: (text, x, y, z, style) => log.pop.push({ text, x, y, z, style }),
      showBanner: (html, seconds) => log.banner.push({ html, seconds }),
      announce: (text) => log.announce.push(text),
      sfx: (name, x, z) => log.sfx.push({ name, x, z }),
      rng,
      time: () => 0,
      def,
      launchBomb: (spec) => {
        log.bombs.push({ ...spec, at: w.m ? w.m.state.hazardTime : 0 });
        return {};
      },
      flee: (e) => {
        log.flee.push(e);
        e.fleeing = true;
      },
      explode: (x, z, r, dmg, src) => log.explode.push({ x, z, r, dmg, src }),
      status: (e) => e.status,
      douse: (e) => {
        // (as specials.douse: water puts a fire out)
        log.douse.push(e);
        if (e && e.status && e.status.id === 'fire') e.status = { id: null, t: 0, max: 0, immune: e.status.immune || 0 };
      },
      playerTurn: () => w.turn,
      warnBonus: () => w.warn,
      surrender: (e) => {
        log.surrender.push(e);
        e.surrendered = true;
      },
      capture: (e) => {
        log.capture.push(e);
        e.captured = true;
      },
      attacking: (e) => w.attacking(e),
      hold: () => w.hold,
      boarding: () => w.boarding,
      turnRate: () => w.turnRate,
      ...extra,
    };
    w.ctx = ctx;
    w.m = createMechanics3(ids, ctx);
    // runPre: `before` runs ahead of each step, as main's moveShip and speedCap read drift() and shipMods()
    // before mechanics.step() in the same simulation step.
    w.runPre = (seconds, before) => {
      const n = Math.round(seconds / DT);
      for (let i = 0; i < n; i++) {
        if (before) before(i);
        w.m.step(DT);
      }
    };
    w.run = (seconds, each) => {
      const n = Math.round(seconds / DT);
      for (let i = 0; i < n; i++) {
        w.m.step(DT);
        if (each && each(i) === false) return i + 1;
      }
      return n;
    };
    return w;
  }
  const pops = (w, text) => w.log.pop.filter((p) => p.text === text);

  // ---------------------------------------------------------------- the API and the tables
  {
    check(same(MECHANIC3_IDS, ['spouts', 'rogue', 'flagship']), `MECHANIC3_IDS is ['spouts', 'rogue', 'flagship'] (${JSON.stringify(MECHANIC3_IDS)})`);
    const want = ['FIRESHIP', 'FLEE', 'INK', 'MECHANIC3_IDS', 'MORTAR', 'RAM', 'ROGUE', 'SPOUTS', 'composeMechanics', 'createMechanics3'];
    check(same(Object.keys(M3).sort(), want), `exports exactly the §11.1 names (${Object.keys(M3).sort()})`);
    check(MECHANIC3_IDS.every((id) => !MECHANIC_IDS.includes(id)), 'no id is shared with mechanics.js (main gives def.mechanics to both factories)');
    const tablesOk = (o) => Object.entries(o).every(([k, v]) => (Array.isArray(v) ? v.every((x) => typeof x === 'number') : typeof v === 'object' ? tablesOk(v) : typeof v === 'number'));
    check([SPOUTS, ROGUE, RAM, MORTAR, FIRESHIP, INK, FLEE].every(tablesOk), 'every table holds plain numbers only');
    const code = fs.readFileSync(path.join(ROOT, 'src/mechanics3.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    check(!/Math\.random/.test(code) && !/^\s*import\s/m.test(code), 'gameplay never rolls Math.random (ctx.rng only) and the module imports nothing');

    // §5.3 waterspouts, §5.3 rogue waves and §4.2's behaviours, exactly
    const spoutsSpec = { active: SPOUTS.active, speed: SPOUTS.speed, clear: SPOUTS.clear, form: SPOUTS.form, life: SPOUTS.life, collapse: SPOUTS.collapse, next: SPOUTS.next, away: SPOUTS.away, pull: SPOUTS.pull, core: SPOUTS.core, avoid: SPOUTS.avoid };
    check(
      same(spoutsSpec, { active: [2, 3], speed: 2.5, clear: 8, form: 3, life: 22, collapse: 2, next: [6, 9], away: 30, pull: { r: 14, speed: 2 }, core: { r: 6, spin: 2, dps: 4, tick: 0.25, fling: 1.5, flingSpeed: 6, flingTime: 1 }, avoid: 16 }) &&
        near(SPOUTS.core.tick * SPOUTS.core.dps, 1),
      `SPOUTS: 2 then 3 at once, form 3 s, life 22 s, collapse 2 s, next 6–9 s at ≥ 30 u, pull r 14 at 2 u/s, core r 6 (spin 2, 4 hp/s as 1 hp per 0.25 s, fling after 1.5 s at 6 u/s for 1 s), avoid r 16`
    );
    const rogueSpec = { first: ROGUE.first, every: ROGUE.every, warn: ROGUE.warn, length: ROGUE.length, height: ROGUE.height, speed: ROGUE.speed, start: ROGUE.start, startBonus: ROGUE.startBonus, sideOn: ROGUE.sideOn, damage: ROGUE.damage, push: ROGUE.push, pushTime: ROGUE.pushTime, wobble: ROGUE.wobble, wobbleTurn: ROGUE.wobbleTurn, surf: ROGUE.surf, surfTime: ROGUE.surfTime };
    check(
      same(rogueSpec, { first: 30, every: [24, 32], warn: 4, length: 120, height: 7, speed: 16, start: 70, startBonus: 16, sideOn: [50, 130], damage: 10, push: 6, pushTime: 0.5, wobble: 1, wobbleTurn: 0.5, surf: 2, surfTime: 2 }),
      'ROGUE: first at 30 s then every 24–32 s, warn 4 s, a crest 120 long and 7 tall at 16 u/s from 70 u (+16 per bonus second), side-on 50°–130°: 10 damage, pushed 6 u over 0.5 s, 1 s wobble (turn ×0.5); surf +2 for 2 s'
    );
    const ramSpec = { reach: RAM.reach, cone: RAM.cone, windup: RAM.windup, surge: RAM.surge, speed: RAM.speed, contact: RAM.contact, damage: RAM.damage, self: RAM.self, push: RAM.push, pushTime: RAM.pushTime, cooldown: RAM.cooldown };
    check(same(ramSpec, { reach: 25, cone: 0.35, windup: 1.5, surge: 2, speed: 16, contact: 0.36, damage: 10, self: 8, push: 4, pushTime: 0.6, cooldown: 6 }) && RAM.frost === 0.5, 'RAM: within 25 u and 0.35 rad, wind-up 1.5 s, surge 2 s at 16 (frost halves it), contact (len_a + len_b) × 0.36, 10 to you / 8 to her, pushed apart 4 u/s for 0.6 s, cooldown 6 s');
    const mortarSpec = { keep: MORTAR.keep, flee: MORTAR.flee, every: MORTAR.every, range: MORTAR.range, lead: MORTAR.lead, radius: MORTAR.radius, damage: MORTAR.damage, warn: MORTAR.warn };
    check(same(mortarSpec, { keep: [35, 45], flee: 20, every: [6, 8], range: [25, 48], lead: 0.8, radius: 4.5, damage: 12, warn: 2.2 }), 'MORTAR: keeps 35–45 u (flees inside 20), every 6–8 s with you 25–48 u away, lead 0.8, ring 4.5, 12 damage, warning 2.2 s');
    check(same(FIRESHIP, { light: 30, ring: 6, arm: 1.6, reach: 4, touch: 0.25, blast: 22, edge: 11, frozenSpeed: 3 }), 'FIRESHIP: lit at 30 u, ring 6, armed after 1.6 s, within 4 u of a hull (or touching it), 22 falling to 11 at r 6, frozen 3 u/s');
    const inkSpec = { every: INK.every, pots: INK.pots, scatter: INK.scatter, radius: INK.radius, damage: INK.damage, warn: INK.warn, slick: { r: INK.slick.r, time: INK.slick.time, speedMul: INK.slick.speedMul, max: INK.slick.max } };
    check(same(inkSpec, { every: 10, pots: 2, scatter: 6, radius: 4, damage: 8, warn: 1.8, slick: { r: 7, time: 6, speedMul: 0.6, max: 3 } }), 'INK: 2 pots every 10 s ±6 u, ring 4, 8 damage, warning 1.8 s; slicks r 7 for 6 s, speed ×0.6, at most 3');
    check(same(FLEE, { speed: 7, remove: 5 }), 'FLEE: for the edge at 7 u/s, gone after 5 s');

    const API = ['init', 'onSpawn', 'onCapture', 'onSink', 'onRemove', 'step', 'steer', 'holdFire', 'drift', 'avoid', 'shipMods', 'objective', 'minimap', 'summary', 'bonus', 'visuals', 'addSlick', 'dispose'];
    const m = createMechanics3(MECHANIC3_IDS, {});
    const missing = API.filter((k) => typeof m[k] !== 'function');
    const getters = ['krakenDue', 'state'].filter((k) => typeof Object.getOwnPropertyDescriptor(m, k)?.get !== 'function');
    check(missing.length === 0 && getters.length === 0, `createMechanics3 returns every hook of §11.1 and the krakenDue / state getters${missing.length || getters.length ? ' -> missing ' + [...missing, ...getters] : ''}`);
    check(typeof m.wave === 'function' && typeof m.spout === 'function', 'and the test hooks wave(angle) / spout(x, z) (G.mechanics3, §11.3)');

    // The null object: no ids and ordinary ships → nothing happens.
    const p = ship('player', 0, 0);
    const e = ship('cutter', 30, 0);
    const w = world({ player: p, enemies: [e] });
    w.m.init();
    w.m.onSpawn(e, 0);
    w.run(60);
    const out = {
      steer: w.m.steer(e, DT),
      holdFire: w.m.holdFire(e),
      drift: w.m.drift(e),
      avoid: w.m.avoid(),
      objective: w.m.objective(),
      minimap: w.m.minimap(),
      summary: w.m.summary(),
      bonus: w.m.bonus(),
      mods: w.m.shipMods(e),
      visuals: w.m.visuals(),
      due: w.m.krakenDue,
    };
    check(
      same(out, { steer: null, holdFire: false, drift: null, avoid: [], objective: null, minimap: [], summary: [], bonus: 0, mods: { speedMul: 1, capAdd: 0, turnMul: 1, spin: 0 }, visuals: { spouts: [], rogue: null, slicks: [], rams: [], fireRings: [], shells: [] }, due: false }) &&
        w.log.bombs.length + w.log.damage.length + w.log.pop.length + w.log.banner.length === 0 && e.x === 30 && e.z === 0,
      `no ids, no Voyage III ships: every hook is a no-op for 60 s (${JSON.stringify(out)})`
    );
    check(w.m.shipMods(e) === w.m.shipMods(p) && Object.isFrozen(w.m.shipMods(e)), 'shipMods with nothing on gives one frozen identity object (cheap for main, which asks every step)');
    const st = w.m.state;
    check(same(st.ids, []) && near(st.time, 60, 1e-6) && near(st.hazardTime, 60, 1e-6) && JSON.stringify(st).length > 0, `state is a plain snapshot: ids [], time 60 (${JSON.stringify({ ids: st.ids, time: st.time })})`);

    const ids = createMechanics3(['spouts', 'spouts', 'nope', 5, null, 'flagship', '__proto__', 'convoy', 'toString'], {}).state.ids;
    check(same(ids, ['spouts', 'flagship']), `unknown, junk, Act II and repeated ids are ignored (${JSON.stringify(ids)})`);
    let threw = '';
    for (const junkIds of [undefined, null, 5, 'spouts', {}, { 0: 'rogue', length: 1 }]) {
      try {
        const j = createMechanics3(junkIds, {});
        if (j.state.ids.length) threw += ` ${String(junkIds)} gave ${j.state.ids}`;
      } catch (err) {
        threw += ` ${String(junkIds)}: ${err.message}`;
      }
    }
    check(threw === '', `ids that are not an array give no hazards and never throw${threw}`);

    // Junk ctx and junk ships: every hook survives.
    const junkCtx = [
      undefined,
      null,
      5,
      'ctx',
      {},
      { env: 5, player: 'x', enemies: 7, fighting: 1, relative: 'r', damage: null, rng: 'x', status: 4, hold: 1 },
      { env: () => null, player: () => null, enemies: null, rng: () => NaN, warnBonus: () => 'x', playerTurn: () => Infinity },
      { env: () => ({ spoutLoops: 'x', rogueDirs: 7, worldRadius: 'w' }), player: () => ({}), rng: () => 2 },
      { env: () => ({ spoutLoops: [null, 5, { cx: 'a' }, { cx: 0, cz: 0, rx: -1, rz: 1, w: 1 }], rogueDirs: [null, 'x', NaN] }), status: () => ({ id: 'stink', t: 'x' }) },
      { env: () => ({ spoutLoops: [{ cx: 0, cz: 40, rx: 10, rz: 10, w: 0.2 }], rogueDirs: [1] }), player: () => ship('player', 0, 0), enemies: [null, 5, {}, ship('shark', 5, 5), ship('fireship', 1, 1), ship('inkheart', 20, 0), ship('bombketch', 30, 0)], def: { grace: 'x' } },
      { relative: () => null, fighting: () => true, status: () => ({ id: 'frost', t: 9 }), launchBomb: () => { throw new Error('no'); } },
    ];
    const junkShips = [undefined, null, 0, 'ship', {}, { x: NaN, z: 0 }, { x: 1, z: 1, type: null }, { x: 1, z: 1, hp: 'x', type: { ram: true, fireship: true, mortar: true, flagship: true } }, ship('shark', 1, 2), ship('fireship', 3, 4), ship('inkheart', 2, 2)];
    const bad = [];
    junkCtx.forEach((jc, i) => {
      try {
        const j = createMechanics3(MECHANIC3_IDS, jc);
        j.init();
        for (const s of junkShips) {
          j.onSpawn(s, 0);
          j.onSpawn(s, 'x');
          j.onSpawn(s, 1);
          j.steer(s, DT);
          j.steer(s, NaN);
          j.holdFire(s);
          j.drift(s);
          j.shipMods(s);
          j.onCapture(s);
          j.onSink(s);
          j.onRemove(s);
        }
        for (let k = 0; k < 400; k++) {
          try {
            j.step(0.1);
          } catch (err) {
            if (!/no/.test(err.message)) throw err; // (a ctx member that throws is the ctx's own problem)
          }
        }
        j.step(NaN);
        j.step(-1);
        j.step(Infinity);
        j.addSlick(1, 2);
        j.addSlick('a', null);
        j.wave('x');
        j.wave(1);
        j.spout(NaN, 1);
        j.spout(0, 0);
        j.avoid();
        j.objective();
        j.minimap();
        j.summary();
        j.visuals();
        void j.krakenDue;
        const b = j.bonus();
        const s = JSON.stringify(j.state);
        if (!Number.isFinite(b) || typeof s !== 'string') bad.push(`ctx ${i}: bonus ${b}`);
        j.dispose();
        j.dispose();
      } catch (err) {
        bad.push(`ctx ${i}: ${err.message}`);
      }
    });
    check(bad.length === 0, `junk ctx, junk ships and junk numbers never throw${bad.length ? ' -> ' + bad.join('; ') : ''}`);
  }

  // ---------------------------------------------------------------- waterspouts
  const LOOPS = [
    { cx: 0, cz: 60, rx: 24, rz: 14, w: 0.13, phase: 0 },
    { cx: 60, cz: -10, rx: 14, rz: 22, w: -0.13, phase: 1 },
    { cx: -60, cz: -10, rx: 18, rz: 18, w: 0.14, phase: 2 },
    { cx: 0, cz: -70, rx: 22, rz: 12, w: 0.13, phase: 3 },
  ];
  {
    const p = ship('player', 0, 0);
    const w = world({ ids: ['spouts'], env: { spoutLoops: LOOPS, worldRadius: 145 }, player: p, rng: mulberry32(7) });
    w.warn = 0.6; // a Lighthouse
    w.m.init();
    w.m.step(DT);
    let v = w.m.visuals().spouts;
    check(v.length === 1 && v[0].state === 'forming' && near(v[0].T, SPOUTS.form + 0.6, 1e-9) && v[0].r === 6 && v[0].pull === 14, `the first spout starts forming at once, for 3 s + the Lighthouse's 0.6 (${JSON.stringify(v[0])})`);
    const first = v[0].id;
    // Forming: harmless (no pull, no damage), a ship parked on it.
    const q0 = { x: v[0].x, z: v[0].z };
    const parked = ship('cutter', q0.x + 3, q0.z);
    w.enemies.push(parked);
    let pulled = false;
    let formAt = null;
    w.run(4, () => {
      const s = w.m.visuals().spouts.find((x) => x.id === first);
      if (s && s.state === 'forming' && w.m.drift(parked)) pulled = true;
      if (s && s.state === 'active' && formAt === null) formAt = w.m.state.hazardTime;
    });
    check(!pulled && w.log.damage.length === 0, 'a forming spout is harmless: no pull and no damage');
    check(formAt !== null && near(formAt, 3.6 + DT, 2 * DT), `it is active 3.6 s after it began to form (${f3(formAt)})`);
    w.enemies.length = 0;
    w.m.onRemove(parked);
    v = w.m.visuals().spouts;
    check(v.length === 2 && v[1].state === 'forming', `the second spout forms SPOUTS.stagger s after the first (2 at once during wave 1: ${v.length})`);
    // Life: active 22 s, collapsing 2 s, gone; the next forms 6–9 s later.
    let collapseAt = null;
    let goneAt = null;
    let nextAt = null;
    w.run(40, () => {
      const s = w.m.visuals().spouts.find((x) => x.id === first);
      if (s && s.state === 'collapsing' && collapseAt === null) collapseAt = w.m.state.hazardTime;
      if (!s && goneAt === null) goneAt = w.m.state.hazardTime;
      if (goneAt !== null && nextAt === null && w.m.visuals().spouts.some((x) => x.id > first + 1)) nextAt = w.m.state.hazardTime;
    });
    check(near(collapseAt - formAt, SPOUTS.life, 2 * DT) && near(goneAt - collapseAt, SPOUTS.collapse, 2 * DT), `it stays active 22 s, then collapses for 2 s (${f3(collapseAt - formAt)} / ${f3(goneAt - collapseAt)})`);
    check(goneAt !== null && nextAt !== null && nextAt - goneAt >= 6 - 0.02 && nextAt - goneAt <= 9 + 0.02, `the next forms 6–9 s after it is gone (${f3(nextAt - goneAt)} s)`);

    // A long run: every spout forms ≥ 30 u from you, rides its loop, and there are never more than 2 in wave 1.
    const p2 = ship('player', 0, 46); // (close to the first loop: many of its points are too near)
    const w2 = world({ ids: ['spouts'], env: { spoutLoops: LOOPS, worldRadius: 145 }, player: p2, rng: mulberry32(11) });
    w2.m.init();
    const born = new Map();
    let most = 0;
    let offLoop = 0;
    let tooNear = 0;
    let liveMax = 0;
    w2.run(300, (i) => {
      // you wander a little (the formation rule reads where you are when one forms)
      p2.x = 20 * Math.sin(i * DT * 0.05);
      const list = w2.m.visuals().spouts;
      most = Math.max(most, list.length);
      for (const s of list) {
        if (!born.has(s.id)) {
          born.set(s.id, s);
          if (Math.hypot(s.x - p2.x, s.z - p2.z) < SPOUTS.away - 1e-6) tooNear++;
        }
        const ok = LOOPS.some((L) => near(((s.x - L.cx) / L.rx) ** 2 + ((s.z - L.cz) / L.rz) ** 2, 1, 1e-6));
        if (!ok) offLoop++;
      }
      liveMax = Math.max(liveMax, w2.m.avoid().length);
    });
    check(born.size >= 10 && tooNear === 0, `every spout forms at a loop point ≥ 30 u from you (${born.size} formed, ${tooNear} too near)`);
    check(offLoop === 0, 'every spout rides its env.spoutLoops ellipse (cx + rx·cos, cz + rz·sin)');
    // Near the fight: a loop point within 70 u of you is preferred over one across the map (≥ 30 u still rules).
    const twoLoops = [
      { cx: 0, cz: 55, rx: 6, rz: 6, w: 0.2 }, // 49–61 u from (0, 0)
      { cx: 0, cz: -120, rx: 6, rz: 6, w: 0.2 }, // 114–126 u
    ];
    const firstSpout = (seed, px, pz) => {
      const ww = world({ ids: ['spouts'], env: { spoutLoops: twoLoops }, player: ship('player', px, pz), rng: mulberry32(seed) });
      ww.m.step(DT);
      const sp = ww.m.visuals().spouts[0];
      return Math.hypot(sp.x - px, sp.z - pz);
    };
    const nearPicks = Array.from({ length: 40 }, (_, k) => firstSpout(100 + k, 0, 0));
    const farPicks = Array.from({ length: 10 }, (_, k) => firstSpout(200 + k, 0, 45)); // (the near loop is 4–16 u off)
    // (a loop near the fight that already has a spout still beats a free one across the map, spacing allowing)
    const shared = world({ ids: ['spouts'], env: { spoutLoops: [{ cx: 0, cz: 50, rx: 20, rz: 20, w: 0.1 }, { cx: 0, cz: -120, rx: 6, rz: 6, w: 0.1 }] }, player: ship('player', 0, 0), rng: mulberry32(77) });
    shared.run(SPOUTS.stagger + 0.2);
    const sharedD = shared.m.visuals().spouts.map((sp) => Math.hypot(sp.x, sp.z));
    check(sharedD.length === 2 && sharedD.every((d) => d >= 30 - 1e-6 && d <= 70 + 1e-6), `the second spout shares the loop near the fight rather than go across the map (${sharedD.map(f3).join(', ')} u)`);
    check(nearPicks.every((d) => d >= 30 && d <= 70) && farPicks.every((d) => d >= 30), `spouts form near the fight: within 30–70 u of you when a loop has such a point (${f3(Math.min(...nearPicks))}–${f3(Math.max(...nearPicks))} u over 40 seeds), else farther (${f3(Math.min(...farPicks))} u), never nearer than 30`);
    check(most === 2 && liveMax === 2, `at most 2 at once during wave 1 (${most})`);
    w2.m.onSpawn(ship('shark', 100, 100), 1);
    let most3 = 0;
    w2.run(120, () => {
      most3 = Math.max(most3, w2.m.visuals().spouts.filter((s) => s.state !== 'collapsing').length);
    });
    check(w2.m.state.spouts.slots === 3 && most3 === 3, `wave 2 brings a third (${w2.m.state.spouts.slots} slots, ${most3} at once)`);
    // Speed along the loop: about SPOUTS.speed (the env sets w for 2.5 u/s; here w × radius).
    const s0 = w2.m.visuals().spouts[0];
    w2.m.step(DT);
    const s1 = w2.m.visuals().spouts.find((s) => s.id === s0.id);
    const speed = s1 ? Math.hypot(s1.x - s0.x, s1.z - s0.z) / DT : NaN;
    check(speed > 0.5 && speed < 4.5, `spouts move along their loops in simulated time (${f3(speed)} u/s)`);
    const av = w2.m.avoid();
    const mm = w2.m.minimap().filter((k) => k.kind === 'spout');
    check(av.every((a) => a.r === 16) && av.length === w2.m.visuals().spouts.length && mm.length === av.length && mm.every((k) => k.r === 6), `avoid() keeps pirates r 16 off every spout; the minimap shows each one (${av.length})`);

    // Pull, core, spin, fling, douse: a spout put at (0, 0) with the test hook (any level).
    const me = ship('player', 200, 200);
    const w3 = world({ player: me });
    const sp = w3.m.spout(0, 0);
    check(sp && sp.state === 'forming' && sp.x === 0 && sp.z === 0, 'spout(x, z) forms a waterspout where a test asks, on any level');
    w3.run(3);
    const a = ship('cutter', 10, 0);
    const b = ship('cutter', 0, 15);
    const cIn = ship('privateer', 0, 3, 0, { status: { id: 'fire', t: 4, max: 6, immune: 0 } });
    w3.enemies.push(a, b, cIn);
    const da = w3.m.drift(a);
    check(da && near(da.vx, -2, 1e-9) && near(da.vz, 0, 1e-9) && w3.m.drift(b) === null, `the pull: 2 u/s toward the core at r 10, none at r 15 (${JSON.stringify(da)} / ${JSON.stringify(w3.m.drift(b))})`);
    w3.m.step(DT);
    check(w3.m.shipMods(cIn).spin === 2 && w3.log.douse.filter((s) => s === cIn).length === 1, `in the core (r 6): she spins +2 rad/s and her fire is put out on entry (${w3.m.shipMods(cIn).spin}, douse ×${w3.log.douse.length})`);
    const hp0 = cIn.hp;
    w3.run(1 - DT);
    const hurt1 = hp0 - cIn.hp;
    const srcOk = w3.log.damage.every((d) => d.source === 'spout' && d.amount === 1);
    check(hurt1 === 4 && srcOk, `the core does 4 hp/s, 1 hp a tick, source 'spout' (${hurt1} hp in 1 s)`);
    let flungAt = null;
    w3.run(1, (i) => {
      if (flungAt === null && pops(w3, 'WHOOSH!').length) flungAt = 1 + (i + 1) * DT;
      return flungAt === null;
    });
    const fl = w3.m.drift(cIn);
    check(flungAt !== null && near(flungAt, 1.5, 2 * DT) && hp0 - cIn.hp === 6, `after 1.5 s inside she is flung out with a WHOOSH! (${f3(flungAt)} s, ${hp0 - cIn.hp} hp in all)`);
    check(fl && near(Math.hypot(fl.vx, fl.vz), 6, 1e-9) && fl.vz > 0, `the fling: 6 u/s straight out from the core (${JSON.stringify(fl)})`);
    let flingTime = 0;
    w3.runPre(2, () => {
      const d = w3.m.drift(cIn);
      if (d && near(Math.hypot(d.vx, d.vz), 6, 1e-6)) flingTime += DT;
    });
    check(near(flingTime, 1, DT / 2), `the fling lasts 1 s (${f3(flingTime)})`);
    check(w3.m.shipMods(a).spin === 0, 'outside the core: no spin');
    // A fire lit while she spins in the core goes out too (not only one she brought in).
    const dIn = ship('cutter', 1, 0);
    w3.enemies.push(dIn);
    w3.m.step(DT);
    const entryDouses = w3.log.douse.filter((s) => s === dIn).length;
    dIn.status = { id: 'fire', t: 6, max: 6, immune: 0 };
    w3.m.step(DT);
    check(entryDouses === 1 && w3.log.douse.filter((s) => s === dIn).length === 2 && dIn.status.id === null, `a fire lit inside the core is put out at once too (douse ×${w3.log.douse.filter((s) => s === dIn).length})`);
    w3.enemies.splice(w3.enemies.indexOf(dIn), 1);
    w3.m.onRemove(dIn);
    // Forming spouts hold still in the hazard clock; the test spout never comes back after its life.
    w3.run(30);
    check(w3.m.visuals().spouts.length === 0, 'a test spout lives one life (forming, 22 s, collapsing) and is gone');
  }

  // ---------------------------------------------------------------- rogue waves
  {
    const p = ship('player', 0, 0, 0);
    const w = world({ ids: ['rogue'], env: { rogueDirs: [Math.PI / 2, -2], worldRadius: 150 }, player: p, rng: mulberry32(3) });
    w.m.init();
    const launches = [];
    let seen = 0;
    w.run(200, () => {
      const st = w.m.state.rogue;
      if (st.waves > seen) {
        seen = st.waves;
        launches.push(w.m.state.hazardTime);
      }
      if (w.m.visuals().rogue && st.waves !== seen) launches.push(-1);
    });
    const gaps = launches.slice(1).map((t, i) => t - launches[i]);
    check(launches.length >= 5 && near(launches[0], 30, 2 * DT), `the first rogue wave comes at 30 s of combat (${f3(launches[0])})`);
    check(gaps.every((g) => g >= 24 - 0.02 && g <= 32 + 0.02), `then every 24–32 s (${gaps.map(f3).join(', ')})`);
    const hornCount = w.log.sfx.filter((s) => s.name === 'horn').length;
    check(hornCount === launches.length && w.log.banner.filter((b) => /ROGUE WAVE!/.test(b.html)).length === 1 && w.log.announce.filter((t) => /Rogue wave/.test(t)).length === launches.length, `each wave sounds the horn and is announced; the banner "ROGUE WAVE! Turn your bow or your stern to it!" shows the first time only (${hornCount} horns)`);
    const dirs = new Set();
    const w1 = world({ ids: ['rogue'], env: { rogueDirs: [Math.PI / 2, -2], worldRadius: 150 }, player: ship('player', 0, 0), rng: mulberry32(5) });
    w1.run(300, () => {
      const r = w1.m.visuals().rogue;
      if (r) dirs.add(r.from.toFixed(6));
    });
    check(dirs.size === 2 && [...dirs].every((d) => near(Number(d), Math.PI / 2, 1e-5) || near(Number(d), -2, 1e-5)), `waves come from env.rogueDirs (${[...dirs]})`);

    // Warning ≥ 4 s (+ the bonus); the start 70 u (+16 per bonus second) behind you, aimed through you.
    for (const bonus of [0, 0.9]) {
      const me = ship('player', 10, -20, 0);
      const wb = world({ player: me });
      wb.warn = bonus;
      const r = wb.m.wave(Math.PI / 2); // from the east: it rolls west
      check(near(r.warn, 4 + bonus) && near(r.ahead, 70 + 16 * bonus) && near(r.h, -Math.PI / 2) && near(r.z, me.z) && r.warning === true, `bonus ${bonus}: warning ${f3(r.warn)} s, the crest starts ${f3(r.ahead)} u from you and rolls through you (h ${f3(r.h)})`);
      let passed = null;
      wb.run(10, (i) => {
        if (passed === null && wb.m.visuals().rogue.ahead <= 0) passed = (i + 1) * DT;
      });
      check(passed !== null && passed >= 4 + bonus, `bonus ${bonus}: it reaches you ${f3(passed)} s after the horn, after the whole warning`);
    }

    // The angle a between her heading and the wave's travel decides.
    const travel = -Math.PI / 2;
    const cases = [
      [0, 'surf'],
      [49, 'surf'],
      [-49, 'surf'],
      [50, 'side'],
      [90, 'side'],
      [-90, 'side'],
      [130, 'side'],
      [-130, 'side'],
      [131, 'ride'],
      [180, 'ride'],
    ];
    const got = [];
    let pushOk = true;
    let wobbleOk = true;
    let surfOk = true;
    let douseOk = true;
    for (const [deg, wantKind] of cases) {
      const me = ship('player', 0, 0, wrap(travel + deg * RAD), { status: { id: 'fire', t: 5, max: 6, immune: 0 } });
      const wa = world({ player: me });
      wa.m.wave(Math.PI / 2);
      let hitAt = null;
      wa.run(6, (i) => {
        if (hitAt === null && wa.log.pop.length) hitAt = i;
        return hitAt === null;
      });
      const words = wa.log.pop.map((x) => x.text);
      const dmg = wa.log.damage.reduce((n, d) => n + d.amount, 0);
      const kind = words.includes("SURF'S UP!") ? 'surf' : words.includes('RODE IT!') ? 'ride' : words.includes('SPLASH!') ? 'side' : '?';
      got.push(`${deg}°:${kind}${dmg ? '/' + dmg : ''}`);
      if (kind !== wantKind || (kind === 'side' ? dmg !== 10 || wa.log.damage[0].source !== 'rogue' : dmg !== 0)) got.push('<-wrong');
      if (wa.log.douse.length !== 1) douseOk = false;
      // the push: 6 u along the travel over 0.5 s; the wobble: turn ×0.5 for 1 s; the surf: +2 for 2 s
      let moved = 0;
      let wob = 0;
      let surfT = 0;
      wa.runPre(3, () => {
        const d = wa.m.drift(me);
        if (d) moved += Math.hypot(d.vx, d.vz) * DT;
        if (d && !(d.vx < 0 && near(d.vz, 0, 1e-9))) pushOk = false;
        const mods = wa.m.shipMods(me);
        if (mods.turnMul === 0.5) wob += DT;
        if (mods.capAdd === 2) surfT += DT;
      });
      if (kind === 'side' && (!near(moved, 6, 1e-6) || !near(wob, 1, DT / 2))) wobbleOk = false;
      if (kind !== 'side' && (moved !== 0 || wob !== 0)) wobbleOk = false;
      if (kind === 'surf' && !near(surfT, 2, DT / 2)) surfOk = false;
      if (kind !== 'surf' && surfT !== 0) surfOk = false;
    }
    check(!got.includes('<-wrong'), `a < 50° surfs, 50°–130° takes 10 (SPLASH!), > 130° rides (${got.join(' ')})`);
    check(pushOk && wobbleOk, 'side-on: pushed exactly 6 u along the travel over 0.5 s, then wobbles (turn ×0.5) for 1 s; nobody else is pushed');
    check(surfOk, "SURF'S UP!: +2 to the speed cap for 2 s, nobody else");
    check(douseOk, 'every wave puts her fire out, whatever her angle');

    // Pirates take it the same way; bosses turn their bow into it; the crest's ends spare ships beyond them.
    const me = ship('player', 0, 0, 0);
    const pir = ship('corsair', -30, 0, 0); // side-on, on the crest's path
    const far = ship('corsair', -30, 90, 0); // beyond the crest's end (60 u off its middle)
    const boss = ship('inkheart', -20, 30, 0); // (90 u ahead of the crest: within ROGUE.bowIn)
    const wp = world({ player: me, enemies: [pir, far, boss] });
    wp.m.init();
    wp.m.wave(Math.PI / 2);
    const st = wp.m.steer(boss, DT);
    check(st && near(st.h, wrap(Math.PI / 2)), `a boss turns her bow into a rogue wave rolling at her (${st && f3(st.h)})`);
    wp.run(12);
    check(wp.log.damage.filter((d) => d.s === pir).length === 1 && wp.log.damage.every((d) => d.s !== far), 'pirates take a wave the same way; a ship beyond the crest\'s 120 u is missed');
    const mm = wp.m.minimap();
    check(wp.m.visuals().rogue === null || mm.some((k) => k.kind === 'rogue'), 'the wave is on the minimap while it rolls');
    wp.run(40);
    check(wp.m.visuals().rogue === null, 'and gone once its crest has left the sea');
  }

  // ---------------------------------------------------------------- the Shark Raider's ram
  function ramSetup({ frost = false, dist = 20, off = 0, grace = 0 } = {}) {
    const p = ship('player', 0, 0, 0);
    const shark = ship('shark', Math.sin(off) * dist, Math.cos(off) * dist, Math.PI, frost ? { status: { id: 'frost', t: 30, max: 30, immune: 0 } } : {});
    // (she faces -z: you are dead ahead of her bow; `off` moves you off it)
    shark.h = Math.atan2(-shark.x, -shark.z) + off;
    const w = world({ player: p, enemies: [shark], def: { grace } });
    w.m.init();
    return { w, p, shark };
  }
  // A tiny sea for the charge: she sails as steer() says (instant turns), you sit still.
  function sail(w, e) {
    const s = w.m.steer(e, DT);
    if (s) e.h = s.h;
    const d = w.m.drift(e);
    e.x += Math.sin(e.h) * e.speed * DT + (d ? d.vx * DT : 0);
    e.z += Math.cos(e.h) * e.speed * DT + (d ? d.vz * DT : 0);
  }
  {
    const { w, p, shark } = ramSetup();
    shark.speed = 10;
    w.m.step(DT);
    check(w.m.state.rams[0].phase === 'windup' && pops(w, 'RAM!').length === 1 && w.log.sfx.some((s) => s.name === 'ram') && w.log.announce.some((t) => /RAM!/.test(t)), 'within 25 u and dead ahead of her bow: the wind-up starts with a RAM! pop, her growl and a #game-live line');
    const vr = w.m.visuals().rams[0];
    check(vr && vr.state === 'windup' && vr.id === shark.id && near(vr.T, 1.5), `visuals().rams carries her id for the tag's RAM chevrons (${JSON.stringify(vr)})`);
    let surgeAt = null;
    let windSpeed = null;
    w.run(2, (i) => {
      const st = w.m.state.rams[0];
      if (st.phase === 'windup') windSpeed = w.m.steer(shark, DT).speed;
      if (surgeAt === null && st.phase === 'surge') surgeAt = (i + 1) * DT;
      return surgeAt === null;
    });
    check(surgeAt !== null && near(surgeAt, 1.5, 2 * DT) && near(windSpeed, 13 * RAM.windupSpeed), `the surge comes only after the 1.5 s wind-up (${f3(surgeAt)} s; she lines up at ${f3(windSpeed)} u/s)`);
    const st = w.m.steer(shark, DT);
    const mods = w.m.shipMods(shark);
    check(shark.speed === 16 && st.speed === 16 && near(st.h, Math.atan2(p.x - shark.x, p.z - shark.z)) && mods.capAdd === 3, `the surge: 16 u/s (her cap raised by ${mods.capAdd}) on a heading locked on where you were`);
    let hitAt = null;
    w.run(2, (i) => {
      sail(w, shark);
      if (hitAt === null && w.log.damage.length) hitAt = i;
      return hitAt === null;
    });
    const you = w.log.damage.find((d) => d.s === p);
    const her = w.log.damage.find((d) => d.s === shark);
    const gap = Math.hypot(shark.x - p.x, shark.z - p.z);
    check(you && you.amount === 10 && you.source === 'ram' && her && her.amount === 8 && pops(w, 'CRUNCH!').length === 1, `hull contact at full surge: you take 10, she takes 8, CRUNCH! (${you && you.amount} / ${her && her.amount}, centres ${f3(gap)} < ${f3((8 + 10) * 0.36)})`);
    const dp = w.m.drift(p);
    const ds = w.m.drift(shark);
    check(dp && ds && near(Math.hypot(dp.vx, dp.vz), 4) && near(dp.vx + ds.vx, 0) && near(dp.vz + ds.vz, 0) && dp.vz < 0, `both are pushed apart at 4 u/s (${JSON.stringify(dp)})`);
    let pushT = 0;
    w.runPre(1, () => {
      if (w.m.drift(p)) pushT += DT;
    });
    check(near(pushT, 0.6, DT / 2), `for 0.6 s (${f3(pushT)})`);
    // Cooldown 6 s: you stay dead ahead of her bow, and the next wind-up waits.
    shark.x = 0;
    shark.z = 20;
    shark.h = Math.PI;
    let again = null;
    w.run(8, (i) => {
      if (again === null && w.m.state.counts.windups === 2) again = 1 + (i + 1) * DT;
    });
    check(again !== null && again >= 6 - 2 * DT && again <= 6 + 2 * DT, `the next charge only after the 6 s cooldown (${f3(again)} s after the crunch)`);
  }
  {
    // Frost halves the surge, and so the hit.
    const { w, p, shark } = ramSetup({ frost: true });
    w.run(1.5 + 2 * DT);
    const sp = shark.speed;
    const cap = w.m.shipMods(shark).capAdd;
    w.run(3, () => {
      sail(w, shark);
      return !w.log.damage.length;
    });
    const you = w.log.damage.find((d) => d.s === p);
    check(sp === 8 && you && you.amount === 5 && cap === 3, `frost halves the surge (8 u/s) and the hit (${you && you.amount})`);
  }
  {
    // A missed charge: she surges 2 s and gives up; contact damage scales with speed.
    const { w, shark } = ramSetup();
    w.run(1.5 + 2 * DT);
    shark.x += 50; // (you dodged)
    let surge = 0;
    w.run(4, () => {
      if (w.m.state.rams[0].phase === 'surge') surge += DT;
    });
    check(near(surge, 2, 3 * DT) && w.log.damage.length === 0 && w.m.state.rams[0].phase === 'cool', `turned away: the surge runs out after 2 s, no hit (${f3(surge)})`);
  }
  {
    // Stink cancels the charge; out of reach or off her bow, or no attack slot, or the grace: no charge.
    const { w, shark } = ramSetup();
    w.run(0.5);
    shark.status = { id: 'stink', t: 4, max: 4, immune: 0 };
    w.m.step(DT);
    w.run(3, () => sail(w, shark));
    check(w.m.state.rams[0].phase === 'cool' && w.log.damage.length === 0 && shark.speed === 0, 'stink cancels a wind-up: no surge, no hit');
    const r26 = ramSetup({ dist: 26 });
    r26.w.run(2);
    const cone = ramSetup({ off: 0.4 });
    cone.w.run(2);
    const coneIn = ramSetup({ off: 0.34 });
    coneIn.w.run(0.1);
    const slot = ramSetup();
    slot.w.attacking = () => false;
    slot.w.run(2);
    const gr = ramSetup({ grace: 4 });
    let early = false;
    gr.w.run(3.9, () => {
      if (gr.w.m.state.counts.windups) early = true;
    });
    gr.w.run(0.2);
    check(
      r26.w.m.state.counts.windups === 0 && cone.w.m.state.counts.windups === 0 && coneIn.w.m.state.counts.windups === 1 && slot.w.m.state.counts.windups === 0 && !early && gr.w.m.state.counts.windups === 1,
      'no charge from 26 u, from 0.4 rad off her bow, without an attack slot, or in the level\'s grace; one at 0.34 rad'
    );
  }

  // ---------------------------------------------------------------- the Bomb Ketch's mortar
  {
    const lobsAt = (dist, seconds = 20, setup) => {
      const p = ship('player', 0, 0, 0);
      const k = ship('bombketch', 0, dist, Math.PI / 2);
      const w = world({ player: p, enemies: [k], rng: mulberry32(9) });
      if (setup) setup(w, p, k);
      w.m.init();
      w.run(seconds);
      return w;
    };
    const counts = [24, 25, 36, 48, 49].map((d) => lobsAt(d).log.bombs.length);
    check(counts[0] === 0 && counts[1] > 0 && counts[2] > 0 && counts[3] > 0 && counts[4] === 0, `she lobs only with you 25–48 u away (24: ${counts[0]}, 25: ${counts[1]}, 36: ${counts[2]}, 48: ${counts[3]}, 49: ${counts[4]})`);
    const w = lobsAt(36, 200);
    const at = w.log.bombs.map((b) => b.at);
    const gaps = at.slice(1).map((t, i) => t - at[i]);
    check(at[0] >= 6 - DT && at[0] <= 8 + DT && gaps.length >= 20 && gaps.every((g) => g >= 6 - 2 * DT && g <= 8 + 2 * DT) && new Set(gaps.map((g) => g.toFixed(2))).size > 3, `every 6–8 s by ctx.rng (first ${f3(at[0])}, gaps ${f3(Math.min(...gaps))}–${f3(Math.max(...gaps))})`);
    const b = w.log.bombs[0];
    check(b.kind === 'shell' && b.radius === 4.5 && b.damage === 12 && b.warn === 2.2 && b.from && b.from.x === 0 && b.from.z === 36, `a shell from her deck: ring 4.5, 12 damage, a 2.2 s warning (main adds the Lighthouse) (${JSON.stringify(b)})`);
    check(w.log.sfx.filter((s) => s.name === 'mortar').length === w.log.bombs.length && w.log.banner.filter((x) => /Mortar shell!/.test(x.html)).length === 1, 'each shell thoomps (`mortar`); the banner "Mortar shell! Steer out of the orange circle" shows the first time');
    const sv = w.m.visuals().shells;
    check(sv.length <= 1 && sv.every((s) => s.kind === 'shell' && s.r === 4.5 && near(s.T, 2.2)), 'shells in the air show in visuals().shells with their warning time');
    // Lead: 0.8 of the shell's flight along your turn's arc.
    const lead = lobsAt(36, 8, (wl, p) => {
      p.speed = 10;
      wl.warn = 0.3;
    });
    const L = lead.log.bombs[0];
    check(L && near(L.tx, 0, 1e-9) && near(L.tz, 10 * 0.8 * 2.5, 1e-9), `sailing straight at 10 u/s: aimed 0.8 × (2.2 + 0.3) s ahead (${L && f3(L.tz)} u)`);
    const arc = lobsAt(36, 8, (wl, p) => {
      p.speed = 10;
      wl.turn = 1;
      wl.turnRate = 0.5;
    });
    const A = arc.log.bombs[0];
    const tt = 0.8 * 2.2;
    const wv = 0.5;
    const ax = (10 / wv) * (Math.cos(0) - Math.cos(wv * tt));
    const az = (10 / wv) * (Math.sin(wv * tt) - Math.sin(0));
    check(A && near(A.tx, ax, 1e-9) && near(A.tz, az, 1e-9), `turning: aimed along playerTurn()'s arc (${A && f3(A.tx)}, ${A && f3(A.tz)})`);
    // Stink pauses her mortar: a 4 s stink pushes the first shell back by 4 s.
    const plain = lobsAt(36, 20);
    const stinky = lobsAt(36, 20, (wl, p, k) => {
      k.status = { id: 'stink', t: 4, max: 4, immune: 0 };
      const step = wl.m.step;
      let left = 4;
      wl.m.step = (dt) => {
        step(dt);
        left -= dt;
        if (left <= 0) k.status = { id: null, t: 0, max: 0, immune: 0 };
      };
    });
    check(near(stinky.log.bombs[0].at - plain.log.bombs[0].at, 4, 3 * DT), `stink pauses her mortar (the shell comes ${f3(stinky.log.bombs[0].at - plain.log.bombs[0].at)} s later)`);
    // Her course: away inside 20, opening the range inside 35, crossing in the band, closing beyond 45.
    const p = ship('player', 0, 0, 0);
    const k = ship('bombketch', 0, 15, 0);
    const wk = world({ player: p, enemies: [k] });
    wk.m.init();
    const course = (d) => {
      k.z = d;
      return wk.m.steer(k, DT);
    };
    const c15 = course(15);
    const c30 = course(30);
    const c40 = course(40);
    const c60 = course(60);
    check(near(c15.h, 0) && c15.speed === 6.5, `inside 20 u she runs straight away (${JSON.stringify(c15)})`);
    check(Math.abs(wrap(c30.h - 0)) <= MORTAR.slant + 1e-9 && Math.abs(wrap(c30.h)) > 0 && c30.speed === 6.5, `inside 35 u she opens the range (${JSON.stringify(c30)})`);
    check(near(Math.abs(wrap(c40.h)), Math.PI / 2) && near(c40.speed, 6.5 * MORTAR.cruise), `35–45 u: she crosses your bearing (${JSON.stringify(c40)})`);
    check(near(Math.abs(c60.h), Math.PI) && c60.speed === 6.5, `beyond 45 u she closes in (${JSON.stringify(c60)})`);
    wk.attacking = () => false;
    check(wk.m.steer(k, DT) === null, 'without an attack slot she waits like any pirate (steer null)');
  }

  // ---------------------------------------------------------------- the Fire Ship
  function fireSetup({ dist = 29, others = [] } = {}) {
    const p = ship('player', 0, 0, 0);
    const f = ship('fireship', 0, dist, Math.PI);
    const w = world({ player: p, enemies: [f, ...others] });
    w.m.init();
    return { w, p, f };
  }
  {
    const far = fireSetup({ dist: 30.5 });
    far.w.run(1);
    const at30 = fireSetup({ dist: 30 });
    at30.w.m.step(DT);
    check(far.w.m.state.counts.lit === 0 && at30.w.m.state.counts.lit === 1 && at30.w.log.sfx.some((s) => s.name === 'fuse'), 'she is lit within 30 u (not at 30.5), with her fuse hiss');
    check(at30.w.log.banner.filter((b) => /Fire ship!/.test(b.html)).length === 1, 'the first time: the banner "Fire ship! Sink her or freeze her before she reaches you!"');
    const st = at30.w.m.steer(at30.f, DT);
    check(st && near(st.h, Math.PI) && st.speed === 11.5 && at30.w.m.holdFire(at30.f) === true, `she sails straight at you at full speed and never fires (${JSON.stringify(st)})`);
    const ring = at30.w.m.visuals().fireRings[0];
    check(ring && ring.r === 6 && ring.id === at30.f.id && ring.armed === false && near(ring.T, 1.6), `a lit fire ship has a red danger ring of r 6 (${JSON.stringify(ring)})`);
    // Never a blast before 1.6 s lit, even touching you.
    const { w, p, f } = fireSetup();
    w.m.step(DT);
    f.z = 6;
    let early = null;
    let boomAt = null;
    w.run(2, (i) => {
      if (w.log.explode.length && boomAt === null) boomAt = (i + 1) * DT;
      if (boomAt === null && w.m.visuals().fireRings[0]?.armed) early = early ?? (i + 1) * DT;
    });
    check(boomAt !== null && boomAt >= 1.6 - DT && near(boomAt, 1.6, 2 * DT), `touching you from the moment she is lit, she blows only once armed, 1.6 s later (${f3(boomAt)} s)`);
    const youHit = w.log.damage.find((d) => d.s === p);
    check(youHit && youHit.source === 'fireship' && f.exploded === true && f.sinking > 0 && w.log.explode[0].r === 6 && w.log.explode[0].dmg === 22 && pops(w, 'BOOM!').length === 1, `the blast: ctx.explode for the look and sound, damage to you, and she is gone with e.exploded set (no coins) (${youHit && youHit.amount})`);
  }
  {
    // The falloff: 22 at her centre to 11 at r 6 (measured to each hull), to every ship, pirates too.
    const mk = (d) => ship('privateer', d + 3.3 / 2, 0, 0); // hull side d u from x = 0
    const ps = [mk(0), mk(3), mk(6), mk(6.5)];
    const p = ship('player', 0, -40, 0);
    const f = ship('fireship', 0, 0, Math.PI / 2);
    const w = world({ player: p, enemies: [f, ...ps] });
    w.m.init();
    w.m.onSink(f); // (not lit: she just sinks)
    check(w.log.explode.length === 0, 'sunk before she is lit: she sinks normally, no blast');
    const f2 = ship('fireship', 0, 0, Math.PI / 2);
    const w2 = world({ player: ship('player', 0, 25), enemies: [f2, ...[0, 3, 6, 6.5].map(mk)] });
    w2.m.init();
    w2.m.step(DT); // lit (you are 25 u off)
    f2.hp = 0;
    f2.sinking = 0.001;
    w2.m.onSink(f2); // sunk while lit
    const dm = w2.enemies.slice(1).map((s) => w2.log.damage.filter((d) => d.s === s).reduce((n, d) => n + d.amount, 0));
    check(w2.log.explode.length === 1 && f2.exploded === true && same(dm, [22, 17, 11, 0]), `sunk while lit: she explodes where she is; hulls 0 / 3 / 6 / 6.5 u off take ${dm.join(' / ')} (22 → 11 at r 6)`);
  }
  {
    // Armed, with her centre within 4 u of any hull (a pirate's too): 3.9 blows, 4.1 doesn't. (A privateer astern
    // of her, both heading east: her hull's end is 4.75 u from her own centre, so x = 8.65 puts it 3.9 u from the
    // fire ship's centre; their centres stay apart, not touching.)
    const make = (x) => {
      const p = ship('player', 0, -25, 0);
      const f = ship('fireship', 0, 0, Math.PI / 2);
      const o = ship('privateer', x, 0, Math.PI / 2);
      const w = world({ player: p, enemies: [f, o] });
      w.m.init();
      w.run(1.7);
      return { w, o };
    };
    const yes = make(8.65);
    const no = make(8.85);
    const hit = yes.w.log.damage.filter((d) => d.s === yes.o).reduce((n, d) => n + d.amount, 0);
    check(yes.w.log.explode.length === 1 && no.w.log.explode.length === 0 && hit === 15, `armed, she explodes with her centre within 4 u of any hull (a pirate's too: 3.9 yes, 4.1 no), and that ship is inside her ring (${hit} damage)`);
  }
  {
    // Whatever side she comes at you from, she blows when she reaches you and you feel it (13–22): main's
    // separateShips holds centres (len_a + len_b) × 0.36 = 6.3 u apart, so alongside your hull is 4.5 u from her
    // centre; touching counts too. (Each run: she sails straight at you, held off like main holds her.)
    const runs = [];
    for (const [name, fx, fz] of [['your beam', 25, 0], ['your bow', 0, 25], ['your stern', 0, -25], ['your quarter', 18, -18]]) {
      const p = ship('player', 0, 0, 0);
      const f = ship('fireship', fx, fz, Math.atan2(-fx, -fz));
      const w = world({ player: p, enemies: [f] });
      w.m.init();
      let gapAtBoom = null;
      w.run(6, () => {
        f.speed = w.m.steer(f, DT)?.speed ?? f.speed; // (at full speed, as main's accel gets her there)
        sail(w, f);
        const d = Math.hypot(f.x - p.x, f.z - p.z);
        const min = (10 + 7.5) * 0.36;
        if (d < min) {
          f.x = p.x + ((f.x - p.x) / d) * min;
          f.z = p.z + ((f.z - p.z) / d) * min;
        }
        if (w.log.explode.length && gapAtBoom === null) gapAtBoom = d;
        return !w.log.explode.length;
      });
      const hurt = w.log.damage.filter((d) => d.s === p).reduce((n, d) => n + d.amount, 0);
      runs.push({ name, hurt, d: gapAtBoom });
    }
    check(runs.every((r) => r.d !== null && r.hurt >= 13 && r.hurt <= 22), `from ${runs.map((r) => `${r.name}: ${r.hurt} at ${f3(r.d)} u`).join(', ')} (centres): she always blows when she reaches you, and you are inside her ring`);
    // Held alongside by the separation (your hull 4.5 u from her centre, centres 6.3 apart): she still blows.
    const p = ship('player', 0, 0, 0);
    const f = ship('fireship', 6.3, 0, -Math.PI / 2);
    const w = world({ player: p, enemies: [f] });
    w.m.init();
    w.run(1.7);
    const hurt = w.log.damage.filter((d) => d.s === p).reduce((n, d) => n + d.amount, 0);
    check(w.log.explode.length === 1 && hurt === 14, `alongside, held 6.3 u off by the separation, she blows once armed: ${hurt} damage (22 − 11 × 4.5 / 6)`);
  }
  {
    // Frost: her fuse is out for good; she strikes and never explodes.
    const { w, p, f } = fireSetup();
    w.m.step(DT);
    f.status = { id: 'frost', t: 2.5, max: 2.5, immune: 0 };
    w.m.step(DT);
    f.z = 5;
    w.run(4);
    check(w.log.surrender.includes(f) && w.log.explode.length === 0 && w.log.damage.length === 0 && pops(w, 'GIVES UP!').length === 1 && w.log.banner.some((b) => /The fire ship gives up!/.test(b.html)), 'frost puts her fuse out: she strikes her colours ("The fire ship gives up!") and never explodes, even alongside you');
    check(w.m.steer(f, DT) === null && w.m.visuals().fireRings.length === 0 && near(w.m.shipMods(f).speedMul * 11.5, 3), `she sails no faster than 3 u/s and her ring is gone (${f3(w.m.shipMods(f).speedMul * 11.5)})`);
    f.hp = 0;
    f.sinking = 0.001;
    w.m.onSink(f);
    check(w.log.explode.length === 0, 'sunk after the frost: no blast');
    check(p.hp === SHIP_TYPES.player.hp, 'and you never took a scratch');
  }

  // ---------------------------------------------------------------- the Inkheart's ink pots and slicks
  {
    const p = ship('player', 0, 0, 0, { speed: 6 });
    const ink = ship('inkheart', 30, 20, 0);
    const w = world({ player: p, enemies: [ink], rng: mulberry32(21) });
    w.m.init();
    w.run(35);
    const at = [...new Set(w.log.bombs.map((b) => b.at.toFixed(4)))].map(Number);
    check(at.length === 3 && near(at[0], 10, 2 * DT) && near(at[1] - at[0], 10, 2 * DT) && w.log.bombs.length === 6, `2 ink pots every 10 s (${w.log.bombs.length} pots at ${at.map(f3).join(', ')})`);
    const b = w.log.bombs[0];
    check(w.log.bombs.every((x) => x.kind === 'ink' && x.radius === 4 && x.damage === 8 && x.warn === 1.8), `each pot: ring 4, 8 damage, a 1.8 s warning (${JSON.stringify(b)})`);
    // aimed at your predicted spot ± 6 u (you sail straight on at 6 u/s; the flight is 1.8 s)
    const scatterOk = w.log.bombs.every((x) => Math.hypot(x.tx - 0, x.tz - 6 * 1.8) <= 6 + 1e-6) && w.log.bombs.some((x) => Math.hypot(x.tx, x.tz - 6 * 1.8) > 1);
    check(scatterOk && w.log.sfx.filter((s) => s.name === 'ink').length === 3, 'aimed at your predicted spot ±6 u, with the ink "pthoo"');
    // Stink: her ink waits.
    const w2 = world({ player: ship('player', 0, 0), enemies: [ship('inkheart', 30, 0, 0, { status: { id: 'stink', t: 99, max: 99, immune: 0 } })] });
    w2.m.init();
    w2.run(30);
    check(w2.log.bombs.length === 0, 'a stinky Inkheart lobs no ink');

    // Slicks: at most 3 (the oldest goes), speed ×0.6 inside, INKY! once per entry, 6 s each.
    const s = ship('cutter', 100, 100);
    const w3 = world({ player: ship('player', -100, -100), enemies: [s] });
    w3.m.addSlick(0, 0);
    w3.m.addSlick(20, 0);
    w3.m.addSlick(40, 0);
    w3.m.addSlick(60, 0);
    const v = w3.m.visuals().slicks;
    check(v.length === 3 && same(v.map((k) => k.x), [20, 40, 60]) && v.every((k) => k.r === 7 && k.T === 6), `at most 3 slicks: the oldest goes (${JSON.stringify(v.map((k) => k.x))})`);
    s.x = 22;
    s.z = 3;
    const mods = w3.m.shipMods(s);
    s.x = 30;
    const outside = w3.m.shipMods(s);
    check(near(mods.speedMul, 0.6) && outside.speedMul === 1, `a ship whose centre is in a slick has her speed cap ×0.6 (${mods.speedMul} / ${outside.speedMul})`);
    s.x = 20;
    w3.run(0.5);
    s.x = 30;
    w3.run(0.5);
    s.x = 40;
    w3.run(0.5);
    s.x = 42;
    w3.run(0.5);
    check(pops(w3, 'INKY!').length === 2, `INKY! once per entry (${pops(w3, 'INKY!').length} for two entries)`);
    w3.run(4.1);
    check(w3.m.visuals().slicks.length === 0 && w3.m.shipMods(s).speedMul === 1, 'slicks last 6 s');
    check(w3.m.minimap().length === 0, 'and leave the minimap with them');
  }

  // ---------------------------------------------------------------- the flagship's fall
  {
    const p = ship('player', 0, 0);
    const inkh = ship('inkheart', 20, 0);
    const sk = ship('skiff', -30, 10);
    const iron = ship('ironclad', 40, 40);
    const struck = ship('corsair', 10, -30, 0, { surrendered: true });
    const held = ship('skiff', 5, 5, 0, { boarded: true }); // a boarding holds her (not fighting, not struck)
    const shark = ship('shark', 0, 20, Math.PI);
    const w = world({ ids: ['flagship'], player: p, enemies: [inkh, sk, iron, struck, held, shark] });
    w.m.init();
    w.m.addSlick(50, 50);
    w.run(1.4); // (the shark winds up: the fall calls it off)
    check(w.m.krakenDue === false && w.m.state.flagship.fallen === false, 'nothing is due while the flagship sails');
    inkh.hp = 0;
    inkh.sinking = 0.001;
    w.m.onSink(inkh);
    check(same(w.log.flee.map((e) => e.typeName), ['skiff', 'ironclad', 'shark']) && same(w.log.capture, [struck]) && w.log.banner.some((b) => b.html === 'The Kraken Crew flee!') && w.log.announce.includes('The Kraken Crew flee!'), `the Inkheart falls: every other fighting ship flees, struck ships are taken, "The Kraken Crew flee!" (${w.log.flee.map((e) => e.typeName)})`);
    const st = w.m.steer(iron, DT);
    check(st && near(st.h, Math.atan2(40, 40)) && st.speed === 7 && w.m.shipMods(iron).capAdd === 1 && w.m.holdFire(iron) === true && w.m.state.rams.find((r) => r.type === 'shark').phase !== 'surge', `a fleeing ship makes for the nearest world edge at 7 u/s and holds her fire (${JSON.stringify(st)})`);
    check(w.m.visuals().slicks[0].T <= w.m.visuals().slicks[0].t + INK.slick.fade + 1e-9, 'the ink slicks fade');
    check(w.m.krakenDue === false, 'krakenDue waits while ships still flee and a boarding holds one');
    w.run(2);
    held.boarded = false; // the boarding ends: she is free, and flees too
    w.m.step(DT);
    check(w.log.flee.includes(held), 'a ship a boarding held flees once it comes free');
    w.run(2.85);
    const before = w.log.escape.length;
    w.run(0.15);
    check(before === 0 && w.log.escape.length === 3 && [sk, iron, shark].every((e) => e.escaped) && !held.escaped, `5 s on (not before), the first to flee are gone (ctx.escape: foam, no loot) (${before} at 4.86 s, ${w.log.escape.length} at 5.01 s)`);
    check(w.m.krakenDue === false, 'not due while the last one still flees');
    w.run(2.1);
    w.boarding = true;
    check(held.escaped === true && w.m.krakenDue === false, 'not due while a boarding is running');
    w.boarding = false;
    check(w.m.krakenDue === true && w.m.state.flagship.due === true, 'due once the boarding is over, the struck ships are taken and the crew are gone');
    // No 'flagship' id: the Inkheart is just a boss.
    const w2 = world({ player: ship('player', 0, 0), enemies: [ship('inkheart', 20, 0), ship('skiff', -30, 10)] });
    w2.m.init();
    w2.m.onCapture(w2.enemies[0]);
    w2.run(1);
    check(w2.log.flee.length === 0 && w2.m.krakenDue === false, 'without the flagship id her capture is just a capture');
    // Captured, not sunk: the same fall.
    const w3 = world({ ids: ['flagship'], player: ship('player', 0, 0), enemies: [ship('inkheart', 20, 0), ship('skiff', -30, 10)] });
    w3.m.init();
    w3.enemies[0].captured = true;
    w3.m.onCapture(w3.enemies[0]);
    w3.run(5.1);
    check(w3.log.flee.length === 1 && w3.m.krakenDue === true, 'captured, she falls the same way');
  }

  // ---------------------------------------------------------------- hold: the hazards wait
  {
    const p = ship('player', 0, 0);
    const shark = ship('shark', 0, 20, Math.PI);
    const w = world({ ids: ['spouts', 'rogue'], env: { spoutLoops: LOOPS, rogueDirs: [1] }, player: p, enemies: [shark] });
    w.m.init();
    w.hold = true;
    w.run(40);
    check(w.m.state.hazardTime === 0 && w.m.visuals().spouts.every((s) => s.t === 0) && w.m.state.rogue.waves === 0 && w.m.state.counts.windups === 0, 'while ctx.hold() (the fly-in, a boarding truce) nothing forms, rolls, ticks or charges');
    w.hold = false;
    w.run(0.5);
    w.hold = true;
    w.m.step(DT);
    check(w.m.state.rams[0].phase === 'cool' && w.m.drift(shark) === null, 'a hold calls a charge off, and nothing drifts while it lasts');
  }

  // ---------------------------------------------------------------- determinism
  {
    const runOnce = (seed) => {
      nextId = 1000;
      const p = ship('player', 0, 0, 0, { speed: 8 });
      const enemies = [ship('shark', 0, 30, Math.PI), ship('bombketch', 40, 0, 0), ship('fireship', -40, 10, 0), ship('inkheart', 20, -40, 0)];
      const w = world({ ids: ['spouts', 'rogue', 'flagship'], env: { spoutLoops: LOOPS, rogueDirs: [1, 2, 4], worldRadius: 145 }, player: p, enemies, rng: mulberry32(seed) });
      w.m.init();
      w.run(120, (i) => {
        p.h = Math.sin(i * DT * 0.3);
        p.x += Math.sin(p.h) * p.speed * DT;
        p.z += Math.cos(p.h) * p.speed * DT;
        for (const e of enemies) if (!e.sinking) sail(w, e);
      });
      const bombs = w.log.bombs.map((b) => [b.kind, b.tx, b.tz, b.at]);
      return JSON.stringify({ st: w.m.state, bombs, v: w.m.visuals(), dmg: w.log.damage.map((d) => [d.amount, d.source]) });
    };
    const a = runOnce(42);
    const b = runOnce(42);
    const c = runOnce(43);
    check(a === b && a !== c, `the same seed gives the same 120 s (spouts, waves, shells, pots, rams, blasts), another seed another (${a.length} chars)`);
  }

  // ---------------------------------------------------------------- composeMechanics with a real createMechanics
  {
    const env = { current: { x: 0, z: 0, r: 75, pull: 3.2, swirl: 2.8, eye: 12, eyeDps: 5 }, spoutLoops: LOOPS, worldRadius: 145 };
    const p = ship('player', 0, 30);
    const e = ship('cutter', 20, 20);
    const w = world({ player: p, enemies: [e], env });
    const ids = ['current', 'spouts', 'flagship'];
    const a = createMechanics(ids, w.ctx);
    const b = createMechanics3(ids, w.ctx);
    const m = composeMechanics([a, b]);
    m.init();
    m.step(DT);
    const st = m.state;
    check(same(st.ids, ['current']) && 'current' in st && same(st.m3.ids, ['spouts', 'flagship']) && near(st.time, DT) && 'relocated' in st, `state keeps Act II's ids, current and time top-level, with Voyage III's under m3 (${Object.keys(st)})`);
    const all3 = composeMechanics([createMechanics(['convoy', 'floes', 'current', 'rogue'], w.ctx), createMechanics3(['convoy', 'floes', 'current', 'rogue'], w.ctx)]);
    all3.init();
    all3.step(DT);
    const s3 = all3.state;
    const plainA = createMechanics(['convoy', 'floes', 'current'], w.ctx);
    plainA.init();
    plainA.step(DT);
    const { m3, ...top } = s3;
    check(same(top, plainA.state) && same(m3.ids, ['rogue']), `with every Act II id: state is exactly createMechanics' own state (ids, convoy, floes, current, time, relocated) plus m3 (${Object.keys(s3)})`);
    const wc = world({ player: ship('player', 0, 0), enemies: [ship('galleon', 20, 20)], env: {}, def: { waves: [['galleon']] } });
    const mc = composeMechanics([createMechanics(['convoy'], { ...wc.ctx, types: SHIP_TYPES }), createMechanics3(['convoy'], wc.ctx)]);
    mc.init();
    const ac = createMechanics(['convoy'], { ...wc.ctx, types: SHIP_TYPES });
    ac.init();
    check(typeof mc.objective() === 'string' && mc.objective() === ac.objective(), `objective(): a's string unchanged when b's is null ("${mc.objective()}")`);
    const da = a.drift(e);
    const sp = b.spout(e.x - 5, e.z);
    for (let i = 0; i < 3.7 / DT; i++) b.step(DT);
    const dsum = m.drift(e);
    const db = b.drift(e);
    check(da && db && near(dsum.vx, da.vx + db.vx) && near(dsum.vz, da.vz + db.vz), `drift: the maelstrom's and the spout's summed (${JSON.stringify(dsum)})`);
    check(sp && same(m.visuals(), b.visuals()) && m.visuals().spouts.some((s) => s.id === sp.id), "visuals() are b's");
    b.addSlick(e.x, e.z);
    m.addSlick(p.x, p.z);
    check(near(m.shipMods(e).speedMul, 0.6) && b.state.slicks.length === 2, "addSlick() and shipMods() pass b's through");
    const plain = m.shipMods(ship('cutter', -140, 0));
    check(same(plain, { speedMul: 1, capAdd: 0, turnMul: 1, spin: 0 }), 'shipMods(): identity when neither has any');
    const fireship = ship('fireship', 0, 10, Math.PI);
    w.enemies.push(fireship);
    m.onSpawn(fireship, -1);
    check(m.holdFire(fireship) === true && m.steer(fireship, DT) !== null && m.krakenDue === false, "holdFire either, steer b's when a has none, krakenDue b's");
    check(m.avoid().length === a.avoid().length + b.avoid().length && same(m.avoid().slice(0, 1), a.avoid()), "avoid(): a's then b's");

    // The other rules of §11.1 with two fake parts (every hook answers, so each rule shows).
    const calls = [];
    const fake = (tag, o) => {
      const part = { ...o };
      for (const k of ['init', 'onSpawn', 'onCapture', 'onSink', 'onRemove', 'step', 'dispose']) part[k] = (...args) => calls.push(`${tag}.${k}(${args.length})`);
      return part;
    };
    const A = fake('a', {
      steer: (e) => (e === 'A' ? { h: 1, speed: 2 } : null),
      holdFire: (e) => e === 'A',
      drift: () => ({ vx: 1, vz: 2 }),
      avoid: () => [{ x: 1, z: 1, r: 1 }],
      shipMods: () => ({ speedMul: 0.5, capAdd: 1, turnMul: 0.8, spin: 0.5 }),
      objective: () => 'Galleons: 1 to go',
      minimap: () => [{ kind: 'gate' }],
      summary: () => ['a line'],
      bonus: () => 100,
      visuals: () => ({ mine: 'a' }),
      krakenDue: true,
      state: { ids: ['convoy'], convoy: { taken: 1 } },
    });
    const B = fake('b', {
      steer: () => ({ h: 3, speed: 4 }),
      holdFire: (e) => e === 'B',
      drift: () => ({ vx: 10, vz: 20 }),
      avoid: () => [{ x: 2, z: 2, r: 16 }],
      shipMods: () => ({ speedMul: 0.6, capAdd: 2, turnMul: 0.5, spin: 2 }),
      objective: () => 'Spouts: 2',
      minimap: () => [{ kind: 'spout' }],
      summary: () => ['b line'],
      bonus: () => 25,
      visuals: () => ({ mine: 'b' }),
      addSlick: (x, z) => calls.push(`b.addSlick(${x},${z})`),
      krakenDue: false,
      state: { ids: ['spouts'] },
    });
    const F = composeMechanics([A, B]);
    F.init();
    F.onSpawn('e', 1);
    F.onCapture('e');
    F.onSink('e');
    F.onRemove('e');
    F.step(DT);
    F.dispose();
    const order = ['init(0)', 'onSpawn(2)', 'onCapture(1)', 'onSink(1)', 'onRemove(1)', 'step(1)', 'dispose(0)'].flatMap((k) => [`a.${k}`, `b.${k}`]);
    check(same(calls, order), `init, onSpawn, onCapture, onSink, onRemove, step and dispose fan out to both, a first, with their arguments (${calls.length} calls)`);
    check(same(F.steer('A', DT), { h: 1, speed: 2 }) && same(F.steer('x', DT), { h: 3, speed: 4 }), "steer: a's when a steers, else b's");
    check(F.holdFire('A') === true && F.holdFire('B') === true && F.holdFire('x') === false, 'holdFire: either');
    check(same(F.drift('x'), { vx: 11, vz: 22 }), `drift: summed (${JSON.stringify(F.drift('x'))})`);
    const dA = composeMechanics([{ drift: () => ({ vx: 1, vz: 2 }) }, { drift: () => null }]).drift('x');
    const dB = composeMechanics([{ drift: () => null }, { drift: () => ({ vx: 3, vz: 4 }) }]).drift('x');
    const dN = composeMechanics([{ drift: () => null }, { drift: () => ({ vx: NaN, vz: 1 }) }]).drift('x');
    check(same(dA, { vx: 1, vz: 2 }) && same(dB, { vx: 3, vz: 4 }) && dN === null, `drift: either one alone passes through, null when both are null (${JSON.stringify([dA, dB, dN])})`);
    check(same(F.avoid(), [{ x: 1, z: 1, r: 1 }, { x: 2, z: 2, r: 16 }]) && same(F.minimap(), [{ kind: 'gate' }, { kind: 'spout' }]) && same(F.summary(), ['a line', 'b line']), "avoid, minimap and summary: a's then b's");
    check(F.bonus() === 125, `bonus: summed (${F.bonus()})`);
    check(F.objective() === 'Galleons: 1 to go · Spouts: 2', `objective: "a · b" when both have one ("${F.objective()}")`);
    const FB = composeMechanics([{ objective: () => null }, { objective: () => 'Spouts: 2' }]);
    const FA = composeMechanics([{ objective: () => 'Galleons: 1 to go' }, { objective: () => null }]);
    const FN = composeMechanics([{ objective: () => null }, { objective: () => null }]);
    check(FB.objective() === 'Spouts: 2' && FA.objective() === 'Galleons: 1 to go' && FN.objective() === null, "objective: b's alone when a's is null, a's unchanged when b's is null, null when both are");
    const sm = F.shipMods('x');
    check(near(sm.speedMul, 0.3) && sm.capAdd === 3 && near(sm.turnMul, 0.4) && sm.spin === 2.5, `shipMods: multipliers multiplied, adds added (${JSON.stringify(sm)})`);
    F.addSlick(4, 5);
    check(same(F.visuals(), { mine: 'b' }) && F.krakenDue === false && calls.includes('b.addSlick(4,5)'), "visuals, krakenDue and addSlick: b's (never a's)");
    check(same(F.state, { ids: ['convoy'], convoy: { taken: 1 }, m3: { ids: ['spouts'] } }), `state: a's state top-level plus m3: b's (${JSON.stringify(F.state)})`);
    // Missing and broken parts count as parts that do nothing.
    let junkErr = '';
    for (const parts of [undefined, null, [], [null, null], [5, 'x'], [{}, {}], [{ get state() { throw new Error('boom'); } }, { get krakenDue() { throw new Error('boom'); } }]]) {
      try {
        const J = composeMechanics(parts);
        J.init();
        J.step(DT);
        const out = { steer: J.steer('e', DT), hold: J.holdFire('e'), drift: J.drift('e'), avoid: J.avoid(), mods: J.shipMods('e'), obj: J.objective(), mm: J.minimap(), sum: J.summary(), bonus: J.bonus(), vis: J.visuals(), due: J.krakenDue, st: J.state };
        J.addSlick(1, 2);
        J.dispose();
        const want = { steer: null, hold: false, drift: null, avoid: [], mods: { speedMul: 1, capAdd: 0, turnMul: 1, spin: 0 }, obj: null, mm: [], sum: [], bonus: 0, vis: { spouts: [], rogue: null, slicks: [], rams: [], fireRings: [], shells: [] }, due: false, st: { m3: {} } };
        if (!same(out, want)) junkErr += ` ${JSON.stringify(parts)} -> ${JSON.stringify(out)}`;
      } catch (err) {
        junkErr += ` ${String(parts)}: ${err.message}`;
      }
    }
    check(junkErr === '', `missing, junk and throwing parts never throw and count as doing nothing${junkErr}`);
  }

  // ---------------------------------------------------------------- act3.js: the level definitions
  {
    const envStub = (name) => `const ${name} = { stub: '${name}', meta: { name: '${name}' } };`;
    const stub = (rel) =>
      fs
        .readFileSync(path.join(ROOT, rel), 'utf8')
        .replace(/^import \* as (\w+) from '\.\/env\/(\w+)\.js';$/gm, (_, name) => envStub(name));
    const src3 = stub('src/act3.js');
    check(!/^\s*import\s/m.test(src3), 'act3.js imports only the three env modules');
    const { ACT3_LEVELS, ACT3_TEASER } = await import(dataUrl(src3));
    const { ACT2_LEVELS } = await import(dataUrl(stub('src/act2.js')));
    check(Array.isArray(ACT3_LEVELS) && ACT3_LEVELS.length === 3, `ACT3_LEVELS has three levels (${ACT3_LEVELS?.length})`);
    check(ACT3_TEASER === '…but far to the south, something stirs in the deep.', 'ACT3_TEASER is §5.2\'s line');
    const WANT = [
      {
        env: 'atolls', difficulty: 'Daring', act: 3, stars: 7, scene: 'atolls',
        waves: [['shark', 'shark', 'corsair'], ['bombketch', 'shark', 'privateer']],
        nextWaveAt: 1, maxAttackers: 2, lead: 0.65, spreadMul: 0.95, grace: 4, enemyRake: 1, mechanics: ['spouts'], crates: 2, bonus: 1300,
        mechanic: 'Waterspouts! Keep clear of the twisters. Shark Raiders ram: turn away when they charge!',
        rumour: { title: 'The Turtle Atolls', lines: ['Shark Raiders charge bow first. Turn aside!', 'Frost shot takes the bite out of a charging shark.'], ammo: 'frost' },
        lockText: 'Beat the Phantom Galleon',
      },
      {
        env: 'cape', difficulty: 'Fearsome', act: 3, stars: 8, scene: 'cape',
        waves: [['ironclad', 'bombketch', 'corsair'], ['fireship', 'ironclad', 'fireship']],
        nextWaveAt: 1, maxAttackers: 3, lead: 0.7, spreadMul: 0.9, grace: 3, enemyRake: 1, mechanics: ['rogue'], crates: 2, bonus: 1600,
        mechanic: 'Rogue waves! Turn your bow or stern to them. Iron Turtles: hit their bow or stern!',
        rumour: { title: 'The Cape of Storms', lines: ['Iron Turtles shrug off a broadside. Rake them, or set them alight!', 'Freeze a fire ship and she gives up.'], ammo: 'fire' },
      },
      {
        env: 'deep', difficulty: 'Mythic', act: 3, stars: 9, scene: 'deep',
        waves: [['skiff', 'skiff', 'ironclad'], ['inkheart', 'skiff']],
        nextWaveAt: 0, maxAttackers: 3, lead: 0.7, spreadMul: 0.9, grace: 3, enemyRake: 1, mechanics: ['flagship'],
        bombs: { kind: 'geyser', every: [6, 9], spread: 8, radius: 4.5, damage: 10, warn: [1.8, 2.2] },
        kraken: true, crates: 2, bonus: 2500, finale: true,
        finaleText: 'The Kraken is driven back to the deep, and the Seven Seas are safe! You are the Kraken Tamer!',
        victoryLine: 'The seas are yours',
        mechanic: 'The Kraken Crew guards the Deep. Beat their flagship… if you dare!',
        rumour: { title: "The Kraken's Deep", lines: ["The Inkheart flies the Kraken Crew's flag.", 'If the Kraken grabs you, stink shot makes it let go!'], ammo: 'stink' },
      },
    ];
    WANT.forEach((want, i) => {
      const lv = ACT3_LEVELS[i] || {};
      const wrong = Object.keys(want).filter((k) => (k === 'env' ? lv.env?.stub !== want.env : !same(lv[k], want[k])));
      check(wrong.length === 0, `level ${i + 7} (${want.difficulty}): every §5.${i + 4} field exact${wrong.length ? ' -> wrong: ' + wrong.map((k) => `${k} ${JSON.stringify(k === 'env' ? lv.env?.stub : lv[k])}`).join('; ') : ''}`);
    });
    check(ACT3_LEVELS.filter((l) => l.finale).length === 1 && ACT3_LEVELS[2].finale === true && ACT3_LEVELS[2].kraken === true && !ACT3_LEVELS[0].kraken && !ACT3_LEVELS[1].kraken, "only The Kraken's Deep is a finale, and the Kraken rises there only");
    check(ACT3_LEVELS[0].lockText === 'Beat the Phantom Galleon' && !('lockText' in ACT3_LEVELS[1]) && !('lockText' in ACT3_LEVELS[2]), 'card 7 says "Beat the Phantom Galleon"; cards 8 and 9 read "Locked"');
    const act2Keys = Object.keys(ACT2_LEVELS[0]).filter((k) => ACT2_LEVELS.every((l) => k in l));
    const missing = ACT3_LEVELS.flatMap((l, i) => act2Keys.filter((k) => !(k in l)).map((k) => `L${i + 7} ${k}`));
    check(act2Keys.length >= 15 && missing.length === 0, `Voyage III levels have every field Act II levels have (${act2Keys.length} fields)${missing.length ? ' -> missing ' + missing : ''}`);
    const unknownTypes = ACT3_LEVELS.flatMap((l) => l.waves.flat()).filter((t) => !SHIP_TYPES[t] || t === 'player');
    const unknownIds = ACT3_LEVELS.flatMap((l) => l.mechanics).filter((id) => !MECHANIC_IDS.includes(id) && !MECHANIC3_IDS.includes(id));
    check(unknownTypes.length === 0 && unknownIds.length === 0, `every wave names a known enemy type and every mechanic id is known${unknownTypes.length || unknownIds.length ? ' -> ' + [...unknownTypes, ...unknownIds] : ''}`);
    check(ACT3_LEVELS.every((l) => !l.waves.flat().includes('kraken')), 'the Kraken is never a ship type in a wave');
    const all = [...ACT2_LEVELS, ...ACT3_LEVELS];
    check(all.map((l) => l.bonus).every((b, i, a) => i === 0 || b > a[i - 1]) && ACT3_LEVELS.map((l) => l.stars).join() === '7,8,9', `bonus and stars rise level by level, on from the Maelstrom (${ACT3_LEVELS.map((l) => l.bonus)})`);
    const most = ACT3_LEVELS.map((l) => Math.max(l.waves[0].length, ...l.waves.slice(1).map((wv) => l.nextWaveAt + wv.length)));
    check(ACT3_LEVELS.every((l) => l.waves.every((wv) => wv.length >= 1 && wv.length <= 3)) && most.every((n) => n <= 4), `≤ 3 ships a wave, and nextWaveAt keeps ≤ 4 afloat at once (${most})`);
    const flags = ACT3_LEVELS.map((l) => l.waves.flat().map((t) => SHIP_TYPES[t]));
    check(
      flags[0].some((t) => t.ram) && flags[0].some((t) => t.mortar) && !flags[0].some((t) => t.fireship) &&
        flags[1].some((t) => t.armour) && flags[1].some((t) => t.fireship) && !flags[1].some((t) => t.ram) &&
        flags[2].some((t) => t.flagship && t.boss) && flags[2].filter((t) => t.boarder).length === 3 &&
        ACT3_LEVELS[2].waves[1].includes('inkheart') && ACT3_LEVELS[2].waves.length === 2,
      'L7 has sharks and a ketch, L8 Iron Turtles and fire ships (the two rammers never share a level), L9 skiffs and the Inkheart in its last wave'
    );
    const knobs = ACT3_LEVELS.every(
      (l) =>
        Number.isInteger(l.nextWaveAt) && l.nextWaveAt >= 0 && l.maxAttackers >= 1 && l.lead > 0 && l.lead <= 1 && l.spreadMul > 0 && l.grace >= 0 && l.bonus > 0 && l.crates === 2 &&
        typeof l.mechanic === 'string' && l.rumour.lines.length === 2 && ['fire', 'frost', 'stink'].includes(l.rumour.ammo) && l.act === 3
    );
    check(knobs, 'every Voyage III level has sane knobs, 2 powder crates, a mechanic line and a 2-line rumour naming a special shot');
    const B = ACT3_LEVELS[2].bombs;
    check(B.kind === 'geyser' && B.every[0] < B.every[1] && B.warn[0] >= 1.5, 'the geysers warn ≥ 1.5 s (kid rule)');
  }

  console.log(failures ? `\n${failures} check(s) failed` : `\nAll mechanics3 checks passed (${passes})`);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
