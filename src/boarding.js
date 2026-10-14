// Boarding set-pieces (SPEC2 §3.4–3.6): grapple → reel → swing → brawl → result, raiders boarding
// you (threat → reel → swing → brawl → result), counter-boarding and taking a surrendered ship.
// The final module imports three, ./people.js and ./combat.js; simulation runs in step(dt) (simulated
// time), visuals in render(t, dt).
//
// Stage 0 placeholder: the final API as a null object (a boarding never starts). Stage 2 (2B)
// builds it. It imports nothing yet: combat.js does not exist until Stage 1.
//
// createBoarding(ctx) → {
//   prepare({ captain, crew: [opts ×4], raiders: [opts ×4] | null }),
//   start({ kind: 'attack' | 'defend' | 'surrender' | 'counter', enemy, side, reel, getSides }) → boolean,
//   step(dt), render(t, dt), camera() → { pos, look, blend } | null,
//   heave() → number,   // a heave press during 'reel': returns the new heave bonus
//   cut() → boolean, cutHold(down), skip(), cancel(reason),
//   onResolve(fn), onResult(fn), onPip(fn), onCut(fn), onEnd(fn),
//   get active, get phase, get kind, get target, get truce, get locked, get heaveBonus, get last,
//   get counterUntil, dispose()
// }
// (SPEC2 §9.1 also names a getter "heave", which can't share its name with the heave() method: the
// current heave bonus is read as `heaveBonus`. __game.boarding still offers `heave` and `heavePress()`.)
// ctx: { scene, player: () => player, sfx(name, x, z), particles: { puff, foam, spawnParticle },
//        reducedMotion(), hideHelm(on), enemyCrewOpts(typeName, seed), pops }
export function createBoarding(/* ctx */) {
  return {
    prepare(/* { captain, crew, raiders } */) {},
    start(/* { kind, enemy, side, reel, getSides } */) {
      return false;
    },
    step(/* dt */) {},
    render(/* t, dt */) {},
    camera() {
      return null;
    },
    heave() {
      return 0;
    },
    cut() {
      return false;
    },
    cutHold(/* down */) {},
    skip() {},
    cancel(/* reason */) {},
    onResolve(/* fn */) {},
    onResult(/* fn */) {},
    onPip(/* fn */) {},
    onCut(/* fn */) {},
    onEnd(/* fn */) {},
    get active() {
      return false;
    },
    get phase() {
      return null;
    },
    get kind() {
      return null;
    },
    get target() {
      return null;
    },
    get truce() {
      return false;
    },
    get locked() {
      return false;
    },
    get heaveBonus() {
      return 0;
    },
    get last() {
      return null;
    },
    get counterUntil() {
      return -Infinity;
    },
    dispose() {},
  };
}
