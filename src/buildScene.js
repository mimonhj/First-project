// The construction scene's timeline (SPEC4 §5.2): for every build and upgrade on the island's 21 plots, the
// builders push their cart in and the house goes up in stages (foundation or scaffold, frame, walls, roof, finishing
// touches) and its people move in. 9.4 s for a new building, 7.0 s for an upgrade, 5.0 s under reduced motion (four
// stills and three crossfades: derived from `still` and `fade`, never a number of its own); skippable.
//
// Pure: imports nothing (the Node tests load it as a data: URL).
//
// STAGES (ids builders, foundation / scaffold, frame, walls, roof, finish, movingIn), SCENE,
// sceneLength(kind, reduced) -> s, stageAt(t, kind, reduced) -> { stage, index, k, caption, pips, done },
// cueAt(t0, t1, kind, reduced) -> [{ at, sfx | event }] (each cue fired exactly once however the frames fall)
//
// STAGE 0 SCAFFOLD: the final API with the stage ids and SCENE's numbers; stageAt() always answers the first stage
// and cueAt() fires nothing. Stage 1 (1D) writes the timeline.

export const STAGES = Object.freeze(['builders', 'foundation', 'scaffold', 'frame', 'walls', 'roof', 'finish', 'movingIn']);

const still = 1.1;
const fade = 0.2;
export const SCENE = Object.freeze({ new: 9.4, upgrade: 7.0, skip: 0.3, still, fade, orbit: 10, reduced: 4 * still + 3 * fade });

/** How long a scene lasts: 'new' 9.4 s, 'upgrade' 7.0 s, reduced motion 5.0 s. */
export function sceneLength(kind, reduced) {
  if (reduced) return SCENE.reduced;
  return kind === 'upgrade' ? SCENE.upgrade : SCENE.new;
}

/** The stage at scene time t. Stage 0: the first stage, never done. */
export function stageAt(t, kind, reduced) {
  return { stage: STAGES[0], index: 0, k: 0, caption: '', pips: 0, done: false };
}

/** The sounds and events between scene times t0 (excluded) and t1 (included). Stage 0: none. */
export function cueAt(t0, t1, kind, reduced) {
  return [];
}
