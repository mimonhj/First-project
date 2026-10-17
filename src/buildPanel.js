// Builder Bess's panel (SPEC3 §8.3) in #build-screen: the Homes and Amenities tabs, a row per plot with its
// tier pips, "Now" and "Next", and one Build button. Non-modal like the tavern; styles in town.css.
// townMode.js creates it for its view 'build' (opened by the place `builder`).
//
// createBuildPanel({ root, ctx }) → { open(), close(), onKey(e, down) → handled, refresh(), get active, api }
//
// STAGE 0 SCAFFOLD: a panel that never opens. Stage 1O builds it.

export function createBuildPanel({ root = null, ctx = null } = {}) {
  return {
    open() {
      return false;
    },
    close() {},
    onKey() {
      return false;
    },
    refresh() {},
    get active() {
      return false;
    },
    api: {},
  };
}
