import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { setOutline, noOutline, gradientMap, ensureIndex } from '../style.js';
import { waveHeight } from '../scenery.js';

// Level 8, "The Cape of Storms" (SPEC3 §5.5): a stormy orange-violet sunset off a green-and-ochre cape.
//
// Map (north = -z, east = +x; the arena is the disc of radius WORLD_R round 0,0):
// - north and north-east: the mainland, stacked ochre sandstone cliffs under a puffy green top, with crashing surf at
//   their feet. The Cape juts south-west into the arena; on its tip stand a red-and-white lighthouse and the
//   keeper's white gabled cottage under a thatched roof, among fynbos bushes and pink proteas. Rolling hills behind,
//   and on the far northern horizon a flat-topped mountain wearing a white tablecloth of cloud
// - west of the middle: the conch-horn tower on its rock, a round stone tower with a giant pink conch shell that
//   looks out to the open sea; it sounds before each rogue wave (rings of sound pour from its mouth)
// - a tall sea stack (the Old Man) off the Cape, a boulder islet full of penguins (more on the boulder beach under
//   the lighthouse), an old wreck on a rock in the south-west, two small rocks
// - south and west: the open sea, where a bruise-violet storm stands on the horizon with the setting sun riding its
//   tops, rain curtains under it, whales spouting far out; albatrosses glide over the arena
//
// Gameplay data (fixed: the layout never depends on ctx.rng):
// - colliders: circles hugging the cliffs' waterline (the shoreline the cliffs are built on), the islets and rocks
// - reefs: none
// - rogueDirs: the bearings rogue waves come FROM (mechanics3.js ROGUE), all from the open sea under the storm: from
//   anywhere in the arena a crest starts in open water and rolls in towards the Cape
// - isLand(x, z) (extra): on the mainland (inside the cliffs' waterline) or on an islet
// - enemySpawns: open water 58-92 from the start, clear of colliders by r + 12, inside worldRadius - 16, ordered so
//   that any prefix is well spread (the first ahead of the start)
// - crateSpots: open water 30-100 from the start, clear of colliders by r + 8, inside worldRadius - 20, spread the
//   same way
//
// Hazards: update(t, dt, { simTime, camera, hazards }) draws the rogue wave of hazards.rogue (mechanics3.js
// visuals()): { id, x, z, h, len, height, t, warning, ... } with (x, z) the middle of the crest and h the heading it
// rolls along. It is a Hokusai curl (the sea's own blues with Hokusai's pale lines, a white foam lip with claws that
// draw back into it as it passes right by the camera) that rises out of the sea as it is launched, rides the swell,
// dies down where it meets land (throwing spray up the rocks) and, once it leaves the snapshot, rolls on and sinks
// away in 1.4 s. While it is a warning (t < warn) a row of pale chevrons on the water ahead of it points the way it
// rolls (glowing up and down once a second), and rings of sound pour from the conch horn. No hazards: nothing is
// drawn.
//
// Draw calls: the land (every cliff, hill, rock and islet) is one vertex-coloured painted mesh, the props one
// outlined vertex-coloured mesh plus one unlit one (windows, the lantern), the far mountains one; the storm, its rain,
// the surf, the lighthouse beam, the creatures (one rig moved on the CPU) and the horn's rings are one mesh each: the
// env alone is about 15 calls (outlined meshes count twice). The rogue wave adds 4 (its crest, outlined, the spray
// and the foam it drags over the sea).

export const meta = {
  name: 'The Cape of Storms',
  subtitle: 'A stormy sunset off the cape. Rogue waves roll in from the open sea.',
};

export const palette = {
  skyTop: 0x4b3a8f,
  skyHorizon: 0xffb38a,
  sunColor: 0xffc89a,
  sunDir: [-0.6, 0.25, 0.5],
  sunIntensity: 2.0,
  hemiSky: 0xffd8c0,
  hemiGround: 0x3a4a6a,
  hemiIntensity: 1.2,
  fogColor: 0xe8a8a0,
  fogNear: 110,
  fogFar: 340,
  waterDeep: 0x1b5c8c,
  waterShallow: 0x3fc7c9,
  waterFoam: 0xffffff,
  waveAmp: 0.9,
  cloudColor: 0xf0d0e0,
  cloudShade: 0x6a4a7a,
  cloudCount: 16,
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
const WORLD_R = 150;
const DEG = Math.PI / 180;
const TOP = 13; // the clifftop
const START = { x: 44, z: 90 }; // (facing the lighthouse)
const LIGHT = { x: 13, z: -57 }; // the lighthouse on the Cape's tip
const COTTAGE = { x: 29, z: -68 };
const FLAG = { x: 6, z: -63 };
// The conch-horn tower's rock: centre, radius, the height of its grassy top; the horn looks out to the open sea.
const HORN = { x: -38, z: 8, r: 7, top: 4.4 };
const HORN_DIR = -58 * DEG; // heading of the conch's mouth
const STACK = { x: -14, z: -30, r: 3.4, h: 18 }; // the Old Man
const PENGUINS = { x: 62, z: 22, r: 5.6 }; // the boulder islet
const BEACH = { x: 33, z: -45, r: 4.6 }; // the boulder beach under the lighthouse
const WRECK = { x: -92, z: 64, r: 4.4 };
const ROCKS = [
  { x: 128, z: -12, r: 3.4, h: 4.2 },
  { x: -104, z: -96, r: 3.8, h: 5 },
];
// Bearings the rogue waves come from (heading convention: x = sin a, z = cos a): west-south-west, south-south-west and
// a little east of south, all under the storm. (Checked: from every open-water point of the arena a crest starts in
// open sea, 70 u out and 86 u with the Lighthouse's full bonus; from the west the Cape's tip would shadow its east bay.)
const ROGUE_FROM = [-70, -30, 10];

// The mainland's waterline, land on the LEFT walking along it: the north coast eastwards, down the Cape's west
// side, round its tip, along its south-east side, then the east coast southwards.
const COAST = [
  [-560, -268], [-450, -244], [-350, -218], [-265, -192], [-200, -172], [-148, -156], [-106, -146], [-70, -140],
  [-44, -134], [-29, -124], [-21, -110], [-16, -96], [-12, -83], [-7, -71], [-2, -61], [4, -52], [11, -47],
  [19, -45], [27, -47], [37, -52], [49, -57], [63, -61], [79, -64], [96, -65], [113, -62], [128, -55], [141, -44],
  [151, -29], [158, -12], [164, 8], [171, 30], [184, 54], [205, 82], [240, 114], [300, 156], [380, 200], [480, 250],
];
// far inland corners closing the land polygon (well beyond the fog and the far plane)
const FAR = [[780, 330], [780, -780], [-780, -780], [-780, -300]];
// Green hills on the mainland: [x, z, r, h] (shrunk at build time to keep clear of the cliff edge).
const HILLS = [
  [44, -102, 26, 9], [80, -118, 34, 15], [22, -138, 26, 10], [128, -108, 34, 13], [-30, -176, 40, 12],
  [-110, -196, 46, 15], [-200, -226, 52, 18], [176, -66, 40, 17], [214, 20, 46, 16], [168, -150, 50, 22],
  [90, -176, 44, 16], [250, 100, 50, 14],
];
// The far mountains on the northern horizon: Table Mountain with its tablecloth, Devil's Peak, Lion's Head.
const TABLE = { x: 70, z: -340, w: 92, d: 30, h: 58 };
const FAR_PEAKS = [
  [182, -326, 38, 56, 'peak'], [-50, -306, 26, 40, 'dome'], [-160, -300, 54, 30, 'hill'], [-280, -290, 60, 26, 'hill'],
  [280, -250, 70, 34, 'hill'], [330, -120, 62, 26, 'hill'], [-390, -300, 70, 22, 'hill'],
];
// The storm on the open-sea horizon: the headings it spans, its distance, the cloud base.
const STORM = { from: -108, to: 16, dist: 440, base: 14 };

// ---------------------------------------------------------------------------
// Colours (the props and the land are baked into vertex colours)
// ---------------------------------------------------------------------------
const C = {
  rock1: 0xa65d35, rock2: 0xcd8642, rock3: 0xe5b062, grass: 0x7cbd4b, grass2: 0x69aa43, grassDry: 0xa8b752,
  granite: 0xaaa3a6, granite2: 0x948c93, graniteLt: 0xc3bcbf, sand: 0xf3d8a0,
  stone: 0xd2c5b2, stone2: 0xbcad9a, wood: 0x9a6a40, woodDark: 0x6b4528,
  white: 0xfaf4ea, red: 0xdd3a3e, redDark: 0x9c2a30, iron: 0x2b2735, glass: 0xfff1a8, gold: 0xffc93c,
  thatch: 0xd8a657, thatchDark: 0xb07e38, shutter: 0x2f7a52, window: 0x2b3866, door: 0x6b4528,
  conch: 0xfadcb8, conchBand: 0xd9814e, conchPink: 0xff8fa8, conchTip: 0xf2c79c, conchLip: 0xffc4cf,
  bush: [0x6f9a45, 0x5d873c, 0x86a957], bushGrey: 0x92a67a, protea: 0xee5d7d, proteaTip: 0xffb3c6, reed: 0xc4873f,
  penguin: 0x262a3b, belly: 0xfbfbf6, beak: 0xffa53a, eye: 0x15131c,
  albatross: 0xfcfcf8, wingTop: 0x3c3846, beakPale: 0xf6c86c,
  whale: 0x3e4c72, whaleBelly: 0xc9d2e6, spout: 0xdff3ff,
  hull: 0x6b4a33, hullDark: 0x4a3123, sail: 0xe6d8bb, flagRed: 0xe63946, flagWhite: 0xfaf4ea, flagTeal: 0x2ec4b6,
  mtn: 0x8a73a6, mtnDark: 0x75618f, mtnTop: 0x9d87b6, cloth: 0xfff6f8, farHill: 0x8c8a96, farHill2: 0x88917f,
};
// Painted marks per land material: [cracks on walls, cracks on flat ground, grass tufts, sand speckles].
const PAINT = {
  rock: [0.42, 0.12, 0, 0],
  rockLt: [0.34, 0.06, 0, 0],
  grass: [0, 0, 0.3, 0],
  granite: [0.26, 0.2, 0, 0.12],
  sand: [0, 0, 0, 0.32],
  far: [0.2, 0, 0, 0],
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const r2 = (v) => Math.round(v * 100) / 100;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const lerp = (a, b, t) => a + (b - a) * t;
function smoothGeo(g) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  const w = mergeVertices(g, 1e-3);
  w.computeVertexNormals();
  return w;
}
function mesh(parent, geom, mat, x = 0, y = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(geom, mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  parent.add(m);
  return m;
}

// Geometries made while the level is built: everything static is baked into a few meshes at the end of build(), so
// every source geometry is disposed there (GEO lives only during one build()).
let GEO = null;
function geo(key, make) {
  let g = GEO.get(key);
  if (!g) {
    g = make();
    GEO.set(key, g);
  }
  return g;
}
const sphere = (w = 14, h = 10) => geo(`sp${w},${h}`, () => new THREE.SphereGeometry(1, w, h));
const cyl = (rt, rb, h, seg = 14) => geo(`cy${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const cone = (r, h, seg = 12) => geo(`co${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg));
const rbox = (w, h, d, r = 0.15) => geo(`rb${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01)));
function lathe(profile, seg = 20) {
  const pts = profile[0][1] > profile[profile.length - 1][1] ? profile.slice().reverse() : profile;
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}
const hillGeo = () => geo('hill', () => lathe([[0, 1], [0.35, 0.97], [0.6, 0.84], [0.8, 0.6], [0.93, 0.32], [1.0, 0.05], [1.02, -0.08]], 26));

// A tube with a varying radius along a polyline of THREE.Vector3 (smooth normals, capped).
function tubeAlong(points, radiusFn, radial = 8) {
  const pos = [];
  const index = [];
  const n = points.length;
  let prevN = null;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const tan = points[Math.min(n - 1, i + 1)].clone().sub(points[Math.max(0, i - 1)]).normalize();
    let nrm;
    if (!prevN) {
      nrm = Math.abs(tan.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      nrm = nrm.sub(tan.clone().multiplyScalar(nrm.dot(tan))).normalize();
    } else {
      nrm = prevN.clone().sub(tan.clone().multiplyScalar(prevN.dot(tan))).normalize();
    }
    prevN = nrm;
    const bin = new THREE.Vector3().crossVectors(tan, nrm);
    const r = radiusFn(i / (n - 1));
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(p.x + (nrm.x * c + bin.x * s) * r, p.y + (nrm.y * c + bin.y * s) * r, p.z + (nrm.z * c + bin.z * s) * r);
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

function makeNoise(seed) {
  const hash = (i, j) => {
    let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  return (x, z) => {
    const i = Math.floor(x);
    const j = Math.floor(z);
    const fx = x - i;
    const fz = z - j;
    const u = fx * fx * (3 - 2 * fx);
    const v = fz * fz * (3 - 2 * fz);
    const a = hash(i, j);
    const b = hash(i + 1, j);
    const c = hash(i, j + 1);
    const d = hash(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
// A lumpy boulder: a sphere pushed in and out by a little value noise (smooth normals for the ink line).
function boulderGeo(seed, amp = 0.15) {
  return geo(`boulder${seed}`, () => {
    const g = new THREE.SphereGeometry(1, 13, 9);
    const noise = makeNoise(seed);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const k = 1 + amp * (noise(x * 2.1 + 5, z * 2.1 + y * 1.3) - 0.5) * 2;
      p.setXYZ(i, x * k, y * k, z * k);
    }
    return smoothGeo(g);
  });
}

// ---- polylines ([x, z] points) ----
function spline(ctrl, step = 2) {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n).map((v) => [v.x, v.z]);
}
// Left-hand normals of an open polyline (pointing inland along the coast).
function leftNormals(line) {
  return line.map((p, i) => {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    return [dz / l, -dx / l];
  });
}
// Wobble a cliff line sideways (fades out near its ends so the joints stay put).
function wobble(line, amp, seed) {
  const n = leftNormals(line);
  let s = 0;
  const total = line.reduce((acc, p, i) => (i ? acc + Math.hypot(p[0] - line[i - 1][0], p[1] - line[i - 1][1]) : 0), 0);
  return line.map((p, i) => {
    if (i) s += Math.hypot(p[0] - line[i - 1][0], p[1] - line[i - 1][1]);
    const fade = Math.min(1, s / 8, (total - s) / 8);
    const w = amp * fade * (0.6 * Math.sin(s * 0.19 + seed) + 0.4 * Math.sin(s * 0.47 + seed * 2.3));
    return [p[0] + n[i][0] * w, p[1] + n[i][1] * w];
  });
}
function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
function insetPoly(poly, d) {
  const sgn = polyArea(poly) < 0 ? 1 : -1;
  const n = poly.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = poly[(i - 1 + n) % n];
    const b = poly[(i + 1) % n];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    const ox = (sgn * -dz) / l;
    const oz = (sgn * dx) / l;
    const dd = typeof d === 'function' ? d(i) : d;
    out.push([poly[i][0] - ox * dd, poly[i][1] - oz * dd]);
  }
  const clean = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = out[j][0] - out[i][0];
    const ez = out[j][1] - out[i][1];
    const px = poly[j][0] - poly[i][0];
    const pz = poly[j][1] - poly[i][1];
    if (ex * px + ez * pz > 0 || clean.length === 0) clean.push(out[i]);
  }
  return clean;
}
function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// A lobed outline round (x, z): an islet's shoreline.
function lobed(x, z, r, ph, n = 28) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + 0.1 * Math.sin(2 * a + ph) + 0.06 * Math.sin(3 * a + ph * 1.3) + 0.03 * Math.sin(6 * a + ph * 2.1));
    pts.push([x + Math.cos(a) * rr, z + Math.sin(a) * rr]);
  }
  return pts;
}
// One rounded "pancake" layer of land: the polygon extruded from y0 to y1 with a soft bevel.
function slab(parent, poly, y0, y1, bevel, material, bevelSegments = 3, warp = null) {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const bt = Math.max(0.05, Math.min(bevel, (y1 - y0) / 2 - 0.05));
  const depth = Math.max(0.02, y1 - y0 - 2 * bt);
  let g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bevel, bevelSegments, steps: 1, curveSegments: 2 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + bt, 0);
  if (warp) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + warp(p.getX(i), p.getY(i), p.getZ(i)));
  }
  g = smoothGeo(g);
  return mesh(parent, g, material);
}
// Stacked strata: layers [{ y0, y1, inset, bevel, mat, wob, shift }] inside the polygon.
function strata(parent, poly, layers, seed = 0, warp = null) {
  for (let k = 0; k < layers.length; k++) {
    const L = layers[k];
    const wob = L.wob ?? 0;
    const inset = (i) => L.inset + L.bevel + wob * (0.5 + 0.5 * Math.sin(i * 0.37 + seed + k * 1.7)) * (0.6 + 0.4 * Math.sin(i * 0.11 + k));
    let pp = insetPoly(poly, inset);
    if (L.shift) pp = pp.map(([x, z]) => [x + L.shift[0], z + L.shift[1]]);
    slab(parent, pp, L.y0, L.y1, L.bevel, L.mat, L.segs ?? 3, warp);
  }
}

// ---------------------------------------------------------------------------
// Baking: while the level is built every mesh carries a stand-in material that only holds its colour, its ink line
// and its painted marks; bake() then merges a group into one vertex-coloured mesh per real material.
// ---------------------------------------------------------------------------
let PM = null;
function pm(color, opts = {}) {
  const line = opts.line ?? true;
  const paint = opts.paint ?? null;
  const key = `${color}|${line}|${paint ? paint.join(',') : ''}`;
  let m = PM.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    m.userData.line = line;
    m.userData.paint = paint;
    PM.set(key, m);
  }
  return m;
}
const landM = (color, paint = PAINT.rock) => pm(color, { paint });
const flat = (color) => pm(color, { line: false });

// Bake every mesh under `group` (but those under a node with userData.keep) into a vertex-coloured mesh for each
// target: `line` (outlined) and, if given, `flat` (no ink line). `paint`: also write the painted-mark weights.
function bake(group, targets, name, paint = false) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const parts = { line: [], flat: [] };
  const victims = [];
  const m4 = new THREE.Matrix4();
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.material || !o.material.isMeshBasicMaterial || !o.material.color) return;
    for (let p = o; p && p !== group; p = p.parent) if (p.userData.keep) return;
    const src = o.geometry;
    const g = src.index && !src.attributes.normal ? src.toNonIndexed() : new THREE.BufferGeometry().copy(src);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    for (const k of Object.keys(g.morphAttributes)) delete g.morphAttributes[k];
    if (!g.attributes.normal) g.computeVertexNormals();
    ensureIndex(g);
    g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
    const c = o.material.color;
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (paint) {
      const w = o.material.userData.paint || [0, 0, 0, 0];
      const pa = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) pa.set(w, i * 4);
      g.setAttribute('aPaint', new THREE.BufferAttribute(pa, 4));
    }
    (o.material.userData.line === false && targets.flat ? parts.flat : parts.line).push(g);
    victims.push(o);
  });
  for (const v of victims) v.parent.remove(v);
  const out = [];
  for (const key of ['line', 'flat']) {
    if (!parts[key].length || !targets[key]) continue;
    const merged = mergeGeometries(parts[key], false);
    for (const g of parts[key]) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, targets[key]);
    m.name = `${name}-${key}`;
    m.matrixAutoUpdate = false;
    group.add(m);
    out.push(m);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Painted detail (as on the Coast of Europe): one tiling texture of hand-drawn marks (R cliff cracks, G grass tufts,
// B sand speckles), projected in world space on three axes, so the land needs no UVs. Marks only darken the colour,
// so the cel bands stay. Made once and kept for the session.
// ---------------------------------------------------------------------------
const PAINT_RES = 512;
const PAINT_TILE = 28; // world units per repeat
let PAINT_TEX = null;
function paintTexture() {
  if (PAINT_TEX) return PAINT_TEX;
  const N = PAINT_RES;
  const ch = [0, 1, 2].map(() => new Float32Array(N * N).fill(1));
  const r = mulberry32(8128);
  const dab = (c, x, y, rad, v = 0) => {
    const R = Math.ceil(rad + 1);
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    for (let py = iy - R; py <= iy + R; py++) {
      for (let px = ix - R; px <= ix + R; px++) {
        const a = Math.min(1, Math.max(0, rad + 0.5 - Math.hypot(px + 0.5 - x, py + 0.5 - y)));
        if (a <= 0) continue;
        const k = (((py % N) + N) % N) * N + (((px % N) + N) % N);
        c[k] = Math.min(c[k], 1 - a * (1 - v));
      }
    }
  };
  const stroke = (c, pts, r0, r1, v = 0) => {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let s = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const l = Math.hypot(bx - ax, by - ay);
      for (let d = 0; d < l; d += 0.5) {
        const t = d / l;
        dab(c, ax + (bx - ax) * t, ay + (by - ay) * t, r0 + (r1 - r0) * ((s + d) / total), v);
      }
      s += l;
    }
  };
  const [R, G, B] = ch;
  // R: zig-zag cracks running down the cliff face, some branching, plus ledges and pits
  for (let k = 0; k < 18; k++) {
    let x = r() * N;
    let y = r() * N;
    const pts = [[x, y]];
    const len = 34 + r() * 80;
    for (let s = 0; s < len;) {
      const seg = 7 + r() * 9;
      x += (r() - 0.5) * 12;
      y -= seg;
      s += seg;
      pts.push([x, y]);
    }
    stroke(R, pts, 2.6, 0.7);
    if (r() < 0.65 && pts.length > 3) {
      const j = 1 + Math.floor(r() * (pts.length - 3));
      const side = r() < 0.5 ? -1 : 1;
      const [bx, by] = pts[j];
      stroke(R, [[bx, by], [bx + side * (6 + r() * 6), by - 8 - r() * 6], [bx + side * (10 + r() * 8), by - 18 - r() * 8]], 1.7, 0.6);
    }
  }
  for (let k = 0; k < 14; k++) {
    const x = r() * N;
    const y = r() * N;
    const l = 18 + r() * 34;
    stroke(R, [[x, y], [x + l * 0.35, y + (r() - 0.5) * 4], [x + l * 0.7, y + (r() - 0.5) * 5], [x + l, y + (r() - 0.5) * 4]], 1.5, 0.6);
  }
  for (let k = 0; k < 26; k++) dab(R, r() * N, r() * N, 1.6 + r() * 1.6, 0.25);
  // G: little three-blade grass tufts
  for (let k = 0; k < 110; k++) {
    const x = r() * N;
    const y = r() * N;
    const l = 7 + r() * 5;
    const tilt = (r() - 0.5) * 0.5;
    for (const a of [-0.55, 0, 0.55]) {
      const aa = a + tilt;
      stroke(G, [[x, y], [x + Math.sin(aa) * l * 0.5, y + Math.cos(aa) * l * 0.55], [x + Math.sin(aa * 1.4) * l, y + Math.cos(aa) * l * (a ? 0.85 : 1.1)]], 1.3, 0.45);
    }
  }
  // B: sand speckles
  for (let k = 0; k < 260; k++) dab(B, r() * N, r() * N, 0.8 + r() * 1.0, 0.3);
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = Math.round(R[i] * 255);
    data[i * 4 + 1] = Math.round(G[i] * 255);
    data[i * 4 + 2] = Math.round(B[i] * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  PAINT_TEX = tex;
  return tex;
}
// The land's material: vertex colours plus the painted marks, weighted per vertex (aPaint).
// `haze` (0..1): how much of the fog a far material takes (the fog alone would wash it out completely).
function makeLandMaterial(name, haze = 1) {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(3), fog: true });
  m.name = name;
  setOutline(m, true);
  const tex = paintTexture();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPaint = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aPaint;\nvarying vec4 vPaint;\nvarying vec3 vPaintPos;\nvarying vec3 vPaintNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaint = aPaint;\nvPaintPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvPaintNrm = normalize(mat3(modelMatrix) * objectNormal);');
    if (haze < 1) sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', `#ifdef USE_FOG
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(fogNear, fogFar, vFogDepth) * ${haze.toFixed(3)});
      #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uPaint;\nvarying vec4 vPaint;\nvarying vec3 vPaintPos;\nvarying vec3 vPaintNrm;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 pn = normalize(vPaintNrm);
          vec3 bw = pow(abs(pn), vec3(4.0));
          bw /= max(1e-4, bw.x + bw.y + bw.z);
          vec3 pp = vPaintPos * ${(1 / PAINT_TILE).toFixed(6)};
          vec3 tX = vec3(1.0) - texture2D(uPaint, pp.zy).rgb;
          vec3 tZ = vec3(1.0) - texture2D(uPaint, pp.xy).rgb;
          vec3 tY = vec3(1.0) - texture2D(uPaint, pp.xz).rgb;
          float side = tX.r * bw.x + tZ.r * bw.z;
          float ink = side * vPaint.x + tY.r * bw.y * vPaint.y
            + (tY.g * bw.y + 0.5 * (tX.g * bw.x + tZ.g * bw.z)) * vPaint.z
            + (tY.b * bw.y + 0.6 * (tX.b * bw.x + tZ.b * bw.z)) * vPaint.w;
          diffuseColor.rgb *= 1.0 - clamp(ink, 0.0, 0.8);
        }`,
      );
  };
  m.customProgramCacheKey = () => `cape-land-v2-${haze.toFixed(3)}`;
  return m;
}
function vcMaterial(outline, fog = true) {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(3), fog });
  setOutline(m, outline);
  return m;
}

// ---------------------------------------------------------------------------
// The sea's swell, mirrored for the shaders that ride it (the surf and the rogue wave's foam). scenery.js keeps its
// wave table private, so this mirrors it (same constants, same rounding); checkWaves() verifies the mirror once.
// ---------------------------------------------------------------------------
const r6 = (v) => Number(v.toFixed(6));
const SEA_WAVES = [
  { deg: 37, len: 52, a: 0.22, ph: 0.0 },
  { deg: 117, len: 33, a: 0.16, ph: 1.3 },
  { deg: -14, len: 22, a: 0.12, ph: 2.7 },
  { deg: 233, len: 16, a: 0.1, ph: 4.1 },
].map(({ deg, len, a, ph }) => {
  const k = (2 * Math.PI) / len;
  const ang = (deg * Math.PI) / 180;
  return { kx: r6(Math.cos(ang) * k), kz: r6(Math.sin(ang) * k), w: r6(0.8 * Math.sqrt(9.8 * k)), a, ph };
});
const glslNum = (v) => {
  const s = Number(v).toFixed(6);
  return s.includes('.') ? s : s + '.0';
};
const WAVE_GLSL = `float waveH(vec2 p, float t, float amp) {
  float h = 0.0;
${SEA_WAVES.map((w) => `  h += ${glslNum(w.a)} * sin(${glslNum(w.kx)} * p.x + ${glslNum(w.kz)} * p.y - ${glslNum(w.w)} * t + ${glslNum(w.ph)});`).join('\n')}
  return h * amp;
}`;
const NOISE_GLSL = `float cHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float cNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), u.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`;
let wavesChecked = false;
function checkWaves() {
  if (wavesChecked) return;
  wavesChecked = true;
  for (const [x, z, t] of [[0, 0, 0], [13.7, -42.1, 3.3], [-97.2, 55.5, 41.9], [120.4, 8.8, 777.7], [-3.1, -131, 12345.6]]) {
    let h = 0;
    for (const w of SEA_WAVES) h += w.a * Math.sin(w.kx * x + w.kz * z - w.w * t + w.ph);
    if (Math.abs(h * 0.9 - waveHeight(x, z, t, 0.9)) > 1e-6) {
      console.error('cape.js: SEA_WAVES no longer matches the waves in scenery.js; update the mirror');
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Rigs: rigid pieces sharing ONE vertex-coloured mesh, each moved by its own matrix on the CPU every frame: the
// penguins, albatrosses, whales and pennants cost 2 draw calls (with their ink line).
// ---------------------------------------------------------------------------
function buildRig(pieces, material, name) {
  const flatParts = [];
  let nv = 0;
  let ni = 0;
  for (const g of pieces) {
    g.updateMatrixWorld(true);
    const parts = [];
    g.traverse((o) => {
      if (!o.isMesh) return;
      const src = o.geometry;
      const geom = src.index && !src.attributes.normal ? src.toNonIndexed() : new THREE.BufferGeometry().copy(src);
      for (const k of Object.keys(geom.attributes)) if (k !== 'position' && k !== 'normal') geom.deleteAttribute(k);
      if (!geom.attributes.normal) geom.computeVertexNormals();
      ensureIndex(geom);
      geom.applyMatrix4(o.matrixWorld);
      parts.push({ geom, color: o.material.color.clone() });
      nv += geom.attributes.position.count;
      ni += geom.index.count;
    });
    flatParts.push(parts);
  }
  const base = new Float32Array(nv * 3);
  const baseN = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
  const ranges = [];
  let v0 = 0;
  let i0 = 0;
  for (const parts of flatParts) {
    const first = v0;
    for (const q of parts) {
      const p = q.geom.attributes.position.array;
      const n = q.geom.attributes.normal.array;
      base.set(p, v0 * 3);
      baseN.set(n, v0 * 3);
      for (let k = 0; k < q.geom.attributes.position.count; k++) q.color.toArray(col, (v0 + k) * 3);
      const ix = q.geom.index.array;
      for (let k = 0; k < ix.length; k++) idx[i0 + k] = ix[k] + v0;
      i0 += ix.length;
      v0 += q.geom.attributes.position.count;
      q.geom.dispose();
    }
    ranges.push([first, v0 - first]);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(base), 3).setUsage(THREE.DynamicDrawUsage));
  geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(baseN), 3).setUsage(THREE.DynamicDrawUsage));
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geom.setIndex(new THREE.BufferAttribute(idx, 1));
  const m = new THREE.Mesh(geom, material);
  m.name = name;
  m.frustumCulled = false; // the pieces move every frame
  m.userData.keep = true;
  const pos = geom.attributes.position.array;
  const nor = geom.attributes.normal.array;
  const e = new Float32Array(16);
  const hidden = new Uint8Array(ranges.length);
  return {
    mesh: m,
    // Hide piece i (all its vertices at the origin, scaled to nothing); a hidden piece costs nothing until set again.
    hide(i) {
      if (hidden[i]) return;
      hidden[i] = 1;
      const [first, count] = ranges[i];
      pos.fill(0, first * 3, (first + count) * 3);
    },
    // Place piece i with the matrix m4 (THREE.Matrix4).
    set(i, m4) {
      hidden[i] = 0;
      const [first, count] = ranges[i];
      m4.toArray(e);
      for (let v = first * 3, end = (first + count) * 3; v < end; v += 3) {
        const x = base[v];
        const y = base[v + 1];
        const z = base[v + 2];
        pos[v] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pos[v + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pos[v + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const nx = baseN[v];
        const ny = baseN[v + 1];
        const nz = baseN[v + 2];
        let ox = e[0] * nx + e[4] * ny + e[8] * nz;
        let oy = e[1] * nx + e[5] * ny + e[9] * nz;
        let oz = e[2] * nx + e[6] * ny + e[10] * nz;
        const l = 1 / (Math.sqrt(ox * ox + oy * oy + oz * oz) || 1);
        ox *= l;
        oy *= l;
        oz *= l;
        nor[v] = ox;
        nor[v + 1] = oy;
        nor[v + 2] = oz;
      }
    },
    commit() {
      geom.attributes.position.needsUpdate = true;
      geom.attributes.normal.needsUpdate = true;
    },
    dispose() {
      geom.dispose();
    },
  };
}

// A penguin: its body stands still (built into `parent` at (x, y, z), facing ry, scaled s); its head (pivot at the
// neck, facing +z) and its left and right flippers (pivot at the shoulder, hanging down) are rig pieces.
const PENGUIN_NECK = 0.98;
const PENGUIN_SHOULDER = [0.38, 0.86, 0];
function penguinBody(parent, x, y, z, ry, s) {
  const body = new THREE.Group();
  body.position.set(x, y, z);
  body.rotation.y = ry;
  body.scale.setScalar(s);
  parent.add(body);
  const b = mesh(body, sphere(12, 9), pm(C.penguin), 0, 0.6, 0);
  b.scale.set(0.4, 0.58, 0.38);
  const belly = mesh(body, sphere(12, 9), pm(C.belly), 0, 0.55, 0.11);
  belly.scale.set(0.33, 0.48, 0.3);
  for (const sx of [-1, 1]) {
    const f = mesh(body, sphere(8, 6), pm(C.beak), sx * 0.12, 0.03, 0.12);
    f.scale.set(0.11, 0.045, 0.17);
  }
}
function penguinPieces() {
  const head = new THREE.Group();
  const hd = mesh(head, sphere(12, 9), pm(C.penguin), 0, 0.19, 0.02);
  hd.scale.set(0.29, 0.28, 0.29);
  const face = mesh(head, sphere(10, 8), pm(C.belly), 0, 0.15, 0.12);
  face.scale.set(0.22, 0.17, 0.2);
  for (const sx of [-1, 1]) mesh(head, sphere(8, 6), pm(C.eye), sx * 0.1, 0.24, 0.26).scale.setScalar(0.05);
  const beak = mesh(head, cone(1, 1, 8), pm(C.beak), 0, 0.13, 0.37);
  beak.rotation.x = Math.PI / 2;
  beak.scale.set(0.07, 0.2, 0.055);
  const flipper = () => {
    const g = new THREE.Group();
    const f = mesh(g, sphere(10, 7), pm(C.penguin), 0, -0.24, 0);
    f.scale.set(0.06, 0.28, 0.15);
    return g;
  };
  return [head, flipper(), flipper()];
}
// An albatross in pieces: the body (facing +z), the left wing (out along +x from the shoulder), the right wing.
function albatrossPieces() {
  const body = new THREE.Group();
  const b = mesh(body, sphere(12, 9), pm(C.albatross), 0, 0, 0);
  b.scale.set(0.38, 0.36, 1.0);
  const hd = mesh(body, sphere(10, 8), pm(C.albatross), 0, 0.12, 0.88);
  hd.scale.setScalar(0.3);
  const bk = mesh(body, cone(1, 1, 8), pm(C.beakPale), 0, 0.06, 1.18);
  bk.rotation.x = Math.PI / 2;
  bk.scale.set(0.07, 0.42, 0.07);
  const tail = mesh(body, sphere(8, 6), pm(C.wingTop), 0, 0.02, -0.92);
  tail.scale.set(0.22, 0.06, 0.3);
  for (const sx of [-1, 1]) mesh(body, sphere(6, 5), pm(C.eye), sx * 0.13, 0.17, 0.97).scale.setScalar(0.045);
  const wing = (sx) => {
    const g = new THREE.Group();
    const w = mesh(g, sphere(14, 7), pm(C.albatross), sx * 1.6, 0, 0.02);
    w.scale.set(1.65, 0.12, 0.5);
    const tip = mesh(g, sphere(12, 6), pm(C.wingTop), sx * 2.6, 0.05, -0.04);
    tip.scale.set(0.75, 0.1, 0.36);
    return g;
  };
  return [body, wing(1), wing(-1)];
}
// A humpback whale in pieces: the body (facing +z, the blowhole at (0, 1.35, 3.4)), the fluke (pivot at the root
// of the tail, lobes trailing -z), and the spout (a V of white puffs rising from its pivot).
function whalePieces() {
  const body = new THREE.Group();
  const b = mesh(body, sphere(16, 10), pm(C.whale), 0, 0, 0);
  b.scale.set(2.0, 1.45, 6.4);
  const hd = mesh(body, sphere(14, 9), pm(C.whale), 0, 0.15, 4.2);
  hd.scale.set(1.7, 1.2, 2.6);
  const jaw = mesh(body, sphere(14, 8), pm(C.whaleBelly), 0, -0.6, 2.4);
  jaw.scale.set(1.75, 0.85, 4.6);
  const fin = mesh(body, cone(1, 1, 8), pm(C.whale), 0, 1.35, -2.8);
  fin.rotation.x = -0.6;
  fin.scale.set(0.25, 0.9, 0.6);
  for (const sx of [-1, 1]) {
    const f = mesh(body, sphere(10, 6), pm(C.whaleBelly), sx * 2.1, -0.5, 2.2);
    f.scale.set(0.35, 0.14, 2.2);
    f.rotation.y = sx * 0.5;
    f.rotation.z = sx * -0.4;
  }
  for (let k = 0; k < 4; k++) mesh(body, sphere(8, 6), pm(C.whaleBelly), (k % 2 ? 0.5 : -0.5) * (0.6 + k * 0.2), 1.12, 4.8 + k * 0.45).scale.setScalar(0.16);
  const fluke = new THREE.Group();
  const stock = mesh(fluke, sphere(12, 8), pm(C.whale), 0, 0, -1.2);
  stock.scale.set(0.8, 0.7, 2.0);
  for (const sx of [-1, 1]) {
    const l = mesh(fluke, sphere(12, 7), pm(C.whale), sx * 1.4, 0, -3.0);
    l.scale.set(1.75, 0.16, 0.85);
    l.rotation.y = sx * -0.35;
  }
  const spout = new THREE.Group();
  for (const [x, y, r] of [[0, 0.9, 0.42], [0.05, 2.0, 0.5], [-0.15, 3.1, 0.6], [0.2, 4.0, 0.62], [-0.85, 4.75, 0.6], [0.9, 4.85, 0.58], [0, 5.35, 0.75], [-1.5, 5.0, 0.42], [1.55, 5.1, 0.4]]) {
    mesh(spout, sphere(10, 7), pm(C.spout), x, y, 0).scale.setScalar(r);
  }
  return [body, fluke, spout];
}
// A pennant on its pole's top (pivot at the hoist, flying out along +x).
function pennantPiece(colA, colB) {
  const g = new THREE.Group();
  const a = mesh(g, geo('pennant', () => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.55);
    s.lineTo(2.6, -0.08);
    s.lineTo(2.6, 0.08);
    s.lineTo(0, 0.55);
    s.lineTo(0, -0.55);
    const eg = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false });
    eg.translate(0, 0, -0.04);
    return eg;
  }), pm(colA), 0, 0, 0);
  a.scale.set(1, 1, 1);
  const b = mesh(g, sphere(8, 6), pm(colB), 0.1, 0, 0);
  b.scale.set(0.16, 0.6, 0.16);
  return g;
}

// ---------------------------------------------------------------------------
// The storm on the open-sea horizon: towering bruise-violet thunderheads with the low sun behind them gilding their
// edges (one mesh, cel-banded by its own shader, which lets only some of the haze in), and the rain curtains hanging
// from their base (one mesh, streaks falling).
// ---------------------------------------------------------------------------
const STORM_VERT = `
varying vec3 vN;
varying vec3 vW;
void main() {
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const STORM_FRAG = `
uniform vec3 uLit;
uniform vec3 uMid;
uniform vec3 uShade;
uniform vec3 uBase;
uniform vec3 uRim;
uniform vec3 uSunDir;
uniform vec3 uHaze;
uniform float uHazeAmount;
uniform float uCloudBase;
varying vec3 vN;
varying vec3 vW;
float edge(float v, float th) {
  float w = max(fwidth(v), 1e-4) * 0.75;
  return smoothstep(th - w, th + w, v);
}
void main() {
  vec3 n = normalize(vN);
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(cameraPosition - vW);
  float scallop = 0.08 * sin(vW.x * 0.09 + vW.z * 0.05) + 0.05 * sin(vW.y * 0.13 - vW.z * 0.07);
  float l = dot(n, L) * 0.5 + n.y * 0.55 + scallop;
  vec3 col = mix(uShade, uMid, edge(l, 0.02));
  col = mix(col, uLit, edge(l, 0.5));
  // the gold lining: the upper edges of the towers standing in front of the low sun
  float sunward = smoothstep(0.2, 0.9, dot(normalize(-V.xz + 1e-4), normalize(L.xz + 1e-4)));
  float rim = pow(1.0 - abs(dot(n, V)), 1.5) * (0.8 + 0.6 * n.y) * (0.45 + 0.55 * sunward);
  col = mix(col, uRim, edge(rim, 0.86) * 0.9);
  // the dark, flat underside over the rain
  col = mix(uBase, col, edge(vW.y - uCloudBase + 4.0 * sin(vW.z * 0.04 + vW.x * 0.03), 7.0));
  gl_FragColor = vec4(mix(col, uHaze, uHazeAmount), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function buildStorm(own) {
  const r = mulberry32(5150);
  const parts = [];
  const n = 30;
  for (let i = 0; i <= n; i++) {
    const a = (STORM.from + ((STORM.to - STORM.from) * i) / n + (r() - 0.5) * 2.5) * DEG;
    const mid = 1 - Math.abs((i / n) * 2 - 1);
    const dist = STORM.dist + r() * 44 - 24 * mid;
    const cx = Math.sin(a) * dist;
    const cz = Math.cos(a) * dist;
    if (r() < 0.12 && i % 2) continue; // a gap between the towers
    const H = (24 + r() * 66) * (0.4 + 0.8 * mid) + 16;
    const base = STORM.base + (r() - 0.5) * 4;
    const nP = 3 + Math.floor(H / 22);
    for (let k = 0; k < nP; k++) {
      const f = k / Math.max(1, nP - 1);
      const rr = (30 - 12 * f) * (0.8 + r() * 0.4);
      const g = new THREE.SphereGeometry(rr, 16, 11);
      const y = base + rr * 0.55 + f * (H - rr * 0.6);
      g.translate(cx + (r() - 0.5) * 18, y, cz + (r() - 0.5) * 18);
      const p = g.attributes.position;
      for (let v = 0; v < p.count; v++) if (p.getY(v) < base) p.setY(v, base + (p.getY(v) - base) * 0.1);
      g.deleteAttribute('uv');
      parts.push(g);
    }
  }
  const geom = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  geom.computeVertexNormals();
  const material = new THREE.ShaderMaterial({
    name: 'cape-storm',
    uniforms: {
      uLit: { value: new THREE.Color(0x8b6aa2) },
      uMid: { value: new THREE.Color(0x5f4682) },
      uShade: { value: new THREE.Color(0x403062) },
      uBase: { value: new THREE.Color(0x2c2247) },
      uRim: { value: new THREE.Color(0xffb27a) },
      uSunDir: { value: new THREE.Vector3().fromArray(palette.sunDir).normalize() },
      uHaze: { value: new THREE.Color(palette.fogColor) },
      uHazeAmount: { value: 0.2 },
      uCloudBase: { value: STORM.base },
    },
    vertexShader: STORM_VERT,
    fragmentShader: STORM_FRAG,
    fog: false,
  });
  noOutline(material);
  own.push(material);
  const m = new THREE.Mesh(geom, material);
  m.name = 'cape-storm';
  m.userData.keep = true;
  m.frustumCulled = false;
  return m;
}
const RAIN_VERT = `
attribute vec3 aRain;
varying vec3 vRain;
void main() {
  vRain = aRain;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const RAIN_FRAG = `
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uHaze;
uniform float uHazeAmount;
varying vec3 vRain;
${NOISE_GLSL}
void main() {
  float s = vRain.x; // metres along the curtain
  float v = vRain.y; // 0 at the sea .. 1 at the cloud base
  float fade = vRain.z; // 0 at the curtain's ends
  float streak = cNoise(vec2(s * 0.55, v * 2.0 + uTime * 0.9)) * 0.6 + cNoise(vec2(s * 1.7, v * 5.0 + uTime * 2.3)) * 0.4;
  float a = (0.3 + 0.3 * smoothstep(0.35, 0.75, streak)) * smoothstep(0.0, 0.25, fade) * (0.5 + 0.5 * smoothstep(0.0, 0.35, v));
  gl_FragColor = vec4(mix(uColor, uHaze, uHazeAmount), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function buildRain(own, timeU) {
  const r = mulberry32(8080);
  const pos = [];
  const att = [];
  const idx = [];
  const curtains = [[-96, 6], [-74, 8], [-58, 5], [-30, 9], [-12, 6], [6, 7]];
  for (const [deg, half] of curtains) {
    const rad = STORM.dist - 34 + r() * 20;
    const top = STORM.base + 6;
    const cols = 18;
    const rows = 4;
    const tilt = (r() - 0.5) * 10;
    const start = pos.length / 3;
    let s = 0;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const a = (deg + (u * 2 - 1) * half) * DEG;
      const wob = Math.sin(u * 9 + deg) * 3;
      if (c) s += (half * 2 * DEG * rad) / cols;
      for (let k = 0; k <= rows; k++) {
        const v = k / rows;
        const rr = rad + wob + tilt * (1 - v);
        pos.push(Math.sin(a) * rr, -1 + v * (top + 1 + 2 * Math.sin(u * 7 + deg)), Math.cos(a) * rr);
        att.push(s, v, Math.sin(Math.PI * u));
      }
    }
    for (let c = 0; c < cols; c++) {
      for (let k = 0; k < rows; k++) {
        const a = start + c * (rows + 1) + k;
        const b = a + rows + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aRain', new THREE.Float32BufferAttribute(att, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({
    name: 'cape-rain',
    uniforms: {
      uTime: timeU,
      uColor: { value: new THREE.Color(0x4f3e74) },
      uHaze: { value: new THREE.Color(palette.fogColor) },
      uHazeAmount: { value: 0.22 },
    },
    vertexShader: RAIN_VERT,
    fragmentShader: RAIN_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  noOutline(material);
  own.push(material);
  const m = new THREE.Mesh(g, material);
  m.name = 'cape-rain';
  m.userData.keep = true;
  m.frustumCulled = false;
  m.renderOrder = 3;
  return m;
}

// ---------------------------------------------------------------------------
// Crashing surf: white bursts of spray thrown up the cliffs and rocks, one camera-facing card each (one mesh; the
// shader grows, holds and breaks each burst on its own beat, so a set of breakers runs along the shore).
// ---------------------------------------------------------------------------
const SURF_VERT = `
attribute vec4 aSurf; // corner x (-1..1), corner y (0..1), phase, period (s)
attribute vec2 aSize; // width, height
uniform float uTime;
varying vec2 vUv;
varying float vK;
varying float vAspect;
varying float vSeed;
#include <common>
#include <fog_pars_vertex>
void main() {
  float k = fract(uTime / aSurf.w + aSurf.z);
  vec3 base = position; // every corner carries the burst's foot
  vec2 d = normalize(cameraPosition.xz - base.xz + 1e-4);
  vec3 right = vec3(d.y, 0.0, -d.x);
  float w = aSize.x;
  float h = aSize.y;
  vec3 p = base + right * aSurf.x * w * 0.5 + vec3(0.0, aSurf.y * h, 0.0);
  vUv = aSurf.xy;
  vK = k;
  vSeed = aSurf.z;
  vAspect = 2.0 * h / max(w, 1e-3);
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const SURF_FRAG = `
uniform vec3 uFoam;
uniform vec3 uShade;
uniform vec3 uRimCol;
varying vec2 vUv;
varying float vK;
varying float vAspect;
varying float vSeed;
#include <common>
#include <fog_pars_fragment>
${NOISE_GLSL}
float blob(vec2 p, vec2 c, float r) { return r - length(p - c); }
void main() {
  float k = vK;
  float alive = 1.0 - smoothstep(0.36, 0.54, k);
  if (alive <= 0.001) discard;
  float A = vAspect;
  vec2 p = vec2(vUv.x, vUv.y * A);
  float burst = smoothstep(0.0, 0.2, k); // the plumes shoot up the rock...
  float erode = smoothstep(0.16, 0.54, k); // ...and break into droplets
  // a low heap of foam at the foot
  float d = (0.62 - length((p - vec2(0.0, 0.05)) * vec2(1.0, 2.4))) / 2.4 * (1.0 - erode * 0.7);
  // three plumes in a fan, each a string of puffs thinning upwards
  for (int j = 0; j < 3; j++) {
    float fj = float(j) - 1.0;
    vec2 dir = normalize(vec2(fj * 0.45 + 0.08 * sin(vSeed * 17.0 + fj), 1.0));
    float reach = A * (j == 1 ? 0.86 : 0.62) * burst;
    for (int n = 0; n < 5; n++) {
      float fn = float(n) / 4.0;
      vec2 c = dir * reach * fn + vec2(0.0, 0.08);
      float r = (0.36 - 0.2 * fn) * (1.0 - erode * (0.3 + 0.6 * fn)) * (0.6 + 0.4 * burst);
      d = max(d, blob(p, c, r));
    }
  }
  d += 0.1 * (cNoise(p * 4.5 + vec2(vSeed * 31.0, k * 2.5)) - 0.5);
  d -= erode * 0.08;
  float fw = max(fwidth(d), 1e-4);
  float a = smoothstep(-fw, fw, d) * alive;
  if (a <= 0.01) discard;
  vec3 col = mix(uShade, uFoam, smoothstep(0.05, 0.5, vUv.y));
  col = mix(col, uRimCol, (1.0 - smoothstep(fw, 2.4 * fw, d)) * 0.5);
  gl_FragColor = vec4(col, a * mix(0.92, 0.7, smoothstep(0.5, 1.0, vUv.y)));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
function buildSurf(spots, own, timeU) {
  const pos = [];
  const surf = [];
  const size = [];
  const idx = [];
  const corners = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
  for (const s of spots) {
    const b = pos.length / 3;
    for (const [cx, cy] of corners) {
      pos.push(s.x, s.y, s.z);
      surf.push(cx, cy, s.phase, s.period);
      size.push(s.w, s.h);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSurf', new THREE.Float32BufferAttribute(surf, 4));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({
    name: 'cape-surf',
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: timeU,
      uFoam: { value: new THREE.Color(0xffffff) },
      uShade: { value: new THREE.Color(0xffd6c8) },
      uRimCol: { value: new THREE.Color(0x9fb2e0) },
    },
    vertexShader: SURF_VERT,
    fragmentShader: SURF_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  noOutline(material);
  own.push(material);
  const m = new THREE.Mesh(g, material);
  m.name = 'cape-surf';
  m.userData.keep = true;
  m.frustumCulled = false;
  m.renderOrder = 2;
  return m;
}

// ---------------------------------------------------------------------------
// The conch horn's sound: three rings pouring out of its mouth (a new one every 0.5 s) while a rogue wave is a
// warning.
// ---------------------------------------------------------------------------
const RING_VERT = `
attribute float aRing;
uniform float uTime;
uniform float uCalm;
varying float vA;
#include <common>
#include <fog_pars_vertex>
void main() {
  float f = fract(uTime / 1.5 + aRing / 3.0); // each ring takes 1.5 s, a new one every 0.5 s
  float g = mix(f, 0.35 + 0.25 * aRing, uCalm); // reduced motion: the rings stay put and only glow (0.67 Hz)
  float r = 1.5 + 4.6 * g;
  vec3 p = vec3(position.xy * r, position.z + 0.5 + 9.0 * g);
  vA = mix((1.0 - f) * smoothstep(0.0, 0.15, f), 0.55 + 0.35 * sin(6.2831853 * (uTime / 1.5 + aRing / 3.0)), uCalm);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const RING_FRAG = `
uniform float uOn;
uniform vec3 uColor;
varying float vA;
#include <common>
#include <fog_pars_fragment>
void main() {
  float a = vA * uOn;
  if (a <= 0.01) discard;
  gl_FragColor = vec4(uColor, a * 0.85);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
function buildHornRings(own, mouth) {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.TorusGeometry(1, 0.075, 6, 40);
    const n = g.attributes.position.count;
    g.setAttribute('aRing', new THREE.Float32BufferAttribute(new Float32Array(n).fill(i), 1));
    g.deleteAttribute('uv');
    parts.push(g);
  }
  const geom = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uTime: { value: 0 },
    uOn: { value: 0 },
    uCalm: { value: 0 },
    uColor: { value: new THREE.Color(0xd6fffb) },
  };
  const material = new THREE.ShaderMaterial({
    name: 'cape-horn-rings',
    uniforms,
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  noOutline(material);
  own.push(material);
  const m = new THREE.Mesh(geom, material);
  m.name = 'cape-horn-rings';
  m.position.copy(mouth.pos);
  m.rotation.set(mouth.tilt, mouth.yaw, 0, 'YXZ');
  m.frustumCulled = false;
  m.visible = false;
  m.renderOrder = 4;
  m.userData.keep = true;
  return { mesh: m, uniforms, geom };
}

// ---------------------------------------------------------------------------
// The rogue wave (drawn from the mechanics' snapshot; see the header).
// The crest is a closed profile (u along its travel, y up) swept across its length; each of its CREST.cols columns
// gets an amplitude every frame (rising out of the sea, tapering at the ends, dying down over land) and rides the
// swell. Its colours come from the profile parameter: a navy back with Hokusai's pale lines, a white lip whose edge
// is scalloped into claws (and real claws curling over), a dark hollow under the lip, a lighter face.
// ---------------------------------------------------------------------------
const CREST = {
  cols: 61,
  span: 120,
  height: 7.2,
  rise: 1.3, // s to rise out of the sea
  sink: 1.4, // s to sink once it has gone
  spray: 140,
  // the closed profile: [u, y] (travel to +u), from the back's foot up over the top, round the lip, down the face
  ctrl: [
    [-17, -0.9], [-11, 0.5], [-6.5, 2.4], [-3.2, 4.6], [-0.6, 6.4], [1.6, 7.2], [3.9, 7.0], [5.7, 6.0], [6.3, 4.6],
    [5.5, 3.8], [4.4, 4.2], [3.5, 3.6], [3.4, 2.2], [4.4, 0.9], [6.4, -0.1], [8.5, -0.9], [0, -1.7],
  ],
};
// The crest ducks out of the camera's way (createRogueView): it never stands between the camera and what it looks
// at (your ship), nor engulfs the camera.
// - near the camera (within `nearAlong` .. `nearFade` u along the wave's travel, `nearAcross` u across it), its top
//   stays `margin` u under the camera;
// - in front of the camera, within `half` u of its line of sight (a gaussian), every point of its profile (back,
//   top and lip) stays under the line from `margin` u under the camera down to the sea at `shipK` × the distance
//   where the camera's centre ray meets the sea (`seaY`): for the game's chase camera (10 up, 17 behind you,
//   looking 8 u past you) that is your ship's waterline, so the crest dips under your ship as it rolls past her
//   and stands up again `beyond` u past her.
const VIEW = { margin: 3.5, nearAlong: 10, nearFade: 22, nearAcross: 10, half: 12, seaY: 1.5, shipK: 0.7, minL: 8, maxL: 60, beyond: 4 };
// the profile's points that stand 1.5 u or more out of the sea, flat [u, y, u, y, ...] (VIEW's line-of-sight test)
const VIEW_PROFILE = CREST.ctrl.filter(([, y]) => y >= 1.5).flat();
const CREST_M = CREST.ctrl.length;
const CREST_SUB = 3; // samples per profile segment
// the profile parameter (in control-point units) of the foam lip: the claws and knobs are painted with it
const CREST_FOAM_K = 7;

function buildCrestTemplate() {
  const curve = new THREE.CatmullRomCurve3(CREST.ctrl.map(([u, y]) => new THREE.Vector3(0, y, u)), true, 'centripetal');
  const N = CREST_M * CREST_SUB;
  const ring = [];
  for (let j = 0; j < N; j++) ring.push(curve.getPoint(j / N));
  const cols = CREST.cols;
  const half = CREST.span / 2;
  const pos = [];
  const att = [];
  const idx = [];
  for (let i = 0; i < cols; i++) {
    const s = -half + (CREST.span * i) / (cols - 1);
    for (let j = 0; j < N; j++) {
      pos.push(s, ring[j].y, ring[j].z);
      att.push((j / N) * CREST_M, s);
    }
  }
  for (let i = 0; i < cols - 1; i++) {
    for (let j = 0; j < N; j++) {
      const a = i * N + j;
      const b = i * N + ((j + 1) % N);
      const c = (i + 1) * N + j;
      const d = (i + 1) * N + ((j + 1) % N);
      idx.push(a, b, c, b, d, c);
    }
  }
  const bodyG = new THREE.BufferGeometry();
  bodyG.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bodyG.setIndex(idx);
  bodyG.computeVertexNormals();
  // make sure the body's normals face out (the top of the crest must face up)
  const top = 5 * CREST_SUB + (cols >> 1) * N;
  if (bodyG.attributes.normal.getY(top) < 0) {
    for (let k = 0; k < idx.length; k += 3) {
      const t = idx[k + 1];
      idx[k + 1] = idx[k + 2];
      idx[k + 2] = t;
    }
    bodyG.setIndex(idx);
    bodyG.computeVertexNormals();
  }
  bodyG.setAttribute('aCrest', new THREE.Float32BufferAttribute(att, 2));
  // aClaw (read on the CPU only): 1 and the claw's root for a claw's vertices, zeros for the body
  bodyG.setAttribute('aClaw', new THREE.Float32BufferAttribute(new Float32Array(bodyG.attributes.position.count * 4), 4));
  const parts = [bodyG];
  // the claws: short white fingers curling forward and down off the lip
  const r = mulberry32(777);
  for (let s = -half + 10; s <= half - 10; s += 4.2 + r() * 1.6) {
    const f = 0.46 + r() * 0.28;
    const x0 = s + (r() - 0.5) * 0.8;
    const path = [[5.2, 6.1], [6.5, 6.0], [7.5, 5.5], [7.85, 4.8], [7.55, 4.3], [7.1, 4.25]].map(([u, y], k) =>
      new THREE.Vector3(x0 + (r() - 0.5) * 0.12 * k, 6.1 + (y - 6.1) * f, 5.2 + (u - 5.2) * f),
    );
    const g = tubeAlong(path, (t) => (0.62 - 0.55 * t) * f, 7);
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 2);
    for (let k = 0; k < n; k++) {
      a[k * 2] = CREST_FOAM_K;
      a[k * 2 + 1] = x0;
    }
    g.setAttribute('aCrest', new THREE.BufferAttribute(a, 2));
    const root = new Float32Array(n * 4);
    for (let k = 0; k < n; k++) root.set([1, path[0].x, path[0].y, path[0].z], k * 4);
    g.setAttribute('aClaw', new THREE.BufferAttribute(root, 4));
    parts.push(g);
  }
  for (const g of parts) ensureIndex(g);
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}
function makeCrestMaterial() {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(3) });
  m.name = 'cape-crest';
  setOutline(m, true);
  const U = {
    uDeep: { value: new THREE.Color(0x1b4a78) },
    uBody: { value: new THREE.Color(0x2a6ea6) },
    uTopCol: { value: new THREE.Color(0x7fd3ea) },
    uFoam: { value: new THREE.Color(0xffffff) },
    uCurl: { value: new THREE.Color(0x163f66) },
    uFace: { value: new THREE.Color(0x2b82b0) },
    uToe: { value: new THREE.Color(0x5bbcd6) },
    uLine: { value: new THREE.Color(0xa8ecf6) },
    // The sunset light is warm (it would turn the water grey-green): the crest takes only part of it and lights
    // itself the rest of the way with a cool light of its own, so its lit side shows the sea's own colours and
    // its shaded side a cooler, darker band (like the unlit ocean round it).
    uLitK: { value: 0.7 },
    uSelf: { value: new THREE.Vector3(0.3, 0.55, 0.7) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aCrest;\nvarying vec2 vCrest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCrest = aCrest;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCrest;\nuniform vec3 uDeep, uBody, uTopCol, uFoam, uCurl, uFace, uToe, uLine, uSelf;\nuniform float uLitK;')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float k = vCrest.x;
        float s = vCrest.y;
        float fk = max(fwidth(k), 1e-4);
        vec3 c = mix(uDeep, uBody, smoothstep(1.0, 2.6, k));
        c = mix(c, uTopCol, smoothstep(3.2, 4.8, k));
        // Hokusai's pale lines combed along the back of the wave
        float ln = fract((k - 1.4) * 1.3 + 0.1 * sin(s * 0.31) + 0.05 * sin(s * 0.9));
        float lw = max(fwidth(ln), 1e-4);
        float lmask = smoothstep(1.3, 1.6, k) * (1.0 - smoothstep(5.0, 5.3, k));
        c = mix(c, uLine, lmask * (1.0 - smoothstep(lw, 2.2 * lw, min(ln, 1.0 - ln))) * 0.8);
        // under the lip: the dark hollow, then the face (lined too) and the toe
        vec3 under = mix(uCurl, uFace, smoothstep(11.2, 12.8, k));
        float fl = fract((k - 11.6) * 1.6 + 0.24 * sin(s * 0.21 + 1.0) + 0.1 * sin(s * 0.63));
        float fw2 = max(fwidth(fl), 1e-4);
        under = mix(under, uLine, smoothstep(11.8, 12.2, k) * (1.0 - smoothstep(13.6, 13.9, k)) * (1.0 - smoothstep(fw2, 2.2 * fw2, min(fl, 1.0 - fl))) * 0.6);
        under = mix(under, uToe, smoothstep(13.4, 14.8, k));
        under = mix(under, uDeep, smoothstep(15.4, 16.4, k));
        c = mix(c, under, smoothstep(9.55 - fk, 9.55 + fk, k));
        // the white lip, its edge scalloped into claws
        float fe = 6.05 + 0.3 * sin(s * 1.7) + 0.18 * sin(s * 4.1 + 1.3);
        float foam = smoothstep(fe - fk, fe + fk, k) * (1.0 - smoothstep(9.55 - fk, 9.55 + fk, k));
        c = mix(c, uFoam, foam);
        vec4 diffuseColor = vec4(c * uLitK, opacity);`,
      )
      // (its own cool light: see uSelf)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += c * uSelf;');
  };
  m.customProgramCacheKey = () => 'cape-crest-v3';
  return m;
}

// The foam the crest drags over the sea: a wake of streaks behind it, a ruffle at both its feet, a dark trough
// ahead of it and, while it is a warning, pale chevrons on the water ahead pointing the way it rolls (1 Hz glow).
const TRAIL_VERT = `
uniform float uTime;
uniform float uSea;
uniform float uSpan;
uniform float uAmps[${CREST.cols}];
varying vec2 vLoc;
varying vec2 vWorld;
varying float vA;
#include <common>
#include <fog_pars_vertex>
${WAVE_GLSL}
void main() {
  vec4 wp = modelMatrix * vec4(position.x, 0.0, position.z, 1.0);
  wp.y = waveH(wp.xz, uTime, uSea) + 0.12;
  float cf = clamp((position.x / uSpan + 0.5) * ${CREST.cols - 1}.0, 0.0, ${CREST.cols - 1}.0);
  int i0 = int(floor(cf));
  int i1 = min(i0 + 1, ${CREST.cols - 1});
  vA = mix(uAmps[i0], uAmps[i1], cf - float(i0));
  vLoc = position.xz;
  vWorld = wp.xz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const TRAIL_FRAG = `
uniform float uTime;
uniform float uWarn;
uniform vec2 uDir;
uniform vec3 uFoam;
uniform vec3 uTrough;
uniform vec3 uMark;
uniform float uCalm;
varying vec2 vLoc;
varying vec2 vWorld;
varying float vA;
#include <common>
#include <fog_pars_fragment>
${NOISE_GLSL}
void main() {
  float A = vA;
  if (A < 0.01) discard;
  float u = vLoc.y;
  float su = 0.38 + 0.62 * A;
  float ub = -13.6 * su; // where the back meets the sea
  float uf = 6.1 * su; // where the face meets the sea
  vec2 lat = vec2(uDir.y, -uDir.x);
  float wu = dot(vWorld, uDir);
  float ws = dot(vWorld, lat);
  vec3 col = uFoam;
  float a = 0.0;
  // the wake: long streaks left on the water, fading out behind
  float back = smoothstep(ub - 22.0, ub - 0.5, u) * (1.0 - smoothstep(ub - 0.5, ub + 0.5, u));
  float n = cNoise(vec2(ws * 0.32, wu * 0.045)) * 0.65 + cNoise(vec2(ws * 0.9, wu * 0.12) + 4.1) * 0.35;
  float fn = max(fwidth(n), 1e-4);
  float streak = smoothstep(0.56 - fn, 0.56 + fn, n + 0.18 * smoothstep(ub - 8.0, ub, u));
  a = max(a, streak * back * 0.85);
  // the ruffles at the feet of the wave
  float sc = 0.45 * sin(ws * 1.3 + 0.7) + 0.3 * sin(ws * 3.1 - wu * 0.2);
  float rb = 1.5 + 0.6 * sc - abs(u - ub);
  float rf = 1.1 + 0.5 * sc - abs(u - uf);
  float fr = max(fwidth(rb), 1e-4);
  float ruff = max(smoothstep(-fr, fr, rb), smoothstep(-fr, fr, rf));
  a = max(a, ruff * 0.95);
  // ahead: the trough (the sea draws back before the wave) and, while it is a warning, a row of pale chevrons
  // pointing the way it rolls, glowing up and down once a second (steady under reduced motion)
  float ahead = smoothstep(uf + 0.8, uf + 2.0, u) * (1.0 - smoothstep(uf + 9.0, uf + 12.0, u));
  float cell = fract(vLoc.x / 7.0) - 0.5;
  float du = u - uf - 3.0 + abs(cell) * 4.9;
  float sw = max(fwidth(du), 1e-4);
  float chev = 1.0 - smoothstep(0.55 - sw, 0.55 + sw, abs(du - 2.2));
  chev *= (1.0 - smoothstep(0.36, 0.44, abs(cell))) * smoothstep(uf + 2.0, uf + 3.0, u) * (1.0 - smoothstep(uf + 9.0, uf + 10.5, u));
  float pulse = uWarn * mix(0.6 + 0.4 * sin(6.2831853 * uTime), 0.85, uCalm);
  vec3 aheadCol = mix(uTrough, uMark, step(0.01, chev * uWarn));
  float aheadA = max(ahead * 0.3, chev * pulse * 0.95);
  col = mix(aheadCol, col, step(0.001, a));
  a = max(a, aheadA);
  a *= smoothstep(0.02, 0.25, A);
  if (a <= 0.01) discard;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
function trailGeometry() {
  const half = CREST.span / 2 + 2;
  const cols = CREST.cols + 2;
  const u0 = -38;
  const u1 = 20;
  const rows = 30;
  const pos = [];
  const idx = [];
  for (let i = 0; i < cols; i++) {
    const s = -half + ((2 * half) * i) / (cols - 1);
    for (let k = 0; k <= rows; k++) pos.push(s, 0, u0 + ((u1 - u0) * k) / rows);
  }
  for (let i = 0; i < cols - 1; i++) {
    for (let k = 0; k < rows; k++) {
      const a = i * (rows + 1) + k;
      const b = a + rows + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// A blob of spray: a round icosahedron (round even right by the camera), each face white on the side the low sun
// and the sky light, pale blue on its shaded belly (one colour per face: a crisp cel band).
function sprayGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const L = new THREE.Vector3().fromArray(palette.sunDir).normalize().add(new THREE.Vector3(0, 1.1, 0)).normalize();
  const lit = new THREE.Color(0xf6fbff);
  const shade = new THREE.Color(0xc6d6f0);
  const c = new THREE.Vector3();
  for (let f = 0; f < p.count; f += 3) {
    c.set(p.getX(f) + p.getX(f + 1) + p.getX(f + 2), p.getY(f) + p.getY(f + 1) + p.getY(f + 2), p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2));
    const tone = c.normalize().dot(L) > -0.15 ? lit : shade;
    for (let k = 0; k < 3; k++) tone.toArray(col, (f + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

// Read the rogue wave of the snapshot: { id, x, z, h, len, height, t, warning, speed } or null (never throws).
function readRogue(w) {
  try {
    return readRogueRaw(w);
  } catch {
    return null;
  }
}
function readRogueRaw(w) {
  if (Array.isArray(w)) w = w[0];
  if (!w || typeof w !== 'object' || !finite(w.x) || !finite(w.z)) return null;
  let h = finite(w.h) ? w.h : finite(w.from) ? w.from + Math.PI : null;
  if (h === null) return null;
  h = Math.atan2(Math.sin(h), Math.cos(h));
  const t = finite(w.t) ? Math.max(0, w.t) : null;
  return {
    id: w.id ?? null,
    x: w.x,
    z: w.z,
    h,
    len: finite(w.len) && w.len > 1 ? w.len : CREST.span,
    height: finite(w.height) && w.height > 0.5 ? w.height : 7,
    speed: finite(w.speed) ? w.speed : 16,
    t,
    warning: w.warning === true || (w.warning == null && finite(w.t) && finite(w.warn) && w.t < w.warn),
  };
}

function createRogueView(root, own, land, reduced, ampU) {
  const tmpl = buildCrestTemplate();
  const nV = tmpl.attributes.position.count;
  const tPos = tmpl.attributes.position.array.slice();
  const tNor = tmpl.attributes.normal.array.slice();
  const tClaw = tmpl.attributes.aClaw.array.slice();
  const half = CREST.span / 2;
  const colOf = new Float32Array(nV);
  for (let v = 0; v < nV; v++) colOf[v] = clamp01((tPos[v * 3] + half) / CREST.span) * (CREST.cols - 1);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tPos), 3).setUsage(THREE.DynamicDrawUsage));
  geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(tNor), 3).setUsage(THREE.DynamicDrawUsage));
  geom.setAttribute('aCrest', tmpl.attributes.aCrest);
  geom.setIndex(tmpl.index);
  const crestMat = makeCrestMaterial();
  own.push(crestMat);
  const crest = new THREE.Mesh(geom, crestMat);
  crest.name = 'cape-rogue-crest';
  crest.frustumCulled = false;
  crest.visible = false;
  crest.userData.keep = true;
  root.add(crest);
  // the spray: white blobs thrown off the lip and up the rocks, each with a cool shaded belly (a cel band, so a
  // blob close to the camera still reads as a ball of foam, not a flat white disc)
  const sprayGeo = sprayGeometry();
  const sprayMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  noOutline(sprayMat);
  own.push(sprayMat);
  const spray = new THREE.InstancedMesh(sprayGeo, sprayMat, CREST.spray);
  spray.name = 'cape-rogue-spray';
  spray.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  spray.frustumCulled = false;
  spray.count = 0;
  spray.visible = false;
  spray.userData.keep = true;
  root.add(spray);
  // the foam on the sea
  const amps = new Float32Array(CREST.cols);
  const trailU = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uTime: { value: 0 },
    uSea: ampU,
    uSpan: { value: CREST.span },
    uAmps: { value: amps },
    uWarn: { value: 0 },
    uDir: { value: new THREE.Vector2(0, 1) },
    uFoam: { value: new THREE.Color(0xfff6f2) },
    uTrough: { value: new THREE.Color(0x0f2f55) },
    uMark: { value: new THREE.Color(0xeafffb) },
    uCalm: { value: 0 },
  };
  const trailMat = new THREE.ShaderMaterial({ name: 'cape-rogue-foam', uniforms: trailU, vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG, transparent: true, depthWrite: false, fog: true });
  noOutline(trailMat);
  own.push(trailMat);
  const trailGeo = trailGeometry();
  const trail = new THREE.Mesh(trailGeo, trailMat);
  trail.name = 'cape-rogue-foam';
  trail.frustumCulled = false;
  trail.visible = false;
  trail.renderOrder = 2;
  trail.userData.keep = true;
  root.add(trail);

  const P = { x: new Float32Array(CREST.spray), y: new Float32Array(CREST.spray), z: new Float32Array(CREST.spray), vx: new Float32Array(CREST.spray), vy: new Float32Array(CREST.spray), vz: new Float32Array(CREST.spray), age: new Float32Array(CREST.spray), life: new Float32Array(CREST.spray), size: new Float32Array(CREST.spray), g: new Float32Array(CREST.spray) };
  const PARR = Object.values(P);
  let alive = 0;
  const rnd = mulberry32(4711);
  const land0 = new Float32Array(CREST.cols); // 0 over land .. 1 in open water
  const crash = new Float32Array(CREST.cols);
  const surfB = new Float32Array(CREST.cols);
  const surfM = new Float32Array(CREST.cols);
  const surfF = new Float32Array(CREST.cols);
  const clawK = new Float32Array(CREST.cols); // 1: full claws .. 0: drawn back into the lip (right by the camera)
  let cur = null;
  let emitAcc = 0;
  const near = [];
  // Shader warm-up: until the first few updates the three meshes are drawn once, deep under the sea and empty, so
  // their programs compile during the level's fly-in instead of when the first wave rolls in mid-fight.
  let warm = 3;
  crest.visible = true;
  crest.position.set(0, -40, 0);
  trail.visible = true;
  trail.position.set(0, -40, 0);
  spray.visible = true;
  spray.count = 1;
  spray.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, -40, 0));
  const m4 = new THREE.Matrix4();
  const qI = new THREE.Quaternion();
  const vP = new THREE.Vector3();
  const vS = new THREE.Vector3();
  const vDir = new THREE.Vector3();

  function emit(x, y, z, vx, vy, vz, life, size, g) {
    if (alive >= CREST.spray) return;
    const i = alive++;
    P.x[i] = x;
    P.y[i] = y;
    P.z[i] = z;
    P.vx[i] = vx;
    P.vy[i] = vy;
    P.vz[i] = vz;
    P.age[i] = 0;
    P.life[i] = life;
    P.size[i] = size;
    P.g[i] = g;
  }
  function hide() {
    crest.visible = false;
    spray.visible = false;
    trail.visible = false;
    alive = 0;
    spray.count = 0;
  }

  function update(t, step, snap, camera, calm) {
    const w = readRogue(snap);
    if (w) {
      if (!cur || (w.id !== null && cur.id !== w.id)) {
        cur = { id: w.id, x: w.x, z: w.z, h: w.h, speed: w.speed, own: 0, t: 0, sink: 1, live: true };
        alive = 0;
      }
      cur.x = w.x;
      cur.z = w.z;
      cur.h = w.h;
      cur.len = w.len;
      cur.height = w.height;
      cur.speed = w.speed;
      cur.own += step;
      cur.t = w.t ?? cur.own;
      cur.warning = w.warning;
      cur.live = true;
      cur.sink = 1;
    } else if (cur) {
      // gone from the snapshot: it rolls on and sinks away by itself (visual only)
      cur.live = false;
      cur.warning = false;
      cur.sink -= step / CREST.sink;
      cur.x += Math.sin(cur.h) * cur.speed * step;
      cur.z += Math.cos(cur.h) * cur.speed * step;
      cur.t += step;
      if (cur.sink <= 0) {
        cur = null;
        hide();
        return null;
      }
    } else {
      if (warm > 0) {
        warm--;
        return null;
      }
      if (crest.visible || spray.visible || trail.visible) hide();
      return null;
    }
    const ux = Math.sin(cur.h);
    const uz = Math.cos(cur.h);
    const lx = uz; // the crest runs across its travel: local +x = (cos h, -sin h)
    const lz = -ux;
    const lenK = cur.len / CREST.span;
    const hK = cur.height / 7;
    const rise = smooth(0, CREST.rise, cur.t);
    const sinkK = cur.live ? 1 : smooth(0, 1, cur.sink);
    const amp = ampU.value;
    // a camera low over the crest: the columns round it duck under it (so it never looks out from inside the wave)
    let camS = 0;
    let camK = 0;
    let camY = 99;
    // and the columns in its line of sight duck under the view of your ship (VIEW)
    let view = false;
    let camX = 0;
    let camZ = 0;
    let fwx = 0;
    let fwz = 0;
    let shipF = 0;
    if (camera && camera.position) {
      const dx = camera.position.x - cur.x;
      const dz = camera.position.z - cur.z;
      const cu = dx * ux + dz * uz;
      camS = dx * lx + dz * lz;
      camY = camera.position.y;
      camX = camera.position.x;
      camZ = camera.position.z;
      camK = (1 - smooth(VIEW.nearAlong, VIEW.nearFade, Math.abs(cu))) * (1 - smooth(CREST.height * hK + VIEW.margin, CREST.height * hK + VIEW.margin + 2, camY));
      if (typeof camera.getWorldDirection === 'function') {
        camera.getWorldDirection(vDir);
        const hl = Math.hypot(vDir.x, vDir.z);
        const down = -vDir.y;
        if (hl > 1e-3 && down > 1e-3 && camY > VIEW.margin && Number.isFinite(down / hl)) {
          fwx = vDir.x / hl;
          fwz = vDir.z / hl;
          shipF = VIEW.shipK * Math.min(VIEW.maxL, Math.max(VIEW.minL, (camY - VIEW.seaY) / (down / hl)));
          view = true;
        }
      }
    }
    // land near the crest (for the die-down and the crash spray)
    near.length = 0;
    for (const c of land) if (Math.hypot(c.x - cur.x, c.z - cur.z) < c.r + CREST.span * 0.5 * lenK + 12) near.push(c);
    let total = 0;
    for (let i = 0; i < CREST.cols; i++) {
      const s = (-half + (CREST.span * i) / (CREST.cols - 1)) * lenK;
      const px = cur.x + lx * s;
      const pz = cur.z + lz * s;
      let d = 1e9;
      for (const c of near) d = Math.min(d, Math.hypot(px - c.x, pz - c.z) - c.r);
      land0[i] = smooth(-1.5, 7, d);
      crash[i] = d < 7 && d > -9 ? 1 - land0[i] * 0.85 : 0;
      const edgeK = smooth(half, half - 18, Math.abs(s / lenK)) * (0.84 + 0.16 * Math.cos((Math.PI * s) / (half * lenK)));
      const ripple = calm ? 0 : 0.07 * Math.sin(s * 0.17 + t * 0.9) + 0.04 * Math.sin(s * 0.41 - t * 1.7);
      let a = Math.max(0, rise * sinkK * edgeK * land0[i] * (1 + ripple));
      if (camK > 0) {
        const g = Math.exp(-(((s - camS) / VIEW.nearAcross) ** 2)) * camK;
        const cap = clamp01((camY - VIEW.margin - waveHeight(px, pz, t, amp)) / (CREST.height * hK));
        if (a > cap) a = lerp(a, cap, g);
      }
      if (view && a > 0) {
        // every point of the column's profile (its back, top and lip, spread along the travel as the template is)
        // in front of the camera and short of your ship keeps under the line of sight
        const su = 0.38 + 0.62 * a;
        const sw = waveHeight(px, pz, t, amp);
        for (let k = 0; k < VIEW_PROFILE.length; k += 2) {
          const u = VIEW_PROFILE[k] * su;
          const qx = px + ux * u - camX;
          const qz = pz + uz * u - camZ;
          const f = qx * fwx + qz * fwz;
          const side = qz * fwx - qx * fwz;
          const g = smooth(-4, 0, f) * (1 - smooth(shipF, shipF + VIEW.beyond, f)) * Math.exp(-((side / VIEW.half) ** 2));
          if (g < 1e-3) continue;
          const top = (camY - VIEW.margin) * Math.max(0, 1 - f / shipF);
          const cap = clamp01((top - sw) / (VIEW_PROFILE[k + 1] * hK));
          if (a > cap) a = lerp(a, cap, g);
        }
      }
      amps[i] = a;
      total += a;
      // the swell under the back, the top and the face of this column
      const su = 0.38 + 0.62 * a;
      surfB[i] = waveHeight(px - ux * 12 * su, pz - uz * 12 * su, t, amp);
      surfM[i] = waveHeight(px, pz, t, amp);
      surfF[i] = waveHeight(px + ux * 6 * su, pz + uz * 6 * su, t, amp);
      // the claws draw back into the lip as it passes right by the camera (no giant fingers filling the screen)
      if (camera && camera.position) {
        const cx = camera.position.x - (px + ux * 6 * su);
        const cz = camera.position.z - (pz + uz * 6 * su);
        const cy = camY - 6 * a * hK;
        clawK[i] = smooth(9, 24, Math.sqrt(cx * cx + cy * cy + cz * cz));
      } else clawK[i] = 1;
    }
    // the crest: every vertex from the template, its column's amplitude and the swell
    const pos = geom.attributes.position.array;
    const nor = geom.attributes.normal.array;
    for (let v = 0; v < nV; v++) {
      const cf = colOf[v];
      const i0 = Math.floor(cf);
      const i1 = Math.min(CREST.cols - 1, i0 + 1);
      const f = cf - i0;
      const a = amps[i0] + (amps[i1] - amps[i0]) * f;
      const su = 0.38 + 0.62 * a;
      const k3 = v * 3;
      let tx = tPos[k3];
      let ty = tPos[k3 + 1];
      let tz = tPos[k3 + 2];
      if (tClaw[v * 4] > 0) {
        const ck = clawK[i0] + (clawK[i1] - clawK[i0]) * f;
        if (ck < 1) {
          const rx = tClaw[v * 4 + 1];
          const ry = tClaw[v * 4 + 2];
          const rz = tClaw[v * 4 + 3];
          tx = rx + (tx - rx) * ck;
          ty = ry + (ty - ry) * ck;
          tz = rz + (tz - rz) * ck;
        }
      }
      const z = tz * su;
      const sm = surfM[i0] + (surfM[i1] - surfM[i0]) * f;
      const sb = surfB[i0] + (surfB[i1] - surfB[i0]) * f;
      const sf = surfF[i0] + (surfF[i1] - surfF[i0]) * f;
      const surf = z < 0 ? lerp(sm, sb, clamp01(-z / (12 * su))) : lerp(sm, sf, clamp01(z / (6 * su)));
      pos[k3] = tx * lenK;
      pos[k3 + 1] = ty * a * hK + surf - 0.9 * (1 - a);
      pos[k3 + 2] = z;
      const nx = a * su * tNor[k3];
      const ny = su * tNor[k3 + 1];
      const nz = a * tNor[k3 + 2];
      const l = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
      nor[k3] = nx * l;
      nor[k3 + 1] = ny * l;
      nor[k3 + 2] = nz * l;
    }
    geom.attributes.position.needsUpdate = true;
    geom.attributes.normal.needsUpdate = true;
    crest.position.set(cur.x, 0, cur.z);
    crest.rotation.y = cur.h;
    crest.visible = total > 0.05;
    trail.position.copy(crest.position);
    trail.rotation.y = cur.h;
    trail.visible = crest.visible;
    trailU.uTime.value = t;
    trailU.uDir.value.set(ux, uz);
    trailU.uWarn.value = cur.warning ? 1 : Math.max(0, trailU.uWarn.value - step * 2);
    trailU.uCalm.value = calm ? 1 : 0;
    // the spray: off the lip (more as the wave is taller) and up the rocks where it crashes
    const mean = total / CREST.cols;
    emitAcc += step * (calm ? 14 : 34) * mean;
    let crashSum = 0;
    for (let i = 0; i < CREST.cols; i++) crashSum += crash[i] * rise * sinkK;
    emitAcc += step * (calm ? 4 : 10) * crashSum;
    let guard = 0;
    while (emitAcc >= 1 && guard++ < 40) {
      emitAcc -= 1;
      const fromCrash = rnd() * (34 * mean + 10 * crashSum) >= 34 * mean;
      let i = Math.floor(rnd() * CREST.cols);
      if (fromCrash) {
        // a column where the wave meets land
        for (let tries = 0; tries < 12 && !(crash[i] > 0.2); tries++) i = Math.floor(rnd() * CREST.cols);
        if (!(crash[i] > 0.2)) continue;
        const s = (-half + (CREST.span * i) / (CREST.cols - 1)) * lenK;
        const x = cur.x + lx * s + ux * 1.5;
        const z = cur.z + lz * s + uz * 1.5;
        emit(x, surfM[i] + 0.5, z, ux * (2 + rnd() * 3) + lx * (rnd() - 0.5) * 6, 8 + rnd() * 7, uz * (2 + rnd() * 3) + lz * (rnd() - 0.5) * 6, 1.1 + rnd() * 0.6, 0.55 + rnd() * 0.7, 9);
      } else {
        for (let tries = 0; tries < 8 && amps[i] < 0.3; tries++) i = Math.floor(rnd() * CREST.cols);
        const a = amps[i];
        if (a < 0.3) continue;
        const su = 0.38 + 0.62 * a;
        const s = (-half + (CREST.span * i) / (CREST.cols - 1) + (rnd() - 0.5) * 2) * lenK;
        const fwd = 6.2 * su;
        const x = cur.x + lx * s + ux * fwd;
        const z = cur.z + lz * s + uz * fwd;
        const sp = cur.live ? cur.speed : cur.speed * 0.8;
        emit(x, 5.4 * a * hK + surfM[i], z, ux * (sp + 1 + rnd() * 4) + lx * (rnd() - 0.5) * 2, 1.5 + rnd() * 3.5, uz * (sp + 1 + rnd() * 4) + lz * (rnd() - 0.5) * 2, 0.6 + rnd() * 0.5, (0.28 + rnd() * 0.36) * (0.6 + 0.4 * a), 12);
      }
    }
    for (let i = 0; i < alive; ) {
      P.age[i] += step;
      if (P.age[i] >= P.life[i]) {
        const j = --alive;
        for (const arr of PARR) arr[i] = arr[j];
        continue;
      }
      P.vy[i] -= P.g[i] * step;
      P.x[i] += P.vx[i] * step;
      P.y[i] += P.vy[i] * step;
      P.z[i] += P.vz[i] * step;
      const k = P.age[i] / P.life[i];
      const sc = P.size[i] * Math.min(1, 0.4 + k * 3) * (1 - k * k);
      vP.set(P.x[i], P.y[i], P.z[i]);
      vS.set(sc, sc, sc);
      spray.setMatrixAt(i, m4.compose(vP, qI, vS));
      i++;
    }
    spray.count = alive;
    spray.visible = alive > 0;
    if (alive) spray.instanceMatrix.needsUpdate = true;
    return cur;
  }
  function dispose() {
    tmpl.dispose();
    geom.dispose();
    sprayGeo.dispose();
    trailGeo.dispose();
    spray.dispose();
  }
  return { update, dispose, crest, spray, trail };
}

// ---------------------------------------------------------------------------
// Gameplay data
// ---------------------------------------------------------------------------
// Farthest-point order: the first point nearest `first`, then each next one farthest from those picked.
function spreadOrder(cand, first, max) {
  if (!cand.length) return [];
  let f = cand[0];
  for (const c of cand) if (Math.hypot(c.x - first.x, c.z - first.z) < Math.hypot(f.x - first.x, f.z - first.z)) f = c;
  const out = [f];
  const minD = cand.map((c) => Math.hypot(c.x - f.x, c.z - f.z));
  while (out.length < max) {
    let bi = -1;
    let bd = -1;
    for (let i = 0; i < cand.length; i++) {
      if (minD[i] > bd) {
        bd = minD[i];
        bi = i;
      }
    }
    if (bi < 0 || bd < 6) break;
    const c = cand[bi];
    out.push(c);
    for (let i = 0; i < cand.length; i++) minD[i] = Math.min(minD[i], Math.hypot(cand[i].x - c.x, cand[i].z - c.z));
  }
  return out.map((p) => ({ x: p.x, z: p.z }));
}
function openWater(start, colliders, { dMin, dMax, rim, colPad }) {
  const cand = [];
  for (let x = -WORLD_R; x <= WORLD_R; x += 3) {
    for (let z = -WORLD_R; z <= WORLD_R; z += 3) {
      if (Math.hypot(x, z) > WORLD_R - rim) continue;
      const ds = Math.hypot(x - start.x, z - start.z);
      if (ds < dMin || ds > dMax) continue;
      if (colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + colPad)) continue;
      cand.push({ x, z });
    }
  }
  return cand;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
export function build(scene, ctx = {}) {
  checkWaves();
  // prefers-reduced-motion: ctx.reducedMotion (a boolean, or a function read every frame), else the media query
  const reduced = () => {
    if (typeof ctx.reducedMotion === 'function') return !!ctx.reducedMotion();
    if (typeof ctx.reducedMotion === 'boolean') return ctx.reducedMotion;
    try {
      return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    } catch {
      return false;
    }
  };
  const rand = mulberry32(19880418); // fixed: the level always looks the same
  GEO = new Map();
  PM = new Map();
  const root = new THREE.Group();
  root.name = 'env:cape';
  scene.add(root);
  const landG = new THREE.Group(); // cliffs, hills, islets, boulders: baked into one painted mesh
  const props = new THREE.Group(); // everything else that stands still: baked into vertex colours
  const farG = new THREE.Group(); // the far mountains (no fog: painted hazy)
  root.add(landG, props, farG);
  const own = []; // materials to dispose
  const ownGeos = [];
  const timeU = { value: 0 };
  const ampU = { value: palette.waveAmp };
  const colliders = [];
  const addCol = (x, z, r, h) => colliders.push({ x: r2(x), z: r2(z), r: r2(r), h: r2(h) });
  const surfSpots = [];
  const addSurf = (x, z, nx, nz, w, h, phase, period) => surfSpots.push({ x: x + nx * 1.2, y: -0.35, z: z + nz * 1.2, w, h, phase, period });

  // ----- the mainland: stacked sandstone cliffs under a puffy green top -----
  const coast = wobble(spline(COAST, 2), 1.4, 2.1);
  const upland = coast.concat(FAR);
  const R1 = landM(C.rock1);
  const R2 = landM(C.rock2);
  const R3 = landM(C.rock3, PAINT.rockLt);
  const GR = landM(C.grass, PAINT.grass);
  const GR2 = landM(C.grass2, PAINT.grass);
  const cliffWarp = (x, y, z) => {
    if (y <= -4 || y >= TOP - 1.6) return 0;
    const f = Math.sin((Math.PI * (y + 4)) / (TOP + 2.4));
    return f * (1.7 * Math.sin(0.043 * x + 0.6) * Math.cos(0.037 * z - 0.3) + 0.9 * Math.sin(0.093 * x - 0.071 * z + 2.0));
  };
  strata(landG, upland, [
    { y0: -4, y1: 4.7, inset: 0, bevel: 1.2, mat: R1, wob: 0.6 },
    { y0: 4.0, y1: 8.9, inset: 1.6, bevel: 1.0, mat: R2, wob: 1.0 },
    { y0: 8.2, y1: 11.9, inset: 2.8, bevel: 0.8, mat: R3, wob: 0.8 },
    { y0: TOP - 1.8, y1: TOP, inset: 2.0, bevel: 0.75, mat: GR, wob: 0.5, segs: 2 },
  ], 0.3, cliffWarp);
  const coastN = leftNormals(coast);
  // distance from (x, z) to the waterline (a coarse search is plenty)
  const coastDist = (x, z) => {
    let d = Infinity;
    for (let i = 0; i < coast.length; i += 2) d = Math.min(d, Math.hypot(coast[i][0] - x, coast[i][1] - z));
    return d;
  };
  const landmarks = [LIGHT, COTTAGE, FLAG, BEACH];
  // rock shoulders bulging from the cliff foot, grassy knolls on top, boulders in the surf, fynbos along the edge
  {
    let s = 0;
    let nextCol = 4 + rand() * 6;
    let nextKnoll = 8 + rand() * 10;
    let nextBoulder = 3 + rand() * 4;
    let nextBush = 2;
    for (let i = 1; i < coast.length - 1; i++) {
      s += Math.hypot(coast[i][0] - coast[i - 1][0], coast[i][1] - coast[i - 1][1]);
      const [x, z] = coast[i];
      const dc = Math.hypot(x, z);
      if (dc > WORLD_R + 90) continue;
      const [nx, nz] = coastN[i];
      const ry = Math.atan2(coast[i + 1][0] - coast[i - 1][0], coast[i + 1][1] - coast[i - 1][1]);
      const nearMark = (px, pz, r) => landmarks.some((l) => Math.hypot(l.x - px, l.z - pz) < r);
      if (s > nextCol) {
        nextCol = s + 10 + rand() * 13;
        const sy = 3.0 + rand() * 2.8;
        const sx = 3.2 + rand() * 2.6;
        const sz = 1.5 + rand() * 0.5;
        const m = mesh(landG, sphere(14, 10), R1, x + nx * sz * 0.7, sy * 0.28, z + nz * sz * 0.7, ry);
        m.scale.set(sz, sy, sx);
        m.rotation.z = (rand() - 0.5) * 0.5;
      }
      if (s > nextKnoll) {
        nextKnoll = s + 13 + rand() * 15;
        const sz = 3.6 + rand() * 2.4;
        const d = 2.4 + sz + rand() * 2;
        const kx = x + nx * d;
        const kz = z + nz * d;
        if (!nearMark(kx, kz, 13)) {
          const k = mesh(landG, sphere(16, 9), GR, kx, TOP - 0.5, kz, ry);
          k.scale.set(sz, 1.8 + rand() * 2.2, 5.5 + rand() * 5);
        }
      }
      if (s > nextBoulder && dc < 230) {
        nextBoulder = s + 6 + rand() * 9;
        const n = 1 + Math.floor(rand() * 2.4);
        for (let k = 0; k < n; k++) {
          const sc = 1.0 + rand() * 1.3;
          const off = (rand() - 0.5) * 3;
          const bx = x - nx * (0.2 + rand() * 0.6) + nz * off;
          const bz = z - nz * (0.2 + rand() * 0.6) - nx * off;
          const b = mesh(landG, boulderGeo(Math.floor(rand() * 5)), landM(rand() < 0.5 ? C.granite : C.granite2, PAINT.granite), bx, sc * 0.15, bz, rand() * 6);
          b.scale.set(sc * 1.15, sc * 0.85, sc);
        }
      }
      if (dc < 230) {
        // a burst of surf against the cliff every few metres, the breakers running along the shore
        if (i % 5 === 0 && Math.hypot(x - BEACH.x, z - BEACH.z) > 10) addSurf(x, z, -nx, -nz, 5.5 + rand() * 2.5, 6 + rand() * 4, s / 52 + rand() * 0.12, 5.4 + rand() * 1.8);
      }
      if (s > nextBush && dc < WORLD_R + 70) {
        nextBush = s + 3.5 + rand() * 5;
        const d = 4.5 + rand() * 6;
        const bx = x + nx * d;
        const bz = z + nz * d;
        if (!nearMark(bx, bz, 7) && coastDist(bx, bz) > 3.8) fynbos(props, bx, TOP, bz, 0.8 + rand() * 0.6);
      }
    }
  }
  // green hills rolling away inland (kept clear of the cliff edge)
  for (const [hx, hz, hr0, hh] of HILLS) {
    if (!pointInPoly(hx, hz, upland)) continue;
    const room = coastDist(hx, hz) - 8;
    const hr = Math.min(hr0, room / 1.02);
    if (hr < 8) continue;
    const m = mesh(landG, hillGeo(), rand() < 0.5 ? GR : GR2, hx, TOP - 0.6, hz, rand() * 6);
    m.scale.set(hr, hh * Math.min(1, hr / hr0 + 0.3), hr * (0.75 + rand() * 0.2));
  }

  // ----- the collider ring hugging the mainland's waterline -----
  {
    const S = [0];
    for (let i = 1; i < coast.length; i++) S.push(S[i - 1] + Math.hypot(coast[i][0] - coast[i - 1][0], coast[i][1] - coast[i - 1][1]));
    const total = S[S.length - 1];
    const RMAX = 15;
    const SAG = 0.75;
    let i = 0;
    let s = 0;
    while (s <= total) {
      while (i < coast.length - 1 && S[i + 1] < s) i++;
      const [px, pz] = coast[i];
      if (Math.hypot(px, pz) < WORLD_R + 75) {
        let r = RMAX;
        let cx = 0;
        let cz = 0;
        for (; r > 2.5; r -= 0.5) {
          cx = px + coastN[i][0] * r;
          cz = pz + coastN[i][1] * r;
          let ok = true;
          for (let j = 0; j < coast.length; j++) {
            const q = coast[j];
            if (Math.abs(q[0] - cx) > r || Math.abs(q[1] - cz) > r) continue;
            if (Math.hypot(q[0] - cx, q[1] - cz) < r - 0.6) {
              ok = false;
              break;
            }
          }
          if (ok) break;
        }
        addCol(cx, cz, r, TOP + 1);
        s += Math.max(2.5, 2 * Math.sqrt(2 * r * SAG - SAG * SAG));
      } else s += 4;
    }
  }

  // ----- islets: the horn's rock, the Old Man, the penguins' boulders, the beach, the wreck's rock, two rocks -----
  const islet = (x, z, r, h, opts = {}) => {
    const ph = rand() * 6;
    const poly = lobed(x, z, r, ph);
    const b = Math.min(1.2, r * 0.24);
    const warp = (px, py, pz) => {
      if (py <= -3 || py >= h - 0.9) return 0;
      const f = Math.sin((Math.PI * (py + 3)) / (h + 2.1));
      return 0.09 * h * f * Math.sin(((px - x) * 1.7) / r + ph) * Math.cos(((pz - z) * 1.3) / r - ph);
    };
    if (opts.stack) {
      const sx = Math.cos(ph * 1.7) * r * 0.18;
      const sz = Math.sin(ph * 1.7) * r * 0.18;
      strata(landG, poly, [
        { y0: -3, y1: h * 0.42, inset: 0, bevel: b, mat: R1 },
        { y0: h * 0.36, y1: h * 0.74, inset: r * 0.13, bevel: b * 0.95, mat: R2, shift: [sx * 0.5, sz * 0.5] },
        { y0: h * 0.68, y1: h - 0.25, inset: r * 0.24, bevel: b * 0.9, mat: R3, shift: [sx, sz] },
        { y0: h - 0.8, y1: h + 0.45, inset: r * 0.16, bevel: Math.min(0.7, b * 0.8), mat: GR, segs: 2, shift: [sx, sz] },
      ], ph, warp);
      opts.top = { x: x + sx, z: z + sz, y: h + 0.45 };
    } else if (opts.bare) {
      // a bare reef rock of dark granite
      strata(landG, poly, [
        { y0: -3, y1: h * 0.7, inset: 0, bevel: b, mat: landM(C.granite2, PAINT.granite) },
        { y0: h * 0.6, y1: h + 0.4, inset: r * 0.18, bevel: b * 0.85, mat: landM(C.granite, PAINT.granite) },
      ], ph, warp);
    } else {
      strata(landG, poly, [
        { y0: -3, y1: h * 0.6, inset: 0, bevel: b, mat: R1 },
        { y0: h * 0.52, y1: h - 0.4, inset: r * 0.12, bevel: b * 0.85, mat: R2 },
        { y0: h - 0.9, y1: h + 0.3, inset: r * 0.08, bevel: Math.min(0.7, b), mat: GR, segs: 2 },
      ], ph, warp);
      if (!opts.flatTop) {
        const mound = mesh(landG, sphere(18, 10), GR, x, h + 0.05, z);
        mound.scale.set(r * 0.7, Math.min(1.6, r * 0.18), r * 0.66);
      }
    }
    for (let k = 0; k < (opts.stack ? 3 : 5); k++) {
      const a = ph + k * (6.28 / (opts.stack ? 3 : 5)) + rand() * 0.6;
      const sc = Math.min(1.7, r * 0.28) * (0.8 + rand() * 0.5);
      const bb = mesh(landG, boulderGeo(Math.floor(rand() * 5)), landM(rand() < 0.5 ? C.granite : C.granite2, PAINT.granite), x + Math.cos(a) * r * 0.95, sc * 0.2, z + Math.sin(a) * r * 0.95, rand() * 6);
      bb.scale.set(sc * 1.1, sc * 0.8, sc);
    }
    addCol(x, z, r * 1.03, h + 0.5);
    for (let k = 0; k < Math.max(3, Math.round(r * 0.9)); k++) {
      const a = ph + (k / Math.max(3, Math.round(r * 0.9))) * Math.PI * 2;
      addSurf(x + Math.cos(a) * r, z + Math.sin(a) * r, Math.cos(a), Math.sin(a), 3.6 + rand() * 1.6, 3.8 + rand() * 2.6, rand(), 5 + rand() * 2);
    }
    return opts;
  };
  islet(HORN.x, HORN.z, HORN.r, HORN.top, { flatTop: true });
  const oldMan = islet(STACK.x, STACK.z, STACK.r, STACK.h, { stack: true });
  // a boulder pile: big round granite boulders (their tops listed for the penguins)
  const boulderPile = (cx, cz, list) => {
    const tops = [];
    for (const [dx, dz, r, h, tone] of list) {
      const b = mesh(landG, boulderGeo(Math.floor(rand() * 5) + 5, 0.1), landM(tone ? C.graniteLt : C.granite, PAINT.granite), cx + dx, h - r * 0.95, cz + dz, rand() * 6);
      b.scale.set(r, r * 0.95, r * 0.92);
      tops.push({ x: cx + dx, z: cz + dz, y: h - 0.08 });
    }
    return tops;
  };
  const isleTops = boulderPile(PENGUINS.x, PENGUINS.z, [
    [0, 0, 3.3, 3.3, 1], [3.9, 2.2, 2.6, 2.4, 0], [-3.4, 2.8, 2.4, 2.1, 1], [2.0, -3.5, 2.1, 1.8, 0], [-3.0, -2.4, 1.8, 1.3, 0], [0.6, 4.2, 1.6, 1.1, 1],
  ]);
  addCol(PENGUINS.x, PENGUINS.z, PENGUINS.r, 4);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.4;
    addSurf(PENGUINS.x + Math.cos(a) * 5.4, PENGUINS.z + Math.sin(a) * 5.4, Math.cos(a), Math.sin(a), 3.2 + rand() * 1.2, 2.8 + rand() * 1.6, rand(), 5 + rand() * 2);
  }
  const beachTops = boulderPile(BEACH.x, BEACH.z, [
    [0, 0, 2.4, 2.4, 1], [3.0, -0.8, 2.0, 1.8, 0], [-2.6, -1.4, 1.9, 1.6, 0], [1.2, 2.4, 1.5, 1.1, 1], [-1.0, 2.6, 1.3, 0.9, 0],
  ]);
  addCol(BEACH.x, BEACH.z, BEACH.r, 3);
  addCol(BEACH.x - 2, BEACH.z - 4.5, 3.2, 3); // (no sliver of water between the boulders and the cliff)
  for (let k = 0; k < 3; k++) {
    const a = 0.7 + k * 0.9;
    addSurf(BEACH.x + Math.cos(a) * 5, BEACH.z + Math.sin(a) * 5, Math.cos(a), Math.sin(a), 3, 2.6 + rand() * 1.4, rand(), 5 + rand() * 2);
  }
  for (const rk of ROCKS) islet(rk.x, rk.z, rk.r, rk.h);
  islet(WRECK.x, WRECK.z, WRECK.r, 2.2, { flatTop: true, bare: true });

  // ----- the lighthouse on the Cape's tip -----
  const lantern = { x: LIGHT.x, y: TOP + 17.7, z: LIGHT.z };
  {
    const { x, z } = LIGHT;
    const y0 = TOP;
    mesh(props, cyl(3.7, 4.0, 1.2, 22), pm(C.stone), x, y0 + 0.35, z);
    const H = 13;
    const n = 5;
    for (let k = 0; k < n; k++) {
      const r0 = 2.75 + (1.95 - 2.75) * (k / n);
      const r1 = 2.75 + (1.95 - 2.75) * ((k + 1) / n);
      mesh(props, cyl(r1, r0, H / n, 22), pm(k % 2 ? C.white : C.red), x, y0 + 1 + (k + 0.5) * (H / n), z);
    }
    const face = Math.atan2(COTTAGE.x - x, COTTAGE.z - z);
    const fx = Math.sin(face);
    const fz = Math.cos(face);
    mesh(props, rbox(1.2, 2.0, 0.5, 0.18), pm(C.door), x + fx * 2.65, y0 + 2.0, z + fz * 2.65, face);
    for (const [hh, a] of [[6.5, 0.9], [11.0, -0.7]]) {
      const ax = Math.sin(face + a);
      const az = Math.cos(face + a);
      const rr = 2.75 + (1.95 - 2.75) * ((hh - 1) / H);
      mesh(props, rbox(0.6, 0.9, 0.4, 0.12), flat(C.glass), x + ax * rr, y0 + hh, z + az * rr, face + a);
    }
    const yg = y0 + 1 + H;
    mesh(props, cyl(3.0, 2.6, 0.5, 22), pm(C.redDark), x, yg + 0.2, z);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      mesh(props, cyl(0.07, 0.07, 0.9, 5), pm(C.iron), x + Math.cos(a) * 2.8, yg + 0.9, z + Math.sin(a) * 2.8);
    }
    const rail = mesh(props, geo('rail', () => new THREE.TorusGeometry(2.8, 0.08, 5, 32)), pm(C.iron), x, yg + 1.35, z);
    rail.rotation.x = Math.PI / 2;
    mesh(props, cyl(1.5, 1.5, 2.3, 16), flat(C.glass), x, yg + 1.6, z);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      mesh(props, rbox(0.16, 2.4, 0.16, 0.05), pm(C.iron), x + Math.cos(a) * 1.52, yg + 1.6, z + Math.sin(a) * 1.52, -a);
    }
    mesh(props, cyl(1.75, 1.75, 0.3, 18), pm(C.redDark), x, yg + 2.9, z);
    mesh(props, cone(1.9, 1.7, 18), pm(C.red), x, yg + 3.85, z);
    mesh(props, sphere(10, 8), pm(C.gold), x, yg + 4.85, z).scale.setScalar(0.32);
    mesh(props, cyl(0.05, 0.05, 1.2, 5), pm(C.iron), x, yg + 5.5, z);
    lantern.y = yg + 1.6;
    // a low stone wall round its garden, with a gap to the cottage
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2;
      const da = Math.abs(Math.atan2(Math.sin(a - (Math.PI / 2 - face)), Math.cos(a - (Math.PI / 2 - face))));
      if (da < 0.35) continue;
      const wx = x + Math.cos(a) * 6.4;
      const wz = z + Math.sin(a) * 6.4;
      if (coastDist(wx, wz) < 3.2) continue;
      mesh(props, rbox(1.85, 0.8, 0.7, 0.2), pm(k % 2 ? C.stone : C.stone2), wx, y0 + 0.3, wz, Math.PI / 2 - a);
    }
  }
  // ----- the keeper's cottage: white walls, a Cape Dutch gable, a thatched roof -----
  {
    const { x, z } = COTTAGE;
    const g = new THREE.Group();
    g.position.set(x, TOP - 0.1, z);
    g.rotation.y = Math.atan2(START.x - x, START.z - z) - 0.35;
    props.add(g);
    mesh(g, rbox(7.4, 3.3, 4.4, 0.25), pm(C.white), 0, 1.65, 0);
    const th = mesh(g, geo('thatch', () => new THREE.CylinderGeometry(2.7, 2.7, 7.9, 16)), pm(C.thatch), 0, 3.25, 0);
    th.rotation.z = Math.PI / 2;
    th.scale.set(1, 1, 0.82);
    const ridge = mesh(g, geo('ridge', () => new THREE.CylinderGeometry(0.42, 0.42, 8.1, 10)), pm(C.thatchDark), 0, 5.45, 0);
    ridge.rotation.z = Math.PI / 2;
    const gable = mesh(g, geo('gable', () => {
      const s = new THREE.Shape();
      s.moveTo(-1.95, 0);
      s.lineTo(-1.95, 1.0);
      s.quadraticCurveTo(-1.95, 1.5, -1.45, 1.65);
      s.quadraticCurveTo(-1.0, 1.8, -1.05, 2.45);
      s.quadraticCurveTo(-1.05, 3.05, -0.55, 3.15);
      s.quadraticCurveTo(0, 3.65, 0.55, 3.15);
      s.quadraticCurveTo(1.05, 3.05, 1.05, 2.45);
      s.quadraticCurveTo(1.0, 1.8, 1.45, 1.65);
      s.quadraticCurveTo(1.95, 1.5, 1.95, 1.0);
      s.lineTo(1.95, 0);
      s.lineTo(-1.95, 0);
      const eg = new THREE.ExtrudeGeometry(s, { depth: 0.45, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2, curveSegments: 6 });
      eg.translate(0, 0, -0.22);
      return smoothGeo(eg);
    }), pm(C.white), 0, 2.9, 2.2);
    gable.scale.set(1.05, 1.05, 1);
    mesh(g, rbox(0.7, 0.9, 0.3, 0.12), flat(C.glass), 0, 4.6, 2.48);
    mesh(g, rbox(1.1, 2.0, 0.3, 0.12), pm(C.shutter), 0, 1.0, 2.25);
    for (const sx of [-2.4, 2.4]) {
      mesh(g, rbox(1.0, 1.1, 0.3, 0.12), flat(C.window), sx, 1.85, 2.24);
      for (const ox of [-0.72, 0.72]) mesh(g, rbox(0.4, 1.15, 0.2, 0.08), pm(C.shutter), sx + ox, 1.85, 2.32);
    }
    for (const sx of [-3.35, 3.35]) mesh(g, rbox(0.85, 1.7, 0.85, 0.15), pm(C.white), sx, 4.95, -0.3);
    // a path of flat stones down to the lighthouse
    for (let k = 0; k < 6; k++) {
      const st = mesh(g, cyl(0.6, 0.6, 0.2, 10), pm(C.stone2), (k % 2 ? 0.4 : -0.3), 0.15, 3.4 + k * 1.6);
      st.scale.set(1, 1, 0.8);
    }
  }
  // ----- the flagpole by the lighthouse -----
  const flagTop = { x: FLAG.x, y: TOP + 8.6, z: FLAG.z };
  mesh(props, cyl(0.12, 0.16, 8.8, 8), pm(C.white), FLAG.x, TOP + 4.3, FLAG.z);
  mesh(props, sphere(8, 6), pm(C.gold), FLAG.x, TOP + 8.85, FLAG.z).scale.setScalar(0.22);
  mesh(props, cyl(0.5, 0.6, 0.4, 10), pm(C.stone2), FLAG.x, TOP + 0.1, FLAG.z);

  // ----- the conch-horn tower on its rock -----
  const mouth = { pos: new THREE.Vector3(), yaw: HORN_DIR, tilt: -0.22 };
  let hornFlag = null;
  {
    const { x, z } = HORN;
    let y = HORN.top - 0.2;
    for (const [rt, rb, h, col] of [[2.45, 2.6, 2.3, C.stone], [2.35, 2.45, 2.2, C.stone2], [2.28, 2.35, 2.1, C.stone], [2.4, 2.28, 1.5, C.stone2]]) {
      mesh(props, cyl(rt, rb, h, 18), pm(col), x, y + h / 2, z);
      y += h;
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      mesh(props, rbox(0.9, 0.75, 0.6, 0.12), pm(C.stone), x + Math.cos(a) * 2.15, y + 0.35, z + Math.sin(a) * 2.15, Math.PI / 2 - a);
    }
    const face = Math.atan2(START.x - x, START.z - z);
    mesh(props, rbox(1.2, 2.0, 0.5, 0.2), pm(C.door), x + Math.sin(face) * 2.55, HORN.top + 1.35, z + Math.cos(face) * 2.55, face);
    for (const a of [0.7, -0.9]) mesh(props, rbox(0.4, 0.9, 0.4, 0.1), flat(C.window), x + Math.sin(face + a) * 2.42, HORN.top + 4.5, z + Math.cos(face + a) * 2.42, face + a);
    const yp = y + 0.15;
    mesh(props, cyl(2.75, 2.75, 0.3, 18), pm(C.wood), x, yp, z);
    // the cradle and the conch, its mouth to the open sea, tilted up a little
    const cg = new THREE.Group();
    cg.position.set(x, yp + 1.9, z);
    cg.rotation.set(0, HORN_DIR, 0);
    props.add(cg);
    for (const cz of [-1.3, 1.1]) {
      mesh(cg, rbox(0.3, 1.6, 0.3, 0.08), pm(C.woodDark), 0.9, -1.0, cz);
      mesh(cg, rbox(0.3, 1.6, 0.3, 0.08), pm(C.woodDark), -0.9, -1.0, cz);
      mesh(cg, rbox(2.1, 0.3, 0.35, 0.08), pm(C.wood), 0, -0.3, cz);
    }
    const shell = new THREE.Group();
    shell.rotation.x = Math.PI / 2 + mouth.tilt;
    shell.scale.setScalar(1.1);
    cg.add(shell);
    // (lathe axis +y becomes the horn's axis, the mouth at +y): a spire winding to a point with a brown spiral
    // round it, a knobbly shoulder, and a flared pink lip
    const BODY = [[0, -3.7], [0.3, -3.3], [0.55, -2.8], [0.8, -2.2], [1.05, -1.5], [1.3, -0.7], [1.55, 0.2], [1.46, 1.15], [1.38, 1.3]];
    const LIP = [[1.38, 1.15], [1.6, 1.8], [1.95, 2.35], [2.3, 2.7], [2.2, 2.92], [1.7, 2.82], [0.9, 2.35], [0, 1.95]];
    mesh(shell, geo('conch', () => smoothGeo(lathe(BODY, 22))), pm(C.conch));
    mesh(shell, geo('conchLip', () => smoothGeo(lathe(LIP, 22))), pm(C.conchLip));
    const radiusAt = (y) => {
      for (let k = 1; k < BODY.length; k++) {
        if (y <= BODY[k][1]) return lerp(BODY[k - 1][0], BODY[k][0], (y - BODY[k - 1][1]) / (BODY[k][1] - BODY[k - 1][1]));
      }
      return BODY[BODY.length - 1][0];
    };
    const helix = [];
    for (let k = 0; k <= 48; k++) {
      const t = k / 48;
      const y = -3.55 + t * 3.55;
      const a = t * Math.PI * 2 * 3.6;
      const rr = radiusAt(y) + 0.02;
      helix.push(new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr));
    }
    mesh(shell, geo('conchSpiral', () => tubeAlong(helix, (t) => 0.06 + 0.13 * t, 6)), pm(C.conchBand));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2;
      const kn = mesh(shell, cone(0.3, 0.95, 7), pm(C.conchTip), Math.cos(a) * 1.45, -0.05, Math.sin(a) * 1.45);
      kn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a), -0.45, Math.sin(a)).normalize());
    }
    const pink = mesh(shell, sphere(16, 8), pm(C.conchPink), 0, 2.4, 0);
    pink.scale.set(1.85, 0.25, 1.85);
    shell.updateMatrixWorld(true);
    props.updateMatrixWorld(true);
    shell.localToWorld(mouth.pos.set(0, 2.6, 0));
    mesh(props, cyl(0.08, 0.1, 4.2, 6), pm(C.woodDark), x - Math.sin(HORN_DIR) * 2.0, yp + 2.1, z - Math.cos(HORN_DIR) * 2.0);
    hornFlag = { x: x - Math.sin(HORN_DIR) * 2.0, y: yp + 4.0, z: z - Math.cos(HORN_DIR) * 2.0 };
  }

  // ----- the wreck on its reef rock in the south-west: heeled over, half sunk, a broken mast with a torn sail -----
  {
    const g = new THREE.Group();
    const wx = WRECK.x + 3.6;
    const wz = WRECK.z - 3.2;
    g.position.set(wx, -0.2, wz);
    g.rotation.order = 'YXZ';
    g.rotation.set(0.22, 2.3, 0.55);
    props.add(g);
    const hull = mesh(g, sphere(16, 10), pm(C.hull), 0, 0, 0);
    hull.scale.set(2.2, 1.6, 6.0);
    const deck = mesh(g, rbox(3.4, 0.3, 8.6, 0.12), pm(C.hullDark), 0, 1.15, -0.4);
    deck.rotation.x = 0.04;
    for (let k = 0; k < 4; k++) {
      // the broken stern: bare ribs
      const rib = mesh(g, geo('rib', () => new THREE.TorusGeometry(1.9, 0.15, 5, 14, Math.PI)), pm(C.hullDark), 0, 0.9, -4.4 - k * 0.85);
      rib.scale.set(1, 0.9 - k * 0.12, 1);
    }
    const mast = mesh(g, cyl(0.18, 0.24, 6.2, 8), pm(C.woodDark), 0, 4.0, 1.4);
    mast.rotation.x = -0.15;
    const yard = mesh(g, cyl(0.11, 0.11, 4.2, 6), pm(C.woodDark), 0, 6.3, 1.0);
    yard.rotation.z = Math.PI / 2 - 0.35;
    // a torn sail hanging from the yard in two ragged flaps
    for (const [x, sx, sy, rz] of [[-0.9, 1.1, 2.4, 0.25], [1.0, 0.9, 1.7, -0.2]]) {
      const flap = mesh(g, cone(1, 1, 3), pm(C.sail), x, 5.0, 1.1);
      flap.rotation.z = Math.PI + rz;
      flap.scale.set(sx, sy, 0.06);
    }
    for (let k = 0; k < 3; k++) {
      const plank = mesh(props, rbox(2.4, 0.18, 0.5, 0.06), pm(C.hull), WRECK.x + 6 + k * 1.7, 0.1, WRECK.z + 1.5 - k * 2.2, k * 0.9);
      plank.rotation.z = 0.1;
    }
  }
  addCol(WRECK.x + 3.6, WRECK.z - 3.2, 3.4, 3.5);
  // ----- the far mountains: Table Mountain under its tablecloth, Devil's Peak, Lion's Head, far hills -----
  {
    const T = TABLE;
    const poly = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const k = Math.pow(Math.abs(c) ** 4 + Math.abs(s) ** 4, -0.25); // a rounded rectangle
      poly.push([T.x + T.w * c * k * (1 + 0.04 * Math.sin(a * 5)), T.z + T.d * s * k]);
    }
    const FM = pm(C.mtn, { paint: PAINT.far });
    const FD = pm(C.mtnDark, { paint: PAINT.far });
    const FT = pm(C.mtnTop, { paint: PAINT.far });
    strata(farG, poly, [
      { y0: -2, y1: T.h * 0.4, inset: -12, bevel: 5, mat: FD, wob: 3 },
      { y0: T.h * 0.34, y1: T.h * 0.78, inset: -4, bevel: 3, mat: FM, wob: 2 },
      { y0: T.h * 0.72, y1: T.h, inset: 0, bevel: 2, mat: FT, wob: 1 },
    ], 1.3);
    // the tablecloth: a white cloud lying flat on the top, puffy along its edge, spilling down the front
    const cloth = pm(C.cloth, { paint: [0, 0, 0, 0] });
    slab(farG, insetPoly(poly, -1.5), T.h - 1, T.h + 2.2, 1.4, cloth, 3);
    for (let k = 0; k < 12; k++) {
      const fx = T.x - T.w * 0.85 + (k / 11) * T.w * 1.7 + (rand() - 0.5) * 6;
      const puff = mesh(farG, sphere(14, 9), cloth, fx, T.h + 2.2, T.z + T.d * (0.45 + rand() * 0.4));
      puff.scale.set(7 + rand() * 4, 2.6 + rand() * 2, 6 + rand() * 3);
    }
    const skirt = mesh(farG, sphere(24, 10), cloth, T.x, T.h - 2.5, T.z + T.d + 0.8);
    skirt.scale.set(T.w * 0.86, 4.2, 2.6);
    for (let k = 0; k < 6; k++) {
      const fx = T.x - T.w * 0.7 + (k / 5) * T.w * 1.4 + (rand() - 0.5) * 8;
      const len = 9 + rand() * 11;
      const tongue = mesh(farG, sphere(14, 9), cloth, fx, T.h - 1 - len * 0.5, T.z + T.d + 1.0);
      tongue.scale.set(7 + rand() * 4, len * 0.62, 2.2);
    }
    for (const [px, pz, r, h, kind] of FAR_PEAKS) {
      const mat = kind === 'hill' ? pm(rand() < 0.5 ? C.farHill : C.farHill2, { paint: PAINT.far }) : FM;
      if (kind === 'peak') {
        const m = mesh(farG, geo('peak', () => smoothGeo(lathe([[0, 1], [0.12, 0.97], [0.3, 0.8], [0.5, 0.52], [0.75, 0.24], [1.0, 0.04], [1.03, -0.05]], 20))), mat, px, -1, pz);
        m.scale.set(r, h, r * 0.8);
      } else if (kind === 'dome') {
        const m = mesh(farG, hillGeo(), mat, px, -1, pz);
        m.scale.set(r, h * 0.62, r * 0.85);
        const knob = mesh(farG, sphere(14, 9), FT, px + 2, h * 0.58, pz);
        knob.scale.set(r * 0.42, h * 0.42, r * 0.38);
      } else {
        const m = mesh(farG, hillGeo(), mat, px, -4, pz);
        m.scale.set(r, h + 3, r * 0.75);
      }
    }
  }

  // ----- the storm, the rain, the surf -----
  const storm = buildStorm(own);
  const rain = buildRain(own, timeU);
  const surf = buildSurf(surfSpots, own, timeU);
  root.add(storm, rain, surf);
  ownGeos.push(storm.geometry, rain.geometry, surf.geometry);

  // ----- the lighthouse beam: two soft cones sweeping slowly round (never flashing: they fade as they turn
  // towards the camera) -----
  const beamGeo = (() => {
    const L = 46;
    const parts = [];
    for (const dir of [1, -1]) {
      const c = new THREE.CylinderGeometry(2.9, 0.8, L, 20, 4, true);
      c.translate(0, -L / 2 - 1.5, 0);
      c.rotateZ((dir * Math.PI) / 2);
      c.rotateZ(dir * -0.05);
      parts.push(c.toNonIndexed());
      c.dispose();
    }
    const g = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(1, Math.max(0, Math.abs(pos.getX(i)) - 1.5) / L);
      colors.set([1, 0.9, 0.62, 0.2 * Math.pow(1 - t, 1.7) * Math.min(1, t * 12 + 0.25)], i * 4);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    return g;
  })();
  const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true, blending: THREE.AdditiveBlending });
  noOutline(beamMat);
  own.push(beamMat);
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.name = 'cape-beam';
  beam.position.set(lantern.x, lantern.y, lantern.z);
  beam.renderOrder = 3;
  beam.userData.keep = true;
  root.add(beam);
  ownGeos.push(beamGeo);

  // ----- the horn's rings -----
  const rings = buildHornRings(own, mouth);
  root.add(rings.mesh);
  ownGeos.push(rings.geom);

  // ----- creatures: penguins, albatrosses, whales, and the two pennants (one rig) -----
  const pieces = [];
  const penguins = [];
  const addPenguin = (top, yaw, s) => {
    penguins.push({ first: pieces.length, x: top.x, y: top.y, z: top.z, yaw, s, ph: rand() * 20, flap: 5 + rand() * 4 });
    penguinBody(props, top.x, top.y, top.z, yaw, s);
    pieces.push(...penguinPieces());
  };
  const faceStart = (p) => Math.atan2(START.x - p.x, START.z - p.z);
  addPenguin(isleTops[0], faceStart(isleTops[0]) - 0.3, 1.25);
  addPenguin({ x: isleTops[0].x + 1.1, y: isleTops[0].y - 0.25, z: isleTops[0].z - 0.9 }, faceStart(isleTops[0]) + 0.8, 1.1);
  addPenguin(isleTops[1], faceStart(isleTops[1]) + 0.4, 1.15);
  addPenguin(isleTops[2], faceStart(isleTops[2]) - 1.2, 1.2);
  addPenguin(isleTops[3], -2.2, 1.0);
  addPenguin(isleTops[5], faceStart(isleTops[5]), 0.95);
  addPenguin(beachTops[0], faceStart(beachTops[0]) - 0.2, 1.2);
  addPenguin({ x: beachTops[0].x - 0.9, y: beachTops[0].y - 0.3, z: beachTops[0].z + 0.8 }, faceStart(beachTops[0]) + 0.7, 1.0);
  addPenguin(beachTops[1], faceStart(beachTops[1]) + 0.3, 1.1);
  addPenguin(beachTops[2], faceStart(beachTops[2]) - 0.9, 1.05);
  addPenguin(beachTops[3], faceStart(beachTops[3]) + 1.4, 0.95);
  addPenguin(oldMan.top, faceStart(oldMan.top), 1.0);
  const birds = [
    { c: [-15, 24, 5], r: 44, w: 0.11 },
    { c: [48, 27, -36], r: 30, w: -0.13 },
    { c: [-72, 19, 40], r: 34, w: 0.12 },
  ].map((b) => {
    const first = pieces.length;
    pieces.push(...albatrossPieces());
    return { ...b, first, ph: rand() * 6.28, fl: rand() * 20 };
  });
  const whales = [
    { c: [-205, 30], r: 22, w: 0.07, off: 0 },
    { c: [-140, 178], r: 18, w: -0.085, off: 6.5 },
    { c: [62, 218], r: 25, w: 0.06, off: 12.5 },
  ].map((wh) => {
    const first = pieces.length;
    pieces.push(...whalePieces());
    return { ...wh, first, ph: rand() * 6.28 };
  });
  const flags = [
    { first: pieces.length, ...flagTop, ph: 0.3 },
    { first: pieces.length + 1, ...hornFlag, ph: 2.1 },
  ];
  pieces.push(pennantPiece(C.flagRed, C.white), pennantPiece(C.flagTeal, C.white));
  const critterMat = vcMaterial(true);
  critterMat.name = 'cape-critters';
  own.push(critterMat);
  const critters = buildRig(pieces, critterMat, 'cape-critters');
  root.add(critters.mesh);


  // ----- bake the statics -----
  const landMat = makeLandMaterial('cape-land');
  const farMat = makeLandMaterial('cape-far', 0.5);
  const propsLine = vcMaterial(true);
  propsLine.name = 'cape-props';
  const propsFlat = new THREE.MeshBasicMaterial({ vertexColors: true });
  propsFlat.name = 'cape-props-glow';
  noOutline(propsFlat);
  own.push(landMat, farMat, propsLine, propsFlat);
  bake(landG, { line: landMat }, 'cape-land', true);
  bake(farG, { line: farMat }, 'cape-far', true);
  bake(props, { line: propsLine, flat: propsFlat }, 'cape-props');
  for (const g of [landG, farG, props]) {
    g.traverse((o) => {
      if (o.isMesh) ownGeos.push(o.geometry);
    });
  }

  // ----- the rogue wave -----
  const rogue = createRogueView(root, own, colliders, reduced, ampU);

  for (const g of GEO.values()) g.dispose();
  GEO = null;
  for (const m of PM.values()) m.dispose();
  PM = null;

  // ----- gameplay data -----
  const h0 = Math.atan2(LIGHT.x - START.x, LIGHT.z - START.z);
  const playerStart = { x: START.x, z: START.z, h: r6(h0) };
  const rogueDirs = ROGUE_FROM.map((d) => r6(d * DEG));
  const spawnCand = openWater(playerStart, colliders, { dMin: 58, dMax: 92, rim: 16, colPad: 12 });
  const enemySpawns = spreadOrder(spawnCand, { x: START.x + Math.sin(h0) * 72, z: START.z + Math.cos(h0) * 72 }, 12);
  const crateCand = openWater(playerStart, colliders, { dMin: 30, dMax: 100, rim: 20, colPad: 8 });
  const crateSpots = spreadOrder(crateCand, { x: START.x + Math.sin(h0 + 0.9) * 45, z: START.z + Math.cos(h0 + 0.9) * 45 }, 8);

  // ----- animation -----
  const m4 = new THREE.Matrix4();
  const mA = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3(1, 1, 1);
  const one = new THREE.Vector3(1, 1, 1);
  let last = 0;
  let ringsOn = 0;
  let ringWarm = 3; // (drawn, empty, for the first frames: its program compiles during the fly-in)
  rings.mesh.visible = true;
  const beamDir = new THREE.Vector3();
  function update(t, dt, fctx) {
    if (!finite(t)) return;
    const step = finite(dt) ? Math.min(0.1, Math.max(0, dt)) : Math.max(0, Math.min(0.1, t - last));
    last = t;
    timeU.value = t;
    const calm = reduced();
    const amp = ampU.value;
    // penguins: looking about, a flap of the flippers now and then
    for (const pg of penguins) {
      p.set(pg.x, pg.y, pg.z);
      e.set(0, pg.yaw, 0);
      q.setFromEuler(e);
      sc.setScalar(pg.s);
      m4.compose(p, q, sc);
      const look = 0.45 * Math.sin(t * 0.33 + pg.ph) + 0.22 * Math.sin(t * 0.81 + pg.ph * 2);
      e.set(0.12 * Math.sin(t * 0.5 + pg.ph * 3), look, 0.1 * Math.sin(t * 0.7 + pg.ph));
      q.setFromEuler(e);
      mA.compose(p.set(0, PENGUIN_NECK, 0), q, one);
      critters.set(pg.first, mA.premultiply(m4));
      const f = ((t + pg.ph) / pg.flap) % 1;
      const flapA = f < 0.14 ? 0.25 + 0.75 * Math.abs(Math.sin((f / 0.14) * Math.PI * 3)) : 0.18;
      for (let k = 0; k < 2; k++) {
        const side = k ? -1 : 1;
        e.set(0, 0, side * flapA);
        q.setFromEuler(e);
        mA.compose(p.set(side * PENGUIN_SHOULDER[0], PENGUIN_SHOULDER[1], PENGUIN_SHOULDER[2]), q, one);
        critters.set(pg.first + 1 + k, mA.premultiply(m4));
      }
    }
    // albatrosses: long glides round and round, banking, a slow beat of the wings once in a while
    for (const b of birds) {
      const a = b.ph + t * b.w;
      const x = b.c[0] + Math.cos(a) * b.r;
      const z = b.c[2] + Math.sin(a) * b.r;
      const dir = Math.sign(b.w);
      p.set(x, b.c[1] + Math.sin(t * 0.4 + b.ph) * 1.6, z);
      e.order = 'YXZ';
      e.set(0.04 * Math.sin(t * 0.5 + b.ph), Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir), 0.32 * dir);
      q.setFromEuler(e);
      e.order = 'XYZ';
      sc.setScalar(1.3);
      m4.compose(p, q, sc);
      critters.set(b.first, m4);
      const f = ((t + b.fl) / 11) % 1;
      const flap = f < 0.22 ? 0.5 * Math.sin((f / 0.22) * Math.PI * 4) : 0.1 + 0.03 * Math.sin(t * 1.3 + b.ph);
      for (let k = 0; k < 2; k++) {
        const side = k ? -1 : 1;
        e.set(0, 0, side * flap);
        q.setFromEuler(e);
        mA.compose(p.set(side * 0.22, 0.08, 0.05), q, one);
        critters.set(b.first + 1 + k, mA.premultiply(m4));
      }
    }
    // whales: cruising round far out; every 18 s one surfaces, blows, arches and shows its fluke as it dives
    for (const wh of whales) {
      const a = wh.ph + t * wh.w;
      const dir = Math.sign(wh.w);
      const x = wh.c[0] + Math.cos(a) * wh.r;
      const z = wh.c[1] + Math.sin(a) * wh.r;
      const yaw = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir);
      const u = ((t + wh.off) % 18) / 7.5;
      if (u > 1) {
        for (let k = 0; k < 3; k++) critters.hide(wh.first + k);
        continue;
      }
      const y = -3.4 + 3.5 * Math.sin(Math.PI * clamp01(u * 1.1)) + waveHeight(x, z, t, amp) * 0.6;
      p.set(x, y, z);
      e.set(-0.32 + 0.72 * u, yaw, 0);
      e.order = 'YXZ';
      q.setFromEuler(e);
      e.order = 'XYZ';
      sc.setScalar(1);
      m4.compose(p, q, sc);
      critters.set(wh.first, m4);
      e.set(1.35 * smooth(0.66, 0.95, u) - 0.15, 0, 0);
      q.setFromEuler(e);
      mA.compose(p.set(0, 0, -5.9), q, one);
      critters.set(wh.first + 1, mA.premultiply(m4));
      const g = (u - 0.1) / 0.36;
      if (g > 0 && g < 1) {
        const k = Math.sin(Math.PI * g) ** 0.6;
        p.set(0, 1.35, 3.4).applyMatrix4(m4);
        e.set(0, yaw, 0);
        q.setFromEuler(e);
        sc.set(0.4 + 0.75 * k, (0.35 + 0.9 * k) * (calm ? 0.8 : 1), 0.4 + 0.75 * k);
        p.y = Math.max(p.y, 0.2) + g * 1.2;
        critters.set(wh.first + 2, m4.compose(p, q, sc));
      } else critters.hide(wh.first + 2);
    }
    // the pennants stream out in the wind
    for (const fl of flags) {
      e.set(Math.sin(t * 3.7 + fl.ph) * 0.06, -0.6 + Math.sin(t * 2.3 + fl.ph) * 0.22 + Math.sin(t * 5.1 + fl.ph) * 0.06, 0);
      q.setFromEuler(e);
      sc.set(1 + Math.sin(t * 4.3 + fl.ph) * 0.06, 1, 1);
      critters.set(fl.first, m4.compose(p.set(fl.x, fl.y, fl.z), q, sc));
    }
    critters.commit();
    // the lighthouse beam: a slow sweep, fading as it turns towards the camera
    const ang = t * 0.35;
    beam.rotation.y = ang;
    const cam = fctx && fctx.camera;
    let face = 0;
    if (cam && cam.position) {
      beamDir.set(Math.cos(ang), 0, -Math.sin(ang));
      const vx = cam.position.x - lantern.x;
      const vz = cam.position.z - lantern.z;
      const vl = Math.hypot(vx, vz) || 1;
      face = Math.abs((beamDir.x * vx + beamDir.z * vz) / vl);
    }
    beamMat.opacity = 1 - smooth(0.62, 0.92, face);
    beam.visible = beamMat.opacity > 0.02;
    // the rogue wave, and the horn's rings while it is a warning
    const hz = fctx && fctx.hazards;
    let snapRogue = null;
    try {
      snapRogue = hz && typeof hz === 'object' ? hz.rogue : null;
    } catch {
      snapRogue = null;
    }
    const cur = rogue.update(t, step, snapRogue, cam, calm);
    const want = cur && cur.live && cur.warning ? 1 : 0;
    ringsOn = want > ringsOn ? Math.min(1, ringsOn + step * 4) : Math.max(0, ringsOn - step * 2);
    rings.uniforms.uOn.value = ringsOn;
    rings.uniforms.uTime.value = t;
    rings.uniforms.uCalm.value = calm ? 1 : 0;
    if (ringWarm > 0) ringWarm--;
    rings.mesh.visible = ringsOn > 0.01 || ringWarm > 0;
  }

  function dispose() {
    scene.remove(root);
    for (const g of ownGeos) g.dispose();
    critters.dispose();
    rogue.dispose();
    for (const m of own) m.dispose();
  }

  // on the mainland (inside the cliffs' waterline) or on any islet or rock
  const isLand = (x, z) => {
    if (!finite(x) || !finite(z)) return false;
    for (const c of colliders) if (Math.hypot(x - c.x, z - c.z) < c.r) return true;
    return pointInPoly(x, z, upland);
  };

  return {
    worldRadius: WORLD_R,
    colliders,
    playerStart,
    enemySpawns,
    reefs: [],
    crateSpots,
    rogueDirs,
    isLand,
    update,
    dispose,
    group: root,
  };

  // fynbos: a clump of grey-green and olive bushes, a pink protea on some (hoisted: used above)
  function fynbos(parent, x, y, z, s) {
    const n = 2 + Math.floor(rand() * 2);
    for (let k = 0; k < n; k++) {
      const a = rand() * 6.28;
      const d = k ? 0.6 * s : 0;
      const r = (0.55 + rand() * 0.35) * s;
      const b = mesh(parent, sphere(10, 7), pm(rand() < 0.3 ? C.bushGrey : C.bush[Math.floor(rand() * 3)]), x + Math.cos(a) * d, y + r * 0.55, z + Math.sin(a) * d);
      b.scale.set(r, r * 0.8, r);
    }
    if (rand() < 0.38) {
      const fx = x + (rand() - 0.5) * s;
      const fz = z + (rand() - 0.5) * s;
      const fy = y + 0.9 * s;
      mesh(parent, sphere(8, 6), pm(C.protea), fx, fy, fz).scale.setScalar(0.3 * s);
      const tip = mesh(parent, cone(1, 1, 8), pm(C.proteaTip), fx, fy + 0.22 * s, fz);
      tip.scale.set(0.22 * s, 0.32 * s, 0.22 * s);
    } else if (rand() < 0.3) {
      for (let k = 0; k < 3; k++) {
        const rd = mesh(parent, cone(1, 1, 5), pm(C.reed), x + (rand() - 0.5) * s, y + 0.5 * s, z + (rand() - 0.5) * s);
        rd.scale.set(0.12 * s, 1.0 * s, 0.12 * s);
        rd.rotation.z = (rand() - 0.5) * 0.4;
      }
    }
  }
}
