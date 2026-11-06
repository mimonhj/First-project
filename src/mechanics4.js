// Voyage IV's rules (SPEC4 §2.6, §3.1, §3.2): the fog banks of Misty Mangroves, the coral currents of the Sunken
// Spires, the ebb tide of Shellback Shoals, and the three new ships' behaviours (the Sting Sloop's stern hold and
// dance, the Net Sloop's nets, the Coral Witch's summons and song), which follow their type flags (kiter, nets,
// summoner) on any level, so a test can G.spawn them anywhere; `ids` only switch the hazards on: 'fog' (L10),
// 'currents' (L11) and 'tide' (L12). Also the warning-shape cap (WARN) and every new word (WORDS4: the foes and the
// Shellback read it too, through ctx.tables).
//
// Pure: no three.js, imports nothing (the Node tests load it as a data: URL, like mechanics3.js). Every number lives
// in one of the tables below. Gameplay runs in SIMULATED time (the dt given to step()) and rolls with ctx.rng (main's
// combatRng), never Math.random; a fog bank's position is a pure function of the hazard clock and its loop, and so are
// the tide's times. main composes this as the third part of composeMechanics (mechanics3.js) and passes def.mechanics
// to all three factories: each keeps the ids it knows.
//
// createMechanics4(ids, ctx) → the SPEC2 §6.3 / SPEC3 §11.1 hook shape plus SPEC4 §11.1's:
//   init(), onSpawn(e, waveIndex), onCapture(e), onSink(e), onRemove(e),
//   step(dt)                      every simulation step (as mechanics3's)
//   steer(e, dt) → { h, speed } | null   a Sting Sloop making for her spot off your stern quarter (beam-on there to
//                                 fire, dancing out of your broadside), a Net Sloop closing on your beam, the Coral
//                                 Witch keeping her range, and any pirate who lost you in the fog sailing for your
//                                 last-seen spot ("Where'd she go?"). Only while she holds an attack slot (attacking),
//                                 except the dance.
//   holdFire(e) → boolean         the Witch (no guns) and any pirate you are hidden from (fog)
//   drift(s) → { vx, vz } | null  a coral current: CURRENT.speed along the lane while the centre is inside it. s may
//                                 be any { x, z } (main asks it for puffers too: they ride the currents)
//   avoid() → [{ x, z, r }]       pirates keep off the summons' rings and, while the tide is out, the sandbars
//   shipMods(s) → { speedMul, capAdd, turnMul, spin }   the tide's shallows on a deep hull (speed ×0.5), the Sting
//                                 Sloop's dance (turn ×1.6, +2 to her cap). The same frozen identity when nothing applies.
//   playerMods() → { speedMul, turnMul, netted: { t, max, cut } | null }   TANGLED (×0.5, ×0.6) while a net holds you
//                                 (t: seconds held so far, max: NET.max, cut: how far the cut is, 0..1)
//   hidden(target, viewer) → boolean   fog: a ship whose centre is in a bank, seen from more than FOG.see u away
//                                 (+ ctx.spyglass() when the viewer is you; viewer defaults to you). Never your own
//                                 ship from your own view, never a pseudo target, a shape or a crate (not ships).
//   fogAt(x, z) → boolean         is this point inside a fog bank (the HIDDEN chip, G.v4.fog)
//   cut() → boolean               a G / CUT! press while netted: true when it cuts you free (RAIDERS.cutTaps presses)
//   cutHold(down)                 G / CUT! held: cuts you free after ctx.cutHold() s (the Forge's shorter hold)
//   objective() → null, minimap() → [{ kind: 'fog' | 'current' | 'tide', ... }], summary() → [], bonus() → 0,
//   visuals() → { fog, currents, tide, nets, songs, summons, stingers }   what the envs and main draw (below)
//   get state                     a fresh plain (JSON-able) snapshot for tests (G.v4.mechanics4)
//   dispose()                     gives back every warning slot it still holds
//   net(), tide(on)               test hooks (G.v4.net / tide, SPEC4 §11.3): a net lands on you now; the tide goes
//                                 out now (on) or comes back in now (off)
//
// visuals() (fresh plain objects; ids are stable while a thing lives):
//   fog:      [{ id, x, z, h, len: 30, wid: 18 }]       (h: the bank's long axis, the way it drifts)
//   currents: [{ id, points: [{ x, z }], width: 8, speed: 3, flow }]   (flow: u the foam arrows have scrolled)
//   tide:     null | { state: 'warning' | 'low' | 'fading', t, T, k, bars: [{ id, x, z, r }] }   (null at high tide)
//   nets:     [{ id, x, z, h, len: 18, half, t, T, k }]   (a Net Sloop's whirl: id her ship id, the fan from her
//              x, z along h, half its half-width in rad; it lands at k = 1. The drape on you: playerMods().netted)
//   songs:    [{ id, x, z, r: 18, state: 'warn' | 'mend', t, T, k }]   (the Witch's ring of notes, then her mending)
//   summons:  [{ id, owner, x, z, r, t, T, k }]          (the green bubbling rings where her puffers will rise)
//   stingers: [{ id, x, z, h, behind, dancing }]         (behind: within STINGER.behind u and > STINGER.quarter° off
//              your bow, for main's BEHIND YOU! edge arrow when she is off-screen)
//
// ctx = main's ctx3 (env, player, enemies, fighting, relative, damage, pop, showBanner, announce, sfx, rng, def,
//   status, playerTurn, warnBonus, hold, attacking, boarding, turnRate) + SPEC4 §11.1's
//   { warn: { take(kind), give(kind), boss }, cutHold() → s, spyglass() → u, summon(kind, x, z, n, owner),
//   puffersAlive() → n, tables: { RAIDERS, STATUS, POOL_RULES } } and these optional members (each has a safe default):
//   inArc(ship, e, side) → boolean  main's inArc: is e inside ship's broadside arc on that side (default: the same
//                                 geometry from STINGER.arc)
//   heal(e, hp)                   mend her hull by hp (default: e.hp += hp, never above e.maxHp)
//   sendHome(owner)               foes4.sendHome: the Witch's own puffers swim home when she sinks or is taken
//   awake() → boolean             the Shellback is awake (default: false): the tide stops for good (§2.5)
//   meeting(e) → boolean          her kind's first-meeting grace is running (§3.4, default: false): she starts no
//                                 net, summons or song (main may instead keep her out of its attack slots)
// Every ctx member is optional (missing or throwing ones do nothing), and every hook takes junk without throwing.
// A warning shape takes one ctx.warn slot before it shows and gives it back when it lands or is called off, so with
// WARN.max shapes on screen the next one (and its attack) waits (§0.1).

export const MECHANIC4_IDS = Object.freeze(['fog', 'currents', 'tide']);

function freeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v);
  return Object.freeze(o);
}

// ---------------------------------------------------------------------------------------- tables
// (SPEC4's starting values; Stage 3 tunes them with bot v4. Times in seconds, distances in u, angles in degrees.)

/**
 * The Sting Sloop (§3.1, type flag `kiter`): while she holds an attack slot she makes for a spot `spot` u off your
 * stern quarter, `bearing`° off your bow on the side she is on (her band `hold`: > `quarter`° counts as behind you),
 * at your speed + `close` × the gap (at least `min` × her top speed); within `settle` u of it, with a broadside
 * loaded, she turns beam-on (the beam nearer your course) so her guns bear. Once she has been inside one of your
 * LOADED broadside arcs for `arm` s she dances away for dance.time s (turn × dance.turnMul, dance.capAdd on her cap,
 * for her spot behind you), then dance.cooldown s before the next. A chained (chain shot) or frozen sloop can't
 * dance. `behind`: the BEHIND YOU! cue's range. `arc`: the broadside arc used only when ctx.inArc is missing (main's
 * MAX_TRAVERSE rad and MAX_RANGE u).
 */
export const STINGER = freeze({
  hold: [22, 30],
  spot: 26,
  quarter: 135,
  bearing: 155,
  settle: 4,
  close: 0.9,
  min: 0.4,
  arm: 0.6,
  dance: { time: 1.2, turnMul: 1.6, capAdd: 2, cooldown: 5 },
  behind: 35,
  arc: { traverse: 0.3, range: 34 },
});

/**
 * The Net Sloop (§3.1, type flag `nets`): while she holds an attack slot she closes to a spot `beside` u off your
 * beam (her band `band`) and sails your course. With you within `reach` u, `first` s after she joins the fight (and
 * the level's grace), she whirls a net: a fan `reach` u long and `width`° wide from her toward you, painted on the
 * water and carried with her (it turns with her hull), for `warn` s (+ the Lighthouse's bonus); when it lands, if
 * your centre is inside it you are TANGLED: speed cap × speedMul, turning × turnMul, for at most `max` s, no damage.
 * Cut free by holding G / CUT! ctx.cutHold() s (RAIDERS.cutHold; the Forge's shorter), pressing it RAIDERS.cutTaps
 * times, any hit on her, or the `max` timeout. Then `cooldown` s before her next net; no net starts within `gap` s of
 * any release, or while you are netted, or while another net whirls (so nets never chain); none during a boarding,
 * nor while she burns or stinks. Fire on her while it whirls (NETS ON FIRE!): no net from her for `fireLock` s.
 */
export const NET = freeze({
  beside: 16,
  band: [14, 18],
  reach: 18,
  width: 50,
  warn: 1.6,
  speedMul: 0.5,
  turnMul: 0.6,
  max: 4,
  first: 3,
  cooldown: 10,
  gap: 8,
  fireLock: 12,
});

/**
 * The Coral Witch's Barge (§3.1, type flag `summoner`; no guns): while she holds an attack slot she keeps `keep` u
 * off (under `flee` she runs straight away, under keep[0] she opens the range on a `slant`, inside the band she
 * crosses at `cruise` × her top speed). Every `every` s, in turn: Summon, while fewer than the puffers' cap
 * (ctx.tables.POOL_RULES.puffersAlive, 6) are alive: summon.n green bubbling rings (r summon.r) `ahead` u ahead of
 * you, summon.spread u apart, for summon.warn s (+ the bonus), then min(n, cap − alive) puffers rise there
 * (ctx.summon('puffer', x, z, 1, her id), one a ring); or Song: a ring of notes round her for song.warn s (+ the
 * bonus), then every other pirate within song.r u of her mends song.hps hp/s for song.time s (never above full).
 * Stink: no song or summons for `stinkQuiet` s from its start (a Witch rule on top of STATUS). When she sinks or is
 * taken her own puffers swim home (ctx.sendHome(her id)).
 */
export const WITCH = freeze({
  keep: [30, 38],
  flee: 20,
  slant: 0.6,
  cruise: 0.6,
  every: 8,
  summon: { n: 3, warn: 1.8, ahead: [10, 14], spread: 4, r: 1.6 },
  song: { warn: 1.5, r: 18, hps: 4, time: 4 },
  stinkQuiet: 6,
});

/**
 * Fog banks (§2.6, level 10, 'fog'): `banks` ellipses `len` × `wid` riding env.fogLoops at `speed` u/s (a pure
 * function of the hazard clock: each bank's start along its loop is picked so that for the first start.time s it is
 * at least start.clear u (its edge) from the player's start). A ship whose centre is inside a bank is hidden from
 * any viewer more than `see` u away (+ ctx.spyglass() for you): no auto-aim, no FIRE! light, no tag, a "?" on the
 * minimap; a pirate you are hidden from holds her fire and sails for your last-seen spot at `seek` × her top speed
 * (circling it once there), saying "Where'd she go?" at most once per `lost` s; a ship leaving a bank gets a "!" at
 * most once per `bang` s. A soft foghorn sounds far off every `horn` s.
 */
export const FOG = freeze({
  banks: 3,
  len: 30,
  wid: 18,
  speed: 1.5,
  start: { time: 8, clear: 20 },
  see: 14,
  seek: 0.7,
  lost: 6,
  bang: 6,
  horn: 25,
});

/**
 * Coral currents (§2.6, level 11, 'currents'): the lanes of env.currents (polylines; a lane's own width, or `width`
 * u): any ship (and any puffer) whose centre is inside drifts `speed` u/s along the lane (the composed drift; main
 * skips the glued boarding pair). No damage. "WHEEE!" the first time you ride one on a level.
 */
export const CURRENT = freeze({ width: 8, speed: 3 });

/**
 * The ebb tide (§2.6, level 12, 'tide'): low tide first at `first` s of the hazard clock (combat time), then every
 * `every` s, low for `low` s; the warning (a ship's bell, LOW TIDE!, the bars bubbling) starts `warn` s (+ the
 * Lighthouse's bonus) before. While it is out each env.tideBars bar is shallows, never land: a deep hull (every type
 * without `shallow`) whose centre is inside has her speed cap × speedMul (SHALLOWS! once per entry for you). No
 * damage, no collider. It stops for good when the Shellback wakes (ctx.awake()); the bars fade over `fade` s.
 */
export const TIDE = freeze({ first: 40, every: 45, low: 12, warn: 3, speedMul: 0.5, fade: 2 });

// §0.1: at most 6 warning shapes on screen (a new one, and its attack, waits for a free slot) and at most 2 of the
// Shellback's attacks telegraphed at once (the only home of that cap: the Shellback reads it as ctx.warn.boss).
export const WARN = freeze({ max: 6, boss: 2 });

const fmt = (n) => {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 0;
  return (v < 0 ? '-' : '') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

/**
 * Every new pop, hint and live-region word of Voyage IV (§2.6, §3.1, §3.4, §3.6, §8.2, §8.4), so every screen says
 * the same thing: this module's, the foes' (foes4.js) and the Shellback's (they read it through ctx.tables.WORDS4),
 * main's HUD and its one-time tips. Strings are words; functions are templates (numbers in, a string out).
 * `{ keys, touch }` pairs: the keyboard and the touch wording.
 */
export const WORDS4 = freeze({
  // the pops (over a ship, a foe or a shape)
  pop: {
    net: 'NET!',
    netted: 'NETTED!',
    cutFree: 'CUT FREE!',
    free: 'FREE!',
    netsOnFire: 'NETS ON FIRE!',
    puffers: 'PUFFERS!',
    mending: "SHE'S MENDING!",
    lost: "Where'd she go?",
    found: '!',
    wheee: 'WHEEE!',
    lowTide: 'LOW TIDE!',
    shallows: 'SHALLOWS!',
    // the pseudo foes (foes4.js)
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
    // the Shellback (shellback.js)
    towerDown: 'TOWER DOWN!',
    bullseye: 'BULLSEYE!',
    ouch: 'OUCH!',
    clang: 'CLANG!',
    snip: 'SNIP!',
    boulder: 'BOULDER!',
    charge: 'CHARGE!',
    achoo: 'ACHOO!',
    bump: 'BUMP!',
    conch: (gold) => `+${fmt(gold)} THE GOLDEN CONCH`,
  },
  // the HUD's words (§8.2): the fog chip, the Fire cells, the edge arrow, the tags, the net strip, the Board pill
  hud: {
    hidden: 'HIDDEN',
    fog: 'FOG!',
    behind: 'BEHIND YOU!',
    under: 'UNDER WATER',
    isNew: 'NEW',
    netted: { keys: 'NETTED! Hold <kbd>G</kbd> to cut it', touch: 'NETTED! Hold <b>CUT!</b> to cut it' },
    tangled: 'TANGLED: half speed, slow turns',
    cut: 'CUT!',
  },
  // G at a pseudo target (§3.3; main's GRAPPLE_WHY for boardWhy's answers)
  board: {
    small: 'Too small to board!',
    monster: "You can't board a sea monster!",
    fort: 'Too big to board! Knock it down.',
  },
  // the meet cards' counter lines (§3.1, §3.4), by kind (the names: foes4 FOE_NAMES and SHIP_TYPES)
  meet: {
    jolly: 'Monkey Jollyboats! Grape shot tips them over. Steer out of the brown circles!',
    stinger: 'Sting Sloop! She hides behind you. Turn to get her in your sights, or chain shot her!',
    netsloop: {
      keys: 'Net Sloop! Steer out of the white net. Netted? Hold G to cut free!',
      touch: 'Net Sloop! Steer out of the white net. Netted? Hold CUT! to cut free!',
    },
    puffer: 'Puffer Mines! Pop them from far away, before they puff!',
    witch: 'Coral Witch! She calls puffers and mends her fleet. Sink or board her first!',
    coilback: "Old Coilback! Steer out of the green lane, then hit its head while it's dizzy!",
    fort: 'Rock Fort! When its red line points at you, change course! Knock it down.',
    shellback: 'THE SHELLBACK WAKES! Knock down its towers!',
    shellbackStink: ' Stink shot makes it sneeze!',
  },
  // banners (showBanner's HTML)
  banner: {
    tide: 'Low tide!<small>Sandbars slow you down</small>',
    moving: 'The island… is MOVING!',
    wakes: 'THE SHELLBACK WAKES!',
    wakesLine: 'Knock down its towers!',
    home: 'THE SHELLBACK SCUTTLES HOME!',
    hermit: 'It wants to come home with you!',
  },
  // the one-time tips (§8.4; the bit is pirates-ahoy-voyage4's `tips` bit)
  tips: {
    fog: { bit: 1, keys: 'Hidden in the fog! Fire anyway, or sail closer.', touch: 'Hidden in the fog! Fire anyway, or sail closer.' },
    net: { bit: 2, keys: 'NETTED! Hold <kbd>G</kbd> to cut it', touch: 'Hold CUT! to cut it' },
    dive: { bit: 4, keys: 'Old Coilback dived! Watch for its green lane.', touch: 'Old Coilback dived! Watch for its green lane.' },
    fort: { bit: 8, keys: 'A red line! Change course before it goes solid.', touch: 'A red line! Change course before it goes solid.' },
    tide: { bit: 16, keys: 'Low tide! Sandbars slow you down.', touch: 'Low tide! Sandbars slow you down.' },
    talk: { bit: 32, keys: 'Press <kbd>E</kbd> to talk', touch: 'Tap Talk' },
    map: { bit: 64, keys: 'New!', touch: 'New!' },
    build: { bit: 128, keys: 'Press <kbd>E</kbd> to build here', touch: 'Tap Build' },
  },
  // #game-live (polite; main de-duplicates)
  live: {
    fog: 'Hidden in the fog.',
    fogFire: 'Hidden in the fog! Fire anyway, or sail closer.',
    found: 'A ship sails out of the fog!',
    net: 'Net! Steer out of the white net.',
    netted: 'Netted! Half speed and slow turns. Hold G or CUT! to cut free.',
    free: 'You are free of the net.',
    netsOnFire: 'Her nets are on fire! No nets for a while.',
    puffers: 'Puffers! The Coral Witch calls them up ahead: steer clear of the green rings.',
    song: 'The Coral Witch is mending her fleet!',
    behind: 'A Sting Sloop is behind you!',
    current: 'A coral current carries you along!',
    tide: 'Low tide! Sandbars slow you down.',
    tideIn: 'The tide is back in.',
    // the pseudo foes (foes4.js)
    coconut: 'Coconuts! Steer out of the brown circle.',
    puff: 'A puffer is puffing! Steer away.',
    lunge: 'Old Coilback rears up! Steer out of the green lane.',
    coilback: 'Old Coilback dived!',
    home: 'Old Coilback swims home, sulking.',
    fort: 'A Rock Fort is aiming at you!',
    fortDown: 'The Rock Fort is down!',
    // the Shellback (shellback.js)
    moving: 'The island is moving!',
    wakes: 'The Shellback wakes! Knock down its towers!',
    shellHome: 'The Shellback scuttles home!',
  },
  // the cleared card's and the Victory screen's lines
  card: {
    seas: 'The seas will change next time!',
    conch: (gold) => `The Golden Conch +${fmt(gold)}`,
  },
});

// Pop styles (pops.js): a telegraph's word is important (never dropped); the rest as SPEC3's.
const STYLE = { warn: 'bad', bad: 'bad', good: 'gold', slow: 'slow', info: 'info' };
const POP_Y = 4; // pops float this high over the sea
// Today's numbers of the tables main passes in ctx.tables, used only when a table (or a number) is missing.
const RAIDERS0 = { cutTaps: 3, cutHold: 0.8 };
const PUFFERS0 = 6; // POOL_RULES.puffersAlive

// --------------------------------------------------------------------------------------- helpers

const EPS = 1e-9;
const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
const isObj = (v) => v !== null && typeof v === 'object';
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v, d) => (finite(v) ? v : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const IDENTITY = Object.freeze({ speedMul: 1, capAdd: 0, turnMul: 1, spin: 0 });
const NO_PLAYER_MODS = Object.freeze({ speedMul: 1, turnMul: 1, netted: null });
const NO_VISUALS = Object.freeze({
  fog: Object.freeze([]),
  currents: Object.freeze([]),
  tide: null,
  nets: Object.freeze([]),
  songs: Object.freeze([]),
  summons: Object.freeze([]),
  stingers: Object.freeze([]),
});

function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
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
const isShip = (s) => isObj(s) && finite(prop(s, 'x')) && finite(prop(s, 'z'));
const typeOf = (s) => {
  const t = prop(s, 'type');
  return isObj(t) ? t : {};
};
/** Afloat and not on its way down. */
const afloat = (s) => isShip(s) && num(prop(s, 'hp'), 0) > 0 && !(num(prop(s, 'sinking'), 0) > 0);
const lenOf = (s) => Math.max(0.1, num(prop(typeOf(s), 'len'), 10));
const maxOf = (s) => Math.max(0, num(prop(typeOf(s), 'maxSpeed'), 0));
const idOf = (s) => (finite(prop(s, 'id')) ? s.id : null);
const flag = (s, name) => prop(typeOf(s), name) === true;
const fwdX = (h) => Math.sin(h);
const fwdZ = (h) => Math.cos(h);
const rightX = (h) => -Math.cos(h);
const rightZ = (h) => Math.sin(h);
const bearing = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz);

// Same as main.js relative(): the point's distance along the ship's bow and to its starboard.
function relativeLocal(ship, tx, tz) {
  const dx = tx - ship.x;
  const dz = tz - ship.z;
  const h = num(ship.h, 0);
  return { along: dx * fwdX(h) + dz * fwdZ(h), lat: dx * rightX(h) + dz * rightZ(h), dist: Math.hypot(dx, dz) };
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

/** Is (px, pz) inside the fan from (ax, az) along heading h, `len` long and `half` rad either side? */
function inFan(px, pz, ax, az, h, len, half) {
  const dx = px - ax;
  const dz = pz - az;
  const d = Math.hypot(dx, dz);
  if (d > len + EPS) return false;
  if (d < 1e-6) return true;
  return Math.abs(wrapAngle(Math.atan2(dx, dz) - h)) <= half + EPS;
}

// ------------------------------------------------------------------ env shapes (read leniently)
// A point: { x, z } or [x, z]. A path: an array of points, or { points | path | pts | line }; a loop may also be an
// ellipse { cx | x, cz | z, rx, rz, rot | h | angle } or a circle { x, z, r } (sampled to a polygon).
function readPoint(p) {
  if (Array.isArray(p)) return finite(p[0]) && finite(p[1]) ? { x: p[0], z: p[1] } : null;
  const x = prop(p, 'x');
  const z = prop(p, 'z');
  return finite(x) && finite(z) ? { x, z } : null;
}
function readPoints(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const p of raw.slice(0, 512)) {
    const q = readPoint(p);
    if (q && !(out.length && Math.hypot(q.x - out[out.length - 1].x, q.z - out[out.length - 1].z) < 1e-6)) out.push(q);
  }
  return out;
}
const angleOf = (o) => num(prop(o, 'rot'), num(prop(o, 'h'), num(prop(o, 'angle'), 0)));
function ellipsePoints(cx, cz, rx, rz, rot, n = 48) {
  const out = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU;
    const u = rx * Math.cos(th);
    const v = rz * Math.sin(th);
    out.push({ x: cx + u * c + v * s, z: cz - u * s + v * c });
  }
  return out;
}
/** A path with its cumulative lengths: { pts, closed, cum, total } (null when it has no length). */
function makePath(raw, closedDefault) {
  let pts = null;
  let closed = closedDefault;
  if (Array.isArray(raw)) pts = readPoints(raw);
  else if (isObj(raw)) {
    const list = prop(raw, 'points') ?? prop(raw, 'path') ?? prop(raw, 'pts') ?? prop(raw, 'line');
    if (Array.isArray(list)) pts = readPoints(list);
    else {
      const cx = num(prop(raw, 'cx'), num(prop(raw, 'x'), NaN));
      const cz = num(prop(raw, 'cz'), num(prop(raw, 'z'), NaN));
      const r = prop(raw, 'r');
      const rx = num(prop(raw, 'rx'), num(r, NaN));
      const rz = num(prop(raw, 'rz'), num(r, NaN));
      if (finite(cx) && finite(cz) && rx > 0 && rz > 0) {
        pts = ellipsePoints(cx, cz, rx, rz, angleOf(raw));
        closed = true;
      }
    }
    const c = prop(raw, 'closed');
    if (typeof c === 'boolean' && pts && !(isObj(raw) && finite(prop(raw, 'rx')))) closed = c;
  }
  if (!pts || pts.length < 2) return null;
  if (closed && pts.length > 2) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (Math.hypot(a.x - b.x, a.z - b.z) < 1e-6) pts.pop();
  }
  if (pts.length < 3) closed = false;
  const n = closed ? pts.length : pts.length - 1;
  const cum = [0];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const total = cum[n];
  if (!(total > 1e-6)) return null;
  return { pts, closed, cum, total, n };
}
/** The point `s` u along a path (wrapping round a loop, back and forth along an open path) and the way it heads. */
function pathAt(P, s) {
  let d = s;
  let back = false;
  if (P.closed) d = ((d % P.total) + P.total) % P.total;
  else {
    const L2 = P.total * 2;
    d = ((d % L2) + L2) % L2;
    if (d > P.total) {
      d = L2 - d;
      back = true;
    }
  }
  let i = 0;
  let lo = 0;
  let hi = P.n - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (P.cum[mid] <= d) {
      i = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const a = P.pts[i];
  const b = P.pts[(i + 1) % P.pts.length];
  const seg = P.cum[i + 1] - P.cum[i];
  const k = seg > 1e-9 ? clamp((d - P.cum[i]) / seg, 0, 1) : 0;
  const h = Math.atan2(b.x - a.x, b.z - a.z);
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, h: back ? wrapAngle(h + Math.PI) : h };
}

// A tide bar (any of): { points } a polygon; { ax, az, bx, bz, r } (or { a, b, r }) a capsule; { x, z, rx, rz, rot }
// an ellipse; { x, z, len, wid, rot } a box; { x, z, r } a circle. → { inside(x, z), x, z, r (a bounding circle) }
function makeBar(raw) {
  if (!isObj(raw)) return null;
  const list = prop(raw, 'points') ?? prop(raw, 'pts');
  if (Array.isArray(list)) {
    const pts = readPoints(list);
    if (!pts || pts.length < 3) return null;
    let cx = 0;
    let cz = 0;
    for (const p of pts) {
      cx += p.x / pts.length;
      cz += p.z / pts.length;
    }
    const r = Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.z - cz)));
    return {
      x: cx,
      z: cz,
      r,
      inside(x, z) {
        let inn = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const a = pts[i];
          const b = pts[j];
          if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inn = !inn;
        }
        return inn;
      },
    };
  }
  const A = readPoint(prop(raw, 'a')) || (finite(prop(raw, 'ax')) && finite(prop(raw, 'az')) ? { x: raw.ax, z: raw.az } : null);
  const B = readPoint(prop(raw, 'b')) || (finite(prop(raw, 'bx')) && finite(prop(raw, 'bz')) ? { x: raw.bx, z: raw.bz } : null);
  const r = num(prop(raw, 'r'), NaN);
  if (A && B && r > 0) {
    const dx = B.x - A.x;
    const dz = B.z - A.z;
    const L = dx * dx + dz * dz;
    return {
      x: (A.x + B.x) / 2,
      z: (A.z + B.z) / 2,
      r: Math.sqrt(L) / 2 + r,
      inside(x, z) {
        const t = L > EPS ? clamp(((x - A.x) * dx + (z - A.z) * dz) / L, 0, 1) : 0;
        return Math.hypot(x - (A.x + dx * t), z - (A.z + dz * t)) <= r;
      },
    };
  }
  const cx = num(prop(raw, 'x'), num(prop(raw, 'cx'), NaN));
  const cz = num(prop(raw, 'z'), num(prop(raw, 'cz'), NaN));
  if (!finite(cx) || !finite(cz)) return null;
  const rot = angleOf(raw);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  // (local u along the rotated x axis, v along the rotated z axis, as ellipsePoints)
  const local = (x, z) => {
    const dx = x - cx;
    const dz = z - cz;
    return { u: dx * c - dz * s, v: dx * s + dz * c };
  };
  const rx = num(prop(raw, 'rx'), NaN);
  const rz = num(prop(raw, 'rz'), NaN);
  if (rx > 0 && rz > 0) {
    return {
      x: cx,
      z: cz,
      r: Math.max(rx, rz),
      inside(x, z) {
        const q = local(x, z);
        return (q.u / rx) ** 2 + (q.v / rz) ** 2 <= 1;
      },
    };
  }
  const len = num(prop(raw, 'len'), num(prop(raw, 'length'), NaN));
  const wid = num(prop(raw, 'wid'), num(prop(raw, 'width'), NaN));
  if (len > 0 && wid > 0) {
    // (len along the rotated z axis, the heading convention of ships; wid across)
    return {
      x: cx,
      z: cz,
      r: Math.hypot(len, wid) / 2,
      inside(x, z) {
        const q = local(x, z);
        return Math.abs(q.v) <= len / 2 && Math.abs(q.u) <= wid / 2;
      },
    };
  }
  if (r > 0) return { x: cx, z: cz, r, inside: (x, z) => Math.hypot(x - cx, z - cz) <= r };
  return null;
}

// The ctx from main, with every member optional, safe to call and never throwing.
function wrapCtx(raw) {
  const ctx = isObj(raw) ? raw : {};
  const get = (k) => prop(ctx, k);
  const call = (name, ...args) => {
    const f = get(name);
    if (typeof f !== 'function') return undefined;
    try {
      return f.apply(ctx, args);
    } catch {
      return undefined;
    }
  };
  const has = (name) => typeof get(name) === 'function';
  const spare = mulberry32(0x73756e34); // ('sun4')
  const enemies = () => {
    let list = get('enemies');
    if (typeof list === 'function') {
      try {
        list = list.call(ctx);
      } catch {
        list = null;
      }
    }
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
  const defRaw = get('def');
  const def = isObj(defRaw) ? defRaw : {};
  const table = (name, key, d) => num(prop(prop(prop(ctx, 'tables'), name), key), d);
  const warnRaw = get('warn');
  const warnCall = (name, kind) => {
    const f = prop(warnRaw, name);
    if (typeof f !== 'function') return undefined;
    try {
      return f.call(warnRaw, kind);
    } catch {
      return null;
    }
  };
  return {
    env,
    player,
    enemies,
    def,
    ships() {
      const out = [];
      const p = player();
      if (p) out.push(p);
      for (const e of enemies()) if (isShip(e) && e !== p) out.push(e);
      return out;
    },
    fighting(e) {
      if (!isShip(e)) return false;
      if (has('fighting')) return !!call('fighting', e);
      return num(prop(e, 'hp'), 0) > 0 && !prop(e, 'captured') && !prop(e, 'escaped') && !prop(e, 'surrendered') && !(num(prop(e, 'sinking'), 0) > 0);
    },
    relative(ship, x, z) {
      const r = has('relative') ? call('relative', ship, x, z) : null;
      return isObj(r) && finite(r.along) && finite(r.lat) && finite(r.dist) ? r : relativeLocal(ship, x, z);
    },
    rng() {
      const v = Number(call('rng'));
      return finite(v) && v >= 0 && v < 1 ? v : spare();
    },
    pop: (text, x, y, z, style) => call('pop', text, x, y, z, style),
    showBanner: (html, s) => call('showBanner', html, s),
    announce: (text) => call('announce', text),
    sfx: (name, x, z) => call('sfx', name, x, z),
    status(e) {
      const st = has('status') ? call('status', e) : prop(e, 'status');
      return isObj(st) ? st : null;
    },
    warnBonus() {
      const v = Number(call('warnBonus'));
      return finite(v) && v > 0 ? v : 0;
    },
    attacking: (e) => (has('attacking') ? !!call('attacking', e) : true),
    hold: () => (has('hold') ? !!call('hold') : false),
    boarding: () => (has('boarding') ? !!call('boarding') : false),
    meeting: (e) => (has('meeting') ? !!call('meeting', e) : false),
    awake: () => (has('awake') ? !!call('awake') : false),
    spyglass() {
      const v = Number(call('spyglass'));
      return finite(v) && v > 0 ? Math.min(v, 200) : 0;
    },
    cutHoldTime() {
      const v = Number(call('cutHold'));
      if (finite(v) && v > 0) return clamp(v, 0.05, NET.max);
      return clamp(table('RAIDERS', 'cutHold', RAIDERS0.cutHold), 0.05, NET.max);
    },
    cutTaps: () => Math.max(1, Math.round(clamp(table('RAIDERS', 'cutTaps', RAIDERS0.cutTaps), 1, 99))),
    puffersMax: () => Math.max(0, Math.round(clamp(table('POOL_RULES', 'puffersAlive', PUFFERS0), 0, 99))),
    puffersAlive() {
      const v = Number(call('puffersAlive'));
      return finite(v) && v > 0 ? Math.floor(v) : 0;
    },
    summon: (kind, x, z, n, owner) => call('summon', kind, x, z, n, owner),
    sendHome: (owner) => call('sendHome', owner),
    heal(e, hp) {
      if (has('heal')) return call('heal', e, hp);
      try {
        const top = num(e.maxHp, num(typeOf(e).hp, e.hp));
        if (finite(e.hp) && e.hp < top) e.hp = Math.min(top, e.hp + hp);
      } catch {
        // (a frozen or odd ship: nothing mended)
      }
      return undefined;
    },
    inArc(ship, e, side) {
      if (has('inArc')) return !!call('inArc', ship, e, side);
      const r = relativeLocal(ship, e.x, e.z);
      if (Math.sign(r.lat) !== side || r.dist > STINGER.arc.range + 2) return false;
      return Math.atan2(Math.abs(r.along), Math.abs(r.lat)) - Math.atan2(lenOf(e) / 2, Math.max(r.dist, 1e-3)) <= STINGER.arc.traverse;
    },
    // ctx.warn: no warn means no cap (Voyages I–III); a slot is taken unless take() says false. free(): the slots
    // left when main's warnSlots says (its max and count), so a shape of several rings never half-takes
    free() {
      const max = Number(prop(warnRaw, 'max'));
      const count = Number(prop(warnRaw, 'count'));
      return finite(max) && finite(count) ? Math.max(0, max - count) : Infinity;
    },
    take(kind) {
      if (!isObj(warnRaw) || typeof prop(warnRaw, 'take') !== 'function') return true;
      const v = warnCall('take', kind);
      return v !== false && v !== null;
    },
    give(kind) {
      if (isObj(warnRaw)) warnCall('give', kind);
    },
  };
}

// ------------------------------------------------------------------------------ createMechanics4

export function createMechanics4(ids, ctx) {
  const list = [];
  if (Array.isArray(ids)) {
    for (const id of ids) if (typeof id === 'string' && MECHANIC4_IDS.includes(id) && !list.includes(id)) list.push(id);
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
  const shown = { tide: false, wheee: false }; // first-time banners and words
  const counts = { whirls: 0, nets: 0, misses: 0, netsOnFire: 0, released: { cut: 0, hit: 0, time: 0, gone: 0, hold: 0 }, dances: 0, summons: 0, risen: 0, songs: 0, mended: 0, lows: 0, horns: 0, lost: 0, found: 0, waited: 0 };

  const recs = new Map(); // enemy → { sting, net, witch, fog, lastHp }
  const fx = new Map(); // any ship → { shallow, current }
  const fxOf = (s) => {
    let f = fx.get(s);
    if (!f) {
      f = { shallow: false, current: false };
      fx.set(s, f);
    }
    return f;
  };
  const statusId = (e) => {
    const st = c.status(e);
    const id = st ? prop(st, 'id') : null;
    return typeof id === 'string' && finite(prop(st, 't')) && st.t > EPS ? id : null;
  };
  const effect = (e, k) => num(prop(prop(e, 'effects'), k), 0);
  const chained = (e) => effect(e, 'slow') > EPS; // chain shot (main's EFFECTS.chain)
  const burning = (e) => statusId(e) === 'fire' || effect(e, 'burn') > EPS || num(prop(e, 'burnTicks'), 0) > 0;
  const isPlayer = (s) => s === c.player();

  // ------------------------------------------------------------------ warning slots (§0.1)
  // Every shape this module shows takes one slot before it shows; slots are given back when it lands or is called
  // off (and all of them at dispose()), so the count main keeps never leaks.
  let slotsHeld = 0;
  function take(kind, n = 1) {
    if (n > 1 && c.free() < n) {
      counts.waited++;
      return false;
    }
    let got = 0;
    for (let i = 0; i < n; i++) {
      if (!c.take(kind)) break;
      got++;
    }
    if (got < n) {
      for (let i = 0; i < got; i++) c.give(kind);
      counts.waited++;
      return false;
    }
    slotsHeld += n;
    return true;
  }
  function give(kind, n = 1) {
    const k = Math.min(n, slotsHeld);
    for (let i = 0; i < k; i++) c.give(kind);
    slotsHeld -= k;
  }

  // ------------------------------------------------------------------ the ships' records

  function register(e) {
    let r = recs.get(e);
    if (r) return r;
    r = {
      sting: flag(e, 'kiter') ? { armed: 0, dance: 0, cool: 0, side: 0 } : null,
      net: flag(e, 'nets') ? { next: NET.first, whirl: null } : null,
      witch: flag(e, 'summoner') ? { clock: WITCH.every, turn: 'summon', act: null, quietUntil: -Infinity, stunk: false } : null,
      fog: { seen: true, lastX: NaN, lastZ: NaN, lastH: 0, lostAt: -Infinity, inFog: false, bangAt: -Infinity },
      lastHp: num(prop(e, 'hp'), 0),
    };
    const p = c.player();
    if (p) {
      r.fog.lastX = p.x;
      r.fog.lastZ = p.z;
      r.fog.lastH = num(p.h, 0);
    }
    recs.set(e, r);
    return r;
  }
  function registerAll() {
    const p = c.player();
    for (const e of c.enemies()) if (isShip(e) && e !== p && !recs.has(e)) register(e);
  }

  // ------------------------------------------------------------------ env data (read once, at the first use)

  let envRead = false;
  let fogPaths = [];
  let banks = []; // { id, path, s0, x, z, h }
  let lanes = []; // { id, path, hw, width, points }
  let bars = []; // { id, x, z, r, inside }
  function readEnv() {
    if (envRead) return;
    const env = c.env();
    if (!env) return; // (try again next time: main's env is there by the first step)
    envRead = true;
    if (on('fog')) {
      const raw = prop(env, 'fogLoops');
      fogPaths = Array.isArray(raw) ? raw.slice(0, 16).map((L) => makePath(L, true)).filter(Boolean) : [];
      makeBanks(env);
    }
    if (on('currents')) {
      const raw = prop(env, 'currents');
      lanes = (Array.isArray(raw) ? raw.slice(0, 16) : [])
        .map((L, i) => {
          const path = makePath(L, false);
          if (!path) return null;
          const w = num(prop(L, 'width'), num(prop(L, 'w'), CURRENT.width));
          const width = w > 0 ? Math.min(w, 60) : CURRENT.width;
          return { id: i + 1, path, width, hw: width / 2, points: Object.freeze(path.pts.map((p) => Object.freeze({ x: p.x, z: p.z }))) };
        })
        .filter(Boolean);
    }
    if (on('tide')) {
      const raw = prop(env, 'tideBars');
      bars = (Array.isArray(raw) ? raw.slice(0, 16) : [])
        .map(makeBar)
        .filter(Boolean)
        .map((b, i) => ({ ...b, id: i + 1 }));
    }
  }

  // ------------------------------------------------------------------ fog banks

  const startPos = () => {
    const ps = prop(c.env(), 'playerStart');
    const q = readPoint(ps);
    if (q) return q;
    const p = c.player();
    return p ? { x: p.x, z: p.z } : { x: 0, z: 0 };
  };
  // FOG.banks banks over the loops (one a loop while there are enough; more share a loop, evenly spaced). Each loop's
  // start is the one of 64 candidates that keeps its banks farthest from the player's start over the first
  // FOG.start.time s (deterministic: no rng).
  function makeBanks() {
    banks = [];
    if (!fogPaths.length) return;
    const st = startPos();
    const half = FOG.len / 2;
    const per = fogPaths.map(() => 0);
    for (let i = 0; i < FOG.banks; i++) per[i % fogPaths.length]++;
    let id = 0;
    fogPaths.forEach((P, li) => {
      const m = per[li];
      if (!m) return;
      let best = 0;
      let bestScore = -Infinity;
      for (let j = 0; j < 64; j++) {
        const s0 = (P.total * j) / 64;
        let score = Infinity;
        for (let k = 0; k < m; k++) {
          for (let t = 0; t <= FOG.start.time + EPS; t += 1) {
            const q = pathAt(P, s0 + (k * P.total) / m + FOG.speed * t);
            score = Math.min(score, Math.hypot(q.x - st.x, q.z - st.z) - half);
          }
        }
        if (score > bestScore + 1e-9) {
          bestScore = score;
          best = s0;
        }
      }
      for (let k = 0; k < m; k++) banks.push({ id: ++id, path: P, s0: best + (k * P.total) / m, x: 0, z: 0, h: 0 });
    });
    placeBanks();
  }
  function placeBanks() {
    for (const b of banks) {
      const q = pathAt(b.path, b.s0 + FOG.speed * hz);
      b.x = q.x;
      b.z = q.z;
      b.h = q.h;
    }
  }
  function bankAt(x, z) {
    if (!on('fog') || !finite(x) || !finite(z)) return null;
    readEnv();
    const a = FOG.len / 2;
    const w = FOG.wid / 2;
    for (const b of banks) {
      const dx = x - b.x;
      const dz = z - b.z;
      if (Math.abs(dx) > a + 1 || Math.abs(dz) > a + 1) continue;
      const u = dx * fwdX(b.h) + dz * fwdZ(b.h);
      const v = dx * rightX(b.h) + dz * rightZ(b.h);
      if ((u / a) ** 2 + (v / w) ** 2 <= 1 + EPS) return b;
    }
    return null;
  }
  // Fog hides a ship (a real one: never a pseudo target, a shape or a crate) from a viewer farther than FOG.see.
  function hiddenFrom(target, viewer) {
    if (!on('fog') || !isShip(target) || prop(target, 'pseudo') || !isObj(prop(target, 'type'))) return false;
    const p = c.player();
    const v = isShip(viewer) ? viewer : p;
    if (!v || target === v) return false;
    if (!bankAt(target.x, target.z)) return false;
    const reach = FOG.see + (v === p ? c.spyglass() : 0);
    return Math.hypot(target.x - v.x, target.z - v.z) > reach + EPS;
  }
  let playerInFog = false;
  let hornAt = FOG.horn;
  function stepFog() {
    if (!on('fog')) return;
    placeBanks();
    const p = c.player();
    // you: the HIDDEN chip's words
    const inside = !!(p && afloat(p) && bankAt(p.x, p.z));
    if (inside && !playerInFog) c.announce(WORDS4.live.fog);
    playerInFog = inside;
    for (const [e, r] of recs) {
      if (!afloat(e) || prop(e, 'captured') || prop(e, 'escaped')) continue;
      const F = r.fog;
      // a ship leaving a bank: "!" (at most once per FOG.bang s)
      const inF = !!bankAt(e.x, e.z);
      if (F.inFog && !inF && hz - F.bangAt >= FOG.bang - EPS) {
        F.bangAt = hz;
        counts.found++;
        c.pop(WORDS4.pop.found, e.x, POP_Y, e.z, STYLE.info);
      }
      F.inFog = inF;
      // does she see you? (your last-seen spot is where she will look)
      if (!p || !afloat(p)) continue;
      const sees = !hiddenFrom(p, e);
      if (sees) {
        F.lastX = p.x;
        F.lastZ = p.z;
        F.lastH = num(p.h, 0);
      } else if (F.seen && c.fighting(e) && hz - F.lostAt >= FOG.lost - EPS) {
        F.lostAt = hz;
        counts.lost++;
        c.pop(WORDS4.pop.lost, e.x, POP_Y, e.z, STYLE.info);
      }
      F.seen = sees;
    }
    if (banks.length && hz >= hornAt - EPS) {
      hornAt = hz + FOG.horn;
      // (far off: the bank farthest from you)
      const ref = p || startPos();
      let far = banks[0];
      for (const b of banks) if (Math.hypot(b.x - ref.x, b.z - ref.z) > Math.hypot(far.x - ref.x, far.z - ref.z)) far = b;
      counts.horns++;
      c.sfx('foghorn', far.x, far.z);
    }
  }
  /** Where `e` thinks you are: you, or (fog) your last-seen spot. */
  function targetFor(e, p) {
    const r = recs.get(e);
    if (!r || !on('fog') || r.fog.seen || !finite(r.fog.lastX)) return { x: p.x, z: p.z, h: num(p.h, 0), speed: Math.max(0, num(p.speed, 0)), seen: true };
    return { x: r.fog.lastX, z: r.fog.lastZ, h: r.fog.lastH, speed: 0, seen: false };
  }

  // ------------------------------------------------------------------ coral currents

  // The lane a point is in (the nearest whose half-width covers it) → its flow { vx, vz }, or null.
  function currentAt(x, z) {
    if (!on('currents') || !finite(x) || !finite(z)) return null;
    readEnv();
    let best = null;
    for (const L of lanes) {
      const P = L.path;
      for (let i = 0; i < P.n; i++) {
        const a = P.pts[i];
        const b = P.pts[(i + 1) % P.pts.length];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const LL = dx * dx + dz * dz;
        if (LL < EPS) continue;
        const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / LL, 0, 1);
        const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
        if (d <= L.hw + EPS && (!best || d < best.d)) {
          const l = Math.sqrt(LL);
          best = { d, ux: dx / l, uz: dz / l };
        }
      }
    }
    return best ? { vx: best.ux * CURRENT.speed, vz: best.uz * CURRENT.speed } : null;
  }
  function stepCurrents() {
    if (!on('currents')) return;
    const p = c.player();
    if (!p || !afloat(p)) return;
    const f = fxOf(p);
    const inside = !!currentAt(p.x, p.z);
    if (inside && !f.current && !shown.wheee) {
      shown.wheee = true;
      c.pop(WORDS4.pop.wheee, p.x, POP_Y, p.z, STYLE.good);
      c.announce(WORDS4.live.current);
    }
    f.current = inside;
  }

  // ------------------------------------------------------------------ the ebb tide

  const tide = { phase: on('tide') ? 'high' : 'off', t: 0, T: 0, nextLow: TIDE.first, stopped: false };
  const tideLow = () => tide.phase === 'low' && !tide.stopped;
  const warnTime = () => TIDE.warn + c.warnBonus();
  function tideWarn() {
    tide.phase = 'warning';
    tide.t = 0;
    tide.T = Math.max(0, tide.nextLow - hz);
    const p = c.player();
    const at = p || startPos();
    c.sfx('tidebell', at.x, at.z);
    c.pop(WORDS4.pop.lowTide, at.x, POP_Y, at.z, STYLE.warn);
    c.announce(WORDS4.live.tide);
    if (!shown.tide) {
      shown.tide = true;
      c.showBanner(WORDS4.banner.tide, 2.5);
    }
  }
  function tideOut() {
    tide.phase = 'low';
    tide.t = 0;
    tide.T = TIDE.low;
    counts.lows++;
  }
  function tideIn() {
    tide.phase = 'high';
    tide.t = 0;
    tide.T = 0;
    while (tide.nextLow <= hz + EPS) tide.nextLow += TIDE.every;
    for (const f of fx.values()) f.shallow = false;
    c.announce(WORDS4.live.tideIn);
  }
  function stopTide() {
    if (tide.stopped || tide.phase === 'off') return;
    tide.stopped = true;
    const showing = tide.phase === 'warning' || tide.phase === 'low';
    tide.phase = showing ? 'fading' : 'off';
    tide.t = 0;
    tide.T = TIDE.fade;
    for (const f of fx.values()) f.shallow = false;
  }
  function stepTide(g) {
    if (!on('tide') || tide.phase === 'off') return;
    if (!tide.stopped && c.awake()) stopTide();
    if (tide.phase === 'fading') {
      tide.t += g;
      if (tide.t >= tide.T - EPS) tide.phase = 'off';
      return;
    }
    if (tide.stopped) return;
    if (tide.phase === 'high') {
      if (hz >= tide.nextLow - warnTime() - EPS) tideWarn();
    } else if (tide.phase === 'warning') {
      tide.t += g;
      if (hz >= tide.nextLow - EPS) tideOut();
    } else if (tide.phase === 'low') {
      tide.t += g;
      if (tide.t >= tide.T - EPS) {
        tide.nextLow += TIDE.every;
        tideIn();
      }
    }
    // SHALLOWS! once per entry (yours: the word; every deep hull is slowed by shipMods)
    if (tideLow()) {
      for (const s of c.ships()) {
        if (!afloat(s)) continue;
        const f = fxOf(s);
        const inside = !flag(s, 'shallow') && !!barAt(s.x, s.z);
        if (inside && !f.shallow && isPlayer(s)) c.pop(WORDS4.pop.shallows, s.x, POP_Y, s.z, STYLE.slow);
        f.shallow = inside;
      }
    }
  }
  function barAt(x, z) {
    if (!on('tide') || !finite(x) || !finite(z)) return null;
    readEnv();
    for (const b of bars) if (Math.hypot(x - b.x, z - b.z) <= b.r + EPS && b.inside(x, z)) return b;
    return null;
  }

  // ------------------------------------------------------------------ the net (yours)

  let netted = null; // { by: the sloop (or null), t, taps, hold }
  let holdDown = false; // G / CUT! held now
  let lastRelease = -Infinity;
  const anyWhirl = () => [...recs.values()].some((r) => r.net && r.net.whirl);
  function landNet(by) {
    const p = c.player();
    if (!p || netted) return false;
    netted = { by, t: 0, taps: 0, hold: 0 };
    counts.nets++;
    c.pop(WORDS4.pop.netted, p.x, POP_Y, p.z, STYLE.bad);
    c.sfx('thud', p.x, p.z);
    c.announce(WORDS4.live.netted);
    return true;
  }
  function release(why) {
    if (!netted) return;
    netted = null;
    lastRelease = hz;
    counts.released[why] = (counts.released[why] || 0) + 1;
    const p = c.player();
    if (p && why !== 'hold' && why !== 'gone') c.pop(why === 'cut' ? WORDS4.pop.cutFree : WORDS4.pop.free, p.x, POP_Y, p.z, why === 'cut' ? STYLE.good : STYLE.info);
    if (p && why === 'cut') c.sfx('cut', p.x, p.z);
    if (why !== 'hold') c.announce(WORDS4.live.free);
  }
  function stepNetted(g) {
    if (!netted) return;
    netted.t += g;
    if (holdDown) {
      netted.hold += g;
      if (netted.hold >= c.cutHoldTime() - EPS) return release('cut');
    } else netted.hold = 0;
    const by = netted.by;
    if (by) {
      const r = recs.get(by);
      // any hit on her lets the net go (her hull went down since the last step)
      if (r && num(prop(by, 'hp'), 0) < r.lastHp - EPS) return release('hit');
      if (!afloat(by) || prop(by, 'captured') || prop(by, 'escaped')) return release('gone');
    }
    if (netted.t >= NET.max - EPS) release('time');
  }

  // ------------------------------------------------------------------ the Net Sloop

  function cancelWhirl(N) {
    if (!N.whirl) return;
    N.whirl = null;
    give('net');
  }
  function stepNetSloop(e, r, g, p) {
    const N = r.net;
    N.next -= g;
    if (N.whirl) {
      const W = N.whirl;
      // called off: she is out of the fight, a boarding starts, she burns (NETS ON FIRE!) or stinks
      if (!c.fighting(e) || c.boarding() || !p || !afloat(p)) return cancelWhirl(N);
      if (burning(e)) {
        cancelWhirl(N);
        N.next = Math.max(N.next, NET.fireLock);
        counts.netsOnFire++;
        c.pop(WORDS4.pop.netsOnFire, e.x, POP_Y, e.z, STYLE.good);
        c.announce(WORDS4.live.netsOnFire);
        return;
      }
      if (statusId(e) === 'stink') return cancelWhirl(N);
      W.t += g;
      if (W.t < W.T - EPS) return;
      // it lands: the fan from her, carried with her hull
      N.whirl = null;
      give('net');
      N.next = NET.cooldown;
      const h = wrapAngle(num(e.h, 0) + W.rel);
      if (!netted && inFan(p.x, p.z, e.x, e.z, h, NET.reach, (NET.width / 2) * RAD)) landNet(e);
      else {
        counts.misses++;
        c.sfx('splash', e.x + fwdX(h) * NET.reach * 0.6, e.z + fwdZ(h) * NET.reach * 0.6);
      }
      return;
    }
    if (N.next > EPS) return;
    N.next = 0;
    if (!live() || !c.fighting(e) || !c.attacking(e) || c.meeting(e) || !p || !afloat(p)) return;
    if (netted || c.boarding() || anyWhirl() || hz - lastRelease < NET.gap - EPS) return;
    if (burning(e) || statusId(e) === 'stink') return;
    if (on('fog') && hiddenFrom(p, e)) return; // (she can't see you)
    const d = Math.hypot(p.x - e.x, p.z - e.z);
    if (d > NET.reach - EPS) return;
    if (!take('net')) return; // (a 7th shape waits, and its net with it)
    N.whirl = { t: 0, T: NET.warn + c.warnBonus(), rel: wrapAngle(bearing(e.x, e.z, p.x, p.z) - num(e.h, 0)) };
    counts.whirls++;
    c.sfx('netWhirl', e.x, e.z);
    c.pop(WORDS4.pop.net, e.x, POP_Y, e.z, STYLE.warn);
    c.announce(WORDS4.live.net);
  }
  // Her course: for a spot NET.beside u off your beam (the side she is on), then your course there, faster while the
  // spot is ahead of her and slower once she is past it (she never turns round to chase a spot just behind her; one
  // far behind her she turns for).
  function netCourse(e, P, max) {
    const side = c.relative(P, e.x, e.z).lat >= 0 ? 1 : -1;
    const tx = P.x + rightX(P.h) * side * NET.beside + fwdX(P.h) * P.speed * 0.5;
    const tz = P.z + rightZ(P.h) * side * NET.beside + fwdZ(P.h) * P.speed * 0.5;
    const dx = tx - e.x;
    const dz = tz - e.z;
    const gap = Math.hypot(dx, dz);
    const ahead = dx * fwdX(P.h) + dz * fwdZ(P.h);
    const across = dx * rightX(P.h) + dz * rightZ(P.h);
    if (gap > NET.reach && ahead < -NET.beside / 2) return { h: bearing(e.x, e.z, tx, tz), speed: max };
    const fx = Math.max(ahead, 6);
    const h = Math.atan2(fwdX(P.h) * fx + rightX(P.h) * across, fwdZ(P.h) * fx + rightZ(P.h) * across);
    return { h: wrapAngle(h), speed: clamp(P.speed + ahead * 0.9, Math.min(2, max), max) };
  }

  // ------------------------------------------------------------------ the Sting Sloop

  function inLoadedArc(e, p) {
    const reload = prop(p, 'reload');
    for (const side of [-1, 1]) {
      const loaded = !isObj(reload) || !(num(prop(reload, side > 0 ? 'star' : 'port'), 0) > 0);
      if (loaded && c.inArc(p, e, side)) return true;
    }
    return false;
  }
  const canDance = (e) => !chained(e) && statusId(e) !== 'frost';
  function stepStinger(e, r, g, p) {
    const S = r.sting;
    if (S.cool > 0) S.cool = Math.max(0, S.cool - g);
    if (!c.fighting(e)) {
      S.dance = 0;
      S.armed = 0;
      return;
    }
    if (S.dance > 0) {
      S.dance -= g;
      if (S.dance <= EPS || !canDance(e)) {
        S.dance = 0;
        S.cool = STINGER.dance.cooldown;
      }
      return;
    }
    if (!p || !afloat(p) || !canDance(e) || !live()) {
      S.armed = 0;
      return;
    }
    S.armed = inLoadedArc(e, p) ? S.armed + g : 0;
    if (S.armed >= STINGER.arm - EPS && S.cool <= EPS) {
      S.dance = STINGER.dance.time;
      S.armed = 0;
      counts.dances++;
      c.sfx('fwap', e.x, e.z);
    }
  }
  /** Is she behind you: within STINGER.behind u and more than STINGER.quarter° off your bow? */
  function behindYou(e, p) {
    const r = c.relative(p, e.x, e.z);
    return r.dist <= STINGER.behind + EPS && Math.atan2(Math.abs(r.lat), r.along) > STINGER.quarter * RAD + EPS;
  }
  function stingSpot(e, r, P) {
    // the quarter she is on (it changes only once she is clearly on the other one, so she never dithers astern)
    const lat = c.relative(P, e.x, e.z).lat;
    const S = r.sting;
    if (!S.side || Math.abs(lat) > STINGER.settle) S.side = lat >= 0 ? 1 : -1;
    const side = S.side;
    const th = STINGER.bearing * RAD;
    const ux = fwdX(P.h) * Math.cos(th) + rightX(P.h) * side * Math.sin(th);
    const uz = fwdZ(P.h) * Math.cos(th) + rightZ(P.h) * side * Math.sin(th);
    return { x: P.x + ux * STINGER.spot, z: P.z + uz * STINGER.spot };
  }
  function stingCourse(e, r, P, max) {
    const spot = stingSpot(e, r, P);
    const gap = Math.hypot(spot.x - e.x, spot.z - e.z);
    if (r.sting.dance > 0) return { h: bearing(e.x, e.z, spot.x, spot.z), speed: max + STINGER.dance.capAdd };
    const reload = prop(e, 'reload');
    const loaded = !isObj(reload) || !(num(prop(reload, 'port'), 0) > 0) || !(num(prop(reload, 'star'), 0) > 0);
    if (gap <= STINGER.settle + EPS && loaded) {
      // beam-on to you, the beam nearer your course (so she sails alongside your wake)
      const toYou = bearing(e.x, e.z, P.x, P.z);
      const a1 = wrapAngle(toYou + Math.PI / 2);
      const a2 = wrapAngle(toYou - Math.PI / 2);
      const h = Math.abs(wrapAngle(a1 - P.h)) <= Math.abs(wrapAngle(a2 - P.h)) ? a1 : a2;
      return { h, speed: clamp(P.speed, STINGER.min * max, max) };
    }
    return { h: bearing(e.x, e.z, spot.x, spot.z), speed: clamp(P.speed + gap * STINGER.close, STINGER.min * max, max) };
  }

  // ------------------------------------------------------------------ the Coral Witch

  function cancelAct(W) {
    const A = W.act;
    if (!A) return;
    W.act = null;
    if (A.slots) give(A.kind, A.slots);
  }
  function ringSpots(p, n) {
    const d = range(WITCH.summon.ahead);
    const h = num(p.h, 0);
    const cx = p.x + fwdX(h) * d;
    const cz = p.z + fwdZ(h) * d;
    const rot = c.rng() * TAU;
    const env = c.env();
    const rawCols = prop(env, 'colliders');
    const cols = (Array.isArray(rawCols) ? rawCols.slice(0, 512) : [])
      .map((o) => ({ x: prop(o, 'x'), z: prop(o, 'z'), r: prop(o, 'r') }))
      .filter((o) => finite(o.x) && finite(o.z) && finite(o.r) && o.r >= 0);
    const out = [];
    const rr = n > 1 ? WITCH.summon.spread / (2 * Math.sin(Math.PI / n)) : 0; // (rings spread apart, side to side)
    for (let k = 0; k < n; k++) {
      const a = rot + (k * TAU) / n;
      let x = cx + Math.sin(a) * rr;
      let z = cz + Math.cos(a) * rr;
      // (never on land: pushed out to open water)
      for (const o of cols) {
        const dx = x - o.x;
        const dz = z - o.z;
        const dd = Math.hypot(dx, dz);
        const need = o.r + WITCH.summon.r + 1;
        if (dd < need) {
          const ux = dd > 1e-6 ? dx / dd : 1;
          const uz = dd > 1e-6 ? dz / dd : 0;
          x = o.x + ux * need;
          z = o.z + uz * need;
        }
      }
      out.push({ x, z });
    }
    return out;
  }
  function stepWitch(e, r, g, p) {
    const W = r.witch;
    if (!c.fighting(e)) return cancelAct(W);
    // Stink: no song or summons for WITCH.stinkQuiet s from its start
    const stinky = statusId(e) === 'stink';
    if (stinky && !W.stunk) {
      W.quietUntil = hz + WITCH.stinkQuiet;
      cancelAct(W);
    }
    W.stunk = stinky;
    if (hz < W.quietUntil - EPS) return;
    if (W.clock > 0) W.clock = Math.max(0, W.clock - g); // (start to start: it runs while an act plays out too)
    const A = W.act;
    if (A) {
      A.t += g;
      if (A.kind === 'summon') {
        if (A.t < A.T - EPS) return;
        W.act = null;
        give('summon', A.slots);
        const room = Math.max(0, c.puffersMax() - c.puffersAlive());
        const n = Math.min(A.rings.length, room);
        for (let k = 0; k < n; k++) c.summon('puffer', A.rings[k].x, A.rings[k].z, 1, idOf(e));
        counts.risen += n;
        return;
      }
      // the song: its warning, then the mending
      if (A.phase === 'warn') {
        if (A.t < A.T - EPS) return;
        give('song', A.slots);
        A.slots = 0;
        A.phase = 'mend';
        A.t = 0;
        A.T = WITCH.song.time;
        return;
      }
      for (const o of c.enemies()) {
        if (o === e || !isShip(o) || !c.fighting(o)) continue;
        if (Math.hypot(o.x - e.x, o.z - e.z) > WITCH.song.r + EPS) continue;
        const before = num(prop(o, 'hp'), 0);
        c.heal(o, WITCH.song.hps * g);
        const after = num(prop(o, 'hp'), 0);
        if (after > before) counts.mended += after - before;
      }
      if (A.t >= A.T - EPS) W.act = null;
      return;
    }
    if (!live() || !c.attacking(e) || c.meeting(e) || !p || !afloat(p)) return;
    if (W.clock > EPS) return;
    const sees = !(on('fog') && hiddenFrom(p, e));
    if (W.turn === 'summon' && sees && c.puffersAlive() < c.puffersMax()) {
      const n = WITCH.summon.n;
      if (!take('summon', n)) return; // (waits for free slots)
      const rings = ringSpots(p, n);
      W.act = { kind: 'summon', t: 0, T: WITCH.summon.warn + c.warnBonus(), rings, slots: n };
      W.turn = 'song';
      W.clock = WITCH.every;
      counts.summons++;
      const mx = rings.reduce((s, q) => s + q.x, 0) / rings.length;
      const mz = rings.reduce((s, q) => s + q.z, 0) / rings.length;
      c.sfx('conch', e.x, e.z);
      c.pop(WORDS4.pop.puffers, mx, POP_Y, mz, STYLE.warn);
      c.announce(WORDS4.live.puffers);
      return;
    }
    if (!take('song', 1)) return;
    W.act = { kind: 'song', phase: 'warn', t: 0, T: WITCH.song.warn + c.warnBonus(), slots: 1 };
    W.turn = 'summon';
    W.clock = WITCH.every;
    counts.songs++;
    c.sfx('song', e.x, e.z);
    c.pop(WORDS4.pop.mending, e.x, POP_Y, e.z, STYLE.warn);
    c.announce(WORDS4.live.song);
  }
  function witchCourse(e, P, max) {
    const d = Math.hypot(P.x - e.x, P.z - e.z);
    const toYou = bearing(e.x, e.z, P.x, P.z);
    const away = wrapAngle(toYou + Math.PI);
    const h0 = num(e.h, 0);
    const nearer = (a1, a2) => (Math.abs(wrapAngle(a1 - h0)) <= Math.abs(wrapAngle(a2 - h0)) ? a1 : a2);
    if (d < WITCH.flee) return { h: away, speed: max };
    if (d < WITCH.keep[0]) return { h: nearer(wrapAngle(away + WITCH.slant), wrapAngle(away - WITCH.slant)), speed: max };
    if (d > WITCH.keep[1]) return { h: toYou, speed: max };
    return { h: nearer(wrapAngle(toYou + Math.PI / 2), wrapAngle(toYou - Math.PI / 2)), speed: max * WITCH.cruise };
  }

  // A ship leaves the fight (sunk, taken, removed): her shapes go (their slots back), her net lets you go, her
  // puffers swim home.
  function leave(e, why) {
    const r = recs.get(e);
    if (r && r.net) cancelWhirl(r.net);
    if (r && r.witch) {
      cancelAct(r.witch);
      if (!r.witch.home) c.sendHome(idOf(e)); // (once: onCapture or onSink, then onRemove)
      r.witch.home = true;
    }
    if (r && r.sting) r.sting.dance = 0;
    if (netted && netted.by === e) release('gone');
  }

  // ------------------------------------------------------------------ snapshots

  const bankVisual = (b) => ({ id: b.id, x: b.x, z: b.z, h: b.h, len: FOG.len, wid: FOG.wid });
  const laneVisual = (L) => ({ id: L.id, points: L.points, width: L.width, speed: CURRENT.speed, flow: hz * CURRENT.speed });
  function tideVisual() {
    if (!on('tide') || tide.phase === 'off' || tide.phase === 'high') return null;
    const k = tide.T > 0 ? clamp(tide.t / tide.T, 0, 1) : 1;
    return { state: tide.phase, t: tide.t, T: tide.T, k, bars: bars.map((b) => ({ id: b.id, x: b.x, z: b.z, r: b.r })) };
  }
  function netVisuals() {
    const out = [];
    for (const [e, r] of recs) {
      const W = r.net && r.net.whirl;
      if (!W || !afloat(e)) continue;
      out.push({ id: idOf(e), x: e.x, z: e.z, h: wrapAngle(num(e.h, 0) + W.rel), len: NET.reach, half: (NET.width / 2) * RAD, t: W.t, T: W.T, k: clamp(W.T > 0 ? W.t / W.T : 1, 0, 1) });
    }
    return out;
  }
  function songVisuals() {
    const out = [];
    for (const [e, r] of recs) {
      const A = r.witch && r.witch.act;
      if (!A || A.kind !== 'song' || !afloat(e)) continue;
      out.push({ id: idOf(e), x: e.x, z: e.z, r: WITCH.song.r, state: A.phase, t: A.t, T: A.T, k: clamp(A.T > 0 ? A.t / A.T : 1, 0, 1) });
    }
    return out;
  }
  function summonVisuals() {
    const out = [];
    for (const [e, r] of recs) {
      const A = r.witch && r.witch.act;
      if (!A || A.kind !== 'summon') continue;
      A.rings.forEach((q, i) => out.push({ id: `${idOf(e)}-${i}`, owner: idOf(e), x: q.x, z: q.z, r: WITCH.summon.r, t: A.t, T: A.T, k: clamp(A.T > 0 ? A.t / A.T : 1, 0, 1) }));
    }
    return out;
  }
  function stingVisuals() {
    const out = [];
    const p = c.player();
    for (const [e, r] of recs) {
      if (!r.sting || !afloat(e) || !c.fighting(e)) continue;
      out.push({ id: idOf(e), x: e.x, z: e.z, h: num(e.h, 0), behind: !!(p && behindYou(e, p)), dancing: r.sting.dance > 0 });
    }
    return out;
  }

  const api = {
    init() {
      registerAll(); // (wave 0 may have sailed in before the mechanics existed)
      readEnv();
      if (wave < 0) wave = 0;
    },
    onSpawn(e, waveIndex) {
      if (Number.isInteger(waveIndex) && waveIndex > wave) wave = waveIndex;
      if (!isShip(e) || e === c.player()) return;
      register(e);
    },
    onCapture(e) {
      if (isShip(e)) leave(e, 'capture');
    },
    onSink(e) {
      if (isShip(e)) leave(e, 'sink');
    },
    onRemove(e) {
      if (!isObj(e)) return;
      leave(e, 'remove');
      recs.delete(e);
      fx.delete(e);
    },
    step(dt) {
      const d = Math.max(0, num(dt, 0));
      now += d;
      held = c.hold();
      readEnv();
      registerAll();
      if (held) {
        // Everything waits (the fly-in, a boarding's truce): the shapes are called off (their slots back) and a net
        // on you lets go, so nothing lands without its whole telegraph once your controls are back.
        for (const r of recs.values()) {
          if (r.net) cancelWhirl(r.net);
          if (r.witch && r.witch.act && !(r.witch.act.kind === 'song' && r.witch.act.phase === 'mend')) cancelAct(r.witch);
          if (r.sting) r.sting.dance = 0;
        }
        if (netted) release('hold');
        for (const [e, r] of recs) r.lastHp = num(prop(e, 'hp'), 0);
        return;
      }
      const g = d;
      if (!(g > 0)) return;
      hz += g;
      const p = c.player();
      stepFog();
      stepNetted(g);
      for (const [e, r] of [...recs]) {
        if (r.sting) stepStinger(e, r, g, p);
        if (r.net) stepNetSloop(e, r, g, p);
        if (r.witch) stepWitch(e, r, g, p);
      }
      for (const [e, r] of recs) r.lastHp = num(prop(e, 'hp'), 0);
      stepCurrents();
      stepTide(g);
    },
    steer(e) {
      if (!isShip(e)) return null;
      const r = recs.get(e);
      if (!r) return null;
      const p = c.player();
      if (!p || !afloat(p) || !c.fighting(e)) return null;
      const max = maxOf(e);
      // the dance needs no attack slot: out of your broadside, for her spot behind you
      if (r.sting && r.sting.dance > 0) return stingCourse(e, r, targetFor(e, p), max);
      if (!c.attacking(e)) return null;
      const P = targetFor(e, p);
      if (r.sting) return stingCourse(e, r, P, max);
      if (r.net) return netCourse(e, P, max);
      if (r.witch) return witchCourse(e, P, max);
      if (!P.seen) {
        // lost you in the fog: for your last-seen spot, then round it
        const d = Math.hypot(P.x - e.x, P.z - e.z);
        const to = bearing(e.x, e.z, P.x, P.z);
        if (d > 6) return { h: to, speed: max * FOG.seek };
        return { h: wrapAngle(to + Math.PI / 2), speed: max * FOG.seek * 0.6 };
      }
      return null;
    },
    holdFire(e) {
      if (!isShip(e)) return false;
      if (flag(e, 'summoner')) return true; // (she has no guns)
      const r = recs.get(e);
      return !!(r && on('fog') && !r.fog.seen);
    },
    drift(s) {
      if (!isShip(s) || held) return null;
      return currentAt(s.x, s.z);
    },
    avoid() {
      const out = [];
      for (const r of recs.values()) {
        const A = r.witch && r.witch.act;
        if (A && A.kind === 'summon') for (const q of A.rings) out.push({ x: q.x, z: q.z, r: WITCH.summon.r + 1 });
      }
      if (tideLow()) for (const b of bars) out.push({ x: b.x, z: b.z, r: b.r });
      return out;
    },
    shipMods(s) {
      if (!isShip(s)) return IDENTITY;
      let speedMul = 1;
      let capAdd = 0;
      let turnMul = 1;
      let any = false;
      const r = recs.get(s);
      if (r && r.sting && r.sting.dance > 0) {
        turnMul *= STINGER.dance.turnMul;
        capAdd += STINGER.dance.capAdd;
        any = true;
      }
      if (tideLow() && !flag(s, 'shallow') && barAt(s.x, s.z)) {
        speedMul *= TIDE.speedMul;
        any = true;
      }
      return any ? { speedMul, capAdd, turnMul, spin: 0 } : IDENTITY;
    },
    playerMods() {
      if (!netted) return NO_PLAYER_MODS;
      const taps = c.cutTaps();
      const cut = clamp(Math.max(netted.taps / taps, netted.hold / c.cutHoldTime()), 0, 1);
      return { speedMul: NET.speedMul, turnMul: NET.turnMul, netted: { t: netted.t, max: NET.max, cut } };
    },
    hidden(target, viewer) {
      return hiddenFrom(target, viewer);
    },
    fogAt(x, z) {
      return !!bankAt(x, z);
    },
    cut() {
      if (!netted) return false;
      netted.taps++;
      const p = c.player();
      if (p) c.sfx('click', p.x, p.z);
      if (netted.taps >= c.cutTaps()) {
        release('cut');
        return true;
      }
      return false;
    },
    cutHold(down) {
      holdDown = !!down;
      if (netted && !holdDown) netted.hold = 0;
    },
    objective() {
      return null;
    },
    minimap() {
      const out = [];
      for (const b of banks) out.push({ kind: 'fog', x: b.x, z: b.z, r: FOG.len / 2, h: b.h, len: FOG.len, wid: FOG.wid });
      for (const L of lanes) {
        const mid = pathAt(L.path, L.path.total / 2);
        out.push({ kind: 'current', x: mid.x, z: mid.z, r: L.hw, h: mid.h, points: L.points });
      }
      if (on('tide') && (tide.phase === 'warning' || tide.phase === 'low' || tide.phase === 'fading')) {
        for (const b of bars) out.push({ kind: 'tide', x: b.x, z: b.z, r: b.r, warning: tide.phase === 'warning', low: tide.phase === 'low' });
      }
      return out;
    },
    summary() {
      return [];
    },
    bonus() {
      return 0;
    },
    visuals() {
      const nets = netVisuals();
      const songs = songVisuals();
      const summons = summonVisuals();
      const stingers = stingVisuals();
      const tv = tideVisual();
      if (!banks.length && !lanes.length && !tv && !nets.length && !songs.length && !summons.length && !stingers.length) return NO_VISUALS;
      return { fog: banks.map(bankVisual), currents: lanes.map(laneVisual), tide: tv, nets, songs, summons, stingers };
    },
    get state() {
      const all = c.enemies();
      const index = (e) => all.indexOf(e);
      const rows = (key, fn) => [...recs].filter(([, r]) => r[key]).map(([e, r]) => ({ index: index(e), id: idOf(e), type: typeof prop(e, 'typeName') === 'string' ? e.typeName : null, ...fn(r[key], e, r) }));
      const p = c.player();
      return {
        ids: [...list],
        time: now,
        hazardTime: hz,
        held,
        wave,
        slots: slotsHeld,
        fog: {
          on: on('fog'),
          banks: banks.map(bankVisual),
          playerIn: playerInFog,
          lost: rows('fog', (F) => ({ seen: F.seen, lastX: finite(F.lastX) ? F.lastX : null, lastZ: finite(F.lastZ) ? F.lastZ : null, inFog: F.inFog })).filter((x) => !x.seen),
        },
        currents: { on: on('currents'), lanes: lanes.map(laneVisual), riding: !!(p && currentAt(p.x, p.z)) },
        tide: { on: on('tide'), phase: tide.phase, t: tide.t, T: tide.T, nextLow: tide.phase === 'off' ? null : tide.nextLow, stopped: tide.stopped, bars: bars.length },
        netted: netted ? { by: idOf(netted.by), t: netted.t, max: NET.max, taps: netted.taps, hold: netted.hold } : null,
        lastRelease: finite(lastRelease) ? lastRelease : null,
        stingers: rows('sting', (S, e) => ({ armed: S.armed, dance: S.dance, cool: S.cool, behind: !!(p && afloat(e) && behindYou(e, p)) })),
        netsloops: rows('net', (N) => ({ next: N.next, whirl: N.whirl ? { t: N.whirl.t, T: N.whirl.T } : null })),
        witches: rows('witch', (W) => ({ clock: W.clock, turn: W.turn, act: W.act ? { kind: W.act.kind, phase: W.act.phase || null, t: W.act.t, T: W.act.T } : null, quiet: Math.max(0, W.quietUntil - hz) })),
        counts: { ...counts, released: { ...counts.released } },
      };
    },
    dispose() {
      for (const r of recs.values()) {
        if (r.net) r.net.whirl = null;
        if (r.witch) r.witch.act = null;
      }
      give('dispose', slotsHeld);
      recs.clear();
      fx.clear();
      netted = null;
    },
    // ---- test hooks (G.v4.net / tide, SPEC4 §11.3)
    net() {
      return landNet(null);
    },
    tide(on_) {
      if (!on('tide') || tide.stopped) return null;
      if (on_) {
        tide.nextLow = hz;
        tideOut();
      } else if (tide.phase === 'low' || tide.phase === 'warning') {
        tide.nextLow = hz + TIDE.every;
        tideIn();
      }
      return tideVisual();
    },
  };
  return api;
}
