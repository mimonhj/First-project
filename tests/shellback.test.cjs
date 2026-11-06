// Unit checks for the Shellback in src/shellback.js (plain Node, no browser), SPEC4 §3.6, §11.1, §13.1. The simulation
// runs against a mock of the ctx main.js hands it, with a scripted ship that obeys push() as main does:
// - the API: exact exports, SHELLBACK as §3.6 (none of STATUS / FORT / WARN copied into it)
// - the wake (6 s, 3 s short, skippable), the bar and its notches; the phases at 2,000 and 1,000, and all three towers
//   down → phase 2; the parts of each phase and their multipliers (towers ×1, eyes ×1.5, dizzy ×2, claws, shell ×0.5)
// - the attacks: the towers' sight lines (1.3 + 0.5 s, 10, within 50 u), the claw sweep (r 14, 100°, 1.8 s, within
//   16 u, 12 + a 4 u shove), the boulder (every 9 s, r 5, 2.0 s, 12), the charge (7 × ≤ 45 u, 2.0 s, 14 + a 4 u shove,
//   the run at 14 u/s, dizzy 4 s); every warning ≥ 1.5 s (+ the bonus); never more than ctx.warn.boss (2) telegraphed
//   at once (a ctx with 1 is obeyed); no charge within 6 s of a sweep; a downed claw can't sweep for 8 s; cutOff at
//   12 s; hold() holds its attacks; specials from ctx.tables (altered tables are used); every spot in open water
// - contact: the standoff, the push ≥ the body's speed + 2 u/s, and 600 s of each phase with 5 scripted players
//   (standing, circling, chasing it, hugging the arena's edge, ramming it at full speed): outside a Charge's run never
//   inside the body for more than 1 s, never pushed onto land or beyond worldRadius − 10, always a free direction, no
//   damage from a push; the body never leaves the arena and is never on land
// - driven off at 0: done, the walk home, the Conch (+1,200); determinism; a junk ctx never throws
// The 1C exit check is the "EXIT" block at the end.
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
// shellback.js imports nothing: it loads from its source as a data: URL. (SHELLBACK_JS points the suite at another
// copy, for checking that the checks catch a broken one.)
async function load(rel, env) {
  const file = env && process.env[env] ? process.env[env] : path.join(ROOT, rel);
  const src = fs.readFileSync(file, 'utf8');
  if (/^\s*import\s[^(]/m.test(src)) throw new Error(`${rel} has imports now; load it another way`);
  return import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const f2 = (v) => (typeof v === 'number' ? v.toFixed(2) : String(v));
const DT = 1 / 120;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = (a) => {
  let v = (a + Math.PI) % TAU;
  if (v < 0) v += TAU;
  return v - Math.PI;
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
function hullDist(p, x, z) {
  const fx = Math.sin(p.h);
  const fz = Math.cos(p.h);
  const half = p.len / 2;
  const along = clamp((x - p.x) * fx + (z - p.z) * fz, -half, half);
  return Math.hypot(x - (p.x + fx * along), z - (p.z + fz * along));
}

const TABLES = {
  STATUS: { fire: { dps: 3, time: 6, boss: 3 }, frost: { speed: 0.5, turn: 0.6, time: 5, add: 2, max: 8, bossMul: 0.5 }, stink: { time: 4, boss: 2, immune: 10, bossImmune: 20, grit: 0.75, decel: 2 }, kaboom: { burst: 15 } },
  FORT: { track: 1.3, lock: 0.5, traverse: 0.2, hw: 0.6 },
};
// Shellback Shoals' layout as the Stage 0 stub has it: the lair and the arena at (0, 40), world radius 150; islands
// round the arena (clear of it by more than 12) for the land checks.
const ARENA = { x: 0, z: 40, r: 70 };
const LAIR = { x: 0, z: 40, r: 12 };
const LANDS = [
  { x: 0, z: 40 + 70 + 18, r: 5 },
  { x: 80, z: 60, r: 6 },
  { x: -85, z: 20, r: 7 },
  { x: 30, z: -50, r: 5 },
];
const onLand = (x, z, r = 0) => LANDS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + r);

function makeWorld(S, o = {}) {
  const rng = mulberry32(o.seed ?? 7);
  const player = { x: 0, z: 0, h: 0, speed: 0, len: 10, wid: 3.6, kind: 'player', ...(o.player || {}) };
  const ships = (o.ships || []).map((s) => ({ len: 10, wid: 3.6, h: 0, speed: 0, ...s }));
  const log = { damage: [], pops: [], sfx: [], live: [], conch: [], warn: [] };
  const warn = {
    max: o.warnMax ?? Infinity,
    boss: o.boss === undefined ? 2 : o.boss,
    count: 0,
    take(kind) {
      if (this.count >= this.max) return false;
      this.count++;
      log.warn.push({ t: w.t, kind, take: true });
      return true;
    },
    give(kind) {
      this.count = Math.max(0, this.count - 1);
      log.warn.push({ t: w.t, kind, take: false });
    },
  };
  const w = { t: 0, player, ships, log, warn, hold: false, script: o.script || null, alive: true, pushLog: [] };
  const ctx = {
    player: () => (w.alive ? { x: player.x, z: player.z, h: player.h, speed: player.speed, len: player.len, wid: player.wid } : null),
    ships: () => ships.map((s) => ({ ...s })),
    damage: (amount, x, z, source) => log.damage.push({ t: w.t, amount, x, z, source, at: { ...player } }),
    land: (x, z, r) => onLand(x, z, Number(r) || 0),
    world: { x: 0, z: 0, r: o.worldR ?? 150 },
    rng: () => rng(),
    warnBonus: () => o.bonus ?? 0,
    pop: (text, x, y, z, style) => log.pops.push({ t: w.t, text, x, z, style }),
    announce: (text) => log.live.push({ t: w.t, text }),
    sfx: (name, x, z, opts) => log.sfx.push({ t: w.t, name, x, z, opts }),
    arena: o.arena || ARENA,
    lair: o.lair || LAIR,
    warn,
    hold: () => w.hold,
    conch: (gold) => log.conch.push({ t: w.t, gold }),
    tables: o.tables || TABLES,
  };
  w.ctx = ctx;
  w.s = S.createShellback(ctx);
  // one step: the script steers and moves your ship (as main's updatePlayer), the Shellback steps, then its push
  // moves every ship (main: after separateShips)
  w.step = () => {
    if (w.script) w.script(w, DT);
    w.s.step(DT);
    for (const sh of [player, ...ships]) {
      const v = w.s.push(sh);
      if (v) {
        sh.x += v.vx * DT;
        sh.z += v.vz * DT;
        w.pushLog.push({ t: w.t, vx: v.vx, vz: v.vz, who: sh === player ? 'player' : sh.id });
        if (w.pushLog.length > 4000) w.pushLog.splice(0, 2000);
      }
    }
    w.t += DT;
  };
  w.run = (secs, each) => {
    const n = Math.round(secs / DT);
    for (let i = 0; i < n; i++) {
      w.step();
      if (each && each(w) === false) return;
    }
  };
  // straight into the fight (the wake skipped)
  w.fight = (hp) => {
    w.s.wake(LAIR.x, LAIR.z);
    w.s.skip();
    if (hp !== undefined) w.s.setHp(hp);
  };
  return w;
}
const sail = (speed, turn = 0) => (w, dt) => {
  const p = w.player;
  p.h += turn * dt;
  p.speed = speed;
  p.x += Math.sin(p.h) * speed * dt;
  p.z += Math.cos(p.h) * speed * dt;
};

(async () => {
  const B = await load('src/shellback.js', 'SHELLBACK_JS');
  const { SHELLBACK, createShellback } = B;
  try {
    const S = await load('src/specials.js');
    check(same(S.STATUS, TABLES.STATUS), 'the mock STATUS is specials.js STATUS');
  } catch (e) {
    check(false, `specials.js loads (${e.message})`);
  }
  try {
    const F = await load('src/foes4.js');
    check(F.FORT.track === TABLES.FORT.track && F.FORT.lock === TABLES.FORT.lock && F.FORT.traverse === TABLES.FORT.traverse && F.FORT.hw === TABLES.FORT.hw, "the mock FORT is foes4.js's (the towers' sight line)");
  } catch (e) {
    check(false, `foes4.js loads (${e.message})`);
  }
  let WORDS4 = null;
  try {
    const M = await load('src/mechanics4.js');
    WORDS4 = M.WORDS4;
    check(M.WARN && M.WARN.boss === 2, 'mechanics4.js WARN.boss is 2 (the cap main passes as ctx.warn.boss)');
  } catch (e) {
    check(false, `mechanics4.js loads (${e.message})`);
  }
  let audioNames = null;
  try {
    const m = fs.readFileSync(path.join(ROOT, 'src/audio.js'), 'utf8').match(/export const SFX_NAMES = \[([\s\S]*?)\];/);
    audioNames = m ? [...m[1].replace(/\/\/[^\n]*/g, '').matchAll(/'([^']+)'/g)].map((x) => x[1]) : null;
  } catch {
    audioNames = null;
  }

  // ================================================================ API and table
  {
    check(same(Object.keys(B).sort(), ['SHELLBACK', 'createShellback']), 'exports exactly SHELLBACK and createShellback');
    const api = Object.keys(createShellback({})).sort();
    const want = ['bar', 'boardWhy', 'dispose', 'done', 'hit', 'hits', 'hp', 'over', 'phase', 'playerMods', 'push', 'rising', 'setHp', 'skip', 'special', 'state', 'status', 'step', 'targets', 'visuals', 'wake'];
    check(same(api, want), `createShellback() has §11.1's members plus skip, setHp, status, over (${api.join(', ')})`);
    const S = SHELLBACK;
    check(S.hp === 3000 && same(S.notches, [2000, 1000]) && S.conch === 1200 && S.towers.n === 3 && S.towers.hp === 340 && S.claws.n === 2 && S.claws.hp === 300 && S.body.r === 8 && S.body.lair === 12, 'SHELLBACK: bar 3,000, notches 2,000 / 1,000, the Conch 1,200, towers 3 × 340, claws 2 × 300, body r 8, lair r 12');
    check(S.push === 8 && S.standoff === 1 && S.push >= Math.max(...S.phases.map((p) => p.walk)) + 2, `the push ${S.push} u/s ≥ the fastest walk (${Math.max(...S.phases.map((p) => p.walk))}) + 2; standoff 1 u`);
    check(S.phases[1].walk === 4.5 && S.phases[2].walk === 6 && S.phases[0].walk === 0, 'walks 0 / 4.5 / 6 u/s');
    check(S.sweep.reach === 16 && S.sweep.r === 14 && S.sweep.angle === 100 && S.sweep.warn === 1.8 && S.sweep.damage === 12 && S.sweep.shove === 4, 'the claw sweep: within 16 u, r 14, 100°, 1.8 s, 12 and a 4 u push');
    check(S.boulder.every === 9 && S.boulder.r === 5 && S.boulder.aim === 4 && S.boulder.warn === 2 && S.boulder.damage === 12, 'the boulder: every 9 s, r 5 at your predicted spot ± 4 u, 2.0 s, 12');
    check(S.charge.every === 10 && S.charge.w === 7 && S.charge.len === 45 && S.charge.warn === 2 && S.charge.speed === 14 && S.charge.damage === 14 && S.charge.shove === 4 && S.charge.dizzy === 4, 'the charge: every 10 s, a lane 7 × 45 u, 2.0 s, 14 u/s, 14 and a 4 u shove, dizzy 4 s');
    check(S.chargeGap === 6 && S.cutOff === 12 && S.towers.every === 3 && S.towers.range === 50 && S.towers.damage === 10, 'chargeGap 6 s, cutOff 12 s; the towers sight you in turn every 3 s within 50 u for 10');
    check(S.eyes.mul === 1.5 && S.eyes.dizzy === 2 && S.shell.mul === 0.5 && S.towers.mul === 1 && S.claws.mul === 1 && S.claws.droop === 8, 'eyes ×1.5 (×2 dizzy), shell ×0.5, towers and claws ×1, a downed claw droops 8 s');
    check(S.dread === 4 && S.wake === 6 && S.shortWake === 3, 'the dread 4 s, the wake 6 s (3 s short)');
    const flat = JSON.stringify(S);
    check(!/bossImmune|bossMul|"traverse"|"boss"/.test(flat) && !('track' in S) && !('maxTelegraphs' in S), 'none of STATUS, FORT or WARN.boss is copied into SHELLBACK (ctx.tables, ctx.warn.boss)');
  }

  // ================================================================ the wake, the bar, the phases
  {
    const w = makeWorld(B);
    check(w.s.bar === null && w.s.phase === 0 && w.s.targets().length === 0 && w.s.rising === false, 'asleep: no bar, no phase, no targets');
    check(w.s.wake() === true && w.s.rising === true && w.s.wake() === false, 'wake() starts the wake once');
    const b = w.s.state.body;
    check(b.x === LAIR.x && b.z === LAIR.z, 'with no spot it wakes at ctx.lair');
    let fightAt = null;
    w.run(8, (w) => {
      if (fightAt === null && !w.s.rising) fightAt = w.t;
    });
    check(Math.abs(fightAt - 6) < 0.02 && w.s.phase === 1, `the wake lasts 6 s, then phase 1 (${f2(fightAt)})`);
    const bar = w.s.bar;
    check(bar.name === 'THE SHELLBACK' && bar.frac === 1 && same(bar.notches, [0.667, 0.333]), `the bar: THE SHELLBACK, notches at 2,000 and 1,000 (${JSON.stringify(bar.notches)})`);
    const w2 = makeWorld(B);
    w2.s.wake(0, 40, { short: true });
    let t2 = null;
    w2.run(5, (w) => {
      if (t2 === null && !w.s.rising) t2 = w.t;
    });
    check(Math.abs(t2 - 3) < 0.02 && w2.s.hp === 3000, `the short wake lasts 3 s, at full 3,000 hp (${f2(t2)})`);
    const w3 = makeWorld(B);
    w3.s.wake();
    check(w3.s.skip() === true && w3.s.phase === 1 && w3.s.skip() === false, 'skip() ends the wake at once');
  }
  {
    // phase 1: only the towers; each 340 hp ×1; TOWER DOWN!; the bar falls with them; all three down → phase 2
    const w = makeWorld(B);
    w.fight();
    const tg = w.s.targets();
    check(tg.length === 3 && tg.every((t) => t.kind === 'tower' && t.hp === 340 && t.maxHp === 340), `phase 1: the fort's three towers are the targets (${tg.map((t) => t.id).join(', ')})`);
    const t0 = tg[0];
    check(w.s.hits(t0.id, t0.x, 7, t0.z) === true && w.s.hits(t0.id, t0.x, 1, t0.z) === false && w.s.hits('shell', 0, 3, 40) === false, 'hits(): a tower between its foot and its top; no shell in phase 1');
    const r1 = w.s.hit(t0.id, { dmg: 100 });
    check(r1.dmg === 100 && r1.word === null && w.s.hp === 2900, 'a tower ×1, off the bar too');
    const r2 = w.s.hit(t0.id, { dmg: 500 });
    check(r2.dmg === 240 && r2.word === 'TOWER DOWN!' && w.s.hp === 2660 && w.s.targets().length === 2, `"TOWER DOWN!": a tower takes at most its own hp (${r2.dmg})`);
    w.s.hit(tg[1].id, { dmg: 340 });
    check(w.s.phase === 1, 'two down: still phase 1');
    const r3 = w.s.hit(tg[2].id, { dmg: 340 });
    check(r3.word === 'TOWER DOWN!' && w.s.phase === 2 && w.s.hp === 1980, `all three down → phase 2 (bar ${w.s.hp})`);
    const wt = makeWorld(B);
    wt.fight();
    const tt = wt.s.targets();
    wt.s.hit(tt[0].id, { dmg: 340 });
    wt.s.hit(tt[1].id, { dmg: 340 });
    wt.s.setHp(2900);
    wt.s.hit(tt[2].id, { dmg: 340 });
    check(wt.s.phase === 2 && wt.s.hp > 2000, `the third tower down starts phase 2 even with the bar above 2,000 (${wt.s.hp})`);
    const p2 = w.s.targets();
    check(p2.some((t) => t.kind === 'eye') && p2.filter((t) => t.kind === 'claw').length === 2 && p2.some((t) => t.kind === 'shell') && !p2.some((t) => t.kind === 'tower'), `phase 2: eyes, two claws and the shell (${p2.map((t) => t.id).join(', ')})`);
    check(p2[0].kind === 'eye' && p2[1].kind === 'eye', 'the eyes come first (they sit in the shell)');
    // the bar alone: at 2,000 and 1,000
    const w2 = makeWorld(B);
    w2.fight();
    w2.s.setHp(2001);
    check(w2.s.phase === 1, '2,001: phase 1');
    w2.s.setHp(2000);
    check(w2.s.phase === 2 && w2.s.state.towers.every((t) => t.down), 'the bar at 2,000: phase 2 (the towers left crumble)');
    w2.s.setHp(1001);
    check(w2.s.phase === 2, '1,001: phase 2');
    const shell = w2.s.targets().find((t) => t.kind === 'shell');
    w2.s.hit(shell.id, { dmg: 2 });
    check(w2.s.phase === 3 && w2.s.hp === 1000, 'a hit to 1,000: phase 3');
    w2.run(1.6);
    check(w2.s.state.body.fort === false && !!w2.s.visuals().splash, 'phase 3: it throws the fort off its back (a big splash)');
    check(!w2.log.damage.length, 'the splash does no damage');
  }
  {
    // the parts' multipliers and words (phase 2), the claws, dizzy ×2 (phase 3)
    const w = makeWorld(B, { player: { x: 0, z: 0 } });
    w.fight(1990);
    const tg = w.s.targets();
    const eye = tg.find((t) => t.kind === 'eye');
    const claw = tg.find((t) => t.kind === 'claw');
    const sh = tg.find((t) => t.kind === 'shell');
    const a = w.s.hit(eye.id, { dmg: 10 });
    const b = w.s.hit(sh.id, { dmg: 10 });
    const c = w.s.hit(claw.id, { dmg: 10 });
    check(a.dmg === 15 && a.word === 'BULLSEYE!' && b.dmg === 5 && b.word === 'CLANG!' && c.dmg === 10 && c.word === null, `eyes ×1.5 "BULLSEYE!", shell ×0.5 "CLANG!", claw ×1 (${a.dmg}, ${b.dmg}, ${c.dmg})`);
    check(w.s.hp === 1990 - 30, 'every hit comes off the bar');
    const eyeAt = w.s.visuals().eyes[0];
    check(w.s.hits(eye.id, eyeAt.x, eyeAt.y, eyeAt.z) === true && w.s.hits(sh.id, eyeAt.x, eyeAt.y, eyeAt.z) === false, "an eye's centre hits the eye, not the shell");
    const d = w.s.hit(claw.id, { dmg: 400 });
    check(d.dmg === 290 && d.word === 'OUCH!' && !w.s.targets().some((t) => t.id === claw.id), '"OUCH!": a claw of 300 droops (no target)');
    check(w.s.hit(eye.id, { dmg: 1, crit: true }).word === 'BULLSEYE!' && w.s.hit(sh.id, { dmg: 1, crit: true }).word === 'CLANG!', 'its own word wins over CRIT!');
    w.run(8.1);
    check(w.s.targets().some((t) => t.id === claw.id && t.hp === 300), 'after 8 s the claw is back, at 300');
    check(w.s.boardWhy('shell') === 'monster' && w.s.boardWhy() === 'monster' && same(w.s.playerMods(), { speedMul: 1, turnMul: 1 }), 'boardWhy() is "monster"; playerMods() changes nothing');
  }

  // ================================================================ attacks: sweeps, boulders, charges, towers
  // a long run of one phase with a scripted player, recording every telegraph
  function phaseRun(o) {
    const w = makeWorld(B, { seed: o.seed ?? 3, bonus: o.bonus, boss: o.boss, warnMax: o.warnMax, player: o.player || { x: 0, z: 0, h: Math.PI / 2 } });
    w.fight(o.hp);
    if (o.script) w.script = o.script;
    const seen = new Map();
    let maxTele = 0;
    let maxShapes = 0;
    let mismatch = 0;
    w.run(o.secs ?? 120, (w) => {
      const st = w.s.state;
      maxTele = Math.max(maxTele, st.telegraphs);
      const v = w.s.visuals();
      const shapes = v.rings.length + v.sectors.length + v.lanes.filter((l) => l.state === 'warn').length + v.lines.length;
      maxShapes = Math.max(maxShapes, shapes);
      if (shapes !== w.warn.count) mismatch++;
      for (const a of st.attacks) if (!seen.has(a.id)) seen.set(a.id, { id: a.id, kind: a.kind, t0: w.t, T: a.T });
      for (const a of st.attacks) seen.get(a.id).T = a.T;
      if (o.each) o.each(w);
    });
    return { w, list: [...seen.values()], maxTele, maxShapes, mismatch };
  }
  // a fight round the bay: circling the arena's centre at 24 u (the body walks after you, so it comes and goes)
  const orbit = (speed) => (w, dt) => {
    const p = w.player;
    const want = Math.atan2(p.x - ARENA.x, p.z - ARENA.z) + Math.PI / 2;
    const d = Math.hypot(p.x - ARENA.x, p.z - ARENA.z);
    p.h = want + clamp((d - 24) * 0.08, -0.6, 0.6);
    p.speed = speed;
    p.x += Math.sin(p.h) * speed * dt;
    p.z += Math.cos(p.h) * speed * dt;
  };
  {
    const r = phaseRun({ hp: 1990, secs: 150, script: orbit(4) });
    const sweeps = r.list.filter((a) => a.kind === 'sweep');
    const boulders = r.list.filter((a) => a.kind === 'boulder');
    check(sweeps.length >= 5, `phase 2: the claws sweep while you are within 16 u (${sweeps.length} in 150 s)`);
    const bt = boulders.map((a) => a.t0);
    const bGaps = bt.slice(1).map((t, i) => t - bt[i]);
    check(boulders.length >= 10 && bGaps.every((g) => g >= 9 - 0.05), `a boulder every 9 s (at least: ${bGaps.slice(0, 6).map(f2).join(' ')})`);
    check(sweeps.every((a) => a.T >= 1.8 - 1e-6) && boulders.every((a) => a.T >= 2.0 - 1e-6), 'sweeps warn ≥ 1.8 s, boulders ≥ 2.0 s');
    check(r.maxTele <= 2, `never more than 2 attacks telegraphed at once (max ${r.maxTele})`);
    check(r.mismatch === 0, 'every shape on show holds exactly one ctx.warn slot');
    const hits = r.w.log.damage;
    check(hits.length > 0 && hits.every((d) => (d.source === 'sweep' && d.amount === 12) || (d.source === 'boulder' && d.amount === 12)), `sweeps and boulders do 12 (${hits.length} hits)`);
    check(!r.list.some((a) => a.kind === 'charge' || a.kind === 'tower'), 'no charges or tower lines in phase 2');
  }
  {
    // the sweep's sector: only a hull inside it; the 4 u push; only within 16 u
    const w = makeWorld(B, { player: { x: 0, z: 40 - 15, h: Math.PI / 2 } });
    w.fight(1990);
    let sec = null;
    w.run(8, (w) => {
      const v = w.s.visuals();
      if (!sec && v.sectors.length) sec = { ...v.sectors[0], p: { ...w.player } };
      if (sec && w.log.damage.length) return false;
    });
    check(!!sec && sec.r === 14 && Math.abs(sec.half - (50 * Math.PI) / 180) < 1e-9 && sec.T >= 1.8, 'a red sector r 14, 100°, ≥ 1.8 s');
    const before = { ...w.player };
    w.run(0.4);
    const moved = Math.hypot(w.player.x - before.x, w.player.z - before.z);
    check(w.log.damage.length === 1 && w.log.damage[0].source === 'sweep' && moved > 3.5 && moved < 4.6, `"SNIP!": 12 and a 4 u push away (${f2(moved)} u)`);
    check(w.log.pops.some((p) => p.text === 'SNIP!') && w.log.sfx.some((s) => s.name === 'snip'), 'with "SNIP!" and its snip');
    // sail out of the sector while it warns: safe
    const w2 = makeWorld(B, { player: { x: 0, z: 40 - 15, h: Math.PI / 2 } });
    w2.fight(1990);
    let dodged = false;
    w2.run(8, (w) => {
      const v = w.s.visuals();
      if (v.sectors.length && !dodged) {
        dodged = true;
        w.player.h = Math.PI;
        w.script = sail(10);
      }
      if (dodged && w.s.state.counts.sweeps && !w.s.visuals().sectors.length) return false;
    });
    check(dodged && !w2.log.damage.some((d) => d.source === 'sweep'), 'a ship that sails out of the sector is safe');
    // a ship lying broadside to it (as a ship firing at it does), as near as its standoff lets it come: swept
    const wb = makeWorld(B, { player: { x: 4, z: 22, h: 1.4 } });
    wb.fight(1990);
    wb.run(6);
    check(wb.s.state.counts.sweeps >= 1 && wb.log.damage.some((d) => d.source === 'sweep'), `a ship lying broadside at its standoff is within its claws' reach (${wb.s.state.counts.sweeps} sweeps in 6 s)`);
    // beyond 16 u: no sweep
    const w3 = makeWorld(B, { player: { x: 0, z: 40 - 30, h: Math.PI / 2 } });
    w3.fight(1990);
    w3.script = (w) => {
      // keep 25 u off its centre
      const b = w.s.state.body;
      const d = Math.hypot(w.player.x - b.x, w.player.z - b.z);
      if (d < 25) {
        const ux = (w.player.x - b.x) / d;
        const uz = (w.player.z - b.z) / d;
        w.player.x = b.x + ux * 25;
        w.player.z = b.z + uz * 25;
      }
    };
    w3.run(30);
    check(w3.s.state.counts.sweeps === 0, 'beyond 16 u it never sweeps');
  }
  {
    // a downed claw can't sweep for 8 s (both down: no sweep at all)
    const w = makeWorld(B, { player: { x: 0, z: 40 - 15, h: Math.PI / 2 } });
    w.fight(1990);
    w.run(0.2);
    for (const t of w.s.targets()) if (t.kind === 'claw') w.s.hit(t.id, { dmg: 300 });
    const s0 = w.s.state.counts.sweeps;
    let firstAfter = null;
    w.run(12, (w) => {
      if (firstAfter === null && w.s.state.counts.sweeps > s0) firstAfter = w.t;
    });
    check(firstAfter !== null && firstAfter >= 0.2 + 8 - 0.05, `with both claws drooping no sweep for 8 s (next at ${f2(firstAfter)} s)`);
    // one claw down: no sweep comes from it
    const w2 = makeWorld(B, { player: { x: 0, z: 40 - 15, h: Math.PI / 2 } });
    w2.fight(1990);
    w2.run(0.2);
    const left = w2.s.targets().find((t) => t.id === 'clawL');
    w2.s.hit(left.id, { dmg: 300 });
    const claws = [];
    w2.run(7.5, (w) => {
      for (const s of w.s.visuals().sectors) claws.push(s.claw);
    });
    check(claws.length > 0 && claws.every((c) => c === 'clawR'), `one claw drooping: the other sweeps (${[...new Set(claws)].join(', ')})`);
  }
  {
    // phase 3: charges every 10 s after the dizzy, no boulders, sweeps go on; no charge within 6 s of a sweep
    const r = phaseRun({ hp: 990, secs: 180, script: orbit(5), seed: 5 });
    const charges = r.list.filter((a) => a.kind === 'charge');
    // (a ship that keeps near it: the sweeps between the charges)
    const r2 = phaseRun({ hp: 990, secs: 180, seed: 6, player: { x: 0, z: 40 - 20, h: Math.PI / 2 } });
    const sweeps = r2.list.filter((a) => a.kind === 'sweep');
    for (const c of r2.list.filter((a) => a.kind === 'charge')) charges.push({ ...c, t0: c.t0 + 1e6 });
    const pairs = r2.list.filter((a) => a.kind === 'charge');
    check(charges.length >= 6, `phase 3: it charges (${charges.length} in 180 s)`);
    check(!r.list.some((a) => a.kind === 'boulder' && a.t0 > 0.1) || r.w.s.state.counts.cutOffs >= r.list.filter((a) => a.kind === 'boulder').length, 'no boulders in phase 3 (only a cut-off\'s)');
    const gaps = [];
    for (const c of pairs) for (const s of sweeps) gaps.push(Math.abs(c.t0 - s.t0));
    check(sweeps.length >= 3 && pairs.length >= 3 && gaps.every((g) => g >= 6 - 1e-6), `the sweeps go on between charges, never within 6 s of one (${sweeps.length} sweeps, ${pairs.length} charges, closest ${f2(Math.min(...gaps))} s)`);
    check(charges.every((a) => a.T >= 2.0 - 1e-6), 'a charge warns ≥ 2.0 s');
    check(r.maxTele <= 2 && r.mismatch === 0, `≤ 2 telegraphed at once (max ${r.maxTele}), each holding a warning slot`);
  }
  {
    // the charge: a lane 7 × ≤ 45 u through your predicted spot; 14 and a 4 u shove to a hull in it; the run; dizzy
    const w = makeWorld(B, { player: { x: 0, z: 40 - 15, h: Math.PI / 2 } });
    w.fight(990);
    let lane = null;
    let runAt = null;
    let dizzyAt = null;
    let warnAt = null;
    w.run(12, (w) => {
      const v = w.s.visuals();
      const L = v.lanes[0];
      if (L && L.state === 'warn' && !lane) {
        lane = { ...L };
        warnAt = w.t;
      }
      if (L && L.state === 'run' && runAt === null) runAt = w.t;
      if (runAt !== null && dizzyAt === null && w.s.state.body.state === 'dizzy') dizzyAt = w.t;
      if (dizzyAt !== null) return false;
    });
    const len = lane ? Math.hypot(lane.x1 - lane.x0, lane.z1 - lane.z0) : 0;
    check(!!lane && lane.w === 7 && len <= 45 + 1e-6 && len >= 12, `"CHARGE!": a lane 7 wide and ≤ 45 u long (${f2(len)} u)`);
    check(warnAt !== null && runAt - warnAt >= 2.0 - 0.02, `it crouches behind it 2.0 s (${f2(runAt - warnAt)})`);
    const hit = w.log.damage.find((d) => d.source === 'charge');
    check(!!hit && hit.amount === 14, 'a hull in the lane takes 14');
    check(dizzyAt !== null && Math.abs(dizzyAt - runAt - len / 14) < 0.05, `then it runs the lane at 14 u/s (${f2(dizzyAt - runAt)} s for ${f2(len)} u) and is dizzy`);
    const b = w.s.state.body;
    check(Math.hypot(b.x - lane.x1, b.z - lane.z1) < 0.05, 'it ends its run at the lane\'s end');
    // dizzy ×2
    const eye = w.s.targets().find((t) => t.kind === 'eye');
    const r = w.s.hit(eye.id, { dmg: 10 });
    check(r.dmg === 20 && r.word === 'BONK!', `dizzy: the eyes ×2 ("BONK!": ${r.dmg})`);
    let dz = 0;
    w.run(4.5, (w) => {
      if (w.s.state.body.state === 'dizzy') dz += DT;
    });
    check(Math.abs(dz + (w.t - dizzyAt - 4.5) * 0 - (4 - (w.t - 4.5 - dizzyAt))) < 0.1 || (dz > 3.4 && dz < 4.1), `dizzy 4 s (${f2(dz)} s left after the hit)`);
    // the shove: the hit hull left the lane band
    const w2 = makeWorld(B, { player: { x: 0, z: 40 - 15, h: Math.PI / 2 } });
    w2.fight(990);
    let L2 = null;
    let at = null;
    w2.run(12, (w) => {
      const v = w.s.visuals().lanes[0];
      if (v && v.state === 'warn') L2 = v;
      if (v && v.state === 'run' && at === null) at = { ...w.player, t: w.t };
      if (at && w.t >= at.t + 0.3) return false;
    });
    const off = (q) => {
      const ux = (L2.x1 - L2.x0) / Math.hypot(L2.x1 - L2.x0, L2.z1 - L2.z0);
      const uz = (L2.z1 - L2.z0) / Math.hypot(L2.x1 - L2.x0, L2.z1 - L2.z0);
      return Math.abs((q.x - L2.x0) * uz - (q.z - L2.z0) * ux);
    };
    check(!!at && off(w2.player) - off(at) > 2, `and a shove out of the lane at once (${f2(off(at))} → ${f2(off(w2.player))} u from its line)`);
    // sailing out of the lane while it warns is safe
    const w3 = makeWorld(B, { player: { x: 0, z: 40 - 15, h: Math.PI / 2 } });
    w3.fight(990);
    let dodged = false;
    w3.run(12, (w) => {
      const v = w.s.visuals().lanes[0];
      if (v && v.state === 'warn' && !dodged) {
        dodged = true;
        w.player.h = Math.atan2(v.x1 - v.x0, v.z1 - v.z0) + Math.PI / 2;
        w.script = sail(10);
      }
      if (dodged && w.s.state.body.state === 'dizzy') return false;
    });
    check(dodged && !w3.log.damage.some((d) => d.source === 'charge'), 'a ship that sails out of the lane is safe');
  }
  {
    // phase 1: the towers sight you in turn, one every 3 s, within 50 u, 10 on the locked line
    const r = phaseRun({ secs: 60, player: { x: 0, z: 40 - 30, h: 0 } });
    const lines = r.list.filter((a) => a.kind === 'tower');
    const t0 = lines.map((a) => a.t0);
    const gaps = t0.slice(1).map((t, i) => t - t0[i]);
    check(lines.length >= 15 && gaps.every((g) => g >= 3 - 0.02), `phase 1: a tower line every 3 s (${lines.length} in 60 s, min gap ${f2(Math.min(...gaps))})`);
    check(lines.every((a) => a.T >= 1.8 - 1e-6), 'each warns ≥ 1.8 s (1.3 tracking + 0.5 locked)');
    const ids = r.w.log.warn.filter((x) => x.kind === 'tower').length;
    check(ids > 0, 'each takes a warning slot');
    const hits = r.w.log.damage.filter((d) => d.source === 'tower');
    check(hits.length >= 10 && hits.every((d) => d.amount === 10), `10 to you standing on its line (${hits.length})`);
    const turns = new Set(r.w.s.state.attacks.map((a) => a.id));
    void turns;
    // in turn: the towers take turns
    const w = makeWorld(B, { player: { x: 0, z: 10 } });
    w.fight();
    const order = [];
    w.run(12, (w) => {
      for (const l of w.s.visuals().lines) if (!order.length || order[order.length - 1] !== l.tower) order.push(l.tower);
    });
    check(order.length >= 3 && order[0] !== order[1] && order[1] !== order[2] && order[0] !== order[2], `the towers sight you in turn (${order.slice(0, 4).join(' → ')})`);
    // beyond 50 u: no line (and the cut-off boulder after 12 s instead)
    const w2 = makeWorld(B, { player: { x: 0, z: 40 - 75 } });
    w2.fight();
    let boulderAt = null;
    let ring = null;
    w2.run(16, (w) => {
      const v = w.s.visuals();
      if (boulderAt === null && v.rings.length) {
        boulderAt = w.t;
        ring = v.rings[0];
      }
    });
    check(w2.s.state.counts.towers === 0, 'beyond 50 u the towers never sight you');
    check(boulderAt !== null && Math.abs(boulderAt - 12) < 0.05 && Math.hypot(ring.x - w2.player.x, ring.z - w2.player.z) < 0.01, `cutOff: no attack for 12 s → a boulder at your predicted spot (at ${f2(boulderAt)} s)`);
    // a ship that keeps moving across a tower's line outruns its gun
    const w3 = makeWorld(B, { player: { x: -20, z: 40 - 28, h: Math.PI / 2 } });
    w3.fight();
    w3.script = (w, dt) => {
      // back and forth across the fort at 11 u/s
      const p = w.player;
      if (p.x > 25) p.h = -Math.PI / 2;
      if (p.x < -25) p.h = Math.PI / 2;
      p.speed = 11;
      p.x += Math.sin(p.h) * 11 * dt;
      p.z += Math.cos(p.h) * 11 * dt;
    };
    w3.run(40);
    const sightings = w3.s.state.counts.towers;
    const hit3 = w3.log.damage.filter((d) => d.source === 'tower').length;
    check(sightings >= 8 && hit3 <= sightings / 2, `crossing its lines at full sail dodges most of them (${hit3} hits of ${sightings})`);
  }

  // ================================================================ every warning ≥ 1.5 s (+ the bonus), the boss cap
  {
    let minT = Infinity;
    let minLine = Infinity;
    for (const hp of [3000, 1990, 990]) {
      const r = phaseRun({ hp, secs: 80, script: orbit(5), bonus: 0.6, player: { x: 0, z: 40 - 25, h: Math.PI / 2 } });
      for (const a of r.list) {
        if (a.kind === 'tower') minLine = Math.min(minLine, a.T);
        else minT = Math.min(minT, a.T);
      }
    }
    check(minT >= 1.5 + 0.6 - 1e-6 && minLine >= 1.8 + 0.6 - 1e-6, `every warning ≥ 1.5 s + the 0.6 s bonus (rings, sectors, lanes ${f2(minT)}; tower lines ${f2(minLine)})`);
    // a ctx with 1 is obeyed; an unlimited one reads 2
    for (const [boss, want] of [[1, 1], [Infinity, 2], [undefined, 2], ['x', 2]]) {
      let max = 0;
      for (const hp of [3000, 1990, 990]) {
        const r = phaseRun({ hp, secs: 90, script: orbit(5), boss, player: { x: 0, z: 40 - 25, h: Math.PI / 2 } });
        max = Math.max(max, r.maxTele);
      }
      check(max <= want && max >= 1, `ctx.warn.boss ${String(boss)}: at most ${want} attack${want > 1 ? 's' : ''} telegraphed at once (max ${max})`);
    }
    // with the warning slots full, an attack waits
    const r = phaseRun({ hp: 1990, secs: 60, script: orbit(5), warnMax: 0, player: { x: 0, z: 40 - 20, h: Math.PI / 2 } });
    check(r.list.length === 0 && r.w.s.state.counts.waited > 0 && !r.w.log.damage.length, 'with no warning slot free no attack starts (it waits)');
  }

  // ================================================================ hold(), specials
  {
    for (const hp of [3000, 1990, 990]) {
      const w = makeWorld(B, { player: { x: 0, z: 40 - 18, h: Math.PI / 2 } });
      w.fight(hp);
      w.hold = true;
      const c0 = JSON.stringify(w.s.state.clocks);
      w.run(20);
      const st = w.s.state;
      check(st.attacks.length === 0 && st.counts.towers + st.counts.sweeps + st.counts.boulders + st.counts.charges === 0 && JSON.stringify(st.clocks) === c0, `hold() (phase ${st.phase}): no attack starts in 20 s and its timers wait`);
      w.hold = false;
      w.run(15);
      const s2 = w.s.state.counts;
      check(s2.towers + s2.sweeps + s2.boulders + s2.charges > 0, `and once it ends they start again (phase ${w.s.phase})`);
    }
  }
  {
    // Frost: walks ×0.5 and every warning +0.5 s, for STATUS's boss time (5 × 0.5 = 2.5 s)
    const walkSpeed = (frost, tables) => {
      const w = makeWorld(B, { player: { x: 0, z: -40 }, tables });
      w.fight(1990);
      w.run(2);
      if (frost) check(w.s.special('shell', 'frost') === 'FROZEN!', 'Frost: FROZEN!');
      const a = w.s.state.body;
      w.run(1);
      const b = w.s.state.body;
      return { v: Math.hypot(b.x - a.x, b.z - a.z), st: w.s.state.status, w };
    };
    const n = walkSpeed(false);
    const f = walkSpeed(true);
    check(Math.abs(n.v - 4.5) < 0.05 && Math.abs(f.v - 2.25) < 0.05, `phase 2 walks 4.5 u/s, frozen ×0.5 (${f2(n.v)}, ${f2(f.v)})`);
    check(Math.abs(f.st.t - 1.5) < 0.05 && f.st.id === 'frost', `frozen for STATUS.frost.time × bossMul = 2.5 s (${f2(f.st.t + 1)})`);
    const alt = walkSpeed(true, { ...TABLES, STATUS: { ...TABLES.STATUS, frost: { ...TABLES.STATUS.frost, time: 10, bossMul: 0.4 } } });
    check(Math.abs(alt.st.t - 3) < 0.05, `an altered STATUS table is used (10 × 0.4 = 4 s: ${f2(alt.st.t + 1)})`);
    // a frozen Shellback's warnings +0.5 s
    const w = makeWorld(B, { player: { x: 0, z: 40 - 15, h: Math.PI / 2 } });
    w.fight(1990);
    w.s.special('shell', 'frost');
    let T = null;
    w.run(2, (w) => {
      const a = w.s.state.attacks.find((x) => x.kind === 'sweep');
      if (a && T === null) T = a.T;
    });
    check(T !== null && Math.abs(T - 2.3) < 1e-6, `frozen, its warnings +0.5 s (a sweep ${f2(T)} s)`);
    // Stink: ACHOO!, no attack starts for 2 s, then 20 s of clothes-pegs
    const w2 = makeWorld(B, { player: { x: 0, z: 40 - 15, h: Math.PI / 2 } });
    w2.fight(1990);
    w2.run(0.05);
    const c0 = w2.s.state.counts;
    const n0 = c0.sweeps + c0.boulders;
    check(w2.s.special('shell', 'stink') === 'ACHOO!', 'Stink: ACHOO!');
    w2.run(1.9);
    const c1 = w2.s.state.counts;
    check(c1.sweeps + c1.boulders === n0, 'no attack starts for 2 s');
    w2.run(0.3);
    check(w2.s.special('shell', 'stink') === 'Clothes-pegs!' && w2.s.status.immune > 19, 'then 20 s of clothes-pegs');
    // Fire: the part hit burns, from STATUS's boss values (an altered table)
    const w3 = makeWorld(B, { tables: { ...TABLES, STATUS: { ...TABLES.STATUS, fire: { dps: 10, time: 6, boss: 2 } } } });
    w3.fight();
    const tw = w3.s.targets()[0];
    check(w3.s.special(tw.id, 'fire') === 'ON FIRE!', 'Fire: ON FIRE!');
    w3.run(3);
    const t1 = w3.s.state.towers.find((t) => t.id === tw.id);
    check(Math.abs(t1.hp - (340 - 20)) < 0.2 && Math.abs(w3.s.hp - (3000 - 20)) < 0.2, `the tower hit burns (and the bar): 10 hp/s × 2 s = ${f2(340 - t1.hp)}`);
    // KA-BOOM: fire on a stinky Shellback
    const w4 = makeWorld(B);
    w4.fight(1990);
    w4.s.special('shell', 'stink');
    const h0 = w4.s.hp;
    check(w4.s.special('shell', 'fire') === 'KA-BOOM!' && Math.abs(h0 - w4.s.hp - 15) < 1e-6, 'fire on a stinky Shellback: KA-BOOM! (15)');
    check(w4.s.special('shell', 'frost') === 'FIRE OUT! SSSS!', 'frost on a burning one: FIRE OUT!');
  }

  // ================================================================ contact: the standoff, the push, 600 s × 5 × 3
  {
    // a standing ship overlapping the body is pushed out at ≥ 8 u/s; its inward speed is taken away
    const w = makeWorld(B, { player: { x: 0, z: 40 - 12 - 2, h: 0 } });
    w.fight(1990);
    w.player.z = 40 - 8 - 1;
    const v = w.s.push(w.player);
    check(!!v && Math.abs(Math.hypot(v.vx, v.vz) - 8) < 1e-6 && v.vz < 0, `a ship overlapping it is pushed straight out at 8 u/s (${v && f2(Math.hypot(v.vx, v.vz))})`);
    w.player.speed = 10;
    const v2 = w.s.push(w.player);
    check(!!v2 && Math.abs(v2.vz + 18) < 1e-6, `ramming at 10 u/s: its 10 u/s into the body is taken away too (${v2 && f2(v2.vz)})`);
    w.player.z = 40 - 30;
    check(w.s.push(w.player) === null, 'a ship clear of it is not pushed');
    // the sleeping lair (r 12) pushes, before the wake too
    const w0 = makeWorld(B, { player: { x: 0, z: 40 - 11, h: 0 } });
    const v0 = w0.s.push(w0.player);
    check(!!v0 && v0.vz < 0, 'the sleeping lair is a soft keep-off ring (r 12) from the start');
    // a pirate is pushed too, by its id
    const w1 = makeWorld(B, { ships: [{ id: 9, x: 9, z: 40, h: 0 }] });
    w1.fight(1990);
    const vp = w1.s.push(w1.ships[0]);
    check(!!vp && vp.vx > 0, "a pirate's ship is pushed too");
    // no damage from a push
    w1.run(1);
    check(!w1.log.damage.some((d) => !['tower', 'sweep', 'boulder', 'charge'].includes(d.source)), 'a push never does damage');
  }
  // the scripted players of §13.1, each phase for 600 s
  function contactRun(phase, kind, seed) {
    const hp = [3000, 1990, 990][phase - 1];
    const start = { standing: { x: 6, z: 40 - 22, h: 0.4 }, circling: { x: 0, z: 40 - 20, h: Math.PI / 2 }, chasing: { x: 30, z: 40, h: -Math.PI / 2 }, edge: { x: 0, z: 40 - 66, h: Math.PI / 2 }, ramming: { x: 0, z: 40 - 40, h: 0 } }[kind];
    const w = makeWorld(B, { seed, player: start });
    w.fight(hp);
    const r = mulberry32(seed);
    let rammed = 0;
    let back = 0;
    w.script = (w, dt) => {
      const p = w.player;
      const b = w.s.state.body;
      const toB = Math.atan2(b.x - p.x, b.z - p.z);
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      let speed = 0;
      if (kind === 'standing') speed = 0;
      else if (kind === 'circling') {
        p.h = toB - Math.PI / 2 + clamp((d - 18) * 0.06, -0.5, 0.5);
        speed = 8;
      } else if (kind === 'chasing') {
        p.h += clamp(wrap(toB - p.h), -1.5 * dt, 1.5 * dt);
        speed = 7;
      } else if (kind === 'edge') {
        // round the arena's rim, 4 u inside it
        const a = Math.atan2(p.x - ARENA.x, p.z - ARENA.z);
        const rr = Math.hypot(p.x - ARENA.x, p.z - ARENA.z);
        p.h = a + Math.PI / 2 + clamp((rr - (ARENA.r - 4)) * 0.1, -0.6, 0.6);
        speed = 9;
      } else if (kind === 'ramming') {
        // full speed at its centre, then back off 30 u and again
        if (back > 0) {
          back -= dt;
          p.h += clamp(wrap(toB + Math.PI - p.h), -2 * dt, 2 * dt);
          speed = 10;
        } else {
          p.h += clamp(wrap(toB - p.h), -2.5 * dt, 2.5 * dt);
          speed = 14;
          // (it hit the body: back off and come again)
          if (hullDist(p, b.x, b.z) < (phase === 1 ? 12 : 8) + p.wid / 2 + 0.3) {
            rammed++;
            back = 2.5 + r();
          }
        }
      }
      p.speed = speed;
      let nx = p.x + Math.sin(p.h) * speed * dt;
      let nz = p.z + Math.cos(p.h) * speed * dt;
      // (main's own world edge and land: a ship can't sail onto either)
      if (onLand(nx, nz, p.wid / 2) || Math.hypot(nx, nz) > 150 - 2) {
        nx = p.x;
        nz = p.z;
      }
      p.x = nx;
      p.z = nz;
    };
    const R = phase === 1 ? 12 : 8;
    let inside = 0;
    let worstInside = 0;
    let pushedOnLand = 0;
    let pushedOut = 0;
    let trapped = 0;
    let standoff = 0;
    let leftArena = 0;
    let bodyLand = 0;
    let prevBody = { ...w.s.state.body };
    let maxCalls = 0;
    let walkedOnto = 0;
    const W = 150;
    for (let i = 0; i < Math.round(600 / DT); i++) {
      const before = { x: w.player.x, z: w.player.z };
      // the script moves you, the body steps, then its push moves you (w.step); split here to see each part
      w.script(w, DT);
      const afterOwn = { x: w.player.x, z: w.player.z };
      const runBefore = !!w.s.state.run;
      const bodyBefore = { ...w.s.state.body };
      w.s.step(DT);
      const st = w.s.state;
      const b = st.body;
      // the standoff: outside a charge's run, the body never steps nearer a hull than r + half-length + 1
      if (!runBefore && !st.run && (b.x !== bodyBefore.x || b.z !== bodyBefore.z)) {
        const need = 8 + w.player.len / 2 + 1;
        const d0 = Math.hypot(bodyBefore.x - afterOwn.x, bodyBefore.z - afterOwn.z);
        const d1 = Math.hypot(b.x - afterOwn.x, b.z - afterOwn.z);
        if (d1 < need - 1e-6 && d1 < d0 - 1e-6) standoff++;
      }
      // the body never leaves the arena, never on land
      if (Math.hypot(b.x - ARENA.x, b.z - ARENA.z) > ARENA.r - 8 + 1e-6) leftArena++;
      if (onLand(b.x, b.z, 12 - 1e-6)) bodyLand++;
      const v = w.s.push(w.player);
      // the body never walks onto a ship standing still (outside a charge, its dizzy at the lane's end, a shove)
      if (v && kind === 'standing' && b.state === 'walk' && !runBefore && !st.run && !st.shoves.length) walkedOnto++;
      if (v) {
        const nx = w.player.x + v.vx * DT;
        const nz = w.player.z + v.vz * DT;
        if (onLand(nx, nz, w.player.wid / 2) && !onLand(w.player.x, w.player.z, w.player.wid / 2)) pushedOnLand++;
        if (Math.hypot(nx, nz) > W - 10 + 1e-6 && Math.hypot(nx, nz) > Math.hypot(w.player.x, w.player.z) + 1e-9) pushedOut++;
        w.player.x = nx;
        w.player.z = nz;
      }
      w.t += DT;
      // inside the body: the hull touching its circle (its centre line within r + its half-width of the body's centre;
      // stricter than the keel inside r), outside a charge's run
      const inNow = hullDist(w.player, b.x, b.z) < R + w.player.wid / 2 - 1e-6;
      if (inNow && !st.run && !runBefore) {
        inside += DT;
        worstInside = Math.max(worstInside, inside);
      } else inside = 0;
      // always a free direction to sail: some heading takes you 2 u without meeting the body or land
      if (i % 60 === 0) {
        let free = false;
        for (let k = 0; k < 16 && !free; k++) {
          const a = (k / 16) * TAU;
          const q = { ...w.player, x: w.player.x + Math.sin(a) * 2, z: w.player.z + Math.cos(a) * 2, h: a };
          if (!onLand(q.x, q.z, q.wid / 2) && Math.hypot(q.x, q.z) <= W - 2 && hullDist(q, b.x, b.z) >= Math.min(hullDist(w.player, b.x, b.z), R)) free = true;
        }
        if (!free) trapped++;
      }
      prevBody = b;
      void before;
      void maxCalls;
    }
    const sources = new Set(w.log.damage.map((d) => d.source));
    const hitCount = Object.values(w.s.state.counts.hits).reduce((a, b) => a + b, 0);
    return { worstInside, pushedOnLand, pushedOut, trapped, standoff, leftArena, bodyLand, sources, damage: w.log.damage.length, hitCount, rammed, charges: w.s.state.counts.charges, phase: w.s.phase, prevBody, walkedOnto };
  }
  const contact = { worst: 0, bad: [] };
  {
    const kinds = ['standing', 'circling', 'chasing', 'edge', 'ramming'];
    let seed = 100;
    for (const phase of [1, 2, 3]) {
      for (const kind of kinds) {
        const r = contactRun(phase, kind, seed++);
        contact.worst = Math.max(contact.worst, r.worstInside);
        const ok = r.walkedOnto === 0 && (kind !== 'ramming' || r.rammed >= 20) && r.worstInside <= 1 && r.pushedOnLand === 0 && r.pushedOut === 0 && r.trapped === 0 && r.standoff === 0 && r.leftArena === 0 && r.bodyLand === 0 && [...r.sources].every((s) => ['tower', 'sweep', 'boulder', 'charge'].includes(s)) && r.damage === r.hitCount && r.phase === phase;
        if (!ok) contact.bad.push(`${phase}/${kind}`);
        check(ok, `600 s, phase ${phase}, ${kind}: inside ≤ 1 s (worst ${f2(r.worstInside)}), never pushed onto land (${r.pushedOnLand}) or out (${r.pushedOut}), free (${r.trapped} trapped), standoff kept (${r.standoff}), in the arena (${r.leftArena}), off land (${r.bodyLand}), damage only from attacks (${r.damage} = ${r.hitCount})${kind === 'standing' ? `, never walked onto (${r.walkedOnto})` : ''}${kind === 'ramming' ? `, ${r.rammed} rams` : ''}${phase === 3 ? `, ${r.charges} charges` : ''}`);
      }
    }
  }
  {
    // a ship standing between it and you: it walks round her, never within r + her half-length + 1 of her
    let worst = Infinity;
    let pushed = 0;
    for (const hp of [1990, 990]) {
      const w = makeWorld(B, { player: { x: 0, z: 40 - 45, h: Math.PI / 2 }, ships: [{ id: 5, x: 0, z: 40 - 20, h: Math.PI / 2, len: 10, wid: 3.6 }] });
      w.fight(hp);
      let prev = { ...w.s.state.body };
      w.run(90, (w) => {
        const st = w.s.state;
        const b = st.body;
        const s0 = w.ships[0];
        const d1 = Math.hypot(b.x - s0.x, b.z - s0.z);
        const d0 = Math.hypot(prev.x - s0.x, prev.z - s0.z);
        if (!st.run && b.state === 'walk' && (b.x !== prev.x || b.z !== prev.z) && d1 < d0 - 1e-9) worst = Math.min(worst, d1);
        if (!st.run && b.state === 'walk' && !st.shoves.length && w.s.push(w.ships[0])) pushed++;
        prev = { ...b };
      });
    }
    check(worst >= 8 + 5 + 1 - 1e-6 && pushed === 0, `it walks round a ship standing in its way, never a step within its standoff (closest ${f2(worst)} u, ${pushed} pushes)`);
  }
  {
    // straight out would meet land: the push turns (up to 90°) toward open water; the world's edge likewise
    const lands = LANDS.slice();
    LANDS.push({ x: 0, z: 40 - 12 - 4.5, r: 1.5 });
    const w = makeWorld(B, { player: { x: 0, z: 40 - 12 - 0.5, h: Math.PI / 2 } });
    const v = w.s.push(w.player);
    const n = v ? Math.hypot(v.vx, v.vz) : 0;
    const q = v ? { x: w.player.x + (v.vx / n) * 3, z: w.player.z + (v.vz / n) * 3 } : null;
    check(!!v && Math.abs(v.vx) > 0.5 && !onLand(q.x, q.z, 1.8) && v.vz <= 0.01, `land behind you: the push turns toward open water (${v ? f2((Math.atan2(v.vx, -v.vz) * 180) / Math.PI) : '-'}° off straight out)`);
    LANDS.length = 0;
    LANDS.push(...lands);
    const w2 = makeWorld(B, { worldR: 60, arena: { x: 0, z: 30, r: 40 }, lair: { x: 0, z: 46, r: 12 }, player: { x: 0, z: 46 + 12.5, h: Math.PI / 2 } });
    const v2 = w2.s.push(w2.player);
    const p2 = v2 ? { x: w2.player.x + v2.vx * 0.1, z: w2.player.z + v2.vz * 0.1 } : null;
    check(!!v2 && Math.hypot(p2.x, p2.z) <= Math.hypot(w2.player.x, w2.player.z) + 1e-6 + 0.8 && Math.abs(v2.vx) > 0.5, 'by the world\'s edge: it turns along the edge, not over it');
  }

  // ================================================================ driven off, the Conch
  {
    const w = makeWorld(B, { player: { x: 0, z: 40 - 20, h: 0 } });
    w.fight(1990);
    w.run(3);
    const before = w.warn.count;
    void before;
    const sh = w.s.targets().find((t) => t.kind === 'shell');
    const r = w.s.hit(sh.id, { dmg: 99999 });
    check(!!r && w.s.done === true && w.s.hp === 0 && w.s.targets().length === 0, 'driven off at 0: done, no targets');
    check(w.warn.count === 0 && w.s.state.attacks.length === 0, 'every warning goes (its slots given back)');
    check(w.log.sfx.some((s) => s.name === 'yawn') && w.log.live.some((l) => /scuttles home/i.test(l.text)), 'a sleepy yawn; "The Shellback scuttles home!"');
    let got = null;
    let settle = null;
    w.run(20, (w) => {
      if (got === null && w.s.over) got = w.t;
      if (settle === null && w.s.state.body.state === 'asleep') settle = w.t;
    });
    check(w.log.conch.length === 1 && w.log.conch[0].gold === 1200 && w.s.over === true, `the Golden Conch: +1,200 (ctx.conch), taken (${f2(got)} s)`);
    check(w.log.pops.some((p) => p.text === '+1,200 THE GOLDEN CONCH'), '"+1,200 THE GOLDEN CONCH"');
    check(settle !== null, 'it walks to the arena\'s edge and settles to sleep');
    const b = w.s.state.body;
    check(Math.hypot(b.x - ARENA.x, b.z - ARENA.z) <= ARENA.r - 8 + 1e-6 && !onLand(b.x, b.z, 12), 'it sleeps inside the arena, off land');
    // a ship far off: the Conch drifts to you after 4 s, faster and faster
    const w2 = makeWorld(B, { player: { x: 0, z: 40 - 45, h: 0 } });
    w2.fight(1990);
    w2.s.setHp(0);
    let at = null;
    w2.run(30, (w) => {
      if (at === null && w.s.over) at = w.t;
    });
    check(at !== null && at > 4 && at < 15, `far off, the Conch drifts to you (taken after ${f2(at)} s)`);
  }

  // ================================================================ with the real WORDS4 (mechanics4.js)
  if (WORDS4) {
    const w = makeWorld(B, { player: { x: 0, z: 40 - 16, h: Math.PI / 2 }, tables: { ...TABLES, WORDS4 } });
    w.s.wake();
    w.run(7);
    w.s.setHp(1990);
    w.run(6);
    w.s.setHp(0);
    w.run(10);
    const live = w.log.live.map((l) => l.text);
    const pops = new Set(w.log.pops.map((p) => p.text));
    check(live.some((t) => /Shellback wakes/.test(t)) && live.some((t) => /Shellback scuttles home/.test(t)) && !live.some((t) => /Coilback/.test(t)), `with mechanics4's WORDS4 its announcements are its own (${live.filter((t) => /Shellback/.test(t)).join(' | ')})`);
    check(pops.has('SNIP!') && pops.has('+1,200 THE GOLDEN CONCH'), 'and its pops read the same');
  }

  // ================================================================ every spot in open water; sounds
  {
    // boulders by an island you hug: never on land (the ring moves to the nearest open water)
    let rings = 0;
    let bad = 0;
    const seen = new Set();
    for (let seed = 1; seed <= 4; seed++) {
      const w = makeWorld(B, { seed, player: { x: -85 + 7 + 2.2, z: 20, h: 0 } });
      w.fight(1990);
      w.run(120, (w) => {
        for (const r of w.s.visuals().rings) {
          if (seen.has(seed + r.id)) continue;
          seen.add(seed + r.id);
          rings++;
          if (onLand(r.x, r.z, 0)) bad++;
        }
      });
    }
    check(rings >= 20 && bad === 0, `boulders land in open water, by an island you hug too (${rings} boulders, ${bad} on land)`);
    const w = makeWorld(B, { player: { x: 0, z: 40 - 18, h: Math.PI / 2 } });
    w.s.wake();
    w.run(8);
    w.s.setHp(1990);
    w.script = orbit(5);
    w.run(40);
    w.s.setHp(990);
    w.run(40);
    w.s.special('shell', 'stink');
    w.s.setHp(0);
    w.run(10);
    const names = [...new Set(w.log.sfx.map((s) => s.name))];
    const SPEC_NEW = ['coconut', 'netWhirl', 'puff', 'conch', 'song', 'hiss', 'clack', 'tidebell', 'snip', 'boulder', 'crabCharge', 'yawn', 'newFoe', 'whistle', 'thud', 'tok', 'saw', 'pop', 'brush', 'chime', 'door', 'tada', 'purr', 'woof', 'meh', 'squawk', 'hoot', 'giggle', 'click', 'splash', 'fwap', 'foghorn'];
    const known = new Set([...(audioNames || []), ...SPEC_NEW]);
    check(!!audioNames && names.length >= 6 && names.every((n) => known.has(n)), `its sounds are audio.js's SFX_NAMES or §11.1's new ones (${names.join(', ')})`);
    const warnSfx = w.log.sfx.filter((s) => ['snip', 'boulder', 'crabCharge'].includes(s.name));
    check(warnSfx.length > 0 && warnSfx.every((s) => s.opts && s.opts.duration >= 1.5), 'each warning sound is told how long its warning lasts');
    const v = w.s.visuals();
    check(['body', 'eyes', 'claws', 'towers', 'rings', 'sectors', 'lanes', 'lines'].every((k) => k in v) && v.eyes.length === 2 && v.claws.length === 2, 'visuals() has every §11.1 key');
  }

  // ================================================================ determinism, junk
  {
    const snap = (seed) => {
      const w = makeWorld(B, { seed, player: { x: 0, z: 40 - 20, h: Math.PI / 2 } });
      w.s.wake();
      w.script = orbit(6);
      for (let i = 0; i < 120 * 120; i++) {
        w.step();
        if (i % 600 === 0) {
          const t = w.s.targets()[0];
          if (t) w.s.hit(t.id, { dmg: 60 });
        }
        if (i === 120 * 40) w.s.special('shell', 'frost');
      }
      return JSON.stringify(w.s.state) + JSON.stringify(w.s.visuals()) + JSON.stringify(w.log.damage.map((d) => [d.amount, d.source, Math.round(d.t * 1000)]));
    };
    const a = snap(42);
    const b = snap(42);
    const c = snap(43);
    check(a === b && a !== c, 'determinism: the same seed gives the same state after 120 s (another seed does not)');
  }
  {
    let threw = null;
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('boom');
        },
      }
    );
    const P = () => ({ x: 0, z: 10, h: 0, speed: 3, len: 10, wid: 3.6 });
    const ctxs = [
      undefined,
      null,
      42,
      'ctx',
      {},
      hostile,
      { player: () => null },
      { player: () => ({ x: 'a', z: NaN }) },
      { player: P, ships: () => hostile, rng: () => NaN, land: () => { throw new Error('x'); }, damage: () => { throw new Error('y'); }, world: { r: -5 }, tables: hostile, warnBonus: () => 'big', warn: hostile, arena: hostile, lair: { x: NaN } },
      { player: P, ships: () => [null, 5, { id: 1 }, { id: 2, x: 1, z: 2, len: 'x' }, hostile], rng: () => 1, land: () => true, world: null, arena: { x: 0, z: 0, r: -1 }, tables: { STATUS: { frost: { time: 'x' } }, FORT: { track: -1 } }, pop: 5, sfx: {}, announce: null, warn: { take: () => { throw new Error('t'); }, give: 3, boss: -2 }, hold: () => 'yes', conch: () => { throw new Error('c'); } },
      {
        get player() {
          throw new Error('getter');
        },
      },
    ];
    const junk = [undefined, null, NaN, -1, 1e9, 'x', {}, [], hostile];
    for (const c of ctxs) {
      try {
        const s = createShellback(c);
        for (const j of junk) {
          s.wake(j, j, j);
          s.step(j);
          s.push(j);
        }
        s.skip();
        for (let i = 0; i < 120 * 30; i++) {
          s.step(DT);
          if (i % 97 === 0) {
            s.setHp([2990, 1990, 990][i % 3]);
            for (const j of junk) {
              s.hits(j, j, j, j);
              s.hit(j, j);
              s.special(j, j);
            }
            for (const t of s.targets()) s.hit(t.id, { dmg: 1 });
            s.special('shell', ['fire', 'frost', 'stink'][i % 3]);
            s.push({ id: 1, x: 0, z: 0, h: 0, speed: 5 });
            s.push({ kind: 'player', x: 0, z: 10 });
            JSON.stringify(s.visuals());
            JSON.stringify(s.state);
            s.playerMods();
            void s.bar;
            void s.status;
          }
        }
        s.setHp(0);
        s.step(1);
        s.step(1);
        s.dispose();
        s.step(1);
        s.targets();
        s.visuals();
        void s.state;
      } catch (e) {
        threw = e;
        break;
      }
    }
    check(threw === null, `a junk ctx and junk arguments never throw${threw ? ` (${threw.stack})` : ''}`);
  }

  // ================================================================ EXIT (SPEC4 §12 row 1C, the Shellback's half)
  {
    check(contact.bad.length === 0, `EXIT: contact never traps or damages (standoff, the 8 u/s push, the Charge exemption: 600 s × 5 players × 3 phases; worst inside ${f2(contact.worst)} s${contact.bad.length ? `; failed ${contact.bad.join(', ')}` : ''})`);
    let maxTele = 0;
    let closest = Infinity;
    let nCh = 0;
    let nSw = 0;
    for (let seed = 1; seed <= 4; seed++) {
      // (a ship that stays near it, and one that keeps sailing round the bay)
      const r = phaseRun({ hp: 990, secs: 200, script: seed % 2 ? null : orbit(4 + seed), seed, player: { x: 0, z: 40 - 20, h: Math.PI / 2 } });
      maxTele = Math.max(maxTele, r.maxTele);
      const ch = r.list.filter((a) => a.kind === 'charge');
      const sw = r.list.filter((a) => a.kind === 'sweep');
      nCh += ch.length;
      nSw += sw.length;
      for (const c of ch) for (const s of sw) closest = Math.min(closest, Math.abs(c.t0 - s.t0));
    }
    // (and phases 1–2 for the 2-at-once cap)
    for (const hp of [3000, 1990]) {
      const r = phaseRun({ hp, secs: 200, script: orbit(4), player: { x: 0, z: 40 - 20, h: Math.PI / 2 } });
      maxTele = Math.max(maxTele, r.maxTele);
    }
    check(maxTele <= 2 && nCh >= 20 && nSw >= 10 && closest >= 6 - 1e-6, `EXIT: at most 2 telegraphed at once (ctx.warn.boss: max ${maxTele}) and no charge within 6 s of a sweep (${nCh} charges, ${nSw} sweeps, closest ${f2(closest)} s)`);
  }

  console.log(failures ? `\n${failures} check(s) failed` : `\nAll shellback checks passed (${passes})`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
