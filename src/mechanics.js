// Level mechanics hooks (SPEC2 §6.3): 'convoy' (Doubloon Bay), 'floes' (Frostbite Straits) and
// 'current' (The Maelstrom). Pure: imports nothing (Node tests load it as a data: URL).
//
// Stage 0 placeholder: the final API as a null object (no level has a mechanic yet). Stage 1 (1J)
// writes the hooks.
//
// createMechanics(ids, ctx) → {
//   init(), onSpawn(e, waveIndex), onCapture(e), onSink(e), onRemove(e),
//   step(dt), steer(e, dt) → { h, speed } | null, holdFire(e) → boolean, drift(s) → { vx, vz } | null,
//   avoid() → [{ x, z, r }], objective() → string | null,
//   minimap() → [{ kind: 'gate' | 'galleon' | 'floe' | 'vortex' | 'eye', x, z, r }],
//   summary() → string[], bonus() → number, get state, dispose()
// }
// ctx (from main): { env: () => env, player: () => player, enemies, fighting(e), relative(ship, x, z),
//   damage(ship, amount, x, z, source), escape(e), pop(text, x, y, z, style), showBanner(html, s),
//   announce(text), sfx(name, x, z), rng: () => number, time: () => number, def }
export const MECHANIC_IDS = ['convoy', 'floes', 'current'];

export function createMechanics(/* ids, ctx */) {
  const state = {};
  return {
    init() {},
    onSpawn(/* e, waveIndex */) {},
    onCapture(/* e */) {},
    onSink(/* e */) {},
    onRemove(/* e */) {},
    step(/* dt */) {},
    steer(/* e, dt */) {
      return null;
    },
    holdFire(/* e */) {
      return false;
    },
    drift(/* s */) {
      return null;
    },
    avoid() {
      return [];
    },
    objective() {
      return null;
    },
    minimap() {
      return [];
    },
    summary() {
      return [];
    },
    bonus() {
      return 0;
    },
    get state() {
      return state;
    },
    dispose() {},
  };
}
