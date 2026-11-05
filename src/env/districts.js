// The island's six districts' art (SPEC4 §6): the seventeen platform decks and their porches, the sixteen
// boardwalks, the five new rope bridges, Sunset Beach, Lookout Hill and Fisher's Pier, the signposts, the named
// arches and the High Walk's lanterns, built from islandPlan.js's data with the town's own art helpers (sparrow's
// frozen `kit`) and one random stream of its own (mulberry32(0x5EA4), kit.stream), so the town's rand() draws
// never change. sparrow.js bakes `statics` into the town's meshes (with v4 only).
//
// buildDistricts(kit, plan) -> { statics: Group (baked by sparrow into the town's meshes), anim: { lanterns },
//   signs: [painted boards], dispose() }
//
// STAGE 0 SCAFFOLD: the final API: an empty statics group, nothing animated, no signs, and no draw from any stream.
// Stage 1 (1N) builds the districts.

export function buildDistricts(kit, plan) {
  const statics = kit && kit.THREE ? new kit.THREE.Group() : null;
  if (statics) statics.name = 'sparrow-districts';
  return {
    statics,
    anim: { lanterns: null },
    signs: [],
    dispose() {},
  };
}
