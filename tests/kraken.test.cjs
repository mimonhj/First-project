// Unit checks for the Kraken's rules in src/kraken.js (plain Node, no browser), SPEC3 §5.7, §11.1, §13.1. The
// simulation runs against a mock of the ctx main.js hands it, with a scripted ship that obeys playerMods():
// - the API: exact exports, the KRAKEN table as SPEC3 (and none of STATUS / INK / RAIDERS copied into it)
// - the rise (6 s, 3 s short, skippable, 40 u ahead in open water), the bar and its notches
// - phase thresholds 400 / 200; chase speeds 8 / 9.5 / 0 (frost ×0.5); attack counts and intervals per phase
// - every warning ≥ 1.5 s (+ the warn bonus, + 0.5 s frozen); slam damage only inside the ring
// - never more than 4 tentacles up (slamming, swaying, grabbing, recoiling or sinking) over 600 s of each phase,
//   and the hard cap retiring the oldest when a fifth would rise
// - grabs: only in phases 2–3, only for a hull inside a red ring, released by 3 taps, a 0.8 s hold, a hit on that
//   tentacle, a stink hit, and always by 4 s; a standing player is never grabbed within 8 s of a release, and
//   the first rings after a release land ≥ 8 u from the hull
// - the cut taps / hold, status times and ink numbers come from ctx.tables (altered tables are used)
// - the head schedule, the ink blob every 12 s in phase 2, the pull in phase 3, the cut-off after 12 s idle
// - no tentacle rises on the head, none but the one aimed at you in the line from your ship to its eye in the
//   last stand, and the head never surfaces on a tentacle
// - spots never on land or beyond worldRadius − 20; targets list only raised parts; hits (eye ×1.5, tentacle
//   30 hp → recoil, no rake ever); specials (frost, fire, stink sneeze + 20 s clothes-pegs, KA-BOOM, FIRE OUT)
// - done at 0, the Pearl; determinism (same seed, same state after 120 s); a junk ctx never throws
// - its sounds are audio.js's SFX_NAMES; a warning sounds the rising tentacle tone for as long as it lasts
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

// kraken.js imports nothing: it loads from its source as a data: URL. (KRAKEN_JS points the suite at another
// copy, for checking that the checks catch a broken one.)
async function load(rel) {
  const file = process.env.KRAKEN_JS && rel === 'src/kraken.js' ? process.env.KRAKEN_JS : path.join(ROOT, rel);
  const src = fs.readFileSync(file, 'utf8');
  if (/^\s*import\s[^(]/m.test(src)) throw new Error(`${rel} has imports now; load it another way`);
  return import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b, eps = 1e-6) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= eps;
const f2 = (v) => (typeof v === 'number' ? v.toFixed(2) : String(v));
const DT = 1 / 120; // main's simulation substep
const TAU = Math.PI * 2;
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
// the ship's hull as its centre line; a ring covers it when the line comes within the ring's radius
function hullDist(p, x, z) {
  const fx = Math.sin(p.h);
  const fz = Math.cos(p.h);
  const half = p.len / 2;
  const along = Math.max(-half, Math.min(half, (x - p.x) * fx + (z - p.z) * fz));
  return Math.hypot(x - (p.x + fx * along), z - (p.z + fz * along));
}

// Real tables main passes (SPEC3 §11.1): STATUS of specials.js, INK of mechanics3.js, RAIDERS of combat.js.
const TABLES = {
  STATUS: { fire: { dps: 3, time: 6, boss: 3 }, frost: { speed: 0.5, turn: 0.6, time: 5, add: 2, max: 8, bossMul: 0.5 }, stink: { time: 4, boss: 2, immune: 10, bossImmune: 20, grit: 0.75, decel: 2 }, kaboom: { burst: 15 } },
  INK: { every: 10, pots: 2, scatter: 6, lead: 1, muzzle: 4, radius: 4, damage: 8, warn: 1.8, slick: { r: 7, time: 6, speedMul: 0.6, max: 3, fade: 1 } },
  RAIDERS: { reach: 10, threat: 1.5, reel: 1.0, cutTaps: 3, cutHold: 0.8 },
};

(async () => {
  const K = await load('src/kraken.js');
  const { KRAKEN, createKraken } = K;
  // the real tables, when the modules exist (the mock copies above must match them)
  try {
    const S = await load('src/specials.js');
    const M3 = await load('src/mechanics3.js');
    const C = await load('src/combat.js');
    check(
      same(S.STATUS.fire, TABLES.STATUS.fire) && same(S.STATUS.frost, TABLES.STATUS.frost) && same(S.STATUS.stink, TABLES.STATUS.stink) && same(S.STATUS.kaboom, TABLES.STATUS.kaboom) &&
        M3.INK.radius === TABLES.INK.radius && M3.INK.damage === TABLES.INK.damage && M3.INK.warn === TABLES.INK.warn && C.RAIDERS.cutTaps === TABLES.RAIDERS.cutTaps && C.RAIDERS.cutHold === TABLES.RAIDERS.cutHold,
      'the tables this suite passes as ctx.tables match specials.js STATUS, mechanics3.js INK and combat.js RAIDERS'
    );
  } catch (e) {
    check(false, `the real STATUS / INK / RAIDERS tables load (${e.message})`);
  }
  // every sound the Kraken names is one audio.js makes (its SFX_NAMES, read from the source text: this suite runs
  // no audio code), and the warning is the rising `tentacle` tone (§5.7.3), not the falling bomb whistle
  try {
    const src = fs.readFileSync(path.join(ROOT, 'src/audio.js'), 'utf8');
    const m = src.match(/export const SFX_NAMES = \[([\s\S]*?)\];/);
    const names = m ? [...m[1].replace(/\/\/.*$/gm, '').matchAll(/'([A-Za-z0-9]+)'/g)].map((x) => x[1]) : [];
    const used = [...new Set(Object.values(KRAKEN.sfx))];
    const missing = used.filter((n) => !names.includes(n));
    check(names.length > 0 && missing.length === 0 && KRAKEN.sfx.warn === 'tentacle', `every Kraken sound is in audio.js SFX_NAMES; the warning is the rising tentacle tone (${missing.length ? 'missing: ' + missing.join(', ') : used.length + ' names'})`);
  } catch (e) {
    check(false, `audio.js SFX_NAMES reads (${e.message})`);
  }

  // ---------------------------------------------------------------- a mock of main's ctx and a scripted ship
  // world(): a Kraken over a mock ctx. The ship (len 10, wid 3.6) moves each 1/120 s step by its script's wish
  // (heading, speed), obeying playerMods (speed ×, turn ×, drift) like main's updatePlayer. run() records what
  // main would see: rings as they are placed, landings, damage, grabs and releases, the most tentacles up.
  function world({ seed = 1, player = {}, script = null, tables = TABLES, land = null, colliders = [], W = { x: 0, z: 0, r: 140 }, warnBonus = 0, rng = null } = {}) {
    const p = { x: 0, z: 0, h: 0, speed: 0, len: 10, wid: 3.6, ...player };
    const log = { damage: [], pops: [], announce: [], sfx: [], slicks: [], pearl: [] };
    const w = { p, log, warnBonus, time: 0 };
    const isLand = land || ((x, z, r) => colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r));
    const ctx = {
      player: () => ({ ...p }),
      damage: (amount, x, z, source) => log.damage.push({ amount, x, z, source, t: w.time, inside: hullDist(p, x, z), p: { ...p } }),
      land: isLand,
      world: W,
      rng: rng || mulberry32(seed),
      warnBonus: () => w.warnBonus,
      inkSlick: (x, z) => log.slicks.push({ x, z, t: w.time }),
      pop: (text, x, y, z, style) => log.pops.push({ text, x, y, z, style, t: w.time }),
      announce: (text) => log.announce.push({ text, t: w.time }),
      sfx: (name, x, z, o) => log.sfx.push({ name, x, z, o, t: w.time }),
      pearl: (gold) => log.pearl.push({ gold, t: w.time }),
      tables,
    };
    const k = createKraken(ctx);
    w.k = k;
    w.ctx = ctx;
    w.land = isLand;
    const turnMax = 1.4;
    let prev = new Map(); // tentacle id → state, last step
    w.rings = []; // every ring placed: { id, attack, i, T, grab, x, z, at, hull, sinceRelease, rest }
    w.landings = []; // { id, attack, i, at, state, hull, grab, ring }
    w.grabs = []; // { at, id, hull, sinceRelease }
    w.releases = []; // { at, held }
    w.maxUp = 0;
    w.maxVisual = 0;
    w.maxRings = 0;
    w.attackStarts = []; // { at, attack, n, phase }
    w.surfacings = []; // { at, x, z, tents: [{ x, z, state }] }
    let grabbedAt = null;
    let lastRelease = -Infinity;
    let restPending = false;
    let attacksSeen = 0;
    w.step = (dt = DT, wish = null) => {
      const want = wish || (script ? script(p, k, w) : null);
      const m = k.playerMods();
      if (want) {
        const dh = wrap(num(want.h, p.h) - p.h);
        p.h = wrap(p.h + Math.max(-turnMax * m.turnMul * dt, Math.min(turnMax * m.turnMul * dt, dh)));
        p.speed = Math.max(0, num(want.speed, p.speed));
      }
      const v = p.speed * m.speedMul;
      p.x += Math.sin(p.h) * v * dt + (m.vx || 0) * dt;
      p.z += Math.cos(p.h) * v * dt + (m.vz || 0) * dt;
      w.time += dt;
      k.step(dt);
      observe();
    };
    w.run = (secs, wish) => {
      const n = Math.round(secs / DT);
      for (let i = 0; i < n; i++) w.step(DT, wish);
    };
    function observe() {
      const S = k.state;
      w.maxUp = Math.max(w.maxUp, S.up);
      const V = k.visuals();
      w.maxVisual = Math.max(w.maxVisual, V.tentacles.length);
      w.maxRings = Math.max(w.maxRings, V.rings.length);
      if (S.attacks !== attacksSeen) {
        attacksSeen = S.attacks;
        w.attackStarts.push({ at: w.time, attack: S.attacks, phase: S.phase, n: S.tentacles.filter((t) => t.attack === S.attacks).length });
      }
      const now = new Map();
      for (const t of S.tentacles) {
        now.set(t.id, t.state);
        const was = prev.get(t.id);
        if (was === undefined && t.state === 'warn') {
          const head = S.head ? { x: S.head.x, z: S.head.z, h: S.head.h, state: S.head.state } : null;
          w.rings.push({ id: t.id, attack: t.attack, i: t.i, T: t.T, grab: t.grab, x: t.x, z: t.z, at: w.time, hull: hullDist(p, t.x, t.z), sinceRelease: w.time - lastRelease, rest: restPending, phase: S.phase, head, ship: { x: p.x, z: p.z } });
        }
        if (was === 'warn' && t.state !== 'warn') {
          const ring = w.rings.find((r) => r.id === t.id);
          w.landings.push({ id: t.id, attack: t.attack, i: t.i, at: w.time, state: t.state, hull: ring ? hullDist(p, ring.x, ring.z) : NaN, grab: t.grab, ring });
        }
      }
      // a warning that vanished without landing (a sneeze calls it off)
      prev = now;
      // a head surfacing: where it comes up, and the tentacles that are up or coming up then
      if (S.head && S.head.state === 'rise' && S.head.t === 0 && !w.surfacings.some((h) => h.at === w.time)) {
        w.surfacings.push({ at: w.time, x: S.head.x, z: S.head.z, tents: S.tentacles.filter((t) => ['warn', 'slam', 'sway', 'grab'].includes(t.state)).map((t) => ({ x: t.x, z: t.z, state: t.state })) });
      }
      if (S.grabbed && grabbedAt === null) {
        grabbedAt = w.time;
        const g = S.tentacles.find((t) => t.id === S.grab.id);
        const ring = g && w.rings.find((r) => r.id === g.id);
        w.grabs.push({ at: w.time, id: S.grab.id, hull: ring ? hullDist(p, ring.x, ring.z) : NaN, sinceRelease: w.time - lastRelease, ring, phase: S.phase });
      } else if (!S.grabbed && grabbedAt !== null) {
        w.releases.push({ at: w.time, held: w.time - grabbedAt });
        grabbedAt = null;
        lastRelease = w.time;
        restPending = true;
      }
      if (restPending && w.rings.length && w.rings[w.rings.length - 1].at === w.time && w.rings[w.rings.length - 1].sinceRelease > 0) {
        // the first attack after a release has now placed its rings (all in this step)
        const last = w.rings[w.rings.length - 1];
        for (const r of w.rings) if (r.attack === last.attack && r.at === w.time) r.rest = true;
        restPending = false;
      }
    }
    return w;
  }
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  // start a fight at once (rise + skip), optionally at a given hp (phase)
  function fight(opts = {}, hp = null) {
    const w = world(opts);
    w.k.rise(opts.riseX, opts.riseZ);
    w.k.skip();
    if (hp !== null) w.k.setHp(hp);
    return w;
  }
  // scripts
  const stand = () => ({ speed: 0 });
  const fleeFrom = (inner = 95) => (p, k) => {
    const s = k.state;
    const from = s.head ? s.head : s.shadow;
    let h = Math.atan2(p.x - from.x, p.z - from.z);
    if (Math.hypot(p.x, p.z) > inner) h = Math.atan2(-p.x, -p.z) + 1.0;
    return { h, speed: 12 };
  };
  function wander(seed) {
    const r = mulberry32(seed);
    let next = 0;
    let want = { h: 0, speed: 6 };
    return (p, k, w) => {
      if (w.time >= next) {
        next = w.time + 1 + r() * 3;
        want = { h: r() * TAU - Math.PI, speed: r() < 0.25 ? 0 : r() * 12 };
      }
      if (Math.hypot(p.x, p.z) > 90) return { h: Math.atan2(-p.x, -p.z), speed: want.speed || 6 };
      return want;
    };
  }
  const circle = (p) => ({ h: p.h + 0.5, speed: 8 });

  // ================================================================ the API and the table
  check(same(Object.keys(K).sort(), ['KRAKEN', 'createKraken']), 'kraken.js exports exactly KRAKEN and createKraken');
  check(KRAKEN.hp === 600 && same(KRAKEN.notches, [400, 200]) && KRAKEN.pearl === 1000, 'KRAKEN: 600 hp, notches at 400 and 200, the Pearl 1,000 (§5.7.1, §5.7.2)');
  check(KRAKEN.dread === 4 && KRAKEN.rise === 6 && KRAKEN.shortRise === 3 && KRAKEN.riseAhead === 40 && KRAKEN.boil === 30, 'KRAKEN: dread 4 s, rise 6 s (short 3 s), the eye 40 u ahead, the boil ring 30 u (§5.7.1, §5.7.6)');
  check(KRAKEN.sway === 4 && KRAKEN.sink <= 0.5 && KRAKEN.maxUp === 4 && KRAKEN.ring === 4 && KRAKEN.minWarn === 1.5, 'KRAKEN: sway 4 s, sink ≤ 0.5 s, at most 4 up, rings r 4, no warning under 1.5 s (§5.7.3)');
  check(KRAKEN.grabRest === 8 && KRAKEN.restGap === 8 && KRAKEN.grab.dps === 2 && KRAKEN.grab.max === 4, 'KRAKEN: no grab for 8 s after a release, first rings ≥ 8 u, grab 2 hp/s for at most 4 s (§5.7.3)');
  check(KRAKEN.cutOff.idle === 12 && KRAKEN.cutOff.ahead === 30 && KRAKEN.edge === 20, 'KRAKEN: the cut-off after 12 s idle, 30 u ahead; everything inside worldRadius − 20 (§5.7.3)');
  check(same(KRAKEN.specials, { chase: 0.5, warn: 0.5, sneeze: true }), 'KRAKEN.specials: chase ×0.5, warnings +0.5 s, the sneeze (§5.7.5)');
  {
    const [a, b, c] = KRAKEN.phases;
    check(a.from === 600 && b.from === 400 && c.from === 200, 'phases from 600, 400, 200');
    check(a.chase === 8 && b.chase === 9.5 && c.chase === 0, 'chase 8 / 9.5 u/s, then it stops (a stock ship at 12 u/s outruns it)');
    check(a.trigger === 14 && b.trigger === 14 && c.trigger === Infinity, 'attack trigger: the shadow within 14 u (always in phase 3)');
    check(a.count === 2 && b.count === 3 && c.count === 4 && a.every === 8 && b.every === 7 && c.every === 6, 'attacks: 2 every 8 s, 3 every 7 s, 4 every 6 s');
    check(a.spread === 6 && b.spread === 6 && c.reach === 40, 'spots: your predicted spot ±6 u; phase 3 anywhere within 40 u');
    check(a.warn === 1.8 && b.warn === 1.6 && c.warn === 1.5 && a.slam === 12 && b.slam === 12 && c.slam === 12, 'warnings 1.8 / 1.6 / 1.5 s; slams 12');
    check(a.grab === false && b.grab === true && c.grab === true, 'grabs only in phases 2–3');
    check(a.head.every === 3 && a.head.up === 7 && a.head.off === 20 && b.head.every === 2 && b.head.up === 7 && c.head.always === true && c.head.off === 25 && same(c.head.glow, [4, 8]), 'head: every 3rd attack / every 2nd for 7 s at 20 u off the beam; always up at 25 u in phase 3, glowing 4 s in 8');
    check(!a.ink && b.ink === 12 && !c.ink && !a.pull && !b.pull && c.pull.speed === 2 && c.pull.reach === 50, 'ink every 12 s only in phase 2; the pull (2 u/s within 50 u) only in phase 3');
    const P = KRAKEN.parts;
    check(P.shadow.r === 9 && P.head.r === 6 && P.head.y === 3 && P.head.mul === 1 && P.eye.r === 2.5 && P.eye.mul === 1.5 && P.tentacle.r === 1.4 && P.tentacle.y0 === 0 && P.tentacle.y1 === 9 && P.tentacle.hp === 30 && P.tentacle.mul === 1, 'parts: shadow r 9, head sphere r 6 at y 3 ×1, eye r 2.5 ×1.5, tentacle capsule r 1.4 y 0–9 with 30 hp (§5.7.2)');
    const keys = [];
    (function walk(o) {
      for (const [key, v] of Object.entries(o)) {
        keys.push(key);
        if (v && typeof v === 'object' && !Array.isArray(v)) walk(v);
      }
    })(KRAKEN);
    check(!keys.some((key) => ['cutTaps', 'cutHold', 'bossImmune', 'bossMul', 'boss', 'burst', 'radius', 'damage', 'dps'].includes(key) && key !== 'dps') && !('dps' in KRAKEN.specials), 'no STATUS / INK / RAIDERS number is copied into KRAKEN (they come from ctx.tables)');
  }
  {
    const k = createKraken({});
    const api = ['rise', 'skip', 'step', 'targets', 'hits', 'hit', 'special', 'cut', 'cutHold', 'playerMods', 'setHp', 'visuals', 'dispose'];
    const getters = ['bar', 'phase', 'hp', 'grabbed', 'rising', 'done', 'over', 'state'];
    check(api.every((n) => typeof k[n] === 'function') && getters.every((n) => n in k), 'createKraken(ctx) has the §11.1 API (+ skip, setHp, over)');
  }

  // ================================================================ before and during the rise
  {
    const w = world({ player: { x: 0, z: 0, h: 0 } });
    const k = w.k;
    check(k.targets().length === 0 && k.bar === null && k.phase === 0 && !k.rising && !k.done && !k.grabbed, 'before the rise: no targets, no bar, phase 0');
    check(same(k.playerMods(), { speedMul: 1, turnMul: 1, dps: 0, vx: 0, vz: 0 }) && k.hit('head', { dmg: 10 }) === null && k.special('head', 'stink') === null && k.cut() === false, 'before the rise: no mods, hits and specials do nothing');
    const V = k.visuals();
    check(V.head === null && V.shadow === null && V.tentacles.length === 0 && V.rings.length === 0, 'before the rise: nothing to draw');
    check(k.skip() === false, 'skip() with nothing rising: false');
    check(k.rise() === true && k.rising && k.rise() === false, 'rise() starts the rise once');
    check(w.log.sfx.some((s) => s.name === 'krakenRise'), 'the rise sounds its horn (krakenRise)');
    check(same(k.bar, { name: 'THE KRAKEN', frac: 1, notches: [0.667, 0.333] }), 'the bar: THE KRAKEN, full, two notches (3 segments)');
    const RV = k.visuals();
    check(RV.head && near(RV.head.x, 0, 1e-6) && near(RV.head.z, 40, 1e-6) && RV.eye.one === true && RV.boil && RV.boil.r === 30 && RV.rise && RV.rise.T === 6, 'the eye opens 40 u ahead (one eye), bubbles boil in a ring 30 u round you');
    let t = 0;
    let firstPhase = null;
    while (k.rising && t < 10) {
      if (k.targets().length) firstPhase = 'targets during the rise';
      w.step();
      t += DT;
    }
    check(near(t, 6, 0.02) && k.phase === 1 && firstPhase === null, `the rise lasts 6 s with no targets, then phase 1 (${f2(t)} s)`);
    // the first attack's warning sounds the rising tentacle tone, told how long the warning lasts (its surge, the slam)
    t = 0;
    while (k.state.attacks < 1 && t < 15) {
      w.step();
      t += DT;
    }
    const ring = k.visuals().rings.find((r) => r.kind === 'tentacle');
    const tone = w.log.sfx.filter((s) => s.name === 'tentacle');
    const dur = tone[0] && tone[0].o ? tone[0].o.duration : null;
    check(!!ring && tone.length === 1 && near(dur, ring.T) && near(ring.T, 1.8) && !w.log.sfx.some((s) => s.name === 'bombWhistle'), `a warning sounds the rising tentacle tone for as long as it lasts (${tone.length} tone, ${f2(dur)} s)`);
  }
  {
    const w = world({ player: { x: 10, z: 10, h: Math.PI / 2 } });
    w.k.rise(undefined, undefined, { short: true });
    let t = 0;
    while (w.k.rising && t < 10) {
      w.step();
      t += DT;
    }
    check(near(t, 3, 0.02) && w.k.state.short === true, `the short rise (the checkpoint's retry) lasts 3 s (${f2(t)} s)`);
    const w2 = world({ player: { x: 0, z: 0, h: 0 } });
    w2.k.rise();
    w2.run(1);
    check(w2.k.skip() === true && w2.k.phase === 1 && !w2.k.rising, 'skip() ends the rise at once (any key or tap)');
  }
  {
    // the eye's spot moved off land into open water
    const colliders = [{ x: 0, z: 40, r: 12 }];
    const w = world({ player: { x: 0, z: 0, h: 0 }, colliders });
    w.k.rise();
    const V = w.k.visuals();
    const dEye = V.head ? Math.hypot(V.head.x, V.head.z) : NaN;
    check(V.head && !w.land(V.head.x, V.head.z, 6) && dEye >= 40 - 1e-6 && dEye <= 48 + 1e-6, `land 40 u ahead: the eye opens in open water still about 40 u away (${f2(dEye)} u)`);
  }

  // ================================================================ phases and chase speeds
  {
    const w = fight({ player: { x: 0, z: 0, h: 0 } });
    const k = w.k;
    const seq = [601, 401, 400, 201, 200, 1].map((v) => (k.setHp(v), k.phase));
    check(same(seq, [1, 1, 2, 2, 3, 3]), `phase thresholds: 401 → 1, 400 → 2, 201 → 2, 200 → 3 (${seq})`);
    // by hits on its parts: hit tentacles until the bar crosses 400
    const w2 = fight({ player: { x: 0, z: 0, h: 0 } });
    w2.k.setHp(410);
    let crossed = false;
    for (let i = 0; i < 120 * 30 && !crossed; i++) {
      w2.step();
      const t = w2.k.targets().find((x) => x.kind === 'tentacle');
      if (t) w2.k.hit(t.id, { dmg: 6 });
      if (w2.k.phase === 2) crossed = true;
    }
    check(crossed && w2.k.hp <= 400, `hits on its tentacles take it into phase 2 at 400 (${f2(w2.k.hp)})`);
  }
  function chaseSpeed(hp, frost = false) {
    const w = fight({ player: { x: 0, z: -60, h: 0 }, riseX: 0, riseZ: 40 }, hp);
    if (frost) w.k.special('head', 'frost');
    const a = w.k.state.shadow;
    w.run(1, { speed: 0 });
    const b = w.k.state.shadow;
    return Math.hypot(b.x - a.x, b.z - a.z);
  }
  {
    const s1 = chaseSpeed(600);
    const s2 = chaseSpeed(390);
    const sf = chaseSpeed(600, true);
    check(near(s1, 8, 0.05) && near(s2, 9.5, 0.05), `the shadow chases at 8 u/s in phase 1, 9.5 in phase 2 (${f2(s1)}, ${f2(s2)})`);
    check(near(sf, 4, 0.05), `frozen, it chases at half speed (${f2(sf)})`);
    const w = fight({ player: { x: 0, z: 0, h: 0 } }, 150);
    w.run(1);
    const a = w.k.state;
    w.run(20, { speed: 0 });
    const b = w.k.state;
    const off = Math.hypot(a.head.x - 0, a.head.z - 0);
    check(a.head && b.head && near(a.head.x, b.head.x, 1e-9) && near(a.head.z, b.head.z, 1e-9) && near(off, 25, 0.01) && Math.abs(a.head.z) < 0.01, `phase 3: the shadow stops, the head surfaces 25 u off your beam and stays there (${f2(off)} u)`);
    // a stock ship at full sail outruns phase 1's shadow
    const wf = fight({ player: { x: 0, z: -20, h: Math.PI }, riseX: 0, riseZ: 10 });
    const d0 = Math.hypot(wf.k.state.shadow.x - wf.p.x, wf.k.state.shadow.z - wf.p.z);
    wf.run(5, { h: Math.PI, speed: 12 });
    const d1 = Math.hypot(wf.k.state.shadow.x - wf.p.x, wf.k.state.shadow.z - wf.p.z);
    check(d1 > d0 + 15, `a stock ship at 12 u/s outruns the phase-1 shadow (${f2(d0)} → ${f2(d1)} u)`);
    // close in, it circles a standing ship at lurk range (inside the 14 u trigger, beside the ship, not under it)
    const wl = fight({ player: { x: 0, z: 0, h: 0 }, riseX: 0, riseZ: 40 });
    wl.run(8, { speed: 0 });
    let lo = Infinity;
    let hi = 0;
    let turned = 0;
    let last = null;
    for (let i = 0; i < 120 * 20; i++) {
      wl.step(DT, { speed: 0 });
      const S = wl.k.state;
      if (S.head) continue;
      const d = Math.hypot(S.shadow.x, S.shadow.z);
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
      const a = Math.atan2(S.shadow.x, S.shadow.z);
      if (last !== null) turned += Math.abs(wrap(a - last));
      last = a;
    }
    check(lo >= KRAKEN.lurk - 1 && hi <= KRAKEN.phases[0].trigger && turned > Math.PI, `close in, the shadow circles you ${f2(lo)}–${f2(hi)} u away (inside the 14 u trigger, never under your ship; ${f2(turned)} rad round)`);
  }

  // ================================================================ attacks: counts, intervals, warnings, slams
  const runs = []; // every long run, for the EXIT block
  function longRun(name, hp, script, opts = {}) {
    const w = fight({ seed: opts.seed ?? 11, player: { x: 0, z: 0, h: 0, ...(opts.player || {}) }, warnBonus: opts.warnBonus || 0, colliders: opts.colliders || [], script }, hp);
    w.name = name;
    w.phaseWanted = w.k.phase;
    const secs = opts.secs ?? 600;
    const n = Math.round(secs / DT);
    for (let i = 0; i < n; i++) {
      if (opts.each) opts.each(w, i);
      // hold the phase: no shots, but keep the bar inside the phase if something burned it
      w.step();
    }
    runs.push(w);
    return w;
  }
  const P1 = 600;
  const P2 = 390;
  const P3 = 190;
  const phaseRuns = {};
  for (const [ph, hp] of [[1, P1], [2, P2], [3, P3]]) {
    phaseRuns[ph] = {
      stand: longRun(`phase ${ph} standing`, hp, stand, { seed: 100 + ph }),
      flee: longRun(`phase ${ph} fleeing`, hp, fleeFrom(), { seed: 200 + ph }),
      wander: longRun(`phase ${ph} wandering`, hp, wander(300 + ph), { seed: 300 + ph }),
      circle: longRun(`phase ${ph} circling, Lighthouse +1 s`, hp, circle, { seed: 400 + ph, warnBonus: 1 }),
    };
  }
  for (const ph of [1, 2, 3]) {
    const R = phaseRuns[ph];
    const all = Object.values(R);
    const row = KRAKEN.phases[ph - 1];
    check(all.every((w) => w.k.phase === ph), `phase ${ph} holds over 600 s with no shots fired`);
    const counts = all.flatMap((w) => w.attackStarts.map((a) => a.n));
    check(counts.length > 20 && counts.every((n) => n === row.count), `phase ${ph}: every attack raises ${row.count} tentacles (${counts.length} attacks)`);
    // intervals: a standing ship near the shadow is attacked every `every` s (the head's surfacing can stretch one)
    const st = R.stand.attackStarts.map((a) => a.at);
    const gaps = st.slice(1).map((t, i) => t - st[i]);
    const minGap = Math.min(...gaps);
    const common = gaps.filter((g) => near(g, row.every, 0.02)).length;
    check(minGap >= row.every - 0.02 && common >= gaps.length / 2, `phase ${ph}: attacks every ${row.every} s on a standing ship (min ${f2(minGap)} s, ${common}/${gaps.length} exactly)`);
    const warns = all.flatMap((w) => w.rings.map((r) => r.T - (w.warnBonus || 0)));
    check(warns.length > 0 && warns.every((T) => near(T, row.warn, 1e-6)), `phase ${ph}: every tentacle warning is ${row.warn} s (+ the Lighthouse's bonus when there is one)`);
    const grabsBad = ph === 1 ? all.reduce((n, w) => n + w.grabs.length, 0) : 0;
    if (ph === 1) check(grabsBad === 0 && all.every((w) => w.rings.every((r) => !r.grab)), 'phase 1: never a grab, no red ring');
  }
  {
    const all = Object.values(phaseRuns).flatMap((R) => Object.values(R));
    // slam damage only inside the ring, and always 12 when a slam lands on the hull
    const slams = all.flatMap((w) => w.log.damage.filter((d) => d.source === 'slam'));
    check(slams.length > 50 && slams.every((d) => d.amount === 12 && d.inside <= KRAKEN.ring + 1e-6), `slam damage only inside the ring, 12 each (${slams.length} slams)`);
    // a slam on the hull rises beside it (not up through the deck)
    let through = 0;
    let onHull = 0;
    {
      const w = fight({ seed: 3, player: { x: 0, z: 0, h: 0 } }, P1);
      for (let i = 0; i < 120 * 120; i++) {
        w.step(DT, { speed: 0 });
        for (const t of w.k.state.tentacles) {
          if (t.state !== 'slam' || t.t > DT + 1e-9) continue;
          const ring = w.rings.find((r) => r.id === t.id);
          if (ring && ring.hull <= KRAKEN.ring) {
            onHull++;
            if (hullDist(w.p, t.x, t.z) < KRAKEN.grab.stand - 1e-6) through++;
          }
        }
      }
    }
    check(onHull > 5 && through === 0, `a tentacle that slams your hull rises beside it, not through the deck (${onHull} slams)`);
    let missed = 0;
    let wrong = 0;
    for (const w of all) {
      for (const L of w.landings) {
        const dmg = w.log.damage.filter((d) => d.source === 'slam' && near(d.t, L.at, 1e-9) && near(d.x, L.ring.x, 1e-5) && near(d.z, L.ring.z, 1e-5)).length;
        if (L.state === 'grab') continue;
        if (L.hull <= KRAKEN.ring - 1e-6 && dmg !== 1) missed++;
        if (L.hull > KRAKEN.ring + 1e-6 && dmg !== 0) wrong++;
      }
    }
    check(missed === 0 && wrong === 0, `every landing on the hull slams once, none off it (${missed} missed, ${wrong} wrong)`);
    check(all.every((w) => w.maxUp <= KRAKEN.maxUp && w.maxVisual <= KRAKEN.maxUp), `never more than 4 tentacles up over 600 s of each phase, 4 scripts each (max ${Math.max(...all.map((w) => w.maxUp))})`);
    check(all.every((w) => w.maxRings <= 4), `never more than 4 warning rings at once, ink blobs included (§14; max ${Math.max(...all.map((w) => w.maxRings))})`);
    // no tentacle rises on the head (a ring ≥ head r 6 + ring r 4 from its centre while there is a head), and in
    // the last stand none but the one aimed at you stands in the line from your ship to its eye (the weak spot
    // stays in view and in reach of your guns); the head never surfaces on a tentacle that is up or coming up
    const C = KRAKEN.clear;
    let withHead = 0;
    let onHead = 0;
    let closest = Infinity;
    let sightRings = 0;
    let inSight = 0;
    let sightMin = Infinity;
    for (const w of all) {
      for (const r of w.rings) {
        if (!r.head || r.head.state === 'gone') continue;
        withHead++;
        const d = Math.hypot(r.x - r.head.x, r.z - r.head.z);
        closest = Math.min(closest, d);
        if (d < C.body - 1e-6) onHead++;
        if (r.phase === 3 && r.i > 0 && (r.head.state === 'rise' || r.head.state === 'up')) {
          sightRings++;
          const E = KRAKEN.parts.eye;
          const ex = r.head.x + Math.sin(r.head.h) * E.ahead;
          const ez = r.head.z + Math.cos(r.head.h) * E.ahead;
          const dx = ex - r.ship.x;
          const dz = ez - r.ship.z;
          const u = Math.max(0, Math.min(1, ((r.x - r.ship.x) * dx + (r.z - r.ship.z) * dz) / (dx * dx + dz * dz)));
          const s = Math.hypot(r.x - (r.ship.x + dx * u), r.z - (r.ship.z + dz * u));
          sightMin = Math.min(sightMin, s);
          if (s < C.sight - 1e-6) inSight++;
        }
      }
    }
    check(C.body >= KRAKEN.parts.head.r + KRAKEN.ring && withHead > 300 && onHead === 0, `no tentacle rises on the head: every ring ≥ ${C.body} u from its centre (${withHead} rings with a head about, closest ${f2(closest)} u)`);
    check(C.sight >= KRAKEN.ring && sightRings > 300 && inSight === 0, `the last stand: no ring but the one aimed at you stands in the line from your ship to its eye (${sightRings} rings, nearest ${f2(sightMin)} u from it)`);
    const surf = all.flatMap((w) => w.surfacings);
    const crowded = surf.filter((h) => h.tents.length > 0);
    const under = surf.filter((h) => h.tents.some((t) => Math.hypot(t.x - h.x, t.z - h.z) < C.body - 1e-6)).length;
    check(surf.length > 30 && crowded.length > 20 && under === 0, `the head never surfaces on a tentacle that is up or coming up (${surf.length} surfacings, ${crowded.length} with tentacles about)`);
  }
  {
    // a landed tentacle: slams, sways as a target until 4 s after the slam, then sinks (≤ 0.5 s) and is gone
    const w = fight({ seed: 4, player: { x: 0, z: 0, h: 0 } }, P1);
    const life = new Map(); // id → { land, sink, gone }
    for (let i = 0; i < 120 * 60; i++) {
      w.step(DT, { speed: 0 });
      const S = w.k.state;
      const ids = new Set();
      for (const t of S.tentacles) {
        ids.add(t.id);
        const L = life.get(t.id) || {};
        if (t.state !== 'warn' && L.land === undefined) L.land = w.time;
        if (t.state === 'sink' && L.sink === undefined) L.sink = w.time;
        life.set(t.id, L);
      }
      for (const [id, L] of life) if (!ids.has(id) && L.gone === undefined) L.gone = w.time;
    }
    const done = [...life.values()].filter((L) => L.gone !== undefined && L.land !== undefined);
    check(done.length >= 6 && done.every((L) => near(L.sink - L.land, KRAKEN.sway, DT + 1e-6) && L.gone - L.sink <= 0.5 + DT + 1e-6), `a tentacle sways 4 s from its slam, then sinks within 0.5 s (${done.length} tentacles)`);
  }
  {
    // warnings + 0.5 s while frozen (refreshed throughout)
    const w = fight({ player: { x: 0, z: 0, h: 0 } }, P3);
    for (let i = 0; i < 120 * 60; i++) {
      if (i % 240 === 0) w.k.special('head', 'frost');
      w.step();
    }
    const T = w.rings.map((r) => r.T);
    check(T.length > 20 && T.every((t) => near(t, 1.5 + 0.5, 1e-6)), `frozen, every warning is 0.5 s longer (phase 3: ${f2(Math.min(...T))}–${f2(Math.max(...T))} s)`);
  }
  {
    // the hard cap: with a 9 s sway (a stretched copy of the table), a fifth tentacle retires the oldest at once
    const keep = KRAKEN.sway;
    KRAKEN.sway = 9;
    let w;
    try {
      w = longRun('phase 3, 9 s sway (cap stress)', P3, stand, { seed: 7, secs: 120 });
    } finally {
      KRAKEN.sway = keep;
    }
    runs.pop(); // (not a real-table run)
    check(w.maxUp === 4 && w.maxVisual <= 4 && w.landings.length > 30, `the hard cap: when a fifth would rise the oldest goes under at once (max ${w.maxUp} up over ${w.landings.length} landings)`);
  }

  // ================================================================ grabs
  {
    const g2 = Object.values(phaseRuns[2]).concat(Object.values(phaseRuns[3]));
    const grabs = g2.flatMap((w) => w.grabs);
    check(grabs.length >= 10, `grabs happen in phases 2–3 (${grabs.length})`);
    check(grabs.every((g) => g.ring && g.ring.grab && g.ring.i === 0 && g.hull <= KRAKEN.ring + 1e-6), 'a grab comes only from the first (red-rimmed) ring of an attack, landing with your hull inside it');
    check(g2.every((w) => w.rings.every((r) => !r.grab || r.i === 0)), 'only the first ring of an attack is ever red-rimmed');
    const held = g2.flatMap((w) => w.releases.map((r) => r.held));
    check(held.length > 0 && held.every((h) => h <= KRAKEN.grab.max + DT + 1e-9), `every grab lets go by 4 s (longest ${f2(Math.max(...held))} s)`);
    const reds = g2.flatMap((w) => w.landings.filter((L) => L.ring && L.ring.grab && L.hull <= KRAKEN.ring - 1e-6));
    check(reds.length > 0 && reds.every((L) => L.state === 'grab'), `a red ring that lands on your hull grabs (${reds.length})`);
  }
  // one grab, set up: phase 2, a standing ship, the first red ring on its hull
  function grabbed(opts = {}) {
    for (let seed = 1; seed < 200; seed++) {
      const w = fight({ seed, player: { x: 0, z: 0, h: 0 }, tables: opts.tables || TABLES }, P2);
      for (let i = 0; i < 120 * 40 && !w.k.grabbed; i++) w.step();
      if (w.k.grabbed) return w;
    }
    return null;
  }
  {
    const w = grabbed();
    check(!!w, 'a standing ship in phase 2 gets grabbed');
    if (w) {
      check(same(w.k.playerMods(), { speedMul: 0, turnMul: 0, dps: 2, vx: 0, vz: 0 }), 'grabbed: speed and turn 0, 2 hp/s (main applies the dps)');
      check(w.log.pops.some((p) => p.text === 'GRABBED!') && w.log.announce.some((a) => /grabbed you/.test(a.text)) && w.log.sfx.some((s) => s.name === 'grab'), 'a grab says GRABBED!, a #game-live line and the grab sound');
      const V = w.k.visuals();
      const gt = V.tentacles.find((t) => t.state === 'grab');
      check(gt && Number.isFinite(gt.tx) && Math.hypot(gt.x - gt.tx, gt.z - gt.tz) >= KRAKEN.grab.stand - 1e-6 && hullDist(w.p, gt.tx, gt.tz) < 1e-6, 'the grabbing tentacle stands beside the hull it holds (tx, tz on the hull)');
      check(w.k.targets().some((t) => t.id === w.k.state.grab.id), 'the grabbing tentacle is a target (shoot it to make it let go)');
      // cut by 3 taps
      const a = w.k.cut();
      const b = w.k.cut();
      const c = w.k.cut();
      check(a === false && b === false && c === true && !w.k.grabbed, 'three taps of G / CUT! cut it loose (the third returns true)');
    }
    const w2 = grabbed();
    if (w2) {
      w2.k.cutHold(true);
      w2.run(0.79, { speed: 0 });
      const still = w2.k.grabbed;
      w2.run(0.02, { speed: 0 });
      check(still && !w2.k.grabbed, 'holding G / CUT! 0.8 s cuts it loose');
      w2.k.cutHold(false);
    }
    const w3 = grabbed();
    if (w3) {
      const id = w3.k.state.grab.id;
      const r = w3.k.hit(id, { dmg: 1 });
      check(r && r.word === 'OUCH!' && !w3.k.grabbed && !w3.k.targets().some((t) => t.id === id), 'any hit of your shot on the grabbing tentacle makes it let go (OUCH!, it recoils)');
    }
    const w4 = grabbed();
    if (w4) {
      const word = w4.k.special('eye', 'stink');
      check(word === 'ACHOO!' && !w4.k.grabbed, 'a stink hit: ACHOO! and the grab lets go');
    }
    const w5 = grabbed();
    if (w5) {
      w5.run(3.9, { speed: 0 });
      const still = w5.k.grabbed;
      w5.run(0.15, { speed: 0 });
      check(still && !w5.k.grabbed && w5.log.pops.some((p) => p.text === 'FREE!'), 'left alone, it always lets go at 4 s (FREE!)');
    }
    const w6 = grabbed();
    if (w6) {
      w6.k.cutHold(true);
      w6.run(0.5, { speed: 0 });
      w6.k.cutHold(false);
      w6.run(0.5, { speed: 0 });
      check(w6.k.grabbed && w6.k.state.grab.hold === 0, 'letting go of G resets the hold');
    }
  }
  {
    // standing ships in phases 2 and 3, many seeds: never grabbed within 8 s of a release; the first rings after a
    // release land ≥ 8 u from the hull
    let releases = 0;
    let soon = Infinity;
    let firstRings = 0;
    let closest = Infinity;
    // (frost pulses every 7.3 s vary the warnings, so a grab attack can warn 2 s and the one two attacks later
    // 1.5 s: then its red ring would land 7.5 s after a 4 s grab ran out, and only the 8 s rule stops it)
    const pulse = (w, i) => {
      if (i % 876 === 0) w.k.special('head', 'frost');
    };
    for (const [hp, seeds, each] of [[P2, [1, 2, 3, 4, 5, 6], null], [P3, [1, 2, 3, 4, 5, 6], null], [P3, [7, 8, 9, 10], pulse], [P2, [11, 12], pulse]]) {
      for (const seed of seeds) {
        const w = longRun(`standing, seed ${seed}, hp ${hp}${each ? ', frost pulses' : ''}`, hp, stand, { seed: 500 + seed, secs: each ? 600 : 240, each });
        releases += w.releases.length;
        for (const g of w.grabs) if (Number.isFinite(g.sinceRelease)) soon = Math.min(soon, g.sinceRelease);
        for (const r of w.rings) {
          if (r.rest) {
            firstRings++;
            closest = Math.min(closest, r.hull);
          }
        }
      }
    }
    check(releases >= 10, `standing ships are grabbed and released again and again (${releases} releases)`);
    check(soon >= KRAKEN.grabRest - 1e-6, `a standing ship is never grabbed within 8 s of a release (soonest ${f2(soon)} s)`);
    check(firstRings >= 10 && closest >= KRAKEN.restGap - 1e-6, `the first rings after a release land ≥ 8 u from the hull (${firstRings} rings, closest ${f2(closest)} u)`);
  }

  // ================================================================ ctx.tables are read, not copied
  {
    const alt = JSON.parse(JSON.stringify(TABLES));
    alt.RAIDERS.cutTaps = 5;
    alt.RAIDERS.cutHold = 1.5;
    const w = grabbed({ tables: alt });
    if (w) {
      const taps = [1, 2, 3, 4, 5].map(() => w.k.cut());
      check(same(taps, [false, false, false, false, true]) && !w.k.grabbed, 'altered RAIDERS.cutTaps (5): four taps hold, the fifth cuts');
    }
    const w2 = grabbed({ tables: alt });
    if (w2) {
      w2.k.cutHold(true);
      w2.run(1.45, { speed: 0 });
      const still = w2.k.grabbed;
      w2.run(0.1, { speed: 0 });
      check(still && !w2.k.grabbed, 'altered RAIDERS.cutHold (1.5 s) is the hold used');
    }
    const s = JSON.parse(JSON.stringify(TABLES));
    s.STATUS.frost.time = 10;
    s.STATUS.stink.boss = 3;
    s.STATUS.stink.bossImmune = 7;
    s.STATUS.fire.dps = 5;
    s.STATUS.fire.boss = 4;
    const wf = fight({ tables: s, player: { x: 0, z: 0, h: 0 } });
    wf.k.special('head', 'frost');
    check(near(wf.k.state.status.t, 5, 1e-9), 'altered STATUS.frost.time (10): frozen 10 × bossMul = 5 s');
    const wb = fight({ tables: s, player: { x: 0, z: -80, h: 0 }, riseX: 0, riseZ: 60 });
    const hp0 = wb.k.hp;
    wb.k.special('head', 'fire');
    wb.run(5, { speed: 0 });
    check(near(hp0 - wb.k.hp, 20, 1e-6), `altered STATUS.fire (5 hp/s for 4 s): 20 to the bar (${f2(hp0 - wb.k.hp)})`);
    const ws = fight({ tables: s, player: { x: 0, z: 0, h: 0 } });
    ws.k.special('head', 'stink');
    ws.run(2.95, { speed: 0 });
    const stinky = ws.k.state.status.id === 'stink';
    ws.run(0.1, { speed: 0 });
    const pegs = ws.k.state.status.pegs;
    check(stinky && ws.k.state.status.id === null && near(pegs, 7, 0.1), `altered STATUS.stink (boss 3 s, pegs 7 s) are the times used (pegs ${f2(pegs)})`);
    const wi = fight({ tables: { ...TABLES, INK: { ...TABLES.INK, radius: 6, damage: 20, warn: 2.5 } }, player: { x: 0, z: 0, h: 0 } }, P2);
    wi.run(20, { speed: 0 });
    const inks = [];
    const wi2 = fight({ tables: { ...TABLES, INK: { ...TABLES.INK, radius: 6, damage: 20, warn: 2.5 } }, player: { x: 0, z: 0, h: 0 } }, P2);
    for (let i = 0; i < 120 * 30; i++) {
      wi2.step(DT, { speed: 0 });
      for (const b of wi2.k.state.inks) if (!inks.some((x) => x.x === b.x && x.z === b.z)) inks.push(b);
    }
    const dmg = wi2.log.damage.filter((d) => d.source === 'ink');
    check(inks.length >= 2 && inks.every((b) => b.r === 6 && near(b.T, 2.5, 1e-9)) && dmg.length >= 1 && dmg.every((d) => d.amount === 20), `altered INK (r 6, warn 2.5 s, 20 damage) is the ink blob used (${inks.length} blobs, ${dmg.length} hits)`);
    // junk tables: today's numbers
    const wj = fight({ tables: { STATUS: 'x', INK: null }, player: { x: 0, z: 0, h: 0 } });
    wj.k.special('head', 'frost');
    check(near(wj.k.state.status.t, 2.5, 1e-9), 'missing tables read today’s numbers (frost 2.5 s on the Kraken)');
  }

  // ================================================================ head, ink, pull, cut-off
  {
    // phase 1: the head every 3rd attack, phase 2 every 2nd, 7 s up, 20 u off the beam
    for (const [hp, every] of [[P1, 3], [P2, 2]]) {
      const w = fight({ seed: 21, player: { x: 0, z: 0, h: 0 } }, hp);
      const ups = [];
      let upAt = null;
      let surfaced = null;
      for (let i = 0; i < 120 * 120; i++) {
        w.step(DT, { speed: 0 });
        const S = w.k.state;
        if (S.head && S.head.state === 'rise' && S.head.t <= DT + 1e-9) surfaced = { attack: S.phaseAttacks, d: Math.hypot(S.head.x - w.p.x, S.head.z - w.p.z), along: S.head.z - w.p.z };
        if (S.head && S.head.state === 'up' && upAt === null) upAt = w.time;
        if (upAt !== null && (!S.head || S.head.state !== 'up')) {
          ups.push({ secs: w.time - upAt, ...surfaced });
          upAt = null;
        }
      }
      check(ups.length >= 3 && ups.every((u) => u.attack % every === 0), `phase ${hp === P1 ? 1 : 2}: the head surfaces on every ${every === 3 ? '3rd' : '2nd'} attack (${ups.map((u) => u.attack).join(', ')})`);
      check(ups.every((u) => near(u.secs, 7, 0.02) && near(u.d, 20, 0.01) && Math.abs(u.along) < 0.01), `phase ${hp === P1 ? 1 : 2}: it stays up 7 s, 20 u off your beam`);
    }
    {
      // land where the head would surface: it surfaces as near your beam as there is open water at that range,
      // never closer to your hull (the nearest open water to a rock there could be right beside you)
      let worst = Infinity;
      let wet = true;
      let n = 0;
      for (const [hp, off] of [[P1, 20], [P2, 20], [P3, 25]]) {
        for (const side of [-1, 1]) {
          // rocks on both beams at the head's range, the shadow on one side
          const colliders = [{ x: -off, z: 0, r: 7 }, { x: off, z: 0, r: 7 }, { x: side * off * 0.7, z: 8, r: 4 }];
          const w = fight({ seed: 3 + side, player: { x: 0, z: 0, h: 0 }, colliders, riseX: side * 14, riseZ: 4 }, hp);
          for (let i = 0; i < 120 * 40; i++) {
            w.step(DT, { speed: 0 });
            const S = w.k.state;
            if (S.head && S.head.state === 'rise' && S.head.t <= DT + 1e-9) {
              n++;
              worst = Math.min(worst, Math.hypot(S.head.x - w.p.x, S.head.z - w.p.z) - off);
              if (w.land(S.head.x, S.head.z, KRAKEN.clear.head - 1e-6)) wet = false;
            }
          }
        }
      }
      check(n >= 6 && wet && worst >= -1e-6, `rocks on the beam: the head still surfaces in open water at its range, never nearer your hull (${n} surfacings, nearest ${f2(worst)} u off its range)`);
    }
    const w3 = phaseRuns[3].stand;
    check(w3.k.state.head && w3.k.state.head.state === 'up' && w3.k.state.head.up, 'phase 3: the head is still up after 600 s');
    // the last stand begins while a phase-2 head is up: that head goes under, then surfaces 25 u off your beam
    {
      const wh = fight({ seed: 21, player: { x: 0, z: 0, h: 0 } }, P2);
      for (let i = 0; i < 120 * 60 && !(wh.k.state.head && wh.k.state.head.state === 'up'); i++) wh.step(DT, { speed: 0 });
      const before = wh.k.state.head;
      wh.k.setHp(P3);
      const sinking = wh.k.state.head && wh.k.state.head.state === 'sink';
      wh.run(1.05, { speed: 0 });
      const H = wh.k.state.head;
      const off = H ? Math.hypot(H.x - wh.p.x, H.z - wh.p.z) : NaN;
      wh.run(2, { speed: 0 });
      const H2 = wh.k.state.head;
      check(!!before && sinking && H && H.state === 'rise' && near(off, 25, 0.01) && H2 && H2.state === 'up' && H2.up, `the last stand with a head up: it goes under, then surfaces 25 u off your beam to stay (${f2(off)} u)`);
    }
    // ... and when the last stand's first tentacles rise while that head is going under (anywhere within 40 u),
    // it surfaces clear of them: off your beam as near as there is room, never on a tentacle
    {
      let tries = 0;
      let crowded = 0;
      let under = 0;
      let swung = 0;
      let range = true;
      for (let seed = 1; seed <= 40; seed++) {
        const wh = fight({ seed: 900 + seed, player: { x: 0, z: 0, h: 0 } }, P2);
        for (let i = 0; i < 120 * 60 && !(wh.k.state.head && wh.k.state.head.state === 'up' && wh.k.state.sinceAttack >= KRAKEN.phases[2].every); i++) wh.step(DT, { speed: 0 });
        if (!(wh.k.state.head && wh.k.state.head.state === 'up')) continue;
        wh.k.setHp(P3);
        const sat = wh.surfacings.length;
        for (let i = 0; i < 120 * 2 && wh.surfacings.length === sat; i++) wh.step(DT, { speed: 0 });
        const h = wh.surfacings[sat];
        if (!h) continue;
        tries++;
        // where it would have come up: 25 u off the beam, on the side it went under
        const side = h.x >= 0 ? 1 : -1;
        const beam = { x: side * 25, z: 0 };
        const near0 = h.tents.some((t) => Math.hypot(t.x - beam.x, t.z - beam.z) < KRAKEN.clear.body);
        const sideB = { x: -side * 25, z: 0 };
        if (near0) crowded++;
        if (h.tents.some((t) => Math.hypot(t.x - h.x, t.z - h.z) < KRAKEN.clear.body - 1e-6)) under++;
        if (Math.abs(h.z) > 0.01) swung++;
        const d = Math.hypot(h.x, h.z);
        if (d < 25 - 0.01 || d > 33 + 0.01) range = false;
        void sideB;
      }
      check(tries >= 30 && crowded >= 3 && under === 0 && range, `the last stand's head surfaces clear of the tentacles already rising, 25 u off your beam as near as there is room (${tries} runs, ${crowded} with a tentacle on the beam spot, ${swung} swung round)`);
    }
    // the eye glows 4 s in every 8 in phase 3
    const wg = fight({ player: { x: 0, z: 0, h: 0 } }, P3);
    wg.run(2, { speed: 0 });
    const glow = [];
    for (let i = 0; i < 16 * 30; i++) {
      wg.run(1 / 30, { speed: 0 });
      glow.push(wg.k.visuals().eye.glow);
    }
    const bright = glow.filter((g) => g > 0.9).length / glow.length;
    let flips = 0;
    for (let i = 1; i < glow.length; i++) if ((glow[i] > 0.6) !== (glow[i - 1] > 0.6)) flips++;
    check(bright > 0.35 && bright < 0.55 && flips === 4, `phase 3: the eye glows about 4 s in every 8 (bright ${f2(bright)}, ${flips} changes in 16 s, under 1 Hz)`);
  }
  {
    // ink every 12 s in phase 2 (first at 6 s), 8 damage inside, a slick each time; none in phases 1 and 3
    const w = fight({ player: { x: 0, z: 0, h: 0 } }, P2);
    const spits = [];
    let seen = 0;
    for (let i = 0; i < 120 * 60; i++) {
      w.step(DT, { speed: 0 });
      const n = w.k.state.counts.inks;
      if (n !== seen) {
        seen = n;
        spits.push(w.k.state.fightT);
      }
    }
    const gaps = spits.slice(1).map((t, i) => t - spits[i]);
    check(spits.length === 5 && near(spits[0], 6, 0.02) && gaps.every((g) => near(g, 12, 0.02)), `phase 2: an ink blob 6 s in, then every 12 s (${spits.map(f2).join(', ')})`);
    const inkDmg = w.log.damage.filter((d) => d.source === 'ink');
    check(inkDmg.length >= 1 && inkDmg.every((d) => d.amount === 8 && d.inside <= 4 + 1e-6) && w.log.slicks.length === spits.length - (w.k.state.inks.length ? 1 : 0), `the blob hits for 8 inside its ring and always leaves a slick (${inkDmg.length} hits, ${w.log.slicks.length} slicks)`);
    check(phaseRuns[1].stand.k.state.counts.inks === 0 && phaseRuns[3].stand.k.state.counts.inks === 0, 'no ink in phases 1 and 3');
    {
      const wv = fight({ player: { x: 0, z: 0, h: 0 } }, P2);
      for (let i = 0; i < 120 * 10 && wv.k.state.counts.inks === 0; i++) wv.step(DT, { speed: 0 });
      const R = wv.k.visuals().rings.filter((r) => r.kind === 'ink');
      const S = wv.k.state;
      const src = S.head || S.shadow;
      check(R.length === 1 && R[0].r === 4 && near(R[0].T, 1.8) && R[0].from && near(R[0].from.x, src.x, 0.2) && near(R[0].from.z, src.z, 0.2) && wv.k.visuals().rings.filter((r) => r.kind === 'tentacle').every((r) => !r.from), 'visuals: an ink blob is a ring of kind ink with where it was spat from (a lob for the view)');
    }
  }
  {
    // the pull in phase 3: 2 u/s toward the head within 50 u, nothing beyond; none in phases 1–2
    const w = fight({ player: { x: 0, z: 0, h: 0 } }, P3);
    w.run(1.5, { speed: 0 });
    const H = w.k.state.head;
    const m = w.k.playerMods();
    const mag = Math.hypot(m.vx, m.vz);
    const dot = (m.vx * (H.x - w.p.x) + m.vz * (H.z - w.p.z)) / (mag * Math.hypot(H.x - w.p.x, H.z - w.p.z));
    check(near(mag, 2, 1e-6) && near(dot, 1, 1e-6), 'phase 3: you are pulled 2 u/s toward the head');
    w.p.x = H.x - 51;
    w.p.z = H.z;
    w.p.h = 0;
    const far = w.k.playerMods();
    check(far.vx === 0 && far.vz === 0, 'phase 3: no pull beyond 50 u');
    const wn = fight({ player: { x: 0, z: 0, h: 0 } }, P3);
    wn.run(30, { speed: 0 });
    const Hn = wn.k.state.head;
    const dn = Math.hypot(Hn.x - wn.p.x, Hn.z - wn.p.z);
    check(near(dn, KRAKEN.phases[2].pull.min, 0.05) && wn.k.playerMods().vx === 0, `the pull stops ${f2(dn)} u from the head (clear of it, in gun range)`);
    const w1 = fight({ player: { x: 0, z: 0, h: 0 } }, P1);
    w1.run(2, { speed: 0 });
    const m1 = w1.k.playerMods();
    check(m1.vx === 0 && m1.vz === 0 && m1.speedMul === 1, 'no pull in phases 1–2');
  }
  {
    // the cut-off: a ship that outruns the shadow gets an attack 12 s after the last, 30 u ahead of its bow
    const w = fight({ player: { x: -70, z: 0, h: Math.PI / 2 }, riseX: -110, riseZ: 0 });
    let at = null;
    let center = null;
    for (let i = 0; i < 120 * 14 && at === null; i++) {
      w.step(DT, { h: Math.PI / 2, speed: 12 });
      const S = w.k.state;
      if (S.attacks === 1) {
        at = S.fightT;
        center = { x: S.shadow.x - w.p.x, z: S.shadow.z - w.p.z };
      }
    }
    const rings = w.rings.filter((r) => r.attack === 1);
    check(at !== null && near(at, 12, 0.02) && w.k.state.counts.cutOffs === 1, `the cut-off: no attack for 12 s → it attacks anyway (${f2(at)} s)`);
    check(center && near(center.x, 30, 0.2) && Math.abs(center.z) < 0.2 && rings.length === 2 && rings.every((r) => Math.hypot(r.x - (w.p.x + 30), r.z - w.p.z) <= 10), 'it surfaces 30 u ahead of your bow and its rings are there');
  }
  {
    // never on land or beyond worldRadius − 20: rocks round the arena, a ship that sails near the edge
    const colliders = [];
    const r = mulberry32(99);
    for (let i = 0; i < 40; i++) colliders.push({ x: (r() - 0.5) * 220, z: (r() - 0.5) * 220, r: 3 + r() * 6 });
    const edgeLap = (p) => {
      const d = Math.hypot(p.x, p.z);
      const tang = Math.atan2(p.x, p.z) + Math.PI / 2;
      return { h: d < 112 ? Math.atan2(p.x, p.z) : tang, speed: 10 };
    };
    let bad = 0;
    let checked = 0;
    let shadowBad = 0;
    const lim = 140 - KRAKEN.edge;
    for (const [hp, script, seed] of [[P1, edgeLap, 1], [P2, edgeLap, 2], [P3, edgeLap, 3], [P1, wander(5), 4], [P2, wander(6), 5], [P3, wander(7), 6]]) {
      const w = fight({ seed, player: { x: 0, z: 100, h: 0 }, colliders, script }, hp);
      const landAt = (x, z, rr) => colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + rr);
      for (let i = 0; i < 120 * 200; i++) {
        w.step();
        if (i % 6) continue;
        const S = w.k.state;
        for (const t of S.tentacles) {
          checked++;
          if (t.state !== 'grab' && (landAt(t.x, t.z, 0.5) || Math.hypot(t.x, t.z) > lim + 1e-6)) bad++;
        }
        for (const b of S.inks) if (landAt(b.x, b.z, 0.5) || Math.hypot(b.x, b.z) > lim + 1e-6) bad++;
        if (S.head && (landAt(S.head.x, S.head.z, 0.5) || Math.hypot(S.head.x, S.head.z) > lim + 1e-6)) bad++;
        if (landAt(S.shadow.x, S.shadow.z, 0) || Math.hypot(S.shadow.x, S.shadow.z) > lim + 1e-6) shadowBad++;
      }
    }
    check(checked > 1000 && bad === 0, `attack spots, ink blobs and the head: never on land or beyond worldRadius − 20 (${checked} tentacle samples, ${bad} bad)`);
    check(shadowBad === 0, 'the shadow steers round land and keeps inside worldRadius − 20');
  }

  // ================================================================ targets and hits
  {
    const w = fight({ player: { x: 0, z: 0, h: 0 } }, P3);
    let warnSeen = false;
    let ok = true;
    let sinkSeen = false;
    for (let i = 0; i < 120 * 30; i++) {
      w.step(DT, { speed: 0 });
      const S = w.k.state;
      const ids = new Set(w.k.targets().map((t) => t.id));
      for (const t of S.tentacles) {
        const raised = (t.state === 'slam' || t.state === 'sway' || t.state === 'grab') && t.hp > 0;
        if (t.state === 'warn') warnSeen = true;
        if (t.state === 'sink') sinkSeen = true;
        if (raised !== ids.has(t.id)) ok = false;
      }
      if (ids.has('head') !== !!(S.head && S.head.up) || ids.has('eye') !== ids.has('head')) ok = false;
    }
    check(ok && warnSeen && sinkSeen, 'targets() lists only raised parts: slamming, swaying and grabbing tentacles, the head and eye when up (never warnings or sinking ones)');
    const T = w.k.targets();
    const eye = T.find((t) => t.id === 'eye');
    const head = T.find((t) => t.id === 'head');
    const ten = T.find((t) => t.kind === 'tentacle');
    check(T[0].id === 'eye' && head.r === 6 && near(head.y0, -3) && near(head.y1, 9) && eye.r === 2.5 && head.hp === w.k.hp && (!ten || (ten.r === 1.4 && ten.y0 === 0 && ten.y1 === 9 && ten.hp === 30)), 'target shapes: eye r 2.5 (listed first), head r 6 at y 3, tentacles r 1.4 from y 0 to 9 with their own 30 hp');
    const ey = (eye.y0 + eye.y1) / 2;
    check(w.k.hits('eye', eye.x, ey, eye.z) && !w.k.hits('head', eye.x, ey, eye.z), 'hits(): a ball at the eye hits the eye, not the head');
    const S = w.k.state;
    check(w.k.hits('head', S.head.x, 3, S.head.z) && !w.k.hits('head', S.head.x + 6.5, 3, S.head.z) && !w.k.hits('eye', S.head.x, 3, S.head.z), 'hits(): the head sphere r 6 at y 3');
    if (ten) {
      check(w.k.hits(ten.id, ten.x + 1.3, 4, ten.z) && !w.k.hits(ten.id, ten.x + 1.5, 4, ten.z) && w.k.hits(ten.id, ten.x, 10.3, ten.z) && !w.k.hits(ten.id, ten.x, 10.5, ten.z) && !w.k.hits(ten.id, NaN, 4, ten.z), 'hits(): the tentacle capsule r 1.4 from y 0 to 9');
    }
    check(w.k.hits('t9999', 0, 0, 0) === false && w.k.hit('t9999', { dmg: 10 }) === null && w.k.hit('nose', { dmg: 10 }) === null, 'hits() and hit() on a part that is not up: false / null');
    // damage: eye ×1.5 BULLSEYE!, head ×1, crit says CRIT!, no rake ever
    const hp0 = w.k.hp;
    const re = w.k.hit('eye', { dmg: 10 });
    const rh = w.k.hit('head', { dmg: 10 });
    const rc = w.k.hit('head', { dmg: 10, crit: true });
    const rr = w.k.hit('head', { dmg: 10, aspect: 'stern', aspectMul: 2, rake: true, tags: ['rake'] });
    check(re.dmg === 15 && re.word === 'BULLSEYE!' && rh.dmg === 10 && rh.word === null && rc.word === 'CRIT!' && rr.dmg === 10 && rr.word === null && near(hp0 - w.k.hp, 45), 'hit(): the eye ×1.5 (BULLSEYE!), the head ×1, a crit says CRIT!, a rake counts nothing extra (never RAKE!)');
    const w2 = fight({ player: { x: 0, z: 0, h: 0 } }, P3);
    let tt = null;
    for (let i = 0; i < 120 * 10 && !tt; i++) {
      w2.step(DT, { speed: 0 });
      const g = w2.k.state.grab;
      tt = w2.k.targets().find((t) => t.kind === 'tentacle' && !(g && g.id === t.id));
    }
    const r1 = w2.k.hit(tt.id, { dmg: 20 });
    const r2 = w2.k.hit(tt.id, { dmg: 12 });
    const after = w2.k.state.tentacles.find((t) => t.id === tt.id);
    check(r1.dmg === 20 && r1.word === null && r2.word === 'OUCH!' && after.state === 'recoil' && !w2.k.targets().some((t) => t.id === tt.id), 'a tentacle has 30 hp of its own: at 0 it recoils (OUCH!) and is no longer a target');
    w2.run(0.7, { speed: 0 });
    check(!w2.k.state.tentacles.some((t) => t.id === tt.id), 'a recoiling tentacle sinks early and is gone');
  }

  // ================================================================ special ammo on the Kraken
  {
    const w = fight({ player: { x: 0, z: 0, h: 0 } }, P3);
    w.run(2, { speed: 0 });
    check(w.k.special('head', 'frost') === 'FROZEN!' && near(w.k.state.status.t, 2.5, 1e-9), 'frost: FROZEN!, 2.5 s (STATUS.frost.time × bossMul)');
    check(w.k.special('head', 'frost') === 'FROZEN!' && near(w.k.state.status.t, 3.5, 1e-9), 'frost again: +1 s (add × bossMul)');
    w.k.special('head', 'frost');
    w.k.special('head', 'frost');
    check(near(w.k.state.status.t, 4, 1e-9) && w.k.special('head', 'frost') === null, 'frost caps at 4 s (max × bossMul)');
    w.run(4.05, { speed: 0 });
    check(w.k.state.status.id === null, 'frost runs out');
    const hp0 = w.k.hp;
    check(w.k.special('head', 'fire') === 'ON FIRE!' && w.k.visuals().burn && w.k.visuals().burn.part === 'head', 'fire: ON FIRE!, the part hit burns');
    w.run(3.5, { speed: 0 });
    check(near(hp0 - w.k.hp, 9, 1e-6) && w.k.state.status.id === null, `fire: 3 hp/s to the bar for 3 s (${f2(hp0 - w.k.hp)})`);
    w.k.special('head', 'fire');
    check(w.k.special('head', 'frost') === 'FIRE OUT! SSSS!' && w.k.state.status.id === 'frost', 'frost on a burning Kraken: FIRE OUT! SSSS! and it is frozen');
  }
  {
    // stink: ACHOO!, every raised tentacle snaps under, warnings called off, no new attack for 2 s, then
    // clothes-pegs for 20 s
    const w = fight({ player: { x: 0, z: 0, h: 0 } }, P3);
    let raised = 0;
    for (let i = 0; i < 120 * 20; i++) {
      w.step(DT, { speed: 0 });
      raised = w.k.state.tentacles.filter((t) => t.state === 'sway').length;
      if (raised >= 2 && w.k.state.sinceAttack >= 5) break;
    }
    const attacks0 = w.k.state.attacks;
    const word = w.k.special('head', 'stink');
    const S = w.k.state;
    check(word === 'ACHOO!' && raised >= 2 && S.tentacles.length > 0 && S.tentacles.every((t) => t.state === 'sink' || t.state === 'recoil') && w.log.sfx.some((s) => s.name === 'sneeze'), `stink: ACHOO!, every raised tentacle snaps under (${raised} were up)`);
    w.run(0.6, { speed: 0 });
    check(w.k.state.tentacles.length === 0 && w.k.targets().every((t) => t.kind !== 'tentacle'), 'the snapped tentacles are gone within 0.5 s and are not targets');
    w.run(1.35, { speed: 0 });
    check(w.k.state.attacks === attacks0 && w.k.state.status.id === 'stink', `no new attack starts while it sneezes (2 s; one was due ${f2(6 - S.sinceAttack)} s after the sneeze)`);
    w.run(0.2, { speed: 0 });
    check(w.k.state.attacks === attacks0 + 1, 'the attack it held back starts once the sneeze is over');
    const wc = fight({ player: { x: 0, z: 0, h: 0 } }, P3);
    for (let i = 0; i < 120 * 20 && !wc.k.state.tentacles.some((t) => t.state === 'warn'); i++) wc.step(DT, { speed: 0 });
    const had = wc.k.visuals().rings.length;
    wc.k.special('eye', 'stink');
    check(had > 0 && wc.k.visuals().rings.length === 0 && !wc.k.state.tentacles.some((t) => t.state === 'warn'), `a sneeze calls off the warnings (${had} rings)`);
    check(w.k.state.status.id === null && near(w.k.state.status.pegs, 20, 0.2), 'then clothes-pegs for 20 s (STATUS.stink.bossImmune)');
    check(w.k.special('head', 'stink') === 'Clothes-pegs!' && w.k.state.status.id === null, 'stink with the pegs on: Clothes-pegs!, nothing happens');
    w.run(20, { speed: 0 });
    check(w.k.special('head', 'stink') === 'ACHOO!', 'after 20 s stink works again');
    const hpK = w.k.hp;
    check(w.k.special('head', 'fire') === 'KA-BOOM!' && near(hpK - w.k.hp, 15, 1e-9) && w.k.state.status.id === 'fire', 'fire on a stinky Kraken: KA-BOOM! (+15), the stink ends and it burns');
    check(w.k.state.status.pegs === 20 && w.k.special('head', 'stink') === 'Clothes-pegs!', 'after the KA-BOOM its clothes-pegs are on (20 s)');
    // frost on a stinky Kraken: FROZEN!, the stink ends and its clothes-pegs start (§2.3)
    const wq = fight({ player: { x: 0, z: 0, h: 0 } }, P3);
    wq.k.special('head', 'stink');
    wq.run(0.5, { speed: 0 });
    const fw = wq.k.special('head', 'frost');
    const q = wq.k.state.status;
    check(fw === 'FROZEN!' && q.id === 'frost' && near(q.t, 2.5, 1e-9) && q.pegs === 20 && wq.k.special('head', 'stink') === 'Clothes-pegs!', 'frost on a stinky Kraken: FROZEN!, and the clothes-pegs start at once (no stink for 20 s)');
    wq.run(3, { speed: 0 });
    check(wq.k.state.status.id === null && wq.k.state.status.pegs > 16 && wq.k.special('head', 'stink') === 'Clothes-pegs!', 'the clothes-pegs keep wearing off after the frost has thawed');
    // the boss badge reads its status in specials.js's newStatus() shape
    const ws2 = fight({ player: { x: 0, z: 0, h: 0 } }, P3);
    const none = ws2.k.status;
    ws2.k.special('head', 'fire');
    const fireS = ws2.k.status;
    ws2.run(1, { speed: 0 });
    const later = ws2.k.status;
    check(same(none, { id: null, t: 0, max: 0, immune: 0 }) && fireS.id === 'fire' && fireS.t === 3 && fireS.max === 3 && later.id === 'fire' && near(later.t, 2, 0.01) && later.max === 3, 'status: { id, t, max, immune } for the boss bar badge (fire 3 s of 3, then 2 s of 3)');
    // frost slows the chase (measured above) and lengthens warnings (measured above)
  }

  // ================================================================ driven off, the Pearl
  {
    const w = fight({ player: { x: 0, z: 0, h: 0 } }, P3);
    w.run(8, { speed: 0 });
    const grabbedBefore = w.k.grabbed;
    w.k.setHp(5);
    const r = w.k.hit('head', { dmg: 10 });
    check(r && r.dmg === 10 && w.k.done && w.k.hp === 0 && w.k.bar.frac === 0 && w.k.targets().length === 0 && !w.k.grabbed, `done at 0: no targets, no grab (${grabbedBefore ? 'it was grabbing' : 'not grabbing'})`);
    check(w.k.hit('head', { dmg: 10 }) === null && w.k.special('head', 'fire') === null && same(w.k.playerMods(), { speedMul: 1, turnMul: 1, dps: 0, vx: 0, vz: 0 }) && w.log.announce.some((a) => /driven off/.test(a.text)) && w.log.sfx.some((s) => s.name === 'gurgle'), 'driven off: nothing more lands, it gurgles, #game-live says so');
    w.run(2.7, { speed: 0 });
    const V = w.k.visuals();
    check(V.head === null && V.pearl && V.tentacles.length === 0 && !w.k.over, 'it sinks; the Pearl bobs up where it went down');
    const pearl = V.pearl;
    w.p.x = pearl.x;
    w.p.z = pearl.z;
    w.run(0.8, { speed: 0 });
    check(w.k.over && w.log.pearl.length === 1 && w.log.pearl[0].gold === 1000 && w.log.pops.some((p) => p.text === "+1,000 THE KRAKEN'S PEARL") && w.k.visuals().pearl === null, "sail over it: +1,000 THE KRAKEN'S PEARL (ctx.pearl(1000) once), over");
    w.run(5, { speed: 0 });
    check(w.log.pearl.length === 1, 'the Pearl is paid once');
    // left alone, it drifts to you after 4 s
    const w2 = fight({ player: { x: 0, z: 0, h: 0 } }, P3);
    w2.run(1.5, { speed: 0 });
    w2.k.setHp(0);
    let t = 0;
    while (!w2.k.over && t < 30) {
      w2.step(DT, { speed: 0 });
      t += DT;
    }
    check(w2.k.over && t > 2.6 + 1.5 + 4 && t < 2.6 + 1.5 + 4 + 5, `left alone, the Pearl drifts to you after 4 s afloat (${f2(t)} s after it was driven off)`);
    // a ship sailing away at full speed: the Pearl's drift speeds up, so it always reaches her
    const w3 = fight({ player: { x: 0, z: -40, h: Math.PI }, riseX: 0, riseZ: 40 }, P3);
    w3.run(1.5, { speed: 0 });
    w3.k.setHp(0);
    let t3 = 0;
    while (!w3.k.over && t3 < 60) {
      w3.step(DT, { h: wrap(Math.atan2(-w3.p.x, -w3.p.z) + (Math.hypot(w3.p.x, w3.p.z) > 100 ? 1.2 : Math.PI)), speed: 12 });
      t3 += DT;
    }
    check(w3.k.over && t3 < 2.6 + 1.5 + 4 + 12 && w3.log.pearl.length === 1, `the Pearl catches a ship sailing away at 12 u/s (${f2(t3)} s), so the level always clears`);
  }

  // ================================================================ determinism, junk
  {
    const snap = (seed) => {
      const w = fight({ seed, player: { x: 0, z: 0, h: 0 }, script: wander(seed + 1000) }, 420);
      for (let i = 0; i < 120 * 120; i++) {
        w.step();
        if (i % 600 === 0) {
          const t = w.k.targets()[0];
          if (t) w.k.hit(t.id, { dmg: 9 });
        }
        if (i === 120 * 30) w.k.special('head', 'frost');
      }
      return JSON.stringify(w.k.state) + JSON.stringify(w.k.visuals()) + JSON.stringify(w.log.damage.map((d) => [d.amount, d.t]));
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
    const ctxs = [
      undefined,
      null,
      42,
      'ctx',
      {},
      hostile,
      { player: () => null },
      { player: () => ({ x: 'a', z: NaN }) },
      { player: () => ({ x: 0, z: 0 }), rng: () => NaN, land: () => { throw new Error('x'); }, damage: () => { throw new Error('y'); }, world: { r: -5 }, tables: hostile, warnBonus: () => 'big' },
      { player: () => ({ x: 0, z: 0, h: 0, speed: 0, len: 10, wid: 3.6 }), rng: () => 1, land: () => true, world: null, tables: { STATUS: { frost: { time: 'x' } }, RAIDERS: { cutTaps: -3, cutHold: NaN }, INK: { radius: 1e9 } }, pop: 5, sfx: {}, announce: null },
      {
        get player() {
          throw new Error('getter');
        },
      },
    ];
    const junk = [undefined, null, NaN, -1, 1e9, 'x', {}, [], hostile];
    for (const c of ctxs) {
      try {
        const k = createKraken(c);
        for (const j of junk) {
          k.rise(j, j, j);
          k.step(j);
        }
        k.rise(0, 30, { short: true });
        k.skip();
        for (let i = 0; i < 120 * 30; i++) {
          k.step(DT);
          if (i % 97 === 0) {
            k.setHp([590, 380, 150][i % 3]);
            for (const j of junk) {
              k.hits(j, j, j, j);
              k.hit(j, j);
              k.special(j, j);
              k.cutHold(j);
            }
            k.cut();
            for (const t of k.targets()) k.hit(t.id, { dmg: 1 });
            k.special('head', ['fire', 'frost', 'stink'][i % 3]);
            JSON.stringify(k.visuals());
            JSON.stringify(k.state);
            k.playerMods();
            void k.bar;
          }
        }
        k.setHp(0);
        k.step(5);
        k.dispose();
        k.step(1);
        k.targets();
        k.visuals();
        void k.state;
      } catch (e) {
        threw = e;
        break;
      }
    }
    check(threw === null, `a junk ctx and junk arguments never throw${threw ? ` (${threw.stack})` : ''}`);
  }

  // ================================================================ EXIT — the 1C exit check (SPEC3 §12)
  {
    const live = runs.filter((w) => w.name);
    // every warning ≥ 1.5 s, in every run (tentacle rings and ink blobs)
    let minWarn = Infinity;
    let rings = 0;
    for (const w of live) {
      for (const r of w.rings) {
        minWarn = Math.min(minWarn, r.T);
        rings++;
      }
    }
    // the ink blobs' warnings (phase 2, with and without the Lighthouse's bonus)
    for (const bonus of [0, 1]) {
      const wi = fight({ player: { x: 0, z: 0, h: 0 }, warnBonus: bonus }, P2);
      for (let i = 0; i < 120 * 40; i++) {
        wi.step(DT, { speed: 0 });
        for (const b of wi.k.state.inks) {
          minWarn = Math.min(minWarn, b.T);
          rings++;
        }
      }
    }
    check(rings > 500 && minWarn >= 1.5 - 1e-9, `EXIT: every warning ≥ 1.5 s (tentacle rings in ${live.length} runs and ink blobs; shortest ${f2(minWarn)} s)`);
    // a scripted fleeing player still gets an attack within 12 s + its warning: from the fight's start, and from
    // each attack's start, the next attack's first tentacle lands within 12 s + that attack's warning
    let worst = -Infinity;
    let fleeRuns = 0;
    let fleeAttacks = 0;
    let fleeCutOffs = 0;
    for (const hp of [P1, P2, P3]) {
      for (const seed of [1, 2, 3]) {
        const bonus = seed === 3 ? 1 : 0;
        const w = fight({ seed: 600 + seed, player: { x: 0, z: -30, h: Math.PI }, script: fleeFrom(), warnBonus: bonus }, hp);
        w.run(300);
        fleeRuns++;
        fleeCutOffs += w.k.state.counts.cutOffs;
        let from = 0;
        for (const a of w.attackStarts) {
          const L = w.landings.find((x) => x.attack === a.attack && x.i === 0);
          const ring = w.rings.find((r) => r.attack === a.attack && r.i === 0);
          if (!L || !ring) {
            if (a.at < w.time - 3) worst = Infinity; // (only the last attack may still be warning when the run ends)
            continue;
          }
          fleeAttacks++;
          worst = Math.max(worst, L.at - from - (12 + ring.T));
          from = a.at;
        }
        worst = Math.max(worst, w.time - from - (12 + 1.8 + bonus)); // (and nothing left hanging at the end)
      }
    }
    check(fleeAttacks > 100 && worst <= DT + 1e-9, `EXIT: a scripted fleeing player still gets an attack within 12 s + warning (${fleeRuns} runs × 300 s in phases 1–3, ${fleeAttacks} attacks, ${fleeCutOffs} cut-offs; worst margin ${f2(worst)} s)`);
    const maxUp = Math.max(...live.map((w) => w.maxUp));
    check(maxUp <= 4, `EXIT: never more than 4 tentacles up (${live.length} runs, max ${maxUp})`);
    let soonest = Infinity;
    let rel = 0;
    for (const w of live.filter((x) => /standing/.test(x.name))) {
      rel += w.releases.length;
      for (const g of w.grabs) if (Number.isFinite(g.sinceRelease)) soonest = Math.min(soonest, g.sinceRelease);
    }
    check(rel >= 10 && soonest >= 8 - 1e-6, `EXIT: a standing player is never grabbed within 8 s of a release (${rel} releases; soonest regrab ${f2(soonest)} s)`);
  }

  console.log(failures ? `\n${failures} check(s) failed` : `\nAll kraken checks passed (${passes})`);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
