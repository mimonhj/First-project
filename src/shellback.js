// The finale of Voyage IV (SPEC4 §3.6): the Shellback, the crab-shaped island in Shellback Shoals that wakes up once
// level 12's last wave falls. Three phases (the Fort, the Waking, the Charge), a soft body that pushes and never
// blocks, at most two attacks telegraphed at once (ctx.warn.boss); driven off, it scuttles off to sleep and the
// Golden Conch bobs up. Not a ship: a part in main's pseudo-target registry (§3.7), as the Kraken is.
//
// Pure: imports nothing (the Node tests load it as a data: URL); the shape of kraken.js. Simulated time only
// (step(dt)); every roll comes from ctx.rng. The status times (STATUS, specials.js), the towers' sight line (FORT,
// foes4.js: track, lock, traverse, hw) and the words (WORDS4, mechanics4.js) come from ctx.tables, never copied here
// (a missing table reads today's numbers). A junk ctx never throws: a missing or throwing callback is skipped.
//
// createShellback(ctx) → {
//   wake(x, z, { short }) → boolean   the wake (§3.6.1 step 3) of the island at (x, z) (default ctx.lair): 6 s, or 3 s
//                                     with short (the checkpoint's retry); main runs the 4 s dread (SHELLBACK.dread)
//                                     before it. Then the fight, at full hp.
//   skip() → boolean                  ends the wake at once (any key or tap; an addition, as the Kraken's)
//   step(dt)                          the simulation, simulated seconds (main's 1/120 s substeps; at most 1 s a call)
//   targets() → [{ id, kind, x, z, r, y0, y1, hp, maxHp, name, hidden }]   kind: the part's ('tower' | 'eye' | 'claw'
//                                     | 'shell'; main's wrapper takes kind 'shellback', partKind = kind). Phase 1: the
//                                     standing towers (hp: the tower's); from phase 2: the eyes, the claws that are up
//                                     (hp: the claw's) and the shell (hp: the bar). Eyes first (they sit inside the
//                                     shell's volume), then claws, towers, the shell.
//   hits(id, x, y, z) → boolean       is that point inside that part (a ball in flight)
//   hit(id, info) → { dmg, word } | null   a ball on a part: dmg = info.dmg (main's beam-on shotResult) × the part's
//                                     mul: a tower ×1 ("TOWER DOWN!" when it falls), the eyes ×1.5 ("BULLSEYE!"), ×2
//                                     while dizzy ("BONK!"), a claw ×1 ("OUCH!" when it droops), the shell ×0.5
//                                     ("CLANG!"); CRIT! (info.crit) when nothing else. A tower or a claw takes at most
//                                     its own hp; every hit comes off the bar.
//   special(id, ammo) → word | null   a special ball's status, once per volley (main's rule), STATUS's boss values
//                                     through ctx.tables.STATUS: fire (the part hit burns, to the bar: a tower or a claw
//                                     burns itself too), frost (walks ×0.5, every warning +0.5 s), stink (ACHOO!: no
//                                     attack starts for its time, then clothes-pegs); KA-BOOM on a stinky one, FIRE OUT
//   boardWhy() → 'monster'
//   push(ship) → { vx, vz } | null    a ship (yours, by kind 'player' or by sitting where ctx.player() says you are, or a
//                                     pirate's, by id) overlapping the body (r 8 awake; the sleeping lair r 12, from
//                                     creation on) is pushed out along the line from its centre at SHELLBACK.push u/s,
//                                     and the part of its own speed that points in is taken away (turned up to 90°
//                                     toward open water near land or the world's edge); a sweep's or a charge's shove
//                                     rides on it too. A velocity main adds to that ship's motion (× dt), after
//                                     separateShips. Never damage ("BUMP!" at most once per bumpGap s).
//   playerMods() → { speedMul, turnMul }   (always 1, 1: the Shellback slows nobody; kept for the §11.1 shape)
//   setHp(n) → hp                     tests (G.v4.shellback.setHp / phase): sets the bar, changing phase as hits do
//   get bar /* { name, frac, notches } | null */, get phase (0 before the fight), get hp,
//   get status → { id, t, max, immune }   for #boss-status (specials.js newStatus()'s shape; an addition)
//   get rising (the wake), get done (driven off: hp 0), get over (the Conch taken, an addition: main's clear check
//                                     may wait for it, as for the Kraken's Pearl)
//   visuals() → shellbackView's input (fresh plain objects):
//     { body: { x, z, h, r, k, state, t, gait, hurt, sneeze, frozen, burning, dizzy, fort } | null
//              (k: awake 0..1; state 'sleep' | 'wake' | 'fort' | 'stand' | 'walk' | 'sweep' | 'crouch' | 'charge' |
//              'dizzy' | 'throw' | 'home' | 'asleep'; gait: u walked, for the legs; fort: true while the fort rides on
//              its back),
//       eyes: [{ id, x, y, z, open, look: { x, z }, dizzy }], claws: [{ id, x, z, h, hp, maxHp, down, t, sweep }],
//       towers: [{ id, x, z, y0, y1, hp, maxHp, down, t, aim }],
//       rings: [{ id, kind: 'boulder', x, z, r, t, T, from: { x, z } }],
//       sectors: [{ id, kind: 'sweep', x, z, h, r, half, t, T, claw }],
//       lanes: [{ id, kind: 'charge', x0, z0, x1, z1, w, t, T, state: 'warn' | 'run', run }],
//       lines: [{ id, kind: 'tower', tower, x0, y0, z0, x1, z1, state: 'track' | 'lock' | 'fire', t, T }],
//       wake: { k, T } | null, splash: { x, z, t } | null (the fort thrown off), conch: { x, z, k, h } | null,
//       burn: { part } | null }
//   get state (a plain snapshot for tests and G.v4.shellback.state), dispose() (gives back every warning slot)
// }
// ctx: { player() → { x, z, h, speed, len, wid } | null, damage(amount, x, z, source) (to you: 'tower' | 'sweep' |
//   'boulder' | 'charge'), land(x, z, r) → boolean, world: { x, z, r }, rng(), warnBonus(), pop(text, x, y, z, style),
//   announce(text), sfx(name, x, z, opts?), arena: { x, z, r } (where the body may walk), lair: { x, z, r },
//   warn: { take(kind), give(kind), boss } (each telegraph holds one slot; boss: at most that many attacks telegraphed
//   at once, WARN.boss; a missing or unlimited cap reads 2), ships() → [{ id, x, z, h, len, wid }] (for the standoff,
//   pushes and shoves), hold() → boolean (no attack starts and the attack timers wait), conch(gold)? (an addition:
//   called once when the Conch is taken; main adds it to state.gold), tables: { STATUS, FORT, WORDS4?, WORDS3? } }
// A warning is never shorter than SHELLBACK.minWarn (1.5 s) plus ctx.warnBonus().

/**
 * §3.6.2–§3.6.4 (Stage 1C's starting values; Stage 3 tunes them with bot v4, §2.8).
 */
export const SHELLBACK = {
  name: 'THE SHELLBACK',
  hp: 3000,
  notches: [2000, 1000], // phase 2 from 2,000, phase 3 from 1,000
  conch: 1200, // gold, paid when the Golden Conch is taken
  dread: 4, // s of dread before the wake (main's)
  wake: 6, // s: the wake, skippable
  shortWake: 3, // s: the wake again after "Try again from the Shellback"
  minWarn: 1.5, // s: no warning is ever shorter (kid rule)
  firstAttack: 2, // s after the wake before the first attack may start
  body: { r: 8, lair: 12, y: 6 }, // r: the awake body; lair: the sleeping island's keep-off ring; y: the shell's top
  push: 8, // u/s: a ship overlapping the body is pushed out this fast (≥ the fastest walk + 2)
  standoff: 1, // u: the body never steps nearer a hull than r + its half-length + this
  bumpGap: 3, // s between "BUMP!"s
  shoveTime: 0.25, // s a shove (a sweep's, a charge's) takes
  landClear: 12, // u: the body's centre keeps this far from land
  edge: 10, // u: pushes keep ships inside worldRadius − edge
  turn: 1.4, // rad/s the body turns to face you
  towers: { n: 3, hp: 340, r: 1.6, ring: 3.4, back: 1.5, y0: 4.5, y1: 11, gunY: 10, mul: 1, every: 3, range: 50, damage: 10 },
  eyes: { r: 1.1, ahead: 5.4, side: 1.8, y: 7.2, mul: 1.5, dizzy: 2 },
  claws: { n: 2, hp: 300, r: 2.4, ahead: 8.4, side: 4.6, y0: 0, y1: 3.4, mul: 1, droop: 8 },
  shell: { y0: 0, y1: 6, mul: 0.5 },
  phases: [
    { from: 3000, walk: 0 }, // the Fort
    { from: 2000, walk: 4.5, stand: 1.5 }, // the Waking (it stands up first)
    { from: 1000, walk: 6, throw: 1.5 }, // the Charge (it throws the fort off first)
  ],
  // reach: you within this of its claws (from: u ahead of its centre, where they join, the sector's point)
  sweep: { reach: 16, r: 14, angle: 100, from: 4, warn: 1.8, damage: 12, shove: 4, gap: 3 },
  boulder: { first: 4, every: 9, r: 5, aim: 4, warn: 2.0, damage: 12, lob: 14 },
  charge: { first: 4, every: 10, w: 7, len: 45, min: 12, warn: 2.0, speed: 14, damage: 14, shove: 4, dizzy: 4 },
  chargeGap: 6, // s: no charge within this of a sweep (and no sweep within it of a charge)
  cutOff: 12, // s with no attack started: a boulder at your predicted spot, wherever you are
  specials: { walk: 0.5, warn: 0.5 }, // its frost: walks ×0.5, every warning +0.5 s
  announceGap: 3, // s between warnings in #game-live
  gone: { walk: 3, max: 12, conchRise: 1.5, drift: 4, driftSpeed: 6, driftAccel: 4, reach: 3 },
  sfx: { wake: 'bell', tower: 'clack', fire: 'cannon', down: 'crunch', snip: 'snip', boulder: 'boulder', charge: 'crabCharge', splash: 'splash', sneeze: 'sneeze', yawn: 'yawn', conch: 'coin', bonk: 'bonk', clang: 'clang', bump: 'thud' },
  words: {
    towerDown: 'TOWER DOWN!',
    bullseye: 'BULLSEYE!',
    bonk: 'BONK!',
    ouch: 'OUCH!',
    clang: 'CLANG!',
    crit: 'CRIT!',
    aim: 'AIM!',
    snip: 'SNIP!',
    boulder: 'BOULDER!',
    charge: 'CHARGE!',
    achoo: 'ACHOO!',
    bump: 'BUMP!',
    dizzy: 'DIZZY!',
    pegs: 'Clothes-pegs!',
    fire: 'ON FIRE!',
    frost: 'FROZEN!',
    kaboom: 'KA-BOOM!',
    fireOut: 'FIRE OUT! SSSS!',
    conch: (gold) => `+${fmt(gold)} THE GOLDEN CONCH`,
    phases: ['The Fort', 'The Waking', 'The Charge'],
    noBoard: "You can't board a sea monster!",
    live: {
      wakes: 'The Shellback wakes! Knock down its towers!',
      tower: 'A tower is aiming at you! Change course.',
      sweep: 'Snip! Steer away from its claw.',
      boulder: 'A boulder! Steer out of the orange ring.',
      charge: 'Charge! Steer out of its lane.',
      waking: 'The Shellback stands up!',
      charging: 'The Shellback throws off its fort!',
      shellHome: 'The Shellback scuttles home!', // (WORDS4.live's key: its `home` is Old Coilback's)
      conch: (gold) => `The Golden Conch! ${fmt(gold)} gold.`,
    },
  },
};

// Today's numbers of the tables main passes in ctx.tables, used only when a table (or a number) is missing.
const STATUS0 = { fire: { dps: 3, boss: 3 }, frost: { time: 5, add: 2, max: 8, bossMul: 0.5 }, stink: { boss: 2, bossImmune: 20 }, kaboom: { burst: 15 } };
const FORT0 = { track: 1.3, lock: 0.5, traverse: 0.2, hw: 0.6 };
const BOSS0 = 2; // WARN.boss, when ctx.warn has no (finite) cap

const EPS = 1e-9;
const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
const NO_MODS = Object.freeze({ speedMul: 1, turnMul: 1 });

function fmt(n) {
  const v = Math.round(Number(n) || 0);
  return String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (x) => {
  const k = clamp(x, 0, 1);
  return k * k * (3 - 2 * k);
};
const wrap = (a) => {
  let v = (a + Math.PI) % TAU;
  if (v < 0) v += TAU;
  return v - Math.PI;
};
const bearing = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz);
function turnToward(h, target, max) {
  const d = wrap(target - h);
  return wrap(h + clamp(d, -max, max));
}
const round6 = (v) => (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
// read a property without letting a throwing getter or a proxy escape
function prop(o, k) {
  if (!o || (typeof o !== 'object' && typeof o !== 'function')) return undefined;
  try {
    return o[k];
  } catch {
    return undefined;
  }
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hullDist(s, x, z) {
  const fx = Math.sin(s.h);
  const fz = Math.cos(s.h);
  const half = s.len / 2;
  const along = clamp((x - s.x) * fx + (z - s.z) * fz, -half, half);
  return Math.hypot(x - (s.x + fx * along), z - (s.z + fz * along));
}
function hullEnds(s) {
  const fx = Math.sin(s.h) * (s.len / 2);
  const fz = Math.cos(s.h) * (s.len / 2);
  return [s.x + fx, s.z + fz, s.x - fx, s.z - fz];
}
function segPt(px, pz, x0, z0, x1, z1) {
  const ux = x1 - x0;
  const uz = z1 - z0;
  const L2 = ux * ux + uz * uz;
  const u = L2 > 1e-12 ? clamp(((px - x0) * ux + (pz - z0) * uz) / L2, 0, 1) : 0;
  return Math.hypot(px - (x0 + ux * u), pz - (z0 + uz * u));
}
function segDist(ax, az, bx, bz, cx, cz, dx, dz) {
  const cross = (x0, z0, x1, z1, x2, z2) => (x1 - x0) * (z2 - z0) - (z1 - z0) * (x2 - x0);
  const d1 = cross(ax, az, bx, bz, cx, cz);
  const d2 = cross(ax, az, bx, bz, dx, dz);
  const d3 = cross(cx, cz, dx, dz, ax, az);
  const d4 = cross(cx, cz, dx, dz, bx, bz);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(segPt(ax, az, cx, cz, dx, dz), segPt(bx, bz, cx, cz, dx, dz), segPt(cx, cz, ax, az, bx, bz), segPt(dx, dz, ax, az, bx, bz));
}

export function createShellback(ctx) {
  const fallbackRng = mulberry32(0x73686c6c);

  // ---------------------------------------------------------------- ctx, read safely
  function call(name, ...args) {
    const fn = prop(ctx, name);
    if (typeof fn !== 'function') return undefined;
    try {
      return fn.apply(ctx, args);
    } catch {
      return undefined;
    }
  }
  function rand() {
    const v = call('rng');
    return typeof v === 'number' && v >= 0 && v < 1 ? v : fallbackRng();
  }
  function table(name, path, def) {
    let o = prop(prop(ctx, 'tables'), name);
    for (const k of path) o = prop(o, k);
    return num(o, def);
  }
  const status = {
    fireDps: () => Math.max(0, table('STATUS', ['fire', 'dps'], STATUS0.fire.dps)),
    fireTime: () => Math.max(0, table('STATUS', ['fire', 'boss'], STATUS0.fire.boss)),
    frostTime: () => Math.max(0, table('STATUS', ['frost', 'time'], STATUS0.frost.time) * frostMul()),
    frostAdd: () => Math.max(0, table('STATUS', ['frost', 'add'], STATUS0.frost.add) * frostMul()),
    frostMax: () => Math.max(0, table('STATUS', ['frost', 'max'], STATUS0.frost.max) * frostMul()),
    stinkTime: () => Math.max(0, table('STATUS', ['stink', 'boss'], STATUS0.stink.boss)),
    pegs: () => Math.max(0, table('STATUS', ['stink', 'bossImmune'], STATUS0.stink.bossImmune)),
    burst: () => Math.max(0, table('STATUS', ['kaboom', 'burst'], STATUS0.kaboom.burst)),
  };
  function frostMul() {
    return Math.max(0, table('STATUS', ['frost', 'bossMul'], STATUS0.frost.bossMul));
  }
  const fort = {
    track: () => Math.max(0.5, table('FORT', ['track'], FORT0.track)),
    lock: () => Math.max(0.2, table('FORT', ['lock'], FORT0.lock)),
    traverse: () => Math.max(0, table('FORT', ['traverse'], FORT0.traverse)),
    hw: () => clamp(table('FORT', ['hw'], FORT0.hw), 0, 5),
  };
  // A word: WORDS4.pop (or WORDS3 for the status words), else this module's own; functions are templates.
  function word(key, ...args) {
    const tables = prop(ctx, 'tables');
    let w = prop(prop(prop(tables, 'WORDS4'), 'pop'), key);
    if (typeof w === 'function') {
      try {
        w = w(...args);
      } catch {
        w = undefined;
      }
    }
    if (!(typeof w === 'string' && w) && ['fire', 'frost', 'pegs', 'kaboom', 'fireOut'].includes(key)) w = prop(prop(tables, 'WORDS3'), key);
    if (typeof w === 'string' && w) return w;
    const d = SHELLBACK.words[key];
    return typeof d === 'function' ? d(...args) : d;
  }
  function liveWord(key, ...args) {
    let w = prop(prop(prop(prop(ctx, 'tables'), 'WORDS4'), 'live'), key);
    if (typeof w === 'function') {
      try {
        w = w(...args);
      } catch {
        w = undefined;
      }
    }
    if (typeof w === 'string' && w) return w;
    const d = SHELLBACK.words.live[key];
    return typeof d === 'function' ? d(...args) : d;
  }
  function world() {
    const w = prop(ctx, 'world');
    const r = num(prop(w, 'r'), 150);
    return { x: num(prop(w, 'x'), 0), z: num(prop(w, 'z'), 0), r: r > 0 ? r : 150 };
  }
  function circleOf(name, def) {
    const c = prop(ctx, name);
    const r = num(prop(c, 'r'), NaN);
    const x = num(prop(c, 'x'), NaN);
    const z = num(prop(c, 'z'), NaN);
    if (!Number.isFinite(x) || !Number.isFinite(z) || !(r > 0)) return def;
    return { x, z, r };
  }
  function arena() {
    const w = world();
    return circleOf('arena', { x: w.x, z: w.z, r: Math.max(20, w.r - 30) });
  }
  function lairCircle() {
    const a = arena();
    const l = circleOf('lair', { x: a.x, z: a.z, r: SHELLBACK.body.lair });
    return { x: l.x, z: l.z, r: SHELLBACK.body.lair };
  }
  function readHull(p, key) {
    if (!p || typeof p !== 'object') return null;
    const x = num(prop(p, 'x'), NaN);
    const z = num(prop(p, 'z'), NaN);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    let len = num(prop(p, 'len'), NaN);
    let wid = num(prop(p, 'wid'), NaN);
    if (!Number.isFinite(len) || !Number.isFinite(wid)) {
      const t = prop(p, 'type');
      if (!Number.isFinite(len)) len = num(prop(t, 'len'), 10);
      if (!Number.isFinite(wid)) wid = num(prop(t, 'wid'), 3.6);
    }
    return { key, x, z, h: num(prop(p, 'h'), 0), speed: clamp(num(prop(p, 'speed'), 0), -40, 40), len: clamp(len, 0, 40), wid: clamp(wid, 0, 20) };
  }
  function readPlayer() {
    return readHull(call('player'), 'player');
  }
  function readShips() {
    const list = call('ships');
    const out = [];
    if (!Array.isArray(list)) return out;
    const n = Math.min(list.length, 64);
    for (let i = 0; i < n; i++) {
      const s = list[i];
      const id = prop(s, 'id');
      if (id === undefined || id === null || id === 'player' || prop(s, 'kind') === 'player') continue;
      const h = readHull(s, id);
      if (h) out.push(h);
    }
    return out;
  }
  const isLand = (x, z, r) => call('land', x, z, r) === true;
  function inWorld(x, z, edge) {
    const w = world();
    return Math.hypot(x - w.x, z - w.z) <= Math.max(0, w.r - edge) + EPS;
  }
  function intoWorld(x, z, edge) {
    const w = world();
    const lim = Math.max(0, w.r - edge);
    const d = Math.hypot(x - w.x, z - w.z);
    if (d <= lim) return { x, z };
    const k = (lim - 0.01) / d;
    return { x: w.x + (x - w.x) * k, z: w.z + (z - w.z) * k };
  }
  const openAt = (x, z, clear) => inWorld(x, z, SHELLBACK.edge) && !isLand(x, z, clear);
  function nearest(x, z, ok, max = 90) {
    const s = intoWorld(x, z, SHELLBACK.edge);
    if (ok(s.x, s.z)) return s;
    for (let d = 1.5; d <= max; d += 1.5) {
      const n = Math.max(8, Math.ceil((TAU * d) / 2));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const px = s.x + Math.sin(a) * d;
        const pz = s.z + Math.cos(a) * d;
        if (ok(px, pz)) return { x: px, z: pz };
      }
    }
    return null;
  }
  const openSpot = (x, z, clear) => nearest(x, z, (px, pz) => openAt(px, pz, clear)) || intoWorld(x, z, SHELLBACK.edge);
  // Where the body's centre may stand: inside the arena (its whole circle) and landClear from land.
  function bodyOk(x, z) {
    const a = arena();
    return Math.hypot(x - a.x, z - a.z) <= Math.max(0, a.r - SHELLBACK.body.r) + EPS && !isLand(x, z, SHELLBACK.landClear) && inWorld(x, z, SHELLBACK.body.r + SHELLBACK.edge);
  }
  function predict(p, T) {
    return { x: p.x + Math.sin(p.h) * p.speed * T, z: p.z + Math.cos(p.h) * p.speed * T };
  }
  function pop(text, x, y, z, style = 'shell') {
    if (text) call('pop', text, x, y, z, style);
  }
  const sfx = (key, x, z, o) => (o ? call('sfx', SHELLBACK.sfx[key], x, z, o) : call('sfx', SHELLBACK.sfx[key], x, z));
  let lastLive = -Infinity;
  function warnLive(key) {
    if (clock - lastLive < SHELLBACK.announceGap - EPS) return;
    lastLive = clock;
    const t = liveWord(key);
    if (t) call('announce', t);
  }
  function announce(key, ...args) {
    const t = liveWord(key, ...args);
    if (t) call('announce', t);
  }

  // ---------------------------------------------------------------- warning slots (ctx.warn) and the boss cap
  const slotsHeld = [];
  function bossCap() {
    const b = num(prop(prop(ctx, 'warn'), 'boss'), NaN);
    return Number.isFinite(b) && b >= 1 ? Math.floor(b) : BOSS0;
  }
  function takeSlot(kind) {
    const w = prop(ctx, 'warn');
    const fn = prop(w, 'take');
    let ok = true;
    if (typeof fn === 'function') {
      try {
        ok = fn.call(w, kind) !== false;
      } catch {
        ok = true;
      }
    }
    if (ok) slotsHeld.push(kind);
    return ok;
  }
  function giveSlot(kind) {
    const i = slotsHeld.indexOf(kind);
    if (i < 0) return;
    slotsHeld.splice(i, 1);
    const w = prop(ctx, 'warn');
    const fn = prop(w, 'give');
    if (typeof fn === 'function') {
      try {
        fn.call(w, kind);
      } catch {
        // (a junk ctx)
      }
    }
  }

  // ---------------------------------------------------------------- state
  let disposed = false;
  let mode = 'idle'; // 'idle' | 'wake' | 'fight' | 'gone'
  let clock = 0;
  let hp = SHELLBACK.hp;
  let phase = 0;
  let short = false;
  let wakeT = 0;
  let wakeDur = SHELLBACK.wake;
  let holdNow = false;
  const body = { x: 0, z: 0, h: 0, state: 'sleep', t: 0, T: 0, gait: 0, hurt: 0, sneeze: 0, fort: true, placed: false };
  let towers = [];
  let claws = [];
  let attacks = []; // telegraphs: { id, kind, t, T, ... }
  let run = null; // the charge's run: { x0, z0, x1, z1, len, k, t }
  let ids = 0;
  let turn = 0; // the next tower to sight you
  const clocks = { tower: 0, boulder: 0, charge: 0, sweep: 0 };
  let sinceAttack = 0;
  let lastSweep = -Infinity; // when the last sweep started
  let lastCharge = -Infinity; // when the last charge started
  let st = { id: null, t: 0, max: 0, pegs: 0 };
  let burnPart = null;
  const shoves = new Map(); // ship key → { vx, vz, until }
  let lastBump = -Infinity;
  let splash = null;
  let goneT = 0;
  let home = null; // where it walks to sleep
  let conch = null; // { x, z, t, got, v }
  let over = false;
  const counts = { towers: 0, sweeps: 0, boulders: 0, charges: 0, cutOffs: 0, hits: { tower: 0, sweep: 0, boulder: 0, charge: 0 }, bumps: 0, sneezes: 0, waited: 0, capped: 0 };
  const dmgBy = { tower: 0, eye: 0, claw: 0, shell: 0, burn: 0, burst: 0 };
  const nextId = (p) => `${p}${++ids}`;

  const fighting = () => !disposed && mode === 'fight';
  const phaseOf = (v) => (v > SHELLBACK.notches[0] ? 1 : v > SHELLBACK.notches[1] ? 2 : 3);
  const frozen = () => st.id === 'frost' && st.t > EPS;
  const sneezing = () => st.id === 'stink' && st.t > EPS;
  const telegraphs = () => attacks.length;
  function warnTime(base) {
    const bonus = Math.max(0, num(call('warnBonus'), 0));
    return Math.max(SHELLBACK.minWarn, num(base, SHELLBACK.minWarn) + bonus + (frozen() ? SHELLBACK.specials.warn : 0));
  }
  const fwd = () => ({ x: Math.sin(body.h), z: Math.cos(body.h) });
  const right = () => ({ x: Math.cos(body.h), z: -Math.sin(body.h) });
  function bodyR() {
    if (mode === 'idle' || mode === 'wake' || (mode === 'fight' && phase <= 1)) return SHELLBACK.body.lair;
    return SHELLBACK.body.r;
  }
  function eyeAt(side) {
    const E = SHELLBACK.eyes;
    const f = fwd();
    const r = right();
    return { x: body.x + f.x * E.ahead + r.x * E.side * side, y: E.y, z: body.z + f.z * E.ahead + r.z * E.side * side };
  }
  function clawAt(c) {
    const C = SHELLBACK.claws;
    const f = fwd();
    const r = right();
    return { x: body.x + f.x * C.ahead + r.x * C.side * c.side, z: body.z + f.z * C.ahead + r.z * C.side * c.side };
  }
  function towerAt(t) {
    const T = SHELLBACK.towers;
    const a = body.h + Math.PI + (t.i - 1) * ((TAU / 3) * 0.8);
    return { x: body.x - Math.sin(body.h) * T.back + Math.sin(a) * T.ring, z: body.z - Math.cos(body.h) * T.back + Math.cos(a) * T.ring };
  }
  function all(p, ships) {
    return p ? [p, ...ships] : ships;
  }
  function shove(h, dx, dz, dist) {
    const d = Math.hypot(dx, dz);
    if (!(d > 1e-9) || !(dist > 0)) return;
    let ux = dx / d;
    let uz = dz / d;
    const r = h.wid / 2;
    const open = (sx, sz) => inWorld(h.x + sx * dist, h.z + sz * dist, SHELLBACK.edge) && !isLand(h.x + sx * dist, h.z + sz * dist, r);
    if (!open(ux, uz)) {
      let found = false;
      for (const a of [30, -30, 60, -60, 90, -90]) {
        const c = Math.cos(a * RAD);
        const s = Math.sin(a * RAD);
        const vx = ux * c + uz * s;
        const vz = -ux * s + uz * c;
        if (open(vx, vz)) {
          ux = vx;
          uz = vz;
          found = true;
          break;
        }
      }
      if (!found) return;
    }
    const T = SHELLBACK.shoveTime;
    shoves.set(h.key, { vx: (ux * dist) / T, vz: (uz * dist) / T, until: clock + T });
  }

  // ---------------------------------------------------------------- the wake and the phases
  function placeBody(x, z) {
    body.x = x;
    body.z = z;
    body.placed = true;
  }
  function startFight() {
    mode = 'fight';
    sinceAttack = 0;
    attacks = [];
    run = null;
    const p = readPlayer();
    if (p) body.h = bearing(body.x, body.z, p.x, p.z);
    towers = Array.from({ length: SHELLBACK.towers.n }, (_, i) => ({ id: `tower${i + 1}`, i, hp: SHELLBACK.towers.hp, down: false, t: 0 }));
    claws = [-1, 1].map((side) => ({ id: side < 0 ? 'clawL' : 'clawR', side, hp: SHELLBACK.claws.hp, down: false, t: 0, sweep: 0 }));
    turn = 0;
    clocks.tower = SHELLBACK.firstAttack;
    clocks.boulder = SHELLBACK.boulder.first;
    clocks.charge = SHELLBACK.charge.first;
    clocks.sweep = SHELLBACK.firstAttack;
    lastSweep = -Infinity;
    lastCharge = -Infinity;
    body.fort = true;
    phase = 0;
    enterPhase(phaseOf(hp), false);
    announce('wakes');
  }
  function enterPhase(n, say = true) {
    if (n <= phase) return;
    const was = phase;
    phase = n;
    body.t = 0;
    if (phase >= 2) {
      // the towers left crumble (their lines called off)
      for (const t of towers) {
        if (!t.down) {
          t.down = true;
          t.t = 0;
        }
      }
      cancel((a) => a.kind === 'tower');
    }
    if (phase === 1) setBody('fort', 0);
    else if (phase === 2) {
      setBody('stand', SHELLBACK.phases[1].stand);
      clocks.boulder = SHELLBACK.boulder.first;
      clocks.sweep = Math.max(clocks.sweep, SHELLBACK.phases[1].stand);
      if (say && was) announce('waking');
    } else if (phase === 3) {
      // it throws the fort off its back (a big splash behind it, no damage)
      if (run) run = null;
      const f = fwd();
      const s = openSpot(body.x - f.x * (SHELLBACK.body.r + 6), body.z - f.z * (SHELLBACK.body.r + 6), 3);
      splash = { x: s.x, z: s.z, t: 0 };
      body.fort = false;
      setBody('throw', SHELLBACK.phases[2].throw);
      clocks.charge = SHELLBACK.charge.first;
      cancel((a) => a.kind === 'charge');
      sfx('splash', s.x, s.z);
      if (say && was) announce('charging');
    }
  }
  function setBody(state, T) {
    body.state = state;
    body.t = 0;
    body.T = T;
  }
  function cancel(pred) {
    const keep = [];
    for (const a of attacks) {
      if (pred(a)) giveSlot(a.kind);
      else keep.push(a);
    }
    attacks = keep;
  }
  function hurt(dmg, src) {
    if (!fighting() || !(dmg > 0)) return;
    if (src in dmgBy) dmgBy[src] += Math.min(dmg, hp);
    hp = Math.max(0, hp - dmg);
    if (hp <= EPS) {
      hp = 0;
      return goOff();
    }
    enterPhase(phaseOf(hp));
  }
  // Driven off (§3.6.4): every warning goes, it walks to the arena's edge with a yawn and settles to sleep; the
  // Golden Conch bobs up where it was driven off (on your side of it, in open water).
  function goOff() {
    mode = 'gone';
    goneT = 0;
    cancel(() => true);
    run = null;
    st = { id: null, t: 0, max: 0, pegs: 0 };
    burnPart = null;
    const p = readPlayer();
    const a = arena();
    let ux = body.x - (p ? p.x : a.x);
    let uz = body.z - (p ? p.z : a.z);
    const d = Math.hypot(ux, uz);
    if (d < 1e-6) {
      ux = -Math.sin(body.h);
      uz = -Math.cos(body.h);
    } else {
      ux /= d;
      uz /= d;
    }
    const lim = Math.max(0, a.r - SHELLBACK.body.r - 1);
    // the arena's edge, beyond the body from you
    const k = (() => {
      // where the ray from the body meets the circle of radius lim round the arena's centre
      const ox = body.x - a.x;
      const oz = body.z - a.z;
      const b = ox * ux + oz * uz;
      const c = ox * ox + oz * oz - lim * lim;
      const disc = b * b - c;
      return disc > 0 ? Math.max(0, -b + Math.sqrt(disc)) : 0;
    })();
    home = { x: body.x + ux * k, z: body.z + uz * k };
    const toP = p ? { x: p.x - body.x, z: p.z - body.z } : { x: -ux, z: -uz };
    const tl = Math.hypot(toP.x, toP.z) || 1;
    const cx = body.x + (toP.x / tl) * (SHELLBACK.body.r + 4);
    const cz = body.z + (toP.z / tl) * (SHELLBACK.body.r + 4);
    const s = openSpot(cx, cz, 1.5);
    conch = { x: s.x, z: s.z, t: 0, got: false, v: 0 };
    setBody('home', SHELLBACK.gone.max);
    sfx('yawn', body.x, body.z);
    announce('shellHome');
  }

  // ---------------------------------------------------------------- attacks
  function canStart() {
    return fighting() && !holdNow && !sneezing() && telegraphs() < bossCap();
  }
  function start(kind, a) {
    if (!takeSlot(kind)) {
      counts.waited++;
      return false;
    }
    attacks.push({ id: nextId(kind), kind, t: 0, ...a });
    sinceAttack = 0;
    return true;
  }
  function towerLine(p) {
    const up = towers.filter((t) => !t.down);
    if (!up.length) return false;
    // the next standing tower in turn that can see you
    for (let k = 0; k < towers.length; k++) {
      const t = towers[(turn + k) % towers.length];
      if (t.down) continue;
      const q = towerAt(t);
      if (hullDist(p, q.x, q.z) > SHELLBACK.towers.range + EPS) continue;
      // tracking (+0.5 s frozen), then locked (+ the warn bonus): ≥ 1.8 s in all
      const T1 = fort.track() + (frozen() ? SHELLBACK.specials.warn : 0);
      const T = Math.max(SHELLBACK.minWarn, T1 + fort.lock() + Math.max(0, num(call('warnBonus'), 0)));
      const h = bearing(q.x, q.z, p.x, p.z);
      if (!start('tower', { tower: t.id, state: 'track', T1, T, h, x0: q.x, z0: q.z })) return false;
      turn = (towers.indexOf(t) + 1) % towers.length;
      counts.towers++;
      warnLive('tower');
      return true;
    }
    return false;
  }
  function boulder(p, exact) {
    const B = SHELLBACK.boulder;
    const T = warnTime(B.warn);
    const q = predict(p, T);
    let x = q.x;
    let z = q.z;
    if (!exact) {
      const a = rand() * TAU;
      const d = B.aim * Math.sqrt(rand());
      x += Math.sin(a) * d;
      z += Math.cos(a) * d;
    }
    const s = openSpot(x, z, B.r * 0.6);
    if (!start('boulder', { x: s.x, z: s.z, r: B.r, T, fx: body.x, fz: body.z })) return false;
    counts.boulders++;
    if (exact) counts.cutOffs++;
    pop(word('boulder'), s.x, 3, s.z);
    sfx('boulder', body.x, body.z, { duration: T });
    warnLive('boulder');
    return true;
  }
  function sweep(p) {
    const S = SHELLBACK.sweep;
    // the sector's point is where its claws join, in front of it (it faces you), aimed at you
    const f = fwd();
    const ax = body.x + f.x * S.from;
    const az = body.z + f.z * S.from;
    const b = bearing(ax, az, p.x, p.z);
    // the claw on your side sweeps (the other one when it droops)
    const side = wrap(bearing(body.x, body.z, p.x, p.z) - body.h) >= 0 ? 1 : -1;
    const claw = claws.find((c) => c.side === side && !c.down) || claws.find((c) => !c.down);
    if (!claw) return false;
    const T = warnTime(S.warn);
    if (!start('sweep', { x: ax, z: az, h: b, r: S.r, half: (S.angle / 2) * RAD, T, claw: claw.id })) return false;
    counts.sweeps++;
    lastSweep = clock;
    setBody('sweep', T);
    pop(word('snip'), ax + Math.sin(b) * 6, 4, az + Math.cos(b) * 6);
    sfx('snip', body.x, body.z, { duration: T });
    warnLive('sweep');
    return true;
  }
  // The charge's lane: from the body through your predicted spot, up to 45 u, cut where the body would leave the
  // arena or come near land; null when what is left is too short.
  function chargeLane(p, T) {
    const C = SHELLBACK.charge;
    const q = predict(p, T);
    let ux = q.x - body.x;
    let uz = q.z - body.z;
    const d = Math.hypot(ux, uz);
    if (d < 1e-6) {
      ux = Math.sin(body.h);
      uz = Math.cos(body.h);
    } else {
      ux /= d;
      uz /= d;
    }
    let len = 0;
    for (let s = 1; s <= C.len + EPS; s += 1) {
      if (!bodyOk(body.x + ux * s, body.z + uz * s)) break;
      len = s;
    }
    if (len < C.min) return null;
    return { x0: body.x, z0: body.z, x1: body.x + ux * len, z1: body.z + uz * len, len, ux, uz };
  }
  function charge(p) {
    const C = SHELLBACK.charge;
    const T = warnTime(C.warn);
    const ln = chargeLane(p, T);
    if (!ln) return false;
    if (!start('charge', { ...ln, w: C.w, T })) return false;
    counts.charges++;
    lastCharge = clock;
    body.h = bearing(ln.x0, ln.z0, ln.x1, ln.z1);
    setBody('crouch', T);
    pop(word('charge'), (ln.x0 + ln.x1) / 2, 4, (ln.z0 + ln.z1) / 2);
    sfx('charge', body.x, body.z, { duration: T });
    warnLive('charge');
    return true;
  }
  function land(a, p, ships) {
    giveSlot(a.kind);
    if (a.kind === 'tower') {
      // fires along the locked line: you, if your hull is on it
      const R = SHELLBACK.towers.range;
      const ex = a.x0 + Math.sin(a.h) * R;
      const ez = a.z0 + Math.cos(a.h) * R;
      sfx('fire', a.x0, a.z0);
      a.shot = { x1: ex, z1: ez };
      if (p) {
        const [x0, z0, x1, z1] = hullEnds(p);
        if (segDist(x0, z0, x1, z1, a.x0, a.z0, ex, ez) <= p.wid / 2 + fort.hw() + EPS) {
          counts.hits.tower++;
          call('damage', SHELLBACK.towers.damage, p.x, p.z, 'tower');
        }
      }
      return;
    }
    if (a.kind === 'boulder') {
      sfx('splash', a.x, a.z);
      if (p && hullDist(p, a.x, a.z) <= a.r + EPS) {
        counts.hits.boulder++;
        call('damage', SHELLBACK.boulder.damage, a.x, a.z, 'boulder');
        pop(word('bonk'), a.x, 3, a.z);
      }
      return;
    }
    if (a.kind === 'sweep') {
      const S = SHELLBACK.sweep;
      const claw = claws.find((c) => c.id === a.claw);
      if (claw) claw.sweep = 1;
      for (const h of all(p, ships)) {
        let inside = false;
        for (let i = 0; i <= 10 && !inside; i++) {
          const k = i / 10 - 0.5;
          const x = h.x + Math.sin(h.h) * h.len * k;
          const z = h.z + Math.cos(h.h) * h.len * k;
          const d = Math.hypot(x - a.x, z - a.z);
          if (d <= a.r + EPS && Math.abs(wrap(bearing(a.x, a.z, x, z) - a.h)) <= a.half + EPS) inside = true;
        }
        if (!inside) continue;
        if (h.key === 'player') {
          counts.hits.sweep++;
          call('damage', S.damage, h.x, h.z, 'sweep');
        }
        shove(h, h.x - body.x, h.z - body.z, S.shove);
      }
      clocks.sweep = S.gap;
      setBody('walk', 0);
      return;
    }
    if (a.kind === 'charge') {
      const C = SHELLBACK.charge;
      // every hull in the lane: 14 (yours) and a 4 u shove out of it at once; then it runs the lane
      for (const h of all(p, ships)) {
        const [x0, z0, x1, z1] = hullEnds(h);
        if (segDist(x0, z0, x1, z1, a.x0, a.z0, a.x1, a.z1) > a.w / 2 + EPS) continue;
        if (h.key === 'player') {
          counts.hits.charge++;
          call('damage', C.damage, h.x, h.z, 'charge');
        }
        const lat = (h.x - a.x0) * a.uz - (h.z - a.z0) * a.ux;
        const sgn = Math.abs(lat) > 0.01 ? Math.sign(lat) : 1;
        shove(h, a.uz * sgn, -a.ux * sgn, C.shove);
      }
      run = { x0: a.x0, z0: a.z0, x1: a.x1, z1: a.z1, len: a.len, k: 0, t: 0, id: a.id };
      setBody('charge', a.len / C.speed);
    }
  }

  // ---------------------------------------------------------------- the step
  function stepStatus(dt) {
    if (st.id === 'fire') burn(status.fireDps() * Math.min(dt, Math.max(0, st.t)));
    if (!fighting()) return;
    if (st.id !== 'stink' && st.pegs > 0) st.pegs = Math.max(0, st.pegs - dt);
    if (!st.id) return;
    st.t -= dt;
    if (st.t > EPS) return;
    if (st.id === 'stink') st.pegs = status.pegs();
    if (st.id === 'fire') burnPart = null;
    st.id = null;
    st.t = 0;
    st.max = 0;
  }
  function burn(amount) {
    if (!(amount > 0) || !fighting()) return;
    const t = towers.find((x) => x.id === burnPart && !x.down);
    const c = claws.find((x) => x.id === burnPart && !x.down);
    if (t) return hurtTower(t, amount, 'burn');
    if (c) return hurtClaw(c, amount, 'burn');
    hurt(amount, 'burn');
  }
  function hurtTower(t, dmg, src) {
    const d = Math.min(Math.max(0, dmg), t.hp);
    t.hp -= d;
    let w = null;
    if (t.hp <= EPS) {
      t.hp = 0;
      t.down = true;
      t.t = 0;
      if (burnPart === t.id) burnPart = null;
      w = word('towerDown');
      const q = towerAt(t);
      sfx('down', q.x, q.z);
      cancel((a) => a.kind === 'tower' && a.tower === t.id);
    }
    hurt(d, src);
    if (fighting() && phase === 1 && towers.every((x) => x.down)) enterPhase(2);
    return { d, w };
  }
  function hurtClaw(c, dmg, src) {
    const d = Math.min(Math.max(0, dmg), c.hp);
    c.hp -= d;
    let w = null;
    if (c.hp <= EPS) {
      c.hp = 0;
      c.down = true;
      c.t = 0;
      if (burnPart === c.id) burnPart = null;
      w = word('ouch');
      cancel((a) => a.kind === 'sweep' && a.claw === c.id);
      if (body.state === 'sweep' && !attacks.some((a) => a.kind === 'sweep')) setBody('walk', 0);
    }
    hurt(d, src);
    return { d, w };
  }
  // How near the body's centre may step to a hull's centre: r + its half-length + 1 (§3.6.3), and its half-width
  // too, so the body never walks a ship (a bow pointing at it) into its own push.
  const standoffOf = (h) => SHELLBACK.body.r + h.len / 2 + h.wid / 2 + SHELLBACK.standoff;
  function stepBodyWalk(dt, p, ships, speed) {
    if (!p) return;
    const a = arena();
    // the goal: you, or the nearest point of the arena to you
    let gx = p.x;
    let gz = p.z;
    const lim = Math.max(0, a.r - SHELLBACK.body.r);
    const gd = Math.hypot(gx - a.x, gz - a.z);
    if (gd > lim) {
      gx = a.x + ((gx - a.x) / gd) * lim;
      gz = a.z + ((gz - a.z) / gd) * lim;
    }
    const hullsNow = all(p, ships);
    const stand = standoffOf;
    const dist = Math.hypot(gx - body.x, gz - body.z);
    if (dist < 1e-6 || Math.hypot(p.x - body.x, p.z - body.z) <= stand(p) + 0.25) return; // (it waits, facing you)
    const step = speed * dt;
    const base = Math.atan2(gx - body.x, gz - body.z);
    for (const off of [0, 30, -30, 60, -60, 90, -90, 120, -120]) {
      const h = base + off * RAD;
      const nx = body.x + Math.sin(h) * step;
      const nz = body.z + Math.cos(h) * step;
      if (!bodyOk(nx, nz)) continue;
      // the standoff: never a step nearer a hull than r + its half-length (+ its half-width) + 1 (walking away from
      // one is fine)
      let ok = true;
      for (const s of hullsNow) {
        const d1 = Math.hypot(nx - s.x, nz - s.z);
        if (d1 < stand(s) - EPS && d1 < Math.hypot(body.x - s.x, body.z - s.z) - EPS) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      body.x = nx;
      body.z = nz;
      body.gait += step;
      return;
    }
  }
  function stepRun(dt) {
    const C = SHELLBACK.charge;
    run.t += dt;
    const k = clamp((run.t * C.speed) / Math.max(run.len, 1e-6), 0, 1);
    const nx = run.x0 + (run.x1 - run.x0) * k;
    const nz = run.z0 + (run.z1 - run.z0) * k;
    body.gait += Math.hypot(nx - body.x, nz - body.z);
    body.x = nx;
    body.z = nz;
    run.k = k;
    if (k >= 1 - EPS) {
      run = null;
      setBody('dizzy', C.dizzy);
      pop(word('dizzy'), body.x, 8, body.z);
    }
  }
  function stepAttacks(dt, p, ships) {
    const landing = [];
    for (const a of attacks) {
      a.t += dt;
      if (a.kind === 'tower') {
        if (a.state === 'track') {
          // its gun swings after you (at most FORT.traverse rad/s), then locks
          if (p) a.h = turnToward(a.h, bearing(a.x0, a.z0, p.x, p.z), fort.traverse() * dt);
          if (a.t >= a.T1 - EPS) {
            a.state = 'lock';
            pop(word('aim'), a.x0, SHELLBACK.towers.y1 + 1, a.z0);
            sfx('tower', a.x0, a.z0);
          }
        } else if (a.t >= a.T - EPS) landing.push(a);
        continue;
      }
      if (a.t >= a.T - EPS) landing.push(a);
    }
    for (const a of landing) {
      attacks = attacks.filter((x) => x !== a);
      if (fighting()) land(a, p, ships);
    }
  }
  function stepTimers(dt, p) {
    if (!p) return;
    const quiet = holdNow;
    if (!quiet) sinceAttack += dt;
    const busy = body.state === 'stand' || body.state === 'throw' || body.state === 'crouch' || body.state === 'charge' || body.state === 'dizzy';
    if (phase === 1) {
      if (!quiet) clocks.tower = Math.max(0, clocks.tower - dt);
      if (clocks.tower <= EPS && canStart() && towerLine(p)) clocks.tower = SHELLBACK.towers.every;
    }
    if (phase >= 2) {
      if (!quiet) clocks.sweep = Math.max(0, clocks.sweep - dt);
      // (within reach of its claws: measured from where they join, in front of it)
      const near = hullDist(p, body.x + Math.sin(body.h) * SHELLBACK.sweep.from, body.z + Math.cos(body.h) * SHELLBACK.sweep.from) <= SHELLBACK.sweep.reach + EPS;
      // (no charge within chargeGap of a sweep: in phase 3 a sweep starts only while the next charge is further off)
      const chargeOk = clock - lastCharge >= SHELLBACK.chargeGap - EPS && (phase < 3 || clocks.charge > SHELLBACK.chargeGap + EPS);
      if (!busy && body.state !== 'sweep' && near && clocks.sweep <= EPS && chargeOk && canStart() && !attacks.some((a) => a.kind === 'charge')) sweep(p);
    }
    if (phase === 2) {
      if (!quiet && !busy) clocks.boulder = Math.max(0, clocks.boulder - dt);
      if (clocks.boulder <= EPS && canStart() && boulder(p, false)) clocks.boulder = SHELLBACK.boulder.every;
    }
    if (phase === 3) {
      if (!quiet && !busy && body.state !== 'sweep') clocks.charge = Math.max(0, clocks.charge - dt);
      const sweepOk = clock - lastSweep >= SHELLBACK.chargeGap - EPS && !attacks.some((a) => a.kind === 'sweep');
      if (clocks.charge <= EPS && !busy && body.state !== 'sweep' && sweepOk && canStart()) {
        if (!charge(p)) clocks.charge = 2; // (no room for a lane, or no slot: it tries again soon)
        else clocks.charge = SHELLBACK.charge.every;
      }
    }
    // the cut-off: no attack started for 12 s (you are far off): a boulder at your predicted spot
    if (sinceAttack >= SHELLBACK.cutOff - EPS && canStart() && !attacks.length) boulder(p, true);
  }
  function stepBody(dt, p, ships) {
    body.t += dt;
    body.hurt = Math.max(0, body.hurt - dt * 2);
    body.sneeze = Math.max(0, body.sneeze - dt);
    for (const c of claws) {
      c.sweep = Math.max(0, c.sweep - dt * 2);
      if (c.down) {
        c.t += dt;
        if (c.t >= SHELLBACK.claws.droop - EPS) {
          c.down = false;
          c.hp = SHELLBACK.claws.hp;
          c.t = 0;
        }
      }
    }
    for (const t of towers) if (t.down) t.t += dt;
    if (splash) splash.t += dt;
    if (p && body.state !== 'crouch' && body.state !== 'charge' && body.state !== 'dizzy') body.h = turnToward(body.h, bearing(body.x, body.z, p.x, p.z), SHELLBACK.turn * dt);
    const speed = SHELLBACK.phases[clamp(phase, 1, 3) - 1].walk * (frozen() ? SHELLBACK.specials.walk : 1);
    switch (body.state) {
      case 'stand':
      case 'throw':
        if (body.t >= body.T - EPS) setBody('walk', 0);
        break;
      case 'walk':
        stepBodyWalk(dt, p, ships, speed);
        break;
      case 'charge':
        if (run) stepRun(dt);
        else setBody('walk', 0);
        break;
      case 'dizzy':
        if (body.t >= body.T - EPS) {
          setBody('walk', 0);
          clocks.charge = SHELLBACK.charge.every;
        }
        break;
      default:
        break;
    }
  }
  function stepGone(dt, p) {
    goneT += dt;
    body.t += dt;
    if (splash) splash.t += dt;
    if (body.state === 'home') {
      // it walks to the arena's edge (walking round ships), then settles to sleep
      const d = Math.hypot(home.x - body.x, home.z - body.z);
      if (d <= 0.5 || body.t >= SHELLBACK.gone.max - EPS) setBody('asleep', 0);
      else {
        const ships = readShips();
        const step = Math.min(d, SHELLBACK.gone.walk * dt);
        const base = Math.atan2(home.x - body.x, home.z - body.z);
        const hullsNow = all(p, ships);
        for (const off of [0, 40, -40, 80, -80]) {
          const h = base + off * RAD;
          const nx = body.x + Math.sin(h) * step;
          const nz = body.z + Math.cos(h) * step;
          if (!bodyOk(nx, nz)) continue;
          if (hullsNow.some((s) => Math.hypot(nx - s.x, nz - s.z) < standoffOf(s) - EPS && Math.hypot(nx - s.x, nz - s.z) < Math.hypot(body.x - s.x, body.z - s.z) - EPS)) continue;
          body.x = nx;
          body.z = nz;
          body.gait += step;
          body.h = turnToward(body.h, h, SHELLBACK.turn * dt);
          break;
        }
      }
    }
    // the Golden Conch: sail over it, or after a while it drifts to you, faster and faster
    if (conch && !conch.got) {
      const G = SHELLBACK.gone;
      conch.t += dt;
      if (p && conch.t >= G.conchRise - EPS) {
        if (hullDist(p, conch.x, conch.z) <= G.reach + EPS) {
          conch.got = true;
          over = true;
          call('conch', SHELLBACK.conch);
          pop(word('conch', SHELLBACK.conch), p.x, 4, p.z, 'gold');
          sfx('conch', p.x, p.z);
          announce('conch', SHELLBACK.conch);
          return;
        }
        if (conch.t >= G.drift - EPS) {
          conch.v = Math.min(G.driftSpeed * 4, conch.v + G.driftAccel * dt);
          const sp = G.driftSpeed + conch.v;
          const dx = p.x - conch.x;
          const dz = p.z - conch.z;
          const dd = Math.hypot(dx, dz);
          if (dd > 1e-6) {
            const m = Math.min(dd, sp * dt);
            conch.x += (dx / dd) * m;
            conch.z += (dz / dd) * m;
          }
        }
      }
    }
  }
  function tick(dt) {
    clock += dt;
    holdNow = call('hold') === true;
    for (const [k, s] of shoves) if (clock >= s.until - EPS) shoves.delete(k);
    if (mode === 'wake') {
      wakeT += dt;
      if (wakeT >= wakeDur - EPS) startFight();
      return;
    }
    if (mode === 'gone') return stepGone(dt, readPlayer());
    if (mode !== 'fight') return;
    stepStatus(dt);
    if (!fighting()) return;
    const p = readPlayer();
    const ships = readShips();
    stepAttacks(dt, p, ships);
    if (!fighting()) return;
    stepBody(dt, p, ships);
    stepTimers(dt, p);
  }

  // ---------------------------------------------------------------- what main sees
  function partOf(id) {
    if (!fighting() || typeof id !== 'string') return null;
    if (phase === 1) {
      const t = towers.find((x) => x.id === id && !x.down);
      return t ? { kind: 'tower', t } : null;
    }
    if (id === 'eyeL' || id === 'eyeR') return { kind: 'eye', side: id === 'eyeL' ? -1 : 1 };
    const c = claws.find((x) => x.id === id && !x.down);
    if (c) return { kind: 'claw', c };
    if (id === 'shell') return { kind: 'shell' };
    return null;
  }
  const inEye = (x, y, z) => [-1, 1].some((s) => {
    const e = eyeAt(s);
    return Math.hypot(x - e.x, y - e.y, z - e.z) <= SHELLBACK.eyes.r + EPS;
  });
  const inClaw = (c, x, y, z) => {
    const C = SHELLBACK.claws;
    const q = clawAt(c);
    return y >= C.y0 - 0.5 && y <= C.y1 + EPS && Math.hypot(x - q.x, z - q.z) <= C.r + EPS;
  };
  function targets() {
    const out = [];
    if (!fighting()) return out;
    const name = 'The Shellback';
    if (phase === 1) {
      const T = SHELLBACK.towers;
      for (const t of towers) {
        if (t.down) continue;
        const q = towerAt(t);
        out.push({ id: t.id, kind: 'tower', x: q.x, z: q.z, r: T.r, y0: T.y0, y1: T.y1, hp: t.hp, maxHp: T.hp, name, hidden: false });
      }
      return out;
    }
    const E = SHELLBACK.eyes;
    for (const s of [-1, 1]) {
      const e = eyeAt(s);
      out.push({ id: s < 0 ? 'eyeL' : 'eyeR', kind: 'eye', x: e.x, z: e.z, r: E.r, y0: e.y - E.r, y1: e.y + E.r, hp, maxHp: SHELLBACK.hp, name, hidden: false });
    }
    const C = SHELLBACK.claws;
    for (const c of claws) {
      if (c.down) continue;
      const q = clawAt(c);
      out.push({ id: c.id, kind: 'claw', x: q.x, z: q.z, r: C.r, y0: C.y0, y1: C.y1, hp: c.hp, maxHp: C.hp, name, hidden: false });
    }
    const S = SHELLBACK.shell;
    out.push({ id: 'shell', kind: 'shell', x: body.x, z: body.z, r: SHELLBACK.body.r, y0: S.y0, y1: S.y1, hp, maxHp: SHELLBACK.hp, name, hidden: false });
    return out;
  }

  function visuals() {
    const out = { body: null, eyes: [], claws: [], towers: [], rings: [], sectors: [], lanes: [], lines: [], wake: null, splash: null, conch: null, burn: null };
    if (disposed) return out;
    const p = readPlayer();
    const look = p ? { x: p.x, z: p.z } : null;
    if (!body.placed) {
      const l = lairCircle();
      placeBody(l.x, l.z);
    }
    let k = 0;
    if (mode === 'wake') k = smooth(wakeT / wakeDur) * 0.6;
    else if (mode === 'fight') k = phase <= 1 ? 0.6 : body.state === 'stand' ? 0.6 + 0.4 * smooth(body.t / Math.max(body.T, 1e-6)) : 1;
    else if (mode === 'gone') k = body.state === 'asleep' ? 0.2 : 1 - 0.8 * smooth(body.t / SHELLBACK.gone.max);
    const state = mode === 'idle' ? 'sleep' : mode === 'wake' ? 'wake' : body.state;
    out.body = { x: body.x, z: body.z, h: body.h, r: bodyR(), k, state, t: mode === 'wake' ? wakeT : body.t, gait: body.gait, hurt: body.hurt, sneeze: body.sneeze, frozen: frozen(), burning: st.id === 'fire', dizzy: mode === 'fight' && body.state === 'dizzy', fort: body.fort };
    if (mode === 'wake') out.wake = { k: clamp(wakeT / wakeDur, 0, 1), T: wakeDur };
    let open = 0;
    if (mode === 'wake') open = smooth((wakeT / wakeDur - 0.35) / 0.2);
    else if (mode === 'fight') open = 1;
    else if (mode === 'gone') open = body.state === 'asleep' ? 0 : 0.4;
    for (const s of [-1, 1]) {
      const e = eyeAt(s);
      out.eyes.push({ id: s < 0 ? 'eyeL' : 'eyeR', x: e.x, y: e.y, z: e.z, open, look, dizzy: mode === 'fight' && body.state === 'dizzy' });
    }
    for (const c of claws) {
      const q = clawAt(c);
      out.claws.push({ id: c.id, x: q.x, z: q.z, h: body.h, hp: c.hp, maxHp: SHELLBACK.claws.hp, down: c.down, t: c.t, sweep: c.sweep });
    }
    if (body.fort || phase <= 1) {
      for (const t of towers) {
        const q = towerAt(t);
        const a = attacks.find((x) => x.kind === 'tower' && x.tower === t.id);
        out.towers.push({ id: t.id, x: q.x, z: q.z, y0: SHELLBACK.towers.y0, y1: SHELLBACK.towers.y1, hp: t.hp, maxHp: SHELLBACK.towers.hp, down: t.down, t: t.t, aim: a ? a.h : null });
      }
    }
    for (const a of attacks) {
      if (a.kind === 'boulder') out.rings.push({ id: a.id, kind: 'boulder', x: a.x, z: a.z, r: a.r, t: a.t, T: a.T, from: { x: a.fx, z: a.fz } });
      else if (a.kind === 'sweep') out.sectors.push({ id: a.id, kind: 'sweep', x: a.x, z: a.z, h: a.h, r: a.r, half: a.half, t: a.t, T: a.T, claw: a.claw });
      else if (a.kind === 'charge') out.lanes.push({ id: a.id, kind: 'charge', x0: a.x0, z0: a.z0, x1: a.x1, z1: a.z1, w: a.w, t: a.t, T: a.T, state: 'warn', run: 0 });
      else if (a.kind === 'tower') {
        const d = p ? Math.hypot(p.x - a.x0, p.z - a.z0) : SHELLBACK.towers.range;
        const L = a.state === 'track' ? d : SHELLBACK.towers.range;
        out.lines.push({ id: a.id, kind: 'tower', tower: a.tower, x0: a.x0, y0: SHELLBACK.towers.gunY, z0: a.z0, x1: a.x0 + Math.sin(a.h) * L, z1: a.z0 + Math.cos(a.h) * L, state: a.state, t: a.t, T: a.T });
      }
    }
    if (run) out.lanes.push({ id: run.id, kind: 'charge', x0: run.x0, z0: run.z0, x1: run.x1, z1: run.z1, w: SHELLBACK.charge.w, t: run.t, T: run.len / SHELLBACK.charge.speed, state: 'run', run: run.k });
    if (splash && splash.t < 3) out.splash = { ...splash };
    if (conch && !conch.got) out.conch = { x: conch.x, z: conch.z, k: smooth(conch.t / SHELLBACK.gone.conchRise), h: p ? bearing(conch.x, conch.z, p.x, p.z) : 0 };
    if (st.id === 'fire') out.burn = { part: burnPart };
    return out;
  }

  function snapshot() {
    const r = round6;
    return {
      mode,
      phase,
      hp: r(hp),
      maxHp: SHELLBACK.hp,
      awake: mode !== 'idle',
      rising: mode === 'wake',
      done: mode === 'gone',
      over,
      short,
      time: r(clock),
      wakeT: r(wakeT),
      wakeDur,
      body: { x: r(body.x), z: r(body.z), h: r(body.h), r: bodyR(), state: mode === 'idle' ? 'sleep' : mode === 'wake' ? 'wake' : body.state, t: r(body.t), fort: body.fort },
      towers: towers.map((t) => ({ id: t.id, hp: r(t.hp), down: t.down })),
      claws: claws.map((c) => ({ id: c.id, hp: r(c.hp), down: c.down, t: r(c.t) })),
      attacks: attacks.map((a) => ({ id: a.id, kind: a.kind, t: r(a.t), T: r(a.T), state: a.state || 'warn' })),
      telegraphs: telegraphs(),
      run: run ? { k: r(run.k), len: r(run.len) } : null,
      clocks: { tower: r(clocks.tower), boulder: r(clocks.boulder), charge: r(clocks.charge), sweep: r(clocks.sweep) },
      sinceAttack: r(sinceAttack),
      status: { id: st.id, t: r(st.t), max: r(st.max), pegs: r(st.pegs), part: burnPart },
      conch: conch ? { x: r(conch.x), z: r(conch.z), t: r(conch.t), got: conch.got } : null,
      warnHeld: slotsHeld.length,
      shoves: [...shoves.keys()].map(String),
      counts: { ...counts, hits: { ...counts.hits } },
      dmgBy: { ...dmgBy },
      disposed,
    };
  }

  // ---------------------------------------------------------------- the API
  return {
    wake(x, z, opts) {
      if (disposed || mode !== 'idle') return false;
      let sx = num(x, NaN);
      let sz = num(z, NaN);
      if (!Number.isFinite(sx) || !Number.isFinite(sz)) {
        const l = lairCircle();
        sx = l.x;
        sz = l.z;
      }
      placeBody(sx, sz);
      const p = readPlayer();
      body.h = p ? bearing(sx, sz, p.x, p.z) : 0;
      short = !!prop(opts, 'short');
      wakeDur = short ? SHELLBACK.shortWake : SHELLBACK.wake;
      wakeT = 0;
      hp = SHELLBACK.hp;
      mode = 'wake';
      setBody('wake', wakeDur);
      sfx('wake', sx, sz);
      return true;
    },
    skip() {
      if (disposed || mode !== 'wake') return false;
      startFight();
      return true;
    },
    step(dt) {
      if (disposed) return;
      let left = num(dt, 0);
      if (!(left > 0)) return;
      left = Math.min(left, 1);
      if (!body.placed) {
        const l = lairCircle();
        placeBody(l.x, l.z);
      }
      while (left > EPS) {
        const d = Math.min(left, 1 / 60);
        tick(d);
        left -= d;
      }
    },
    targets,
    hits(id, x, y, z) {
      const part = partOf(id);
      if (!part) return false;
      x = num(x, NaN);
      y = num(y, NaN);
      z = num(z, NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
      if (part.kind === 'tower') {
        const T = SHELLBACK.towers;
        const q = towerAt(part.t);
        return y >= T.y0 - EPS && y <= T.y1 + EPS && Math.hypot(x - q.x, z - q.z) <= T.r + EPS;
      }
      if (part.kind === 'eye') {
        const e = eyeAt(part.side);
        return Math.hypot(x - e.x, y - e.y, z - e.z) <= SHELLBACK.eyes.r + EPS;
      }
      if (part.kind === 'claw') return inClaw(part.c, x, y, z) && !inEye(x, y, z);
      // the shell: the body's dome, but not its eyes or claws
      const S = SHELLBACK.shell;
      if (inEye(x, y, z) || claws.some((c) => !c.down && inClaw(c, x, y, z))) return false;
      return y >= S.y0 - 0.5 && y <= S.y1 + EPS && Math.hypot(x - body.x, z - body.z) <= SHELLBACK.body.r + EPS;
    },
    hit(id, info) {
      const part = partOf(id);
      if (!part) return null;
      const base = Math.max(0, num(prop(info, 'dmg'), 0));
      const crit = prop(info, 'crit') === true;
      let w = null;
      let dmg = 0;
      if (part.kind === 'tower') {
        const r = hurtTower(part.t, base * SHELLBACK.towers.mul, 'tower');
        dmg = r.d;
        w = r.w;
      } else if (part.kind === 'eye') {
        const dizzy = body.state === 'dizzy';
        dmg = base * (dizzy ? SHELLBACK.eyes.dizzy : SHELLBACK.eyes.mul);
        w = word(dizzy ? 'bonk' : 'bullseye');
        body.hurt = 1;
        hurt(dmg, 'eye');
      } else if (part.kind === 'claw') {
        const r = hurtClaw(part.c, base * SHELLBACK.claws.mul, 'claw');
        dmg = r.d;
        w = r.w;
        body.hurt = 1;
      } else {
        dmg = base * SHELLBACK.shell.mul;
        w = word('clang');
        hurt(dmg, 'shell');
      }
      if (!w && crit) w = word('crit');
      return { dmg, word: w };
    },
    special(id, ammo) {
      if (!fighting()) return null;
      if (ammo === 'frost') {
        let w = null;
        if (st.id === 'fire') {
          w = word('fireOut');
          burnPart = null;
        }
        if (st.id === 'frost') {
          const t = Math.max(st.t, Math.min(status.frostMax(), st.t + status.frostAdd()));
          if (t > st.t + EPS) {
            st.t = t;
            st.max = t;
            w = w || word('frost');
          }
          return w;
        }
        const t = status.frostTime();
        st = { id: 'frost', t, max: t, pegs: st.id === 'stink' ? status.pegs() : st.pegs };
        return w || word('frost');
      }
      if (ammo === 'fire') {
        let w = word('fire');
        if (st.id === 'stink') {
          w = word('kaboom');
          st.pegs = status.pegs();
          hurt(status.burst(), 'burst');
          if (!fighting()) return w;
        }
        const t = status.fireTime();
        st = { id: 'fire', t, max: t, pegs: st.pegs };
        burnPart = typeof id === 'string' ? id : null;
        return w;
      }
      if (ammo === 'stink') {
        if (st.id === 'stink') return null;
        if (st.pegs > EPS) return word('pegs');
        const t = status.stinkTime();
        st = { id: 'stink', t, max: t, pegs: 0 };
        burnPart = null;
        counts.sneezes++;
        body.sneeze = 1;
        sfx('sneeze', body.x, body.z);
        return word('achoo');
      }
      return null;
    },
    boardWhy() {
      return 'monster';
    },
    push(ship) {
      if (disposed || !ship || typeof ship !== 'object') return null;
      const p = readPlayer();
      let key = prop(ship, 'id');
      const isYou = prop(ship, 'kind') === 'player' || (p && Math.abs(num(prop(ship, 'x'), NaN) - p.x) < 1e-6 && Math.abs(num(prop(ship, 'z'), NaN) - p.z) < 1e-6);
      if (isYou) key = 'player';
      const s = readHull(ship, key);
      if (!s) return null;
      let vx = 0;
      let vz = 0;
      let any = false;
      const sh = shoves.get(key);
      if (sh && clock < sh.until - EPS) {
        vx += sh.vx;
        vz += sh.vz;
        any = true;
      }
      // the soft body: the sleeping lair (r 12) or the awake body (r 8)
      if (!body.placed) {
        const l = lairCircle();
        placeBody(l.x, l.z);
      }
      const R = bodyR();
      const d = hullDist(s, body.x, body.z);
      if (d < R + s.wid / 2 - EPS) {
        let nx = s.x - body.x;
        let nz = s.z - body.z;
        const n = Math.hypot(nx, nz);
        if (n < 1e-6) {
          nx = -Math.sin(s.h);
          nz = -Math.cos(s.h);
        } else {
          nx /= n;
          nz /= n;
        }
        // straight out, or turned up to 90° toward open water near land or the world's edge
        const open = (ux, uz) => inWorld(s.x + ux * 3, s.z + uz * 3, SHELLBACK.edge) && !isLand(s.x + ux * 3, s.z + uz * 3, s.wid / 2);
        if (!open(nx, nz)) {
          // (no open water within 90°: the turn that keeps it furthest inside the world, off land)
          const W = world();
          let best = null;
          let bestD = Infinity;
          for (const a of [15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90]) {
            const c = Math.cos(a * RAD);
            const sn = Math.sin(a * RAD);
            const ux = nx * c + nz * sn;
            const uz = -nx * sn + nz * c;
            if (open(ux, uz)) {
              best = { ux, uz };
              break;
            }
            const d = Math.hypot(s.x + ux * 3 - W.x, s.z + uz * 3 - W.z);
            if (!isLand(s.x + ux * 3, s.z + uz * 3, s.wid / 2) && d < bestD) {
              bestD = d;
              best = { ux, uz, fallback: true };
            }
          }
          if (best) {
            nx = best.ux;
            nz = best.uz;
          }
        }
        const vin = Math.sin(s.h) * s.speed * nx + Math.cos(s.h) * s.speed * nz;
        const k = SHELLBACK.push - Math.min(0, vin);
        vx += nx * k;
        vz += nz * k;
        any = true;
        if (clock - lastBump >= SHELLBACK.bumpGap - EPS) {
          lastBump = clock;
          counts.bumps++;
          pop(word('bump'), s.x, 3, s.z);
          sfx('bump', s.x, s.z);
        }
      }
      return any ? { vx, vz } : null;
    },
    playerMods() {
      return NO_MODS;
    },
    setHp(n) {
      const v = num(n, NaN);
      if (disposed || !Number.isFinite(v)) return hp;
      if (mode === 'idle' || mode === 'wake') {
        hp = clamp(v, 1, SHELLBACK.hp);
        return hp;
      }
      if (mode !== 'fight') return hp;
      hp = clamp(v, 0, SHELLBACK.hp);
      if (hp <= EPS) {
        hp = 0;
        goOff();
        return hp;
      }
      enterPhase(phaseOf(hp));
      return hp;
    },
    get bar() {
      if (disposed || mode === 'idle') return null;
      const r3 = (v) => Math.round(v * 1000) / 1000;
      return { name: SHELLBACK.name, frac: clamp(hp / SHELLBACK.hp, 0, 1), notches: SHELLBACK.notches.map((n) => r3(n / SHELLBACK.hp)) };
    },
    get phase() {
      return phase;
    },
    get hp() {
      return hp;
    },
    get status() {
      return { id: st.id, t: Math.max(0, st.t), max: st.max, immune: st.id === 'stink' ? 0 : st.pegs };
    },
    get rising() {
      return mode === 'wake';
    },
    get done() {
      return mode === 'gone';
    },
    get over() {
      return over;
    },
    visuals,
    get state() {
      return snapshot();
    },
    dispose() {
      if (disposed) return;
      while (slotsHeld.length) giveSlot(slotsHeld[slotsHeld.length - 1]);
      disposed = true;
      attacks = [];
      run = null;
      shoves.clear();
    },
  };
}
