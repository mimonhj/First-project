import * as THREE from 'three';
import { noOutline } from './style.js';

// Floating name tags above enemy ships (SPEC2 §5.4, §9.1): the ship's name, a hull bar whose pale
// "ghost" segment lingers 0.45 s after each hit (so you see how big the hit was), a row of 10 crew
// pips with the gold surrender notch, and a status icon (boarding odds, white flag, too hot).
//
//   [  PRIVATEER BRIG  ]
//   [████████▒▒▒░░░░░░░]  (icon)    hull: red fill over the ghost over the ink background
//   [▮▮▮▮▮▮▮░│░░       ]            crew: cream = aboard, dark = lost, the last one partly filled
//
// Draw calls: per tag the background, the ghost (only while it lags behind the fill), the fill and the
// name sprite (4), plus the icon sprite when one shows. Every pip and notch of every tag is ONE
// InstancedMesh, rewritten each frame from the tags' world matrices: 1 draw call for the whole fleet.
// Everything is flat and unlit (MeshBasicMaterial / sprites, noOutline): the outline pass skips it.
//
// createTags(scene) → {
//   add(ship) → tag | null (bosses get no tag: they have the DOM boss bar), remove(ship),
//   update(ships, camera, t, dt),   // per frame: billboard, scale, hull fill + ghost, pips + notch, icon
//   read(ship) → { visible, hull, ghost, pips, notch, icon } | null   // test hook: pips/notch read back
//                                    from the pip InstancedMesh (colours and matrices), in pip units
//   get count, get pips /* the InstancedMesh */, dispose()
// }
// Reads per ship: hp, maxHp, crewShown (may be fractional during a brawl), crew0, strikeAt, tagIcon
// ('capture' | 'fight' | 'risky' | 'white' | 'hot' | 'cooldown' | null; 'cooldown' draws the hook
// greyed with a recharge ring from tagCool, the fraction of the cooldown still to go), tagPulse (the
// hull bar throbs: "wrecked"), flash (a hit swells the tag), and the sinking / captured / escaped flags.
// A tag shows for fighting and surrendered ships; it hides when its ship sinks, is captured or escapes,
// or when it is within 10 units of the camera. Fields a ship doesn't have yet fall back gracefully
// (crew0 → type.crew, crewShown → crew0, strikeAt → floor(0.2 × crew0)).

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// Layout in tag units (a tag is about 4.4 × 2.7 at scale 1; scale = clamp(distance / 30, 0.6, 2.6)).
const BAR_W = 4; // hull bar and pip row width
const BAR_H = 0.4;
const BG_W = 4.4;
const BG_TOP = 0.375;
const PIPS = 10;
const PIP_GAP = 0.07;
const PIP_W = (BAR_W - PIP_GAP * (PIPS - 1)) / PIPS;
const PIP_H = 0.28;
const PIP_Y = -BAR_H / 2 - 0.11 - PIP_H / 2; // pip row centre
const BG_BOTTOM = PIP_Y - PIP_H / 2 - 0.17;
const BG_H = BG_TOP - BG_BOTTOM;
const BG_Y = (BG_TOP + BG_BOTTOM) / 2;
const NOTCH_W = 0.09;
const NOTCH_H = PIP_H + 0.24;
const NOTCH_INK_W = 0.24; // dark backing so the gold line reads across a cream pip
const NOTCH_INK_H = PIP_H + 0.06;
const ICON = 1.45;
const ICON_X = BG_W / 2 + 0.14 + ICON / 2;
const LABEL_Y = 1.3;
// The crew row hangs below the bar: lift the whole tag so its bottom edge stays where the old one-row
// tag's was (the masthead flag, white or yours, stays in view below it).
const LIFT = -0.375 - BG_BOTTOM;
const Z_GHOST = 0.012;
const Z_FILL = 0.024;
const Z_PIP = 0.012;
const Z_PART = 0.024;
const Z_NOTCH_INK = 0.03;
const Z_NOTCH = 0.036;
// Instances per tag: 10 pips, the partly filled overlay, the notch's dark backing and the gold notch.
const PER_TAG = PIPS + 3;
const I_PART = PIPS;
const I_NOTCH_INK = PIPS + 1;
const I_NOTCH = PIPS + 2;

const INK = 0x1d1330;
const RED = 0xe63946;
const PULSE = 0xffa24a; // a wrecked ship's hull bar throbs toward this
const GHOST = 0xfff3c4; // the HUD's ghost colour
const PIP_FULL = 0xfff4d6;
const PIP_EMPTY = 0x4a3b5c;
const NOTCH = 0xffc93c;
const GHOST_HOLD = 0.45; // seconds the ghost waits after a hit before it slides down
const GHOST_RATE = 4; // then closes the gap at this rate (1/s), like the HUD's hull bar

// Icon atlas: 4 × 4 cells of 128 px. Cells 0-4 are the states, 5-12 the cooldown ring in 8 steps.
const CELL = 128;
const ATLAS_N = 4;
const ICONS = { capture: 0, fight: 1, risky: 2, white: 3, hot: 4 };
const COOL_FIRST = 5;
const COOL_STEPS = 8;

// ---------------------------------------------------------------------------
// Icon art (canvas paths only, so it never waits for a web font)
// ---------------------------------------------------------------------------
const INK_CSS = '#1d1330';
const PAPER_CSS = '#fff4d6';
function disc(g, r, fill, ink = 9) {
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = ink;
  g.strokeStyle = INK_CSS;
  g.stroke();
}
// Outline-then-fill a stroked path: a fat ink stroke under a thinner coloured one.
function inked(g, path, color, width, ink = 7) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  path();
  g.strokeStyle = INK_CSS;
  g.lineWidth = width + ink * 2;
  g.stroke();
  path();
  g.strokeStyle = color;
  g.lineWidth = width;
  g.stroke();
}
// Grappling hook: ring, shank and three curled prongs (the third points at the viewer).
function hook(g, color, s = 1, ink = 6) {
  g.save();
  g.scale(s, s);
  const body = () => {
    g.beginPath();
    g.moveTo(0, -20);
    g.lineTo(0, 22);
    g.moveTo(-24, 6);
    g.quadraticCurveTo(-24, 26, 0, 26);
    g.quadraticCurveTo(24, 26, 24, 6);
    g.moveTo(-9, 18);
    g.lineTo(-29, 0);
    g.moveTo(9, 18);
    g.lineTo(29, 0);
  };
  inked(g, body, color, 8, ink);
  const ring = () => {
    g.beginPath();
    g.arc(0, -27, 8, 0, Math.PI * 2);
  };
  inked(g, ring, color, 6, ink);
  g.restore();
}
function tick(g, color) {
  inked(g, () => {
    g.beginPath();
    g.moveTo(-15, 1);
    g.lineTo(-4, 12);
    g.lineTo(17, -12);
  }, color, 10, 6);
}
function bang(g, color) {
  inked(g, () => {
    g.beginPath();
    g.moveTo(0, -16);
    g.lineTo(0, 4);
  }, color, 11, 6);
  g.beginPath();
  g.arc(0, 16, 9.5, 0, Math.PI * 2);
  g.fillStyle = INK_CSS;
  g.fill();
  g.beginPath();
  g.arc(0, 16, 4.5, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
}
function cutlasses(g, color) {
  // two sabres crossed: curved blade, crossguard, grip and pommel; the ink pass of both first so
  // the second sabre's outline doesn't cut through the first one's colour
  const sabre = (sd) => {
    g.save();
    g.scale(sd, 1);
    g.beginPath();
    g.moveTo(-12, 12);
    g.quadraticCurveTo(-2, -10, 22, -24); // blade
    g.moveTo(-20, 4);
    g.lineTo(-4, 20); // crossguard
    g.moveTo(-12, 12);
    g.lineTo(-20, 20); // grip
    g.restore();
  };
  const pommels = (r) => {
    for (const sd of [1, -1]) {
      g.beginPath();
      g.arc(-22 * sd, 22, r, 0, Math.PI * 2);
      g.fill();
    }
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = INK_CSS;
  g.fillStyle = INK_CSS;
  g.lineWidth = 7 + 10;
  for (const sd of [1, -1]) {
    sabre(sd);
    g.stroke();
  }
  pommels(9);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 7;
  for (const sd of [1, -1]) {
    sabre(sd);
    g.stroke();
  }
  pommels(4);
}
// Badge: a disc in the state colour with one bold mark, so the odds never rest on colour alone.
function stateIcon(g, ring, mark, size = 1.5) {
  disc(g, 50, ring, 10);
  g.save();
  g.translate(0, 2);
  g.scale(size, size);
  mark(g, PAPER_CSS);
  g.restore();
}
function whiteFlag(g) {
  disc(g, 50, '#2f8fd8', 10);
  // pole
  inked(g, () => {
    g.beginPath();
    g.moveTo(-20, 34);
    g.lineTo(-20, -34);
  }, '#8b5a2b', 5, 5);
  // flag
  g.beginPath();
  g.moveTo(-18, -32);
  g.bezierCurveTo(0, -40, 10, -24, 30, -30);
  g.lineTo(30, 2);
  g.bezierCurveTo(10, 8, 0, -8, -18, 0);
  g.closePath();
  g.fillStyle = '#ffffff';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = INK_CSS;
  g.lineJoin = 'round';
  g.stroke();
}
function flame(g) {
  disc(g, 50, PAPER_CSS, 10);
  g.beginPath();
  g.moveTo(0, -30);
  g.bezierCurveTo(10, -12, 26, -6, 22, 12);
  g.bezierCurveTo(19, 28, 6, 32, 0, 32);
  g.bezierCurveTo(-6, 32, -19, 28, -22, 12);
  g.bezierCurveTo(-25, -2, -10, -6, -6, -16);
  g.bezierCurveTo(-2, -8, 2, -12, 0, -30);
  g.closePath();
  g.fillStyle = '#ff7a1a';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = INK_CSS;
  g.lineJoin = 'round';
  g.stroke();
  g.beginPath();
  g.moveTo(0, 2);
  g.bezierCurveTo(8, 10, 10, 16, 8, 22);
  g.bezierCurveTo(5, 28, -5, 28, -8, 22);
  g.bezierCurveTo(-10, 16, -4, 10, 0, 2);
  g.fillStyle = '#ffd23f';
  g.fill();
  // the "no" slash
  inked(g, () => {
    g.beginPath();
    g.moveTo(-32, -32);
    g.lineTo(32, 32);
  }, '#e63946', 9, 5);
}
function cooldown(g, done) {
  disc(g, 50, '#cfc6b4', 10);
  g.save();
  g.translate(0, -2);
  hook(g, '#8a8072', 1.05);
  g.restore();
  // recharge ring: the part already recharged, clockwise from the top
  if (done > 0) {
    g.beginPath();
    g.arc(0, 0, 50, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * done);
    g.lineWidth = 12;
    g.strokeStyle = '#ffc93c';
    g.lineCap = 'butt';
    g.stroke();
  }
}

function drawAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = CELL * ATLAS_N;
  const g = canvas.getContext('2d');
  const cell = (i, fn) => {
    g.save();
    g.translate((i % ATLAS_N) * CELL + CELL / 2, Math.floor(i / ATLAS_N) * CELL + CELL / 2);
    fn(g);
    g.restore();
  };
  cell(ICONS.capture, (c) => stateIcon(c, '#2fb865', tick));
  cell(ICONS.fight, (c) => stateIcon(c, '#f0a920', cutlasses, 1.12));
  cell(ICONS.risky, (c) => stateIcon(c, '#e63946', bang));
  cell(ICONS.white, whiteFlag);
  cell(ICONS.hot, flame);
  for (let k = 0; k < COOL_STEPS; k++) cell(COOL_FIRST + k, (c) => cooldown(c, (k + 1) / (COOL_STEPS + 1)));
  return canvas;
}

// ---------------------------------------------------------------------------
// Name labels (moved from main.js: same look, cached per name, redrawn when the font arrives)
// ---------------------------------------------------------------------------
function drawLabel(canvas, text) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '40px "Luckiest Guy", "Fredoka", "Comic Sans MS", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#1d1330';
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2 + 2);
  ctx.fillStyle = '#fff4d6';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
}

// A rounded rectangle (the tag's ink card).
function roundRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return new THREE.ShapeGeometry(s, 4);
}

const _m = new THREE.Matrix4();
const _local = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _c = new THREE.Color();
const COLOR_FULL = new THREE.Color(PIP_FULL);
const COLOR_EMPTY = new THREE.Color(PIP_EMPTY);
const COLOR_NOTCH = new THREE.Color(NOTCH);
const COLOR_INK = new THREE.Color(INK);
const COLOR_RED = new THREE.Color(RED);
const COLOR_PULSE = new THREE.Color(PULSE);

export function createTags(scene) {
  const byShip = new Map(); // ship -> tag
  const tags = new Set();
  let frame = 0;
  let disposed = false;

  // shared resources (disposed in dispose())
  const bgGeo = roundRect(BG_W, BG_H, 0.2);
  const barGeo = new THREE.PlaneGeometry(BAR_W, BAR_H);
  const unitGeo = new THREE.PlaneGeometry(1, 1);
  const bgMat = noOutline(new THREE.MeshBasicMaterial({ color: INK, fog: false }));
  const ghostMat = noOutline(new THREE.MeshBasicMaterial({ color: GHOST, fog: false }));
  const fillMat = noOutline(new THREE.MeshBasicMaterial({ color: RED, fog: false }));
  const pipMat = noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));

  // name labels, per name
  const labels = new Map(); // text -> { canvas, tex, mat }
  function labelMaterial(text) {
    let e = labels.get(text);
    if (!e) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 80;
      drawLabel(canvas, text);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      // Only the glyph pixels write depth, so the outline pass can't smear ink over the name.
      const mat = new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: true, alphaTest: 0.4 });
      e = { canvas, tex, mat, text };
      labels.set(text, e);
    }
    return e.mat;
  }
  const redrawLabels = () => {
    for (const e of labels.values()) {
      drawLabel(e.canvas, e.text);
      e.tex.needsUpdate = true;
    }
  };
  const fonts = typeof document !== 'undefined' ? document.fonts : null;
  fonts?.ready?.then(() => {
    if (!disposed) redrawLabels();
  });
  fonts?.addEventListener?.('loadingdone', redrawLabels);

  // icon atlas: one canvas (one GPU texture); each cell is a sprite material whose map is a clone of the
  // atlas texture with its own offset (clones share the image, so it is uploaded once)
  let atlas = null;
  const iconMats = [];
  function iconMaterial(cell) {
    if (!atlas) {
      atlas = new THREE.CanvasTexture(drawAtlas());
      atlas.colorSpace = THREE.SRGBColorSpace;
      atlas.anisotropy = 4;
    }
    let m = iconMats[cell];
    if (!m) {
      const tex = atlas.clone();
      tex.repeat.set(1 / ATLAS_N, 1 / ATLAS_N);
      tex.offset.set((cell % ATLAS_N) / ATLAS_N, 1 - (Math.floor(cell / ATLAS_N) + 1) / ATLAS_N);
      tex.needsUpdate = true;
      m = new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: true, alphaTest: 0.5 });
      iconMats[cell] = m;
    }
    return m;
  }
  function iconCell(ship) {
    const k = ship.tagIcon;
    if (k === 'cooldown') {
      const left = clamp(num(ship.tagCool, 1), 0, 1);
      return COOL_FIRST + clamp(Math.floor((1 - left) * COOL_STEPS), 0, COOL_STEPS - 1);
    }
    return typeof k === 'string' && Object.prototype.hasOwnProperty.call(ICONS, k) ? ICONS[k] : -1;
  }

  // every pip and notch of every tag: one InstancedMesh, grown when more tags show than it holds
  let pips = null;
  function makePips(tagsCap) {
    if (pips) {
      scene.remove(pips);
      pips.dispose();
    }
    pips = new THREE.InstancedMesh(unitGeo, pipMat, tagsCap * PER_TAG);
    pips.name = 'tag-pips';
    pips.frustumCulled = false; // instances move every frame; the bounds would always be stale
    pips.count = 0;
    pips.visible = false;
    pips.renderOrder = 1;
    pips.setColorAt(0, COLOR_EMPTY); // creates instanceColor
    pips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    pips.instanceColor.setUsage(THREE.DynamicDrawUsage);
    scene.add(pips);
  }
  makePips(12);

  // fixed local matrices of the 10 pip slots
  const slotLocal = [];
  for (let i = 0; i < PIPS; i++) {
    const x = -BAR_W / 2 + PIP_W / 2 + i * (PIP_W + PIP_GAP);
    slotLocal.push(new THREE.Matrix4().compose(_pos.set(x, PIP_Y + LIFT, Z_PIP), _q.identity(), _scl.set(PIP_W, PIP_H, 1)));
  }
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  function crewOf(ship) {
    const crew0 = Math.max(0, num(ship.crew0, num(ship.type && ship.type.crew, 0)));
    const shown = clamp(num(ship.crewShown, crew0), 0, crew0);
    const strike = clamp(num(ship.strikeAt, Math.floor(0.2 * crew0)), 0, crew0);
    return { crew0, shown, strike };
  }

  const api = {
    add(ship) {
      if (!ship || disposed) return null;
      if (byShip.has(ship)) return byShip.get(ship);
      if (ship.type && ship.type.boss) return null; // the boss has its DOM bar and #boss-crew
      const g = new THREE.Group();
      g.name = 'tag';
      const bg = new THREE.Mesh(bgGeo, bgMat);
      bg.position.y = BG_Y + LIFT;
      const ghost = new THREE.Mesh(barGeo, ghostMat);
      ghost.position.set(0, LIFT, Z_GHOST);
      ghost.visible = false;
      const fill = new THREE.Mesh(barGeo, fillMat);
      fill.position.set(0, LIFT, Z_FILL);
      const name = (ship.type && ship.type.name) || String(ship.typeName || '');
      const label = new THREE.Sprite(labelMaterial(name));
      label.scale.set(8, 1.25, 1);
      label.position.y = LABEL_Y + LIFT;
      const icon = new THREE.Sprite(iconMaterial(0));
      icon.scale.set(ICON, ICON, 1);
      icon.position.set(ICON_X, BG_Y + LIFT, Z_FILL);
      icon.visible = false;
      g.add(bg, ghost, fill, label, icon);
      g.visible = false;
      const ratio = clamp(num(ship.hp, 1) / Math.max(1e-6, num(ship.maxHp, 1)), 0, 1);
      g.userData = {
        ship,
        bg,
        ghost,
        fill,
        label,
        icon,
        fillMat: null, // own material while pulsing
        ratio,
        ghostRatio: ratio,
        hold: 0,
        block: -1,
        cell: -1,
        seen: 0,
      };
      byShip.set(ship, g);
      tags.add(g);
      scene.add(g);
      return g;
    },

    remove(ship) {
      const g = byShip.get(ship);
      if (!g) return;
      byShip.delete(ship);
      tags.delete(g);
      scene.remove(g);
      if (g.userData.fillMat) g.userData.fillMat.dispose();
    },

    update(ships, camera, t = 0, dt = 0) {
      if (disposed || !camera) return;
      frame++;
      const step = Math.max(0, num(dt, 0));
      let n = 0;
      const list = ships || [];
      // grow the pip mesh if more tags could show than it holds
      let want = 0;
      for (const s of list) if (byShip.has(s)) want++;
      if (want * PER_TAG > pips.instanceMatrix.count) makePips(Math.max(want, Math.ceil((pips.instanceMatrix.count / PER_TAG) * 2)));
      const mats = pips.instanceMatrix.array;
      const cols = pips.instanceColor.array;

      for (const ship of list) {
        const g = byShip.get(ship);
        if (!g) continue;
        const u = g.userData;
        u.seen = frame;
        u.block = -1;

        // hull ratio and its ghost (ghost logic runs even while hidden so it never jumps)
        const ratio = clamp(num(ship.hp, 0) / Math.max(1e-6, num(ship.maxHp, 1)), 0, 1);
        if (ratio < u.ratio - 1e-6) u.hold = GHOST_HOLD; // a hit: the ghost waits, showing its size
        u.ratio = ratio;
        if (u.hold > 0) u.hold = Math.max(0, u.hold - step);
        else u.ghostRatio += (ratio - u.ghostRatio) * Math.min(1, step * GHOST_RATE);
        if (u.ghostRatio < ratio) u.ghostRatio = ratio; // repairs move both at once

        const gone = !(num(ship.hp, 0) > 0) || ship.sinking > 0 || ship.captured || ship.escaped;
        const mesh = ship.mesh;
        const wy = mesh ? mesh.position.y : 0;
        g.position.set(num(ship.x, 0), wy + num(ship.tagY, 0), num(ship.z, 0));
        const d = g.position.distanceTo(camera.position);
        g.visible = !gone && d > 10;
        if (!g.visible) continue;

        const pulse = ship.flash > 0 ? 1 + ship.flash : 1;
        g.scale.setScalar(clamp(d / 30, 0.6, 2.6) * pulse);
        g.quaternion.copy(camera.quaternion);

        // hull fill and ghost
        const r = Math.max(0.001, ratio);
        u.fill.scale.x = r;
        u.fill.position.x = -(1 - r) * (BAR_W / 2);
        const gr = Math.max(r, u.ghostRatio);
        u.ghost.visible = gr > r + 0.002;
        if (u.ghost.visible) {
          u.ghost.scale.x = gr;
          u.ghost.position.x = -(1 - gr) * (BAR_W / 2);
        }
        if (ship.tagPulse) {
          if (!u.fillMat) u.fillMat = fillMat.clone();
          u.fill.material = u.fillMat;
          const k = 0.5 - 0.5 * Math.cos(num(t, 0) * Math.PI * 2 * 1.4);
          u.fillMat.color.copy(COLOR_RED).lerp(COLOR_PULSE, k * 0.85);
        } else if (u.fill.material !== fillMat) {
          u.fill.material = fillMat;
        }

        // icon
        const cell = iconCell(ship);
        if (cell !== u.cell) {
          u.cell = cell;
          if (cell >= 0) u.icon.material = iconMaterial(cell);
        }
        u.icon.visible = cell >= 0;

        g.updateMatrixWorld(true);

        // crew pips + notch
        const { crew0, shown, strike } = crewOf(ship);
        if (crew0 <= 0) continue;
        u.block = n;
        const filled = (PIPS * shown) / crew0;
        const full = Math.floor(filled + 1e-6);
        const part = filled - full;
        const base = n * PER_TAG;
        const mw = g.matrixWorld;
        for (let i = 0; i < PIPS; i++) {
          _m.multiplyMatrices(mw, slotLocal[i]).toArray(mats, (base + i) * 16);
          (i < full ? COLOR_FULL : COLOR_EMPTY).toArray(cols, (base + i) * 3);
        }
        // the partly filled pip: a cream overlay from the slot's left edge
        if (part > 0.02 && full < PIPS) {
          const w = PIP_W * part;
          const x = -BAR_W / 2 + full * (PIP_W + PIP_GAP) + w / 2;
          _local.compose(_pos.set(x, PIP_Y + LIFT, Z_PART), _q.identity(), _scl.set(w, PIP_H, 1));
          _m.multiplyMatrices(mw, _local).toArray(mats, (base + I_PART) * 16);
        } else {
          ZERO.toArray(mats, (base + I_PART) * 16);
        }
        COLOR_FULL.toArray(cols, (base + I_PART) * 3);
        // the surrender notch: 10 × strikeAt / crew0 pips from the left (between slots, gaps included)
        const at = (PIPS * strike) / crew0;
        const nx = notchX(at);
        _local.compose(_pos.set(nx, PIP_Y + LIFT, Z_NOTCH_INK), _q.identity(), _scl.set(NOTCH_INK_W, NOTCH_INK_H, 1));
        _m.multiplyMatrices(mw, _local).toArray(mats, (base + I_NOTCH_INK) * 16);
        COLOR_INK.toArray(cols, (base + I_NOTCH_INK) * 3);
        _local.compose(_pos.set(nx, PIP_Y + LIFT, Z_NOTCH), _q.identity(), _scl.set(NOTCH_W, NOTCH_H, 1));
        _m.multiplyMatrices(mw, _local).toArray(mats, (base + I_NOTCH) * 16);
        COLOR_NOTCH.toArray(cols, (base + I_NOTCH) * 3);
        n++;
      }
      // tags of ships that were not passed this frame hide
      for (const g of tags) {
        if (g.userData.seen !== frame) {
          g.visible = false;
          g.userData.block = -1;
        }
      }
      pips.count = n * PER_TAG;
      pips.visible = n > 0;
      if (n > 0) {
        pips.instanceMatrix.clearUpdateRanges();
        pips.instanceMatrix.addUpdateRange(0, n * PER_TAG * 16);
        pips.instanceMatrix.needsUpdate = true;
        pips.instanceColor.clearUpdateRanges();
        pips.instanceColor.addUpdateRange(0, n * PER_TAG * 3);
        pips.instanceColor.needsUpdate = true;
      }
    },

    // Test hook: what a tag shows, with the crew pips and the notch read back from the InstancedMesh.
    read(ship) {
      const g = byShip.get(ship);
      if (!g) return null;
      const u = g.userData;
      const out = {
        visible: g.visible,
        hull: u.ratio,
        ghost: u.ghost.visible ? u.ghostRatio : u.ratio,
        pips: null,
        notch: null,
        icon: u.icon.visible ? iconName(u.cell) : null,
      };
      if (u.block < 0 || !g.visible) return out;
      _inv.copy(g.matrixWorld).invert();
      const base = u.block * PER_TAG;
      let filled = 0;
      for (let i = 0; i < PIPS; i++) {
        pips.getColorAt(base + i, _c);
        if (Math.abs(_c.r - COLOR_FULL.r) + Math.abs(_c.g - COLOR_FULL.g) + Math.abs(_c.b - COLOR_FULL.b) < 1e-3) filled++;
      }
      pips.getMatrixAt(base + I_PART, _m);
      _m.premultiply(_inv).decompose(_pos, _q, _scl);
      if (_scl.x > 1e-6) filled += _scl.x / PIP_W;
      pips.getMatrixAt(base + I_NOTCH, _m);
      _m.premultiply(_inv).decompose(_pos, _q, _scl);
      out.pips = Math.round(filled * 1000) / 1000;
      out.notch = Math.round(notchAt(_pos.x) * 1000) / 1000;
      return out;
    },

    get count() {
      return tags.size;
    },
    get pips() {
      return pips;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      fonts?.removeEventListener?.('loadingdone', redrawLabels);
      for (const ship of [...byShip.keys()]) api.remove(ship);
      if (pips) {
        scene.remove(pips);
        pips.dispose();
      }
      for (const e of labels.values()) {
        e.tex.dispose();
        e.mat.dispose();
      }
      labels.clear();
      for (const m of iconMats) {
        if (!m) continue;
        m.map.dispose();
        m.dispose();
      }
      iconMats.length = 0;
      if (atlas) atlas.dispose();
      for (const x of [bgGeo, barGeo, unitGeo, bgMat, ghostMat, fillMat, pipMat]) x.dispose();
    },
  };
  return api;
}

function iconName(cell) {
  if (cell >= COOL_FIRST) return 'cooldown';
  for (const [k, v] of Object.entries(ICONS)) if (v === cell) return k;
  return null;
}

// Where the notch sits for `at` pips from the left (whole numbers sit in the gap between two pips,
// fractions inside a pip), and back.
const SLOT = PIP_W + PIP_GAP;
function notchX(at) {
  const k = Math.floor(at + 1e-9);
  const f = at - k;
  if (f < 1e-6 && k > 0) return -BAR_W / 2 + k * SLOT - PIP_GAP / 2;
  return -BAR_W / 2 + k * SLOT + f * PIP_W;
}
function notchAt(x) {
  const u = x + BAR_W / 2;
  const k = Math.floor((u + PIP_GAP / 2 + 1e-6) / SLOT);
  const inGap = Math.abs(u - (k * SLOT - PIP_GAP / 2)) < 1e-4;
  if (inGap && k > 0) return k;
  const j = Math.floor((u + 1e-6) / SLOT);
  return j + clamp((u - j * SLOT) / PIP_W, 0, 1);
}
