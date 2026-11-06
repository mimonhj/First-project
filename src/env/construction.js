// The construction scene (SPEC4 §5.3): for every build and upgrade on all 21 plots, in place of SPEC3's montage.
// The plot's half of the development layer rebakes without it (sparrow's rebuildDev({ [id]: null })); the old and
// new tiers are drawn here as temporary meshes made from their baked chunks (<= 4 meshes each: ink, thin, flat,
// boards), on per-scene clones of the development materials; the new tier is revealed by a rising clipping plane,
// which the outline pass copies (scenery.js sync; OutlineEffect.js), so no ink outline of an unbuilt wall ever
// shows, over a pale blue blueprint ghost clipped by the opposite plane; the frame posts, the foundation blocks, the
// plank band riding the cut line and the sawdust, the scaffold (SPEC3 §19 TOWN-SCAFFOLD's look), the builders'
// cart, Dab's paint wipe (a colour mix on the clones only), the windows lighting, the bunting, the door and the
// people moving in. What the two tiers share (the walls an upgrade keeps; triangles equal to 1/256 u) stands all
// through, drawn with the layer's own materials, never cut or repainted: only the rest is torn down or built. The
// timeline is buildScene.js's (stageAt, cueAt); everything drawn is a pure function of the scene's time, so frames
// of any size (and `advance(dt)` in a frozen-loop test) give the same picture.
//
// createConstruction(ctx) -> { start(plot, from, to, { kind, reduced }), step(dt), skip(), get running, get stage,
//   get t, warm(), dispose() } (+ finish(): end now, get kind, get plot, get skipping, get info, get group: for the
//   town and the tests)
// ctx: { scene, renderer, chunks(plot, tier), devMaterials, pad, porch, door, walkPoint, builders, islanders, pose,
//   sfx } (+ optional groundY(x, z), onCue(cue), warmDraw(objects))
//   scene          the town's root group (the chunks' frame: the baked layer's meshes sit at identity in it)
//   renderer       optional: the WebGLRenderer (without one, the props' first draw hands it over; local clipping is
//                  switched on while a scene runs only if nobody has, and off again after)
//   chunks(id, t)  sparrow's baked chunk of plot `id` at tier t: { ink, thin, flat, tex: { pos, nor, col, glow, uv,
//                  index, verts } } in the root's frame (devChunk's arrays, shared, never written), or null
//   devMaterials   { ink, thin, flat, tex } (or a function returning it): the layer's materials, cloned per scene
//   pad(id)        islandPlan.PADS[id] ({ frame: { x, z, ry, y }, off, x0, x1, z0, z1, top }) or null
//   porch(id)      islandPlan.PLOT_PLACES entry ({ x, z, board: { side } }) or null
//   door(id, tier) the door's foot in the root frame { x, y, z } (or null); buildings4.info's door (raised floors
//                  included) comes first for the new plots, SPEC3's homes have theirs here, else the front's middle
//   walkPoint(x,z) a walkable point near (x, z) (where the cart comes in from, <= 8 u), or null
//   builders()     folk4's builders(): [{ id, name, p }] (Chip, Mortar, Dab), or [] (then the scene builds its own,
//                  one a frame, and keeps them)
//   islanders()    folk4 itself (person(id), hold(id, on)): the people moving in are borrowed from it (else built)
//   pose(id)       sparrow's plotPose(id) { pos, target }: the people turn to the camera to wave and cheer
//   sfx            audio.js's play (a function (name) or an object with play(name)), or null: the cues' sounds
// start: plot is an id or { id, x, z, y, ry, w, d, v4 }; from / to the tiers (to > from); kind 'new' | 'upgrade'
//   (anything else: 'new' from tier 0, else 'upgrade'; 'amenity' / 'home' only say who moves in); reduced: the
//   player's reduced motion. Returns true when the scene began (false: nothing to build from; the caller falls back).
//   It does the least at once (both tiers' meshes, ~3-17 ms); the blueprint, the shared split, the scaffold, the
//   particles and the people are prepared in the next frames' steps (a job a frame, or 4 ms of them).
// skip(): §5.2: the building stands at once in the layer (the caller rebakes the plot back in right away, as
//   sparrow's skipScene does), so the scene's own drawing of it goes; the people moving in wave from the porch and
//   everyone cheers once; the scene keeps running SCENE.skip + SCENE.skipWave s for that (keep stepping it while
//   `running`); finish() ends it now.
// warm(): the hidden objects to warm-draw (main's warmDraw, with renderer.localClippingEnabled on for the draw), one
//   tiny mesh per material variant the scene uses; kept alive so the programs stay compiled (measured: 0 programs
//   compile in a scene's frames after it, 5 without).
// info.frame: { pad, porch, top } (world) for the build view's camera to keep in frame.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { gradientMap, setOutline, noOutline, INK, OUTLINE_THICKNESS } from '../style.js';
import { buildPerson, animatePerson, disposePerson, handPosition } from '../people.js';
import { stageAt, cueAt, sceneLength, SCENE, STAGES, STILLS } from '../buildScene.js';
import { info as info4 } from './buildings4.js';
import { ISLANDERS } from '../islanders.js';

const PI = Math.PI;
const TAU = PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const ease = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};
const easeOut = (x) => 1 - (1 - clamp(x, 0, 1)) ** 2;
// a pop: 0 -> overshoot -> 1 over u 0..1
const popK = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.7 ? 1.12 * easeOut(u / 0.7) : 1.12 - 0.12 * ease((u - 0.7) / 0.3));
const FAR = 1e4;

/** Every number of the scene's look in one place (the timeline itself is buildScene.js's). */
export const CONSTRUCTION = Object.freeze({
  blueprint: Object.freeze({ color: 0x9fd4ff, opacity: 0.3 }),
  timber: 0xd9b07a, // the walls and roof before Dab's paint (§5.3)
  inside: 0xb3814d, // the inner faces seen over a cut wall
  colours: Object.freeze({ plank: 0xf6dfab, wood: 0xc68b4e, woodDark: 0x7a4a28, woodDeep: 0x5a3820, stone: 0xc6bcab, stoneDark: 0x8f8579, chalk: 0xfbf8ee, iron: 0x3b4258, rope: 0xe9cf92, case: 0xb5523b, caseBand: 0x5a3820, dust: [0xf3e2b8, 0xfff6e0, 0xe9cf92], saw: [0xf6dfab, 0xe9c58a, 0xfff1d0], spark: [0xfff6b8, 0xffffff, 0xffd84a], confetti: [0xe63946, 0xffc93c, 0x3a6fd8, 0x3fae5a, 0xf58fb0, 0xff9a3c, 0x9b6fd6, 0x2bb3a3], doorway: 0x2a1c14 }),
  // the scaffold (sparrow's SPEC3 look: yellow poles, orange rails, red braces, pale planks, a ladder, a pulley, flags)
  scaffold: Object.freeze({ pad: 0.3, minH: 2.6, maxH: 7.2, level: 1.3, pole: 0xffd84a, rail: 0xff9a3c, brace: 0xe2383d, board: 0xf6dfab, pop: 0.35, fold: 0.45 }),
  flags: Object.freeze([0xe63946, 0xffc93c, 0x3a6fd8, 0x3fae5a, 0xf58fb0, 0xff9a3c, 0xfaf6ee, 0x9b6fd6]),
  roof: Object.freeze({ lift: 1.3, rise: 0.4, pop: 0.22 }), // the old roof: rises 1.3 u in 0.4 s, then pops into a puff
  fold: 0.32, // s the old shack takes to fold flat into the cart
  blocks: Object.freeze({ w: 0.52, h: 0.3, d: 0.42, drop: 1.5, fall: 0.3 }),
  posts: Object.freeze({ w: 0.16, pop: 0.24, beam: 0.13, snap: 0.18 }),
  band: Object.freeze({ h: 0.13, t: 0.07, out: 0.07 }),
  tile: 0.2, // s each of the roof's four bands takes to climb
  buntingAway: 0.45, // s before the end the bunting starts to pop away (the building in the layer has none)
  topper: 0.36, // s of the finished building's little squash
  paint: 0.7, // of the finishing stage, the paint's sweep
  lights: 0.4, // s the windows take to light
  cart: Object.freeze({ back: 2.6, len: 1.1, wid: 0.66 }), // it comes in from 2.6 u out (or the walk point, <= 8 u)
  door: Object.freeze({ swing: 0.45, open: 1.7 }),
  movers: Object.freeze({ out: 0.9, gap: 0.62, porch: 0.95 }),
  counts: Object.freeze({ sawdust: 18, sparkles: 10, confetti: 40, flags: 9 }),
  cap: Object.freeze({ boxes: 40, bits: 120, puffs: 40 }),
  sample: 0.12, // u between the cross-sections the plank band follows
});
const K = CONSTRUCTION;
const COLR = K.colours;

// SPEC3's ten plots: where sparrow's homeArt puts each home's door and its walls' colour (the movers' shirts), and
// how the old villagers' wavers were seeded (sparrow's finishMontage); the new plots' doors are buildings4.info's.
const SPEC3_HOMES = { homeA: { at: [-0.1, -0.5], wall: 0xf9b4c0, i: 0 }, homeB: { at: [0, -0.55], wall: 0xaee6c8, i: 1 }, homeC: { at: [-0.25, -0.5], wall: 0xfde29a, i: 2 }, homeD: { at: [0, -0.5], wall: 0xa7d3f5, i: 3 } };
const KINDS_W = ['woman', 'man', 'kid', 'old'];
const ISLET = { homeE: true, homeG: true, observatory: true, grotto: true };

function own(o, k) {
  try {
    return o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
  } catch {
    return undefined;
  }
}
const call = (f, ...a) => {
  try {
    return typeof f === 'function' ? f(...a) : null;
  } catch (err) {
    console.warn('construction:', err);
    return null;
  }
};
const colour = (hex) => new THREE.Color(hex);

// --------------------------------------------------------------------------------------- the scene's shaders
// The clones of the development materials (opaque and, for reduced motion's crossfade, transparent): the
// layer's own shader (its glow attribute and the lanterns' flicker, through its onBeforeCompile) plus the paint wipe
// (raw timber above uScenePaint, with a hand-painted wavy edge), the windows' light (uSceneLit) and the inner faces'
// colour (they show over a cut wall: DoubleSide, so the outline pass's back faces never show through the cut as ink).
function sceneShader(sh, U) {
  sh.uniforms.uScenePaint = U.paint;
  sh.uniforms.uSceneLit = U.lit;
  sh.uniforms.uSceneTimber = U.timber;
  sh.uniforms.uSceneInside = U.inside;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vScenePos;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvScenePos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vScenePos;\nuniform float uScenePaint;\nuniform float uSceneLit;\nuniform vec3 uSceneTimber;\nuniform vec3 uSceneInside;')
    .replace(
      '#include <color_fragment>',
      '#include <color_fragment>\nfloat sceneEdge = uScenePaint + 0.05 * sin(vScenePos.x * 4.3 + vScenePos.z * 3.1);\nfloat sceneRaw = smoothstep(sceneEdge - 0.025, sceneEdge + 0.025, vScenePos.y);\ndiffuseColor.rgb = mix(diffuseColor.rgb, uSceneTimber, sceneRaw);\nif (!gl_FrontFacing) diffuseColor.rgb = uSceneInside;',
    )
    .replace('totalEmissiveRadiance += vGlow.rgb', 'totalEmissiveRadiance += uSceneLit * (1.0 - sceneRaw) * vGlow.rgb');
}
// The blueprint ghost: pale blue, see-through, a little denser and bluer where its faces turn away (so its shape
// reads), with a faint drafting grid every half unit in the town's frame (a blueprint's squared paper).
function ghostShader(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vGhostN;\nvarying vec3 vGhostV;\nvarying vec3 vGhostW;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvGhostN = normalize(normalMatrix * normal);\nvGhostV = -mvPosition.xyz;\nvGhostW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vGhostN;\nvarying vec3 vGhostV;\nvarying vec3 vGhostW;')
    .replace(
      '#include <color_fragment>',
      '#include <color_fragment>\nfloat ghostF = 1.0 - abs(dot(normalize(vGhostN), normalize(vGhostV)));\nvec3 ghostQ = vGhostW * 2.0;\nvec3 ghostD = abs(fract(ghostQ - 0.5) - 0.5) / max(fwidth(ghostQ), vec3(1e-4));\nfloat ghostL = clamp(1.2 - min(min(ghostD.x, ghostD.y), ghostD.z), 0.0, 1.0);\ndiffuseColor.a *= 0.6 + 0.9 * ghostF;\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.27, 0.56, 0.93), 0.45 * ghostF);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.97, 1.0), 0.8 * ghostL);\ndiffuseColor.a = max(diffuseColor.a, 0.42 * ghostL);',
    );
}
// An InstancedMesh's ink line (the outline pass never outlines InstancedMesh correctly): an inverted hull pushed out
// in clip space exactly as the outline pass pushes its hulls (scenery.js calculateOutline), so the props' ink
// matches the town's.
function inkShader(sh) {
  sh.uniforms.uInkThickness = { value: OUTLINE_THICKNESS };
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uInkThickness;')
    .replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n#ifdef USE_INSTANCING\nvec4 inkP2 = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(transformed - normal, 1.0);\n#else\nvec4 inkP2 = projectionMatrix * modelViewMatrix * vec4(transformed - normal, 1.0);\n#endif\ngl_Position = gl_Position + normalize(gl_Position - inkP2) * uInkThickness * gl_Position.w;',
    );
}

// --------------------------------------------------------------------------------------- geometry helpers
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// The props' parts (the scaffold, the cart) are unit shapes made once and written, placed, straight into one merged
// geometry's arrays (position, normal, colour, glow = 0): no geometry per part, so a scaffold builds in a few ms.
const UNITS = {};
function unitShape(kind) {
  if (UNITS[kind]) return UNITS[kind];
  let g;
  if (kind === 'rbox') g = new RoundedBoxGeometry(1, 1, 1, 1, 0.14);
  else if (kind.startsWith('cyl')) g = new THREE.CylinderGeometry(0.5, 0.5, 1, Number(kind.slice(3)) || 8, 1);
  else if (kind === 'cone') g = new THREE.ConeGeometry(0.5, 1, 3);
  else g = new THREE.BoxGeometry(1, 1, 1);
  const n = g.attributes.position.count;
  let index = g.index ? g.index.array : null;
  if (!index) {
    index = new Uint32Array(n);
    for (let i = 0; i < n; i++) index[i] = i;
  }
  UNITS[kind] = { pos: Float32Array.from(g.attributes.position.array), nor: Float32Array.from(g.attributes.normal.array), index: Uint32Array.from(index), n };
  g.dispose();
  return UNITS[kind];
}
/** A list of placed, coloured unit shapes (box, rbox, cylN, cone: 1 u across and tall), merged by build(). */
function shapes() {
  const list = [];
  const api = {
    add(kind, hex, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
      list.push({ u: unitShape(kind), hex, m });
      return api;
    },
    /** A rod (a cylinder of radius r, seg sides) from a to b. */
    rod(hex, a, b, r, seg = 6) {
      const d = new THREE.Vector3().subVectors(b, a);
      const L = d.length();
      if (L < 1e-4) return api;
      const q = new THREE.Quaternion().setFromUnitVectors(UP, d.divideScalar(L));
      const m = new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(2 * r, L, 2 * r));
      list.push({ u: unitShape(`cyl${seg}`), hex, m });
      return api;
    },
    build() {
      if (!list.length) return null;
      let verts = 0;
      let idx = 0;
      for (const p of list) {
        verts += p.u.n;
        idx += p.u.index.length;
      }
      const pos = new Float32Array(verts * 3);
      const nor = new Float32Array(verts * 3);
      const col = new Float32Array(verts * 3);
      const index = verts > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
      const nm = new THREE.Matrix3();
      const v = new THREE.Vector3();
      let vo = 0;
      let io = 0;
      for (const p of list) {
        const { u, m } = p;
        nm.getNormalMatrix(m);
        _c.setHex(p.hex);
        const flip = m.determinant() < 0;
        for (let i = 0; i < u.n; i++) {
          v.fromArray(u.pos, i * 3).applyMatrix4(m).toArray(pos, (vo + i) * 3);
          v.fromArray(u.nor, i * 3).applyMatrix3(nm).normalize().toArray(nor, (vo + i) * 3);
          _c.toArray(col, (vo + i) * 3);
        }
        const I = u.index;
        for (let i = 0; i < I.length; i += 3) {
          index[io++] = I[i] + vo;
          index[io++] = I[flip ? i + 2 : i + 1] + vo;
          index[io++] = I[flip ? i + 1 : i + 2] + vo;
        }
        vo += u.n;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(verts * 4), 4));
      g.setIndex(new THREE.BufferAttribute(index, 1));
      g.computeBoundingSphere();
      return g;
    },
  };
  return api;
}
const boxG = (w, h, d) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.deleteAttribute('uv');
  return g;
};

/** A geometry over one class of a baked chunk (its arrays shared, not copied). */
function chunkGeo(c) {
  if (!c || !c.pos || !c.index || !c.verts) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(c.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(c.nor, 3));
  if (c.col) g.setAttribute('color', new THREE.BufferAttribute(c.col, 3));
  if (c.glow) g.setAttribute('glow', new THREE.BufferAttribute(c.glow, 4));
  if (c.uv) g.setAttribute('uv', new THREE.BufferAttribute(c.uv, 2));
  g.setIndex(new THREE.BufferAttribute(c.index, 1));
  g.computeBoundingSphere();
  return g;
}
const CLASSES = ['ink', 'thin', 'flat', 'tex'];

// What the old tier and the new one share (the tiers add to the last: the walls an upgrade keeps, an islet's palm and
// rocks): triangles with the same three corners (to 1/256 u) in the same class. Those stand all through the scene,
// drawn as they are (the layer's own materials, never cut or repainted); only the rest is torn down or built.
const TRI_Q = 256;
function cornerHashes(c) {
  const n = c.verts;
  const h = new Uint32Array(n);
  const g = new Uint32Array(n);
  const P = c.pos;
  for (let i = 0; i < n; i++) {
    const x = Math.round(P[i * 3] * TRI_Q);
    const y = Math.round(P[i * 3 + 1] * TRI_Q);
    const z = Math.round(P[i * 3 + 2] * TRI_Q);
    h[i] = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0;
    g[i] = (Math.imul(x, 0x27d4eb2d) + Math.imul(y, 0x165667b1) + Math.imul(z, 0x9e3779b1)) >>> 0;
  }
  return { h, g };
}
function triKeys(c) {
  const { h, g } = cornerHashes(c);
  const I = c.index;
  const keys = new Float64Array(I.length / 3);
  for (let t = 0, i = 0; i < I.length; i += 3, t++) {
    let a = I[i];
    let b = I[i + 1];
    let d = I[i + 2];
    // (the corners in hash order, so a triangle matches however its corners are listed)
    if (h[a] > h[b]) [a, b] = [b, a];
    if (h[b] > h[d]) [b, d] = [d, b];
    if (h[a] > h[b]) [a, b] = [b, a];
    const k1 = (Math.imul(h[a], 0x9e3779b1) ^ Math.imul(h[b], 0x85ebca77) ^ Math.imul(h[d], 0xc2b2ae3d)) >>> 0;
    const k2 = (Math.imul(g[a], 0x27d4eb2f) + Math.imul(g[b], 0x165667b1) + Math.imul(g[d], 0xd3a2646c)) >>> 0;
    keys[t] = (k1 & 0x1fffff) * 4294967296 + k2;
  }
  return keys;
}
function pick(I, keys, test) {
  let n = 0;
  for (let t = 0; t < keys.length; t++) if (test(keys[t])) n++;
  const out = new Uint32Array(n * 3);
  let o = 0;
  for (let t = 0; t < keys.length; t++) {
    if (!test(keys[t])) continue;
    out[o++] = I[t * 3];
    out[o++] = I[t * 3 + 1];
    out[o++] = I[t * 3 + 2];
  }
  return out;
}
/** { built, kept, oldOnly: { cls: index arrays }, keptTris, oldTris } for an old and a new chunk. */
function splitShared(oldChunk, newChunk) {
  const out = { built: {}, kept: {}, oldOnly: {}, keptTris: 0, oldTris: 0 };
  for (const cls of CLASSES) {
    const a = oldChunk && oldChunk[cls];
    const b = newChunk && newChunk[cls];
    const ka = a && a.index && a.verts ? triKeys(a) : null;
    const kb = b && b.index && b.verts ? triKeys(b) : null;
    const sa = new Set(ka || []);
    const sb = new Set(kb || []);
    if (kb) {
      out.built[cls] = pick(b.index, kb, (k) => !sa.has(k));
      out.kept[cls] = pick(b.index, kb, (k) => sa.has(k));
      out.keptTris += out.kept[cls].length / 3;
    }
    if (ka) {
      out.oldOnly[cls] = pick(a.index, ka, (k) => !sb.has(k));
      out.oldTris += ka.length;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------- the module
export function createConstruction(ctx = {}) {
  const C = ctx && typeof ctx === 'object' ? ctx : {};
  const root = own(C, 'scene') && C.scene.isObject3D ? C.scene : null;
  const group = new THREE.Group();
  group.name = 'construction';
  group.userData.keep = true;
  group.visible = false;
  if (root) root.add(group);

  // ----- what every scene shares (made at the first start or warm) -----
  let shared = null;
  function makeShared() {
    if (shared) return shared;
    const boxGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.09);
    boxGeo.deleteAttribute('uv');
    const boxMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(3) });
    boxMat.name = 'construction:boxes';
    noOutline(boxMat);
    const inkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(INK[0], INK[1], INK[2]), side: THREE.BackSide });
    inkMat.name = 'construction:ink';
    noOutline(inkMat);
    inkMat.onBeforeCompile = inkShader;
    inkMat.customProgramCacheKey = () => 'construction-ink';
    const boxes = new THREE.InstancedMesh(boxGeo, boxMat, K.cap.boxes);
    const boxInk = new THREE.InstancedMesh(boxGeo, inkMat, K.cap.boxes);
    boxInk.instanceMatrix = boxes.instanceMatrix;
    boxes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    boxes.setColorAt(0, _c.setRGB(1, 1, 1));
    boxes.name = 'construction:boxes';
    boxInk.name = 'construction:boxes:ink';
    const bitGeo = boxG(1, 1, 1);
    const bitMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(3) });
    bitMat.name = 'construction:bits';
    noOutline(bitMat);
    const bits = new THREE.InstancedMesh(bitGeo, bitMat, K.cap.bits);
    bits.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bits.setColorAt(0, _c.setRGB(1, 1, 1));
    bits.name = 'construction:bits';
    // A skip's wave runs SCENE.skip + SCENE.skipWave s and needs stepping; a caller that stops stepping the scene at
    // skip() (it rebakes the plot back into the layer at once) would leave the people standing there: after 150 ms
    // without a step, the frame that draws this heartbeat steps the wave itself (on the frame clock) until it ends.
    bits.onAfterRender = () => {
      const S0 = S;
      if (!S0 || !S0.skipping || S0.selfQueued) return;
      const t = now();
      if (t - (S0.steppedAt || t) < 150) return;
      const dt = clamp((t - (S0.selfAt || t - 1000 / 60)) / 1000, 0, 0.1);
      S0.selfAt = t;
      S0.selfQueued = true;
      Promise.resolve().then(() => {
        S0.selfQueued = false;
        if (S === S0) run(dt);
      });
    };
    const puffGeo = new THREE.IcosahedronGeometry(1, 1);
    puffGeo.deleteAttribute('uv');
    const puffMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(3) });
    puffMat.name = 'construction:puffs';
    noOutline(puffMat);
    const puffs = new THREE.InstancedMesh(puffGeo, puffMat, K.cap.puffs);
    puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    puffs.setColorAt(0, _c.setRGB(1, 1, 1));
    puffs.name = 'construction:puffs';
    const sphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    for (const m of [boxes, boxInk, bits, puffs]) {
      m.count = 0;
      m.visible = false;
      m.frustumCulled = false;
      m.boundingSphere = sphere;
      m.userData.keep = true;
      group.add(m);
    }
    const ghostMat = new THREE.MeshBasicMaterial({ color: K.blueprint.color, transparent: true, opacity: K.blueprint.opacity, depthWrite: false, fog: true });
    ghostMat.name = 'construction:blueprint';
    noOutline(ghostMat);
    ghostMat.onBeforeCompile = ghostShader;
    ghostMat.customProgramCacheKey = () => 'construction-ghost';
    shared = { boxGeo, boxMat, inkMat, boxes, boxInk, bitGeo, bitMat, bits, puffGeo, puffMat, puffs, ghostMat, cartGeo: null, own: [] };
    return shared;
  }

  // ----- the development materials, cloned for a scene -----
  function devMats() {
    const d = typeof C.devMaterials === 'function' ? call(C.devMaterials) : own(C, 'devMaterials');
    return d && typeof d === 'object' ? d : {};
  }
  const fallback = {};
  function sourceMat(cls) {
    const d = devMats();
    const m = own(d, cls);
    if (m && m.isMaterial) return m;
    if (cls === 'tex') return null;
    if (!fallback[cls]) {
      const f = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap(3) });
      f.name = `construction:dev-${cls}`;
      setOutline(f, cls === 'ink' ? true : cls === 'thin' ? { thickness: OUTLINE_THICKNESS * 0.6 } : false);
      fallback[cls] = f;
    }
    return fallback[cls];
  }
  /** A clone of the layer's material for class cls: clipped by `planes`, the scene's shader on uniforms U. */
  function sceneMat(cls, planes, U, opts = {}) {
    const src = sourceMat(cls);
    if (!src) return null;
    const m = src.clone();
    m.name = `construction:${cls}${opts.fade ? ':fade' : ''}`;
    m.clippingPlanes = planes;
    m.side = THREE.DoubleSide;
    if (opts.fade) {
      m.transparent = true;
      m.opacity = 0;
    }
    if (opts.offset) {
      m.polygonOffset = true;
      m.polygonOffsetFactor = 1;
      m.polygonOffsetUnits = 2;
    }
    const base = src.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      if (typeof base === 'function') base.call(src, sh, r);
      sceneShader(sh, U);
    };
    m.customProgramCacheKey = () => (cls === 'tex' ? 'sparrow-dev-scene-tex' : 'sparrow-dev-scene');
    return m;
  }
  const uniforms = (paint = FAR, lit = 1) => ({ paint: { value: paint }, lit: { value: lit }, timber: { value: colour(K.timber) }, inside: { value: colour(K.inside) } });

  // a set: one mesh per class of a chunk on cloned materials; in a pivot group (lifts, folds, squashes about a point)
  function meshSet(chunk, planes, U, opts = {}) {
    const pivot = new THREE.Group();
    const inner = new THREE.Group();
    pivot.add(inner);
    const set = { pivot, inner, meshes: [], mats: [], geos: opts.geos || null, planes, U };
    const geos = set.geos || {};
    for (const cls of CLASSES) {
      const c = chunk && chunk[cls];
      if (!c || !c.verts) continue;
      let g = geos[cls];
      if (!g) {
        g = chunkGeo(c);
        if (!g) continue;
        geos[cls] = g;
      }
      const m = sceneMat(cls, planes, U, opts);
      if (!m) continue;
      const mesh = new THREE.Mesh(g, m);
      mesh.name = `construction:${opts.name || 'tier'}:${cls}`;
      mesh.userData.keep = true;
      mesh.userData.cls = cls;
      mesh.frustumCulled = false;
      if (opts.order) mesh.renderOrder = opts.order;
      inner.add(mesh);
      set.meshes.push(mesh);
      set.mats.push(m);
    }
    set.geos = geos;
    pivot.visible = false;
    return set;
  }
  function placePivot(set, px, py, pz) {
    set.pivot.position.set(px, py, pz);
    set.inner.position.set(-px, -py, -pz);
  }

  // ----- the scene now -----
  let S = null;
  let warmGroup = null;
  let clipSet = null; // the renderer we switched local clipping on for (and what it was)

  // ----- reading a plot -----
  function plotId(plot) {
    if (typeof plot === 'string') return plot;
    const id = own(plot, 'id');
    return typeof id === 'string' ? id : null;
  }
  /** The plot's frame (the pad's, with the kit offset) and its work frame (+z towards the porch: where people walk). */
  function frames(id, plot) {
    const pad = call(C.pad, id);
    const fr = own(pad, 'frame');
    const fx = fin(own(fr, 'x')) ? fr.x : fin(own(plot, 'x')) ? plot.x : 0;
    const fz = fin(own(fr, 'z')) ? fr.z : fin(own(plot, 'z')) ? plot.z : 0;
    const ry = fin(own(fr, 'ry')) ? fr.ry : fin(own(plot, 'ry')) ? plot.ry : 0;
    const floor = fin(own(fr, 'y')) ? fr.y : fin(own(plot, 'y')) ? plot.y : 0;
    const off = Array.isArray(own(pad, 'off')) ? pad.off : [0, 0];
    // the platform's frame (the pad's bounds and the plot place are in it) and the kits' (moved by the kit offset)
    const Fp = new THREE.Matrix4().compose(new THREE.Vector3(fx, 0, fz), new THREE.Quaternion().setFromAxisAngle(UP, ry), new THREE.Vector3(1, 1, 1));
    const F = Fp.clone().multiply(new THREE.Matrix4().makeTranslation(fin(off[0]) ? off[0] : 0, 0, fin(off[1]) ? off[1] : 0));
    // the pad's bounds in the platform frame (without a pad: the plot's own size round the kit's origin)
    let b;
    if (pad && fin(own(pad, 'x0'))) b = { x0: pad.x0, x1: pad.x1, z0: pad.z0, z1: pad.z1 };
    else {
      const w = fin(own(plot, 'w')) ? plot.w : 4;
      const d = fin(own(plot, 'd')) ? plot.d : 4;
      const ox = fin(off[0]) ? off[0] : 0;
      const oz = fin(off[1]) ? off[1] : 0;
      b = { x0: ox - w / 2, x1: ox + w / 2, z0: oz - d / 2, z1: oz + d / 2 };
    }
    // the porch side: the board's (islandPlan's plot place), else the side the plot place lies on
    const pl = call(C.porch, id);
    let side = own(own(pl, 'board'), 'side');
    if (!['f', 'l', 'r', 'b'].includes(side)) {
      side = 'f';
      if (pl && fin(pl.x) && fin(pl.z)) {
        const Fi = Fp.clone().invert();
        const p = new THREE.Vector3(pl.x, 0, pl.z).applyMatrix4(Fi);
        const cx = (b.x0 + b.x1) / 2;
        const cz = (b.z0 + b.z1) / 2;
        const dx = p.x - cx;
        const dz = p.z - cz;
        side = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'r' : 'l') : dz > 0 ? 'f' : 'b';
      }
    }
    const a = { f: 0, r: PI / 2, l: -PI / 2, b: PI }[side];
    const W = Fp.clone().multiply(new THREE.Matrix4().makeRotationY(a));
    const Wi = W.clone().invert();
    // the pad's bounds in the work frame
    const toW = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(Fp).applyMatrix4(Wi);
    const cs = [toW(b.x0, b.z0), toW(b.x1, b.z0), toW(b.x0, b.z1), toW(b.x1, b.z1)];
    const pw = { x0: Math.min(...cs.map((v) => v.x)), x1: Math.max(...cs.map((v) => v.x)), z0: Math.min(...cs.map((v) => v.z)), z1: Math.max(...cs.map((v) => v.z)) };
    return { F, Fp, W, Wi, fry: ry, yaw: ry + a, floor, pad, padW: pw, place: pl };
  }
  /** World point of work-frame (x, z) at height y. */
  function wp(S0, x, y, z, out = new THREE.Vector3()) {
    out.set(x, 0, z).applyMatrix4(S0.W);
    out.y = y;
    return out;
  }

  /** What a chunk stands on in the work frame: its bounds above floor + 0.3 inside the pad (+0.4), its top, and its
   *  cross-sections every K.sample u (the plank band hugs them). */
  function measure(S0, chunk) {
    const out = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, top: -Infinity, low: Infinity, tris: [] };
    if (!chunk) return out;
    const P = S0.padW;
    const m = 0.45;
    const e = S0.Wi.elements;
    for (const cls of CLASSES) {
      const c = chunk[cls];
      if (!c || !c.pos) continue;
      const a = c.pos;
      const n = a.length / 3;
      const U = new Float32Array(n);
      const V = new Float32Array(n);
      const Y = new Float32Array(n);
      const inside = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const x = a[i * 3];
        const y = a[i * 3 + 1];
        const z = a[i * 3 + 2];
        const u = e[0] * x + e[8] * z + e[12];
        const v = e[2] * x + e[10] * z + e[14];
        U[i] = u;
        V[i] = v;
        Y[i] = y;
        if (u < P.x0 - m || u > P.x1 + m || v < P.z0 - m || v > P.z1 + m) continue;
        inside[i] = 1;
        if (y > out.top) out.top = y;
        if (y < out.low) out.low = y;
        if (y < S0.floor + 0.3) continue;
        if (u < out.x0) out.x0 = u;
        if (u > out.x1) out.x1 = u;
        if (v < out.z0) out.z0 = v;
        if (v > out.z1) out.z1 = v;
      }
      out.tris.push({ U, V, Y, inside, index: c.index });
    }
    return out;
  }
  /** Cross-section bounds of the measured chunk at heights h0 + k * dh (k 0..n), from its triangles. */
  function sections(meas, h0, h1) {
    const dh = K.sample;
    const n = Math.max(1, Math.ceil((h1 - h0) / dh));
    const S1 = [];
    for (let k = 0; k <= n; k++) S1.push({ y: h0 + k * dh, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity });
    const add = (k, u, v) => {
      const s = S1[k];
      if (u < s.x0) s.x0 = u;
      if (u > s.x1) s.x1 = u;
      if (v < s.z0) s.z0 = v;
      if (v > s.z1) s.z1 = v;
    };
    let U;
    let V;
    let Y;
    const edge = (k, h, p, q) => {
      const yp = Y[p];
      const yq = Y[q];
      if ((yp - h) * (yq - h) > 0 || yp === yq) {
        if (yp === h) add(k, U[p], V[p]);
        return;
      }
      const f = (h - yp) / (yq - yp);
      add(k, U[p] + (U[q] - U[p]) * f, V[p] + (V[q] - V[p]) * f);
    };
    for (const T of meas.tris) {
      ({ U, V, Y } = T);
      const { inside, index } = T;
      for (let i = 0; i < index.length; i += 3) {
        const a = index[i];
        const b = index[i + 1];
        const c = index[i + 2];
        if (!inside[a] || !inside[b] || !inside[c]) continue;
        const ya = Y[a];
        const yb = Y[b];
        const yc = Y[c];
        const lo = Math.min(ya, yb, yc);
        const hi = Math.max(ya, yb, yc);
        if (hi < h0 || lo > h1) continue;
        const k0 = Math.max(0, Math.ceil((lo - h0) / dh));
        const k1 = Math.min(n, Math.floor((hi - h0) / dh));
        for (let k = k0; k <= k1; k++) {
          const h = h0 + k * dh;
          // the triangle's edges crossing h
          edge(k, h, a, b);
          edge(k, h, b, c);
          edge(k, h, c, a);
        }
      }
    }
    return S1;
  }
  /** The walls' top (where the roof stage begins) of a chunk with no buildings4 info: the lowest cross-section above
   *  floor + 1.0 within 6 % of the widest (a roof's eaves overhang its walls). */
  function guessEave(floor, top, secs) {
    const H = top - floor;
    if (!(H > 0.5)) return floor + Math.max(0.1, H * 0.6);
    if (H < 1.8) return floor + H * 0.6;
    let best = 0;
    for (const s of secs) if (s.y >= floor + 1.0 && s.y <= top - 0.3 && s.x1 > s.x0) best = Math.max(best, (s.x1 - s.x0) * (s.z1 - s.z0));
    if (!(best > 0)) return floor + H * 0.6;
    for (const s of secs) if (s.y >= floor + 1.0 && s.y <= top - 0.3 && s.x1 > s.x0 && (s.x1 - s.x0) * (s.z1 - s.z0) >= best * 0.94) return clamp(s.y, floor + 1.0, top - 0.4);
    return floor + H * 0.6;
  }
  /** The cross-section rectangle at height h (interpolated from the samples; the footprint where there is none). */
  function sectionAt(S0, h) {
    const secs = S0.secs;
    const fp = S0.fpNew;
    if (!secs || !secs.length) return fp;
    const k = clamp(Math.round((h - secs[0].y) / K.sample), 0, secs.length - 1);
    for (let d = 0; d < secs.length; d++) {
      for (const j of [k - d, k + d]) {
        const s = secs[j];
        if (s && s.x1 > s.x0 && s.z1 > s.z0) return s;
      }
    }
    return fp;
  }

  // ----- the timeline's moments (the full-motion timeline; reduced motion shows its stills' end states) -----
  function eventTimes(kind) {
    const L = sceneLength(kind, false);
    const ev = {};
    for (const c of cueAt(0, L + 1, kind, false)) {
      if (!c.event) continue;
      (ev[c.event] = ev[c.event] || [])[c.i !== undefined ? c.i : 0] = c.at;
    }
    const span = (i) => STAGES[i][kind];
    return { ev, span, L };
  }
  const at = (S0, name, i = 0) => {
    const a = S0.E.ev[name];
    return a && fin(a[i]) ? a[i] : FAR;
  };

  // ----- the people -----
  /** Bess's crew: folk4's builders (borrowed), else the scene's own (built once, one a frame, and kept). Returns the
   *  ones there are now; `build` jobs make the rest. */
  function crewList(S0) {
    let list = call(C.builders);
    if (Array.isArray(list)) list = list.map((b) => (b && b.isObject3D ? { id: b.name || null, p: b } : b)).filter((b) => b && b.p && b.p.isObject3D);
    else list = [];
    if (list.length) return { list, ownBuilt: false };
    // folk4 has not built them (yet): the scene's own, from islanders.js's looks
    if (!shared.crew) shared.crew = [];
    for (const row of ISLANDERS) {
      if (row.role !== 'builder' || shared.crew.some((b) => b.id === row.id)) continue;
      S0.jobs.push({
        people: true,
        run() {
          if (!shared || shared.crew.some((b) => b.id === row.id)) return;
          try {
            const p = buildPerson({ ...row.look, share: true, detail: 'low' });
            p.name = `construction:${row.id}`;
            p.visible = false;
            group.add(p);
            const b = { id: row.id, name: row.name, p };
            shared.crew.push(b);
            S0.crew.push({ ...b, own: true, role: ROLE[b.id] !== undefined ? b.id : 'dab' });
          } catch (err) {
            console.warn('construction: builder', row.id, err);
          }
        },
      });
    }
    return { list: shared.crew.slice(), ownBuilt: true };
  }
  const ROLE = { chip: 0, mortar: 1, dab: 2 };
  /** Who moves in (islanders.js's rows for the plot's new tier; SPEC3's homes: two villagers in the walls' colours),
   *  each a job: borrowed from folk4 when it has them out, else built for the scene. */
  function moverJobs(S0, id, to, amenity) {
    const specs = [];
    const rows = ISLANDERS.filter((r) => r.role !== 'builder' && r.plot === id && r.tier === to).slice(0, 3);
    for (const r of rows) specs.push({ id: r.id, look: r.look, suitcase: !amenity && r.role === 'home', mer: !!(r.look && r.look.tail === true), row: true });
    const H = SPEC3_HOMES[id];
    if (!rows.length && H && to === 1) {
      for (let k = 0; k < 2; k++) {
        const seed = 5000 + H.i * 37 + k * 11;
        specs.push({ id: `${id}:${k}`, look: { kind: KINDS_W[(seed + k) % KINDS_W.length], seed, shirt: H.wall }, suitcase: true, mer: false, row: false });
      }
    }
    S0.moverCount = specs.length;
    specs.forEach((sp, i) => {
      S0.jobs.push({
        people: true,
        run() {
          const folk = sp.row ? call(C.islanders) : null;
          let p = folk && typeof folk.person === 'function' ? call(folk.person.bind(folk), sp.id) : null;
          let borrowed = false;
          if (p && p.isObject3D && typeof folk.hold === 'function') {
            call(folk.hold.bind(folk), sp.id, true);
            borrowed = true;
          } else {
            try {
              p = buildPerson({ ...sp.look, share: true, detail: 'low' });
              p.name = `construction:mover:${sp.id}`;
              group.add(p);
            } catch {
              p = null;
            }
          }
          if (!p) return;
          p.visible = false;
          S0.movers.push({ id: sp.id, i, p, borrowed, folk, suitcase: sp.suitcase, mer: sp.mer });
          S0.movers.sort((a, b) => a.i - b.i);
        },
      });
    });
  }
  // (folk4's group and the scene's sit at identity in the root, the chunks' frame)
  function placePerson(p, x, y, z, h) {
    p.position.set(x, y, z);
    p.rotation.set(0, h, 0);
  }
  const towards = (S0, wx, wz) => {
    const cam = S0.cam;
    return cam ? Math.atan2(cam.x - wx, cam.z - wz) : S0.yaw;
  };

  // ----- the props of a scene -----
  function buildScaffold(S0) {
    const A = K.scaffold;
    const { X0, X1, Z0, Z1, H } = S0.sc;
    const sp = shapes();
    const along = (a, b) => (b - a > 3.2 ? [a, (a + b) / 2, b] : [a, b]);
    const xs = along(X0, X1);
    const zs = along(Z0, Z1);
    const poles = [];
    for (const x of xs) for (const z of [Z0, Z1]) poles.push([x, z]);
    for (const z of zs.slice(1, -1)) for (const x of [X0, X1]) poles.push([x, z]);
    const PH = H + 0.45;
    for (const [x, z] of poles) {
      sp.add('cyl8', A.pole, x, PH / 2, z, 0.16, PH, 0.16);
      sp.add('rbox', COLR.woodDeep, x, 0.03, z, 0.3, 0.06, 0.3);
    }
    const n = S0.sc.n;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    for (let k = 1; k <= n; k++) {
      const y = (k * H) / n;
      sp.rod(A.rail, V(X0, y, Z0), V(X1, y, Z0), 0.055);
      sp.rod(A.rail, V(X0, y, Z1), V(X1, y, Z1), 0.055);
      sp.rod(A.rail, V(X0, y, Z0), V(X0, y, Z1), 0.055);
      sp.rod(A.rail, V(X1, y, Z0), V(X1, y, Z1), 0.055);
      if (k < n) for (const z of [Z0, Z1]) sp.add('rbox', A.board, (X0 + X1) / 2, y - 0.08, z, X1 - X0 + 0.2, 0.07, 0.42);
    }
    const y1 = H / n;
    for (const z of [Z0, Z1]) {
      sp.rod(A.brace, V(X0, 0.12, z), V(X1, y1, z), 0.04, 5);
      sp.rod(A.brace, V(X1, 0.12, z), V(X0, y1, z), 0.04, 5);
    }
    for (const x of [X0, X1]) {
      sp.rod(A.brace, V(x, 0.12, Z0), V(x, y1, Z1), 0.04, 5);
      sp.rod(A.brace, V(x, 0.12, Z1), V(x, y1, Z0), 0.04, 5);
    }
    // the ladder up the front, by the right-hand corner
    const lx = S0.sc.lx;
    const lz = Z1 + 0.14;
    for (const dx of [-0.24, 0.24]) sp.rod(A.pole, V(lx + dx, 0, lz), V(lx + dx, H + 0.3, lz), 0.035, 5);
    for (let y = 0.35; y < H; y += 0.4) sp.rod(COLR.woodDark, V(lx - 0.24, y, lz), V(lx + 0.24, y, lz), 0.025, 4);
    // a pulley over the back left corner, its rope and a bucket of nails
    sp.rod(A.pole, V(X0, PH - 0.15, Z0), V(X0 - 0.15, PH + 0.25, Z0 + 0.9), 0.05);
    sp.add('cyl10', COLR.iron, X0 - 0.15, PH + 0.25, Z0 + 0.9, 0.26, 0.06, 0.26, 0, 0, PI / 2);
    sp.rod(COLR.rope, V(X0 - 0.15, PH + 0.18, Z0 + 0.9), V(X0 - 0.15, PH - 1.3, Z0 + 0.9), 0.02, 4);
    sp.add('cyl10', COLR.iron, X0 - 0.15, PH - 1.45, Z0 + 0.9, 0.36, 0.3, 0.36);
    // little flags along the top, front and back
    let f = 0;
    for (const z of [Z0, Z1]) {
      const m = Math.max(3, Math.round((X1 - X0) / 0.5));
      for (let i = 0; i < m; i++) {
        const x = X0 + ((i + 0.5) * (X1 - X0)) / m;
        const sag = 0.18 * Math.sin((PI * (i + 0.5)) / m);
        sp.add('cone', K.flags[f++ % K.flags.length], x, H + 0.16 - sag, z, 0.26, 0.32, 0.09, PI, 0, 0);
      }
      sp.rod(COLR.rope, V(X0, H + 0.34, z), V(X1, H + 0.34, z), 0.015, 3);
    }
    const g = sp.build();
    if (!g) return null;
    const mesh = new THREE.Mesh(g, sourceMat('ink'));
    mesh.name = 'construction:scaffold';
    mesh.userData.keep = true;
    const holder = new THREE.Group();
    holder.matrixAutoUpdate = false;
    holder.matrix.copy(S0.W).multiply(new THREE.Matrix4().makeTranslation(0, S0.floor, 0));
    holder.add(mesh);
    holder.visible = false;
    return { holder, mesh };
  }
  function buildCart() {
    if (shared.cartGeo) return shared.cartGeo;
    const L = K.cart.len;
    const Wd = K.cart.wid;
    const sp = shapes();
    // the bed on its axle, low sides, the wheels, the handle towards the pusher (+z), a load of planks and a crate
    sp.add('rbox', COLR.wood, 0, 0.42, 0, Wd, 0.1, L);
    for (const s of [-1, 1]) sp.add('rbox', COLR.woodDark, s * (Wd / 2 - 0.03), 0.53, 0, 0.06, 0.16, L);
    sp.add('rbox', COLR.woodDark, 0, 0.53, -L / 2 + 0.03, Wd, 0.16, 0.06);
    sp.add('cyl6', COLR.iron, 0, 0.24, -0.12, 0.06, Wd + 0.2, 0.06, 0, 0, PI / 2);
    for (const s of [-1, 1]) {
      sp.add('cyl14', COLR.woodDark, s * (Wd / 2 + 0.06), 0.24, -0.12, 0.48, 0.07, 0.48, 0, 0, PI / 2);
      sp.add('cyl8', COLR.iron, s * (Wd / 2 + 0.07), 0.24, -0.12, 0.14, 0.09, 0.14, 0, 0, PI / 2);
    }
    sp.add('box', COLR.woodDark, 0, 0.22, L / 2 - 0.1, 0.07, 0.07, 0.3, 0.5, 0, 0);
    for (const s of [-1, 1]) sp.add('box', COLR.woodDark, s * (Wd / 2 - 0.08), 0.62, L / 2 + 0.22, 0.05, 0.05, 0.62, -0.45, 0, 0);
    sp.add('cyl6', COLR.wood, 0, 0.75, L / 2 + 0.47, 0.06, Wd - 0.06, 0.06, 0, 0, PI / 2);
    for (let i = 0; i < 3; i++) sp.add('rbox', i % 2 ? COLR.plank : 0xe9c58a, 0, 0.5 + i * 0.055, 0.04, Wd - 0.16, 0.05, L - 0.12);
    sp.add('rbox', COLR.wood, 0.1, 0.78, -0.25, 0.32, 0.26, 0.3, 0, 0.3, 0);
    shared.cartGeo = sp.build();
    return shared.cartGeo;
  }

  // ----- the particles (precomputed, then a pure function of the scene's time) -----
  // bits / puffs: { t0, life, x, y, z, vx, vy, vz, g, s, sy, col, spin, kind }
  function seedRand(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function puffAt(S0, list, t0, x, y, z, n, size = 0.28, spread = 0.5, cols = COLR.dust) {
    const R = S0.R;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + R() * 0.8;
      list.push({ t0: t0 + R() * 0.05, life: 0.55 + R() * 0.25, x, y, z, vx: Math.sin(a) * spread * (0.6 + R() * 0.6), vy: 0.35 + R() * 0.45, vz: Math.cos(a) * spread * (0.6 + R() * 0.6), g: -0.4, s: size * (0.7 + R() * 0.6), col: cols[i % cols.length], grow: true });
    }
  }

  // ----- start -----
  function start(plot, from, to, opts = {}) {
    try {
      return begin(plot, from, to, opts);
    } catch (err) {
      console.warn('construction: start', err);
      try {
        finish();
      } catch {
        /* nothing more to do */
      }
      return false;
    }
  }
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  function begin(plot, from0, to0, opts) {
    const tStart = now();
    const prof = [];
    const mark = (n) => prof.push([n, +(now() - tStart).toFixed(1)]);
    const id = plotId(plot);
    if (!id) return false;
    const from = Number.isInteger(from0) ? from0 : 0;
    const to = Number.isInteger(to0) ? to0 : from + 1;
    if (!(to > from) || from < 0 || to > 3) return false;
    const newChunk = call(C.chunks, id, to);
    if (!newChunk || !CLASSES.some((c) => newChunk[c] && newChunk[c].verts)) return false;
    const oldChunk = call(C.chunks, id, from);
    if (S) finish();
    makeShared();
    const o = opts && typeof opts === 'object' ? opts : {};
    const kind = o.kind === 'new' || o.kind === 'upgrade' ? o.kind : from === 0 ? 'new' : 'upgrade';
    const amenity = o.kind === 'amenity' || (o.kind !== 'home' && !/^home/.test(id));
    const reduced = o.reduced === true;
    const fr = frames(id, plot);
    const v4 = ISLET[id] || /^(homeE|homeF|homeG|forge|fishing|farm|music|museum|observatory|aquarium|grotto)$/.test(id);
    const S0 = { id, plot, from, to, kind, amenity, reduced, v4, t: 0, L: sceneLength(kind, reduced), skipping: null, done: false, warmed: false, ...fr };
    S0.R = seedRand(0x5c3e + id.length * 977 + to * 131 + from * 17 + id.charCodeAt(0) * 7);
    S0.E = eventTimes(kind);
    // the camera the people wave to (the build view's pose)
    const pose = call(C.pose, id);
    S0.cam = pose && Array.isArray(pose.pos) ? { x: pose.pos[0], y: pose.pos[1], z: pose.pos[2] } : null;
    // what stands now and what will: footprints (work frame), tops, the cut heights
    mark('frames');
    const mOld = measure(S0, oldChunk);
    const mNew = measure(S0, newChunk);
    mark('measure');
    const fl = S0.floor;
    const box = (m, d) => (m.x1 > m.x0 && m.z1 > m.z0 ? { x0: m.x0, x1: m.x1, z0: m.z0, z1: m.z1 } : d);
    const padC = { x0: S0.padW.x0 + 0.4, x1: S0.padW.x1 - 0.4, z0: S0.padW.z0 + 0.4, z1: S0.padW.z1 - 0.4 };
    S0.fpNew = box(mNew, padC);
    S0.fpOld = box(mOld, S0.fpNew);
    const inf = (t) => (v4 ? call(info4, id, t) : null);
    const iNew = inf(to);
    const iOld = inf(from);
    const top = iNew && iNew.top > 0 ? fl + iNew.top : Number.isFinite(mNew.top) ? mNew.top : fl + 3;
    S0.secs = sections(mNew, Math.min(fl, fl), Math.max(top, fl + 0.5));
    mark('sections');
    const eaveNew = iNew && iNew.eave > 0.05 ? fl + iNew.eave : guessEave(fl, top, S0.secs);
    // the old tier: a shack folding into the cart (a new building), the old building (an upgrade), or an islet's
    // marked-out sand and board that stays until the new tier's cut passes it
    const oldTop = iOld && iOld.top > 0 ? fl + iOld.top : Number.isFinite(mOld.top) ? mOld.top : fl;
    let oldEave = fl;
    if (oldChunk && oldTop > fl + 0.3) {
      if (iOld && iOld.eave > 0.05 && from > 0) oldEave = fl + iOld.eave;
      else oldEave = guessEave(fl, oldTop, sections(mOld, fl, oldTop));
    }
    S0.oldMode = !oldChunk ? 'none' : kind === 'upgrade' ? 'upgrade' : from === 0 && v4 && iOld && iOld.footprint ? 'keep' : 'shack';
    S0.oldEave = oldEave;
    S0.oldTop = oldTop;
    S0.top = top;
    S0.eave = eaveNew;
    if (kind === 'upgrade') {
      S0.c0 = Math.max(fl + 0.3, Math.min(oldEave, eaveNew - 0.8));
      S0.c1 = Math.max(eaveNew, S0.c0 + 0.4);
    } else {
      S0.c0 = fl - 0.05;
      S0.c1 = Math.max(eaveNew, fl + 0.6);
    }
    S0.c2 = Math.max(top + 0.05, S0.c1 + 0.3);
    S0.p0 = kind === 'upgrade' ? S0.c0 : fl - 0.05;
    S0.p1 = S0.c2 + 0.25;
    // the walls' rectangle (posts, beams, blocks, chalk) and the scaffold round both buildings
    const wr = sectionAt(S0, Math.min(S0.c1 - 0.2, Math.max(S0.c0, fl) + 0.6));
    S0.walls = { x0: wr.x0, x1: wr.x1, z0: wr.z0, z1: wr.z1 };
    // (round the new building; an upgrade's round the old one too, which stands inside it until the walls rise)
    const u = kind === 'upgrade' ? { x0: Math.min(S0.fpNew.x0, S0.fpOld.x0), x1: Math.max(S0.fpNew.x1, S0.fpOld.x1), z0: Math.min(S0.fpNew.z0, S0.fpOld.z0), z1: Math.max(S0.fpNew.z1, S0.fpOld.z1) } : S0.fpNew;
    const A = K.scaffold;
    const P = S0.padW;
    const X0 = Math.max(P.x0 - 0.1, u.x0 - A.pad);
    const X1 = Math.min(P.x1 + 0.1, u.x1 + A.pad);
    const Z0 = Math.max(P.z0 - 0.1, u.z0 - A.pad);
    const Z1 = Math.min(P.z1 + 0.1, u.z1 + A.pad);
    const H = clamp((top - fl) * 0.8, A.minH, A.maxH);
    const n = Math.max(2, Math.round(H / A.level));
    S0.sc = { X0, X1, Z0, Z1, H, n, lx: X1 - 0.5, level: H / n };
    // where the crew work and the cart parks (on the porch, in front), and where the people moving in wave
    const cx = (S0.walls.x0 + S0.walls.x1) / 2;
    S0.front = Z1;
    S0.cart = { x: X0 + 0.55, z: Z1 + 0.82 };
    const back = (() => {
      const want = wp(S0, S0.cart.x, fl, S0.cart.z + K.cart.back);
      const q = call(C.walkPoint, want.x, want.z);
      if (q && fin(q.x) && fin(q.z)) {
        const l = new THREE.Vector3(q.x, 0, q.z).applyMatrix4(S0.Wi);
        const d = Math.hypot(l.x - S0.cart.x, l.z - S0.cart.z);
        if (d > 0.8 && d <= 8) return { x: l.x, z: l.z };
      }
      return { x: S0.cart.x, z: S0.cart.z + K.cart.back };
    })();
    S0.cartFrom = back;
    S0.stations = {
      chip: { x: S0.sc.lx, z: Z1 + 0.5 },
      mortar: { x: S0.cart.x + 0.7, z: Z1 + 0.45 },
      dab: { x: cx + 0.15, z: Z1 + 1.05 },
    };
    S0.cheer = { chip: { x: X1 - 0.25, z: Z1 + 0.85 }, mortar: { x: S0.cart.x + 0.75, z: Z1 + 1.15 }, dab: { x: cx + 0.95, z: Z1 + 1.25 } };
    // the door: buildings4's (the plot frame), else a SPEC3 home's, else the front of the walls
    S0.door = doorOf(S0, iNew);
    // the meshes: the new tier (and its fade twin), the blueprint, the old tier's walls and its roof
    const cut = new THREE.Plane(new THREE.Vector3(0, -1, 0), S0.c0);
    const cutB = new THREE.Plane(new THREE.Vector3(0, -1, 0), S0.c0);
    const ghostCut = new THREE.Plane(new THREE.Vector3(0, 1, 0), -S0.c0);
    const oldPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), FAR);
    const keepPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), FAR);
    const roofPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -oldEave);
    S0.planes = { cut, cutB, ghostCut, oldPlane, keepPlane, roofPlane };
    S0.Unew = uniforms(S0.p0, 0);
    S0.UnewB = uniforms(S0.p0, 0);
    S0.Uold = uniforms(FAR, 1);
    S0.newSet = meshSet(newChunk, [cut], S0.Unew, { name: 'new' });
    if (reduced) S0.newB = meshSet(newChunk, [cutB], S0.UnewB, { name: 'new-fade', fade: true, geos: S0.newSet.geos });
    const cx0 = (S0.fpNew.x0 + S0.fpNew.x1) / 2;
    const cz0 = (S0.fpNew.z0 + S0.fpNew.z1) / 2;
    const pc = wp(S0, cx0, fl, cz0);
    placePivot(S0.newSet, pc.x, fl, pc.z);
    if (S0.newB) placePivot(S0.newB, pc.x, fl, pc.z);
    group.add(S0.newSet.pivot);
    if (S0.newB) group.add(S0.newB.pivot);
    mark('newSet');
    // the work of the next frames (one job a frame, or 4 ms of them): the blueprint, the scaffold, the particles,
    // the crew (when the scene builds its own) and the people moving in
    S0.jobs = [];
    // what the two tiers share stands all through the scene (until this runs, the old tier draws whole)
    S0.jobs.push({ run: () => applySplit(S0, oldChunk, newChunk) });
    // the blueprint: one flat copy of what is to be built (every class in one mesh)
    S0.jobs.push({
      run() {
        S0.ghost = ghostMesh(newChunk, ghostCut, S0.split ? S0.split.built : null);
        if (S0.ghost) group.add(S0.ghost);
      },
    });
    if (oldChunk && S0.oldMode !== 'none') {
      const planes = S0.oldMode === 'keep' ? [keepPlane] : [oldPlane];
      S0.oldSet = meshSet(oldChunk, planes, S0.Uold, { name: 'old', offset: true });
      const oc = wp(S0, (S0.fpOld.x0 + S0.fpOld.x1) / 2, fl, (S0.fpOld.z0 + S0.fpOld.z1) / 2);
      placePivot(S0.oldSet, oc.x, fl, oc.z);
      S0.oldSet.pivot.userData.base = S0.oldSet.pivot.position.clone();
      S0.oldSet.pivot.visible = true;
      group.add(S0.oldSet.pivot);
      if (S0.oldMode !== 'keep' && oldTop > oldEave + 0.2) {
        S0.roofSet = meshSet(oldChunk, [roofPlane], S0.Uold, { name: 'roof', geos: S0.oldSet.geos });
        placePivot(S0.roofSet, oc.x, oldEave, oc.z);
        S0.roofSet.pivot.userData.base = S0.roofSet.pivot.position.clone();
        group.add(S0.roofSet.pivot);
      }
    }
    mark('old');
    // the scaffold (an upgrade's goes up in its first second) and the cart
    S0.jobs.push({
      run() {
        const sc = buildScaffold(S0);
        if (sc) {
          S0.scaffold = sc;
          group.add(sc.holder);
        }
      },
    });
    const cg = buildCart();
    if (cg) {
      S0.cartMesh = new THREE.Mesh(cg, sourceMat('ink'));
      S0.cartMesh.name = 'construction:cart';
      S0.cartMesh.userData.keep = true;
      group.add(S0.cartMesh);
    }
    mark('cart');
    // the crew and the people moving in
    const crew = crewList(S0);
    S0.crew = crew.list.slice(0, 3).map((b, i) => ({ id: b.id, name: b.name, p: b.p, own: crew.ownBuilt, role: ROLE[b.id] !== undefined ? b.id : ['chip', 'mortar', 'dab'][i] }));
    const folk = call(C.islanders);
    for (const b of S0.crew) if (!crew.ownBuilt && folk && typeof folk.hold === 'function') call(folk.hold.bind(folk), b.id, true);
    S0.movers = [];
    moverJobs(S0, id, to, amenity);
    // the particles of the whole scene, laid out once the scaffold is planned (none under reduced motion)
    S0.bitsList = [];
    S0.puffList = [];
    if (!reduced) S0.jobs.push({ run: () => planParticles(S0) });
    mark('crew');
    // local clipping (townMode switches it with the town view through main's setClipping; until then, here)
    clipOn();
    S = S0;
    group.visible = true;
    // the first frames draw every variant the scene will use (all of it clipped away), so no program compiles
    // mid-scene if warm() was not drawn
    S0.firstFrames = 2;
    apply(0);
    S0.startMs = now() - tStart;
    mark('apply');
    S0.prof = prof;
    return true;
  }
  /** Split the tiers by what they share: the new tier's meshes keep only what is built, the old tier's only what
   *  goes, and the shared part stands as it is (the layer's materials, unclipped: +1 call a class). */
  function applySplit(S0, oldChunk, newChunk) {
    if (!oldChunk || !S0.newSet) return;
    const sp = splitShared(oldChunk, newChunk);
    if (!sp.keptTris) return;
    S0.split = sp;
    S0.shared = sp.oldTris ? sp.keptTris / sp.oldTris : 0;
    const reindex = (set, by) => {
      if (!set) return;
      for (const [cls, g] of Object.entries(set.geos)) if (by[cls]) g.setIndex(new THREE.BufferAttribute(by[cls], 1));
      for (const m of set.meshes) m.visible = !!(by[m.userData.cls] && by[m.userData.cls].length);
    };
    reindex(S0.newSet, sp.built);
    if (S0.newB) for (const m of S0.newB.meshes) m.visible = !!(sp.built[m.userData.cls] && sp.built[m.userData.cls].length);
    if (S0.oldSet) {
      reindex(S0.oldSet, sp.oldOnly);
      if (S0.roofSet) for (const m of S0.roofSet.meshes) m.visible = !!(sp.oldOnly[m.userData.cls] && sp.oldOnly[m.userData.cls].length);
    }
    const kg = new THREE.Group();
    kg.name = 'construction:kept';
    kg.userData.keep = true;
    for (const cls of CLASSES) {
      const idx = sp.kept[cls];
      const src = S0.newSet.geos[cls];
      const m = sourceMat(cls);
      if (!idx || !idx.length || !src || !m) continue;
      const g = new THREE.BufferGeometry();
      for (const [k, a] of Object.entries(src.attributes)) g.setAttribute(k, a);
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.boundingSphere = src.boundingSphere;
      const mesh = new THREE.Mesh(g, m);
      mesh.name = `construction:kept:${cls}`;
      mesh.userData.keep = true;
      mesh.frustumCulled = false;
      kg.add(mesh);
    }
    S0.kept = kg;
    group.add(kg);
    // an upgrade that keeps most of the old building builds its additions from the deck up
    if (S0.kind === 'upgrade' && S0.shared >= 0.3) {
      S0.c0 = S0.floor - 0.05;
      S0.p0 = S0.floor - 0.05;
      S0.Unew.paint.value = S0.p0;
      S0.UnewB.paint.value = S0.p0;
    }
  }
  function doorOf(S0, iNew) {
    const d = call(C.door, S0.id, S0.to);
    let x;
    let z;
    let y = S0.floor;
    let w = 0.8;
    let h = 1.6;
    let ry = 0;
    let shown = false;
    const di = iNew && iNew.door ? iNew.door : null;
    if (di) {
      w = di.w;
      h = di.h;
      ry = di.ry || 0;
      const p = new THREE.Vector3(di.x, 0, di.z).applyMatrix4(S0.F).applyMatrix4(S0.Wi);
      x = p.x;
      z = p.z;
      y = S0.floor + (di.y || 0);
      // a door to open: a doorway of a person's size (not an open front, a ladder's foot or a hatch)
      shown = w >= 0.45 && w <= 1.3 && h >= 1.2;
    } else if (SPEC3_HOMES[S0.id]) {
      const H = SPEC3_HOMES[S0.id];
      const p = new THREE.Vector3(H.at[0] - 0.75, 0, H.at[1] + 1.35).applyMatrix4(S0.F).applyMatrix4(S0.Wi);
      x = p.x;
      z = p.z;
      shown = true;
    }
    if (d && fin(d.x) && fin(d.z)) {
      const p = new THREE.Vector3(d.x, 0, d.z).applyMatrix4(S0.Wi);
      x = p.x;
      z = p.z;
      if (!di && fin(d.y)) y = d.y;
    }
    if (!fin(x)) {
      x = (S0.walls.x0 + S0.walls.x1) / 2;
      z = S0.fpNew.z1;
      shown = false;
    }
    // the way the door faces, in the work frame (the kit frame's +z turned ry)
    const faceW = S0.fry + ry - S0.yaw;
    return { x, z, y, w, h, faceW, shown };
  }
  function ghostMesh(chunk, plane, only = null) {
    const parts = [];
    for (const cls of CLASSES) {
      const c = chunk[cls];
      if (!c || !c.verts) continue;
      const index = only && only[cls] ? only[cls] : c.index;
      if (index.length) parts.push({ pos: c.pos, nor: c.nor, verts: c.verts, index });
    }
    if (!parts.length) return null;
    let verts = 0;
    let idx = 0;
    for (const p of parts) {
      verts += p.verts;
      idx += p.index.length;
    }
    const pos = new Float32Array(verts * 3);
    const nor = new Float32Array(verts * 3);
    const index = new Uint32Array(idx);
    let vo = 0;
    let io = 0;
    for (const p of parts) {
      pos.set(p.pos, vo * 3);
      nor.set(p.nor, vo * 3);
      const I = p.index;
      for (let i = 0; i < I.length; i++) index[io++] = I[i] + vo;
      vo += p.verts;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeBoundingSphere();
    const m = shared.ghostMat.clone();
    m.onBeforeCompile = ghostShader;
    m.customProgramCacheKey = () => 'construction-ghost';
    m.clippingPlanes = [plane];
    const mesh = new THREE.Mesh(g, m);
    mesh.name = 'construction:blueprint';
    mesh.userData.keep = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    mesh.visible = false;
    return mesh;
  }
  function planParticles(S0) {
    const R = S0.R;
    const fl = S0.floor;
    const B = S0.bitsList;
    const Pf = S0.puffList;
    const W = S0.walls;
    // the blocks' dust, the old roof's and the shack's poofs
    if (S0.kind === 'new') {
      for (let i = 0; i < 6; i++) {
        const b = blockSpot(S0, i);
        const p = wp(S0, b.x, fl + 0.05, b.z);
        puffAt(S0, Pf, at(S0, 'block', i) + K.blocks.fall, p.x, p.y, p.z, 3, 0.22, 0.7);
      }
      const ct = wp(S0, S0.cart.x, fl + 0.8, S0.cart.z);
      puffAt(S0, Pf, at(S0, 'shackFold') + K.fold * 0.85, ct.x, ct.y, ct.z, 6, 0.32, 0.8);
    }
    if (S0.roofSet) {
      const rc = S0.roofSet.pivot.position;
      puffAt(S0, Pf, at(S0, 'roofLift') + K.roof.rise + K.roof.pop * 0.7, rc.x, S0.oldEave + K.roof.lift + 0.4, rc.z, 7, 0.3, 0.9);
    }
    // sawdust off the plank band while the walls rise
    const s3 = S0.E.span(3);
    for (let i = 0; i < K.counts.sawdust; i++) {
      const t0 = s3[0] + 0.1 + (i / K.counts.sawdust) * (s3[1] - s3[0] - 0.25);
      const c = cutAt(S0, t0);
      const sx = W.x0 + R() * (W.x1 - W.x0);
      const p = wp(S0, sx, c, S0.walls.z1 + 0.12);
      const dir = new THREE.Vector3(0, 0, 1).applyAxisAngle(UP, S0.yaw);
      B.push({ t0, life: 0.7, x: p.x, y: p.y, z: p.z, vx: dir.x * (0.5 + R()) + (R() - 0.5) * 0.6, vy: 0.6 + R() * 0.9, vz: dir.z * (0.5 + R()) + (R() - 0.5) * 0.6, g: -5.5, s: 0.05 + R() * 0.04, sy: 0.02, col: COLR.saw[i % 3], spin: 6 + R() * 8 });
    }
    // the tiles' puffs and the topper's
    for (let i = 0; i < 4; i++) {
      const c = cutAt(S0, at(S0, 'tiles', i) + K.tile);
      const sct = sectionAt(S0, c);
      const p = wp(S0, sct.x1 + 0.05, c, sct.z1 + 0.05);
      puffAt(S0, Pf, at(S0, 'tiles', i) + K.tile * 0.8, p.x, p.y, p.z, 2, 0.16, 0.4);
    }
    const tp = wp(S0, (W.x0 + W.x1) / 2, S0.c2, (W.z0 + W.z1) / 2);
    puffAt(S0, Pf, at(S0, 'topper'), tp.x, tp.y + 0.1, tp.z, 5, 0.22, 0.6, COLR.spark);
    // sparkles over the windows and the sign
    const ts = at(S0, 'sparkle');
    for (let i = 0; i < K.counts.sparkles; i++) {
      const sx = W.x0 + 0.2 + R() * Math.max(0.1, W.x1 - W.x0 - 0.4);
      const sy = fl + 0.6 + R() * Math.max(0.2, S0.c1 - fl - 0.4);
      const p = wp(S0, sx, sy, W.z1 + 0.25);
      B.push({ t0: ts + i * 0.06, life: 0.75, x: p.x, y: p.y, z: p.z, vx: 0, vy: 0.25, vz: 0, g: 0, s: 0.11, sy: 0.11, col: COLR.spark[i % 3], spin: 3, twinkle: true });
    }
    // the scaffold folding down: dust at its feet
    const sd = at(S0, 'scaffoldDown') + K.scaffold.fold;
    for (const [x, z] of [[S0.sc.X0, S0.sc.Z1], [S0.sc.X1, S0.sc.Z1]]) {
      const p = wp(S0, x, fl + 0.1, z);
      puffAt(S0, Pf, sd, p.x, p.y, p.z, 3, 0.26, 0.6);
    }
    // the confetti: <= 40 bits over the porch
    const tc = at(S0, 'confetti');
    const cc = wp(S0, S0.door.x, fl + 2.3, S0.front + 0.6);
    for (let i = 0; i < K.counts.confetti; i++) {
      const a = R() * TAU;
      const sp = 0.8 + R() * 1.6;
      B.push({ t0: tc + R() * 0.08, life: 1.5 + R() * 0.4, x: cc.x, y: cc.y, z: cc.z, vx: Math.sin(a) * sp, vy: 1.6 + R() * 1.6, vz: Math.cos(a) * sp, g: -3.2, drag: 1.6, s: 0.09, sy: 0.012, sz: 0.06, col: COLR.confetti[i % COLR.confetti.length], spin: 5 + R() * 9 });
    }
  }
  function blockSpot(S0, i) {
    const W = S0.walls;
    const ix = 0.12;
    const xs = [W.x0 + ix + K.blocks.w / 2, W.x1 - ix - K.blocks.w / 2];
    const zs = [W.z0 + ix + K.blocks.d / 2, W.z1 - ix - K.blocks.d / 2];
    const spots = [
      [xs[0], zs[1]],
      [xs[1], zs[1]],
      [(xs[0] + xs[1]) / 2, zs[1]],
      [xs[0], zs[0]],
      [xs[1], zs[0]],
      [(xs[0] + xs[1]) / 2, zs[0]],
    ];
    const s = spots[i % 6];
    return { x: s[0], z: s[1] };
  }

  // ----- the timeline, drawn -----
  function cutAt(S0, T) {
    const s3 = S0.E.span(3);
    const s4 = S0.E.span(4);
    const tc = Math.min(at(S0, 'cut'), s3[1]);
    if (T < tc) return S0.c0;
    if (T < s4[0]) return S0.c0 + (S0.c1 - S0.c0) * ease((T - tc) / Math.max(0.05, s3[1] - 0.05 - tc));
    let c = S0.c1;
    for (let i = 0; i < 4; i++) {
      const ti = at(S0, 'tiles', i);
      if (T < ti) break;
      const b = S0.c1 + ((S0.c2 - S0.c1) * (i + 1)) / 4;
      c = c + (b - c) * easeOut((T - ti) / K.tile);
    }
    return c;
  }
  function paintAt(S0, T) {
    const t0 = at(S0, 'paint');
    if (T < t0) return S0.p0;
    const s5 = S0.E.span(5);
    const k = (T - t0) / Math.max(0.1, (s5[1] - s5[0]) * K.paint);
    return k >= 1 ? FAR : S0.p0 + (S0.p1 - S0.p0) * ease(k);
  }
  const litAt = (S0, T) => clamp((T - at(S0, 'lights')) / K.lights, 0, 1);

  /** Everything drawn at full-motion time T (still: under reduced motion, the stills' settled states). */
  function apply(T, still = false, fadeFrom = null, fadeK = 1, animT = T) {
    const S0 = S;
    if (!S0) return;
    const sh = makeShared();
    const fl = S0.floor;
    const kind = S0.kind;
    const span = S0.E.span;
    const skip = !!S0.skipping;
    const end = skip || T >= S0.E.L;
    // (a clipped mesh is drawn only once local clipping is known to be on: unclipped, it would show it all)
    const clip = clipReady();
    const first = S0.firstFrames > 0 && clip;
    // --- the new tier: hidden until its walls rise, then the cut, the paint, the lights, the topper's squash ---
    const tierState = (T0) => {
      if (skip) return { on: true, cut: FAR, paint: FAR, lit: 1, sq: 1 };
      const on = T0 >= Math.min(at(S0, 'cut'), span(3)[1]);
      let cut = cutAt(S0, T0);
      const tt = at(S0, 'topper');
      let sq = 1;
      if (T0 >= tt) {
        cut = FAR;
        const u = (T0 - tt) / K.topper;
        if (!still && u < 1) sq = 1 - 0.07 * Math.sin(u * PI * 2) * (1 - u);
      }
      return { on, cut, paint: paintAt(S0, T0), lit: litAt(S0, T0), sq };
    };
    const A = tierState(fadeFrom !== null ? fadeFrom : T);
    const setTier = (set, U, plane, st) => {
      set.pivot.visible = (st.on || first) && clip;
      plane.constant = first && !st.on ? -FAR : st.cut;
      U.paint.value = st.paint;
      U.lit.value = st.lit;
      set.pivot.scale.set(1 / Math.sqrt(st.sq), st.sq, 1 / Math.sqrt(st.sq));
    };
    if (S0.newSet) setTier(S0.newSet, S0.Unew, S0.planes.cut, A);
    if (S0.newB) {
      const B = tierState(T);
      const fading = fadeFrom !== null && fadeK < 1;
      setTier(S0.newB, S0.UnewB, S0.planes.cutB, { ...B, on: (fading && B.on) || first });
      for (const m of S0.newB.mats) m.opacity = fading ? fadeK : 0;
      if (first && !fading) S0.planes.cutB.constant = -FAR;
    }
    // --- the blueprint: from its cue until the roof is on ---
    if (S0.ghost) {
      const c = fadeFrom !== null ? A.cut : tierState(T).cut;
      S0.ghost.visible = clip && (first || (!skip && T >= at(S0, 'blueprint') && T < span(5)[0] && c < S0.c2));
      S0.planes.ghostCut.constant = first ? -FAR : -Math.min(c, FAR);
    }
    // --- the old tier ---
    if (S0.oldSet) {
      const O = S0.oldSet;
      let on = !skip;
      let plane = FAR;
      let sx = 1;
      let sy = 1;
      let dx = 0;
      let dz = 0;
      const tr = at(S0, 'roofLift');
      if (S0.oldMode === 'keep') {
        // an islet's marked-out plot: stands until the new tier's cut passes it, then only above the cut
        if (T >= span(5)[0]) on = false;
        S0.planes.keepPlane.constant = T >= Math.min(at(S0, 'cut'), span(3)[1]) ? -A.cut : FAR;
      } else {
        if (T >= tr) plane = S0.oldEave;
        if (S0.oldMode === 'shack') {
          const tf = at(S0, 'shackFold');
          if (T >= tf) {
            const u = still ? 1 : clamp((T - tf) / K.fold, 0, 1);
            const e = ease(u);
            // (it shrinks into the cart as it folds, and is gone before it is flat: a squashed shack shades dark)
            sy = 1 - 0.8 * e;
            sx = 1 - 0.7 * e;
            const ct = wp(S0, S0.cart.x, fl, S0.cart.z);
            dx = (ct.x - O.pivot.userData.base.x) * e;
            dz = (ct.z - O.pivot.userData.base.z) * e;
            if (u >= 0.9) on = false;
          }
        } else if (T >= Math.min(at(S0, 'cut'), span(3)[1]) && A.cut >= S0.oldEave - 0.02) on = false;
        if (S0.oldMode === 'upgrade' && T >= span(5)[0]) on = false;
      }
      const b = O.pivot.userData.base;
      O.pivot.position.set(b.x + dx, b.y, b.z + dz);
      O.pivot.scale.set(sx, sy, sx);
      O.inner.position.set(-b.x, -b.y, -b.z);
      if (S0.oldMode !== 'keep') S0.planes.oldPlane.constant = plane >= FAR ? FAR : fl + sy * (plane - fl);
      // (unclipped, the old tier may show only while whole)
      O.pivot.visible = (on || first) && (clip || (S0.oldMode !== 'keep' ? plane >= FAR : S0.planes.keepPlane.constant >= FAR));
      // the roof lifting off and popping into a puff
      if (S0.roofSet) {
        const Rf = S0.roofSet;
        const rb = Rf.pivot.userData.base;
        const u = (T - tr) / K.roof.rise;
        const v = (T - tr - K.roof.rise) / K.roof.pop;
        const showR = !skip && T >= tr && v < 1;
        const lift = still ? 0 : K.roof.lift * easeOut(u);
        const s = v > 0 ? 1 - ease(v) : 1;
        Rf.pivot.position.set(rb.x, rb.y + lift, rb.z);
        Rf.pivot.scale.setScalar(Math.max(0.001, s));
        Rf.pivot.rotation.y = still ? 0 : 0.25 * easeOut(u) + 0.6 * clamp(v, 0, 1);
        S0.planes.roofPlane.constant = first && !showR ? -FAR : -(S0.oldEave + lift);
        Rf.pivot.visible = ((showR && !still) || first) && clip;
      }
    }
    // --- the scaffold: up in the frame stage (an upgrade's round the old building first), down in the finish ---
    if (S0.scaffold) {
      const tu = kind === 'upgrade' ? at(S0, 'scaffoldUp') : span(2)[0] + 0.05;
      const td = at(S0, 'scaffoldDown');
      let k = 0;
      if (!skip && T >= tu) k = still ? 1 : popK((T - tu) / K.scaffold.pop);
      if (T >= td) k = still ? 0 : 1 - ease((T - td) / K.scaffold.fold);
      S0.scaffold.mesh.scale.set(1, k > 0.02 ? k : 1e-4, 1);
      S0.scaffold.holder.visible = k > 0.02 || first;
    }
    // --- the cart: pushed in over the first stage, then parked ---
    const s0 = span(0);
    const cu = still ? 1 : clamp((T - s0[0] - 0.04) / ((s0[1] - s0[0]) * 0.85), 0, 1);
    const cartZ = S0.cartFrom.z + (S0.cart.z - S0.cartFrom.z) * easeOut(cu);
    const cartX = S0.cartFrom.x + (S0.cart.x - S0.cartFrom.x) * easeOut(cu);
    if (S0.cartMesh) {
      const p = wp(S0, cartX, fl, cartZ);
      S0.cartMesh.position.copy(p);
      const dirA = Math.atan2(S0.cart.x - S0.cartFrom.x, S0.cart.z - S0.cartFrom.z);
      S0.cartMesh.rotation.set(0, S0.yaw + dirA + PI, 0);
      S0.cartMesh.visible = !end || skip || T < S0.E.L;
    }
    // --- the instanced props ---
    let nb = 0;
    const bx = sh.boxes;
    const putBox = (x, y, z, w, h, d, hex, ry = 0, rx = 0, rz = 0) => {
      if (nb >= K.cap.boxes) return;
      _q.setFromEuler(_e.set(rx, S0.yaw + ry, rz, 'YXZ'));
      bx.setMatrixAt(nb, _m.compose(_v.set(x, y, z), _q, _s.set(Math.max(1e-3, w), Math.max(1e-3, h), Math.max(1e-3, d))));
      bx.setColorAt(nb, _c.setHex(hex));
      nb++;
    };
    const putBoxW = (x, y, z, w, h, d, hex, ry = 0, rx = 0, rz = 0) => {
      const p = wp(S0, x, y, z, _v2);
      putBox(p.x, p.y, p.z, w, h, d, hex, ry, rx, rz);
    };
    const Wr = S0.walls;
    const B = K.blocks;
    if (kind === 'new' && !skip && T < span(5)[0]) {
      for (let i = 0; i < 6; i++) {
        const t0 = at(S0, 'block', i);
        if (T < t0 && !first) continue;
        const u = still ? 1 : clamp((T - t0) / B.fall, 0, 1);
        const y = fl + B.h / 2 + B.drop * (1 - u * u);
        const land = still ? 1 : (T - t0 - B.fall) / 0.2;
        const sq = land > 0 && land < 1 ? 1 - 0.18 * Math.sin(land * PI) : 1;
        const b = blockSpot(S0, i);
        putBoxW(b.x, y - (1 - sq) * B.h * 0.5, b.z, B.w / Math.sqrt(sq), B.h * sq, B.d / Math.sqrt(sq), i % 2 ? COLR.stone : COLR.stoneDark, (i % 3) * 0.06 - 0.06);
      }
    }
    // the frame: four corner posts, then four beams snapping across
    const P = K.posts;
    if (!skip && T < span(4)[0]) {
      const base = kind === 'upgrade' ? S0.c0 : fl;
      const ph = Math.max(0.6, S0.c1 - base);
      const corners = [[Wr.x0, Wr.z1], [Wr.x1, Wr.z1], [Wr.x1, Wr.z0], [Wr.x0, Wr.z0]];
      for (let i = 0; i < 4; i++) {
        const t0 = at(S0, 'post', i);
        if (T < t0 && !first) continue;
        const k = still ? 1 : popK((T - t0) / P.pop);
        const [x, z] = corners[i];
        putBoxW(x, base + (ph * k) / 2, z, P.w, ph * Math.max(0.02, k), P.w, COLR.wood);
      }
      for (let i = 0; i < 4; i++) {
        const t0 = at(S0, 'beam', i);
        if (T < t0 && !first) continue;
        const k = still ? 1 : easeOut((T - t0) / P.snap);
        const [ax, az] = corners[i];
        const [bx2, bz] = corners[(i + 1) % 4];
        const L = Math.hypot(bx2 - ax, bz - az);
        const mx = ax + ((bx2 - ax) * k) / 2;
        const mz = az + ((bz - az) * k) / 2;
        const ang = Math.atan2(bx2 - ax, bz - az);
        putBoxW(mx, base + ph - P.beam / 2, mz, P.beam, P.beam, Math.max(0.02, L * k + P.w), COLR.woodDark, ang);
      }
    }
    // the plank band riding the cut (walls and roof stages)
    const cNow = A.cut;
    const s3 = span(3);
    const s4 = span(4);
    if (!skip && ((T >= Math.min(at(S0, 'cut'), s3[1]) && T < s4[1] && cNow < S0.c2 - 0.02) || first)) {
      const sct = sectionAt(S0, Math.min(cNow, S0.c2 - 0.05));
      const o = K.band.out;
      const x0 = sct.x0 - o;
      const x1 = sct.x1 + o;
      const z0 = sct.z0 - o;
      const z1 = sct.z1 + o;
      const y = cNow - K.band.h / 2 + 0.03;
      const t = K.band.t;
      putBoxW((x0 + x1) / 2, y, z1, x1 - x0 + t, K.band.h, t, COLR.plank);
      putBoxW((x0 + x1) / 2, y, z0, x1 - x0 + t, K.band.h, t, COLR.plank);
      putBoxW(x0, y, (z0 + z1) / 2, t, K.band.h, z1 - z0 + t, 0xe9c58a);
      putBoxW(x1, y, (z0 + z1) / 2, t, K.band.h, z1 - z0 + t, 0xe9c58a);
    }
    // the shack folded into the cart: a bundle of boards on it
    if (kind === 'new' && T >= at(S0, 'shackFold') + K.fold && !end) {
      const cp = wp(S0, cartX, fl, cartZ);
      for (let i = 0; i < 3; i++) putBox(cp.x, fl + 0.72 + i * 0.07, cp.z, K.cart.wid - 0.22 - i * 0.05, 0.06, K.cart.len - 0.3 - i * 0.08, [COLR.wood, 0xe9c58a, COLR.woodDark][i], 0.1 * (i - 1));
    }
    // the door opening
    const D = S0.door;
    if (D.shown && !skip && T >= at(S0, 'door')) {
      const u = still ? 1 : clamp((T - at(S0, 'door')) / K.door.swing, 0, 1);
      const ang = K.door.open * easeOut(u);
      // the leaf, hinged on its left, swinging out
      const hw = (D.w - 0.12) / 2;
      const hx = D.x - hw * Math.cos(D.faceW);
      const hz = D.z + hw * Math.sin(D.faceW);
      const a = D.faceW - ang;
      const lx = hx + hw * Math.cos(a) + 0.18 * Math.sin(D.faceW);
      const lz = hz - hw * Math.sin(a) + 0.18 * Math.cos(D.faceW);
      putBoxW(lx, D.y + 0.06 + (D.h - 0.12) / 2, lz, D.w - 0.12, D.h - 0.12, 0.06, 0x7b4a2b, a);
    }
    // the suitcases in the movers' hands
    for (const m of S0.movers) {
      if (!m.suitcase || !m.p.visible) continue;
      handPosition(m.p, 1, _v2);
      putBox(_v2.x, _v2.y - 0.17, _v2.z, 0.36, 0.26, 0.13, COLR.case, m.p.rotation.y - S0.yaw);
    }
    const probe = S0.firstFrames > 0; // (drawn in the first frames: they warm and hand over the renderer)
    if (probe && nb === 0) {
      bx.setMatrixAt(0, _m.makeScale(1e-4, 1e-4, 1e-4));
      nb = 1;
    }
    bx.count = nb;
    bx.visible = nb > 0;
    sh.boxInk.count = nb;
    sh.boxInk.visible = nb > 0;
    bx.instanceMatrix.needsUpdate = true;
    if (bx.instanceColor) bx.instanceColor.needsUpdate = true;
    // --- bits: chalk, sawdust, sparkles, bunting, the doorway, confetti ---
    let nbt = 0;
    const bt = sh.bits;
    const putBit = (x, y, z, w, h, d, hex, ry = 0, rx = 0, rz = 0) => {
      if (nbt >= K.cap.bits) return;
      _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
      bt.setMatrixAt(nbt, _m.compose(_v.set(x, y, z), _q, _s.set(Math.max(1e-3, w), Math.max(1e-3, h), Math.max(1e-3, d))));
      bt.setColorAt(nbt, _c.setHex(hex));
      nbt++;
    };
    if (kind === 'new' && !skip && ((T >= span(1)[0] && T < s3[1]) || first)) {
      const o = 0.06;
      const x0 = Wr.x0 - o;
      const x1 = Wr.x1 + o;
      const z0 = Wr.z0 - o;
      const z1 = Wr.z1 + o;
      const seg = (ax, az, bx2, bz) => {
        const L = Math.hypot(bx2 - ax, bz - az);
        const n = Math.max(2, Math.round(L / 0.3));
        for (let i = 0; i < n; i++) {
          if (i % 2) continue; // a dashed chalk line
          const f = (i + 0.5) / n;
          const p = wp(S0, ax + (bx2 - ax) * f, fl + 0.012, az + (bz - az) * f, _v2);
          putBit(p.x, p.y, p.z, 0.05, 0.012, L / n, COLR.chalk, S0.yaw + Math.atan2(bx2 - ax, bz - az));
        }
      };
      seg(x0, z1, x1, z1);
      seg(x1, z1, x1, z0);
      seg(x1, z0, x0, z0);
      seg(x0, z0, x0, z1);
    }
    // the doorway's dark inside, once the door swings
    if (D.shown && !skip && T >= at(S0, 'door')) {
      const p = wp(S0, D.x + 0.14 * Math.sin(D.faceW), D.y + 0.06 + (D.h - 0.12) / 2, D.z + 0.14 * Math.cos(D.faceW), _v2);
      putBit(p.x, p.y, p.z, D.w - 0.14, D.h - 0.14, 0.02, COLR.doorway, S0.yaw + D.faceW);
    }
    // bunting along the front at the eaves, unfurling flag by flag
    const tb = at(S0, 'bunting');
    // (it pops away again flag by flag in the scene's last moments: the town's building has none of its own)
    const tA = S0.E.L - K.buntingAway;
    const away = (i) => (still ? 1 : 1 - ease((T - tA - i * 0.03) / 0.15));
    const awayL = still ? 1 : 1 - clamp((T - tA) / (K.counts.flags * 0.03 + 0.15), 0, 1);
    if (T >= tb && !skip) {
      const n = K.counts.flags;
      const y0 = Math.min(S0.c1, fl + 3.2) - 0.05;
      const xa = Wr.x0 + 0.05;
      const xb = Wr.x1 - 0.05;
      const z = Wr.z1 + 0.22;
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        const k = still ? 1 : popK((T - tb - i * 0.05) / 0.22) * away(i);
        if (k <= 0) continue;
        const sag = 0.22 * Math.sin(PI * f);
        const p = wp(S0, xa + (xb - xa) * f, y0 - sag - 0.13, z, _v2);
        putBit(p.x, p.y, p.z, 0.19 * k, 0.19 * k, 0.015, K.flags[i % K.flags.length], S0.yaw, 0, PI / 4);
      }
      const kL = still ? 1 : Math.min(clamp((T - tb) / (n * 0.05), 0, 1), awayL);
      const m = 8;
      for (let i = 0; i < m; i++) {
        const f0 = i / m;
        const f1 = Math.min((i + 1) / m, kL);
        if (f1 <= f0) break;
        const ax = xa + (xb - xa) * f0;
        const bx2 = xa + (xb - xa) * f1;
        const ay = y0 - 0.22 * Math.sin(PI * f0);
        const by = y0 - 0.22 * Math.sin(PI * f1);
        const p = wp(S0, (ax + bx2) / 2, (ay + by) / 2, z, _v2);
        putBit(p.x, p.y, p.z, Math.hypot(bx2 - ax, by - ay), 0.018, 0.018, COLR.rope, S0.yaw, 0, Math.atan2(by - ay, bx2 - ax));
      }
    }
    // the particles
    for (const q of S0.bitsList) {
      const u = T - q.t0;
      if (u < 0 || u > q.life || skip) continue;
      const dr = q.drag ? (1 - Math.exp(-q.drag * u)) / q.drag : u;
      const x = q.x + q.vx * dr;
      const z = q.z + q.vz * dr;
      const y = Math.max(fl + 0.01, q.y + q.vy * dr + 0.5 * q.g * u * u * (q.drag ? 0.55 : 1));
      let s = q.s;
      if (q.twinkle) s *= Math.sin((u / q.life) * PI);
      const sp = q.spin * u;
      putBit(x, y, z, s, q.sy === q.s ? s : q.sy || s, q.sz || s, q.col, sp, sp * 0.7, sp * 0.4);
    }
    // (a skip's wave keeps one invisible bit drawn: its heartbeat steps the wave if the caller has stopped stepping)
    if ((probe || skip) && nbt === 0) {
      bt.setMatrixAt(0, _m.makeScale(1e-4, 1e-4, 1e-4));
      nbt = 1;
    }
    bt.count = nbt;
    bt.visible = nbt > 0;
    bt.instanceMatrix.needsUpdate = true;
    if (bt.instanceColor) bt.instanceColor.needsUpdate = true;
    // --- puffs ---
    let np = 0;
    const pf = sh.puffs;
    for (const q of S0.puffList) {
      const u = T - q.t0;
      if (u < 0 || u > q.life || skip) continue;
      if (np >= K.cap.puffs) break;
      const k = u / q.life;
      const s = q.s * (0.5 + 0.9 * easeOut(k)) * (1 - ease((k - 0.6) / 0.4));
      if (s <= 0.002) continue;
      pf.setMatrixAt(np, _m.compose(_v.set(q.x + q.vx * u, q.y + q.vy * u + 0.5 * q.g * u * u, q.z + q.vz * u), _q.identity(), _s.set(s, s * 0.85, s)));
      pf.setColorAt(np, _c.setHex(q.col));
      np++;
    }
    if (probe && np === 0) {
      pf.setMatrixAt(0, _m.makeScale(1e-4, 1e-4, 1e-4));
      np = 1;
    }
    pf.count = np;
    pf.visible = np > 0;
    pf.instanceMatrix.needsUpdate = true;
    if (pf.instanceColor) pf.instanceColor.needsUpdate = true;
    // --- the people ---
    posePeople(T, still, animT);
  }

  function posePeople(T, still, animT = T) {
    const S0 = S;
    const fl = S0.floor;
    const span = S0.E.span;
    const skip = !!S0.skipping;
    const tw = at(S0, 'wave');
    const cheerAll = skip || T >= tw;
    const tt = still ? 0.35 : animT; // a still holds one pose
    const g = (x, z) => {
      const q = call(C.groundY, wp(S0, x, 0, z).x, wp(S0, x, 0, z).z);
      return fin(q) ? q : fl;
    };
    for (const b of S0.crew) {
      const role = b.role;
      const st = S0.stations[role];
      const ch = S0.cheer[role];
      let x = st.x;
      let z = st.z;
      let y = g(x, z);
      let h = PI; // facing the building (-z in the work frame)
      let act = 'idle';
      let speed = 1;
      const s0 = span(0);
      const arrive = s0[0] + (s0[1] - s0[0]) * 0.89;
      if (!still && !skip && T < arrive) {
        // in from the walk with the cart (Chip pushing it)
        const u = easeOut(clamp((T - s0[0] - 0.04) / (arrive - s0[0] - 0.04), 0, 1));
        const off = { chip: [0, K.cart.len / 2 + 0.55], mortar: [0.72, 0.15], dab: [-0.62, 0.35] }[role] || [0, 0];
        const fx = S0.cartFrom.x + off[0];
        const fz = S0.cartFrom.z + off[1];
        const tx = role === 'chip' ? S0.cart.x + off[0] : st.x;
        const tz = role === 'chip' ? S0.cart.z + off[1] : st.z;
        x = fx + (tx - fx) * u;
        z = fz + (tz - fz) * u;
        y = g(x, z);
        h = Math.atan2(tx - fx, tz - fz);
        act = role === 'chip' ? 'carry' : 'run';
        speed = role === 'chip' ? 1.5 : 1.1;
      } else if (!still && !skip && role === 'chip' && T < at(S0, 'ladder')) {
        // from behind the cart to his corner
        const t0 = arrive;
        const t1 = Math.min(arrive + 0.6, at(S0, 'ladder'));
        const u = clamp((T - t0) / Math.max(0.1, t1 - t0), 0, 1);
        const fx = S0.cart.x;
        const fz = S0.cart.z + K.cart.len / 2 + 0.55;
        x = fx + (st.x - fx) * ease(u);
        z = fz + (st.z - fz) * ease(u);
        y = g(x, z);
        h = u < 1 ? Math.atan2(st.x - fx, st.z - fz) : PI;
        act = u < 1 ? 'walk' : 'hammer';
      } else if (role === 'chip' && !skip && !still && T < at(S0, 'scaffoldDown')) {
        // up the ladder, onto the scaffold's planks, hammering; down again before it folds
        const tl = at(S0, 'ladder');
        const td = at(S0, 'scaffoldDown') - 0.55;
        const lv = S0.sc.level - 0.08 + 0.035;
        const ladX = S0.sc.lx;
        const ladZ = S0.front + 0.48;
        if (T < tl + 0.55) {
          const u = clamp((T - tl) / 0.55, 0, 1);
          x = ladX;
          z = ladZ;
          y = fl + lv * ease(u);
          act = 'haul';
          speed = 1.6;
        } else if (T < td) {
          x = ladX - 0.55;
          z = S0.front;
          y = fl + lv;
          act = 'hammer';
        } else {
          const u = clamp((T - td) / 0.5, 0, 1);
          x = ladX;
          z = ladZ;
          y = fl + lv * (1 - ease(u));
          act = u < 1 ? 'haul' : 'idle';
          speed = 1.6;
        }
        h = PI;
      } else {
        // at work at their stations
        const s5 = span(5);
        if (role === 'mortar') act = T < span(2)[0] ? 'hammer' : T < s5[0] ? 'measure' : 'proud';
        if (role === 'dab') {
          if (T >= at(S0, 'paint') && T < s5[1]) {
            // Dab's brush sweeps along the front with the paint
            const k = clamp((T - at(S0, 'paint')) / ((s5[1] - s5[0]) * K.paint), 0, 1);
            x = S0.walls.x0 + 0.35 + (S0.walls.x1 - S0.walls.x0 - 0.7) * k;
            z = S0.walls.z1 + 0.5;
            act = 'scrub';
          } else act = T < span(1)[0] ? 'idle' : T < span(3)[0] ? 'point' : 'idle';
        }
        if (role === 'chip') act = 'idle';
      }
      if (cheerAll && !(role === 'chip' && !skip && T < at(S0, 'scaffoldDown'))) {
        x = ch.x;
        z = ch.z;
        y = g(x, z);
        const w = wp(S0, x, y, z);
        h = towards(S0, w.x, w.z) - S0.yaw;
        act = 'cheer';
      } else if (T >= at(S0, 'out') && act === 'idle') {
        const w = wp(S0, x, y, z);
        h = towards(S0, w.x, w.z) - S0.yaw;
      }
      if (still) {
        // reduced motion: the builders stand at the plot
        x = cheerAll ? ch.x : st.x;
        z = cheerAll ? ch.z : st.z;
        y = g(x, z);
        const w = wp(S0, x, y, z);
        h = cheerAll ? towards(S0, w.x, w.z) - S0.yaw : PI;
        act = cheerAll ? 'cheer' : { chip: 'hammer', mortar: 'measure', dab: 'point' }[role] || 'idle';
      }
      const w = wp(S0, x, y, z);
      placePerson(b.p, w.x, y, w.z, S0.yaw + h);
      b.p.visible = true;
      animatePerson(b.p, tt, act, act === 'scrub' ? { wall: true } : speed !== 1 ? { speed } : undefined);
    }
    // the people moving in: out of the door, onto the porch, waving
    const to = at(S0, 'out');
    const n = S0.movers.length;
    S0.movers.forEach((m, i) => {
      const D = S0.door;
      const px = clamp(D.x + (i - (n - 1) / 2) * K.movers.gap, S0.walls.x0 + 0.2, S0.walls.x1 + 0.6);
      const pz = S0.front + K.movers.porch;
      if (!skip && T < to) {
        m.p.visible = false;
        return;
      }
      const u = still || skip ? 1 : clamp((T - to - i * 0.15) / K.movers.out, 0, 1);
      if (u <= 0) {
        m.p.visible = false;
        return;
      }
      const sx = D.x + Math.sin(D.faceW) * 0.15;
      const sz = D.z + Math.cos(D.faceW) * 0.15;
      const x = sx + (px - sx) * ease(u);
      const z = sz + (pz - sz) * ease(u);
      const y = u < 0.3 ? D.y + (fl - D.y) * (u / 0.3) : fl;
      const w = wp(S0, x, y, z);
      const walking = u < 1;
      const hh = walking ? S0.yaw + Math.atan2(px - sx, pz - sz) : towards(S0, w.x, w.z);
      placePerson(m.p, w.x, y, w.z, hh);
      m.p.visible = true;
      const act = walking ? 'walk' : T >= at(S0, 'wave') || skip ? 'wave' : 'idle';
      animatePerson(m.p, still ? 0.35 : animT + i * 0.3, m.mer && act === 'walk' ? 'idle' : act);
    });
  }

  // ----- each frame -----
  function step(dt) {
    if (!S) return;
    S.steppedAt = now();
    run(dt);
  }
  function run(dt) {
    try {
      advance(dt);
    } catch (err) {
      console.warn('construction: step', err);
      finish();
    }
  }
  function advance(dt0) {
    const dt = clamp(fin(dt0) ? dt0 : 0, 0, 1);
    const S0 = S;
    if (S0.jobs.length) {
      // the scene's preparation, a job a frame (or as many as fit in 4 ms)
      const t0 = now();
      do {
        const j = S0.jobs.shift();
        try {
          j.run();
        } catch (err) {
          console.warn('construction: prepare', err);
        }
      } while (S0.jobs.length && now() - t0 < 4 && S === S0);
      if (S !== S0) return;
      // (then the first frames draw every variant once: nothing compiles mid-scene if warm() was not drawn)
      if (!S0.jobs.length) S0.firstFrames = Math.max(S0.firstFrames, 2);
    } else if (S0.firstFrames > 0 && clipReady()) S0.firstFrames--;
    if (S0.skipping) {
      S0.skipping.t += dt;
      if (S0.skipping.t >= SCENE.skip + SCENE.skipWave) {
        finish();
        return;
      }
      apply(S0.E.L, S0.reduced, null, 1, S0.E.L + S0.skipping.t);
      return;
    }
    const t0 = S0.t;
    const t1 = Math.min(S0.L, t0 + dt);
    S0.t = t1;
    for (const c of cueAt(t0, t1, S0.kind, S0.reduced)) {
      if (c.sfx) play(c.sfx);
      if (typeof C.onCue === 'function') call(C.onCue, c);
    }
    draw();
    if (t1 >= S0.L) {
      S0.done = true;
      finish();
    }
  }
  function draw() {
    const S0 = S;
    if (!S0) return;
    if (!S0.reduced) {
      apply(S0.t);
      return;
    }
    // reduced motion: the still's settled state; in its crossfade the new tier fades in over the last still's
    const st = stageAt(S0.t, S0.kind, true);
    const i = st.still;
    const tv = (j) => {
      const sl = STILLS[j];
      return S0.E.span(sl.stages[sl.stages.length - 1])[1] - 1e-4;
    };
    const fade = i > 0 && st.fade < 1;
    apply(tv(i), true, fade ? tv(i - 1) : null, st.fade);
  }
  function play(name) {
    const f = own(C, 'sfx');
    if (typeof f === 'function') call(f, name);
    else if (f && typeof f.play === 'function') call(f.play.bind(f), name);
  }

  // ----- skip, finish -----
  function skip() {
    if (!S) return false;
    if (S.skipping) return true;
    S.skipping = { t: 0, from: S.t };
    S.steppedAt = now();
    S.t = S.L;
    play('cheer');
    if (typeof C.onCue === 'function') call(C.onCue, { at: S.L, event: 'skip', stage: 'movingIn' });
    S.firstFrames = 0;
    S.jobs = S.jobs.filter((j) => j.people); // (the movers still to come wave in the coda)
    // the building stands now in the layer (the caller rebakes the plot back in at once, as sparrow's skipScene
    // does): the scene's own drawing of it goes; only the people stay for the wave
    dropBuild(S);
    apply(S.E.L, S.reduced, null, 1, S.E.L);
    return true;
  }
  /** The scene's drawing of the building (both tiers, the blueprint, the scaffold, the cart), disposed. */
  function dropBuild(S0) {
    const drop = (set) => {
      if (!set) return;
      if (set.pivot.parent) set.pivot.parent.remove(set.pivot);
      for (const m of set.mats) m.dispose();
    };
    drop(S0.newB);
    drop(S0.newSet);
    drop(S0.roofSet);
    drop(S0.oldSet);
    for (const set of [S0.newSet, S0.oldSet]) if (set && set.geos) for (const g of Object.values(set.geos)) g.dispose();
    S0.newB = S0.newSet = S0.roofSet = S0.oldSet = null;
    if (S0.ghost) {
      group.remove(S0.ghost);
      S0.ghost.geometry.dispose();
      S0.ghost.material.dispose();
      S0.ghost = null;
    }
    if (S0.scaffold) {
      group.remove(S0.scaffold.holder);
      S0.scaffold.mesh.geometry.dispose();
      S0.scaffold = null;
    }
    if (S0.cartMesh) {
      group.remove(S0.cartMesh);
      S0.cartMesh = null;
    }
    if (S0.kept) {
      group.remove(S0.kept);
      for (const m of S0.kept.children) m.geometry.dispose();
      S0.kept = null;
    }
  }
  function finish() {
    const S0 = S;
    if (!S0) return false;
    S = null;
    const folk = call(C.islanders);
    for (const b of S0.crew || []) {
      b.p.visible = false;
      if (!b.own && folk && typeof folk.hold === 'function') call(folk.hold.bind(folk), b.id, false);
    }
    for (const m of S0.movers || []) {
      if (m.borrowed) {
        if (m.folk && typeof m.folk.hold === 'function') call(m.folk.hold.bind(m.folk), m.id, false);
      } else disposePerson(m.p);
    }
    dropBuild(S0);
    if (shared) for (const m of [shared.boxes, shared.boxInk, shared.bits, shared.puffs]) {
      m.count = 0;
      m.visible = false;
    }
    group.visible = !!warmGroup;
    clipOff();
    return true;
  }

  // ----- local clipping, if nobody switched it on -----
  let seen = null; // the renderer that drew the props (when the ctx has none)
  function clipOn() {
    const r = own(C, 'renderer');
    if (r && r.isWebGLRenderer && !r.localClippingEnabled) {
      r.localClippingEnabled = true;
      clipSet = r;
    }
    // (no renderer in the ctx: the props' first draw hands it over, a frame before any clipped mesh shows)
    if (!(r && r.isWebGLRenderer) && shared && !shared.hooked) {
      const hook = (renderer) => {
        seen = renderer;
        if (S && renderer && !renderer.localClippingEnabled) {
          renderer.localClippingEnabled = true;
          clipSet = renderer;
        }
      };
      shared.boxes.onBeforeRender = hook;
      shared.bits.onBeforeRender = hook;
      shared.puffs.onBeforeRender = hook;
      shared.hooked = true;
    }
  }
  function clipReady() {
    const r = own(C, 'renderer');
    const R = r && r.isWebGLRenderer ? r : seen;
    return !!(R && R.localClippingEnabled);
  }
  function clipOff() {
    if (clipSet) clipSet.localClippingEnabled = false;
    clipSet = null;
  }

  // ----- warm -----
  /** One tiny mesh per material variant (the clones opaque and fading, the boards' clone, the blueprint, the props'
   *  materials), hidden in the scene and kept: main's warmDraw draws them once (with local clipping on). */
  function warm() {
    try {
      const sh = makeShared();
      if (!warmGroup) {
        warmGroup = new THREE.Group();
        warmGroup.name = 'construction:warm';
        warmGroup.userData.keep = true;
        warmGroup.visible = false;
        const tri = (uv) => {
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0]), 3));
          g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
          g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9).fill(1), 3));
          g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(12), 4));
          if (uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2));
          return g;
        };
        const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), FAR);
        const U = uniforms(FAR, 1);
        const mats = [];
        for (const cls of ['ink', 'tex']) {
          for (const fade of [false, true]) {
            const m = sceneMat(cls, [plane], U, { fade });
            if (m) mats.push([m, cls === 'tex']);
          }
        }
        const gm = sh.ghostMat.clone();
        gm.onBeforeCompile = ghostShader;
        gm.customProgramCacheKey = () => 'construction-ghost';
        gm.clippingPlanes = [plane];
        mats.push([gm, false]);
        for (const [m, uv] of mats) {
          const mesh = new THREE.Mesh(tri(uv), m);
          mesh.userData.keep = true;
          warmGroup.add(mesh);
        }
        for (const src of [sh.boxes, sh.bits, sh.puffs]) {
          const im = new THREE.InstancedMesh(src.geometry, src.material, 1);
          im.setMatrixAt(0, _m.makeScale(1e-4, 1e-4, 1e-4));
          im.setColorAt(0, _c.setRGB(1, 1, 1));
          im.userData.keep = true;
          warmGroup.add(im);
          if (src === sh.boxes) {
            const ink = new THREE.InstancedMesh(src.geometry, sh.inkMat, 1);
            ink.instanceMatrix = im.instanceMatrix;
            ink.userData.keep = true;
            warmGroup.add(ink);
          }
        }
        group.add(warmGroup);
        group.visible = true;
      }
      const list = [warmGroup];
      if (typeof C.warmDraw === 'function') call(C.warmDraw, list);
      return list;
    } catch (err) {
      console.warn('construction: warm', err);
      return [];
    }
  }

  function dispose() {
    finish();
    if (warmGroup) {
      warmGroup.traverse((o) => {
        if (o.isMesh && !o.isInstancedMesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
      group.remove(warmGroup);
      warmGroup = null;
    }
    if (shared) {
      for (const p of shared.crew || []) disposePerson(p.p);
      shared.boxGeo.dispose();
      shared.bitGeo.dispose();
      shared.puffGeo.dispose();
      for (const m of [shared.boxMat, shared.inkMat, shared.bitMat, shared.puffMat, shared.ghostMat]) m.dispose();
      for (const m of [shared.boxes, shared.boxInk, shared.bits, shared.puffs]) m.dispose && m.dispose();
      if (shared.cartGeo) shared.cartGeo.dispose();
      shared = null;
    }
    for (const k of Object.keys(fallback)) {
      fallback[k].dispose();
      delete fallback[k];
    }
    if (group.parent) group.parent.remove(group);
  }

  return {
    start,
    step,
    skip,
    finish,
    warm,
    dispose,
    get running() {
      return !!S;
    },
    get stage() {
      if (!S) return null;
      return S.skipping ? stageAt(S.L, S.kind, S.reduced).stage : stageAt(S.t, S.kind, S.reduced).stage;
    },
    get t() {
      return S ? S.t : 0;
    },
    get kind() {
      return S ? S.kind : null;
    },
    get plot() {
      return S ? S.id : null;
    },
    get skipping() {
      return !!(S && S.skipping);
    },
    /** The scene now, for the strip and the tests: its plot, tiers, kind, time, length, stageAt(), the cut, the
     *  paint and the lights, and what the scene measured (the eaves, the top, the footprint). null when none runs. */
    get info() {
      if (!S) return null;
      const st = stageAt(S.t, S.kind, S.reduced);
      return {
        plot: S.id,
        from: S.from,
        to: S.to,
        kind: S.kind,
        reduced: S.reduced,
        t: S.t,
        length: S.L,
        skipping: !!S.skipping,
        stage: st,
        cut: S.planes.cut.constant,
        paint: S.Unew.paint.value,
        lit: S.Unew.lit.value,
        floor: S.floor,
        eave: S.eave,
        top: S.top,
        oldEave: S.oldEave,
        cuts: [S.c0, S.c1, S.c2],
        oldMode: S.oldMode,
        movers: S.movers.map((m) => m.id),
        crew: S.crew.map((b) => b.id),
        startMs: S.startMs,
        shared: S.shared || 0,
        // what the build view should keep in frame (world): the pad's middle at the deck, the porch where the people
        // moving in wave, and the top of the new building
        frame: {
          pad: wp(S, (S.fpNew.x0 + S.fpNew.x1) / 2, S.floor, (S.fpNew.z0 + S.fpNew.z1) / 2).toArray().map((v) => +v.toFixed(2)),
          porch: wp(S, S.door.x, S.floor, S.front + K.movers.porch).toArray().map((v) => +v.toFixed(2)),
          top: +S.top.toFixed(2),
        },
        prof: S.prof,
      };
    },
    get group() {
      return group;
    },
  };
}
