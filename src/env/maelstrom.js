import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, setOutline, noOutline, mergeStatic, gradientMap, INK } from '../style.js';
import { waveHeight } from '../scenery.js';

// Level 6, "The Maelstrom" (SPEC2 §6.6): a stormy night at the end of the world.
//
// Map (north = -z, east = +x; the arena is the disc of radius WORLD_R around 0,0):
// - the whirlpool fills the middle: a spiral foam disc (radius DISC) that turns with rotation.y
//   increasing (the sense of the `current` mechanic's swirl), around a dark eye funnel (radius EYE)
//   that sinks far below the sea. The funnel is drawn as a real hole in the ocean: it renders first
//   without a depth test, then an invisible lid at the rim writes depth so the ocean (and anything
//   below the rim) is not drawn over it; its triangles are ordered deep to shallow, so the walls
//   paint over each other correctly. Foam spray churns round the rim, wreckage circles in the
//   current, sinks at the eye and bobs up again far out.
// - a ring of jagged sea stacks stands on the rim, 101-125 from the centre (colliders), broken by
//   Skull Rock in the north (a stack carved like a skull, glowing green eyes, facing the whirlpool),
//   a ruined, leaning lighthouse with a green flame in the east, and two islets of a sunken temple
//   (pillars, a fallen colonnade, green braziers) in the west and south-east.
// - the player starts in the south at radius 95, facing the whirlpool; beyond the arena a ring of
//   far rock teeth and the silhouette of a kraken rise out of the storm haze.
// - rain streaks fall round the camera; lightning (flash(x, z), called by main's lightning bombs)
//   strikes as a bolt with a sky flash, capped for photosensitivity (SPEC2 §13): the sky flash is
//   one smooth pulse of at most 0.22 opacity, at most one per 3 s (never strobing); with
//   prefers-reduced-motion it becomes a slow, faint sky tint and the bolt fades in and out.
//
// build(scene, { rng, reducedMotion? }) -> { worldRadius, colliders, playerStart, enemySpawns, reefs,
//   current, flash(x, z), lightning (read-only stats for tests), update(t, dt, { camera }), dispose(),
//   group }

export const meta = {
  name: 'The Maelstrom',
  subtitle: 'A stormy night where the sea swallows itself. The Phantom Galleon waits.',
};

export const palette = {
  skyTop: 0x1d1f4a,
  skyHorizon: 0x6e5aa8,
  sunColor: 0xbfd6ff,
  sunDir: [0.3, 0.7, -0.4],
  sunIntensity: 1.3,
  hemiSky: 0x8a86c8,
  hemiGround: 0x1a2033,
  hemiIntensity: 1.2,
  fogColor: 0x3a3a6a,
  fogNear: 70,
  fogFar: 300,
  waterDeep: 0x153a5c,
  waterShallow: 0x2f7f8f,
  waterFoam: 0xd8f2ff,
  waveAmp: 0.8,
  cloudColor: 0x6a6890,
  cloudShade: 0x34304e,
  cloudCount: 18,
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
const WORLD_R = 140;
const DEG = Math.PI / 180;
const CURRENT = { x: 0, z: 0, r: 75, pull: 3.2, swirl: 2.8, eye: 12, eyeDps: 5 };
const EYE = CURRENT.eye; // eye funnel radius
const DISC = 40; // spiral foam disc radius
const LIP = 0.55; // the eye's rim: just above the highest crest (0.6 x waveAmp)
const FUNNEL_D = 20; // depth of the funnel
const SPIN = 0.1; // rad/s, the disc's rotation.y
const AMP = palette.waveAmp;

// map bearing (degrees clockwise from north) and radius -> x, z
const at = (bearing, r) => ({ x: +(r * Math.sin(bearing * DEG)).toFixed(2), z: +(-r * Math.cos(bearing * DEG)).toFixed(2) });

const PLAYER_START = { x: 0, z: 95, h: Math.PI }; // south rim, facing the whirlpool
const SKULL = at(348, 109);
const LIGHTHOUSE = at(72, 119);
const TEMPLE = at(252, 115); // the colonnade
const SHRINE = at(127, 117); // the arch, with pillars standing in the sea

// the ring of jagged stacks: [bearing, radius, height, base radius, satellites]
const STACKS = [
  [8, 114, 24, 5.5, 2],
  [27, 104, 17, 4.6, 1],
  [46, 118, 27, 6.0, 2],
  [93, 106, 18, 4.8, 1],
  [109, 125, 25, 5.6, 1],
  [148, 108, 16, 4.4, 2],
  [163, 124, 22, 5.2, 1],
  [199, 122, 21, 5.0, 1],
  [214, 103, 15, 4.2, 1],
  [231, 123, 26, 5.8, 2],
  [274, 104, 17, 4.6, 1],
  [292, 121, 28, 6.2, 2],
  [311, 101, 14, 4.0, 1],
  [329, 118, 23, 5.4, 1],
];

// far away: rock teeth on the horizon and the kraken
const KRAKEN = at(301, 262); // between the stacks at 292 and 311

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const linear = (hex) => new THREE.Color(hex); // THREE.Color stores linear values
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A lumpy rock: smooth-normal sphere pushed around by a few sines, flattish bottom. */
function lumpGeo(seed, amp = 0.22, ws = 12, hs = 9) {
  let g = new THREE.SphereGeometry(1, ws, hs);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const r = mulberry32(seed);
  const k = [r() * 6, r() * 6, r() * 6];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    let y = p.getY(i);
    const z = p.getZ(i);
    const n = 1 + amp * (0.6 * Math.sin(x * 2.1 + k[0]) * Math.sin(y * 1.7 + k[1]) + 0.4 * Math.sin(z * 3.3 + k[2] + x * 1.3));
    if (y < -0.35) y = -0.35 + (y + 0.35) * 0.45;
    p.setXYZ(i, x * n, y * n, z * n);
  }
  g.computeVertexNormals();
  return g;
}

// LatheGeometry faces point outwards only when the profile runs bottom to top.
const upward = (pts) => (pts[0][1] > pts[pts.length - 1][1] ? [...pts].reverse() : pts);
function lathe(profile, seg = 16) {
  return new THREE.LatheGeometry(upward(profile).map(([a, b]) => new THREE.Vector2(a, b)), seg);
}

/** A lathe made irregular: radius scaled by a function of the angle and height (craggy rock). */
function wonkyLathe(profile, seg, wobble) {
  let g = lathe(profile, seg);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const k = wobble(Math.atan2(z, x), p.getY(i));
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A jagged sea stack: a few-sided spire with ledges, twisted a little by sines. */
function spireGeo(seed, R, H, sides = 7) {
  const r = mulberry32(seed);
  const k = [r() * 6, r() * 6, r() * 6, 0.5 + r() * 0.5];
  const prof = [
    [R * 1.32, -2.6],
    [R * 1.12, 0.5],
    [R * 1.0, H * 0.15],
    [R * 0.8, H * 0.27],
    [R * 0.86, H * 0.32],
    [R * 0.66, H * 0.46],
    [R * 0.6, H * 0.6],
    [R * 0.45, H * 0.69],
    [R * 0.47, H * 0.73],
    [R * 0.26 * k[3] + R * 0.1, H * 0.87],
    [R * 0.07, H],
    [0, H + 0.01],
  ];
  return wonkyLathe(prof, sides, (a, y) => 1 + 0.2 * Math.sin(a * 2 + k[0] + y * 0.15) + 0.12 * Math.sin(a * 3 + k[1] - y * 0.21) + 0.06 * Math.sin(a * 5 + k[2]));
}

function mesh(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** A tube along `pts` (Vector3) whose radius runs from r0 to r1 (tentacles, cracks). */
function taperTube(pts, r0, r1, radial = 8, segs = 0) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const n = segs || pts.length * 6;
  const g = new THREE.TubeGeometry(curve, n, 1, radial, false);
  const p = g.attributes.position;
  const c = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    curve.getPointAt(u, c);
    const rad = lerp(r0, r1, u);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      p.setXYZ(k, c.x + (p.getX(k) - c.x) * rad, c.y + (p.getY(k) - c.y) * rad, c.z + (p.getZ(k) - c.z) * rad);
    }
  }
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const m = mergeVertices(g);
  m.computeVertexNormals();
  return m;
}

// ---------------------------------------------------------------------------
// The sea's swell on the GPU: scenery.js keeps its wave table private, so this mirrors it (same
// constants, same rounding, as doubloon.js does); checkWaves() verifies the mirror once.
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
    if (Math.abs(h * AMP - waveHeight(x, z, t, AMP)) > 1e-6) {
      console.error('maelstrom.js: SEA_WAVES no longer matches the waves in scenery.js; update the mirror');
      return;
    }
  }
}

// Height of the whirlpool's surface: the swell far out, flattening to the rim of the eye (LIP) near
// it, always at least 0.07 above the sea there. Same formula as the disc's vertex shader.
const swirlW = (r) => smoothstep(EYE + 1.5, EYE + 10, r);
function surfaceY(x, z, t) {
  const w = swirlW(Math.hypot(x - CURRENT.x, z - CURRENT.z));
  return lerp(LIP, waveHeight(x, z, t, AMP) + 0.07, w);
}

// ---------------------------------------------------------------------------
// Shaders (all noOutline; meshes that have normals are skipped by the outline pass)
// ---------------------------------------------------------------------------
const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
const GLSL_COMMON = /* glsl */ `
float hash11(float n) { return fract(sin(n * 127.1 + 31.7) * 43758.5453); }
// 1 inside a band of half width hw around d = 0, anti-aliased over pw (world units per pixel)
float bandAA(float d, float hw, float pw) { return 1.0 - smoothstep(hw - pw, hw + pw, d); }
float stepAA(float e, float x, float w) { return smoothstep(e - w, e + w, x); }
`;

// The spiral disc: rides the swell, flattens up to the rim of the eye.
const DISC_VERT = /* glsl */ `
uniform float uTime;
uniform float uAmp;
varying vec2 vL;
varying float vFogDepth;
${WAVE_GLSL}
void main() {
  vL = position.xz;
  vec4 wp = modelMatrix * vec4(position.x, 0.0, position.z, 1.0);
  float r = length(position.xz);
  float w = smoothstep(${glslNum(EYE + 1.5)}, ${glslNum(EYE + 10)}, r);
  float far = abs(wp.x - cameraPosition.x) + abs(wp.z - cameraPosition.z);
  wp.y = mix(${glslNum(LIP)}, waveH(wp.xz, uTime, uAmp) + 0.07, w) + far * 0.0013;
  vec4 mv = viewMatrix * wp;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const DISC_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uOcean;
uniform vec3 uWater;
uniform vec3 uDark;
uniform vec3 uFoam;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec2 vL;
varying float vFogDepth;
${GLSL_COMMON}
const float TAU = 6.2831853;
const float EYE = ${glslNum(EYE)};
const float DISC = ${glslNum(DISC)};
const float B = 2.6;     // spiral tightness (pitch = atan(1 / B))
const float N = 5.0;     // arms
void main() {
  float r = length(vL);
  float th = atan(vL.y, vL.x);
  float pw = max(length(fwidth(vL)), 1e-3);    // world units per pixel
  float near = 1.0 - smoothstep(60.0, 160.0, vFogDepth);

  // ---- spiral coordinate: constant along an arm; arms appear to flow inward as the disc turns
  float s = th + B * log(max(r, 1.0));
  float u = s * N / TAU;
  float band = fract(u);
  float arm = floor(u);
  float sinA = inversesqrt(1.0 + B * B);
  float period = TAU * r / N * sinA;           // spacing between arms, across them (world units)
  float bw = pw * sqrt(1.0 + B * B) / max(r, 1.0) * N / TAU; // one pixel, in band units

  // painted water: three tones in bands that spiral in, darker toward the eye
  float rin = 1.0 - smoothstep(EYE + 6.0, DISC + 4.0, r);
  vec3 cHi = mix(uOcean, uWater, 0.55 + 0.45 * rin);
  vec3 cMid = mix(uOcean, mix(uWater, uDark, 0.45), 0.4 + 0.6 * rin);
  vec3 cLo = mix(uOcean, uDark, 0.35 + 0.65 * rin);
  float tone = band + 0.06 * sin(r * 0.55 - uTime * 0.6 + arm * 2.1);
  vec3 col = mix(cLo, cMid, stepAA(0.18, tone, bw));
  col = mix(col, cHi, stepAA(0.56, tone, bw));
  col = mix(col, cLo, stepAA(0.86, tone, bw));

  // ---- foam arms: tapering strokes along the leading edge of each band, broken into dashes
  // that slide inward along the arm
  float ha = hash11(mod(arm, N) + 1.0);
  float along = pow(r, 1.35) * 0.075 + uTime * 0.55 + ha * 3.0;
  float dashP = fract(along);
  float dashW = pw * 1.35 * 0.075 * pow(max(r, 1.0), 0.35);
  float dashL = 0.7 + 0.22 * ha;
  float dash = step(dashP, dashL);
  // a brush stroke: swells quickly, then thins to a point
  float sp = dashP / dashL;
  float taper = sqrt(clamp(sp * 6.0, 0.0, 1.0)) * pow(clamp(1.0 - sp, 0.0, 1.0), 0.8);
  float hw = 0.06 + (0.3 + 0.2 * ha) * taper * (1.0 - 0.35 * smoothstep(EYE + 8.0, DISC + 2.0, r));
  float dArm = abs(band - 0.56) * period;
  float foam = bandAA(dArm, hw, pw) * dash;
  // thin second stroke trailing each arm
  float dArm2 = abs(band - 0.3) * period;
  float d2 = fract(along * 1.7 + 0.37);
  foam = max(foam, bandAA(dArm2, 0.14 + 0.1 * taper, pw) * step(d2, 0.5) * (1.0 - smoothstep(EYE + 14.0, DISC, r)) * near);
  foam *= 1.0 - smoothstep(DISC - 3.0, DISC + 4.0, r);

  // ---- near the eye: concentric dashed rings that spin faster the closer they are
  float ringW = 1.45;
  float kq = floor((r - EYE) / ringW);
  float rb = EYE + (kq + 0.5) * ringW;
  float hk = hash11(kq + 3.0);
  float om = 0.75 * pow(EYE / rb, 2.0) * (0.85 + 0.3 * hk);
  float nd = floor(rb * 0.42) + 2.0;
  float ph = fract((th + om * uTime + hk * TAU) * nd / TAU);
  float phW = pw / max(r, 1.0) * nd / TAU;
  float len = 0.42 + 0.3 * hk;
  float rdash = stepAA(0.0, ph, phW) * (1.0 - stepAA(len, ph, phW));
  float rtaper = smoothstep(0.0, 0.3 * len, ph) * (1.0 - smoothstep(0.5 * len, len, ph));
  float rings = bandAA(abs(r - rb), (0.12 + 0.22 * rtaper) * (0.7 + 0.5 * hk), pw) * rdash;
  float innerZone = 1.0 - smoothstep(EYE + 7.0, EYE + 12.0, r);
  foam = max(foam * (1.0 - innerZone * 0.6), rings * innerZone);

  // ---- the churning lip of the eye: a bright, bubbly band of foam
  float wob = 0.35 * sin(th * 9.0 + uTime * 2.2) + 0.25 * sin(th * 17.0 - uTime * 3.1) + 0.2 * sin(th * 5.0 - uTime * 1.3);
  float lip = 1.0 - stepAA(EYE + 1.1 + wob, r, pw);
  // a darker ring of water just outside the lip
  col = mix(col, uDark * 0.8, (1.0 - stepAA(EYE + 2.4 + wob * 0.6, r, pw)) * (1.0 - lip));
  foam = max(foam, lip);

  col = mix(col, uFoam, foam);

  // ---- opacity: the dark water fades out toward the rim; the foam keeps its own edge
  float a = 0.97 * (1.0 - smoothstep(DISC - 12.0, DISC + 5.0, r));
  a = max(a, 1.0 - smoothstep(EYE + 6.0, EYE + 11.0, r));
  a = max(a, foam * 0.95);
  float fogF = smoothstep(fogNear, fogFar, vFogDepth);
  col = mix(col, fogColor, fogF);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;

// The eye: a funnel sinking far below the sea, its streaks spinning faster the deeper they are.
const FUNNEL_VERT = /* glsl */ `
attribute float aDepth;
varying vec2 vL;
varying float vD;
varying vec3 vN;
varying float vFogDepth;
void main() {
  vL = position.xz;
  vD = aDepth;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const FUNNEL_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uWall;
uniform vec3 uDeep;
uniform vec3 uAbyss;
uniform vec3 uFoam;
uniform vec3 uGlow;
uniform vec3 uLight;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec2 vL;
varying float vD;
varying vec3 vN;
varying float vFogDepth;
${GLSL_COMMON}
const float TAU = 6.2831853;
void main() {
  float r = max(length(vL), 0.05);
  float th = atan(vL.y, vL.x);
  float pw = max(length(fwidth(vL)), 1e-3);
  float dw = max(fwidth(vD), 1e-3);
  // cel bands down the throat
  vec3 col = mix(uWall, uDeep, stepAA(1.6, vD + 0.4 * sin(th * 3.0 + uTime), dw));
  col = mix(col, mix(uDeep, uAbyss, 0.55), stepAA(4.5, vD + 0.6 * sin(th * 4.0 - uTime * 1.3), dw));
  col = mix(col, uAbyss, stepAA(8.5, vD, dw));
  // moonlight on the far wall (the funnel is seen from inside: the wall faces -normal)
  float lit = dot(-normalize(vN), uLight);
  col *= mix(0.78, 1.08, stepAA(0.15, lit, 0.04));
  // streaks: helices of foam winding down, in depth bands that spin faster the deeper they are
  float bh = 1.25;
  float kq = floor(vD / bh);
  float hk = hash11(kq + 11.0);
  float om = 0.9 + 0.3 * kq;
  float nd = 7.0 + floor(hk * 4.0);
  float ph = fract((th + om * uTime + vD * 0.35 + hk * TAU) * nd / TAU);
  float phW = pw / r * nd / TAU;
  float len = 0.3 + 0.3 * hk;
  float dash = stepAA(0.0, ph, phW) * (1.0 - stepAA(len, ph, phW));
  float dc = abs(vD - (kq + 0.5) * bh);
  float streak = bandAA(dc, 0.13 + 0.12 * hk, dw * 1.2) * dash;
  float fade = 1.0 - smoothstep(2.0, 10.0, vD);
  col = mix(col, mix(uFoam, uWall, 0.45 + 0.45 * (1.0 - fade)), streak * (0.2 + 0.6 * fade));
  // a ghostly green glow far down the throat
  float g = smoothstep(${glslNum(FUNNEL_D - 9)}, ${glslNum(FUNNEL_D - 1)}, vD);
  col = mix(col, uGlow, g * (0.55 + 0.15 * sin(uTime * 1.7)));
  float fogF = smoothstep(fogNear, fogFar, vFogDepth);
  col = mix(col, fogColor, fogF);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

// Soft round glows, pulled toward the camera so they sit in front of what they light.
const GLOW_VERT = /* glsl */ `
attribute vec4 aGlow;   // half size, intensity, phase, pull towards the camera
attribute vec3 aColor;
uniform float uTime;
varying vec2 vC;
varying vec3 vCol;
varying float vI;
varying float vFogD;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  mv.xyz += normalize(-mv.xyz) * aGlow.w;
  vC = uv * 2.0 - 1.0;
  mv.xy += vC * aGlow.x;
  vCol = aColor;
  vI = aGlow.y * (0.82 + 0.18 * sin(uTime * 2.1 + aGlow.z) * sin(uTime * 3.3 + aGlow.z * 1.7));
  vFogD = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const GLOW_FRAG = /* glsl */ `
uniform float fogNear;
uniform float fogFar;
uniform float uGain;
varying vec2 vC;
varying vec3 vCol;
varying float vI;
varying float vFogD;
void main() {
  float d = length(vC);
  float a = 1.0 - smoothstep(0.0, 1.0, d);
  a = a * a * vI * uGain;
  a *= 1.0 - 0.6 * smoothstep(fogNear, fogFar * 1.3, vFogD);
  a *= smoothstep(2.0, 8.0, vFogD);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol, a);
  #include <colorspace_fragment>
}
`;

// Cartoon flames as camera-facing cards: a teardrop with a pale core and an ink rim.
const FLAME_VERT = /* glsl */ `
attribute vec4 aFl;   // half width, height, phase, unused
uniform float uTime;
varying vec2 vUv2;
varying float vPh;
varying float vFogD;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float f = 1.0 + 0.09 * sin(uTime * 8.0 + aFl.z) + 0.05 * sin(uTime * 13.0 + aFl.z * 2.3);
  mv.x += (uv.x - 0.5) * 2.0 * aFl.x * 1.35;
  mv.y += (uv.y - 0.08) * aFl.y * f;
  vUv2 = uv;
  vPh = aFl.z;
  vFogD = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const FLAME_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uOuter;
uniform vec3 uMid;
uniform vec3 uCore;
uniform vec3 uInk;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec2 vUv2;
varying float vPh;
varying float vFogD;
float flameW(float y) {
  // a round belly low down, tapering to a pointed tip
  float q = (y - 0.3) / 0.3;
  float belly = sqrt(max(0.0, 1.0 - q * q));
  float top = pow(max(0.0, 1.0 - (y - 0.3) / 0.68), 1.25);
  return y < 0.3 ? belly : top;
}
void main() {
  float y = (vUv2.y - 0.08) / 0.92;
  float x = (vUv2.x - 0.5) * 2.0 * 1.35;
  x -= 0.38 * y * y * sin(uTime * 4.5 + vPh + y * 3.0);
  float w = flameW(y) * (1.0 + 0.1 * sin(y * 11.0 - uTime * 9.0 + vPh));
  float d = abs(x) / max(w, 1e-3);
  float fw = max(fwidth(d), 1e-3);
  if (y < 0.0 || y > 1.0 || d > 1.0 + fw) discard;
  vec3 col = uOuter;
  float w2 = flameW(y * 1.3 + 0.02) * 0.62;
  col = mix(col, uMid, 1.0 - smoothstep(w2 - 0.03, w2 + 0.03, abs(x)));
  float w3 = flameW(y * 1.9 + 0.05) * 0.36;
  col = mix(col, uCore, 1.0 - smoothstep(w3 - 0.03, w3 + 0.03, abs(x)));
  col = mix(col, uInk, smoothstep(1.0 - 2.2 * fw, 1.0 - fw, d));
  col = mix(col, fogColor, smoothstep(fogNear, fogFar, vFogD) * 0.7);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

// Rain: thin streaks falling through a box that follows the camera (one InstancedMesh).
const RAIN_VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform vec3 uFall;
varying float vA;
varying float vFogDepth;
void main() {
  vec3 o = instanceMatrix[3].xyz;
  float sp = 0.85 + 0.3 * fract(o.x * 7.31 + o.z * 3.17);
  vec3 p = o + uFall * sp * uTime;
  p = mod(p - uCenter + 0.5 * uBox, uBox) - 0.5 * uBox + uCenter;
  vec3 dir = normalize(uFall);
  vec3 toCam = normalize(cameraPosition - p);
  vec3 side = normalize(cross(dir, toCam));
  float len = 1.3 + 1.1 * fract(o.y * 5.13 + o.x * 0.7);
  vec3 wp = p + dir * position.y * len + side * position.x * 0.055;
  vec3 q = abs(p - uCenter) / (0.5 * uBox);
  float dc = length(cameraPosition - p);
  vA = (1.0 - smoothstep(0.7, 1.0, max(q.x, max(q.y, q.z)))) * smoothstep(4.0, 13.0, dc);
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const RAIN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying float vA;
varying float vFogDepth;
void main() {
  if (vA < 0.01) discard;
  vec3 col = mix(uColor, fogColor, smoothstep(fogNear, fogFar, vFogDepth) * 0.6);
  gl_FragColor = vec4(col, uOpacity * vA);
  #include <colorspace_fragment>
}
`;

// The sky flash: a full-screen tint (drawn last, no depth test).
const OVERLAY_VERT = /* glsl */ `
void main() { gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }
`;
const OVERLAY_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  gl_FragColor = vec4(uColor, uOpacity);
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------
// Lightning: photosensitivity limits (SPEC2 §13)
// ---------------------------------------------------------------------------
export const LIGHTNING = {
  overlayMax: 0.22, // peak sky-flash opacity (the cap is 0.25)
  gap: 3, // at most one sky flash per this many seconds
  boltTime: 0.15, // the bolt is visible this long (one on/off: no flicker)
  boltGap: 0.5, // a strike within this long of the last bolt shows no bolt of its own (no flicker)
  attack: 0.05,
  decay: 0.2, // the sky flash fades exponentially with this time constant
  calmMax: 0.1, // reduced motion: a slow, faint sky tint instead
  calmRise: 0.7,
  calmFall: 1.8,
  // far sheet lightning on the horizon: slow and dim enough (under ~0.06 change in relative
  // luminance) not to be a flash at all, and only when no sky flash happened in the last `gap` s
  stormGain: 0.25,
  stormRise: 0.5,
  stormFall: 1.4,
  calmStormGain: 0.15,
  calmStormRise: 1.0,
  calmStormFall: 2.2,
};

// ---------------------------------------------------------------------------
// build(scene, ctx)
// ---------------------------------------------------------------------------
export function build(scene, ctx = {}) {
  checkWaves();
  const rng = typeof ctx?.rng === 'function' ? ctx.rng : mulberry32(6 * 7919 + 13);
  const root = new THREE.Group();
  root.name = 'env-maelstrom';
  scene.add(root);
  const stat = new THREE.Group(); // static scenery, merged per material at the end
  stat.name = 'maelstrom-static';
  root.add(stat);
  const ownMaterials = [];
  const own = (m) => {
    ownMaterials.push(m);
    return m;
  };
  const ownGeos = [];
  const colliders = [];
  const glows = []; // { x, y, z, size, intensity, color, pull }
  const flames = []; // { x, y, z, w, h }

  // Faceted toon for the jagged rock: lit per face, smooth normals kept for an unbroken ink line.
  const rockRamp = new THREE.DataTexture(new Uint8Array([70, 70, 70, 255, 132, 132, 132, 255, 196, 196, 196, 255, 255, 255, 255, 255]), 4, 1);
  rockRamp.minFilter = rockRamp.magFilter = THREE.NearestFilter;
  rockRamp.generateMipmaps = false;
  rockRamp.needsUpdate = true;
  const faceted = (color, emissive = 0x000000) => {
    const m = own(new THREE.MeshToonMaterial({ color, emissive, gradientMap: rockRamp }));
    m.flatShading = true;
    return setOutline(m, true);
  };
  const M = {
    rockA: faceted(0x4d5596, 0x0c0e22),
    rockB: faceted(0x5a5f9e, 0x0c0e22),
    rockDark: toon(0x2c3062),
    bone: toon(0xe8dcbc),
    socket: toon(0x150f26),
    templeStone: toon(0x8fb0a6),
    templeDark: toon(0x5f8079),
    moss: toon(0x3a7a58),
    bronze: toon(0xb47a3c),
    lhStone: toon(0xb3b0cc),
    lhBand: toon(0x3d3760),
    iron: toon(0x262238),
    wood: toon(0x8a5c3a),
    woodDark: toon(0x5a3a28),
    hull: toon(0x4a3626),
    sail: toon(0xcfc4ad),
    gold: toon(0xffcc44, { emissive: 0x6a4a00, emissiveIntensity: 0.5 }),
    farRock: toon(0x2c2a56),
    kraken: toon(0x4a2f6e),
    krakenBelly: toon(0x7a4f86),
  };
  const greenGlass = own(
    new THREE.MeshToonMaterial({ color: 0x9dffb4, emissive: 0x2fff6a, emissiveIntensity: 0.9, gradientMap: gradientMap(3) }),
  );
  setOutline(greenGlass, true);
  const eyeGlow = own(new THREE.MeshBasicMaterial({ color: 0x8dffa8 }));
  noOutline(eyeGlow);

  // =========================================================================
  // 1. The whirlpool: funnel, lid and spiral disc (one group turning with rotation.y)
  // =========================================================================
  const vortex = new THREE.Group();
  vortex.name = 'maelstrom-vortex';
  vortex.position.set(CURRENT.x, 0, CURRENT.z);
  vortex.userData.keep = true;
  root.add(vortex);
  const timeU = { value: 0 };
  const P = {
    ocean: linear(palette.waterDeep),
    water: linear(0x1e5a7a),
    dark: linear(0x0d1f3c),
    foam: linear(palette.waterFoam),
  };
  const discMat = own(
    new THREE.ShaderMaterial({
      name: 'maelstrom-disc',
      uniforms: {
        ...fogUniforms(),
        uTime: timeU,
        uAmp: { value: AMP },
        uOcean: { value: P.ocean },
        uWater: { value: P.water },
        uDark: { value: P.dark },
        uFoam: { value: P.foam },
      },
      vertexShader: DISC_VERT,
      fragmentShader: DISC_FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
    }),
  );
  noOutline(discMat);
  {
    // polar grid from the lip out past the disc's edge
    const rings = [];
    for (let r = EYE; r < EYE + 12; r += 0.5) rings.push(r);
    for (let r = EYE + 12; r < DISC + 6.01; r += 1.25) rings.push(r);
    const NA = 160;
    const pos = [];
    const index = [];
    for (const r of rings) for (let i = 0; i < NA; i++) pos.push(Math.cos((i / NA) * Math.PI * 2) * r, 0, Math.sin((i / NA) * Math.PI * 2) * r);
    for (let j = 0; j < rings.length - 1; j++) {
      for (let i = 0; i < NA; i++) {
        const a0 = j * NA + i;
        const a1 = j * NA + ((i + 1) % NA);
        index.push(a0, a1, a0 + NA, a1, a1 + NA, a0 + NA);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setIndex(index);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), DISC + 8);
    const disc = new THREE.Mesh(g, discMat);
    disc.name = 'maelstrom-disc';
    disc.renderOrder = 1;
    vortex.add(disc);
  }
  const funnelMat = own(
    new THREE.ShaderMaterial({
      name: 'maelstrom-funnel',
      uniforms: {
        ...fogUniforms(),
        uTime: timeU,
        uWall: { value: linear(0x16486c) },
        uDeep: { value: linear(0x0b1f40) },
        uAbyss: { value: linear(0x040612) },
        uFoam: { value: P.foam },
        uGlow: { value: linear(0x2fbf6a) },
        uLight: { value: new THREE.Vector3(...palette.sunDir).normalize() },
      },
      vertexShader: FUNNEL_VERT,
      fragmentShader: FUNNEL_FRAG,
      side: THREE.BackSide, // the inside of the lathe
      depthTest: false, // painted before the sea; the lid below keeps the sea off it
      depthWrite: false,
      fog: true,
    }),
  );
  noOutline(funnelMat);
  {
    // Profile from the rim down the throat. Triangles are emitted deepest ring first, so with no
    // depth test the shallower walls paint over the deeper ones (painter's order is exact for a
    // funnel whose depth grows toward the axis).
    const prof = [];
    for (let i = 0; i <= 26; i++) {
      const u = i / 26; // 0 at the rim, 1 at the bottom
      const r = EYE * Math.pow(1 - u, 1.15) * (1 - 0.06 * Math.sin(u * Math.PI)) + 2.4 * u * (1 - u);
      const y = LIP - FUNNEL_D * (1 - Math.pow(1 - u, 1.6)) - 1.2 * Math.sin(u * Math.PI * 0.5) * (1 - u);
      prof.push([r, y]);
    }
    const NA = 72;
    const pos = [];
    const nrm = [];
    const depth = [];
    for (let j = 0; j < prof.length; j++) {
      const [r, y] = prof[j];
      const [rp, yp] = prof[Math.max(0, j - 1)];
      const [rn, yn] = prof[Math.min(prof.length - 1, j + 1)];
      // outward normal of the lathe (the interior faces the other way)
      let nx = yp - yn;
      let ny = rn - rp;
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      for (let i = 0; i <= NA; i++) {
        const a = (i / NA) * Math.PI * 2;
        pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
        nrm.push(Math.cos(a) * nx, ny, Math.sin(a) * nx);
        depth.push(LIP - y);
      }
    }
    const index = [];
    for (let j = prof.length - 2; j >= 0; j--) {
      for (let i = 0; i < NA; i++) {
        const a = j * (NA + 1) + i; // upper ring
        const b = a + NA + 1; // lower ring
        // wound so the interior is the back face (side: BackSide draws it)
        index.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
    g.setIndex(index);
    g.computeBoundingSphere();
    const funnel = new THREE.Mesh(g, funnelMat);
    funnel.name = 'maelstrom-funnel';
    funnel.renderOrder = -10; // after the sky (-1000), before the sea
    vortex.add(funnel);
  }
  {
    // the lid: writes depth (no colour) over the eye, so the sea and anything below the rim is
    // not drawn there; a little wider than the eye so no sliver of sea shows at its edge
    const lidMat = own(new THREE.MeshBasicMaterial({ colorWrite: false }));
    noOutline(lidMat);
    const g = new THREE.CircleGeometry(EYE + 0.45, 72);
    g.rotateX(-Math.PI / 2);
    const lid = new THREE.Mesh(g, lidMat);
    lid.name = 'maelstrom-lid';
    lid.position.y = LIP;
    lid.renderOrder = -9;
    vortex.add(lid);
  }

  // =========================================================================
  // 2. The rim: a ring of jagged sea stacks
  // =========================================================================
  const lumps = [11, 23, 37, 41, 59, 71].map((s) => lumpGeo(s, 0.24, 10, 7));
  ownGeos.push(...lumps);
  const lump = (i) => lumps[((i % lumps.length) + lumps.length) % lumps.length];
  const boulderRing = (parent, x, z, R, n, seed, mat = M.rockDark) => {
    const r = mulberry32(seed);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.8;
      const d = R * (0.95 + r() * 0.35);
      const s = 0.9 + r() * 1.5;
      const b = mesh(parent, lump(seed + i), mat, x + Math.cos(a) * d, -0.3, z + Math.sin(a) * d);
      b.scale.set(s * 1.3, s * (0.6 + r() * 0.5), s);
      b.rotation.y = r() * 6;
    }
  };
  STACKS.forEach(([bearing, R, H, base, sats], si) => {
    const r = mulberry32(400 + si * 17);
    const c = at(bearing, R);
    const parts = [{ x: c.x, z: c.z, H, R: base }];
    for (let k = 0; k < sats; k++) {
      // satellites stand beside the main spire, along the rim (tangentially) and a little outward
      const side = k % 2 ? -1 : 1;
      const tang = (bearing + 90) * DEG;
      const d = base + 2.5 + r() * 3;
      let x = c.x + Math.sin(tang) * d * side + Math.sin(bearing * DEG) * (1 + r() * 3);
      let z = c.z - Math.cos(tang) * d * side - Math.cos(bearing * DEG) * (1 + r() * 3);
      // keep the whole ring 95-125 from the centre (SPEC2 §6.6)
      const rr = Math.hypot(x - CURRENT.x, z - CURRENT.z);
      const clampK = Math.min(125, Math.max(97, rr)) / rr;
      x = CURRENT.x + (x - CURRENT.x) * clampK;
      z = CURRENT.z + (z - CURRENT.z) * clampK;
      parts.push({ x, z, H: H * (0.38 + r() * 0.3), R: base * (0.45 + r() * 0.2) });
    }
    parts.forEach((p, pi) => {
      const m = mesh(stat, spireGeo(500 + si * 7 + pi, p.R, p.H, pi ? 6 : 7), pi % 2 ? M.rockB : M.rockA, p.x, 0, p.z);
      m.rotation.set((r() - 0.5) * 0.12, r() * Math.PI * 2, (r() - 0.5) * 0.12);
      colliders.push({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), r: +(p.R * 1.02).toFixed(2), h: +p.H.toFixed(1) });
    });
    boulderRing(stat, c.x, c.z, base + 0.8, 4 + sats, 900 + si * 13);
  });

  // =========================================================================
  // 3. Skull Rock: a sea stack carved like a skull, its green eyes on the whirlpool
  // =========================================================================
  {
    const g = new THREE.Group();
    g.position.set(SKULL.x, 0, SKULL.z);
    g.rotation.y = Math.atan2(CURRENT.x - SKULL.x, CURRENT.z - SKULL.z);
    g.scale.setScalar(1.18);
    stat.add(g);
    // the stack it is carved from: a craggy base, rock shoulders hugging the jaw and the back of
    // the head, a few crusts of rock left on the cranium
    const ped = wonkyLathe(
      [[15, -2.5], [13.6, 1], [12.4, 4.5], [10.8, 8], [9.2, 11], [7, 13.5], [0, 14.5]],
      9,
      (a, y) => 1 + 0.12 * Math.sin(a * 3 + 1.3 + y * 0.2) + 0.07 * Math.sin(a * 5 + 0.4),
    );
    mesh(g, ped, M.rockA, 0, 0, -3.5).scale.set(1, 1, 0.9);
    for (const [sx, sy, sz, w, h, d, seed] of [
      [-8.8, 12.5, -1.5, 5.2, 8.5, 6.5, 3],
      [8.8, 12.5, -1.5, 5.2, 8.5, 6.5, 4],
      [0, 17, -8.5, 10, 12, 6.5, 5],
      [-9.5, 2.2, 6.0, 2.6, 2.2, 2.4, 6],
      [10.2, 1.8, 5.0, 2.8, 2.0, 2.4, 7],
    ]) {
      const sh = mesh(g, lumpGeo(600 + seed, 0.22, 10, 8), M.rockB, sx, sy, sz);
      sh.scale.set(w, h, d);
      sh.rotation.y = seed;
    }
    for (const [cx, cy, cz, k, seed] of [[-6.2, 31, -6.5, 3.6, 8], [4.8, 33.5, -7.5, 3.2, 9], [8.6, 27.5, -6, 2.6, 10]]) {
      const cr2 = mesh(g, lumpGeo(620 + seed, 0.25, 8, 6), M.rockA, cx, cy, cz);
      cr2.scale.set(k * 1.2, k * 0.8, k);
    }
    // cranium, face, brow and cheekbones
    const cr = mesh(g, lumpGeo(77, 0.05, 22, 16), M.bone, 0, 25.6, -1.4);
    cr.scale.set(10.6, 10.2, 11);
    const face = mesh(g, new THREE.SphereGeometry(1, 22, 16), M.bone, 0, 21.2, 4.2);
    face.scale.set(8.7, 7.6, 5.5);
    const brow = mesh(g, new THREE.CapsuleGeometry(1.45, 10.6, 6, 14), M.bone, 0, 25.4, 7.2);
    brow.rotation.z = Math.PI / 2;
    brow.scale.set(1, 1, 0.9);
    for (const sx of [-1, 1]) {
      const ch = mesh(g, new THREE.SphereGeometry(1, 16, 12), M.bone, sx * 5.6, 19.4, 6.2);
      ch.scale.set(2.9, 2.3, 2.6);
      const ramus = mesh(g, new RoundedBoxGeometry(2.2, 5.4, 3.4, 2, 0.9), M.bone, sx * 4.5, 14.4, 2.8);
      ramus.rotation.z = sx * 0.1;
    }
    // jaws, the dark mouth and two rows of teeth
    mesh(g, new RoundedBoxGeometry(9.4, 3.3, 6.2, 3, 1.4), M.bone, 0, 16.4, 5.4);
    const jaw = mesh(g, new RoundedBoxGeometry(8.6, 3.0, 6.4, 3, 1.3), M.bone, 0, 12.4, 5.0);
    jaw.rotation.x = 0.06;
    const chin = mesh(g, new THREE.SphereGeometry(1, 16, 10), M.bone, 0, 11.6, 7.0);
    chin.scale.set(3.6, 2.0, 1.7);
    mesh(g, new RoundedBoxGeometry(7.8, 2.2, 1.4, 2, 0.6), M.socket, 0, 14.3, 7.7);
    const tooth = new RoundedBoxGeometry(1.08, 1.4, 1.0, 2, 0.32);
    for (let i = 0; i < 6; i++) {
      const tx = -3.1 + i * 1.24;
      const tz = 8.35 - 0.055 * tx * tx;
      mesh(g, tooth, M.bone, tx, 14.95, tz);
      mesh(g, tooth, M.bone, tx, 13.55, tz - 0.15).scale.y = 0.9;
    }
    // eye sockets with glowing green eyes, the nose hole
    const eyes = [];
    for (const sx of [-1, 1]) {
      const so = mesh(g, new THREE.SphereGeometry(1, 18, 14), M.socket, sx * 3.7, 22.5, 8.2);
      so.scale.set(2.9, 3.35, 1.8);
      so.rotation.z = sx * -0.2;
      mesh(g, new THREE.SphereGeometry(1.2, 14, 10), eyeGlow, sx * 3.6, 22.2, 9.55);
      eyes.push(new THREE.Vector3(sx * 3.6, 22.2, 10.6));
    }
    {
      const s = new THREE.Shape();
      s.moveTo(0, -1.3);
      s.quadraticCurveTo(0.35, -0.6, 1.05, 0.55);
      s.quadraticCurveTo(1.15, 1.1, 0.55, 1.05);
      s.quadraticCurveTo(0.12, 1.0, 0, 0.6);
      s.quadraticCurveTo(-0.12, 1.0, -0.55, 1.05);
      s.quadraticCurveTo(-1.15, 1.1, -1.05, 0.55);
      s.quadraticCurveTo(-0.35, -0.6, 0, -1.3);
      const ng = new THREE.ExtrudeGeometry(s, { depth: 1.0, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.22, bevelSegments: 2, curveSegments: 6 });
      mesh(g, ng, M.socket, 0, 18.6, 8.7);
    }
    // cracks over the cranium
    const onSkull = (u, v, lift = 1.012) =>
      new THREE.Vector3(Math.cos(v) * Math.sin(u) * 10.6 * lift, 25.6 + Math.sin(v) * 10.2 * lift, -1.4 + Math.cos(v) * Math.cos(u) * 11 * lift);
    for (const crack of [
      [[0.15, 1.35], [0.32, 1.12], [0.22, 0.98], [0.42, 0.82], [0.36, 0.7]],
      [[-0.9, 1.1], [-0.72, 0.92], [-0.86, 0.72], [-0.7, 0.55]],
    ]) {
      mesh(g, taperTube(crack.map(([u, v]) => onSkull(u, v)), 0.32, 0.08, 6), M.socket);
    }
    // barnacles and weed at the waterline
    boulderRing(g, 0, -0.5, 12.8, 7, 77, M.rockDark);
    g.updateMatrixWorld(true);
    for (const e of eyes) {
      const p = e.clone().applyMatrix4(g.matrixWorld);
      glows.push({ x: p.x, y: p.y, z: p.z, size: 6.5, intensity: 0.85, color: 0x5aff86, pull: 2 });
    }
    colliders.push({ x: SKULL.x, z: SKULL.z, r: 15.5, h: 40 });
    // two small stacks flank it
    for (const [db, dr, h, rr] of [[-7, 4, 11, 3.6], [8, -2, 9, 3.2]]) {
      const p = at(348 + db, 109 + dr);
      mesh(stat, spireGeo(1200 + db, rr, h, 6), M.rockB, p.x, 0, p.z).rotation.y = db;
      colliders.push({ x: p.x, z: p.z, r: +(rr * 1.02).toFixed(2), h });
    }
  }

  // =========================================================================
  // 4. The ghostly lighthouse: leaning, cracked, a green flame in its open lantern
  // =========================================================================
  const beams = [];
  {
    const { x, z } = LIGHTHOUSE;
    const isle = mesh(stat, lumpGeo(301, 0.2, 14, 9), M.rockDark, x, -0.6, z);
    isle.scale.set(9.5, 3.4, 8.5);
    boulderRing(stat, x, z, 8.6, 7, 302, M.rockA);
    const tw = new THREE.Group();
    tw.position.set(x, 2.2, z);
    tw.rotation.set(0.04, Math.atan2(-x, -z), -0.07); // leaning, its door toward the arena
    stat.add(tw);
    mesh(tw, lathe([[4.6, -1.4], [4.4, 0.9], [3.7, 1.2]], 14), M.rockA);
    const towerGeo = wonkyLathe([[3.6, 0], [3.4, 5], [3.1, 10], [2.85, 15], [2.75, 18.5]], 14, (a, y) => 1 + 0.025 * Math.sin(a * 3 + y * 0.6));
    mesh(tw, towerGeo, M.lhStone);
    for (const [y0, h] of [[5.5, 1.6], [11.5, 1.6]]) {
      const rr = 3.4 - (y0 / 18.5) * 0.65;
      mesh(tw, new THREE.CylinderGeometry(rr - 0.05 + 0.08, rr + 0.08, h, 14), M.lhBand, 0, y0 + h / 2, 0);
    }
    // the door and two windows, glowing faintly green
    const win = new RoundedBoxGeometry(0.75, 1.15, 0.5, 2, 0.18);
    mesh(tw, new RoundedBoxGeometry(1.4, 2.3, 0.5, 2, 0.3), M.socket, 0, 1.3, 3.45);
    mesh(tw, win, greenGlass, 0, 8.5, 3.18);
    mesh(tw, win, greenGlass, 0, 14.5, 2.95);
    // a crack running up the side
    mesh(tw, taperTube([[2.9, 3, 1.2], [3.1, 5, 0.6], [2.95, 7, 1.0], [2.85, 9, 0.2], [2.8, 10.5, 0.5]].map((v) => new THREE.Vector3(...v)), 0.22, 0.06, 5), M.socket);
    // gallery, railing, lantern posts, roof
    mesh(tw, new THREE.CylinderGeometry(3.6, 3.0, 0.6, 16), M.iron, 0, 18.8, 0);
    for (let k = 0; k < 10; k++) {
      if (k === 3) continue; // a post is missing
      const a = (k / 10) * Math.PI * 2;
      mesh(tw, new THREE.CylinderGeometry(0.11, 0.11, 1.0, 5), M.iron, Math.cos(a) * 3.3, 19.6, Math.sin(a) * 3.3);
    }
    mesh(tw, new THREE.TorusGeometry(3.3, 0.12, 5, 28, Math.PI * 1.55).rotateX(Math.PI / 2), M.iron, 0, 20.1, 0).rotation.y = 0.5;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      mesh(tw, new THREE.CylinderGeometry(0.14, 0.14, 3.0, 6), M.iron, Math.cos(a) * 1.8, 20.6, Math.sin(a) * 1.8);
    }
    mesh(tw, new THREE.CylinderGeometry(2.2, 2.2, 0.3, 14), M.iron, 0, 22.1, 0);
    const roof = mesh(tw, new THREE.ConeGeometry(2.6, 2.8, 12), M.iron, 0, 23.6, 0);
    roof.rotation.z = 0.1;
    mesh(tw, new THREE.SphereGeometry(0.4, 10, 8), M.iron, 0.25, 25.1, 0);
    tw.updateMatrixWorld(true);
    const lamp = new THREE.Vector3(0, 19.3, 0).applyMatrix4(tw.matrixWorld);
    flames.push({ x: lamp.x, y: lamp.y, z: lamp.z, w: 1.2, h: 3.0 });
    const halo = new THREE.Vector3(0, 20.8, 0).applyMatrix4(tw.matrixWorld);
    glows.push({ x: halo.x, y: halo.y, z: halo.z, size: 10, intensity: 0.75, color: 0x46ff7a, pull: 3 });
    for (const wy of [8.5, 14.5]) {
      const p = new THREE.Vector3(0, wy, 3.6).applyMatrix4(tw.matrixWorld);
      glows.push({ x: p.x, y: p.y, z: p.z, size: 2.4, intensity: 0.5, color: 0x5aff8a, pull: 0.6 });
    }
    // the beam: two soft shafts of pale green light sweeping round (additive)
    const beamGeo = (() => {
      const L = 46;
      const parts = [];
      for (const dir of [1, -1]) {
        const c = new THREE.CylinderGeometry(3.6, 0.9, L, 18, 4, true);
        c.translate(0, -L / 2 - 1.2, 0);
        c.rotateZ((dir * Math.PI) / 2);
        c.rotateZ(dir * -0.07);
        parts.push(c.toNonIndexed());
        c.dispose();
      }
      const gg = mergeGeometries(parts, false);
      for (const p of parts) p.dispose();
      const pos = gg.attributes.position;
      const colors = new Float32Array(pos.count * 4);
      for (let i = 0; i < pos.count; i++) {
        const t = Math.min(1, Math.max(0, Math.abs(pos.getX(i)) - 1.2) / L);
        colors.set([0.36, 0.95, 0.55, 0.26 * Math.pow(1 - t, 1.5) * Math.min(1, t * 12 + 0.25)], i * 4);
      }
      gg.setAttribute('color', new THREE.BufferAttribute(colors, 4));
      return gg;
    })();
    const beamMat = own(
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true, blending: THREE.AdditiveBlending }),
    );
    noOutline(beamMat);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.copy(new THREE.Vector3(0, 20.6, 0).applyMatrix4(tw.matrixWorld));
    beam.userData.keep = true;
    beam.renderOrder = 3;
    root.add(beam);
    beams.push(beam);
    colliders.push({ x, z, r: 9, h: 26 });
  }

  // =========================================================================
  // 5. The sunken temple: a colonnade on the west islet, an arch on the south-east one
  // =========================================================================
  const fluted = (r, h, seed) =>
    wonkyLathe([[r * 1.08, 0], [r, 0.4], [r * 0.93, h * 0.5], [r * 0.86, h - 0.2], [r * 0.9, h]], 16, (a, y) => 1 + 0.045 * Math.cos(a * 8) + 0.01 * Math.sin(y * 3 + seed));
  const brokenTop = (r, seed) => {
    const rr = mulberry32(seed);
    const k = [rr() * 6, 0.25 + rr() * 0.35];
    // a snapped-off top: a slanted, jagged break, not a point
    let g = lathe([[r * 0.89, 0], [r * 0.86, 0.35], [r * 0.5, 0.42], [0, 0.45]], 9);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g = mergeVertices(g);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const a = Math.atan2(z, x);
      const jag = 0.35 * Math.sin(a * 5 + k[0]) + 0.25 * Math.sin(a * 3 - k[0]);
      p.setY(i, p.getY(i) + (x / r) * k[1] * 1.6 + (p.getY(i) > 0.3 ? jag : 0));
    }
    g.computeVertexNormals();
    return g;
  };
  const column = (parent, x, y, z, h, { broken = false, seed = 1 } = {}) => {
    const r = 0.85;
    mesh(parent, new THREE.CylinderGeometry(r * 1.35, r * 1.45, 0.6, 12), M.templeStone, x, y + 0.3, z);
    mesh(parent, fluted(r, h, seed), M.templeStone, x, y + 0.6, z).rotation.y = seed;
    if (broken) mesh(parent, brokenTop(r, seed), M.templeStone, x, y + 0.6 + h, z);
    else {
      mesh(parent, new THREE.CylinderGeometry(r * 1.4, r * 0.95, 0.6, 12), M.templeStone, x, y + 0.9 + h, z);
      mesh(parent, new RoundedBoxGeometry(2.6, 0.55, 2.6, 2, 0.15), M.templeStone, x, y + 1.45 + h, z);
    }
    // a skirt of moss at the foot
    const mo = mesh(parent, lump(seed + 2), M.moss, x + 0.3, y + 0.35, z + 0.2);
    mo.scale.set(1.5, 0.35, 1.3);
  };
  const brazier = (parent, x, y, z) => {
    mesh(parent, new THREE.CylinderGeometry(0.75, 0.95, 0.4, 10), M.bronze, x, y + 0.2, z);
    mesh(parent, new THREE.CylinderGeometry(0.22, 0.3, 1.7, 8), M.bronze, x, y + 1.25, z);
    mesh(parent, lathe([[0.25, 0], [0.95, 0.15], [1.35, 0.55], [1.45, 0.85], [1.25, 0.85], [0.9, 0.5], [0.2, 0.4]], 14), M.bronze, x, y + 2.05, z);
    parent.updateMatrixWorld(true);
    const f = new THREE.Vector3(x, y + 2.4, z).applyMatrix4(parent.matrixWorld);
    flames.push({ x: f.x, y: f.y + 0.3, z: f.z, w: 1.05, h: 3.0 });
    glows.push({ x: f.x, y: f.y + 1.4, z: f.z, size: 5.5, intensity: 0.7, color: 0x46ff7a, pull: 1.5 });
  };
  // a rocky islet whose local +z faces the whirlpool
  const islet = (c, R, seed) => {
    const g = new THREE.Group();
    g.position.set(c.x, 0, c.z);
    g.rotation.y = Math.atan2(CURRENT.x - c.x, CURRENT.z - c.z);
    stat.add(g);
    const isle = mesh(g, lumpGeo(seed, 0.16, 16, 9), M.rockDark, 0, -0.9, 0);
    isle.scale.set(R, 3.4, R * 0.82);
    boulderRing(g, 0, 0, R * 0.9, 8, seed + 1, M.rockA);
    return g;
  };
  {
    // the colonnade: a stepped platform, standing and broken columns, a lintel, a fallen column
    const g = islet(TEMPLE, 12, 501);
    const steps = [[16, 11], [14.2, 9.4], [12.4, 7.8]];
    steps.forEach(([w, d], i) => mesh(g, new RoundedBoxGeometry(w, 0.85, d, 2, 0.2), i % 2 ? M.templeDark : M.templeStone, 0, 1.1 + i * 0.8, 0));
    const top = 1.1 + 2 * 0.8 + 0.42;
    const cols = [
      [-4.6, -2.4, 9.2, false], [-1.55, -2.4, 9.2, false], [1.55, -2.4, 4.2, true], [4.6, -2.4, 9.2, false],
      [-4.6, 2.4, 2.6, true], [4.6, 2.4, 6.0, true],
    ];
    cols.forEach(([cx, cz, h, broken], i) => column(g, cx, top, cz, h, { broken, seed: 10 + i }));
    // the lintel across the two standing columns on the left, and a cracked block on the right
    mesh(g, new RoundedBoxGeometry(5.6, 1.15, 2.3, 2, 0.25), M.templeStone, -3.1, top + 9.2 + 2.25, -2.4);
    const blk = mesh(g, new RoundedBoxGeometry(2.6, 1.1, 2.3, 2, 0.25), M.templeDark, 4.4, top + 9.2 + 2.2, -2.4);
    blk.rotation.z = 0.08;
    // a fallen column lies across the steps, broken in two
    const fall = mesh(g, fluted(0.85, 6.5, 3), M.templeStone, 1.2, top + 0.2, 2.4);
    fall.rotation.set(0, 0.3, Math.PI / 2 - 0.12);
    const fall2 = mesh(g, fluted(0.85, 3.2, 4), M.templeStone, -6.4, 1.9, 4.6);
    fall2.rotation.set(0.2, -0.5, Math.PI / 2 + 0.25);
    brazier(g, -6.8, top - 0.1, 4.6);
    brazier(g, 6.8, top - 0.1, 4.6);
    // moss on the steps
    for (const [mx, mz, s] of [[-5.5, -4.5, 1.6], [6.0, -3.6, 1.2], [-2.0, 4.6, 1.0]]) {
      const mo = mesh(g, lump(Math.round(mx * 3)), M.moss, mx, 2.4, mz);
      mo.scale.set(s * 1.4, 0.35, s);
    }
    colliders.push({ x: TEMPLE.x, z: TEMPLE.z, r: 12, h: 14 });
  }
  {
    // the shrine: an arch with a pediment and a brazier, and pillars standing in the sea around it
    const g = islet(SHRINE, 8.5, 611);
    mesh(g, new RoundedBoxGeometry(9.5, 0.8, 6.5, 2, 0.2), M.templeStone, 0, 1.3, 0);
    const top = 1.72;
    column(g, -2.9, top, -0.8, 7.2, { seed: 21 });
    column(g, 2.9, top, -0.8, 7.2, { seed: 22 });
    mesh(g, new RoundedBoxGeometry(8.4, 1.1, 2.3, 2, 0.25), M.templeStone, 0, top + 7.2 + 2.2, -0.8);
    {
      const s = new THREE.Shape();
      s.moveTo(-4.0, 0);
      s.lineTo(4.0, 0);
      s.lineTo(0, 2.3);
      s.lineTo(-4.0, 0);
      const pg = new THREE.ExtrudeGeometry(s, { depth: 1.6, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 1 });
      mesh(g, pg, M.templeDark, 0, top + 7.2 + 2.75, -1.6);
    }
    brazier(g, 0, top - 0.1, 1.8);
    colliders.push({ x: SHRINE.x, z: SHRINE.z, r: 8.5, h: 12 });
    // sunken pillars in the sea nearby (small colliders)
    for (const [db, dr, h, broken] of [[-9, 2, 5.5, true], [-12, -7, 3.2, true], [8, 4, 7.5, false]]) {
      const p = at(127 + db, 117 + dr);
      column(stat, p.x, -0.6, p.z, h, { broken, seed: 40 + db });
      colliders.push({ x: p.x, z: p.z, r: 1.6, h: h + 1 });
    }
  }

  // =========================================================================
  // 6. Far away: rock teeth round the edge of the world and a kraken in the haze
  // =========================================================================
  {
    const r = mulberry32(77);
    for (let i = 0; i < 16; i++) {
      const b = (i / 16) * 360 + r() * 12;
      if (Math.abs(((b - 301 + 540) % 360) - 180) < 14) continue; // leave the kraken clear
      const p = at(b, 235 + r() * 90);
      const H = 30 + r() * 40;
      const m = mesh(stat, spireGeo(2000 + i, 7 + r() * 6, H, 6), M.farRock, p.x, -1, p.z);
      m.rotation.set((r() - 0.5) * 0.2, r() * 6, (r() - 0.5) * 0.2);
      if (r() < 0.6) {
        const m2 = mesh(stat, spireGeo(2100 + i, 4 + r() * 3, H * 0.55, 6), M.farRock, p.x + 12 * (r() - 0.5) + 8, -1, p.z + 12 * (r() - 0.5));
        m2.rotation.y = r() * 6;
      }
    }
  }
  const kraken = new THREE.Group();
  {
    kraken.position.set(KRAKEN.x, 0, KRAKEN.z);
    kraken.rotation.y = Math.atan2(-KRAKEN.x, -KRAKEN.z);
    kraken.scale.setScalar(1.25);
    const head = mesh(kraken, lumpGeo(808, 0.08, 18, 12), M.kraken, 0, 3, -8);
    head.scale.set(17, 21, 15);
    for (const sx of [-1, 1]) {
      const e = mesh(kraken, new THREE.SphereGeometry(2.4, 12, 9), M.krakenBelly, sx * 8.5, 9, 4.2);
      e.scale.set(1, 0.8, 0.7);
      mesh(kraken, new THREE.SphereGeometry(1.3, 10, 8), M.socket, sx * 8.7, 9.2, 5.6).scale.set(1, 0.5, 0.6);
    }
    const arms = [
      [-26, 0, [[0, 0, 0], [-4, 14, 3], [-2, 28, 2], [6, 36, 0], [12, 33, -1], [10, 27, -2]], 3.8],
      [-14, 6, [[0, 0, 0], [-2, 12, 4], [2, 22, 5], [-3, 30, 3], [-10, 31, 1]], 3.2],
      [16, 5, [[0, 0, 0], [3, 16, 4], [0, 30, 4], [-6, 38, 2], [-11, 35, 0], [-8, 30, -1]], 3.6],
      [28, -2, [[0, 0, 0], [5, 10, 2], [10, 18, 0], [16, 21, -2]], 3.0],
      [-34, -6, [[0, 0, 0], [-6, 7, 0], [-13, 11, -2]], 2.6],
    ];
    for (const [ax, az, pts, r0] of arms) {
      const v = pts.map(([x, y, z]) => new THREE.Vector3(ax + x, y - 1.5, az + z));
      mesh(kraken, taperTube(v, r0, 0.35, 9, pts.length * 8), M.kraken);
    }
    mergeStatic(kraken);
    kraken.userData.keep = true;
    root.add(kraken);
  }

  // =========================================================================
  // 7. Wreckage circling in the current, bobbing on the swell (all of it one mesh, moved on the CPU)
  // =========================================================================
  const debris = [];
  {
    const barrel = lathe([[0, -0.75], [0.48, -0.75], [0.6, -0.3], [0.64, 0], [0.6, 0.3], [0.48, 0.75], [0, 0.75]], 12);
    const hoop = new THREE.TorusGeometry(0.62, 0.07, 5, 14);
    const crate = new RoundedBoxGeometry(1.4, 1.2, 1.4, 2, 0.16);
    const plank = new RoundedBoxGeometry(3.4, 0.28, 0.75, 2, 0.12);
    // Every piece is baked to vertex colours and all of them share ONE mesh whose vertices are moved on the
    // CPU each frame (a few thousand): 1 draw call (2 with its ink line) for the whole flotsam instead of 20.
    const piece = (build) => {
      const g = new THREE.Group();
      build(g);
      mergeStatic(g);
      g.updateMatrixWorld(true);
      const parts = [];
      for (const m of g.children) {
        if (!m.isMesh) continue;
        const geo = m.geometry;
        const c = m.material.color.clone();
        // (the chest's gold lock glows: bake its glow in)
        if (m.material.emissive && m.material.emissiveIntensity > 0) c.add(m.material.emissive.clone().multiplyScalar(m.material.emissiveIntensity * 0.6));
        parts.push({ geo, color: c, matrix: m.matrixWorld.clone() });
      }
      return parts;
    };
    const makeBarrel = () =>
      piece((g) => {
        mesh(g, barrel, M.wood).rotation.z = Math.PI / 2;
        for (const hx of [-0.42, 0.42]) mesh(g, hoop, M.wood, hx, 0, 0).rotation.y = Math.PI / 2;
      });
    const makeCrate = () => piece((g) => mesh(g, crate, M.wood));
    const makePlank = () => piece((g) => mesh(g, plank, M.woodDark));
    const makeMast = () =>
      piece((g) => {
        mesh(g, new THREE.CylinderGeometry(0.28, 0.34, 7.5, 8), M.woodDark).rotation.z = Math.PI / 2;
        const yard = mesh(g, new THREE.CylinderGeometry(0.16, 0.16, 4.4, 7), M.woodDark, 1.4, 0.2, 0);
        yard.rotation.x = Math.PI / 2;
        const s = new THREE.Shape();
        const pts = [[-2.0, 0], [2.0, 0], [1.8, -1.2], [1.3, -2.2], [0.7, -1.5], [0.1, -2.5], [-0.6, -1.6], [-1.3, -2.1], [-2.0, -1.0], [-2.0, 0]];
        s.moveTo(...pts[0]);
        for (const q of pts.slice(1)) s.lineTo(...q);
        const sg = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1 });
        const sail = mesh(g, sg, M.sail, 1.4, 0.15, 0);
        sail.rotation.set(-Math.PI / 2 + 0.15, 0, Math.PI / 2);
      });
    const makeBoat = () =>
      piece((g) => {
        // a capsized rowboat, keel up
        const hullG = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const hp = hullG.attributes.position;
        for (let i = 0; i < hp.count; i++) {
          const zz = hp.getZ(i);
          // pinch the ends into a bow and a narrower transom
          hp.setXYZ(i, hp.getX(i) * 1.25 * (1 - 0.55 * zz * zz * (zz > 0 ? 1.2 : 0.7)), hp.getY(i) * 0.75, zz * 2.6);
        }
        hullG.computeVertexNormals();
        mesh(g, hullG, M.hull, 0, -0.1, 0);
        mesh(g, new THREE.CylinderGeometry(0.1, 0.1, 5.0, 6), M.hull, 0, 0.7, 0).rotation.x = Math.PI / 2;
      });
    const makeChest = () =>
      piece((g) => {
        mesh(g, new RoundedBoxGeometry(1.5, 0.9, 1.0, 2, 0.12), M.wood);
        mesh(g, new THREE.CylinderGeometry(0.5, 0.5, 1.5, 12, 1, false, 0, Math.PI), M.wood, 0, 0.45, 0).rotation.z = Math.PI / 2;
        mesh(g, new RoundedBoxGeometry(0.3, 0.35, 0.12, 1, 0.05), M.gold, 0, 0.35, 0.52);
      });
    // eight pieces in one vertex-coloured toon mesh (2 draw calls with its ink line)
    const makers = [makeBarrel, makeMast, makeCrate, makeBarrel, makePlank, makeBoat, makeChest, makeCrate];
    const pieces = makers.map((make) => make());
    let nv = 0;
    let ni = 0;
    for (const parts of pieces) for (const q of parts) {
      nv += q.geo.attributes.position.count;
      ni += q.geo.index ? q.geo.index.count : q.geo.attributes.position.count;
    }
    const base = new Float32Array(nv * 3);
    const baseN = new Float32Array(nv * 3);
    const col = new Float32Array(nv * 3);
    const idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
    const ranges = []; // per piece: [first vertex, vertex count]
    const tv = new THREE.Vector3();
    const nm = new THREE.Matrix3();
    let v0 = 0;
    let i0 = 0;
    for (const parts of pieces) {
      const first = v0;
      for (const q of parts) {
        const pos = q.geo.attributes.position;
        const nor = q.geo.attributes.normal;
        nm.getNormalMatrix(q.matrix);
        for (let k = 0; k < pos.count; k++) {
          tv.fromBufferAttribute(pos, k).applyMatrix4(q.matrix).toArray(base, (v0 + k) * 3);
          tv.fromBufferAttribute(nor, k).applyMatrix3(nm).normalize().toArray(baseN, (v0 + k) * 3);
          q.color.toArray(col, (v0 + k) * 3);
        }
        if (q.geo.index) for (let k = 0; k < q.geo.index.count; k++) idx[i0 + k] = q.geo.index.getX(k) + v0;
        else for (let k = 0; k < pos.count; k++) idx[i0 + k] = v0 + k;
        i0 += q.geo.index ? q.geo.index.count : pos.count;
        v0 += pos.count;
        q.geo.dispose();
      }
      ranges.push([first, v0 - first]);
    }
    const flot = new THREE.BufferGeometry();
    flot.setAttribute('position', new THREE.BufferAttribute(new Float32Array(base), 3).setUsage(THREE.DynamicDrawUsage));
    flot.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(baseN), 3).setUsage(THREE.DynamicDrawUsage));
    flot.setAttribute('color', new THREE.BufferAttribute(col, 3));
    flot.setIndex(new THREE.BufferAttribute(idx, 1));
    ownGeos.push(flot);
    const flotMat = own(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(3) }));
    setOutline(flotMat, true);
    const flotMesh = new THREE.Mesh(flot, flotMat);
    flotMesh.name = 'maelstrom-wreckage';
    flotMesh.frustumCulled = false; // the pieces move every frame (and the eye swallows some)
    flotMesh.userData.keep = true;
    root.add(flotMesh);
    makers.forEach((make, i) => {
      const r0 = 18 + ((i * 29) % 42);
      debris.push({ range: ranges[i], m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), r: r0, th: (i / makers.length) * Math.PI * 2 + rng() * 0.4, sink: 0, spin: (rng() - 0.5) * 0.6, ph: rng() * 6, yaw: rng() * 6 });
    });
    debris.geo = flot;
    debris.base = base;
    debris.baseN = baseN;
  }

  // =========================================================================
  // 8. Foam spray churning round the lip of the eye (instanced puffs with an ink hull)
  // =========================================================================
  const spray = buildSpray(ownMaterials, ownGeos, 44);
  root.add(spray.mesh, spray.hull);

  // =========================================================================
  // 9. Glows and flames
  // =========================================================================
  const glow = buildGlows(glows, ownMaterials, THREE.AdditiveBlending, 'maelstrom-glows');
  root.add(glow.mesh);
  const flame = buildFlames(flames, ownMaterials);
  root.add(flame.mesh);

  // =========================================================================
  // 10. Rain
  // =========================================================================
  const rain = buildRain(ownMaterials, ownGeos, 300, rng);
  root.add(rain.mesh);

  // =========================================================================
  // 11. Lightning: bolt meshes, strike ring, a light, the sky flash and far storm glows
  // =========================================================================
  const bolts = [0, 1, 2].map((i) => boltGeometries(mulberry32(31 + i * 7)));
  for (const b of bolts) ownGeos.push(b.core, b.glow);
  const boltCoreMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true }));
  const boltGlowMat = own(
    new THREE.MeshBasicMaterial({ color: 0x8fb8ff, fog: false, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  noOutline(boltCoreMat);
  noOutline(boltGlowMat);
  const boltCore = new THREE.Mesh(bolts[0].core, boltCoreMat);
  const boltGlow = new THREE.Mesh(bolts[0].glow, boltGlowMat);
  const bolt = new THREE.Group();
  bolt.name = 'maelstrom-bolt';
  bolt.add(boltCore, boltGlow);
  boltCore.renderOrder = 7;
  boltGlow.renderOrder = 8;
  bolt.visible = false;
  bolt.userData.keep = true;
  root.add(bolt);
  const farBolt = new THREE.Mesh(bolts[1].core, own(new THREE.MeshBasicMaterial({ color: 0xc8d8ff, fog: false, transparent: true, opacity: 0.5 })));
  noOutline(farBolt.material);
  farBolt.visible = false;
  farBolt.renderOrder = 2;
  root.add(farBolt);
  const ringMat = own(new THREE.MeshBasicMaterial({ color: 0xdfeaff, transparent: true, opacity: 0, depthWrite: false, fog: true }));
  noOutline(ringMat);
  const strikeRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2), ringMat);
  ownGeos.push(strikeRing.geometry);
  strikeRing.visible = false;
  strikeRing.renderOrder = 3;
  root.add(strikeRing);
  const strikeGlow = buildGlows([{ x: 0, y: 0, z: 0, size: 9, intensity: 1, color: 0xbfd6ff, pull: 2 }], ownMaterials, THREE.AdditiveBlending, 'maelstrom-strike-glow');
  strikeGlow.mesh.visible = false;
  root.add(strikeGlow.mesh);
  const stormGlow = buildGlows([{ x: 0, y: 0, z: 0, size: 70, intensity: 1, color: 0x9a8cff, pull: 0 }], ownMaterials, THREE.AdditiveBlending, 'maelstrom-storm-glow');
  stormGlow.mesh.visible = false;
  root.add(stormGlow.mesh);
  const flashLight = new THREE.PointLight(0xd0e0ff, 0, 95, 1.6);
  flashLight.position.set(0, -50, 0);
  root.add(flashLight);
  const overlayMat = own(
    new THREE.ShaderMaterial({
      name: 'maelstrom-sky-flash',
      uniforms: { uColor: { value: linear(0xdce6ff) }, uOpacity: { value: 0 } },
      vertexShader: OVERLAY_VERT,
      fragmentShader: OVERLAY_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
    }),
  );
  noOutline(overlayMat);
  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), overlayMat);
  ownGeos.push(overlay.geometry);
  overlay.name = 'maelstrom-sky-flash';
  overlay.frustumCulled = false;
  overlay.renderOrder = 10000;
  overlay.visible = false;
  root.add(overlay);

  // =========================================================================
  // merge the static scenery
  // =========================================================================
  mergeStatic(stat);

  // =========================================================================
  // spawns
  // =========================================================================
  const playerStart = { ...PLAYER_START };
  const enemySpawns = computeSpawns(colliders, playerStart);
  const current = { ...CURRENT };

  // ---- lightning state (visual time) ----
  const reduced = () => {
    if (typeof ctx?.reducedMotion === 'function') return !!ctx.reducedMotion();
    if (typeof ctx?.reducedMotion === 'boolean') return ctx.reducedMotion;
    try {
      return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    } catch {
      return false;
    }
  };
  const L = LIGHTNING;
  const pending = [];
  const strike = { active: false, t0: 0, x: 0, z: 0, calm: false, sky: false };
  const sky = { t0: -1e9, calm: false, last: -1e9 };
  const stats = { strikes: 0, skyFlashes: 0, skipped: 0, overlay: 0, maxOverlay: 0 };
  const storm = { next: 7, t0: -1e9, x: 0, y: 0, z: 0, bolt: false };
  let now = 0;
  let disposed = false;

  function flash(x, z) {
    if (disposed || !finite(x) || !finite(z)) return;
    if (pending.length < 4) pending.push({ x, z });
  }

  function startStrike(x, z) {
    const calm = reduced();
    // visual time never runs backwards in the game; if it does (a new clock), forget the past
    if (now < sky.last || now < strike.t0) {
      sky.last = -1e9;
      strike.t0 = -1e9;
    }
    if (strike.active && now - strike.t0 < L.boltGap) {
      stats.skipped++;
      return;
    }
    strike.active = true;
    strike.t0 = now;
    strike.x = x;
    strike.z = z;
    strike.calm = calm;
    stats.strikes++;
    const v = bolts[stats.strikes % bolts.length];
    boltCore.geometry = v.core;
    boltGlow.geometry = v.glow;
    bolt.position.set(x, 0, z);
    bolt.rotation.y = (stats.strikes * 2.39996) % (Math.PI * 2);
    // the sky flash and the light are the "flash": at most one per L.gap seconds
    strike.sky = now - sky.last >= L.gap;
    if (strike.sky) {
      sky.last = now;
      sky.t0 = now;
      sky.calm = calm;
      stats.skyFlashes++;
    } else stats.skipped++;
    flashLight.position.set(x, 16, z);
  }

  // sky-flash opacity at time `age` after its start: one smooth pulse, never a strobe
  function skyOpacity(age, calm) {
    if (age < 0) return 0;
    if (calm) {
      const up = smoothstep(0, L.calmRise, age);
      const down = 1 - smoothstep(L.calmRise, L.calmRise + L.calmFall, age);
      return L.calmMax * Math.min(up, down);
    }
    if (age < L.attack) return L.overlayMax * (age / L.attack);
    const v = L.overlayMax * Math.exp(-(age - L.attack) / L.decay);
    return v < 0.004 ? 0 : v;
  }

  const fwd = new THREE.Vector3();
  function update(t, dt, frame) {
    if (disposed) return;
    const step = finite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
    now = finite(t) ? t : now + step;
    timeU.value = now;
    vortex.rotation.y = now * SPIN;
    glow.material.uniforms.uTime.value = now;
    flame.material.uniforms.uTime.value = now;
    rain.material.uniforms.uTime.value = now;
    for (const b of beams) b.rotation.y = now * 0.6;
    greenGlass.emissiveIntensity = 0.75 + 0.25 * Math.sin(now * 2.3) * Math.sin(now * 0.7 + 1);
    kraken.position.y = -1.5 + 1.2 * Math.sin(now * 0.25);
    kraken.rotation.z = 0.04 * Math.sin(now * 0.31);

    // rain follows the camera, centred a little ahead of it
    const cam = frame?.camera;
    if (cam?.position) {
      cam.getWorldDirection(fwd);
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
      fwd.normalize();
      rain.material.uniforms.uCenter.value.set(cam.position.x + fwd.x * 14, Math.max(8, cam.position.y * 0.6 + 4), cam.position.z + fwd.z * 14);
    }

    spray.update(now);
    updateDebris(now, step);

    // ---- lightning ----
    while (pending.length) {
      const p = pending.shift();
      startStrike(p.x, p.z);
    }
    if (strike.active) {
      const age = now - strike.t0;
      let a;
      if (strike.calm) a = smoothstep(0, 0.12, age) * (1 - smoothstep(0.25, 0.6, age));
      else a = age < L.boltTime ? 1 : 0;
      bolt.visible = a > 0;
      boltCoreMat.opacity = a;
      boltGlowMat.opacity = 0.5 * a;
      // the strike ring spreads out over the sea
      const ra = clamp01(age / 0.7);
      strikeRing.visible = ra < 1;
      strikeRing.position.set(strike.x, waveHeight(strike.x, strike.z, now, AMP) + 0.15, strike.z);
      strikeRing.scale.setScalar(1 + ra * 6);
      ringMat.opacity = 0.85 * (1 - ra) * (1 - ra);
      strikeGlow.mesh.visible = age < 0.5;
      strikeGlow.mesh.position.set(strike.x, 1.5, strike.z);
      strikeGlow.material.uniforms.uGain.value = strike.calm ? 0.5 * Math.max(0, 1 - age / 0.5) : Math.max(0, 1 - age / 0.35);
      if (age > 1.2) strike.active = false;
    } else {
      bolt.visible = false;
      strikeRing.visible = false;
      strikeGlow.mesh.visible = false;
    }
    const op = skyOpacity(now - sky.t0, sky.calm);
    overlayMat.uniforms.uOpacity.value = op;
    overlay.visible = op > 0;
    stats.overlay = op;
    if (op > stats.maxOverlay) stats.maxOverlay = op;
    flashLight.intensity = op > 0 ? (op / L.overlayMax) * (sky.calm ? 900 : 2600) : 0;

    // ---- far storm: slow sheet lightning in the clouds on the horizon (never near a sky flash) ----
    if (storm.next - now > 30) storm.next = now + 7; // the clock jumped back
    if (now >= storm.next) {
      const quiet = now - sky.last >= L.gap && (!strike.active || now - strike.t0 > 1.2);
      if (quiet) {
        const b = rng() * Math.PI * 2;
        const d = 220 + rng() * 90;
        storm.t0 = now;
        storm.x = CURRENT.x + Math.sin(b) * d;
        storm.z = CURRENT.z + Math.cos(b) * d;
        storm.y = 38 + rng() * 25;
        storm.bolt = !reduced() && rng() < 0.6;
        stormGlow.mesh.position.set(storm.x, storm.y, storm.z);
        farBolt.geometry = bolts[(stats.strikes + 1 + Math.floor(rng() * 3)) % 3].core;
        farBolt.position.set(storm.x, -2, storm.z);
        farBolt.scale.set(1.4, (storm.y + 2) / 75, 1.4);
        farBolt.rotation.y = rng() * 6;
      }
      storm.next = now + 7 + rng() * 9;
    }
    {
      const age = now - storm.t0;
      const calm = reduced();
      const rise = calm ? L.calmStormRise : L.stormRise;
      const fall = calm ? L.calmStormFall : L.stormFall;
      const g = age < 0 ? 0 : Math.min(smoothstep(0, rise, age), 1 - smoothstep(rise, rise + fall, age)) * (calm ? L.calmStormGain : L.stormGain);
      stormGlow.mesh.visible = g > 0.01;
      stormGlow.material.uniforms.uGain.value = g;
      farBolt.visible = storm.bolt && age >= 0 && age < 0.15;
    }
  }

  const _dn = new THREE.Matrix3();
  const _dv = new THREE.Vector3();
  const _one = new THREE.Vector3(1, 1, 1);
  function updateDebris(t, dt) {
    const pos = debris.geo.attributes.position.array;
    const nor = debris.geo.attributes.normal.array;
    for (const d of debris) {
      const k = Math.max(0, 1 - d.r / CURRENT.r);
      if (d.sink > 0) {
        // swallowed by the eye: spin down, then bob up again far out
        d.sink += dt;
        if (d.sink > 3.5) {
          d.sink = 0;
          d.r = 52 + rng() * 14;
          d.th = rng() * Math.PI * 2;
          d.rise = 1;
        }
      } else {
        d.r -= 0.32 * CURRENT.pull * k * dt;
        if (d.r < EYE + 3.5) d.sink = 1e-6;
      }
      d.th += ((2.4 * CURRENT.swirl * k) / Math.max(d.r, 1)) * dt;
      d.rise = Math.max(0, (d.rise ?? 0) - dt * 0.6);
      const x = CURRENT.x + Math.cos(d.th) * d.r;
      const z = CURRENT.z - Math.sin(d.th) * d.r;
      const y = surfaceY(x, z, t) - 0.2 - (d.sink > 0 ? d.sink * d.sink * 0.7 : 0) - d.rise * 2.5;
      d.e.set(0.16 * Math.sin(t * 1.1 + d.ph), d.yaw + d.th * (1 + d.spin) + d.sink * 2, 0.14 * Math.sin(t * 0.9 + d.ph * 2) + d.sink * 0.4);
      d.q.setFromEuler(d.e);
      // gone down the eye: folded to a point (it draws nothing)
      d.m.compose(d.p.set(x, y, z), d.q, d.sink < 3.2 ? _one : _dv.set(0, 0, 0));
      _dn.setFromMatrix4(d.m);
      const e = d.m.elements;
      const [first, count] = d.range;
      for (let v = first * 3, end = (first + count) * 3; v < end; v += 3) {
        const bx = debris.base[v];
        const by = debris.base[v + 1];
        const bz = debris.base[v + 2];
        pos[v] = e[0] * bx + e[4] * by + e[8] * bz + e[12];
        pos[v + 1] = e[1] * bx + e[5] * by + e[9] * bz + e[13];
        pos[v + 2] = e[2] * bx + e[6] * by + e[10] * bz + e[14];
        const nx = debris.baseN[v];
        const ny = debris.baseN[v + 1];
        const nz = debris.baseN[v + 2];
        const n = _dn.elements;
        nor[v] = n[0] * nx + n[3] * ny + n[6] * nz;
        nor[v + 1] = n[1] * nx + n[4] * ny + n[7] * nz;
        nor[v + 2] = n[2] * nx + n[5] * ny + n[8] * nz;
      }
    }
    debris.geo.attributes.position.needsUpdate = true;
    debris.geo.attributes.normal.needsUpdate = true;
  }
  update(0, 0, null);

  function dispose() {
    if (disposed) return;
    disposed = true;
    pending.length = 0;
    scene.remove(root);
    const geos = new Set(ownGeos);
    root.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
      if (o.isInstancedMesh) o.dispose();
    });
    for (const g of geos) g.dispose();
    for (const m of ownMaterials) m.dispose();
    rockRamp.dispose();
    flashLight.dispose?.();
  }

  return {
    worldRadius: WORLD_R,
    colliders,
    playerStart,
    enemySpawns,
    reefs: [],
    current,
    flash,
    /** Read-only lightning stats for tests: sky flashes are capped (SPEC2 §13). */
    get lightning() {
      return {
        ...stats,
        lastSkyFlash: sky.last,
        gap: L.gap,
        overlayMax: L.overlayMax,
        boltVisible: bolt.visible,
        storm: stormGlow.mesh.visible ? stormGlow.material.uniforms.uGain.value : 0,
      };
    },
    surfaceY,
    update,
    dispose,
    group: root,
  };
}

// ---------------------------------------------------------------------------
// Foam spray: instanced toon puffs with an inverted-hull ink line (like volcano.js's smoke)
// ---------------------------------------------------------------------------
function puffGeometry(push = 0) {
  const lobes = [
    [0, 0, 0, 1],
    [0.7, 0.12, 0.2, 0.66],
    [-0.62, 0.18, -0.28, 0.64],
    [-0.05, 0.48, 0.55, 0.58],
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

function buildSpray(ownMaterials, ownGeos, n) {
  const geo = puffGeometry(0);
  const hullGeo = puffGeometry(0.08);
  ownGeos.push(geo, hullGeo);
  const mat = new THREE.MeshToonMaterial({ color: 0xf2faff, emissive: 0xa4b6e2, gradientMap: gradientMap(3) });
  noOutline(mat);
  const hullMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(INK[0], INK[1], INK[2]), side: THREE.BackSide });
  noOutline(hullMat);
  ownMaterials.push(mat, hullMat);
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const hull = new THREE.InstancedMesh(hullGeo, hullMat, n);
  mesh.name = 'maelstrom-spray';
  hull.name = 'maelstrom-spray-ink';
  for (const m of [mesh, hull]) {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.userData.keep = true;
  }
  const r = mulberry32(99);
  const puffs = [];
  for (let i = 0; i < n; i++) puffs.push({ a: (i / n) * Math.PI * 2 + r() * 0.2, phase: r(), life: 1.4 + r() * 1.0, k: 0.32 + r() * 0.38, seed: r() * 50, out: r() });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  function update(t) {
    for (let i = 0; i < n; i++) {
      const p = puffs[i];
      const s = (t / p.life + p.phase) % 1;
      // each puff is thrown up from the lip, carried round fast and falls back
      const a = p.a + t * 0.62 + s * 0.5;
      const rr = EYE + 0.5 + p.out * 1.1 + s * 0.8;
      pos.set(CURRENT.x + Math.cos(a) * rr, LIP + 0.05 + Math.sin(s * Math.PI) * (0.35 + p.k * 0.8), CURRENT.z - Math.sin(a) * rr);
      const size = p.k * (0.55 + 0.75 * Math.sin(Math.min(1, s * 1.15) * Math.PI)) * smoothstep(0, 0.1, s) * (1 - smoothstep(0.82, 1, s));
      const rad = Math.max(size, 0.001);
      e.set(0.3 * Math.sin(p.seed), p.seed + s * 2, 0.3 * Math.cos(p.seed));
      q.setFromEuler(e);
      scl.set(rad * 1.25, rad * 0.85, rad);
      m4.compose(pos, q, scl);
      mesh.setMatrixAt(i, m4);
      const k = 1 + Math.min(0.09, 0.16 * rad) / rad;
      scl.multiplyScalar(k);
      m4.compose(pos, q, scl);
      hull.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
    hull.instanceMatrix.needsUpdate = true;
  }
  return { mesh, hull, update };
}

// ---------------------------------------------------------------------------
// Glows, flames and rain
// ---------------------------------------------------------------------------
function buildGlows(list, ownMaterials, blending, name) {
  const pos = [];
  const uv = [];
  const aG = [];
  const aC = [];
  const index = [];
  list.forEach((g, n) => {
    const c = linear(g.color);
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      pos.push(g.x, g.y, g.z);
      uv.push(u, v);
      aG.push(g.size, g.intensity, n * 1.7, g.pull);
      aC.push(c.r, c.g, c.b);
    }
    const b = n * 4;
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aGlow', new THREE.Float32BufferAttribute(aG, 4));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(aC, 3));
  geo.setIndex(index);
  const material = new THREE.ShaderMaterial({
    name,
    uniforms: { ...fogUniforms(), uTime: { value: 0 }, uGain: { value: 1 } },
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    transparent: true,
    depthWrite: false,
    blending,
    fog: true,
  });
  noOutline(material);
  ownMaterials.push(material);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.userData.keep = true;
  mesh.renderOrder = 4;
  return { mesh, material };
}

function buildFlames(list, ownMaterials) {
  const pos = [];
  const uv = [];
  const aF = [];
  const index = [];
  list.forEach((f, n) => {
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      pos.push(f.x, f.y, f.z);
      uv.push(u, v);
      aF.push(f.w, f.h, n * 2.3 + 0.7, 0);
    }
    const b = n * 4;
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aFl', new THREE.Float32BufferAttribute(aF, 4));
  geo.setIndex(index);
  const material = new THREE.ShaderMaterial({
    name: 'maelstrom-flames',
    uniforms: {
      ...fogUniforms(),
      uTime: { value: 0 },
      uOuter: { value: linear(0x1fc45a) },
      uMid: { value: linear(0x6dff8e) },
      uCore: { value: linear(0xeaffe6) },
      uInk: { value: new THREE.Color().setRGB(INK[0], INK[1] + 0.02, INK[2]) },
    },
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    fog: true,
    side: THREE.DoubleSide,
  });
  noOutline(material);
  ownMaterials.push(material);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'maelstrom-flames';
  mesh.frustumCulled = false;
  mesh.userData.keep = true;
  return { mesh, material };
}

function buildRain(ownMaterials, ownGeos, n, rng) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, 0.5, 0);
  ownGeos.push(geo);
  const box = new THREE.Vector3(56, 34, 56);
  const material = new THREE.ShaderMaterial({
    name: 'maelstrom-rain',
    uniforms: {
      ...fogUniforms(),
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3(0, 10, 0) },
      uBox: { value: box },
      uFall: { value: new THREE.Vector3(-4.5, -26, 3.2) },
      uColor: { value: linear(0xc4d2ff) },
      uOpacity: { value: 0.36 },
    },
    vertexShader: RAIN_VERT,
    fragmentShader: RAIN_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  noOutline(material);
  ownMaterials.push(material);
  const mesh = new THREE.InstancedMesh(geo, material, n);
  mesh.name = 'maelstrom-rain';
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    m4.makeTranslation(rng() * box.x, rng() * box.y, rng() * box.z);
    mesh.setMatrixAt(i, m4);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.userData.keep = true;
  mesh.renderOrder = 6;
  return { mesh, material };
}

// A jagged bolt from the clouds (y 75) down to the sea at the origin, with two short forks.
function boltGeometries(r) {
  // a cartoon zigzag: each kink swings back across the line of the strike
  const a = r() * Math.PI * 2;
  const ux = Math.cos(a);
  const uz = Math.sin(a);
  const main = [new THREE.Vector3(ux * 6, 75, uz * 6)];
  const N = 10;
  let side = r() < 0.5 ? -1 : 1;
  for (let i = 1; i <= N; i++) {
    const f = i / N;
    const y = 75 * (1 - f) + (r() - 0.5) * 3 * (1 - f);
    side = -side;
    const swing = (2.2 + r() * 3.2) * side * (1 - f * 0.55);
    const drift = 6 * (1 - f);
    const wob = (r() - 0.5) * 2.5;
    main.push(i === N ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(ux * (drift + swing) - uz * wob, y, uz * (drift + swing) + ux * wob));
  }
  const forks = [];
  for (const at of [3, 6]) {
    const p0 = main[at];
    const pts = [p0.clone()];
    const dx = r() < 0.5 ? -1 : 1;
    for (let k = 1; k <= 4; k++) pts.push(new THREE.Vector3(p0.x + dx * k * (2.5 + r() * 2), p0.y - k * (3 + r() * 2.5), p0.z + (r() - 0.5) * 5));
    forks.push(pts);
  }
  const tube = (pts, radius) => {
    const parts = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = a.distanceTo(b);
      const c = new THREE.CylinderGeometry(radius, radius, len + radius * 1.6, 7, 1, true);
      c.deleteAttribute('uv');
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      c.applyQuaternion(q);
      c.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      parts.push(c);
    }
    return parts;
  };
  const coreParts = [...tube(main, 0.28), ...forks.flatMap((f) => tube(f, 0.16))];
  const glowParts = [...tube(main, 1.1), ...forks.flatMap((f) => tube(f, 0.6))];
  const core = mergeGeometries(coreParts, false);
  const glow = mergeGeometries(glowParts, false);
  for (const p of [...coreParts, ...glowParts]) p.dispose();
  return { core, glow };
}

// ---------------------------------------------------------------------------
// Enemy spawns: open water 60-100 from the centre, at least 45 from the start, clear of the rocks
// by 13; ordered by farthest-point sampling from the point ahead of the start
// ---------------------------------------------------------------------------
function computeSpawns(colliders, start) {
  const cand = [];
  for (let x = -120; x <= 120; x += 4) {
    for (let z = -120; z <= 120; z += 4) {
      const R = Math.hypot(x - CURRENT.x, z - CURRENT.z);
      if (R < 60 || R > 100) continue;
      if (Math.hypot(x, z) > WORLD_R - 17) continue;
      if (Math.hypot(x - start.x, z - start.z) < 45) continue;
      if (colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 13)) continue;
      cand.push({ x, z });
    }
  }
  const ax = start.x + Math.sin(start.h) * 75;
  const az = start.z + Math.cos(start.h) * 75;
  const out = [];
  let first = null;
  let bd = Infinity;
  for (const c of cand) {
    const d = Math.hypot(c.x - ax, c.z - az);
    if (d < bd) {
      bd = d;
      first = c;
    }
  }
  if (first) out.push(first);
  while (out.length < 12 && out.length < cand.length) {
    let best = null;
    let bm = -1;
    for (const c of cand) {
      let m = Infinity;
      for (const o of out) m = Math.min(m, Math.hypot(c.x - o.x, c.z - o.z));
      if (m > bm) {
        bm = m;
        best = c;
      }
    }
    if (!best || bm <= 0) break;
    out.push(best);
  }
  return out.map((c) => ({ x: c.x, z: c.z }));
}
