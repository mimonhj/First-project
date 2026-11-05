// The Island map (SPEC4 §8.5): a non-modal overlay (#island-map, opened with I or the Harbour menu's Island map
// button) with a parchment map of Sparrow's Floating Island drawn from the walk data and islandPlan's districts, a
// "You are here" pin, and a district-grouped list of >= 44 px buttons: each district, each plot and each islander
// there; a pick offers Walk there or Hop there (a plot or a district) or opens a chat (an islander). Keyboard and
// screen-reader users reach every district, plot and chat without walking.
//
// createIslandMap({ root, ctx }) -> { open(), close(), onKey(e, down) -> handled, refresh(), get active }
// ctx: { plan, walk, captain(), islanders(), plots(), walkTo(id), hop(id), talk(id) }
//
// STAGE 0 SCAFFOLD: the final API as a null object: it never opens. Stage 1 (1R) builds the map.

export function createIslandMap({ root = null, ctx = null } = {}) {
  return {
    open() {},
    close() {},
    onKey: () => false,
    refresh() {},
    get active() {
      return false;
    },
  };
}
