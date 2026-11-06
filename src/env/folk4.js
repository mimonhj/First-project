// The islanders, drawn (SPEC4 §7): the 33 named islanders of islanders.js and Builder Bess's crew of three, built one
// per frame from dock open (share: true, detail: 'low': the light build, <= 4,000 triangles each), walking their
// routines along islandPlan's ISLANDER_PATHS (islanders.routinePose: a pure function of the town clock, held back per
// islander while LOOK-2 makes them wait). Every drawn islander on the walk is a walker()-shaped entry in sparrow's
// folk() (r 0.35, from walkers()), so LOOK-2's waiting (the kit's inTheWay) and the captain's squeeze-past cover them;
// one the crowd director does not draw (`drawn`) leaves folk() and still waits for the captain, so nobody hidden can
// ever be in his way. Merfolk swim (never in folk()): a mer person sinks to the waist in the water and dives (a group
// translation; people.js poses a tail only as idle, sit, wave or cheer).
//
// createFolk4(kit, { people, walk, root, layout }) -> {
//   set(roster, { island4 }?), prepare() -> boolean (one person a call; true once all are built), update(t, dt,
//   captain, drawn), walkers() (folk() entries), talkTarget(captain) -> id | null, face(id, captain), dispose(),
//   and for the town, the construction scene and the tests: crowd() -> [{ id, x, z }] (every islander out, drawn or
//   not: the director's input), where(id) -> pose | null, trail(id, lag) -> pose | null (where they were `lag` s ago
//   on their own clock: a pet trots there), builders() -> [{ id, name, p }], person(id) -> Group | null,
//   hold(id, on) (the construction scene poses them; folk4 leaves them alone), quiet(x, z) (may anyone stop here:
//   §7.3's station rules), get chatting (the chat partner's id or null), get people, get group, get built,
//   get pending, get dancing }
// kit: sparrow's frozen art kit (its inTheWay is LOOK-2; without a kit an identical check runs on `captain`).
// people: the first roster (Stage 0 passes []); walk: env.walk (its links, places, doors and spawn: where an islander
// may stop to greet or chat, and the rope bridges an islander is no obstacle on); root: the town's root group (folk4's
// group is added to it, at identity, so inTheWay's root test holds); layout: islandPlan's exports (the default).
// update's captain: { x, z, h? } or null (he is not walking the town); drawn: the crowd director's Set of ids (an
// array, true for all, false for none; null or undefined: folk4 runs islanders.plan itself round the captain).

import * as THREE from 'three';
import { buildPerson, animatePerson, walkSpeed, disposePerson } from '../people.js';
import { routinePose, plan, danceAt, TALK, DANCE, ROUTINES, ISLANDERS } from '../islanders.js';
import * as islandPlan from '../islandPlan.js';

// ---------------------------------------------------------------------------------------- the numbers
/** How the islanders behave round the captain (u, s, rad). */
export const FOLK4 = Object.freeze({
  r: 0.35, // an islander in folk(): sparrow's walker radius
  react: Object.freeze({ dist: 2.2, band: 4.0, every: 20, secs: 2.4 }), // a greeting: once per 20 s each, at a station
  look: Object.freeze({ dist: 3.2, max: 0.75, rate: 5 }), // heads turn to follow him as he passes
  turn: 9, // rad/s a body turns (to face him, or round a corner of the path)
  chat: Object.freeze({ wave: 2.2, max: 45 }), // a chat: a wave, then attentive; it ends 3 u away (TALK.end) or after max s
  mer: Object.freeze({ swim: 0.62, dive: 1.7, bob: 0.035, rate: 1.6 }), // a mer person: sunk to the waist, dives deeper
  // where nobody stops (§6.5, §7.3; islanders.test's station rules): on a link (its band + 0.35), within 2 u of its
  // mouth (the run-in's deck end), in a doorway (1.5 u), inside a place circle (+ 0.35) or at the gangplank (1.9 u)
  quiet: Object.freeze({ mouth: 2.0, link: 0.35, place: 0.35, door: 1.5, gang: 1.9 }),
});
/** The plaza dance's moves (§4.1): out to the spot, dance, and back to where the loop was left, within DANCE.dur. */
export const DANCE_STEP = Object.freeze({ join: 4.5, out: 1.2, back: 1.4 });
// sparrow's LOOK-2 (sparrow.js inTheWay): the fallback when no kit is given (a harness)
const WAIT = { ahead: 1.0, side: 0.7, inside: 0.6 };
// actions that hold a posture or a tool at a prop: a greeting turns only the head
const POSTURE = new Set(['sit', 'fish', 'lean', 'haul', 'hammer', 'scrub', 'measure', 'fiddle', 'mop', 'steer', 'swing']);
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const wrap = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const turnTo = (a, b, step) => {
  const d = wrap(b - a);
  return Math.abs(d) <= step ? b : a + Math.sign(d) * step;
};
function own(o, k) {
  try {
    return o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
  } catch {
    return undefined;
  }
}
const arr = (v) => (Array.isArray(v) ? v : []);
const segD = (x, z, ax, az, bx, bz) => {
  const L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
  const u = clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / L2, 0, 1);
  return Math.hypot(x - ax - (bx - ax) * u, z - az - (bz - az) * u);
};

/**
 * The plaza dance's step for someone who leaves their loop at `from` ({ x, z, h }) for `spot` ({ x, z, h? }) while
 * the dance runs (u: s since it began, of DANCE.dur): out at a run, dance, back at a walk to `from`. { x, z, h,
 * action, moving, k } (k: 0..1 how far from the loop). Pure; for sparrow's villagers too.
 */
export function danceStep(from, spot, u, dur = DANCE.dur) {
  const D = Math.max(DANCE_STEP.out + DANCE_STEP.back + 0.5, fin(dur) ? dur : DANCE.dur);
  const uu = clamp(fin(u) ? u : 0, 0, D);
  const dx = spot.x - from.x;
  const dz = spot.z - from.z;
  const towards = Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dx, dz) : fin(from.h) ? from.h : 0;
  const face = fin(spot.h) ? spot.h : towards;
  const ease = (k) => k * k * (3 - 2 * k);
  if (uu < DANCE_STEP.out) {
    const k = ease(uu / DANCE_STEP.out);
    return { x: from.x + dx * k, z: from.z + dz * k, h: towards, action: 'run', moving: true, k };
  }
  if (uu > D - DANCE_STEP.back) {
    const k = ease((D - uu) / DANCE_STEP.back);
    return { x: from.x + dx * k, z: from.z + dz * k, h: wrap(towards + Math.PI), action: 'walk', moving: true, k };
  }
  return { x: spot.x, z: spot.z, h: face, action: 'cheer', moving: false, k: 1 };
}

/**
 * The stations that need something under or before them, for the town's art (§7.1, §7.3): a seat where a routine
 * sits (a bench, a stool, the swing; a rock for a mer person), a rail where it leans, the deck's edge where it fishes.
 * From the layout's ISLANDER_PATHS and the routines: [{ islander, station, x, y, z, h, need: 'seat' | 'rock' | 'rail' |
 * 'edge' }] (h: the way the islander faces there; a seat's back is behind them, a rail in front). Pure.
 */
export function seatSpots(layout = islandPlan) {
  const out = [];
  for (const path of arr(own(layout, 'ISLANDER_PATHS'))) {
    const who = own(path, 'islander');
    const R = typeof who === 'string' && Object.prototype.hasOwnProperty.call(ROUTINES, who) ? ROUTINES[who] : null;
    if (!R) continue;
    const mer = ISLANDERS.some((p) => p.id === who && p.mer);
    const pts = arr(own(path, 'pts'));
    const P = (q) => (Array.isArray(q) && fin(q[0]) && fin(q[q.length - 1]) ? { x: q[0], y: q.length >= 3 && fin(q[1]) ? q[1] : null, z: q[q.length - 1] } : null);
    for (const st of arr(own(path, 'stations'))) {
      const step = R.steps.find((x) => x.station === own(st, 'id'));
      const i = own(st, 'i');
      const q = Number.isInteger(i) ? P(pts[i]) : null;
      if (!step || !q) continue;
      const acts = step.acts.map((a) => a[0]);
      const need = acts.includes('sit') ? (mer ? 'rock' : 'seat') : acts.includes('lean') ? 'rail' : acts.includes('fish') ? 'edge' : null;
      if (!need) continue;
      let h = own(st, 'h');
      if (!fin(h)) {
        const b = P(pts[(i - 1 + pts.length) % pts.length]);
        h = b && Math.hypot(q.x - b.x, q.z - b.z) > 1e-6 ? Math.atan2(q.x - b.x, q.z - b.z) : 0;
      }
      out.push({ islander: who, station: own(st, 'id'), x: q.x, y: q.y, z: q.z, h, need });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------- the module
export function createFolk4(kit, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const layout = own(o, 'layout') || islandPlan;
  const walkData = own(o, 'walk') || null;
  const inTheWay = kit && typeof kit.inTheWay === 'function' ? kit.inTheWay : null;
  const group = new THREE.Group();
  group.name = 'folk4';
  group.userData.keep = true; // (bake() leaves people alone)
  const root = own(o, 'root');
  if (root && root.isObject3D) root.add(group);

  /** @type {Map<string, any>} */
  const ents = new Map();
  let order = []; // the islanders (not the builders), in roster order
  let queue = []; // ids still to build
  let island4 = null;
  let lastT = 0;
  let lastCap = null;
  let drawnNow = new Set();
  let dance = null; // { t0, spots: [{ x, z, h }], who: Map<id, { spot, from }> } while the plaza dance runs
  let prepSince = false; // prepare() ran since the last update() (one person a frame, whoever calls it)

  // ----- where nobody stops: the links and their mouths, places, doors, the gangplank (from env.walk) -----
  let W = null;
  function walkInfo() {
    if (W) return W;
    const links = [];
    for (const l of arr(own(walkData, 'links'))) {
      const pts = arr(own(l, 'pts')).filter((p) => Array.isArray(p) && fin(p[0]) && fin(p[2]));
      if (pts.length < 2) continue;
      const hw = fin(own(l, 'hw')) ? l.hw : 0.25;
      const n = pts.length;
      links.push({ id: own(l, 'id'), pts, hw, rope: hw <= 0.3, mouths: [pts[n >= 3 ? 1 : 0], pts[n >= 3 ? n - 2 : n - 1]] });
    }
    const places = arr(own(walkData, 'places')).filter((p) => p && fin(p.x) && fin(p.z));
    const doors = arr(own(walkData, 'doors')).filter((p) => p && fin(p.x) && fin(p.z));
    const sp = own(walkData, 'spawn');
    W = { links, places, doors, spawn: sp && fin(sp.x) && fin(sp.z) ? sp : null };
    return W;
  }
  /** May an islander stop here (to greet or chat)? Not on a link or within 2 u of its mouth, in a doorway, inside a
   *  place circle or at the gangplank (§6.5). */
  function quiet(x, z) {
    const w = walkInfo();
    const Q = FOLK4.quiet;
    for (const l of w.links) {
      for (const m of l.mouths) if (Math.hypot(x - m[0], z - m[2]) < Q.mouth) return false;
      for (let i = 0; i + 1 < l.pts.length; i++) if (segD(x, z, l.pts[i][0], l.pts[i][2], l.pts[i + 1][0], l.pts[i + 1][2]) < l.hw + Q.link) return false;
    }
    for (const p of w.places) if (Math.hypot(x - p.x, z - p.z) < (fin(p.r) ? p.r : 1) + Q.place) return false;
    for (const d of w.doors) if (Math.hypot(x - d.x, z - d.z) < Q.door) return false;
    if (w.spawn && Math.hypot(x - w.spawn.x, z - w.spawn.z) < Q.gang) return false;
    return true;
  }
  /** On a rope bridge, its run-ins or the 3 u of deck straight onto one (sparrow's nearBridge): an islander there is
   *  no obstacle to the captain (he walks through, as he would squeeze past anyway). */
  function nearRope(x, z) {
    for (const l of walkInfo().links) {
      if (!l.rope) continue;
      const P = l.pts;
      for (let i = 0; i + 1 < P.length; i++) if (segD(x, z, P[i][0], P[i][2], P[i + 1][0], P[i + 1][2]) < 0.75) return true;
      for (const [e, n] of [[P[0], P[1]], [P[P.length - 1], P[P.length - 2]]]) {
        const L = Math.hypot(n[0] - e[0], n[2] - e[2]) || 1;
        const ux = (n[0] - e[0]) / L;
        const uz = (n[2] - e[2]) / L;
        if (segD(x, z, e[0] - ux * 3, e[2] - uz * 3, e[0], e[2]) < 1.0) return true;
      }
    }
    return false;
  }

  // ----- the roster -----
  function readRoster(r) {
    const people = [];
    const builders = [];
    const take = (row, out, builder) => {
      const id = own(row, 'id');
      const look = own(row, 'look');
      if (typeof id !== 'string' || !id || !look || typeof look !== 'object') return;
      out.push({ id, name: typeof own(row, 'name') === 'string' ? row.name : id, look, react: own(row, 'react') || {}, mer: own(row, 'mer') === true || own(look, 'tail') === true, builder });
    };
    if (Array.isArray(r)) for (const row of r) take(row, own(row, 'role') === 'builder' ? builders : people, own(row, 'role') === 'builder');
    else {
      for (const row of arr(own(r, 'people'))) take(row, people, false);
      for (const row of arr(own(r, 'builders'))) take(row, builders, true);
    }
    return { people, builders };
  }
  const sigOf = (look) => {
    try {
      return JSON.stringify(look);
    } catch {
      return String(Math.random());
    }
  };
  function drop(E) {
    if (E.p) disposePerson(E.p);
    E.p = null;
  }
  /** Who is out (islanders.roster's { people, builders }, or a plain list). Keeps those already built with the same
   *  look; the new ones are built by prepare(), one a call. extra.island4: the new plots' record (the plaza dance). */
  function set(roster, extra) {
    if (extra && typeof extra === 'object' && 'island4' in extra) island4 = extra.island4;
    W = null; // (env.walk may have grown since: walkData4 is merged at the town's build)
    const r = readRoster(roster);
    const want = new Map();
    for (const row of [...r.people, ...r.builders]) if (!want.has(row.id)) want.set(row.id, row);
    for (const [id, E] of ents) {
      const w = want.get(id);
      if (!w || sigOf(w.look) !== E.sig) {
        drop(E);
        ents.delete(id);
      } else Object.assign(E, { name: w.name, react: w.react });
    }
    for (const [id, w] of want) {
      if (ents.has(id)) continue;
      ents.set(id, {
        id,
        name: w.name,
        look: w.look,
        sig: sigOf(w.look),
        react: w.react,
        mer: w.mer,
        builder: w.builder,
        p: null,
        off: 0, // the islander's clock offset (s): held back while waiting for the captain or chatting
        pose: null,
        x: 0,
        y: 0,
        z: 0,
        h: 0,
        act: 'idle',
        drawn: false,
        held: w.builder, // builders stay hidden until the construction scene borrows them
        waiting: false,
        chat: null,
        greet: null,
        lastGreet: -Infinity,
        look2: 0, // head yaw towards the captain
        anim: 0, // the pose's clock (s at the stride's tempo)
        sink: 0, // a mer person's depth below the path
        speeds: {},
        shim: { p: { parent: null, position: new THREE.Vector3(), rotation: { y: 0 } } },
      });
    }
    order = [...want.values()].filter((w) => !w.builder).map((w) => ents.get(w.id));
    // build the islanders first (they walk), then the builders
    queue = [...want.values()].sort((a, b) => a.builder - b.builder).map((w) => w.id).filter((id) => !ents.get(id).p);
    return ents.size;
  }

  /** Builds the next person (one a call, behind the "Rowing to…" toast). True once everyone is built. */
  function prepare() {
    prepSince = true;
    while (queue.length) {
      const id = queue.shift();
      const E = ents.get(id);
      if (!E || E.p) continue;
      try {
        const p = buildPerson({ ...E.look, share: true, detail: 'low' });
        p.visible = false;
        p.name = `islander:${id}`;
        p.userData.islander = id;
        group.add(p);
        E.p = p;
      } catch (err) {
        console.warn('folk4: could not build', id, err);
      }
      break;
    }
    return queue.length === 0;
  }

  // ----- each frame -----
  function readCap(c) {
    if (!c || typeof c !== 'object') return null;
    const x = own(c, 'x');
    const z = own(c, 'z');
    if (!fin(x) || !fin(z)) return null;
    const h = own(c, 'h');
    return { x, z, h: fin(h) ? h : null };
  }
  function drawnSet(drawn, cap) {
    if (drawn instanceof Set) return drawn;
    if (Array.isArray(drawn)) return new Set(drawn);
    if (drawn === true) return new Set(order.map((E) => E.id));
    if (drawn === false) return new Set();
    // no director: islanders.plan round the captain (else everybody, for a harness without one)
    if (!cap) return new Set(order.map((E) => E.id));
    return plan({ cx: cap.x, cz: cap.z, x: cap.x, z: cap.z }, crowd(), drawnNow, lastT);
  }
  function blocks(E, pose, cap) {
    // LOOK-2: the captain stands 0-1 u ahead of a walker (sparrow's inTheWay, through the kit, on the walker's pose)
    const S = E.shim;
    S.p.position.set(pose.x, pose.y, pose.z);
    S.p.rotation.y = pose.h;
    if (inTheWay && group.parent) {
      S.p.parent = group.parent;
      try {
        return !!inTheWay(S);
      } catch {
        return false;
      }
    }
    if (!cap) return false;
    const dx = cap.x - pose.x;
    const dz = cap.z - pose.z;
    const fx = Math.sin(pose.h);
    const fz = Math.cos(pose.h);
    const along = dx * fx + dz * fz;
    return along > 0 && along < WAIT.ahead && Math.abs(dx * fz - dz * fx) < WAIT.side && Math.hypot(dx, dz) > WAIT.inside;
  }
  function speedOf(E, action) {
    let v = E.speeds[action];
    if (v === undefined) v = E.speeds[action] = E.p ? walkSpeed(E.p, action, 1) : 0;
    return v;
  }

  // the plaza dance (§4.1): who leaves their loop for which spot, decided once as it begins
  function stepDance(t) {
    const k = island4 ? danceAt(t, island4) : 0;
    if (k <= 0) {
      dance = null;
      return;
    }
    if (dance) return;
    const spots = [];
    for (const p of arr(own(layout, 'ISLANDER_PATHS'))) {
      if (own(p, 'kind') !== 'dance') continue;
      const pts = arr(own(p, 'pts'));
      const st = arr(own(p, 'stations'));
      const at = (q) => (Array.isArray(q) ? { x: q[0], z: q[2] ?? q[1] } : q && fin(q.x) && fin(q.z) ? { x: q.x, z: q.z } : null);
      if (st.length) for (const s of st) spots.push(at(pts[own(s, 'i')]) || at(own(s, 'at')));
      else for (const q of pts) spots.push(at(q));
    }
    const free = spots.filter((s) => s && fin(s.x) && fin(s.z));
    const u = ((t % DANCE.every) + DANCE.every) % DANCE.every;
    dance = { t0: t - u, who: new Map() };
    if (!free.length) return;
    const cx = free.reduce((s, q) => s + q.x, 0) / free.length;
    const cz = free.reduce((s, q) => s + q.z, 0) / free.length;
    const cands = [];
    for (const E of order) {
      if (E.mer || E.held || !E.pose || E.chat) continue;
      if (!quiet(E.pose.x, E.pose.z)) continue;
      for (const s of free) {
        const d = Math.hypot(s.x - E.pose.x, s.z - E.pose.z);
        if (d <= DANCE_STEP.join) cands.push({ E, s, d });
      }
    }
    cands.sort((a, b) => a.d - b.d);
    const used = new Set();
    for (const c of cands) {
      if (dance.who.has(c.E.id) || used.has(c.s)) continue;
      used.add(c.s);
      dance.who.set(c.E.id, { spot: { x: c.s.x, z: c.s.z, h: Math.atan2(cx - c.s.x, cz - c.s.z) }, from: { x: c.E.pose.x, z: c.E.pose.z, h: c.E.pose.h, y: c.E.pose.y } });
    }
  }

  function update(t, dt0, captain, drawn) {
    // (a roster set after the town stopped calling prepare() is still built, one a frame)
    if (queue.length && !prepSince) prepare();
    prepSince = false;
    const tt = fin(t) ? t : lastT;
    const dt = clamp(fin(dt0) ? dt0 : tt - lastT, 0, 0.1);
    lastT = tt;
    const cap = readCap(captain);
    if (cap && lastCap) cap.speed = dt > 0 ? Math.hypot(cap.x - lastCap.x, cap.z - lastCap.z) / dt : 0;
    lastCap = cap ? { x: cap.x, z: cap.z } : null;
    stepDance(tt);
    // first everyone's place (drawn or not: the director needs where they are), then who is drawn
    for (const E of order) {
      if (E.held) continue;
      let pose = routinePose(E.id, tt + E.off, layout);
      E.waiting = false;
      if (!pose) {
        E.pose = null;
        continue;
      }
      const dz = dance && dance.who.get(E.id);
      if (dz) {
        // dancing on the plaza: the loop's clock waits where it was left
        E.off -= dt;
        const s = danceStep(dz.from, dz.spot, tt - dance.t0);
        pose = { ...pose, x: s.x, z: s.z, y: dz.from.y, h: s.h, action: s.action, moving: s.moving, station: s.moving ? null : 'dance', speed: s.moving ? (s.action === 'run' ? 2.2 : 0.9) : 0 };
      } else if (E.chat) {
        // chatting: a walker stops where he is (talkTarget only offers someone at a quiet spot)
        if (pose.moving) {
          E.off -= dt;
          pose = routinePose(E.id, tt + E.off, layout) || pose;
          pose = { ...pose, moving: false, action: 'idle', speed: 0 };
        }
      } else if (pose.moving && !E.mer && blocks(E, pose, cap)) {
        // LOOK-2: he waits (his clock held back), and goes on once the way is clear
        E.off -= dt;
        pose = routinePose(E.id, tt + E.off, layout) || pose;
        pose = { ...pose, moving: false, speed: 0, action: 'idle' };
        E.waiting = true;
      }
      E.pose = pose;
    }
    const ds = drawnSet(drawn, cap);
    drawnNow = new Set();
    for (const E of order) {
      const on = !!E.p && !!E.pose && !E.held && ds.has(E.id);
      E.drawn = on;
      if (E.p && !E.held) E.p.visible = on;
      if (on) drawnNow.add(E.id);
      if (on) drawOne(E, tt, dt, cap);
      else if (E.pose) {
        E.x = E.pose.x;
        E.y = E.pose.y;
        E.z = E.pose.z;
        E.h = E.pose.h;
        E.act = E.pose.action;
        E.greet = null;
      }
    }
    // a chat ends when he walks 3 u away (or after FOLK4.chat.max s)
    for (const E of order) {
      if (!E.chat) continue;
      const far = !cap || Math.hypot(cap.x - E.x, cap.z - E.z) > TALK.end;
      if (far || tt - E.chat.t0 > FOLK4.chat.max || !E.drawn) E.chat = null;
    }
  }

  // one drawn islander's pose: place, face, action, then the head
  function drawOne(E, t, dt, cap) {
    const P = E.pose;
    const p = E.p;
    let act = P.action;
    let speed = 1;
    let face = P.h;
    let turnRate = FOLK4.turn;
    // a greeting: once per 20 s, only at a station (or a mer person), never at a link, mouth, door or place
    const R = FOLK4.react;
    const mode = own(E.react, 'mode');
    const near = cap ? Math.hypot(cap.x - P.x, cap.z - P.z) : Infinity;
    if (!E.chat && !E.greet && cap && !P.moving && near < (mode === 'band' ? R.band : R.dist) && t - E.lastGreet > R.every && (E.mer || quiet(P.x, P.z))) {
      E.greet = { t0: t, until: t + R.secs };
      E.lastGreet = t;
    }
    if (E.greet && (t >= E.greet.until || P.moving)) E.greet = null;
    const toCap = cap ? Math.atan2(cap.x - P.x, cap.z - P.z) : null;
    let nod = 0;
    let bow = 0;
    if (E.chat) {
      // turned to him: a wave first (the hello), then attentive
      if (!POSTURE.has(act) || E.mer) {
        face = toCap ?? face;
        act = t - E.chat.t0 < FOLK4.chat.wave ? 'wave' : 'idle';
      }
    } else if (E.greet) {
      const k = (t - E.greet.t0) / R.secs;
      const ra = own(E.react, 'action');
      if (mode === 'band') speed = 1.6; // the band strikes up
      else if (POSTURE.has(act) && !E.mer) {
        if (mode === 'nod') nod = Math.sin(k * Math.PI * 4) * 0.22;
      } else {
        face = toCap ?? face;
        act = typeof ra === 'string' ? ra : 'wave';
        if (mode === 'slow') speed = 0.6;
        if (mode === 'bow' || mode === 'tipCap') bow = Math.sin(clamp(k * 1.4, 0, 1) * Math.PI) * (mode === 'bow' ? 0.45 : 0.2);
        if (mode === 'nod') nod = Math.sin(k * Math.PI * 4) * 0.22;
      }
    }
    if (P.moving) {
      // stride in step with the ground speed
      const v = speedOf(E, act === 'idle' ? 'walk' : act);
      speed = v > 1e-6 && fin(P.speed) && P.speed > 0 ? clamp(P.speed / v, 0.35, 2.5) : 1;
      if (E.mer) {
        act = 'idle';
        speed = 1;
      }
    }
    // place: a mer person sinks into the water (to the waist while swimming, deeper while diving)
    let y = fin(P.y) ? P.y : 1.3;
    if (E.mer) {
      const M = FOLK4.mer;
      const want = (act === 'sit' ? 0 : M.swim) + (fin(P.dive) ? P.dive : 0) * M.dive;
      E.sink = E.sink + clamp(want - E.sink, -M.rate * dt * 2, M.rate * dt * 2);
      y -= E.sink;
      if (act !== 'sit') y += M.bob * Math.sin(t * 1.7 + E.look.seed);
    }
    E.x = P.x;
    E.y = y;
    E.z = P.z;
    E.h = P.moving ? turnTo(E.h, face, turnRate * 1.6 * dt) : turnTo(E.h, face, turnRate * dt);
    if (!fin(E.h)) E.h = fin(face) ? face : 0;
    E.act = act;
    p.position.set(E.x, E.y, E.z);
    p.rotation.y = E.h;
    // the merfolk show only below their dive's depth (a dive takes them out of sight)
    if (E.mer && fin(P.dive) && P.dive > 0.97) p.visible = false;
    // (the pose's own clock runs at the stride's tempo, so a change of pace never jumps the legs)
    E.anim += dt * speed;
    animatePerson(p, E.anim, act);
    // the head follows the captain as he passes (and nods / bows in a greeting)
    let lookWant = 0;
    if (cap && near < FOLK4.look.dist && toCap !== null) {
      const rel = wrap(toCap - E.h);
      if (Math.abs(rel) < 1.9) lookWant = clamp(rel, -FOLK4.look.max, FOLK4.look.max);
    }
    E.look2 += clamp(lookWant - E.look2, -FOLK4.look.rate * dt, FOLK4.look.rate * dt);
    const parts = p.userData.parts;
    if (parts) {
      if (parts.head && (E.look2 !== 0 || nod !== 0)) {
        parts.head.rotation.y += E.look2;
        parts.head.rotation.x += nod;
      }
      if (parts.torso && bow !== 0) parts.torso.rotation.x += bow;
    }
  }

  // ----- what the town reads -----
  /** The drawn islanders on the walk, as sparrow's folk() entries (r 0.35): the captain squeezes past them and they
   *  wait for him. Not the merfolk (they swim), not the hidden, not anyone by a rope bridge (as the villagers). */
  function walkers() {
    const out = [];
    for (const E of order) {
      if (!E.drawn || E.mer || E.held || !E.p || !E.pose) continue;
      if (nearRope(E.x, E.z)) continue;
      out.push({ x: E.x, z: E.z, r: FOLK4.r, index: `isl:${E.id}`, greets: false, islander: E.id });
    }
    return out;
  }
  /** Everyone out (drawn or not), for the crowd director: [{ id, x, z, pin }] (pin: the one he is chatting with). */
  function crowd() {
    const out = [];
    for (const E of order) if (E.pose && !E.held) out.push({ id: E.id, x: E.pose.x, z: E.pose.z, pin: !!E.chat });
    return out;
  }
  /** Who he can talk to (§7.4): drawn, within TALK.reach (1.6 u), within ±TALK.face of his heading, standing still or
   *  walking where nobody stops for nothing (a link, a mouth, a door, a place: never there); the nearest, or null. */
  function talkTarget(captain) {
    const cap = readCap(captain);
    if (!cap) return null;
    let best = null;
    for (const E of order) {
      if (!E.drawn || E.held || !E.p || !E.pose) continue;
      if (E.mer && fin(E.pose.dive) && E.pose.dive > 0.3) continue;
      const d = Math.hypot(E.x - cap.x, E.z - cap.z);
      if (d > TALK.reach || (best && d >= best.d)) continue;
      if (cap.h !== null && d > 1e-3) {
        const rel = wrap(Math.atan2(E.x - cap.x, E.z - cap.z) - cap.h);
        if (Math.abs(rel) > (TALK.face * Math.PI) / 180) continue;
      }
      if (!E.mer && !quiet(E.x, E.z)) continue;
      best = { id: E.id, d };
    }
    return best ? best.id : null;
  }
  /** The talk begins (captain: { x, z }): the islander stops, turns and waves; null ends it. True if they can. */
  function face(id, captain) {
    const E = typeof id === 'string' ? ents.get(id) : null;
    if (!E || E.builder) return false;
    if (!readCap(captain)) {
      E.chat = null;
      return true;
    }
    if (!E.pose) return false;
    E.chat = { t0: lastT };
    E.greet = null;
    return true;
  }
  /** Where an islander is now (their pose as drawn, or as walked out of sight), or null. */
  function where(id) {
    const E = typeof id === 'string' ? ents.get(id) : null;
    if (!E || !E.pose) return null;
    return { x: E.x, y: E.y, z: E.z, h: E.h, moving: !!E.pose.moving, station: E.pose.station, action: E.act, drawn: E.drawn };
  }
  /** Where islander `id` was `lag` s ago on their own clock (a pet following them trots there). */
  function trail(id, lag = 1) {
    const E = typeof id === 'string' ? ents.get(id) : null;
    if (!E || E.held) return null;
    const q = routinePose(E.id, lastT + E.off - (fin(lag) ? lag : 1), layout);
    return q ? { x: q.x, y: q.y, z: q.z, h: q.h, moving: q.moving } : null;
  }
  function builders() {
    const out = [];
    for (const E of ents.values()) if (E.builder && E.p) out.push({ id: E.id, name: E.name, p: E.p });
    return out;
  }
  function person(id) {
    const E = typeof id === 'string' ? ents.get(id) : null;
    return E && E.p ? E.p : null;
  }
  /** The construction scene borrows someone (on: folk4 leaves them alone, out of folk()); off gives them back. */
  function hold(id, on) {
    const E = typeof id === 'string' ? ents.get(id) : null;
    if (!E) return false;
    E.held = !!on || E.builder;
    if (E.p && E.builder && !on) E.p.visible = false;
    if (E.held) {
      E.chat = null;
      E.greet = null;
    }
    return true;
  }
  function dispose() {
    for (const E of ents.values()) drop(E);
    ents.clear();
    order = [];
    queue = [];
    if (group.parent) group.parent.remove(group);
  }

  if (Array.isArray(own(o, 'people')) && o.people.length) set(o.people);

  return {
    set,
    prepare,
    update,
    walkers,
    talkTarget,
    face,
    dispose,
    crowd,
    where,
    trail,
    builders,
    person,
    hold,
    quiet,
    get group() {
      return group;
    },
    get built() {
      let n = 0;
      for (const E of ents.values()) if (E.p) n++;
      return n;
    },
    get pending() {
      return queue.length;
    },
    get dancing() {
      return dance ? [...dance.who.keys()] : [];
    },
    /** The plaza dance's spots the islanders took ([{ x, z }]; [] while none dances): sparrow's villagers take the rest. */
    get danceSpots() {
      return dance ? [...dance.who.values()].map((d) => ({ x: d.spot.x, z: d.spot.z })) : [];
    },
    /** The islander the captain is chatting with (face() began it), or null: the crowd director's `chat`. */
    get chatting() {
      for (const E of order) if (E.chat) return E.id;
      return null;
    },
    get people() {
      return order.map((E) => ({
        id: E.id,
        name: E.name,
        x: E.x,
        y: E.y,
        z: E.z,
        h: E.h,
        action: E.act,
        moving: !!(E.pose && E.pose.moving),
        station: E.pose ? E.pose.station : null,
        drawn: E.drawn,
        waiting: E.waiting,
        chatting: !!E.chat,
        built: !!E.p,
        mer: E.mer,
        placed: !!E.pose,
        off: E.off,
      }));
    },
  };
}
