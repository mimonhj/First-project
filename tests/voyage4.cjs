// Voyage IV suite (SPEC4 §13.2, tests/voyage4.cjs): the Sunset Isles, levels 10-12, through the window.__game test API
// in headless Chromium with the real-time loop frozen (G.step(1/120)), like voyage3.cjs:
// - the voyage (levels): twelve levels, Voyage IV's three (names, seas, stars, rules, pools, crates, bonus, the finale),
//   level 9's three keys laid over it by voyage.js
// - the journey (journey): cards 10-12 under "Voyage IV · The Sunset Isles", card 10 "Drive off the Kraken", the
//   difficulty pill, level 9's Victory "Sail on to the Sunset Isles", Enter starts level 10 with the voyage gold, the
//   won shipyard's exits; the parts Stage 3 wires (the compact pill, the migration, level 9's teaser) run once Voyage IV
//   sails for everyone (see "How to run")
// - each level's start (starts): its sea and music, its first wave as drawn, the layout rules, the crate spots, the
//   env's data (fogLoops, currents, tideBars, fortSpots, the Shellback's lair and arena), the draw calls (≤ 310), a
//   screenshot (mangroves.png, spires.png, shoals.png); the level banners at 568x320 (banner)
// - the pools (pools): G.v4.waves = pools.drawWaves for a pinned seed, Try again replays the same waves, a clear raises
//   plays (the voyage4 record written before the gold is banked), the next start draws differently, the cleared card's
//   "The seas will change next time!"
// - meeting a new kind (meet): its card once (met saved at once), #game-live, the NEW tag for 10 s, the grace held
//   until 4 s after the card shows, also for a wave-2 newcomer whose card waits behind the "Reinforcements!" banner and
//   for a Rock Fort met right beside you
// - each kind through G.v4.spawn / G.spawn on any level: the Monkey Jollyboats (jolly), the Sting Sloop (stinger),
//   nets (nets), Puffer Mines (puffers), the Coral Witch (witch), Old Coilback (coilback), the Rock Fort (fort); G's words
//   on every pseudo kind and no pseudo kind ever captured, boarded, given crew pips or counted in feats.prizes (pseudo)
// - the hazards: fog (fog), coral currents (currents), the ebb tide (tide)
// - kindness (kind): at most 6 warning shapes at once (a 7th waits); at 390x844 a ring landing by the hull is on screen
// - warm draws (warm): no new WebGL program after the fly-in at the first fog bank, current, low tide or Coilback dive
// - draw calls (busy): the busiest sampled play of each level ≤ 450; foes.png
// - bot v4 (bot): levels 10, 11 and 12's waves cleared with special shot and with none within 900 s of simulated time
//   (a second try allowed), never stuck 60 s, never inside land (one seeded run each)
// The finale (the Shellback: the dread, the wake, the phases, the Conch, the checkpoint) is Stage 2 round R5's.
//
// How to run: `node tests/voyage4.cjs` (V4_ONLY=levels,pools runs some sections; V4_ROOT serves another copy of the game;
// SCREENSHOT_DIR puts the screenshots elsewhere). V4_QUERY is the page's query: '?quality=low&v4=1' while Voyage IV sits
// behind the flag (Stage 2); at the flip (Stage 3, 3C) it becomes '?quality=low', and every check marked "Stage 3"
// (the compact pill, the migration, level 9's teaser) then runs too (it runs whenever the query has no v4=1, or with
// V4_STAGE3=1). Before the flip those checks print "WAIT" and are not counted. The numbers come from the game's own
// tables (pools.js, mechanics4.js, foes4.js, loaded as data: URLs), so a tuning in Stage 3 moves the checks with it.
// tests/balance.cjs runs botV4 (exported below) over more seeds (its opt-in v4 section).
const fs = require('fs');
const path = require('path');

const ROOT = process.env.V4_ROOT || path.join(__dirname, '..');
const OUT = process.env.SCREENSHOT_DIR || path.join(ROOT, 'tests', 'screenshots');
const ONLY = (process.env.V4_ONLY || '').split(',').filter(Boolean);
const QUERY = process.env.V4_QUERY || '?quality=low&v4=1';
const STAGE3 = process.env.V4_STAGE3 === '1' || !/[?&]v4=1(&|$)/.test(QUERY);
const BROWSER_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const SCREENSHOT_TIMEOUT = 120000;

let failures = 0;
let passes = 0;
let waits = 0;
function check(cond, msg) {
  console.log(`${cond === true ? 'PASS' : 'FAIL'}  ${msg}`);
  if (cond === true) passes++;
  else failures++;
}
// A Stage 3 check (3A wires it at the flip): counted from then on; before it, its result is printed as WAIT.
function check3(cond, msg) {
  if (STAGE3) return check(cond, msg);
  waits++;
  console.log(`WAIT  (Stage 3, 3A: runs once Voyage IV sails for everyone; now ${cond === true ? 'already passing' : 'not wired yet'}) ${msg}`);
}
const J = (v) => JSON.stringify(v);
const near = (a, b, eps = 1e-6) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= eps;
const OWN_ALL = '{"v":1,"own":{"fire":1,"frost":1,"stink":1}}';
// The voyage4 record (SPEC4 §10.1): by default every kind met and every tip seen (no meet card, no tip in the way).
const V4REC = (o = {}) => JSON.stringify({ v: 1, plays: [0, 0, 0], met: 255, won: 0, tips: 65535, prizes: {}, ...o });
// Levels 1-12 open, the tutorial and every tip seen, all three recipes owned, every Voyage IV kind met.
const STORE = { 'pirates-ahoy-unlocked': '12', 'pirates-ahoy-tutorial-done': '1', 'pirates-ahoy-tips': '65535', 'pirates-ahoy-powder': OWN_ALL, 'pirates-ahoy-voyage4': V4REC() };

// The game's own tables (pure modules, loaded as data: URLs): in the page as T.N.
async function load(rel) {
  const src = fs.readFileSync(path.join(ROOT, 'src', rel), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
}
async function numbers() {
  const P = await load('pools.js');
  const M = await load('mechanics4.js');
  const F = await load('foes4.js');
  const plain = (o) => JSON.parse(JSON.stringify(o));
  return {
    MEET: plain(P.MEET),
    V4_KINDS: plain(P.V4_KINDS),
    PACKS: plain(P.PACKS),
    POOL_RULES: plain(P.POOL_RULES),
    FOG: plain(M.FOG),
    CURRENT: plain(M.CURRENT),
    TIDE: plain(M.TIDE),
    WARN: plain(M.WARN),
    NET: plain(M.NET),
    STINGER: plain(M.STINGER),
    WITCH: plain(M.WITCH),
    POP: plain(M.WORDS4.pop),
    HUD: plain(M.WORDS4.hud),
    BOARD: plain(M.WORDS4.board),
    MEETW: plain(M.WORDS4.meet),
    CARD: { seas: M.WORDS4.card.seas },
    JOLLY: plain(F.JOLLY),
    PUFFER: plain(F.PUFFER),
    COILBACK: plain(F.COILBACK),
    FORT: plain(F.FORT),
    FOE_NAMES: plain(F.FOE_NAMES),
  };
}

// ---------------------------------------------------------------------------------------------------------
// In-page helpers (window.T), installed after every page load
// ---------------------------------------------------------------------------------------------------------
function installHelpers() {
  const G = window.__game;
  const rightX = (h) => -Math.cos(h);
  const rightZ = (h) => Math.sin(h);
  const T = {
    // Level n frozen at its start: the fly-in over, you stopped, its land and reefs moved out of the way, its own
    // ships parked out of reach (a ship with `rise` > 0 has no AI and is never hit), past the grace period. On a
    // Voyage IV level its own pseudo foes are sent away too and no later wave comes (foes: true keeps them).
    level(n, { foes = false, land = false } = {}) {
      G.state.tutorialDone = true;
      G.newGame(n);
      G.state.intro = 0;
      G.state.bannerTimer = 0;
      const p = G.player;
      p.speed = 0;
      G.state.sail = 0;
      if (!land) {
        G.colliders.forEach((c) => (c.x += 5000));
        G.reefs.forEach((r) => (r.x += 5000));
      }
      T.parkAll();
      if (!foes) T.clearFoes();
      T.pastGrace();
      G.state.combatTime = 30;
      G.combat.forceCrit('none');
      G.combat.seed(1);
      G.combat.clearLog();
      return p;
    },
    // Every enemy ship parked on the far side of the sea.
    parkAll() {
      const ps = G.env.playerStart;
      const d = Math.hypot(ps.x, ps.z) || 1;
      const R = G.env.worldRadius - 6;
      G.enemies.forEach((e, k) => {
        e.rise = 1e6;
        e.x = (-ps.x / d) * R + (ps.z / d) * 9 * k;
        e.z = (-ps.z / d) * R - (ps.x / d) * 9 * k;
        e.speed = 0;
      });
    },
    // The level's pseudo foes gone (every raised part hit hard until no wave slot is left, at most 12 s), and no
    // later wave: the wave counter at its last wave.
    clearFoes() {
      const waves = G.v4.waves;
      if (waves) G.state.wave = waves.length - 1;
      for (let i = 0; i < 12 * 120 && (G.v4.slots > 0 || G.v4.targets.length); i++) {
        if (i % 30 === 0) for (const w of G.v4.wrappers) G.v4.damage(w.id, 1e6);
        G.player.hp = G.player.maxHp;
        G.step(1 / 120);
      }
      G.state.bannerTimer = 0;
    },
    // Stepped (you held still) until the level's grace is over for Voyage IV's rules (mechanics4's hazard clock).
    pastGrace() {
      const def = G.LEVELS[G.state.level - 1];
      const pin = T.pinner(G.player);
      T.until(() => (G.v4.mechanics4 ? G.v4.mechanics4.hazardTime : Infinity) >= (def.grace || 0) + 0.05, 12, pin);
    },
    // A point `lat` off your beam (+ starboard) and `along` ahead.
    at(lat, along = 0) {
      const p = G.player;
      return { x: p.x + rightX(p.h) * lat + Math.sin(p.h) * along, z: p.z + rightZ(p.h) * lat + Math.cos(p.h) * along };
    },
    // A new enemy ship `lat` off your beam, `along` ahead, heading yours + `turn`.
    spawn(type, lat, along = 0, turn = 0) {
      const p = G.player;
      const a = T.at(lat, along);
      const e = G.spawn(type, a.x, a.z, p.h + turn);
      e.speed = 0;
      e.rise = 0;
      return e;
    },
    // A Voyage IV pseudo foe there (G.v4.spawn): its foes4 id.
    spawn4(kind, lat, along = 0, opts) {
      const a = T.at(lat, along);
      return G.v4.spawn(kind, a.x, a.z, opts);
    },
    foe: (id) => (G.v4.foes ? G.v4.foes.foes.find((f) => f.id === id) : null) || null,
    steps(s, each) {
      const n = Math.round(s * 120);
      for (let i = 0; i < n; i++) {
        G.step(1 / 120);
        if (each && each(i) === false) return i + 1;
      }
      return n;
    },
    // Step until cond() (at most `s` seconds of game time), `each` every step; true when it came.
    until(cond, s = 10, each) {
      const n = Math.round(s * 120);
      for (let i = 0; i < n; i++) {
        if (cond()) return true;
        if (each) each(i);
        G.step(1 / 120);
      }
      return !!cond();
    },
    // Hold ships where they are (stopped; enemies don't fire).
    pinner(...ships) {
      const at = ships.map((s) => [s, s.x, s.z, s.h]);
      return () => {
        for (const [s, x, z, h] of at) {
          s.x = x;
          s.z = z;
          s.h = h;
          s.speed = 0;
          if (s.kind === 'enemy') s.reload.port = s.reload.star = 99;
        }
      };
    },
    // Draw one frame of the paused scene.
    redraw() {
      window.dispatchEvent(new Event('resize'));
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    },
    shown: (id) => {
      const el = document.getElementById(id);
      return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0;
    },
    text: (id) => (document.getElementById(id)?.textContent || '').replace(/\s+/g, ' ').trim(),
    // Every pop spawned from now on ({ text, sub, cls }), with the records not delivered yet.
    watchPops() {
      T.popList = [];
      if (T.popObs) T.popObs.disconnect();
      T.popObs = new MutationObserver(T.popRecords);
      T.popObs.observe(document.getElementById('pops'), { childList: true, subtree: true });
    },
    popRecords(recs) {
      for (const r of recs) {
        const el = r.target;
        if (r.type !== 'childList' || !el.classList) continue;
        const pop = el.closest('.pop');
        const text = [...r.addedNodes].map((n) => n.textContent).join('');
        if (el.classList.contains('pop-main')) T.popList.push({ el: pop, text, sub: '', cls: pop ? pop.className : '' });
        else if (el.classList.contains('pop-sub') && text) {
          for (let i = T.popList.length - 1; i >= 0; i--) {
            if (T.popList[i].el === pop) {
              T.popList[i].sub = text;
              break;
            }
          }
        }
      }
    },
    pops() {
      if (T.popObs) T.popRecords(T.popObs.takeRecords());
      return (T.popList || []).map((p) => (p.sub ? `${p.text} ${p.sub}` : p.text));
    },
    // Every sound played from now on (the names given to audio.play, and its duration option), read with T.sounds.
    spySounds() {
      if (!T.sounds) {
        T.sounds = [];
        const a = G.audio;
        const play = a.play;
        a.play = function (name, o, ...rest) {
          T.sounds.push({ name, t: G.state.time, duration: o && o.duration });
          return play.call(this, name, o, ...rest);
        };
      }
      T.sounds.length = 0;
    },
    // Everything #game-live said from now on.
    lives: () => [...(G.liveLog || [])],
    // Real frames for `seconds` of play with `hold` each frame; the mode is put back.
    async play(seconds = 1.1, hold = () => {}) {
      const mode = G.state.mode;
      G.state.mode = 'playing';
      const t0 = G.state.time;
      let n = 0;
      while (G.state.time - t0 < seconds && n < 600) {
        await new Promise((r) => requestAnimationFrame(r));
        hold();
        n++;
      }
      G.state.mode = mode;
      return n;
    },
    // A key event on the window (the game's own handlers).
    key(key, code, { type = 'keydown', repeat = false } = {}) {
      window.dispatchEvent(new KeyboardEvent(type, { key, code, repeat, bubbles: true, cancelable: true }));
    },
    // The hint bubble's text now (G.state.flash: the G words; the tip bubble otherwise).
    flash: () => (G.state.flash && G.state.time < G.state.flash.until ? G.state.flash.text : ''),
    // The distance from (x, z) to your hull's centre line.
    hullDist(s, x, z) {
      const fx = Math.sin(s.h);
      const fz = Math.cos(s.h);
      const half = s.type.len / 2;
      const along = Math.max(-half, Math.min(half, (x - s.x) * fx + (z - s.z) * fz));
      return Math.hypot(x - (s.x + fx * along), z - (s.z + fz * along));
    },
    // Where a world point lands on the screen (CSS px), or null behind the camera.
    toScreen(x, y, z) {
      const cam = G.camera;
      const v = cam.position.clone().set(x, y, z).project(cam);
      if (v.z > 1) return null;
      return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
    },
  };
  window.T = T;
}

// ---------------------------------------------------------------------------------------------------------
// Bot v4 (SPEC4 §13.3; bot v3 of voyage3.cjs plus Voyage IV's foes and hazards). Runs INSIDE the page:
// page.evaluate(botV4, args). Bot v3: circles or keeps a beam on the nearest pirate, grapples on capture odds, Fire on
// Iron Turtles, Frost on fire ships and charging sharks, Stink on bomb ketches and before a boarding, steers round land,
// unsticks. Plus: grape on jollyboat packs and puffer patches; chain on a Sting Sloop; holds G (CUT!) to cut a net; Fire
// on a Net Sloop whose net whirls; Stink on the Coral Witch and on a rearing Old Coilback; steers out of every coconut
// and puffer ring, summons ring, Coilback lane, fort line and net fan (like lava), and out of the sandbars while the tide
// is out; turns off a fort's line when it tracks; shoots Old Coilback's head (when it is up) and knocks forts down with
// round shot. args: { n, profile: 'stock' | 'late' | 'v4', specials, strategy: 'circle' | 'beam', seed, maxT, SPECIAL }.
// Profile V4 (§2.8) = SPEC3 §5.9's late-game profile exactly, with no Voyage IV building. Deterministic per seed:
// Math.random and the pool seed (G.v4.seed) are set before the level starts, the combat dice after.
// ---------------------------------------------------------------------------------------------------------
function botV4(args) {
  const { n, profile = 'v4', maxT = 900, specials = true, strategy = 'circle', seed = 1, SPECIAL = {} } = args;
  const G = window.__game;
  const wrap = (a) => ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  const hyp = Math.hypot;
  function mulberry32(a0) {
    let a = a0 >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const LATE = { ship: { guns: 1, shot: 2, crew: 2, hull: 2, sails: 1, carpenter: 1, rudder: 1 }, armory: { boarders: 1, cutlass: 1, grapple: 0, gunner: 1 }, island: { windmill: 1 } };
  const PROFILES = { stock: { ship: {}, armory: {}, island: {} }, late: LATE, v4: LATE };
  const P = PROFILES[profile] || LATE;
  G.setShipConfig({ up: P.ship });
  G.armory.set({ up: P.armory });
  G.island.set({ v: 1, t: P.island });
  G.specials.setPowder({ v: 1, own: specials ? { fire: 1, frost: 1, stink: 1 } : { fire: 0, frost: 0, stink: 0 } });
  G.state.unlocked = Math.max(G.state.unlocked, G.LEVELS.length);
  G.state.tutorialDone = true;
  Math.random = mulberry32((seed * 2654435761 + n * 40503) >>> 0);
  G.v4.seed((seed * 104729 + n * 7919 + 13) >>> 0);
  G.startLevel(n);
  G.v4.seed(null);
  if (G.state.mode === 'playing') G.togglePause();
  G.state.mode = 'playing';
  G.combat.seed(seed * 7919 + n * 31);
  const S = G.combat.rules;
  const stats = {
    level: n, profile, specials, strategy, seed, waves: G.v4.waves, loads: G.specials.loads, spent: null, result: null, time: 0, damageTaken: 0, hpLeft: 0, maxHp: G.player.maxHp,
    captures: 0, sunk: 0, boardings: 0, raids: 0, cuts: 0, takes: 0, nets: 0, netCuts: 0, stuck: 0, hurtBy: null, left: '', noProgress: 0, waveTimes: [], ammoFired: {}, unsticks: 0,
  };
  let t = 0;
  let lastHp = G.player.hp;
  let wasActive = false;
  let tick = 0;
  let cutPresses = 0;
  let holding = false;
  let wasNetted = false;
  let lastProgress = 0;
  let progressKey = '';
  const orbit = { target: null, hp: 0, crew: Infinity, hitAt: 0, flipUntil: -1 };
  const unstick = { slow: 0, until: -1, side: 1, trail: [] };
  const notchOf = (e) => e.strikeAt ?? S.strikeAt(e.crew0);
  const crewOf = (e) => G.combat.crewOf(e);
  const T4 = { J: 2.2, puff: 4, lane: 4, net: 18 };
  let wave = G.state.wave;
  while (G.state.mode === 'playing' && t < maxT) {
    tick++;
    const p = G.player;
    const B = G.boarding;
    G.input.left = G.input.right = false;
    if (G.state.wave !== wave) {
      wave = G.state.wave;
      stats.waveTimes.push(Math.round(t));
    }
    if (B.active && !wasActive) {
      if (B.kind === 'defend') stats.raids++;
      else if (B.kind === 'surrender') stats.takes++;
      else if (B.kind !== 'counter') stats.boardings++;
      cutPresses = 0;
    }
    wasActive = B.active;
    if (!p.sinking) {
      if (B.active && B.phase === 'threat' && cutPresses < 3 && tick % 3 === 0) {
        G.boardPress();
        cutPresses++;
        if (cutPresses === 3) stats.cuts++;
      }
      const vis = G.mechanics3.visuals() || {};
      const fs4 = G.v4.foes || { foes: [], puffers: [] };
      // ---- the pseudo foes' raised parts as targets (pseudo-ships for inArc)
      const parts = G.v4.wrappers.filter((w) => w.hp > 0).map((w) => ({ x: w.x, z: w.z, h: 0, speed: 0, hp: w.hp, kind: w.kind, part: w.partKind, id: w.id, type: { len: w.len, wid: w.len } }));
      const coil = fs4.foes.find((f) => f.kind === 'coilback' && f.state !== 'home') || null;
      // ---- who to go for: the nearest fighting ship; a struck ship close by is taken; a pseudo foe when it is nearer
      const afloat = G.enemies.filter((e) => e.hp > 0 && !e.sinking && !e.captured && !e.escaped && !e.fleeing);
      const fighting = afloat.filter((e) => G.fighting(e) && !(e.rise > 0));
      const struck = afloat.filter((e) => e.surrendered);
      const nearest = (list) => list.slice().sort((a, b) => hyp(a.x - p.x, a.z - p.z) - hyp(b.x - p.x, b.z - p.z))[0] || null;
      let target = nearest(fighting);
      const s0 = nearest(struck);
      if (s0 && (!target || hyp(s0.x - p.x, s0.z - p.z) < 30)) target = s0;
      // (puffers are popped as they come; the pack is grape-shot as it rings you; forts and the Coilback are gone for
      // when nothing else is near)
      const pq = parts.filter((w) => w.kind !== 'puffer' || hyp(w.x - p.x, w.z - p.z) < 26);
      let ptarget = nearest(pq.filter((w) => !(w.kind === 'coilback' && w.part === 'hump' && pq.some((q) => q.part === 'head'))));
      if (ptarget && target && hyp(ptarget.x - p.x, ptarget.z - p.z) > hyp(target.x - p.x, target.z - p.z) - 4 && ptarget.kind !== 'jolly') ptarget = null;
      if (!target && !ptarget && coil) ptarget = { x: coil.x, z: coil.z, h: 0, speed: 0, hp: coil.hp, kind: 'coilback', part: 'shadow', type: { len: 4, wid: 4 } };
      if (!B.active) {
        const ct = B.counterTarget;
        if (ct) {
          const o = B.odds(ct, 'counter');
          if (o && o.label === 'capture') G.boardPress();
        } else {
          const pick = B.pick();
          if (pick.target && (pick.label === 'capture' || pick.label === 'take')) G.grapple();
        }
      }
      let desired = p.h;
      let sail = 2;
      let ammo = 'round';
      const L = G.specials.loads;
      const unl = G.combat.unlockedAmmo || ['round'];
      const has = (a) => unl.includes(a);
      const rams = vis.rams || [];
      const go = ptarget && (!target || hyp(ptarget.x - p.x, ptarget.z - p.z) < hyp(target.x - p.x, target.z - p.z)) ? ptarget : target;
      if (go) {
        const pseudo = go === ptarget;
        const r = G.relative(p, go.x, go.z);
        const toT = Math.atan2(go.x - p.x, go.z - p.z);
        const odds = pseudo ? null : B.odds(go);
        const wantBoard = odds && (odds.label === 'capture' || odds.label === 'take');
        if (pseudo) {
          ammo = (go.kind === 'jolly' || go.kind === 'puffer') && has('grape') && r.dist < 16 ? 'grape' : 'round';
          if (specials && go.kind === 'coilback' && coil && (coil.state === 'rear' || coil.state === 'lunge') && L.stink > 0 && !(coil.status && coil.status.pegs > 0)) ammo = 'stink';
        } else {
          const crew = crewOf(go);
          if (has('grape') && r.dist < 16 && crew > notchOf(go) + 2 && !go.surrendered && !go.type.fireship) ammo = 'grape';
          if (go.type.kiter && has('chain') && r.dist < 28 && !(go.effects && go.effects.slow > 0)) ammo = 'chain';
          if (specials && !go.surrendered) {
            const st = go.status && go.status.id;
            const immune = go.status && go.status.immune > 0;
            const charging = go.type.ram && rams.some((m) => m.id === go.id);
            const whirling = go.type.nets && (vis.nets || []).some((q) => q.id === go.id);
            if (go.type.fireship && L.frost > 0 && r.dist < 28) ammo = 'frost';
            else if (charging && L.frost > 0 && st !== 'frost' && r.dist < 28) ammo = 'frost';
            else if (whirling && L.fire > 0 && r.dist < 28) ammo = 'fire';
            else if (go.type.summoner && L.stink > 0 && st !== 'stink' && !immune && r.dist < 28) ammo = 'stink';
            else if (wantBoard && L.stink > 0 && st !== 'stink' && !immune && r.dist < 20) ammo = 'stink';
            else if (go.type.mortar && L.stink > 0 && st !== 'stink' && !immune && r.dist < 20) ammo = 'stink';
            else if (!wantBoard && (go.type.armour || go.type.flagship) && L.fire > 0 && st !== 'fire' && r.dist < 28) ammo = 'fire';
          }
        }
        const pref = ammo === 'grape' ? 12 : go.kind === 'fort' ? 26 : !pseudo && go.type.fireship ? 24 : 20;
        const speed = go.speed || 0;
        const lt = Math.min(3, r.dist / Math.max(4, p.speed + 2));
        const ix = go.x + Math.sin(go.h || 0) * speed * lt;
        const iz = go.z + Math.cos(go.h || 0) * speed * lt;
        const toI = Math.atan2(ix - p.x, iz - p.z);
        if (wantBoard || go.surrendered) {
          desired = toI;
          sail = 3;
        } else if (r.dist > pref + 6) {
          desired = toT;
          sail = 3;
        } else {
          const a1 = toT + Math.PI / 2;
          const a2 = toT - Math.PI / 2;
          if (orbit.target !== go) {
            orbit.target = go;
            orbit.hp = go.hp;
            orbit.hitAt = t;
            orbit.flipUntil = -1;
          }
          if (go.hp < orbit.hp - 1e-6 || (!pseudo && crewOf(go) < (orbit.crew ?? Infinity))) orbit.hitAt = t;
          orbit.hp = go.hp;
          orbit.crew = pseudo ? 0 : crewOf(go);
          if (strategy === 'circle' && t - orbit.hitAt > 6 && r.dist < 28 && !(orbit.flipUntil > t)) {
            orbit.flipUntil = t + 4;
            orbit.hitAt = t;
          }
          const near1 = Math.abs(wrap(a1 - p.h)) < Math.abs(wrap(a2 - p.h));
          desired = near1 !== orbit.flipUntil > t ? a1 : a2;
          const sideOf = Math.sign(wrap(desired - toT));
          if (r.dist > pref + 2) desired -= sideOf * 0.4;
          else if (r.dist < pref - 5) desired += sideOf * 0.4;
          sail = strategy === 'beam' ? 1 : 2;
        }
      }
      // ---- a net: hold G (CUT!) until it lets go
      const netted = G.v4.netted;
      if (netted) {
        if (!wasNetted) stats.nets++;
        if (!holding) {
          G.v4.cutHold(true);
          holding = true;
        }
      } else if (holding) {
        G.v4.cutHold(false);
        holding = false;
        stats.netCuts++;
      }
      wasNetted = !!netted;
      if (G.state.ammo !== ammo) G.combat.setAmmo(ammo);
      // ---- a rogue wave (Voyage III's, never here): bow or stern to it
      const rg = vis.rogue;
      if (rg && rg.ahead > -4 && rg.ahead < 60) {
        const bow = rg.h + Math.PI;
        desired = Math.abs(wrap(bow - p.h)) < Math.abs(wrap(rg.h - p.h)) ? bow : rg.h;
        sail = 3;
      }
      // ---- every warning shape, like lava: rings (bombs, coconuts, puffs, summons), the Coilback's lane, a fort's
      // line, a net's fan, the sandbars while the tide is out
      const rings = G.bombs.map((b) => ({ x: b.tx, z: b.tz, r: b.radius || 5 }));
      for (const f of fs4.foes) {
        if (f.kind === 'jolly') for (const c of f.coconuts || []) rings.push({ x: c.x, z: c.z, r: T4.J });
      }
      for (const u of fs4.puffers || []) if (u.state === 'puff') rings.push({ x: u.x, z: u.z, r: T4.puff });
      for (const q of vis.summons || []) rings.push({ x: q.x, z: q.z, r: q.r || 1.6 });
      const tide = vis.tide;
      if (tide && (tide.state === 'low' || tide.state === 'warning')) for (const b of tide.bars || []) rings.push({ x: b.x, z: b.z, r: b.r });
      for (const b of rings) {
        if (hyp(p.x - b.x, p.z - b.z) < b.r + 6) {
          desired = Math.atan2(p.x - b.x, p.z - b.z);
          sail = 3;
        }
      }
      const segOut = (x0, z0, x1, z1, hw) => {
        const dx = x1 - x0;
        const dz = z1 - z0;
        const L2 = dx * dx + dz * dz;
        const k = L2 > 1e-9 ? Math.max(0, Math.min(1, ((p.x - x0) * dx + (p.z - z0) * dz) / L2)) : 0;
        const cx = x0 + dx * k;
        const cz = z0 + dz * k;
        if (hyp(p.x - cx, p.z - cz) < hw + 5) {
          // (out sideways, the way you are already on, at full sail)
          const h = Math.atan2(dx, dz);
          const side = Math.sign(-(p.x - x0) * Math.cos(h) + (p.z - z0) * Math.sin(h)) || 1;
          desired = h + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
          sail = 3;
        }
      };
      if (coil && coil.lane && (coil.state === 'rear' || coil.state === 'lunge')) segOut(coil.lane.x0, coil.lane.z0, coil.lane.x1, coil.lane.z1, (coil.lane.w || 4) / 2);
      for (const f of fs4.foes) {
        if (f.kind === 'fort' && (f.state === 'track' || f.state === 'lock')) segOut(f.x, f.z, f.x + Math.sin(f.h) * 40, f.z + Math.cos(f.h) * 40, 1.6);
      }
      for (const q of vis.nets || []) {
        // (out of the fan: away from her, then off its axis)
        const d = hyp(p.x - q.x, p.z - q.z);
        if (d < (q.len || T4.net) + 4) {
          desired = Math.atan2(p.x - q.x, p.z - q.z) + (strategy === 'beam' ? 0.6 : -0.6);
          sail = 3;
        }
      }
      // ---- keep > 16 u off a waterspout's core; a shark lining up: out of her line; a lit fire ship: away
      for (const s of vis.spouts || []) {
        if (s.state !== 'collapsing' && hyp(p.x - s.x, p.z - s.z) < 19) {
          desired = Math.atan2(p.x - s.x, p.z - s.z);
          sail = 3;
        }
      }
      for (const m of rams) {
        const sh = G.enemies.find((e) => e.id === m.id) || { x: m.x, z: m.z, h: m.h };
        const rr = G.relative({ x: sh.x, z: sh.z, h: m.h }, p.x, p.z);
        if (rr.along > -2 && rr.along < 32 && Math.abs(rr.lat) < 7) {
          desired = m.h + ((rr.lat >= 0 ? 1 : -1) * Math.PI) / 2;
          sail = 3;
        }
      }
      for (const f of vis.fireRings || []) {
        if (hyp(p.x - f.x, p.z - f.z) < f.r + 9) {
          desired = Math.atan2(p.x - f.x, p.z - f.z);
          sail = 3;
        }
      }
      // ---- steer round land and reefs
      let block = null;
      for (const o of [...G.colliders, ...G.reefs]) {
        const ri = G.relative(p, o.x, o.z);
        if (ri.along > -2 && ri.along < 22 && Math.abs(ri.lat) < o.r + 6 && (!block || ri.dist < block.dist)) block = ri;
      }
      if (block) desired = p.h + (block.lat > 0 ? 1.3 : -1.3);
      if (hyp(p.x, p.z) > G.env.worldRadius - 15) desired = Math.atan2(-p.x, -p.z);
      // ---- wedged against land, or crawling: one hard turn for 3 s, away from the nearest land
      const free = !G.boarding.active && !(G.state.intro > 0) && !netted;
      const shoved = sail >= 2 && p.speed < 2.5 && free;
      unstick.slow = shoved ? unstick.slow + 6 / 120 : 0;
      if (tick % 10 === 0) {
        unstick.trail.push({ t, x: p.x, z: p.z, free: free && sail >= 1 });
        while (unstick.trail.length && unstick.trail[0].t < t - 6) unstick.trail.shift();
      }
      const old = unstick.trail[0];
      const crawling = old && t - old.t > 5.5 && unstick.trail.every((q) => q.free) && hyp(p.x - old.x, p.z - old.z) < 5;
      if ((unstick.slow > 2 || crawling) && !(unstick.until > t)) {
        unstick.trail.length = 0;
        let nearC = null;
        for (const o of G.colliders) {
          const dd = hyp(o.x - p.x, o.z - p.z) - o.r;
          if (!nearC || dd < nearC.dd) nearC = { o, dd };
        }
        const lat = nearC ? G.relative(p, nearC.o.x, nearC.o.z).lat : 1;
        unstick.side = lat > 0 ? 1 : -1;
        unstick.until = t + 3;
        stats.unsticks++;
      }
      if (unstick.until > t) {
        desired = p.h + unstick.side * 1.5;
        sail = 3;
      }
      const diff = wrap(desired - p.h);
      if (diff > 0.05) G.input.left = true;
      else if (diff < -0.05) G.input.right = true;
      G.state.sail = sail;
      // ---- fire whichever side has a target abeam or in its arc (ships and the pseudo foes' parts)
      const range = (S.AMMO[G.state.ammo] || SPECIAL[G.state.ammo] || S.AMMO.round).range;
      const pool = [...G.enemies.filter((e) => G.fighting(e) && !(e.rise > 0)), ...parts];
      for (const side of [1, -1]) {
        const any = pool.some((e) => {
          const r2 = G.relative(p, e.x, e.z);
          const abeam = Math.sign(r2.lat) === side && r2.dist < range - 2 && Math.abs(r2.along) < Math.abs(r2.lat) * 0.5;
          return abeam || G.inArc(p, e, side, range);
        });
        if (!any) continue;
        if (G.playerFire(side)) stats.ammoFired[G.state.ammo] = (stats.ammoFired[G.state.ammo] || 0) + 1;
      }
      for (const c of G.colliders) if (hyp(c.x - p.x, c.z - p.z) < c.r) stats.stuck++;
    }
    for (let k = 0; k < 6 && G.state.mode === 'playing'; k++) {
      G.step(1 / 120);
      const d = lastHp - G.player.hp;
      if (d > 0) stats.damageTaken += d;
      lastHp = G.player.hp;
    }
    t += 6 / 120;
    // progress: enemy hp, the pseudo foes' hp, the wave; 60 s without any change is "stuck"
    const key = G.enemies.map((e) => Math.round(e.hp) + (e.surrendered ? 's' : '')).join(',') + '|' + G.state.wave + '|' + G.v4.targets.map((q) => Math.round(q.hp)).join(',') + '|' + G.v4.slots;
    if (key !== progressKey) {
      progressKey = key;
      lastProgress = t;
    } else stats.noProgress = Math.max(stats.noProgress, t - lastProgress);
  }
  if (holding) G.v4.cutHold(false);
  G.input.left = G.input.right = false;
  const left = G.specials.loads;
  stats.spent = { fire: stats.loads.fire - left.fire, frost: stats.loads.frost - left.frost, stink: stats.loads.stink - left.stink };
  stats.result = G.state.mode === 'playing' ? 'timeout' : G.state.mode;
  stats.time = Math.round(t * 10) / 10;
  stats.noProgress = Math.round(stats.noProgress * 10) / 10;
  stats.damageTaken = Math.round(stats.damageTaken);
  stats.hpLeft = Math.round(G.player.hp);
  stats.captures = G.state.captures;
  stats.sunk = G.state.sunk;
  stats.hurtBy = JSON.stringify(Object.fromEntries(Object.entries(G.state.hurtBy).map(([k, v]) => [k, Math.round(v)])));
  stats.left = G.enemies.filter((e) => e.hp > 0 && !e.captured && !e.escaped).map((e) => e.typeName + (e.surrendered ? '(struck)' : '')).join(' ') + (G.v4.slots ? ` +${G.v4.slots} pseudo` : '');
  if (G.state.mode === 'playing') G.state.mode = 'paused';
  return stats;
}

// Run `fn` in the page with the game playing for that one synchronous stretch, frozen again afterwards.
function ev(page, fn, arg = null) {
  return page.evaluate(`(async () => {
    const G = window.__game;
    if (G.state.mode === 'paused') G.state.mode = 'playing';
    try {
      return await (${fn.toString()})(${JSON.stringify(arg)});
    } finally {
      if (G.state.mode === 'playing') G.state.mode = 'paused';
    }
  })()`);
}

async function main() {
  const { chromium } = require('playwright');
  const { serve } = require('./server.cjs');
  fs.mkdirSync(OUT, { recursive: true });
  const N = await numbers();
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ args: BROWSER_ARGS });
  const errors = [];
  const watch = (p, label) => {
    p.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
    p.on('console', (m) => m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text()) && errors.push(`${label}: ${m.text()}`));
    p.on('console', (m) => m.type() === 'warning' && /^audio:/.test(m.text()) && errors.push(`${label}: ${m.text()}`));
  };
  // A page of the game. store: localStorage records set before the game loads; programs: count the WebGL programs it
  // links (window.__programs, from the first context on).
  async function open({ width = 1280, height = 720, touch = false, store = STORE, label = 'page', reducedMotion = 'no-preference', programs = false, query = QUERY } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion });
    if (store) await ctx.addInitScript((s) => { try { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); } catch {} }, store);
    if (programs) {
      await ctx.addInitScript(() => {
        window.__programs = 0;
        for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
          if (!C) continue;
          const link = C.prototype.linkProgram;
          C.prototype.linkProgram = function (...a) {
            window.__programs++;
            return link.apply(this, a);
          };
        }
      });
    }
    const page = await ctx.newPage();
    watch(page, label);
    VLABEL.set(page, label);
    await page.goto(base + query, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__gameReady === true && window.__game && window.__game.env, null, { timeout: 120000 });
    await page.evaluate(installHelpers);
    await page.evaluate((n) => (window.T.N = n), N);
    return { ctx, page };
  }
  const snap = (page, name) => page.screenshot({ path: path.join(OUT, name), timeout: SCREENSHOT_TIMEOUT });
  async function section(name, fn) {
    if (ONLY.length && !ONLY.includes(name)) return;
    console.log(`\n---- ${name}`);
    const t0 = Date.now();
    try {
      await fn();
    } catch (err) {
      check(false, `${name}: the section crashed: ${err && err.stack ? err.stack : err}`);
    }
    console.log(`     (${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  // Leaving a page: audio.js downloads every recording in the background, so a closed tab can abort one still on its
  // way and say so ("audio: no recording for music:… using the synthesised sound: TypeError: Failed to fetch"), which
  // watch() counts as a page error. close() forgives exactly that warning from the pages being closed, while they close.
  const VLABEL = new WeakMap();
  const FETCH_ABORT = /^audio: no recording for (?:music|amb|sfx):[\w-]+ \([\w.-]+\), using the synthesised sound: TypeError: Failed to fetch$/;
  async function close(c) {
    const labels = c.pages().map((p) => VLABEL.get(p)).filter(Boolean);
    const n0 = errors.length;
    await c.close();
    for (let i = errors.length - 1; i >= n0; i--) {
      const label = labels.find((l) => errors[i].startsWith(`${l}: `));
      if (!label || !FETCH_ABORT.test(errors[i].slice(label.length + 2))) continue;
      errors.splice(i, 1);
      console.log(`     (${label}: closed while a recording was still downloading; its aborted fetch is not a page error)`);
    }
  }

  // The first page (levels, journey's title, starts, pools); each later section opens its own.
  const { ctx: firstCtx, page } = await open({ label: 'voyage4' });

  // ---------------------------------------------------------------------------------------------- the voyage
  await section('levels', async () => {
    const v = await page.evaluate(async () => {
      const G = window.__game;
      const P = await import(new URL('src/pools.js', location.href).href);
      const l9 = G.LEVELS[8];
      return {
        v4: G.v4.WITH_V4,
        n: G.LEVELS.length,
        l9: { name: l9.env.meta.name, sailOn: l9.sailOn, teaser: l9.teaser, victoryLine: l9.victoryLine, waves: l9.waves, act: l9.act },
        defs: G.LEVELS.slice(9).map((d, i) => {
          const n = 10 + i;
          const pool = Array.isArray(d.pool) ? d.pool : [];
          return {
            n,
            name: d.env && d.env.meta && d.env.meta.name,
            act: d.act,
            difficulty: d.difficulty,
            stars: d.stars,
            scene: d.scene,
            mechanics: d.mechanics,
            crates: d.crates,
            bonus: d.bonus,
            boss: d.boss || null,
            finale: !!d.finale,
            lockText: d.lockText || null,
            foes: d.rumour && d.rumour.foes,
            nextWaveAt: d.nextWaveAt,
            attackers: pool.map((e) => e.attackers || null),
            musts: pool.map((e) => e.must),
            finaleText: d.finaleText || null,
            victoryLine: d.victoryLine || null,
            mechanic: d.mechanic,
            poolSame: JSON.stringify(d.pool) === JSON.stringify(P.POOLS[n]),
            wavesSame: JSON.stringify(d.waves) === JSON.stringify(P.drawWaves(n, P.POOLS[n], P.poolSeed(n, 0))),
            alive: Math.max(...pool.map((e) => e.slots)) + d.nextWaveAt,
            slots: pool.map((e) => e.slots),
          };
        }),
      };
    });
    check(v.v4 === true && v.n === 12, `levels: with ${QUERY} the Sunset Isles sail: twelve levels (${J({ v4: v.v4, n: v.n })})`);
    const want = [
      { name: 'Misty Mangroves', difficulty: 'Heroic', stars: 10, scene: 'mangroves', mechanics: ['fog'], boss: null, finale: false, lockText: 'Drive off the Kraken', foes: ['jolly', 'stinger', 'netsloop'], musts: ['jolly', 'stinger', 'netsloop'] },
      { name: 'The Sunken Spires', difficulty: 'Epic', stars: 11, scene: 'spires', mechanics: ['currents'], boss: null, finale: false, foes: ['puffer', 'witch', 'coilback'], musts: ['puffer', 'witch', 'coilback'] },
      { name: 'Shellback Shoals', difficulty: 'Ultimate', stars: 12, scene: 'shoals', mechanics: ['tide'], boss: 'shellback', finale: true, foes: ['fort', 'shellback'], musts: ['fort', null], finaleText: 'The Shellback scuttles off to sleep, and the Sunset Isles are free! You are the Admiral of the Twelve Seas!', victoryLine: 'The Twelve Seas are yours' },
    ];
    want.forEach((w, k) => {
      const d = v.defs[k] || {};
      const same = Object.keys(w).every((key) => J(d[key]) === J(w[key])) && d.act === 4 && d.crates === 2 && d.poolSame && d.wavesSame && d.slots.every((s) => s <= 3) && d.alive <= 4;
      check(same, `levels: level ${10 + k} is ${w.name} (${w.difficulty} ★${w.stars}, the ${w.scene} sea, ${w.mechanics}, introducing ${w.musts.filter(Boolean).join(', ') || 'none'}${w.boss ? ', the Shellback, the finale' : ''}), its pool pools.js's and its def.waves the plays-0 draw, ≤ 3 slots a wave and ≤ 4 alive (${J(d)})`);
    });
    const [a, b, c] = v.defs;
    check(!!a && !!b && !!c && a.bonus < b.bonus && b.bonus < c.bonus && b.attackers[2] === 3 && a.nextWaveAt === 1 && b.nextWaveAt === 1 && c.nextWaveAt === 0,
      `levels: the bonus rises (${a && a.bonus} < ${b && b.bonus} < ${c && c.bonus}), level 11's third wave has 3 attackers, nextWaveAt 1 / 1 / 0 (${J({ attackers: b && b.attackers, next: v.defs.map((d) => d.nextWaveAt) })})`);
    check(v.l9.act === 3 && v.l9.name === "The Kraken's Deep" && v.l9.sailOn === 'Sail on to the Sunset Isles' && v.l9.teaser === '…but on the sunset horizon, an island is snoring.' && v.l9.victoryLine === 'The Kraken Seas are yours' && J(v.l9.waves) === J([['skiff', 'skiff', 'ironclad'], ['inkheart', 'skiff']]),
      `levels: level 9 keeps its waves and gains voyage.js's three keys (${J(v.l9)})`);
  });

  // ---------------------------------------------------------------------------------------------- the journey
  // The title's cards, the migration (Stage 3), level 9's Victory and sail-on, Enter, the won shipyard.
  await section('journey', async () => {
    const readTitle = () => {
        const grid = document.getElementById('level-cards');
        return {
          order: [...grid.children].map((el) => (el.matches('.act-head') ? `H:${el.textContent.trim()}` : el.matches('.level-card') ? `C${el.dataset.level}` : el.tagName)),
          cards: [...grid.querySelectorAll('.level-card')].map((b) => ({
            n: Number(b.dataset.level),
            name: (b.querySelector('.lvl-name') || {}).textContent,
            word: (b.querySelector('.diff-word') || {}).textContent,
            lock: ((b.querySelector('.lvl-lock') || {}).textContent || '').trim(),
            locked: b.getAttribute('aria-disabled') === 'true',
            pill: ((b.querySelector('.lvl-pips') || {}).getAttribute || (() => null)).call(b.querySelector('.lvl-pips'), 'aria-label'),
            pillText: ((b.querySelector('.lvl-pips') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
            skulls: b.querySelectorAll('.lvl-pips .skull').length,
          })),
          unlocked: window.__game.state.unlocked,
          saved: localStorage.getItem('pirates-ahoy-unlocked'),
        };
    };
    const title = async (store, label) => {
      const { ctx, page: tp } = await open({ label, store });
      const r = await tp.evaluate(readTitle);
      await close(ctx);
      return r;
    };
    // (the title read in a page that loads with level 9 open and the Kraken not driven off: no migration either)
    const FEATS = (kraken) => JSON.stringify({ captures: 3, boardings: 2, rakes: 1, crits: 0, legend: 1, kraken, prizes: {} });
    const mig1 = await title({ 'pirates-ahoy-tutorial-done': '1', 'pirates-ahoy-unlocked': '9', 'pirates-ahoy-feats': FEATS(1) }, 'journey migration');
    const opened = (r) => r.cards.map((c) => (c.locked ? 'L' : 'P')).join('');
    check3(mig1.unlocked === 10 && mig1.saved === '10' && opened(mig1) === 'PPPPPPPPPPLL',
      `journey: a save with level 9 open and the Kraken driven off (feats.kraken 1) opens card 10 at load and saves it (${J({ unlocked: mig1.unlocked, saved: mig1.saved, cards: opened(mig1) })})`);

    // Level 9 won (the Kraken driven off) with 400 gold of voyage plunder so far.
    const { ctx, page: wp } = await open({ label: 'journey deep', store: { ...STORE, 'pirates-ahoy-unlocked': '9', 'pirates-ahoy-feats': FEATS(0) } });
    const fresh = await wp.evaluate(readTitle);
    const four = fresh.cards.slice(9);
    check(fresh.cards.length === 12 && fresh.order.slice(-4).join(' | ') === 'H:Voyage IV · The Sunset Isles | C10 | C11 | C12' &&
      four.map((c) => `${c.name}/${c.word}`).join() === 'Misty Mangroves/Heroic,The Sunken Spires/Epic,Shellback Shoals/Ultimate' &&
      four.every((c) => c.locked) && four[0].lock === 'Drive off the Kraken' && four[1].lock === 'Locked' && four[2].lock === 'Locked',
      `journey: the title's cards 10-12 sit under "Voyage IV · The Sunset Isles", locked, card 10 reading "${four[0] && four[0].lock}" (${J({ order: fresh.order.slice(-5), four: four.map((c) => ({ name: c.name, lock: c.lock, locked: c.locked })) })})`);
    check(fresh.cards.every((c, i) => c.pill === `Difficulty ${i + 1} of 12`),
      `journey: every card's pill reads "Difficulty N of 12" (${J(fresh.cards.map((c) => c.pill))})`);
    // (Stage 3: the compact pill "☠ ×10" from card 10 on: twelve skulls don't fit a 320 px card)
    check3(four.every((c, k) => c.pillText.includes(`×${10 + k}`) && c.skulls < 12),
      `journey: cards 10-12 show the compact pill (☠ ×10, ×11, ×12) (${J(four.map((c) => ({ text: c.pillText, skulls: c.skulls })))})`);
    check(fresh.unlocked === 9 && fresh.saved === '9' && opened(fresh) === 'PPPPPPPPPLLL',
      `journey: without the Kraken driven off (feats.kraken 0) level 9 stays the last open one (${J({ unlocked: fresh.unlocked, saved: fresh.saved, cards: opened(fresh) })})`);
    const winL9 = () => ev(wp, async () => {
      const G = window.__game;
      T.level(9);
      G.state.gold = 400;
      G.state.goldAtLevelStart = 400;
      G.state.nextBomb = Infinity;
      G.kraken.rise();
      G.kraken.skip();
      T.until(() => G.kraken.state && G.kraken.state.stage === 'fight', 10, () => (G.player.hp = G.player.maxHp));
      G.kraken.setHp(0);
      T.until(() => G.state.mode !== 'playing', 40, () => {
        G.player.hp = G.player.maxHp;
        G.player.speed = 0;
      });
      await T.redraw();
      const { ACT4_TEASER } = await import(new URL('src/voyage.js', location.href).href);
      const panel = document.querySelector('#won-screen .panel') || document.getElementById('won-screen');
      const first = [...panel.querySelectorAll('button')].find((b) => !b.closest('.hidden') && b.getClientRects().length);
      return {
        mode: G.state.mode,
        gold: G.state.gold,
        text: T.text('won-text'),
        teaser: ACT4_TEASER,
        act2: T.shown('act2-btn'),
        act2Text: T.text('act2-btn'),
        first: first && first.id,
        hint: T.shown('won-hint') ? T.text('won-hint') : null,
        unlocked: G.state.unlocked,
        saved: localStorage.getItem('pirates-ahoy-unlocked'),
      };
    });
    const w1 = await winL9();
    check(w1.mode === 'won' && w1.act2 && w1.act2Text === 'Sail on to the Sunset Isles' && w1.first === 'act2-btn' && !!w1.hint && /Enter/.test(w1.hint) && w1.unlocked === 10 && w1.saved === '10' && w1.gold > 400,
      `journey: the Kraken's Deep's Victory: "${w1.act2Text}" is its first button, a hint says Enter sails on, level 10 opens and is saved (${J(w1)})`);
    check3(w1.text.endsWith(` ${w1.teaser}`), `journey: the Kraken's Deep's Victory text ends with the teaser "${w1.teaser}" ("${w1.text}")`);
    const dock = await wp.evaluate(() => {
      const G = window.__game;
      G.dock.open('won');
      const exits = [...document.querySelectorAll('#dock-exits button')].map((b) => b.textContent.trim()).join(' | ');
      return { from: G.dock.from, exits };
    });
    check(dock.exits === 'Set sail for Misty Mangroves | Back to the title', `journey: the won shipyard after the Kraken's Deep sails on: "${dock.exits}"`);
    const w2 = await winL9();
    await wp.keyboard.press('Enter');
    await wp.waitForFunction(() => window.__game.state.mode === 'playing', null, { timeout: 60000 }).catch(() => {});
    const s2 = await wp.evaluate(() => ({ mode: window.__game.state.mode, level: window.__game.state.level, gold: window.__game.state.gold, atStart: window.__game.state.goldAtLevelStart, name: window.__game.LEVELS[window.__game.state.level - 1].env.meta.name }));
    check(w2.mode === 'won' && s2.mode === 'playing' && s2.level === 10 && s2.name === 'Misty Mangroves' && s2.gold === w2.gold && s2.atStart === w2.gold,
      `journey: Enter on the Kraken's Deep's Victory sets sail for Misty Mangroves with the voyage gold (${J({ ...s2, wonGold: w2.gold })})`);
    await close(ctx);
  });

  // --------------------------------------------------------------------------------------- each level's start
  await section('starts', async () => {
    const SHOT = { 10: 'mangroves.png', 11: 'spires.png', 12: 'shoals.png' };
    for (const n of [10, 11, 12]) {
      const s = await page.evaluate(async (n) => {
        const G = window.__game;
        const scenes = [];
        const audio = G.audio;
        const setScene = audio.setScene;
        audio.setScene = function (name, ...rest) {
          scenes.push(name);
          return setScene.call(this, name, ...rest);
        };
        G.state.tutorialDone = true;
        try {
          G.newGame(n);
        } finally {
          audio.setScene = setScene;
        }
        const def = G.LEVELS[n - 1];
        const env = G.env;
        const hull = (s) => s.type.wid * 0.5 + 0.4;
        const ships = [G.player, ...G.enemies];
        const inLand = (p, pad) => G.colliders.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < c.r + pad);
        const crates = env.crateSpots || [];
        const ps = env.playerStart;
        const R = env.worldRadius;
        // a polyline's points every 1 u, and the distance from (x, z) to a segment
        const segD = (x, z, ax, az, bx, bz) => {
          const dx = bx - ax;
          const dz = bz - az;
          const L2 = dx * dx + dz * dz;
          const k = L2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0;
          return Math.hypot(x - ax - dx * k, z - az - dz * k);
        };
        const lineD = (pts, x, z, closed) => {
          let d = Infinity;
          const m = closed ? pts.length : pts.length - 1;
          for (let i = 0; i < m; i++) {
            const a = pts[i];
            const b = pts[(i + 1) % pts.length];
            d = Math.min(d, segD(x, z, a.x, a.z, b.x, b.z));
          }
          return d;
        };
        const landD = (pts, closed) => Math.min(...G.colliders.map((c) => lineD(pts, c.x, c.z, closed) - c.r));
        const wave0 = G.v4.waves[0];
        const out = {
          level: G.state.level,
          name: def.env.meta.name,
          scenes,
          v4wave: wave0,
          ships: G.enemies.map((e) => e.typeName).sort(),
          pseudo: (G.v4.foes ? G.v4.foes.foes : []).map((f) => f.kind).sort(),
          wantShips: wave0.filter((k) => !['jolly', 'puffer', 'coilback', 'fort', 'shellback'].includes(k)).sort(),
          wantPseudo: wave0.filter((k) => ['jolly', 'puffer', 'coilback', 'fort'].includes(k)).sort(),
          spawns: (env.enemySpawns || []).length,
          blocked: ships.filter((s) => inLand(s, hull(s))).length,
          outside: (env.enemySpawns || []).filter((p) => Math.hypot(p.x, p.z) > R).length,
          spawnsInLand: (env.enemySpawns || []).filter((p) => inLand(p, 4)).length,
          crates: crates.length,
          cratesBad: crates.filter((p) => inLand(p, 3) || Math.hypot(p.x, p.z) > R - 4).length,
          start: Math.hypot(ps.x, ps.z) < R - 10,
          minEnemyDist: G.enemies.length ? Math.round(Math.min(...G.enemies.map((e) => Math.hypot(e.x - G.player.x, e.z - G.player.z)))) : null,
          loads: G.specials.loads,
          reefs: G.reefs.length,
        };
        if (n === 10) {
          const loops = env.fogLoops || [];
          out.fog = {
            loops: loops.length,
            land: loops.map((l) => Math.round(landD(l.points, l.closed !== false) * 10) / 10),
            start: loops.map((l) => Math.round(lineD(l.points, ps.x, ps.z, l.closed !== false) * 10) / 10),
          };
        }
        if (n === 11) {
          const lanes = env.currents || [];
          out.currents = {
            n: lanes.length,
            widths: lanes.map((l) => l.width || null),
            land: lanes.map((l) => Math.round((landD(l.points, false) - (l.width || 8) / 2) * 10) / 10),
            start: lanes.map((l) => Math.round((lineD(l.points, ps.x, ps.z, false) - (l.width || 8) / 2) * 10) / 10),
          };
        }
        if (n === 12) {
          const bars = env.tideBars || [];
          const barD = (b, x, z) => segD(x, z, b.ax, b.az, b.bx, b.bz) - b.r;
          const lair = env.shellbackLair;
          const arena = env.shellbackArena;
          out.shoals = {
            bars: bars.length,
            onStart: bars.map((b) => Math.round(barD(b, ps.x, ps.z) * 10) / 10),
            // (sail-round: open water of at least 6 u between a bar and any land, and inside the world)
            land: bars.map((b) => Math.round(Math.min(...G.colliders.map((c) => Math.min(segD(c.x, c.z, b.ax, b.az, b.bx, b.bz)) - b.r - c.r)) * 10) / 10),
            edge: bars.map((b) => Math.round((R - Math.max(Math.hypot(b.ax, b.az), Math.hypot(b.bx, b.bz)) - b.r) * 10) / 10),
            forts: (env.fortSpots || []).map((f) => ({ start: Math.round(Math.hypot(f.x - ps.x, f.z - ps.z)), lair: lair ? Math.round(Math.hypot(f.x - lair.x, f.z - lair.z)) : null, stack: G.colliders.some((c) => Math.hypot(c.x - f.x, c.z - f.z) < 1.5) })),
            lair,
            arena,
            arenaLand: arena ? Math.round(Math.min(...G.colliders.map((c) => Math.hypot(c.x - arena.x, c.z - arena.z) - c.r - arena.r)) * 10) / 10 : null,
            arenaBars: arena ? Math.round(Math.min(...bars.map((b) => barD(b, arena.x, arena.z) - arena.r)) * 10) / 10 : null,
            arenaIn: arena ? Math.hypot(arena.x, arena.z) + arena.r <= R : false,
          };
        }
        // the draw-call probe: the fly-in over, 1 s of play, frozen; the foes' model built (one mesh a frame), two frames
        G.state.intro = 0;
        for (let i = 0; i < 120; i++) G.step(1 / 120);
        G.state.mode = 'paused';
        for (let i = 0; i < 60 && G.v4.view() && !G.v4.view().ready; i++) await T.redraw();
        await T.redraw();
        await T.redraw();
        out.calls = G.renderInfo.calls;
        out.viewReady = G.v4.view() ? G.v4.view().ready : null;
        return out;
      }, n);
      await snap(page, SHOT[n]);
      check(s.level === n && s.scenes.includes(['mangroves', 'spires', 'shoals'][n - 10]) && J(s.ships) === J(s.wantShips) && J(s.pseudo) === J(s.wantPseudo) && J(s.loads) === '{"fire":4,"frost":4,"stink":4}',
        `starts: level ${n}, ${s.name}, starts with its music (${J(s.scenes)}), its first wave as drawn (${J(s.v4wave)}: ships ${J(s.ships)}, foes ${J(s.pseudo)}) and 4 loads of each special shot`);
      check(s.spawns >= 6 && s.blocked === 0 && s.outside === 0 && s.spawnsInLand === 0 && (s.minEnemyDist === null || s.minEnemyDist > 35) && s.crates >= 4 && s.cratesBad === 0 && s.start,
        `starts: level ${n} spawns its ships and lays its crate spots in open water (${J({ spawns: s.spawns, blocked: s.blocked, outside: s.outside, spawnsInLand: s.spawnsInLand, minEnemyDist: s.minEnemyDist, crates: s.crates, cratesBad: s.cratesBad })})`);
      if (n === 10) {
        const f = s.fog || {};
        check(s.reefs >= 4 && s.reefs <= 6 && f.loops >= 3 && f.land.every((d) => d >= N.FOG.len / 2 + 4 - 0.05) && f.start.every((d) => d >= 20 - 0.05),
          `starts: Misty Mangroves has ${f.loops} fog loops, each clear of land by ≥ ${N.FOG.len / 2 + 4} u (${J(f.land)}) and ≥ 20 u from your start (${J(f.start)}), and ${s.reefs} reefs (4-6)`);
      }
      if (n === 11) {
        const c = s.currents || {};
        check(c.n === 3 && c.widths.every((w) => w === null || w === N.CURRENT.width) && c.land.every((d) => d > 0) && c.start.every((d) => d >= 15 - 0.05),
          `starts: the Sunken Spires has 3 coral currents ${N.CURRENT.width} u wide, none through land (edge to shore ${J(c.land)}) and none within 15 u of your start (${J(c.start)})`);
      }
      if (n === 12) {
        const h = s.shoals || {};
        check(h.bars === 4 && h.onStart.every((d) => d > 4) && h.land.every((d) => d >= 6) && h.edge.every((d) => d >= 6),
          `starts: Shellback Shoals has 4 sandbars, none on your start (${J(h.onStart)}), each one a ship sails round on both sides (≥ 6 u of open water to land ${J(h.land)} and to the edge ${J(h.edge)})`);
        check(h.forts.length >= 3 && h.forts.every((f) => f.start >= 30 && f.lair >= 15 && f.stack),
          `starts: ${h.forts.length} fort spots on sea stacks, each ≥ 30 u from your start and ≥ 15 u from the lair (${J(h.forts)})`);
        check(!!h.lair && h.lair.r === 12 && !!h.arena && h.arena.r === 70 && h.arenaLand >= 12 && h.arenaBars >= 6 && h.arenaIn,
          `starts: the lair (r ${h.lair && h.lair.r}) and the arena (r ${h.arena && h.arena.r}) clear of land by ≥ 12 (${h.arenaLand}) and of the sandbars by ≥ 6 (${h.arenaBars}), inside the world (${J({ lair: h.lair, arena: h.arena })})`);
      }
      check(s.calls > 0 && s.calls <= 310, `starts: level ${n} draws in ${s.calls} draw calls at its start (≤ 310; the foes' model ${s.viewReady ? 'built' : 'still building'})`);
    }
  });

  // ------------------------------------------------------------------------ the level banners at 568x320
  await section('banner', async () => {
    const { ctx, page: bp } = await open({ width: 568, height: 320, label: 'banner-568' });
    const rows = [];
    for (const n of [10, 11, 12]) {
      rows.push(await bp.evaluate(async (n) => {
        const G = window.__game;
        G.state.tutorialDone = true;
        G.newGame(n);
        G.state.mode = 'paused';
        await T.redraw();
        document.getAnimations().forEach((a) => { try { if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch { /* */ } });
        const R = (id) => {
          const el = document.getElementById(id);
          if (!el || el.closest('.hidden') || !el.getClientRects().length) return null;
          const b = el.getBoundingClientRect();
          return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) };
        };
        const banner = R('banner');
        const mm = R('minimap');
        const clear = !!banner && !!mm && (banner.r <= mm.l - 7 || banner.l >= mm.r + 7 || banner.b <= mm.t - 7 || banner.t >= mm.b + 7);
        return { n, clear, banner, mm, text: T.text('banner').slice(0, 48), fits: !!banner && banner.l >= 0 && banner.r <= innerWidth && banner.t >= 0 && banner.b <= innerHeight };
      }, n));
    }
    const bad = rows.filter((r) => !r.clear || !r.fits);
    check(rows.length === 3 && bad.length === 0, `banner: the level banners of levels 10-12 at 568x320 fit and keep clear of the minimap's ring${bad.length ? ' -> ' + J(bad) : ` (${rows.map((r) => r.text).join(' | ')})`}`);
    await close(ctx);
  });

  // ------------------------------------------------------------------------------------------------ the pools
  await section('pools', async () => {
    // A pinned seed draws pools.drawWaves' waves (and spawns its first wave); Try again draws the same; without a pin
    // the seed is poolSeed(level, plays); the same pin twice plays the same fight.
    const r = await ev(page, async () => {
      const G = window.__game;
      const P = await import(new URL('src/pools.js', location.href).href);
      const J = (v) => JSON.stringify(v);
      const out = {};
      const first = () => ({ ships: G.enemies.map((e) => e.typeName).sort(), pseudo: (G.v4.foes ? G.v4.foes.foes : []).map((f) => f.kind).sort() });
      for (const n of [10, 11, 12]) {
        const def = G.LEVELS[n - 1];
        const seed = 424242 + n * 17;
        G.v4.seed(seed);
        G.state.tutorialDone = true;
        G.newGame(n);
        const w1 = G.v4.waves;
        const want = P.drawWaves(n, def.pool, seed);
        const f1 = first();
        // unpinned: the seed is poolSeed(level, plays), and Try again (a wreck's or the pause menu's) replays them
        G.v4.seed(null);
        G.newGame(n);
        const plays = G.v4.plays[n - 10];
        const w0 = G.v4.waves;
        const want0 = P.drawWaves(n, def.pool, P.poolSeed(n, plays));
        G.state.intro = 0;
        T.steps(2);
        G.retryLevel();
        const w2 = G.v4.waves;
        const plays2 = G.v4.plays[n - 10];
        const ps = (k) => ['jolly', 'puffer', 'coilback', 'fort'].includes(k);
        out[n] = {
          pinned: J(w1) === J(want),
          firstWave: J(f1.ships) === J(want[0].filter((k) => !ps(k)).sort()) && J(f1.pseudo) === J(want[0].filter(ps).sort()),
          retry: J(w2) === J(w0) && plays2 === plays,
          unpinned: J(w0) === J(want0),
          plays,
          w1,
          w0,
        };
      }
      // reproducible from (level, plays): the same pin and the same rolls play the same 20 s
      const run = (seed) => {
        G.v4.seed(seed);
        let a = 12345;
        Math.random = () => ((a = (a * 16807) % 2147483647) / 2147483647);
        G.newGame(10);
        G.state.intro = 0;
        T.steps(20, () => (G.player.hp = G.player.maxHp));
        const s = J({ foes: G.v4.foes, ships: G.enemies.map((e) => [e.typeName, Math.round(e.x * 1000), Math.round(e.z * 1000), Math.round(e.hp * 1000)]), p: [Math.round(G.player.x * 1000), Math.round(G.player.z * 1000)] });
        G.v4.seed(null);
        return s;
      };
      const r1 = run(777);
      const r2 = run(777);
      const r3 = run(778);
      out.repro = { same: r1 === r2, other: r1 !== r3 };
      return out;
    });
    for (const n of [10, 11, 12]) {
      const o = r[n];
      check(o.pinned && o.firstWave && o.retry && o.unpinned,
        `pools: level ${n}: G.v4.seed's waves are pools.drawWaves' (${J(o.w1)}) and its first wave sails; unpinned the seed is poolSeed(${n}, plays ${o.plays}) and Try again replays the same waves (${J({ pinned: o.pinned, firstWave: o.firstWave, retry: o.retry, unpinned: o.unpinned })})`);
    }
    check(r.repro.same && r.repro.other, `pools: a run replays from its seed: the same pin plays the same 20 s, another pin plays differently (${J(r.repro)})`);

    // A clear: plays + 1 in the voyage4 record, written before the gold is banked (the chest), and the cleared card's
    // line; the next start draws the next play's waves (different ones). A pool where plays p and p + 1 differ.
    const P = await load('pools.js');
    let p0 = 0;
    const asSets = (w) => J(w.map((x) => [...x].sort()));
    while (p0 < 50 && asSets(P.drawWaves(10, P.POOLS[10], P.poolSeed(10, p0))) === asSets(P.drawWaves(10, P.POOLS[10], P.poolSeed(10, p0 + 1)))) p0++;
    const { ctx, page: cp } = await open({ label: 'pools clear', store: { ...STORE, 'pirates-ahoy-voyage4': V4REC({ plays: [p0, 0, 0] }) } });
    const c = await ev(cp, async (p0) => {
      const G = window.__game;
      const P = await import(new URL('src/pools.js', location.href).href);
      const J = (v) => JSON.stringify(v);
      const writes = [];
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        writes.push(k);
        return setItem.call(this, k, v);
      };
      G.state.tutorialDone = true;
      G.newGame(10);
      const before = { plays: G.v4.plays, waves: G.v4.waves };
      G.state.intro = 0;
      // every wave sunk, tipped or sent home, until the level clears
      for (let k = 0; k < 40 && G.state.mode === 'playing'; k++) {
        for (const e of G.enemies) if (G.fighting(e)) G.damage(e, 9999);
        for (const w of G.v4.wrappers) G.v4.damage(w.id, 1e6);
        T.steps(1, () => {
          G.player.hp = G.player.maxHp;
          return G.state.mode === 'playing';
        });
      }
      T.until(() => G.state.mode !== 'playing', 10);
      Storage.prototype.setItem = setItem;
      const rec = JSON.parse(localStorage.getItem('pirates-ahoy-voyage4') || '{}');
      const iRec = writes.lastIndexOf('pirates-ahoy-voyage4');
      const iChest = writes.indexOf('pirates-ahoy-purse');
      const card = T.text('level-summary');
      G.newGame(10);
      const after = { plays: G.v4.plays, waves: G.v4.waves, want: P.drawWaves(10, G.LEVELS[9].pool, P.poolSeed(10, p0 + 1)) };
      return { mode: null, before, rec: rec.plays, iRec, iChest, writes: writes.slice(-8), card, after, differ: J(after.waves.map((x) => [...x].sort())) !== J(before.waves.map((x) => [...x].sort())), drawn: J(after.waves) === J(after.want) };
    }, p0);
    check(c.before.plays[0] === p0 && c.rec && c.rec[0] === p0 + 1 && c.iRec >= 0 && c.iChest > c.iRec,
      `pools: a clear of level 10 raises its plays ${p0} → ${c.rec && c.rec[0]} in pirates-ahoy-voyage4, written before the chest (writes ${J(c.writes)})`);
    check(c.card.includes(N.CARD.seas), `pools: the cleared card says "${N.CARD.seas}" ("${c.card.slice(0, 200)}")`);
    check(c.after.plays[0] === p0 + 1 && c.differ && c.drawn, `pools: the next start draws plays ${p0 + 1}'s waves, different ones as sets (${J(c.before.waves)} → ${J(c.after.waves)})`);
    await close(ctx);
  });

  await close(firstCtx);

  // --------------------------------------------------------------------------------------------- meeting a kind
  // A save that has met nothing: level 10 starts with Monkey Jollyboats; their card waits for the level's banner, then
  // shows for MEET.card s (#game-live reads it, the bugle plays), the met bit is saved at once (at the spawn), the pack
  // holds its coconuts until MEET.grace s after the card shows, its tag wears NEW until MEET.newTag s after. A second
  // pack shows no card. Then wave 2: the Sting Sloop's card waits behind the "Reinforcements!" banner, and she never
  // fires before MEET.grace s after it shows (loaded and broadside on to you all along), her tag NEW for MEET.newTag s.
  await section('meet', async () => {
    const { ctx, page: mp } = await open({ label: 'meet', store: { ...STORE, 'pirates-ahoy-voyage4': V4REC({ met: 0 }) } });
    const r = await ev(mp, async () => {
      const G = window.__game;
      const M = T.N.MEET;
      const r2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
      const metSaved = () => (JSON.parse(localStorage.getItem('pirates-ahoy-voyage4') || '{}') || {}).met;
      T.spySounds();
      G.state.tutorialDone = true;
      G.newGame(10);
      const out = { met0: metSaved(), mem0: G.v4.met };
      G.state.intro = 0;
      const p = G.player;
      const hold = () => {
        p.speed = 0;
        G.state.sail = 0;
        p.hp = p.maxHp;
      };
      const packId = G.v4.foes.foes.find((f) => f.kind === 'jolly').id;
      const coconuts = () => G.v4.foes.counts.coconuts;
      // the card: when it shows (and while the level's banner was up, it waited)
      const t0 = G.state.time;
      let shown = null;
      let firstCoconut = null;
      T.until(() => G.v4.card, 8, () => {
        hold();
        if (firstCoconut === null && coconuts() > 0) firstCoconut = G.state.time;
      });
      const card = G.v4.card;
      shown = G.state.time;
      out.card = card && { kind: card.kind, name: card.name, line: card.line, after: r2(shown - t0), shownEl: T.shown('meet-card'), bugle: T.sounds.filter((s) => s.name === 'newFoe').length, live: T.lives().some((l) => l === T.N.MEETW.jolly) };
      await T.redraw();
      out.tagAt1 = G.tagInfo(packId);
      // the NEW tag until MEET.newTag s after the card showed; the grace: no coconut until MEET.grace s after it
      const watchCoco = () => {
        hold();
        if (firstCoconut === null && coconuts() > 0) firstCoconut = G.state.time;
      };
      T.until(() => G.state.time >= shown + M.newTag - 0.4, 20, watchCoco);
      await T.redraw();
      out.tagBefore = G.tagInfo(packId);
      T.until(() => G.state.time >= shown + M.newTag + 0.4, 2, watchCoco);
      await T.redraw();
      out.tagAfter = G.tagInfo(packId);
      T.until(() => firstCoconut !== null, 12, watchCoco);
      out.grace = { first: firstCoconut === null ? null : r2(firstCoconut - shown) };
      out.cardAt = G.v4.card;
      // a second pack: no card, no bugle
      T.spySounds();
      G.v4.spawn('jolly', p.x + 30, p.z);
      T.steps(6, hold);
      out.second = { card: G.v4.card, bugle: T.sounds.filter((s) => s.name === 'newFoe').length };

      // wave 2: everything of wave 1 gone (the pack and the ship), the Sting Sloop sails in behind the banner
      const v = () => {
        for (const w of G.v4.wrappers) G.v4.damage(w.id, 1e6);
        for (const e of G.enemies) if (G.fighting(e) && e.typeName !== 'stinger') G.damage(e, 9999);
      };
      let waveAt = null;
      T.until(() => G.state.wave >= 1, 15, () => {
        hold();
        v();
      });
      waveAt = G.state.time;
      out.wave = { index: G.state.wave, banner: T.shown('banner') ? T.text('banner') : '', met: metSaved(), types: G.enemies.filter(G.fighting).map((e) => e.typeName) };
      const sting = G.enemies.find((e) => e.typeName === 'stinger' && G.fighting(e));
      // (she is kept loaded, 16 u off your starboard beam and broadside on: she would fire at once if she could)
      let firstShot = null;
      const rx = -Math.cos(p.h);
      const rz = Math.sin(p.h);
      const keep = () => {
        hold();
        if (!sting) return;
        sting.x = p.x + rx * 16;
        sting.z = p.z + rz * 16;
        sting.h = p.h;
        sting.speed = 0;
        sting.rise = 0;
        // (loaded until her first shot; after it she reloads as she would: kept loaded she would fire every step)
        if (firstShot === null) sting.reload.port = sting.reload.star = 0;
        for (const w of G.v4.wrappers) G.v4.damage(w.id, 1e6); // (wave 2's pack too: only she is in it)
      };
      const before = new Set(G.balls);
      let cardAt = null;
      T.until(() => cardAt !== null && firstShot !== null, 20, () => {
        keep();
        if (cardAt === null && G.v4.card && G.v4.card.kind === 'stinger') cardAt = G.state.time;
        if (firstShot === null && G.balls.some((b) => !before.has(b) && b.owner === 'enemy' && b.src === 'stinger')) firstShot = G.state.time;
      });
      out.sting = {
        found: !!sting,
        cardWait: cardAt === null ? null : r2(cardAt - waveAt),
        firstShot: firstShot === null ? null : r2(firstShot - (cardAt ?? 0)),
        live: T.lives().some((l) => l === T.N.MEETW.stinger),
        met: metSaved(),
      };
      if (cardAt !== null) {
        T.until(() => G.state.time >= cardAt + M.newTag - 0.4, 20, keep);
        await T.redraw();
        out.sting.newBefore = G.tagInfo(sting).isNew;
        T.until(() => G.state.time >= cardAt + M.newTag + 0.4, 2, keep);
        await T.redraw();
        out.sting.newAfter = G.tagInfo(sting).isNew;
      }
      // a Rock Fort met right beside you (its card at once, G.v4.meet): it sights you no sooner than MEET.grace s after
      // its card (a fort met before sights you FORT.first s after it sees you)
      if (sting) G.damage(sting, 9999);
      T.steps(0.5, hold);
      G.v4.meet('fort');
      const fCard = G.state.time;
      const fid = G.v4.spawn('fort', p.x - Math.cos(p.h) * 25, p.z + Math.sin(p.h) * 25);
      let track = null;
      const seen = {};
      T.until(() => track !== null, 12, () => {
        hold();
        const f = T.foe(fid);
        if (f && !(f.state in seen)) seen[f.state] = r2(G.state.time - fCard);
        if (track === null && f && f.state === 'track') track = G.state.time;
      });
      out.fort = { id: fid, card: G.v4.card && G.v4.card.kind, track: track === null ? null : r2(track - fCard), met: metSaved(), seen, mode: G.state.mode, sinking: G.state.deathTimer > 0 };
      return out;
    });
    const M = N.MEET;
    const jl = N.MEETW.jolly.replace(/^[^!]{1,40}!\s+/, '');
    check(r.met0 === 1 && r.mem0 === 1, `meet: Monkey Jollyboats met for the first time: the met bit saved at once, at the spawn (${J({ saved: r.met0, memory: r.mem0 })})`);
    check(!!r.card && r.card.kind === 'jolly' && r.card.name === N.FOE_NAMES.jolly && r.card.line === jl && r.card.shownEl && r.card.bugle === 1 && r.card.live && r.card.after > 3,
      `meet: their card shows once the level's banner is done (${r.card && r.card.after} s): "${r.card && r.card.name}", "${r.card && r.card.line}", the bugle, #game-live reads its line (${J(r.card)})`);
    check(r.grace.first !== null && r.grace.first >= Math.max(4, M.grace) - 1e-6 && r.grace.first <= M.grace + 12,
      `meet: the pack lobs no coconut until ${M.grace} s after its card showed (the first ${r.grace.first} s after)`);
    check(!!r.tagAt1 && r.tagAt1.isNew && !!r.tagBefore && r.tagBefore.isNew && !!r.tagAfter && r.tagAfter.visible && !r.tagAfter.isNew && r.cardAt === null,
      `meet: the pack's tag wears NEW from its card until ${M.newTag} s after it (${J({ first: r.tagAt1 && r.tagAt1.isNew, before: r.tagBefore && r.tagBefore.isNew, after: r.tagAfter && r.tagAfter.isNew })}), the card long gone`);
    check(r.second.card === null && r.second.bugle === 0, `meet: a second pack shows no card and plays no bugle (${J(r.second)})`);
    check(r.wave.index === 1 && /Reinforcements!/.test(r.wave.banner) && (r.wave.met & 3) === 3 && r.sting.found && r.sting.live && r.sting.cardWait !== null && r.sting.cardWait >= 2.9 && r.sting.cardWait <= 5.2,
      `meet: wave 2's Sting Sloop (met bit saved at once: ${r.wave.met}) waits behind the "Reinforcements!" banner: her card shows ${r.sting.cardWait} s after the wave (${J({ wave: r.wave, sting: r.sting })})`);
    check(r.sting.firstShot !== null && r.sting.firstShot >= Math.max(4, M.grace) - 1e-6 && r.sting.firstShot <= M.grace + 6,
      `meet: kept loaded and broadside on, she fires her first shot ${r.sting.firstShot} s after her card showed (never before ${M.grace} s)`);
    check(r.sting.newBefore === true && r.sting.newAfter === false, `meet: her tag wears NEW for ${M.newTag} s after her card (${J({ before: r.sting.newBefore, after: r.sting.newAfter })})`);
    check(r.fort.track !== null && r.fort.track >= Math.max(4, M.grace) - 1e-6 && r.fort.track <= M.grace + N.FORT.first + 1 && (r.fort.met & 64) === 64 && r.fort.mode === 'playing' && !r.fort.sinking,
      `meet: a Rock Fort met right beside you sights you ${r.fort.track} s after its card (never before ${M.grace} s; met bit saved: ${r.fort.met}) (${J(r.fort)})`);
    await close(ctx);
  });

  // The kinds, through G.v4.spawn / G.spawn on level 1 (any level: their rules follow their kind, not the sea): a page
  // shared by the kind sections.
  const { ctx: kindCtx, page: kp } = await open({ label: 'kinds' });

  // ---------------------------------------------------------------------------------------- Monkey Jollyboats
  await section('jolly', async () => {
    const r = await ev(kp, async () => {
      const G = window.__game;
      const J4 = T.N.JOLLY;
      const r2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
      const p = T.level(1);
      const id = T.spawn4('jolly', 0, 24);
      let pin = T.pinner(p);
      const hold = () => {
        pin();
        p.hp = p.maxHp;
      };
      T.spySounds();
      T.watchPops();
      const pack = () => T.foe(id);
      const out = { boats: pack() ? pack().boats.length : 0 };
      // the first coconut: its warning (≥ 1.5 s), its sound told how long, COCONUT!, its brown ring
      T.until(() => pack().coconuts.length > 0, 20, hold);
      const c = pack().coconuts[0];
      out.first = c && { T: r2(c.T), sound: T.sounds.filter((s) => s.name === 'coconut').map((s) => r2(s.duration)), word: T.pops().includes(T.N.POP.coconut) };
      await T.play(0.03, hold);
      const V = G.v4.visuals();
      out.ring = V && (V.rings || []).filter((q) => q.kind === 'coconut').map((q) => r2(q.r));
      out.drawn = G.v4.view() && G.v4.view().rings;
      // damage only inside its ring: stay put for some, sail clear for others (moved 14 u when it is thrown)
      const landed = [];
      let moved = 0;
      let watch = null;
      for (let i = 0; i < 120 * 40 && landed.length < 6; i++) {
        const live = pack().coconuts;
        if (!watch && live.length) {
          const k = live[0];
          const away = landed.filter((l) => l.away).length < 2 && landed.length % 2 === 1;
          if (away) {
            const rx = -Math.cos(p.h);
            const rz = Math.sin(p.h);
            const d = T.hullDist(p, k.x, k.z) < 8 ? 14 : 0;
            p.x += rx * d;
            p.z += rz * d;
            pin = T.pinner(p);
            moved++;
          }
          watch = { id: k.id, x: k.x, z: k.z, away, hp: p.hp };
          p.hp = p.maxHp;
          watch.hp = p.hp;
        }
        pin();
        G.step(1 / 120);
        if (watch && !pack().coconuts.some((k) => k.id === watch.id)) {
          landed.push({ away: watch.away, d: r2(T.hullDist(p, watch.x, watch.z)), dmg: r2(watch.hp - p.hp) });
          watch = null;
          p.hp = p.maxHp;
        }
      }
      out.landed = landed;
      // grape tips a boat whatever its hp; round shot takes 1 of its 10
      G.combat.setAmmo('round');
      const ws = G.v4.wrappers.filter((w) => w.kind === 'jolly');
      G.v4.damage(ws[0].id, 1);
      G.combat.setAmmo('grape');
      T.watchPops();
      G.v4.damage(ws[1].id, 1);
      const boats = pack().boats;
      const b0 = boats.find((b) => `foes4-${b.id}` === ws[0].id);
      const b1 = boats.find((b) => `foes4-${b.id}` === ws[1].id);
      out.round = b0 && { hp: b0.hp, state: b0.state };
      out.grape = b1 && { hp: b1.hp, state: b1.state, splosh: T.pops().includes(T.N.POP.splosh) };
      G.combat.setAmmo('round');
      return out;
    });
    const J4 = N.JOLLY;
    check(r.boats === J4.boats && !!r.first && r.first.T >= Math.max(1.5, J4.coconut.warn) - 1e-6 && r.first.sound.length >= 1 && r.first.sound.every((d) => d >= J4.coconut.warn - 1e-6) && r.first.word && J(r.ring) !== '[]' && (r.ring || []).every((x) => x === J4.coconut.r) && r.drawn > 0,
      `jolly: a pack of ${r.boats} boats; a coconut warns ${r.first && r.first.T} s (≥ ${J4.coconut.warn}) with its sound told as long (${J(r.first && r.first.sound)}), COCONUT! and a brown ring r ${J(r.ring)} drawn (${r.drawn})`);
    const stay = r.landed.filter((l) => !l.away);
    const away = r.landed.filter((l) => l.away);
    const ok = r.landed.every((l) => (l.d <= J4.coconut.r ? l.dmg === J4.coconut.damage : l.dmg === 0));
    check(r.landed.length >= 4 && ok && stay.some((l) => l.dmg === J4.coconut.damage) && away.length >= 1 && away.every((l) => l.dmg === 0),
      `jolly: a coconut hurts (${J4.coconut.damage}) only a hull inside its ring: sat in it, hit; sailed clear, nothing (${J(r.landed)})`);
    check(!!r.grape && r.grape.state === 'tip' && r.grape.splosh && !!r.round && r.round.state === 'row' && r.round.hp === J4.hp - 1,
      `jolly: grape tips a boat over whatever its hp (SPLOSH!); round shot takes 1 of its ${J4.hp} (${J({ grape: r.grape, round: r.round })})`);
  });

  // ------------------------------------------------------------------------------------------- the Sting Sloop
  await section('stinger', async () => {
    const r = await ev(kp, async () => {
      const G = window.__game;
      const S = T.N.STINGER;
      const r2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
      const out = {};
      // the stern hold: she keeps 22-30 u off your stern quarter (you lie still, your guns loading)
      let p = T.level(1);
      p.hp = p.maxHp;
      const e = T.spawn('stinger', 30, 30, Math.PI);
      const samples = [];
      const pinP = T.pinner(p);
      T.steps(30, (i) => {
        pinP();
        p.hp = p.maxHp;
        p.reload.port = p.reload.star = 9; // (your guns stay loading: no broadside arc makes her dance)
        if (i > 120 * 15 && i % 30 === 0) {
          const q = G.relative(p, e.x, e.z);
          samples.push({ d: r2(q.dist), off: Math.round((Math.atan2(Math.abs(q.lat), q.along) * 180) / Math.PI) });
        }
      });
      const inBand = samples.filter((q) => q.d >= S.hold[0] - 3 && q.d <= S.hold[1] + 3 && q.off >= S.quarter - 5);
      out.hold = { n: samples.length, inBand: inBand.length, some: samples };
      // the dance: inside your loaded starboard arc for STINGER.arm s she dances (turn ×1.6, +2 to her cap) for 1.2 s
      const dance = (chained) => {
        p = T.level(1);
        const s = T.spawn('stinger', 20, 0, 0);
        if (chained) s.effects.slow = 30;
        const base = G.combat.effects(s);
        const pin = T.pinner(p, s);
        let at = null;
        let mods = null;
        T.steps(2.5, () => {
          pin();
          p.reload.port = p.reload.star = 0;
          const st = (G.v4.mechanics4.stingers || []).find((x) => x.id === s.id) || {};
          if (at === null && st.dance > 0) {
            at = G.state.time;
            mods = G.combat.effects(s);
          }
        });
        return { at: at === null ? null : r2(at - (G.state.time - 2.5)), base: base && { turnMul: r2(base.turnMul), cap: r2(base.speedCap) }, mods: mods && { turnMul: r2(mods.turnMul), cap: r2(mods.speedCap) } };
      };
      out.dance = dance(false);
      out.chained = dance(true);
      // BEHIND YOU!: she sits 25 u astern of you, off the view (the gold arrow), then ahead of you (none)
      p = T.level(1);
      const b = T.spawn('stinger', 0, -25, 0);
      const pinB = T.pinner(p, b);
      await T.play(0.4, pinB);
      out.behind = { shown: T.shown('edge-arrow-behind'), text: T.text('edge-arrow-behind'), live: T.lives().some((l) => /Sting Sloop is behind you/.test(l)) };
      const ahead = { x: p.x + Math.sin(p.h) * 30, z: p.z + Math.cos(p.h) * 30 };
      G.place(b, ahead.x, ahead.z, p.h);
      const pinA = T.pinner(p, b);
      await T.play(0.6, pinA);
      out.ahead = { shown: T.shown('edge-arrow-behind') };
      return out;
    });
    const S = N.STINGER;
    check(r.hold.n >= 40 && r.hold.inBand >= r.hold.n * 0.6,
      `stinger: she holds ${S.hold[0]}-${S.hold[1]} u off your stern quarter (> ${S.quarter}° off your bow): ${r.hold.inBand} of ${r.hold.n} samples in the band (${J(r.hold.some)})`);
    const d = r.dance;
    check(d.at !== null && d.at >= S.arm - 0.02 && d.at <= S.arm + 0.3 && !!d.mods && near(d.mods.turnMul, d.base.turnMul * S.dance.turnMul, 0.02) && near(d.mods.cap, d.base.cap + S.dance.capAdd, 0.05),
      `stinger: ${d.at} s inside your loaded arc and she dances: turns ×${S.dance.turnMul} (${d.base && d.base.turnMul} → ${d.mods && d.mods.turnMul}), cap +${S.dance.capAdd} (${d.base && d.base.cap} → ${d.mods && d.mods.cap})`);
    check(r.chained.at === null, `stinger: a chained sloop can't dance (${J(r.chained)})`);
    check(r.behind.shown && /BEHIND YOU!/.test(r.behind.text) && !r.ahead.shown,
      `stinger: astern of you and off the view a gold BEHIND YOU! arrow points at her ("${r.behind.text}"); ahead of you, none (${J({ behind: r.behind, ahead: r.ahead })})`);
  });

  // ------------------------------------------------------------------------------------------------- nets
  // A Net Sloop off your beam whirls her net (its fan painted ≥ 1.6 s, the whirr, NET!); sat in the fan you are
  // TANGLED (speed cap ×0.5, turns ×0.6) under the strip's words and its 4 s bar, and it lets go by itself within 4 s.
  // A net (G.v4.net) is cut by G held 0.8 s or 3 presses; after any release no net comes for 8 s, even from a sloop
  // that is ready and beside you.
  await section('nets', async () => {
    const r = await ev(kp, async () => {
      const G = window.__game;
      const NT = T.N.NET;
      const r2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
      const out = {};
      let p = T.level(1);
      const caps0 = { cap: r2(G.combat.effects(p).speedCap), turn: r2(G.turn.full) };
      const e = T.spawn('netsloop', 15, 0, 0);
      const pin = T.pinner(p);
      T.spySounds();
      T.watchPops();
      const ns = () => (G.v4.mechanics4.netsloops || []).find((x) => x.id === e.id) || {};
      const holdAll = () => {
        pin();
        p.hp = p.maxHp;
        e.x = p.x - Math.cos(p.h) * 15;
        e.z = p.z + Math.sin(p.h) * 15;
        e.h = p.h;
        e.speed = 0;
        e.reload.port = e.reload.star = 99;
      };
      T.until(() => ns().whirl, 15, holdAll);
      const w = ns().whirl;
      const fan = (G.mechanics3.visuals().nets || []).find((q) => q.id === e.id);
      out.whirl = w && { T: r2(w.T), sound: T.sounds.filter((s) => s.name === 'netWhirl').length, word: T.pops().includes(T.N.POP.net), fan: fan && { len: fan.len, half: r2(fan.half) } };
      const t0 = G.state.time;
      T.until(() => G.v4.netted, 4, holdAll);
      out.landedAfter = r2(G.state.time - t0);
      out.netted = G.v4.netted;
      out.mods = { cap: r2(G.combat.effects(p).speedCap), turn: r2(G.turn.full) };
      out.caps0 = caps0;
      await T.play(0.05, holdAll);
      const fill = () => {
        const el = document.querySelector('#grab-strip .gs-fill');
        const bar = el && el.parentElement.getBoundingClientRect();
        return el && bar && bar.width ? r2(el.getBoundingClientRect().width / bar.width) : null;
      };
      for (const a of document.querySelectorAll('#grab-strip *')) for (const an of a.getAnimations ? a.getAnimations() : []) an.finish();
      out.strip = { shown: T.shown('grab-strip'), text: T.text('grab-strip'), fill: fill(), pill: document.getElementById('touch-board').textContent.trim() };
      // left alone: it lets go by itself within NET.max s of landing
      const at = G.state.time - (G.v4.netted ? G.v4.netted.t : 0);
      T.until(() => !G.v4.netted, NT.max + 1, holdAll);
      out.free = { after: r2(G.state.time - at), netted: G.v4.netted, released: G.v4.mechanics4.counts.released };
      // ...and no new net for NET.gap s after a release, though she is ready and beside you
      const relAt = G.state.time;
      let next = null;
      T.until(() => next !== null, NT.gap + NT.cooldown + 4, () => {
        holdAll();
        if (next === null && ns().whirl) next = G.state.time;
      });
      out.nextAfter = next === null ? null : r2(next - relAt);
      // a ready sloop held off (beyond the net's reach) while a net lands and is cut at once: she whirls no sooner than
      // NET.gap s after that release, brought up beside you
      p = T.level(1);
      const s2 = T.spawn('netsloop', 40, 0, 0);
      const pin2 = T.pinner(p, s2);
      T.steps(NT.first + 1, pin2);
      G.v4.net();
      for (let i = 0; i < 3; i++) G.v4.cut();
      const rel2 = G.state.time;
      out.cut3 = { netted: G.v4.netted };
      let next2 = null;
      const pinP2 = T.pinner(p);
      T.until(() => next2 !== null, NT.gap + 4, () => {
        pinP2();
        G.place(s2, p.x - Math.cos(p.h) * 15, p.z + Math.sin(p.h) * 15, p.h);
        s2.speed = 0;
        if (next2 === null && ((G.v4.mechanics4.netsloops || []).find((x) => x.id === s2.id) || {}).whirl) next2 = G.state.time;
      });
      out.gap2 = next2 === null ? null : r2(next2 - rel2);
      return out;
    });
    const NT = N.NET;
    check(!!r.whirl && r.whirl.T >= Math.max(1.6, NT.warn) - 1e-6 && r.whirl.sound === 1 && r.whirl.word && !!r.whirl.fan && r.whirl.fan.len === NT.reach && near(r.whirl.fan.half, (NT.width / 2) * Math.PI / 180, 0.01),
      `nets: a Net Sloop off your beam whirls her net: a fan ${r.whirl && r.whirl.fan && r.whirl.fan.len} u long, ${NT.width}° wide, painted ${r.whirl && r.whirl.T} s (≥ ${NT.warn}), the whirr and NET! (${J(r.whirl)})`);
    check(!!r.netted && r.netted.max === NT.max && near(r.mods.cap, r.caps0.cap * NT.speedMul, 0.02) && near(r.mods.turn, r.caps0.turn * NT.turnMul, 0.02),
      `nets: sat in the fan you are TANGLED: speed cap ${r.caps0.cap} → ${r.mods.cap} (×${NT.speedMul}), turns ${r.caps0.turn} → ${r.mods.turn} (×${NT.turnMul}) (${J(r.netted)})`);
    check(r.strip.shown && /NETTED! Hold G to cut it/.test(r.strip.text) && /TANGLED: half speed, slow turns/.test(r.strip.text) && r.strip.fill !== null && r.strip.fill < 1 && r.strip.fill > 0.5 && /CUT!/.test(r.strip.pill),
      `nets: the strip reads "${r.strip.text}" with its release bar (${r.strip.fill}), the Board pill CUT! (${J(r.strip)})`);
    check(r.free.netted === null && r.free.after <= 4 + 1e-6 && r.free.after >= NT.max - 0.05 && r.free.released.time >= 1,
      `nets: left alone it lets go by itself ${r.free.after} s after it landed (NET.max ${NT.max}; never more than 4 s) (${J(r.free.released)})`);
    check(r.nextAfter !== null && r.nextAfter >= NT.gap - 1e-6 && r.cut3.netted === null && r.gap2 !== null && r.gap2 >= NT.gap - 1e-6 && r.gap2 <= NT.gap + 1,
      `nets: no net for ${NT.gap} s after a release: her next whirl ${r.nextAfter} s after hers let go; a ready sloop brought up beside you right after a net was cut (3 presses: ${J(r.cut3)}) whirls ${r.gap2} s after`);

    // G and CUT!: a net cut by G held 0.8 s (the hold time), by 3 presses of G, and by CUT! held on a phone
    const g = await ev(kp, () => {
      const G = window.__game;
      const r2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
      const p = T.level(1);
      const pin = T.pinner(p);
      const out = {};
      T.watchPops();
      G.v4.net();
      G.step(1 / 120); // (G.v4.netted mirrors the net at each step)
      const t0 = G.state.time;
      T.key('g', 'KeyG');
      T.until(() => !G.v4.netted, 3, pin);
      out.held = { after: r2(G.state.time - t0), word: T.pops().includes(T.N.POP.cutFree) };
      T.key('g', 'KeyG', { type: 'keyup' });
      T.steps(0.2, pin);
      out.second = G.v4.net();
      G.step(1 / 120);
      const press = () => {
        T.key('g', 'KeyG');
        T.key('g', 'KeyG', { type: 'keyup' });
        T.steps(0.1, pin);
        return !!G.v4.netted;
      };
      out.presses = [press(), press(), press()];
      return out;
    });
    check(near(g.held.after, 0.8, 0.03) && g.held.word && g.second === true && J(g.presses) === '[true,true,false]',
      `nets: G held cuts the net in ${g.held.after} s (0.8, CUT FREE!); 3 presses of G cut it, the third frees you (${J(g)})`);
    const { ctx, page: tp } = await open({ width: 390, height: 844, touch: true, label: 'nets-phone' });
    const t = await ev(tp, async () => {
      const G = window.__game;
      const r2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
      const p = T.level(1);
      const pin = T.pinner(p);
      G.v4.net();
      await T.play(0.05, pin);
      const btn = document.getElementById('touch-board');
      const out = { word: btn.textContent.trim(), shown: T.shown('touch-board'), strip: T.text('grab-strip') };
      const ptr = (type) => btn.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 51, pointerType: 'touch', isPrimary: true }));
      ptr('pointerdown');
      const t0 = G.state.time;
      T.until(() => !G.v4.netted, 3, pin);
      out.after = r2(G.state.time - t0);
      ptr('pointerup');
      return out;
    });
    check(t.shown && /CUT!/.test(t.word) && /NETTED! Hold CUT! to cut it/.test(t.strip) && near(t.after, 0.8, 0.05),
      `nets: on a phone the strip reads "${t.strip}", the Board pill ${t.word}, and CUT! held cuts it in ${t.after} s (${J(t)})`);
    await close(ctx);
  });

  // -------------------------------------------------------------------------------------------- Puffer Mines
  await section('puffers', async () => {
    const r = await ev(kp, async () => {
      const G = window.__game;
      const PF = T.N.PUFFER;
      const r2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
      const out = {};
      let p = T.level(1);
      let pin = T.pinner(p);
      T.spySounds();
      T.watchPops();
      // a patch 12 u ahead drifts at you; within 6 u one puffs (its spiky ring ≥ 1.5 s, PUFF!), then pops: 8 to your hull
      const id = T.spawn4('puffer', 0, 12, { n: 1 });
      const pf = () => (G.v4.foes.puffers || []).filter((u) => u.patch === id || u.owner === null);
      let puff = null;
      let hp0 = null;
      T.until(() => pf().some((u) => u.state === 'puff'), 20, () => {
        pin();
        p.hp = p.maxHp;
      });
      const u = pf().find((q) => q.state === 'puff');
      puff = u && { T: r2(u.T), d: r2(T.hullDist(p, u.x, u.z)), sound: T.sounds.filter((s) => s.name === 'puff').map((s) => r2(s.duration)), word: T.pops().includes(T.N.POP.puff) };
      hp0 = p.hp;
      T.until(() => !pf().some((q) => q.state === 'puff'), 4, pin);
      out.puff = puff;
      out.pop = { dmg: r2(hp0 - p.hp), home: pf().some((q) => q.state === 'home') };
      // any ball sends one home safely: PFFT!
      p = T.level(1);
      pin = T.pinner(p);
      const id2 = T.spawn4('puffer', 0, 24, { n: 1 });
      T.steps(0.8, pin);
      const w = G.v4.wrappers.find((x) => x.kind === 'puffer');
      T.watchPops();
      G.v4.damage(w.id, 1);
      T.steps(0.1, pin);
      out.pfft = { word: T.pops().includes(T.N.POP.pfft), state: ((G.v4.foes.puffers || []).find((q) => `foes4-${q.id}` === w.id) || {}).state, pffts: G.v4.foes.counts.pffts };
      // the guns: with round shot a broadside goes to the pirate in that arc, not the puffer beside her; with no
      // ship in the arc, to the puffer
      const aim = (withShip) => {
        p = T.level(1);
        G.combat.setAmmo('round');
        const e = withShip ? T.spawn('corsair', 18, 5, 0) : null;
        T.spawn4('puffer', 27, -6, { n: 1 });
        T.steps(1, () => {
          pin = T.pinner(p, ...(e ? [e] : []));
        });
        const pz = G.v4.wrappers.find((x) => x.kind === 'puffer');
        const hold = T.pinner(p, ...(e ? [e] : []));
        hold();
        G.combat.clearLog();
        p.reload.port = p.reload.star = 0;
        const pffts = G.v4.foes.counts.pffts;
        const hp = e ? e.hp : 0;
        G.playerFire(1);
        T.steps(1.5, hold);
        return { ship: e ? r2(hp - e.hp) : null, pfft: G.v4.foes.counts.pffts - pffts, puffer: !!pz };
      };
      out.aimShip = aim(true);
      out.aimAlone = aim(false);
      return out;
    });
    const PF = N.PUFFER;
    check(!!r.puff && r.puff.T >= Math.max(1.5, PF.pop.warn) - 1e-6 && r.puff.d <= PF.near + 0.5 && r.puff.sound.length >= 1 && r.puff.sound.every((d) => d >= PF.pop.warn - 1e-6) && r.puff.word && r.pop.dmg === PF.pop.damage && r.pop.home,
      `puffers: a puffer drifts at you and within ${PF.near} u puffs (${J(r.puff)}: ≥ ${PF.pop.warn} s, its sound told as long, PUFF!), then pops: ${r.pop.dmg} to your hull (${PF.pop.damage}) and swims home`);
    check(r.pfft.word && r.pfft.state === 'home' && r.pfft.pffts === 1, `puffers: any ball sends one home safely: PFFT! (${J(r.pfft)})`);
    check(r.aimShip.puffer && r.aimShip.ship > 0 && r.aimShip.pfft === 0 && r.aimAlone.puffer && r.aimAlone.pfft === 1,
      `puffers: with round shot your broadside goes to the pirate in that arc (${r.aimShip.ship} hp), not the puffer beside her (${r.aimShip.pfft} sent home); with no ship there, to the puffer (${r.aimAlone.pfft}) (${J(r)})`);
  });

  // ----------------------------------------------------------------------------------------- the Coral Witch
  await section('witch', async () => {
    const r = await ev(kp, async () => {
      const G = window.__game;
      const W = T.N.WITCH;
      const r2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
      const out = { acts: [], most: 0 };
      const p = T.level(1);
      // a wave's patch of 4 already up (far off), a pirate with half her hull near the Witch
      T.spawn4('puffer', -60, 60, { n: 4 });
      const wch = T.spawn('witch', 34, 0, 0);
      const mate = T.spawn('corsair', 34, 10, 0);
      mate.hp = Math.round(mate.maxHp / 2);
      const pin = T.pinner(p);
      const keep = () => {
        pin();
        p.hp = p.maxHp;
        G.place(mate, wch.x + Math.sin(wch.h) * 8, wch.z + Math.cos(wch.h) * 8);
        mate.speed = 0;
        mate.reload.port = mate.reload.star = 99;
      };
      T.spySounds();
      T.watchPops();
      const witchRow = () => (G.v4.mechanics4.witches || []).find((x) => x.id === wch.id) || {};
      let last = null;
      let mend = null;
      T.steps(26, () => {
        keep();
        out.most = Math.max(out.most, G.v4.foes.puffersAlive);
        const a = witchRow().act;
        const key = a ? `${a.kind}:${a.phase || ''}` : null;
        if (key && key !== last) out.acts.push({ kind: a.kind, phase: a.phase, T: r2(a.T), at: r2(G.state.time) });
        if (a && a.kind === 'song' && a.phase === 'mend' && !mend) mend = { at: G.state.time, hp: mate.hp };
        if (mend && !mend.after && G.state.time >= mend.at + W.song.time + 0.2) mend.after = r2(mate.hp - mend.hp);
        last = key;
      });
      out.mend = mend && { gain: mend.after, max: mate.maxHp, hp: r2(mate.hp) };
      out.summons = G.v4.mechanics4.counts.summons;
      out.sounds = [...new Set(T.sounds.map((s) => s.name).filter((n) => n === 'conch' || n === 'song'))];
      out.words = T.pops().filter((t) => t === T.N.POP.puffers || t === T.N.POP.mending);
      // Stink just before her next act is due: no song or summons for WITCH.stinkQuiet s (then she goes on)
      T.until(() => {
        const w = witchRow();
        return !w.act && w.clock <= 1.2;
      }, 12, keep);
      G.specials.setLoads({ fire: 0, frost: 0, stink: 3 });
      G.combat.setAmmo('stink');
      G.place(wch, p.x - Math.cos(p.h) * 18, p.z + Math.sin(p.h) * 18, p.h);
      wch.speed = 0;
      const hold2 = T.pinner(p, wch);
      p.reload.port = p.reload.star = 0;
      const side = Math.sign(G.relative(p, wch.x, wch.z).lat) || 1;
      out.clockAtShot = r2(witchRow().clock);
      G.playerFire(side);
      T.until(() => wch.status && wch.status.id === 'stink', 2, hold2);
      const sAt = G.state.time;
      T.steps(1 / 60, hold2);
      out.stink = { status: wch.status && wch.status.id, quiet: r2(witchRow().quiet), act: !!witchRow().act };
      let firstAct = null;
      T.steps(W.stinkQuiet + 2.5, () => {
        hold2();
        p.hp = p.maxHp;
        if (firstAct === null && witchRow().act) firstAct = G.state.time;
      });
      out.stink.firstAct = firstAct === null ? null : r2(firstAct - sAt);
      G.combat.setAmmo('round');
      return out;
    });
    const W = N.WITCH;
    const kinds = r.acts.map((a) => a.kind);
    const sw = r.acts.find((a) => a.kind === 'summon');
    const sg = r.acts.find((a) => a.kind === 'song');
    check(kinds.includes('summon') && kinds.includes('song') && !!sw && sw.T >= Math.max(1.5, W.summon.warn) - 1e-6 && !!sg && sg.T >= Math.max(1.5, W.song.warn) - 1e-6 && r.sounds.includes('conch') && r.sounds.includes('song') && r.words.includes(N.POP.puffers) && r.words.includes(N.POP.mending),
      `witch: the Coral Witch takes turns: summons (green rings ${sw && sw.T} s ≥ ${W.summon.warn}, the conch, PUFFERS!) and song (notes ${sg && sg.T} s ≥ ${W.song.warn}, the harp, SHE'S MENDING!) (${J(r.acts.slice(0, 6))})`);
    check(r.summons >= 1 && r.most <= N.POOL_RULES.puffersAlive && r.most >= 5, `witch: with a patch of 4 up her summons raise the puffers to ${r.most} at most (≤ ${N.POOL_RULES.puffersAlive})`);
    check(!!r.mend && near(r.mend.gain, W.song.hps * W.song.time, 1.5) && r.mend.hp <= r.mend.max, `witch: her song mends a pirate within ${W.song.r} u by ${r.mend && r.mend.gain} hp (${W.song.hps} hp/s for ${W.song.time} s, never above full) (${J(r.mend)})`);
    check(r.stink.status === 'stink' && r.stink.quiet >= W.stinkQuiet - 0.2 && !r.stink.act && r.stink.firstAct !== null && r.stink.firstAct >= W.stinkQuiet - 0.05 && r.stink.firstAct <= W.stinkQuiet + 2.5,
      `witch: Stink on her just before an act was due (in ${r.clockAtShot} s): no song or summons for ${W.stinkQuiet} s, her next ${r.stink.firstAct} s after (${J(r.stink)})`);
  });

  // ------------------------------------------------------------------------------------------- Old Coilback
  await section('coilback', async () => {
    const r = await ev(kp, async () => {
      const G = window.__game;
      const C = T.N.COILBACK;
      const r2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
      const out = { lanes: [] };
      const p = T.level(1);
      let pin = T.pinner(p);
      const id = T.spawn4('coilback', 28, 0);
      const cb = () => T.foe(id);
      T.spySounds();
      T.watchPops();
      const hold = () => {
        pin();
        p.hp = p.maxHp;
      };
      // under water: no wrapper (untargetable), its tag reads UNDER WATER, the FIRE! light stays dark for it
      T.until(() => cb().state === 'under', 20, hold);
      out.under = { state: cb().state, wrappers: G.v4.wrappers.filter((w) => w.kind === 'coilback').length };
      p.reload.port = p.reload.star = 0;
      await T.play(0.1, hold);
      const lit = (id2) => document.getElementById(id2).classList.contains('target');
      out.under.tag = G.tagInfo(id);
      out.under.light = { port: lit('gun-port'), star: lit('gun-star') };
      // it rears and shows its lane (≥ 1.6 s, the hiss, LUNGE!) from its head to past your spot; sat in it, 12; the
      // second time you sail clear when it shows: nothing
      for (let k = 0; k < 2; k++) {
        T.until(() => cb().state === 'rear' && cb().lane, 25, hold);
        const L = cb().lane;
        const lane = { T: r2(L.T), w: L.w, len: r2(L.len), headD: r2(Math.hypot(L.x0 - cb().x, L.z0 - cb().z)) };
        // (the distance from your centre to the lane's line, and how far past you it runs)
        const dx = L.x1 - L.x0;
        const dz = L.z1 - L.z0;
        const len = Math.hypot(dx, dz);
        const along = ((p.x - L.x0) * dx + (p.z - L.z0) * dz) / len;
        lane.offLine = r2(Math.abs(((p.x - L.x0) * dz - (p.z - L.z0) * dx) / len));
        lane.past = r2(len - along);
        if (k === 1) {
          // sail clear: 12 u off to the side of the lane
          const nx = -dz / len;
          const nz = dx / len;
          p.x += nx * 12;
          p.z += nz * 12;
          pin = T.pinner(p);
        }
        const hp = p.hp;
        T.until(() => cb().state === 'dizzy', 6, pin);
        lane.dmg = r2(hp - p.hp);
        lane.state = cb().state;
        out.lanes.push(lane);
        // dizzy: a hit on its head counts ×2 (BONK!); on a hump ×0.5
        if (k === 0) {
          const head = G.v4.wrappers.find((w) => w.kind === 'coilback' && w.partKind === 'head');
          const hp0 = cb().hp;
          out.lunge0 = T.pops().filter((t) => t === T.N.POP.lunge).length;
          T.watchPops();
          if (head) G.v4.damage(head.id, 10);
          out.dizzy = { hit: r2(hp0 - cb().hp), bonk: T.pops().includes(T.N.POP.bonk) };
        }
        p.hp = p.maxHp;
      }
      out.hiss = T.sounds.filter((s) => s.name === 'hiss').map((s) => r2(s.duration));
      out.lunge = (out.lunge0 || 0) + T.pops().filter((t) => t === T.N.POP.lunge).length;
      T.until(() => cb().state === 'swim' && G.v4.wrappers.some((w) => w.kind === 'coilback' && w.partKind === 'hump'), 12, hold);
      const hump = G.v4.wrappers.find((w) => w.kind === 'coilback' && w.partKind === 'hump');
      const hp1 = cb().hp;
      if (hump) G.v4.damage(hump.id, 10);
      out.hump = { hit: r2(hp1 - cb().hp), state: cb().state };
      return out;
    });
    const C = N.COILBACK;
    check(r.under.state === 'under' && r.under.wrappers === 0 && !!r.under.tag && r.under.tag.under && !r.under.light.port && !r.under.light.star,
      `coilback: under water Old Coilback can't be aimed at (no part), its tag reads UNDER WATER and the FIRE! light stays dark (${J(r.under)})`);
    const [a, b] = r.lanes;
    check(!!a && a.T >= Math.max(1.6, C.lane.warn) - 1e-6 && a.w === C.lane.w && a.offLine <= a.w / 2 && a.past >= C.lane.past - 0.6 && a.len <= C.lane.max + 1e-6 && r.hiss.length >= 2 && r.hiss.every((d) => d >= C.lane.warn - 1e-6) && r.lunge >= 2,
      `coilback: it rears and shows its lane ${a && a.T} s (≥ ${C.lane.warn}; the hiss told as long ${J(r.hiss)}, LUNGE! ×${r.lunge}), ${C.lane.w} u wide from its head through your spot to ${a && a.past} u past it (${J(a)})`);
    check(!!a && a.dmg === C.lane.damage && !!b && b.dmg === 0, `coilback: its lunge hurts only inside the lane: sat in it ${a && a.dmg} (${C.lane.damage}), sailed clear ${b && b.dmg} (${J({ a, b })})`);
    check(!!r.dizzy && r.dizzy.hit === 10 * C.head.dizzy && r.dizzy.bonk && r.hump.hit === 10 * C.hump.mul,
      `coilback: dizzy, a 10 on its head counts ${r.dizzy && r.dizzy.hit} (×${C.head.dizzy}, BONK!); a 10 on a hump ${r.hump.hit} (×${C.hump.mul}) (${J({ dizzy: r.dizzy, hump: r.hump })})`);
  });

  // ------------------------------------------------------------------------------------------- the Rock Fort
  await section('fort', async () => {
    const r = await ev(kp, async () => {
      const G = window.__game;
      const F = T.N.FORT;
      const r2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
      const out = { shots: [] };
      const p = T.level(1);
      let pin = T.pinner(p);
      const a = T.at(30, 0);
      const id = G.v4.spawn('fort', a.x, a.z);
      const f = () => T.foe(id);
      T.spySounds();
      T.watchPops();
      const hold = () => {
        pin();
        p.hp = p.maxHp;
      };
      for (let k = 0; k < 2; k++) {
        T.until(() => f().state === 'track', 10, hold);
        const t0 = G.state.time;
        T.until(() => f().state === 'lock', 4, hold);
        const track = r2(G.state.time - t0);
        const l0 = G.state.time;
        if (k === 1) {
          // the line has locked: sail off it (10 u along your heading)
          p.x += Math.sin(p.h) * 10;
          p.z += Math.cos(p.h) * 10;
          pin = T.pinner(p);
        }
        const hp = p.hp;
        T.until(() => f().state === 'fire', 3, pin);
        out.shots.push({ track, lock: r2(G.state.time - l0), dmg: r2(hp - p.hp) });
        p.hp = p.maxHp;
      }
      out.aim = T.pops().filter((t) => t === T.N.POP.aim).length;
      out.clack = T.sounds.filter((s) => s.name === 'clack').length;
      return out;
    });
    const F = N.FORT;
    const [a, b] = r.shots;
    check(!!a && near(a.track, F.track, 0.03) && a.lock >= F.lock - 1e-6 && a.track + a.lock >= 1.8 - 1e-6 && r.aim >= 2 && r.clack >= 2,
      `fort: a Rock Fort sights you with its red line ${a && a.track} s (${F.track}), then locks ${a && a.lock} s (≥ ${F.lock}; ${a && Math.round((a.track + a.lock) * 100) / 100} s in all ≥ 1.8) with AIM! and its click-clack (${J({ shots: r.shots, aim: r.aim, clack: r.clack })})`);
    check(!!a && a.dmg === F.damage && !!b && b.dmg === 0, `fort: it fires along the locked line only: sat on it ${a && a.dmg} (${F.damage}); sailed off it once it locked, ${b && b.dmg}`);
  });

  // ------------------------------------------------------------------------------- pseudo kinds are not ships
  // G at each pseudo foe says why it can't be boarded; none is ever grappled, captured, given crew pips, or counted
  // in feats.prizes (level 10 cleared with its packs tipped and its ships sunk).
  await section('pseudo', async () => {
    const r = await ev(kp, async () => {
      const G = window.__game;
      const out = { words: {}, picks: [], grapple: [], strike: [], crew: [], pips: [] };
      for (const kind of ['jolly', 'puffer', 'coilback', 'fort']) {
        const p = T.level(1);
        const pin = T.pinner(p);
        const id = T.spawn4(kind, 9, 2, kind === 'puffer' ? { n: 1 } : undefined);
        T.steps(0.3, pin);
        const w = G.v4.wrappers.find((x) => x.kind === kind);
        G.state.flash = { text: '', until: 0 };
        T.key('g', 'KeyG');
        T.key('g', 'KeyG', { type: 'keyup' });
        out.words[kind] = T.flash();
        out.picks.push(G.boarding.pick().target ? G.boarding.pick().target.id || 'ship' : null);
        out.grapple.push({ ok: G.grapple().ok, boarding: G.boarding.active, part: !!w });
        out.strike.push(w ? G.capture.strike(w) : null);
        out.crew.push(w ? G.combat.setCrew(w, 3) : null);
        const tag = G.tagInfo(id);
        out.pips.push(tag ? tag.pips ?? null : 'none');
      }
      // level 10 cleared with its pseudo foes and ships sunk: no capture, no prize for a pseudo kind
      G.setFeats({ ...G.feats, prizes: {} });
      G.state.tutorialDone = true;
      G.newGame(10);
      G.state.intro = 0;
      for (let k = 0; k < 40 && G.state.mode === 'playing'; k++) {
        for (const e of G.enemies) if (G.fighting(e)) G.damage(e, 9999);
        for (const w of G.v4.wrappers) G.v4.damage(w.id, 1e6);
        T.steps(1, () => {
          G.player.hp = G.player.maxHp;
          return G.state.mode === 'playing';
        });
      }
      T.until(() => G.state.mode !== 'playing', 10);
      const saved = JSON.parse(localStorage.getItem('pirates-ahoy-feats') || '{}');
      out.clear = { mode: G.state.mode, captures: G.capture.count, prizes: G.feats.prizes, saved: saved.prizes || {} };
      return out;
    });
    check(r.words.jolly === N.BOARD.small && r.words.puffer === N.BOARD.monster && r.words.coilback === N.BOARD.monster && r.words.fort === N.BOARD.fort,
      `pseudo: G at each pseudo foe says why not: ${J(r.words)}`);
    check(r.picks.every((x) => x === null) && r.grapple.every((g) => !g.ok && !g.boarding && g.part) && r.strike.every((x) => x === false) && r.crew.every((x) => x === null) && r.pips.every((x) => x === null || x === 'none'),
      `pseudo: none of them is ever picked to board, grappled, struck, crewed or given crew pips (${J({ picks: r.picks, grapple: r.grapple, strike: r.strike, crew: r.crew, pips: r.pips })})`);
    const PSEUDO = ['jolly', 'puffer', 'coilback', 'fort', 'shellback'];
    check(r.clear.mode === 'levelDone' && r.clear.captures === 0 && !Object.keys(r.clear.prizes).some((k) => PSEUDO.includes(k)) && !Object.keys(r.clear.saved).some((k) => PSEUDO.includes(k)),
      `pseudo: level 10 cleared with its packs tipped: no capture and no pseudo kind in feats.prizes (${J(r.clear)})`);
  });

  // ------------------------------------------------------------------------------------------------- kindness
  // At most WARN.max warning shapes at once on a Voyage IV level, however crowded (a 7th waits: foes4 counts it), and
  // on a phone held upright a coconut ring landing by your hull is on the screen when it lands.
  await section('kind', async () => {
    const r = await ev(kp, async () => {
      const G = window.__game;
      const r2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
      const p = T.level(10);
      const pin = T.pinner(p);
      // three packs, two puffer patches, two forts and a Net Sloop round you
      for (const [k, lat, along] of [['jolly', 14, 6], ['jolly', -14, 6], ['jolly', 0, -16], ['puffer', 8, 8], ['puffer', -8, -8], ['fort', 30, 10], ['fort', -30, -10]]) T.spawn4(k, lat, along, k === 'puffer' ? { n: 3 } : undefined);
      T.spawn('netsloop', 15, 0, 0);
      let most = 0;
      let most2 = 0;
      const shapes = () => {
        const f = G.v4.foes;
        const v = G.mechanics3.visuals() || {};
        let n = 0;
        for (const x of f.foes) {
          if (x.kind === 'jolly') n += x.coconuts.length;
          if (x.kind === 'fort' && (x.state === 'track' || x.state === 'lock')) n++;
          if (x.kind === 'coilback' && x.lane && x.lane.run === 0) n++;
        }
        n += (f.puffers || []).filter((u) => u.state === 'puff').length;
        n += (v.nets || []).length + (v.summons || []).length + (v.songs || []).filter((s) => s.state === 'warn').length;
        n += G.bombs.filter((b) => b.t < b.T).length;
        return n;
      };
      T.steps(30, () => {
        pin();
        p.hp = p.maxHp;
        most = Math.max(most, G.v4.warnSlots.count);
        most2 = Math.max(most2, shapes());
      });
      return { most, most2, max: G.v4.warnSlots.max, waited: G.v4.foes.counts.waited, m4waited: G.v4.mechanics4.counts.waited };
    });
    check(r.max === 6 && r.most <= 6 && r.most2 <= 6 && r.most2 >= 5 && r.waited + r.m4waited > 0,
      `kind: a crowded Voyage IV sea (three packs, two puffer patches, two forts, a Net Sloop) never shows more than ${N.WARN.max} warning shapes at once (slots ${r.most}, shapes ${r.most2}); a 7th waited ${r.waited + r.m4waited} times (${J(r)})`);
    const { ctx, page: pp } = await open({ width: 390, height: 844, touch: true, label: 'kind-phone' });
    const f = await ev(pp, async () => {
      const G = window.__game;
      const p = T.level(10);
      const pin = T.pinner(p);
      const pid = T.spawn4('jolly', 0, 22);
      const out = { rings: [] };
      for (let k = 0; k < 3; k++) {
        // a coconut thrown at you: real frames until it lands, where its ring sits on the screen as it does
        T.until(() => (T.foe(pid) || { coconuts: [] }).coconuts.length > 0, 20, () => {
          pin();
          p.hp = p.maxHp;
        });
        const c = T.foe(pid).coconuts[0];
        let last = null;
        await T.play(c.T + 0.3, () => {
          pin();
          p.hp = p.maxHp;
          if (T.foe(pid).coconuts.some((q) => q.id === c.id)) last = T.toScreen(c.x, 0, c.z);
        });
        out.rings.push({ near: Math.round(T.hullDist(p, c.x, c.z) * 10) / 10, at: last && { x: Math.round(last.x), y: Math.round(last.y) } });
      }
      out.w = innerWidth;
      out.h = innerHeight;
      return out;
    });
    const on = (q) => !!q.at && q.at.x >= 0 && q.at.x <= f.w && q.at.y >= 0 && q.at.y <= f.h;
    check(f.rings.length === 3 && f.rings.every(on), `kind: on a phone held upright (390x844) each coconut ring landing by your hull is on the screen as it lands (${J(f.rings)})`);
    await close(ctx);
  });

  await close(kindCtx);

  // ---------------------------------------------------------------------------------------------- the hazards
  // Fog banks (level 10): a ship in a bank more than FOG.see u from you is hidden (no auto-aim, no FIRE! light, no
  // tag; the Fire cell on her side reads FOG!), but a broadside fired anyway still hits her; within FOG.see u she shows
  // again; your own ship in a bank is never hidden from you (the HIDDEN chip), nor is a warning ring in it.
  await section('fog', async () => {
    const { ctx, page: fp } = await open({ label: 'fog' });
    const r = await ev(fp, async () => {
      const G = window.__game;
      const F = T.N.FOG;
      const r2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
      const out = {};
      const p = T.level(10);
      const bank = () => G.v4.mechanics4.fog.banks[0];
      // a pirate in the middle of bank 1 (she rides it), you 24 u off her (she sits off your starboard beam)
      const e = T.spawn('corsair', 24, 0, 0);
      const place = (dist) => {
        const b = bank();
        G.place(e, b.x, b.z, b.h);
        e.speed = 0;
        e.reload.port = e.reload.star = 99;
        G.place(p, b.x + Math.cos(b.h) * dist, b.z - Math.sin(b.h) * dist, b.h);
        p.speed = 0;
        G.state.sail = 0;
        p.hp = p.maxHp;
      };
      const idx = G.enemies.indexOf(e);
      place(24);
      T.steps(0.3, () => place(24));
      p.reload.port = p.reload.star = 0;
      await T.play(0.2, () => place(24));
      const cell = (id) => {
        const el = document.getElementById(id);
        return { target: el.classList.contains('target'), fog: el.classList.contains('fog'), tag: (el.querySelector('.fire-tag') || {}).textContent || '' };
      };
      const side = Math.sign(G.relative(p, e.x, e.z).lat) > 0 ? 'gun-star' : 'gun-port';
      out.far = { dist: r2(Math.hypot(e.x - p.x, e.z - p.z)), inFog: G.v4.fog(e.x, e.z), hidden: (G.v4.hidden || []).includes(idx), cell: cell(side), tag: G.tagInfo(e) && G.tagInfo(e).visible, live: T.lives().filter((l) => /fog/i.test(l)).slice(-2) };
      // fire anyway: the broadside still hits her (24 u, its default range)
      G.combat.clearLog();
      p.reload.port = p.reload.star = 0;
      const hp0 = e.hp;
      G.playerFire(side === 'gun-star' ? 1 : -1);
      T.steps(1.2, () => place(24));
      out.fired = { hits: G.combat.log.filter((l) => l.owner === 'player' && l.targetId === e.id).length, dhp: r2(hp0 - e.hp) };
      // within FOG.see u she shows again
      place(F.see - 4);
      T.steps(0.1, () => place(F.see - 4));
      p.reload.port = p.reload.star = 0;
      await T.play(0.2, () => place(F.see - 4));
      out.near = { dist: r2(Math.hypot(e.x - p.x, e.z - p.z)), hidden: (G.v4.hidden || []).includes(idx), cell: cell(side), tag: G.tagInfo(e) && G.tagInfo(e).visible };
      // you in a bank: the HIDDEN chip; your ship still drawn; a coconut ring by you in the bank still shows
      G.place(e, p.x + 200, p.z, 0);
      e.rise = 1e6;
      const inBank = () => {
        const b = bank();
        G.place(p, b.x, b.z, b.h);
        p.speed = 0;
        p.hp = p.maxHp;
      };
      inBank();
      const pid = G.v4.spawn('jolly', p.x + 20, p.z);
      T.until(() => (T.foe(pid) || { coconuts: [] }).coconuts.length > 0, 20, inBank);
      await T.play(0.15, inBank);
      const V = G.v4.visuals() || {};
      out.mine = { inFog: G.v4.fog(p.x, p.z), chip: T.shown('fog-chip'), chipText: T.text('fog-chip'), fogChip: G.v4.fogChip, visible: p.mesh.visible, rings: (V.rings || []).filter((q) => q.kind === 'coconut' && G.v4.fog(q.x, q.z)).length, drawn: G.v4.view() ? G.v4.view().rings : null };
      return out;
    });
    const F = N.FOG;
    check(r.far.inFog && r.far.dist > F.see && r.far.hidden && !r.far.cell.target && r.far.cell.fog && /FOG!/.test(r.far.cell.tag) && !r.far.tag,
      `fog: a pirate in a fog bank ${r.far.dist} u off (> ${F.see}) is hidden: no FIRE! light, the Fire cell reads ${r.far.cell.tag}, no tag (${J(r.far)})`);
    check(r.fired.hits >= 1 && r.fired.dhp > 0, `fog: a broadside fired at her anyway still hits (${r.fired.hits} balls, ${r.fired.dhp} hp)`);
    check(!r.near.hidden && r.near.cell.target && /FIRE!/.test(r.near.cell.tag) && r.near.tag, `fog: ${r.near.dist} u off (≤ ${F.see}) she shows again: FIRE! and her tag (${J(r.near)})`);
    check(r.mine.inFog && r.mine.fogChip && r.mine.chip && /HIDDEN/.test(r.mine.chipText) && r.mine.visible && r.mine.rings >= 1 && r.mine.drawn >= 1,
      `fog: your own ship in a bank shows the HIDDEN chip ("${r.mine.chipText}") and is still drawn; a coconut's ring in the bank still shows (${J(r.mine)})`);
    await close(ctx);
  });

  // Coral currents (level 11): a ship inside a lane drifts CURRENT.speed u/s along it (with no sail), a puffer too;
  // outside, nothing. WHEEE! the first time you ride one.
  await section('currents', async () => {
    const { ctx, page: cp } = await open({ label: 'currents' });
    const r = await ev(cp, async () => {
      const G = window.__game;
      const C = T.N.CURRENT;
      const r2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
      const out = {};
      const p = T.level(11);
      const lanes = G.v4.mechanics4.currents.lanes;
      const L = lanes[0];
      const k = Math.floor(L.points.length / 2);
      const a = L.points[k];
      const b = L.points[k + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const ux = (b.x - a.x) / len;
      const uz = (b.z - a.z) / len;
      // into the lane the first time (real frames: the camera comes along, the pop shows): WHEEE!
      T.watchPops();
      const into = () => {
        G.place(p, a.x, a.z, Math.atan2(-uz, ux));
        p.speed = 0;
        G.state.sail = 0;
        p.hp = p.maxHp;
      };
      await T.play(0.3, into);
      out.wheee = T.pops().includes(T.N.POP.wheee);
      out.pops = T.pops().slice(0, 6);
      out.live = T.lives().filter((l) => /current/i.test(l));
      // you lie in the lane (no sail, across it), 2 s
      const ride = (x, z, secs) => {
        G.place(p, x, z, Math.atan2(-uz, ux));
        p.speed = 0;
        G.state.sail = 0;
        T.steps(secs, () => {
          p.speed = 0;
          G.state.sail = 0;
          p.hp = p.maxHp;
        });
        const dx = p.x - x;
        const dz = p.z - z;
        return { along: r2((dx * ux + dz * uz) / secs), across: r2(Math.abs(dx * -uz + dz * ux) / secs) };
      };
      out.inLane = ride(a.x, a.z, 2);
      out.drift = G.v4.drift ? G.v4.drift(a.x, a.z) : null;
      // 25 u off the lane's side: no drift
      out.off = ride(a.x - uz * 25, a.z + ux * 25, 2);
      // a puffer in the lane, far from any hull, rides it too
      G.place(p, a.x - uz * 60, a.z + ux * 60, 0);
      const pid = G.v4.spawn('puffer', a.x, a.z, { n: 1 });
      T.steps(0.8, () => (p.speed = 0));
      const u0 = (G.v4.foes.puffers || []).find((u) => u.patch === pid);
      const at0 = u0 && { x: u0.x, z: u0.z };
      T.steps(1, () => (p.speed = 0));
      const u1 = (G.v4.foes.puffers || []).find((u) => u.patch === pid);
      out.puffer = at0 && u1 ? { along: r2((u1.x - at0.x) * ux + (u1.z - at0.z) * uz), state: u1.state } : null;
      return out;
    });
    const C = N.CURRENT;
    check(near(r.inLane.along, C.speed, 0.35) && r.inLane.across < 0.5 && r.wheee,
      `currents: with no sail you drift ${r.inLane.along} u/s along a coral current (${C.speed}), ${r.inLane.across} across, and WHEEE! (${J({ ...r.inLane, drift: r.drift, pops: r.pops, live: r.live })})`);
    check(Math.abs(r.off.along) < 0.2 && r.off.across < 0.2, `currents: 25 u off it, nothing (${J(r.off)})`);
    check(!!r.puffer && near(r.puffer.along, C.speed, 0.5), `currents: a puffer in it rides it too (${J(r.puffer)})`);
    await close(ctx);
  });

  // The ebb tide (level 12): warned TIDE.warn s ahead (the bell, LOW TIDE!, the banner the first time); while it is out
  // a deep hull in a sandbar has her speed cap ×0.5 (SHALLOWS!), pirates too, a shallow-draft hull none; the bar is
  // no collider: you sail across it.
  await section('tide', async () => {
    const { ctx, page: tp } = await open({ label: 'tide' });
    const r = await ev(tp, async () => {
      const G = window.__game;
      const TD = T.N.TIDE;
      const r2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
      const out = {};
      const p = T.level(12);
      const pin = T.pinner(p);
      await T.play(0.1, pin);
      T.spySounds();
      T.watchPops();
      // its own clock: the first low tide at TIDE.first s, warned TIDE.warn s before
      const st = () => G.v4.mechanics4.tide;
      T.until(() => st().phase === 'warning', TD.first + 5, () => {
        pin();
        p.hp = p.maxHp;
      });
      const w0 = G.state.time;
      out.warnAt = r2(G.v4.mechanics4.hazardTime);
      out.banner = T.shown('banner') ? T.text('banner') : '';
      // (real frames: the pops waiting their turn come up)
      await T.play(0.3, pin);
      T.until(() => st().phase === 'low', TD.warn + 2, pin);
      out.warn = r2(G.state.time - w0);
      out.bell = T.sounds.filter((s) => s.name === 'tidebell').length;
      // (the first warning's word is its banner; the next ones pop LOW TIDE! over you)
      T.until(() => st().phase === 'warning', TD.every + 2, () => {
        pin();
        p.hp = p.maxHp;
      });
      out.second = { hz: r2(G.v4.mechanics4.hazardTime), banner: T.shown('banner') ? T.text('banner') : '' };
      await T.play(0.3, pin);
      out.word = T.pops().includes(T.N.POP.lowTide);
      out.bells = T.sounds.filter((s) => s.name === 'tidebell').length;
      T.until(() => st().phase === 'low', TD.warn + 2, pin);
      // in the middle of bar 1: your cap ×0.5 while it is out (SHALLOWS!); a corsair's too; a skiff's not
      const bar = G.env.tideBars[0];
      const mx = (bar.ax + bar.bx) / 2;
      const mz = (bar.az + bar.bz) / 2;
      const hb = Math.atan2(bar.bx - bar.ax, bar.bz - bar.az);
      const cap = (s) => r2(G.combat.effects(s).speedCap);
      const deep = T.spawn('corsair', 60, 0, 0);
      const shallow = T.spawn('skiff', -60, 0, 0);
      const before = { you: null, deep: cap(deep), shallow: cap(shallow) };
      G.place(p, mx + 40, mz, 0);
      before.you = cap(p);
      T.watchPops();
      G.place(p, mx, mz, hb);
      G.place(deep, mx + Math.sin(hb) * 0.1, mz + Math.cos(hb) * 0.1, hb);
      G.place(shallow, mx - Math.sin(hb) * 0.1, mz - Math.cos(hb) * 0.1, hb);
      for (const s of [deep, shallow]) {
        s.speed = 0;
        s.reload.port = s.reload.star = 99;
      }
      const hold = T.pinner(p, deep, shallow);
      T.steps(0.1, hold);
      out.low = { you: cap(p), deep: cap(deep), shallow: cap(shallow), before, word: T.pops().includes(T.N.POP.shallows), inBar: true };
      // no collider: under full sail across the bar, you go straight over it
      G.place(deep, p.x + 300, p.z, 0);
      G.place(shallow, p.x - 300, p.z, 0);
      const ax = mx - Math.cos(hb) * 14;
      const az = mz + Math.sin(hb) * 14;
      G.place(p, ax, az, hb + Math.PI / 2);
      p.speed = 4;
      G.state.sail = 3;
      let minSpeed = Infinity;
      let maxSpeed = 0;
      T.steps(8, (i) => {
        G.state.sail = 3;
        p.hp = p.maxHp;
        if (i > 60) minSpeed = Math.min(minSpeed, p.speed);
        maxSpeed = Math.max(maxSpeed, p.speed);
      });
      const across = (p.x - ax) * Math.cos(hb) - (p.z - az) * Math.sin(hb);
      out.cross = { across: r2(across), minSpeed: r2(minSpeed), maxSpeed: r2(maxSpeed), phase: G.v4.mechanics4.tide.phase, colliders: G.colliders.filter((c) => Math.hypot(c.x - mx, c.z - mz) < c.r).length };
      return out;
    });
    const TD = N.TIDE;
    check(near(r.warnAt, TD.first - TD.warn, 0.1) && r.warn >= Math.max(3, TD.warn) - 1e-6 && r.warn <= TD.warn + 0.05 && r.bell >= 1 && /Low tide!/.test(r.banner),
      `tide: the first low tide is warned ${r.warn} s ahead (≥ ${TD.warn}) from ${r.warnAt} s: the bell and the banner "${r.banner}" (${J({ bell: r.bell })})`);
    check(near(r.second.hz, TD.first + TD.every - TD.warn, 0.1) && r.word && r.bells >= 2,
      `tide: the next one is warned at ${r.second.hz} s (every ${TD.every} s) with the bell and LOW TIDE! (${J({ second: r.second, word: r.word, bells: r.bells })})`);
    check(near(r.low.you, r.low.before.you * TD.speedMul, 0.05) && near(r.low.deep, r.low.before.deep * TD.speedMul, 0.05) && near(r.low.shallow, r.low.before.shallow, 0.05) && r.low.word,
      `tide: in a sandbar at low tide your speed cap ${r.low.before.you} → ${r.low.you} (×${TD.speedMul}, SHALLOWS!), a corsair's ${r.low.before.deep} → ${r.low.deep}, a shallow-draft skiff's ${r.low.before.shallow} → ${r.low.shallow}`);
    check(r.cross.across > 20 && r.cross.minSpeed > 1 && r.cross.colliders === 0, `tide: the sandbar is no collider: under full sail you cross it (${J(r.cross)})`);
    await close(ctx);
  });

  // ----------------------------------------------------------------------------------------------- warm draws
  // After the fly-in no new WebGL program is linked at the first fog bank, current, low tide or Coilback dive (the
  // envs' and the foes' warmables were drawn behind the fly-in, SPEC4 §14.1).
  await section('warm', async () => {
    const { ctx, page: wp } = await open({ label: 'warm', programs: true });
    const rows = [];
    for (const n of [10, 11, 12]) {
      rows.push(await ev(wp, async (n) => {
        const G = window.__game;
        const p = () => G.player;
        G.state.tutorialDone = true;
        G.newGame(n);
        const park = () => {
          T.parkAll();
          p().hp = p().maxHp;
        };
        // the fly-in and the level's first seconds (its model built and warmed)
        await T.play(6, park);
        for (let i = 0; i < 40 && G.v4.view() && !G.v4.view().ready; i++) await T.play(0.25, park);
        await T.play(1, park);
        const p0 = window.__programs;
        const out = { n, p0, events: [] };
        const look = async (label, setup, seconds = 1.5) => {
          setup();
          await T.play(seconds, park);
          out.events.push({ label, programs: window.__programs - p0 });
        };
        if (n === 10) {
          // sail into the first fog bank (it fills the view)
          await look('fog', () => {
            const b = G.v4.mechanics4.fog.banks[0];
            G.place(p(), b.x - Math.sin(b.h) * 20, b.z - Math.cos(b.h) * 20, b.h);
            p().speed = 0;
          });
        }
        if (n === 11) {
          await look('current', () => {
            const L = G.v4.mechanics4.currents.lanes[0];
            const a = L.points[1];
            G.place(p(), a.x, a.z, 0);
            p().speed = 0;
          });
          await look('coilback', () => {
            G.v4.spawn('coilback', p().x + 26, p().z);
          }, 0.5);
          // until it dives and swims under (its bubble trail)
          const id = G.v4.foes.foes.find((f) => f.kind === 'coilback').id;
          await look('dive', () => {}, 0.1);
          for (let i = 0; i < 80 && T.foe(id) && T.foe(id).state !== 'under'; i++) await T.play(0.25, park);
          await look('under', () => {}, 1.5);
          out.dived = T.foe(id) && T.foe(id).state;
        }
        if (n === 12) {
          await look('tide', () => {
            const bar = G.env.tideBars[0];
            G.place(p(), (bar.ax + bar.bx) / 2 + 20, (bar.az + bar.bz) / 2, -Math.PI / 2);
            p().speed = 0;
            G.v4.tide(true);
          }, 2);
        }
        out.after = window.__programs - p0;
        out.api = G.v4.programs ?? null;
        return out;
      }, n));
    }
    for (const w of rows) {
      check(w.p0 > 0 && w.events.length > 0 && w.events.every((e) => e.programs === 0) && (w.n !== 11 || w.dived === 'under'),
        `warm: level ${w.n}: after the fly-in (${w.p0} programs) no new program is linked at ${w.events.map((e) => `${e.label} +${e.programs}`).join(', ')}`);
    }
    await close(ctx);
  });

  // ------------------------------------------------------------------------------------------- the busiest play
  // Each Voyage IV level at its busiest, in view: 4 slots (a pack, a puffer patch and two ships; 5 with a fort on level 12, Old
  // Coilback on 11), Fire / Frost / Stink on them, the level's hazard, warning shapes up, a crate; then a raider boards
  // you: every sampled frame ≤ 450 draw calls. foes.png: level 11's busiest frame.
  await section('busy', async () => {
    const { ctx, page: bp } = await open({ label: 'busy' });
    for (const n of [10, 11, 12]) {
      const b = await ev(bp, async (n) => {
        const G = window.__game;
        const r2 = (v) => Math.round(v * 100) / 100;
        const p = T.level(n);
        G.state.combatTime = 30;
        // you, stopped 24 u from a crate and facing it, from the side where the scene (you, and the foes up to 40 u
        // ahead) lies farthest from the level's land (moved away by T.level, but still drawn where it was: no hull
        // inside a rock), its reefs and its tide bars
        const seg = (x, z, b) => {
          const vx = b.bx - b.ax;
          const vz = b.bz - b.az;
          const t = Math.max(0, Math.min(1, ((x - b.ax) * vx + (z - b.az) * vz) / (vx * vx + vz * vz || 1)));
          return Math.hypot(x - b.ax - vx * t, z - b.az - vz * t) - b.r;
        };
        const clearOf = (q, h) => {
          const sx = q.x - Math.sin(h) * 24;
          const sz = q.z - Math.cos(h) * 24;
          let m = Infinity;
          for (const d of [0, 16, 24, 30, 40]) {
            for (const a of [-0.45, 0, 0.45]) {
              const x = sx + Math.sin(h + a) * d;
              const z = sz + Math.cos(h + a) * d;
              if (Math.hypot(x, z) > G.env.worldRadius - 8) return -Infinity;
              for (const o of [...G.colliders, ...G.reefs]) m = Math.min(m, Math.hypot(o.x - 5000 - x, o.z - z) - o.r);
              for (const b of G.env.tideBars || []) m = Math.min(m, seg(x, z, b));
            }
          }
          return m;
        };
        let best = null;
        for (const q of G.specials.crates.filter((k) => !k.taken)) {
          for (let i = 0; i < 16; i++) {
            const h = (i / 16) * Math.PI * 2;
            const m = clearOf(q, h);
            if (!best || m > best.m + 1e-6) best = { q, h, m };
          }
        }
        const c = best.q;
        const ux = Math.sin(best.h);
        const uz = Math.cos(best.h);
        G.place(p, c.x - ux * 24, c.z - uz * 24, Math.atan2(ux, uz));
        p.speed = 0;
        G.state.sail = 0;
        // (the chase camera comes along in real frames: 1.2 s of them, the sea still empty)
        const pose = { x: p.x, z: p.z, h: p.h };
        for (let t0 = G.state.time, i = 0; i < 200 && G.state.time - t0 < 1.2; i++) {
          await new Promise((r) => requestAnimationFrame(r));
          G.place(p, pose.x, pose.z, pose.h);
          p.speed = 0;
        }
        const fwd = (d, a) => ({ x: p.x + Math.sin(p.h + a) * d, z: p.z + Math.cos(p.h + a) * d });
        const ships = [['netsloop', 'stinger'], ['witch', 'ironclad'], ['netsloop', 'privateer']][n - 10].map((t, k) => {
          const at = fwd(24 + 6 * k, k ? 0.45 : -0.45);
          const e = G.spawn(t, at.x, at.z, p.h + Math.PI / 2);
          e.speed = 0;
          return e;
        });
        // Fire, Frost, Stink: one volley each at 12 u off your beam
        const statused = [];
        ['fire', 'frost', 'stink'].forEach((id, k) => {
          const e = ships[k % ships.length];
          const beam = () => {
            G.place(e, p.x - Math.cos(p.h) * 12, p.z + Math.sin(p.h) * 12, p.h);
            e.speed = 0;
            e.reload.port = e.reload.star = 99;
            p.speed = 0;
          };
          beam();
          G.specials.setLoads({ fire: 9, frost: 9, stink: 9 });
          G.combat.setAmmo(id);
          p.reload.port = p.reload.star = 0;
          G.playerFire(1);
          for (let s = 0; s < 600 && G.balls.some((x) => x.owner === 'player'); s++) {
            beam();
            G.step(1 / 120);
          }
          if (e.status && e.status.id === id) statused.push(id);
        });
        G.combat.setAmmo('round');
        const hold = (free) => {
          ships.forEach((e, k) => {
            const s = fwd(24 + 6 * k, k ? 0.45 : -0.45);
            if (e !== free) G.place(e, s.x, s.z, p.h + Math.PI / 2);
            e.speed = 0;
            e.reload.port = e.reload.star = 99;
          });
          p.speed = 0;
          p.hp = p.maxHp;
        };
        // the pack, a puffer patch (Old Coilback on level 11, a fort on 12), and the hazard (the tide out on 12)
        const at = (d, a) => fwd(d, a);
        G.v4.spawn('jolly', at(16, 0.2).x, at(16, 0.2).z);
        if (n === 12) G.v4.spawn('fort');
        if (n === 12) G.v4.tide(true);
        // warning rings with long warnings
        [0, 1, 2].forEach((k) => {
          const q = fwd(14 + 4 * k, -0.5 + 0.4 * k);
          G.launchBomb({ kind: 'shell', from: null, tx: q.x, tz: q.z, radius: 4.5, damage: 1, warn: 9 });
        });
        T.steps(2, () => hold());
        // (the puffer patch last, 40 u ahead past the ships and off your masts: puffers drift at the nearest hull, puff
        // 6 u from it and pop 1.5 s later, swimming home, so they rise just before the sampling, out where they are still
        // drifting at its end; Old Coilback too, who circles you, so he is still in view)
        G.v4.spawn('puffer', at(40, -0.22).x, at(40, -0.22).z, { n: 3 });
        if (n === 11) G.v4.spawn('coilback', at(24, 1.2).x, at(24, 1.2).z);
        T.steps(0.7, () => hold());
        // (the level's banner goes, as the game's own frame does it: T.level stopped its timer with the banner shown)
        G.state.bannerTimer = 1e-3;
        const sample = async (each) => {
          const calls = [];
          const mode = G.state.mode;
          G.state.mode = 'playing';
          const t0 = G.state.time;
          for (let i = 0; i < 300 && G.state.time - t0 < 1.6; i++) {
            await new Promise((r) => requestAnimationFrame(r));
            each();
            calls.push(G.renderInfo.calls);
          }
          G.state.mode = mode;
          return { frames: calls.length, max: Math.max(...calls), min: Math.min(...calls), t: r2(G.state.time - t0) };
        };
        const scene = () => ({
          fighting: G.enemies.filter((e) => G.fighting(e) && !(e.rise > 0)).length,
          slots: G.v4.slots,
          puffers: G.v4.foes.puffersAlive,
          statuses: G.enemies.filter((e) => G.fighting(e) && e.status && e.status.id).map((e) => e.status.id),
          shapes: G.v4.warnSlots.count,
          view: G.v4.view() ? { shapes: G.v4.view().shapes, boats: G.v4.view().boats, puffers: G.v4.view().puffers } : null,
          crate: G.specials.crates.some((q) => !q.taken),
          boarding: G.boarding.active ? G.boarding.phase : null,
          hazard: n === 10 ? G.v4.mechanics4.fog.banks.length : n === 11 ? G.v4.mechanics4.currents.lanes.length : G.v4.mechanics4.tide.phase,
        });
        const a = await sample(() => hold());
        const sa = scene();
        G.state.mode = 'paused';
        await T.redraw();
        await T.redraw();
        a.settled = G.renderInfo.calls;
        T.busy = { ships, hold, sample, scene };
        return { n, statused, a, sa };
      }, n);
      // (foes.png: level 11's busiest play before the boarding, its foes in view)
      if (n === 11) await snap(bp, 'foes.png');
      // a raider boards you; the rest goes on
      Object.assign(b, await ev(bp, async () => {
        const G = window.__game;
        const p = G.player;
        const { ships, hold, sample, scene } = T.busy;
        const raider = ships[ships.length - 1];
        G.place(raider, p.x + Math.cos(p.h) * 7, p.z - Math.sin(p.h) * 7, p.h);
        raider.speed = 0;
        const raided = G.boarding.raid(raider);
        const bb = await sample(() => hold(raider));
        const sb = scene();
        return { raided, bb, sb };
      }));
      const { a, sa, bb, sb } = b;
      // (at the end of the sampling: the two ships, the pack, the patch with its puffers still out, and Old Coilback on
      // level 11 or the fort on 12)
      check(sa.fighting >= 2 && sa.fighting + sa.slots >= (n === 10 ? 4 : 5) && sa.puffers >= 1 && b.statused.length === 3 && sa.shapes >= 3 && sa.crate,
        `busy: level ${n} at its busiest: ${sa.fighting} ships and ${sa.slots} foe slots (${sa.puffers} puffers out), Fire, Frost and Stink (${b.statused.join(', ')}), ${sa.shapes} warning shapes, the hazard (${sa.hazard}), a crate (${J(sa)})`);
      check(a.frames >= 5 && a.max > 0 && a.max <= 450 && a.settled > 0 && a.settled <= 450,
        `busy: level ${n}'s busiest play draws ${a.min}-${a.max} calls over ${a.frames} frames, ${a.settled} settled (≤ 450)`);
      check(b.raided && !!sb.boarding && bb.frames >= 5 && bb.max > 0 && bb.max <= 450,
        `busy: level ${n} with a raider boarding you (${sb.boarding}) draws ${bb.min}-${bb.max} calls over ${bb.frames} frames (≤ 450) (${J({ bb, ...sb })})`);
    }
    await close(ctx);
  });

  // --------------------------------------------------------------------------------------------------- bot v4
  // Bot v4 (§13.3) on profile V4 (§2.8): one seeded run of each Voyage IV level with special shot and one with none.
  // Each is cleared within 900 s of simulated time (a second try allowed), never stuck (60 s without any ship, foe,
  // wave or slot changing), and never inside land. Level 12: its waves (the Shellback joins in Stage 2 round R5).
  await section('bot', async () => {
    const { ctx, page: bp } = await open({ label: 'bot' });
    const SPECIAL = await bp.evaluate(async () => JSON.parse(JSON.stringify((await import('/src/specials.js')).SPECIAL)));
    const won = (r) => r.result === 'levelDone' || r.result === 'won';
    const seed = Number(process.env.V4_BOT_SEED) || 1;
    for (const n of [10, 11, 12]) {
      for (const specials of [true, false]) {
        const tries = [];
        let r = null;
        for (let k = 0; k < 2; k++) {
          r = await bp.evaluate(botV4, { n, profile: 'v4', specials, strategy: 'circle', seed: seed + k * 101, maxT: 900, SPECIAL });
          tries.push(r);
          if (won(r)) break;
        }
        const last = tries[tries.length - 1];
        console.log(`      bot: L${n} ${specials ? 'specials' : 'none'}: ${tries.map((t) => `${t.result} ${t.time} s dmg ${t.damageTaken} hp ${t.hpLeft}/${t.maxHp} waves ${J(t.waves)} stuck ${t.stuck} noProgress ${t.noProgress} nets ${t.nets} left "${t.left}" fired ${J(t.ammoFired)} hurt by ${t.hurtBy}`).join(' | ')}`);
        const spent = last.spent.fire + last.spent.frost + last.spent.stink;
        check(won(last) && last.time <= 900 && tries.every((t) => t.noProgress < 60 && t.stuck === 0) && (specials ? true : spent === 0),
          `bot: level ${n} ${specials ? 'with special shot' : 'with no special shot'} cleared in ${last.time} s of simulated time (try ${tries.length}; ≤ 900), never stuck 60 s (${tries.map((t) => t.noProgress).join(' / ')} s), never inside land, ${spent} special loads (${J({ result: last.result, dmg: last.damageTaken, waves: last.waves })})`);
      }
    }
    await close(ctx);
  });

  //__SECTIONS5__

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 8).join(' | ') : ''}`);
  await browser.close();
  server.close();
  console.log(`\nvoyage4.cjs: ${passes} passed, ${failures} failed${waits ? `, ${waits} waiting for Stage 3` : ''}`);
  console.log(failures ? `${failures} check(s) failed` : 'All Voyage IV checks passed');
  process.exit(failures ? 1 : 0);
}

module.exports = { botV4, installHelpers };
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
