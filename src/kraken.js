// The Kraken (SPEC3 §5.7): a pure simulation of the beast that rises on level 9 once the Inkheart falls and
// hunts you (a shadow that follows, tentacles that slam and grab, a big-eyed head), and is driven off in
// three phases. main.js wraps its raised parts as pseudo-targets (§5.8) and krakenView.js draws it.
//
// Pure: imports nothing (the Node tests load it as a data: URL). Simulated time only; rolls with ctx.rng.
// The status times, the ink blob and the cut taps / hold come from ctx.tables (STATUS of specials.js, INK
// of mechanics3.js, RAIDERS of combat.js), never copied here.
//
// createKraken(ctx) → {
//   rise(x, z, { short }), step(dt), targets() → [{ id, kind, x, z, r, y0, y1, hp }], hits(id, x, y, z) → boolean,
//   hit(id, info) → { dmg, word } | null, special(id, ammo) → word | null,
//   cut() → boolean, cutHold(down), playerMods() → { speedMul, turnMul, dps },
//   get bar /* { name, frac, notches } | null */, get phase, get hp, get grabbed, get rising, get done,
//   visuals() → { shadow, head, eye, tentacles: [{ x, z, h, t, state }], rings: [{ x, z, r, t, T, grab }] },
//   get state, dispose()
// }
// ctx: { player() → { x, z, h, speed, wid, len }, damage(amount, x, z, source), land(x, z, r) → boolean,
//        world: { x, z, r }, rng(), warnBonus(), inkSlick(x, z), pop(text, x, y, z, style), announce(text),
//        sfx(name, x, z), tables: { STATUS, INK, RAIDERS } }
//
// STAGE 0 SCAFFOLD: the table with SPEC3's starting values and a Kraken that never rises (no targets, no
// bar). Stage 1C writes the simulation.

/** §5.7.2–5.7.3 (starting values; Stage 1C owns them, Stage 3 tunes them with the bots). */
export const KRAKEN = {
  hp: 600,
  notches: [400, 200],
  pearl: 1000,
  dread: 4,
  rise: 6,
  shortRise: 3,
  sway: 4,
  sink: 0.5,
  maxUp: 4,
  grabRest: 8,
  restGap: 8,
  grab: { dps: 2, max: 4 },
  cutOff: { idle: 12, ahead: 30, landClear: 6, edge: 20 },
  parts: {
    shadow: { r: 9 },
    head: { r: 6, y: 3, mul: 1 },
    eye: { r: 2.5, mul: 1.5 },
    tentacle: { r: 1.4, y0: 0, y1: 9, mul: 1, hp: 30 },
  },
  phases: [
    { from: 600, chase: 8, trigger: 14, count: 2, every: 8, spread: 6, warn: 1.8, slam: 12, grab: false, head: { every: 3, up: 7, off: 20 } },
    { from: 400, chase: 9.5, trigger: 14, count: 3, every: 7, spread: 6, warn: 1.6, slam: 12, grab: true, head: { every: 2, up: 7, off: 20 }, ink: 12 },
    { from: 200, chase: 0, trigger: Infinity, count: 4, every: 6, reach: 40, warn: 1.5, slam: 12, grab: true, head: { always: true, off: 25, glow: [4, 8] }, pull: { speed: 2, reach: 50 } },
  ],
  ring: 4,
  specials: { chase: 0.5, warn: 0.5, sneeze: true },
};

const NO_MODS = Object.freeze({ speedMul: 1, turnMul: 1, dps: 0 });
const NO_VISUALS = Object.freeze({ shadow: null, head: null, eye: null, tentacles: Object.freeze([]), rings: Object.freeze([]) });

export function createKraken(ctx) {
  let disposed = false;
  return {
    rise() {
      return false;
    },
    step() {},
    targets() {
      return [];
    },
    hits() {
      return false;
    },
    hit() {
      return null;
    },
    special() {
      return null;
    },
    cut() {
      return false;
    },
    cutHold() {},
    playerMods() {
      return NO_MODS;
    },
    get bar() {
      return null;
    },
    get phase() {
      return 0;
    },
    get hp() {
      return KRAKEN.hp;
    },
    get grabbed() {
      return false;
    },
    get rising() {
      return false;
    },
    get done() {
      return false;
    },
    visuals() {
      return NO_VISUALS;
    },
    get state() {
      return { phase: 0, hp: KRAKEN.hp, risen: false, grabbed: false, done: false, disposed };
    },
    dispose() {
      disposed = true;
    },
  };
}
