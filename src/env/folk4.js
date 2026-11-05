// The islanders, drawn (SPEC4 §7): the 33 named islanders of islanders.js (and the three builders), built one per
// frame from dock open (share: true, detail: 'low'), walking their routines along islandPlan's paths; every one that
// walks is a walker()-shaped entry in sparrow's folk(), so LOOK-2's waiting (the kit's inTheWay) and the captain's
// squeeze-past cover them; the crowd director decides who is drawn (`drawn`).
//
// createFolk4(kit, { people, walk }) -> { set(roster), prepare() -> boolean (one person a call), update(t, dt,
//   captain, drawn), walkers() (folk() entries), talkTarget(captain) -> id | null, face(id, captain), dispose() }
//
// STAGE 0 SCAFFOLD: the final API as a null object: nobody is built, drawn or walking. Stage 1 (1Q) builds them.

export function createFolk4(kit, opts = {}) {
  return {
    set() {},
    prepare: () => true,
    update() {},
    walkers: () => [],
    talkTarget: () => null,
    face() {},
    dispose() {},
  };
}
