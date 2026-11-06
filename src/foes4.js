// Voyage IV's pseudo foes (SPEC4 §3.1): the Monkey Jollyboats (a pack of five that lobs coconuts), Puffer Mines (sea
// creatures that drift at you and pop), Old Coilback the Sea Serpent (dives, then lunges down a lane) and the Rock
// Forts (stationary guns that sight you with a red line). None of them is a ship: they are parts in main's
// pseudo-target registry (§3.7), as the Kraken is.
//
// Pure: imports nothing (the Node tests load it as a data: URL). Simulated time only (step(dt)); every roll comes from
// ctx.rng. The numbers live in JOLLY, PUFFER, COILBACK and FORT; the status times (STATUS, specials.js), the puffer
// cap (POOL_RULES.puffersAlive) and the pack sizes (PACKS, pools.js), the first-meeting times (MEET, pools.js) and the
// words (WORDS4, mechanics4.js) come from ctx.tables, never copied here (a missing table reads today's numbers). A junk
// ctx never throws: a missing or throwing callback is skipped.
//
// createFoes4(ctx) → {
//   spawn(kind, x, z, opts) → id | null   'jolly' (a pack of PACKS.jolly boats round (x, z)), 'puffer' (a patch of
//                                     min(opts.n ?? PACKS.puffer, cap − alive) puffers; none free: a wave's patch
//                                     waits, its slot alive, and rises (min(n, free)) as soon as one leaves; an
//                                     owned patch (opts.owner: the summoning ship's id) never waits: what can't
//                                     rise now doesn't, and null when none can), 'coilback', 'fort' (main places it
//                                     at a free env.fortSpots entry). A spot on land moves to the nearest open water.
//   step(dt)                          simulated seconds (main's 1/120 s substeps; at most 1 s a call)
//   slots() → n                       wave slots alive: a pack with a boat afloat, an unowned patch (waiting, or with
//                                     a puffer alive), the Coilback until it swims home, a fort until it is down.
//                                     Owned puffers never count (they live in their owner's slot).
//   alive(kind) → n                   'puffer': puffers alive (rising, drifting or puffing; any owner); 'jolly',
//                                     'coilback', 'fort': those foes alive (their slots); else 0
//   sendHome(owner)                   that owner's puffers swim home (the Witch's fall); a wave's patch stays
//   targets() → [{ id, kind, part, x, z, r, y0, y1, hp, maxHp, name, hidden }]   kind: the foe's kind ('jolly',
//                                     'puffer', 'coilback', 'fort'), part: the part's ('boat', 'puffer', 'head',
//                                     'hump', 'fort'; an addition: main's wrapper takes kind = kind, partKind = part).
//                                     Old Coilback under water is listed hidden (main's syncParts skips it). Ids are
//                                     never reused within an instance (one wrapper per part per spawn).
//   hits(id, x, y, z) → boolean       is that point inside that part (a ball in flight)
//   hit(id, info) → { dmg, word } | null   a ball on a part: info = main's beam-on shotResult ({ dmg, ammo, crit }).
//                                     A boat: grape tips it whatever its hp, other shot takes its 10 hp ("SPLOSH!" when
//                                     it goes over); a puffer: any ball sends it home ("PFFT!"); the Coilback: head ×1,
//                                     dizzy head ×2 ("BONK!"), humps ×0.5 ("THUD"); a fort ×1 ("FORT DOWN!" at 0).
//   special(id, ammo) → word | null   a special ball's status on that part's foe (STATUS's boss values, through
//                                     ctx.tables.STATUS): fire burns the part, frost slows (×0.5) and lengthens its
//                                     warnings (+0.5 s), stink stops new attacks (then clothes-pegs). Old Coilback
//                                     reads COILBACK.frost / .stink instead. A puffer has none (the ball sent it home).
//   boardWhy(id) → 'small' | 'monster' | 'fort'   G on a part: a boat is too small, a fort too big, the rest are
//                                     sea monsters
//   push(ship) → { vx, vz } | null    an addition (as shellback.push): the Coilback's 3 u shove out of its lane,
//                                     as a velocity main adds to that ship's motion (× dt) for COILBACK.lane.shoveTime
//                                     s after the hit. ship: main's ship ({ id, x, z, ... }); yours by kind 'player'
//                                     or by sitting where ctx.player() says you are.
//   tags() → [{ id, name, x, y, z, frac, count, under, isNew }]   a pack's one tag (count: boats afloat, frac null),
//                                     the Coilback's and each fort's (frac: its hull bar; under: the Coilback under
//                                     water); none for puffers. isNew: the gold NEW (§3.4)
//   visuals() → foesView's input (fresh plain objects, ids stable while a thing lives):
//     packs:    [{ id, frozen, burning, boats: [{ id, x, z, h, speed, state: 'row' | 'tip', t, hp, throwT,
//                 monkey: { x, z, h } | null }] }]      (throwT: s since its monkey last threw, Infinity if never;
//                 a tipped boat shows JOLLY.tip s while its monkey swims home)
//     coconuts: [{ id, pack, fx, fz, x, z, t, T, arc }] (a lob from (fx, fz) landing at (x, z) at t = T)
//     puffers:  [{ id, x, z, h, state: 'rise' | 'drift' | 'puff' | 'home', t, T, k, owner }]   (k: its swell 0..1;
//                 'home': swimming away for PUFFER.home.show s)
//     coilback: null | { id, state: 'swim' | 'dive' | 'under' | 'rear' | 'lunge' | 'dizzy' | 'home', t, T,
//                 head: { x, z, h, y, k }, humps: [{ x, z, k }] (3; k 0 sunk .. 1 up), trail: [{ x, z }] (the bubble
//                 trail while under), hp, maxHp, hurt, frozen, burning }
//     forts:    [{ id, x, z, h, state: 'idle' | 'track' | 'lock' | 'fire' | 'down', t, T, hp, maxHp, burning }]
//     rings:    [{ id, kind: 'coconut' | 'puff', x, z, r, t, T }]   (the brown dotted ring; the spiky ring, which
//                 pulses at PUFFER.pulse Hz)
//     lanes:    [{ id, kind: 'lunge', x0, z0, x1, z1, w, t, T, run }]   (run: 0 while it warns, then 0..1 along it)
//     lines:    [{ id, kind: 'fort', x0, y0, z0, x1, z1, state: 'track' | 'lock' | 'fire', t, T }]
//   get state (a plain snapshot for tests and G.v4.foes), dispose() (gives back every warning slot it holds)
// }
// ctx: { player() → { x, z, h, speed, len, wid } | null, ships() → [{ id, x, z, h, len, wid, kind }] (the pirates),
//   damage(target, amount, x, z, source) (target: 'player' or a ships() id; source 'coconut' | 'puffer' | 'lunge' |
//   'fort'), land(x, z, r) → boolean (a circle of radius r touches land), world: { x, z, r }, rng(), warnBonus(),
//   warn: { take(kind) → boolean, give(kind) } (each warning shape holds one slot from its start to its landing:
//   'coconut', 'puff', 'lunge', 'fort'), pop(text, x, y, z, style), announce(text), sfx(name, x, z, opts?),
//   coins(x, z, gold) (floating loot worth gold), gold(n, why) (paid at once: a fort's 100, the Coilback's scale),
//   drift(x, z) → { vx, vz } | null (the coral currents: puffers ride them), isNew(kind) → boolean (true while that
//   kind's first-meeting grace runs, §3.4: main's, from its spawn until MEET.grace s after its meet card shows; a
//   newcomer holds its attacks meanwhile), hold() → boolean (main's state.intro > 0 || boarding.truce: no foe starts
//   a telegraph or runs its attack timers and the grace waits; what is already in the air lands),
//   tables: { STATUS, WORDS4, WORDS3?, POOL_RULES?, PACKS?, MEET? } }
// A warning is never shorter than its table's (≥ 1.5 s) plus ctx.warnBonus().

/**
 * The Monkey Jollyboats (§3.1): a pack of little rowboats with a cheeky monkey each, one wave slot. The boats paddle
 * a ring round you (10–14 u, turning slowly) and each lobs a coconut at your predicted spot ± 3 u every 6–8 s while it
 * is within `reach` of your hull, at most `inAir` in the air a pack. A coconut's brown ring warns 1.5 s (+ the bonus)
 * and hits every hull inside it (pirates too) for 3. Grape tips a boat whatever its hp; your hull touching one tips
 * it (no damage to you); 10 gold a boat (coins).
 */
export const JOLLY = {
  name: 'Monkey Jollyboats',
  boats: 5, // a pack's boats (the fallback of ctx.tables.PACKS.jolly)
  hp: 10,
  len: 3.2,
  wid: 1.4,
  speed: 11,
  accel: 5,
  turn: 2.2, // rad/s
  ring: [10, 14], // u from your ship's centre
  orbit: 0.3, // rad/s the ring turns round you
  reach: 20, // u: a boat this near your hull counts down to its next coconut
  every: [6, 8], // s between a boat's coconuts
  aim: 3, // ± u round your predicted spot
  inAir: 2, // coconuts in the air at once, a pack
  coconut: { r: 2.2, damage: 3, warn: 1.5, arc: 6 }, // arc: the lob's height (for the view)
  wordGap: 3, // s: "COCONUT!" once per pack per 3 s
  gold: 10, // a boat, as floating coins
  y0: 0,
  y1: 1.8,
  tip: 3, // s a tipped boat stays shown while its monkey swims home
  swim: 2.4, // u/s the monkey swims home
  spread: 4, // u round the spawn point
  clear: 1.2, // u a boat keeps clear of land
  avoid: 4, // u a boat keeps off any hull's side (it rows round them)
};

/**
 * Puffer Mines (§3.1): sea creatures, a patch of up to 4 (one wave slot) or the Coral Witch's summons (owned by her,
 * inside her slot); at most `cap` alive in all (ctx.tables.POOL_RULES.puffersAlive). Each drifts at the nearest hull
 * within `sense` u (riding the currents, ctx.drift); within `near` u of a hull it puffs (swells, a spiky ring r 4
 * pulsing at 1 Hz, 1.5 s + the bonus), then pops: 8 to every hull within 4 u (pirates too), and swims home. Any ball
 * sends one home safely ("PFFT!", 2 gold, a coin). After `life` s it swims home by itself.
 */
export const PUFFER = {
  name: 'Puffer Mine',
  patch: 4, // a wave's patch (the fallback of ctx.tables.PACKS.puffer)
  cap: 6, // alive in all (the fallback of ctx.tables.POOL_RULES.puffersAlive)
  hp: 6,
  r: 0.9,
  swell: 2, // × its size while it puffs
  drift: 1.4, // u/s
  sense: 25, // u: it drifts at the nearest hull this near
  near: 6, // u: it puffs this near a hull
  pop: { r: 4, damage: 8, warn: 1.5 },
  pulse: 1, // Hz: the spiky ring's pulse (≤ 1 Hz, kid rule)
  life: 40, // s
  gold: 2, // a coin
  rise: 0.6, // s: rising out of the water
  home: { speed: 3, show: 3 }, // swimming home: u/s, and s it stays shown
  apart: 2, // u between two puffers
  stop: 1.5, // u: it drifts no nearer a hull's centre line than this
  spread: 3, // u round the patch's spot
};

/**
 * Old Coilback, the Sea Serpent (§3.1): a grumpy old serpent, one wave slot. It swims 6 s circling you at 22–28 u
 * (humps up) → dives 2 s → 3 s under (a bubble trail; untargetable; its tag reads UNDER WATER) → rears 14–16 u off your
 * beam, head up, and shows its lane (green-and-white dashes, 1.6 s + the bonus): 4 u wide, from its head to 4 u past
 * your predicted spot (at most 30 u) → lunges down it in 0.5 s (12 to every hull it passes, pirates too, and a 3 u
 * shove out of the lane) → dizzy 4 s → swims again. Head ×1, dizzy head ×2, humps ×0.5. Frost: no dive for 8 s and its
 * lane +0.5 s; Stink: it dives off and doesn't lunge for 6 s (both replace STATUS's boss values for it; `immune` is its
 * clothes-pegs). At 0 it swims home sulking and drops its scale (+150 gold).
 */
export const COILBACK = {
  name: 'Old Coilback',
  hp: 450,
  head: { r: 1.6, y: 2.5, mul: 1, dizzy: 2 },
  hump: { n: 3, r: 1.2, y: 0.9, gap: 3, mul: 0.5 }, // gap: u between the head and each hump along its path
  speed: 9, // u/s
  turn: 2.4, // rad/s
  circle: [22, 28], // u: the ring it swims round you
  approach: 34, // u: the cycle starts once it is this near you
  swim: 6, // s
  dive: 2, // s (its parts can be hit for the first half)
  under: 3, // s
  rear: [14, 16], // u off your beam
  lane: { warn: 1.6, w: 4, past: 4, max: 30, lunge: 0.5, damage: 12, shove: 3, shoveTime: 0.25 },
  dizzy: 4, // s
  gold: 150, // its scale
  frost: { noDive: 8, lane: 0.5 },
  stink: { noLunge: 6, immune: 20 },
  home: { speed: 6, show: 5 },
  clear: 3, // u of open water round the spot it rears at
};

/**
 * Rock Forts (§3.1): stationary guns on sea stacks (env.fortSpots), one wave slot each. Within `range` u it sights you:
 * a red dotted line from its gun follows you for `track` s, then locks for `lock` s (+ the bonus: solid, one soft
 * flash, "click-clack"), then fires along the locked line: 14 to the first hull on it (pirates too); reload 4 s. At 0
 * "FORT DOWN!": the wall crumbles and its gunners row away (+100 gold). The Shellback's towers read `track` and `lock`
 * through ctx.tables.FORT.
 */
export const FORT = {
  name: 'Rock Fort',
  hp: 220,
  r: 3,
  y0: 0,
  y1: 8,
  gunY: 6.5,
  range: 40, // u
  track: 1.3, // s
  lock: 0.5, // s (+ the warn bonus)
  damage: 14,
  reload: 4, // s
  first: 1, // s after it first sees you
  traverse: 0.2, // rad/s: how fast its gun swings after you while it tracks (a ship crossing its line at speed outruns it)
  hw: 0.6, // u: the line's half-width (a hull is on it when its centre line comes within hw + its half-width)
  fire: 0.35, // s the shot shows
  gold: 100,
  down: 6, // s the crumbling fort and the rowing gunners show
};

// What a pseudo kind is called (main's foeName(); the banners and the meet cards).
export const FOE_NAMES = {
  jolly: 'Monkey Jollyboats',
  puffer: 'Puffer Mines',
  coilback: 'Old Coilback',
  fort: 'Rock Fort',
  shellback: 'The Shellback',
};

// The words, when ctx.tables.WORDS4 / WORDS3 lack them (the same as mechanics4.js WORDS4's pop / live keys).
const WORDS = {
  coconut: 'COCONUT!',
  bonk: 'BONK!',
  splosh: 'SPLOSH!',
  puff: 'PUFF!',
  pfft: 'PFFT!',
  lunge: 'LUNGE!',
  thud: 'THUD',
  dizzy: 'DIZZY!',
  aim: 'AIM!',
  fortDown: 'FORT DOWN!',
  crit: 'CRIT!',
  achoo: 'ACHOO!',
  // WORDS3's
  fire: 'ON FIRE!',
  frost: 'FROZEN!',
  pegs: 'Clothes-pegs!',
  kaboom: 'KA-BOOM!',
  fireOut: 'FIRE OUT! SSSS!',
};
const LIVE = {
  coconut: 'Coconuts! Steer out of the brown circle.',
  puff: 'A puffer is puffing! Steer away.',
  lunge: 'Old Coilback rears up! Steer out of the green lane.',
  coilback: 'Old Coilback dived!',
  fort: 'A Rock Fort is aiming at you!',
  fortDown: 'The Rock Fort is down!',
  home: 'Old Coilback swims home, sulking.', // (WORDS4.live.home; the Shellback's is shellHome)
};
const SFX = { coconut: 'coconut', bonk: 'bonk', splosh: 'splash', puff: 'puff', pop: 'pop', pfft: 'pop', dive: 'splash', hiss: 'hiss', lunge: 'splash', clack: 'clack', fire: 'cannon', down: 'crunch', sneeze: 'sneeze', coin: 'coin' };

// Today's numbers of the tables main passes in ctx.tables, used only when a table (or a number) is missing.
const STATUS0 = { fire: { dps: 3, boss: 3 }, frost: { time: 5, add: 2, max: 8, bossMul: 0.5 }, stink: { boss: 2, bossImmune: 20 }, kaboom: { burst: 15 } };
const MEET0 = { card: 3.5, grace: 4, newTag: 10 };
const GRACE_CAP = 15; // s of un-held time a newcomer waits at most for its grace (so a stuck isNew never disarms it)
const FROST_WARN = 0.5; // s a frozen foe's warnings grow (the boss rule, §3.6.2)
const FROST_SLOW = 0.5; // × a frozen pack's speed
const EDGE = 4; // u: foes stay inside worldRadius − EDGE
const ANNOUNCE_GAP = 3; // s between warnings in #game-live

const EPS = 1e-9;
const TAU = Math.PI * 2;
const KINDS = ['jolly', 'puffer', 'coilback', 'fort'];

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
// The distance from (x, z) to a hull's centre line (bow to stern).
function hullDist(s, x, z) {
  const fx = Math.sin(s.h);
  const fz = Math.cos(s.h);
  const half = s.len / 2;
  const along = clamp((x - s.x) * fx + (z - s.z) * fz, -half, half);
  return Math.hypot(x - (s.x + fx * along), z - (s.z + fz * along));
}
// The distance between two segments (a0 → a1, b0 → b1) in the plane.
function segDist(ax, az, bx, bz, cx, cz, dx, dz) {
  const pt = (px, pz, x0, z0, x1, z1) => {
    const ux = x1 - x0;
    const uz = z1 - z0;
    const L2 = ux * ux + uz * uz;
    const u = L2 > 1e-12 ? clamp(((px - x0) * ux + (pz - z0) * uz) / L2, 0, 1) : 0;
    return Math.hypot(px - (x0 + ux * u), pz - (z0 + uz * u));
  };
  const cross = (x0, z0, x1, z1, x2, z2) => (x1 - x0) * (z2 - z0) - (z1 - z0) * (x2 - x0);
  const d1 = cross(ax, az, bx, bz, cx, cz);
  const d2 = cross(ax, az, bx, bz, dx, dz);
  const d3 = cross(cx, cz, dx, dz, ax, az);
  const d4 = cross(cx, cz, dx, dz, bx, bz);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(pt(ax, az, cx, cz, dx, dz), pt(bx, bz, cx, cz, dx, dz), pt(cx, cz, ax, az, bx, bz), pt(dx, dz, ax, az, bx, bz));
}
// A hull's ends (bow, stern).
function hullEnds(s) {
  const fx = Math.sin(s.h) * (s.len / 2);
  const fz = Math.cos(s.h) * (s.len / 2);
  return [s.x + fx, s.z + fz, s.x - fx, s.z - fz];
}

export function createFoes4(ctx) {
  const fallbackRng = mulberry32(0x666f6534);

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
  const range = (ab) => ab[0] + (ab[1] - ab[0]) * rand();
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
  const puffCap = () => clamp(Math.floor(table('POOL_RULES', ['puffersAlive'], PUFFER.cap)), 0, 64);
  const packSize = (kind, def) => clamp(Math.floor(table('PACKS', [kind], def)), 1, 12);
  const meetT = (k) => Math.max(0, table('MEET', [k], MEET0[k]));
  // A word: WORDS4.pop (or WORDS3 for the status words), else this module's own.
  function word(key) {
    const tables = prop(ctx, 'tables');
    let w = prop(prop(prop(tables, 'WORDS4'), 'pop'), key);
    if (!(typeof w === 'string' && w)) w = ['fire', 'frost', 'pegs', 'kaboom', 'fireOut'].includes(key) ? prop(prop(tables, 'WORDS3'), key) : undefined;
    return typeof w === 'string' && w ? w : WORDS[key];
  }
  function liveWord(key) {
    const w = prop(prop(prop(prop(ctx, 'tables'), 'WORDS4'), 'live'), key);
    return typeof w === 'string' && w ? w : LIVE[key];
  }
  function world() {
    const w = prop(ctx, 'world');
    const r = num(prop(w, 'r'), 150);
    return { x: num(prop(w, 'x'), 0), z: num(prop(w, 'z'), 0), r: r > 0 ? r : 150 };
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
  function inWorld(x, z, edge = EDGE) {
    const w = world();
    return Math.hypot(x - w.x, z - w.z) <= Math.max(0, w.r - edge) + EPS;
  }
  function intoWorld(x, z, edge = EDGE) {
    const w = world();
    const lim = Math.max(0, w.r - edge);
    const d = Math.hypot(x - w.x, z - w.z);
    if (d <= lim) return { x, z };
    const k = (lim - 0.01) / d;
    return { x: w.x + (x - w.x) * k, z: w.z + (z - w.z) * k };
  }
  const openAt = (x, z, clear) => inWorld(x, z) && !isLand(x, z, clear);
  // The nearest point to (x, z) where ok() holds, searched outward ring by ring (deterministic, no rolls).
  function nearest(x, z, ok, max = 60) {
    const s = intoWorld(x, z);
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
  function openSpot(x, z, clear) {
    return nearest(x, z, (px, pz) => openAt(px, pz, clear)) || intoWorld(x, z);
  }
  function predict(p, T) {
    return { x: p.x + Math.sin(p.h) * p.speed * T, z: p.z + Math.cos(p.h) * p.speed * T };
  }
  function pop(text, x, y, z, style = 'foe4') {
    if (text) call('pop', text, x, y, z, style);
  }
  const sfx = (key, x, z, o) => (o ? call('sfx', SFX[key], x, z, o) : call('sfx', SFX[key], x, z));
  let lastLive = -Infinity;
  function warnLive(key) {
    if (clock - lastLive < ANNOUNCE_GAP - EPS) return;
    lastLive = clock;
    const t = liveWord(key);
    if (t) call('announce', t);
  }
  function announce(key) {
    const t = liveWord(key);
    if (t) call('announce', t);
  }

  // ---------------------------------------------------------------- warning slots (ctx.warn)
  const slotsHeld = []; // the kinds this instance holds now
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
  let clock = 0;
  let holdNow = false;
  let ids = 0;
  const foes = []; // packs, patches, the Coilback, forts, in spawn order
  let puffers = []; // every puffer (a patch's or a summoner's)
  const shoves = new Map(); // ship key → { vx, vz, until }
  const counts = { coconuts: 0, coconutHits: 0, tipped: 0, puffs: 0, pops: 0, popHits: 0, pffts: 0, lunges: 0, lungeHits: 0, dives: 0, sights: 0, shots: 0, shotHits: 0, forts: 0, waited: 0, gold: 0 };
  const nextId = (p) => `${p}${++ids}`;

  const newcomer = (kind) => call('isNew', kind) === true;
  function newFoe(kind, id) {
    // (isNew is read at its first step, so main may set up the meeting just before or just after spawning it)
    return { kind, id, isNew: null, graceT: 0, graceEnd: null, st: { id: null, t: 0, max: 0, pegs: 0 }, burnPart: null };
  }
  // A newcomer holds its attacks while its kind's first-meeting grace runs (ctx.isNew; at most GRACE_CAP s of
  // un-held time); its NEW tag stays for MEET.newTag − MEET.grace s more.
  function inGrace(f) {
    if (!f.isNew || f.graceEnd !== null) return false;
    if (f.graceT >= GRACE_CAP - EPS || !newcomer(f.kind)) {
      f.graceEnd = clock;
      return false;
    }
    return true;
  }
  const held = (f) => holdNow || inGrace(f);
  const frozen = (f) => f.st.id === 'frost' && f.st.t > EPS;
  const stinky = (f) => f.st.id === 'stink' && f.st.t > EPS;
  function warnTime(base, f, extra = 0) {
    const bonus = Math.max(0, num(call('warnBonus'), 0));
    return Math.max(base, base + bonus + extra + (f && frozen(f) ? FROST_WARN : 0));
  }
  function hulls(p, ships) {
    return p ? [p, ...ships] : ships;
  }
  function hurtHull(h, amount, x, z, source) {
    call('damage', h.key, amount, x, z, source);
  }
  function shove(h, dx, dz, dist, time) {
    // out along (dx, dz), or the other way when that is land or off the map; nothing when both are
    const d = Math.hypot(dx, dz);
    if (!(d > 1e-9) || !(dist > 0)) return;
    let ux = dx / d;
    let uz = dz / d;
    const r = h.wid / 2;
    const open = (sx, sz) => inWorld(h.x + sx * dist, h.z + sz * dist, EDGE + 2) && !isLand(h.x + sx * dist, h.z + sz * dist, r);
    if (!open(ux, uz)) {
      if (!open(-ux, -uz)) return;
      ux = -ux;
      uz = -uz;
    }
    const T = Math.max(0.05, time);
    shoves.set(h.key, { vx: (ux * dist) / T, vz: (uz * dist) / T, until: clock + T });
  }
  function payCoins(x, z, gold) {
    counts.gold += gold;
    call('coins', x, z, gold);
  }
  function payGold(n, why) {
    counts.gold += n;
    call('gold', n, why);
  }

  // ---------------------------------------------------------------- spawning
  function spotFor(x, z, clear) {
    const s = openSpot(x, z, clear);
    return { x: s.x, z: s.z };
  }
  function spawnPack(x, z, opts) {
    const n = clamp(Math.floor(num(prop(opts, 'n'), packSize('jolly', JOLLY.boats))), 1, 12);
    const pk = newFoe('jolly', nextId('j'));
    const c = spotFor(x, z, JOLLY.spread + 1);
    const p = readPlayer();
    Object.assign(pk, { n, angle: p ? bearing(p.x, p.z, c.x, c.z) : rand() * TAU, dir: rand() < 0.5 ? -1 : 1, boats: [], coconuts: [], wordAt: -Infinity });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand() * 0.5;
      const d = JOLLY.spread * Math.sqrt(rand());
      const s = spotFor(c.x + Math.sin(a) * d, c.z + Math.cos(a) * d, JOLLY.clear);
      pk.boats.push({
        id: `${pk.id}-${i}`,
        i,
        x: s.x,
        z: s.z,
        h: p ? bearing(s.x, s.z, p.x, p.z) : a,
        v: 0,
        hp: JOLLY.hp,
        state: 'row',
        t: 0,
        R: range(JOLLY.ring),
        clock: range(JOLLY.every),
        throwT: Infinity,
        monkey: null,
        burn: 0,
      });
    }
    foes.push(pk);
    return pk.id;
  }
  const puffersAlive = () => puffers.reduce((n, u) => n + (u.state !== 'home' ? 1 : 0), 0);
  function risePatch(pt, n) {
    const placed = [];
    for (let i = 0; i < n; i++) {
      let s = null;
      for (let k = 0; k < 8 && !s; k++) {
        const a = rand() * TAU;
        const d = PUFFER.spread * Math.sqrt(rand());
        const q = { x: pt.x + Math.sin(a) * d, z: pt.z + Math.cos(a) * d };
        const ok = (qx, qz) => openAt(qx, qz, PUFFER.r) && [...placed, ...puffers.filter((u) => u.state !== 'home')].every((o) => Math.hypot(o.x - qx, o.z - qz) >= PUFFER.apart - EPS);
        s = ok(q.x, q.z) ? q : k === 7 ? nearest(q.x, q.z, ok, 20) || openSpot(q.x, q.z, PUFFER.r) : null;
      }
      placed.push(s);
      puffers.push({ id: `${pt.id}-${pt.risen++}`, patch: pt.id, owner: pt.owner, x: s.x, z: s.z, h: rand() * TAU, state: 'rise', t: 0, T: PUFFER.rise, life: 0, slot: false, homeX: 0, homeZ: 0 });
    }
  }
  function spawnPatch(x, z, opts) {
    const raw = prop(opts, 'owner');
    const owner = (typeof raw === 'number' && Number.isFinite(raw)) || (typeof raw === 'string' && raw) ? raw : null;
    const owned = owner !== null;
    const n = clamp(Math.floor(num(prop(opts, 'n'), packSize('puffer', PUFFER.patch))), 1, 12);
    const free = Math.max(0, puffCap() - puffersAlive());
    if (owned && free <= 0) return null;
    const pt = newFoe('puffer', nextId('p'));
    const c = spotFor(x, z, PUFFER.r + 1);
    Object.assign(pt, { owner: owned ? owner : null, n, x: c.x, z: c.z, waiting: true, risen: 0 });
    if (free > 0) {
      pt.waiting = false;
      risePatch(pt, Math.min(n, free));
    }
    foes.push(pt);
    return pt.id;
  }
  function spawnCoilback(x, z) {
    const cb = newFoe('coilback', nextId('c'));
    const s = spotFor(x, z, COILBACK.clear);
    const p = readPlayer();
    const h = p ? bearing(s.x, s.z, p.x, p.z) : 0;
    Object.assign(cb, {
      hp: COILBACK.hp,
      state: 'approach',
      t: 0,
      T: Infinity,
      x: s.x,
      z: s.z,
      h,
      y: COILBACK.head.y,
      path: [{ x: s.x, z: s.z }],
      R: range(COILBACK.circle),
      spin: rand() < 0.5 ? -1 : 1,
      side: rand() < 0.5 ? -1 : 1,
      noDive: 0,
      noLunge: 0,
      frostT: 0,
      frostLane: false,
      lane: null,
      hitKeys: null,
      hurt: 0,
      trail: [],
      waitSlot: false,
      scale: null,
    });
    // (the humps start strung out behind its head)
    for (let k = 1; k <= COILBACK.hump.n + 1; k++) cb.path.push({ x: s.x - Math.sin(h) * k * COILBACK.hump.gap, z: s.z - Math.cos(h) * k * COILBACK.hump.gap });
    foes.push(cb);
    return cb.id;
  }
  function spawnFort(x, z) {
    const f = newFoe('fort', nextId('f'));
    const p = readPlayer();
    Object.assign(f, { x, z, h: p ? bearing(x, z, p.x, p.z) : 0, hp: FORT.hp, state: 'idle', t: 0, T: 0, reload: FORT.first, lx: 0, lz: 0, ax: x, az: z, shot: null });
    foes.push(f);
    return f.id;
  }

  // ---------------------------------------------------------------- statuses (a pack's, the Coilback's, a fort's)
  function stepStatus(f, dt) {
    const st = f.st;
    if (st.id === 'fire') burn(f, status.fireDps() * Math.min(dt, Math.max(0, st.t)));
    if (st.id !== 'stink' && st.pegs > 0) st.pegs = Math.max(0, st.pegs - dt);
    if (!st.id) return;
    st.t -= dt;
    if (st.t > EPS) return;
    if (st.id === 'stink') st.pegs = f.kind === 'coilback' ? COILBACK.stink.immune : status.pegs();
    if (st.id === 'fire') f.burnPart = null;
    st.id = null;
    st.t = 0;
    st.max = 0;
  }
  function burn(f, amount) {
    if (!(amount > 0)) return;
    if (f.kind === 'jolly') {
      const b = f.boats.find((x) => x.id === f.burnPart && x.state === 'row');
      if (b) hurtBoat(f, b, amount, null);
    } else if (f.kind === 'coilback') {
      if (f.state !== 'home') hurtCoil(f, amount);
    } else if (f.kind === 'fort') {
      if (f.state !== 'down') hurtFort(f, amount);
    }
  }

  // ---------------------------------------------------------------- the Monkey Jollyboats
  function tipBoat(pk, b, paid) {
    b.state = 'tip';
    b.t = 0;
    b.hp = 0;
    b.v = 0;
    const away = { x: Math.sin(b.h + Math.PI / 2), z: Math.cos(b.h + Math.PI / 2) };
    b.monkey = { x: b.x + away.x * 0.8, z: b.z + away.z * 0.8, h: Math.atan2(away.x, away.z) };
    counts.tipped++;
    pop(word('splosh'), b.x, 2, b.z);
    sfx('splosh', b.x, b.z);
    if (paid) payCoins(b.x, b.z, JOLLY.gold);
    if (pk.burnPart === b.id) pk.burnPart = null;
  }
  function hurtBoat(pk, b, dmg, info) {
    const d = Math.min(Math.max(0, dmg), b.hp);
    b.hp -= d;
    if (b.hp <= EPS) tipBoat(pk, b, true);
    return d;
  }
  const rowing = (pk) => pk.boats.filter((b) => b.state === 'row');
  function stepPack(pk, dt, p, ships) {
    const alive = rowing(pk);
    if (p && alive.length) pk.angle = wrap(pk.angle + pk.dir * JOLLY.orbit * dt);
    const slow = frozen(pk) ? FROST_SLOW : 1;
    for (const b of pk.boats) {
      b.t += dt;
      if (b.throwT !== Infinity) b.throwT += dt;
      if (b.state === 'tip') {
        if (b.monkey) {
          const d = JOLLY.swim * dt;
          b.monkey.x += Math.sin(b.monkey.h) * d;
          b.monkey.z += Math.cos(b.monkey.h) * d;
        }
        continue;
      }
      // its spot on the ring round you (swung round land, or off the map)
      let tx = b.x;
      let tz = b.z;
      if (p) {
        const a0 = pk.angle + (b.i / pk.n) * TAU;
        let found = false;
        for (let j = 0; j <= 12 && !found; j++) {
          const a = a0 + Math.ceil(j / 2) * (j % 2 ? 1 : -1) * 0.3;
          const qx = p.x + Math.sin(a) * b.R;
          const qz = p.z + Math.cos(a) * b.R;
          if (openAt(qx, qz, JOLLY.clear)) {
            tx = qx;
            tz = qz;
            found = true;
          }
        }
      }
      const dist = Math.hypot(tx - b.x, tz - b.z);
      const want = clamp(dist * 1.2, 0, JOLLY.speed * slow);
      // (it rows round hulls, yours included: only a hull that sails into it tips it)
      let dx = dist > 1e-6 ? (tx - b.x) / dist : Math.sin(b.h);
      let dz = dist > 1e-6 ? (tz - b.z) / dist : Math.cos(b.h);
      for (const h of hulls(p, ships)) {
        const fx = Math.sin(h.h);
        const fz = Math.cos(h.h);
        const along = clamp((b.x - h.x) * fx + (b.z - h.z) * fz, -h.len / 2, h.len / 2);
        const ox = b.x - (h.x + fx * along);
        const oz = b.z - (h.z + fz * along);
        const o = Math.hypot(ox, oz);
        const keep = h.wid / 2 + JOLLY.avoid;
        if (o < keep && o > 1e-6) {
          const k = (2 * (keep - o)) / keep;
          dx += (ox / o) * k;
          dz += (oz / o) * k;
        }
      }
      const head = Math.atan2(dx, dz);
      if (dist > 0.3) b.h = turnToward(b.h, head, JOLLY.turn * slow * dt);
      const aim = Math.abs(wrap(head - b.h)) < Math.PI / 2 ? want : want * 0.3;
      b.v = b.v < aim ? Math.min(aim, b.v + JOLLY.accel * dt) : Math.max(aim, b.v - JOLLY.accel * 2 * dt);
      const nx = b.x + Math.sin(b.h) * b.v * dt;
      const nz = b.z + Math.cos(b.h) * b.v * dt;
      if (openAt(nx, nz, JOLLY.clear * 0.5)) {
        b.x = nx;
        b.z = nz;
      } else b.v = 0;
      // pirates' hulls push a boat aside; yours tips it over (no damage to you)
      for (const s of ships) {
        const d = hullDist(s, b.x, b.z);
        const need = s.wid / 2 + JOLLY.wid / 2;
        if (d < need) {
          const fx = Math.sin(s.h);
          const fz = Math.cos(s.h);
          const along = clamp((b.x - s.x) * fx + (b.z - s.z) * fz, -s.len / 2, s.len / 2);
          let ox = b.x - (s.x + fx * along);
          let oz = b.z - (s.z + fz * along);
          const o = Math.hypot(ox, oz);
          if (o < 1e-6) {
            ox = -fz;
            oz = fx;
          } else {
            ox /= o;
            oz /= o;
          }
          const qx = b.x + ox * (need - d);
          const qz = b.z + oz * (need - d);
          if (openAt(qx, qz, 0.3)) {
            b.x = qx;
            b.z = qz;
          }
        }
      }
      if (p && hullDist(p, b.x, b.z) < p.wid / 2 + JOLLY.wid / 2 - EPS) {
        tipBoat(pk, b, true);
        continue;
      }
      // its coconut
      if (!p || held(pk) || stinky(pk)) continue;
      if (hullDist(p, b.x, b.z) > JOLLY.reach + EPS) continue;
      b.clock -= dt;
      if (b.clock > EPS) continue;
      if (pk.coconuts.length >= JOLLY.inAir) continue;
      if (!takeSlot('coconut')) {
        counts.waited++;
        b.clock = 0;
        continue;
      }
      lob(pk, b, p);
      b.clock = range(JOLLY.every);
    }
    // coconuts land (even a tipped boat's: what is in the air lands)
    const landing = [];
    for (const c of pk.coconuts) {
      c.t += dt;
      if (c.t >= c.T - EPS) landing.push(c);
    }
    for (const c of landing) {
      pk.coconuts.splice(pk.coconuts.indexOf(c), 1);
      giveSlot('coconut');
      let hit = false;
      for (const h of hulls(p, ships)) {
        if (hullDist(h, c.x, c.z) <= JOLLY.coconut.r + EPS) {
          hurtHull(h, JOLLY.coconut.damage, c.x, c.z, 'coconut');
          hit = true;
        }
      }
      if (hit) {
        counts.coconutHits++;
        pop(word('bonk'), c.x, 2.5, c.z);
        sfx('bonk', c.x, c.z);
      } else sfx('splosh', c.x, c.z);
    }
  }
  function lob(pk, b, p) {
    const T = warnTime(JOLLY.coconut.warn, pk);
    const q = predict(p, T);
    const a = rand() * TAU;
    const d = JOLLY.aim * Math.sqrt(rand());
    const s = openSpot(q.x + Math.sin(a) * d, q.z + Math.cos(a) * d, 0.5);
    pk.coconuts.push({ id: nextId(`${pk.id}-k`), boat: b.id, fx: b.x, fz: b.z, x: s.x, z: s.z, t: 0, T });
    b.throwT = 0;
    counts.coconuts++;
    sfx('coconut', b.x, b.z, { duration: T });
    if (clock - pk.wordAt >= JOLLY.wordGap - EPS) {
      pk.wordAt = clock;
      pop(word('coconut'), s.x, 2.5, s.z);
    }
    warnLive('coconut');
  }

  // ---------------------------------------------------------------- Puffer Mines
  function sendPufferHome(u, why) {
    if (u.state === 'home') return;
    if (u.slot) {
      giveSlot('puff');
      u.slot = false;
    }
    const p = readPlayer();
    let a = p ? bearing(p.x, p.z, u.x, u.z) : u.h;
    if (!Number.isFinite(a)) a = 0;
    u.state = 'home';
    u.t = 0;
    u.T = PUFFER.home.show;
    u.h = a;
    u.why = why;
  }
  function stepPuffers(dt, p, ships) {
    // waiting patches rise as soon as puffers are free (in spawn order)
    for (const f of foes) {
      if (f.kind !== 'puffer' || !f.waiting) continue;
      const free = puffCap() - puffersAlive();
      if (free <= 0) break;
      f.waiting = false;
      risePatch(f, Math.min(f.n, free));
    }
    const all = hulls(p, ships);
    for (const u of puffers) {
      u.t += dt;
      if (u.state === 'home') {
        u.x += Math.sin(u.h) * PUFFER.home.speed * dt;
        u.z += Math.cos(u.h) * PUFFER.home.speed * dt;
        continue;
      }
      u.life += dt;
      if (u.life >= PUFFER.life - EPS && u.state !== 'puff') {
        sendPufferHome(u, 'life');
        continue;
      }
      if (u.state === 'rise') {
        if (u.t >= u.T - EPS) {
          u.state = 'drift';
          u.t = 0;
          u.T = 0;
        }
        continue;
      }
      const f = patchOf(u);
      if (u.state === 'puff' && u.t >= u.T - EPS) {
        popPuffer(u, all);
        continue;
      }
      // drift at the nearest hull within sense (riding the currents); puffing, it keeps drifting in (its ring with
      // it, slowly), so a ship that stays put is caught and one that sails off gets away
      let best = null;
      let bestD = Infinity;
      for (const h of all) {
        const d = hullDist(h, u.x, u.z);
        if (d < bestD) {
          bestD = d;
          best = h;
        }
      }
      if (u.state === 'drift' && best && bestD <= PUFFER.near + EPS) {
        // close enough: it puffs (once a warning slot is free; it waits where it is meanwhile)
        if (!(f && held(f)) && !holdNow) {
          if (takeSlot('puff')) {
            u.slot = true;
            u.state = 'puff';
            u.t = 0;
            u.T = warnTime(PUFFER.pop.warn, null);
            counts.puffs++;
            pop(word('puff'), u.x, 2, u.z);
            sfx('puff', u.x, u.z, { duration: u.T });
            warnLive('puff');
          } else counts.waited++;
        }
        continue;
      }
      let vx = 0;
      let vz = 0;
      if (best && bestD <= PUFFER.sense + EPS && bestD > PUFFER.stop) {
        const fx = Math.sin(best.h);
        const fz = Math.cos(best.h);
        const along = clamp((u.x - best.x) * fx + (u.z - best.z) * fz, -best.len / 2, best.len / 2);
        const qx = best.x + fx * along;
        const qz = best.z + fz * along;
        const d = Math.hypot(qx - u.x, qz - u.z);
        if (d > 1e-6) {
          vx = ((qx - u.x) / d) * PUFFER.drift;
          vz = ((qz - u.z) / d) * PUFFER.drift;
          u.h = Math.atan2(vx, vz);
        }
      }
      const cur = call('drift', u.x, u.z);
      vx += clamp(num(prop(cur, 'vx'), 0), -20, 20);
      vz += clamp(num(prop(cur, 'vz'), 0), -20, 20);
      // keep apart from the others
      for (const o of puffers) {
        if (o === u || o.state === 'home') continue;
        const d = Math.hypot(u.x - o.x, u.z - o.z);
        if (d < PUFFER.apart && d > 1e-6) {
          vx += ((u.x - o.x) / d) * (PUFFER.apart - d);
          vz += ((u.z - o.z) / d) * (PUFFER.apart - d);
        }
      }
      const nx = u.x + vx * dt;
      const nz = u.z + vz * dt;
      if (openAt(nx, nz, PUFFER.r)) {
        u.x = nx;
        u.z = nz;
      }
    }
    puffers = puffers.filter((u) => !(u.state === 'home' && u.t >= u.T - EPS));
  }
  function patchOf(u) {
    return foes.find((f) => f.kind === 'puffer' && f.id === u.patch) || null;
  }
  function popPuffer(u, all) {
    let hit = false;
    for (const h of all) {
      if (hullDist(h, u.x, u.z) <= PUFFER.pop.r + EPS) {
        hurtHull(h, PUFFER.pop.damage, u.x, u.z, 'puffer');
        hit = true;
      }
    }
    counts.pops++;
    if (hit) counts.popHits++;
    sfx('pop', u.x, u.z);
    sendPufferHome(u, 'pop');
  }

  // ---------------------------------------------------------------- Old Coilback
  function coilUp(cb) {
    // its parts can be hit: swimming, the first half of a dive, rearing, lunging, dizzy
    return cb.state === 'approach' || cb.state === 'swim' || cb.state === 'rear' || cb.state === 'lunge' || cb.state === 'dizzy' || (cb.state === 'dive' && cb.t < COILBACK.dive / 2 - EPS);
  }
  const headUp = (cb) => cb.state === 'rear' || cb.state === 'lunge' || cb.state === 'dizzy' || cb.state === 'approach' || cb.state === 'swim' || (cb.state === 'dive' && cb.t < COILBACK.dive / 2 - EPS);
  const humpsUp = (cb) => cb.state === 'approach' || cb.state === 'swim' || (cb.state === 'dive' && cb.t < COILBACK.dive / 2 - EPS);
  // The point `s` u back along its path from the head.
  function alongPath(cb, s) {
    let left = s;
    let ax = cb.x;
    let az = cb.z;
    for (const q of cb.path) {
      const d = Math.hypot(q.x - ax, q.z - az);
      if (d >= left - EPS && d > 1e-9) {
        const k = left / d;
        return { x: ax + (q.x - ax) * k, z: az + (q.z - az) * k };
      }
      left -= d;
      ax = q.x;
      az = q.z;
    }
    return { x: ax - Math.sin(cb.h) * left, z: az - Math.cos(cb.h) * left };
  }
  function humpAt(cb, k) {
    return alongPath(cb, (k + 1) * COILBACK.hump.gap);
  }
  function recordPath(cb) {
    const last = cb.path[0];
    if (!last || Math.hypot(cb.x - last.x, cb.z - last.z) >= 0.5) cb.path.unshift({ x: cb.x, z: cb.z });
    // (enough of it for the humps)
    let len = 0;
    for (let i = 1; i < cb.path.length; i++) {
      len += Math.hypot(cb.path[i].x - cb.path[i - 1].x, cb.path[i].z - cb.path[i - 1].z);
      if (len > (COILBACK.hump.n + 2) * COILBACK.hump.gap) {
        cb.path.length = i + 1;
        break;
      }
    }
  }
  function swimToward(cb, tx, tz, speed, dt) {
    const dist = Math.hypot(tx - cb.x, tz - cb.z);
    if (dist < 1e-6) return;
    cb.h = turnToward(cb.h, bearing(cb.x, cb.z, tx, tz), COILBACK.turn * dt);
    const v = Math.min(speed, dist / Math.max(dt, 1e-6));
    const nx = cb.x + Math.sin(cb.h) * v * dt;
    const nz = cb.z + Math.cos(cb.h) * v * dt;
    if (openAt(nx, nz, COILBACK.head.r)) {
      cb.x = nx;
      cb.z = nz;
    } else {
      // swing round the land
      for (const s of [1, -1]) {
        const h = cb.h + s * 0.8;
        const qx = cb.x + Math.sin(h) * v * dt;
        const qz = cb.z + Math.cos(h) * v * dt;
        if (openAt(qx, qz, COILBACK.head.r)) {
          cb.h = turnToward(cb.h, h, COILBACK.turn * dt * 2);
          cb.x = qx;
          cb.z = qz;
          break;
        }
      }
    }
    recordPath(cb);
  }
  // Its swimming ring round you: the point ahead of it on that ring (open water).
  function circlePoint(cb, p) {
    const a0 = bearing(p.x, p.z, cb.x, cb.z) + cb.spin * 0.6;
    for (let j = 0; j <= 10; j++) {
      const a = a0 + Math.ceil(j / 2) * (j % 2 ? 1 : -1) * 0.35;
      const x = p.x + Math.sin(a) * cb.R;
      const z = p.z + Math.cos(a) * cb.R;
      if (openAt(x, z, COILBACK.clear)) return { x, z };
    }
    return { x: p.x + Math.sin(a0) * cb.R, z: p.z + Math.cos(a0) * cb.R };
  }
  // Where it rears (14–16 u off your beam, on the side it is on, else the other) and its lane: from its head to
  // COILBACK.lane.past u past your predicted spot (at most lane.max), every point of it in open water.
  function rearSpot(cb, p, T) {
    const L = COILBACK.lane;
    const q = predict(p, T + L.lunge / 2);
    const R = range(COILBACK.rear);
    const laneFrom = (sx, sz) => {
      const dx = q.x - sx;
      const dz = q.z - sz;
      const d = Math.hypot(dx, dz);
      const ux = d > 1e-6 ? dx / d : Math.sin(p.h);
      const uz = d > 1e-6 ? dz / d : Math.cos(p.h);
      const len = clamp(d + L.past, 1, L.max);
      return { x0: sx, z0: sz, x1: sx + ux * len, z1: sz + uz * len, len };
    };
    const laneOpen = (ln) => {
      const n = Math.max(2, Math.ceil(ln.len / 2));
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        if (!openAt(ln.x0 + (ln.x1 - ln.x0) * k, ln.z0 + (ln.z1 - ln.z0) * k, 0.5)) return false;
      }
      return true;
    };
    let fallback = null;
    for (const side of [cb.side, -cb.side]) {
      const b0 = p.h + side * (Math.PI / 2);
      for (let j = 0; j <= 8; j++) {
        const a = b0 + Math.ceil(j / 2) * (j % 2 ? 1 : -1) * (Math.PI / 12);
        const sx = p.x + Math.sin(a) * R;
        const sz = p.z + Math.cos(a) * R;
        if (!openAt(sx, sz, COILBACK.clear)) continue;
        const ln = laneFrom(sx, sz);
        if (laneOpen(ln)) return ln;
        if (!fallback) fallback = ln;
      }
    }
    if (fallback) return fallback;
    const s = openSpot(p.x + Math.sin(p.h + cb.side * (Math.PI / 2)) * R, p.z + Math.cos(p.h + cb.side * (Math.PI / 2)) * R, COILBACK.clear);
    return laneFrom(s.x, s.z);
  }
  function hurtCoil(cb, dmg) {
    const d = Math.min(Math.max(0, dmg), cb.hp);
    cb.hp -= d;
    if (cb.hp <= EPS) coilHome(cb);
    return d;
  }
  function coilHome(cb) {
    cb.hp = 0;
    if (cb.lane && cb.lane.slot) giveSlot('lunge');
    cb.lane = null;
    cb.state = 'home';
    cb.t = 0;
    cb.T = COILBACK.home.show;
    cb.st = { id: null, t: 0, max: 0, pegs: 0 };
    cb.burnPart = null;
    cb.scale = { x: cb.x, z: cb.z };
    const p = readPlayer();
    if (p) cb.h = bearing(p.x, p.z, cb.x, cb.z);
    payGold(COILBACK.gold, 'scale');
    announce('home');
  }
  function setCoil(cb, state, T) {
    cb.state = state;
    cb.t = 0;
    cb.T = T;
  }
  function stepCoilback(cb, dt, p, ships) {
    cb.t += dt;
    cb.hurt = Math.max(0, cb.hurt - dt * 2);
    if (cb.noDive > 0) cb.noDive = Math.max(0, cb.noDive - dt);
    if (cb.noLunge > 0 && !holdNow) cb.noLunge = Math.max(0, cb.noLunge - dt);
    if (cb.frostT > 0) cb.frostT = Math.max(0, cb.frostT - dt);
    if (cb.state === 'home') {
      cb.x += Math.sin(cb.h) * COILBACK.home.speed * dt;
      cb.z += Math.cos(cb.h) * COILBACK.home.speed * dt;
      recordPath(cb);
      return;
    }
    if (!p) return;
    const pause = held(cb); // (the fly-in, a truce or its grace: it swims, but its cycle waits)
    switch (cb.state) {
      case 'approach': {
        swimToward(cb, p.x, p.z, COILBACK.speed, dt);
        if (Math.hypot(cb.x - p.x, cb.z - p.z) <= COILBACK.approach + EPS) setCoil(cb, 'swim', COILBACK.swim);
        break;
      }
      case 'swim': {
        const c = circlePoint(cb, p);
        swimToward(cb, c.x, c.z, COILBACK.speed, dt);
        if (pause) cb.t -= dt; // (the cycle waits)
        if (cb.t >= cb.T - EPS && cb.noDive <= EPS) {
          setCoil(cb, 'dive', COILBACK.dive);
          counts.dives++;
          sfx('dive', cb.x, cb.z);
        }
        break;
      }
      case 'dive': {
        swimToward(cb, cb.x + Math.sin(cb.h) * 5, cb.z + Math.cos(cb.h) * 5, COILBACK.speed * 0.6, dt);
        if (cb.t >= cb.T - EPS) {
          setCoil(cb, 'under', COILBACK.under);
          cb.side = (() => {
            const lat = (cb.x - p.x) * -Math.cos(p.h) + (cb.z - p.z) * Math.sin(p.h);
            return Math.abs(lat) > 0.5 ? Math.sign(lat) : cb.side;
          })();
          cb.trail = [];
          warnLive('coilback');
        }
        break;
      }
      case 'under': {
        // a bubble trail toward the spot off your beam where it will rear
        const b = p.h + cb.side * (Math.PI / 2);
        const R = (COILBACK.rear[0] + COILBACK.rear[1]) / 2;
        const tx = p.x + Math.sin(b) * R;
        const tz = p.z + Math.cos(b) * R;
        const left = Math.max(cb.T - cb.t, dt);
        const d = Math.hypot(tx - cb.x, tz - cb.z);
        const v = Math.max(COILBACK.speed, d / left);
        if (d > 1e-6) {
          const k = Math.min(1, (v * dt) / d);
          const nx = cb.x + (tx - cb.x) * k;
          const nz = cb.z + (tz - cb.z) * k;
          cb.h = bearing(cb.x, cb.z, nx, nz);
          cb.x = nx;
          cb.z = nz;
        }
        recordPath(cb);
        if (!cb.trail.length || Math.hypot(cb.trail[cb.trail.length - 1].x - cb.x, cb.trail[cb.trail.length - 1].z - cb.z) >= 1.5) {
          cb.trail.push({ x: cb.x, z: cb.z });
          if (cb.trail.length > 12) cb.trail.shift();
        }
        if (cb.t < cb.T - EPS || pause) break;
        if (cb.noLunge > EPS || stinky(cb)) {
          // (stinky: it surfaces away from you and swims, no lunge)
          setCoil(cb, 'swim', COILBACK.swim);
          cb.R = range(COILBACK.circle);
          break;
        }
        if (!takeSlot('lunge')) {
          counts.waited++;
          cb.waitSlot = true;
          break; // (it stays under until a warning slot is free)
        }
        cb.waitSlot = false;
        const frostLane = cb.frostLane || cb.frostT > EPS;
        cb.frostLane = false;
        const T = warnTime(COILBACK.lane.warn, null, frostLane ? COILBACK.frost.lane : 0);
        const ln = rearSpot(cb, p, T);
        cb.x = ln.x0;
        cb.z = ln.z0;
        cb.h = bearing(ln.x0, ln.z0, ln.x1, ln.z1);
        cb.path = [{ x: cb.x, z: cb.z }];
        cb.lane = { id: nextId(`${cb.id}-l`), ...ln, w: COILBACK.lane.w, t: 0, T, run: 0, slot: true, frosted: frostLane };
        cb.hitKeys = new Set();
        setCoil(cb, 'rear', T);
        cb.trail = [];
        counts.lunges++;
        pop(word('lunge'), (ln.x0 + ln.x1) / 2, 2.5, (ln.z0 + ln.z1) / 2);
        sfx('hiss', ln.x0, ln.z0, { duration: T });
        warnLive('lunge');
        break;
      }
      case 'rear': {
        cb.lane.t = cb.t;
        if (cb.t >= cb.T - EPS) {
          setCoil(cb, 'lunge', COILBACK.lane.lunge);
          sfx('lunge', cb.x, cb.z);
        }
        break;
      }
      case 'lunge': {
        const ln = cb.lane;
        const k0 = ln.run;
        const k1 = clamp(cb.t / COILBACK.lane.lunge, 0, 1);
        ln.run = k1;
        const ax = ln.x0 + (ln.x1 - ln.x0) * k0;
        const az = ln.z0 + (ln.z1 - ln.z0) * k0;
        const bx = ln.x0 + (ln.x1 - ln.x0) * k1;
        const bz = ln.z0 + (ln.z1 - ln.z0) * k1;
        cb.x = bx;
        cb.z = bz;
        recordPath(cb);
        // every hull the head passes inside the lane: 12 and a 3 u shove out of it
        const ux = ln.len > 1e-6 ? (ln.x1 - ln.x0) / ln.len : 0;
        const uz = ln.len > 1e-6 ? (ln.z1 - ln.z0) / ln.len : 1;
        for (const h of hulls(p, ships)) {
          if (cb.hitKeys.has(h.key)) continue;
          const [x0, z0, x1, z1] = hullEnds(h);
          // inside the lane where the head has just passed (a hull that sails in behind it is safe)
          if (segDist(x0, z0, x1, z1, ax, az, bx, bz) > ln.w / 2 + EPS) continue;
          cb.hitKeys.add(h.key);
          hurtHull(h, COILBACK.lane.damage, bx, bz, 'lunge');
          counts.lungeHits++;
          const lat = (h.x - ln.x0) * -uz + (h.z - ln.z0) * ux;
          const sgn = Math.abs(lat) > 0.01 ? Math.sign(lat) : 1;
          shove(h, -uz * sgn, ux * sgn, COILBACK.lane.shove, COILBACK.lane.shoveTime);
          pop(word('bonk'), h.x, 3, h.z);
        }
        if (cb.t >= cb.T - EPS) {
          setCoil(cb, 'dizzy', COILBACK.dizzy);
          if (ln.slot) giveSlot('lunge');
          cb.lane = null;
          pop(word('dizzy'), cb.x, 4.5, cb.z);
        }
        break;
      }
      case 'dizzy': {
        if (cb.t >= cb.T - EPS) {
          setCoil(cb, 'swim', COILBACK.swim);
          cb.R = range(COILBACK.circle);
          cb.spin = rand() < 0.5 ? -1 : 1;
          cb.path = [{ x: cb.x, z: cb.z }, { x: cb.x - Math.sin(cb.h) * 0.6, z: cb.z - Math.cos(cb.h) * 0.6 }];
        }
        break;
      }
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- Rock Forts
  function hurtFort(f, dmg) {
    const d = Math.min(Math.max(0, dmg), f.hp);
    f.hp -= d;
    if (f.hp <= EPS) fortDown(f);
    return d;
  }
  function fortDown(f) {
    f.hp = 0;
    if (f.state === 'track' || f.state === 'lock') giveSlot('fort');
    f.state = 'down';
    f.t = 0;
    f.T = FORT.down;
    f.st = { id: null, t: 0, max: 0, pegs: 0 };
    f.burnPart = null;
    counts.forts++;
    pop(word('fortDown'), f.x, FORT.y1 + 1, f.z);
    sfx('down', f.x, f.z);
    payGold(FORT.gold, 'fort');
    announce('fortDown');
  }
  function stepFort(f, dt, p, ships) {
    f.t += dt;
    if (f.state === 'down') return;
    if (f.state === 'fire') {
      if (f.t >= FORT.fire - EPS) {
        f.state = 'idle';
        f.t = 0;
        f.shot = null;
      }
    }
    const inRange = p && hullDist(p, f.x, f.z) <= FORT.range + EPS;
    if (f.state === 'idle') {
      if (p) f.h = turnToward(f.h, bearing(f.x, f.z, p.x, p.z), 1.5 * dt);
      if (!inRange || held(f) || stinky(f)) return;
      f.reload -= dt;
      if (f.reload > EPS) return;
      if (!takeSlot('fort')) {
        counts.waited++;
        f.reload = 0;
        return;
      }
      f.state = 'track';
      f.t = 0;
      f.T = FORT.track + (frozen(f) ? FROST_WARN : 0);
      f.h = bearing(f.x, f.z, p.x, p.z);
      f.ax = p.x;
      f.az = p.z;
      counts.sights++;
      warnLive('fort');
      return;
    }
    if (f.state === 'track') {
      if (!inRange) {
        // (you sailed out of its range: it stops sighting)
        giveSlot('fort');
        f.state = 'idle';
        f.t = 0;
        f.reload = FORT.first;
        return;
      }
      // the gun swings after you (at most FORT.traverse rad/s); the line runs along it to your range
      f.h = turnToward(f.h, bearing(f.x, f.z, p.x, p.z), FORT.traverse * dt);
      const d = Math.hypot(p.x - f.x, p.z - f.z);
      f.ax = f.x + Math.sin(f.h) * d;
      f.az = f.z + Math.cos(f.h) * d;
      if (f.t >= f.T - EPS) {
        f.state = 'lock';
        f.t = 0;
        f.T = warnTime(FORT.lock, null);
        f.lx = Math.sin(f.h);
        f.lz = Math.cos(f.h);
        pop(word('aim'), f.x, FORT.y1 + 1.5, f.z);
        sfx('clack', f.x, f.z);
      }
      return;
    }
    if (f.state === 'lock') {
      if (f.t >= f.T - EPS) fortFire(f, p, ships);
    }
  }
  function fortFire(f, p, ships) {
    giveSlot('fort');
    // the first hull along the locked line (within range)
    const ex = f.x + f.lx * FORT.range;
    const ez = f.z + f.lz * FORT.range;
    let best = null;
    let bestAlong = Infinity;
    for (const h of hulls(p, ships)) {
      const [x0, z0, x1, z1] = hullEnds(h);
      if (segDist(x0, z0, x1, z1, f.x, f.z, ex, ez) > h.wid / 2 + FORT.hw + EPS) continue;
      // how far along the line it is (its nearest end or centre)
      const along = Math.min(...[[x0, z0], [x1, z1], [h.x, h.z]].map(([qx, qz]) => (qx - f.x) * f.lx + (qz - f.z) * f.lz));
      if (along < bestAlong) {
        bestAlong = along;
        best = h;
      }
    }
    counts.shots++;
    sfx('fire', f.x, f.z);
    const to = best ? Math.max(0, Math.min(FORT.range, bestAlong + best.wid / 2)) : FORT.range;
    f.shot = { x1: f.x + f.lx * to, z1: f.z + f.lz * to };
    if (best) {
      counts.shotHits++;
      hurtHull(best, FORT.damage, best.x, best.z, 'fort');
    }
    f.state = 'fire';
    f.t = 0;
    f.T = FORT.fire;
    f.reload = FORT.reload;
  }

  // ---------------------------------------------------------------- the step
  function tick(dt) {
    clock += dt;
    holdNow = call('hold') === true;
    const p = readPlayer();
    const ships = readShips();
    for (const f of foes) {
      if (f.isNew === null) f.isNew = newcomer(f.kind);
      if (f.isNew && f.graceEnd === null && !holdNow) f.graceT += dt;
      if (f.kind !== 'puffer') stepStatus(f, dt);
    }
    for (const f of foes) {
      if (f.kind === 'jolly') stepPack(f, dt, p, ships);
      else if (f.kind === 'coilback') stepCoilback(f, dt, p, ships);
      else if (f.kind === 'fort') stepFort(f, dt, p, ships);
    }
    stepPuffers(dt, p, ships);
    for (const [k, s] of shoves) if (clock >= s.until - EPS) shoves.delete(k);
    // the finished ones go (once their last show is over)
    for (let i = foes.length - 1; i >= 0; i--) {
      const f = foes[i];
      let gone = false;
      if (f.kind === 'jolly') gone = !rowing(f).length && !f.coconuts.length && f.boats.every((b) => b.t >= JOLLY.tip - EPS);
      else if (f.kind === 'puffer') gone = !f.waiting && !puffers.some((u) => u.patch === f.id);
      else if (f.kind === 'coilback') gone = f.state === 'home' && f.t >= f.T - EPS;
      else if (f.kind === 'fort') gone = f.state === 'down' && f.t >= f.T - EPS;
      if (gone) foes.splice(i, 1);
    }
    for (const pk of foes) if (pk.kind === 'jolly') pk.boats = pk.boats.filter((b) => b.state === 'row' || b.t < JOLLY.tip - EPS);
  }

  // ---------------------------------------------------------------- parts
  // Find a part: { f, kind, part, b? (a boat), u? (a puffer), k? (a hump) }; null when it is gone or can't be hit.
  function partOf(id) {
    if (disposed || typeof id !== 'string') return null;
    for (const f of foes) {
      if (f.kind === 'jolly') {
        if (!id.startsWith(`${f.id}-`)) continue;
        const b = f.boats.find((x) => x.id === id && x.state === 'row');
        return b ? { f, part: 'boat', b } : null;
      }
      if (f.kind === 'coilback') {
        if (id === `${f.id}-head`) return coilUp(f) && headUp(f) ? { f, part: 'head' } : null;
        for (let k = 0; k < COILBACK.hump.n; k++) if (id === `${f.id}-hump${k}`) return coilUp(f) && humpsUp(f) ? { f, part: 'hump', k } : null;
        continue;
      }
      if (f.kind === 'fort') {
        if (id === f.id) return f.state !== 'down' ? { f, part: 'fort' } : null;
        continue;
      }
    }
    const u = puffers.find((x) => x.id === id && x.state !== 'home');
    if (u) return { f: patchOf(u), part: 'puffer', u };
    return null;
  }
  const pufferR = (u) => PUFFER.r * (u.state === 'puff' ? 1 + (PUFFER.swell - 1) * smooth(u.t / 0.4) : 1);

  function targets() {
    const out = [];
    if (disposed) return out;
    for (const f of foes) {
      if (f.kind === 'jolly') {
        for (const b of f.boats) {
          if (b.state !== 'row') continue;
          out.push({ id: b.id, kind: 'jolly', part: 'boat', x: b.x, z: b.z, r: JOLLY.len / 2, y0: JOLLY.y0, y1: JOLLY.y1, hp: b.hp, maxHp: JOLLY.hp, name: FOE_NAMES.jolly, hidden: false });
        }
      } else if (f.kind === 'coilback') {
        if (f.state === 'home') continue;
        const H = COILBACK.head;
        if (!coilUp(f)) {
          out.push({ id: `${f.id}-head`, kind: 'coilback', part: 'head', x: f.x, z: f.z, r: H.r, y0: 0, y1: 0, hp: f.hp, maxHp: COILBACK.hp, name: FOE_NAMES.coilback, hidden: true });
          continue;
        }
        if (headUp(f)) out.push({ id: `${f.id}-head`, kind: 'coilback', part: 'head', x: f.x, z: f.z, r: H.r, y0: H.y - H.r, y1: H.y + H.r, hp: f.hp, maxHp: COILBACK.hp, name: FOE_NAMES.coilback, hidden: false });
        if (humpsUp(f)) {
          const U = COILBACK.hump;
          for (let k = 0; k < U.n; k++) {
            const q = humpAt(f, k);
            out.push({ id: `${f.id}-hump${k}`, kind: 'coilback', part: 'hump', x: q.x, z: q.z, r: U.r, y0: U.y - U.r, y1: U.y + U.r, hp: f.hp, maxHp: COILBACK.hp, name: FOE_NAMES.coilback, hidden: false });
          }
        }
      } else if (f.kind === 'fort') {
        if (f.state === 'down') continue;
        out.push({ id: f.id, kind: 'fort', part: 'fort', x: f.x, z: f.z, r: FORT.r, y0: FORT.y0, y1: FORT.y1, hp: f.hp, maxHp: FORT.hp, name: FOE_NAMES.fort, hidden: false });
      }
    }
    for (const u of puffers) {
      if (u.state === 'home') continue;
      const r = pufferR(u);
      out.push({ id: u.id, kind: 'puffer', part: 'puffer', x: u.x, z: u.z, r, y0: 0, y1: 2 * r, hp: PUFFER.hp, maxHp: PUFFER.hp, name: PUFFER.name, hidden: false });
    }
    return out;
  }

  function hits(id, x, y, z) {
    const P = partOf(id);
    if (!P) return false;
    x = num(x, NaN);
    y = num(y, NaN);
    z = num(z, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
    if (P.part === 'boat') {
      const b = P.b;
      if (y < JOLLY.y0 - 0.5 || y > JOLLY.y1 + EPS) return false;
      const fx = Math.sin(b.h);
      const fz = Math.cos(b.h);
      const along = (x - b.x) * fx + (z - b.z) * fz;
      const lat = (x - b.x) * -fz + (z - b.z) * fx;
      return Math.abs(along) <= JOLLY.len / 2 + 0.3 && Math.abs(lat) <= JOLLY.wid / 2 + 0.3;
    }
    if (P.part === 'puffer') {
      const r = pufferR(P.u);
      return y >= -0.5 && y <= 2 * r + EPS && Math.hypot(x - P.u.x, z - P.u.z) <= r + 0.3;
    }
    if (P.part === 'head') {
      const H = COILBACK.head;
      return Math.hypot(x - P.f.x, y - H.y, z - P.f.z) <= H.r + EPS;
    }
    if (P.part === 'hump') {
      const U = COILBACK.hump;
      const q = humpAt(P.f, P.k);
      return Math.hypot(x - q.x, y - U.y, z - q.z) <= U.r + EPS;
    }
    if (P.part === 'fort') return y >= FORT.y0 - EPS && y <= FORT.y1 + EPS && Math.hypot(x - P.f.x, z - P.f.z) <= FORT.r + EPS;
    return false;
  }

  function hit(id, info) {
    const P = partOf(id);
    if (!P) return null;
    const base = Math.max(0, num(prop(info, 'dmg'), 0));
    const crit = prop(info, 'crit') === true;
    const ammo = prop(info, 'ammo');
    let w = null;
    let dmg = 0;
    if (P.part === 'boat') {
      if (ammo === 'grape') {
        dmg = P.b.hp;
        tipBoat(P.f, P.b, true);
        w = word('splosh');
      } else {
        dmg = hurtBoat(P.f, P.b, base, info);
        if (P.b.state !== 'row') w = word('splosh');
      }
    } else if (P.part === 'puffer') {
      dmg = Math.min(base, PUFFER.hp);
      counts.pffts++;
      sendPufferHome(P.u, 'hit');
      payCoins(P.u.x, P.u.z, PUFFER.gold);
      w = word('pfft');
    } else if (P.part === 'head') {
      const cb = P.f;
      const dizzy = cb.state === 'dizzy';
      dmg = hurtCoil(cb, base * (dizzy ? COILBACK.head.dizzy : COILBACK.head.mul));
      cb.hurt = 1;
      if (dizzy) w = word('bonk');
    } else if (P.part === 'hump') {
      dmg = hurtCoil(P.f, base * COILBACK.hump.mul);
      P.f.hurt = 1;
      w = word('thud');
    } else if (P.part === 'fort') {
      dmg = hurtFort(P.f, base);
      if (P.f.state === 'down') w = word('fortDown');
    }
    if (!w && crit) w = word('crit');
    return { dmg, word: w };
  }

  function special(id, ammo) {
    const P = partOf(id);
    if (!P || !P.f || P.part === 'puffer') return null;
    const f = P.f;
    const st = f.st;
    const at = P.b || f;
    if (f.kind === 'coilback') {
      // its own reactions (COILBACK.frost / .stink) in place of STATUS's boss values; fire as any foe's
      if (ammo === 'frost') {
        f.noDive = Math.max(f.noDive, COILBACK.frost.noDive);
        f.frostT = Math.max(f.frostT, COILBACK.frost.noDive);
        if (f.state === 'rear' && f.lane && !f.lane.frosted) {
          // (the lane it shows now waits half a second more)
          f.lane.frosted = true;
          f.T += COILBACK.frost.lane;
          f.lane.T = f.T;
        } else if (f.state !== 'rear' && f.state !== 'lunge') f.frostLane = true;
        if (st.id === 'fire') {
          st.id = null;
          st.t = 0;
          f.burnPart = null;
          return word('fireOut');
        }
        return word('frost');
      }
      if (ammo === 'stink') {
        if (st.id === 'stink') return null;
        if (st.pegs > EPS) return word('pegs');
        f.noLunge = Math.max(f.noLunge, COILBACK.stink.noLunge);
        f.st = { id: 'stink', t: COILBACK.stink.noLunge, max: COILBACK.stink.noLunge, pegs: 0 };
        // it dives off (a lane it shows is called off)
        if (f.state === 'rear' || f.state === 'lunge') {
          if (f.lane && f.lane.slot) giveSlot('lunge');
          f.lane = null;
        }
        if (f.state === 'swim' || f.state === 'approach' || f.state === 'rear' || f.state === 'lunge' || f.state === 'dizzy') {
          setCoil(f, 'dive', COILBACK.dive);
          counts.dives++;
        }
        sfx('sneeze', f.x, f.z);
        return word('achoo');
      }
      if (ammo === 'fire') {
        const t = status.fireTime();
        f.st = { id: 'fire', t, max: t, pegs: st.pegs };
        f.burnPart = id;
        return word('fire');
      }
      return null;
    }
    if (ammo === 'frost') {
      let w = null;
      if (st.id === 'fire') {
        w = word('fireOut');
        f.burnPart = null;
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
      f.st = { id: 'frost', t, max: t, pegs: st.id === 'stink' ? status.pegs() : st.pegs };
      return w || word('frost');
    }
    if (ammo === 'fire') {
      let w = word('fire');
      if (st.id === 'stink') {
        w = word('kaboom');
        st.pegs = status.pegs();
        burn(f, status.burst());
      }
      const t = status.fireTime();
      f.st = { id: 'fire', t, max: t, pegs: f.st.pegs };
      f.burnPart = id;
      return w;
    }
    if (ammo === 'stink') {
      if (st.id === 'stink') return null;
      if (st.pegs > EPS) return word('pegs');
      const t = status.stinkTime();
      f.st = { id: 'stink', t, max: t, pegs: 0 };
      f.burnPart = null;
      sfx('sneeze', at.x, at.z);
      return word('achoo');
    }
    return null;
  }

  // ---------------------------------------------------------------- slots, tags, visuals, state
  function slotOf(f) {
    if (f.kind === 'jolly') return rowing(f).length > 0;
    if (f.kind === 'puffer') return f.owner === null && (f.waiting || puffers.some((u) => u.patch === f.id && u.state !== 'home'));
    if (f.kind === 'coilback') return f.state !== 'home';
    if (f.kind === 'fort') return f.state !== 'down';
    return false;
  }
  const sameOwner = (a, b) => a === b || ((typeof a === 'number' || typeof a === 'string') && (typeof b === 'number' || typeof b === 'string') && String(a) === String(b));
  function isNewTag(f) {
    if (!f.isNew) return false;
    if (f.graceEnd === null) return true;
    return clock - f.graceEnd < Math.max(0, meetT('newTag') - meetT('grace')) - EPS;
  }
  function tags() {
    const out = [];
    if (disposed) return out;
    for (const f of foes) {
      if (f.kind === 'jolly') {
        const alive = rowing(f);
        if (!alive.length) continue;
        const x = alive.reduce((s, b) => s + b.x, 0) / alive.length;
        const z = alive.reduce((s, b) => s + b.z, 0) / alive.length;
        out.push({ id: f.id, name: FOE_NAMES.jolly, x, y: 3, z, frac: null, count: alive.length, under: false, isNew: isNewTag(f) });
      } else if (f.kind === 'coilback') {
        if (f.state === 'home') continue;
        out.push({ id: f.id, name: FOE_NAMES.coilback, x: f.x, y: headUp(f) ? COILBACK.head.y + 2.4 : 2, z: f.z, frac: clamp(f.hp / COILBACK.hp, 0, 1), count: null, under: !coilUp(f), isNew: isNewTag(f) });
      } else if (f.kind === 'fort') {
        if (f.state === 'down') continue;
        out.push({ id: f.id, name: FOE_NAMES.fort, x: f.x, y: FORT.y1 + 2.2, z: f.z, frac: clamp(f.hp / FORT.hp, 0, 1), count: null, under: false, isNew: isNewTag(f) });
      }
    }
    return out;
  }
  function visuals() {
    const out = { packs: [], coconuts: [], puffers: [], coilback: null, forts: [], rings: [], lanes: [], lines: [] };
    if (disposed) return out;
    for (const f of foes) {
      if (f.kind === 'jolly') {
        out.packs.push({
          id: f.id,
          frozen: frozen(f),
          burning: f.st.id === 'fire' ? f.burnPart : null,
          boats: f.boats.map((b) => ({ id: b.id, x: b.x, z: b.z, h: b.h, speed: b.v, state: b.state, t: b.t, hp: b.hp, throwT: b.throwT, monkey: b.monkey ? { ...b.monkey } : null })),
        });
        for (const c of f.coconuts) {
          out.coconuts.push({ id: c.id, pack: f.id, fx: c.fx, fz: c.fz, x: c.x, z: c.z, t: c.t, T: c.T, arc: JOLLY.coconut.arc });
          out.rings.push({ id: c.id, kind: 'coconut', x: c.x, z: c.z, r: JOLLY.coconut.r, t: c.t, T: c.T });
        }
      } else if (f.kind === 'coilback') {
        if (out.coilback) continue; // (one serpent drawn: there is only ever one a wave)
        const H = COILBACK.head;
        let headK = 1;
        if (f.state === 'dive') headK = 1 - smooth(f.t / f.T);
        else if (f.state === 'under') headK = 0;
        else if (f.state === 'rear') headK = smooth(f.t / 0.6);
        const humpK = f.state === 'approach' || f.state === 'swim' ? 1 : f.state === 'dive' ? 1 - smooth(f.t / (f.T * 0.75)) : f.state === 'dizzy' ? smooth(f.t / 1) * 0.6 : f.state === 'home' ? 0.7 : 0;
        out.coilback = {
          id: f.id,
          state: f.state === 'approach' ? 'swim' : f.state,
          t: f.t,
          T: Number.isFinite(f.T) ? f.T : 0,
          head: { x: f.x, z: f.z, h: f.h, y: H.y, k: f.state === 'home' ? 0.6 : headK },
          humps: Array.from({ length: COILBACK.hump.n }, (_, k) => ({ ...humpAt(f, k), k: humpK })),
          trail: f.state === 'under' || f.state === 'dive' ? f.trail.map((q) => ({ x: q.x, z: q.z })) : [],
          hp: f.hp,
          maxHp: COILBACK.hp,
          hurt: f.hurt,
          frozen: f.frostT > EPS,
          burning: f.st.id === 'fire',
          scale: f.scale ? { ...f.scale } : null,
        };
        if (f.lane && (f.state === 'rear' || f.state === 'lunge')) {
          const L = f.lane;
          out.lanes.push({ id: L.id, kind: 'lunge', x0: L.x0, z0: L.z0, x1: L.x1, z1: L.z1, w: L.w, t: f.state === 'rear' ? f.t : L.T, T: L.T, run: L.run });
        }
      } else if (f.kind === 'fort') {
        out.forts.push({ id: f.id, x: f.x, z: f.z, h: f.h, state: f.state, t: f.t, T: f.T, hp: f.hp, maxHp: FORT.hp, burning: f.st.id === 'fire' });
        if (f.state === 'track' || f.state === 'lock') {
          const x1 = f.state === 'track' ? f.ax : f.x + f.lx * FORT.range;
          const z1 = f.state === 'track' ? f.az : f.z + f.lz * FORT.range;
          out.lines.push({ id: `${f.id}-line`, kind: 'fort', x0: f.x, y0: FORT.gunY, z0: f.z, x1, z1, state: f.state, t: f.t, T: f.T });
        } else if (f.state === 'fire' && f.shot) {
          out.lines.push({ id: `${f.id}-line`, kind: 'fort', x0: f.x, y0: FORT.gunY, z0: f.z, x1: f.shot.x1, z1: f.shot.z1, state: 'fire', t: f.t, T: f.T });
        }
      }
    }
    for (const u of puffers) {
      const k = u.state === 'puff' ? smooth(u.t / 0.4) : 0;
      out.puffers.push({ id: u.id, x: u.x, z: u.z, h: u.h, state: u.state, t: u.t, T: u.T, k, owner: u.owner });
      if (u.state === 'puff') out.rings.push({ id: u.id, kind: 'puff', x: u.x, z: u.z, r: PUFFER.pop.r, t: u.t, T: u.T });
    }
    return out;
  }
  function snapshot() {
    const r = round6;
    const st = (f) => ({ id: f.st.id, t: r(f.st.t), pegs: r(f.st.pegs) });
    return {
      time: r(clock),
      slots: foes.reduce((n, f) => n + (slotOf(f) ? 1 : 0), 0),
      puffersAlive: puffersAlive(),
      warnHeld: slotsHeld.length,
      foes: foes.map((f) => {
        const o = { id: f.id, kind: f.kind, isNew: f.isNew, grace: f.isNew && f.graceEnd === null, status: f.kind === 'puffer' ? null : st(f) };
        if (f.kind === 'jolly') {
          o.boats = f.boats.map((b) => ({ id: b.id, x: r(b.x), z: r(b.z), h: r(b.h), v: r(b.v), hp: r(b.hp), state: b.state, clock: r(b.clock) }));
          o.coconuts = f.coconuts.map((c) => ({ id: c.id, x: r(c.x), z: r(c.z), t: r(c.t), T: r(c.T) }));
        } else if (f.kind === 'puffer') {
          Object.assign(o, { owner: f.owner, n: f.n, waiting: f.waiting, x: r(f.x), z: r(f.z) });
        } else if (f.kind === 'coilback') {
          Object.assign(o, { state: f.state, t: r(f.t), T: Number.isFinite(f.T) ? r(f.T) : null, x: r(f.x), z: r(f.z), h: r(f.h), hp: r(f.hp), noDive: r(f.noDive), noLunge: r(f.noLunge), frost: r(f.frostT), waitSlot: f.waitSlot });
          o.lane = f.lane ? { x0: r(f.lane.x0), z0: r(f.lane.z0), x1: r(f.lane.x1), z1: r(f.lane.z1), len: r(f.lane.len), w: f.lane.w, T: r(f.lane.T), run: r(f.lane.run) } : null;
        } else if (f.kind === 'fort') {
          Object.assign(o, { state: f.state, t: r(f.t), T: r(f.T), x: r(f.x), z: r(f.z), h: r(f.h), hp: r(f.hp), reload: r(f.reload) });
        }
        return o;
      }),
      puffers: puffers.map((u) => ({ id: u.id, patch: u.patch, owner: u.owner, state: u.state, x: r(u.x), z: r(u.z), t: r(u.t), T: r(u.T), life: r(u.life) })),
      shoves: [...shoves.keys()].map(String),
      counts: { ...counts },
      disposed,
    };
  }

  // ---------------------------------------------------------------- the API
  return {
    spawn(kind, x, z, opts) {
      if (disposed || !KINDS.includes(kind)) return null;
      let sx = num(x, NaN);
      let sz = num(z, NaN);
      if (!Number.isFinite(sx) || !Number.isFinite(sz)) {
        // (no spot: 40 u ahead of your bow)
        const p = readPlayer();
        if (!p) return null;
        sx = p.x + Math.sin(p.h) * 40;
        sz = p.z + Math.cos(p.h) * 40;
      }
      const s = intoWorld(sx, sz);
      if (kind === 'jolly') return spawnPack(s.x, s.z, opts);
      if (kind === 'puffer') return spawnPatch(s.x, s.z, opts);
      if (kind === 'coilback') return spawnCoilback(s.x, s.z);
      return spawnFort(s.x, s.z);
    },
    step(dt) {
      if (disposed) return;
      let left = num(dt, 0);
      if (!(left > 0)) return;
      left = Math.min(left, 1);
      while (left > EPS) {
        const d = Math.min(left, 1 / 60);
        tick(d);
        left -= d;
      }
    },
    slots() {
      if (disposed) return 0;
      return foes.reduce((n, f) => n + (slotOf(f) ? 1 : 0), 0);
    },
    alive(kind) {
      if (disposed) return 0;
      if (kind === 'puffer') return puffersAlive();
      if (kind === 'jolly' || kind === 'coilback' || kind === 'fort') return foes.reduce((n, f) => n + (f.kind === kind && slotOf(f) ? 1 : 0), 0);
      return 0;
    },
    sendHome(owner) {
      if (disposed || owner === undefined || owner === null) return;
      for (const u of puffers) if (u.owner !== null && sameOwner(u.owner, owner)) sendPufferHome(u, 'owner');
      for (const f of foes) if (f.kind === 'puffer' && f.owner !== null && sameOwner(f.owner, owner)) f.waiting = false;
    },
    targets,
    hits,
    hit,
    special,
    boardWhy(id) {
      const s = typeof id === 'string' ? id : '';
      for (const f of foes) {
        if (f.kind === 'jolly' && s.startsWith(`${f.id}-`)) return 'small';
        if (f.kind === 'fort' && s === f.id) return 'fort';
      }
      return 'monster';
    },
    push(ship) {
      if (disposed || !ship || typeof ship !== 'object') return null;
      let key = prop(ship, 'id');
      const p = readPlayer();
      if (prop(ship, 'kind') === 'player' || (p && Math.abs(num(prop(ship, 'x'), NaN) - p.x) < 1e-6 && Math.abs(num(prop(ship, 'z'), NaN) - p.z) < 1e-6)) key = 'player';
      const s = shoves.get(key);
      if (!s || clock >= s.until - EPS) return null;
      return { vx: s.vx, vz: s.vz };
    },
    tags,
    visuals,
    get state() {
      return snapshot();
    },
    dispose() {
      if (disposed) return;
      while (slotsHeld.length) giveSlot(slotsHeld[slotsHeld.length - 1]);
      disposed = true;
      foes.length = 0;
      puffers = [];
      shoves.clear();
    },
  };
}
