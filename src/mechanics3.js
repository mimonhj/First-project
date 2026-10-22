// Voyage III's rules (SPEC3 §4.2, §5.3): the new ships' behaviours (the Shark Raider's ram, the Bomb Ketch's
// mortar, the Fire Ship, the Inkheart's ink pots and the flight of her crew) and the hazards of the Kraken
// Seas (waterspouts on level 7, rogue waves on level 8). The ship behaviours follow the type flags (ram,
// mortar, fireship, flagship) on every level, so a test can G.spawn them anywhere; `ids` only switch the
// hazards on: 'spouts' (L7), 'rogue' (L8) and 'flagship' (L9: when the Inkheart falls her crew flee and the
// Kraken is due).
//
// Pure: no three.js, imports nothing (the Node tests load it as a data: URL, like mechanics.js). Every number
// lives in one of the tables below. Gameplay runs in SIMULATED time (the dt given to step()) and rolls with
// ctx.rng (fed from main's combatRng), never Math.random. A waterspout's position is a pure function of the
// hazard clock and its seeded loop and start; so is a rogue wave's crest.
//
// createMechanics3(ids, ctx) → the SPEC2 §6.3 hook shape (see mechanics.js) plus:
//   init(), onSpawn(e, waveIndex), onCapture(e), onSink(e), onRemove(e),
//   step(dt)                      every simulation step, after moveShip, before separateShips (as mechanics.js)
//   steer(e, dt) → { h, speed } | null   a shark with an attack slot (she comes at you bow first, lines up for
//                                 1.5 s, surges on a locked heading, sheers off broadside while she cools: RAM and
//                                 RAM.approach), a bomb ketch keeping her range, a fire ship sailing at you, a
//                                 fleeing ship making for the world edge, a boss turning her bow into a rogue wave
//   holdFire(e) → boolean         fire ships (no guns) and fleeing ships
//   drift(s) → { vx, vz } | null  spout pulls and flings, rogue-wave and ram pushes (main skips the glued pair)
//   avoid() → [{ x, z, r }]       pirates keep r 16 off every waterspout
//   shipMods(s) → { speedMul, capAdd, turnMul, spin }   an ink slick (speed ×0.6), a surf (+2 to the cap), a
//                                 wobble (turn ×0.5), a spout's core (spin +2 rad/s), a shark's surge (her cap
//                                 raised to 16), a fleeing ship (her cap raised to 7), a fire ship whose fuse is
//                                 out (3 u/s). The same frozen identity object when nothing applies.
//   objective() → null, minimap() → [{ kind: 'spout' | 'rogue' | 'slick', x, z, r, h?, forming?, warning? }],
//   summary() → [], bonus() → 0,
//   visuals() → { spouts, rogue, slicks, rams, fireRings, shells }   what the envs and main draw (below)
//   addSlick(x, z)                an ink slick where an ink pot (or the Kraken's ink blob) lands (main's
//                                 updateBombs calls it); at most INK.slick.max, the oldest goes first
//   get krakenDue                 the flagship has fallen, her crew are gone, struck ships are taken and no
//                                 boarding is running (main then starts the Kraken's dread, SPEC3 §5.7.1)
//   get state                     a fresh plain (JSON-able) snapshot for tests
//   dispose()
//   wave(angle), spout(x, z)      test hooks (G.mechanics3.wave / spout, SPEC3 §11.3): a rogue wave coming
//                                 from bearing `angle` now, a waterspout forming now at (x, z) (it stays put);
//                                 both work on any level and return their visuals() entry
//
// visuals() (fresh plain objects; ids are stable while a thing lives):
//   spouts:    [{ id, x, z, r: 6, pull: 14, state: 'forming' | 'active' | 'collapsing', t, T, k }]   (k = t / T)
//   rogue:     null | { id, x, z, h, from, len: 120, height: 7, speed: 16, t, warn, warning, k, ahead }
//              (x, z: the crest's middle; h: the heading it rolls along (travel (sin h, cos h)); from: the
//               bearing it comes from, h − π, as env.rogueDirs gives it; the crest runs `len` across that travel;
//               warning: t < warn; k = t / warn capped at 1; ahead: how far you are ahead of the crest)
//   slicks:    [{ id, x, z, r, t, T }]                  (they fade over their last INK.slick.fade s)
//   rams:      [{ id, x, z, h, state: 'windup' | 'surge', t, T, k }]   (id: the ship's id; her tag's RAM icon)
//   fireRings: [{ id, x, z, r: 6, t, T: 1.6, armed, k }]               (a lit fire ship's danger ring)
//   shells:    [{ id, kind: 'shell' | 'ink', x, z, r, t, T, from }]   (mortar shells and ink pots in the air;
//              main draws their rings from its own bombs: this list is for the minimap and the tests)
//
// ctx = SPEC2's mechanics ctx (see mechanics.js: env, player, enemies, fighting, relative, damage, escape, pop,
//   showBanner, announce, sfx, rng, time, def) + SPEC3 §11.1's:
//   launchBomb({ kind, from, tx, tz, radius, damage, warn })   a mortar shell or an ink pot (main adds the
//                                 Lighthouse's warnBonus to `warn`, deals the damage and calls addSlick for ink)
//   flee(e)                       take her out of the fight now (out of fighting(), statuses cleared, no loot, no
//                                 capture, no feat); this module then steers her to the world edge at 7 u/s and
//                                 removes her with ctx.escape(e) (foam, no penalty) after 5 s
//   explode(x, z, r, dmg, src)    a fire ship's blast: its LOOK AND SOUND only (flash, fireball, shake, `blast`);
//                                 the damage is dealt here, through ctx.damage, with the falloff of §4.2
//   status(e) → { id, t, max, immune }   her special status (specials.js); defaults to e.status
//   douse(e)                      water puts her fire out (a rogue wave, a spout's core); main pops FIRE OUT!
//   playerTurn()                  your turn input, −1..1 (positive = left), for leading mortar shells and ink pots
//   warnBonus()                   the Lighthouse's extra warning seconds
//   surrender(e)                  she strikes her colours (a frozen fire ship)
// and these optional members (each has a safe default when missing):
//   attacking(e) → boolean        she holds one of main's attack slots (default: true). A shark rams and a ketch
//                                 keeps her range and lobs only when attacking; a fire ship needs no slot.
//   hold() → boolean              the hazards wait (default: false): main's fly-in and the boarding truce
//                                 (swing..result), as its bombs do. Nothing moves, forms, ticks or charges then.
//   boarding() → boolean          a boarding is running (default: false); krakenDue waits for it
//   capture(e)                    take a struck ship as at a level clear (at the flagship's fall)
//   turnRate(ship) → rad/s        the player's turn rate now, to lead your turn (default: her type's turn)
// Every ctx member is optional (missing ones do nothing), and every hook takes junk without throwing.
//
// Signals on ships: a fire ship that blew up gets e.exploded = true before main sinks her (main drops no coins
// for her). Everything else lives here and shows through visuals() and state.
//
// composeMechanics([a, b]) joins a createMechanics instance (a, Act II) and a createMechanics3 instance (b)
// into the one `mechanics` main calls (SPEC3 §11.1; written in full in Stage 0, kept as it is by 1B).

export const MECHANIC3_IDS = ['spouts', 'rogue', 'flagship'];

// ---------------------------------------------------------------------------------------- tables
// (SPEC3's starting values; Stage 3 tunes them with the bots. Times in seconds, distances in u.)

/**
 * Waterspouts (§5.3, level 7). active: how many at once during wave 1 / wave 2 (the second slot starts `stagger`
 * s after the first). speed and clear: the env's loops (about 2.5 u/s, clear of land and your start by r + 8).
 * form: the harmless forming (+ the Lighthouse's bonus), life: active, collapse: winding down; the next forms
 * `next` s later at a loop point at least `away` from you and `spacing` from the other spouts, one no farther than
 * `near` when the loops have one (so the twisters come to the fight, not to the far end of the map). pull: inside r,
 * every ship drifts toward the core at `speed`. core: inside r a ship spins at `spin` rad/s and takes 1 hp every
 * `tick` s (`dps`); after `fling` s inside she is thrown outward at `flingSpeed` for `flingTime`. Pirates keep
 * `avoid` off.
 */
export const SPOUTS = {
  active: [2, 3],
  stagger: 4,
  speed: 2.5,
  clear: 8,
  form: 3,
  life: 22,
  collapse: 2,
  next: [6, 9],
  away: 30,
  near: 70,
  spacing: 20,
  pull: { r: 14, speed: 2 },
  core: { r: 6, spin: 2, dps: 4, tick: 0.25, fling: 1.5, flingSpeed: 6, flingTime: 1 },
  avoid: 16,
};

/**
 * Rogue waves (§5.3, level 8): the first after `first` s of combat, then every `every` s, one at a time. A crest
 * `length` long rolls at `speed` from `start` (+ startBonus × the Lighthouse's bonus) behind you, from one of
 * env.rogueDirs, through where you are; the warning lasts `warn` (+ the bonus). A rogueDirs angle `a` is the bearing
 * the wave comes FROM, in the ships' heading convention: its crest starts at you + start × (sin a, cos a) and rolls
 * along heading a + π (so env.rogueDirs names the open sea, seen from the middle of the map). When it passes a
 * ship the angle between her heading and its travel decides: under sideOn[0]° she surfs (+surf to her cap for
 * surfTime), over sideOn[1]° she rides it, between she takes `damage`, is pushed `push` along over `pushTime` and
 * wobbles (turn × wobbleTurn) for `wobble`. Bosses turn bow-in once a crest is within `bowIn` of them. A wave is
 * gone once its crest is `past` beyond the world edge (or after maxLife).
 */
export const ROGUE = {
  first: 30,
  every: [24, 32],
  warn: 4,
  length: 120,
  height: 7,
  speed: 16,
  start: 70,
  startBonus: 16,
  sideOn: [50, 130],
  damage: 10,
  push: 6,
  pushTime: 0.5,
  wobble: 1,
  wobbleTurn: 0.5,
  surf: 2,
  surfTime: 2,
  bowIn: 100,
  past: 10,
  maxLife: 40,
};

/**
 * The Shark Raider's charge (§4.2): attacking, with you within `reach` and `cone` rad of her bow, she lines up
 * for `windup` s (at windupSpeed × her top speed), then surges for `surge` s at `speed` on a locked heading
 * (frost: × frost). Hull contact (centre distance < (len_a + len_b) × contact): you take
 * round(damage × min(1, v / speed)), she takes `self`, both are pushed apart at `push` for `pushTime` and she
 * keeps `after` of her speed. Then `cooldown` s before the next charge. Stink cancels a charge.
 * Her course while she holds an attack slot (`approach`; without a slot she waits like any pirate): idle, she comes
 * at you bow first, at her top speed beyond `far` u (main's engage + 8 for her engage of 18) and at `speed` × her
 * top speed inside it, until `near` u; inside `near` (you are off her bow, or she would be winding up) and all
 * through her cooldown she sheers off broadside at `sheer` × her top speed: turned `out` rad away from you while
 * closer than `ring`, and `out` rad back towards you once beyond `reach`, so she has room to come round again
 * when her cooldown ends (a charge about every 10 s).
 */
export const RAM = {
  reach: 25,
  cone: 0.35,
  windup: 1.5,
  windupSpeed: 0.4,
  surge: 2,
  speed: 16,
  frost: 0.5,
  contact: 0.36,
  damage: 10,
  self: 8,
  push: 4,
  pushTime: 0.6,
  after: 0.3,
  cooldown: 6,
  approach: { far: 26, speed: 0.7, near: 13, sheer: 0.8, out: 0.7, ring: 18 },
};

/**
 * The Bomb Ketch's mortar (§4.2): she keeps `keep` u off (under `flee` she runs straight away, under keep[0] she
 * opens the range on a `slant`, inside the band she crosses at `cruise` × her top speed). Every `every` s, with
 * you `range` u away, she lobs a shell from `muzzle` u up at your predicted spot (lead × the shell's flight of
 * your turn's arc): ring `radius`, `damage`, warning `warn` (+ the Lighthouse's bonus, added by main). Stink
 * pauses her clock.
 */
export const MORTAR = { keep: [35, 45], flee: 20, slant: 0.6, cruise: 0.6, every: [6, 8], range: [25, 48], lead: 0.8, muzzle: 2.5, radius: 4.5, damage: 12, warn: 2.2 };

/**
 * The Fire Ship (§4.2): within `light` u of you she is lit (a danger ring of r `ring`), `arm` s later armed;
 * armed, with her (her centre, as "within 30 u" is) within `reach` of any hull, or touching one, she explodes:
 * `blast` at her centre falling to `edge` at `ring` (measured from her centre to each hull), to every ship.
 * Touching = main's contact distance (centres closer than (len_a + len_b) × RAM.contact, which separateShips keeps
 * ships apart by) + `touch`: a ship alongside is held 4.4–4.6 u from her centre by that rule, so without it she
 * could sail alongside you for ever; a ship she touches always counts as inside her ring (≥ `edge`). (Measuring
 * `reach` between the hulls instead made a fire ship coming bow-first blow up 7.75 u from your hull's side, out
 * of her own ring: a harmless bang.) Sunk while lit, she explodes where she is. Frost puts her fuse out for good:
 * she strikes her colours and sails at most `frozenSpeed`.
 */
export const FIRESHIP = { light: 30, ring: 6, arm: 1.6, reach: 4, touch: 0.25, blast: 22, edge: 11, frozenSpeed: 3 };

/**
 * The Inkheart's ink pots and slicks (§4.2; the Kraken's ink blob reads these too, through ctx.tables.INK):
 * every `every` s she lobs `pots` pots from `muzzle` u up at your predicted spot (lead × the flight) ± `scatter`:
 * ring `radius`, `damage`, warning `warn` (+ the bonus). Each leaves a slick of r `slick.r` for `slick.time` s:
 * a ship whose centre is inside has her speed cap × slick.speedMul; at most slick.max (the oldest goes); when
 * the flagship falls they fade over slick.fade s.
 */
export const INK = { every: 10, pots: 2, scatter: 6, lead: 1, muzzle: 4, radius: 4, damage: 8, warn: 1.8, slick: { r: 7, time: 6, speedMul: 0.6, max: 3, fade: 1 } };

/** When the Inkheart falls her crew flee (§4.2): for the nearest world edge at `speed`, gone after `remove` s. */
export const FLEE = { speed: 7, remove: 5 };

// The words this module pops, shows and announces (#game-live), so every screen says the same thing.
const WORDS = {
  ram: 'RAM!',
  crunch: 'CRUNCH!',
  whoosh: 'WHOOSH!',
  splash: 'SPLASH!',
  rode: 'RODE IT!',
  surf: "SURF'S UP!",
  inky: 'INKY!',
  boom: 'BOOM!',
  givesUp: 'GIVES UP!',
  banner: {
    mortar: 'Mortar shell!<small>Steer out of the orange circle</small>',
    fireship: 'Fire ship!<small>Sink her or freeze her before she reaches you!</small>',
    givesUp: 'The fire ship gives up!<small>Grapple her: she is yours!</small>',
    rogue: 'ROGUE WAVE!<small>Turn your bow or your stern to it!</small>',
    flee: 'The Kraken Crew flee!',
  },
  live: {
    ram: 'RAM! Turn away from her bow!',
    mortar: 'Mortar shell! Steer out of the orange circle.',
    fireship: 'Fire ship! Sink her or freeze her before she reaches you.',
    givesUp: 'The fire ship gives up.',
    ink: 'Ink pots! Keep moving.',
    spout: 'Waterspout! Keep clear of the twister.',
    rogue: 'Rogue wave! Turn your bow or your stern to it.',
    flee: 'The Kraken Crew flee!',
  },
};
const POP_Y = 4; // pops float this high over the sea

// --------------------------------------------------------------------------------------- helpers

const EPS = 1e-9;
const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;
const isObj = (v) => v !== null && typeof v === 'object';
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v, d) => (finite(v) ? v : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const IDENTITY = Object.freeze({ speedMul: 1, capAdd: 0, turnMul: 1, spin: 0 });
const NO_VISUALS = Object.freeze({ spouts: Object.freeze([]), rogue: null, slicks: Object.freeze([]), rams: Object.freeze([]), fireRings: Object.freeze([]), shells: Object.freeze([]) });

function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

const isShip = (s) => isObj(s) && finite(s.x) && finite(s.z);
const typeOf = (s) => (isObj(s) && isObj(s.type) ? s.type : {});
/** Afloat and not on its way down. */
const afloat = (s) => isShip(s) && num(s.hp, 0) > 0 && !(num(s.sinking, 0) > 0);
/** Afloat and still on the sea for the hazards (struck and fleeing ships too: they can still be hurt). */
const hurtable = (s) => afloat(s) && !s.captured && !s.escaped;
const lenOf = (s) => Math.max(0.1, num(typeOf(s).len, 10));
const widOf = (s) => Math.max(0.1, num(typeOf(s).wid, 3));
const maxOf = (s) => Math.max(0, num(typeOf(s).maxSpeed, 0));
const idOf = (s) => (finite(s.id) ? s.id : null);

// Same as main.js relative(): the point's distance along the ship's bow and to its starboard.
function relativeLocal(ship, tx, tz) {
  const dx = tx - ship.x;
  const dz = tz - ship.z;
  const h = num(ship.h, 0);
  return { along: dx * Math.sin(h) + dz * Math.cos(h), lat: -dx * Math.cos(h) + dz * Math.sin(h), dist: Math.hypot(dx, dz) };
}

// A seeded stand-in when ctx.rng is missing or broken (mulberry32), so the rules stay deterministic.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A hull as a capsule: the keel line from stern to bow, `r` (half her beam) round it.
function hullSeg(s) {
  const h = num(s.h, 0);
  const r = widOf(s) / 2;
  const half = Math.max(0, lenOf(s) / 2 - r);
  const fx = Math.sin(h) * half;
  const fz = Math.cos(h) * half;
  return { ax: s.x - fx, az: s.z - fz, bx: s.x + fx, bz: s.z + fz, r };
}
function pointSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const L = dx * dx + dz * dz;
  const t = L > EPS ? clamp(((px - ax) * dx + (pz - az) * dz) / L, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
/** Hull contact as main's separateShips sees it (and the ram's CRUNCH!): centres closer than (len_a + len_b) × k. */
function touching(a, b, k, margin = 0) {
  return Math.hypot(a.x - b.x, a.z - b.z) < (lenOf(a) + lenOf(b)) * k + margin;
}
/** From a point to a hull's side (0 inside it). */
function toHull(s, x, z) {
  const A = hullSeg(s);
  return Math.max(0, pointSeg(x, z, A.ax, A.az, A.bx, A.bz) - A.r);
}

// The ctx from main, with every member optional and safe to call.
function wrapCtx(raw) {
  const ctx = isObj(raw) ? raw : {};
  const fn = (name) => (typeof ctx[name] === 'function' ? ctx[name] : null);
  const call = (name, ...args) => {
    const f = fn(name);
    return f ? f(...args) : undefined;
  };
  const spare = mulberry32(0x6b72616b); // ('krak')
  const enemies = () => {
    const list = typeof ctx.enemies === 'function' ? ctx.enemies() : ctx.enemies;
    return Array.isArray(list) ? list : [];
  };
  const player = () => {
    const p = call('player');
    return isShip(p) ? p : null;
  };
  const env = () => {
    const e = call('env');
    return isObj(e) ? e : null;
  };
  const def = isObj(ctx.def) ? ctx.def : {};
  return {
    env,
    player,
    enemies,
    def,
    // Player first, then the enemies; ships only.
    ships() {
      const out = [];
      const p = player();
      if (p) out.push(p);
      for (const e of enemies()) if (isShip(e) && e !== p) out.push(e);
      return out;
    },
    fighting(e) {
      if (!isShip(e)) return false;
      const f = fn('fighting');
      return f ? !!f(e) : num(e.hp, 0) > 0 && !e.captured && !e.escaped && !e.surrendered;
    },
    relative(ship, x, z) {
      const f = fn('relative');
      const r = f ? f(ship, x, z) : null;
      return isObj(r) && finite(r.along) && finite(r.lat) && finite(r.dist) ? r : relativeLocal(ship, x, z);
    },
    rng() {
      const v = Number(call('rng'));
      return finite(v) && v >= 0 && v < 1 ? v : spare();
    },
    damage: (ship, amount, x, z, source) => call('damage', ship, amount, x, z, source),
    escape: (e) => call('escape', e),
    pop: (text, x, y, z, style) => call('pop', text, x, y, z, style),
    showBanner: (html, s) => call('showBanner', html, s),
    announce: (text) => call('announce', text),
    sfx: (name, x, z) => call('sfx', name, x, z),
    launchBomb: (spec) => call('launchBomb', spec),
    flee: (e) => call('flee', e),
    explode: (x, z, r, dmg, src) => call('explode', x, z, r, dmg, src),
    douse: (e) => call('douse', e),
    surrender: (e) => call('surrender', e),
    capture: (e) => call('capture', e),
    status(e) {
      const f = fn('status');
      const st = f ? f(e) : isObj(e) ? e.status : null;
      return isObj(st) ? st : null;
    },
    playerTurn() {
      const v = Number(call('playerTurn'));
      return finite(v) ? clamp(v, -1, 1) : 0;
    },
    warnBonus() {
      const v = Number(call('warnBonus'));
      return finite(v) && v > 0 ? v : 0;
    },
    turnRate(s) {
      const f = fn('turnRate');
      const v = f ? Number(f(s)) : NaN;
      return finite(v) ? Math.max(0, v) : Math.max(0, num(typeOf(s).turn, 0));
    },
    attacking(e) {
      const f = fn('attacking');
      return f ? !!f(e) : true;
    },
    hold() {
      const f = fn('hold');
      return f ? !!f() : false;
    },
    boarding() {
      const f = fn('boarding');
      return f ? !!f() : false;
    },
  };
}

// ------------------------------------------------------------------------------ createMechanics3

export function createMechanics3(ids, ctx) {
  const list = [];
  if (Array.isArray(ids)) {
    for (const id of ids) if (typeof id === 'string' && MECHANIC3_IDS.includes(id) && !list.includes(id)) list.push(id);
  }
  const on = (id) => list.includes(id);
  const c = wrapCtx(ctx);
  const range = (ab) => ab[0] + (ab[1] - ab[0]) * c.rng();
  const grace = Math.max(0, num(c.def.grace, 0));

  let now = 0; // simulated seconds since this level's mechanics were made (every step)
  let hz = 0; // the hazard clock: simulated seconds while nothing holds them (ctx.hold())
  let held = false; // ctx.hold() at the last step
  let wave = -1; // the highest wave index spawned
  const live = () => hz >= grace - EPS; // the level's grace is over: ships may attack
  const shown = { mortar: false, fireship: false, givesUp: false, rogue: false }; // first-time banners
  const counts = { windups: 0, rams: 0, lobs: 0, pots: 0, lit: 0, blasts: 0, givenUp: 0 };

  const recs = new Map(); // enemy → { ram, mortar, fire, ink, flee, asked }
  const fx = new Map(); // any ship → { pushes, fling, surf, wobble, core, inked, wave }
  const playerPos = () => {
    const p = c.player();
    if (p) return p;
    const ps = c.env()?.playerStart;
    return isObj(ps) && finite(ps.x) && finite(ps.z) ? ps : { x: 0, z: 0 };
  };
  const statusId = (e) => {
    const st = c.status(e);
    const id = st ? st.id : null;
    return typeof id === 'string' && finite(st.t) && st.t > EPS ? id : null;
  };
  const fxOf = (s) => {
    let f = fx.get(s);
    if (!f) {
      f = { pushes: [], fling: null, surf: 0, wobble: 0, core: null, inked: false, wave: null };
      fx.set(s, f);
    }
    return f;
  };
  const isPlayer = (s) => s === c.player();
  const meStyle = (s, mine, other) => (isPlayer(s) ? mine : other);

  // Where you will be `t` s from now, following your turn (as main's launchBomb leads lava).
  function predict(p, t) {
    const v = num(p.speed, 0);
    const h = num(p.h, 0);
    const w = c.playerTurn() * c.turnRate(p);
    if (!(t > 0) || Math.abs(v) < EPS) return { x: p.x, z: p.z };
    if (Math.abs(w) < 1e-4) return { x: p.x + Math.sin(h) * v * t, z: p.z + Math.cos(h) * v * t };
    return {
      x: p.x + (v / w) * (Math.cos(h) - Math.cos(h + w * t)),
      z: p.z + (v / w) * (Math.sin(h + w * t) - Math.sin(h)),
    };
  }

  // ------------------------------------------------------------------ the ships' records

  function register(e) {
    let r = recs.get(e);
    if (r) return r;
    const t = typeOf(e);
    r = {
      ram: t.ram === true ? { phase: 'idle', t: 0, h: 0 } : null,
      mortar: t.mortar === true ? { next: range(MORTAR.every) } : null,
      fire: t.fireship === true ? { lit: false, t: 0, out: false, exploded: false } : null,
      ink: t.flagship === true ? { next: INK.every } : null,
      flee: null, // { t, h, gone } once she runs for the edge
      asked: false, // a struck ship we asked main to take at the fall
    };
    recs.set(e, r);
    return r;
  }
  function registerAll() {
    const p = c.player();
    for (const e of c.enemies()) if (isShip(e) && e !== p && !recs.has(e)) register(e);
  }

  // ------------------------------------------------------------------ the Shark Raider's ram

  const surgeSpeed = (e) => RAM.speed * (statusId(e) === 'frost' ? RAM.frost : 1);
  function cancelRam(R) {
    if (R.phase === 'windup' || R.phase === 'surge') {
      R.phase = 'cool';
      R.t = 0;
    }
  }
  function crunch(e, p) {
    const v = Math.max(0, num(e.speed, 0));
    const hurt = Math.round(RAM.damage * Math.min(1, v / RAM.speed));
    let dx = p.x - e.x;
    let dz = p.z - e.z;
    let d = Math.hypot(dx, dz);
    if (d < EPS) {
      dx = Math.sin(num(e.h, 0));
      dz = Math.cos(num(e.h, 0));
      d = 1;
    }
    const nx = dx / d;
    const nz = dz / d;
    const mx = (e.x + p.x) / 2;
    const mz = (e.z + p.z) / 2;
    counts.rams++;
    fxOf(p).pushes.push({ vx: nx * RAM.push, vz: nz * RAM.push, t: RAM.pushTime });
    fxOf(e).pushes.push({ vx: -nx * RAM.push, vz: -nz * RAM.push, t: RAM.pushTime });
    e.speed = v * RAM.after;
    c.pop(WORDS.crunch, mx, POP_Y, mz, 'bad');
    c.sfx('crunch', mx, mz);
    if (hurt > 0) c.damage(p, hurt, mx, mz, 'ram');
    c.damage(e, RAM.self, mx, mz, 'ram');
  }
  function stepRam(e, r, g, p) {
    const R = r.ram;
    if (!c.fighting(e) || statusId(e) === 'stink' || !p || !afloat(p)) {
      cancelRam(R); // (stink cancels the charge: her cooldown starts)
      if (R.phase === 'cool') coolRam(R, g);
      return;
    }
    if (R.phase === 'cool') {
      coolRam(R, g);
      return;
    }
    if (R.phase === 'idle') {
      if (!live() || !c.attacking(e)) return;
      const rel = c.relative(e, p.x, p.z);
      if (rel.dist <= RAM.reach && rel.along > 0 && Math.atan2(Math.abs(rel.lat), rel.along) <= RAM.cone + EPS) {
        R.phase = 'windup';
        R.t = 0;
        counts.windups++;
        c.pop(WORDS.ram, e.x, POP_Y, e.z, 'bad');
        c.sfx('ram', e.x, e.z);
        c.announce(WORDS.live.ram);
      }
      return;
    }
    if (R.phase === 'windup') {
      R.t += g;
      if (R.t >= RAM.windup - EPS) {
        R.phase = 'surge';
        R.t = 0;
        R.h = Math.atan2(p.x - e.x, p.z - e.z); // locked on where you are now: turn away!
        e.speed = surgeSpeed(e);
      }
      return;
    }
    // surge
    R.t += g;
    e.speed = surgeSpeed(e); // (frost halves it, and so the hit)
    if (touching(e, p, RAM.contact)) {
      R.phase = 'cool';
      R.t = 0;
      crunch(e, p);
    } else if (R.t >= RAM.surge - EPS) {
      R.phase = 'cool';
      R.t = 0;
    }
  }
  function coolRam(R, g) {
    R.t += g;
    if (R.t >= RAM.cooldown - EPS) {
      R.phase = 'idle';
      R.t = 0;
    }
  }
  // Her course outside the wind-up and the surge, while she holds an attack slot (RAM.approach): bow first at you
  // from afar so a charge can line up; inside `near`, and while she cools, broadside, opening the range inside
  // `ring` and closing it beyond RAM.reach.
  function ramCourse(e, R, p, toYou, max) {
    const A = RAM.approach;
    const d = Math.hypot(p.x - e.x, p.z - e.z);
    if (R.phase !== 'cool' && d > A.near) return { h: toYou, speed: max * (d > A.far ? 1 : A.speed) };
    const h0 = num(e.h, 0);
    const a1 = wrapAngle(toYou + Math.PI / 2);
    const a2 = wrapAngle(toYou - Math.PI / 2);
    const side = Math.abs(wrapAngle(a1 - h0)) <= Math.abs(wrapAngle(a2 - h0)) ? 1 : -1; // (the beam nearer her bow)
    let h = side > 0 ? a1 : a2;
    if (d < A.ring) h += side * A.out;
    else if (d > RAM.reach) h -= side * A.out;
    return { h: wrapAngle(h), speed: max * A.sheer };
  }

  // ------------------------------------------------------------------ the Bomb Ketch's mortar

  const shells = []; // { id, kind, x, z, r, t, T, from }
  let shellIds = 0;
  function lob(e, p) {
    const T = MORTAR.warn + c.warnBonus();
    const at = predict(p, T * MORTAR.lead);
    c.launchBomb({ kind: 'shell', from: { x: e.x, y: MORTAR.muzzle, z: e.z }, tx: at.x, tz: at.z, radius: MORTAR.radius, damage: MORTAR.damage, warn: MORTAR.warn });
    shells.push({ id: ++shellIds, kind: 'shell', x: at.x, z: at.z, r: MORTAR.radius, t: 0, T, from: idOf(e) });
    counts.lobs++;
    c.sfx('mortar', e.x, e.z);
    c.announce(WORDS.live.mortar);
    if (!shown.mortar) {
      shown.mortar = true;
      c.showBanner(WORDS.banner.mortar, 2.5);
    }
  }
  function stepMortar(e, r, g, p) {
    const M = r.mortar;
    // (her clock runs only while she fights and isn't stinky: stink pauses the mortar)
    if (!c.fighting(e) || statusId(e) === 'stink') return;
    M.next -= g;
    if (M.next > EPS) return;
    M.next = 0;
    if (!live() || !p || !afloat(p) || !c.attacking(e)) return;
    const d = Math.hypot(p.x - e.x, p.z - e.z);
    if (d < MORTAR.range[0] || d > MORTAR.range[1]) return; // (she lobs as soon as you are in her window)
    lob(e, p);
    M.next = range(MORTAR.every);
  }

  // ------------------------------------------------------------------ the Fire Ship

  function light(e, F) {
    F.lit = true;
    F.t = 0;
    counts.lit++;
    c.sfx('fuse', e.x, e.z);
    c.announce(WORDS.live.fireship);
    if (!shown.fireship) {
      shown.fireship = true;
      c.showBanner(WORDS.banner.fireship, 2.8);
    }
  }
  function giveUp(e, F) {
    F.out = true;
    F.lit = false;
    counts.givenUp++;
    c.surrender(e);
    c.pop(WORDS.givesUp, e.x, POP_Y, e.z, 'info');
    c.announce(WORDS.live.givesUp);
    if (!shown.givesUp) {
      shown.givesUp = true;
      c.showBanner(WORDS.banner.givesUp, 2.5);
    }
  }
  // Boom: the damage falls from `blast` at her centre to `edge` at `ring`, measured to each hull, for every ship.
  function blast(e, F) {
    if (F.exploded) return;
    F.exploded = true;
    F.lit = false;
    e.exploded = true; // (main drops no coins for her)
    counts.blasts++;
    const x = e.x;
    const z = e.z;
    c.explode(x, z, FIRESHIP.ring, FIRESHIP.blast, 'fireship');
    c.pop(WORDS.boom, x, POP_Y, z, 'crit');
    for (const s of c.ships()) {
      if (s === e || !hurtable(s)) continue;
      // (a ship she touches is in her ring whatever its size: the one that set her off always feels it)
      const d = touching(e, s, RAM.contact, FIRESHIP.touch) ? Math.min(toHull(s, x, z), FIRESHIP.ring) : toHull(s, x, z);
      if (d > FIRESHIP.ring + EPS) continue;
      const dmg = Math.round(FIRESHIP.blast - ((FIRESHIP.blast - FIRESHIP.edge) * d) / FIRESHIP.ring);
      if (dmg > 0) c.damage(s, dmg, x, z, 'fireship');
    }
    if (afloat(e) && !e.captured && !e.escaped) c.damage(e, Math.max(1, Math.ceil(num(e.hp, 1))), x, z, 'fireship');
  }
  function stepFire(e, r, g, p) {
    const F = r.fire;
    if (F.exploded || F.out || !hurtable(e)) return;
    if (statusId(e) === 'frost') {
      giveUp(e, F); // frost (any hit) puts her fuse out for good
      return;
    }
    if (e.surrendered) {
      F.out = true; // (struck some other way: her fuse goes cold, so a boarding never meets a live one)
      F.lit = false;
      return;
    }
    if (!c.fighting(e)) return;
    if (!F.lit) {
      if (live() && p && afloat(p) && Math.hypot(p.x - e.x, p.z - e.z) <= FIRESHIP.light) light(e, F);
      return;
    }
    F.t += g;
    if (F.t < FIRESHIP.arm - EPS) return;
    for (const s of c.ships()) {
      if (s === e || !hurtable(s)) continue;
      if (toHull(s, e.x, e.z) < FIRESHIP.reach || touching(e, s, RAM.contact, FIRESHIP.touch)) {
        blast(e, F);
        return;
      }
    }
  }

  // ------------------------------------------------------------------ the Inkheart's ink

  const slicks = []; // { id, x, z, r, t, T }
  let slickIds = 0;
  function pots(e, p) {
    const T = INK.warn + c.warnBonus();
    const at = predict(p, T * INK.lead);
    for (let k = 0; k < INK.pots; k++) {
      const a = c.rng() * TAU;
      const d = c.rng() * INK.scatter;
      const tx = at.x + Math.sin(a) * d;
      const tz = at.z + Math.cos(a) * d;
      c.launchBomb({ kind: 'ink', from: { x: e.x, y: INK.muzzle, z: e.z }, tx, tz, radius: INK.radius, damage: INK.damage, warn: INK.warn });
      shells.push({ id: ++shellIds, kind: 'ink', x: tx, z: tz, r: INK.radius, t: 0, T, from: idOf(e) });
    }
    counts.pots += INK.pots;
    c.sfx('ink', e.x, e.z);
    c.announce(WORDS.live.ink);
  }
  function stepInk(e, r, g, p) {
    const I = r.ink;
    if (!c.fighting(e) || statusId(e) === 'stink') return; // (a stinky ship can't shoot: her clock waits)
    I.next -= g;
    if (I.next > EPS) return;
    I.next = 0;
    if (!live() || !p || !afloat(p)) return;
    pots(e, p);
    I.next = INK.every;
  }
  const inSlick = (s) => slicks.some((k) => Math.hypot(s.x - k.x, s.z - k.z) < k.r);

  // ------------------------------------------------------------------ the flagship's fall

  let fallen = false;
  let fled = 0;
  const edgeHeading = (o) => {
    if (Math.hypot(o.x, o.z) > 1) return Math.atan2(o.x, o.z);
    const p = playerPos();
    return Math.atan2(o.x - p.x, o.z - p.z || 1);
  };
  function startFlee(o, r) {
    r.flee = { t: 0, h: edgeHeading(o), gone: false };
    if (r.ram) {
      r.ram.phase = 'idle';
      r.ram.t = 0;
    }
    fled++;
    c.flee(o);
  }
  // Every other fighting ship flees; struck ones are taken. (Run again every step after the fall: a ship that a
  // boarding held comes free, or a late one sails in.)
  function sweep(skip) {
    for (const o of [...c.enemies()]) {
      if (!isShip(o) || o === skip || !afloat(o) || o.captured || o.escaped) continue;
      const r = register(o);
      if (r.flee) continue;
      if (o.surrendered) {
        if (!r.asked) {
          r.asked = true;
          c.capture(o);
        }
        continue;
      }
      if (c.fighting(o)) startFlee(o, r);
    }
  }
  function fall(e) {
    if (!on('flagship') || fallen || typeOf(e).flagship !== true) return;
    fallen = true;
    for (const k of slicks) k.T = Math.min(k.T, k.t + INK.slick.fade);
    c.showBanner(WORDS.banner.flee, 2.5);
    c.announce(WORDS.live.flee);
    sweep(e);
  }

  // ------------------------------------------------------------------ waterspouts

  const slots = []; // { wait, spout }: on 'spouts', 2 during wave 1, 3 from wave 2
  const spouts = []; // live: { id, slot, loop, cx, cz, rx, rz, w, phi, state, t, T }
  let spoutIds = 0;
  const spoutStats = { formed: 0, flings: 0, damage: 0 };
  if (on('spouts')) for (let k = 0; k < SPOUTS.active[0]; k++) slots.push({ wait: k * SPOUTS.stagger, spout: null });
  function addSlots() {
    if (!on('spouts')) return;
    const want = SPOUTS.active[Math.min(SPOUTS.active.length - 1, Math.max(0, wave))];
    while (slots.length < want) slots.push({ wait: 0, spout: null });
  }
  const spoutPos = (sp) => ({ x: sp.cx + sp.rx * Math.cos(sp.w * hz + sp.phi), z: sp.cz + sp.rz * Math.sin(sp.w * hz + sp.phi) });
  function loops() {
    const raw = c.env()?.spoutLoops;
    if (!Array.isArray(raw)) return [];
    return raw.filter((L) => isObj(L) && finite(L.cx) && finite(L.cz) && finite(L.rx) && finite(L.rz) && finite(L.w) && L.rx >= 0 && L.rz >= 0);
  }
  // A new spout on a loop point at least SPOUTS.away from you (and spacing from the others), within SPOUTS.near of
// you when it can be, a free loop first.
  function form(k) {
    const Ls = loops();
    if (!Ls.length) return null;
    const p = playerPos();
    const others = spouts.map(spoutPos);
    const used = new Set(spouts.map((s) => s.loop));
    const off = c.rng();
    const cand = [];
    Ls.forEach((L, li) => {
      for (let j = 0; j < 16; j++) {
        const th = ((j + off) / 16) * TAU;
        const x = L.cx + L.rx * Math.cos(th);
        const z = L.cz + L.rz * Math.sin(th);
        const dp = Math.hypot(x - p.x, z - p.z);
        const clear = others.every((o) => Math.hypot(o.x - x, o.z - z) >= SPOUTS.spacing);
        cand.push({ li, th, dp, ok: dp >= SPOUTS.away && clear, free: !used.has(li) });
      }
    });
    // (a free loop near the fight first; then any loop near it; then a free loop anywhere; then any)
    const near = (q) => q.dp <= SPOUTS.near;
    let pool = cand.filter((q) => q.ok && q.free && near(q));
    if (!pool.length) pool = cand.filter((q) => q.ok && near(q));
    if (!pool.length) pool = cand.filter((q) => q.ok && q.free);
    if (!pool.length) pool = cand.filter((q) => q.ok);
    const pick = pool.length ? pool[Math.min(pool.length - 1, Math.floor(c.rng() * pool.length))] : cand.reduce((a, b) => (b.dp > a.dp ? b : a));
    const L = Ls[pick.li];
    const sp = { id: ++spoutIds, slot: k, loop: pick.li, cx: L.cx, cz: L.cz, rx: L.rx, rz: L.rz, w: L.w, phi: pick.th - L.w * hz, state: 'forming', t: 0, T: SPOUTS.form + c.warnBonus() };
    spouts.push(sp);
    spoutStats.formed++;
    if (spoutStats.formed === 1) c.announce(WORDS.live.spout);
    return sp;
  }
  // A spout's life: forming (harmless) → active → collapsing → gone. Returns false once it is gone.
  function ageSpout(sp, g) {
    sp.t += g;
    while (sp.t >= sp.T - EPS) {
      sp.t = Math.max(0, sp.t - sp.T);
      if (sp.state === 'forming') {
        sp.state = 'active';
        sp.T = SPOUTS.life;
      } else if (sp.state === 'active') {
        sp.state = 'collapsing';
        sp.T = SPOUTS.collapse;
      } else return false;
    }
    return true;
  }
  function fling(s, sp, q) {
    const f = fxOf(s);
    let dx = s.x - q.x;
    let dz = s.z - q.z;
    let d = Math.hypot(dx, dz);
    if (d < 1e-3) {
      dx = Math.sin(num(s.h, 0));
      dz = Math.cos(num(s.h, 0));
      d = 1;
    }
    f.fling = { vx: (dx / d) * SPOUTS.core.flingSpeed, vz: (dz / d) * SPOUTS.core.flingSpeed, t: SPOUTS.core.flingTime };
    f.core = null;
    spoutStats.flings++;
    c.pop(WORDS.whoosh, s.x, POP_Y, s.z, meStyle(s, 'bad', 'info'));
  }
  function stepSpouts(g) {
    for (let i = spouts.length - 1; i >= 0; i--) {
      const sp = spouts[i];
      if (ageSpout(sp, g)) continue;
      spouts.splice(i, 1);
      const slot = sp.slot >= 0 ? slots[sp.slot] : null;
      if (slot && slot.spout === sp) {
        slot.spout = null;
        slot.wait = range(SPOUTS.next);
        slot.fresh = true;
      }
    }
    slots.forEach((slot, k) => {
      if (slot.spout) return;
      if (slot.fresh) slot.fresh = false; // (its wait starts next step)
      else slot.wait -= g;
      if (slot.wait > EPS) return;
      slot.spout = form(k);
      if (!slot.spout) slot.wait = 1; // (no loops in this sea: look again later)
    });
    // The cores: spin, 1 hp a tick, the fling; they put fires out.
    const C = SPOUTS.core;
    if (!spouts.some((sp) => sp.state === 'active')) {
      for (const f of fx.values()) f.core = null;
      return;
    }
    for (const s of c.ships()) {
      if (!hurtable(s)) continue;
      const f = fx.get(s);
      if (f && f.fling) {
        f.core = null; // (flying out)
        continue;
      }
      let best = null;
      for (const sp of spouts) {
        if (sp.state !== 'active') continue;
        const q = spoutPos(sp);
        const d = Math.hypot(s.x - q.x, s.z - q.z);
        if (d < C.r && (!best || d < best.d)) best = { sp, q, d };
      }
      if (!best) {
        if (f) f.core = null;
        continue;
      }
      const ff = fxOf(s);
      if (!ff.core || ff.core.id !== best.sp.id) {
        ff.core = { id: best.sp.id, t: 0, acc: 0 };
        c.douse(s); // the core puts a fire out on the way in (main's douse says FIRE OUT! only if one burned)
      } else if (statusId(s) === 'fire') c.douse(s); // (and one lit while she spins in it)
      const core = ff.core;
      core.t += g;
      core.acc += g;
      while (core.acc >= C.tick - EPS && hurtable(s)) {
        core.acc -= C.tick;
        spoutStats.damage++;
        c.damage(s, 1, s.x, s.z, 'spout');
      }
      if (core.t >= C.fling - EPS && hurtable(s)) fling(s, best.sp, best.q);
    }
  }

  // ------------------------------------------------------------------ rogue waves

  let rogue = null; // { id, from, h, ux, uz, ox, oz, t, warn, start }
  let rogueNext = ROGUE.first;
  let rogueIds = 0;
  const rogueStats = { waves: 0, side: 0, rode: 0, surf: 0 };
  function pickDir() {
    const raw = c.env()?.rogueDirs;
    const dirs = Array.isArray(raw) ? raw.filter(finite) : [];
    return dirs.length ? dirs[Math.min(dirs.length - 1, Math.floor(c.rng() * dirs.length))] : c.rng() * TAU;
  }
  function launchRogue(from) {
    const p = playerPos();
    const w = c.warnBonus();
    const start = ROGUE.start + ROGUE.startBonus * w;
    const h = wrapAngle(from + Math.PI);
    const ux = Math.sin(h);
    const uz = Math.cos(h);
    rogue = { id: ++rogueIds, from: wrapAngle(from), h, ux, uz, ox: p.x - ux * start, oz: p.z - uz * start, t: 0, warn: ROGUE.warn + w, start };
    rogueNext = hz + range(ROGUE.every);
    rogueStats.waves++;
    c.sfx('horn', p.x, p.z);
    c.announce(WORDS.live.rogue);
    if (!shown.rogue) {
      shown.rogue = true;
      c.showBanner(WORDS.banner.rogue, 3);
    }
    return rogue;
  }
  const crest = () => ({ x: rogue.ox + rogue.ux * ROGUE.speed * rogue.t, z: rogue.oz + rogue.uz * ROGUE.speed * rogue.t });
  function hitByWave(s, f) {
    const a = Math.abs(wrapAngle(num(s.h, 0) - rogue.h)) * DEG;
    const me = isPlayer(s);
    c.douse(s); // any wave puts a fire out
    if (a < ROGUE.sideOn[0] - 1e-6) {
      f.surf = ROGUE.surfTime;
      rogueStats.surf++;
      c.pop(WORDS.surf, s.x, POP_Y, s.z, me ? 'gold' : 'info');
      if (me) c.sfx('surf', s.x, s.z);
    } else if (a > ROGUE.sideOn[1] + 1e-6) {
      rogueStats.rode++;
      c.pop(WORDS.rode, s.x, POP_Y, s.z, me ? 'gold' : 'info');
    } else {
      rogueStats.side++;
      f.pushes.push({ vx: (rogue.ux * ROGUE.push) / ROGUE.pushTime, vz: (rogue.uz * ROGUE.push) / ROGUE.pushTime, t: ROGUE.pushTime });
      f.wobble = ROGUE.wobble;
      c.pop(WORDS.splash, s.x, POP_Y, s.z, me ? 'bad' : 'dmg');
      c.damage(s, ROGUE.damage, s.x, s.z, 'rogue');
    }
    if (me) c.sfx('rogue', s.x, s.z);
  }
  function stepRogue(g) {
    if (!rogue) {
      if (!on('rogue') || hz < rogueNext - EPS) return;
      launchRogue(pickDir());
    } else rogue.t += g;
    const q = crest();
    const R = num(c.env()?.worldRadius, 150);
    const w = rogue;
    for (const s of c.ships()) {
      if (!hurtable(s)) continue;
      const dx = s.x - q.x;
      const dz = s.z - q.z;
      const side = dx * w.ux + dz * w.uz; // > 0: still ahead of the crest
      const lat = dx * w.uz - dz * w.ux;
      const f = fxOf(s);
      if (f.wave && f.wave.id === w.id && f.wave.side > 0 && side <= 0 && Math.abs(lat) <= ROGUE.length / 2) hitByWave(s, f);
      f.wave = { id: w.id, side };
    }
    if (q.x * w.ux + q.z * w.uz > R + ROGUE.past || w.t > ROGUE.maxLife) rogue = null;
  }

  // ------------------------------------------------------------------ per-ship effects

  function ageFx(g) {
    for (const f of fx.values()) {
      if (f.pushes.length) {
        for (const k of f.pushes) k.t -= g;
        f.pushes = f.pushes.filter((k) => k.t > EPS);
      }
      if (f.fling) {
        f.fling.t -= g;
        if (f.fling.t <= EPS) f.fling = null;
      }
      if (f.surf > 0) f.surf = f.surf - g > EPS ? f.surf - g : 0;
      if (f.wobble > 0) f.wobble = f.wobble - g > EPS ? f.wobble - g : 0;
    }
  }
  function ageList(arr, g) {
    for (let i = arr.length - 1; i >= 0; i--) {
      arr[i].t += g;
      if (arr[i].t >= arr[i].T - EPS) arr.splice(i, 1);
    }
  }
  function stepInky() {
    if (!slicks.length) {
      for (const f of fx.values()) f.inked = false;
      return;
    }
    for (const s of c.ships()) {
      const f = fx.get(s);
      const inside = hurtable(s) && inSlick(s);
      if (!inside) {
        if (f) f.inked = false;
        continue;
      }
      const ff = fxOf(s);
      if (!ff.inked) c.pop(WORDS.inky, s.x, POP_Y, s.z, 'slow'); // once per entry
      ff.inked = true;
    }
  }

  // ------------------------------------------------------------------ snapshots

  const spoutVisual = (sp) => {
    const q = spoutPos(sp);
    return { id: sp.id, x: q.x, z: q.z, r: SPOUTS.core.r, pull: SPOUTS.pull.r, state: sp.state, t: sp.t, T: sp.T, k: clamp(sp.T > 0 ? sp.t / sp.T : 1, 0, 1) };
  };
  const rogueVisual = () => {
    if (!rogue) return null;
    const q = crest();
    const p = playerPos();
    return {
      id: rogue.id,
      x: q.x,
      z: q.z,
      h: rogue.h,
      from: rogue.from,
      len: ROGUE.length,
      height: ROGUE.height,
      speed: ROGUE.speed,
      t: rogue.t,
      warn: rogue.warn,
      warning: rogue.t < rogue.warn,
      k: clamp(rogue.warn > 0 ? rogue.t / rogue.warn : 1, 0, 1),
      ahead: (p.x - q.x) * rogue.ux + (p.z - q.z) * rogue.uz,
    };
  };
  function ramVisuals() {
    const out = [];
    for (const [e, r] of recs) {
      if (!r.ram || !afloat(e) || (r.ram.phase !== 'windup' && r.ram.phase !== 'surge')) continue;
      const T = r.ram.phase === 'windup' ? RAM.windup : RAM.surge;
      out.push({ id: idOf(e), x: e.x, z: e.z, h: num(e.h, 0), state: r.ram.phase, t: r.ram.t, T, k: clamp(r.ram.t / T, 0, 1) });
    }
    return out;
  }
  function ringVisuals() {
    const out = [];
    for (const [e, r] of recs) {
      const F = r.fire;
      if (!F || !F.lit || F.out || F.exploded || !afloat(e)) continue;
      out.push({ id: idOf(e), x: e.x, z: e.z, r: FIRESHIP.ring, t: F.t, T: FIRESHIP.arm, armed: F.t >= FIRESHIP.arm - EPS, k: clamp(F.t / FIRESHIP.arm, 0, 1) });
    }
    return out;
  }

  const api = {
    init() {
      registerAll(); // (wave 0 may have sailed in before the mechanics existed)
      if (wave < 0) wave = 0;
    },
    onSpawn(e, waveIndex) {
      if (Number.isInteger(waveIndex) && waveIndex > wave) {
        wave = waveIndex;
        addSlots(); // (the third waterspout comes with wave 2)
      }
      if (!isShip(e) || e === c.player()) return;
      register(e);
    },
    onCapture(e) {
      if (!isShip(e)) return;
      const r = recs.get(e);
      if (r && r.ram) cancelRam(r.ram);
      if (r && r.fire) r.fire.lit = false;
      fall(e);
    },
    onSink(e) {
      if (!isShip(e)) return;
      const r = recs.get(e) || (typeOf(e).fireship === true || typeOf(e).flagship === true ? register(e) : null);
      if (r && r.fire && r.fire.lit && !r.fire.out && !r.fire.exploded && statusId(e) !== 'frost') blast(e, r.fire); // sunk while lit
      if (r && r.ram) cancelRam(r.ram);
      fall(e);
    },
    onRemove(e) {
      if (!isObj(e)) return;
      recs.delete(e);
      fx.delete(e);
    },
    step(dt) {
      const d = Math.max(0, num(dt, 0));
      now += d;
      held = c.hold();
      registerAll();
      if (held) {
        // Everything waits (the fly-in, a boarding's truce). A charge in progress is called off.
        for (const r of recs.values()) if (r.ram) cancelRam(r.ram);
        return;
      }
      const g = d;
      if (!(g > 0)) return;
      hz += g;
      ageFx(g);
      ageList(slicks, g);
      ageList(shells, g);
      const p = c.player();
      for (const [e, r] of [...recs]) {
        if (r.flee) {
          r.flee.t += g;
          if (!r.flee.gone && r.flee.t >= FLEE.remove - EPS) {
            r.flee.gone = true;
            c.escape(e); // (foam; no loot, no penalty)
          }
          continue;
        }
        if (r.fire) stepFire(e, r, g, p);
        if (r.ram) stepRam(e, r, g, p);
        if (r.mortar) stepMortar(e, r, g, p);
        if (r.ink) stepInk(e, r, g, p);
      }
      if (fallen) sweep(null);
      stepSpouts(g);
      stepRogue(g);
      stepInky();
    },
    steer(e) {
      if (!isShip(e)) return null;
      const r = recs.get(e);
      if (r && r.flee) return { h: r.flee.h, speed: FLEE.speed };
      const p = c.player();
      if (!p || !afloat(p) || !c.fighting(e)) return null;
      const max = maxOf(e);
      // A boss turns her bow into a rogue wave rolling at her.
      if (rogue && typeOf(e).boss === true) {
        const q = crest();
        const side = (e.x - q.x) * rogue.ux + (e.z - q.z) * rogue.uz;
        if (side > 0 && side < ROGUE.bowIn) return { h: wrapAngle(rogue.h + Math.PI), speed: max * 0.5 };
      }
      if (!r) return null;
      const toYou = Math.atan2(p.x - e.x, p.z - e.z);
      if (r.fire && !r.fire.out && !r.fire.exploded) return { h: toYou, speed: max }; // straight at you
      if (r.ram && r.ram.phase === 'windup') return { h: toYou, speed: max * RAM.windupSpeed };
      if (r.ram && r.ram.phase === 'surge') return { h: r.ram.h, speed: surgeSpeed(e) };
      if (r.ram && c.attacking(e)) return ramCourse(e, r.ram, p, toYou, max);
      if (r.mortar && c.attacking(e)) {
        const d = Math.hypot(p.x - e.x, p.z - e.z);
        const away = wrapAngle(toYou + Math.PI);
        const nearer = (a1, a2) => (Math.abs(wrapAngle(a1 - num(e.h, 0))) <= Math.abs(wrapAngle(a2 - num(e.h, 0))) ? a1 : a2);
        if (d < MORTAR.flee) return { h: away, speed: max };
        if (d < MORTAR.keep[0]) return { h: nearer(wrapAngle(away + MORTAR.slant), wrapAngle(away - MORTAR.slant)), speed: max };
        if (d > MORTAR.keep[1]) return { h: toYou, speed: max };
        return { h: nearer(wrapAngle(toYou + Math.PI / 2), wrapAngle(toYou - Math.PI / 2)), speed: max * MORTAR.cruise };
      }
      return null;
    },
    holdFire(e) {
      if (!isShip(e)) return false;
      if (typeOf(e).fireship === true) return true; // (she has no guns)
      const r = recs.get(e);
      return !!(r && r.flee);
    },
    drift(s) {
      if (!isShip(s) || held) return null;
      let vx = 0;
      let vz = 0;
      let any = false;
      const f = fx.get(s);
      if (f) {
        for (const k of f.pushes) {
          vx += k.vx;
          vz += k.vz;
          any = true;
        }
        if (f.fling) {
          vx += f.fling.vx;
          vz += f.fling.vz;
          return { vx, vz }; // (thrown out: no pull)
        }
      }
      if (spouts.length && hurtable(s)) {
        for (const sp of spouts) {
          if (sp.state !== 'active') continue;
          const q = spoutPos(sp);
          const dx = q.x - s.x;
          const dz = q.z - s.z;
          const d = Math.hypot(dx, dz);
          if (!(d < SPOUTS.pull.r) || d < EPS) continue;
          vx += (dx / d) * SPOUTS.pull.speed;
          vz += (dz / d) * SPOUTS.pull.speed;
          any = true;
        }
      }
      return any ? { vx, vz } : null;
    },
    avoid() {
      return spouts.map((sp) => {
        const q = spoutPos(sp);
        return { x: q.x, z: q.z, r: SPOUTS.avoid };
      });
    },
    shipMods(s) {
      if (!isShip(s)) return IDENTITY;
      let speedMul = 1;
      let capAdd = 0;
      let turnMul = 1;
      let spin = 0;
      let any = false;
      const r = recs.get(s);
      if (r) {
        const max = maxOf(s);
        if (r.flee && FLEE.speed > max) {
          capAdd += FLEE.speed - max;
          any = true;
        } else if (r.ram && r.ram.phase === 'surge' && RAM.speed > max) {
          capAdd += RAM.speed - max;
          any = true;
        }
        if (r.fire && r.fire.out && max > FIRESHIP.frozenSpeed) {
          speedMul *= FIRESHIP.frozenSpeed / max;
          any = true;
        }
      }
      const f = fx.get(s);
      if (f) {
        if (f.surf > 0) {
          capAdd += ROGUE.surf;
          any = true;
        }
        if (f.wobble > 0) {
          turnMul *= ROGUE.wobbleTurn;
          any = true;
        }
        if (f.core && !held) {
          spin += SPOUTS.core.spin;
          any = true;
        }
      }
      if (slicks.length && inSlick(s)) {
        speedMul *= INK.slick.speedMul;
        any = true;
      }
      return any ? { speedMul, capAdd, turnMul, spin } : IDENTITY;
    },
    objective() {
      return null;
    },
    minimap() {
      const out = [];
      for (const sp of spouts) {
        const q = spoutPos(sp);
        out.push({ kind: 'spout', x: q.x, z: q.z, r: SPOUTS.core.r, forming: sp.state === 'forming' });
      }
      if (rogue) {
        const q = crest();
        out.push({ kind: 'rogue', x: q.x, z: q.z, r: ROGUE.length / 2, h: rogue.h, warning: rogue.t < rogue.warn });
      }
      for (const k of slicks) out.push({ kind: 'slick', x: k.x, z: k.z, r: k.r });
      return out;
    },
    summary() {
      return [];
    },
    bonus() {
      return 0;
    },
    visuals() {
      const rams = ramVisuals();
      const fireRings = ringVisuals();
      if (!spouts.length && !rogue && !slicks.length && !shells.length && !rams.length && !fireRings.length) return NO_VISUALS;
      return {
        spouts: spouts.map(spoutVisual),
        rogue: rogueVisual(),
        slicks: slicks.map((k) => ({ id: k.id, x: k.x, z: k.z, r: k.r, t: k.t, T: k.T })),
        rams,
        fireRings,
        shells: shells.map((s) => ({ ...s })),
      };
    },
    addSlick(x, z) {
      if (!finite(x) || !finite(z)) return;
      slicks.push({ id: ++slickIds, x, z, r: INK.slick.r, t: 0, T: INK.slick.time });
      while (slicks.length > INK.slick.max) slicks.shift();
    },
    get krakenDue() {
      if (!on('flagship') || !fallen || c.boarding()) return false;
      for (const o of c.enemies()) {
        if (!isShip(o) || !afloat(o) || o.captured || o.escaped) continue;
        const r = recs.get(o);
        if (r && r.flee && r.flee.t >= FLEE.remove - EPS) continue; // (gone: main removes her)
        return false;
      }
      return true;
    },
    get state() {
      const all = c.enemies();
      const index = (e) => all.indexOf(e);
      const rows = (key, fn) => [...recs].filter(([, r]) => r[key]).map(([e, r]) => ({ index: index(e), type: typeof e.typeName === 'string' ? e.typeName : null, ...fn(r[key], e) }));
      return {
        ids: [...list],
        time: now,
        hazardTime: hz,
        held,
        wave,
        spouts: { slots: slots.length, ...spoutStats, list: spouts.map(spoutVisual) },
        rogue: { next: rogue ? null : on('rogue') ? Math.max(0, rogueNext - hz) : null, ...rogueStats, wave: rogueVisual() },
        rams: rows('ram', (R) => ({ phase: R.phase, t: R.t })),
        mortars: rows('mortar', (M) => ({ next: M.next })),
        fireships: rows('fire', (F) => ({ lit: F.lit, t: F.t, armed: F.lit && F.t >= FIRESHIP.arm - EPS, out: F.out, exploded: F.exploded })),
        inkhearts: rows('ink', (I) => ({ next: I.next })),
        fleeing: rows('flee', (F) => ({ t: F.t, gone: F.gone })),
        slicks: slicks.map((k) => ({ id: k.id, x: k.x, z: k.z, r: k.r, t: k.t, T: k.T })),
        shells: shells.map((s) => ({ ...s })),
        counts: { ...counts },
        flagship: { on: on('flagship'), fallen, fled, due: api.krakenDue },
      };
    },
    dispose() {
      recs.clear();
      fx.clear();
      spouts.length = 0;
      slots.length = 0;
      slicks.length = 0;
      shells.length = 0;
      rogue = null;
    },
    // ---- test hooks (G.mechanics3, SPEC3 §11.3)
    wave(angle) {
      launchRogue(finite(angle) ? angle : pickDir());
      return rogueVisual();
    },
    spout(x, z) {
      if (!finite(x) || !finite(z)) return null;
      const sp = { id: ++spoutIds, slot: -1, loop: -1, cx: x, cz: z, rx: 0, rz: 0, w: 0, phi: 0, state: 'forming', t: 0, T: SPOUTS.form + c.warnBonus() };
      spouts.push(sp);
      spoutStats.formed++;
      return spoutVisual(sp);
    },
  };
  return api;
}

// ------------------------------------------------------------------------------ composeMechanics

/**
 * One `mechanics` for main from a = createMechanics(ids, ctx) and b = createMechanics3(ids, ctx3) (two
 * instances: each factory keeps the ids it knows). The rules (SPEC3 §11.1):
 * - init, onSpawn, onCapture, onSink, onRemove, step, dispose fan out, a first;
 * - steer: a's if non-null, else b's; holdFire: either;
 * - drift: summed (as createMechanics sums its parts), null when both are null;
 * - avoid, minimap, summary: a's then b's; bonus: summed;
 * - objective: a's string unchanged when b's is null (b's alone when a's is null, else "a · b");
 * - shipMods: the multipliers multiplied, the adds added (identity when neither has any);
 * - state: { ...a.state, m3: b.state }, so Act II's ids, convoy, floes and current stay top-level;
 * - visuals, krakenDue, addSlick: b's.
 * A missing or broken part counts as one that does nothing; nothing here throws on junk.
 */
export function composeMechanics(parts) {
  const [pa, pb] = Array.isArray(parts) ? parts : [];
  const a = isObj(pa) ? pa : {};
  const b = isObj(pb) ? pb : {};
  const fn = (m, name) => (typeof m[name] === 'function' ? m[name] : null);
  const call = (m, name, ...args) => {
    const f = fn(m, name);
    return f ? f.apply(m, args) : undefined;
  };
  const both = (name) => (...args) => {
    call(a, name, ...args);
    call(b, name, ...args);
  };
  const list = (v) => (Array.isArray(v) ? v : []);
  const text = (v) => (typeof v === 'string' && v ? v : null);
  const num = (v, d) => (finite(v) ? v : d);
  const readState = (m) => {
    try {
      const s = m.state;
      return isObj(s) ? s : {};
    } catch {
      return {};
    }
  };

  return {
    init: both('init'),
    onSpawn: both('onSpawn'),
    onCapture: both('onCapture'),
    onSink: both('onSink'),
    onRemove: both('onRemove'),
    step: both('step'),
    dispose: both('dispose'),
    steer(e, dt) {
      return call(a, 'steer', e, dt) || call(b, 'steer', e, dt) || null;
    },
    holdFire(e) {
      return !!call(a, 'holdFire', e) || !!call(b, 'holdFire', e);
    },
    drift(s) {
      const da = call(a, 'drift', s);
      const db = call(b, 'drift', s);
      const ok = (d) => isObj(d) && finite(d.vx) && finite(d.vz);
      if (!ok(db)) return ok(da) ? da : null;
      if (!ok(da)) return db;
      return { vx: da.vx + db.vx, vz: da.vz + db.vz };
    },
    avoid() {
      return [...list(call(a, 'avoid')), ...list(call(b, 'avoid'))];
    },
    shipMods(s) {
      const ma = call(a, 'shipMods', s);
      const mb = call(b, 'shipMods', s);
      const ia = !isObj(ma) || ma === IDENTITY;
      const ib = !isObj(mb) || mb === IDENTITY;
      if (ia && ib) return IDENTITY;
      const A = ia ? IDENTITY : ma;
      const B = ib ? IDENTITY : mb;
      return {
        speedMul: num(A.speedMul, 1) * num(B.speedMul, 1),
        capAdd: num(A.capAdd, 0) + num(B.capAdd, 0),
        turnMul: num(A.turnMul, 1) * num(B.turnMul, 1),
        spin: num(A.spin, 0) + num(B.spin, 0),
      };
    },
    objective() {
      const ta = call(a, 'objective');
      const tb = text(call(b, 'objective'));
      if (!tb) return ta ?? null;
      const sa = text(ta);
      return sa ? `${sa} · ${tb}` : tb;
    },
    minimap() {
      return [...list(call(a, 'minimap')), ...list(call(b, 'minimap'))];
    },
    summary() {
      return [...list(call(a, 'summary')), ...list(call(b, 'summary'))];
    },
    bonus() {
      return num(Number(call(a, 'bonus')), 0) + num(Number(call(b, 'bonus')), 0);
    },
    visuals() {
      return call(b, 'visuals') || NO_VISUALS;
    },
    addSlick(x, z) {
      call(b, 'addSlick', x, z);
    },
    get krakenDue() {
      try {
        return !!b.krakenDue;
      } catch {
        return false;
      }
    },
    get state() {
      return { ...readState(a), m3: readState(b) };
    },
  };
}
