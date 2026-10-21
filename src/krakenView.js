import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { gradientMap, setOutline, noOutline, ensureIndex } from './style.js';
import { waveHeight } from './scenery.js';

// The Kraken's model (SPEC3 §5.7.2): what kraken.js's visuals() say, drawn.
//   body       ONE rigidly skinned SkinnedMesh (people.js's technique, which the outline pass inks; 3 material
//              groups: bold ink, thin ink, no ink): a huge plum mantle (0x4a2f6e, belly 0x7a4f86) with pink
//              spots, barnacles and an old figurehead stuck on its crown, curled tentacle roots at the
//              waterline, a sulky mouth, cross brows over two big eyes, eyelids that blink (only one eye opens
//              at the rise) and pupils that follow you. Bones: root, mantle, brows, lids, pupils, figurehead.
//   eyes       amber eyeballs (one mesh on the mantle bone, noOutline) whose glow eases on and off, never
//              faster than once a second (SPEC3 §15)
//   tentacles  up to four thick tapered tentacles with pink suckers and curled tips: ONE SkinnedMesh with a
//              chain of 12 smoothly weighted bones each (rise, slam, sway, grab, recoil, sink)
//   shadow     a dark violet blob under the water with two dim yellow eyes (a decal that follows the waves)
//   bubbles    its bubble trail, the boil of the rise, bubbles in the warning rings (one InstancedMesh)
//   rings      the violet dashed foam warning rings (a red rim on a grab ring; an ink blob's ring is dark violet
//              with ink bubbling in it, and the blob itself arcs over from where it was spat to land as the
//              warning runs out) and the foam collars where tentacles and head break the water (one
//              InstancedMesh) and the rings' growing fills (one)
//   pearl      the Kraken's Pearl when it is driven off (SPEC3 §5.7.1): a glowing pearl in a giant open clam
//              shell bobbing on the waves (the shell inked, the pearl noOutline, its glow easing at ≤ 0.5 Hz)
// Draw calls: body ≤ 5 (two inked groups twice + one), eyes 1, tentacles ≤ 5, shadow 1, bubbles 1,
// rings 1, fills 1, pearl 3 (only after the fight) = at most 18 (SPEC3 §14 budget: ≤ 30). A part with
// nothing to show is hidden.
//
// createKrakenView(scene, { reducedMotion, foamColor, seaY, rings }) → {
//   prepare() → boolean,       // one step a call, one call a frame (during the fly-in: no frame stalls): six
//                              //   calls build the parts, the seventh shows them all for one frame deep under
//                              //   the sea (out of sight: ≤ 18 draw calls that frame) so their shaders compile
//                              //   then and not when it rises, and the first call after a frame has drawn
//                              //   them hides them again and returns true (ready). Called in a loop with no
//                              //   frame drawn, it skips the warm-up and is ready by the tenth call.
//   get ready,
//   update(visuals, t, dt),    // per frame: draws kraken.visuals() (t: visual time, dt: 0 while paused);
//                              //   with nothing to show it leaves the building and warm-up to prepare(); if
//                              //   it has something to show before prepare() is done, it builds the rest at once
//   riseCamera(k, from?) → { pos, look } | null,   // the rise's camera at k (0..1) of the rise; from: the
//                              //   player's ship { x, z, h, duration } (else 40 u in front of the head; duration:
//                              //   the rise's length in s, default 6). null when there is no head to frame (or,
//                              //   under reduced motion, outside the 1.5 s cut to the eye in the middle of the
//                              //   rise). The vectors are reused: copy them.
//   statusShip(status) → ship,  // its special status drawn by statusfx.js like a ship's (an addition to SPEC3
//                              //   §11.1): main passes the result to statusfx.sync with the fleet. ship is one
//                              //   persistent ship-like object { mesh, status, type, hp } whose mesh (an empty
//                              //   group: no draw calls of its own) stands where the status shows: fire on the
//                              //   part that burns (visuals().burn.part: a tentacle, or the head and eye), else
//                              //   on the head while it is up, else on the shadow; with statusAnchors placed on
//                              //   that part (flames up a tentacle or on the mantle, icicles round the mantle,
//                              //   ice floes round it, the stink cloud on its crown). status: kraken.status
//                              //   ({ id, t, max }); with nothing to stand on its status reads id null, so
//                              //   statusfx lets the look fade.
//   read() → { ready, warming, head, tentacles, shadow, pearl, rings, fills, bubbles, inkBlobs, glow,
//              eyes: [openL, openR] },   // test hook (warming: the warm-up frame is up)
//   dispose()
// }
// reducedMotion: a boolean or a function returning one: no swirl, sway or bob, no camera glide (a cut).
// foamColor: the level's waterFoam (glowing cyan on the Deep) for foam and bubbles. seaY(x, z, t): the sea's
// height (main passes ocean.heightAt; default: scenery's waves at the Deep's amplitude). rings: false leaves
// the warning rings to the caller (the foam collars and bubbles stay).
//
// visuals (kraken.js §11.1; every field optional, junk ignored):
//   shadow: { x, z, h, k } | null           k 0..1 how dark (default 1)
//   head:   { x, z, h, k, hurt, sneeze } | null   h: the way it faces; k 0 = under, 1 = up (rising and sinking
//                                            ease it); hurt 0..1 (brows up), sneeze 0..1 (a squash)
//   eye:    { glow, open, one, look: { x, z } } | number   glow 0..1; open 0..1 (blinks are added); one: only
//                                            its left eye opens (the rise)
//   tentacles: [{ id, x, z, h, t, state, k, tx, tz }]   state 'warn' | 'rise' | 'slam' | 'sway' | 'grab' |
//                                            'recoil' | 'sink' (t: seconds in that state; k overrides how far
//                                            up); a grab with tx, tz (the hull it holds) stands beside it
//   rings:  [{ x, z, r, t, T, grab, kind, from }]   a warning: t of T seconds gone; grab: red-rimmed; kind
//                                            'ink': the ink blob's ring (from: { x, z }, where it was spat)
//   burn:   { part } | null                  the part on fire ('head' | 'eye' | a tentacle's id), for statusShip
//   boil:   { x, z, r, k } | null            the rise's ring of bubbles (else a boil round a rising head)
//   pearl:  { x, z, k, h } | null            the Kraken's Pearl: k 0 = under, 1 = afloat (it bobs up as k
//                                            grows); h: the way its shell opens (main passes the bearing to
//                                            the player's ship, so the chase camera sees the pearl; default:
//                                            slowly turning)

const PI = Math.PI;
const TAU = PI * 2;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (x) => {
  const k = clamp(x, 0, 1);
  return k * k * (3 - 2 * k);
};
const easeBack = (x) => {
  const k = clamp(x, 0, 1) - 1;
  return 1 + k * k * (2.4 * k + 1.4);
};
const frac = (x) => x - Math.floor(x);
const hash = (n) => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453);

// Colours
const COL = {
  mantle: 0x4a2f6e,
  belly: 0x7a4f86,
  spot: 0xe47bbd,
  sucker: 0xff9ec7,
  suckerIn: 0xc4558f,
  barnacle: 0xe9e2cf,
  barnacleHole: 0x4a4256,
  brow: 0x23123a,
  lid: 0x5d3c88,
  pupil: 0x1d1330,
  glint: 0xffffff,
  mouth: 0x2a1236,
  wood: 0x7a4a2b,
  woodDark: 0x5a3520,
  robe: 0xb5543c,
  skin: 0xe8c39e,
  gold: 0xe0a93a,
  eye: 0xffb72e,
  eyeGlow: 0xff8a00,
  ring: 0xc08cff,
  grab: 0xff3b3b,
  fill: 0x9b5cff,
  fillGrab: 0xff4a6a,
  inkRim: 0x7a3fc4, // the ink blob's ring: darker than a tentacle's, with ink (not foam) bubbling in it
  inkFill: 0x24103a,
  ink: 0x2b1442,
  inkGlint: 0x9d74d8,
};
const LINE = { thickness: 0.0058 }; // a big creature: hull-weight ink
// a little light of its own, so its plum reads on the Deep's moonlit night (the band shading stays)
const EMISSIVE = 0x2e1a4a;
const THIN_LINE = { thickness: 0.0034 };
const INKS = 0;
const THIN = 1;
const FLAT = 2;

// Sizes (world units): the head's hit sphere is r 6 at y 3, the eyes' r 2.5 between them at its front
// (kraken.js parts); the tentacles' capsules r 1.4 from y 0 to 9.
const HEAD_R = 6;
const HEAD_Y = 3;
const HEAD_TALL = 1.32;
const HEAD_SCALE = 1.1; // drawn a touch bigger than its hit sphere
const EYE = { x: 2.0, y: 3.7, z: 4.75, r: 1.75 };
const DIVE = 14.5; // how far under the head sits at k 0
const T_BONES = 12;
const T_Y0 = -2.6; // the tentacle's root, under the water
const T_LEN = 12.4;
const T_SEG = T_LEN / (T_BONES - 1);
const T_DIVE = 13; // how far under a tentacle sits at k 0
const MAX_T = 4;
const SHADOW_LIFT = 0.42; // the shadow decal rides this far over the waves (the sea mesh is coarser than its waves)
const CAP_BUBBLES = 112;
const CAP_RINGS = 16;
const GLOW_RATE = 2; // the glow moves at most this much a second ...
const GLOW_TURN = 0.6; // ... and turns round at most every 0.6 s: under 1 Hz (SPEC3 §15)
const RISE_T = 6; // s: the rise (SPEC3 §5.7.1), unless riseCamera is told its duration
const CUT_T = 1.5; // s: reduced motion's cut to the eye
const LID_OPEN = -1.05;
const LID_SHUT = 1.62;

// ---------------------------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------------------------
function strip(g) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  return g;
}
function placed(g, p, q, s) {
  const m = new THREE.Matrix4().compose(p || V3(), q || new THREE.Quaternion(), s || V3(1, 1, 1));
  return strip(g).applyMatrix4(m);
}
const qFromTo = (a, b) => new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize());
const UP = V3(0, 1, 0);
const FWD = V3(0, 0, 1);

// A tapered tube along `path` (Vector3[]), radius(u) at u (0..1 along it), closed with a rounded tip.
// Its frames are parallel-transported from `side0` (angle 0 points that way): returns the geometry and, per
// vertex, u (along) and the angle round the tube.
function taperTube(path, radius, radial, side0 = FWD) {
  const n = path.length;
  const T = [];
  for (let i = 0; i < n; i++) T.push(V3().subVectors(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]).normalize());
  const N = [];
  let nn = side0.clone().addScaledVector(T[0], -side0.dot(T[0])).normalize();
  for (let i = 0; i < n; i++) {
    nn = nn.clone().addScaledVector(T[i], -nn.dot(T[i])).normalize();
    N.push(nn);
  }
  const pos = [];
  const nor = [];
  const us = [];
  const as = [];
  const idx = [];
  const len = [0];
  for (let i = 1; i < n; i++) len.push(len[i - 1] + path[i].distanceTo(path[i - 1]));
  const total = len[n - 1] || 1;
  for (let i = 0; i < n; i++) {
    const u = len[i] / total;
    const r = radius(u);
    const B = V3().crossVectors(T[i], N[i]).normalize();
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const d = V3().copy(N[i]).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      pos.push(path[i].x + d.x * r, path[i].y + d.y * r, path[i].z + d.z * r);
      nor.push(d.x, d.y, d.z);
      us.push(u);
      as.push(a);
    }
  }
  const w = radial + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * w + j;
      const b = a + w;
      idx.push(a, a + 1, b, b, a + 1, b + 1); // (wound so the outside faces out)
    }
  }
  // the rounded tip
  const tip = path[n - 1].clone().addScaledVector(T[n - 1], radius(1) * 1.1);
  const ti = pos.length / 3;
  pos.push(tip.x, tip.y, tip.z);
  nor.push(T[n - 1].x, T[n - 1].y, T[n - 1].z);
  us.push(1);
  as.push(0);
  for (let j = 0; j < radial; j++) idx.push((n - 1) * w + j, (n - 1) * w + j + 1, ti);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return { geo: g, us, as };
}

// Paint, skin and merge parts: [{ geo (bind pose), slot, color: hex | (x, y, z, i) => hex, skin: (x, y, z, i)
// => [b0, b1, w1] }] → one geometry with a group per slot used, and the slots' order.
const _cc = new THREE.Color();
function bake(parts) {
  return mergeSlots(paint(parts));
}
// The painted, skinned parts by material slot (each indexed, ready to merge).
function paint(parts) {
  const bySlot = [[], [], []];
  for (const p of parts) {
    const g = p.geo;
    const P = g.attributes.position;
    const n = P.count;
    const col = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const x = P.getX(i);
      const y = P.getY(i);
      const z = P.getZ(i);
      _cc.setHex(typeof p.color === 'function' ? p.color(x, y, z, i) : p.color);
      col[i * 3] = _cc.r;
      col[i * 3 + 1] = _cc.g;
      col[i * 3 + 2] = _cc.b;
      const [b0, b1, w1] = p.skin(x, y, z, i);
      si[i * 4] = b0;
      si[i * 4 + 1] = b1;
      sw[i * 4] = 1 - w1;
      sw[i * 4 + 1] = w1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    ensureIndex(g);
    bySlot[p.slot].push(g);
  }
  return bySlot;
}
// One geometry from the parts by slot, with a group per slot used (in slot order).
function mergeSlots(bySlot) {
  const geos = [];
  const slots = [];
  for (let s = 0; s < 3; s++) {
    if (!bySlot[s].length) continue;
    geos.push(bySlot[s].length === 1 ? bySlot[s][0] : mergeGeometries(bySlot[s], false));
    slots.push(s);
    if (bySlot[s].length > 1) for (const g of bySlot[s]) g.dispose();
  }
  const geometry = mergeGeometries(geos, true);
  for (const g of geos) g.dispose();
  return { geometry, slots };
}

// The mantle's surface: the point at direction (lat, lon) (lon 0 = straight ahead, +x = its left) and the
// outward normal, in head space.
function mantlePoint(lat, lon) {
  const d = V3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
  const p = V3(d.x * HEAD_R, d.y * HEAD_R * HEAD_TALL + HEAD_Y, d.z * HEAD_R);
  p.z -= Math.max(0, p.y - HEAD_Y) * 0.12; // its crown leans back a little
  const nrm = V3(d.x / HEAD_R, d.y / (HEAD_R * HEAD_TALL), d.z / HEAD_R).normalize();
  return { p, n: nrm };
}

// ---------------------------------------------------------------------------------------------
// Textures (canvas)
// ---------------------------------------------------------------------------------------------
function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const cx = 128;
  const cy = 120;
  // tentacle wisps, then the body, then two dim eyes at the front (the bottom of the canvas)
  g.lineCap = 'round';
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + 0.2;
    g.beginPath();
    g.moveTo(cx, cy);
    for (let s = 1; s <= 10; s++) {
      const r = 18 + s * 10;
      const w = a + Math.sin(s * 0.7 + k) * 0.25;
      g.lineTo(cx + Math.cos(w) * r, cy + Math.sin(w) * r);
    }
    g.strokeStyle = 'rgba(30, 10, 52, 0.55)';
    g.lineWidth = 15;
    g.stroke();
  }
  const rg = g.createRadialGradient(cx, cy, 8, cx, cy, 92);
  rg.addColorStop(0, 'rgba(26, 8, 46, 0.92)');
  rg.addColorStop(0.6, 'rgba(36, 12, 64, 0.78)');
  rg.addColorStop(1, 'rgba(40, 14, 70, 0)');
  g.fillStyle = rg;
  g.beginPath();
  g.ellipse(cx, cy, 92, 82, 0, 0, TAU);
  g.fill();
  for (const s of [-1, 1]) {
    const ex = cx + s * 34;
    const ey = cy + 46;
    const eg = g.createRadialGradient(ex, ey, 2, ex, ey, 26);
    eg.addColorStop(0, 'rgba(255, 228, 120, 1)');
    eg.addColorStop(0.5, 'rgba(255, 196, 70, 0.85)');
    eg.addColorStop(1, 'rgba(255, 170, 40, 0)');
    g.fillStyle = eg;
    g.beginPath();
    g.ellipse(ex, ey, 26, 21, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(30, 10, 50, 0.9)';
    g.beginPath();
    g.ellipse(ex, ey + 2, 7, 10, 0, 0, TAU);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A dashed ring of radius 1 (inner 0.88): 26 dashes, for warning rings and foam collars.
function dashedRing() {
  const pos = [];
  const idx = [];
  const D = 26;
  const S = 4;
  for (let d = 0; d < D; d++) {
    const a0 = (d / D) * TAU;
    const a1 = a0 + (TAU / D) * 0.62;
    const base = pos.length / 3;
    for (let s = 0; s <= S; s++) {
      const a = lerp(a0, a1, s / S);
      pos.push(Math.cos(a) * 0.88, 0, Math.sin(a) * 0.88, Math.cos(a), 0, Math.sin(a));
    }
    for (let s = 0; s < S; s++) {
      const i = base + s * 2;
      idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------------------------
export function createKrakenView(scene, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const rm = typeof o.reducedMotion === 'function' ? () => !!o.reducedMotion() : () => !!o.reducedMotion;
  const foam = new THREE.Color(num(o.foamColor, 0x9ff7ff));
  const seaY = typeof o.seaY === 'function' ? o.seaY : (x, z, t) => waveHeight(x, z, t, 0.75);
  const sea = (x, z, t) => {
    const y = Number(seaY(x, z, t));
    return Number.isFinite(y) ? y : 0;
  };
  const drawRings = o.rings !== false;
  const hasDom = typeof document !== 'undefined';
  const root = new THREE.Group();
  root.name = 'kraken';
  scene.add(root);
  let disposed = false;
  let step = 0; // prepare() progress
  const STEPS = 6;
  const own = { geos: [], mats: [], texs: [], skels: [] };

  // the three shared vertex-colour toon materials (bold ink, thin ink, none)
  const mats = [];
  const makeMats = () => {
    if (mats.length) return;
    const make = (name, line) => {
      const m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap(3), emissive: EMISSIVE });
      m.name = name;
      return setOutline(m, line);
    };
    mats.push(make('kraken:ink', LINE), make('kraken:thin', THIN_LINE), make('kraken:flat', false));
    own.mats.push(...mats);
  };

  // ---- parts (null until built)
  let body = null; // { mesh, bones: { root, mantle, browL, browR, lidL, lidR, pupilL, pupilR, fig, mouth } }
  let eyes = null; // { mesh, mat }
  let tents = null; // { mesh, roots: Bone[4], chains: Bone[4][T_BONES] }
  let shadow = null; // { mesh, pos attribute, base positions }
  let fx = null; // { bubbles, rings, fills }
  let pearl = null; // { group, mat }

  function buildBody() {
    makeMats();
    const bones = {};
    const bone = (name, parent, x, y, z) => {
      const b = new THREE.Bone();
      b.name = `kraken-${name}`;
      b.position.set(x, y, z);
      if (parent) parent.add(b);
      bones[name] = b;
      return b;
    };
    const rootB = bone('root', null, 0, 0, 0);
    const mantle = bone('mantle', rootB, 0, 0, 0);
    bone('browL', mantle, EYE.x, EYE.y + 2.15, EYE.z + 0.35);
    bone('browR', mantle, -EYE.x, EYE.y + 2.15, EYE.z + 0.35);
    bone('lidL', mantle, EYE.x, EYE.y, EYE.z);
    bone('lidR', mantle, -EYE.x, EYE.y, EYE.z);
    bone('pupilL', mantle, EYE.x, EYE.y, EYE.z);
    bone('pupilR', mantle, -EYE.x, EYE.y, EYE.z);
    const figAt = mantlePoint(1.08, 0.62);
    bone('fig', mantle, figAt.p.x, figAt.p.y, figAt.p.z);
    bone('mouth', mantle, 0, 1.25, 5.62);
    const order = ['root', 'mantle', 'browL', 'browR', 'lidL', 'lidR', 'pupilL', 'pupilR', 'fig', 'mouth'];
    const bi = Object.fromEntries(order.map((k, i) => [k, i]));
    rootB.updateMatrixWorld(true);
    const rigid = (name) => () => [bi[name], bi[name], 0];
    const parts = [];
    const add = (geo, b, slot, color) => parts.push({ geo, slot, color, skin: rigid(b) });

    // the mantle: a tall dome, plum above, the belly paler low at the front
    const m = strip(new THREE.SphereGeometry(HEAD_R, 40, 28));
    const P = m.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i);
      let y = P.getY(i) * HEAD_TALL + HEAD_Y;
      let z = P.getZ(i);
      z -= Math.max(0, y - HEAD_Y) * 0.12;
      // a softer, wider brow ridge over the eyes and a slight pinch at the waterline
      if (y < 1) {
        const k = (1 - y) / 8;
        P.setX(i, x * (1 - k * 0.3));
        z *= 1 - k * 0.3;
      }
      P.setY(i, y);
      P.setZ(i, z);
    }
    m.computeVertexNormals();
    const mantleCol = (x, y, z) => {
      const front = z / HEAD_R;
      const w = smooth((front - 0.18) / 0.3) * smooth((4.6 - y) / 1.2);
      return w > 0.5 ? COL.belly : COL.mantle;
    };
    add(m, 'mantle', INKS, mantleCol);
    // pink spots on its back and crown (no ink)
    const spots = [
      [0.55, 1.2, 0.75], [0.9, 1.7, 0.6], [0.35, 2.1, 0.85], [1.15, 2.6, 0.5], [0.7, -1.3, 0.7], [1.0, -1.9, 0.55],
      [0.3, -2.3, 0.8], [0.15, 2.8, 0.65], [1.25, -0.6, 0.5], [0.5, 3.1, 0.7], [0.05, -1.6, 0.6], [1.35, 1.3, 0.42],
      [0.85, 0.95, 0.38], [0.6, -0.95, 0.42],
    ];
    for (const [lat, lon, r] of spots) {
      const { p, n } = mantlePoint(lat, lon);
      add(placed(new THREE.SphereGeometry(r, 12, 8), p.addScaledVector(n, 0.03), qFromTo(FWD, n), V3(1, 1, 0.22)), 'mantle', FLAT, COL.spot);
    }
    // barnacles round the figurehead
    const barn = [[1.25, 0.2], [1.12, 0.95], [1.32, -0.45], [1.0, 0.35], [1.18, -1.1], [0.98, 1.25], [1.38, 0.75], [1.05, -0.3]];
    barn.forEach(([lat, lon], k) => {
      const { p, n } = mantlePoint(lat, lon);
      const s = 0.75 + 0.5 * hash(k + 3);
      const q = qFromTo(UP, n);
      add(placed(new THREE.CylinderGeometry(0.34 * s, 0.52 * s, 0.5 * s, 9), p.clone().addScaledVector(n, 0.18 * s), q), 'mantle', THIN, COL.barnacle);
      add(placed(new THREE.CircleGeometry(0.2 * s, 9), p.clone().addScaledVector(n, 0.44 * s), q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), -PI / 2))), 'mantle', FLAT, COL.barnacleHole);
    });
    // the old figurehead: a broken bowsprit stub stuck in its crown, a faded carved lady on the end, leaning
    // out over its brow so you see her face
    {
      const { n } = mantlePoint(1.08, 0.62);
      const dir = n.clone().add(V3(0.1, 0.25, 0.55)).normalize();
      const fq = qFromTo(UP, dir);
      const at = bones.fig.position.clone();
      add(placed(new THREE.CylinderGeometry(0.42, 0.55, 3.2, 10), at.clone().addScaledVector(dir, 0.7), fq), 'fig', INKS, COL.wood);
      add(placed(new THREE.CylinderGeometry(0.56, 0.56, 0.26, 10), at.clone().addScaledVector(dir, 1.5), fq), 'fig', THIN, COL.gold);
      const tip = at.clone().addScaledVector(dir, 2.3);
      // her body (a robe, flaring at the bottom where she meets the wood), head, hair, folded arms
      add(placed(new THREE.CylinderGeometry(0.62, 0.95, 1.7, 14), tip.clone().addScaledVector(dir, 0.85), fq), 'fig', INKS, COL.robe);
      add(placed(new THREE.SphereGeometry(0.66, 16, 12), tip.clone().addScaledVector(dir, 2.15), fq), 'fig', INKS, COL.skin);
      // (she faces the way the Kraken does, +z: her golden hair over the back of her head, arms folded in front)
      const hairUp = qFromTo(UP, V3(0, 0.6, -0.8));
      add(placed(new THREE.SphereGeometry(0.74, 16, 12, 0, TAU, 0, PI * 0.6), tip.clone().addScaledVector(dir, 2.18).add(V3(0, 0.04, -0.08)), hairUp), 'fig', THIN, COL.gold);
      add(placed(new THREE.CapsuleGeometry(0.3, 1.05, 4, 10).rotateZ(PI / 2), tip.clone().addScaledVector(dir, 1.3).add(V3(0, 0, 0.55)), null), 'fig', THIN, COL.skin);
      // her painted face (looking the way the Kraken looks): two dark eyes and rosy cheeks
      const head = tip.clone().addScaledVector(dir, 2.15);
      for (const sx of [-1, 1]) {
        const e = head.clone().add(V3(sx * 0.24, 0.1, 0.56));
        add(placed(new THREE.SphereGeometry(0.11, 8, 6), e, null, V3(1, 1.3, 0.6)), 'fig', FLAT, COL.pupil);
        add(placed(new THREE.SphereGeometry(0.12, 8, 6), head.clone().add(V3(sx * 0.38, -0.17, 0.48)), null, V3(1, 0.7, 0.5)), 'fig', FLAT, 0xf08a8a);
      }
      // a little gold crown: she was a queen once
      add(placed(new THREE.CylinderGeometry(0.42, 0.38, 0.32, 10), tip.clone().addScaledVector(dir, 2.15).add(V3(0, 0.72, -0.1)), null), 'fig', THIN, COL.gold);
    }
    // cross brows: thick, angled down toward the middle
    for (const s of [1, -1]) {
      const b = s > 0 ? 'browL' : 'browR';
      const g = new THREE.CapsuleGeometry(0.44, 2.3, 6, 12).rotateZ(PI / 2);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25, s * 0.32, s * 0.4, 'YXZ'));
      add(placed(g, bones[b].position.clone(), q), b, INKS, COL.brow);
    }
    // eyelids: a shell over each eyeball, on its lid bone (rotated about x to blink)
    for (const s of [1, -1]) {
      const b = s > 0 ? 'lidL' : 'lidR';
      const g = new THREE.SphereGeometry(EYE.r * 1.07, 26, 12, 0, TAU, 0, PI * 0.54);
      add(placed(g, bones[b].position.clone()), b, INKS, COL.lid);
    }
    // pupils and glints: caps on the eyeball, on the pupil bones (they look about)
    for (const s of [1, -1]) {
      const b = s > 0 ? 'pupilL' : 'pupilR';
      const c = bones[b].position.clone();
      const toFront = new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), PI / 2);
      add(placed(new THREE.SphereGeometry(EYE.r * 1.012, 22, 8, 0, TAU, 0, 0.47), c, toFront), b, FLAT, COL.pupil);
      const gq = toFront.clone().premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, s * -0.28, 0)));
      add(placed(new THREE.SphereGeometry(EYE.r * 1.02, 10, 4, 0, TAU, 0, 0.13), c, gq), b, FLAT, COL.glint);
    }
    // a sulky mouth: a wide dark frown, low at the front
    {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const u = i / 12 - 0.5;
        pts.push(V3(u * 3.0, 0.4 * Math.cos(u * PI) - 0.15, 0.05 - 0.6 * u * u));
      }
      const { geo } = taperTube(pts.map((p) => p.add(bones.mouth.position)), (u) => 0.2 + 0.1 * Math.sin(u * PI), 8, UP);
      add(geo, 'mouth', FLAT, COL.mouth);
    }
    // tentacle roots spreading on the water, each ending in a cartoon curl that rolls up and back over itself
    // (the front left clear for the face): an arm along the water with a gentle S, then a shrinking spiral
    for (let k = 0; k < 6; k++) {
      const lon = 0.95 + (k / 5) * (TAU - 1.9) + (k % 2 ? 0.12 : -0.08);
      const dir = V3(Math.sin(lon), 0, Math.cos(lon));
      const sd = V3(dir.z, 0, -dir.x).multiplyScalar(k % 2 ? 1 : -1);
      const reach = 8.0 + 0.9 * hash(k + 11); // where the curl starts
      const pts = [];
      const ARM = 14;
      for (let i = 0; i <= ARM; i++) {
        const u = i / ARM;
        const r = 4.4 + u * (reach - 4.4);
        const wave = Math.sin(u * PI) * 0.9;
        pts.push(V3(dir.x * r + sd.x * wave, 0.45 - 0.35 * u, dir.z * r + sd.z * wave));
      }
      // the curl: up and back over the arm, in the plane of the arm, tilted a little to one side
      const CURL = 16;
      const rho0 = 1.15;
      const lean = 0.35;
      const y0 = pts[ARM].y;
      for (let i = 1; i <= CURL; i++) {
        const q = i / CURL;
        const th = q * PI * 1.55;
        const rho = rho0 * (1 - 0.55 * q);
        const along = reach + rho * Math.sin(th);
        const up = y0 + rho0 - rho * Math.cos(th) - (rho0 - rho) * 0.2;
        const side = lean * rho * (1 - Math.cos(th));
        pts.push(V3(dir.x * along + sd.x * side, up, dir.z * along + sd.z * side));
      }
      const n = pts.length - 1;
      const rootR = (u) => 1.5 * Math.pow(1 - u, 1.15) + 0.2; // thick at the body, thin at the curl (u by length)
      const tube = taperTube(pts, rootR, 12, UP);
      const lens = [0];
      for (let i = 1; i <= n; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
      add(tube.geo, 'root', INKS, (x, y, z, i) => (Math.cos(tube.as[i]) < -0.2 ? COL.belly : COL.mantle));
      // a few pink suckers along the curl's inner side, where you see them
      for (let s = 0; s < 3; s++) {
        const j = ARM + 3 + s * 4;
        if (j >= n) break;
        const p = pts[j];
        const o = V3().subVectors(p, V3(dir.x * reach, y0 + rho0, dir.z * reach)).normalize().negate(); // toward the curl's middle
        const r = rootR(lens[j] / lens[n]) * 0.98;
        const sz = 0.16 + 0.12 * (1 - s / 3);
        add(placed(new THREE.CylinderGeometry(sz, sz * 1.15, 0.16, 10), p.clone().addScaledVector(o, r), qFromTo(UP, o)), 'root', THIN, COL.sucker);
      }
    }
    const { geometry, slots } = bake(parts);
    own.geos.push(geometry);
    const mesh = new THREE.SkinnedMesh(geometry, slots.map((s) => mats[s]));
    mesh.name = 'kraken-body';
    mesh.frustumCulled = false; // it moves far from its bind pose
    mesh.userData.keep = true;
    const skeleton = new THREE.Skeleton(order.map((k) => bones[k]));
    own.skels.push(skeleton);
    const holder = new THREE.Group();
    holder.name = 'kraken-head';
    holder.add(rootB, mesh);
    holder.updateMatrixWorld(true);
    mesh.bind(skeleton, mesh.matrixWorld);
    holder.visible = false;
    root.add(holder);
    body = { holder, mesh, bones };
  }

  function buildEyes() {
    if (!body) buildBody();
    const g = mergeGeometries([new THREE.SphereGeometry(EYE.r, 30, 20).translate(EYE.x, EYE.y, EYE.z), new THREE.SphereGeometry(EYE.r, 30, 20).translate(-EYE.x, EYE.y, EYE.z)], false);
    own.geos.push(g);
    const mat = noOutline(new THREE.MeshToonMaterial({ color: COL.eye, emissive: COL.eyeGlow, emissiveIntensity: 0.3, gradientMap: gradientMap(2) }));
    own.mats.push(mat);
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = 'kraken-eyes';
    mesh.frustumCulled = false;
    body.bones.mantle.add(mesh);
    eyes = { mesh, mat, glow: 0, dir: 0, turnAt: -1, open: [1, 1], blinkAt: 2.2 };
  }

  function buildTentacles() {
    makeMats();
    // one tentacle, straight up its +y in bind pose, suckers down its front (+z): then four copies
    const path = [];
    for (let i = 0; i <= 44; i++) path.push(V3(0, T_Y0 + (i / 44) * T_LEN, 0));
    const rad = (u) => 1.55 * Math.pow(1 - u, 0.85) + 0.13;
    const one = [];
    const tube = taperTube(path, rad, 16, FWD);
    const boneAt = (y) => {
      const f = clamp((y - T_Y0) / T_SEG, 0, T_BONES - 1);
      const b = Math.min(T_BONES - 2, Math.floor(f));
      return [b, b + 1, clamp(f - b, 0, 1)];
    };
    one.push({ geo: tube.geo, slot: INKS, color: (x, y, z, i) => (Math.cos(tube.as[i]) > 0.3 ? COL.belly : COL.mantle), skin: (x, y) => boneAt(y) });
    // two rows of suckers (pink rims, darker middles), smaller toward the tip
    for (let k = 0; k < 15; k++) {
      const u = 0.17 + (k / 14) * 0.72;
      const y = T_Y0 + u * T_LEN;
      const r = rad(u);
      for (const s of [-1, 1]) {
        const a = s * 0.42 + (k % 2 ? 0.08 : -0.08);
        const n = V3(Math.sin(a), 0, Math.cos(a));
        const sz = 0.17 + 0.3 * (1 - u);
        const c = V3(n.x * r, y, n.z * r);
        const q = qFromTo(UP, n);
        const rigid = () => {
          const [b0, b1, w] = boneAt(y);
          return w < 0.5 ? [b0, b0, 0] : [b1, b1, 0];
        };
        one.push({ geo: placed(new THREE.CylinderGeometry(sz, sz * 1.15, 0.22, 12), c.clone().addScaledVector(n, 0.04), q), slot: THIN, color: COL.sucker, skin: rigid });
        one.push({ geo: placed(new THREE.CircleGeometry(sz * 0.55, 10), c.clone().addScaledVector(n, 0.16), q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), -PI / 2))), slot: FLAT, color: COL.suckerIn, skin: rigid });
      }
    }
    // pink spots down its back
    for (let k = 0; k < 7; k++) {
      const u = 0.2 + k * 0.1;
      const y = T_Y0 + u * T_LEN;
      const a = PI + (k % 2 ? 0.5 : -0.4);
      const n = V3(Math.sin(a), 0, Math.cos(a));
      const r = rad(u);
      one.push({ geo: placed(new THREE.SphereGeometry(0.3 * (1.2 - u), 10, 6), V3(n.x * r, y, n.z * r).addScaledVector(n, 0.02), qFromTo(FWD, n), V3(1, 1, 0.25)), slot: FLAT, color: COL.spot, skin: (x, yy) => boneAt(yy) });
    }
    // paint and skin it once (bones 0-11), then copy it for the other three, their bones shifted by 12 each
    // (the same geometry as painting all four, in a quarter of the time: prepare() keeps its frames short)
    const bySlot = paint(one).map((list) => {
      if (!list.length) return list;
      const first = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (list.length > 1) for (const g of list) g.dispose();
      const copies = [first];
      for (let t = 1; t < MAX_T; t++) {
        const c = first.clone();
        const si = c.attributes.skinIndex.array;
        for (let i = 0; i < si.length; i += 4) {
          si[i] += t * T_BONES;
          si[i + 1] += t * T_BONES;
        }
        copies.push(c);
      }
      return copies;
    });
    const { geometry, slots } = mergeSlots(bySlot);
    own.geos.push(geometry);
    const roots = [];
    const chains = [];
    const all = [];
    for (let t = 0; t < MAX_T; t++) {
      const chain = [];
      let parent = null;
      for (let i = 0; i < T_BONES; i++) {
        const b = new THREE.Bone();
        b.name = `kraken-t${t}-${i}`;
        b.position.set(0, i === 0 ? T_Y0 : T_SEG, 0);
        if (parent) parent.add(b);
        parent = b;
        chain.push(b);
        all.push(b);
      }
      roots.push(chain[0]);
      chains.push(chain);
    }
    const mesh = new THREE.SkinnedMesh(geometry, slots.map((s) => mats[s]));
    mesh.name = 'kraken-tentacles';
    mesh.frustumCulled = false;
    mesh.userData.keep = true;
    const holder = new THREE.Group();
    holder.name = 'kraken-arms';
    holder.add(...roots, mesh);
    holder.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(all);
    own.skels.push(skeleton);
    mesh.bind(skeleton, mesh.matrixWorld);
    for (const r of roots) r.scale.setScalar(0);
    holder.visible = false;
    root.add(holder);
    tents = { holder, mesh, roots, chains, slots: Array.from({ length: MAX_T }, () => ({ key: null, state: null, since: 0, k: 0, ph: 0 })) };
  }

  function buildShadow() {
    const g = new THREE.PlaneGeometry(24, 24, 12, 12).rotateX(-PI / 2);
    own.geos.push(g);
    const tex = hasDom ? shadowTexture() : null;
    if (tex) own.texs.push(tex);
    const mat = noOutline(new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
    own.mats.push(mat);
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = 'kraken-shadow';
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    mesh.visible = false;
    mesh.matrixAutoUpdate = false; // its vertices are placed in world space each frame
    g.attributes.position.setUsage(THREE.DynamicDrawUsage);
    root.add(mesh);
    shadow = { mesh, mat, base: Float32Array.from(g.attributes.position.array), trail: [], trailAt: -1 };
  }

  function buildFx() {
    const bubbleGeo = new THREE.IcosahedronGeometry(0.32, 1);
    const ringGeo = dashedRing();
    const fillGeo = new THREE.CircleGeometry(1, 32).rotateX(-PI / 2);
    own.geos.push(bubbleGeo, ringGeo, fillGeo);
    const bubbleMat = noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const ringMat = noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    const fillMat = noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
    fillMat.forceSinglePass = true; // (a flat disc: one pass, not three.js's back-then-front pair for see-through two-sided)
    own.mats.push(bubbleMat, ringMat, fillMat);
    const mk = (geo, mat, cap, name) => {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.name = name;
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, foam);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.userData.keep = true;
      root.add(m);
      return m;
    };
    fx = {
      bubbles: mk(bubbleGeo, bubbleMat, CAP_BUBBLES, 'kraken-bubbles'),
      rings: mk(ringGeo, ringMat, CAP_RINGS, 'kraken-rings'),
      fills: mk(fillGeo, fillMat, CAP_RINGS, 'kraken-fills'),
    };
    fx.fills.renderOrder = 2;
  }

  // The Kraken's Pearl: a giant clam (two ribbed valves with scalloped rims, hinged at the back, the top one
  // open) holding a big glowing pearl.
  function buildPearl() {
    makeMats();
    const R = 2.4;
    const valve = (lift) => {
      const g = strip(new THREE.SphereGeometry(R, 48, 12));
      const P = g.attributes.position;
      for (let i = 0; i < P.count; i++) {
        let x = P.getX(i);
        let y = P.getY(i);
        let z = P.getZ(i);
        const lon = Math.atan2(x, z);
        const rib = 1 + 0.055 * Math.cos(lon * 14); // radial ribs, scalloping the rim
        x *= rib;
        z *= rib * 0.92;
        y *= 0.26;
        P.setXYZ(i, x, y, z);
      }
      g.computeVertexNormals();
      // hinged at its back edge (z = -R): opened up by `lift` radians
      g.translate(0, 0, R * 0.92);
      g.rotateX(-lift);
      g.translate(0, 0, -R * 0.92);
      return g;
    };
    // cream above, coral below (a treasure, not a creature: it reads warm against the Deep's night)
    const parts = [
      { geo: valve(0), slot: INKS, color: (x, y) => (y > 0.2 ? 0xffe0c2 : 0xf4a38c), skin: () => [0, 0, 0] },
      { geo: valve(1.3).translate(0, 0.3, 0), slot: INKS, color: (x, y, z) => (z < -R * 0.55 || y > 2.9 ? 0xffe0c2 : 0xf4a38c), skin: () => [0, 0, 0] },
    ];
    const { geometry } = bake(parts);
    for (const k of ['skinIndex', 'skinWeight']) geometry.deleteAttribute(k);
    geometry.clearGroups();
    own.geos.push(geometry);
    const shell = new THREE.Mesh(geometry, mats[INKS]);
    shell.name = 'kraken-pearl-shell';
    const pg = new THREE.SphereGeometry(1.05, 28, 18).translate(0, 1.15, 0.55);
    own.geos.push(pg);
    const mat = noOutline(new THREE.MeshToonMaterial({ color: 0xfff8fc, emissive: 0xffd0ea, emissiveIntensity: 0.6, gradientMap: gradientMap(2) }));
    own.mats.push(mat);
    const orb = new THREE.Mesh(pg, mat);
    orb.name = 'kraken-pearl';
    const group = new THREE.Group();
    group.name = 'kraken-pearl-clam';
    group.add(shell, orb);
    group.visible = false;
    for (const m of [shell, orb]) m.frustumCulled = false;
    root.add(group);
    pearl = { group, mat, spin: 0 };
  }

  const builders = [buildBody, buildEyes, buildTentacles, buildShadow, buildFx, buildPearl];
  function buildNext() {
    if (step >= STEPS || disposed) return;
    const parts = [body, eyes, tents, shadow, fx, pearl];
    while (step < STEPS && parts[step]) step++;
    if (step < STEPS) {
      builders[step]();
      step++;
    }
  }

  // The warm-up: once every part is built, prepare() shows them all for one frame deep under the sea (out of
  // sight), so three.js compiles their shaders then (during the fly-in) and not on the frame the Kraken
  // rises. 0 = not yet, 1 = showing (until a frame has drawn them), 2 = done or skipped.
  let warm = 0;
  let warmDrawn = false;
  let warmWaits = 0;
  const WARM_Y = -400;
  const WARM_WAIT = 3;
  function warmShow() {
    warm = 1;
    warmDrawn = false;
    warmWaits = 0;
    root.position.y = WARM_Y;
    body.holder.visible = true;
    body.mesh.onAfterRender = () => {
      warmDrawn = true;
    };
    tents.holder.visible = true;
    shadow.mesh.visible = true;
    pearl.group.visible = true;
    for (const m of [fx.bubbles, fx.rings, fx.fills]) {
      m.count = 1;
      m.visible = true;
    }
  }
  function warmEnd() {
    if (warm !== 1) {
      warm = 2;
      return;
    }
    warm = 2;
    root.position.y = 0;
    body.mesh.onAfterRender = () => {};
    body.holder.visible = false;
    tents.holder.visible = false;
    shadow.mesh.visible = false;
    pearl.group.visible = false;
    for (const m of [fx.bubbles, fx.rings, fx.fills]) {
      m.count = 0;
      m.visible = false;
    }
  }

  // ---- per frame
  const _m = new THREE.Matrix4();
  const _p = V3();
  const _q = new THREE.Quaternion();
  const _s = V3();
  const _c = new THREE.Color();
  const RING = new THREE.Color(COL.ring);
  const GRAB = new THREE.Color(COL.grab);
  const FILL = new THREE.Color(COL.fill);
  const FILL_GRAB = new THREE.Color(COL.fillGrab);
  const INK_RIM = new THREE.Color(COL.inkRim);
  const INK_FILL = new THREE.Color(COL.inkFill);
  const INK = new THREE.Color(COL.ink);
  const INK_GLINT = new THREE.Color(COL.inkGlint);
  let lastHead = null; // { x, z, h, k } as last drawn
  let lastShadow = null; // { x, z, h, k } as last drawn
  let lastBurn = null; // the part on fire (visuals().burn.part)
  let lastT = 0; // the visual time of the last update
  let clock = 0;
  const counts = { bubbles: 0, rings: 0, fills: 0, inkBlobs: 0 };

  function inst(mesh, key, cap, x, y, z, sx, sy, sz, ry, color) {
    if (counts[key] >= cap) return;
    const i = counts[key]++;
    _q.setFromAxisAngle(UP, ry);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    _m.toArray(mesh.instanceMatrix.array, i * 16);
    color.toArray(mesh.instanceColor.array, i * 3);
  }
  // the sea's highest point under a ring (so no wave crest hides it)
  function ringY(x, z, r, t) {
    let y = sea(x, z, t);
    for (let k = 0; k < 4; k++) y = Math.max(y, sea(x + Math.cos(k * 1.571) * r, z + Math.sin(k * 1.571) * r, t));
    return y + 0.14;
  }
  let stillNow = false; // reduced motion this frame: bubbles hold still
  function bubble(x, z, t, ph, rise = 1, size = 1, color = foam) {
    // a bubble's life: wells up, swells and pops (0..1 of a cycle); under reduced motion it holds mid-life
    const q = stillNow ? 0.25 + 0.5 * frac(ph * 1.7) : frac(t * 0.9 + ph);
    const s = size * (0.5 + 1.1 * q) * (q > 0.85 ? (1 - q) / 0.15 : 1);
    inst(fx.bubbles, 'bubbles', CAP_BUBBLES, x, sea(x, z, t) + 0.1 + q * 0.7 * rise, z, s, s, s, 0, color);
  }

  function poseHead(H, E, t, dt, still) {
    const B = body.bones;
    const k = clamp(num(H.k, 1), 0, 1);
    if (k <= 0.001) {
      body.holder.visible = false;
      return;
    }
    body.holder.visible = true;
    const x = num(H.x, 0);
    const z = num(H.z, 0);
    let h = num(H.h, 0);
    // sinking: it spins down in a swirl
    if (lastHead && k < lastHead.k - 1e-4 && !still) lastHead.spin = (lastHead.spin || 0) + dt * 2.2 * (1 - k);
    else if (lastHead && k >= 0.999) lastHead.spin = 0;
    const spin = lastHead ? lastHead.spin || 0 : 0;
    h += spin;
    const bob = still ? 0 : 0.28 * Math.sin(t * 1.15) * k;
    const y = sea(x, z, t) + (smooth(k) - 1) * DIVE * HEAD_SCALE + bob;
    B.root.position.set(x, y, z);
    B.root.rotation.set(still ? 0 : 0.03 * Math.sin(t * 0.8), h, still ? 0 : 0.025 * Math.sin(t * 0.67 + 1));
    B.root.scale.setScalar(HEAD_SCALE);
    const sneeze = clamp(num(H.sneeze, 0), 0, 1);
    const breathe = still ? 1 : 1 + 0.018 * Math.sin(t * 1.7);
    B.mantle.scale.set(breathe * (1 + 0.1 * sneeze), breathe * (1 - 0.16 * sneeze), breathe * (1 + 0.1 * sneeze));
    const hurt = clamp(num(H.hurt, 0), 0, 1);
    for (const [b, s] of [[B.browL, 1], [B.browR, -1]]) {
      b.position.y = EYE.y + 2.15 + 0.5 * hurt;
      b.rotation.set(0, 0, -s * 0.25 * hurt);
    }
    B.fig.rotation.set(still ? 0 : 0.05 * Math.sin(t * 2.1), 0, still ? 0 : 0.04 * Math.sin(t * 1.3));
    // eyes: glow eased at ≤ GLOW_RATE a second (≤ 1 Hz); lids open, blink, or (the rise) only the left one
    const eye = typeof E === 'number' ? { glow: E } : E && typeof E === 'object' ? E : {};
    const want = clamp(num(eye.glow, 0.35), 0, 1);
    const d = want - eyes.glow;
    const dir = Math.abs(d) > 1e-4 ? Math.sign(d) : 0;
    // it may turn from brightening to dimming (or back) only GLOW_TURN s after its last turn: however fast
    // kraken.js asks, the glow never pulses faster than once a second
    if (dir !== 0 && (dir === eyes.dir || clock - eyes.turnAt >= GLOW_TURN)) {
      if (dir !== eyes.dir) {
        eyes.dir = dir;
        eyes.turnAt = clock;
      }
      eyes.glow += dir * Math.min(Math.abs(d), GLOW_RATE * Math.max(dt, 0));
    }
    eyes.mat.emissiveIntensity = 0.25 + 1.15 * eyes.glow;
    let open = clamp(num(eye.open, 1), 0, 1);
    // a blink every few seconds (0.2 s), visual time
    if (t > eyes.blinkAt + 0.2) eyes.blinkAt = t + 2.6 + 2.4 * hash(Math.floor(t));
    const blink = t >= eyes.blinkAt && t <= eyes.blinkAt + 0.2 ? Math.sin(((t - eyes.blinkAt) / 0.2) * PI) : 0;
    const openL = open * (1 - blink);
    const openR = eye.one ? 0 : open * (1 - blink);
    eyes.open[0] = openL;
    eyes.open[1] = openR;
    B.lidL.rotation.x = lerp(LID_SHUT, LID_OPEN, openL);
    B.lidR.rotation.x = lerp(LID_SHUT, LID_OPEN, openR);
    // pupils: toward what it looks at (you), a little down
    let yaw = 0;
    if (eye.look && Number.isFinite(eye.look.x) && Number.isFinite(eye.look.z)) yaw = Math.atan2(eye.look.x - x, eye.look.z - z) - h;
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    yaw = clamp(yaw, -0.42, 0.42);
    for (const b of [B.pupilL, B.pupilR]) b.rotation.set(0.16, yaw, 0, 'YXZ');
    // the foam collar where it breaks the water, and bubbles while it rises or sinks
    if (fx) {
      const wy = ringY(x, z, 6.6, t);
      if (k > 0.25) inst(fx.rings, 'rings', CAP_RINGS, x, wy, z, 7.1, 1, 7.1, still ? 0 : t * 0.35, foam);
      if (k < 0.999 || spin > 0) {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU;
          bubble(x + Math.cos(a) * 7.4, z + Math.sin(a) * 7.4, t, i * 0.37, 1.2, 1.4);
        }
      }
    }
    lastHead = { x, y, z, h: num(H.h, 0), k, spin };
  }

  const STATES = {
    warn: 'warn', warning: 'warn', telegraph: 'warn',
    rise: 'rise', up: 'rise', emerge: 'rise',
    slam: 'slam', strike: 'slam',
    sway: 'sway', idle: 'sway', target: 'sway',
    grab: 'grab', grabbing: 'grab', hold: 'grab',
    recoil: 'recoil', ouch: 'recoil', hurt: 'recoil',
    sink: 'sink', down: 'sink', retire: 'sink', gone: 'sink',
  };

  function poseTentacles(list, t, dt, still) {
    const used = new Array(MAX_T).fill(false);
    const items = [];
    for (let i = 0; i < list.length && items.length < MAX_T; i++) {
      const v = list[i];
      if (v && typeof v === 'object' && Number.isFinite(v.x) && Number.isFinite(v.z)) items.push(v);
    }
    // stable slots: the same id (or index) keeps its slot; a new one takes a free slot (and starts fresh)
    const keyOf = (v, i) => (v.id !== undefined && v.id !== null ? `id:${v.id}` : `ix:${i}`);
    const slotOf = items.map(() => -1);
    items.forEach((v, i) => {
      const s = tents.slots.findIndex((sl, j) => !used[j] && sl.key === keyOf(v, i));
      if (s >= 0) {
        slotOf[i] = s;
        used[s] = true;
      }
    });
    items.forEach((v, i) => {
      if (slotOf[i] >= 0) return;
      const s = used.indexOf(false);
      used[s] = true;
      slotOf[i] = s;
      Object.assign(tents.slots[s], { key: keyOf(v, i), state: null, since: clock, ph: hash(s * 7 + clock) * TAU });
    });
    let any = false;
    for (let s = 0; s < MAX_T; s++) {
      const slot = tents.slots[s];
      const rootB = tents.roots[s];
      const i = slotOf.indexOf(s);
      if (i < 0) {
        slot.key = null;
        rootB.scale.setScalar(0);
        continue;
      }
      const v = items[i];
      const st = STATES[v.state] || 'sway';
      if (st !== slot.state) {
        slot.state = st;
        slot.since = clock;
      }
      const tau = Number.isFinite(v.t) ? Math.max(0, v.t) : clock - slot.since;
      // how far up, by state (or as told)
      let k = 1;
      if (st === 'warn') k = 0;
      else if (st === 'rise') k = smooth(tau / 0.4);
      else if (st === 'slam') k = easeBack(tau / 0.34);
      else if (st === 'recoil') k = 1 - smooth((tau - 0.15) / 0.45);
      else if (st === 'sink') k = 1 - smooth(tau / 0.5);
      if (Number.isFinite(v.k)) k = clamp(v.k, 0, 1.2);
      if (k <= 0.01) {
        rootB.scale.setScalar(0);
        continue;
      }
      any = true;
      let x = v.x;
      let z = v.z;
      let h = num(v.h, 0);
      if (st === 'grab' && Number.isFinite(v.tx) && Number.isFinite(v.tz)) {
        // stand beside the hull it holds, facing it, and curl over its deck
        const dx = v.tx - v.x;
        const dz = v.tz - v.z;
        const dd = Math.hypot(dx, dz);
        h = dd > 0.01 ? Math.atan2(dx, dz) : h;
        if (dd < 2.9) {
          x = v.tx - Math.sin(h) * 2.9;
          z = v.tz - Math.cos(h) * 2.9;
        }
      }
      const y = sea(x, z, t) + T_Y0 + (Math.min(1, k) - 1) * T_DIVE;
      rootB.position.set(x, y, z);
      rootB.rotation.set(0, h, 0);
      const sc = 1 + (k > 1 ? (k - 1) * 0.5 : 0);
      rootB.scale.set(sc, sc, sc);
      const chain = tents.chains[s];
      const ph = slot.ph;
      for (let b = 1; b < T_BONES; b++) {
        const u = b / (T_BONES - 1);
        const curl = u > 0.6 ? ((u - 0.6) / 0.4) * 0.62 : 0;
        let bx = curl - (u < 0.35 ? 0.035 : 0) + (still ? 0.05 : 0.085 * Math.sin(t * 1.35 + u * 2.4 + ph));
        let bz = still ? 0 : 0.05 * Math.sin(t * 0.95 + u * 1.9 + ph * 1.3);
        if (st === 'slam') {
          // bursts up, then a forward whip
          const w = tau > 0.22 && tau < 0.85 ? Math.sin(((tau - 0.22) / 0.63) * PI) : 0;
          bx += 0.17 * w * (u < 0.15 ? 0.3 : 1);
        } else if (st === 'grab') {
          // up beside her hull, over the rail (bones 5-6), across the deck, down the far side (9-10), tip curled
          const squeeze = still ? 0 : 0.05 * Math.sin(t * 5.5 + ph);
          bx = b === 5 || b === 6 ? 0.76 + squeeze : b === 9 || b === 10 ? 0.74 - squeeze : b === 11 ? 0.5 : b > 6 ? -0.02 : 0;
          bz = still ? 0 : 0.02 * Math.sin(t * 3 + u * 4);
        } else if (st === 'recoil') {
          const j = Math.sin(clamp(tau / 0.15, 0, 1) * PI * 0.5);
          bx = -0.2 * j * (1 - smooth((tau - 0.15) / 0.45)) + curl * 0.4;
          bz = 0.08 * j;
        }
        chain[b].rotation.set(bx, 0, bz);
      }
      // a foam collar where it breaks the water
      if (fx && k > 0.2) inst(fx.rings, 'rings', CAP_RINGS, x, ringY(x, z, 2.1, t), z, 2.3 * Math.min(1, k), 1, 2.3 * Math.min(1, k), still ? 0 : t * 0.8 + ph, foam);
    }
    tents.holder.visible = any;
    return any;
  }

  function drawShadow(S, t, dt, still) {
    const k = clamp(num(S.k, 1), 0, 1);
    if (!S || k <= 0.01) {
      shadow.mesh.visible = false;
      shadow.trail.length = 0;
      lastShadow = null;
      return;
    }
    const x = num(S.x, 0);
    const z = num(S.z, 0);
    const h = num(S.h, 0);
    lastShadow = { x, z, h, k };
    shadow.mesh.visible = true;
    shadow.mat.opacity = 0.9 * k;
    const P = shadow.mesh.geometry.attributes.position;
    const a = P.array;
    const b = shadow.base;
    const c = Math.cos(h);
    const s = Math.sin(h);
    const wob = still ? 0 : 0.04 * Math.sin(t * 1.3);
    for (let i = 0; i < P.count; i++) {
      const lx = b[i * 3] * (1 + wob);
      const lz = b[i * 3 + 2] * (1 - wob);
      const wx = x + lx * c + lz * s;
      const wz = z - lx * s + lz * c;
      a[i * 3] = wx;
      a[i * 3 + 1] = sea(wx, wz, t) + SHADOW_LIFT;
      a[i * 3 + 2] = wz;
    }
    P.needsUpdate = true;
    // its bubble trail: where it was, every 0.15 s of visual time
    if (dt > 0 && t - shadow.trailAt > 0.15) {
      shadow.trailAt = t;
      shadow.trail.unshift({ x: x - Math.sin(h) * 6, z: z - Math.cos(h) * 6, t });
      if (shadow.trail.length > 12) shadow.trail.length = 12;
    }
    if (fx) {
      for (let i = 0; i < shadow.trail.length; i++) {
        const p = shadow.trail[i];
        bubble(p.x + Math.sin(i * 2.3) * 1.2, p.z + Math.cos(i * 1.7) * 1.2, t, i * 0.29, 0.8, 1.2 - i * 0.06);
      }
    }
  }

  // An ink ring's blob: a dark gob arcing from where it was spat (the ring's `from`) to land in the middle of
  // the ring just as the warning runs out, two drops trailing it. (A thrown thing, so it flies under reduced
  // motion too: it says where and when the ink lands.)
  function inkBlob(r, u, t) {
    const f = r.from && typeof r.from === 'object' && Number.isFinite(r.from.x) && Number.isFinite(r.from.z) ? r.from : null;
    if (!f || u >= 1) return;
    let fx0 = f.x;
    let fz0 = f.z;
    const d0 = Math.hypot(r.x - fx0, r.z - fz0) || 1;
    // spat by the head (when it is up there): it leaves from its mouth, not from inside it
    let y0 = sea(fx0, fz0, t) + 0.6;
    if (lastHead && lastHead.k > 0.5 && Math.hypot(lastHead.x - fx0, lastHead.z - fz0) < 2.5) {
      const out = Math.min(HEAD_R * HEAD_SCALE, d0 * 0.5);
      fx0 += ((r.x - fx0) / d0) * out;
      fz0 += ((r.z - fz0) / d0) * out;
      y0 = sea(fx0, fz0, t) + 1.6 * HEAD_SCALE;
    }
    const d = Math.hypot(r.x - fx0, r.z - fz0);
    const top = 3.5 + 0.12 * Math.min(d, 60); // how high it is lobbed (low: it stays against the sea)
    const y1 = sea(r.x, r.z, t) + 0.4;
    for (let i = 0; i < 3; i++) {
      const v = u - i * 0.04;
      if (v < 0) break;
      const x = lerp(fx0, r.x, v);
      const z = lerp(fz0, r.z, v);
      const y = lerp(y0, y1, v) + 4 * top * v * (1 - v);
      const s = i === 0 ? 3.6 : i === 1 ? 1.9 : 1.2;
      inst(fx.bubbles, 'bubbles', CAP_BUBBLES, x, y, z, s, s * 1.08, s, 0, INK);
      // a pale glint on top of the gob, so it reads as a wet blob (and against the night sky)
      if (i === 0) inst(fx.bubbles, 'bubbles', CAP_BUBBLES, x - 0.25, y + 1.0, z, 1.7, 1.0, 1.7, 0, INK_GLINT);
    }
    counts.inkBlobs++;
  }

  function drawRingsAndBoil(V, t, still) {
    if (!fx) return;
    const rings = Array.isArray(V.rings) ? V.rings : [];
    if (drawRings) {
      for (const r of rings) {
        if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.z)) continue;
        const R = clamp(num(r.r, 4), 0.5, 20);
        const T = Math.max(0.05, num(r.T, 1.8));
        const u = clamp(num(r.t, 0) / T, 0, 1);
        const y = ringY(r.x, r.z, R, t);
        const turn = still ? 0 : t * 0.9;
        const isInk = r.kind === 'ink';
        inst(fx.rings, 'rings', CAP_RINGS, r.x, y + 0.02, r.z, R, 1, R, turn, isInk ? INK_RIM : RING);
        if (r.grab) inst(fx.rings, 'rings', CAP_RINGS, r.x, y + 0.01, r.z, R * 1.13, 1, R * 1.13, -turn, GRAB);
        // the fill grows to the rim as the warning runs out (like the bomb zones)
        const f = Math.max(0.06, u) * R * 0.86;
        inst(fx.fills, 'fills', CAP_RINGS, r.x, y, r.z, f, 1, f, 0, isInk ? INK_FILL : r.grab ? FILL_GRAB : FILL);
        for (let i = 0; i < 6; i++) {
          const a = i * 2.39 + r.x;
          const rr = R * (0.25 + 0.6 * hash(i + r.z));
          bubble(r.x + Math.cos(a) * rr, r.z + Math.sin(a) * rr, t, i * 0.31 + u, 1, isInk ? 1.25 : 1, isInk ? INK : foam);
        }
        if (isInk) inkBlob(r, u, t);
      }
    }
    const boil = V.boil && typeof V.boil === 'object' && Number.isFinite(V.boil.x) ? V.boil : null;
    if (boil) {
      const k = clamp(num(boil.k, 1), 0, 1);
      const R = clamp(num(boil.r, 30), 2, 60);
      const n = Math.round(28 * k);
      for (let i = 0; i < n; i++) {
        const a = (i / 28) * TAU + (still ? 0 : t * 0.1);
        bubble(boil.x + Math.cos(a) * R, boil.z + Math.sin(a) * R, t, i * 0.41, 1.4, 1.5);
      }
    }
  }

  function drawPearl(Pv, t, dt, still) {
    const P = Pv && typeof Pv === 'object' && Number.isFinite(Pv.x) && Number.isFinite(Pv.z) ? Pv : null;
    const k = P ? clamp(num(P.k, 1), 0, 1) : 0;
    if (k <= 0.01) {
      pearl.group.visible = false;
      return;
    }
    pearl.group.visible = true;
    const bob = still ? 0 : 0.18 * Math.sin(t * 1.6);
    pearl.group.position.set(P.x, sea(P.x, P.z, t) - 0.1 + (smooth(k) - 1) * 4 + bob, P.z);
    if (Number.isFinite(P.h)) pearl.spin = P.h;
    else if (!still) pearl.spin += dt * 0.35;
    pearl.group.rotation.set(still ? 0 : 0.05 * Math.sin(t * 1.1), pearl.spin, still ? 0 : 0.06 * Math.sin(t * 0.9 + 1));
    // its glow eases up and down once every 2.5 s (well under 1 Hz); steady under reduced motion
    pearl.mat.emissiveIntensity = still ? 0.6 : 0.6 + 0.2 * Math.sin((t * TAU) / 2.5);
    if (fx && k > 0.3) inst(fx.rings, 'rings', CAP_RINGS, P.x, ringY(P.x, P.z, 2.9, t), P.z, 3.1, 1, 3.1, still ? 0 : t * 0.5, foam);
    if (fx && k < 0.999) for (let i = 0; i < 8; i++) bubble(P.x + Math.cos(i * 0.785) * 3, P.z + Math.sin(i * 0.785) * 3, t, i * 0.41, 1, 1);
  }

  // ---- its special status, drawn by statusfx.js like a ship's (statusShip)
  // Anchors in the stand's frame (+x its left, +z the way it faces, y up from where the stand sits).
  // The head: icicles round the mantle's widest part (not over its face), floes round it, flames on its upper
  // mantle (front left and right, where you see them), the stink cloud on its crown.
  const HEAD_ANCHORS = (() => {
    const s = HEAD_SCALE;
    const at = (lat, lon, out = 0) => {
      const { p, n } = mantlePoint(lat, lon);
      return { x: (p.x + n.x * out) * s, y: (p.y + n.y * out) * s, z: (p.z + n.z * out) * s };
    };
    const rail = [];
    for (let i = 0; i < 18; i++) {
      const lon = 0.75 + (i / 17) * (TAU - 1.5); // round the back from its left cheek to its right
      rail.push(at(0.05, lon, 0.12));
    }
    const holes = [{ ...at(0.62, 0.85, 0.2), side: -1 }, { ...at(0.85, -0.6, 0.2), side: 1 }];
    return { rail, deck: at(1.5, 0, -1.6), holes };
  })();
  // The shadow: a ring of floating ice where its shape is (icicles hang from it into the water), and a stink
  // cloud low over the water.
  const SHADOW_ANCHORS = (() => {
    const rail = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      rail.push({ x: Math.sin(a) * 6.5, y: 0.3, z: Math.cos(a) * 6.5 });
    }
    return { rail, deck: { x: 0, y: -0.5, z: 0 }, holes: [] };
  })();
  // A tentacle (fire only): flames up its length, from its bones (updated each call).
  const TENT_ANCHORS = { rail: [], deck: { x: 0, y: 6, z: 0 }, holes: [{ x: 0, y: 3, z: 0, side: 1 }, { x: 0, y: 6, z: 0, side: -1 }] };
  for (let i = 0; i < 8; i++) TENT_ANCHORS.rail.push({ x: Math.sin((i / 8) * TAU) * 1.6, y: 1.2, z: Math.cos((i / 8) * TAU) * 1.6 });
  const TYPES = { head: { name: 'The Kraken', len: 14, wid: 13 }, shadow: { name: 'The Kraken', len: 16, wid: 13 }, tentacle: { name: 'The Kraken', len: 12, wid: 3 } };
  const standMesh = new THREE.Group();
  standMesh.name = 'kraken-status';
  standMesh.userData.statusAnchors = HEAD_ANCHORS;
  root.add(standMesh);
  const stand = { mesh: standMesh, status: { id: null, t: 0, max: 0, immune: 0 }, type: TYPES.head, hp: 0, x: 0, z: 0, h: 0, kraken: true };
  const _bw = V3();
  function placeStand(where, x, y, z, h, anchors, type) {
    standMesh.position.set(x, y, z);
    standMesh.rotation.set(0, h, 0);
    standMesh.updateMatrixWorld(true);
    standMesh.userData.statusAnchors = anchors;
    stand.type = type;
    stand.x = x;
    stand.z = z;
    stand.h = h;
    stand.where = where;
  }
  // the burning tentacle (its slot), or null
  function tentacleFor(part) {
    if (!tents || part === null || part === undefined || !tents.holder.visible) return -1;
    const s = tents.slots.findIndex((sl) => sl.key === `id:${part}`);
    return s >= 0 && tents.roots[s].scale.x > 0 ? s : -1;
  }
  function statusShip(status) {
    const st = status && typeof status === 'object' ? status : {};
    const id = st.id === 'fire' || st.id === 'frost' || st.id === 'stink' ? st.id : null;
    const t = lastT;
    const headUp = !!(body && body.holder.visible && lastHead && lastHead.k > 0.5 && warm !== 1);
    let shown = false;
    if (id === 'fire' && lastBurn !== 'head' && lastBurn !== 'eye') {
      const s = tentacleFor(lastBurn);
      if (s >= 0) {
        const r = tents.roots[s];
        placeStand('tentacle', r.position.x, sea(r.position.x, r.position.z, t), r.position.z, r.rotation.y, TENT_ANCHORS, TYPES.tentacle);
        tents.holder.updateMatrixWorld(true);
        const chain = tents.chains[s];
        [5, 8].forEach((b, i) => {
          standMesh.worldToLocal(chain[b].getWorldPosition(_bw));
          Object.assign(TENT_ANCHORS.holes[i], { x: _bw.x, y: _bw.y, z: _bw.z });
        });
        standMesh.worldToLocal(chain[9].getWorldPosition(_bw));
        Object.assign(TENT_ANCHORS.deck, { x: _bw.x, y: _bw.y, z: _bw.z });
        shown = true;
      }
    }
    if (!shown && id && headUp && (id !== 'fire' || lastBurn === 'head' || lastBurn === 'eye' || tentacleFor(lastBurn) < 0)) {
      // (fire on a tentacle that has sunk: its burn goes on, so it shows on the head while that is up)
      const B = body.bones.root;
      placeStand('head', B.position.x, B.position.y, B.position.z, B.rotation.y, HEAD_ANCHORS, TYPES.head);
      shown = true;
    }
    if (!shown && id && id !== 'fire' && lastShadow && lastShadow.k > 0.3) {
      placeStand('shadow', lastShadow.x, sea(lastShadow.x, lastShadow.z, t), lastShadow.z, lastShadow.h, SHADOW_ANCHORS, TYPES.shadow);
      shown = true;
    }
    stand.status = { id: shown ? id : null, t: num(st.t, 0), max: num(st.max, 0), immune: num(st.immune, 0) };
    stand.hp = shown ? 1 : 0;
    if (!shown) stand.where = null;
    return stand;
  }

  const camPos = V3();
  const camLook = V3();

  const api = {
    prepare() {
      if (disposed) return false;
      if (step < STEPS) {
        buildNext();
        return false;
      }
      if (warm === 0) {
        warmShow();
        return false;
      }
      if (warm === 1) {
        // no frame has drawn them yet: wait (a call a frame), but never more than WARM_WAIT calls, so a caller
        // that loops prepare() without drawing still gets true (the shaders then compile when it rises)
        if (!warmDrawn && ++warmWaits < WARM_WAIT) return false;
        warmEnd();
      }
      return true;
    },
    get ready() {
      return step >= STEPS && warm === 2 && !disposed;
    },

    update(visuals, t = 0, dt = 0) {
      if (disposed) return;
      const V = visuals && typeof visuals === 'object' ? visuals : {};
      const empty = !V.head && !V.shadow && !V.pearl && !V.boil && !(Array.isArray(V.tentacles) && V.tentacles.length) && !(Array.isArray(V.rings) && V.rings.length);
      if (step < STEPS) {
        if (empty) return; // nothing to draw yet: prepare() builds the parts, one a frame
        while (step < STEPS) buildNext(); // (it shows before prepare() is done: build the rest now rather than miss it)
      }
      if (warm === 1) {
        if (empty && !warmDrawn) return; // the warm-up frame stays until a frame has drawn it
        warmEnd();
      } else if (warm === 0 && !empty) warm = 2; // (it shows before its warm-up: its shaders compile now)
      const still = rm();
      stillNow = still;
      const time = num(t, 0);
      const step0 = Math.max(0, num(dt, 0));
      clock += step0;
      lastT = time;
      counts.bubbles = counts.rings = counts.fills = counts.inkBlobs = 0;
      const burn = V.burn && typeof V.burn === 'object' ? V.burn.part : null;
      lastBurn = typeof burn === 'string' || Number.isFinite(burn) ? burn : null;
      if (V.head && typeof V.head === 'object') poseHead(V.head, V.eye, time, step0, still);
      else {
        body.holder.visible = false;
        if (lastHead) lastHead.k = 0;
      }
      poseTentacles(Array.isArray(V.tentacles) ? V.tentacles : [], time, step0, still);
      if (V.shadow && typeof V.shadow === 'object') drawShadow(V.shadow, time, step0, still);
      else {
        shadow.mesh.visible = false;
        shadow.trail.length = 0;
        lastShadow = null;
      }
      drawRingsAndBoil(V, time, still);
      drawPearl(V.pearl, time, step0, still);
      for (const key of ['bubbles', 'rings', 'fills']) {
        const m = fx[key];
        m.count = counts[key];
        if (m.count) {
          m.instanceMatrix.clearUpdateRanges();
          m.instanceMatrix.addUpdateRange(0, m.count * 16);
          m.instanceMatrix.needsUpdate = true;
          m.instanceColor.clearUpdateRanges();
          m.instanceColor.addUpdateRange(0, m.count * 3);
          m.instanceColor.needsUpdate = true;
        }
        m.visible = m.count > 0;
      }
    },

    riseCamera(k, from) {
      if (disposed || !lastHead || !Number.isFinite(k)) return null;
      const H = lastHead;
      const fx0 = Math.sin(H.h);
      const fz0 = Math.cos(H.h);
      const px = from && Number.isFinite(from.x) ? from.x : H.x + fx0 * 40;
      const pz = from && Number.isFinite(from.z) ? from.z : H.z + fz0 * 40;
      let dx = px - H.x;
      let dz = pz - H.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;
      // its (left) eye, where it is now
      const eyeY = num(H.y, 0) + EYE.y * HEAD_SCALE;
      const ex = H.x + (Math.cos(H.h) * EYE.x + fx0 * EYE.z) * HEAD_SCALE;
      const ez = H.z + (-Math.sin(H.h) * EYE.x + fz0 * EYE.z) * HEAD_SCALE;
      if (rm()) {
        // reduced motion: a cut to the eye for 1.5 s in the middle of the rise, and back; no glide
        const T = from && Number.isFinite(from.duration) && from.duration > 0 ? from.duration : RISE_T;
        const w = Math.min(1, CUT_T / T);
        if (k < 0.5 - w / 2 || k >= 0.5 + w / 2) return null;
        camPos.set(ex + dx * 19 - dz * 3, Math.max(eyeY, 0) + 3.2, ez + dz * 19 + dx * 3);
        camLook.set(ex, eyeY + 0.6, ez);
        return { pos: camPos, look: camLook };
      }
      const kk = clamp(k, 0, 1);
      // up and back over your stern, then the look swings onto the head as its eye opens, then settles
      const up = smooth(kk / 0.35) * (1 - 0.45 * smooth((kk - 0.8) / 0.2));
      const back = 15 + 17 * up;
      const side = 5 * up;
      camPos.set(px + dx * back - dz * side, 8 + 12 * up, pz + dz * back + dx * side);
      const toHead = smooth((kk - 0.25) / 0.4);
      const midX = lerp(px, H.x, 0.55);
      const midZ = lerp(pz, H.z, 0.55);
      camLook.set(lerp(midX, ex, toHead), lerp(2.5, Math.max(eyeY, 1), toHead), lerp(midZ, ez, toHead));
      return { pos: camPos, look: camLook };
    },

    statusShip,

    read() {
      const up = tents ? tents.roots.filter((r) => r.scale.x > 0).length : 0;
      return {
        ready: api.ready,
        warming: warm === 1,
        head: !!(body && body.holder.visible && warm !== 1),
        tentacles: tents && tents.holder.visible ? up : 0,
        shadow: !!(shadow && shadow.mesh.visible),
        pearl: !!(pearl && pearl.group.visible),
        rings: counts.rings,
        fills: counts.fills,
        bubbles: counts.bubbles,
        inkBlobs: counts.inkBlobs,
        glow: eyes ? Math.round(eyes.glow * 1000) / 1000 : 0,
        eyes: eyes ? eyes.open.map((v) => Math.round(v * 100) / 100) : [0, 0],
      };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(root);
      for (const m of [fx && fx.bubbles, fx && fx.rings, fx && fx.fills]) if (m) m.dispose();
      for (const g of own.geos) g.dispose();
      for (const m of own.mats) m.dispose();
      for (const t of own.texs) t.dispose();
      for (const s of own.skels) s.dispose();
    },
  };
  return api;
}
