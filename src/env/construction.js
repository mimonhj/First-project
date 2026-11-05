// The construction scene (SPEC4 §5.3): for every build and upgrade on all 21 plots, in place of SPEC3's montage.
// The plot's half of the development layer rebakes without it; the old and new tiers are drawn as temporary meshes
// from their baked chunks; the new tier is revealed by a rising clipping plane on per-scene clones of the
// development materials (the outline pass copies it, so no ink outline of an unbuilt wall ever shows), over a pale
// blue blueprint ghost; the frame posts, the plank band and sawdust, the scaffold, the builders' cart, Dab's paint
// wipe, and the people moving in. The timeline is buildScene.js's.
//
// createConstruction(ctx) -> { start(plot, from, to, { kind, reduced }), step(dt), skip(), get running, get stage,
//   get t, warm(), dispose() }
// ctx: { scene, renderer, chunks(plot, tier), devMaterials, pad, porch, door, walkPoint, builders, islanders, pose,
//   sfx }
//
// STAGE 0 SCAFFOLD: the final API as a null object: no scene ever starts. Stage 1 (1P) builds it.

export function createConstruction(ctx = {}) {
  return {
    start: () => false,
    step() {},
    skip() {},
    get running() {
      return false;
    },
    get stage() {
      return null;
    },
    get t() {
      return 0;
    },
    warm() {},
    dispose() {},
  };
}
