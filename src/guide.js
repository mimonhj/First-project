// The tavern's Sea Guide (SPEC4 §8.7): one card per foe kind of the whole game (the 16 enemy ship types, the Kraken,
// Voyage IV's seven kinds and the Shellback), each with its icon, its name, "What it does" and "How to beat it" in
// one line each; unmet Voyage IV kinds show a "?" silhouette with "Not met yet".
//
// Pure: imports nothing (the Node tests load it as a data: URL).
//
// GUIDE: [{ id, name, icon, does, beat, from }], guideFor(met, unlocked) -> [{ ...card, seen }]
//
// STAGE 0 SCAFFOLD: the final API with no cards. Stage 1 (1D) writes the guide.

export const GUIDE = Object.freeze([]);

/** The cards to show for this save (met: voyage4.met's bits, unlocked: the levels open). Stage 0: none. */
export function guideFor(met, unlocked) {
  return [];
}
