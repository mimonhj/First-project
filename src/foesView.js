import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { gradientMap, setOutline, noOutline, ensureIndex, INK } from './style.js';
import { waveHeight } from './scenery.js';

// The models and warning shapes of Voyage IV's pseudo foes (SPEC4 §3.1, §11.1): what foes4.js's visuals() and the
// Coral Witch's and Net Sloop's part of mechanics4.js's visuals() say, drawn.
//   boats      the Monkey Jollyboats: banana-yellow rowboats with a palm-green gunwale, a pile of coconuts in the
//              bow and a cheeky monkey in a red bandana rowing (its throwing arm goes up as it lobs a coconut);
//              a tipped boat rolls over keel up and its monkey swims home (head and paddling arms above the water).
//              ONE InstancedMesh + its inverted-hull ink twin (createRowboats: the oars row and the arms swing in
//              the vertex shader, from per-instance attributes; also the Rock Forts' gunners rowing away)
//   coconuts   the coconuts in flight, lobbed on an arc that lands as the warning runs out (spinning; still under
//              reduced motion): ONE InstancedMesh + ink twin
//   puffers    orange puffer fish with brown spots, big eyes and a pursed "o" mouth, swelling to twice their size as
//              they puff while their spikes slide out: the bodies ONE InstancedMesh + ink twin, the spikes ONE
//   coilback   Old Coilback: a teal sea serpent with a cream belly, purple fins and crest, a droopy white moustache
//              and heavy grumpy lids: neck, head, jaw, eyes and lids, three humps and a tail, ONE rigidly skinned
//              SkinnedMesh (the people.js / krakenView.js technique, 2 material groups: ink, no ink)
//   forts      a little round sandstone fort on its sea stack with a red flag and one cannon that swings after you;
//              it crumbles in three pieces when it is knocked down and its gunners row away: ONE rigidly skinned
//              SkinnedMesh a fort (2 material groups)
//   shapes     every telegraph (SPEC4 §15: shape, never colour alone): the brown dotted coconut ring with its
//              spinning coconut shadow, the spiky puffer ring pulsing at PUFFER.pulse (1 Hz), the white hatched net
//              fan, the green-and-white dashed lunge lane with arrows, the fort's red dotted line that turns solid
//              (one soft flash, opacity ≤ 0.25), the Witch's green bubbling summon rings and her ring of notes, the
//              growing fills, the Coilback's shadow under the water and its dizzy stars: TWO dynamic meshes of
//              vertex-coloured triangles rebuilt each frame (createShapes: one lies on the waves, one stands up and
//              faces the camera), noOutline
//   bubbles    the Coilback's bubble trail, the summons' bubbles, splashes, the fort's smoke and dust: ONE
//              InstancedMesh
// Draw calls: boats 2, coconuts 2, puffers 3, the Coilback 3 (ink twice + no ink), a fort 3, shapes 2, bubbles 1:
// all of it at once (two packs, six puffers, the Coilback, a fort and six warnings) = 16, one fort more 19 (SPEC4
// §14.1 / §11.1: ≤ 30). A part with nothing to show is hidden (an InstancedMesh with count 0 costs nothing).
//
// createFoesView(scene, { reducedMotion, seaY, camera, foamColor }) → {
//   prepare() → boolean,       // builds one mesh a call (call it once a frame from the level start): true when all
//                              //   are built
//   get ready,
//   update(visuals, t, dt),    // per frame: draws visuals (t: visual time, dt: 0 while paused). visuals = foes4's
//                              //   visuals() merged with mechanics4's ({ ...foes4.visuals(), ...mechanics.visuals() }:
//                              //   packs, coconuts, puffers, coilback, forts, rings, lanes, lines + nets, songs,
//                              //   summons; every field optional, junk ignored). If it has something to show before
//                              //   prepare() is done it builds the rest at once.
//   warmables() → Object3D[],  // the hidden objects for main's warmDraw (§11.2): every mesh, built if need be, with
//                              //   one instance (or triangle) far under the sea so a real first draw compiles every
//                              //   program, its ink twin's and the outline pass's; the next update() puts them back
//   read() → { … },            // test hook: what the last update drew (counts per part and shape, the pulse, the
//                              //   flash, reduced motion)
//   dispose()
// }
// reducedMotion: a boolean or a function returning one (read every frame): nothing rows, swings, spins, wiggles, bobs,
// marches or flicks; the shapes still show, fill and pulse (a pulse is ≤ 1 Hz either way), things still go where the
// simulation says. seaY(x, z, t): the sea's height (main passes ocean.heightAt). camera: the battle camera (or a
// function returning it) so the standing shapes face it (without one they face down −z). foamColor: the level's
// foam, for bubbles and splashes.
//
// Also exported for shellbackView.js (additions to §11.1): createShapes, createRowboats, createBubbles, and the
// geometry helpers they share (artHelpers).

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
const frac = (x) => x - Math.floor(x);
const hash = (n) => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const obj = (v) => v && typeof v === 'object';
const list = (v) => (Array.isArray(v) ? v : []);
const UP = V3(0, 1, 0);
const FWD = V3(0, 0, 1);
const keyOf = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : null);
// a string's hash in 0..1 (a stable phase per id)
function strHash(v) {
  let h = 2166136261;
  for (const ch of String(v)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------------------------
const C = {
  ink: 0x1d1330,
  // the Monkey Jollyboats (banana yellow and palm green)
  banana: 0xffd23f,
  bananaDeep: 0xe8a923,
  palm: 0x3f9e4a,
  palmDeep: 0x2b7a36,
  woodIn: 0x8a5a33,
  oar: 0xc08a55,
  fur: 0x8a5531,
  furDeep: 0x6b3f22,
  face: 0xf3cf9a,
  bandana: 0xe63946,
  white: 0xffffff,
  pupil: 0x1d1330,
  coconut: 0x7a4a2b,
  coconutDeep: 0x4e2c18,
  husk: 0xa8743f,
  shirt: 0x2f6fb8,
  stripe: 0xffffff,
  cap: 0xe63946,
  skin: 0xf0c39e,
  // Puffer Mines (orange with brown spots)
  puffer: 0xff8a26,
  pufferBelly: 0xffe2a8,
  pufferSpot: 0x7a3e1a,
  pufferFin: 0xffb547,
  lips: 0xff6f61,
  spike: 0xfff1d0,
  spikeTip: 0x6b3416,
  // Old Coilback (teal-green, a purple fin, a cream belly)
  teal: 0x2a9d8a,
  tealDeep: 0x1d7468,
  belly: 0xf6e7b8,
  purple: 0x7d4bb3,
  brow: 0x164a42,
  whisker: 0xf7f2e6,
  horn: 0xf0e2c0,
  mouth: 0x5a1a33,
  tongue: 0xff7a9a,
  lid: 0x238a7a,
  // Rock Forts (sandstone with a red flag)
  sand: 0xdcb67a,
  sandDeep: 0xbf9a5f,
  sandLight: 0xecd3a2,
  rock: 0x8f7a64,
  rockDeep: 0x6e5c4a,
  door: 0x5a3520,
  iron: 0x2e2a36,
  ironHi: 0x57506a,
  carriage: 0x8a5a33,
  flag: 0xe23a3a,
  pole: 0x6b4a2b,
  gold: 0xffc93c,
};
// The warning shapes' colours (each shape has its own form as well: SPEC4 §15).
const S = {
  ink: 0x1d1330,
  coconut: 0x8a5a2b,
  coconutHalo: 0xffe9c4,
  coconutFill: 0x7a4a2b,
  coconutShadow: 0x2e1a0e,
  puff: 0xff8a26,
  puffTip: 0xffe9a8,
  puffFill: 0xff8a26,
  net: 0xffffff,
  netFill: 0xf4fbff,
  lunge: 0x3fbf5f,
  lungeFill: 0x3fbf5f,
  white: 0xffffff,
  line: 0xff3b3b,
  lineDeep: 0xb3121f,
  flash: 0xffffff,
  summon: 0x3fd65a,
  summonFill: 0x1f8a3a,
  note: 0xff7f9f,
  note2: 0x2fbf9f,
  songRing: 0xffd6e2,
  star: 0xffd84a,
  shadow: 0x0e3a36,
  ball: 0x2b2733,
};

// ---------------------------------------------------------------------------------------------
// Geometry helpers (shared with shellbackView.js)
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
const qEuler = (x, y, z, o = 'XYZ') => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, o));

// A tapered tube along `path` (Vector3[]), radius(u) at u (0..1 along it), closed with rounded ends.
function tube(path, radius, radial = 10, side0 = FWD, caps = true) {
  const n = path.length;
  const T = [];
  for (let i = 0; i < n; i++) T.push(V3().subVectors(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]).normalize());
  const N = [];
  let nn = side0.clone().addScaledVector(T[0], -side0.dot(T[0]));
  if (nn.lengthSq() < 1e-8) nn = V3(1, 0, 0).addScaledVector(T[0], -T[0].x);
  nn.normalize();
  for (let i = 0; i < n; i++) {
    nn = nn.clone().addScaledVector(T[i], -nn.dot(T[i])).normalize();
    N.push(nn);
  }
  const pos = [];
  const nor = [];
  const idx = [];
  const len = [0];
  for (let i = 1; i < n; i++) len.push(len[i - 1] + path[i].distanceTo(path[i - 1]));
  const total = len[n - 1] || 1;
  for (let i = 0; i < n; i++) {
    const r = radius(len[i] / total);
    const B = V3().crossVectors(T[i], N[i]).normalize();
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const d = V3().copy(N[i]).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      pos.push(path[i].x + d.x * r, path[i].y + d.y * r, path[i].z + d.z * r);
      nor.push(d.x, d.y, d.z);
    }
  }
  const w = radial + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * w + j;
      const b = a + w;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  if (caps) {
    for (const end of [0, n - 1]) {
      const dir = end === 0 ? T[0].clone().negate() : T[n - 1];
      const tip = path[end].clone().addScaledVector(dir, radius(end === 0 ? 0 : 1) * 0.9);
      const ti = pos.length / 3;
      pos.push(tip.x, tip.y, tip.z);
      nor.push(dir.x, dir.y, dir.z);
      for (let j = 0; j < radial; j++) {
        if (end === 0) idx.push(j + 1, j, ti);
        else idx.push(end * w + j, end * w + j + 1, ti);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// A copy of a geometry pushed out along its normals by d (an inverted-hull ink twin: drawn BackSide in ink).
function inflate(g, d) {
  const c = g.clone();
  const P = c.attributes.position;
  const N = c.attributes.normal;
  for (let i = 0; i < P.count; i++) P.setXYZ(i, P.getX(i) + N.getX(i) * d, P.getY(i) + N.getY(i) * d, P.getZ(i) + N.getZ(i) * d);
  P.needsUpdate = true;
  return c;
}

// Paint and merge parts for an InstancedMesh: [{ geo, color: hex | (x, y, z, i) => hex, part }] → one indexed
// geometry with 'color' and (when any part has one) 'aPart'.
const _cc = new THREE.Color();
function paintMerge(parts, withPart = false) {
  const geos = [];
  for (const p of parts) {
    const g = p.geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position;
    const n = P.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      _cc.setHex(typeof p.color === 'function' ? p.color(P.getX(i), P.getY(i), P.getZ(i), i) : p.color);
      col[i * 3] = _cc.r;
      col[i * 3 + 1] = _cc.g;
      col[i * 3 + 2] = _cc.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (withPart) g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(p.part || 0), 1));
    ensureIndex(g);
    geos.push(g);
  }
  const out = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return out;
}

// Paint, skin and merge parts for a rigidly skinned SkinnedMesh (krakenView.js's technique): [{ geo, slot (0 ink,
// 1 no ink), color, skin: (x, y, z, i) => [b0, b1, w1] }] → { geometry (a group per slot used), slots }.
function bakeSkinned(parts, slotCount = 2) {
  const bySlot = Array.from({ length: slotCount }, () => []);
  for (const p of parts) {
    const g = p.geo;
    if (!g.attributes.normal) g.computeVertexNormals();
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
  const geos = [];
  const slots = [];
  for (let s = 0; s < slotCount; s++) {
    if (!bySlot[s].length) continue;
    geos.push(bySlot[s].length === 1 ? bySlot[s][0] : mergeGeometries(bySlot[s], false));
    if (bySlot[s].length > 1) for (const g of bySlot[s]) g.dispose();
    slots.push(s);
  }
  const geometry = mergeGeometries(geos, true);
  for (const g of geos) g.dispose();
  return { geometry, slots };
}

// The vertex-colour toon materials a skinned model uses: [bold ink, no ink] (and a thin ink one when asked).
function skinMats(name, line = 0.0052, emissive = 0x000000) {
  const make = (n, ol) => {
    const m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap(3), emissive });
    m.name = `${name}:${n}`;
    return setOutline(m, ol);
  };
  return [make('ink', { thickness: line }), make('flat', false)];
}

// A rigidly skinned model: bones by name, the parts' skin function for a bone, and the bind.
function skeletonKit(prefix) {
  const bones = {};
  const order = [];
  const bone = (name, parent, x = 0, y = 0, z = 0) => {
    const b = new THREE.Bone();
    b.name = `${prefix}-${name}`;
    b.position.set(x, y, z);
    if (parent) parent.add(b);
    bones[name] = b;
    order.push(name);
    return b;
  };
  const index = (name) => order.indexOf(name);
  const rigid = (name) => {
    const i = index(name);
    return () => [i, i, 0];
  };
  return { bones, order, bone, index, rigid };
}
function bindSkinned(geometry, mats, slots, kit, roots, name) {
  const mesh = new THREE.SkinnedMesh(geometry, slots.map((s) => mats[s]));
  mesh.name = name;
  mesh.frustumCulled = false; // it moves far from its bind pose
  mesh.userData.keep = true;
  const skeleton = new THREE.Skeleton(kit.order.map((k) => kit.bones[k]));
  const holder = new THREE.Group();
  holder.name = `${name}-holder`;
  holder.add(...roots, mesh);
  holder.updateMatrixWorld(true);
  mesh.bind(skeleton, mesh.matrixWorld);
  return { mesh, skeleton, holder };
}

export const artHelpers = Object.freeze({ strip, placed, qFromTo, qEuler, tube, inflate, paintMerge, bakeSkinned, skinMats, skeletonKit, bindSkinned });

// ---------------------------------------------------------------------------------------------
// Shapes: every warning drawn as vertex-coloured triangles in two dynamic meshes (one call each)
// ---------------------------------------------------------------------------------------------
const LIFT = 0.3; // u over the sea (the sea mesh is coarser than its waves: a little air keeps crests from poking through)
const _ca = new THREE.Vector3();
const _cb = new THREE.Vector3();
const _cv = new THREE.Vector3();
const _cp = new THREE.Vector3();
const colorCache = new Map();
const col = (hex) => {
  let c = colorCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
};

/**
 * createShapes(parent, { name, seaY, camera, capFlat, capUp }) → { begin(t), end(), flat and upright primitives,
 * meshes, count, dispose() }. The flat layer lies on the waves (each vertex at seaY + lift), the upright one stands in
 * the air facing the camera. Triangles are drawn in the order they are added (painter's order: fills, then ink, then
 * colour), both layers transparent with no depth writes, so ships in front still hide them.
 */
export function createShapes(parent, o = {}) {
  const sea = typeof o.seaY === 'function' ? o.seaY : (x, z, t) => waveHeight(x, z, t, 0.6);
  const camOf = typeof o.camera === 'function' ? o.camera : () => o.camera || null;
  const mk = (cap, name, order) => {
    const pos = new Float32Array(cap * 9);
    const cl = new Float32Array(cap * 12);
    const g = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    const ca = new THREE.BufferAttribute(cl, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', pa);
    g.setAttribute('color', ca);
    g.setDrawRange(0, 0);
    const mat = noOutline(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    mat.forceSinglePass = true;
    mat.name = name;
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = order;
    mesh.visible = false;
    mesh.userData.keep = true;
    parent.add(mesh);
    return { mesh, g, mat, pos, cl, pa, ca, n: 0, cap };
  };
  const name = o.name || 'shapes';
  const F = mk(o.capFlat || 12000, `${name}-flat`, 2);
  const U = mk(o.capUp || 6000, `${name}-up`, 3);
  let t = 0;
  // the camera's right and up (the upright shapes face it) and where it is
  const camR = V3(-1, 0, 0);
  const camU = V3(0, 1, 0);
  const camP = V3(0, 10, -1000);

  function put(L, ax, ay, az, bx, by, bz, cx, cy, cz, c, a) {
    if (L.n >= L.cap) return;
    const i = L.n++;
    const p = L.pos;
    let k = i * 9;
    p[k] = ax;
    p[k + 1] = ay;
    p[k + 2] = az;
    p[k + 3] = bx;
    p[k + 4] = by;
    p[k + 5] = bz;
    p[k + 6] = cx;
    p[k + 7] = cy;
    p[k + 8] = cz;
    const q = L.cl;
    k = i * 12;
    for (let v = 0; v < 3; v++) {
      q[k + v * 4] = c.r;
      q[k + v * 4 + 1] = c.g;
      q[k + v * 4 + 2] = c.b;
      q[k + v * 4 + 3] = a;
    }
  }
  const sy = (x, z, lift) => {
    const y = Number(sea(x, z, t));
    return (Number.isFinite(y) ? y : 0) + LIFT + lift;
  };

  // ---- flat (on the waves)
  // a filled disc; small ones take one sea height (they are flat enough), big ones one a vertex
  function disc(x, z, r, hex, a, lift = 0, seg = 0) {
    if (!(r > 0.01) || !(a > 0.004)) return;
    const n = seg || clamp(Math.round(r * 6), 10, 40);
    const c = col(hex);
    const one = r < 1.2;
    const y0 = sy(x, z, lift);
    let px = x + r;
    let pz = z;
    let py = one ? y0 : sy(px, pz, lift);
    for (let i = 1; i <= n; i++) {
      const an = (i / n) * TAU;
      const qx = x + Math.cos(an) * r;
      const qz = z + Math.sin(an) * r;
      const qy = one ? y0 : sy(qx, qz, lift);
      put(F, x, y0, z, px, py, pz, qx, qy, qz, c, a);
      px = qx;
      pz = qz;
      py = qy;
    }
  }
  // an ellipse (rx across, rz along heading h)
  function blob(x, z, rx, rz, h, hex, a, lift = 0) {
    if (!(a > 0.004)) return;
    const n = 20;
    const c = col(hex);
    const ch = Math.cos(h);
    const sh = Math.sin(h);
    const y0 = sy(x, z, lift);
    const pt = (an) => {
      const lx = Math.cos(an) * rx;
      const lz = Math.sin(an) * rz;
      return [x + lx * ch + lz * sh, z - lx * sh + lz * ch];
    };
    let [px, pz] = pt(0);
    for (let i = 1; i <= n; i++) {
      const [qx, qz] = pt((i / n) * TAU);
      put(F, x, y0, z, px, y0, pz, qx, y0, qz, c, a);
      px = qx;
      pz = qz;
    }
  }
  // a ring band from r0 to r1 between angles a0 and a1 (angles: 0 = +x, counter-clockwise seen from above)
  function band(x, z, r0, r1, hex, a, lift = 0, a0 = 0, a1 = TAU, seg = 0) {
    if (!(a > 0.004) || !(r1 > r0)) return;
    const n = seg || clamp(Math.round(((a1 - a0) * r1) / 0.9), 6, 72);
    const c = col(hex);
    let ix = 0;
    let iz = 0;
    let iy = 0;
    let ox = 0;
    let oz = 0;
    let oy = 0;
    for (let i = 0; i <= n; i++) {
      const an = a0 + ((a1 - a0) * i) / n;
      const cs = Math.cos(an);
      const sn = Math.sin(an);
      const jx = x + cs * r0;
      const jz = z + sn * r0;
      const qx = x + cs * r1;
      const qz = z + sn * r1;
      const jy = sy(jx, jz, lift);
      const qy = sy(qx, qz, lift);
      if (i > 0) {
        put(F, ix, iy, iz, ox, oy, oz, qx, qy, qz, c, a);
        put(F, ix, iy, iz, qx, qy, qz, jx, jy, jz, c, a);
      }
      ix = jx;
      iz = jz;
      iy = jy;
      ox = qx;
      oz = qz;
      oy = qy;
    }
  }
  // a polyline [x0, z0, x1, z1, ...] as a flat band w wide (mitred joints; closed when `loop`)
  function path(pts, w, hex, a, lift = 0, loop = false) {
    const n = pts.length / 2;
    if (n < 2 || !(a > 0.004)) return;
    const c = col(hex);
    const hw = w / 2;
    const L = [];
    const R = [];
    for (let i = 0; i < n; i++) {
      const ip = loop ? (i - 1 + n) % n : Math.max(0, i - 1);
      const inx = loop ? (i + 1) % n : Math.min(n - 1, i + 1);
      let dx = pts[inx * 2] - pts[ip * 2];
      let dz = pts[inx * 2 + 1] - pts[ip * 2 + 1];
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;
      const x = pts[i * 2];
      const z = pts[i * 2 + 1];
      L.push(x - dz * hw, z + dx * hw);
      R.push(x + dz * hw, z - dx * hw);
    }
    const m = loop ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % n;
      const ax = L[i * 2];
      const az = L[i * 2 + 1];
      const bx = R[i * 2];
      const bz = R[i * 2 + 1];
      const cx = R[j * 2];
      const cz = R[j * 2 + 1];
      const dx = L[j * 2];
      const dz = L[j * 2 + 1];
      const ay = sy(ax, az, lift);
      const by = sy(bx, bz, lift);
      const cy = sy(cx, cz, lift);
      const dy = sy(dx, dz, lift);
      put(F, ax, ay, az, bx, by, bz, cx, cy, cz, c, a);
      put(F, ax, ay, az, cx, cy, cz, dx, dy, dz, c, a);
    }
  }
  // a straight segment as a flat band
  function seg(x0, z0, x1, z1, w, hex, a, lift = 0) {
    path([x0, z0, x1, z1], w, hex, a, lift);
  }
  // a convex polygon [x0, z0, ...] (a fan from its first point), one sea height (small shapes)
  function poly(pts, hex, a, lift = 0) {
    const n = pts.length / 2;
    if (n < 3 || !(a > 0.004)) return;
    const c = col(hex);
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < n; i++) {
      cx += pts[i * 2];
      cz += pts[i * 2 + 1];
    }
    const y = sy(cx / n, cz / n, lift);
    for (let i = 1; i < n - 1; i++) put(F, pts[0], y, pts[1], pts[i * 2], y, pts[i * 2 + 1], pts[i * 2 + 2], y, pts[i * 2 + 3], c, a);
  }
  // a sector (fan) from (x, z) along heading h, half-angle `half`, from r0 to r1, filled
  function sector(x, z, h, half, r0, r1, hex, a, lift = 0) {
    if (!(a > 0.004) || !(r1 > r0)) return;
    // headings: x = sin, z = cos; the band() angle of heading h is π/2 − h
    const mid = PI / 2 - h;
    band(x, z, r0, r1, hex, a, lift, mid - half, mid + half, clamp(Math.round(half * r1 * 0.9), 6, 48));
  }

  // ---- upright (facing the camera)
  // a disc in the camera's plane
  function udisc(x, y, z, r, hex, a, n = 12) {
    if (!(a > 0.004) || !(r > 0.005)) return;
    const c = col(hex);
    let px = x + camR.x * r;
    let py = y + camR.y * r;
    let pz = z + camR.z * r;
    for (let i = 1; i <= n; i++) {
      const an = (i / n) * TAU;
      const cs = Math.cos(an) * r;
      const sn = Math.sin(an) * r;
      const qx = x + camR.x * cs + camU.x * sn;
      const qy = y + camR.y * cs + camU.y * sn;
      const qz = z + camR.z * cs + camU.z * sn;
      put(U, x, y, z, px, py, pz, qx, qy, qz, c, a);
      px = qx;
      py = qy;
      pz = qz;
    }
  }
  // a ribbon from a to b, w wide, turned to face the camera
  function ribbon(ax, ay, az, bx, by, bz, w, hex, a) {
    if (!(a > 0.004)) return;
    const c = col(hex);
    _ca.set(bx - ax, by - ay, bz - az);
    if (_ca.lengthSq() < 1e-8) return;
    _cv.set((ax + bx) / 2 - camP.x, (ay + by) / 2 - camP.y, (az + bz) / 2 - camP.z);
    _cb.crossVectors(_ca, _cv);
    if (_cb.lengthSq() < 1e-10) _cb.set(0, 1, 0);
    _cb.normalize().multiplyScalar(w / 2);
    put(U, ax - _cb.x, ay - _cb.y, az - _cb.z, ax + _cb.x, ay + _cb.y, az + _cb.z, bx + _cb.x, by + _cb.y, bz + _cb.z, c, a);
    put(U, ax - _cb.x, ay - _cb.y, az - _cb.z, bx + _cb.x, by + _cb.y, bz + _cb.z, bx - _cb.x, by - _cb.y, bz - _cb.z, c, a);
  }
  // a 2-D polygon [u0, v0, ...] (a fan from its first point; convex) at (x, y, z) in the camera's plane, size s,
  // turned by `rot` rad
  function ushape(x, y, z, pts, s, rot, hex, a) {
    const n = pts.length / 2;
    if (n < 3 || !(a > 0.004)) return;
    const c = col(hex);
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    const P = (i, out) => {
      const u = (pts[i * 2] * cs - pts[i * 2 + 1] * sn) * s;
      const v = (pts[i * 2] * sn + pts[i * 2 + 1] * cs) * s;
      out.set(x + camR.x * u + camU.x * v, y + camR.y * u + camU.y * v, z + camR.z * u + camU.z * v);
      return out;
    };
    P(0, _cp);
    for (let i = 1; i < n - 1; i++) {
      P(i, _ca);
      P(i + 1, _cb);
      put(U, _cp.x, _cp.y, _cp.z, _ca.x, _ca.y, _ca.z, _cb.x, _cb.y, _cb.z, c, a);
    }
  }

  const api = {
    meshes: [F.mesh, U.mesh],
    begin(time) {
      t = num(time, 0);
      F.n = 0;
      U.n = 0;
      const cam = camOf();
      if (cam && cam.matrixWorld) {
        const e = cam.matrixWorld.elements;
        camR.set(e[0], e[1], e[2]).normalize();
        camU.set(e[4], e[5], e[6]).normalize();
        camP.set(e[12], e[13], e[14]);
      }
    },
    end() {
      for (const L of [F, U]) {
        L.g.setDrawRange(0, L.n * 3);
        L.mesh.visible = L.n > 0;
        if (L.n) {
          L.pa.clearUpdateRanges();
          L.pa.addUpdateRange(0, L.n * 9);
          L.pa.needsUpdate = true;
          L.ca.clearUpdateRanges();
          L.ca.addUpdateRange(0, L.n * 12);
          L.ca.needsUpdate = true;
        }
      }
    },
    // one hidden triangle deep under the sea in each layer (warmables)
    warm() {
      for (const L of [F, U]) {
        L.n = 0;
        put(L, 0, -600, 0, 1, -600, 0, 0, -600, 1, col(S.white), 1);
        L.g.setDrawRange(0, 3);
        L.pa.needsUpdate = true;
        L.ca.needsUpdate = true;
        L.mesh.visible = false;
      }
    },
    get count() {
      return { flat: F.n, up: U.n };
    },
    get camRight() {
      return camR;
    },
    get camPos() {
      return camP;
    },
    sea: (x, z) => sy(x, z, -LIFT),
    disc,
    blob,
    band,
    path,
    seg,
    poly,
    sector,
    udisc,
    ribbon,
    ushape,
    dispose() {
      for (const L of [F, U]) {
        parent.remove(L.mesh);
        L.g.dispose();
        L.mat.dispose();
      }
    },
  };
  return api;
}

// Shapes in 2-D (for ushape): a five-point star, a musical note's parts.
const STAR = (() => {
  const p = [0, 0];
  for (let i = 0; i <= 10; i++) {
    const a = PI / 2 + (i / 10) * TAU;
    const r = i % 2 ? 0.42 : 1;
    p.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return p;
})();
const ELLIPSE = (rx, ry, n = 14) => {
  const p = [0, 0];
  for (let i = 0; i <= n; i++) p.push(Math.cos((i / n) * TAU) * rx, Math.sin((i / n) * TAU) * ry);
  return p;
};
const RECT = (x0, y0, x1, y1) => [x0, y0, x1, y0, x1, y1, x0, y1];

// ---------------------------------------------------------------------------------------------
// Bubbles: one InstancedMesh (white, tinted per instance)
// ---------------------------------------------------------------------------------------------
export function createBubbles(parent, { cap = 192, name = 'bubbles', color = 0xffffff } = {}) {
  const geo = new THREE.IcosahedronGeometry(0.3, 1);
  const mat = noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.name = name;
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color(color));
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.keep = true;
  parent.add(mesh);
  const _m = new THREE.Matrix4();
  const _p = V3();
  const _q = new THREE.Quaternion();
  const _s = V3();
  const _c = new THREE.Color();
  let n = 0;
  return {
    mesh,
    begin() {
      n = 0;
    },
    // a bubble at (x, y, z) of size s (× 0.3 u), colour hex
    add(x, y, z, s, hex = color) {
      if (n >= cap || !(s > 0.01)) return;
      _m.compose(_p.set(x, y, z), _q, _s.set(s, s, s));
      _m.toArray(mesh.instanceMatrix.array, n * 16);
      _c.setHex(hex).toArray(mesh.instanceColor.array, n * 3);
      n++;
    },
    end() {
      mesh.count = n;
      mesh.visible = n > 0;
      if (n) {
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, n * 16);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.clearUpdateRanges();
        mesh.instanceColor.addUpdateRange(0, n * 3);
        mesh.instanceColor.needsUpdate = true;
      }
    },
    warm() {
      n = 0;
      this.add(0, -600, 0, 1);
      this.end();
      mesh.visible = false;
    },
    get count() {
      return n;
    },
    dispose() {
      parent.remove(mesh);
      mesh.dispose();
      geo.dispose();
      mat.dispose();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Rowboats: one InstancedMesh + its ink twin. Every instance is a boat with a monkey and the oars, or two gunners;
// parts are shown or hidden and the oars and arms are posed in the vertex shader from per-instance attributes:
//   aShow (vec4): the hull, the monkey and its arms, the gunners, the oars
//   aAnim (vec4): the stroke's phase (rad), the throw (0..1: the right arm up), the swim (0 rowing, 1 paddling), 0
// Parts (vertex attribute aPart): 0 hull, 1 monkey, 2 left oar, 3 right oar, 4 monkey's right arm, 5 gunners,
// 6 monkey's left arm. A hidden part collapses to the origin (no triangles).
// ---------------------------------------------------------------------------------------------
const BOAT = { len: 3.2, wid: 1.4, oarX: 0.66, oarY: 0.38, oarZ: 0.0, shY: 0.86, shX: 0.27, shZ: 0.02 };
const ROW_GLSL = /* glsl */ `
attribute float aPart;
attribute vec4 aShow;
attribute vec4 aAnim;
mat3 rbX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rbY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rbZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
void rbPose(inout vec3 p, inout vec3 n) {
  float part = aPart;
  float show = aShow.y;
  if (part < 0.5) show = aShow.x;
  else if (part > 1.5 && part < 3.5) show = aShow.w;
  else if (part > 4.5 && part < 5.5) show = aShow.z;
  if (part > 1.5 && part < 3.5) {
    // an oar: it sweeps fore and aft about its oarlock, the blade lifting on the way back
    float sd = part < 2.5 ? 1.0 : -1.0;
    vec3 piv = vec3(sd * ${BOAT.oarX.toFixed(3)}, ${BOAT.oarY.toFixed(3)}, ${BOAT.oarZ.toFixed(3)});
    mat3 R = rbY(sd * 0.5 * sin(aAnim.x)) * rbZ(sd * (0.06 - 0.2 * cos(aAnim.x)));
    p = piv + R * (p - piv);
    n = R * n;
  } else if ((part > 3.5 && part < 4.5) || (part > 5.5 && part < 6.5)) {
    // an arm: it swings with the stroke (rowing) or paddles (swimming); the right one goes up to throw
    float sd = part < 5.0 ? -1.0 : 1.0;
    vec3 piv = vec3(sd * ${BOAT.shX.toFixed(3)}, ${BOAT.shY.toFixed(3)}, ${BOAT.shZ.toFixed(3)});
    float row = -0.45 * sin(aAnim.x);
    float swim = 1.25 * sin(aAnim.x + (sd > 0.0 ? 3.14159 : 0.0)) - 0.3;
    float a = mix(row, swim, aAnim.z);
    if (sd < 0.0) a = mix(a, -2.6, aAnim.y);
    mat3 R = rbX(a);
    p = piv + R * (p - piv);
    n = R * n;
  }
  p *= show;
}
`;
function rowShader(mat, key, withNormal) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${ROW_GLSL}`);
    if (withNormal) sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n{ vec3 rbp = position; rbPose(rbp, objectNormal); }');
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n{ vec3 rbn = vec3(0.0, 1.0, 0.0); rbPose(transformed, rbn); }');
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

function boatGeometry() {
  const parts = [];
  const add = (geo, color, part = 0) => parts.push({ geo: strip(geo), color, part });
  const L = BOAT.len / 2;
  const W = BOAT.wid / 2;
  // the hull: a squashed egg, open-looking (a recessed brown floor inside a palm-green gunwale), the bow sheered up
  const hull = new THREE.SphereGeometry(1, 28, 14);
  const P = hull.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i);
    let y = P.getY(i);
    const z = P.getZ(i);
    y = y > 0 ? y * 0.12 : y * 0.62;
    const zz = z * L;
    const sheer = Math.max(0, zz / L - 0.35) * 0.32;
    P.setXYZ(i, x * W * (1 - 0.18 * Math.max(0, zz / L) ** 2), y + 0.34 + sheer, zz);
  }
  hull.computeVertexNormals();
  add(hull, (x, y, z) => (y > 0.36 + Math.max(0, z / L - 0.35) * 0.32 ? C.woodIn : y < 0.04 ? C.bananaDeep : C.banana));
  // the gunwale: a palm-green rim round the top
  const rim = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * TAU;
    const z = Math.cos(a) * L * 0.97;
    const x = Math.sin(a) * W * 0.97 * (1 - 0.18 * Math.max(0, z / L) ** 2);
    rim.push(V3(x, 0.4 + Math.max(0, z / L - 0.35) * 0.32, z));
  }
  add(tube(rim, () => 0.075, 6, UP, false), C.palm);
  // a thwart (seat) and the oarlocks
  add(new THREE.CapsuleGeometry(0.08, BOAT.wid * 0.7, 3, 6).rotateZ(PI / 2).translate(0, 0.36, -0.08), C.palmDeep);
  for (const sd of [-1, 1]) add(new THREE.SphereGeometry(0.08, 6, 5).translate(sd * BOAT.oarX, BOAT.oarY + 0.05, BOAT.oarZ), C.palmDeep);
  // coconuts piled in the bow (three) and a banana-leaf pennant on a stick at the stern
  for (const [x, y, z] of [[0, 0.46, 1.0], [-0.2, 0.42, 0.82], [0.2, 0.42, 0.84]]) add(new THREE.SphereGeometry(0.17, 9, 7).translate(x, y, z), C.coconut);
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 5).translate(0, 0.75, -1.38), C.oar);
  const leaf = new THREE.SphereGeometry(1, 10, 6);
  leaf.scale(0.05, 0.18, 0.34).rotateX(-0.25).translate(0, 1.1, -1.62);
  add(leaf, C.palm);
  // the oars (left part 2, right part 3): from the handle by the monkey's hand, through the oarlock, down to a
  // banana-yellow blade in the water
  for (const [sd, part] of [[1, 2], [-1, 3]]) {
    const shaft = tube([V3(sd * 0.3, 0.62, 0.22), V3(sd * BOAT.oarX, BOAT.oarY, BOAT.oarZ), V3(sd * 1.42, 0.02, -0.32)], () => 0.045, 6, UP);
    add(shaft, C.oar, part);
    const blade = new THREE.SphereGeometry(1, 8, 6);
    blade.scale(0.32, 0.05, 0.15).rotateY(sd * 0.35).rotateZ(sd * -0.4).translate(sd * 1.5, -0.02, -0.35);
    add(blade, C.banana, part);
  }
  // the monkey (part 1), sitting on the thwart facing the bow: body, tan belly, head, muzzle, ears, eyes, a red bandana
  const body = new THREE.SphereGeometry(0.3, 14, 10);
  body.scale(1, 1.15, 0.9).translate(0, 0.66, 0);
  add(body, (x, y, z) => (z > 0.13 && Math.abs(x) < 0.2 ? C.face : C.fur), 1);
  const head = new THREE.SphereGeometry(0.27, 16, 12).translate(0, 1.12, 0.03);
  add(head, (x, y, z) => (z > 0.12 && y < 1.2 ? C.face : C.fur), 1);
  const muzzle = new THREE.SphereGeometry(0.16, 12, 8);
  muzzle.scale(1.2, 0.85, 0.8).translate(0, 1.04, 0.24);
  add(muzzle, C.face, 1);
  for (const sd of [-1, 1]) {
    const ear = new THREE.SphereGeometry(0.11, 10, 8);
    ear.scale(0.6, 1, 1).translate(sd * 0.29, 1.15, 0);
    add(ear, (x) => (Math.abs(x) > 0.3 ? C.face : C.fur), 1);
    add(new THREE.SphereGeometry(0.07, 10, 8).translate(sd * 0.1, 1.2, 0.24), C.white, 1);
    add(new THREE.SphereGeometry(0.038, 8, 6).translate(sd * 0.1, 1.2, 0.3), C.pupil, 1);
  }
  add(new THREE.SphereGeometry(0.035, 6, 5).scale(1.6, 1, 1).translate(0, 1.0, 0.36), C.furDeep, 1); // the grin
  const band0 = new THREE.TorusGeometry(0.255, 0.05, 6, 20).rotateX(PI / 2).translate(0, 1.27, 0.02);
  add(band0, C.bandana, 1);
  add(new THREE.SphereGeometry(0.07, 6, 5).translate(0, 1.27, -0.26), C.bandana, 1); // the knot
  // its tail, curling up behind it
  const tail = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    const a = u * PI * 1.4;
    tail.push(V3(0, 0.5 + Math.sin(a) * 0.35 + u * 0.3, -0.25 - Math.sin(a * 0.5) * 0.45 + (1 - Math.cos(a)) * 0.08));
  }
  add(tube(tail, (u) => 0.06 * (1 - u * 0.5), 6, UP), C.fur, 1);
  // its arms (right part 4, left part 6): from the shoulder forward to the oars' handles
  for (const [sd, part] of [[-1, 4], [1, 6]]) {
    const arm = tube([V3(sd * BOAT.shX, BOAT.shY, BOAT.shZ), V3(sd * 0.42, 0.72, 0.16), V3(sd * 0.32, 0.63, 0.24)], () => 0.07, 6, FWD);
    add(arm, C.fur, part);
    add(new THREE.SphereGeometry(0.085, 8, 6).translate(sd * 0.32, 0.62, 0.26), C.face, part);
  }
  // the gunners (part 5): two little sailors in striped shirts and red caps, one at each end
  for (const [z, f] of [[0.55, -1], [-0.6, 1]]) {
    add(new THREE.CapsuleGeometry(0.2, 0.25, 4, 8).translate(0, 0.66, z), (x, y) => (Math.floor((y - 0.4) / 0.09) % 2 ? C.stripe : C.shirt), 5);
    add(new THREE.SphereGeometry(0.18, 12, 9).translate(0, 1.07, z), C.skin, 5);
    add(new THREE.SphereGeometry(0.19, 12, 6, 0, TAU, 0, PI * 0.45).translate(0, 1.12, z), C.cap, 5);
    for (const sd of [-1, 1]) add(new THREE.SphereGeometry(0.035, 6, 5).translate(sd * 0.07, 1.1, z + f * -0.16), C.pupil, 5);
  }
  return paintMerge(parts, true);
}

/**
 * createRowboats(parent, { cap, name }) → { begin(), boat(x, y, z, yaw, pitch, roll, show, anim), end(), warm(),
 * get count, meshes, dispose() }. show = [hull, monkey, gunners, oars], anim = [phase, throw, swim, 0].
 */
export function createRowboats(parent, { cap = 24, name = 'rowboats' } = {}) {
  const geo = boatGeometry();
  const inkGeo = inflate(geo, 0.045);
  const showA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const animA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
  for (const g of [geo, inkGeo]) {
    g.setAttribute('aShow', showA);
    g.setAttribute('aAnim', animA);
  }
  const mat = rowShader(noOutline(new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap(3) })), 'foes-rowboat', true);
  const inkMat = rowShader(noOutline(new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(INK[0], INK[1], INK[2]), side: THREE.BackSide })), 'foes-rowboat-ink', false);
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  const ink = new THREE.InstancedMesh(inkGeo, inkMat, cap);
  ink.instanceMatrix = mesh.instanceMatrix; // (one set of matrices for both)
  mesh.name = name;
  ink.name = `${name}-ink`;
  for (const m of [mesh, ink]) {
    m.count = 0;
    m.frustumCulled = false;
    m.visible = false;
    m.userData.keep = true;
    parent.add(m);
  }
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const _m = new THREE.Matrix4();
  const _p = V3();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _s = V3(1, 1, 1);
  let n = 0;
  return {
    meshes: [mesh, ink],
    begin() {
      n = 0;
    },
    boat(x, y, z, yaw, pitch, roll, show, anim, scale = 1) {
      if (n >= cap) return;
      _e.set(pitch, yaw, roll, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_p.set(x, y, z), _q, _s.setScalar(scale));
      _m.toArray(mesh.instanceMatrix.array, n * 16);
      showA.array.set(show, n * 4);
      animA.array.set(anim, n * 4);
      n++;
    },
    end() {
      mesh.count = ink.count = n;
      mesh.visible = ink.visible = n > 0;
      if (n) {
        for (const a of [mesh.instanceMatrix, showA, animA]) {
          a.clearUpdateRanges();
          a.addUpdateRange(0, n * a.itemSize);
          a.needsUpdate = true;
        }
      }
    },
    warm() {
      n = 0;
      this.boat(0, -600, 0, 0, 0, 0, [1, 1, 1, 1], [0, 0, 0, 0]);
      this.end();
      mesh.visible = ink.visible = false;
    },
    get count() {
      return n;
    },
    dispose() {
      for (const m of [mesh, ink]) {
        parent.remove(m);
        m.dispose();
      }
      geo.dispose();
      inkGeo.dispose();
      mat.dispose();
      inkMat.dispose();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------------------------
const CAP = { boats: 24, coconuts: 12, puffers: 12, bubbles: 220, forts: 3 };
const PUFF_R = 0.9; // PUFFER.r
const PUFF_SWELL = 2; // × its size, puffed
const PUFF_POP_R = 4;
const PUFF_PULSE = 1; // Hz (PUFFER.pulse; SPEC4 §15: ≤ 1 Hz)
const COCO_R = 2.2;
const COCO_ARC = 6;
const JOLLY_TIP = 3; // s a tipped boat shows (JOLLY.tip)
const PUFF_HOME = 3; // s a puffer swimming home shows
const COIL = { headY: 2.5, neckLen: 4.2, gap: 3, home: 5 };
const FORT = { base: 4.3, gunY: 6.5, down: 6 };
// the fort's lock: one soft flash (SPEC4 §0.1 / §15: ≤ 0.25 opacity, ≤ one per 3 s: a lock within `gap` s of the last
// flash of the same view, another fort's or tower's too, turns solid without one)
const FLASH = { alpha: 0.24, time: 0.3, gap: 3 };
const NOTE_R = 6.2; // u: the Witch's ring of notes round her ship
const SUMMON_GROW = 1.6; // the summon rings are drawn this much bigger than where a puffer rises (r 1.6)

// A puffer, in its own frame (r 1; +z its nose): body, belly, spots, eyes, lips, fins, tail.
function pufferGeometry() {
  const parts = [];
  const add = (geo, color) => parts.push({ geo: strip(geo), color });
  const spots = [];
  for (let i = 0; i < 9; i++) {
    const a = hash(i * 3.1) * TAU;
    const up = 0.25 + 0.6 * hash(i * 7.7);
    spots.push(V3(Math.cos(a) * Math.sqrt(1 - up * up), up, Math.sin(a) * Math.sqrt(1 - up * up) - 0.15).normalize());
  }
  const body = new THREE.SphereGeometry(1, 28, 20);
  add(body, (x, y, z) => {
    const d = V3(x, y, z);
    if (y < -0.25) return C.pufferBelly;
    for (const s of spots) if (d.dot(s) > 0.955 && !(z > 0.55 && y > 0.05)) return C.pufferSpot;
    return C.puffer;
  });
  for (const sd of [-1, 1]) {
    add(new THREE.SphereGeometry(0.3, 14, 10).translate(sd * 0.42, 0.4, 0.74), C.white);
    add(new THREE.SphereGeometry(0.15, 10, 8).translate(sd * 0.44, 0.42, 0.98), C.pupil);
    add(new THREE.SphereGeometry(0.05, 6, 5).translate(sd * 0.4, 0.5, 1.07), C.white);
    // a side fin
    const f = new THREE.SphereGeometry(1, 10, 6);
    f.scale(0.06, 0.2, 0.3).rotateZ(sd * 0.4).translate(sd * 0.98, -0.1, 0.05);
    add(f, C.pufferFin);
  }
  add(new THREE.TorusGeometry(0.13, 0.06, 6, 14).translate(0, -0.08, 1.0), C.lips);
  // the tail fin: two lobes
  for (const sd of [-1, 1]) {
    const t = new THREE.SphereGeometry(1, 10, 6);
    t.scale(0.06, 0.3, 0.32).rotateX(sd * 0.55).translate(0, sd * 0.18, -1.18);
    add(t, C.pufferFin);
  }
  // a little dorsal fin
  const d = new THREE.SphereGeometry(1, 10, 6);
  d.scale(0.05, 0.26, 0.3).translate(0, 0.98, -0.25);
  add(d, C.pufferFin);
  return paintMerge(parts);
}
// The spikes, one ball of them (tips at r 1, bases at r 0.66; cream with dark tips).
function spikeGeometry() {
  const parts = [];
  const N = 34;
  for (let i = 0; i < N; i++) {
    // a Fibonacci sphere, missing the face and the tail
    const y = 1 - (2 * (i + 0.5)) / N;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.39996;
    const d = V3(Math.cos(a) * r, y, Math.sin(a) * r);
    if (d.z > 0.72 || d.z < -0.85) continue;
    const g = new THREE.ConeGeometry(0.09, 0.36, 6, 1);
    g.translate(0, 0.82, 0);
    g.applyQuaternion(qFromTo(UP, d));
    parts.push({ geo: strip(g), color: (x, yy, z) => (Math.hypot(x, yy, z) > 0.9 ? C.spikeTip : C.spike) });
  }
  return paintMerge(parts);
}
// A coconut (r 0.34): brown, a lighter husk band, three dark eyes on top.
function coconutGeometry() {
  const parts = [];
  const g = new THREE.SphereGeometry(0.34, 14, 10);
  g.scale(1, 1.1, 1);
  parts.push({ geo: strip(g), color: (x, y) => (Math.abs(y) < 0.06 ? C.husk : C.coconut) });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    parts.push({ geo: strip(new THREE.SphereGeometry(0.06, 6, 5).translate(Math.cos(a) * 0.1, 0.34, Math.sin(a) * 0.1)), color: C.coconutDeep });
  }
  return paintMerge(parts);
}

export function createFoesView(scene, opts = {}) {
  const o = obj(opts) ? opts : {};
  const rm = typeof o.reducedMotion === 'function' ? () => !!o.reducedMotion() : () => !!o.reducedMotion;
  const seaFn = typeof o.seaY === 'function' ? o.seaY : (x, z, t) => waveHeight(x, z, t, 0.6);
  const sea = (x, z, t) => {
    const y = Number(seaFn(x, z, t));
    return Number.isFinite(y) ? y : 0;
  };
  const foam = num(o.foamColor, 0xf4ffe0);
  const root = new THREE.Group();
  root.name = 'foes4';
  scene.add(root);
  let disposed = false;
  const own = { geos: [], mats: [], skels: [] };

  // ---- parts (null until built)
  let shapes = null;
  let bubbles = null;
  let boats = null;
  let nuts = null; // { mesh, ink }
  let puff = null; // { body, ink, spikes }
  let coil = null; // { holder, mesh, bones }
  const forts = []; // [{ holder, mesh, bones, used }]
  let fortMats = null;

  // ---- builders
  function buildShapes() {
    shapes = createShapes(root, { name: 'foes4-shapes', seaY: sea, camera: o.camera });
  }
  function buildBubbles() {
    bubbles = createBubbles(root, { cap: CAP.bubbles, name: 'foes4-bubbles', color: foam });
  }
  function buildBoats() {
    boats = createRowboats(root, { cap: CAP.boats, name: 'foes4-boats' });
  }
  function instanced(geo, inkD, cap, name, inkOn = true) {
    const mat = noOutline(new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap(3) }));
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.name = name;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    own.geos.push(geo);
    own.mats.push(mat);
    const out = { mesh, ink: null };
    if (inkOn) {
      const ig = inflate(geo, inkD);
      const im = noOutline(new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(INK[0], INK[1], INK[2]), side: THREE.BackSide }));
      const ink = new THREE.InstancedMesh(ig, im, cap);
      ink.instanceMatrix = mesh.instanceMatrix;
      ink.name = `${name}-ink`;
      own.geos.push(ig);
      own.mats.push(im);
      out.ink = ink;
    }
    for (const m of [out.mesh, out.ink]) {
      if (!m) continue;
      m.count = 0;
      m.frustumCulled = false;
      m.visible = false;
      m.userData.keep = true;
      root.add(m);
    }
    return out;
  }
  function buildCoconuts() {
    nuts = instanced(coconutGeometry(), 0.035, CAP.coconuts, 'foes4-coconuts');
  }
  function buildPuffers() {
    const b = instanced(pufferGeometry(), 0.06, CAP.puffers, 'foes4-puffers');
    const s = instanced(spikeGeometry(), 0, CAP.puffers, 'foes4-spikes', false);
    puff = { body: b.mesh, ink: b.ink, spikes: s.mesh };
  }
  function buildCoilback() {
    const mats = skinMats('coilback', 0.005, 0x0a2a26);
    own.mats.push(...mats);
    const K = skeletonKit('coil');
    const B = K.bones;
    const NL = COIL.neckLen;
    K.bone('root', null);
    const n0 = K.bone('neck0', B.root, 0, 0, 0);
    const n1 = K.bone('neck1', n0, 0, NL / 3, 0);
    const n2 = K.bone('neck2', n1, 0, NL / 3, 0);
    const hd = K.bone('head', n2, 0, NL / 3, 0);
    K.bone('jaw', hd, 0, -0.28, 0.35);
    K.bone('pupilL', hd, 0.52, 0.52, 0.42);
    K.bone('pupilR', hd, -0.52, 0.52, 0.42);
    K.bone('lidL', hd, 0.52, 0.52, 0.42);
    K.bone('lidR', hd, -0.52, 0.52, 0.42);
    for (let i = 0; i < 3; i++) K.bone(`hump${i}`, B.root, 0, 0, 0);
    K.bone('tail', B.root, 0, 0, 0);
    B.root.updateMatrixWorld(true);
    const parts = [];
    const INKS = 0;
    const FLAT = 1;
    // head space: the head bone's place in the bind pose (0, NL, 0), +z the snout
    const H = V3(0, NL, 0);
    const at = (x, y, z) => V3(x, y, z).add(H);
    const add = (geo, b, slot, color) => parts.push({ geo: strip(geo), slot, color, skin: K.rigid(b) });
    // the neck: a tube up its +y, cream at the front (its belly), smoothly weighted over neck0..neck2 and the head
    const path = [];
    for (let i = 0; i <= 24; i++) path.push(V3(0, -1.2 + (i / 24) * (NL + 1.2), 0));
    const neck = tube(path, (u) => 0.82 - 0.16 * u, 14, FWD);
    const iN0 = K.index('neck0');
    parts.push({
      geo: neck,
      slot: INKS,
      color: (x, y, z) => (z > 0.38 ? C.belly : C.teal),
      skin: (x, y) => {
        const f = clamp(y / (NL / 3), 0, 3);
        const b = Math.min(2, Math.floor(f));
        return [iN0 + b, iN0 + b + 1 > iN0 + 2 ? K.index('head') : iN0 + b + 1, b === 2 ? clamp((f - 2) * 0.5, 0, 0.6) : clamp(f - b, 0, 1)];
      },
    });
    // the purple crest fins down the back of the neck
    for (let i = 0; i < 4; i++) {
      const y = 0.3 + i * 0.95;
      const f = new THREE.SphereGeometry(1, 10, 6);
      f.scale(0.07, 0.42, 0.5).rotateX(-0.5).translate(0, y, -0.72);
      const b = y < NL / 3 ? 'neck0' : y < (2 * NL) / 3 ? 'neck1' : 'neck2';
      add(f, b, INKS, C.purple);
    }
    // the head: a broad skull, a long snout, cheeks, nostrils, little cream horns, a purple frill
    const skull = new THREE.SphereGeometry(1, 24, 16);
    skull.scale(0.95, 0.78, 1.05).translate(H.x, H.y + 0.1, H.z - 0.05);
    add(skull, 'head', INKS, (x, y, z) => (y < H.y - 0.15 && z > H.z ? C.belly : C.teal));
    const snout = new THREE.SphereGeometry(1, 22, 14);
    snout.scale(0.66, 0.42, 0.95).translate(H.x, H.y + 0.02, H.z + 0.95);
    add(snout, 'head', INKS, (x, y) => (y < H.y - 0.1 ? C.belly : C.teal));
    for (const sd of [-1, 1]) {
      add(new THREE.SphereGeometry(0.07, 8, 6).translate(H.x + sd * 0.24, H.y + 0.28, H.z + 1.78), 'head', FLAT, C.tealDeep);
      const horn = tube([at(sd * 0.42, 0.62, -0.35), at(sd * 0.55, 0.98, -0.62), at(sd * 0.5, 1.12, -0.88)], (u) => 0.13 * (1 - u * 0.7), 8, FWD);
      add(horn, 'head', INKS, C.horn);
      // the frill behind the cheeks
      const fr = new THREE.SphereGeometry(1, 10, 6);
      fr.scale(0.06, 0.5, 0.42).rotateY(sd * 0.5).rotateZ(sd * -0.5).translate(H.x + sd * 0.9, H.y + 0.15, H.z - 0.55);
      add(fr, 'head', INKS, C.purple);
      // a droopy white moustache: one long whisker each side, from the snout down past the jaw
      const wk = tube([at(sd * 0.42, -0.08, 1.45), at(sd * 0.85, -0.25, 1.38), at(sd * 1.15, -0.65, 1.1), at(sd * 1.22, -1.05, 0.85)], (u) => 0.1 * (1 - u * 0.65), 8, UP);
      add(wk, 'head', INKS, C.whisker);
      // grumpy brows: thick, the inner ends down
      const brow = new THREE.CapsuleGeometry(0.12, 0.42, 4, 8).rotateZ(PI / 2).rotateZ(sd * -0.42).rotateY(sd * 0.3);
      add(placed(brow, at(sd * 0.5, 0.98, 0.42)), 'head', INKS, C.brow);
    }
    const crest = new THREE.SphereGeometry(1, 12, 6);
    crest.scale(0.08, 0.5, 0.75).translate(H.x, H.y + 0.85, H.z - 0.45);
    add(crest, 'head', INKS, C.purple);
    // the jaw (on its bone, opening down): a cream lower snout, a dark mouth, a pink tongue, two little teeth
    const J = V3(0, NL - 0.28, 0.35);
    const jaw = new THREE.SphereGeometry(1, 18, 10, 0, TAU, PI * 0.42, PI * 0.58);
    jaw.scale(0.6, 0.42, 0.9).translate(J.x, J.y + 0.08, J.z + 0.6);
    add(jaw, 'jaw', INKS, C.belly);
    const mouth = new THREE.SphereGeometry(1, 14, 6, 0, TAU, 0, PI * 0.5);
    mouth.scale(0.5, 0.12, 0.8).translate(J.x, J.y + 0.07, J.z + 0.62);
    add(mouth, 'jaw', FLAT, C.mouth);
    const tg = new THREE.SphereGeometry(1, 10, 6);
    tg.scale(0.2, 0.06, 0.4).translate(J.x, J.y + 0.12, J.z + 0.55);
    add(tg, 'jaw', FLAT, C.tongue);
    for (const sd of [-1, 1]) add(new THREE.ConeGeometry(0.07, 0.2, 6).rotateX(PI).translate(H.x + sd * 0.3, H.y - 0.32, H.z + 1.55), 'head', FLAT, C.white);
    // the eyes: white balls with pupils on their own bones (they look about, and spin when it is dizzy) under heavy
    // teal lids (on lid bones: half shut, grumpy; they blink)
    for (const [sd, pb, lb] of [[1, 'pupilL', 'lidL'], [-1, 'pupilR', 'lidR']]) {
      const c = V3(sd * 0.52, NL + 0.52, 0.42);
      add(new THREE.SphereGeometry(0.34, 18, 12).translate(c.x, c.y, c.z), 'head', FLAT, C.white);
      const pq = qFromTo(UP, V3(0, 0.15, 1));
      add(placed(new THREE.SphereGeometry(0.345, 14, 6, 0, TAU, 0, 0.62), c, pq), pb, FLAT, C.pupil);
      add(placed(new THREE.SphereGeometry(0.35, 8, 4, 0, TAU, 0, 0.18), c, qFromTo(UP, V3(0.25 * sd, 0.55, 1))), pb, FLAT, C.white);
      const lid = new THREE.SphereGeometry(0.37, 18, 10, 0, TAU, 0, PI * 0.5);
      add(placed(lid, c, qEuler(-0.35, 0, 0)), lb, INKS, C.lid);
    }
    // three humps: half-ring arches standing out of the water along its path, a purple fin on each
    for (let i = 0; i < 3; i++) {
      const R = 1.15 - i * 0.12;
      const tr = 0.74 - i * 0.08;
      const g = new THREE.TorusGeometry(R, tr, 12, 18, PI);
      g.rotateY(PI / 2); // the arch along z
      add(g, `hump${i}`, INKS, (x, y) => (y < R * 0.25 ? C.belly : C.teal));
      const f = new THREE.SphereGeometry(1, 10, 6);
      f.scale(0.07, 0.45 - i * 0.05, 0.55 - i * 0.06).translate(0, R + tr * 0.85, -0.1);
      add(f, `hump${i}`, INKS, C.purple);
    }
    // the tail: a tapering curl out of the water with a purple fan fin
    const tp = [];
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      tp.push(V3(0, -0.5 + Math.sin(u * PI * 0.8) * 1.5, -u * 2.6));
    }
    add(tube(tp, (u) => 0.55 * (1 - u * 0.8) + 0.05, 10, UP), 'tail', INKS, (x, y) => (y < 0.2 ? C.belly : C.teal));
    const tf = new THREE.SphereGeometry(1, 12, 6);
    tf.scale(0.07, 0.7, 0.55).rotateX(0.6).translate(0, 1.0, -2.75);
    add(tf, 'tail', INKS, C.purple);
    const { geometry, slots } = bakeSkinned(parts, 2);
    own.geos.push(geometry);
    const roots = [B.root];
    const b = bindSkinned(geometry, mats, slots, K, roots, 'foes4-coilback');
    own.skels.push(b.skeleton);
    b.holder.visible = false;
    root.add(b.holder);
    coil = { ...b, bones: B, blinkAt: 2, spin: 0, trail: [] };
  }
  function buildFort() {
    if (forts.length >= CAP.forts) return null;
    if (!fortMats) {
      fortMats = skinMats('fort', 0.0055);
      own.mats.push(...fortMats);
    }
    const K = skeletonKit(`fort${forts.length}`);
    const B = K.bones;
    K.bone('root', null);
    for (let k = 0; k < 3; k++) {
      const am = (k / 3) * TAU + 0.35 + TAU / 6;
      K.bone(`chunk${k}`, B.root, Math.sin(am) * 2.45, 0, Math.cos(am) * 2.45).rotation.set(0, am, 0);
    }
    K.bone('gun', B.root, 0, 1.9, 0);
    K.bone('pole', B.root, -1.25, 1.9, -1.1);
    K.bone('flag', B.pole, 0, 2.3, 0);
    B.root.updateMatrixWorld(true);
    const parts = [];
    const INKS = 0;
    const FLAT = 1;
    const add = (geo, b, slot, color) => parts.push({ geo: strip(geo), slot, color, skin: K.rigid(b) });
    const stone = (x, y, z) => {
      const h = hash(Math.floor(x * 1.7) * 13.1 + Math.floor(y * 2.2) * 7.3 + Math.floor(z * 1.7) * 3.7);
      return h < 0.25 ? C.sandDeep : h > 0.82 ? C.sandLight : C.sand;
    };
    // the crown of the sea stack it stands on (rock lumps, below y 0), on the root
    const crown = new THREE.SphereGeometry(1, 18, 10);
    crown.scale(2.9, 1.4, 2.9).translate(0, -1.1, 0);
    add(crown, 'root', INKS, (x, y, z) => (hash(Math.floor(x * 2) + Math.floor(z * 2) * 5) > 0.6 ? C.rockDeep : C.rock));
    // the walls in three pieces (120° each, on chunk bones: they fall outward when it is knocked down), with
    // merlons on top, the platform inside, a door
    for (let k = 0; k < 3; k++) {
      const a0 = (k / 3) * TAU + 0.35;
      const w = new THREE.CylinderGeometry(2.3, 2.55, 2.0, 10, 1, false, a0, TAU / 3 - 0.06);
      w.translate(0, 0.95, 0);
      add(w, `chunk${k}`, INKS, stone);
      // the inner face (so the wall has a thickness from above)
      const wi = new THREE.CylinderGeometry(1.85, 1.85, 1.7, 10, 1, true, a0, TAU / 3 - 0.06);
      const P = wi.attributes.position;
      const Nn = wi.attributes.normal;
      for (let i = 0; i < Nn.count; i++) Nn.setXYZ(i, -Nn.getX(i), -Nn.getY(i), -Nn.getZ(i));
      wi.index.array.reverse();
      wi.translate(0, 1.1, 0);
      add(wi, `chunk${k}`, FLAT, C.sandDeep);
      void P;
      // the top of the wall
      const top = new THREE.RingGeometry(1.85, 2.3, 10, 1, a0, TAU / 3 - 0.06).rotateX(-PI / 2).translate(0, 1.95, 0);
      add(top, `chunk${k}`, FLAT, C.sandLight);
      for (let m = 0; m < 3; m++) {
        const a = a0 + ((m + 0.5) / 3) * (TAU / 3 - 0.06);
        const mg = new THREE.CapsuleGeometry(0.28, 0.28, 3, 8);
        mg.scale(1, 1, 0.75);
        add(placed(mg, V3(Math.sin(a) * 2.1, 2.3, Math.cos(a) * 2.1), qEuler(0, a, 0)), `chunk${k}`, INKS, stone);
      }
    }
    // the platform and the gun deck
    add(new THREE.CylinderGeometry(1.9, 1.9, 0.3, 16).translate(0, 1.72, 0), 'gun', INKS, C.sandDeep);
    // the door (on the front wall, under the gun)
    const door = new THREE.SphereGeometry(1, 12, 8);
    door.scale(0.5, 0.72, 0.16).translate(0, 0.5, 2.44);
    add(door, 'chunk0', FLAT, C.door);
    // the gun: a wooden carriage with two wheels and an iron barrel (on the gun bone, aiming along +z)
    const cg = new THREE.CapsuleGeometry(0.32, 0.6, 4, 8).rotateX(PI / 2);
    // (the gun's bone turns about the deck's middle: the deck turns with it, unseen)
    cg.scale(1.3, 0.75, 1);
    add(placed(cg, V3(0, 2.08, 0.2)), 'gun', INKS, C.carriage);
    for (const sd of [-1, 1]) add(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 12).rotateZ(PI / 2).translate(sd * 0.48, 2.02, 0.35), 'gun', INKS, C.carriage);
    const barrel = tube([V3(0, 2.5, -0.35), V3(0, 2.56, 0.6), V3(0, 2.6, 1.45)], (u) => 0.27 - 0.07 * u, 12, UP);
    add(barrel, 'gun', INKS, C.iron);
    add(new THREE.TorusGeometry(0.22, 0.08, 6, 14).translate(0, 2.6, 1.5), 'gun', INKS, C.ironHi);
    // the pole and the red flag (a swallowtail on its own bone)
    add(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6).translate(-1.25, 1.9 + 1.25, -1.1), 'pole', INKS, C.pole);
    add(new THREE.SphereGeometry(0.12, 8, 6).translate(-1.25, 1.9 + 2.6, -1.1), 'pole', INKS, C.gold);
    const fs = new THREE.Shape();
    fs.moveTo(0, 0);
    fs.lineTo(1.5, 0.05);
    fs.lineTo(1.1, -0.42);
    fs.lineTo(1.5, -0.9);
    fs.lineTo(0, -0.85);
    fs.closePath();
    const flag = new THREE.ExtrudeGeometry(fs, { depth: 0.05, bevelEnabled: false });
    flag.translate(0, 0, -0.025).rotateY(PI / 2);
    add(placed(flag, V3(-1.25, 1.9 + 2.3, -1.1)), 'flag', INKS, C.flag);
    const { geometry, slots } = bakeSkinned(parts, 2);
    own.geos.push(geometry);
    const b = bindSkinned(geometry, fortMats, slots, K, [B.root], `foes4-fort${forts.length}`);
    own.skels.push(b.skeleton);
    b.holder.visible = false;
    root.add(b.holder);
    const f = { ...b, bones: B, key: null, aim: 0, lockAt: -Infinity, wasLock: false, lastDown: null };
    forts.push(f);
    return f;
  }

  const builders = [buildShapes, buildBubbles, buildBoats, buildCoconuts, buildPuffers, buildCoilback, buildFort];
  const STEPS = builders.length;
  let step = 0;
  const built = () => [shapes, bubbles, boats, nuts, puff, coil, forts[0]];
  function buildNext() {
    if (disposed) return;
    const b = built();
    while (step < STEPS && b[step]) step++;
    if (step < STEPS) {
      builders[step]();
      step++;
    }
  }
  const buildAll = () => {
    while (step < STEPS && !disposed) buildNext();
  };

  // ---- per frame state (visual memory)
  let clock = 0;
  let still = false;
  let tNow = 0;
  const seen = new Map(); // coconut id → { x, z, t, T } last frame (to splash where it lands)
  const splashes = []; // { x, z, t0, kind }
  const lineMem = new Map(); // line id → { L (track length), lockAt }
  const counts = {};
  const resetCounts = () => {
    Object.assign(counts, { boats: 0, monkeys: 0, swimmers: 0, tipped: 0, gunners: 0, coconuts: 0, puffers: 0, spikes: 0, coilback: 0, forts: 0, rings: 0, puffRings: 0, nets: 0, lanes: 0, lines: 0, summons: 0, songs: 0, notes: 0, stars: 0, bubbles: 0, shapes: 0 });
  };
  resetCounts();
  let pulse = 0; // the puff rings' pulse this frame (0..1), for the probes
  let flash = 0; // the strongest lock flash this frame (opacity)

  const _m = new THREE.Matrix4();
  const _p = V3();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _s = V3();
  const _v = V3();
  function put(mesh, i, x, y, z, yaw, pitch, roll, sc) {
    _e.set(pitch, yaw, roll, 'YXZ');
    _q.setFromEuler(_e);
    if (typeof sc === 'number') _s.setScalar(sc);
    else _s.copy(sc);
    _m.compose(_p.set(x, y, z), _q, _s);
    _m.toArray(mesh.instanceMatrix.array, i * 16);
  }
  function finish(mesh, n, ink) {
    mesh.count = n;
    mesh.visible = n > 0;
    if (ink) {
      ink.count = n;
      ink.visible = n > 0;
    }
    if (n) {
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, n * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  // the sea's slope under a thing (for its pitch and roll)
  function tilt(x, z, h, len, wid, t) {
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const pitch = Math.atan2(sea(x - fx * len * 0.5, z - fz * len * 0.5, t) - sea(x + fx * len * 0.5, z + fz * len * 0.5, t), len);
    const roll = Math.atan2(sea(x + fz * wid * 0.5, z - fx * wid * 0.5, t) - sea(x - fz * wid * 0.5, z + fx * wid * 0.5, t), wid);
    return [pitch, roll];
  }

  // ---- the jollyboats
  function drawPacks(packs, t) {
    boats.begin();
    for (const P of packs) {
      if (!obj(P)) continue;
      const frozen = !!P.frozen;
      for (const b of list(P.boats)) {
        if (!obj(b) || !fin(b.x) || !fin(b.z)) continue;
        const h = num(b.h, 0);
        const ph = strHash(b.id) * TAU;
        if (b.state === 'tip') {
          // rolled over, keel up, sinking at the end; its monkey swims home
          const k = clamp(num(b.t, 0) / JOLLY_TIP, 0, 1);
          const roll = PI * smooth(num(b.t, 0) / 0.45);
          const sink = smooth((k - 0.6) / 0.4) * 1.4;
          const y = sea(b.x, b.z, t) + 0.08 - 0.2 * smooth(num(b.t, 0) / 0.45) - sink;
          boats.boat(b.x, y, b.z, h, 0, roll, [1, 0, 0, 0], [0, 0, 0, 0]);
          counts.tipped++;
          const m = obj(b.monkey) && fin(b.monkey.x) && fin(b.monkey.z) ? b.monkey : null;
          if (m) {
            const swim = still ? 0.6 : t * 5 + ph;
            const my = sea(m.x, m.z, t) - 0.62 - smooth((k - 0.75) / 0.25) * 0.8;
            boats.boat(m.x, my, m.z, num(m.h, h), still ? 0 : 0.1 * Math.sin(t * 5 + ph), 0, [0, 1, 0, 0], [swim, 0, 1, 0]);
            counts.swimmers++;
            if (!still && bubbles) for (let i = 0; i < 2; i++) bubbles.add(m.x - Math.sin(num(m.h, h)) * (0.6 + i * 0.5), sea(m.x, m.z, t) + 0.15, m.z - Math.cos(num(m.h, h)) * (0.6 + i * 0.5), 0.7 - i * 0.2, foam);
          }
          continue;
        }
        // rowing: the stroke follows its speed (frozen: slow); the throwing arm goes up for the first 0.6 s of a throw
        const speed = Math.abs(num(b.speed, 6));
        const rate = frozen ? 1.2 : 2.2 + speed * 0.28;
        const phase = still ? 0.9 : t * rate + ph;
        const throwT = num(b.throwT, Infinity);
        const thr = throwT < 0.7 ? Math.sin(clamp(throwT / 0.7, 0, 1) * PI) : 0;
        const [pitch, roll] = tilt(b.x, b.z, h, 3.2, 1.4, t);
        const bob = still ? 0 : 0.05 * Math.sin(t * 2.3 + ph);
        boats.boat(b.x, sea(b.x, b.z, t) - 0.06 + bob, b.z, h, pitch + (still ? 0 : 0.04 * Math.sin(phase)), roll, [1, 1, 0, 1], [phase, thr, 0, 0]);
        counts.boats++;
        counts.monkeys++;
        // a little bow wave
        if (bubbles && speed > 2 && !still) {
          const fx = Math.sin(h);
          const fz = Math.cos(h);
          for (const sd of [-1, 1]) bubbles.add(b.x + fx * 1.55 + fz * sd * 0.45, sea(b.x, b.z, t) + 0.12, b.z + fz * 1.55 - fx * sd * 0.45, 0.55, foam);
        }
      }
    }
  }

  // ---- the forts' gunners rowing away (the same boats)
  function gunnersAway(f, t) {
    const T = num(f.t, 0);
    if (T < 0.6 || T > FORT.down + 0.5) return;
    const h = num(f.h, 0) + PI * 0.8;
    const d = 3.4 + (T - 0.6) * 2.2;
    const x = f.x + Math.sin(h) * d;
    const z = f.z + Math.cos(h) * d;
    const sink = smooth((T - FORT.down + 0.8) / 0.8) * 1.6;
    boats.boat(x, sea(x, z, t) - 0.06 - sink, z, h, 0, 0, [1, 0, 1, 1], [still ? 0.9 : t * 3.4, 0, 0, 0]);
    counts.gunners++;
  }

  // ---- coconuts in the air (and the splash where one lands)
  function drawCoconuts(list0, t) {
    let n = 0;
    const now = new Set();
    for (const c of list0) {
      if (!obj(c) || !fin(c.x) || !fin(c.z) || n >= CAP.coconuts) continue;
      const T = Math.max(0.05, num(c.T, 1.5));
      const u = clamp(num(c.t, 0) / T, 0, 1);
      const fx0 = num(c.fx, c.x);
      const fz0 = num(c.fz, c.z);
      const arc = num(c.arc, COCO_ARC);
      const x = lerp(fx0, c.x, u);
      const z = lerp(fz0, c.z, u);
      const y = lerp(sea(fx0, fz0, t) + 1.3, sea(c.x, c.z, t) + 0.3, u) + 4 * arc * u * (1 - u);
      const spin = still ? 0 : u * 9;
      put(nuts.mesh, n++, x, y, z, spin * 0.3, spin, 0, 1);
      const id = keyOf(c.id);
      if (id) {
        now.add(id);
        seen.set(id, { x: c.x, z: c.z, u });
      }
    }
    // a coconut gone from the list near the end of its flight landed: a splash there
    for (const [id, s] of seen) {
      if (now.has(id)) continue;
      if (s.u > 0.8) splashes.push({ x: s.x, z: s.z, t0: clock, kind: 'coconut' });
      seen.delete(id);
    }
    counts.coconuts = n;
    finish(nuts.mesh, n, nuts.ink);
  }

  // ---- puffers
  function drawPuffers(list0, t) {
    let n = 0;
    for (const u of list0) {
      if (!obj(u) || !fin(u.x) || !fin(u.z) || n >= CAP.puffers) continue;
      const h = num(u.h, 0);
      const k = clamp(num(u.k, 0), 0, 1);
      const st = u.state;
      const T = Math.max(0.05, num(u.T, 1));
      const tt = num(u.t, 0);
      const ph = strHash(u.id ?? n) * TAU;
      let r = PUFF_R * (1 + (PUFF_SWELL - 1) * k);
      let y = sea(u.x, u.z, t) + r * 0.35;
      if (st === 'rise') y -= (1 - smooth(tt / T)) * (r + 1.2);
      if (st === 'home') {
        const w = clamp(tt / PUFF_HOME, 0, 1);
        y -= smooth((w - 0.45) / 0.55) * (r * 2 + 0.8);
        r *= 1 - 0.15 * w;
      }
      if (!still && st !== 'home') y += 0.1 * Math.sin(t * 1.8 + ph);
      const wig = still ? 0 : 0.14 * Math.sin(t * 4.2 + ph) * (st === 'puff' ? 0.4 : 1);
      put(puff.body, n, u.x, y, u.z, h + wig, still ? 0 : 0.06 * Math.sin(t * 2.1 + ph), 0, r);
      // the spikes slide out as it swells (hidden inside the body when it is calm)
      const sk = st === 'puff' ? smooth(k * 1.3) : 0;
      put(puff.spikes, n, u.x, y, u.z, h + wig, 0, 0, r * (0.86 + 0.46 * sk));
      if (sk > 0) counts.spikes++;
      if ((st === 'rise' || st === 'home') && bubbles && !still) {
        for (let i = 0; i < 4; i++) {
          const a = i * 1.57 + t;
          bubbles.add(u.x + Math.cos(a) * r * 1.1, sea(u.x, u.z, t) + 0.15 + frac(t * 0.9 + i * 0.25) * 0.6, u.z + Math.sin(a) * r * 1.1, 0.7, foam);
        }
      }
      n++;
    }
    counts.puffers = n;
    finish(puff.body, n, puff.ink);
    finish(puff.spikes, counts.spikes ? n : 0);
  }

  // ---- Old Coilback
  function drawCoilback(V, t) {
    const B = coil.bones;
    const show = obj(V) && obj(V.head) && fin(V.head.x) && fin(V.head.z);
    if (!show) {
      coil.holder.visible = false;
      return;
    }
    const st = V.state;
    const Hd = V.head;
    const kHead = clamp(num(Hd.k, 1), 0, 1);
    const humps = list(V.humps).filter((q) => obj(q) && fin(q.x) && fin(q.z));
    const kHump = humps.length ? Math.max(...humps.map((q) => clamp(num(q.k, 0), 0, 1))) : 0;
    // its shadow under the water while it is down, and its bubble trail
    const trail = list(V.trail).filter((q) => obj(q) && fin(q.x) && fin(q.z));
    if (trail.length && bubbles) {
      for (let i = 0; i < trail.length; i++) {
        const q = trail[trail.length - 1 - i];
        const life = still ? 0.5 : frac(t * 0.8 + i * 0.37);
        bubbles.add(q.x + Math.sin(i * 2.3) * 0.6, sea(q.x, q.z, t) + 0.1 + life * 0.5, q.z + Math.cos(i * 1.7) * 0.6, (1.3 - i * 0.07) * (0.6 + 0.6 * life), foam);
        if (i < 6) bubbles.add(q.x - Math.sin(i * 1.3) * 0.9, sea(q.x, q.z, t) + 0.12, q.z + Math.cos(i * 2.9) * 0.9, 0.6, foam);
      }
    }
    if (kHead <= 0.01 && kHump <= 0.01) {
      coil.holder.visible = false;
      if (st === 'under' || st === 'dive') {
        const q = trail.length ? trail[trail.length - 1] : Hd;
        shapes.blob(q.x, q.z, 1.6, 3.2, num(Hd.h, 0), S.shadow, 0.32, -0.05);
      }
      return;
    }
    coil.holder.visible = true;
    counts.coilback = 1;
    const h = num(Hd.h, 0);
    const T = Math.max(0.05, num(V.T, 1));
    const tt = num(V.t, 0);
    const hurt = clamp(num(V.hurt, 0), 0, 1);
    // the neck's bends by state (radians about its local x: + leans it forward), the head's pitch and its jaw
    let a0 = 0.55;
    let a1 = -0.32;
    let a2 = -0.18;
    let ap = 0;
    let jaw = 0.05;
    let yUp = 0;
    let yaw = 0;
    let rollH = 0;
    const sway = still ? 0 : 1;
    if (st === 'rear') {
      // rising out of the water and arching back, hissing (its jaw opens) as the lane shows
      const r = smooth(tt / 0.6);
      a0 = lerp(0.7, 0.12, r);
      a1 = lerp(-0.2, -0.42, r);
      a2 = lerp(-0.1, 0.12, r);
      ap = 0.22;
      jaw = 0.18 + 0.12 * r + 0.06 * Math.sin(t * 6) * sway;
      yUp = 0.5 * r;
    } else if (st === 'lunge') {
      a0 = 1.0;
      a1 = -0.25;
      a2 = -0.3;
      ap = 0.25;
      jaw = 0.62;
      yUp = -0.4;
    } else if (st === 'dizzy') {
      a0 = 0.45;
      a1 = -0.2;
      a2 = -0.12;
      ap = 0.12;
      jaw = 0.22;
      yaw = 0.35 * Math.sin(t * 2.2) * sway;
      rollH = 0.25 * Math.sin(t * 2.2 + 1.2) * sway;
    } else if (st === 'dive') {
      const d = smooth(tt / T);
      a0 = lerp(0.6, 1.25, d);
      a1 = -0.3 * (1 - d);
      ap = 0.35 * d;
    } else if (st === 'home') {
      a0 = 0.95;
      a1 = -0.35;
      a2 = -0.2;
      ap = 0.35;
      jaw = 0;
      yUp = -0.6;
    } else {
      // swimming: a gentle sway of the neck
      a0 += 0.06 * Math.sin(t * 2.2) * sway;
      a1 += 0.05 * Math.sin(t * 2.2 + 1) * sway;
    }
    // flinch when hurt
    ap -= 0.3 * hurt;
    // pose the chain from a zero origin, then move its root so the head lands where foes4 says
    B.neck0.position.set(0, 0, 0);
    B.neck0.rotation.set(a0, h + yaw * 0.3, 0, 'YXZ');
    B.neck1.rotation.set(a1, yaw * 0.35, rollH * 0.4);
    B.neck2.rotation.set(a2, yaw * 0.35, rollH * 0.6);
    B.head.rotation.set(-(a0 + a1 + a2) + ap, 0, rollH);
    B.jaw.rotation.set(jaw, 0, 0);
    B.root.updateMatrixWorld(true);
    B.head.getWorldPosition(_v);
    const ty = sea(Hd.x, Hd.z, t) + COIL.headY + yUp - (1 - smooth(kHead)) * 6.5;
    B.neck0.position.set(Hd.x - _v.x, ty - _v.y, Hd.z - _v.z);
    // eyes: pupils toward you, a little down; spinning when dizzy; lids half shut (grumpy), shut in a blink
    const look = obj(V.look) && fin(V.look.x) ? V.look : null;
    let pyaw = 0;
    if (look) pyaw = clamp(Math.atan2(Math.sin(Math.atan2(look.x - Hd.x, look.z - Hd.z) - h), Math.cos(Math.atan2(look.x - Hd.x, look.z - Hd.z) - h)), -0.5, 0.5);
    for (const [pb, sd] of [[B.pupilL, 1], [B.pupilR, -1]]) {
      if (st === 'dizzy') {
        const a = (still ? 0.8 : t * 5) * sd;
        pb.rotation.set(0.45 * Math.cos(a), 0.45 * Math.sin(a), 0, 'YXZ');
      } else pb.rotation.set(0.12, pyaw, 0, 'YXZ');
    }
    if (t > coil.blinkAt + 0.18) coil.blinkAt = t + 2.5 + 2.5 * hash(Math.floor(t));
    const blink = !still && t >= coil.blinkAt && t <= coil.blinkAt + 0.18 ? Math.sin(((t - coil.blinkAt) / 0.18) * PI) : 0;
    const shut = st === 'home' ? 0.75 : st === 'dizzy' ? 0.15 : st === 'rear' || st === 'lunge' ? 0.1 : 0.42;
    for (const lb of [B.lidL, B.lidR]) lb.rotation.set(lerp(-1.25, 0.75, Math.max(shut - 0.4 * hurt, blink)), 0, 0);
    // the humps: arches standing out of the water along its path (k 0 sunk .. 1 up), rippling slowly
    for (let i = 0; i < 3; i++) {
      const hb = B[`hump${i}`];
      const q = humps[i];
      if (!q) {
        hb.scale.setScalar(0);
        continue;
      }
      const prev = i === 0 ? Hd : humps[i - 1];
      const dir = Math.atan2(prev.x - q.x, prev.z - q.z);
      const k = clamp(num(q.k, 0), 0, 1);
      hb.scale.setScalar(k > 0.01 ? 1 : 0);
      hb.position.set(q.x, sea(q.x, q.z, t) - 0.35 + (smooth(k) - 1) * 2.6 + (still ? 0 : 0.14 * Math.sin(t * 2.6 - i * 1.1)), q.z);
      hb.rotation.set(0, dir, still ? 0 : 0.05 * Math.sin(t * 1.8 + i));
    }
    // the tail: behind the last hump, flicking
    const last = humps[humps.length - 1];
    if (last && humps.length >= 2) {
      const pr = humps[humps.length - 2];
      const dx = last.x - pr.x;
      const dz = last.z - pr.z;
      const d = Math.hypot(dx, dz) || 1;
      const tx = last.x + (dx / d) * 1.3;
      const tz = last.z + (dz / d) * 1.3;
      const k = clamp(num(last.k, 0), 0, 1);
      B.tail.scale.setScalar(k > 0.01 ? 1 : 0);
      B.tail.position.set(tx, sea(tx, tz, t) - 0.2 + (smooth(k) - 1) * 2.8, tz);
      B.tail.rotation.set(0, Math.atan2(-dx, -dz), still ? 0 : 0.3 * Math.sin(t * 3.1));
    } else B.tail.scale.setScalar(0);
    // a dark ring of foam where its neck breaks the water, and dizzy stars
    B.neck0.updateMatrixWorld(true);
    if (kHead > 0.3) shapes.band(B.neck0.position.x, B.neck0.position.z, 0.85, 1.25, 0xffffff, 0.5, -0.08, 0, TAU, 16);
    for (let i = 0; i < humps.length; i++) {
      const q = humps[i];
      const k = clamp(num(q.k, 0), 0, 1);
      if (k < 0.3) continue;
      const prev = i === 0 ? Hd : humps[i - 1];
      const dir = Math.atan2(prev.x - q.x, prev.z - q.z);
      const R = 1.15 - i * 0.12;
      for (const sd of [-1, 1]) shapes.band(q.x + Math.sin(dir) * R * sd, q.z + Math.cos(dir) * R * sd, 0.7, 1.05, 0xffffff, 0.45, -0.08, 0, TAU, 14);
    }
    if (st === 'dizzy') {
      B.head.getWorldPosition(_v);
      for (let i = 0; i < 3; i++) {
        const a = (still ? 0 : t * 2.4) + (i / 3) * TAU;
        const sx = _v.x + Math.cos(a) * 1.5;
        const sz = _v.z + Math.sin(a) * 1.5;
        const sy0 = _v.y + 1.6 + 0.2 * Math.sin(a * 2);
        shapes.ushape(sx, sy0, sz, STAR, 0.56, still ? 0 : t * 1.5 + i, S.ink, 0.95);
        shapes.ushape(sx, sy0, sz, STAR, 0.42, still ? 0 : t * 1.5 + i, S.star, 1);
        counts.stars++;
      }
    }
  }

  // ---- the Rock Forts
  function drawForts(list0, lines, t) {
    const live = list0.filter((f) => obj(f) && fin(f.x) && fin(f.z));
    // keep each fort on the same model while it lives
    for (const m of forts) m.used = false;
    const pick = [];
    for (const f of live) {
      const k = keyOf(f.id) || `ix${live.indexOf(f)}`;
      let m = forts.find((x) => x.key === k && !x.used);
      if (!m) m = forts.find((x) => !x.used && !live.some((g) => (keyOf(g.id) || '') === x.key));
      if (!m) m = buildFort();
      if (!m) continue;
      m.used = true;
      m.key = k;
      pick.push([f, m]);
    }
    for (const m of forts) if (!m.used) m.holder.visible = false;
    for (const [f, m] of pick) {
      const B = m.bones;
      m.holder.visible = true;
      counts.forts++;
      const h = num(f.h, 0);
      B.root.position.set(f.x, num(f.base, FORT.base), f.z);
      B.root.rotation.set(0, h, 0);
      // the gun swings toward its line's end (or holds its last aim)
      const line = lines.find((l) => obj(l) && keyOf(l.id) === `${keyOf(f.id)}-line`);
      if (line && fin(line.x1) && fin(line.z1)) m.aim = Math.atan2(line.x1 - f.x, line.z1 - f.z) - h;
      const down = f.state === 'down';
      const T = num(f.t, 0);
      B.gun.rotation.set(down ? 0.5 * smooth(T / 1) : f.state === 'fire' && !still ? -0.12 * Math.max(0, 1 - T / 0.35) : 0, m.aim, down ? 0.4 * smooth(T / 1) : 0);
      B.gun.position.set(0, 1.9 - (down ? 1.6 * smooth(T / 1.2) : 0), 0);
      // the flag waves (still under reduced motion), and falls when the fort is down
      B.flag.rotation.set(0, still ? 0.15 : 0.22 * Math.sin(t * 2.4 + f.x), 0);
      B.pole.rotation.set(down ? 1.1 * smooth(T / 0.9) : 0, 0, 0);
      // knocked down: the three pieces of wall fall outward and sink a little; dust and its gunners row away
      for (let k = 0; k < 3; k++) {
        const c = B[`chunk${k}`];
        const a = (k / 3) * TAU + 0.35 + TAU / 6;
        const fall = down ? smooth(T / (0.7 + k * 0.15)) : 0;
        const r = 2.45 + 0.5 * fall;
        c.position.set(Math.sin(a) * r, -1.2 * (down ? smooth(T / 1.4) : 0), Math.cos(a) * r);
        c.rotation.set(1.05 * fall, a, 0.25 * fall * (k - 1), 'YXZ');
      }
      if (down) {
        gunnersAway(f, t);
        if (T < 1.6 && bubbles) {
          for (let i = 0; i < 10; i++) {
            const a = i * 0.63;
            const r = 2.4 + frac(T * 0.8 + i * 0.13) * 1.6;
            bubbles.add(f.x + Math.sin(a) * r, num(f.base, FORT.base) + 0.4 + frac(T + i * 0.21) * 1.4, f.z + Math.cos(a) * r, 1.6 * (1 - T / 1.6) + 0.3, C.sandLight);
          }
        }
      }
      // the shot: a puff of smoke at the muzzle
      if (f.state === 'fire' && bubbles) {
        B.root.updateMatrixWorld(true);
        _v.set(0, 0.7, 1.6).applyMatrix4(B.gun.matrixWorld);
        for (let i = 0; i < 6; i++) bubbles.add(_v.x + Math.sin(i * 2.1) * 0.5 * (1 + T * 3), _v.y + 0.2 * i * T * 3, _v.z + Math.cos(i * 2.1) * 0.5 * (1 + T * 3), 1.4 + T * 2, 0xd8d2c8);
      }
    }
  }

  // ---- the warning shapes (fills first, then the rims: painter's order in one call)
  const rings = (V) => list(V.rings).filter((r) => obj(r) && fin(r.x) && fin(r.z));
  function shapeFills(V, t) {
    for (const r of rings(V)) {
      const R = clamp(num(r.r, r.kind === 'puff' ? PUFF_POP_R : COCO_R), 0.5, 20);
      const T = Math.max(0.05, num(r.T, 1.5));
      const u = clamp(num(r.t, 0) / T, 0, 1);
      if (r.kind === 'puff') {
        const p = 0.5 + 0.5 * Math.sin(num(r.t, 0) * TAU * PUFF_PULSE);
        shapes.disc(r.x, r.z, R * 0.92, S.puffFill, 0.13 + 0.09 * p, 0);
        shapes.disc(r.x, r.z, R * Math.max(0.08, u) * 0.92, S.puffFill, 0.22, 0.01);
      } else {
        shapes.disc(r.x, r.z, R * 0.95, S.coconutFill, 0.16, 0);
        shapes.disc(r.x, r.z, R * Math.max(0.08, u) * 0.92, S.coconutFill, 0.3, 0.01);
      }
    }
    for (const N of list(V.nets)) {
      if (!obj(N) || !fin(N.x) || !fin(N.z)) continue;
      const len = clamp(num(N.len, 18), 2, 40);
      const half = clamp(num(N.half, 0.436), 0.05, 1.4);
      const k = clamp(num(N.k, num(N.t, 0) / Math.max(0.05, num(N.T, 1.6))), 0, 1);
      shapes.sector(N.x, N.z, num(N.h, 0), half, 1.5, len, S.netFill, 0.1, 0);
      shapes.sector(N.x, N.z, num(N.h, 0), half, 1.5, 1.5 + (len - 1.5) * Math.max(0.06, k), S.netFill, 0.2, 0.01);
    }
    for (const L of list(V.lanes)) {
      if (!obj(L) || !fin(L.x0) || !fin(L.z0) || !fin(L.x1) || !fin(L.z1)) continue;
      const w = clamp(num(L.w, 4), 0.5, 12);
      const T = Math.max(0.05, num(L.T, 1.6));
      const u = num(L.run, 0) > 0 ? 1 : clamp(num(L.t, 0) / T, 0, 1);
      shapes.seg(L.x0, L.z0, L.x1, L.z1, w, S.lungeFill, 0.12, 0);
      shapes.seg(L.x0, L.z0, lerp(L.x0, L.x1, Math.max(0.05, u)), lerp(L.z0, L.z1, Math.max(0.05, u)), w * 0.9, S.lungeFill, 0.24, 0.01);
    }
    for (const s of list(V.summons)) {
      if (!obj(s) || !fin(s.x) || !fin(s.z)) continue;
      const R = clamp(num(s.r, 1.6), 0.5, 6) * SUMMON_GROW;
      const k = clamp(num(s.k, 0), 0, 1);
      shapes.disc(s.x, s.z, R * 1.0, S.summonFill, 0.22, 0);
      shapes.disc(s.x, s.z, R * Math.max(0.1, k) * 0.95, S.summonFill, 0.38, 0.01);
    }
  }
  function shapeRims(V, t) {
    // coconut rings: a ring of brown dots with cream halos, and the falling coconut's shadow spinning as it grows
    for (const r of rings(V)) {
      const R = clamp(num(r.r, r.kind === 'puff' ? PUFF_POP_R : COCO_R), 0.5, 20);
      const T = Math.max(0.05, num(r.T, 1.5));
      const u = clamp(num(r.t, 0) / T, 0, 1);
      if (r.kind === 'puff') {
        // the spiky ring: an ink band, an orange band, and spikes pointing out, the whole ring pulsing at 1 Hz
        const p = Math.sin(num(r.t, 0) * TAU * PUFF_PULSE);
        pulse = Math.max(pulse, 0.5 + 0.5 * p);
        const RR = R * (1 + 0.05 * p);
        const nS = 16;
        const turn = still ? 0 : t * 0.25;
        shapes.band(r.x, r.z, RR - 0.32, RR + 0.32, S.ink, 0.95, 0.02);
        for (let i = 0; i < nS; i++) {
          const a = turn + (i / nS) * TAU;
          const w = (TAU / nS) * 0.32;
          const sp = 0.95;
          shapes.poly([r.x + Math.cos(a - w) * (RR + 0.1), r.z + Math.sin(a - w) * (RR + 0.1), r.x + Math.cos(a) * (RR + sp + 0.25), r.z + Math.sin(a) * (RR + sp + 0.25), r.x + Math.cos(a + w) * (RR + 0.1), r.z + Math.sin(a + w) * (RR + 0.1)], S.ink, 0.95, 0.02);
          shapes.poly([r.x + Math.cos(a - w * 0.62) * (RR + 0.14), r.z + Math.sin(a - w * 0.62) * (RR + 0.14), r.x + Math.cos(a) * (RR + sp), r.z + Math.sin(a) * (RR + sp), r.x + Math.cos(a + w * 0.62) * (RR + 0.14), r.z + Math.sin(a + w * 0.62) * (RR + 0.14)], S.puffTip, 1, 0.03);
        }
        shapes.band(r.x, r.z, RR - 0.2, RR + 0.2, S.puff, 1, 0.03);
        counts.puffRings++;
      } else {
        const nD = Math.max(10, Math.round(R * 5.5));
        const turn = still ? 0 : t * 0.6;
        for (let i = 0; i < nD; i++) {
          const a = turn + (i / nD) * TAU;
          const x = r.x + Math.cos(a) * R;
          const z = r.z + Math.sin(a) * R;
          shapes.disc(x, z, 0.54, S.ink, 0.95, 0.02, 10);
          shapes.disc(x, z, 0.43, S.coconutHalo, 1, 0.03, 10);
          shapes.disc(x, z, 0.28, S.coconut, 1, 0.04, 8);
        }
        // the shadow of the coconut coming down: it grows and darkens, three lobes turning
        const sr = 0.35 + 0.75 * u;
        const sp = still ? 0 : t * 4;
        shapes.blob(r.x, r.z, sr, sr * 0.85, sp, S.coconutShadow, 0.28 + 0.4 * u, 0.03);
        for (let i = 0; i < 3; i++) {
          const a = sp + (i / 3) * TAU;
          shapes.disc(r.x + Math.cos(a) * sr * 0.55, r.z + Math.sin(a) * sr * 0.55, sr * 0.28, S.coconutShadow, 0.2 + 0.3 * u, 0.035, 8);
        }
        counts.rings++;
      }
    }
    // net fans: white edges on ink, cross-hatched inside
    for (const N of list(V.nets)) {
      if (!obj(N) || !fin(N.x) || !fin(N.z)) continue;
      const h = num(N.h, 0);
      const len = clamp(num(N.len, 18), 2, 40);
      const half = clamp(num(N.half, 0.436), 0.05, 1.4);
      const r0 = 1.5;
      const fx = (u, v) => N.x + Math.sin(h) * u + Math.cos(h) * v;
      const fz = (u, v) => N.z + Math.cos(h) * u - Math.sin(h) * v;
      const inside = (u, v) => u >= r0 - 1e-6 && Math.hypot(u, v) <= len + 1e-6 && Math.abs(Math.atan2(v, u)) <= half + 1e-6;
      const hatch = (w, hex, a, lift) => {
        const step = 2.3;
        for (const sgn of [-1, 1]) {
          for (let c = -len; c <= len * 2; c += step) {
            // the line v = sgn·(u − c): sampled to find where it is inside the fan (a convex shape: one interval)
            let a0 = null;
            let a1 = null;
            for (let i = 0; i <= 48; i++) {
              const uu = r0 + ((len - r0) * i) / 48;
              const vv = sgn * (uu - c);
              if (inside(uu, vv)) {
                if (a0 === null) a0 = uu;
                a1 = uu;
              }
            }
            if (a0 === null || a1 - a0 < 0.3) continue;
            shapes.seg(fx(a0, sgn * (a0 - c)), fz(a0, sgn * (a0 - c)), fx(a1, sgn * (a1 - c)), fz(a1, sgn * (a1 - c)), w, hex, a, lift);
          }
        }
      };
      hatch(0.42, S.ink, 0.55, 0.02);
      hatch(0.2, S.net, 0.9, 0.03);
      const edge = (w, hex, a, lift) => {
        const pts = [];
        pts.push(fx(r0 * Math.cos(-half), r0 * Math.sin(-half)), fz(r0 * Math.cos(-half), r0 * Math.sin(-half)));
        const n = 18;
        for (let i = 0; i <= n; i++) {
          const an = -half + (2 * half * i) / n;
          pts.push(fx(len * Math.cos(an), len * Math.sin(an)), fz(len * Math.cos(an), len * Math.sin(an)));
        }
        pts.push(fx(r0 * Math.cos(half), r0 * Math.sin(half)), fz(r0 * Math.cos(half), r0 * Math.sin(half)));
        shapes.path(pts, w, hex, a, lift, true);
      };
      edge(0.75, S.ink, 0.95, 0.04);
      edge(0.42, S.net, 1, 0.05);
      counts.nets++;
    }
    // lanes (the Coilback's lunge): both edges in green-and-white dashes on ink, arrows marching down the middle
    for (const L of list(V.lanes)) {
      if (!obj(L) || !fin(L.x0) || !fin(L.z0) || !fin(L.x1) || !fin(L.z1)) continue;
      drawLane(shapes, L, t, still, S.lunge, S.white, 4);
      counts.lanes++;
    }
    // the Witch's summons: green rings of bubbles where her puffers will rise
    for (const s of list(V.summons)) {
      if (!obj(s) || !fin(s.x) || !fin(s.z)) continue;
      const R = clamp(num(s.r, 1.6), 0.5, 6) * SUMMON_GROW;
      const k = clamp(num(s.k, 0), 0, 1);
      const nB = 13;
      for (let i = 0; i < nB; i++) {
        const a = (i / nB) * TAU + (still ? 0 : t * 0.5);
        const bx = s.x + Math.cos(a) * R;
        const bz = s.z + Math.sin(a) * R;
        // (each bubble swells and shrinks slowly, under 0.5 Hz)
        const g = still ? 1 : 0.88 + 0.18 * Math.sin(t * 2.6 + i * 1.7);
        shapes.disc(bx, bz, 0.62 * g, S.ink, 0.95, 0.02, 10);
        shapes.disc(bx, bz, 0.48 * g, S.summon, 1, 0.03, 10);
        shapes.disc(bx + 0.14, bz + 0.12, 0.15 * g, S.white, 0.95, 0.04, 6);
      }
      // the water bubbling up in the middle, more as the puffers come
      if (bubbles) {
        const n = 4 + Math.round(6 * k);
        for (let i = 0; i < n; i++) {
          const a = i * 2.4;
          const rr = R * 0.7 * hash(i + 3);
          const life = still ? 0.4 : frac(t * 1.1 + i * 0.29);
          bubbles.add(s.x + Math.cos(a) * rr, sea(s.x, s.z, t) + 0.15 + life * 1.0, s.z + Math.sin(a) * rr, 0.7 + 0.8 * life, 0x8af08a);
        }
      }
      counts.summons++;
    }
  }
  // the Witch's song: a ring of notes round her (rising as it warns, then drifting out to its reach as she mends)
  function drawSongs(V, t) {
    for (const s of list(V.songs)) {
      if (!obj(s) || !fin(s.x) || !fin(s.z)) continue;
      const reach = clamp(num(s.r, 18), 2, 40);
      const k = clamp(num(s.k, 0), 0, 1);
      const mend = s.state === 'mend';
      // its reach, a pale dotted ring on the water
      const nD = Math.round(reach * 2.2);
      for (let i = 0; i < nD; i++) {
        const a = (i / nD) * TAU;
        shapes.disc(s.x + Math.cos(a) * reach, s.z + Math.sin(a) * reach, 0.42, S.ink, mend ? 0.6 : 0.35 + 0.3 * k, 0.02, 8);
        shapes.disc(s.x + Math.cos(a) * reach, s.z + Math.sin(a) * reach, 0.3, S.songRing, mend ? 0.9 : 0.6 + 0.3 * k, 0.03, 8);
      }
      const n = 10;
      const r = mend ? lerp(NOTE_R, reach * 0.85, smooth(k)) : NOTE_R;
      const y0 = sea(s.x, s.z, t) + (mend ? 2.6 : 1.4 + 1.6 * smooth(k));
      const a0 = still ? 0 : t * 0.7;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * TAU;
        const x = s.x + Math.cos(a) * r;
        const z = s.z + Math.sin(a) * r;
        const y = y0 + (still ? 0 : 0.3 * Math.sin(t * 2 + i * 1.3)) + (i % 2) * 0.5;
        const alpha = mend ? 1 - smooth((k - 0.7) / 0.3) * 0.7 : 1;
        drawNote(shapes, x, y, z, 1.15, i % 2 ? S.note2 : S.note, alpha, i % 3 === 0);
        counts.notes++;
      }
      counts.songs++;
    }
  }
  // the forts' lines: red dots from the gun to you while it tracks, a solid red line when it locks (one soft flash),
  // and the shot flying down it
  function drawLines(V, t) {
    const ids = new Set();
    for (const l of list(V.lines)) {
      if (!obj(l) || !fin(l.x0) || !fin(l.z0) || !fin(l.x1) || !fin(l.z1)) continue;
      const id = keyOf(l.id) || `${l.x0},${l.z0}`;
      ids.add(id);
      drawSightLine(shapes, lineMem, id, l, t, clock, still, counts, (v) => {
        flash = Math.max(flash, v);
      });
      counts.lines++;
    }
    for (const id of [...lineMem.keys()]) if (!ids.has(id)) lineMem.delete(id);
  }
  function drawSplashes(t) {
    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i];
      const age = clock - s.t0;
      if (age > 0.7) {
        splashes.splice(i, 1);
        continue;
      }
      if (!bubbles) continue;
      const k = age / 0.7;
      for (let j = 0; j < 8; j++) {
        const a = (j / 8) * TAU;
        const r = 0.4 + 1.6 * k;
        bubbles.add(s.x + Math.cos(a) * r, sea(s.x, s.z, t) + 0.2 + Math.sin(k * PI) * 1.4 * (0.6 + 0.4 * hash(j)), s.z + Math.sin(a) * r, 1.2 * (1 - k) + 0.2, foam);
      }
    }
  }

  // ---- warm-up for main's warmDraw
  function warmables() {
    if (disposed) return [];
    buildAll();
    shapes.warm();
    bubbles.warm();
    boats.warm();
    for (const m of [nuts.mesh, puff.body, puff.spikes]) {
      put(m, 0, 0, -600, 0, 0, 0, 0, 1);
      finish(m, 1, m === nuts.mesh ? nuts.ink : m === puff.body ? puff.ink : null);
    }
    for (const m of [nuts.mesh, nuts.ink, puff.body, puff.ink, puff.spikes]) m.visible = false;
    coil.bones.root.position.set(0, -600, 0);
    coil.holder.visible = false;
    for (const f of forts) {
      f.bones.root.position.set(0, -600, 0);
      f.holder.visible = false;
    }
    warmPending = true;
    return [root];
  }
  let warmPending = false;

  const api = {
    prepare() {
      if (disposed) return false;
      if (step < STEPS) buildNext();
      return step >= STEPS;
    },
    get ready() {
      return step >= STEPS && !disposed;
    },

    update(visuals, t = 0, dt = 0) {
      if (disposed) return;
      const V = obj(visuals) ? visuals : {};
      const has = (k) => Array.isArray(V[k]) && V[k].length > 0;
      const any = has('packs') || has('coconuts') || has('puffers') || obj(V.coilback) || has('forts') || has('rings') || has('lanes') || has('lines') || has('nets') || has('songs') || has('summons') || splashes.length > 0;
      if (step < STEPS) {
        if (!any) return; // nothing to draw yet: prepare() builds the parts, one a frame
        buildAll(); // (it shows before prepare() is done: build the rest now rather than miss it)
      }
      if (warmPending) {
        // (the warm-up's instances and triangles go: put the bones back where the frame below sets them)
        warmPending = false;
        coil.bones.root.position.set(0, 0, 0);
        for (const f of forts) f.bones.root.position.set(0, 0, 0);
      }
      still = rm();
      tNow = num(t, 0);
      const step0 = Math.max(0, num(dt, 0));
      clock += step0;
      resetCounts();
      pulse = 0;
      flash = 0;
      shapes.begin(tNow);
      bubbles.begin();
      drawPacks(list(V.packs), tNow);
      drawCoconuts(list(V.coconuts), tNow);
      drawPuffers(list(V.puffers), tNow);
      drawCoilback(obj(V.coilback) ? { ...V.coilback, look: V.look } : null, tNow);
      shapeFills(V, tNow);
      shapeRims(V, tNow);
      drawForts(list(V.forts), list(V.lines), tNow);
      boats.end();
      drawSongs(V, tNow);
      drawLines(V, tNow);
      drawSplashes(tNow);
      shapes.end();
      bubbles.end();
      counts.bubbles = bubbles.count;
      const sc = shapes.count;
      counts.shapes = sc.flat + sc.up;
    },

    warmables,

    read() {
      return {
        ready: api.ready,
        still,
        pulse: Math.round(pulse * 1000) / 1000,
        flash: Math.round(flash * 1000) / 1000,
        ...counts,
        triangles: shapes ? shapes.count : { flat: 0, up: 0 },
      };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(root);
      if (shapes) shapes.dispose();
      if (bubbles) bubbles.dispose();
      if (boats) boats.dispose();
      for (const p of [nuts && nuts.mesh, nuts && nuts.ink, puff && puff.body, puff && puff.ink, puff && puff.spikes]) if (p) p.dispose();
      for (const g of own.geos) g.dispose();
      for (const m of own.mats) m.dispose();
      for (const s of own.skels) s.dispose();
    },
  };
  return api;
}

// ---------------------------------------------------------------------------------------------
// Shapes shared with shellbackView.js: a dashed lane with arrows, a sight line, a musical note
// ---------------------------------------------------------------------------------------------
/**
 * A dashed lane (the Coilback's lunge, the Shellback's charge): both edges in alternating dashes of `c1` and `c2` on
 * ink, chevrons down the middle pointing from (x0, z0) to (x1, z1) (marching unless still), and while it runs a
 * bright head moving down it (L.run 0..1).
 */
export function drawLane(shapes, L, t, still, c1, c2, w0 = 4) {
  const w = clamp(num(L.w, w0), 0.5, 14);
  const dx = L.x1 - L.x0;
  const dz = L.z1 - L.z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.5) return;
  const ux = dx / len;
  const uz = dz / len;
  const px = -uz;
  const pz = ux;
  const hw = w / 2;
  // the edges: ink under, then the dashes
  for (const sd of [-1, 1]) {
    const ex = sd * hw;
    shapes.seg(L.x0 + px * ex, L.z0 + pz * ex, L.x1 + px * ex, L.z1 + pz * ex, 0.78, S.ink, 0.95, 0.02);
    const dash = 1.25;
    const n = Math.ceil(len / dash);
    for (let i = 0; i < n; i++) {
      const a = i * dash;
      const b = Math.min(len, a + dash);
      shapes.seg(L.x0 + ux * a + px * ex, L.z0 + uz * a + pz * ex, L.x0 + ux * b + px * ex, L.z0 + uz * b + pz * ex, 0.46, i % 2 ? c2 : c1, 1, 0.03);
    }
  }
  // the end of the lane: a bar across
  shapes.seg(L.x1 - px * hw, L.z1 - pz * hw, L.x1 + px * hw, L.z1 + pz * hw, 0.78, S.ink, 0.95, 0.02);
  shapes.seg(L.x1 - px * hw, L.z1 - pz * hw, L.x1 + px * hw, L.z1 + pz * hw, 0.42, c1, 1, 0.03);
  // chevrons down the middle (marching toward the end)
  const gap = 3.2;
  const off = still ? 0 : (num(t, 0) * 4) % gap;
  const cw = Math.min(hw * 0.75, 2.4);
  for (let s = 1.6 + off; s < len - 0.8; s += gap) {
    const cx = L.x0 + ux * s;
    const cz = L.z0 + uz * s;
    const tipx = cx + ux * 0.9;
    const tipz = cz + uz * 0.9;
    const chev = (wd, hex, a, lift) => {
      shapes.path([cx - ux * 0.5 + px * cw, cz - uz * 0.5 + pz * cw, tipx, tipz, cx - ux * 0.5 - px * cw, cz - uz * 0.5 - pz * cw], wd, hex, a, lift);
    };
    chev(0.8, S.ink, 0.9, 0.04);
    chev(0.44, c2, 1, 0.05);
  }
  // running: a bright bar where the head is now
  const run = clamp(num(L.run, 0), 0, 1);
  if (run > 0) {
    const s = run * len;
    shapes.seg(L.x0 + ux * s - px * hw, L.z0 + uz * s - pz * hw, L.x0 + ux * s + px * hw, L.z0 + uz * s + pz * hw, 1.2, c2, 0.85, 0.06);
  }
}

/**
 * A sight line (a Rock Fort's, a Shellback tower's): from the gun (x0, y0, z0) down to (x1, z1). Tracking: red dots
 * in ink rings, the line dropping from the gun to hull height at the aim; locked: one solid red line on ink (and
 * one soft flash as it locks, opacity ≤ FLASH.alpha, fading in FLASH.time s); fired: the line fades as a dark ball
 * flies down it. A small red target ring marks the aim on the water. mem: a Map remembering each line's length
 * and when it locked (and, as its `flashAt`, when the view's last flash began: at most one flash per FLASH.gap s;
 * clock: the view's own clock, which only grows).
 */
export function drawSightLine(shapes, mem, id, l, t, clock, still, counts, onFlash) {
  let m = mem.get(id);
  if (!m) {
    m = { L: null, lockAt: null, state: null };
    mem.set(id, m);
  }
  const y0 = num(l.y0, FORT.gunY);
  const dx = l.x1 - l.x0;
  const dz = l.z1 - l.z0;
  const full = Math.hypot(dx, dz);
  if (full < 0.5) return;
  const ux = dx / full;
  const uz = dz / full;
  if (l.state === 'track' || m.L === null) m.L = full;
  if (l.state === 'lock' && m.state !== 'lock') {
    // one flash per FLASH.gap s for all of this view's lines: a lock inside the gap gets none (the solid line is the tell)
    const since = typeof mem.flashAt === 'number' ? clock - mem.flashAt : Infinity;
    if (since >= 0 && since < FLASH.gap) m.lockAt = null;
    else {
      m.lockAt = clock;
      mem.flashAt = clock;
    }
  }
  m.state = l.state;
  const L = clamp(m.L, 2, full);
  const hullY = shapes.sea(l.x0 + ux * L, l.z0 + uz * L) + 1.3;
  // the line's height at s u from the gun: down to hull height at L, then level
  const yAt = (s) => (s <= L ? lerp(y0, hullY, s / L) : hullY);
  const P = (s) => [l.x0 + ux * s, yAt(s), l.z0 + uz * s];
  if (l.state === 'track') {
    // dots every 1.1 u, the first ones off the muzzle
    for (let s = 1.6; s <= L + 0.01; s += 1.1) {
      const [x, y, z] = P(s);
      shapes.udisc(x, y, z, 0.36, S.ink, 0.95, 10);
      shapes.udisc(x, y, z, 0.25, S.line, 1, 10);
    }
  } else {
    const fade = l.state === 'fire' ? 1 - clamp(num(l.t, 0) / Math.max(0.05, num(l.T, 0.35)), 0, 1) : 1;
    const end = full;
    const step = 2;
    for (let s = 1.6; s < end; s += step) {
      const [ax, ay, az] = P(s);
      const [bx, by, bz] = P(Math.min(end, s + step + 0.05));
      shapes.ribbon(ax, ay, az, bx, by, bz, 0.7, S.ink, 0.95 * fade);
      shapes.ribbon(ax, ay, az, bx, by, bz, 0.42, S.line, fade);
    }
    // the one soft flash as it locks (≤ 0.25 opacity, fading in 0.3 s)
    if (l.state === 'lock' && m.lockAt !== null) {
      const age = clock - m.lockAt;
      if (age < FLASH.time) {
        const a = FLASH.alpha * (1 - age / FLASH.time);
        for (let s = 1.6; s < full; s += step) {
          const [ax, ay, az] = P(s);
          const [bx, by, bz] = P(Math.min(full, s + step + 0.05));
          shapes.ribbon(ax, ay, az, bx, by, bz, 1.6, S.flash, a);
        }
        if (onFlash) onFlash(a);
      }
    }
    // the shot flying down the line
    if (l.state === 'fire') {
      const k = clamp(num(l.t, 0) / Math.max(0.05, num(l.T, 0.35)), 0, 1);
      const [x, y, z] = P(1.6 + k * (full - 1.6));
      shapes.udisc(x, y, z, 0.62, S.ink, 1, 12);
      shapes.udisc(x, y, z, 0.48, S.ball, 1, 12);
    }
  }
  // the aim on the water: a small red ring with a cross
  const ax = l.x0 + ux * L;
  const az = l.z0 + uz * L;
  const turn = still ? 0 : t * 0.8;
  shapes.band(ax, az, 1.25, 1.7, S.ink, 0.9, 0.02, 0, TAU, 24);
  shapes.band(ax, az, 1.33, 1.62, S.line, l.state === 'track' ? 0.85 : 1, 0.03, 0, TAU, 24);
  for (let i = 0; i < 4; i++) {
    const a = turn + (i * PI) / 2;
    shapes.seg(ax + Math.cos(a) * 0.4, az + Math.sin(a) * 0.4, ax + Math.cos(a) * 1.15, az + Math.sin(a) * 1.15, 0.26, S.line, 1, 0.04);
  }
}

/** A musical note standing in the air (facing the camera): an inked head and stem, a flag (beamed when `pair`). */
export function drawNote(shapes, x, y, z, s, hex, a, pair) {
  const head = ELLIPSE(0.42, 0.31);
  const headInk = ELLIPSE(0.55, 0.44);
  shapes.ushape(x, y, z, headInk, s, -0.35, S.ink, 0.95 * a);
  shapes.ushape(x + 0.36 * s * 0, y, z, RECT(0.25, 0, 0.55, 1.42), s, 0, S.ink, 0.95 * a);
  shapes.ushape(x, y, z, head, s, -0.35, hex, a);
  shapes.ushape(x, y, z, RECT(0.32, 0.05, 0.48, 1.35), s, 0, hex, a);
  // the flag
  const flag = pair ? [0.32, 1.35, 1.1, 1.05, 1.1, 0.8, 0.32, 1.1] : [0.32, 1.35, 0.95, 0.9, 0.85, 0.75, 0.32, 1.08];
  const flagInk = pair ? [0.22, 1.47, 1.22, 1.15, 1.22, 0.68, 0.22, 0.96] : [0.22, 1.47, 1.08, 0.92, 0.9, 0.62, 0.22, 0.96];
  shapes.ushape(x, y, z, flagInk, s, 0, S.ink, 0.95 * a);
  shapes.ushape(x, y, z, flag, s, 0, hex, a);
}
