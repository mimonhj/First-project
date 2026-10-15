import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, setOutline, noOutline, mergeStatic, gradientMap, ensureIndex, INK } from '../style.js';
import { waveHeight } from '../scenery.js';

// Level 5, "Frostbite Straits" (SPEC2 §6.5): a pastel arctic strait at dawn.
//
// Map (north = -z, east = +x; the arena is the disc of radius WORLD_R around 0,0):
// - the strait runs north-south between snowy fjord cliffs (banded violet rock with snow on every
//   ledge and a snow cornice on top, snowy firs, big peaks behind), 80-100 wide inside the arena
//   and opening to the sea beyond both ends. The player starts at the south end, facing north.
// - west shore: a Nordic village on a low snowy shelf in a bight: turf-roofed log houses with
//   smoking chimneys, a stave church with dragon heads on a knoll, fish racks, a rune stone, and a
//   jetty with two dragon longships moored at it (decoration, behind colliders)
// - east shore: an abandoned whaling station on stilts on a rocky point (sheds, try-pots, a whale
//   jawbone arch, a derrick) with its beacon fire still burning; further north a frozen waterfall
//   spills down the cliffs, glowing pale cyan
// - in the strait: static icebergs (normal colliders, so they get shore foam), puffins on rocks,
//   an ice arch across the northern reach, and 8 drifting ice floes (env.reefs entries with
//   ice: true, some carrying seals). step(simTime) moves each floe round a fixed ellipse, a pure
//   function of the simulated time; the floe meshes and their foam rings follow in update().
//   No floe path ever comes within r + 8 of a collider or of the player's start.
// - aurora ribbons over the northern sky and gentle snowfall around the camera

export const meta = {
  name: 'Frostbite Straits',
  subtitle: 'Ice floes, snowy fjords and the longships of the frost raiders.',
};

export const palette = {
  skyTop: 0x5d7fd6,
  skyHorizon: 0xf3e6ff,
  sunColor: 0xffe3f0,
  sunDir: [0.5, 0.25, -0.6],
  sunIntensity: 1.9,
  hemiSky: 0xe9e6ff,
  hemiGround: 0x5a6a9a,
  hemiIntensity: 1.4,
  fogColor: 0xe6ecff,
  fogNear: 90,
  fogFar: 360,
  waterDeep: 0x1d5f9e,
  waterShallow: 0x5fc3e0,
  waterFoam: 0xf4fbff,
  waveAmp: 0.5,
  cloudColor: 0xffffff,
  cloudShade: 0xd8d0f0,
  cloudCount: 12,
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
const WORLD_R = 140;
const TOP = 27.4; // the snow cornice on top of the fjord cliffs
const SHELF_Y = 2.6; // the village shelf and the whaling station's rocky point
const PLAYER_START = { x: 0, z: 94, h: Math.PI }; // the south end of the strait, facing north up it
const WIND = new THREE.Vector3(-0.8, 0, 0.6).normalize(); // smoke and snow drift south-west

// Waterlines. West: south to north (land on the left, west); east: north to south (land on the
// left, east). The village bight and the whaling station's point have a low shelf between the
// waterline and the cliff foot behind it (the *_BACK lines).
const WEST_S = [[-118, 300], [-90, 230], [-70, 180], [-55, 142], [-49, 116], [-48, 90], [-49, 66]];
const WEST_BIGHT = [[-49, 66], [-53, 50], [-55, 34], [-54, 18], [-50, 0]];
const WEST_BACK = [[-49, 66], [-58, 64], [-74, 62], [-86, 50], [-91, 30], [-87, 10], [-75, -3], [-60, -5], [-50, 0]];
const WEST_N = [[-50, 0], [-45, -18], [-42, -40], [-41, -62], [-43, -86], [-47, -108], [-54, -132], [-70, -168], [-94, -230], [-128, -300]];
const EAST_N = [[126, -300], [94, -230], [72, -172], [56, -136], [46, -110], [42, -84], [40, -62], [42, -42], [44, -24], [44, -8], [45, 10]];
const EAST_POINT = [[45, 10], [45, 26], [41, 38], [39, 50], [43, 62], [48, 76]];
const EAST_BACK = [[45, 10], [54, 13], [62, 28], [64, 46], [60, 64], [48, 76]];
const EAST_S = [[48, 76], [50, 92], [50, 112], [57, 140], [70, 178], [90, 230], [116, 300]];
// far inland corners, well beyond the fog
const FAR_W = [[-700, -700], [-700, 700]];
const FAR_E = [[700, 700], [700, -700]];

const JETTY = { x0: -58, x1: -41, z: 28, y: 2.15 }; // the village jetty runs out east into the strait
const CHURCH = { x: -79, z: 30, y: 6.4 }; // the stave church on its knoll
const STATION = { x: 42, z: 46, y: 3.9 }; // centre of the whaling station's deck (seaward edge on stilts)
const FALLS_Z = -31; // the frozen waterfall on the east cliffs
const ARCH = { z: -114, half: 13, y: 14, r: 5.2 }; // the ice arch: two pillars at x = +-half

// Icebergs inside the arena and just beyond it: [x, z, r, h, shape]
const BERGS = [
  [17, -60, 7, 15, 'peak'],
  [-19, 0, 5.2, 9.5, 'block'],
  [23, 26, 4.4, 8.5, 'peak'],
  // beyond the edge (decoration; still colliders so they get shore foam)
  [-26, 172, 8, 15, 'block'],
  [42, 190, 10, 21, 'peak'],
  [4, 222, 6, 11, 'peak'],
  [-30, -178, 9, 22, 'peak'],
  [30, -200, 11, 19, 'block'],
];
// Rocks with puffins on them: [x, z, r, h]
const PUFFIN_ROCKS = [
  [-37, -50, 3, 4.2],
  [40, 72, 3, 3.6],
  [-44, 120, 3.2, 4.6],
];

// Ice floes: x = cx + rx cos(w t + ph), z = cz + rz sin(w t + ph), t = simulated seconds.
// w = +-0.9 / sqrt(rx rz) keeps the drift between 0.6 and 1.2 u/s (rx / rz stays within 1.7).
const FLOE_PATHS = [
  { cx: -22, cz: 64, rx: 8, rz: 6, r: 4.5, ph: 0.4, dir: 1, seal: true },
  { cx: 15, cz: 66, rx: 7, rz: 6, r: 3.5, ph: 2.1, dir: -1 },
  { cx: -6, cz: 30, rx: 9, rz: 7, r: 5, ph: 4.0, dir: 1, seal: true },
  { cx: 26, cz: -6, rx: 6, rz: 8, r: 3.5, ph: 1.2, dir: -1 },
  { cx: -18, cz: -34, rx: 7, rz: 6, r: 4, ph: 5.1, dir: 1 },
  { cx: -9, cz: -80, rx: 9, rz: 6, r: 5.5, ph: 3.3, dir: -1, seal: true },
  { cx: 15, cz: -90, rx: 6, rz: 5, r: 3, ph: 0.9, dir: 1 },
  { cx: 22, cz: 104, rx: 6, rz: 5, r: 4, ph: 2.7, dir: -1 },
];
const FLOES = FLOE_PATHS.map((f) => ({ ...f, w: (f.dir * 0.9) / Math.sqrt(f.rx * f.rz) }));
function floeAt(f, t) {
  const a = f.w * t + f.ph;
  return [f.cx + f.rx * Math.cos(a), f.cz + f.rz * Math.sin(a)];
}

// ---------------------------------------------------------------------------
// Colours (cel-shaded materials from style.js)
// ---------------------------------------------------------------------------
const COL = {
  rockA: 0x575d92, rockB: 0x7f80b9, rockC: 0xa9a3d6, rockD: 0x67679f, shelf: 0x8d89b8,
  snow: 0xf6f8ff, ice: 0xb4ebfb, iceDeep: 0x6cc3ee, mountain: 0x8187bd,
  woodRed: 0xb44a3c, woodBrown: 0x8c5a3c, woodOchre: 0xd8a44c, woodDark: 0x553329, woodPale: 0xb8996f, woodGrey: 0x958d8b,
  turf: 0x79b358, shingle: 0x40302d, stone: 0x9e9bbc, trunk: 0x6b4a3a, fir: 0x2f6e5c,
  window: 0x2b3866, frame: 0xfaf3e6, door: 0x6a3c26, white: 0xfaf6ee, bone: 0xf2e7cf,
  red: 0xd8473a, yellow: 0xf2c23a, blue: 0x2f6db5, gold: 0xffc93c, iron: 0x343a4f, rope: 0xcaa978,
  puffin: 0x27253b, beak: 0xff7a2a, beakTip: 0xffc93c, seal: 0x9295ae, sealPale: 0xc4c6d8, ink: 0x1d1a26, fish: 0xc8cde0,
  oak: 0xb57d45, oakDark: 0x8a5a32, floeIce: 0xa9e3f6,
};

// ---------------------------------------------------------------------------
// Painted detail (as in europe.js): one tiling texture of hand-drawn marks projected in world
// space. R cracks (rock), G wind drifts and sparkle (snow), B streaks and facets (ice),
// A log and plank seams (wooden walls). The marks darken towards a per-material tint, and the
// rock and ice materials turn to snow wherever they face up (every ledge carries snow).
// ---------------------------------------------------------------------------
const PAINT_RES = 512;
const PAINT_TILE = 30; // world units per repeat
let PAINT_TEX = null;
function paintTexture() {
  if (PAINT_TEX) return PAINT_TEX;
  const N = PAINT_RES;
  const ch = [0, 1, 2, 3].map(() => new Float32Array(N * N).fill(1));
  const r = mulberry32(5150);
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
        dab(c, ax + (bx - ax) * t, ay + (by - ay) * t, r0 + (r1 - r0) * ((s + d) / (total || 1)), v);
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
  // G: wind-blown drift lines (long shallow arcs) and a sprinkle of sparkle
  for (let k = 0; k < 46; k++) {
    const x = r() * N;
    const y = r() * N;
    const l = 30 + r() * 60;
    const amp = 2 + r() * 4;
    const ph = r() * 6;
    const pts = [];
    for (let i = 0; i <= 12; i++) pts.push([x + (l * i) / 12, y + Math.sin(ph + (i / 12) * Math.PI * 1.3) * amp]);
    stroke(G, pts, 1.5, 0.5, 0.2);
  }
  for (let k = 0; k < 120; k++) dab(G, r() * N, r() * N, 0.7 + r() * 0.8, 0.45);
  // B: ice: long vertical streaks, and straight facet lines
  for (let k = 0; k < 36; k++) {
    const x = r() * N;
    const y = r() * N;
    const len = 40 + r() * 120;
    const slant = (r() - 0.5) * 0.3;
    stroke(B, [[x, y], [x + slant * len * 0.5, y - len * 0.5], [x + slant * len, y - len]], 2.2, 0.5, 0.1);
  }
  for (let k = 0; k < 16; k++) {
    const x = r() * N;
    const y = r() * N;
    const a = (r() - 0.5) * 1.2 + (r() < 0.5 ? 0.5 : -0.5);
    const l = 26 + r() * 50;
    stroke(B, [[x, y], [x + Math.cos(a) * l, y + Math.sin(a) * l]], 1.2, 1.0, 0.25);
  }
  // A: log seams every course (gently wavy), butt joints and knots
  const COURSES = 60;
  for (let row = 0; row < COURSES; row++) {
    const y0 = (row + 0.5) * (N / COURSES);
    const pts = [];
    for (let x = 0; x <= N + 16; x += 16) pts.push([x, y0 + Math.sin(x * 0.021 + row * 1.7) * 0.9]);
    stroke(A, pts, 1.0, 1.0, 0.05);
    if (r() < 0.55) {
      const jx = r() * N;
      stroke(A, [[jx, y0], [jx + (r() - 0.5) * 2, y0 + N / COURSES]], 0.8, 0.8, 0.25);
    }
    if (r() < 0.45) dab(A, r() * N, y0 + (N / COURSES) * 0.5, 1.5, 0.45);
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

// How strongly each painted material shows each kind of mark on walls (side) and flat ground
// (top): [cracks, drifts, ice streaks, log seams]; the colour the marks darken towards; and
// where it turns to snow (normal.y from snow[0] to snow[1]; snowLine: everything above that
// height that is not a sheer face).
const WOOD = { side: [0, 0, 0, 0.55], top: [0, 0, 0, 0.42], tint: [0.3, 0.2, 0.2] };
const PAINT = {
  rockA: { side: [0.5, 0, 0, 0], top: [0.12, 0, 0, 0], tint: [0.3, 0.26, 0.52], snow: [0.6, 0.68] },
  rockB: { side: [0.44, 0, 0, 0], top: [0.1, 0, 0, 0], tint: [0.34, 0.3, 0.58], snow: [0.6, 0.68] },
  rockC: { side: [0.4, 0, 0, 0], top: [0.1, 0, 0, 0], tint: [0.42, 0.38, 0.66], snow: [0.6, 0.68] },
  rockD: { side: [0.48, 0, 0, 0], top: [0.12, 0, 0, 0], tint: [0.3, 0.26, 0.52], snow: [0.6, 0.68] },
  shelf: { side: [0.34, 0, 0, 0], top: [0.1, 0, 0, 0], tint: [0.36, 0.32, 0.58], snow: [0.5, 0.6] },
  snow: { side: [0, 0.32, 0, 0], top: [0, 0.4, 0, 0], tint: [0.62, 0.68, 0.98] },
  ice: { side: [0, 0, 0.5, 0], top: [0, 0.22, 0.12, 0], tint: [0.42, 0.66, 0.95], snow: [0.72, 0.8] },
  iceDeep: { side: [0, 0, 0.42, 0], top: [0, 0, 0.3, 0], tint: [0.36, 0.56, 0.9] },
  mountain: { side: [0.42, 0, 0, 0], top: [0.08, 0, 0, 0], tint: [0.4, 0.36, 0.62], snow: [0.5, 0.6], snowLine: 54 },
  woodRed: WOOD, woodBrown: WOOD, woodOchre: WOOD, woodDark: WOOD, woodPale: WOOD, woodGrey: WOOD,
};
const PAINT_VERT_PARS = 'varying vec3 vPaintPos;\nvarying vec3 vPaintNrm;\n';
const PAINT_FRAG_PARS = `varying vec3 vPaintPos;
varying vec3 vPaintNrm;
uniform sampler2D uPaint;
uniform vec4 uPaintSide;
uniform vec4 uPaintTop;
uniform vec3 uPaintTint;
uniform vec3 uSnow;
uniform vec3 uSnowCol;
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
    vec3 tint = uPaintTint;
    #ifdef PAINT_SNOW
      float sn = smoothstep(uSnow.x, uSnow.y, pn.y);
      #ifdef PAINT_SNOWLINE
        float line = uSnow.z + 7.0 * sin(vPaintPos.x * 0.045 + vPaintPos.z * 0.031) + 4.0 * sin(vPaintPos.z * 0.11 - vPaintPos.x * 0.07);
        sn = max(sn, step(line, vPaintPos.y) * smoothstep(0.16, 0.24, pn.y));
      #endif
      diffuseColor.rgb = mix(diffuseColor.rgb, uSnowCol, sn);
      ink = mix(ink, (tY.g * bw.y + 0.5 * (tX.g * bw.x + tZ.g * bw.z)) * 0.36, sn);
      tint = mix(tint, vec3(0.62, 0.68, 0.98), sn);
    #endif
    diffuseColor.rgb *= vec3(1.0) - clamp(ink, 0.0, 0.8) * (vec3(1.0) - tint);
  }
`;
function paintedToon(color, p, vertexColors = false) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(3), vertexColors });
  setOutline(m);
  if (p.snow) m.defines = p.snowLine ? { PAINT_SNOW: '', PAINT_SNOWLINE: '' } : { PAINT_SNOW: '' };
  const tex = paintTexture();
  const snow = new THREE.Vector3(p.snow ? p.snow[0] : 2, p.snow ? p.snow[1] : 3, p.snowLine ?? 1e5);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPaint = { value: tex };
    shader.uniforms.uPaintSide = { value: new THREE.Vector4(...p.side) };
    shader.uniforms.uPaintTop = { value: new THREE.Vector4(...p.top) };
    shader.uniforms.uPaintTint = { value: new THREE.Vector3(...p.tint) };
    shader.uniforms.uSnow = { value: snow };
    shader.uniforms.uSnowCol = { value: new THREE.Color(COL.snow) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PAINT_VERT_PARS}`)
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n  vPaintPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vPaintNrm = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PAINT_FRAG_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${PAINT_FRAG}`);
  };
  m.customProgramCacheKey = () => 'frost-painted-toon';
  return m;
}

// Materials are cached for the module's lifetime (like style.js toon()), so a rebuilt level
// reuses them.
const M = {};
const NO_LINE = new Set(['window', 'ink']);
function mat(name) {
  if (!M[name]) {
    M[name] = PAINT[name] ? paintedToon(COL[name], PAINT[name]) : toon(COL[name], NO_LINE.has(name) ? { outline: false } : {});
    FAMILY_BY_MAT.set(M[name], FAMILY_OF[name] ?? 'toon');
  }
  return M[name];
}

// The static parts are baked per "family" into vertex-coloured meshes: every plain cartoon colour
// shares one material, every wood colour one painted material (log seams), every rock colour one
// painted material (cracks, snow on the ledges), and so on. The whole level then costs a couple of
// draw calls per family instead of two per colour (see bakeFamilies).
const FAMILY_OF = {
  rockA: 'rock', rockB: 'rock', rockC: 'rock', rockD: 'rock', shelf: 'rock',
  woodRed: 'wood', woodBrown: 'wood', woodOchre: 'wood', woodDark: 'wood', woodPale: 'wood', woodGrey: 'wood',
  ice: 'ice', iceDeep: 'ice', snow: 'snow', mountain: 'mountain', window: 'flat', ink: 'flat',
};
const FAMILY_PAINT = {
  rock: { side: [0.46, 0, 0, 0], top: [0.11, 0, 0, 0], tint: [0.34, 0.3, 0.58], snow: [0.6, 0.68] },
  wood: WOOD,
  ice: PAINT.ice,
  snow: PAINT.snow,
  mountain: PAINT.mountain,
};
const FAMILY_BY_MAT = new Map(); // material from mat() -> its family
const FAM = {};
function familyMaterial(f) {
  if (!FAM[f]) {
    if (f === 'toon') FAM[f] = vcMaterial();
    else if (f === 'flat') {
      FAM[f] = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(3) });
      noOutline(FAM[f]);
    } else FAM[f] = paintedToon(0xffffff, FAMILY_PAINT[f], true);
  }
  return FAM[f];
}
// Bake every static mesh under `root` whose material belongs to a family (and is not under a
// `keep` node) into one vertex-coloured mesh per family.
function bakeFamilies(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  const victims = [];
  root.traverse((o) => {
    if (o === root || !o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    for (let p = o; p && p !== root; p = p.parent) if (p.userData.keep) return;
    const fam = FAMILY_BY_MAT.get(o.material);
    if (!fam) return;
    const src = o.geometry;
    const g = src.index && !src.attributes.normal ? src.toNonIndexed() : new THREE.BufferGeometry().copy(src);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    for (const k of Object.keys(g.morphAttributes)) delete g.morphAttributes[k];
    if (!g.attributes.normal) g.computeVertexNormals();
    ensureIndex(g);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const c = o.material.color;
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!groups.has(fam)) groups.set(fam, []);
    groups.get(fam).push(g);
    victims.push(o);
  });
  for (const v of victims) v.parent.remove(v);
  for (const [fam, geos] of groups) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const m = new THREE.Mesh(merged, familyMaterial(fam));
    m.name = `frost-${fam}`;
    m.userData.keep = true; // (so mergeStatic leaves it be)
    root.add(m);
  }
}
const LIT = () => toon(0xffe2a0, { emissive: 0xffb347, emissiveIntensity: 0.8, outline: false });
const ICEFALL = () => toon(0xc8f6ff, { emissive: 0x58d6ff, emissiveIntensity: 0.32 });

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
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const linear = (hex) => new THREE.Color(hex);

function mesh(parent, geo, material, x = 0, y = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  parent.add(m);
  return m;
}
function group(parent, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  parent.add(g);
  return g;
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
const sphere = (r, ws = 16, hs = 12) => cached(`sp${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
const cyl = (rt, rb, h, seg = 14) => cached(`cy${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const cone = (r, h, seg = 14) => cached(`co${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg));
const capsule = (r, l, seg = 12) => cached(`ca${r},${l},${seg}`, () => new THREE.CapsuleGeometry(r, l, 4, seg));
// a 4-sided pyramid (or frustum) with its faces square to the axes
const pyramid = (top, h = 1) => cached(`py${top},${h}`, () => new THREE.CylinderGeometry(top, 1, h, 4).rotateY(Math.PI / 4));

// Weld vertices and recompute smooth normals: rounded shapes then get clean ink outlines.
function smooth(g) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  const w = mergeVertices(g, 1e-3);
  w.computeVertexNormals();
  return w;
}
// Lathe around the y axis from [radius, y] pairs.
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
// Wobble a coastline sideways (fades out near its ends so joints stay put).
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
// One rounded "pancake" layer of land: the polygon extruded from y0 to y1 with a soft bevel that
// bulges out by `bevel` beyond the polygon.
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
// Stacked strata: layers [{y0, y1, inset, bevel, mat, wob}] relative to the polygon (the visible
// waterline); each layer's widest bulge sits `inset` inside it.
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

// Shared vertex-coloured toon material: an animated prop collapses into one mesh (one draw call
// plus its outline) instead of one per colour.
let VC_MAT = null;
function vcMaterial() {
  if (!VC_MAT) {
    VC_MAT = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(3) });
    setOutline(VC_MAT);
  }
  return VC_MAT;
}
function bake(grp) {
  grp.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(grp.matrixWorld).invert();
  const geos = [];
  const victims = [];
  grp.traverse((o) => {
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
  for (const c of [...grp.children]) if (!c.isMesh && c.children.length === 0) grp.remove(c);
  const m = new THREE.Mesh(mergeGeometries(geos, false), vcMaterial());
  for (const g of geos) g.dispose();
  grp.add(m);
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
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const curvePts = (ctrl, n = 16) => new THREE.CatmullRomCurve3(ctrl).getSpacedPoints(n);

// A flat disc or sheet whose vertex alpha fades out from the middle (glows, foam): `alphaAt`
// maps a vertex (x, y in the geometry's plane) to its alpha.
function fadeColors(geo, hex, alphaAt) {
  const c = linear(hex);
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) col.set([c.r, c.g, c.b, alphaAt(p.getX(i), p.getY(i))], i * 4);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  return geo;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
// A snowy spruce: four tiers of dark needles, each with a cap of snow.
const FIR_TIERS = [
  [0.9, 1.75, 2.4],
  [2.25, 1.38, 2.1],
  [3.4, 1.0, 1.8],
  [4.4, 0.62, 1.5],
];
function fir(parent, x, y, z, s, ry = 0) {
  const g = group(parent, x, y, z, ry);
  g.scale.setScalar(s);
  mesh(g, cyl(0.2, 0.28, 1.4, 7), mat('trunk'), 0, 0.5, 0);
  for (const [y0, r, h] of FIR_TIERS) {
    mesh(g, cone(r, h, 9), mat('fir'), 0, y0 + h / 2, 0);
    // the cap covers the top 60% of the tier and overhangs it a little
    mesh(g, cone(r * 0.7, h * 0.64, 9), mat('snow'), 0, y0 + h * 0.4 + (h * 0.64) / 2 + 0.06, 0);
  }
  return g;
}
function snowMound(parent, x, y, z, sx, sy, sz, ry = 0) {
  const m = mesh(parent, sphere(1, 14, 8), mat('snow'), x, y, z, ry);
  m.scale.set(sx, sy, sz);
  return m;
}
function icicles(parent, x, y, z, ry, w, n, rand, len = 1.6) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  for (let i = 0; i < n; i++) {
    const u = (n === 1 ? 0 : i / (n - 1) - 0.5) * w;
    const l = len * (0.5 + rand() * 0.7);
    const m = mesh(parent, cone(0.22, 1, 6), mat('ice'), x + c * u, y - l / 2, z - s * u);
    m.rotation.x = Math.PI;
    m.scale.set(0.8 + rand() * 0.5, l, 0.8 + rand() * 0.5);
  }
}

// Roof panels of a gable roof whose ridge runs along local z: `material` panels of thickness t,
// with a layer of snow on top (thinner, so a rim of the roof shows round it).
function gableRoof(g, w, d, h, rh, ov, material, snow = true, t = 0.42, sag = 0) {
  const a = w / 2 + ov;
  const pitch = Math.atan2(rh, w / 2);
  const L = a / Math.cos(pitch);
  for (const s of [-1, 1]) {
    const nx = s * Math.sin(pitch);
    const ny = Math.cos(pitch);
    const cx = s * (a / 2);
    const cy = h + rh - (a / 2) * Math.tan(pitch);
    const p = mesh(g, rbox(L + 0.1, t, d + 2 * ov, Math.min(0.16, t / 2 - 0.02)), material, cx + (nx * t) / 2, cy + (ny * t) / 2, 0);
    p.rotation.z = -s * pitch + (s > 0 ? sag : 0);
    if (snow) {
      const q = mesh(g, rbox(L - 0.35, 0.3, d + 2 * ov - 0.5, 0.13), mat('snow'), cx + nx * (t + 0.1), cy + ny * (t + 0.1), 0);
      q.rotation.z = p.rotation.z;
    }
  }
}
// The triangular gable ends between the walls and the roof.
function gableEnds(g, w, d, h, rh, material) {
  const geo = cached(`gab${w},${d},${rh}`, () => {
    const sh = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rh)]);
    const e = new THREE.ExtrudeGeometry(sh, { depth: d - 0.1, bevelEnabled: false });
    e.translate(0, 0, -(d - 0.1) / 2);
    return e;
  });
  mesh(g, geo, material, 0, h - 0.02, 0);
}

// A Nordic log house: painted log walls, a turf roof under snow, lit windows, a door on the
// gable end facing local +z. Returns the chimney top (world) or null.
function house(parent, x, y, z, ry, o) {
  const g = group(parent, x, y, z, ry);
  const { w, d, h, rh } = o;
  const wall = mat(o.wall);
  mesh(g, rbox(w, h, d, 0.16), wall, 0, h / 2, 0);
  gableEnds(g, w, d, h, rh, wall);
  // dark corner posts where the logs cross
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(g, rbox(0.42, h + 0.1, 0.42, 0.12), mat('woodDark'), (cx * w) / 2, h / 2, (cz * d) / 2);
  gableRoof(g, w, d, h, rh, 0.55, mat(o.roof ?? 'turf'), true, 0.46, o.sag ?? 0);
  // door with a frame on the gable end, a lantern of light over it
  mesh(g, rbox(1.3, 2.05, 0.2, 0.08), mat('frame'), 0, 1.02, d / 2 + 0.04);
  mesh(g, rbox(1.0, 1.8, 0.2, 0.08), mat('door'), 0, 0.95, d / 2 + 0.1);
  // windows on both long walls
  const nW = o.windows ?? 2;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < nW; i++) {
      const wz = nW === 1 ? 0 : (i / (nW - 1) - 0.5) * (d * 0.55);
      mesh(g, rbox(0.16, 1.0, 1.05, 0.06), mat('frame'), sx * (w / 2 + 0.03), h * 0.56, wz);
      mesh(g, rbox(0.16, 0.74, 0.8, 0.05), o.dark ? mat('window') : LIT(), sx * (w / 2 + 0.07), h * 0.56, wz);
    }
  }
  if (o.gableWindow) {
    mesh(g, rbox(0.8, 0.8, 0.16, 0.06), mat('frame'), 0, h + rh * 0.38, d / 2 + 0.02);
    mesh(g, rbox(0.58, 0.58, 0.16, 0.05), o.dark ? mat('window') : LIT(), 0, h + rh * 0.38, d / 2 + 0.06);
  }
  let top = null;
  if (o.chimney) {
    const cx = o.chimney * w * 0.22;
    const cz = -d * 0.22;
    const cy = h + rh * (1 - Math.abs(cx) / (w / 2)) + 0.5;
    mesh(g, rbox(0.8, 2.0, 0.8, 0.12), mat('stone'), cx, cy, cz);
    mesh(g, rbox(1.0, 0.25, 1.0, 0.08), mat('snow'), cx, cy + 1.05, cz);
    top = new THREE.Vector3(cx, cy + 1.3, cz);
    g.updateMatrixWorld(true);
    top.applyMatrix4(g.matrixWorld);
  }
  return top;
}

// The stave church: a tarred timber church of stacked steep shingle roofs, dragon heads on the
// gables, a skirt roof round the base and a spire. Its door faces local +z.
function staveChurch(parent, x, y, z, ry, rand) {
  const g = group(parent, x, y, z, ry);
  const dark = mat('woodDark');
  const sh = mat('shingle');
  mesh(g, rbox(9.6, 2.8, 12.6, 0.3), mat('stone'), 0, -0.9, 0);
  // ambulatory walls and their skirt roof
  mesh(g, rbox(8.4, 2.4, 11.4, 0.15), dark, 0, 1.6, 0);
  const skirt = mesh(g, pyramid(0.6, 1), sh, 0, 3.45, 0);
  skirt.scale.set(9.6 / 1.414, 1.3, 12.6 / 1.414);
  // the nave and its steep roof
  mesh(g, rbox(6, 4.0, 9, 0.15), dark, 0, 4.6, 0);
  gableEnds(g, 6, 9, 6.6, 4.2, dark);
  gableRoof(g, 6, 9, 6.6, 4.2, 0.45, sh, false, 0.4);
  // snow along the lower edges of the roofs
  for (const s of [-1, 1]) {
    const q = mesh(g, rbox(1.2, 0.28, 9.6, 0.12), mat('snow'), s * 3.0, 7.0, 0);
    q.rotation.z = -s * Math.atan2(4.2, 3);
  }
  const ring = mesh(g, pyramid(0.86, 1), mat('snow'), 0, 3.2, 0);
  ring.scale.set(9.9 / 1.414, 0.5, 12.9 / 1.414);
  // dragon heads rearing from both gable peaks
  for (const s of [-1, 1]) {
    const zz = s * 4.75;
    const pts = curvePts([V3(0, 10.4, zz), V3(0, 11.2, zz + s * 0.3), V3(0, 11.7, zz + s * 0.85), V3(0, 11.65, zz + s * 1.45)], 10);
    mesh(g, tubeAlong(pts, (t) => 0.22 - 0.06 * t, 8), dark);
    const head = mesh(g, sphere(0.3, 12, 8), dark, 0, 11.62, zz + s * 1.6);
    head.scale.set(0.8, 0.75, 1.45);
    mesh(g, sphere(0.09, 8, 6), mat('red'), 0.18, 11.75, zz + s * 1.66);
    mesh(g, sphere(0.09, 8, 6), mat('red'), -0.18, 11.75, zz + s * 1.66);
    const horn = mesh(g, cone(0.08, 0.5, 6), dark, 0, 12.0, zz + s * 1.35);
    horn.rotation.x = -s * 0.7;
    const tongue = mesh(g, cone(0.07, 0.6, 5), mat('red'), 0, 11.48, zz + s * 2.0);
    tongue.rotation.x = s * 1.9;
  }
  // a little roof turret with its own skirt, and the spire
  mesh(g, rbox(3.2, 2.4, 3.2, 0.12), dark, 0, 11.4, 0);
  const t1 = mesh(g, pyramid(0.55, 1), sh, 0, 13.0, 0);
  t1.scale.set(4.6 / 1.414, 1.1, 4.6 / 1.414);
  const t1s = mesh(g, pyramid(0.8, 1), mat('snow'), 0, 12.65, 0);
  t1s.scale.set(4.8 / 1.414, 0.4, 4.8 / 1.414);
  mesh(g, rbox(2.0, 1.8, 2.0, 0.1), dark, 0, 14.3, 0);
  const sp = mesh(g, cone(1.75, 6.6, 4), sh, 0, 18.4, 0);
  sp.rotation.y = Math.PI / 4;
  mesh(g, sphere(0.28, 10, 8), mat('gold'), 0, 21.85, 0);
  mesh(g, rbox(0.14, 1.1, 0.14, 0.05), mat('gold'), 0, 22.6, 0);
  mesh(g, rbox(0.7, 0.14, 0.14, 0.05), mat('gold'), 0, 22.75, 0);
  // little dragon heads on the corners of the skirt
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const hx = cx * 4.6;
    const hz = cz * 6.1;
    const hd = mesh(g, sphere(0.22, 10, 7), dark, hx, 3.2, hz);
    hd.scale.set(1.2, 0.8, 1.2);
  }
  // the door under a round-topped porch, and two small lit windows
  mesh(g, rbox(2.0, 2.8, 1.4, 0.15), dark, 0, 1.4, 6.2);
  const pr = mesh(g, pyramid(0.05, 1), sh, 0, 3.2, 6.25);
  pr.scale.set(1.9, 1.1, 1.3);
  mesh(g, rbox(1.1, 1.9, 0.2, 0.3), mat('door'), 0, 1.1, 6.9);
  for (const s of [-1, 1]) {
    mesh(g, rbox(0.16, 0.7, 0.5, 0.05), LIT(), s * 3.05, 5.2, -1.5);
    mesh(g, rbox(0.16, 0.7, 0.5, 0.05), LIT(), s * 3.05, 5.2, 1.8);
  }
  // a rune stone and two snowy firs by the churchyard
  const rs = mesh(g, rbox(1.3, 2.4, 0.5, 0.25), mat('stone'), -5.6, 1.2, 6.4, 0.3);
  rs.rotation.z = 0.06;
  for (let i = 0; i < 3; i++) mesh(g, rbox(0.1, 0.5, 0.06, 0.02), mat('red'), -5.6 + (i - 1) * 0.3, 1.5 + (i % 2) * 0.35, 6.67, 0.3);
  fir(g, 6.2, 0, -4.0, 1.1, rand() * 6);
  fir(g, -6.0, 0, -5.2, 0.95, rand() * 6);
}

// A dragon longship (bow +z), assembled from parts and baked into one vertex-coloured mesh.
function longHullGeo(L, W, D, sheerMid, sheerEnd) {
  const n = 30;
  const m = 5;
  const ring = 4 * m + 2;
  const pos = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const s = Math.sin(Math.PI * u);
    const hw = W * Math.pow(s, 0.55);
    const dep = D * Math.pow(s, 0.4);
    const e = Math.abs(2 * u - 1);
    const sheer = sheerMid + (sheerEnd - sheerMid) * Math.pow(e, 2.8);
    const z = (u - 0.5) * L;
    for (let j = 0; j <= 2 * m; j++) {
      const a = (j / m - 1) * (Math.PI / 2);
      pos.push(Math.sin(a) * hw, -dep * Math.cos(a) + sheer * (1 - Math.cos(a)), z);
    }
    const hi = Math.max(0, hw - 0.14);
    const floor = Math.min(0.3, sheer - 0.1);
    for (let j = 2 * m; j >= 0; j--) {
      const a = (j / m - 1) * (Math.PI / 2);
      pos.push(Math.sin(a) * hi, floor * Math.cos(a) + (sheer - 0.08) * (1 - Math.cos(a)), z);
    }
  }
  const idx = [];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < ring; k++) {
      const a = i * ring + k;
      const b = i * ring + ((k + 1) % ring);
      const c = (i + 1) * ring + k;
      const d = (i + 1) * ring + ((k + 1) % ring);
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return smooth(g);
}
function longship(parent, x, z, ry, look) {
  const g = group(parent, x, 0, z, ry);
  const L = 12;
  const W = 1.45;
  const sheerEnd = 2.2;
  const sheerAt = (u) => 0.75 + (sheerEnd - 0.75) * Math.pow(Math.abs(2 * u - 1), 2.8);
  const hwAt = (u) => W * Math.pow(Math.sin(Math.PI * u), 0.55);
  mesh(g, cached('longhull', () => longHullGeo(L, W, 1.0, 0.75, sheerEnd)), mat('oak'));
  // a painted strake along each gunwale
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const u = 0.06 + (0.88 * i) / 24;
      pts.push(V3(s * (hwAt(u) + 0.02), sheerAt(u) - 0.16, (u - 0.5) * L));
    }
    mesh(g, tubeAlong(pts, () => 0.13, 6), mat(look.band));
  }
  // rowing benches
  for (let i = 0; i < 5; i++) {
    const u = 0.3 + i * 0.1;
    mesh(g, rbox(hwAt(u) * 1.7, 0.12, 0.34, 0.05), mat('oakDark'), 0, 0.55, (u - 0.5) * L);
  }
  // shields along both sides
  const cols = look.shields;
  let k = 0;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const u = 0.24 + i * 0.087;
      const sx = s * (hwAt(u) + 0.08);
      const sy = sheerAt(u) - 0.3;
      const sz = (u - 0.5) * L;
      const d = mesh(g, cyl(0.4, 0.4, 0.08, 14), mat(cols[k++ % cols.length]), sx, sy, sz);
      d.rotation.z = Math.PI / 2;
      mesh(g, sphere(0.1, 8, 6), mat('iron'), sx + s * 0.06, sy, sz);
    }
  }
  // the dragon at the bow, a curled tail at the stern
  const bz = L / 2;
  const neck = curvePts([V3(0, sheerEnd - 0.5, bz - 0.3), V3(0, sheerEnd + 0.2, bz + 0.02), V3(0, sheerEnd + 0.95, bz + 0.12), V3(0, sheerEnd + 1.55, bz - 0.02), V3(0, sheerEnd + 1.85, bz + 0.3)], 14);
  mesh(g, tubeAlong(neck, (t) => 0.2 - 0.07 * t, 8), mat(look.band));
  const head = mesh(g, sphere(0.3, 12, 8), mat(look.band), 0, sheerEnd + 1.92, bz + 0.5);
  head.scale.set(0.8, 0.78, 1.5);
  for (const s of [-1, 1]) {
    mesh(g, sphere(0.08, 8, 6), mat('yellow'), s * 0.19, sheerEnd + 2.02, bz + 0.62);
    const horn = mesh(g, cone(0.07, 0.42, 6), mat('white'), s * 0.12, sheerEnd + 2.22, bz + 0.25);
    horn.rotation.x = -0.9;
  }
  const tongue = mesh(g, cone(0.06, 0.5, 5), mat('red'), 0, sheerEnd + 1.78, bz + 0.98);
  tongue.rotation.x = 1.9;
  const tail = curvePts([V3(0, sheerEnd - 0.5, -bz + 0.3), V3(0, sheerEnd + 0.3, -bz - 0.02), V3(0, sheerEnd + 1.1, -bz - 0.08), V3(0, sheerEnd + 1.55, -bz + 0.22), V3(0, sheerEnd + 1.38, -bz + 0.58), V3(0, sheerEnd + 1.06, -bz + 0.5)], 16);
  mesh(g, tubeAlong(tail, (t) => 0.19 - 0.11 * t, 8), mat(look.band));
  // mast, yard and the furled striped sail
  mesh(g, cyl(0.1, 0.13, 6.4, 8), mat('oakDark'), 0, 3.4, 0.4);
  const yard = mesh(g, cyl(0.07, 0.07, 5.2, 6), mat('oakDark'), 0, 5.9, 0.4);
  yard.rotation.z = Math.PI / 2;
  for (let i = 0; i < 5; i++) {
    const c = mesh(g, capsule(0.36, 0.62, 10), mat(i % 2 ? 'white' : look.sail), -1.96 + i * 0.98, 5.55, 0.4);
    c.rotation.z = Math.PI / 2;
  }
  for (const zz of [bz - 0.6, -bz + 0.6]) {
    const pts = [V3(0, 6.5, 0.4), V3(0, sheerEnd + 0.2, zz)];
    mesh(g, tubeAlong(pts, () => 0.035, 4), mat('rope'));
  }
  const baked = bake(g);
  g.userData.base = { x, z, ph: x * 0.37 + z * 0.11 };
  return { g, baked };
}

// A puffin standing on a rock, facing local +z.
function puffin(parent, x, y, z, ry, s) {
  const g = group(parent, x, y, z, ry);
  g.scale.setScalar(s);
  const body = mesh(g, sphere(0.32, 12, 9), mat('puffin'), 0, 0.46, -0.02);
  body.scale.set(1, 1.35, 0.95);
  const belly = mesh(g, sphere(0.27, 12, 9), mat('white'), 0, 0.42, 0.1);
  belly.scale.set(0.88, 1.2, 0.72);
  mesh(g, sphere(0.25, 12, 9), mat('puffin'), 0, 0.92, 0.03);
  const face = mesh(g, sphere(0.2, 12, 8), mat('white'), 0, 0.9, 0.1);
  face.scale.set(1.18, 0.92, 0.95);
  const beak = mesh(g, cone(0.13, 0.32, 4), mat('beak'), 0, 0.87, 0.36);
  beak.rotation.x = Math.PI / 2;
  beak.scale.set(0.55, 1, 1.25);
  mesh(g, sphere(0.05, 6, 5), mat('ink'), 0.1, 0.96, 0.25);
  mesh(g, sphere(0.05, 6, 5), mat('ink'), -0.1, 0.96, 0.25);
  for (const sx of [-1, 1]) {
    const wing = mesh(g, sphere(0.2, 10, 7), mat('puffin'), sx * 0.27, 0.5, -0.04);
    wing.scale.set(0.35, 1.1, 0.8);
    const foot = mesh(g, sphere(0.09, 8, 6), mat('beak'), sx * 0.11, 0.04, 0.08);
    foot.scale.set(1, 0.4, 1.5);
  }
  return g;
}

// A seal lying on a floe, head raised, facing local +z.
function seal(parent, x, y, z, ry, s) {
  const g = group(parent, x, y, z, ry);
  g.scale.setScalar(s);
  const body = mesh(g, capsule(0.5, 1.5, 12), mat('seal'), 0, 0.48, 0);
  body.rotation.x = Math.PI / 2 - 0.12;
  const belly = mesh(g, capsule(0.42, 1.2, 10), mat('sealPale'), 0, 0.34, 0.1);
  belly.rotation.x = Math.PI / 2 - 0.12;
  mesh(g, sphere(0.44, 12, 9), mat('seal'), 0, 1.05, 1.05);
  const muz = mesh(g, sphere(0.25, 10, 8), mat('sealPale'), 0, 0.95, 1.4);
  muz.scale.set(1.15, 0.85, 0.9);
  mesh(g, sphere(0.07, 6, 5), mat('ink'), 0, 1.03, 1.62);
  mesh(g, sphere(0.07, 6, 5), mat('ink'), 0.17, 1.16, 1.36);
  mesh(g, sphere(0.07, 6, 5), mat('ink'), -0.17, 1.16, 1.36);
  for (const sx of [-1, 1]) {
    const fl = mesh(g, sphere(0.24, 10, 7), mat('seal'), sx * 0.5, 0.2, 0.55);
    fl.scale.set(0.5, 0.3, 1.1);
    fl.rotation.y = sx * 0.5;
    const tf = mesh(g, sphere(0.22, 10, 7), mat('seal'), sx * 0.22, 0.3, -1.25);
    tf.scale.set(0.45, 0.28, 1.0);
    tf.rotation.y = sx * 0.6;
  }
  for (const [sx, sz] of [[0.2, 0.2], [-0.15, -0.3], [0.05, -0.6]]) {
    const sp = mesh(g, sphere(0.09, 6, 5), mat('sealPale'), sx, 0.94 - sz * 0.1, sz);
    sp.scale.set(1, 0.4, 1);
  }
  return g;
}

// A rock pile in the water (snow settles on its tops by itself, see PAINT).
function rockPile(parent, x, z, r, h, rand) {
  const parts = [
    [0, 0, 0.85, h * 0.32, h * 0.72, 'rockA'],
    [rand() * 6, 0.52, 0.55, h * 0.1, h * 0.5, 'rockB'],
    [rand() * 6, 0.55, 0.42, 0.0, h * 0.34, 'rockD'],
  ];
  for (const [a, off, sc, cy, sy, m] of parts) {
    const b = mesh(parent, sphere(1, 14, 10), mat(m), x + Math.cos(a) * r * off, cy, z + Math.sin(a) * r * off, rand() * 3);
    b.scale.set(r * sc * 1.05, sy, r * sc * 0.95);
  }
  return h * 0.32 + h * 0.72 * 0.98; // top of the main rock
}

// Icebergs are lathed "rings" of faceted ice: each ring is a closed outline with sharp facets
// (triangle waves) that twist a little with height, leaning over as it rises. The body is ice
// (its gentle slopes turn to snow, see PAINT.ice), a separate snow cap with a dripping lower edge
// sits on top and a band of deep blue ice marks the waterline.
const BERG_PEAK = [[-0.25, 1.0], [0.04, 1.04], [0.22, 0.98], [0.42, 0.85], [0.6, 0.66], [0.76, 0.45], [0.9, 0.24], [1.0, 0.06]];
const BERG_BLOCK = [[-0.25, 1.0], [0.04, 1.03], [0.45, 0.97], [0.66, 0.9], [0.8, 0.72], [0.9, 0.48], [1.0, 0.12]];
const BERG_COLUMN = [[-0.2, 1.0], [0.04, 1.05], [0.3, 0.95], [0.6, 0.86], [0.85, 0.78], [0.95, 0.62], [1.0, 0.3]];
function bergGeo(r, h, seed, o = {}) {
  const prof = o.prof ?? BERG_PEAK;
  const u0 = o.u0 ?? prof[0][0];
  const u1 = o.u1 ?? 1;
  const k0 = o.scale ?? 1;
  const lean = o.lean ?? [0, 0];
  const rnd = mulberry32(seed);
  const p1 = rnd() * 6;
  const p2 = rnd() * 6;
  const p3 = rnd() * 6;
  const tri = (v) => (2 / Math.PI) * Math.asin(Math.sin(v));
  const kAt = (u) => {
    if (u <= prof[0][0]) return prof[0][1];
    for (let i = 1; i < prof.length; i++) {
      if (u <= prof[i][0]) {
        const [ua, ka] = prof[i - 1];
        const [ub, kb] = prof[i];
        return ka + ((kb - ka) * (u - ua)) / (ub - ua);
      }
    }
    return prof[prof.length - 1][1];
  };
  const n = 35;
  const rings = o.rings ?? 8;
  const pos = [];
  for (let j = 0; j <= rings; j++) {
    const u = u0 + ((u1 - u0) * j) / rings;
    const y = u * h;
    const k = kAt(u) * r * k0;
    const lu = Math.pow(Math.max(0, u), 1.5);
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2;
      const f = 1 + 0.2 * tri(5 * th + p1 + u * 0.9) + 0.07 * Math.sin(2 * th + p2) + 0.04 * tri(9 * th + p3 - u * 1.5);
      const drip = j === 0 && o.drip ? o.drip * (0.55 + 0.45 * Math.sin(7 * th + p3)) * (0.6 + 0.4 * Math.sin(3 * th + p1)) : 0;
      pos.push(lean[0] * lu + Math.cos(th) * k * f, y - drip, lean[1] * lu + Math.sin(th) * k * f);
    }
  }
  const idx = [];
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * n + i;
      const b = j * n + ((i + 1) % n);
      const c = (j + 1) * n + i;
      const d = (j + 1) * n + ((i + 1) % n);
      idx.push(a, c, b, b, c, d);
    }
  }
  if (u1 >= 1) {
    const apex = pos.length / 3;
    pos.push(lean[0], h + r * 0.04, lean[1]);
    for (let i = 0; i < n; i++) idx.push(rings * n + i, apex, rings * n + ((i + 1) % n));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // the winding must give outward normals
  const nx = g.attributes.normal.getX(n * 2);
  if (nx * pos[n * 2 * 3] < 0) {
    for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    g.setIndex(idx);
  }
  return smooth(g);
}
// An iceberg of one to three lumps. Returns its collider radius (the widest point of the
// waterline).
function iceberg(parent, x, z, r, h, seed, rand, prof = BERG_PEAK) {
  const ph = seed * 1.7;
  const lumps = [[0, 0, r, h, prof, seed]];
  if (r >= 5) lumps.push([Math.cos(ph) * r * 0.5, Math.sin(ph) * r * 0.5, r * 0.62, h * 0.62, BERG_PEAK, seed + 50]);
  if (r >= 8) lumps.push([Math.cos(ph + 2.4) * r * 0.45, Math.sin(ph + 2.4) * r * 0.45, r * 0.5, h * 0.48, BERG_PEAK, seed + 90]);
  let rc = 0;
  for (const [dx, dz, lr, lh, lp, ls] of lumps) {
    const lean = [Math.cos(ph * 3 + ls) * lr * 0.25, Math.sin(ph * 3 + ls) * lr * 0.25];
    const ry = rand() * 6;
    mesh(parent, bergGeo(lr, lh, ls, { prof: lp, lean, u1: 1 }), mat('ice'), x + dx, 0, z + dz, ry);
    mesh(parent, bergGeo(lr, lh, ls, { prof: lp, lean, u0: 0.64, scale: 1.05, drip: lh * 0.07 }), mat('snow'), x + dx, 0.05, z + dz, ry);
    mesh(parent, bergGeo(lr, lh, ls, { prof: lp, lean, u1: 0.12, scale: 1.03 }), mat('iceDeep'), x + dx, 0, z + dz, ry);
    rc = Math.max(rc, Math.hypot(dx, dz) + lr * 1.04 * 1.31);
  }
  return Math.min(rc, r * 1.5);
}

// A far mountain: a lathed peak with ragged ridges, painted with a snowline (PAINT.mountain).
function peakGeometry(seed) {
  const r = mulberry32(seed);
  const prof = [[0, 1], [0.05, 0.94], [0.14, 0.8], [0.27, 0.62], [0.44, 0.42], [0.64, 0.22], [0.86, 0.06], [1.0, -0.02], [1.04, -0.12]];
  const g = lathe(prof, 22);
  const a = r() * 6;
  const b = r() * 6;
  const c = r() * 6;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const th = Math.atan2(z, x);
    const ridge = 1 - Math.abs(Math.sin(2.5 * th + b)); // sharp ridges between the faces
    const k = 1 + 0.2 * Math.sin(3 * th + a) + 0.16 * (ridge - 0.5) + 0.06 * Math.sin(9 * th + c) * (1 - y);
    p.setXYZ(i, x * k, y + 0.05 * Math.sin(4 * th + c) * Math.min(1, y * 3) * (1 - y), z * k);
  }
  return smooth(g);
}

// ---------------------------------------------------------------------------
// Smoke (chimneys, the beacon): instanced puffs with an inverted-hull ink line (as in volcano.js)
// ---------------------------------------------------------------------------
function puffStream(list, rand, o) {
  for (let i = 0; i < o.n; i++) {
    list.push({ ...o, phase: (i + rand() * 0.6) / o.n, seed: rand() * 100, k: 0.78 + rand() * 0.44, spin: (rand() - 0.5) * 0.5 });
  }
}
function puffGeometry(push = 0) {
  const lobes = [
    [0, 0, 0, 1],
    [0.72, 0.14, 0.22, 0.68],
    [-0.64, 0.2, -0.3, 0.66],
    [-0.05, 0.5, 0.6, 0.6],
  ];
  const geos = lobes.map(([x, y, z, r]) => {
    const g = new THREE.SphereGeometry(r + push * r, 10, 7);
    g.deleteAttribute('uv');
    g.translate(x, y - 0.1, z);
    return g;
  });
  const g = mergeGeometries(geos, false);
  for (const x of geos) x.dispose();
  return g;
}
function buildSmoke(puffs, ownMaterials) {
  const geo = puffGeometry(0);
  const hullGeo = puffGeometry(0.075);
  const sm = new THREE.MeshToonMaterial({ color: 0xffffff, emissive: 0x2a2848, gradientMap: gradientMap(3) });
  noOutline(sm);
  const hullMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(INK[0], INK[1], INK[2]), side: THREE.BackSide });
  noOutline(hullMat);
  // a puff the camera comes close to shrinks away (its ink hull would fill the screen)
  const nearFade = (m, rScale, key) => {
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 pc = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float pr = ${rScale.toFixed(3)} * length(instanceMatrix[0].xyz);
          transformed *= smoothstep(pr + 0.5, pr + 6.0, length(pc.xyz));
        }`,
      );
    };
    m.customProgramCacheKey = () => key;
  };
  nearFade(sm, 1.5, 'frost-smoke-fade');
  nearFade(hullMat, 1.5 / 1.1, 'frost-smoke-ink-fade');
  ownMaterials.push(sm, hullMat);
  const n = puffs.length;
  const smoke = new THREE.InstancedMesh(geo, sm, n);
  const hull = new THREE.InstancedMesh(hullGeo, hullMat, n);
  smoke.name = 'frost-smoke';
  hull.name = 'frost-smoke-ink';
  for (const m of [smoke, hull]) {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.userData.keep = true;
  }
  const cols = puffs.map((p) => [linear(p.c0), linear(p.c1 ?? p.c0), linear(p.c2 ?? p.c1 ?? p.c0)]);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) smoke.setColorAt(i, cols[i][0]);
  function update(t) {
    for (let i = 0; i < n; i++) {
      const p = puffs[i];
      const s = (t / p.life + p.phase) % 1;
      const sd = Math.pow(s, 1.35) * p.drift;
      const wob = p.spread * (0.35 + s);
      pos.set(
        p.x + WIND.x * sd + Math.sin(p.seed + s * 5) * wob,
        p.y + p.rise * Math.pow(s, 0.85),
        p.z + WIND.z * sd + Math.cos(p.seed * 1.3 + s * 4) * wob,
      );
      let r = lerp(p.r0, p.r1, Math.sqrt(s)) * p.k * smoothstep(0, 0.1, s) * (1 - smoothstep(p.fade, 1, s));
      if (s < 0.35) c.copy(cols[i][0]).lerp(cols[i][1], s / 0.35);
      else c.copy(cols[i][1]).lerp(cols[i][2], (s - 0.35) / 0.65);
      e.set(0.3 * Math.sin(p.seed), p.seed + s * p.spin * 6, 0.3 * Math.cos(p.seed));
      r = Math.max(r, 0.001);
      q.setFromEuler(e);
      scl.set(r, r * 0.9, r);
      m4.compose(pos, q, scl);
      smoke.setMatrixAt(i, m4);
      smoke.setColorAt(i, c);
      const k = 1 + Math.min(0.08, 0.16 * r) / r;
      scl.multiplyScalar(k);
      m4.compose(pos, q, scl);
      hull.setMatrixAt(i, m4);
    }
    smoke.instanceMatrix.needsUpdate = true;
    hull.instanceMatrix.needsUpdate = true;
    if (smoke.instanceColor) smoke.instanceColor.needsUpdate = true;
  }
  return { mesh: smoke, hull, update };
}

// ---------------------------------------------------------------------------
// Snowfall: one InstancedMesh of 200 flakes in a box that travels with the camera
// ---------------------------------------------------------------------------
const SNOW_N = 200;
const SNOW_BOX = 52; // width and depth of the box round the camera
const SNOW_H = 26; // its height
function buildSnow(ownMaterials) {
  const geo = new THREE.IcosahedronGeometry(0.065, 1);
  const sm = new THREE.MeshBasicMaterial({ color: 0xffffff });
  noOutline(sm);
  // flakes right in front of the lens shrink away instead of turning into big white blobs
  sm.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        vec4 pc = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        transformed *= smoothstep(3.0, 9.0, length(pc.xyz));
      }`,
    );
  };
  sm.customProgramCacheKey = () => 'frost-snowflake';
  ownMaterials.push(sm);
  const flakes = new THREE.InstancedMesh(geo, sm, SNOW_N);
  flakes.name = 'frost-snowfall';
  flakes.frustumCulled = false;
  flakes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  flakes.userData.keep = true;
  const r = mulberry32(77);
  const list = [];
  for (let i = 0; i < SNOW_N; i++) {
    list.push({ x: r() * SNOW_BOX, y: r() * SNOW_H, z: r() * SNOW_BOX, s: 0.7 + r() * 0.6, fall: 1.1 + r() * 0.9, ph: r() * 6.28, sway: 0.3 + r() * 0.6 });
  }
  const m4 = new THREE.Matrix4();
  const wrap = (v, m) => ((v % m) + m) % m;
  let shown = true;
  function update(t, cam) {
    if (!cam) {
      if (shown) flakes.visible = shown = false;
      return;
    }
    if (!shown) flakes.visible = shown = true;
    const cx = cam.position.x;
    const cy = cam.position.y;
    const cz = cam.position.z;
    for (let i = 0; i < SNOW_N; i++) {
      const f = list[i];
      const x = f.x + WIND.x * t * 1.1 + Math.sin(t * 0.9 + f.ph) * f.sway;
      const y = f.y - f.fall * t;
      const z = f.z + WIND.z * t * 1.1 + Math.cos(t * 0.7 + f.ph * 1.3) * f.sway;
      m4.makeScale(f.s, f.s, f.s);
      m4.setPosition(
        cx + wrap(x - cx, SNOW_BOX) - SNOW_BOX / 2,
        cy - 16 + wrap(y - cy, SNOW_H),
        cz + wrap(z - cz, SNOW_BOX) - SNOW_BOX / 2,
      );
      flakes.setMatrixAt(i, m4);
    }
    flakes.instanceMatrix.needsUpdate = true;
  }
  return { mesh: flakes, update };
}

// ---------------------------------------------------------------------------
// Aurora: three glowing curtains low over the far end of the strait (unlit, no fog, no outline).
// They are alpha-blended rather than additive: added light all but vanishes against the pale
// pastel dawn horizon, while a blended curtain keeps its mint and pink.
// ---------------------------------------------------------------------------
const AURORA = [
  { cx: -10, cz: -236, len: 420, ang: 0.08, y0: 22, h: 64, c0: 0x2dffa2, c1: 0xb06cff, ph: 0, amp: 26, op: 0.85, rays: 37 },
  { cx: 90, cz: -262, len: 300, ang: -0.3, y0: 40, h: 56, c0: 0x4ff0ff, c1: 0xff62c8, ph: 2.1, amp: 20, op: 0.85, rays: 29 },
  { cx: -110, cz: -214, len: 260, ang: 0.5, y0: 20, h: 48, c0: 0x6dff7a, c1: 0x7d8fff, ph: 4.2, amp: 16, op: 0.8, rays: 23 },
];
const AURORA_COLS = 72;
const AURORA_ROWS = [
  // [height fraction, colour (0 = c0, 1 = c1), alpha]
  [0, 0, 0],
  [0.14, 0, 0.95],
  [0.55, 0.6, 0.38],
  [1, 1, 0],
];
function buildAurora(ownMaterials) {
  const meshes = [];
  const NR = AURORA_ROWS.length;
  for (const A of AURORA) {
    const n = AURORA_COLS;
    const pos = new Float32Array((n + 1) * NR * 3);
    const col = new Float32Array((n + 1) * NR * 4);
    const c0 = linear(A.c0);
    const c1 = linear(A.c1);
    const c = new THREE.Color();
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const end = Math.pow(Math.sin(Math.PI * u), 0.6);
      const ray = 0.5 + 0.5 * Math.abs(Math.sin(u * A.rays + A.ph)) * (0.7 + 0.3 * Math.sin(u * 11 + A.ph));
      AURORA_ROWS.forEach(([, k, a], j) => {
        c.copy(c0).lerp(c1, k);
        col.set([c.r, c.g, c.b, a * end * (j === 1 ? 0.65 + 0.35 * ray : ray)], (i * NR + j) * 4);
      });
    }
    const idx = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < NR - 1; j++) {
        const a = i * NR + j;
        const b = (i + 1) * NR + j;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    geo.setIndex(idx);
    // (it writes depth where it shows, so the ink lines of the far peaks behind it stay hidden:
    // the outline pass draws after it)
    const am = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: A.op, alphaTest: 0.06, side: THREE.DoubleSide, fog: false });
    noOutline(am);
    ownMaterials.push(am);
    const m = new THREE.Mesh(geo, am);
    m.name = 'frost-aurora';
    m.frustumCulled = false;
    m.userData.keep = true;
    meshes.push({ m, A, pos, geo });
  }
  function update(t) {
    for (const { m, A, pos, geo } of meshes) {
      const dx = Math.cos(A.ang);
      const dz = Math.sin(A.ang);
      for (let i = 0; i <= AURORA_COLS; i++) {
        const u = i / AURORA_COLS;
        const along = (u - 0.5) * A.len;
        const off = Math.sin(u * 5.2 + A.ph + t * 0.11) * A.amp + Math.sin(u * 13.0 - t * 0.27 + A.ph) * A.amp * 0.22;
        const x = A.cx + dx * along - dz * off;
        const z = A.cz + dz * along + dx * off;
        const top = A.h * (0.78 + 0.22 * Math.sin(u * 7.0 + A.ph + t * 0.2));
        const y0 = A.y0 + Math.sin(u * 3.1 + A.ph) * 6;
        AURORA_ROWS.forEach(([f], j) => {
          // the curtain leans back a little as it rises
          pos.set([x + dz * f * 10, y0 + f * top, z - dx * f * 10], (i * AURORA_ROWS.length + j) * 3);
        });
      }
      geo.attributes.position.needsUpdate = true;
      m.material.opacity = A.op * (0.85 + 0.15 * Math.sin(t * 0.35 + A.ph));
    }
  }
  update(0);
  return { meshes: meshes.map((x) => x.m), update };
}

// ---------------------------------------------------------------------------
// Ice floes: one baked mesh per floe (ice, snow and maybe a seal) and a flat foam ring
// ---------------------------------------------------------------------------
function buildFloes(parent, ownMaterials) {
  const foamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  noOutline(foamMat);
  ownMaterials.push(foamMat);
  const out = [];
  for (let i = 0; i < FLOES.length; i++) {
    const f = FLOES[i];
    const rand = mulberry32(900 + i * 31);
    const g = group(parent);
    const n = 11;
    const pts = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (rand() - 0.5) * 0.35;
      const rr = f.r * (0.84 + rand() * 0.16);
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    const iceM = toon(COL.floeIce);
    const snowM = toon(COL.snow);
    slab(g, insetPoly(pts, 0.32), -0.95, 0.5, 0.32, iceM, 2);
    slab(g, insetPoly(pts, 0.85), 0.2, 0.72, 0.3, snowM, 2);
    // a lump or two of snow, and maybe a seal hauled out on it
    for (let k = 0; k < 2; k++) {
      const a = rand() * Math.PI * 2;
      const d = f.r * (0.2 + rand() * 0.35);
      const sm = mesh(g, sphere(1, 12, 7), snowM, Math.cos(a) * d, 0.62, Math.sin(a) * d, rand() * 3);
      sm.scale.set(0.7 + rand() * 0.6, 0.35 + rand() * 0.2, 0.6 + rand() * 0.5);
    }
    if (f.seal) seal(g, f.r * 0.12, 0.62, -f.r * 0.1, rand() * 6.28, 1.0);
    const baked = bake(g);
    baked.name = 'frost-floe';
    // the foam ring: a lobed band round the floe, opaque at the ice and fading outwards
    const ringGeo = new THREE.RingGeometry(f.r * 0.8, f.r * 1.5, 30, 2);
    const p = ringGeo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k);
      const y = p.getY(k);
      const rr = Math.hypot(x, y);
      if (rr > f.r * 1.2) {
        const a = Math.atan2(y, x);
        const kk = 1 + 0.12 * Math.sin(5 * a + i) + 0.08 * Math.sin(9 * a + i * 2);
        p.setXY(k, x * kk, y * kk);
      }
    }
    ringGeo.rotateX(-Math.PI / 2);
    fadeColors(ringGeo, 0xffffff, (x) => x);
    const cc = ringGeo.attributes.color;
    for (let k = 0; k < p.count; k++) {
      const rr = Math.hypot(p.getX(k), p.getZ(k));
      cc.setW(k, rr < f.r * 1.2 ? 0.85 : 0.0);
    }
    const foam = new THREE.Mesh(ringGeo, foamMat);
    foam.name = 'frost-floe-foam';
    foam.userData.keep = true;
    parent.add(foam);
    out.push({ g, foam, spin: (i % 2 ? -1 : 1) * (0.012 + 0.006 * (i % 3)), spin0: rand() * 6.28, ph: rand() * 6.28 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
export function build(scene /* , ctx = {} */) {
  const rand = mulberry32(20261015); // fixed: the level always looks the same
  const root = new THREE.Group();
  root.name = 'env-frost';
  scene.add(root);
  const statics = new THREE.Group();
  root.add(statics);
  const ownMaterials = [];
  const anim = { ships: [], flames: [], glows: [] };
  const colliders = [];
  const puffs = [];

  // ----- coastlines -----
  const ws = wobble(spline(WEST_S, 2), 1.3, 1.1);
  const wb = wobble(spline(WEST_BIGHT, 2), 0.6, 2.2);
  const wback = wobble(spline(WEST_BACK, 2), 1.0, 3.3);
  const wn = wobble(spline(WEST_N, 2), 1.3, 4.4);
  const en = wobble(spline(EAST_N, 2), 1.3, 5.5);
  const ep = wobble(spline(EAST_POINT, 2), 0.6, 6.6);
  const eback = wobble(spline(EAST_BACK, 2), 1.0, 7.7);
  const es = wobble(spline(EAST_S, 2), 1.3, 8.8);
  const westLand = join(ws, wback, wn, FAR_W);
  const eastLand = join(en, eback, es, FAR_E);
  const villageShelf = join(wb, wback.slice().reverse());
  const pointShelf = join(ep, eback.slice().reverse());

  // ----- fjord cliffs: banded rock with snow on every ledge and a snow cornice -----
  const cliffLayers = [
    { y0: -4, y1: 7.6, inset: 0, bevel: 1.4, mat: mat('rockA'), wob: 0.6 },
    { y0: 6.8, y1: 14.4, inset: 1.5, bevel: 1.2, mat: mat('rockB'), wob: 1.0 },
    { y0: 13.6, y1: 20.6, inset: 2.6, bevel: 1.1, mat: mat('rockD'), wob: 0.9 },
    { y0: 19.8, y1: 25.6, inset: 3.4, bevel: 1.0, mat: mat('rockC'), wob: 0.8 },
    { y0: 24.8, y1: TOP, inset: 2.5, bevel: 1.05, mat: mat('snow'), wob: 0.5, segs: 3 },
  ];
  const cliffWarp = (x, y, z) => {
    if (y <= -4 || y >= TOP - 3) return 0;
    const f = Math.sin((Math.PI * (y + 4)) / (TOP + 1));
    return f * (1.9 * Math.sin(0.047 * x + 0.6) * Math.cos(0.041 * z - 0.3) + 1.0 * Math.sin(0.093 * x - 0.071 * z + 2.0));
  };
  strata(statics, westLand, cliffLayers, 0.3, cliffWarp);
  strata(statics, eastLand, cliffLayers, 1.9, cliffWarp);

  // the low shelves in the bight and on the point (snow on top, pebbly rock at the waterline)
  slab(statics, insetPoly(villageShelf, 0.8), -3, SHELF_Y, 0.8, mat('shelf'), 3);
  slab(statics, insetPoly(pointShelf, 0.8), -3, SHELF_Y + 0.3, 0.8, mat('shelf'), 3);
  // the church knoll at the back of the village
  {
    const mound = mesh(statics, sphere(1, 28, 14), mat('shelf'), CHURCH.x, -0.6, CHURCH.z, 0.3);
    mound.scale.set(12.5, CHURCH.y + 0.6, 11.5);
  }

  // shoulders of dark rock at the cliff foot, snow mounds and firs along the clifftops
  const clifftop = [];
  for (const line of [ws, wn, en, es]) {
    const nrm = leftNormals(line);
    let s = 0;
    let nextCol = 4 + rand() * 6;
    let nextFir = 3 + rand() * 6;
    let nextMound = 8 + rand() * 8;
    let nextIce = 20 + rand() * 30;
    for (let i = 1; i < line.length - 1; i++) {
      s += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
      const [x, z] = line[i];
      const dc = Math.hypot(x, z);
      if (dc > WORLD_R + 90) continue;
      const ry = Math.atan2(line[i + 1][0] - line[i - 1][0], line[i + 1][1] - line[i - 1][1]);
      const [nx, nz] = nrm[i];
      if (s > nextCol) {
        nextCol = s + 12 + rand() * 16;
        const sy = 3.6 + rand() * 3.2;
        const sx = 3.4 + rand() * 2.8;
        const sz = 1.5 + rand() * 0.5;
        const m = mesh(statics, sphere(1, 14, 10), mat('rockA'), x + nx * sz * 0.7, sy * 0.25, z + nz * sz * 0.7, ry);
        m.scale.set(sz, sy, sx);
        m.rotation.z = (rand() - 0.5) * 0.5;
      }
      if (s > nextFir && dc < WORLD_R + 60) {
        nextFir = s + 5 + rand() * 9;
        const n = 1 + Math.floor(rand() * 3);
        for (let k = 0; k < n; k++) {
          const d = 7 + rand() * 16;
          const along = (rand() - 0.5) * 6;
          clifftop.push([x + nx * d - nz * along, z + nz * d + nx * along, 0.8 + rand() * 0.6]);
        }
      }
      if (s > nextMound) {
        nextMound = s + 14 + rand() * 18;
        const d = 5 + rand() * 4;
        snowMound(statics, x + nx * d, TOP - 0.2, z + nz * d, 3 + rand() * 2, 1.0 + rand() * 0.8, 5 + rand() * 4, ry);
      }
      if (s > nextIce && dc < WORLD_R + 30) {
        // icicles hanging from the cornice
        nextIce = s + 26 + rand() * 30;
        icicles(statics, x + nx * 2.6, TOP - 0.9, z + nz * 2.6, ry + Math.PI / 2, 3.5, 5, rand, 2.2);
      }
    }
  }
  for (const [x, z, s] of clifftop) fir(statics, x, TOP - 0.3, z, s, rand() * 6);
  // tall ribs of rock break up the long bands of the fjord walls, and here and there a trickle
  // of meltwater has frozen down the face
  {
    const faceInset = (y) => 3.2 * smoothstep(-2, 26, y);
    for (const line of [ws, wn, en, es]) {
      const nrm = leftNormals(line);
      let s = 0;
      let nextRib = 6 + rand() * 10;
      let nextDrip = 20 + rand() * 20;
      for (let i = 1; i < line.length - 1; i++) {
        s += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
        const [x, z] = line[i];
        if (Math.hypot(x, z) > WORLD_R + 70) continue;
        const ry = Math.atan2(line[i + 1][0] - line[i - 1][0], line[i + 1][1] - line[i - 1][1]);
        const [nx, nz] = nrm[i];
        if (s > nextRib) {
          nextRib = s + 14 + rand() * 18;
          // full-height buttresses: their tops tuck under the cornice, their feet under the sea
          const hy = 15.5 + rand() * 2.5;
          const yc = 10.5 + rand() * 1.5;
          const d = 3.3 + rand() * 0.4;
          const m = mesh(statics, sphere(1, 14, 12), mat(rand() < 0.5 ? 'rockB' : 'rockD'), x + nx * d, yc, z + nz * d, ry);
          m.scale.set(1.8 + rand() * 0.8, hy, 2.8 + rand() * 0.8);
          m.rotation.z = (rand() - 0.5) * 0.1;
        }
        if (s > nextDrip && Math.hypot(x, z) < WORLD_R + 20) {
          nextDrip = s + 34 + rand() * 40;
          const pts = [];
          const tx = -nz;
          const tz = nx;
          for (let k = 0; k <= 16; k++) {
            const yy = TOP - 1.5 - (k / 16) * (TOP - 0.5);
            const d = faceInset(yy) - 0.4 + 0.3 * Math.sin(k * 1.7 + s);
            const side = 0.7 * Math.sin(k * 0.45 + s * 0.3) + 0.2 * Math.sin(k * 1.9 + s);
            pts.push(V3(x + nx * d + tx * side, yy, z + nz * d + tz * side));
          }
          const w0 = 0.22 + rand() * 0.1;
          mesh(statics, tubeAlong(pts, (t) => w0 + 0.36 * Math.pow(t, 4) + 0.1 * Math.abs(Math.sin(t * 9 + s)), 7), mat('ice'));
        }
      }
    }
  }

  // ----- far peaks behind the cliffs and at the north end of the strait -----
  const PEAKS = [
    [-112, 70, 42, 64], [-128, -26, 52, 86], [-106, -122, 40, 62], [-150, 150, 48, 60], [-170, 20, 50, 74],
    [112, -16, 48, 80], [128, 92, 44, 66], [106, -128, 40, 60], [160, 196, 56, 64], [170, 30, 46, 70],
    [-60, -262, 64, 104], [52, -280, 72, 118], [-150, -230, 56, 88], [150, -236, 60, 92],
  ];
  PEAKS.forEach(([x, z, r, h], i) => {
    // (the two closing the far end of the strait rise straight out of the sea)
    const onLand = pointInPoly(x, z, westLand) || pointInPoly(x, z, eastLand);
    const m = mesh(statics, peakGeometry(400 + i * 13), mat('mountain'), x, onLand ? TOP - 6 : -4, z, rand() * 6);
    m.scale.set(r, onLand ? h : h + TOP - 2, r * 0.85);
  });

  // ----- the village on the bight -----
  {
    const onShelf = (x, z, w, d, ry) => {
      const c = Math.cos(ry);
      const s = Math.sin(ry);
      for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, 0]]) {
        const px = x + lx * c + lz * s;
        const pz = z - lx * s + lz * c;
        if (!pointInPoly(px, pz, villageShelf) || distToLine(px, pz, wb) < 1.6 || distToLine(px, pz, wback) < 1.5) return false;
      }
      return Math.hypot(x - CHURCH.x, z - CHURCH.z) > 9.5 + Math.max(w, d) * 0.5;
    };
    const HOUSES = [
      [-64, 8, 1.45, { w: 4.8, d: 6.2, h: 2.9, rh: 2.1, wall: 'woodRed', chimney: 1 }],
      [-73, 6, 1.75, { w: 4.4, d: 5.6, h: 2.7, rh: 2.0, wall: 'woodOchre', chimney: -1, gableWindow: true }],
      [-62, 45, 1.75, { w: 4.6, d: 6.0, h: 2.8, rh: 2.0, wall: 'woodOchre', chimney: -1 }],
      [-70, 52, 2.0, { w: 5.0, d: 6.6, h: 3.0, rh: 2.2, wall: 'woodRed', chimney: 1, gableWindow: true }],
      [-79, 47, 2.3, { w: 4.2, d: 5.2, h: 2.6, rh: 1.9, wall: 'woodBrown', windows: 1 }],
      [-80, 13, 1.0, { w: 4.6, d: 6.0, h: 2.8, rh: 2.0, wall: 'woodBrown', chimney: 1 }],
      [-62, 20, 1.57, { w: 5.2, d: 8.0, h: 2.6, rh: 2.2, wall: 'woodBrown', windows: 1, dark: true }], // the boathouse
    ];
    for (const [x, z, ry, o] of HOUSES) {
      if (!onShelf(x, z, o.w + 1.1, o.d + 1.2, ry)) continue;
      const top = house(statics, x, SHELF_Y - 0.08, z, ry, o);
      if (top) {
        puffStream(puffs, rand, {
          x: top.x, y: top.y, z: top.z, n: 6, life: 6.5, rise: 8, drift: 6, spread: 0.5,
          r0: 0.32, r1: 1.05, c0: 0xffffff, c1: 0xf6f3ff, c2: 0xe6e1f6, fade: 0.6,
        });
      }
    }
    // the stave church on its knoll, door towards the water
    staveChurch(statics, CHURCH.x, CHURCH.y - 0.1, CHURCH.z, Math.PI / 2, rand);
    // fish drying on racks
    for (const [x, z, ry] of [[-60, 36, 1.6], [-70, 23, 1.3]]) {
      const g = group(statics, x, SHELF_Y, z, ry);
      for (const s of [-1, 1]) {
        for (const t of [-1, 1]) {
          const p = mesh(g, cyl(0.1, 0.12, 3.2, 6), mat('woodGrey'), s * 2.0 + t * 0.35, 1.5, 0);
          p.rotation.z = t * 0.22;
        }
      }
      const bar = mesh(g, cyl(0.08, 0.08, 4.6, 6), mat('woodGrey'), 0, 2.95, 0);
      bar.rotation.z = Math.PI / 2;
      const bar2 = mesh(g, cyl(0.07, 0.07, 4.6, 6), mat('woodGrey'), 0, 2.15, 0);
      bar2.rotation.z = Math.PI / 2;
      for (const [by, n] of [[2.95, 7], [2.15, 6]]) {
        for (let k = 0; k < n; k++) {
          const fx = -1.6 + (k * 3.2) / (n - 1);
          const f = mesh(g, sphere(0.2, 10, 7), mat('fish'), fx, by - 0.5, 0.02);
          f.scale.set(0.62, 1.7, 0.32);
          const tail = mesh(g, cone(0.2, 0.3, 4), mat('fish'), fx, by - 0.98, 0.02);
          tail.scale.set(1.2, 1, 0.35);
          mesh(g, cyl(0.02, 0.02, 0.2, 4), mat('rope'), fx, by - 0.1, 0.02);
        }
      }
    }
    // the jetty: a deck on piles running out into the strait, barrels and lanterns
    {
      const len = JETTY.x1 - JETTY.x0;
      const cx = (JETTY.x0 + JETTY.x1) / 2;
      mesh(statics, rbox(len, 0.4, 3.2, 0.12), mat('woodPale'), cx, JETTY.y, JETTY.z);
      for (let x = JETTY.x0 + 1; x <= JETTY.x1; x += 2.6) {
        for (const s of [-1, 1]) mesh(statics, cyl(0.24, 0.26, 4.6, 8), mat('woodGrey'), x, JETTY.y - 1.9, JETTY.z + s * 1.55);
      }
      for (const s of [-1, 1]) {
        mesh(statics, cyl(0.26, 0.28, 1.5, 8), mat('woodDark'), JETTY.x1 - 0.4, JETTY.y + 0.7, JETTY.z + s * 1.4);
        mesh(statics, sphere(0.3, 10, 8), LIT(), JETTY.x1 - 0.4, JETTY.y + 1.6, JETTY.z + s * 1.4);
        mesh(statics, cone(0.36, 0.4, 8), mat('iron'), JETTY.x1 - 0.4, JETTY.y + 2.05, JETTY.z + s * 1.4);
      }
      const barrel = cached('barrel', () => lathe([[0, -0.6], [0.46, -0.6], [0.56, 0], [0.46, 0.6], [0, 0.6]], 12));
      for (const [bx, bz] of [[-52, 27.2], [-51, 28.6], [-46.5, 27.4]]) mesh(statics, barrel, mat('oak'), bx, JETTY.y + 0.8, bz, rand() * 3);
      snowMound(statics, -55, JETTY.y + 0.25, 29, 1.2, 0.3, 1.0);
      // the longships moored on both sides of it, bows to the strait
      const looks = [
        { band: 'blue', sail: 'red', shields: ['red', 'yellow', 'blue', 'white'] },
        { band: 'red', sail: 'blue', shields: ['yellow', 'blue', 'white', 'red'] },
      ];
      looks.forEach((look, k) => {
        const s = k ? 1 : -1;
        const ls = longship(root, -48.5, JETTY.z + s * 3.5, Math.PI / 2 + s * 0.04, look);
        ls.g.userData.keep = true;
        anim.ships.push(ls.g);
      });
      for (const [x, r] of [[-52.5, 6.4], [-47, 6.4], [-42.6, 5.8]]) colliders.push({ x, z: JETTY.z, r, h: 6 });
    }
    // the rest of the shelf: firs at the cliff foot, an upturned boat, a few snowy mounds
    for (let k = 0; k < 26; k++) {
      const i = Math.floor(rand() * wback.length);
      const [bx, bz] = wback[i];
      const nrm = leftNormals(wback)[i];
      const d = 2 + rand() * 5;
      const fx = bx - nrm[0] * d;
      const fz = bz - nrm[1] * d;
      if (!pointInPoly(fx, fz, villageShelf) || Math.hypot(fx - CHURCH.x, fz - CHURCH.z) < 11) continue;
      fir(statics, fx, SHELF_Y - 0.1, fz, 0.75 + rand() * 0.5, rand() * 6);
    }
    {
      const g = group(statics, -58.5, SHELF_Y + 0.55, 13, 0.3);
      const hull = mesh(g, sphere(1, 14, 8), mat('blue'), 0, 0, 0);
      hull.scale.set(0.95, 0.55, 2.4);
      snowMound(g, 0, 0.45, 0, 0.75, 0.2, 1.9);
    }
    for (let k = 0; k < 7; k++) {
      const x = -60 - rand() * 18;
      const z = 2 + rand() * 56;
      if (pointInPoly(x, z, villageShelf) && distToLine(x, z, wb) > 3) snowMound(statics, x, SHELF_Y - 0.1, z, 1.2 + rand(), 0.4 + rand() * 0.3, 1.2 + rand(), rand() * 3);
    }
  }

  // ----- the abandoned whaling station on the east point -----
  {
    const S = STATION;
    const g = group(statics, S.x, 0, S.z, 0);
    const deckW = 12; // along x
    const deckD = 14; // along z
    // stilts and cross braces
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const sx = -deckW / 2 + 0.6 + (i * (deckW - 1.2)) / 3;
        const sz = -deckD / 2 + 0.6 + (j * (deckD - 1.2)) / 3;
        mesh(g, cyl(0.28, 0.32, S.y + 3, 8), mat('woodGrey'), sx, S.y / 2 - 1.5, sz);
      }
    }
    for (let j = 0; j < 3; j++) {
      const z0 = -deckD / 2 + 0.6 + (j * (deckD - 1.2)) / 3;
      const dz = (deckD - 1.2) / 3;
      const br = mesh(g, cyl(0.1, 0.1, Math.hypot(dz, S.y - 0.6), 6), mat('woodGrey'), -deckW / 2 + 0.6, S.y / 2 - 0.1, z0 + dz / 2);
      br.rotation.x = Math.atan2(dz, S.y - 0.6) * (j % 2 ? 1 : -1);
    }
    mesh(g, rbox(deckW, 0.45, deckD, 0.1), mat('woodPale'), 0, S.y, 0);
    // a few planks missing
    mesh(g, rbox(0.9, 0.12, 2.4, 0.04), mat('ink'), -2.2, S.y + 0.2, 3.9);
    mesh(g, rbox(0.9, 0.12, 1.6, 0.04), mat('ink'), 0.6, S.y + 0.2, -5.2);
    const y = S.y + 0.2;
    // the long shed at the back, its roof sagging and its door hanging open
    {
      const sg = group(g, 3.0, y, -0.2, 0);
      mesh(sg, rbox(5.6, 3.2, 9.0, 0.12), mat('woodGrey'), 0, 1.6, 0);
      gableEnds(sg, 5.6, 9.0, 3.2, 2.1, mat('woodGrey'));
      gableRoof(sg, 5.6, 9.0, 3.2, 2.1, 0.45, mat('woodBrown'), true, 0.38, 0.09);
      const dr = mesh(sg, rbox(0.2, 2.1, 1.5, 0.06), mat('ink'), -2.86, 1.05, 1.6);
      dr.rotation.y = 0.05;
      const door = mesh(sg, rbox(0.14, 2.0, 1.4, 0.06), mat('woodBrown'), -3.4, 1.05, 2.55, 1.2);
      door.rotation.z = 0.03;
      mesh(sg, rbox(0.16, 0.8, 0.9, 0.05), mat('window'), -2.84, 2.0, -2.2);
      for (let i = 0; i < 4; i++) {
        const ic = mesh(sg, cone(0.16, 1, 6), mat('ice'), -3.15, 3.2 - 0.45, -3.3 + i * 2.1);
        ic.rotation.x = Math.PI;
        ic.scale.y = 0.6 + (i % 2) * 0.5;
      }
    }
    // the try-works: a stone furnace with two big iron pots
    mesh(g, rbox(3.8, 1.3, 2.2, 0.2), mat('stone'), -1.2, y + 0.65, -5.2);
    const pot = cached('trypot', () => lathe([[0, -0.55], [0.55, -0.5], [0.85, -0.15], [0.9, 0.3], [0.8, 0.38], [0.74, 0.3]], 14));
    mesh(g, pot, mat('iron'), -2.1, y + 1.75, -5.2);
    mesh(g, pot, mat('iron'), -0.3, y + 1.75, -5.2);
    // the whale's jawbone arch over the landing at the seaward edge
    for (const s of [-1, 1]) {
      const pts = curvePts([V3(-5.0, y, s * 2.2), V3(-5.0, y + 2.6, s * 2.35), V3(-5.0, y + 5.0, s * 1.7), V3(-5.0, y + 6.5, s * 0.3)], 14);
      mesh(g, tubeAlong(pts, (t) => 0.36 - 0.17 * t, 8), mat('bone'));
    }
    // barrels by the shed, one fallen over
    const barrel = cached('barrel', () => lathe([[0, -0.6], [0.46, -0.6], [0.56, 0], [0.46, 0.6], [0, 0.6]], 12));
    for (const [bx, bz, tip] of [[-0.6, 4.6, 0], [0.6, 5.4, 0], [-1.6, 5.6, 1]]) {
      const b = mesh(g, barrel, mat('oak'), bx, y + (tip ? 0.5 : 0.6), bz, rand() * 3);
      if (tip) b.rotation.z = Math.PI / 2;
    }
    // the seaward rail, a stretch of it broken and hanging
    for (let k = 0; k < 6; k++) mesh(g, cyl(0.1, 0.12, 1.3, 6), mat('woodGrey'), -deckW / 2 + 0.25, y + 0.65, -deckD / 2 + 0.6 + k * 2.55);
    const rail = mesh(g, rbox(0.14, 0.14, 4.4, 0.05), mat('woodGrey'), -deckW / 2 + 0.25, y + 1.25, -4.4);
    rail.rotation.x = 0.02;
    const brk = mesh(g, rbox(0.14, 0.14, 3.6, 0.05), mat('woodGrey'), -deckW / 2 + 0.1, y + 0.75, 4.6);
    brk.rotation.x = 0.35;
    // the derrick: a mast with a boom swung out over the water, its hook still hanging
    mesh(g, cyl(0.16, 0.2, 7.6, 8), mat('woodGrey'), -4.4, y + 3.8, -2.4);
    const boomLen = 6.2;
    const boom = mesh(g, cyl(0.1, 0.13, boomLen, 6), mat('woodGrey'), -4.4 - Math.sin(1.2) * boomLen * 0.5, y + 4.2 + Math.cos(1.2) * boomLen * 0.5, -2.4);
    boom.rotation.z = 1.2;
    const tipX = -4.4 - Math.sin(1.2) * boomLen;
    const tipY = y + 4.2 + Math.cos(1.2) * boomLen;
    mesh(g, tubeAlong([V3(-4.4, y + 7.5, -2.4), V3(tipX, tipY, -2.4)], () => 0.035, 4), mat('rope'));
    mesh(g, tubeAlong([V3(tipX, tipY, -2.4), V3(tipX, y + 1.2, -2.4)], () => 0.04, 4), mat('rope'));
    const hook = mesh(g, cone(0.16, 0.5, 6), mat('iron'), tipX, y + 0.95, -2.4);
    hook.rotation.x = Math.PI;
    // a ladder down to the water
    for (const s of [-1, 1]) mesh(g, rbox(0.12, S.y + 1.2, 0.12, 0.04), mat('woodGrey'), -deckW / 2 - 0.2, S.y / 2 - 0.4, 1.0 + s * 0.45);
    for (let k = 0; k < 6; k++) mesh(g, rbox(0.1, 0.08, 0.9, 0.03), mat('woodGrey'), -deckW / 2 - 0.2, -0.2 + k * 0.75, 1.0);
    snowMound(g, 5.2, y + 0.05, -5.8, 1.8, 0.45, 1.2);
    snowMound(g, 2.2, y + 0.05, 6.2, 2.2, 0.35, 0.9);
    // the beacon: an iron fire basket on a tall pole at the seaward corner, still burning
    const bx = -deckW / 2 + 0.8;
    const bz = deckD / 2 - 0.8;
    mesh(g, cyl(0.18, 0.24, 7.0, 8), mat('woodDark'), bx, y + 3.5, bz);
    const basket = cached('basket', () => lathe([[0.2, -0.6], [0.72, -0.2], [0.95, 0.35], [0.88, 0.42], [0.62, 0.0]], 10));
    mesh(g, basket, mat('iron'), bx, y + 7.4, bz);
    const fire = group(root, S.x + bx, y + 7.75, S.z + bz);
    fire.userData.keep = true;
    // the flames: a fat tongue of orange, two smaller ones leaning out, a yellow core (one baked
    // mesh per colour, flickered by scale)
    const flameO = toon(0xffa33a, { emissive: 0xff6a1a, emissiveIntensity: 0.9 });
    const flameY = toon(0xfff07a, { emissive: 0xffd040, emissiveIntensity: 0.9 });
    const outer = group(fire);
    mesh(outer, sphere(0.7, 12, 8), flameO, 0, 0.35, 0).scale.set(1, 0.75, 1);
    for (const [a, l, tilt] of [[0, 2.3, 0.0], [2.2, 1.5, 0.35], [4.2, 1.3, 0.4]]) {
      const c = mesh(outer, cone(0.52, l, 9), flameO, Math.cos(a) * 0.25, 0.35 + l / 2, Math.sin(a) * 0.25);
      c.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
    }
    const inner = group(fire);
    mesh(inner, cone(0.34, 1.3, 8), flameY, 0.04, 0.75, 0.04);
    mesh(inner, sphere(0.36, 10, 7), flameY, 0.04, 0.3, 0.04).scale.set(1, 0.6, 1);
    mergeStatic(outer);
    mergeStatic(inner);
    anim.flames.push({ outer, inner });
    puffStream(puffs, rand, {
      x: S.x + bx, y: y + 9.4, z: S.z + bz, n: 8, life: 6, rise: 11, drift: 8, spread: 0.6,
      r0: 0.45, r1: 1.5, c0: 0xffe6c8, c1: 0xdcd6ea, c2: 0xc6bfdc, fade: 0.65,
    });
    anim.glows.push({ m: glowDisc(root, ownMaterials, S.x + bx, y + 8.3, S.z + bz, 3.6, 0xffb35a, 0.55), base: 0.55, kind: 'fire' });
    // colliders over the stilts that stand in the water
    for (let k = 0; k < 4; k++) colliders.push({ x: S.x - deckW / 2 + 2.6, z: S.z - deckD / 2 + 1.7 + k * 3.55, r: 3.3, h: S.y + 1 });
    // firs and rocks on the rest of the point
    for (const [fx, fz, s] of [[55, 22, 1.0], [58, 30, 1.2], [57, 58, 0.9], [53, 63, 1.1], [60, 40, 1.0], [52, 16, 0.8]]) {
      if (pointInPoly(fx, fz, pointShelf)) fir(statics, fx, SHELF_Y + 0.2, fz, s, rand() * 6);
    }
  }

  // ----- the frozen waterfall on the east cliffs -----
  {
    let best = en[0];
    for (const p of en) if (Math.abs(p[1] - FALLS_Z) < Math.abs(best[1] - FALLS_Z)) best = p;
    const [wx, wz] = best;
    const icefall = ICEFALL();
    const cols = 7;
    for (let k = 0; k < cols; k++) {
      const u = k / (cols - 1) - 0.5;
      const zc = wz + u * 9;
      const top = TOP - 0.4 - Math.abs(u) * 2.2;
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const yy = top * (1 - t) - 0.6 * t;
        // hugs the cliff face: the face leans back from the waterline by about 4 at the top
        const xx = wx + 0.4 + 4.6 * Math.pow(1 - t, 1.4) - 0.9 * Math.sin(t * Math.PI) + 0.35 * Math.sin(k * 2.1 + t * 9);
        pts.push(V3(xx, yy, zc + 0.3 * Math.sin(k + t * 7)));
      }
      const r0 = 0.75 + 0.25 * Math.sin(k * 1.7);
      mesh(statics, tubeAlong(pts, (t) => r0 * (0.75 + 0.55 * Math.pow(t, 2.5)) + 0.18 * Math.sin(t * 20 + k), 9), icefall);
    }
    // a sheet of ice behind the columns, so they read as one frozen cascade
    for (const [yy, sy, sz] of [[4.5, 6.5, 5.6], [12.5, 6.5, 5.0], [20.5, 5.5, 4.4]]) {
      const inset = 3.2 * smoothstep(-2, 26, yy);
      const b = mesh(statics, sphere(1, 16, 12), icefall, wx + inset + 1.1, yy, wz);
      b.scale.set(1.6, sy, sz);
    }
    // the frozen splash at its foot and the notch it pours from
    const fan = mesh(statics, sphere(1, 18, 10), icefall, wx + 1.4, 0.1, wz);
    fan.scale.set(3.4, 1.5, 7.0);
    for (const s of [-1, 1]) snowMound(statics, wx + 4.8, TOP - 0.2, wz + s * 6.2, 2.4, 1.6, 2.6);
    icicles(statics, wx + 2.4, TOP - 1.0, wz + 6.5, Math.PI / 2, 3, 4, rand, 2.6);
    icicles(statics, wx + 2.4, TOP - 1.0, wz - 6.5, Math.PI / 2, 3, 4, rand, 2.6);
    // the glow: a soft additive sheet in front of the ice (no outline)
    const sheet = new THREE.PlaneGeometry(16, TOP + 8, 8, 8);
    fadeColors(sheet, 0x9df0ff, (x, y) => {
      const d = Math.hypot(x / 8, y / ((TOP + 8) / 2));
      return Math.max(0, 1 - d) ** 1.6;
    });
    sheet.rotateY(-Math.PI / 2);
    const gm = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 });
    noOutline(gm);
    ownMaterials.push(gm);
    const glow = mesh(root, sheet, gm, wx - 1.2, TOP / 2 - 1, wz);
    glow.userData.keep = true;
    glow.name = 'frost-icefall-glow';
    anim.glows.push({ m: glow, base: 0.5, kind: 'ice' });
    colliders.push({ x: wx + 2.2, z: wz, r: 4.2, h: 3 });
  }

  // ----- icebergs -----
  BERGS.forEach(([x, z, r, h, shape], i) => {
    const rc = iceberg(statics, x, z, r, h, i + 1, rand, shape === 'block' ? BERG_BLOCK : BERG_PEAK);
    colliders.push({ x, z, r: +(rc * 0.98).toFixed(2), h: +h.toFixed(2) });
  });

  // ----- the ice arch across the northern reach -----
  {
    for (const s of [-1, 1]) {
      const px = s * ARCH.half;
      const ph = s > 0 ? 300 : 200;
      const lean = [-s * 1.2, 0.4];
      const ry = s * 0.4;
      const ph2 = ARCH.y + 4;
      mesh(statics, bergGeo(ARCH.r * 0.92, ph2, ph, { prof: BERG_COLUMN, lean }), mat('ice'), px, 0, ARCH.z, ry);
      mesh(statics, bergGeo(ARCH.r * 0.92, ph2, ph, { prof: BERG_COLUMN, lean, u1: 0.12, scale: 1.03 }), mat('iceDeep'), px, 0, ARCH.z, ry);
      // a smaller shard leaning against each foot
      iceberg(statics, px + s * ARCH.r * 0.9, ARCH.z + 2.6, ARCH.r * 0.42, 6.5, ph + 7, rand);
      colliders.push({ x: px + s * 0.6, z: ARCH.z + 0.6, r: ARCH.r + 1.8, h: 30 });
    }
    // the span: a thick curved bridge of ice with a ridge of snow along its top
    const n = 24;
    const span = [];
    const ridge = [];
    for (let i = 0; i <= n; i++) {
      const th = (i / n) * Math.PI;
      const x = -Math.cos(th) * ARCH.half;
      const y = ARCH.y + Math.sin(th) * 12.5;
      span.push(V3(x, y, ARCH.z + Math.sin(th * 2) * 0.8));
      ridge.push(V3(x * 0.98, y + 2.25 - 0.4 * (1 - Math.sin(th)), ARCH.z + Math.sin(th * 2) * 0.8));
    }
    mesh(statics, tubeAlong(span, (t) => 3.4 - 1.0 * Math.sin(Math.PI * t), 12), mat('ice'));
    mesh(statics, tubeAlong(ridge.slice(2, n - 1), (t) => 1.25 - 0.3 * Math.sin(Math.PI * t), 10), mat('snow'));
    for (let i = 4; i <= n - 4; i += 2) {
      const p = span[i];
      const t = i / n;
      const under = 3.4 - 1.0 * Math.sin(Math.PI * t);
      icicles(statics, p.x, p.y - under + 0.6, p.z, 0, 1.6, 3, rand, 2.4);
    }
  }

  // ----- puffin rocks -----
  PUFFIN_ROCKS.forEach(([x, z, r, h], i) => {
    const top = rockPile(statics, x, z, r, h, rand);
    const n = 3 + (i % 2);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + i;
      const d = r * 0.32;
      puffin(statics, x + Math.cos(a) * d, top - 0.4 - 0.2 * k, z + Math.sin(a) * d, rand() * 6, 1.7);
    }
    colliders.push({ x, z, r: +(r * 0.98).toFixed(2), h });
  });

  // ----- coastline colliders: overlapping circles hugging the waterline -----
  // (the waterline with the height of the land behind it: [x, z, h])
  for (const pts of [
    join(ws.map((p) => [...p, TOP]), wb.map((p) => [...p, SHELF_Y + 0.4]), wn.map((p) => [...p, TOP])),
    join(en.map((p) => [...p, TOP]), ep.map((p) => [...p, SHELF_Y + 0.7]), es.map((p) => [...p, TOP])),
  ]) {
    const nrm = leftNormals(pts.map((p) => [p[0], p[1]]));
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
      let r = RMAX;
      if (Math.hypot(px, pz) < WORLD_R + 75) {
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
  }

  // ----- smoke, glows, aurora, snow -----
  const smoke = buildSmoke(puffs, ownMaterials);
  root.add(smoke.mesh, smoke.hull);
  const aurora = buildAurora(ownMaterials);
  for (const m of aurora.meshes) root.add(m);
  const snow = buildSnow(ownMaterials);
  root.add(snow.mesh);

  // ----- the drifting ice floes (env.reefs) -----
  const floeMeshes = buildFloes(root, ownMaterials);
  const reefs = FLOES.map((f) => {
    const [x, z] = floeAt(f, 0);
    return { x, z, r: f.r, ice: true };
  });
  let stepTime = 0;
  function step(simTime) {
    const t = Number.isFinite(simTime) ? simTime : 0;
    for (let i = 0; i < FLOES.length; i++) {
      const [x, z] = floeAt(FLOES[i], t);
      reefs[i].x = x;
      reefs[i].z = z;
    }
    stepTime = t;
  }

  bakeFamilies(statics);
  mergeStatic(statics); // what is left: the lit windows and the glowing ice
  // the level is static: no need to recompute matrices for merged parts every frame
  statics.traverse((o) => {
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  });

  // ----- player start and enemy spawns -----
  const playerStart = { ...PLAYER_START };
  const inLand = (x, z) => [westLand, eastLand, villageShelf, pointShelf].some((poly) => pointInPoly(x, z, poly));
  const enemySpawns = computeSpawns(playerStart, colliders, inLand);

  function update(t, dt, ctx = {}) {
    const sim = Number.isFinite(ctx?.simTime) ? ctx.simTime : stepTime;
    const amp = palette.waveAmp;
    for (let i = 0; i < floeMeshes.length; i++) {
      const f = FLOES[i];
      const fm = floeMeshes[i];
      const [x, z] = floeAt(f, sim);
      const h = waveHeight(x, z, t, amp);
      const hx = (waveHeight(x + 1.5, z, t, amp) - waveHeight(x - 1.5, z, t, amp)) / 3;
      const hz = (waveHeight(x, z + 1.5, t, amp) - waveHeight(x, z - 1.5, t, amp)) / 3;
      const yaw = fm.spin0 + sim * fm.spin;
      fm.g.position.set(x, h * 0.85 - 0.06 + Math.sin(t * 1.3 + fm.ph) * 0.04, z);
      fm.g.rotation.set(hz * 0.7, yaw, -hx * 0.7);
      fm.foam.position.set(x, h + 0.05, z);
      fm.foam.rotation.y = yaw;
    }
    for (const s of anim.ships) {
      const { x, z, ph } = s.userData.base;
      s.position.y = waveHeight(x, z, t, amp) * 0.8 - 0.1;
      s.rotation.z = Math.sin(t * 1.2 + ph) * 0.04;
      s.rotation.x = Math.sin(t * 0.9 + ph + 1) * 0.02;
    }
    for (const { outer, inner } of anim.flames) {
      const a = 1 + 0.12 * Math.sin(t * 11) + 0.07 * Math.sin(t * 17.3);
      outer.scale.set(1 + 0.08 * Math.sin(t * 7.1), a, 1 + 0.08 * Math.cos(t * 6.3));
      outer.rotation.y = t * 0.8;
      inner.scale.set(1, 1 + 0.15 * Math.sin(t * 13.7 + 1), 1);
    }
    for (const gl of anim.glows) {
      gl.m.material.opacity = gl.kind === 'fire' ? gl.base * (0.85 + 0.15 * Math.sin(t * 9.3) * Math.sin(t * 4.1)) : gl.base * (0.8 + 0.2 * Math.sin(t * 0.8));
      if (gl.kind === 'fire' && ctx?.camera) gl.m.quaternion.copy(ctx.camera.quaternion);
    }
    smoke.update(t);
    aurora.update(t);
    snow.update(t, ctx?.camera);
  }

  function dispose() {
    scene.remove(root);
    const geos = new Set();
    root.traverse((o) => {
      if (o.isMesh && o.geometry) geos.add(o.geometry);
    });
    for (const g of geos) g.dispose(); // (cached ones simply re-upload if the level is built again)
    for (const m of ownMaterials) m.dispose();
  }

  return {
    worldRadius: WORLD_R,
    colliders,
    playerStart,
    enemySpawns,
    reefs, // the drifting ice floes, { x, z, r, ice: true }, moved in place by step()
    step, // gameplay motion in simulated time (main calls it every step)
    update,
    dispose,
    group: root,
  };
}

// A soft additive disc of light (fire glow), turned to the camera in update().
function glowDisc(parent, ownMaterials, x, y, z, r, hex, opacity) {
  const geo = new THREE.CircleGeometry(r, 24);
  fadeColors(geo, hex, (px, py) => Math.max(0, 1 - Math.hypot(px, py) / r) ** 1.8);
  const gm = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity });
  noOutline(gm);
  ownMaterials.push(gm);
  const m = mesh(parent, geo, gm, x, y, z);
  m.userData.keep = true;
  m.name = 'frost-glow';
  return m;
}

// Enemy spawn points: open water 58-92 from the start, clear of every collider by r + 12 and of
// every floe's whole drift path by its r + 6, never on land, inside worldRadius - 16, ordered so
// that any prefix is well spread (the opening wave takes the first ones).
function computeSpawns(start, colliders, inLand) {
  const nearFloe = (x, z) =>
    FLOES.some((f) => {
      for (let k = 0; k < 48; k++) {
        const a = (k / 48) * Math.PI * 2;
        if (Math.hypot(x - (f.cx + f.rx * Math.cos(a)), z - (f.cz + f.rz * Math.sin(a))) < f.r + 6) return true;
      }
      return false;
    });
  const cand = [];
  for (let x = -WORLD_R; x <= WORLD_R; x += 3) {
    for (let z = -WORLD_R; z <= WORLD_R; z += 3) {
      if (Math.hypot(x, z) > WORLD_R - 16) continue;
      const ds = Math.hypot(x - start.x, z - start.z);
      if (ds < 58 || ds > 92) continue;
      if (inLand(x, z) || colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 12)) continue;
      if (nearFloe(x, z)) continue;
      cand.push({ x, z });
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
