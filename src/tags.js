import * as THREE from 'three';
import { noOutline } from './style.js';

// Floating name tags above enemy ships (SPEC2 §5.4, §9.1): the ship's name, a hull bar whose pale
// "ghost" segment lingers 0.45 s after each hit (so you see how big the hit was), a row of 10 crew
// pips with the gold surrender notch, and a status icon (boarding odds, white flag, RAM!, too hot). While
// chain shot slows her, a chain-shot badge on the left with a timer bar under it that shrinks as the
// slow wears off; sailors just lost (grape shot) make their pips flash red for a moment.
// A special shot's status (SPEC3 §6.4) takes the left badge's place: a flame, a snowflake or a stink cloud
// (different shapes, never colour alone) in an ink ring of 8 time dots that go dark as it wears off. One
// badge per tag: while she has a status it shows instead of the chain badge.
//
//                ( PRIVATEER BRIG )            the name on an ink tab on top of the card
//   (chain)  [████████▒▒▒░░░░░░░]  (icon)    hull: red fill over the ghost over the ink background
//   [====]   [▮▮▮▮▮▮▮░│░░       ]            crew: cream = aboard, dark = lost, the last one partly filled
//   (status: the badge in its ring of dots, where the chain badge is; no timer bar)
//
// Draw calls: per tag the background, the ghost (only while it lags behind the fill), the fill and the
// name sprite (4), plus the icon sprite when one shows and the left badge (chain or status) while it shows:
// +1 draw call per tag that shows a status badge. Every pip and notch of every tag, the chain badges' timer
// bars and the status badges' time dots are ONE InstancedMesh, rewritten each frame from the tags' world
// matrices: 1 draw call for the whole fleet.
// On a small screen (a phone) the tags are drawn bigger, so the pips and badges read: at least MIN_PX
// CSS px wide (up to MAX_GROW times the size they would have).
// Everything is flat and unlit (MeshBasicMaterial / sprites, noOutline): the outline pass skips it.
//
// createTags(scene, { reducedMotion }) → {
//   add(ship) → tag | null (bosses get no tag: they have the DOM boss bar), remove(ship),
//   update(ships, camera, t, dt),   // per frame: billboard, scale, hull fill + ghost, pips + notch, icon,
//                                   // the chain badge and its timer, lost pips flashing
//   read(ship) → { visible, hull, ghost, pips, notch, icon, slow, status, flash, colors } | null   // test hook:
//                                    pips/notch read back from the pip InstancedMesh (colours and matrices),
//                                    in pip units; slow: the chain timer's fill (0..1) when the badge shows,
//                                    else null; status: { id, dots } while the status badge shows (dots: how
//                                    many of its 8 time dots are lit, read back from the InstancedMesh), else
//                                    null; flash: how many pips are flashing; colors: the 10 pips' colours
//                                    ('rrggbb', left to right) while the tag shows
//   rect(ship, camera) → { l, t, r, b } | null   // the drawn tag on screen (CSS px), while it shows
//   frame(ship, camera) → { x, y, z, size, px, l, r, t, b } | null   // for framing: the tag's anchor
//                                    (world), world units per tag unit at the camera's distance, CSS px per
//                                    tag unit on screen (where a tag keeps its size, 18-78 u away), and its
//                                    extent in tag units (badges included)
//   get count, get pips /* the InstancedMesh */, dispose()
// }
// reducedMotion: a boolean or a function returning one: lost pips turn red without flashing.
// Reads per ship: hp, maxHp, crewShown (may be fractional during a brawl), crew0, strikeAt, tagSlow
// (0..1: the part of chain shot's slow still to run; 0 = not slowed), crewLost ({ n, from }: n counts
// the losses, `from` is the crew before the latest; a new n flashes the pips lost since `from`), status
// ({ id, t, max } from specials.newStatus(): id 'fire' | 'frost' | 'stink' shows its badge with t / max of
// the dots lit; id null = no status), tagIcon ('capture' | 'fight' | 'risky' | 'white' | 'ram' | 'hot' |
// 'cooldown' | null; main picks one by SPEC3 §6.4's priority; 'cooldown' draws the hook
// greyed with a recharge ring from tagCool, the fraction of the cooldown still to go), tagPulse (the
// hull bar throbs: "wrecked"), flash (a hit swells the tag), tagHidden (boarding.js: hidden while the boarding
// view is on), and the sinking / captured / escaped flags.
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
// the name tab's sprite: 8 × 1.25 tag units for its 512 × 80 canvas; the tab (the lower 56 px) overlaps the
// card's top edge a little so the two read as one piece
const LABEL_W = 8;
const LABEL_H = 1.25;
const LABEL_Y = BG_TOP + LABEL_H / 2 - 0.06;
// The crew row hangs below the bar: lift the whole tag so its bottom edge stays where the old one-row
// tag's was (the masthead flag, white or yours, stays in view below it).
const LIFT = -0.375 - BG_BOTTOM;
const Z_GHOST = 0.012;
const Z_FILL = 0.024;
const Z_PIP = 0.012;
const Z_PART = 0.024;
const Z_NOTCH_INK = 0.03;
const Z_NOTCH = 0.036;
// The chain badge (left of the card, mirroring the status icon) and its timer bar under it.
const SLOW_X = -ICON_X;
const SLOW_Y = BG_Y + LIFT;
const TIMER_W = ICON * 0.9;
const TIMER_H = 0.22;
const TIMER_Y = SLOW_Y - ICON / 2 - 0.12 - TIMER_H / 2;
const TIMER_INK = 0.1; // the ink frame round the timer bar
// The status badge's ring of time dots: on the badge's ink bezel, inside the chain badge's square (so a tag
// with a status covers no more than one with the chain badge: EXTENT and the framing stay as they were).
const DOTS = 8;
const DOT = 0.2;
const DOT_R = (ICON / 2) * (52.5 / 64); // the bezel's middle (its art: an ink ring from 42 to 62 of 64 px)
const Z_DOT = 0.04;
// What a tag covers, in tag units (for framing it on screen): both badges, the name tab, the timer.
// (The name tab fills the lower 56 px of its 80 px label canvas: its top is 0.2 of the label's height above
// the label's centre.)
const TAB_TOP = LABEL_Y + LIFT + LABEL_H * 0.2;
const TAB_BOTTOM = LABEL_Y + LIFT - LABEL_H / 2;
const EXTENT = { l: -(ICON_X + ICON / 2), r: ICON_X + ICON / 2, t: TAB_TOP, b: TIMER_Y - TIMER_H / 2 - TIMER_INK };
// Instances per tag: 10 pips, the partly filled overlay, the notch's dark backing and the gold notch, the
// chain timer's ink frame and its fill, and the status badge's 8 time dots.
const PER_TAG = PIPS + 5 + DOTS;
const I_PART = PIPS;
const I_NOTCH_INK = PIPS + 1;
const I_NOTCH = PIPS + 2;
const I_TIMER_INK = PIPS + 3;
const I_TIMER = PIPS + 4;
const I_DOT = PIPS + 5;
// Small screens: a tag is drawn at least MIN_PX CSS px wide (its card), at most MAX_GROW times bigger.
const MIN_PX = 92;
const MAX_GROW = 1.7;
// Sailors just lost: their pips flash red (and stand a little taller) for FLASH_TIME s, BLINK times a second.
const FLASH_TIME = 1.4;
const BLINK = 2.5;
const FLASH_TALL = 1.45;

const INK = 0x1d1330;
const RED = 0xe63946;
const PULSE = 0xffa24a; // a wrecked ship's hull bar throbs toward this
const GHOST = 0xfff3c4; // the HUD's ghost colour
const PIP_FULL = 0xfff4d6;
const PIP_EMPTY = 0x4a3b5c;
const NOTCH = 0xffc93c;
const LOST_A = 0xff3b2f; // a lost pip, flashing red ...
const LOST_B = PIP_EMPTY; // ... and the dark of a lost pip (both read "gone": never the cream of a pip aboard)
const TIMER = 0x8fd8ff; // the chain timer's fill (sky blue, like the badge)
const DOT_ON = { fire: 0xffc23a, frost: 0xd6f4ff, stink: 0xc6f27a }; // a status badge's lit time dots
const GHOST_HOLD = 0.45; // seconds the ghost waits after a hit before it slides down
const GHOST_RATE = 4; // then closes the gap at this rate (1/s), like the HUD's hull bar

// Icon atlas: 4 × 5 cells of 128 px. Cells 0-4 are the states, 5-12 the cooldown ring in 8 steps, 13 the
// chain badge, 14 RAM!, 15-17 the status badges.
const CELL = 128;
const ATLAS_COLS = 4;
const ATLAS_ROWS = 5;
const ICONS = { capture: 0, fight: 1, risky: 2, white: 3, hot: 4, ram: 14 };
const COOL_FIRST = 5;
const COOL_STEPS = 8;
const CHAIN_CELL = COOL_FIRST + COOL_STEPS; // 13: the chain-shot badge
const STATUS_CELLS = { fire: 15, frost: 16, stink: 17 };
const statusOf = (ship) => {
  const st = ship && ship.status;
  const id = st && typeof st === 'object' ? st.id : null;
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(STATUS_CELLS, id) ? id : null;
};

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

// The chain-shot badge: chain shot as the Ammo button draws it (two half-balls on a chain) on a sky-blue disc.
function chainShot(g) {
  disc(g, 50, '#58b4ea', 10);
  g.save();
  g.rotate(-0.35);
  // the chain between the halves: ink, then steel links
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-14, 0);
  g.lineTo(14, 0);
  g.strokeStyle = INK_CSS;
  g.lineWidth = 15;
  g.stroke();
  g.strokeStyle = '#d7d2e2';
  g.lineWidth = 6;
  g.setLineDash([7, 5]);
  g.stroke();
  g.setLineDash([]);
  // the two half-balls, flat sides inward
  for (const sd of [-1, 1]) {
    g.beginPath();
    g.arc(sd * 14, 0, 21, sd > 0 ? -Math.PI / 2 : Math.PI / 2, sd > 0 ? Math.PI / 2 : (Math.PI * 3) / 2);
    g.closePath();
    g.fillStyle = '#3a3443';
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = INK_CSS;
    g.lineJoin = 'round';
    g.stroke();
    // a glint
    g.beginPath();
    g.arc(sd * 14 + sd * 8, -8, 4, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255, 255, 255, 0.7)';
    g.fill();
  }
  g.restore();
}

// RAM!: two red chevrons charging right on a paper disc (the Shark Raider's wind-up and surge).
function ramIcon(g) {
  disc(g, 50, PAPER_CSS, 10);
  const tri = (x0) => {
    g.beginPath();
    g.moveTo(x0, -25);
    g.lineTo(x0 + 27, 0);
    g.lineTo(x0, 25);
    g.lineTo(x0 + 7, 0);
    g.closePath();
  };
  g.lineJoin = 'round';
  for (const x0 of [-30, -2]) {
    tri(x0);
    g.lineWidth = 9;
    g.strokeStyle = INK_CSS;
    g.stroke();
    g.fillStyle = '#e63946';
    g.fill();
  }
}

// A status badge: an ink bezel (where the 8 time dots go, drawn by the pip mesh) round a coloured disc with
// the status's shape: a flame, a snowflake or a stink cloud.
function statusBadge(g, ring, mark) {
  g.beginPath();
  g.arc(0, 0, 62, 0, Math.PI * 2);
  g.fillStyle = INK_CSS;
  g.fill();
  g.beginPath();
  g.arc(0, 0, 42, 0, Math.PI * 2);
  g.fillStyle = ring;
  g.fill();
  g.save();
  mark(g);
  g.restore();
}
function fireMark(g) {
  g.translate(0, 1);
  g.scale(1.02, 1.02);
  g.beginPath();
  g.moveTo(0, -32);
  g.bezierCurveTo(10, -14, 26, -6, 22, 12);
  g.bezierCurveTo(19, 28, 6, 32, 0, 32);
  g.bezierCurveTo(-6, 32, -19, 28, -22, 12);
  g.bezierCurveTo(-25, -2, -10, -6, -6, -16);
  g.bezierCurveTo(-2, -8, 2, -12, 0, -32);
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
}
function frostMark(g) {
  const arms = () => {
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const ux = Math.sin(a);
      const uy = -Math.cos(a);
      g.moveTo(0, 0);
      g.lineTo(ux * 30, uy * 30);
      for (const s of [-1, 1]) {
        const b = a + s * 0.8;
        g.moveTo(ux * 17, uy * 17);
        g.lineTo(ux * 17 + Math.sin(b) * 11, uy * 17 - Math.cos(b) * 11);
      }
    }
  };
  g.lineCap = 'round';
  arms();
  g.strokeStyle = INK_CSS;
  g.lineWidth = 12;
  g.stroke();
  arms();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 5;
  g.stroke();
}
function stinkMark(g) {
  // two wavy stink lines over a puffy cloud
  g.lineCap = 'round';
  for (const x0 of [-10, 10]) {
    const wave = () => {
      g.beginPath();
      for (let y = -6; y >= -34; y -= 2) g.lineTo(x0 + 5 * Math.sin((y + 6) * 0.25), y);
    };
    wave();
    g.strokeStyle = INK_CSS;
    g.lineWidth = 11;
    g.stroke();
    wave();
    g.strokeStyle = '#c6f27a';
    g.lineWidth = 5;
    g.stroke();
  }
  const blobs = [[-14, 14, 13], [13, 13, 14], [0, 4, 15], [0, 18, 13]];
  g.beginPath();
  for (const [x, y, r] of blobs) {
    g.moveTo(x + r, y);
    g.arc(x, y, r, 0, Math.PI * 2);
  }
  g.lineWidth = 11;
  g.strokeStyle = INK_CSS;
  g.stroke();
  g.fillStyle = '#8bc34a';
  for (const [x, y, r] of blobs) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // a dark swirl on it
  g.beginPath();
  for (let i = 0; i <= 30; i++) {
    const a = (i / 30) * Math.PI * 2.6;
    const r = 2 + 7 * (i / 30);
    g.lineTo(2 + Math.cos(a) * r, 11 + Math.sin(a) * r * 0.85);
  }
  g.strokeStyle = '#5a8f2e';
  g.lineWidth = 4;
  g.stroke();
}

function drawAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = CELL * ATLAS_COLS;
  canvas.height = CELL * ATLAS_ROWS;
  const g = canvas.getContext('2d');
  const cell = (i, fn) => {
    g.save();
    g.translate((i % ATLAS_COLS) * CELL + CELL / 2, Math.floor(i / ATLAS_COLS) * CELL + CELL / 2);
    fn(g);
    g.restore();
  };
  cell(ICONS.capture, (c) => stateIcon(c, '#2fb865', tick));
  cell(ICONS.fight, (c) => stateIcon(c, '#f0a920', cutlasses, 1.12));
  cell(ICONS.risky, (c) => stateIcon(c, '#e63946', bang));
  cell(ICONS.white, whiteFlag);
  cell(ICONS.hot, flame);
  for (let k = 0; k < COOL_STEPS; k++) cell(COOL_FIRST + k, (c) => cooldown(c, (k + 1) / (COOL_STEPS + 1)));
  cell(CHAIN_CELL, chainShot);
  cell(ICONS.ram, ramIcon);
  cell(STATUS_CELLS.fire, (c) => statusBadge(c, '#7a1f2b', fireMark));
  cell(STATUS_CELLS.frost, (c) => statusBadge(c, '#2f78d8', frostMark));
  cell(STATUS_CELLS.stink, (c) => statusBadge(c, '#5b3592', stinkMark));
  return canvas;
}

// ---------------------------------------------------------------------------
// Name labels (moved from main.js: same look, cached per name, redrawn when the font arrives)
// ---------------------------------------------------------------------------
// The name sits on an ink tab joined to the top of the bar card, so it reads over any sky or sea (cream
// letters on ink, like the card below it) instead of floating pale letters a bar's height above it.
const LABEL_FONT = '38px "Luckiest Guy", "Fredoka", "Comic Sans MS", system-ui, sans-serif';
const TAB_H = 56; // px of the 80 px canvas
function drawLabel(canvas, text) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.font = LABEL_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // the tab: as wide as the name plus a margin (never past the canvas), round ends
  const tw = Math.min(W - 8, Math.ceil(ctx.measureText(text).width) + 40);
  const x0 = (W - tw) / 2;
  const y0 = H - TAB_H;
  const r = TAB_H / 2;
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.lineTo(x0 + tw - r, y0);
  ctx.arc(x0 + tw - r, y0 + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x0 + r, y0 + TAB_H);
  ctx.arc(x0 + r, y0 + r, r, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.closePath();
  ctx.fillStyle = '#1d1330';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#1d1330';
  ctx.strokeText(text, W / 2, y0 + TAB_H / 2 + 2);
  ctx.fillStyle = '#fff4d6';
  ctx.fillText(text, W / 2, y0 + TAB_H / 2 + 2);
  return tw;
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
const COLOR_LOST_A = new THREE.Color(LOST_A);
const COLOR_LOST_B = new THREE.Color(LOST_B);
const COLOR_TIMER = new THREE.Color(TIMER);
const COLOR_DOT_ON = Object.fromEntries(Object.entries(DOT_ON).map(([k, v]) => [k, new THREE.Color(v)]));
const _v = new THREE.Vector3();
const AXIS_Z = new THREE.Vector3(0, 0, 1);

export function createTags(scene, { reducedMotion = false } = {}) {
  const rm = typeof reducedMotion === 'function' ? () => !!reducedMotion() : () => !!reducedMotion;
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
      const tw = drawLabel(canvas, text);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      // Only the glyph pixels write depth, so the outline pass can't smear ink over the name.
      const mat = new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: true, alphaTest: 0.4 });
      e = { canvas, tex, mat, text, tw };
      labels.set(text, e);
    }
    return e.mat;
  }
  const redrawLabels = () => {
    for (const e of labels.values()) {
      e.tw = drawLabel(e.canvas, e.text);
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
      tex.repeat.set(1 / ATLAS_COLS, 1 / ATLAS_ROWS);
      tex.offset.set((cell % ATLAS_COLS) / ATLAS_COLS, 1 - (Math.floor(cell / ATLAS_COLS) + 1) / ATLAS_ROWS);
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

  // How much bigger tags are drawn on this screen: a card at least MIN_PX CSS px wide (at the distances where
  // a tag keeps its size on screen, d / 30), at most MAX_GROW times bigger. 1 on a desktop window.
  function growFor(camera) {
    return clamp(MIN_PX / (BG_W * unitPx(camera)), 1, MAX_GROW);
  }
  // CSS px a tag unit spans on screen at scale 1 per 30 u of distance (where tags keep their size: d / 30).
  function unitPx(camera) {
    const H = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 720;
    const tanV = Math.tan((num(camera.fov, 55) * Math.PI) / 360) / Math.max(1e-6, num(camera.zoom, 1));
    return H / (60 * tanV);
  }
  // The name tab's width in tag units.
  function tabWidth(ship) {
    const name = (ship.type && ship.type.name) || String(ship.typeName || '');
    const e = labels.get(name);
    return e ? (num(e.tw, 512) / 512) * LABEL_W : LABEL_W;
  }

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
      label.scale.set(LABEL_W, LABEL_H, 1);
      label.position.y = LABEL_Y + LIFT;
      const icon = new THREE.Sprite(iconMaterial(0));
      icon.scale.set(ICON, ICON, 1);
      icon.position.set(ICON_X, BG_Y + LIFT, Z_FILL);
      icon.visible = false;
      // the chain-shot badge (while chain shot slows her)
      const slow = new THREE.Sprite(iconMaterial(CHAIN_CELL));
      slow.scale.set(ICON, ICON, 1);
      slow.position.set(SLOW_X, SLOW_Y, Z_FILL);
      slow.visible = false;
      // the status badge (a special shot's status), in the same place; its 8 time dots are pips
      const badge = new THREE.Sprite(iconMaterial(STATUS_CELLS.fire));
      badge.scale.set(ICON, ICON, 1);
      badge.position.set(SLOW_X, SLOW_Y, Z_FILL);
      badge.visible = false;
      g.add(bg, ghost, fill, label, icon, slow, badge);
      g.visible = false;
      const ratio = clamp(num(ship.hp, 1) / Math.max(1e-6, num(ship.maxHp, 1)), 0, 1);
      g.userData = {
        ship,
        bg,
        ghost,
        fill,
        label,
        icon,
        slow,
        slowLeft: 0, // the chain timer's fill (0..1)
        badge,
        statusId: null, // the status the badge shows ('fire' | 'frost' | 'stink' | null)
        dots: 0, // its time dots lit
        lostN: 0, // the ship's crewLost.n last seen
        lostFrom: 0, // pips (from the left) the flashing run reaches
        flashT: 0, // seconds of flashing left
        flashing: 0, // pips flashing this frame
        grow: 1, // the small-screen size factor this frame
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
      const grow = growFor(camera);
      const still = rm();

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
        g.visible = !gone && d > 10 && !ship.tagHidden; // (tagHidden: a boarding shows her crews in its strip)
        if (!g.visible) continue;

        const pulse = ship.flash > 0 ? 1 + ship.flash : 1;
        u.grow = grow;
        g.scale.setScalar(clamp(d / 30, 0.6, 2.6) * grow * pulse);
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
        // the chain badge: shows while chain shot slows her, its timer bar shrinking as the slow wears off
        u.slowLeft = clamp(num(ship.tagSlow, 0), 0, 1);
        // a special shot's status takes its place (one badge per tag), its dots lit for the time still to run
        const sid = statusOf(ship);
        if (sid !== u.statusId) {
          u.statusId = sid;
          if (sid) u.badge.material = iconMaterial(STATUS_CELLS[sid]);
        }
        if (sid) {
          const st = ship.status;
          const max = num(st.max, 0);
          const left = max > 0 ? clamp(num(st.t, 0) / max, 0, 1) : num(st.t, 0) > 0 ? 1 : 0;
          u.dots = clamp(Math.ceil(DOTS * left - 1e-6), 0, DOTS);
        } else u.dots = 0;
        u.badge.visible = !!sid;
        u.slow.visible = u.slowLeft > 0 && !sid;

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
        // sailors just lost: the pips between what she has now and what she had flash red for a moment
        const lost = ship.crewLost;
        if (lost && typeof lost === 'object' && num(lost.n, 0) !== u.lostN) {
          const from = clamp((PIPS * num(lost.from, 0)) / crew0, 0, PIPS);
          u.lostFrom = u.flashT > 0 ? Math.max(u.lostFrom, from) : from;
          u.lostN = num(lost.n, 0);
          u.flashT = FLASH_TIME;
        }
        if (u.flashT > 0) u.flashT = Math.max(0, u.flashT - step);
        const lo = full;
        const hi = u.flashT > 0 ? Math.min(PIPS, Math.ceil(u.lostFrom - 1e-6)) : 0;
        u.flashing = Math.max(0, hi - lo);
        const blinkOn = still || Math.floor((FLASH_TIME - u.flashT) * BLINK * 2) % 2 === 0;
        for (let i = 0; i < PIPS; i++) {
          if (i >= lo && i < hi) {
            // a lost pip: taller (unless motion is reduced) and flashing red / dark (steady red if reduced)
            _local.copy(slotLocal[i]);
            if (!still) _local.elements[5] *= FLASH_TALL;
            _m.multiplyMatrices(mw, _local).toArray(mats, (base + i) * 16);
            (blinkOn ? COLOR_LOST_A : COLOR_LOST_B).toArray(cols, (base + i) * 3);
            continue;
          }
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
        // the chain timer under the badge: an ink frame and the sky-blue part of the slow still to run
        if (u.slow.visible) {
          _local.compose(_pos.set(SLOW_X, TIMER_Y, Z_PIP), _q.identity(), _scl.set(TIMER_W + 2 * TIMER_INK, TIMER_H + 2 * TIMER_INK, 1));
          _m.multiplyMatrices(mw, _local).toArray(mats, (base + I_TIMER_INK) * 16);
          const w = Math.max(0.02, TIMER_W * u.slowLeft);
          _local.compose(_pos.set(SLOW_X - TIMER_W / 2 + w / 2, TIMER_Y, Z_PART), _q.identity(), _scl.set(w, TIMER_H, 1));
          _m.multiplyMatrices(mw, _local).toArray(mats, (base + I_TIMER) * 16);
        } else {
          ZERO.toArray(mats, (base + I_TIMER_INK) * 16);
          ZERO.toArray(mats, (base + I_TIMER) * 16);
        }
        COLOR_INK.toArray(cols, (base + I_TIMER_INK) * 3);
        COLOR_TIMER.toArray(cols, (base + I_TIMER) * 3);
        // the status badge's 8 time dots on its bezel, clockwise from the top: lit for the time still to run
        for (let i = 0; i < DOTS; i++) {
          if (!u.badge.visible) {
            ZERO.toArray(mats, (base + I_DOT + i) * 16);
            continue;
          }
          const a = Math.PI / 2 - (i / DOTS) * Math.PI * 2;
          _local.compose(_pos.set(SLOW_X + Math.cos(a) * DOT_R, SLOW_Y + Math.sin(a) * DOT_R, Z_DOT), _q.setFromAxisAngle(AXIS_Z, a), _scl.set(DOT, DOT, 1));
          _m.multiplyMatrices(mw, _local).toArray(mats, (base + I_DOT + i) * 16);
          (i < u.dots ? COLOR_DOT_ON[u.statusId] : COLOR_EMPTY).toArray(cols, (base + I_DOT + i) * 3);
        }
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
        slow: g.visible && u.slow.visible ? Math.round(u.slowLeft * 1000) / 1000 : null,
        status: null,
        flash: g.visible ? u.flashing : 0,
      };
      if (u.block < 0 || !g.visible) return out;
      if (u.badge.visible) {
        // the lit dots, read back from the pip mesh's colours
        let lit = 0;
        const on = COLOR_DOT_ON[u.statusId];
        for (let i = 0; i < DOTS; i++) {
          pips.getColorAt(u.block * PER_TAG + I_DOT + i, _c);
          if (Math.abs(_c.r - on.r) + Math.abs(_c.g - on.g) + Math.abs(_c.b - on.b) < 1e-3) lit++;
        }
        out.status = { id: u.statusId, dots: lit };
      }
      _inv.copy(g.matrixWorld).invert();
      const base = u.block * PER_TAG;
      let filled = 0;
      out.colors = [];
      for (let i = 0; i < PIPS; i++) {
        pips.getColorAt(base + i, _c);
        out.colors.push(_c.getHexString());
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

    // The drawn tag on screen, in CSS px ({ l, t, r, b }): the card, the name tab and the badges showing.
    // null while it is hidden.
    rect(ship, camera) {
      const g = byShip.get(ship);
      if (!g || !g.visible || !camera || typeof window === 'undefined') return null;
      const u = g.userData;
      g.updateMatrixWorld(true);
      const W = window.innerWidth;
      const H = window.innerHeight;
      const box = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
      const add = (x0, x1, y0, y1) => {
        for (const x of [x0, x1]) {
          for (const y of [y0, y1]) {
            _v.set(x, y, 0).applyMatrix4(g.matrixWorld).project(camera);
            const px = (_v.x * 0.5 + 0.5) * W;
            const py = (-_v.y * 0.5 + 0.5) * H;
            box.l = Math.min(box.l, px);
            box.r = Math.max(box.r, px);
            box.t = Math.min(box.t, py);
            box.b = Math.max(box.b, py);
          }
        }
      };
      add(-BG_W / 2, BG_W / 2, BG_BOTTOM + LIFT, BG_TOP + LIFT);
      const tw = tabWidth(u.ship) / 2;
      add(-tw, tw, TAB_BOTTOM, TAB_TOP);
      if (u.icon.visible) add(ICON_X - ICON / 2, ICON_X + ICON / 2, BG_Y + LIFT - ICON / 2, BG_Y + LIFT + ICON / 2);
      if (u.slow.visible) add(SLOW_X - ICON / 2, SLOW_X + ICON / 2, EXTENT.b, SLOW_Y + ICON / 2);
      if (u.badge.visible) add(SLOW_X - ICON / 2, SLOW_X + ICON / 2, SLOW_Y - ICON / 2, SLOW_Y + ICON / 2);
      return box;
    },

    // For framing a ship's tag on screen (main's battle camera): where its anchor is (world), how many world
    // units a tag unit is at `camera`'s distance (its size on screen, both badges counted) and what it covers in
    // tag units (badges, name tab and timer included: the tag at its biggest). null if the ship has no tag.
    frame(ship, camera) {
      const g = byShip.get(ship);
      if (!g || !camera) return null;
      const wy = ship.mesh ? ship.mesh.position.y : 0;
      const x = num(ship.x, 0);
      const y = wy + num(ship.tagY, 0);
      const z = num(ship.z, 0);
      const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
      const tw = tabWidth(ship) / 2;
      const grow = growFor(camera);
      return { x, y, z, size: clamp(d / 30, 0.6, 2.6) * grow, px: grow * unitPx(camera), l: Math.min(EXTENT.l, -tw), r: Math.max(EXTENT.r, tw), t: EXTENT.t, b: EXTENT.b };
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
  for (const [k, v] of Object.entries(ICONS)) if (v === cell) return k;
  if (cell >= COOL_FIRST && cell < COOL_FIRST + COOL_STEPS) return 'cooldown';
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
