// Unit checks for Voyage IV's rules in src/mechanics4.js and the Voyage IV level definitions in src/act4.js (plain
// Node, no browser), SPEC4 §2.3–2.6, §3.1, §3.2, §11.1, §13.1. The hooks run against a mock of the ctx main.js hands
// them (SPEC3's ctx3 members + SPEC4's ctx4: warn, cutHold, spyglass, summon, puffersAlive, tables), with the real ship
// types from src/shipTypes.js and a little sailing model (main's turn and acceleration rules) where a course matters:
// - the API: exact exports, the tables exactly as SPEC4, WORDS4's meet lines, board words and tips, the null object,
//   junk ids / ctx / ships / throwing members never throw
// - the Sting Sloop: holds 22–30 u at > 135° off your bow, beam-on there; dances after 0.6 s inside a LOADED broadside
//   arc (turn ×1.6, +2, 1.2 s, then 5 s cooldown), never while chained or frozen; BEHIND YOU!; steers only with a slot
// - the Net Sloop: closes to 14–18 u on your beam; the whirl ≥ 1.6 s (+ the Lighthouse's bonus) before it lands; only
//   your hull inside the fan is tangled (×0.5 / ×0.6, no damage); always released by 4 s, by 3 taps, by a 0.8 s hold
//   (and the ctx's shorter Forge hold), by a hit on her; never chains (no net within 8 s of any release, none while
//   netted, one whirl at a time); none during a boarding, while she burns or stinks; Fire on a whirl → no net for 12 s
// - the Coral Witch: alternates summons and songs every 8 s; summons only while < 6 puffers live, min(3, 6 − alive)
//   with her id as owner, after a ≥ 1.8 s warning; sings 4 hp/s for 4 s within 18 u, never above full; stink quiets
//   her for 6 s; her puffers swim home when she sinks or is taken; no guns; she keeps 30–38 u off
// - fog: banks a pure function of the hazard clock riding env.fogLoops at 1.5 u/s, none within 20 u of the start for
//   8 s, hidden only beyond 14 u (+ the spyglass), never your own ship from your own view, never a shape, a pseudo
//   target or a crate; pirates who lost you hold fire and sail for your last-seen spot
// - currents: 3 u/s along the lane inside it only, for any point (puffers too); WHEEE! once
// - the tide: low at 40 s and every 45 s for 12 s, a ≥ 3 s warning (+ bonus), shallows ×0.5 on deep hulls only, never a
//   collider (no drift, no damage, never a stop), stopped for good by the wake
// - WARN: a 7th warning shape waits (and its attack with it); every slot is given back
// - hold(): everything waits; determinism: the same rolls give the same run
// - composeMechanics with three real parts (SPEC4 §11.1): every two-part result unchanged, a null third part gives
//   today's state exactly (no m4), visuals merged as { ...b.visuals(), ...c.visuals() }, krakenDue b's
// - act4.js: the three levels exactly as §2.3–2.5, every field the Act III levels have, known kinds and ids, bonus and
//   stars rising, valid pools (§3.5's table), waves = drawWaves(level, pool, poolSeed(level, 0)), ≤ 4 slots alive
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

// mechanics4.js, mechanics3.js, mechanics.js, pools.js, specials.js and shipTypes.js import nothing: they load from
// their source as data: URLs. act4.js (and act2/act3) import the env modules (three.js): those imports are swapped for
// stand-ins, and act4.js's pools.js import for pools.js's data: URL.
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
const f2 = (v) => (typeof v === 'number' ? v.toFixed(2) : String(v));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
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
  const M4 = await load('src/mechanics4.js');
  const M3 = await load('src/mechanics3.js');
  const { createMechanics, MECHANIC_IDS } = await load('src/mechanics.js');
  const { SHIP_TYPES } = await load('src/shipTypes.js');
  const { STATUS } = await load('src/specials.js');
  const POOLS_SRC = fs.readFileSync(path.join(ROOT, 'src/pools.js'), 'utf8');
  const P4 = await import(dataUrl(POOLS_SRC));
  const { MECHANIC4_IDS, STINGER, NET, WITCH, FOG, CURRENT, TIDE, WARN, WORDS4, createMechanics4 } = M4;
  const { createMechanics3, composeMechanics, MECHANIC3_IDS } = M3;

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
      reload: { port: 0, star: 0 },
      effects: { slow: 0, slowTurn: 0, slowFull: 0, mast: 0, rudder: 0, burn: 0 },
      status: { id: null, t: 0, max: 0, immune: 0 },
      ...extra,
    };
  }
  // main's warnSlots
  function slots(max = WARN.max) {
    return {
      max,
      count: 0,
      peak: 0,
      taken: [],
      take(kind) {
        if (this.count >= this.max) return false;
        this.count++;
        this.peak = Math.max(this.peak, this.count);
        this.taken.push(kind);
        return true;
      },
      give() {
        this.count = Math.max(0, this.count - 1);
      },
    };
  }
  // world(): a mechanics4 instance over a mock ctx; the log keeps every call main would see.
  function world({ ids = [], env = {}, player = null, enemies = [], def = { grace: 0 }, rng = mulberry32(7), extra = {}, warn = slots() } = {}) {
    const log = { damage: [], pop: [], banner: [], announce: [], sfx: [], summon: [], sendHome: [] };
    const w = { log, enemies, player, m: null, hold: false, boarding: false, attacking: () => true, bonus: 0, spy: 0, cutT: undefined, puffers: 0, awake: false, meeting: () => false, warn };
    const ctx = {
      env: () => env,
      player: () => w.player,
      enemies,
      fighting: (e) => e.hp > 0 && !e.sinking && !e.captured && !e.escaped && !e.surrendered,
      relative,
      damage: (s, amount, x, z, source) => log.damage.push({ s, amount, source }),
      pop: (text, x, y, z, style) => log.pop.push({ text, x, y, z, style, at: w.m ? w.m.state.hazardTime : 0 }),
      showBanner: (html, seconds) => log.banner.push({ html, seconds }),
      announce: (text) => log.announce.push(text),
      sfx: (name, x, z) => log.sfx.push({ name, x, z, at: w.m ? w.m.state.hazardTime : 0 }),
      rng,
      time: () => 0,
      def,
      status: (e) => e.status,
      warnBonus: () => w.bonus,
      hold: () => w.hold,
      attacking: (e) => w.attacking(e),
      boarding: () => w.boarding,
      warn,
      cutHold: () => w.cutT,
      spyglass: () => w.spy,
      summon: (kind, x, z, n, owner) => log.summon.push({ kind, x, z, n, owner, at: w.m ? w.m.state.hazardTime : 0 }),
      puffersAlive: () => w.puffers,
      sendHome: (owner) => log.sendHome.push(owner),
      awake: () => w.awake,
      meeting: (e) => w.meeting(e),
      tables: { RAIDERS: { cutTaps: 3, cutHold: 0.8 }, STATUS, POOL_RULES: P4.POOL_RULES },
      ...extra,
    };
    w.ctx = ctx;
    w.m = createMechanics4(ids, ctx);
    w.m.init();
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
  // A little sailing model (main's rules: turn at the type's rate × shipMods' turnMul, accelerate at accel, slow at
  // 1.5 × accel, cap (maxSpeed + capAdd) × speedMul; a pirate without a steer sails on). The player follows `you`.
  function moveShip(m, s, dt, want) {
    const t = s.type;
    const mods = m.shipMods(s);
    const rate = t.turn * mods.turnMul;
    const desired = want ? want.h : s.h;
    s.h = wrap(s.h + clamp(wrap(desired - s.h), -rate * dt, rate * dt));
    const cap = (t.maxSpeed + mods.capAdd) * mods.speedMul;
    const target = Math.min(want ? want.speed : s.speed, cap);
    s.speed += clamp(target - s.speed, -t.accel * 1.5 * dt, t.accel * dt);
    s.x += Math.sin(s.h) * s.speed * dt;
    s.z += Math.cos(s.h) * s.speed * dt;
  }
  function sail(w, seconds, { you = null, each = null } = {}) {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) {
      const p = w.player;
      if (p) {
        const y = typeof you === 'function' ? you(i * DT, p) : you;
        if (y) moveShip(w.m, p, DT, y);
      }
      for (const e of w.enemies) if (e.hp > 0) moveShip(w.m, e, DT, w.m.steer(e, DT));
      w.m.step(DT);
      if (each && each(i) === false) return i + 1;
    }
    return n;
  }
  const pops = (w, text) => w.log.pop.filter((p) => p.text === text);
  const offBow = (p, e) => {
    const r = relative(p, e.x, e.z);
    return Math.atan2(Math.abs(r.lat), r.along) / RAD;
  };

  // ---------------------------------------------------------------- the API and the tables
  {
    const want = ['CURRENT', 'FOG', 'MECHANIC4_IDS', 'NET', 'STINGER', 'TIDE', 'WARN', 'WITCH', 'WORDS4', 'createMechanics4'];
    check(same(Object.keys(M4).sort(), want), `mechanics4.js exports exactly ${want.join(', ')} (${Object.keys(M4).sort()})`);
    check(same(MECHANIC4_IDS, ['fog', 'currents', 'tide']) && Object.isFrozen(MECHANIC4_IDS), `MECHANIC4_IDS is ['fog', 'currents', 'tide'] (${JSON.stringify(MECHANIC4_IDS)})`);
    check(same(WARN, { max: 6, boss: 2 }), `WARN is { max: 6, boss: 2 }: 6 warning shapes, 2 boss attacks at once (${JSON.stringify(WARN)})`);
    check(
      same(STINGER.hold, [22, 30]) && STINGER.quarter === 135 && STINGER.bearing > 135 && STINGER.spot >= 22 && STINGER.spot <= 30 && STINGER.arm === 0.6 &&
        same(STINGER.dance, { time: 1.2, turnMul: 1.6, capAdd: 2, cooldown: 5 }) && STINGER.behind === 35,
      `STINGER is §3.1's: 22–30 u off your stern quarter (> 135°), dance after 0.6 s (×1.6, +2, 1.2 s, cooldown 5), BEHIND YOU! within 35 u (${JSON.stringify(STINGER)})`
    );
    check(
      same(NET.band, [14, 18]) && NET.beside >= 14 && NET.beside <= 18 && NET.reach === 18 && NET.width === 50 && NET.warn === 1.6 && NET.speedMul === 0.5 && NET.turnMul === 0.6 && NET.max === 4 &&
        NET.cooldown === 10 && NET.gap === 8 && NET.fireLock === 12,
      `NET is §3.1's: 14–18 u on your beam, a fan 18 × 50°, 1.6 s, ×0.5 / ×0.6 for ≤ 4 s, cooldown 10, no net within 8 s of a release, Fire → 12 s (${JSON.stringify(NET)})`
    );
    check(
      same(WITCH.keep, [30, 38]) && WITCH.every === 8 && WITCH.summon.n === 3 && WITCH.summon.warn === 1.8 && same(WITCH.summon.ahead, [10, 14]) &&
        same(WITCH.song, { warn: 1.5, r: 18, hps: 4, time: 4 }) && WITCH.stinkQuiet === 6,
      `WITCH is §3.1's: keeps 30–38 u, every 8 s summons 3 (1.8 s, 10–14 u ahead) or sings (1.5 s; 4 hp/s for 4 s within 18 u), stink quiets her 6 s (${JSON.stringify(WITCH)})`
    );
    check(
      FOG.banks === 3 && FOG.len === 30 && FOG.wid === 18 && FOG.speed === 1.5 && same(FOG.start, { time: 8, clear: 20 }) && FOG.see === 14 && FOG.bang === 6,
      `FOG is §2.6's: 3 banks 30 × 18 at 1.5 u/s, none within 20 u of the start for 8 s, hidden beyond 14 u, "!" ≤ once per 6 s (${JSON.stringify(FOG)})`
    );
    check(same(CURRENT, { width: 8, speed: 3 }), `CURRENT is §2.6's: lanes 8 u wide, 3 u/s (${JSON.stringify(CURRENT)})`);
    check(same(TIDE, { first: 40, every: 45, low: 12, warn: 3, speedMul: 0.5, fade: 2 }), `TIDE is §2.6's: low at 40 s, every 45 s, for 12 s, a 3 s warning, shallows ×0.5, fading 2 s (${JSON.stringify(TIDE)})`);
    check([STINGER, NET, WITCH, FOG, CURRENT, TIDE, WARN, WORDS4, STINGER.dance, WITCH.song, WORDS4.meet, WORDS4.tips].every((t) => Object.isFrozen(t)), 'every table is frozen (nested ones too)');
    // the kid rules: every telegraph ≥ 1.5 s, the net lets go within 4 s
    check(NET.warn >= 1.5 && WITCH.summon.warn >= 1.5 && WITCH.song.warn >= 1.5 && TIDE.warn >= 1.5 && NET.max <= 4, 'every telegraph here is ≥ 1.5 s (before the Lighthouse\'s bonus) and a net lets go within 4 s');
    // WORDS4: the meet cards, the board words, the tips
    const kinds = P4.V4_KINDS;
    const line = (k) => (typeof WORDS4.meet[k] === 'string' ? WORDS4.meet[k] : WORDS4.meet[k] && WORDS4.meet[k].keys);
    check(kinds.length === 8 && kinds.every((k) => typeof line(k) === 'string' && line(k).length > 10), `WORDS4.meet has a counter line for every Voyage IV kind (${kinds})`);
    check(WORDS4.meet.netsloop.keys.includes('Hold G') && WORDS4.meet.netsloop.touch.includes('Hold CUT!') && !WORDS4.meet.netsloop.touch.includes('Hold G'), 'the Net Sloop\'s meet card names G on keyboards and CUT! on touch');
    check(
      WORDS4.meet.jolly === 'Monkey Jollyboats! Grape shot tips them over. Steer out of the brown circles!' &&
        WORDS4.meet.stinger === 'Sting Sloop! She hides behind you. Turn to get her in your sights, or chain shot her!' &&
        WORDS4.meet.puffer === 'Puffer Mines! Pop them from far away, before they puff!' &&
        WORDS4.meet.witch === 'Coral Witch! She calls puffers and mends her fleet. Sink or board her first!' &&
        WORDS4.meet.coilback === "Old Coilback! Steer out of the green lane, then hit its head while it's dizzy!" &&
        WORDS4.meet.fort === 'Rock Fort! When its red line points at you, change course! Knock it down.' &&
        WORDS4.meet.shellback === 'THE SHELLBACK WAKES! Knock down its towers!' && WORDS4.meet.shellbackStink === ' Stink shot makes it sneeze!',
      'the meet lines are §3.1\'s counters word for word'
    );
    check(same(WORDS4.board, { small: 'Too small to board!', monster: "You can't board a sea monster!", fort: 'Too big to board! Knock it down.' }), "G's words at a pseudo target are §3.3's");
    const bits = Object.values(WORDS4.tips).map((t) => t.bit);
    check(same(bits.slice().sort((a, b) => a - b), [1, 2, 4, 8, 16, 32, 64, 128]) && Object.values(WORDS4.tips).every((t) => typeof t.keys === 'string' && typeof t.touch === 'string'), `§8.4's eight tips, bits 1–128, each with a keyboard and a touch text (${bits})`);
    check(WORDS4.tips.net.keys.includes('<kbd>G</kbd>') && WORDS4.tips.net.touch === 'Hold CUT! to cut it' && WORDS4.tips.fog.keys === 'Hidden in the fog! Fire anyway, or sail closer.', "the net's and the fog's tips are §8.4's");
    check(WORDS4.hud.tangled === 'TANGLED: half speed, slow turns' && WORDS4.hud.behind === 'BEHIND YOU!' && WORDS4.hud.hidden === 'HIDDEN' && WORDS4.hud.fog === 'FOG!' && WORDS4.hud.under === 'UNDER WATER', "the HUD's words (§8.2): TANGLED, BEHIND YOU!, HIDDEN, FOG!, UNDER WATER");
    check(WORDS4.live.home === 'Old Coilback swims home, sulking.' && WORDS4.live.shellHome === 'The Shellback scuttles home!' && WORDS4.live.fort === 'A Rock Fort is aiming at you!' && WORDS4.live.coilback === 'Old Coilback dived!', "#game-live's lines for the foes (§8.2: 'A Rock Fort is aiming at you', 'Old Coilback dived') and the Shellback have their own keys");
    check(WORDS4.pop.conch(1200) === '+1,200 THE GOLDEN CONCH' && WORDS4.card.conch(1200) === 'The Golden Conch +1,200' && WORDS4.pop.conch(NaN) === '+0 THE GOLDEN CONCH', 'the Conch templates format their number (and take junk)');
    const words = [];
    const walk = (o) => {
      for (const v of Object.values(o)) {
        if (typeof v === 'string') words.push(v);
        else if (v && typeof v === 'object') walk(v);
      }
    };
    walk(WORDS4);
    check(words.length > 80 && words.every((s) => s.length > 0 && s.length <= 110), `every WORDS4 string is a short line (${words.length} strings, longest ${Math.max(...words.map((s) => s.length))})`);

    // the null object: no ids, no flagged ships → nothing happens
    const w = world({ player: ship('player', 0, 0), enemies: [ship('corsair', 10, 10)] });
    w.run(60);
    const e = w.enemies[0];
    const v = w.m.visuals();
    check(
      w.m.steer(e, DT) === null && w.m.holdFire(e) === false && w.m.drift(e) === null && same(w.m.avoid(), []) && same(w.m.shipMods(e), { speedMul: 1, capAdd: 0, turnMul: 1, spin: 0 }) &&
        same(w.m.playerMods(), { speedMul: 1, turnMul: 1, netted: null }) && w.m.hidden(e) === false && w.m.fogAt(0, 0) === false && w.m.cut() === false && w.m.objective() === null &&
        same(w.m.minimap(), []) && same(w.m.summary(), []) && w.m.bonus() === 0,
      'with no ids and no Voyage IV ships nothing happens: no steer, no drift, identity mods, nothing hidden, no net'
    );
    check(same(v, { fog: [], currents: [], tide: null, nets: [], songs: [], summons: [], stingers: [] }) && Object.isFrozen(v), `visuals(): the frozen empty set (${JSON.stringify(v)})`);
    check(same(createMechanics4(['fog', 'bogus', 'spouts', 'fog', 'tide', 3, null], {}).state.ids, ['fog', 'tide']), 'createMechanics4 keeps only its own ids, once each');
    check(w.log.pop.length === 0 && w.log.sfx.length === 0 && w.log.announce.length === 0 && w.warn.peak === 0, 'and says nothing, plays nothing, takes no warning slot');

    // junk never throws
    let junkErr = '';
    const thrower = new Proxy({}, { get() { throw new Error('boom'); } });
    const junkCtx = [undefined, null, 5, 'x', [], {}, thrower, { player: () => { throw new Error('boom'); }, enemies: () => { throw new Error('boom'); }, env: () => thrower, warn: thrower, tables: thrower, rng: () => NaN, status: () => thrower }];
    const junkShip = [undefined, null, 0, 'ship', {}, { x: NaN, z: 1 }, thrower, Object.freeze(ship('netsloop', 1, 1)), { x: 1, z: 2, type: thrower }, { x: 1, z: 2, type: { kiter: true, nets: true, summoner: true }, hp: 5 }];
    for (const cx of junkCtx) {
      try {
        const m = createMechanics4(['fog', 'currents', 'tide', {}, null], cx);
        m.init();
        for (const s of junkShip) {
          m.onSpawn(s, 0);
          m.step(DT);
          m.steer(s, DT);
          m.holdFire(s);
          m.drift(s);
          m.shipMods(s);
          m.hidden(s, s);
          m.onCapture(s);
          m.onSink(s);
          m.onRemove(s);
        }
        m.step(NaN);
        m.step(-1);
        m.step(Infinity);
        m.fogAt('a', null);
        m.cut();
        m.cutHold('yes');
        m.playerMods();
        m.avoid();
        m.minimap();
        m.visuals();
        m.net();
        m.tide(true);
        JSON.stringify(m.state);
        m.dispose();
      } catch (err) {
        junkErr += ` [${typeof cx}] ${err.message}`;
      }
    }
    check(junkErr === '', `junk ctx, ships, ids and throwing members never throw${junkErr}`);
  }

  // ---------------------------------------------------------------- the Sting Sloop
  {
    // She makes for her spot behind you and holds it while you sail on (your guns not loaded: no dance).
    const p = ship('player', 0, 0, 0, { reload: { port: 1, star: 1 } });
    const e = ship('stinger', 40, 20, Math.PI);
    const w = world({ player: p, enemies: [e] });
    w.m.onSpawn(e, 0);
    let inBand = 0;
    let samples = 0;
    const you = (t, pp) => {
      pp.reload.port = pp.reload.star = 1;
      return { h: 0.3 * Math.sin(t / 9), speed: 8 };
    };
    sail(w, 25, { you });
    sail(w, 40, {
      you,
      each: (i) => {
        if (i % 12) return;
        samples++;
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        if (d >= STINGER.hold[0] - 1 && d <= STINGER.hold[1] + 1 && offBow(p, e) > STINGER.quarter) inBand++;
      },
    });
    check(inBand / samples >= 0.8, `the Sting Sloop holds a spot 22–30 u off your stern quarter, > 135° off your bow, while you sail on (${inBand} of ${samples} samples)`);
    // beam-on at her spot, guns loaded: her heading at right angles to the line to you
    const p2 = ship('player', 0, 0, 0, { speed: 0, reload: { port: 1, star: 1 } });
    const th = STINGER.bearing * RAD;
    // (her spot on your port quarter, you heading 0: right = (-1, 0), so port is +x)
    const e2 = ship('stinger', Math.sin(th) * STINGER.spot, Math.cos(th) * STINGER.spot, 0);
    const w2 = world({ player: p2, enemies: [e2] });
    w2.m.onSpawn(e2, 0);
    w2.m.step(DT);
    const s2 = w2.m.steer(e2, DT);
    const toYou = Math.atan2(p2.x - e2.x, p2.z - e2.z);
    check(s2 && near(Math.abs(wrap(s2.h - toYou)), Math.PI / 2, 1e-6), `at her spot with a loaded broadside she turns beam-on to you (${s2 && f2(Math.abs(wrap(s2.h - toYou)) / RAD)}°)`);
    e2.reload.port = e2.reload.star = 2;
    const s2b = w2.m.steer(e2, DT);
    check(s2b && !near(Math.abs(wrap(s2b.h - toYou)), Math.PI / 2, 1e-3), 'while both her broadsides reload she sails for the spot instead');
    w2.attacking = () => false;
    check(w2.m.steer(e2, DT) === null, 'without an attack slot she does not steer (main circles her like any waiting pirate)');

    // The dance: 0.6 s inside one of your LOADED broadside arcs.
    const mk = (extraP = {}, extraE = {}) => {
      const pp = ship('player', 0, 0, 0, extraP);
      const ee = ship('stinger', -20, 0, 0, extraE); // abeam to starboard (right(0) = (-1, 0)) at 20 u, heading as you
      const ww = world({ player: pp, enemies: [ee] });
      ww.m.onSpawn(ee, 0);
      return { p: pp, e: ee, w: ww };
    };
    const danceOf = (ww) => ww.m.state.stingers[0].dance;
    let A = mk();
    A.w.run(0.58);
    const before = danceOf(A.w);
    A.w.run(0.03);
    const after = danceOf(A.w);
    check(before === 0 && after > 1.15, `she dances after 0.6 s inside your loaded broadside arc, not before (at 0.58 s ${f2(before)}, at 0.61 s ${f2(after)})`);
    const sm = A.w.m.shipMods(A.e);
    check(near(sm.turnMul, 1.6) && sm.capAdd === 2 && sm.speedMul === 1, `dancing: turn ×1.6 and +2 to her speed cap (${JSON.stringify(sm)})`);
    check(A.w.log.sfx.some((s) => s.name === 'fwap'), 'a "fwap" of sails as she dances');
    A.w.attacking = () => false;
    const ds = A.w.m.steer(A.e, DT);
    check(ds && ds.speed > SHIP_TYPES.stinger.maxSpeed, `the dance needs no attack slot: she runs for her spot behind you at full speed + 2 (${ds && f2(ds.speed)})`);
    A.w.attacking = () => true;
    let danceEnd = null;
    A.w.run(3, (i) => {
      if (danceEnd === null && danceOf(A.w) === 0) danceEnd = (i + 1) * DT;
    });
    check(danceEnd !== null && near(danceEnd + 0.61, 0.6 + 1.2, 0.03), `the dance lasts 1.2 s (ended ${f2(danceEnd + 0.61)} s after she came into the arc)`);
    // still in the arc: the next dance waits for the 5 s cooldown
    let second = null;
    A.w.run(6, (i) => {
      if (second === null && danceOf(A.w) > 0) second = 3 + (i + 1) * DT;
    });
    const sinceEnd = second !== null ? second - (danceEnd || 0) : null;
    check(second !== null && sinceEnd >= STINGER.dance.cooldown - 0.02 && sinceEnd <= STINGER.dance.cooldown + STINGER.arm + 0.05, `then a 5 s cooldown before the next (the next began ${f2(sinceEnd)} s after the first ended)`);
    A = mk({ reload: { port: 1.5, star: 1.5 } });
    A.w.run(3);
    check(danceOf(A.w) === 0 && A.w.m.state.counts.dances === 0, 'an arc whose guns are reloading does not make her dance');
    A = mk({}, { effects: { slow: 6 } });
    A.w.run(3);
    check(A.w.m.state.counts.dances === 0, 'a chained sloop (chain shot) can\'t dance');
    A = mk({}, { status: { id: 'frost', t: 5, max: 5, immune: 0 } });
    A.w.run(3);
    check(A.w.m.state.counts.dances === 0, 'a frozen sloop can\'t dance');
    A = mk();
    A.w.run(0.7);
    A.e.effects.slow = 6;
    A.w.run(DT);
    check(danceOf(A.w) === 0 && same(A.w.m.shipMods(A.e), { speedMul: 1, capAdd: 0, turnMul: 1, spin: 0 }), 'chained mid-dance, the dance ends at once');
    // BEHIND YOU!
    const pb = ship('player', 0, 0, 0);
    const at = (deg, d) => ship('stinger', -Math.sin(deg * RAD) * d, Math.cos(deg * RAD) * d, 0); // (deg off your bow, to starboard)
    const eb = [at(160, 30), at(120, 30), at(160, 40)];
    const wb = world({ player: pb, enemies: eb });
    eb.forEach((x) => wb.m.onSpawn(x, 0));
    wb.m.step(DT);
    const beh = wb.m.visuals().stingers.map((s) => s.behind);
    check(same(beh, [true, false, false]), `BEHIND YOU!: within 35 u and > 135° off your bow only (160° at 30 u, 120° at 30 u, 160° at 40 u: ${beh})`);
  }

  // ---------------------------------------------------------------- the Net Sloop
  {
    // she closes to 14–18 u on your beam
    const p = ship('player', 0, 0, 0, { reload: { port: 1, star: 1 } });
    const e = ship('netsloop', 30, -20, 0);
    const w = world({ player: p, enemies: [e] });
    w.m.onSpawn(e, 0);
    w.cutT = 0.05; // (cut free at once: this part only watches her course)
    w.m.cutHold(true);
    let onBeam = 0;
    let n = 0;
    sail(w, 25, { you: { h: 0, speed: 6 } });
    sail(w, 30, {
      you: { h: 0, speed: 6 },
      each: (i) => {
        if (i % 12) return;
        n++;
        const r = relative(p, e.x, e.z);
        if (r.dist >= NET.band[0] - 1 && r.dist <= NET.band[1] + 1 && Math.abs(r.along) < Math.abs(r.lat) * 0.5) onBeam++;
      },
    });
    check(onBeam / n >= 0.8, `the Net Sloop closes to 14–18 u on your beam and sails your course (${onBeam} of ${n} samples)`);

    // the whirl: ≥ 1.6 s (+ the Lighthouse's bonus) before it lands; only your hull inside the fan
    for (const bonus of [0, 0.6]) {
      const pp = ship('player', 0, 0, 0);
      const ee = ship('netsloop', -14, 0, 0); // on your starboard beam at 14 u, your course
      const ww = world({ player: pp, enemies: [ee] });
      ww.bonus = bonus;
      ww.m.onSpawn(ee, 0);
      let started = null;
      let landed = null;
      ww.run(8, (i) => {
        const t = (i + 1) * DT;
        if (started === null && ww.m.visuals().nets.length) started = t;
        if (landed === null && ww.m.playerMods().netted) landed = t;
        return landed === null;
      });
      check(started !== null && landed !== null && landed - started >= NET.warn + bonus - DT - 1e-9 && landed - started <= NET.warn + bonus + 2 * DT, `the net whirls ${f2(landed - started)} s (≥ 1.6 + ${bonus}) before it lands on a captain inside the fan`);
      if (bonus === 0) {
        check(started >= NET.first - 1e-6, `her first net comes ${f2(started)} s after she joins the fight (NET.first ${NET.first})`);
        const pm = ww.m.playerMods();
        check(pm.speedMul === 0.5 && pm.turnMul === 0.6 && pm.netted && pm.netted.max === 4 && ww.log.damage.length === 0, `TANGLED: half speed, turning ×0.6, at most 4 s, no damage (${JSON.stringify(pm)})`);
        check(pops(ww, WORDS4.pop.net).length === 1 && pops(ww, WORDS4.pop.netted).length === 1 && ww.log.sfx.some((s) => s.name === 'netWhirl'), 'a whirr (netWhirl) and "NET!" as it whirls, "NETTED!" when it lands');
        check(ww.warn.peak === 1 && ww.warn.count === 0 && ww.m.state.slots === 0 && same(ww.warn.taken, ['net']), `the whirl took one warning slot and gave it back when it landed (${ww.warn.count} held)`);
        const nv = ww.m.state;
        check(nv.netted && nv.netted.by === ee.id, 'the net remembers whose it is');
        // always released by 4 s with nothing pressed
        let free = null;
        ww.run(5, (i) => {
          if (free === null && !ww.m.playerMods().netted) free = (i + 1) * DT;
          return free === null;
        });
        check(free !== null && free <= NET.max + 2 * DT && free >= NET.max - 2 * DT && ww.m.state.counts.released.time === 1, `with nothing pressed the net lets go after 4 s (${f2(free)} s)`);
      }
    }
    // a captain outside the fan is not tangled (behind her, and ahead of her beyond its reach)
    {
      const pp = ship('player', 0, 0, 0);
      const ee = ship('netsloop', -14, 0, 0);
      const other = ship('corsair', -7, 0, 0); // a pirate right inside the fan
      const ww = world({ player: pp, enemies: [ee, other] });
      ww.m.onSpawn(ee, 0);
      ww.m.onSpawn(other, 0);
      let whirling = false;
      ww.run(6, () => {
        if (!whirling && ww.m.visuals().nets.length) {
          whirling = true;
          pp.x = 25; // (you sail out of it: 39 u from her, beyond the fan's 18)
        }
      });
      check(whirling && ww.m.playerMods().netted === null && ww.m.state.counts.misses >= 1, 'a captain who steers out of the fan before it lands is not tangled');
      check(same(ww.m.shipMods(other), { speedMul: 1, capAdd: 0, turnMul: 1, spin: 0 }), 'the net tangles only you: a pirate inside the fan sails on');
      const v = { x: 0, z: 0 };
      // the fan's shape: 18 u long, 50° wide, from her toward you
      const pq = ship('player', 0, 0, 0);
      const eq = ship('netsloop', -14, 0, 0);
      const wq = world({ player: pq, enemies: [eq] });
      wq.m.onSpawn(eq, 0);
      let fan = null;
      wq.run(6, () => {
        const nv = wq.m.visuals().nets;
        if (nv.length) fan = nv[0];
        return !fan;
      });
      const toYou = Math.atan2(pq.x - eq.x, pq.z - eq.z);
      check(fan && fan.len === 18 && near(fan.half, 25 * RAD) && near(wrap(fan.h - toYou), 0, 1e-6) && fan.id === eq.id && fan.k >= 0 && fan.k < 0.1, `the fan is painted from her toward you, 18 u long and 50° wide (${fan && JSON.stringify({ len: fan.len, half: f2(fan.half / RAD), h: f2(fan.h), toYou: f2(toYou) })})`);
      void v;
    }
    // the cuts
    const netNow = (opts = {}) => {
      const pp = ship('player', 0, 0, 0);
      const ee = ship('netsloop', -14, 0, 0);
      const ww = world({ player: pp, enemies: [ee], ...opts });
      ww.m.onSpawn(ee, 0);
      ww.run(6, () => !ww.m.playerMods().netted);
      return { p: pp, e: ee, w: ww };
    };
    let N = netNow();
    const t1 = N.w.m.cut();
    const t2 = N.w.m.cut();
    const still = !!N.w.m.playerMods().netted;
    const cutHalf = N.w.m.playerMods().netted && N.w.m.playerMods().netted.cut;
    const t3 = N.w.m.cut();
    check(t1 === false && t2 === false && still && near(cutHalf, 2 / 3) && t3 === true && N.w.m.playerMods().netted === null && N.w.m.state.counts.released.cut === 1, `3 presses of G / CUT! cut the net (false, false, then true; ${f2(cutHalf)} cut after two)`);
    check(pops(N.w, WORDS4.pop.cutFree).length === 1 && N.w.m.cut() === false, '"CUT FREE!", and a press with no net on you does nothing (main boards as usual)');
    for (const [hold, label] of [[undefined, 'RAIDERS.cutHold 0.8 s'], [0.3, "the ctx's Forge hold 0.3 s"]]) {
      N = netNow();
      N.w.cutT = hold;
      const T = hold || 0.8;
      N.w.m.cutHold(true);
      N.w.run(T - 0.05);
      const held1 = !!N.w.m.playerMods().netted;
      N.w.run(0.06);
      check(held1 && N.w.m.playerMods().netted === null, `holding G cuts the net after ${label} (still netted at ${f2(T - 0.05)} s, free at ${f2(T + 0.01)} s)`);
    }
    N = netNow();
    N.w.m.cutHold(true);
    N.w.run(0.5);
    N.w.m.cutHold(false);
    N.w.m.cutHold(true);
    N.w.run(0.5);
    check(!!N.w.m.playerMods().netted, 'letting go of G starts the hold over (no mashing)');
    N = netNow();
    N.e.hp -= 4;
    N.w.run(DT);
    check(N.w.m.playerMods().netted === null && N.w.m.state.counts.released.hit === 1, 'any hit of yours on her lets the net go');
    N = netNow();
    N.e.hp = 0;
    N.e.sinking = 1;
    N.w.m.onSink(N.e);
    check(N.w.m.playerMods().netted === null, 'her net lets go when she sinks');

    // never chains: no net within 8 s of any release, none while you are netted, one whirl at a time
    {
      const pp = ship('player', 0, 0, 0);
      const ee = ship('netsloop', -14, 0, 0);
      const ww = world({ player: pp, enemies: [ee] });
      ww.m.onSpawn(ee, 0);
      ww.m.net(); // (a net lands on you now: G.v4.net)
      ww.run(0.5);
      ww.m.cut();
      ww.m.cut();
      ww.m.cut();
      const rel = ww.m.state.lastRelease;
      let whirl = null;
      ww.run(12, (i) => {
        if (whirl === null && ww.m.visuals().nets.length) whirl = 0.5 + (i + 1) * DT;
        return whirl === null;
      });
      check(rel !== null && whirl !== null && whirl - rel >= NET.gap - 1e-6, `no net starts within 8 s of a release (released at ${f2(rel)} s, her next whirl at ${f2(whirl)} s)`);
      // two sloops: never two whirls at once, and none while you are netted
      const p2 = ship('player', 0, 0, 0);
      const a = ship('netsloop', -14, 0, 0);
      const b = ship('netsloop', 14, 0, 0);
      const w2 = world({ player: p2, enemies: [a, b] });
      w2.m.onSpawn(a, 0);
      w2.m.onSpawn(b, 0);
      let worst = 0;
      let whileNetted = 0;
      const lands = [];
      const releases = [];
      let wasNetted = false;
      w2.run(120, (i) => {
        const nv = w2.m.visuals().nets.length;
        const nt = !!w2.m.playerMods().netted;
        worst = Math.max(worst, nv);
        if (nt && nv) whileNetted++;
        if (nt && !wasNetted) lands.push((i + 1) * DT);
        if (!nt && wasNetted) releases.push((i + 1) * DT);
        wasNetted = nt;
        // (you sit still, uncut: every net runs its 4 s)
      });
      const gaps = lands.slice(1).map((t, k) => t - releases[k]);
      check(worst === 1 && whileNetted === 0 && lands.length >= 4 && gaps.every((g) => g >= NET.gap + NET.warn - 0.02), `two Net Sloops: one whirl at a time, none while you are netted, every net ≥ 8 s + its whirl after the last release (${lands.length} nets, gaps ${gaps.map(f2)})`);
      check(releases.every((t, k) => t - lands[k] <= NET.max + 2 * DT), 'and every one of them let go within 4 s');
    }
    // none during a boarding, while she burns or stinks; Fire on a whirl
    const quiet = (setup, secs = 10) => {
      const pp = ship('player', 0, 0, 0);
      const ee = ship('netsloop', -14, 0, 0);
      const ww = world({ player: pp, enemies: [ee] });
      ww.m.onSpawn(ee, 0);
      setup(ww, ee);
      ww.run(secs);
      return ww.m.state.counts.whirls;
    };
    check(quiet((ww) => (ww.boarding = true)) === 0, 'no net during a boarding');
    check(quiet((ww, ee) => (ee.status = { id: 'fire', t: 20, max: 20, immune: 0 })) === 0, 'no net while she burns (Fire shot)');
    check(quiet((ww, ee) => (ee.effects.burn = 20)) === 0, 'no net while she burns (a powder keg)');
    check(quiet((ww, ee) => (ee.status = { id: 'stink', t: 20, max: 20, immune: 0 })) === 0, 'no net while she stinks');
    check(quiet((ww) => (ww.attacking = () => false)) === 0, 'no net without an attack slot');
    check(quiet((ww) => (ww.meeting = () => true)) === 0, "no net while her kind's first-meeting grace runs (ctx.meeting)");
    check(quiet((ww, ee) => (ee.x = -30)) === 0, 'no net while you are beyond its reach (18 u)');
    {
      const pp = ship('player', 0, 0, 0);
      const ee = ship('netsloop', -14, 0, 0);
      const ww = world({ player: pp, enemies: [ee] });
      ww.m.onSpawn(ee, 0);
      ww.run(6, () => !ww.m.visuals().nets.length);
      const t0 = ww.m.state.hazardTime;
      ee.status = { id: 'fire', t: 3, max: 3, immune: 0 };
      ww.run(DT);
      const cancelled = ww.m.visuals().nets.length === 0;
      ee.status = { id: null, t: 0, max: 0, immune: 0 };
      let next = null;
      ww.run(16, (i) => {
        if (next === null && ww.m.visuals().nets.length) next = ww.m.state.hazardTime;
        return next === null;
      });
      check(cancelled && pops(ww, WORDS4.pop.netsOnFire).length === 1 && ww.m.playerMods().netted === null && next !== null && next - t0 >= NET.fireLock - 0.02, `Fire on her while the net whirls: "NETS ON FIRE!", no net, and none for 12 s (the next whirl ${f2(next - t0)} s later)`);
      check(ww.warn.count <= 1, `the cancelled whirl gave its warning slot back (${ww.warn.count} held, the next whirl's)`);
    }
    {
      const pp = ship('player', 0, 0, 0);
      const ee = ship('netsloop', -14, 0, 0);
      const ww = world({ player: pp, enemies: [ee] });
      ww.m.onSpawn(ee, 0);
      ww.run(6, () => !ww.m.visuals().nets.length);
      ww.boarding = true;
      ww.run(DT);
      check(ww.m.visuals().nets.length === 0 && ww.warn.count === 0, 'a boarding that starts mid-whirl calls the net off (and gives its slot back)');
    }
  }

  // ---------------------------------------------------------------- the Coral Witch
  {
    const p = ship('player', 0, 0, 0);
    const witch = ship('witch', 0, 34, Math.PI);
    const mate = ship('corsair', 10, 34, 0);
    const far = ship('privateer', 0, 34 + 19, 0);
    mate.hp = 20;
    far.hp = 20;
    const w = world({ player: p, enemies: [witch, mate, far] });
    [witch, mate, far].forEach((x) => w.m.onSpawn(x, 0));
    const acts = [];
    let last = null;
    w.run(41, () => {
      const a = w.m.state.witches[0].act;
      const k = a ? a.kind : null;
      if (k && k !== last) acts.push({ kind: k, at: w.m.state.hazardTime });
      last = k;
    });
    const kinds = acts.map((a) => a.kind);
    const gaps = acts.slice(1).map((a, i) => a.at - acts[i].at);
    check(same(kinds.slice(0, 5), ['summon', 'song', 'summon', 'song', 'summon']) && gaps.every((g) => near(g, WITCH.every, 0.02)) && near(acts[0].at, WITCH.every, 0.02), `the Witch alternates summons and songs, one every 8 s (${kinds.join(', ')} at ${acts.map((a) => f2(a.at)).join(', ')})`);
    const S = w.log.summon;
    check(S.length >= 6 && S.every((s) => s.kind === 'puffer' && s.n === 1 && s.owner === witch.id), `her summons rise as puffers owned by her (${S.length} puffers, owner ${S[0] && S[0].owner} = her id ${witch.id})`);
    const firstRise = S.length ? S[0].at : null;
    check(firstRise !== null && firstRise - acts[0].at >= WITCH.summon.warn - DT - 1e-9 && S.filter((s) => s.at === firstRise).length === 3, `three rings, then the puffers rise ${f2(firstRise - acts[0].at)} s later (≥ 1.8 s)`);
    // the rings: 10–14 u ahead of you
    {
      const pp = ship('player', 0, 0, 0);
      const ww = world({ player: pp, enemies: [ship('witch', 0, 34, Math.PI)] });
      ww.m.onSpawn(ww.enemies[0], 0);
      let rings = null;
      ww.run(9, () => {
        const r = ww.m.visuals().summons;
        if (r.length) rings = r;
        return !rings;
      });
      const ahead = rings && rings.map((q) => relative(pp, q.x, q.z));
      const mid = ahead && ahead.reduce((s, q) => s + q.along, 0) / ahead.length;
      check(rings && rings.length === 3 && mid >= 10 - 0.01 && mid <= 14 + 0.01 && rings.every((q) => q.owner === ww.enemies[0].id && q.r > 0), `the green rings appear 10–14 u ahead of you (${rings && rings.length} rings, ${f2(mid)} u ahead)`);
      check(ww.warn.count === 3 && pops(ww, WORDS4.pop.puffers).length === 1 && ww.log.sfx.some((s) => s.name === 'conch'), `each ring is a warning shape (3 slots), with a conch and "PUFFERS!" (${ww.warn.count} slots)`);
      ww.run(2);
      const afterRise = ww.warn.count;
      ww.run(6.5); // (her song's notes, at 16 s)
      let songSlots = ww.warn.count;
      ww.run(2);
      check(afterRise === 0 && songSlots === 1 && ww.warn.count === 0 && ww.m.state.slots === 0, `the rings give their slots back when the puffers rise, the song's notes theirs when the mending starts (${afterRise}, ${songSlots}, ${ww.warn.count})`);
      songSlots = null;
    }
    // with the Lighthouse's bonus, both warnings are longer by it
    for (const bonus of [0.3, 0.9]) {
      const pp = ship('player', 0, 0, 0);
      const wi = ship('witch', 0, 34, Math.PI);
      const mate2 = ship('corsair', 8, 34, 0);
      mate2.hp = 10;
      const ww = world({ player: pp, enemies: [wi, mate2] });
      ww.bonus = bonus;
      [wi, mate2].forEach((x) => ww.m.onSpawn(x, 0));
      let ringAt = null;
      let rise = null;
      let noteAt = null;
      let mendAt = null;
      ww.run(20, () => {
        const t = ww.m.state.hazardTime;
        if (ringAt === null && ww.m.visuals().summons.length) ringAt = t;
        if (rise === null && ww.log.summon.length) rise = t;
        const sv = ww.m.visuals().songs;
        if (noteAt === null && sv.length) noteAt = t;
        if (mendAt === null && sv.length && sv[0].state === 'mend') mendAt = t;
        return mendAt === null;
      });
      check(rise - ringAt >= WITCH.summon.warn + bonus - DT - 1e-9 && mendAt - noteAt >= WITCH.song.warn + bonus - DT - 1e-9 && mate2.hp === 10, `with the Lighthouse's +${bonus} s: the rings show ${f2(rise - ringAt)} s (≥ 1.8 + ${bonus}) and the notes ${f2(mendAt - noteAt)} s (≥ 1.5 + ${bonus}) before anything happens`);
    }
    // never on land: a ring that would sit on an island is pushed out to open water
    {
      const pp = ship('player', 0, 0, 0);
      const isle = { x: 0, z: 12, r: 6 };
      const ww = world({ player: pp, enemies: [ship('witch', 0, 34, Math.PI)], env: { colliders: [isle] } });
      ww.m.onSpawn(ww.enemies[0], 0);
      let rings = null;
      ww.run(9, () => {
        const r = ww.m.visuals().summons;
        if (r.length) rings = r;
        return !rings;
      });
      const clear = rings && Math.min(...rings.map((q) => Math.hypot(q.x - isle.x, q.z - isle.z) - isle.r - q.r));
      check(rings && rings.length === 3 && clear >= 1 - 1e-6, `a summons ring is never on land: pushed out to open water (${rings && f2(clear)} u clear of the island)`);
    }
    // only while fewer than 6 are alive; then min(3, 6 − alive)
    for (const [alive, want] of [[5, 1], [4, 2], [6, 0], [0, 3]]) {
      const pp = ship('player', 0, 0, 0);
      const wi = ship('witch', 0, 34, Math.PI);
      const ww = world({ player: pp, enemies: [wi] });
      ww.m.onSpawn(wi, 0);
      ww.puffers = alive;
      ww.run(11);
      const st = ww.m.state.witches[0];
      if (alive >= 6) check(ww.log.summon.length === 0 && ww.m.state.counts.songs === 1 && ww.m.state.counts.summons === 0, 'with 6 puffers alive she sings instead of summoning');
      else check(ww.log.summon.length === want, `with ${alive} puffers alive her summons raise ${want} (min(3, 6 − ${alive}); ${ww.log.summon.length})`);
      void st;
    }
    // the song: 4 hp/s for 4 s within 18 u, never above full
    const mended = mate.hp - 20;
    check(mate.hp <= mate.maxHp && mended > 0, `her song mends a pirate within 18 u (+${f2(mended)} hp so far)`);
    {
      const pp = ship('player', 0, 0, 0);
      const wi = ship('witch', 0, 34, Math.PI);
      const a = ship('corsair', 10, 34, 0);
      const b = ship('privateer', 0, 34 + 18.5, 0);
      const fullOne = ship('shark', -5, 34, 0);
      a.hp = 10;
      b.hp = 10;
      wi.hp = 50;
      const ww = world({ player: pp, enemies: [wi, a, b, fullOne] });
      [wi, a, b, fullOne].forEach((x) => ww.m.onSpawn(x, 0));
      ww.m.state; // (warm)
      ww.puffers = 6; // (so her first turn is a song)
      let warnT = null;
      let mendStart = null;
      let mendEnd = null;
      ww.run(20, () => {
        const sv = ww.m.visuals().songs;
        if (sv.length && warnT === null) warnT = ww.m.state.hazardTime;
        if (sv.length && sv[0].state === 'mend' && mendStart === null) mendStart = ww.m.state.hazardTime;
        if (mendStart !== null && !sv.length && mendEnd === null) mendEnd = ww.m.state.hazardTime;
        return mendEnd === null;
      });
      check(warnT !== null && mendStart !== null && mendStart - warnT >= WITCH.song.warn - DT - 1e-9 && pops(ww, WITCH ? WORDS4.pop.mending : '').length >= 1 && ww.log.sfx.some((s) => s.name === 'song'), `a ring of notes, a harp glide and "SHE'S MENDING!" ${f2(mendStart - warnT)} s (≥ 1.5) before the mending`);
      check(near(a.hp, 10 + WITCH.song.hps * WITCH.song.time, 0.05) && near(mendEnd - mendStart, WITCH.song.time, 0.02), `a pirate within 18 u mends 4 hp/s for 4 s: +16 (${f2(a.hp - 10)} over ${f2(mendEnd - mendStart)} s) in one song`);
      check(b.hp === 10 && fullOne.hp === fullOne.maxHp && wi.hp === 50, 'one 18.5 u away is not mended, a full one stays full, and she does not mend herself');
    }
    {
      // never above full
      const pp = ship('player', 0, 0, 0);
      const wi = ship('witch', 0, 34, Math.PI);
      const a = ship('corsair', 5, 34, 0);
      a.hp = a.maxHp - 3;
      const ww = world({ player: pp, enemies: [wi, a] });
      [wi, a].forEach((x) => ww.m.onSpawn(x, 0));
      ww.puffers = 6;
      ww.run(16);
      check(a.hp === a.maxHp, `the song never mends above full (${f2(a.hp)} of ${a.maxHp})`);
    }
    // stink: no song or summons for 6 s
    {
      const pp = ship('player', 0, 0, 0);
      const wi = ship('witch', 0, 34, Math.PI);
      const ww = world({ player: pp, enemies: [wi] });
      ww.m.onSpawn(wi, 0);
      ww.run(8.5); // (her summons whirl)
      const had = !!ww.m.state.witches[0].act;
      wi.status = { id: 'stink', t: 4, max: 4, immune: 0 };
      ww.run(DT);
      const cut = !ww.m.state.witches[0].act && ww.warn.count === 0;
      const t0 = ww.m.state.hazardTime;
      let next = null;
      ww.run(20, (i) => {
        if (i === Math.round(4 / DT)) wi.status = { id: null, t: 0, max: 0, immune: 10 };
        if (next === null && ww.m.state.witches[0].act) next = ww.m.state.hazardTime;
        return next === null;
      });
      check(had && cut && next !== null && next - t0 >= WITCH.stinkQuiet - 0.02, `stink calls her summons off and quiets her for 6 s (the next ${f2(next - t0)} s later)`);
      // stink just before her turn: nothing for 6 s, then her turn
      const wi2 = ship('witch', 0, 34, Math.PI);
      const wq = world({ player: ship('player', 0, 0, 0), enemies: [wi2] });
      wq.m.onSpawn(wi2, 0);
      wq.run(7.9);
      wi2.status = { id: 'stink', t: 4, max: 4, immune: 0 };
      const q0 = wq.m.state.hazardTime;
      let first = null;
      wq.run(12, (i) => {
        if (i === Math.round(4 / DT)) wi2.status = { id: null, t: 0, max: 0, immune: 10 };
        if (first === null && wq.m.state.witches[0].act) first = wq.m.state.hazardTime;
        return first === null;
      });
      check(first !== null && first - q0 >= WITCH.stinkQuiet - 0.02 && first - q0 <= WITCH.stinkQuiet + 0.5, `stinky 0.1 s before her turn: no song or summons for 6 s (her turn came ${f2(first - q0)} s later)`);
    }
    // her puffers swim home when she sinks or is taken; no guns; she keeps 30–38 u off
    {
      const pp = ship('player', 0, 0, 0);
      const wi = ship('witch', 0, 34, Math.PI);
      const wj = ship('witch', 50, 50, Math.PI);
      const ww = world({ player: pp, enemies: [wi, wj] });
      [wi, wj].forEach((x) => ww.m.onSpawn(x, 0));
      ww.run(8.5);
      wi.hp = 0;
      wi.sinking = 1;
      ww.m.onSink(wi);
      ww.m.onRemove(wi);
      wj.captured = true;
      ww.m.onCapture(wj);
      ww.run(1);
      check(same(ww.log.sendHome, [wi.id, wj.id]) && ww.warn.count === 0, `sunk or taken, her own puffers swim home (sendHome with her id, once each: ${JSON.stringify(ww.log.sendHome)}) and her rings go`);
      check(ww.m.holdFire(wj) === true && ww.m.holdFire(ship('witch', 0, 0)) === true, 'she has no guns (holdFire)');
    }
    {
      const pp = ship('player', 0, 0, 0);
      const wi = ship('witch', 0, 60, Math.PI);
      const ww = world({ player: pp, enemies: [wi] });
      ww.m.onSpawn(wi, 0);
      ww.puffers = 6;
      let inside = 0;
      let k = 0;
      sail(ww, 30, { you: { h: 0.4, speed: 3 } });
      sail(ww, 40, {
        you: { h: 0.4, speed: 3 },
        each: (i) => {
          if (i % 12) return;
          k++;
          const d = Math.hypot(wi.x - pp.x, wi.z - pp.z);
          if (d >= WITCH.keep[0] - 3 && d <= WITCH.keep[1] + 3) inside++;
        },
      });
      check(inside / k >= 0.8, `she keeps 30–38 u off (${inside} of ${k} samples)`);
    }
  }

  // ---------------------------------------------------------------- fog
  {
    // three loops; the first passes close to the start, so the start rule has to pick its phase
    const loopA = { cx: 0, cz: 0, rx: 45, rz: 30 }; // (an ellipse round the start: never within 30 u of it)
    const loopB = { points: [{ x: 60, z: 60 }, { x: 110, z: 60 }, { x: 110, z: 100 }, { x: 60, z: 100 }] };
    const loopC = [[-100, -40], [-60, -40], [-60, 20], [-100, 20]];
    const near20 = { points: [{ x: 0, z: 22 }, { x: 60, z: 22 }, { x: 60, z: 90 }, { x: 0, z: 90 }] }; // (comes within 22 u)
    const env = { playerStart: { x: 0, z: 0, h: 0 }, fogLoops: [near20, loopB, loopC], worldRadius: 145 };
    const p = ship('player', 0, 0, 0);
    const w = world({ ids: ['fog'], env, player: p, def: { grace: 4 } });
    const banks0 = w.m.visuals().fog;
    check(banks0.length === 3 && banks0.every((b) => b.len === 30 && b.wid === 18), `three banks, 30 × 18 u, one on each loop (${banks0.length})`);
    // none within 20 u of the start (the edge of its ellipse) for the first 8 s
    const edgeDist = (b, x, z) => {
      let best = Infinity;
      for (let i = 0; i < 360; i++) {
        const a = (i / 360) * Math.PI * 2;
        const u = Math.cos(a) * 15;
        const v = Math.sin(a) * 9;
        const ex = b.x + u * Math.sin(b.h) - v * Math.cos(b.h);
        const ez = b.z + u * Math.cos(b.h) + v * Math.sin(b.h);
        best = Math.min(best, Math.hypot(ex - x, ez - z));
      }
      return best;
    };
    let closest = Infinity;
    w.run(8, () => {
      for (const b of w.m.visuals().fog) closest = Math.min(closest, edgeDist(b, 0, 0));
    });
    check(closest >= FOG.start.clear, `for the first 8 s no bank comes within 20 u of the start (closest edge ${f2(closest)} u)`);
    // riding the loops at 1.5 u/s, a pure function of the hazard clock
    const a0 = w.m.visuals().fog.map((b) => ({ ...b }));
    w.run(1);
    const a1 = w.m.visuals().fog;
    const sp = a0.map((b, i) => Math.hypot(a1[i].x - b.x, a1[i].z - b.z));
    check(sp.every((d) => d <= FOG.speed + 1e-6 && d >= FOG.speed * 0.9), `each bank drifts 1.5 u along its loop each second (${sp.map(f2)})`);
    const w2 = world({ ids: ['fog'], env, player: ship('player', 0, 0, 0), def: { grace: 4 } });
    for (let i = 0; i < 9 * 30; i++) w2.m.step(1 / 30);
    check(same(w2.m.visuals().fog.map((b) => [b.x.toFixed(6), b.z.toFixed(6), b.h.toFixed(6)]), w.m.visuals().fog.map((b) => [b.x.toFixed(6), b.z.toFixed(6), b.h.toFixed(6)])), 'the banks are a pure function of the hazard clock (9 s in 1/120 s steps = 9 s in 1/30 s steps)');
    w2.hold = true;
    const held0 = JSON.stringify(w2.m.visuals().fog);
    for (let i = 0; i < 120; i++) w2.m.step(DT);
    w2.hold = false;
    w2.m.step(DT);
    const jump = Math.max(...w2.m.visuals().fog.map((bk, i) => Math.hypot(bk.x - JSON.parse(held0)[i].x, bk.z - JSON.parse(held0)[i].z)));
    check(w2.m.state.held === false && jump <= FOG.speed * DT + 1e-9, `while ctx.hold() the banks wait (the hazard clock stops), and carry on from there (${jump.toExponential(2)} u in the next step)`);
    // hidden only beyond 14 u (+ the spyglass)
    const b = w.m.visuals().fog[1];
    const inBank = ship('corsair', b.x, b.z, 0);
    const viewer = (d) => ship('player', b.x + d, b.z, 0);
    const wv = world({ ids: ['fog'], env, player: viewer(13.9), enemies: [inBank] });
    for (let i = 0; i < Math.round(9 / DT); i++) wv.m.step(DT);
    const at = (d, spy = 0) => {
      wv.player = viewer(d);
      wv.spy = spy;
      return wv.m.hidden(inBank, wv.player);
    };
    check(wv.m.fogAt(inBank.x, inBank.z) && at(13.9) === false && at(14.1) === true && at(60) === true, 'a ship whose centre is inside a bank is hidden only from viewers more than 14 u away');
    check(at(19.9, 6) === false && at(20.1, 6) === true && at(31.9, 18) === false, 'the Observatory\'s spyglass adds its 6 / 12 / 18 u for you');
    wv.player = viewer(30);
    const pirate = ship('corsair', b.x + 15, b.z, 0);
    check(wv.m.hidden(inBank, pirate) === true && wv.m.hidden(inBank, ship('corsair', b.x + 10, b.z)) === false, 'and from a pirate viewer beyond 14 u too (no spyglass for her)');
    const me = ship('player', b.x, b.z, 0);
    wv.player = me;
    check(wv.m.hidden(me) === false && wv.m.hidden(me, me) === false, 'never your own ship from your own view');
    check(wv.m.hidden(me, ship('corsair', b.x + 30, b.z)) === true, 'but you can hide from a pirate 30 u away (a breather)');
    wv.player = viewer(40);
    check(
      wv.m.hidden({ x: b.x, z: b.z }) === false && wv.m.hidden({ x: b.x, z: b.z, r: 4, kind: 'ring' }) === false && wv.m.hidden({ pseudo: true, x: b.x, z: b.z, type: { len: 3, wid: 3 } }) === false && wv.m.hidden({ x: b.x, z: b.z, crate: true }) === false,
      'never a shape, a ring, a pseudo target or a crate (only ships hide)'
    );
    check(wv.m.fogAt(b.x + 40, b.z + 40) === false && createMechanics4([], { env: () => env }).fogAt(b.x, b.z) === false, 'fogAt() is false outside every bank, and on a level without fog');
    // pirates who lost you: no aimed fire, and they sail for your last-seen spot
    {
      const wl = world({ ids: ['fog'], env, player: ship('player', 0, 0, 0), enemies: [ship('corsair', 0, 0, 0)] });
      for (let i = 0; i < Math.round(9 / DT); i++) wl.m.step(DT);
      const bk = wl.m.visuals().fog[1];
      const pp = wl.player;
      const e = wl.enemies[0];
      pp.x = bk.x - 30;
      pp.z = bk.z;
      e.x = bk.x + 30;
      e.z = bk.z;
      wl.m.onSpawn(e, 0);
      wl.m.step(DT); // (she sees you)
      pp.x = bk.x;
      pp.z = bk.z; // (into the bank)
      wl.m.step(DT);
      const sv = wl.m.steer(e, DT);
      const toSpot = Math.atan2(bk.x - 30 - e.x, 0);
      check(wl.m.holdFire(e) === true && sv && near(wrap(sv.h - toSpot), 0, 1e-6) && pops(wl, WORDS4.pop.lost).length === 1, `a pirate you are hidden from holds her fire and sails for your last-seen spot ("Where'd she go?": ${pops(wl, WORDS4.pop.lost).length})`);
      check(wl.m.state.fog.playerIn === true && wl.log.announce.includes(WORDS4.live.fog), 'you inside a bank: the HIDDEN chip\'s state and "Hidden in the fog." for #game-live');
      pp.x = bk.x - 40;
      wl.m.step(DT);
      check(wl.m.holdFire(e) === false && wl.m.steer(e, DT) === null, 'out of the fog she sees you again and fights as usual');
      // a ship leaving a bank: "!" at most once per 6 s
      const bangs = () => pops(wl, '!').length;
      const e2 = ship('cutter', bk.x, bk.z, 0);
      wl.enemies.push(e2);
      wl.m.onSpawn(e2, 0);
      wl.m.step(DT);
      e2.x = bk.x + 40;
      wl.m.step(DT);
      const one = bangs();
      e2.x = bk.x;
      wl.m.step(DT);
      e2.x = bk.x + 40;
      wl.m.step(DT);
      check(one === 1 && bangs() === 1, `a ship leaving a bank gets one "!" (and no second within 6 s: ${bangs()})`);
    }
    check(w.log.sfx.filter((s) => s.name === 'foghorn').length === 0, 'no foghorn in the first 25 s');
    w.run(20);
    check(w.log.sfx.filter((s) => s.name === 'foghorn').length === 1, 'a soft foghorn far off after 25 s');
    // fog stops a net: she can't see you
    {
      const wn = world({ ids: ['fog'], env, player: ship('player', 0, 0, 0), enemies: [] });
      for (let i = 0; i < Math.round(9 / DT); i++) wn.m.step(DT);
      const bk = wn.m.visuals().fog[1];
      const pp = wn.player;
      pp.x = bk.x;
      pp.z = bk.z;
      const ns = ship('netsloop', bk.x - 16, bk.z, 0);
      wn.enemies.push(ns);
      wn.m.onSpawn(ns, 0);
      wn.run(8);
      check(wn.m.state.counts.whirls === 0, 'a Net Sloop 16 u off throws no net at a captain hidden in a bank');
    }
  }

  // ---------------------------------------------------------------- coral currents
  {
    const lanes = [
      { points: [{ x: 0, z: 30 }, { x: 0, z: 90 }, { x: 40, z: 130 }], width: 8 },
      [[50, -50], [100, -50]],
      { points: [[-80, 0], [-80, -60]] },
    ];
    const env = { playerStart: { x: 0, z: 0, h: 0 }, currents: lanes };
    const p = ship('player', 0, 0, 0);
    const e = ship('corsair', 0, 60, 0);
    const w = world({ ids: ['currents'], env, player: p, enemies: [e] });
    w.m.onSpawn(e, 0);
    w.m.step(DT);
    const d = w.m.drift(e);
    check(d && near(d.vx, 0) && near(d.vz, CURRENT.speed), `a ship inside a lane drifts 3 u/s along it (${JSON.stringify(d)})`);
    e.x = 3.9;
    const dEdge = w.m.drift(e);
    e.x = 4.1;
    const dOut = w.m.drift(e);
    check(dEdge && near(Math.hypot(dEdge.vx, dEdge.vz), 3) && dOut === null, 'inside only: 3.9 u off the lane\'s line drifts, 4.1 u does not');
    const pt = w.m.drift({ x: 75, z: -50 });
    check(pt && near(pt.vx, 3) && near(pt.vz, 0), `any point rides it (main asks for puffers too): ${JSON.stringify(pt)}`);
    const bend = w.m.drift({ x: 20, z: 110 });
    check(bend && near(bend.vx, 3 / Math.SQRT2, 1e-6) && near(bend.vz, 3 / Math.SQRT2, 1e-6), 'along the segment it is on (round a bend)');
    const vis = w.m.visuals().currents;
    check(vis.length === 3 && vis.every((L) => L.width === 8 && L.speed === 3 && L.points.length >= 2) && w.m.minimap().filter((m) => m.kind === 'current').length === 3, `three lanes in visuals() and on the minimap (${vis.length})`);
    p.x = 0;
    p.z = 50;
    w.m.step(DT);
    p.z = 0;
    w.m.step(DT);
    p.z = 50;
    w.m.step(DT);
    check(pops(w, WORDS4.pop.wheee).length === 1, '"WHEEE!" the first time you ride one (once a level)');
    check(w.log.damage.length === 0 && same(w.m.shipMods(p), { speedMul: 1, capAdd: 0, turnMul: 1, spin: 0 }), 'a current does no damage and changes no speed cap');
    w.hold = true;
    w.m.step(DT);
    check(w.m.drift(p) === null, 'no drift while ctx.hold() (the fly-in, a boarding\'s truce)');
    check(createMechanics4(['fog'], { env: () => env }).drift({ x: 0, z: 60 }) === null, 'no currents on a level without the id');
  }

  // ---------------------------------------------------------------- the ebb tide
  {
    const bars = [{ x: 0, z: 30, rx: 12, rz: 5 }, { ax: 40, az: 0, bx: 60, bz: 10, r: 4 }, { points: [[-40, -40], [-20, -40], [-20, -30], [-40, -30]] }, { x: 0, z: -50, len: 20, wid: 6, rot: 0.5 }];
    const env = { playerStart: { x: 0, z: 0, h: 0 }, tideBars: bars };
    const p = ship('player', 0, 30, 0);
    const shark = ship('skiff', 50, 5, 0); // (shallow: never slowed)
    const deep = ship('ironclad', -30, -35, 0);
    const w = world({ ids: ['tide'], env, player: p, enemies: [shark, deep] });
    [shark, deep].forEach((x) => w.m.onSpawn(x, 0));
    const phases = [];
    let last = 'high';
    w.run(100, () => {
      const ph = w.m.state.tide.phase;
      if (ph !== last) phases.push({ ph, at: w.m.state.hazardTime });
      last = ph;
    });
    const at = (ph, k = 0) => phases.filter((x) => x.ph === ph)[k];
    check(
      at('warning') && near(at('warning').at, TIDE.first - TIDE.warn, 0.02) && near(at('low').at, TIDE.first, 0.02) && near(at('high').at, TIDE.first + TIDE.low, 0.02) && near(at('low', 1).at, TIDE.first + TIDE.every, 0.02),
      `low tide at 40 s for 12 s, again at 85 s, each warned 3 s ahead (${phases.map((x) => `${x.ph}@${f2(x.at)}`).join(', ')})`
    );
    check(w.log.sfx.filter((s) => s.name === 'tidebell').length === 2 && pops(w, WORDS4.pop.lowTide).length === 2 && w.log.banner.length === 1 && w.log.banner[0].html === WORDS4.banner.tide, 'each warning rings the ship\'s bell and says LOW TIDE!; the first shows the banner "Low tide! Sandbars slow you down"');
    const wb = world({ ids: ['tide'], env, player: ship('player', 0, 0, 0) });
    wb.bonus = 0.9;
    let warnAt = null;
    wb.run(41, () => {
      if (warnAt === null && wb.m.state.tide.phase === 'warning') warnAt = wb.m.state.hazardTime;
    });
    check(warnAt !== null && near(TIDE.first - warnAt, TIDE.warn + 0.9, 0.02), `the Lighthouse's bonus starts the warning earlier: ${f2(TIDE.first - warnAt)} s ahead (3 + 0.9)`);
    // shallows while the tide is out: ×0.5 on deep hulls inside a bar only; never a collider
    const wt = world({ ids: ['tide'], env, player: ship('player', 0, 30, 0), enemies: [ship('skiff', 50, 5, 0), ship('ironclad', -30, -35, 0), ship('corsair', 0, -50, 0), ship('corsair', 100, 100, 0)] });
    wt.enemies.forEach((x) => wt.m.onSpawn(x, 0));
    const [sk, ir, co, out] = wt.enemies;
    const mods = () => [wt.player, sk, ir, co, out].map((s) => wt.m.shipMods(s).speedMul);
    const highMods = mods();
    wt.m.tide(true);
    wt.m.step(DT);
    const lowMods = mods();
    check(same(highMods, [1, 1, 1, 1, 1]) && same(lowMods, [0.5, 1, 0.5, 0.5, 1]), `while it is out, deep hulls inside a bar sail at ×0.5 (you, an Iron Turtle, a Corsair); a shallow Squid Skiff and a ship outside sail on (${lowMods})`);
    check(pops(wt, WORDS4.pop.shallows).length === 1, '"SHALLOWS!" once as you enter');
    check(lowMods.every((m) => m > 0) && wt.m.drift(wt.player) === null && wt.log.damage.length === 0 && wt.m.avoid().length === 4, 'never a collider: never a stop, no drift, no damage; pirates keep off the bars while they are out');
    const tv = wt.m.visuals().tide;
    check(tv && tv.state === 'low' && tv.bars.length === 4 && wt.m.minimap().filter((m) => m.kind === 'tide' && m.low).length === 4, 'the low tide in visuals() and the bars on the minimap');
    wt.m.tide(false);
    wt.m.step(DT);
    check(same(mods(), [1, 1, 1, 1, 1]) && wt.m.visuals().tide === null, 'back in: no shallows, nothing drawn');
    // stopped by the wake
    const ww = world({ ids: ['tide'], env, player: ship('player', 0, 30, 0) });
    ww.run(45);
    const wasLow = ww.m.state.tide.phase === 'low';
    ww.awake = true;
    ww.m.step(DT);
    const fade = ww.m.visuals().tide;
    check(wasLow && fade && fade.state === 'fading' && same(ww.m.shipMods(ww.player), { speedMul: 1, capAdd: 0, turnMul: 1, spin: 0 }), 'the Shellback wakes mid-low-tide: the shallows stop at once and the bars fade');
    ww.run(2.1);
    const gone = ww.m.visuals().tide;
    ww.run(200);
    check(gone === null && ww.m.state.tide.phase === 'off' && ww.m.state.counts.lows === 1 && ww.m.tide(true) === null, 'after 2 s it is gone for good: no more low tides');
  }

  // ---------------------------------------------------------------- WARN: a 7th shape waits
  {
    const warn = slots(6);
    for (let i = 0; i < 6; i++) warn.take('other');
    const p = ship('player', 0, 0, 0);
    const ns = ship('netsloop', -14, 0, 0);
    const w = world({ player: p, enemies: [ns], warn });
    w.m.onSpawn(ns, 0);
    w.run(8);
    const waited = w.m.state.counts.whirls === 0 && w.m.state.counts.waited > 0 && w.m.playerMods().netted === null;
    warn.give('other');
    let whirl = null;
    w.run(1, () => {
      if (whirl === null && w.m.visuals().nets.length) whirl = w.m.state.hazardTime;
    });
    check(waited && whirl !== null && warn.count === 6 && warn.peak === 6, `with 6 warning shapes up the 7th (a net) waits, and its net with it; it whirls once a slot frees (peak ${warn.peak})`);
    // a summons needs a slot for each ring
    const warn2 = slots(6);
    for (let i = 0; i < 4; i++) warn2.take('other');
    const w2 = world({ player: ship('player', 0, 0, 0), enemies: [ship('witch', 0, 34, Math.PI)], warn: warn2 });
    w2.m.onSpawn(w2.enemies[0], 0);
    w2.run(9);
    const waited2 = w2.m.state.counts.summons === 0 && w2.m.state.counts.songs === 0 && warn2.peak === 4;
    warn2.give('other');
    w2.run(DT);
    check(waited2 && w2.m.state.counts.summons === 1 && warn2.count === 6 && warn2.peak === 6, `with 2 slots free her 3 rings wait (never half-shown: peak 4); once 3 are free they show (peak ${warn2.peak})`);
    // a busy scene: two net sloops, two witches, the count never passes 6 and every slot comes back
    const warn3 = slots(6);
    const p3 = ship('player', 0, 0, 0);
    const ships3 = [ship('netsloop', -14, 0, 0), ship('netsloop', 14, 4, 0), ship('witch', 0, 34, Math.PI), ship('witch', 20, 34, Math.PI)];
    const w3 = world({ player: p3, enemies: ships3, warn: warn3 });
    ships3.forEach((x) => w3.m.onSpawn(x, 0));
    w3.run(90, (i) => {
      if (i % 600 === 0) w3.m.cut(), w3.m.cut(), w3.m.cut();
    });
    check(warn3.peak <= 6 && w3.m.state.slots === warn3.count, `a busy scene never shows more than 6 shapes (peak ${warn3.peak}), and the module's count matches main's (${w3.m.state.slots} / ${warn3.count})`);
    w3.m.dispose();
    check(warn3.count === 0, `dispose() gives back every slot it still held (${warn3.count} left)`);
  }

  // ---------------------------------------------------------------- hold() and determinism
  {
    const p = ship('player', 0, 0, 0);
    const ns = ship('netsloop', -14, 0, 0);
    const w = world({ player: p, enemies: [ns], ids: ['tide'] });
    w.m.onSpawn(ns, 0);
    w.hold = true;
    w.run(60);
    check(w.m.state.hazardTime === 0 && w.m.state.counts.whirls === 0 && w.m.state.tide.phase === 'high', 'while ctx.hold() nothing whirls, ticks or turns (the hazard clock stays at 0)');
    w.hold = false;
    w.run(6, () => !w.m.playerMods().netted);
    w.hold = true;
    w.run(DT);
    check(w.m.playerMods().netted === null && w.m.state.counts.released.hold === 1, 'a hold (a boarding\'s truce) lets a net on you go');

    const busy = (seed) => {
      nextId = 1000;
      const env = { playerStart: { x: 0, z: 0 }, fogLoops: [{ cx: 0, cz: 0, rx: 70, rz: 50 }, { cx: 0, cz: 0, rx: 90, rz: 80 }], currents: [[[0, -60], [0, 60]]] };
      const pp = ship('player', 0, 0, 0);
      const es = [ship('stinger', 30, -20, 0), ship('netsloop', -20, 10, 0), ship('witch', 0, 40, Math.PI), ship('corsair', 40, 40, 0)];
      const ww = world({ ids: ['fog', 'currents'], env, player: pp, enemies: es, rng: mulberry32(seed) });
      es.forEach((x) => ww.m.onSpawn(x, 0));
      sail(ww, 60, { you: (t) => ({ h: Math.sin(t / 5), speed: 7 }) });
      return JSON.stringify(ww.m.state) + JSON.stringify(es.map((e) => [e.x.toFixed(4), e.z.toFixed(4)])) + JSON.stringify(ww.log.summon);
    };
    const r1 = busy(5);
    const r2 = busy(5);
    const r3 = busy(6);
    check(r1 === r2, 'the same rolls give the same 60 s (stinger, net sloop, witch, fog, currents)');
    check(r1 !== r3, 'and other rolls another (the summons\' spots come from ctx.rng)');
  }

  // ---------------------------------------------------------------- composeMechanics with three parts
  {
    const lane = [[-30, 30], [30, 30]];
    const env = { current: { x: 0, z: 0, r: 75, pull: 3.2, swirl: 2.8, eye: 12, eyeDps: 5 }, worldRadius: 145, currents: [lane] };
    const mk = () => {
      nextId = 500;
      const p = ship('player', 0, 0, 0);
      const e = ship('cutter', 10, 30, 0);
      const w = world({ player: p, enemies: [e], env, def: { grace: 0, waves: [['cutter']] } });
      return { p, e, w };
    };
    const ids = ['current', 'spouts', 'currents', 'floes'];
    const A = mk();
    const two = composeMechanics([createMechanics(ids, A.w.ctx), createMechanics3(ids, A.w.ctx)]);
    const B = mk();
    const c4 = createMechanics4(ids, B.w.ctx);
    const three = composeMechanics([createMechanics(ids, B.w.ctx), createMechanics3(ids, B.w.ctx), c4]);
    const C = mk();
    const nul = composeMechanics([createMechanics(ids, C.w.ctx), createMechanics3(ids, C.w.ctx), null]);
    for (const m of [two, three, nul]) m.init();
    for (let i = 0; i < 240; i++) {
      two.step(DT);
      three.step(DT);
      nul.step(DT);
    }
    const s2 = two.state;
    const s3 = three.state;
    const sn = nul.state;
    const { m4, ...rest3 } = s3;
    check(same(rest3, s2) && same(s3.ids, ['current', 'floes']) && 'current' in s3 && 'floes' in s3 && same(s3.m3.ids, ['spouts']) && same(m4.ids, ['currents']), `three parts: Act II's ids, current and floes top-level and m3 exactly as with two, plus m4 (${Object.keys(s3)})`);
    check(same(sn, s2) && !('m4' in sn), 'a null third part gives today\'s state exactly (no m4 key)');
    const d2 = two.drift(A.e);
    const d3 = three.drift(B.e);
    const dc = c4.drift(B.e);
    check(d2 && dc && near(d3.vx, d2.vx + dc.vx) && near(d3.vz, d2.vz + dc.vz), `drift: the maelstrom's and the coral current's summed (${JSON.stringify(d3)} = ${JSON.stringify(d2)} + ${JSON.stringify(dc)})`);
    check(two.objective() === three.objective() && same(two.minimap(), three.minimap().filter((x) => x.kind !== 'current')) && three.minimap().some((x) => x.kind === 'current'), 'objective unchanged, minimap a\'s and b\'s then c\'s');
    const vb = B.w.m; // (unused: the composed visuals below)
    void vb;
    const v3 = three.visuals();
    const v2 = two.visuals();
    check(same(Object.keys(v3), [...Object.keys(v2), ...Object.keys(c4.visuals())]) && same(v3.currents, c4.visuals().currents) && same(v3.spouts, v2.spouts), `visuals: { ...b.visuals(), ...c.visuals() } (${Object.keys(v3)})`);
    check(three.krakenDue === two.krakenDue && typeof three.krakenDue === 'boolean', "krakenDue: b's");
    // Voyage IV's own hooks: c's, identity without c
    const pn = ship('player', 0, 0, 0);
    const ns = ship('netsloop', -14, 0, 0);
    const W = world({ player: pn, enemies: [ns] });
    W.m.onSpawn(ns, 0);
    const J = composeMechanics([createMechanics([], W.ctx), createMechanics3([], W.ctx), W.m]);
    for (let i = 0; i < 6 / DT && !J.playerMods().netted; i++) J.step(DT);
    const pm = J.playerMods();
    check(pm.netted && pm.speedMul === 0.5 && pm.turnMul === 0.6, `playerMods(): c's (the net on you: ${JSON.stringify(pm)})`);
    J.cut();
    J.cut();
    check(J.cut() === true && J.playerMods().netted === null && same(nul.playerMods(), { speedMul: 1, turnMul: 1, netted: null }) && nul.cut() === false, "cut(): c's; without c, no net and no cut");
    check(J.steer(ns, DT) !== null && same(J.shipMods(ns), W.m.shipMods(ns)), "steer: the first part's that is non-null (c steers the Net Sloop); shipMods composed");
  }

  // ---------------------------------------------------------------- act4.js: the level definitions
  {
    const envStub = (name) => `const ${name} = { stub: '${name}', meta: { name: '${name}' } };`;
    const stub = (rel) =>
      fs
        .readFileSync(path.join(ROOT, rel), 'utf8')
        .replace(/^import \* as (\w+) from '\.\/env\/(\w+)\.js';$/gm, (_, name) => envStub(name))
        .replace(/from '\.\/pools\.js';$/m, `from '${dataUrl(POOLS_SRC)}';`);
    const src4 = stub('src/act4.js');
    check(!/^\s*import\s+\*\s+as\s+\w+\s+from\s+'\.\//m.test(src4) && /^import \* as pools from 'data:/m.test(src4) && (src4.match(/^\s*import\s/gm) || []).length === 1, 'act4.js imports only the three env modules and pools.js');
    const { ACT4_LEVELS, ACT4_TEASER } = await import(dataUrl(src4));
    const { ACT3_LEVELS } = await import(dataUrl(stub('src/act3.js')));
    const { ACT2_LEVELS } = await import(dataUrl(stub('src/act2.js')));
    check(Array.isArray(ACT4_LEVELS) && ACT4_LEVELS.length === 3, `ACT4_LEVELS has three levels (${ACT4_LEVELS && ACT4_LEVELS.length})`);
    check(ACT4_TEASER === '…but on the sunset horizon, an island is snoring.', "ACT4_TEASER is §2.2's line");
    const FROM_12 = ['jolly', 'stinger', 'netsloop', 'puffer', 'witch', 'coilback', 'corsair', 'privateer', 'shark', 'skiff', 'bombketch', 'ironclad'];
    const F11 = ['jolly', 'stinger', 'netsloop', 'corsair', 'privateer', 'bombketch', 'ironclad'];
    const WANT = [
      {
        env: 'mangroves', difficulty: 'Heroic', act: 4, stars: 10, scene: 'mangroves',
        nextWaveAt: 1, maxAttackers: 2, lead: 0.7, spreadMul: 0.9, grace: 4, enemyRake: 1, mechanics: ['fog'], crates: 2, bonus: 1800,
        mechanic: 'Fog banks hide ships! Monkey Jollyboats throw coconuts: steer out of the brown circles!',
        rumour: { title: 'Misty Mangroves', lines: ['Monkeys in little boats! Grape shot tips them over.', 'A Sting Sloop hides behind you. Turn, or chain shot her!'], ammo: 'grape', foes: ['jolly', 'stinger', 'netsloop'] },
        lockText: 'Drive off the Kraken',
        pool: [
          { budget: 5, slots: 2, must: 'jolly', from: ['corsair', 'privateer', 'shark'] },
          { budget: 6, slots: 2, must: 'stinger', from: ['corsair', 'privateer', 'shark', 'jolly'] },
          { budget: 8, slots: 3, must: 'netsloop', from: ['corsair', 'privateer', 'shark', 'jolly', 'stinger'] },
        ],
      },
      {
        env: 'spires', difficulty: 'Epic', act: 4, stars: 11, scene: 'spires',
        nextWaveAt: 1, maxAttackers: 2, lead: 0.7, spreadMul: 0.9, grace: 3, enemyRake: 1, mechanics: ['currents'], crates: 2, bonus: 2100,
        mechanic: 'Coral currents push you along! Puffer Mines puff when you get close: pop them from far away.',
        rumour: { title: 'The Sunken Spires', lines: ['The Coral Witch calls puffers. Sink her first!', 'Old Coilback gets dizzy after it lunges. Hit its head!'], ammo: 'stink', foes: ['puffer', 'witch', 'coilback'] },
        pool: [
          { budget: 6, slots: 2, must: 'puffer', from: F11 },
          { budget: 7, slots: 2, must: 'witch', from: [...F11, 'puffer'] },
          { budget: 9, slots: 3, must: 'coilback', from: [...F11, 'puffer', 'witch', 'shark', 'skiff'], attackers: 3 },
        ],
      },
      {
        env: 'shoals', difficulty: 'Ultimate', act: 4, stars: 12, scene: 'shoals',
        nextWaveAt: 0, maxAttackers: 3, lead: 0.72, spreadMul: 0.88, grace: 3, enemyRake: 1, mechanics: ['tide'], boss: 'shellback', crates: 2, bonus: 3000, finale: true,
        finaleText: 'The Shellback scuttles off to sleep, and the Sunset Isles are free! You are the Admiral of the Twelve Seas!',
        victoryLine: 'The Twelve Seas are yours',
        mechanic: 'Rock Forts fire along their red line: change course! Low tide shows sandbars.',
        rumour: { title: 'Shellback Shoals', lines: ['A Rock Fort aims a red line at you. Turn before it goes solid!', 'They say the island in the bay… snores.'], ammo: 'frost', foes: ['fort', 'shellback'] },
        pool: [
          { budget: 8, slots: 3, must: 'fort', from: FROM_12 },
          { budget: 9, slots: 3, must: null, lacked: true, from: FROM_12 },
        ],
      },
    ];
    WANT.forEach((want, i) => {
      const lv = ACT4_LEVELS[i] || {};
      const wrong = Object.keys(want).filter((k) => (k === 'env' ? lv.env?.stub !== want.env : !same(lv[k], want[k])));
      check(wrong.length === 0, `level ${i + 10} (${want.difficulty}): every §2.${i + 3} / §3.5 field exact${wrong.length ? ' -> wrong: ' + wrong.map((k) => `${k} ${JSON.stringify(k === 'env' ? lv.env?.stub : lv[k])}`).join('; ') : ''}`);
    });
    check(ACT4_LEVELS[0].lockText === 'Drive off the Kraken' && !('lockText' in ACT4_LEVELS[1]) && !('lockText' in ACT4_LEVELS[2]), 'card 10 says "Drive off the Kraken"; cards 11 and 12 read "Locked"');
    check(ACT4_LEVELS.filter((l) => l.finale).length === 1 && ACT4_LEVELS[2].finale === true && ACT4_LEVELS[2].boss === 'shellback' && !ACT4_LEVELS[0].boss && !ACT4_LEVELS[1].boss && ACT4_LEVELS.every((l) => !l.kraken && !l.sailOn && !l.teaser), 'only Shellback Shoals is a finale, with the Shellback; no Kraken, no sail-on or teaser in Voyage IV');
    const act3Keys = Object.keys(ACT3_LEVELS[0]).filter((k) => ACT3_LEVELS.every((l) => k in l));
    const missing = ACT4_LEVELS.flatMap((l, i) => act3Keys.filter((k) => !(k in l)).map((k) => `L${i + 10} ${k}`));
    check(act3Keys.length >= 16 && missing.length === 0, `Voyage IV levels have every field the Act III levels have (${act3Keys.length} fields)${missing.length ? ' -> missing ' + missing : ''}`);
    const known = (k) => (P4.isPseudo(k) || (SHIP_TYPES[k] && k !== 'player'));
    const unknownKinds = ACT4_LEVELS.flatMap((l) => [...l.waves.flat(), ...l.pool.flatMap((e) => [e.must, ...e.from].filter((x) => x !== null)), ...l.rumour.foes]).filter((k) => !known(k));
    const unknownIds = ACT4_LEVELS.flatMap((l) => l.mechanics).filter((id) => !MECHANIC_IDS.includes(id) && !MECHANIC3_IDS.includes(id) && !MECHANIC4_IDS.includes(id));
    check(unknownKinds.length === 0 && unknownIds.length === 0, `every pool, wave and rumour names a known kind (a ship type or a pseudo kind) and every mechanic id is known${unknownKinds.length || unknownIds.length ? ' -> ' + [...unknownKinds, ...unknownIds] : ''}`);
    check(ACT4_LEVELS.every((l) => !l.pool.flatMap((e) => e.from).some((k) => ['fireship', 'cutter', 'prahu', 'junk', 'shellback', 'player'].includes(k))), 'no fire ship, no Voyage I cutter, prahu or junk, and never the Shellback in a pool');
    // (level 10 is a breather after the Kraken, §2.8: its bonus 1,800 sits below the Kraken's Deep's 2,500)
    check(ACT4_LEVELS.map((l) => l.bonus).every((b, i, a) => i === 0 || b > a[i - 1]) && ACT4_LEVELS.map((l) => l.stars).join() === '10,11,12' && ACT3_LEVELS[2].stars === 9 && ACT4_LEVELS[2].bonus > ACT3_LEVELS[2].bonus, `bonus and stars rise level by level through Voyage IV, stars on from the Kraken's Deep, the finale's bonus the biggest (${ACT4_LEVELS.map((l) => l.bonus)})`);
    void ACT2_LEVELS;
    // the pools: §3.5's rules on the table itself
    const V4 = P4.V4_KINDS;
    const introWave = {};
    ACT4_LEVELS.forEach((l, li) => l.pool.forEach((e, wi) => e.must && (introWave[e.must] = [li + 10, wi])));
    check(same(introWave, { jolly: [10, 0], stinger: [10, 1], netsloop: [10, 2], puffer: [11, 0], witch: [11, 1], coilback: [11, 2], fort: [12, 0] }) && same(introWave, JSON.parse(JSON.stringify(P4.INTRO))), `each must introduces its kind in pools.js's INTRO order (${JSON.stringify(introWave)})`);
    const order = (k) => (introWave[k] ? introWave[k][0] * 10 + introWave[k][1] : -1);
    const early = ACT4_LEVELS.flatMap((l, li) => l.pool.flatMap((e, wi) => e.from.filter((k) => V4.includes(k) && order(k) >= (li + 10) * 10 + wi).map((k) => `${li + 10}·${wi + 1} ${k}`)));
    check(early.length === 0, `no pool draws a Voyage IV kind before (or in) the wave that introduces it${early.length ? ' -> ' + early : ''}`);
    check(
      ACT4_LEVELS.every((l) => l.pool.every((e) => Number.isInteger(e.budget) && e.budget > 0 && Number.isInteger(e.slots) && e.slots >= 1 && e.slots <= 3 && Array.isArray(e.from) && e.from.length >= 3 && (e.attackers === undefined || (Number.isInteger(e.attackers) && e.attackers >= 1)))),
      'every pool entry has a whole budget, 1–3 slots, a from list and (optionally) whole attackers'
    );
    const cost = (k) => P4.KIND_COST[k];
    check(ACT4_LEVELS.every((l) => l.pool.every((e) => (e.must ? cost(e.must) <= e.budget : true) && e.from.every((k) => Number.isInteger(cost(k))))), 'every kind in a pool has a KIND_COST, and every must fits its budget');
    check(ACT4_LEVELS[2].pool[1].from.every((k) => k !== 'fort') && ACT4_LEVELS[2].pool[1].lacked === true && ACT4_LEVELS[2].pool[1].must === null, "level 12's wave 2: no fort, its must one Voyage IV kind wave 1 lacked");
    check(ACT4_LEVELS.every((l, i) => l.pool === P4.POOLS[i + 10]), "each level's pool is pools.js's POOLS entry itself (one home for §3.5's numbers)");
    // the fallback waves: the plays-0 draw
    const draws = ACT4_LEVELS.map((l, i) => P4.drawWaves(i + 10, l.pool, P4.poolSeed(i + 10, 0)));
    check(ACT4_LEVELS.every((l, i) => same(l.waves, draws[i])), `waves equal drawWaves(level, pool, poolSeed(level, 0)) (${ACT4_LEVELS.map((l) => JSON.stringify(l.waves)).join(' | ')})`);
    const problems = ACT4_LEVELS.flatMap((l, i) => l.waves.flatMap((wv, k) => P4.waveProblems(i + 10, k, wv, k ? l.waves[k - 1] : null, l.pool).map((p) => `L${i + 10} w${k + 1}: ${p}`)));
    check(problems.length === 0, `the fallback waves keep every rule (pools.waveProblems)${problems.length ? ' -> ' + problems : ''}`);
    const most = ACT4_LEVELS.map((l) => Math.max(...l.pool.map((e, k) => (k === 0 ? e.slots : l.nextWaveAt + e.slots))));
    check(most.every((n) => n <= P4.POOL_RULES.alive), `≤ 3 slots a wave and nextWaveAt keeps ≤ 4 slots alive at once (${most})`);
    check(
      ACT4_LEVELS.every((l) => Number.isInteger(l.nextWaveAt) && l.maxAttackers >= 1 && l.lead > 0 && l.lead <= 1 && l.spreadMul > 0 && l.grace >= 0 && l.crates === 2 && typeof l.mechanic === 'string' && l.rumour.lines.length === 2 && ['grape', 'fire', 'frost', 'stink'].includes(l.rumour.ammo) && l.act === 4),
      'every Voyage IV level has sane knobs, 2 powder crates, a mechanic line and a 2-line rumour naming a shot'
    );
    check(ACT4_LEVELS.every((l) => l.mechanics.length === 1 && MECHANIC4_IDS.includes(l.mechanics[0])) && ACT4_LEVELS.map((l) => l.mechanics[0]).join() === 'fog,currents,tide', 'each sea has one Voyage IV hazard: fog, currents, the tide');
    const lines = ACT4_LEVELS.flatMap((l) => [l.mechanic, ...l.rumour.lines]);
    check(lines.every((s) => s.length <= 110 && !/<kbd>/.test(s)), 'the mechanic and rumour lines are short and name no key (no touch variant needed)');
  }

  console.log(failures ? `\n${failures} check(s) failed` : `\nAll mechanics4 checks passed (${passes})`);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
