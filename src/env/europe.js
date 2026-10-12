import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, setOutline, noOutline, mergeStatic, gradientMap } from '../style.js';
import { waveHeight } from '../scenery.js';

// Level 1, "Coast of Europe": a sunny Atlantic / Mediterranean coast.
//
// Map (north = -z, east = +x, the arena is the disc of radius WORLD_R around 0,0):
// - a long mainland of stacked sandstone cliffs with a puffy grass top runs along the
//   north and east sides; a broad headland with a striped lighthouse juts into the arena
// - a harbour bay (centred on BAY) with a stone quay, a mole with a rowboat, and a town
//   of pastel gabled houses on three terraces, with a church spire in the middle
// - a castle on a hill in the north-east, a windmill on the north-west cliffs, a sandy
//   cove in the east cliffs, rolling hills and hazy mountains inland
// - sea stacks, rocky islets (one with a striped daymark, two with perched gulls), buoys,
//   circling gulls, little fishing boats moored along the quay; more islets just outside the disc
// - a smugglers' cave in the cove, framed by boulders, with a lantern and an open chest of gold
// - land materials carry hand-painted marks (cliff cracks, grass tufts, sand speckles,
//   scattered bricks) projected in world space, like a painted cartoon background

export const meta = {
  name: 'Coast of Europe',
  subtitle: 'Sunny cliffs, a lighthouse and a harbour town. Corsair cutters prowl the bay.',
};

export const palette = {
  skyTop: 0x2f84e6,
  skyHorizon: 0xc8ecff,
  sunColor: 0xfff1d2,
  sunDir: [-0.45, 0.72, 0.55],
  sunIntensity: 2.45,
  hemiSky: 0xd8eeff,
  hemiGround: 0x5a7c9a,
  hemiIntensity: 1.45,
  fogColor: 0xcdedff,
  fogNear: 150,
  fogFar: 460,
  waterDeep: 0x1765c2,
  waterShallow: 0x3cbde8,
  waterFoam: 0xffffff,
  waveAmp: 0.9,
  cloudColor: 0xffffff,
  cloudShade: 0xc4d7f0,
  cloudCount: 14,
};

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------
const WORLD_R = 125;
const TOP = 14.6; // height of the grass on the mainland plateau
const BAY = { x: 50, z: -70, r: 35 }; // harbour bay: the quay front is an arc of radius r
const DEG = Math.PI / 180;
const BAY_A0 = 200 * DEG; // west end of the quay arc
const BAY_A1 = 340 * DEG; // east end
const QUAY_Y = 2.5;
const TERRACES = [
  { r: 45, y: 5.9 },
  { r: 53, y: 9.6 },
];
const CLIFF_BACK_R = 60; // cliff line behind the town (radius from BAY)

const bayPt = (a, r = BAY.r) => [BAY.x + Math.cos(a) * r, BAY.z + Math.sin(a) * r];
const BAY_W = bayPt(BAY_A0);
const BAY_E = bayPt(BAY_A1);

// Coast control points; the land is always on the left when walking along them.
const WEST_HEAD = [
  [-420, -178], [-340, -168], [-260, -140], [-190, -118], [-130, -101], [-86, -90], [-56, -87], [-38, -84],
  [-28, -77], [-21, -67], [-14, -59], [-6, -54.5], [2, -55], [8, -60.5], [12, -69], [14.6, -77], BAY_W,
];
const NE = [BAY_E, [88, -76], [93.5, -66], [97.5, -53], [100.5, -40], [102.5, -30], [103, -22]];
const COVE = [[103, -22], [107, -15], [110, -6.5], [111.3, 2], [110.3, 11], [107.4, 18.5], [104, 25]];
const NOTCH = [[103, -22], [109, -21.5], [116, -15], [120.5, -5], [121.5, 6], [118.5, 16.5], [112, 23.5], [104, 25]];
const EAST = [[104, 25], [104.6, 38], [107.5, 53], [114.5, 70], [126, 90], [146, 120], [178, 163], [222, 222], [276, 288], [340, 370]];
// far inland corners: well beyond the fog and the camera's far plane
const FAR = [[420, 480], [700, 760], [950, 760], [950, -950], [-950, -950], [-950, -200], [-560, -186]];

const LIGHTHOUSE = { x: -3, z: -61.5 };
const WINDMILL = { x: -62, z: -104 };
const CASTLE = { x: 122, z: -82 };
const MOLE_A = 305 * DEG; // where the mole leaves the quay

// Islets inside the arena and just beyond its edge: [x, z, r, h, kind]
const ISLETS = [
  [-30, -44, 3.4, 15, 'stack'],
  [-41, -51, 2.3, 9, 'stack'],
  [66, -36, 7, 6.5, 'islet'],
  [-80, -28, 8, 7, 'chapel'],
  [78, 16, 4, 7.5, 'rock', 'gulls'],
  [86, 27, 2.6, 4.5, 'rock', 'gulls'],
  [28, 40, 3, 5.5, 'rock', 'mark'],
  // beyond the edge of the arena
  [-140, -14, 10, 8, 'trees'],
  [-152, -58, 4.5, 13, 'stack'],
  [-114, 72, 4, 14, 'stack'],
  [-126, 87, 2.8, 8, 'stack'],
  [-50, 135, 7, 6, 'islet'],
  [22, 141, 4.5, 6, 'rock'],
  [35, 148, 3, 4, 'rock'],
  [98, 103, 6, 9, 'trees'],
];

// ---------------------------------------------------------------------------
// Colours (cel-shaded materials from style.js)
// ---------------------------------------------------------------------------
const COL = {
  rock1: 0xb47a52, rock2: 0xdba66c, rock3: 0xf1d49c, grass: 0x7acb4f, bush: 0x4c9e3e,
  leaf: 0x62bd4a, cypress: 0x3e8a48, trunk: 0x8a5a33, sand: 0xf7dd9c, boulder: 0x9a8b80,
  stone: 0xc6bcab, paving: 0xebdfc5, roof: 0xe45c33, roof2: 0xd04b2d, chimney: 0xa9483a,
  window: 0x2b3866, frame: 0xfffaf0, door: 0x7b4a2b, white: 0xfaf6ee, red: 0xe2383d,
  metal: 0x3b4258, copper: 0x5cc4a8, gold: 0xffc93c, castle: 0xe8dabd, castleRoof: 0x4a6cd0,
  wood: 0x9a6a40, woodDark: 0x6b4528, canvas: 0xf6ecd2, millCap: 0xc9553a, sheep: 0xf7f4ec,
  sheepFace: 0x3b3442, wheat: 0xf0cd5a, field: 0xa8d65a, hill: 0x6cbd52, hill2: 0x58a94a,
  mountain: 0x8796cc, snow: 0xffffff, gull: 0xfdfdfd, gullWing: 0xdfe7f0, beak: 0xffa630,
  buoyRed: 0xe63b3b, buoyGreen: 0x2fa84f, buoyYellow: 0xffcf33,
  flagRed: 0xe63946, flagYellow: 0xffc93c, flagBlue: 0x3a6fd8, smoke: 0xf3f1ee, cave: 0x26191b, chest: 0xa35a2c,
};
const WALLS = [0xf9b4c0, 0xfde29a, 0xaee6c8, 0xa7d3f5, 0xffcfa1, 0xd7c4f5, 0xfdf6e3, 0xf7a58f];

// ---------------------------------------------------------------------------
// Painted detail. Cartoon backgrounds are not flat colour: the painter adds a few
// cracks to the cliffs, tufts to the grass, speckles to the sand and the odd
// brick to a wall. One tiling texture holds those hand-drawn marks (R cracks,
// G grass tufts, B sand speckles, A scattered bricks/cobbles) and the land
// materials project it in world space (triplanar), so any shape gets them
// without UVs. The marks only darken the base colour, so the cel bands stay.
// ---------------------------------------------------------------------------
const PAINT_RES = 512;
const PAINT_TILE = 30; // world units per repeat
let PAINT_TEX = null;
function paintTexture() {
  if (PAINT_TEX) return PAINT_TEX;
  const N = PAINT_RES;
  const ch = [0, 1, 2, 3].map(() => new Float32Array(N * N).fill(1));
  const r = mulberry32(4242);
  // soft round dab of ink (value v at its core), wrapping around the tile
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
  // a tapering brush stroke along a polyline
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
  // R: zig-zag cracks running down the cliff face, some with a branch, plus ledges and pits
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
  // B: sand speckles and a few tiny shells
  for (let k = 0; k < 260; k++) dab(B, r() * N, r() * N, 0.8 + r() * 1.0, 0.3);
  for (let k = 0; k < 14; k++) {
    const x = r() * N;
    const y = r() * N;
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push([x + Math.cos((i / 8) * Math.PI) * 4, y + Math.sin((i / 8) * Math.PI) * 4]);
    stroke(B, pts, 1.1, 1.1, 0.2);
  }
  // A: scattered bricks, drawn in little clusters like a painter indicating masonry
  const BH = N / 40; // 40 courses
  const BW = N / 20; // 20 bricks per course
  const brick = (row, col) => {
    const x0 = col * BW + (row % 2 ? BW / 2 : 0) + 1.6;
    const y0 = row * BH + 1.6;
    const w = BW - 3.2;
    const h = BH - 3.2;
    const c = 2.2; // rounded corners
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

// How strongly each land material shows each kind of mark: [cracks, tufts, speckles, bricks]
// on walls (side) and on flat ground (top).
const PAINT = {
  rock1: { side: [0.42, 0, 0, 0], top: [0.12, 0, 0, 0] },
  rock2: { side: [0.38, 0, 0, 0], top: [0.1, 0, 0, 0] },
  rock3: { side: [0.34, 0, 0, 0], top: [0, 0, 0, 0] },
  boulder: { side: [0.3, 0, 0, 0], top: [0.2, 0, 0, 0] },
  grass: { side: [0, 0.2, 0, 0], top: [0, 0.3, 0, 0] },
  hill: { side: [0, 0.2, 0, 0], top: [0, 0.26, 0, 0] },
  hill2: { side: [0, 0.2, 0, 0], top: [0, 0.26, 0, 0] },
  sand: { side: [0, 0, 0.22, 0], top: [0, 0, 0.3, 0] },
  stone: { side: [0, 0, 0, 0.42], top: [0, 0, 0, 0.3] },
  paving: { side: [0, 0, 0, 0.3], top: [0, 0, 0, 0.36] },
  castle: { side: [0, 0, 0, 0.3], top: [0, 0, 0, 0] },
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
  m.customProgramCacheKey = () => 'europe-painted-toon';
  return m;
}

// Materials are cached for the module's lifetime (like style.js toon()), so a
// rebuilt level reuses them.
const M = {};
function mat(name) {
  if (!M[name]) {
    const noLine = name === 'window' || name === 'door';
    M[name] = PAINT[name] ? paintedToon(COL[name], PAINT[name]) : toon(COL[name], noLine ? { outline: false } : {});
  }
  return M[name];
}
const wallMat = (i) => toon(WALLS[i % WALLS.length]);

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

// Weld vertices and recompute smooth normals: rounded shapes then get clean ink outlines.
function smooth(g) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  const w = mergeVertices(g, 1e-3);
  w.computeVertexNormals();
  return w;
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
// Wobble a cliff line sideways (fades out near its ends so joints stay put).
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
// Offset a closed polygon inwards by d(i) (a number or a function of the vertex index).
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
    // outward normal
    const ox = (sgn * -dz) / l;
    const oz = (sgn * dx) / l;
    const dd = typeof d === 'function' ? d(i) : d;
    out.push([poly[i][0] - ox * dd, poly[i][1] - oz * dd]);
  }
  // drop points where the offset folded back on itself (sharp concave corners)
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

// One rounded "pancake" layer of land: the polygon extruded from y0 to y1 with a soft
// bevel that bulges out by `bevel` beyond the polygon.
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
    // bend the strata up and down so the bands of rock undulate like hand-drawn ones
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + warp(p.getX(i), p.getY(i), p.getZ(i)));
  }
  g = smooth(g);
  return mesh(parent, g, material);
}

// Stacked strata cliff: layers [{y0, y1, inset, bevel, mat, wob}] relative to the
// polygon (the visible waterline); each layer's widest bulge sits `inset` inside it.
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

// Shared vertex-coloured toon material for animated props: each prop collapses
// into one mesh (one draw call + one outline) instead of one per colour.
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
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
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

// Lathe around the y axis from [radius, y] pairs.
// (LatheGeometry wants the profile bottom-to-top for outward-facing normals.)
function lathe(profile, seg = 20) {
  const pts = profile[0][1] > profile[profile.length - 1][1] ? profile.slice().reverse() : profile;
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
function tree(parent, x, y, z, s, rand) {
  mesh(parent, cyl(0.28 * s, 0.38 * s, 2.2 * s, 8), mat('trunk'), x, y + 1.0 * s, z);
  const blobs = [
    [0, 2.9, 0, 1.45],
    [0.85, 2.4, 0.3, 1.05],
    [-0.75, 2.5, -0.35, 1.1],
  ];
  for (const [bx, by, bz, br] of blobs) {
    const m = mesh(parent, sphere(br * s, 12, 8), mat('leaf'), x + bx * s, y + by * s, z + bz * s);
    m.scale.y = 0.92 + rand() * 0.15;
  }
}
function cypress(parent, x, y, z, s) {
  mesh(parent, cyl(0.2 * s, 0.26 * s, 1.2 * s, 8), mat('trunk'), x, y + 0.5 * s, z);
  const g = cached('cypress', () => new THREE.CapsuleGeometry(0.85, 3.6, 5, 10));
  const m = mesh(parent, g, mat('cypress'), x, y + 3.2 * s, z);
  m.scale.setScalar(s);
}
function bush(parent, x, y, z, s) {
  const m = mesh(parent, sphere(1, 11, 8), mat('bush'), x, y, z);
  m.scale.set(1.25 * s, 0.85 * s, 1.1 * s);
}
function boulder(parent, x, y, z, s, rand, material) {
  const m = mesh(parent, sphere(1, 11, 8), material, x, y, z, rand() * Math.PI);
  m.scale.set(s * (1.0 + rand() * 0.35), s * (0.7 + rand() * 0.25), s * (0.85 + rand() * 0.3));
}

// Gabled house; local +z is the front (faces the sea).
function house(parent, x, y, z, ry, o) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  parent.add(g);
  const { w, d, h, rh } = o;
  const wall = wallMat(o.wall);
  const roofMat = mat(o.roof2 ? 'roof2' : 'roof');
  mesh(g, rbox(w, h + 0.4, d, 0.25), wall, 0, (h + 0.4) / 2 - 0.4, 0);

  // gable (wall colour) under a chevron roof lid; ridge runs front-to-back
  const span = o.ridgeX ? d : w;
  const len = o.ridgeX ? w : d;
  const gableKey = `gable${span},${len},${rh}`;
  const gable = cached(gableKey, () => {
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
  const roofKey = `roof${span},${len},${rh}`;
  const roof = cached(roofKey, () => {
    const s = new THREE.Shape([
      new THREE.Vector2(-a, 0), new THREE.Vector2(0, b), new THREE.Vector2(a, 0),
      new THREE.Vector2(a, -t), new THREE.Vector2(0, b - t), new THREE.Vector2(-a, -t),
    ]);
    const geo = new THREE.ExtrudeGeometry(s, { depth: len + 0.7, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 1 });
    geo.translate(0, 0, -(len + 0.7) / 2);
    return geo;
  });
  const gm = mesh(g, gable, wall, 0, h, 0);
  const rm = mesh(g, roof, roofMat, 0, h - 0.05 + t - slope * ov, 0);
  if (o.ridgeX) {
    gm.rotation.y = Math.PI / 2;
    rm.rotation.y = Math.PI / 2;
  }
  // chimney
  if (o.chimney) {
    const cx = (o.ridgeX ? 0 : span / 4) * (o.chimney > 0 ? 1 : -1);
    const cz = o.ridgeX ? -span / 4 : -len / 5;
    mesh(g, rbox(0.8, 2.2, 0.8, 0.15), mat('chimney'), cx, h + rh * 0.55 + 0.4, cz);
    g.userData.chimneyTop = new THREE.Vector3(cx, h + rh * 0.55 + 1.6, cz);
  }
  // windows and door on the front
  const fz = d / 2 + 0.02;
  const floors = Math.max(1, Math.round((h - 0.6) / 2));
  const fh = (h - 0.3) / floors;
  const win = box(0.82, 1.08, 0.22);
  const frame = box(1.1, 1.36, 0.14);
  const col = w > 4.6 ? [-w / 3.2, w / 3.2] : [-w / 4, w / 4];
  for (let f = 0; f < floors; f++) {
    const wy = f * fh + fh * 0.55;
    for (let c = 0; c < col.length; c++) {
      if (f === 0 && c === (o.doorLeft ? 0 : 1)) {
        mesh(g, box(1.15, 1.9, 0.22), mat('door'), col[c], 0.9, fz);
        mesh(g, box(1.42, 2.12, 0.14), mat('frame'), col[c], 1.0, fz - 0.03);
        continue;
      }
      mesh(g, win, mat('window'), col[c], wy, fz + 0.03);
      mesh(g, frame, mat('frame'), col[c], wy, fz - 0.02);
    }
  }
  if (!o.ridgeX && rh > 1.6) {
    // little round window in the gable
    mesh(g, cached('roundwin', () => new THREE.CylinderGeometry(0.34, 0.34, 0.2, 12).rotateX(Math.PI / 2)), mat('window'), 0, h + rh * 0.38, len / 2 - 0.02);
  }
  return g;
}

// Chunky cartoon dinghy (local +z = bow, gunwale at y = 0, keel at -D): a round-bottomed
// hull with a pointed, upswept bow and a flat transom, a floor, two thwarts and a
// fat gunwale. Returned as a group of toon meshes (merge it, or bake() it to animate).
function dinghyHullGeo(L, W, D) {
  return cached(`dinghy${L},${W},${D}`, () => {
    const NU = 16;
    const NV = 10;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= NU; i++) {
      const u = i / NU;
      const [hw, rimY, dd] = dinghyProfile(u, L, W, D);
      for (let j = 0; j <= NV; j++) {
        const th = (j / NV) * Math.PI;
        pos.push(hw * Math.cos(th), rimY - dd * Math.sin(th), (u - 0.5) * L);
      }
    }
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NV; j++) {
        const a = i * (NV + 1) + j;
        const b = a + NV + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1); // outward-facing
      }
    }
    // transom: a fan closing the stern
    const c = pos.length / 3;
    const [, rim0, d0] = dinghyProfile(0, L, W, D);
    pos.push(0, rim0 - d0 * 0.45, -L / 2);
    for (let j = 0; j < NV; j++) idx.push(c, j, j + 1);
    // the transom's top edge
    idx.push(c, NV, 0);
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // make sure the keel's normal points down (outward faces)
    const k = Math.round(NU / 2) * (NV + 1) + NV / 2;
    if (g.attributes.normal.getY(k) > 0) {
      for (let q = 0; q < idx.length; q += 3) [idx[q + 1], idx[q + 2]] = [idx[q + 2], idx[q + 1]];
      g.setIndex(idx);
      g.computeVertexNormals();
    }
    return g;
  });
}
function dinghyProfile(u, L, W, D) {
  // half-width: a transom at the stern, fullest just aft of midships, pointed bow
  const hw = u < 0.45 ? (W / 2) * (0.74 + 0.26 * Math.sin((u / 0.45) * Math.PI * 0.5)) : (W / 2) * Math.pow(Math.max(0, Math.cos(((u - 0.45) / 0.55) * Math.PI * 0.5)), 0.75);
  const rimY = 0.32 * Math.pow(Math.max(0, (u - 0.62) / 0.38), 2) + 0.1 * Math.max(0, (0.18 - u) / 0.18);
  const dd = D * (u < 0.5 ? 0.82 + 0.18 * (u / 0.5) : 1 - 0.3 * ((u - 0.5) / 0.5));
  return [hw, rimY, dd];
}
function dinghy(hullName, trimName, L = 4.4, W = 1.9, D = 0.85) {
  const g = new THREE.Group();
  mesh(g, dinghyHullGeo(L, W, D), mat(hullName));
  // gunwale along the rim
  const rim = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    const [hw, rimY] = dinghyProfile(u, L, W, D);
    rim.push(new THREE.Vector3(hw, rimY, (u - 0.5) * L));
  }
  for (let i = 11; i >= 1; i--) rim.push(new THREE.Vector3(-rim[i].x, rim[i].y, rim[i].z));
  const gun = cached(`dinghyRim${L},${W},${D}`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true, 'centripetal'), 48, 0.13, 6, true));
  mesh(g, gun, mat(trimName));
  // floor boards, a little below the rim
  const fy = -0.3;
  const floor = cached(`dinghyFloor${L},${W},${D}`, () => {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const u = 0.04 + (i / 10) * 0.86;
      const [hw, rimY, dd] = dinghyProfile(u, L, W, D);
      const s = Math.min(1, Math.max(0, (rimY - fy) / dd));
      pts.push(new THREE.Vector2(Math.max(0.05, hw * Math.sqrt(1 - s * s) - 0.06), (u - 0.5) * L));
    }
    const shape = new THREE.Shape([...pts, ...pts.slice().reverse().map((p) => new THREE.Vector2(-p.x, p.y))]);
    const fg = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false, curveSegments: 2 });
    fg.rotateX(Math.PI / 2);
    return fg;
  });
  mesh(g, floor, mat('wood'), 0, fy + 0.12, 0);
  // thwarts (seats)
  for (const u of [0.32, 0.62]) {
    const [hw, rimY] = dinghyProfile(u, L, W, D);
    mesh(g, rbox(hw * 2 - 0.1, 0.16, 0.5, 0.06), mat('woodDark'), 0, rimY - 0.2, (u - 0.5) * L);
  }
  return g;
}

// A gull sitting on a rock, wings folded (static).
function perchedGull(parent, x, y, z, ry, s) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.scale.setScalar(s);
  parent.add(g);
  const body = mesh(g, sphere(1, 12, 9), mat('gull'), 0, 0.42, 0);
  body.scale.set(0.42, 0.4, 0.8);
  body.rotation.x = -0.3;
  mesh(g, sphere(0.34, 12, 9), mat('gull'), 0, 0.92, 0.55);
  mesh(g, cached('gullBeakP', () => new THREE.ConeGeometry(0.11, 0.45, 8).rotateX(Math.PI / 2)), mat('beak'), 0, 0.88, 0.95);
  for (const sx of [-1, 1]) {
    const w = mesh(g, sphere(1, 10, 8), mat('gullWing'), sx * 0.3, 0.5, -0.12);
    w.scale.set(0.14, 0.3, 0.72);
    w.rotation.x = -0.35;
  }
  const tail = mesh(g, cached('gullTailP', () => new THREE.ConeGeometry(0.22, 0.6, 8).rotateX(-Math.PI / 2)), mat('gullWing'), 0, 0.3, -0.85);
  tail.rotation.x = 0.35;
  for (const sx of [-0.14, 0.14]) mesh(g, cyl(0.07, 0.07, 0.3, 6), mat('beak'), sx, 0.08, 0.05);
}

// A flag on a pole. The flag (animated) is returned; the pole is static.
function flag(parent, animParent, x, y, z, color, size, flags, rand, pennant = false) {
  mesh(parent, cyl(0.13, 0.16, 4.2, 8), mat('metal'), x, y + 2.1, z);
  mesh(parent, sphere(0.26, 10, 8), mat('gold'), x, y + 4.3, z);
  const L = size;
  const H = size * 0.6;
  const key = `flag${L},${pennant}`;
  const geo = cached(key, () => {
    const s = pennant
      ? new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(L, H * 0.5), new THREE.Vector2(0, H)])
      : new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(L, 0.08 * H), new THREE.Vector2(L * 0.78, H * 0.5), new THREE.Vector2(L, H * 0.92), new THREE.Vector2(0, H)]);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1, steps: 1 });
    g.translate(0, -H, -0.07);
    // bake a cartoon wave into it
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const fx = p.getX(i);
      p.setZ(i, p.getZ(i) + Math.sin(fx * 1.9) * 0.22 * (fx / L));
    }
    g.computeVertexNormals();
    return g;
  });
  const f = new THREE.Mesh(geo, toon(color));
  f.position.set(x, y + 4.15, z);
  f.userData.keep = true;
  f.userData.phase = rand() * 10;
  animParent.add(f);
  flags.push(f);
  return f;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
export function build(scene, ctx = {}) {
  const rng = typeof ctx.rng === 'function' ? ctx.rng : mulberry32(7);
  const rand = mulberry32(20240611); // fixed: the level always looks the same
  const rand2 = mulberry32(31337); // for later additions, so the tuned layout above stays put
  const root = new THREE.Group();
  root.name = 'env-europe';
  scene.add(root);
  const statics = new THREE.Group();
  root.add(statics);
  const anim = { flags: [], gulls: [], buoys: [], beam: null, rotor: null, boats: [], glows: [], smoke: [] };
  const ownMaterials = [];

  // ----- coastline -----
  const westHead = wobble(spline(WEST_HEAD, 2), 1.3, 1.1);
  const bayArc = arcPts(BAY.x, BAY.z, BAY.r, BAY_A0, BAY_A1, 2);
  const ne = wobble(spline(NE, 2), 1.0, 2.7);
  const cove = spline(COVE, 2);
  const east = wobble(spline(EAST, 2), 1.3, 4.2);
  const backA0 = 212 * DEG;
  const backA1 = 328 * DEG;
  const flankW = wobble(spline([BAY_W, [9.5, -92.5], bayPt(backA0, CLIFF_BACK_R)], 2), 0.8, 5);
  const back = wobble(arcPts(BAY.x, BAY.z, CLIFF_BACK_R, backA0, backA1, 2), 1.0, 6);
  const flankE = wobble(spline([bayPt(backA1, CLIFF_BACK_R), [91, -91], BAY_E], 2), 0.8, 7);
  const notch = wobble(spline(NOTCH, 2), 0.6, 8);

  // the visible waterline, with the height of the land behind it: [x, z, h]
  const tag = (line, h) => line.map((p) => [p[0], p[1], h]);
  const shore = join(tag(westHead, TOP), tag(bayArc, QUAY_Y), tag(ne, TOP), tag(cove, 2.4), tag(east, TOP));
  const upland = join(westHead, flankW, back, flankE, ne, notch, east, FAR);

  // ----- mainland cliffs -----
  const cliffLayers = [
    { y0: -4, y1: 5.2, inset: 0, bevel: 1.2, mat: mat('rock1'), wob: 0.5 },
    { y0: 4.3, y1: 10.2, inset: 1.5, bevel: 1.0, mat: mat('rock2'), wob: 0.9 },
    { y0: 9.5, y1: 13.6, inset: 2.6, bevel: 0.8, mat: mat('rock3'), wob: 0.8 },
    { y0: 13.0, y1: TOP, inset: 1.9, bevel: 0.75, mat: mat('grass'), wob: 0.5, segs: 2 },
  ];
  const cliffWarp = (x, y, z) => {
    if (y <= -4 || y >= 13.4) return 0;
    const f = Math.sin((Math.PI * (y + 4)) / 17.4);
    return f * (1.7 * Math.sin(0.043 * x + 0.6) * Math.cos(0.037 * z - 0.3) + 0.9 * Math.sin(0.093 * x - 0.071 * z + 2.0));
  };
  strata(statics, upland, cliffLayers, 0.3, cliffWarp);
  // rock columns on the cliff face and grassy knolls on top break up the long bands
  {
    const landmarks = [LIGHTHOUSE, WINDMILL, CASTLE, { x: LIGHTHOUSE.x - 10.5, z: LIGHTHOUSE.z - 6.5 }];
    const corners = [BAY_W, BAY_E, COVE[0], COVE[COVE.length - 1]].map(([cx, cz]) => ({ x: cx, z: cz }));
    for (const line of [westHead, ne, east]) {
      const nrm = leftNormals(line);
      let s = 0;
      let nextCol = 5 + rand() * 6;
      let nextKnoll = 10 + rand() * 10;
      for (let i = 1; i < line.length - 1; i++) {
        s += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
        const [x, z] = line[i];
        if (Math.hypot(x, z) > WORLD_R + 60) continue;
        const ry = Math.atan2(line[i + 1][0] - line[i - 1][0], line[i + 1][1] - line[i - 1][1]);
        if (s > nextCol) {
          // a wide rounded shoulder of dark rock bulging out of the cliff foot
          nextCol = s + 11 + rand() * 14;
          const sy = 3.2 + rand() * 2.6;
          const sx = 3.4 + rand() * 2.6;
          const sz = 1.5 + rand() * 0.5;
          const m = mesh(statics, sphere(1, 14, 10), mat('rock1'), x + nrm[i][0] * sz * 0.7, sy * 0.28, z + nrm[i][1] * sz * 0.7, ry);
          m.scale.set(sz, sy, sx);
          m.rotation.z = (rand() - 0.5) * 0.5;
        }
        if (s > nextKnoll) {
          // grassy pillows close to the edge make the top of the cliff undulate
          nextKnoll = s + 14 + rand() * 16;
          const sz = 4 + rand() * 2.5;
          const d = 2.2 + sz + rand() * 2;
          const kx = x + nrm[i][0] * d;
          const kz = z + nrm[i][1] * d;
          if (landmarks.some((l) => Math.hypot(l.x - kx, l.z - kz) < 15)) continue;
          if (corners.some((l) => Math.hypot(l.x - x, l.z - z) < 20)) continue;
          const k = mesh(statics, sphere(1, 16, 9), mat('grass'), kx, TOP - 0.5, kz, ry);
          k.scale.set(sz, 2.0 + rand() * 2.4, 6 + rand() * 6);
        }
      }
    }
  }

  // ----- harbour: quay, terraces, mole -----
  const sector = (r0, r1) => join(arcPts(BAY.x, BAY.z, r0, BAY_A0, BAY_A1, 2), arcPts(BAY.x, BAY.z, r1, BAY_A1 + 4 * DEG, BAY_A0 - 4 * DEG, 3));
  const quay = sector(BAY.r, 68);
  slab(statics, insetPoly(quay, 0.35), -3, QUAY_Y - 0.25, 0.35, mat('stone'), 2);
  slab(statics, insetPoly(quay, 0.9), QUAY_Y - 0.6, QUAY_Y, 0.3, mat('paving'), 2);
  for (const T of TERRACES) {
    const poly = sector(T.r, 68);
    slab(statics, insetPoly(poly, 0.3), 1.2, T.y - 0.25, 0.3, mat('stone'), 2);
    slab(statics, insetPoly(poly, 0.8), T.y - 0.6, T.y, 0.3, mat('paving'), 2);
  }
  // mole: a stone breakwater pointing from the quay towards the middle of the bay
  const moleRoot = bayPt(MOLE_A, BAY.r - 2);
  const moleDir = [BAY.x - moleRoot[0], BAY.z - moleRoot[1]];
  {
    const l = Math.hypot(moleDir[0], moleDir[1]);
    moleDir[0] /= l;
    moleDir[1] /= l;
  }
  const MOLE_LEN = 16;
  const moleRy = Math.atan2(moleDir[0], moleDir[1]);
  const moleMid = [moleRoot[0] + moleDir[0] * MOLE_LEN * 0.5, moleRoot[1] + moleDir[1] * MOLE_LEN * 0.5];
  const moleTip = [moleRoot[0] + moleDir[0] * MOLE_LEN, moleRoot[1] + moleDir[1] * MOLE_LEN];
  mesh(statics, new RoundedBoxGeometry(4.4, 5.6, MOLE_LEN, 2, 0.7), mat('stone'), moleMid[0], QUAY_Y - 2.95, moleMid[1], moleRy);
  mesh(statics, cyl(2.6, 2.75, 5.6, 18), mat('stone'), moleTip[0], QUAY_Y - 2.95, moleTip[1]);
  mesh(statics, new RoundedBoxGeometry(3.4, 0.5, MOLE_LEN - 0.4, 1, 0.2), mat('paving'), moleMid[0], QUAY_Y - 0.05, moleMid[1], moleRy);
  mesh(statics, cyl(2.1, 2.1, 0.5, 18), mat('paving'), moleTip[0], QUAY_Y - 0.05, moleTip[1]);
  // harbour beacon on the mole head
  mesh(statics, cyl(0.85, 1.0, 1.4, 14), mat('white'), moleTip[0], QUAY_Y + 0.9, moleTip[1]);
  mesh(statics, cyl(0.78, 0.85, 1.2, 14), mat('buoyGreen'), moleTip[0], QUAY_Y + 2.2, moleTip[1]);
  mesh(statics, cyl(0.7, 0.78, 0.9, 14), mat('white'), moleTip[0], QUAY_Y + 3.25, moleTip[1]);
  const beaconMat = new THREE.MeshToonMaterial({ color: 0x9dffb0, emissive: 0x3dff6a, emissiveIntensity: 0.8, gradientMap: gradientMap(3) });
  setOutline(beaconMat);
  ownMaterials.push(beaconMat);
  const beaconLamp = mesh(root, sphere(0.55, 12, 9), beaconMat, moleTip[0], QUAY_Y + 4.1, moleTip[1]);
  beaconLamp.userData.keep = true;
  anim.glows.push({ mat: beaconMat, kind: 'blink' });
  mesh(statics, cone(0.75, 0.8, 12), mat('metal'), moleTip[0], QUAY_Y + 4.85, moleTip[1]);
  // bollards along the mole and the quay
  const side = [-moleDir[1], moleDir[0]];
  for (let i = 0; i < 3; i++) {
    const s = 3 + i * 4.5;
    mesh(statics, cyl(0.3, 0.36, 0.8, 10), mat('metal'), moleRoot[0] + moleDir[0] * s - side[0] * 1.3, QUAY_Y + 0.55, moleRoot[1] + moleDir[1] * s - side[1] * 1.3);
  }
  // ----- the town -----
  const faceBay = (x, z) => Math.atan2(BAY.x - x, BAY.z - z);
  const fitsTown = (x, z, ry, w, d) => {
    // all four corners must be clear of the cliffs behind the town
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
      const px = x + lx * c + lz * s;
      const pz = z - lx * s + lz * c;
      if (pointInPoly(px, pz, upland)) return false;
    }
    return true;
  };
  const rows = [
    { r: BAY.r + 5.4, y: QUAY_Y, a0: 206, a1: 334, step: 9.6, h: [4.2, 6.2] },
    { r: TERRACES[0].r + 4.1, y: TERRACES[0].y, a0: 210, a1: 330, step: 8.1, h: [4.6, 6.6] },
    { r: TERRACES[1].r + 3.8, y: TERRACES[1].y, a0: 214, a1: 326, step: 7.2, h: [4.8, 6.8] },
  ];
  let wi = 0;
  const churchA = 270 * DEG;
  const chimneys = [];
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    for (let ad = row.a0 + (ri % 2) * 3; ad <= row.a1; ad += row.step + rand() * 1.5) {
      const a = ad * DEG;
      if (ri === 2 && Math.abs(a - churchA) < 11 * DEG) continue; // church
      if (ri === 0 && Math.abs(a - MOLE_A) < 4 * DEG) continue;
      const w = 4.1 + rand() * 1.3;
      const d = 4.3 + rand() * 0.6;
      const h = row.h[0] + rand() * (row.h[1] - row.h[0]);
      const rr = row.r + (rand() - 0.5) * 0.8;
      const [x, z] = bayPt(a, rr);
      const ry = faceBay(x, z) + (rand() - 0.5) * 0.12;
      if (!fitsTown(x, z, ry, w + 0.6, d + 0.6)) continue;
      const hg = house(statics, x, row.y - 0.05, z, ry, {
        w, d, h, rh: 1.7 + rand() * 1.0, wall: wi++ * 3 + ri, roof2: rand() < 0.4,
        ridgeX: rand() < 0.25, chimney: rand() < 0.6 ? (rand() < 0.5 ? 1 : -1) : 0, doorLeft: rand() < 0.5,
      });
      if (hg.userData.chimneyTop && ri < 2) chimneys.push({ g: hg, a });
    }
  }
  // a few houses on top of the cliff behind the town
  for (const ad of [236, 252, 290, 306]) {
    const a = ad * DEG;
    const [x, z] = bayPt(a, CLIFF_BACK_R + 7.5);
    house(statics, x, TOP - 0.1, z, faceBay(x, z), { w: 4.8, d: 4.6, h: 5.2, rh: 2.2, wall: wi++ * 3, roof2: ad > 280, chimney: 1 });
  }
  // church with a copper spire on the upper terrace; it stands side-on to the sea
  // (local -x faces the bay) so it fits on the narrow terrace
  {
    const [x, z] = bayPt(churchA, TERRACES[1].r + 3.7);
    const g = new THREE.Group();
    g.position.set(x, TERRACES[1].y - 0.05, z);
    g.rotation.y = faceBay(x, z) + Math.PI / 2;
    statics.add(g);
    const NZ = -2.4; // nave centre
    mesh(g, rbox(6.0, 7.2, 10, 0.3), mat('white'), 0, 3.3, NZ);
    const sh = new THREE.Shape([new THREE.Vector2(-2.95, 0), new THREE.Vector2(2.95, 0), new THREE.Vector2(0, 3.1)]);
    const gab = new THREE.ExtrudeGeometry(sh, { depth: 9.8, bevelEnabled: false });
    gab.translate(0, 0, -4.9);
    mesh(g, gab, mat('white'), 0, 6.9, NZ);
    const ov = 0.6;
    const t = 0.45;
    const slope = 3.1 / 2.95;
    const a = 2.95 + ov;
    const b = slope * a;
    const rs = new THREE.Shape([
      new THREE.Vector2(-a, 0), new THREE.Vector2(0, b), new THREE.Vector2(a, 0),
      new THREE.Vector2(a, -t), new THREE.Vector2(0, b - t), new THREE.Vector2(-a, -t),
    ]);
    const roof = new THREE.ExtrudeGeometry(rs, { depth: 10.8, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 1 });
    roof.translate(0, 0, -5.4);
    mesh(g, roof, mat('roof2'), 0, 6.9 - 0.05 + t - slope * ov, NZ - 0.2);
    // tower at the end of the nave
    const TZ = 4.4;
    mesh(g, rbox(3.9, 15, 3.9, 0.3), mat('white'), 0, 7.1, TZ);
    mesh(g, rbox(4.5, 0.6, 4.5, 0.2), mat('stone'), 0, 14.7, TZ);
    for (const [dx, dz] of [[0, 1.96], [0, -1.96], [1.96, 0], [-1.96, 0]]) {
      mesh(g, rbox(Math.abs(dx) > 0 ? 0.24 : 1.2, 2.1, Math.abs(dz) > 0 ? 0.24 : 1.2, 0.08), mat('window'), dx, 12.5, TZ + dz);
    }
    mesh(g, cached('clockX', () => new THREE.CylinderGeometry(1.1, 1.1, 0.24, 18).rotateZ(Math.PI / 2)), mat('frame'), -2.0, 9.6, TZ);
    mesh(g, rbox(0.12, 0.85, 0.16, 0.04), mat('metal'), -2.15, 9.95, TZ);
    const hand = mesh(g, rbox(0.12, 0.7, 0.16, 0.04), mat('metal'), -2.15, 9.45, TZ + 0.25);
    hand.rotation.x = -2.2;
    mesh(g, rbox(0.24, 2.2, 1.3, 0.12), mat('door'), -1.98, 1.05, TZ);
    mesh(g, cone(2.8, 9.5, 8), mat('copper'), 0, 15.0 + 4.75, TZ);
    mesh(g, sphere(0.42, 10, 8), mat('gold'), 0, 24.7, TZ);
    mesh(g, rbox(0.24, 1.7, 0.24, 0.05), mat('gold'), 0, 25.6, TZ);
    mesh(g, rbox(0.24, 0.24, 1.0, 0.05), mat('gold'), 0, 25.8, TZ);
    // tall arched windows on the sea side of the nave
    for (const dz of [-5.6, -2.4, 0.8]) {
      mesh(g, rbox(0.24, 2.6, 1.0, 0.1), mat('window'), -3.02, 4.0, NZ + dz);
      mesh(g, rbox(0.16, 2.9, 1.3, 0.12), mat('frame'), -2.98, 4.0, NZ + dz);
    }
  }
  // greenery around the town
  for (const [ad, rr, y, kind] of [
    [218, 44.5, QUAY_Y, 'c'], [322, 44.6, QUAY_Y, 'c'], [258, 57.5, TERRACES[1].y, 'c'], [282, 57.5, TERRACES[1].y, 'c'],
    [226, 64, TOP, 't'], [244, 66, TOP, 'c'], [270, 66, TOP, 't'], [298, 66, TOP, 'c'], [316, 64, TOP, 't'],
  ]) {
    const [x, z] = bayPt(ad * DEG, rr);
    if (kind === 'c') cypress(statics, x, y, z, 1.0 + rand() * 0.25);
    else tree(statics, x, y, z, 1.1 + rand() * 0.3, rand);
  }
  // chimney smoke: three chimneys spread across the town puff little clouds
  {
    statics.updateMatrixWorld(true);
    const picks = [];
    for (const target of [238, 268, 300]) {
      let best = null;
      for (const c of chimneys) if (!picks.includes(c) && (!best || Math.abs(c.a - target * DEG) < Math.abs(best.a - target * DEG))) best = c;
      if (best) picks.push(best);
    }
    for (const c of picks) {
      const top = c.g.localToWorld(c.g.userData.chimneyTop.clone());
      const sg = new THREE.Group();
      sg.position.copy(top);
      sg.userData.keep = true;
      root.add(sg);
      const puffs = [];
      const smokeMat = toon(COL.smoke, { outline: { thickness: 0.0045 } });
      for (let k = 0; k < 5; k++) puffs.push(mesh(sg, sphere(1, 12, 9), smokeMat));
      anim.smoke.push({ puffs, ph: rand() });
    }
  }

  // barrels and crates by the mole
  for (let i = 0; i < 4; i++) {
    const p = bayPt(MOLE_A + (i - 1.5) * 2.4 * DEG - 6 * DEG, BAY.r + 2.2);
    if (i % 2) mesh(statics, rbox(1.1, 1.1, 1.1, 0.12), mat('wood'), p[0], QUAY_Y + 0.55, p[1], rand());
    else mesh(statics, cached('barrel', () => lathe([[0, -0.6], [0.48, -0.6], [0.58, 0], [0.48, 0.6], [0, 0.6]], 12)), mat('woodDark'), p[0], QUAY_Y + 0.6, p[1]);
  }

  // ----- sandy cove -----
  {
    const rowsP = [[-4.5, -2.4], [0, 0.0], [2.6, 0.75], [6, 1.55], [10, 2.25], [17, 2.9]];
    const nrm = leftNormals(cove);
    const pos = [];
    for (let i = 0; i < cove.length; i++) {
      for (const [d, y] of rowsP) pos.push(cove[i][0] + nrm[i][0] * d, y, cove[i][1] + nrm[i][1] * d);
    }
    const idx = [];
    const W = rowsP.length;
    for (let i = 0; i < cove.length - 1; i++) {
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
    mesh(statics, g, mat('sand'));
    // beached fishing boat, a smugglers' cave with its stash, and rocks
    const sandY = (d) => {
      for (let k = 1; k < rowsP.length; k++) {
        if (d <= rowsP[k][0]) return rowsP[k - 1][1] + ((rowsP[k][1] - rowsP[k - 1][1]) * (d - rowsP[k - 1][0])) / (rowsP[k][0] - rowsP[k - 1][0]);
      }
      return rowsP[rowsP.length - 1][1];
    };
    const at = (k, d) => {
      const i = Math.floor((cove.length - 1) * k);
      return [cove[i][0] + nrm[i][0] * d, cove[i][1] + nrm[i][1] * d, Math.atan2(nrm[i][0], nrm[i][1])];
    };
    {
      // a fishing dinghy hauled up and rolled onto its side, with an oar beside it
      const [bx, bz, ry] = at(0.28, 5.6);
      const boat = dinghy('flagBlue', 'white', 5.6, 2.3, 0.95);
      boat.position.set(bx, sandY(5.6) + 0.72, bz);
      boat.rotation.set(0.05, ry + 1.25, 0.34);
      statics.add(boat);
      const [ox, oz] = at(0.2, 7.4);
      const oar = mesh(statics, rbox(0.2, 0.2, 3.8, 0.07), mat('woodDark'), ox, sandY(7.4) + 0.12, oz, ry + 0.5);
      oar.rotation.z = 0.05;
      mesh(statics, rbox(0.55, 0.12, 0.9, 0.05), mat('wood'), ox + Math.sin(ry + 0.5) * 1.9, sandY(7.4) + 0.12, oz + Math.cos(ry + 0.5) * 1.9, ry + 0.5);
    }
    // the smugglers' cave: a dark mouth framed by an arch of boulders, a lantern,
    // and the stash: barrels, crates and an open chest spilling gold
    const [cx0, cz0] = at(0.55, 11);
    let ci = 0;
    for (let i = 0; i < notch.length; i++) if (Math.hypot(notch[i][0] - cx0, notch[i][1] - cz0) < Math.hypot(notch[ci][0] - cx0, notch[ci][1] - cz0)) ci = i;
    const nn = leftNormals(notch)[ci];
    const cvx = notch[ci][0] - nn[0] * 0.15;
    const cvz = notch[ci][1] - nn[1] * 0.15;
    const cave = mesh(statics, sphere(1, 18, 12), mat('cave'), cvx, 3.0, cvz, Math.atan2(nn[0], nn[1]));
    cave.scale.set(3.4, 4.4, 1.1);
    {
      const tx = -nn[1];
      const tz = nn[0];
      for (let k = 0; k <= 8; k++) {
        const ph = (k / 8) * Math.PI;
        const s = (k === 4 ? 1.45 : 1.0 + rand2() * 0.35) * (k === 0 || k === 8 ? 1.3 : 1);
        const lx = Math.cos(ph) * 4.15;
        const ly = 2.7 + Math.sin(ph) * 5.0;
        const m = mesh(statics, sphere(1, 12, 9), mat(k % 2 ? 'rock2' : 'rock1'), cvx + tx * lx - nn[0] * 0.5, ly, cvz + tz * lx - nn[1] * 0.5, rand2() * 3);
        m.scale.set(s * 1.15, s * 0.95, s * 0.9);
      }
      // lantern on a post beside the cave
      const [lx, lz] = [cvx + tx * 5.6 - nn[0] * 1.6, cvz + tz * 5.6 - nn[1] * 1.6];
      const ly = 2.55;
      mesh(statics, cyl(0.16, 0.2, 3.6, 8), mat('woodDark'), lx, ly + 1.6, lz);
      mesh(statics, rbox(1.0, 0.16, 0.2, 0.06), mat('woodDark'), lx - tx * 0.4, ly + 3.3, lz - tz * 0.4, Math.atan2(tx, tz) + Math.PI / 2);
      mesh(statics, sphere(0.42, 12, 9), toon(0xffe08a, { emissive: 0xffa53a, emissiveIntensity: 0.9 }), lx - tx * 0.8, ly + 2.75, lz - tz * 0.8);
      mesh(statics, cone(0.42, 0.45, 10), mat('metal'), lx - tx * 0.8, ly + 3.25, lz - tz * 0.8);
      // the open treasure chest, gold glinting even in the cliff's shade
      const gold = toon(COL.gold, { emissive: 0x8a5a00, emissiveIntensity: 0.55 });
      const [chx, chz, chry] = at(0.5, 8.4);
      const cy = sandY(8.4) - 0.05;
      const chest = new THREE.Group();
      chest.position.set(chx, cy, chz);
      chest.rotation.y = chry + Math.PI + 0.35;
      statics.add(chest);
      mesh(chest, rbox(2.0, 1.2, 1.3, 0.16), mat('chest'), 0, 0.6, 0);
      for (const sx of [-0.62, 0.62]) mesh(chest, rbox(0.2, 1.24, 1.36, 0.06), gold, sx, 0.6, 0);
      mesh(chest, rbox(0.34, 0.4, 0.16, 0.06), gold, 0, 0.82, 0.68);
      const heap = mesh(chest, sphere(1, 14, 9), gold, 0, 1.22, 0.05);
      heap.scale.set(0.86, 0.42, 0.56);
      const lid = new THREE.Group();
      lid.position.set(0, 1.2, -0.66);
      lid.rotation.x = -1.95;
      chest.add(lid);
      const dome = mesh(lid, cached('chestLid', () => new THREE.CylinderGeometry(0.66, 0.66, 2.0, 14).rotateZ(Math.PI / 2)), mat('chest'), 0, 0, 0.66);
      dome.scale.set(1, 0.6, 1);
      for (const sx of [-0.62, 0.62]) {
        const band = mesh(lid, cached('chestBand', () => new THREE.CylinderGeometry(0.7, 0.7, 0.2, 14).rotateZ(Math.PI / 2)), gold, sx, 0, 0.66);
        band.scale.set(1, 0.62, 1);
      }
      // coins spilled on the sand
      const coin = cached('coin', () => new THREE.CylinderGeometry(0.32, 0.32, 0.1, 12));
      for (let k = 0; k < 9; k++) {
        const a = rand2() * Math.PI * 2;
        const rr = 1.3 + rand2() * 1.6;
        const c = mesh(statics, coin, gold, chx + Math.cos(a) * rr - nn[0] * 0.6, cy + 0.08, chz + Math.sin(a) * rr - nn[1] * 0.6);
        c.rotation.set((rand2() - 0.5) * 0.5, 0, (rand2() - 0.5) * 0.5);
      }
      for (let k = 0; k < 3; k++) mesh(statics, coin, gold, chx + tx * 1.9, cy + 0.08 + k * 0.11, chz + tz * 1.9);
    }
    const keg = cached('barrel', () => lathe([[0, -0.6], [0.48, -0.6], [0.58, 0], [0.48, 0.6], [0, 0.6]], 12));
    for (const [k, d, kind] of [[0.44, 8.9, 'b'], [0.47, 10.0, 'c'], [0.62, 8.9, 'b'], [0.66, 7.7, 'b'], [0.6, 10.0, 'c']]) {
      const [x, z] = at(k, d);
      if (kind === 'b') mesh(statics, keg, mat('woodDark'), x, sandY(d) + 0.72, z).scale.setScalar(1.4);
      else mesh(statics, rbox(1.7, 1.7, 1.7, 0.2), mat('wood'), x, sandY(d) + 0.75, z, rand());
    }
    for (const k of [0.12, 0.85]) {
      const [x, z] = at(k, 3);
      boulder(statics, x, 0.6, z, 1.6, rand, mat('boulder'));
    }
  }

  // ----- cliff-foot boulders and cliff-top bushes along the visible coast -----
  {
    const segs = [westHead, ne, east];
    for (const line of segs) {
      const nrm = leftNormals(line);
      for (let i = 4; i < line.length - 4; i++) {
        const [x, z] = line[i];
        const dc = Math.hypot(x, z);
        if (dc > WORLD_R + 70) continue;
        const r = rand();
        if (i % 6 === 0 && r < 0.75) {
          const s = 1.0 + rand() * 0.9;
          boulder(statics, x + nrm[i][0] * (s * 0.35), s * 0.1, z + nrm[i][1] * (s * 0.35), s, rand, rand() < 0.5 ? mat('boulder') : mat('rock1'));
        }
        if (i % 4 === 2 && rand() < 0.7) {
          const s = 0.9 + rand() * 0.9;
          bush(statics, x + nrm[i][0] * (3.2 + rand()), TOP + 0.1, z + nrm[i][1] * (3.2 + rand()), s);
        }
      }
    }
  }

  // ----- lighthouse on the headland -----
  {
    const { x, z } = LIGHTHOUSE;
    const y0 = TOP - 0.2;
    mesh(statics, cyl(3.5, 3.8, 2.0, 18), mat('stone'), x, y0 + 1.0, z);
    const bands = 6;
    const bh = 2.35;
    for (let i = 0; i < bands; i++) {
      const r0 = 2.75 - i * 0.14;
      const r1 = 2.75 - (i + 1) * 0.14;
      mesh(statics, cyl(r1, r0, bh, 18), mat(i % 2 ? 'white' : 'red'), x, y0 + 2.0 + bh * (i + 0.5), z);
    }
    const ty = y0 + 2.0 + bh * bands;
    mesh(statics, cyl(3.0, 2.6, 0.7, 18), mat('metal'), x, ty + 0.35, z);
    // chunky railing posts
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      mesh(statics, cyl(0.12, 0.12, 1.0, 6), mat('metal'), x + Math.cos(a) * 2.75, ty + 1.15, z + Math.sin(a) * 2.75);
    }
    mesh(statics, cached('rail', () => new THREE.TorusGeometry(2.75, 0.13, 6, 28).rotateX(Math.PI / 2)), mat('metal'), x, ty + 1.65, z);
    const lampMat = new THREE.MeshToonMaterial({ color: 0xfff3b0, emissive: 0xffd34d, emissiveIntensity: 0.9, gradientMap: gradientMap(3) });
    setOutline(lampMat);
    ownMaterials.push(lampMat);
    const lantern = mesh(root, cyl(1.55, 1.55, 2.3, 16), lampMat, x, ty + 1.85, z);
    lantern.userData.keep = true;
    anim.glows.push({ mat: lampMat, kind: 'lantern' });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      mesh(statics, cyl(0.13, 0.13, 2.3, 6), mat('metal'), x + Math.cos(a) * 1.58, ty + 1.85, z + Math.sin(a) * 1.58);
    }
    mesh(statics, cyl(2.05, 2.05, 0.35, 18), mat('metal'), x, ty + 3.15, z);
    mesh(statics, cached('dome', () => new THREE.SphereGeometry(1.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), mat('red'), x, ty + 3.3, z);
    mesh(statics, sphere(0.42, 10, 8), mat('metal'), x, ty + 5.35, z);
    mesh(statics, cone(0.2, 1.1, 8), mat('metal'), x, ty + 6.1, z);
    // door and windows
    const face = Math.atan2(-x, -z); // towards the arena centre
    const fx = Math.sin(face);
    const fz = Math.cos(face);
    mesh(statics, rbox(1.3, 2.0, 0.4, 0.14), mat('door'), x + fx * 2.68, y0 + 3.0, z + fz * 2.68, face);
    for (const hh of [7.6, 12.3]) {
      const r = 2.75 - ((hh - 2) / bh) * 0.14;
      mesh(statics, rbox(0.7, 1.0, 0.3, 0.1), mat('window'), x + fx * (r - 0.02), y0 + hh, z + fz * (r - 0.02), face);
    }
    // the rotating beam: two soft, widening shafts of light from the lantern. Additive
    // blending makes them read as light (they brighten what is behind) instead of
    // a pale haze laid over the hills.
    const beamGeo = (() => {
      const L = 40;
      const parts = [];
      for (const dir of [1, -1]) {
        const c = new THREE.CylinderGeometry(3.4, 1.0, L, 20, 4, true);
        c.translate(0, -L / 2 - 1.7, 0); // starts at the lantern glass, not inside it
        c.rotateZ((dir * Math.PI) / 2);
        c.rotateZ(dir * -0.06); // tilt slightly down
        parts.push(c);
      }
      const g = mergeGeometries(parts.map((p) => p.toNonIndexed()), false);
      const pos = g.attributes.position;
      const colors = new Float32Array(pos.count * 4);
      for (let i = 0; i < pos.count; i++) {
        const t = Math.min(1, Math.max(0, Math.abs(pos.getX(i)) - 1.7) / L);
        colors.set([1, 0.88, 0.5, 0.42 * Math.pow(1 - t, 1.4) * Math.min(1, t * 12 + 0.25)], i * 4);
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
      return g;
    })();
    const beamMat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true, blending: THREE.AdditiveBlending,
    });
    noOutline(beamMat);
    ownMaterials.push(beamMat);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(x, ty + 1.85, z);
    beam.userData.keep = true;
    beam.renderOrder = 2;
    root.add(beam);
    anim.beam = beam;
    // keeper's cottage, fence and trees
    house(statics, x - 10.5, y0, z - 6.5, face + 0.3, { w: 5.2, d: 4.4, h: 3.6, rh: 2.0, wall: 6, roof2: false, chimney: 1, ridgeX: true });
    tree(statics, x - 9, y0, z - 12, 1.1, rand);
    cypress(statics, x + 7, y0, z - 9, 1.1);
    cypress(statics, x + 9.5, y0, z - 6.5, 0.9);
  }

  // ----- windmill on the north-west cliffs -----
  {
    const { x, z } = WINDMILL;
    const y0 = TOP - 0.2;
    mesh(statics, cyl(4.0, 4.3, 1.2, 18), mat('stone'), x, y0 + 0.5, z);
    mesh(statics, lathe([[3.6, 0], [3.45, 3], [3.05, 7], [2.6, 10.6], [0, 10.6]], 20), mat('white'), x, y0 + 0.9, z);
    mesh(statics, lathe([[3.05, 0], [3.0, 0.9], [2.4, 2.6], [1.3, 3.8], [0.3, 4.4], [0, 4.45]], 20), mat('millCap'), x, y0 + 11.3, z);
    mesh(statics, sphere(0.45, 10, 8), mat('gold'), x, y0 + 15.9, z);
    const face = Math.atan2(-x, -z);
    const fx = Math.sin(face);
    const fz = Math.cos(face);
    mesh(statics, rbox(1.5, 2.4, 0.5, 0.15), mat('door'), x + fx * 3.5, y0 + 2.1, z + fz * 3.5, face);
    mesh(statics, rbox(0.9, 1.1, 0.4, 0.12), mat('window'), x + fx * 3.0, y0 + 7.0, z + fz * 3.0, face);
    mesh(statics, rbox(0.8, 0.9, 0.4, 0.12), mat('window'), x - fz * 3.2, y0 + 5.0, z + fx * 3.2, face + Math.PI / 2);
    // rotor on an axle sticking out towards the sea
    const hub = new THREE.Group();
    hub.position.set(x + fx * 3.9, y0 + 12.4, z + fz * 3.9);
    hub.rotation.y = face;
    hub.userData.keep = true;
    root.add(hub);
    const rotor = new THREE.Group();
    hub.add(rotor);
    mesh(rotor, cached('axle', () => new THREE.CylinderGeometry(0.45, 0.45, 1.6, 10).rotateX(Math.PI / 2)), mat('woodDark'), 0, 0, -0.5);
    mesh(rotor, sphere(0.75, 12, 9), mat('woodDark'), 0, 0, 0.35);
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Group();
      arm.rotation.z = (k * Math.PI) / 2;
      rotor.add(arm);
      mesh(arm, rbox(0.42, 9.2, 0.32, 0.12), mat('wood'), 0, 4.6, 0.25);
      mesh(arm, rbox(2.15, 6.6, 0.18, 0.1), mat('canvas'), 1.3, 5.3, 0.2);
      for (let j = 0; j < 4; j++) mesh(arm, rbox(2.5, 0.18, 0.26, 0.06), mat('wood'), 1.15, 2.6 + j * 1.9, 0.27);
      mesh(arm, rbox(0.18, 6.8, 0.26, 0.06), mat('wood'), 2.45, 5.3, 0.27);
    }
    bake(rotor);
    anim.rotor = rotor;
    // sheep, a field and some trees nearby
    for (const [sx, sz] of [[10, 6], [13, 10], [8, 12], [16, 4], [-9, 9]]) {
      const px = x + sx;
      const pz = z + sz;
      const b = mesh(statics, sphere(0.95, 12, 9), mat('sheep'), px, y0 + 1.0, pz, rand() * 6);
      b.scale.set(1.0, 0.85, 1.35);
      const hd = mesh(statics, sphere(0.45, 10, 8), mat('sheepFace'), px + Math.sin(b.rotation.y) * 1.25, y0 + 1.25, pz + Math.cos(b.rotation.y) * 1.25);
      hd.scale.set(0.9, 1.0, 1.15);
    }
    tree(statics, x - 9, y0, z - 3, 1.3, rand);
    tree(statics, x + 18, y0, z - 8, 1.2, rand);
    cypress(statics, x - 14, y0, z + 6, 1.15);
    cypress(statics, x + 24, y0, z + 4, 1.0);
  }

  // ----- castle on a hill in the north-east -----
  {
    const { x, z } = CASTLE;
    const hill = mesh(statics, lathe([[0, 6.4], [9, 6.4], [11.5, 6.1], [14, 5.0], [17, 3.0], [20, 1.2], [22.5, 0.3], [23.5, -0.8]], 24), mat('grass'), x, TOP - 0.4, z);
    hill.scale.set(1, 1, 0.85);
    const hy = TOP - 0.4 + 6.4;
    const face = Math.atan2(-x, -z);
    const g = new THREE.Group();
    g.position.set(x, hy - 0.2, z);
    g.rotation.y = face;
    statics.add(g);
    mesh(g, cyl(9.6, 10, 1.0, 24), mat('stone'), 0, 0.3, 0);
    const W2 = 7.4;
    const D2 = 6.0;
    const corners = [[-W2, D2], [W2, D2], [-W2, -D2], [W2, -D2]];
    // curtain walls with crenellations
    const walls = [
      [0, D2, 2 * W2, 0], [0, -D2, 2 * W2, 0], [-W2, 0, 2 * D2, 1], [W2, 0, 2 * D2, 1],
    ];
    for (const [wx, wz, len, rot] of walls) {
      mesh(g, rbox(len, 6.2, 1.4, 0.3), mat('castle'), wx, 3.1, wz, rot ? Math.PI / 2 : 0);
      const n = Math.floor(len / 1.7);
      for (let i = 0; i < n; i++) {
        const t = -len / 2 + (i + 0.5) * (len / n);
        const mx = rot ? wx : wx + t;
        const mz = rot ? wz + t : wz;
        if (i % 2 === 0) mesh(g, rbox(0.9, 1.0, 1.5, 0.15), mat('castle'), mx, 6.6, mz, rot ? Math.PI / 2 : 0);
      }
    }
    // gate
    mesh(g, rbox(2.6, 3.4, 0.4, 0.3), mat('woodDark'), 0, 1.9, D2 + 0.58);
    mesh(g, rbox(3.4, 0.6, 0.5, 0.2), mat('stone'), 0, 3.85, D2 + 0.62);
    for (const [cx, cz] of corners) {
      mesh(g, cyl(2.2, 2.4, 9.5, 16), mat('castle'), cx, 4.75, cz);
      mesh(g, cyl(2.6, 2.6, 0.6, 16), mat('castle'), cx, 9.6, cz);
      mesh(g, cone(2.95, 5.2, 16), mat('castleRoof'), cx, 12.5, cz);
      mesh(g, rbox(0.5, 1.0, 0.3, 0.1), mat('window'), cx + 0, 6.8, cz + 2.2 * Math.sign(cz));
    }
    // keep and a tall round tower
    mesh(g, rbox(7.4, 12, 6.6, 0.4), mat('castle'), -0.8, 6.0, -1.0);
    for (let i = 0; i < 4; i++) {
      for (const dz of [2.3, -4.3]) mesh(g, rbox(0.9, 1.0, 0.9, 0.15), mat('castle'), -3.0 + i * 2.0, 12.4, dz);
    }
    for (const wy of [5.5, 9.0]) for (const wx of [-2.6, 1.0]) mesh(g, rbox(0.7, 1.3, 0.3, 0.1), mat('window'), wx, wy, 2.35);
    mesh(g, cyl(2.5, 2.7, 17, 16), mat('castle'), 3.6, 8.5, -3.6);
    mesh(g, cyl(2.95, 2.95, 0.7, 16), mat('castle'), 3.6, 17.1, -3.6);
    mesh(g, cone(3.3, 6.4, 16), mat('castleRoof'), 3.6, 20.6, -3.6);
    for (const wy of [9, 13]) mesh(g, rbox(0.55, 1.2, 0.3, 0.1), mat('window'), 3.6, wy, -3.6 + 2.55);
    // flags (positions are in the castle's local frame; flags live in the root)
    const toWorld = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), face).add(g.position);
    const fpos = [[3.6, 23.6, -3.6, COL.flagRed, 3.6, false], [-W2, 15.0, D2, COL.flagYellow, 2.6, true], [W2, 15.0, D2, COL.flagBlue, 2.6, true]];
    for (const [lx, ly, lz, c, s, p] of fpos) {
      const v = toWorld(lx, ly - 0.2, lz);
      flag(statics, root, v.x, v.y, v.z, c, s, anim.flags, rand, p);
    }
    // trees on the hill
    tree(statics, x - 14, TOP + 1.6, z + 9, 1.2, rand);
    tree(statics, x + 12, TOP + 2.2, z + 10, 1.1, rand);
    cypress(statics, x - 16, TOP + 0.6, z - 4, 1.2);
    cypress(statics, x - 5, TOP + 2.7, z + 13, 1.0);
  }

  // ----- trees, fields and hills inland -----
  for (const [x, z, k] of [
    [-100, -104, 't'], [-92, -112, 'c'], [-40, -98, 't'], [-28, -104, 'c'], [-20, -92, 't'],
    [107, -50, 't'], [104, -60, 'c'], [116, -40, 't'], [114, 35, 't'], [120, 48, 'c'], [126, 30, 't'],
    [130, 10, 'c'], [118, 62, 't'], [-130, -112, 't'], [140, -20, 't'], [93, -123, 't'], [-8, -120, 't'],
  ]) {
    if (k === 'c') cypress(statics, x, TOP - 0.2, z, 1.0 + rand() * 0.3);
    else tree(statics, x, TOP - 0.2, z, 1.15 + rand() * 0.35, rand);
  }
  for (const [x, z, w, d, ry, m] of [
    [-82, -126, 22, 14, 0.2, 'wheat'], [-56, -132, 18, 16, -0.15, 'field'], [-108, -134, 20, 13, 0.35, 'field'],
    [140, -2, 16, 24, 0.1, 'wheat'], [146, 36, 18, 20, -0.2, 'field'],
  ]) {
    mesh(statics, new RoundedBoxGeometry(w, 0.8, d, 1, 0.35), mat(m), x, TOP - 0.15, z, ry);
  }
  const hills = [
    [-180, -178, 62, 46, 22, 'hill'], [-92, -172, 56, 40, 30, 'hill2'], [8, -186, 62, 46, 26, 'hill'],
    [176, -142, 56, 50, 28, 'hill2'], [192, -42, 46, 56, 22, 'hill'], [204, 70, 52, 56, 24, 'hill2'],
  ];
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
  for (const [x, z, rx, rz, h, m] of hills) {
    const hm = mesh(statics, cached('hillgeo', () => lathe(HILL, 24)), mat(m), x, TOP - 0.6, z);
    hm.scale.set(rx, h, rz);
    // clumps of trees and a hedge-like row of bushes on the slopes facing the sea
    const facing = Math.atan2(-z, -x);
    for (let k = 0; k < 6; k++) {
      const a = facing + (rand() - 0.5) * 2.2;
      const u = 0.35 + rand() * 0.45;
      const px = x + Math.cos(a) * u * rx;
      const pz = z + Math.sin(a) * u * rz;
      const py = TOP - 0.6 + h * hillY(u) - 0.4;
      if (k % 3 === 2) cypress(statics, px, py, pz, 1.7 + rand() * 0.4);
      else tree(statics, px, py, pz, 1.8 + rand() * 0.5, rand);
    }
  }
  const mountains = [
    [-150, -300, 95, 70], [-30, -330, 110, 96], [110, -310, 95, 80], [250, -230, 90, 72], [300, -60, 80, 60],
  ];
  for (const [x, z, r, h] of mountains) {
    const mm = mesh(statics, cached('mtn', () => lathe([[0, 1], [0.12, 0.96], [0.3, 0.78], [0.55, 0.45], [0.8, 0.18], [1.0, 0.0], [1.02, -0.1]], 18)), mat('mountain'), x, TOP - 2, z);
    mm.scale.set(r, h, r * 0.8);
    const sm = mesh(statics, cached('snow', () => lathe([[0, 1], [0.12, 0.96], [0.25, 0.83], [0.31, 0.76], [0.2, 0.74], [0, 0.73]], 18)), mat('snow'), x, TOP - 2 + 0.6, z);
    sm.scale.set(r * 1.02, h, r * 0.82);
  }

  // ----- islets and sea stacks -----
  const colliders = [];
  for (const [x, z, r, h, kind, deco] of ISLETS) {
    const ph = rand() * 6;
    if (kind === 'rock') {
      // a pile of big round boulders with a tuft of grass
      const parts = [
        [0, 0, 0.8, h * 0.3, h * 0.72, 'rock1'],
        [ph, 0.5, 0.48, h * 0.08, h * 0.5, 'rock2'],
        [ph + 2.3, 0.52, 0.42, h * 0.02, h * 0.36, 'boulder'],
      ];
      for (const [a, off, sc, cy, sy, m] of parts) {
        const b = mesh(statics, sphere(1, 14, 10), mat(m), x + Math.cos(a) * r * off, cy, z + Math.sin(a) * r * off, rand() * 3);
        b.scale.set(r * sc * 1.08, sy, r * sc * 0.95);
      }
      const tuft = mesh(statics, sphere(1, 12, 8), mat('grass'), x - r * 0.1, h * 0.93, z + r * 0.05);
      tuft.scale.set(r * 0.45, Math.max(0.6, h * 0.12), r * 0.4);
      const topY = h * 0.93 + Math.max(0.6, h * 0.12) * 0.55;
      if (deco === 'mark') {
        // a stubby striped daymark warning sailors off the rocks
        const px = x - r * 0.1;
        const pz = z + r * 0.05;
        const y0 = topY - 0.7;
        mesh(statics, cyl(0.85, 1.0, 0.7, 12), mat('stone'), px, y0 + 0.35, pz);
        for (let k = 0; k < 3; k++) mesh(statics, cyl(0.62 - k * 0.06, 0.68 - k * 0.06, 1.3, 12), mat(k % 2 ? 'white' : 'red'), px, y0 + 1.3 + k * 1.3, pz);
        mesh(statics, cyl(0.6, 0.6, 0.22, 12), mat('metal'), px, y0 + 4.65, pz);
        mesh(statics, sphere(0.62, 14, 10), mat('gold'), px, y0 + 5.3, pz);
      } else if (deco === 'gulls') {
        perchedGull(statics, x + r * 0.12, topY - 0.1, z - r * 0.05, rand2() * 6, 1.35);
        if (r > 3) perchedGull(statics, x - r * 0.45, topY - 0.55, z + r * 0.25, rand2() * 6, 1.2);
      }
      colliders.push({ x, z, r: +(r * 0.95).toFixed(2), h: +h.toFixed(2) });
      continue;
    }
    const lobed = () => {
      const n = 28;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = r * (1 + 0.12 * Math.sin(2 * a + ph) + 0.07 * Math.sin(3 * a + ph * 1.3) + 0.035 * Math.sin(6 * a + ph * 2.1));
        pts.push([x + Math.cos(a) * rr, z + Math.sin(a) * rr]);
      }
      return pts;
    };
    const poly = lobed();
    const warp = (px, py, pz) => {
      if (py <= -3 || py >= h - 0.9) return 0;
      const f = Math.sin((Math.PI * (py + 3)) / (h + 2.1));
      return 0.09 * h * f * Math.sin(((px - x) * 1.7) / r + ph) * Math.cos(((pz - z) * 1.3) / r - ph);
    };
    const b = Math.min(1.4, r * 0.26);
    let layers;
    if (kind === 'stack') {
      const lx = Math.cos(ph * 1.7) * r * 0.2;
      const lz = Math.sin(ph * 1.7) * r * 0.2;
      layers = [
        { y0: -3, y1: h * 0.42, inset: 0, bevel: b, mat: mat('rock1') },
        { y0: h * 0.36, y1: h * 0.74, inset: r * 0.13, bevel: b * 0.95, mat: mat('rock2'), shift: [lx * 0.5, lz * 0.5] },
        { y0: h * 0.68, y1: h - 0.25, inset: r * 0.25, bevel: b * 0.9, mat: mat('rock3'), shift: [lx, lz] },
        { y0: h - 0.8, y1: h + 0.45, inset: r * 0.17, bevel: Math.min(0.7, b * 0.8), mat: mat('grass'), segs: 2, shift: [lx, lz] },
      ];
      strata(statics, poly, layers, ph, warp);
      bush(statics, x + lx + r * 0.15, h + 0.5, z + lz, Math.min(1.0, r * 0.32));
    } else {
      layers = [
        { y0: -3, y1: h * 0.62, inset: 0, bevel: b, mat: mat('rock1') },
        { y0: h * 0.54, y1: h - 0.4, inset: r * 0.11, bevel: b * 0.85, mat: mat('rock2') },
        { y0: h - 0.9, y1: h + 0.35, inset: r * 0.07, bevel: Math.min(0.7, b), mat: mat('grass'), segs: 2 },
      ];
      strata(statics, poly, layers, ph, warp);
      // a soft grassy mound on top so the island is not flat like a cake
      const mound = mesh(statics, sphere(1, 18, 10), mat('grass'), x, h + 0.1, z);
      mound.scale.set(r * 0.72, Math.min(2.2, r * 0.22), r * 0.68);
    }
    const top = h + 0.3;
    const onMound = (dx, dz) => top + 0.9 * Math.max(0, 1 - (dx * dx + dz * dz) / (r * r * 0.45)) * Math.min(2.2, r * 0.22) / 1.6;
    if (kind === 'chapel') {
      const ry = Math.atan2(-x, -z);
      house(statics, x - 1, onMound(-1, 0.5) - 0.3, z + 0.5, ry, { w: 3.8, d: 5.2, h: 3.6, rh: 2.0, wall: 6, roof2: true, chimney: 0 });
      const bx = x - 1 + Math.sin(ry) * 1.6;
      const bz = z + 0.5 + Math.cos(ry) * 1.6;
      mesh(statics, rbox(1.5, 2.4, 1.5, 0.2), mat('white'), bx, onMound(-1, 2) + 4.0, bz, ry);
      mesh(statics, cone(1.15, 1.8, 4), mat('roof2'), bx, onMound(-1, 2) + 6.1, bz, ry + Math.PI / 4);
      cypress(statics, x + 3.8, onMound(3.8, -2.5) - 0.3, z - 2.5, 0.85);
      cypress(statics, x + 4.6, onMound(4.6, 1) - 0.3, z + 1.0, 0.7);
      bush(statics, x - 4.6, onMound(-4.6, -2), z - 2, 1.0);
    } else if (kind === 'trees') {
      tree(statics, x - r * 0.3, onMound(-r * 0.3, 0) - 0.3, z, 1.3, rand);
      tree(statics, x + r * 0.35, onMound(r * 0.35, -r * 0.25) - 0.3, z - r * 0.25, 1.1, rand);
      cypress(statics, x + r * 0.1, onMound(r * 0.1, r * 0.4) - 0.3, z + r * 0.4, 1.0);
    } else if (kind === 'islet') {
      tree(statics, x + r * 0.15, onMound(r * 0.15, -r * 0.15) - 0.3, z - r * 0.15, 1.15, rand);
      bush(statics, x - r * 0.45, onMound(-r * 0.45, r * 0.2), z + r * 0.2, 1.1);
      bush(statics, x + r * 0.5, onMound(r * 0.5, r * 0.35), z + r * 0.35, 0.8);
    }
    for (let k = 0; k < (kind === 'stack' ? 2 : 3); k++) {
      const a = ph + k * 2.2 + rand();
      boulder(statics, x + Math.cos(a) * r * 0.92, 0.1, z + Math.sin(a) * r * 0.92, Math.min(1.6, r * 0.3), rand, mat(k % 2 ? 'boulder' : 'rock1'));
    }
    colliders.push({ x, z, r: +(r * 1.03).toFixed(2), h: +(h + 0.4).toFixed(2) });
  }

  // far-away islands on the open-sea horizon (decoration only)
  for (const [x, z, r, h] of [[-260, 180, 50, 20], [-330, -20, 32, 16], [120, 300, 40, 14]]) {
    const hm = mesh(statics, cached('hillgeo', () => lathe([[0, 1], [0.35, 0.97], [0.6, 0.84], [0.8, 0.6], [0.93, 0.32], [1.0, 0.05], [1.02, -0.05]], 24)), mat('hill2'), x, -1, z);
    hm.scale.set(r, h, r * 0.7);
  }

  // ----- coastline colliders: overlapping circles hugging the waterline -----
  {
    const pts = shore;
    const nrm = leftNormals(pts.map((p) => [p[0], p[1]]));
    // cumulative arc length
    const S = [0];
    for (let i = 1; i < pts.length; i++) S.push(S[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = S[S.length - 1];
    const RMAX = 15;
    const SAG = 0.75;
    let i = 0;
    let s = 0;
    while (s <= total) {
      while (i < pts.length - 1 && S[i + 1] < s) i++;
      const [px, pz, h] = pts[i];
      const dc = Math.hypot(px, pz);
      let r = RMAX;
      if (dc < WORLD_R + 75) {
        let cx = 0;
        let cz = 0;
        for (; r > 2.5; r -= 0.5) {
          cx = px + nrm[i][0] * r;
          cz = pz + nrm[i][1] * r;
          let ok = true;
          for (let j = 0; j < pts.length; j += 1) {
            const q = pts[j];
            if (Math.abs(q[0] - cx) > r || Math.abs(q[1] - cz) > r) continue;
            if (Math.hypot(q[0] - cx, q[1] - cz) < r - 0.6) {
              ok = false;
              break;
            }
          }
          if (ok) break;
        }
        colliders.push({ x: +cx.toFixed(2), z: +cz.toFixed(2), r, h });
      }
      s += Math.max(2.5, 2 * Math.sqrt(2 * r * SAG - SAG * SAG));
    }
    // the mole
    for (let k = 0; k <= 5; k++) {
      const t = (k / 5) * MOLE_LEN;
      colliders.push({ x: +(moleRoot[0] + moleDir[0] * t).toFixed(2), z: +(moleRoot[1] + moleDir[1] * t).toFixed(2), r: k === 5 ? 2.8 : 2.5, h: QUAY_Y + 0.4 });
    }
  }

  // ----- moored boats: a red rowboat by the mole and little fishing boats along the quay -----
  {
    const moor = (bx, bz, ry, hull, trim, L, W, extra) => {
      const g = new THREE.Group();
      g.position.set(bx, 0, bz);
      g.rotation.y = ry;
      g.userData.keep = true;
      g.userData.base = { x: bx, z: bz };
      g.userData.phase = rand2() * 6;
      root.add(g);
      const d = dinghy(hull, trim, L, W, 0.85);
      d.position.y = 0.62;
      g.add(d);
      if (extra) extra(d);
      bake(g);
      anim.boats.push(g);
    };
    // the rowboat, with its oars shipped
    moor(moleRoot[0] + moleDir[0] * 8.5 - side[0] * 3.7, moleRoot[1] + moleDir[1] * 8.5 - side[1] * 3.7, moleRy, 'flagRed', 'white', 4.4, 1.9, (d) => {
      for (const sx of [-0.35, 0.35]) {
        const oar = mesh(d, rbox(0.17, 0.17, 3.6, 0.06), mat('woodDark'), sx, 0.02, -0.1, sx * 0.08);
        oar.rotation.x = 0.04;
      }
    });
    // fishing boats along the quay wall, each with a mast stub and a furled sail
    for (const [ad, hull, trim] of [[222, 'flagBlue', 'white'], [246, 'buoyYellow', 'flagBlue'], [328, 'buoyGreen', 'white']]) {
      const a = ad * DEG;
      const [bx, bz] = bayPt(a, BAY.r - 1.55);
      moor(bx, bz, Math.atan2(-Math.sin(a), Math.cos(a)), hull, trim, 5.0, 2.0, (d) => {
        mesh(d, cyl(0.13, 0.16, 3.4, 8), mat('woodDark'), 0, 1.4, 0.55);
        const furl = mesh(d, cached('furl', () => new THREE.CapsuleGeometry(0.24, 2.0, 3, 8).rotateX(Math.PI / 2)), mat('canvas'), 0, 1.05, -0.45);
        furl.rotation.x = 0.12;
        mesh(d, rbox(0.95, 0.5, 0.75, 0.14), mat('wood'), 0, -0.05, -1.4);
      });
    }
  }

  // ----- buoys: a round float, a lattice-ish tower and a topmark (can, cone or ball) -----
  {
    const floatGeo = cached('buoyFloat', () => lathe([[0, -0.7], [0.8, -0.62], [1.05, -0.2], [1.0, 0.2], [0.7, 0.42], [0, 0.45]], 16));
    const towerGeo = cached('buoyTower', () => lathe([[0.62, 0], [0.5, 0.9], [0.36, 1.7], [0, 1.72]], 12));
    const bandGeo = cached('buoyBand', () => new THREE.TorusGeometry(1.0, 0.17, 6, 18).rotateX(Math.PI / 2));
    for (const [x, z, c, top] of [
      [33, -76, 'buoyRed', 'can'], [43, -80, 'buoyGreen', 'cone'], [-42, -62, 'buoyYellow', 'ball'], [70, -12, 'buoyRed', 'can'],
      [-66, 34, 'buoyGreen', 'cone'], [44, 64, 'buoyYellow', 'ball'], [-6, -22, 'buoyRed', 'can'],
    ]) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.userData.keep = true;
      g.userData.base = { x, z };
      g.userData.phase = rng() * 6;
      root.add(g);
      mesh(g, floatGeo, mat(c), 0, 0, 0);
      mesh(g, bandGeo, mat('white'), 0, 0.05, 0);
      mesh(g, towerGeo, mat(c), 0, 0.4, 0);
      mesh(g, cyl(0.42, 0.42, 0.2, 12), mat('metal'), 0, 2.15, 0);
      if (top === 'can') mesh(g, cyl(0.38, 0.38, 0.7, 12), mat(c), 0, 2.6, 0);
      else if (top === 'cone') mesh(g, cone(0.46, 0.85, 12), mat(c), 0, 2.67, 0);
      else mesh(g, sphere(0.42, 12, 9), mat(c), 0, 2.65, 0);
      bake(g);
      anim.buoys.push(g);
    }
  }

  // ----- seagulls -----
  {
    // one baked body (with beak) and one baked pair of wings shared by every gull;
    // the wings flap by scaling the V shape through flat
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
    const wingsGeo = bake(tmpW).geometry;
    const flocks = [
      { c: [LIGHTHOUSE.x, 30, LIGHTHOUSE.z], r: 11, n: 3 },
      { c: [BAY.x, 31, BAY.z - 30], r: 18, n: 2 },
      { c: [6, 24, 4], r: 30, n: 2 },
      { c: [66, 18, -36], r: 9, n: 1 },
    ];
    for (const f of flocks) {
      for (let k = 0; k < f.n; k++) {
        const g = new THREE.Group();
        g.rotation.order = 'YXZ';
        g.userData.keep = true;
        root.add(g);
        mesh(g, bodyGeo, vcMaterial());
        const wings = mesh(g, wingsGeo, vcMaterial(), 0, 0.2, 0.05);
        g.scale.setScalar(1.3);
        anim.gulls.push({
          g, wings, c: f.c, r: f.r * (0.8 + 0.4 * rng()), w: (0.32 + rng() * 0.15) * (k % 2 ? -1 : 1) * (18 / f.r) ** 0.5,
          ph: rng() * Math.PI * 2, fl: rng() * 10, dy: (rng() - 0.5) * 6,
        });
      }
    }
  }

  mergeStatic(statics);
  // the level is static: no need to recompute matrices for merged parts every frame
  statics.traverse((o) => {
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  });

  // ----- player start and enemy spawns -----
  const playerStart = { x: -30, z: 85, h: Math.PI - 18 * DEG };
  const enemySpawns = computeSpawns(playerStart, colliders);

  function update(t, dt) {
    const amp = palette.waveAmp;
    if (anim.beam) anim.beam.rotation.y = t * 0.75;
    if (anim.rotor) anim.rotor.rotation.z = -t * 0.9;
    for (const gl of anim.glows) {
      if (gl.kind === 'lantern') gl.mat.emissiveIntensity = 0.85 + 0.25 * Math.max(0, Math.cos(t * 1.5));
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
      const h = waveHeight(x, z, t, amp);
      const hx = waveHeight(x + 0.8, z, t, amp) - waveHeight(x - 0.8, z, t, amp);
      const hz = waveHeight(x, z + 0.8, t, amp) - waveHeight(x, z - 0.8, t, amp);
      b.position.y = h - 0.05 + Math.sin(t * 1.9 + ph) * 0.06;
      b.rotation.x = hz * 0.45 + Math.sin(t * 1.3 + ph) * 0.06;
      b.rotation.z = -hx * 0.45 + Math.cos(t * 1.1 + ph) * 0.06;
    }
    for (const b of anim.boats) {
      const { x, z } = b.userData.base;
      const ph = b.userData.phase;
      b.position.y = waveHeight(x, z, t, amp) * 0.85 - 0.05;
      b.rotation.z = Math.sin(t * 1.4 + ph) * 0.05;
      b.rotation.x = Math.sin(t * 1.1 + ph + 1) * 0.03;
    }
    for (const sm of anim.smoke) {
      for (let k = 0; k < sm.puffs.length; k++) {
        const p = (t * 0.22 + sm.ph + k / sm.puffs.length) % 1;
        const m = sm.puffs[k];
        // rise, drift downwind and swell; shrink away at the end of the trail
        m.position.set(p * p * 4.2 + Math.sin(t * 1.3 + k) * 0.15, p * 7.5, p * 1.2);
        const s = Math.max(0.01, (0.45 + p * 1.25) * Math.min(1, (1 - p) * 3.5) * Math.min(1, 0.35 + p * 6));
        m.scale.set(s, s * 0.85, s);
      }
    }
    for (const s of anim.gulls) {
      const a = s.ph + t * s.w;
      const x = s.c[0] + Math.cos(a) * s.r;
      const z = s.c[2] + Math.sin(a) * s.r;
      const y = s.c[1] + s.dy + Math.sin(t * 0.6 + s.ph) * 1.5;
      s.g.position.set(x, y, z);
      const dir = Math.sign(s.w);
      s.g.rotation.y = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir);
      s.g.rotation.z = 0.32 * dir; // bank into the turn
      const glide = 0.5 + 0.5 * Math.sin(t * 0.8 + s.fl);
      s.wings.scale.y = glide > 0.5 ? 0.25 + 1.25 * Math.sin(t * 9 + s.fl) : 0.45 + 0.15 * Math.sin(t * 3 + s.fl);
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
    reefs: [],
    update,
    dispose,
    group: root,
  };
}

// Enemy spawn points: open water 55-95 from the start, clear of every collider by
// r + 12, inside worldRadius - 16, ordered so that any prefix is well spread.
function computeSpawns(start, colliders) {
  const cand = [];
  for (let x = -WORLD_R; x <= WORLD_R; x += 3) {
    for (let z = -WORLD_R; z <= WORLD_R; z += 3) {
      if (Math.hypot(x, z) > WORLD_R - 16) continue;
      const ds = Math.hypot(x - start.x, z - start.z);
      if (ds < 58 || ds > 92) continue;
      let ok = true;
      for (const c of colliders) {
        if (Math.hypot(x - c.x, z - c.z) < c.r + 12) {
          ok = false;
          break;
        }
      }
      if (ok) cand.push({ x, z });
    }
  }
  if (!cand.length) return [];
  const fx = Math.sin(start.h);
  const fz = Math.cos(start.h);
  const target = { x: start.x + fx * 78, z: start.z + fz * 78 };
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
