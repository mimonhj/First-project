// The Riddle Bell's panel (SPEC3 §7.3) in #quiz-screen: the map of nine islands, a question with its 3–4
// answers (keys 1–4), the lifebuoy, the answer with its fun fact, the results. Non-modal like the tavern;
// styles in town.css. townMode.js creates it for its view 'quiz'.
//
// createQuizPanel({ root, ctx }) → { open(), close(), onKey(e, down) → handled, refresh(), get active, api }
//
// STAGE 0 SCAFFOLD: a panel that never opens. Stage 1O builds it.

export function createQuizPanel({ root = null, ctx = null } = {}) {
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
