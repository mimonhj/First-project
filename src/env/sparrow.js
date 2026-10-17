import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, setOutline, gradientMap, ensureIndex, OUTLINE_THICKNESS } from '../style.js';
import { waveHeight } from '../scenery.js';
import { buildShip, animateShip, disposeShip, hoistFlag } from '../ships.js';
import { buildPerson, animatePerson, disposePerson, walkSpeed, WALL_Z, SEAT_HEIGHT, RAIL } from '../people.js';

// Sparrow's Floating Island: the pirate town on the water where the player's ship docks
// for repairs, upgrades and a fresh coat of paint (the shipyard screen).
//
// Map (the berth is at the origin, the docked ship's bow points to +x; the showcase
// camera looks from the open sea at +z, so the whole town lies BEHIND the ship):
// - the berth: a long plank pier on piles with bollards, mooring lines and a gangplank
// - behind it the market plaza (rafts on barrels): striped market stalls, the big
//   welcome sign with the pirate sparrow, lantern posts, bunting, kids playing
// - The Salty Sparrow tavern on its own raft (half-timbered, balcony, chimney smoke)
// - the lookout tower with a crow's nest and a SPARROW weathervane
// - a sandy floating garden with palms; the shipyard with a crane hoisting a cannon
//   from a barge and a boat skeleton on the slipway
// - stilt shacks with patched roofs, joined by rope bridges, laundry lines, nets
// - rowboats bobbing (one with an old fisherman), a visiting cutter at anchor, gulls,
//   and some 30 townsfolk going about their day
// - a cleaning crew aboard the docked ship (attached with setShip): two moppers, a deck
//   hand scrubbing the bulwark, a bosun pacing the quarterdeck with a bucket, a hull
//   scrubber on a plank slung over the side and a kid scrubbing the waterline from a
//   rowboat, all trailing soap bubbles. Their hull spots are picked clear of the gun
//   barrels, which change with the upgrades.
//
// Draw calls: every static part is baked into a few vertex-coloured meshes (one per
// ink weight), all fluttering cloth (bunting, flags, laundry) is ONE morph-target mesh,
// and the gulls, smoke and bubbles are instanced.
//
// The town can be walked (the town view, see walk.js): build() also returns env.walk, plain data
// generated from the same platform / bridge / prop calls that draw the town, so it always matches
// the art: the decks the captain may stand on (inset from the rails and the water's edge), the rope
// bridges, the props in the way, the places (the ship, the shipyard, Polly's Plumes & Trims on
// platform s1 and The Salty Sparrow) and the spawn at the gangplank. Walkable: the pier, the plaza,
// the tavern raft, the tower raft, the shipyard, Polly's and the garden. env.walk.camBlockers are
// for the walk camera only (town.js): things up in the air the captain walks under or round but the
// lens must not pass through (the signs' boards, the leaning palms, the beach umbrella, the tavern's
// balcony, Polly's awning, the market stalls' awnings). env.cheer('polly' | 'snips' | 'tailors',
// seconds): a purchase at Polly's. env.setCaptain(x, z) (null to clear): where the captain stands in
// the town view, each frame (town.js); a townsperson walking a path waits while he stands in the way.

export const meta = {
  name: "Sparrow's Floating Island",
  place: "Sparrow's Floating Island",
  subtitle: 'A pirate town on the water. Shipwrights, a tavern and a crew to scrub your decks.',
};

export const palette = {
  skyTop: 0x3c8fe8,
  skyHorizon: 0xffe6b8,
  sunColor: 0xfff0cf,
  sunDir: [-0.5, 0.62, 0.6],
  sunIntensity: 2.45,
  hemiSky: 0xdcefff,
  hemiGround: 0x6a7f96,
  hemiIntensity: 1.45,
  fogColor: 0xffe9c8,
  fogNear: 120,
  fogFar: 420,
  waterDeep: 0x1a76c8,
  waterShallow: 0x3cc8e2,
  waterFoam: 0xffffff,
  waveAmp: 0.45,
  cloudColor: 0xffffff,
  cloudShade: 0xd9dff0,
  cloudCount: 12,
};

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------
const PI = Math.PI;
const TAU = PI * 2;
const DECK = 1.3; // top of the town's boardwalks
const TOWER_H = 5.8; // the lookout tower's crow's nest (low enough that its weathervane stays in the shipyard view)
// The welcome sign: where it stands on the plaza and how much higher than on plain 4.6 posts its board
// sits (high and far enough left to read over the docked ship's rigging and sails, even the big tier-2
// ones, over most of the showcase camera's sway).
const SIGN = { x: -5.9, z: -6.9, ry: 0.22, lift: 2.1 };
const SIGN_LIFT = SIGN.lift;
const BERTH = { x: 0, z: 0, h: PI / 2 }; // bow to +x; the town lies to -z (behind the ship)
const WORLD_R = 120;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------
const COL = {
  wood: 0xc68b4e, wood2: 0xb3773f, wood3: 0xd9a465, plank: 0xe2b675, woodDark: 0x7a4a28, woodDeep: 0x5a3820,
  rope: 0xe9cf92, iron: 0x3b4258, brass: 0xffc93c, barrel: 0xab6a3a, barrel2: 0x95592f, hoop: 0x4a3a34,
  sand: 0xf7dd9c, sand2: 0xeccb84, grass: 0x7acb4f, bush: 0x4c9e3e, leaf: 0x5fbf4a, leaf2: 0x3f9a46,
  trunk: 0xb98a55, trunkRing: 0x8f6338, coconut: 0x7a4f2a,
  canvas: 0xf6ecd2, white: 0xfaf6ee, red: 0xe2383d, gold: 0xffc93c, teal: 0x2bb3a3, blue: 0x3a6fd8, navy: 0x2b3866,
  pink: 0xf58fb0, orange: 0xff9a3c, purple: 0x9b6fd6, green: 0x3fae5a, yellow: 0xffd84a, cream: 0xfff1d0,
  glass: 0x2b3866, glow: 0xffd36b, door: 0x7b4a2b, stone: 0xc6bcab, stoneDark: 0x8f8579, cork: 0xf08a3c,
  net: 0x5e4a30, smoke: 0xf3f0ea, bubble: 0xd8f4ff, foam: 0xffffff,
  bird: 0xa8693a, birdDark: 0x6e4226, birdBelly: 0xf6e7c8, birdCap: 0x8d8a9a, beak: 0xffa630, black: 0x2a2230,
  fish: 0x8fc3e0, fishDark: 0x5b8fb8, apple: 0xe63b3b, banana: 0xffd84a, melon: 0x4cae4c, pumpkin: 0xff8c2a,
  gull: 0xfdfdfd, gullWing: 0xdfe7f0,
};
const WALLS = [0xf9b4c0, 0xfde29a, 0xaee6c8, 0xa7d3f5, 0xffcfa1, 0xd7c4f5, 0xf7a58f, 0xc6e8a0];
const ROOFS = [0xe45c33, 0x3a6fd8, 0x2bb3a3, 0x9b6fd6, 0xf2a93b, 0x4c9e3e, 0xd04b6b];
const FLAGS = [0xe63946, 0xffc93c, 0x3a6fd8, 0x3fae5a, 0xf58fb0, 0xff9a3c, 0xfaf6ee, 0x9b6fd6];

/** Lighter (k > 0) or darker (k < 0) version of an sRGB hex colour. */
function shade(hex, k) {
  const f = (v) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  return (f((hex >> 16) & 255) << 16) | (f((hex >> 8) & 255) << 8) | f(hex & 255);
}

// Statics use cached toon() materials only to carry a colour and an ink weight: bake()
// turns them into vertex colours on three shared materials (bold ink, thin ink, no ink).
const THIN = { thickness: 0.0036 };
const ink = (c) => toon(c);
const thin = (c) => toon(c, { outline: THIN });
const flat = (c) => toon(c, { outline: false });
const WINDOW_GLOW = () => toon(0xffd36b, { emissive: 0xffb43c, emissiveIntensity: 0.75, outline: false });

const VC = new Map();
function vcMaterial(kind) {
  let m = VC.get(kind);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap(3) });
    m.name = `sparrow:${kind}`;
    setOutline(m, kind === 'ink' ? true : kind === 'thin' ? THIN : false);
    VC.set(kind, m);
  }
  return m;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
const geoCache = new Map();
function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
const r3 = (v) => Math.round(v * 1000) / 1000;
// RoundedBoxGeometry comes un-indexed (324 vertices); welded it is ~100
const rbox = (w, h, d, r = 0.08, seg = 1) =>
  cached(`rb${r3(w)},${r3(h)},${r3(d)},${r3(r)},${seg}`, () => {
    const g = new RoundedBoxGeometry(w, h, d, seg, Math.max(0.005, Math.min(r, w / 2 - 0.005, h / 2 - 0.005, d / 2 - 0.005)));
    g.deleteAttribute('uv');
    return mergeVertices(g, 1e-4);
  });
// a plain box (12 triangles), for thin trim where rounded edges would not show: battens, clapboards
const box = (w, h, d) =>
  cached(`bx${r3(w)},${r3(h)},${r3(d)}`, () => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.deleteAttribute('uv');
    return g;
  });
const cyl = (rt, rb, h, seg = 12, open = false) => cached(`cy${r3(rt)},${r3(rb)},${r3(h)},${seg},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
const sphere = (seg = 14) => cached(`sp${seg}`, () => new THREE.SphereGeometry(1, seg, Math.max(5, Math.round(seg * 0.7))));
const cone = (r, h, seg = 12) => cached(`co${r3(r)},${r3(h)},${seg}`, () => new THREE.ConeGeometry(r, h, seg));
const torus = (R, r, ts = 18, rs = 6, arc = TAU) => cached(`to${r3(R)},${r3(r)},${ts},${rs},${r3(arc)}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc));
const capsule = (r, len, seg = 8) => cached(`ca${r3(r)},${r3(len)},${seg}`, () => new THREE.CapsuleGeometry(r, len, 3, seg));

function lathe(key, profile, seg = 16) {
  return cached(key, () => {
    const pts = profile[0][1] > profile[profile.length - 1][1] ? profile.slice().reverse() : profile;
    return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  });
}

function add(parent, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (s !== undefined) {
    if (typeof s === 'number') m.scale.setScalar(s);
    else m.scale.set(s[0], s[1], s[2]);
  }
  parent.add(m);
  return m;
}
const _up = V3(0, 1, 0);
const _bx = V3();
const _by = V3();
const _bz = V3();
const _bm = new THREE.Matrix4();
/** Orient obj so its local +z runs along dir and its local +y stays as close to `up` as possible. */
function orient(obj, dir, up = _up) {
  _bz.copy(dir).normalize();
  _bx.crossVectors(up, _bz);
  if (_bx.lengthSq() < 1e-8) _bx.set(1, 0, 0);
  _bx.normalize();
  _by.crossVectors(_bz, _bx);
  _bm.makeBasis(_bx, _by, _bz);
  obj.quaternion.setFromRotationMatrix(_bm);
}
/** Capsule stick between two points (parent space). */
function rod(parent, material, a, b, r, seg = 8) {
  const d = V3().subVectors(b, a);
  const len = d.length();
  const m = new THREE.Mesh(capsule(r, Math.max(0.001, len), seg), material);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(_up, d.normalize());
  parent.add(m);
  return m;
}
/** Rounded beam (w wide, h tall) from a to b, its flat side up. */
function beam(parent, material, a, b, w, h, r = 0.04) {
  const d = V3().subVectors(b, a);
  const len = d.length();
  // a unit-length beam stretched along z (shared by beams of every length)
  const m = new THREE.Mesh(rbox(w, h, 1, r), material);
  m.scale.z = Math.max(0.001, len);
  m.position.copy(a).addScaledVector(d, 0.5);
  orient(m, d);
  parent.add(m);
  return m;
}
/** Sagging curve between a and b (a parabola dipping `sag` in the middle). */
function sagCurve(a, b, sag, n = 12) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = V3().lerpVectors(a, b, u);
    p.y -= sag * 4 * u * (1 - u);
    pts.push(p);
  }
  return pts;
}
/** Tube (rope) along points, smooth normals, closed ends. */
function tubeGeo(points, r, radial = 6) {
  const pos = [];
  const index = [];
  const n = points.length;
  let prevN = null;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const tan = points[Math.min(n - 1, i + 1)].clone().sub(points[Math.max(0, i - 1)]).normalize();
    let nrm;
    if (!prevN) {
      nrm = Math.abs(tan.y) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0);
      nrm.sub(tan.clone().multiplyScalar(nrm.dot(tan))).normalize();
    } else nrm = prevN.clone().sub(tan.clone().multiplyScalar(prevN.dot(tan))).normalize();
    prevN = nrm;
    const bin = V3().crossVectors(tan, nrm);
    const rr = typeof r === 'function' ? r(i / (n - 1)) : r;
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(p.x + (nrm.x * c + bin.x * s) * rr, p.y + (nrm.y * c + bin.y * s) * rr, p.z + (nrm.z * c + bin.z * s) * rr);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k;
      const b = i * radial + ((k + 1) % radial);
      const c = (i + 1) * radial + k;
      const d = (i + 1) * radial + ((k + 1) % radial);
      index.push(a, b, c, b, d, c);
    }
  }
  const base = pos.length / 3;
  pos.push(points[0].x, points[0].y, points[0].z, points[n - 1].x, points[n - 1].y, points[n - 1].z);
  for (let k = 0; k < radial; k++) {
    index.push(base, (k + 1) % radial, k);
    index.push(base + 1, (n - 1) * radial + k, (n - 1) * radial + ((k + 1) % radial));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
function rope(parent, material, pts, r = 0.035, radial = 5) {
  const m = new THREE.Mesh(tubeGeo(pts, r, radial), material);
  parent.add(m);
  return m;
}
/** Flat extruded shape (in the xy plane, depth along z, centred on z = 0). */
function slabShape(shape, depth, bevel = 0.02) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// ---------------------------------------------------------------------------
// Baking: merge static meshes into one mesh per ink weight (vertex colours), and
// glowing / textured parts into one mesh per material.
// ---------------------------------------------------------------------------
function inkClass(m) {
  if (m.map || m.transparent || (m.emissive && m.emissive.getHex() !== 0) || !m.color) return null;
  const op = m.userData.outlineParameters;
  if (!op || op.visible === false) return 'flat';
  return (op.thickness ?? OUTLINE_THICKNESS) < OUTLINE_THICKNESS * 0.8 ? 'thin' : 'ink';
}
function bake(root, { only = null, force = null } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  const victims = [];
  root.traverse((o) => {
    if (o === root || !o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material)) return;
    for (let p = o; p && p !== root; p = p.parent) if (p.userData.keep) return;
    let cls = inkClass(o.material);
    if (force && cls) cls = force;
    if (only && cls !== only) return;
    const key = cls ?? o.material.uuid;
    let e = groups.get(key);
    if (!e) groups.set(key, (e = { cls, material: cls ? vcMaterial(cls) : o.material, uv: !cls && !!o.material.map, items: [], verts: 0, idx: 0 }));
    const g = o.geometry;
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    e.items.push(o);
    e.verts += n;
    e.idx += g.index ? g.index.count : n;
    victims.push(o);
  });
  // write every part straight into one set of arrays per group (no per-part copies)
  const m = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  const out = [];
  for (const [, e] of groups) {
    const pos = new Float32Array(e.verts * 3);
    const nor = new Float32Array(e.verts * 3);
    const col = e.cls ? new Float32Array(e.verts * 3) : null;
    const uv = e.uv ? new Float32Array(e.verts * 2) : null;
    const index = e.verts > 65535 ? new Uint32Array(e.idx) : new Uint16Array(e.idx);
    let vo = 0;
    let io = 0;
    for (const o of e.items) {
      const g = o.geometry;
      const P = g.attributes.position;
      const N = g.attributes.normal;
      const n = P.count;
      m.multiplyMatrices(inv, o.matrixWorld);
      nm.getNormalMatrix(m);
      const flip = m.determinant() < 0; // a mirrored part: keep its faces facing out
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(m);
        pos[(vo + i) * 3] = v.x;
        pos[(vo + i) * 3 + 1] = v.y;
        pos[(vo + i) * 3 + 2] = v.z;
        v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
        nor[(vo + i) * 3] = v.x;
        nor[(vo + i) * 3 + 1] = v.y;
        nor[(vo + i) * 3 + 2] = v.z;
      }
      if (col) {
        const c = o.userData.tint || o.material.color;
        for (let i = vo; i < vo + n; i++) {
          col[i * 3] = c.r;
          col[i * 3 + 1] = c.g;
          col[i * 3 + 2] = c.b;
        }
      }
      if (uv && g.attributes.uv) {
        const U = g.attributes.uv;
        for (let i = 0; i < n; i++) {
          uv[(vo + i) * 2] = U.getX(i);
          uv[(vo + i) * 2 + 1] = U.getY(i);
        }
      }
      if (g.index) {
        const I = g.index.array;
        for (let i = 0; i < I.length; i += 3) {
          index[io++] = I[i] + vo;
          index[io++] = I[flip ? i + 2 : i + 1] + vo;
          index[io++] = I[flip ? i + 1 : i + 2] + vo;
        }
      } else {
        for (let i = 0; i < n; i += 3) {
          index[io++] = vo + i;
          index[io++] = vo + (flip ? i + 2 : i + 1);
          index[io++] = vo + (flip ? i + 1 : i + 2);
        }
      }
      vo += n;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, e.material);
    mesh.matrixAutoUpdate = false;
    out.push(mesh);
  }
  for (const o of victims) o.parent.remove(o);
  for (const mesh of out) root.add(mesh);
  return out;
}

// ---------------------------------------------------------------------------
// Flutter: bunting, flags and laundry share ONE mesh. Every vertex sways along its
// piece's normal by A * w * sin(wt + phase); with two morph targets (A w cos(phase) n,
// A w sin(phase) n) driven by (sin wt, cos wt) the outline pass follows the cloth too.
// ---------------------------------------------------------------------------
class Flutter {
  constructor() {
    this.parts = [];
  }
  /** geo in local space, mat4 to root space, normal in local space, wfn(localPos) -> [weight, phase]. */
  add(geo, hex, mat4, normal, wfn, cls = 'thin') {
    const g = geo.index ? geo.clone() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    ensureIndex(g);
    const p = g.attributes.position;
    const n = p.count;
    const m0 = new Float32Array(n * 3);
    const m1 = new Float32Array(n * 3);
    const nn = normal.clone().transformDirection(mat4);
    const v = V3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(p, i);
      const [w, ph] = wfn(v);
      const c = Math.cos(ph) * w;
      const s = Math.sin(ph) * w;
      m0[i * 3] = nn.x * c;
      m0[i * 3 + 1] = nn.y * c;
      m0[i * 3 + 2] = nn.z * c;
      m1[i * 3] = nn.x * s;
      m1[i * 3 + 1] = nn.y * s;
      m1[i * 3 + 2] = nn.z * s;
    }
    g.applyMatrix4(mat4);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color(hex);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.userData.m = [m0, m1];
    g.userData.cls = cls;
    this.parts.push(g);
  }
  build(parent) {
    const out = [];
    for (const cls of ['thin', 'ink']) {
      const parts = this.parts.filter((g) => g.userData.cls === cls);
      if (!parts.length) continue;
      const merged = mergeGeometries(parts, false);
      let total = 0;
      for (const g of parts) total += g.attributes.position.count;
      const m0 = new Float32Array(total * 3);
      const m1 = new Float32Array(total * 3);
      let off = 0;
      for (const g of parts) {
        m0.set(g.userData.m[0], off * 3);
        m1.set(g.userData.m[1], off * 3);
        off += g.attributes.position.count;
        g.dispose();
      }
      merged.morphAttributes.position = [new THREE.BufferAttribute(m0, 3), new THREE.BufferAttribute(m1, 3)];
      merged.morphTargetsRelative = true;
      const mesh = new THREE.Mesh(merged, vcMaterial(cls));
      mesh.morphTargetInfluences = [0, 0];
      mesh.matrixAutoUpdate = false;
      mesh.userData.keep = true;
      parent.add(mesh);
      out.push(mesh);
    }
    this.parts.length = 0;
    return out;
  }
}

// ---------------------------------------------------------------------------
// Sign texture (painted lettering for the welcome sign, the tavern and the shipyard)
// ---------------------------------------------------------------------------
const SIGN_FONT = '"Luckiest Guy", "Fredoka", "Arial Black", Impact, "DejaVu Sans", sans-serif';
const SIGN_W = 1024;
const SIGN_H = 1024;
const SIGN_UV = {
  welcome: [0, 0, 1024, 340],
  tavern: [0, 340, 640, 172],
  yard: [640, 340, 384, 172],
  polly: [0, 512, 1024, 300],
  tailor: [0, 812, 500, 180],
  tailorBack: [512, 812, 500, 180], // the same arrow seen from behind: pointing left
};
function paintSigns(c) {
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const rr = (x, y, w, h, r) => {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };
  // hand-lettered text: thick ink stroke under a bright fill, each letter a little wobbly
  const letters = (text, cx, cy, size, fill, stroke = '#2a1a12', wob = 0.06, spacing = 0.02) => {
    g.font = `${size}px ${SIGN_FONT}`;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    const widths = [...text].map((ch) => g.measureText(ch).width + size * spacing);
    const total = widths.reduce((a, b) => a + b, 0);
    let x = cx - total / 2;
    let i = 0;
    for (const ch of text) {
      const w = widths[i];
      g.save();
      g.translate(x + w / 2, cy + Math.sin(i * 1.7) * size * 0.04);
      g.rotate(Math.sin(i * 2.3 + 1) * wob);
      g.lineJoin = 'round';
      g.lineWidth = size * 0.16;
      g.strokeStyle = stroke;
      g.strokeText(ch, -w / 2, 0);
      g.fillStyle = fill;
      g.fillText(ch, -w / 2, 0);
      g.restore();
      x += w;
      i++;
    }
  };
  const board = ([x, y, w, h], bg, edge, grain) => {
    g.fillStyle = edge;
    rr(x + 4, y + 4, w - 8, h - 8, 26);
    g.fill();
    g.fillStyle = bg;
    rr(x + 16, y + 16, w - 32, h - 32, 18);
    g.fill();
    g.strokeStyle = grain;
    g.lineWidth = 3;
    for (let k = 1; k < 4; k++) {
      const yy = y + (h * k) / 4;
      g.beginPath();
      g.moveTo(x + 22, yy);
      g.bezierCurveTo(x + w * 0.3, yy + 5, x + w * 0.6, yy - 5, x + w - 22, yy + 2);
      g.stroke();
    }
  };
  // welcome sign
  const W = SIGN_UV.welcome;
  board(W, '#ffe7b0', '#7a4a28', 'rgba(150, 95, 45, 0.25)');
  letters('WELCOME TO', W[0] + W[2] / 2, W[1] + 62, 46, '#3a6fd8', '#2a1a12', 0.05);
  letters("SPARROW'S", W[0] + W[2] / 2 + 70, W[1] + 150, 110, '#e2383d', '#2a1a12', 0.07);
  letters('FLOATING ISLAND', W[0] + W[2] / 2, W[1] + 262, 76, '#2bb3a3', '#2a1a12', 0.05);
  // painted sparrow silhouette left of the name
  const bx = W[0] + 150;
  const by = W[1] + 152;
  g.save();
  g.translate(bx, by);
  g.lineWidth = 9;
  g.strokeStyle = '#2a1a12';
  g.fillStyle = '#a8693a';
  g.beginPath();
  g.ellipse(0, 6, 54, 40, -0.2, 0, TAU);
  g.moveTo(-40, 10);
  g.lineTo(-92, -22);
  g.lineTo(-84, 22);
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(40, -26, 30, 0, TAU);
  g.fill();
  g.stroke();
  g.fillStyle = '#f6e7c8';
  g.beginPath();
  g.ellipse(18, 22, 30, 20, -0.3, 0, TAU);
  g.fill();
  g.fillStyle = '#ffa630';
  g.beginPath();
  g.moveTo(66, -30);
  g.lineTo(94, -22);
  g.lineTo(66, -14);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#e2383d';
  g.beginPath();
  g.arc(36, -40, 26, PI, TAU);
  g.fill();
  g.stroke();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(48, -26, 9, 0, TAU);
  g.fill();
  g.fillStyle = '#2a1a12';
  g.beginPath();
  g.arc(51, -26, 5, 0, TAU);
  g.fill();
  g.restore();
  // tavern
  const T = SIGN_UV.tavern;
  board(T, '#1f6f6a', '#5a3820', 'rgba(0, 0, 0, 0.12)');
  letters('THE SALTY', T[0] + T[2] / 2, T[1] + 56, 52, '#ffd84a', '#2a1a12', 0.05);
  letters('SPARROW', T[0] + T[2] / 2, T[1] + 118, 72, '#ffd84a', '#2a1a12', 0.06);
  // shipyard
  const Y = SIGN_UV.yard;
  board(Y, '#d83a3a', '#5a3820', 'rgba(0, 0, 0, 0.12)');
  letters('SHIPYARD', Y[0] + Y[2] / 2, Y[1] + Y[3] / 2 + 4, 58, '#fff3d6', '#2a1a12', 0.05);
  // Polly's Plumes & Trims: pink board, a curly plume on the left, open scissors on the right
  const Pq = SIGN_UV.polly;
  board(Pq, '#ffd3dc', '#1f8f84', 'rgba(200, 90, 120, 0.18)');
  g.fillStyle = 'rgba(255, 255, 255, 0.55)';
  for (let k = 0; k < 9; k++) {
    g.beginPath();
    g.arc(Pq[0] + 250 + k * 66, Pq[1] + 40, 9, 0, TAU); // a row of white dots along the top
    g.fill();
  }
  letters("POLLY'S", Pq[0] + Pq[2] / 2, Pq[1] + 118, 112, '#e2387a', '#2a1a12', 0.06);
  letters('PLUMES & TRIMS', Pq[0] + Pq[2] / 2, Pq[1] + 222, 64, '#1f8f84', '#2a1a12', 0.05);
  // the plume: a curved quill with feathery barbs
  g.save();
  g.translate(Pq[0] + 120, Pq[1] + 160);
  g.rotate(-0.5);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const vane = new Path2D();
  vane.moveTo(0, 100);
  vane.bezierCurveTo(-70, 40, -60, -60, 10, -110);
  vane.bezierCurveTo(60, -60, 60, 40, 0, 100);
  g.lineWidth = 10;
  g.strokeStyle = '#2a1a12';
  g.stroke(vane);
  g.fillStyle = '#9b6fd6';
  g.fill(vane);
  g.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  g.lineWidth = 5;
  for (let k = 0; k < 6; k++) {
    const yy = 70 - k * 30;
    g.beginPath();
    g.moveTo(0, yy);
    g.lineTo(-34 + k * 3, yy - 26);
    g.moveTo(0, yy);
    g.lineTo(34 - k * 3, yy - 26);
    g.stroke();
  }
  g.strokeStyle = '#2a1a12';
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(4, 140);
  g.quadraticCurveTo(0, 20, 8, -100);
  g.stroke();
  g.restore();
  // the scissors, open
  g.save();
  g.translate(Pq[0] + Pq[2] - 125, Pq[1] + 150);
  g.lineJoin = 'round';
  for (const s of [-1, 1]) {
    g.save();
    g.rotate(s * 0.32);
    g.fillStyle = '#d8dde8';
    g.strokeStyle = '#2a1a12';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(-10, 0);
    g.lineTo(0, -112);
    g.lineTo(16, -6);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#e2383d';
    g.beginPath();
    g.ellipse(s * 4, 52, 26, 34, 0, 0, TAU);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffd3dc';
    g.beginPath();
    g.ellipse(s * 4, 54, 12, 18, 0, 0, TAU);
    g.fill();
    g.restore();
  }
  g.fillStyle = '#ffc93c';
  g.beginPath();
  g.arc(0, 4, 11, 0, TAU);
  g.fill();
  g.stroke();
  g.restore();
  // the arrow board to the tailor: painted on a board shaped like an arrow pointing right (and on
  // its back, where the same arrow points left)
  const arrow = (x, y, w, h, inset, dir) => {
    const tip = h * 0.5;
    const X = (u) => (dir > 0 ? x + u : x + w - u);
    g.beginPath();
    g.moveTo(X(inset), y + inset);
    g.lineTo(X(w - tip - inset * 0.3), y + inset);
    g.lineTo(X(w - inset * 1.4), y + h / 2);
    g.lineTo(X(w - tip - inset * 0.3), y + h - inset);
    g.lineTo(X(inset), y + h - inset);
    g.closePath();
  };
  for (const [Tq, dir] of [[SIGN_UV.tailor, 1], [SIGN_UV.tailorBack, -1]]) {
    g.fillStyle = '#5a3820';
    arrow(Tq[0], Tq[1], Tq[2], Tq[3], 4, dir);
    g.fill();
    g.fillStyle = '#fff3d6';
    arrow(Tq[0], Tq[1], Tq[2], Tq[3], 16, dir);
    g.fill();
    letters('TAILOR', Tq[0] + Tq[2] * (dir > 0 ? 0.42 : 0.58), Tq[1] + Tq[3] / 2 + 4, 74, '#e2387a', '#2a1a12', 0.05);
  }
}
function signTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = SIGN_W;
  c.height = SIGN_H;
  paintSigns(c);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // repaint once the game's display font has arrived (it may still be loading)
  if (document.fonts && document.fonts.load) {
    document.fonts.load(`64px ${SIGN_FONT}`).then(() => {
      if (tex.userData.disposed) return;
      paintSigns(c);
      tex.needsUpdate = true;
    }, () => {});
  }
  return tex;
}
function signPlane(tex, region, w, h) {
  const [x, y, rw, rh] = SIGN_UV[region];
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    uv.setXY(i, (x + u * rw) / SIGN_W, 1 - (y + (1 - v) * rh) / SIGN_H);
  }
  return g;
}
/** The outline of an arrow board pointing +x (w long, h tall, centred), as painted on the 'tailor' sign. */
function arrowShape(w, h, inset = 0) {
  const tip = h * 0.5;
  const x0 = -w / 2;
  const y0 = -h / 2;
  return new THREE.Shape([
    new THREE.Vector2(x0 + inset, y0 + inset),
    new THREE.Vector2(x0 + w - tip - inset * 0.3, y0 + inset),
    new THREE.Vector2(x0 + w - inset * 1.4, 0),
    new THREE.Vector2(x0 + w - tip - inset * 0.3, y0 + h - inset),
    new THREE.Vector2(x0 + inset, y0 + h - inset),
  ]);
}
/**
 * The painted face of the arrow board (its UVs map the arrow onto the 'tailor' atlas region). back:
 * the face on the other side (facing -z, the arrow seen pointing left), for the board's back.
 */
function arrowPlane(w, h, back = false) {
  const shape = arrowShape(w, h, w * (4 / SIGN_UV.tailor[2]));
  if (back) for (const v of shape.curves) for (const q of [v.v1, v.v2]) if (q) q.x = -q.x;
  const g = new THREE.ShapeGeometry(shape); // (faces +z either way: ShapeGeometry fixes the winding)
  const [x, y, rw, rh] = SIGN_UV[back ? 'tailorBack' : 'tailor'];
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const u = (p.getX(i) + w / 2) / w;
    const v = (p.getY(i) + h / 2) / h;
    uv.setXY(i, (x + u * rw) / SIGN_W, 1 - (y + (1 - v) * rh) / SIGN_H);
  }
  if (back) g.rotateY(PI);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
const barrelGeo = () => lathe('barrel', [[0, -0.5], [0.36, -0.5], [0.44, -0.3], [0.48, 0], [0.44, 0.3], [0.36, 0.5], [0, 0.5]], 14);
function barrel(parent, x, y, z, s = 1, color = COL.barrel, lying = false, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.set(lying ? PI / 2 : 0, ry, 0, 'YXZ');
  g.scale.setScalar(s);
  parent.add(g);
  add(g, barrelGeo(), ink(color), 0, 0.5, 0);
  for (const hy of [0.2, 0.8]) add(g, torus(0.455, 0.035, 18, 4), thin(COL.hoop), 0, hy, 0, PI / 2);
  if (!lying) add(g, cyl(0.36, 0.36, 0.04, 14), thin(shade(color, 0.15)), 0, 1.0, 0);
  return g;
}
function crate(parent, x, y, z, s = 1, ry = 0, color = COL.wood3) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.scale.setScalar(s);
  parent.add(g);
  add(g, rbox(0.8, 0.8, 0.8, 0.06), ink(color), 0, 0.4, 0);
  const slat = thin(shade(color, -0.25));
  for (const sz of [-1, 1]) {
    add(g, rbox(0.8, 0.1, 0.05, 0.02), slat, 0, 0.12, sz * 0.41);
    add(g, rbox(0.8, 0.1, 0.05, 0.02), slat, 0, 0.68, sz * 0.41);
    const d = add(g, rbox(0.98, 0.09, 0.05, 0.02), slat, 0, 0.4, sz * 0.41);
    d.rotation.z = sz * 0.62;
  }
  return g;
}
function sack(parent, x, y, z, s = 1, color = 0xe8d3a0) {
  const m = add(parent, sphere(10), ink(color), x, y + 0.28 * s, z);
  m.scale.set(0.35 * s, 0.32 * s, 0.3 * s);
  add(parent, sphere(8), thin(shade(color, -0.2)), x, y + 0.6 * s, z, 0, 0, 0, [0.12 * s, 0.1 * s, 0.12 * s]);
}

/** Hanging lantern: a dark cap, a glowing body and a base; returns the lantern's top. */
function lantern(parent, x, y, z, glowMat, s = 1) {
  add(parent, cone(0.17 * s, 0.16 * s, 8), ink(COL.iron), x, y + 0.26 * s, z);
  add(parent, torus(0.05 * s, 0.015 * s, 8, 4), thin(COL.iron), x, y + 0.36 * s, z);
  const body = add(parent, lathe('lanternGlass', [[0, -0.16], [0.12, -0.14], [0.14, 0], [0.12, 0.14], [0, 0.16]], 10), glowMat, x, y + 0.04 * s, z);
  body.scale.setScalar(s);
  add(parent, cyl(0.13 * s, 0.11 * s, 0.07 * s, 10), ink(COL.iron), x, y - 0.14 * s, z);
}
/** Lamp post with an arm and a lantern hanging from it. */
function lampPost(parent, x, y, z, ry, glowMat) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  parent.add(g);
  add(g, cyl(0.09, 0.12, 2.6, 8), ink(COL.woodDark), 0, 1.3, 0);
  add(g, rbox(0.3, 0.12, 0.3, 0.04), ink(COL.woodDark), 0, 0.06, 0);
  beam(g, ink(COL.woodDark), V3(0, 2.45, 0), V3(0, 2.45, 0.62), 0.09, 0.09, 0.03);
  rod(g, thin(COL.woodDark), V3(0, 2.1, 0), V3(0, 2.42, 0.36), 0.03);
  rod(g, thin(COL.iron), V3(0, 2.44, 0.56), V3(0, 2.3, 0.56), 0.012);
  lantern(g, 0, 1.98, 0.56, glowMat);
}
/** Mooring bollard (iron, with a rope wrap). */
function bollard(parent, x, y, z) {
  add(parent, lathe('bollard', [[0, 0], [0.2, 0], [0.17, 0.25], [0.14, 0.42], [0.22, 0.5], [0.2, 0.58], [0, 0.6]], 12), ink(COL.iron), x, y, z);
  add(parent, torus(0.16, 0.045, 14, 5), thin(COL.rope), x, y + 0.3, z, PI / 2);
}

// Cartoon sparrow (the island's mascot), facing +z, origin at its feet, ~1.25 tall at s = 1.
function sparrowBird(parent, s = 1, o = {}) {
  const g = new THREE.Group();
  parent.add(g);
  const flatX = o.flat ?? 1; // squash sideways (weathervane silhouette)
  const sph = sphere(16);
  const body = add(g, sph, ink(COL.bird), 0, 0.55, 0);
  body.scale.set(0.5 * flatX, 0.46, 0.62);
  add(g, sph, ink(COL.birdBelly), 0, 0.47, 0.2, 0, 0, 0, [0.4 * flatX, 0.36, 0.42]);
  add(g, sph, ink(COL.bird), 0, 0.98, 0.32, 0, 0, 0, [0.38 * flatX, 0.36, 0.38]);
  add(g, sph, ink(COL.birdCap), 0, 1.1, 0.27, 0, 0, 0, [0.33 * flatX, 0.22, 0.32]);
  add(g, sph, thin(COL.birdBelly), 0.24 * flatX, 0.93, 0.44, 0, 0, 0, [0.14 * flatX, 0.13, 0.12]);
  add(g, sph, thin(COL.birdBelly), -0.24 * flatX, 0.93, 0.44, 0, 0, 0, [0.14 * flatX, 0.13, 0.12]);
  add(g, sph, thin(COL.black), 0, 0.8, 0.55, 0, 0, 0, [0.14 * flatX, 0.1, 0.07]);
  const beakG = cached('sparrowBeak', () => new THREE.ConeGeometry(0.09, 0.3, 10).rotateX(PI / 2));
  add(g, beakG, ink(COL.beak), 0, 0.95, 0.75);
  for (const sx of [-1, 1]) {
    add(g, sph, thin(COL.white), sx * 0.15 * flatX, 1.05, 0.62, 0, 0, 0, [0.1, 0.12, 0.08]);
    add(g, sph, flat(COL.black), sx * 0.15 * flatX, 1.05, 0.69, 0, 0, 0, [0.055, 0.07, 0.03]);
    const w = add(g, sph, ink(COL.birdDark), sx * 0.42 * flatX, 0.62, -0.05, 0.25, 0, sx * 0.18);
    w.scale.set(0.11 * flatX, 0.3, 0.5);
    add(g, sph, thin(COL.birdBelly), sx * 0.5 * flatX, 0.6, -0.08, 0.25, 0, sx * 0.18, [0.04 * flatX, 0.1, 0.36]);
    rod(g, thin(COL.beak), V3(sx * 0.12, 0.2, 0.05), V3(sx * 0.12, 0, 0.08), 0.035);
    add(g, sph, thin(COL.beak), sx * 0.12, 0.02, 0.16, 0, 0, 0, [0.07, 0.03, 0.12]);
  }
  const tail = add(g, cached('sparrowTail', () => new THREE.ConeGeometry(0.22, 0.7, 10).rotateX(-PI / 2)), ink(COL.birdDark), 0, 0.72, -0.72, -0.5);
  tail.scale.set(1.2 * flatX, 0.35, 1);
  if (o.bandana !== false) {
    // a pirate's red bandana with a knot and tails
    add(g, sph, ink(COL.red), 0, 1.13, 0.27, 0, 0, 0, [0.36 * flatX, 0.2, 0.36]);
    add(g, sph, ink(COL.red), 0, 1.12, -0.06, 0, 0, 0, [0.1 * flatX, 0.09, 0.09]);
    add(g, sph, ink(COL.red), 0.05 * flatX, 1.02, -0.16, 0.6, 0, 0.3, [0.06 * flatX, 0.13, 0.05]);
    add(g, sph, ink(COL.red), -0.07 * flatX, 1.0, -0.15, 0.5, 0, -0.4, [0.06 * flatX, 0.13, 0.05]);
    add(g, sph, flat(COL.white), 0.18 * flatX, 1.2, 0.5, 0, 0, 0, [0.035, 0.035, 0.03]);
    add(g, sph, flat(COL.white), -0.1 * flatX, 1.24, 0.52, 0, 0, 0, [0.035, 0.035, 0.03]);
  }
  g.scale.setScalar(s);
  return g;
}

// A hat for a display head (the head's top at y 0.7 * s): 'tricorn', 'plumed' (a tricorn with a
// curled feather) or 'straw'.
function hatModel(parent, kind, s = 1) {
  const g = new THREE.Group();
  g.position.y = 0.66;
  g.scale.setScalar(s / 0.66);
  parent.add(g);
  if (kind === 'straw') {
    add(g, cyl(0.36, 0.36, 0.03, 14), ink(0xf2d27a), 0, 0.02, 0);
    add(g, cyl(0.15, 0.18, 0.17, 10), ink(0xf2d27a), 0, 0.11, 0);
    add(g, cyl(0.181, 0.181, 0.05, 10), ink(COL.red), 0, 0.06, 0);
    add(g, sphere(8), ink(0xeac564), 0, 0.19, 0, 0, 0, 0, [0.15, 0.05, 0.15]);
    return g;
  }
  const dark = kind === 'plumed' ? 0x5a3a8a : 0x2a2230;
  // the cocked brim: an upturned three-cornered dish round a rounded crown
  add(g, lathe('tricornBrim', [[0, 0], [0.19, 0], [0.34, 0.2], [0.31, 0.22], [0.17, 0.05], [0, 0.04]], 3), ink(dark), 0, 0, 0, 0, PI / 6, 0);
  add(g, sphere(8), ink(dark), 0, 0.1, 0, 0, 0, 0, [0.18, 0.17, 0.18]);
  // gold trim along the three cocked edges (the brim's corners: lathe angle PI / 6 + i * 2PI / 3)
  const corner = (i, r) => {
    const a = PI / 6 + (i * TAU) / 3;
    return [Math.sin(a) * r, Math.cos(a) * r];
  };
  for (let i = 0; i < 3; i++) {
    const [ax, az] = corner(i, 0.33);
    const [bx, bz] = corner(i + 1, 0.33);
    add(g, box(Math.hypot(bx - ax, bz - az) * 0.92, 0.035, 0.035), thin(COL.gold), (ax + bx) / 2, 0.215, (az + bz) / 2, 0, Math.atan2(-(bz - az), bx - ax), 0);
  }
  if (kind === 'plumed') {
    const f = add(g, sphere(8), ink(0xf58fb0), -0.1, 0.27, -0.04, 0, 0, 0.6, [0.07, 0.24, 0.11]);
    f.rotation.x = -0.35;
    add(g, sphere(6), ink(COL.white), -0.17, 0.42, -0.08, 0, 0, 0.9, [0.05, 0.12, 0.07]);
  }
  return g;
}

// Gull (body and wings as separate geometries for the instanced flock).
function gullGeometries() {
  const body = new THREE.Group();
  const sph = sphere(12);
  add(body, sph, ink(COL.gull), 0, 0, 0, 0, 0, 0, [0.42, 0.4, 0.88]);
  add(body, sph, ink(COL.gull), 0, 0.28, 0.85, 0, 0, 0, [0.36, 0.34, 0.36]);
  const tail = add(body, cached('gullTail', () => new THREE.ConeGeometry(0.3, 0.9, 8).rotateX(-PI / 2)), ink(COL.gull), 0, 0.05, -1.15);
  tail.scale.set(1.4, 0.4, 1);
  add(body, cached('gullBeak', () => new THREE.ConeGeometry(0.13, 0.5, 8).rotateX(PI / 2)), ink(COL.beak), 0, 0.24, 1.38);
  for (const sx of [-1, 1]) add(body, sph, ink(COL.black), sx * 0.2, 0.36, 1.08, 0, 0, 0, [0.05, 0.06, 0.04]);
  const wings = new THREE.Group();
  const wingGeo = cached('gullWing', () => new THREE.SphereGeometry(1, 12, 7).scale(1.05, 0.09, 0.42).translate(1.0, 0, 0));
  add(wings, wingGeo, ink(COL.gullWing), 0.2, 0, 0, 0, 0, 0.32);
  add(wings, wingGeo, ink(COL.gullWing), -0.2, 0, 0, 0, PI, 0.32);
  return [bake(body)[0].geometry, bake(wings)[0].geometry];
}

// Rowboat hull: a solid shell (outer skin, inner skin, rim, transom), bow +z, rim at y = 0.
function boatHullGeo(L, W, D, t = 0.07) {
  return cached(`boat${L},${W},${D}`, () => {
    const NU = 16;
    const NV = 9;
    const prof = (u) => {
      const hw = u < 0.45 ? (W / 2) * (0.72 + 0.28 * Math.sin((u / 0.45) * PI * 0.5)) : (W / 2) * Math.pow(Math.max(0, Math.cos(((u - 0.45) / 0.55) * PI * 0.5)), 0.75);
      const rimY = 0.3 * Math.pow(Math.max(0, (u - 0.62) / 0.38), 2) + 0.08 * Math.max(0, (0.15 - u) / 0.15);
      const dd = D * (u < 0.5 ? 0.82 + 0.18 * (u / 0.5) : 1 - 0.3 * ((u - 0.5) / 0.5));
      return [hw, rimY, dd];
    };
    const pos = [];
    const idx = [];
    const ring = (inner) => {
      const start = pos.length / 3;
      for (let i = 0; i <= NU; i++) {
        const u = i / NU;
        let [hw, rimY, dd] = prof(u);
        if (inner) {
          hw = Math.max(0.005, hw - t);
          dd = Math.max(0.01, dd - t);
        }
        for (let j = 0; j <= NV; j++) {
          const th = (j / NV) * PI;
          pos.push(hw * Math.cos(th), rimY - dd * Math.sin(th), (u - 0.5) * L);
        }
      }
      return start;
    };
    const o = ring(false);
    const n = ring(true);
    const at = (base, i, j) => base + i * (NV + 1) + j;
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NV; j++) {
        idx.push(at(o, i, j), at(o, i, j + 1), at(o, i + 1, j), at(o, i + 1, j), at(o, i, j + 1), at(o, i + 1, j + 1));
        idx.push(at(n, i, j), at(n, i + 1, j), at(n, i, j + 1), at(n, i + 1, j), at(n, i + 1, j + 1), at(n, i, j + 1));
      }
      for (const j of [0, NV]) {
        // rim strips joining the two skins
        const f = j === 0;
        if (f) idx.push(at(o, i, j), at(o, i + 1, j), at(n, i, j), at(n, i, j), at(o, i + 1, j), at(n, i + 1, j));
        else idx.push(at(o, i, j), at(n, i, j), at(o, i + 1, j), at(n, i, j), at(n, i + 1, j), at(o, i + 1, j));
      }
    }
    // transom: outer fan and inner fan, plus its top edge
    const [, rim0, d0] = prof(0);
    const co = pos.length / 3;
    pos.push(0, rim0 - d0 * 0.5, -L / 2);
    const ci = pos.length / 3;
    pos.push(0, rim0 - d0 * 0.45, -L / 2 + t);
    for (let j = 0; j < NV; j++) {
      idx.push(co, at(o, 0, j + 1), at(o, 0, j));
      idx.push(ci, at(n, 0, j), at(n, 0, j + 1));
    }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // make sure the outer keel normal points down
    const k = at(o, Math.round(NU / 2), Math.round(NV / 2));
    if (g.attributes.normal.getY(k) > 0) {
      for (let q = 0; q < idx.length; q += 3) [idx[q + 1], idx[q + 2]] = [idx[q + 2], idx[q + 1]];
      g.setIndex(idx);
      g.computeVertexNormals();
    }
    return g;
  });
}
function rowboat(parent, color, trim, L = 3.2, W = 1.4, D = 0.6) {
  const g = new THREE.Group();
  parent.add(g);
  add(g, boatHullGeo(L, W, D), ink(color), 0, 0, 0);
  add(g, rbox(W * 0.62, 0.06, L * 0.62, 0.02), thin(COL.wood3), 0, -D * 0.72, -0.05);
  for (const z of [-L * 0.22, L * 0.12]) add(g, rbox(W * 0.86, 0.08, 0.32, 0.03), thin(COL.wood3), 0, -0.14, z);
  // trim band along the rim
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const u = 0.05 + (i / 12) * 0.85;
    const hw = u < 0.45 ? (W / 2) * (0.72 + 0.28 * Math.sin((u / 0.45) * PI * 0.5)) : (W / 2) * Math.pow(Math.max(0, Math.cos(((u - 0.45) / 0.55) * PI * 0.5)), 0.75);
    const rimY = 0.3 * Math.pow(Math.max(0, (u - 0.62) / 0.38), 2) + 0.08 * Math.max(0, (0.15 - u) / 0.15);
    pts.push(V3(hw + 0.005, rimY - 0.08, (u - 0.5) * L));
  }
  for (const sx of [1, -1]) {
    const p2 = pts.map((p) => V3(p.x * sx, p.y, p.z));
    rope(g, thin(trim), p2, 0.05, 5);
  }
  return g;
}

// Palm tree: curved ringed trunk, drooping fronds, coconuts.
function frondGeometry() {
  return cached('frond', () => {
    let g = new THREE.SphereGeometry(1, 10, 3);
    g.scale(0.5, 0.12, 1.75);
    g.translate(0, 0, 1.65);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      const x = p.getX(i);
      p.setY(i, p.getY(i) + 0.42 * Math.abs(x) + 0.42 * z - 0.2 * z * z);
      p.setX(i, x * (1 - 0.3 * Math.max(0, z - 1.4)));
    }
    g.computeVertexNormals();
    return g;
  });
}
function palm(parent, x, y, z, s, dirX, dirZ, rand) {
  const H = (5.0 + rand() * 1.4) * s;
  const lean = (1.3 + rand() * 1.0) * s;
  const pts = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const off = lean * Math.pow(t, 1.7);
    pts.push(V3(x + dirX * off, y - 0.3 + (H + 0.3) * t, z + dirZ * off));
  }
  add(parent, tubeGeo(pts, (t) => (0.34 - 0.13 * t) * s * (1 + 0.12 * Math.max(0, Math.sin(t * PI * 9))), 7), ink(COL.trunk));
  const top = pts[N];
  const nF = 8;
  const a0 = rand() * 6;
  for (let i = 0; i < nF; i++) {
    const m = add(parent, frondGeometry(), ink(i % 2 ? COL.leaf : COL.leaf2), top.x, top.y, top.z);
    m.rotation.order = 'YXZ';
    m.rotation.y = a0 + (i / nF) * TAU + (rand() - 0.5) * 0.4;
    m.rotation.x = -0.1 + (rand() - 0.5) * 0.3;
    m.scale.setScalar(s * (0.95 + rand() * 0.2));
  }
  add(parent, sphere(10), ink(COL.leaf2), top.x, top.y + 0.12 * s, top.z, 0, 0, 0, [0.5 * s, 0.36 * s, 0.5 * s]);
  for (let i = 0; i < 3; i++) {
    const a = a0 + i * 2.1;
    add(parent, sphere(10), ink(COL.coconut), top.x + Math.cos(a) * 0.36 * s, top.y - 0.32 * s, top.z + Math.sin(a) * 0.36 * s, 0, 0, 0, 0.28 * s);
  }
  return { pts, s }; // the trunk's centre line (parent's frame), for the walk camera
}

// Where a ship's skin is, seen from one side (side = +1 / -1 along its local x): returns
// (z, y) => x of the outermost surface a horizontal ray coming in from that side would hit
// (ship-local), or null. The ship's triangles on that side are bucketed once on a (z, y) grid,
// so a query tests a handful of them (raycasting the merged ship costs ~2 ms a ray).
function hullProbe(ship, side) {
  ship.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(ship.matrixWorld).invert();
  const C = 0.25;
  const Z0 = -7;
  const Y0 = -1;
  const NZ = 56;
  const NY = 16;
  const cells = new Map();
  const tris = [];
  const m = new THREE.Matrix4();
  const a = V3();
  const b = V3();
  const c = V3();
  ship.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || !o.geometry.attributes.position) return;
    const P = o.geometry.attributes.position;
    const I = o.geometry.index ? o.geometry.index.array : null;
    const n = I ? I.length : P.count;
    m.multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i + 2 < n; i += 3) {
      a.fromBufferAttribute(P, I ? I[i] : i).applyMatrix4(m);
      b.fromBufferAttribute(P, I ? I[i + 1] : i + 1).applyMatrix4(m);
      c.fromBufferAttribute(P, I ? I[i + 2] : i + 2).applyMatrix4(m);
      if (a.x * side < 0.3 && b.x * side < 0.3 && c.x * side < 0.3) continue;
      const z0 = Math.floor((Math.min(a.z, b.z, c.z) - Z0) / C);
      const z1 = Math.floor((Math.max(a.z, b.z, c.z) - Z0) / C);
      const y0 = Math.floor((Math.min(a.y, b.y, c.y) - Y0) / C);
      const y1 = Math.floor((Math.max(a.y, b.y, c.y) - Y0) / C);
      if (z1 < 0 || y1 < 0 || z0 >= NZ || y0 >= NY) continue;
      const k = tris.length;
      tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      for (let iy = Math.max(0, y0); iy <= Math.min(NY - 1, y1); iy++) {
        for (let iz = Math.max(0, z0); iz <= Math.min(NZ - 1, z1); iz++) {
          const key = iy * NZ + iz;
          let list = cells.get(key);
          if (!list) cells.set(key, (list = []));
          list.push(k);
        }
      }
    }
  });
  return (z, y) => {
    const iz = Math.floor((z - Z0) / C);
    const iy = Math.floor((y - Y0) / C);
    const list = iz >= 0 && iy >= 0 && iz < NZ && iy < NY ? cells.get(iy * NZ + iz) : null;
    if (!list) return null;
    let best = null;
    for (const t of list) {
      const ay = tris[t + 1];
      const az = tris[t + 2];
      const by = tris[t + 4];
      const bz = tris[t + 5];
      const cy = tris[t + 7];
      const cz = tris[t + 8];
      // barycentric coordinates of (z, y) in the triangle projected onto the side
      const d = (by - cy) * (az - cz) + (cz - bz) * (ay - cy);
      if (Math.abs(d) < 1e-9) continue;
      const l1 = ((by - cy) * (z - cz) + (cz - bz) * (y - cy)) / d;
      const l2 = ((cy - ay) * (z - cz) + (az - cz) * (y - cy)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const x = l1 * tris[t] + l2 * tris[t + 3] + l3 * tris[t + 6];
      if (best === null || x * side > best * side) best = x;
    }
    return best;
  };
}

// Every visible triangle of a ship (not its crew: setShip takes them off first), ship-local, as a flat
// array of 9 numbers per triangle.
function shipTriangles(ship) {
  ship.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(ship.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const v = V3();
  const out = [];
  ship.traverseVisible((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || !o.geometry.attributes.position) return;
    const P = o.geometry.attributes.position;
    const I = o.geometry.index ? o.geometry.index.array : null;
    const n = I ? I.length : P.count;
    m.multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(P, I ? I[i] : i).applyMatrix4(m);
      out.push(v.x, v.y, v.z);
    }
  });
  return new Float32Array(out);
}

// Can a camera at C (looking toward T) see the point (x, y, z)? Every triangle is projected once into
// the camera's picture and bucketed on a grid there, so a query tests the handful under the point
// (with depth interpolated perspective-correctly) instead of raycasting the whole ship. region: points
// whose picture bounds the queries (the rest of the picture is left out).
function viewProbe(tris, C, T, region = null) {
  const F = V3().subVectors(T, C).normalize();
  const R = V3().crossVectors(F, _up).normalize();
  const U = V3().crossVectors(R, F);
  const CELL = 0.02;
  const LIM = 1.4;
  const N = Math.ceil((2 * LIM) / CELL);
  let bx0 = -LIM;
  let bx1 = LIM;
  let by0 = -LIM;
  let by1 = LIM;
  if (region) {
    bx0 = by0 = Infinity;
    bx1 = by1 = -Infinity;
    for (const p of region) {
      const d = V3().subVectors(p, C);
      const z = Math.max(0.3, d.dot(F));
      const x = d.dot(R) / z;
      const y = d.dot(U) / z;
      bx0 = Math.min(bx0, x - 0.02);
      bx1 = Math.max(bx1, x + 0.02);
      by0 = Math.min(by0, y - 0.02);
      by1 = Math.max(by1, y + 0.02);
    }
  }
  const n = tris.length / 9;
  const pr = new Float32Array(n * 9); // x, y, 1/z per corner
  const cells = new Map();
  let k = 0;
  for (let t = 0; t < n; t++) {
    let ok = true;
    for (let c = 0; c < 3 && ok; c++) {
      const i = t * 9 + c * 3;
      const dx = tris[i] - C.x;
      const dy = tris[i + 1] - C.y;
      const dz = tris[i + 2] - C.z;
      const z = dx * F.x + dy * F.y + dz * F.z;
      if (z < 0.3) ok = false;
      else {
        pr[k * 9 + c * 3] = (dx * R.x + dy * R.y + dz * R.z) / z;
        pr[k * 9 + c * 3 + 1] = (dx * U.x + dy * U.y + dz * U.z) / z;
        pr[k * 9 + c * 3 + 2] = 1 / z;
      }
    }
    if (!ok) continue;
    const o = k * 9;
    const mx0 = Math.max(bx0, Math.min(pr[o], pr[o + 3], pr[o + 6]));
    const mx1 = Math.min(bx1, Math.max(pr[o], pr[o + 3], pr[o + 6]));
    const my0 = Math.max(by0, Math.min(pr[o + 1], pr[o + 4], pr[o + 7]));
    const my1 = Math.min(by1, Math.max(pr[o + 1], pr[o + 4], pr[o + 7]));
    if (mx0 > mx1 || my0 > my1) continue; // (outside the region)
    const x0 = Math.floor((mx0 + LIM) / CELL);
    const x1 = Math.floor((mx1 + LIM) / CELL);
    const y0 = Math.floor((my0 + LIM) / CELL);
    const y1 = Math.floor((my1 + LIM) / CELL);
    if (x1 < 0 || y1 < 0 || x0 >= N || y0 >= N) continue;
    for (let iy = Math.max(0, y0); iy <= Math.min(N - 1, y1); iy++) {
      for (let ix = Math.max(0, x0); ix <= Math.min(N - 1, x1); ix++) {
        const key = iy * N + ix;
        let list = cells.get(key);
        if (!list) cells.set(key, (list = []));
        list.push(k);
      }
    }
    k++;
  }
  return (x, y, z) => {
    const dx = x - C.x;
    const dy = y - C.y;
    const dz = z - C.z;
    const d = dx * F.x + dy * F.y + dz * F.z;
    if (d < 0.3) return false;
    const px = (dx * R.x + dy * R.y + dz * R.z) / d;
    const py = (dx * U.x + dy * U.y + dz * U.z) / d;
    const ix = Math.floor((px + LIM) / CELL);
    const iy = Math.floor((py + LIM) / CELL);
    const list = ix >= 0 && iy >= 0 && ix < N && iy < N ? cells.get(iy * N + ix) : null;
    if (!list) return true;
    const near = 1 / Math.max(0.01, d - 0.05); // anything nearer than the point by 5 cm hides it
    for (const t of list) {
      const o = t * 9;
      const ax = pr[o];
      const ay = pr[o + 1];
      const bx = pr[o + 3];
      const by = pr[o + 4];
      const cx = pr[o + 6];
      const cy = pr[o + 7];
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(den) < 1e-12) continue;
      const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den;
      const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
      const l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      if (l1 * pr[o + 2] + l2 * pr[o + 5] + l3 * pr[o + 8] > near) return false;
    }
    return true;
  };
}

// Where the deck is taken (ship-local x, z): every bit of the ship between 5 and 55 cm above the deck
// (props, mast feet, coamings, kegs, the bulwarks' inside) rasterised on a 5 cm grid; at(x, z) is the
// distance from (x, z) to the nearest taken cell.
function deckOccupancy(tris, deckY, { X0 = -1.9, Z0 = -4.6, NX = 76, NZ = 206 } = {}) {
  const CS = 0.05;
  const taken = new Uint8Array(NX * NZ);
  const lo = deckY + 0.05;
  const hi = deckY + 0.55;
  const mark = (x, z) => {
    const ix = Math.floor((x - X0) / CS);
    const iz = Math.floor((z - Z0) / CS);
    if (ix >= 0 && iz >= 0 && ix < NX && iz < NZ) taken[iz * NX + ix] = 1;
  };
  const clipY = (poly, y, keepAbove) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const pin = keepAbove ? p[1] >= y : p[1] <= y;
      const qin = keepAbove ? q[1] >= y : q[1] <= y;
      if (pin) out.push(p);
      if (pin !== qin) {
        const t = (y - p[1]) / (q[1] - p[1]);
        out.push([p[0] + (q[0] - p[0]) * t, y, p[2] + (q[2] - p[2]) * t]);
      }
    }
    return out;
  };
  const n = tris.length / 9;
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    const ymin = Math.min(tris[o + 1], tris[o + 4], tris[o + 7]);
    const ymax = Math.max(tris[o + 1], tris[o + 4], tris[o + 7]);
    if (ymin > hi || ymax < lo) continue;
    if (Math.max(Math.abs(tris[o]), Math.abs(tris[o + 3]), Math.abs(tris[o + 6])) > 2.2) continue;
    let poly = [[tris[o], tris[o + 1], tris[o + 2]], [tris[o + 3], tris[o + 4], tris[o + 5]], [tris[o + 6], tris[o + 7], tris[o + 8]]];
    poly = clipY(clipY(poly, lo, true), hi, false);
    if (poly.length < 2) continue;
    // the edges (a wall seen edge-on covers no area from above) ...
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const L = Math.hypot(q[0] - p[0], q[2] - p[2]);
      const m = Math.max(1, Math.ceil(L / (CS * 0.5)));
      for (let j = 0; j <= m; j++) mark(p[0] + ((q[0] - p[0]) * j) / m, p[2] + ((q[2] - p[2]) * j) / m);
    }
    // ... and the inside, for the flat tops of props
    if (poly.length >= 3) {
      let x0 = Infinity;
      let x1 = -Infinity;
      let z0 = Infinity;
      let z1 = -Infinity;
      for (const p of poly) {
        x0 = Math.min(x0, p[0]);
        x1 = Math.max(x1, p[0]);
        z0 = Math.min(z0, p[2]);
        z1 = Math.max(z1, p[2]);
      }
      for (let x = Math.floor((x0 - X0) / CS) * CS + X0 + CS / 2; x <= x1; x += CS) {
        for (let z = Math.floor((z0 - Z0) / CS) * CS + Z0 + CS / 2; z <= z1; z += CS) {
          let pos = false;
          let neg = false;
          for (let i = 0; i < poly.length; i++) {
            const p = poly[i];
            const q = poly[(i + 1) % poly.length];
            const cr = (q[0] - p[0]) * (z - p[2]) - (q[2] - p[2]) * (x - p[0]);
            if (cr > 1e-9) pos = true;
            else if (cr < -1e-9) neg = true;
          }
          if (!(pos && neg)) mark(x, z);
        }
      }
    }
  }
  // distance to the nearest taken cell: two chamfer passes
  const D = new Float32Array(NX * NZ);
  for (let i = 0; i < D.length; i++) D[i] = taken[i] ? 0 : 1e9;
  const d1 = CS;
  const d2 = CS * Math.SQRT2;
  for (let iz = 0; iz < NZ; iz++) {
    for (let ix = 0; ix < NX; ix++) {
      const i = iz * NX + ix;
      let v = D[i];
      if (ix > 0) v = Math.min(v, D[i - 1] + d1);
      if (iz > 0) {
        v = Math.min(v, D[i - NX] + d1);
        if (ix > 0) v = Math.min(v, D[i - NX - 1] + d2);
        if (ix < NX - 1) v = Math.min(v, D[i - NX + 1] + d2);
      }
      D[i] = v;
    }
  }
  for (let iz = NZ - 1; iz >= 0; iz--) {
    for (let ix = NX - 1; ix >= 0; ix--) {
      const i = iz * NX + ix;
      let v = D[i];
      if (ix < NX - 1) v = Math.min(v, D[i + 1] + d1);
      if (iz < NZ - 1) {
        v = Math.min(v, D[i + NX] + d1);
        if (ix < NX - 1) v = Math.min(v, D[i + NX + 1] + d2);
        if (ix > 0) v = Math.min(v, D[i + NX - 1] + d2);
      }
      D[i] = v;
    }
  }
  return {
    taken,
    grid: { X0, Z0, CS, NX, NZ },
    at(x, z) {
      const ix = Math.floor((x - X0) / CS);
      const iz = Math.floor((z - Z0) / CS);
      if (ix < 0 || iz < 0 || ix >= NX || iz >= NZ) return -1;
      return D[iz * NX + ix] - CS * 0.5;
    },
  };
}

// ---------------------------------------------------------------------------
// The town
// ---------------------------------------------------------------------------
export function build(scene, ctx = {}) {
  const rand = mulberry32(51013); // fixed: the town always looks the same
  const root = new THREE.Group();
  root.name = 'env-sparrow';
  scene.add(root);
  const statics = new THREE.Group();
  statics.name = 'sparrow-statics';
  root.add(statics);
  const colliders = [];
  const flutter = new Flutter();
  const anim = { boats: [], smokeSrc: [], gulls: null, crane: null, vane: null, smoke: null, visitor: null };
  const ownMaterials = [];
  const ownTextures = [];

  const lanternGlow = new THREE.MeshToonMaterial({ color: 0xffc04a, emissive: 0xffa526, emissiveIntensity: 1.1, gradientMap: gradientMap(3) });
  setOutline(lanternGlow, THIN);
  ownMaterials.push(lanternGlow);
  const winGlow = WINDOW_GLOW();
  const tex = signTexture();
  let signMat = null;
  if (tex) {
    ownTextures.push(tex);
    signMat = new THREE.MeshToonMaterial({ color: 0xffffff, map: tex, gradientMap: gradientMap(3) });
    setOutline(signMat, false);
    ownMaterials.push(signMat);
  }

  // ----- the walk (plain data, see walk.js): filled in as the town is built -----
  const WALK_INSET = 0.65; // the captain's centre keeps this far from rails and the water's edge
  const BRIDGE_HW = 0.25; // and this close to a rope bridge's middle
  // camBlockers: camera-only volumes (the walk camera keeps out of them; the captain may pass under or
  // beside them): the signs' boards up on their posts, the leaning palm trunks, the beach umbrella...
  // { x, z, w, d, ry, y0, y1 } (a box) or { x, z, r, y0, y1 } (an upright cylinder), world units.
  const walkData = { radius: 0.3, areas: [], links: [], blockers: [], camBlockers: [], places: [], spawn: null };
  const walkDecks = []; // the walkable decks, whole (for telling which townsfolk stand on them)
  const r2 = (v) => Math.round(v * 100) / 100;
  const yawOf = (obj) => {
    obj.updateWorldMatrix(true, false);
    const e = new THREE.Vector3(0, 0, 1).transformDirection(obj.matrixWorld);
    return Math.atan2(e.x, e.z);
  };
  const worldAt = (obj, lx, ly, lz) => {
    obj.updateWorldMatrix(true, false);
    return obj.localToWorld(V3(lx, ly, lz));
  };
  /** A round obstacle at (lx, lz) of obj (r, h tall). */
  function block(obj, lx, lz, r, h) {
    const p = worldAt(obj, lx, 0, lz);
    walkData.blockers.push({ x: r2(p.x), z: r2(p.z), r: r2(r), h: r2(h) });
  }
  /** A box obstacle centred at (lx, lz) of obj, w x d turned by ry in obj's frame (h tall). */
  function blockBox(obj, lx, lz, w, d, ry, h) {
    const p = worldAt(obj, lx, 0, lz);
    walkData.blockers.push({ x: r2(p.x), z: r2(p.z), w: r2(w), d: r2(d), ry: r3(yawOf(obj) + ry), h: r2(h) });
  }
  /** Camera-only: a box centred at (lx, lz) of obj, w x d turned by ry, from ly0 to ly1 up obj's frame. */
  function camBox(obj, lx, lz, w, d, ry, ly0, ly1) {
    const a = worldAt(obj, lx, ly0, lz);
    const b = worldAt(obj, lx, ly1, lz);
    walkData.camBlockers.push({ x: r2(a.x), z: r2(a.z), w: r2(w), d: r2(d), ry: r3(yawOf(obj) + ry), y0: r2(Math.min(a.y, b.y)), y1: r2(Math.max(a.y, b.y)) });
  }
  /** Camera-only: an upright cylinder of radius r at (lx, lz) of obj, from ly0 to ly1 up obj's frame. */
  function camPost(obj, lx, lz, r, ly0, ly1) {
    const a = worldAt(obj, lx, ly0, lz);
    const b = worldAt(obj, lx, ly1, lz);
    walkData.camBlockers.push({ x: r2(a.x), z: r2(a.z), r: r2(r), y0: r2(Math.min(a.y, b.y)), y1: r2(Math.max(a.y, b.y)) });
  }
  /** A walkable rect (a portal joining two decks, or a deck): world centre, size, turn, height. */
  function walkRect(id, x, z, w, d, ry, y) {
    walkData.areas.push({ id, kind: 'rect', x: r2(x), z: r2(z), w: r2(w), d: r2(d), ry: r3(ry), y: r2(y) });
  }

  // ----- platforms -----
  const plats = {};
  // Foam circles (the ocean draws a ~3 unit surf band round each rim): kept well inside
  // each raft, so the surf just licks the floats and the channels stay clear blue.
  function addColliderRect(x, z, w, d, ry, inset) {
    const long = Math.max(w, d);
    const short = Math.min(w, d);
    const r = short / 2 - inset;
    if (r < 0.3) return;
    const n = Math.max(1, Math.round((long - 2 * inset) / (2 * r)));
    const cell = (long - short) / Math.max(1, n - 1);
    const ax = w >= d ? [Math.cos(ry), -Math.sin(ry)] : [Math.sin(ry), Math.cos(ry)];
    for (let i = 0; i < n; i++) {
      const o = n === 1 ? 0 : -(long - short) / 2 + cell * i;
      colliders.push({ x: x + ax[0] * o, z: z + ax[1] * o, r });
    }
  }
  function deckSurface(g, w, d, y, o = {}, rand = o.rand) {
    // planks run across the long side, in staggered runs of 2.5-4.5
    const across = w >= d;
    const span = across ? w : d; // laid side by side along this
    const len = across ? d : w; // each plank's length
    const pw = o.pw ?? 0.5;
    const n = Math.max(1, Math.round(span / pw));
    const step = span / n;
    const tones = [COL.wood, COL.wood3, COL.plank, COL.wood, COL.wood2];
    for (let i = 0; i < n; i++) {
      const c = -span / 2 + step * (i + 0.5);
      let a = -len / 2;
      const runs = len > 5 ? Math.ceil(len / 3.6) : 1;
      const cut = (k) => (k === 0 ? -len / 2 : k === runs ? len / 2 : -len / 2 + (len * k) / runs + (i % 2 ? 0.5 : -0.5) * (len / runs) * 0.45);
      for (let k = 0; k < runs; k++) {
        const b = cut(k + 1);
        a = cut(k);
        const l = b - a - 0.04;
        const mid = (a + b) / 2;
        const tone = tones[Math.floor(rand() * tones.length)];
        // one shared plank, stretched to length (the stretched rounding just softens its ends)
        const m = add(g, rbox(0.45, 0.16, 1, 0.045), thin(tone), across ? c : mid, y - 0.08 + (rand() - 0.5) * 0.025, across ? mid : c, 0, across ? 0 : PI / 2, 0);
        m.scale.set((step - 0.05) / 0.45, 1, l);
        m.rotation.y += (rand() - 0.5) * 0.012;
      }
    }
    // a few nail heads and knots make it hand-made
    for (let k = 0; k < (w * d) / 6; k++) {
      add(g, sphere(6), flat(COL.woodDeep), (rand() - 0.5) * (w - 0.4), y + 0.005, (rand() - 0.5) * (d - 0.4), 0, 0, 0, [0.07, 0.015, 0.05]);
    }
  }
  function rails(g, w, d, y, edges, gaps = []) {
    // low rails (forearm height for leaning townsfolk); edges: 'front' (+z), 'back', 'left' (-x), 'right'
    const postM = ink(COL.woodDark);
    const railM = ink(COL.wood2);
    for (const e of edges) {
      const horiz = e === 'front' || e === 'back';
      const L = horiz ? w : d;
      const fixed = e === 'front' ? d / 2 - 0.12 : e === 'back' ? -d / 2 + 0.12 : e === 'right' ? w / 2 - 0.12 : -w / 2 + 0.12;
      const P = (s, yy) => (horiz ? V3(s, yy, fixed) : V3(fixed, yy, s));
      // runs between gaps
      const cuts = [-L / 2 + 0.1];
      for (const [g0, g1] of gaps.filter((q) => q[2] === e)) cuts.push(g0, g1);
      cuts.push(L / 2 - 0.1);
      for (let k = 0; k < cuts.length; k += 2) {
        const a = cuts[k];
        const b = cuts[k + 1];
        if (b - a < 0.4) continue;
        const n = Math.max(1, Math.round((b - a) / 1.4));
        for (let i = 0; i <= n; i++) {
          const s = a + ((b - a) * i) / n;
          const p = P(s, y + 0.36);
          add(g, rbox(0.15, 0.74, 0.15, 0.04), postM, p.x, p.y, p.z, (rand() - 0.5) * 0.06, 0, (rand() - 0.5) * 0.06);
        }
        beam(g, railM, P(a - 0.05, y + 0.6), P(b + 0.05, y + 0.6), 0.16, 0.1, 0.04);
        beam(g, thin(COL.wood2), P(a, y + 0.3), P(b, y + 0.3), 0.08, 0.07, 0.02);
      }
    }
  }
  function floats(g, w, d, y, kind) {
    const beamM = ink(COL.woodDark);
    // fascia beams round the edge
    add(g, rbox(w + 0.08, 0.3, 0.24, 0.06), beamM, 0, y - 0.3, d / 2 - 0.1);
    add(g, rbox(w + 0.08, 0.3, 0.24, 0.06), beamM, 0, y - 0.3, -d / 2 + 0.1);
    add(g, rbox(0.24, 0.3, d + 0.08, 0.06), beamM, w / 2 - 0.1, y - 0.3, 0);
    add(g, rbox(0.24, 0.3, d + 0.08, 0.06), beamM, -w / 2 + 0.1, y - 0.3, 0);
    if (kind === 'barrels') {
      const edge = (L, place) => {
        const n = Math.max(1, Math.floor(L / 1.15));
        for (let i = 0; i < n; i++) {
          const s = -L / 2 + (L / n) * (i + 0.5);
          place(s, i);
        }
      };
      const tone = (i) => (i % 3 === 1 ? COL.barrel2 : i % 5 === 2 ? 0x3f8fbf : COL.barrel);
      edge(w - 0.6, (s, i) => {
        barrel(g, s, 0.32, d / 2 - 0.45, 0.95, tone(i), true, PI / 2).position.y = 0.32 - 0.48;
        barrel(g, s, 0.32, -d / 2 + 0.45, 0.95, tone(i + 1), true, PI / 2).position.y = 0.32 - 0.48;
      });
      edge(d - 2.0, (s, i) => {
        barrel(g, w / 2 - 0.45, 0.32, s, 0.95, tone(i + 2), true, 0).position.y = 0.32 - 0.48;
        barrel(g, -w / 2 + 0.45, 0.32, s, 0.95, tone(i), true, 0).position.y = 0.32 - 0.48;
      });
      // the lashing: rope loops round the beams
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        add(g, rbox(0.28, y + 0.2, 0.28, 0.05), beamM, sx * (w / 2 - 0.1), (y - 0.2) / 2 - 0.1, sz * (d / 2 - 0.1));
      }
    } else if (kind === 'stilts') {
      const piles = [];
      const nx = Math.max(1, Math.round(w / 3));
      const nz = Math.max(1, Math.round(d / 3));
      for (let i = 0; i <= nx; i++) for (const sz of [-1, 1]) piles.push([-w / 2 + 0.15 + ((w - 0.3) * i) / nx, sz * (d / 2 - 0.15)]);
      for (let k = 1; k < nz; k++) for (const sx of [-1, 1]) piles.push([sx * (w / 2 - 0.15), -d / 2 + 0.15 + ((d - 0.3) * k) / nz]);
      for (const [px, pz] of piles) {
        add(g, cyl(0.2, 0.24, y + 2.2, 10), ink(COL.woodDark), px, (y - 2.0) / 2 - 0.05, pz);
        add(g, torus(0.24, 0.05, 12, 4), thin(COL.rope), px, 0.35, pz, PI / 2);
      }
      // X braces on the long faces
      for (let i = 0; i < nx; i++) {
        for (const sz of [-1, 1]) {
          const x0 = -w / 2 + 0.15 + ((w - 0.3) * i) / nx;
          const x1 = -w / 2 + 0.15 + ((w - 0.3) * (i + 1)) / nx;
          const zz = sz * (d / 2 - 0.15) + sz * 0.12;
          beam(g, thin(COL.woodDark), V3(x0, y - 0.45, zz), V3(x1, 0.15, zz), 0.12, 0.08, 0.03);
        }
      }
    } else if (kind === 'logs') {
      const n = Math.max(2, Math.round(w / 0.62));
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (w / n) * (i + 0.5);
        const lg = add(g, cyl(0.3, 0.3, d + 0.5, 10), ink(i % 2 ? COL.trunk : shade(COL.trunk, -0.1)), x, 0.32, 0, PI / 2);
        lg.rotation.z = (rand() - 0.5) * 0.03;
        for (const sz of [-1, 1]) add(g, cyl(0.22, 0.22, 0.04, 10), thin(COL.plank), x, 0.32, sz * (d / 2 + 0.26), PI / 2);
      }
      for (const sz of [-1, 1]) beam(g, thin(COL.rope), V3(-w / 2, 0.6, sz * (d / 2 - 0.3)), V3(w / 2, 0.6, sz * (d / 2 - 0.3)), 0.1, 0.1, 0.04);
    }
  }
  function platform(name, P) {
    const g = new THREE.Group();
    g.position.set(P.x, 0, P.z);
    g.rotation.y = P.ry || 0;
    statics.add(g);
    const y = P.y ?? DECK;
    // (each deck's planks from its own random stream, so resizing one platform leaves the rest as they were)
    let seed = 7;
    for (const ch of name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    deckSurface(g, P.w, P.d, y, P, mulberry32(seed));
    floats(g, P.w, P.d, y, P.float || 'barrels');
    if (P.rails) rails(g, P.w, P.d, y, P.rails, P.gaps || []);
    if (P.foam !== false) addColliderRect(P.x, P.z, P.w, P.d, P.ry || 0, (P.float || 'barrels') === 'stilts' ? 2.3 : 1.7);
    // a walkable deck: the captain's centre keeps WALK_INSET from every edge (rails or water)
    if (P.walk) {
      walkRect(name, P.x, P.z, P.w - 2 * WALK_INSET, P.d - 2 * WALK_INSET, P.ry || 0, y);
      walkDecks.push({ x: P.x, z: P.z, hw: P.w / 2, hd: P.d / 2, c: Math.cos(P.ry || 0), s: Math.sin(P.ry || 0), y });
    }
    const out = { ...P, y, g };
    out.at = (lx, lz, dy = 0) => {
      g.updateMatrixWorld(true);
      return g.localToWorld(V3(lx, y + dy, lz));
    };
    plats[name] = out;
    return out;
  }
  function bridge(a, b, o = {}) {
    // rope bridge between two deck points; returns the walk path
    const sag = o.sag ?? Math.min(0.9, a.distanceTo(b) * 0.09);
    const dir = V3().subVectors(b, a);
    const len = dir.length();
    const side = V3(-dir.z, 0, dir.x).normalize();
    const walk = sagCurve(a, b, sag, Math.max(6, Math.round(len / 0.5)));
    const g = statics;
    const n = Math.max(3, Math.round(len / 0.38));
    const curve = new THREE.CatmullRomCurve3(walk);
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const p = curve.getPointAt(u);
      const t = curve.getTangentAt(u);
      const m = add(g, rbox(1.05, 0.08, 0.26, 0.03), thin(i % 3 ? COL.wood3 : COL.plank), p.x, p.y - 0.05, p.z);
      orient(m, t);
      m.rotateZ((rand() - 0.5) * 0.06);
    }
    const hw = 0.55;
    for (const s of [-1, 1]) {
      const off = side.clone().multiplyScalar(s * hw);
      const handA = a.clone().add(off).add(V3(0, 0.75, 0));
      const handB = b.clone().add(off).add(V3(0, 0.75, 0));
      const hand = sagCurve(handA, handB, sag * 0.8, 14);
      rope(g, thin(COL.rope), hand, 0.04, 5);
      // foot ropes
      rope(g, thin(COL.rope), walk.map((p) => p.clone().add(off).add(V3(0, -0.06, 0))), 0.035, 4);
      // posts
      for (const e of [a, b]) {
        const pp = e.clone().add(off);
        add(g, cyl(0.09, 0.11, 1.1, 8), ink(COL.woodDark), pp.x, pp.y + 0.45, pp.z);
        add(g, sphere(8), ink(COL.woodDark), pp.x, pp.y + 1.02, pp.z, 0, 0, 0, 0.12);
      }
      // suspenders
      const m = Math.max(2, Math.round(len / 0.8));
      const hc = new THREE.CatmullRomCurve3(hand);
      for (let i = 1; i < m; i++) {
        const u = i / m;
        const top = hc.getPointAt(u);
        const bot = curve.getPointAt(u).add(off);
        rod(g, thin(COL.rope), top, bot, 0.02, 4);
      }
    }
    if (o.walk) {
      // a walkable bridge: its walk curve, run on 0.9 into both decks so it overlaps their walk areas;
      // the posts at the ends are obstacles exactly as wide as the band leaves room for (the hand ropes keep
      // the walker on the planks): wider, they would make a lip at the band's edge that stops a walker
      // sliding along a rope dead at the post
      const run = V3(dir.x, 0, dir.z).normalize().multiplyScalar(0.9);
      const pts = [a.clone().sub(run), ...walk, b.clone().add(run)];
      walkData.links.push({ id: o.walk, pts: pts.map((p) => [r2(p.x), r2(p.y), r2(p.z)]), hw: BRIDGE_HW });
      const postR = Math.max(0, r2(hw - BRIDGE_HW - walkData.radius));
      for (const e of [a, b]) {
        for (const s of [-1, 1]) {
          const pp = e.clone().addScaledVector(side, s * hw);
          walkData.blockers.push({ x: r2(pp.x), z: r2(pp.z), r: postR, h: 1.1 });
        }
      }
    }
    return walk;
  }

  // The berth: a long pier on piles
  const pier = platform('pier', { x: 0, z: -4.4, w: 22, d: 2.6, float: 'stilts', foam: false, rails: ['back'], gaps: [[-1.5, 2.5, 'back'], [-7.8, -5.4, 'back']], walk: true });
  // The market plaza on barrels
  const plaza = platform('plaza', { x: 0, z: -10.25, w: 17, d: 9.1, float: 'barrels', foam: false, rails: ['left'], gaps: [[0.7, 2.7, 'left']], walk: true });
  // The tavern raft
  // (wide enough for a walkway past the tavern's west wall to the tower bridge at the back)
  const tavernRaft = platform('tavern', { x: -6.85, z: -19.6, w: 11.8, d: 9, float: 'barrels', rails: ['right'], walk: true });
  // Lookout tower raft (logs)
  // (room to walk round the tower's legs)
  const towerRaft = platform('tower', { x: -18.2, z: -25.4, w: 7, d: 7, float: 'logs', ry: 0.15, walk: true });
  // The shipyard
  const yard = platform('yard', { x: 16.2, z: -11.5, w: 8.4, d: 9, float: 'stilts', rails: ['back'], walk: true });
  // Stilt shack platforms (platform() registers each one in plats)
  platform('s1', { x: 5.2, z: -21.1, w: 7, d: 5.8, float: 'stilts', ry: -0.06, walk: true }); // Polly's Plumes & Trims
  platform('s2', { x: 13.4, z: -23.2, w: 5.4, d: 5, float: 'stilts', ry: 0.12 });
  platform('s3', { x: -0.5, z: -29.5, w: 6, d: 5.4, float: 'stilts', ry: 0.05, y: 1.6 });
  platform('s4', { x: -7.6, z: -33.6, w: 5.6, d: 5, float: 'stilts', ry: -0.1, y: 1.5 });
  platform('s5', { x: 9.2, z: -31.5, w: 6.4, d: 5.2, float: 'stilts', ry: -0.05, y: 1.8 });
  platform('s6', { x: -26.0, z: -26.0, w: 5.6, d: 5.2, float: 'stilts', ry: 0.3 });
  platform('s7', { x: 21.5, z: -22.5, w: 5.4, d: 5, float: 'stilts', ry: -0.25 });
  platform('s8', { x: -24, z: -9, w: 5.4, d: 5, float: 'logs', ry: 0.45 });
  platform('s9', { x: 25, z: -6, w: 5, d: 5, float: 'stilts', ry: -0.5 });
  platform('s10', { x: -17.5, z: -38, w: 6, d: 5.5, float: 'stilts', ry: 0.1, y: 1.6 });
  platform('s11', { x: 18, z: -36, w: 6, d: 5.5, float: 'stilts', ry: -0.2, y: 1.6 });
  platform('s12', { x: 2, z: -40, w: 7, d: 5.5, float: 'stilts', ry: 0, y: 1.6 });
  // the west arm, out towards the open sea
  platform('s13', { x: -21.5, z: 2.0, w: 5.4, d: 5, float: 'logs', ry: 0.55 });
  platform('s14', { x: -29, z: -4.5, w: 5.2, d: 5, float: 'stilts', ry: 0.25 });
  platform('s15', { x: -31, z: -16, w: 5.6, d: 5.2, float: 'stilts', ry: 0.1 });
  platform('s16', { x: -17.6, z: -17.4, w: 5.4, d: 5, float: 'barrels', ry: -0.08 });
  // the east arm, behind the shipyard
  platform('s17', { x: 29.5, z: -25, w: 6, d: 5.4, float: 'stilts', ry: -0.35, y: 1.6 });
  platform('s18', { x: 35, z: -12.5, w: 5.2, d: 5, float: 'logs', ry: -0.7 });
  // the plaza and the tavern raft lie side by side: the walk crosses the seam between them
  {
    const x0 = Math.max(plaza.x - plaza.w / 2, tavernRaft.x - tavernRaft.w / 2) + WALK_INSET;
    const x1 = Math.min(plaza.x + plaza.w / 2, tavernRaft.x + tavernRaft.w / 2) - WALK_INSET;
    const zA = plaza.z - plaza.d / 2 + WALK_INSET + 0.1;
    const zB = tavernRaft.z + tavernRaft.d / 2 - WALK_INSET - 0.1;
    walkRect('plaza-tavern', (x0 + x1) / 2, (zA + zB) / 2, x1 - x0, zA - zB, 0, DECK);
    // ...over a few long boards laid across the seam (else a strip of open water runs under the walkway)
    const sa = Math.max(plaza.x - plaza.w / 2, tavernRaft.x - tavernRaft.w / 2) + 0.06;
    const sb = Math.min(plaza.x + plaza.w / 2, tavernRaft.x + tavernRaft.w / 2) - 0.06;
    const zEdge = plaza.z - plaza.d / 2;
    const gap = zEdge - (tavernRaft.z + tavernRaft.d / 2);
    const n = Math.max(1, Math.round((sb - sa) / 2.6));
    const L = (sb - sa) / n;
    for (let i = 0; i < n; i++) {
      const board = rbox(L - 0.05, 0.1, gap + 0.34, 0.035);
      const m = add(statics, board, thin(i % 2 ? COL.wood3 : COL.plank), sa + L * (i + 0.5), plaza.y - 0.035, zEdge - gap / 2);
      m.rotation.y = (i % 2 ? 1 : -1) * 0.006;
    }
  }

  // ----- sandy floating garden -----
  const GARDEN = { x: -14.4, z: -7.6, r: 3.7, y: 1.45 };
  {
    const g = new THREE.Group();
    g.position.set(GARDEN.x, 0, GARDEN.z);
    statics.add(g);
    const R = GARDEN.r;
    // log ring at the waterline
    const nL = 22;
    for (let i = 0; i < nL; i++) {
      const a = (i / nL) * TAU;
      const lg = add(g, cyl(0.28, 0.28, (TAU * R) / nL + 0.15, 10), ink(i % 2 ? COL.trunk : shade(COL.trunk, -0.12)), Math.cos(a) * R, 0.35, Math.sin(a) * R);
      lg.rotation.set(PI / 2, 0, 0);
      lg.rotation.order = 'YXZ';
      lg.rotation.y = -a;
    }
    add(g, torus(R, 0.1, 40, 5), thin(COL.rope), 0, 0.62, 0, PI / 2);
    add(g, lathe('gardenSand', [[0, GARDEN.y + 0.15], [R * 0.55, GARDEN.y + 0.08], [R * 0.85, GARDEN.y - 0.1], [R - 0.05, 0.75], [R - 0.2, 0.2], [0, 0.2]], 28), ink(COL.sand), 0, 0, 0);
    // grass tufts, flowers, a rock and a little sandcastle
    for (let i = 0; i < 9; i++) {
      const a = rand() * TAU;
      const r = 0.8 + rand() * (R - 1.8);
      add(g, sphere(10), ink(i % 2 ? COL.grass : COL.bush), Math.cos(a) * r, GARDEN.y - 0.05, Math.sin(a) * r, 0, 0, 0, [0.5 + rand() * 0.3, 0.3, 0.45 + rand() * 0.3]);
    }
    for (let i = 0; i < 10; i++) {
      const a = rand() * TAU;
      const r = 1.2 + rand() * (R - 2.0);
      const fx = Math.cos(a) * r;
      const fz = Math.sin(a) * r;
      rod(g, thin(COL.leaf2), V3(fx, GARDEN.y - 0.05, fz), V3(fx, GARDEN.y + 0.32, fz), 0.025, 4);
      add(g, sphere(8), ink([COL.pink, COL.yellow, COL.red, COL.white][i % 4]), fx, GARDEN.y + 0.36, fz, 0, 0, 0, 0.11);
    }
    add(g, sphere(9), ink(COL.stone), 2.1, GARDEN.y - 0.15, 1.2, 0.3, 0.4, 0, [0.55, 0.38, 0.45]);
    const palms = [palm(g, -0.6, GARDEN.y, -0.5, 1.0, -0.5, -0.6, rand), palm(g, 1.0, GARDEN.y, -0.9, 0.82, 0.7, -0.3, rand)];
    // a beach umbrella over a driftwood bench
    // (the shade is up high enough for a captain in a tall hat to walk under its rim)
    const UMB = 0.4;
    rod(g, thin(COL.woodDark), V3(1.5, GARDEN.y - 0.1, 1.3), V3(1.45, GARDEN.y + 2.0 + UMB, 1.35), 0.04);
    // a driftwood bench under the umbrella (seat at SEAT_HEIGHT above the sand)
    add(g, cyl(0.17, 0.17, 1.5, 10), ink(COL.trunk), 1.5, GARDEN.y + 0.06, 2.1, 0, 0, PI / 2);
    for (const sx of [-0.55, 0.55]) add(g, rbox(0.2, 0.3, 0.3, 0.05), ink(COL.woodDark), 1.5 + sx, GARDEN.y - 0.15, 2.1);
    for (let i = 0; i < 8; i++) {
      const geo = cached(`umbrella${i}`, () => new THREE.ConeGeometry(1.25, 0.5, 4, 1, false, (i / 8) * TAU, TAU / 8));
      add(g, geo, ink(i % 2 ? COL.red : COL.white), 1.45, GARDEN.y + 2.1 + UMB, 1.35, 0.05, 0, -0.1);
    }
    add(g, sphere(8), ink(COL.red), 1.42, GARDEN.y + 2.38 + UMB, 1.36, 0, 0, 0, 0.08);
    colliders.push({ x: GARDEN.x - 0.8, z: GARDEN.z - 0.6, r: 1.0 });
    // the walk: the sand mound (its height follows the sand's profile), round the palms, the rock,
    // the bench and the shade's pole
    walkData.areas.push({ id: 'garden', kind: 'circle', x: GARDEN.x, z: GARDEN.z, r: 2.9, y: GARDEN.y, profile: [[0, r2(GARDEN.y + 0.15)], [r2(R * 0.55), r2(GARDEN.y + 0.08)], [r2(R * 0.85), r2(GARDEN.y - 0.1)]] });
    block(g, -0.6, -0.5, 0.42, 5);
    block(g, 1.0, -0.9, 0.36, 4);
    block(g, 2.1, 1.2, 0.5, 0.4);
    blockBox(g, 1.5, 2.1, 1.6, 0.42, 0, 0.4);
    block(g, 1.5, 1.3, 0.08, 2.4);
    // the camera keeps off the leaning palm trunks (a short upright cylinder round each stretch of the
    // trunk), their crowns of fronds and the umbrella's shade (the captain walks under the shade)
    for (const { pts, s } of palms) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const r = 0.36 * s * (1 - (0.38 * i) / pts.length) + Math.hypot(b.x - a.x, b.z - a.z) / 2;
        camPost(g, (a.x + b.x) / 2, (a.z + b.z) / 2, r, a.y, b.y);
      }
      const top = pts[pts.length - 1];
      camPost(g, top.x, top.z, 2.6 * s, top.y - 0.7 * s, top.y + 0.5 * s);
    }
    camPost(g, 1.45, 1.35, 1.3, GARDEN.y + 2.1 + UMB - 0.3, GARDEN.y + 2.1 + UMB + 0.4);
  }

  // ----- the pier: bollards, fenders, lamp posts -----
  {
    const g = pier.g;
    for (const x of [-9.2, -4.2, 4.2, 9.2]) bollard(g, x, DECK, 0.95);
    // rope fenders hanging over the berth side
    for (const x of [-6.5, -2, 2.5, 6.8]) {
      const f = add(g, capsule(0.22, 0.55, 8), ink(COL.rope), x, 0.75, 1.42);
      f.rotation.z = 0;
      rope(g, thin(COL.rope), [V3(x, DECK + 0.02, 1.2), V3(x, DECK - 0.05, 1.42), V3(x, 1.1, 1.45)], 0.03, 4);
    }
    for (const x of [-10.4, -5.0, 5.8, 10.4]) lampPost(g, x, DECK, -0.95, 0, lanternGlow);
    // coils of rope, a crate stack and barrels at the ends
    for (const [x, z] of [[-7.8, -0.6], [7.6, 0.5]]) {
      add(g, torus(0.3, 0.1, 16, 6), ink(COL.rope), x, DECK + 0.1, z, PI / 2);
      add(g, torus(0.2, 0.09, 14, 6), ink(COL.rope), x, DECK + 0.25, z, PI / 2);
    }
    // life rings on the rail posts and lobster pots at the ends
    for (const x of [-8.4, 7.0]) {
      const lr = new THREE.Group();
      lr.position.set(x, DECK + 0.45, -1.05);
      g.add(lr);
      for (let i = 0; i < 8; i++) add(lr, torus(0.32, 0.1, 6, 6, TAU / 8), ink(i % 2 ? COL.red : COL.white), 0, 0, 0, 0, 0, (i * TAU) / 8);
      add(lr, torus(0.32, 0.03, 18, 4), thin(COL.rope), 0, 0, 0.09);
    }
    for (const [x, z, k] of [[-10.6, 0.6, 0], [-10.0, 0.75, 1], [-10.3, 0.65, 2]]) {
      const pot = new THREE.Group();
      pot.position.set(x, DECK + (k === 2 ? 0.52 : 0), z);
      pot.rotation.y = k * 0.7;
      g.add(pot);
      add(pot, cyl(0.28, 0.32, 0.5, 10, true), thin(COL.woodDark), 0, 0.26, 0);
      for (const yy of [0.04, 0.26, 0.48]) add(pot, torus(0.3, 0.035, 12, 4), thin(COL.wood3), 0, yy, 0, PI / 2);
      add(pot, cyl(0.27, 0.27, 0.04, 10), thin(COL.net), 0, 0.03, 0);
      add(pot, sphere(8), ink(COL.cork), 0.2, 0.52, 0.18, 0, 0, 0, [0.1, 0.07, 0.1]);
    }
    crate(g, 10.1, DECK, -0.4, 0.9, 0.3);
    crate(g, 10.3, DECK + 0.72, -0.35, 0.7, 0.9, COL.wood);
    barrel(g, 8.6, DECK, -0.7, 0.85, COL.barrel2);
    barrel(g, -10.2, DECK, -0.2, 0.85);
    barrel(g, -9.4, DECK, -0.75, 0.8, COL.barrel2);
    // perched gull on a pile
    // the walk: bollards, lamp posts, coils, pots, crates and barrels; the gangplank's foot
    for (const x of [-9.2, -4.2, 4.2, 9.2]) block(g, x, 0.95, 0.22, 0.6);
    for (const x of [-10.4, -5.0, 5.8, 10.4]) block(g, x, -0.95, 0.17, 2.6);
    block(g, -7.8, -0.6, 0.4, 0.3);
    block(g, 7.6, 0.5, 0.4, 0.3);
    blockBox(g, -10.3, 0.67, 1.3, 0.7, 0, 1.0);
    block(g, 10.15, -0.4, 0.55, 1.4);
    block(g, 8.6, -0.7, 0.42, 0.9);
    block(g, -10.2, -0.2, 0.42, 0.9);
    block(g, -9.4, -0.75, 0.4, 0.9);
    blockBox(g, 0.6, 1.15, 0.95, 0.5, 0, 0.7);
    // the ways from the pier onto the plaza: the two gaps in its back rail (posts 0.15 thick)
    for (const [g0, g1] of pier.gaps) {
      const x0 = g0 + 0.075 + walkData.radius;
      const x1 = g1 - 0.075 - walkData.radius;
      walkRect(`pier-plaza-${g0 < 0 && g1 > 0 ? 1 : 2}`, (x0 + x1) / 2, pier.z - pier.d / 2, x1 - x0, 2 * WALK_INSET + 0.2, 0, DECK);
    }
  }

  // ----- the plaza: market stalls, the welcome sign, the well -----
  const STALLS = [
    { x: -3.2, c: [COL.red, COL.white], goods: 'fruit' },
    { x: 0.6, c: [COL.blue, COL.white], goods: 'fish' },
    { x: 4.4, c: [COL.yellow, COL.teal], goods: 'pots' },
  ];
  const STALL_Z = -12.4;
  for (const st of STALLS) {
    const g = new THREE.Group();
    g.position.set(st.x, DECK, STALL_Z);
    statics.add(g);
    // counter
    add(g, rbox(2.5, 0.62, 0.8, 0.08), ink(COL.wood2), 0, 0.31, 0.35);
    for (const sx of [-1, 1]) add(g, rbox(0.14, 0.14, 0.82, 0.03), thin(COL.woodDark), sx * 0.9, 0.5, 0.36, 0, 0, 0);
    add(g, rbox(2.62, 0.1, 0.92, 0.04), ink(COL.plank), 0, 0.66, 0.35);
    // posts and awning
    for (const sx of [-1, 1]) {
      add(g, cyl(0.07, 0.08, 2.3, 8), ink(COL.woodDark), sx * 1.2, 1.15, 0.75);
      add(g, cyl(0.07, 0.08, 2.6, 8), ink(COL.woodDark), sx * 1.2, 1.3, -0.45);
    }
    const nS = 6;
    const aw = 2.7 / nS;
    for (let i = 0; i < nS; i++) {
      const x = -1.35 + aw * (i + 0.5);
      const m = add(g, rbox(aw + 0.01, 0.06, 1.6, 0.02), ink(st.c[i % 2]), x, 2.42, 0.25, 0.28);
      m.userData.n = i;
      // scalloped valance
      add(g, cached('scallop', () => {
        const sh = new THREE.Shape();
        sh.moveTo(-aw / 2, 0);
        sh.absarc(0, 0, aw / 2, PI, TAU, false);
        sh.lineTo(-aw / 2, 0);
        return slabShape(sh, 0.05, 0.01);
      }), ink(st.c[i % 2]), x, 2.2, 1.03);
    }
    // goods
    if (st.goods === 'fruit') {
      for (let i = 0; i < 14; i++) {
        const c = [COL.apple, COL.banana, COL.orange, COL.melon][i % 4];
        add(g, sphere(10), ink(c), -0.9 + (i % 7) * 0.3, 0.83 + (i > 6 ? 0.14 : 0), 0.2 + (i > 6 ? 0.1 : 0.4), 0, 0, 0, c === COL.melon ? [0.2, 0.17, 0.17] : 0.13);
      }
      crate(g, 1.6, 0, 1.1, 0.6, 0.3);
      for (let i = 0; i < 4; i++) add(g, sphere(10), ink(COL.pumpkin), 1.5 + (i % 2) * 0.22, 0.5 + Math.floor(i / 2) * 0.1, 1.05 + (i % 2) * 0.1, 0, 0, 0, [0.16, 0.13, 0.16]);
    } else if (st.goods === 'fish') {
      for (let i = 0; i < 6; i++) {
        const f = new THREE.Group();
        f.position.set(-0.9 + i * 0.36, 0.78, 0.35 + (i % 2) * 0.1);
        f.rotation.y = PI / 2 + (rand() - 0.5) * 0.5;
        g.add(f);
        add(f, sphere(10), ink(i % 2 ? COL.fish : COL.fishDark), 0, 0, 0, 0, 0, 0, [0.12, 0.09, 0.3]);
        add(f, cached('fishTail', () => new THREE.ConeGeometry(0.11, 0.16, 6).rotateX(-PI / 2)), ink(i % 2 ? COL.fish : COL.fishDark), 0, 0, -0.33, 0, 0, 0, [1, 0.35, 1]);
        add(f, sphere(6), flat(COL.black), 0.07, 0.03, 0.2, 0, 0, 0, 0.025);
      }
      // hanging fish under the awning
      for (let i = 0; i < 3; i++) {
        const fx = -0.8 + i * 0.8;
        rod(g, thin(COL.rope), V3(fx, 2.25, 0.85), V3(fx, 1.75, 0.85), 0.015, 4);
        add(g, sphere(10), ink(COL.fish), fx, 1.55, 0.85, 0, 0, 0, [0.1, 0.25, 0.08]);
      }
      barrel(g, 1.65, 0, 1.0, 0.7, 0x3f8fbf);
    } else {
      for (let i = 0; i < 5; i++) {
        const c = [COL.orange, COL.teal, COL.pink, COL.blue, COL.yellow][i];
        add(g, lathe('pot', [[0, 0], [0.12, 0], [0.17, 0.1], [0.15, 0.22], [0.09, 0.28], [0.1, 0.32], [0, 0.32]], 12), ink(c), -0.95 + i * 0.45, 0.7, 0.35);
      }
      for (let i = 0; i < 3; i++) add(g, cyl(0.06, 0.06, 0.12, 10), ink(COL.brass), -0.7 + i * 0.6, 0.77, 0.7);
      sack(g, 1.6, 0, 1.0, 1.1);
      sack(g, 1.9, 0, 0.7, 0.9, 0xd8bf88);
    }
    // the walk: the counter, its posts and awning; the goods stacked in front
    blockBox(g, 0, 0.15, 2.65, 1.42, 0, 2.6);
    // the camera keeps off the awning (and a little out in front of it): walking past a stall it cranes up
    // over the stripes instead of skimming them (the slab would fill a quarter of the view)
    camBox(g, 0, 0.45, 3.0, 2.4, 0, 2.0, 2.9);
    if (st.goods === 'fruit') block(g, 1.6, 1.1, 0.42, 0.9);
    else if (st.goods === 'fish') block(g, 1.65, 1.0, 0.36, 0.7);
    else {
      block(g, 1.6, 1.0, 0.4, 0.6);
      block(g, 1.9, 0.7, 0.33, 0.5);
    }
  }
  let welcomePost = null;
  {
    // a signpost to the tailor behind the pots stall: an arrow board pointing along the bridge to
    // Polly's shop, a display head in a plumed hat on top and a straw hat on a peg
    const g = new THREE.Group();
    g.position.set(4.2, DECK, -13.7);
    g.rotation.y = -0.05;
    statics.add(g);
    // (the board stands above the stall's awning, so the shipyard camera can read it)
    add(g, cyl(0.08, 0.1, 3.5, 8), ink(COL.woodDark), 0, 1.75, 0);
    add(g, rbox(0.36, 0.12, 0.36, 0.04), ink(COL.woodDark), 0, 0.06, 0);
    add(g, slabShape(arrowShape(2.1, 0.66), 0.1, 0.02), ink(COL.woodDeep), 0.86, 3.02, 0);
    if (signMat) {
      add(g, arrowPlane(2.1, 0.66), signMat, 0.86, 3.02, 0.075);
      add(g, arrowPlane(2.1, 0.66, true), signMat, 0.86, 3.02, -0.075);
    }
    const hd = new THREE.Group();
    hd.position.set(0, 3.29, 0);
    g.add(hd);
    add(hd, cyl(0.04, 0.05, 0.3, 6), ink(COL.wood2), 0, 0.2, 0);
    add(hd, sphere(8), ink(COL.wood3), 0, 0.5, 0, 0, 0, 0, [0.17, 0.2, 0.17]);
    hatModel(hd, 'plumed', 0.66);
    rod(g, ink(COL.woodDark), V3(0, 2.05, 0), V3(-0.42, 2.12, 0.04), 0.035, 6);
    const st = new THREE.Group();
    st.position.set(-0.5, 1.72, 0.06);
    st.rotation.set(0.15, 0, 0.5);
    g.add(st);
    hatModel(st, 'straw', 0.66);
    block(g, 0, 0, 0.16, 3.6);
    // the camera keeps off the arrow board, the display head in its hat on top and the post
    camBox(g, 0.86, 0, 2.25, 0.3, 0, 2.62, 3.42);
    camPost(g, 0, 0, 0.36, 3.3, 4.25);
    camPost(g, 0, 0, 0.12, 0, 3.3);
  }
  {
    // the welcome sign: a big painted board on two tall posts, the pirate sparrow on top (high
    // enough to show over the docked ship's rigging and sails from most of the showcase camera's sway)
    const g = new THREE.Group();
    g.position.set(SIGN.x, DECK, SIGN.z);
    g.rotation.y = SIGN.ry;
    statics.add(g);
    const up = SIGN_LIFT;
    for (const sx of [-1, 1]) {
      add(g, cyl(0.16, 0.2, 4.6 + up, 10), ink(COL.woodDark), sx * 2.85, (4.6 + up) / 2, 0);
      add(g, sphere(10), ink(COL.brass), sx * 2.85, 4.7 + up, 0, 0, 0, 0, 0.22);
      add(g, rbox(0.6, 0.18, 0.6, 0.05), ink(COL.woodDark), sx * 2.85, 0.09, 0);
    }
    add(g, rbox(6.2, 2.05, 0.22, 0.12, 2), ink(COL.woodDark), 0, 3.1 + up, 0);
    if (signMat) add(g, signPlane(tex, 'welcome', 6.0, 1.99), signMat, 0, 3.1 + up, 0.115);
    else add(g, rbox(5.8, 1.8, 0.1, 0.05), ink(COL.cream), 0, 3.1 + up, 0.08);
    // little ropes and a lantern on each post
    for (const sx of [-1, 1]) {
      beam(g, ink(COL.woodDark), V3(sx * 2.85, 4.25 + up, 0), V3(sx * 3.4, 4.25 + up, 0.1), 0.1, 0.1, 0.03);
      lantern(g, sx * 3.38, 3.85 + up, 0.1, lanternGlow, 0.9);
    }
    welcomePost = worldAt(g, 2.85, 4.5 - 1.4 + up, 0.05); // (the bunting over the plaza hangs from here)
    root.userData.welcomeFace = [];
    for (let j = 0; j < 5; j++) for (let i = 0; i < 11; i++) root.userData.welcomeFace.push(worldAt(g, -2.75 + i * 0.55, 3.1 + up + 0.8 - j * 0.4, 0.14).toArray());
    const bird = sparrowBird(g, 1.15);
    bird.position.set(0.4, 4.12 + up, 0.02);
    bird.rotation.y = 0.15;
    // the bird stands on a little perch block
    add(g, rbox(1.0, 0.14, 0.42, 0.05), ink(COL.woodDark), 0.4, 4.12 + up, 0);
    // its back (seen from the town): plank seams, two battens and a Z brace, nailed on
    {
      const bz = -0.12;
      const back = thin(shade(COL.woodDark, -0.18));
      for (const yy of [-0.5, 0, 0.5]) add(g, box(5.9, 0.04, 0.03), back, 0, 3.1 + up + yy, bz);
      for (const sx of [-1, 1]) add(g, rbox(0.24, 1.9, 0.08, 0.03), ink(COL.wood2), sx * 1.9, 3.1 + up, bz - 0.03);
      const zb = add(g, rbox(3.9, 0.22, 0.08, 0.03), ink(COL.wood2), 0, 3.1 + up, bz - 0.03);
      zb.rotation.z = -0.42;
      for (const sx of [-1, 1]) for (const yy of [-0.75, 0.75]) add(g, sphere(6), flat(COL.iron), sx * 1.9, 3.1 + up + yy, bz - 0.08, 0, 0, 0, 0.035);
    }
    for (const sx of [-1, 1]) block(g, sx * 2.85, 0, 0.32, 6 + up);
    // the camera keeps off the board (and the lanterns at its ends), the bird on its perch and the posts
    camBox(g, 0, -0.03, 7.0, 0.45, 0, 3.1 + up - 1.12, 3.1 + up + 1.12);
    camBox(g, 0.4, 0, 1.3, 0.6, 0, 4.1 + up, 4.1 + up + 1.45);
    for (const sx of [-1, 1]) camPost(g, sx * 2.85, 0, 0.22, 0, 4.9 + up);
  }
  {
    // a water barrel tower and a pile of crates on the plaza
    const g = plaza.g;
    barrel(g, 5.9, DECK, 2.5, 1.0, COL.barrel);
    barrel(g, 5.2, DECK, 2.85, 0.85, 0x3f8fbf);
    barrel(g, 5.55, DECK + 1.0, 2.65, 0.8, COL.barrel2);
    crate(g, -7.5, DECK, -0.6, 1.0, 0.2);
    crate(g, -7.4, DECK + 0.8, -0.55, 0.75, -0.3, COL.wood);
    crate(g, -7.4, DECK, 0.4, 0.8, -0.1);
    sack(g, -6.7, DECK, 0.9, 1.0);
    // benches for listeners (seat height = SEAT_HEIGHT)
    // (the west one stands clear of the way onto the garden bridge)
    for (const [bx, bz, br] of [[-7.5, 3.2, PI / 2], [6.8, -1.6, -PI / 2]]) {
      const b = new THREE.Group();
      b.position.set(bx, DECK, bz);
      b.rotation.y = br;
      b.userData.bench = true;
      g.add(b);
      add(b, rbox(1.6, 0.08, 0.4, 0.03), ink(COL.wood3), 0, 0.27, 0);
      for (const sx of [-1, 1]) add(b, rbox(0.1, 0.26, 0.34, 0.03), ink(COL.woodDark), sx * 0.65, 0.13, 0);
    }
    for (const [x, z] of [[-8.0, 4.2], [8.0, 4.2], [-8.0, -4.2], [8.0, -4.2]]) lampPost(g, x, DECK, z, x > 0 ? -PI / 2 : PI / 2, lanternGlow);
    // the walk
    block(g, 5.9, 2.5, 0.5, 2.0);
    block(g, 5.2, 2.85, 0.42, 1.0);
    block(g, -7.5, -0.6, 0.57, 1.4);
    block(g, -7.4, 0.4, 0.46, 0.65);
    block(g, -6.7, 0.9, 0.35, 0.6);
    for (const b of g.children.filter((c) => c.userData.bench)) blockBox(b, 0, 0, 1.6, 0.42, 0, 0.35);
    for (const [x, z] of [[-8.0, 4.2], [8.0, 4.2], [-8.0, -4.2], [8.0, -4.2]]) block(g, x, z, 0.17, 2.6);
  }

  // ----- The Salty Sparrow tavern -----
  let tavernG = null;
  {
    const g = new THREE.Group();
    g.position.set(-6.4, DECK, -21.0);
    g.rotation.y = 0.04;
    statics.add(g);
    const W = 8.4;
    const D = 5.4;
    const H1 = 3.1; // ground floor
    const H2 = 2.5; // upper floor
    const woodWall = 0xd79a5a;
    add(g, rbox(W, H1, D, 0.12, 2), ink(woodWall), 0, H1 / 2, 0);
    for (let x = -W / 2 + 0.5; x < W / 2 - 0.3; x += 0.62) add(g, box(0.08, H1 - 0.15, 0.06), thin(shade(woodWall, -0.22)), x, H1 / 2, D / 2 + 0.02);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, rbox(0.32, H1 + H2 + 0.3, 0.32, 0.06), ink(COL.woodDeep), sx * W / 2, (H1 + H2) / 2, sz * D / 2);
    // the sides and the back are finished too (the town is walked round): battens, lit windows with
    // shutters, a back door with a step and a lantern
    {
      const bat = thin(shade(woodWall, -0.22));
      for (let x = -W / 2 + 0.5; x < W / 2 - 0.3; x += 0.62) add(g, box(0.08, H1 - 0.15, 0.06), bat, x, H1 / 2, -D / 2 - 0.02);
      for (const sx of [-1, 1]) for (let z = -D / 2 + 0.45; z < D / 2 - 0.3; z += 0.62) add(g, box(0.06, H1 - 0.15, 0.08), bat, sx * (W / 2 + 0.02), H1 / 2, z);
      const win = (x, z, ry) => {
        const w = new THREE.Group();
        w.position.set(x, 1.6, z);
        w.rotation.y = ry;
        g.add(w);
        add(w, rbox(1.1, 1.05, 0.1, 0.04), ink(COL.woodDeep), 0, 0, 0.02);
        add(w, rbox(0.88, 0.84, 0.1, 0.03), winGlow, 0, 0, 0.05);
        add(w, rbox(0.06, 0.86, 0.12, 0.02), thin(COL.woodDeep), 0, 0, 0.08);
        add(w, rbox(0.88, 0.06, 0.12, 0.02), thin(COL.woodDeep), 0, 0, 0.08);
        for (const s2 of [-1, 1]) {
          const sh = add(w, rbox(0.42, 0.95, 0.06, 0.03), ink(COL.teal), s2 * 0.76, 0, 0.16);
          sh.rotation.y = s2 * 0.35;
        }
        add(w, rbox(1.0, 0.18, 0.24, 0.04), ink(COL.wood2), 0, -0.6, 0.14);
      };
      for (const sx of [-1, 1]) win(sx * (W / 2 + 0.04), 0.2, sx * PI / 2);
      win(-2.4, -D / 2 - 0.04, PI);
      win(2.6, -D / 2 - 0.04, PI);
      // the back door
      add(g, rbox(1.2, 2.2, 0.1, 0.05), ink(COL.woodDeep), 0.1, 1.1, -D / 2 - 0.04);
      add(g, rbox(0.95, 2.0, 0.12, 0.05), ink(COL.door), 0.1, 1.0, -D / 2 - 0.08);
      add(g, sphere(8), ink(COL.brass), 0.42, 1.0, -D / 2 - 0.16, 0, 0, 0, 0.06);
      add(g, rbox(1.3, 0.12, 0.3, 0.04), ink(COL.wood3), 0.1, 0.06, -D / 2 - 0.17);
      lantern(g, 0.95, 2.2, -D / 2 - 0.36, lanternGlow, 0.8);
      beam(g, thin(COL.iron), V3(0.95, 2.5, -D / 2), V3(0.95, 2.5, -D / 2 - 0.4), 0.05, 0.05, 0.015);
    }
    // upper floor overhangs the front, cream plaster with dark timbers
    const up = new THREE.Group();
    up.position.set(0, H1, 0.35);
    g.add(up);
    add(up, rbox(W + 0.4, 0.3, D + 0.7, 0.08), ink(COL.woodDeep), 0, 0.05, 0);
    add(up, rbox(W + 0.2, H2, D + 0.5, 0.12, 2), ink(COL.cream), 0, H2 / 2 + 0.2, 0);
    const timber = ink(COL.woodDeep);
    const fz = (D + 0.5) / 2 + 0.03;
    for (const x of [-W / 2 - 0.05, -2.2, -0.75, 0.75, 2.2, W / 2 + 0.05]) add(up, rbox(0.2, H2, 0.1, 0.03), timber, x, H2 / 2 + 0.2, fz);
    add(up, rbox(W + 0.3, 0.2, 0.1, 0.03), timber, 0, H2 + 0.15, fz);
    for (const [x0, x1] of [[-W / 2, -2.2], [2.2, W / 2]]) {
      beam(up, timber, V3(x0 + 0.1, 0.3, fz), V3(x1 - 0.1, H2 - 0.05, fz), 0.16, 0.08, 0.03);
    }
    // the same half-timbering on the sides and the back, a little window in each side
    {
      const bz = -(D + 0.5) / 2 - 0.03;
      for (const x of [-W / 2 - 0.05, -1.4, 1.4, W / 2 + 0.05]) add(up, rbox(0.2, H2, 0.1, 0.03), timber, x, H2 / 2 + 0.2, bz);
      add(up, rbox(W + 0.3, 0.2, 0.1, 0.03), timber, 0, H2 + 0.15, bz);
      beam(up, timber, V3(-1.3, 0.3, bz), V3(1.3, H2 - 0.05, bz), 0.16, 0.08, 0.03);
      const sxz = (W + 0.2) / 2 + 0.03;
      for (const sx of [-1, 1]) {
        for (const z of [-(D + 0.5) / 2, 0, (D + 0.5) / 2]) add(up, rbox(0.1, H2, 0.2, 0.03), timber, sx * sxz, H2 / 2 + 0.2, z);
        add(up, rbox(0.1, 0.2, D + 0.6, 0.03), timber, sx * sxz, H2 + 0.15, 0);
        beam(up, timber, V3(sx * sxz, 0.3, -(D + 0.5) / 2 + 0.1), V3(sx * sxz, H2 - 0.05, -0.2), 0.08, 0.16, 0.03);
        add(up, rbox(0.1, 0.8, 0.8, 0.04), ink(COL.woodDeep), sx * (sxz + 0.01), 1.3, 1.35);
        add(up, rbox(0.1, 0.6, 0.6, 0.03), winGlow, sx * (sxz + 0.04), 1.3, 1.35);
        add(up, rbox(0.12, 0.62, 0.05, 0.02), thin(COL.woodDeep), sx * (sxz + 0.06), 1.3, 1.35);
      }
    }
    // upper windows (lit) with shutters
    for (const x of [-3.3, 0, 3.3]) {
      add(up, rbox(1.0, 1.0, 0.1, 0.04), ink(COL.woodDeep), x, 1.35, fz + 0.03);
      add(up, rbox(0.78, 0.78, 0.1, 0.03), winGlow, x, 1.35, fz + 0.06);
      add(up, rbox(0.06, 0.8, 0.12, 0.02), thin(COL.woodDeep), x, 1.35, fz + 0.08);
      add(up, rbox(0.8, 0.06, 0.12, 0.02), thin(COL.woodDeep), x, 1.35, fz + 0.08);
      for (const sx of [-1, 1]) {
        const sh = add(up, rbox(0.42, 0.95, 0.06, 0.03), ink(COL.teal), x + sx * 0.78, 1.35, fz + 0.15);
        sh.rotation.y = sx * 0.35;
      }
      // flower box
      add(up, rbox(0.95, 0.2, 0.26, 0.04), ink(COL.wood2), x, 0.78, fz + 0.15);
      for (let i = 0; i < 4; i++) add(up, sphere(8), ink([COL.red, COL.pink, COL.yellow, COL.white][(i + Math.round(x)) & 3]), x - 0.33 + i * 0.22, 0.95, fz + 0.18, 0, 0, 0, 0.11);
    }
    // balcony across the upper floor (with a rail at forearm height)
    const bz = fz + 0.55;
    add(up, rbox(W - 1.0, 0.16, 1.1, 0.05), ink(COL.wood3), 0, 0.18, bz - 0.15);
    for (let x = -W / 2 + 0.6; x <= W / 2 - 0.5; x += 0.7) add(up, rbox(0.1, 0.62, 0.1, 0.03), thin(COL.woodDark), x, 0.55, bz + 0.33);
    beam(up, ink(COL.woodDark), V3(-W / 2 + 0.5, 0.88, bz + 0.33), V3(W / 2 - 0.5, 0.88, bz + 0.33), 0.16, 0.1);
    for (const x of [-W / 2 + 0.6, W / 2 - 0.6]) beam(up, ink(COL.woodDark), V3(x, -0.6, fz - 0.2), V3(x, 0.12, bz + 0.3), 0.14, 0.14);
    // roof: steep gable with shingle bands, patches, a dormer and a chimney
    roof(up, W + 0.9, D + 1.3, H2 + 0.25, 2.6, COL.red, { patches: 3, dormer: true, dormerX: 2.4 });
    const chim = new THREE.Group();
    chim.position.set(2.6, H2 + 1.6, -0.9);
    up.add(chim);
    add(chim, rbox(0.8, 2.6, 0.8, 0.1), ink(COL.stone), 0, 0.8, 0);
    add(chim, rbox(0.95, 0.24, 0.95, 0.06), ink(COL.stoneDark), 0, 2.1, 0);
    for (let i = 0; i < 6; i++) add(chim, rbox(0.3, 0.14, 0.05, 0.02), thin(COL.stoneDark), ((i % 2) - 0.5) * 0.35, 0.2 + i * 0.3, 0.41);
    anim.smokeSrc.push({ obj: chim, local: V3(0, 2.3, 0), s: 1.1 });
    // ground floor: big round-topped double door, lit windows, lanterns, the sign board
    const gz = D / 2 + 0.04;
    add(g, rbox(1.9, 2.3, 0.12, 0.08), ink(COL.woodDeep), 0, 1.15, gz);
    add(g, rbox(1.6, 2.1, 0.14, 0.06), ink(COL.door), 0, 1.05, gz + 0.04);
    add(g, rbox(0.05, 2.05, 0.16, 0.02), thin(COL.woodDeep), 0, 1.05, gz + 0.05);
    for (const sx of [-1, 1]) add(g, sphere(8), ink(COL.brass), sx * 0.18, 1.05, gz + 0.13, 0, 0, 0, 0.07);
    for (const x of [-2.9, 2.9]) {
      add(g, rbox(1.25, 1.2, 0.1, 0.04), ink(COL.woodDeep), x, 1.55, gz);
      add(g, rbox(1.02, 0.98, 0.1, 0.03), winGlow, x, 1.55, gz + 0.03);
      add(g, rbox(0.06, 1.0, 0.12, 0.02), thin(COL.woodDeep), x, 1.55, gz + 0.06);
      add(g, rbox(1.0, 0.06, 0.12, 0.02), thin(COL.woodDeep), x, 1.55, gz + 0.06);
      lantern(g, x > 0 ? 1.35 : -1.35, 2.25, gz + 0.32, lanternGlow);
      beam(g, thin(COL.iron), V3(x > 0 ? 1.35 : -1.35, 2.6, gz), V3(x > 0 ? 1.35 : -1.35, 2.6, gz + 0.38), 0.05, 0.05, 0.015);
    }
    // the big sign standing on the front of the roof, a sparrow perched on top
    const sg = new THREE.Group();
    sg.position.set(-1.7, H2 + 0.25 + 2.6 * 0.55 + 0.85, 1.45);
    sg.rotation.x = -0.08;
    up.add(sg);
    for (const sx of [-1.5, 1.5]) {
      add(sg, rbox(0.18, 1.9, 0.18, 0.05), ink(COL.woodDeep), sx, -0.75, -0.2);
      beam(sg, thin(COL.woodDeep), V3(sx, -1.4, -1.1), V3(sx, 0.2, -0.22), 0.12, 0.12, 0.03);
    }
    add(sg, rbox(4.3, 1.42, 0.22, 0.12, 2), ink(COL.woodDeep), 0, 0, 0);
    if (signMat) add(sg, signPlane(tex, 'tavern', 4.1, 1.24), signMat, 0, 0, 0.115);
    const tb = sparrowBird(sg, 0.85, { bandana: true });
    tb.position.set(1.35, 0.7, 0);
    tb.rotation.y = -0.25;
    // a frothy mug of grog hangs over the door
    // (high enough for a captain in a tall hat to walk in under it)
    const mugY = H1 - 0.67;
    beam(g, ink(COL.iron), V3(0, H1 - 0.3, D / 2), V3(0, H1 - 0.3, D / 2 + 0.75), 0.06, 0.06, 0.02);
    add(g, cyl(0.2, 0.2, 0.42, 12), ink(COL.wood3), 0, mugY, D / 2 + 0.7);
    add(g, torus(0.2, 0.03, 12, 4), thin(COL.hoop), 0, mugY + 0.1, D / 2 + 0.7, PI / 2);
    add(g, torus(0.2, 0.03, 12, 4), thin(COL.hoop), 0, mugY - 0.12, D / 2 + 0.7, PI / 2);
    add(g, torus(0.12, 0.045, 10, 5), ink(COL.wood3), 0.24, mugY, D / 2 + 0.7, 0, 0, 0);
    add(g, sphere(10), ink(COL.white), 0, mugY + 0.25, D / 2 + 0.7, 0, 0, 0, [0.24, 0.13, 0.24]);
    for (const sx of [-1, 1]) rod(g, thin(COL.iron), V3(sx * 0.12, H1 - 0.3, D / 2 + 0.7), V3(sx * 0.12, mugY + 0.22, D / 2 + 0.7), 0.012, 4);
    // the porch: barrels, a table with mugs and two benches
    const porch = new THREE.Group();
    porch.position.set(0, 0, D / 2);
    g.add(porch);
    barrel(porch, -3.7, 0, 0.6, 0.9);
    barrel(porch, -3.05, 0, 0.4, 0.75, COL.barrel2);
    barrel(porch, -3.4, 0.9, 0.5, 0.7);
    add(porch, cyl(0.55, 0.55, 0.08, 16), ink(COL.wood3), 2.9, 0.62, 1.5);
    add(porch, cyl(0.08, 0.12, 0.6, 8), ink(COL.woodDark), 2.9, 0.3, 1.5);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1;
      add(porch, cyl(0.07, 0.07, 0.16, 10), ink(COL.white), 2.9 + Math.cos(a) * 0.28, 0.74, 1.5 + Math.sin(a) * 0.28);
      add(porch, cyl(0.07, 0.06, 0.03, 10), flat(COL.cream), 2.9 + Math.cos(a) * 0.28, 0.83, 1.5 + Math.sin(a) * 0.28);
    }
    for (const sx of [-1, 1]) {
      const b = new THREE.Group();
      b.position.set(2.9 + sx * 0.95, 0, 1.5);
      b.rotation.y = sx > 0 ? -PI / 2 : PI / 2;
      porch.add(b);
      add(b, rbox(1.2, 0.08, 0.36, 0.03), ink(COL.wood3), 0, 0.27, 0);
      for (const s2 of [-1, 1]) add(b, rbox(0.1, 0.26, 0.3, 0.03), ink(COL.woodDark), s2 * 0.48, 0.13, 0);
    }
    // a flag on the roof ridge
    flagOnPole(g, V3(3.7, H1 + H2 + 2.75, 0.35), 1.6, 1.3, 0.85, COL.teal, 0.3);
    tavernG = g;
    // the walk: the house (and its corner posts), the porch barrels, the table and its benches
    blockBox(g, 0, 0, W + 0.7, D + 0.4, 0, H1 + H2 + 2.8); // (with the side windows' shutters and sills)
    block(porch, -3.7, 0.6, 0.48, 1.6);
    block(porch, -3.05, 0.4, 0.4, 0.8);
    block(porch, 2.9, 1.5, 0.58, 0.7);
    for (const sx of [-1, 1]) blockBox(porch, 2.9 + sx * 0.95, 1.5, 0.4, 1.25, 0, 0.35);
    // the camera keeps out of the upper floor's overhang, the balcony (with its braces) and the eaves
    // over the porch, where the captain walks underneath
    camBox(g, 0, (D + 0.4) / 2 + 0.72, W + 0.6, 1.45, 0, H1 - 0.6, H1 + H2 + 1.2);
    // The Salty Sparrow (a place): the captain stops on the porch in front of the door; the
    // tavern panel's camera looks at the door and the table from the plaza side
    const door = worldAt(g, 0, 0, D / 2 + 1.15);
    const camT = worldAt(g, 1.3, 1.25, D / 2 + 1.0);
    const camP = worldAt(g, 0.3, 3.0, D / 2 + 5.8);
    walkData.places.push({ id: 'tavern', name: 'The Salty Sparrow', x: r2(door.x), z: r2(door.z), r: 1.6, face: r3(g.rotation.y + PI), cam: { pos: [r2(camP.x), r2(camP.y), r2(camP.z)], target: [r2(camT.x), r2(camT.y), r2(camT.z)] } });
  }

  // ----- the lookout tower with the sparrow weathervane -----
  {
    const g = new THREE.Group();
    const base = towerRaft.at(0, 0);
    g.position.copy(base);
    g.rotation.y = 0.15;
    statics.add(g);
    const H = TOWER_H;
    const b0 = 1.6;
    const b1 = 0.85;
    const leg = ink(COL.wood2);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sx, sz] of corners) rod(g, leg, V3(sx * b0, 0, sz * b0), V3(sx * b1, H, sz * b1), 0.16, 8);
    const at = (sx, sz, y) => {
      const k = y / H;
      const b = b0 + (b1 - b0) * k;
      return V3(sx * b, y, sz * b);
    };
    for (let lv = 0; lv < 3; lv++) {
      const y0 = 0.4 + (lv * (H - 0.4)) / 3;
      const y1 = y0 + (H - 0.4) / 3;
      for (let i = 0; i < 4; i++) {
        const [ax, az] = corners[i];
        const [bx, bz] = corners[(i + 1) % 4];
        rod(g, thin(COL.wood3), at(ax, az, y0), at(bx, bz, Math.min(H, y1)), 0.075, 6);
        rod(g, thin(COL.wood3), at(bx, bz, y0), at(ax, az, Math.min(H, y1)), 0.075, 6);
        rod(g, thin(COL.wood2), at(ax, az, y0), at(bx, bz, y0), 0.09, 6);
      }
    }
    // ladder up the front
    for (const sx of [-0.3, 0.3]) rod(g, thin(COL.wood3), V3(sx, 0, b0 + 0.25), V3(sx, H, b1 + 0.25), 0.05, 6);
    for (let y = 0.4; y < H; y += 0.45) {
      const z = b0 + 0.25 + ((b1 - b0) * y) / H;
      rod(g, thin(COL.wood3), V3(-0.3, y, z), V3(0.3, y, z), 0.035, 5);
    }
    // crow's nest
    const nest = new THREE.Group();
    nest.position.set(0, H, 0);
    g.add(nest);
    add(nest, cyl(1.55, 1.3, 0.3, 20), ink(COL.wood2), 0, 0, 0);
    add(nest, lathe('nestWall', [[1.5, 0.1], [1.56, 0.5], [1.56, 0.85], [1.5, 0.9]], 22), ink(COL.wood3), 0, 0, 0);
    add(nest, cached('nestWallIn', () => new THREE.LatheGeometry([new THREE.Vector2(1.42, 0.9), new THREE.Vector2(1.42, 0.12)], 22)), ink(COL.wood2), 0, 0, 0);
    add(nest, torus(1.53, 0.07, 28, 5), ink(COL.red), 0, 0.92, 0, PI / 2);
    add(nest, torus(1.58, 0.05, 28, 5), thin(COL.red), 0, 0.42, 0, PI / 2);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + PI / 4;
      rod(g, thin(COL.woodDark), V3(Math.cos(a) * 1.3, H + 0.9, Math.sin(a) * 1.3), V3(Math.cos(a) * 0.5, H + 2.5, Math.sin(a) * 0.5), 0.06, 6);
    }
    add(nest, cone(2.0, 1.35, 18), ink(COL.red), 0, 3.0, 0);
    add(nest, torus(1.95, 0.08, 28, 5), ink(COL.cream), 0, 2.35, 0, PI / 2);
    add(nest, sphere(10), ink(COL.brass), 0, 3.72, 0, 0, 0, 0, 0.2);
    rod(nest, ink(COL.iron), V3(0, 3.72, 0), V3(0, 4.35, 0), 0.05, 6);
    // compass arms N/E/S/W
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      rod(nest, thin(COL.iron), V3(0, 4.05, 0), V3(Math.cos(a) * 0.65, 4.05, Math.sin(a) * 0.65), 0.025, 4);
      add(nest, sphere(8), ink(COL.brass), Math.cos(a) * 0.68, 4.05, Math.sin(a) * 0.68, 0, 0, 0, 0.09);
    }
    // the turning vane: an arrow with a sparrow riding it (its own mesh)
    const vane = new THREE.Group();
    vane.position.copy(base).add(V3(0, H + 4.4, 0));
    vane.userData.keep = true;
    root.add(vane);
    const vg = new THREE.Group();
    vane.add(vg);
    rod(vg, ink(COL.iron), V3(0, 0, -1.2), V3(0, 0, 1.3), 0.045, 6);
    add(vg, cached('vaneHead', () => new THREE.ConeGeometry(0.2, 0.45, 4).rotateX(PI / 2)), ink(COL.brass), 0, 0, 1.45, 0, 0, PI / 4, [1, 0.35, 1]);
    const tailS = new THREE.Shape([new THREE.Vector2(-0.45, 0), new THREE.Vector2(0.45, 0), new THREE.Vector2(0.2, -0.6), new THREE.Vector2(0, -0.4), new THREE.Vector2(-0.2, -0.6)]);
    const tailM = add(vg, slabShape(tailS, 0.05, 0.02), ink(COL.brass), 0, 0, -1.1, PI / 2, PI / 2, 0);
    tailM.rotation.set(0, PI / 2, PI / 2);
    const vb = sparrowBird(vg, 0.95, { flat: 0.7 });
    vb.position.set(0, 0.05, -0.1);
    bake(vane, { force: 'ink' });
    anim.vane = vane;
    // a long pennant from the tower's side
    flagOnPole(g, V3(b1 + 0.1, H - 1.6, 0), 2.2, 2.2, 0.7, COL.yellow, 0.1, 'pennant');
    // the lookout's spyglass stand: just a barrel
    barrel(nest, -0.6, 0.15, -0.5, 0.55, COL.barrel2);
    // the tower raft's corner: crates and a net drying rack
    const rg = towerRaft.g;
    crate(rg, 2.55, DECK, -2.5, 0.85, 0.4);
    crate(rg, 2.6, DECK + 0.68, -2.45, 0.6, -0.3, COL.wood);
    crate(rg, -2.6, DECK, -2.55, 0.75, -0.2, COL.wood);
    netRack(rg, -2.75, DECK, 0.7, PI / 2);
    // the walk: round the tower's legs and braces (and the foot of its ladder), past the crates
    blockBox(g, 0, 0.14, 3.62, 3.9, 0, H + 4.5);
    block(rg, 2.55, -2.5, 0.6, 1.3);
    block(rg, -2.6, -2.55, 0.53, 0.75);
    blockBox(rg, -2.75, 0.7, 0.36, 2.75, 0, 2.2);
  }

  // ----- the shipyard: crane hoisting a cannon from a barge, a boat on the slipway -----
  {
    const Y = yard;
    const g = Y.g;
    // the slipway with a boat skeleton
    const sl = new THREE.Group();
    sl.position.set(0.6, DECK, -1.4);
    sl.rotation.y = PI / 2 - 0.15;
    g.add(sl);
    beam(sl, ink(COL.woodDark), V3(0, 0.45, -2.6), V3(0, 0.6, 2.6), 0.24, 0.24);
    rod(sl, ink(COL.woodDark), V3(0, 0.5, 2.5), V3(0, 2.4, 3.1), 0.12);
    rod(sl, ink(COL.woodDark), V3(0, 0.5, -2.5), V3(0, 1.9, -2.7), 0.12);
    for (let i = 0; i < 7; i++) {
      const z = -2.1 + i * 0.7;
      const w = 1.25 * Math.sin(((i + 0.8) / 7.6) * PI);
      const rib = add(sl, torus(w, 0.07, 16, 5, PI), ink(COL.wood3), 0, 1.75, z, 0, 0, PI);
      rib.scale.y = 1.15;
    }
    for (const sx of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const z = -2.2 + i * 0.55;
        const w = 1.25 * Math.sin(((i * 0.55 + 0.1) / 4.9) * PI);
        pts.push(V3(sx * w, 1.75, z));
      }
      rope(sl, ink(COL.wood2), pts, 0.08, 6);
    }
    for (const z of [-1.6, 0.4, 1.9]) for (const sx of [-1, 1]) rod(sl, thin(COL.woodDark), V3(sx * 1.1, 0, z), V3(sx * 0.6, 1.0, z), 0.07, 6);
    // stacked planks, a saw horse and cannons for sale
    for (let i = 0; i < 5; i++) add(g, rbox(3.0, 0.12, 0.34, 0.03), thin(i % 2 ? COL.plank : COL.wood3), -2.4, DECK + 0.07 + i * 0.13, -3.6 + (i % 2) * 0.05, 0, 0.02 * i, 0);
    for (let i = 0; i < 3; i++) {
      const cg = new THREE.Group();
      cg.position.set(2.6, DECK, -3.4 + i * 1.2);
      cg.rotation.y = -PI / 2;
      g.add(cg);
      cannon(cg, 0.9);
    }
    // cannonball pyramid
    for (let ly = 0; ly < 3; ly++) for (let i = 0; i < 3 - ly; i++) for (let j = 0; j < 3 - ly; j++) {
      add(g, sphere(10), ink(COL.iron), 1.0 + i * 0.3 + ly * 0.15, DECK + 0.14 + ly * 0.24, 3.0 + j * 0.3 + ly * 0.15, 0, 0, 0, 0.15);
    }
    // the shipyard sign over the entrance from the plaza side
    const sg = new THREE.Group();
    sg.position.copy(Y.at(-3.9, 1.0));
    sg.rotation.y = -0.35;
    statics.add(sg);
    for (const sx of [-1, 1]) add(sg, cyl(0.12, 0.14, 3.3, 8), ink(COL.woodDark), sx * 1.25, 1.65, 0);
    add(sg, rbox(2.75, 1.25, 0.18, 0.08, 2), ink(COL.woodDeep), 0, 2.85, 0);
    if (signMat) add(sg, signPlane(tex, 'yard', 2.62, 1.12), signMat, 0, 2.85, 0.095);
    // the crane: a timber tower on the platform's front corner, its jib over the water
    const cr = new THREE.Group();
    cr.position.copy(Y.at(-2.2, 3.0));
    cr.rotation.y = 0.5;
    statics.add(cr);
    cr.updateMatrixWorld(true);
    const CH = 6.2;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rod(cr, ink(COL.woodDark), V3(sx * 0.75, 0, sz * 0.75), V3(sx * 0.4, CH, sz * 0.4), 0.13, 8);
    for (let lv = 0; lv < 2; lv++) {
      const y0 = 0.3 + lv * 2.9;
      const y1 = y0 + 2.9;
      const bb = (y) => 0.75 - (0.35 * y) / CH;
      for (const [ax, az, bx, bz] of [[-1, 1, 1, 1], [-1, -1, 1, -1], [1, -1, 1, 1], [-1, -1, -1, 1]]) {
        rod(cr, thin(COL.wood2), V3(ax * bb(y0), y0, az * bb(y0)), V3(bx * bb(y1), y1, bz * bb(y1)), 0.06, 5);
      }
    }
    add(cr, rbox(1.3, 0.3, 1.3, 0.06), ink(COL.woodDark), 0, CH, 0);
    // jib: from the top, angled up and out over the water (local +z)
    const jibA = V3(0, CH + 0.1, -1.4);
    const jibB = V3(0, CH + 2.2, 4.6);
    beam(cr, ink(COL.wood2), jibA, jibB, 0.3, 0.3, 0.06);
    rod(cr, thin(COL.rope), V3(0, CH + 2.6, 0), jibB, 0.03, 4);
    rod(cr, thin(COL.rope), V3(0, CH + 2.6, 0), V3(0, CH + 0.3, -1.3), 0.03, 4);
    add(cr, cyl(0.07, 0.09, 2.6, 8), ink(COL.woodDark), 0, CH + 1.3, 0);
    // counterweight of stones
    add(cr, rbox(1.0, 0.8, 0.8, 0.1), ink(COL.wood2), 0, CH - 0.35, -1.3);
    for (let i = 0; i < 4; i++) add(cr, sphere(8), ink(COL.stone), (i % 2 - 0.5) * 0.45, CH + 0.15, -1.3 + (i > 1 ? 0.2 : -0.2), 0, 0, 0, 0.26);
    add(cr, torus(0.22, 0.06, 14, 5), ink(COL.iron), 0, jibB.y - 0.1, jibB.z, 0, PI / 2, 0);
    // the winch wheel at the foot (turns while hoisting)
    const wheel = new THREE.Group();
    wheel.position.copy(cr.localToWorld(V3(0.95, 1.1, 0.2)));
    wheel.quaternion.copy(cr.getWorldQuaternion(new THREE.Quaternion()));
    wheel.userData.keep = true;
    root.add(wheel);
    const wg = new THREE.Group();
    wheel.add(wg);
    add(wg, torus(0.75, 0.07, 22, 5), ink(COL.wood2), 0, 0, 0, 0, PI / 2, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI;
      rod(wg, thin(COL.woodDark), V3(0, Math.cos(a) * 0.72, Math.sin(a) * 0.72), V3(0, -Math.cos(a) * 0.72, -Math.sin(a) * 0.72), 0.04, 5);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      rod(wg, thin(COL.woodDark), V3(0, Math.cos(a) * 0.75, Math.sin(a) * 0.75), V3(0.25, Math.cos(a) * 0.95, Math.sin(a) * 0.95), 0.04, 5);
    }
    bake(wheel, { force: 'ink' });
    // the hook and the cannon in its sling (moves)
    const tip = cr.localToWorld(jibB.clone().add(V3(0, -0.2, 0)));
    // the camera keeps off the jib and the hoist hanging from its tip (the rope, the hook, the cannon)
    camBox(cr, 0, (jibA.z + jibB.z) / 2, 0.8, jibB.z - jibA.z + 0.4, 0, CH - 0.5, jibB.y + 0.7);
    camPost(cr, 0, jibB.z, 0.85, -cr.position.y, jibB.y);
    const hook = new THREE.Group();
    hook.userData.keep = true;
    root.add(hook);
    const hg = new THREE.Group();
    hook.add(hg);
    add(hg, rbox(0.34, 0.4, 0.22, 0.06), ink(COL.woodDark), 0, -0.2, 0);
    add(hg, torus(0.13, 0.04, 12, 5, PI * 1.4), ink(COL.iron), 0, -0.52, 0, 0, 0, -0.6);
    rod(hg, thin(COL.rope), V3(0, -0.55, 0), V3(-0.7, -1.25, 0), 0.03, 4);
    rod(hg, thin(COL.rope), V3(0, -0.55, 0), V3(0.7, -1.25, 0), 0.03, 4);
    const cn = new THREE.Group();
    cn.position.set(0, -1.38, 0);
    cn.rotation.y = PI / 2;
    hg.add(cn);
    cannonBarrel(cn, 1.15);
    bake(hook, { force: 'ink' });
    const ropeM = add(root, cyl(0.03, 0.03, 1, 5), ink(COL.rope));
    ropeM.userData.keep = true;
    // the barge below the jib with a crate of shot
    const bargePos = V3(tip.x, 0, tip.z);
    const barge = new THREE.Group();
    barge.position.copy(bargePos);
    barge.rotation.y = cr.rotation.y;
    barge.userData.keep = true;
    barge.userData.base = { x: bargePos.x, z: bargePos.z };
    barge.userData.phase = 1.3;
    root.add(barge);
    const bg = new THREE.Group();
    barge.add(bg);
    add(bg, rbox(2.6, 0.5, 3.4, 0.14), ink(COL.wood2), 0, 0.1, 0);
    deckSurfaceSmall(bg, 2.5, 3.3, 0.4);
    crate(bg, -0.7, 0.4, -1.0, 0.7, 0.2);
    add(bg, rbox(2.4, 0.14, 0.2, 0.05), ink(COL.woodDark), 0, 0.42, 1.55);
    bake(barge, { force: 'thin' });
    anim.boats.push(barge);
    anim.crane = { tip, hook, rope: ropeM, wheel: wg, deckY: 0.45 + 1.38 + 0.3, topY: tip.y - 2.2 };
    // workers' things
    barrel(g, 3.4, DECK, 3.4, 0.9);
    crate(g, 3.3, DECK, 2.3, 0.8, 0.5);
    // the walk: the boat on the slipway, the plank stack, the cannons for sale and the shot, the
    // sign's posts, the crane's tower and its winch wheel, the barrel and crate, the flag pole
    blockBox(sl, 0, 0.22, 2.7, 6.0, 0, 2.6);
    blockBox(g, -2.4, -3.57, 3.1, 0.5, 0, 0.75);
    blockBox(g, 2.55, -2.2, 1.3, 3.25, 0, 1.0);
    block(g, 1.3, 3.3, 0.55, 0.7);
    for (const sx of [-1, 1]) block(sg, sx * 1.25, 0, 0.16, 3.5);
    // the camera keeps off the sign's board over the way in and its posts (the captain walks under it)
    camBox(sg, 0, 0, 2.95, 0.32, 0, 2.15, 3.55);
    for (const sx of [-1, 1]) camPost(sg, sx * 1.25, 0, 0.14, 0, 3.3);
    blockBox(cr, 0, 0, 1.75, 1.75, 0, CH + 2.5);
    blockBox(cr, 1.0, 0.2, 0.45, 2.0, 0, 2.1);
    block(g, 3.4, 3.4, 0.42, 0.9);
    block(g, 3.3, 2.3, 0.46, 0.8);
    block(g, 3.6, -4.0, 0.1, 5);
    // The Shipyard (a place): in front of the shipwright at his slipway
    const at = Y.at(-0.6, 1.6);
    const sw = Y.at(0.2, 0.3);
    walkData.places.push({ id: 'shipyard', name: 'The Shipyard', x: r2(at.x), z: r2(at.z), r: 1.8, face: r3(Math.atan2(sw.x - at.x, sw.z - at.z)) });
  }
  function deckSurfaceSmall(g, w, d, y) {
    const n = Math.round(w / 0.42);
    for (let i = 0; i < n; i++) add(g, rbox(w / n - 0.05, 0.1, d, 0.03), thin(i % 2 ? COL.wood3 : COL.plank), -w / 2 + (w / n) * (i + 0.5), y, 0);
  }
  function cannonBarrel(g, s = 1) {
    add(g, lathe('cannonBarrel', [[0, -0.85], [0.2, -0.85], [0.24, -0.75], [0.22, -0.3], [0.17, 0.6], [0.21, 0.66], [0.21, 0.76], [0.12, 0.78], [0, 0.78]], 14), ink(COL.iron), 0, 0, 0, PI / 2, 0, 0, s);
    add(g, sphere(8), ink(COL.iron), 0, 0, -0.92 * s, 0, 0, 0, 0.12 * s);
    add(g, torus(0.2 * s, 0.035 * s, 14, 5), thin(COL.brass), 0, 0, 0.55 * s);
  }
  function cannon(g, s = 1) {
    add(g, rbox(0.8 * s, 0.32 * s, 1.1 * s, 0.06), ink(COL.red), 0, 0.3 * s, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, cyl(0.17 * s, 0.17 * s, 0.08 * s, 12), ink(COL.woodDark), sx * 0.44 * s, 0.17 * s, sz * 0.36 * s, 0, 0, PI / 2);
    const b = new THREE.Group();
    b.position.set(0, 0.62 * s, 0.1 * s);
    b.rotation.x = -0.12;
    g.add(b);
    cannonBarrel(b, 0.75 * s);
  }
  function netRack(g, x, y, z, ry) {
    const n = new THREE.Group();
    n.position.set(x, y, z);
    n.rotation.y = ry;
    g.add(n);
    for (const sx of [-1, 1]) add(n, cyl(0.08, 0.1, 2.2, 8), ink(COL.woodDark), sx * 1.2, 1.1, 0);
    rod(n, ink(COL.woodDark), V3(-1.35, 2.15, 0), V3(1.35, 2.15, 0), 0.08);
    // draped net: a sagging grid
    const rows = 6;
    const cols = 9;
    const P = (i, j) => {
      const u = j / cols;
      const v = i / rows;
      return V3(-1.1 + 2.2 * u, 2.1 - v * 1.7 + 0.25 * Math.sin(u * PI) * v, 0.06 + 0.12 * Math.sin(u * PI) * v);
    };
    for (let i = 0; i <= rows; i++) rope(n, thin(COL.net), Array.from({ length: cols + 1 }, (_, j) => P(i, j)), 0.018, 4);
    for (let j = 0; j <= cols; j++) rope(n, thin(COL.net), Array.from({ length: rows + 1 }, (_, i) => P(i, j)), 0.018, 4);
    for (let j = 0; j <= cols; j += 2) add(n, sphere(8), ink(COL.cork), P(rows, j).x, P(rows, j).y, P(rows, j).z, 0, 0, 0, [0.1, 0.07, 0.1]);
  }

  // ----- shacks -----
  function roof(g, w, d, y, rh, color, o = {}) {
    // gable roof with the ridge along x; three shingle bands per side, patches with nails
    const half = d / 2;
    const slope = Math.atan2(rh, half);
    const L = Math.hypot(half, rh);
    const bands = 3;
    const darker = shade(color, -0.12);
    for (const s of [-1, 1]) {
      for (let b = 0; b < bands; b++) {
        const u0 = b / bands;
        const u1 = (b + 1) / bands + 0.06;
        const um = (u0 + u1) / 2;
        const bl = (u1 - u0) * L;
        // point along the slope from the ridge (u=0) to the eave (u=1)
        const pz = s * um * half;
        const py = y + rh - um * rh + 0.12 + (b * 0.035);
        const m = add(g, rbox(w - b * 0.02, 0.2, bl, 0.06), ink(b === 1 ? darker : color), 0, py, pz);
        m.rotation.x = s * slope;
      }
    }
    // ridge cap
    add(g, cyl(0.16, 0.16, w + 0.1, 10), ink(shade(color, -0.25)), 0, y + rh + 0.2, 0, 0, 0, PI / 2);
    // gable triangles
    const tri = cached(`gable${r3(d)},${r3(rh)}`, () => {
      const s = new THREE.Shape([new THREE.Vector2(-half + 0.35, 0), new THREE.Vector2(half - 0.35, 0), new THREE.Vector2(0, rh - 0.25)]);
      const gg = slabShape(s, 0.14, 0.03);
      gg.rotateY(PI / 2);
      return gg;
    });
    for (const sx of [-1, 1]) add(g, tri, ink(o.gable ?? COL.cream), sx * (w / 2 - 0.45), y, 0);
    // patches on the front slope (and sometimes the back)
    const nP = o.patches ?? 0;
    for (let i = 0; i < nP; i++) {
      const s = i === 2 ? -1 : 1;
      const um = 0.3 + rand() * 0.45;
      const px = (rand() - 0.5) * (w - 2.2);
      const pz = s * um * half;
      const py = y + rh - um * rh + 0.26;
      const pc = new THREE.Group();
      pc.position.set(px, py, pz);
      pc.rotation.x = s * slope;
      g.add(pc);
      const pw = 0.7 + rand() * 0.4;
      const pd = 0.55 + rand() * 0.35;
      const pcol = o.patchColors ? o.patchColors[i % o.patchColors.length] : ROOFS[Math.floor(rand() * ROOFS.length)];
      const p = add(pc, rbox(pw, 0.06, pd, 0.02), ink(pcol === color ? COL.canvas : pcol), 0, 0, 0);
      p.rotation.y = (rand() - 0.5) * 0.5;
      for (const [nx, nz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const v = V3(nx * (pw / 2 - 0.08), 0.04, nz * (pd / 2 - 0.08)).applyEuler(p.rotation);
        add(pc, sphere(6), flat(COL.iron), v.x, v.y, v.z, 0, 0, 0, 0.035);
      }
      // stitches along one side
      for (let k = 0; k < 4; k++) {
        const v = V3(-pw / 2 + 0.12 + k * ((pw - 0.24) / 3), 0.04, pd / 2).applyEuler(p.rotation);
        const st = add(pc, rbox(0.03, 0.02, 0.16, 0.008), flat(COL.black), v.x, v.y, v.z);
        st.rotation.y = p.rotation.y;
      }
    }
    if (o.dormer) {
      const dm = new THREE.Group();
      dm.position.set(o.dormerX ?? -1.6, y + rh * 0.42, half * 0.42);
      g.add(dm);
      add(dm, rbox(1.2, 1.1, 1.2, 0.06), ink(COL.cream), 0, 0.35, 0.05);
      add(dm, rbox(0.62, 0.62, 0.1, 0.03), winGlow, 0, 0.4, 0.66);
      add(dm, rbox(0.8, 0.8, 0.08, 0.03), ink(COL.woodDeep), 0, 0.4, 0.62);
      for (const s of [-1, 1]) {
        const m = add(dm, rbox(0.9, 0.14, 1.5, 0.04), ink(color), s * 0.4, 1.12, 0.1, 0, 0, -s * 0.6);
        m.rotation.order = 'ZXY';
      }
    }
  }
  function shack(parent, x, y, z, ry, o) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.set(0, ry, o.tilt || 0);
    parent.add(g);
    const { w, d, h } = o;
    const wall = o.wall;
    add(g, rbox(w + 0.3, 0.2, d + 0.3, 0.05), ink(COL.woodDark), 0, 0.04, 0);
    add(g, rbox(w, h, d, 0.1, 2), ink(wall), 0, h / 2 + 0.1, 0);
    const bat = thin(shade(wall, -0.2));
    // board-and-batten all round (a walker sees the backs and sides too)
    for (let bx = -w / 2 + 0.5; bx < w / 2 - 0.35; bx += 0.55) {
      add(g, box(0.08, h - 0.25, 0.05), bat, bx, h / 2 + 0.1, d / 2 + 0.02);
      add(g, box(0.08, h - 0.25, 0.05), bat, bx, h / 2 + 0.1, -d / 2 - 0.02);
    }
    for (const sx of [-1, 1]) for (let bz = -d / 2 + 0.45; bz < d / 2 - 0.3; bz += 0.55) {
      if (Math.abs(bz) > 0.4) add(g, box(0.05, h - 0.25, 0.08), bat, sx * (w / 2 + 0.02), h / 2 + 0.1, bz);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, rbox(0.24, h + 0.2, 0.24, 0.05), ink(COL.woodDark), sx * w / 2, h / 2 + 0.1, sz * d / 2);
    add(g, rbox(w + 0.3, 0.2, d + 0.3, 0.05), ink(COL.woodDark), 0, h + 0.15, 0);
    // door
    const dx = o.doorX ?? -w / 4;
    const doorC = o.door ?? [COL.teal, COL.red, COL.blue, COL.green, COL.door][Math.floor(rand() * 5)];
    add(g, rbox(0.95, 1.62, 0.08, 0.04), ink(COL.woodDeep), dx, 0.9, d / 2 + 0.03);
    add(g, rbox(0.76, 1.48, 0.1, 0.04), ink(doorC), dx, 0.84, d / 2 + 0.06);
    add(g, sphere(8), ink(COL.brass), dx + 0.24, 0.85, d / 2 + 0.14, 0, 0, 0, 0.06);
    // windows
    const wx = o.winX ?? w / 4;
    if (o.round) {
      add(g, torus(0.33, 0.08, 18, 6), ink(COL.brass), wx, h * 0.6 + 0.1, d / 2 + 0.06);
      add(g, cyl(0.3, 0.3, 0.06, 16), o.lit ? winGlow : ink(COL.glass), wx, h * 0.6 + 0.1, d / 2 + 0.04, PI / 2);
    } else {
      const wy = h * 0.58 + 0.1;
      add(g, rbox(0.86, 0.86, 0.1, 0.04), ink(COL.woodDeep), wx, wy, d / 2 + 0.03);
      add(g, rbox(0.66, 0.66, 0.1, 0.03), o.lit ? winGlow : ink(COL.glass), wx, wy, d / 2 + 0.06);
      add(g, rbox(0.05, 0.68, 0.12, 0.02), thin(COL.woodDeep), wx, wy, d / 2 + 0.08);
      add(g, rbox(0.68, 0.05, 0.12, 0.02), thin(COL.woodDeep), wx, wy, d / 2 + 0.08);
      const shc = o.shutter ?? ROOFS[Math.floor(rand() * ROOFS.length)];
      for (const sx of [-1, 1]) {
        const sh = add(g, rbox(0.36, 0.84, 0.06, 0.03), ink(shc), wx + sx * 0.66, wy, d / 2 + 0.16);
        sh.rotation.y = sx * 0.4;
      }
      add(g, rbox(0.86, 0.18, 0.24, 0.04), ink(COL.wood2), wx, wy - 0.55, d / 2 + 0.14);
      for (let i = 0; i < 4; i++) add(g, sphere(8), ink([COL.red, COL.pink, COL.yellow, COL.white][(i + (o.seed || 0)) & 3]), wx - 0.3 + i * 0.2, wy - 0.4, d / 2 + 0.17, 0, 0, 0, 0.1);
    }
    // a round window in each side wall
    for (const sx of [-1, 1]) {
      add(g, torus(0.24, 0.06, 16, 5), ink(COL.woodDeep), sx * (w / 2 + 0.04), h * 0.62, 0, 0, PI / 2, 0);
      add(g, cyl(0.22, 0.22, 0.05, 14), ink(COL.glass), sx * (w / 2 + 0.03), h * 0.62, 0, 0, 0, PI / 2);
    }
    // roof
    if (o.shed) {
      add(g, rbox(w + 0.8, 0.22, d + 0.9, 0.06), ink(o.roof), 0, h + 0.55, 0, 0.28);
      for (let i = 0; i < 2; i++) {
        const pc = add(g, rbox(0.8, 0.06, 0.6, 0.02), ink(ROOFS[(i + 3 + (o.seed || 0)) % ROOFS.length]), (i - 0.5) * 1.2, h + 0.72 - 0.0, 0.1 + i * 0.3 - 0.3, 0.28, (rand() - 0.5) * 0.4, 0);
        pc.rotation.order = 'YXZ';
      }
    } else {
      roof(g, w + 0.8, d + 0.9, h + 0.25, o.rh ?? 1.5, o.roof, { patches: o.patches ?? 2, gable: shade(wall, 0.25) });
    }
    if (o.chimney === 'pipe') {
      const cx = w / 2 - 0.6;
      add(g, cyl(0.13, 0.13, 1.6, 10), ink(COL.iron), cx, h + 1.4, -d / 4, 0.1, 0, -0.12);
      add(g, cone(0.26, 0.24, 10), ink(COL.iron), cx + 0.1, h + 2.28, -d / 4 + 0.08);
      anim.smokeSrc.push({ obj: g, local: V3(cx + 0.1, h + 2.45, -d / 4 + 0.08), s: 0.6 });
    } else if (o.chimney === 'brick') {
      add(g, rbox(0.55, 1.6, 0.55, 0.06), ink(COL.stone), -w / 2 + 0.7, h + 1.2, -d / 4);
      add(g, rbox(0.68, 0.18, 0.68, 0.05), ink(COL.stoneDark), -w / 2 + 0.7, h + 2.0, -d / 4);
    }
    // a lantern by the door
    beam(g, thin(COL.iron), V3(dx + 0.65, 1.95, d / 2), V3(dx + 0.65, 1.95, d / 2 + 0.38), 0.05, 0.05, 0.015);
    lantern(g, dx + 0.65, 1.62, d / 2 + 0.36, lanternGlow, 0.85);
    return g;
  }
  const SHACKS = [
    // platform, local x, z, ry, look
    ['s2', 0, -0.4, 0.0, { w: 3.4, d: 3.0, h: 2.4, wall: WALLS[2], roof: ROOFS[0], patches: 2, round: true }],
    ['s3', 0, -0.6, 0.0, { w: 4.2, d: 3.4, h: 2.8, wall: WALLS[3], roof: ROOFS[4], patches: 3, chimney: 'brick', stack: { w: 3.0, d: 2.6, h: 2.2, wall: WALLS[1], roof: ROOFS[2], round: true } }],
    ['s4', 0, -0.4, 0.0, { w: 3.8, d: 3.2, h: 2.6, wall: WALLS[4], roof: ROOFS[3], patches: 2, lit: true }],
    ['s5', 0, -0.5, 0.0, { w: 4.4, d: 3.4, h: 2.8, wall: WALLS[5], roof: ROOFS[0], patches: 3, stack: { w: 3.2, d: 2.6, h: 2.2, wall: WALLS[6], roof: ROOFS[5], chimney: 'pipe' } }],
    ['s6', 0, -0.4, 0.0, { w: 3.8, d: 3.2, h: 2.6, wall: WALLS[7], roof: ROOFS[6], patches: 2, chimney: 'pipe' }],
    ['s7', 0, -0.4, 0.0, { w: 3.6, d: 3.0, h: 2.5, wall: WALLS[6], roof: ROOFS[2], patches: 2, round: true, lit: true }],
    ['s8', 0, -0.4, 0.0, { w: 3.4, d: 3.0, h: 2.4, wall: WALLS[1], roof: ROOFS[3], shed: true }],
    ['s9', 0, -0.3, 0.0, { w: 3.2, d: 3.0, h: 2.4, wall: WALLS[3], roof: ROOFS[0], patches: 2 }],
    ['s10', 0, -0.4, 0.0, { w: 4.2, d: 3.4, h: 2.8, wall: WALLS[2], roof: ROOFS[1], patches: 2, stack: { w: 3.0, d: 2.6, h: 2.0, wall: WALLS[0], roof: ROOFS[4] } }],
    ['s11', 0, -0.4, 0.0, { w: 4.2, d: 3.4, h: 2.8, wall: WALLS[4], roof: ROOFS[5], patches: 2, stack: { w: 3.0, d: 2.6, h: 2.2, wall: WALLS[5], roof: ROOFS[0], chimney: 'pipe' } }],
    ['s12', 0, -0.4, 0.0, { w: 5.0, d: 3.6, h: 3.0, wall: WALLS[1], roof: ROOFS[6], patches: 3, stack: { w: 3.6, d: 2.8, h: 2.4, wall: WALLS[3], roof: ROOFS[2], round: true } }],
    ['s13', 0, -0.5, 0.0, { w: 3.6, d: 3.0, h: 2.5, wall: WALLS[5], roof: ROOFS[4], patches: 2, chimney: 'pipe', lit: true }],
    ['s14', 0, -0.4, 0.0, { w: 3.6, d: 3.0, h: 2.6, wall: WALLS[0], roof: ROOFS[2], patches: 2, stack: { w: 2.8, d: 2.4, h: 2.0, wall: WALLS[7], roof: ROOFS[0], round: true } }],
    ['s15', 0, -0.4, 0.0, { w: 4.0, d: 3.2, h: 2.7, wall: WALLS[2], roof: ROOFS[1], patches: 2, chimney: 'brick' }],
    ['s16', -0.3, -0.5, 0.0, { w: 3.8, d: 3.0, h: 2.6, wall: WALLS[1], roof: ROOFS[5], patches: 2, round: true, lit: true }],
    ['s17', 0, -0.5, 0.0, { w: 4.2, d: 3.4, h: 2.8, wall: WALLS[6], roof: ROOFS[1], patches: 2, stack: { w: 3.0, d: 2.6, h: 2.2, wall: WALLS[4], roof: ROOFS[6], chimney: 'pipe' } }],
    ['s18', 0, -0.4, 0.0, { w: 3.6, d: 3.0, h: 2.5, wall: WALLS[5], roof: ROOFS[4], patches: 2, round: true }],
  ];
  let seed = 0;
  for (const [pn, lx, lz, ry, look] of SHACKS) {
    const P = plats[pn];
    const tilt = (rand() - 0.5) * 0.05;
    const s = shack(P.g, lx, P.y, lz, ry, { ...look, tilt, seed: seed++ });
    if (look.stack) {
      // a second shack perched on top, slightly crooked
      shack(s, 0.3, look.h + 0.35, -0.2, (rand() - 0.5) * 0.25, { ...look.stack, tilt: (rand() - 0.5) * 0.08, seed: seed++, patches: 2 });
      // ladder to the upper floor
      for (const sx of [-0.25, 0.25]) rod(s, thin(COL.wood3), V3(look.w / 2 + 0.2 + sx, 0, look.d / 2 - 0.4), V3(look.w / 2 + 0.2 + sx, look.h + 0.6, look.d / 2 - 0.8), 0.04, 5);
      for (let k = 0; k < 6; k++) {
        const yy = 0.35 + k * ((look.h + 0.2) / 6);
        const zz = look.d / 2 - 0.4 - (0.4 * yy) / (look.h + 0.6);
        rod(s, thin(COL.wood3), V3(look.w / 2 - 0.05, yy, zz), V3(look.w / 2 + 0.45, yy, zz), 0.03, 4);
      }
    }
    // porch clutter
    barrel(P.g, -P.w / 2 + 0.6, P.y, P.d / 2 - 0.7, 0.75, seed % 2 ? COL.barrel : COL.barrel2);
    if (seed % 3 === 0) crate(P.g, P.w / 2 - 0.7, P.y, P.d / 2 - 0.6, 0.7, rand());
    if (seed % 3 === 1) netRack(P.g, P.w / 2 - 0.9, P.y, 0.9, -PI / 2);
    // (the camera in the town view keeps out of the houses)
    blockBox(s, 0, 0, look.w + 0.35, look.d + 0.35, 0, look.h + 1.8 + (look.stack ? look.stack.h + 2 : 0));
  }

  // ----- Polly's Plumes & Trims, the tailor and barber, on platform s1 -----
  const polly = { pole: null, podium: null, lineup: [], spots: {}, npc: null };
  {
    const P = plats.s1;
    const g = P.g;
    const y0 = P.y;
    const prand = mulberry32(90210); // its own stream (the rest of the town keeps its looks)
    // a narrow two-storey shop at the back left: teal below, pink above, a teal shingle roof
    const SH = { x: -1.45, z: -1.35, w: 3.3, d: 2.7, h1: 2.5, h2: 2.0 };
    const shop = new THREE.Group();
    shop.position.set(SH.x, y0, SH.z);
    g.add(shop);
    const { w, d, h1, h2 } = SH;
    const TEAL = 0x7fd6c6;
    const PINK = 0xf9a8bd;
    const PINK2 = 0xe2387a;
    add(shop, rbox(w + 0.3, 0.2, d + 0.3, 0.05), ink(COL.woodDark), 0, 0.04, 0);
    add(shop, rbox(w, h1, d, 0.1, 2), ink(TEAL), 0, h1 / 2 + 0.1, 0);
    const bat = thin(shade(TEAL, -0.18));
    // board-and-batten on all four walls (no bare backs)
    for (let bx = -w / 2 + 0.45; bx < w / 2 - 0.3; bx += 0.5) {
      add(shop, box(0.07, h1 - 0.3, 0.05), bat, bx, h1 / 2 + 0.1, -d / 2 - 0.02);
    }
    for (const sx of [-1, 1]) for (let bz = -d / 2 + 0.45; bz < d / 2 - 0.3; bz += 0.5) add(shop, box(0.05, h1 - 0.3, 0.07), bat, sx * (w / 2 + 0.02), h1 / 2 + 0.1, bz);
    // white corner posts and the band between the floors
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(shop, rbox(0.22, h1 + h2 + 0.25, 0.22, 0.05), ink(COL.white), sx * w / 2, (h1 + h2 + 0.25) / 2 + 0.05, sz * d / 2);
    add(shop, rbox(w + 0.3, 0.2, d + 0.3, 0.05), ink(COL.white), 0, h1 + 0.15, 0);
    // upper floor: pink clapboard
    const up = h1 + 0.25;
    add(shop, rbox(w - 0.04, h2, d - 0.04, 0.08, 2), ink(PINK), 0, up + h2 / 2, 0);
    const clap = thin(shade(PINK, -0.14));
    for (let yy = up + 0.3; yy < up + h2 - 0.15; yy += 0.32) {
      add(shop, box(w - 0.1, 0.05, 0.05), clap, 0, yy, -d / 2 + 0.0);
      for (const sx of [-1, 1]) add(shop, box(0.05, 0.05, d - 0.1), clap, sx * (w / 2 - 0.0), yy, 0);
    }
    add(shop, rbox(w + 0.36, 0.16, d + 0.36, 0.05), ink(COL.white), 0, up + h2 + 0.05, 0);
    roof(shop, w + 0.7, d + 0.8, up + h2 + 0.1, 1.35, COL.teal, { patches: 0, gable: PINK });
    // a weather-cock finial: a brass ball and a little pink pennant on the ridge
    add(shop, sphere(10), ink(COL.brass), w / 2 - 0.2, up + h2 + 0.1 + 1.35 + 0.45, 0, 0, 0, 0, 0.13);
    flagOnPole(shop, V3(-w / 2 + 0.35, up + h2 + 1.5, 0), 1.1, 0.9, 0.55, PINK2, -0.3, 'pennant');
    // the big painted sign across the upper front
    const fz = d / 2;
    add(shop, rbox(3.2, 1.08, 0.14, 0.08, 2), ink(COL.teal), 0, up + h2 * 0.47, fz + 0.06);
    if (signMat) add(shop, signPlane(tex, 'polly', 3.04, 0.92), signMat, 0, up + h2 * 0.47, fz + 0.135);
    // round windows on the upper side walls, a shuttered one at the back
    for (const sx of [-1, 1]) {
      add(shop, torus(0.26, 0.06, 16, 5), ink(COL.white), sx * (w / 2 + 0.02), up + h2 * 0.55, 0, 0, PI / 2, 0);
      add(shop, cyl(0.23, 0.23, 0.05, 14), winGlow, sx * (w / 2 + 0.01), up + h2 * 0.55, 0, 0, 0, PI / 2);
    }
    add(shop, rbox(0.8, 0.8, 0.1, 0.04), ink(COL.white), 0.3, up + h2 * 0.55, -fz - 0.03);
    add(shop, rbox(0.62, 0.62, 0.1, 0.03), winGlow, 0.3, up + h2 * 0.55, -fz - 0.06);
    for (const sx of [-1, 1]) {
      const sh = add(shop, rbox(0.34, 0.78, 0.06, 0.03), ink(COL.teal), 0.3 + sx * 0.6, up + h2 * 0.55, -fz - 0.14);
      sh.rotation.y = -sx * 0.4;
    }
    // ground floor front: the shop window (left) with three hats on wooden heads, the door (right)
    const winX = -0.62;
    const winY = 1.3;
    const WW = 1.55;
    const WH = 1.25;
    add(shop, rbox(WW, WH, 0.06, 0.02), ink(0x34406e), winX, winY, fz + 0.01); // the dim shop inside
    for (const [ox, oy, bw, bh] of [[0, WH / 2, WW + 0.2, 0.14], [0, -WH / 2, WW + 0.26, 0.16], [-WW / 2, 0, 0.12, WH + 0.1], [WW / 2, 0, 0.12, WH + 0.1]]) {
      add(shop, box(bw, bh, 0.16), ink(COL.white), winX + ox, winY + oy, fz + 0.07);
    }
    add(shop, rbox(WW + 0.3, 0.1, 0.34, 0.03), ink(PINK2), winX, winY - WH / 2 - 0.12, fz + 0.14); // the sill
    const heads = [[-0.48, 'tricorn'], [0, 'plumed'], [0.48, 'straw']];
    for (const [hx, kind] of heads) {
      const hg = new THREE.Group();
      hg.position.set(winX + hx, winY - WH / 2 + 0.06, fz + 0.12);
      shop.add(hg);
      add(hg, cyl(0.12, 0.15, 0.06, 10), ink(COL.woodDark), 0, 0.03, 0);
      add(hg, cyl(0.04, 0.05, 0.3, 6), ink(COL.wood2), 0, 0.2, 0);
      add(hg, sphere(8), ink(COL.wood3), 0, 0.5, 0, 0, 0, 0, [0.17, 0.2, 0.17]);
      hatModel(hg, kind, 0.66);
    }
    // the door: pink, with a round window, a brass knob and a step
    const doorX = 0.95;
    add(shop, rbox(1.0, 1.95, 0.1, 0.05), ink(COL.white), doorX, 1.05, fz + 0.03);
    add(shop, rbox(0.8, 1.8, 0.12, 0.05), ink(PINK2), doorX, 1.0, fz + 0.06);
    add(shop, torus(0.16, 0.04, 14, 5), ink(COL.brass), doorX, 1.45, fz + 0.13);
    add(shop, cyl(0.14, 0.14, 0.04, 12), winGlow, doorX, 1.45, fz + 0.11, PI / 2);
    add(shop, sphere(8), ink(COL.brass), doorX + 0.27, 0.95, fz + 0.15, 0, 0, 0, 0.06);
    add(shop, rbox(1.1, 0.1, 0.4, 0.03), ink(COL.wood3), doorX, 0.06, fz + 0.2);
    // the scalloped striped awning over the window and the door
    {
      const nS = 8;
      const aw = (w + 0.3) / nS;
      for (let i = 0; i < nS; i++) {
        const x = -(w + 0.3) / 2 + aw * (i + 0.5);
        add(shop, rbox(aw + 0.01, 0.06, 1.12, 0.02), ink(i % 2 ? COL.white : PINK2), x, h1 + 0.02, fz + 0.5, 0.36);
        const sc = add(shop, cached('scallop', () => {
          const sh = new THREE.Shape();
          const a2 = 2.7 / 6;
          sh.moveTo(-a2 / 2, 0);
          sh.absarc(0, 0, a2 / 2, PI, TAU, false);
          sh.lineTo(-a2 / 2, 0);
          return slabShape(sh, 0.05, 0.01);
        }), ink(i % 2 ? COL.white : PINK2), x, h1 - 0.19, fz + 1.03);
        sc.scale.set(aw / (2.7 / 6), 1, 1);
      }
      for (const sx of [-1, 1]) rod(shop, thin(COL.iron), V3(sx * (w / 2 + 0.1), h1 + 0.25, fz + 0.03), V3(sx * (w / 2 + 0.1), h1 - 0.17, fz + 1.02), 0.02, 4);
      // (the bunting from the plaza ends up at the corner of the roof's eaves: high over the bridge, the
      // fitting and the crew line-up, above the walk camera, clear of its view of the captain)
      polly.buntingEnd = worldAt(shop, (w + 0.7) / 2 - 0.05, up + h2 + 0.05, (d + 0.8) / 2 - 0.05);
    }
    // the barber pole on a bracket at the front right corner (the striped part spins)
    {
      const px = w / 2 + 0.3;
      const pz = fz + 0.12;
      beam(shop, ink(COL.iron), V3(w / 2 + 0.08, 2.02, pz), V3(px, 2.02, pz), 0.06, 0.06, 0.02);
      beam(shop, ink(COL.iron), V3(w / 2 + 0.08, 1.12, pz), V3(px, 1.12, pz), 0.06, 0.06, 0.02);
      add(shop, sphere(10), ink(COL.brass), px, 2.13, pz, 0, 0, 0, 0.12);
      add(shop, cyl(0.12, 0.1, 0.08, 12), ink(COL.brass), px, 2.03, pz);
      add(shop, cyl(0.1, 0.12, 0.08, 12), ink(COL.brass), px, 1.11, pz);
      const pole = new THREE.Group();
      pole.name = 'barber-pole';
      pole.position.copy(worldAt(shop, px, 1.57, pz));
      pole.userData.keep = true;
      root.add(pole);
      const pg = new THREE.Group();
      pole.add(pg);
      add(pg, cyl(0.085, 0.085, 0.84, 16), ink(COL.white), 0, 0, 0);
      for (let k = 0; k < 2; k++) {
        const pts = [];
        for (let i = 0; i <= 28; i++) {
          const u = i / 28;
          const a = k * PI + u * TAU * 1.5;
          pts.push(V3(Math.cos(a) * 0.084, -0.41 + 0.82 * u, Math.sin(a) * 0.084));
        }
        rope(pg, ink(COL.red), pts, 0.026, 6);
      }
      bake(pole, { force: 'ink' });
      polly.pole = pole;
    }
    // walk: the shop (with its step and the pole's bracket)
    blockBox(shop, 0.12, 0.1, w + 0.6, d + 0.5, 0, up + h2 + 1.5);
    // the camera keeps out of the striped awning over the front (the captain walks under it)
    camBox(shop, 0.07, fz + 0.62, w + 0.45, 1.0, 0, h1 - 0.42, h1 + 0.4);

    // out front: the podium with its rug, the tall mirror, the mannequin; the barber's chair at the side
    const pod = { x: -1.25, z: 1.55 };
    {
      const rg = new THREE.Group();
      rg.position.set(pod.x, y0, pod.z + 0.25);
      g.add(rg);
      const rug = add(rg, cyl(1, 1, 0.025, 24), ink(0x1f8f84), 0, 0.013, 0);
      rug.scale.set(1.05, 1, 0.8);
      const ring = add(rg, torus(1, 0.025, 28, 3), flat(COL.gold), 0, 0.03, 0, PI / 2);
      ring.scale.set(0.9, 0.7, 1);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        add(rg, rbox(0.04, 0.012, 0.16, 0.005), flat(COL.cream), Math.cos(a) * 1.1, 0.012, Math.sin(a) * 0.85, 0, -a + PI / 2, 0);
      }
      const pd = new THREE.Group();
      pd.position.set(pod.x, y0, pod.z);
      g.add(pd);
      // a round wooden step with a red velvet top in a brass ring
      add(pd, cyl(0.6, 0.64, 0.12, 22), ink(COL.woodDark), 0, 0.06, 0);
      add(pd, cyl(0.54, 0.56, 0.07, 22), ink(COL.wood3), 0, 0.155, 0);
      add(pd, cyl(0.5, 0.52, 0.06, 22), ink(0xc8324a), 0, 0.215, 0);
      add(pd, torus(0.51, 0.025, 26, 4), thin(COL.brass), 0, 0.245, 0, PI / 2);
      for (let i = 0; i < 8; i++) add(pd, sphere(6), ink(COL.brass), Math.cos((i / 8) * TAU) * 0.6, 0.06, Math.sin((i / 8) * TAU) * 0.6, 0, 0, 0, 0.035);
      polly.podium = worldAt(g, pod.x, y0 + 0.24, pod.z);
      block(g, pod.x, pod.z, 0.62, 0.25);
    }
    {
      // the tall mirror on a stand, turned to the podium
      const mg = new THREE.Group();
      mg.position.set(-2.75, y0, 1.75);
      mg.rotation.y = Math.atan2(pod.x + 2.75, pod.z - 1.75) - 0.15;
      g.add(mg);
      for (const sx of [-1, 1]) {
        add(mg, rbox(0.1, 1.95, 0.1, 0.03), ink(COL.woodDark), sx * 0.45, 0.98, -0.02);
        add(mg, rbox(0.12, 0.08, 0.6, 0.03), ink(COL.woodDark), sx * 0.45, 0.04, 0);
        add(mg, sphere(8), ink(COL.brass), sx * 0.45, 1.98, -0.02, 0, 0, 0, 0.07);
      }
      const fr = new THREE.Group();
      fr.position.set(0, 1.08, 0.0);
      fr.rotation.x = -0.08;
      mg.add(fr);
      const oval = add(fr, torus(1, 0.055, 24, 4), ink(COL.gold), 0, 0, 0.0);
      oval.scale.set(0.36, 0.78, 1);
      const back = add(fr, cyl(1, 1, 0.05, 20), ink(COL.woodDark), 0, 0, -0.035, PI / 2);
      back.scale.set(0.36, 1, 0.78);
      const glass = add(fr, cyl(1, 1, 0.02, 20), flat(0xbfe9ff), 0, 0, 0.0, PI / 2);
      glass.scale.set(0.34, 1, 0.76);
      for (const [gx, gy, gl] of [[-0.12, 0.28, 0.42], [0.02, 0.36, 0.22], [0.1, -0.3, 0.18]]) {
        add(fr, rbox(0.045, gl, 0.01, 0.005), flat(COL.white), gx, gy, 0.016, 0, 0, -0.55);
      }
      blockBox(mg, 0, 0, 1.1, 0.7, 0, 2.0);
    }
    {
      // the mannequin in a long coat, by the window
      const mq = new THREE.Group();
      mq.position.set(-3.0, y0, 0.55);
      mq.rotation.y = 0.5;
      g.add(mq);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU;
        rod(mq, thin(COL.woodDark), V3(0, 0.35, 0), V3(Math.cos(a) * 0.32, 0.02, Math.sin(a) * 0.32), 0.03, 5);
      }
      rod(mq, ink(COL.woodDark), V3(0, 0.0, 0), V3(0, 1.1, 0), 0.035, 6);
      add(mq, lathe('dressForm', [[0, 1.08], [0.16, 1.12], [0.21, 1.3], [0.18, 1.48], [0.22, 1.62], [0.13, 1.72], [0.05, 1.76], [0, 1.76]], 10), ink(COL.canvas), 0, 0, 0);
      add(mq, sphere(8), ink(COL.wood3), 0, 1.86, 0, 0, 0, 0, [0.09, 0.1, 0.09]);
      // the coat: a long red coat flaring to the knees, gold buttons, cream cuffs and lapels
      add(mq, lathe('longCoat', [[0.17, 1.73], [0.25, 1.66], [0.25, 1.4], [0.22, 1.3], [0.26, 1.0], [0.33, 0.62], [0.31, 0.58], [0.0, 0.58]], 12), ink(0xb3202a), 0, 0, 0);
      for (const sx of [-1, 1]) {
        const lap = add(mq, rbox(0.1, 0.36, 0.04, 0.02), ink(COL.cream), sx * 0.09, 1.52, 0.22, 0.12, 0, sx * 0.35);
        lap.rotation.order = 'ZXY';
        const arm = new THREE.Group();
        arm.position.set(sx * 0.27, 1.6, 0);
        arm.rotation.z = sx * 0.12;
        mq.add(arm);
        add(arm, capsule(0.075, 0.42, 6), ink(0xb3202a), 0, -0.26, 0);
        add(arm, cyl(0.085, 0.085, 0.08, 8), ink(COL.cream), 0, -0.52, 0);
      }
      for (let i = 0; i < 4; i++) add(mq, sphere(6), ink(COL.brass), 0.03, 1.38 - i * 0.16, 0.235 + i * 0.01, 0, 0, 0, 0.03);
      block(g, -3.0, 0.55, 0.38, 1.9);
    }
    {
      // the barber's chair: red leather on a brass pedestal, turned to the plaza
      const bc = new THREE.Group();
      bc.position.set(1.55, y0, -1.15);
      bc.rotation.y = -0.25;
      g.add(bc);
      add(bc, cyl(0.3, 0.36, 0.06, 14), ink(COL.brass), 0, 0.03, 0);
      add(bc, cyl(0.08, 0.1, 0.42, 10), ink(COL.brass), 0, 0.26, 0);
      add(bc, rbox(0.66, 0.18, 0.62, 0.07), ink(0xc8324a), 0, 0.53, 0.02);
      add(bc, rbox(0.62, 0.78, 0.16, 0.07), ink(0xc8324a), 0, 0.98, -0.27, -0.12, 0, 0);
      add(bc, rbox(0.3, 0.14, 0.12, 0.05), ink(COL.cream), 0, 1.43, -0.31, -0.12, 0, 0);
      for (const sx of [-1, 1]) {
        add(bc, rbox(0.1, 0.08, 0.56, 0.03), ink(COL.woodDark), sx * 0.36, 0.78, 0.0);
        rod(bc, thin(COL.brass), V3(sx * 0.36, 0.5, 0.2), V3(sx * 0.36, 0.74, 0.2), 0.025, 5);
      }
      add(bc, rbox(0.42, 0.05, 0.22, 0.02), ink(COL.brass), 0, 0.2, 0.42, 0.3, 0, 0);
      blockBox(bc, 0, 0.05, 0.85, 1.0, 0, 1.5);
      // a little side table with a towel, a comb and a jar of combs
      add(g, cyl(0.24, 0.24, 0.05, 12), ink(COL.wood3), 2.45, y0 + 0.72, -1.7);
      add(g, cyl(0.04, 0.06, 0.7, 8), ink(COL.woodDark), 2.45, y0 + 0.36, -1.7);
      add(g, rbox(0.3, 0.06, 0.2, 0.03), ink(COL.white), 2.4, y0 + 0.78, -1.62);
      add(g, cyl(0.07, 0.06, 0.2, 10), ink(0x8fd6f0), 2.55, y0 + 0.85, -1.78);
      block(g, 2.45, -1.7, 0.28, 0.8);
    }
    // a pot of flowers either side of the door step and a hat box stack by the wall
    for (const [fx, fzz] of [[-0.2, 0.25], [2.85, -2.35]]) {
      add(g, cyl(0.2, 0.15, 0.32, 12), ink(COL.cork), fx, y0 + 0.16, fzz);
      for (let i = 0; i < 4; i++) add(g, sphere(8), ink([COL.pink, COL.yellow, COL.white, COL.red][i]), fx + Math.cos(i * 1.7) * 0.12, y0 + 0.42 + (i % 2) * 0.06, fzz + Math.sin(i * 1.7) * 0.12, 0, 0, 0, 0.1);
      block(g, fx, fzz, 0.22, 0.5);
    }
    for (let i = 0; i < 3; i++) {
      add(g, cyl(0.26 - i * 0.04, 0.26 - i * 0.04, 0.22, 12), ink([0x9b6fd6, 0xf9a8bd, 0x7fd6c6][i]), 0.6 + prand() * 0.04, y0 + 0.11 + i * 0.22, -2.35);
      add(g, torus(0.26 - i * 0.04, 0.02, 12, 3), thin(COL.white), 0.6, y0 + 0.2 + i * 0.22, -2.35, PI / 2);
    }
    block(g, 0.6, -2.35, 0.3, 0.7);
    // The tailor (a place): in front of the podium. The podium, the line-up spots for three sailors
    // (in a row to the right of the door, facing the plaza) and the fitting camera go with it.
    const spot = worldAt(g, -0.25, y0, 2.25);
    const yaw = yawOf(g);
    const podW = polly.podium;
    for (let i = 0; i < 3; i++) {
      const q = worldAt(g, 0.85 + i * 0.85, y0, 0.7);
      polly.lineup.push({ x: r2(q.x), y: r2(q.y), z: r2(q.z), h: r3(yaw) });
    }
    const camT = worldAt(g, pod.x + 0.15, y0 + 1.25, pod.z);
    const camP = worldAt(g, pod.x + 1.6, y0 + 2.5, pod.z + 4.4);
    walkData.places.push({
      id: 'tailor', name: "Polly's Plumes & Trims", x: r2(spot.x), z: r2(spot.z), r: 1.6, face: r3(Math.atan2(podW.x - spot.x, podW.z - spot.z)),
      podium: { x: r2(podW.x), y: r2(podW.y), z: r2(podW.z) }, lineup: polly.lineup,
      cam: { pos: [r2(camP.x), r2(camP.y), r2(camP.z)], target: [r2(camT.x), r2(camT.y), r2(camT.z)] },
    });
    polly.spots = { polly: worldAt(g, -0.35, y0, 1.5), snips: worldAt(g, 2.2, y0, -1.15), yaw };
  }

  // ----- rope bridges (and their walk paths) -----
  // (the tower bridge runs straight west from the end of the walkway past the tavern's west wall)
  const towerFoot = tavernRaft.at(-tavernRaft.w / 2, -3.8);
  const towerLand = towerFoot.clone();
  {
    // where a line straight west (-x) from there meets the tower raft, 0.1 in from its east edge
    towerRaft.g.updateMatrixWorld(true);
    const q = towerRaft.g.worldToLocal(V3(towerFoot.x, 0, towerFoot.z));
    const dirL = towerRaft.g.worldToLocal(V3(towerFoot.x - 1, 0, towerFoot.z)).sub(q);
    towerLand.x -= (towerRaft.w / 2 - 0.1 - q.x) / dirL.x;
  }
  const bridges = {
    plazaS1: bridge(plaza.at(5.6, -4.55), plats.s1.at(0.6, plats.s1.d / 2), { walk: 'plazaS1' }),
    s1S2: bridge(plats.s1.at(3.5, 0.8), plats.s2.at(-2.7, 1.0)),
    tavernTower: bridge(towerFoot, towerLand, { walk: 'tavernTower' }),
    tavernS16: bridge(tavernRaft.at(-tavernRaft.w / 2, 1.5), plats.s16.at(2.7, 0.4)),
    yardS7: bridge(yard.at(2.5, -4.5), plats.s7.at(-1.2, 2.5)),
    plazaGarden: bridge(plaza.at(-8.45, 1.7), V3(GARDEN.x + 3.35, GARDEN.y - 0.05, GARDEN.z - 0.9), { walk: 'plazaGarden' }),
    plazaYard: bridge(plaza.at(8.5, -2.4), yard.at(-4.2, -1.0), { walk: 'plazaYard' }),
    tavernS3: bridge(tavernRaft.at(2.15, -4.5), plats.s3.at(-1.0, 2.7)),
    gardenS13: bridge(V3(GARDEN.x - 2.05, GARDEN.y - 0.1, GARDEN.z + 2.75), plats.s13.at(2.7, -1.1)),
    s13S14: bridge(plats.s13.at(-2.7, -0.8), plats.s14.at(2.6, 1.2)),
    s7S17: bridge(plats.s7.at(2.7, 0.4), plats.s17.at(-3.0, 0.9)),
  };

  // ----- bunting, flags and laundry (fluttering) -----
  function flagOnPole(parent, foot, poleH, len, h, color, ry = 0, kind = 'rect') {
    parent.updateMatrixWorld(true);
    const g = new THREE.Group();
    g.position.copy(foot);
    g.rotation.y = ry;
    parent.add(g);
    add(g, cyl(0.05, 0.07, poleH, 8), ink(COL.woodDark), 0, poleH / 2, 0);
    add(g, sphere(8), ink(COL.brass), 0, poleH + 0.05, 0, 0, 0, 0, 0.1);
    g.updateMatrixWorld(true);
    const s = kind === 'pennant'
      ? new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(len, -h * 0.45), new THREE.Vector2(0, -h)])
      : new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(len, 0), new THREE.Vector2(len * 0.86, -h / 2), new THREE.Vector2(len, -h), new THREE.Vector2(0, -h)]);
    const geo = slabShape(s, 0.04, 0);
    const m = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().copy(root.matrixWorld).invert(), g.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(0.06, poleH - 0.05, 0));
    const ph0 = rand() * TAU;
    flutter.add(geo, color, m, V3(0, 0, 1), (v) => [0.22 * Math.pow(Math.max(0, v.x) / len, 1.1) * h, ph0 - (v.x / len) * 2.6]);
    geo.dispose();
  }
  function bunting(a, b, sag, o = {}) {
    const pts = sagCurve(a, b, sag, 24);
    rope(statics, thin(COL.rope), pts, 0.025, 4);
    const curve = new THREE.CatmullRomCurve3(pts);
    const len = curve.getLength();
    const n = Math.max(2, Math.floor(len / (o.step ?? 0.55)));
    const cols = o.colors ?? FLAGS;
    const tri = cached('buntingTri', () => {
      const s = new THREE.Shape([new THREE.Vector2(-0.19, 0), new THREE.Vector2(0.19, 0), new THREE.Vector2(0, -0.46)]);
      return slabShape(s, 0.03, 0);
    });
    const ph0 = rand() * TAU;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const p = curve.getPointAt(u);
      const t = curve.getTangentAt(u);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const yaw = Math.atan2(t.x, t.z) - PI / 2; // shape x along the line
      q.setFromEuler(new THREE.Euler(0, yaw, 0));
      m4.compose(p, q, V3(1, 1, 1));
      flutter.add(tri, cols[i % cols.length], m4, V3(0, 0, 1), (v) => [Math.max(0, -v.y) * 0.5, ph0 + i * 0.7]);
    }
  }
  function laundry(a, b, sag, items) {
    const pts = sagCurve(a, b, sag, 20);
    rope(statics, thin(COL.white), pts, 0.022, 4);
    const curve = new THREE.CatmullRomCurve3(pts);
    const shapes = {
      shirt: () => new THREE.Shape([[-0.22, 0], [-0.42, -0.08], [-0.48, -0.26], [-0.32, -0.3], [-0.26, -0.22], [-0.24, -0.72], [0.24, -0.72], [0.26, -0.22], [0.32, -0.3], [0.48, -0.26], [0.42, -0.08], [0.22, 0], [0.1, -0.06], [-0.1, -0.06]].map(([x, y]) => new THREE.Vector2(x, y))),
      pants: () => new THREE.Shape([[-0.26, 0], [0.26, 0], [0.3, -0.85], [0.08, -0.85], [0, -0.3], [-0.08, -0.85], [-0.3, -0.85]].map(([x, y]) => new THREE.Vector2(x, y))),
      sock: () => new THREE.Shape([[-0.08, 0], [0.08, 0], [0.08, -0.36], [0.2, -0.42], [0.18, -0.52], [-0.08, -0.5]].map(([x, y]) => new THREE.Vector2(x, y))),
      sheet: () => new THREE.Shape([[-0.42, 0], [0.42, 0], [0.4, -0.9], [-0.44, -0.86]].map(([x, y]) => new THREE.Vector2(x, y))),
    };
    const ph0 = rand() * TAU;
    for (let i = 0; i < items.length; i++) {
      const [kind, color, stripe] = items[i];
      const u = (i + 0.5) / items.length;
      const p = curve.getPointAt(u);
      const t = curve.getTangentAt(u);
      const m4 = new THREE.Matrix4().compose(p.clone().add(V3(0, -0.02, 0)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(t.x, t.z) - PI / 2, 0)), V3(1, 1, 1));
      const geo = cached(`laundry-${kind}`, () => slabShape(shapes[kind](), 0.03, 0));
      const wf = (v) => [Math.max(0, -v.y) * 0.32, ph0 + i * 0.9 + v.x * 0.8];
      flutter.add(geo, color, m4, V3(0, 0, 1), wf);
      if (stripe) {
        for (let k = 0; k < 3; k++) {
          const sg = cached(`laundry-stripe-${kind}`, () => new RoundedBoxGeometry(0.5, 0.07, 0.05, 1, 0.02));
          const ms = m4.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.3 - k * 0.15, 0));
          flutter.add(sg, stripe, ms, V3(0, 0, 1), (v) => wf(V3(v.x, v.y - 0.3 - k * 0.15, v.z)));
        }
      }
      // clothes pegs
      add(statics, rbox(0.05, 0.12, 0.05, 0.015), thin(COL.wood3), p.x, p.y - 0.03, p.z);
    }
  }
  // bunting over the plaza and along the pier
  bunting(V3(-8.0, DECK + 2.55, -6.1), V3(-3.0, DECK + 2.5, -11.6), 0.5);
  bunting(welcomePost, V3(8.0, DECK + 2.55, -6.1), 0.7);
  tavernG.updateMatrixWorld(true);
  // (the two strings over the plaza's south corners run from tall masts up to the corners of the
  // tavern's upper floor and of Polly's roof: above the walk camera, clear of its view of the captain)
  const mast = (x, z) => {
    const m = V3(x, DECK, z);
    add(statics, cyl(0.06, 0.085, 5.5, 8), ink(COL.woodDark), m.x, DECK + 2.75, m.z);
    add(statics, rbox(0.26, 0.12, 0.26, 0.04), ink(COL.woodDark), m.x, DECK + 0.06, m.z);
    add(statics, sphere(8), ink(COL.brass), m.x, DECK + 5.55, m.z, 0, 0, 0, 0.1);
    walkData.blockers.push({ x: r2(m.x), z: r2(m.z), r: 0.12, h: 5.6 });
    return V3(m.x, DECK + 5.3, m.z);
  };
  bunting(mast(-8.25, -14.68), tavernG.localToWorld(V3(-4.35, 3.1 + 2.35, 3.32)), 0.4);
  bunting(mast(8.25, -14.68), polly.buntingEnd, 0.4);
  // (along the pier's back rail: tight enough to clear a captain's hat in its gaps)
  bunting(V3(-10.4, DECK + 2.55, -5.35), V3(-5.8, DECK + 2.55, -5.35), 0.22);
  bunting(V3(5.8, DECK + 2.55, -5.35), V3(10.4, DECK + 2.55, -5.35), 0.22);
  tavernG.updateMatrixWorld(true);
  bunting(towerRaft.at(1.15, 1.15, TOWER_H + 1.0), tavernG.localToWorld(V3(-4.6, 3.1 + 2.8, -1.4)), 1.0, { step: 0.6 });
  // laundry between the shacks
  laundry(plats.s2.at(-2.4, 2.2, 2.0), plats.s2.at(2.4, 2.3, 1.9), 0.25, [['shirt', COL.white, COL.red], ['pants', COL.blue], ['sock', COL.red], ['sock', COL.yellow], ['shirt', COL.yellow]]);
  laundry(plats.s4.at(-2.4, 2.2, 1.9), plats.s4.at(2.4, 2.2, 2.1), 0.2, [['sheet', COL.white], ['shirt', COL.pink], ['pants', COL.woodDark], ['sock', COL.teal]]);
  laundry(plats.s7.at(-2.3, 2.3, 2.0), plats.s7.at(2.3, 2.1, 2.0), 0.2, [['shirt', COL.white, COL.blue], ['shirt', COL.green], ['sock', COL.orange], ['pants', COL.navy]]);
  laundry(plats.s8.at(-2.2, 2.4, 1.8), plats.s8.at(2.2, 2.2, 1.9), 0.18, [['sheet', COL.cream], ['sock', COL.red], ['shirt', COL.purple]]);
  for (const pn of ['s2', 's4', 's7', 's8']) {
    const P = plats[pn];
    for (const sx of [-1, 1]) {
      const a = P.at(sx * (P.w / 2 - 0.25), P.d / 2 - 0.35);
      add(statics, cyl(0.07, 0.09, 2.5, 8), ink(COL.woodDark), a.x, P.y + 1.15, a.z);
    }
  }
  // flags on the shacks
  flagOnPole(plats.s5.g, V3(1.6, plats.s5.y + 2.8 + 2.6 + 1.5, -1.0), 1.4, 1.2, 0.8, COL.blue, 0.2);
  flagOnPole(plats.s12.g, V3(-1.0, plats.s12.y + 3.0 + 2.8 + 1.6, -1.0), 1.6, 1.3, 0.85, COL.green, -0.1);
  flagOnPole(yard.g, V3(3.6, DECK, -4.0), 4.2, 1.4, 0.9, COL.black, -0.4);

  // ----- rowboats moored around the town (bobbing) -----
  for (const [x, z, ry, c, trim] of [
    [-11.2, -1.6, 0.4, COL.red, COL.white],
    [12.4, -2.2, -0.2, COL.teal, COL.yellow],
    [-19.5, -12.5, 1.2, COL.yellow, COL.blue],
    [8.4, -16.4, 1.5, COL.blue, COL.white],
    [-1.5, -15.5, 1.65, COL.green, COL.white],
  ]) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    g.userData.keep = true;
    g.userData.base = { x, z };
    g.userData.phase = rand() * 6;
    root.add(g);
    const b = rowboat(g, c, trim);
    b.position.y = 0.45;
    for (const sx of [-0.3, 0.3]) {
      const oar = add(b, rbox(0.12, 0.08, 2.8, 0.03), ink(COL.wood3), sx, 0.0, -0.2);
      oar.rotation.y = sx * 0.1;
    }
    bake(g, { force: 'thin' });
    anim.boats.push(g);
  }

  // ----- a visiting cutter riding at anchor off the east arm -----
  {
    const ship = buildShip('cutter');
    ship.userData.base = { x: 28.5, z: -13.5, h: -PI / 2 + 0.35 };
    root.add(ship);
    anim.visitor = ship;
  }

  // ----- gulls: an instanced flock and two on posts -----
  {
    const [bodyGeo, wingGeo] = gullGeometries();
    const N = 6;
    const body = new THREE.InstancedMesh(bodyGeo, vcMaterial('ink'), N);
    const wings = new THREE.InstancedMesh(wingGeo, vcMaterial('ink'), N);
    body.frustumCulled = wings.frustumCulled = false;
    body.userData.keep = wings.userData.keep = true;
    root.add(body, wings);
    const birds = [];
    const flocks = [
      { c: [-6, 14, -14], r: 9, n: 2 },
      { c: [6, 12, -8], r: 13, n: 2 },
      { c: [-15, 18, -18], r: 5, n: 1 },
      { c: [16, 11, -12], r: 6, n: 1 },
    ];
    let k = 0;
    for (const f of flocks) {
      for (let i = 0; i < f.n; i++) {
        birds.push({ c: f.c, r: f.r * (0.8 + 0.4 * rand()), w: (0.35 + rand() * 0.15) * (k % 2 ? -1 : 1) * Math.sqrt(10 / f.r), ph: rand() * TAU, fl: rand() * 10, dy: (rand() - 0.5) * 3 });
        k++;
      }
    }
    anim.gulls = { body, wings, birds, m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(0, 0, 0, 'YXZ'), p: V3(), s: V3() };
    // perched gulls (static)
    for (const [x, y, z, ry] of [[-10.4, DECK + 2.62, -5.35, 0.6], [10.95, DECK + 0.25, -5.65, -0.8]]) {
      const pg = new THREE.Group();
      pg.position.set(x, y + 0.35 * 0.55, z);
      pg.rotation.y = ry;
      pg.scale.setScalar(0.55);
      statics.add(pg);
      add(pg, bodyGeo, vcMaterial('ink'));
      const w = add(pg, wingGeo, vcMaterial('ink'), 0, 0.15, -0.05);
      w.scale.set(0.45, 0.3, 1);
    }
  }

  // ----- chimney smoke (instanced puffs) -----
  {
    const per = 6;
    const n = anim.smokeSrc.length * per;
    const puff = new THREE.InstancedMesh(sphere(10), toon(COL.smoke, { outline: THIN }), Math.max(1, n));
    puff.frustumCulled = false;
    puff.userData.keep = true;
    root.add(puff);
    root.updateMatrixWorld(true);
    for (const s of anim.smokeSrc) s.world = s.obj.localToWorld(s.local.clone());
    anim.smoke = { puff, per, m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: V3(), s: V3() };
  }

  // ----- bake the statics -----
  bake(statics);
  const flutterMeshes = flutter.build(root);
  statics.traverse((o) => {
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  });

  // ----- townsfolk -----
  // Seen from the showcase camera they are only a few dozen pixels tall: the light build (a third of
  // the triangles) looks the same there. The crew aboard the ship, much closer, keeps full detail.
  const folk = [];
  function person(opts, action, pos, h, aopts = {}) {
    const p = buildPerson({ ...opts, detail: 'low' });
    p.position.copy(pos);
    p.rotation.y = h;
    root.add(p);
    const f = { p, action, aopts, h0: h };
    folk.push(f);
    return f;
  }
  function walker(opts, path, o = {}) {
    const p = buildPerson({ ...opts, detail: 'low' });
    root.add(p);
    const pts = path.map((q) => q.clone());
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const f = { p, action: o.action ?? 'walk', aopts: { speed: o.speed ?? 1 }, path: pts, cum, L: cum[cum.length - 1], loop: !!o.loop, pause: o.pause ?? 1.5, off: o.off ?? 0, v: walkSpeed(p, o.action ?? 'walk', o.speed ?? 1) };
    folk.push(f);
    return f;
  }
  const at = (x, z, y = DECK) => V3(x, y, z);
  // the plaza
  person({ kind: 'woman', seed: 301, hat: 'kerchief' }, (t) => (t % 9 < 2.4 ? 'wave' : 'idle'), at(-3.2, STALL_Z - 0.55), 0); // fruit seller
  person({ kind: 'man', seed: 302, hat: 'cap' }, 'idle', at(0.6, STALL_Z - 0.55), 0); // fishmonger
  person({ kind: 'old', seed: 303 }, (t) => (t % 11 < 2 ? 'wave' : 'idle'), at(4.4, STALL_Z - 0.55), 0.1); // potter
  person({ kind: 'woman', seed: 304, hat: 'straw' }, 'idle', at(-2.7, STALL_Z + 1.6), PI + 0.3); // a customer
  person({ kind: 'pirate', seed: 305, tool: 'fiddle', hat: 'tricorn' }, 'fiddle', at(-4.2, -8.8), 0.5); // fiddler by the sign
  person({ kind: 'kid', seed: 306 }, 'cheer', at(-3.0, -8.3), -0.6); // a kid dancing to the fiddle
  // on the plaza benches (plaza-local (-7.5, 3.2) and (6.8, -1.6); seat top ~ SEAT_HEIGHT)
  person({ kind: 'old', seed: 307 }, 'sit', at(-7.35, -10.25 + 3.2), PI / 2); // grandpa
  person({ kind: 'woman', seed: 308 }, 'sit', at(6.65, -10.25 - 1.6), -PI / 2);
  // kids running round the water barrels
  const ring = (cx, cz, r, y = DECK, n = 16, a0 = 0) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * TAU;
      pts.push(V3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
    }
    return pts;
  };
  walker({ kind: 'kid', seed: 311 }, ring(5.55, -7.6, 1.5), { loop: true, speed: 1.7 });
  walker({ kind: 'kid', seed: 312 }, ring(5.55, -7.6, 1.5), { loop: true, speed: 1.7, off: 1.6 });
  // a porter carrying a crate from the pier to the stalls and back
  walker({ kind: 'man', seed: 313, tool: 'crate', hat: 'straw' }, [at(1.8, -5.2), at(1.2, -8.0), at(0.4, -10.9)], { action: 'carry', pause: 1.2 });
  // a pirate strolling along the pier
  walker({ kind: 'pirate', seed: 314, hat: 'bandana' }, [at(-8.7, -4.75), at(-7.0, -5.0), at(-6.2, -7.8)], { pause: 2 });
  // fishing off the pier ends
  person({ kind: 'old', seed: 315, tool: 'rod' }, 'fish', at(-8.0, -3.25, DECK - SEAT_HEIGHT * 0.96), 0);
  person({ kind: 'kid', seed: 316, tool: 'rod' }, 'fish', at(10.3, -3.25, DECK - SEAT_HEIGHT * 0.78 * 0.96), 0.15);
  // the tavern: a pirate leaning on the rail, two at the table, a waving barmaid on the balcony
  person({ kind: 'pirate', seed: 321, hat: 'tricorn', pegLeg: true }, 'lean', tavernRaft.at(10.5 / 2 - 0.12 - RAIL.z, 2.2), PI / 2);
  {
    tavernG.updateMatrixWorld(true);
    const T = (x, y, z) => tavernG.localToWorld(V3(x, y, z));
    const ry = tavernG.rotation.y;
    person({ kind: 'man', seed: 322 }, 'sit', T(2.9 - 0.95, 0, 2.7 + 1.5), ry + PI / 2);
    person({ kind: 'pirate', seed: 323, hat: 'bandana' }, 'sit', T(2.9 + 0.95, 0, 2.7 + 1.5), ry - PI / 2);
    // on the balcony (floor 3.36 up, rail 0.34 in front)
    person({ kind: 'woman', seed: 324 }, (t) => (t % 7 < 3 ? 'wave' : 'lean'), T(-1.4, 3.1 + 0.26, 0.35 + 3.53 - 0.01), ry);
    person({ kind: 'pirate', seed: 325, hat: 'bandana', beard: true }, 'lean', T(2.2, 3.1 + 0.26, 0.35 + 3.53 - 0.01), ry);
  }
  // the lookout waving from the crow's nest
  {
    const base = towerRaft.at(0, 0);
    person({ kind: 'pirate', seed: 331, hat: 'tricorn' }, (t) => (t % 6 < 3.5 ? 'wave' : 'idle'), V3(base.x + 0.4, base.y + TOWER_H + 0.15, base.z + 0.6), 0.3);
  }
  // the shipwright hammering at the slipway, a crane hand at the winch
  person({ kind: 'man', seed: 341, tool: 'hammer', hat: 'cap' }, 'hammer', yard.at(0.2, 0.3), PI - 0.2);
  person({ kind: 'pirate', seed: 342, hat: 'bandana' }, (t) => (t % 10 < 5 ? 'idle' : 'wave'), yard.at(-1.0, 3.6), 0.4);
  // folk on the shack porches and the garden
  person({ kind: 'woman', seed: 351, hat: 'straw' }, (t) => (t % 8 < 2.5 ? 'wave' : 'idle'), plats.s2.at(-1.0, 1.9), 0.1);
  person({ kind: 'old', seed: 352 }, 'idle', plats.s2.at(1.2, 1.8), -0.3);
  person({ kind: 'woman', seed: 357, hat: 'kerchief' }, (t) => (t % 10 < 3 ? 'wave' : 'idle'), plats.s17.at(1.3, 2.0), -0.5);
  person({ kind: 'man', seed: 355, hat: 'straw' }, (t) => (t % 9 < 3 ? 'wave' : 'idle'), plats.s13.at(1.0, 1.7), 0.9);
  person({ kind: 'pirate', seed: 356, tool: 'rod', hat: 'bandana' }, 'fish', plats.s14.at(0.6, 2.6 - 0.1, -SEAT_HEIGHT * 0.96), 0.25);
  person({ kind: 'kid', seed: 353 }, 'cheer', V3(GARDEN.x - 1.2, GARDEN.y + 0.06, GARDEN.z + 1.5), 0.6);
  person({ kind: 'woman', seed: 354, hat: 'straw' }, 'sit', V3(GARDEN.x + 1.5, GARDEN.y + 0.23 - SEAT_HEIGHT + 0.02, GARDEN.z + 2.1), 0.0);
  // a fisherman in a rowboat swinging at anchor off the garden
  {
    const g = new THREE.Group();
    const x = -15.2;
    const z = 4.6;
    g.position.set(x, 0, z);
    g.rotation.y = 0.9;
    g.userData.keep = true;
    g.userData.base = { x, z };
    g.userData.phase = 2.2;
    g.userData.swing = 0.9;
    root.add(g);
    const hull = new THREE.Group();
    g.add(hull);
    const b = rowboat(hull, COL.orange, COL.white, 3.0, 1.35, 0.55);
    b.position.y = 0.42;
    for (const sx of [-0.28, 0.28]) add(b, rbox(0.12, 0.08, 2.6, 0.03), ink(COL.wood3), sx, -0.02, -0.25, 0, sx * 0.1, 0);
    add(b, cyl(0.16, 0.13, 0.3, 10), ink(COL.wood2), -0.3, -0.25, 0.75);
    rope(b, thin(COL.rope), [V3(0, 0.1, 1.35), V3(0, -0.1, 1.75), V3(0, -0.35, 2.0)], 0.025, 4);
    bake(hull, { force: 'thin' });
    anim.boats.push(g);
    const f = person({ kind: 'old', seed: 371, tool: 'rod', hat: 'straw' }, 'fish', V3(0, 0, 0), 0);
    g.add(f.p);
    // seated on the aft thwart, facing over the side
    f.p.position.set(0.05, 0.42 - 0.1 - SEAT_HEIGHT * f.p.scale.x, 3.0 * -0.22 + 0.05);
    f.p.rotation.y = PI / 2;
  }
  // Polly measuring by the podium, Old Snips snipping by his barber's chair
  {
    const S = polly.spots;
    polly.npc = {
      polly: person({ kind: 'woman', seed: 383, tool: 'tape', hat: 'none', shirt: 0xf58fb0 }, 'measure', S.polly, S.yaw - PI / 2 + 0.25),
      snips: person({ kind: 'old', seed: 390, tool: 'scissors', hat: 'none', shirt: 0xfaf3e3 }, 'snip', S.snips, S.yaw - PI / 2 - 0.35),
    };
  }
  // a walker crossing the bridge from the plaza to Polly's
  walker({ kind: 'woman', seed: 361, tool: 'bucket' }, [plaza.at(6.4, -3.3), ...bridges.plazaS1, plats.s1.at(0.6, 2.2)], { pause: 2.5 });
  walker({ kind: 'man', seed: 362, hat: 'straw' }, [...bridges.plazaYard, yard.at(-2.6, -1.4)], { pause: 2, off: 3 });

  // The showcase camera (main.js sways it across yaw ± yawRange): high enough to look over the near
  // bulwark at the crew mopping the deck, with the town and its people rising behind the ship.
  const VIEW = { target: [0.4, 3.3, -1.2], yaw: 0.15, yawRange: 0.42, dist: 17, height: 5.5 };
  // A world point in the docked ship's frame (ship-local; the ship lies at the berth).
  const toShip = (wx, wy, wz) => {
    const c = Math.cos(BERTH.h);
    const sn = Math.sin(BERTH.h);
    const x = wx - BERTH.x;
    const z = wz - BERTH.z;
    return V3(x * c - z * sn, wy, x * sn + z * c);
  };
  // Where that camera is in the ship's frame, across its sway (u -1..1).
  const cameraSpots = (us = [0, -0.7, 0.7]) =>
    us.map((u) => {
      const a = VIEW.yaw + VIEW.yawRange * u;
      return toShip(VIEW.target[0] + Math.sin(a) * VIEW.dist, VIEW.target[1] + VIEW.height, VIEW.target[2] + Math.cos(a) * VIEW.dist);
    });

  // ----- the cleaning crew (rides on the docked ship) -----
  const crewRig = new THREE.Group();
  crewRig.name = 'sparrow-crew';
  const crew = [];
  const addCrew = (role, opts, action, aopts = {}) => {
    const p = buildPerson(opts);
    crewRig.add(p);
    const c = { role, base: opts, opts, p, action, aopts };
    crew.push(c);
    return c;
  };
  const cMopA = addCrew('mopA', { kind: 'pirate', tool: 'mop', hat: 'bandana', seed: 11 }, 'mop');
  const cMopB = addCrew('mopB', { kind: 'pirate', tool: 'mop', hat: 'tricorn', seed: 23, beard: true }, 'mop', { phase: 1.3 });
  const cPolish = addCrew('polish', { kind: 'pirate', tool: 'brush', seed: 41, hat: 'none', shirt: 0x3f8fd8 }, 'scrub', { wall: true });
  const cBosun = addCrew('bosun', { kind: 'pirate', tool: 'bucket', seed: 13, hat: 'tricorn' }, 'walk');
  const cPlank = addCrew('plank', { kind: 'pirate', tool: 'brush', seed: 5, hat: 'bandana' }, 'scrub', { wall: true });
  const cBoat = addCrew('boat', { kind: 'kid', tool: 'brush', seed: 2 }, 'scrub', { wall: true });
  // Dress the crew (the uniform chosen at Polly's): fn(role, seed, baseOpts) -> buildPerson opts. Each
  // sailor keeps his body, his tool, his job and his place; only the ones whose look changes are
  // rebuilt (the old one disposed). The default uniform hands back the base opts: today's crew exactly.
  const sameOpts = (a, b) => {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined).sort();
    const kb = Object.keys(b).filter((k) => b[k] !== undefined).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && JSON.stringify(a[k]) === JSON.stringify(b[k]));
  };
  function setCrewStyle(fn) {
    let moved = false;
    for (const c of crew) {
      let o = c.base;
      if (typeof fn === 'function') {
        try {
          const r = fn(c.role, c.base.seed, { ...c.base });
          if (r && typeof r === 'object') o = { ...r, kind: c.base.kind, tool: c.base.tool, seed: c.base.seed };
        } catch (e) {
          o = c.base;
        }
      }
      if (sameOpts(o, c.opts)) continue;
      const old = c.p;
      const p = buildPerson(o);
      p.position.copy(old.position);
      p.rotation.copy(old.rotation);
      if (Math.abs(p.scale.x - old.scale.x) > 1e-6) moved = true;
      crewRig.add(p);
      disposePerson(old);
      c.p = p;
      c.opts = o;
    }
    // (a different build would need the crew placed afresh on the ship)
    if (moved && crewState.ship) setShip(crewState.ship);
  }
  const crewProps = new THREE.Group(); // plank, ropes, rowboat, suds (baked per ship)
  crewRig.add(crewProps);
  const bubbleMat = toon(COL.bubble, { outline: { thickness: 0.0028 }, transparent: true, opacity: 0.82 });
  const NB = 44;
  const bubbles = new THREE.InstancedMesh(sphere(10), bubbleMat, NB);
  bubbles.frustumCulled = false;
  const shine = new THREE.InstancedMesh(sphere(6), flat(COL.white), NB);
  shine.frustumCulled = false;
  crewRig.add(bubbles, shine);
  const emitters = []; // {p: Vector3 (ship-local), r: spread, rise, n}
  const crewState = { bosunPath: null, ship: null };

  // The crew works on the camera side of the docked ship: its local -x (port, towards the open water).
  const S = -1;
  let probe = null; // hullProbe of the current ship's camera side (set up in setShip)
  // x of the hull skin at (z, y) on the camera side (ship-local), as a ray from outside would find it
  const hullX = (z, y) => probe(z, y);
  // Gun barrels stick out of the hull side at about y = 0.8 (how many, and how big, depends on the
  // upgrades): at port height a barrel reaches well past the bare hull just below the ports.
  const barrelAt = (z) => {
    const port = hullX(z, 0.8);
    const bare = hullX(z, 0.52);
    return port !== null && bare !== null && (port - bare) * S > 0.16;
  };
  // The barrel-free stretch of hull around z (at most `reach` either way), to 0.05.
  function gapAround(z, reach) {
    let lo = z;
    let hi = z;
    while (lo > z - reach && !barrelAt(lo - 0.05)) lo -= 0.05;
    while (hi < z + reach && !barrelAt(hi + 0.05)) hi += 0.05;
    return [lo, hi];
  }
  // A spot along the hull, near `prefer`, with `clear` units of bare hull either side.
  function freeZ(zMin, zMax, prefer, clear) {
    const zs = [];
    const busy = [];
    for (let z = zMin - 1; z <= zMax + 1 + 1e-6; z += 0.1) {
      zs.push(z);
      busy.push(barrelAt(z));
    }
    let best = null;
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      if (z < zMin || z > zMax) continue;
      let ok = true;
      for (let j = 0; j < zs.length && ok; j++) if (busy[j] && Math.abs(zs[j] - z) < clear) ok = false;
      if (ok && (best === null || Math.abs(z - prefer) < Math.abs(best - prefer))) best = z;
    }
    return best ?? prefer;
  }
  function setShip(mesh) {
    if (crewRig.parent) crewRig.parent.remove(crewRig);
    crewState.ship = mesh || null;
    if (!mesh) return;
    probe = hullProbe(mesh, -1);
    const u = mesh.userData || {};
    const ds = u.deckSpots || [];
    const hs = u.hullSpots || [];
    const spot = (i, fb) => ds[i] || fb;
    // clear the old props
    for (const c of [...crewProps.children]) {
      crewProps.remove(c);
      c.traverse((o) => o.isMesh && o.geometry.dispose());
    }
    emitters.length = 0;
    const props = new THREE.Group();
    crewProps.add(props);
    const place = (c, p, h) => {
      c.p.position.set(p.x, p.y, p.z);
      c.p.rotation.y = h;
    };
    const a = spot(2, { x: 0.85, y: 1.2, z: -0.15 });
    const b = spot(1, { x: 0, y: 1.2, z: 3.45 });
    const w = spot(3, { x: -0.8, y: 1.2, z: -0.15 });
    const q0 = spot(4, { x: 0.85, y: 2.58, z: -4.05 });
    const q1 = spot(5, { x: -0.85, y: 2.58, z: -4.05 });
    // how far a deck point (ship-local x, z) is from the deck props (u.blockers, they change with
    // the upgrades) and from the inside of the bulwarks (the hull is symmetric)
    const blockers = u.blockers || [];
    const propClear = (x, z) => {
      let d = Infinity;
      for (const k of blockers) d = Math.min(d, k.r !== undefined ? Math.hypot(x - k.x, z - k.z) - k.r : Math.max(Math.abs(x - k.x) - k.hx, Math.abs(z - k.z) - k.hz));
      return d;
    };
    const clearOf = (x, z, r) => propClear(x, z) > r;
    // The moppers. A mop sweeps a wide arc (about 1.4 across) ahead of its mopper, so each mopper is
    // stood and turned where the whole sweep stays on open deck (clear of the props, which change with
    // the upgrades, of the other mopper and of the bulwarks) and the camera can see it over the near
    // bulwark; facing the camera as much as that allows, near his usual spot.
    const mopLocal = (c) => {
      place(c, { x: 0, y: 0, z: 0 }, 0);
      const pts = [];
      for (let i = 0; i < 8; i++) {
        animatePerson(c.p, i * 0.25, 'mop', c.aopts); // one 2 s stroke, there and back (any phase)
        pts.push(c.p.userData.parts.tool.getWorldPosition(V3())); // crewRig has no parent here: ship-local
      }
      return pts;
    };
    // What the showcase camera really sees of the deck, and where the deck is really clear: both from
    // the ship's own triangles, which change with every upgrade (guns, props, rigging, sails).
    const tris = shipTriangles(mesh);
    const SWAY = [-0.9, -0.55, -0.2, 0.2, 0.55, 0.9];
    const spots = cameraSpots(SWAY);
    const deckY = Number.isFinite(u.deckY) ? u.deckY : a.y;
    // (only the part of the picture where the decks are matters)
    const region = [];
    for (const x of [-2, 2]) for (const y of [deckY, q0.y + 0.4]) for (const z of [-5.6, 5.2]) region.push(V3(x, y, z));
    // (only what can come between the camera and the decks: nothing wholly below the main deck, nor
    // past the far bulwark)
    const near = [];
    for (let i = 0; i < tris.length; i += 9) {
      if (Math.max(tris[i + 1], tris[i + 4], tris[i + 7]) < deckY + 0.05) continue;
      if (Math.min(tris[i], tris[i + 3], tris[i + 6]) * -S > 2.2) continue;
      for (let j = 0; j < 9; j++) near.push(tris[i + j]);
    }
    const nearTris = new Float32Array(near);
    const views = spots.map((c) => viewProbe(nearTris, c, toShip(...VIEW.target), region));
    // which of the camera's sway spots see a mop head at (x, y, z) (ship-local): a bit each
    const seenBy = (x, y, z) => {
      let bits = 0;
      for (let k = 0; k < views.length; k++) if (views[k](x, y + 0.1, z)) bits |= 1 << k;
      return bits;
    };
    // ... unless a crewman stands in the way (a body ~1.8 tall, 0.38 round)
    const bodyHides = (C, hx, hy, hz, others) => {
      const dx = hx - C.x;
      const dz = hz - C.z;
      const L2 = dx * dx + dz * dz;
      for (const o of others) {
        const t = ((o.x - C.x) * dx + (o.z - C.z) * dz) / L2;
        if (t <= 0 || t >= 1) continue;
        const y = C.y + (hy + 0.1 - C.y) * t;
        if (y < o.y + 1.8 && Math.hypot(C.x + dx * t - o.x, C.z + dz * t - o.z) < 0.38) return true;
      }
      return false;
    };
    // the polisher kneels at the waist, scrubbing the inside of the bulwark: as close to it as
    // the deck props allow
    const wallX = hullX(w.z, 1.5);
    let px = w.x;
    if (wallX !== null) {
      const want = wallX - S * (0.13 + WALL_Z * cPolish.p.scale.x);
      for (let k = 0; k <= 8; k++) {
        const x = want + (w.x - want) * (k / 8);
        if (clearOf(x, w.z, 0.32)) {
          px = x;
          break;
        }
      }
    }
    place(cPolish, { x: px, y: w.y, z: w.z }, -PI / 2);
    const bodies = [V3(px, w.y, w.z)]; // the crew on deck so far
    const mops = []; // and where their mop heads go
    // A deck level the moppers may work on: maps on a 0.1 grid (ship-local x, z) of the room round
    // each point (to the props really there at mop height, and to the level's edges) and of which
    // camera spots see a mop head there.
    const level = (name, y, x0, z0, nx, nz, edge) => {
      const occ = deckOccupancy(tris, y, { X0: x0 - 0.3, Z0: z0 - 0.3, NX: Math.ceil((nx * 0.1 + 0.6) / 0.05), NZ: Math.ceil((nz * 0.1 + 0.6) / 0.05) });
      const room = new Float32Array(nx * nz);
      const seen = new Uint8Array(nx * nz);
      for (let iz = 0; iz < nz; iz++) {
        for (let ix = 0; ix < nx; ix++) {
          const x = x0 + ix * 0.1;
          const z = z0 + iz * 0.1;
          const r = Math.min(occ.at(x, z), edge(x, z));
          room[iz * nx + ix] = r;
          if (r > 0.1) seen[iz * nx + ix] = seenBy(x, y, z);
        }
      }
      const cell = (x, z) => {
        const ix = Math.round((x - x0) / 0.1);
        const iz = Math.round((z - z0) / 0.1);
        return ix >= 0 && ix < nx && iz >= 0 && iz < nz ? iz * nx + ix : -1;
      };
      return {
        name, y, occ, x0, z0, nx, nz, room, seen,
        roomAt: (x, z) => {
          const i = cell(x, z);
          return i < 0 ? -1 : room[i] - 0.05; // (less half a cell)
        },
        seenAt: (x, z) => {
          const i = cell(x, z);
          return i < 0 ? 0 : seen[i];
        },
      };
    };
    // the main deck: inside the bulwarks, clear of the props (u.blockers too)
    const main = level('main', deckY, -1.6, -3.6, 33, 92, (x, z) => {
      const hx = hullX(z, 1.5);
      return Math.min(propClear(x, z), hx === null ? -1 : hx * S - 0.14 - Math.abs(x));
    });
    crewRig.userData.occupancy = { taken: main.occ.taken, ...main.occ.grid };
    crewRig.userData.maps = { G0X: main.x0, G0Z: main.z0, GNX: main.nx, GNZ: main.nz, cell: 0.1, room: main.room, seen: main.seen, views: SWAY.length };
    // the quarterdeck (the stern castle's roof), a last resort on a deck crowded by the upgrades: inside
    // its rails, where the bosun leaves it room (he paces only the near half of his beat then)
    const castle = (u.blockers || []).find((k) => k.hx !== undefined && k.hx > 1 && k.z < -2);
    let quarter = null;
    // (with a mopper up there the bosun paces along the taffrail instead, behind them from the camera)
    const sternZ = castle ? castle.z - castle.hz + 0.38 : q0.z;
    const sternBeat = [];
    for (let k = 0; k <= 6; k++) sternBeat.push({ x: q0.x + (q1.x - q0.x) * (k / 6), y: q0.y, z: sternZ });
    const bosunBeat = { stern: false };
    const quarterLevel = () => {
      if (quarter !== null || !castle) return quarter;
      quarter = level('quarter', q0.y, castle.x - castle.hx, castle.z - castle.hz, Math.round((2 * castle.hx) / 0.1) + 1, Math.round((2 * castle.hz) / 0.1) + 1, (x, z) =>
        Math.min(castle.hx - 0.15 - Math.abs(x - castle.x), castle.hz - 0.15 - Math.abs(z - castle.z)));
      return quarter;
    };
    // (the bosun pacing the quarterdeck can stand between the camera and a mop too)
    const fullBeat = [];
    for (let k = 0; k <= 6; k++) fullBeat.push({ x: q0.x + (q1.x - q0.x) * (k / 6), y: q0.y, z: q0.z + (q1.z - q0.z) * (k / 6) });
    // tiers: [[minClear, extra cost], ...] (the stroke's clearance decides which it qualifies for)
    const mopSpot = (L, arc, home, penalty, tiers, extra = []) => {
      let best = null;
      const minClear = Math.min(...tiers.map((t) => t[0]));
      const xs = L.name === 'main' ? [-0.8, 1.2] : [L.x0 + 0.3, L.x0 + L.nx * 0.1 - 0.3];
      const zs = L.name === 'main' ? [-2.5, 3.75] : [L.z0 + 0.3, L.z0 + L.nz * 0.1 - 0.3];
      for (let x = xs[0]; x <= xs[1] + 1e-6; x += 0.2) {
        for (let z = zs[0]; z <= zs[1] + 1e-6; z += 0.125) {
          const fx = L.name === 'main' ? -S * x : x;
          const near = [...bodies, ...extra];
          if (L.roomAt(fx, z) < 0.3 || near.some((o) => Math.abs(o.y - L.y) < 1 && Math.hypot(o.x - fx, o.z - z) < 0.9) || mops.some((o) => Math.abs(o.y - L.y) < 1 && Math.hypot(o.x - fx, o.z - z) < 0.55)) continue;
          for (let k = 0; k < 16; k++) {
            const h = -PI + (k / 16) * TAU;
            const ch = Math.cos(h);
            const sh = Math.sin(h);
            // the whole stroke clear of the props, the bulwarks and the others: the mop head (its
            // strands splay about 0.2 round it), and its handle on the way back to the hands
            let clear = Infinity;
            let seen = 0;
            const others = [{ x: fx, y: L.y, z }, ...bodies, ...(bosunBeat.stern || L.name !== 'main' ? sternBeat : fullBeat)];
            for (const l of arc) {
              const hx = fx + l.x * ch + l.z * sh;
              const hz = z - l.x * sh + l.z * ch;
              clear = Math.min(clear, L.roomAt(hx, hz) - 0.2, L.roomAt(fx + (hx - fx) * 0.6, z + (hz - z) * 0.6) - 0.05);
              for (const o of near) if (Math.abs(o.y - L.y) < 1) clear = Math.min(clear, Math.hypot(hx - o.x, hz - o.z) - 0.55);
              for (const o of mops) if (Math.abs(o.y - L.y) < 1) clear = Math.min(clear, Math.hypot(hx - o.x, hz - o.z) - 0.35);
              if (clear < minClear) break;
              const bits = L.seenAt(hx, hz);
              for (let s2 = 0; s2 < spots.length; s2++) if (bits & (1 << s2) && !bodyHides(spots[s2], hx, L.y, hz, others)) seen++;
            }
            if (clear < minClear) continue;
            // (and he mustn't hide the strokes of the ones placed before him)
            for (const m of mops) for (let s2 = 0; s2 < spots.length; s2++) if (m.bits & (1 << s2) && bodyHides(spots[s2], m.x, m.y - 0.1, m.z, [{ x: fx, y: L.y, z }])) seen--;
            // seen: the share of the stroke the camera sees over its sway (that matters most), then
            // facing the camera, near his usual spot, long strokes; (as a last resort, the most room)
            const seenFrac = seen / (arc.length * views.length);
            const tier = tiers.find((t) => clear >= t[0]);
            const score = minClear === -Infinity ? clear + seenFrac : 3 * seenFrac + sh * S * 0.3 - Math.hypot(fx - home.x, z - home.z) * 0.1 - penalty - tier[1];
            if (!best || score > best.score) best = { p: { x: fx, y: L.y, z }, h, score, clear, seenFrac, level: L.name };
          }
        }
      }
      return best;
    };
    const pickMop = (c, home, h0, mayGoUp) => {
      // where the camera sees the stroke best: full strokes where there is room, shorter ones on a
      // deck crowded by the upgrades, a hand's breadth from the props when it can (never into them)
      let best = null;
      const strokes = new Map();
      const strokeFor = (sweep) => {
        if (!strokes.has(sweep)) {
          c.aopts.sweep = sweep;
          strokes.set(sweep, mopLocal(c));
        }
        return strokes.get(sweep);
      };
      // (sweep 0: working one spot hard, pushing and pulling, when that is all the room there is)
      const SWEEPS = [1, 0.6, 0.35, 0.15, 0];
      for (const sweep of SWEEPS) {
        const found = mopSpot(main, strokeFor(sweep), home, (1 - sweep) * 0.5, [[0.08, 0], [0, 0.15]]); // long strokes look best
        if (found && (!best || found.score > best.score)) best = { ...found, arc: strokeFor(sweep), sweep };
      }
      if (mayGoUp && (!best || best.clear < 0 || best.seenFrac < 0.45) && quarterLevel()) {
        // up on the quarterdeck (the bosun pacing the taffrail behind)
        for (const sweep of SWEEPS) {
          const found = mopSpot(quarter, strokeFor(sweep), { x: -S * 0.6, y: q0.y, z: (sternZ + q0.z) / 2 + 0.3 }, (1 - sweep) * 0.5 + 0.2, [[0.04, 0]], sternBeat);
          if (found && (!best || best.clear < 0 || found.score > best.score)) best = { ...found, arc: strokeFor(sweep), sweep };
        }
        if (best && best.level === 'quarter') bosunBeat.stern = true;
      }
      if (!best) {
        // (a deck so full there is no clear stroke anywhere: the most room)
        const found = mopSpot(main, strokeFor(0), home, 0, [[-Infinity, 0]]);
        if (found) best = { ...found, arc: strokeFor(0), sweep: 0 };
      }
      if (!best) best = { p: home, h: h0, arc: strokeFor(0), sweep: 0, clear: -1, seenFrac: 0 };
      c.aopts.sweep = best.sweep;
      place(c, best.p, best.h);
      const ch = Math.cos(best.h);
      const sh = Math.sin(best.h);
      const heads = best.arc.map((l) => V3(best.p.x + l.x * ch + l.z * sh, best.p.y + l.y, best.p.z - l.x * sh + l.z * ch));
      bodies.push(V3(best.p.x, best.p.y, best.p.z));
      const Lb = best.level === 'quarter' ? quarter : main;
      for (const v of heads) mops.push(Object.assign(v.clone(), { bits: Lb.seenAt(v.x, v.z) }));
      return { ...best, heads };
    };
    const mA = pickMop(cMopA, a, -PI / 2 + 0.35, true);
    const mB = pickMop(cMopB, b, -PI / 2 + 0.25, true);
    crewRig.userData.mops = [mA, mB].map((m) => ({ at: [m.p.x, m.p.y, m.p.z], h: m.h, sweep: m.sweep, clear: m.clear, seen: m.seenFrac, level: m.level, heads: m.heads.map((v) => [v.x, v.y, v.z]) }));
    // the bosun walks the quarterdeck with a bucket (along the taffrail with a mopper up there)
    crewState.bosunPath = bosunBeat.stern ? [V3(q0.x, q0.y, sternZ), V3(q1.x, q1.y, sternZ)] : [V3(q0.x, q0.y, q0.z), V3(q1.x, q1.y, q1.z)];
    place(cBosun, crewState.bosunPath[1], -PI / 2);
    // suds on the deck where the mops sweep (and by the polisher), with soap bubbles rising from them
    const suds = flat(COL.foam);
    const mid = (heads) => heads.reduce((m, h) => m.add(h), V3()).multiplyScalar(1 / heads.length);
    for (const [p, n, r0, mop, m] of [[mid(mA.heads), 9, 0.25, true, mA], [mid(mB.heads), 9, 0.25, true, mB], [w, 4, 0.45, false, null]]) {
      const L = m && m.level === 'quarter' ? quarter : main;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU + 0.4;
        const r = r0 + ((i * 37) % 7) * 0.06;
        const x = p.x + Math.cos(ang) * r * 0.8;
        const z = p.z + Math.sin(ang) * r;
        if (mop && L.roomAt(x, z) < 0.12) continue; // not into the props or the bulwark
        add(props, sphere(8), suds, x, (mop ? m.p.y : p.y) + 0.02, z, 0, 0, 0, [0.16 + (i % 3) * 0.04, 0.06, 0.14 + (i % 2) * 0.05]);
      }
      // the moppers' bubbles rise from the mop, not in front of their faces
      if (mop) emitters.push({ p: V3(p.x, m.p.y + 0.1, p.z), spread: 0.4, rise: 0.9, n: 0 });
      else emitters.push({ p: V3(p.x - 0.4, p.y + 0.15, p.z), spread: 0.6, rise: 1.6, n: 0 });
    }
    // the hull scrubber on a plank hung over the side, between two gun barrels: the plank, its
    // ropes and the bucket on it stay in the barrel-free stretch (narrower with more, bigger guns)
    const hp0 = hs.find((s) => s.side === S && s.z > 0) || { x: -1.4, y: 0.35, z: 1.2, side: S, h: PI / 2 };
    const hp = { ...hp0, z: freeZ(0.3, 2.4, hp0.z, 0.42) };
    const PLANK = 0.75; // half length
    const [g0, g1] = gapAround(hp.z, 2 * PLANK + 0.2).map((g, i) => g + (i ? -0.05 : 0.05)); // a little clear of the barrels
    hp.z = g1 - g0 >= 2 * PLANK ? clamp(hp.z, g0 + PLANK, g1 - PLANK) : (g0 + g1) / 2;
    const pz0 = Math.max(g0, hp.z - PLANK);
    const pz1 = Math.min(g1, hp.z + PLANK);
    const pS = cPlank.p.scale.x;
    const feetY = 0.62;
    const hxB = hullX(hp.z, feetY + 0.6 * pS) ?? hp.x - 0.25;
    const feetX = hxB + S * (WALL_Z * pS + 0.02);
    place(cPlank, V3(feetX, feetY, hp.z), -S * PI / 2);
    const plankX = feetX + S * 0.05;
    add(props, rbox(0.62, 0.08, pz1 - pz0, 0.03), ink(COL.wood3), plankX, feetY - 0.04, (pz0 + pz1) / 2);
    const railX = (hullX(hp.z, 1.7) ?? hp.x - 0.4) + S * 0.04;
    for (const rz of [pz0 + 0.13, pz1 - 0.13]) {
      rod(props, thin(COL.rope), V3(plankX + S * 0.15, feetY - 0.02, rz), V3(railX, 1.86, hp.z + (rz - hp.z) * 0.8), 0.022, 4);
      rod(props, thin(COL.rope), V3(plankX - S * 0.2, feetY - 0.02, rz), V3(plankX + S * 0.15, feetY - 0.02, rz), 0.022, 4);
    }
    // his bucket stands beside him, on the side of the plank with more room (none if it is too tight)
    const room = Math.max(hp.z - pz0, pz1 - hp.z);
    const br = Math.min(0.15, (room - 0.36) / 2);
    if (br >= 0.09) {
      const bz = hp.z + (hp.z - pz0 >= pz1 - hp.z ? -1 : 1) * Math.min(0.52, room - br);
      const k = br / 0.15;
      add(props, cyl(br, br * 0.8, 0.3 * k, 10), ink(COL.wood2), plankX + S * 0.18, feetY + 0.15 * k, bz);
      add(props, cyl(br * 0.87, br * 0.87, 0.02, 10), flat(0x8fd6f0), plankX + S * 0.18, feetY + 0.29 * k, bz);
    }
    emitters.push({ p: V3(hxB + S * 0.12, feetY + 0.6 * pS, hp.z), spread: 0.35, rise: 1.4, n: 0 });
    for (let i = 0; i < 7; i++) {
      const yy = feetY + 0.35 + (i % 3) * 0.18;
      const zz = hp.z - 0.45 + i * 0.15;
      const hx = hullX(zz, yy);
      if (hx !== null && !barrelAt(zz - 0.12) && !barrelAt(zz + 0.12)) add(props, sphere(8), suds, hx, yy, zz, 0, 0, 0, [0.06, 0.1 + (i % 2) * 0.04, 0.12]);
    }
    // the kid in a rowboat at the waterline
    const bp0 = hs.find((s) => s.side === S && s.z < 0) || { x: -1.4, y: 0.35, z: -1.2, side: S, h: PI / 2 };
    const bp = { ...bp0, z: freeZ(-2.4, -0.4, bp0.z, 0.42) };
    const kS = cBoat.p.scale.x;
    const kFeet = -0.06;
    const hxK = hullX(bp.z, kFeet + 0.6 * kS) ?? bp.x - 0.1;
    let kx = hxK + S * (WALL_Z * kS + 0.02);
    let bx = kx + S * 0.3;
    // keep the boat's gunwale off the hull
    const hxR = hullX(bp.z, 0.36) ?? bp.x;
    const clear = (bx - S * 0.66 - hxR) * S; // > 0 when the gunwale is outside the hull
    if (clear < 0.04) {
      bx += S * (0.04 - clear);
      kx += S * (0.04 - clear);
    }
    place(cBoat, V3(kx, kFeet, bp.z), -S * PI / 2);
    const rb = new THREE.Group();
    rb.position.set(bx, 0.28, bp.z);
    rb.rotation.y = 0.04;
    props.add(rb);
    rowboat(rb, COL.blue, COL.white, 2.6, 1.25, 0.5);
    add(rb, rbox(0.1, 0.07, 2.2, 0.02), ink(COL.wood3), S * 0.35, 0.05, 0.1, 0, 0.08, 0);
    const bk = new THREE.Group();
    bk.position.set(-S * 0.1, -0.32, -0.75);
    rb.add(bk);
    add(bk, cyl(0.16, 0.13, 0.3, 10), ink(COL.wood2), 0, 0.15, 0);
    add(bk, cyl(0.14, 0.14, 0.02, 10), flat(0x8fd6f0), 0, 0.29, 0);
    emitters.push({ p: V3(hxK + S * 0.1, kFeet + 0.6 * kS, bp.z), spread: 0.3, rise: 1.2, n: 0 });
    // a painter's line from the rowboat's bow to the rail, run clear of the gun barrels (more and bigger
    // with the upgrades) and of the plank's ropes: tied on at the rail point nearest 1.5 ahead of the
    // boy where the whole line stays outboard of the hull and the barrels by more than its thickness
    // (from the bow forward, or from the stern aft where the barrels leave no room ahead)
    const lineTop = (from, z1) => {
      if (z1 > pz0 - 0.3 && z1 < pz1 + 0.3) return null;
      const hx1 = hullX(z1, 1.7);
      if (hx1 === null) return null;
      const top = V3(hx1 + S * 0.03, 1.86, z1);
      const p = V3();
      for (let i = 1; i <= 50; i++) {
        const t = i / 50;
        if (t > 0.92) break; // (from there it is tied on at the rail)
        p.lerpVectors(from, top, t);
        for (const dz of [0, -0.04, 0.04, -0.08, 0.08]) {
          const hx = hullX(p.z + dz, p.y);
          if (hx !== null && (p.x - hx) * S < (dz ? 0.06 : 0.09)) return null;
        }
      }
      return top;
    };
    let line = null;
    for (let k = 0; k <= 36 && !line; k++) {
      for (const [from, dir] of [[V3(bx - S * 0.2, 0.42, bp.z + 1.05), 1], [V3(bx - S * 0.2, 0.36, bp.z - 1.05), -1]]) {
        for (const sg of k ? [1, -1] : [1]) {
          const top = line ? null : lineTop(from, from.z + dir * 0.45 + sg * k * 0.05);
          if (top) line = [from, top];
        }
      }
    }
    if (line) {
      rod(props, thin(COL.rope), line[0], line[1], 0.02, 4);
      crewRig.userData.painter = { a: line[0].toArray(), b: line[1].toArray() };
    } else crewRig.userData.painter = null;
    // bubbles from the bosun's bucket (where it really is: see updateBubbles), kept below his face
    emitters.push({ p: V3(0, q0.y + 0.4, q0.z), spread: 0.2, rise: 0.55, n: 0, bosun: true });
    bake(props, { force: 'thin' });
    probe = null;
    mesh.add(crewRig);
  }

  // ----- the moving bits that join the ship to the pier -----
  const lineMat = thin(COL.rope);
  const moor = [
    { local: V3(0.75, 1.95, 4.35), world: pier.at(9.2, 0.95, 0.35) },
    { local: V3(1.45, 2.05, -3.7), world: pier.at(-9.2, 0.95, 0.35) },
    { local: V3(1.6, 1.9, 1.6), world: pier.at(4.2, 0.95, 0.35) },
    { local: V3(1.6, 1.9, -1.8), world: pier.at(-4.2, 0.95, 0.35) },
  ];
  const SEG = 10;
  const RAD = 5;
  const lineGeo = (() => {
    const g = new THREE.BufferGeometry();
    const nPer = (SEG + 1) * RAD;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nPer * moor.length * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nPer * moor.length * 3), 3));
    const idx = [];
    for (let l = 0; l < moor.length; l++) {
      const o = l * nPer;
      for (let i = 0; i < SEG; i++) {
        for (let k = 0; k < RAD; k++) {
          const a = o + i * RAD + k;
          const b = o + i * RAD + ((k + 1) % RAD);
          const c = a + RAD;
          const d = b + RAD;
          idx.push(a, c, b, b, c, d);
        }
      }
    }
    g.setIndex(idx);
    return g;
  })();
  const lines = new THREE.Mesh(lineGeo, lineMat);
  lines.frustumCulled = false;
  lines.userData.keep = true;
  root.add(lines);
  const gang = new THREE.Group();
  gang.userData.keep = true;
  root.add(gang);
  {
    const gg = new THREE.Group();
    gang.add(gg);
    add(gg, rbox(0.85, 0.08, 1, 0.03), ink(COL.wood3), 0, 0, 0.5);
    for (let i = 0; i < 5; i++) add(gg, rbox(0.8, 0.05, 0.06, 0.02), thin(COL.woodDark), 0, 0.05, 0.1 + i * 0.2);
    for (const sx of [-1, 1]) {
      rod(gg, thin(COL.rope), V3(sx * 0.4, 0.55, 0.02), V3(sx * 0.4, 0.55, 0.98), 0.025, 4);
      rod(gg, thin(COL.woodDark), V3(sx * 0.4, 0, 0.02), V3(sx * 0.4, 0.56, 0.02), 0.03, 4);
      rod(gg, thin(COL.woodDark), V3(sx * 0.4, 0, 0.98), V3(sx * 0.4, 0.56, 0.98), 0.03, 4);
    }
    bake(gang, { force: 'thin' });
  }
  const gangFoot = pier.at(0.6, 1.1, 0.02);
  // The Sea Biscuit (a place) at the foot of the gangplank; the captain comes ashore there, facing the town
  walkData.places.push({ id: 'ship', name: 'The Sea Biscuit', x: r2(gangFoot.x), z: r2(pier.z + 0.25), r: 1.4, face: 0 });
  walkData.spawn = { x: r2(gangFoot.x), z: r2(pier.z + 0.15), h: r3(PI) };
  // the docked ship at the berth (beyond the pier's edge, so only the town camera ever meets it)
  walkData.blockers.push({ x: BERTH.x, z: BERTH.z, w: 16, d: 4.8, ry: 0, h: 10 });
  const PLACE_ORDER = ['ship', 'shipyard', 'tailor', 'tavern'];
  walkData.places.sort((p, q) => PLACE_ORDER.indexOf(p.id) - PLACE_ORDER.indexOf(q.id));
  const gangTop = V3(1.62, 1.86, 0.6); // ship-local, on the rail
  gang.visible = false;
  lines.visible = false;

  // ----- update -----
  const tmpV = V3();
  const tmpA = V3();
  const tmpB = V3();
  const _side = V3();
  const _upv = V3();
  const _bucket = V3();
  const BOSUN = { speed: 0.8 };
  function walkerPose(f, t) {
    const { path, cum, L, v } = f;
    let s;
    let dir = 1;
    let moving = true;
    if (f.loop) {
      s = (((t + f.off) * v) % L + L) % L;
    } else {
      const leg = L / v;
      const T = 2 * (leg + f.pause);
      const u = (((t + f.off) % T) + T) % T;
      if (u < leg) s = u * v;
      else if (u < leg + f.pause) {
        s = L;
        moving = false;
        dir = u - leg > f.pause * 0.5 ? -1 : 1;
      } else if (u < 2 * leg + f.pause) {
        s = L - (u - leg - f.pause) * v;
        dir = -1;
      } else {
        s = 0;
        moving = false;
        dir = u - 2 * leg - f.pause > f.pause * 0.5 ? 1 : -1;
      }
    }
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const a = path[i - 1];
    const b = path[i];
    const k = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
    f.p.position.lerpVectors(a, b, Math.min(1, Math.max(0, k)));
    tmpV.subVectors(b, a).multiplyScalar(dir);
    if (tmpV.x * tmpV.x + tmpV.z * tmpV.z > 1e-8) f.p.rotation.y = Math.atan2(tmpV.x, tmpV.z);
    return moving;
  }
  function updateLines() {
    const ship = crewState.ship;
    const show = !!ship && !!ship.parent;
    lines.visible = gang.visible = show;
    if (!show) return;
    ship.updateMatrixWorld(true);
    const pos = lineGeo.attributes.position;
    const nor = lineGeo.attributes.normal;
    const nPer = (SEG + 1) * RAD;
    for (let l = 0; l < moor.length; l++) {
      const A = tmpA.copy(moor[l].local);
      ship.localToWorld(A);
      const B = moor[l].world;
      const len = A.distanceTo(B);
      const sag = Math.min(0.6, len * 0.05);
      const d = tmpV.subVectors(B, A).normalize();
      const side = _side.set(-d.z, 0, d.x).normalize();
      const upv = _upv.crossVectors(side, d).normalize();
      for (let i = 0; i <= SEG; i++) {
        const u = i / SEG;
        const cx = A.x + (B.x - A.x) * u;
        const cy = A.y + (B.y - A.y) * u - sag * 4 * u * (1 - u);
        const cz = A.z + (B.z - A.z) * u;
        for (let k = 0; k < RAD; k++) {
          const an = (k / RAD) * TAU;
          const nx = side.x * Math.cos(an) + upv.x * Math.sin(an);
          const ny = side.y * Math.cos(an) + upv.y * Math.sin(an);
          const nz = side.z * Math.cos(an) + upv.z * Math.sin(an);
          const j = l * nPer + i * RAD + k;
          pos.setXYZ(j, cx + nx * 0.045, cy + ny * 0.045, cz + nz * 0.045);
          nor.setXYZ(j, nx, ny, nz);
        }
      }
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    // gangplank: hinged on the pier, resting on the rail
    const top = tmpB.copy(gangTop);
    ship.localToWorld(top);
    gang.position.copy(gangFoot);
    const dd = tmpV.subVectors(top, gangFoot);
    const L = dd.length();
    orient(gang, dd);
    gang.scale.set(1, 1, L);
  }
  const bm = new THREE.Matrix4();
  const bq = new THREE.Quaternion();
  const bp = V3();
  const bs = V3();
  function updateBubbles(t) {
    if (!emitters.length) {
      bubbles.count = shine.count = 0;
      return;
    }
    bubbles.count = shine.count = NB;
    // the bosun's bucket hangs from his hand (the tool bone, at its handle); bubbles start at the water in it
    const bucket = _bucket;
    cBosun.p.userData.parts.tool.getWorldPosition(bucket);
    crewRig.worldToLocal(bucket);
    bucket.y -= 0.12 * cBosun.p.scale.x;
    for (let i = 0; i < NB; i++) {
      const e = emitters[i % emitters.length];
      const P = 2.2 + ((i * 0.618) % 1) * 1.6;
      const ph = (i * 0.37) % 1;
      const u = (t / P + ph) % 1;
      const j1 = Math.sin(i * 12.9898) * 0.5;
      const j2 = Math.sin(i * 78.233) * 0.5;
      bp.copy(e.p);
      if (e.bosun) bp.copy(bucket);
      bp.x += j1 * e.spread + Math.sin(t * 2.1 + i) * 0.12 * u;
      bp.z += j2 * e.spread + Math.cos(t * 1.7 + i) * 0.12 * u;
      bp.y += u * e.rise;
      const r = (0.08 + ((i * 0.29) % 1) * 0.1) * Math.min(1, u * 5) * (u > 0.88 ? Math.max(0, (1 - u) / 0.12) : 1);
      bs.setScalar(Math.max(0.0001, r));
      bm.compose(bp, bq, bs);
      bubbles.setMatrixAt(i, bm);
      bp.x += r * 0.35;
      bp.y += r * 0.4;
      bp.z += r * 0.35;
      bs.setScalar(Math.max(0.0001, r * 0.28));
      bm.compose(bp, bq, bs);
      shine.setMatrixAt(i, bm);
    }
    bubbles.instanceMatrix.needsUpdate = true;
    shine.instanceMatrix.needsUpdate = true;
  }
  // ----- the town view: townsfolk in the captain's way, greetings, culling, prize ships -----
  let lastT = 0;
  let townView = false;
  const tmpW = V3();
  const turnTo = (a, b, step) => {
    let d = (((b - a) % TAU) + TAU + PI) % TAU - PI;
    if (Math.abs(d) <= step) return b;
    return a + Math.sign(d) * step;
  };
  // on a walkable deck, the garden or a walkable bridge (and at its height)?
  const onWalk = (x, y, z) => {
    for (const k of walkDecks) {
      const dx = x - k.x;
      const dz = z - k.z;
      if (Math.abs(dx * k.c - dz * k.s) <= k.hw && Math.abs(dx * k.s + dz * k.c) <= k.hd && Math.abs(y - k.y) < 0.45) return true;
    }
    if (Math.hypot(x - GARDEN.x, z - GARDEN.z) <= GARDEN.r - 0.4 && Math.abs(y - GARDEN.y) < 0.45) return true;
    for (const l of walkData.links) {
      for (let i = 0; i + 1 < l.pts.length; i++) {
        const [ax, ay, az] = l.pts[i];
        const [bx, by, bz] = l.pts[i + 1];
        const L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
        const u = clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / L2, 0, 1);
        if (Math.hypot(x - ax - (bx - ax) * u, z - az - (bz - az) * u) <= l.hw + 0.3 && Math.abs(y - (ay + (by - ay) * u)) < 0.45) return true;
      }
    }
    return false;
  };
  // who can stop and wave (not the ones sitting or fishing, nor anyone off the walk)
  for (const f of folk) {
    const a = typeof f.action === 'function' ? 'idle' : f.action;
    f.greets = f.p.parent === root && a !== 'sit' && a !== 'fish' && (f.path ? f.path.some((q) => onWalk(q.x, q.y, q.z)) : onWalk(f.p.position.x, f.p.position.y, f.p.position.z));
  }
  /** Townsfolk standing or walking on the walk, as soft obstacles for the captain: [{ x, z, r, index, greets }]. */
  function folkOnWalk() {
    const out = [];
    for (let i = 0; i < folk.length; i++) {
      const f = folk[i];
      if (f.p.parent !== root) continue;
      const p = f.p.position;
      if (onWalk(p.x, p.y, p.z)) out.push({ x: p.x, z: p.z, r: 0.35, index: i, greets: !!f.greets });
    }
    return out;
  }
  /**
   * Townsperson `index` turns to the captain and waves for `seconds` (a walker stops meanwhile).
   * toward: { x, z } where the captain is (default: where the camera was at the last update).
   * Returns false for someone who can't (sitting, fishing, off the walk).
   */
  function greet(index, seconds = 2, toward = null) {
    const f = folk[index];
    if (!f || !f.greets) return false;
    const at = toward && Number.isFinite(toward.x) && Number.isFinite(toward.z) ? { x: toward.x, z: toward.z } : lastCam ? { ...lastCam } : null;
    const s0 = f.greet ? f.greet.s0 : lastT + (f.off || 0);
    f.greet = { until: lastT + Math.max(0, Number.isFinite(seconds) ? seconds : 2), at, s0 };
    return true;
  }
  /**
   * Polly ('polly'), Old Snips ('snips') or both ('tailors') cheer for `seconds` (a purchase at the
   * tailor's). Returns whether anyone did.
   */
  function cheer(who = 'polly', seconds = 1.5) {
    const N = polly.npc || {};
    const list = who === 'tailors' || who === 'all' ? [N.polly, N.snips] : [N[who]];
    const until = lastT + Math.max(0, Math.min(10, Number.isFinite(seconds) ? seconds : 1.5));
    let any = false;
    for (const f of list) {
      if (!f) continue;
      f.cheerUntil = until;
      any = true;
    }
    return any;
  }
  /**
   * The town view: hide the townsfolk farther than `radius` from (x, z) (the camera) or nearer than
   * `near` (right at the lens), and show the prize ships. cull() with no arguments goes back to the
   * shipyard view: everyone shown, the prize ships hidden.
   */
  function cull(x, z, radius = 40, near = 0) {
    townView = Number.isFinite(x) && Number.isFinite(z);
    for (const f of folk) {
      if (!townView) {
        f.p.visible = true;
        continue;
      }
      const w = f.p.parent === root ? f.p.position : f.p.getWorldPosition(tmpW);
      const d = Math.hypot(w.x - x, w.z - z);
      f.p.visible = d <= radius && d >= near;
    }
    for (const zz of prizes) zz.ship.visible = townView;
  }
  // Prize ships moored off the east arm (built from the two most valuable captures; the town view only)
  const PRIZE_BERTHS = [
    { x: 29.5, z: 3.0, h: PI / 2 - 0.35, ph: 0.4 },
    { x: 41.0, z: -3.5, h: PI / 2 + 0.25, ph: 2.1 },
  ];
  const PRIZE_SIT = 0.45; // moored and laden with plunder, a prize sits deep: no hull bottom showing
  const prizes = [];
  /** list: [{ type, flag? }] (at most 2; flag: a LOOKS.flag entry for the pennant, default the player's). */
  function setPrizes(list) {
    const want = (Array.isArray(list) ? list : []).filter((q) => q && typeof q.type === 'string' && q.type !== 'player').slice(0, PRIZE_BERTHS.length);
    const keep = [];
    for (let i = 0; i < PRIZE_BERTHS.length; i++) {
      const cur = prizes.find((q) => q.slot === i);
      const w = want[i];
      if (cur && w && cur.type === w.type) {
        hoistFlag(cur.ship, 'player', w.flag || null);
        keep.push(cur);
        continue;
      }
      if (cur) {
        root.remove(cur.ship);
        disposeShip(cur.ship);
      }
      if (!w) continue;
      let ship = null;
      try {
        ship = buildShip(w.type);
      } catch (e) {
        ship = null;
      }
      if (!ship) continue;
      hoistFlag(ship, 'player', w.flag || null);
      ship.visible = townView;
      root.add(ship);
      keep.push({ slot: i, type: w.type, ship, berth: PRIZE_BERTHS[i] });
    }
    prizes.length = 0;
    prizes.push(...keep);
    return prizes.length;
  }
  let lastCam = null;
  // Where the captain stands in the town view (town.js tells each frame; null otherwise): a walker whose
  // way he blocks waits for him, as people do, instead of walking through him.
  let captainAt = null;
  function setCaptain(x, z) {
    captainAt = Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
  }
  // (the two touch at 0.65, his radius 0.3 and theirs 0.35; one he already stands in, put there by a door
  // or squeezing past, walks on out of him rather than wait inside him)
  const WAIT = { ahead: 1.0, side: 0.7, inside: 0.6 };
  const inTheWay = (f) => {
    if (!captainAt || !townView || f.p.parent !== root) return false;
    const p = f.p.position;
    const dx = captainAt.x - p.x;
    const dz = captainAt.z - p.z;
    const fx = Math.sin(f.p.rotation.y);
    const fz = Math.cos(f.p.rotation.y);
    const along = dx * fx + dz * fz;
    return along > 0 && along < WAIT.ahead && Math.abs(dx * fz - dz * fx) < WAIT.side && Math.hypot(dx, dz) > WAIT.inside;
  };

  function update(t, dt0, ctx) {
    if (ctx && ctx.camera && ctx.camera.position) lastCam = { x: ctx.camera.position.x, z: ctx.camera.position.z };
    const amp = palette.waveAmp;
    // cloth
    for (const m of flutterMeshes) {
      m.morphTargetInfluences[0] = Math.sin(t * 3.1);
      m.morphTargetInfluences[1] = Math.cos(t * 3.1);
    }
    lanternGlow.emissiveIntensity = 1.0 + 0.12 * Math.sin(t * 7.3) + 0.08 * Math.sin(t * 13.1);
    // boats and the barge
    for (const b of anim.boats) {
      const { x, z } = b.userData.base;
      const ph = b.userData.phase;
      b.position.y = waveHeight(x, z, t, amp) * 0.85 - 0.05;
      b.rotation.z = Math.sin(t * 1.4 + ph) * 0.05;
      b.rotation.x = Math.sin(t * 1.1 + ph + 1) * 0.03;
      if (b.userData.swing) b.rotation.y = b.userData.swing + Math.sin(t * 0.23 + ph) * 0.35;
    }
    // the crane: hoist (14 s cycle: rest on the barge, lift, hang, lower)
    if (anim.crane) {
      const C = anim.crane;
      const cyc = (t % 14) / 14;
      const e = cyc < 0.15 ? 0 : cyc < 0.5 ? (1 - Math.cos(((cyc - 0.15) / 0.35) * PI)) / 2 : cyc < 0.7 ? 1 : cyc < 0.95 ? (1 + Math.cos(((cyc - 0.7) / 0.25) * PI)) / 2 : 0;
      const bargeY = waveHeight(C.tip.x, C.tip.z, t, amp) * 0.85 - 0.05;
      const low = bargeY + C.deckY;
      const y = low + (C.topY - low) * e;
      const sway = 0.06 * e * Math.sin(t * 1.6);
      C.hook.position.set(C.tip.x, y, C.tip.z);
      C.hook.rotation.set(sway, t * 0.05, sway * 0.5);
      const len = Math.max(0.05, C.tip.y - y);
      C.rope.position.set(C.tip.x, C.tip.y - len / 2, C.tip.z);
      C.rope.scale.set(1, len, 1);
      C.wheel.rotation.x = -(C.topY - y) * 1.3;
    }
    if (anim.visitor) {
      const v = anim.visitor;
      const b = v.userData.base;
      v.position.set(b.x, waveHeight(b.x, b.z, t, amp), b.z);
      v.rotation.set(Math.sin(t * 0.8 + 2) * 0.012, b.h + Math.sin(t * 0.17) * 0.06, Math.sin(t * 1.1 + 1) * 0.03);
      animateShip(v, t, 0);
    }
    if (anim.vane) {
      anim.vane.rotation.y = 0.9 + Math.sin(t * 0.21) * 0.5 + Math.sin(t * 0.63) * 0.12;
    }
    // gulls
    if (anim.gulls) {
      const G = anim.gulls;
      for (let i = 0; i < G.birds.length; i++) {
        const s = G.birds[i];
        const a = s.ph + t * s.w;
        G.p.set(s.c[0] + Math.cos(a) * s.r, s.c[1] + s.dy + Math.sin(t * 0.6 + s.ph) * 1.2, s.c[2] + Math.sin(a) * s.r);
        const dir = Math.sign(s.w);
        G.e.set(0, Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir), 0.32 * dir);
        G.q.setFromEuler(G.e);
        G.s.setScalar(0.75);
        G.m.compose(G.p, G.q, G.s);
        G.body.setMatrixAt(i, G.m);
        const glide = 0.5 + 0.5 * Math.sin(t * 0.8 + s.fl);
        const fl = glide > 0.5 ? 0.25 + 1.25 * Math.sin(t * 9 + s.fl) : 0.45 + 0.15 * Math.sin(t * 3 + s.fl);
        G.p.y += 0.2 * 0.75;
        G.s.set(0.75, 0.75 * fl, 0.75);
        G.m.compose(G.p, G.q, G.s);
        G.wings.setMatrixAt(i, G.m);
      }
      G.body.instanceMatrix.needsUpdate = true;
      G.wings.instanceMatrix.needsUpdate = true;
    }
    // smoke
    if (anim.smoke) {
      const S = anim.smoke;
      let k = 0;
      for (const src of anim.smokeSrc) {
        for (let i = 0; i < S.per; i++) {
          const p = (t * 0.2 + i / S.per + src.world.x * 0.01) % 1;
          S.p.set(src.world.x + p * p * 3.0 * src.s + Math.sin(t * 1.3 + i) * 0.12, src.world.y + p * 5.5 * src.s, src.world.z + p * 1.2 * src.s);
          const sc = Math.max(0.01, (0.32 + p * 0.95) * src.s * Math.min(1, (1 - p) * 3.5) * Math.min(1, 0.35 + p * 6));
          S.s.set(sc, sc * 0.85, sc);
          S.m.compose(S.p, S.q, S.s);
          S.puff.setMatrixAt(k++, S.m);
        }
      }
      S.puff.instanceMatrix.needsUpdate = true;
    }
    // townsfolk (a greeting turns one to the captain and waves; walkers stop for it and then go on)
    const dt = clamp(t - lastT, 0, 0.1);
    lastT = t;
    for (const f of folk) {
      const G = f.greet;
      if (G && t >= G.until) {
        if (f.path) f.off = G.s0 - t;
        f.greet = null;
      }
      if (!f.p.visible) continue; // culled in the town view
      if (f.cheerUntil > t) {
        animatePerson(f.p, t, 'cheer', f.aopts);
        continue;
      }
      if (f.greet) {
        if (G.at) f.p.rotation.y = turnTo(f.p.rotation.y, Math.atan2(G.at.x - f.p.position.x, G.at.z - f.p.position.z), 9 * dt);
        animatePerson(f.p, t, 'wave', f.aopts);
        continue;
      }
      let act = typeof f.action === 'function' ? f.action(t) : f.action;
      if (f.path) {
        let moving = walkerPose(f, t);
        if (moving && inTheWay(f)) {
          // the captain stands in his way: he waits (his clock held back), and goes on once the way is clear
          f.off -= dt;
          walkerPose(f, t);
          moving = false;
        }
        if (!moving) act = 'idle'; // a breather at each end of the path
      } else if (f.p.rotation.y !== f.h0) {
        f.p.rotation.y = turnTo(f.p.rotation.y, f.h0, 4 * dt);
      }
      animatePerson(f.p, t, act, f.aopts);
    }
    if (polly.pole) polly.pole.rotation.y = t * 2.4;
    for (const z of prizes) {
      if (!z.ship.visible) continue;
      const b = z.berth;
      z.ship.position.set(b.x, waveHeight(b.x, b.z, t, amp) - PRIZE_SIT, b.z);
      z.ship.rotation.set(Math.sin(t * 0.7 + b.ph) * 0.012, b.h + Math.sin(t * 0.15 + b.ph) * 0.05, Math.sin(t * 1.0 + b.ph) * 0.03);
      animateShip(z.ship, t, 0);
    }
    // the crew
    if (crewState.ship) {
      for (const c of crew) {
        let act = c.action;
        if (c === cBosun && crewState.bosunPath) {
          const A = crewState.bosunPath[0];
          const B = crewState.bosunPath[1];
          const leg = A.distanceTo(B) / Math.max(0.1, walkSpeed(cBosun.p, 'walk', BOSUN.speed));
          const T = 2 * (leg + 1.6);
          const u = t % T;
          let s = 0;
          let dir = 1;
          act = 'walk';
          if (u < leg) s = u / leg;
          else if (u < leg + 1.6) {
            s = 1;
            dir = u - leg > 0.8 ? -1 : 1;
            act = 'idle';
          } else if (u < 2 * leg + 1.6) {
            s = 1 - (u - leg - 1.6) / leg;
            dir = -1;
          } else {
            dir = u - 2 * leg - 1.6 > 0.8 ? 1 : -1;
            act = 'idle';
          }
          cBosun.p.position.lerpVectors(A, B, s);
          tmpV.subVectors(B, A).multiplyScalar(dir);
          cBosun.p.rotation.y = Math.atan2(tmpV.x, tmpV.z);
          animatePerson(cBosun.p, t, act, BOSUN);
          continue;
        }
        animatePerson(c.p, t, act, c.aopts);
      }
      updateBubbles(t);
    }
    updateLines();
  }

  function dispose() {
    if (crewRig.parent) crewRig.parent.remove(crewRig);
    if (anim.visitor) disposeShip(anim.visitor); // its own clean-up (keeps the shared materials)
    for (const z of prizes) {
      root.remove(z.ship);
      disposeShip(z.ship);
    }
    prizes.length = 0;
    for (const f of folk) disposePerson(f.p);
    for (const c of crew) disposePerson(c.p);
    scene.remove(root);
    const geos = new Set();
    for (const r of [root, crewRig]) {
      r.traverse((o) => {
        if (o.isMesh && o.geometry && !o.isSkinnedMesh) geos.add(o.geometry);
        if (o.isInstancedMesh) o.dispose(); // frees its instance-matrix buffer (gulls, smoke, bubbles)
      });
    }
    for (const g of geos) g.dispose();
    for (const m of ownMaterials) m.dispose();
    for (const t of ownTextures) {
      t.userData.disposed = true;
      t.dispose();
    }
    crewState.ship = null;
  }

  return {
    worldRadius: WORLD_R,
    colliders,
    playerStart: { ...BERTH },
    enemySpawns: [],
    reefs: [],
    berth: { ...BERTH },
    view: { ...VIEW, target: [...VIEW.target] }, // the showcase camera
    setShip,
    setCrewStyle,
    peopleCount: folk.length + crew.length,
    walk: walkData,
    folk: folkOnWalk,
    setCaptain,
    greet,
    cheer,
    cull,
    setPrizes,
    update,
    dispose,
    group: root,
  };
}

/**
 * Author aid (?walkdebug=1): the walk data drawn as lines just above the decks. Areas teal (portals,
 * the ids with a '-', green), bridges yellow (their middle and their edges), blockers red, the
 * camera-only volumes orange (at their bottom and top), places magenta (their reach and which way
 * the captain faces), the spawn white. Add it to the scene;
 * dispose its geometry and material when done.
 */
export function walkDebugLines(walk) {
  const cols = { area: 0x19c3c9, portal: 0x3fe05a, link: 0xffd23c, block: 0xff3b3b, cam: 0xff9a1c, place: 0xff4fe0, spawn: 0xffffff };
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  const seg = (a, b, hex) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    c.setHex(hex);
    col.push(c.r, c.g, c.b, c.r, c.g, c.b);
  };
  const loop = (pts, hex) => {
    for (let i = 0; i < pts.length; i++) seg(pts[i], pts[(i + 1) % pts.length], hex);
  };
  const circle = (x, y, z, r, hex, n = 24) => loop(Array.from({ length: n }, (_, i) => [x + Math.cos((i / n) * TAU) * r, y, z + Math.sin((i / n) * TAU) * r]), hex);
  const box = (x, y, z, w, d, ry, hex) => {
    const cs = Math.cos(ry);
    const sn = Math.sin(ry);
    loop([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
      const lx = (u * w) / 2;
      const lz = (v * d) / 2;
      return [x + lx * cs + lz * sn, y, z - lx * sn + lz * cs];
    }), hex);
  };
  const lift = 0.06;
  for (const a of walk.areas || []) {
    const hex = String(a.id).includes('-') ? cols.portal : cols.area;
    if (a.kind === 'circle') circle(a.x, a.y + lift + 0.12, a.z, a.r, hex, 40);
    else box(a.x, a.y + lift, a.z, a.w, a.d, a.ry || 0, hex);
  }
  for (const l of walk.links || []) {
    for (let i = 0; i + 1 < l.pts.length; i++) {
      const [ax, ay, az] = l.pts[i];
      const [bx, by, bz] = l.pts[i + 1];
      seg([ax, ay + lift, az], [bx, by + lift, bz], cols.link);
      const L = Math.hypot(bx - ax, bz - az) || 1;
      const nx = (-(bz - az) / L) * l.hw;
      const nz = ((bx - ax) / L) * l.hw;
      for (const s of [-1, 1]) seg([ax + nx * s, ay + lift, az + nz * s], [bx + nx * s, by + lift, bz + nz * s], cols.link);
    }
  }
  const yAt = 1.36;
  for (const b of walk.blockers || []) {
    if (b.r !== undefined) circle(b.x, yAt, b.z, b.r, cols.block, 14);
    else box(b.x, yAt, b.z, b.w, b.d, b.ry || 0, cols.block);
  }
  // the camera-only volumes, outlined at their bottom and top (orange)
  for (const b of walk.camBlockers || []) {
    for (const y of [b.y0, b.y1]) {
      if (b.r !== undefined) circle(b.x, y, b.z, b.r, cols.cam, 14);
      else box(b.x, y, b.z, b.w, b.d, b.ry || 0, cols.cam);
    }
  }
  for (const p of walk.places || []) {
    circle(p.x, yAt + 0.04, p.z, p.r, cols.place, 32);
    seg([p.x, yAt + 0.04, p.z], [p.x + Math.sin(p.face || 0) * p.r, yAt + 0.04, p.z + Math.cos(p.face || 0) * p.r], cols.place);
    if (p.podium) circle(p.podium.x, p.podium.y + 0.05, p.podium.z, 0.3, cols.place, 16);
    for (const q of p.lineup || []) circle(q.x, q.y + 0.05, q.z, 0.25, cols.place, 12);
  }
  if (walk.spawn) {
    const s = walk.spawn;
    circle(s.x, yAt + 0.08, s.z, 0.3, cols.spawn, 16);
    seg([s.x, yAt + 0.08, s.z], [s.x + Math.sin(s.h) * 0.8, yAt + 0.08, s.z + Math.cos(s.h) * 0.8], cols.spawn);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true });
  setOutline(m, false);
  const lines = new THREE.LineSegments(g, m);
  lines.name = 'walk-debug';
  lines.renderOrder = 999;
  lines.frustumCulled = false;
  return lines;
}
