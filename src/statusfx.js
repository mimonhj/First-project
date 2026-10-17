// What a status looks like on a ship (SPEC3 §2.7): flames licking up from her newest holes, an icicle fringe
// and ice plates, a puffy lime stink cloud with wavy stink lines and buzzing flies. Six InstancedMeshes with
// noOutline (≤ 6 draw calls, ≤ 8 with headroom), reading `ship.status` and `ship.mesh.userData.statusAnchors`.
//
// createStatusFx(scene, { reducedMotion }) → { sync(ships, t, dt), clear(ship), dispose() }
//
// STAGE 0 SCAFFOLD: draws nothing (no ship has a status yet). Stage 1I builds the effects.

export function createStatusFx(scene, opts = {}) {
  return {
    sync() {},
    clear() {},
    dispose() {},
  };
}
