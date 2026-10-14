import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, setOutline, gradientMap, ensureIndex, OUTLINE_THICKNESS } from '../style.js';
import { waveHeight } from '../scenery.js';
import { buildShip, animateShip, disposeShip } from '../ships.js';
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
const SIGN_LIFT = 1.4; // the welcome sign's board sits this much higher than on plain 4.6 posts
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
const SIGN_UV = {
  welcome: [0, 0, 1024, 340],
  tavern: [0, 340, 640, 172],
  yard: [640, 340, 384, 172],
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
}
function signTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
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
    uv.setXY(i, (x + u * rw) / 1024, 1 - (y + (1 - v) * rh) / 512);
  }
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
  function deckSurface(g, w, d, y, o = {}) {
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
    deckSurface(g, P.w, P.d, y, P);
    floats(g, P.w, P.d, y, P.float || 'barrels');
    if (P.rails) rails(g, P.w, P.d, y, P.rails, P.gaps || []);
    if (P.foam !== false) addColliderRect(P.x, P.z, P.w, P.d, P.ry || 0, (P.float || 'barrels') === 'stilts' ? 2.3 : 1.7);
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
    return walk;
  }

  // The berth: a long pier on piles
  const pier = platform('pier', { x: 0, z: -4.4, w: 22, d: 2.6, float: 'stilts', foam: false, rails: ['back'], gaps: [[-1.5, 2.5, 'back'], [-7.8, -5.4, 'back']] });
  // The market plaza on barrels
  const plaza = platform('plaza', { x: 0, z: -10.25, w: 17, d: 9.1, float: 'barrels', foam: false, rails: ['left'], gaps: [[0.7, 2.7, 'left']] });
  // The tavern raft
  const tavernRaft = platform('tavern', { x: -6.2, z: -19.6, w: 10.5, d: 9, float: 'barrels', rails: ['right'] });
  // Lookout tower raft (logs)
  const towerRaft = platform('tower', { x: -15.5, z: -27.2, w: 6, d: 6, float: 'logs', ry: 0.15 });
  // The shipyard
  const yard = platform('yard', { x: 16.2, z: -11.5, w: 8.4, d: 9, float: 'stilts', rails: ['back'] });
  // Stilt shack platforms (platform() registers each one in plats)
  platform('s1', { x: 5.2, z: -20.8, w: 6, d: 5, float: 'stilts', ry: -0.06 });
  platform('s2', { x: 12.6, z: -23, w: 5.4, d: 5, float: 'stilts', ry: 0.12 });
  platform('s3', { x: -0.5, z: -29.5, w: 6, d: 5.4, float: 'stilts', ry: 0.05, y: 1.6 });
  platform('s4', { x: -7.6, z: -33.6, w: 5.6, d: 5, float: 'stilts', ry: -0.1, y: 1.5 });
  platform('s5', { x: 9.2, z: -31.5, w: 6.4, d: 5.2, float: 'stilts', ry: -0.05, y: 1.8 });
  platform('s6', { x: -22.5, z: -25, w: 5.6, d: 5.2, float: 'stilts', ry: 0.3 });
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
  platform('s16', { x: -16.6, z: -17.4, w: 5.4, d: 5, float: 'barrels', ry: -0.08 });
  // the east arm, behind the shipyard
  platform('s17', { x: 29.5, z: -25, w: 6, d: 5.4, float: 'stilts', ry: -0.35, y: 1.6 });
  platform('s18', { x: 35, z: -12.5, w: 5.2, d: 5, float: 'logs', ry: -0.7 });

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
    palm(g, -0.6, GARDEN.y, -0.5, 1.0, -0.5, -0.6, rand);
    palm(g, 1.0, GARDEN.y, -0.9, 0.82, 0.7, -0.3, rand);
    // a beach umbrella over a driftwood bench
    rod(g, thin(COL.woodDark), V3(1.5, GARDEN.y - 0.1, 1.3), V3(1.45, GARDEN.y + 2.0, 1.35), 0.04);
    // a driftwood bench under the umbrella (seat at SEAT_HEIGHT above the sand)
    add(g, cyl(0.17, 0.17, 1.5, 10), ink(COL.trunk), 1.5, GARDEN.y + 0.06, 2.1, 0, 0, PI / 2);
    for (const sx of [-0.55, 0.55]) add(g, rbox(0.2, 0.3, 0.3, 0.05), ink(COL.woodDark), 1.5 + sx, GARDEN.y - 0.15, 2.1);
    for (let i = 0; i < 8; i++) {
      const geo = cached(`umbrella${i}`, () => new THREE.ConeGeometry(1.25, 0.5, 4, 1, false, (i / 8) * TAU, TAU / 8));
      add(g, geo, ink(i % 2 ? COL.red : COL.white), 1.45, GARDEN.y + 2.1, 1.35, 0.05, 0, -0.1);
    }
    add(g, sphere(8), ink(COL.red), 1.42, GARDEN.y + 2.38, 1.36, 0, 0, 0, 0.08);
    colliders.push({ x: GARDEN.x - 0.8, z: GARDEN.z - 0.6, r: 1.0 });
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
  }
  {
    // the welcome sign: a big painted board on two tall posts, the pirate sparrow on top (high
    // enough to show over the docked ship's rigging and sails from most of the showcase camera's sway)
    const g = new THREE.Group();
    g.position.set(-5.9, DECK, -6.9);
    g.rotation.y = 0.22;
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
    const bird = sparrowBird(g, 1.15);
    bird.position.set(0.4, 4.12 + up, 0.02);
    bird.rotation.y = 0.15;
    // the bird stands on a little perch block
    add(g, rbox(1.0, 0.14, 0.42, 0.05), ink(COL.woodDark), 0.4, 4.12 + up, 0);
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
    for (const [bx, bz, br] of [[-7.6, 2.4, PI / 2], [6.8, -1.6, -PI / 2]]) {
      const b = new THREE.Group();
      b.position.set(bx, DECK, bz);
      b.rotation.y = br;
      g.add(b);
      add(b, rbox(1.6, 0.08, 0.4, 0.03), ink(COL.wood3), 0, 0.27, 0);
      for (const sx of [-1, 1]) add(b, rbox(0.1, 0.26, 0.34, 0.03), ink(COL.woodDark), sx * 0.65, 0.13, 0);
    }
    for (const [x, z] of [[-8.0, 4.2], [8.0, 4.2], [-8.0, -4.2], [8.0, -4.2]]) lampPost(g, x, DECK, z, x > 0 ? -PI / 2 : PI / 2, lanternGlow);
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
    for (let x = -W / 2 + 0.5; x < W / 2 - 0.3; x += 0.62) add(g, rbox(0.08, H1 - 0.15, 0.06, 0.02), thin(shade(woodWall, -0.22)), x, H1 / 2, D / 2 + 0.02);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, rbox(0.32, H1 + H2 + 0.3, 0.32, 0.06), ink(COL.woodDeep), sx * W / 2, (H1 + H2) / 2, sz * D / 2);
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
    beam(g, ink(COL.iron), V3(0, H1 - 0.35, D / 2), V3(0, H1 - 0.35, D / 2 + 0.75), 0.06, 0.06, 0.02);
    add(g, cyl(0.2, 0.2, 0.42, 12), ink(COL.wood3), 0, H1 - 0.82, D / 2 + 0.7);
    add(g, torus(0.2, 0.03, 12, 4), thin(COL.hoop), 0, H1 - 0.72, D / 2 + 0.7, PI / 2);
    add(g, torus(0.2, 0.03, 12, 4), thin(COL.hoop), 0, H1 - 0.94, D / 2 + 0.7, PI / 2);
    add(g, torus(0.12, 0.045, 10, 5), ink(COL.wood3), 0.24, H1 - 0.82, D / 2 + 0.7, 0, 0, 0);
    add(g, sphere(10), ink(COL.white), 0, H1 - 0.57, D / 2 + 0.7, 0, 0, 0, [0.24, 0.13, 0.24]);
    for (const sx of [-1, 1]) rod(g, thin(COL.iron), V3(sx * 0.12, H1 - 0.35, D / 2 + 0.7), V3(sx * 0.12, H1 - 0.6, D / 2 + 0.7), 0.012, 4);
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
    crate(rg, 2.0, DECK, 2.0, 0.85, 0.4);
    crate(rg, -2.1, DECK, 1.9, 0.75, -0.2, COL.wood);
    netRack(rg, -2.2, DECK, -1.2, PI / 2);
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
    for (let bx = -w / 2 + 0.5; bx < w / 2 - 0.35; bx += 0.55) add(g, rbox(0.08, h - 0.25, 0.05, 0.02), bat, bx, h / 2 + 0.1, d / 2 + 0.02);
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
    // a round window on a side wall
    add(g, torus(0.24, 0.06, 16, 5), ink(COL.woodDeep), w / 2 + 0.04, h * 0.62, 0, 0, PI / 2, 0);
    add(g, cyl(0.22, 0.22, 0.05, 14), ink(COL.glass), w / 2 + 0.03, h * 0.62, 0, 0, 0, PI / 2);
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
    ['s1', 0.6, -0.6, 0.0, { w: 3.6, d: 3.0, h: 2.6, wall: WALLS[0], roof: ROOFS[1], patches: 2, chimney: 'pipe', lit: true }],
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
  }

  // ----- rope bridges (and their walk paths) -----
  const bridges = {
    plazaS1: bridge(plaza.at(5.6, -4.55), plats.s1.at(0.6, 2.5)),
    s1S2: bridge(plats.s1.at(3.0, 0.8), plats.s2.at(-2.7, 1.0)),
    tavernTower: bridge(tavernRaft.at(-4.3, -4.5), towerRaft.at(2.4, 2.4)),
    tavernS16: bridge(tavernRaft.at(-5.25, 1.5), plats.s16.at(2.7, 0.4)),
    yardS7: bridge(yard.at(2.5, -4.5), plats.s7.at(-1.2, 2.5)),
    plazaGarden: bridge(plaza.at(-8.45, 1.7), V3(GARDEN.x + 3.35, GARDEN.y - 0.05, GARDEN.z - 0.9)),
    plazaYard: bridge(plaza.at(8.5, -2.4), yard.at(-4.2, -1.0)),
    tavernS3: bridge(tavernRaft.at(1.5, -4.5), plats.s3.at(-1.0, 2.7)),
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
  bunting(V3(-2.9, DECK + 4.5, -6.85), V3(8.0, DECK + 2.55, -6.1), 0.7);
  tavernG.updateMatrixWorld(true);
  bunting(V3(-8.0, DECK + 2.55, -14.4), tavernG.localToWorld(V3(-4.2, 2.9, 2.75)), 0.3);
  bunting(V3(8.0, DECK + 2.55, -14.4), plats.s1.at(-2.75, 2.15, 2.4), 0.5);
  bunting(V3(-10.4, DECK + 2.55, -5.35), V3(-5.8, DECK + 2.55, -5.35), 0.45);
  bunting(V3(5.8, DECK + 2.55, -5.35), V3(10.4, DECK + 2.55, -5.35), 0.45);
  tavernG.updateMatrixWorld(true);
  bunting(towerRaft.at(1.15, 1.15, TOWER_H + 1.0), tavernG.localToWorld(V3(-4.6, 3.1 + 2.8, -1.4)), 1.0, { step: 0.6 });
  // laundry between the shacks
  laundry(plats.s1.at(-2.6, 2.2, 2.0), plats.s1.at(2.6, 2.3, 1.9), 0.25, [['shirt', COL.white, COL.red], ['pants', COL.blue], ['sock', COL.red], ['sock', COL.yellow], ['shirt', COL.yellow]]);
  laundry(plats.s4.at(-2.4, 2.2, 1.9), plats.s4.at(2.4, 2.2, 2.1), 0.2, [['sheet', COL.white], ['shirt', COL.pink], ['pants', COL.woodDark], ['sock', COL.teal]]);
  laundry(plats.s7.at(-2.3, 2.3, 2.0), plats.s7.at(2.3, 2.1, 2.0), 0.2, [['shirt', COL.white, COL.blue], ['shirt', COL.green], ['sock', COL.orange], ['pants', COL.navy]]);
  laundry(plats.s8.at(-2.2, 2.4, 1.8), plats.s8.at(2.2, 2.2, 1.9), 0.18, [['sheet', COL.cream], ['sock', COL.red], ['shirt', COL.purple]]);
  for (const pn of ['s1', 's4', 's7', 's8']) {
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
    const f = { p, action, aopts };
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
  // on the plaza benches (plaza-local (-7.6, 2.4) and (6.8, -1.6); seat top ~ SEAT_HEIGHT)
  person({ kind: 'old', seed: 307 }, 'sit', at(-7.45, -10.25 + 2.4), PI / 2); // grandpa
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
  person({ kind: 'woman', seed: 351, hat: 'straw' }, (t) => (t % 8 < 2.5 ? 'wave' : 'idle'), plats.s1.at(-1.6, 1.8), 0.1);
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
  // a walker crossing the bridge from the plaza to the first shack
  walker({ kind: 'woman', seed: 361, tool: 'bucket' }, [plaza.at(6.4, -3.3), ...bridges.plazaS1, plats.s1.at(0.4, 1.7)], { pause: 2.5 });
  walker({ kind: 'man', seed: 362, hat: 'straw' }, [...bridges.plazaYard, yard.at(-2.6, -1.4)], { pause: 2, off: 3 });

  // The showcase camera (main.js sways it across yaw ± yawRange): high enough to look over the near
  // bulwark at the crew mopping the deck, with the town and its people rising behind the ship.
  const VIEW = { target: [0.4, 3.3, -1.2], yaw: 0.15, yawRange: 0.42, dist: 17, height: 5.5 };
  // Where that camera is in the docked ship's frame (ship-local), in the middle and near both ends of the sway.
  const cameraSpots = () =>
    [0, -0.7, 0.7].map((u) => {
      const a = VIEW.yaw + VIEW.yawRange * u;
      const wx = VIEW.target[0] + Math.sin(a) * VIEW.dist - BERTH.x;
      const wz = VIEW.target[2] + Math.cos(a) * VIEW.dist - BERTH.z;
      const c = Math.cos(BERTH.h);
      const sn = Math.sin(BERTH.h);
      return { x: wx * c - wz * sn, y: VIEW.target[1] + VIEW.height, z: wx * sn + wz * c };
    });

  // ----- the cleaning crew (rides on the docked ship) -----
  const crewRig = new THREE.Group();
  crewRig.name = 'sparrow-crew';
  const crew = [];
  const addCrew = (opts, action, aopts = {}) => {
    const p = buildPerson(opts);
    crewRig.add(p);
    const c = { p, action, aopts };
    crew.push(c);
    return c;
  };
  const cMopA = addCrew({ kind: 'pirate', tool: 'mop', hat: 'bandana', seed: 11 }, 'mop');
  const cMopB = addCrew({ kind: 'pirate', tool: 'mop', hat: 'tricorn', seed: 23, beard: true }, 'mop', { phase: 1.3 });
  const cPolish = addCrew({ kind: 'pirate', tool: 'brush', seed: 41, hat: 'none', shirt: 0x3f8fd8 }, 'scrub', { wall: true });
  const cBosun = addCrew({ kind: 'pirate', tool: 'bucket', seed: 13, hat: 'tricorn' }, 'walk');
  const cPlank = addCrew({ kind: 'pirate', tool: 'brush', seed: 5, hat: 'bandana' }, 'scrub', { wall: true });
  const cBoat = addCrew({ kind: 'kid', tool: 'brush', seed: 2 }, 'scrub', { wall: true });
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
    const deckClear = (x, z) => {
      const hx = hullX(z, 1.5);
      return Math.min(propClear(x, z), hx === null ? -1 : hx * S - 0.14 - Math.abs(x));
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
    const seenFrom = cameraSpots();
    // top of the near bulwark along the ship: where its (near vertical) outside ends going up
    const railTop = [];
    for (let z = -4; z <= 5.001; z += 0.25) {
      const x0 = hullX(z, 1.3);
      let top = null;
      for (let y = 1.3; y <= 2.8 && x0 !== null; y += 0.05) {
        const x = hullX(z, y);
        if (x === null || Math.abs(x - x0) > 0.25) break;
        top = y;
      }
      railTop.push(top);
    }
    // Can the camera see a mop head here (q: ship-local, on the deck) over the near bulwark (and its
    // cap rail, a little inboard) and past the deck props (taken as 0.8 tall: barrels, coils, the
    // hatch coaming, the foot of a mast)?
    const visible = (q, cam) => {
      const top = railTop[clamp(Math.round((q.z + 4) / 0.25), 0, railTop.length - 1)];
      const xb = top === null ? null : hullX(q.z, top - 0.05);
      if (xb === null) return false;
      const y = q.y + 0.08;
      const xi = xb - S * 0.3;
      if (cam.y + ((xi - cam.x) / (q.x - cam.x)) * (y - cam.y) < top + 0.05) return false;
      // the stretch of the sight line low over the deck, from t0 to the mop head (t = 1)
      const t0 = 1 - 0.8 / (cam.y - y);
      const ax = cam.x + (q.x - cam.x) * t0;
      const az = cam.z + (q.z - cam.z) * t0;
      const dx = q.x - ax;
      const dz = q.z - az;
      const dd = dx * dx + dz * dz || 1;
      for (const k of blockers) {
        if (k.r !== undefined) {
          const t = clamp(((k.x - ax) * dx + (k.z - az) * dz) / dd, 0, 1);
          if (Math.hypot(ax + dx * t - k.x, az + dz * t - k.z) < k.r) return false;
        } else {
          // segment against the box (slabs)
          let lo = 0;
          let hi = 1;
          if (Math.abs(dx) > 1e-9) {
            const t1 = (k.x - k.hx - ax) / dx;
            const t2 = (k.x + k.hx - ax) / dx;
            lo = Math.max(lo, Math.min(t1, t2));
            hi = Math.min(hi, Math.max(t1, t2));
          } else if (Math.abs(ax - k.x) > k.hx) continue;
          if (Math.abs(dz) > 1e-9) {
            const t1 = (k.z - k.hz - az) / dz;
            const t2 = (k.z + k.hz - az) / dz;
            lo = Math.max(lo, Math.min(t1, t2));
            hi = Math.min(hi, Math.max(t1, t2));
          } else if (Math.abs(az - k.z) > k.hz) continue;
          if (lo <= hi) return false;
        }
      }
      return true;
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
    const q = V3();
    const bodies = [V3(px, w.y, w.z)]; // the crew on deck so far
    const mops = []; // and where their mop heads go
    // Deck maps on a 0.1 grid (ship-local x, z): room around each point, and how much the camera sees
    // of a mop head there (2 from the middle of its sway, 1 from near each end).
    const G0X = -1.6;
    const G0Z = -3.6;
    const GNX = 33;
    const GNZ = 92;
    const roomMap = new Float32Array(GNX * GNZ);
    const seenMap = new Uint8Array(GNX * GNZ);
    for (let iz = 0; iz < GNZ; iz++) {
      for (let ix = 0; ix < GNX; ix++) {
        q.set(G0X + ix * 0.1, a.y, G0Z + iz * 0.1);
        const room = deckClear(q.x, q.z);
        roomMap[iz * GNX + ix] = room;
        if (room > 0.2) seenMap[iz * GNX + ix] = (visible(q, seenFrom[0]) ? 2 : 0) + (visible(q, seenFrom[1]) ? 1 : 0) + (visible(q, seenFrom[2]) ? 1 : 0);
      }
    }
    const cell = (x, z) => {
      const ix = Math.round((x - G0X) / 0.1);
      const iz = Math.round((z - G0Z) / 0.1);
      return ix >= 0 && ix < GNX && iz >= 0 && iz < GNZ ? iz * GNX + ix : -1;
    };
    const roomAt = (x, z) => {
      const i = cell(x, z);
      return i < 0 ? -1 : roomMap[i] - 0.05; // (less half a cell)
    };
    const mopSpot = (arc, home, penalty, minClear) => {
      let best = null;
      for (let x = -0.8; x <= 1.21; x += 0.2) {
        for (let z = -2.5; z <= 3.76; z += 0.25) {
          const fx = -S * x;
          if (roomAt(fx, z) < 0.3 || bodies.some((o) => Math.hypot(o.x - fx, o.z - z) < 0.9) || mops.some((o) => Math.hypot(o.x - fx, o.z - z) < 0.55)) continue;
          for (let k = 0; k < 16; k++) {
            const h = -PI + (k / 16) * TAU;
            const ch = Math.cos(h);
            const sh = Math.sin(h);
            // the whole stroke clear of the props, the bulwarks and the others: the mop head
            // (radius ~0.15), and its handle on the way back to the hands
            let clear = Infinity;
            let seen = 0;
            for (const l of arc) {
              const hx = fx + l.x * ch + l.z * sh;
              const hz = z - l.x * sh + l.z * ch;
              clear = Math.min(clear, roomAt(hx, hz) - 0.15, roomAt(fx + (hx - fx) * 0.6, z + (hz - z) * 0.6) - 0.05);
              for (const o of bodies) clear = Math.min(clear, Math.hypot(hx - o.x, hz - o.z) - 0.55);
              for (const o of mops) clear = Math.min(clear, Math.hypot(hx - o.x, hz - o.z) - 0.35);
              if (clear < minClear) break;
              seen += seenMap[cell(hx, hz)];
            }
            if (clear < minClear) continue;
            // (as a last resort, simply the most room)
            const score = minClear === -Infinity ? clear + seen / 64 : seen / 32 + sh * S * 0.6 - Math.hypot(fx - home.x, z - home.z) * 0.15 - penalty;
            if (!best || score > best.score) best = { p: { x: fx, y: home.y, z }, h, score };
          }
        }
      }
      return best;
    };
    const pickMop = (c, home, h0) => {
      // full strokes where there is room, shorter ones on a deck crowded by the upgrades
      let best = null;
      for (const minClear of [0.1, 0, -Infinity]) {
        for (const sweep of minClear === -Infinity ? [0.15] : [1, 0.6, 0.35, 0.15]) {
          c.aopts.sweep = sweep;
          const arc = mopLocal(c);
          const found = mopSpot(arc, home, (1 - sweep) * 0.8, minClear); // long strokes look best
          if (found && (!best || found.score > best.score)) best = { ...found, arc, sweep };
        }
        if (best) break;
      }
      if (!best) {
        // (only if the whole deck were full: his usual spot, short strokes)
        c.aopts.sweep = 0.15;
        best = { p: home, h: h0, arc: mopLocal(c), sweep: 0.15 };
      }
      c.aopts.sweep = best.sweep;
      place(c, best.p, best.h);
      const ch = Math.cos(best.h);
      const sh = Math.sin(best.h);
      const heads = best.arc.map((l) => V3(best.p.x + l.x * ch + l.z * sh, best.p.y + l.y, best.p.z - l.x * sh + l.z * ch));
      bodies.push(V3(best.p.x, best.p.y, best.p.z));
      mops.push(...heads);
      return { ...best, heads };
    };
    const mA = pickMop(cMopA, a, -PI / 2 + 0.35);
    const mB = pickMop(cMopB, b, -PI / 2 + 0.25);
    // the bosun walks the quarterdeck with a bucket
    crewState.bosunPath = [V3(q0.x, q0.y, q0.z), V3(q1.x, q1.y, q1.z)];
    place(cBosun, q1, -PI / 2);
    // suds on the deck where the mops sweep (and by the polisher), with soap bubbles rising from them
    const suds = flat(COL.foam);
    const mid = (heads) => heads.reduce((m, h) => m.add(h), V3()).multiplyScalar(1 / heads.length);
    for (const [p, n, r0, mop] of [[mid(mA.heads), 9, 0.25, true], [mid(mB.heads), 9, 0.25, true], [w, 4, 0.45, false]]) {
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU + 0.4;
        const r = r0 + ((i * 37) % 7) * 0.06;
        const x = p.x + Math.cos(ang) * r * 0.8;
        const z = p.z + Math.sin(ang) * r;
        if (mop && deckClear(x, z) < 0.12) continue; // not into the props or the bulwark
        add(props, sphere(8), suds, x, (mop ? a.y : p.y) + 0.02, z, 0, 0, 0, [0.16 + (i % 3) * 0.04, 0.06, 0.14 + (i % 2) * 0.05]);
      }
      // the moppers' bubbles rise from the mop, not in front of their faces
      if (mop) emitters.push({ p: V3(p.x, a.y + 0.1, p.z), spread: 0.4, rise: 0.9, n: 0 });
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
    // a painter's line from the rowboat to the rail
    rod(props, thin(COL.rope), V3(bx - S * 0.2, 0.42, bp.z + 1.05), V3((hullX(bp.z + 1.5, 1.7) ?? -1.7) + S * 0.03, 1.86, bp.z + 1.5), 0.02, 4);
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
  function update(t) {
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
    // townsfolk
    for (const f of folk) {
      let act = typeof f.action === 'function' ? f.action(t) : f.action;
      if (f.path) {
        const moving = walkerPose(f, t);
        if (!moving) act = 'idle'; // a breather at each end of the path
      }
      animatePerson(f.p, t, act, f.aopts);
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
    peopleCount: folk.length + crew.length,
    update,
    dispose,
    group: root,
  };
}
