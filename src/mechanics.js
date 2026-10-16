// Level mechanics of Act II (SPEC2 §6.3): 'convoy' (Doubloon Bay: treasure galleons run for the
// escape gates), 'floes' (Frostbite Straits: drifting ice floes crunch fast hulls) and 'current'
// (The Maelstrom: the whirlpool drags every ship in, its eye grinds hulls, the Phantom Galleon rises).
//
// Pure: no three.js, imports nothing (the Node tests load it as a data: URL, like upgrades.js).
// Every number lives in one of the tables below, so balance changes touch one place. main.js calls
// the hooks and applies what they return; the hooks never touch the scene or the DOM themselves.
//
// Conventions (§0.1): a ship with heading h faces (sin h, cos h); its starboard is (-cos h, sin h);
// relative(ship, x, z) → { along, lat, dist } with lat > 0 to starboard. Gameplay (timers, crunch
// cooldowns, eye damage, the zig-zag) runs in SIMULATED time: the sum of the dt given to step() and
// steer(), never the frame clock.
//
// createMechanics(ids, ctx) → {
//   init(),                       after the env, player and wave 0 exist (startLevel); also registers any
//                                 enemy already afloat that onSpawn has not seen, as wave 0
//   onSpawn(e, waveIndex),        after each enemy is created. Only a wave spawn (waveIndex an integer ≥ 0)
//                                 is moved (galleons to a convoy start, the Phantom beside the eye, and on
//                                 every level a later wave's ship that main put in water cut off from yours
//                                 to a spawn point in your water, see REACH); a test spawn (G.spawn: waveIndex
//                                 −1 or missing) keeps its position. Idempotent.
//   onCapture(e), onSink(e), onRemove(e),
//   step(dt),                     every simulation step, after moveShip, before separateShips
//   steer(e, dt) → { h, speed } | null,   desired heading and speed (replaces updateEnemy's attack/wait logic;
//                                 avoidance, the world edge and speedCap still apply in main)
//   holdFire(e) → boolean,        true: this enemy must not fire now (a galleon unless you are abeam within
//                                 18 u; the Phantom while she is still rising, e.rise > 0)
//   drift(s) → { vx, vz } | null, extra velocity for moveShip (main skips the glued boarding pair)
//   avoid() → [{ x, z, r }],      extra circles for enemy avoidance
//   objective() → string | null,  the #objective pill
//   minimap() → [{ kind: 'gate' | 'galleon' | 'floe' | 'vortex' | 'eye', x, z, r }],
//   summary() → string[],         lines for the level-cleared summary
//   bonus() → number,             gold added at the level end
//   get state,                    a fresh plain (JSON-able) snapshot for tests: { ids, time, relocated, convoy?,
//                                 floes?, current? } (relocated: wave ships moved out of cut-off water)
//   dispose()
// }
// ctx (from main): { env: () => env, player: () => player, enemies, fighting(e), relative(ship, x, z),
//   damage(ship, amount, x, z, source), escape(e), pop(text, x, y, z, style), showBanner(html, s),
//   announce(text), sfx(name, x, z), rng: () => number, time: () => number, def,
//   types? }   (types: optional SHIP_TYPES, to count the treasure galleons of waves not yet spawned)
// Every ctx member is optional (missing ones do nothing), and every hook takes junk without throwing.

export const MECHANIC_IDS = ['convoy', 'floes', 'current'];

// ---------------------------------------------------------------------------------------- tables

/**
 * Doubloon Bay's treasure galleons (§6.3 convoy). cruise: share of maxSpeed while nobody chases them;
 * flee: the player within this distance → full speed and a zig-zag of ±zig rad, switching every
 * zigEvery s (the first leg turns away from the player). A galleon fires only at a player abeam
 * (|along| < |lat| × abeam) within fireRange. bonus: gold per galleon taken, at the level end.
 * merchantTypes: used to count galleons of waves not yet spawned when ctx.types is missing.
 * edgeGate: a level without escape gates sends them to a gate this far inside the world edge.
 * startClear / startSpacing: a convoy start must be this far from the player / other ships.
 */
const CONVOY = {
  cruise: 0.7,
  flee: 35,
  zig: 0.4,
  zigEvery: 4,
  fireRange: 18,
  abeam: 0.45,
  bonus: 150,
  merchantTypes: ['galleon'],
  edgeGate: { inset: 25, r: 10 },
  startClear: 35,
  startSpacing: 18,
};

/** Frostbite Straits' drifting ice floes (§6.3 floes): a hull faster than `speed` inside a floe takes `damage`, at most once per `gap` s. */
const FLOES = { speed: 6, damage: 6, gap: 1.5, popY: 4 };

/**
 * The Maelstrom (§6.3 current). The env's `current` gives the numbers; these are the fallbacks for
 * missing or broken fields. avoidPad: enemies steer clear of the eye by this much more.
 */
const CURRENT = { x: 0, z: 0, r: 75, pull: 3.2, swirl: 2.8, eye: 12, eyeDps: 5, avoidPad: 4 };

/**
 * The Phantom Galleon (§6.6) rises `dist` from the whirlpool's centre in open water (clear of land by
 * `clear` beyond her half length, at least `playerClear` from the player, `spacing` from other
 * ships), facing the player; e.rise = `rise` seconds (main lowers her mesh while it counts down).
 */
const GHOST = { dist: 18, rise: 3, clear: 4, playerClear: 25, spacing: 12, tries: 12 };

/**
 * Open water you can reach (every level). main places a later wave on rings round you, checked only against
 * the colliders; but a coast ringed by colliders can hide water behind it (Frostbite Straits' fjord walls,
 * the land behind Doubloon Bay's southern shore), and a ship put there could never reach you nor you her.
 * So a wave ship (wave 1 on) that lands in water cut off from your start is moved to an env spawn point in
 * your water (§6.3: onSpawn may move a ship to an open-water spot). The water is flood-filled once per env
 * on a grid of `cell` u, keeping `pad` u off every collider and `edge` u inside the world edge. The new spot:
 * at least `playerClear` u from you (`minPlayer` if nothing else fits), `spacing` u from the other ships,
 * as close to `prefer` u from you as possible; she faces you.
 */
const REACH = { cell: 3, pad: 1.5, edge: 2, playerClear: 40, minPlayer: 35, prefer: 80, spacing: 18, maxCells: 250000 };

const EPS = 1e-9;

// --------------------------------------------------------------------------------------- helpers

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v, fallback) => (finite(v) ? v : fallback);
const isObj = (v) => v !== null && typeof v === 'object';

function wrapAngle(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

// Same as main.js relative(): the point's distance along the ship's bow and to its starboard.
function relativeLocal(ship, tx, tz) {
  const dx = tx - ship.x;
  const dz = tz - ship.z;
  const h = num(ship.h, 0);
  return {
    along: dx * Math.sin(h) + dz * Math.cos(h),
    lat: -dx * Math.cos(h) + dz * Math.sin(h),
    dist: Math.hypot(dx, dz),
  };
}

const isShip = (s) => isObj(s) && finite(s.x) && finite(s.z);
const typeOf = (s) => (isObj(s) && isObj(s.type) ? s.type : {});
/** Afloat and not on its way down. */
const afloat = (s) => isShip(s) && num(s.hp, 0) > 0 && !(num(s.sinking, 0) > 0);
/** Afloat and still part of the battle (surrendered ships too: they can still be hurt). */
const hurtable = (s) => afloat(s) && !s.captured && !s.escaped;

// The ctx from main, with every member optional and safe to call.
function wrapCtx(raw) {
  const ctx = isObj(raw) ? raw : {};
  const fn = (name) => (typeof ctx[name] === 'function' ? ctx[name] : null);
  const call = (name, ...args) => {
    const f = fn(name);
    return f ? f(...args) : undefined;
  };
  const enemies = () => {
    const list = typeof ctx.enemies === 'function' ? ctx.enemies() : ctx.enemies;
    return Array.isArray(list) ? list : [];
  };
  const player = () => {
    const p = call('player');
    return isShip(p) ? p : null;
  };
  const env = () => {
    const e = call('env');
    return isObj(e) ? e : null;
  };
  return {
    env,
    player,
    enemies,
    // Player first, then the enemies; ships only.
    ships() {
      const out = [];
      const p = player();
      if (p) out.push(p);
      for (const e of enemies()) if (isShip(e) && e !== p) out.push(e);
      return out;
    },
    fighting(e) {
      if (!isShip(e)) return false;
      const f = fn('fighting');
      return f ? !!f(e) : num(e.hp, 0) > 0 && !e.captured && !e.escaped && !e.surrendered;
    },
    relative(ship, x, z) {
      const f = fn('relative');
      const r = f ? f(ship, x, z) : null;
      return isObj(r) && finite(r.along) && finite(r.lat) && finite(r.dist) ? r : relativeLocal(ship, x, z);
    },
    damage: (ship, amount, x, z, source) => call('damage', ship, amount, x, z, source),
    escape: (e) => call('escape', e),
    pop: (text, x, y, z, style) => call('pop', text, x, y, z, style),
    showBanner: (html, s) => call('showBanner', html, s),
    announce: (text) => call('announce', text),
    sfx: (name, x, z) => call('sfx', name, x, z),
    def: isObj(ctx.def) ? ctx.def : {},
    types: isObj(ctx.types) ? ctx.types : null,
    now: 0, // simulated seconds since this level's mechanics were created (advanced by step)
  };
}

// --------------------------------------------------------------------------------------- convoy

function createConvoy(c) {
  const runs = new Map(); // galleon → { gate, gateIndex, zig, zigT, fleeing, outcome }
  const usedStarts = new Set();
  const wavesSpawned = new Set();
  let registered = 0;
  let taken = 0;
  let escaped = 0;
  let sunk = 0;

  const isMerchant = (e) => typeOf(e).merchant === true;
  const merchantName = (name) => {
    if (typeof name !== 'string') return false;
    const t = c.types && Object.prototype.hasOwnProperty.call(c.types, name) ? c.types[name] : null;
    return isObj(t) ? t.merchant === true : CONVOY.merchantTypes.includes(name);
  };
  // Treasure galleons in each wave of the level definition.
  const planned = (Array.isArray(c.def.waves) ? c.def.waves : []).map((w) =>
    Array.isArray(w) ? w.filter(merchantName).length : 0
  );
  const unspawned = () => planned.reduce((n, k, i) => n + (wavesSpawned.has(i) ? 0 : k), 0);

  const gates = () => {
    const list = c.env()?.escapes;
    return Array.isArray(list) ? list.filter((g) => isObj(g) && finite(g.x) && finite(g.z)) : [];
  };
  const starts = () => {
    const list = c.env()?.convoyStarts;
    return Array.isArray(list) ? list.filter((s) => isObj(s) && finite(s.x) && finite(s.z)) : [];
  };
  // Where the player is, or will be (the level start) before the player exists.
  const playerPos = () => {
    const p = c.player();
    if (p) return p;
    const ps = c.env()?.playerStart;
    return isObj(ps) && finite(ps.x) && finite(ps.z) ? ps : { x: 0, z: 0 };
  };

  // The escape gate farthest from the player. A level without gates gets one at the world edge,
  // straight away from the player through the galleon.
  function pickGate(e, run) {
    const p = playerPos();
    const list = gates();
    if (list.length) {
      let best = 0;
      let bestD = -1;
      list.forEach((g, i) => {
        const d = Math.hypot(g.x - p.x, g.z - p.z);
        if (d > bestD) {
          bestD = d;
          best = i;
        }
      });
      const g = list[best];
      run.gate = { x: g.x, z: g.z, r: Math.max(0, num(g.r, CONVOY.edgeGate.r)) };
      run.gateIndex = best;
      return;
    }
    let dx = e.x - p.x;
    let dz = e.z - p.z;
    if (Math.hypot(dx, dz) < 1) {
      dx = e.x || 0;
      dz = e.z || 1;
    }
    const d = Math.hypot(dx, dz) || 1;
    const R = Math.max(0, num(c.env()?.worldRadius, 150) - CONVOY.edgeGate.inset);
    run.gate = { x: (dx / d) * R, z: (dz / d) * R, r: CONVOY.edgeGate.r };
    run.gateIndex = -1;
  }

  // Move a galleon of a wave to the nearest unused convoy start (preferring starts well away from the
  // player and the other ships).
  function moveToStart(e) {
    const list = starts();
    if (!list.length) return null;
    const p = c.player();
    const others = c.ships().filter((s) => s !== e && s !== p && afloat(s));
    const free = (s) =>
      (!p || Math.hypot(s.x - p.x, s.z - p.z) >= CONVOY.startClear) &&
      others.every((o) => Math.hypot(o.x - s.x, o.z - s.z) >= CONVOY.startSpacing);
    const unused = list.map((s, i) => i).filter((i) => !usedStarts.has(i));
    const pools = [unused.filter((i) => free(list[i])), unused, list.map((s, i) => i)];
    const pool = pools.find((q) => q.length);
    let best = pool[0];
    let bestD = Infinity;
    for (const i of pool) {
      const d = Math.hypot(list[i].x - e.x, list[i].z - e.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const s = list[best];
    usedStarts.add(best);
    e.x = s.x;
    e.z = s.z;
    return s;
  }

  function register(e) {
    let run = runs.get(e);
    if (run) return run;
    run = { gate: null, gateIndex: -1, zig: 1, zigT: 0, fleeing: false, outcome: null };
    runs.set(e, run);
    registered++;
    return run;
  }
  function ensure(e) {
    const run = register(e);
    if (!run.gate) pickGate(e, run);
    return run;
  }

  return {
    onSpawn(e, waveIndex) {
      const wave = Number.isInteger(waveIndex) && waveIndex >= 0;
      if (wave) wavesSpawned.add(waveIndex);
      if (!isMerchant(e)) return;
      const run = register(e);
      const start = wave ? moveToStart(e) : null;
      pickGate(e, run);
      // A wave's galleon sets out with the convoy start's heading, or straight for her gate.
      if (start) e.h = finite(start.h) ? wrapAngle(start.h) : Math.atan2(run.gate.x - e.x, run.gate.z - e.z);
    },
    onCapture(e) {
      if (!isMerchant(e)) return;
      const run = ensure(e);
      if (run.outcome) return;
      run.outcome = 'taken';
      taken++;
    },
    onSink(e) {
      if (!isMerchant(e)) return;
      const run = ensure(e);
      if (run.outcome) return;
      run.outcome = 'sunk';
      sunk++;
    },
    onRemove(e) {
      const run = runs.get(e);
      if (run && !run.outcome) run.outcome = 'gone';
    },
    step() {
      for (const [e, run] of runs) {
        if (run.outcome || !run.gate || !c.fighting(e)) continue;
        if (Math.hypot(e.x - run.gate.x, e.z - run.gate.z) <= run.gate.r) {
          run.outcome = 'escaped';
          escaped++;
          c.escape(e);
          c.showBanner('The galleon escaped with its gold!', 2.5);
          c.announce('A treasure galleon escaped with its gold.');
        }
      }
    },
    steer(e, dt) {
      if (!isMerchant(e) || !c.fighting(e)) return null;
      const run = ensure(e);
      if (run.outcome) return null;
      const t = typeOf(e);
      const max = Math.max(0, num(t.maxSpeed, 0));
      const toGate = Math.atan2(run.gate.x - e.x, run.gate.z - e.z);
      const p = c.player();
      const chased = p && afloat(p) && Math.hypot(p.x - e.x, p.z - e.z) < CONVOY.flee;
      if (!chased) {
        run.fleeing = false;
        return { h: wrapAngle(toGate), speed: max * CONVOY.cruise };
      }
      if (!run.fleeing) {
        // A new chase: the first leg turns away from the player (h grows toward port).
        run.fleeing = true;
        run.zigT = 0;
        run.zig = c.relative(e, p.x, p.z).lat > 0 ? 1 : -1;
      } else {
        run.zigT += Math.max(0, num(dt, 0));
        while (run.zigT >= CONVOY.zigEvery - EPS) {
          run.zigT -= CONVOY.zigEvery;
          run.zig = -run.zig;
        }
      }
      return { h: wrapAngle(toGate + run.zig * CONVOY.zig), speed: max };
    },
    holdFire(e) {
      if (!isMerchant(e)) return false;
      const p = c.player();
      if (!p || !afloat(p)) return true;
      const r = c.relative(e, p.x, p.z);
      return !(r.dist <= CONVOY.fireRange && Math.abs(r.along) < Math.abs(r.lat) * CONVOY.abeam);
    },
    objective() {
      const n = unspawned();
      if (registered + n === 0) return null;
      let afloatNow = 0;
      for (const run of runs.values()) if (!run.outcome) afloatNow++;
      return `Galleons: ${taken} taken · ${escaped} escaped · ${afloatNow + n} to go`;
    },
    minimap() {
      const out = [];
      const seen = new Set();
      const addGate = (g) => {
        const key = `${g.x},${g.z}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ kind: 'gate', x: g.x, z: g.z, r: Math.max(0, num(g.r, CONVOY.edgeGate.r)) });
      };
      gates().forEach(addGate);
      for (const run of runs.values()) if (!run.outcome && run.gate && run.gateIndex < 0) addGate(run.gate);
      for (const [e, run] of runs) {
        if (run.outcome || !c.fighting(e)) continue;
        out.push({ kind: 'galleon', x: e.x, z: e.z, r: Math.max(1, num(typeOf(e).len, 14) / 2) });
      }
      return out;
    },
    summary() {
      const total = registered + unspawned();
      return total ? [`Galleons taken: ${taken} of ${total}`] : [];
    },
    bonus() {
      return CONVOY.bonus * taken;
    },
    snapshot() {
      const n = unspawned();
      let afloatNow = 0;
      for (const run of runs.values()) if (!run.outcome) afloatNow++;
      const list = c.enemies();
      return {
        total: registered + n,
        unspawned: n,
        taken,
        escaped,
        sunk,
        toGo: afloatNow + n,
        bonus: CONVOY.bonus * taken,
        gates: gates().map((g) => ({ x: g.x, z: g.z, r: num(g.r, CONVOY.edgeGate.r) })),
        runners: [...runs].map(([e, run]) => ({
          index: list.indexOf(e),
          type: typeof e.typeName === 'string' ? e.typeName : null,
          x: e.x,
          z: e.z,
          gate: run.gateIndex,
          gateX: run.gate ? run.gate.x : null,
          gateZ: run.gate ? run.gate.z : null,
          fleeing: run.fleeing,
          zig: run.zig,
          outcome: run.outcome,
        })),
      };
    },
    dispose() {
      runs.clear();
      usedStarts.clear();
    },
  };
}

// ---------------------------------------------------------------------------------------- floes

function createFloes(c) {
  const last = new Map(); // ship → simulated time of its last crunch
  let crunches = 0;
  let cachedReefs;
  let cachedLength = -1;
  let cached = [];
  // The ice floes are env.reefs entries with ice: true, moved in place by env.step(simTime).
  function floes() {
    const reefs = c.env()?.reefs;
    if (!Array.isArray(reefs)) return (cached = []);
    if (reefs !== cachedReefs || reefs.length !== cachedLength) {
      cachedReefs = reefs;
      cachedLength = reefs.length;
      cached = reefs.filter((r) => isObj(r) && r.ice === true);
    }
    return cached;
  }
  const valid = (f) => finite(f.x) && finite(f.z) && finite(f.r) && f.r > 0;

  return {
    init() {
      floes();
    },
    step() {
      const list = floes();
      if (!list.length) return;
      const p = c.player();
      for (const s of c.ships()) {
        if (!hurtable(s) || !(Math.abs(num(s.speed, 0)) > FLOES.speed)) continue;
        const prev = last.get(s);
        if (prev !== undefined && c.now - prev < FLOES.gap - EPS) continue;
        if (!list.some((f) => valid(f) && Math.hypot(s.x - f.x, s.z - f.z) < f.r)) continue;
        last.set(s, c.now);
        crunches++;
        c.damage(s, FLOES.damage, s.x, s.z, 'ice');
        c.pop('CRUNCH!', s.x, FLOES.popY, s.z, s === p ? 'bad' : 'dmg');
        c.sfx('crunch', s.x, s.z);
      }
    },
    onRemove(e) {
      last.delete(e);
    },
    minimap() {
      return floes()
        .filter(valid)
        .map((f) => ({ kind: 'floe', x: f.x, z: f.z, r: f.r }));
    },
    snapshot() {
      return { count: floes().length, crunches, floes: floes().map((f) => ({ x: f.x, z: f.z, r: f.r })) };
    },
    dispose() {
      last.clear();
      cached = [];
      cachedReefs = undefined;
    },
  };
}

// -------------------------------------------------------------------------------------- current

function createCurrent(c) {
  const acc = new Map(); // ship → seconds in the eye not yet turned into damage
  let warned = false;
  let eyeDamage = 0;
  let cachedEnv;
  let cachedSrc;
  let cached = null;
  // The whirlpool from env.current, with the CURRENT fallbacks for missing or broken numbers.
  function vortex() {
    const env = c.env();
    const src = env?.current;
    if (env !== cachedEnv || src !== cachedSrc) {
      cachedEnv = env;
      cachedSrc = src;
      cached = isObj(src)
        ? {
            x: num(src.x, CURRENT.x),
            z: num(src.z, CURRENT.z),
            r: Math.max(0, num(src.r, CURRENT.r)),
            pull: num(src.pull, CURRENT.pull),
            swirl: num(src.swirl, CURRENT.swirl),
            eye: Math.max(0, num(src.eye, CURRENT.eye)),
            eyeDps: Math.max(0, num(src.eyeDps, CURRENT.eyeDps)),
          }
        : null;
    }
    return cached;
  }
  const isGhost = (s) => typeOf(s).ghost === true;

  // Rise from the deep GHOST.dist from the centre, in open water, facing the player.
  function placeGhost(e) {
    const v = vortex() || CURRENT;
    const env = c.env();
    const p = c.player();
    const ps = env?.playerStart;
    const px = p ? p.x : num(ps?.x, v.x);
    const pz = p ? p.z : num(ps?.z, v.z + 1);
    const cols = Array.isArray(env?.colliders) ? env.colliders.filter((k) => isObj(k) && finite(k.x) && finite(k.z)) : [];
    const half = Math.max(0, num(typeOf(e).len, 0)) / 2;
    const others = c.ships().filter((s) => s !== e && s !== p && afloat(s));
    const base = Math.hypot(px - v.x, pz - v.z) > EPS ? Math.atan2(px - v.x, pz - v.z) : 0;
    let pick = null;
    let fallback = null;
    let fallbackD = -1;
    // Try the bearing toward the player first, then fan out to both sides.
    for (let i = 0; i < GHOST.tries; i++) {
      const k = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2);
      const a = base + (k * Math.PI * 2) / GHOST.tries;
      const x = v.x + Math.sin(a) * GHOST.dist;
      const z = v.z + Math.cos(a) * GHOST.dist;
      if (cols.some((col) => Math.hypot(col.x - x, col.z - z) < Math.max(0, num(col.r, 0)) + half + GHOST.clear)) continue;
      const dp = Math.hypot(px - x, pz - z);
      if (dp > fallbackD) {
        fallbackD = dp;
        fallback = { x, z };
      }
      if (p && dp < GHOST.playerClear) continue;
      if (others.some((o) => Math.hypot(o.x - x, o.z - z) < GHOST.spacing)) continue;
      pick = { x, z };
      break;
    }
    const spot = pick || fallback;
    if (!spot) return;
    e.x = spot.x;
    e.z = spot.z;
    e.h = Math.atan2(px - spot.x, pz - spot.z);
  }

  return {
    init() {
      vortex();
    },
    onSpawn(e, waveIndex) {
      if (!isGhost(e)) return;
      if (Number.isInteger(waveIndex) && waveIndex >= 0) placeGhost(e);
      e.rise = GHOST.rise;
      const name = typeof typeOf(e).name === 'string' ? typeOf(e).name : 'The Phantom Galleon';
      c.showBanner(`${name} rises!<small>Scatter her ghost crew with grape shot, then board her!</small>`, 3);
      c.sfx('ghost', e.x, e.z);
    },
    step(dt) {
      const v = vortex();
      if (!v) return;
      const interval = v.eyeDps > 0 ? 1 / v.eyeDps : Infinity;
      const p = c.player();
      for (const s of c.ships()) {
        if (!hurtable(s) || isGhost(s) || !(Math.hypot(s.x - v.x, s.z - v.z) < v.eye)) {
          acc.delete(s);
          continue;
        }
        if (s === p && !warned) {
          warned = true;
          c.showBanner('The maelstrom pulls you in!<small>Steer out of the eye!</small>', 2.5);
        }
        let a = (acc.get(s) ?? 0) + Math.max(0, num(dt, 0));
        while (a >= interval - EPS && hurtable(s)) {
          a -= interval;
          eyeDamage++;
          c.damage(s, 1, s.x, s.z, 'maelstrom');
        }
        acc.set(s, Math.max(0, a));
      }
    },
    drift(s) {
      const v = vortex();
      if (!v || !isShip(s) || isGhost(s)) return null;
      const dx = s.x - v.x;
      const dz = s.z - v.z;
      const d = Math.hypot(dx, dz);
      if (!(d < v.r)) return null;
      if (d < EPS) return { vx: 0, vz: 0 };
      const k = 1 - d / v.r;
      // Pulled toward the centre and swirled round it like a disc whose rotation.y increases.
      return {
        vx: (-v.pull * k * dx) / d + (v.swirl * k * dz) / d,
        vz: (-v.pull * k * dz) / d - (v.swirl * k * dx) / d,
      };
    },
    holdFire(e) {
      // Not while she is still rising out of the sea.
      return isGhost(e) && num(e.rise, 0) > 0;
    },
    avoid() {
      const v = vortex();
      return v ? [{ x: v.x, z: v.z, r: v.eye + CURRENT.avoidPad }] : [];
    },
    onRemove(e) {
      acc.delete(e);
    },
    minimap() {
      const v = vortex();
      return v
        ? [
            { kind: 'vortex', x: v.x, z: v.z, r: v.r },
            { kind: 'eye', x: v.x, z: v.z, r: v.eye },
          ]
        : [];
    },
    snapshot() {
      const v = vortex();
      return { ...(v || {}), active: !!v, warned, eyeDamage };
    },
    dispose() {
      acc.clear();
    },
  };
}

const FACTORIES = { convoy: createConvoy, floes: createFloes, current: createCurrent };

// ---------------------------------------------------------------------------------- reachable water

function createReach(c) {
  let cachedEnv;
  let cachedCount = -1;
  let water = null; // { R, N, cell, seen: Uint8Array } or null (no env / no colliders: everything counts)
  let relocated = 0;

  function build(env) {
    const R = num(env.worldRadius, 0);
    const cols = (Array.isArray(env.colliders) ? env.colliders : []).filter((k) => isObj(k) && finite(k.x) && finite(k.z) && finite(k.r));
    if (!(R > 0) || !cols.length) return null;
    const cell = REACH.cell;
    const N = Math.ceil((2 * R) / cell);
    if (N * N > REACH.maxCells) return null;
    // Open water: inside the world edge, then every collider rubs out the cells it covers (only the cells
    // in its own bounding box are visited, so a coast of a hundred rocks costs a few milliseconds).
    const open = new Uint8Array(N * N);
    for (let i = 0; i < N; i++) {
      const x = -R + (i + 0.5) * cell;
      for (let j = 0; j < N; j++) {
        const z = -R + (j + 0.5) * cell;
        if (Math.hypot(x, z) <= R - REACH.edge) open[i * N + j] = 1;
      }
    }
    const idx = (v) => Math.floor((v + R) / cell);
    for (const k of cols) {
      const rr = Math.max(0, k.r) + REACH.pad;
      const i0 = Math.max(0, idx(k.x - rr));
      const i1 = Math.min(N - 1, idx(k.x + rr));
      const j0 = Math.max(0, idx(k.z - rr));
      const j1 = Math.min(N - 1, idx(k.z + rr));
      for (let i = i0; i <= i1; i++) {
        const x = -R + (i + 0.5) * cell;
        for (let j = j0; j <= j1; j++) {
          if (Math.hypot(k.x - x, k.z - (-R + (j + 0.5) * cell)) < rr) open[i * N + j] = 0;
        }
      }
    }
    // Seed: the player start (or the open cell nearest to it).
    const ps = isObj(env.playerStart) && finite(env.playerStart.x) && finite(env.playerStart.z) ? env.playerStart : { x: 0, z: 0 };
    let seed = -1;
    let seedD = Infinity;
    for (let k = 0; k < N * N; k++) {
      if (!open[k]) continue;
      const d = Math.hypot(-R + (Math.floor(k / N) + 0.5) * cell - ps.x, -R + ((k % N) + 0.5) * cell - ps.z);
      if (d < seedD) {
        seedD = d;
        seed = k;
      }
    }
    if (seed < 0) return null;
    const seen = new Uint8Array(N * N);
    const stack = [seed];
    seen[seed] = 1;
    while (stack.length) {
      const k = stack.pop();
      const i = Math.floor(k / N);
      const j = k % N;
      if (i > 0 && open[k - N] && !seen[k - N]) (seen[k - N] = 1), stack.push(k - N);
      if (i < N - 1 && open[k + N] && !seen[k + N]) (seen[k + N] = 1), stack.push(k + N);
      if (j > 0 && open[k - 1] && !seen[k - 1]) (seen[k - 1] = 1), stack.push(k - 1);
      if (j < N - 1 && open[k + 1] && !seen[k + 1]) (seen[k + 1] = 1), stack.push(k + 1);
    }
    return { R, N, cell, seen };
  }
  function map() {
    const env = c.env();
    if (!env) return null;
    const count = Array.isArray(env.colliders) ? env.colliders.length : 0;
    if (env !== cachedEnv || count !== cachedCount) {
      cachedEnv = env;
      cachedCount = count;
      water = build(env);
    }
    return water;
  }
  // In your water: the point's cell or one next to it (a ship hard by a coast sits in a padded-out cell).
  function reachable(x, z) {
    const w = map();
    if (!w) return true;
    const i0 = Math.floor((x + w.R) / w.cell);
    const j0 = Math.floor((z + w.R) / w.cell);
    for (let i = i0 - 1; i <= i0 + 1; i++) {
      for (let j = j0 - 1; j <= j0 + 1; j++) {
        if (i >= 0 && j >= 0 && i < w.N && j < w.N && w.seen[i * w.N + j]) return true;
      }
    }
    return false;
  }
  function relocate(e) {
    const env = c.env();
    const spots = (Array.isArray(env?.enemySpawns) ? env.enemySpawns : []).filter((s) => isObj(s) && finite(s.x) && finite(s.z) && reachable(s.x, s.z));
    if (!spots.length) return false;
    const p = c.player();
    const ps = isObj(env.playerStart) && finite(env.playerStart.x) && finite(env.playerStart.z) ? env.playerStart : { x: 0, z: 0 };
    const px = p ? p.x : ps.x;
    const pz = p ? p.z : ps.z;
    const others = c.ships().filter((s) => s !== e && s !== p && afloat(s) && !s.captured && !s.escaped);
    const dP = (s) => Math.hypot(s.x - px, s.z - pz);
    const spaced = (s) => others.every((o) => Math.hypot(o.x - s.x, o.z - s.z) >= REACH.spacing);
    const pools = [
      spots.filter((s) => dP(s) >= REACH.playerClear && spaced(s)),
      spots.filter((s) => dP(s) >= REACH.minPlayer && spaced(s)),
      spots.filter((s) => dP(s) >= REACH.minPlayer),
    ];
    const pool = pools.find((q) => q.length);
    let best = null;
    if (pool) {
      for (const s of pool) if (!best || Math.abs(dP(s) - REACH.prefer) < Math.abs(dP(best) - REACH.prefer)) best = s;
    } else {
      for (const s of spots) if (!best || dP(s) > dP(best)) best = s;
    }
    e.x = best.x;
    e.z = best.z;
    e.h = Math.atan2(px - best.x, pz - best.z);
    relocated++;
    return true;
  }
  return {
    reachable,
    // Level start (init): map the water now, while the level flies in, not when the next wave arrives.
    prepare() {
      map();
    },
    // A wave ship (wave 1 on) in water cut off from yours goes to a spawn point in your water.
    onSpawn(e, waveIndex) {
      if (!(Number.isInteger(waveIndex) && waveIndex >= 1) || reachable(e.x, e.z)) return;
      relocate(e);
    },
    get relocated() {
      return relocated;
    },
  };
}

// ------------------------------------------------------------------------------------ the hooks

export function createMechanics(ids, ctx) {
  const c = wrapCtx(ctx);
  const list = [];
  if (Array.isArray(ids)) {
    for (const id of ids) if (typeof id === 'string' && MECHANIC_IDS.includes(id) && !list.includes(id)) list.push(id);
  }
  const parts = list.map((id) => ({ id, m: FACTORIES[id](c) }));
  const reach = createReach(c);
  const seen = new WeakSet(); // ships onSpawn has handled
  const each = (name, ...args) => {
    for (const { m } of parts) if (m[name]) m[name](...args);
  };

  const api = {
    init() {
      each('init');
      reach.prepare();
      // Wave 0 may have been spawned before the mechanics existed.
      for (const e of [...c.enemies()]) if (isShip(e) && !seen.has(e)) api.onSpawn(e, 0);
    },
    onSpawn(e, waveIndex) {
      if (!isShip(e) || seen.has(e)) return;
      seen.add(e);
      each('onSpawn', e, waveIndex);
      reach.onSpawn(e, waveIndex); // (after the level's own placement: a galleon's start, the Phantom's ring)
    },
    onCapture(e) {
      if (isShip(e)) each('onCapture', e);
    },
    onSink(e) {
      if (isShip(e)) each('onSink', e);
    },
    onRemove(e) {
      if (isObj(e)) each('onRemove', e);
    },
    step(dt) {
      const d = Math.max(0, num(dt, 0));
      c.now += d;
      each('step', d);
    },
    steer(e, dt) {
      if (!isShip(e)) return null;
      for (const { m } of parts) {
        const r = m.steer ? m.steer(e, dt) : null;
        if (r) return r;
      }
      return null;
    },
    holdFire(e) {
      if (!isShip(e)) return false;
      return parts.some(({ m }) => (m.holdFire ? m.holdFire(e) : false));
    },
    drift(s) {
      if (!isShip(s)) return null;
      let out = null;
      for (const { m } of parts) {
        const v = m.drift ? m.drift(s) : null;
        if (!v) continue;
        out = out || { vx: 0, vz: 0 };
        out.vx += v.vx;
        out.vz += v.vz;
      }
      return out;
    },
    avoid() {
      return parts.flatMap(({ m }) => (m.avoid ? m.avoid() : []));
    },
    objective() {
      const lines = parts.map(({ m }) => (m.objective ? m.objective() : null)).filter((t) => typeof t === 'string' && t);
      return lines.length ? lines.join(' · ') : null;
    },
    minimap() {
      return parts.flatMap(({ m }) => (m.minimap ? m.minimap() : []));
    },
    summary() {
      return parts.flatMap(({ m }) => (m.summary ? m.summary() : []));
    },
    bonus() {
      return parts.reduce((n, { m }) => n + (m.bonus ? m.bonus() : 0), 0);
    },
    get state() {
      const s = { ids: [...list], time: c.now, relocated: reach.relocated };
      for (const { id, m } of parts) s[id] = m.snapshot();
      return s;
    },
    dispose() {
      each('dispose');
    },
  };
  return api;
}
