// The finale of Voyage IV (SPEC4 §3.6): the Shellback, the crab-shaped island in Shellback Shoals that wakes up once
// level 12's last wave falls. Three phases (the Fort, the Waking, the Charge), a soft body that pushes and never
// blocks, at most two attacks telegraphed at once (ctx.warn.boss); driven off, it scuttles off to sleep and the
// Golden Conch bobs up. Not a ship: a part in main's pseudo-target registry (§3.7), as the Kraken is.
//
// Pure: imports nothing (the Node tests load it as a data: URL); the shape of kraken.js.
//
// createShellback(ctx) -> { wake(x, z, { short }), step(dt), targets(), hits(id, x, y, z), hit(id, info) ->
//   { dmg, word } | null, special(id, ammo) -> word | null, boardWhy() -> 'monster', push(ship) -> { vx, vz } | null,
//   playerMods() -> { speedMul, turnMul }, get bar ({ name, frac, notches }), get phase, get hp, get rising,
//   get done, visuals() -> { body, eyes, claws, towers, rings, sectors, lanes, lines }, get state, dispose() }
// ctx: as kraken.js's (player, damage, land, world, rng, warnBonus, pop, announce, sfx) + { arena: { x, z, r }, lair,
//   warn, ships(), hold(), tables: { STATUS, FORT } }
//
// STAGE 0 SCAFFOLD: the final API (SPEC4 §11.1) as a null object: it never wakes. Stage 1 (1C) writes it.

function freeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v);
  return Object.freeze(o);
}

// §3.6.2 (+ hp, notches, towers, claws, body r, push, standoff, dread/rise times, cutOff, chargeGap, conch, words):
// Stage 1 fills it; the conch is §2.2's +1,200.
export const SHELLBACK = freeze({ hp: 3000, notches: [2000, 1000], conch: 1200 });

const NO_MODS = freeze({ speedMul: 1, turnMul: 1 });
const NO_VISUALS = freeze({ body: null, eyes: [], claws: [], towers: [], rings: [], sectors: [], lanes: [], lines: [] });

export function createShellback(ctx) {
  const noop = () => {};
  return {
    wake: () => false,
    step: noop,
    targets: () => [],
    hits: () => false,
    hit: () => null,
    special: () => null,
    boardWhy: () => 'monster',
    push: () => null,
    playerMods: () => NO_MODS,
    get bar() {
      return null;
    },
    get phase() {
      return 0;
    },
    get hp() {
      return SHELLBACK.hp;
    },
    get rising() {
      return false;
    },
    get done() {
      return false;
    },
    visuals: () => NO_VISUALS,
    get state() {
      return { phase: 0, hp: SHELLBACK.hp, awake: false };
    },
    dispose: noop,
  };
}
