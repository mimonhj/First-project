// Floating name tags above enemy ships: name, hull bar with a lagging "ghost" segment, a row of 10
// crew pips with the surrender notch (all pips of all tags in ONE InstancedMesh) and a status icon.
// SPEC2 §5.4 and §9.1. Replaces main.js's buildTag/setTag in Stage 2.
//
// Stage 0 placeholder: the final API as a null object (draws nothing). Stage 1 (1K) builds it.
//
// createTags(scene) → {
//   add(ship) → tag, remove(ship),
//   update(ships, camera, t, dt),   // per frame: billboard, scale, hull fill + ghost, pips + notch, icon
//   dispose()
// }
// Reads per ship: hp, maxHp, crewShown, crew0, strikeAt, tagIcon ('capture' | 'fight' | 'risky' |
// 'white' | 'hot' | null), tagPulse, flash, and the fighting/surrendered/captured/sinking flags.
export function createTags(/* scene */) {
  return {
    add(/* ship */) {
      return null;
    },
    remove(/* ship */) {},
    update(/* ships, camera, t, dt */) {},
    dispose() {},
  };
}
