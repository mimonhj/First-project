// Voyage III's rules (SPEC3 §4.2, §5.3): the new ships' behaviours (the Shark Raider's ram, the Bomb Ketch's
// mortar, the Fire Ship, the Inkheart's ink pots and the flight of her crew) and the hazards of the Kraken
// Seas (waterspouts on level 7, rogue waves on level 8). The ship behaviours follow the type flags on every
// level; `ids` only switch the hazards on.
//
// Pure: no three.js, imports nothing (the Node tests load it as a data: URL, like mechanics.js). Gameplay
// runs in simulated time and rolls with ctx.rng (fed from main's combatRng), never Math.random.
//
// createMechanics3(ids, ctx) → the SPEC2 §6.3 hook shape (see mechanics.js) plus
//   shipMods(s) → { speedMul, capAdd, turnMul, spin }   ink slicks, surf, wobble, spout spin
//   visuals() → { spouts, rogue, slicks, rams, fireRings, shells }   what the env and main draw
//   addSlick(x, z), get krakenDue
// ctx = SPEC2's mechanics ctx + { launchBomb({ kind, from, tx, tz, radius, damage, warn }), flee(e),
//   explode(x, z, r, dmg, src), status(e) → status, douse(e), playerTurn(), warnBonus(), surrender(e) }
//
// composeMechanics([a, b]) joins a createMechanics instance (a, Act II) and a createMechanics3 instance (b)
// into the one `mechanics` main calls (SPEC3 §11.1; written in full in Stage 0, kept as it is by 1B).
//
// STAGE 0 SCAFFOLD: createMechanics3 is a null object (no hazard, no behaviour); the tables carry SPEC3's
// starting values. Stage 1B writes the rules.

export const MECHANIC3_IDS = ['spouts', 'rogue', 'flagship'];

// ---------------------------------------------------------------------------------------- tables
// (SPEC3's starting values; Stage 1B owns them and Stage 3 tunes them with the bots.)

/** Waterspouts (§5.3, level 7). */
export const SPOUTS = { active: [2, 3], speed: 2.5, clear: 8, form: 3, life: 22, collapse: 2, next: [6, 9], away: 30, pull: { r: 14, speed: 2 }, core: { r: 6, spin: 2, dps: 4, tick: 0.25, fling: 1.5, flingSpeed: 6, flingTime: 1 }, avoid: 16 };

/** Rogue waves (§5.3, level 8). */
export const ROGUE = { first: 30, every: [24, 32], warn: 4, length: 120, height: 7, speed: 16, start: 70, startBonus: 16, sideOn: [50, 130], damage: 10, push: 6, pushTime: 0.5, wobble: 1, wobbleTurn: 0.5, surf: 2, surfTime: 2 };

/** The Shark Raider's charge (§4.2). */
export const RAM = { reach: 25, cone: 0.35, windup: 1.5, surge: 2, speed: 16, contact: 0.36, damage: 10, self: 8, push: 4, pushTime: 0.6, cooldown: 6 };

/** The Bomb Ketch's mortar (§4.2). */
export const MORTAR = { keep: [35, 45], flee: 20, every: [6, 8], range: [25, 48], lead: 0.8, radius: 4.5, damage: 12, warn: 2.2 };

/** The Fire Ship (§4.2). */
export const FIRESHIP = { light: 30, ring: 6, arm: 1.6, reach: 4, blast: 22, edge: 11, frozenSpeed: 3 };

/** The Inkheart's ink pots and slicks (§4.2; the Kraken's ink reads these too). */
export const INK = { every: 10, pots: 2, scatter: 6, radius: 4, damage: 8, warn: 1.8, slick: { r: 7, time: 6, speedMul: 0.6, max: 3 } };

/** When the Inkheart falls her crew flee (§4.2). */
export const FLEE = { speed: 7, remove: 5 };

// --------------------------------------------------------------------------------------- helpers

const isObj = (v) => v !== null && typeof v === 'object';
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const IDENTITY = Object.freeze({ speedMul: 1, capAdd: 0, turnMul: 1, spin: 0 });
const NO_VISUALS = Object.freeze({ spouts: Object.freeze([]), rogue: null, slicks: Object.freeze([]), rams: Object.freeze([]), fireRings: Object.freeze([]), shells: Object.freeze([]) });

// ------------------------------------------------------------------------------ createMechanics3

export function createMechanics3(ids, ctx) {
  const list = [];
  if (Array.isArray(ids)) {
    for (const id of ids) if (typeof id === 'string' && MECHANIC3_IDS.includes(id) && !list.includes(id)) list.push(id);
  }
  let now = 0;
  return {
    init() {},
    onSpawn() {},
    onCapture() {},
    onSink() {},
    onRemove() {},
    step(dt) {
      if (finite(dt) && dt > 0) now += dt;
    },
    steer() {
      return null;
    },
    holdFire() {
      return false;
    },
    drift() {
      return null;
    },
    avoid() {
      return [];
    },
    shipMods() {
      return IDENTITY;
    },
    objective() {
      return null;
    },
    minimap() {
      return [];
    },
    summary() {
      return [];
    },
    bonus() {
      return 0;
    },
    visuals() {
      return NO_VISUALS;
    },
    addSlick() {},
    get krakenDue() {
      return false;
    },
    get state() {
      return { ids: [...list], time: now };
    },
    dispose() {},
  };
}

// ------------------------------------------------------------------------------ composeMechanics

/**
 * One `mechanics` for main from a = createMechanics(ids, ctx) and b = createMechanics3(ids, ctx3) (two
 * instances: each factory keeps the ids it knows). The rules (SPEC3 §11.1):
 * - init, onSpawn, onCapture, onSink, onRemove, step, dispose fan out, a first;
 * - steer: a's if non-null, else b's; holdFire: either;
 * - drift: summed (as createMechanics sums its parts), null when both are null;
 * - avoid, minimap, summary: a's then b's; bonus: summed;
 * - objective: a's string unchanged when b's is null (b's alone when a's is null, else "a · b");
 * - shipMods: the multipliers multiplied, the adds added (identity when neither has any);
 * - state: { ...a.state, m3: b.state }, so Act II's ids, convoy, floes and current stay top-level;
 * - visuals, krakenDue, addSlick: b's.
 * A missing or broken part counts as one that does nothing; nothing here throws on junk.
 */
export function composeMechanics(parts) {
  const [pa, pb] = Array.isArray(parts) ? parts : [];
  const a = isObj(pa) ? pa : {};
  const b = isObj(pb) ? pb : {};
  const fn = (m, name) => (typeof m[name] === 'function' ? m[name] : null);
  const call = (m, name, ...args) => {
    const f = fn(m, name);
    return f ? f.apply(m, args) : undefined;
  };
  const both = (name) => (...args) => {
    call(a, name, ...args);
    call(b, name, ...args);
  };
  const list = (v) => (Array.isArray(v) ? v : []);
  const text = (v) => (typeof v === 'string' && v ? v : null);
  const num = (v, d) => (finite(v) ? v : d);
  const readState = (m) => {
    try {
      const s = m.state;
      return isObj(s) ? s : {};
    } catch {
      return {};
    }
  };

  return {
    init: both('init'),
    onSpawn: both('onSpawn'),
    onCapture: both('onCapture'),
    onSink: both('onSink'),
    onRemove: both('onRemove'),
    step: both('step'),
    dispose: both('dispose'),
    steer(e, dt) {
      return call(a, 'steer', e, dt) || call(b, 'steer', e, dt) || null;
    },
    holdFire(e) {
      return !!call(a, 'holdFire', e) || !!call(b, 'holdFire', e);
    },
    drift(s) {
      const da = call(a, 'drift', s);
      const db = call(b, 'drift', s);
      const ok = (d) => isObj(d) && finite(d.vx) && finite(d.vz);
      if (!ok(db)) return ok(da) ? da : null;
      if (!ok(da)) return db;
      return { vx: da.vx + db.vx, vz: da.vz + db.vz };
    },
    avoid() {
      return [...list(call(a, 'avoid')), ...list(call(b, 'avoid'))];
    },
    shipMods(s) {
      const ma = call(a, 'shipMods', s);
      const mb = call(b, 'shipMods', s);
      const ia = !isObj(ma) || ma === IDENTITY;
      const ib = !isObj(mb) || mb === IDENTITY;
      if (ia && ib) return IDENTITY;
      const A = ia ? IDENTITY : ma;
      const B = ib ? IDENTITY : mb;
      return {
        speedMul: num(A.speedMul, 1) * num(B.speedMul, 1),
        capAdd: num(A.capAdd, 0) + num(B.capAdd, 0),
        turnMul: num(A.turnMul, 1) * num(B.turnMul, 1),
        spin: num(A.spin, 0) + num(B.spin, 0),
      };
    },
    objective() {
      const ta = call(a, 'objective');
      const tb = text(call(b, 'objective'));
      if (!tb) return ta ?? null;
      const sa = text(ta);
      return sa ? `${sa} · ${tb}` : tb;
    },
    minimap() {
      return [...list(call(a, 'minimap')), ...list(call(b, 'minimap'))];
    },
    summary() {
      return [...list(call(a, 'summary')), ...list(call(b, 'summary'))];
    },
    bonus() {
      return num(Number(call(a, 'bonus')), 0) + num(Number(call(b, 'bonus')), 0);
    },
    visuals() {
      return call(b, 'visuals') || NO_VISUALS;
    },
    addSlick(x, z) {
      call(b, 'addSlick', x, z);
    },
    get krakenDue() {
      try {
        return !!b.krakenDue;
      } catch {
        return false;
      }
    },
    get state() {
      return { ...readState(a), m3: readState(b) };
    },
  };
}
