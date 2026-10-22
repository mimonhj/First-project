// The captain ashore on Sparrow's Floating Island (SPEC2 §7.2, §7.3): a third-person controller that
// walks the town by the rules of walk.js (on sparrow's env.walk data), the follow camera, tap-to-walk
// and auto-walk with a gold ring at the target, the townsfolk's greetings, and the 3D side of the
// tailor's and the tavern's panels (the captain on the podium, the crew line-up, the framing beside
// a panel). No DOM here except reading the panel's layout box: townMode.js owns the HUD.
//
// createTown({ scene, camera, walkData, audio, reducedMotion, env }) → {
//   setCaptain(opts),                      (re)build the captain from buildPerson opts (scale 1.1 added)
//   enter(at = 'spawn' | placeId | { x, z, h }, { swoopFrom }), exit(),
//   setMove({ x, z, run }),                camera-relative: x right, z forward, |v| ≤ 1 (tilt)
//   walkTo(x, z) → bool, goTo(placeId, { open = true }) → bool, cancelAuto(),
//   pick(ndcX, ndcY) → { x, z } | null,   where a tap lands on the walk
//   drag(dxPx, dyPx), recenter(),
//   update(dt, t) → { place, arrived, moving, greet, bubble },   also drives the camera
//   pose(viewName) → { pos, target } | null,
//   frameBeside(panelEl, points),          lens shift so the points sit in the free area beside panelEl
//   park(placeId | null), setPanel(view, panelEl, subject, { secs }), setLineup(optsList | null), cheer(who, s),
//     (views: 'tailor', 'tavern', and the Kraken Seas' 'quiz' and 'build' (the place 'builder'); subject:
//     'captain', 'lineup' (the tailor's), or a pose { pos, target, points } to glide to, e.g. a plot, SPEC3 §8.3)
//   sparkle(x, y, z), simulate(seconds, input) → { x, y, z, h, place, arrived, moving, greet },
//   get captain, get walk, get lineup, get auto, dispose()
// }
import * as THREE from 'three';
import { createWalk } from './walk.js';
import { buildPerson, animatePerson, disposePerson, walkSpeed } from './people.js';
import { noOutline } from './style.js';

const TAU = Math.PI * 2;
const RADIUS = 0.3; // the captain's collision radius
const SCALE = 1.1; // the captain is a little bigger than the townsfolk
const SPEED = { walk: 1.4, jog: 3.0, sprint: 4.6 };
const ACCEL = 12; // u/s² speeding up
const DECEL = 20; // u/s² stopping (from a jog in about 0.15 s)
const TURN = 10; // rad/s: the body turns toward the way he walks
const STEER = 16; // rad/s: the way he walks follows the input (a quick arc instead of a moonwalk)
const RUN_AT = 1.5; // u/s: faster than this the legs run
const HOLD_TURN = 0.35; // rad: a held walking input turned further than this re-reads the camera
const LINEUP_TEMPO = 1.6; // the sailors stride out of the shop briskly
const CAM = {
  lift: 1.2, // look at the captain's chest
  dist: 6.5,
  distPortrait: 7.5,
  fovPortrait: 60, // degrees: the walk view's lens on a portrait screen (setLens() gives up to 90 there)
  pitch: 0.4,
  pitchMin: 0.2,
  pitchMax: 0.75,
  dragK: 0.006, // rad per pixel
  followDelay: 1.5, // seconds after a drag before the camera swings behind again
  followRate: 1.5, // rad/s
  minBoom: 2.5,
  closest: 1.2, // ...unless the lens would sit inside something there: then as close as this
  pad: 0.3, // the lens keeps this far from anything it may not pass through
  clearance: 0.9, // never lower than the deck + this
  swoop: 0.8, // seconds from the shipyard view to behind the captain
};
const GREET = { dist: 2.2, seconds: 2, every: 20, bubble: 2.6 };
const PANEL_PAN = 0.6; // seconds for the tailor's camera to pan between the captain and the line-up
const SWAY = { amp: 1.1, rate: 0.45 }; // the podium pose: turning slowly to show off the outfit
const LINEUP_SEEDS = [1, 2, 3];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrap = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const turnToward = (a, b, step) => {
  const d = wrap(b - a);
  return Math.abs(d) <= step ? b : a + Math.sign(d) * step;
};
const smooth = (u) => u * u * (3 - 2 * u);
const vec = (v) => (Array.isArray(v) ? new THREE.Vector3(v[0], v[1], v[2]) : new THREE.Vector3(v.x, v.y, v.z));
const finite = (...v) => v.every(Number.isFinite);

export function createTown({ scene, camera, walkData, audio = null, reducedMotion = () => false, env = null } = {}) {
  const data = walkData && typeof walkData === 'object' ? walkData : {};
  const walk = createWalk(data);
  const places = walk.places;
  const placeById = (id) => places.find((p) => p.id === id) || null;
  // a panel view's place: the views are named as the places, but for the build view (place 'builder', SPEC3 §8.3)
  const placeOf = (view) => placeById(view === 'build' ? 'builder' : view);
  // the new places' panel views fit their subject (the lens backs off when it can't fit it beside the panel)
  const FIT_VIEWS = ['quiz', 'build'];
  const rm = () => {
    try {
      return !!(typeof reducedMotion === 'function' ? reducedMotion() : reducedMotion);
    } catch {
      return false;
    }
  };
  const envNow = () => (typeof env === 'function' ? env() : env);
  const sfx = (name, opts) => {
    try {
      if (audio && audio.play) audio.play(name, opts);
    } catch {
      // sound is decoration
    }
  };

  // What the camera's boom may not pass through (each padded by CAM.pad round its sides, top and
  // bottom): the tall blockers (buildings, the tower, the crane, the docked ship; thin posts and low
  // props don't count, the boom would pump in and out past them), and the camera-only volumes of
  // walk.camBlockers: things up in the air the captain walks under or round but the lens must not
  // pass through (the signs' boards on their posts, the leaning palm trunks, the beach umbrella):
  // { x, z, w, d, ry, y0, y1 } or { x, z, r, y0, y1 }.
  const camBlocks = [];
  const P = CAM.pad;
  for (const b of Array.isArray(data.blockers) ? data.blockers : []) {
    if (!b || !(b.h >= 2) || !finite(b.x, b.z)) continue;
    const base = walk.heightAt(b.x, b.z) ?? 1.3;
    if (b.r !== undefined) {
      if (b.r >= 0.45) camBlocks.push({ x: b.x, z: b.z, r: b.r + P, top: base + b.h + P, y0: -Infinity });
    } else if (Math.min(b.w, b.d) >= 0.6) {
      const ry = b.ry || 0;
      camBlocks.push({ x: b.x, z: b.z, hw: b.w / 2 + P, hd: b.d / 2 + P, c: Math.cos(ry), s: Math.sin(ry), top: base + b.h + P, y0: -Infinity });
    }
  }
  for (const b of Array.isArray(data.camBlockers) ? data.camBlockers : []) {
    if (!b || !finite(b.x, b.z)) continue;
    const y0 = Number.isFinite(b.y0) ? b.y0 - P : -Infinity;
    const top = Number.isFinite(b.y1) ? b.y1 + P : Infinity;
    if (b.r !== undefined) camBlocks.push({ x: b.x, z: b.z, r: (Number.isFinite(b.r) ? b.r : 0) + P, top, y0 });
    else {
      const ry = Number.isFinite(b.ry) ? b.ry : 0;
      camBlocks.push({ x: b.x, z: b.z, hw: (Number.isFinite(b.w) ? b.w : 0) / 2 + P, hd: (Number.isFinite(b.d) ? b.d : 0) / 2 + P, c: Math.cos(ry), s: Math.sin(ry), top, y0 });
    }
  }
  const insideBlock = (o, x, z, pad = 0) => {
    const dx = x - o.x;
    const dz = z - o.z;
    if (o.r !== undefined) return dx * dx + dz * dz < (o.r + pad) * (o.r + pad);
    const lx = dx * o.c - dz * o.s;
    const lz = dx * o.s + dz * o.c;
    return Math.abs(lx) < o.hw + pad && Math.abs(lz) < o.hd + pad;
  };
  const camBlocked = (x, y, z) => {
    for (const o of camBlocks) if (y < o.top && y > o.y0 && insideBlock(o, x, z)) return true;
    return false;
  };

  // ---------------------------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------------------------
  const cap = {
    x: 0, y: 1.3, z: 0, h: 0, yVis: 1.3,
    speed: 0, // the speed he is trying to go
    act: 0, // how fast he really went (smoothed): drives the legs
    move: 0, // the way he walks (radians, like a ship's heading)
    cyc: 0, // walk/run cycles done (foot phase)
    plant: 0,
    blocked: 0,
    stuck: 0, // seconds walking by hand into someone without getting anywhere
    pass: 0, // seconds left squeezing past them (people don't block him meanwhile)
    cheerUntil: -Infinity,
    mesh: null,
    opts: null,
  };
  const input = { x: 0, z: 0, run: false };
  // The camera a held walking input is read against: the camera's yaw when the input began (or turned).
  // The camera swinging round by itself (to follow him, or out of a cramped corner) doesn't turn a key that
  // is still held, so W held keeps him going the way he set off (across a rope bridge, say); a drag or C
  // does turn it.
  let hold = null; // { yaw, x, z }
  let auto = null; // { pts, i, place, open, pass, stuck, repaths }
  let arrivedNow = null;
  let active = false;
  let parked = null; // { x, y, z, h0, h, held } on the podium / the tavern porch
  let panel = null; // { view, el, subject, from, t }
  let time = 0;
  let quiet = false; // simulate(): no footsteps
  const cam = { yaw: 0, pitch: CAM.pitch, pitchEff: CAM.pitch, boom: 1, sinceDrag: 99, swoop: null, ty: 1.3 };
  const greeted = new Map();
  let bubble = null; // { index, until }
  let greetWait = 0;
  let folkNow = [];

  // ---------------------------------------------------------------------------------------------
  // Little 3D extras: the gold ring at an auto-walk target, a gold sparkle for purchases
  // ---------------------------------------------------------------------------------------------
  const ringGroup = new THREE.Group();
  ringGroup.name = 'town-target';
  const ringGold = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.055, 6, 32).rotateX(Math.PI / 2),
    noOutline(new THREE.MeshBasicMaterial({ color: 0xffc93c }))
  );
  const ringInk = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.1, 4, 32).rotateX(Math.PI / 2).scale(1, 0.4, 1),
    noOutline(new THREE.MeshBasicMaterial({ color: 0x1d1330 }))
  );
  ringInk.position.y = -0.01;
  ringGroup.add(ringInk, ringGold);
  ringGroup.visible = false;
  scene.add(ringGroup);

  const SPARKS = 16;
  const sparkMesh = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.07, 0),
    noOutline(new THREE.MeshBasicMaterial({ color: 0xffd23f })),
    SPARKS
  );
  sparkMesh.name = 'town-sparkle';
  sparkMesh.frustumCulled = false;
  sparkMesh.visible = false;
  scene.add(sparkMesh);
  const sparks = Array.from({ length: SPARKS }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1 }));
  const dummy = new THREE.Object3D();

  let debugLines = null;
  if (/[?&]walkdebug=1(&|$)/.test(globalThis.location?.search ?? '')) {
    import('./env/sparrow.js')
      .then((m) => {
        if (!m.walkDebugLines || debugLines === false) return;
        debugLines = m.walkDebugLines(data);
        scene.add(debugLines);
      })
      .catch(() => {});
  }

  // ---------------------------------------------------------------------------------------------
  // The captain
  // ---------------------------------------------------------------------------------------------
  function placeMesh() {
    const m = cap.mesh;
    if (!m) return;
    if (parked) {
      m.position.set(parked.x, parked.y, parked.z);
      m.rotation.y = parked.h;
    } else {
      m.position.set(cap.x, cap.yVis, cap.z);
      m.rotation.y = cap.h;
    }
  }

  function setCaptain(opts) {
    const old = cap.mesh;
    cap.opts = { ...(opts && typeof opts === 'object' ? opts : {}) };
    const mesh = buildPerson({ ...cap.opts, scale: SCALE });
    mesh.name = 'town-captain';
    mesh.visible = old ? old.visible : true;
    scene.add(mesh);
    cap.mesh = mesh;
    if (old) disposePerson(old);
    placeMesh();
    animateCaptain(0, time);
    return mesh;
  }

  function animateCaptain(dt, t) {
    const m = cap.mesh;
    if (!m) return;
    placeMesh();
    if (t < cap.cheerUntil) {
      animatePerson(m, t, 'cheer');
      return;
    }
    if (parked) {
      animatePerson(m, t, 'proud');
      return;
    }
    const s = cap.act;
    if (s < 0.25) {
      animatePerson(m, t, 'proud');
      return;
    }
    // The legs keep their phase from walk to run, so the feet never skip.
    const run = s > RUN_AT;
    const action = run ? 'run' : 'walk';
    const F = run ? 1.45 : 1.05; // cycles a second at tempo 1 (people.js)
    const tempo = s / (walkSpeed(m, action, 1) || 1);
    cap.cyc += dt * F * tempo;
    animatePerson(m, cap.cyc / F, action, { phase: 0 });
    // a foot lands every half cycle
    const plant = Math.floor((cap.cyc - 0.25) * 2);
    if (plant !== cap.plant) {
      cap.plant = plant;
      if (!quiet) sfx('step', { volume: s > 3.5 ? 1 : s > 2 ? 0.8 : 0.6 });
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Entering and leaving the walk view
  // ---------------------------------------------------------------------------------------------
  function enter(at = 'spawn', { swoopFrom = null } = {}) {
    let x;
    let z;
    let h;
    let yaw = null;
    const p = typeof at === 'string' ? placeById(at) : null;
    if (at && typeof at === 'object' && finite(at.x, at.z)) {
      x = at.x;
      z = at.z;
      h = Number.isFinite(at.h) ? at.h : cap.h;
    } else if (p) {
      // out of a door: at the place, facing out, the camera in front looking at him and the door
      const s = walk.snap(p.x, p.z, 2) || p;
      x = s.x;
      z = s.z;
      h = wrap((p.face || 0) + Math.PI);
      yaw = p.face || 0;
    } else if (at === 'here' && cap.mesh) {
      x = cap.x;
      z = cap.z;
      h = cap.h;
    } else {
      const s = walk.spawn || { x: 0, z: 0, h: 0 };
      x = s.x;
      z = s.z;
      h = s.h;
    }
    cap.x = x;
    cap.z = z;
    cap.h = h;
    cap.move = h;
    cap.y = walk.heightAt(x, z, cap.y) ?? cap.y;
    cap.yVis = cap.y;
    cap.speed = 0;
    cap.act = 0;
    cap.blocked = 0;
    parked = null;
    panel = null;
    setLineup(null);
    cancelAuto();
    input.x = 0;
    input.z = 0;
    input.run = false;
    hold = null;
    cam.yaw = yaw === null ? h : yaw;
    cam.pitch = CAM.pitch;
    cam.sinceDrag = 99;
    cam.ty = cap.y;
    cam.boom = 1;
    cam.swoop = null;
    active = true;
    if (cap.mesh) cap.mesh.visible = true;
    placeMesh();
    updateCamera(0, true);
    if (swoopFrom && !rm()) {
      let from = null;
      if (swoopFrom === true || swoopFrom === 'camera') {
        // from wherever the camera is now (the shipyard's showcase view)
        from = { pos: camera.position.clone(), target: camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(12).add(camera.position) };
      } else if (swoopFrom.pos && swoopFrom.target) {
        from = { pos: vec(swoopFrom.pos), target: vec(swoopFrom.target) };
      }
      if (from) {
        cam.swoop = { t: 0, ...from };
        updateCamera(0, true);
      }
    }
    return true;
  }

  function exit() {
    active = false;
    tellEnv(false);
    cancelAuto();
    input.x = 0;
    input.z = 0;
    input.run = false;
    cap.speed = 0;
    cap.act = 0;
    bubble = null;
    cam.swoop = null;
  }

  // ---------------------------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------------------------
  function setMove(m = {}) {
    const x = Number.isFinite(m.x) ? clamp(m.x, -1, 1) : 0;
    const z = Number.isFinite(m.z) ? clamp(m.z, -1, 1) : 0;
    input.x = x;
    input.z = z;
    input.run = !!m.run;
    if (Math.hypot(x, z) > 0.01 && auto) cancelAuto();
  }

  function startAuto(target, place = null, open = false) {
    if (parked) return false;
    const from = { x: cap.x, z: cap.z };
    const pts = walk.path(from, target);
    if (!pts.length) return false;
    const end = pts[pts.length - 1];
    auto = { pts, i: Math.min(1, pts.length - 1), place, open, pass: 0, stuck: 0, repaths: 0, end };
    ringGroup.position.set(end.x, (walk.heightAt(end.x, end.z, cap.y) ?? cap.y) + 0.04, end.z);
    ringGroup.visible = true;
    return true;
  }

  function walkTo(x, z) {
    if (!finite(x, z)) return false;
    const s = walk.snap(x, z, 3);
    if (!s) return false;
    if (startAuto(s, null, false)) return true;
    // A corner shut in by props (or one the path graph misses): walk as near to it as he can get.
    const near = walk.graph.nodes
      .map((n) => ({ ...n, d: Math.hypot(n.x - s.x, n.z - s.z) }))
      .filter((n) => n.d <= 4)
      .sort((a, b) => a.d - b.d)
      .slice(0, 8);
    for (const n of near) if (startAuto({ x: n.x, z: n.z }, null, false)) return true;
    return false;
  }

  function goTo(id, { open = true } = {}) {
    const p = placeById(id);
    if (!p) return false;
    const s = walk.snap(p.x, p.z, 2);
    if (!s) return false;
    if (Math.hypot(s.x - cap.x, s.z - cap.z) < 0.3 && !parked) {
      // already there
      cancelAuto();
      if (open) arrivedNow = p.id;
      return true;
    }
    return startAuto(s, p, open);
  }

  function cancelAuto() {
    auto = null;
    ringGroup.visible = false;
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  /** Where a tap at normalised device coordinates lands on the walk ({ x, z }), or null. */
  function pick(nx, ny) {
    if (!finite(nx, ny)) return null;
    camera.updateMatrixWorld();
    ndc.set(nx, ny);
    raycaster.setFromCamera(ndc, camera);
    const o = raycaster.ray.origin;
    const d = raycaster.ray.direction;
    const hit = walk.pick([o.x, o.y, o.z], [d.x, d.y, d.z]);
    // A building (or the ship) in front of that point: walk up to it instead of through it.
    const far = hit ? Math.hypot(hit.x - o.x, hit.z - o.z) / Math.max(1e-6, Math.hypot(d.x, d.z)) : 80;
    for (let s = 0.5; s < far; s += 0.25) {
      const x = o.x + d.x * s;
      const y = o.y + d.y * s;
      const z = o.z + d.z * s;
      if (y < 0) break;
      if (camBlocked(x, y, z)) return walk.snap(x, z, 3);
    }
    if (!hit) return null;
    return walk.snap(hit.x, hit.z, 1.5);
  }

  function drag(dx, dy) {
    if (!finite(dx, dy)) return;
    if (parked) {
      parked.h = wrap(parked.h + dx * 0.012);
      parked.held = 3;
      return;
    }
    cam.yaw = wrap(cam.yaw - dx * CAM.dragK);
    if (hold) hold.yaw = wrap(hold.yaw - dx * CAM.dragK); // (a drag turns a held key with the camera)
    cam.pitch = clamp(cam.pitch + dy * CAM.dragK, CAM.pitchMin, CAM.pitchMax);
    cam.sinceDrag = 0;
    cam.swoop = null;
  }

  /** C: the camera straight behind the captain. */
  function recenter() {
    if (parked) {
      parked.h = parked.h0;
      parked.held = 0;
      return;
    }
    cam.yaw = cap.h;
    if (hold) hold.yaw = cam.yaw;
    cam.pitch = CAM.pitch;
    cam.sinceDrag = 99;
  }

  function cheer(who = 'captain', seconds = 1.4) {
    if (who === 'captain' || who === 'all') cap.cheerUntil = time + seconds;
    if (who === 'lineup' || who === 'all') for (const s of lineup) s.cheerUntil = time + seconds;
  }

  function sparkle(x, y, z) {
    if (!finite(x, y, z)) return;
    for (let i = 0; i < SPARKS; i++) {
      const p = sparks[i];
      const a = (i / SPARKS) * TAU + Math.random() * 0.4;
      const sp = 0.8 + Math.random() * 1.4;
      p.x = x + Math.cos(a) * 0.15;
      p.y = y + Math.random() * 0.3;
      p.z = z + Math.sin(a) * 0.15;
      p.vx = Math.cos(a) * sp;
      p.vz = Math.sin(a) * sp;
      p.vy = 2.2 + Math.random() * 1.8;
      p.max = 0.8 + Math.random() * 0.4;
      p.life = p.max;
    }
    sparkMesh.visible = true;
  }
  function updateSparks(dt) {
    if (!sparkMesh.visible) return;
    let alive = 0;
    for (let i = 0; i < SPARKS; i++) {
      const p = sparks[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= 6 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        alive++;
      }
      const k = p.life > 0 ? Math.min(1, (p.life / p.max) * 2) : 0;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(time * 5 + i, time * 3, 0);
      dummy.scale.setScalar(k);
      dummy.updateMatrix();
      sparkMesh.setMatrixAt(i, dummy.matrix);
    }
    sparkMesh.instanceMatrix.needsUpdate = true;
    if (!alive) sparkMesh.visible = false;
  }

  // ---------------------------------------------------------------------------------------------
  // Walking
  // ---------------------------------------------------------------------------------------------
  function readFolk() {
    const e = envNow();
    folkNow = [];
    if (!e || typeof e.folk !== 'function') return folkNow;
    try {
      const list = e.folk();
      if (Array.isArray(list)) folkNow = list.filter((f) => f && finite(f.x, f.z));
    } catch {
      folkNow = [];
    }
    return folkNow;
  }

  function stepWalk(dt) {
    let want = 0;
    let dir = cap.move;
    const mag = Math.hypot(input.x, input.z);
    if (mag <= 0.01) hold = null;
    if (mag > 0.01) {
      if (auto) cancelAuto();
      if (!hold || Math.abs(wrap(Math.atan2(input.x, input.z) - Math.atan2(hold.x, hold.z))) > HOLD_TURN) hold = { yaw: cam.yaw, x: input.x, z: input.z };
      const fx = Math.sin(hold.yaw);
      const fz = Math.cos(hold.yaw);
      // right = (-cos yaw, sin yaw), as for the ships
      const wx = -fz * input.x + fx * input.z;
      const wz = fx * input.x + fz * input.z;
      dir = Math.atan2(wx, wz);
      want = input.run ? SPEED.sprint : Math.min(1, mag) < 0.5 ? SPEED.walk : SPEED.jog;
    } else if (auto) {
      let tgt = auto.pts[auto.i];
      let d = Math.hypot(tgt.x - cap.x, tgt.z - cap.z);
      // (a corner is cut only when the way on from here is clear: at the narrow mouth of a rope bridge the
      // corner itself must be walked, or he'd press into the rope beside it)
      while (auto.i < auto.pts.length - 1 && (d < 0.06 || (d < 0.25 && walk.clear({ x: cap.x, z: cap.z }, auto.pts[auto.i + 1])))) {
        auto.i++;
        tgt = auto.pts[auto.i];
        d = Math.hypot(tgt.x - cap.x, tgt.z - cap.z);
      }
      const last = auto.i === auto.pts.length - 1;
      if (last && d < 0.12) {
        // there
        const p = auto.place;
        const open = auto.open;
        cancelAuto();
        if (p) {
          cap.move = p.face || 0;
          if (open) arrivedNow = p.id;
        }
      } else {
        dir = Math.atan2(tgt.x - cap.x, tgt.z - cap.z);
        want = last ? Math.min(SPEED.jog, 0.5 + d * 3.5) : SPEED.jog;
      }
    }
    // the way he walks swings round to the input quickly; from a standstill it is the input at once
    if (want > 0) cap.move = cap.speed < 0.3 ? dir : turnToward(cap.move, dir, STEER * dt);
    const rate = want > cap.speed ? ACCEL : DECEL;
    cap.speed += clamp(want - cap.speed, -rate * dt, rate * dt);
    if (cap.speed < 1e-3 && want === 0) cap.speed = 0;
    const vx = Math.sin(cap.move) * cap.speed;
    const vz = Math.cos(cap.move) * cap.speed;
    let moved = 0;
    if (cap.speed > 0) {
      const passing = auto ? auto.pass > 0 : cap.pass > 0;
      const dyn = passing ? [] : folkNow;
      const from = { x: cap.x, z: cap.z, y: cap.y };
      let res = walk.move(from, vx * dt, vz * dt, RADIUS, dyn);
      moved = Math.hypot(res.x - cap.x, res.z - cap.z);
      if (auto) {
        // stuck behind someone: squeeze past them; stuck on the walk itself: find the way again
        if (moved < cap.speed * dt * 0.3) auto.stuck += dt;
        else auto.stuck = Math.max(0, auto.stuck - dt);
        if (auto.pass > 0) auto.pass -= dt;
        if (auto.stuck > 0.4) {
          const free = walk.move(from, vx * dt, vz * dt, RADIUS, []);
          if (Math.hypot(free.x - cap.x, free.z - cap.z) > moved + 1e-4) {
            auto.pass = 1;
            res = free;
            moved = Math.hypot(res.x - cap.x, res.z - cap.z);
          } else if (auto.repaths < 2) {
            const a = auto;
            const ok = startAuto(a.end, a.place, a.open);
            if (ok) auto.repaths = a.repaths + 1;
            else cancelAuto();
          } else cancelAuto();
          if (auto) auto.stuck = 0;
        }
      } else if (cap.pass > 0) {
        cap.pass -= dt;
      } else {
        // walking by hand into someone (a porter on a narrow rope bridge waits for him, so neither would
        // ever move): after a moment he squeezes past them, as an auto-walk does; once he is by, they go on
        if (moved < cap.speed * dt * 0.3) cap.stuck += dt;
        else cap.stuck = Math.max(0, cap.stuck - dt);
        if (cap.stuck > 0.25) {
          const free = walk.move(from, vx * dt, vz * dt, RADIUS, []);
          if (Math.hypot(free.x - cap.x, free.z - cap.z) > moved + 1e-4) {
            cap.pass = 0.8;
            res = free;
            moved = Math.hypot(res.x - cap.x, res.z - cap.z);
          }
          cap.stuck = 0;
        }
      }
      cap.x = res.x;
      cap.z = res.z;
      if (Number.isFinite(res.y)) cap.y = res.y;
    }
    const real = dt > 0 ? moved / dt : 0;
    cap.act += (real - cap.act) * Math.min(1, dt * 14);
    if (cap.act < 0.02 && cap.speed === 0) cap.act = 0;
    if (cap.speed > 0.05 && moved > 1e-4) cap.h = turnToward(cap.h, Math.atan2(vx, vz), TURN * dt);
    else if (!auto && cap.speed === 0 && want === 0 && Math.abs(wrap(cap.move - cap.h)) > 0.01 && cap.act < 0.3) {
      cap.h = turnToward(cap.h, cap.move, TURN * dt); // arrived at a place: face the door
    }
    cap.yVis += (cap.y - cap.yVis) * Math.min(1, dt * 15);
  }

  // Where he stands, for the townsfolk walking their rounds (env.setCaptain: they wait for him rather than
  // walk through him); null while he isn't walking the town (the panels, the shipyard, gone).
  function tellEnv(on) {
    const e = envNow();
    if (!e || typeof e.setCaptain !== 'function') return;
    try {
      if (on) e.setCaptain(cap.x, cap.z);
      else e.setCaptain(null, null);
    } catch {
      // the townsfolk are decoration
    }
  }

  function stepGreet(dt) {
    if (bubble && time >= bubble.until) bubble = null;
    if (bubble || parked) return null;
    greetWait -= dt;
    if (greetWait > 0) return null;
    greetWait = 0.25;
    let best = null;
    for (const f of folkNow) {
      if (!f.greets) continue;
      const d = Math.hypot(f.x - cap.x, f.z - cap.z);
      if (d >= GREET.dist || (best && d >= best.d)) continue;
      const last = greeted.get(f.index);
      if (last !== undefined && time - last < GREET.every) continue;
      best = { f, d };
    }
    if (!best) return null;
    const e = envNow();
    let ok = false;
    try {
      ok = !!(e && e.greet && e.greet(best.f.index, GREET.seconds, { x: cap.x, z: cap.z }));
    } catch {
      ok = false;
    }
    if (!ok) return null;
    greeted.set(best.f.index, time);
    bubble = { index: best.f.index, until: time + GREET.bubble };
    return bubbleAt();
  }
  function bubbleAt() {
    if (!bubble) return null;
    const f = folkNow.find((q) => q.index === bubble.index);
    if (!f) return null;
    const y = walk.heightAt(f.x, f.z, cap.y) ?? cap.y;
    const out = { index: bubble.index, x: f.x, y: y + 1.55, z: f.z };
    // (who it is, for the words: the Kraken Seas' villagers and Bess and the professor say so, SPEC3 §8.4)
    if (f.villager) {
      out.villager = true;
      out.home = f.home;
    }
    if (f.npc) out.npc = f.npc;
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // The walk camera
  // ---------------------------------------------------------------------------------------------
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  function updateCamera(dt, snap = false) {
    const portrait = (globalThis.innerHeight || 1) > (globalThis.innerWidth || 1);
    const dist = portrait ? CAM.distPortrait : CAM.dist;
    // The lens is setLens()'s (main.js), narrower in portrait: its lens there is wide (up to 90°, so a
    // broadside stays in view in battle), which would leave the walking captain tiny on a phone.
    if (portrait && camera.isPerspectiveCamera && camera.fov > CAM.fovPortrait) {
      camera.fov = CAM.fovPortrait;
      camera.updateProjectionMatrix();
    }
    cam.ty = snap ? cap.yVis : cam.ty + (cap.yVis - cam.ty) * Math.min(1, dt * 6);
    const tx = cap.x;
    const ty = cam.ty + CAM.lift;
    const tz = cap.z;
    cam.sinceDrag += dt;
    // Swing round behind him while he walks away from the camera (never while he walks toward it),
    // easing in after half a second of walking, so a short step to the side stays a step to the side.
    cam.walking = cap.act > 0.5 ? (cam.walking || 0) + dt : 0;
    if (!snap && !rm() && cam.sinceDrag > CAM.followDelay && cam.walking > 0.5 && !cam.swoop) {
      const away = Math.sin(cap.h) * Math.sin(cam.yaw) + Math.cos(cap.h) * Math.cos(cam.yaw);
      const ramp = Math.min(1, (cam.walking - 0.5) / 0.6);
      if (away > -0.3) cam.yaw = turnToward(cam.yaw, cap.h, CAM.followRate * ramp * dt);
    }
    // Camera collision: the boom stops short of buildings, the tower, the crane and the docked ship.
    // Cramped (behind him a wall or the ship), it cranes up instead, to look down over his shoulders.
    const clearAt = (pitch) => {
      const cp = Math.cos(pitch);
      const ox = -Math.sin(cam.yaw) * cp;
      const oy = Math.sin(pitch);
      const oz = -Math.cos(cam.yaw) * cp;
      const N = 26;
      for (let i = 1; i <= N; i++) {
        const d = (dist * i) / N;
        if (camBlocked(tx + ox * d, ty + oy * d, tz + oz * d)) return (i - 1) / N;
      }
      return 1;
    };
    // the nearest yaw (either way, in `step`s) whose boom is clear for at least `need`, or null
    const clearSide = (step, n, need) => {
      const save = cam.yaw;
      let best = null;
      for (let k = 1; k <= n && best === null; k++) {
        for (const sgn of [1, -1]) {
          cam.yaw = save + sgn * k * step;
          if (clearAt(cam.pitch) * dist >= need) {
            best = cam.yaw;
            break;
          }
        }
      }
      cam.yaw = save;
      return best;
    };
    let hit = clearAt(cam.pitch);
    let pitch = cam.pitch;
    // A cut (stepping ashore, a teleport): with something close behind him (at the gangplank, the
    // docked ship), start from the nearest side with a clear view instead of craning down on his hat.
    if (snap && hit < 0.75) {
      const best = clearSide(0.2, 9, dist * 0.9);
      if (best !== null) {
        cam.yaw = wrap(best);
        hit = clearAt(cam.pitch);
      }
    }
    if (hit < 0.85) {
      for (let k = 1; k <= 3; k++) {
        const p = cam.pitch + ((CAM.pitchMax - cam.pitch) * k) / 3;
        const h = clearAt(p);
        if (h * Math.cos(p) > hit * Math.cos(pitch) + 0.02 || h >= 0.85) {
          hit = h;
          pitch = p;
        }
        if (h >= 0.85) break;
      }
    }
    // Still cramped (his back to a wall or a door): swing round to the nearest clear side (quickly
    // when even the shortest boom would leave the lens inside something).
    if (hit * dist < CAM.minBoom + 0.2 && (snap || cam.sinceDrag > 0.6)) {
      const best = clearSide(0.35, 9, Math.min(dist * 0.8, CAM.minBoom + 2.4));
      if (best !== null) {
        const inside = hit * dist < CAM.minBoom - 0.25;
        cam.yaw = snap ? wrap(best) : turnToward(cam.yaw, best, (inside ? 5 : 2.2) * dt);
        if (snap) {
          hit = clearAt(cam.pitch);
          pitch = cam.pitch;
        }
      }
    }
    cam.pitchEff = snap || !Number.isFinite(cam.pitchEff) ? pitch : cam.pitchEff + clamp(pitch - cam.pitchEff, -1.5 * dt, 1.5 * dt);
    const cp = Math.cos(cam.pitchEff);
    const ox = -Math.sin(cam.yaw) * cp;
    const oy = Math.sin(cam.pitchEff);
    const oz = -Math.cos(cam.yaw) * cp;
    if (Math.abs(cam.pitchEff - pitch) > 1e-3) hit = clearAt(cam.pitchEff);
    // The boom stops short of what is behind him, but no shorter than minBoom, unless the lens would
    // then sit inside something: then it comes in over his shoulder, as close as `closest`.
    let want = Math.max(CAM.minBoom / dist, hit);
    if (hit * dist < CAM.minBoom) {
      const Lm = CAM.minBoom;
      if (camBlocked(tx + ox * Lm, Math.max(ty + oy * Lm, cap.yVis + CAM.clearance), tz + oz * Lm)) want = Math.max(CAM.closest, hit * dist) / dist;
    }
    if (snap) cam.boom = want;
    else if (want < cam.boom) cam.boom += (want - cam.boom) * Math.min(1, dt * 14);
    else cam.boom += (want - cam.boom) * Math.min(1, dt * 2);
    const L = dist * cam.boom;
    camPos.set(tx + ox * L, Math.max(ty + oy * L, cap.yVis + CAM.clearance), tz + oz * L);
    camLook.set(tx, ty, tz);
    if (cam.swoop) {
      const s = cam.swoop;
      s.t += dt;
      const u = smooth(clamp(s.t / CAM.swoop, 0, 1));
      const arc = Math.sin(Math.PI * u) * 2.5; // a little hop up over the rigging
      camPos.set(s.pos.x + (camPos.x - s.pos.x) * u, s.pos.y + (camPos.y - s.pos.y) * u + arc, s.pos.z + (camPos.z - s.pos.z) * u);
      camLook.set(s.target.x + (tx - s.target.x) * u, s.target.y + (ty - s.target.y) * u, s.target.z + (tz - s.target.z) * u);
      if (u >= 1) cam.swoop = null;
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.updateMatrixWorld();
  }

  // ---------------------------------------------------------------------------------------------
  // Panel views: the captain on the podium (or the tavern porch), the crew line-up, the framing
  // ---------------------------------------------------------------------------------------------
  const tailor = placeById('tailor');
  const lineupSpots = tailor && Array.isArray(tailor.lineup) ? tailor.lineup.filter((q) => q && finite(q.x, q.z)) : [];
  const lineup = []; // { mesh, opts, spot, from, t, delay, cheerUntil }
  function doorPoint() {
    // the shop door: just behind the first line-up spot (they stand in a row to its right)
    const q = lineupSpots[0];
    if (!q) return null;
    const h = Number.isFinite(q.h) ? q.h : 0;
    return { x: q.x - Math.sin(h) * 0.75, y: Number.isFinite(q.y) ? q.y : 1.3, z: q.z - Math.cos(h) * 0.75 };
  }

  /** Build the line-up (3 sailors' buildPerson opts), or clear it (null). Rebuilt sailors keep their spot. */
  function setLineup(optsList) {
    if (!Array.isArray(optsList)) {
      for (const s of lineup) disposePerson(s.mesh);
      lineup.length = 0;
      return [];
    }
    const door = doorPoint();
    optsList.slice(0, lineupSpots.length).forEach((opts, i) => {
      const spot = lineupSpots[i];
      const old = lineup[i];
      const mesh = buildPerson({ ...opts });
      mesh.name = `town-lineup-${i}`;
      scene.add(mesh);
      if (old) {
        disposePerson(old.mesh);
        old.mesh = mesh;
        old.opts = opts;
        return;
      }
      const from = door && !rm() ? door : spot;
      lineup[i] = { mesh, opts, spot, from, t: 0, delay: i * 0.35, cheerUntil: -Infinity };
    });
    placeLineup(0);
    return lineup.map((s) => s.mesh);
  }
  function placeLineup(dt) {
    for (const s of lineup) {
      const { spot, from, mesh } = s;
      const L = Math.hypot(spot.x - from.x, spot.z - from.z);
      const ws = walkSpeed(mesh, 'walk', LINEUP_TEMPO) || 1;
      const dur = L / ws;
      s.t += dt;
      const u = dur > 0 ? clamp((s.t - s.delay) / dur, 0, 1) : 1;
      mesh.position.set(from.x + (spot.x - from.x) * u, Number.isFinite(spot.y) ? spot.y : 1.3, from.z + (spot.z - from.z) * u);
      mesh.visible = s.t >= s.delay || u > 0;
      if (u < 1 && dur > 0) {
        mesh.rotation.y = Math.atan2(spot.x - from.x, spot.z - from.z);
        animatePerson(mesh, s.t - s.delay, 'walk', { speed: LINEUP_TEMPO });
      } else {
        mesh.rotation.y = turnToward(mesh.rotation.y, Number.isFinite(spot.h) ? spot.h : 0, 6 * dt);
        animatePerson(mesh, time, time < s.cheerUntil ? 'cheer' : 'idle');
      }
    }
  }

  /** Stand the captain for a panel view: 'tailor' (the podium), 'tavern' (the porch), or null to walk on. */
  function park(id) {
    if (!id) {
      parked = null;
      panel = null;
      return true;
    }
    const p = placeById(id);
    if (!p) return false;
    cancelAuto();
    input.x = 0;
    input.z = 0;
    cap.speed = 0;
    cap.act = 0;
    bubble = null;
    let x = p.x;
    let y = walk.heightAt(p.x, p.z) ?? cap.y;
    let z = p.z;
    if (p.podium && finite(p.podium.x, p.podium.z)) {
      x = p.podium.x;
      y = Number.isFinite(p.podium.y) ? p.podium.y : y;
      z = p.podium.z;
    }
    // facing the panel's camera, a little turned (three-quarter view)
    const c = p.cam && Array.isArray(p.cam.pos) ? p.cam.pos : null;
    const h0 = c ? Math.atan2(c[0] - x, c[2] - z) + (p.podium ? 0 : 0.35) : (p.face || 0) + Math.PI;
    parked = { id, x, y, z, h0, h: h0, held: 0, sway: 0 };
    cap.x = p.x;
    cap.z = p.z;
    cap.y = walk.heightAt(p.x, p.z, cap.y) ?? cap.y;
    cap.yVis = cap.y;
    cap.h = wrap((p.face || 0) + Math.PI);
    cap.move = cap.h;
    placeMesh();
    return true;
  }

  function subjectBox(view, subject) {
    // 8 corners of a box round what the panel camera shows
    const box = new THREE.Box3();
    const add = (x, y, z, r, hgt) => {
      box.expandByPoint(new THREE.Vector3(x - r, y, z - r));
      box.expandByPoint(new THREE.Vector3(x + r, y + hgt, z + r));
    };
    const p = placeOf(view);
    if (!p) return null;
    if (view === 'tailor' && subject === 'lineup' && lineupSpots.length) {
      for (const q of lineupSpots) add(q.x, Number.isFinite(q.y) ? q.y : 1.3, q.z, 0.4, 1.9);
    } else if (parked) {
      add(parked.x, parked.y, parked.z, 0.5, 2.25);
      if ((view === 'tavern' || FIT_VIEWS.includes(view)) && p.cam && Array.isArray(p.cam.target)) {
        // and what the place's camera looks at beside him: the tavern's door, the Riddle Bell with Professor
        // Barnacle, Builder Bess at her island plan
        const t = p.cam.target;
        add(t[0], 1.3, t[2], 0.9, 2.4);
      }
    } else add(p.x, walk.heightAt(p.x, p.z) ?? 1.3, p.z, 0.5, 2.2);
    const out = [];
    for (let i = 0; i < 8; i++) out.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
    return out;
  }

  const isPoint = (v) => (Array.isArray(v) ? v.length >= 3 && finite(v[0], v[1], v[2]) : !!v && finite(v.x, v.y, v.z));
  function panelPose(view, subject) {
    if (subject && typeof subject === 'object') {
      // a pose of its own (a plot on the island): the camera there, framing its points beside the panel
      if (!isPoint(subject.pos) || !isPoint(subject.target)) return null;
      const pts = Array.isArray(subject.points) ? subject.points.filter(isPoint).map(vec) : [];
      return { pos: vec(subject.pos), target: vec(subject.target), points: pts.length ? pts : [vec(subject.target)], fit: subject.fit !== false };
    }
    const p = placeOf(view);
    if (!p || !p.cam) return null;
    const pos = vec(p.cam.pos);
    const target = vec(p.cam.target);
    if (view === 'tailor' && subject === 'lineup' && lineupSpots.length) {
      // in front of the row, a little to one side: the three uniforms side by side
      const c = lineupSpots.reduce((a, q) => a.add(new THREE.Vector3(q.x, Number.isFinite(q.y) ? q.y : 1.3, q.z)), new THREE.Vector3()).multiplyScalar(1 / lineupSpots.length);
      const h = (Number.isFinite(lineupSpots[0].h) ? lineupSpots[0].h : 0) + 0.3;
      pos.set(c.x + Math.sin(h) * 4.6, c.y + 2.2, c.z + Math.cos(h) * 4.6);
      target.set(c.x, c.y + 0.95, c.z);
    }
    return { pos, target, points: subjectBox(view, subject), fit: FIT_VIEWS.includes(view) };
  }

  /**
   * The panel view's camera: frame `subject` ('captain' | 'lineup' | a pose { pos, target, points }) beside
   * panelEl. Within the same view it pans there (opts.secs, default PANEL_PAN; a cut under reduced motion).
   */
  function setPanel(view, panelEl, subject = 'captain', opts = {}) {
    const to = panelPose(view, subject);
    if (!to) {
      panel = null;
      return false;
    }
    const cut = !panel || panel.view !== view || rm() || !!(opts && opts.cut);
    const dur = opts && Number.isFinite(opts.secs) && opts.secs > 0 ? opts.secs : PANEL_PAN;
    const from = cut ? to : currentPanelPose();
    // a glide to a pose of its own (across the island to a plot) arcs up over the roofs and palms on its way
    const arc = !cut && subject && typeof subject === 'object' ? clamp(from.pos.distanceTo(to.pos) * 0.35, 0, 9) : 0;
    panel = { view, el: panelEl || null, subject, from, to, dur, arc, t: cut ? dur : 0 };
    return true;
  }
  function currentPanelPose() {
    if (!panel) return null;
    const u = smooth(clamp(panel.t / (panel.dur || PANEL_PAN), 0, 1));
    const lerp = (a, b) => a.clone().lerp(b, u);
    const pos = lerp(panel.from.pos, panel.to.pos);
    if (panel.arc) pos.y += Math.sin(Math.PI * u) * panel.arc;
    return {
      pos,
      target: lerp(panel.from.target, panel.to.target),
      points: panel.to.points.map((q, i) => lerp(panel.from.points[i] || q, q)),
    };
  }
  const fitBack = new THREE.Vector3();
  function updatePanelCamera(dt) {
    if (!panel) return;
    panel.t += dt;
    const P = currentPanelPose();
    camera.position.copy(P.pos);
    camera.lookAt(P.target);
    camera.updateMatrixWorld();
    if (!panel.el) return;
    let fr = frameBeside(panel.el, P.points);
    // The new places' views (and a plot) keep their whole subject in the free area: where even the widest lens
    // can't fit it beside the panel (a plot above a phone's bottom sheet), the camera backs off along its view.
    if (panel.to.fit) {
      for (let k = 0; k < 4 && fr.need > fr.max * 1.002 && fr.depth > 0; k++) {
        fitBack.setFromMatrixColumn(camera.matrixWorld, 2); // (the camera's back)
        camera.position.addScaledVector(fitBack, fr.depth * (fr.need / fr.max - 1) + 0.05);
        camera.updateMatrixWorld();
        fr = frameBeside(panel.el, P.points);
      }
    }
  }

  const fR = new THREE.Vector3();
  const fU = new THREE.Vector3();
  const fF = new THREE.Vector3();
  const fD = new THREE.Vector3();
  /**
   * Frame `points` (world, [x, y, z] or Vector3) in the free area beside (or above) panelEl, like the
   * shipyard's dockFraming(): the camera's full frame is that free area, shifted with setViewOffset.
   * The camera must already be placed and turned.
   */
  function frameBeside(panelEl, points) {
    const W = globalThis.innerWidth || 1;
    const H = globalThis.innerHeight || 1;
    let fx = 0;
    let fy = 0;
    let fw = W;
    let fh = H;
    const r = panelEl ? { left: panelEl.offsetLeft, top: panelEl.offsetTop, width: panelEl.offsetWidth, height: panelEl.offsetHeight } : { width: 0, height: 0 };
    const sheet = globalThis.matchMedia?.('(orientation: portrait)').matches ?? r.width > W * 0.7;
    if (r.width && r.height) {
      if (sheet) fh = clamp(r.top, H * 0.25, H);
      else if (r.left > W * 0.3) fw = clamp(r.left, W * 0.3, W);
      else {
        fx = r.left + r.width;
        fw = W - fx;
      }
    }
    camera.updateMatrixWorld();
    fR.setFromMatrixColumn(camera.matrixWorld, 0);
    fU.setFromMatrixColumn(camera.matrixWorld, 1);
    fF.setFromMatrixColumn(camera.matrixWorld, 2).negate();
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    let zSum = 0;
    let zN = 0;
    for (const q of points || []) {
      const p = Array.isArray(q) ? fD.set(q[0], q[1], q[2]) : fD.copy(q);
      p.sub(camera.position);
      const z = p.dot(fF);
      if (z < 0.3) continue;
      zSum += z;
      zN++;
      const x = p.dot(fR) / z;
      const y = p.dot(fU) / z;
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
    }
    const aspect = fw / fh;
    let tanV = Math.tan((40 * Math.PI) / 360);
    let need = 0;
    const max = Math.tan((75 * Math.PI) / 360);
    let cx = 0;
    let cy = 0;
    if (xMax > xMin && yMax > yMin) {
      const k = clamp((Math.min(fw, fh * 1.4) - 340) / 460, 0, 1);
      const fillX = 0.86 - 0.12 * k;
      const fillY = 0.84 - 0.1 * k;
      tanV = Math.max((yMax - yMin) / 2 / fillY, (xMax - xMin) / 2 / (aspect * fillX));
      need = tanV;
      tanV = clamp(tanV, Math.tan((14 * Math.PI) / 360), max);
      cx = (xMax + xMin) / 2;
      cy = (yMax + yMin) / 2;
    }
    camera.fov = (Math.atan(tanV) * 360) / Math.PI;
    const offX = (cx / (tanV * aspect)) * (fw / 2) - fx;
    const offY = -(cy / tanV) * (fh / 2) - fy;
    camera.setViewOffset(fw, fh, offX, offY, W, H);
    // (need: the lens the points ask for, before the widest is taken; depth: how far off they are on average)
    return { fx, fy, fw, fh, sheet, need, max, depth: zN ? zSum / zN : 0 };
  }

  function pose(view) {
    if (view === 'town') return { pos: camPos.toArray(), target: camLook.toArray() };
    const p = placeOf(view);
    if (!p || !p.cam) return null;
    return { pos: [...p.cam.pos], target: [...p.cam.target] };
  }

  // ---------------------------------------------------------------------------------------------
  // The frame
  // ---------------------------------------------------------------------------------------------
  const result = { place: null, arrived: null, moving: false, greet: null, bubble: null };
  function update(dt, t) {
    dt = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0;
    time = Number.isFinite(t) ? t : time + dt;
    result.arrived = null;
    result.greet = null;
    result.bubble = null;
    readFolk();
    if (parked) {
      if (parked.held > 0) parked.held -= dt;
      else if (!rm()) {
        // turning slowly this way and that to show the outfit off
        parked.sway += dt * SWAY.rate;
        const goal = parked.h0 + Math.sin(parked.sway) * SWAY.amp;
        parked.h = turnToward(parked.h, goal, 1.2 * dt);
      }
      animateCaptain(dt, time);
      placeLineup(dt);
      updatePanelCamera(dt);
      tellEnv(false);
      result.place = parked.id;
      result.moving = false;
    } else if (active) {
      stepWalk(dt);
      tellEnv(true);
      animateCaptain(dt, time);
      result.greet = stepGreet(dt);
      result.bubble = bubbleAt();
      const np = walk.nearestPlace(cap.x, cap.z);
      result.place = np ? np.place.id : null;
      result.moving = cap.act > 0.25 || !!auto;
      updateCamera(dt);
      if (ringGroup.visible) {
        const s = rm() ? 1 : 1 + 0.12 * Math.sin(time * 6);
        ringGroup.scale.set(s, 1, s);
      }
    } else {
      animateCaptain(dt, time);
      tellEnv(false);
    }
    if (arrivedNow) {
      result.arrived = arrivedNow;
      arrivedNow = null;
    }
    updateSparks(dt);
    return result;
  }

  /** Fixed-step walking for tests (no rendering, no footsteps): input is { x, z, run } or a function of time. */
  function simulate(seconds, inp = null) {
    const n = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * 60));
    const dt = 1 / 60;
    let arrived = null;
    let greet = false; // someone started a greeting meanwhile (townMode puts words in the bubble)
    let greetBy = null; // ...and who: { index, villager?, home?, npc? }
    cam.swoop = null;
    quiet = true;
    try {
      for (let k = 0; k < n; k++) {
        const m = typeof inp === 'function' ? inp(k * dt) : inp;
        if (m) setMove(m);
        const r = update(dt, time + dt);
        if (r.arrived) arrived = r.arrived;
        if (r.greet) {
          greet = true;
          greetBy = r.greet;
        }
      }
    } finally {
      quiet = false;
    }
    const np = walk.nearestPlace(cap.x, cap.z);
    return { x: cap.x, y: cap.y, z: cap.z, h: cap.h, place: np ? np.place.id : null, arrived, moving: !!auto || cap.act > 0.25, greet, greetBy };
  }

  function dispose() {
    exit();
    setLineup(null);
    if (cap.mesh) disposePerson(cap.mesh);
    cap.mesh = null;
    for (const m of [ringGold, ringInk]) {
      m.geometry.dispose();
      m.material.dispose();
    }
    scene.remove(ringGroup);
    scene.remove(sparkMesh);
    sparkMesh.geometry.dispose();
    sparkMesh.material.dispose();
    sparkMesh.dispose();
    if (debugLines) {
      scene.remove(debugLines);
      debugLines.geometry.dispose();
      debugLines.material.dispose();
    }
    debugLines = false;
  }

  return {
    setCaptain,
    enter,
    exit,
    setMove,
    walkTo,
    goTo,
    cancelAuto,
    pick,
    drag,
    recenter,
    update,
    pose,
    frameBeside,
    park,
    setPanel,
    setLineup,
    cheer,
    sparkle,
    simulate,
    dispose,
    get captain() {
      return { x: cap.x, y: parked ? parked.y : cap.y, z: cap.z, h: parked ? parked.h : cap.h, mesh: cap.mesh };
    },
    get walk() {
      return walk;
    },
    get lineup() {
      return lineup.map((s) => s.mesh);
    },
    get auto() {
      return auto ? { to: { ...auto.end }, place: auto.place ? auto.place.id : null, open: auto.open } : null;
    },
    get active() {
      return active;
    },
    get parked() {
      return parked ? parked.id : null;
    },
    // a panel view's camera still on its way (a pan or a glide to a plot)
    get panning() {
      return !!panel && panel.t < (panel.dur || PANEL_PAN);
    },
    get speed() {
      return cap.act;
    },
    get camera() {
      return { yaw: cam.yaw, pitch: cam.pitch, boom: cam.boom, swoop: !!cam.swoop };
    },
    get places() {
      return places;
    },
    seeds: LINEUP_SEEDS,
  };
}
