import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, mergeStatic, ensureIndex, gradientMap, noOutline } from './style.js';
import { SHIP_TYPES, gunOffset } from './shipTypes.js';
import { findLook, maxTier } from './upgrades.js';

// Cartoon ship models.
//
// Every ship is built from smooth, chunky pieces so the ink outline (OutlineEffect)
// stays unbroken: a lofted hull with a rounded cap rail, puffy "pillow" sails, capsule
// spars and rounded boxes. Static parts are merged per material with mergeStatic();
// sails, flags, flames and smoke keep their own meshes (userData.keep) so
// animateShip() can billow, flutter and flicker them without touching geometry.
//
// Geometry contract (see shipTypes.js): origin at the waterline amidships, bow
// towards +z, hull length ~len along z, overall width ~wid, deck ~1.2 (big ships
// up to 1.8), keel ~-0.8, cannons at z = gunOffset(type, i), y ~0.8 on both sides.
// With mesh.rotation.y = heading, ship-local +x is PORT and -x is STARBOARD.
//
// Battle damage (SPEC2 §2.4) is shown without rebuilding anything: addHole() stamps a
// splintered hole decal (one InstancedMesh per ship), setShipDamage() slackens the sails,
// lights a deck fire, lets one sail droop and drops the top sail on MAST DOWN (a sail
// merged into its mast's mesh is split off by index range, sharing the buffers), and
// hoistFlag() strikes her colours for a white flag or your own. projectileMesh() makes
// the round, chain and grape shot.

const PI = Math.PI;
const TAU = PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const tri = (x) => 1 - Math.abs(2 * (x - Math.floor(x)) - 1); // 0..1 triangle wave
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0);
const FWD = V3(0, 0, 1);

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

const THIN = { thickness: 0.0042 }; // lighter ink for small details
const mat = (c, o) => toon(c, o);
const thin = (c) => toon(c, { outline: THIN });
const flat = (c) => toon(c, { outline: false });

/** Per-ship glow material (cloned so each ship flickers on its own). */
function glow(S, color, intensity = 1, outline = true, flicker = 0.18) {
  const key = `${color}|${intensity}|${outline}`;
  let g = S.glowCache.get(key);
  if (!g) {
    const m = toon(color, { emissive: color, emissiveIntensity: intensity, outline: outline ? THIN : false }).clone();
    g = { m, base: intensity, amt: flicker, f: 5 + Math.random() * 4, ph: Math.random() * 10 };
    S.glowCache.set(key, g);
    S.glows.push(g);
  }
  return g.m;
}

// ---------------------------------------------------------------------------
// Cached primitive geometries (static parts are cloned by mergeStatic anyway)
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
const sphere = () => cached('sph', () => new THREE.SphereGeometry(1, 16, 12));
const sphereLo = () => cached('sphlo', () => new THREE.SphereGeometry(1, 10, 7));
/** Lumpy cartoon smoke puff: a few overlapping spheres, about 1 unit across. */
const puffGeo = () =>
  cached('puff', () =>
    mergeGeometries(
      [[0, 0, 0, 0.62], [0.42, 0.1, 0.08, 0.46], [-0.4, 0.05, -0.1, 0.44], [0.05, 0.36, 0.02, 0.44], [0.0, 0.02, 0.4, 0.38]].map(([x, y, z, r]) =>
        new THREE.SphereGeometry(r, 12, 8).translate(x, y, z),
      ),
      false,
    ),
  );
const cyl = (rt, rb, h, seg = 12, open = false) =>
  cached(`cyl${r3(rt)},${r3(rb)},${r3(h)},${seg},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
const capsule = (r, len, seg = 10) =>
  cached(`cap${r3(r)},${r3(len)},${seg}`, () => new THREE.CapsuleGeometry(r, Math.max(0.001, len), seg <= 6 ? 1 : seg <= 8 ? 2 : 3, seg));
// small rounded boxes get a single bevel segment (108 instead of 300 triangles)
const rbox = (w, h, d, r = 0.1) =>
  cached(`rb${r3(w)},${r3(h)},${r3(d)},${r3(r)}`, () =>
    new RoundedBoxGeometry(w, h, d, Math.max(w, h, d) < 1.1 ? 1 : 2, Math.min(r, w / 2, h / 2, d / 2) * 0.999));
const torus = (R, r, ts = 20, rs = 8, arc = TAU) =>
  cached(`tor${r3(R)},${r3(r)},${ts},${rs},${r3(arc)}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc));
const cone = (r, h, seg = 10) => cached(`cone${r3(r)},${r3(h)},${seg}`, () => new THREE.ConeGeometry(r, h, seg, 1));
function lathe(key, pts, seg = 12) {
  return cached('lathe' + key, () => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg));
}

/** Add a mesh to a parent with position / Euler rotation / scale arrays. */
function add(parent, geo, material, p, r, s) {
  // tiny spheres don't need the full resolution
  if (geo === geoCache.get('sph') && s !== undefined && Math.max(...(typeof s === 'number' ? [s] : s)) < 0.22) geo = sphereLo();
  const m = new THREE.Mesh(geo, material);
  if (p) m.position.set(p[0], p[1], p[2]);
  if (r) m.rotation.set(r[0], r[1], r[2], r[3] || 'XYZ');
  if (s !== undefined) {
    if (typeof s === 'number') m.scale.setScalar(s);
    else m.scale.set(s[0], s[1], s[2]);
  }
  parent.add(m);
  return m;
}

/** Capsule (rounded stick) between two points. */
function rod(parent, material, a, b, r, seg = 10) {
  const d = V3().subVectors(b, a);
  const len = d.length();
  const m = new THREE.Mesh(capsule(r, Math.max(0.001, len), seg), material);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  parent.add(m);
  return m;
}

/** Open tapered cylinder between two points (ends must be hidden). */
function spar(parent, material, a, b, r0, r1 = r0, seg = 10) {
  const d = V3().subVectors(b, a);
  const len = d.length();
  const m = new THREE.Mesh(cyl(r1, r0, len, seg, true), material);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  parent.add(m);
  return m;
}

/** Orient an object so its local +z points along `dir`. */
function aim(obj, dir) {
  obj.quaternion.setFromUnitVectors(FWD, dir.clone().normalize());
  return obj;
}

// ---------------------------------------------------------------------------
// Generic geometry helpers
// ---------------------------------------------------------------------------

/**
 * Indexed grid surface from rows x cols points (row-major). `outward(p)` gives the
 * expected outward direction near the middle cell, used to pick the winding.
 */
function gridGeometry(pts, rows, cols, outward, cells) {
  const pos = new Float32Array(rows * cols * 3);
  pts.forEach((p, i) => p.toArray(pos, i * 3));
  const idx = [];
  // pick winding from a reference cell near the middle
  const ri = Math.floor((rows - 1) / 2);
  const rj = Math.floor((cols - 1) / 2);
  const a = pts[ri * cols + rj];
  const b = pts[(ri + 1) * cols + rj];
  const c = pts[(ri + 1) * cols + rj + 1];
  const n = V3().subVectors(b, a).cross(V3().subVectors(c, a));
  const want = outward(V3().addVectors(a, c).multiplyScalar(0.5));
  const flip = n.dot(want) < 0;
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      if (cells && !cells(i, j)) continue;
      const i00 = i * cols + j;
      const i10 = (i + 1) * cols + j;
      const i11 = (i + 1) * cols + j + 1;
      const i01 = i * cols + j + 1;
      if (flip) idx.push(i00, i11, i10, i00, i01, i11);
      else idx.push(i00, i10, i11, i00, i11, i01);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(rows * cols * 2), 2));
  return g;
}

/** A sub-set of an indexed grid's cells sharing its (smooth) attributes. */
function subGrid(full, rows, cols, cells) {
  const src = full.index.array;
  const idx = [];
  let k = 0;
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++, k += 6) {
      if (cells(i, j)) for (let q = 0; q < 6; q++) idx.push(src[k + q]);
    }
  }
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) g.setAttribute(name, full.attributes[name]);
  g.setIndex(idx);
  return g;
}

/**
 * Tapered tube along a curve. rFn(t) gives the radius (t 0..1). Normals are radial,
 * so the outline is smooth. Ends with radius > 0 are closed with a small dome.
 */
function taperTube(points, rFn, segs = 24, radial = 10, closedCurve = false) {
  const curve = new THREE.CatmullRomCurve3(points, closedCurve, 'centripetal');
  const frames = curve.computeFrenetFrames(segs, closedCurve);
  const pos = [];
  const nor = [];
  const idx = [];
  const ring = (center, N, B, r) => {
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * TAU;
      const n = V3().addScaledVector(N, Math.cos(a)).addScaledVector(B, Math.sin(a)).normalize();
      pos.push(center.x + n.x * r, center.y + n.y * r, center.z + n.z * r);
      nor.push(n.x, n.y, n.z);
    }
  };
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    ring(curve.getPointAt(t), frames.normals[i], frames.binormals[i], Math.max(0.0005, rFn(t)));
  }
  const rl = radial + 1;
  for (let i = 0; i < segs; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * rl + k;
      const b = (i + 1) * rl + k;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  // dome caps
  const cap = (end) => {
    const t = end ? 1 : 0;
    const r = rFn(t);
    if (r < 0.01) return;
    const c = curve.getPointAt(t);
    const T = curve.getTangentAt(t).multiplyScalar(end ? 1 : -1);
    const fi = end ? segs : 0;
    const N = frames.normals[fi];
    const B = frames.binormals[fi];
    const base = pos.length / 3;
    const rings = 3;
    for (let q = 1; q <= rings; q++) {
      const ang = (q / rings) * (PI / 2);
      const rr = Math.cos(ang) * r;
      const off = Math.sin(ang) * r * 0.8;
      for (let k = 0; k <= radial; k++) {
        const a = (k / radial) * TAU;
        const radialDir = V3().addScaledVector(N, Math.cos(a)).addScaledVector(B, Math.sin(a));
        const n = radialDir.clone().multiplyScalar(Math.cos(ang)).addScaledVector(T, Math.sin(ang)).normalize();
        pos.push(c.x + radialDir.x * rr + T.x * off, c.y + radialDir.y * rr + T.y * off, c.z + radialDir.z * rr + T.z * off);
        nor.push(n.x, n.y, n.z);
      }
    }
    const first = end ? segs * rl : 0;
    for (let q = 0; q < rings; q++) {
      const ra = q === 0 ? first : base + (q - 1) * rl;
      const rb_ = base + q * rl;
      for (let k = 0; k < radial; k++) {
        if (end) idx.push(ra + k, rb_ + k, ra + k + 1, rb_ + k, rb_ + k + 1, ra + k + 1);
        else idx.push(ra + k, ra + k + 1, rb_ + k, rb_ + k, ra + k + 1, rb_ + k + 1);
      }
    }
  };
  cap(false);
  cap(true);
  for (let i = 0; i < idx.length; i += 3) {
    const t = idx[i + 1];
    idx[i + 1] = idx[i + 2];
    idx[i + 2] = t;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  return g;
}

/**
 * Merge geometries into one, with one draw group per distinct material. Also returns
 * where each part ended up: ranges[i] = { materialIndex, start, count } (index range of
 * parts[i] inside the merged geometry), so a piece can later be drawn on its own.
 */
function mergeByMaterial(parts) {
  const byMat = new Map();
  const where = [];
  for (const { geo, material } of parts) {
    const g = new THREE.BufferGeometry().copy(geo);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.morphAttributes = {};
    ensureIndex(g);
    const list = byMat.get(material) || [];
    where.push({ material, at: list.reduce((n, q) => n + q.index.count, 0), count: g.index.count });
    list.push(g);
    byMat.set(material, list);
  }
  const mats = [];
  const geos = [];
  for (const [m, list] of byMat) {
    mats.push(m);
    geos.push(list.length === 1 ? list[0] : mergeGeometries(list, false));
  }
  const merged = mergeGeometries(geos, true);
  const ranges = where.map((w) => {
    const mi = mats.indexOf(w.material);
    return { materialIndex: mi, start: merged.groups[mi].start + w.at, count: w.count };
  });
  return { geometry: merged, materials: mats.length === 1 ? mats[0] : mats, ranges };
}

/** Join index ranges (same material and touching) into as few draw groups as possible. */
function joinRanges(list) {
  const out = [];
  for (const r of [...list].sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && last.materialIndex === r.materialIndex && last.start + last.count === r.start) last.count += r.count;
    else out.push({ ...r });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2D emblem shapes (unit size, centred)
// ---------------------------------------------------------------------------

function circlePath(cx, cy, r, P = THREE.Path) {
  const p = new P();
  p.absarc(cx, cy, r, 0, TAU, false);
  return p;
}
function polyShape(pts) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}
function roundRectShape(w, h, r, cx = 0, cy = 0) {
  const s = new THREE.Shape();
  const x = cx - w / 2;
  const y = cy - h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, PI / 2, PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, PI, PI * 1.5, false);
  return s;
}

/** Cartoon skull: big round cranium, eye sockets, nose and two tooth gaps. */
function skullShape(cx = 0, cy = 0, s = 1) {
  const X = (x) => cx + x * s;
  const Y = (y) => cy + y * s;
  const sh = new THREE.Shape();
  const r = 0.42 * s;
  const ccx = X(0);
  const ccy = Y(0.1);
  const jw = 0.25;
  const a0 = Math.asin(clamp(jw / 0.42, -1, 1));
  sh.moveTo(X(-0.22), Y(-0.5));
  sh.lineTo(X(0.22), Y(-0.5));
  sh.quadraticCurveTo(X(jw), Y(-0.5), X(jw), Y(-0.42));
  sh.lineTo(X(jw), Y(0.1 - Math.cos(a0) * 0.42));
  sh.absarc(ccx, ccy, r, -PI / 2 + a0, PI * 1.5 - a0, false);
  sh.lineTo(X(-jw), Y(-0.42));
  sh.quadraticCurveTo(X(-jw), Y(-0.5), X(-0.22), Y(-0.5));
  sh.holes.push(circlePath(X(-0.165), Y(0.06), 0.125 * s));
  sh.holes.push(circlePath(X(0.165), Y(0.06), 0.125 * s));
  const nose = new THREE.Path();
  nose.moveTo(X(0), Y(-0.1));
  nose.lineTo(X(-0.065), Y(-0.22));
  nose.lineTo(X(0.065), Y(-0.22));
  nose.closePath();
  sh.holes.push(nose);
  for (const tx of [-0.08, 0.08]) {
    const t = new THREE.Path();
    t.moveTo(X(tx - 0.022), Y(-0.45));
    t.lineTo(X(tx + 0.022), Y(-0.45));
    t.lineTo(X(tx + 0.022), Y(-0.33));
    t.lineTo(X(tx - 0.022), Y(-0.33));
    t.closePath();
    sh.holes.push(t);
  }
  return sh;
}

/** Two crossed bones with knobbly ends. */
function boneShapes(cx = 0, cy = 0, s = 1, len = 1.25) {
  const out = [];
  for (const ang of [0.62, -0.62]) {
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    const R = (x, y) => [cx + (x * c - y * sn) * s, cy + (x * sn + y * c) * s];
    const hl = len / 2 - 0.06;
    const hw = 0.065;
    out.push(polyShape([R(-hl, -hw), R(hl, -hw), R(hl, hw), R(-hl, hw)]));
    for (const ex of [-hl, hl]) {
      for (const ey of [-0.075, 0.075]) {
        const [px, py] = R(ex + Math.sign(ex) * 0.03, ey);
        const k = new THREE.Shape();
        k.absarc(px, py, 0.095 * s, 0, TAU, false);
        out.push(k);
      }
    }
  }
  return out;
}

/** Skull and crossbones (Jolly Roger emblem), ~1.3 units wide. */
function jollyRogerShapes(s = 1) {
  return [...boneShapes(0, -0.18 * s, s), skullShape(0, 0.12 * s, s * 0.9)];
}

/** Ship's anchor, ~1 unit tall. */
function anchorShapes() {
  const out = [];
  const ring = new THREE.Shape();
  ring.absarc(0, 0.4, 0.12, 0, TAU, false);
  ring.holes.push(circlePath(0, 0.4, 0.055));
  out.push(ring);
  out.push(roundRectShape(0.11, 0.78, 0.04, 0, -0.04)); // shank
  out.push(roundRectShape(0.56, 0.1, 0.05, 0, 0.2)); // stock
  // arms: arc band
  const arms = new THREE.Shape();
  const a0 = PI + 0.38;
  const a1 = TAU - 0.38;
  const R0 = 0.44;
  const R1 = 0.33;
  arms.absarc(0, 0.02, R0, a0, a1, false);
  arms.absarc(0, 0.02, R1, a1, a0, true);
  arms.closePath();
  out.push(arms);
  // flukes (arrow heads at the arm tips)
  for (const sd of [-1, 1]) {
    const ang = sd > 0 ? a1 : a0;
    const mx = Math.cos(ang) * ((R0 + R1) / 2);
    const my = 0.02 + Math.sin(ang) * ((R0 + R1) / 2);
    out.push(
      polyShape([
        [mx + sd * 0.13, my + 0.17],
        [mx + sd * 0.19, my - 0.08],
        [mx - sd * 0.1, my - 0.05],
      ]),
    );
  }
  out.push(circlePath(0, -0.42, 0.075, THREE.Shape)); // crown
  return out;
}

function extrude(shapes, depth, curveSegments = 8) {
  const g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments });
  g.translate(0, 0, -depth / 2);
  return g;
}

// ---------------------------------------------------------------------------
// Hull: a lofted, smooth-normal solid with a rounded cap rail and a deck
// ---------------------------------------------------------------------------

/**
 * o: { L, W, rail, deck, bw, keel, yc, n, tumble, sternLen, sternP, bowStart, bowP, bowQ,
 *      bowRise, sternRise, bowLift, sternLift, bowRake, sternRake, midPinch,
 *      breaks: [{rel}|{abs}] (top to bottom) }
 */
function makeHull(o) {
  const L = o.L;
  const HW = o.W / 2;
  const rb = (o.bw ?? 0.2) / 2;
  const D = o.deck ?? 1.2;
  const tumble = o.tumble ?? 0.08;
  const n = o.n ?? 2.5;
  const us = o.sternLen ?? 0.1;
  const ps = o.sternP ?? 2.6;
  const ub = o.bowStart ?? 0.6;
  const pb = o.bowP ?? 2;
  const qb = o.bowQ ?? 0.6;
  const keel0 = o.keel ?? -0.8;
  const plan = (u) => {
    let f = 1 - (o.midPinch ?? 0.05) * ((u - 0.45) / 0.55) ** 2;
    if (u < us) {
      const s = (us - u) / us;
      f *= Math.pow(Math.max(0, 1 - s ** ps), 1 / ps);
    }
    if (u > ub) {
      const s = (u - ub) / (1 - ub);
      f *= Math.pow(Math.max(0, 1 - s ** pb), qb);
    }
    return f;
  };
  const sternSpan = o.sternRiseSpan ?? 0.3;
  const rail = (u) =>
    o.rail +
    (o.sternRise ?? 0.3) * Math.max(0, 1 - u / sternSpan) ** 2 +
    (o.bowRise ?? 0.5) * Math.max(0, (u - 0.55) / 0.45) ** 2;
  const keel = (u) =>
    keel0 + (o.bowLift ?? 1.0) * Math.max(0, (u - 0.68) / 0.32) ** 2 + (o.sternLift ?? 0.7) * Math.max(0, (0.22 - u) / 0.22) ** 2;
  const beam = (u) => clamp(o.yc ?? 0.6, keel(u) + 0.12, rail(u) - rb - 0.15);
  const xAt = (u, y) => {
    const W = HW * plan(u);
    const yTop = rail(u) - rb;
    const C = beam(u);
    const K = keel(u);
    if (y >= C) {
      const t = (y - C) / Math.max(0.01, yTop - C);
      return W * (1 - tumble * t * t);
    }
    const s = clamp((C - y) / Math.max(0.01, C - K), 0, 1);
    return W * Math.pow(Math.max(0, 1 - Math.pow(s, n)), 1 / n);
  };
  const bowRake = o.bowRake ?? 0.4;
  const sternRake = o.sternRake ?? 0.2;
  const zAt = (u, y) =>
    -L / 2 + u * L + bowRake * sstep(ub, 1, u) * (y - D) - sternRake * (1 - sstep(0, us * 1.6, u)) * (y - D);

  const breaks = o.breaks || [];
  const SUB = 2;
  const NL = 9;
  const rowsY = (u) => {
    const yTop = rail(u) - rb;
    const K = keel(u);
    const ys = [yTop];
    let prev = yTop;
    for (const b of breaks) {
      let y = b.rel != null ? yTop + b.rel : b.abs;
      y = clamp(y, K + 0.03, prev - 0.0005);
      for (let k = 1; k <= SUB; k++) ys.push(lerp(prev, y, k / SUB));
      prev = y;
    }
    for (let k = 1; k <= NL; k++) ys.push(prev - (prev - K) * Math.sin((PI / 2) * (k / NL)));
    return ys;
  };

  const NS = o.stations ?? 44;
  const usArr = [];
  for (let i = 0; i <= NS; i++) usArr.push(0.5 - 0.5 * Math.cos((PI * i) / NS));
  const rows = NS + 1;

  // --- outer skin (port top -> keel -> starboard top)
  const m = SUB * breaks.length + NL; // keel row index
  const colsO = 2 * m + 1;
  const outerPts = [];
  for (const u of usArr) {
    const ys = rowsY(u);
    for (let j = 0; j < colsO; j++) {
      const r = j <= m ? j : 2 * m - j;
      const y = ys[r];
      const x = xAt(u, y) * (j < m ? -1 : 1) * (j === m ? 0 : 1);
      outerPts.push(V3(x, y, zAt(u, y)));
    }
  }
  const outer = gridGeometry(outerPts, rows, colsO, (p) => V3(p.x, p.y - 0.4, 0));
  const bandGeos = [];
  for (let b = 0; b <= breaks.length; b++) {
    const r0 = b * SUB;
    const r1 = b === breaks.length ? m : (b + 1) * SUB;
    const inBand = (j) => (j >= r0 && j <= r1) || (j >= 2 * m - r1 && j <= 2 * m - r0);
    bandGeos.push(subGrid(outer, rows, colsO, (i, j) => inBand(j) && inBand(j + 1)));
  }

  // --- cap rail (rounded rim), inner bulwark wall and deck
  const RIM = 6;
  const rimPts = [];
  const wallPts = [];
  const deckPts = [];
  const DECKC = 5;
  for (const u of usArr) {
    const yTop = rail(u) - rb;
    const xo = xAt(u, yTop);
    const r = Math.min(rb, xo / 2);
    const xi = xo - 2 * r;
    // rim: port then starboard, each from outer over the top to inner
    const rimRow = [];
    for (const sd of [-1, 1]) {
      for (let k = 0; k <= RIM; k++) {
        const a = (k / RIM) * PI;
        const x = (xo - r + Math.cos(a) * r) * sd;
        const y = yTop + Math.sin(a) * rb;
        rimRow.push(V3(x, y, zAt(u, y)));
      }
    }
    rimPts.push(...rimRow);
    const yd = Math.min(D, yTop);
    for (const sd of [-1, 1]) {
      wallPts.push(V3(xi * sd, yTop, zAt(u, yTop)));
      wallPts.push(V3(xi * sd, lerp(yTop, yd, 0.5), zAt(u, lerp(yTop, yd, 0.5))));
      wallPts.push(V3(xi * sd, yd, zAt(u, yd)));
    }
    for (let k = 0; k < DECKC; k++) deckPts.push(V3(lerp(-xi, xi, k / (DECKC - 1)), yd, zAt(u, yd)));
  }
  const rimCols = 2 * (RIM + 1);
  const rimHalf = (sd) => {
    const pts = [];
    for (let i = 0; i < rows; i++) for (let k = 0; k <= RIM; k++) pts.push(rimPts[i * rimCols + (sd < 0 ? 0 : RIM + 1) + k]);
    return gridGeometry(pts, rows, RIM + 1, (p) => V3(p.x, 1.5, 0));
  };
  const wallHalf = (sd) => {
    const pts = [];
    for (let i = 0; i < rows; i++) for (let k = 0; k < 3; k++) pts.push(wallPts[i * 6 + (sd < 0 ? 0 : 3) + k]);
    return gridGeometry(pts, rows, 3, (p) => V3(-p.x, 0, 0));
  };
  const deck = gridGeometry(deckPts, rows, DECKC, () => UP);

  const uAt = (z) => clamp((z + L / 2) / L, 0, 1);
  return {
    L,
    HW,
    D,
    rb,
    plan,
    rail,
    keel,
    xAt,
    zAt,
    uAt,
    bands: bandGeos,
    rims: [rimHalf(-1), rimHalf(1)],
    walls: [wallHalf(-1), wallHalf(1)],
    deck,
    railAt: (z) => rail(uAt(z)),
    widthAt: (z, y) => xAt(uAt(z), y),
    /** Point on the outer skin and its outward normal. side = +1 starboard, -1 port. */
    surface(z, y, side) {
      const u = uAt(z);
      const du = 0.002;
      const x = xAt(u, y);
      const dxdz = (xAt(clamp(u + du, 0, 1), y) - xAt(clamp(u - du, 0, 1), y)) / (2 * du * L);
      const dy = 0.01;
      const dxdy = (xAt(u, y + dy) - xAt(u, y - dy)) / (2 * dy);
      const nrm = V3(side, -dxdy, -dxdz).normalize();
      return { p: V3(x * side, y, z), n: nrm };
    },
    /** Bow stem line (for the cutwater), bottom to top. */
    stem(k = 8) {
      const pts = [];
      const K1 = keel(0.985);
      const R1 = rail(1);
      for (let i = 0; i <= k; i++) {
        const y = lerp(K1 + 0.15, R1, i / k);
        pts.push(V3(0, y, zAt(1, y)));
      }
      return pts;
    },
  };
}

function addHull(S, hull, mats) {
  const g = S.group;
  hull.bands.forEach((geo, i) => add(g, geo, mats.bands[i]));
  for (const geo of hull.rims) add(g, geo, mats.rim);
  for (const geo of hull.walls) add(g, geo, mats.wall);
  add(g, hull.deck, mats.deck);
}

/** Wooden plank lines on the deck: thin darker strips (no outline). */
function deckPlanks(S, hull, color, z0, z1, n = 5) {
  const m = flat(color);
  for (let k = 1; k < n; k++) {
    const f = k / n - 0.5;
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const z = lerp(z0, z1, i / 12);
      const w = hull.widthAt(z, hull.D) - hull.rb * 2;
      if (w < 0.25) continue;
      pts.push(V3(f * 2 * w * 0.98, hull.D + 0.012, z));
    }
    if (pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const d = V3().subVectors(b, a);
      const len = d.length();
      const mm = add(S.group, cyl(0.03, 0.03, len, 4, true), m);
      mm.position.copy(a).addScaledVector(d, 0.5);
      mm.quaternion.setFromUnitVectors(UP, d.normalize());
      mm.scale.set(1, 1, 0.25);
    }
  }
}

// ---------------------------------------------------------------------------
// Sails: puffy closed "pillow" surfaces (smooth rim = clean outline)
// ---------------------------------------------------------------------------

/**
 * def: { map(a,b)->[x,y], belly(a,b)->z, thick, nu, nv, p }
 * a runs across (0..1), b runs from the head (0) to the foot (1).
 * Panel ranges a0..a1, b0..b1 allow multi-coloured stripes that join seamlessly.
 */
function sailThick(def, a, b) {
  const p = def.p ?? 6;
  const r = Math.pow(Math.abs(2 * a - 1) ** p + Math.abs(2 * b - 1) ** p, 1 / p);
  return (def.thick ?? 0.08) * Math.sqrt(Math.max(0, 1 - r ** p));
}
function sailSurfZ(def, a, b, side) {
  return def.belly(a, b) + side * sailThick(def, a, b);
}
function spacing(lo, hi, s, rimLo, rimHi) {
  let t;
  if (rimLo && rimHi) t = 0.5 - 0.5 * Math.cos(PI * s);
  else if (rimLo) t = 1 - Math.cos((PI / 2) * s);
  else if (rimHi) t = Math.sin((PI / 2) * s);
  else t = s;
  return lerp(lo, hi, t);
}
function pillowGeometry(def, a0 = 0, a1 = 1, b0 = 0, b1 = 1) {
  const nu = Math.max(2, Math.round((def.nu ?? 14) * (a1 - a0)) + 1);
  const nv = Math.max(2, Math.round((def.nv ?? 12) * (b1 - b0)) + 1);
  const as = [];
  const bs = [];
  for (let i = 0; i <= nu; i++) as.push(spacing(a0, a1, i / nu, a0 === 0, a1 === 1));
  for (let j = 0; j <= nv; j++) bs.push(spacing(b0, b1, j / nv, b0 === 0, b1 === 1));
  const pos = [];
  const uv = [];
  const F = [];
  const B = [];
  const isRim = (a, b) => a <= 0 || a >= 1 || b <= 0 || b >= 1;
  for (let i = 0; i <= nu; i++) {
    F.push([]);
    B.push([]);
    for (let j = 0; j <= nv; j++) {
      const a = as[i];
      const b = bs[j];
      const [x, y] = def.map(a, b);
      const zb = def.belly(a, b);
      const t = sailThick(def, a, b);
      F[i].push(pos.length / 3);
      pos.push(x, y, zb + t);
      uv.push(a, b);
      if (isRim(a, b)) B[i].push(F[i][j]);
      else {
        B[i].push(pos.length / 3);
        pos.push(x, y, zb - t);
        uv.push(a, b);
      }
    }
  }
  // winding: front faces +z
  const [xa, ya] = def.map(0.55, 0.5);
  const [xb, yb] = def.map(0.45, 0.5);
  const [xc, yc] = def.map(0.5, 0.55);
  const [xd, yd] = def.map(0.5, 0.45);
  const cz = (xa - xb) * (yc - yd) - (ya - yb) * (xc - xd);
  const flip = cz > 0;
  const idx = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      for (const [G, front] of [
        [F, true],
        [B, false],
      ]) {
        const v00 = G[i][j];
        const v10 = G[i + 1][j];
        const v01 = G[i][j + 1];
        const v11 = G[i + 1][j + 1];
        const f = front !== flip;
        if (f) idx.push(v00, v01, v11, v00, v11, v10);
        else idx.push(v00, v11, v01, v00, v10, v11);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Invert a sail map numerically: (x, y) -> (a, b). */
function invMap(def, x, y, guess) {
  let a = guess ? guess[0] : 0.5;
  let b = guess ? guess[1] : 0.5;
  const h = 1e-3;
  for (let it = 0; it < 12; it++) {
    const [px, py] = def.map(a, b);
    const [ax, ay] = def.map(a + h, b);
    const [bx, by] = def.map(a, b + h);
    const j11 = (ax - px) / h;
    const j21 = (ay - py) / h;
    const j12 = (bx - px) / h;
    const j22 = (by - py) / h;
    const det = j11 * j22 - j12 * j21;
    if (Math.abs(det) < 1e-9) break;
    const ex = x - px;
    const ey = y - py;
    a += (j22 * ex - j12 * ey) / det;
    b += (-j21 * ex + j11 * ey) / det;
    a = clamp(a, -0.2, 1.2);
    b = clamp(b, -0.2, 1.2);
  }
  return [clamp(a, 0, 1), clamp(b, 0, 1)];
}

/**
 * Emblem (decal) bent onto a sail surface. shapes are in a unit frame; the decal is
 * scaled by `size`, centred at the sail-local point (cx, cy), on side +1 (front, +z)
 * or -1 (back, mirrored so it reads correctly from behind).
 */
function sailDecal(def, shapes, size, cx, cy, side, depth = 0.07, rot = 0) {
  const g = extrude(shapes, depth / size, 8);
  g.scale(size, size, size);
  if (rot) g.rotateZ(rot);
  if (side < 0) g.rotateY(PI);
  g.translate(cx, cy, 0);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const lift = side * depth * 0.3;
  let guess = invMap(def, cx, cy);
  const sz = (x, y) => {
    const ab = invMap(def, x, y, guess);
    return sailSurfZ(def, ab[0], ab[1], side);
  };
  const e = 0.03;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z0 = sz(x, y);
    const gx = (sz(x + e, y) - sz(x - e, y)) / (2 * e);
    const gy = (sz(x, y + e) - sz(x, y - e)) / (2 * e);
    pos.setZ(i, pos.getZ(i) + z0 + lift);
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const nz = nor.getZ(i);
    const n = V3(nx - gx * nz, ny - gy * nz, nz).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

/** Square sail definition (trapezoid hanging from a yard at local y = 0). */
function squareDef(h, wt, wb, belly, o = {}) {
  const torn = o.torn ?? 0;
  const seed = o.seed ?? 1;
  return {
    nu: o.nu ?? (torn ? 20 : 14),
    nv: o.nv ?? (torn ? 11 : 12),
    thick: o.thick ?? 0.09,
    p: 6,
    map: (a, b) => {
      let y = -h * b;
      if (torn) {
        const jag = (0.55 + 0.45 * tri(a * 5.3 + seed * 0.37)) * tri(a * 3.1 + seed) * torn * h;
        y -= Math.pow(b, 6) * jag - Math.pow(b, 6) * torn * h * 0.35;
      }
      return [lerp(wt, wb, b) * (a - 0.5), y];
    },
    belly: (a, b) => belly * (0.3 + 0.7 * (1 - (2 * a - 1) ** 2)) * Math.sin(PI * b * 0.8),
  };
}

// ---------------------------------------------------------------------------
// Flags (morph-target waving, decal merged in as a second material group)
// ---------------------------------------------------------------------------

function flagMesh(S, o) {
  const len = o.len;
  const h = o.h;
  const shape = o.shape || 'rect';
  const def = {
    nu: o.nu ?? 16,
    nv: 4,
    thick: o.thick ?? 0.045,
    p: 5,
    map: (a, b) => {
      let taper = 1;
      if (shape === 'pennant') taper = 1 - 0.88 * a;
      let x = a * len;
      if (shape === 'swallow') x *= 1 - 0.28 * Math.pow(a, 3) * (1 - Math.abs(2 * b - 1));
      return [x, (0.5 - b) * h * taper];
    },
    belly: () => 0,
  };
  const parts = [{ geo: pillowGeometry(def), material: o.mat }];
  if (o.decal) {
    const d = o.decal;
    for (const side of [1, -1]) {
      const g = extrude(d.shapes, 0.06 / d.size, 8);
      g.scale(d.size, d.size, d.size);
      if (side < 0) g.rotateY(PI);
      g.translate(d.cx * len, d.cy ?? 0, side * (def.thick * 0.9));
      parts.push({ geo: g, material: d.mat });
    }
  }
  const { geometry, materials } = mergeByMaterial(parts);
  // two morph targets: sin / cos phases of a wave travelling away from the pole
  const k = (TAU * (o.waves ?? 1.3)) / len;
  const amp = o.amp ?? h * 0.22;
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const mp = [new Float32Array(pos.count * 3), new Float32Array(pos.count * 3)];
  const mn = [new Float32Array(pos.count * 3), new Float32Array(pos.count * 3)];
  for (let i = 0; i < pos.count; i++) {
    const x = Math.max(0, pos.getX(i));
    const w = amp * Math.pow(x / len, 1.15);
    const dw = (amp * 1.15 * Math.pow(Math.max(1e-4, x / len), 0.15)) / len;
    const nz = nor.getZ(i);
    const s = Math.sin(k * x);
    const c = Math.cos(k * x);
    mp[0][i * 3 + 2] = w * s;
    mp[1][i * 3 + 2] = w * c;
    mn[0][i * 3] = -(dw * s + w * k * c) * nz;
    mn[1][i * 3] = -(dw * c - w * k * s) * nz;
  }
  geometry.morphAttributes.position = mp.map((a) => new THREE.BufferAttribute(a, 3));
  geometry.morphAttributes.normal = mn.map((a) => new THREE.BufferAttribute(a, 3));
  geometry.morphTargetsRelative = true;
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.updateMorphTargets();
  mesh.morphTargetInfluences[0] = 1;
  mesh.userData.keep = true;
  mesh.userData.flag = { ph: Math.random() * TAU, yaw: o.yaw ?? 0 };
  if (o.p) mesh.position.copy(o.p);
  mesh.rotation.y = PI / 2 + (o.yaw ?? 0);
  const parent = o.parent || S.group;
  parent.add(mesh);
  S.flags.push(mesh);
  // the first flag is the ship's colours: struck, white and prize flags fly in its place
  if (!S.flagSpot && o.p && parent === S.group) S.flagSpot = { p: o.p.clone(), len, h, yaw: o.yaw ?? 0 };
  // flagstaff: a short pole from the masthead up past the flag's top edge with a
  // ball finial, so the flag never floats above the truck
  if (o.p && o.staff !== false) {
    const r = o.staffR ?? 0.06;
    const sm = mat(o.staff ?? 0x3a2618);
    const top = V3(o.p.x, o.p.y + h / 2 + 0.12, o.p.z);
    rod(parent, sm, V3(o.p.x, o.p.y - h / 2 - (o.staffDown ?? 0.35), o.p.z), top, r, 6);
    add(parent, sphere(), o.finial != null ? mat(o.finial) : sm, [top.x, top.y + r * 0.8, top.z], null, r * 1.9);
  }
  return mesh;
}

// ---------------------------------------------------------------------------
// Reusable parts
// ---------------------------------------------------------------------------

/** Tapered mast with a ball truck on top. */
function mast(S, z, y0, y1, r0, color, o = {}) {
  const m = mat(color);
  const r1 = r0 * 0.62;
  const g = new THREE.Group();
  g.position.set(0, 0, z);
  if (o.rake) g.rotation.x = o.rake;
  S.group.add(g);
  spar(g, m, V3(0, y0, 0), V3(0, y1, 0), r0, r1, 12);
  add(g, sphere(), m, [0, y1 + r1 * 0.6, 0], null, r1 * 1.7);
  return g;
}

/** A yard (horizontal spar) as a capsule along x. */
function yard(parent, color, y, z, w, r = 0.1) {
  return add(parent, capsule(r, w, 8), mat(color), [0, y, z], [0, 0, PI / 2]);
}

/**
 * Square sails on one mast: one billowing mesh (with emblems) per mast.
 * sails: [{ y, h, wt, wb, belly, mat, decals: [{shapes, size, cx, cy, mat, sides}] , stripes }]
 */
function squareRig(S, mastGroup, sails, o = {}) {
  const parts = [];
  const zOff = o.zOff ?? 0.32;
  // yards are braced round the mast so the sails also read in broadside view
  const rig = new THREE.Group();
  rig.rotation.y = o.brace ?? S.brace ?? 0.42;
  mastGroup.add(rig);
  const info = []; // per sail: its parts (for the battle-damage poses) and its yard
  for (const s of sails) {
    info.push({ y: s.y, h: s.h, wt: s.wt, wb: s.wb, p0: parts.length, yard: { y: s.y + 0.02, z: zOff, half: (s.wt * 1.04 + 0.15) / 2 + (o.yardR ?? 0.1) } });
    const def = squareDef(s.h, s.wt, s.wb, s.belly, s);
    // s.trim = { mat, w }: a band of another colour along the foot (w = fraction of the height)
    const foot = s.trim ? 1 - (s.trim.w ?? 0.15) : 1;
    if (s.stripes) {
      const n = s.stripes.n;
      for (let k = 0; k < n; k++) {
        const geo = pillowGeometry(def, k / n, (k + 1) / n, 0, foot);
        geo.translate(0, s.y, 0);
        parts.push({ geo, material: k % 2 ? s.stripes.mat : s.mat });
      }
    } else {
      const geo = pillowGeometry(def, 0, 1, 0, foot);
      geo.translate(0, s.y, 0);
      parts.push({ geo, material: s.mat });
    }
    if (s.trim) {
      const geo = pillowGeometry(def, 0, 1, foot, 1);
      geo.translate(0, s.y, 0);
      parts.push({ geo, material: s.trim.mat });
    }
    for (const d of s.decals || []) {
      for (const side of d.sides || [1, -1]) {
        const geo = sailDecal(def, d.shapes, d.size, d.cx ?? 0, d.cy, side, d.depth ?? 0.07, d.rot ?? 0);
        geo.translate(0, s.y, 0);
        parts.push({ geo, material: d.mat });
      }
    }
    yard(rig, o.spar ?? 0x7a4a28, s.y + 0.02, zOff, s.wt * 1.04 + 0.15, o.yardR ?? 0.1);
    info[info.length - 1].p1 = parts.length;
  }
  const { geometry, materials, ranges } = mergeByMaterial(parts);
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.position.set(0, 0, zOff);
  mesh.userData.keep = true;
  mesh.userData.sail = { ph: Math.random() * TAU };
  rig.add(mesh);
  S.sails.push(mesh);
  for (const si of info) si.ranges = joinRanges(ranges.slice(si.p0, si.p1));
  S.rigs.push({ mesh, rig, sails: info });
  return mesh;
}

/** A fore-and-aft sail defined in its own plane (local x = aft, y = up, belly +z). */
function foreAftSail(S, parent, def, partsFn, place) {
  const parts = partsFn(def);
  const { geometry, materials } = mergeByMaterial(parts);
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.position.copy(place.p);
  // local x -> aft (-z), local z (belly) -> starboard
  mesh.rotation.set(0, PI / 2, 0);
  mesh.userData.keep = true;
  mesh.userData.sail = { ph: Math.random() * TAU };
  parent.add(mesh);
  S.sails.push(mesh);
  return mesh;
}

/**
 * Fore-and-aft sail in the ship's centre plane: points given as (zShip, y) pairs.
 * Returns a def whose map works in a frame with local x = -zShip (aft), y = up.
 */
function quadDef(tl, tr, br, bl, belly, o = {}) {
  // corners as [z, y] in ship coords: tl = head at luff, tr = peak, br = clew, bl = tack
  const P = (c) => [-c[0], c[1]];
  const A = P(tl);
  const Bp = P(tr);
  const C = P(br);
  const Dp = P(bl);
  return {
    nu: o.nu ?? 14,
    nv: o.nv ?? 12,
    thick: o.thick ?? 0.08,
    p: o.p ?? 6,
    map: (a, b) => {
      const top = [lerp(A[0], Bp[0], a), lerp(A[1], Bp[1], a)];
      const bot = [lerp(Dp[0], C[0], a), lerp(Dp[1], C[1], a)];
      let x = lerp(top[0], bot[0], b);
      let y = lerp(top[1], bot[1], b);
      if (o.leechBow) x += o.leechBow * Math.sin(PI * b) * Math.pow(a, 2);
      if (o.footBow) y -= o.footBow * Math.sin(PI * a) * Math.pow(b, 3);
      return [x, y];
    },
    belly: o.bellyFn || ((a, b) => belly * Math.sin(PI * Math.min(1, a * 0.85 + 0.05)) * Math.sin(PI * b) ** 0.8),
  };
}

/**
 * Triangular head sail (jib) in the centre plane: head on the mast, tack at the
 * bowsprit tip, clew aft and low. Points are [zShip, y]. Adds the fore stay too.
 */
function jibSail(S, head, tip, clew, belly, partsFn, stay) {
  const H = [-head[0], head[1]];
  const Tk = [-(tip.z - 0.08), tip.y + 0.08];
  const Cl = [-clew[0], clew[1]];
  const def = {
    nu: 12,
    nv: 10,
    thick: 0.08,
    p: 6,
    map: (a, b) => {
      const l = [lerp(H[0], Tk[0], b), lerp(H[1], Tk[1], b)];
      const r = [lerp(H[0], Cl[0], b), lerp(H[1], Cl[1], b)];
      return [lerp(l[0], r[0], a), lerp(l[1], r[1], a)];
    },
    belly: (a, b) => belly * Math.sin(PI * a) * Math.sin(PI * Math.min(1, b * 0.95)) * b,
  };
  foreAftSail(S, S.group, def, partsFn, { p: V3() });
  rod(S.group, mat(stay.color), V3(0, head[1] + 0.05, head[0] - 0.05), V3(0, tip.y + 0.05, tip.z - 0.05), stay.r ?? 0.035, 5);
}

/** Cannon barrel pointing along +z (local), base at the origin. */
function cannonGeo(len = 0.75, r = 0.13, seg = 8) {
  return lathe(`can${len},${r},${seg}`, [
    [0.0001, -0.12],
    [r * 0.7, -0.1],
    [r * 1.05, 0],
    [r * 0.95, len * 0.35],
    [r * 0.82, len * 0.85],
    [r * 1.22, len * 0.9],
    [r * 1.22, len],
    [r * 0.55, len + 0.01],
    [0.0001, len - 0.02],
  ], seg);
}

/** Gun port + barrel on the hull side at (z, y). style: 'square' | 'round' | 'hot' */
function gun(S, hull, z, y, side, o = {}) {
  const { p, n } = hull.surface(z, y, side);
  const holder = new THREE.Group();
  holder.position.copy(p);
  aim(holder, V3(n.x, 0, n.z));
  S.group.add(holder);
  const style = o.style || 'square';
  const s = o.scale ?? 1;
  if (style === 'round') {
    add(holder, torus(0.21 * s, 0.065 * s, 18, 8), mat(o.frame), [0, 0, 0.02]);
    add(holder, cyl(0.2 * s, 0.2 * s, 0.1, 14), mat(o.hole ?? 0x2a1c14), [0, 0, -0.02], [PI / 2, 0, 0]);
  } else {
    if (o.frame != null) add(holder, rbox(0.62 * s, 0.56 * s, 0.14, 0.07), mat(o.frame), [0, 0, 0.0]);
    const hole = style === 'hot' ? glow(S, o.hole ?? 0xff6a1a, 1) : mat(o.hole ?? 0x241812);
    add(holder, rbox(0.46 * s, 0.4 * s, 0.16, 0.06), hole, [0, 0, 0.03]);
  }
  if (o.barrel !== false) {
    const bs = s * (o.barrelScale ?? 1); // heavier guns: bigger barrels in the same port
    const b = add(holder, cannonGeo(0.62 * bs, 0.12 * bs, o.barrelSeg ?? 8), mat(o.iron ?? 0x2d2a33), [0, 0, -0.1]);
    b.rotation.x = PI / 2;
    if (o.ring != null) add(holder, torus(0.12 * bs * 1.02, 0.035 * bs, 16, 6), mat(o.ring, { outline: THIN }), [0, 0, -0.1 + 0.62 * bs * 0.52]);
  }
  return holder;
}

/** Cartoon hanging/standing lantern with glowing body. */
function lantern(S, parent, x, y, z, o = {}) {
  const s = o.s ?? 1;
  const iron = mat(o.iron ?? 0x2b2530);
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  add(g, sphere(), glow(S, o.color ?? 0xffc04a, o.intensity ?? 1.05), [0, 0, 0], null, [0.17 * s, 0.22 * s, 0.17 * s]);
  add(g, cone(0.2 * s, 0.18 * s, 10), iron, [0, 0.27 * s, 0]);
  add(g, sphere(), iron, [0, 0.4 * s, 0], null, 0.05 * s);
  add(g, cyl(0.14 * s, 0.11 * s, 0.07 * s, 10), iron, [0, -0.23 * s, 0]);
  return g;
}

/** Chunky barrel prop. */
function barrel(S, x, y, z, color = 0x9a6233, hoop = 0x3a2a24, s = 1) {
  const key = 'barrel';
  const geo = lathe(key, [
    [0.0001, 0],
    [0.24, 0],
    [0.29, 0.18],
    [0.3, 0.3],
    [0.29, 0.42],
    [0.24, 0.6],
    [0.0001, 0.6],
  ], 12);
  add(S.group, geo, mat(color), [x, y, z], null, s);
  add(S.group, torus(0.295, 0.03, 16, 6), thin(hoop), [x, y + 0.17 * s, z], [PI / 2, 0, 0], [s, s, s]);
  add(S.group, torus(0.295, 0.03, 16, 6), thin(hoop), [x, y + 0.43 * s, z], [PI / 2, 0, 0], [s, s, s]);
}

/** Ship's wheel on a post, facing aft (seen from the chase cam). */
function wheel(S, x, y, z, wood = 0x8a5530, s = 1) {
  const m = mat(wood);
  add(S.group, rbox(0.18 * s, 0.75 * s, 0.18 * s, 0.06), m, [x, y + 0.37 * s, z]);
  const g = new THREE.Group();
  g.position.set(x, y + 0.85 * s, z - 0.12 * s);
  S.group.add(g);
  add(g, torus(0.36 * s, 0.05 * s, 20, 6), m);
  add(g, sphere(), m, [0, 0, 0], null, 0.09 * s);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    const d = V3(Math.cos(a), Math.sin(a), 0);
    rod(g, m, d.clone().multiplyScalar(0.05 * s), d.clone().multiplyScalar(0.5 * s), 0.035 * s, 6);
  }
}

/** Stern castle / cabin: rounded block, trim band around the top edge, planked top. */
function sternCastle(S, hull, o) {
  const g = S.group;
  // back face sits just behind the raked transom so the stern windows are never hidden
  const z0 = o.z0 ?? hull.zAt(0, hull.rail(0)) - (o.back ?? 0.1);
  const z1 = o.z1; // front face
  const y0 = o.y0;
  const y1 = o.y1;
  const d = z1 - z0;
  const zc = (z0 + z1) / 2;
  const w = o.w ?? (hull.widthAt(zc, hull.D + 0.3) * 2 + (o.over ?? 0.05));
  add(g, rbox(w, y1 - y0, d, o.r ?? 0.22), mat(o.color), [0, (y0 + y1) / 2, zc]);
  if (o.cap) add(g, rbox(w + 0.14, 0.24, d + 0.14, 0.1), mat(o.cap), [0, y1 - 0.1, zc]);
  if (o.top) add(g, rbox(w - 0.12, 0.1, d - 0.12, 0.04), mat(o.top), [0, y1 + 0.03, zc]);
  return { w, z0, z1, y0, y1: y1 + 0.08, zc };
}

function dedupe(pts) {
  const out = [];
  for (const p of pts) if (!out.length || out[out.length - 1].distanceTo(p) > 1e-4) out.push(p);
  if (out.length > 2 && out[0].distanceTo(out[out.length - 1]) < 1e-4) out.pop();
  return out;
}

function archShape(w, h) {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, h - r);
  s.absarc(0, h - r, r, 0, PI, false);
  s.lineTo(-r, 0);
  return s;
}

/** Glowing arched windows on a vertical face facing `dir` (+1 = +z, -1 = -z). */
function windows(S, parent, xs, y, z, dir, o = {}) {
  const w = o.w ?? 0.42;
  const h = o.h ?? 0.6;
  const fw = o.fw ?? 0.09;
  const glowM = glow(S, o.glow ?? 0xffc65a, o.intensity ?? 1);
  const frameM = mat(o.frame ?? 0x5a3420, { outline: THIN });
  let paneShape;
  const frameShapes = [];
  if (o.round) {
    paneShape = circlePath(0, h / 2, w / 2, THREE.Shape);
    const ring = circlePath(0, h / 2, w / 2 + fw, THREE.Shape);
    ring.holes.push(circlePath(0, h / 2, w / 2));
    frameShapes.push(ring);
  } else {
    paneShape = archShape(w, h);
    const pts = archShape(w + fw * 2, h + fw * 2).getPoints(7).map((p) => new THREE.Vector2(p.x, p.y - fw));
    const outer = new THREE.Shape(dedupe(pts));
    outer.holes.push(new THREE.Path(dedupe(paneShape.getPoints(7))));
    frameShapes.push(outer);
  }
  if (o.mullion !== false) {
    frameShapes.push(roundRectShape(0.05, h - 0.02, 0.02, 0, h / 2 - 0.01));
    frameShapes.push(roundRectShape(w - 0.02, 0.05, 0.02, 0, h * 0.5));
  }
  const paneGeo = extrude(paneShape, 0.06, 7);
  const frameGeo = extrude(frameShapes, 0.1, 7);
  for (const x of xs) {
    add(parent, paneGeo, glowM, [x, y, z + dir * 0.02], [0, dir > 0 ? 0 : PI, 0]);
    add(parent, frameGeo, frameM, [x, y, z + dir * 0.04], [0, dir > 0 ? 0 : PI, 0]);
  }
}

/** Seagull figurehead (white, orange beak, wings swept back). */
function seagull(S, p, pitch = -0.35, s = 1) {
  const g = new THREE.Group();
  g.position.copy(p);
  g.rotation.x = pitch;
  g.scale.setScalar(s);
  S.group.add(g);
  const white = mat(0xffffff);
  const grey = mat(0xa9b4c2);
  add(g, sphere(), white, [0, 0, 0], null, [0.26, 0.24, 0.42]);
  add(g, sphere(), white, [0, 0.12, 0.38], null, 0.2);
  add(g, cone(0.075, 0.3, 10), mat(0xff9a1f), [0, 0.09, 0.62], [PI / 2, 0, 0]);
  for (const sd of [-1, 1]) {
    add(g, sphere(), thin(0x1b1622), [sd * 0.12, 0.2, 0.5], null, 0.045);
    // gull "W" wings: inner part up and out, outer part out and down, grey tips
    const shoulder = V3(sd * 0.12, 0.1, 0.02);
    const elbow = V3(sd * 0.62, 0.5, -0.12);
    const tip = V3(sd * 1.08, 0.36, -0.38);
    blob(g, white, shoulder, elbow, 0.2, 0.07);
    blob(g, white, elbow.clone().addScaledVector(V3(sd, 0.4, 0), -0.08), tip.clone().lerp(elbow, 0.25), 0.16, 0.06);
    blob(g, grey, tip.clone().lerp(elbow, 0.45), tip, 0.11, 0.05);
  }
  add(g, sphere(), grey, [0, 0.02, -0.42], [0.3, 0, 0], [0.16, 0.05, 0.2]);
  return g;
}

/** Ellipsoid stretched between two points (wings, brows, fins). */
function blob(parent, material, a, b, w = 0.1, h = w) {
  const d = V3().subVectors(b, a);
  const m = add(parent, sphere(), material);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(FWD, d.clone().normalize());
  m.scale.set(w, h, d.length() / 2);
  return m;
}

/** Flat emblem on the (raked) transom, facing aft. */
function transomDecal(S, hull, shapes, size, y, material, depth = 0.08) {
  const g = extrude(shapes, depth / size, 8);
  g.scale(size, size, size);
  const z = hull.zAt(0, y);
  const zUp = hull.zAt(0, y + 0.1);
  const tilt = Math.atan2(z - zUp, 0.1); // top leans aft
  const m = add(S.group, g, material, [0, y, z - depth * 0.2]);
  // +tilt about x, then the half-turn about y: the decal's top leans aft with the transom
  m.rotation.set(tilt, PI, 0, 'YXZ');
  return m;
}

/** Bone-white skull figurehead (3D), facing +z. */
function skullHead(S, p, s = 1, color = 0xefe6cf, pitch = 0) {
  const g = new THREE.Group();
  g.position.copy(p);
  g.rotation.x = pitch;
  g.scale.setScalar(s);
  S.group.add(g);
  const bone = mat(color);
  const dark = toon(0x1a1420, { outline: false });
  add(g, sphere(), bone, [0, 0.12, 0], null, [0.48, 0.46, 0.5]);
  add(g, rbox(0.56, 0.32, 0.5, 0.14), bone, [0, -0.2, 0.08]);
  for (const sd of [-1, 1]) add(g, sphere(), dark, [sd * 0.18, 0.08, 0.38], null, [0.13, 0.15, 0.08]);
  add(g, cone(0.06, 0.12, 6), dark, [0, -0.08, 0.45], [PI / 2 + 0.3, 0, 0]);
  for (let k = -1; k <= 1; k++) add(g, rbox(0.06, 0.16, 0.06, 0.02), dark, [k * 0.12, -0.26, 0.33]);
  return g;
}

/**
 * Gilded fiddlehead scroll on the stem head: rises out of the stem, rolls forward
 * over the top and curls under itself in a shrinking spiral (reads as a carved
 * volute from the side instead of a loose hook).
 */
function scrollHead(S, hull, color, s = 0.6) {
  const head = hull.stem(4).at(-1);
  const r0 = s * 0.85;
  const cz = head.z - 0.04 + r0;
  const cy = head.y + 0.05 - r0;
  const pts = [V3(0, cy - r0 * 1.1, hull.zAt(1, cy - r0 * 1.1) - 0.02), V3(0, cy - r0 * 0.5, cz - r0 * 1.02)];
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const ang = PI - t * TAU * 1.3;
    const r = r0 * (1 - 0.72 * t);
    pts.push(V3(0, cy + Math.sin(ang) * r, cz + Math.cos(ang) * r));
  }
  const m = mat(color);
  add(S.group, taperTube(pts, (t) => 0.16 * (1 - t * 0.6), 44, 10), m);
  add(S.group, sphere(), m, pts.at(-1).toArray(), null, 0.085);
}

/** Brazier: iron bowl on legs with glowing coals and a flickering flame (kept mesh). */
function brazier(S, x, y, z, o = {}) {
  const s = o.s ?? 1;
  const iron = mat(IRON);
  const g = new THREE.Group();
  g.position.set(x, y, z);
  S.group.add(g);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.5;
    rod(g, iron, V3(Math.cos(a) * 0.32 * s, 0, Math.sin(a) * 0.32 * s), V3(Math.cos(a) * 0.2 * s, 0.55 * s, Math.sin(a) * 0.2 * s), 0.05 * s, 6);
  }
  add(g, lathe('bowl', [
    [0.0001, 0],
    [0.2, 0.02],
    [0.38, 0.16],
    [0.46, 0.34],
    [0.42, 0.36],
    [0.0001, 0.3],
  ], 14), iron, [0, 0.5 * s, 0], null, s);
  add(g, sphere(), glow(S, o.coal ?? 0xff5a1f, 1.1, false, 0.3), [0, 0.8 * s, 0], null, [0.36 * s, 0.1 * s, 0.36 * s]);
  // flame: kept, flickers
  const flame = new THREE.Group();
  flame.position.set(x, y + 0.82 * s, z);
  flame.userData.keep = true;
  S.group.add(flame);
  const fl = lathe('flame', [
    [0.0001, 0],
    [0.3, 0.1],
    [0.36, 0.3],
    [0.24, 0.62],
    [0.08, 0.95],
    [0.0001, 1.15],
  ], 12);
  const big = s * (o.big ?? 1);
  const outerM = glow(S, o.flame ? o.flame[0] : 0xff7a1a, 1.15, true, 0.12);
  const coreM = glow(S, o.flame ? o.flame[1] : 0xffd84a, 1.2, false, 0.1);
  const tongue = (m, p, r, sc) => {
    const g = fl.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(V3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), V3(...sc)));
    return { geo: g, material: m };
  };
  const merged = mergeByMaterial([
    tongue(outerM, [0, 0, 0], [0, 0, 0], [big * 0.82, big * 1.3, big * 0.82]),
    tongue(outerM, [0.24 * big, 0, 0.04 * big], [0.1, 0, -0.55], [big * 0.5, big * 0.85, big * 0.5]),
    tongue(outerM, [-0.22 * big, 0, -0.1 * big], [-0.15, 0, 0.5], [big * 0.46, big * 0.75, big * 0.46]),
    tongue(outerM, [0.02 * big, 0, -0.24 * big], [-0.5, 0, 0.05], [big * 0.42, big * 0.7, big * 0.42]),
    tongue(coreM, [0, 0.02 * big, 0.14 * big], [0.12, 0, 0], [big * 0.5, big * 0.82, big * 0.5]),
  ]);
  flame.add(new THREE.Mesh(merged.geometry, merged.materials));
  S.fx.push({ kind: 'flame', obj: flame, ph: Math.random() * TAU, s: 1 });
  if (o.smoke) {
    // a rising column of cartoon smoke puffs (each a lumpy cluster, so it reads
    // as smoke rather than a ball), alternating two sooty tones
    const n = o.puffs ?? 5;
    for (let k = 0; k < n; k++) {
      const puffMat = o.smokeMat ? o.smokeMat(k) : toon(k % 2 ? 0x7d76a0 : 0x655e8a, { outline: THIN });
      const puff = add(S.group, puffGeo(), puffMat, [x, y + 1.6 * s, z], [0, k * 1.9, 0], 0.3);
      puff.userData.keep = true;
      S.fx.push({ kind: 'smoke', obj: puff, ph: k / n, base: V3(x, y + 1.45 * s, z), s: s * 1.35 });
    }
  }
  return g;
}

/** Bowsprit from the stem head forward/up. Returns the tip position. */
function bowsprit(S, hull, len, angle, color, r = 0.12) {
  const base = V3(0, hull.rail(1) - 0.15, hull.zAt(1, hull.rail(1)) - 0.9);
  const dir = V3(0, Math.sin(angle), Math.cos(angle));
  const tip = base.clone().addScaledVector(dir, len);
  const m = mat(color);
  spar(S.group, m, base, tip, r, r * 0.6, 10);
  add(S.group, sphere(), m, tip.toArray(), null, r * 0.85);
  return tip;
}

function cutwater(S, hull, color, r = 0.11) {
  const pts = hull.stem(10);
  add(S.group, taperTube(pts, (t) => r * (0.8 + 0.4 * t), 16, 8), mat(color));
}

/** Low rail fence of rounded posts plus a cap rail, from a to b at height h. */
function rail(S, a, b, h, color, posts = 0) {
  const m = mat(color);
  rod(S.group, m, V3(a.x, a.y + h, a.z), V3(b.x, b.y + h, b.z), 0.06, 8);
  for (let k = 0; k <= posts; k++) {
    const p = V3().lerpVectors(a, b, posts ? k / posts : 0);
    rod(S.group, m, p, V3(p.x, p.y + h, p.z), 0.05, 6);
  }
}

/**
 * Rope shrouds from the rails up to the mast head: thin ink-coloured lines (no
 * outline) that read like drawn rigging and frame the sails from the chase cam.
 */
function shrouds(S, hull, mastZ, topY, o = {}) {
  const rope = toon(o.color ?? 0x3b2a22, { outline: false });
  const n = o.n ?? 3;
  const spread = o.spread ?? 0.42;
  const rake = o.rake ?? 0;
  for (const sd of [-1, 1]) {
    for (let k = 0; k < n; k++) {
      const z = mastZ - 0.35 - k * spread;
      const y = hull.railAt(z) + 0.02;
      const x = sd * (hull.widthAt(z, y - hull.rb * 2) - 0.02);
      const top = V3(sd * 0.12, topY, mastZ + rake * topY - 0.05);
      const a = V3(x, y, z);
      const d = V3().subVectors(top, a);
      const m = add(S.group, cyl(o.r ?? 0.032, o.r ?? 0.032, d.length(), 5, true), rope);
      m.position.copy(a).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(UP, d.normalize());
    }
  }
}

// ---------------------------------------------------------------------------
// Ships
// ---------------------------------------------------------------------------

const WOOD = 0x8a5530;
const IRON = 0x2d2a33;

// ---------------------------------------------------------------------------
// The player's ship: paint (opts.look) and visible shipyard upgrades (opts.upgrades)
// ---------------------------------------------------------------------------

// Upgrade props reuse the stock ship's colours where they can (fewer materials = fewer draw calls).
const BRONZE = 0xd0903f; // heavy-shot cannon barrels
const GOLD = 0xffd23f; // the stock ship's yellow (crest ring, flowers)
const BAND_IRON = 0x4d4a5c; // iron bands, armour and cannonballs (lighter than IRON, so the cel bands show)
const STEEL = 0xb9bdca; // rivet heads, saw blades
const PROP_RED = 0xd8402e; // toolbox, powder keg bands
const ROPE = 0xd9c39a; // the stock rope coil
const STAVE = 0x9a6233; // the stock barrels
const FRESH = 0xe2b77c; // the stock deck: fresh planks and patches

/** Resolve buildShip opts for the player: paint entries (defaults for unknown ids), upgrade and tavern tiers. */
function playerSetup(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const look = o.look && typeof o.look === 'object' ? o.look : {};
  const up = o.upgrades && typeof o.upgrades === 'object' ? o.upgrades : {};
  const tier = (id) => (Number.isInteger(up[id]) ? clamp(up[id], 0, maxTier(id)) : 0);
  const armory = o.armory && typeof o.armory === 'object' ? o.armory : {};
  return {
    paint: findLook('hull', look.hull),
    sails: findLook('sails', look.sails),
    flag: findLook('flag', look.flag),
    up: { guns: tier('guns'), shot: tier('shot'), crew: tier('crew'), hull: tier('hull'), sails: tier('sails'), carpenter: tier('carpenter') },
    grapple: Number.isInteger(armory.grapple) ? clamp(armory.grapple, 0, GRAPPLE_COILS.length - 1) : 0,
  };
}

/** Exact point on a hull's outer skin at (u, y) on one side, with its outward normal. */
function hullPoint(hull, u, y, side, off = 0) {
  const e = 0.002;
  const P = (uu, yy) => V3(hull.xAt(clamp(uu, 0, 1), yy) * side, yy, hull.zAt(clamp(uu, 0, 1), yy));
  const p = P(u, y);
  const du = V3().subVectors(P(u + e, y), P(u - e, y));
  const dy = V3().subVectors(P(u, y + e), P(u, y - e));
  const n = du.cross(dy).normalize();
  if (n.x * side < 0) n.negate();
  return { p: p.addScaledVector(n, off), n };
}

/** u (0 stern .. 1 bow) of the hull station that sits at z on the waterline-ish height y. */
function hullU(hull, z, y) {
  let u = hull.uAt(z);
  for (let i = 0; i < 6; i++) u = clamp(u - (hull.zAt(u, y) - z) / hull.L, 0, 1);
  return u;
}

/** A rivet head: a squashed little dome, cheap (merged with the rest). */
const rivetGeo = () => cached('rivet', () => new THREE.SphereGeometry(1, 8, 5));
function rivet(parent, m, p, n, r = 0.045) {
  const mesh = add(parent, rivetGeo(), m, [p.x, p.y, p.z], null, [r, r, r * 0.6]);
  mesh.quaternion.setFromUnitVectors(FWD, n);
  return mesh;
}

/** Iron hoop strapped round the hull side from under the rail down to the waterline at z. */
function hullBand(S, hull, z, side, yTop, o = {}) {
  const pts = [];
  const nrm = [];
  const y0 = o.y0 ?? 0.06;
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const y = lerp(yTop, y0, i / N);
    const u = hullU(hull, z, y);
    const { p, n } = hullPoint(hull, u, y, side, 0.035);
    pts.push(p);
    nrm.push(n);
  }
  const m = mat(BAND_IRON);
  add(S.group, taperTube(pts, () => o.r ?? 0.06, 16, 8), m);
  if (o.rivets) {
    const rm = mat(STEEL, { outline: THIN });
    for (let i = 1; i < N; i += 2) rivet(S.group, rm, pts[i].clone().addScaledVector(nrm[i], 0.05), nrm[i]);
  }
}

/** Armoured bow: riveted iron plates over both bow cheeks, an iron-shod stem and edge straps. */
function armouredBow(S, hull) {
  const plate = mat(BAND_IRON);
  const strap = mat(IRON);
  const rm = mat(STEEL, { outline: THIN });
  const u0 = 0.83;
  const yLo = 0.06;
  const yHi = (u) => Math.min(hull.rail(u) - 0.42, 1.55);
  const NU = 12;
  const NY = 6;
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= NU; i++) {
      const u = lerp(u0, 0.995, i / NU);
      for (let j = 0; j <= NY; j++) pts.push(hullPoint(hull, u, lerp(yHi(u), yLo, j / NY), side, 0.03).p);
    }
    add(S.group, gridGeometry(pts, NU + 1, NY + 1, (p) => V3(p.x, 0, 0.3)), plate);
    // straps round the plate's edges, with rivets
    const top = [];
    const bot = [];
    const back = [];
    for (let i = 0; i <= NU; i++) {
      const u = lerp(u0, 0.995, i / NU);
      top.push(hullPoint(hull, u, yHi(u), side, 0.045));
      bot.push(hullPoint(hull, u, yLo + 0.02, side, 0.045));
    }
    for (let j = 0; j <= NY; j++) back.push(hullPoint(hull, u0, lerp(yHi(u0), yLo, j / NY), side, 0.045));
    for (const line of [top, bot, back]) {
      add(S.group, taperTube(line.map((q) => q.p), () => 0.065, 16, 8), strap);
      for (let i = 1; i < line.length - 1; i += 2) rivet(S.group, rm, line[i].p.clone().addScaledVector(line[i].n, 0.055), line[i].n, 0.05);
    }
    // rivet rows across the plate
    for (let i = 2; i < NU; i += 3) {
      const u = lerp(u0, 0.995, i / NU);
      for (let j = 1; j < NY; j += 2) {
        const { p, n } = hullPoint(hull, u, lerp(yHi(u), yLo, j / NY), side, 0.04);
        rivet(S.group, rm, p, n, 0.04);
      }
    }
  }
  // iron-shod stem (a bigger iron cutwater with a rounded ram foot)
  const stem = hull.stem(10);
  add(S.group, taperTube(stem, (t) => 0.15 * (0.85 + 0.35 * t), 16, 8), strap);
  add(S.group, sphere(), strap, stem[0].toArray(), null, [0.2, 0.18, 0.28]);
}

/** Pyramid of cannonballs in a red shot box. */
function shotPyramid(S, x, y, z, yaw = 0, s = 1) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  S.group.add(g);
  const r = 0.1 * s;
  const d = r * 2.04;
  const w = d * 3 + 0.1 * s;
  add(g, rbox(w, 0.12 * s, w, 0.05), mat(PROP_RED), [0, 0.06 * s, 0]);
  const ball = mat(BAND_IRON);
  for (let layer = 0; layer < 3; layer++) {
    const n = 3 - layer;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        add(g, sphere(), ball, [(i - (n - 1) / 2) * d, 0.1 * s + r + layer * r * 1.44, (j - (n - 1) / 2) * d], null, r);
      }
    }
  }
}

/** Powder keg: a small barrel with a red band. */
function powderKeg(S, x, y, z, s = 0.6) {
  barrel(S, x, y, z, WOOD, 0x3a2a24, s);
  add(S.group, torus(0.302, 0.05, 16, 6), mat(PROP_RED), [x, y + 0.3 * s, z], [PI / 2, 0, 0], [s, s, s]);
}

/** Fife rail round a mast: a ring rail on posts holding rammers and sponges for the gun crews. */
function fifeRail(S, z, y, o = {}) {
  const wood = mat(WOOD);
  const R = 0.46;
  const h = 0.55;
  add(S.group, torus(R, 0.06, 28, 6), wood, [0, y + h, z], [PI / 2, 0, 0]);
  for (let k = 0; k < 4; k++) {
    const a = PI / 4 + (k * PI) / 2;
    rod(S.group, wood, V3(Math.cos(a) * R, y, z + Math.sin(a) * R), V3(Math.cos(a) * R, y + h, z + Math.sin(a) * R), 0.055, 6);
  }
  // rammers and sponges stand in the rail, leaning on the mast (aft half, clear of the sail)
  const pole = mat(STAVE);
  const ramHead = mat(WOOD);
  const sponge = mat(ROPE);
  const n = o.n ?? 4;
  for (let k = 0; k < n; k++) {
    const a = PI + 0.5 + (k * (PI - 1.0)) / Math.max(1, n - 1); // spread round the aft side
    const base = V3(Math.cos(a) * (R + 0.02), y + 0.02, z + Math.sin(a) * (R + 0.02));
    const top = V3(Math.cos(a) * 0.3, y + 1.32, z + Math.sin(a) * 0.3);
    rod(S.group, pole, base, top, 0.03, 6);
    if (k % 2) add(S.group, sphere(), sponge, [top.x, top.y + 0.1, top.z], null, [0.09, 0.15, 0.09]);
    else add(S.group, cyl(0.075, 0.075, 0.16, 10), ramHead, [top.x, top.y + 0.06, top.z]);
  }
  if (o.bell) {
    // brass drill bell hanging off the front of the rail
    const brass = mat(GOLD);
    const bz = z + R + 0.02;
    rod(S.group, wood, V3(0, y + h, z + R - 0.02), V3(0, y + h + 0.62, bz), 0.045, 6);
    rod(S.group, mat(IRON), V3(0, y + h + 0.62, bz), V3(0, y + h + 0.62, bz + 0.22), 0.03, 6);
    add(S.group, lathe('bell', [
      [0.0001, -0.03],
      [0.15, -0.05],
      [0.16, -0.02],
      [0.12, 0.04],
      [0.1, 0.14],
      [0.07, 0.2],
      [0.0001, 0.21],
    ], 14), brass, [0, y + h + 0.36, bz + 0.22], null, 1.25);
    add(S.group, sphere(), mat(IRON), [0, y + h + 0.32, bz + 0.22], null, 0.04);
  }
}

/** Carpenter's toolbox with a saw sticking out and a mallet beside it. */
function toolbox(S, x, y, z, yaw = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  S.group.add(g);
  const red = mat(PROP_RED);
  const wood = mat(WOOD);
  add(g, rbox(0.62, 0.28, 0.34, 0.06), red, [0, 0.14, 0]);
  add(g, rbox(0.66, 0.06, 0.38, 0.03), wood, [0, 0.3, 0]);
  add(g, torus(0.16, 0.03, 12, 6, PI), wood, [0, 0.32, 0]);
  // saw: steel blade with teeth edge and a wooden grip
  add(g, rbox(0.5, 0.16, 0.025, 0.01), mat(STEEL, { outline: THIN }), [0.12, 0.42, 0.06], [0, 0, -0.55]);
  add(g, rbox(0.12, 0.14, 0.06, 0.03), wood, [0.36, 0.3, 0.06], [0, 0, -0.55]);
  // mallet lying on the deck
  rod(g, mat(STAVE), V3(-0.32, 0.05, 0.3), V3(0.05, 0.05, 0.42), 0.03, 6);
  add(g, cyl(0.07, 0.07, 0.2, 10), wood, [-0.38, 0.07, 0.28], [0, 0.3, PI / 2]);
}

/** Spare planks stacked on the hatch, lashed with rope. */
function plankStack(S, x, y, z) {
  const a = mat(FRESH);
  const b = mat(STAVE);
  const rope = mat(ROPE);
  const len = 1.3;
  for (let i = 0; i < 3; i++) add(S.group, rbox(0.22, 0.07, len, 0.03), i % 2 ? b : a, [x + (i - 1) * 0.24, y + 0.035, z]);
  for (let i = 0; i < 2; i++) add(S.group, rbox(0.22, 0.07, len - 0.12, 0.03), i % 2 ? a : b, [x + (i - 0.5) * 0.24, y + 0.105, z + 0.04]);
  for (const dz of [-0.4, 0.4]) add(S.group, rbox(0.8, 0.2, 0.06, 0.03), rope, [x, y + 0.08, z + dz]);
}

/** Sawhorse with a plank half sawn through. */
function sawhorse(S, x, y, z, yaw = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  S.group.add(g);
  const wood = mat(WOOD);
  add(g, rbox(0.12, 0.1, 0.78, 0.04), wood, [0, 0.5, 0]);
  for (const dz of [-0.3, 0.3]) {
    for (const sx of [-1, 1]) rod(g, wood, V3(sx * 0.22, 0, dz), V3(sx * 0.03, 0.48, dz), 0.04, 6);
  }
  add(g, rbox(0.9, 0.06, 0.24, 0.03), mat(FRESH), [0.12, 0.59, 0.05], [0, 0.12, 0]);
  // a saw stuck in the plank's end
  add(g, rbox(0.42, 0.14, 0.02, 0.01), mat(STEEL, { outline: THIN }), [0.5, 0.7, 0.1], [0, 0.12, 0.35]);
  add(g, rbox(0.1, 0.13, 0.06, 0.03), wood, [0.7, 0.8, 0.12], [0, 0.12, 0.35]);
}

/** A planked patch nailed onto the hull side at (z, y). */
function hullPatch(S, hull, z, y, side, o = {}) {
  const u = hullU(hull, z, y);
  const { p, n } = hullPoint(hull, u, y, side, 0.02);
  const g = new THREE.Group();
  g.position.copy(p);
  g.quaternion.setFromUnitVectors(FWD, n);
  g.rotateZ(o.tilt ?? 0);
  S.group.add(g);
  const w = o.w ?? 0.76;
  const h = o.h ?? 0.4;
  // two boards side by side, nailed at the corners
  const wood = mat(o.color ?? FRESH);
  add(g, rbox(w, h / 2 - 0.01, 0.07, 0.03), wood, [0, h / 4, 0]);
  add(g, rbox(w * 0.9, h / 2 - 0.01, 0.07, 0.03), wood, [w * 0.04, -h / 4, 0]);
  const nail = mat(IRON);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) add(g, sphere(), nail, [sx * (w / 2 - 0.07), sy * (h / 2 - 0.07), 0.04], null, 0.03);
}

// Long grapples tiers 0..2: z of each pair of coils, hung on the quarterdeck side rails (out of the
// deck crew's way, between the cabin's side windows, and in sight of the chase camera).
const GRAPPLE_COILS = [[], [-3.12], [-3.12, -4.5]];

/**
 * A grapnel ready for boarding, hung outside a quarterdeck side rail: a coil of rope hanging from
 * the rail cap and an iron grapnel hooked over the cap beside it. x: the rail's x (+ port, - starboard).
 */
function grappleCoil(S, x, yRail, z) {
  const side = Math.sign(x);
  const rope = mat(ROPE);
  const iron = mat(BAND_IRON);
  const cx = x + side * 0.1;
  // four loops of rope hanging from the cap, sagging to different depths, bound at the top
  for (const [k, R, dz, a, sag] of [[0, 0.23, 0, 0, 0.02], [1, 0.21, 0.025, 0.14, 0.06], [2, 0.2, -0.02, -0.12, 0.03], [3, 0.18, 0.01, 0.06, 0.08]]) {
    const g = add(S.group, torus(R, 0.036, 18, 6), rope, [cx + side * (k * 0.03 - 0.03), yRail - 0.08 - R - sag, z + dz], [a, PI / 2, 0, 'YXZ']);
    g.scale.set(1, 1 + sag * 2.5, 1); // loops hang long
  }
  add(S.group, torus(0.075, 0.04, 10, 5), rope, [cx + side * 0.015, yRail - 0.1, z], [0, 0, PI / 2], [1, 1.3, 1]);
  // the grapnel: hooked over the cap by its ring, shank hanging down, four flukes curling up at the foot
  const gz = z + 0.38;
  const top = V3(x + side * 0.06, yRail + 0.05, gz);
  const foot = V3(x + side * 0.12, yRail - 0.62, gz);
  add(S.group, torus(0.07, 0.025, 10, 5), iron, [x + side * 0.02, yRail + 0.02, gz], [0, 0, 0]);
  rod(S.group, iron, top, foot, 0.04, 6);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + PI / 4;
    const out = V3(Math.cos(a) * 0.6, 0, Math.sin(a));
    const pts = [foot, foot.clone().addScaledVector(out, 0.12).add(V3(0, -0.03, 0)), foot.clone().addScaledVector(out, 0.2).add(V3(0, 0.07, 0)), foot.clone().addScaledVector(out, 0.17).add(V3(0, 0.2, 0))];
    add(S.group, taperTube(pts, (t) => 0.035 * (1 - 0.5 * t), 8, 6), iron);
  }
  add(S.group, sphere(), iron, foot.toArray(), null, 0.055);
}

function buildPlayer(S, T, opts) {
  S.brace = 0.32;
  const { paint: P, sails: SL, flag: FL, up: UP, grapple } = playerSetup(opts);
  const C = {
    deck: 0xe2b77c,
    plank: 0xbf8a52,
  };
  const hull = makeHull({
    L: T.len,
    W: T.wid,
    rail: 1.82,
    deck: 1.2,
    bw: 0.22,
    yc: 0.85,
    n: 2.3,
    tumble: 0.12,
    sternLen: 0.11,
    sternP: 2.4,
    bowStart: 0.56,
    bowP: 2,
    bowQ: 0.62,
    bowRise: 0.55,
    sternRise: 0.12,
    bowLift: 1.05,
    sternLift: 0.75,
    bowRake: 0.55,
    sternRake: 0.12,
    breaks: [{ rel: -0.36 }, { rel: -0.42 }],
  });
  addHull(S, hull, {
    bands: [mat(P.top), mat(P.stripe), mat(P.bottom)],
    rim: mat(P.rim),
    wall: mat(P.wall),
    deck: mat(C.deck),
  });
  S.hull = hull;
  deckPlanks(S, hull, C.plank, -3.0, 4.2, 5);
  if (UP.hull < 3) cutwater(S, hull, P.rim, 0.12);

  // stern cabin
  const cab = sternCastle(S, hull, { z1: -2.75, y0: 1.0, y1: 2.5, color: P.cabin, cap: P.cap, top: C.deck, r: 0.28, over: 0.12 });
  windows(S, S.group, [-0.85, 0, 0.85], 1.53, cab.z0, -1, { w: 0.46, h: 0.6, frame: P.trim });
  // little round side windows
  for (const sd of [-1, 1]) {
    for (const z of [-4.15, -3.35]) {
      const holder = new THREE.Group();
      holder.position.set(sd * (cab.w / 2 + 0.01), 1.8, z);
      holder.rotation.y = sd * PI / 2;
      S.group.add(holder);
      add(holder, torus(0.15, 0.05, 16, 6), mat(P.trim));
      add(holder, cyl(0.14, 0.14, 0.06, 12), glow(S, 0xffc65a, 1), [0, 0, -0.01], [PI / 2, 0, 0]);
    }
  }
  // cabin door at the front
  add(S.group, rbox(0.7, 1.0, 0.12, 0.1), mat(P.rim), [0, 1.62, cab.z1 + 0.02]);
  add(S.group, sphere(), mat(P.accent), [0.22, 1.6, cab.z1 + 0.1], null, 0.06);
  // quarterdeck rails and lanterns
  const yq = cab.y1 + 0.1;
  for (const sd of [-1, 1]) {
    rail(S, V3(sd * (cab.w / 2 - 0.12), yq, cab.z0 + 0.15), V3(sd * (cab.w / 2 - 0.12), yq, cab.z1 - 0.15), 0.42, P.rim, 3);
    rod(S.group, mat(P.rim), V3(sd * (cab.w / 2 - 0.12), yq, cab.z0 + 0.15), V3(sd * (cab.w / 2 - 0.12), yq + 1.0, cab.z0 + 0.15), 0.06, 8);
    rod(S.group, mat(IRON), V3(sd * (cab.w / 2 - 0.12), yq + 1.0, cab.z0 + 0.15), V3(sd * (cab.w / 2 + 0.12), yq + 1.0, cab.z0 + 0.05), 0.04, 6);
    lantern(S, S.group, sd * (cab.w / 2 + 0.14), yq + 0.72, cab.z0 + 0.05, { s: 1.0 });
  }
  rail(S, V3(-(cab.w / 2 - 0.12), yq, cab.z0 + 0.15), V3(cab.w / 2 - 0.12, yq, cab.z0 + 0.15), 0.42, P.rim, 4);
  wheel(S, 0, yq, cab.z1 - 0.55, P.rim, 0.9);
  // the captain's place at the helm: on the quarterdeck planks behind the wheel, facing the bow
  S.helm = { x: 0, y: r3(cab.y1), z: r3(cab.z1 - 1.0), h: 0 };

  // stern charm (this is the view the player sees all game):
  // a rubbing band ties the cabin into the hull stripe ...
  add(S.group, rbox(cab.w + 0.12, 0.22, cab.z1 - cab.z0 + 0.12, 0.09), mat(P.trim), [0, 1.13, (cab.z0 + cab.z1) / 2]);
  // ... flower boxes under the windows ...
  const yellow = mat(P.accent);
  const white = mat(0xffffff);
  for (const [i, x] of [-0.85, 0, 0.85].entries()) {
    add(S.group, rbox(0.56, 0.16, 0.22, 0.06), mat(P.trim), [x, 1.36, cab.z0 - 0.1]);
    for (let k = 0; k < 3; k++) {
      add(S.group, sphere(), (k + i) % 2 ? white : yellow, [x + (k - 1) * 0.16, 1.47 + (k === 1 ? 0.03 : 0), cab.z0 - 0.14], null, 0.08);
    }
  }
  // ... and a round "biscuit" crest on the taffrail (the ship's namesake).
  const crest = new THREE.Group();
  crest.position.set(0, yq + 0.5, cab.z0 + 0.1);
  crest.rotation.y = PI; // faces aft, towards the chase cam
  S.group.add(crest);
  add(crest, cyl(0.4, 0.4, 0.12, 20), mat(P.cap), [0, 0, 0], [PI / 2, 0, 0]);
  add(crest, torus(0.4, 0.065, 24, 8), yellow, [0, 0, 0.02]);
  add(crest, sphere(), mat(P.crest), [0, 0, 0.08], null, [0.27, 0.27, 0.07]);
  for (const [cx, cy] of [[-0.1, 0.08], [0.11, 0.1], [0.02, -0.04], [-0.09, -0.13], [0.12, -0.11]]) {
    add(crest, sphere(), mat(P.rim), [cx, cy, 0.14], null, [0.045, 0.045, 0.025]);
  }

  // guns in round portholes; heavy shot = bronze barrels that grow with each tier
  const gunOpts = { style: 'round', frame: P.trim, hole: 0x2a1c14, scale: 1.05 };
  if (UP.shot > 0) Object.assign(gunOpts, { iron: BRONZE, barrelSeg: 12, barrelScale: [1, 1.1, 1.2, 1.32][UP.shot], ring: UP.shot >= 2 ? GOLD : null });
  const gunZ = [];
  for (let i = 0; i < T.guns; i++) {
    gunZ.push(gunOffset(T, i));
    for (const sd of [-1, 1]) gun(S, hull, gunOffset(T, i), 0.8, sd, gunOpts);
  }

  // masts + sails: a stubby, chubby rig (wide sails, short masts). Besides the
  // cartoon proportions this keeps the sail tops well under the chase camera's
  // horizon line, so enemies dead ahead stay visible above the player's sails.
  const fore = mast(S, 2.05, 1.0, 7.1, 0.18, WOOD);
  const main = mast(S, -0.85, 1.0, 7.75, 0.2, WOOD);
  // the player's cloth gets its own material instances, so the game can fade the
  // sails (e.g. when they block the chase cam) without touching enemy ships
  const sail = mat(SL.cloth).clone();
  const anchorM = mat(SL.emblem ?? P.emblem, { outline: THIN }).clone();
  S.cloth = [sail, anchorM];
  // racing sails: a bold trim band along the foot of every sail (tier 1+)
  let trim;
  if (UP.sails >= 1) {
    const trimM = mat(SL.trim).clone();
    S.cloth.push(trimM);
    trim = { mat: trimM, w: 0.15 };
  }
  shrouds(S, hull, -0.85, 6.85);
  shrouds(S, hull, 2.05, 6.25, { n: 2 });
  squareRig(S, main, [
    { y: 6.95, h: 1.7, wt: 3.0, wb: 3.75, belly: 0.5, mat: sail, trim },
    { y: 5.0, h: 2.35, wt: 3.95, wb: 4.55, belly: 0.75, mat: sail, trim, decals: [{ shapes: anchorShapes(), size: 1.45, cy: -1.2, mat: anchorM }] },
  ], { spar: WOOD });
  squareRig(S, fore, [
    { y: 6.4, h: 1.55, wt: 2.7, wb: 3.35, belly: 0.45, mat: sail, trim },
    { y: 4.6, h: 2.1, wt: 3.5, wb: 4.1, belly: 0.65, mat: sail, trim, decals: [{ shapes: anchorShapes(), size: 1.12, cy: -1.08, mat: anchorM }] },
  ], { spar: WOOD });
  // fore-and-aft sails with an optional trim band along the foot (b = 1 edge)
  const footParts = (d, w = 0.13) =>
    trim ? [{ geo: pillowGeometry(d, 0, 1, 0, 1 - w), material: sail }, { geo: pillowGeometry(d, 0, 1, 1 - w, 1), material: trim.mat }] : [{ geo: pillowGeometry(d), material: sail }];

  // bowsprit, jib and figurehead
  const tip = bowsprit(S, hull, 2.3, 0.32, WOOD, 0.13);
  jibSail(S, [2.2, 6.15], tip, [2.5, 2.55], 0.38, (d) => footParts(d), { color: 0x3b2a22 });
  if (UP.sails >= 2) {
    // extra canvas: a flying jib out on a jib-boom, and a gaff spanker abaft the main mast.
    // Both sit in the centre plane, so the chase camera (dead astern) sees them edge-on.
    const dir = V3(0, Math.sin(0.25), Math.cos(0.25));
    const boomTip = tip.clone().addScaledVector(dir, 1.25);
    const wm = mat(WOOD);
    spar(S.group, wm, tip.clone().addScaledVector(dir, -0.6), boomTip, 0.085, 0.06, 8);
    add(S.group, sphere(), wm, boomTip.toArray(), null, 0.075);
    jibSail(S, [2.25, 6.85], boomTip, [4.55, 4.7], 0.3, (d) => footParts(d, 0.16), { color: 0x3b2a22, r: 0.03 });
    const mz = -0.85;
    const throat = [mz - 0.24, 5.55];
    const peak = [mz - 1.95, 6.45];
    const clew = [mz - 1.95, 3.35];
    const tack = [mz - 0.24, 3.2];
    const spanker = quadDef(throat, peak, clew, tack, 0.15, { nu: 12, nv: 12, leechBow: 0.12 });
    foreAftSail(S, S.group, spanker, (d) => footParts(d, 0.14), { p: V3() });
    rod(S.group, wm, V3(0, 5.57, mz - 0.18), V3(0, 6.5, mz - 2.05), 0.07, 8); // gaff
    rod(S.group, wm, V3(0, 3.15, mz - 0.18), V3(0, 3.27, mz - 2.12), 0.08, 8); // boom
  }
  const head = hull.stem(4).at(-1);
  seagull(S, V3(0, head.y - 0.35, head.z + 0.18), -0.25, 0.95);

  // flag on the main truck: a pennant, or the Jolly Roger (no taller than the pennant)
  if (FL.kind === 'jolly') {
    flagMesh(S, {
      p: V3(0, 7.86, -0.85),
      len: 1.8,
      h: 1.08,
      shape: 'swallow',
      mat: mat(FL.color),
      decal: { shapes: jollyRogerShapes(), size: 0.5, cx: 0.37, cy: 0.02, mat: mat(FL.emblem ?? 0xf6f1e4, { outline: false }) },
      yaw: -0.25,
      staff: WOOD,
      finial: P.accent,
      staffDown: 0.12,
      amp: 0.16,
    });
  } else {
    flagMesh(S, { p: V3(0, 8.05, -0.85), len: 2.4, h: 0.7, shape: 'pennant', mat: mat(FL.color), yaw: -0.25, staff: WOOD, finial: P.accent, staffDown: 0.5 });
  }

  // deck props
  barrel(S, 1.05, 1.2, 0.6);
  barrel(S, 0.95, 1.2, 1.25, 0x9a6233, 0x3a2a24, 0.85);
  add(S.group, rbox(1.2, 0.3, 1.0, 0.1), mat(P.rim), [0, 1.33, 0.75]);
  add(S.group, rbox(0.9, 0.12, 0.7, 0.05), mat(IRON), [0, 1.5, 0.75]);
  add(S.group, torus(0.28, 0.1, 16, 8), mat(0xd9c39a), [-1.0, 1.32, -1.9], [PI / 2, 0, 0]);

  // --- visible shipyard upgrades ------------------------------------------------
  // Deck props only go in fixed zones that stay clear of the crew's standing spots below.
  const D = hull.D;
  const block = (x, z, r) => S.blockers.push({ x, z, r });
  block(0, -0.85, 0.22); // main mast
  block(0, 2.05, 0.2); // fore mast
  block(1.05, 0.6, 0.31); // barrels
  block(0.95, 1.25, 0.27);
  block(-1.0, -1.9, 0.39); // rope coil
  S.blockers.push({ x: 0, z: 0.75, hx: 0.62, hz: 0.52 }); // hatch
  S.blockers.push({ x: 0, z: (cab.z0 + cab.z1) / 2, hx: cab.w / 2, hz: (cab.z1 - cab.z0) / 2 }); // stern castle
  // heavy shot: cannonball pyramids
  const pyramids = [[0.62, 2.78, 0.35], [1.0, -1.45, 0.1], [-0.95, -0.98, -0.1]];
  for (const [x, z, yaw] of pyramids.slice(0, UP.shot)) {
    shotPyramid(S, x, D, z, yaw);
    block(x, z, 0.4);
  }
  // gun crew drills: powder kegs, then a fife rail of rammers and sponges, then more kegs and a drill bell
  if (UP.crew >= 1) {
    powderKeg(S, 1.04, D, -2.28, 0.72);
    powderKeg(S, 0.6, D, -2.48, 0.62);
    block(1.04, -2.28, 0.25);
    block(0.6, -2.48, 0.22);
  }
  if (UP.crew >= 2) {
    fifeRail(S, -0.85, D, { bell: UP.crew >= 3 });
    block(0, -0.85, 0.53);
  }
  if (UP.crew >= 3) {
    powderKeg(S, 0.86, D, 1.8, 0.66);
    powderKeg(S, 0.78, D, 2.22, 0.66);
    powderKeg(S, 0.83, D + 0.41, 2.01, 0.6);
    block(0.86, 1.8, 0.21);
    block(0.78, 2.22, 0.21);
  }
  // ship's carpenter: toolbox and spare planks, then a sawhorse and patched planks on the hull
  if (UP.carpenter >= 1) {
    toolbox(S, -0.6, D, 2.8, -0.35);
    block(-0.6, 2.8, 0.38);
    plankStack(S, 0, 1.56, 0.75);
  }
  if (UP.carpenter >= 2) {
    sawhorse(S, -0.82, D, 1.78, 0.08);
    block(-0.82, 1.78, 0.42);
    // patches sit right under or over a gun port, so they never meet the iron hoops between the ports
    const zs = gunZ;
    const last = zs.length - 1;
    hullPatch(S, hull, zs[0] + 0.1, 0.27, -1, { tilt: 0.08 });
    hullPatch(S, hull, zs[last] - 0.08, 0.27, -1, { tilt: -0.1, w: 0.66 });
    hullPatch(S, hull, zs[1], 1.52, -1, { tilt: 0.06, w: 0.62, h: 0.34, color: STAVE });
    hullPatch(S, hull, zs[0] - 0.05, 0.27, 1, { tilt: -0.07 });
    hullPatch(S, hull, zs[1] + 0.06, 0.28, 1, { tilt: 0.09, w: 0.7 });
    hullPatch(S, hull, zs[last], 1.5, 1, { tilt: 0.1, w: 0.56, h: 0.34, color: STAVE });
  }
  // iron-banded hull: hoops between the gun ports, then more hoops with rivets, then an armoured bow
  if (UP.hull >= 1) {
    const zs = [];
    for (let i = 0; i < gunZ.length - 1; i++) zs.push((gunZ[i] + gunZ[i + 1]) / 2);
    if (UP.hull >= 2) zs.push(gunZ[0] - 0.85); // stern hoop
    if (UP.hull === 2) zs.push(gunZ[gunZ.length - 1] + 0.95); // bow hoop (the armour plates take over at tier 3)
    for (const z of zs) {
      for (const side of [-1, 1]) {
        const top = z < cab.z1 + 0.05 ? cab.y0 - 0.06 : hull.railAt(z) - hull.rb - 0.04;
        hullBand(S, hull, z, side, top, { rivets: UP.hull >= 2 });
      }
    }
  }
  if (UP.hull >= 3) armouredBow(S, hull);
  // long grapples (tavern): coiled grapnels hung on the quarterdeck rails
  for (const z of GRAPPLE_COILS[grapple]) for (const sd of [-1, 1]) grappleCoil(S, sd * (cab.w / 2 - 0.12), yq + 0.42, z);
  S.coils = GRAPPLE_COILS[grapple].length * 2;

  // Free standing spots for deck hands (ship-local; y = deck height; h = facing yaw) and
  // hull spots for a scrubber at the waterline. Kept clear of every prop above.
  S.deckSpots = [
    { x: 0.1, y: D, z: -1.95, h: PI / 2 },
    { x: 0, y: D, z: 3.45, h: PI },
    { x: 0.85, y: D, z: -0.15, h: -PI / 2 },
    { x: -0.8, y: D, z: -0.15, h: PI / 2 },
    { x: 0.85, y: cab.y1, z: -4.05, h: PI }, // on the quarterdeck
    { x: -0.85, y: cab.y1, z: -4.05, h: PI },
  ];
  S.fireSpots = [[0, 1.56, 0.75, 0.8]]; // flames out of the main hatch when wrecked
  S.hullSpots = [];
  for (const z of [-1.2, 1.2]) {
    for (const side of [1, -1]) {
      const y = 0.35;
      const { p } = hullPoint(hull, hullU(hull, z, y), y, side, 0);
      S.hullSpots.push({ x: r3(p.x), y, z: r3(p.z), side, h: -side * PI / 2 });
    }
  }
}

function buildCutter(S, T) {
  const C = { green: 0x1f6a43, greenDark: 0x14492e, cream: 0xf4e6c0, deck: 0xcfa36a, rim: 0x5a3a22, red: 0xe0352f, white: 0xfbf4e4 };
  const hull = makeHull({
    L: T.len,
    W: T.wid,
    rail: 1.6,
    deck: 1.2,
    bw: 0.18,
    yc: 0.75,
    n: 2.6,
    tumble: 0.08,
    sternLen: 0.12,
    sternP: 2.2,
    bowStart: 0.5,
    bowP: 1.8,
    bowQ: 0.85,
    bowRise: 0.45,
    sternRise: 0.15,
    bowLift: 1.0,
    sternLift: 0.8,
    bowRake: 0.5,
    sternRake: 0.3,
    breaks: [{ rel: -0.24 }],
  });
  addHull(S, hull, { bands: [mat(C.cream), mat(C.green)], rim: mat(C.rim), wall: mat(C.greenDark), deck: mat(C.deck) });
  S.hull = hull;
  deckPlanks(S, hull, 0xa87d4a, -2.9, 2.8, 4);
  cutwater(S, hull, C.rim, 0.1);
  for (let i = 0; i < T.guns; i++) for (const sd of [-1, 1]) gun(S, hull, gunOffset(T, i), 0.85, sd, { frame: C.cream, scale: 0.9 });

  const mz = 0.9;
  mast(S, mz, 1.0, 7.6, 0.15, WOOD);
  const white = mat(C.white);
  const red = mat(C.red);
  // gaff mainsail: throat on the mast, peak up/aft, clew at the boom end
  const throat = [mz - 0.25, 6.6];
  const peak = [mz - 3.3, 7.6];
  const clew = [-3.55, 2.15];
  const tack = [mz - 0.25, 2.05];
  const gaff = quadDef(throat, peak, clew, tack, 0.55, { nu: 16, nv: 12, leechBow: 0.35 });
  const gaffSail = foreAftSail(S, S.group, gaff, (d) => {
    const parts = [];
    const n = 7;
    for (let k = 0; k < n; k++) parts.push({ geo: pillowGeometry(d, k / n, (k + 1) / n, 0, 1), material: k % 2 ? white : red });
    return parts;
  }, { p: V3() });
  const sparM = mat(0x6b4226);
  rod(S.group, sparM, V3(0, 6.62, mz - 0.1), V3(0, 7.62, mz - 3.45), 0.085, 8); // gaff
  rod(S.group, sparM, V3(0, 2.0, mz - 0.1), V3(0, 2.1, -3.7), 0.1, 8); // boom
  // jib
  const tip = bowsprit(S, hull, 1.6, 0.18, WOOD, 0.1);
  jibSail(S, [mz + 0.15, 6.4], tip, [mz + 0.2, 2.0], 0.32, (d) => {
    const parts = [];
    const n = 4;
    for (let k = 0; k < n; k++) parts.push({ geo: pillowGeometry(d, 0, 1, k / n, (k + 1) / n), material: k % 2 ? red : white });
    return parts;
  }, { color: 0x6a4a30, r: 0.03 });
  S.dropSail = { mesh: gaffSail, kind: 'foreaft', yb: 2.05 };
  S.yardTips = { port: { x: 1.15, y: 5.4, z: mz }, star: { x: -1.15, y: 5.4, z: mz } }; // gaff-rigged: spreader ends
  S.droopSail = { mesh: S.sails[S.sails.length - 1], kind: 'foreaft', yb: 2.0 };
  // tiller, stern lantern and a painted skull on the transom
  rod(S.group, mat(C.rim), V3(0, 1.45, -3.1), V3(0, 1.75, -2.2), 0.06, 6);
  transomDecal(S, hull, [skullShape()], 0.55, 1.0, mat(0xf6f1e4, { outline: THIN }));
  rod(S.group, mat(C.rim), V3(0.55, 1.5, -3.05), V3(0.55, 2.35, -3.05), 0.05, 6);
  lantern(S, S.group, 0.55, 2.55, -3.05, { s: 0.8 });
  barrel(S, 0.55, 1.2, -1.2, 0x9a6233, 0x3a2a24, 0.8);
  // skull pennant
  flagMesh(S, {
    p: V3(0, 7.75, mz),
    len: 1.9,
    h: 0.95,
    shape: 'swallow',
    mat: mat(0x1d1a22),
    decal: { shapes: jollyRogerShapes(), size: 0.42, cx: 0.33, cy: 0.02, mat: mat(0xf6f1e4, { outline: false }) },
    yaw: -0.2,
    staff: WOOD,
  });

  // battle data: free deck spots (boarders, surrendering hands) and where a wrecked ship burns
  const D = hull.D;
  S.deckSpots = [
    { x: 0.6, y: D, z: -0.3, h: PI / 2 },
    { x: -0.55, y: D, z: -0.3, h: -PI / 2 },
    { x: -0.55, y: D, z: -1.7, h: -PI / 2 },
    { x: 0.6, y: D, z: -2.05, h: PI / 2 },
    { x: -0.25, y: D, z: 1.38, h: 0 },
  ];
  S.fireSpots = [[-0.45, D, -2.45, 0.7]];
}

function buildPrivateer(S, T) {
  S.brace = -0.42;
  const C = { navy: 0x203a7a, navyDark: 0x16285a, gold: 0xf4c23a, deck: 0xc8975f, rim: 0xf4c23a, sail: 0xd2c29e, patchA: 0x9a8159, patchB: 0xf3ead2 };
  const hull = makeHull({
    L: T.len,
    W: T.wid,
    rail: 1.8,
    deck: 1.2,
    bw: 0.2,
    yc: 0.8,
    n: 2.8,
    tumble: 0.1,
    sternLen: 0.09,
    sternP: 3,
    bowStart: 0.55,
    bowP: 2,
    bowQ: 0.75,
    bowRise: 0.5,
    sternRise: 0.35,
    bowLift: 1.05,
    sternLift: 0.8,
    bowRake: 0.6,
    sternRake: 0.25,
    breaks: [{ rel: -0.12 }, { rel: -0.22 }, { abs: 0.36 }, { abs: 0.3 }],
  });
  addHull(S, hull, {
    bands: [mat(C.navy), mat(C.gold), mat(C.navy), mat(C.gold), mat(C.navyDark)],
    rim: mat(0x6b3b22),
    wall: mat(0x8e2b25),
    deck: mat(C.deck),
  });
  S.hull = hull;
  deckPlanks(S, hull, 0xa0703e, -2.7, 4.0, 5);
  cutwater(S, hull, C.gold, 0.11);
  for (let i = 0; i < T.guns; i++) for (const sd of [-1, 1]) gun(S, hull, gunOffset(T, i), 0.82, sd, { frame: C.gold });
  const L2 = T.len / 2;
  const cab = sternCastle(S, hull, { z1: -2.75, y0: 1.0, y1: 2.55, color: C.navy, cap: C.gold, top: C.deck, r: 0.22, over: 0.1 });
  windows(S, S.group, [-0.75, 0, 0.75], 1.5, cab.z0, -1, { w: 0.42, h: 0.62, frame: C.navyDark, glow: 0xffd45e });
  add(S.group, rbox(cab.w - 0.3, 0.14, 0.12, 0.05), mat(C.gold), [0, 1.3, cab.z0 - 0.02]);
  for (const sd of [-1, 1]) lantern(S, S.group, sd * (cab.w / 2 - 0.15), cab.y1 + 0.42, cab.z0 + 0.2, { s: 0.9 });
  add(S.group, rbox(0.7, 0.95, 0.12, 0.1), mat(0x5a3320), [0, 1.6, cab.z1 + 0.02]);

  const fore = mast(S, 2.0, 1.0, 8.4, 0.17, 0x6b4226);
  const main = mast(S, -0.95, 1.0, 9.0, 0.18, 0x6b4226);
  shrouds(S, hull, -0.95, 7.9);
  shrouds(S, hull, 2.0, 7.3, { n: 2 });
  const sail = mat(C.sail);
  const pA = mat(C.patchA, { outline: THIN });
  const pB = mat(C.patchB, { outline: THIN });
  const patch = (w, h) => [roundRectShape(w, h, 0.06)];
  squareRig(S, main, [
    { y: 8.05, h: 2.0, wt: 2.6, wb: 3.3, belly: 0.45, mat: sail, decals: [{ shapes: patch(0.6, 0.5), size: 1, cx: 0.7, cy: -1.1, mat: pA, rot: 0.15 }] },
    {
      y: 5.8,
      h: 2.8,
      wt: 3.5,
      wb: 4.1,
      belly: 0.7,
      mat: sail,
      decals: [
        { shapes: patch(0.75, 0.6), size: 1, cx: -1.05, cy: -0.8, mat: pB, rot: -0.12 },
        { shapes: patch(0.55, 0.7), size: 1, cx: 1.15, cy: -1.95, mat: pA, rot: 0.1 },
      ],
    },
  ], { spar: 0x6b4226 });
  squareRig(S, fore, [
    { y: 7.45, h: 1.8, wt: 2.3, wb: 2.9, belly: 0.4, mat: sail },
    { y: 5.3, h: 2.6, wt: 3.1, wb: 3.7, belly: 0.65, mat: sail, decals: [{ shapes: patch(0.6, 0.55), size: 1, cx: 0.6, cy: -1.5, mat: pB, rot: 0.2 }] },
  ], { spar: 0x6b4226 });
  const tip = bowsprit(S, hull, 2.0, 0.3, 0x6b4226, 0.12);
  jibSail(S, [2.15, 7.0], tip, [2.4, 2.6], 0.35, (d) => [{ geo: pillowGeometry(d), material: sail }], { color: 0x5a3a26 });
  // gilded scroll figurehead
  scrollHead(S, hull, C.gold, 0.55);
  // Jolly Roger
  flagMesh(S, {
    p: V3(0, 8.85, -0.95),
    len: 2.2,
    h: 1.45,
    mat: mat(0x1b1820),
    decal: { shapes: jollyRogerShapes(), size: 0.75, cx: 0.48, cy: 0.0, mat: mat(0xf8f4ea, { outline: false }) },
    yaw: -0.15,
    staff: 0x6b4226,
  });
  barrel(S, -0.95, 1.2, 0.8);
  add(S.group, rbox(1.1, 0.3, 0.9, 0.1), mat(0x5a3320), [0, 1.33, 0.55]);

  const D = hull.D;
  S.deckSpots = [
    { x: 0.8, y: D, z: -0.2, h: PI / 2 },
    { x: -0.85, y: D, z: -0.15, h: -PI / 2 },
    { x: 0.75, y: D, z: -1.95, h: PI / 2 },
    { x: -0.75, y: D, z: -1.95, h: -PI / 2 },
    { x: 0.55, y: D, z: 2.9, h: PI / 2 },
    { x: -0.55, y: D, z: 2.9, h: -PI / 2 },
  ];
  S.fireSpots = [[0, 1.48, 0.55, 0.8]];
}

function buildPrahu(S, T) {
  const C = { hull: 0x2b7f8c, hullDark: 0x1d5a63, red: 0xd8322c, yellow: 0xf6c53a, white: 0xf6f0e2, deck: 0xb88554, sail: 0xf6b21b, stripe: 0xd7263d, bamboo: 0xd9b45a, node: 0x8a6a2a, wood: 0x7a4a28 };
  const hullW = 1.35;
  const hull = makeHull({
    L: T.len - 1.3,
    W: hullW,
    rail: 1.5,
    deck: 1.15,
    bw: 0.16,
    yc: 0.7,
    n: 2.0,
    tumble: 0.05,
    sternLen: 0.3,
    sternP: 1.6,
    bowStart: 0.62,
    bowP: 1.7,
    bowQ: 0.9,
    bowRise: 1.3,
    sternRise: 1.0,
    sternRiseSpan: 0.35,
    bowLift: 1.2,
    sternLift: 1.2,
    bowRake: 0.62,
    sternRake: 0.55,
    midPinch: 0.15,
    breaks: [{ rel: -0.16 }, { rel: -0.3 }, { abs: 0.62 }],
  });
  addHull(S, hull, { bands: [mat(C.red), mat(C.yellow), mat(C.white), mat(C.hull)], rim: mat(C.red), wall: mat(C.hullDark), deck: mat(C.deck) });
  S.hull = hull;
  // carved upswept scroll tips at bow and stern
  const L2 = hull.L / 2;
  const bowTop = V3(0, hull.rail(1) - 0.05, hull.zAt(1, hull.rail(1)) - 0.02);
  const scroll = (p, dir) => {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const ang = t * 3.4;
      const r = 0.58 * (1 - t * 0.55);
      pts.push(V3(0, p.y + Math.sin(ang) * r, p.z + dir * (Math.cos(ang) * -r + r) * 0.9));
    }
    add(S.group, taperTube(pts, (t) => 0.16 * (1 - t * 0.6), 30, 10), mat(C.red));
    add(S.group, sphere(), mat(C.yellow), pts.at(-1).toArray(), null, 0.11);
  };
  scroll(bowTop, 1);
  scroll(V3(0, hull.rail(0) - 0.05, hull.zAt(0, hull.rail(0)) + 0.02), -1);
  cutwater(S, hull, C.red, 0.09);
  // painted eye on the bow
  for (const sd of [-1, 1]) {
    const { p, n } = hull.surface(L2 - 1.0, 1.15, sd);
    const g = new THREE.Group();
    g.position.copy(p);
    aim(g, n);
    S.group.add(g);
    add(g, sphere(), mat(C.white, { outline: THIN }), [0, 0, 0], null, [0.24, 0.15, 0.05]);
    add(g, sphere(), mat(0x15121a, { outline: false }), [0, 0, 0.03], null, [0.09, 0.09, 0.04]);
  }

  // outriggers (floats + curved crossbeams)
  const bamboo = mat(C.bamboo);
  const fx = T.wid / 2 - 0.17;
  for (const sd of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      pts.push(V3(sd * fx, 0.1 + 0.25 * Math.pow(Math.abs(t * 2 - 1), 3), lerp(-2.7, 2.9, t)));
    }
    add(S.group, taperTube(pts, (t) => 0.17 * (1 - 0.35 * Math.pow(Math.abs(t * 2 - 1), 4)), 20, 10), bamboo);
    for (const z of [-1.2, 0.0, 1.2]) add(S.group, torus(0.17, 0.03, 12, 5), thin(C.node), [sd * fx, 0.1, z]);
    for (const z of [-1.5, 1.6]) {
      const beam = [V3(-sd * 0.3, 1.45, z), V3(sd * 0.7, 1.7, z), V3(sd * (fx - 0.25), 1.2, z), V3(sd * fx, 0.25, z)];
      add(S.group, taperTube(beam, () => 0.08, 16, 8), mat(C.wood));
    }
  }
  // swivel guns on posts at the rail
  for (let i = 0; i < T.guns; i++) {
    for (const sd of [-1, 1]) {
      const z = gunOffset(T, i);
      const x = hull.widthAt(z, 1.3) * sd;
      rod(S.group, mat(IRON), V3(x * 0.9, 1.3, z), V3(x * 0.9, 1.75, z), 0.05, 6);
      add(S.group, cannonGeo(0.6, 0.1), mat(IRON), [x * 0.8, 1.82, z], [PI / 2 - 0.1, (sd * PI) / 2, 0, 'YXZ']);
    }
  }

  // crab-claw sail on a short tripod mast
  const sparM = mat(C.wood);
  const tack = V3(0, 1.5, 2.2);
  const lowEnd = V3(0, 3.7, -3.5);
  const upEnd = V3(0, 9.2, -1.2);
  const ctrl = (a, b, bend) => {
    const m = V3().lerpVectors(a, b, 0.5);
    m.y += bend * 0.5;
    m.z += bend;
    return m;
  };
  const lowMid = ctrl(tack, lowEnd, -0.5);
  const upMid = ctrl(tack, upEnd, 0.55);
  const spLow = new THREE.QuadraticBezierCurve3(tack, lowMid, lowEnd);
  const spUp = new THREE.QuadraticBezierCurve3(tack, upMid, upEnd);
  add(S.group, taperTube(spLow.getPoints(10), (t) => 0.1 * (1 - 0.4 * t), 20, 8), sparM);
  add(S.group, taperTube(spUp.getPoints(10), (t) => 0.1 * (1 - 0.4 * t), 20, 8), sparM);
  rod(S.group, sparM, V3(0, 1.1, 0.6), V3(0, 5.6, 0.25), 0.11, 8);
  rod(S.group, sparM, V3(0, 5.6, 0.25), spUp.getPoint(0.5), 0.05, 6);
  const claw = {
    nu: 16,
    nv: 14,
    thick: 0.08,
    p: 6,
    map: (a, b) => {
      const bb = b * (1 - 0.3 * Math.sin(PI * a));
      const p1 = spLow.getPoint(bb);
      const p2 = spUp.getPoint(bb);
      return [-lerp(p1.z, p2.z, a), lerp(p1.y, p2.y, a)];
    },
    belly: (a, b) => 0.7 * Math.sin(PI * a) * Math.sin(PI * Math.min(1, b * 0.9)) * Math.pow(b, 0.7),
  };
  const saffron = mat(C.sail);
  const stripe = mat(C.stripe);
  const clawSail = foreAftSail(S, S.group, claw, (d) => {
    const parts = [];
    const cuts = [0, 0.2, 0.28, 0.72, 0.8, 1];
    for (let k = 0; k < cuts.length - 1; k++) parts.push({ geo: pillowGeometry(d, cuts[k], cuts[k + 1], 0, 1), material: k % 2 ? stripe : saffron });
    const sk = [skullShape(0, 0, 1)];
    for (const side of [1, -1]) {
      const [cx, cy] = d.map(0.5, 0.62);
      parts.push({ geo: sailDecal(d, sk, 1.05, cx, cy, side, 0.07), material: mat(0x1c1820, { outline: THIN }) });
    }
    return parts;
  }, { p: V3() });
  S.dropSail = S.droopSail = { mesh: clawSail, kind: 'foreaft', yb: 1.5 };
  S.yardTips = { port: { x: 1.0, y: 5.2, z: 0.3 }, star: { x: -1.0, y: 5.2, z: 0.3 } }; // crab claw: at the tripod head
  flagMesh(S, { p: upEnd.clone().add(V3(0, 0.15, 0)), len: 1.6, h: 0.6, shape: 'pennant', mat: mat(0x1c1820), yaw: -0.3, staff: C.wood, staffDown: 0.05, finial: C.yellow });
  // little hut amidships with a peaked thatch (atap) roof and a ridge pole
  add(S.group, rbox(0.8, 0.45, 1.2, 0.1), mat(0x9b6a3a), [0, 1.38, -1.1]);
  for (const sd of [-1, 1]) add(S.group, rbox(0.74, 0.11, 1.55, 0.05), mat(0xc9a35a), [sd * 0.27, 1.83, -1.1], [0, 0, -sd * 0.62]);
  rod(S.group, sparM, V3(0, 2.07, -1.95), V3(0, 2.07, -0.25), 0.065, 8);

  const D = hull.D;
  // a narrow boat: two hands fit on the stern deck, the rest balance on the outrigger booms
  S.deckSpots = [
    { x: 0, y: D, z: -2.2, h: PI / 2 },
    { x: 0, y: D, z: -2.65, h: -PI / 2 },
    { x: 0.68, y: 1.78, z: -1.5, h: PI / 2 },
    { x: -0.68, y: 1.78, z: -1.5, h: -PI / 2 },
    { x: -0.68, y: 1.78, z: 1.6, h: -PI / 2 },
  ];
  S.fireSpots = [[0, D, -2.6, 0.6]];
}

function buildJunk(S, T) {
  const C = { red: 0xc8262a, redDark: 0x8e1b1e, gold: 0xf2c230, deck: 0xb7824c, rim: 0x3a2618, orange: 0xf0862a, ochre: 0xdba33c, batten: 0x3a2618, green: 0x2fa05c };
  const hull = makeHull({
    L: T.len,
    W: T.wid,
    rail: 1.9,
    deck: 1.4,
    bw: 0.22,
    yc: 0.95,
    n: 3.2,
    tumble: 0.06,
    sternLen: 0.06,
    sternP: 4,
    bowStart: 0.6,
    bowP: 2.2,
    bowQ: 0.45,
    bowRise: 0.75,
    sternRise: 1.2,
    sternRiseSpan: 0.32,
    bowLift: 0.9,
    sternLift: 0.7,
    bowRake: 0.6,
    sternRake: 0.22,
    breaks: [{ rel: -0.2 }, { abs: 0.42 }],
  });
  addHull(S, hull, { bands: [mat(C.gold), mat(C.red), mat(0x2a1c1c)], rim: mat(C.rim), wall: mat(C.redDark), deck: mat(C.deck) });
  S.hull = hull;
  deckPlanks(S, hull, 0x8f6236, -3.0, 4.6, 6);
  for (let i = 0; i < T.guns; i++) for (const sd of [-1, 1]) gun(S, hull, gunOffset(T, i), 0.85, sd, { frame: C.gold });
  // oculi (dragon eyes) on the bow
  const L2 = T.len / 2;
  for (const sd of [-1, 1]) {
    const { p, n } = hull.surface(L2 - 1.25, 1.35, sd);
    const g = new THREE.Group();
    g.position.copy(p);
    aim(g, n);
    S.group.add(g);
    add(g, sphere(), mat(C.gold, { outline: THIN }), [0, 0, 0], [0, 0, 0.0], [0.42, 0.28, 0.07]);
    add(g, sphere(), mat(0xfffbf0, { outline: false }), [0.05, 0, 0.035], null, [0.27, 0.2, 0.05]);
    add(g, sphere(), mat(0x120e14, { outline: false }), [0.09, 0, 0.06], null, [0.13, 0.15, 0.04]);
    add(g, sphere(), mat(0xffffff, { outline: false }), [0.13, 0.05, 0.085], null, [0.04, 0.04, 0.02]);
  }
  // tall stern house with an overhanging top
  const cab = sternCastle(S, hull, { z1: -2.6, y0: 1.2, y1: 3.35, color: C.red, cap: C.gold, top: C.deck, r: 0.25, over: 0.08 });
  // tall, raked stern board with a painted sun disc
  const sb = new THREE.Group();
  sb.position.set(0, cab.y1 - 0.15, cab.z0 + 0.22);
  sb.rotation.x = 0.16;
  S.group.add(sb);
  add(sb, rbox(cab.w * 0.86, 1.5, 0.3, 0.14), mat(C.red), [0, 0.72, 0]);
  add(sb, capsule(0.13, cab.w * 0.86 - 0.1, 8), mat(C.gold), [0, 1.48, 0], [0, 0, PI / 2]);
  add(sb, cyl(0.42, 0.42, 0.08, 20), mat(C.gold, { outline: THIN }), [0, 0.75, -0.16], [PI / 2, 0, 0]);
  add(sb, cyl(0.26, 0.26, 0.08, 18), mat(0xe8452c, { outline: THIN }), [0, 0.75, -0.2], [PI / 2, 0, 0]);
  for (const sd of [-1, 1]) add(sb, sphere(), mat(C.gold), [sd * (cab.w * 0.43), 1.48, 0], null, 0.17);
  windows(S, S.group, [-0.8, 0.8], 2.1, cab.z0, -1, { w: 0.52, h: 0.52, round: true, frame: C.gold, glow: 0xffb040 });
  add(S.group, rbox(1.0, 0.5, 0.1, 0.08), mat(C.gold), [0, 1.55, cab.z0 - 0.02]);
  // paper lanterns
  const lanternR = (x, y, z, s = 1) => {
    add(S.group, sphere(), glow(S, 0xff4a2a, 1.0), [x, y, z], null, [0.24 * s, 0.3 * s, 0.24 * s]);
    add(S.group, cyl(0.12 * s, 0.12 * s, 0.08, 10), mat(0x2a1a14), [x, y + 0.3 * s, z]);
    add(S.group, cyl(0.12 * s, 0.12 * s, 0.08, 10), mat(0x2a1a14), [x, y - 0.3 * s, z]);
    add(S.group, sphere(), mat(C.gold), [x, y - 0.42 * s, z], null, 0.05 * s);
  };
  for (const sd of [-1, 1]) {
    rod(S.group, mat(C.rim), V3(sd * (cab.w / 2 - 0.1), cab.y1 + 0.3, cab.z0 + 0.3), V3(sd * (cab.w / 2 + 0.25), cab.y1 + 0.5, cab.z0 - 0.05), 0.05, 6);
    lanternR(sd * (cab.w / 2 + 0.25), cab.y1 - 0.05, cab.z0 - 0.05);
  }
  // dragon head figurehead
  const head = hull.stem(4).at(-1);
  const dg = new THREE.Group();
  dg.position.set(0, head.y + 0.05, head.z - 0.05);
  S.group.add(dg);
  const green = mat(C.green);
  const gold = mat(C.gold);
  add(dg, sphere(), green, [0, 0.35, 0.2], null, [0.38, 0.4, 0.45]);
  add(dg, sphere(), green, [0, 0.25, 0.65], [0.15, 0, 0], [0.26, 0.22, 0.45]);
  add(dg, sphere(), mat(0xd9302c), [0, 0.1, 0.72], [0.25, 0, 0], [0.2, 0.08, 0.35]);
  for (const sd of [-1, 1]) {
    add(dg, sphere(), mat(0xffe14a, { outline: THIN }), [sd * 0.2, 0.5, 0.42], null, 0.09);
    add(dg, sphere(), mat(0x120e14, { outline: false }), [sd * 0.25, 0.51, 0.47], null, 0.045);
    const horn = [V3(sd * 0.18, 0.62, 0.2), V3(sd * 0.3, 0.95, -0.05), V3(sd * 0.33, 1.1, -0.4)];
    add(dg, taperTube(horn, (t) => 0.08 * (1 - t * 0.85), 12, 8), gold);
    const whisk = [V3(sd * 0.15, 0.2, 0.95), V3(sd * 0.45, 0.15, 0.9), V3(sd * 0.7, 0.3, 0.7)];
    add(dg, taperTube(whisk, (t) => 0.035 * (1 - t * 0.7), 10, 6), gold);
  }
  add(dg, taperTube([V3(0, 0.7, 0.05), V3(0, 0.8, -0.3), V3(0, 0.55, -0.6)], (t) => 0.08 * (1 - t * 0.6), 12, 6), mat(0xd9302c));

  // three battened fan sails
  const masts = [
    { z: 3.3, y1: 7.6, sail: { top: 7.1, bot: 2.6, w: 3.0, fwd: 0.5 } },
    { z: 0.0, y1: 10.0, sail: { top: 9.0, bot: 2.5, w: 3.8, fwd: 0.6 } },
    { z: -2.45, y1: 7.6, sail: { top: 7.15, bot: 4.0, w: 2.05, fwd: 0.35 } },
  ];
  const orange = mat(C.orange);
  const ochre = mat(C.ochre);
  const battenM = mat(C.batten);
  masts.forEach((mm, mi) => {
    mast(S, mm.z, 1.2, mm.y1, mi === 1 ? 0.18 : 0.15, 0x5a3a24);
    const s = mm.sail;
    const nb = mi === 1 ? 6 : 5;
    const h = s.top - s.bot;
    const def = {
      nu: 12,
      nv: nb * 4,
      thick: 0.08,
      p: 6,
      map: (a, b) => {
        // luff slightly forward of the mast, fan-shaped leech, head yard angled up
        const xLuff = -s.fwd;
        const xLeech = s.w * (0.82 + 0.25 * Math.sin(PI * b * 0.9));
        const x = lerp(xLuff, xLeech, a);
        const y = s.top + (h * 0.12) * a * (1 - b) - h * b + 0.35 * a * b * b;
        return [x, y];
      },
      belly: (a, b) => 0.22 * Math.sin(PI * Math.min(1, a * 0.9 + 0.05)) * (0.4 + Math.pow(Math.abs(Math.sin(PI * nb * b)), 0.8)),
    };
    const fan = foreAftSail(S, S.group, def, (d) => {
      const parts = [];
      for (let k = 0; k < nb; k++) parts.push({ geo: pillowGeometry(d, 0, 1, k / nb, (k + 1) / nb), material: k % 2 ? ochre : orange });
      for (let k = 0; k <= nb; k++) {
        const b = k / nb;
        const pts = [];
        for (let i = 0; i <= 8; i++) {
          const a = -0.04 + (1.08 * i) / 8;
          const [x, y] = d.map(clamp(a, 0, 1), b);
          pts.push(V3(x + (a < 0 ? a * 2 : a > 1 ? (a - 1) * 2 : 0), y, d.belly(clamp(a, 0, 1), b)));
        }
        parts.push({ geo: taperTube(pts, () => 0.065, 14, 6), material: battenM });
      }
      if (mi === 1) {
        for (const side of [1, -1]) {
          const [cx, cy] = d.map(0.5, 0.42);
          parts.push({ geo: sailDecal(d, [skullShape()], 1.3, cx, cy, side, 0.07), material: mat(0x1c1820, { outline: THIN }) });
        }
      }
      return parts;
    }, { p: V3(0, 0, mm.z) });
    if (mi === 1) {
      S.dropSail = { mesh: fan, kind: 'foreaft', yb: s.bot };
      S.yardTips = { port: { x: 1.4, y: 7.2, z: mm.z }, star: { x: -1.4, y: 7.2, z: mm.z } }; // battened: the main mast's middle batten height
    }
    if (mi === 0) S.droopSail = { mesh: fan, kind: 'foreaft', yb: s.bot };
  });
  // flag high enough to clear the main sail's raised peak
  flagMesh(S, {
    p: V3(0, 10.6, 0.0),
    len: 1.95,
    h: 1.2,
    mat: mat(0x1b1820),
    decal: { shapes: jollyRogerShapes(), size: 0.64, cx: 0.48, cy: 0.0, mat: mat(0xf8f4ea, { outline: false }) },
    yaw: -0.15,
    staff: 0x5a3a24,
    finial: C.gold,
  });
  for (const z of [1.4, -1.4]) lanternR(1.2, 2.2, z, 0.8);

  const D = hull.D;
  S.deckSpots = [
    { x: 0.65, y: D, z: -1.2, h: PI / 2 },
    { x: -0.7, y: D, z: -1.2, h: -PI / 2 },
    { x: -0.7, y: D, z: 1.5, h: -PI / 2 },
    { x: 0.6, y: D, z: 1.6, h: PI / 2 },
  ];
  S.fireSpots = [[-0.7, D, 2.4, 0.8]];
}

function buildCorsair(S, T) {
  S.brace = -0.45;
  const C = { hull: 0x2b2a33, hullDark: 0x1c1b22, seam: 0xff7a1a, deck: 0x55433a, rim: 0x3f3a48, sail: 0x9a1f22, spar: 0x2e2622 };
  const hull = makeHull({
    L: T.len,
    W: T.wid,
    rail: 1.6,
    deck: 1.2,
    bw: 0.18,
    yc: 0.75,
    n: 2.8,
    tumble: 0.12,
    sternLen: 0.08,
    sternP: 2.6,
    bowStart: 0.48,
    bowP: 1.6,
    bowQ: 1.0,
    bowRise: 0.55,
    sternRise: 0.35,
    bowLift: 1.0,
    sternLift: 0.8,
    bowRake: 0.9,
    sternRake: 0.3,
    midPinch: 0.08,
    breaks: [{ rel: -0.2 }, { rel: -0.26 }, { abs: 0.62 }, { abs: 0.56 }],
  });
  const seam = glow(S, C.seam, 1.0, false, 0.25);
  addHull(S, hull, { bands: [mat(C.hull), seam, mat(C.hull), seam, mat(C.hull)], rim: mat(C.rim), wall: mat(0x4a2a24), deck: mat(C.deck) });
  S.hull = hull;
  deckPlanks(S, hull, 0x3a2c26, -2.6, 3.3, 5);
  cutwater(S, hull, C.rim, 0.1);
  for (let i = 0; i < T.guns; i++) for (const sd of [-1, 1]) gun(S, hull, gunOffset(T, i), 0.88, sd, { style: 'hot', frame: C.rim, hole: 0xff5a14 });
  const L2 = T.len / 2;
  const cab = sternCastle(S, hull, { z1: -2.9, y0: 1.0, y1: 2.2, color: C.hull, cap: C.rim, top: C.deck, r: 0.2, over: 0.06 });
  windows(S, S.group, [-0.6, 0.6], 1.38, cab.z0, -1, { w: 0.38, h: 0.5, frame: C.rim, glow: 0xff7a24 });
  // spiked stern rail
  for (const sd of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const z = lerp(cab.z0 + 0.2, cab.z1 - 0.2, k / 2);
      add(S.group, cone(0.09, 0.45, 8), mat(0x8a8494), [sd * (cab.w / 2 - 0.1), cab.y1 + 0.3, z]);
    }
  }
  const sail = mat(C.sail);
  const fore = mast(S, 1.7, 1.0, 8.0, 0.16, C.spar, { rake: -0.1 });
  const main = mast(S, -1.2, 1.0, 8.8, 0.17, C.spar, { rake: -0.1 });
  shrouds(S, hull, -1.2, 7.7, { rake: -0.1, color: 0x2a1c18 });
  shrouds(S, hull, 1.7, 7.0, { rake: -0.1, n: 2, color: 0x2a1c18 });
  const bone = mat(0xf2ead8, { outline: THIN });
  squareRig(S, main, [
    { y: 7.9, h: 2.0, wt: 2.5, wb: 3.1, belly: 0.45, mat: sail, torn: 0.18, seed: 2 },
    { y: 5.6, h: 2.8, wt: 3.4, wb: 3.9, belly: 0.7, mat: sail, torn: 0.16, seed: 5, decals: [{ shapes: jollyRogerShapes(), size: 1.3, cy: -1.25, mat: bone }] },
  ], { spar: C.spar });
  squareRig(S, fore, [
    { y: 7.2, h: 1.8, wt: 2.2, wb: 2.8, belly: 0.4, mat: sail, torn: 0.2, seed: 7 },
    { y: 5.1, h: 2.5, wt: 3.0, wb: 3.5, belly: 0.62, mat: sail, torn: 0.17, seed: 3 },
  ], { spar: C.spar });
  bowsprit(S, hull, 2.4, 0.22, C.spar, 0.11);
  brazier(S, 0, cab.y1, cab.z0 + 0.75, { s: 0.75, smoke: true });
  flagMesh(S, {
    p: V3(0, 8.6, -1.2 - 0.85),
    len: 2.0,
    h: 1.3,
    shape: 'swallow',
    mat: mat(0x16141a),
    decal: { shapes: jollyRogerShapes(), size: 0.65, cx: 0.45, cy: 0.0, mat: mat(0xff8a2a, { outline: false }) },
    yaw: -0.15,
    staff: C.spar,
  });

  const D = hull.D;
  S.deckSpots = [
    { x: 0.7, y: D, z: -0.2, h: PI / 2 },
    { x: -0.7, y: D, z: -0.2, h: -PI / 2 },
    { x: 0.65, y: D, z: -2.2, h: PI / 2 },
    { x: -0.65, y: D, z: -2.2, h: -PI / 2 },
    { x: 0, y: D, z: 2.45, h: PI },
  ];
  S.fireSpots = [[0, D, 0.5, 0.8]];
}

function buildManowar(S, T) {
  S.brace = 0.4;
  const C = { wood: 0x4d2e1e, woodDark: 0x2e1a12, red: 0xc0262d, gold: 0xe8b83a, deck: 0xa8794b, rim: 0x1f1714, sail: 0xc3c6cc, black: 0x17151b };
  const hull = makeHull({
    L: T.len,
    W: T.wid,
    rail: 2.55,
    deck: 1.8,
    keel: -0.9,
    bw: 0.24,
    yc: 1.0,
    n: 3.0,
    tumble: 0.12,
    sternLen: 0.07,
    sternP: 3,
    bowStart: 0.6,
    bowP: 2,
    bowQ: 0.7,
    bowRise: 0.6,
    sternRise: 0.5,
    bowLift: 1.2,
    sternLift: 0.9,
    bowRake: 0.7,
    sternRake: 0.3,
    breaks: [{ rel: -0.12 }, { abs: 1.88 }, { abs: 1.12 }, { abs: 0.42 }],
  });
  addHull(S, hull, { bands: [mat(C.gold), mat(C.wood), mat(C.red), mat(C.wood), mat(C.woodDark)], rim: mat(C.rim), wall: mat(0x7a1f22), deck: mat(C.deck) });
  S.hull = hull;
  deckPlanks(S, hull, 0x82593a, -3.6, 5.6, 6);
  cutwater(S, hull, C.gold, 0.13);
  for (let i = 0; i < T.guns; i++) {
    for (const sd of [-1, 1]) {
      gun(S, hull, gunOffset(T, i), 0.8, sd, { frame: C.gold });
      gun(S, hull, gunOffset(T, i) + 0.75, 1.5, sd, { frame: C.gold, scale: 0.9 });
    }
  }
  const L2 = T.len / 2;
  const cab = sternCastle(S, hull, { z1: -3.6, y0: 1.6, y1: 3.4, color: C.wood, cap: C.gold, top: C.deck, r: 0.25, over: 0.12 });
  windows(S, S.group, [-1.2, -0.4, 0.4, 1.2], 2.0, cab.z0, -1, { w: 0.42, h: 0.6, frame: C.gold, glow: 0xffbf4a });
  const cab2 = sternCastle(S, hull, { z0: cab.z0 + 0.05, z1: -4.9, y0: 3.4, y1: 4.5, color: C.wood, cap: C.gold, top: C.deck, r: 0.22, w: cab.w - 0.5 });
  windows(S, S.group, [-0.75, 0, 0.75], 3.65, cab2.z0, -1, { w: 0.36, h: 0.5, frame: C.gold, glow: 0xffbf4a });
  add(S.group, rbox(cab.w - 0.2, 0.18, 0.14, 0.06), mat(C.gold), [0, 1.75, cab.z0 - 0.03]);
  for (const sd of [-1, 1]) {
    lantern(S, S.group, sd * (cab2.w / 2 - 0.1), cab2.y1 + 0.45, cab2.z0 + 0.15, { s: 1.0 });
    for (const z of [-5.6, -4.6]) {
      const holder = new THREE.Group();
      holder.position.set(sd * (cab.w / 2 + 0.01), 2.45, z);
      holder.rotation.y = (sd * PI) / 2;
      S.group.add(holder);
      add(holder, rbox(0.42, 0.52, 0.1, 0.06), mat(C.gold, { outline: THIN }));
      add(holder, rbox(0.3, 0.4, 0.1, 0.05), glow(S, 0xffbf4a, 1), [0, 0, 0.03]);
    }
  }
  lantern(S, S.group, 0, cab2.y1 + 0.55, cab2.z0 + 0.1, { s: 1.2 });
  // forecastle rise
  add(S.group, rbox(2.4, 0.5, 2.2, 0.2), mat(C.wood), [0, 2.0, 4.6]);

  const sail = mat(C.sail);
  const skullM = mat(C.black, { outline: THIN });
  const sparC = 0x3a2618;
  const fore = mast(S, 3.7, 1.6, 10.6, 0.2, sparC);
  const main = mast(S, 0.2, 1.6, 12.0, 0.23, sparC);
  const miz = mast(S, -3.3, 1.6, 9.4, 0.18, sparC);
  shrouds(S, hull, 3.7, 10.0, { n: 3, spread: 0.45 });
  shrouds(S, hull, 0.2, 11.2, { n: 4, spread: 0.45 });
  shrouds(S, hull, -3.3, 8.8, { n: 3, spread: 0.4 });
  squareRig(S, main, [
    { y: 11.3, h: 2.2, wt: 3.1, wb: 3.9, belly: 0.5, mat: sail },
    { y: 8.95, h: 2.4, wt: 4.0, wb: 4.8, belly: 0.6, mat: sail },
    { y: 6.35, h: 3.3, wt: 5.0, wb: 5.6, belly: 0.85, mat: sail, decals: [{ shapes: jollyRogerShapes(), size: 1.9, cy: -1.7, mat: skullM }] },
  ], { spar: sparC, yardR: 0.12 });
  squareRig(S, fore, [
    { y: 10.0, h: 2.0, wt: 2.8, wb: 3.5, belly: 0.45, mat: sail },
    { y: 7.8, h: 2.2, wt: 3.6, wb: 4.3, belly: 0.55, mat: sail },
    { y: 5.4, h: 2.9, wt: 4.4, wb: 5.0, belly: 0.75, mat: sail },
  ], { spar: sparC, yardR: 0.11 });
  squareRig(S, miz, [
    { y: 8.8, h: 1.9, wt: 2.5, wb: 3.1, belly: 0.4, mat: sail },
    { y: 6.6, h: 2.0, wt: 3.1, wb: 3.7, belly: 0.5, mat: sail },
  ], { spar: sparC, yardR: 0.1 });
  // crow's nests
  for (const [g, y] of [[main, 8.0], [fore, 7.0]]) {
    add(g, lathe('nest', [
      [0.0001, -0.2],
      [0.45, -0.2],
      [0.5, 0.0],
      [0.52, 0.35],
      [0.44, 0.35],
      [0.0001, 0.1],
    ], 14), mat(C.wood), [0, y, 0]);
  }
  const tip = bowsprit(S, hull, 3.0, 0.3, sparC, 0.15);
  jibSail(S, [3.8, 9.6], tip, [4.2, 3.6], 0.4, (d) => [{ geo: pillowGeometry(d), material: sail }], { color: 0x3a2a1e, r: 0.04 });
  const head = hull.stem(4).at(-1);
  skullHead(S, V3(0, head.y - 0.45, head.z + 0.1), 0.62, 0xefe6cf, -0.35);
  const roger = { shapes: jollyRogerShapes(), size: 0.85, cx: 0.48, cy: 0.0, mat: mat(0xf8f4ea, { outline: false }) };
  flagMesh(S, { p: V3(0, 11.75, 0.2), len: 2.6, h: 1.65, mat: mat(C.black), decal: roger, yaw: -0.12, staff: sparC });
  flagMesh(S, { p: V3(0, 10.4, 3.7), len: 2.0, h: 0.55, shape: 'pennant', mat: mat(C.black), yaw: -0.2, staff: sparC });
  flagMesh(S, { p: V3(0, 9.2, -3.3), len: 1.8, h: 0.5, shape: 'pennant', mat: mat(C.black), yaw: -0.2, staff: sparC });

  const D = hull.D;
  S.deckSpots = [
    { x: 1.0, y: D, z: -1.3, h: PI / 2 },
    { x: -1.0, y: D, z: -1.3, h: -PI / 2 },
    { x: 1.0, y: D, z: 1.9, h: PI / 2 },
    { x: -1.0, y: D, z: 1.9, h: -PI / 2 },
    { x: 0, y: D, z: -2.2, h: 0 },
    { x: 0, y: D, z: 2.0, h: PI },
  ];
  S.fireSpots = [[0.9, D, 0.3, 0.9], [-0.8, D, -2.6, 0.8]];
}

function buildInferno(S, T) {
  S.brace = -0.38;
  const C = { obs: 0x2e2538, obsLight: 0x4a3d5c, magma: 0xff5a1f, ember: 0xff8a2a, bone: 0xf0e6cc, deck: 0x4a3530, sail: 0x3a3144, rim: 0x1a1420, horn: 0xe9dcc0 };
  const hull = makeHull({
    L: T.len,
    W: T.wid,
    rail: 2.65,
    deck: 1.8,
    keel: -1.0,
    bw: 0.28,
    yc: 1.05,
    n: 3.0,
    tumble: 0.14,
    sternLen: 0.06,
    sternP: 3.2,
    bowStart: 0.6,
    bowP: 2,
    bowQ: 0.7,
    bowRise: 0.9,
    sternRise: 0.9,
    bowLift: 1.3,
    sternLift: 1.0,
    bowRake: 0.6,
    sternRake: 0.35,
    breaks: [{ rel: -0.18 }, { abs: 0.42 }, { abs: 0.3 }],
  });
  const magma = glow(S, C.magma, 1.1, false, 0.3);
  addHull(S, hull, { bands: [mat(C.obsLight), mat(C.obs), magma, mat(C.rim)], rim: mat(C.rim), wall: mat(0x4a1a1a), deck: mat(C.deck) });
  S.hull = hull;
  deckPlanks(S, hull, 0x2a1e1c, -3.5, 6.5, 6);
  // magma cracks: tapered, meandering glowing fissures with small forks. Hot
  // orange (a yellower base colour saturates to lemon under the emissive), and
  // placed in the gaps between the gun ports so the ports stay readable.
  const crackM = glow(S, 0xff5a14, 1.2, false, 0.3);
  const rnd = mulberry(7);
  const cracks = [
    { z: -6.6, y: 1.55, m: 0.2, n: 3 },
    { z: -5.75, y: 1.55, m: 0.3, n: 3 },
    { z: -2.25, y: 2.4, m: 0.4, n: 5 },
    { z: 1.28, y: 2.4, m: 0.4, n: 5 },
    { z: 3.42, y: 2.4, m: 0.14, n: 3 },
  ];
  for (const sd of [-1, 1]) {
    for (const c of cracks) {
      let z = c.z + (rnd() - 0.5) * 0.15;
      let y = c.y - rnd() * 0.1;
      let ang = (rnd() - 0.5) * 0.6;
      let r = 0.095;
      let prev = hull.surface(z, y, sd).p;
      for (let k = 0; k < c.n && y > 0.5; k++) {
        const len = 0.38 + rnd() * 0.2 - k * 0.03;
        ang = clamp(-ang * 0.55 + (rnd() - 0.5) * 1.7, -1.05, 1.05); // jagged, not a regular zig-zag
        y -= Math.cos(ang) * len;
        z = clamp(z + Math.sin(ang) * len, c.z - c.m, c.z + c.m);
        const p = hull.surface(z, y, sd).p;
        rod(S.group, crackM, prev, p, r, 6);
        if (k === 1 || (k === 3 && rnd() < 0.6)) {
          const ba = ang + (rnd() < 0.5 ? -1 : 1) * (0.8 + rnd() * 0.4);
          // (kept off the raked stern, where hull.surface() no longer follows the skin)
          const bz = clamp(z + Math.sin(ba) * 0.4, Math.max(c.z - c.m - 0.15, 1.2 - T.len / 2), c.z + c.m + 0.15);
          rod(S.group, crackM, p, hull.surface(bz, y - Math.abs(Math.cos(ba)) * 0.32, sd).p, r * 0.6, 6);
        }
        r *= 0.8;
        prev = p;
      }
    }
  }
  for (let i = 0; i < T.guns; i++) {
    for (const sd of [-1, 1]) {
      gun(S, hull, gunOffset(T, i), 0.85, sd, { style: 'hot', frame: C.rim, hole: 0xff4a12 });
      if (i % 2 === 0) gun(S, hull, gunOffset(T, i) + 0.8, 1.7, sd, { style: 'hot', frame: C.rim, hole: 0xff4a12, scale: 0.85 });
    }
  }

  // jaw-shaped bow: angry glowing eyes, a molten mouth line with fangs, an underbite chin
  const L2 = T.len / 2;
  const obs = mat(C.obs);
  const bone = mat(C.bone);
  const eyeM = glow(S, 0xffd23a, 1.25, true, 0.2);
  const mouthM = glow(S, 0xff3a0a, 1.15, false, 0.3);
  const zStem = (y) => hull.zAt(1, y);
  for (const sd of [-1, 1]) {
    const { p, n } = hull.surface(L2 - 1.75, 2.3, sd);
    const g = new THREE.Group();
    g.position.copy(p);
    aim(g, n);
    S.group.add(g);
    add(g, sphere(), eyeM, [0, 0, 0], null, [0.62, 0.34, 0.1]);
    add(g, sphere(), toon(0x120c10, { outline: false }), [-sd * 0.08, 0, 0.07], null, [0.09, 0.27, 0.05]);
    add(g, rbox(1.35, 0.26, 0.28, 0.1), mat(C.obsLight), [sd * 0.05, 0.38, 0.08], [0, 0, sd * 0.3]);
  }
  // mouth: glowing lip running round the bow, fangs above and below it
  const mouth = [];
  for (const sd of [-1, 1]) {
    const side = [];
    for (let k = 0; k <= 6; k++) {
      const z = lerp(L2 - 3.6, L2 - 0.1, k / 6);
      const y = 1.05 + 0.12 * (k / 6);
      side.push(hull.surface(Math.min(z, zStem(y) - 0.02), y, sd).p);
    }
    if (sd < 0) mouth.push(...side);
    else mouth.push(...side.reverse());
  }
  mouth.splice(7, 0, V3(0, 1.2, zStem(1.2) + 0.08));
  add(S.group, taperTube(mouth, (t) => 0.16 + 0.05 * Math.sin(PI * t), 40, 8), mouthM);
  for (const sd of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const z = lerp(L2 - 3.2, L2 - 0.6, k / 4);
      const up = hull.surface(z, 1.42, sd);
      const lo = hull.surface(z - 0.25, 0.86, sd);
      const f1 = add(S.group, cone(0.13, 0.48, 8), bone, up.p.addScaledVector(up.n, 0.05).toArray());
      f1.rotation.set(PI, 0, 0);
      add(S.group, cone(0.1, 0.34, 8), bone, lo.p.addScaledVector(lo.n, 0.05).toArray());
    }
  }
  // protruding underbite chin with two tusks
  const zc = zStem(0.45);
  add(S.group, sphere(), obs, [0, 0.45, zc - 0.2], [-0.1, 0, 0], [0.95, 0.45, 1.45]);
  for (const sd of [-1, 1]) {
    const tusk = [V3(sd * 0.5, 0.75, zc + 0.6), V3(sd * 0.62, 1.15, zc + 0.75), V3(sd * 0.55, 1.45, zc + 0.6)];
    add(S.group, taperTube(tusk, (t) => 0.13 * (1 - t * 0.85), 12, 8), bone);
  }

  // towering stern castle in three tiers with horns
  const cab = sternCastle(S, hull, { z1: -4.3, y0: 1.6, y1: 3.8, color: C.obs, cap: C.rim, top: C.deck, r: 0.28, over: 0.14 });
  const cab2 = sternCastle(S, hull, { z0: cab.z0 + 0.1, z1: -5.6, y0: 3.8, y1: 5.5, color: C.obs, cap: C.rim, top: C.deck, r: 0.26, w: cab.w - 0.7 });
  const cab3 = sternCastle(S, hull, { z0: cab.z0 + 0.25, z1: -6.6, y0: 5.5, y1: 6.5, color: C.obsLight, cap: C.rim, top: C.deck, r: 0.22, w: cab2.w - 0.9 });
  windows(S, S.group, [-1.5, -0.5, 0.5, 1.5], 2.3, cab.z0, -1, { w: 0.44, h: 0.66, frame: C.rim, glow: 0xff7a1a });
  windows(S, S.group, [-0.9, 0, 0.9], 4.25, cab2.z0, -1, { w: 0.42, h: 0.62, frame: C.rim, glow: 0xff7a1a });
  windows(S, S.group, [-0.45, 0.45], 5.75, cab3.z0, -1, { w: 0.34, h: 0.46, frame: C.rim, glow: 0xff7a1a });
  for (const sd of [-1, 1]) {
    for (const z of [-7.2, -6.1, -5.0]) {
      const holder = new THREE.Group();
      holder.position.set(sd * (cab.w / 2 + 0.01), 2.7, z);
      holder.rotation.y = (sd * PI) / 2;
      S.group.add(holder);
      add(holder, rbox(0.42, 0.56, 0.1, 0.06), mat(C.rim, { outline: THIN }));
      add(holder, rbox(0.3, 0.42, 0.1, 0.05), glow(S, 0xff7a1a, 1), [0, 0, 0.03]);
    }
    // big horns
    const hx = sd * (cab3.w / 2 - 0.1);
    const zz = cab3.z0 + 0.6;
    const hornPts = [V3(hx, 6.2, zz), V3(hx + sd * 0.9, 6.9, zz + 0.1), V3(hx + sd * 1.25, 7.9, zz + 0.4), V3(hx + sd * 1.0, 8.7, zz + 0.9)];
    add(S.group, taperTube(hornPts, (t) => 0.32 * (1 - t * 0.92), 22, 10), mat(C.horn));
    const hornPts2 = [V3(sd * (cab.w / 2 - 0.2), 3.7, cab.z0 + 0.4), V3(sd * (cab.w / 2 + 0.5), 4.2, cab.z0 + 0.2), V3(sd * (cab.w / 2 + 0.6), 4.9, cab.z0 + 0.6)];
    add(S.group, taperTube(hornPts2, (t) => 0.2 * (1 - t * 0.9), 16, 8), mat(C.horn));
  }
  // bone spikes along the tier edges (back and sides) and a glowing skull on the transom
  const spike = (x, y, z, sc = 1) => add(S.group, cone(0.11 * sc, 0.46 * sc, 8), bone, [x, y + 0.2 * sc, z]);
  for (const [c, n, sc] of [[cab, 6, 1.1], [cab2, 4, 0.95]]) {
    for (let k = 0; k < n; k++) spike(lerp(-c.w / 2 + 0.25, c.w / 2 - 0.25, k / (n - 1)), c.y1, c.z0 - 0.03, sc);
    for (const sd of [-1, 1]) for (let k = 1; k < 4; k++) spike(sd * (c.w / 2 - 0.12), c.y1, lerp(c.z0 + 0.12, c.z1 - 0.2, k / 3), sc);
  }
  transomDecal(S, hull, [skullShape()], 1.15, 0.98, crackM, 0.1);
  brazier(S, -1.35, cab3.y1 - 1.0 + 0.1, cab2.z1 - 0.45, { s: 0.8 });
  brazier(S, 1.35, cab3.y1 - 1.0 + 0.1, cab2.z1 - 0.45, { s: 0.8 });
  brazier(S, 0, hull.D, L2 - 1.4, { s: 1.0, big: 1.15 });

  const sail = mat(C.sail);
  const skullGlow = glow(S, 0xff8a1f, 1.15, true, 0.25);
  const sparC = 0x1a1418;
  const fore = mast(S, 4.4, 1.6, 12.0, 0.22, sparC);
  const main = mast(S, 0.3, 1.6, 13.6, 0.26, sparC);
  const miz = mast(S, -3.9, 1.6, 10.8, 0.2, sparC);
  shrouds(S, hull, 4.4, 11.4, { n: 3, spread: 0.5, color: 0x1a1216 });
  shrouds(S, hull, 0.3, 12.9, { n: 4, spread: 0.5, color: 0x1a1216 });
  squareRig(S, main, [
    { y: 12.9, h: 2.4, wt: 3.4, wb: 4.3, belly: 0.5, mat: sail, torn: 0.15, seed: 4 },
    { y: 10.2, h: 2.8, wt: 4.6, wb: 5.4, belly: 0.65, mat: sail, torn: 0.12, seed: 8 },
    { y: 7.1, h: 3.9, wt: 5.8, wb: 6.4, belly: 0.95, mat: sail, torn: 0.14, seed: 1, decals: [{ shapes: jollyRogerShapes(), size: 2.6, cy: -1.9, mat: skullGlow }] },
  ], { spar: sparC, yardR: 0.14 });
  squareRig(S, fore, [
    { y: 11.4, h: 2.2, wt: 3.1, wb: 3.9, belly: 0.5, mat: sail, torn: 0.16, seed: 6 },
    { y: 8.9, h: 2.5, wt: 4.0, wb: 4.8, belly: 0.6, mat: sail, torn: 0.14, seed: 9 },
    { y: 6.2, h: 3.2, wt: 4.9, wb: 5.5, belly: 0.8, mat: sail, torn: 0.15, seed: 3 },
  ], { spar: sparC, yardR: 0.13 });
  squareRig(S, miz, [
    { y: 10.2, h: 2.0, wt: 2.7, wb: 3.3, belly: 0.4, mat: sail, torn: 0.18, seed: 2 },
    { y: 8.0, h: 1.4, wt: 3.0, wb: 3.4, belly: 0.4, mat: sail, torn: 0.18, seed: 11 },
  ], { spar: sparC, yardR: 0.12 });
  bowsprit(S, hull, 3.2, 0.32, sparC, 0.16);
  const roger = { shapes: jollyRogerShapes(), size: 1.0, cx: 0.46, cy: 0.0, mat: glow(S, 0xff8a1f, 1.1, false, 0.25) };
  flagMesh(S, { p: V3(0, 13.4, 0.3), len: 3.0, h: 1.9, shape: 'swallow', mat: mat(0x0f0c12), decal: roger, yaw: -0.12, staff: sparC, staffR: 0.07 });
  flagMesh(S, { p: V3(0, 11.8, 4.4), len: 2.4, h: 0.6, shape: 'pennant', mat: mat(0x0f0c12), yaw: -0.2, staff: sparC });
  flagMesh(S, { p: V3(0, 10.6, -3.9), len: 2.2, h: 0.55, shape: 'pennant', mat: mat(0x0f0c12), yaw: -0.2, staff: sparC });

  const D = hull.D;
  S.deckSpots = [
    { x: 1.2, y: D, z: -1.6, h: PI / 2 },
    { x: -1.2, y: D, z: -1.6, h: -PI / 2 },
    { x: 1.2, y: D, z: 2.2, h: PI / 2 },
    { x: -1.2, y: D, z: 2.2, h: -PI / 2 },
  ];
  S.fireSpots = [[1.0, D, 0.3, 1.0], [-1.0, D, -2.6, 0.9]];
}

// ---------------------------------------------------------------------------
// Act II ships: the Treasure Galleon, the Frost Raider and the Phantom Galleon
// ---------------------------------------------------------------------------

/** Cartoon sun: a smiling disc ringed by triangular rays, ~1 unit across. */
function sunShapes(n = 12) {
  const disc = new THREE.Shape();
  disc.absarc(0, 0, 0.3, 0, TAU, false);
  disc.holes.push(circlePath(-0.105, 0.07, 0.045), circlePath(0.105, 0.07, 0.045));
  const smile = new THREE.Path();
  smile.absarc(0, 0.02, 0.19, PI * 1.18, PI * 1.82, false);
  smile.absarc(0, 0.02, 0.135, PI * 1.82, PI * 1.18, true);
  smile.closePath();
  disc.holes.push(smile);
  const out = [disc];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + PI / n;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const r0 = 0.34;
    const r1 = k % 2 ? 0.46 : 0.53;
    const w = 0.085;
    out.push(polyShape([[c * r0 + sn * w, sn * r0 - c * w], [c * r1, sn * r1], [c * r0 - sn * w, sn * r0 + c * w]]));
  }
  return out;
}

/** Six-armed snowflake with little branches, ~1 unit across. */
function snowflakeShapes() {
  const out = [];
  const bar = (x0, y0, x1, y1, w) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l = Math.hypot(dx, dy);
    const nx = (-dy / l) * w;
    const ny = (dx / l) * w;
    return polyShape([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]]);
  };
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + PI / 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const P = (r, off) => [c * r - sn * off, sn * r + c * off];
    out.push(bar(...P(0.1, 0), ...P(0.5, 0), 0.045));
    for (const sd of [-1, 1]) out.push(bar(...P(0.3, 0), ...P(0.42, sd * 0.13), 0.035));
  }
  const hex = [];
  for (let k = 0; k < 6; k++) hex.push([Math.cos((k / 6) * TAU) * 0.15, Math.sin((k / 6) * TAU) * 0.15]);
  out.push(polyShape(hex));
  return out;
}

/** Extruded emblem standing on a vertical face that looks aft (-z). */
function aftDecal(S, shapes, size, x, y, z, material, depth = 0.08) {
  const g = extrude(shapes, depth / size, 8);
  g.scale(size, size, size);
  g.rotateY(PI);
  return add(S.group, g, material, [x, y, z - depth * 0.5]);
}

/** Lion figurehead: a round golden face with big eyes in a mane of curls, facing +z. */
function lionHead(S, p, s, face, mane, pitch = 0) {
  const g = new THREE.Group();
  g.position.copy(p);
  g.rotation.x = pitch;
  g.scale.setScalar(s);
  S.group.add(g);
  const gold = mat(face);
  const curls = mat(mane);
  const dark = toon(0x3b2a22, { outline: false }); // the rigging's ink (no extra draw call)
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU + 0.13;
    const r = k % 2 ? 0.47 : 0.43;
    add(g, sphere(), curls, [Math.cos(a) * r, Math.sin(a) * r + 0.03, -0.08], null, [0.22, 0.22, 0.2]);
  }
  add(g, sphere(), gold, [0, 0.02, 0.08], null, [0.37, 0.38, 0.3]);
  add(g, sphere(), gold, [0, -0.13, 0.32], null, [0.21, 0.15, 0.16]);
  add(g, sphere(), dark, [0, -0.05, 0.47], [0.3, 0, 0], [0.085, 0.06, 0.05]);
  add(g, torus(0.07, 0.018, 10, 5, PI), dark, [0, -0.19, 0.44], [0, 0, PI], [1, 0.8, 1]);
  for (const sd of [-1, 1]) {
    add(g, sphere(), dark, [sd * 0.14, 0.12, 0.31], null, [0.06, 0.08, 0.04]);
    add(g, sphere(), curls, [sd * 0.27, 0.33, 0.04], null, 0.1);
  }
  return g;
}

/** Treasure chest: banded wooden box, open (lid thrown back on a heap of coins) or shut. */
function treasureChest(S, x, y, z, yaw, o = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  S.group.add(g);
  const wood = mat(o.wood);
  const gold = mat(o.gold);
  const w = o.w ?? 0.82;
  add(g, rbox(w, 0.44, 0.54, 0.06), wood, [0, 0.22, 0]);
  for (const sx of [-1, 1]) add(g, rbox(0.09, 0.46, 0.58, 0.03), gold, [sx * w * 0.3, 0.23, 0]);
  add(g, rbox(0.16, 0.18, 0.06, 0.03), gold, [0, 0.33, 0.28]);
  if (o.open) {
    const lid = new THREE.Group();
    lid.position.set(0, 0.44, -0.27);
    lid.rotation.x = -1.95;
    g.add(lid);
    add(lid, rbox(w, 0.16, 0.54, 0.06), wood, [0, 0.07, 0.27]);
    for (const sx of [-1, 1]) add(lid, rbox(0.09, 0.18, 0.58, 0.03), gold, [sx * w * 0.3, 0.07, 0.27]);
    // heaped coins inside, spilling over the front
    add(g, sphere(), gold, [0, 0.43, 0.0], null, [w * 0.44, 0.17, 0.24]);
    for (const [cx, cy, cz, r] of [[-0.2, 0.55, 0.04, 0.09], [0.12, 0.57, -0.06, 0.08], [0.24, 0.5, 0.12, 0.07], [-0.05, 0.6, -0.02, 0.06]]) {
      add(g, cyl(r, r, 0.03, 12), gold, [cx, cy, cz], [0.5, 0, 0.3]);
    }
    for (const [cx, cz, a] of [[0.18, 0.42, 0.1], [-0.12, 0.5, -0.2], [0.42, 0.36, 0.3]]) add(g, cyl(0.075, 0.075, 0.03, 12), gold, [cx, 0.015, cz], [0, a, 0]);
    if (o.gem) add(g, gemGeo(), o.gem, [0.06, 0.66, 0.02], [0.35, 0.4, -0.2], 1.1);
  } else {
    add(g, capsule(0.24, w - 0.48, 10), wood, [0, 0.44, 0], [0, 0, PI / 2], [1, 0.7, 1.05]);
    for (const sx of [-1, 1]) add(g, torus(0.25, 0.035, 14, 5, PI), gold, [sx * w * 0.3, 0.44, 0], [0, PI / 2, 0], [1, 0.72, 1.06]);
  }
}

/** A cut gem: a stretched octahedron, ~0.2 across. */
const gemGeo = () => cached('gem', () => new THREE.OctahedronGeometry(0.1, 0).scale(1, 1.35, 1));

/**
 * A heap of gold coins on the deck: a lumpy mound (so the toon bands and the ink outline show its
 * shape from above), loose coins lying on its slopes and round its foot, and a few gems on top.
 */
function coinHeap(S, x, y, z, s, color, gems = []) {
  const gold = mat(color);
  const R = 0.58 * s; // mound half-widths and height
  const Rz = 0.5 * s;
  const H = 0.3 * s;
  add(S.group, sphere(), gold, [x, y, z], null, [R, H, Rz]);
  const rnd = mulberry(23);
  // a point on the mound's surface at (fraction f of the way out, angle a) and its normal
  const onMound = (f, a) => {
    const px = Math.cos(a) * f * R;
    const pz = Math.sin(a) * f * Rz;
    const py = H * Math.sqrt(Math.max(0, 1 - f * f));
    const n = V3(px / (R * R), py / (H * H), pz / (Rz * Rz)).normalize();
    return { p: V3(x + px, y + py, z + pz), n };
  };
  // lumps of coins
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU + rnd() * 0.5;
    const { p } = onMound(k === 6 ? 0.05 : 0.45 + rnd() * 0.2, a);
    const r = (0.15 + rnd() * 0.06) * s;
    add(S.group, sphere(), gold, [p.x, p.y - r * 0.45, p.z], null, [r, r * 0.62, r]);
  }
  // coins lying on the slopes, tilted with them
  const coin = cyl(0.075 * s, 0.075 * s, 0.026, 12);
  for (let k = 0; k < 10; k++) {
    const { p, n } = onMound(0.3 + rnd() * 0.55, rnd() * TAU);
    const c = add(S.group, coin, gold, p.addScaledVector(n, 0.03).toArray());
    c.quaternion.setFromUnitVectors(UP, n).multiply(new THREE.Quaternion().setFromAxisAngle(UP, rnd() * TAU));
  }
  // and round its foot
  for (let k = 0; k < 7; k++) {
    const a = rnd() * TAU;
    const f = 1.08 + rnd() * 0.35;
    add(S.group, coin, gold, [x + Math.cos(a) * f * R, y + 0.014, z + Math.sin(a) * f * Rz], [rnd() * 0.12, rnd() * 3, rnd() * 0.12]);
  }
  // gems on the top
  gems.forEach((m, k) => {
    const { p, n } = onMound(0.18 + 0.2 * (k % 2), (k / gems.length) * TAU + 0.6);
    const gem = add(S.group, gemGeo(), m, p.addScaledVector(n, 0.06).toArray(), null, s);
    gem.quaternion.setFromUnitVectors(UP, n.lerp(UP, 0.4).normalize()).multiply(new THREE.Quaternion().setFromAxisAngle(UP, k * 1.3));
  });
}

/** A stack of gold coins (n high), each a little off the one below. */
function coinStack(S, x, y, z, n, color, seed = 5) {
  const gold = mat(color);
  const rnd = mulberry(seed);
  const coin = cyl(0.085, 0.085, 0.036, 12);
  for (let k = 0; k < n; k++) add(S.group, coin, gold, [x + (rnd() - 0.5) * 0.03, y + 0.018 + k * 0.038, z + (rnd() - 0.5) * 0.03], [0, rnd() * 3, 0]);
}

function buildGalleon(S, T) {
  S.brace = 0.34;
  const C = { plum: 0x5e2d78, plumDark: 0x40205a, gold: 0xf4c23a, wood: 0x6e3c22, dark: 0x2c1912, deck: 0xd2a266, plank: 0xa87a45, rim: 0x3a2014, sail: 0xf8eed6, sun: 0xee9a1c, red: 0xc8322e, spar: 0x5a3420, chest: 0x8a4e26 };
  const hull = makeHull({
    L: T.len,
    W: T.wid,
    rail: 2.3,
    deck: 1.4,
    keel: -0.95,
    bw: 0.24,
    yc: 1.05,
    n: 2.4,
    tumble: 0.2,
    sternLen: 0.08,
    sternP: 3,
    bowStart: 0.58,
    bowP: 2,
    bowQ: 0.62,
    bowRise: 0.7,
    sternRise: 0.6,
    sternRiseSpan: 0.3,
    bowLift: 1.15,
    sternLift: 0.85,
    bowRake: 0.75,
    sternRake: 0.28,
    midPinch: 0.07,
    breaks: [{ rel: -0.13 }, { abs: 1.78 }, { abs: 1.62 }, { abs: 0.38 }],
  });
  addHull(S, hull, { bands: [mat(C.gold), mat(C.plum), mat(C.gold), mat(C.wood), mat(C.dark)], rim: mat(C.rim), wall: mat(C.plumDark), deck: mat(C.deck) });
  S.hull = hull;
  const D = hull.D;
  deckPlanks(S, hull, C.plank, -3.5, 4.6, 6);
  cutwater(S, hull, C.gold, 0.13);
  for (let i = 0; i < T.guns; i++) for (const sd of [-1, 1]) gun(S, hull, gunOffset(T, i), 0.85, sd, { frame: C.gold, scale: 1.05 });
  const gold = mat(C.gold);

  // the tall gilded stern castle: three tiers of glowing windows, gold caps, a smiling sun crest
  const cab = sternCastle(S, hull, { z1: -3.7, y0: 1.5, y1: 3.45, color: C.plum, cap: C.gold, top: C.deck, r: 0.26, over: 0.12 });
  const cab2 = sternCastle(S, hull, { z0: cab.z0 + 0.08, z1: -4.95, y0: 3.45, y1: 4.65, color: C.plum, cap: C.gold, top: C.deck, r: 0.24, w: cab.w - 0.45 });
  const cab3 = sternCastle(S, hull, { z0: cab.z0 + 0.16, z1: -5.85, y0: 4.65, y1: 5.55, color: C.plum, cap: C.gold, top: C.deck, r: 0.22, w: cab2.w - 0.6 });
  const winGlow = 0xffc85a;
  windows(S, S.group, [-1.35, -0.45, 0.45, 1.35], 1.92, cab.z0, -1, { w: 0.42, h: 0.6, frame: C.gold, glow: winGlow });
  windows(S, S.group, [-0.9, 0, 0.9], 3.72, cab2.z0, -1, { w: 0.4, h: 0.56, frame: C.gold, glow: winGlow });
  windows(S, S.group, [-0.42, 0.42], 4.86, cab3.z0, -1, { w: 0.34, h: 0.46, frame: C.gold, glow: winGlow });
  aftDecal(S, sunShapes(), 0.82, 0, 3.0, cab.z0 - 0.02, gold, 0.09);
  for (const sd of [-1, 1]) {
    add(S.group, rbox(0.12, 0.12, cab.z1 - cab.z0 - 0.2, 0.05), gold, [sd * (cab.w / 2 + 0.02), 3.05, (cab.z0 + cab.z1) / 2]);
    add(S.group, rbox(0.1, 0.1, cab2.z1 - cab2.z0 - 0.2, 0.04), gold, [sd * (cab2.w / 2 + 0.02), 4.12, (cab2.z0 + cab2.z1) / 2]);
  }
  // a gilded rail round the poop deck
  for (const sd of [-1, 1]) rail(S, V3(sd * (cab3.w / 2 - 0.1), cab3.y1, cab3.z0 + 0.15), V3(sd * (cab3.w / 2 - 0.1), cab3.y1, cab3.z1 - 0.12), 0.32, C.gold, 2);
  // gold finials on the tier corners
  for (const c of [cab, cab2, cab3]) {
    for (const sx of [-1, 1]) add(S.group, sphere(), gold, [sx * (c.w / 2 - 0.08), c.y1 + 0.1, c.z0 + 0.08], null, 0.13);
  }
  // quarter galleries: glowing side windows in gold frames
  for (const sd of [-1, 1]) {
    for (const z of [-6.55, -5.6, -4.65]) {
      const holder = new THREE.Group();
      holder.position.set(sd * (cab.w / 2 + 0.01), 2.45, z);
      holder.rotation.y = (sd * PI) / 2;
      S.group.add(holder);
      add(holder, rbox(0.44, 0.56, 0.1, 0.06), mat(C.gold, { outline: THIN }));
      add(holder, rbox(0.3, 0.42, 0.1, 0.05), glow(S, winGlow, 1), [0, 0, 0.03]);
    }
  }
  // stern lanterns on the taffrail
  const iron = mat(0x2b2530);
  for (const x of [-0.85, 0, 0.85]) {
    const s = x === 0 ? 1.3 : 1.0;
    rod(S.group, iron, V3(x, cab3.y1 - 0.05, cab3.z0 + 0.14), V3(x, cab3.y1 + 0.32, cab3.z0 + 0.14), 0.045, 6);
    lantern(S, S.group, x, cab3.y1 + 0.32 + 0.24 * s, cab3.z0 + 0.14, { s, color: winGlow, intensity: 1 });
  }
  add(S.group, rbox(0.75, 1.05, 0.12, 0.1), mat(C.wood), [0, D + 0.55, cab.z1 + 0.02]);
  add(S.group, sphere(), gold, [0.24, D + 0.52, cab.z1 + 0.1], null, 0.065);
  // forecastle
  add(S.group, rbox(2.2, 0.5, 1.7, 0.2), mat(C.plum), [0, D + 0.24, 4.75]);
  add(S.group, rbox(2.3, 0.12, 1.8, 0.05), gold, [0, D + 0.5, 4.75]);

  // rig: square main and fore courses with the golden sun, a lateen mizzen, a jib
  const sail = mat(C.sail);
  const sunM = mat(C.sun, { outline: THIN });
  const main = mast(S, 0.4, D, 12.5, 0.24, C.spar);
  const fore = mast(S, 4.0, D, 11.1, 0.21, C.spar);
  const miz = mast(S, -3.1, D, 8.8, 0.17, C.spar);
  shrouds(S, hull, 0.4, 11.7, { n: 4, spread: 0.45 });
  shrouds(S, hull, 4.0, 10.4, { n: 3, spread: 0.42 });
  shrouds(S, hull, -3.1, 8.1, { n: 2, spread: 0.4 });
  squareRig(S, main, [
    { y: 11.7, h: 2.3, wt: 3.3, wb: 4.1, belly: 0.5, mat: sail },
    { y: 9.1, h: 3.9, wt: 5.0, wb: 5.9, belly: 0.9, mat: sail, decals: [{ shapes: sunShapes(), size: 2.5, cy: -1.95, mat: sunM }] },
  ], { spar: C.spar, yardR: 0.13 });
  squareRig(S, fore, [
    { y: 10.4, h: 2.1, wt: 2.9, wb: 3.6, belly: 0.45, mat: sail },
    { y: 8.0, h: 3.3, wt: 4.3, wb: 5.1, belly: 0.75, mat: sail, decals: [{ shapes: sunShapes(), size: 1.75, cy: -1.65, mat: sunM }] },
  ], { spar: C.spar, yardR: 0.12 });
  // lateen: a long yard slung diagonally across the mizzen, the triangular sail hanging under it
  const A = [-1.55, 4.75];
  const B = [-6.1, 10.1];
  const Q = [-4.85, 5.7];
  const lateen = {
    nu: 12,
    nv: 10,
    thick: 0.08,
    p: 6,
    map: (a, b) => {
      const tx = lerp(-A[0], -B[0], a);
      const ty = lerp(A[1], B[1], a);
      return [lerp(tx, -Q[0], b), lerp(ty, Q[1], b)];
    },
    belly: (a, b) => 0.5 * Math.sin(PI * a) * Math.sin(PI * Math.min(1, b * 0.95)) * (1 - 0.3 * b),
  };
  foreAftSail(S, S.group, lateen, (d) => [{ geo: pillowGeometry(d), material: sail }], { p: V3(0.28, 0, 0) });
  const spar = mat(C.spar);
  const dirL = V3(0, B[1] - A[1], B[0] - A[0]).normalize();
  rod(S.group, spar, V3(0.2, A[1], A[0]).addScaledVector(dirL, -0.7), V3(0.2, B[1], B[0]).addScaledVector(dirL, 0.25), 0.09, 8);
  const tip = bowsprit(S, hull, 3.4, 0.3, C.spar, 0.15);
  jibSail(S, [4.1, 9.9], tip, [4.6, 4.45], 0.4, (d) => [{ geo: pillowGeometry(d), material: sail }], { color: C.spar, r: 0.04 });
  const head = hull.stem(4).at(-1);
  lionHead(S, V3(0, head.y - 0.62, head.z + 0.06), 0.82, C.gold, C.chest, -0.25);

  // the treasure fleet's colours (the golden sun on royal purple), and a gold pennant on the fore
  flagMesh(S, {
    p: V3(0, 13.15, 0.4),
    len: 2.4,
    h: 1.5,
    mat: mat(C.plum),
    decal: { shapes: sunShapes(), size: 1.2, cx: 0.5, cy: 0, mat: mat(C.gold, { outline: false }) },
    yaw: -0.12,
    staff: C.spar,
    finial: C.gold,
  });
  flagMesh(S, { p: V3(0, 11.75, 4.0), len: 2.2, h: 0.55, shape: 'pennant', mat: gold, yaw: -0.2, staff: C.spar });

  // the treasure: open chests heaped with coins, a coin pile, a strongbox
  const ruby = mat(C.red);
  const amethyst = mat(C.plum);
  treasureChest(S, 1.15, D, 2.25, 0.35, { wood: C.chest, gold: C.gold, open: true, gem: ruby });
  treasureChest(S, -1.12, D, 2.75, -0.25, { wood: C.chest, gold: C.gold });
  treasureChest(S, 1.05, D, -1.75, -0.45, { wood: C.chest, gold: C.gold, open: true, w: 0.72, gem: amethyst });
  coinHeap(S, -1.0, D, -1.55, 0.9, C.gold, [ruby, amethyst, ruby, amethyst]);
  coinStack(S, -0.38, D, -2.15, 6, C.gold, 5);
  coinStack(S, -0.6, D, -2.42, 4, C.gold, 9);
  coinStack(S, 0.55, D, 2.85, 5, C.gold, 13);
  barrel(S, -1.35, D, 0.65, C.chest, C.gold, 0.85);
  barrel(S, -1.3, D, 1.2, C.chest, C.gold, 0.75);
  rod(S.group, iron, V3(0, D + 0.45, 5.62), V3(0, D + 1.25, 5.62), 0.05, 6);
  lantern(S, S.group, 0, D + 1.5, 5.62, { s: 0.95, color: winGlow, intensity: 1 });

  S.deckSpots = [
    { x: 0.95, y: D, z: 0.95, h: PI / 2 },
    { x: -0.7, y: D, z: -0.25, h: -PI / 2 },
    { x: 0.1, y: D, z: -1.15, h: PI / 2 },
    { x: 0, y: D, z: 1.8, h: -PI / 2 },
    { x: 0.95, y: D, z: -0.35, h: PI / 2 },
  ];
  S.fireSpots = [[-0.15, D, 3.1, 0.9], [0.35, D, -2.55, 0.8]];
}

function buildRaider(S, T) {
  S.brace = 0.22;
  const C = { blue: 0x2f6db5, oak: 0xb57d45, oakDark: 0x8a5a32, tar: 0x2e2420, deck: 0xc49a66, plank: 0x9c7346, rim: 0x5a3a22, white: 0xf5f1e6, red: 0xd2402f, yellow: 0xf2c23a, spar: 0x6b4428, navy: 0x1e2f5a };
  const hull = makeHull({
    L: T.len - 0.8,
    W: 2.45,
    rail: 1.4,
    deck: 1.0,
    keel: -0.55,
    bw: 0.14,
    yc: 0.62,
    n: 1.8,
    tumble: 0.0,
    sternLen: 0.34,
    sternP: 1.7,
    bowStart: 0.6,
    bowP: 1.7,
    bowQ: 1.0,
    bowRise: 1.3,
    sternRise: 1.2,
    sternRiseSpan: 0.4,
    bowLift: 0.85,
    sternLift: 0.85,
    bowRake: 0.35,
    sternRake: 0.4,
    midPinch: 0.1,
    breaks: [{ rel: -0.12 }, { rel: -0.24 }, { rel: -0.36 }, { rel: -0.5 }, { rel: -0.64 }, { abs: 0.18 }],
  });
  const blue = mat(C.blue);
  const oak = mat(C.oak);
  const oakDark = mat(C.oakDark);
  addHull(S, hull, { bands: [blue, oak, oakDark, oak, oakDark, oak, mat(C.tar)], rim: mat(C.rim), wall: oakDark, deck: mat(C.deck) });
  S.hull = hull;
  const D = hull.D;
  deckPlanks(S, hull, C.plank, -2.9, 2.9, 4);
  // clinker laps: a dark line along the lower edge of every strake
  const lap = toon(0x3a2616, { outline: false });
  for (const rel of [-0.24, -0.36, -0.5, -0.64]) {
    for (const sd of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const u = lerp(0.04, 0.96, i / 24);
        const y = hull.rail(u) - hull.rb + rel;
        if (y < hull.keel(u) + 0.15) continue;
        pts.push(V3(sd * (hull.xAt(u, y) + 0.012), y, hull.zAt(u, y)));
      }
      if (pts.length > 3) add(S.group, taperTube(pts, () => 0.022, 48, 4), lap);
    }
  }
  // serpent prow and a curled tail
  const serpent = blue;
  const stemTop = V3(0, hull.rail(1) - 0.06, hull.zAt(1, hull.rail(1)) - 0.04);
  const neck = [stemTop.clone().add(V3(0, -0.5, -0.12)), stemTop.clone(), stemTop.clone().add(V3(0, 0.42, 0.2)), stemTop.clone().add(V3(0, 0.78, 0.16)), stemTop.clone().add(V3(0, 1.02, 0.36))];
  add(S.group, taperTube(neck, (t) => 0.19 - 0.06 * t, 28, 10), serpent);
  const hg = new THREE.Group();
  hg.position.copy(neck.at(-1));
  hg.rotation.x = 0.28;
  S.group.add(hg);
  const yellow = mat(C.yellow);
  const red = mat(C.red);
  add(hg, sphere(), serpent, [0, 0.02, 0.1], null, [0.23, 0.22, 0.34]);
  add(hg, sphere(), serpent, [0, -0.02, 0.42], null, [0.15, 0.12, 0.25]);
  add(hg, sphere(), serpent, [0, -0.17, 0.33], [0.32, 0, 0], [0.12, 0.05, 0.22]);
  add(hg, sphere(), red, [0, -0.11, 0.38], [0.15, 0, 0], [0.11, 0.045, 0.2]);
  for (const sd of [-1, 1]) {
    add(hg, sphere(), mat(C.white, { outline: THIN }), [sd * 0.15, 0.1, 0.27], null, [0.075, 0.085, 0.06]);
    add(hg, sphere(), toon(0x120e14, { outline: false }), [sd * 0.18, 0.1, 0.31], null, [0.035, 0.05, 0.03]);
    add(hg, taperTube([V3(sd * 0.12, 0.17, 0.02), V3(sd * 0.2, 0.36, -0.14), V3(sd * 0.22, 0.42, -0.38)], (t) => 0.06 * (1 - t * 0.85), 10, 6), yellow);
    add(hg, cone(0.025, 0.14, 6), red, [sd * 0.035, -0.12, 0.66], [PI / 2, sd * 0.35, 0]);
  }
  for (let k = 0; k < 4; k++) {
    const p = new THREE.CatmullRomCurve3(neck).getPointAt(0.25 + k * 0.2);
    add(S.group, cone(0.07, 0.2, 6), yellow, [p.x, p.y + 0.02, p.z - 0.16], [-0.9, 0, 0]);
  }
  const sternTop = V3(0, hull.rail(0) - 0.06, hull.zAt(0, hull.rail(0)) + 0.04);
  const r0 = 0.46;
  const cz = sternTop.z - 0.02 - r0;
  const cy = sternTop.y + 0.55;
  const tail = [sternTop.clone().add(V3(0, -0.5, 0.12)), sternTop.clone(), V3(0, cy - 0.05, sternTop.z - 0.08)];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const ang = t * TAU * 1.2;
    const r = r0 * (1 - 0.7 * t);
    tail.push(V3(0, cy + Math.sin(ang) * r, cz + Math.cos(ang) * r));
  }
  add(S.group, taperTube(tail, (t) => 0.17 * (1 - 0.62 * t), 40, 10), serpent);
  add(S.group, sphere(), yellow, tail.at(-1).toArray(), null, 0.07);

  // round painted shields along both rails, oars out between them, a swivel gun amidships
  const rim = mat(C.rim);
  const boss = mat(IRON);
  const shieldMats = [red, mat(C.white), yellow, blue];
  // painted quarters: white on the red and blue shields, red on the white and yellow ones
  const quarterMats = [toon(C.white, { outline: false }), toon(C.red, { outline: false })];
  const quarter = cached('shieldq', () => mergeGeometries([new THREE.CircleGeometry(0.36, 6, 0, PI / 2), new THREE.CircleGeometry(0.36, 6, PI, PI / 2)], false));
  const zs = [-2.45, -1.62, -0.78, 0.78, 1.62, 2.45];
  for (const sd of [-1, 1]) {
    zs.forEach((z, i) => {
      const y = hull.railAt(z) - 0.2;
      const { p, n } = hull.surface(z, y, sd);
      const g = new THREE.Group();
      g.position.copy(p).addScaledVector(n, 0.05);
      aim(g, V3(n.x, 0, n.z));
      S.group.add(g);
      const c = (i + (sd > 0 ? 0 : 2)) % 4;
      add(g, cyl(0.4, 0.4, 0.08, 18), shieldMats[c], [0, 0, 0], [PI / 2, 0, 0]);
      add(g, quarter, quarterMats[c % 2], [0, 0, 0.046], [0, 0, i * 0.7]);
      add(g, torus(0.4, 0.045, 22, 6), rim, [0, 0, 0.0]);
      add(g, sphere(), boss, [0, 0, 0.05], null, [0.11, 0.11, 0.08]);
    });
    for (const z of [-2.04, -1.2, 1.2, 2.04]) {
      // (the blades end inside the boarding slot beside a ship it grapples)
      const a = V3(sd * 0.72, D + 0.42, z);
      const b = V3(sd * 2.02, 0.34, z + 0.3);
      rod(S.group, oak, a, b, 0.045, 6);
      const blade = add(S.group, sphere(), oak, b.toArray(), null, [0.07, 0.3, 0.13]);
      blade.quaternion.setFromUnitVectors(UP, V3().subVectors(b, a).normalize());
    }
    const gx = hull.widthAt(0, 1.2) * sd;
    rod(S.group, boss, V3(gx * 0.86, D + 0.1, 0), V3(gx * 0.86, D + 0.62, 0), 0.05, 6);
    add(S.group, cannonGeo(0.55, 0.1), boss, [gx * 0.78, D + 0.68, 0], [PI / 2 - 0.1, (sd * PI) / 2, 0, 'YXZ']);
  }
  // sea chests (rowing benches) down both sides, a rope coil
  for (const sd of [-1, 1]) {
    zs.forEach((z, i) => add(S.group, rbox(0.42, 0.3, 0.46, 0.06), (i + (sd > 0 ? 1 : 0)) % 2 ? oak : oakDark, [sd * 0.62, D + 0.15, z]));
  }
  add(S.group, torus(0.24, 0.08, 16, 8), mat(ROPE), [0.0, D + 0.08, -2.75], [PI / 2, 0, 0]);

  // one mast, one big striped square sail
  const m = mast(S, 0.15, D, 7.4, 0.15, C.spar);
  shrouds(S, hull, 0.15, 6.8, { n: 2, spread: 0.55 });
  squareRig(S, m, [{ y: 6.65, h: 3.5, wt: 3.7, wb: 4.3, belly: 0.75, mat: mat(C.white), stripes: { n: 7, mat: blue } }], { spar: C.spar, yardR: 0.11 });
  flagMesh(S, {
    p: V3(0, 7.7, 0.15),
    len: 1.7,
    h: 0.95,
    shape: 'swallow',
    mat: mat(C.navy),
    decal: { shapes: snowflakeShapes(), size: 0.62, cx: 0.38, cy: 0, mat: mat(C.white, { outline: false }) },
    yaw: -0.2,
    staff: C.spar,
    finial: C.yellow,
  });

  S.deckSpots = [
    { x: 0, y: D, z: 1.2, h: PI / 2 },
    { x: 0, y: D, z: -1.2, h: -PI / 2 },
    { x: 0, y: D, z: 2.05, h: -PI / 2 },
    { x: 0, y: D, z: -2.05, h: PI / 2 },
  ];
  S.fireSpots = [[0, D, -0.55, 0.6]];
}

/** Per-ship ghostly cloth: pale, glowing, see-through; pulses slowly with the glows. */
function ghostCloth(S, color, emissive) {
  const m = toon(color, { emissive, emissiveIntensity: 0.6, transparent: true, opacity: 0.72, outline: { thickness: 0.0042, color: [0.02, 0.1, 0.08] } }).clone();
  S.glows.push({ m, base: 0.6, amt: 0.35, f: 1.3, ph: Math.random() * 10 });
  return m;
}

function buildPhantom(S, T) {
  S.brace = -0.4;
  const C = { hull: 0x2e3d44, hullDark: 0x1b252a, moss: 0x44705a, deck: 0x5a5446, plank: 0x403a30, rim: 0x1b2225, wall: 0x2c3a34, spar: 0x2b2a27, barnacle: 0xc2cbb6, weed: 0x3f7a4a, bone: 0xdcdcc8, ghost: 0xa6f7dc, ghostEm: 0x2fd0a0, glow: 0x6dffc4 };
  const hull = makeHull({
    L: T.len,
    W: T.wid,
    rail: 2.6,
    deck: 1.8,
    keel: -1.0,
    bw: 0.26,
    yc: 1.05,
    n: 3.0,
    tumble: 0.15,
    sternLen: 0.07,
    sternP: 3,
    bowStart: 0.6,
    bowP: 2,
    bowQ: 0.7,
    bowRise: 0.75,
    sternRise: 0.9,
    sternRiseSpan: 0.32,
    bowLift: 1.25,
    sternLift: 0.95,
    bowRake: 0.65,
    sternRake: 0.32,
    breaks: [{ rel: -0.13 }, { abs: 2.0 }, { abs: 1.88 }, { abs: 0.45 }],
  });
  const seam = glow(S, C.glow, 0.85, false, 0.35);
  addHull(S, hull, { bands: [mat(C.moss), mat(C.hull), seam, mat(C.hull), mat(C.hullDark)], rim: mat(C.rim), wall: mat(C.wall), deck: mat(C.deck) });
  S.hull = hull;
  const D = hull.D;
  const L2 = T.len / 2;
  deckPlanks(S, hull, C.plank, -4.4, 6.0, 7);
  cutwater(S, hull, C.rim, 0.14);
  for (let i = 0; i < T.guns; i++) for (const sd of [-1, 1]) gun(S, hull, gunOffset(T, i), 1.0, sd, { style: 'hot', frame: C.rim, hole: C.glow });
  // round glowing portholes in the upper band, between the guns
  const ghostLight = glow(S, C.glow, 1);
  const rim = mat(C.rim);
  for (const sd of [-1, 1]) {
    for (let i = 0; i < T.guns - 1; i++) {
      const z = (gunOffset(T, i) + gunOffset(T, i + 1)) / 2;
      const { p, n } = hull.surface(z, 2.24, sd);
      const g = new THREE.Group();
      g.position.copy(p);
      aim(g, n);
      S.group.add(g);
      add(g, torus(0.17, 0.055, 16, 6), rim);
      add(g, cyl(0.15, 0.15, 0.06, 12), ghostLight, [0, 0, -0.01], [PI / 2, 0, 0]);
    }
  }
  // barnacles crusting the lower hull and weed trailing from it
  const barn = mat(C.barnacle, { outline: THIN });
  const rnd = mulberry(31);
  for (const sd of [-1, 1]) {
    for (let k = 0; k < 46; k++) {
      const z = lerp(-L2 + 1.6, L2 - 2.2, rnd());
      const y = 0.08 + Math.pow(rnd(), 1.6) * 0.85;
      const { p, n } = hull.surface(z, y, sd);
      const r = 0.06 + rnd() * 0.08;
      rivet(S.group, barn, p.addScaledVector(n, r * 0.25), n, r);
    }
  }
  const weed = mat(C.weed);
  for (const sd of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      const z = lerp(-L2 + 2.2, L2 - 2.8, (k + rnd() * 0.6) / 7);
      const y0 = 0.7 + rnd() * 0.5;
      const pts = [];
      for (let i = 0; i <= 5; i++) {
        const y = lerp(y0, -0.05, i / 5);
        const { p, n } = hull.surface(z + Math.sin(i * 1.7 + k) * 0.12, y, sd);
        pts.push(p.addScaledVector(n, 0.05));
      }
      add(S.group, taperTube(pts, (t) => 0.06 * (1 - 0.5 * t), 14, 6), weed);
    }
  }

  // stern castle with green-lit windows (one boarded up), ghost lanterns
  const cab = sternCastle(S, hull, { z1: -4.7, y0: 1.8, y1: 3.95, color: C.hull, cap: C.rim, top: C.deck, r: 0.28, over: 0.12 });
  const cab2 = sternCastle(S, hull, { z0: cab.z0 + 0.1, z1: -6.1, y0: 3.95, y1: 5.3, color: C.hull, cap: C.rim, top: C.deck, r: 0.25, w: cab.w - 0.6 });
  windows(S, S.group, [-1.5, -0.5, 0.5, 1.5], 2.4, cab.z0, -1, { w: 0.44, h: 0.66, frame: C.rim, glow: C.glow });
  windows(S, S.group, [-0.9, 0, 0.9], 4.25, cab2.z0, -1, { w: 0.4, h: 0.6, frame: C.rim, glow: C.glow });
  for (const [dy, a] of [[0.18, 0.25], [0.46, -0.2]]) add(S.group, rbox(0.62, 0.11, 0.06, 0.03), mat(C.wall), [0.5, 2.4 + dy, cab.z0 - 0.1], [0, 0, a]);
  aftDecal(S, jollyRogerShapes(), 0.62, 0, 3.45, cab.z0 - 0.02, mat(C.bone), 0.08);
  for (const sd of [-1, 1]) {
    for (const z of [-7.4, -6.3, -5.2]) {
      const holder = new THREE.Group();
      holder.position.set(sd * (cab.w / 2 + 0.01), 2.85, z);
      holder.rotation.y = (sd * PI) / 2;
      S.group.add(holder);
      add(holder, rbox(0.42, 0.56, 0.1, 0.06), rim);
      add(holder, rbox(0.3, 0.42, 0.1, 0.05), ghostLight, [0, 0, 0.03]);
    }
    rod(S.group, rim, V3(sd * (cab2.w / 2 - 0.1), cab2.y1 - 0.05, cab2.z0 + 0.15), V3(sd * (cab2.w / 2 - 0.1), cab2.y1 + 0.2, cab2.z0 + 0.15), 0.05, 6);
    lantern(S, S.group, sd * (cab2.w / 2 - 0.1), cab2.y1 + 0.45, cab2.z0 + 0.15, { s: 1.15, color: C.glow, intensity: 1 });
  }
  // a broken taffrail round the poop deck: one side whole, the other half gone with its rail
  // hanging to the planks, and the stern rail sagging where a post has rotted away
  {
    const yT = cab2.y1;
    const xT = cab2.w / 2 - 0.1;
    const xa = cab2.w / 2 - 0.55;
    const zA = cab2.z0 + 0.15;
    const hT = 0.32;
    rail(S, V3(-xT, yT, cab2.z0 + 0.5), V3(-xT, yT, cab2.z1 - 0.12), hT, C.rim, 2);
    rail(S, V3(xT, yT, cab2.z1 - 0.12), V3(xT, yT, cab2.z1 - 0.62), hT, C.rim, 1);
    rod(S.group, rim, V3(xT, yT + hT, cab2.z1 - 0.62), V3(xT - 0.12, yT + 0.04, zA + 0.55), 0.055, 6);
    rod(S.group, rim, V3(xT, yT - 0.02, zA + 0.42), V3(xT + 0.02, yT + 0.14, zA + 0.44), 0.05, 6);
    rail(S, V3(-xa, yT, zA), V3(0, yT, zA), hT, C.rim, 1);
    rod(S.group, rim, V3(0, yT + hT, zA), V3(xa, yT + 0.1, zA - 0.02), 0.055, 6);
    rod(S.group, rim, V3(xa, yT - 0.02, zA), V3(xa - 0.02, yT + 0.12, zA), 0.05, 6);
  }
  // a ghost-fire cauldron on the quarterdeck breathing green mist
  brazier(S, 0, cab.y1, -5.4, {
    s: 0.8,
    flame: [0x52f0b0, 0xd4ffee],
    coal: 0x3dffa8,
    smoke: true,
    puffs: 5,
    smokeMat: (k) => toon(k % 2 ? 0x9ff2d2 : 0x74dcb6, { transparent: true, opacity: 0.55, outline: false }),
  });
  // skull figurehead, a heap of bones by the main mast
  const head = hull.stem(4).at(-1);
  skullHead(S, V3(0, head.y - 0.6, head.z + 0.12), 0.85, C.bone, -0.3);
  skullHead(S, V3(-1.15, D + 0.17, -1.2), 0.32, C.bone, 0.2);
  const bone = mat(C.bone);
  for (const [x, z, a] of [[-0.9, -0.85, 0.4], [-1.3, -0.75, -0.9], [-1.0, -1.55, 1.3]]) {
    const d = V3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.28);
    rod(S.group, bone, V3(x, D + 0.05, z).sub(d), V3(x, D + 0.05, z).add(d), 0.045, 6);
    for (const e of [-1, 1]) add(S.group, sphere(), bone, V3(x, D + 0.06, z).addScaledVector(d, e).toArray(), null, 0.065);
  }

  // masts: the mizzen snapped off; tattered, see-through ghost sails
  const ghost = ghostCloth(S, C.ghost, C.ghostEm);
  const skullGlow = glow(S, C.glow, 1.1, false, 0.25);
  const main = mast(S, 0.4, D, 14.3, 0.26, C.spar);
  const fore = mast(S, 4.9, D, 12.7, 0.23, C.spar);
  // the snapped mizzen: a stump with splintered ends (no truck)
  const sp = mat(C.spar);
  const miz = new THREE.Group();
  miz.position.set(0, 0, -3.9);
  S.group.add(miz);
  spar(miz, sp, V3(0, D, 0), V3(0, 8.0, 0), 0.21, 0.15, 12);
  for (const [a, h] of [[0, 0.55], [2.1, 0.34], [4.2, 0.44]]) add(miz, cone(0.075, h, 5), sp, [Math.cos(a) * 0.07, 8.0 + h / 2 - 0.05, Math.sin(a) * 0.07], [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25]);
  shrouds(S, hull, 0.4, 13.4, { n: 4, spread: 0.5, color: 0x22302a });
  shrouds(S, hull, 4.9, 11.9, { n: 3, spread: 0.45, color: 0x22302a });
  shrouds(S, hull, -3.9, 7.4, { n: 2, spread: 0.45, color: 0x22302a });
  squareRig(S, main, [
    { y: 13.5, h: 2.4, wt: 3.4, wb: 4.3, belly: 0.5, mat: ghost, torn: 0.24, seed: 3 },
    { y: 10.8, h: 2.8, wt: 4.6, wb: 5.4, belly: 0.65, mat: ghost, torn: 0.2, seed: 6 },
    { y: 7.7, h: 3.8, wt: 5.8, wb: 6.5, belly: 0.9, mat: ghost, torn: 0.26, seed: 1, decals: [{ shapes: jollyRogerShapes(), size: 2.5, cy: -1.85, mat: mat(0x0e2622, { outline: false }) }] },
  ], { spar: C.spar, yardR: 0.14 });
  squareRig(S, fore, [
    { y: 11.9, h: 2.3, wt: 3.1, wb: 3.9, belly: 0.5, mat: ghost, torn: 0.26, seed: 5 },
    { y: 9.3, h: 3.4, wt: 4.6, wb: 5.4, belly: 0.75, mat: ghost, torn: 0.22, seed: 9 },
  ], { spar: C.spar, yardR: 0.13 });
  squareRig(S, miz, [{ y: 7.5, h: 2.5, wt: 3.4, wb: 4.0, belly: 0.5, mat: ghost, torn: 0.32, seed: 12 }], { spar: C.spar, yardR: 0.12 });
  const tip = bowsprit(S, hull, 3.3, 0.3, C.spar, 0.16);
  jibSail(S, [5.0, 11.3], tip, [5.4, 4.3], 0.4, (d) => [{ geo: pillowGeometry(d), material: ghost }], { color: 0x22302a, r: 0.04 });
  flagMesh(S, {
    p: V3(0, 15.1, 0.4),
    len: 2.8,
    h: 1.8,
    shape: 'swallow',
    mat: mat(0x101418),
    decal: { shapes: jollyRogerShapes(), size: 0.95, cx: 0.44, cy: 0.0, mat: skullGlow },
    yaw: -0.12,
    staff: C.spar,
  });

  S.deckSpots = [
    { x: 1.2, y: D, z: -1.4, h: PI / 2 },
    { x: 1.2, y: D, z: 2.0, h: PI / 2 },
    { x: -1.2, y: D, z: 2.0, h: -PI / 2 },
    { x: 0.1, y: D, z: -2.5, h: -PI / 2 },
    { x: -0.4, y: D, z: 3.1, h: -PI / 2 },
  ];
  S.fireSpots = [[0.9, D, 0.9, 1.0], [-0.6, D, -2.7, 0.9]];
  S.fireColors = [0x52f0b0, 0xd4ffee];
}

/** Small deterministic RNG for per-type detail placement. */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BUILDERS = {
  player: buildPlayer,
  cutter: buildCutter,
  privateer: buildPrivateer,
  prahu: buildPrahu,
  junk: buildJunk,
  corsair: buildCorsair,
  manowar: buildManowar,
  inferno: buildInferno,
  galleon: buildGalleon,
  raider: buildRaider,
  phantom: buildPhantom,
};

// ---------------------------------------------------------------------------
// Battle data, visible damage, colours and projectiles (SPEC2 §2.2, §2.4, §9.1)
// ---------------------------------------------------------------------------

// Private per-ship data behind the damage, hole and flag API (keyed by the ship's group).
const PRIV = new WeakMap();

/** Outer half-width of a hull at ship-local (z, y), found for that exact z at that height; 0 off the hull. */
function halfWidth(hull, z, y) {
  const u = hullU(hull, z, y);
  if (Math.abs(hull.zAt(u, y) - z) > 0.03) return 0;
  return Math.max(0, hull.xAt(u, y));
}

/** userData.hullSide: half-width sampled along z at height y (for analytic hole placement). */
function hullSideData(hull, y = 0.9) {
  const dz = 0.5;
  const z0 = -hull.L / 2;
  const n = Math.round(hull.L / dz) + 1;
  const half = [];
  for (let i = 0; i < n; i++) half.push(r3(halfWidth(hull, z0 + i * dz, y)));
  return { z0: r3(z0), dz, half };
}

/** Half-widths on a (z, y) grid over the hull sides where holes can go (y 0.4 .. deck). */
function holeTable(hull) {
  const dz = 0.25;
  const dy = 0.15;
  const y0 = 0.4;
  const z0 = -hull.L / 2;
  const nz = Math.round(hull.L / dz) + 1;
  const ny = Math.max(2, Math.ceil((hull.D - y0) / dy) + 1);
  const x = new Float32Array(nz * ny);
  for (let i = 0; i < nz; i++) for (let j = 0; j < ny; j++) x[i * ny + j] = halfWidth(hull, z0 + i * dz, y0 + j * dy);
  return { z0, dz, nz, y0, dy, ny, x };
}
function tableAt(t, z, y) {
  const fi = clamp((z - t.z0) / t.dz, 0, t.nz - 1.001);
  const fj = clamp((y - t.y0) / t.dy, 0, t.ny - 1.001);
  const i = Math.floor(fi);
  const j = Math.floor(fj);
  const a = fi - i;
  const b = fj - j;
  const X = (ii, jj) => t.x[ii * t.ny + jj];
  return lerp(lerp(X(i, j), X(i + 1, j), a), lerp(X(i, j + 1), X(i + 1, j + 1), a), b);
}

/** The sail that comes down on MAST DOWN / droops when wrecked, inside a merged square rig. */
function rigTarget(rig, k) {
  if (!rig) return null;
  const s = rig.sails.at(k);
  return { mesh: rig.mesh, ranges: rig.sails.length > 1 ? s.ranges : null, kind: 'square', y: s.y, wt: s.wt, h: s.h };
}

/** Rope anchors at both ends of a rig's lowest yard (ship-local; +x = port). */
function rigYardTips(rig) {
  if (!rig) return null;
  const s = rig.sails.at(-1);
  const m = rig.rig.matrixWorld; // the ship group is still at the origin here
  const tip = (sx) => {
    const p = V3(sx * s.yard.half, s.yard.y, s.yard.z).applyMatrix4(m);
    return { x: r3(p.x), y: r3(p.y), z: r3(p.z) };
  };
  return { port: tip(1), star: tip(-1) };
}

// ---------------------------------------------------------------------------
// Sails: slack when battered, one droops when wrecked, the top sail drops on MAST DOWN
// ---------------------------------------------------------------------------

const SLACK = [1, 0.84, 0.7]; // billow by damage level

function poseFor(target, mode) {
  if (target.kind === 'square') {
    // dropped: the sail has come off its yard and hangs crumpled and askew below it
    if (mode === 'drop') return { pivot: V3(0, target.y, 0), rot: new THREE.Euler(0, 0, 0.3), scale: [0.9, 0.5], off: V3(target.wt * 0.06, -0.42 * target.h, 0.18), limp: 0.25 };
    // drooping: one sheet shot away, the sail hangs from the other yard arm
    return { pivot: V3(target.wt / 2, target.y, 0), rot: new THREE.Euler(0, 0, 0.42), scale: [1, 0.96], off: V3(), limp: 0.45 };
  }
  // fore-and-aft sails (local x = aft, y = up, z = belly): folded down to the boom, or leaning over
  if (mode === 'drop') return { pivot: V3(0, target.yb, 0), rot: new THREE.Euler(0.12, 0, 0), scale: [1, 0.42], off: V3(), limp: 0.3 };
  return { pivot: V3(0, target.yb, 0), rot: new THREE.Euler(0.24, 0, 0), scale: [1, 0.9], off: V3(), limp: 0.5 };
}

/** Put a sail mesh in a pose (pivot, extra rotation, scale) relative to its build transform. */
function applyPose(mesh, base, pose) {
  if (!pose) {
    mesh.position.copy(base.pos);
    mesh.quaternion.copy(base.quat);
    mesh.scale.x = 1;
    mesh.scale.y = 1;
    return;
  }
  const rq = new THREE.Quaternion().setFromEuler(pose.rot);
  const sp = V3(pose.pivot.x * pose.scale[0], pose.pivot.y * pose.scale[1], 0).applyQuaternion(rq);
  const local = pose.pivot.clone().add(pose.off).sub(sp);
  mesh.position.copy(local.applyQuaternion(base.quat).add(base.pos));
  mesh.quaternion.copy(base.quat).multiply(rq);
  mesh.scale.x = pose.scale[0];
  mesh.scale.y = pose.scale[1];
}

/** Cut a target's index ranges out of its merged sail mesh into a mesh of its own (shared buffers). */
function splitTarget(group, P, target) {
  if (target.part) return target.part;
  const src = target.mesh;
  const g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(src.geometry.attributes)) g.setAttribute(name, a);
  g.setIndex(src.geometry.index);
  for (const r of target.ranges) g.addGroup(r.start, r.count, r.materialIndex);
  const part = new THREE.Mesh(g, P.sources.get(src).list);
  part.name = 'sail-part';
  part.userData.keep = true;
  part.userData.sail = { ph: src.userData.sail.ph };
  part.position.copy(src.position);
  part.quaternion.copy(src.quaternion);
  src.parent.add(part);
  group.userData.sails.push(part);
  target.part = part;
  return part;
}

/** A merged sail mesh draws only what has not been split out (its own groups minus the cut ranges). */
function refreshSource(P, mesh) {
  const src = P.sources.get(mesh);
  const cuts = [];
  for (const t of [P.top, P.droop]) if (t && t.mesh === mesh && t.ranges && t.part && t.part.visible) cuts.push(...t.ranges);
  if (!cuts.length) {
    mesh.geometry.groups = src.groups.map((g) => ({ ...g }));
    mesh.material = src.material;
    return;
  }
  let groups = src.groups.map((g) => ({ ...g }));
  for (const c of cuts) {
    const next = [];
    for (const g of groups) {
      if (g.materialIndex !== c.materialIndex || c.start >= g.start + g.count || c.start + c.count <= g.start) {
        next.push(g);
        continue;
      }
      if (c.start > g.start) next.push({ start: g.start, count: c.start - g.start, materialIndex: g.materialIndex });
      const end = g.start + g.count;
      const cend = c.start + c.count;
      if (cend < end) next.push({ start: cend, count: end - cend, materialIndex: g.materialIndex });
    }
    groups = next;
  }
  mesh.geometry.groups = groups;
  mesh.material = src.list; // groups only count with a material array
}

function applySails(group, P) {
  const u = group.userData;
  const slack = SLACK[u.damageLevel];
  for (const s of u.sails) {
    if (slack === 1) delete s.userData.sail.limp;
    else s.userData.sail.limp = slack;
  }
  const { top, droop } = P;
  const shared = top && droop && (top === droop || (top.mesh === droop.mesh && !top.ranges && !droop.ranges));
  const modes = [];
  if (top) modes.push([top, u.mastDown ? 'drop' : shared && u.damageLevel >= 2 ? 'droop' : null]);
  if (droop && !shared) modes.push([droop, u.damageLevel >= 2 ? 'droop' : null]);
  for (const [t, mode] of modes) {
    if (!t.base) t.base = { pos: t.mesh.position.clone(), quat: t.mesh.quaternion.clone() };
    const pose = mode ? poseFor(t, mode) : null;
    if (!t.ranges) {
      applyPose(t.mesh, t.base, pose);
      if (pose) t.mesh.userData.sail.limp = pose.limp;
      continue;
    }
    if (!pose && !t.part) continue;
    const part = splitTarget(group, P, t);
    part.visible = !!pose;
    if (pose) {
      applyPose(part, t.base, pose);
      part.userData.sail.limp = pose.limp;
    }
  }
  for (const mesh of P.sources.keys()) refreshSource(P, mesh);
  for (const info of u.sailInfo) info.dropped = !!(u.mastDown && top && info.mesh === top.mesh);
}

// ---------------------------------------------------------------------------
// Deck fires (wrecked ships)
// ---------------------------------------------------------------------------

/** A per-ship glow material made after the build (flickers with the others, disposed with the ship). */
function lateGlow(group, P, color, intensity, outline, flicker) {
  const key = `${color}|${intensity}|${outline}`;
  let m = P.glowCache.get(key);
  if (!m) {
    m = toon(color, { emissive: color, emissiveIntensity: intensity, outline: outline ? THIN : false }).clone();
    P.glowCache.set(key, m);
    group.userData.glows.push({ material: m, base: intensity, amt: flicker, f: 5 + Math.random() * 4, ph: Math.random() * 10 });
  }
  return m;
}

function deckFire(group, P, x, y, z, s) {
  const [outerC, coreC] = P.fireColors || [0xff7a1a, 0xffd84a];
  const outerM = lateGlow(group, P, outerC, 1.15, true, 0.14);
  const coreM = lateGlow(group, P, coreC, 1.2, false, 0.12);
  const fl = lathe('flame', [[0.0001, 0], [0.3, 0.1], [0.36, 0.3], [0.24, 0.62], [0.08, 0.95], [0.0001, 1.15]], 12);
  const tongue = (m, p, r, sc) => {
    const g = fl.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(V3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), V3(...sc)));
    return { geo: g, material: m };
  };
  const char = toon(0x2a1d1a, { outline: false });
  const scorch = new THREE.CircleGeometry(0.62, 18).rotateX(-PI / 2).translate(0, 0.02, 0);
  const merged = mergeByMaterial([
    tongue(outerM, [0, 0, 0], [0, 0, 0], [0.8, 1.25, 0.8]),
    tongue(outerM, [0.3, 0, 0.08], [0.12, 0, -0.5], [0.52, 0.85, 0.52]),
    tongue(outerM, [-0.28, 0, -0.1], [-0.15, 0, 0.45], [0.5, 0.8, 0.5]),
    tongue(outerM, [0.05, 0, -0.3], [-0.45, 0, 0.05], [0.44, 0.7, 0.44]),
    tongue(outerM, [-0.1, 0, 0.32], [0.45, 0, 0.1], [0.4, 0.62, 0.4]),
    tongue(coreM, [0, 0.02, 0.1], [0.1, 0, 0], [0.5, 0.82, 0.5]),
    tongue(coreM, [0.22, 0.02, -0.12], [0, 0, -0.3], [0.3, 0.5, 0.3]),
    { geo: scorch, material: char },
  ]);
  const fire = new THREE.Group();
  fire.name = 'deck-fire';
  fire.position.set(x, y + 0.01, z);
  fire.scale.setScalar(s);
  fire.userData.keep = true;
  const mesh = new THREE.Mesh(merged.geometry, merged.materials);
  fire.add(mesh);
  group.add(fire);
  group.userData.fx.push({ kind: 'flame', obj: mesh, ph: Math.random() * TAU, s: 1 });
  return fire;
}

// ---------------------------------------------------------------------------
// Holes where balls hit
// ---------------------------------------------------------------------------

const MAX_HOLES = 8;

/** A splintered hole: pale torn-wood tips round a scorched ring round a black hole (vertex colours). */
const holeGeo = () =>
  cached('hole', () => {
    const layer = (shape, color, z) => {
      const g = new THREE.ShapeGeometry(shape, 10);
      g.translate(0, 0, z);
      const c = new THREE.Color(color);
      const col = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    };
    const star = [];
    const N = 11;
    for (let k = 0; k < N * 2; k++) {
      const a = (k / (N * 2)) * TAU;
      const r = k % 2 ? 0.25 : 0.38 + 0.16 * tri(k * 0.37 + 0.21);
      star.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const ragged = [];
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * TAU;
      const r = 0.29 + 0.04 * tri(k * 0.61 + 0.1);
      ragged.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const hole = [];
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU;
      const r = 0.19 + 0.03 * tri(k * 0.43);
      hole.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return mergeGeometries([layer(polyShape(star), 0xe6c08a, 0), layer(polyShape(ragged), 0x3b2418, 0.006), layer(polyShape(hole), 0x0e0a0c, 0.012)], false);
  });
let holeMaterial = null;
function holeMat() {
  if (!holeMaterial) {
    holeMaterial = noOutline(new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap(3), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    holeMaterial.name = 'ship:hole';
  }
  return holeMaterial;
}

// ---------------------------------------------------------------------------
// Projectiles (one mesh per ball; cached geometry, shared material)
// ---------------------------------------------------------------------------

const SHOT_COLOR = 0x2b2b38; // the round shot's colour in main.js
const shotGeos = {};
function shotGeo(id) {
  if (shotGeos[id]) return shotGeos[id];
  let g;
  if (id === 'chain') {
    // two half-balls (flat faces inward) on an iron bar
    const half = (sx) => new THREE.SphereGeometry(0.26, 12, 8).scale(0.72, 1, 1).translate(sx * 0.48, 0, 0);
    const bar = new THREE.CapsuleGeometry(0.07, 0.86, 2, 8).rotateZ(PI / 2);
    g = mergeGeometries([half(-1), half(1), bar], false);
  } else if (id === 'grape') {
    // six small balls in a tight cluster
    const parts = [];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      parts.push(new THREE.SphereGeometry(0.15, 10, 7).translate(Math.cos(a) * 0.17, (k % 2) * 0.06 - 0.05, Math.sin(a) * 0.17));
    }
    parts.push(new THREE.SphereGeometry(0.15, 10, 7).translate(0, 0.16, 0));
    g = mergeGeometries(parts, false);
  } else {
    g = new THREE.SphereGeometry(0.34, 12, 8);
  }
  shotGeos[id] = g;
  return g;
}
function spinShot() {
  // chain shot whirls round as it flies (visual only)
  this.rotation.y = this.userData.spin + performance.now() * 0.012;
  this.updateMatrix();
  if (this.parent) this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
  else this.matrixWorld.copy(this.matrix);
}

/**
 * A cannonball mesh for an ammo id ('round' | 'chain' | 'grape'; anything else = round). Geometry
 * is cached and the material shared: the caller adds it to the scene and removes it again, never
 * disposes it. Round shot is the same ball as before; chain shot spins by itself.
 */
export function projectileMesh(ammoId) {
  const id = ammoId === 'chain' || ammoId === 'grape' ? ammoId : 'round';
  const m = new THREE.Mesh(shotGeo(id), toon(SHOT_COLOR));
  m.name = `shot:${id}`;
  if (id === 'chain') {
    m.userData.spin = Math.random() * TAU;
    m.onBeforeRender = spinShot;
  }
  return m;
}

/**
 * A hole where a ball hit the hull: a flat splintered decal on the hull side (no outline), one
 * InstancedMesh of up to 8 per ship (the oldest is reused). z: ship-local along (bow +), y: impact
 * height (clamped to 0.5 .. deckY - 0.2), side: +1 starboard, -1 port (gameplay sides).
 */
export function addHole(group, at = {}) {
  const P = group ? PRIV.get(group) : null;
  if (!P) return;
  const { z = 0, y = 0.9, side = 1 } = at && typeof at === 'object' ? at : {};
  const t = P.table;
  const sx = side < 0 ? 1 : -1; // starboard is ship-local -x
  let hy = clamp(Number.isFinite(y) ? y : 0.9, 0.5, Math.max(0.5, P.deckY - 0.2));
  hy = clamp(hy, t.y0, t.y0 + (t.ny - 1) * t.dy);
  let hz = clamp(Number.isFinite(z) ? z : 0, t.z0 + 0.4, t.z0 + (t.nz - 1) * t.dz - 0.4);
  // keep the decal on a part of the side wide enough to hold it (the ends curve away)
  let w = tableAt(t, hz, hy);
  for (let k = 0; k < 60 && w < P.minHalf && Math.abs(hz) > 0.05; k++) {
    hz -= Math.sign(hz) * 0.1;
    w = tableAt(t, hz, hy);
  }
  if (w < 0.1) return;
  const e = 0.1;
  const dz = (tableAt(t, hz + e, hy) - tableAt(t, hz - e, hy)) / (2 * e);
  const dy = (tableAt(t, hz, hy + e) - tableAt(t, hz, hy - e)) / (2 * e);
  const n = V3(sx, -dy, -dz).normalize();
  let H = P.holes;
  if (!H) {
    H = new THREE.InstancedMesh(holeGeo(), holeMat(), MAX_HOLES);
    H.name = 'holes';
    H.count = 0;
    H.frustumCulled = false; // a child of the ship: its bounds would need refreshing per hole
    H.userData.keep = true;
    group.add(H);
    P.holes = H;
  }
  const i = P.holeNext % MAX_HOLES;
  const k = P.holeSeq++;
  P.holeNext++;
  const q = new THREE.Quaternion().setFromUnitVectors(FWD, n);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(FWD, k * 2.39996));
  const sc = P.holeScale * (0.85 + 0.3 * tri(k * 0.618 + 0.3));
  const pos = V3(sx * w, hy, hz).addScaledVector(n, 0.03);
  H.setMatrixAt(i, new THREE.Matrix4().compose(pos, q, V3(sc, sc, sc)));
  H.count = Math.min(MAX_HOLES, P.holeNext);
  H.instanceMatrix.needsUpdate = true;
  H.visible = true;
}

/** Remove every hole (e.g. the player's hull back to full). */
export function clearHoles(group) {
  const P = group ? PRIV.get(group) : null;
  if (!P || !P.holes) return;
  P.holes.count = 0;
  P.holes.visible = false;
  P.holeNext = 0;
}

/**
 * Visible damage. level 0 (sound) | 1 (battered: slack sails) | 2 (wrecked: a deck fire and one
 * sail drooping from a single yard arm); mast: true drops the top sail (MAST DOWN), false raises it.
 * Leaving a field out keeps it. Cheap when nothing changes. State: userData.damageLevel,
 * userData.mastDown, userData.sailInfo[i].dropped.
 */
export function setShipDamage(group, state = {}) {
  const P = group ? PRIV.get(group) : null;
  if (!P) return;
  const { level, mast } = state && typeof state === 'object' ? state : {};
  const u = group.userData;
  const lv = level === undefined || level === null ? u.damageLevel : clamp(Math.round(Number(level)) || 0, 0, 2);
  const md = mast === undefined || mast === null ? u.mastDown : !!mast;
  if (lv === u.damageLevel && md === u.mastDown) return;
  u.damageLevel = lv;
  u.mastDown = md;
  applySails(group, P);
  if (lv >= 2 && !P.fires) P.fires = P.fireSpots.map(([x, y, z, s]) => deckFire(group, P, x, y, z, s));
  for (const f of P.fires || []) f.visible = lv >= 2;
}

/**
 * Change the colours flown: 'white' (struck: a white flag in place of her own), 'player' (a prize:
 * your flag, flagLook = a LOOKS.flag entry, default the blue pennant) or 'own' (her own again).
 * State: userData.flag.
 */
export function hoistFlag(group, kind, flagLook = null) {
  const P = group ? PRIV.get(group) : null;
  if (!P || !P.flagSpot) return;
  const k = kind === 'white' || kind === 'player' ? kind : 'own';
  if (k === 'player') {
    const look = flagLook && typeof flagLook === 'object' ? flagLook : findLook('flag');
    const key = `${look.kind}|${look.color}|${look.emblem}`;
    if (P.prize && P.prizeKey !== key) {
      const old = P.prize;
      old.parent.remove(old);
      old.geometry.dispose();
      const list = group.userData.flags;
      if (list.includes(old)) list.splice(list.indexOf(old), 1);
      P.prize = null;
    }
    if (!P.prize) {
      P.prize = raiseFlag(group, P, look);
      P.prizeKey = key;
    }
  }
  if (k === 'white' && !P.white) P.white = raiseFlag(group, P, { kind: 'white' });
  for (const f of P.ownFlags) f.visible = k === 'own';
  if (P.white) P.white.visible = k === 'white';
  if (P.prize) P.prize.visible = k === 'player';
  group.userData.flag = k;
}

/** Build a flag that flies from the ship's main flag spot (its staff is already there). */
function raiseFlag(group, P, look) {
  const spot = P.flagSpot;
  const S = { group, flags: group.userData.flags, flagSpot: spot };
  const h = Math.min(spot.h, 1.6);
  let o;
  if (look.kind === 'white') {
    const wh = clamp(spot.h, 0.9, 1.4);
    o = { len: wh * 1.45, h: wh, mat: mat(0xf8f6ee), nu: 14 };
  } else if (look.kind === 'jolly') {
    o = {
      len: Math.max(1.5, spot.len * 0.92),
      h,
      shape: 'swallow',
      mat: mat(look.color),
      decal: { shapes: jollyRogerShapes(), size: 0.46 * h, cx: 0.37, cy: 0.02, mat: mat(look.emblem ?? 0xf6f1e4, { outline: false }) },
      amp: h * 0.15,
    };
  } else {
    o = { len: Math.max(1.6, spot.len * 1.1), h: Math.min(0.7, h * 0.62), shape: 'pennant', mat: mat(look.color) };
  }
  const p = spot.p.clone();
  p.y += (h - o.h) / 2; // hang from the top of the staff
  const f = flagMesh(S, { ...o, p, yaw: spot.yaw, staff: false });
  f.name = `flag:${look.kind}`;
  return f;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the cartoon model for SHIP_TYPES[typeKey].
 * opts (player only; other types ignore it, and no opts = the stock ship):
 *   type: the upgraded ship type (playerType() in upgrades.js); its gun count places the gun ports
 *   look: { hull, sails, flag } paint ids from LOOKS (unknown ids -> the default paint)
 *   upgrades: { guns, shot, crew, hull, sails, carpenter } tiers, each shown on the model
 *   armory: { grapple } Long grapples tier (0..2): coiled grapnels on the rail (none at tier 0)
 * group.userData = { type, sails: Mesh[], flags: Mesh[], glows: [{material, base, amt, f, ph}],
 *                    fx: [{kind, obj, ...}], cloth: Material[] (player only), phase,
 *   battle data (ship-local; +x = port, -x = starboard, bow = +z):
 *     deckY, railY: main deck and cap-rail heights amidships
 *     deckSpots: [{x, y, z, h}] free standing spots on deck (>= 4; h = facing yaw; the player's 6 are
 *                clear of every prop for all upgrades; the prahu's narrow hull puts three on its outrigger booms)
 *     yardTips: { port: {x, y, z}, star: {x, y, z} } ends of the main course yard (rope anchors for swings)
 *     hullSide: { z0, dz, half: number[] } hull half-width sampled along z at y 0.9
 *     sailInfo: [{ mesh, top, dropped }] every sail mesh; top marks the one holding the sail that
 *                comes down on MAST DOWN, dropped is true while it is down
 *     damageLevel: 0 | 1 | 2, mastDown: boolean, flag: 'own' | 'white' | 'player' (see setShipDamage, hoistFlag)
 *   player only: helm: {x, y, z, h} (the captain's place behind the wheel, facing the bow), coils (grapnels
 *     shown), hullSpots: [{x, y, z, side, h}] (on the hull sides just above the waterline, h = yaw facing
 *     the hull) and blockers: [{x, z, r} | {x, z, hx, hz}] (deck props) }
 * Materials are shared toon() materials except userData.glows / userData.cloth
 * (per-ship clones), so don't mutate or dispose the others; see disposeShip().
 */
export function buildShip(typeKey, opts = {}) {
  let T = SHIP_TYPES[typeKey];
  const build = BUILDERS[typeKey];
  if (!T || !build) throw new Error(`buildShip: unknown ship type "${typeKey}"`);
  const o = opts && typeof opts === 'object' ? opts : {};
  // the player's upgraded type (playerType() in upgrades.js) decides the gun count
  if (typeKey === 'player' && o.type && Number.isInteger(o.type.guns) && o.type.guns !== T.guns) {
    T = { ...T, guns: clamp(o.type.guns, 1, 8) };
  }
  const group = new THREE.Group();
  group.name = `ship:${typeKey}`;
  const S = {
    group,
    sails: [],
    flags: [],
    glows: [],
    glowCache: new Map(),
    fx: [],
    cloth: null,
    blockers: [],
    deckSpots: null,
    hullSpots: null,
    hull: null,
    rigs: [],
    helm: null,
    coils: 0,
    flagSpot: null,
    fireSpots: null,
    fireColors: null,
    dropSail: null,
    droopSail: null,
    yardTips: null,
  };
  build(S, T, o);
  mergeStatic(group);
  // (the player's ship keeps a material per colour: the shipyard repaints it and its tests read them)
  if (typeKey !== 'player') bakeColours(group);
  const hull = S.hull;
  const top = S.dropSail ? { ...S.dropSail, ranges: null } : rigTarget(S.rigs[0], 0);
  const droop = S.droopSail ? (S.droopSail === S.dropSail ? top : { ...S.droopSail, ranges: null }) : rigTarget(S.rigs[1] || S.rigs[0], -1);
  const spots = (S.deckSpots || []).map((p) => ({ x: r3(p.x), y: r3(p.y), z: r3(p.z), h: r3(p.h) }));
  group.userData = {
    type: typeKey,
    sails: S.sails,
    flags: S.flags,
    glows: S.glows.map(({ m, base, amt, f, ph }) => ({ material: m, base, amt, f, ph })),
    fx: S.fx,
    cloth: S.cloth || [],
    phase: Math.random() * TAU,
    // battle data (SPEC2 §9.1), all ship-local: +x = port, bow = +z
    deckY: r3(hull.D),
    railY: r3(hull.railAt(0)),
    deckSpots: S.hullSpots ? S.deckSpots : spots,
    yardTips: S.yardTips || rigYardTips(S.rigs[0]),
    hullSide: hullSideData(hull, 0.9),
    sailInfo: S.sails.map((mesh) => ({ mesh, top: !!top && mesh === top.mesh, dropped: false })),
    damageLevel: 0,
    mastDown: false,
    flag: 'own',
  };
  if (S.hullSpots) {
    group.userData.hullSpots = S.hullSpots;
    group.userData.blockers = S.blockers;
  }
  if (S.helm) {
    group.userData.helm = S.helm;
    group.userData.coils = S.coils;
  }
  const sources = new Map();
  for (const t of [top, droop]) {
    if (!t || !t.ranges || sources.has(t.mesh)) continue;
    const m = t.mesh.material;
    sources.set(t.mesh, { groups: t.mesh.geometry.groups.map((g) => ({ ...g })), material: m, list: Array.isArray(m) ? m : [m] });
  }
  PRIV.set(group, {
    table: holeTable(hull),
    deckY: hull.D,
    minHalf: 0.42,
    holeScale: clamp(T.len / 11, 0.75, 1.15),
    holes: null,
    holeNext: 0,
    holeSeq: 0,
    top,
    droop,
    sources,
    fireSpots: S.fireSpots || [],
    fireColors: S.fireColors,
    fires: null,
    glowCache: new Map(),
    flagSpot: S.flagSpot,
    ownFlags: [...S.flags],
    white: null,
    prize: null,
    prizeKey: '',
  });
  return group;
}

// ---------------------------------------------------------------------------
// Draw calls: an enemy's static parts (after mergeStatic, one mesh per colour) become ONE vertex-coloured
// mesh per kind of plain toon look (same shading, outline and sides), so a cutter costs about 14 draw calls
// instead of 40. Only plain opaque toon materials are baked: glowing, see-through, textured or ink-less
// ones keep their own mesh, and so does everything kept apart for animation (sails, flags, fires).
// ---------------------------------------------------------------------------
const bakedMats = new Map(); // look key -> the shared vertex-colour toon material
function bakeKey(m) {
  const o = (m.userData && m.userData.outlineParameters) || {};
  return JSON.stringify([m.gradientMap ? m.gradientMap.uuid : 0, m.side, !!m.flatShading, m.fog, o.visible !== false, o.thickness ?? null, o.color ?? null, o.alpha ?? 1]);
}
function bakeable(mesh) {
  if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh || (mesh.userData && mesh.userData.keep)) return false;
  const m = mesh.material;
  if (!m || Array.isArray(m) || !m.isMeshToonMaterial || m.vertexColors || m.map || m.transparent || m.alphaTest > 0) return false;
  if (m.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0) return false;
  const g = mesh.geometry;
  return !!(g && g.index && g.attributes.position && g.attributes.normal && g.attributes.uv && !g.attributes.color && !g.morphAttributes.position);
}
function bakeColours(group) {
  const byKey = new Map();
  for (const mesh of group.children) {
    if (!bakeable(mesh)) continue;
    const k = bakeKey(mesh.material);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(mesh);
  }
  for (const [k, list] of byKey) {
    if (list.length < 2) continue;
    const geos = [];
    for (const mesh of list) {
      mesh.updateMatrix();
      const src = mesh.geometry;
      const g = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) g.setAttribute(name, src.attributes[name].clone());
      g.setIndex(src.index.clone());
      const n = g.attributes.position.count;
      const c = mesh.material.color; // (linear, as vertex colours are)
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.applyMatrix4(mesh.matrix);
      geos.push(g);
    }
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    let mat = bakedMats.get(k);
    if (!mat) {
      const m0 = list[0].material;
      // (MeshToonMaterial has no flatShading option: passing one only logs a three.js warning)
      mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: m0.gradientMap, side: m0.side, fog: m0.fog });
      mat.userData.outlineParameters = { ...(m0.userData.outlineParameters || {}) };
      mat.name = 'ship-baked';
      bakedMats.set(k, mat);
    }
    const baked = new THREE.Mesh(merged, mat);
    baked.name = 'ship-baked';
    for (const mesh of list) {
      group.remove(mesh);
      mesh.geometry.dispose();
    }
    group.add(baked);
  }
}

/**
 * Animate a ship built by buildShip: billow sails with speedRatio (0..1), flutter
 * flags, flicker glows, lick flames and puff smoke. Cheap: transforms, morph
 * influences and emissive intensity only.
 */
export function animateShip(group, t, speedRatio = 0) {
  const u = group.userData;
  if (!u || !u.sails) return;
  const sr = clamp(speedRatio || 0, 0, 1);
  const ph = u.phase || 0;
  for (let i = 0; i < u.sails.length; i++) {
    const s = u.sails[i];
    const p = (s.userData.sail && s.userData.sail.ph) || 0;
    const base = 0.42 + 0.58 * sr;
    const luff = (1 - sr) * 0.09 * Math.sin(t * 7.1 + p + ph) * Math.sin(t * 2.3 + p);
    const breathe = 0.035 * Math.sin(t * 1.6 + p + ph);
    s.scale.z = (base + luff + breathe) * ((s.userData.sail && s.userData.sail.limp) ?? 1);
  }
  const w = 6.5 + 5 * sr;
  const amp = 0.6 + 0.5 * sr;
  for (let i = 0; i < u.flags.length; i++) {
    const f = u.flags[i];
    const fd = f.userData.flag || {};
    const a = w * t + (fd.ph || 0) + ph;
    const inf = f.morphTargetInfluences;
    inf[0] = amp * Math.cos(a);
    inf[1] = -amp * Math.sin(a);
    f.rotation.y = PI / 2 + (fd.yaw || 0) + 0.12 * Math.sin(t * 1.3 + (fd.ph || 0)) * (1.2 - sr);
  }
  for (const g of u.glows) {
    const n = Math.sin(t * g.f + g.ph) * 0.6 + Math.sin(t * g.f * 2.7 + g.ph * 1.3) * 0.4;
    g.material.emissiveIntensity = g.base * (1 - g.amt * 0.5 + g.amt * 0.5 * n);
  }
  for (const fx of u.fx) {
    if (fx.kind === 'flame') {
      const k = Math.sin(t * 13 + fx.ph) * 0.5 + Math.sin(t * 21 + fx.ph * 2) * 0.5;
      fx.obj.scale.set(1 + 0.08 * k, 1 + 0.18 * k, 1 + 0.08 * k);
      fx.obj.rotation.y = t * 1.5 + fx.ph;
    } else if (fx.kind === 'smoke') {
      // rise, drift aft, swell, then shrink away at the top of the column
      const q = (((t * 0.38 + fx.ph) % 1) + 1) % 1;
      const s = fx.s || 1;
      fx.obj.position.set(fx.base.x + Math.sin(q * 4 + fx.ph * 9) * 0.3 * s, fx.base.y + q * 3.4 * s, fx.base.z - q * q * 1.6 * s);
      const r = (0.14 + 0.68 * Math.sin(PI * Math.min(1, q * 1.08)) * (0.75 + 0.25 * q)) * s;
      fx.obj.scale.set(r, r * 0.9, r);
      fx.obj.rotation.y = fx.ph * 7 + q * 1.2;
    }
  }
}

/**
 * Optional clean-up for a ship that is gone for good (sunk, level change): removes
 * it from its parent and frees its own GPU buffers and per-ship materials. Shared
 * cached geometry and the shared toon() materials are left alone, so other ships
 * (and later buildShip calls) are unaffected. Safe to call more than once.
 */
export function disposeShip(group) {
  if (!group) return;
  if (group.parent) group.parent.remove(group);
  const shared = new Set(geoCache.values());
  group.traverse((o) => {
    if (o.isMesh && o.geometry && !shared.has(o.geometry)) o.geometry.dispose();
    if (o.isInstancedMesh) o.dispose(); // its instance buffers (the hole decal geometry is shared)
  });
  const u = group.userData || {};
  for (const g of u.glows || []) g.material.dispose();
  for (const m of u.cloth || []) m.dispose();
}
