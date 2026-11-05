// The eleven new buildings' art (SPEC4 §4.1, §4.3): tiers 1-3 of the Treehouse, the Houseboat Moorings, the Hilltop
// Villa, the Blacksmith's Forge, the Fishing Hut, the Goat Farm, the Music Hall, the Trophy Museum, the
// Observatory, the Aquarium and the Mermaid Grotto (and tier 0 for the islet plots: a sand outline and the "Build
// me!" board), each built in its plot's frame within its pad (islandPlan's PADS) from the town's own parts and
// colours (sparrow's frozen `kit`), each from a stream of its own per (plot, tier), so a building always looks the
// same whenever it is built. sparrow bakes them into the development layer's second half.
//
// kit(id, tier, kitHelpers) -> Group, info(id, tier) -> { footprint, eave, top, door, porch }
//
// STAGE 0 SCAFFOLD: the final API: an empty group for every plot and tier, and no info. Stage 1 (1O) builds them.

export function kit(id, tier, kitHelpers) {
  const g = kitHelpers && kitHelpers.THREE ? new kitHelpers.THREE.Group() : null;
  if (g) g.name = `plot4:${id}:${tier}`;
  return g;
}

export function info(id, tier) {
  return { footprint: null, eave: 0, top: 0, door: null, porch: null };
}
