// Sailors tumbling overboard and struck crews with their hands up: a pool of 5 people (people.js,
// share: true, scene children placed from the ship transform each frame), hidden when idle.
// SPEC2 §2.4, §9.1.
//
// Stage 0 placeholder: the final API as a null object (shows nothing). Stage 1 (1K) builds it.
//
// createOverboard(scene, { foam, sfx }) → {
//   prepare(optsList), throwOver(ship, side, opts), showSurrender(ship, opts), clearSurrender(ship),
//   update(t, dt), clear(), dispose()
// }
export function createOverboard(/* scene, { foam, sfx } = {} */) {
  return {
    prepare(/* optsList */) {},
    throwOver(/* ship, side, opts */) {},
    showSurrender(/* ship, opts */) {},
    clearSurrender(/* ship */) {},
    update(/* t, dt */) {},
    clear() {},
    dispose() {},
  };
}
