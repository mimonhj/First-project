import * as THREE from 'three';
import { buildPerson, animatePerson, disposePerson } from './people.js';

// Sailors tumbling overboard and struck crews with their hands up (SPEC2 §2.4, §9.1).
//
// A pool of 5 people (people.js, share: true) that are children of the SCENE, never of a ship
// (disposeShip would dispose shared geometry), placed from the ship's transform every frame:
// - throwOver(ship, side, opts): a sailor goes over the rail on that side (+1 starboard, −1 port),
//   back first and flailing ('fall', a 0.8 s arc that keeps the ship's way), splashes (foam + the
//   'overboard' sound), bobs up once with his arms going and goes under (1.1 s);
// - showSurrender(ship, opts): two of her sailors stand on her deckSpots with their hands up
//   ('surrender'), one struck ship at a time; clearSurrender(ship) takes them away (capture, sinking).
// Idle people are hidden: 0 draw calls (each one showing costs about 5).
//
// createOverboard(scene, { foam, sfx, heightAt? }) → {
//   prepare(optsList),            // prebuild looks for this level, one person per update() (no stall)
//   throwOver(ship, side, opts) → boolean, showSurrender(ship, opts | [opts, opts]) → boolean,
//   clearSurrender(ship?),        // without a ship: whichever ship has them
//   update(t, dt),                // visual time; dt 0 (paused) freezes everything
//   clear(), dispose(),
//   get active /* people showing */, get surrendering /* the struck ship or null */
// }
// foam(x, y, z, n, spread, up, size, life) and sfx(name, x, z) are main's helpers; heightAt(x, z, t)
// (the ocean's) puts the splash on the wave, otherwise the ship's waterline is used.
// Ships are main's ship objects: x, z, h, speed, mesh (its userData deckY / railY / deckSpots / hullSide
// from ships.js are used when present, with sensible fallbacks), type.wid / type.len, sinking, captured.

const POOL = 5;
const FALL_T = 0.8; // seconds from the rail to the water
const BOB_T = 1.1; // seconds bobbing before going under
const GRAV = 26; // cartoon gravity for the arc (u/s²): a hop of about 1 u over the rail, then a plunge
const OUT_SPEED = 4.6; // u/s away from the hull (lands about 3.5 u out)
const SPIN = 1.15; // turns of the backward tumble during the fall
const CENTRE = 0.6; // tumble about the middle of the body (person units above the feet)
// Deck heights of today's models, for ships built before ships.js exports userData.deckY.
const DECK = { player: 1.2, cutter: 1.2, privateer: 1.2, prahu: 1.15, junk: 1.4, corsair: 1.2, manowar: 1.8, inferno: 1.8, galleon: 1.4, raider: 1.0, phantom: 1.8 };

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (x) => {
  x = clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
};

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function keyOf(opts) {
  try {
    return JSON.stringify(opts || {});
  } catch {
    return '{}';
  }
}

// The ship's current transform (position, heading, list and pitch), without touching the ship.
function shipMatrix(ship, out) {
  const mesh = ship.mesh;
  out.compose(mesh.position, mesh.quaternion, mesh.scale);
  if (mesh.parent && mesh.parent.isObject3D && !mesh.parent.isScene) out.premultiply(mesh.parent.matrixWorld);
  return out;
}
function deckOf(ship) {
  const ud = (ship.mesh && ship.mesh.userData) || {};
  return num(ud.deckY, DECK[ship.typeName] ?? 1.3);
}
function railOf(ship) {
  const ud = (ship.mesh && ship.mesh.userData) || {};
  return num(ud.railY, deckOf(ship) + 0.55);
}
// Half the hull's width at `z` along the keel (ship-local), from userData.hullSide when there is one.
function halfAt(ship, z) {
  const hs = ship.mesh && ship.mesh.userData && ship.mesh.userData.hullSide;
  if (hs && Array.isArray(hs.half) && hs.half.length && num(hs.dz, 0) > 0) {
    const f = clamp((z - num(hs.z0, 0)) / hs.dz, 0, hs.half.length - 1);
    const i = Math.floor(f);
    const a = num(hs.half[i], 0);
    const b = num(hs.half[Math.min(i + 1, hs.half.length - 1)], a);
    return a + (b - a) * (f - i);
  }
  return num(ship.type && ship.type.wid, 3) * 0.5;
}
// Two standing spots for the struck crew: from deckSpots the one nearest midships, then the nearest
// one at least 1.2 away from it (so they don't stand in each other); fallbacks either side of the mast.
function surrenderSpots(ship) {
  const ud = (ship.mesh && ship.mesh.userData) || {};
  const y = deckOf(ship);
  const spots = Array.isArray(ud.deckSpots) ? ud.deckSpots.filter((s) => s && Number.isFinite(s.x) && Number.isFinite(s.z)) : [];
  if (spots.length >= 2) {
    const byMid = [...spots].sort((a, b) => Math.abs(a.z) - Math.abs(b.z));
    const a = byMid[0];
    const b = byMid.slice(1).find((s) => Math.hypot(s.x - a.x, s.z - a.z) >= 1.2) || byMid[1];
    return [a, b].map((s) => ({ x: s.x, y: num(s.y, y), z: s.z }));
  }
  const len = num(ship.type && ship.type.len, 8);
  const w = Math.max(0.35, halfAt(ship, 0) * 0.45);
  return [
    { x: w, y, z: len * 0.08 },
    { x: -w, y, z: -len * 0.1 },
  ];
}

export function createOverboard(scene, { foam = null, sfx = null, heightAt = null } = {}) {
  const slots = [];
  for (let i = 0; i < POOL; i++) {
    const pivot = new THREE.Group();
    pivot.name = 'overboard';
    pivot.visible = false;
    scene.add(pivot);
    slots.push({ pivot, person: null, key: null, mode: 'idle', ship: null, age: 0, since: 0, used: 0 });
  }
  const queue = []; // looks to prebuild, one per update()
  const wanted = new Set(); // keys of the looks this level uses (from prepare())
  let surrenderShip = null;
  let clock = 0; // visual time of the last update (for 'fall' since)
  let used = 0;
  let disposed = false;

  function build(slot, opts) {
    const key = keyOf(opts);
    if (slot.person && slot.key === key) return slot.person;
    if (slot.person) disposePerson(slot.person);
    const person = buildPerson({ ...(opts || {}), share: true });
    person.visible = true;
    slot.person = person;
    slot.key = key;
    slot.pivot.add(person);
    return person;
  }
  function idle(slot) {
    slot.mode = 'idle';
    slot.ship = null;
    slot.pivot.visible = false;
  }
  // An idle slot: one already wearing this look, else an empty one, else one wearing a look this level
  // doesn't use (not in the prepare() list), else any idle one; failing that (when allowed) the
  // faller that went over first.
  function take(key, { steal = true, avoid = null } = {}) {
    let best = null;
    let bestScore = -1;
    for (const s of slots) {
      if (s === avoid || s.mode !== 'idle') continue;
      if (s.key === key) return s;
      const score = !s.person ? 3 : !wanted.has(s.key) ? 2 : 1;
      if (score > bestScore) {
        best = s;
        bestScore = score;
      }
    }
    if (best || !steal) return best;
    for (const s of slots) {
      if (s === avoid || (s.mode !== 'fall' && s.mode !== 'bob')) continue;
      if (!best || s.used < best.used) best = s;
    }
    return best;
  }

  function placeFall(s, t) {
    const a = s.age;
    const p = s.p0;
    const x = p.x + s.vx * a;
    const z = p.z + s.vz * a;
    const y = p.y + s.vy * a - 0.5 * GRAV * a * a;
    s.pivot.position.set(x, y, z);
    // facing inboard, then tumbling backward over the rail (about the ship's fore-aft axis)
    _q.setFromAxisAngle(_up, s.yaw);
    _axis.set(s.ox, 0, s.oz).cross(_up).normalize(); // horizontal, along the hull
    _q2.setFromAxisAngle(_axis, -SPIN * Math.PI * 2 * smooth(a / FALL_T) * 0.98);
    s.pivot.quaternion.copy(_q2).multiply(_q);
    s.person.position.set(0, -CENTRE * s.person.scale.y, 0);
    animatePerson(s.person, t, 'fall', { since: s.since });
  }
  function placeBob(s, t) {
    const a = s.age;
    const k = a / BOB_T;
    // up to the chest, a bob on the swell, then under; drifting away from the ship
    const x = s.p0.x + s.ox * 0.6 * a;
    const z = s.p0.z + s.oz * 0.6 * a;
    const wy = typeof heightAt === 'function' ? num(heightAt(x, z, t), s.water) : s.water;
    const rise = smooth(a / 0.25);
    const sink = smooth((k - 0.72) / 0.28);
    const y = wy - 1.3 + 0.78 * rise - 1.0 * sink + 0.05 * Math.sin(a * 9);
    s.pivot.position.set(x, y, z);
    _q.setFromAxisAngle(_up, s.yaw + 0.3 * Math.sin(a * 3));
    s.pivot.quaternion.copy(_q);
    s.person.position.set(0, 0, 0);
    animatePerson(s.person, t, 'fall', { since: s.since - 0.5 });
  }
  function placeSurrender(s, t) {
    const ship = s.ship;
    shipMatrix(ship, _m);
    _p.set(s.spot.x, s.spot.y, s.spot.z).applyMatrix4(_m);
    _m.decompose(_d, _q, _s);
    s.pivot.position.copy(_p);
    // face outboard, a little toward the bow, so each side sees a face
    _q2.setFromAxisAngle(_up, (s.spot.x >= 0 ? 1 : -1) * Math.PI * 0.42);
    s.pivot.quaternion.copy(_q).multiply(_q2);
    s.person.position.set(0, 0, 0);
    animatePerson(s.person, t, 'surrender', { phase: s.phase });
  }

  const api = {
    prepare(optsList) {
      if (disposed) return;
      queue.length = 0;
      wanted.clear();
      for (const o of Array.isArray(optsList) ? optsList : []) {
        const k = keyOf(o);
        if (wanted.has(k) || wanted.size >= POOL) continue;
        wanted.add(k);
        if (!slots.some((x) => x.key === k)) queue.push(o);
      }
    },

    throwOver(ship, side, opts) {
      if (disposed || !ship || !ship.mesh) return false;
      const sd = side < 0 ? -1 : 1;
      const slot = take(keyOf(opts));
      if (!slot) return false;
      build(slot, opts);
      // start on the rail at a random spot along the waist, ship-local (+x = port: local x = −side × half)
      const len = num(ship.type && ship.type.len, 8);
      const along = (Math.random() - 0.5) * len * 0.45;
      const half = halfAt(ship, along);
      shipMatrix(ship, _m);
      const p0 = new THREE.Vector3(-sd * (half - 0.15), railOf(ship) + 0.05, along).applyMatrix4(_m);
      // outward (world, flat) = the ship's local −side·x axis
      _d.set(-sd, 0, 0).transformDirection(_m);
      _d.y = 0;
      if (_d.lengthSq() < 1e-6) _d.set(1, 0, 0);
      _d.normalize();
      const h = num(ship.h, 0);
      const v = num(ship.speed, 0);
      const water = typeof heightAt === 'function' ? num(heightAt(p0.x, p0.z, clock), ship.mesh.position.y) : ship.mesh.position.y;
      const out = OUT_SPEED * (0.85 + Math.random() * 0.3);
      // the body centre reaches the water (a little under it) at FALL_T
      const y0 = p0.y + CENTRE;
      const yEnd = water - 0.1;
      Object.assign(slot, {
        mode: 'fall',
        ship,
        age: 0,
        since: clock,
        used: ++used,
        p0: new THREE.Vector3(p0.x, y0, p0.z),
        vx: Math.sin(h) * v + _d.x * out,
        vz: Math.cos(h) * v + _d.z * out,
        vy: (yEnd - y0 + 0.5 * GRAV * FALL_T * FALL_T) / FALL_T,
        ox: _d.x,
        oz: _d.z,
        yaw: Math.atan2(-_d.x, -_d.z), // a person faces +z: turn him to face the deck
        water,
        side: sd,
      });
      slot.pivot.visible = true;
      placeFall(slot, clock);
      return true;
    },

    showSurrender(ship, opts) {
      if (disposed || !ship || !ship.mesh) return false;
      if (surrenderShip && surrenderShip !== ship) api.clearSurrender(surrenderShip);
      if (surrenderShip === ship) return true;
      const looks = Array.isArray(opts) ? opts : [opts, opts && typeof opts === 'object' ? { ...opts, seed: num(opts.seed, 0) + 7 } : opts];
      const spots = surrenderSpots(ship);
      const a = take(keyOf(looks[0]));
      const b = a && take(keyOf(looks[1]), { avoid: a });
      if (!a || !b) return false;
      for (const [i, slot] of [a, b].entries()) {
        build(slot, looks[i]);
        Object.assign(slot, { mode: 'surrender', ship, spot: spots[i], phase: i * 0.37, used: ++used });
        slot.pivot.visible = true;
        placeSurrender(slot, clock);
      }
      surrenderShip = ship;
      return true;
    },

    clearSurrender(ship = null) {
      if (!surrenderShip || (ship && ship !== surrenderShip)) return;
      for (const s of slots) if (s.mode === 'surrender') idle(s);
      surrenderShip = null;
    },

    update(t, dt) {
      if (disposed) return;
      const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
      clock = num(t, clock);
      // prebuild one queued look per frame into an idle slot that has nothing this level uses
      if (queue.length) {
        const o = queue.shift();
        const k = keyOf(o);
        if (!slots.some((x) => x.key === k)) {
          const s = take(k, { steal: false });
          if (s) {
            build(s, o);
            s.pivot.visible = false;
          }
        }
      }
      for (const s of slots) {
        if (s.mode === 'fall') {
          s.age += step;
          if (s.age >= FALL_T) {
            const x = s.p0.x + s.vx * FALL_T;
            const z = s.p0.z + s.vz * FALL_T;
            if (typeof foam === 'function') foam(x, s.water + 0.2, z, 10, 3, 6, 0.5, 0.7);
            if (typeof sfx === 'function') sfx('overboard', x, z);
            s.p0.set(x, s.water, z);
            s.mode = 'bob';
            s.age = 0;
            placeBob(s, clock);
          } else placeFall(s, clock);
        } else if (s.mode === 'bob') {
          s.age += step;
          if (s.age >= BOB_T) idle(s);
          else placeBob(s, clock);
        } else if (s.mode === 'surrender') {
          const ship = s.ship;
          if (!ship || !ship.mesh || ship.sinking > 0 || ship.captured || !(num(ship.hp, 1) > 0) || !ship.mesh.parent) {
            api.clearSurrender(ship);
            continue;
          }
          placeSurrender(s, clock);
        }
      }
    },

    clear() {
      for (const s of slots) idle(s);
      surrenderShip = null;
      queue.length = 0;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      for (const s of slots) {
        if (s.person) disposePerson(s.person);
        s.person = null;
        scene.remove(s.pivot);
      }
      queue.length = 0;
      surrenderShip = null;
    },

    get active() {
      return slots.filter((s) => s.mode !== 'idle').length;
    },
    get surrendering() {
      return surrenderShip;
    },
  };
  return api;
}
