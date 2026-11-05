// Voyage IV's pseudo foes (SPEC4 §3.1): the Monkey Jollyboats (a pack of five that lobs coconuts), Puffer Mines (sea
// creatures that drift at you and pop), Old Coilback the Sea Serpent (dives, then lunges down a lane) and the Rock
// Forts (stationary guns that sight you with a red line). None of them is a ship: they are parts in main's
// pseudo-target registry (§3.7), as the Kraken is.
//
// Pure: imports nothing (the Node tests load it as a data: URL). The numbers live in JOLLY, PUFFER, COILBACK, FORT.
//
// createFoes4(ctx) -> { spawn(kind, x, z, opts) -> id, step(dt), slots() -> n, alive(kind) -> n, sendHome(owner),
//   targets() -> [{ id, kind, x, z, r, y0, y1, hp, maxHp, name, hidden }], hits(id, x, y, z), hit(id, info) ->
//   { dmg, word } | null, special(id, ammo) -> word | null, boardWhy(id) -> 'small' | 'monster' | 'fort',
//   tags() -> [{ id, name, x, y, z, frac, count, under, isNew }],
//   visuals() -> { packs, coconuts, puffers, coilback, forts, rings, lanes, lines }, get state, dispose() }
// ctx: { player(), ships(), damage(target, amount, x, z, source), land(x, z, r), world: { x, z, r }, rng(), warnBonus(),
//   warn, pop(text, x, y, z, style), announce(text), sfx(name, x, z), coins(x, z, n), gold(n, why), drift(x, z),
//   isNew(kind), hold(), tables: { STATUS, WORDS4 } }
//
// STAGE 0 SCAFFOLD: the final API (SPEC4 §11.1) as a null object: nothing spawns, nothing is alive, nothing is hit.
// Stage 1 (1C) writes the foes.

function freeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v);
  return Object.freeze(o);
}

export const JOLLY = freeze({});
export const PUFFER = freeze({});
export const COILBACK = freeze({});
export const FORT = freeze({});
// What a pseudo kind is called (main's foeName(); the banners and the meet cards).
export const FOE_NAMES = freeze({
  jolly: 'Monkey Jollyboats',
  puffer: 'Puffer Mines',
  coilback: 'Old Coilback',
  fort: 'Rock Fort',
  shellback: 'The Shellback',
});

const NO_VISUALS = freeze({ packs: [], coconuts: [], puffers: [], coilback: null, forts: [], rings: [], lanes: [], lines: [] });

export function createFoes4(ctx) {
  const noop = () => {};
  return {
    spawn: () => null,
    step: noop,
    slots: () => 0,
    alive: () => 0,
    sendHome: noop,
    targets: () => [],
    hits: () => false,
    hit: () => null,
    special: () => null,
    boardWhy: () => 'monster',
    tags: () => [],
    visuals: () => NO_VISUALS,
    get state() {
      return { foes: [] };
    },
    dispose: noop,
  };
}
