// The dock's other views (SPEC2 §7): walking round Sparrow's Floating Island ('town'), Polly's Plumes &
// Trims ('tailor') and The Salty Sparrow ('tavern'), plus the Harbour menu and the All aboard? dialog.
// DOM and glue live here (styles in town.css); persistence stays in main.js. The shipyard panel
// itself ('shop') stays main.js's.
//
// Stage 0 placeholder: the final API as a null object (the dock only ever shows the shipyard).
// Stage 2 (2C) builds it; Stage 3 (3A) wires it into main.js.
//
// createTownMode(ctx) → {
//   get view ('shop' | 'town' | 'tailor' | 'tavern'), get active,
//   ashore(), showShop(), open(placeId), back(), close(),
//   onKey(e, down) → handled, onPointer(type, e) → handled,
//   update(dt, t) → handlesCamera, onResize(), onContextRestored(),
//   api   // test hooks used by __game.town / __game.wardrobe
// }
// ctx: { scene, camera, canvas, env: () => env, ui: { townScreen, wardrobeScreen, tavernScreen,
//   harbourDialog, aboardDialog, dockScreen, ashoreBtn }, look: { get(), set(look) }, feats: () => feats,
//   wardrobe: { wear(id), buy(id) }, purse: () => state.purse, armory: { config(), buy(id) },
//   hullPaint: () => look, exits: () => [{ action, label }], leaveDock(action), showShipyard(),
//   hideShipyard(), setLens(), openModal, closeModal, activeModal, announce(text), audio, isTouch(),
//   reducedMotion(), rumour(), log() }
export function createTownMode(/* ctx */) {
  return {
    get view() {
      return 'shop';
    },
    get active() {
      return false;
    },
    ashore() {
      return false;
    },
    showShop() {},
    open(/* placeId */) {
      return false;
    },
    back() {
      return false;
    },
    close() {},
    onKey(/* e, down */) {
      return false;
    },
    onPointer(/* type, e */) {
      return false;
    },
    update(/* dt, t */) {
      return false;
    },
    onResize() {},
    onContextRestored() {},
    api: {},
  };
}
