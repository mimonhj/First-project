// The islanders of Sparrow's Floating Island (SPEC4 §7): 33 named islanders of many trades and ages, the animals,
// their routines over an "ashore day" of 120 s (a pure function of the town clock and of islandPlan's layout), their
// lines (which teach Voyage IV's counters, with touch wording for a line that names a key), and the crowd director's
// pick of who is drawn: one hard cap, PEOPLE_DRAWN, on every full-detail person in the town walk view.
//
// Pure: imports nothing (the Node tests load it as a data: URL). Station and path coordinates live only in
// islandPlan.js, passed in as `layout` ({ ISLANDER_PATHS, PLOT_PLACES, DECKS }).
//
// ISLANDERS (<= 40), ROUTINES, ANIMALS, LINES, PEOPLE_DRAWN, TALK, CULL4;
// roster(island, island4, progress, layout) -> { people, animals }, routinePose(id, t, layout) -> { x, z, h, action,
// moving }, linesFor(id, progress, touch) -> string[], plan(viewer, people, prev, t) -> Set<id>
//
// STAGE 0 SCAFFOLD: the final API with Stage 0's measured cap and nobody in it: no islander, no animal, no line, and
// plan() draws nobody. Stage 1 (1D) writes the data and the director.

export const ISLANDERS = Object.freeze([]);
export const ROUTINES = Object.freeze({});
export const ANIMALS = Object.freeze({});
export const LINES = Object.freeze({});
// §7.2: P0 + 2, where P0 = 39 is the people drawn today in the town walk view's worst view (the 401-call view at
// eedb108: 30 townsfolk, 7 villagers, Bess and Barnacle; Stage 0, docs/sunset-isles/stage0-report.md).
export const PEOPLE_DRAWN = 41;
// §7.4: talk within 1.6 u, facing within ±60°, 2-3 lines, walking 3 u away ends it.
export const TALK = Object.freeze({ reach: 1.6, face: 60, lines: 3, end: 3 });
// §7.2: the walk view's townsfolk cull under v4 (today's 40 u tightens to 34 u).
export const CULL4 = 34;

/** Who lives on the island now (by the buildings standing), and the animals out. Stage 0: nobody. */
export function roster(island, island4, progress, layout) {
  return { people: [], animals: [] };
}

/** Where islander `id` is at town time t, and what they do. Stage 0: unknown (null). */
export function routinePose(id, t, layout) {
  return null;
}

/** What islander `id` says (progress: the level reached, the buildings, the feats; touch: a touch screen). */
export function linesFor(id, progress, touch) {
  return [];
}

/** The crowd director (§7.2): who is drawn this step, never more than PEOPLE_DRAWN. Stage 0: nobody. */
export function plan(viewer, people, prev, t) {
  return new Set();
}
