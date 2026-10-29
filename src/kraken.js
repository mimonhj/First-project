// The Kraken (SPEC3 §5.7): a pure simulation of the beast that rises on level 9 once the Inkheart falls and
// hunts you (a shadow that follows, tentacles that slam and grab, a big-eyed head), and is driven off in
// three phases. main.js wraps its raised parts as pseudo-targets (§5.8) and krakenView.js draws visuals().
//
// Pure: imports nothing (the Node tests load it as a data: URL). Simulated time only (step(dt)); every roll
// comes from ctx.rng. The status times, the ink blob and the cut taps / hold come from ctx.tables (STATUS of
// specials.js, INK of mechanics3.js, RAIDERS of combat.js), never copied into KRAKEN. A junk ctx never throws:
// a missing or throwing callback is skipped, a missing table reads today's numbers.
//
// createKraken(ctx) → {
//   rise(x, z, { short }) → boolean   the rise (§5.7.1 step 3) with the eye opening at (x, z) (default 40 u
//                                     ahead of you), moved to open water; 6 s, or 3 s with short (the
//                                     checkpoint's retry). main runs the 4 s dread (KRAKEN.dread) before it.
//   skip() → boolean                  ends the rise at once (any key or tap; an addition to §11.1)
//   step(dt)                          the simulation, simulated seconds (main's 1/120 s substeps; at most 1 s a call)
//   targets() → [{ id, kind: 'eye' | 'head' | 'tentacle', x, z, r, y0, y1, hp }]   raised parts only (eye
//                                     first: it sits inside the head's sphere); hp: a tentacle's own, else the bar
//   hits(id, x, y, z) → boolean       is that point inside that raised part (a ball in flight)
//   hit(id, info) → { dmg, word } | null   a ball on a part: dmg = info.dmg (main's beam-on shotResult: ammo,
//                                     range, crit) × the part's mul (eye ×1.5); no rake ever. word: OUCH! (a
//                                     tentacle downed, or the grabbing one hit: it lets go), BULLSEYE! (the eye),
//                                     CRIT! (info.crit), else null. main pops the word and the number.
//   special(id, ammo) → word | null   a special ball's status, once per volley (as main's applyStatus): frost
//                                     (chase ×0.5, warnings +0.5 s), fire (the part burns, to the bar), stink
//                                     (ACHOO!: every raised tentacle snaps under, a grab lets go, no new attack;
//                                     then clothes-pegs). Boss times from ctx.tables.STATUS. main pops the word.
//   cut() → boolean                   a G / CUT! press while grabbed: true when it cuts loose (RAIDERS.cutTaps)
//   cutHold(down)                     G / CUT! held: cuts loose after RAIDERS.cutHold s
//   playerMods() → { speedMul, turnMul, dps, vx, vz }   grabbed: speed and turn 0, dps (main applies it to the
//                                     hull); the last stand's pull as a drift (vx, vz u/s; an addition)
//   setHp(n) → hp                     tests (G.kraken.setHp / phase): sets the bar, changing phase as hits do
//   get bar /* { name, frac, notches } | null */, get phase (0 before the fight), get hp, get grabbed,
//   get status → { id, t, max, immune }   its special status for #boss-status (specials.js newStatus()'s shape;
//                                     an addition)
//   get rising, get done (driven off: hp 0), get over (the Pearl taken: 3.5 s after `done` at the soonest if
//                                     you sail over it, else it drifts to you, faster and faster, so it always
//                                     comes: about 10 s for a ship 25 u away; main's clear check waits for it,
//                                     an addition),
//   visuals() → krakenView's input (fresh objects):
//     { shadow: { x, z, h, k } | null, head: { x, z, h, k, hurt, sneeze } | null,
//       eye: { glow, open, one, look: { x, z } } | null, tentacles: [{ id, x, z, h, t, state, tx, tz }] (≤ 4:
//       'slam' | 'sway' | 'grab' | 'recoil' | 'sink'), rings: [{ x, z, r, t, T, grab, kind: 'tentacle' | 'ink',
//       from? }] (an ink ring's from: { x, z }, where the blob was spat from, for a lob),
//       boil: { x, z, r, k } | null, pearl: { x, z, k, h } | null, rise: { k, T } | null, burn: { part } | null }
//   get state (a plain snapshot for tests and G.kraken.state), dispose()
// }
// ctx: { player() → { x, z, h, speed, wid, len }, damage(amount, x, z, source), land(x, z, r) → boolean (a
//        circle of radius r touches land), world: { x, z, r } (the world's centre and worldRadius), rng(),
//        warnBonus(), inkSlick(x, z), pop(text, x, y, z, style), announce(text), sfx(name, x, z, opts?) (opts: the
//        warning's { duration }, an addition),
//        tables: { STATUS, INK, RAIDERS, WORDS3? },
//        pearl(gold)? (an addition: called once when the Pearl is taken; main adds it to state.gold) }
// Damage sources: 'slam' (12 inside a ring), 'ink' (the phase-2 ink blob). The grab's 2 hp/s is main's to
// apply from playerMods().dps (§11.2 updatePlayer). A warning is never shorter than 1.5 s (KRAKEN.minWarn).

/**
 * §5.7.2–5.7.6 (Stage 1C's starting values, tuned by Stage 3 with the bots, §5.9, SPEC3 §19): hp 600 → 2,850 (the
 * fight lasted 30–50 s on the late-game ship, so the Fury and the Last Stand passed in seconds; now 2–2.5 minutes,
 * a third of the bar a phase) and the Hunt's head every 3rd → every 2nd attack (with 900 hp a phase, every 3rd
 * attack made the Hunt alone last over a minute).
 */
export const KRAKEN = {
  name: 'THE KRAKEN',
  hp: 2850,
  notches: [1900, 950], // the phase lines on the bar (phase 2 from 1900, phase 3 from 950), a third of it each
  pearl: 1000, // gold, paid when the Pearl is taken (main adds it to state.gold)
  dread: 4, // s of dread before the rise (main's)
  rise: 6, // s: the rise, skippable
  shortRise: 3, // s: the rise again after "Try again from the Kraken"
  riseAhead: 40, // u ahead of you the eye opens
  boil: 30, // u: the ring of bubbles round you at the rise
  firstAttack: 3, // s after the rise before the first attack may start
  minWarn: 1.5, // s: no warning is ever shorter (kid rule)
  whip: 0.85, // s: a landing tentacle's slam before it sways
  sway: 4, // s from the slam: a target, then it sinks
  sink: 0.5, // s
  recoil: 0.6, // s: a downed (or cut) tentacle's recoil, then it is gone
  maxUp: 4, // tentacles up at once, counting slamming, swaying, grabbing, recoiling and sinking ones
  grabRest: 8, // s after any release with no grab
  restGap: 8, // u: the first rings after a release land at least this far from your hull
  grab: { dps: 2, max: 4, stand: 2.9 }, // hp/s (main applies it), at most s, u from the hull it stands
  cutOff: { idle: 12, ahead: 30, edge: 20 }, // no attack for idle s (phases 1–2): one 30 u ahead of your bow
  edge: 20, // u: everything stays inside worldRadius − edge
  // u of open water round an attack spot, the head, the shadow and the Pearl; body: how far a tentacle's ring
  // keeps from the head's centre (its hit sphere, r 6, + the ring, r 4), and the head from any tentacle; sight:
  // how far the last stand's other rings keep from the line from your ship to its eye (no tentacle hides it)
  clear: { spot: 6, head: 10, shadow: 6, pearl: 4, body: 10, sight: 5 },
  lurk: 11, // u: close in (inside the 14 u trigger) the shadow circles you at this range, beside your ship
  orbit: 0.5, // × its chase speed while it circles
  turn: { shadow: 2.2, head: 1.6, tentacle: 2.5 }, // rad/s
  head: { rise: 1, sink: 1 }, // s: the head surfacing and going under
  parts: {
    shadow: { r: 9 },
    head: { r: 6, y: 3, mul: 1 },
    eye: { r: 2.5, ahead: 5.2, y: 4.1, mul: 1.5 }, // between the eyes, at the front of the head
    tentacle: { r: 1.4, y0: 0, y1: 9, mul: 1, hp: 30 },
  },
  phases: [
    { from: 2850, chase: 8, trigger: 14, count: 2, every: 8, spread: 6, warn: 1.8, slam: 12, grab: false, head: { every: 2, up: 7, off: 20 } },
    { from: 1900, chase: 9.5, trigger: 14, count: 3, every: 7, spread: 6, warn: 1.6, slam: 12, grab: true, head: { every: 2, up: 7, off: 20 }, ink: 12, inkFirst: 6 },
    { from: 950, chase: 0, trigger: Infinity, count: 4, every: 6, spread: 6, reach: 40, near: 10, warn: 1.5, slam: 12, grab: true, head: { always: true, off: 25, glow: [4, 8] }, pull: { speed: 2, reach: 50, min: 18 } },
  ],
  ring: 4, // u: a tentacle's warning ring
  specials: { chase: 0.5, warn: 0.5, sneeze: true }, // the Kraken's own frost and stink effects (§5.7.5)
  announceGap: 3, // s between warnings in #game-live (§5.7.4)
  gone: { surface: 0.6, sink: 2, pearlRise: 1.5, drift: 4, driftSpeed: 6, driftAccel: 4, reach: 3 }, // the Pearl drifts to you, faster and faster
  // its sounds (audio.js SFX_NAMES); the warning's rising tone is audio.js's `tentacle` (§5.7.3), told how long the
  // warning lasts (sfx's 4th argument, { duration }, an addition) so its surge comes with the slam
  sfx: { rise: 'krakenRise', warn: 'tentacle', slam: 'slam', splash: 'splash', grab: 'grab', cut: 'cut', free: 'splash', sneeze: 'sneeze', ink: 'ink', gone: 'gurgle', pearl: 'coin' },
  words: {
    tentacle: 'TENTACLE!',
    ink: 'INK!',
    slam: 'SLAM!',
    grabbed: 'GRABBED!',
    free: 'FREE!',
    ouch: 'OUCH!',
    bullseye: 'BULLSEYE!',
    crit: 'CRIT!',
    achoo: 'ACHOO!',
    splat: 'SPLAT!',
    pegs: 'Clothes-pegs!',
    fire: 'ON FIRE!',
    frost: 'FROZEN!',
    kaboom: 'KA-BOOM!',
    fireOut: 'FIRE OUT! SSSS!',
    pearl: (gold) => `+${fmt(gold)} THE KRAKEN'S PEARL`,
    phases: ['The Hunt', 'The Fury', 'The Last Stand'],
    strip: 'GRABBED! Hold G to cut it loose', // #grab-strip (keys)
    stripTouch: 'GRABBED! Hold CUT! to cut it loose', // #grab-strip (touch: the Board button reads CUT!)
    cutButton: 'CUT!',
    noBoard: "You can't board a sea monster!",
    banner: { rise: 'THE KRAKEN RISES!', how: 'Shoot its tentacles and its big eye!', howStink: ' Stink shot makes it let go!', off: 'THE KRAKEN IS DRIVEN OFF!' },
    live: {
      tentacle: 'Tentacle! Steer away.',
      ink: 'Ink! Steer away.',
      grab: 'The Kraken grabbed you! Hold G, or CUT!, to cut it loose.',
      free: 'You are free!',
      sneeze: 'ACHOO! The Kraken sneezed and let go.',
      fury: 'The Kraken is furious!',
      last: 'The Kraken makes its last stand! Shoot its big eye!',
      off: 'The Kraken is driven off!',
      pearl: (gold) => `The Kraken's Pearl! ${fmt(gold)} gold.`,
    },
  },
};

// Today's numbers of the tables main passes in ctx.tables, used only when a table (or a number) is missing.
const STATUS0 = { fire: { dps: 3, boss: 3 }, frost: { time: 5, add: 2, max: 8, bossMul: 0.5 }, stink: { boss: 2, bossImmune: 20 }, kaboom: { burst: 15 } };
const INK0 = { radius: 4, damage: 8, warn: 1.8 };
const RAIDERS0 = { cutTaps: 3, cutHold: 0.8 };

const EPS = 1e-9;
const TAU = Math.PI * 2;
const UP_STATES = ['slam', 'sway', 'grab', 'recoil', 'sink'];
const LIVE_STATES = ['warn', 'slam', 'sway', 'grab']; // coming up or up (not leaving)
const NO_MODS = Object.freeze({ speedMul: 1, turnMul: 1, dps: 0, vx: 0, vz: 0 });

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

export function createKraken(ctx) {
  const P0 = KRAKEN.parts;
  const fallbackRng = mulberry32(0x6b72616b);

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
  const ink = {
    radius: () => clamp(table('INK', ['radius'], INK0.radius), 0.5, 20),
    damage: () => Math.max(0, table('INK', ['damage'], INK0.damage)),
    warn: () => table('INK', ['warn'], INK0.warn),
  };
  const cutTaps = () => Math.max(1, Math.round(table('RAIDERS', ['cutTaps'], RAIDERS0.cutTaps)));
  const cutHoldT = () => Math.max(0.05, table('RAIDERS', ['cutHold'], RAIDERS0.cutHold));
  function word(key) {
    const w = prop(prop(prop(ctx, 'tables'), 'WORDS3'), key);
    return typeof w === 'string' && w ? w : KRAKEN.words[key];
  }
  function world() {
    const w = prop(ctx, 'world');
    const r = num(prop(w, 'r'), 140);
    return { x: num(prop(w, 'x'), 0), z: num(prop(w, 'z'), 0), r: r > 0 ? r : 140 };
  }
  function readPlayer() {
    const p = call('player');
    if (!p || typeof p !== 'object') return null;
    const x = num(prop(p, 'x'), NaN);
    const z = num(prop(p, 'z'), NaN);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    return {
      x,
      z,
      h: num(prop(p, 'h'), 0),
      speed: Math.max(0, num(prop(p, 'speed'), 0)),
      len: clamp(num(prop(p, 'len'), 10), 0, 40),
      wid: clamp(num(prop(p, 'wid'), 3.6), 0, 20),
    };
  }
  const isLand = (x, z, r) => call('land', x, z, r) === true;
  function inWorld(x, z, edge = KRAKEN.edge) {
    const w = world();
    return Math.hypot(x - w.x, z - w.z) <= Math.max(0, w.r - edge) + EPS;
  }
  function intoWorld(x, z) {
    const w = world();
    const lim = Math.max(0, w.r - KRAKEN.edge);
    const d = Math.hypot(x - w.x, z - w.z);
    if (d <= lim) return { x, z };
    const k = (lim - 0.01) / d;
    return { x: w.x + (x - w.x) * k, z: w.z + (z - w.z) * k };
  }
  const openAt = (x, z, clear) => inWorld(x, z) && !isLand(x, z, clear);
  // The nearest point to (x, z) where ok() holds, searched outward ring by ring (deterministic, no rolls).
  function nearest(x, z, ok) {
    const s = intoWorld(x, z);
    if (ok(s.x, s.z)) return s;
    for (let d = 1.5; d <= 90; d += 1.5) {
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
  function openSpot(x, z, clear) {
    return nearest(x, z, (px, pz) => openAt(px, pz, clear)) || intoWorld(x, z);
  }
  // A spot about d u from you where ok() holds (open water): on bearing b first, then swinging either way in 15°
  // steps up to 90°, then a little further out. So the head never surfaces on land, nor (as the nearest open
  // water to a spot on land could) right against your hull. null when that half circle has none.
  function spotAround(p, b, d, ok) {
    for (const dd of [0, 4, 8]) {
      for (let j = 0; j <= 12; j++) {
        const a = b + Math.ceil(j / 2) * (j % 2 ? 1 : -1) * (Math.PI / 12);
        const x = p.x + Math.sin(a) * (d + dd);
        const z = p.z + Math.cos(a) * (d + dd);
        if (ok(x, z)) return { x, z };
      }
    }
    return null;
  }
  // The player's hull as its centre line (bow to stern); a ring "covers" the hull when the line comes within r.
  function hullDist(p, x, z) {
    const fx = Math.sin(p.h);
    const fz = Math.cos(p.h);
    const half = p.len / 2;
    const along = clamp((x - p.x) * fx + (z - p.z) * fz, -half, half);
    return Math.hypot(x - (p.x + fx * along), z - (p.z + fz * along));
  }
  function hullPoint(p, x, z) {
    const fx = Math.sin(p.h);
    const fz = Math.cos(p.h);
    const half = p.len / 2;
    const along = clamp((x - p.x) * fx + (z - p.z) * fz, -half, half);
    return { x: p.x + fx * along, z: p.z + fz * along };
  }
  function predict(p, T) {
    return { x: p.x + Math.sin(p.h) * p.speed * T, z: p.z + Math.cos(p.h) * p.speed * T };
  }

  // ---------------------------------------------------------------- state
  let disposed = false;
  let mode = 'idle'; // 'idle' | 'rise' | 'fight' | 'gone'
  let clock = 0; // simulated s since createKraken
  let hp = KRAKEN.hp;
  let phase = 0;
  let short = false;
  let riseT = 0;
  let riseDur = KRAKEN.rise;
  let riseSpot = null;
  let boilAt = null;
  let fightT = 0;
  let phaseT = 0;
  const shadow = { x: 0, z: 0, h: 0, diveAt: -Infinity, side: 0, orbit: 0 };
  let head = null; // { x, z, h, state: 'rise' | 'up' | 'sink' | 'gone', t, up, k0, hurt, sneeze }
  let tentacles = []; // { id, attack, i, x, z, rx, rz, h, state: 'warn' | 'slam' | 'sway' | 'grab' | 'recoil' | 'sink', t, T, r, grab, hp, landedAt }
  let inks = []; // { x, z, r, t, T }
  let tentIds = 0;
  let attacks = 0;
  let phaseAttacks = 0;
  let sinceAttack = 0;
  let inkClock = 0;
  let grab = null; // { id, t, taps, hold, holding }
  let lastRelease = -Infinity;
  let restNext = false; // the next attack keeps its rings restGap from the hull (a release happened)
  let st = { id: null, t: 0, max: 0, pegs: 0 }; // the Kraken's status (a boss's, §5.7.5); pegs: clothes-pegs left
  let burnPart = null;
  let lastWarnLive = -Infinity;
  let goneT = 0;
  let pearl = null; // { x, z, t, got }
  let over = false;
  let log = { slams: 0, grabs: 0, releases: 0, inks: 0, cutOffs: 0, sneezes: 0 };
  const dmgBy = { eye: 0, head: 0, tentacle: 0, burn: 0, burst: 0 }; // what took the bar down (state: the balance bots read it)

  const row = () => KRAKEN.phases[clamp(phase, 1, 3) - 1];
  const fighting = () => !disposed && mode === 'fight';
  const phaseOf = (v) => (v > KRAKEN.notches[0] ? 1 : v > KRAKEN.notches[1] ? 2 : 3);
  const frozen = () => st.id === 'frost' && st.t > EPS;
  const sneezing = () => st.id === 'stink' && st.t > EPS;
  const isUp = (t) => UP_STATES.includes(t.state);
  const upCount = () => tentacles.reduce((n, t) => n + (isUp(t) ? 1 : 0), 0);
  function warnTime(base) {
    const bonus = Math.max(0, num(call('warnBonus'), 0));
    return Math.max(KRAKEN.minWarn, num(base, KRAKEN.minWarn) + bonus + (frozen() ? KRAKEN.specials.warn : 0));
  }
  function headK() {
    if (!head) return 0;
    if (head.state === 'rise') return smooth(head.t / KRAKEN.head.rise);
    if (head.state === 'up') return 1;
    if (head.state === 'sink') return head.k0 * (1 - smooth(head.t / KRAKEN.head.sink));
    if (head.state === 'gone') {
      const G = KRAKEN.gone;
      if (head.t < G.surface) return Math.max(head.k0, smooth(head.t / G.surface));
      return 1 - smooth((head.t - G.surface) / G.sink);
    }
    return 0;
  }
  const headUp = () => fighting() && !!head && (head.state === 'up' || (head.state === 'rise' && headK() >= 0.75));
  function eyeAt() {
    const E = P0.eye;
    return { x: head.x + Math.sin(head.h) * E.ahead, y: E.y, z: head.z + Math.cos(head.h) * E.ahead };
  }
  function pop(text, x, y, z, style = 'kraken') {
    if (text) call('pop', text, x, y, z, style);
  }
  const sfx = (key, x, z, o) => (o ? call('sfx', KRAKEN.sfx[key], x, z, o) : call('sfx', KRAKEN.sfx[key], x, z));
  const announce = (text) => {
    if (text) call('announce', text);
  };
  function warnLive(text) {
    if (clock - lastWarnLive < KRAKEN.announceGap - EPS) return;
    lastWarnLive = clock;
    announce(text);
  }

  // ---------------------------------------------------------------- the rise and the phases
  function startFight() {
    mode = 'fight';
    fightT = 0;
    sinceAttack = 0;
    attacks = 0;
    phaseAttacks = 0;
    const p = readPlayer();
    const s = riseSpot || (p ? { x: p.x, z: p.z } : { x: world().x, z: world().z });
    shadow.x = s.x;
    shadow.z = s.z;
    shadow.h = p ? bearing(s.x, s.z, p.x, p.z) : 0;
    shadow.diveAt = clock;
    head = null;
    phase = 0;
    enterPhase(phaseOf(hp), false);
  }

  function enterPhase(n, say = true) {
    if (n === phase) return;
    const was = phase;
    phase = n;
    phaseT = 0;
    phaseAttacks = 0;
    const P = row();
    if (P.ink) inkClock = num(P.inkFirst, P.ink);
    inks = phase === 2 ? inks : [];
    if (phase === 3) {
      // the head surfaces 25 u off your beam and stays up (one that is up already goes under first and
      // surfaces there when it is down: stepHead)
      if (!head) surfaceHead(P.head.off, Infinity);
      else sinkHead();
    } else if (head && head.up === Infinity) {
      sinkHead();
    }
    if (say && was) announce(phase === 2 ? KRAKEN.words.live.fury : phase === 3 ? KRAKEN.words.live.last : '');
  }

  function hurt(dmg, src) {
    if (!fighting() || !(dmg > 0)) return;
    if (src in dmgBy) dmgBy[src] += Math.min(dmg, hp);
    hp = Math.max(0, hp - dmg);
    if (hp <= EPS) {
      hp = 0;
      return goOff();
    }
    const n = phaseOf(hp);
    if (n > phase) enterPhase(n);
  }

  // Driven off (§5.7.1 step 5): everything goes under, the head surfaces once more and sinks sulking, then the
  // Pearl bobs up where it went down.
  function goOff() {
    mode = 'gone';
    goneT = 0;
    inks = [];
    for (const t of tentacles) {
      if (t.state === 'warn') t.dead = true;
      else if (t.state !== 'sink' && t.state !== 'recoil') {
        t.state = 'sink';
        t.t = 0;
      }
    }
    tentacles = tentacles.filter((t) => !t.dead);
    if (grab) {
      grab = null;
      lastRelease = clock;
    }
    st = { id: null, t: 0, max: 0, pegs: 0 };
    burnPart = null;
    const k0 = headK();
    const at = head ? { x: head.x, z: head.z, h: head.h } : { x: shadow.x, z: shadow.z, h: shadow.h };
    head = { ...at, state: 'gone', t: 0, up: 0, k0, hurt: 1, sneeze: 0 };
    sfx('gone', at.x, at.z);
    announce(KRAKEN.words.live.off);
  }

  // The head surfaces `off` u off your beam (the side the shadow is on), in open water, for `up` s. (Land
  // there: as near your beam as there is open water at that range, either side.)
  function surfaceHead(off, up) {
    const p = readPlayer();
    const C = KRAKEN.clear.head;
    let x = shadow.x;
    let z = shadow.z;
    let s = null;
    if (p) {
      const sx = -Math.cos(p.h);
      const sz = Math.sin(p.h);
      const lat = (shadow.x - p.x) * sx + (shadow.z - p.z) * sz;
      const side = Math.abs(lat) > 0.5 ? Math.sign(lat) : rand() < 0.5 ? -1 : 1;
      x = p.x + sx * side * off;
      z = p.z + sz * side * off;
      const b = Math.atan2(sx * side, sz * side);
      // (clear of the tentacles that are up or coming up, when there is room: it never surfaces on one)
      const open = (px, pz) => openAt(px, pz, C);
      const free = (px, pz) => open(px, pz) && tentacles.every((t) => !LIVE_STATES.includes(t.state) || Math.hypot(t.x - px, t.z - pz) >= KRAKEN.clear.body - EPS);
      s = spotAround(p, b, off, free) || spotAround(p, b + Math.PI, off, free) || spotAround(p, b, off, open) || spotAround(p, b + Math.PI, off, open);
    }
    s = s || openSpot(x, z, C);
    const h = p ? bearing(s.x, s.z, p.x, p.z) : shadow.h;
    head = { x: s.x, z: s.z, h, state: 'rise', t: 0, up, k0: 0, hurt: 0, sneeze: 0 };
    shadow.x = s.x;
    shadow.z = s.z;
  }
  function sinkHead() {
    if (!head || head.state === 'sink' || head.state === 'gone') return;
    head.k0 = headK();
    head.state = 'sink';
    head.t = 0;
  }

  // ---------------------------------------------------------------- attacks
  function startAttack(cut) {
    const p = readPlayer();
    if (!p) return;
    const P = row();
    const W = warnTime(P.warn);
    attacks++;
    phaseAttacks++;
    sinceAttack = 0;
    const rest = restNext || !!grab;
    restNext = false;
    let c;
    if (cut) {
      // the cut-off: it dives and surfaces 30 u ahead of your bow (open water) and attacks there
      const C = KRAKEN.cutOff;
      c = openSpot(p.x + Math.sin(p.h) * C.ahead, p.z + Math.cos(p.h) * C.ahead, KRAKEN.clear.spot);
      if (head && phase < 3) {
        sinkHead();
        head.dived = true; // (the shadow is already off to the cut-off spot)
      }
      shadow.x = c.x;
      shadow.z = c.z;
      shadow.h = bearing(c.x, c.z, p.x, p.z);
      shadow.diveAt = clock;
      log.cutOffs++;
    } else {
      c = predict(p, W);
    }
    const canGrab = P.grab && !grab && !rest && clock + W - lastRelease >= KRAKEN.grabRest - EPS;
    const placed = [];
    for (let i = 0; i < P.count; i++) {
      const s = pickSpot(i, c, P, p, rest, placed);
      placed.push(s);
      tentacles.push({
        id: `t${++tentIds}`,
        attack: attacks,
        i,
        x: s.x,
        z: s.z,
        rx: s.x, // the ring's centre (where it slams; x, z move beside your hull when it lands on it)
        rz: s.z,
        h: bearing(s.x, s.z, p.x, p.z),
        state: 'warn',
        t: 0,
        T: W,
        r: KRAKEN.ring,
        grab: i === 0 && canGrab,
        hp: P0.tentacle.hp,
        landedAt: null,
      });
    }
    // the head: every Nth attack in phases 1–2 (the last stand's is always up)
    const H = P.head;
    if (phase < 3 && H.every && phaseAttacks % H.every === 0 && !head) surfaceHead(H.off, H.up);
    const f = placed[0];
    if (f) {
      pop(KRAKEN.words.tentacle, f.x, 2.5, f.z);
      sfx('warn', f.x, f.z, { duration: W });
    }
    warnLive(KRAKEN.words.live.tentacle);
  }

  // A ring at (x, z) keeps off the head's body (KRAKEN.clear.body from its centre) while there is a head.
  function offHead(x, z) {
    return !head || head.state === 'gone' || Math.hypot(x - head.x, z - head.z) >= KRAKEN.clear.body - EPS;
  }
  // A ring at (x, z) keeps out of the line from your ship to the eye (KRAKEN.clear.sight), while the head is
  // up or coming up: the weak spot stays in view and in reach of your guns.
  function offSight(p, x, z) {
    if (!head || head.state === 'sink' || head.state === 'gone') return true;
    const e = eyeAt();
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const L2 = dx * dx + dz * dz;
    if (L2 < 1e-9) return true;
    const u = clamp(((x - p.x) * dx + (z - p.z) * dz) / L2, 0, 1);
    return Math.hypot(x - (p.x + dx * u), z - (p.z + dz * u)) >= KRAKEN.clear.sight - EPS;
  }

  // Where tentacle i of an attack rises: round the predicted spot ±spread (the last stand's others anywhere
  // within reach of you, but never in the line from your ship to its eye), in open water, inside the world,
  // off the head, apart from the attack's other rings, and after a release at least restGap from your hull.
  function pickSpot(i, c, P, p, rest, placed) {
    const R = KRAKEN.ring;
    const gap = KRAKEN.restGap;
    const wide = P.reach && i > 0;
    const okBase = (x, z) => openAt(x, z, KRAKEN.clear.spot) && (!rest || hullDist(p, x, z) >= gap + EPS);
    const okClear = (x, z) => okBase(x, z) && offHead(x, z) && (!wide || offSight(p, x, z));
    const okAll = (x, z) => okClear(x, z) && placed.every((q) => Math.hypot(q.x - x, q.z - z) >= 2 * R - EPS);
    let first = null;
    for (let k = 0; k < 6; k++) {
      let x;
      let z;
      const a = rand() * TAU;
      if (wide) {
        const near = num(P.near, 0);
        const d = Math.sqrt(near * near + (P.reach * P.reach - near * near) * rand());
        x = p.x + Math.sin(a) * d;
        z = p.z + Math.cos(a) * d;
      } else {
        const d = P.spread * Math.sqrt(rand());
        x = c.x + Math.sin(a) * d;
        z = c.z + Math.cos(a) * d;
      }
      if (!first) first = { x, z };
      if (okAll(x, z)) return { x, z };
    }
    return nearest(first.x, first.z, okAll) || nearest(first.x, first.z, okClear) || nearest(first.x, first.z, okBase) || openSpot(first.x, first.z, KRAKEN.clear.spot);
  }

  function spitInk() {
    const p = readPlayer();
    if (!p) return;
    const T = warnTime(ink.warn());
    const r = ink.radius();
    // ahead of your bow where it will be when the blob lands
    const q = predict(p, T);
    const x = q.x + Math.sin(p.h) * (p.len / 2);
    const z = q.z + Math.cos(p.h) * (p.len / 2);
    const rest = restNext || !!grab;
    const ok = (px, pz) => openAt(px, pz, KRAKEN.clear.spot) && (!rest || hullDist(p, px, pz) >= KRAKEN.restGap + EPS);
    const s = nearest(x, z, ok) || openSpot(x, z, KRAKEN.clear.spot);
    // (spat from the head when it is up, else from the shadow: krakenView can lob the blob from there)
    const from = head || shadow;
    inks.push({ x: s.x, z: s.z, r, t: 0, T, fx: from.x, fz: from.z });
    log.inks++;
    sfx('ink', from.x, from.z);
    pop(KRAKEN.words.ink, s.x, 2.5, s.z);
    warnLive(KRAKEN.words.live.ink);
  }

  // Move a tentacle to stand KRAKEN.grab.stand beside the hull (on its own side of it, or the other side when
  // that is land or off the map). Returns the point of the hull's centre line it stands by.
  function besideHull(t, p) {
    const q = hullPoint(p, t.x, t.z);
    let dx = t.x - q.x;
    let dz = t.z - q.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) {
      dx = -Math.cos(p.h);
      dz = Math.sin(p.h);
    } else {
      dx /= d;
      dz /= d;
    }
    const S = KRAKEN.grab.stand;
    if (!openAt(q.x + dx * S, q.z + dz * S, P0.tentacle.r) && openAt(q.x - dx * S, q.z - dz * S, P0.tentacle.r)) {
      dx = -dx;
      dz = -dz;
    }
    t.x = q.x + dx * S;
    t.z = q.z + dz * S;
    return q;
  }

  // A tentacle lands: the oldest goes under first if a fifth would be up, then it grabs (a red ring, your hull
  // inside it, no grab for grabRest s after a release) or slams (12 inside the ring) or just rises.
  function land(t) {
    while (upCount() >= KRAKEN.maxUp) {
      const ups = tentacles.filter(isUp);
      ups.sort((a, b) => (a.state === 'grab') - (b.state === 'grab') || a.landedAt - b.landedAt);
      retire(ups[0]);
    }
    const p = readPlayer();
    t.landedAt = clock;
    t.state = 'slam';
    t.t = 0;
    sfx('slam', t.x, t.z);
    if (!p) return;
    const inside = hullDist(p, t.rx, t.rz) <= t.r + EPS;
    if (t.grab && inside && !grab && clock - lastRelease >= KRAKEN.grabRest - EPS) {
      // it curls round your hull: it stands beside the point of the hull it holds
      const q = besideHull(t, p);
      t.tx = q.x;
      t.tz = q.z;
      t.h = bearing(t.x, t.z, q.x, q.z);
      t.state = 'grab';
      grab = { id: t.id, t: 0, taps: 0, hold: 0, holding: false };
      log.grabs++;
      pop(KRAKEN.words.grabbed, p.x, 3, p.z);
      sfx('grab', p.x, p.z);
      announce(KRAKEN.words.live.grab);
      return;
    }
    if (inside) {
      // it slams down across your deck from beside the hull (not up through it)
      if (hullDist(p, t.x, t.z) < KRAKEN.grab.stand) besideHull(t, p);
      log.slams++;
      call('damage', row().slam, t.rx, t.rz, 'slam');
      pop(KRAKEN.words.slam, t.rx, 3, t.rz);
    }
  }

  function retire(t) {
    if (!t) return;
    if (grab && grab.id === t.id) release('retire');
    tentacles = tentacles.filter((x) => x !== t);
  }

  function release(how) {
    if (!grab) return;
    const t = tentacles.find((x) => x.id === grab.id);
    grab = null;
    lastRelease = clock;
    restNext = true;
    log.releases++;
    if (t) {
      t.state = how === 'hit' || how === 'cut' ? 'recoil' : 'sink';
      t.t = 0;
    }
    const p = readPlayer();
    if (p) {
      if (how === 'cut' || how === 'time') pop(KRAKEN.words.free, p.x, 3, p.z);
      sfx(how === 'cut' ? 'cut' : 'free', p.x, p.z);
    }
    if (how !== 'stink') announce(KRAKEN.words.live.free);
  }

  // ---------------------------------------------------------------- the step
  // The Kraken's status (a boss's): fire burns the bar, frost and stink run out, clothes-pegs wear off while
  // it isn't stinky.
  function stepStatus(dt) {
    if (st.id === 'fire') hurt(status.fireDps() * Math.min(dt, Math.max(0, st.t)), 'burn');
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

  function stepTentacles(dt, p) {
    const landing = [];
    for (const t of tentacles) {
      t.t += dt;
      switch (t.state) {
        case 'warn':
          if (t.t >= t.T - EPS) landing.push(t);
          break;
        case 'slam':
          if (t.t >= KRAKEN.whip - EPS) {
            t.state = 'sway';
            t.t -= KRAKEN.whip;
          }
          break;
        case 'sway':
          if (clock - t.landedAt >= KRAKEN.sway - EPS) {
            t.state = 'sink';
            t.t = 0;
          }
          break;
        case 'recoil':
          if (t.t >= KRAKEN.recoil - EPS) t.dead = true;
          break;
        case 'sink':
          if (t.t >= KRAKEN.sink - EPS) t.dead = true;
          break;
        default:
          break;
      }
      // swaying tentacles lean toward you
      if (p && (t.state === 'sway' || t.state === 'slam')) t.h = turnToward(t.h, bearing(t.x, t.z, p.x, p.z), KRAKEN.turn.tentacle * dt);
      if (p && t.state === 'grab') {
        const q = hullPoint(p, t.x, t.z);
        t.tx = q.x;
        t.tz = q.z;
      }
    }
    tentacles = tentacles.filter((t) => !t.dead);
    landing.sort((a, b) => a.attack - b.attack || a.i - b.i);
    for (const t of landing) if (fighting() && tentacles.includes(t)) land(t);
  }

  function stepGrab(dt) {
    if (!grab) return;
    grab.t += dt;
    if (grab.holding) {
      grab.hold += dt;
      if (grab.hold >= cutHoldT() - EPS) return release('cut');
    }
    if (grab.t >= KRAKEN.grab.max - EPS) release('time');
  }

  function stepInk(dt, p) {
    for (const b of inks) {
      b.t += dt;
      if (b.t >= b.T - EPS) {
        b.done = true;
        if (p && hullDist(p, b.x, b.z) <= b.r + EPS) {
          call('damage', ink.damage(), b.x, b.z, 'ink');
          pop(KRAKEN.words.splat, b.x, 3, b.z);
        }
        sfx('splash', b.x, b.z);
        call('inkSlick', b.x, b.z);
      }
    }
    inks = inks.filter((b) => !b.done);
    const P = row();
    if (!P.ink || sneezing()) return;
    inkClock -= dt;
    if (inkClock <= EPS) {
      inkClock += P.ink;
      spitInk();
    }
  }

  function stepHead(dt, p) {
    if (!head) return;
    head.t += dt;
    head.hurt = Math.max(0, head.hurt - dt / 0.6);
    head.sneeze = sneezing() ? Math.min(1, head.sneeze + dt / 0.25) : Math.max(0, head.sneeze - dt / 0.4);
    if (p) head.h = turnToward(head.h, bearing(head.x, head.z, p.x, p.z), KRAKEN.turn.head * dt);
    if (head.state === 'rise' && head.t >= KRAKEN.head.rise - EPS) {
      head.state = 'up';
      head.t = 0;
    } else if (head.state === 'up' && head.t >= head.up - EPS) {
      sinkHead();
    } else if (head.state === 'sink' && head.t >= KRAKEN.head.sink - EPS) {
      if (!head.dived) {
        shadow.x = head.x;
        shadow.z = head.z;
        shadow.h = head.h;
      }
      head = null;
      // the last stand: a head that was up when it began went under first; now it surfaces 25 u off your beam
      if (phase === 3) surfaceHead(row().head.off, Infinity);
    }
  }

  // The shadow chases you (phases 1–2) round land, inside the world; close in it circles you at lurk range
  // (beside your ship, where you can see it). It waits while the head is up.
  function stepShadow(dt, p) {
    if (!p || head) return;
    const P = row();
    let speed = P.chase * (frozen() ? KRAKEN.specials.chase : 1);
    if (!(speed > 0)) return;
    const d = Math.hypot(p.x - shadow.x, p.z - shadow.z);
    let want = bearing(shadow.x, shadow.z, p.x, p.z);
    let room = d - KRAKEN.lurk;
    if (d < KRAKEN.lurk + 2 && d > 1e-6) {
      // round you along the lurk circle (the way it is already going), easing back onto it
      if (!shadow.orbit) {
        const lat = (shadow.x - p.x) * -Math.cos(p.h) + (shadow.z - p.z) * Math.sin(p.h);
        shadow.orbit = lat >= 0 ? 1 : -1;
      }
      const ox = (shadow.x - p.x) / d;
      const oz = (shadow.z - p.z) / d;
      const pull = clamp((d - KRAKEN.lurk) / 2, -1, 1);
      want = Math.atan2(-oz * shadow.orbit - ox * pull, ox * shadow.orbit - oz * pull);
      room = Infinity;
      speed *= KRAKEN.orbit;
    } else if (d > KRAKEN.lurk + 6) shadow.orbit = 0;
    if (room <= 1e-6) return;
    const step = Math.min(speed * dt, room);
    const C = KRAKEN.clear.shadow;
    if (!openAt(shadow.x, shadow.z, C)) {
      // (somehow over land or off the map: swim straight out toward you, back inside the world)
      const s = intoWorld(shadow.x + Math.sin(want) * step, shadow.z + Math.cos(want) * step);
      shadow.x = s.x;
      shadow.z = s.z;
      shadow.h = turnToward(shadow.h, want, KRAKEN.turn.shadow * dt);
      return;
    }
    const tries = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.1, -2.1];
    if (shadow.side) tries.sort((a, b) => Math.abs(a) - Math.abs(b) || Math.sign(b) * shadow.side - Math.sign(a) * shadow.side);
    for (const da of tries) {
      const h = want + da;
      const nx = shadow.x + Math.sin(h) * step;
      const nz = shadow.z + Math.cos(h) * step;
      if (openAt(nx, nz, C)) {
        shadow.x = nx;
        shadow.z = nz;
        shadow.h = turnToward(shadow.h, h, KRAKEN.turn.shadow * dt);
        shadow.side = da ? Math.sign(da) : shadow.side;
        return;
      }
    }
    if (shadow.orbit) shadow.orbit = -shadow.orbit; // (land in the way of its circle: go round the other way)
  }

  function stepAttacks(dt, p) {
    sinceAttack += dt;
    if (!p || sneezing()) return;
    const P = row();
    const ready = sinceAttack >= (attacks === 0 ? KRAKEN.firstAttack : P.every) - EPS;
    if (phase === 3) {
      if (ready) startAttack(false);
      return;
    }
    const near = !head && Math.hypot(p.x - shadow.x, p.z - shadow.z) <= P.trigger + EPS;
    if (ready && near) startAttack(false);
    else if (sinceAttack >= KRAKEN.cutOff.idle - EPS) startAttack(true);
  }

  function stepGone(dt, p) {
    goneT += dt;
    for (const t of tentacles) t.t += dt;
    tentacles = tentacles.filter((t) => t.t < (t.state === 'recoil' ? KRAKEN.recoil : KRAKEN.sink) - EPS);
    const G = KRAKEN.gone;
    if (head) {
      head.t += dt;
      head.hurt = 1;
      if (head.t >= G.surface + G.sink - EPS) {
        pearl = { x: head.x, z: head.z, t: 0, got: false };
        head = null;
      }
    }
    if (!pearl || pearl.got) return;
    pearl.t += dt;
    if (!p) return;
    const drifting = pearl.t - (G.pearlRise + G.drift);
    if (drifting >= -EPS) {
      // (it speeds up as it goes, so it catches even a ship sailing away at full speed)
      const d = Math.hypot(p.x - pearl.x, p.z - pearl.z);
      const s = Math.min(d, (G.driftSpeed + G.driftAccel * Math.max(0, drifting)) * dt);
      if (d > 1e-6) {
        pearl.x += ((p.x - pearl.x) / d) * s;
        pearl.z += ((p.z - pearl.z) / d) * s;
      }
    }
    if (pearl.t >= G.pearlRise * 0.5 - EPS && hullDist(p, pearl.x, pearl.z) <= G.reach + EPS) {
      pearl.got = true;
      over = true;
      call('pearl', KRAKEN.pearl);
      pop(KRAKEN.words.pearl(KRAKEN.pearl), pearl.x, 3, pearl.z, 'gold');
      sfx('pearl', pearl.x, pearl.z);
      announce(KRAKEN.words.live.pearl(KRAKEN.pearl));
    }
  }

  function tick(dt) {
    clock += dt;
    if (mode === 'rise') {
      riseT += dt;
      if (riseT >= riseDur - EPS) startFight();
      return;
    }
    const p = readPlayer();
    if (mode === 'gone') return stepGone(dt, p);
    if (mode !== 'fight') return;
    fightT += dt;
    phaseT += dt;
    stepStatus(dt);
    if (!fighting()) return;
    stepTentacles(dt, p);
    if (!fighting()) return;
    stepGrab(dt);
    stepInk(dt, p);
    stepHead(dt, p);
    stepShadow(dt, p);
    stepAttacks(dt, p);
  }

  // ---------------------------------------------------------------- what main sees
  function partOf(id) {
    if (!fighting()) return null;
    if (id === 'eye' || id === 'head') return headUp() ? { kind: id } : null;
    const t = tentacles.find((x) => x.id === id);
    return t && (t.state === 'slam' || t.state === 'sway' || t.state === 'grab') && t.hp > 0 ? { kind: 'tentacle', t } : null;
  }
  function inEye(x, y, z) {
    const e = eyeAt();
    return Math.hypot(x - e.x, y - e.y, z - e.z) <= P0.eye.r + EPS;
  }

  function targets() {
    if (!fighting()) return [];
    const out = [];
    if (headUp()) {
      const e = eyeAt();
      out.push({ id: 'eye', kind: 'eye', x: e.x, z: e.z, r: P0.eye.r, y0: e.y - P0.eye.r, y1: e.y + P0.eye.r, hp });
      const H = P0.head;
      out.push({ id: 'head', kind: 'head', x: head.x, z: head.z, r: H.r, y0: H.y - H.r, y1: H.y + H.r, hp });
    }
    const T = P0.tentacle;
    for (const t of tentacles) {
      if (partOf(t.id)) out.push({ id: t.id, kind: 'tentacle', x: t.x, z: t.z, r: T.r, y0: T.y0, y1: T.y1, hp: t.hp > 0 ? t.hp : 0 });
    }
    return out;
  }

  function visuals() {
    const out = { shadow: null, head: null, eye: null, tentacles: [], rings: [], boil: null, pearl: null, rise: null, burn: null };
    if (disposed || mode === 'idle') return out;
    const p = readPlayer();
    const look = p ? { x: p.x, z: p.z } : null;
    if (mode === 'rise') {
      const u = clamp(riseT / riseDur, 0, 1);
      const s = riseSpot;
      const k = u < 0.8 ? 0.85 * smooth((u - 0.1) / 0.35) : 0.85 * (1 - smooth((u - 0.8) / 0.2));
      out.head = { x: s.x, z: s.z, h: s.h, k, hurt: 0, sneeze: 0 };
      const open = u < 0.8 ? smooth((u - 0.35) / 0.15) : 1 - smooth((u - 0.85) / 0.1);
      out.eye = { glow: open, open, one: true, look };
      const b = p || boilAt;
      if (b) out.boil = { x: b.x, z: b.z, r: KRAKEN.boil, k: smooth(u / 0.25) * (1 - smooth((u - 0.7) / 0.3)) };
      out.rise = { k: u, T: riseDur };
      return out;
    }
    const hk = headK();
    if (head) {
      out.head = { x: head.x, z: head.z, h: head.h, k: hk, hurt: head.hurt, sneeze: head.sneeze };
      let glow = 0.6;
      if (mode === 'gone') glow = 0.2 * (1 - clamp(goneT / 1, 0, 1));
      else if (phase === 3) {
        const [on, every] = row().head.glow;
        const c = phaseT % every;
        glow = 0.2 + 0.8 * clamp(Math.min(c / 0.5, (on - c) / 0.5), 0, 1);
      }
      out.eye = { glow, open: mode === 'gone' ? 0.3 : 1, one: false, look };
    }
    if (mode === 'fight' && hk < 1) {
      const fade = clamp((clock - shadow.diveAt) / 1, 0, 1);
      out.shadow = { x: shadow.x, z: shadow.z, h: shadow.h, k: (1 - hk) * fade };
    }
    for (const t of tentacles) {
      if (!isUp(t)) continue;
      const v = { id: t.id, x: t.x, z: t.z, h: t.h, t: t.t, state: t.state };
      if (t.state === 'grab') {
        v.tx = t.tx;
        v.tz = t.tz;
      }
      out.tentacles.push(v);
    }
    for (const t of tentacles) if (t.state === 'warn') out.rings.push({ x: t.x, z: t.z, r: t.r, t: t.t, T: t.T, grab: !!t.grab, kind: 'tentacle' });
    for (const b of inks) out.rings.push({ x: b.x, z: b.z, r: b.r, t: b.t, T: b.T, grab: false, kind: 'ink', from: { x: b.fx, z: b.fz } });
    if (mode === 'gone') {
      const G = KRAKEN.gone;
      if (head) out.boil = { x: head.x, z: head.z, r: 9, k: clamp(1 - (head.t - G.surface) / G.sink, 0, 1) };
      if (pearl && !pearl.got) out.pearl = { x: pearl.x, z: pearl.z, k: smooth(pearl.t / G.pearlRise), h: p ? bearing(pearl.x, pearl.z, p.x, p.z) : 0 };
    }
    if (st.id === 'fire') out.burn = { part: burnPart };
    return out;
  }

  function snapshot() {
    const round = (v) => Math.round(v * 1e6) / 1e6;
    return {
      mode,
      phase,
      hp: round(hp),
      maxHp: KRAKEN.hp,
      risen: mode !== 'idle',
      rising: mode === 'rise',
      grabbed: !!grab,
      done: mode === 'gone',
      over,
      short,
      time: round(clock),
      riseT: round(riseT),
      riseDur,
      fightT: round(fightT),
      phaseT: round(phaseT),
      shadow: { x: round(shadow.x), z: round(shadow.z), h: round(shadow.h), hidden: !!head },
      head: head ? { x: round(head.x), z: round(head.z), h: round(head.h), state: head.state, t: round(head.t), k: round(headK()), up: headUp() } : null,
      tentacles: tentacles.map((t) => ({ id: t.id, attack: t.attack, i: t.i, state: t.state, x: round(t.x), z: round(t.z), t: round(t.t), T: round(t.T), grab: !!t.grab, hp: round(t.hp) })),
      inks: inks.map((b) => ({ x: round(b.x), z: round(b.z), r: b.r, t: round(b.t), T: round(b.T) })),
      up: upCount(),
      status: { id: st.id, t: round(st.t), max: round(st.max), pegs: round(st.pegs), part: burnPart },
      attacks,
      phaseAttacks,
      sinceAttack: round(sinceAttack),
      inkClock: round(inkClock),
      lastRelease: Number.isFinite(lastRelease) ? round(lastRelease) : null,
      restNext,
      grab: grab ? { id: grab.id, t: round(grab.t), left: round(Math.max(0, KRAKEN.grab.max - grab.t)), taps: grab.taps, hold: round(grab.hold), holding: grab.holding } : null,
      cut: grab ? round(clamp(Math.max(grab.taps / cutTaps(), grab.hold / cutHoldT()), 0, 1)) : 0,
      pearl: pearl ? { x: round(pearl.x), z: round(pearl.z), t: round(pearl.t), got: pearl.got } : null,
      counts: { ...log },
      dmgBy: { ...dmgBy },
      disposed,
    };
  }

  // ---------------------------------------------------------------- the API
  return {
    rise(x, z, opts) {
      if (disposed || mode !== 'idle') return false;
      const p = readPlayer();
      let sx = num(x, NaN);
      let sz = num(z, NaN);
      let s = null;
      if (!Number.isFinite(sx) || !Number.isFinite(sz)) {
        // (no spot given: 40 u ahead of your bow, or as near ahead as there is open water at that range)
        if (!p) return false;
        sx = p.x + Math.sin(p.h) * KRAKEN.riseAhead;
        sz = p.z + Math.cos(p.h) * KRAKEN.riseAhead;
        s = spotAround(p, p.h, KRAKEN.riseAhead, (px, pz) => openAt(px, pz, KRAKEN.clear.head));
      }
      s = s || openSpot(sx, sz, KRAKEN.clear.head);
      short = !!prop(opts, 'short');
      riseDur = short ? KRAKEN.shortRise : KRAKEN.rise;
      riseT = 0;
      riseSpot = { x: s.x, z: s.z, h: p ? bearing(s.x, s.z, p.x, p.z) : 0 };
      boilAt = p ? { x: p.x, z: p.z } : { x: s.x, z: s.z };
      hp = KRAKEN.hp;
      mode = 'rise';
      sfx('rise', s.x, s.z);
      return true;
    },
    skip() {
      if (disposed || mode !== 'rise') return false;
      startFight();
      return true;
    },
    step(dt) {
      if (disposed || mode === 'idle') return;
      let left = num(dt, 0);
      if (!(left > 0)) return;
      left = Math.min(left, 1);
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
      if (part.kind === 'eye') return inEye(x, y, z);
      if (part.kind === 'head') {
        const H = P0.head;
        return Math.hypot(x - head.x, y - H.y, z - head.z) <= H.r + EPS && !inEye(x, y, z);
      }
      const T = P0.tentacle;
      const cy = clamp(y, T.y0, T.y1);
      return Math.hypot(x - part.t.x, y - cy, z - part.t.z) <= T.r + EPS;
    },
    hit(id, info) {
      const part = partOf(id);
      if (!part) return null;
      const base = Math.max(0, num(prop(info, 'dmg'), 0));
      const crit = prop(info, 'crit') === true;
      let w = null;
      let dmg;
      if (part.kind === 'tentacle') {
        const t = part.t;
        dmg = base * P0.tentacle.mul;
        t.hp = Math.max(0, t.hp - dmg);
        const grabbing = grab && grab.id === t.id;
        if (t.hp <= EPS || grabbing) {
          w = KRAKEN.words.ouch;
          if (grabbing) release('hit');
          t.state = 'recoil';
          t.t = 0;
        }
      } else {
        dmg = base * (part.kind === 'eye' ? P0.eye.mul : P0.head.mul);
        if (part.kind === 'eye') w = KRAKEN.words.bullseye;
        head.hurt = 1;
      }
      if (!w && crit) w = KRAKEN.words.crit;
      hurt(dmg, part.kind);
      return { dmg, word: w };
    },
    special(id, ammo) {
      if (!fighting()) return null;
      const where = head && headUp() ? head : shadow;
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
        // (frost on a stinky Kraken: FROZEN!, and its clothes-pegs start, §2.3)
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
        log.sneezes++;
        // ACHOO!: every raised tentacle snaps under (a grab lets go), the warnings are called off
        if (grab) release('stink');
        for (const t of tentacles) {
          if (t.state === 'warn') t.dead = true;
          else if (t.state !== 'sink') {
            t.state = 'sink';
            t.t = 0;
          }
        }
        tentacles = tentacles.filter((t) => !t.dead);
        inks = [];
        if (head) head.sneeze = 1;
        sfx('sneeze', where.x, where.z);
        announce(KRAKEN.words.live.sneeze);
        return KRAKEN.words.achoo;
      }
      return null;
    },
    cut() {
      if (!fighting() || !grab) return false;
      grab.taps++;
      const p = readPlayer();
      if (p) sfx('cut', p.x, p.z);
      if (grab.taps >= cutTaps()) {
        release('cut');
        return true;
      }
      return false;
    },
    cutHold(down) {
      if (!grab) return;
      grab.holding = !!down && fighting();
      if (!grab.holding) grab.hold = 0;
    },
    playerMods() {
      if (!fighting()) return NO_MODS;
      if (grab) return { speedMul: 0, turnMul: 0, dps: KRAKEN.grab.dps, vx: 0, vz: 0 };
      const P = row();
      if (P.pull && head && headUp()) {
        const p = readPlayer();
        if (p) {
          const d = Math.hypot(head.x - p.x, head.z - p.z);
          if (d <= P.pull.reach + EPS && d > P.pull.min) {
            return { speedMul: 1, turnMul: 1, dps: 0, vx: ((head.x - p.x) / d) * P.pull.speed, vz: ((head.z - p.z) / d) * P.pull.speed };
          }
        }
      }
      return NO_MODS;
    },
    setHp(n) {
      const v = num(n, NaN);
      if (disposed || !Number.isFinite(v)) return hp;
      if (mode === 'idle' || mode === 'rise') {
        hp = clamp(v, 1, KRAKEN.hp);
        return hp;
      }
      if (mode !== 'fight') return hp;
      hp = clamp(v, 0, KRAKEN.hp);
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
      return { name: KRAKEN.name, frac: clamp(hp / KRAKEN.hp, 0, 1), notches: KRAKEN.notches.map((n) => r3(n / KRAKEN.hp)) };
    },
    get phase() {
      return phase;
    },
    get hp() {
      return hp;
    },
    get grabbed() {
      return !!grab;
    },
    // its status for the boss bar's badge (#boss-status, §6.3), in specials.js newStatus()'s shape
    get status() {
      return { id: st.id, t: Math.max(0, st.t), max: st.max, immune: st.id === 'stink' ? 0 : st.pegs };
    },
    get rising() {
      return mode === 'rise';
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
      disposed = true;
      grab = null;
      tentacles = [];
      inks = [];
      head = null;
    },
  };
}
