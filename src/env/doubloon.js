import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, setOutline, noOutline, mergeStatic, gradientMap, ensureIndex } from '../style.js';
import { waveHeight } from '../scenery.js';

// Level 4, "Doubloon Bay" (SPEC2 §6.4): golden hour over Port Doubloon.
//
// Map (north = -z, east = +x; the arena is the disc of radius WORLD_R around 0,0):
// - Port Doubloon fills the north: a round harbour basin (centre HB) closed by two curved stone
//   moles, a lighthouse on the west mole head, a green beacon on the east one and a log boom across
//   the narrow mouth, so the merchantmen at anchor inside stay behind colliders. A stone quay rings
//   the basin; the white, terracotta-roofed town climbs two terraces to the clifftop, where a
//   crenellated town wall with round towers, a bell tower hung with bunting and a gold-domed
//   treasury crown it. Treasure chests are stacked on the quay.
// - west of the harbour a long palm-lined beach curves away to the south-west under low grassy
//   dunes; an old jetty of pilings with pelicans on them stands off the beach
// - east of the harbour sandstone cliffs run out to a headland crowned by a ruined star fort
//   (a crumbled bastion, old cannons, sentry boxes and a tattered flag)
// - in the bay: pale golden sandbars (env.reefs: deep hulls slow down, so the galleons keep to
//   the channels between them), a beached wreck on the biggest sandbar, a few rocky islets
// - the open sea is south: the treasure galleons run for two escape gates (env.escapes) on the
//   southern edge, each marked by a red and a green channel buoy and a faint ring of foam
//
// Gameplay data (checked by the harness and the smoke layout check): every escape gate lies
// within 125 of the centre, the convoy starts sit in open water off the harbour mouth 130-150
// from both gates, and the enemy spawns are open water 58-92 from the player's start.

export const meta = {
  name: 'Doubloon Bay',
  place: 'Doubloon Bay',
  subtitle: 'Golden hour over Port Doubloon. Treasure galleons run for the open sea.',
};

export const palette = {
  skyTop: 0x3b6fd6,
  skyHorizon: 0xffc27a,
  sunColor: 0xffd9a0,
  sunDir: [-0.7, 0.3, 0.4],
  sunIntensity: 2.3,
  hemiSky: 0xffe2b8,
  hemiGround: 0x5a6a8a,
  hemiIntensity: 1.3,
  fogColor: 0xffd6a8,
  fogNear: 140,
  fogFar: 380,
  waterDeep: 0x1f6fb5,
  waterShallow: 0x4cc6d8,
  waterFoam: 0xffffff,
  waveAmp: 0.6,
  cloudColor: 0xfff1dc,
  cloudShade: 0xf2b48a,
  cloudCount: 10,
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
const WORLD_R = 150;
const DEG = Math.PI / 180;
const HB = { x: 0, z: -80 }; // centre of the round harbour basin
const hb = (a, r) => [HB.x + Math.cos(a) * r, HB.z + Math.sin(a) * r];
const QUAY_R = 30; // the quay wall rings the basin at this radius
const QUAY_OUT = 72; // outer edge of the quay level (under the cliffs and dunes)
const QUAY_A0 = 156 * DEG; // the quay runs round the north from QUAY_A0 to QUAY_A1
const QUAY_A1 = 384 * DEG;
const QUAY_Y = 2.5;
const TERRACES = [
  { r: 38, y: 6.0, a0: 189, a1: 351 },
  { r: 46, y: 9.8, a0: 197, a1: 343 },
];
const BACK_R = 56; // cliff behind the terraces, up to TOP
const TOP = 13.6; // clifftop (town, headland)
const LOW = 4.6; // grassy dunes behind the west beach
const MOLE_R = 33.5; // moles: arcs round HB
const MOLE_W = 4.4;
const MOLES = [
  { a0: 158 * DEG, a1: 100 * DEG }, // west, the lighthouse on its head
  { a0: 22 * DEG, a1: 80 * DEG }, // east, the beacon on its head
];
const LIGHTHOUSE = hb(100 * DEG, MOLE_R);
const BEACON = hb(80 * DEG, MOLE_R);
const FORT = { x: 99, z: -21 }; // the ruined star fort on the east headland

// Beach waterline, south-west to north-east (land on the left), ending at the quay's sea wall.
const WEST = [[-236, 110], [-200, 74], [-168, 42], [-142, 14], [-118, -8], [-97, -27], [-80, -40], hb(QUAY_A0, QUAY_OUT)];
// Cliff foot from the quay's east sea wall round the fort headland and away to the east.
const EAST = [
  hb(QUAY_A1, QUAY_OUT), [71, -46.5], [75.5, -39.5], [77.5, -30], [78.5, -19], [83, -8.5], [92, -1.5], [103, 0], [112.5, -4.5],
  [119, -13], [126, -21], [137, -21], [149, -13], [165, 1], [200, 30], [260, 82],
];
const BEACH_W = 17; // sand from the waterline to the dunes

const PLAYER_START = { x: -24, z: 34, h: Math.atan2(HB.x + 10 - -24, HB.z - 34) }; // mid-bay, facing the harbour
// Where the treasure galleons set out (open water off the harbour mouth; mechanics.js 'convoy').
const CONVOY_STARTS = [
  { x: -10, z: -18, h: 0 },
  { x: 0, z: -25, h: 0 },
  { x: 10, z: -18, h: 0 },
];
// The escape gates on the southern edge (<= 125 from the centre, inside worldRadius - 25).
const ESCAPES = [
  { x: -58, z: 110, r: 10 },
  { x: 60, z: 109, r: 10 },
];
// Sandbars: shallows that slow deep hulls (env.reefs). They lie across the routes from the
// harbour mouth to the gates, so a galleon threads the channels between them.
const SANDBARS = [
  { x: -66, z: 6, r: 14 }, // the wreck's bar (a sand island in its middle)
  { x: -30, z: 66, r: 10 },
  { x: 30, z: 62, r: 10.5 },
  { x: 3, z: 104, r: 8.5 },
  { x: -88, z: 88, r: 9 },
  { x: 86, z: 82, r: 9 },
  { x: 58, z: 20, r: 8 },
  { x: -104, z: 40, r: 7.5 },
];
const WRECK = { x: -66, z: 6, r: 6 }; // sand island with the beached wreck
// Islets: [x, z, r, h, kind]
const ISLETS = [
  [94, 48, 5, 7, 'rock'],
  [-112, 66, 6.5, 3.2, 'palms'],
  [120, 26, 3.2, 12, 'stack'],
  [127, 32, 2.2, 7, 'stack'],
  // beyond the edge of the arena
  [-160, 120, 9, 3.4, 'palms'],
  [-120, 165, 5, 10, 'stack'],
  [150, 120, 7, 8, 'rock'],
  [178, 92, 10, 4, 'palms'],
  [60, 200, 6, 9, 'rock'],
];
// An old jetty of pilings off the beach: [x, z] of the waterline point it starts from.
const JETTY = { at: 0.66, len: 15, n: 7 };

// ---------------------------------------------------------------------------
// Colours (cel-shaded materials from style.js)
// ---------------------------------------------------------------------------
const COL = {
  rock1: 0xb8774c, rock2: 0xdca46a, rock3: 0xf0d29a, grass: 0x8cc653, grass2: 0x74b548, sand: 0xf7dc9c, wetsand: 0xe6c17e,
  dune: 0xf1d08a, boulder: 0xa08c7c, stone: 0xdccaa6, paving: 0xf0e2c3, white: 0xfbf6ec, cream: 0xf6e3bd,
  ochre: 0xf3c56c, peach: 0xf9c4a0, rose: 0xf4a9a0, roof: 0xdd6339, roof2: 0xc5502f, window: 0x2b3866,
  frame: 0xfffaf0, door: 0x7b4a2b, shutter1: 0x3f87cc, shutter2: 0x33a37a, wood: 0x9a6a40, woodDark: 0x6b4528,
  metal: 0x3b4258, iron: 0x2f3442, gold: 0xffc93c, red: 0xe2383d, canvas: 0xf6ecd2, chest: 0xa35a2c,
  palmTrunk: 0xb98a55, frond1: 0x4cae3e, frond2: 0x3a963a, bush: 0x4c9e3e, leaf: 0x62bd4a, cypress: 0x3e8a48,
  hill: 0x7fbe54, hill2: 0x67aa49, mountain: 0x9b8fcd, snow: 0xfff6ea, pelican: 0xf6f2ea, pelicanWing: 0xcfcbc4,
  beak: 0xffad33, pouch: 0xf28d3c, gull: 0xfdfdfd, gullWing: 0xdfe7f0, buoyRed: 0xe63b3b, buoyGreen: 0x2fa84f,
  thatch: 0xd9b36a, awning1: 0xe2383d, awning2: 0x2f7fd6, cannon: 0x34343c, rubble: 0xc9b38e,
};
const WALLS = ['white', 'white', 'cream', 'white', 'ochre', 'white', 'peach', 'cream', 'white', 'rose'];

// ---------------------------------------------------------------------------
// Painted detail (as in europe.js): one tiling texture of hand-drawn marks (R cracks, G grass
// tufts, B sand speckles, A scattered bricks), projected in world space by the land materials.
// ---------------------------------------------------------------------------
const PAINT_RES = 512;
const PAINT_TILE = 30;
let PAINT_TEX = null;
function paintTexture() {
  if (PAINT_TEX) return PAINT_TEX;
  const N = PAINT_RES;
  const ch = [0, 1, 2, 3].map(() => new Float32Array(N * N).fill(1));
  const r = mulberry32(8086);
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
  const [R, G, B, A] = ch;
  // R: zig-zag cracks down the cliff face, ledges and pits
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
    if (r() < 0.6 && pts.length > 3) {
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
  // G: three-blade grass tufts
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
  // B: sand speckles and little shells
  for (let k = 0; k < 260; k++) dab(B, r() * N, r() * N, 0.8 + r() * 1.0, 0.3);
  for (let k = 0; k < 16; k++) {
    const x = r() * N;
    const y = r() * N;
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push([x + Math.cos((i / 8) * Math.PI) * 4, y + Math.sin((i / 8) * Math.PI) * 4]);
    stroke(B, pts, 1.1, 1.1, 0.2);
  }
  // A: masonry in little clusters, like a painter indicating stonework
  const BH = N / 40;
  const BW = N / 20;
  const brick = (row, col) => {
    const x0 = col * BW + (row % 2 ? BW / 2 : 0) + 1.6;
    const y0 = row * BH + 1.6;
    const w = BW - 3.2;
    const h = BH - 3.2;
    const c = 2.2;
    stroke(A, [[x0 + c, y0], [x0 + w - c, y0], [x0 + w, y0 + c], [x0 + w, y0 + h - c], [x0 + w - c, y0 + h], [x0 + c, y0 + h], [x0, y0 + h - c], [x0, y0 + c], [x0 + c, y0]], 1.05, 1.05);
  };
  for (let k = 0; k < 30; k++) {
    const row = Math.floor(r() * 40);
    const col = Math.floor(r() * 20);
    brick(row, col);
    if (r() < 0.75) brick(row, col + 1);
    if (r() < 0.55) brick(row + 1, col + (row % 2 ? 1 : 0));
    if (r() < 0.3) brick(row - 1, col);
  }
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = Math.round(R[i] * 255);
    data[i * 4 + 1] = Math.round(G[i] * 255);
    data[i * 4 + 2] = Math.round(B[i] * 255);
    data[i * 4 + 3] = Math.round(A[i] * 255);
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

// How strongly each land material shows each kind of mark: [cracks, tufts, speckles, bricks].
const PAINT = {
  rock1: { side: [0.42, 0, 0, 0], top: [0.12, 0, 0, 0] },
  rock2: { side: [0.38, 0, 0, 0], top: [0.1, 0, 0, 0] },
  rock3: { side: [0.34, 0, 0, 0], top: [0, 0, 0, 0] },
  boulder: { side: [0.3, 0, 0, 0], top: [0.2, 0, 0, 0] },
  grass: { side: [0, 0.2, 0, 0], top: [0, 0.3, 0, 0] },
  grass2: { side: [0, 0.2, 0, 0], top: [0, 0.3, 0, 0] },
  hill: { side: [0, 0.2, 0, 0], top: [0, 0.26, 0, 0] },
  hill2: { side: [0, 0.2, 0, 0], top: [0, 0.26, 0, 0] },
  sand: { side: [0, 0, 0.22, 0], top: [0, 0, 0.3, 0] },
  wetsand: { side: [0, 0, 0.16, 0], top: [0, 0, 0.2, 0] },
  dune: { side: [0, 0.12, 0.2, 0], top: [0, 0.16, 0.26, 0] },
  stone: { side: [0, 0, 0, 0.42], top: [0, 0, 0, 0.3] },
  paving: { side: [0, 0, 0, 0.3], top: [0, 0, 0, 0.36] },
  rubble: { side: [0.25, 0, 0, 0.3], top: [0.1, 0, 0, 0.2] },
};
const PAINT_VERT_PARS = 'varying vec3 vPaintPos;\nvarying vec3 vPaintNrm;\n';
const PAINT_FRAG_PARS = `varying vec3 vPaintPos;
varying vec3 vPaintNrm;
uniform sampler2D uPaint;
uniform vec4 uPaintSide;
uniform vec4 uPaintTop;
`;
const PAINT_FRAG = `
  {
    vec3 pn = normalize(vPaintNrm);
    vec3 bw = pow(abs(pn), vec3(4.0));
    bw /= max(1e-4, bw.x + bw.y + bw.z);
    vec3 pp = vPaintPos * ${(1 / PAINT_TILE).toFixed(6)};
    vec4 tX = vec4(1.0) - texture2D(uPaint, pp.zy);
    vec4 tZ = vec4(1.0) - texture2D(uPaint, pp.xy);
    vec4 tY = vec4(1.0) - texture2D(uPaint, pp.xz);
    float ink = dot(tX, uPaintSide) * bw.x + dot(tZ, uPaintSide) * bw.z + dot(tY, uPaintTop) * bw.y;
    diffuseColor.rgb *= 1.0 - clamp(ink, 0.0, 0.8);
  }
`;
function paintedToon(color, p) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(3) });
  setOutline(m);
  const tex = paintTexture();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPaint = { value: tex };
    shader.uniforms.uPaintSide = { value: new THREE.Vector4(...p.side) };
    shader.uniforms.uPaintTop = { value: new THREE.Vector4(...p.top) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PAINT_VERT_PARS}`)
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n  vPaintPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vPaintNrm = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PAINT_FRAG_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${PAINT_FRAG}`);
  };
  m.customProgramCacheKey = () => 'doubloon-painted-toon';
  return m;
}

// Materials are cached for the module's lifetime (like style.js toon()).
const M = {};
const NO_LINE = new Set(['window', 'door']);
function mat(name) {
  if (!M[name]) M[name] = PAINT[name] ? paintedToon(COL[name], PAINT[name]) : toon(COL[name], NO_LINE.has(name) ? { outline: false } : {});
  return M[name];
}
const LIT = () => toon(0xffe2a0, { emissive: 0xffb347, emissiveIntensity: 0.75, outline: false });
const GOLD_GLINT = () => toon(COL.gold, { emissive: 0x8a5a00, emissiveIntensity: 0.5 });

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
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

function mesh(parent, geo, material, x = 0, y = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  parent.add(m);
  return m;
}

const geoCache = new Map();
function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
const rbox = (w, h, d, r = 0.2, seg = 1) =>
  cached(`rb${w},${h},${d},${r},${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01)));
const box = (w, h, d) => cached(`bx${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const sphere = (r, ws = 16, hs = 12) => cached(`sp${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
const cyl = (rt, rb, h, seg = 14) => cached(`cy${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const cone = (r, h, seg = 14) => cached(`co${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg));

function smooth(g) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  const w = mergeVertices(g, 1e-3);
  w.computeVertexNormals();
  return w;
}
function lathe(profile, seg = 20) {
  const pts = profile[0][1] > profile[profile.length - 1][1] ? profile.slice().reverse() : profile;
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

// Polylines are arrays of [x, z].
function spline(ctrl, step = 2) {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n).map((v) => [v.x, v.z]);
}
function arcPts(cx, cz, r, a0, a1, step = 2) {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}
function linePts(a, b, step = 2) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
  const out = [];
  for (let i = 0; i <= n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return out;
}
function join(...parts) {
  const out = [];
  for (const part of parts) {
    for (const q of part) {
      const l = out[out.length - 1];
      if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 0.05) out.push(q.slice());
    }
  }
  return out;
}
// Left-hand normals of an open polyline (pointing inland for our coasts).
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
// Normals of a smoothed copy of the line (tangents averaged over +-k points), so wide offsets from
// a wobbly line never fold over themselves.
function softNormals(line, k = 6) {
  return line.map((p, i) => {
    const a = line[Math.max(0, i - k)];
    const b = line[Math.min(line.length - 1, i + k)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    return [dz / l, -dx / l];
  });
}
function offsetLine(line, d, n = softNormals(line)) {
  return line.map((p, i) => [p[0] + n[i][0] * d, p[1] + n[i][1] * d]);
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
function distToLine(x, z, line) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1];
    const [bx, bz] = line[i];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

// One rounded "pancake" layer of land: the polygon extruded from y0 to y1 with a soft bevel.
function slab(parent, poly, y0, y1, bevel, material, bevelSegments = 3, warp = null) {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const bt = Math.max(0.05, Math.min(bevel, (y1 - y0) / 2 - 0.05));
  const depth = Math.max(0.02, y1 - y0 - 2 * bt);
  let g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bevel, bevelSegments, steps: 1, curveSegments: 2,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + bt, 0);
  if (warp) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + warp(p.getX(i), p.getY(i), p.getZ(i)));
  }
  g = smooth(g);
  return mesh(parent, g, material);
}
// Stacked strata: layers [{y0, y1, inset, bevel, mat, wob}] inside the polygon.
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

// Shared vertex-coloured toon material: an animated prop collapses into one mesh.
let VC_MAT = null;
function vcMaterial() {
  if (!VC_MAT) {
    VC_MAT = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(3) });
    setOutline(VC_MAT);
  }
  return VC_MAT;
}
function bake(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const geos = [];
  const victims = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.geometry;
    const g = src.index && !src.attributes.normal ? src.toNonIndexed() : new THREE.BufferGeometry().copy(src);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    ensureIndex(g);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const c = o.material.color;
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
    victims.push(o);
  });
  for (const v of victims) v.parent.remove(v);
  for (const c of [...group.children]) if (!c.isMesh && c.children.length === 0) group.remove(c);
  const m = new THREE.Mesh(mergeGeometries(geos, false), vcMaterial());
  group.add(m);
  return m;
}

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

// A strip of ground along a line: rows [[offset inland, y]], from the waterline up the beach.
function ribbon(line, rows, nrm = softNormals(line)) {
  const pos = [];
  for (let i = 0; i < line.length; i++) for (const [d, y] of rows) pos.push(line[i][0] + nrm[i][0] * d, y, line[i][1] + nrm[i][1] * d);
  const idx = [];
  const W = rows.length;
  for (let i = 0; i < line.length - 1; i++) {
    for (let j = 0; j < W - 1; j++) {
      const a = i * W + j;
      const b = (i + 1) * W + j;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(W + 1) < 0) {
    for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
function tree(parent, x, y, z, s, rand) {
  mesh(parent, cyl(0.28 * s, 0.38 * s, 2.2 * s, 8), mat('woodDark'), x, y + 1.0 * s, z);
  for (const [bx, by, bz, br] of [[0, 2.9, 0, 1.45], [0.85, 2.4, 0.3, 1.05], [-0.75, 2.5, -0.35, 1.1]]) {
    const m = mesh(parent, sphere(br * s, 12, 8), mat('leaf'), x + bx * s, y + by * s, z + bz * s);
    m.scale.y = 0.92 + rand() * 0.15;
  }
}
function cypress(parent, x, y, z, s) {
  mesh(parent, cyl(0.2 * s, 0.26 * s, 1.2 * s, 8), mat('woodDark'), x, y + 0.5 * s, z);
  const m = mesh(parent, cached('cypress', () => new THREE.CapsuleGeometry(0.85, 3.6, 5, 10)), mat('cypress'), x, y + 3.2 * s, z);
  m.scale.setScalar(s);
}
function bush(parent, x, y, z, s, m = 'bush') {
  const b = mesh(parent, sphere(1, 11, 8), mat(m), x, y, z);
  b.scale.set(1.25 * s, 0.85 * s, 1.1 * s);
}
function boulder(parent, x, y, z, s, rand, material) {
  const m = mesh(parent, sphere(1, 11, 8), material, x, y, z, rand() * Math.PI);
  m.scale.set(s * (1.0 + rand() * 0.35), s * (0.7 + rand() * 0.25), s * (0.85 + rand() * 0.3));
  return m;
}

// Palm fronds: a V-folded leaf that arches up and droops (one shared geometry).
function frondGeometry() {
  return cached('frond', () => {
    const g = new THREE.SphereGeometry(1, 10, 3);
    g.scale(0.5, 0.12, 1.75);
    g.translate(0, 0, 1.65);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      const x = p.getX(i);
      p.setY(i, p.getY(i) + 0.42 * Math.abs(x) + 0.42 * z - 0.2 * z * z);
      p.setX(i, x * (1 - 0.3 * Math.max(0, z - 1.4)));
    }
    return smooth(g);
  });
}
// A palm leaning along (dirX, dirZ).
function palm(parent, x, y, z, dirX, dirZ, s, rand) {
  const H = (5.4 + rand() * 2.4) * s;
  const lean = (1.4 + rand() * 2.4) * s;
  const pts = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const off = lean * Math.pow(t, 1.7);
    pts.push(new THREE.Vector3(x + dirX * off, y - 0.4 + (H + 0.4) * t, z + dirZ * off));
  }
  mesh(parent, tubeAlong(pts, (t) => (0.36 - 0.13 * t) * s * (1 + 0.12 * Math.max(0, Math.sin(t * Math.PI * 9))), 7), mat('palmTrunk'));
  const top = pts[N];
  const frond = frondGeometry();
  const nF = 7;
  const a0 = rand() * 6;
  for (let i = 0; i < nF; i++) {
    const m = mesh(parent, frond, mat(i % 2 ? 'frond2' : 'frond1'), top.x, top.y, top.z);
    m.rotation.order = 'YXZ';
    m.rotation.y = a0 + (i / nF) * Math.PI * 2 + (rand() - 0.5) * 0.4;
    m.rotation.x = -0.1 + (rand() - 0.5) * 0.3;
    m.scale.setScalar(s * (0.95 + rand() * 0.2));
  }
  const tuft = mesh(parent, sphere(1, 10, 8), mat('frond1'), top.x, top.y + 0.15 * s, top.z);
  tuft.scale.set(0.55 * s, 0.4 * s, 0.55 * s);
  for (let i = 0; i < 2; i++) {
    const a = a0 + i * 2.6;
    mesh(parent, sphere(0.3 * s, 8, 6), mat('woodDark'), top.x + Math.cos(a) * 0.38 * s, top.y - 0.35 * s, top.z + Math.sin(a) * 0.38 * s);
  }
}

// Chevron roof lid (as europe.js) for a span x len footprint, ridge along local z.
function gableGeos(span, len, rh) {
  const gable = cached(`gable${span},${len},${rh}`, () => {
    const s = new THREE.Shape([new THREE.Vector2(-span / 2 + 0.05, 0), new THREE.Vector2(span / 2 - 0.05, 0), new THREE.Vector2(0, rh)]);
    const geo = new THREE.ExtrudeGeometry(s, { depth: len - 0.12, bevelEnabled: false });
    geo.translate(0, 0, -(len - 0.12) / 2);
    return geo;
  });
  const ov = 0.45;
  const t = 0.42;
  const a = span / 2 + ov;
  const slope = rh / (span / 2);
  const b = slope * a;
  const roof = cached(`roof${span},${len},${rh}`, () => {
    const s = new THREE.Shape([
      new THREE.Vector2(-a, 0), new THREE.Vector2(0, b), new THREE.Vector2(a, 0),
      new THREE.Vector2(a, -t), new THREE.Vector2(0, b - t), new THREE.Vector2(-a, -t),
    ]);
    const geo = new THREE.ExtrudeGeometry(s, { depth: len + 0.7, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 1 });
    geo.translate(0, 0, -(len + 0.7) / 2);
    return geo;
  });
  return { gable, roof, lift: t - slope * ov };
}
// Hipped (pyramid-ish) terracotta roof over a w x d footprint, with eaves.
function hipGeo(w, d, rh) {
  return cached(`hip${w},${d},${rh}`, () => {
    const a = w / 2 + 0.5;
    const b = d / 2 + 0.5;
    const r = Math.max(0, a - b) * 0.9;
    const q = Math.max(0, b - a) * 0.9;
    const T = 0.35;
    const P = [
      [-a, 0, b], [a, 0, b], [a, 0, -b], [-a, 0, -b], // eave corners
      [-r, rh, q], [r, rh, q], [r, rh, -q], [-r, rh, -q], // ridge
      [-a, -T, b], [a, -T, b], [a, -T, -b], [-a, -T, -b], // under the eave
    ];
    const F = [
      [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], // slopes
      [8, 9, 1, 0], [9, 10, 2, 1], [10, 11, 3, 2], [11, 8, 0, 3], // eave edges
      [11, 10, 9, 8], // underside
    ];
    const pos = [];
    for (const f of F) {
      const quad = f.map((i) => P[i]);
      for (const tri of [[0, 1, 2], [0, 2, 3]]) for (const k of tri) pos.push(...quad[k]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return smooth(g);
  });
}

// A whitewashed house; local +z is the front (faces the harbour).
function house(parent, x, y, z, ry, o) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  parent.add(g);
  const { w, d, h } = o;
  const wall = mat(o.wall);
  mesh(g, rbox(w, h + 0.4, d, 0.25), wall, 0, (h + 0.4) / 2 - 0.4, 0);
  if (o.roof === 'hip') {
    mesh(g, hipGeo(w, d, o.rh), mat(o.roof2 ? 'roof2' : 'roof'), 0, h, 0);
  } else if (o.roof === 'flat') {
    // a flat roof terrace with a parapet, and a little dome or a water barrel on it
    mesh(g, rbox(w + 0.25, 0.7, d + 0.25, 0.2), wall, 0, h + 0.1, 0);
    mesh(g, rbox(w - 0.6, 0.3, d - 0.6, 0.12), mat('paving'), 0, h + 0.38, 0);
    if (o.dome) {
      mesh(g, cyl(1.0, 1.0, 0.6, 14), wall, w * 0.18, h + 0.75, -d * 0.12);
      mesh(g, cached('hdome', () => new THREE.SphereGeometry(1.0, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), mat(o.dome), w * 0.18, h + 1.02, -d * 0.12);
    } else {
      mesh(g, cached('wbarrel', () => lathe([[0, -0.55], [0.5, -0.55], [0.6, 0], [0.5, 0.55], [0, 0.55]], 12)), mat('woodDark'), -w * 0.22, h + 1.1, -d * 0.15);
    }
  } else {
    const span = o.ridgeX ? d : w;
    const len = o.ridgeX ? w : d;
    const { gable, roof, lift } = gableGeos(span, len, o.rh);
    const gm = mesh(g, gable, wall, 0, h, 0);
    const rm = mesh(g, roof, mat(o.roof2 ? 'roof2' : 'roof'), 0, h - 0.05 + lift, 0);
    if (o.ridgeX) {
      gm.rotation.y = Math.PI / 2;
      rm.rotation.y = Math.PI / 2;
    }
  }
  if (o.chimney && o.roof !== 'flat') mesh(g, rbox(0.75, 1.9, 0.75, 0.15), wall, (w / 4) * o.chimney, h + o.rh * 0.5 + 0.3, -d / 5);
  // windows with shutters, and the door
  const fz = d / 2 + 0.02;
  const floors = Math.max(1, Math.round((h - 0.6) / 2.1));
  const fh = (h - 0.3) / floors;
  const cols = w > 4.6 ? [-w / 3.2, w / 3.2] : [-w / 4, w / 4];
  const win = box(0.78, 1.05, 0.22);
  const sh = box(0.32, 1.12, 0.12);
  const shutter = mat(o.shutter);
  for (let f = 0; f < floors; f++) {
    const wy = f * fh + fh * 0.55;
    for (let c = 0; c < cols.length; c++) {
      if (f === 0 && c === (o.doorLeft ? 0 : 1)) {
        mesh(g, rbox(1.15, 1.95, 0.22, 0.12), mat('door'), cols[c], 0.92, fz);
        mesh(g, rbox(1.45, 2.2, 0.14, 0.12), mat('frame'), cols[c], 1.02, fz - 0.03);
        continue;
      }
      const lit = o.lit && ((f + c + o.lit) % 3 === 0);
      mesh(g, win, lit ? LIT() : mat('window'), cols[c], wy, fz + 0.03);
      mesh(g, sh, shutter, cols[c] - 0.6, wy, fz + 0.02);
      mesh(g, sh, shutter, cols[c] + 0.6, wy, fz + 0.02);
      if (f > 0 && o.balcony && c === 0) {
        mesh(g, rbox(1.9, 0.18, 0.8, 0.06), mat('woodDark'), cols[c], wy - 0.65, fz + 0.35);
        mesh(g, rbox(1.9, 0.5, 0.1, 0.04), mat('woodDark'), cols[c], wy - 0.35, fz + 0.72);
      }
    }
  }
  return g;
}

// Crenellated wall from a to b (x, z), foot at y, height h.
function wallSeg(parent, a, b, y, h, t = 1.5, material = mat('white')) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ry = Math.atan2(b[0] - a[0], b[1] - a[1]) + Math.PI / 2;
  const cx = (a[0] + b[0]) / 2;
  const cz = (a[1] + b[1]) / 2;
  mesh(parent, rbox(len + 0.4, h, t, 0.25), material, cx, y + h / 2, cz, ry);
  const n = Math.max(1, Math.floor(len / 1.8));
  const ux = (b[0] - a[0]) / len;
  const uz = (b[1] - a[1]) / len;
  for (let i = 0; i < n; i += 2) {
    const s = -len / 2 + (i + 0.5) * (len / n);
    mesh(parent, rbox(0.95, 0.95, t + 0.1, 0.15), material, cx + ux * s, y + h + 0.38, cz + uz * s, ry);
  }
}
// Round tower with a crenellated crown.
function roundTower(parent, x, y0, z, r, h, material = mat('white')) {
  mesh(parent, cyl(r, r * 1.08, h, 18), material, x, y0 + h / 2, z);
  mesh(parent, cyl(r + 0.35, r + 0.35, 0.55, 18), mat('stone'), x, y0 + h + 0.2, z);
  const n = Math.max(6, Math.round((r * Math.PI * 2) / 1.9));
  for (let i = 0; i < n; i += 1) {
    if (i % 2) continue;
    const a = (i / n) * Math.PI * 2;
    mesh(parent, rbox(0.95, 0.95, 0.75, 0.15), material, x + Math.cos(a) * (r + 0.05), y0 + h + 0.95, z + Math.sin(a) * (r + 0.05), -a + Math.PI / 2);
  }
  mesh(parent, cyl(r - 0.2, r - 0.2, 0.2, 16), mat('paving'), x, y0 + h + 0.5, z);
}

// A flag on a pole (the flag is animated; the pole static). Tattered flags get ragged notches.
function flag(parent, animParent, x, y, z, color, size, flags, rand, kind = 'flag', poleH = 4.2) {
  mesh(parent, cyl(0.12, 0.15, poleH, 8), mat('metal'), x, y + poleH / 2, z);
  mesh(parent, sphere(0.24, 10, 8), mat('gold'), x, y + poleH + 0.1, z);
  const L = size;
  const Hh = size * 0.62;
  const geo = cached(`flag${L},${kind}`, () => {
    let pts;
    if (kind === 'pennant') pts = [[0, 0], [L, Hh * 0.5], [0, Hh]];
    else if (kind === 'tattered') {
      pts = [[0, 0], [L * 0.62, 0.05 * Hh], [L * 0.7, Hh * 0.2], [L * 0.86, Hh * 0.14], [L * 0.8, Hh * 0.36], [L * 1.0, Hh * 0.42], [L * 0.74, Hh * 0.58], [L * 0.92, Hh * 0.78], [L * 0.64, Hh * 0.82], [L * 0.7, Hh * 0.98], [0, Hh]];
    } else pts = [[0, 0], [L, 0.08 * Hh], [L * 0.8, Hh * 0.5], [L, Hh * 0.92], [0, Hh]];
    const s = new THREE.Shape(pts.map(([px, py]) => new THREE.Vector2(px, py)));
    if (kind === 'tattered') {
      const hole = new THREE.Path();
      hole.absellipse(L * 0.42, Hh * 0.55, L * 0.07, Hh * 0.09, 0, Math.PI * 2, false);
      s.holes.push(hole);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 1, steps: 1 });
    g.translate(0, -Hh, -0.06);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const fx = p.getX(i);
      p.setZ(i, p.getZ(i) + Math.sin(fx * 1.9) * 0.22 * (fx / L));
    }
    g.computeVertexNormals();
    return g;
  });
  const f = new THREE.Mesh(geo, toon(color));
  f.position.set(x, y + poleH - 0.05, z);
  f.userData.keep = true;
  f.userData.phase = rand() * 10;
  animParent.add(f);
  flags.push(f);
  return f;
}

// Treasure chest (local +z front), optionally open and heaped with gold.
function chest(parent, x, y, z, ry, s, open, gold) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.scale.setScalar(s);
  parent.add(g);
  mesh(g, rbox(2.0, 1.2, 1.3, 0.16), mat('chest'), 0, 0.6, 0);
  for (const sx of [-0.62, 0.62]) mesh(g, rbox(0.2, 1.24, 1.36, 0.06), gold, sx, 0.6, 0);
  mesh(g, rbox(0.34, 0.4, 0.16, 0.06), gold, 0, 0.82, 0.68);
  const lidGeo = cached('chestLid', () => new THREE.CylinderGeometry(0.66, 0.66, 2.0, 14).rotateZ(Math.PI / 2));
  const bandGeo = cached('chestBand', () => new THREE.CylinderGeometry(0.7, 0.7, 0.2, 14).rotateZ(Math.PI / 2));
  if (open) {
    const heap = mesh(g, sphere(1, 14, 9), gold, 0, 1.22, 0.05);
    heap.scale.set(0.86, 0.42, 0.56);
    const lid = new THREE.Group();
    lid.position.set(0, 1.2, -0.66);
    lid.rotation.x = -1.95;
    g.add(lid);
    mesh(lid, lidGeo, mat('chest'), 0, 0, 0.66).scale.set(1, 0.6, 1);
    for (const sx of [-0.62, 0.62]) mesh(lid, bandGeo, gold, sx, 0, 0.66).scale.set(1, 0.62, 1);
  } else {
    mesh(g, lidGeo, mat('chest'), 0, 1.2, 0).scale.set(1, 0.6, 1);
    for (const sx of [-0.62, 0.62]) mesh(g, bandGeo, gold, sx, 1.2, 0).scale.set(1, 0.62, 1);
  }
  return g;
}
const barrelGeo = () => cached('barrel', () => lathe([[0, -0.6], [0.48, -0.6], [0.58, 0], [0.48, 0.6], [0, 0.6]], 12));

// Old cannon on a wooden carriage, muzzle along local +z.
function cannon(parent, x, y, z, ry, s = 1, tipped = false) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.scale.setScalar(s);
  parent.add(g);
  if (!tipped) {
    mesh(g, rbox(1.3, 0.6, 2.0, 0.12), mat('woodDark'), 0, 0.55, -0.2);
    const wheel = cached('cWheel', () => new THREE.CylinderGeometry(0.42, 0.42, 0.22, 12).rotateZ(Math.PI / 2));
    for (const sx of [-0.72, 0.72]) for (const sz of [0.45, -0.85]) mesh(g, wheel, mat('wood'), sx, 0.42, sz);
  }
  const barrel = mesh(g, cached('cBarrel', () => lathe([[0, -1.25], [0.45, -1.25], [0.5, -1.0], [0.42, -0.9], [0.36, 1.1], [0.42, 1.2], [0.42, 1.38], [0.25, 1.4], [0, 1.4]], 12).rotateX(Math.PI / 2)), mat('cannon'), 0, tipped ? 0.42 : 1.05, 0.1);
  barrel.rotation.x = tipped ? 0.1 : -0.08;
  if (tipped) barrel.rotation.z = 0.4;
  mesh(g, sphere(0.25, 8, 6), mat('cannon'), 0, tipped ? 0.42 : 1.05, -1.35);
  return g;
}

// A sitting pelican (static), facing local +z.
function perchedPelican(parent, x, y, z, ry, s) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.scale.setScalar(s);
  parent.add(g);
  const body = mesh(g, sphere(1, 12, 9), mat('pelican'), 0, 0.62, -0.1);
  body.scale.set(0.55, 0.55, 0.85);
  body.rotation.x = -0.25;
  for (const sx of [-1, 1]) {
    const w = mesh(g, sphere(1, 10, 8), mat('pelicanWing'), sx * 0.4, 0.68, -0.25);
    w.scale.set(0.16, 0.38, 0.8);
    w.rotation.x = -0.3;
  }
  const neck = mesh(g, cached('pNeck', () => new THREE.CapsuleGeometry(0.16, 0.6, 3, 8)), mat('pelican'), 0, 1.2, 0.42);
  neck.rotation.x = 0.35;
  mesh(g, sphere(0.3, 12, 9), mat('pelican'), 0, 1.6, 0.52);
  const beak = mesh(g, cached('pBeak', () => new THREE.ConeGeometry(0.12, 1.3, 8).rotateX(Math.PI / 2)), mat('beak'), 0, 1.5, 1.15);
  beak.rotation.x = 0.35;
  const pouch = mesh(g, sphere(1, 10, 8), mat('pouch'), 0, 1.33, 1.02);
  pouch.scale.set(0.15, 0.17, 0.45);
  pouch.rotation.x = 0.35;
  const tail = mesh(g, cached('pTail', () => new THREE.ConeGeometry(0.25, 0.55, 8).rotateX(-Math.PI / 2)), mat('pelicanWing'), 0, 0.5, -1.0);
  tail.rotation.x = 0.4;
  for (const sx of [-0.18, 0.18]) mesh(g, cyl(0.07, 0.07, 0.35, 6), mat('beak'), sx, 0.12, 0.05);
}

// Channel buoy: a round float, a tapering tower and a topmark (can or cone), with a little flag.
function channelBuoy(color, top) {
  const g = new THREE.Group();
  mesh(g, cached('buoyFloat', () => lathe([[0, -0.7], [0.8, -0.62], [1.05, -0.2], [1.0, 0.2], [0.7, 0.42], [0, 0.45]], 16)), mat(color));
  mesh(g, cached('buoyBand', () => new THREE.TorusGeometry(1.0, 0.17, 6, 18).rotateX(Math.PI / 2)), mat('white'), 0, 0.05, 0);
  mesh(g, cached('buoyTower', () => lathe([[0.62, 0], [0.5, 0.9], [0.36, 1.7], [0, 1.72]], 12)), mat(color), 0, 0.4, 0);
  mesh(g, cyl(0.42, 0.42, 0.2, 12), mat('metal'), 0, 2.15, 0);
  if (top === 'can') mesh(g, cyl(0.38, 0.38, 0.7, 12), mat(color), 0, 2.6, 0);
  else mesh(g, cone(0.46, 0.85, 12), mat(color), 0, 2.67, 0);
  mesh(g, cyl(0.06, 0.06, 1.8, 6), mat('metal'), 0, 3.6, 0);
  const pen = mesh(g, cached('buoyPennant', () => {
    const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.3, -0.35), new THREE.Vector2(0, -0.7)]);
    return new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false });
  }), mat(color === 'buoyRed' ? 'red' : 'buoyGreen'), 0.04, 4.45, -0.03);
  pen.rotation.y = 0.3;
  return g;
}

// A merchantman at anchor (decor, baked into one mesh): a round-bellied hull with a sweeping sheer,
// a gilded wale, a tall stern castle with lit windows, three masts with furled sails, a pennant.
// Hull frame: u = 0 stern .. 1 bow; returns [half width, rim height above the midships rim, depth].
function hullProfile(u, L, W, D) {
  const hw = (W / 2) * (u < 0.2 ? 0.8 + 0.2 * Math.sin((u / 0.2) * Math.PI * 0.5) : Math.pow(Math.max(0, Math.cos(((u - 0.2) / 0.8) * Math.PI * 0.5)), 0.55));
  const rim = 0.45 * Math.pow(Math.max(0, (u - 0.66) / 0.34), 2) + 0.7 * Math.pow(Math.max(0, (0.22 - u) / 0.22), 1.5);
  const dd = D * (u < 0.5 ? 0.86 + 0.14 * (u / 0.5) : 1 - 0.38 * ((u - 0.5) / 0.5));
  return [Math.max(0.06, hw), rim, dd];
}
// Point on the hull side at depth `below` under the rim (side = +1 starboard x > 0, -1 port).
function hullSidePt(u, L, W, D, below, side) {
  const [hw, rim, dd] = hullProfile(u, L, W, D);
  const s = Math.min(1, Math.pow(Math.min(1, below / dd), 1.25));
  const th = Math.asin(s);
  return new THREE.Vector3(side * hw * Math.cos(th), rim - below, (u - 0.5) * L);
}
function merchantHullGeo(L, W, D) {
  return cached(`mhull${L},${W},${D}`, () => {
    const NU = 20;
    const NV = 12;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= NU; i++) {
      const u = i / NU;
      const [hw, rim, dd] = hullProfile(u, L, W, D);
      for (let j = 0; j <= NV; j++) {
        const th = (j / NV) * Math.PI;
        pos.push(hw * Math.cos(th), rim - dd * Math.pow(Math.sin(th), 0.8), (u - 0.5) * L);
      }
    }
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NV; j++) {
        const a = i * (NV + 1) + j;
        const b = a + NV + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    // deck: a fan over the rim; transom: a fan closing the stern
    const c = pos.length / 3;
    pos.push(0, -0.05, 0);
    const ring = [];
    for (let i = 0; i <= NU; i++) ring.push(i * (NV + 1));
    for (let i = NU; i >= 0; i--) ring.push(i * (NV + 1) + NV);
    for (let k = 0; k < ring.length; k++) idx.push(c, ring[k], ring[(k + 1) % ring.length]);
    const t0 = pos.length / 3;
    const [, rim0, d0] = hullProfile(0, L, W, D);
    pos.push(0, rim0 - d0 * 0.4, -L / 2);
    for (let j = 0; j < NV; j++) idx.push(t0, j + 1, j);
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g = smooth(g);
    // outward faces: the keel's normal must point down
    const p = g.attributes.position;
    let keel = 0;
    for (let i = 1; i < p.count; i++) if (p.getY(i) < p.getY(keel)) keel = i;
    if (g.attributes.normal.getY(keel) > 0) {
      const ii = g.index.array;
      for (let q = 0; q < ii.length; q += 3) [ii[q + 1], ii[q + 2]] = [ii[q + 2], ii[q + 1]];
      g.index.needsUpdate = true;
      g.computeVertexNormals();
    }
    return g;
  });
}
function merchantShip(paint, trimCol, sailCol, flagCol) {
  const g = new THREE.Group();
  const L = 12;
  const W = 4.3;
  const D = 2.9;
  const Y = 1.7; // rim height at midships
  const paintM = toon(paint);
  const trim = toon(trimCol);
  mesh(g, merchantHullGeo(L, W, D), mat('woodDark'), 0, Y, 0);
  // gunwale rails (paint) and a gilded wale along both sides
  for (const side of [-1, 1]) {
    const rail = [];
    const wale = [];
    for (let i = 0; i <= 16; i++) {
      const u = 0.02 + (i / 16) * 0.94;
      rail.push(hullSidePt(u, L, W, D, 0, side).setY(hullSidePt(u, L, W, D, 0, side).y + Y + 0.12));
      wale.push(hullSidePt(u, L, W, D, 0.85, side).add(new THREE.Vector3(0, Y, 0)));
    }
    mesh(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 32, 0.2, 6), paintM);
    mesh(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wale), 32, 0.14, 6), trim);
  }
  // stern castle: two decks stepping up, gilded edges, lit stern windows
  const [, rimS] = hullProfile(0.08, L, W, D);
  const sy = Y + rimS;
  mesh(g, rbox(W * 0.8, 1.5, 3.4, 0.3), paintM, 0, sy + 0.55, -L / 2 + 2.0);
  mesh(g, rbox(W * 0.86, 0.26, 3.6, 0.1), trim, 0, sy + 1.35, -L / 2 + 2.0);
  mesh(g, rbox(W * 0.6, 1.0, 1.8, 0.25), paintM, 0, sy + 1.95, -L / 2 + 1.3);
  mesh(g, rbox(W * 0.66, 0.22, 2.0, 0.08), trim, 0, sy + 2.5, -L / 2 + 1.3);
  for (const sx of [-1.0, 0, 1.0]) mesh(g, rbox(0.6, 0.65, 0.2, 0.1), LIT(), sx, sy + 0.45, -L / 2 + 0.3);
  mesh(g, rbox(W * 0.62, 0.3, 0.3, 0.1), trim, 0, sy + 1.0, -L / 2 + 0.28);
  mesh(g, cyl(0.06, 0.06, 0.9, 6), mat('iron'), 0, sy + 2.95, -L / 2 + 0.7);
  mesh(g, sphere(0.2, 10, 8), LIT(), 0, sy + 3.45, -L / 2 + 0.7);
  // forecastle and bowsprit with a gilded figurehead
  const [, rimB] = hullProfile(0.86, L, W, D);
  mesh(g, rbox(W * 0.42, 0.7, 1.8, 0.25), paintM, 0, Y + rimB + 0.2, L / 2 - 2.4);
  const bs = mesh(g, cyl(0.12, 0.18, 4.4, 8), mat('woodDark'), 0, Y + rimB + 0.9, L / 2 + 0.4);
  bs.rotation.x = Math.PI / 2 - 0.32;
  mesh(g, sphere(0.36, 10, 8), trim, 0, Y + rimB - 0.2, L / 2 - 0.05);
  // masts, yards with furled sails, tops
  for (const [mz, mh] of [[L * 0.22, 9.0], [-L * 0.04, 10.4], [-L * 0.29, 7.2]]) {
    const base = Y - 0.2;
    mesh(g, cyl(0.15, 0.22, mh, 8), mat('woodDark'), 0, base + mh / 2, mz);
    for (const [yy, yl] of [[0.5, 5.2], [0.8, 3.8]]) {
      mesh(g, cached(`yard${yl}`, () => new THREE.CylinderGeometry(0.09, 0.09, yl, 6).rotateZ(Math.PI / 2)), mat('woodDark'), 0, base + mh * yy, mz);
      mesh(g, cached(`furl${yl}`, () => new THREE.CapsuleGeometry(0.22, yl - 0.9, 3, 8).rotateZ(Math.PI / 2)), toon(sailCol), 0, base + mh * yy - 0.22, mz + 0.06);
    }
    mesh(g, cyl(0.42, 0.34, 0.3, 10), mat('woodDark'), 0, base + mh * 0.66, mz);
  }
  const pen = mesh(g, cached('mPennant', () => {
    const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(2.4, -0.32), new THREE.Vector2(0, -0.64)]);
    return new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false });
  }), toon(flagCol), 0, Y - 0.2 + 10.4 + 0.05, -L * 0.04);
  pen.rotation.y = -Math.PI / 2 + 0.35;
  return g;
}

// A sea-gull (shared body and wings geometry, the wings flap by scaling).
function gullGeos() {
  const tmp = new THREE.Group();
  const b = mesh(tmp, sphere(0.42, 12, 9), mat('gull'));
  b.scale.set(1, 0.95, 2.1);
  mesh(tmp, sphere(0.36, 12, 9), mat('gull'), 0, 0.28, 0.85);
  const tail = mesh(tmp, cached('gullTail', () => new THREE.ConeGeometry(0.3, 0.9, 8).rotateX(-Math.PI / 2)), mat('gull'), 0, 0.05, -1.15);
  tail.scale.set(1.4, 0.4, 1);
  mesh(tmp, cached('gullBeak', () => new THREE.ConeGeometry(0.13, 0.5, 8).rotateX(Math.PI / 2)), mat('beak'), 0, 0.24, 1.38);
  const bodyGeo = bake(tmp).geometry;
  const tmpW = new THREE.Group();
  const wingGeo = cached('gullWing', () => new THREE.SphereGeometry(1, 12, 7).scale(1.05, 0.09, 0.42).translate(1.0, 0, 0));
  const wl = mesh(tmpW, wingGeo, mat('gullWing'), 0.2, 0, 0);
  wl.rotation.z = 0.32;
  const wr = mesh(tmpW, wingGeo, mat('gullWing'), -0.2, 0, 0);
  wr.rotation.set(0, Math.PI, 0.32);
  return { bodyGeo, wingsGeo: bake(tmpW).geometry };
}
// A flying pelican: big body, long beak with a pouch, broad wings.
function pelicanGeos() {
  const tmp = new THREE.Group();
  const b = mesh(tmp, sphere(0.6, 12, 9), mat('pelican'));
  b.scale.set(1, 0.9, 2.0);
  const nk = mesh(tmp, cached('pfNeck', () => new THREE.CapsuleGeometry(0.2, 0.5, 3, 8)), mat('pelican'), 0, 0.35, 1.2);
  nk.rotation.x = 1.0;
  mesh(tmp, sphere(0.36, 12, 9), mat('pelican'), 0, 0.45, 1.55);
  mesh(tmp, cached('pfBeak', () => new THREE.ConeGeometry(0.14, 1.7, 8).rotateX(Math.PI / 2)), mat('beak'), 0, 0.36, 2.5);
  const pouch = mesh(tmp, sphere(1, 10, 8), mat('pouch'), 0, 0.2, 2.25);
  pouch.scale.set(0.17, 0.18, 0.62);
  const tail = mesh(tmp, cached('pfTail', () => new THREE.ConeGeometry(0.35, 0.9, 8).rotateX(-Math.PI / 2)), mat('pelicanWing'), 0, 0.05, -1.4);
  tail.scale.set(1.3, 0.4, 1);
  const bodyGeo = bake(tmp).geometry;
  const tmpW = new THREE.Group();
  const wingGeo = cached('pfWing', () => new THREE.SphereGeometry(1, 12, 7).scale(1.7, 0.1, 0.55).translate(1.6, 0, 0));
  const tipGeo = cached('pfTip', () => new THREE.SphereGeometry(1, 10, 6).scale(0.75, 0.1, 0.42).translate(3.0, 0.02, -0.05));
  for (const side of [1, -1]) {
    const w = mesh(tmpW, wingGeo, mat('pelican'), side * 0.3, 0, 0);
    w.rotation.set(0, side > 0 ? 0 : Math.PI, 0.18);
    const t = mesh(tmpW, tipGeo, mat('iron'), side * 0.3, 0, 0);
    t.rotation.set(0, side > 0 ? 0 : Math.PI, 0.18);
  }
  return { bodyGeo, wingsGeo: bake(tmpW).geometry };
}

// ---------------------------------------------------------------------------
// Sandbars and gate rings on the GPU: translucent shallow patches with a bright rim that ride
// exactly the ocean's swell. scenery.js keeps its wave table private, so this mirrors it (same
// constants, same rounding); checkWaves() verifies the mirror against waveHeight() once.
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
let wavesChecked = false;
function checkWaves() {
  if (wavesChecked) return;
  wavesChecked = true;
  for (const [x, z, t] of [[0, 0, 0], [13.7, -42.1, 3.3], [-97.2, 55.5, 41.9], [120.4, 8.8, 777.7], [-3.1, -131, 12345.6]]) {
    let h = 0;
    for (const w of SEA_WAVES) h += w.a * Math.sin(w.kx * x + w.kz * z - w.w * t + w.ph);
    if (Math.abs(h * 0.6 - waveHeight(x, z, t, 0.6)) > 1e-6) {
      console.error('doubloon.js: SEA_WAVES no longer matches the waves in scenery.js; update the mirror');
      return;
    }
  }
}

function buildShallows(sandbars, gates, rng, timeU, ampU) {
  const pos = [];
  const col = [];
  const ext = []; // per vertex: (sand ripples 0..1, ring angle or -1, unused)
  const index = [];
  const add = (x, z, c, a, sand = 0, ring = -1, lift = 0, t = -1) => {
    pos.push(x, lift, z);
    col.push(c.r, c.g, c.b, a);
    ext.push(sand, ring, t);
    return pos.length / 3 - 1;
  };
  const cCore = new THREE.Color(0xfbe5a6);
  const cSand = new THREE.Color(0xf4d488);
  const cEdge = new THREE.Color(0xe7c272);
  const cShelf = new THREE.Color(0x9fe3cf);
  const white = new THREE.Color(0xffffff);
  for (const sb of sandbars) {
    const a1 = rng() * 6.28;
    const a2 = rng() * 6.28;
    const R = (th) => sb.r * (1 + 0.07 * Math.sin(3 * th + a1) + 0.045 * Math.sin(5 * th + a2));
    // [radius factor, colour, alpha, sand ripples]; the fragment shader draws the lacy foam rim
    // round t = 0.9 .. 1.0 and cuts the patch off crisply just outside it
    const rings = [
      [0.0, cCore, 0.95, 1],
      [0.45, cSand, 0.93, 1],
      [0.78, cEdge, 0.86, 1],
      [0.9, cShelf, 0.7, 0],
      [1.08, cShelf, 0.6, 0],
    ];
    const SEG = 48;
    const c0 = add(sb.x, sb.z, rings[0][1], rings[0][2], rings[0][3], -1, 0, 0);
    let prev = null;
    for (let ri = 1; ri < rings.length; ri++) {
      const [t, c, a, s] = rings[ri];
      const row = [];
      for (let k = 0; k < SEG; k++) {
        const th = (k / SEG) * Math.PI * 2;
        const r = R(th) * t;
        row.push(add(sb.x + Math.cos(th) * r, sb.z + Math.sin(th) * r, c, a, s, -1, 0, t));
      }
      for (let k = 0; k < SEG; k++) {
        const k1 = (k + 1) % SEG;
        if (!prev) index.push(c0, row[k1], row[k]);
        else index.push(prev[k], row[k1], row[k], prev[k], prev[k1], row[k1]);
      }
      prev = row;
    }
  }
  // faint foam rings round the escape gates
  for (const gt of gates) {
    const SEG = 64;
    const rows = [[gt.r - 0.9, 0.0], [gt.r - 0.25, 0.5], [gt.r + 0.25, 0.5], [gt.r + 0.9, 0.0]];
    let prev = null;
    for (const [r, a] of rows) {
      const row = [];
      for (let k = 0; k <= SEG; k++) {
        const th = (k / SEG) * Math.PI * 2;
        row.push(add(gt.x + Math.cos(th) * r, gt.z + Math.sin(th) * r, white, a, 0, th, 0.02));
      }
      if (prev) for (let k = 0; k < SEG; k++) index.push(prev[k], row[k + 1], row[k], prev[k], prev[k + 1], row[k + 1]);
      prev = row;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setAttribute('aExt', new THREE.Float32BufferAttribute(ext, 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: true });
  m.name = 'doubloon-shallows';
  noOutline(m);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU;
    sh.uniforms.uAmp = ampU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform float uAmp;
attribute vec3 aExt;
varying vec3 vExt;
varying vec2 vWxz;
${WAVE_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vExt = aExt;
{
  vec2 wxz = (modelMatrix * vec4(position.x, 0.0, position.z, 1.0)).xz;
  vWxz = wxz;
  float far = abs(wxz.x - cameraPosition.x) + abs(wxz.y - cameraPosition.z);
  transformed.y = waveH(wxz, uTime, uAmp) + 0.07 + position.y + far * 0.0013;
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vExt;\nvarying vec2 vWxz;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    // sand ripples: soft wavy bands across the bar
    float rp = sin(dot(vWxz, vec2(0.83, 0.56)) * 1.7 + 0.9 * sin(vWxz.x * 0.21 + vWxz.y * 0.13));
    float band = smoothstep(0.55, 0.85, rp) * vExt.x;
    diffuseColor.rgb *= 1.0 - 0.09 * band;
    // gate rings: dashes of foam drifting slowly round
    if (vExt.y > -0.5) diffuseColor.a *= 0.55 + 0.45 * sin(vExt.y * 14.0 - uTime * 0.9);
    // sandbar rims: a band of lacy white foam, breathing a little, with a crisp outer edge
    if (vExt.z >= 0.0) {
      float t = vExt.z;
      float wob = 0.022 * sin(vWxz.x * 1.1 + vWxz.y * 0.8 + uTime * 0.7) + 0.014 * sin(vWxz.x * 2.6 - vWxz.y * 2.2 - uTime * 0.4);
      float inner = 0.925 + wob;
      float outer = 1.0 + wob * 0.4;
      float fw = max(fwidth(t), 1e-4);
      float foam = smoothstep(inner - fw, inner + fw, t);
      diffuseColor = mix(diffuseColor, vec4(1.0, 1.0, 1.0, 0.93), foam);
      diffuseColor.a *= 1.0 - smoothstep(outer - fw, outer + fw, t);
    }
  }`);
  };
  m.customProgramCacheKey = () => 'doubloon-shallows';
  const me = new THREE.Mesh(g, m);
  me.userData.keep = true;
  me.frustumCulled = false; // displaced on the GPU
  me.renderOrder = 2;
  return me;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
export function build(scene, ctx = {}) {
  checkWaves();
  const rng = typeof ctx.rng === 'function' ? ctx.rng : mulberry32(7);
  const rand = mulberry32(19601014); // fixed: the level always looks the same
  const root = new THREE.Group();
  root.name = 'env-doubloon';
  scene.add(root);
  const statics = new THREE.Group();
  root.add(statics);
  const anim = { flags: [], gulls: [], buoys: [], beam: null, ships: [], glows: [], boom: null };
  const ownMaterials = [];
  const timeU = { value: 0 };
  const ampU = { value: palette.waveAmp };

  // ----- coastlines -----
  const west = wobble(spline(WEST, 2), 1.2, 1.3);
  const east = wobble(spline(EAST, 2), 1.1, 3.1);
  const seaWallW = linePts(hb(QUAY_A0, QUAY_OUT), hb(QUAY_A0, 34), 2);
  const seaWallE = linePts(hb(QUAY_A1, 34), hb(QUAY_A1, QUAY_OUT), 2);
  const beachBack = offsetLine(west, BEACH_W);

  // ----- the dunes behind the west beach (low) -----
  const bbEnd = beachBack[beachBack.length - 1];
  let bbA = Math.atan2(bbEnd[1] - HB.z, bbEnd[0] - HB.x);
  if (bbA < 0) bbA += Math.PI * 2;
  const lowland = join(
    beachBack,
    arcPts(HB.x, HB.z, Math.hypot(bbEnd[0] - HB.x, bbEnd[1] - HB.z), bbA, 202 * DEG, 3),
    [[-46, -150], [-80, -330], [-460, -330], [-460, 170], [beachBack[0][0] - 60, beachBack[0][1] + 40]],
  );
  strata(statics, lowland, [
    { y0: -4, y1: 2.6, inset: 0, bevel: 0.9, mat: mat('rock2'), wob: 0.6 },
    { y0: 2.1, y1: LOW, inset: 0.9, bevel: 0.8, mat: mat('grass'), wob: 0.7, segs: 2 },
  ], 0.7);

  // ----- the clifftop mainland (town back, east cliffs, headland) -----
  const back = arcPts(HB.x, HB.z, BACK_R, 196 * DEG, 344 * DEG, 2);
  const flankW = wobble(spline([[-82, -114], [-70, -107], hb(196 * DEG, BACK_R)], 2), 0.6, 4);
  const flankE = join(linePts(hb(344 * DEG, BACK_R), hb(350 * DEG, QUAY_OUT + 2), 2), arcPts(HB.x, HB.z, QUAY_OUT + 2, 350 * DEG, QUAY_A1 - 1.5 * DEG, 2));
  // (the coast's first points sit under the flank's arc; skipping them keeps the cliff free of a notch)
  const eastCliff = east.filter((p, i) => i > 8 || Math.hypot(p[0] - HB.x, p[1] - HB.z) > QUAY_OUT + 3);
  const upland = join(
    [[-470, -210], [-300, -170], [-180, -138], [-120, -124]],
    flankW, back, flankE, eastCliff,
    [[420, 160], [520, -100], [520, -520], [-470, -520]],
  );
  const cliffLayers = [
    { y0: -4, y1: 5.0, inset: 0, bevel: 1.2, mat: mat('rock1'), wob: 0.5 },
    { y0: 4.2, y1: 9.8, inset: 1.4, bevel: 1.0, mat: mat('rock2'), wob: 0.9 },
    { y0: 9.2, y1: 12.9, inset: 2.4, bevel: 0.8, mat: mat('rock3'), wob: 0.8 },
    { y0: 12.3, y1: TOP, inset: 1.8, bevel: 0.75, mat: mat('grass'), wob: 0.5, segs: 2 },
  ];
  const cliffWarp = (x, y, z) => {
    if (y <= -4 || y >= 12.6) return 0;
    const f = Math.sin((Math.PI * (y + 4)) / 16.6);
    return f * (1.6 * Math.sin(0.043 * x + 0.6) * Math.cos(0.037 * z - 0.3) + 0.8 * Math.sin(0.093 * x - 0.071 * z + 2.0));
  };
  strata(statics, upland, cliffLayers, 0.3, cliffWarp);

  // rock shoulders at the foot of the east cliffs, grassy knolls on top
  {
    const nrm = leftNormals(east);
    let s = 0;
    let nextCol = 4;
    let nextKnoll = 8;
    for (let i = 1; i < east.length - 1; i++) {
      s += Math.hypot(east[i][0] - east[i - 1][0], east[i][1] - east[i - 1][1]);
      const [x, z] = east[i];
      if (Math.hypot(x, z) > WORLD_R + 70) continue;
      const ry = Math.atan2(east[i + 1][0] - east[i - 1][0], east[i + 1][1] - east[i - 1][1]);
      if (s > nextCol) {
        nextCol = s + 10 + rand() * 12;
        const sy = 3.0 + rand() * 2.6;
        const sx = 3.2 + rand() * 2.4;
        const sz = 1.5 + rand() * 0.5;
        const m = mesh(statics, sphere(1, 14, 10), mat('rock1'), x + nrm[i][0] * sz * 0.7, sy * 0.28, z + nrm[i][1] * sz * 0.7, ry);
        m.scale.set(sz, sy, sx);
        m.rotation.z = (rand() - 0.5) * 0.5;
      }
      if (s > nextKnoll) {
        nextKnoll = s + 13 + rand() * 14;
        const sz = 3.5 + rand() * 2;
        const d = 2.2 + sz + rand() * 2;
        const kx = x + nrm[i][0] * d;
        const kz = z + nrm[i][1] * d;
        if (Math.hypot(kx - FORT.x, kz - FORT.z) < 22) continue;
        const k = mesh(statics, sphere(1, 16, 9), mat('grass'), kx, TOP - 0.5, kz, ry);
        k.scale.set(sz, 1.8 + rand() * 2, 5 + rand() * 5);
      }
      if (i % 5 === 2 && rand() < 0.7) bush(statics, x + nrm[i][0] * (3.4 + rand()), TOP + 0.1, z + nrm[i][1] * (3.4 + rand()), 0.9 + rand() * 0.8);
      if (i % 6 === 0 && rand() < 0.7) {
        const sc = 1.0 + rand() * 0.9;
        boulder(statics, x + nrm[i][0] * sc * 0.35, sc * 0.1, z + nrm[i][1] * sc * 0.35, sc, rand, rand() < 0.5 ? mat('boulder') : mat('rock1'));
      }
    }
  }

  // ----- the west beach: sand from below the waterline up to the dunes -----
  const sandRows = [[-5, -2.0], [0, 0.08], [3, 0.5], [7, 1.05], [11, 1.75], [14.5, 2.55], [BEACH_W + 2, 3.7]];
  // wet sand along the waterline, dry sand above it (the two strips share the row at d = 3)
  mesh(statics, ribbon(west, sandRows.slice(0, 3)), mat('wetsand'));
  mesh(statics, ribbon(west, sandRows.slice(2)), mat('sand'));
  const sandY = (d) => {
    for (let k = 1; k < sandRows.length; k++) {
      if (d <= sandRows[k][0]) return sandRows[k - 1][1] + ((sandRows[k][1] - sandRows[k - 1][1]) * (d - sandRows[k - 1][0])) / (sandRows[k][0] - sandRows[k - 1][0]);
    }
    return sandRows[sandRows.length - 1][1];
  };
  const westN = softNormals(west);
  const beachAt = (k, d) => {
    const i = Math.max(0, Math.min(west.length - 1, Math.round((west.length - 1) * k)));
    return [west[i][0] + westN[i][0] * d, west[i][1] + westN[i][1] * d, Math.atan2(-westN[i][0], -westN[i][1]), i];
  };
  // palms leaning out over the sand, dunes and beach grass behind them
  {
    let s = 0;
    let next = 3;
    for (let i = 1; i < west.length - 1; i++) {
      s += Math.hypot(west[i][0] - west[i - 1][0], west[i][1] - west[i - 1][1]);
      const [x, z] = west[i];
      if (Math.hypot(x, z) > WORLD_R + 80) continue;
      if (s < next) continue;
      next = s + 6 + rand() * 7;
      const d = 11 + rand() * 6;
      const px = x + westN[i][0] * d;
      const pz = z + westN[i][1] * d;
      const lean = 0.6 + rand() * 0.4;
      const ax = -westN[i][0] * lean + (rand() - 0.5) * 0.6;
      const az = -westN[i][1] * lean + (rand() - 0.5) * 0.6;
      const al = Math.hypot(ax, az) || 1;
      palm(statics, px, sandY(d), pz, ax / al, az / al, 0.95 + rand() * 0.35, rand);
      if (rand() < 0.55) {
        const d2 = BEACH_W + 2 + rand() * 4;
        const du = mesh(statics, sphere(1, 14, 9), mat('dune'), x + westN[i][0] * d2, LOW - 0.4, z + westN[i][1] * d2, rand() * 3);
        du.scale.set(3.5 + rand() * 2, 1.4 + rand(), 2.6 + rand() * 1.5);
      }
      if (rand() < 0.6) bush(statics, x + westN[i][0] * (BEACH_W + 7 + rand() * 4), LOW + 0.2, z + westN[i][1] * (BEACH_W + 7 + rand() * 4), 0.9 + rand() * 0.6, rand() < 0.5 ? 'bush' : 'grass2');
    }
  }
  // a beach hut with a thatched roof, a hauled-up rowboat, and a fishing net drying on poles
  {
    const [hx, hz, hry] = beachAt(0.52, 13);
    const hy = sandY(13);
    for (const [ox, oz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
      const c = Math.cos(hry);
      const sn = Math.sin(hry);
      mesh(statics, cyl(0.16, 0.2, 3.2, 8), mat('woodDark'), hx + ox * c + oz * sn, hy + 1.4, hz - ox * sn + oz * c);
    }
    mesh(statics, cone(3.4, 2.4, 10), mat('thatch'), hx, hy + 3.9, hz);
    mesh(statics, rbox(3.0, 0.3, 3.0, 0.1), mat('wood'), hx, hy + 0.5, hz, hry);
    const [bx, bz, bry] = beachAt(0.44, 7);
    const boat = mesh(statics, merchantHullGeo(4.6, 1.8, 0.8), mat('buoyRed'), bx, sandY(7) + 0.75, bz, bry + 1.3);
    boat.rotation.z = 0.28;
    const [nx, nz, nry] = beachAt(0.6, 9);
    for (const o of [-2.2, 2.2]) mesh(statics, cyl(0.12, 0.14, 2.6, 6), mat('woodDark'), nx + Math.cos(nry) * o, sandY(9) + 1.1, nz - Math.sin(nry) * o);
    const net = mesh(statics, rbox(4.4, 1.6, 0.12, 0.05), mat('canvas'), nx, sandY(9) + 1.4, nz, nry + Math.PI / 2);
    net.rotation.z = 0.04;
  }

  // a heap of boulders where the beach runs into the quay's sea wall
  {
    const rj = mulberry32(4407);
    const n = west.length - 1;
    const [ex, ez] = west[n];
    const tx = west[n][0] - west[n - 3][0];
    const tz = west[n][1] - west[n - 3][1];
    const tl = Math.hypot(tx, tz) || 1;
    for (let k = 0; k < 9; k++) {
      const d = -0.6 + k * 1.5 + rj() * 0.9;
      const back = 0.9 + rj() * 2.4 - (k % 3 === 2 ? 0 : 0.4);
      const s = 2.1 - Math.min(1, Math.max(0, d) / 13) * 0.8 + rj() * 0.5;
      boulder(statics, ex + westN[n][0] * d - (tx / tl) * back, sandY(Math.max(0, d)) - s * 0.3, ez + westN[n][1] * d - (tz / tl) * back, s, rj, rj() < 0.5 ? mat('boulder') : mat('rock1'));
    }
    for (let k = 0; k < 4; k++) {
      const d = 1 + rj() * 9;
      const back = 3.2 + rj() * 2.5;
      boulder(statics, ex + westN[n][0] * d - (tx / tl) * back, sandY(d) - 0.15, ez + westN[n][1] * d - (tz / tl) * back, 0.6 + rj() * 0.5, rj, mat('boulder'));
    }
  }
  // rocks at the water's edge, tufts of beach grass on the dunes, a hammock slung between two
  // palms and a ring of stones round an old fire
  {
    for (const k of [0.3, 0.37, 0.71, 0.8]) {
      const [x, z] = beachAt(k, 0.5 + rand() * 1.5);
      for (let q = 0; q < 3; q++) boulder(statics, x + (rand() - 0.5) * 3, -0.1 + rand() * 0.3, z + (rand() - 0.5) * 3, 0.6 + rand() * 0.9, rand, rand() < 0.5 ? mat('boulder') : mat('rock1'));
    }
    const tuft = cached('tuft', () => new THREE.ConeGeometry(0.16, 1.4, 5));
    for (let i = 0; i < 40; i++) {
      const k = 0.08 + rand() * 0.86;
      const [x, z] = beachAt(k, 12 + rand() * 7);
      const [, , , ii] = beachAt(k, 0);
      if (Math.hypot(west[ii][0], west[ii][1]) > WORLD_R + 60) continue;
      for (let q = 0; q < 3; q++) {
        const t = mesh(statics, tuft, mat('grass2'), x + (q - 1) * 0.3, sandY(12) + 0.55, z + (rand() - 0.5) * 0.4);
        t.rotation.set((rand() - 0.5) * 0.5, 0, (q - 1) * 0.35);
      }
    }
    // hammock between two palms
    const [p1x, p1z, pry] = beachAt(0.56, 11);
    const tx = Math.cos(pry);
    const tz = -Math.sin(pry);
    const ax = p1x - tx * 2.6;
    const az = p1z - tz * 2.6;
    const bx2 = p1x + tx * 2.6;
    const bz2 = p1z + tz * 2.6;
    const py = sandY(11);
    palm(statics, ax, py, az, -tx * 0.4 + Math.sin(pry) * 0.3, -tz * 0.4 + Math.cos(pry) * 0.3, 1.0, rand);
    palm(statics, bx2, py, bz2, tx * 0.4 + Math.sin(pry) * 0.3, tz * 0.4 + Math.cos(pry) * 0.3, 1.05, rand);
    const ham = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      ham.push(new THREE.Vector3(ax + (bx2 - ax) * t, py + 2.0 - 1.1 * Math.sin(Math.PI * t), az + (bz2 - az) * t));
    }
    const hm = mesh(statics, tubeAlong(ham, (t) => 0.16 + 0.24 * Math.sin(Math.PI * t), 8), mat('awning1'));
    hm.userData.ham = true;
    // fire pit: a ring of stones, crossed logs
    const [fx2, fz2] = beachAt(0.5, 9);
    const fy = sandY(9);
    for (let q = 0; q < 7; q++) {
      const a = (q / 7) * Math.PI * 2;
      boulder(statics, fx2 + Math.cos(a) * 1.1, fy + 0.1, fz2 + Math.sin(a) * 1.1, 0.38, rand, mat('boulder'));
    }
    for (const r of [0.5, -0.6]) {
      const lg = mesh(statics, cyl(0.16, 0.16, 1.7, 7), mat('woodDark'), fx2, fy + 0.25, fz2, r);
      lg.rotation.z = Math.PI / 2;
    }
  }

  // ----- the harbour: quay, terraces, moles -----
  const sector = (r0, r1, a0, a1, pad = 0) => join(arcPts(HB.x, HB.z, r0, a0, a1, 2), arcPts(HB.x, HB.z, r1, a1 + pad, a0 - pad, 3));
  const quay = sector(QUAY_R, QUAY_OUT, QUAY_A0, QUAY_A1);
  slab(statics, insetPoly(quay, 0.35), -3, QUAY_Y - 0.25, 0.35, mat('stone'), 2);
  slab(statics, insetPoly(quay, 0.9), QUAY_Y - 0.6, QUAY_Y, 0.3, mat('paving'), 2);
  for (const T of TERRACES) {
    const poly = sector(T.r, QUAY_OUT, T.a0 * DEG, T.a1 * DEG, 0);
    slab(statics, insetPoly(poly, 0.3), 1.2, T.y - 0.25, 0.3, mat('stone'), 2);
    slab(statics, insetPoly(poly, 0.8), T.y - 0.6, T.y, 0.3, mat('paving'), 2);
  }
  // the moles: curved stone breakwaters with a paved walk, riprap on the sea side
  for (const ml of MOLES) {
    const band = join(arcPts(HB.x, HB.z, MOLE_R - MOLE_W / 2, ml.a0, ml.a1, 1.5), arcPts(HB.x, HB.z, MOLE_R + MOLE_W / 2, ml.a1, ml.a0, 1.5));
    slab(statics, band, -3, QUAY_Y - 0.3, 0.7, mat('stone'), 2);
    slab(statics, insetPoly(band, 0.55), QUAY_Y - 0.65, QUAY_Y - 0.05, 0.25, mat('paving'), 2);
    const span = Math.abs(ml.a1 - ml.a0) * MOLE_R;
    const n = Math.floor(span / 2.6);
    for (let i = 1; i < n; i++) {
      const a = ml.a0 + ((ml.a1 - ml.a0) * i) / n;
      const [rx, rz] = hb(a + (rand() - 0.5) * 0.02, MOLE_R + MOLE_W / 2 + 0.3 + rand() * 0.5);
      boulder(statics, rx, -0.1 + rand() * 0.3, rz, 0.9 + rand() * 0.5, rand, rand() < 0.5 ? mat('boulder') : mat('rock1'));
      if (i % 3 === 1) {
        const [bx, bz] = hb(a, MOLE_R - MOLE_W / 2 + 0.7);
        mesh(statics, cyl(0.28, 0.34, 0.75, 10), mat('metal'), bx, QUAY_Y + 0.3, bz);
      }
    }
  }
  // the log boom across the harbour mouth (bobs on the swell)
  {
    const g = new THREE.Group();
    const [ax, az] = hb(97 * DEG, MOLE_R);
    const [bx2, bz2] = hb(83 * DEG, MOLE_R);
    const len = Math.hypot(bx2 - ax, bz2 - az);
    const mx = (ax + bx2) / 2;
    const mz = (az + bz2) / 2;
    g.position.set(mx, 0, mz);
    g.rotation.y = Math.atan2(bx2 - ax, bz2 - az);
    g.userData.keep = true;
    root.add(g);
    const logs = 3;
    for (let i = 0; i < logs; i++) {
      const z = -len / 2 + ((i + 0.5) * len) / logs;
      const log = mesh(g, cached('boomLog', () => new THREE.CapsuleGeometry(0.42, len / logs - 1.3, 4, 10).rotateX(Math.PI / 2)), mat('woodDark'), 0, 0.1, z);
      log.rotation.z = (i - 1) * 0.3;
    }
    for (let i = 0; i <= logs; i++) {
      const z = -len / 2 + (i * len) / logs;
      mesh(g, cached('boomLink', () => new THREE.TorusGeometry(0.32, 0.09, 6, 12)), mat('iron'), 0, 0.15, z);
    }
    bake(g);
    anim.boom = g;
  }

  // ----- lighthouse on the west mole head -----
  {
    const [x, z] = LIGHTHOUSE;
    mesh(statics, cyl(3.1, 3.4, 5.8, 20), mat('stone'), x, QUAY_Y - 2.9, z);
    mesh(statics, cyl(3.3, 3.3, 0.5, 20), mat('paving'), x, QUAY_Y + 0.05, z);
    const y0 = QUAY_Y + 0.3;
    mesh(statics, lathe([[2.35, 0], [2.2, 4], [2.0, 9], [1.8, 13.4], [0, 13.4]], 18), mat('white'), x, y0, z);
    for (const [yy, rr] of [[3.6, 2.24], [8.8, 2.03]]) mesh(statics, cyl(rr + 0.06, rr + 0.1, 1.3, 18), mat('roof'), x, y0 + yy, z);
    const ty = y0 + 13.4;
    mesh(statics, cyl(2.5, 2.1, 0.6, 18), mat('stone'), x, ty + 0.3, z);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      mesh(statics, cyl(0.1, 0.1, 0.9, 6), mat('metal'), x + Math.cos(a) * 2.25, ty + 1.05, z + Math.sin(a) * 2.25);
    }
    mesh(statics, cached('lhRail', () => new THREE.TorusGeometry(2.25, 0.11, 6, 26).rotateX(Math.PI / 2)), mat('metal'), x, ty + 1.5, z);
    const lampMat = new THREE.MeshToonMaterial({ color: 0xfff3b0, emissive: 0xffc94d, emissiveIntensity: 0.9, gradientMap: gradientMap(3) });
    setOutline(lampMat);
    ownMaterials.push(lampMat);
    const lantern = mesh(root, cyl(1.3, 1.3, 1.9, 16), lampMat, x, ty + 1.6, z);
    lantern.userData.keep = true;
    anim.glows.push({ mat: lampMat, kind: 'lantern' });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      mesh(statics, cyl(0.11, 0.11, 1.9, 6), mat('metal'), x + Math.cos(a) * 1.33, ty + 1.6, z + Math.sin(a) * 1.33);
    }
    mesh(statics, cyl(1.75, 1.75, 0.3, 18), mat('metal'), x, ty + 2.7, z);
    mesh(statics, cached('lhDome', () => new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), mat('roof'), x, ty + 2.82, z);
    mesh(statics, sphere(0.36, 10, 8), mat('gold'), x, ty + 4.55, z);
    mesh(statics, cone(0.17, 0.9, 8), mat('gold'), x, ty + 5.15, z);
    const face = Math.atan2(-x, -z);
    const fx = Math.sin(face);
    const fz = Math.cos(face);
    mesh(statics, rbox(1.2, 1.9, 0.4, 0.14), mat('door'), x + fx * 2.3, y0 + 1.0, z + fz * 2.3, face);
    for (const hh of [6.2, 10.8]) {
      const r = 2.35 - (hh / 13.4) * 0.55;
      mesh(statics, rbox(0.6, 0.9, 0.3, 0.1), mat('window'), x + fx * (r - 0.02), y0 + hh, z + fz * (r - 0.02), face);
    }
    // the turning beam: two soft additive shafts of light
    const beamGeo = (() => {
      const L = 36;
      const parts = [];
      for (const dir of [1, -1]) {
        const c = new THREE.CylinderGeometry(3.0, 0.9, L, 18, 4, true);
        c.translate(0, -L / 2 - 1.5, 0);
        c.rotateZ((dir * Math.PI) / 2);
        c.rotateZ(dir * -0.06);
        parts.push(c);
      }
      const gg = mergeGeometries(parts.map((p) => p.toNonIndexed()), false);
      const pos = gg.attributes.position;
      const colors = new Float32Array(pos.count * 4);
      for (let i = 0; i < pos.count; i++) {
        const t = Math.min(1, Math.max(0, Math.abs(pos.getX(i)) - 1.5) / L);
        colors.set([1, 0.86, 0.5, 0.24 * Math.pow(1 - t, 1.6) * Math.min(1, t * 12 + 0.25)], i * 4);
      }
      gg.setAttribute('color', new THREE.BufferAttribute(colors, 4));
      return gg;
    })();
    const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true, blending: THREE.AdditiveBlending });
    noOutline(beamMat);
    ownMaterials.push(beamMat);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(x, ty + 1.6, z);
    beam.userData.keep = true;
    beam.renderOrder = 2;
    root.add(beam);
    anim.beam = beam;
  }
  // ----- the beacon on the east mole head -----
  {
    const [x, z] = BEACON;
    mesh(statics, cyl(2.3, 2.6, 5.8, 18), mat('stone'), x, QUAY_Y - 2.9, z);
    mesh(statics, cyl(2.5, 2.5, 0.5, 18), mat('paving'), x, QUAY_Y + 0.05, z);
    mesh(statics, cyl(0.9, 1.05, 1.6, 14), mat('white'), x, QUAY_Y + 1.1, z);
    mesh(statics, cyl(0.8, 0.9, 1.4, 14), mat('buoyGreen'), x, QUAY_Y + 2.6, z);
    mesh(statics, cyl(0.72, 0.8, 0.9, 14), mat('white'), x, QUAY_Y + 3.75, z);
    const beaconMat = new THREE.MeshToonMaterial({ color: 0x9dffb0, emissive: 0x3dff6a, emissiveIntensity: 0.8, gradientMap: gradientMap(3) });
    setOutline(beaconMat);
    ownMaterials.push(beaconMat);
    const lamp = mesh(root, sphere(0.55, 12, 9), beaconMat, x, QUAY_Y + 4.6, z);
    lamp.userData.keep = true;
    anim.glows.push({ mat: beaconMat, kind: 'blink' });
    mesh(statics, cone(0.75, 0.8, 12), mat('metal'), x, QUAY_Y + 5.35, z);
  }

  // ----- sea towers at the mole roots, and the clifftop town wall -----
  const flagCols = [COL.red, COL.gold, 0x2f7fd6];
  const seaTowers = [hb(QUAY_A0 + 0.5 * DEG, 36.5), hb(QUAY_A1 - 0.5 * DEG, 36.5)];
  for (let i = 0; i < 2; i++) {
    const [x, z] = seaTowers[i];
    mesh(statics, cyl(4.6, 5.0, 4.0, 20), mat('stone'), x, 0.0, z);
    roundTower(statics, x, QUAY_Y - 0.2, z, 3.9, 8.4);
    const face = Math.atan2(HB.x - x, HB.z - z) + Math.PI;
    for (const yy of [4.5, 7.5]) mesh(statics, rbox(0.55, 1.1, 0.4, 0.12), mat('window'), x + Math.sin(face) * 3.85, QUAY_Y + yy, z + Math.cos(face) * 3.85, face);
    flag(statics, root, x, QUAY_Y + 8.7, z, flagCols[i], 2.6, anim.flags, rand, 'flag', 3.6);
  }
  const wallR = BACK_R + 3;
  const wallTowers = [204, 240, 300, 336];
  {
    const wa = arcPts(HB.x, HB.z, wallR, 204 * DEG, 336 * DEG, 7);
    for (let i = 1; i < wa.length; i++) wallSeg(statics, wa[i - 1], wa[i], TOP - 0.5, 4.2, 1.5);
    for (const ad of wallTowers) {
      const [x, z] = hb(ad * DEG, wallR);
      roundTower(statics, x, TOP - 0.5, z, 2.6, 6.6);
    }
    // the town gate: an arch over steps down to the upper terrace
    const [gx, gz] = hb(270 * DEG, wallR);
    mesh(statics, rbox(5.2, 6.4, 2.4, 0.3), mat('white'), gx, TOP + 2.7, gz);
    mesh(statics, rbox(2.2, 3.0, 2.6, 0.5), mat('door'), gx, TOP + 1.0, gz);
    mesh(statics, rbox(5.6, 0.5, 2.8, 0.15), mat('stone'), gx, TOP + 6.0, gz);
    for (let k = 0; k < 4; k++) mesh(statics, rbox(3.0, 0.5, 1.4, 0.12), mat('stone'), gx, TERRACES[1].y + 0.4 + k * 1.0, gz + 2.4 + (3 - k) * 1.0);
  }

  // ----- the town -----
  const faceBay = (x, z) => Math.atan2(HB.x - x, HB.z - z);
  const rows = [
    { r: QUAY_R + 5.6, y: QUAY_Y, a0: 196, a1: 344, step: 9.2, h: [4.2, 6.0] },
    { r: TERRACES[0].r + 4.2, y: TERRACES[0].y, a0: 199, a1: 341, step: 8.0, h: [4.4, 6.4] },
    { r: TERRACES[1].r + 4.0, y: TERRACES[1].y, a0: 204, a1: 336, step: 7.0, h: [4.6, 6.6] },
  ];
  let wi = 0;
  const skip = (ri, ad) => (ri === 2 && Math.abs(ad - 270) < 6) || (ri === 0 && Math.abs(ad - 300) < 5);
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    for (let ad = row.a0 + (ri % 2) * 3; ad <= row.a1; ad += row.step + rand() * 1.4) {
      if (skip(ri, ad)) continue;
      const a = ad * DEG;
      const w = 4.0 + rand() * 1.4;
      const d = 4.2 + rand() * 0.6;
      const h = row.h[0] + rand() * (row.h[1] - row.h[0]);
      const [x, z] = hb(a, row.r + (rand() - 0.5) * 0.8);
      const kind = rand();
      house(statics, x, row.y - 0.05, z, faceBay(x, z) + (rand() - 0.5) * 0.1, {
        w, d, h, rh: 1.3 + rand() * 0.6, wall: WALLS[wi++ % WALLS.length], roof2: rand() < 0.4,
        roof: kind < 0.45 ? 'gable' : kind < 0.8 ? 'hip' : 'flat', ridgeX: rand() < 0.6, dome: rand() < 0.4 ? 'roof' : null,
        chimney: rand() < 0.4 ? (rand() < 0.5 ? 1 : -1) : 0, doorLeft: rand() < 0.5, shutter: rand() < 0.6 ? 'shutter1' : 'shutter2',
        lit: rand() < 0.5 ? 1 + Math.floor(rand() * 3) : 0, balcony: rand() < 0.4,
      });
    }
  }
  // houses on the clifftop behind the town wall: only their roofs show over it
  for (const [ad, rr] of [[210, 66], [222, 69], [232, 65], [246, 70], [256, 66], [284, 66], [306, 70], [316, 65], [328, 68], [217, 76], [250, 78], [312, 77], [298, 78]]) {
    const [x, z] = hb(ad * DEG, rr);
    house(statics, x, TOP - 0.1, z, faceBay(x, z) + (rand() - 0.5) * 0.2, {
      w: 4.6 + rand(), d: 4.6, h: 5.4 + rand() * 1.8, rh: 1.6, wall: WALLS[wi++ % WALLS.length], roof: rand() < 0.5 ? 'hip' : 'gable',
      roof2: rand() < 0.5, ridgeX: rand() < 0.5, shutter: 'shutter1', doorLeft: true, lit: 0,
    });
  }

  // the bell tower: a tall white campanile with an open belfry and a terracotta pyramid roof
  const BELL = hb(262 * DEG, 66);
  {
    const [x, z] = BELL;
    const g = new THREE.Group();
    g.position.set(x, TOP - 0.2, z);
    g.rotation.y = faceBay(x, z);
    statics.add(g);
    mesh(g, rbox(5.4, 1.4, 5.4, 0.25), mat('stone'), 0, 0.7, 0);
    mesh(g, rbox(4.3, 16.5, 4.3, 0.25), mat('white'), 0, 9.6, 0);
    for (const [cx, cz] of [[-2.05, -2.05], [2.05, -2.05], [-2.05, 2.05], [2.05, 2.05]]) mesh(g, rbox(0.6, 16.4, 0.6, 0.12), mat('stone'), cx, 9.6, cz);
    for (const yy of [8.0, 17.6]) mesh(g, rbox(4.8, 0.5, 4.8, 0.18), mat('stone'), 0, yy, 0);
    // clock face
    mesh(g, cached('clockZ', () => new THREE.CylinderGeometry(1.15, 1.15, 0.24, 18).rotateX(Math.PI / 2)), mat('frame'), 0, 14.2, 2.18);
    mesh(g, rbox(0.14, 0.9, 0.12, 0.04), mat('metal'), 0, 14.55, 2.32);
    const hand = mesh(g, rbox(0.14, 0.7, 0.12, 0.04), mat('metal'), 0.22, 14.05, 2.32);
    hand.rotation.z = 2.2;
    for (const yy of [4.5, 10.5]) mesh(g, rbox(0.7, 1.5, 0.3, 0.1), mat('window'), 0, yy, 2.14);
    // belfry: corner piers round a dark open core with the gold bell inside
    mesh(g, rbox(3.7, 4.2, 3.7, 0.2), mat('window'), 0, 20.0, 0);
    for (const [cx, cz] of [[-1.85, -1.85], [1.85, -1.85], [-1.85, 1.85], [1.85, 1.85]]) mesh(g, rbox(1.1, 4.3, 1.1, 0.2), mat('white'), cx, 20.0, cz);
    for (const [dx, dz, ry] of [[0, 1.9, 0], [0, -1.9, 0], [1.9, 0, Math.PI / 2], [-1.9, 0, Math.PI / 2]]) {
      const arch = mesh(g, cached('belArch', () => new THREE.TorusGeometry(1.25, 0.32, 8, 14, Math.PI)), mat('white'), dx, 21.4, dz, ry);
      arch.scale.set(1, 0.9, 1);
    }
    mesh(g, lathe([[0, 1.3], [0.35, 1.25], [0.6, 0.8], [0.8, 0.1], [1.0, -0.2], [0, -0.2]], 14), GOLD_GLINT(), 0, 19.3, 0);
    mesh(g, rbox(5.0, 0.6, 5.0, 0.2), mat('stone'), 0, 22.4, 0);
    const pyr = mesh(g, cone(3.5, 4.6, 4), mat('roof'), 0, 25.0, 0);
    pyr.rotation.y = Math.PI / 4;
    mesh(g, sphere(0.4, 10, 8), mat('gold'), 0, 27.5, 0);
    mesh(g, rbox(0.16, 1.6, 0.16, 0.05), mat('gold'), 0, 28.4, 0);
    const vane = mesh(g, rbox(1.4, 0.5, 0.1, 0.05), mat('gold'), 0.45, 28.7, 0);
    vane.rotation.y = 0.6;
  }
  // the treasury: a white hall under a golden dome
  const TREASURY = hb(290 * DEG, 67);
  {
    const [x, z] = TREASURY;
    const g = new THREE.Group();
    g.position.set(x, TOP - 0.2, z);
    g.rotation.y = faceBay(x, z);
    statics.add(g);
    mesh(g, rbox(10, 7.4, 8.4, 0.3), mat('white'), 0, 3.7, 0);
    mesh(g, rbox(10.6, 0.6, 9.0, 0.2), mat('stone'), 0, 7.5, 0);
    for (const px of [-3.9, -1.3, 1.3, 3.9]) mesh(g, rbox(0.8, 6.8, 0.5, 0.12), mat('stone'), px, 3.4, 4.25);
    for (const px of [-2.6, 2.6]) mesh(g, rbox(1.2, 2.6, 0.3, 0.2), LIT(), px, 4.0, 4.24);
    mesh(g, rbox(1.8, 3.2, 0.3, 0.3), mat('door'), 0, 1.6, 4.25);
    mesh(g, cyl(3.4, 3.6, 2.4, 20), mat('white'), 0, 8.8, 0);
    mesh(g, cached('tDome', () => new THREE.SphereGeometry(3.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), GOLD_GLINT(), 0, 10.0, 0);
    mesh(g, cyl(0.6, 0.7, 1.2, 10), mat('white'), 0, 13.9, 0);
    mesh(g, sphere(0.5, 10, 8), mat('gold'), 0, 14.8, 0);
  }
  // town greenery
  for (const [ad, rr, y, kind] of [
    [199, 34.5, QUAY_Y, 'p'], [341, 34.5, QUAY_Y, 'p'], [214, 42, TERRACES[0].y, 'c'], [326, 42, TERRACES[0].y, 'c'],
    [233, 50.5, TERRACES[1].y, 'p'], [307, 50.5, TERRACES[1].y, 'p'], [264, 74, TOP, 'c'], [278, 75, TOP, 't'], [238, 74, TOP, 'p'],
    [170, 50, QUAY_Y, 'p'], [176, 60, QUAY_Y, 'p'], [8, 52, QUAY_Y, 'p'], [362, 60, QUAY_Y, 'c'],
  ]) {
    const [x, z] = hb(ad * DEG, rr);
    if (kind === 'c') cypress(statics, x, y, z, 1.0 + rand() * 0.2);
    else if (kind === 't') tree(statics, x, y, z, 1.1 + rand() * 0.3, rand);
    else palm(statics, x, y, z, rand() - 0.5, 0.6, 0.9 + rand() * 0.2, rand);
  }
  // warehouses on the side quays
  for (const [ad, rr, w, d, h] of [[172, 44, 7, 5, 4.5], [183, 54, 6, 5, 5.2], [367, 45, 7, 5, 4.6], [358, 55, 6, 5.4, 5]]) {
    const [x, z] = hb(ad * DEG, rr);
    house(statics, x, QUAY_Y - 0.05, z, faceBay(x, z), { w, d, h, rh: 1.4, wall: ad > 300 ? 'cream' : 'ochre', roof: 'gable', ridgeX: true, roof2: true, shutter: 'shutter2', doorLeft: false, lit: 0 });
  }

  // ----- the quay: treasure chests, barrels, a crane, lamps -----
  const gold = GOLD_GLINT();
  {
    const onQuay = (ad, rr) => hb(ad * DEG, rr);
    // stacks of chests waiting to be loaded
    for (const [ad, n] of [[226, 3], [256, 4], [318, 3], [204, 2]]) {
      const [x, z] = onQuay(ad, QUAY_R + 2.2);
      const ry = faceBay(x, z);
      const c = Math.cos(ry);
      const sn = Math.sin(ry);
      const spots = [[-1.1, 0, 0], [1.1, 0, 0], [0, 1.2, 0], [0.2, 0, -1.5]].slice(0, n);
      for (const [ox, oy, oz] of spots) chest(statics, x + ox * c + oz * sn, QUAY_Y + oy, z - ox * sn + oz * c, ry + (rand() - 0.5) * 0.3, 1.0, false, gold);
      const [ox2, oz2] = [2.6, 0.6];
      chest(statics, x + ox2 * c + oz2 * sn, QUAY_Y, z - ox2 * sn + oz2 * c, ry + 0.4, 0.9, true, gold);
      for (let k = 0; k < 5; k++) {
        const a = rand() * Math.PI * 2;
        mesh(statics, cached('coin', () => new THREE.CylinderGeometry(0.3, 0.3, 0.09, 12)), gold, x + ox2 * c + Math.cos(a) * 1.4, QUAY_Y + 0.06, z - ox2 * sn + Math.sin(a) * 1.4);
      }
    }
    // barrels and crates
    for (const ad of [212, 236, 247, 284, 296, 330, 338]) {
      const [x, z] = onQuay(ad + (rand() - 0.5) * 2, QUAY_R + 2.0 + rand());
      if (rand() < 0.5) mesh(statics, barrelGeo(), mat('woodDark'), x, QUAY_Y + 0.6, z).scale.setScalar(1.15);
      else mesh(statics, rbox(1.2, 1.2, 1.2, 0.12), mat('wood'), x, QUAY_Y + 0.6, z, rand());
    }
    // bollards along the quay edge, lamp posts with lit lanterns
    for (let ad = 200; ad <= 340; ad += 9) {
      const [x, z] = onQuay(ad, QUAY_R + 0.8);
      mesh(statics, cyl(0.28, 0.34, 0.75, 10), mat('metal'), x, QUAY_Y + 0.3, z);
    }
    const lamp = toon(0xffe08a, { emissive: 0xffa53a, emissiveIntensity: 0.9 });
    for (let ad = 207; ad <= 335; ad += 16) {
      const [x, z] = onQuay(ad, QUAY_R + 3.6);
      mesh(statics, cyl(0.12, 0.16, 3.6, 8), mat('metal'), x, QUAY_Y + 1.8, z);
      mesh(statics, sphere(0.38, 12, 9), lamp, x, QUAY_Y + 3.85, z);
      mesh(statics, cone(0.4, 0.4, 10), mat('metal'), x, QUAY_Y + 4.3, z);
    }
    // a wooden harbour crane with a net of cargo
    const [cx, cz] = onQuay(300, QUAY_R + 3.0);
    const cry = faceBay(cx, cz);
    mesh(statics, cyl(0.45, 0.55, 7.5, 10), mat('wood'), cx, QUAY_Y + 3.75, cz);
    const jib = mesh(statics, cyl(0.25, 0.3, 7.2, 8), mat('wood'), cx + Math.sin(cry) * 2.2, QUAY_Y + 7.4, cz + Math.cos(cry) * 2.2, cry);
    jib.rotation.x = 1.1;
    const tipX = cx + Math.sin(cry) * 5.1;
    const tipZ = cz + Math.cos(cry) * 5.1;
    mesh(statics, cyl(0.05, 0.05, 4.6, 6), mat('woodDark'), tipX, QUAY_Y + 6.0, tipZ);
    const netb = mesh(statics, sphere(1, 12, 9), mat('canvas'), tipX, QUAY_Y + 3.3, tipZ);
    netb.scale.set(0.95, 0.8, 0.95);
    mesh(statics, rbox(1.8, 1.4, 1.8, 0.2), mat('woodDark'), cx - Math.sin(cry) * 0.5, QUAY_Y + 0.7, cz - Math.cos(cry) * 0.5, cry);
    // market awnings in front of the quay houses
    for (const [ad, c] of [[218, 'awning1'], [242, 'awning2'], [276, 'awning1'], [326, 'awning2']]) {
      const [x, z] = onQuay(ad, QUAY_R + 3.8);
      const ry = faceBay(x, z);
      const aw = mesh(statics, rbox(3.2, 0.2, 2.2, 0.08), mat(c), x, QUAY_Y + 2.6, z, ry);
      aw.rotation.x = 0.0;
      for (const o of [-1.4, 1.4]) mesh(statics, cyl(0.07, 0.07, 2.6, 6), mat('woodDark'), x + Math.cos(ry) * o + Math.sin(ry) * 0.9, QUAY_Y + 1.3, z - Math.sin(ry) * o + Math.cos(ry) * 0.9);
      mesh(statics, rbox(2.8, 0.9, 1.4, 0.1), mat('wood'), x, QUAY_Y + 0.45, z, ry);
      for (let k = 0; k < 4; k++) mesh(statics, sphere(0.28, 8, 6), mat(k % 2 ? 'ochre' : 'red'), x + Math.cos(ry) * (k - 1.5) * 0.6, QUAY_Y + 1.1, z - Math.sin(ry) * (k - 1.5) * 0.6);
    }
  }

  // ----- bunting: strings of little flags from the bell tower and along the quay -----
  {
    const pos = [];
    const colArr = [];
    const idx = [];
    const cols = [COL.red, COL.gold, 0xffffff, 0x2f7fd6, 0x33a37a, COL.peach].map((h) => new THREE.Color(h));
    const string = (a, b, sag, size = 0.75) => {
      const len = a.distanceTo(b);
      const n = Math.max(3, Math.floor(len / (size * 1.5)));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const p = a.clone().lerp(b, t);
        p.y -= sag * 4 * t * (1 - t);
        if (i === n) break;
        const q = a.clone().lerp(b, (i + 1) / n);
        q.y -= sag * 4 * ((i + 1) / n) * (1 - (i + 1) / n);
        // a little flag hanging between p and q (front and back faces)
        const m = p.clone().lerp(q, 0.5);
        const dir = q.clone().sub(p).normalize();
        const w = size * 0.48;
        const p0 = m.clone().addScaledVector(dir, -w);
        const p1 = m.clone().addScaledVector(dir, w);
        const p2 = m.clone();
        p2.y -= size * 1.05;
        const c = cols[(i + Math.round(len)) % cols.length];
        const base = pos.length / 3;
        for (const v of [p0, p1, p2, p0, p2, p1]) {
          pos.push(v.x, v.y, v.z);
          colArr.push(c.r, c.g, c.b);
        }
        idx.push(base, base + 1, base + 2, base + 3, base + 4, base + 5);
      }
    };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const [bx, bz] = BELL;
    const top = V(bx, TOP + 22.6, bz);
    for (const ad of [222, 240, 300, 318]) {
      const [x, z] = hb(ad * DEG, wallR);
      string(top, V(x, TOP + 7.4, z), 1.6, 0.9);
    }
    for (let ad = 207; ad < 335; ad += 16) {
      const [x0, z0] = hb(ad * DEG, QUAY_R + 3.6);
      const [x1, z1] = hb((ad + 16) * DEG, QUAY_R + 3.6);
      string(V(x0, QUAY_Y + 3.7, z0), V(x1, QUAY_Y + 3.7, z1), 0.7, 0.7);
    }
    const [lx, lz] = LIGHTHOUSE;
    const [sx, sz] = seaTowers[0];
    string(V(lx, QUAY_Y + 13.0, lz), V(sx, QUAY_Y + 8.4, sz), 2.2, 0.8);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const bm = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(3), side: THREE.DoubleSide });
    setOutline(bm, { thickness: 0.004 });
    ownMaterials.push(bm);
    const bunt = new THREE.Mesh(g, bm);
    bunt.userData.keep = true;
    root.add(bunt);
  }

  // ----- the ruined star fort on the east headland -----
  {
    const { x: fx, z: fz } = FORT;
    // the fort stands on a low grassy glacis so its walls clear the cliff edge seen from the sea
    mesh(statics, lathe([[0, 1.25], [10.5, 1.2], [13.2, 0.75], [15.2, 0.1], [16, -0.6]], 28), mat('grass'), fx, TOP - 0.25, fz);
    const y0 = TOP + 0.9;
    const ry = -0.35;
    const c = Math.cos(ry);
    const sn = Math.sin(ry);
    const W = (lx, lz) => [fx + lx * c + lz * sn, fz - lx * sn + lz * c];
    // trace: a square with an arrowhead bastion at each corner
    const s = 6;
    const trace = [];
    for (let k = 0; k < 4; k++) {
      const rot = (p) => {
        const a = (k * Math.PI) / 2;
        return [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
      };
      for (const p of [[s, s - 3.0], [s + 2.3, s - 3.0], [s + 4.6, s + 4.6], [s - 3.0, s + 2.3], [s - 3.0, s]]) trace.push(rot(p));
    }
    // the ground inside the walls, a grassy mound to stand on
    const inner = insetPoly(trace, 1.4);
    slab(statics, inner.map((p) => W(p[0], p[1])), y0 - 1, y0 + 0.5, 0.4, mat('grass'), 2);
    const ruined = new Set([5, 6, 7, 8]); // the bastion facing the bay has crumbled
    const salients = [2, 7, 12, 17];
    for (let i = 0; i < trace.length; i++) {
      const a = W(...trace[i]);
      const b = W(...trace[(i + 1) % trace.length]);
      const broken = ruined.has(i);
      const hgt = broken ? 1.6 + rand() * 1.4 : 4.2;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const wry = Math.atan2(b[0] - a[0], b[1] - a[1]) + Math.PI / 2;
      if (broken && i === 6) {
        // a breach: two stubs with a heap of rubble between them
        for (const t of [0.12, 0.88]) mesh(statics, rbox(len * 0.24, hgt, 2.0, 0.3), mat('stone'), a[0] + (b[0] - a[0]) * t, y0 + hgt / 2 - 0.4, a[1] + (b[1] - a[1]) * t, wry);
      } else {
        mesh(statics, rbox(len + 0.6, hgt, 2.0, 0.3), mat('stone'), (a[0] + b[0]) / 2, y0 + hgt / 2 - 0.4, (a[1] + b[1]) / 2, wry);
        if (!broken) mesh(statics, rbox(len + 0.8, 0.45, 2.3, 0.15), mat('paving'), (a[0] + b[0]) / 2, y0 + hgt - 0.3, (a[1] + b[1]) / 2, wry);
      }
      if (broken && i !== 6) {
        for (let k = 0; k < 3; k++) {
          const t = 0.15 + rand() * 0.7;
          const blk = mesh(statics, rbox(0.9, 0.6, 1.4, 0.12), mat('stone'), a[0] + (b[0] - a[0]) * t, y0 + hgt - 0.25, a[1] + (b[1] - a[1]) * t, wry + (rand() - 0.5) * 0.8);
          blk.rotation.z = (rand() - 0.5) * 0.5;
        }
      }
    }
    // a heap of tumbled blocks in the breach, a few strewn inside
    {
      const a = W(...trace[6]);
      const b = W(...trace[7]);
      const mx = (a[0] + b[0]) / 2;
      const mz = (a[1] + b[1]) / 2;
      const ox = mx - fx;
      const oz = mz - fz;
      const ol = Math.hypot(ox, oz);
      const bl = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const tx = (b[0] - a[0]) / bl;
      const tz = (b[1] - a[1]) / bl;
      for (let k = 0; k < 14; k++) {
        const along = (rand() - 0.5) * bl * 0.75;
        const inward = rand() * 3.2 - 0.4;
        const hump = Math.max(0, 1 - Math.abs(along) / (bl * 0.4)) * Math.max(0, 1 - inward / 3.5);
        const w = 0.7 + rand() * 0.9;
        const blk = mesh(statics, rbox(+w.toFixed(2), +(0.5 + rand() * 0.4).toFixed(2), +(0.6 + rand() * 0.6).toFixed(2), 0.12), mat(k % 3 ? 'stone' : 'rubble'),
          mx + tx * along - (ox / ol) * inward, y0 + 0.25 + hump * (0.9 + rand() * 0.5), mz + tz * along - (oz / ol) * inward, rand() * 6);
        blk.rotation.x = (rand() - 0.5) * 0.7;
        blk.rotation.z = (rand() - 0.5) * 0.7;
      }
      cannon(statics, mx - (ox / ol) * 3.0 + tx * 1.2, y0 + 0.3, mz - (oz / ol) * 3.0 + tz * 1.2, Math.atan2(ox, oz) + 0.9, 1.0, true);
    }
    // sentry boxes (garitas) on the standing salients
    for (const si of salients) {
      if (ruined.has(si) || ruined.has(si - 1)) continue;
      const [gx, gz] = W(...trace[si]);
      const back = Math.hypot(gx - fx, gz - fz);
      const ux = (gx - fx) / back;
      const uz = (gz - fz) / back;
      const px = gx - ux * 0.6;
      const pz = gz - uz * 0.6;
      mesh(statics, cone(1.0, 1.0, 14), mat('stone'), px, y0 + 3.5, pz).rotation.x = Math.PI;
      mesh(statics, cyl(0.85, 0.85, 2.3, 14), mat('white'), px, y0 + 5.1, pz);
      mesh(statics, cached('garDome', () => new THREE.SphereGeometry(0.95, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), mat('stone'), px, y0 + 6.25, pz);
      mesh(statics, sphere(0.2, 8, 6), mat('stone'), px, y0 + 7.25, pz);
      mesh(statics, rbox(0.3, 0.8, 0.3, 0.08), mat('window'), px + ux * 0.8, y0 + 5.3, pz + uz * 0.8, Math.atan2(ux, uz));
    }
    // old cannons on the walls, aimed out over the bay
    for (const [i, t] of [[1, 0.5], [3, 0.5], [16, 0.5], [18, 0.5], [11, 0.5]]) {
      const a = W(...trace[i]);
      const b = W(...trace[(i + 1) % trace.length]);
      const px = a[0] + (b[0] - a[0]) * t;
      const pz = a[1] + (b[1] - a[1]) * t;
      const ex = b[0] - a[0];
      const ez = b[1] - a[1];
      let ox = ez;
      let oz = -ex;
      if (ox * (px - fx) + oz * (pz - fz) < 0) {
        ox = -ox;
        oz = -oz;
      }
      const ol = Math.hypot(ox, oz);
      cannon(statics, px - (ox / ol) * 1.6, y0 + 3.8, pz - (oz / ol) * 1.6, Math.atan2(ox, oz), 0.95);
    }
    // a roofless powder house, a heap of cannonballs, the flagpole with a tattered flag
    const [phx, phz] = W(-2.5, -2.0);
    for (const [ox, oz, w, d] of [[0, 1.7, 4.6, 0.6], [0, -1.7, 4.6, 0.6], [2.0, 0, 0.6, 3.4], [-2.0, 0, 0.6, 3.4]]) {
      const [qx, qz] = W(-2.5 + ox, -2.0 + oz);
      mesh(statics, rbox(w, 2.2 + rand() * 0.8, d, 0.15), mat('rubble'), qx, y0 + 1.4, qz, -ry);
    }
    mesh(statics, cached('roofHalf', () => new THREE.CylinderGeometry(0.2, 0.2, 4.8, 6).rotateZ(Math.PI / 2)), mat('woodDark'), phx, y0 + 2.6, phz, -ry + 0.2);
    for (let k = 0; k < 6; k++) mesh(statics, sphere(0.32, 8, 6), mat('cannon'), ...((p) => [p[0], y0 + 0.75 + (k > 3 ? 0.5 : 0), p[1]])(W(2.5 + (k % 3) * 0.62 + (k > 3 ? 0.3 : 0), 3.5 + (k > 2 && k < 4 ? 0.6 : 0))));
    const [flx, flz] = W(1.5, -1.0);
    flag(statics, root, flx, y0 + 0.5, flz, 0xc8423c, 3.4, anim.flags, rand, 'tattered', 7.5);
    for (const [ox, oz] of [[4, -4], [-5, 4], [0, 6]]) bush(statics, ...((p) => [p[0], y0 + 0.6, p[1]])(W(ox, oz)), 0.8 + rand() * 0.4, 'grass2');
    // a cart track and an old watch hut beyond the fort
    tree(statics, fx + 18, TOP, fz - 12, 1.2, rand);
    cypress(statics, fx + 14, TOP, fz - 20, 1.1);
    cypress(statics, fx + 22, TOP, fz - 4, 1.0);
  }

  // ----- trees, hills and mountains inland -----
  for (const [x, z, k] of [
    [-92, -118, 't'], [-100, -128, 'c'], [-60, -120, 'c'], [70, -112, 't'], [86, -100, 'c'], [96, -70, 't'], [110, -60, 'c'],
    [128, -40, 't'], [140, -30, 'c'], [60, -140, 't'], [-30, -160, 't'], [30, -165, 'c'],
  ]) {
    if (k === 'c') cypress(statics, x, TOP - 0.2, z, 1.0 + rand() * 0.3);
    else tree(statics, x, TOP - 0.2, z, 1.15 + rand() * 0.35, rand);
  }
  for (const [x, z] of [[-150, -40], [-140, -70], [-170, -10], [-120, -90], [-190, 20]]) palm(statics, x, LOW - 0.3, z, 0.3, 0.5, 1.1, rand);
  const HILL = [[0, 1], [0.35, 0.97], [0.6, 0.84], [0.8, 0.6], [0.93, 0.32], [1.0, 0.05], [1.02, -0.05]];
  const hillY = (u) => {
    for (let i = 1; i < HILL.length; i++) {
      if (u <= HILL[i][0]) {
        const [u0, y0] = HILL[i - 1];
        const [u1, y1] = HILL[i];
        return y0 + ((y1 - y0) * (u - u0)) / (u1 - u0);
      }
    }
    return 0;
  };
  for (const [x, z, rx, rz, h, m, base] of [
    [-150, -170, 60, 44, 24, 'hill', TOP], [-60, -200, 56, 40, 30, 'hill2', TOP], [40, -205, 62, 46, 26, 'hill', TOP],
    [150, -150, 56, 50, 28, 'hill2', TOP], [200, -50, 46, 56, 22, 'hill', TOP], [-210, -60, 50, 44, 16, 'hill2', LOW],
  ]) {
    const hm = mesh(statics, cached('hillgeo', () => lathe(HILL, 24)), mat(m), x, base - 0.6, z);
    hm.scale.set(rx, h, rz);
    const facing = Math.atan2(-z, -x);
    for (let k = 0; k < 5; k++) {
      const a = facing + (rand() - 0.5) * 2.2;
      const u = 0.35 + rand() * 0.45;
      const px = x + Math.cos(a) * u * rx;
      const pz = z + Math.sin(a) * u * rz;
      const py = base - 0.6 + h * hillY(u) - 0.4;
      if (k % 3 === 2) cypress(statics, px, py, pz, 1.7 + rand() * 0.4);
      else tree(statics, px, py, pz, 1.8 + rand() * 0.5, rand);
    }
  }
  for (const [x, z, r, h, rz] of [[-200, -270, 90, 46, 0.6], [-60, -300, 120, 58, 0.55], [100, -285, 105, 52, 0.6], [240, -200, 85, 42, 0.7], [-320, -150, 80, 34, 0.7]]) {
    const mm = mesh(statics, cached('mtn', () => lathe([[0, 1], [0.2, 0.97], [0.42, 0.84], [0.62, 0.6], [0.8, 0.32], [0.94, 0.1], [1.02, -0.06]], 20)), mat('mountain'), x, TOP - 3, z);
    mm.scale.set(r, h, r * rz);
  }

  // ----- islets, the wreck's sand island, the jetty -----
  const colliders = [];
  const isletPoly = (x, z, r, ph) => {
    const pts = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const rr = r * (1 + 0.12 * Math.sin(2 * a + ph) + 0.07 * Math.sin(3 * a + ph * 1.3));
      pts.push([x + Math.cos(a) * rr, z + Math.sin(a) * rr]);
    }
    return pts;
  };
  for (const [x, z, r, h, kind] of ISLETS) {
    const ph = rand() * 6;
    if (kind === 'rock') {
      for (const [a, off, sc, cy, sy, m] of [[0, 0, 0.8, h * 0.3, h * 0.72, 'rock1'], [ph, 0.5, 0.48, h * 0.08, h * 0.5, 'rock2'], [ph + 2.3, 0.52, 0.42, h * 0.02, h * 0.36, 'boulder']]) {
        const b = mesh(statics, sphere(1, 14, 10), mat(m), x + Math.cos(a) * r * off, cy, z + Math.sin(a) * r * off, rand() * 3);
        b.scale.set(r * sc * 1.08, sy, r * sc * 0.95);
      }
      const tuft = mesh(statics, sphere(1, 12, 8), mat('grass'), x - r * 0.1, h * 0.93, z + r * 0.05);
      tuft.scale.set(r * 0.45, Math.max(0.6, h * 0.12), r * 0.4);
      colliders.push({ x, z, r: +(r * 0.95).toFixed(2), h });
      continue;
    }
    const poly = isletPoly(x, z, r, ph);
    if (kind === 'stack') {
      const warp = (px, py, pz) => (py <= -3 || py >= h - 0.9 ? 0 : 0.09 * h * Math.sin((Math.PI * (py + 3)) / (h + 2.1)) * Math.sin(((px - x) * 1.7) / r + ph));
      strata(statics, poly, [
        { y0: -3, y1: h * 0.42, inset: 0, bevel: Math.min(1.2, r * 0.26), mat: mat('rock1') },
        { y0: h * 0.36, y1: h * 0.74, inset: r * 0.13, bevel: Math.min(1.1, r * 0.24), mat: mat('rock2') },
        { y0: h * 0.68, y1: h - 0.25, inset: r * 0.24, bevel: Math.min(1.0, r * 0.22), mat: mat('rock3') },
        { y0: h - 0.8, y1: h + 0.45, inset: r * 0.17, bevel: Math.min(0.7, r * 0.2), mat: mat('grass'), segs: 2 },
      ], ph, warp);
      bush(statics, x + r * 0.15, h + 0.5, z, Math.min(1.0, r * 0.32));
      colliders.push({ x, z, r: +(r * 1.03).toFixed(2), h: h + 0.4 });
    } else {
      // a low sand cay with palms
      strata(statics, poly, [
        { y0: -3, y1: 1.2, inset: 0, bevel: 0.9, mat: mat('sand') },
        { y0: 0.9, y1: h, inset: r * 0.3, bevel: 0.7, mat: mat('grass2'), segs: 2 },
      ], ph);
      const n = r > 7 ? 4 : 3;
      for (let k = 0; k < n; k++) {
        const a = ph + (k / n) * Math.PI * 2;
        palm(statics, x + Math.cos(a) * r * 0.32, h - 0.2, z + Math.sin(a) * r * 0.32, Math.cos(a), Math.sin(a), 1.0 + rand() * 0.25, rand);
      }
      bush(statics, x, h + 0.2, z, 1.0);
      colliders.push({ x, z, r: +(r * 1.0).toFixed(2), h: h + 1 });
    }
  }
  // the beached wreck on its sand island
  {
    const { x, z, r } = WRECK;
    const poly = isletPoly(x, z, r, 1.7);
    strata(statics, poly, [
      { y0: -3, y1: 0.9, inset: 0, bevel: 1.0, mat: mat('sand') },
      { y0: 0.5, y1: 1.6, inset: r * 0.3, bevel: 0.6, mat: mat('sand') },
    ], 1.7);
    const g = new THREE.Group();
    g.position.set(x - 0.6, 0.55, z + 0.4);
    g.rotation.set(0.0, 0.7, 0.42);
    statics.add(g);
    mesh(g, merchantHullGeo(10, 3.6, 1.8), mat('woodDark'), 0, 0.6, 0);
    // broken ribs at the stern end, a stump of a mast, a fallen mast with a torn sail
    for (let k = 0; k < 4; k++) {
      const rib = mesh(g, cached('rib', () => new THREE.TorusGeometry(1.7, 0.16, 6, 12, Math.PI * 1.05)), mat('wood'), 0, 0.7, -5.4 - k * 0.8);
      rib.rotation.z = Math.PI + 0.05;
      rib.scale.set(1, 0.85 - k * 0.12, 1);
    }
    mesh(g, cyl(0.2, 0.26, 3.2, 8), mat('woodDark'), 0, 2.6, 1.0);
    g.updateMatrixWorld(true);
    const mast = mesh(statics, cyl(0.18, 0.24, 8.5, 8), mat('woodDark'), x + 3.4, 1.15, z + 2.4, 1.2);
    mast.rotation.z = Math.PI / 2 - 0.05;
    const sail = mesh(statics, rbox(3.2, 0.12, 2.6, 0.05), mat('canvas'), x + 2.6, 1.05, z + 3.8, 0.9);
    sail.rotation.z = 0.08;
    for (const [ox, oz] of [[-3.2, -2.6], [2.4, -3.4]]) mesh(statics, barrelGeo(), mat('wood'), x + ox, 1.5, z + oz).rotation.z = 1.4;
    chest(statics, x + 1.4, 1.15, z - 3.0, 0.6, 0.7, true, gold);
    perchedPelican(statics, x - 1.8, 3.2, z + 0.4, 2.2, 0.9);
    colliders.push({ x, z, r: r + 0.2, h: 3 });
  }
  // the old jetty: a row of pilings (two with pelicans on them)
  {
    const [jx, jz, jry] = beachAt(JETTY.at, 2);
    const ux = Math.sin(jry);
    const uz = Math.cos(jry);
    for (let k = 0; k < JETTY.n; k++) {
      const d = 1 + (k / (JETTY.n - 1)) * JETTY.len;
      for (const side of [-1, 1]) {
        if (k > 3 && side < 0 && k % 2) continue;
        const px = jx + ux * d + uz * side * 1.3;
        const pz = jz + uz * d - ux * side * 1.3;
        const ph = 2.0 + rand() * 1.2 - k * 0.12;
        mesh(statics, cyl(0.38, 0.45, ph + 2.5, 9), mat('woodDark'), px, ph / 2 - 1.2, pz);
        mesh(statics, cyl(0.42, 0.42, 0.14, 9), mat('wood'), px, ph + 0.05, pz);
        if ((k === 3 && side > 0) || (k === 6 && side > 0) || (k === 5 && side < 0)) perchedPelican(statics, px, ph + 0.1, pz, jry + rand() * 2 - 1, 0.95);
        colliders.push({ x: +px.toFixed(2), z: +pz.toFixed(2), r: 0.9, h: ph });
      }
      if (k < 3) mesh(statics, rbox(3.4, 0.25, 1.6, 0.08), mat('wood'), jx + ux * d, 2.0 - k * 0.1, jz + uz * d, jry + Math.PI / 2);
    }
  }

  // far-away islands on the horizon (decoration only)
  for (const [x, z, r, h] of [[-260, 190, 46, 18], [-330, 40, 32, 14], [150, 300, 36, 12], [300, 140, 40, 16]]) {
    const hm = mesh(statics, cached('hillgeo', () => lathe(HILL, 24)), mat('hill2'), x, -1, z);
    hm.scale.set(r, h, r * 0.7);
  }

  // ----- coastline colliders: overlapping circles hugging the waterline -----
  const shoreCircles = (pts, hgt, RMAX = 14) => {
    const nrm = leftNormals(pts);
    const S = [0];
    for (let i = 1; i < pts.length; i++) S.push(S[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = S[S.length - 1];
    const SAG = 0.75;
    let i = 0;
    let s = 0;
    while (s <= total) {
      while (i < pts.length - 1 && S[i + 1] < s) i++;
      const [px, pz] = pts[i];
      let r = RMAX;
      if (Math.hypot(px, pz) < WORLD_R + 40) {
        let cx = 0;
        let cz = 0;
        for (; r > 2.5; r -= 0.5) {
          cx = px + nrm[i][0] * r;
          cz = pz + nrm[i][1] * r;
          let ok = true;
          for (const q of pts) {
            if (Math.abs(q[0] - cx) > r || Math.abs(q[1] - cz) > r) continue;
            if (Math.hypot(q[0] - cx, q[1] - cz) < r - 0.6) {
              ok = false;
              break;
            }
          }
          if (ok) break;
        }
        colliders.push({ x: +cx.toFixed(2), z: +cz.toFixed(2), r, h: typeof hgt === 'function' ? hgt(px, pz) : hgt });
      }
      s += Math.max(2.5, 2 * Math.sqrt(2 * r * SAG - SAG * SAG));
    }
  };
  shoreCircles(join(west, seaWallW), (px, pz) => (Math.hypot(px - HB.x, pz - HB.z) < QUAY_OUT + 1 ? QUAY_Y + 0.4 : 2.6));
  shoreCircles(join(seaWallE, east), (px, pz) => (Math.hypot(px - HB.x, pz - HB.z) < QUAY_OUT + 1 ? QUAY_Y + 0.4 : TOP));
  // the moles, their heads and the boom across the mouth
  for (const ml of MOLES) {
    const span = Math.abs(ml.a1 - ml.a0) * MOLE_R;
    const n = Math.ceil(span / 2.3);
    for (let k = 0; k <= n; k++) {
      const [x, z] = hb(ml.a0 + ((ml.a1 - ml.a0) * k) / n, MOLE_R);
      colliders.push({ x: +x.toFixed(2), z: +z.toFixed(2), r: MOLE_W / 2 + 0.4, h: QUAY_Y + 0.4 });
    }
  }
  colliders.push({ x: +LIGHTHOUSE[0].toFixed(2), z: +LIGHTHOUSE[1].toFixed(2), r: 3.5, h: 20 });
  colliders.push({ x: +BEACON[0].toFixed(2), z: +BEACON[1].toFixed(2), r: 2.7, h: 8 });
  for (const t of [0.3, 0.7]) {
    const [x, z] = hb((97 - 14 * t) * DEG, MOLE_R);
    colliders.push({ x: +x.toFixed(2), z: +z.toFixed(2), r: 2.4, h: 1 });
  }
  for (const [x, z] of seaTowers) colliders.push({ x: +x.toFixed(2), z: +z.toFixed(2), r: 5.0, h: 11 });

  // ----- sandbars and the gates' foam rings, the gate buoys -----
  const shallows = buildShallows(SANDBARS, ESCAPES, rand, timeU, ampU);
  ownMaterials.push(shallows.material);
  root.add(shallows);
  const addBuoy = (x, z, color, top) => {
    const g = channelBuoy(color, top);
    g.position.set(x, 0, z);
    g.userData.keep = true;
    g.userData.base = { x, z };
    g.userData.phase = rng() * 6;
    root.add(g);
    bake(g);
    anim.buoys.push(g);
  };
  for (const gt of ESCAPES) {
    // the gate faces the harbour mouth: red to starboard, green to port, outward bound
    const dx = gt.x - 0;
    const dz = gt.z - -22;
    const l = Math.hypot(dx, dz);
    const sx = -dz / l; // starboard of a ship heading (dx, dz)
    const sz = dx / l;
    const off = gt.r + 1.6;
    addBuoy(gt.x + sx * off, gt.z + sz * off, 'buoyRed', 'can');
    addBuoy(gt.x - sx * off, gt.z - sz * off, 'buoyGreen', 'cone');
  }
  // a pair of marks off the harbour mouth
  addBuoy(-14, -38, 'buoyRed', 'can');
  addBuoy(14, -38, 'buoyGreen', 'cone');

  // ----- merchantmen at anchor in the harbour -----
  for (const [x, z, ry, hull, trim, sail, fl] of [
    [-11, -92, 1.75, 0x7a3b22, COL.gold, 0xf6ecd2, COL.red],
    [12, -84, -1.55, 0x2f4f7a, COL.gold, 0xfff4dc, 0x2f7fd6],
    [-3, -64, 1.45, 0x5a3a28, 0xe2383d, 0xf3e3c0, COL.gold],
  ]) {
    const g = merchantShip(hull, trim, sail, fl);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    g.userData.keep = true;
    g.userData.base = { x, z };
    g.userData.phase = rand() * 6;
    root.add(g);
    bake(g);
    anim.ships.push(g);
  }

  // ----- birds: pelicans gliding in a line, gulls over the harbour and the wreck -----
  {
    const gull = gullGeos();
    const pel = pelicanGeos();
    const flocks = [
      { c: [HB.x, 30, HB.z + 6], r: 26, n: 2, kind: 'gull' },
      { c: [WRECK.x, 16, WRECK.z], r: 12, n: 2, kind: 'gull' },
      { c: [-20, 22, 0], r: 60, n: 3, kind: 'pelican', line: true },
    ];
    for (const f of flocks) {
      for (let k = 0; k < f.n; k++) {
        const g = new THREE.Group();
        g.rotation.order = 'YXZ';
        g.userData.keep = true;
        root.add(g);
        const geos = f.kind === 'pelican' ? pel : gull;
        mesh(g, geos.bodyGeo, vcMaterial());
        const wings = mesh(g, geos.wingsGeo, vcMaterial(), 0, f.kind === 'pelican' ? 0.25 : 0.2, 0.05);
        g.scale.setScalar(f.kind === 'pelican' ? 1.15 : 1.3);
        anim.gulls.push({
          g, wings, c: f.c, r: f.line ? f.r : f.r * (0.8 + 0.4 * rng()), w: f.line ? 0.09 : (0.32 + rng() * 0.15) * (k % 2 ? -1 : 1) * (18 / f.r) ** 0.5,
          ph: f.line ? k * 0.09 : rng() * Math.PI * 2, fl: f.line ? k * 0.7 : rng() * 10, dy: f.line ? k * 0.6 : (rng() - 0.5) * 6, slow: f.kind === 'pelican',
        });
      }
    }
  }

  mergeStatic(statics);
  statics.traverse((o) => {
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  });

  // ----- gameplay data -----
  const reefs = SANDBARS.map((s) => ({ x: s.x, z: s.z, r: s.r }));
  const playerStart = { ...PLAYER_START };
  const enemySpawns = computeSpawns(playerStart, colliders, reefs);

  function update(t) {
    const amp = palette.waveAmp;
    timeU.value = t;
    if (anim.beam) anim.beam.rotation.y = t * 0.7;
    for (const gl of anim.glows) {
      if (gl.kind === 'lantern') gl.mat.emissiveIntensity = 0.85 + 0.25 * Math.max(0, Math.cos(t * 1.4));
      else gl.mat.emissiveIntensity = (t % 2.4) < 1.2 ? 1.1 : 0.15;
    }
    for (const f of anim.flags) {
      const p = f.userData.phase;
      f.rotation.y = -0.35 + Math.sin(t * 2.3 + p) * 0.22 + Math.sin(t * 5.1 + p) * 0.06;
      f.rotation.x = Math.sin(t * 3.7 + p) * 0.05;
      f.scale.x = 1 + Math.sin(t * 4.3 + p) * 0.06;
    }
    for (const b of anim.buoys) {
      const { x, z } = b.userData.base;
      const ph = b.userData.phase;
      const hx = waveHeight(x + 0.8, z, t, amp) - waveHeight(x - 0.8, z, t, amp);
      const hz = waveHeight(x, z + 0.8, t, amp) - waveHeight(x, z - 0.8, t, amp);
      b.position.y = waveHeight(x, z, t, amp) - 0.05 + Math.sin(t * 1.9 + ph) * 0.06;
      b.rotation.x = hz * 0.45 + Math.sin(t * 1.3 + ph) * 0.06;
      b.rotation.z = -hx * 0.45 + Math.cos(t * 1.1 + ph) * 0.06;
    }
    for (const s of anim.ships) {
      const { x, z } = s.userData.base;
      const ph = s.userData.phase;
      s.position.y = waveHeight(x, z, t, amp) * 0.8 - 0.1;
      s.rotation.z = Math.sin(t * 0.9 + ph) * 0.03;
      s.rotation.x = Math.sin(t * 0.7 + ph + 1) * 0.015;
    }
    if (anim.boom) {
      const { x, z } = anim.boom.position;
      anim.boom.position.y = waveHeight(x, z, t, amp) * 0.9;
    }
    for (const s of anim.gulls) {
      const a = s.ph + t * s.w;
      const x = s.c[0] + Math.cos(a) * s.r;
      const z = s.c[2] + Math.sin(a) * s.r;
      const y = s.c[1] + s.dy + Math.sin(t * 0.6 + s.ph) * 1.5;
      s.g.position.set(x, y, z);
      const dir = Math.sign(s.w);
      s.g.rotation.y = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir);
      s.g.rotation.z = (s.slow ? 0.12 : 0.32) * dir;
      if (s.slow) {
        // pelicans: a few slow beats, then a long glide
        const cyc = (t * 0.35 + s.fl) % 1;
        s.wings.scale.y = cyc < 0.3 ? 0.4 + 1.0 * Math.sin(cyc * Math.PI * 2 * 3 / 0.9) : 0.55;
      } else {
        const glide = 0.5 + 0.5 * Math.sin(t * 0.8 + s.fl);
        s.wings.scale.y = glide > 0.5 ? 0.25 + 1.25 * Math.sin(t * 9 + s.fl) : 0.45 + 0.15 * Math.sin(t * 3 + s.fl);
      }
    }
  }

  function dispose() {
    scene.remove(root);
    const geos = new Set();
    root.traverse((o) => {
      if (o.isMesh && o.geometry) geos.add(o.geometry);
    });
    for (const g of geos) g.dispose(); // (cached ones simply re-upload if a level is built again)
    for (const m of ownMaterials) m.dispose();
  }

  return {
    worldRadius: WORLD_R,
    colliders,
    playerStart,
    enemySpawns,
    reefs,
    escapes: ESCAPES.map((e) => ({ ...e })),
    convoyStarts: CONVOY_STARTS.map((c) => ({ ...c })),
    update,
    dispose,
    group: root,
  };
}

// Enemy spawn points: open water 58-92 from the start, clear of every collider by r + 12 and of
// every sandbar by r + 8, away from the convoy starts and the gates, inside worldRadius - 16,
// ordered so that any prefix is well spread (the first one roughly ahead of the start).
function computeSpawns(start, colliders, reefs) {
  const cand = [];
  for (let x = -WORLD_R; x <= WORLD_R; x += 3) {
    for (let z = -WORLD_R; z <= WORLD_R; z += 3) {
      if (Math.hypot(x, z) > WORLD_R - 16) continue;
      const ds = Math.hypot(x - start.x, z - start.z);
      if (ds < 58 || ds > 92) continue;
      if (colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 12)) continue;
      if (reefs.some((r) => Math.hypot(x - r.x, z - r.z) < r.r + 8)) continue;
      if (CONVOY_STARTS.some((c) => Math.hypot(x - c.x, z - c.z) < 24)) continue;
      if (ESCAPES.some((e) => Math.hypot(x - e.x, z - e.z) < e.r + 8)) continue;
      cand.push({ x, z });
    }
  }
  if (!cand.length) return [];
  const target = { x: start.x + Math.sin(start.h) * 70, z: start.z + Math.cos(start.h) * 70 };
  let first = cand[0];
  for (const c of cand) if (Math.hypot(c.x - target.x, c.z - target.z) < Math.hypot(first.x - target.x, first.z - target.z)) first = c;
  const out = [first];
  const minD = cand.map((c) => Math.hypot(c.x - first.x, c.z - first.z));
  while (out.length < 12) {
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
