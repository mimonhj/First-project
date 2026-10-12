import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, mergeStatic } from './style.js';
import { SHIP_TYPES, gunOffset } from './shipTypes.js';

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

/** Merge geometries into one, with one draw group per distinct material. */
function mergeByMaterial(parts) {
  const byMat = new Map();
  for (const { geo, material } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.morphAttributes = {};
    const list = byMat.get(material) || [];
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
  return { geometry: merged, materials: mats.length === 1 ? mats[0] : mats };
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
  for (const s of sails) {
    const def = squareDef(s.h, s.wt, s.wb, s.belly, s);
    if (s.stripes) {
      const n = s.stripes.n;
      for (let k = 0; k < n; k++) {
        const geo = pillowGeometry(def, k / n, (k + 1) / n, 0, 1);
        geo.translate(0, s.y, 0);
        parts.push({ geo, material: k % 2 ? s.stripes.mat : s.mat });
      }
    } else {
      const geo = pillowGeometry(def);
      geo.translate(0, s.y, 0);
      parts.push({ geo, material: s.mat });
    }
    for (const d of s.decals || []) {
      for (const side of d.sides || [1, -1]) {
        const geo = sailDecal(def, d.shapes, d.size, d.cx ?? 0, d.cy, side, d.depth ?? 0.07, d.rot ?? 0);
        geo.translate(0, s.y, 0);
        parts.push({ geo, material: d.mat });
      }
    }
    yard(rig, o.spar ?? 0x7a4a28, s.y + 0.02, zOff, s.wt * 1.04 + 0.15, o.yardR ?? 0.1);
  }
  const { geometry, materials } = mergeByMaterial(parts);
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.position.set(0, 0, zOff);
  mesh.userData.keep = true;
  mesh.userData.sail = { ph: Math.random() * TAU };
  rig.add(mesh);
  S.sails.push(mesh);
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
function cannonGeo(len = 0.75, r = 0.13) {
  return lathe(`can${len},${r}`, [
    [0.0001, -0.12],
    [r * 0.7, -0.1],
    [r * 1.05, 0],
    [r * 0.95, len * 0.35],
    [r * 0.82, len * 0.85],
    [r * 1.22, len * 0.9],
    [r * 1.22, len],
    [r * 0.55, len + 0.01],
    [0.0001, len - 0.02],
  ], 8);
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
    const b = add(holder, cannonGeo(0.62 * s, 0.12 * s), mat(o.iron ?? 0x2d2a33), [0, 0, -0.1]);
    b.rotation.x = PI / 2;
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
  add(g, sphere(), glow(S, o.color ?? 0xffc04a, 1.05), [0, 0, 0], null, [0.17 * s, 0.22 * s, 0.17 * s]);
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
  const outerM = glow(S, 0xff7a1a, 1.15, true, 0.12);
  const coreM = glow(S, 0xffd84a, 1.2, false, 0.1);
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
    const n = 5;
    for (let k = 0; k < n; k++) {
      const puff = add(S.group, puffGeo(), toon(k % 2 ? 0x7d76a0 : 0x655e8a, { outline: THIN }), [x, y + 1.6 * s, z], [0, k * 1.9, 0], 0.3);
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

function buildPlayer(S, T) {
  S.brace = 0.32;
  const C = {
    honey: 0xf3b23f,
    honeyDark: 0xc9782f,
    teal: 0x16a5a2,
    tealDark: 0x0d7c7e,
    deck: 0xe2b77c,
    plank: 0xbf8a52,
    rim: 0x7a4426,
    sail: 0xfff3d6,
    pennant: 0x2f86ea,
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
    bands: [mat(C.teal), mat(C.tealDark), mat(C.honey)],
    rim: mat(C.rim),
    wall: mat(C.honeyDark),
    deck: mat(C.deck),
  });
  deckPlanks(S, hull, C.plank, -3.0, 4.2, 5);
  cutwater(S, hull, C.rim, 0.12);

  // stern cabin
  const L2 = T.len / 2;
  const cab = sternCastle(S, hull, { z1: -2.75, y0: 1.0, y1: 2.5, color: C.honey, cap: C.teal, top: C.deck, r: 0.28, over: 0.12 });
  windows(S, S.group, [-0.85, 0, 0.85], 1.53, cab.z0, -1, { w: 0.46, h: 0.6, frame: C.tealDark });
  // little round side windows
  for (const sd of [-1, 1]) {
    for (const z of [-4.15, -3.35]) {
      const holder = new THREE.Group();
      holder.position.set(sd * (cab.w / 2 + 0.01), 1.8, z);
      holder.rotation.y = sd * PI / 2;
      S.group.add(holder);
      add(holder, torus(0.15, 0.05, 16, 6), mat(C.tealDark));
      add(holder, cyl(0.14, 0.14, 0.06, 12), glow(S, 0xffc65a, 1), [0, 0, -0.01], [PI / 2, 0, 0]);
    }
  }
  // cabin door at the front
  add(S.group, rbox(0.7, 1.0, 0.12, 0.1), mat(C.rim), [0, 1.62, cab.z1 + 0.02]);
  add(S.group, sphere(), mat(0xffd23f), [0.22, 1.6, cab.z1 + 0.1], null, 0.06);
  // quarterdeck rails and lanterns
  const yq = cab.y1 + 0.1;
  for (const sd of [-1, 1]) {
    rail(S, V3(sd * (cab.w / 2 - 0.12), yq, cab.z0 + 0.15), V3(sd * (cab.w / 2 - 0.12), yq, cab.z1 - 0.15), 0.42, C.rim, 3);
    rod(S.group, mat(C.rim), V3(sd * (cab.w / 2 - 0.12), yq, cab.z0 + 0.15), V3(sd * (cab.w / 2 - 0.12), yq + 1.0, cab.z0 + 0.15), 0.06, 8);
    rod(S.group, mat(IRON), V3(sd * (cab.w / 2 - 0.12), yq + 1.0, cab.z0 + 0.15), V3(sd * (cab.w / 2 + 0.12), yq + 1.0, cab.z0 + 0.05), 0.04, 6);
    lantern(S, S.group, sd * (cab.w / 2 + 0.14), yq + 0.72, cab.z0 + 0.05, { s: 1.0 });
  }
  rail(S, V3(-(cab.w / 2 - 0.12), yq, cab.z0 + 0.15), V3(cab.w / 2 - 0.12, yq, cab.z0 + 0.15), 0.42, C.rim, 4);
  wheel(S, 0, yq, cab.z1 - 0.55, C.rim, 0.9);

  // stern charm (this is the view the player sees all game):
  // a teal rubbing band ties the cabin into the hull stripe ...
  add(S.group, rbox(cab.w + 0.12, 0.22, cab.z1 - cab.z0 + 0.12, 0.09), mat(C.tealDark), [0, 1.13, (cab.z0 + cab.z1) / 2]);
  // ... flower boxes under the windows ...
  const yellow = mat(0xffd23f);
  const white = mat(0xffffff);
  for (const [i, x] of [-0.85, 0, 0.85].entries()) {
    add(S.group, rbox(0.56, 0.16, 0.22, 0.06), mat(C.tealDark), [x, 1.36, cab.z0 - 0.1]);
    for (let k = 0; k < 3; k++) {
      add(S.group, sphere(), (k + i) % 2 ? white : yellow, [x + (k - 1) * 0.16, 1.47 + (k === 1 ? 0.03 : 0), cab.z0 - 0.14], null, 0.08);
    }
  }
  // ... and a round "biscuit" crest on the taffrail (the ship's namesake).
  const crest = new THREE.Group();
  crest.position.set(0, yq + 0.5, cab.z0 + 0.1);
  crest.rotation.y = PI; // faces aft, towards the chase cam
  S.group.add(crest);
  add(crest, cyl(0.4, 0.4, 0.12, 20), mat(C.teal), [0, 0, 0], [PI / 2, 0, 0]);
  add(crest, torus(0.4, 0.065, 24, 8), yellow, [0, 0, 0.02]);
  add(crest, sphere(), mat(C.honey), [0, 0, 0.08], null, [0.27, 0.27, 0.07]);
  for (const [cx, cy] of [[-0.1, 0.08], [0.11, 0.1], [0.02, -0.04], [-0.09, -0.13], [0.12, -0.11]]) {
    add(crest, sphere(), mat(C.rim), [cx, cy, 0.14], null, [0.045, 0.045, 0.025]);
  }

  // guns in round brass/teal portholes
  for (let i = 0; i < T.guns; i++) {
    for (const sd of [-1, 1]) gun(S, hull, gunOffset(T, i), 0.8, sd, { style: 'round', frame: C.tealDark, hole: 0x2a1c14, scale: 1.05 });
  }

  // masts + sails: a stubby, chubby rig (wide sails, short masts). Besides the
  // cartoon proportions this keeps the sail tops well under the chase camera's
  // horizon line, so enemies dead ahead stay visible above the player's sails.
  const fore = mast(S, 2.05, 1.0, 7.1, 0.18, WOOD);
  const main = mast(S, -0.85, 1.0, 7.75, 0.2, WOOD);
  // the player's cloth gets its own material instances, so the game can fade the
  // sails (e.g. when they block the chase cam) without touching enemy ships
  const sail = mat(C.sail).clone();
  const anchorM = mat(C.teal, { outline: THIN }).clone();
  S.cloth = [sail, anchorM];
  shrouds(S, hull, -0.85, 6.85);
  shrouds(S, hull, 2.05, 6.25, { n: 2 });
  squareRig(S, main, [
    { y: 6.95, h: 1.7, wt: 3.0, wb: 3.75, belly: 0.5, mat: sail },
    { y: 5.0, h: 2.35, wt: 3.95, wb: 4.55, belly: 0.75, mat: sail, decals: [{ shapes: anchorShapes(), size: 1.45, cy: -1.2, mat: anchorM }] },
  ], { spar: WOOD });
  squareRig(S, fore, [
    { y: 6.4, h: 1.55, wt: 2.7, wb: 3.35, belly: 0.45, mat: sail },
    { y: 4.6, h: 2.1, wt: 3.5, wb: 4.1, belly: 0.65, mat: sail, decals: [{ shapes: anchorShapes(), size: 1.12, cy: -1.08, mat: anchorM }] },
  ], { spar: WOOD });

  // bowsprit, jib and figurehead
  const tip = bowsprit(S, hull, 2.3, 0.32, WOOD, 0.13);
  jibSail(S, [2.2, 6.15], tip, [2.5, 2.55], 0.38, (d) => [{ geo: pillowGeometry(d), material: sail }], { color: 0x3b2a22 });
  const head = hull.stem(4).at(-1);
  seagull(S, V3(0, head.y - 0.35, head.z + 0.18), -0.25, 0.95);

  // pennant + deck props
  flagMesh(S, { p: V3(0, 8.05, -0.85), len: 2.4, h: 0.7, shape: 'pennant', mat: mat(C.pennant), yaw: -0.25, staff: WOOD, finial: 0xffd23f, staffDown: 0.5 });
  barrel(S, 1.05, 1.2, 0.6);
  barrel(S, 0.95, 1.2, 1.25, 0x9a6233, 0x3a2a24, 0.85);
  add(S.group, rbox(1.2, 0.3, 1.0, 0.1), mat(C.rim), [0, 1.33, 0.75]);
  add(S.group, rbox(0.9, 0.12, 0.7, 0.05), mat(IRON), [0, 1.5, 0.75]);
  add(S.group, torus(0.28, 0.1, 16, 8), mat(0xd9c39a), [-1.0, 1.32, -1.9], [PI / 2, 0, 0]);
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
  foreAftSail(S, S.group, gaff, (d) => {
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
  foreAftSail(S, S.group, claw, (d) => {
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
  flagMesh(S, { p: upEnd.clone().add(V3(0, 0.15, 0)), len: 1.6, h: 0.6, shape: 'pennant', mat: mat(0x1c1820), yaw: -0.3, staff: C.wood, staffDown: 0.05, finial: C.yellow });
  // little hut amidships with a peaked thatch (atap) roof and a ridge pole
  add(S.group, rbox(0.8, 0.45, 1.2, 0.1), mat(0x9b6a3a), [0, 1.38, -1.1]);
  for (const sd of [-1, 1]) add(S.group, rbox(0.74, 0.11, 1.55, 0.05), mat(0xc9a35a), [sd * 0.27, 1.83, -1.1], [0, 0, -sd * 0.62]);
  rod(S.group, sparM, V3(0, 2.07, -1.95), V3(0, 2.07, -0.25), 0.065, 8);
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
    foreAftSail(S, S.group, def, (d) => {
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
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the cartoon model for SHIP_TYPES[typeKey].
 * group.userData = { type, sails: Mesh[], flags: Mesh[], glows: [{material, base, amt, f, ph}],
 *                    fx: [{kind, obj, ...}], cloth: Material[] (player only), phase }
 * Materials are shared toon() materials except userData.glows / userData.cloth
 * (per-ship clones), so don't mutate or dispose the others; see disposeShip().
 */
export function buildShip(typeKey) {
  const T = SHIP_TYPES[typeKey];
  const build = BUILDERS[typeKey];
  if (!T || !build) throw new Error(`buildShip: unknown ship type "${typeKey}"`);
  const group = new THREE.Group();
  group.name = `ship:${typeKey}`;
  const S = { group, sails: [], flags: [], glows: [], glowCache: new Map(), fx: [], cloth: null };
  build(S, T);
  mergeStatic(group);
  group.userData = {
    type: typeKey,
    sails: S.sails,
    flags: S.flags,
    glows: S.glows.map(({ m, base, amt, f, ph }) => ({ material: m, base, amt, f, ph })),
    fx: S.fx,
    cloth: S.cloth || [],
    phase: Math.random() * TAU,
  };
  return group;
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
    s.scale.z = base + luff + breathe;
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
  });
  const u = group.userData || {};
  for (const g of u.glows || []) g.material.dispose();
  for (const m of u.cloth || []) m.dispose();
}
