import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { noOutline, gradientMap, INK } from './style.js';

// What a status looks like on a ship (SPEC3 §2.7), drawn for every ship of the fleet at once:
//   fire   flames lick up from her two newest holes (cartoon tongues that change shape, never brightness) and
//          her two biggest sails are charred along their bottom edges
//   frost  a jagged white-blue icicle fringe and snow along her rails, ice plates bobbing round her hull at
//          the waterline, snowflakes drifting off her
//   stink  a puffy lime cloud (0x8bc34a, swirls 0x5a8f2e) on her deck with wavy stink lines rising out of it
//          and two buzzing flies
// (Her black smoke and her stopped wake are main.js's: its ambient particles and wake.)
//
// Draw calls: five InstancedMeshes, all noOutline (the outline pass can't ink an InstancedMesh):
//   sprites  flames, sail scorches, snowflakes, stink lines, swirls and flies: camera-facing cut-outs from one
//            canvas atlas, drawn with their own ink line (≤ 128: a burning ship 12, a frozen one 4, a stinky
//            one 9)
//   icicles  toon cones (≤ 128: 30 a ship)     plates  toon ice slabs and rail snow (≤ 64: 6 + 8 a ship)
//   puffs    toon lumps (≤ 60: 10 a ship) and their inverted-hull ink twin (as volcano.js's smoke)
// = at most 5 draw calls for the whole fleet (a mesh with nothing to draw costs none: it stays in the scene
// with count 0, so its shader is compiled before the first shot lands). §11.1's budget is ≤ 6, ≤ 8.
//
// createStatusFx(scene, { reducedMotion, seaY }) → {
//   sync(ships, t, dt),   // per frame, after the ships are placed: draws each ship's `status` (fading in and
//                         //   out over a quarter second); t = visual time (shapes), dt = 0 while paused
//   clear(ship),          // forget a ship at once (removed, captured)
//   read() → { calls, flames, chars, flakes, lines, swirls, flies, icicles, plates, puffs }   // test hook:
//                         //   instances drawn at the last sync, and the draw calls they cost
//   get meshes,           // the InstancedMeshes
//   dispose()
// }
// reducedMotion: a boolean or a function returning one (read every frame): the effects are drawn but hold
// still (no swirl, bob, buzz, drift or flicker) and appear and go at once.
// seaY(x, z, t): the sea's height (main passes ocean.heightAt with the visual time it gives sync), so the ice
// plates float on the waves round her; without it they sit at her own waterline.
// Reads per ship: status ({ id: 'fire' | 'frost' | 'stink' | null, ... }), mesh (its group: matrixWorld,
// visible, userData.statusAnchors { rail: [{x, y, z}], deck: {x, y, z}, holes: [{x, y, z, side}] newest
// first, userData.hullSide, userData.damageLevel), type { len, wid }, hp, sinking, captured, escaped,
// tagHidden (the boarding view: the stink cloud stands aside, only its lines and flies show). A ship without
// statusAnchors gets anchors made from her size.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const frac = (x) => x - Math.floor(x);
const hash = (n) => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453);
const smooth = (x) => {
  const k = clamp(x, 0, 1);
  return k * k * (3 - 2 * k);
};

export const STATUS_IDS = ['fire', 'frost', 'stink'];
const FADE_IN = 0.25; // s for a status's look to grow in ...
const FADE_OUT = 0.35; // ... and to shrink away when it ends
const CAP = { sprites: 128, icicles: 128, plates: 64, puffs: 60 };
const PER = { flames: 3, icicles: 30, plates: 6, caps: 8, puffs: 10, lines: 4, flies: 2, flakes: 4 };

// sprite atlas: 4 × 3 cells of 256 px
const COLS = 4;
const ROWS = 3;
const CELL = 256;
const C = { flame: 0, snow: 3, line: 4, fly: 6, swirl: 8, char: 9 }; // flames 0-2, stink lines 4-5, flies 6-7 (wing beats)

// ---------------------------------------------------------------------------------------------
// Sprite art (canvas paths only). Ink outline under a colour fill, like the tags' icons.
// ---------------------------------------------------------------------------------------------
const INK_CSS = '#1d1330';

// A cartoon flame: a round belly at the bottom of the cell and tongues reaching up, given as
// [angle (deg from straight up, + = right), length (px from the belly's centre), width (deg)].
function flamePath(g, cx, cy, R, tongues, lean, scale = 1) {
  const pts = [];
  const N = 96;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * TAU; // 0 = up, clockwise
    let r = R * (th > Math.PI * 0.5 && th < Math.PI * 1.5 ? 1 - 0.1 * Math.sin(th - Math.PI * 0.5) : 1);
    for (const [a, len, w] of tongues) {
      let d = th - (a * Math.PI) / 180;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const wr = (w * Math.PI) / 180;
      r = Math.max(r, R + (len - R) * Math.pow(Math.max(0, 1 - Math.abs(d) / wr), 1.6));
    }
    r *= scale;
    let x = Math.sin(th) * r;
    const y = -Math.cos(th) * r;
    // the tips curl the way she leans: a shear growing with height
    const up = Math.max(0, -y) / (R * 2.4);
    x += lean * up * up * R;
    pts.push([cx + x, cy + y]);
  }
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    const a = pts[i % N];
    const b = pts[(i + 1) % N];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    if (i === 0) g.moveTo(mx, my);
    else g.quadraticCurveTo(a[0], a[1], mx, my);
  }
  g.closePath();
}
function drawFlame(g, tongues, lean) {
  const cx = 128;
  const cy = 186;
  const R = 56;
  g.lineJoin = 'round';
  flamePath(g, cx, cy, R, tongues, lean);
  g.lineWidth = 18;
  g.strokeStyle = INK_CSS;
  g.stroke();
  g.fillStyle = '#ff6a1a';
  g.fill();
  // the yellow heart (the same shape, smaller, sitting low) and a pale core
  flamePath(g, cx, cy + 16, R * 0.62, tongues.map(([a, len, w]) => [a * 0.8, len * 0.58, w]), lean * 0.8);
  g.fillStyle = '#ffc93c';
  g.fill();
  flamePath(g, cx, cy + 30, R * 0.34, [[0, 70, 40]], lean * 0.5);
  g.fillStyle = '#fff2a8';
  g.fill();
}
function drawSnowflake(g) {
  const cx = 128;
  const cy = 128;
  const arms = () => {
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      const ux = Math.sin(a);
      const uy = -Math.cos(a);
      g.moveTo(cx, cy);
      g.lineTo(cx + ux * 92, cy + uy * 92);
      // two little branches on each arm
      for (const [at, len] of [[48, 30], [72, 20]]) {
        for (const s of [-1, 1]) {
          const b = a + s * 0.75;
          g.moveTo(cx + ux * at, cy + uy * at);
          g.lineTo(cx + ux * at + Math.sin(b) * len, cy + uy * at - Math.cos(b) * len);
        }
      }
    }
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  arms();
  g.strokeStyle = INK_CSS;
  g.lineWidth = 30;
  g.stroke();
  arms();
  g.strokeStyle = '#e9f8ff';
  g.lineWidth = 13;
  g.stroke();
  g.beginPath();
  g.arc(cx, cy, 16, 0, TAU);
  g.fillStyle = '#bfe8ff';
  g.fill();
}
// Stink lines: the cartoon fan of three wavy lines rising (and spreading) from a stink.
function drawStinkLine(g, ph) {
  const path = () => {
    g.beginPath();
    for (const [x0, spread, top, p2] of [[128, 0, 26, 0], [84, -30, 64, 1.9], [172, 30, 64, 3.6]]) {
      for (let y = 236; y >= top; y -= 4) {
        const k = (236 - y) / (236 - top);
        const x = x0 + spread * k + Math.sin(k * Math.PI * 2.2 + ph + p2) * (10 + 9 * k);
        if (y === 236) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
    }
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  path();
  g.strokeStyle = INK_CSS;
  g.lineWidth = 26;
  g.stroke();
  path();
  g.strokeStyle = '#c6f27a';
  g.lineWidth = 11;
  g.stroke();
}
function drawFly(g, up) {
  const cx = 128;
  const cy = 140;
  // wings: two pale ovals, up or down (a wing beat), ink-rimmed
  for (const s of [-1, 1]) {
    g.save();
    g.translate(cx + s * 30, cy - 18);
    g.rotate(s * (up ? -0.9 : -0.25));
    g.beginPath();
    g.ellipse(s * 0, -40, 30, 50, 0, 0, TAU);
    g.fillStyle = '#e8f6ff';
    g.fill();
    g.lineWidth = 12;
    g.strokeStyle = INK_CSS;
    g.stroke();
    g.restore();
  }
  // body and head
  g.beginPath();
  g.ellipse(cx, cy + 14, 44, 54, 0, 0, TAU);
  g.fillStyle = '#2a2433';
  g.fill();
  g.lineWidth = 12;
  g.strokeStyle = INK_CSS;
  g.stroke();
  g.beginPath();
  g.arc(cx, cy - 40, 30, 0, TAU);
  g.fillStyle = '#2a2433';
  g.fill();
  g.stroke();
  // big red eyes and a glint, so it reads as a fly even when small
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(cx + s * 17, cy - 46, 13, 0, TAU);
    g.fillStyle = '#e63946';
    g.fill();
  }
  g.beginPath();
  g.ellipse(cx - 14, cy + 2, 10, 18, -0.4, 0, TAU);
  g.fillStyle = 'rgba(160, 190, 255, 0.55)';
  g.fill();
}
// A stink swirl: a fat curl of dark green with an ink line, to sit on the cloud.
function drawSwirl(g) {
  const path = () => {
    g.beginPath();
    for (let i = 0; i <= 80; i++) {
      const k = i / 80;
      const a = k * Math.PI * 3.3;
      const r = 10 + 82 * k;
      const x = 128 + Math.cos(a) * r;
      const y = 128 + Math.sin(a) * r * 0.82;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  path();
  g.strokeStyle = INK_CSS;
  g.lineWidth = 42;
  g.stroke();
  path();
  g.strokeStyle = '#5a8f2e';
  g.lineWidth = 22;
  g.stroke();
}
// A scorch on a sail's edge: a ragged sooty patch with a glowing rim of embers.
function drawChar(g) {
  const cx = 128;
  const cy = 150;
  // a ragged burnt edge: flat along the sail's foot, with a jagged top
  const path = (R, wob) => {
    g.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * TAU;
      const top = Math.sin(a) < 0;
      const r = R * (1 + (top ? wob : wob * 0.3) * (Math.sin(a * 7 + 0.7) + 0.6 * Math.sin(a * 13 + 2.1)));
      const x = cx + Math.cos(a) * r * 1.15;
      const y = cy + Math.sin(a) * r * (top ? 0.62 : 0.4);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
  };
  path(100, 0.2);
  g.fillStyle = INK_CSS;
  g.fill();
  path(88, 0.2);
  g.fillStyle = '#3a2a26';
  g.fill();
  path(58, 0.24);
  g.fillStyle = '#211613';
  g.fill();
  // glowing ember specks along the burnt edge
  for (const [x, y, r] of [[-62, -22, 9], [-18, -40, 7], [30, -30, 9], [70, -12, 7], [6, -8, 6]]) {
    g.beginPath();
    g.arc(cx + x, cy + y, r, 0, TAU);
    g.fillStyle = '#ff8a2a';
    g.fill();
  }
}
function drawAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = CELL * COLS;
  canvas.height = CELL * ROWS;
  const g = canvas.getContext('2d');
  const cell = (i, fn) => {
    g.save();
    g.translate((i % COLS) * CELL, Math.floor(i / COLS) * CELL);
    g.scale(CELL / 256, CELL / 256);
    fn(g);
    g.restore();
  };
  // three flame shapes (the flicker changes shape, never brightness)
  cell(0, (c) => drawFlame(c, [[0, 176, 34], [-38, 118, 26], [40, 128, 24]], -0.25));
  cell(1, (c) => drawFlame(c, [[8, 168, 30], [-30, 132, 26], [46, 104, 24]], 0.3));
  cell(2, (c) => drawFlame(c, [[-6, 160, 30], [-46, 104, 24], [30, 140, 26], [62, 88, 20]], -0.05));
  cell(3, drawSnowflake);
  cell(4, (c) => drawStinkLine(c, 0));
  cell(5, (c) => drawStinkLine(c, Math.PI));
  cell(6, (c) => drawFly(c, true));
  cell(7, (c) => drawFly(c, false));
  cell(8, drawSwirl);
  cell(9, drawChar);
  return canvas;
}

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------
// A lumpy ball for the stink cloud (and a fatter copy for its ink line), smooth and closed.
function puffGeometry(grow) {
  let g = new THREE.SphereGeometry(0.5, 14, 10);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const bump = 1 + 0.045 * Math.sin(v.x * 4.1 + 1.3) * Math.sin(v.z * 3.3 + 0.4) + 0.03 * Math.sin(v.y * 5.2 + v.x * 2.1);
    v.multiplyScalar(0.5 * bump);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  if (grow > 0) {
    const n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * grow, p.getY(i) + n.getY(i) * grow, p.getZ(i) + n.getZ(i) * grow);
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
// Anchors made from a ship's size when her model has none (ship-local: +x = port, bow = +z)
// ---------------------------------------------------------------------------------------------
function madeAnchors(ship) {
  const len = num(ship.type && ship.type.len, 10);
  const wid = num(ship.type && ship.type.wid, 3);
  const u = (ship.mesh && ship.mesh.userData) || {};
  const deckY = num(u.deckY, 1.3);
  const railY = num(u.railY, deckY + 0.4);
  const rail = [];
  for (const side of [1, -1]) {
    for (let i = 0; i < 8; i++) rail.push({ x: side * wid * 0.46, y: railY - 0.1, z: -len * 0.3 + (len * 0.6 * (i + 0.5)) / 8 });
  }
  return { rail, deck: { x: 0, y: deckY, z: 0 }, holes: [] };
}
// Her half-width at local z (from userData.hullSide), or half her beam.
function halfAt(ship, z) {
  const hs = ship.mesh && ship.mesh.userData && ship.mesh.userData.hullSide;
  if (hs && Array.isArray(hs.half) && hs.half.length && num(hs.dz, 0) > 0) {
    const i = clamp(Math.round((z - num(hs.z0, 0)) / hs.dz), 0, hs.half.length - 1);
    const h = num(hs.half[i], NaN);
    if (h > 0.2) return h;
  }
  return num(ship.type && ship.type.wid, 3) * 0.5;
}

const _m = new THREE.Matrix4();
const _M = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _w = new THREE.Vector3();
const ICE = [0xdff4ff, 0xc4e9ff, 0xf4fbff, 0xb4e0fb].map((h) => new THREE.Color(h));
const PLATE = [0xd6f1ff, 0xc0e6ff, 0xf6fcff].map((h) => new THREE.Color(h)); // floes a little blue (ice, not paper); [2] the rail snow
const LIME = new THREE.Color(0x8bc34a);
const LIME_HI = new THREE.Color(0xa6d85e);

export function createStatusFx(scene, { reducedMotion = false, seaY = null } = {}) {
  const rm = typeof reducedMotion === 'function' ? () => !!reducedMotion() : () => !!reducedMotion;
  const sea = typeof seaY === 'function' ? seaY : null;
  const hasDom = typeof document !== 'undefined';
  let disposed = false;
  let shipSeq = 0;
  const states = new WeakMap(); // ship -> { seed, k: { fire, frost, stink }, made }

  // ---- the sprites: camera-facing cut-outs (flames, snowflakes, stink lines, flies) from one atlas
  const atlas = hasDom ? new THREE.CanvasTexture(drawAtlas()) : null;
  if (atlas) {
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.anisotropy = 4;
  }
  const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0); // origin at the bottom centre
  const cellAttr = new THREE.InstancedBufferAttribute(new Float32Array(CAP.sprites), 1);
  cellAttr.setUsage(THREE.DynamicDrawUsage);
  quad.setAttribute('aCell', cellAttr);
  const spriteMat = noOutline(new THREE.MeshBasicMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide }));
  // Each instance: its anchor (world) in the matrix's translation, its size and tilt on screen in the upper
  // 2 × 2 (view plane), a nudge toward the camera in [2][2] (so a flame stands clear of her own hull), and its
  // atlas cell in aCell.
  spriteMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCell;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        vMapUv = vec2((mod(aCell, ${COLS}.0) + uv.x) / ${COLS}.0, 1.0 - (floor(aCell / ${COLS}.0) + 1.0 - uv.y) / ${ROWS}.0);`,
      )
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
        mvPosition.xy += mat2(instanceMatrix[0].xy, instanceMatrix[1].xy) * position.xy;
        mvPosition.z += instanceMatrix[2].z;
        gl_Position = projectionMatrix * mvPosition;`,
      );
  };
  spriteMat.customProgramCacheKey = () => 'statusfx-sprites';
  const sprites = new THREE.InstancedMesh(quad, spriteMat, CAP.sprites);
  sprites.name = 'statusfx-sprites';

  // ---- ice: icicles (cones hanging point down from y 0 to y -1) and plates (flat slabs)
  const icicleGeo = new THREE.ConeGeometry(0.16, 1, 6, 1).rotateX(Math.PI).translate(0, -0.5, 0);
  const plateGeo = new THREE.CylinderGeometry(0.5, 0.56, 0.16, 7, 1);
  const iceMat = noOutline(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(3), emissive: 0x2d6f99, emissiveIntensity: 0.32 }));
  const icicles = new THREE.InstancedMesh(icicleGeo, iceMat, CAP.icicles);
  icicles.name = 'statusfx-icicles';
  const plates = new THREE.InstancedMesh(plateGeo, iceMat, CAP.plates);
  plates.name = 'statusfx-plates';

  // ---- the stink cloud: toon lumps and their ink twin (inverted hull)
  const puffGeo = puffGeometry(0);
  const puffInkGeo = puffGeometry(0.075);
  const puffMat = noOutline(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(2), emissive: 0x2a3d12 }));
  const inkMat = noOutline(new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(INK[0], INK[1], INK[2]), side: THREE.BackSide }));
  const puffs = new THREE.InstancedMesh(puffGeo, puffMat, CAP.puffs);
  puffs.name = 'statusfx-puffs';
  const puffInk = new THREE.InstancedMesh(puffInkGeo, inkMat, CAP.puffs);
  puffInk.name = 'statusfx-puffs-ink';

  const meshes = [sprites, icicles, plates, puffs, puffInk];
  for (const m of meshes) {
    m.frustumCulled = false; // instances move every frame: the bounds would always be stale
    m.count = 0; // nothing to draw yet (a mesh with count 0 costs no draw call)
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.userData.keep = true;
    m.renderOrder = 0;
    scene.add(m);
  }
  for (const m of [icicles, plates, puffs]) {
    m.setColorAt(0, ICE[0]); // creates instanceColor
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }

  // this frame's counts
  const n = { sprites: 0, icicles: 0, plates: 0, puffs: 0 };
  const seen = { flames: 0, flakes: 0, lines: 0, flies: 0, swirls: 0, chars: 0 };

  function stateOf(ship) {
    let st = states.get(ship);
    if (!st) {
      st = { seed: ++shipSeq * 7.31, k: { fire: 0, frost: 0, stink: 0 }, made: null, railOf: null, sides: null, sailsOf: null, sailPts: null };
      states.set(ship, st);
    }
    return st;
  }
  function anchors(ship, st) {
    const A = ship.mesh.userData && ship.mesh.userData.statusAnchors;
    if (A && Array.isArray(A.rail) && A.rail.length && A.deck) return A;
    if (!st.made) st.made = madeAnchors(ship);
    return st.made;
  }

  // a sprite: anchored at local point (x, y, z) of the ship (matrix M), w × h on screen, tilted by `a`
  function sprite(M, x, y, z, w, h, a, cell, bias, kind) {
    if (n.sprites >= CAP.sprites || !(w > 0.002 && h > 0.002)) return;
    const i = n.sprites++;
    seen[kind]++;
    _w.set(x, y, z).applyMatrix4(M);
    const e = sprites.instanceMatrix.array;
    const o = i * 16;
    const c = Math.cos(a);
    const s = Math.sin(a);
    e[o] = w * c;
    e[o + 1] = w * s;
    e[o + 2] = 0;
    e[o + 3] = 0;
    e[o + 4] = -h * s;
    e[o + 5] = h * c;
    e[o + 6] = 0;
    e[o + 7] = 0;
    e[o + 8] = 0;
    e[o + 9] = 0;
    e[o + 10] = bias;
    e[o + 11] = 0;
    e[o + 12] = _w.x;
    e[o + 13] = _w.y;
    e[o + 14] = _w.z;
    e[o + 15] = 1;
    cellAttr.array[i] = cell;
  }
  // a 3D instance: local transform composed, then the ship's matrix
  function put(mesh, key, M, color) {
    if (n[key] >= CAP[key]) return -1;
    const i = n[key]++;
    _m.compose(_p, _q, _s).premultiply(M);
    _m.toArray(mesh.instanceMatrix.array, i * 16);
    if (color) color.toArray(mesh.instanceColor.array, i * 3);
    return i;
  }

  // ---- fire: three tongues from each of her two newest holes
  function drawFire(ship, st, M, A, sc, k, t, still) {
    const holes = Array.isArray(A.holes) ? A.holes : [];
    const spots = [];
    for (let i = 0; i < holes.length && spots.length < 2; i++) {
      const h = holes[i];
      if (h && Number.isFinite(h.x) && Number.isFinite(h.y) && Number.isFinite(h.z)) spots.push(h);
    }
    // no holes yet (a burn from a ball that left none): her deck, then a rail
    if (spots.length < 2) spots.push({ ...A.deck, deck: true });
    if (spots.length < 2 && A.rail.length) spots.push(A.rail[Math.floor(A.rail.length * 0.3)]);
    for (let j = 0; j < 2; j++) {
      const h = spots[j];
      const out = h.deck ? 0 : Math.sign(h.x) || (num(h.side, 1) > 0 ? -1 : 1); // +x = port
      const bx = h.x + out * 0.3 * sc;
      const by = h.y - (h.deck ? 0.1 : 0.32 * sc);
      for (let i = 0; i < PER.flames; i++) {
        const ph = st.seed + j * 3.7 + i * 1.9;
        const big = i === 0;
        const dz = big ? 0 : (i === 1 ? -0.5 : 0.5) * sc;
        let fh = (big ? 3.4 : 2.1 + 0.15 * i) * sc;
        let fw = (big ? 2.2 : 1.45) * sc;
        let lean = i === 1 ? -0.12 : i === 2 ? 0.12 : 0;
        let cell = C.flame + ((i + j) % 3);
        if (!still) {
          // shape flicker only: stretch, squash, a sway and a new outline a few times a second
          const f = Math.sin(t * 11 + ph) * 0.5 + Math.sin(t * 17.3 + ph * 1.7) * 0.5;
          fh *= 1 + 0.12 * f;
          fw *= 1 - 0.05 * f;
          lean += 0.07 * Math.sin(t * 5.3 + ph);
          cell = C.flame + ((Math.floor(t * 4.5 + ph * 0.37) % 3) + 3) % 3;
        }
        // (the big tongue behind the two small ones: drawn last, nudged least)
        sprite(M, bx, by, h.z + dz, fw * k, fh * k, lean, cell, (big ? 0.5 : 0.62) * sc, 'flames');
      }
    }
  }

  // Where her two biggest sails' bottom edges are (ship-local): their corners and middles, worked out once.
  const _inv = new THREE.Matrix4();
  const _rel = new THREE.Matrix4();
  const _v = new THREE.Vector3();
  function sailEdges(ship, st) {
    if (st.sailsOf === ship.mesh) return st.sailPts;
    st.sailsOf = ship.mesh;
    st.sailPts = [];
    const info = ship.mesh.userData && ship.mesh.userData.sailInfo;
    if (!Array.isArray(info)) return st.sailPts;
    ship.mesh.updateWorldMatrix(true, true);
    _inv.copy(ship.mesh.matrixWorld).invert();
    const found = [];
    for (const it of info) {
      const m = it && it.mesh;
      if (!m || !m.isMesh || !m.geometry || !m.geometry.attributes.position) continue;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox;
      _rel.multiplyMatrices(_inv, m.matrixWorld);
      const cs = [];
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) cs.push(_v.set(x, y, z).applyMatrix4(_rel).clone());
      const lo = Math.min(...cs.map((c) => c.y));
      const hi = Math.max(...cs.map((c) => c.y));
      const bottom = cs.filter((c) => c.y < lo + (hi - lo) * 0.2);
      let a = bottom[0];
      let bb = bottom[0];
      let best = -1;
      for (const p of bottom) for (const q of bottom) {
        const d = Math.hypot(p.x - q.x, p.z - q.z);
        if (d > best) {
          best = d;
          a = p;
          bb = q;
        }
      }
      if (!a || best < 0.5) continue;
      // (the corners' patches a little in from the clew and tack, so they sit on the cloth, not off it)
      found.push({ area: best * (hi - lo), mesh: m, pts: [a.clone().lerp(bb, 0.16), bb.clone().lerp(a, 0.16), a.clone().lerp(bb, 0.5)] });
    }
    found.sort((p, q) => q.area - p.area);
    for (const f of found.slice(0, 2)) for (const p of f.pts) st.sailPts.push({ x: p.x, y: p.y, z: p.z, mesh: f.mesh });
    return st.sailPts;
  }
  function drawChar(ship, st, M, sc, k) {
    const pts = sailEdges(ship, st);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.mesh.visible === false) continue;
      // a sooty patch over the sail's foot (the art's middle, 0.41 of its height, on the edge), bigger at the
      // corners where the flames reach first
      const s = (i % 3 === 2 ? 1.2 : 1.45) * sc * k;
      const h = s * 0.9;
      sprite(M, p.x, p.y - h * 0.41, p.z, s * 1.45, h, (i % 2 ? 0.12 : -0.1), C.char, 0.25 * sc, 'chars');
    }
  }

  // ---- frost: an icicle fringe and snow caps along both rails, plates round the hull, flakes drifting off
  function sides(A, st) {
    // the rail points split by side (sign of x), bow to stern: cached per anchor set
    if (st.railOf === A.rail && st.sides) return st.sides;
    const port = A.rail.filter((r) => r.x >= 0).sort((a, b) => b.z - a.z);
    const star = A.rail.filter((r) => r.x < 0).sort((a, b) => b.z - a.z);
    st.railOf = A.rail;
    st.sides = [port, star].filter((l) => l.length);
    return st.sides;
  }
  const _r = { x: 0, y: 0, z: 0 };
  function along(list, u) {
    // a point at fraction u (0..1) along a rail list, between its points
    if (list.length === 1) return list[0];
    const f = clamp(u, 0, 1) * (list.length - 1);
    const i = Math.min(list.length - 2, Math.floor(f));
    const w = f - i;
    const a = list[i];
    const b = list[i + 1];
    _r.x = a.x + (b.x - a.x) * w;
    _r.y = a.y + (b.y - a.y) * w;
    _r.z = a.z + (b.z - a.z) * w;
    return _r;
  }
  function drawFrost(ship, st, M, A, sc, k, t, still) {
    const S = sides(A, st);
    const per = Math.floor(PER.icicles / Math.max(1, S.length));
    for (let si = 0; si < S.length; si++) {
      for (let i = 0; i < per; i++) {
        const r = along(S[si], (i + 0.5) / per);
        const out = Math.sign(r.x) || 1;
        const h1 = hash(st.seed + si * 31 + i * 1.37);
        // a jagged fringe: long and short in turn, never the same twice
        const len = ((i % 2 ? 0.5 : 0.95) + 0.55 * h1) * sc * k;
        const thick = (i % 2 ? 0.8 : 1.15 + 0.4 * hash(st.seed + i * 2.11)) * sc * Math.max(0.4, k);
        _p.set(r.x + out * 0.05 * sc, r.y + 0.02, r.z);
        _q.setFromEuler(_e.set(0, h1 * TAU, out * 0.1));
        _s.set(thick, len, thick);
        put(icicles, 'icicles', M, ICE[(i + si) % ICE.length]);
      }
      // snow caps: white drifts on top of the rail
      const caps = Math.floor(PER.caps / Math.max(1, S.length));
      for (let i = 0; i < caps; i++) {
        const r = along(S[si], (i + 0.5) / caps);
        const h1 = hash(st.seed + si * 17 + i * 4.9);
        const w = (0.62 + 0.25 * h1) * sc * k;
        _p.set(r.x * 0.97, r.y + 0.06 * sc, r.z);
        _q.setFromEuler(_e.set(0, h1 * 2, 0));
        _s.set(w * 0.55, 0.9 * Math.max(0.3, k), w * 1.5);
        put(plates, 'plates', M, PLATE[2]);
      }
    }
    const sink = ship.mesh.userData && ship.mesh.userData.damageLevel === 2 ? 0.15 : 0;
    const len = num(ship.type && ship.type.len, 10);
    for (let i = 0; i < PER.plates; i++) {
      const side = i < PER.plates / 2 ? 1 : -1;
      const h1 = hash(st.seed + i * 3.3);
      const z = (-0.32 + 0.32 * (i % 3)) * len + (h1 - 0.5) * 1.2;
      const w = (1.6 + 0.9 * h1) * sc * k;
      const x = side * (halfAt(ship, z) + (0.55 + 0.5 * hash(st.seed + i * 5.1)) * sc + w * 0.45);
      const bob = still ? 0 : 0.06 * Math.sin(t * 1.9 + st.seed + i * 1.3);
      const tilt = still ? 0 : 0.07 * Math.sin(t * 1.4 + i * 2.1 + st.seed);
      _p.set(x, 0.04 + sink + bob, z);
      _q.setFromEuler(_e.set(tilt, h1 * TAU + (still ? 0 : 0.12 * Math.sin(t * 0.6 + i)), -tilt * 0.7));
      _s.set(w, 1, w * (0.7 + 0.35 * hash(st.seed + i * 7.7)));
      const pi = put(plates, 'plates', M, PLATE[i % 2]);
      if (pi >= 0 && sea) {
        // afloat on the sea where it is (not on her own waterline: the waves rise and fall across a floe)
        const e = plates.instanceMatrix.array;
        const y = Number(sea(e[pi * 16 + 12], e[pi * 16 + 14], t));
        if (Number.isFinite(y)) e[pi * 16 + 13] = y + 0.06 + bob;
      }
    }
    const all = A.rail;
    for (let i = 0; i < PER.flakes; i++) {
      const r = all[Math.floor(((i + 0.5) * all.length) / PER.flakes) % all.length];
      const out = Math.sign(r.x) || 1;
      const q = still ? 0.3 + 0.12 * i : frac(t * 0.4 + i / PER.flakes + st.seed * 0.1);
      const size = 1.0 * sc * k * (still ? 1 : 1 - 0.6 * q * q);
      const a = still ? i * 0.5 : t * 0.9 + i * 1.7;
      sprite(M, r.x + out * (0.35 + 1.1 * q) * sc, r.y + (0.3 + 1.8 * q) * sc - size / 2, r.z + (hash(i + st.seed) - 0.5) * 0.8, size, size, a, C.snow, 0.3 * sc, 'flakes');
    }
  }

  // ---- stink: a cloud on her deck, lines rising out of it, two flies
  function drawStink(ship, st, M, A, sc, k, t, still) {
    const d = A.deck;
    const wid = num(ship.type && ship.type.wid, 3);
    const len = num(ship.type && ship.type.len, 10);
    const R = clamp(wid * 0.36, 0.9, 2.2);
    const L = clamp(len * 0.2, 1.2, 3.4);
    const swirl = still ? 0.4 : t * 0.45;
    const base = d.y + 1.05 * sc; // above her bulwarks
    const top = base + 1.35 * sc;
    if (!ship.tagHidden) {
      for (let i = 0; i < PER.puffs; i++) {
        const ring = i < 7;
        const a = ring ? (i / 7) * TAU + swirl : ((i - 7) / 3) * TAU - swirl * 1.3 + 0.5;
        const rr = ring ? 0.85 : 0.3;
        const breathe = still ? 1 : 1 + 0.07 * Math.sin(t * 1.7 + i * 1.9 + st.seed);
        const size = (ring ? 1.75 + 0.35 * hash(st.seed + i) : 1.65) * sc * breathe * k;
        _p.set(d.x + Math.cos(a) * R * rr, base + (ring ? 0.18 * Math.sin(a * 2 + 1) : 0.85) * sc, d.z + Math.sin(a) * L * rr);
        _q.setFromEuler(_e.set(0.3 * i, a, 0.2 * i));
        _s.set(size, size * 0.86, size);
        const col = i === 2 || i === 5 || i === 8 ? LIME_HI : LIME;
        if (put(puffs, 'puffs', M, col) >= 0) {
          n.puffs--;
          put(puffInk, 'puffs', M, null);
        }
        // dark green swirls curling on the three top puffs (above her bulwarks), on the side facing you
        if (!ring) {
          const sw = 0.62 * size;
          sprite(M, _p.x, _p.y - sw / 2, _p.z, sw, sw, still ? i : -t * 1.6 + i, C.swirl, size * 0.56 + 0.12, 'swirls');
        }
      }
    }
    for (let i = 0; i < PER.lines; i++) {
      const b = (i / PER.lines) * TAU + 0.4 + (still ? 0 : swirl * 0.3);
      const q = still ? 0.3 : frac(t * 0.55 + i / PER.lines + st.seed * 0.13);
      const h = 2.1 * sc * k * (still ? 1 : 1 - 0.5 * smooth(q));
      const w = 1.1 * sc * k * (still ? 1 : 1 - 0.35 * q);
      const cell = C.line + (still ? 0 : ((Math.floor(t * 3 + i) % 2) + 2) % 2);
      sprite(M, d.x + Math.cos(b) * R * 0.6, top + 0.45 * sc + q * 1.6 * sc, d.z + Math.sin(b) * L * 0.5, w, h, still ? 0 : 0.08 * Math.sin(t * 2 + i), cell, 0.2 * sc, 'lines');
    }
    for (let i = 0; i < PER.flies; i++) {
      let x = d.x + (i ? -1 : 1) * R * 0.8;
      let y = top + 0.9 * sc;
      let z = d.z + (i ? 0.4 : -0.4) * L;
      let cell = C.fly;
      if (!still) {
        const c = t * (2.3 + 0.5 * i) + i * Math.PI + st.seed;
        x = d.x + Math.cos(c) * R * 1.05 + 0.25 * Math.sin(t * 7.3 + i * 4) * sc;
        y = top + (0.75 + 0.4 * Math.sin(t * 4.1 + i * 2)) * sc;
        z = d.z + Math.sin(c * 1.4) * L * 0.8 + 0.22 * Math.cos(t * 6.1 + i) * sc;
        cell = C.fly + (Math.floor(t * 12 + i * 0.5) % 2);
      }
      const size = 0.62 * sc * k;
      sprite(M, x, y - size / 2, z, size, size, still ? 0 : 0.25 * Math.sin(t * 3 + i), cell, 0.3 * sc, 'flies');
    }
  }

  function flush() {
    sprites.count = n.sprites;
    icicles.count = n.icicles;
    plates.count = n.plates;
    puffs.count = n.puffs;
    puffInk.count = n.puffs;
    for (const m of meshes) {
      if (!m.count) continue;
      m.instanceMatrix.clearUpdateRanges();
      m.instanceMatrix.addUpdateRange(0, m.count * 16);
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) {
        m.instanceColor.clearUpdateRanges();
        m.instanceColor.addUpdateRange(0, m.count * 3);
        m.instanceColor.needsUpdate = true;
      }
    }
    if (n.sprites) {
      cellAttr.clearUpdateRanges();
      cellAttr.addUpdateRange(0, n.sprites);
      cellAttr.needsUpdate = true;
    }
  }

  const api = {
    sync(ships, t = 0, dt = 0) {
      if (disposed) return;
      const still = rm();
      const step = Math.max(0, num(dt, 0));
      const time = num(t, 0);
      n.sprites = n.icicles = n.plates = n.puffs = 0;
      seen.flames = seen.flakes = seen.lines = seen.flies = seen.swirls = seen.chars = 0;
      for (const ship of ships || []) {
        if (!ship || typeof ship !== 'object' || !ship.mesh || !ship.mesh.isObject3D) continue;
        const st = stateOf(ship);
        const s0 = ship.status;
        const id = s0 && typeof s0 === 'object' && STATUS_IDS.includes(s0.id) ? s0.id : null;
        const live = num(ship.hp, 1) > 0 && !(ship.sinking > 0) && !ship.captured && !ship.escaped && ship.mesh.visible !== false;
        let any = false;
        for (const kind of STATUS_IDS) {
          const want = live && id === kind ? 1 : 0;
          const k = st.k[kind];
          st.k[kind] = still ? want : want > k ? Math.min(want, k + step / FADE_IN) : Math.max(want, k - step / FADE_OUT);
          if (st.k[kind] > 0.01) any = true;
        }
        if (!any) continue;
        ship.mesh.updateWorldMatrix(true, false);
        _M.copy(ship.mesh.matrixWorld);
        const A = anchors(ship, st);
        const sc = clamp(num(ship.type && ship.type.len, 10) / 11, 0.85, 1.4);
        const ease = (k) => (still ? k : smooth(k));
        if (st.k.fire > 0.01) {
          drawFire(ship, st, _M, A, sc, ease(st.k.fire), time, still);
          drawChar(ship, st, _M, sc, ease(st.k.fire));
        }
        if (st.k.frost > 0.01) drawFrost(ship, st, _M, A, sc, ease(st.k.frost), time, still);
        if (st.k.stink > 0.01) drawStink(ship, st, _M, A, sc, ease(st.k.stink), time, still);
      }
      flush();
    },

    clear(ship) {
      if (ship && typeof ship === 'object') states.delete(ship);
    },

    // Test hook: what was drawn at the last sync (instances by kind) and the draw calls it costs.
    read() {
      return {
        calls: meshes.filter((m) => m.count > 0).length,
        flames: seen.flames,
        flakes: seen.flakes,
        lines: seen.lines,
        flies: seen.flies,
        swirls: seen.swirls,
        chars: seen.chars,
        icicles: icicles.count,
        plates: plates.count,
        puffs: puffs.count,
      };
    },

    get meshes() {
      return meshes.slice();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      for (const m of meshes) {
        scene.remove(m);
        m.dispose();
      }
      for (const x of [quad, icicleGeo, plateGeo, puffGeo, puffInkGeo, spriteMat, iceMat, puffMat, inkMat]) x.dispose();
      if (atlas) atlas.dispose();
    },
  };
  return api;
}
