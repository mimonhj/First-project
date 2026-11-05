// The models and warning shapes of Voyage IV's pseudo foes (SPEC4 §3.1, §11.1): the jollyboat packs and their
// coconuts, the puffers and their spikes, Old Coilback (one 8-segment rigidly skinned SkinnedMesh), the Rock Forts,
// and every new telegraph shape (coconut rings, spiky rings, the net fan, the lunge lane, the sight line, the
// Witch's summon rings and notes): one InstancedMesh per shape kind, noOutline, so all shapes cost <= 6 calls;
// <= 30 calls in the busiest mix (§14). Draws what foes4.js's and mechanics4.js's visuals() show.
//
// createFoesView(scene, { reducedMotion }) -> { prepare() -> boolean (one mesh a call; true when all are built),
//   get ready, update(visuals, t, dt), warmables() (the hidden objects main's warmDraw() draws once), dispose() }
//
// STAGE 0 SCAFFOLD: the final API as a null object: nothing is built or drawn. Stage 1 (1I) builds the view.

export function createFoesView(scene, opts = {}) {
  return {
    prepare: () => true,
    get ready() {
      return true;
    },
    update() {},
    warmables: () => [],
    dispose() {},
  };
}
