// Unit checks for Voyage IV's pseudo foes in src/foes4.js (plain Node, no browser), SPEC4 §3.1, §3.3, §3.5, §11.1,
// §13.1. The simulation runs against a mock of the ctx main.js hands it, with a scripted ship (yours) and pirates:
// - the API: exact exports, the tables as §3.1, none of STATUS / POOL_RULES / PACKS / MEET copied into them
// - Monkey Jollyboats: the ring at 10–14 u, a coconut every 6–8 s, ≤ 2 in the air, a ≥ 1.5 s warning (+ the bonus),
//   damage only inside the ring (pirates too), grape tips any boat, a hull touch tips it, 10 gold a boat
// - Puffer Mines: drift only within 25 u, puff at 6 u, warn ≥ 1.5 s, pop 8 to every hull within 4 u, a hit sends one
//   home safely, 40 s life, ≤ 6 alive in every mix (patch min(4, 6 − alive), the Witch's summons, a full sea makes a
//   patch wait with its slot alive), slots() ignores owned puffers, sendHome(owner) leaves a wave's patch
// - Old Coilback: its cycle times, rearing 14–16 u off, the lane from its head to 4 u past the predicted spot (a
//   standing player is always inside it), untargetable while under, a lane warning ≥ 1.6 s, damage only inside the
//   lane, dizzy ×2, humps ×0.5, Frost / Stink from COILBACK and Fire from ctx.tables, its spots never on land
// - Rock Forts: track 1.3 s + lock 0.5 s (≥ 1.8 s), fires along the locked line (a ship that moved off is safe), the
//   first hull on the line only, pirates too, 100 gold
// - hold() holds every new telegraph and timer; the first-meeting grace (ctx.isNew); every warning shape takes a
//   ctx.warn slot (a 7th waits); boardWhy, tags(), slots(); determinism; a junk ctx never throws
// The 1C exit check is the "EXIT" block at the end.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failures = 0;
let passes = 0;
function check(cond, msg) {
  console.log(`${cond === true ? 'PASS' : 'FAIL'}  ${msg}`);
  if (cond === true) passes++;
  else failures++;
}

// foes4.js imports nothing: it loads from its source as a data: URL. (FOES4_JS points the suite at another copy, for
// checking that the checks catch a broken one.)
async function load(rel, env) {
  const file = env && process.env[env] ? process.env[env] : path.join(ROOT, rel);
  const src = fs.readFileSync(file, 'utf8');
  if (/^\s*import\s[^(]/m.test(src)) throw new Error(`${rel} has imports now; load it another way`);
  return import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const f2 = (v) => (typeof v === 'number' ? v.toFixed(2) : String(v));
const DT = 1 / 120; // main's simulation substep
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// a hull's centre line (bow to stern); a ring covers it when the line comes within the ring's radius
function hullDist(p, x, z) {
  const fx = Math.sin(p.h);
  const fz = Math.cos(p.h);
  const half = p.len / 2;
  const along = clamp((x - p.x) * fx + (z - p.z) * fz, -half, half);
  return Math.hypot(x - (p.x + fx * along), z - (p.z + fz * along));
}
function segPt(px, pz, x0, z0, x1, z1) {
  const ux = x1 - x0;
  const uz = z1 - z0;
  const L2 = ux * ux + uz * uz;
  const u = L2 > 1e-12 ? clamp(((px - x0) * ux + (pz - z0) * uz) / L2, 0, 1) : 0;
  return Math.hypot(px - (x0 + ux * u), pz - (z0 + uz * u));
}
// the distance from a hull's centre line to a segment (sampled finely; exact enough for a lane test)
function hullSeg(p, x0, z0, x1, z1) {
  let best = Infinity;
  for (let i = 0; i <= 40; i++) {
    const k = i / 40 - 0.5;
    const x = p.x + Math.sin(p.h) * p.len * k;
    const z = p.z + Math.cos(p.h) * p.len * k;
    best = Math.min(best, segPt(x, z, x0, z0, x1, z1));
  }
  return best;
}

// Real tables main passes (SPEC3 §11.1, SPEC4 §3.2): STATUS of specials.js, POOL_RULES / PACKS / MEET of pools.js.
const TABLES = {
  STATUS: { fire: { dps: 3, time: 6, boss: 3 }, frost: { speed: 0.5, turn: 0.6, time: 5, add: 2, max: 8, bossMul: 0.5 }, stink: { time: 4, boss: 2, immune: 10, bossImmune: 20, grit: 0.75, decel: 2 }, kaboom: { burst: 15 } },
  POOL_RULES: { puffersAlive: 6 },
  PACKS: { jolly: 5, puffer: 4 },
  MEET: { card: 3.5, grace: 4, newTag: 10 },
};

// A world: the foes, your scripted ship (len 10, wid 3.6), pirates (plain hulls), land circles, the logs.
function makeWorld(F, o = {}) {
  const rng = mulberry32(o.seed ?? 7);
  const player = { x: 0, z: 0, h: 0, speed: 0, len: 10, wid: 3.6, ...(o.player || {}) };
  const ships = (o.ships || []).map((s) => ({ len: 10, wid: 3.6, h: 0, kind: 'corsair', ...s }));
  const lands = o.lands || [];
  const log = { damage: [], coins: [], gold: [], pops: [], sfx: [], live: [], warn: [] };
  const warn = {
    max: o.warnMax ?? Infinity,
    count: 0,
    take(kind) {
      if (this.count >= this.max) return false;
      this.count++;
      log.warn.push({ t: w.t, kind, take: true });
      return true;
    },
    give(kind) {
      this.count = Math.max(0, this.count - 1);
      log.warn.push({ t: w.t, kind, take: false });
    },
  };
  const w = {
    t: 0,
    player,
    ships,
    log,
    warn,
    hold: false,
    isNew: o.isNew || (() => false),
    script: o.script || null,
    alive: true,
  };
  const ctx = {
    player: () => (w.alive ? { ...player } : null),
    ships: () => ships.map((s) => ({ ...s })),
    damage: (target, amount, x, z, source) => {
      const hull = target === 'player' ? player : ships.find((s) => s.id === target);
      log.damage.push({ t: w.t, target, amount, x, z, source, at: hull ? { x: hull.x, z: hull.z, h: hull.h, len: hull.len, wid: hull.wid } : null });
    },
    land: (x, z, r) => lands.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + (Number(r) || 0)),
    world: { x: 0, z: 0, r: o.worldR ?? 150 },
    rng: () => rng(),
    warnBonus: () => o.bonus ?? 0,
    warn,
    pop: (text, x, y, z, style) => log.pops.push({ t: w.t, text, x, z, style }),
    announce: (text) => log.live.push({ t: w.t, text }),
    sfx: (name, x, z, opts) => log.sfx.push({ t: w.t, name, x, z, opts }),
    coins: (x, z, gold) => log.coins.push({ t: w.t, x, z, gold }),
    gold: (n, why) => log.gold.push({ t: w.t, n, why }),
    drift: o.drift || (() => null),
    isNew: (kind) => w.isNew(kind, w.t),
    hold: () => w.hold,
    tables: o.tables || TABLES,
  };
  w.ctx = ctx;
  w.f = F.createFoes4(ctx);
  w.step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      if (w.script) w.script(w, DT);
      w.f.step(DT);
      // pushes (the Coilback's shove) move the hulls, as main does
      for (const s of [player, ...ships]) {
        const v = w.f.push(s === player ? { ...s, kind: 'player' } : s);
        if (v) {
          s.x += v.vx * DT;
          s.z += v.vz * DT;
        }
      }
      w.t += DT;
    }
  };
  w.run = (secs, each) => {
    const n = Math.round(secs / DT);
    for (let i = 0; i < n; i++) {
      w.step();
      if (each && each(w) === false) return;
    }
  };
  return w;
}
// scripted players
const sail = (speed, turn = 0) => (w, dt) => {
  const p = w.player;
  p.h += turn * dt;
  p.speed = speed;
  p.x += Math.sin(p.h) * speed * dt;
  p.z += Math.cos(p.h) * speed * dt;
};
function wander(seed) {
  const r = mulberry32(seed);
  let turn = 0;
  let next = 0;
  return (w, dt) => {
    if (w.t >= next) {
      turn = (r() - 0.5) * 0.8;
      next = w.t + 2 + r() * 4;
    }
    const p = w.player;
    p.h += turn * dt;
    p.speed = 8;
    p.x += Math.sin(p.h) * 8 * dt;
    p.z += Math.cos(p.h) * 8 * dt;
    if (Math.hypot(p.x, p.z) > 100) p.h = Math.atan2(-p.x, -p.z);
  };
}

(async () => {
  const F = await load('src/foes4.js', 'FOES4_JS');
  const { JOLLY, PUFFER, COILBACK, FORT, FOE_NAMES, createFoes4 } = F;
  // audio.js's SFX_NAMES, read from its source text (this suite runs no audio code)
  let audioNames = null;
  try {
    const m = fs.readFileSync(path.join(ROOT, 'src/audio.js'), 'utf8').match(/export const SFX_NAMES = \[([\s\S]*?)\];/);
    audioNames = m ? [...m[1].replace(/\/\/[^\n]*/g, '').matchAll(/'([^']+)'/g)].map((x) => x[1]) : null;
  } catch {
    audioNames = null;
  }
  let WORDS4 = null;
  try {
    WORDS4 = (await load('src/mechanics4.js')).WORDS4;
  } catch (e) {
    check(false, `mechanics4.js loads (${e.message})`);
  }
  // the real tables, when the modules exist (the mock copies above must match them)
  try {
    const S = await load('src/specials.js');
    check(same(S.STATUS, TABLES.STATUS), 'the mock STATUS is specials.js STATUS');
  } catch (e) {
    check(false, `specials.js loads (${e.message})`);
  }
  try {
    const P = await load('src/pools.js');
    check(P.POOL_RULES.puffersAlive === 6 && same({ ...P.PACKS }, TABLES.PACKS) && same({ ...P.MEET }, TABLES.MEET), 'the mock POOL_RULES.puffersAlive, PACKS and MEET are pools.js\'s');
    check(['jolly', 'puffer', 'coilback', 'fort'].every((k) => P.isPseudo(k)), "pools.js's isPseudo names all four of foes4's kinds");
  } catch (e) {
    check(false, `pools.js loads (${e.message})`);
  }

  // ================================================================ API and tables
  {
    const keys = Object.keys(F).sort();
    check(same(keys, ['COILBACK', 'FOE_NAMES', 'FORT', 'JOLLY', 'PUFFER', 'createFoes4']), `exports exactly §11.1's (${keys.join(', ')})`);
    const api = Object.keys(createFoes4({})).sort();
    const want = ['alive', 'boardWhy', 'dispose', 'hit', 'hits', 'push', 'sendHome', 'slots', 'spawn', 'special', 'state', 'step', 'tags', 'targets', 'visuals'];
    check(same(api, want), `createFoes4() has §11.1's members plus push (${api.join(', ')})`);
    check(same(FOE_NAMES, { jolly: 'Monkey Jollyboats', puffer: 'Puffer Mines', coilback: 'Old Coilback', fort: 'Rock Fort', shellback: 'The Shellback' }), 'FOE_NAMES names every pseudo kind');
    check(JOLLY.hp === 10 && JOLLY.len === 3.2 && JOLLY.wid === 1.4 && JOLLY.speed === 11 && JOLLY.accel === 5 && JOLLY.turn === 2.2 && same(JOLLY.ring, [10, 14]) && same(JOLLY.every, [6, 8]) && JOLLY.aim === 3 && JOLLY.inAir === 2 && JOLLY.coconut.r === 2.2 && JOLLY.coconut.damage === 3 && JOLLY.coconut.warn === 1.5 && JOLLY.gold === 10 && JOLLY.wordGap === 3, 'JOLLY as §3.1 (10 hp, 3.2 × 1.4, 11 u/s, accel 5, turn 2.2, ring 10–14, 6–8 s, ±3, 2 in the air, r 2.2, 3 damage, 1.5 s, 10 gold)');
    check(PUFFER.hp === 6 && PUFFER.r === 0.9 && PUFFER.drift === 1.4 && PUFFER.sense === 25 && PUFFER.near === 6 && PUFFER.pop.r === 4 && PUFFER.pop.damage === 8 && PUFFER.pop.warn === 1.5 && PUFFER.life === 40 && PUFFER.gold === 2 && PUFFER.swell === 2 && PUFFER.pulse <= 1, 'PUFFER as §3.1 (6 hp, r 0.9, 1.4 u/s, 25 u, puff at 6, pop r 4 for 8, 1.5 s, life 40, 2 gold, swells ×2, ≤ 1 Hz)');
    check(COILBACK.hp === 450 && COILBACK.head.r === 1.6 && COILBACK.head.y === 2.5 && COILBACK.head.dizzy === 2 && COILBACK.hump.n === 3 && COILBACK.hump.r === 1.2 && COILBACK.hump.mul === 0.5 && COILBACK.speed === 9 && same(COILBACK.circle, [22, 28]) && COILBACK.swim === 6 && COILBACK.dive === 2 && COILBACK.under === 3 && same(COILBACK.rear, [14, 16]) && COILBACK.lane.warn === 1.6 && COILBACK.lane.w === 4 && COILBACK.lane.past === 4 && COILBACK.lane.max === 30 && COILBACK.lane.lunge === 0.5 && COILBACK.lane.damage === 12 && COILBACK.lane.shove === 3 && COILBACK.dizzy === 4 && COILBACK.gold === 150 && COILBACK.frost.noDive === 8 && COILBACK.frost.lane === 0.5 && COILBACK.stink.noLunge === 6, 'COILBACK as §3.1 (450 hp, head r 1.6 at 2.5, 3 humps r 1.2 ×0.5, 9 u/s, 22–28, 6/2/3 s, rear 14–16, lane 1.6 s 4 × ≤ 30 u +4 past, 0.5 s, 12 + 3 u, dizzy 4 ×2, 150 gold, frost 8 s +0.5, stink 6 s)');
    check(FORT.hp === 220 && FORT.r === 3 && FORT.range === 40 && FORT.damage === 14 && FORT.reload === 4 && FORT.track === 1.3 && FORT.lock === 0.5 && FORT.track + FORT.lock >= 1.8 - 1e-9 && FORT.gold === 100, 'FORT as §3.1 (220 hp, r 3, 40 u, 14 damage, reload 4, track 1.3 + lock 0.5 = 1.8 s, 100 gold)');
    const flat = JSON.stringify([JOLLY, PUFFER, COILBACK, FORT]);
    check(!/bossImmune|bossMul|puffersAlive|newTag|"grace"/.test(flat), 'none of STATUS, POOL_RULES or MEET is copied into the foes\' tables (they come through ctx.tables)');
  }

  // ================================================================ Monkey Jollyboats
  {
    // the ring round a standing player, and the coconuts' rate, cap and warning
    const w = makeWorld(F, { seed: 11 });
    const id = w.f.spawn('jolly', 0, 40);
    check(typeof id === 'string' && w.f.slots() === 1 && w.f.alive('jolly') === 1, `spawn('jolly') makes one pack, one slot (${id})`);
    const t0 = w.f.targets();
    check(t0.length === 5 && t0.every((t) => t.kind === 'jolly' && t.part === 'boat' && t.hp === 10 && t.maxHp === 10 && t.name === 'Monkey Jollyboats' && t.hidden === false), `a pack is 5 boats of 10 hp (${t0.length})`);
    check(new Set(t0.map((t) => t.id)).size === 5, 'every boat has its own part id');
    let inRing = 0;
    let samples = 0;
    let maxAir = 0;
    let minT = Infinity;
    w.run(120, (w) => {
      const v = w.f.visuals();
      maxAir = Math.max(maxAir, v.coconuts.length);
      for (const c of v.coconuts) minT = Math.min(minT, c.T);
      if (w.t > 15 && Math.round(w.t / DT) % 30 === 0) {
        for (const p of v.packs) for (const b of p.boats) {
          if (b.state !== 'row') continue;
          samples++;
          const d = Math.hypot(b.x - w.player.x, b.z - w.player.z);
          if (d >= 10 - 0.6 && d <= 14 + 0.6) inRing++;
        }
      }
    });
    check(samples > 100 && inRing / samples >= 0.95, `the boats paddle a ring round you at 10–14 u (${inRing}/${samples} samples)`);
    check(maxAir <= 2 && maxAir >= 1, `at most 2 coconuts in the air a pack (max ${maxAir})`);
    check(minT >= 1.5 - 1e-9, `a coconut warns ≥ 1.5 s (min ${f2(minT)})`);
    const thrown = w.f.state.counts.coconuts;
    check(thrown >= 16 && thrown <= 5 * (120 / 6) + 5, `five boats, each every 6–8 s, at most 2 in the air: ${thrown} coconuts in 120 s`);
    // every coconut hit was inside its ring, and every landing with you inside it hit you
    const hits = w.log.damage.filter((d) => d.source === 'coconut');
    check(hits.length > 0 && hits.every((d) => d.amount === 3 && hullDist(d.at, d.x, d.z) <= 2.2 + 1e-6), `coconuts do 3 and only inside their ring (${hits.length} hits)`);
  }
  {
    // one boat: a coconut every 6–8 s; the bonus lengthens the warning
    const w = makeWorld(F, { seed: 5, bonus: 0.6 });
    w.f.spawn('jolly', 0, 12, { n: 1 });
    const times = [];
    let minT = Infinity;
    w.run(90, (w) => {
      const v = w.f.visuals();
      for (const c of v.coconuts) minT = Math.min(minT, c.T);
    });
    for (const s of w.log.sfx) if (s.name === 'coconut') times.push(s.t);
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    check(gaps.length >= 9 && gaps.every((g) => g >= 6 - 0.02 && g <= 8 + 0.02), `a boat lobs a coconut every 6–8 s (${gaps.map(f2).join(' ')})`);
    check(minT >= 2.1 - 1e-9, `the Lighthouse's bonus lengthens it (1.5 + 0.6: min ${f2(minT)})`);
    const sfx = w.log.sfx.find((s) => s.name === 'coconut');
    check(!!sfx && sfx.opts && Math.abs(sfx.opts.duration - 2.1) < 1e-6, 'its "ook!" squeak is told how long the warning lasts');
    const words = w.log.pops.filter((p) => p.text === 'COCONUT!').map((p) => p.t);
    check(words.length >= 1 && words.slice(1).every((t, i) => t - words[i] >= 3 - 1e-6), `"COCONUT!" at most once per pack per 3 s (${words.length})`);
  }
  {
    // the ring hits pirates too, and only hulls inside it
    const w = makeWorld(F, { seed: 3 });
    w.f.spawn('jolly', 0, 12, { n: 1 });
    let ring = null;
    w.run(20, (w) => {
      const v = w.f.visuals();
      if (!ring && v.rings.length) {
        ring = v.rings[0];
        // a pirate right on the ring, another 6 u off it
        w.ships.push({ id: 101, x: ring.x, z: ring.z, h: 0.5, len: 10, wid: 3.6, kind: 'corsair' });
        w.ships.push({ id: 102, x: ring.x + 10, z: ring.z, h: 0, len: 10, wid: 3.6, kind: 'corsair' });
      }
      if (ring && w.t > ring.at + ring.T + 0.5) return false;
      if (ring && !ring.at) ring.at = w.t;
    });
    const by = (id) => w.log.damage.filter((d) => d.target === id && d.source === 'coconut').length;
    check(!!ring && by(101) >= 1 && by(102) === 0, `a coconut hits a pirate inside its ring and none outside (${ring ? by(101) : '-'} / ${ring ? by(102) : '-'})`);
  }
  {
    // grape tips any boat; other shot takes 10 hp; your hull tips one; 10 gold a boat
    const w = makeWorld(F, { seed: 9 });
    w.f.spawn('jolly', 0, 30);
    w.step();
    const [a, b, c] = w.f.targets();
    const r1 = w.f.hit(a.id, { dmg: 1, ammo: 'grape' });
    check(!!r1 && r1.word === 'SPLOSH!' && !w.f.targets().some((t) => t.id === a.id), `a grape ball tips a boat whatever its hp ("${r1 && r1.word}")`);
    const r2 = w.f.hit(b.id, { dmg: 6, ammo: 'round' });
    const still = w.f.targets().find((t) => t.id === b.id);
    check(!!r2 && r2.dmg === 6 && r2.word === null && !!still && still.hp === 4, 'round shot takes its hp (6 of 10, no word)');
    const r3 = w.f.hit(b.id, { dmg: 6, ammo: 'chain' });
    check(!!r3 && r3.dmg === 4 && r3.word === 'SPLOSH!' && !w.f.targets().some((t) => t.id === b.id), 'and sinks it at 0 ("SPLOSH!", the rest of its hp)');
    check(w.f.hit(a.id, { dmg: 5 }) === null && w.f.hits(a.id, 0, 0.5, 30) === false, 'a tipped boat is no target any more');
    check(w.log.coins.length === 2 && w.log.coins.every((c) => c.gold === 10), `10 gold a boat, as coins (${w.log.coins.map((c) => c.gold).join(', ')})`);
    // ram one
    const pos = w.f.targets().find((t) => t.id === c.id);
    w.player.x = pos.x;
    w.player.z = pos.z - 6;
    w.player.h = 0;
    const before = w.log.damage.length;
    w.script = sail(6);
    w.run(2);
    check(!w.f.targets().some((t) => t.id === c.id) && w.f.state.counts.tipped >= 3, 'a hull that touches a boat tips it');
    check(w.log.damage.slice(before).every((d) => d.source === 'coconut'), 'tipping one does you no damage');
    const v = w.f.visuals();
    const tipped = v.packs[0].boats.filter((x) => x.state === 'tip');
    check(tipped.length >= 1 && tipped.every((x) => x.monkey && Number.isFinite(x.monkey.x)), 'a tipped boat shows its monkey swimming home');
    // the pack's slot lasts while a boat is afloat
    for (const t of w.f.targets()) w.f.hit(t.id, { dmg: 1, ammo: 'grape' });
    check(w.f.slots() === 0 && w.f.alive('jolly') === 0, 'a pack with no boat afloat holds no slot');
  }

  // ================================================================ Puffer Mines
  {
    // drift only within 25 u; puff at 6 u; warn ≥ 1.5 s; pop 8 to every hull within 4
    const w = makeWorld(F, { seed: 4 });
    w.f.spawn('puffer', 0, 30, { n: 1 });
    w.step();
    const u0 = w.f.state.puffers[0];
    w.run(5);
    const u1 = w.f.state.puffers[0];
    check(Math.hypot(u1.x - u0.x, u1.z - u0.z) < 1e-6, `a puffer 25+ u from every hull stays put (${f2(Math.hypot(u0.x, u0.z - 5))} u off your bow)`);
    const w2 = makeWorld(F, { seed: 4 });
    w2.f.spawn('puffer', 0, 20, { n: 1 });
    w2.run(1);
    const a = w2.f.state.puffers[0];
    w2.run(2);
    const b = w2.f.state.puffers[0];
    const moved = Math.hypot(b.x - a.x, b.z - a.z);
    check(moved > 2 * 1.4 - 0.1 && moved < 2 * 1.4 + 0.1 && b.z < a.z, `within 25 u it drifts at the nearest hull at 1.4 u/s (${f2(moved / 2)} u/s)`);
    let puffAt = null;
    let T = null;
    w2.run(30, (w) => {
      const s = w.f.state.puffers[0];
      if (s && s.state === 'puff' && puffAt === null) {
        puffAt = hullDist(w.player, s.x, s.z);
        T = s.T;
      }
      if (puffAt !== null && w.f.state.counts.pops) return false;
    });
    check(puffAt !== null && puffAt <= 6 + 1e-6 && puffAt > 6 - 0.1, `it puffs at 6 u from a hull (${f2(puffAt)})`);
    check(T >= 1.5 - 1e-9, `its puff warns ≥ 1.5 s (${f2(T)})`);
    const pops = w2.log.damage.filter((d) => d.source === 'puffer');
    check(pops.length === 1 && pops[0].amount === 8, 'it pops for 8');
    check(w2.f.state.puffers.every((u) => u.state === 'home'), 'then swims home');
  }
  {
    // pop: every hull within 4 u, pirates too, nobody beyond
    const w = makeWorld(F, { seed: 6, ships: [{ id: 7, x: 9, z: 10, h: 0 }, { id: 8, x: -12, z: 10.5, h: 0 }] });
    w.player.x = 0;
    w.player.z = 0;
    w.f.spawn('puffer', 3, 7.5, { n: 1 });
    w.run(6);
    const tg = new Set(w.log.damage.filter((d) => d.source === 'puffer').map((d) => d.target));
    const pu = w.f.state.puffers[0] || { x: 3, z: 7.5 };
    const within = (h) => hullDist(h, pu.x, pu.z) <= 4;
    check(tg.has('player') === within(w.player) && tg.has(7) === within(w.ships[0]) && !tg.has(8) && tg.size >= 1, `a pop hits every hull within 4 u, pirates too, and none beyond (${[...tg].join(', ')})`);
  }
  {
    // a hit sends one home safely; 2 gold; life 40 s
    const w = makeWorld(F, { seed: 2 });
    w.f.spawn('puffer', 0, 9, { n: 1 });
    let r = null;
    w.run(4, (w) => {
      const t = w.f.targets().find((x) => x.kind === 'puffer');
      if (t && w.f.state.puffers[0].state === 'puff') {
        check(w.f.hits(t.id, t.x, 0.5, t.z) === true, 'a ball at a puffing puffer hits it');
        r = w.f.hit(t.id, { dmg: 3 });
        return false;
      }
    });
    check(!!r && r.word === 'PFFT!' && w.f.state.puffers[0].state === 'home', `any ball sends it home ("${r && r.word}")`);
    w.run(4);
    check(!w.log.damage.some((d) => d.source === 'puffer'), 'safely: a puffer sent home mid-puff never pops');
    check(w.log.coins.length === 1 && w.log.coins[0].gold === 2, '2 gold, a coin');
    check(w.warn.count === 0, 'its warning slot is given back');
    const w2 = makeWorld(F, { seed: 2 });
    w2.f.spawn('puffer', 60, 60, { n: 2 });
    let homeAt = null;
    w2.run(45, (w) => {
      if (homeAt === null && w.f.state.puffers.every((u) => u.state === 'home')) homeAt = w.t;
    });
    check(homeAt !== null && Math.abs(homeAt - 40 - PUFFER.rise * 0) < 0.1, `after 40 s it swims home by itself (${f2(homeAt)} s)`);
    check(w2.f.slots() === 0 && w2.f.alive('puffer') === 0, 'and its patch holds no slot');
  }
  {
    // ≤ 6 alive in every mix
    const w = makeWorld(F, { seed: 8 });
    const A = w.f.spawn('puffer', 60, 0);
    check(w.f.alive('puffer') === 4 && w.f.slots() === 1, `a wave's patch rises with 4 (${w.f.alive('puffer')})`);
    const B = w.f.spawn('puffer', -60, 0);
    check(w.f.alive('puffer') === 6, `a patch beside a live patch rises with min(4, 6 − 4) = 2 (${w.f.alive('puffer')})`);
    const S = w.f.spawn('puffer', 0, 60, { n: 3, owner: 42 });
    check(S === null && w.f.alive('puffer') === 6, "a full sea: the Witch's summons rise with none");
    const C = w.f.spawn('puffer', 0, -60);
    check(typeof C === 'string' && w.f.alive('puffer') === 6 && w.f.slots() === 3, `a full sea makes a wave's patch wait, its slot alive (slots ${w.f.slots()})`);
    const st = w.f.state.foes.find((f) => f.id === C);
    check(!!st && st.waiting === true, 'the waiting patch says so');
    const one = w.f.targets().find((t) => t.kind === 'puffer');
    w.f.hit(one.id, { dmg: 1 });
    w.step();
    check(w.f.alive('puffer') === 6 && !w.f.state.foes.find((f) => f.id === C).waiting, 'it rises as soon as one leaves (min(4, 6 − 5) = 1)');
    // the Witch's summons: min(3, 6 − alive), owned, outside slots()
    const w2 = makeWorld(F, { seed: 8 });
    w2.f.spawn('puffer', 60, 0);
    const slots0 = w2.f.slots();
    const s1 = w2.f.spawn('puffer', 0, 60, { n: 3, owner: 42 });
    check(typeof s1 === 'string' && w2.f.alive('puffer') === 6 && w2.f.slots() === slots0, `the Witch's summons rise with min(3, 6 − 4) = 2 and take no slot (${w2.f.alive('puffer')}, slots ${w2.f.slots()})`);
    check(w2.f.state.puffers.filter((u) => u.owner === 42).length === 2, 'they are hers (owner)');
    w2.f.sendHome(42);
    check(w2.f.alive('puffer') === 4 && w2.f.state.puffers.filter((u) => u.owner === null && u.state !== 'home').length === 4, "sendHome(her id) sends home only hers; the wave's patch stays");
    check(w2.f.slots() === slots0, 'and its slot with it');
    // random mixes over time: never more than 6
    const w3 = makeWorld(F, { seed: 13, script: wander(3) });
    const r = mulberry32(99);
    let max = 0;
    w3.run(300, (w) => {
      if (Math.round(w.t / DT) % 240 === 0) {
        const k = r();
        const p = w.player;
        const x = p.x + (r() - 0.5) * 40;
        const z = p.z + (r() - 0.5) * 40;
        if (k < 0.4) w.f.spawn('puffer', x, z);
        else if (k < 0.8) w.f.spawn('puffer', x, z, { n: 1 + Math.floor(r() * 3), owner: 1 + Math.floor(r() * 3) });
        else if (k < 0.9) w.f.sendHome(1 + Math.floor(r() * 3));
        else for (const t of w.f.targets().slice(0, 2)) w.f.hit(t.id, { dmg: 1 });
      }
      max = Math.max(max, w.f.alive('puffer'));
    });
    check(max <= 6 && max >= 5, `≤ 6 puffers alive in every mix over 300 s of patches, summons and hits (max ${max})`);
    // altered tables are read
    const w4 = makeWorld(F, { tables: { ...TABLES, POOL_RULES: { puffersAlive: 3 }, PACKS: { jolly: 2, puffer: 2 } } });
    w4.f.spawn('puffer', 50, 0);
    w4.f.spawn('puffer', -50, 0);
    w4.f.spawn('jolly', 0, 50);
    check(w4.f.alive('puffer') === 3 && w4.f.targets().filter((t) => t.kind === 'jolly').length === 2, 'the cap and the pack sizes come from ctx.tables (POOL_RULES.puffersAlive, PACKS)');
  }
  {
    // currents carry puffers (ctx.drift)
    const w = makeWorld(F, { drift: (x, z) => (z > 50 ? { vx: 3, vz: 0 } : null) });
    w.f.spawn('puffer', 0, 80, { n: 1 });
    w.run(1);
    const a = w.f.state.puffers[0];
    w.run(2);
    const b = w.f.state.puffers[0];
    check(Math.abs((b.x - a.x) / 2 - 3) < 0.05, `a puffer rides a current (${f2((b.x - a.x) / 2)} u/s)`);
  }

  // ================================================================ Old Coilback
  // its whole cycle round a standing player: swim → dive → under → rear (lane) → lunge → dizzy → swim
  function coilRun(o = {}) {
    const w = makeWorld(F, { seed: o.seed ?? 21, bonus: o.bonus, lands: o.lands, player: o.player, ships: o.ships });
    if (o.script) w.script = o.script;
    w.f.spawn('coilback', o.x ?? 0, o.z ?? 26);
    const log = [];
    let last = null;
    w.run(o.secs ?? 60, (w) => {
      const s = w.f.state.foes.find((f) => f.kind === 'coilback');
      if (!s) return;
      if (s.state !== last) {
        log.push({ state: s.state, t: w.t, x: s.x, z: s.z, lane: s.lane, T: s.T, p: { ...w.player } });
        last = s.state;
      }
      if (o.each) o.each(w, s);
    });
    return { w, log };
  }
  {
    const { w, log } = coilRun({ secs: 70 });
    const seq = log.map((e) => e.state);
    const cyc = ['swim', 'dive', 'under', 'rear', 'lunge', 'dizzy', 'swim'];
    const i0 = seq.indexOf('swim');
    check(i0 >= 0 && same(seq.slice(i0, i0 + 7), cyc), `its cycle: ${seq.slice(0, 10).join(' → ')}`);
    const dur = (s, k = 0) => {
      const idx = seq.map((x, i) => (x === s ? i : -1)).filter((i) => i >= 0)[k];
      return idx >= 0 && idx + 1 < log.length ? log[idx + 1].t - log[idx].t : null;
    };
    const d = { swim: dur('swim', 0), dive: dur('dive'), under: dur('under'), rear: dur('rear'), lunge: dur('lunge'), dizzy: dur('dizzy') };
    const ok = (v, want) => v !== null && Math.abs(v - want) < 0.03;
    check(ok(d.swim, 6) && ok(d.dive, 2) && ok(d.under, 3) && d.rear >= 1.6 - 1e-6 && ok(d.lunge, 0.5) && ok(d.dizzy, 4), `swim 6 s, dive 2 s, under 3 s, the lane ≥ 1.6 s, lunge 0.5 s, dizzy 4 s (${Object.entries(d).map(([k, v]) => `${k} ${f2(v)}`).join(', ')})`);
    const rears = log.filter((e) => e.state === 'rear');
    const offs = rears.map((e) => Math.hypot(e.lane.x0 - e.p.x, e.lane.z0 - e.p.z));
    check(rears.length >= 2 && offs.every((o) => o >= 14 - 1e-6 && o <= 16 + 1e-6), `it rears 14–16 u off you (${offs.map(f2).join(', ')})`);
    const beam = rears.map((e) => Math.abs(Math.abs(((Math.atan2(e.lane.x0 - e.p.x, e.lane.z0 - e.p.z) - e.p.h + 3 * Math.PI) % TAU) - Math.PI) - Math.PI / 2));
    check(beam.every((b) => b <= Math.PI / 6 + 1e-6), `off your beam (within 30°: ${beam.map((b) => f2((b * 180) / Math.PI)).join(', ')}°)`);
    const lanes = rears.map((e) => e.lane);
    check(rears.every((e) => Math.abs(e.lane.len - (Math.hypot(e.lane.x0 - e.p.x, e.lane.z0 - e.p.z) + 4)) < 1e-3 && e.lane.len <= 30 && e.lane.w === 4), `its lane runs from its head to 4 u past your (standing) spot (${lanes.map((l) => f2(l.len)).join(', ')})`);
    check(rears.every((e) => hullSeg(e.p, e.lane.x0, e.lane.z0, e.lane.x1, e.lane.z1) <= 1e-3), 'so a player who stands still is always inside it (on its centre line)');
    const hits = w.log.damage.filter((x) => x.source === 'lunge');
    check(hits.length === rears.length && hits.every((x) => x.amount === 12), `every lunge hits the player standing in it for 12 (${hits.length}/${rears.length})`);
    const rearT = rears.map((e) => e.T);
    check(rearT.every((T) => T >= 1.6 - 1e-6), `the lane warns ≥ 1.6 s (${rearT.map(f2).join(', ')})`);
    const hiss = w.log.sfx.filter((s) => s.name === 'hiss');
    check(hiss.length === rears.length && hiss.every((s) => s.opts && s.opts.duration >= 1.6), 'a rising hiss for as long as the lane warns');
    check(w.log.pops.some((p) => p.text === 'LUNGE!'), '"LUNGE!"');
    check(w.warn.count <= 1, 'its lane holds one warning slot at most');
  }
  {
    // the shove: 3 u out of the lane
    const { w } = coilRun({ secs: 20 });
    const hit = w.log.damage.find((x) => x.source === 'lunge');
    check(!!hit, 'a lunge hit you');
    // (after the hit, the shove moved you)
    check(Math.hypot(w.player.x, w.player.z) > 2.5 && Math.hypot(w.player.x, w.player.z) < 3.5, `and shoved you 3 u out of the lane (${f2(Math.hypot(w.player.x, w.player.z))} u)`);
  }
  {
    // damage only inside the lane: a ship that sails off sideways while the lane warns is safe
    let lane = null;
    const { w } = coilRun({
      secs: 40,
      each: (w, s) => {
        if (s.state === 'rear' && !lane) {
          lane = s.lane;
          // sail out of it at once, at right angles to it
          const ang = Math.atan2(lane.x1 - lane.x0, lane.z1 - lane.z0) + Math.PI / 2;
          w.player.h = ang;
          w.script = sail(10);
        }
        if (s.state === 'dizzy') w.script = null;
      },
    });
    const first = w.log.damage.filter((x) => x.source === 'lunge');
    check(!!lane && first.length === 0, `damage only inside the lane: sailing out of it is safe (${first.length})`);
  }
  {
    // untargetable while under; head ×1, dizzy head ×2 ("BONK!"), humps ×0.5 ("THUD")
    let under = null;
    let swim = null;
    let dizzy = null;
    coilRun({
      secs: 30,
      each: (w, s) => {
        const tg = w.f.targets().filter((t) => t.kind === 'coilback');
        if (s.state === 'under' && !under) {
          const head = tg.find((t) => t.part === 'head');
          under = { tg, hidden: tg.every((t) => t.hidden), hits: head ? w.f.hits(head.id, head.x, 2.5, head.z) : true, hit: head ? w.f.hit(head.id, { dmg: 10 }) : 'none', tag: w.f.tags().find((x) => x.id === s.id) };
        }
        if (s.state === 'swim' && w.t > 4 && !swim) {
          const head = tg.find((t) => t.part === 'head');
          const hump = tg.find((t) => t.part === 'hump');
          const h0 = s.hp;
          const a = w.f.hit(head.id, { dmg: 10 });
          const b = w.f.hit(hump.id, { dmg: 10 });
          swim = { a, b, humps: tg.filter((t) => t.part === 'hump').length, drop: h0 - w.f.state.foes.find((f) => f.kind === 'coilback').hp, hitsHump: w.f.hits(hump.id, hump.x, 0.9, hump.z) };
        }
        if (s.state === 'dizzy' && !dizzy) {
          const head = tg.find((t) => t.part === 'head');
          dizzy = { r: w.f.hit(head.id, { dmg: 10 }), humps: tg.filter((t) => t.part === 'hump').length };
        }
      },
    });
    check(!!under && under.hidden && under.hits === false && under.hit === null, 'under water it is untargetable (listed hidden, no hits)');
    check(!!under && !!under.tag && under.tag.under === true, 'its tag reads UNDER WATER (under: true)');
    check(!!swim && swim.a.dmg === 10 && swim.b.dmg === 5 && swim.b.word === 'THUD' && swim.drop === 15 && swim.humps === 3 && swim.hitsHump, `swimming: head ×1, 3 humps ×0.5 ("THUD") (${swim && swim.a.dmg}, ${swim && swim.b.dmg})`);
    check(!!dizzy && dizzy.r.dmg === 20 && dizzy.r.word === 'BONK!' && dizzy.humps === 0, `dizzy head ×2 ("BONK!": ${dizzy && dizzy.r.dmg})`);
  }
  {
    // Frost: no dive for 8 s and its lane +0.5 s (COILBACK.frost); Stink: dives off, no lunge for 6 s; Fire: STATUS
    let frosted = null;
    let diveAfter = null;
    let laneT = null;
    coilRun({
      secs: 40,
      each: (w, s) => {
        if (s.state === 'swim' && w.t > 2 && frosted === null) {
          const head = w.f.targets().find((t) => t.part === 'head');
          frosted = { t: w.t, word: w.f.special(head.id, 'frost') };
        }
        if (s.state === 'dive' && frosted && diveAfter === null) diveAfter = w.t - frosted.t;
        if (s.state === 'rear' && laneT === null) laneT = s.T;
      },
    });
    check(!!frosted && frosted.word === 'FROZEN!' && diveAfter >= 8 - 0.02, `Frost: no dive for 8 s (dived ${f2(diveAfter)} s later)`);
    check(laneT !== null && laneT >= 1.6 + 0.5 - 1e-6, `and its lane +0.5 s while frozen (${f2(laneT)})`);
    let stunk = null;
    const seq = [];
    let lungeAfter = null;
    coilRun({
      secs: 50,
      each: (w, s) => {
        if (s.state === 'rear' && stunk === null) {
          const head = w.f.targets().find((t) => t.part === 'head');
          stunk = { t: w.t, word: w.f.special(head.id, 'stink'), warn: w.warn.count };
          return;
        }
        if (stunk) {
          if (seq[seq.length - 1] !== s.state) seq.push(s.state);
          if (s.state === 'lunge' && lungeAfter === null) lungeAfter = w.t - stunk.t;
        }
      },
    });
    check(!!stunk && stunk.word === 'ACHOO!' && seq[0] === 'dive' && stunk.warn === 0, `Stink: it dives off at once, its lane called off (${seq.slice(0, 4).join(' → ')})`);
    check(lungeAfter !== null && lungeAfter >= 6 - 1e-6, `and doesn't lunge for 6 s (${f2(lungeAfter)} s)`);
    // Fire burns from ctx.tables.STATUS (an altered table is used)
    const w = makeWorld(F, { tables: { ...TABLES, STATUS: { ...TABLES.STATUS, fire: { dps: 10, time: 6, boss: 2 } } } });
    w.f.spawn('coilback', 0, 26);
    w.run(1);
    const head = w.f.targets().find((t) => t.part === 'head');
    const h0 = w.f.state.foes[0].hp;
    check(w.f.special(head.id, 'fire') === 'ON FIRE!', 'Fire sets it burning');
    w.run(3);
    const lost = h0 - w.f.state.foes[0].hp;
    check(Math.abs(lost - 20) < 0.3, `Fire burns with ctx.tables.STATUS's boss values (10 hp/s × 2 s: ${f2(lost)})`);
  }
  {
    // its spots never on land: islands round a standing player, many seeds
    let bad = 0;
    let rears = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const r = mulberry32(seed * 31);
      const lands = [];
      for (let i = 0; i < 6; i++) {
        const a = r() * TAU;
        const d = 12 + r() * 20;
        lands.push({ x: Math.sin(a) * d, z: Math.cos(a) * d, r: 2 + r() * 5 });
      }
      const { log, w } = coilRun({ seed, lands, secs: 40, z: 40, x: 10 });
      for (const e of log) {
        if (e.state !== 'rear') continue;
        rears++;
        const l = e.lane;
        const onLand = (x, z, rr) => lands.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + rr);
        if (onLand(l.x0, l.z0, 1.6)) bad++;
      }
      const v = w.f.state.foes.find((f) => f.kind === 'coilback');
      if (v && lands.some((c) => Math.hypot(v.x - c.x, v.z - c.z) < c.r)) bad++;
    }
    check(rears >= 12 && bad === 0, `it never rears on land, round 12 island layouts (${rears} rears, ${bad} on land)`);
  }
  {
    // at 0: it swims home sulking and drops its scale (+150 gold)
    const w = makeWorld(F, { seed: 2 });
    w.f.spawn('coilback', 0, 26);
    w.run(1);
    const head = w.f.targets().find((t) => t.part === 'head');
    const r = w.f.hit(head.id, { dmg: 9999 });
    check(!!r && r.dmg === 450, `the bar is 450 hp (${r && r.dmg})`);
    check(w.f.slots() === 0 && !w.f.targets().some((t) => t.kind === 'coilback'), 'at 0 it swims home (no slot, no target)');
    check(w.log.gold.length === 1 && w.log.gold[0].n === 150, 'and drops its scale: +150 gold');
    check(w.f.visuals().coilback && w.f.visuals().coilback.state === 'home', 'its view swims home');
  }

  // ================================================================ Rock Forts
  {
    const w = makeWorld(F, { seed: 1, player: { x: 0, z: 0 } });
    const id = w.f.spawn('fort', 0, 30);
    check(typeof id === 'string' && w.f.slots() === 1 && w.f.alive('fort') === 1, 'spawn("fort") makes a fort, one slot');
    const states = [];
    w.run(12, (w) => {
      const s = w.f.state.foes[0];
      if (!states.length || states[states.length - 1].state !== s.state) states.push({ state: s.state, t: w.t, T: s.T });
    });
    const tr = states.find((s) => s.state === 'track');
    const lk = states.find((s) => s.state === 'lock');
    const fi = states.find((s) => s.state === 'fire');
    check(!!tr && !!lk && !!fi && Math.abs(lk.t - tr.t - 1.3) < 0.03 && Math.abs(fi.t - lk.t - 0.5) < 0.03, `a fort tracks 1.3 s and locks 0.5 s (${tr && lk && fi ? `${f2(lk.t - tr.t)} + ${f2(fi.t - lk.t)}` : '-'})`);
    const shots = w.log.damage.filter((d) => d.source === 'fort');
    check(shots.length >= 1 && shots.every((d) => d.amount === 14 && d.target === 'player'), `then fires along the locked line: 14 to you standing on it (${shots.length})`);
    const fires = states.filter((s) => s.state === 'fire').map((s) => s.t);
    check(fires.length >= 2 && fires.slice(1).every((t, i) => t - fires[i] >= 4 + 1.8 - 0.05), `reload 4 s (${fires.map(f2).join(', ')})`);
    check(w.log.pops.some((p) => p.text === 'AIM!') && w.log.sfx.some((s) => s.name === 'clack'), '"AIM!" and a click-clack when it locks');
    // the bonus lengthens the lock; ≥ 1.8 s in all
    const w2 = makeWorld(F, { seed: 1, bonus: 0.9 });
    w2.f.spawn('fort', 0, 30);
    let lockT = null;
    w2.run(5, (w) => {
      const s = w.f.state.foes[0];
      if (s.state === 'lock' && lockT === null) lockT = s.T;
    });
    check(lockT !== null && Math.abs(lockT - 1.4) < 1e-6, `the Lighthouse's bonus lengthens its lock (0.5 + 0.9: ${f2(lockT)})`);
  }
  {
    // a ship that moved off the locked line is safe: one crossing its line at full sail outruns the gun
    const w = makeWorld(F, { seed: 1, player: { x: -14, z: 0, h: Math.PI / 2 } });
    w.script = sail(10);
    w.f.spawn('fort', 0, 30);
    let lockLine = null;
    w.run(4, (w) => {
      const v = w.f.visuals().lines[0];
      if (v && v.state === 'lock' && !lockLine) lockLine = { ...v, p: { ...w.player } };
      if (w.f.state.counts.shots) return false;
    });
    check(!!lockLine && w.f.state.counts.shots === 1 && !w.log.damage.some((d) => d.source === 'fort'), 'a ship that sails across its line at full sail is safe (it fires behind her)');
    const tr = makeWorld(F, { seed: 1, player: { x: -14, z: 0, h: Math.PI / 2 } });
    tr.script = sail(10);
    tr.f.spawn('fort', 0, 30);
    let lag = 0;
    tr.run(2.5, (w) => {
      const v = w.f.visuals().lines[0];
      if (v && v.state === 'track') lag = Math.max(lag, segPt(w.player.x, w.player.z, v.x0, v.z0, v.x1, v.z1));
    });
    check(lag > 0.5, `while it tracks its line follows you at most ${FORT.traverse} rad/s, so it falls behind a fast crossing ship (${f2(lag)} u)`);
    const al = makeWorld(F, { seed: 1, player: { x: 0, z: -5, h: 0 } });
    al.script = sail(6);
    al.f.spawn('fort', 0, 30);
    al.run(3);
    check(al.log.damage.filter((d) => d.source === 'fort').length === 1, 'one sailing straight at it is hit (she has to turn)');
    // the first hull on the line only, pirates too
    const w3 = makeWorld(F, { seed: 1, ships: [{ id: 5, x: 0, z: 15, h: Math.PI / 2 }] });
    w3.f.spawn('fort', 0, 30);
    w3.run(4);
    const tg = w3.log.damage.filter((d) => d.source === 'fort').map((d) => d.target);
    check(tg.length === 1 && tg[0] === 5, `it hits the first hull on its line only: the pirate in front of you (${tg.join(', ')})`);
    // out of range: it doesn't sight you
    const w4 = makeWorld(F, { seed: 1 });
    w4.f.spawn('fort', 0, 52);
    w4.run(8);
    check(w4.f.state.counts.sights === 0 && w4.warn.count === 0, 'beyond 40 u it does not sight you');
    // 220 hp, FORT DOWN!, 100 gold
    const w5 = makeWorld(F, { seed: 1 });
    const fid = w5.f.spawn('fort', 0, 30);
    w5.run(0.5);
    const tgt = w5.f.targets()[0];
    check(tgt.id === fid && tgt.kind === 'fort' && tgt.part === 'fort' && tgt.r === 3 && tgt.maxHp === 220, 'its part: r 3, 220 hp');
    check(w5.f.hits(fid, 0, 4, 30) === true && w5.f.hits(fid, 0, 4, 34) === false, 'hits() inside its rock and fort only');
    const a = w5.f.hit(fid, { dmg: 100 });
    const b = w5.f.hit(fid, { dmg: 200 });
    check(a.dmg === 100 && a.word === null && b.dmg === 120 && b.word === 'FORT DOWN!', '"FORT DOWN!" at 0');
    check(w5.log.gold.length === 1 && w5.log.gold[0].n === 100 && w5.f.slots() === 0 && w5.f.visuals().forts[0].state === 'down', '+100 gold; its slot ends; the view crumbles it');
  }

  // ================================================================ boardWhy, tags, slots
  {
    const w = makeWorld(F, { seed: 3 });
    const j = w.f.spawn('jolly', 0, 30);
    w.f.spawn('puffer', 30, 0);
    const c = w.f.spawn('coilback', -30, 0);
    const fo = w.f.spawn('fort', 0, -35);
    w.step();
    const tg = w.f.targets();
    const why = (kind) => w.f.boardWhy(tg.find((t) => t.kind === kind).id);
    check(why('jolly') === 'small' && why('puffer') === 'monster' && why('coilback') === 'monster' && why('fort') === 'fort', `boardWhy: small, monster, monster, fort (${['jolly', 'puffer', 'coilback', 'fort'].map(why).join(', ')})`);
    check(w.f.slots() === 4, `slots(): a pack, a patch, the Coilback and a fort are one each (${w.f.slots()})`);
    const tags = w.f.tags();
    const pack = tags.find((t) => t.id === j);
    const coil = tags.find((t) => t.id === c);
    const fort = tags.find((t) => t.id === fo);
    check(tags.length === 3 && !!pack && pack.count === 5 && pack.frac === null && pack.name === 'Monkey Jollyboats', 'tags(): the pack has one tag counting its boats (no bar); puffers have none');
    check(!!coil && coil.frac === 1 && coil.under === false && !!fort && fort.frac === 1, "the Coilback's and the fort's tags have a hull bar");
    w.f.hit(tg.find((t) => t.kind === 'jolly').id, { dmg: 1, ammo: 'grape' });
    check(w.f.tags().find((t) => t.id === j).count === 4, 'the pack tag counts the boats afloat ("×4")');
    const v = w.f.visuals();
    check(['packs', 'coconuts', 'puffers', 'coilback', 'forts', 'rings', 'lanes', 'lines'].every((k) => k in v) && v.packs.length === 1 && v.puffers.length === 4 && !!v.coilback && v.forts.length === 1, 'visuals() has every §11.1 key');
    check(JSON.stringify(v) === JSON.stringify(JSON.parse(JSON.stringify(v))) && JSON.stringify(w.f.state).length > 10, 'visuals() and state are plain data');
  }

  // ================================================================ hold(), the grace, warning slots
  {
    // hold() true: no new telegraph starts and the timers wait; what is in the air lands
    // (the fly-in: held from the start)
    const w = makeWorld(F, { seed: 17 });
    w.hold = true;
    w.f.spawn('jolly', 0, 14);
    w.f.spawn('fort', 20, 20);
    w.f.spawn('coilback', -25, 0);
    w.f.spawn('puffer', 0, -9, { n: 1 });
    w.run(0.5);
    const c0 = { ...w.f.state.counts };
    const clocksOf = () => Object.fromEntries(w.f.state.foes.find((f) => f.kind === 'jolly').boats.filter((b) => b.state === 'row').map((b) => [b.id, b.clock]));
    const clocks0 = clocksOf();
    const fortReload0 = w.f.state.foes.find((f) => f.kind === 'fort').reload;
    let landed = 0;
    w.run(20, (w) => {
      landed = w.log.damage.length;
    });
    const c1 = w.f.state.counts;
    check(c1.coconuts === c0.coconuts && c1.puffs === c0.puffs && c1.lunges === c0.lunges && c1.sights === c0.sights && c1.dives === c0.dives, `hold(): no coconut, puff, dive, lane or sight line starts in 20 s (${['coconuts', 'puffs', 'dives', 'lunges', 'sights'].map((k) => c1[k] - c0[k]).join(' ')})`);
    const clocks1 = clocksOf();
    check(Object.keys(clocks0).length === 5 && same(clocks0, clocks1) && w.f.state.foes.find((f) => f.kind === 'fort').reload === fortReload0, 'and the attack timers wait (the boats\' coconut clocks, the fort\'s reload)');
    w.hold = false;
    w.run(15);
    const c2 = w.f.state.counts;
    check(c2.coconuts > c1.coconuts && c2.sights > c1.sights && c2.puffs > c1.puffs, 'once it ends they run again');
    void landed;
    // what is already in the air lands
    const w2 = makeWorld(F, { seed: 17 });
    w2.f.spawn('jolly', 0, 12, { n: 1 });
    w2.run(12, (w) => (w.f.visuals().coconuts.length ? false : undefined));
    w2.hold = true;
    const k0 = w2.f.state.counts.coconuts;
    w2.run(3);
    check(k0 === 1 && w2.f.visuals().coconuts.length === 0 && w2.warn.count === 0, 'a coconut already in the air lands during a hold');
  }
  {
    // the first-meeting grace: a newcomer holds its attacks while ctx.isNew(kind) says its grace runs
    const w = makeWorld(F, { seed: 4, isNew: (kind, t) => kind === 'jolly' && t < 7 });
    const j = w.f.spawn('jolly', 0, 14);
    let first = null;
    let tagNew = [];
    w.run(25, (w) => {
      if (first === null && w.f.state.counts.coconuts > 0) first = w.t;
      const tg = w.f.tags().find((x) => x.id === j);
      if (tg) tagNew.push([w.t, tg.isNew]);
    });
    check(first !== null && first >= 7 - 1e-6, `a newcomer starts no attack while its grace runs (first coconut at ${f2(first)} s, grace to 7 s)`);
    const lastNew = tagNew.filter(([, n]) => n).pop();
    check(!!lastNew && lastNew[0] >= 7 + 6 - 0.1 && lastNew[0] <= 7 + 6 + 0.1, `its tag wears NEW until MEET.newTag − MEET.grace s after its grace (${f2(lastNew && lastNew[0])} s)`);
    const w2 = makeWorld(F, { seed: 4, isNew: () => true });
    w2.f.spawn('fort', 0, 30);
    let firstSight = null;
    w2.run(25, (w) => {
      if (firstSight === null && w.f.state.counts.sights > 0) firstSight = w.t;
    });
    check(firstSight !== null && firstSight >= 15 - 0.05 && firstSight <= 17, `a stuck isNew never disarms a foe for good (it sights you after the 15 s cap: ${f2(firstSight)})`);
  }
  {
    // every warning shape takes a ctx.warn slot; with the slots full a new one (and its attack) waits
    const crowd = (max, seed) => {
      const w = makeWorld(F, { seed, warnMax: max, script: wander(seed) });
      w.f.spawn('jolly', 0, 20);
      w.f.spawn('jolly', 20, 0);
      w.f.spawn('jolly', -20, 0);
      w.f.spawn('puffer', -8, 8);
      w.f.spawn('fort', 25, 25);
      w.f.spawn('fort', -25, -25);
      w.f.spawn('fort', 25, -25);
      w.f.spawn('coilback', 0, -30);
      let maxShapes = 0;
      let mismatch = 0;
      w.run(120, (w) => {
        const v = w.f.visuals();
        const shapes = v.rings.length + v.lanes.length + v.lines.filter((l) => l.state !== 'fire').length;
        maxShapes = Math.max(maxShapes, shapes);
        if (shapes !== w.warn.count) mismatch++;
        if (Math.round(w.t / DT) % 1200 === 0) {
          w.f.spawn('puffer', w.player.x + 10, w.player.z + 10, { n: 2, owner: 9 });
        }
      });
      return { w, maxShapes, mismatch };
    };
    const a = crowd(Infinity, 31);
    check(a.mismatch === 0 && a.maxShapes >= 3, `every shape on show holds exactly one ctx.warn slot (max ${a.maxShapes} at once, ${a.mismatch} mismatches)`);
    const b = crowd(6, 31);
    check(a.maxShapes > 6 && b.maxShapes <= 6 && b.w.f.state.counts.waited > 0 && b.mismatch === 0, `a 7th shape waits for a free slot (max ${b.maxShapes} of ${a.maxShapes} uncapped, ${b.w.f.state.counts.waited} waits)`);
    const c = crowd(1, 32);
    check(c.maxShapes <= 1 && c.w.f.state.counts.coconuts > 0, `with one slot, one shape at a time (max ${c.maxShapes})`);
    const kinds = new Set(a.w.log.warn.map((x) => x.kind));
    check(['coconut', 'puff', 'lunge', 'fort'].every((k) => kinds.has(k)), `the kinds it takes: ${[...kinds].join(', ')}`);
    a.w.f.dispose();
    check(a.w.warn.count === 0, 'dispose() gives back every slot it holds');
  }
  {
    // warnings are ≥ their table's (≥ 1.5 s), plus the bonus, everywhere
    const w = makeWorld(F, { seed: 77, bonus: 0.3, script: wander(5) });
    w.f.spawn('jolly', 0, 20);
    w.f.spawn('puffer', 10, 10);
    w.f.spawn('fort', 25, 25);
    w.f.spawn('coilback', 0, -30);
    let minRing = Infinity;
    let minLane = Infinity;
    let minLine = Infinity;
    const lineStart = new Map();
    w.run(150, (w) => {
      const v = w.f.visuals();
      for (const r of v.rings) minRing = Math.min(minRing, r.T);
      for (const l of v.lanes) minLane = Math.min(minLane, l.T);
      for (const l of v.lines) {
        if (l.state === 'track' && !lineStart.has(l.id + ':' + Math.floor(w.f.state.counts.sights))) lineStart.set(l.id + ':' + Math.floor(w.f.state.counts.sights), w.t);
      }
    });
    const fireTimes = w.log.damage.filter((d) => d.source === 'fort').map((d) => d.t);
    void fireTimes;
    for (const [, t0] of lineStart) minLine = Math.min(minLine, t0);
    check(minRing >= 1.5 + 0.3 - 1e-6 && minLane >= 1.6 + 0.3 - 1e-6, `every ring ≥ 1.8 s and lane ≥ 1.9 s with a 0.3 s bonus (${f2(minRing)}, ${f2(minLane)})`);
    // the fort: from the first track frame to the shot
    const w2 = makeWorld(F, { seed: 77, bonus: 0.3 });
    w2.f.spawn('fort', 0, 30);
    let t0 = null;
    let t1 = null;
    w2.run(6, (w) => {
      const s = w.f.state.foes[0];
      if (s.state === 'track' && t0 === null) t0 = w.t;
      if (w.log.damage.length && t1 === null) t1 = w.t;
    });
    check(t0 !== null && t1 !== null && t1 - t0 >= 1.8 + 0.3 - 0.02, `a fort's line warns ≥ 1.8 s + the bonus before it lands (${f2(t1 - t0)})`);
  }

  // ================================================================ sounds, words
  {
    const w = makeWorld(F, { seed: 9, script: wander(9) });
    w.f.spawn('jolly', 0, 20);
    w.f.spawn('puffer', 10, 10);
    w.f.spawn('fort', 25, 25);
    w.f.spawn('coilback', 0, -30);
    w.run(90, (w) => {
      if (Math.round(w.t / DT) % 600 === 0) for (const t of w.f.targets().slice(0, 1)) w.f.hit(t.id, { dmg: 20, ammo: 'grape' });
    });
    const names = [...new Set(w.log.sfx.map((s) => s.name))];
    const SPEC_NEW = ['coconut', 'netWhirl', 'puff', 'conch', 'song', 'hiss', 'clack', 'tidebell', 'snip', 'boulder', 'crabCharge', 'yawn', 'newFoe', 'whistle', 'thud', 'tok', 'saw', 'pop', 'brush', 'chime', 'door', 'tada', 'purr', 'woof', 'meh', 'squawk', 'hoot', 'giggle', 'click', 'splash', 'fwap', 'foghorn'];
    const known = new Set([...(audioNames || []), ...SPEC_NEW]);
    check(!!audioNames && audioNames.length > 40 && names.length >= 6 && names.every((n) => known.has(n)), `its sounds are audio.js's SFX_NAMES or §11.1's new ones (${names.join(', ')})`);
    // words from WORDS4 when it has them
    const w2 = makeWorld(F, { seed: 9, tables: { ...TABLES, WORDS4: { pop: { splosh: 'SPLISH!' }, live: {} } } });
    w2.f.spawn('jolly', 0, 30);
    w2.step();
    const r = w2.f.hit(w2.f.targets()[0].id, { dmg: 1, ammo: 'grape' });
    check(r.word === 'SPLISH!', 'its words come from ctx.tables.WORDS4 when it has them');
  }

  // ================================================================ with the real WORDS4 (mechanics4.js)
  if (WORDS4) {
    const w = makeWorld(F, { seed: 2, tables: { ...TABLES, WORDS4 } });
    w.f.spawn('coilback', 0, 26);
    w.f.spawn('fort', 0, 30);
    w.f.spawn('jolly', 0, 14, { n: 2 });
    w.run(20);
    const head = w.f.targets().find((t) => t.part === 'head');
    if (head) w.f.hit(head.id, { dmg: 9999 });
    const fort = w.f.targets().find((t) => t.kind === 'fort');
    if (fort) w.f.hit(fort.id, { dmg: 9999 });
    const live = w.log.live.map((l) => l.text);
    const pops = new Set(w.log.pops.map((p) => p.text));
    check(live.includes('Old Coilback swims home, sulking.') && live.includes('The Rock Fort is down!') && live.some((t) => /Rock Fort is aiming/.test(t)) && !live.some((t) => /Shellback/.test(t)), `with mechanics4's WORDS4 its announcements are its own (${[...new Set(live)].slice(0, 5).join(' | ')})`);
    check(['COCONUT!', 'AIM!', 'FORT DOWN!', 'LUNGE!'].every((p) => pops.has(p)), 'and its pops read the same');
  }

  // ================================================================ determinism, junk
  {
    const snap = (seed) => {
      const w = makeWorld(F, { seed, script: wander(seed + 1000) });
      w.f.spawn('jolly', 0, 25);
      w.f.spawn('puffer', 15, 5);
      w.f.spawn('coilback', -20, 10);
      w.f.spawn('fort', 25, -25);
      for (let i = 0; i < 120 * 120; i++) {
        w.step();
        if (i % 700 === 0) {
          const t = w.f.targets()[i % 3];
          if (t) w.f.hit(t.id, { dmg: 9, ammo: i % 2 ? 'round' : 'chain' });
        }
        if (i === 120 * 30) {
          const t = w.f.targets().find((x) => x.kind === 'coilback');
          if (t) w.f.special(t.id, 'frost');
        }
      }
      return JSON.stringify(w.f.state) + JSON.stringify(w.f.visuals()) + JSON.stringify(w.log.damage.map((d) => [d.amount, d.target, Math.round(d.t * 1000)]));
    };
    const a = snap(42);
    const b = snap(42);
    const c = snap(43);
    check(a === b && a !== c, 'determinism: the same seed gives the same state after 120 s (another seed does not)');
  }
  {
    let threw = null;
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('boom');
        },
      }
    );
    const P = () => ({ x: 0, z: 0, h: 0, speed: 3, len: 10, wid: 3.6 });
    const ctxs = [
      undefined,
      null,
      42,
      'ctx',
      {},
      hostile,
      { player: () => null },
      { player: () => ({ x: 'a', z: NaN }) },
      { player: P, ships: () => hostile, rng: () => NaN, land: () => { throw new Error('x'); }, damage: () => { throw new Error('y'); }, world: { r: -5 }, tables: hostile, warnBonus: () => 'big', warn: hostile },
      { player: P, ships: () => [null, 5, { id: 1 }, { id: 2, x: 1, z: 2, len: 'x' }, hostile], rng: () => 1, land: () => true, world: null, tables: { STATUS: { frost: { time: 'x' } }, POOL_RULES: { puffersAlive: -3 }, PACKS: { jolly: 1e9 } }, pop: 5, sfx: {}, announce: null, warn: { take: () => { throw new Error('t'); }, give: 3 }, isNew: () => { throw new Error('n'); }, hold: () => 'yes', drift: () => ({ vx: Infinity, vz: NaN }) },
      {
        get player() {
          throw new Error('getter');
        },
      },
    ];
    const junk = [undefined, null, NaN, -1, 1e9, 'x', {}, [], hostile];
    for (const c of ctxs) {
      try {
        const f = createFoes4(c);
        for (const j of junk) {
          f.spawn(j, j, j, j);
          f.step(j);
          f.sendHome(j);
          f.alive(j);
          f.boardWhy(j);
          f.push(j);
        }
        for (const k of ['jolly', 'puffer', 'coilback', 'fort']) {
          f.spawn(k, 10, 20);
          f.spawn(k, NaN, 5, hostile);
          f.spawn(k, 1e9, -1e9, { n: 'x', owner: hostile });
        }
        for (let i = 0; i < 120 * 30; i++) {
          f.step(DT);
          if (i % 97 === 0) {
            for (const j of junk) {
              f.hits(j, j, j, j);
              f.hit(j, j);
              f.special(j, j);
            }
            for (const t of f.targets()) {
              f.hit(t.id, { dmg: 1, ammo: ['grape', 'round', hostile][i % 3] });
              f.special(t.id, ['fire', 'frost', 'stink'][i % 3]);
              f.hits(t.id, t.x, 1, t.z);
            }
            JSON.stringify(f.visuals());
            JSON.stringify(f.state);
            JSON.stringify(f.tags());
            f.slots();
            f.push({ id: 1, x: 0, z: 0 });
          }
        }
        f.dispose();
        f.step(1);
        f.targets();
        f.visuals();
        void f.state;
      } catch (e) {
        threw = e;
        break;
      }
    }
    check(threw === null, `a junk ctx and junk arguments never throw${threw ? ` (${threw.stack})` : ''}`);
  }

  // ================================================================ EXIT (SPEC4 §12 row 1C, the foes' half)
  {
    const lines = [];
    // telegraphs ≥ 1.5 s in a long mixed run (with no bonus)
    const w = makeWorld(F, { seed: 123, script: wander(123) });
    w.f.spawn('jolly', 0, 20);
    w.f.spawn('puffer', 10, 10);
    w.f.spawn('fort', 25, 25);
    w.f.spawn('coilback', 0, -30);
    let min = Infinity;
    let maxAlive = 0;
    w.run(300, (w) => {
      const v = w.f.visuals();
      for (const r of v.rings) min = Math.min(min, r.T);
      for (const l of v.lanes) min = Math.min(min, l.T);
      for (const l of v.lines) if (l.state === 'lock') min = Math.min(min, l.T + 1.3);
      maxAlive = Math.max(maxAlive, w.f.alive('puffer'));
      if (Math.round(w.t / DT) % 1800 === 0) {
        w.f.spawn('puffer', w.player.x + 12, w.player.z);
        w.f.spawn('puffer', w.player.x - 12, w.player.z, { n: 3, owner: 77 });
      }
    });
    lines.push(min >= 1.5 - 1e-6);
    check(min >= 1.5 - 1e-6, `EXIT: every telegraph ≥ 1.5 s over 300 s of every foe (min ${f2(min)})`);
    check(maxAlive <= 6, `EXIT: puffers ≤ 6 alive (patch min(4, 6 − alive), owned summons outside slots(), max ${maxAlive})`);
  }

  console.log(failures ? `\n${failures} check(s) failed` : `\nAll foes4 checks passed (${passes})`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
