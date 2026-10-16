import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildPerson, animatePerson, disposePerson, handPosition, FIGHT } from './people.js';
import { BOARD, RAIDERS, resolveBoarding, previewLabel, captureGold, crewNow } from './combat.js';
import { gradientMap, setOutline } from './style.js';

// Boarding set-pieces (SPEC2 §3.4–3.6):
//   attack    hook → reel → swing → brawl → result      (you grapple a fighting ship)
//   surrender hook → reel → result                       (you take a ship that struck her colours)
//   defend    threat → reel → swing → brawl → result     (raiders board you; cut the ropes in 'threat')
//   counter   swing → brawl → result                     (a beaten-off raider, inside the counter window)
//
// Simulation (phases, the reel, the glued pair, heave / cut / pip timers) runs only in step(dt), in
// SIMULATED time, and writes the two ships' x / z / h / speed. render(t, dt) only draws: the grapnels and
// their lines, the boarding party (your captain leading from the quarterdeck, up to 4 sailors) swinging
// across on ropes from the main yard, the brawl (cutlass duels, clang stars, dust), losers tumbling
// overboard (through ctx.overboard when given), the prize gold, and the camera pose (camera()). While the
// boarding view is on, the sails of the ship nearest the camera turn see-through (both decks and the swing
// stay in sight) and her floating tag hides (ship.tagHidden, read by tags.js; the strip shows her crew).
// Every boarding figure is a child of the SCENE (never of a ship mesh: disposeShip would dispose shared
// geometry), built with share: true and placed from the ships' transforms every frame.
//
// createBoarding(ctx) → {
//   prepare({ captain, crew: [opts ×4], raiders: [opts ×4] | null }),   // prebuild hidden, one per render()
//   start({ kind, enemy, side, reel, getSides }) → boolean,
//       // getSides() → { att, def, attIsPlayer } fresh snapshots ({ crew, crew0, blade | grit, hpFrac }),
//       // called at the start of 'swing' ('result' for a surrender)
//   step(dt),                  // SIMULATED time: call it after the AI, before moveShip / separateShips
//   render(t, dt),             // visuals only: call it after every ship is synced, before the camera
//   camera(aspect?, from?) → { pos, look, blend } | null,
//       // from = { pos, look } (the chase camera this frame): boarding eases along an orbit itself and
//       // returns blend 1; without it main lerps with `blend`
//   heave() → number,          // a heave press (G / Board) in your attack's 'reel': returns the new heave bonus
//   cut(how = 'tap') → boolean,// during 'threat': a tap (RAIDERS.cutTaps of them cut) or 'hit' (a ball)
//   cutHold(down), skip() → boolean, cancel(reason) → boolean,
//   clear(),                   // silent stop (no callbacks): level teardown
//   release(),                 // clear() + free every prebuilt person (leaving the battle)
//   dispose(),
//   onResolve(fn), onResult(fn), onPip(fn), onCut(fn), onEnd(fn), onPhase(fn),   // each returns an unsubscribe
//   odds(sides, { kind, heave, surrendered }) → resolveBoarding result + { label } (the exact call start() makes)
//   moves(ship) → boolean,     // boarding writes this ship's x / z / h this step: skip its own integration
//   suspends(ship) → boolean,  // the target's AI is off (reel..result)
//   apart(ship) → boolean,     // separateShips leaves (player, ship) alone (glued, or being shoved off)
//   crewShown(ship) → number | null,   // the pips' count during the brawl (her tag, your crew chip)
//   resolveNow(),              // tests: run the timeline to 'result' at once
//   get active, phase, kind, target, side, truce, locked, heaveBonus, heaves, last, counterUntil,
//       counterTarget, counterLeft, phaseTime, phaseDur, cutProgress, turnScale, speedCap, figures, built, pending
// }
// (SPEC2 §9.1 also names a getter `heave`, which cannot share its name with the heave() method: the bonus
// is read as `heaveBonus`, as in the Stage 0 stub; __game.boarding keeps `heave` and `heavePress()`.)
//
// ctx: { scene, player: () => player, sfx(name, x, z, extra?), particles: { puff, foam, spawnParticle },
//        reducedMotion(), hideHelm(on), enemyCrewOpts(typeName, seed), pops,
//        overboard?  (the createOverboard() instance, or () => it: losers tumble through its pool),
//        time?       (() => state.time: the clock counterUntil is measured in; default: boarding's own),
//        cameraTune? (harness only: { land, port } numbers that override CAM) }
// Ships are main's ship objects: x, z, h, speed, hp, maxHp, sinking, type { len, wid, gold, reload, boarder },
// typeName, mesh (userData deckY / railY / deckSpots / yardTips / hullSide / helm / blockers from ships.js),
// reload { port, star }, and the Stage 2 fields captured / surrendered / escaped / boardCooldown.

const PI = Math.PI;
const TAU = PI * 2;
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => {
  x = clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
};
const ease = (x) => 0.5 - 0.5 * Math.cos(PI * clamp(x, 0, 1));
const wrap = (a) => a - TAU * Math.floor((a + PI) / TAU);
const frac = (x) => x - Math.floor(x);
const fwdX = (h) => Math.sin(h);
const fwdZ = (h) => Math.cos(h);
const rightX = (h) => -Math.cos(h);
const rightZ = (h) => Math.sin(h);

// Timings and looks that are not game rules (the rules live in combat.js BOARD / RAIDERS).
const SET = Object.freeze({
  capHook: 4, // speed cap of both ships during hook / reel (u/s)
  capThreat: 3, // both ships slow to this while raiders' hooks bite (u/s)
  turnReel: 0.5, // turn rate while the lines haul her in
  hookFly: 0.34, // seconds a thrown grapnel is in the air
  hookStagger: 0.05,
  swing: 0.56, // seconds from rail to deck on a rope
  stagger: 0.08, // between swingers (the captain first)
  home: 0.5, // swinging back
  release: 0.5, // a let-go rope swings back to the yard for this long
  hop: 0.34, // the captain jumping down from the quarterdeck to defend
  outro: 0.6, // visuals after the set-piece ends (= the camera easing back)
  camIn: 0.5,
  camOut: 0.6,
  pipFrom: 0.25, // brawl: first sailor down after this
  pipSpan: 1.5, // ... and the last one by pipFrom + pipSpan
  knock: 0.2, // a loser staggers to the rail before going over
  clashGap: 0.1, // seconds between clash sounds (all pairs together)
  heaveTug: 0.3,
  ropeR: 0.045,
  swingRopeR: 0.06,
  ourFalls: 2, // at most this many of our sailors are seen going over in one brawl
  breakFar: 12, // a raider's lines left on in the counter window are cast off beyond this distance
  glueBlock: 0.25, // the glued pair stops this long when land (or a third ship) shoves it
  popIn: 0.22, // a defender coming up on deck
  coins: 30,
});

// The boarding camera (§3.4 "Boarding camera", tuned with in-game screenshots): a raised three-quarter view
// from beyond the deck the brawl is on, a little astern, so the square sails are seen nearly edge-on and the
// fight is in front of all the rigging. dist grows with the gap while she is still being hauled in; yaw: 0 =
// straight across, + astern. The brawl ship's sails fade while the view is on (SAIL_FADE): from beyond her
// deck they would hide your ship and the swing (a cutter's big lugsail covers both decks).
const CAM = Object.freeze({
  land: { dist: 14, el: 1.0, yaw: 0.2, lookUp: 1.2, toBrawl: 0.45, sepGain: 0.55, sizeGain: 0.45 },
  port: { dist: 15, el: 1.1, yaw: 0.35, lookUp: 2.8, toBrawl: 0.25, sepGain: 0.7, sizeGain: 0.55 },
  kick: 0.06, // capture: the view punches in by this fraction and settles
});
const SAIL_FADE = 0.22; // the brawl ship's sails at full boarding view (opacity; the ink lines fade with them)

const DECK = { player: 1.2, cutter: 1.2, privateer: 1.2, prahu: 1.15, junk: 1.4, corsair: 1.2, manowar: 1.8, inferno: 1.8, galleon: 1.4, raider: 1.0, phantom: 1.8 };
const KINDS = ['attack', 'defend', 'surrender', 'counter'];
const ROPE_COLOR = new THREE.Color(0xc9a26a);
const HOOK_COLOR = new THREE.Color(0x5d6274);
const STAR_COLORS = [0xfff6a8, 0xffffff, 0xffd23f];
const DUST = 0xdcc9a3;
const SPLINTER = 0x8a6a48;
const GOLD = 0xffcf3a;

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);
const _e = new THREE.Euler();
const _nm = new THREE.Matrix3();

function ud(ship) {
  return (ship && ship.mesh && ship.mesh.userData) || {};
}
function lenOf(ship) {
  return num(ship && ship.type && ship.type.len, 8);
}
function widOf(ship) {
  return num(ship && ship.type && ship.type.wid, 3);
}
function deckOf(ship) {
  return num(ud(ship).deckY, DECK[ship && ship.typeName] ?? 1.2);
}
function railOf(ship) {
  return num(ud(ship).railY, deckOf(ship) + 0.55);
}
// Half the hull's width at `z` (ship-local), from userData.hullSide when there is one.
function halfAt(ship, z) {
  const hs = ud(ship).hullSide;
  if (hs && Array.isArray(hs.half) && hs.half.length && num(hs.dz, 0) > 0) {
    const f = clamp((z - num(hs.z0, 0)) / hs.dz, 0, hs.half.length - 1);
    const i = Math.floor(f);
    const a = num(hs.half[i], 0);
    const b = num(hs.half[Math.min(i + 1, hs.half.length - 1)], a);
    return a + (b - a) * (f - i);
  }
  return widOf(ship) * 0.5;
}
// The ship's current transform (position, heading, list and pitch), read without touching the ship.
function shipMatrix(ship, out) {
  const mesh = ship && ship.mesh;
  if (!mesh) return out.makeTranslation(num(ship && ship.x, 0), 0, num(ship && ship.z, 0));
  out.compose(mesh.position, mesh.quaternion, mesh.scale);
  if (mesh.parent && mesh.parent.isObject3D && !mesh.parent.isScene) out.premultiply(mesh.parent.matrixWorld);
  return out;
}
// Local x sign (+1 = port, §0.1) of the side of `ship` that faces the world point (x, z).
function sideToward(ship, x, z) {
  return (x - ship.x) * Math.cos(ship.h) - (z - ship.z) * Math.sin(ship.h) >= 0 ? 1 : -1;
}
function alive(s) {
  return !!s && num(s.hp, 0) > 0 && !(num(s.sinking, 0) > 0);
}
function stillFighting(e) {
  return alive(e) && !e.captured && !e.surrendered && !e.escaped;
}
// The main-course yard's two ends (ship-local): `near` (+1 port / −1 starboard) first.
function yardEnds(ship, near) {
  const y = ud(ship).yardTips;
  const ok = (t) => t && Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.z);
  const a = y && (near > 0 ? y.port : y.star);
  const b = y && (near > 0 ? y.star : y.port);
  const fa = ok(a) ? a : { x: near * (halfAt(ship, 0) + 0.3), y: railOf(ship) + 3.8, z: 0 };
  const fb = ok(b) ? b : { x: -fa.x, y: fa.y, z: fa.z };
  return [fa, fb];
}

// Deck rows (ship-local z) where a pair can fight: the deckSpots on the main deck, then fillers.
function deckRows(ship, want) {
  const dy = deckOf(ship);
  const L = lenOf(ship);
  const lim = L * 0.3;
  const zs = [];
  const spots = Array.isArray(ud(ship).deckSpots) ? ud(ship).deckSpots : [];
  for (const s of spots) {
    if (!s || !Number.isFinite(s.z)) continue;
    if (Number.isFinite(s.y) && Math.abs(s.y - dy) > 0.15) continue;
    if (Math.abs(s.z) > lim + 0.5) continue;
    if (zs.some((z) => Math.abs(z - s.z) < 0.85)) continue;
    zs.push(s.z);
  }
  const fill = [0, 0.95, -0.95, 1.9, -1.9, 2.85, -2.85];
  for (const z of fill) {
    if (zs.length >= want) break;
    if (Math.abs(z) > lim) continue;
    if (zs.some((q) => Math.abs(q - z) < 0.85)) continue;
    zs.push(z);
  }
  if (!zs.length) zs.push(0);
  // the middle row first (the captain's duel), then outward; rows hard by the main mast (its sail hides
  // them from the boarding camera) go last
  const y = ud(ship).yardTips;
  const mast = y && y.port && y.star && Number.isFinite(y.port.z) && Number.isFinite(y.star.z) ? (y.port.z + y.star.z) / 2 : null;
  const key = (z) => Math.abs(z) + (mast !== null && Math.abs(z - mast) < 0.9 ? 10 : 0);
  return zs.sort((a, b) => key(a) - key(b));
}

// Is the ship-local point (x, z) clear of the deck props listed in userData.blockers (player only)?
function deckFree(ship, x, z, pad = 0.3) {
  const blockers = Array.isArray(ud(ship).blockers) ? ud(ship).blockers : [];
  return blockers.every((b) => {
    if (!b) return true;
    if (Number.isFinite(b.r)) return Math.hypot(x - b.x, z - b.z) > b.r + pad;
    if (Number.isFinite(b.hx)) return Math.abs(x - b.x) > b.hx + pad - 0.05 || Math.abs(z - b.z) > b.hz + pad - 0.05;
    return true;
  });
}
// The waist (ship-local z range) where people stand at the rail.
function waist(ship) {
  const L = lenOf(ship);
  return ship.typeName === 'player' ? [-2.55, 2.9] : [-L * 0.27, L * 0.3];
}
// A standing spot at the `near` rail as close as possible to z, clear of props and of `taken` spots.
function railSpot(ship, near, z, taken = [], inset = 0.62) {
  const [lo, hi] = waist(ship);
  let best = null;
  let bd = Infinity;
  for (let k = lo; k <= hi + 1e-6; k += 0.1) {
    const x = near * Math.max(0.25, halfAt(ship, k) - inset);
    if (!deckFree(ship, x, k)) continue;
    if (taken.some((o) => Math.abs(o.z - k) < 0.68)) continue;
    const d = Math.abs(k - z);
    if (d < bd) {
      bd = d;
      best = { x, z: k };
    }
  }
  return best || { x: near * Math.max(0.25, halfAt(ship, z) - inset), z: clamp(z, lo, hi) };
}
// Pairs for the brawl on `ship`: defenders on the far side facing the near side, attackers opposite.
// Extra attackers (more than defenders) gang up on a defender from half a step along the deck; extra
// defenders turn on the nearest attacker.
function brawlLayout(ship, near, nAtt, nDef) {
  const rows = deckRows(ship, Math.max(1, Math.min(4, Math.max(nDef, nAtt))));
  const rowZ = (i) => {
    if (i < rows.length) return rows[i];
    const k = i - rows.length;
    return rows[k % rows.length] + (k % 2 ? -0.62 : 0.62);
  };
  const sepAt = (z) => clamp(2 * (halfAt(ship, z) - 0.42), 0.62, 1.05);
  const def = [];
  for (let i = 0; i < nDef; i++) {
    const z = rowZ(i);
    def.push({ x: -near * sepAt(z) * 0.5, z, yaw: (near * PI) / 2, pair: -1 });
  }
  const att = [];
  for (let j = 0; j < nAtt; j++) {
    const pair = nDef > 0 ? j % nDef : -1;
    let z = nDef > 0 ? def[pair].z : rowZ(j);
    let x = near * sepAt(z) * 0.5;
    let yaw = (-near * PI) / 2;
    if (nDef > 0 && j >= nDef) {
      // a second attacker on the same defender: half a step along the deck, turned toward him
      z += z > 0 ? -0.62 : 0.62;
      x = near * sepAt(z) * 0.25;
      yaw = Math.atan2(def[pair].x - x, def[pair].z - z);
    }
    att.push({ x, z, yaw, pair });
  }
  // defenders without a man of their own turn on the nearest attacker
  for (let i = 0; i < nDef; i++) {
    if (i < nAtt || !att.length) {
      def[i].pair = i < nAtt ? i : -1;
      continue;
    }
    let best = 0;
    for (let j = 1; j < att.length; j++) if (Math.abs(att[j].z - def[i].z) < Math.abs(att[best].z - def[i].z)) best = j;
    def[i].pair = best;
    def[i].yaw = Math.atan2(att[best].x - def[i].x, att[best].z - def[i].z);
  }
  return { att, def };
}

// One grapnel (shank, ring, three curled flukes), shank along +y, ~0.9 tall.
function grapnelGeometry() {
  const parts = [];
  const shank = new THREE.CylinderGeometry(0.04, 0.045, 0.62, 7, 1);
  shank.translate(0, 0.31, 0);
  parts.push(shank);
  const ring = new THREE.TorusGeometry(0.085, 0.026, 6, 12);
  ring.translate(0, 0.7, 0);
  parts.push(ring);
  for (let i = 0; i < 3; i++) {
    const fluke = new THREE.TorusGeometry(0.17, 0.034, 6, 9, PI * 0.72);
    fluke.rotateZ(-PI / 2);
    fluke.translate(0, 0.17, 0);
    fluke.rotateY((i * TAU) / 3);
    parts.push(fluke);
    const tip = new THREE.ConeGeometry(0.05, 0.13, 6);
    const a = -PI / 2 + PI * 0.72; // the end of the fluke's arc
    tip.rotateZ(a);
    tip.translate(0.17 * Math.cos(a), 0.17 + 0.17 * Math.sin(a), 0);
    tip.rotateY((i * TAU) / 3);
    parts.push(tip);
  }
  for (const g of parts) for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  g.scale(1.25, 1.25, 1.25);
  return g;
}

export function createBoarding(ctx = {}) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  const scene = c.scene && c.scene.isObject3D ? c.scene : null;
  const safe = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  const getPlayer = () => safe(() => (typeof c.player === 'function' ? c.player() : null), null);
  const reducedMotion = () => safe(() => (typeof c.reducedMotion === 'function' ? !!c.reducedMotion() : !!c.reducedMotion), false);
  const sfx = (name, x, z, extra) => safe(() => typeof c.sfx === 'function' && c.sfx(name, x, z, extra));
  const pop = (text, x, y, z, style) => safe(() => c.pops && typeof c.pops.pop === 'function' && c.pops.pop(text, x, y, z, style));
  const P = c.particles && typeof c.particles === 'object' ? c.particles : {};
  const spark = (...a) => safe(() => typeof P.spawnParticle === 'function' && P.spawnParticle(...a));
  const puff = (...a) => safe(() => typeof P.puff === 'function' && P.puff(...a));
  const foam = (...a) => safe(() => typeof P.foam === 'function' && P.foam(...a));
  let helmHidden = false;
  const hideHelm = (on) => {
    helmHidden = !!on;
    safe(() => typeof c.hideHelm === 'function' && c.hideHelm(!!on));
  };
  const now = () => safe(() => (typeof c.time === 'function' ? num(c.time(), clock) : clock), clock);
  // the overboard pool: an instance, or a function returning the current one (main rebuilds it)
  const overboardPool = () => safe(() => (typeof c.overboard === 'function' ? c.overboard() : c.overboard), null);

  // ------------------------------------------------------------------------------- listeners
  const listeners = { resolve: [], result: [], pip: [], cut: [], end: [], phase: [] };
  const on = (k) => (fn) => {
    if (typeof fn !== 'function') return () => {};
    listeners[k].push(fn);
    return () => {
      const i = listeners[k].indexOf(fn);
      if (i >= 0) listeners[k].splice(i, 1);
    };
  };
  const emit = (k, info) => {
    for (const fn of [...listeners[k]]) {
      try {
        fn(info);
      } catch (err) {
        console.error('boarding listener', k, err);
      }
    }
  };

  // ------------------------------------------------------------------------------- state
  let disposed = false;
  let clock = 0; // simulated seconds since creation (step)
  let active = false;
  let phase = null;
  let kind = null;
  let target = null;
  let side = 1;
  let phaseT = 0;
  let phaseDur = 0;
  let reelDur = BOARD.reel[0];
  let getSidesFn = null;
  let heaveBonus = 0;
  let heaves = 0;
  let lastHeaveAt = -10;
  let res = null; // { sides, r, label }
  let info = null; // the onResult payload
  let last = null;
  let counterUntil = -Infinity;
  let counterTarget = null;
  let cutTaps = 0;
  let holdDown = false;
  let holdT = 0;
  let pips = []; // brawl schedule [{ t, who, shown, from, index, count, fall }]
  let pipIdx = 0;
  const shown = { enemy: null, player: null }; // the crew counts the pips show so far (crewShown())
  let pull = null; // her haul to the slot: { x0, z0, h0, flip, offX, offZ, lastX, lastZ, from, dur }
  let glue = null; // the glued pair: { px, pz, tx, tz, block }
  let pushes = []; // lateral shoves [{ ship, vx, vz, left, delay }]
  let outro = null; // { until } visuals after the end
  let lastClash = -10;
  let camBlend = 0;
  let camPair = null; // { p, e, side, brawl } (kept while the camera eases back)
  let kickAt = -10;

  // ------------------------------------------------------------------------------- faded sails
  // The ship nearest the boarding camera shows her sails see-through while the view is on: each sail mesh
  // gets a transparent copy of its material(s) (one copy per material, kept for the level), the originals
  // come back when the camera has eased out (or at once on clear()). Draw calls are unchanged.
  const fadeCopy = new Map(); // original material -> its see-through copy
  const fadeOrig = new Map(); // copy -> original
  let fadedShip = null;
  function fadeMat(m, k) {
    if (!m || !m.isMaterial) return m;
    const o = fadeOrig.get(m) || m;
    let c = fadeCopy.get(o);
    if (!c) {
      c = o.clone();
      c.transparent = true;
      c.depthWrite = false;
      c.userData = { ...o.userData, outlineParameters: { ...(o.userData.outlineParameters || {}) } };
      fadeCopy.set(o, c);
      fadeOrig.set(c, o);
    }
    c.opacity = (o.transparent ? o.opacity : 1) * k;
    if (c.userData.outlineParameters.visible !== false) c.userData.outlineParameters.alpha = k;
    return c;
  }
  const unfadeMat = (m) => fadeOrig.get(m) || m;
  function setSailFade(ship, k) {
    const sails = ship && ship.mesh && ship.mesh.userData && Array.isArray(ship.mesh.userData.sails) ? ship.mesh.userData.sails : [];
    for (const s of sails) {
      if (!s || !s.material) continue;
      if (k >= 0.999) s.material = Array.isArray(s.material) ? s.material.map(unfadeMat) : unfadeMat(s.material);
      else s.material = Array.isArray(s.material) ? s.material.map((m) => fadeMat(m, k)) : fadeMat(s.material, k);
    }
  }
  function updateFade() {
    const b = camPair && camPair.p ? (camPair.brawl && camPair.brawl.mesh ? camPair.brawl : camPair.e && camPair.e.mesh ? camPair.e : null) : null;
    const want = b && camBlend > 0 ? b : null;
    if (fadedShip && fadedShip !== want) {
      setSailFade(fadedShip, 1);
      fadedShip = null;
    }
    tagShip(camPair && camBlend > 0.02 ? camPair.e : null);
    if (!want) return;
    fadedShip = want;
    setSailFade(want, 1 - (1 - SAIL_FADE) * smooth(camBlend));
  }
  function clearFade() {
    if (fadedShip) setSailFade(fadedShip, 1);
    fadedShip = null;
    tagShip(null);
  }
  // Her floating tag hides while the boarding view is on (the boarding strip shows both crews, and the tag
  // would sit right under it): tags.js reads ship.tagHidden.
  let tagged = null;
  function tagShip(e) {
    if (tagged && tagged !== e) tagged.tagHidden = false;
    tagged = e && e.mesh ? e : null;
    if (tagged) tagged.tagHidden = true;
  }
  function dropFadeCopies() {
    clearFade();
    for (const c of fadeCopy.values()) c.dispose();
    fadeCopy.clear();
    fadeOrig.clear();
  }

  // ------------------------------------------------------------------------------- people
  const figs = []; // every built person: { pivot, person, key, opts, use, st }
  const queue = []; // opts to prebuild (one per render while idle)
  let party = { captain: null, crew: [] }; // opts from prepare()
  let raiderOpts = [];

  const keyOf = (o) => safe(() => JSON.stringify(o || {}), '{}');
  function makeFig(opts) {
    if (!scene) return null;
    let person;
    try {
      person = buildPerson({ ...(opts || {}), share: true });
    } catch (err) {
      console.error('boarding: buildPerson failed', err);
      return null;
    }
    const pivot = new THREE.Group();
    pivot.name = 'boarding-person';
    pivot.visible = false;
    person.visible = true;
    pivot.add(person);
    scene.add(pivot);
    const f = { pivot, person, key: keyOf(opts), opts, use: null, st: null };
    figs.push(f);
    return f;
  }
  function freeFig(f) {
    if (!f) return;
    f.use = null;
    f.st = null;
    f.pivot.visible = false;
  }
  function disposeFig(f) {
    const i = figs.indexOf(f);
    if (i >= 0) figs.splice(i, 1);
    if (f.pivot.parent) f.pivot.parent.remove(f.pivot);
    disposePerson(f.person);
  }
  // A free built person wearing this look, else a new one.
  function takeFig(opts, use) {
    const key = keyOf(opts);
    let f = figs.find((x) => !x.use && x.key === key);
    if (!f) f = makeFig(opts);
    if (!f) return null;
    f.use = use;
    f.st = { mode: 'hidden' };
    f.pivot.visible = false;
    return f;
  }

  // Everyone in a boarding fights with a cutlass; the captain is built at the helm captain's 1.1.
  const armed = (o, scale) => {
    const r = { ...(o && typeof o === 'object' ? o : {}) };
    r.tool = 'cutlass';
    if (scale !== undefined && r.scale === undefined) r.scale = scale;
    r.share = true;
    return r;
  };
  const captainLook = () => armed(party.captain || { kind: 'pirate', outfit: 'pirate', hat: 'tricorn', seed: 7 }, 1.1);
  const crewLook = (i) => armed(party.crew[i % Math.max(1, party.crew.length)] || { kind: 'pirate', seed: 101 + i });
  function enemyLook(ship, i) {
    if (ship && ship.type && ship.type.boarder && raiderOpts.length) return armed(raiderOpts[i % raiderOpts.length]);
    const o = safe(() => (typeof c.enemyCrewOpts === 'function' ? c.enemyCrewOpts(ship && ship.typeName, i + 1) : null), null);
    return armed(o || { kind: 'pirate', seed: 300 + i });
  }

  // ------------------------------------------------------------------------------- the rig mesh
  // One dynamic mesh for the three grapnels and every line (grapple lines, swing ropes, let-go ropes):
  // a toon material with vertex colours, inked by the outline pass: 2 draw calls, 0 while hidden.
  const HOOKS = 3;
  const ROPES = 10;
  const SEG = 12;
  const SIDES = 5;
  const hookGeo = grapnelGeometry();
  const HV = hookGeo.attributes.position.count;
  const RV = (SEG + 1) * SIDES;
  const NV = HOOKS * HV + ROPES * RV;
  const rigPos = new Float32Array(NV * 3);
  const rigNor = new Float32Array(NV * 3);
  const rigCol = new Float32Array(NV * 3);
  const rigIdx = [];
  {
    const hi = hookGeo.index.array;
    for (let h = 0; h < HOOKS; h++) for (let i = 0; i < hi.length; i++) rigIdx.push(h * HV + hi[i]);
    for (let r = 0; r < ROPES; r++) {
      const base = HOOKS * HV + r * RV;
      for (let s = 0; s < SEG; s++) {
        for (let k = 0; k < SIDES; k++) {
          const a = base + s * SIDES + k;
          const b = base + s * SIDES + ((k + 1) % SIDES);
          rigIdx.push(a, a + SIDES, b, b, a + SIDES, b + SIDES);
        }
      }
    }
    for (let i = 0; i < HOOKS * HV; i++) HOOK_COLOR.toArray(rigCol, i * 3);
    for (let i = HOOKS * HV; i < NV; i++) ROPE_COLOR.toArray(rigCol, i * 3);
  }
  const rigGeo = new THREE.BufferGeometry();
  rigGeo.setAttribute('position', new THREE.BufferAttribute(rigPos, 3).setUsage(THREE.DynamicDrawUsage));
  rigGeo.setAttribute('normal', new THREE.BufferAttribute(rigNor, 3).setUsage(THREE.DynamicDrawUsage));
  rigGeo.setAttribute('color', new THREE.BufferAttribute(rigCol, 3));
  rigGeo.setIndex(rigIdx);
  rigGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const rigMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap(3) });
  setOutline(rigMat, { thickness: 0.0045 });
  const rig = new THREE.Mesh(rigGeo, rigMat);
  rig.name = 'boarding-rig';
  rig.frustumCulled = false;
  rig.visible = false;
  rig.userData.keep = true;
  if (scene) scene.add(rig);
  const hookPos = hookGeo.attributes.position.array;
  const hookNor = hookGeo.attributes.normal.array;

  function writeHook(h, M) {
    const o = h * HV * 3;
    if (!M) {
      rigPos.fill(0, o, o + HV * 3);
      return;
    }
    _nm.getNormalMatrix(M);
    for (let i = 0; i < HV; i++) {
      _v.fromArray(hookPos, i * 3).applyMatrix4(M);
      _v.toArray(rigPos, o + i * 3);
      _v.fromArray(hookNor, i * 3).applyMatrix3(_nm).normalize();
      _v.toArray(rigNor, o + i * 3);
    }
  }
  // A rope through the points (a polyline, resampled to SEG segments), as a 5-sided tube.
  const ropePts = Array.from({ length: SEG + 1 }, () => new THREE.Vector3());
  const _t = new THREE.Vector3();
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const lens = new Float32Array(16);
  function writeRope(r, pts, n = pts ? pts.length : 0, radius = SET.ropeR) {
    const o = (HOOKS * HV + r * RV) * 3;
    if (!pts || n < 2) {
      rigPos.fill(0, o, o + RV * 3);
      return;
    }
    let total = 0;
    lens[0] = 0;
    for (let i = 1; i < n; i++) {
      total += pts[i].distanceTo(pts[i - 1]);
      lens[i] = total;
    }
    if (total < 1e-4) {
      rigPos.fill(0, o, o + RV * 3);
      return;
    }
    let j = 0;
    for (let s = 0; s <= SEG; s++) {
      const d = (total * s) / SEG;
      while (j < n - 2 && lens[j + 1] < d) j++;
      const seg = lens[j + 1] - lens[j] || 1;
      ropePts[s].lerpVectors(pts[j], pts[j + 1], clamp((d - lens[j]) / seg, 0, 1));
    }
    for (let s = 0; s <= SEG; s++) {
      const p = ropePts[s];
      _t.subVectors(ropePts[Math.min(SEG, s + 1)], ropePts[Math.max(0, s - 1)]).normalize();
      _a.crossVectors(_t, Math.abs(_t.y) > 0.9 ? _xAxis : _up).normalize();
      _b.crossVectors(_t, _a).normalize();
      for (let k = 0; k < SIDES; k++) {
        const ang = (k / SIDES) * TAU;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const nx = _a.x * ca + _b.x * sa;
        const ny = _a.y * ca + _b.y * sa;
        const nz = _a.z * ca + _b.z * sa;
        const i = o + (s * SIDES + k) * 3;
        rigPos[i] = p.x + nx * radius;
        rigPos[i + 1] = p.y + ny * radius;
        rigPos[i + 2] = p.z + nz * radius;
        rigNor[i] = nx;
        rigNor[i + 1] = ny;
        rigNor[i + 2] = nz;
      }
    }
  }
  // a hanging line between two points (sagging by `sag` in the middle), plus an optional extra point
  const curvePts = Array.from({ length: 11 }, () => new THREE.Vector3());
  function sagLine(a, b, sag, extra = null) {
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      curvePts[i].lerpVectors(a, b, u);
      curvePts[i].y -= sag * 4 * u * (1 - u);
    }
    if (extra) {
      curvePts[n + 1].copy(extra);
      return n + 2;
    }
    return n + 1;
  }

  // ------------------------------------------------------------------------------- hooks
  // hooks[i] = { state: 'off' | 'fly' | 'set' | 'drop', from, fromL: {x,y,z}, to, toL, t0, hauler: fig | null,
  //              drop: { p, v, spin, t0, splashed, trail } }
  const hooks = Array.from({ length: HOOKS }, () => ({ state: 'off' }));
  const hookFromZ = (from, i) => clamp((i - 1) * lenOf(from) * 0.2, -2.3, 2.6);
  function throwHooks(from, to, t0, set = false) {
    const nearFrom = sideToward(from, to.x, to.z);
    const nearTo = sideToward(to, from.x, from.z);
    const Lt = lenOf(to);
    for (let i = 0; i < HOOKS; i++) {
      const zf = hookFromZ(from, i);
      const zt = clamp((i - 1) * Lt * 0.2, -Lt * 0.32, Lt * 0.32);
      Object.assign(hooks[i], {
        state: set ? 'set' : 'fly',
        from,
        to,
        fromL: { x: nearFrom * Math.max(0.2, halfAt(from, zf) - 0.08), y: railOf(from) + 0.1, z: zf },
        toL: { x: nearTo * Math.max(0.2, halfAt(to, zt) - 0.06), y: railOf(to) + 0.02, z: zt },
        t0: t0 + i * SET.hookStagger,
        hauler: null,
        drop: null,
      });
    }
  }
  // lines snap: the grapnel falls away and its line trails after it
  function dropHook(h) {
    if (h.state !== 'fly' && h.state !== 'set') return;
    const p = hookWorld(h, new THREE.Vector3());
    const away = new THREE.Vector3(p.x - h.from.x, 0, p.z - h.from.z);
    if (away.lengthSq() < 1e-6) away.set(1, 0, 0);
    away.normalize();
    h.drop = { p, v: new THREE.Vector3(away.x * 1.6, 2.2, away.z * 1.6), t0: clock, spin: (Math.random() - 0.5) * 12, splashed: false };
    h.state = 'drop';
    h.hauler = null;
  }
  function dropAllHooks() {
    for (const h of hooks) dropHook(h);
  }
  const _hA = new THREE.Vector3();
  function hookWorld(h, out) {
    if (h.state === 'set') return onShip(h.to, h.toL.x, h.toL.y, h.toL.z, out);
    if (h.state === 'fly') {
      const u = clamp((clock - h.t0) / SET.hookFly, 0, 1);
      onShip(h.from, h.fromL.x, h.fromL.y, h.fromL.z, _hA);
      onShip(h.to, h.toL.x, h.toL.y, h.toL.z, out);
      const arc = 1.2 + 0.12 * Math.hypot(out.x - _hA.x, out.z - _hA.z);
      return out.set(lerp(_hA.x, out.x, u), lerp(_hA.y, out.y, u) + arc * 4 * u * (1 - u), lerp(_hA.z, out.z, u));
    }
    if (h.state === 'drop' && h.drop) {
      const a = clock - h.drop.t0;
      return out.copy(h.drop.p).addScaledVector(h.drop.v, a).add(_v3.set(0, -9 * a * a, 0));
    }
    return out.set(0, -100, 0);
  }
  function landHook(h) {
    h.state = 'set';
    const w = hookWorld(h, _v2);
    puff(w.x, w.y, w.z, 3, SPLINTER, 1.2, 1.4, 0.18, 0.35, -6);
    sfx('grapple', w.x, w.z, { volume: 0.45 });
  }
  function snapOne(i) {
    const h = hooks[i];
    if (!h || (h.state !== 'set' && h.state !== 'fly')) return false;
    const w = hookWorld(h, _v2);
    for (let k = 0; k < 6; k++) spark('glow', STAR_COLORS[k % 3], w.x, w.y + 0.2, w.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.25, 0.12, 0);
    puff(w.x, w.y, w.z, 3, ROPE_COLOR.getHex(), 1.4, 1.2, 0.12, 0.4, -6);
    dropHook(h);
    return true;
  }

  // ------------------------------------------------------------------------------- set-piece helpers
  const truceNow = () => active && kind !== 'surrender' && (phase === 'swing' || phase === 'brawl' || phase === 'result');
  const lockedNow = () => active && (phase === 'swing' || phase === 'brawl' || phase === 'result');

  function slotOf(p, e) {
    const d = (widOf(p) + widOf(e)) / 2 + BOARD.slotGap;
    return { x: p.x + rightX(p.h) * side * d, z: p.z + rightZ(p.h) * side * d, d };
  }
  const flipOf = (p, e) => Math.abs(wrap(e.h - p.h)) > PI / 2;

  // world point on a ship from ship-local coordinates
  function onShip(ship, x, y, z, out = new THREE.Vector3()) {
    shipMatrix(ship, _m2);
    return out.set(x, y, z).applyMatrix4(_m2);
  }
  const waterY = (ship) => num(ship && ship.mesh && ship.mesh.position.y, 0);
  function popAt(ship, text, style, dy = 3.4) {
    if (!ship) return;
    pop(text, ship.x, deckOf(ship) + dy + waterY(ship), ship.z, style);
  }
  // a word over the gap between the two ships (the middle of the boarding view)
  function popMid(text, style, dy = 2.4) {
    const p = getPlayer();
    const e = target;
    if (!p) return;
    const mx = e ? (p.x + e.x) / 2 : p.x;
    const mz = e ? (p.z + e.z) / 2 : p.z;
    pop(text, mx, Math.max(deckOf(p), e ? deckOf(e) : 0) + dy + waterY(p), mz, style);
  }

  function fallbackSides(p, e) {
    const crew0 = num(e.crew0, num(e.type && e.type.crew, 10));
    const enemy = {
      crew: crewNow({ crew0, hpLow: num(e.hpLow, num(e.hp, 1)), maxHp: num(e.maxHp, num(e.hp, 1)), killed: num(e.killed, 0) }),
      crew0,
      grit: num(e.type && e.type.grit, 1),
      hpFrac: clamp(num(e.hp, 1) / Math.max(1, num(e.maxHp, 1)), 0, 1),
    };
    const me = { crew: 12, crew0: 12, blade: 1, hpFrac: clamp(num(p.hp, 1) / Math.max(1, num(p.maxHp, 1)), 0, 1) };
    return kind === 'defend' ? { att: enemy, def: me, attIsPlayer: false } : { att: me, def: enemy, attIsPlayer: true };
  }
  function freshSides() {
    let s = null;
    try {
      s = typeof getSidesFn === 'function' ? getSidesFn() : null;
    } catch (err) {
      console.error('boarding: getSides failed', err);
    }
    return s && typeof s === 'object' && s.att && s.def ? s : null;
  }
  function computeResult() {
    const sides = freshSides() || fallbackSides(getPlayer(), target);
    const r = api.odds(sides, { kind, heave: heaveBonus, surrendered: kind === 'surrender' });
    return { sides, r, label: r.label };
  }
  function resultInfo() {
    const r = res.r;
    const enemyTaken = kind === 'defend' ? !!r.attackerStrikes : !!r.captured;
    return {
      kind,
      enemy: target,
      side,
      result: r,
      label: res.label,
      sides: res.sides,
      heave: heaveBonus,
      captured: enemyTaken,
      overrun: kind === 'defend' && !!r.overrun,
      held: kind === 'defend' && !r.overrun && !r.attackerStrikes,
      raiderStrikes: kind === 'defend' && !!r.attackerStrikes,
      playerCrewLeft: kind === 'defend' ? r.defLeft : r.attLeft,
      enemyCrewLeft: kind === 'defend' ? r.attLeft : r.defLeft,
      playerCrewLost: kind === 'defend' ? r.defLoss : r.attLoss,
      enemyCrewLost: kind === 'defend' ? r.attLoss : r.defLoss,
      playerHullDmg: kind === 'defend' ? r.hullDmg : 0,
      enemyHullDmg: kind === 'defend' ? 0 : r.hullDmg,
      gold: enemyTaken ? captureGold(num(target && target.type && target.type.gold, 0)) : 0,
    };
  }
  function makeLast(extra = {}) {
    return {
      kind,
      enemy: target,
      enemyType: target ? target.typeName : null,
      side,
      result: res ? res.r : null,
      label: res ? res.label : null,
      sides: res ? res.sides : null,
      heave: heaveBonus,
      heaves,
      reason: null,
      ...(info || {}),
      ...extra,
    };
  }
  function setPhase(name, dur) {
    phase = name;
    phaseT = 0;
    phaseDur = dur;
    emit('phase', { phase, kind, enemy: target, side, duration: dur });
  }

  // ---- who is in this set-piece
  let partyFigs = []; // [captain, crew…] (captain may be null while the helm captain still steers)
  let foeFigs = []; // her sailors (attack / counter defenders, or the raiders boarding you)
  const lazy = []; // foes still to build, one per render: [{ opts, i, place }]
  let brawl = null; // { ship, near, att: [...spots], def: [...spots] }
  let attackers = [];
  let defenders = [];
  let pairs = []; // [{ a, d }] fighters whose blades meet (clang timing)

  const ourShown = (sides) => {
    const s = sides || (getSidesFn ? freshSides() : null);
    const n = s ? Math.floor(num((kind === 'defend' ? s.def : s.att).crew, 4)) : 4;
    return clamp(n, 1, BOARD.partyShown);
  };
  const foesShown = (sides) => {
    const s = sides || (getSidesFn ? freshSides() : null);
    if (!s) return BOARD.defendersShown;
    return clamp(Math.floor(num((kind === 'defend' ? s.att : s.def).crew, 4)), 0, BOARD.defendersShown);
  };
  // At most PEOPLE people in view at once (§3.5: +45 draw calls): your captain (or the helm captain),
  // your hands, her sailors, and whoever the overboard pool is still showing from an earlier fight.
  // Her side gives way first (down to 2), then yours.
  const PEOPLE = 9;
  function budget(nCrew, nFoes) {
    const pool = overboardPool();
    const ob = Math.max(0, Math.floor(num(safe(() => pool && pool.active, 0), 0)));
    let crew = nCrew;
    let foes = nFoes;
    while (1 + crew + foes + ob > PEOPLE && foes > Math.min(2, nFoes)) foes--;
    while (1 + crew + foes + ob > PEOPLE && crew > 1) crew--;
    while (1 + crew + foes + ob > PEOPLE && foes > 1) foes--;
    return [crew, foes];
  }

  function wantFoes(n, ship) {
    foeFigs = [];
    lazy.length = 0;
    for (let i = 0; i < n; i++) {
      const opts = enemyLook(ship, i);
      const key = keyOf(opts);
      const f = figs.find((x) => !x.use && x.key === key);
      if (f) {
        f.use = 'foe';
        f.st = { mode: 'hidden' };
        foeFigs[i] = f;
      } else {
        foeFigs[i] = null;
        lazy.push({ opts, i, place: null });
      }
    }
  }
  function buildLazy(all) {
    while (lazy.length) {
      const L = lazy.shift();
      const f = takeFig(L.opts, 'foe');
      foeFigs[L.i] = f;
      if (f && L.place) L.place(f, L.i);
      if (!all) break;
    }
  }
  // where every foe goes (also the ones still to be built)
  function placeFoes(fn) {
    foeFigs.forEach((f, i) => f && fn(f, i));
    for (const L of lazy) L.place = fn;
  }
  function wantCrew(n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(takeFig(crewLook(i), 'crew'));
    return out;
  }
  function wantCaptain() {
    return takeFig(captainLook(), 'captain');
  }

  // a person standing on a ship (ship-local spot), doing `act`
  function stand(f, ship, x, z, yaw, act, extra = {}) {
    if (!f) return;
    f.st = { mode: 'stand', ship, x, z, y: null, yaw, act, since: clock, ...extra };
    f.pivot.visible = true;
  }
  // where the boarding captain starts: at the wheel (he takes over from the helm captain), else the rail
  function helmSpot(p) {
    const h = ud(p).helm;
    if (h && Number.isFinite(h.x) && Number.isFinite(h.y) && Number.isFinite(h.z)) return { x: h.x, y: h.y, z: h.z };
    return null;
  }

  // ---- phases
  function startHook() {
    const p = getPlayer();
    setPhase('hook', BOARD.phases.hook);
    throwHooks(p, target, clock);
    sfx('grapple', p.x, p.z);
    // four hands at the near rail: three by the lines (they'll haul), one waving his cutlass
    const near = sideToward(p, target.x, target.z);
    const [nCrew, nFoes] = budget(ourShown(), kind === 'attack' ? foesShown() : 0);
    partyFigs = [null, ...wantCrew(nCrew)];
    const taken = [];
    partyFigs.forEach((f, i) => {
      if (!f) return;
      const k = i - 1;
      const s = k < HOOKS ? railSpot(p, near, hookFromZ(p, k), taken, 0.72) : railSpot(p, near, 1.0, taken);
      taken.push(s);
      stand(f, p, s.x, s.z, (near * PI) / 2, 'cheer');
    });
    if (kind === 'attack') {
      wantFoes(nFoes, target);
      placeFoes((f) => {
        f.st = { mode: 'hidden' };
      });
    } else wantFoes(0, target);
  }
  function startThreat() {
    const p = getPlayer();
    setPhase('threat', RAIDERS.threat);
    throwHooks(target, p, clock);
    sfx('grapple', target.x, target.z);
    // raiders crowd their rail (a captain pointing, the rest hauling); your hands rush to the rail
    const nearE = sideToward(target, p.x, p.z);
    const [nCrew, nFoes] = budget(ourShown(), Math.max(1, foesShown()));
    wantFoes(nFoes, target);
    const spotsE = [];
    for (let i = 0; i < Math.max(1, foeFigs.length); i++) {
      const z = i >= 1 && i <= HOOKS ? hookFromZ(target, i - 1) : 0.4;
      spotsE.push(railSpot(target, nearE, z, spotsE, i >= 1 && i <= HOOKS ? 0.72 : 0.62));
    }
    placeFoes((f, i) => {
      const s = spotsE[i] || spotsE[0];
      stand(f, target, s.x, s.z, (nearE * PI) / 2, i === 0 ? 'point' : 'haul');
      if (i >= 1 && i <= HOOKS && hooks[i - 1]) hooks[i - 1].hauler = f;
    });
    const near = sideToward(p, target.x, target.z);
    partyFigs = [null, ...wantCrew(nCrew)];
    const taken = [];
    partyFigs.forEach((f, i) => {
      if (!f) return;
      // stand by the hooks biting our rail, ready with the cutlass
      const hz = hooks[(i - 1) % HOOKS] ? hooks[(i - 1) % HOOKS].toL.z : 0;
      const s = railSpot(p, near, hz + (i > HOOKS ? 0.8 : 0), taken);
      taken.push(s);
      f.st = { mode: 'guard', ship: p, x: s.x, z: s.z, yaw: (near * PI) / 2, since: clock };
      f.pivot.visible = true;
    });
  }
  function startReel() {
    const p = getPlayer();
    setPhase('reel', kind === 'defend' ? RAIDERS.reel : reelDur);
    pull = { x0: target.x, z0: target.z, h0: target.h, flip: flipOf(p, target), offX: 0, offZ: 0, lastX: target.x, lastZ: target.z, dur: phaseDur };
    target.speed = 0;
    if (kind === 'defend') {
      // the raiders keep hauling; your hands fall back to meet them mid-deck
      const near = sideToward(p, target.x, target.z);
      const lay = brawlLayout(p, near, Math.max(1, foeFigs.length), partyFigs.filter(Boolean).length + 1);
      partyFigs.forEach((f, i) => {
        if (!f || !f.st) return;
        const s = lay.def[i] || lay.def[0];
        f.st = { mode: 'run', ship: p, x0: f.st.x, z0: f.st.z, x: s.x, z: s.z, yaw: s.yaw, since: clock, dur: 0.4, next: 'guard' };
      });
      return;
    }
    // your hands haul the lines in (one each), the fourth cheers them on
    partyFigs.forEach((f, i) => {
      if (!f || !f.st) return;
      if (i >= 1 && i <= HOOKS) {
        f.st.act = 'haul';
        hooks[i - 1].hauler = f;
      }
    });
    // her crew come up on deck to meet you, guard up (built one per frame from here)
    if (kind === 'attack') {
      const near = sideToward(target, p.x, p.z);
      const lay = brawlLayout(target, near, partyFigs.filter(Boolean).length + 1, foeFigs.length);
      placeFoes((f, i) => {
        const s = lay.def[i];
        if (!s) return;
        f.st = { mode: 'guard', ship: target, x: s.x, z: s.z, yaw: s.yaw, since: clock, appear: clock };
        f.pivot.visible = true;
      });
    }
  }

  function startSwing() {
    const p = getPlayer();
    setPhase('swing', BOARD.phases.swing);
    buildLazy(true);
    res = computeResult();
    last = makeLast();
    emit('resolve', { kind, enemy: target, side, result: res.r, label: res.label, sides: res.sides, heave: heaveBonus });
    for (const h of hooks) h.hauler = null;
    const helm = helmSpot(p);
    if (kind === 'defend') {
      // your captain leaves the wheel and jumps down; the raiders swing across from their yard
      const near = sideToward(p, target.x, target.z);
      const crew = partyFigs.slice(1).filter(Boolean).slice(0, Math.max(1, ourShown(res.sides)));
      for (const f of partyFigs.slice(1)) if (f && !crew.includes(f)) freeFig(f);
      const cap = wantCaptain();
      hideHelm(true);
      defenders = [cap, ...crew].filter(Boolean);
      attackers = foeFigs.filter(Boolean).slice(0, Math.max(1, Math.min(foeFigs.length, foesShown(res.sides))));
      for (const f of foeFigs) if (f && !attackers.includes(f)) freeFig(f);
      brawl = { ship: p, near, ...brawlLayout(p, near, attackers.length, defenders.length) };
      defenders.forEach((f, i) => {
        const s = brawl.def[i];
        if (f === cap && helm) {
          f.st = { mode: 'hop', ship: p, x0: helm.x, y0: helm.y, z0: helm.z, x: s.x, z: s.z, yaw: s.yaw, since: clock, dur: SET.hop };
          f.pivot.visible = true;
        } else if (f.st && f.st.mode === 'run') {
          Object.assign(f.st, { x: s.x, z: s.z, yaw: s.yaw });
        } else if (f.st && f.st.ship === p && Math.hypot(f.st.x - s.x, f.st.z - s.z) > 0.05) {
          f.st = { mode: 'run', ship: p, x0: f.st.x, z0: f.st.z, x: s.x, z: s.z, yaw: s.yaw, since: clock, dur: 0.25, next: 'guard' };
        } else {
          f.st = { mode: 'guard', ship: p, x: s.x, z: s.z, yaw: s.yaw, since: clock };
          f.pivot.visible = true;
        }
      });
      launchSwings(attackers, target, p, brawl.att);
      sfx('heave', target.x, target.z);
      popMid('REPEL BOARDERS!', 'bad', 2.6);
    } else {
      // your captain takes the lead from the quarterdeck, the hands follow from the rail
      const near = sideToward(target, p.x, p.z);
      const nearP = sideToward(p, target.x, target.z);
      const cap = wantCaptain();
      let crew = partyFigs.slice(1).filter(Boolean);
      const fresh = kind === 'counter' || !crew.length;
      const [nCrew, nFoes] = fresh ? budget(ourShown(res.sides), foesShown(res.sides)) : [Math.min(crew.length, ourShown(res.sides)), foeFigs.length];
      if (fresh) crew = wantCrew(nCrew);
      for (const f of crew.slice(nCrew)) freeFig(f);
      crew = crew.slice(0, nCrew);
      const taken = [];
      for (const f of crew) {
        if (!f.st || f.st.ship !== p || f.st.mode === 'hidden') {
          const s = railSpot(p, nearP, 0, taken);
          stand(f, p, s.x, s.z, (nearP * PI) / 2, 'cheer');
        }
        taken.push({ z: f.st.z });
      }
      hideHelm(true);
      const start = helm ? { x: helm.x, y: helm.y, z: helm.z } : railSpot(p, nearP, 0.5, taken);
      stand(cap, p, start.x, start.z, (nearP * PI) / 2, 'point', { y: helm ? helm.y : null });
      partyFigs = [cap, ...crew];
      if (kind === 'counter') {
        wantFoes(nFoes, target);
        buildLazy(true);
        if (!hooks.some((h) => h.state === 'set' && h.from === target)) throwHooks(p, target, clock, true);
        pull = { x0: target.x, z0: target.z, h0: target.h, flip: flipOf(p, target), offX: 0, offZ: 0, lastX: target.x, lastZ: target.z, dur: phaseDur };
      }
      attackers = partyFigs.filter(Boolean);
      defenders = foeFigs.filter(Boolean).slice(0, Math.min(nFoes, foesShown(res.sides)));
      for (const f of foeFigs) if (f && !defenders.includes(f)) freeFig(f);
      brawl = { ship: target, near, ...brawlLayout(target, near, attackers.length, defenders.length) };
      defenders.forEach((f, i) => {
        const s = brawl.def[i];
        const appear = f.st && f.st.appear !== undefined ? f.st.appear : clock;
        f.st = { mode: 'guard', ship: target, x: s.x, z: s.z, yaw: s.yaw, since: clock, appear };
        f.pivot.visible = true;
      });
      launchSwings(attackers, p, target, brawl.att);
      sfx('heave', p.x, p.z, { pitch: 1.15 });
      popMid('CHARGE!', 'info', 2.6);
    }
    pairs = [];
  }
  // swing everyone in `list` from where they stand on `from` to the brawl spots on `to`
  function launchSwings(list, from, to, spots) {
    const nearFrom = sideToward(from, to.x, to.z);
    const [tipA, tipB] = yardEnds(from, nearFrom);
    const taken = [];
    list.forEach((f, i) => {
      let st = f.st && f.st.ship === from && f.st.mode !== 'hidden' ? f.st : null;
      if (!st) {
        const s = railSpot(from, nearFrom, 0, taken);
        st = { x: s.x, z: s.z, y: null };
      }
      taken.push({ z: st.z });
      const dest = spots[i] || spots[0];
      // each rope is made fast a little further in along the yard
      const k = Math.min(0.4, i * 0.09);
      f.st = {
        mode: 'fly',
        from,
        fx: st.x,
        fy: st.y,
        fz: st.z,
        to,
        tx: dest.x,
        tz: dest.z,
        tyaw: dest.yaw,
        anchorShip: from,
        anchor: { x: lerp(tipA.x, tipB.x, k), y: lerp(tipA.y, tipB.y, k), z: lerp(tipA.z, tipB.z, k) },
        t0: clock + i * SET.stagger,
        dur: SET.swing,
        then: 'fight',
      };
      f.pivot.visible = true;
    });
  }

  function startBrawl() {
    setPhase('brawl', BOARD.phases.brawl);
    const r = res.r;
    const s = res.sides;
    const enemyLoss = kind === 'defend' ? r.attLoss : r.defLoss;
    const ourLoss = kind === 'defend' ? r.defLoss : r.attLoss;
    const enemyFrom = Math.floor(num(kind === 'defend' ? s.att.crew : s.def.crew, 0));
    const ourFrom = Math.floor(num(kind === 'defend' ? s.def.crew : s.att.crew, 0));
    const enemyFigs = kind === 'defend' ? attackers : defenders;
    const ourFigs = (kind === 'defend' ? defenders : attackers).filter((f) => f.use !== 'captain');
    const fallsFor = (shown, loss, from, cap) => {
      if (shown <= 0 || loss <= 0) return 0;
      if (loss >= from) return Math.min(shown, cap);
      return clamp(Math.round((shown * loss) / Math.max(1, from)), 1, Math.min(cap, shown - 1));
    };
    const fE = fallsFor(enemyFigs.length, enemyLoss, enemyFrom, BOARD.defendersShown);
    const fO = fallsFor(ourFigs.length, ourLoss, ourFrom, SET.ourFalls);
    // fall order: the last figures first (the captain's opponent holds out longest)
    const eOrder = [...enemyFigs].reverse();
    const oOrder = [...ourFigs].reverse();
    pips = [];
    const sched = (who, loss, from, falls, order, offset) => {
      const fallAt = new Map();
      for (let j = 0; j < falls; j++) fallAt.set(Math.min(loss - 1, Math.floor(((j + 0.6) * loss) / falls)), order[j]);
      for (let k = 0; k < loss; k++) {
        pips.push({ t: SET.pipFrom + (SET.pipSpan * (k + offset)) / loss, who, shown: from - (k + 1), from, index: k, count: loss, fall: fallAt.get(k) || null });
      }
    };
    sched('enemy', enemyLoss, enemyFrom, fE, eOrder, 0.5);
    sched('player', ourLoss, ourFrom, fO, oOrder, 0.8);
    pips.sort((a, b) => a.t - b.t);
    pipIdx = 0;
    shown.enemy = enemyFrom;
    shown.player = ourFrom;
    // fighters already on deck start fighting; late swingers start when they land
    for (const f of [...attackers, ...defenders]) if (f.st && f.st.mode === 'guard') f.st.mode = 'fight';
    rebuildPairs();
  }
  function rebuildPairs() {
    pairs = [];
    if (!brawl) return;
    attackers.forEach((a, j) => {
      const pi = brawl.att[j] ? brawl.att[j].pair : -1;
      const d = pi >= 0 ? defenders[pi] : null;
      if (d) pairs.push({ a, d, qa: -1, qd: -1 });
    });
  }

  function firePip(ev) {
    shown[ev.who] = ev.shown;
    emit('pip', { who: ev.who, shown: ev.shown, from: ev.from, index: ev.index, count: ev.count, enemy: target, kind });
    if (ev.fall) knockOver(ev.fall);
    else {
      // a blow that doesn't send anyone over: someone on that side reels back seeing stars
      const enemySide = ev.who === 'enemy';
      const list = enemySide === (kind === 'defend') ? attackers : defenders;
      const standing = list.filter((f) => f.st && (f.st.mode === 'fight' || f.st.mode === 'guard'));
      if (standing.length) standing[ev.index % standing.length].st.stagger = clock;
    }
  }

  // a loser staggers to the far rail of the brawl deck and goes over it
  function knockOver(f) {
    if (!f || !f.st || !brawl) return;
    const st = f.st;
    if (st.mode === 'fly' || st.mode === 'hop' || st.mode === 'run') {
      st.pendingFall = true; // still on his way: he goes when he lands
      return;
    }
    if (st.mode !== 'fight' && st.mode !== 'guard' && st.mode !== 'stand') return;
    const ship = brawl.ship;
    const far = -brawl.near;
    f.st = { mode: 'knock', ship, x0: st.x, z: st.z, x1: far * Math.max(0.25, halfAt(ship, st.z) - 0.15), yaw: st.yaw, since: clock };
    const w = onShip(ship, st.x, deckOf(ship) + 1.1, st.z, _v2);
    stars(w, 5);
    // his opponent celebrates
    for (const pr of pairs) {
      if (pr.d === f && pr.a.st && pr.a.st.mode === 'fight') pr.a.st.won = clock;
      if (pr.a === f && pr.d.st && pr.d.st.mode === 'fight') pr.d.st.won = clock;
    }
  }
  function goOverboard(f) {
    const ship = f.st && f.st.ship;
    if (!ship || !brawl) {
      freeFig(f);
      return;
    }
    const far = -brawl.near;
    const gameplaySide = -far; // §0.1: local x = −side × half  →  side = −sign(local x)
    const z = f.st.z;
    const ob = overboardPool();
    let ok = false;
    if (ob && typeof ob.throwOver === 'function') {
      // he goes over the rail right where he stands (the pool keeps the same look)
      try {
        ok = !!ob.throwOver(ship, gameplaySide, f.opts, { along: z });
      } catch {
        ok = false;
      }
    }
    if (ok) {
      freeFig(f);
      return;
    }
    // no overboard pool (or it is busy): tumble him ourselves
    shipMatrix(ship, _m);
    const p0 = new THREE.Vector3(far * Math.max(0.25, halfAt(ship, z) - 0.15), railOf(ship) + 0.05, z).applyMatrix4(_m);
    const out = new THREE.Vector3(far, 0, 0).transformDirection(_m);
    out.y = 0;
    out.normalize();
    const water = waterY(ship);
    const T = 0.8;
    const y0 = p0.y + 0.6;
    f.st = {
      mode: 'tumble',
      p0: new THREE.Vector3(p0.x, y0, p0.z),
      vx: fwdX(ship.h) * num(ship.speed, 0) + out.x * 4.4,
      vz: fwdZ(ship.h) * num(ship.speed, 0) + out.z * 4.4,
      vy: (water - 0.1 - y0 + 0.5 * 26 * T * T) / T,
      ox: out.x,
      oz: out.z,
      water,
      since: clock,
      yaw: Math.atan2(-out.x, -out.z),
    };
  }

  function startResult() {
    const p = getPlayer();
    setPhase('result', BOARD.phases.result);
    if (!res) {
      res = computeResult();
      last = makeLast();
      emit('resolve', { kind, enemy: target, side, result: res.r, label: res.label, sides: res.sides, heave: heaveBonus });
    }
    // any pips still due land now (a skip, or a short brawl)
    while (pipIdx < pips.length) firePip(pips[pipIdx++]);
    info = resultInfo();
    last = makeLast();
    emit('result', info);
    const r = res.r;
    const brawlShip = brawl ? brawl.ship : target;
    if (kind === 'surrender') {
      popMid(`CAPTURED!\n+${info.gold} gold`, 'capture', 2.8);
      for (const f of partyFigs) if (f && f.st) f.st.act = 'cheer';
      coinFountain(target, p);
      kickAt = clock;
    } else if (kind === 'defend') {
      if (info.captured) {
        popAt(p, `RAIDER TAKEN!\n+${info.gold} gold`, 'capture');
        settle(attackers, 'surrender');
        settle(defenders, 'cheer');
        coinFountain(target, p);
        kickAt = clock;
      } else if (info.overrun) {
        popAt(p, r.defLoss > 0 ? `OVERRUN!\n−${r.defLoss} crew` : 'OVERRUN!', 'bad');
        settle(attackers, 'cheer');
        settle(defenders, 'idle');
        swingHome(attackers, p, target, 0.3);
        shove(target, 0.3);
      } else {
        popAt(p, r.defLoss > 0 ? `REPELLED!\n−${r.defLoss} crew` : 'REPELLED!', 'info');
        settle(defenders, 'cheer');
        swingHome(attackers, p, target, 0);
      }
    } else if (info.captured) {
      popAt(brawlShip, `CAPTURED!\n+${info.gold} gold`, 'capture');
      settle(defenders, 'surrender');
      settle(attackers, 'cheer');
      coinFountain(target, p);
      kickAt = clock;
    } else {
      popAt(brawlShip, r.attLoss > 0 ? `DRIVEN BACK!\n−${r.attLoss} crew` : 'DRIVEN BACK!', 'bad');
      settle(defenders, 'cheer');
      swingHome(attackers, target, p, 0);
      shove(target, 0);
    }
    pairs = [];
  }
  function settle(list, act) {
    for (const f of list) {
      if (!f || !f.st) continue;
      const m = f.st.mode;
      if (m === 'fight' || m === 'guard' || m === 'stand') {
        f.st.mode = 'stand';
        f.st.act = act;
        f.st.since = clock;
        f.st.won = undefined;
      } else if (m === 'fly' || m === 'hop' || m === 'run') f.st.then = act;
    }
  }
  // the survivors swing back to their own ship (on the rope still hanging from its yard)
  function swingHome(list, from, to, delay) {
    const near = sideToward(to, from.x, from.z);
    const [tipA, tipB] = yardEnds(to, near);
    const taken = [];
    let k = 0;
    list.forEach((f) => {
      if (!f || !f.st || f.st.ship !== from) return;
      const m = f.st.mode;
      if (m !== 'fight' && m !== 'guard' && m !== 'stand') return;
      const r0 = railSpot(to, near, lerp(-1.5, 2, k / 4), taken);
      taken.push(r0);
      const kk = Math.min(0.4, k * 0.09);
      f.st = {
        mode: 'fly',
        from,
        fx: f.st.x,
        fy: null,
        fz: f.st.z,
        to,
        tx: r0.x,
        tz: r0.z,
        tyaw: (near * PI) / 2,
        anchorShip: to,
        anchor: { x: lerp(tipA.x, tipB.x, kk), y: lerp(tipA.y, tipB.y, kk), z: lerp(tipA.z, tipB.z, kk) },
        t0: clock + delay + k * SET.stagger * 0.7,
        dur: SET.home,
        then: f.use === 'captain' ? 'proud' : 'idle',
        home: true,
      };
      k++;
    });
    return k;
  }
  // push her away from you, sideways (§3.4: 4 u/s for 1 s)
  function shove(ship, delay) {
    const p = getPlayer();
    if (!p || !ship) return;
    pushes = pushes.filter((q) => q.ship !== ship);
    const sd = (ship.x - p.x) * rightX(p.h) + (ship.z - p.z) * rightZ(p.h) >= 0 ? 1 : -1;
    pushes.push({ ship, vx: rightX(p.h) * sd * BOARD.pushApart.speed, vz: rightZ(p.h) * sd * BOARD.pushApart.speed, left: BOARD.pushApart.time, delay });
  }
  // the prize: a shower of gold from her deck onto yours
  function coinFountain(from, to) {
    if (!from || !to) return;
    const a = onShip(from, 0, deckOf(from) + 1.4, 0, new THREE.Vector3());
    for (let i = 0; i < SET.coins; i++) {
      const T = 0.8 + Math.random() * 0.4;
      const g = -18;
      const bx = to.x + (Math.random() - 0.5) * 2.2 + fwdX(to.h) * (Math.random() - 0.5) * 4;
      const bz = to.z + (Math.random() - 0.5) * 2.2 + fwdZ(to.h) * (Math.random() - 0.5) * 4;
      const by = deckOf(to) + waterY(to) + 0.1;
      const delay = (i / SET.coins) * 0.35;
      const sx = a.x + (Math.random() - 0.5) * 1.2;
      const sz = a.z + (Math.random() - 0.5) * 1.2;
      coins.push({ at: clock + delay, x: sx, y: a.y, z: sz, vx: (bx - sx) / T, vy: (by - a.y) / T - 0.5 * g * T, vz: (bz - sz) / T, life: T, g });
    }
  }
  const coins = []; // queued coin particles (released in render, in order)

  function finish(reason) {
    const p = getPlayer();
    const e = target;
    const was = kind;
    const endedPhase = phase;
    const wasInfo = reason === 'done' ? info : null;
    active = false;
    phase = null;
    // she can't fire straight back (§3.4)
    if (e && stillFighting(e) && e.reload && e.type) {
      const rl = num(e.type.reload, 2);
      e.reload.port = Math.max(num(e.reload.port, 0), rl);
      e.reload.star = Math.max(num(e.reload.star, 0), rl);
    }
    // raiders wait before trying again (§3.6)
    if (e && e.type && e.type.boarder && was === 'defend') {
      const cd = reason === 'cut' ? RAIDERS.cooldownCut : RAIDERS.cooldownFight;
      e.boardCooldown = Math.max(num(e.boardCooldown, 0), cd);
    }
    // a held defence opens the counter-board window: her lines stay on until it closes
    if (was === 'defend' && reason === 'done' && wasInfo && wasInfo.held && stillFighting(e)) {
      counterUntil = now() + RAIDERS.counterWindow;
      counterTarget = e;
      for (const h of hooks) h.hauler = null;
      shove(e, 0.2);
    } else dropAllHooks();
    if (reason === 'broke') popMid(was === 'defend' ? 'ROPES PARTED!' : 'SHE BROKE FREE!', was === 'defend' ? 'info' : 'bad', 2.4);
    // the visuals wind down; the helm captain comes back when they end
    outro = { until: clock + SET.outro };
    if (reason === 'done' && wasInfo && wasInfo.captured && was !== 'surrender' && was !== 'defend') {
      // the boarding party swings home from the prize
      const n = swingHome(attackers, brawl ? brawl.ship : e, p, 0.05);
      outro.until = clock + Math.max(SET.outro, 0.05 + SET.home + 0.15 + n * SET.stagger * 0.7);
    }
    if (reason === 'done' || reason === 'cut' || reason === 'broke') {
      // anyone still in the air lands first
      let lastLand = clock;
      for (const f of figs) if (f.use && f.st && f.st.mode === 'fly') lastLand = Math.max(lastLand, f.st.t0 + f.st.dur);
      outro.until = Math.max(outro.until, lastLand + 0.15);
      if (reason === 'broke') for (const f of partyFigs) if (f && f.st && f.st.mode === 'stand') f.st.act = 'idle';
    } else {
      // a cancel: everyone scatters at once
      for (const f of figs) if (f.use && f.st && f.st.mode !== 'tumble') poofFig(f);
      outro.until = clock;
    }
    last = makeLast({ reason, endedPhase, cut: reason === 'cut' ? (last && last.cut) || 'tap' : undefined });
    camPair = camPair || { p, e, side };
    emit('end', { kind: was, enemy: e, side, reason, result: wasInfo, phase: endedPhase, counterUntil, counterTarget });
    if (outro.until <= clock) endOutro();
  }
  function poofFig(f) {
    if (f.pivot.visible) {
      const w = f.pivot.position;
      puff(w.x, w.y + 0.6, w.z, 4, DUST, 1.6, 1.2, 0.35, 0.5, -2, true);
    }
    freeFig(f);
  }
  function endOutro() {
    for (const f of figs) {
      if (!f.use) continue;
      if (f.st && f.st.mode === 'tumble') continue; // finishes its fall, then frees itself
      freeFig(f);
    }
    if (helmHidden) hideHelm(false);
    outro = null;
    partyFigs = [];
    foeFigs = [];
    attackers = [];
    defenders = [];
    brawl = null;
    pairs = [];
    lazy.length = 0;
  }

  // ------------------------------------------------------------------------------- simulation
  function capSpeed(s, cap) {
    if (!s) return;
    if (s.speed > cap) s.speed = cap;
    if (s.speed < -cap) s.speed = -cap;
  }
  // Haul her toward the slot over `dur` (smoothstep). Whatever else moved her since our last write (land,
  // a third ship, a current) is kept as an offset, so land in the way leaves her short of the slot.
  function pullStep(p, u) {
    pull.offX += target.x - pull.lastX;
    pull.offZ += target.z - pull.lastZ;
    const slot = slotOf(p, target);
    const hT = pull.flip ? wrap(p.h + PI) : p.h;
    const k = smooth(u);
    target.x = lerp(pull.x0, slot.x, k) + pull.offX;
    target.z = lerp(pull.z0, slot.z, k) + pull.offZ;
    target.h = wrap(pull.h0 + wrap(hT - pull.h0) * k);
    target.speed = 0;
    pull.lastX = target.x;
    pull.lastZ = target.z;
  }
  // The glued pair (§3.4 swing..result): both move along h_p at BOARD.glueSpeed; boarding writes both
  // ships' x / z (main skips their own integration: moves()). Land or a third ship shoving either one
  // stops the pair for a moment.
  function gluePlayer(p, dt, checkTarget) {
    if (glue) {
      const moved = Math.hypot(p.x - glue.px, p.z - glue.pz) > 1e-4 || (checkTarget && glue.tx !== null && Math.hypot(target.x - glue.tx, target.z - glue.tz) > 1e-4);
      if (moved) glue.block = SET.glueBlock;
    } else glue = { px: p.x, pz: p.z, tx: null, tz: null, block: 0 };
    glue.block = Math.max(0, glue.block - dt);
    const v = glue.block > 0 ? 0 : BOARD.glueSpeed;
    p.x += fwdX(p.h) * v * dt;
    p.z += fwdZ(p.h) * v * dt;
    p.speed = v;
    glue.px = p.x;
    glue.pz = p.z;
    glue.tx = null;
    return v;
  }
  function glueStep(p, dt, holdTarget) {
    const v = gluePlayer(p, dt, holdTarget);
    const flip = !!(pull && pull.flip);
    if (holdTarget) {
      const slot = slotOf(p, target);
      target.x = slot.x;
      target.z = slot.z;
      target.h = flip ? wrap(p.h + PI) : p.h;
      target.speed = flip ? 0 : v;
      glue.tx = target.x;
      glue.tz = target.z;
    } else {
      // shoved apart: she keeps pace with you while she drifts off sideways (stepPushes)
      target.x += fwdX(p.h) * v * dt;
      target.z += fwdZ(p.h) * v * dt;
      target.speed = 0;
    }
  }
  function stepPushes(dt) {
    for (const q of pushes) {
      if (q.delay > 0) {
        q.delay -= dt;
        continue;
      }
      const k = Math.min(dt, q.left);
      if (q.ship && alive(q.ship) && !q.ship.captured) {
        q.ship.x += q.vx * k;
        q.ship.z += q.vz * k;
      }
      q.left -= dt;
    }
    pushes = pushes.filter((q) => q.left > 0);
  }
  const enemyKept = () => kind === 'surrender' || (info && (info.captured || (kind === 'defend' && !info.overrun)));

  // ------------------------------------------------------------------------------- the API
  const api = {
    prepare(opts = {}) {
      if (disposed) return;
      const o = opts && typeof opts === 'object' ? opts : {};
      party = {
        captain: o.captain && typeof o.captain === 'object' ? o.captain : null,
        crew: Array.isArray(o.crew) ? o.crew.filter((x) => x && typeof x === 'object').slice(0, BOARD.partyShown) : [],
      };
      raiderOpts = Array.isArray(o.raiders) ? o.raiders.filter((x) => x && typeof x === 'object').slice(0, BOARD.defendersShown) : [];
      const want = [captainLook()];
      for (let i = 0; i < BOARD.partyShown; i++) want.push(crewLook(i));
      for (const r of raiderOpts) want.push(armed(r));
      const counts = new Map();
      for (const w of want) {
        const k = keyOf(w);
        if (!counts.has(k)) counts.set(k, { opts: w, n: 0 });
        counts.get(k).n++;
      }
      // people of looks nobody asked for any more go (unless a set-piece is using them)
      if (!active && !outro) for (const f of [...figs]) if (!f.use && !counts.has(f.key)) disposeFig(f);
      queue.length = 0;
      for (const [k, { opts: w, n }] of counts) for (let i = figs.filter((f) => f.key === k).length; i < n; i++) queue.push(w);
    },

    start(opts = {}) {
      if (disposed || active) return false;
      const o = opts && typeof opts === 'object' ? opts : {};
      const k = KINDS.includes(o.kind) ? o.kind : null;
      const e = o.enemy;
      const p = getPlayer();
      if (!k || !e || !p || !e.mesh || !p.mesh || e === p || !alive(e) || !alive(p) || e.captured || e.escaped) return false;
      if (outro) endOutro(); // a previous set-piece still winding down ends now
      kind = k;
      target = e;
      const rel = (e.x - p.x) * rightX(p.h) + (e.z - p.z) * rightZ(p.h);
      side = o.side === 1 || o.side === -1 ? o.side : rel >= 0 ? 1 : -1;
      reelDur = num(o.reel, 0) > 0 ? o.reel : BOARD.reel[0];
      getSidesFn = typeof o.getSides === 'function' ? o.getSides : null;
      heaveBonus = 0;
      heaves = 0;
      lastHeaveAt = -10;
      res = null;
      info = null;
      cutTaps = 0;
      holdDown = false;
      holdT = 0;
      pips = [];
      pipIdx = 0;
      shown.enemy = null;
      shown.player = null;
      pull = null;
      glue = null;
      brawl = null;
      attackers = [];
      defenders = [];
      partyFigs = [];
      foeFigs = [];
      pairs = [];
      lazy.length = 0;
      active = true;
      last = makeLast();
      // a counter-board uses the raider's lines still on; anything else throws its own
      const keepLines = k === 'counter' && counterTarget === e;
      if (!keepLines) for (const h of hooks) h.state = h.state === 'drop' ? 'drop' : 'off';
      counterUntil = -Infinity;
      counterTarget = null;
      pushes = pushes.filter((q) => q.ship !== e && q.ship !== p);
      camPair = { p, e, side, brawl: k === 'defend' || k === 'surrender' ? p : e };
      if (k === 'defend') startThreat();
      else if (k === 'counter') startSwing();
      else startHook();
      return true;
    },

    step(dt) {
      if (disposed) return;
      const d = num(dt, 0);
      if (!(d > 0)) return;
      clock += d;
      stepPushes(d);
      if (!active) {
        // the counter-board window closes (or she sails off): the raider casts off her lines
        if (counterTarget) {
          const p = getPlayer();
          const far = !p || Math.hypot(counterTarget.x - p.x, counterTarget.z - p.z) > SET.breakFar;
          if (now() >= counterUntil || !stillFighting(counterTarget) || far) {
            counterTarget = null;
            dropAllHooks();
          }
        }
        if (outro && clock >= outro.until) endOutro();
        return;
      }
      const p = getPlayer();
      if (!p || !alive(p)) return void api.cancel('player');
      if (!target || !alive(target)) return void api.cancel('sunk');
      if (target.escaped || (target.captured && phase !== 'result') || (scene && target.mesh && !target.mesh.parent)) return void api.cancel('gone');
      phaseT += d;
      switch (phase) {
        case 'threat': {
          capSpeed(p, SET.capThreat);
          capSpeed(target, SET.capThreat);
          for (const h of hooks) if (h.state === 'fly' && clock - h.t0 >= SET.hookFly) landHook(h);
          if (holdDown) {
            holdT += d;
            if (holdT >= RAIDERS.cutHold - 1e-9) return void doCut('hold');
          }
          if (phaseT >= phaseDur - 1e-9) startReel();
          break;
        }
        case 'hook': {
          capSpeed(p, SET.capHook);
          capSpeed(target, SET.capHook);
          for (const h of hooks) if (h.state === 'fly' && clock - h.t0 >= SET.hookFly) landHook(h);
          if (phaseT >= phaseDur - 1e-9) startReel();
          break;
        }
        case 'reel': {
          capSpeed(p, SET.capHook);
          for (const h of hooks) if (h.state === 'fly') landHook(h);
          pullStep(p, phaseT / phaseDur);
          if (phaseT >= phaseDur - 1e-9) {
            // land in the way? (resolveLand kept her off the slot)
            const slot = slotOf(p, target);
            if (Math.hypot(target.x - p.x, target.z - p.z) > slot.d + BOARD.breakFree) return void api.cancel('broke');
            pull.offX = 0;
            pull.offZ = 0;
            pull.lastX = target.x;
            pull.lastZ = target.z;
            pullStep(p, 1);
            if (kind === 'surrender') startResult();
            else startSwing();
          }
          break;
        }
        case 'swing': {
          if (kind === 'counter' && pull && phaseT < phaseDur) {
            // her lines haul the raider back alongside while you swing across
            gluePlayer(p, d, false);
            pullStep(p, phaseT / phaseDur);
          } else glueStep(p, d, true);
          if (phaseT >= phaseDur - 1e-9) startBrawl();
          break;
        }
        case 'brawl': {
          glueStep(p, d, true);
          while (pipIdx < pips.length && pips[pipIdx].t <= phaseT + 1e-9) firePip(pips[pipIdx++]);
          if (phaseT >= phaseDur - 1e-9) startResult();
          break;
        }
        case 'result': {
          glueStep(p, d, enemyKept());
          if (phaseT >= phaseDur - 1e-9) finish('done');
          break;
        }
        default:
          break;
      }
    },

    render(t, dt) {
      if (disposed) return;
      const vdt = Math.max(0, Math.min(0.1, num(dt, 0)));
      const tt = num(t, 0);
      // prebuild: one person per frame
      if (lazy.length) buildLazy(false);
      else if (queue.length && !active) makeFig(queue.shift());
      // camera ease (none while raiders' hooks bite: you are still sailing and shooting)
      const wantCam = active && phase !== 'threat' ? 1 : 0;
      if (reducedMotion()) camBlend = wantCam;
      else if (wantCam > camBlend) camBlend = Math.min(1, camBlend + vdt / SET.camIn);
      else camBlend = Math.max(0, camBlend - vdt / SET.camOut);
      if (camBlend <= 0 && !active) camPair = null;
      updateFade();
      releaseCoins();
      renderPeople(tt);
      renderRig(tt);
    },

    camera(aspect, from) {
      if (camBlend <= 0 || !camPair || !camPair.p) return null;
      const p = camPair.p;
      const e = camPair.e && camPair.e.mesh ? camPair.e : null;
      const sd = camPair.side || 1;
      const asp = num(aspect, num(c.camera && c.camera.aspect, 16 / 9));
      const tune = c.cameraTune && typeof c.cameraTune === 'object' ? c.cameraTune[asp < 1 ? 'port' : 'land'] : null;
      const K = tune ? { ...(asp < 1 ? CAM.port : CAM.land), ...tune } : asp < 1 ? CAM.port : CAM.land;
      const mx = e ? (p.x + e.x) / 2 : p.x;
      const mz = e ? (p.z + e.z) / 2 : p.z;
      const sep = e ? Math.hypot(e.x - p.x, e.z - p.z) : 0;
      const size = Math.max(lenOf(p), e ? lenOf(e) : 0);
      let dist = K.dist + Math.max(0, sep - 4.5) * K.sepGain + Math.max(0, size - 10) * K.sizeGain;
      // the capture "punch": in a little and back
      const rm = reducedMotion();
      if (!rm && clock - kickAt < 0.6) dist *= 1 - CAM.kick * Math.sin(PI * clamp((clock - kickAt) / 0.6, 0, 1));
      const lx = rightX(p.h) * sd;
      const lz = rightZ(p.h) * sd;
      const fx = fwdX(p.h);
      const fz = fwdZ(p.h);
      const ce = Math.cos(K.el);
      const cy = Math.cos(K.yaw);
      const sy = Math.sin(K.yaw);
      // look between the decks, leaning toward the deck the brawl is on, from beyond that deck (so
      // nothing stands between the camera and the fight: her far side when you board, yours when
      // raiders board you)
      const b = camPair.brawl && camPair.brawl.mesh ? camPair.brawl : e || p;
      const away = b === p ? -1 : 1;
      const lookX = lerp(mx, b.x, K.toBrawl);
      const lookZ = lerp(mz, b.z, K.toBrawl);
      const pos = new THREE.Vector3(lookX + (away * lx * cy - fx * sy) * ce * dist, Math.sin(K.el) * dist + K.lookUp, lookZ + (away * lz * cy - fz * sy) * ce * dist);
      const look = new THREE.Vector3(lookX, K.lookUp + deckOf(b) * 0.5, lookZ);
      const k = rm ? 1 : smooth(camBlend);
      if (k < 1 && from && from.pos && from.look && Number.isFinite(from.pos.x) && Number.isFinite(from.look.x)) {
        // ease along an orbit round the look point (not a straight line, which can cut through her
        // rigging): the eye's bearing, elevation and distance are blended; the result is final (blend 1)
        const L = new THREE.Vector3().lerpVectors(from.look, look, k);
        _v.subVectors(from.pos, from.look);
        _v2.subVectors(pos, look);
        const ra = Math.max(1e-3, _v.length());
        const rb = Math.max(1e-3, _v2.length());
        const azA = Math.atan2(_v.x, _v.z);
        const azB = Math.atan2(_v2.x, _v2.z);
        const elA = Math.asin(clamp(_v.y / ra, -1, 1));
        const elB = Math.asin(clamp(_v2.y / rb, -1, 1));
        const az = azA + wrap(azB - azA) * k;
        const el = lerp(elA, elB, k);
        const r = lerp(ra, rb, k);
        pos.set(L.x + Math.sin(az) * Math.cos(el) * r, L.y + Math.sin(el) * r, L.z + Math.cos(az) * Math.cos(el) * r);
        return { pos, look: L, blend: 1 };
      }
      return { pos, look, blend: k };
    },

    heave() {
      // (only your own attack's reel: a struck ship comes quietly, a raider reels you in)
      if (!active || phase !== 'reel' || kind !== 'attack') return heaveBonus;
      heaves++;
      heaveBonus = Math.min(BOARD.heaveMax, Math.round((heaveBonus + BOARD.heaveStep) * 1e6) / 1e6);
      lastHeaveAt = clock;
      const p = getPlayer();
      if (p) {
        sfx('heave', p.x, p.z, { pitch: 1 + 0.05 * Math.min(heaves, 8) });
        popMid('HEAVE!', 'info', 2.2);
      }
      return heaveBonus;
    },

    cut(how = 'tap') {
      if (!active || kind !== 'defend' || phase !== 'threat') return false;
      if (how === 'hit') return doCut('hit');
      cutTaps++;
      const i = hooks.findIndex((h) => h.state === 'set' || h.state === 'fly');
      if (i >= 0) {
        snapOne(i);
        chop(i);
      }
      const p = getPlayer();
      if (p) sfx('cut', p.x, p.z, { volume: 0.6 });
      if (cutTaps >= RAIDERS.cutTaps) return doCut('taps');
      return false;
    },

    cutHold(down) {
      holdDown = !!down && active && kind === 'defend' && phase === 'threat';
      if (!holdDown) holdT = 0;
    },

    skip() {
      if (!active || phase !== 'brawl') return false;
      startResult();
      return true;
    },

    cancel(reason = 'cancel') {
      if (!active) {
        if (outro) endOutro();
        return false;
      }
      finish(typeof reason === 'string' && reason && reason !== 'done' ? reason : 'cancel');
      return true;
    },

    // Tests: run the rest of the timeline up to 'result' at once.
    resolveNow() {
      for (let i = 0; i < 2400 && active && phase !== 'result'; i++) {
        if (phase === 'brawl') {
          startResult();
          break;
        }
        api.step(1 / 120);
      }
      return active && phase === 'result';
    },

    odds(sides, opts = {}) {
      const o = opts && typeof opts === 'object' ? opts : {};
      const k = KINDS.includes(o.kind) ? o.kind : 'attack';
      const s = sides && typeof sides === 'object' ? sides : {};
      if (o.surrendered || k === 'surrender') {
        const dc = Math.max(0, Math.floor(num(s.def && s.def.crew, 0)));
        const ac = Math.max(0, Math.floor(num(s.att && s.att.crew, 0)));
        return { P: 0, M: 1, D: 0, R: Infinity, defLoss: 0, attLoss: 0, defLeft: dc, attLeft: ac, hullDmg: 0, captured: true, overrun: false, attackerStrikes: false, label: 'take' };
      }
      const r =
        k === 'defend'
          ? resolveBoarding(s.att, s.def, { enemyAttacks: true, home: true, playerDefends: true })
          : resolveBoarding(s.att, s.def, { heave: num(o.heave, 0), playerAttacks: true });
      return { ...r, label: previewLabel(r) };
    },

    moves(ship) {
      if (!active || !ship) return false;
      const glued = phase === 'swing' || phase === 'brawl' || phase === 'result';
      if (ship === target) return glued || phase === 'reel';
      return glued && ship === getPlayer();
    },
    // The crew count a tag / the crew chip shows while the brawl ticks it down (pips so far), else null:
    // main sets e.crewShown = boarding.crewShown(e) ?? crewOf(e).
    crewShown(ship) {
      if (!active || !ship || (phase !== 'brawl' && phase !== 'result')) return null;
      const enemySide = ship === target;
      if (!enemySide && ship !== getPlayer()) return null;
      return enemySide ? shown.enemy : shown.player;
    },
    // separateShips must leave the pair (player, ship) alone: she is glued alongside, or being shoved off
    apart(ship) {
      if (!ship) return false;
      if (active && ship === target) return true;
      return pushes.some((q) => q.ship === ship);
    },
    suspends(ship) {
      return !!ship && active && ship === target && (phase === 'reel' || phase === 'swing' || phase === 'brawl' || phase === 'result');
    },

    onResolve: on('resolve'),
    onResult: on('result'),
    onPip: on('pip'),
    onCut: on('cut'),
    onEnd: on('end'),
    onPhase: on('phase'),

    // Hide everything at once (level change, menu, shipyard): no callbacks, no camera.
    clear() {
      active = false;
      phase = null;
      kind = null;
      target = null;
      for (const f of figs) freeFig(f);
      for (const h of hooks) h.state = 'off';
      outro = null;
      pushes = [];
      coins.length = 0;
      counterTarget = null;
      counterUntil = -Infinity;
      camBlend = 0;
      camPair = null;
      clearFade();
      partyFigs = [];
      foeFigs = [];
      attackers = [];
      defenders = [];
      brawl = null;
      pairs = [];
      lazy.length = 0;
      // let-go ropes expire on boarding's own clock, which only step() advances; outside a battle it
      // stands still, so they would hang in the shipyard or by the title ship until the next battle
      letGo.length = 0;
      swingRopes.length = 0;
      rig.visible = false;
      if (helmHidden) hideHelm(false);
    },

    // Let go of every prebuilt person (leaving the battle for the title screen or the shipyard; call it
    // before releaseSharedPeople()). The module stays usable: the next prepare() builds them again.
    release() {
      if (disposed) return;
      api.clear();
      for (const f of [...figs]) disposeFig(f);
      queue.length = 0;
      dropFadeCopies();
    },

    dispose() {
      if (disposed) return;
      api.clear();
      disposed = true;
      for (const f of [...figs]) disposeFig(f);
      queue.length = 0;
      dropFadeCopies();
      if (rig.parent) rig.parent.remove(rig);
      rigGeo.dispose();
      hookGeo.dispose();
      rigMat.dispose();
      for (const k of Object.keys(listeners)) listeners[k].length = 0;
    },

    get active() {
      return active;
    },
    get phase() {
      return active ? phase : null;
    },
    get kind() {
      return active ? kind : null;
    },
    get target() {
      return active ? target : null;
    },
    get side() {
      return active ? side : 0;
    },
    get truce() {
      return truceNow();
    },
    get locked() {
      return lockedNow();
    },
    get heaveBonus() {
      return heaveBonus;
    },
    get heaves() {
      return heaves;
    },
    get last() {
      return last;
    },
    get counterUntil() {
      return counterUntil;
    },
    get counterTarget() {
      return counterTarget && now() < counterUntil && stillFighting(counterTarget) ? counterTarget : null;
    },
    get counterLeft() {
      return counterTarget ? Math.max(0, counterUntil - now()) : 0;
    },
    get phaseTime() {
      return active ? phaseT : 0;
    },
    get phaseDur() {
      return active ? phaseDur : 0;
    },
    get cutProgress() {
      if (!active || kind !== 'defend' || phase !== 'threat') return 0;
      return clamp(Math.max(cutTaps / RAIDERS.cutTaps, holdT / RAIDERS.cutHold), 0, 1);
    },
    get turnScale() {
      if (!active) return 1;
      if (lockedNow()) return 0;
      return phase === 'reel' ? SET.turnReel : 1;
    },
    get speedCap() {
      if (!active) return Infinity;
      if (phase === 'threat') return SET.capThreat;
      if (phase === 'hook' || phase === 'reel') return SET.capHook;
      return BOARD.glueSpeed;
    },
    get figures() {
      return figs.filter((f) => f.pivot.visible).length;
    },
    get built() {
      return figs.length;
    },
    get pending() {
      return queue.length + lazy.length;
    },
  };

  function doCut(how) {
    if (!active || phase !== 'threat') return false;
    const p = getPlayer();
    for (let i = 0; i < HOOKS; i++) if (snapOne(i)) chop(i);
    sfx('cut', p ? p.x : target.x, p ? p.z : target.z);
    popMid('ROPES CUT!', 'info', 2.4);
    emit('cut', { enemy: target, how, kind });
    // she veers off; her crew shake their cutlasses at you
    shove(target, 0);
    for (const f of foeFigs) if (f && f.st && f.st.mode === 'stand') f.st.act = 'point';
    for (const f of partyFigs) if (f && f.st) Object.assign(f.st, { mode: 'stand', act: 'cheer', since: clock });
    last = makeLast({ cut: how });
    finish('cut');
    return true;
  }
  // the hand by line i takes a swing at it
  function chop(i) {
    const h = hooks[i];
    let best = null;
    let bd = Infinity;
    for (const f of partyFigs) {
      if (!f || !f.st || f.st.ship !== getPlayer()) continue;
      const d = h && h.toL ? Math.abs(f.st.z - h.toL.z) : 0;
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    if (best) best.st.chop = clock;
  }

  // ------------------------------------------------------------------------------- drawing people
  const _pos = new THREE.Vector3();
  const _w0 = new THREE.Vector3();
  const _w1 = new THREE.Vector3();
  const _c1 = new THREE.Vector3();
  const _c2 = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const swingRopes = []; // [{ a, b }] (anchor, hand) this frame
  const letGo = []; // ropes let go on landing: { anchorShip, anchor, end: Vector3, since }
  const haulHands = new Map(); // hook index → hand world position
  const ropePool = Array.from({ length: 12 }, () => ({ a: new THREE.Vector3(), b: new THREE.Vector3() }));
  const handPool = Array.from({ length: HOOKS }, () => new THREE.Vector3());

  function placeOnDeck(f, ship, x, y, z, yaw) {
    shipMatrix(ship, _m);
    _m.decompose(_v, _q, _s);
    _pos.set(x, y, z).applyMatrix4(_m);
    f.pivot.position.copy(_pos);
    _q2.setFromAxisAngle(_up, yaw);
    f.pivot.quaternion.copy(_q).multiply(_q2);
  }
  // the swing path, feet: a cubic Bézier that leaps up off the deck, sails over both rails and drops
  // onto the deck spot (world points recomputed every frame: both ships move and roll)
  function swingPoint(st, u, out) {
    const a = onShip(st.from, st.fx, st.fy !== null && st.fy !== undefined ? st.fy : deckOf(st.from), st.fz, _w0);
    const b = onShip(st.to, st.tx, deckOf(st.to), st.tz, _w1);
    const top = Math.max(railOf(st.from) + waterY(st.from), railOf(st.to) + waterY(st.to), a.y, b.y);
    _dir.set(b.x - a.x, 0, b.z - a.z);
    const span = _dir.length() || 1;
    _dir.multiplyScalar(1 / span);
    _c1.set(a.x + _dir.x * span * 0.12, top + 1.55, a.z + _dir.z * span * 0.12);
    _c2.set(b.x - _dir.x * span * 0.22, top + 1.25, b.z - _dir.z * span * 0.22);
    const i = 1 - u;
    return out.set(
      i * i * i * a.x + 3 * i * i * u * _c1.x + 3 * i * u * u * _c2.x + u * u * u * b.x,
      i * i * i * a.y + 3 * i * i * u * _c1.y + 3 * i * u * u * _c2.y + u * u * u * b.y,
      i * i * i * a.z + 3 * i * i * u * _c1.z + 3 * i * u * u * _c2.z + u * u * u * b.z,
    );
  }

  function land(f, st) {
    const fighting = st.then === 'fight';
    f.st = {
      mode: fighting ? (phase === 'brawl' ? 'fight' : 'guard') : 'stand',
      ship: st.to,
      x: st.tx,
      z: st.tz,
      y: null,
      yaw: st.tyaw,
      act: fighting ? null : st.then,
      since: clock,
      landed: clock,
    };
    const w = onShip(st.to, st.tx, deckOf(st.to), st.tz, _w0);
    puff(w.x, w.y + 0.05, w.z, 5, DUST, 2.0, 0.9, 0.3, 0.45, -3, true);
    if (st.anchorShip && letGo.length < 6) letGo.push({ anchorShip: st.anchorShip, anchor: st.anchor, end: handPosition(f.person, -1, new THREE.Vector3()), since: clock, toward: st.from });
    if (st.pendingFall) knockOver(f);
    if (fighting && phase === 'brawl') rebuildPairs();
  }

  function renderPeople(t) {
    let nRopes = 0;
    haulHands.clear();
    const rm = reducedMotion();
    for (let fi = 0; fi < figs.length; fi++) {
      const f = figs[fi];
      const st = f.st;
      if (!f.use || !st || st.mode === 'hidden') {
        f.pivot.visible = false;
        continue;
      }
      const person = f.person;
      const phaseOff = (fi * 0.37) % 1;
      f.pivot.scale.set(1, 1, 1);
      person.position.set(0, 0, 0);
      person.rotation.set(0, 0, 0);
      if (st.mode === 'fly') {
        const u = (clock - st.t0) / st.dur;
        if (u < 0) {
          // waiting his turn: up on his toes at the rail, cutlass up
          placeOnDeck(f, st.from, st.fx, st.fy !== null && st.fy !== undefined ? st.fy : deckOf(st.from), st.fz, (sideToward(st.from, st.to.x, st.to.z) * PI) / 2);
          animatePerson(person, t, st.home ? 'idle' : 'cheer', { phase: phaseOff });
          f.pivot.visible = true;
          continue;
        }
        if (u >= 1) {
          land(f, st);
          if (f.st.mode === 'knock' || !f.use) continue;
        } else {
          const k = ease(u);
          swingPoint(st, k, _pos);
          f.pivot.position.copy(_pos);
          const yaw = Math.atan2(_w1.x - _w0.x, _w1.z - _w0.z);
          // lean back as he leaves, forward as he comes down
          _e.set(-0.35 + 0.7 * k, yaw, 0, 'YXZ');
          f.pivot.quaternion.setFromEuler(_e);
          animatePerson(person, t, 'swing', { phase: phaseOff });
          f.pivot.visible = true;
          f.pivot.updateMatrixWorld(true);
          if (nRopes < ropePool.length) {
            const r = ropePool[nRopes++];
            onShip(st.anchorShip, st.anchor.x, st.anchor.y, st.anchor.z, r.a);
            handPosition(person, -1, r.b);
            swingRopes.push(r);
          }
          continue;
        }
      }
      const s2 = f.st;
      if (s2.mode === 'knock') {
        const u = clamp((clock - s2.since) / SET.knock, 0, 1);
        const x = lerp(s2.x0, s2.x1, ease(u));
        const y = deckOf(s2.ship) + (railOf(s2.ship) + 0.05 - deckOf(s2.ship)) * smooth(u) + 0.35 * Math.sin(PI * u);
        placeOnDeck(f, s2.ship, x, y, s2.z, s2.yaw);
        animatePerson(person, t, 'fall', { since: s2.since });
        f.pivot.visible = true;
        if (u >= 1) goOverboard(f);
        continue;
      }
      if (s2.mode === 'tumble') {
        const a = clock - s2.since;
        if (a >= 0.8) {
          const x = s2.p0.x + s2.vx * 0.8;
          const z = s2.p0.z + s2.vz * 0.8;
          foam(x, s2.water + 0.2, z, 10, 3, 6, 0.5, 0.7);
          sfx('overboard', x, z);
          freeFig(f);
          continue;
        }
        f.pivot.position.set(s2.p0.x + s2.vx * a, s2.p0.y + s2.vy * a - 13 * a * a, s2.p0.z + s2.vz * a);
        _q.setFromAxisAngle(_up, s2.yaw);
        _v.set(s2.ox, 0, s2.oz).cross(_up).normalize();
        _q2.setFromAxisAngle(_v, -1.15 * TAU * smooth(a / 0.8) * 0.98);
        f.pivot.quaternion.copy(_q2).multiply(_q);
        person.position.set(0, -0.6 * person.scale.y, 0);
        animatePerson(person, t, 'fall', { since: s2.since });
        f.pivot.visible = true;
        continue;
      }
      if (s2.mode === 'hop') {
        // the captain leaps down from the quarterdeck to the fight
        const u = clamp((clock - s2.since) / s2.dur, 0, 1);
        const x = lerp(s2.x0, s2.x, ease(u));
        const z = lerp(s2.z0, s2.z, ease(u));
        const y = lerp(s2.y0, deckOf(s2.ship), u) + 0.9 * Math.sin(PI * u);
        placeOnDeck(f, s2.ship, x, y, z, Math.atan2(s2.x - s2.x0, s2.z - s2.z0));
        animatePerson(person, t, u < 1 ? 'swing' : 'fight', { phase: phaseOff });
        f.pivot.visible = true;
        if (u >= 1) {
          const then = s2.then;
          f.st = { mode: phase === 'brawl' ? 'fight' : 'guard', ship: s2.ship, x: s2.x, z: s2.z, yaw: s2.yaw, since: clock, landed: clock };
          const w = onShip(s2.ship, s2.x, deckOf(s2.ship), s2.z, _w0);
          puff(w.x, w.y + 0.05, w.z, 5, DUST, 2.0, 0.9, 0.3, 0.45, -3, true);
          if (then) settle([f], then);
          if (s2.pendingFall) knockOver(f);
          if (phase === 'brawl') rebuildPairs();
        }
        continue;
      }
      if (s2.mode === 'run') {
        const u = clamp((clock - s2.since) / s2.dur, 0, 1);
        const x = lerp(s2.x0, s2.x, smooth(u));
        const z = lerp(s2.z0, s2.z, smooth(u));
        const moving = Math.hypot(s2.x - s2.x0, s2.z - s2.z0) > 0.05;
        placeOnDeck(f, s2.ship, x, deckOf(s2.ship), z, u < 1 && moving ? Math.atan2(s2.x - s2.x0, s2.z - s2.z0) : s2.yaw);
        animatePerson(person, t, u < 1 && moving ? 'run' : 'fight', { phase: phaseOff, speed: 1.6 });
        f.pivot.visible = true;
        if (u >= 1) {
          const then = s2.then;
          f.st = { mode: phase === 'brawl' ? 'fight' : s2.next || 'guard', ship: s2.ship, x: s2.x, z: s2.z, yaw: s2.yaw, since: clock };
          if (then) settle([f], then);
          if (s2.pendingFall) knockOver(f);
        }
        continue;
      }
      // standing on a deck: guard / fight / stand
      let x = s2.x;
      let z = s2.z;
      const yaw = s2.yaw;
      let y = s2.y !== null && s2.y !== undefined ? s2.y : deckOf(s2.ship);
      let act = s2.act || 'idle';
      let opts = { phase: phaseOff };
      if (s2.mode === 'guard') {
        // guard up, bouncing on his toes (the fight loop held near its guard)
        const q = 0.12 + 0.05 * Math.sin(t * 7 + phaseOff * 6);
        if (s2.chop !== undefined && clock - s2.chop < 0.45) {
          // a swing at the rope (the slash of the fight loop)
          animatePerson(person, FIGHT.hit - 0.15 + ((clock - s2.chop) / 0.45) * 0.3, 'fight', { phase: 0 });
        } else animatePerson(person, q, 'fight', { phase: 0 });
        y += 0.02 * Math.abs(Math.sin(t * 7 + phaseOff * 6));
        act = null;
      } else if (s2.mode === 'fight') {
        // his man went over the side: a cheer, then he gloats
        if (s2.won !== undefined) act = clock - s2.won < 0.9 ? 'cheer' : 'proud';
        else {
          act = 'fight';
          opts = { phase: fightPhase(f) };
        }
      } else if (act === 'haul') {
        opts = { phase: phaseOff, speed: clock - lastHeaveAt < SET.heaveTug ? 2.4 : 1 };
      }
      // reeling back from a blow
      let tilt = 0;
      if (s2.stagger !== undefined && clock - s2.stagger < 0.4) {
        const u = (clock - s2.stagger) / 0.4;
        const k = Math.sin(PI * u);
        x -= Math.sin(yaw) * 0.28 * k;
        z -= Math.cos(yaw) * 0.28 * k;
        tilt = -0.35 * k;
        if (!s2.starred) {
          s2.starred = true;
          stars(onShip(s2.ship, s2.x, y + 1.15, s2.z, _w0), 4);
        }
      } else if (s2.stagger !== undefined) {
        s2.stagger = undefined;
        s2.starred = false;
      }
      placeOnDeck(f, s2.ship, x, y, z, yaw);
      if (tilt) {
        _q2.setFromAxisAngle(_xAxis, tilt);
        f.pivot.quaternion.multiply(_q2);
      }
      // a squash as he lands; a pop as he comes up on deck
      if (!rm && s2.landed !== undefined && clock - s2.landed < 0.16) {
        const k = Math.sin((PI * (clock - s2.landed)) / 0.16) * 0.16;
        f.pivot.scale.set(1 + k * 0.6, 1 - k, 1 + k * 0.6);
      } else if (!rm && s2.appear !== undefined && clock - s2.appear < SET.popIn) {
        const u = (clock - s2.appear) / SET.popIn;
        const k = u < 0.7 ? smooth(u / 0.7) * 1.12 : 1.12 - 0.12 * smooth((u - 0.7) / 0.3);
        f.pivot.scale.set(1, Math.max(0.05, k), 1);
        if (!s2.puffed) {
          s2.puffed = true;
          const w = onShip(s2.ship, s2.x, y, s2.z, _w0);
          puff(w.x, w.y + 0.1, w.z, 3, DUST, 1.2, 0.6, 0.22, 0.35, -2, true);
        }
      }
      if (act) animatePerson(person, t, act, opts);
      f.pivot.visible = true;
      // hauling: the line runs to his hands
      if (act === 'haul') {
        const hi = hooks.findIndex((h) => h.hauler === f);
        if (hi >= 0) {
          f.pivot.updateMatrixWorld(true);
          haulHands.set(hi, handPosition(person, -1, handPool[hi]));
        }
      }
    }
    // let-go ropes swing back toward their own ship and are hauled out of sight
    for (let i = letGo.length - 1; i >= 0; i--) {
      const L = letGo[i];
      const a = (clock - L.since) / SET.release;
      if (a >= 1 || !L.anchorShip || !L.anchorShip.mesh || nRopes >= ropePool.length) {
        letGo.splice(i, 1);
        continue;
      }
      const r = ropePool[nRopes++];
      onShip(L.anchorShip, L.anchor.x, L.anchor.y, L.anchor.z, r.a);
      // hanging point: below the anchor, a little back toward her own ship, swinging past and settling
      _v.subVectors(L.end, r.a);
      const len = _v.length() * (1 - 0.45 * smooth(a));
      const back = L.toward ? Math.atan2(L.toward.x - r.a.x, L.toward.z - r.a.z) : 0;
      const sw = Math.sin(a * PI * 1.6) * (1 - a) * 0.9;
      _v2.set(Math.sin(back) * sw, -1, Math.cos(back) * sw).normalize();
      _v.normalize().lerp(_v2, smooth(a * 1.4)).normalize().multiplyScalar(len);
      r.b.copy(r.a).add(_v);
      swingRopes.push(r);
    }
    clangs(t);
  }

  const fightPhase = (f) => ((figs.indexOf(f) * 0.37) % 1) + (f.use === 'foe' ? 0.5 : 0);
  function stars(w, n) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + Math.random() * 0.5;
      spark('glow', STAR_COLORS[k % STAR_COLORS.length], w.x, w.y, w.z, Math.cos(a) * 2.6, 1.2 + Math.random() * 1.6, Math.sin(a) * 2.6, 0.32, 0.11 + Math.random() * 0.05, -4);
    }
  }
  // clang stars where the blades meet (FIGHT.hit of each fighter's loop), dust, and the clash now and then
  function clangs(t) {
    if (phase !== 'brawl' || !brawl) return;
    for (const pr of pairs) {
      const a = pr.a;
      const d = pr.d;
      if (!a.st || !d.st || a.st.mode !== 'fight' || d.st.mode !== 'fight' || a.st.won !== undefined || d.st.won !== undefined) {
        pr.qa = -1;
        pr.qd = -1;
        continue;
      }
      const offA = fightPhase(a);
      const offD = fightPhase(d);
      const qa = frac((t + offA) / FIGHT.period);
      const qd = frac((t + offD) / FIGHT.period);
      const hitA = pr.qa >= 0 && pr.qa < FIGHT.hit && qa >= FIGHT.hit;
      const hitD = pr.qd >= 0 && pr.qd < FIGHT.hit && qd >= FIGHT.hit;
      pr.qa = qa;
      pr.qd = qd;
      if (!hitA && !hitD) continue;
      _w0.copy(a.pivot.position).lerp(d.pivot.position, 0.5);
      _w0.y += 0.95;
      stars(_w0, 5);
      spark('glow', 0xffffff, _w0.x, _w0.y, _w0.z, 0, 0.4, 0, 0.12, 0.3, 0);
      if (clock - lastClash > SET.clashGap) {
        lastClash = clock;
        sfx('clash', _w0.x, _w0.z, { volume: 0.7, pitch: 0.92 + Math.random() * 0.16 });
      }
      // scuffling feet kick up the deck dust
      const fx = (a.pivot.position.x + d.pivot.position.x) / 2;
      const fz = (a.pivot.position.z + d.pivot.position.z) / 2;
      puff(fx, a.pivot.position.y + 0.1, fz, 2, DUST, 1.6, 0.7, 0.32, 0.6, -1.5, true);
    }
  }
  // the prize gold, released over a third of a second (visual time follows simulated time here)
  function releaseCoins() {
    for (let i = 0; i < coins.length; i++) {
      const q = coins[i];
      if (q.at > clock) continue;
      spark('glow', i % 3 ? GOLD : 0xffe68a, q.x, q.y, q.z, q.vx, q.vy, q.vz, q.life, 0.26, q.g, false, true);
      if (i % 4 === 0) spark('glow', 0xffffff, q.x, q.y, q.z, q.vx * 0.6, q.vy * 0.6, q.vz * 0.6, 0.35, 0.12, q.g);
      coins.splice(i--, 1);
    }
  }

  // ------------------------------------------------------------------------------- drawing the rig
  const _ra = new THREE.Vector3();
  const _rb = new THREE.Vector3();
  const _hw = new THREE.Vector3();
  function renderRig(t) {
    let any = false;
    let r = 0;
    for (let i = 0; i < HOOKS; i++) {
      const h = hooks[i];
      if (h.state === 'off') {
        writeHook(i, null);
        continue;
      }
      if (h.state === 'drop') {
        const a = clock - h.drop.t0;
        const w = hookWorld(h, _hw);
        if (!h.drop.splashed && w.y < waterY(h.from)) {
          h.drop.splashed = true;
          foam(w.x, w.y + 0.2, w.z, 4, 1.4, 3, 0.3, 0.5);
        }
        if (a > 0.9 || w.y < -3 || !h.from || !h.from.mesh) {
          h.state = 'off';
          writeHook(i, null);
          continue;
        }
        _e.set(h.drop.spin * a, h.drop.spin * a * 0.7, 0.4);
        _q.setFromEuler(_e);
        _m.compose(w, _q, _s.set(1, 1, 1));
        writeHook(i, _m);
        any = true;
        // the cut line trails after it for a moment
        if (a < 0.6) writeRope(r++, curvePts, sagLine(onShip(h.from, h.fromL.x, h.fromL.y, h.fromL.z, _ra), w, 0.6 + 2 * a));
        continue;
      }
      const w = hookWorld(h, _hw);
      const from = onShip(h.from, h.fromL.x, h.fromL.y, h.fromL.z, _ra);
      // grapnel: shank along the line back toward the thrower, flukes over the rail
      _v.subVectors(from, w);
      _v.y = Math.max(_v.y, 0.4 * _v.length());
      _v.normalize();
      if (h.state === 'fly') {
        const u = clamp((clock - h.t0) / SET.hookFly, 0, 1);
        _q.setFromAxisAngle(_v2.set(_v.z, 0, -_v.x).normalize(), u * TAU * 1.5);
        _q2.setFromUnitVectors(_up, _v);
        _q.multiply(_q2);
      } else {
        _q.setFromUnitVectors(_up, _v);
        _q2.setFromAxisAngle(_up, 0.4 * Math.sin(t * 2 + i));
        _q.multiply(_q2);
      }
      _m.compose(w, _q, _s.set(1, 1, 1));
      writeHook(i, _m);
      any = true;
      // its line: from a hauler's hands (over his rail) or from the rail itself
      const hand = haulHands.get(i);
      if (h.state === 'fly') {
        const u = clamp((clock - h.t0) / SET.hookFly, 0, 1);
        writeRope(r++, curvePts, sagLine(from, w, 0.25 + 0.6 * (1 - u)));
      } else if (hand) {
        writeRope(r++, curvePts, sagLine(w, onShip(h.from, h.fromL.x, h.fromL.y + 0.02, h.fromL.z, _rb), 0.08, hand));
      } else {
        const d = w.distanceTo(from);
        const taut = active && (phase === 'reel' || phase === 'hook' || phase === 'threat');
        writeRope(r++, curvePts, sagLine(from, w, taut ? 0.05 : clamp(0.15 + (d - 3) * 0.12, 0.15, 1.2)));
      }
    }
    for (const s of swingRopes) {
      if (r >= ROPES) break;
      _w0.copy(s.a);
      _w1.copy(s.b);
      writeRope(r++, [_w0, _w1], 2, SET.swingRopeR);
      any = true;
    }
    swingRopes.length = 0;
    for (; r < ROPES; r++) writeRope(r, null);
    rig.visible = any;
    if (any) {
      rigGeo.attributes.position.needsUpdate = true;
      rigGeo.attributes.normal.needsUpdate = true;
    }
  }

  return api;
}
