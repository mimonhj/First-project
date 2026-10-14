// Pop words over the 3D view ("RAKE ×2!", "−3 CREW", "CRIT! MAST DOWN!"): ≤ 12 recycled DOM spans in
// the #pops layer, projected from world positions (0 draw calls). Styles in fx.css. SPEC2 §2.5, §9.1.
//
// Stage 0 placeholder: the final API as a null object (shows nothing). Stage 1 (1K) builds it.
//
// createPops(layerEl, camera, { reducedMotion }) → {
//   pop(text, x, y, z, style),   // style: 'dmg' | 'rake' | 'crit' | 'crew' | 'info' | 'capture' | 'gold' | 'bad'
//   update(dt), clear(), get count
// }
export function createPops(/* layerEl, camera, { reducedMotion } = {} */) {
  return {
    pop(/* text, x, y, z, style */) {},
    update(/* dt */) {},
    clear() {},
    get count() {
      return 0;
    },
  };
}
