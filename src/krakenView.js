// The Kraken's model (SPEC3 §5.7.2): one rigidly skinned body (a plum mantle with pink spots, barnacles and
// an old figurehead on its crown, two big amber eyes under cross brows), up to four tapered tentacles with
// suckers, glowing eyes (noOutline) and a shadow decal: ≤ 30 draw calls. It draws what kraken.js's
// visuals() say, and holds the rise camera.
//
// createKrakenView(scene, { reducedMotion, foamColor }) → {
//   prepare() → boolean (builds one mesh per call, true when ready), get ready,
//   update(visuals, t, dt), riseCamera(k) → { pos, look } | null, dispose()
// }
//
// STAGE 0 SCAFFOLD: nothing to build or draw. Stage 1I builds the model.

export function createKrakenView(scene, opts = {}) {
  return {
    prepare() {
      return true;
    },
    get ready() {
      return true;
    },
    update() {},
    riseCamera() {
      return null;
    },
    dispose() {},
  };
}
