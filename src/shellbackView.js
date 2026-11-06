import * as THREE from 'three';
import { gradientMap, noOutline, INK } from './style.js';
import { waveHeight } from './scenery.js';
import { artHelpers, createShapes, createBubbles, createRowboats, drawLane, drawSightLine } from './foesView.js';

// The Shellback's model (SPEC4 §3.6, §11.1): what shellback.js's visuals() say, drawn.
//   body     ONE rigidly skinned SkinnedMesh (krakenView.js's technique; 3 material groups: bold ink, thin ink, no
//            ink): a huge coral-red crab whose shell is an island (sandy patches, sea grass, barnacles, two little
//            palms), eight jointed legs, two great claws with dark-tipped pincers (the top finger snaps), two stalked
//            eyes with lids that blink and shut (asleep they lie folded on its shell), a wide mouth that yawns, and on
//            its back the old fort: a ring of sandstone wall with a bell and three round towers whose guns turn to
//            aim, each toppling when it is knocked down. Every part is a bone: it sleeps as the island, unfolds its
//            legs and pops its eyes up at the wake, walks (its legs step with `gait`), sweeps a claw, crouches,
//            charges, gets dizzy, sneezes, throws the fort off its back into the sea, and scuttles home to sleep.
//   shapes   its warnings (createShapes, two calls): the towers' red sight lines (dotted, then solid), the claw's red
//            zigzag-edged sector, the orange boulder ring with the boulder arcing over, the charge's dashed lane with
//            arrows, its shadow, the dizzy stars, the snore and the wake's boil (bubbles)
//   boulders the boulders in flight: ONE InstancedMesh + ink twin
//   boats    the towers' gunners rowing away (foesView's rowboats: one InstancedMesh + ink twin)
//   bubbles  the boil of the wake, snores, the fort's splash, the boulders' splashes: ONE InstancedMesh
//   conch    the Golden Conch bobbing up when it is driven off (inked shell + a no-ink lip: 3 calls, only then)
// Draw calls: body ≤ 5, shapes ≤ 2, boulders 2, boats 2, bubbles 1 = 12 in the fight, conch 3 after it: at most
// 15 (SPEC4 §19 S0-D4: ≤ 33). A part with nothing to show is hidden.
//
// createShellbackView(scene, { reducedMotion, seaY, camera, foamColor }) → {
//   prepare() → boolean,      // builds one mesh a call (call it once a frame during the fly-in and wave 1): true when
//                             //   all are built
//   get ready,
//   update(visuals, t, dt),   // per frame: draws shellback.visuals() (t: visual time, dt: 0 while paused); every
//                             //   field optional, junk ignored; before prepare() is done, something to show builds
//                             //   the rest at once
//   riseCamera(k, from?) → { pos, look } | null,   // the wake's camera at k (0..1) of the wake: it pulls up and back
//                             //   over your stern (from: your ship { x, z, h, duration }) and looks up at the crab as
//                             //   its eyes pop open. Under reduced motion: a cut to the crab's face for 1.5 s in the
//                             //   middle of the wake (null before and after: main keeps its own camera), no glide.
//                             //   null with no body drawn. The vectors are reused: copy them.
//   statusShip(status) → ship, // its special status drawn by statusfx.js like a ship's (as krakenView's): a persistent
//                             //   ship-like { mesh, status, type, hp } standing on its shell (anchors round the
//                             //   shell's rim, on its back, and two "holes" on its front), status: shellback.status
//   warmables() → Object3D[], // the hidden objects for main's warmDraw (§11.2), each with one instance / triangle far
//                             //   under the sea; the next update() puts them back
//   read() → { … },           // test hook: what the last update drew
//   dispose()
// }
// reducedMotion: a boolean or a function returning one: no stepping legs, no snip-snapping, no sway, bob, swing or
// spin (the body still goes where the simulation says, the fort still flies off, a tower still falls), no glide.

const { strip, placed, qFromTo, qEuler, tube, inflate, paintMerge, bakeSkinned, skeletonKit, bindSkinned } = artHelpers;

const PI = Math.PI;
const TAU = PI * 2;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (x) => {
  const k = clamp(x, 0, 1);
  return k * k * (3 - 2 * k);
};
const frac = (x) => x - Math.floor(x);
const hash = (n) => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const obj = (v) => v && typeof v === 'object';
const list = (v) => (Array.isArray(v) ? v : []);
const UP = V3(0, 1, 0);
const FWD = V3(0, 0, 1);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const C = {
  shell: 0xe8503a,
  shellDeep: 0xb93a2a,
  spot: 0xff8a68,
  belly: 0xf6caa0,
  leg: 0xe2563e,
  joint: 0xf59a78,
  claw: 0xe8503a,
  clawTip: 0x5a1f1a,
  barnacle: 0xeae2cf,
  hole: 0x4a4256,
  sand: 0xf0d59a,
  grass: 0x4caf50,
  palm: 0x3f9e4a,
  trunk: 0x9a6a3a,
  eye: 0xffffff,
  pupil: 0x1d1330,
  lid: 0xd4442f,
  stalk: 0xe85a40,
  mouth: 0x5a1a26,
  stone: 0xdcb67a,
  stoneDeep: 0xbf9a5f,
  stoneLight: 0xecd3a2,
  roof: 0xa83a2a,
  iron: 0x2e2a36,
  bell: 0xffc93c,
  wood: 0x8a5a33,
  gold: 0xffc93c,
  goldDeep: 0xd9921f,
  conchLip: 0xff9fb2,
  boulder: 0xb06a3a,
  boulderDeep: 0x7a4426,
};
const S = { ink: 0x1d1330, red: 0xe63946, redFill: 0xe63946, white: 0xffffff, boulder: 0xff9a2a, boulderFill: 0xff9a2a, charge: 0xff5a4a, shadow: 0x2a1418, star: 0xffd84a, glow: 0xfff0a0 };

// Sizes (world units; shellback.js's numbers): body r 8 awake, the lair r 12, shell top y 6; eyes 5.4 ahead,
// 1.8 to the side, at y 7.2, r 1.1; claws 8.4 ahead, 4.6 to the side, y 0..3.4, r 2.4; the towers on a ring
// of 3.4 round a point 1.5 behind its middle, y 4.5 to 11, their guns at y 10.
const SHELL = { rx: 7.5, ry: 3.2, rz: 6.6, y: 3.1, z: -0.4 };
const EYE = { side: 1.8, ahead: 5.4, y: 7.2, r: 1.05, base: V3(1.6, 5.0, 4.2) };
const CLAW = { side: 4.6, ahead: 8.4 };
const TOWER = { ring: 3.4, back: 1.5, r: 1.35, y0: 4.6, y1: 10.6, gun: 10 };
const LEGS = [3.0, 0.8, -1.6, -4.0]; // z of each pair's root on the shell
const STAND = { low: -2.6, high: 0 }; // the body's root under the sea at k 0 and at k 1
const BOULDER = { lob: 14 };
const FORT_Y = 5.0; // the fort's floor over the body's root, on the shell's back
const CUT_T = 1.5; // s: reduced motion's cut
const WAKE_T = 6;
const CAP = { boulders: 6, boats: 6, bubbles: 220 };

export function createShellbackView(scene, opts = {}) {
  const o = obj(opts) ? opts : {};
  const rm = typeof o.reducedMotion === 'function' ? () => !!o.reducedMotion() : () => !!o.reducedMotion;
  const seaFn = typeof o.seaY === 'function' ? o.seaY : (x, z, t) => waveHeight(x, z, t, 0.7);
  const sea = (x, z, t) => {
    const y = Number(seaFn(x, z, t));
    return Number.isFinite(y) ? y : 0;
  };
  const foam = num(o.foamColor, 0xfff4ec);
  const root = new THREE.Group();
  root.name = 'shellback';
  scene.add(root);
  let disposed = false;
  const own = { geos: [], mats: [], skels: [] };

  let shapes = null;
  let bubbles = null;
  let body = null; // { holder, mesh, bones }
  let rocks = null; // { mesh, ink }
  let boats = null;
  let conch = null; // { group, mats }

  // ---- the body: one rigidly skinned SkinnedMesh
  function buildBody() {
    const make = (n, ol) => {
      const m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap(3), emissive: 0x1a0606 });
      m.name = `shellback:${n}`;
      if (ol) m.userData.outlineParameters = { thickness: ol, color: INK, alpha: 1, visible: true };
      else noOutline(m);
      return m;
    };
    const mats = [make('ink', 0.0058), make('thin', 0.0034), make('flat', 0)];
    own.mats.push(...mats);
    const INKS = 0;
    const THIN = 1;
    const FLAT = 2;
    const K = skeletonKit('shellback');
    const B = K.bones;
    K.bone('root', null);
    K.bone('shell', B.root, 0, 0, 0);
    K.bone('mouth', B.shell, 0, 2.6, 6.1);
    // legs: an upper and a lower bone each, four a side
    const legRoot = (sd, z) => V3(sd * 6.4, 2.1, z);
    const legKnee = (sd, z) => V3(sd * 9.3, 4.3, z * 1.18);
    const legFoot = (sd, z) => V3(sd * 10.8, -0.5, z * 1.32);
    LEGS.forEach((z, i) => {
      for (const sd of [-1, 1]) {
        const nm = `${sd < 0 ? 'R' : 'L'}${i}`;
        const r = legRoot(sd, z);
        const kn = legKnee(sd, z);
        K.bone(`legU${nm}`, B.shell, r.x, r.y, r.z);
        K.bone(`legL${nm}`, B[`legU${nm}`], kn.x - r.x, kn.y - r.y, kn.z - r.z);
      }
    });
    // claws: the arm at the shoulder, the hand at the elbow, the top finger at its hinge
    const shoulder = (sd) => V3(sd * 5.3, 2.5, 4.4);
    const elbow = (sd) => V3(sd * 6.3, 2.3, 6.6);
    const hinge = (sd) => V3(sd * 4.8, 2.7, 9.2);
    for (const sd of [-1, 1]) {
      const nm = sd < 0 ? 'R' : 'L';
      const s = shoulder(sd);
      const e = elbow(sd);
      const h = hinge(sd);
      K.bone(`arm${nm}`, B.shell, s.x, s.y, s.z);
      K.bone(`hand${nm}`, B[`arm${nm}`], e.x - s.x, e.y - s.y, e.z - s.z);
      K.bone(`finger${nm}`, B[`hand${nm}`], h.x - e.x, h.y - e.y, h.z - e.z);
    }
    // eyes: the stalk at its base on the shell, the ball's lid and pupil at the eye
    for (const sd of [-1, 1]) {
      const nm = sd < 0 ? 'R' : 'L';
      const b = V3(sd * EYE.base.x, EYE.base.y, EYE.base.z);
      K.bone(`stalk${nm}`, B.shell, b.x, b.y, b.z);
      K.bone(`lid${nm}`, B[`stalk${nm}`], sd * EYE.side - b.x, EYE.y - b.y, EYE.ahead - b.z);
      K.bone(`pupil${nm}`, B[`stalk${nm}`], sd * EYE.side - b.x, EYE.y - b.y, EYE.ahead - b.z);
    }
    // the fort on its back (its own top-level bone: it can be thrown off), the bell, three towers and their guns
    K.bone('fort', null);
    K.bone('bell', B.fort, 0, 2.9, 1.6);
    for (let i = 0; i < 3; i++) {
      const a = PI + (i - 1) * ((TAU / 3) * 0.8);
      const x = Math.sin(a) * TOWER.ring;
      const z = -TOWER.back + Math.cos(a) * TOWER.ring;
      K.bone(`tower${i}`, B.fort, x, 0, z);
      K.bone(`gun${i}`, B[`tower${i}`], 0, TOWER.gun - 0.25 - FORT_Y, 0);
    }
    B.root.updateMatrixWorld(true);
    B.fort.position.set(0, FORT_Y, 0);
    B.fort.updateMatrixWorld(true);
    const parts = [];
    const add = (geo, b, slot, color) => parts.push({ geo: strip(geo), slot, color, skin: K.rigid(b) });

    // the shell: a broad dome, coral red with paler spots, darker round its rim, a cream belly; sandy patches
    // and tufts of sea grass on top (it has been an island a long time)
    const sh = new THREE.SphereGeometry(1, 48, 28);
    const P = sh.attributes.position;
    for (let i = 0; i < P.count; i++) {
      let x = P.getX(i);
      let y = P.getY(i);
      let z = P.getZ(i);
      // a flatter belly, a scalloped rim
      if (y < 0) y *= 0.45;
      const lon = Math.atan2(x, z);
      const rim = 1 + 0.035 * Math.cos(lon * 9) * Math.max(0, 1 - Math.abs(y) * 3);
      x *= rim;
      z *= rim;
      P.setXYZ(i, x * SHELL.rx, y * SHELL.ry + SHELL.y, z * SHELL.rz + SHELL.z);
    }
    sh.computeVertexNormals();
    const spots = [];
    for (let i = 0; i < 16; i++) spots.push([hash(i * 3.3) * TAU, 0.35 + 0.5 * hash(i * 7.1), 0.75 + 0.6 * hash(i * 1.9)]);
    const sand = [[0.6, -2.2, 2.2], [-2.8, -3.6, 1.8], [3.4, 0.6, 1.4], [-3.6, 1.2, 1.2]];
    add(sh, 'shell', INKS, (x, y, z) => {
      const up = (y - SHELL.y) / SHELL.ry;
      if (up < -0.05) return C.belly;
      if (up < 0.2) return C.shellDeep;
      for (const [sx, sz, r] of sand) if (Math.hypot(x - sx, z - sz) < r && up > 0.55) return C.sand;
      const lon = Math.atan2(x, z);
      for (const [a, u, r] of spots) {
        const d = Math.hypot(wrap(lon - a) * 4.5, (up - u) * 7);
        if (d < r) return C.spot;
      }
      return C.shell;
    });
    // the face: a wide mouth under the eyes on the front of the shell (its lower lip on the mouth bone)
    const lip = tube(Array.from({ length: 13 }, (_, i) => {
      const u = i / 12 - 0.5;
      return V3(u * 4.2, 2.65 - 0.5 * Math.cos(u * PI) + 0.5, 6.05 - 1.2 * u * u);
    }), (u) => 0.22 + 0.06 * Math.sin(u * PI), 8, UP);
    add(lip, 'shell', FLAT, C.mouth);
    const jaw = new THREE.SphereGeometry(1, 20, 8, 0, TAU, PI * 0.5, PI * 0.5);
    jaw.scale(1.9, 0.9, 0.6).translate(0, 2.55, 5.75);
    add(jaw, 'mouth', FLAT, C.mouth);
    // two little mandibles each side of the mouth
    for (const sd of [-1, 1]) {
      const m = new THREE.SphereGeometry(1, 10, 8);
      m.scale(0.35, 0.55, 0.3).rotateZ(sd * 0.35).translate(sd * 2.4, 2.25, 5.95);
      add(m, 'shell', THIN, C.shellDeep);
    }
    // barnacles on its sides
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU + 0.2;
      const up = 0.25 + 0.35 * hash(k + 5);
      const d = V3(Math.sin(a) * Math.sqrt(1 - up * up), up, Math.cos(a) * Math.sqrt(1 - up * up));
      if (d.z > 0.75) continue; // (not over its face)
      const p = V3(d.x * SHELL.rx, d.y * SHELL.ry + SHELL.y, d.z * SHELL.rz + SHELL.z);
      const n = V3(d.x / SHELL.rx, d.y / SHELL.ry, d.z / SHELL.rz).normalize();
      const s = 0.55 + 0.4 * hash(k + 1);
      const q = qFromTo(UP, n);
      add(placed(new THREE.CylinderGeometry(0.32 * s, 0.5 * s, 0.5 * s, 9), p.clone().addScaledVector(n, 0.15 * s), q), 'shell', THIN, C.barnacle);
      add(placed(new THREE.CircleGeometry(0.2 * s, 9), p.clone().addScaledVector(n, 0.41 * s), q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), -PI / 2))), 'shell', FLAT, C.hole);
    }
    // sea grass tufts and two little palms on its back (it was an island)
    const topAt = (x, z) => {
      const nx = x / SHELL.rx;
      const nz = (z - SHELL.z) / SHELL.rz;
      return SHELL.y + SHELL.ry * Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz));
    };
    for (const [x, z] of [[-4.6, 1.8], [4.8, 2.6], [-1.2, 4.2], [5.2, -2.8], [-5.4, -2.2]]) {
      for (let j = 0; j < 3; j++) {
        const g = new THREE.ConeGeometry(0.16, 1.0, 5);
        g.translate(0, 0.45, 0).rotateZ((j - 1) * 0.45).rotateY(j * 1.3);
        add(placed(g, V3(x, topAt(x, z) - 0.1, z)), 'shell', THIN, C.grass);
      }
    }
    for (const [x, z, lean] of [[-5.2, -0.4, 0.35], [5.6, 0.4, -0.3]]) {
      const y0 = topAt(x, z) - 0.2;
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        pts.push(V3(x + Math.sin(lean) * u * 3.2 + Math.sin(u * 2) * 0.2 * Math.sign(lean), y0 + u * 3.4, z));
      }
      add(tube(pts, (u) => 0.26 - 0.1 * u, 7, FWD), 'shell', INKS, (xx, yy) => (Math.floor((yy - y0) * 2.2) % 2 ? C.trunk : 0x7d532c));
      const top = pts[pts.length - 1];
      for (let f = 0; f < 6; f++) {
        const a = (f / 6) * TAU + 0.3;
        const leaf = new THREE.SphereGeometry(1, 10, 6);
        leaf.scale(0.12, 0.3, 1.5).translate(0, 0, 1.3).rotateX(0.55).rotateY(a);
        add(placed(leaf, top), 'shell', INKS, C.palm);
      }
      add(new THREE.SphereGeometry(0.22, 8, 6).translate(top.x + 0.2, top.y - 0.25, top.z + 0.15), 'shell', THIN, 0x7a4a2b);
    }
    // the legs: a thick upper segment and a lower one tapering to a dark point, pale joints
    LEGS.forEach((z, i) => {
      for (const sd of [-1, 1]) {
        const nm = `${sd < 0 ? 'R' : 'L'}${i}`;
        const r = legRoot(sd, z);
        const kn = legKnee(sd, z);
        const ft = legFoot(sd, z);
        add(tube([r, r.clone().lerp(kn, 0.5).add(V3(0, 0.3, 0)), kn], (u) => 0.72 - 0.12 * u, 12, FWD), `legU${nm}`, INKS, C.leg);
        add(new THREE.SphereGeometry(0.62, 12, 8).translate(kn.x, kn.y, kn.z), `legL${nm}`, INKS, C.joint);
        add(tube([kn, kn.clone().lerp(ft, 0.5).add(V3(sd * 0.3, 0, 0)), ft], (u) => 0.55 * (1 - u * 0.75) + 0.06, 12, FWD), `legL${nm}`, INKS, (x, y) => (y < 0.6 ? C.clawTip : C.leg));
      }
    });
    // the claws: an arm, a big swollen hand with a fixed lower finger and the hinged top one, dark tips
    for (const sd of [-1, 1]) {
      const nm = sd < 0 ? 'R' : 'L';
      const s = shoulder(sd);
      const e = elbow(sd);
      const h = hinge(sd);
      add(tube([s, s.clone().lerp(e, 0.5).add(V3(sd * 0.3, 0.4, 0)), e], (u) => 0.85 - 0.15 * u, 12, UP), `arm${nm}`, INKS, C.claw);
      add(new THREE.SphereGeometry(0.8, 12, 8).translate(e.x, e.y, e.z), `hand${nm}`, INKS, C.joint);
      const palm = new THREE.SphereGeometry(1, 24, 16);
      palm.scale(1.55, 1.35, 2.0).translate(sd * 5.2, 2.2, 8.0);
      add(palm, `hand${nm}`, INKS, (x, y) => (y < 1.4 ? C.belly : C.claw));
      // spots on the hand
      for (let k = 0; k < 4; k++) {
        const g = new THREE.SphereGeometry(0.28, 8, 6);
        g.scale(1, 1, 0.3);
        const a = k * 1.4 + 0.3;
        const p = V3(sd * 5.2 + Math.sin(a) * 1.35 * sd, 2.2 + 1.0 + 0.2 * Math.cos(a), 8.0 + Math.cos(a) * 1.2);
        add(placed(g, p, qFromTo(FWD, V3(Math.sin(a) * sd, 0.8, Math.cos(a)))), `hand${nm}`, FLAT, C.spot);
      }
      // the lower (fixed) finger
      const lo = [V3(sd * 5.0, 1.3, 9.4), V3(sd * 4.8, 1.0, 10.8), V3(sd * 4.3, 1.35, 12.0)];
      add(tube(lo, (u) => 0.75 * (1 - u * 0.8) + 0.08, 12, UP), `hand${nm}`, INKS, (x, y, z) => (z > 11.2 ? C.clawTip : C.claw));
      // the top finger on its hinge (it snaps)
      const up = [V3(sd * 4.9, 2.9, 9.4), V3(sd * 4.7, 3.1, 10.9), V3(sd * 4.3, 2.4, 12.1)];
      add(tube(up, (u) => 0.72 * (1 - u * 0.8) + 0.08, 12, UP), `finger${nm}`, INKS, (x, y, z) => (z > 11.3 ? C.clawTip : C.claw));
    }
    // the eyes: a stalk from the shell up to a white eyeball, a pupil (and glint) on its bone, a coral lid
    for (const sd of [-1, 1]) {
      const nm = sd < 0 ? 'R' : 'L';
      const b = V3(sd * EYE.base.x, EYE.base.y, EYE.base.z);
      const c = V3(sd * EYE.side, EYE.y, EYE.ahead);
      add(tube([b, b.clone().lerp(c, 0.5).add(V3(0, 0, -0.25)), c.clone().add(V3(0, -0.6, -0.2))], (u) => 0.42 - 0.08 * u, 10, FWD), `stalk${nm}`, INKS, C.stalk);
      add(new THREE.SphereGeometry(EYE.r, 22, 16).translate(c.x, c.y, c.z), `stalk${nm}`, FLAT, C.eye);
      add(placed(new THREE.SphereGeometry(EYE.r * 1.012, 18, 6, 0, TAU, 0, 0.55), c, qFromTo(UP, V3(0, 0.1, 1))), `pupil${nm}`, FLAT, C.pupil);
      add(placed(new THREE.SphereGeometry(EYE.r * 1.02, 8, 4, 0, TAU, 0, 0.16), c, qFromTo(UP, V3(0.3 * sd, 0.55, 1))), `pupil${nm}`, FLAT, C.eye);
      const lid = new THREE.SphereGeometry(EYE.r * 1.08, 22, 10, 0, TAU, 0, PI * 0.55);
      add(placed(lid, c), `lid${nm}`, INKS, C.lid);
    }
    // the fort: a ring wall of sandstone with a gate at the front and a bell under a little arch
    const stone = (x, y, z) => {
      const h = hash(Math.floor(x * 1.6) * 13.1 + Math.floor(y * 2.1) * 7.3 + Math.floor(z * 1.6) * 3.7);
      return h < 0.25 ? C.stoneDeep : h > 0.8 ? C.stoneLight : C.stone;
    };
    const fy = FORT_Y;
    const ring = new THREE.CylinderGeometry(4.6, 4.9, 1.7, 28, 1, true, 0.5, TAU - 1.0);
    ring.translate(0, fy + 0.6, -TOWER.back);
    add(ring, 'fort', INKS, stone);
    const inner = new THREE.CylinderGeometry(4.15, 4.15, 1.4, 28, 1, true, 0.5, TAU - 1.0);
    const IN = inner.attributes.normal;
    for (let i = 0; i < IN.count; i++) IN.setXYZ(i, -IN.getX(i), -IN.getY(i), -IN.getZ(i));
    inner.index.array.reverse();
    inner.translate(0, fy + 0.75, -TOWER.back);
    add(inner, 'fort', FLAT, C.stoneDeep);
    add(new THREE.RingGeometry(4.15, 4.6, 28, 1, 0.5, TAU - 1.0).rotateX(-PI / 2).translate(0, fy + 1.45, -TOWER.back), 'fort', FLAT, C.stoneLight);
    for (let m = 0; m < 12; m++) {
      const a = 0.5 + ((m + 0.5) / 12) * (TAU - 1.0);
      const mg = new THREE.CapsuleGeometry(0.3, 0.3, 3, 8);
      mg.scale(1, 1, 0.75);
      add(placed(mg, V3(Math.sin(a) * 4.4, fy + 1.75, -TOWER.back + Math.cos(a) * 4.4), qEuler(0, a, 0)), 'fort', THIN, stone);
    }
    // the bell arch at the gate (the bell on its bone, it swings and clangs at the wake)
    for (const sd of [-1, 1]) add(new THREE.CylinderGeometry(0.22, 0.26, 2.4, 8).translate(sd * 1.1, fy + 1.6, 1.6), 'fort', THIN, C.wood);
    add(new THREE.CapsuleGeometry(0.2, 2.0, 4, 8).rotateZ(PI / 2).translate(0, fy + 2.9, 1.6), 'fort', THIN, C.wood);
    const bell = new THREE.LatheGeometry([V3(0.05, 0.0), V3(0.38, -0.1), V3(0.46, -0.5), V3(0.62, -0.95), V3(0.66, -1.05), V3(0, -1.05)].map((p) => new THREE.Vector2(p.x, p.y)), 14);
    bell.translate(0, fy + 2.85, 1.6);
    add(bell, 'bell', INKS, C.bell);
    // the towers: round sandstone towers with a coral-red cap, a band of windows, a gun on top (its own bone)
    for (let i = 0; i < 3; i++) {
      const a = PI + (i - 1) * ((TAU / 3) * 0.8);
      const x = Math.sin(a) * TOWER.ring;
      const z = -TOWER.back + Math.cos(a) * TOWER.ring;
      const h = TOWER.y1 - TOWER.y0 - 1.3;
      const tw = new THREE.CylinderGeometry(TOWER.r, TOWER.r * 1.12, h, 18, 3);
      tw.translate(x, TOWER.y0 + h / 2, z);
      add(tw, `tower${i}`, INKS, stone);
      // a stump that stays on the shell when the tower falls
      const st = new THREE.CylinderGeometry(TOWER.r * 1.14, TOWER.r * 1.22, 1.1, 18);
      st.translate(x, TOWER.y0 + 0.2, z);
      add(st, 'fort', INKS, stone);
      // crenellations and the cap
      for (let m = 0; m < 6; m++) {
        const b2 = (m / 6) * TAU;
        const mg = new THREE.CapsuleGeometry(0.22, 0.22, 3, 6);
        add(placed(mg, V3(x + Math.sin(b2) * TOWER.r * 0.95, TOWER.y0 + h + 0.25, z + Math.cos(b2) * TOWER.r * 0.95)), `tower${i}`, THIN, stone);
      }
      add(new THREE.CylinderGeometry(TOWER.r * 0.92, TOWER.r * 0.92, 0.2, 16).translate(x, TOWER.y0 + h - 0.05, z), `tower${i}`, FLAT, C.stoneDeep);
      // windows (dark slits) round its middle
      for (let w = 0; w < 4; w++) {
        const b2 = (w / 4) * TAU + 0.4;
        const g = new THREE.CapsuleGeometry(0.16, 0.45, 3, 6);
        g.scale(1, 1, 0.4);
        add(placed(g, V3(x + Math.sin(b2) * TOWER.r * 1.02, TOWER.y0 + h * 0.55, z + Math.cos(b2) * TOWER.r * 1.02), qEuler(0, b2, 0)), `tower${i}`, FLAT, C.hole);
      }
      // the gun: a little cannon on top, turning with its bone (aiming along +z)
      const gy = TOWER.gun - 0.25;
      add(tube([V3(x, gy, z - 0.5), V3(x, gy + 0.05, z + 0.4), V3(x, gy + 0.08, z + 1.4)], (u) => 0.26 - 0.07 * u, 10, UP), `gun${i}`, INKS, C.iron);
      add(new THREE.CapsuleGeometry(0.3, 0.5, 3, 8).rotateX(PI / 2).translate(x, gy - 0.25, z), `gun${i}`, THIN, C.wood);
      // a red pennant on a little pole on the cap
      add(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5).translate(x - 0.6, TOWER.y0 + h + 1.0, z - 0.6), `tower${i}`, THIN, C.wood);
      const pen = new THREE.ConeGeometry(0.3, 1.1, 4).rotateZ(-PI / 2).scale(1, 1, 0.25).translate(x - 0.05, TOWER.y0 + h + 1.55, z - 0.6);
      add(pen, `tower${i}`, THIN, C.roof);
    }
    const { geometry, slots } = bakeSkinned(parts, 3);
    own.geos.push(geometry);
    const b = bindSkinned(geometry, mats, slots, K, [B.root, B.fort], 'shellback-body');
    own.skels.push(b.skeleton);
    b.holder.visible = false;
    root.add(b.holder);
    // the rest pose of every bone (posing starts from it each frame)
    const rest = {};
    for (const k of K.order) rest[k] = { p: B[k].position.clone(), q: B[k].quaternion.clone() };
    body = { ...b, bones: B, rest, blinkAt: 2, fortFly: null };
  }

  function buildBoulders() {
    // a lumpy rock: an icosphere pushed about, orange-brown with darker cracks
    const g = new THREE.IcosahedronGeometry(1, 2);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const v = V3(P.getX(i), P.getY(i), P.getZ(i));
      const k = 1 + 0.16 * Math.sin(v.x * 3.1 + v.y * 1.7) * Math.cos(v.z * 2.3 - v.y);
      P.setXYZ(i, v.x * k, v.y * k * 0.9, v.z * k);
    }
    const geo = paintMerge([{ geo: strip(g), color: (x, y, z) => (Math.sin(x * 4 + z * 3) > 0.75 ? C.boulderDeep : C.boulder) }]);
    geo.computeVertexNormals();
    const mat = noOutline(new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap(3) }));
    const ig = inflate(geo, 0.07);
    const im = noOutline(new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(INK[0], INK[1], INK[2]), side: THREE.BackSide }));
    const mesh = new THREE.InstancedMesh(geo, mat, CAP.boulders);
    const ink = new THREE.InstancedMesh(ig, im, CAP.boulders);
    ink.instanceMatrix = mesh.instanceMatrix;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.name = 'shellback-boulders';
    ink.name = 'shellback-boulders-ink';
    for (const m of [mesh, ink]) {
      m.count = 0;
      m.visible = false;
      m.frustumCulled = false;
      m.userData.keep = true;
      root.add(m);
    }
    own.geos.push(geo, ig);
    own.mats.push(mat, im);
    rocks = { mesh, ink };
  }

  function buildConch() {
    // a golden conch standing in the water: a lathed body with a stepped spire, knobs round its shoulder, darker
    // whorl stripes, and a pink flared lip on one side
    const parts = [];
    const add = (geo, slot, color) => parts.push({ geo: strip(geo), slot, color, skin: () => [0, 0, 0] });
    const prof = [[0.04, -1.7], [0.3, -1.35], [0.72, -0.6], [1.05, 0.2], [1.18, 0.62], [1.02, 0.82], [0.78, 0.9], [0.72, 1.06], [0.56, 1.14], [0.5, 1.32], [0.36, 1.4], [0.32, 1.58], [0.2, 1.66], [0.16, 1.82], [0.03, 2.0]];
    const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
    lathe.computeVertexNormals();
    add(lathe, 0, (x, y, z) => {
      const a = Math.atan2(x, z);
      return Math.sin(a * 2 + y * 5) > 0.7 ? C.goldDeep : C.gold;
    });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const cone = new THREE.ConeGeometry(0.17, 0.55, 7);
      cone.translate(0, 0.27, 0);
      add(placed(cone, V3(Math.sin(a) * 1.08, 0.72, Math.cos(a) * 1.08), qFromTo(UP, V3(Math.sin(a), 0.9, Math.cos(a)))), 0, C.goldDeep);
    }
    // the lip: a pink flare down its front
    const lipG = new THREE.SphereGeometry(1, 20, 12, -PI * 0.5, PI, 0, PI);
    lipG.scale(0.5, 1.15, 1.05).translate(0, -0.35, 0).rotateY(PI / 2).translate(0, 0, 0.62);
    add(lipG, 1, C.conchLip);
    const { geometry, slots } = bakeSkinned(parts, 2);
    for (const k of ['skinIndex', 'skinWeight']) geometry.deleteAttribute(k);
    own.geos.push(geometry);
    const m0 = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap(3), emissive: 0x6a4a10 });
    m0.userData.outlineParameters = { thickness: 0.005, color: INK, alpha: 1, visible: true };
    const m1 = noOutline(new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap(3), emissive: 0x4a2a30 }));
    own.mats.push(m0, m1);
    const mesh = new THREE.Mesh(geometry, slots.map((s) => [m0, m1][s]));
    mesh.name = 'shellback-conch';
    mesh.frustumCulled = false;
    const group = new THREE.Group();
    group.name = 'shellback-conch-group';
    group.add(mesh);
    group.visible = false;
    root.add(group);
    conch = { group, mat: m0 };
  }

  const builders = [
    () => (shapes = createShapes(root, { name: 'shellback-shapes', seaY: sea, camera: o.camera, capFlat: 9000, capUp: 3000 })),
    () => (bubbles = createBubbles(root, { cap: CAP.bubbles, name: 'shellback-bubbles', color: foam })),
    buildBody,
    buildBoulders,
    () => (boats = createRowboats(root, { cap: CAP.boats, name: 'shellback-boats' })),
    buildConch,
  ];
  const STEPS = builders.length;
  let step = 0;
  const built = () => [shapes, bubbles, body, rocks, boats, conch];
  function buildNext() {
    if (disposed) return;
    const b = built();
    while (step < STEPS && b[step]) step++;
    if (step < STEPS) {
      builders[step]();
      step++;
    }
  }
  const buildAll = () => {
    while (step < STEPS && !disposed) buildNext();
  };

  // ---- per frame
  let clock = 0;
  let still = false;
  let lastBody = null; // { x, z, h, y, k } as drawn
  let lastT = 0;
  let warmPending = false;
  const lineMem = new Map();
  const seenRings = new Map(); // boulder ring id → { x, z, u } (to splash where it lands)
  const splashes = [];
  const counts = {};
  const resetCounts = () => Object.assign(counts, { body: 0, towers: 0, towersDown: 0, eyesOpen: 0, rings: 0, sectors: 0, lanes: 0, lines: 0, boulders: 0, boats: 0, conch: 0, stars: 0, bubbles: 0, shapes: 0, fort: 0 });
  resetCounts();
  let flash = 0;
  const _m = new THREE.Matrix4();
  const _p = V3();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _s = V3();
  const _v = V3();
  const _w = V3();

  function rest(B, R) {
    for (const k of Object.keys(R)) {
      B[k].position.copy(R[k].p);
      B[k].quaternion.copy(R[k].q);
      B[k].scale.set(1, 1, 1);
    }
  }
  // add a rotation (Euler XYZ, radians) on top of a bone's rest pose
  function turn(b, x, y, z, order = 'XYZ') {
    _e.set(x, y, z, order);
    _q.setFromEuler(_e);
    b.quaternion.multiply(_q);
  }

  function poseBody(V, t, dt) {
    const Bv = V.body;
    const B = body.bones;
    rest(B, body.rest);
    const x = num(Bv.x, 0);
    const z = num(Bv.z, 0);
    const h = num(Bv.h, 0);
    const k = clamp(num(Bv.k, 0), 0, 1);
    const st = typeof Bv.state === 'string' ? Bv.state : 'sleep';
    const T = num(Bv.t, 0);
    const sway = still ? 0 : 1;
    const hurt = clamp(num(Bv.hurt, 0), 0, 1);
    const sneeze = clamp(num(Bv.sneeze, 0), 0, 1);
    const dizzy = !!Bv.dizzy || st === 'dizzy';
    // how high it stands (k), crouching before a charge, low and settled asleep
    let lift = lerp(STAND.low, STAND.high, smooth(k));
    let pitch = 0;
    let roll = 0;
    if (st === 'crouch') lift -= 1.1 * smooth(T / 0.4);
    if (st === 'charge') pitch = 0.12;
    if (st === 'throw') pitch = -0.28 * Math.sin(clamp(T / 1.5, 0, 1) * PI);
    if (dizzy) {
      roll = 0.07 * Math.sin(t * 2.2) * sway;
      pitch += 0.05 * Math.sin(t * 2.2 + 1.3) * sway;
    }
    // breathing (slow), a bob on the water while it walks
    const breathe = still ? 0 : 0.12 * Math.sin(t * (st === 'sleep' || st === 'asleep' ? 0.7 : 1.3));
    const gait = num(Bv.gait, 0);
    const walking = st === 'walk' || st === 'charge' || st === 'home';
    const bob = walking && !still ? 0.18 * Math.abs(Math.sin((gait / 2.6) * PI)) : 0;
    const y = sea(x, z, t) + lift + breathe + bob - 0.6 * hurt;
    B.root.position.set(x, y, z);
    _e.set(pitch, h, roll, 'YXZ');
    B.root.quaternion.setFromEuler(_e);
    // a sneeze squashes it, a hit makes it flinch back
    B.shell.scale.set(1 + 0.08 * sneeze, 1 - 0.14 * sneeze, 1 + 0.05 * sneeze);
    turn(B.shell, -0.08 * hurt, 0, 0);
    // the mouth: a yawn going home, open in a sneeze or a charge, a little open while dizzy
    let mouth = 0.05;
    if (st === 'home') mouth = 0.55 * Math.sin(clamp((T - 0.4) / 2.2, 0, 1) * PI);
    if (st === 'charge' || st === 'crouch') mouth = 0.35;
    if (dizzy) mouth = 0.2;
    mouth = Math.max(mouth, sneeze * 0.6);
    turn(B.mouth, mouth, 0, 0);
    // the legs: folded under it while it sleeps, stepping as it walks (gait: u walked), braced when it stands
    const fold = 1 - smooth((k - 0.1) / 0.5);
    const rate = (gait / 2.6) * PI;
    LEGS.forEach((lz, i) => {
      for (const sd of [-1, 1]) {
        const nm = `${sd < 0 ? 'R' : 'L'}${i}`;
        const up = B[`legU${nm}`];
        const lo = B[`legL${nm}`];
        const ph = rate + (i % 2 ? PI : 0) + (sd < 0 ? PI : 0);
        const lift2 = walking && !still ? Math.max(0, Math.sin(ph)) : 0;
        const swing = walking && !still ? 0.28 * Math.cos(ph) : 0;
        // (about z: + lifts the left legs; mirrored for the right)
        // (asleep: the upper leg turns down and the lower one, following it, tucks in under the shell)
        turn(up, 0, swing * sd, sd * (0.25 * lift2 - 1.15 * fold + (st === 'crouch' ? -0.25 : 0)));
        turn(lo, 0, 0, sd * (-0.2 * fold - 0.2 * lift2 + (st === 'crouch' ? 0.35 : 0)));
      }
    });
    // the claws
    const sectors = list(V.sectors);
    for (const cl of list(V.claws)) {
      if (!obj(cl)) continue;
      const sd = cl.id === 'clawR' ? -1 : 1;
      const nm = sd < 0 ? 'R' : 'L';
      const arm = B[`arm${nm}`];
      const hand = B[`hand${nm}`];
      const finger = B[`finger${nm}`];
      let yaw = 0;
      let lft = -0.1 * fold;
      let open = still ? 0.25 : 0.2 + 0.18 * Math.max(0, Math.sin(t * 2.4 + (sd > 0 ? 0 : 1.6)));
      const sect = sectors.find((s) => obj(s) && s.claw === cl.id);
      if (sect) {
        // winding up: raised, drawn out to its side, open wide
        const w = smooth(num(sect.t, 0) / Math.max(0.1, num(sect.T, 1.8)));
        yaw = sd * 0.55 * w;
        lft = -0.35 * w;
        open = 0.75;
      }
      const sw = clamp(num(cl.sweep, 0), 0, 1);
      if (sw > 0) {
        // the snap: it swings across and shuts
        yaw = sd * (0.55 - 1.3 * Math.sin((1 - sw) * PI * 0.5)) * (still ? 0 : 1);
        lft = -0.2;
        open = 0;
      }
      if (cl.down) {
        // drooping (OUCH!): down in the water, limp
        const d = smooth(num(cl.t, 0) / 0.5) * (1 - smooth((num(cl.t, 0) - 7.3) / 0.7));
        lft = lerp(lft, 0.55, d);
        yaw = lerp(yaw, -sd * 0.2, d);
        open = lerp(open, 0.45, d);
      }
      if (st === 'crouch') lft -= 0.15;
      turn(arm, lft, yaw, 0);
      turn(hand, lft * 0.5, yaw * 0.4, 0);
      turn(finger, -open, 0, 0);
    }
    // the eyes: stalks up when awake (folded flat asleep), lids, pupils toward you, spinning when dizzy
    const eyes = list(V.eyes);
    for (const ev of eyes) {
      if (!obj(ev)) continue;
      const sd = ev.id === 'eyeR' ? -1 : 1;
      const nm = sd < 0 ? 'R' : 'L';
      const open = clamp(num(ev.open, 1), 0, 1);
      const up = st === 'sleep' || st === 'asleep' ? 0 : st === 'wake' ? smooth((open - 0.05) / 0.6) : st === 'home' ? 0.6 : 1;
      if (open > 0.5) counts.eyesOpen++;
      const stalk = B[`stalk${nm}`];
      // (asleep they lie folded back on its shell)
      turn(stalk, -1.35 * (1 - up) + (still ? 0 : 0.04 * Math.sin(t * 1.6 + sd)), 0, sd * (dizzy ? 0.12 * Math.sin(t * 3 + sd) * sway : 0));
      // a blink every few seconds
      if (t > body.blinkAt + 0.2) body.blinkAt = t + 2.4 + 2.6 * hash(Math.floor(t));
      const blink = !still && t >= body.blinkAt && t <= body.blinkAt + 0.2 ? Math.sin(((t - body.blinkAt) / 0.2) * PI) : 0;
      const shut = Math.max(1 - open, blink, st === 'crouch' ? 0.35 : 0, sneeze);
      // (the lid is a cap over the top of the eye: turned forward about x it closes)
      turn(B[`lid${nm}`], lerp(-1.2, 0.35, shut), 0, 0);
      const pupil = B[`pupil${nm}`];
      if (dizzy) {
        const a = (still ? 1 : t * 5) * sd;
        turn(pupil, 0.4 * Math.cos(a), 0.4 * Math.sin(a), 0, 'YXZ');
      } else if (obj(ev.look) && fin(ev.look.x) && fin(ev.look.z)) {
        const yaw = clamp(wrap(Math.atan2(ev.look.x - x, ev.look.z - z) - h), -0.6, 0.6);
        turn(pupil, 0.15, yaw, 0, 'YXZ');
      }
    }
    if (dizzy) {
      // stars round its eyes
      B.root.updateMatrixWorld(true);
      _v.set(0, EYE.y + 1.8, EYE.ahead).applyMatrix4(B.shell.matrixWorld);
      for (let i = 0; i < 4; i++) {
        const a = (still ? 0 : t * 2.2) + (i / 4) * TAU;
        const sx = _v.x + Math.cos(a) * 3.2;
        const sz = _v.z + Math.sin(a) * 3.2;
        const sy = _v.y + 0.3 * Math.sin(a * 2);
        shapes.ushape(sx, sy, sz, STAR, 1.0, still ? 0 : t * 1.4 + i, S.ink, 0.95);
        shapes.ushape(sx, sy, sz, STAR, 0.78, still ? 0 : t * 1.4 + i, S.star, 1);
        counts.stars++;
      }
    }
    lastBody = { x, z, h, y, k, st };
    counts.body = 1;
    return { x, z, h, y, k, st, T };
  }

  // the fort: riding on its back (posed from the shell), flying off into the sea at the throw, then gone
  function poseFort(V, Bp, t) {
    const B = body.bones;
    const Bv = V.body;
    const onBack = !!Bv.fort || (Bp.st === 'throw' && num(Bp.T, 0) < 1.5);
    B.root.updateMatrixWorld(true);
    const showTowers = list(V.towers);
    if (Bv.fort) {
      body.fortFly = null;
      B.fort.matrixAutoUpdate = true;
      _v.set(0, FORT_Y, 0).applyMatrix4(B.shell.matrixWorld);
      B.fort.position.copy(_v);
      B.shell.getWorldQuaternion(B.fort.quaternion);
      B.fort.scale.set(1, 1, 1);
      counts.fort = 1;
    } else if (Bp.st === 'throw' && onBack) {
      // flung up and back over its tail, tumbling, landing where the splash will be
      if (!body.fortFly) {
        _v.set(0, FORT_Y, 0).applyMatrix4(B.shell.matrixWorld);
        const sp = obj(V.splash) && fin(V.splash.x) ? V.splash : { x: Bp.x - Math.sin(Bp.h) * 14, z: Bp.z - Math.cos(Bp.h) * 14 };
        body.fortFly = { x0: _v.x, y0: _v.y, z0: _v.z, x1: sp.x, z1: sp.z };
      }
      const f = body.fortFly;
      const u = smooth(num(Bp.T, 0) / 1.2);
      B.fort.position.set(lerp(f.x0, f.x1, u), lerp(f.y0, sea(f.x1, f.z1, t) - 3, u) + 9 * u * (1 - u), lerp(f.z0, f.z1, u));
      B.fort.rotation.set(-1.4 * u, Bp.h, 0.5 * u, 'YXZ');
      counts.fort = 1;
    } else {
      // gone under the splash
      B.fort.position.set(Bp.x, -60, Bp.z);
    }
    // the towers: guns turned toward their aim; a downed tower topples outward and sinks into its stump
    for (let i = 0; i < 3; i++) {
      const tv = showTowers.find((q) => obj(q) && q.id === `tower${i + 1}`);
      const tb = B[`tower${i}`];
      const gb = B[`gun${i}`];
      if (!tv) continue;
      counts.towers++;
      if (fin(tv.aim)) {
        const yaw = wrap(tv.aim - Bp.h);
        turn(gb, 0, yaw, 0);
      } else turn(gb, 0, (i - 1) * 1.1, 0);
      if (tv.down) {
        counts.towersDown++;
        const T = num(tv.t, 0);
        const a = PI + (i - 1) * ((TAU / 3) * 0.8);
        const f = smooth(T / 0.9);
        // tip outward (away from the fort's middle), then slide down into the shell
        turn(tb, Math.cos(a) * 1.2 * f, 0, -Math.sin(a) * 1.2 * f);
        tb.position.y -= 2.5 * smooth((T - 0.6) / 1.4);
        if (T > 2.2) tb.scale.setScalar(0);
      }
    }
    // the bell swings and rings at the wake (and in each phase change), still under reduced motion
    const ring = Bp.st === 'wake' || Bp.st === 'stand' || Bp.st === 'throw';
    if (ring && !still) turn(B.bell, 0, 0, 0.45 * Math.sin(t * 7) * Math.max(0, 1 - num(Bp.T, 0) / 3));
  }

  // ---- shapes: boulder rings, claw sectors, charge lanes, tower lines
  function drawShapes(V, t) {
    // fills first
    for (const r of list(V.rings)) {
      if (!obj(r) || !fin(r.x) || !fin(r.z)) continue;
      const R = clamp(num(r.r, 5), 1, 20);
      const u = clamp(num(r.t, 0) / Math.max(0.05, num(r.T, 2)), 0, 1);
      shapes.disc(r.x, r.z, R * 0.95, S.boulderFill, 0.16, 0);
      shapes.disc(r.x, r.z, R * Math.max(0.08, u) * 0.92, S.boulderFill, 0.3, 0.01);
    }
    for (const s of list(V.sectors)) {
      if (!obj(s) || !fin(s.x) || !fin(s.z)) continue;
      const R = clamp(num(s.r, 14), 1, 40);
      const half = clamp(num(s.half, 0.87), 0.05, 1.5);
      const u = clamp(num(s.t, 0) / Math.max(0.05, num(s.T, 1.8)), 0, 1);
      shapes.sector(s.x, s.z, num(s.h, 0), half, 0.6, R, S.redFill, 0.13, 0);
      shapes.sector(s.x, s.z, num(s.h, 0), half, 0.6, 0.6 + (R - 0.6) * Math.max(0.06, u), S.redFill, 0.26, 0.01);
    }
    for (const L of list(V.lanes)) {
      if (!obj(L) || !fin(L.x0) || !fin(L.x1)) continue;
      const w = clamp(num(L.w, 7), 1, 14);
      const u = L.state === 'run' ? 1 : clamp(num(L.t, 0) / Math.max(0.05, num(L.T, 2)), 0, 1);
      shapes.seg(L.x0, L.z0, L.x1, L.z1, w, S.charge, 0.12, 0);
      shapes.seg(L.x0, L.z0, lerp(L.x0, L.x1, Math.max(0.05, u)), lerp(L.z0, L.z1, Math.max(0.05, u)), w * 0.92, S.charge, 0.24, 0.01);
    }
    // the boulder rings: a plain thick orange ring on ink, and the boulder lobbed from its back to land as it ends
    let nb = 0;
    const now = new Set();
    for (const r of list(V.rings)) {
      if (!obj(r) || !fin(r.x) || !fin(r.z)) continue;
      const R = clamp(num(r.r, 5), 1, 20);
      const T = Math.max(0.05, num(r.T, 2));
      const u = clamp(num(r.t, 0) / T, 0, 1);
      shapes.band(r.x, r.z, R - 0.55, R + 0.55, S.ink, 0.95, 0.02);
      shapes.band(r.x, r.z, R - 0.36, R + 0.36, S.boulder, 1, 0.03);
      // a cross-hair of four ticks inside, so the ring reads as a target, not a pool
      for (let i = 0; i < 4; i++) {
        const a = (i * PI) / 2 + PI / 4;
        shapes.seg(r.x + Math.cos(a) * R * 0.45, r.z + Math.sin(a) * R * 0.45, r.x + Math.cos(a) * R * 0.75, r.z + Math.sin(a) * R * 0.75, 0.5, S.boulder, 0.9, 0.03);
      }
      counts.rings++;
      const f = obj(r.from) && fin(r.from.x) && fin(r.from.z) ? r.from : null;
      if (f && nb < CAP.boulders) {
        const x = lerp(f.x, r.x, u);
        const z = lerp(f.z, r.z, u);
        const y = lerp(sea(f.x, f.z, t) + 7, sea(r.x, r.z, t) + 0.8, u) + 4 * BOULDER.lob * u * (1 - u);
        const spin = still ? 0 : u * 6;
        _e.set(spin, spin * 0.7, 0);
        _q.setFromEuler(_e);
        _m.compose(_p.set(x, y, z), _q, _s.setScalar(1.4));
        _m.toArray(rocks.mesh.instanceMatrix.array, nb * 16);
        nb++;
        // its shadow on the water, darker as it comes down
        shapes.disc(r.x, r.z, 0.8 + 1.4 * u, S.shadow, 0.15 + 0.35 * u, 0.04, 16);
      }
      const id = typeof r.id === 'string' || typeof r.id === 'number' ? String(r.id) : null;
      if (id) {
        now.add(id);
        seenRings.set(id, { x: r.x, z: r.z, u });
      }
    }
    for (const [id, s] of seenRings) {
      if (now.has(id)) continue;
      if (s.u > 0.8) splashes.push({ x: s.x, z: s.z, t0: clock, big: 1 });
      seenRings.delete(id);
    }
    counts.boulders = nb;
    rocks.mesh.count = rocks.ink.count = nb;
    rocks.mesh.visible = rocks.ink.visible = nb > 0;
    if (nb) {
      rocks.mesh.instanceMatrix.clearUpdateRanges();
      rocks.mesh.instanceMatrix.addUpdateRange(0, nb * 16);
      rocks.mesh.instanceMatrix.needsUpdate = true;
    }
    // the claw sectors: straight red edges on ink and a zigzag rim, like a bite
    for (const s of list(V.sectors)) {
      if (!obj(s) || !fin(s.x) || !fin(s.z)) continue;
      const R = clamp(num(s.r, 14), 1, 40);
      const half = clamp(num(s.half, 0.87), 0.05, 1.5);
      const h = num(s.h, 0);
      const at = (r, a) => [s.x + Math.sin(h + a) * r, s.z + Math.cos(h + a) * r];
      const zig = [];
      const n = Math.max(8, Math.round((2 * half * R) / 1.6));
      for (let i = 0; i <= n; i++) {
        const a = -half + (2 * half * i) / n;
        const r = i % 2 ? R - 1.0 : R;
        zig.push(...at(r, a));
      }
      const edge = (w, hex, a, lift) => {
        shapes.path([...at(0.6, -half), ...at(R, -half)], w, hex, a, lift);
        shapes.path([...at(0.6, half), ...at(R, half)], w, hex, a, lift);
        shapes.path(zig, w, hex, a, lift);
      };
      edge(0.8, S.ink, 0.95, 0.03);
      edge(0.46, S.red, 1, 0.04);
      counts.sectors++;
    }
    // the charge lanes: coral-and-white dashes with arrows; running, a bright bar where it is
    for (const L of list(V.lanes)) {
      if (!obj(L) || !fin(L.x0) || !fin(L.z0) || !fin(L.x1) || !fin(L.z1)) continue;
      drawLane(shapes, { ...L, run: L.state === 'run' ? Math.max(0.001, num(L.run, 0)) : 0 }, t, still, S.charge, S.white, 7);
      counts.lanes++;
    }
    // the towers' lines
    const ids = new Set();
    for (const l of list(V.lines)) {
      if (!obj(l) || !fin(l.x0) || !fin(l.z0) || !fin(l.x1) || !fin(l.z1)) continue;
      const id = String(l.id ?? `${l.x0},${l.z0}`);
      ids.add(id);
      drawSightLine(shapes, lineMem, id, l, t, clock, still, null, (v) => {
        flash = Math.max(flash, v);
      });
      counts.lines++;
    }
    for (const id of [...lineMem.keys()]) if (!ids.has(id)) lineMem.delete(id);
  }

  // ---- bubbles: the wake's boil, snores, the fort's splash, the boulders' splashes
  function drawBubbles(V, Bp, t) {
    const Bv = V.body;
    if (Bp && (Bp.st === 'sleep' || Bp.st === 'asleep')) {
      // a stream of snore bubbles from its mouth every few seconds
      const cyc = still ? 0.5 : frac(t / 4.5);
      if (cyc < 0.55) {
        _v.set(0, 2.4, 6.4).applyMatrix4(body.bones.shell.matrixWorld);
        for (let i = 0; i < 6; i++) {
          const life = still ? i / 6 : frac(cyc * 2 + i / 6);
          bubbles.add(_v.x + Math.sin(i * 2.1) * 0.5, Math.max(_v.y, sea(_v.x, _v.z, t)) + 0.2 + life * 2.4, _v.z + 0.4 + Math.cos(i * 1.3) * 0.4, 0.8 + 1.4 * life, foam);
        }
      }
    }
    const wake = obj(V.wake) ? V.wake : null;
    if (wake && Bp) {
      // the boil round it as it rises
      const k = clamp(num(wake.k, 0), 0, 1);
      const n = Math.round(30 * (1 - 0.5 * k));
      for (let i = 0; i < n; i++) {
        const a = (i / 30) * TAU + (still ? 0 : t * 0.15);
        const r = 11 + 2.5 * hash(i);
        const life = still ? 0.5 : frac(t * 0.9 + i * 0.37);
        bubbles.add(Bp.x + Math.cos(a) * r, sea(Bp.x, Bp.z, t) + 0.15 + life * 0.9, Bp.z + Math.sin(a) * r, 1.2 + life * 1.4, foam);
      }
    }
    if (obj(V.splash) && fin(V.splash.x)) {
      const T = num(V.splash.t, 0);
      const k = clamp(T / 1.6, 0, 1);
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * TAU;
        const r = 1 + 7 * k;
        bubbles.add(V.splash.x + Math.cos(a) * r, sea(V.splash.x, V.splash.z, t) + 0.2 + Math.sin(k * PI) * (4 + 3 * hash(i)), V.splash.z + Math.sin(a) * r, 2.6 * (1 - k) + 0.4, foam);
      }
    }
    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i];
      const age = clock - s.t0;
      if (age > 0.8) {
        splashes.splice(i, 1);
        continue;
      }
      const k = age / 0.8;
      for (let j = 0; j < 12; j++) {
        const a = (j / 12) * TAU;
        const r = 0.8 + 4 * k;
        bubbles.add(s.x + Math.cos(a) * r, sea(s.x, s.z, t) + 0.2 + Math.sin(k * PI) * 2.6 * (0.6 + 0.4 * hash(j)), s.z + Math.sin(a) * r, 1.8 * (1 - k) + 0.3, foam);
      }
    }
  }

  // ---- the towers' gunners rowing away
  function drawBoats(V, Bp, t) {
    boats.begin();
    if (Bp) {
      for (const tv of list(V.towers)) {
        if (!obj(tv) || !tv.down || !fin(tv.x)) continue;
        const T = num(tv.t, 0);
        if (T < 0.8 || T > 7) continue;
        const away = Math.atan2(tv.x - Bp.x, tv.z - Bp.z);
        const d = 10 + (T - 0.8) * 2.4;
        const x = Bp.x + Math.sin(away) * d;
        const z = Bp.z + Math.cos(away) * d;
        const sink = smooth((T - 6.2) / 0.8) * 1.6;
        boats.boat(x, sea(x, z, t) - 0.06 - sink, z, away, 0, 0, [1, 0, 1, 1], [still ? 0.9 : t * 3.4, 0, 0, 0]);
        counts.boats++;
      }
    }
    boats.end();
  }

  // ---- the Golden Conch
  function drawConch(V, t, dt) {
    const c = obj(V.conch) && fin(V.conch.x) && fin(V.conch.z) ? V.conch : null;
    const k = c ? clamp(num(c.k, 1), 0, 1) : 0;
    if (k <= 0.01) {
      conch.group.visible = false;
      return;
    }
    conch.group.visible = true;
    counts.conch = 1;
    const bob = still ? 0 : 0.2 * Math.sin(t * 1.6);
    conch.group.position.set(c.x, sea(c.x, c.z, t) + 0.9 + (smooth(k) - 1) * 5 + bob, c.z);
    // (its lip, +z, turned to you: main passes h, the bearing from it to your ship)
    conch.group.rotation.set(still ? 0.12 : 0.12 + 0.06 * Math.sin(t * 1.1), num(c.h, 0), still ? 0 : 0.07 * Math.sin(t * 0.9 + 1));
    conch.group.scale.setScalar(1.25);
    // its glow on the water eases up and down once every 2.5 s (under 1 Hz), steady under reduced motion
    const g = still ? 0.5 : 0.5 + 0.5 * Math.sin((t * TAU) / 2.5);
    conch.mat.emissiveIntensity = 0.5 + 0.35 * g;
    shapes.disc(c.x, c.z, 3.2, S.glow, 0.12 + 0.08 * g, 0.01, 28);
    shapes.band(c.x, c.z, 3.0, 3.5, 0xffffff, 0.55, 0.02, 0, TAU, 28);
  }

  // ---- its status, drawn by statusfx.js like a ship's (statusShip)
  const ANCHORS = (() => {
    const rail = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      if (Math.cos(a) > 0.8) continue; // (not over its face)
      rail.push({ x: Math.sin(a) * SHELL.rx * 0.95, y: SHELL.y + 0.6, z: Math.cos(a) * SHELL.rz * 0.95 + SHELL.z });
    }
    return { rail, deck: { x: 0, y: SHELL.y + SHELL.ry - 0.4, z: SHELL.z - 1 }, holes: [{ x: 3.6, y: SHELL.y + 1.6, z: 4.4, side: -1 }, { x: -3.6, y: SHELL.y + 1.6, z: 4.4, side: 1 }] };
  })();
  const standMesh = new THREE.Group();
  standMesh.name = 'shellback-status';
  standMesh.userData.statusAnchors = ANCHORS;
  root.add(standMesh);
  const stand = { mesh: standMesh, status: { id: null, t: 0, max: 0, immune: 0 }, type: { name: 'The Shellback', len: 16, wid: 15 }, hp: 0, x: 0, z: 0, h: 0, shellback: true };
  function statusShip(status) {
    const st = obj(status) ? status : {};
    const id = st.id === 'fire' || st.id === 'frost' || st.id === 'stink' ? st.id : null;
    const shown = !!(id && lastBody && body && body.holder.visible && lastBody.k > 0.3);
    if (shown) {
      standMesh.position.set(lastBody.x, lastBody.y, lastBody.z);
      standMesh.rotation.set(0, lastBody.h, 0);
      standMesh.updateMatrixWorld(true);
      stand.x = lastBody.x;
      stand.z = lastBody.z;
      stand.h = lastBody.h;
    }
    stand.status = { id: shown ? id : null, t: num(st.t, 0), max: num(st.max, 0), immune: num(st.immune, 0) };
    stand.hp = shown ? 1 : 0;
    return stand;
  }

  function warmables() {
    if (disposed) return [];
    buildAll();
    shapes.warm();
    bubbles.warm();
    boats.warm();
    _m.compose(_p.set(0, -600, 0), _q.identity(), _s.setScalar(1));
    _m.toArray(rocks.mesh.instanceMatrix.array, 0);
    rocks.mesh.count = rocks.ink.count = 1;
    rocks.mesh.instanceMatrix.needsUpdate = true;
    rocks.mesh.visible = rocks.ink.visible = false;
    body.bones.root.position.set(0, -600, 0);
    body.bones.fort.position.set(0, -600, 0);
    body.holder.visible = false;
    conch.group.position.set(0, -600, 0);
    conch.group.visible = false;
    warmPending = true;
    return [root];
  }

  const camPos = V3();
  const camLook = V3();

  const api = {
    prepare() {
      if (disposed) return false;
      if (step < STEPS) buildNext();
      return step >= STEPS;
    },
    get ready() {
      return step >= STEPS && !disposed;
    },

    update(visuals, t = 0, dt = 0) {
      if (disposed) return;
      const V = obj(visuals) ? visuals : {};
      const any = obj(V.body) || obj(V.conch) || obj(V.splash) || ['rings', 'sectors', 'lanes', 'lines', 'towers'].some((k) => list(V[k]).length > 0) || splashes.length > 0;
      if (step < STEPS) {
        if (!any) return;
        buildAll();
      }
      if (warmPending) {
        warmPending = false;
        conch.group.visible = false;
      }
      still = rm();
      const time = num(t, 0);
      const st0 = Math.max(0, num(dt, 0));
      clock += st0;
      lastT = time;
      resetCounts();
      flash = 0;
      shapes.begin(time);
      bubbles.begin();
      let Bp = null;
      if (obj(V.body) && fin(V.body.x) && fin(V.body.z)) {
        body.holder.visible = true;
        Bp = poseBody(V, time, st0);
        poseFort(V, Bp, time);
        // its shadow on the water
        shapes.blob(Bp.x, Bp.z, 8.5, 8.0, Bp.h, S.shadow, 0.18 + 0.12 * Bp.k, -0.06);
        body.bones.root.updateMatrixWorld(true);
        body.bones.fort.updateMatrixWorld(true);
      } else {
        body.holder.visible = false;
        lastBody = null;
      }
      drawShapes(V, time);
      drawBubbles(V, Bp, time);
      drawBoats(V, Bp, time);
      drawConch(V, time, st0);
      shapes.end();
      bubbles.end();
      counts.bubbles = bubbles.count;
      const sc = shapes.count;
      counts.shapes = sc.flat + sc.up;
    },

    riseCamera(k, from) {
      if (disposed || !lastBody || !fin(k)) return null;
      const H = lastBody;
      const fx0 = Math.sin(H.h);
      const fz0 = Math.cos(H.h);
      const px = from && fin(from.x) ? from.x : H.x + fx0 * 45;
      const pz = from && fin(from.z) ? from.z : H.z + fz0 * 45;
      let dx = px - H.x;
      let dz = pz - H.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;
      // its face: between the eyes, at the height they stand at the end of the wake
      const faceY = sea(H.x, H.z, lastT) + EYE.y + lerp(STAND.low, STAND.high, 0.6) - 0.5;
      const ex = H.x + fx0 * EYE.ahead;
      const ez = H.z + fz0 * EYE.ahead;
      if (rm()) {
        // reduced motion: a cut to the crab's face for 1.5 s in the middle of the wake, and back; no glide
        const T = from && fin(from.duration) && from.duration > 0 ? from.duration : WAKE_T;
        const w = Math.min(1, CUT_T / T);
        if (k < 0.5 - w / 2 || k >= 0.5 + w / 2) return null;
        const a = H.h + 0.5;
        camPos.set(ex + Math.sin(a) * 30, faceY + 6, ez + Math.cos(a) * 30);
        camLook.set(ex, faceY - 1.5, ez);
        return { pos: camPos, look: camLook };
      }
      const kk = clamp(k, 0, 1);
      // up and back over your stern, then the look climbs onto its face as its eyes pop open, then settles
      const up = smooth(kk / 0.4) * (1 - 0.4 * smooth((kk - 0.8) / 0.2));
      const back = 17 + 16 * up;
      const side = 6 * up;
      camPos.set(px + dx * back - dz * side, 10 + 14 * up, pz + dz * back + dx * side);
      const toFace = smooth((kk - 0.2) / 0.4);
      const midX = lerp(px, H.x, 0.5);
      const midZ = lerp(pz, H.z, 0.5);
      camLook.set(lerp(midX, ex, toFace), lerp(2, faceY - 1, toFace), lerp(midZ, ez, toFace));
      return { pos: camPos, look: camLook };
    },

    statusShip,
    warmables,

    read() {
      return { ready: api.ready, still, flash: Math.round(flash * 1000) / 1000, ...counts, triangles: shapes ? shapes.count : { flat: 0, up: 0 } };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(root);
      if (shapes) shapes.dispose();
      if (bubbles) bubbles.dispose();
      if (boats) boats.dispose();
      if (rocks) {
        rocks.mesh.dispose();
        rocks.ink.dispose();
      }
      for (const g of own.geos) g.dispose();
      for (const m of own.mats) m.dispose();
      for (const s of own.skels) s.dispose();
    },
  };
  return api;
}

const STAR = (() => {
  const p = [0, 0];
  for (let i = 0; i <= 10; i++) {
    const a = PI / 2 + (i / 10) * TAU;
    const r = i % 2 ? 0.42 : 1;
    p.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return p;
})();
