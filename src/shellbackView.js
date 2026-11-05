// The Shellback's model (SPEC4 §3.6, §11.1): the crab island's body (one rigidly skinned SkinnedMesh, legs and
// claws on its bones, <= 3 material groups), the fort and its three towers on its back (merged, breakable in three
// pieces), the stalked eyes (noOutline) and a shadow; <= 40 calls (and <= 1.3 x a Man-o'-War's, whichever is
// lower). Draws what shellback.js's visuals() show; riseCamera(k) is the wake's camera pose.
//
// createShellbackView(scene, opts) -> { prepare() -> boolean (one mesh a call), get ready, update(visuals, t, dt),
//   riseCamera(k) -> { pos, look } | null, warmables(), dispose() }
//
// STAGE 0 SCAFFOLD: the final API as a null object: nothing is built or drawn. Stage 1 (1I) builds the model.

export function createShellbackView(scene, opts = {}) {
  return {
    prepare: () => true,
    get ready() {
      return true;
    },
    update() {},
    riseCamera: () => null,
    warmables: () => [],
    dispose() {},
  };
}
