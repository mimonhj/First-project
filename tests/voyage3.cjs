// Voyage III suite (SPEC3 §13.2, tests/voyage3.cjs): the Kraken Seas, levels 7-9, as everyone sails them (WITH_KRAKEN;
// before it was switched on for everyone, VOYAGE3_QUERY='?quality=low&kraken=1' served them). Drives the game in
// headless Chromium through the window.__game test API with the real-time loop frozen (G.step(1/120)), like battle.cjs:
// - the voyage: nine levels, Voyage III's three (names, seas, stars, waves, rules, crates, bonus, the finale)
// - each level's start: its sea and music, its first wave, open water for every spawn and powder-crate spot, the
//   draw calls at the start (≤ 310), a screenshot (atolls.png, cape.png, deep.png), the level banner clear of the
//   minimap on a 568x320 window
// - special shot in Voyage III: the loads at every level start, and Fire / Frost / Stink on the new ships
//   (the Shark Raider, the Iron Turtle's armour, the Squid Skiff, the Inkheart a boss)
// - level 7: waterspouts (forming 3 s, the pull, the core's spin, damage and fling, a fire put out), the Shark
//   Raider's charge (a 1.5 s wind-up with its RAM! chevrons, 10 and 8 damage, CRUNCH!), the powder crates
// - level 8: rogue waves (4 s of warning with the horn and the WAVE! arrow; side-on 10, bow-in nothing, stern-on a
//   surf; a fire put out), fire ships (lit ≥ 1.6 s before the blast, sunk while lit: a blast and no coins), the
//   Bomb Ketch's mortar ring (2.2 s, 12 damage)
// - level 9 before the rise: sea geysers (1.8-2.2 s of bubbling ring, 10 damage), the Inkheart's ink pots (1.8 s
//   rings, 8 damage, a slick at 0.6 × your top speed), a Squid Skiff boarding you, the Inkheart's fall (the geysers
//   stop, her crew flee, the slicks fade), deep-hazards.png
// - the busiest play of each level (busy): a wave of 3 and a leftover, Fire, Frost and Stink, the level's hazards,
//   warning rings and a crate all in view, then a raider boarding you: every sampled frame ≤ 450 draw calls
// - the finale, the Kraken (SPEC3 §5.7; G.kraken): the Inkheart's fall, the dread and the rise (skippable)
//   (kraken-rise); its three phases, every warning ≥ 1.5 s with its sound and word, slams, ink, the phase banners,
//   the boss bar and notches, FIRE! and the guns, "You can't board a sea monster!", the cut-off (kraken-fight); a
//   grab and the ways out of it, no grab within 8 s of a release, CUT! on a phone (kraken-grab); driven off, the
//   Pearl, the baby kraken, the feat, the clear waiting for the Pearl, the final Victory, Enter to the title
//   (kraken-end); "Try again from the Kraken" (kraken-retry); the rise's camera and reduced motion, the fight's
//   draw calls ≤ 450, kraken-rise.png, kraken-fight.png, kraken-grab-390x844.png (kraken-look)
// - the Stage 2 review's fixes: a grab's squeeze flashes nothing red (one flash as it takes hold), a held key's
//   auto-repeat doesn't skip the rise, all stop for the dread and the rise, its head is solid (kraken-calm); the
//   rise's banner clear of the rising head, "All stop!" (kraken-calm-look); a grab's pops clear of the grab strip on
//   small phones (kraken-calm-pops); FIRE SHIP! and RAM! arrows at the screen edge for threats off the view, the WAVE!
//   arrow clear of the minimap and the REPEL BOARDERS! strip, a hazard's how-to banner keeps its time (seas-cues)
// - the journey (voyage): the title's cards 7-9 under "Voyage III · The Kraken Seas", card 7 "Beat the Phantom
//   Galleon"; the save migration (6 open + the legend feat opens card 7 at load; without the feat nothing opens); the
//   Maelstrom's Victory "Sail on to the Kraken Seas" with the teaser, the won shipyard's way out to the Turtle Atolls,
//   and Enter starts level 7 with the voyage gold
// - bot v3 (bot): the late-game ship clears each of levels 7-9 within 900 s (a second try allowed), with special shot
//   and with none, never stuck 60 s, never inside land, the Kraken's fight within 240 s (one seeded run each)
// The Kraken's hp checks follow src/kraken.js's KRAKEN (hp and the two phase lines), whatever its tuning.
// Run with `node tests/voyage3.cjs` (VOYAGE3_ONLY=levels,starts runs some sections; VOYAGE3_ROOT serves another
// copy of the game; VOYAGE3_QUERY replaces "?quality=low"; SCREENSHOT_DIR puts the screenshots elsewhere).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('./server.cjs');

const ROOT = process.env.VOYAGE3_ROOT || path.join(__dirname, '..');
const OUT = process.env.SCREENSHOT_DIR || path.join(ROOT, 'tests', 'screenshots');
const ONLY = (process.env.VOYAGE3_ONLY || '').split(',').filter(Boolean);
const QUERY = process.env.VOYAGE3_QUERY || '?quality=low';
const BROWSER_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const SCREENSHOT_TIMEOUT = 120000;

let failures = 0;
let passes = 0;
function check(cond, msg) {
  console.log(`${cond === true ? 'PASS' : 'FAIL'}  ${msg}`);
  if (cond === true) passes++;
  else failures++;
}
const J = (v) => JSON.stringify(v);
const near = (a, b, eps = 1e-6) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= eps;
const r2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
const OWN_ALL = '{"v":1,"own":{"fire":1,"frost":1,"stink":1}}';
// Levels 1-9 open, the tutorial and every tip seen, all three recipes owned.
const STORE = { 'pirates-ahoy-unlocked': '9', 'pirates-ahoy-tutorial-done': '1', 'pirates-ahoy-tips': '65535', 'pirates-ahoy-powder': OWN_ALL };
// The Kraken's bar from src/kraken.js's KRAKEN (a pure module, loaded as a data: URL), so the checks follow its tuning:
// hp (full), n1 (phase 2 from here) and n2 (phase 3 from here). In the page as T.KR.
async function krakenNumbers() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'kraken.js'), 'utf8');
  const { KRAKEN } = await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
  return { hp: KRAKEN.hp, n1: KRAKEN.notches[0], n2: KRAKEN.notches[1] };
}
let KR = null;

// ---------------------------------------------------------------------------------------------------------
// In-page helpers (window.T), installed after every page load
// ---------------------------------------------------------------------------------------------------------
function installHelpers() {
  const G = window.__game;
  const rightX = (h) => -Math.cos(h);
  const rightZ = (h) => Math.sin(h);
  const T = {
    // Level n frozen at its start: the fly-in over, you stopped, its land and reefs moved out of the way, its own
    // ships parked out of reach (a ship with `rise` > 0 has no AI and is never hit), past the grace period.
    level(n) {
      G.state.tutorialDone = true;
      G.newGame(n);
      G.state.intro = 0;
      G.state.bannerTimer = 0;
      const p = G.player;
      p.speed = 0;
      G.state.sail = 0;
      G.colliders.forEach((c) => (c.x += 5000));
      G.reefs.forEach((r) => (r.x += 5000));
      const ps = G.env.playerStart;
      const d = Math.hypot(ps.x, ps.z) || 1;
      const R = G.env.worldRadius - 6;
      G.enemies.forEach((e, k) => {
        e.rise = 1e6;
        e.x = (-ps.x / d) * R + (ps.z / d) * 9 * k;
        e.z = (-ps.z / d) * R - (ps.x / d) * 9 * k;
        e.speed = 0;
      });
      G.state.combatTime = 30;
      G.combat.forceCrit('none');
      G.combat.seed(1);
      G.combat.clearLog();
      return p;
    },
    // A new enemy `lat` off your beam (+ starboard), `along` ahead, heading yours + `turn`.
    spawn(type, lat, along = 0, turn = 0) {
      const p = G.player;
      const e = G.spawn(type, p.x + rightX(p.h) * lat + Math.sin(p.h) * along, p.z + rightZ(p.h) * lat + Math.cos(p.h) * along, p.h + turn);
      e.speed = 0;
      e.rise = 0;
      return e;
    },
    steps(s, each) {
      const n = Math.round(s * 120);
      for (let i = 0; i < n; i++) {
        G.step(1 / 120);
        if (each && each(i) === false) return i + 1;
      }
      return n;
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
    // A broadside at `e` with both ships held for `seconds`: her hits from the shot log, her hull lost.
    volley(e, { side = 1, seconds = 0.8 } = {}) {
      const p = G.player;
      G.combat.clearLog();
      p.reload.port = p.reload.star = 0;
      const hold = T.pinner(p, e);
      hold();
      const hp0 = e.hp;
      G.fire(p, side, e);
      T.steps(seconds, hold);
      return { hits: G.combat.log.filter((l) => l.owner === 'player' && l.targetId === e.id), dhp: hp0 - e.hp };
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
    // Real frames for `seconds` of play with `hold` each frame (the pops' rate fills up again); the mode is put back.
    async play(seconds = 1.1, hold = () => {}) {
      const mode = G.state.mode;
      G.state.mode = 'playing';
      const t0 = G.state.time;
      let n = 0;
      while (G.state.time - t0 < seconds && n < 400) {
        await new Promise((r) => requestAnimationFrame(r));
        hold();
        n++;
      }
      G.state.mode = mode;
      return n;
    },
  };
  window.T = T;
}

// ---------------------------------------------------------------------------------------------------------
// Bot v3 (SPEC3 §13.3; agent 3B's balance bot, .dock-harness/kraken3/S1-3B/bot/bot3.js, without its trace options).
// Runs INSIDE the page: page.evaluate(botV3, args). Bot v2 (balance.cjs botLevel) plus: Fire on Iron Turtles (and the
// Inkheart), Frost on fire ships and charging sharks, Stink on bomb ketches, on a Kraken grab and before a boarding;
// dodges every warning ring (lava, lightning, geyser, shell, ink, the Kraken's tentacle and ink rings) like lava; keeps
// > 16 u from spout cores; turns bow-in or stern-on to a warned rogue wave; holds G to cut a grab; shoots the Kraken's
// raised parts. args: { n, profile: 'stock' | 'late' | 'full', specials, strategy: 'circle' | 'beam', seed, maxT,
// SPECIAL, retry } (retry: 'kraken' starts from the shipwreck card's "Try again from the Kraken"). Deterministic per
// seed: Math.random and the combat dice are reseeded after the level starts.
// ---------------------------------------------------------------------------------------------------------
function botV3(args) {
  const { n, profile = 'late', maxT = 900, specials = true, strategy = 'circle', seed = 1, SPECIAL = {}, retry = null } = args;
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
  const PROFILES = {
    stock: { ship: {}, armory: {}, island: {} },
    // SPEC3 §5.9's late-game profile
    late: { ship: { guns: 1, shot: 2, crew: 2, hull: 2, sails: 1, carpenter: 1, rudder: 1 }, armory: { boarders: 1, cutlass: 1, grapple: 0, gunner: 1 }, island: { windmill: 1 } },
    // everything bought: the shipyard, the tavern and the island at their tops
    full: {
      ship: { guns: 2, shot: 3, crew: 3, hull: 3, sails: 2, carpenter: 2, rudder: 3 },
      armory: { boarders: 3, cutlass: 3, grapple: 2, gunner: 3 },
      island: { homeA: 3, homeB: 3, homeC: 3, homeD: 3, bakery: 3, windmill: 3, lighthouse: 3, market: 3, school: 3, park: 3 },
    },
  };
  const P = PROFILES[profile] || PROFILES.late;
  if (retry === 'kraken') {
    if (!G.kraken.retry()) return { level: n, result: 'noretry' };
  } else {
    G.setShipConfig({ up: P.ship });
    G.armory.set({ up: P.armory });
    G.island.set({ v: 1, t: P.island });
    G.specials.setPowder({ v: 1, own: specials ? { fire: 1, frost: 1, stink: 1 } : { fire: 0, frost: 0, stink: 0 } });
    G.state.unlocked = Math.max(G.state.unlocked, G.LEVELS.length);
    G.state.tutorialDone = true;
    G.startLevel(n);
  }
  if (G.state.mode === 'playing') G.togglePause();
  G.state.mode = 'playing';
  Math.random = mulberry32((seed * 2654435761 + n * 40503 + (retry ? 77 : 0)) >>> 0);
  G.combat.seed(seed * 7919 + n * 31 + (retry ? 5 : 0));
  const S = G.combat.rules;
  const isL9 = !!G.LEVELS[n - 1].kraken;
  const stats = {
    level: n, profile, specials, strategy, seed, retry, loads: G.specials.loads, spent: null, result: null, time: 0, damageTaken: 0, hpLeft: 0, maxHp: G.player.maxHp,
    captures: 0, sunk: 0, boardings: 0, raids: 0, cuts: 0, takes: 0, stuck: 0, hurtBy: null, left: '', noProgress: 0,
    kraken: null, waveTimes: [], ammoFired: {},
  };
  let t = 0;
  let lastHp = G.player.hp;
  let wasActive = false;
  let tick = 0;
  let cutPresses = 0;
  let holding = false;
  let lastProgress = 0;
  let progressKey = '';
  const orbit = { target: null, hp: 0, crew: Infinity, hitAt: 0, flipUntil: -1 };
  const unstick = { slow: 0, until: -1, side: 1, trail: [] };
  const notchOf = (e) => e.strikeAt ?? S.strikeAt(e.crew0);
  const crewOf = (e) => G.combat.crewOf(e);
  // the Kraken: when its fight starts and ends (simulated s), damage taken during it, by phase
  const K = { riseAt: null, fightAt: null, offAt: null, dmg: 0, phaseAt: {}, dmgByPhase: { 1: 0, 2: 0, 3: 0 }, minHp: Infinity, counts: null, grabHeld: 0 };
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
    // ---- boarding set-pieces
    if (B.active && !wasActive) {
      if (B.kind === 'defend') stats.raids++;
      else if (B.kind === 'surrender') stats.takes++;
      else if (B.kind !== 'counter') stats.boardings++;
      cutPresses = 0;
    }
    wasActive = B.active;
    const ks = isL9 ? G.kraken.state : null;
    const kStage = ks ? ks.stage : null;
    const inFight = kStage === 'rise' || kStage === 'fight';
    if (ks) {
      if (kStage === 'rise' && K.riseAt === null) K.riseAt = t;
      if (kStage === 'fight' && K.fightAt === null) K.fightAt = t;
      if ((kStage === 'gone' || kStage === 'over') && K.offAt === null) K.offAt = t;
      if (ks.phase && K.phaseAt[ks.phase] === undefined && inFight) K.phaseAt[ks.phase] = t;
      if (inFight) K.minHp = Math.min(K.minHp, p.hp);
    }
    if (!p.sinking) {
      if (B.active && B.phase === 'threat' && cutPresses < 3 && tick % 3 === 0) {
        G.boardPress();
        cutPresses++;
        if (cutPresses === 3) stats.cuts++;
      }
      const vis = G.mechanics3.visuals() || {};
      // ---- who to go for: the nearest fighting ship (the Inkheart's escort before her); a struck ship close by is taken
      const afloat = G.enemies.filter((e) => e.hp > 0 && !e.sinking && !e.captured && !e.escaped && !e.fleeing);
      const fighting = afloat.filter((e) => G.fighting(e) && !(e.rise > 0));
      const struck = afloat.filter((e) => e.surrendered);
      const near = (list) => list.slice().sort((a, b) => hyp(a.x - p.x, a.z - p.z) - hyp(b.x - p.x, b.z - p.z))[0] || null;
      let target = near(fighting);
      const s0 = near(struck);
      if (s0 && (!target || hyp(s0.x - p.x, s0.z - p.z) < 30)) target = s0;
      // the Kraken's raised parts (pseudo-ships for inArc), and what to steer by when nothing is up: its shadow
      const kparts = inFight ? G.kraken.wrappers.filter((w) => w.hp > 0).map((w) => ({ x: w.x, z: w.z, h: 0, speed: 0, hp: w.hp, kind: w.kind, part: w.part, type: { len: w.len, wid: w.len } })) : [];
      let kTarget = null;
      if (inFight) {
        const pick = (k) => kparts.filter((w) => w.kind === k).sort((a, b) => hyp(a.x - p.x, a.z - p.z) - hyp(b.x - p.x, b.z - p.z))[0];
        kTarget = pick('eye') || pick('head') || pick('tentacle') || null;
        if (!kTarget) {
          const kv = G.kraken.visuals();
          if (kv && kv.shadow) kTarget = { x: kv.shadow.x, z: kv.shadow.z, h: 0, speed: 0, hp: 0, kind: 'shadow', type: { len: 4 } };
        }
      }
      // ---- grapple when the preview says capture (or she struck); counter-board on capture odds
      if (!B.active && !inFight) {
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
      if (target) {
        const r = G.relative(p, target.x, target.z);
        const toT = Math.atan2(target.x - p.x, target.z - p.z);
        const odds = B.odds(target);
        const wantBoard = odds && (odds.label === 'capture' || odds.label === 'take');
        const crew = crewOf(target);
        if (has('grape') && r.dist < 16 && crew > notchOf(target) + 2 && !target.surrendered && !target.type.fireship) ammo = 'grape';
        else ammo = 'round';
        // Special shot (bot v3): Frost on a fire ship or a charging shark, Fire on an Iron Turtle or the Inkheart,
        // Stink on a bomb ketch and before a boarding.
        if (specials && !target.surrendered) {
          const st = target.status && target.status.id;
          const immune = target.status && target.status.immune > 0;
          const charging = target.type.ram && rams.some((m) => m.id === target.id);
          if (target.type.fireship && L.frost > 0 && r.dist < 28) ammo = 'frost';
          else if (charging && L.frost > 0 && st !== 'frost' && r.dist < 28) ammo = 'frost';
          else if (wantBoard && L.stink > 0 && st !== 'stink' && !immune && r.dist < 20) ammo = 'stink';
          else if (target.type.mortar && L.stink > 0 && st !== 'stink' && !immune && r.dist < 20) ammo = 'stink';
          else if (!wantBoard && (target.type.armour || target.type.flagship) && L.fire > 0 && st !== 'fire' && r.dist < 28) ammo = 'fire';
        }
        const pref = ammo === 'grape' ? 12 : target.type.fireship ? 24 : 20;
        const lt = Math.min(3, r.dist / Math.max(4, p.speed + 2));
        const ix = target.x + Math.sin(target.h) * target.speed * lt;
        const iz = target.z + Math.cos(target.h) * target.speed * lt;
        const toI = Math.atan2(ix - p.x, iz - p.z);
        if (wantBoard || target.surrendered) {
          desired = toI;
          sail = 3;
        } else if (r.dist > pref + 6) {
          desired = toT;
          sail = 3;
        } else {
          const a1 = toT + Math.PI / 2;
          const a2 = toT - Math.PI / 2;
          if (orbit.target !== target) {
            orbit.target = target;
            orbit.hp = target.hp;
            orbit.hitAt = t;
            orbit.flipUntil = -1;
          }
          if (target.hp < orbit.hp - 1e-6 || crewOf(target) < (orbit.crew ?? Infinity)) orbit.hitAt = t;
          orbit.hp = target.hp;
          orbit.crew = crewOf(target);
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
      } else if (kTarget) {
        // The Kraken: circle it at full sail, or keep it on the beam at about 20 u under easy sail.
        const r = G.relative(p, kTarget.x, kTarget.z);
        const toT = Math.atan2(kTarget.x - p.x, kTarget.z - p.z);
        const a1 = toT + Math.PI / 2;
        const a2 = toT - Math.PI / 2;
        desired = Math.abs(wrap(a1 - p.h)) < Math.abs(wrap(a2 - p.h)) ? a1 : a2;
        const sideOf = Math.sign(wrap(desired - toT));
        const pref = 20;
        if (r.dist > pref + 4) desired -= sideOf * 0.5;
        else if (r.dist < pref - 4) desired += sideOf * 0.5;
        sail = strategy === 'beam' ? 1 : 3;
        if (specials && kTarget.kind !== 'shadow') {
          const kst = ks && ks.status;
          if ((kTarget.kind === 'eye' || kTarget.kind === 'head') && L.fire > 0 && !(kst && kst.id === 'fire')) ammo = 'fire';
        }
      }
      // ---- the Kraken's grab: hold G (CUT!) to cut it loose; Stink on it makes it sneeze and let go
      if (ks && ks.grab) {
        if (!holding) {
          G.kraken.cutHold(true);
          holding = true;
        }
        K.grabHeld++;
        if (specials && L.stink > 0 && !(ks.status && ks.status.pegs > 0)) ammo = 'stink';
      } else if (holding) {
        G.kraken.cutHold(false);
        holding = false;
      }
      if (G.state.ammo !== ammo) G.combat.setAmmo(ammo);
      // ---- a rogue wave: bow or stern to it, whichever is nearer
      const rg = vis.rogue;
      if (rg && rg.ahead > -4 && rg.ahead < 60) {
        const bow = rg.h + Math.PI;
        const stern = rg.h;
        desired = Math.abs(wrap(bow - p.h)) < Math.abs(wrap(stern - p.h)) ? bow : stern;
        sail = 3;
      }
      // ---- keep > 16 u off a waterspout's core
      for (const s of vis.spouts || []) {
        if (s.state === 'collapsing') continue;
        if (hyp(p.x - s.x, p.z - s.z) < 19) {
          desired = Math.atan2(p.x - s.x, p.z - s.z);
          sail = 3;
        }
      }
      // ---- a shark lining up or charging: turn out of her line
      for (const m of rams) {
        const sh = G.enemies.find((e) => e.id === m.id) || { x: m.x, z: m.z, h: m.h };
        const rr = G.relative({ x: sh.x, z: sh.z, h: m.h }, p.x, p.z);
        if (rr.along > -2 && rr.along < 32 && Math.abs(rr.lat) < 7) {
          desired = m.h + (rr.lat >= 0 ? 1 : -1) * Math.PI / 2;
          sail = 3;
        }
      }
      // ---- a lit fire ship close by: sail away from her ring
      for (const f of vis.fireRings || []) {
        if (hyp(p.x - f.x, p.z - f.z) < f.r + 9) {
          desired = Math.atan2(p.x - f.x, p.z - f.z);
          sail = 3;
        }
      }
      // ---- dodge warning rings (lava, lightning, geysers, shells, ink pots; the Kraken's tentacles and ink)
      const rings = G.bombs.map((b) => ({ x: b.tx, z: b.tz, r: b.radius || 5 }));
      if (ks && inFight) {
        for (const tt of ks.tentacles) if (tt.state === 'warn') rings.push({ x: tt.x, z: tt.z, r: 4 });
        for (const b of ks.inks) rings.push({ x: b.x, z: b.z, r: b.r });
      }
      for (const b of rings) {
        if (hyp(p.x - b.x, p.z - b.z) < b.r + 6) {
          desired = Math.atan2(p.x - b.x, p.z - b.z);
          sail = 3;
        }
      }
      // ---- steer round land and reefs (the nearest one ahead decides the side)
      let block = null;
      for (const o of [...G.colliders, ...G.reefs]) {
        const ri = G.relative(p, o.x, o.z);
        if (ri.along > -2 && ri.along < 22 && Math.abs(ri.lat) < o.r + 6 && (!block || ri.dist < block.dist)) block = ri;
      }
      if (block) desired = p.h + (block.lat > 0 ? 1.3 : -1.3);
      if (hyp(p.x, p.z) > G.env.worldRadius - 15) desired = Math.atan2(-p.x, -p.z);
      // ---- wedged against land (under sail but barely moving for 2 s): commit to one hard turn for 3 s, away from
      // the nearest land, whatever else is going on (a child steers out of it; a bot that re-decides every tick can't)
      // (also: under any sail but hardly getting anywhere for 6 s, e.g. a pull or a current holding her against a rock)
      const free = !(ks && ks.grab) && !G.boarding.active && !(G.state.intro > 0) && kStage !== 'dread' && kStage !== 'rise';
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
        unstick.side = lat > 0 ? 1 : -1; // (turn to port when the land is to starboard)
        unstick.until = t + 3;
        stats.unsticks = (stats.unsticks || 0) + 1;
      }
      if (unstick.until > t) {
        desired = p.h + unstick.side * 1.5;
        sail = 3;
      }
      const diff = wrap(desired - p.h);
      if (diff > 0.05) G.input.left = true;
      else if (diff < -0.05) G.input.right = true;
      G.state.sail = sail;
      // ---- fire whichever side has a target abeam or in its arc, within the loaded ammo's range
      const range = (S.AMMO[G.state.ammo] || SPECIAL[G.state.ammo] || S.AMMO.round).range;
      const pool = [...G.enemies.filter((e) => G.fighting(e)), ...kparts];
      for (const side of [1, -1]) {
        const inArc = pool.filter((e) => {
          const r2 = G.relative(p, e.x, e.z);
          const abeam = Math.sign(r2.lat) === side && r2.dist < range - 2 && Math.abs(r2.along) < Math.abs(r2.lat) * 0.5;
          return abeam || G.inArc(p, e, side, range);
        });
        if (!inArc.length) continue;
        if (G.playerFire(side)) stats.ammoFired[G.state.ammo] = (stats.ammoFired[G.state.ammo] || 0) + 1;
      }
      for (const c of G.colliders) if (hyp(c.x - p.x, c.z - p.z) < c.r) stats.stuck++;
    }
    for (let k = 0; k < 6 && G.state.mode === 'playing'; k++) {
      G.step(1 / 120);
      const d = lastHp - G.player.hp;
      if (d > 0) {
        stats.damageTaken += d;
        if (isL9) {
          const st = G.kraken.state;
          if (st && (st.stage === 'rise' || st.stage === 'fight')) {
            K.dmg += d;
            K.dmgByPhase[st.phase || 1] += d;
          }
        }
      }
      lastHp = G.player.hp;
    }
    t += 6 / 120;
    // progress: enemy hp, the Kraken's bar, the wave; 60 s without any change is "stuck"
    const key = G.enemies.map((e) => Math.round(e.hp) + (e.surrendered ? 's' : '')).join(',') + '|' + G.state.wave + '|' + (isL9 && G.kraken.state ? Math.round(G.kraken.state.hp) + G.kraken.state.stage : '');
    if (key !== progressKey) {
      progressKey = key;
      lastProgress = t;
    } else stats.noProgress = Math.max(stats.noProgress, t - lastProgress);
  }
  if (holding) G.kraken.cutHold(false);
  G.input.left = G.input.right = false;
  const left = G.specials.loads;
  stats.spent = { fire: stats.loads.fire - left.fire, frost: stats.loads.frost - left.frost, stink: stats.loads.stink - left.stink };
  stats.result = G.state.mode === 'playing' ? 'timeout' : G.state.mode;
  stats.time = Math.round(t * 10) / 10;
  stats.damageTaken = Math.round(stats.damageTaken);
  stats.hpLeft = Math.round(G.player.hp);
  stats.captures = G.state.captures;
  stats.sunk = G.state.sunk;
  stats.hurtBy = JSON.stringify(Object.fromEntries(Object.entries(G.state.hurtBy).map(([k, v]) => [k, Math.round(v)])));
  stats.left = G.enemies.filter((e) => e.hp > 0 && !e.captured && !e.escaped).map((e) => e.typeName + (e.surrendered ? '(struck)' : '')).join(' ');
  const m3 = G.mechanics3.state;
  if (m3 && m3.counts) stats.m3 = m3.counts;
  if (isL9) {
    const st = G.kraken.state;
    const r1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);
    stats.kraken = {
      stage: st ? st.stage : null,
      rise: r1(K.riseAt),
      fight: K.fightAt !== null ? r1((K.offAt ?? t) - K.fightAt) : null,
      done: K.offAt !== null,
      phases: Object.fromEntries(Object.entries(K.phaseAt).map(([k, v]) => [k, r1(v - (K.fightAt ?? v))])),
      dmg: Math.round(K.dmg),
      dmgByPhase: Object.fromEntries(Object.entries(K.dmgByPhase).map(([k, v]) => [k, Math.round(v)])),
      minHp: Number.isFinite(K.minHp) ? Math.round(K.minHp) : null,
      hpLeft: st ? Math.round(st.hp) : null,
      counts: st ? st.counts : null,
      dmgBy: st && st.dmgBy ? Object.fromEntries(Object.entries(st.dmgBy).map(([k, v]) => [k, Math.round(v)])) : null,
      grabs: st ? st.grabs : null,
      checkpoint: !!G.kraken.checkpoint,
    };
  }
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

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  KR = await krakenNumbers();
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ args: BROWSER_ARGS });
  const errors = [];
  const watch = (p, label) => {
    p.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
    p.on('console', (m) => m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text()) && errors.push(`${label}: ${m.text()}`));
    p.on('console', (m) => m.type() === 'warning' && /^audio:/.test(m.text()) && errors.push(`${label}: ${m.text()}`));
  };
  async function open({ width = 1280, height = 720, touch = false, store = STORE, label = 'page', reducedMotion = 'no-preference' } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion });
    if (store) await ctx.addInitScript((s) => { try { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); } catch {} }, store);
    const page = await ctx.newPage();
    watch(page, label);
    await page.goto(base + QUERY, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__gameReady === true && window.__game && window.__game.env, null, { timeout: 120000 });
    await page.evaluate(installHelpers);
    await page.evaluate((k) => (window.T.KR = k), KR);
    return { ctx, page };
  }
  const frames = (page, n = 2) =>
    page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
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

  // ------------------------------------------------------------------------------------- leaving a page safely
  // audio.js downloads every recording in the background from page load, so closing a tab can abort one still on
  // its way, and the page being left may say so ("audio: no recording for music:deep (music-deep.mp3), using the
  // synthesised sound: TypeError: Failed to fetch"), which watch() counts as a page error. closeV() forgives exactly
  // that warning from the pages being closed, while they close; every other audio warning stays an error.
  const VLABEL = new WeakMap(); // page → its watch() label (openV records it)
  const FETCH_ABORT = /^audio: no recording for (?:music|amb|sfx):[\w-]+ \([\w.-]+\), using the synthesised sound: TypeError: Failed to fetch$/;
  async function openV(o) {
    const r = await open(o);
    VLABEL.set(r.page, o.label || 'page');
    return r;
  }
  async function closeV(c) {
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

  // The first page (levels, starts, specials); closed after the banner section, so it doesn't render on behind the
  // sections after it (each opens its own page).
  const { ctx: firstCtx, page } = await openV({ label: 'voyage3' });

  // ---------------------------------------------------------------------------------------------- the voyage
  await section('levels', async () => {
    const v = await page.evaluate(() => {
      const G = window.__game;
      return {
        kraken: G.voyage.WITH_KRAKEN,
        n: G.LEVELS.length,
        defs: G.LEVELS.slice(6).map((d) => ({
          name: d.env && d.env.meta && d.env.meta.name,
          act: d.act,
          difficulty: d.difficulty,
          stars: d.stars,
          scene: d.scene,
          waves: d.waves,
          mechanics: d.mechanics,
          crates: d.crates,
          bonus: d.bonus,
          kraken: !!d.kraken,
          finale: !!d.finale,
          bombs: d.bombs ? d.bombs.kind : null,
          maxAttackers: d.maxAttackers,
        })),
      };
    });
    check(v.kraken === true && v.n === 9, `voyage: the Kraken Seas sail: the voyage has nine levels (${J({ kraken: v.kraken, n: v.n })})`);
    const want = [
      { name: 'The Turtle Atolls', difficulty: 'Daring', stars: 7, scene: 'atolls', waves: [['shark', 'shark', 'corsair'], ['bombketch', 'shark', 'privateer']], mechanics: ['spouts'], bonus: 1300, kraken: false, finale: false, bombs: null },
      { name: 'The Cape of Storms', difficulty: 'Fearsome', stars: 8, scene: 'cape', waves: [['ironclad', 'bombketch', 'corsair'], ['fireship', 'ironclad', 'fireship']], mechanics: ['rogue'], bonus: 1600, kraken: false, finale: false, bombs: null },
      { name: "The Kraken's Deep", difficulty: 'Mythic', stars: 9, scene: 'deep', waves: [['skiff', 'skiff', 'ironclad'], ['inkheart', 'skiff']], mechanics: ['flagship'], bonus: 2500, kraken: true, finale: true, bombs: 'geyser' },
    ];
    want.forEach((w, k) => {
      const d = v.defs[k] || {};
      const same = Object.keys(w).every((key) => J(d[key]) === J(w[key])) && d.act === 3 && d.crates === 2 && d.waves.every((wave) => wave.length <= 3);
      check(same, `voyage: level ${7 + k} is ${w.name} (${w.difficulty} ★${w.stars}, the ${w.scene} sea, ${J(w.waves)}, ${w.mechanics}, 2 powder crates, bonus ${w.bonus}${w.kraken ? ', the Kraken, the finale' : ''}) (${J(d)})`);
    });
  });

  // --------------------------------------------------------------------------------------- each level's start
  await section('starts', async () => {
    const SHOT = { 7: 'atolls.png', 8: 'cape.png', 9: 'deep.png' };
    for (const n of [7, 8, 9]) {
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
        // the layout rules of smoke.cjs, and the powder crates' spots in open water too
        const hull = (s) => s.type.wid * 0.5 + 0.4;
        const ships = [G.player, ...G.enemies];
        const inLand = (p, pad) => G.colliders.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < c.r + pad);
        const crates = env.crateSpots || [];
        const out = {
          level: G.state.level,
          mode: G.state.mode,
          name: def.env && def.env.meta && def.env.meta.name,
          scenes,
          wave: G.enemies.map((e) => e.typeName),
          want: def.waves[0],
          spawns: (env.enemySpawns || []).length,
          blocked: ships.filter((s) => inLand(s, hull(s))).length,
          outside: (env.enemySpawns || []).filter((p) => Math.hypot(p.x, p.z) > env.worldRadius).length,
          spawnsInLand: (env.enemySpawns || []).filter((p) => inLand(p, 4)).length,
          crates: crates.length,
          cratesBad: crates.filter((p) => inLand(p, 3) || Math.hypot(p.x, p.z) > env.worldRadius - 4).length,
          start: Math.hypot(env.playerStart.x, env.playerStart.z) < env.worldRadius - 10,
          minEnemyDist: Math.round(Math.min(...G.enemies.map((e) => Math.hypot(e.x - G.player.x, e.z - G.player.z)))),
          loads: G.specials.loads,
        };
        // Stage 0's draw-call probe: the fly-in over, 1 s of play, frozen, two frames
        G.state.intro = 0;
        for (let i = 0; i < 120; i++) G.step(1 / 120);
        G.state.mode = 'paused';
        await T.redraw();
        await T.redraw();
        out.calls = G.renderInfo.calls;
        return out;
      }, n);
      await snap(page, SHOT[n]);
      check(s.level === n && s.name && s.scenes.includes(s.name === 'The Turtle Atolls' ? 'atolls' : s.name === 'The Cape of Storms' ? 'cape' : 'deep') && J(s.wave) === J(s.want) && J(s.loads) === '{"fire":4,"frost":4,"stink":4}',
        `starts: level ${n}, ${s.name}, starts with its music (${J(s.scenes)}), its first wave (${J(s.wave)}) and 4 loads of each special shot`);
      check(s.spawns >= 6 && s.blocked === 0 && s.outside === 0 && s.spawnsInLand === 0 && s.minEnemyDist > 35 && s.crates >= 4 && s.cratesBad === 0 && s.start,
        `starts: level ${n} spawns its ships and lays its powder-crate spots in open water (${J({ spawns: s.spawns, blocked: s.blocked, outside: s.outside, spawnsInLand: s.spawnsInLand, minEnemyDist: s.minEnemyDist, crates: s.crates, cratesBad: s.cratesBad })})`);
      check(s.calls > 0 && s.calls <= 310, `starts: level ${n} draws in ${s.calls} draw calls at its start (≤ 310)`);
    }
  });

  // --------------------------------------------------------------------- special shot on Voyage III's ships
  await section('specials', async () => {
    // Level 7: Fire on a Shark Raider (she burns 18); level 8: an Iron Turtle's beam halves a Fire ball (CLANG!) but
    // not her burn; level 9: Stink stops a Squid Skiff (no hooks, no shots), and the Inkheart, a boss, stays FROZEN
    // 2.5 s.
    const r = await ev(page, async () => {
      const G = window.__game;
      const out = {};
      const setup = async (n, type, ammo, lat = 18) => {
        const p = T.level(n);
        G.specials.setLoads({ fire: 9, frost: 9, stink: 9 });
        G.combat.setAmmo(ammo);
        const e = T.spawn(type, lat, 0, 0);
        await T.play(1.1, T.pinner(p, e));
        T.watchPops();
        return e;
      };
      let e = await setup(7, 'shark', 'fire');
      let hp0 = e.hp;
      let v = T.volley(e);
      let hull = v.hits.reduce((a, l) => a + l.dmg, 0);
      out.shark = { n: v.hits.length, st: G.specials.status(e).id, pops: T.pops().filter((t) => t === 'ON FIRE!').length };
      T.steps(6.5, T.pinner(G.player, e));
      out.shark.burn = Math.round((hp0 - hull - e.hp) * 1000) / 1000;
      e = await setup(8, 'ironclad', 'fire');
      hp0 = e.hp;
      v = T.volley(e);
      hull = v.hits.reduce((a, l) => a + l.dmg, 0);
      out.turtle = { hits: v.hits.map((l) => [l.dmg, l.rangeMul]), st: G.specials.status(e).id, clang: T.pops().filter((t) => t === 'CLANG!').length };
      T.steps(6.5, T.pinner(G.player, e));
      out.turtle.burn = Math.round((hp0 - hull - e.hp) * 1000) / 1000;
      e = await setup(9, 'skiff', 'stink', 9);
      v = T.volley(e);
      const p = G.player;
      out.skiff = { n: v.hits.length, st: G.specials.status(e).id };
      e.reload.port = e.reload.star = 0;
      e.boardCooldown = 0;
      G.state.boardCooldown = 0;
      let hooked = false;
      let fired = false;
      T.steps(3, () => {
        p.speed = 0;
        if (G.boarding.active && G.boarding.target === e) hooked = true;
        if (e.reload.port > 0 || e.reload.star > 0) fired = true;
      });
      out.skiff.hooked = hooked;
      out.skiff.fired = fired;
      e = await setup(9, 'inkheart', 'frost', 22);
      v = T.volley(e);
      const st = G.specials.status(e);
      out.inkheart = { n: v.hits.length, st: st.id, max: st.max };
      return out;
    });
    check(r.shark.n >= 1 && r.shark.st === 'fire' && r.shark.pops === 1 && r.shark.burn === 18, `specials: on the Turtle Atolls a Fire volley sets a Shark Raider ON FIRE: 18 hp of burn (${J(r.shark)})`);
    check(r.turtle.hits.length === 3 && r.turtle.hits.every(([d, m]) => near(d, 3.5 * m, 1e-9)) && r.turtle.st === 'fire' && r.turtle.clang === 1 && r.turtle.burn === 18,
      `specials: off the Cape of Storms an Iron Turtle's beam halves a Fire ball (CLANG!) but not her burn (${J(r.turtle)})`);
    check(r.skiff.n >= 1 && r.skiff.st === 'stink' && !r.skiff.hooked && !r.skiff.fired, `specials: in the Kraken's Deep a stinky Squid Skiff throws no hooks and fires no shot (${J(r.skiff)})`);
    check(r.inkheart.n >= 1 && r.inkheart.st === 'frost' && r.inkheart.max === 2.5, `specials: the Inkheart, a boss, stays FROZEN 2.5 s (${J(r.inkheart)})`);
  });

  // ------------------------------------------------------------------------ the level banners at 568x320
  await section('banner', async () => {
    const { ctx, page: bp } = await open({ width: 568, height: 320, label: 'banner-568' });
    const rows = [];
    for (const n of [7, 8, 9]) {
      rows.push(await bp.evaluate(async (n) => {
        const G = window.__game;
        G.state.tutorialDone = true;
        G.newGame(n);
        G.state.mode = 'paused'; // (frozen at the level's start: its banner stays up)
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
        // (the minimap's ring reaches 7 px beyond its box)
        const clear = !!banner && !!mm && (banner.r <= mm.l - 7 || banner.l >= mm.r + 7 || banner.b <= mm.t - 7 || banner.t >= mm.b + 7);
        return { n, clear, banner, mm, text: T.text('banner').slice(0, 40), fits: !!banner && banner.l >= 0 && banner.r <= innerWidth && banner.t >= 0 && banner.b <= innerHeight };
      }, n));
    }
    const bad = rows.filter((r) => !r.clear || !r.fits);
    check(rows.length === 3 && bad.length === 0, `banner: the level banners of levels 7-9 at 568x320 fit and keep clear of the minimap's ring${bad.length ? ' -> ' + J(bad) : ` (${rows.map((r) => r.text).join(' | ')})`}`);
    await ctx.close();
  });
  await closeV(firstCtx);

  // ------------------------------------------------------------- level 7: waterspouts, Shark Raiders, crates
  await section('atolls', async () => {
    // (tips: every one seen but Voyage III's hazard tips, bits 2048 / 4096 / 8192)
    const { ctx, page: ap } = await open({ label: 'atolls', store: { ...STORE, 'pirates-ahoy-tips': String(65535 & ~(2048 | 4096 | 8192)) } });
    await ap.evaluate(() => {
      const a = window.__game.audio;
      const play = a.play;
      window.__sounds = [];
      a.play = function (name, ...rest) {
        window.__sounds.push(name);
        return play.call(this, name, ...rest);
      };
    });
    // A waterspout: it forms for 3 s (a harmless warning: its swirl ring and lowering funnel are drawn, the first one
    // says "Waterspout!"), then its swirl pulls every ship toward the core at 2 u/s (out to 14 u); in the core (6 u)
    // a ship spins at 2 rad/s, loses 4 hp a second and after 1.5 s is flung out ("WHOOSH!"); it puts out a fire.
    const sp = await ev(ap, async () => {
      const G = window.__game;
      const p = T.level(7);
      const out = {};
      const at = { x: p.x + Math.sin(p.h) * 10, z: p.z + Math.cos(p.h) * 10 };
      await T.play(0.3);
      G.state.mode = 'playing';
      const calls0 = G.renderInfo.calls;
      const v0 = G.mechanics3.spout(at.x, at.z);
      out.v0 = { state: v0 && v0.state, T: v0 && v0.T };
      const find = () => G.mechanics3.visuals().spouts.find((s) => s.id === v0.id);
      // forming, drawn: real frames for its first second (the env draws it from the hazards; the tip shows)
      T.watchPops();
      window.__sounds.length = 0;
      await T.play(1, () => {
        G.player.speed = 0;
      });
      G.state.mode = 'playing';
      out.drawn = { calls0, calls: G.renderInfo.calls, tip: T.shown('hint') ? T.text('hint') : '', spoutSound: window.__sounds.includes('spout') };
      window.__spout = { at, v0, out };
      return out;
    });
    await snap(ap, 'atolls-spout.png');
    Object.assign(sp, await ev(ap, async () => {
      const G = window.__game;
      const p = G.player;
      const { at, v0, out } = window.__spout;
      const find = () => G.mechanics3.visuals().spouts.find((s) => s.id === v0.id);
      const d = () => Math.hypot(p.x - at.x, p.z - at.z);
      const hp0 = p.hp;
      const d0 = d();
      let activeAt = null;
      const t0 = G.state.time - (find() ? find().t : 0);
      let movedWhileForming = 0;
      T.steps(2.5, () => {
        p.speed = 0;
        const s = find();
        if (s && s.state === 'forming') movedWhileForming = Math.max(movedWhileForming, Math.abs(d() - d0));
        if (activeAt === null && s && s.state === 'active') activeAt = G.state.time - t0;
        return activeAt === null;
      });
      out.forming = { lasted: activeAt === null ? null : Math.round(activeAt * 100) / 100, moved: Math.round(movedWhileForming * 1000) / 1000, hurt: hp0 - p.hp };
      // the pull, 10 u out: half a second
      const dA = d();
      T.steps(0.5, () => (p.speed = 0));
      out.pull = Math.round(((dA - d()) / 0.5) * 100) / 100;
      // the core: put 2 u from its middle
      G.place(p, at.x + 2, at.z);
      p.speed = 0;
      const hpC = p.hp;
      let spin = 0;
      let h = p.h;
      const ds = [];
      T.watchPops();
      T.steps(3, (i) => {
        p.speed = 0;
        spin += Math.atan2(Math.sin(p.h - h), Math.cos(p.h - h));
        h = p.h;
        if (i === Math.round(1.4 * 120)) {
          out.core = { lost: hpC - p.hp, spin: Math.round(Math.abs(spin) * 100) / 100 };
        }
        if ((i + 1) % 12 === 0) ds.push(Math.round(d() * 100) / 100);
      });
      // (every 0.1 s: pulled in for 1.5 s, then thrown out at 6 u/s against the 2 u/s pull for 1 s)
      const dAt = (s) => ds[Math.round(s * 10) - 1];
      out.fling = { before: Math.max(...ds.slice(0, 14)), run: Math.round((dAt(2.5) - dAt(1.5)) * 100) / 100, ds, whoosh: T.pops().includes('WHOOSH!') };
      // a burning ship in the core: the fire goes out
      G.specials.setLoads({ fire: 9, frost: 9, stink: 9 });
      G.combat.setAmmo('fire');
      G.place(p, at.x + 30, at.z + 30);
      const e = T.spawn('privateer', 18, 0, 0);
      T.volley(e);
      out.burning = G.specials.status(e).id;
      G.place(e, at.x, at.z);
      T.watchPops();
      T.steps(0.3, () => {
        e.reload.port = e.reload.star = 99;
        p.speed = 0;
      });
      out.doused = { st: G.specials.status(e).id, burn: e.burnTicks, pops: T.pops().filter((t) => /FIRE OUT/.test(t)) };
      return out;
    }));
    check(sp.v0.state === 'forming' && sp.v0.T >= 3 && sp.forming.lasted !== null && sp.forming.lasted >= 2.95 && sp.forming.moved < 1e-6 && sp.forming.hurt === 0,
      `atolls: a waterspout forms for 3 s (≥ 1.5 s of warning) and is harmless meanwhile: nothing pulled, nothing hurt (${J({ v0: sp.v0, forming: sp.forming })})`);
    check(sp.drawn.calls > sp.drawn.calls0 && /Waterspout! Keep clear of the twister/.test(sp.drawn.tip) && sp.drawn.spoutSound,
      `atolls: a forming spout is drawn (${sp.drawn.calls0} -> ${sp.drawn.calls} draw calls), whistles, and the first says "${sp.drawn.tip}"`);
    check(near(sp.pull, 2, 0.15) && sp.core && sp.core.lost >= 4 && sp.core.lost <= 6 && near(sp.core.spin, 2.8, 0.2) && sp.fling.before <= 2.05 && sp.fling.run >= 3.5 && sp.fling.whoosh,
      `atolls: its swirl pulls you in at ${sp.pull} u/s; in its core you spin (${sp.core && sp.core.spin} rad in 1.4 s) and lose 4 hp a second (${sp.core && sp.core.lost}), and after 1.5 s you are flung out (${sp.fling.run} u in the next second), WHOOSH! (${J({ before: sp.fling.before, ds: sp.fling.ds })})`);
    check(sp.burning === 'fire' && sp.doused.st === null && sp.doused.burn === 0 && sp.doused.pops.length >= 1,
      `atolls: a burning ship in a waterspout's core: the fire goes out (${J(sp.doused)})`);

    // A Shark Raider charges: with you ahead of her bow she winds up for 1.5 s (RAM! chevrons on her tag, "RAM!",
    // her growl, the first time a tip), then surges; her bow in your hull: you take 10, she takes 8, CRUNCH!.
    const ram = await ev(ap, async () => {
      const G = window.__game;
      const p = T.level(7);
      // she sits 20 u ahead of you, her bow on you
      const e = G.spawn('shark', p.x + Math.sin(p.h) * 20, p.z + Math.cos(p.h) * 20, p.h + Math.PI);
      e.rise = 0;
      e.speed = 0;
      e.reload.port = e.reload.star = 99;
      // (no charge in the level's first seconds, its grace: she is held where she is till it is nearly over)
      T.steps(G.LEVELS[6].grace - 0.1, T.pinner(p, e));
      T.watchPops();
      window.__sounds.length = 0;
      const out = {};
      const hp0 = p.hp;
      const eh0 = e.hp;
      const look = () => {
        const r = G.mechanics3.visuals().rams.find((x) => x.id === e.id);
        return r ? r.state : 'none';
      };
      const quiet = () => {
        p.speed = 0;
        e.reload.port = e.reload.star = 99;
      };
      let windAt = null;
      let surgeAt = null;
      let hitAt = null;
      // stepped till she winds up, then real frames for a moment (her tag, the tip), then stepped to the hit
      T.steps(2, () => {
        quiet();
        if (look() !== 'windup') return true;
        windAt = G.state.time;
        return false;
      });
      await T.play(0.3, quiet);
      G.state.mode = 'playing';
      out.state = look();
      out.icon = (G.tagInfo(e) || {}).icon;
      out.tip = T.shown('hint') ? T.text('hint') : '';
      let hpBefore = p.hp;
      T.steps(5, () => {
        quiet();
        if (look() === 'surge' && surgeAt === null) surgeAt = G.state.time;
        if (p.hp < hpBefore - 0.5 && hitAt === null) hitAt = G.state.time;
        hpBefore = p.hp;
        return hitAt === null;
      });
      out.windup = windAt !== null && surgeAt !== null ? Math.round((surgeAt - windAt) * 1000) / 1000 : null;
      out.hit = hitAt !== null;
      out.took = Math.round((hp0 - p.hp) * 100) / 100;
      out.she = Math.round((eh0 - e.hp) * 100) / 100;
      out.pops = T.pops().filter((t) => /RAM|CRUNCH/.test(t));
      out.growl = window.__sounds.includes('ram');
      return out;
    });
    check(ram.windup !== null && ram.windup >= 1.5 - 1e-6 && ram.state === 'windup' && ram.icon === 'ram' && ram.pops.includes('RAM!') && ram.growl && /RAM! Turn away from her bow!/.test(ram.tip || ''),
      `atolls: a Shark Raider winds up for ${ram.windup} s before she surges (≥ 1.5), with RAM! chevrons on her tag, "RAM!", her growl and the tip "${ram.tip}"`);
    check(ram.hit && ram.took === 10 && ram.she === 8 && ram.pops.includes('CRUNCH!'),
      `atolls: her charge at full speed: you take ${ram.took}, she takes ${ram.she}, CRUNCH! (${J(ram.pops)})`);

    // Powder crates: two on the level at its first crate spots; sail into one for +1 load of the special you own with
    // the fewest ("+1 FROST SHOT!"), or 20 gold with none owned.
    const crates = await ev(ap, () => {
      const G = window.__game;
      const p = T.level(7);
      const list = G.specials.crates;
      const spots = G.env.crateSpots.slice(0, 2).map((s) => [Math.round(s.x * 10) / 10, Math.round(s.z * 10) / 10]);
      const at = list.map((c) => [Math.round(c.x * 10) / 10, Math.round(c.z * 10) / 10]);
      G.specials.setLoads({ fire: 4, frost: 2, stink: 3 });
      T.watchPops();
      const c0 = list[0];
      G.place(p, c0.x, c0.z);
      T.steps(0.1, () => (p.speed = 0));
      const first = { loads: G.specials.loads, taken: G.specials.crates[0].taken, pops: T.pops().filter((t) => /SHOT|gold/.test(t)) };
      G.specials.setPowder({ v: 1, own: { fire: 0, frost: 0, stink: 0 } });
      const gold = G.state.gold;
      const c1 = list[1];
      G.place(p, c1.x, c1.z);
      T.steps(0.1, () => (p.speed = 0));
      const second = { gold: G.state.gold - gold, taken: G.specials.crates[1].taken };
      G.specials.setPowder({ v: 1, own: { fire: 1, frost: 1, stink: 1 } });
      return { n: list.length, spots, at, first, second };
    });
    check(crates.n === 2 && J(crates.at) === J(crates.spots) && J(crates.first.loads) === '{"fire":4,"frost":3,"stink":3}' && crates.first.taken && crates.first.pops.includes('+1 FROST SHOT!') && crates.second.gold === 20 && crates.second.taken,
      `atolls: two powder crates at the first crate spots; one gives +1 of the special with the fewest loads ("+1 FROST SHOT!"), one with no recipe owned 20 gold (${J(crates)})`);
    await ctx.close();
  });

  // --------------------------------------------------- level 8: rogue waves, fire ships, the Bomb Ketch's mortar
  await section('cape', async () => {
    const { ctx, page: cp } = await open({ label: 'cape', store: { ...STORE, 'pirates-ahoy-tips': String(65535 & ~(2048 | 4096 | 8192)) } });
    await cp.evaluate(() => {
      const a = window.__game.audio;
      const play = a.play;
      window.__sounds = [];
      a.play = function (name, ...rest) {
        window.__sounds.push(name);
        return play.call(this, name, ...rest);
      };
    });
    // A rogue wave: 4 s of warning (the conch horn, the WAVE! arrow at the screen's edge, the first time a banner
    // and a tip), then the crest: side-on 10 damage and a push ("SPLASH!"), bow into it nothing ("RODE IT!"), stern
    // to it a surf (+2 to your speed cap, "SURF'S UP!"); and it puts a fire out.
    // (the warning is photographed while the side-on ride waits: cape-rogue.png)
    const shooter = (async () => {
      await cp.waitForFunction(() => window.__shotNow === true, null, { timeout: 120000 });
      await snap(cp, 'cape-rogue.png');
      await cp.evaluate(() => {
        window.__shotNow = false;
      });
    })();
    const rogue = await ev(cp, async () => {
      const G = window.__game;
      const out = {};
      const ride = async (name, turn, look, into = out) => {
        const p = T.level(8);
        const from = p.h + turn; // the wave comes from that bearing: your heading + turn
        window.__sounds.length = 0;
        T.watchPops();
        const v = G.mechanics3.wave(from);
        const r = { warn: v && v.warn, warning: v && v.warning };
        if (look) {
          await T.play(0.6, () => (G.player.speed = 0));
          G.state.mode = 'playing';
          r.arrow = T.shown('edge-arrow') && /WAVE!/.test(T.text('edge-arrow'));
          r.banner = T.shown('banner') ? T.text('banner') : '';
          r.tip = T.shown('hint') ? T.text('hint') : '';
          r.horn = window.__sounds.includes('horn');
          G.state.mode = 'paused'; // (frozen while it is photographed)
          window.__shotNow = true;
          while (window.__shotNow) await new Promise((res) => setTimeout(res, 50));
          G.state.mode = 'playing';
        }
        const hp0 = p.hp;
        let minHp = p.hp;
        const x0 = p.x;
        const z0 = p.z;
        let cap = 0;
        let passed = null;
        const t0 = G.state.time;
        T.steps(7, () => {
          p.speed = 0;
          minHp = Math.min(minHp, p.hp);
          cap = Math.max(cap, G.combat.effects(p).speedCap);
          const w = G.mechanics3.visuals().rogue;
          if (passed === null && w && w.ahead !== undefined && w.ahead < 0) passed = G.state.time - t0;
        });
        r.took = Math.round((hp0 - minHp) * 100) / 100;
        r.moved = Math.round(Math.hypot(p.x - x0, p.z - z0) * 10) / 10;
        r.cap = Math.round(cap * 100) / 100;
        r.base = p.type.maxSpeed;
        r.pops = T.pops().filter((t) => /SPLASH|RODE|SURF/.test(t));
        into[name] = r;
      };
      window.__ride = ride;
      await ride('side', Math.PI / 2, true);
      return out;
    });
    Object.assign(rogue, await ev(cp, async () => {
      const G = window.__game;
      const out = {};
      const ride = window.__ride;
      await ride('bow', 0, false, out);
      await ride('stern', Math.PI, false, out);
      // a burning pirate side-on to a wave: her fire goes out
      const p = T.level(8);
      G.specials.setLoads({ fire: 9, frost: 9, stink: 9 });
      G.combat.setAmmo('fire');
      const e = T.spawn('privateer', 18, 0, 0);
      T.volley(e);
      out.burning = G.specials.status(e).id;
      T.watchPops();
      G.mechanics3.wave(e.h + Math.PI / 2);
      const hold = T.pinner(p, e);
      T.steps(5.5, hold);
      out.doused = { st: G.specials.status(e).id, burn: e.burnTicks, pops: T.pops().filter((t) => /FIRE OUT/.test(t)) };
      return out;
    }));
    await shooter;
    check(rogue.side.warn >= 4 && rogue.side.warning === true && rogue.side.arrow && /ROGUE WAVE!/.test(rogue.side.banner) && /ROGUE WAVE! Turn your bow or stern to it/.test(rogue.side.tip) && rogue.side.horn,
      `cape: a rogue wave is warned of for ${rogue.side.warn} s (≥ 1.5): the conch horn, the WAVE! arrow at the screen's edge, the banner and the tip (${J({ arrow: rogue.side.arrow, banner: rogue.side.banner, tip: rogue.side.tip })})`);
    check(rogue.side.took === 10 && rogue.side.moved >= 4 && rogue.side.pops.includes('SPLASH!') && rogue.bow.took === 0 && rogue.bow.pops.includes('RODE IT!') && rogue.stern.took === 0 && rogue.stern.pops.includes("SURF'S UP!") && near(rogue.stern.cap, rogue.stern.base + 2, 0.01),
      `cape: side-on the crest hits for 10 and pushes you ${rogue.side.moved} u (SPLASH!); bow into it: nothing (RODE IT!); stern to it: a surf, your cap ${rogue.stern.cap} (SURF'S UP!) (${J({ side: rogue.side.pops, bow: rogue.bow, stern: rogue.stern })})`);
    check(rogue.burning === 'fire' && rogue.doused.st === null && rogue.doused.burn === 0 && rogue.doused.pops.length >= 1,
      `cape: a rogue wave puts out a burning ship's fire (${J(rogue.doused)})`);

    // A fire ship: within 30 u she is lit (flames up her rigging, a red ring, her fuse hisses, the first time a banner)
    // and armed 1.6 s later; armed within reach of a hull she blows up: 22 at her centre down to 11 at 6 u, to every
    // ship. Sunk while lit she blows up where she is (no coins); sunk before, she sinks with her coins.
    const fire = await ev(cp, async () => {
      const G = window.__game;
      const out = {};
      let p = T.level(8);
      window.__sounds.length = 0;
      const e = G.spawn('fireship', p.x + Math.sin(p.h) * 34, p.z + Math.cos(p.h) * 34, p.h + Math.PI);
      e.rise = 0;
      e.speed = 0;
      const hp0 = p.hp;
      let litAt = null;
      let boomAt = null;
      let fuse = false;
      G.state.mode = 'playing';
      const t0 = G.state.time;
      while (G.state.time - t0 < 14 && boomAt === null) {
        await new Promise((r) => requestAnimationFrame(r));
        p.speed = 0;
        const ring = G.mechanics3.visuals().fireRings.find((r) => r.id === e.id);
        if (ring && litAt === null) {
          litAt = G.state.time;
          out.banner = T.shown('banner') ? T.text('banner') : '';
        }
        if (ring && e.mesh.userData.fuse && e.mesh.userData.fuse.lit) fuse = true;
        if (litAt !== null && !out.icon) out.icon = (G.tagInfo(e) || {}).icon;
        if ((e.exploded || e.hp <= 0) && boomAt === null) boomAt = G.state.time;
      }
      G.state.mode = 'playing';
      out.lit = litAt !== null;
      out.warned = litAt !== null && boomAt !== null ? Math.round((boomAt - litAt) * 100) / 100 : null;
      out.exploded = !!e.exploded;
      out.took = Math.round((hp0 - p.hp) * 100) / 100;
      out.fuse = fuse;
      out.hiss = window.__sounds.includes('fuse');
      out.blast = window.__sounds.includes('blast');
      // sunk while lit: she blows up where she is, no coins; a ship beside her is hurt
      p = T.level(8);
      const lit = G.spawn('fireship', p.x + Math.sin(p.h) * 24, p.z + Math.cos(p.h) * 24, p.h);
      lit.rise = 0;
      lit.speed = 0;
      const near = T.spawn('privateer', 5, 24, 0);
      const holdL = T.pinner(p, lit, near);
      T.steps(G.LEVELS[7].grace + 0.4, holdL); // (lit once the level's grace is over)
      const nearHp = near.hp;
      out.sunkLit = { ring: G.mechanics3.visuals().fireRings.some((r) => r.id === lit.id) };
      G.damage(lit, 999);
      T.steps(0.2, holdL);
      out.sunkLit.exploded = !!lit.exploded;
      out.sunkLit.hurt = Math.round((nearHp - near.hp) * 100) / 100;
      out.sunkLit.coins = G.coins.filter((c) => c.from === lit.id).length;
      // sunk far off, never lit: she sinks with her coins
      const far = G.spawn('fireship', p.x - Math.sin(p.h) * 60, p.z - Math.cos(p.h) * 60, p.h);
      far.rise = 0;
      far.speed = 0;
      T.steps(0.2, T.pinner(p, far));
      G.damage(far, 999);
      out.sunkFar = { exploded: !!far.exploded, coins: G.coins.filter((c) => c.from === far.id).length, gold: far.type.gold };
      return out;
    });
    check(fire.lit && fire.warned !== null && fire.warned >= 1.6 && fire.fuse && fire.icon === 'hot' && fire.hiss && /Fire ship!/.test(fire.banner || ''),
      `cape: a fire ship is lit (flames, her ring, the hiss of her fuse, "${fire.banner}") ${fire.warned} s before she blows (≥ 1.6)`);
    check(fire.exploded && fire.blast && fire.took >= 11 && fire.took <= 22,
      `cape: armed beside your hull she blows up: you take ${fire.took} (11 to 22) (${J({ exploded: fire.exploded, blast: fire.blast })})`);
    check(fire.sunkLit.ring && fire.sunkLit.exploded && fire.sunkLit.coins === 0 && fire.sunkLit.hurt >= 11 && fire.sunkFar.exploded === false && fire.sunkFar.coins === fire.sunkFar.gold,
      `cape: sunk while lit she blows up where she is (a ship beside her takes ${fire.sunkLit.hurt}, no coins); sunk before she is lit she sinks with her ${fire.sunkFar.coins} coins (${J(fire)})`);

    // The Bomb Ketch's mortar: from 25-48 u she lobs a shell at where you will be: an orange ring (4.5 u) for 2.2 s
    // (≥ 1.5 s), a deep thoomp, the first time a banner; 12 damage to a ship inside, none outside.
    const mortar = await ev(cp, async () => {
      const G = window.__game;
      const p = T.level(8);
      window.__sounds.length = 0;
      const k = G.spawn('bombketch', p.x - Math.cos(p.h) * 38, p.z + Math.sin(p.h) * 38, p.h);
      k.rise = 0;
      k.speed = 0;
      const out = {};
      let shell = null;
      const hold = T.pinner(p, k);
      G.state.mode = 'playing';
      const t0 = G.state.time;
      while (G.state.time - t0 < 12 && !shell) {
        await new Promise((r) => requestAnimationFrame(r));
        hold();
        shell = G.bombs.find((b) => b.kind === 'shell') || null;
      }
      G.state.mode = 'playing';
      if (!shell) return { shell: null };
      out.shell = { T: Math.round(shell.T * 100) / 100, radius: shell.radius, damage: shell.damage, dist: Math.round(Math.hypot(shell.tx - p.x, shell.tz - p.z) * 10) / 10 };
      out.banner = T.shown('banner') ? T.text('banner') : '';
      out.thoomp = window.__sounds.includes('mortar');
      // you sit right on its spot: 12 damage
      G.place(p, shell.tx, shell.tz);
      const hp0 = p.hp;
      T.steps(shell.T - shell.t + 0.1, () => (p.speed = 0));
      out.inside = Math.round((hp0 - p.hp) * 100) / 100;
      return out;
    });
    check(mortar.shell && mortar.shell.T >= 2.2 && mortar.shell.radius === 4.5 && mortar.shell.damage === 12 && mortar.thoomp && /Mortar shell!/.test(mortar.banner || '') && mortar.inside === 12,
      `cape: a Bomb Ketch lobs a mortar shell: a ${mortar.shell && mortar.shell.radius} u ring for ${mortar.shell && mortar.shell.T} s (≥ 1.5), a thoomp, "${mortar.banner}"; on its spot you take ${mortar.inside} (${J(mortar)})`);
    await ctx.close();
  });

  // ------------------------------------------- level 9 before the rise: sea geysers, ink pots, skiffs, the fall
  await section('deep', async () => {
    const { ctx, page: dp } = await open({ label: 'deep' });
    await dp.evaluate(() => {
      const a = window.__game.audio;
      const play = a.play;
      window.__sounds = [];
      a.play = function (name, ...rest) {
        window.__sounds.push(name);
        return play.call(this, name, ...rest);
      };
    });
    // The Kraken's Deep's own bombs are sea geysers (def.bombs): out of the sea, no projectile, a bubbling ring of
    // 4.5 u for 1.8-2.2 s (≥ 1.5), the geyser's sound from the warning on, the first time a banner; then a white
    // column: 10 damage to a ship inside (she bobs up on it, a look only), none to one just outside.
    const gey = await ev(dp, async () => {
      const G = window.__game;
      const r2 = (v) => Math.round(v * 100) / 100;
      const p = T.level(9);
      window.__sounds.length = 0;
      const hold = T.pinner(p);
      hold();
      G.state.nextBomb = G.state.combatTime; // (due now)
      let b = null;
      T.steps(0.5, () => {
        hold();
        b = G.bombs.find((x) => x.kind === 'geyser') || null;
        return !b;
      });
      if (!b) return { b: null };
      G.state.nextBomb = Infinity; // (no more for now)
      const out = { b: { T: r2(b.T), radius: b.radius, damage: b.damage, mesh: b.mesh || null }, sound: window.__sounds.includes('geyser') };
      out.banner = T.shown('banner') ? T.text('banner') : '';
      // you sit on it; a privateer 3 u outside its ring
      G.place(p, b.tx, b.tz);
      const by = T.spawn('privateer', 0, 0, 0);
      G.place(by, b.tx + b.radius + 3, b.tz);
      const hold2 = T.pinner(p, by);
      hold2();
      const by0 = by.hp;
      // (what hurt you, by source: your hull regrows meanwhile)
      const hurt0 = { ...G.state.hurtBy };
      T.steps(b.T - b.t + 0.1, hold2);
      out.by = Object.fromEntries(Object.entries(G.state.hurtBy).map(([k, v]) => [k, r2(v - (hurt0[k] || 0))]).filter(([, v]) => v));
      out.took = out.by.geyser || 0;
      out.outside = r2(by0 - by.hp);
      out.lift = typeof p.liftAt === 'number';
      return out;
    });
    check(gey.b && gey.b.T >= 1.8 - 1e-9 && gey.b.T <= 2.2 + 1e-9 && gey.b.radius === 4.5 && gey.b.damage === 10 && gey.b.mesh === null && gey.sound && /Sea geyser!/.test(gey.banner),
      `deep: the Deep's bombs are sea geysers: no projectile, a ${gey.b && gey.b.radius} u bubbling ring for ${gey.b && gey.b.T} s (≥ 1.5), its sound from the warning, "${gey.banner}" (${J(gey.b)})`);
    check(gey.took === 10 && Object.keys(gey.by).length === 1 && gey.outside === 0 && gey.lift, `deep: a geyser bursting under you does ${gey.took} damage and bobs you up; a ship 3 u outside its ring takes ${gey.outside} (${J(gey)})`);

    // The Inkheart lobs 2 ink pots every 10 s at where you will be: violet rings of 4 u for 1.8 s (≥ 1.5), the ink
    // sound, "Ink pots! Keep moving." read out; 8 damage to a ship inside, and each leaves an ink slick (7 u, 6 s)
    // that cuts the speed cap of a ship in it to 0.6 ×.
    // (#game-live says one thing every 1.5 s of real time: let what the geysers said go first)
    await dp.waitForTimeout(1700);
    await frames(dp, 2);
    await dp.waitForTimeout(1700);
    const ink = await ev(dp, async () => {
      const G = window.__game;
      const r2 = (v) => Math.round(v * 100) / 100;
      const p = T.level(9);
      G.state.nextBomb = Infinity;
      window.__sounds.length = 0;
      const e = T.spawn('inkheart', 26, 0, 0);
      const hold = T.pinner(p, e);
      hold();
      let pots = [];
      const n = T.steps(13, () => {
        hold();
        pots = G.bombs.filter((b) => b.kind === 'ink');
        return pots.length === 0;
      });
      if (!pots.length) return { pots: 0 };
      const out = {
        after: r2(n / 120),
        pots: pots.length,
        each: pots.map((b) => ({ T: r2(b.T), radius: b.radius, damage: b.damage })),
        sound: window.__sounds.includes('ink'),
        live: T.text('game-live'),
      };
      // you sit on the first pot's spot (a pot whose ring also covers it hurts too)
      const at = pots[0];
      const inside = pots.filter((b) => Math.hypot(b.tx - at.tx, b.tz - at.tz) < b.radius).length;
      G.place(p, at.tx, at.tz);
      // (what hurt you, by source: your hull regrows meanwhile)
      const hurt0 = { ...G.state.hurtBy };
      const hold2 = T.pinner(p, e);
      T.steps(Math.max(...pots.map((b) => b.T - b.t)) + 0.1, hold2);
      out.by = Object.fromEntries(Object.entries(G.state.hurtBy).map(([k, v]) => [k, r2(v - (hurt0[k] || 0))]).filter(([, v]) => v));
      out.took = out.by.ink || 0;
      out.want = 8 * inside;
      const slicks = G.mechanics3.visuals().slicks || [];
      out.slicks = slicks.length;
      out.slickAt = slicks.some((s) => Math.hypot(s.x - at.tx, s.z - at.tz) < 0.5 && s.r === 7);
      // her top speed in the slick and out of it (full sail, held where she is, 3 s each)
      // (from a stop until her speed settles: 0.25 s with no change)
      const capAt = (x, z, most) => {
        G.state.sail = 3;
        p.speed = 0;
        let last = -1;
        let still = 0;
        T.steps(most, () => {
          p.x = x;
          p.z = z;
          e.speed = 0;
          e.reload.port = e.reload.star = 99;
          still = Math.abs(p.speed - last) < 1e-4 ? still + 1 : 0;
          last = p.speed;
          return still < 30;
        });
        return p.speed;
      };
      const inSlick = capAt(at.tx, at.tz, 5.5);
      const away = { x: at.tx + Math.sin(p.h) * 40, z: at.tz + Math.cos(p.h) * 40 };
      const outSlick = capAt(away.x, away.z, 8);
      G.state.sail = 0;
      out.speed = { inSlick: r2(inSlick), outSlick: r2(outSlick), ratio: r2(inSlick / outSlick) };
      return out;
    });
    check(ink.pots === 2 && ink.after <= 10.6 && ink.each.every((b) => b.T >= 1.8 - 1e-9 && b.radius === 4 && b.damage === 8) && ink.sound && /Ink pots! Keep moving\./.test(ink.live),
      `deep: the Inkheart lobs ${ink.pots} ink pots ${ink.after} s after she joins: ${ink.each && ink.each[0] && ink.each[0].radius} u rings for ${ink.each && ink.each[0] && ink.each[0].T} s (≥ 1.5), the ink sound, "${ink.live}" (${J(ink.each)})`);
    check(ink.took === ink.want && ink.want >= 8 && Object.keys(ink.by).length === 1 && ink.slickAt && ink.speed && near(ink.speed.ratio, 0.6, 0.03),
      `deep: an ink pot on you does ${ink.took} (8 a pot) and leaves a 7 u slick that holds your top speed to ${ink.speed && ink.speed.ratio} × (0.6) (${J(ink)})`);

    // A Squid Skiff alongside throws her hooks by herself once the grace period is over: you are boarded.
    const skiff = await ev(dp, () => {
      const G = window.__game;
      const p = T.level(9);
      G.state.nextBomb = Infinity;
      const e = T.spawn('skiff', 8, 0, 0);
      const hold = T.pinner(p);
      T.steps(6, () => {
        hold();
        return !G.boarding.active;
      });
      const out = { active: G.boarding.active, kind: G.boarding.kind, phase: G.boarding.phase, target: G.boarding.target === e };
      G.boarding.cancel('test');
      return out;
    });
    check(skiff.active && skiff.kind === 'defend' && skiff.phase === 'threat' && skiff.target, `deep: a Squid Skiff alongside hooks you by herself (${J(skiff)})`);

    // The Inkheart falls: the geysers stop for good (those bubbling too), her skiffs flee (out of the fight at once,
    // gone 5 s later) and her ink slicks fade.
    const fall = await ev(dp, () => {
      const G = window.__game;
      const p = T.level(9);
      const e = T.spawn('inkheart', 30, 0, 0);
      const sk = T.spawn('skiff', -14, 0, 0);
      const hold = T.pinner(p);
      G.launchBomb({ kind: 'ink', from: null, tx: p.x + 40, tz: p.z, radius: 4, damage: 8, warn: 0.1 });
      T.steps(0.3, hold);
      G.state.nextBomb = G.state.combatTime;
      T.steps(0.2, hold);
      const before = { geysers: G.bombs.filter((b) => b.kind === 'geyser').length, fighting: G.fighting(sk), slicks: (G.mechanics3.visuals().slicks || []).length };
      // (read at once: with every ship fleeing this test's level is soon cleared, which clears the bombs too)
      G.damage(e, 9999);
      const out = { before, down: G.state.flagshipDown, geysers: G.bombs.filter((b) => b.kind === 'geyser').length, next: G.state.nextBomb === Infinity };
      T.steps(0.1, hold);
      out.fleeing = !!sk.fleeing;
      out.fighting = G.fighting(sk);
      T.steps(6, hold);
      out.later = { geysers: G.bombs.filter((b) => b.kind === 'geyser').length, gone: !!sk.escaped, slicks: (G.mechanics3.visuals().slicks || []).length };
      return out;
    });
    check(fall.before.geysers >= 1 && fall.before.fighting && fall.before.slicks >= 1 && fall.down && fall.geysers === 0 && fall.next === true && fall.fleeing && !fall.fighting && fall.later.geysers === 0 && fall.later.gone && fall.later.slicks === 0,
      `deep: the Inkheart falls: the geysers stop for good (${fall.before.geysers} bubbling -> ${fall.geysers}), her skiff flees out of the fight and is gone, the slicks fade (${J(fall)})`);

    // A geyser's bubbling ring and two ink pots' violet rings beside you, frozen and drawn: deep-hazards.png.
    await dp.evaluate(async () => {
      const G = window.__game;
      const p = T.level(9);
      G.state.nextBomb = Infinity;
      const f = (d, a) => ({ tx: p.x + Math.sin(p.h + a) * d, tz: p.z + Math.cos(p.h + a) * d });
      // (real frames first: the level banner goes)
      await T.play(0.4, () => (p.speed = 0));
      G.launchBomb({ kind: 'geyser', from: null, ...f(15, 0.5), radius: 4.5, damage: 10, warn: 2 });
      G.launchBomb({ kind: 'ink', from: null, ...f(17, -0.55), radius: 4, damage: 8, warn: 1.8 });
      G.launchBomb({ kind: 'ink', from: null, ...f(25, -0.3), radius: 4, damage: 8, warn: 1.8 });
      await T.play(0.8, () => (p.speed = 0));
      G.state.mode = 'paused';
      await T.redraw();
      await T.redraw();
    });
    await snap(dp, 'deep-hazards.png');
    await ctx.close();
  });

  // ---------------------------------------------------------------- the busiest play: draw calls (≤ 450, §14)
  // Each Voyage III level at its busiest, staged in front of you and sampled over real frames, both outline passes,
  // ?quality=low, 1280x720: a wave of 3 and a leftover (4 ships fighting; on level 9, whose second wave never meets
  // its first, the Inkheart joins the first wave), Fire, Frost and Stink on three of them, the level's hazards
  // (3 waterspouts, a rogue wave, ink slicks), warning rings (4, on level 9 6: geysers, ink pots, shells), a powder
  // crate, the land. First all of it in the chase camera's view (1.6 s of play); then a raider boards you with the
  // rest still going (1.6 s more, the boarding camera). Every sampled frame and the settled frame stay within 450
  // draw calls, statusfx within 8. (VOYAGE3_BUSY_LEVELS=7 stages one level only, for a quick look.)
  await section('busy', async () => {
    const { ctx, page: bp } = await openV({ label: 'busy' });
    const busyLevels = (process.env.VOYAGE3_BUSY_LEVELS || '7,8,9').split(',').map(Number).filter((n) => [7, 8, 9].includes(n));
    for (const n of busyLevels.length ? busyLevels : [7, 8, 9]) {
      const b = await ev(bp, async (n) => {
        const G = window.__game;
        const r2 = (v) => Math.round(v * 100) / 100;
        G.state.tutorialDone = true;
        G.newGame(n);
        G.state.intro = 0;
        G.state.bannerTimer = 0;
        G.combat.seed(n);
        G.combat.forceCrit('none');
        const p = G.player;
        T.steps(1);
        // the first wave down to its leftover: the second wave sails in (level 9: the Inkheart joins the first)
        const first = G.enemies.filter(G.fighting);
        if (n === 9) G.spawn('inkheart', p.x + 60, p.z + 60, 0);
        else first.slice(1).forEach((e) => G.damage(e, 9999));
        T.steps(0.2);
        // you, stopped 24 u from the first powder crate and facing it (it sits in your view)
        const c = G.specials.crates[0];
        const away = Math.hypot(c.x, c.z) || 1;
        const ux = c.x / away;
        const uz = c.z / away;
        G.place(p, c.x - ux * 24, c.z - uz * 24, Math.atan2(ux, uz));
        p.speed = 0;
        G.state.sail = 0;
        const fwd = (d, a) => ({ x: p.x + Math.sin(p.h + a) * d, z: p.z + Math.cos(p.h + a) * d });
        const ships = G.enemies.filter(G.fighting);
        // all of them in a fan ahead of you, 20-35 u off
        const spot = (k) => fwd(20 + 5 * k, ships.length > 1 ? -0.5 + (1 * k) / (ships.length - 1) : 0.2);
        // Fire, Frost and Stink on three of them, one volley each, 12 u off your starboard beam, each then sent to
        // its place in the fan (Fire and Frost on the sturdiest that aren't fire ships: a frozen fire ship strikes
        // her colours, a burning skiff can burn to the waterline)
        const statused = [];
        const fireship = (k) => (ships[k].typeName === 'fireship' ? 1 : 0);
        const order = [...ships.keys()].sort((a, b) => fireship(a) - fireship(b) || ships[b].maxHp - ships[a].maxHp);
        const pick = { fire: order[0], frost: order[1], stink: order[2] };
        ['fire', 'frost', 'stink'].forEach((id) => {
          const e = ships[pick[id]];
          if (!e) return;
          const beam = () => {
            G.place(e, p.x - Math.cos(p.h) * 12, p.z + Math.sin(p.h) * 12, p.h);
            e.speed = 0;
            e.reload.port = e.reload.star = 99;
            p.speed = 0;
          };
          beam();
          G.combat.setAmmo(id);
          p.reload.port = p.reload.star = 0;
          G.playerFire(1);
          for (let s = 0; s < 600 && G.balls.some((x) => x.owner === 'player'); s++) {
            beam();
            G.step(1 / 120);
          }
          if (e.status && e.status.id === id) statused.push(id);
          G.place(e, spot(pick[id]).x, spot(pick[id]).z, p.h + Math.PI / 2);
        });
        G.combat.setAmmo('round');
        const hold = (free) => {
          ships.forEach((e, k) => {
            if (e !== free) G.place(e, spot(k).x, spot(k).z, p.h + Math.PI / 2);
            e.speed = 0;
            e.reload.port = e.reload.star = 99;
          });
          p.speed = 0;
        };
        hold();
        // the level's hazards, ahead of you
        if (n === 7) [[38, -0.5], [44, 0.35], [56, 0.05]].forEach(([d, a]) => G.mechanics3.spout(fwd(d, a).x, fwd(d, a).z));
        if (n === 8) G.mechanics3.wave(p.h);
        if (n === 9) [[18, 0.45], [26, -0.35]].forEach(([d, a]) => G.launchBomb({ kind: 'ink', from: null, tx: fwd(d, a).x, tz: fwd(d, a).z, radius: 4, damage: 8, warn: 0.05 }));
        T.steps(0.1, () => hold());
        // warning rings with long warnings, so they stay up while sampled
        const kinds = n === 9 ? ['geyser', 'geyser', 'ink', 'ink', 'shell', 'shell'] : ['shell', 'shell', 'shell', 'shell'];
        kinds.forEach((kind, k) => {
          const at = fwd(14 + 4 * k, -0.6 + 0.24 * k);
          G.launchBomb({ kind, from: null, tx: at.x, tz: at.z, radius: kind === 'ink' ? 4 : 4.5, damage: 1, warn: 9 });
        });
        // what the camera sees (its frustum; ships by their centres, rings by theirs)
        const inView = (x, y, z) => {
          const cam = G.camera;
          cam.updateMatrixWorld();
          const vm = cam.matrixWorldInverse.elements;
          const pm = cam.projectionMatrix.elements;
          const vx = vm[0] * x + vm[4] * y + vm[8] * z + vm[12];
          const vy = vm[1] * x + vm[5] * y + vm[9] * z + vm[13];
          const vz = vm[2] * x + vm[6] * y + vm[10] * z + vm[14];
          const cx = pm[0] * vx + pm[4] * vy + pm[8] * vz + pm[12];
          const cy = pm[1] * vx + pm[5] * vy + pm[9] * vz + pm[13];
          const cw = pm[3] * vx + pm[7] * vy + pm[11] * vz + pm[15];
          return cw > 0 && Math.abs(cx / cw) <= 1 && Math.abs(cy / cw) <= 1;
        };
        // real frames for 1.6 s of game time with `each` after every frame: the draw calls of every frame
        const sample = async (each) => {
          const calls = [];
          let fx = 0;
          const mode = G.state.mode;
          G.state.mode = 'playing';
          const t0 = G.state.time;
          for (let i = 0; i < 300 && G.state.time - t0 < 1.6; i++) {
            await new Promise((r) => requestAnimationFrame(r));
            each();
            calls.push(G.renderInfo.calls);
            const f = G.specials.fx();
            if (f && f.calls > fx) fx = f.calls;
          }
          G.state.mode = mode;
          return { frames: calls.length, max: Math.max(...calls), min: Math.min(...calls), fx, t: r2(G.state.time - t0) };
        };
        const scene = () => {
          const vis = G.mechanics3.visuals();
          const crate = G.specials.crates[0];
          const up = G.bombs.filter((x) => x.t < x.T);
          return {
            fighting: G.enemies.filter(G.fighting).length,
            inView: G.enemies.filter((e) => G.fighting(e) && inView(e.x, 1, e.z)).length,
            statuses: G.enemies.filter((e) => G.fighting(e) && e.status && e.status.id).map((e) => e.status.id),
            rings: up.length,
            ringsInView: up.filter((x) => inView(x.tx, 0, x.tz)).length,
            spouts: (vis.spouts || []).length,
            rogue: !!vis.rogue,
            slicks: (vis.slicks || []).length,
            crate: !!crate && !crate.taken && inView(crate.x, 0.5, crate.z),
            boarding: G.boarding.active ? G.boarding.phase : null,
            land: G.colliders.length,
          };
        };
        // 1. everything in the chase camera's view
        const a = await sample(() => hold());
        const sa = scene();
        G.state.mode = 'paused';
        await T.redraw();
        await T.redraw();
        a.settled = G.renderInfo.calls;
        sa.settled = a.settled;
        // 2. the last of them comes alongside to port and boards you; the rest goes on
        const raider = ships[ships.length - 1];
        G.place(raider, p.x + Math.cos(p.h) * 7, p.z - Math.sin(p.h) * 7, p.h);
        raider.speed = 0;
        const raided = G.boarding.raid(raider);
        const bb = await sample(() => hold(raider));
        const sb = scene();
        return { n, statused, a, sa, raided, bb, sb };
      }, n);
      await snap(bp, `busy-${n}.png`);
      const { a, sa, bb, sb } = b;
      const hazard = n === 7 ? sa.spouts >= 3 : n === 8 ? sa.rogue : sa.slicks >= 2;
      const rings = n === 9 ? 6 : 4;
      check(sa.fighting >= 4 && sa.inView >= 4 && b.statused.length === 3 && sa.statuses.length >= 3 && sa.ringsInView >= rings && hazard && sa.crate && sa.land > 0,
        `busy: level ${n} at its busiest, all in view: ${sa.inView} of ${sa.fighting} ships fighting, Fire, Frost and Stink on three (${sa.statuses.join(', ')}), ${sa.ringsInView} warning rings, ${n === 7 ? `${sa.spouts} waterspouts` : n === 8 ? 'a rogue wave' : `${sa.slicks} ink slicks`}, a powder crate, ${sa.land} pieces of land (${J({ statused: b.statused, ...sa })})`);
      check(a.frames >= 5 && a.max > 0 && a.max <= 450 && a.settled > 0 && a.settled <= 450 && a.fx > 0 && a.fx <= 8,
        `busy: level ${n}'s busiest play in view draws ${a.min}-${a.max} calls over ${a.frames} frames, ${a.settled} settled (≤ 450), statusfx ${a.fx} (≤ 8)`);
      check(b.raided && !!sb.boarding && sb.fighting >= 4 && sb.statuses.length >= 2 && sb.rings >= rings && bb.frames >= 5 && bb.max > 0 && bb.max <= 450 && bb.fx <= 8,
        `busy: level ${n} with a raider boarding you (${sb.boarding}) and the rest going on draws ${bb.min}-${bb.max} calls over ${bb.frames} frames (≤ 450), statusfx ${bb.fx} (${J({ bb, ...sb })})`);
    }
    await closeV(ctx);
  });

  // ------------------------------------------------------------------------------- the finale: the Kraken (§5.7)
  // In-page helpers for level 9's finale, added to window.T: keys, a sound log, the Inkheart's fall by the level's
  // own waves, the dread and the rise stepped through, the fight's state (G.kraken.state, kraken.js's snapshot).
  function installFinale() {
    const G = window.__game;
    const T = window.T;
    const r2 = (v) => Math.round(v * 100) / 100;
    T.key = (key, code, { type = 'keydown', repeat = false } = {}) => window.dispatchEvent(new KeyboardEvent(type, { key, code, repeat, bubbles: true, cancelable: true }));
    // every sound played from now on: { name, t (game time), dur (the warning's, when told) }
    if (!T.soundLog) {
      T.soundLog = [];
      const a = G.audio;
      const play = a.play;
      a.play = function (name, ...rest) {
        const o = rest.find((v) => v && typeof v === 'object' && 'duration' in v);
        T.soundLog.push({ name, t: r2(G.state.time), dur: o ? o.duration : null });
        return play.call(this, name, ...rest);
      };
      for (const fn of ['setScene', 'setMusicPhase']) {
        const f = a[fn];
        if (typeof f !== 'function') continue;
        a[fn] = function (v, ...rest) {
          T.soundLog.push({ name: `${fn}:${v}`, t: r2(G.state.time) });
          return f.call(this, v, ...rest);
        };
      }
    }
    T.k = () => G.kraken.state;
    T.banner = () => (T.shown('banner') ? T.text('banner') : '');
    // Level 9 by its own waves: the first wave sunk, the second (the Inkheart and a Squid Skiff) brought up beside
    // you and held there, your hull full. → { p, ink, skiff }
    T.toInkheart = () => {
      const p = T.level(9);
      G.state.nextBomb = Infinity;
      G.enemies.filter(G.fighting).forEach((e) => G.damage(e, 9999));
      T.steps(4, () => G.state.wave < 1);
      const ink = G.enemies.find((e) => G.fighting(e) && e.typeName === 'inkheart');
      const skiff = G.enemies.find((e) => G.fighting(e) && e.typeName === 'skiff');
      const rx = -Math.cos(p.h);
      const rz = Math.sin(p.h);
      for (const [e, lat] of [[ink, 30], [skiff, -22]]) {
        if (!e) continue;
        e.rise = 0;
        G.place(e, p.x + rx * lat, p.z + rz * lat, p.h);
        e.speed = 0;
        e.reload.port = e.reload.star = 99;
      }
      p.hp = p.maxHp;
      return { p, ink, skiff };
    };
    // Stepped (you held still) until `until()` or `most` s: the seconds taken.
    T.stepUntil = (until, most, each) => {
      const p = G.player;
      const t0 = G.state.time;
      const n = Math.round(most * 120);
      for (let i = 0; i < n; i++) {
        if (until()) break;
        p.speed = 0;
        if (each) each();
        G.step(1 / 120);
      }
      return r2(G.state.time - t0);
    };
    // Level 9 straight to the fight (G.kraken.rise(): her crew gone at once, the rise), the rise skipped by a key,
    // your hull full. → the fight's first state
    T.toFight = () => {
      const p = T.level(9);
      G.state.nextBomb = Infinity;
      p.hp = p.maxHp;
      if (!G.kraken.rise()) return null;
      T.steps(0.1);
      T.key('x', 'KeyX');
      T.key('x', 'KeyX', { type: 'keyup' });
      T.stepUntil(() => T.k() && !T.k().rising, 8);
      return T.k();
    };
    // Each step's change of what hurt you, by source (your hull regrows, so it is read from state.hurtBy).
    T.hurtWatch = () => {
      let last = { ...G.state.hurtBy };
      return () => {
        const now = G.state.hurtBy;
        const d = {};
        for (const [k, v] of Object.entries(now)) if (v - (last[k] || 0) > 1e-9) d[k] = Math.round((v - (last[k] || 0)) * 1000) / 1000;
        last = { ...now };
        return d;
      };
    };
  }

  // The Inkheart falls → her crew flee (no loot, no feat) and the geysers stop → once her crew are gone, 4 s of
  // dread (the sea darkens, the drone, your crew patches the hull and 3 more hands come aboard) → THE KRAKEN RISES!
  // (6 s, any key skips it; the checkpoint is taken). The rise waits for a boarding to play out its result.
  await section('kraken-rise', async () => {
    const { ctx, page: kp } = await openV({ label: 'kraken-rise' });
    await kp.evaluate(installFinale);
    const seq = await ev(kp, async () => {
      const G = window.__game;
      const r2 = (v) => Math.round(v * 100) / 100;
      const { p, ink, skiff } = T.toInkheart();
      const out = { ink: !!ink, skiff: !!skiff };
      if (!ink || !skiff) return out;
      // (some damage to patch, some hands short)
      p.hp = Math.round(p.maxHp * 0.5);
      G.state.crew = G.state.crewMax - 5;
      const crew0 = G.state.crew;
      const hp0 = p.hp;
      const gold0 = G.state.gold;
      const feats0 = JSON.stringify(G.feats);
      G.state.nextBomb = G.state.combatTime;
      T.steps(0.1);
      const geysers = G.bombs.filter((b) => b.kind === 'geyser').length;
      T.soundLog.length = 0;
      G.damage(ink, 9999);
      const tFall = G.state.time;
      out.fall = { geysers, after: G.bombs.filter((b) => b.kind === 'geyser').length, next: G.state.nextBomb, fleeing: !!skiff.fleeing, fighting: G.fighting(skiff), kraken: T.k() ? T.k().mode : null };
      let tGone = null;
      let tDread = null;
      let tRise = null;
      let dreadBanner = '';
      let hpAtDread = null;
      let crewAtDread = null;
      T.stepUntil(() => tRise !== null, 20, () => {
        if (tGone === null && skiff.escaped) tGone = G.state.time;
        if (tDread === null && T.soundLog.some((x) => x.name === 'setScene:kraken')) {
          tDread = G.state.time;
          dreadBanner = T.banner();
          hpAtDread = p.hp;
          crewAtDread = G.state.crew;
        }
        if (tRise === null && T.k() && T.k().rising) tRise = G.state.time;
        p.hp = Math.max(p.hp, hpAtDread || 0); // (nothing hurts you meanwhile)
      });
      const k = T.k();
      out.times = { gone: tGone === null ? null : r2(tGone - tFall), dread: tDread === null ? null : r2(tDread - tFall), rise: tRise === null ? null : r2(tRise - tFall) };
      out.dreadFor = tDread !== null && tRise !== null ? r2(tRise - tDread) : null;
      out.dreadBanner = dreadBanner;
      out.patch = hpAtDread === null ? null : r2((hpAtDread - hp0) / p.maxHp);
      out.hands = crewAtDread === null ? null : crewAtDread - crew0;
      out.loot = G.state.gold - gold0;
      out.skiff = { escaped: !!skiff.escaped, captured: !!skiff.captured };
      out.feats = { before: feats0, after: JSON.stringify(G.feats) };
      out.music = T.soundLog.filter((s) => /^set/.test(s.name)).map((s) => s.name);
      out.rise = { banner: T.banner(), mode: k && k.mode, rising: k && k.rising, dur: k && k.riseDur, hp: k && k.hp, phase: k && k.phase, sound: T.soundLog.some((s) => s.name === 'krakenRise'), checkpoint: G.kraken.checkpoint, gold: G.state.gold };
      // the rise runs 6 s of game time unless skipped: 1 s in (real frames: the sea has darkened), a key ends it
      const t0 = G.state.time;
      await T.play(1, () => (p.speed = 0));
      out.rise.dread = r2(G.env.dread);
      const t1 = r2(G.state.time - t0);
      out.oneIn = { rising: T.k().rising, t: t1 };
      T.key('x', 'KeyX');
      T.key('x', 'KeyX', { type: 'keyup' });
      T.steps(1 / 120);
      out.skipped = { rising: T.k().rising, mode: T.k().mode, phase: T.k().phase, hp: T.k().hp, banner: T.banner() };
      return out;
    });
    check(seq.ink && seq.skiff && seq.fall.geysers >= 1 && seq.fall.after === 0 && seq.fall.next === Infinity && seq.fall.fleeing && !seq.fall.fighting && seq.fall.kraken === 'idle' && seq.skiff.escaped && !seq.skiff.captured && seq.feats.before === seq.feats.after,
      `kraken rise: the Inkheart falls: the geysers stop (${seq.fall && seq.fall.geysers} -> ${seq.fall && seq.fall.after}), her skiff flees and is gone ${seq.times && seq.times.gone} s later, no feat, no capture; the Kraken still sleeps (${J({ fall: seq.fall, skiff: seq.skiff })})`);
    check(seq.times && seq.times.dread !== null && seq.times.gone !== null && seq.times.dread >= seq.times.gone - 0.01 && seq.times.dread <= 5.5 && near(seq.dreadFor, 4, 0.05) && seq.patch >= 0.3 && seq.hands === 3 && /stirs/i.test(seq.dreadBanner) && seq.music.includes('setScene:kraken') && seq.music.includes('setMusicPhase:0'),
      `kraken rise: once her crew are gone, ${seq.dreadFor} s of dread (4): the sea darkens, the drone (${J(seq.music)}), "${seq.dreadBanner}", the hull patched ${seq.patch} and ${seq.hands} more hands aboard (${J(seq.times)})`);
    check(seq.rise && seq.rise.rising && seq.rise.dur === 6 && seq.rise.hp === KR.hp && /THE KRAKEN RISES!/.test(seq.rise.banner) && /Shoot its tentacles and its big eye!/.test(seq.rise.banner) && /Stink shot makes it let go!/.test(seq.rise.banner) && seq.rise.sound && seq.rise.checkpoint && seq.rise.checkpoint.level === 9 && seq.rise.checkpoint.gold === seq.rise.gold && seq.rise.dread > 0.25,
      `kraken rise: THE KRAKEN RISES! for 6 s with its how-to line ("${seq.rise && seq.rise.banner}"), the horn, the checkpoint taken with the plunder then (${J(seq.rise)})`);
    check(seq.oneIn && seq.oneIn.rising === true && seq.skipped.rising === false && seq.skipped.mode !== 'idle' && seq.skipped.phase === 1 && seq.skipped.hp === KR.hp,
      `kraken rise: 1 s into the rise any key skips it: the fight is on at once (phase ${seq.skipped && seq.skipped.phase}, ${seq.skipped && seq.skipped.hp} hp) (${J({ oneIn: seq.oneIn, skipped: seq.skipped })})`);
    await closeV(ctx);
  });

  // The fight's three phases (§5.7.3), you held still where it attacks: every tentacle's ring warns ≥ 1.5 s (1.8 /
  // 1.6 / 1.5 s) with its rising tone told how long, the word TENTACLE! and "Tentacle! Steer away."; a slam inside
  // its ring does 12; phase 2's ink blob warns 1.8 s; never more than 4 tentacles up; the phase banners; the boss bar
  // THE KRAKEN with its two notches (66.7 % and 33.3 %); a raised part lights FIRE! and the guns aim at it; G with
  // nothing grabbing you: "You can't board a sea monster!"; outrun it and it cuts you off (an attack every 12 s).
  await section('kraken-fight', async () => {
    const { ctx, page: kp } = await openV({ label: 'kraken-fight' });
    await kp.evaluate(installFinale);
    const ph = await ev(kp, async () => {
      const G = window.__game;
      const r2 = (v) => Math.round(v * 100) / 100;
      const first = T.toFight();
      if (!first) return { risen: false };
      const p = G.player;
      const out = { risen: true, first: { mode: first.mode, phase: first.phase, hp: first.hp } };
      // (#game-live says one thing every 1.5 s of real time: let the rise's line go first, the game held)
      G.state.mode = 'paused';
      await new Promise((r) => setTimeout(r, 1700));
      G.state.mode = 'playing';
      T.watchPops();
      T.soundLog.length = 0;
      const lives = new Set();
      for (const n of [1, 2, 3]) {
        // (into phases 2 and 3 the way a broadside does it: a hit on a raised part takes the bar over the line)
        let crossed = null;
        if (n > 1) {
          G.kraken.setHp(n === 2 ? T.KR.n1 + 5 : T.KR.n2 + 5); // (just above the line: one hit takes it over)
          T.stepUntil(() => G.kraken.targets.length > 0, 20, () => {
            p.hp = p.maxHp;
            if (T.k().grabbed) G.kraken.cut(), G.kraken.cut(), G.kraken.cut();
          });
          const t = G.kraken.targets[0];
          if (t) G.damage({ pseudo: true, part: t.id, x: t.x, z: t.z }, 10);
          crossed = { part: t ? t.kind : null, phase: T.k().phase };
          T.steps(2 / 120);
        }
        const row = { phase: T.k().phase, crossed, banner: T.banner(), warns: {}, inks: {}, slams: [], up: 0, attacks0: T.k().attacks };
        const hurt = T.hurtWatch();
        T.stepUntil(() => false, 22, () => {
          const k = T.k();
          for (const t of k.tentacles) if (t.state === 'warn') row.warns[`${t.attack}.${t.i}`] = t.T;
          for (const b of k.inks) row.inks[`${r2(b.x)},${r2(b.z)}`] = b.T;
          row.up = Math.max(row.up, k.up);
          const d = hurt();
          if (d.slam) row.slams.push(d.slam);
          lives.add(T.text('game-live').replace(/\u00a0/g, '').trim());
          // (#game-live says at most one thing every 1.5 s of real time and these steps take far less: the game's
          // log of what it asked to say, said or waiting, is read too)
          for (const t of G.liveLog || []) lives.add(t);
          // (you never sink here, and the grab lets go at once: this section is about the warnings)
          p.hp = p.maxHp;
          if (k.grabbed) G.kraken.cut(), G.kraken.cut(), G.kraken.cut();
        });
        row.attacks = T.k().attacks - row.attacks0;
        row.warns = Object.values(row.warns);
        row.inks = Object.values(row.inks);
        out[`p${n}`] = row;
      }
      out.pops = T.pops().filter((t) => /TENTACLE!|INK!|SLAM!/.test(t)).reduce((o, t) => ((o[t] = (o[t] || 0) + 1), o), {});
      out.tones = T.soundLog.filter((s) => s.name === 'tentacle').map((s) => s.dur);
      out.lives = [...lives].filter((t) => /Tentacle|Ink/.test(t));
      return out;
    });
    if (!ph.risen) check(false, 'kraken fight: G.kraken.rise() raised no Kraken on level 9');
    else {
      for (const [n, want] of [[1, 1.8], [2, 1.6], [3, 1.5]]) {
        const r = ph[`p${n}`];
        check(r.phase === n && r.attacks >= 2 && r.warns.length >= 2 * r.attacks - 1 && r.warns.every((T) => T >= 1.5 - 1e-9 && near(T, want, 1e-6)) && r.up <= 4 && (n === 3 || r.slams.length >= 1) && r.slams.every((d) => d > 0 && d % 12 === 0),
          `kraken fight: phase ${n}: ${r.attacks} attacks in 22 s, ${r.warns.length} tentacle rings each warning ${[...new Set(r.warns)].join('/')} s (${want}, ≥ 1.5), at most ${r.up} up (≤ 4), slams of ${[...new Set(r.slams)].join('/')} (12 each) (${J({ phase: r.phase, attacks: r.attacks, up: r.up, slams: r.slams.length })})`);
      }
      check(ph.p2.inks.length >= 1 && ph.p2.inks.every((T) => T >= 1.5 - 1e-9 && near(T, 1.8, 1e-6)) && ph.p1.inks.length === 0 && ph.p3.inks.length === 0,
        `kraken fight: only in phase 2 it spits ink: ${ph.p2.inks.length} blobs warning ${[...new Set(ph.p2.inks)].join('/')} s (1.8) (${J({ p1: ph.p1.inks.length, p3: ph.p3.inks.length })})`);
      check(ph.p2.crossed.phase === 2 && ph.p3.crossed.phase === 3 && /The Fury/.test(ph.p2.banner) && /The Last Stand/.test(ph.p3.banner),
        `kraken fight: a hit that takes the bar into phase 2 and 3 shows its banner ("${ph.p2.banner}", "${ph.p3.banner}") (${J({ p2: ph.p2.crossed, p3: ph.p3.crossed })})`);
      const attacks = ph.p1.attacks + ph.p2.attacks + ph.p3.attacks;
      check(ph.tones.length >= attacks && ph.tones.every((d) => d >= 1.5 - 1e-9) && (ph.pops['TENTACLE!'] || 0) >= 3 && ph.lives.some((t) => /Tentacle! Steer away\./.test(t)),
        `kraken fight: every attack has its sound and word: ${ph.tones.length} rising tones told ${[...new Set(ph.tones.map((d) => Math.round(d * 100) / 100))].join('/')} s for ${attacks} attacks, TENTACLE! ×${ph.pops['TENTACLE!'] || 0}, read out "${ph.lives.find((t) => /Tentacle/.test(t)) || ''}" (${J(ph.pops)})`);
    }

    // The boss bar, FIRE! and the guns: the last stand (its head always up 25 u off your beam).
    const bar = await ev(kp, async () => {
      const G = window.__game;
      const r2 = (v) => Math.round(v * 100) / 100;
      if (!T.toFight()) return null;
      const p = G.player;
      const out = {};
      const read = async () => {
        G.state.mode = 'paused';
        await T.redraw();
        G.state.mode = 'playing';
        const fill = document.getElementById('boss-fill');
        // (the fill eases to a new width over 0.12 s of real time: finish that before measuring)
        for (const a of fill.getAnimations ? fill.getAnimations() : []) a.finish();
        const barEl = fill.parentElement.getBoundingClientRect();
        const marks = [...document.querySelectorAll('#boss-notches i')].map((i) => r2((i.getBoundingClientRect().left + i.getBoundingClientRect().width / 2 - barEl.left) / barEl.width));
        return { shown: T.shown('boss'), name: T.text('boss-name'), notches: T.shown('boss-notches'), marks, fill: r2(fill.getBoundingClientRect().width / barEl.width) };
      };
      out.full = await read();
      G.kraken.setHp(Math.round(T.KR.hp * 0.75));
      out.at450 = await read();
      // the last stand: its head comes up off your beam; FIRE! lights on that side and a broadside hits it
      G.kraken.setHp(T.KR.n2);
      T.stepUntil(() => { const h = T.k().head; return !!h && h.up; }, 8, () => (p.hp = p.maxHp));
      T.stepUntil(() => false, 1.2, () => (p.hp = p.maxHp));
      const head = T.k().head;
      const side = head ? Math.sign((head.x - p.x) * -Math.cos(p.h) + (head.z - p.z) * Math.sin(p.h)) || 1 : 1;
      p.reload.port = p.reload.star = 0;
      // (the gun lights follow the play: real frames)
      await T.play(0.15, () => ((p.speed = 0), (p.hp = p.maxHp)));
      const cell = document.getElementById(side > 0 ? 'gun-star' : 'gun-port');
      out.light = { side, target: cell.classList.contains('target'), tag: cell.querySelector('.fire-tag') ? cell.querySelector('.fire-tag').textContent : null, wrappers: G.kraken.wrappers.map((w) => w.kind) };
      const hp0 = T.k().hp;
      T.watchPops();
      p.reload.port = p.reload.star = 0;
      G.playerFire(side);
      T.stepUntil(() => !G.balls.some((b) => b.owner === 'player'), 4, () => (p.hp = p.maxHp));
      out.volley = { hp0, hp: T.k().hp, pops: T.pops().filter((t) => !/^\d+$/.test(t)) };
      // G with nothing grabbing you
      T.stepUntil(() => !T.k().grabbed, 5, () => (p.hp = p.maxHp));
      T.key('g', 'KeyG');
      T.key('g', 'KeyG', { type: 'keyup' });
      out.g = { grabbed: T.k().grabbed, hint: G.state.flash && G.state.flash.text, boarding: G.boarding.active };
      return out;
    });
    const marks = bar ? [...bar.full.marks].sort() : [];
    check(!!bar && bar.full.shown && bar.full.name === 'THE KRAKEN' && bar.full.notches && marks.length === 2 && near(marks[0], 1 / 3, 0.02) && near(marks[1], 2 / 3, 0.02),
      `kraken fight: the boss bar reads THE KRAKEN with two notches at ${bar && J(bar.full.marks)} of its width (${J(bar && bar.full)})`);
    check(!!bar && near(bar.full.fill, 1, 0.02) && near(bar.at450.fill, 0.75, 0.02),
      `kraken fight: the bar shows its hp: full at ${KR.hp}, ${bar && bar.at450.fill} at ${Math.round(KR.hp * 0.75)} (0.75)`);
    check(!!bar && bar.light.target && bar.light.tag === 'FIRE!' && bar.light.wrappers.includes('head') && bar.volley.hp < bar.volley.hp0 && !bar.volley.pops.includes('RAKE!'),
      `kraken fight: its head up off your beam lights FIRE! on that side and a broadside aimed at it takes ${bar && Math.round(bar.volley.hp0 - bar.volley.hp)} hp off the bar, no RAKE! (${J(bar && { light: bar.light, volley: bar.volley })})`);
    check(!!bar && !bar.g.grabbed && bar.g.hint === "You can't board a sea monster!" && !bar.g.boarding,
      `kraken fight: G with nothing grabbing you says "${bar && bar.g.hint}"`);

    // Outrun it (full sail on a wide circle, phase 1): it never goes 12 s without an attack; it cuts you off ahead.
    const run = await ev(kp, () => {
      const G = window.__game;
      if (!T.toFight()) return null;
      const p = G.player;
      G.place(p, 0, -60, Math.PI / 2);
      G.state.sail = 3;
      let most = 0;
      const t0 = G.state.time;
      const a0 = T.k().attacks;
      for (let i = 0; i < 120 * 45; i++) {
        p.h += 0.12 / 120; // (a circle of about 100 u across at 12 u/s)
        p.hp = p.maxHp;
        if (T.k().grabbed) G.kraken.cut(), G.kraken.cut(), G.kraken.cut();
        G.step(1 / 120);
        most = Math.max(most, T.k().sinceAttack);
      }
      G.state.sail = 0;
      return { speed: Math.round(p.speed * 10) / 10, secs: Math.round(G.state.time - t0), attacks: T.k().attacks - a0, most: Math.round(most * 100) / 100, cutOffs: T.k().counts.cutOffs, phase: T.k().phase };
    });
    check(!!run && run.speed >= 11 && run.phase === 1 && run.most <= 12 + 1e-6 && run.cutOffs >= 1 && run.attacks >= 3,
      `kraken fight: outrunning it at ${run && run.speed} u/s for ${run && run.secs} s: ${run && run.attacks} attacks, never more than ${run && run.most} s apart (≤ 12), ${run && run.cutOffs} cut-offs ahead of your bow (${J(run)})`);
    await closeV(ctx);
  });

  // A grab (§5.7.3, phase 2 on, you held still): your speed and turn are 0 (full sail and the helm hard over do
  // nothing), 2 hp/s, "GRABBED! Hold G to cut it loose" with the Board cell reading CUT!; four ways out and the
  // timeout: G pressed 3 times, G held 0.8 s, a hit on that tentacle, a stink hit on the beast (ACHOO!), or 4 s at
  // most; never grabbed again within 8 s of a release. On a phone the strip says "Hold CUT!" and the Board button
  // reads CUT!.
  await section('kraken-grab', async () => {
    const { ctx, page: kp } = await openV({ label: 'kraken-grab' });
    await kp.evaluate(installFinale);
    const gr = await ev(kp, async () => {
      const G = window.__game;
      const r2 = (v) => Math.round(v * 100) / 100;
      if (!T.toFight()) return null;
      const p = G.player;
      G.kraken.setHp(T.KR.n1); // (phase 2: it grabs)
      // the time from the last release to each new grab, on the Kraken's own clock
      const gaps = [];
      // Stepped (your hull kept up) until the next grab; then real frames (the pops' rate fills up again: the words
      // of what comes next aren't dropped). → the grab, or null
      const nextGrab = async (most = 45) => {
        T.stepUntil(() => T.k().grabbed, most, () => (p.hp = Math.max(p.hp, p.maxHp * 0.6)));
        const k = T.k();
        if (!k.grabbed) return null;
        if (k.lastRelease !== null) gaps.push(r2(k.time - k.grab.t - k.lastRelease));
        await T.play(1.1, () => (p.hp = Math.max(p.hp, p.maxHp * 0.6)));
        T.watchPops();
        return T.k().grabbed ? T.k().grab : null;
      };
      // Stepped until it lets go (at most `most` s): the seconds it held on.
      const untilFree = (most, each) => {
        const t0 = G.state.time;
        T.stepUntil(() => !T.k().grabbed, most, each);
        return r2(G.state.time - t0);
      };
      const out = {};
      // 1. held: what it does to your ship, the strip, the Board cell; then 3 presses of G
      let g = await nextGrab();
      if (!g) return { none: true };
      G.state.sail = 3;
      G.input.left = true;
      const h0 = p.h;
      const hurt = T.hurtWatch();
      let grabHurt = 0;
      T.stepUntil(() => false, 2, () => {
        const d = hurt();
        grabHurt += d.grab || 0;
      });
      grabHurt += hurt().grab || 0;
      // (the HUD follows the play: real frames)
      await T.play(0.1);
      out.held = { speed: r2(p.speed), turned: r2(Math.abs(p.h - h0)), hurt: r2(grabHurt), strip: T.shown('grab-strip') ? T.text('grab-strip') : null, board: T.text('board-tag'), mods: G.kraken.mods, left: T.k().grab ? T.k().grab.left : null };
      G.input.left = false;
      G.state.sail = 0;
      for (let i = 0; i < 3; i++) {
        T.key('g', 'KeyG');
        T.key('g', 'KeyG', { type: 'keyup' });
      }
      T.steps(1 / 120);
      out.taps = { free: !T.k().grabbed, releases: T.k().counts.releases, pops: T.pops().filter((t) => /FREE|GRABBED/.test(t)) };
      // 2. G held
      g = await nextGrab();
      if (g) {
        T.key('g', 'KeyG');
        out.hold = { secs: untilFree(1.5) };
        T.key('g', 'KeyG', { type: 'keyup' });
      }
      // 3. a hit on the tentacle holding you
      g = await nextGrab();
      if (g) {
        const t = T.k().tentacles.find((x) => x.id === g.id);
        G.damage({ pseudo: true, part: g.id, x: t.x, z: t.z }, 5);
        out.hit = { secs: untilFree(0.05), pops: T.pops().filter((x) => /OUCH/.test(x)) };
      }
      // 4. a stink hit on another part of it: ACHOO!, every tentacle snaps under and it lets go
      g = await nextGrab();
      if (g) {
        let other = G.kraken.targets.find((x) => x.id !== g.id);
        if (!other) T.stepUntil(() => !!(other = G.kraken.targets.find((x) => x.id !== g.id)) || !T.k().grabbed, 3);
        if (other && T.k().grabbed) {
          G.damage({ pseudo: true, part: other.id, x: other.x, z: other.z }, 1, other.x, other.z, 'player', { dmg: 1, status: 'stink', ammo: 'stink' });
          out.stink = { secs: untilFree(0.05), pops: T.pops().filter((x) => /ACHOO|pegs/.test(x)), sneezes: T.k().counts.sneezes, up: T.k().tentacles.filter((x) => x.state !== 'sink').length };
        }
      }
      // 5. nothing done: it lets go by itself after 4 s at most
      g = await nextGrab(60);
      if (g) {
        const t0 = r2(g.t);
        out.time = { secs: r2(untilFree(5) + t0), pops: T.pops().filter((x) => /FREE/.test(x)) };
      }
      out.gaps = gaps;
      return out;
    });
    if (!gr || gr.none) check(false, `kraken grab: no grab came in phase 2 with you held still (${J(gr)})`);
    else {
      check(gr.held.speed === 0 && gr.held.turned === 0 && near(gr.held.hurt, 4, 1) && gr.held.strip === 'GRABBED! Hold G to cut it loose' && /CUT!/.test(gr.held.board),
        `kraken grab: held fast at full sail, the helm over: speed ${gr.held.speed}, turned ${gr.held.turned}, ${gr.held.hurt} hp in 2 s (2 hp/s), "${gr.held.strip}", the Board cell reads ${gr.held.board} (${J(gr.held)})`);
      check(gr.taps.free && gr.taps.pops.includes('FREE!'), `kraken grab: G pressed 3 times cuts you loose, FREE! (${J(gr.taps)})`);
      check(!!gr.hold && gr.hold.secs >= 0.75 && gr.hold.secs <= 0.85, `kraken grab: G held cuts you loose after ${gr.hold && gr.hold.secs} s (0.8)`);
      check(!!gr.hit && gr.hit.secs <= 0.02 && gr.hit.pops.includes('OUCH!'), `kraken grab: a hit on the tentacle holding you makes it let go at once, OUCH! (${J(gr.hit)})`);
      check(!!gr.stink && gr.stink.secs <= 0.02 && gr.stink.pops.includes('ACHOO!') && gr.stink.sneezes >= 1, `kraken grab: a stink hit on the beast: ACHOO!, it lets go at once (${J(gr.stink)})`);
      check(!!gr.time && gr.time.secs <= 4 + 0.02 && gr.time.secs >= 3.9 && gr.time.pops.includes('FREE!'), `kraken grab: left alone it lets go by itself after ${gr.time && gr.time.secs} s (≤ 4), FREE! (${J(gr.time)})`);
      check(gr.gaps.length >= 4 && gr.gaps.every((d) => d >= 8 - 1e-6), `kraken grab: never grabbed again within 8 s of a release (${J(gr.gaps)} s)`);
    }
    await closeV(ctx);
    // On a phone: the strip says "Hold CUT!", the Board button reads CUT!; three taps on it cut you loose.
    const { ctx: tc, page: tp } = await openV({ width: 390, height: 844, touch: true, label: 'kraken-grab touch' });
    await tp.evaluate(installFinale);
    const touch = await ev(tp, async () => {
      const G = window.__game;
      if (!T.toFight()) return null;
      const p = G.player;
      G.kraken.setHp(T.KR.n1); // (phase 2: it grabs)
      T.stepUntil(() => T.k().grabbed, 60, () => (p.hp = Math.max(p.hp, p.maxHp * 0.6)));
      if (!T.k().grabbed) return { none: true };
      // (the rise's banner goes, as it would have in the stepped seconds, so the shot shows the grab)
      G.state.bannerTimer = Math.min(G.state.bannerTimer, 0.01);
      G.state.regenShown = true;
      await T.play(0.1);
      G.state.mode = 'paused';
      const btn = document.getElementById('touch-board');
      return { strip: T.shown('grab-strip') ? T.text('grab-strip') : null, word: btn.textContent.trim(), disabled: btn.getAttribute('aria-disabled'), shown: T.shown('touch-board') };
    });
    if (touch && !touch.none) {
      await snap(tp, 'kraken-grab-390x844.png');
      touch.free = await ev(tp, () => {
        const btn = document.getElementById('touch-board');
        for (let i = 0; i < 3; i++) for (const type of ['pointerdown', 'pointerup']) btn.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 41, pointerType: 'touch', isPrimary: true }));
        T.steps(1 / 120);
        return !T.k().grabbed;
      });
    }
    check(!!touch && !touch.none && touch.strip === 'GRABBED! Hold CUT! to cut it loose' && touch.shown && /CUT!/.test(touch.word) && touch.disabled === 'false' && touch.free,
      `kraken grab: on a phone "${touch && touch.strip}", the Board button reads ${touch && touch.word}, and 3 taps on it cut you loose (${J(touch)})`);
    await closeV(tc);
  });

  // Driven off (§5.7.1 step 5): THE KRAKEN IS DRIVEN OFF!, the feat saved at once, the sky to dawn; the level waits
  // for the Pearl (+1,000, added to your plunder when it reaches you) and a baby kraken climbs aboard; then the
  // final Victory ("...You are the Kraken Tamer!", the Pearl's line on the chest card) and Enter goes to the title.
  await section('kraken-end', async () => {
    const { ctx, page: kp } = await openV({ label: 'kraken-end' });
    await kp.evaluate(installFinale);
    const end = await ev(kp, async () => {
      const G = window.__game;
      const r2 = (v) => Math.round(v * 100) / 100;
      if (!T.toFight()) return null;
      const p = G.player;
      G.state.gold = 1234;
      const gold0 = G.state.gold;
      const feat0 = (JSON.parse(localStorage.getItem('pirates-ahoy-feats') || '{}') || {}).kraken || 0;
      T.watchPops();
      T.soundLog.length = 0;
      G.kraken.setHp(0);
      T.steps(1 / 120);
      const k = T.k();
      const out = { done: k.done, stage: k.stage, banner: T.banner(), feat0, feat: (JSON.parse(localStorage.getItem('pirates-ahoy-feats') || '{}') || {}).kraken, targets: G.kraken.targets.length, bar: T.shown('boss') };
      // until the Pearl is taken: the level stays open (no clear), the gold arrives with the Pearl
      let early = null;
      let pearlAt = null;
      const t0 = G.state.time;
      T.stepUntil(() => T.k().over, 20, () => {
        if (early === null && (G.state.clearTimer > 0 || G.state.mode !== 'playing')) early = r2(G.state.time - t0);
        if (pearlAt === null && G.state.gold > gold0) pearlAt = r2(G.state.time - t0);
      });
      if (pearlAt === null && G.state.gold > gold0) pearlAt = r2(G.state.time - t0);
      out.over = { over: T.k().over, after: r2(G.state.time - t0), early, pearlAt, gold: G.state.gold - gold0, pearlGold: T.k().pearlGold, baby: T.k().baby, sounds: T.soundLog.map((s) => s.name).filter((n) => /gurgle|coin|setMusicPhase/.test(n)) };
      out.pops = T.pops().filter((t) => /PEARL|baby|like you|DRIVEN/i.test(t));
      // real frames: the dawn comes up
      await T.play(1.2, () => (p.speed = 0));
      out.dawn = r2(G.env.dawn);
      T.stepUntil(() => G.state.mode !== 'playing', 5);
      out.won = { mode: G.state.mode, text: T.text('won-text'), chest: T.text('won-chest'), shown: T.shown('won-screen') };
      return out;
    });
    check(!!end && end.done && end.stage === 'gone' && /THE KRAKEN IS DRIVEN OFF!/.test(end.banner) && end.feat0 === 0 && end.feat === 1 && end.targets === 0,
      `kraken end: at 0 hp "${end && end.banner}", no more targets, the feat kraken saved at once (${end && end.feat0} -> ${end && end.feat}) (${J(end && { done: end.done, stage: end.stage, targets: end.targets })})`);
    check(!!end && end.over.over && end.over.early === null && end.over.pearlAt !== null && end.over.gold === 1000 && end.over.pearlGold === 1000 && end.over.baby && end.pops.some((t) => /\+1,000 THE KRAKEN'S PEARL/.test(t)) && end.pops.some((t) => /It seems to like you!/.test(t)) && end.over.sounds.includes('gurgle'),
      `kraken end: the level waits for the Pearl (taken ${end && end.over.pearlAt} s after, +${end && end.over.gold} gold) and a baby kraken climbs aboard before it clears (${J(end && { over: end.over, pops: end.pops })})`);
    check(!!end && end.dawn > 0.2, `kraken end: the sky eases to dawn (${end && end.dawn})`);
    check(!!end && end.won.mode === 'won' && end.won.shown && end.won.text === 'The Kraken is driven back to the deep, and the Seven Seas are safe! You are the Kraken Tamer!' && /The Kraken's Pearl \+1,000/.test(end.won.chest),
      `kraken end: the final Victory: "${end && end.won.text}", "${end && end.won.chest}"`);
    await kp.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    await kp.keyboard.press('Enter');
    await frames(kp, 2);
    const title = await kp.evaluate(() => ({ mode: window.__game.state.mode, menu: T.shown('menu-screen') }));
    check(title.mode === 'menu' && title.menu, `kraken end: Enter on the final Victory goes to the title (${J(title)})`);
    await closeV(ctx);
  });

  // Sunk in the fight (§5.7.6): the shipwreck card's first button is "Try again from the Kraken" (Enter does it):
  // level 9 again from the rise, short (3 s), a full hull and crew, loads refilled, no ships, the plunder you had
  // when it rose; "Try again" and "Main menu" stay.
  await section('kraken-retry', async () => {
    const { ctx, page: kp } = await openV({ label: 'kraken-retry' });
    await kp.evaluate(installFinale);
    const sunk = await ev(kp, () => {
      const G = window.__game;
      const p = T.level(9);
      G.state.gold = 700;
      G.state.goldAtLevelStart = 300;
      if (!G.kraken.rise()) return null;
      const cp = G.kraken.checkpoint;
      T.steps(0.5);
      G.state.gold += 450; // (plunder after the rise is lost with the ship)
      G.specials.setLoads({ fire: 0, frost: 1, stink: 0 });
      G.damage(p, 99999, p.x, p.z, 'slam');
      T.stepUntil(() => G.state.mode !== 'playing', 8);
      const buttons = [...document.querySelectorAll('#over-screen .panel button')].filter((b) => b.offsetParent).map((b) => b.id);
      return { cp, mode: G.state.mode, buttons, retryText: T.text('kraken-retry-btn') };
    });
    check(!!sunk && sunk.cp && sunk.cp.level === 9 && sunk.cp.gold === 700 && sunk.mode === 'over' && sunk.buttons[0] === 'kraken-retry-btn' && sunk.buttons.includes('retry-btn') && sunk.buttons.includes('menu-btn') && sunk.retryText === 'Try again from the Kraken',
      `kraken retry: sunk in the fight, the shipwreck card's first button is "${sunk && sunk.retryText}" (${J(sunk)})`);
    await kp.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    await kp.keyboard.press('Enter');
    const again = await ev(kp, () => {
      const G = window.__game;
      const p = G.player;
      const out = { mode: G.state.mode, level: G.state.level, gold: G.state.gold, start: G.state.goldAtLevelStart, ships: G.enemies.filter(G.fighting).length, hp: p.hp === p.maxHp, crew: G.state.crew === G.state.crewMax, loads: G.specials.loads };
      G.state.intro = Math.min(G.state.intro, 0.01);
      T.stepUntil(() => T.k() && T.k().rising, 5);
      const k = T.k();
      out.rise = k && { rising: k.rising, dur: k.riseDur, short: k.short, hp: k.hp, stage: k.stage };
      T.stepUntil(() => T.k() && !T.k().rising, 4);
      out.fight = T.k() && { mode: T.k().mode, phase: T.k().phase, hp: T.k().hp };
      out.ships = Math.max(out.ships, G.enemies.filter(G.fighting).length);
      return out;
    });
    check(again.mode === 'playing' && again.level === 9 && again.gold === 700 && again.start === 300 && again.ships === 0 && again.hp && again.crew && J(again.loads) === '{"fire":4,"frost":4,"stink":4}',
      `kraken retry: Enter tries again from the Kraken: level 9, the plunder from the rise (${again.gold}), the level's own start kept (${again.start}), no ships, a full hull and crew, loads refilled (${J(again)})`);
    check(!!again.rise && again.rise.rising && again.rise.dur === 3 && again.rise.hp === KR.hp && !!again.fight && again.fight.phase === 1 && again.fight.hp === KR.hp,
      `kraken retry: the Kraken rises again at once, the short rise (${again.rise && again.rise.dur} s), at full ${KR.hp} hp (${J({ rise: again.rise, fight: again.fight })})`);
    await closeV(ctx);
  });

  // The rise on screen (real frames): the camera glides up and back onto its eye (kraken-rise.png); under reduced
  // motion a cut to the eye and back, no glide, no shake. The fight at its busiest (the last stand: its head up,
  // tentacles up and their rings) draws within 450 calls, the Kraken itself within 30 and its rings (kraken-fight.png).
  await section('kraken-look', async () => {
    // Frames of the rise: per-frame camera moves, the shake, the model; then (normal motion) the screenshot.
    const watchRise = async (kp, shot) =>
      ev(kp, async () => {
        const G = window.__game;
        const r2 = (v) => Math.round(v * 100) / 100;
        const p = T.level(9);
        G.state.nextBomb = Infinity;
        // (real frames first: the level banner goes, the model is built and warmed up)
        await T.play(1.5, () => (p.speed = 0));
        if (!G.kraken.rise()) return null;
        const cam = G.camera;
        let last = cam.position.clone();
        const moves = [];
        let shake = 0;
        let calls = 0;
        await T.play(2.4, () => {
          p.speed = 0;
          moves.push(cam.position.distanceTo(last));
          last = cam.position.clone();
          shake = Math.max(shake, G.state.shake || 0);
          calls = Math.max(calls, G.renderInfo.calls);
          // (a slam beside you, as a hull hit shakes the camera)
          if (moves.length === 20) G.damage(p, 1, p.x, p.z, 'slam');
        });
        G.state.mode = 'paused';
        await T.redraw();
        const v = G.kraken.view();
        // (pre: frames the camera moved before its first cut; drift: how far it went in all but its cuts. Under
        // reduced motion the cut pose then follows the rising eye a little, well under a glide's 15 u or more.)
        const cutAt = moves.findIndex((d) => d >= 4);
        const pre = (cutAt < 0 ? moves : moves.slice(0, cutAt)).filter((d) => d > 0.05).length;
        const drift = r2(moves.filter((d) => d < 4).reduce((a, d) => a + d, 0));
        return { rising: T.k().rising, frames: moves.length, glides: moves.filter((d) => d > 0.05 && d < 4).length, cuts: moves.filter((d) => d >= 4).length, pre, drift, still: moves.filter((d) => d <= 0.05).length, shake: r2(shake), calls, view: v && { head: v.head, eyes: v.eyes }, moves: moves.map(r2) };
      });
    const { ctx, page: kp } = await openV({ label: 'kraken-look' });
    await kp.evaluate(installFinale);
    const rise = await watchRise(kp);
    if (rise) await snap(kp, 'kraken-rise.png');
    await closeV(ctx);
    const { ctx: rc, page: rp } = await openV({ label: 'kraken-look reduced', reducedMotion: 'reduce' });
    await rp.evaluate(installFinale);
    const calm = await watchRise(rp);
    await closeV(rc);
    check(!!rise && rise.rising && rise.glides >= 10 && rise.shake > 0 && rise.view && rise.view.head,
      `kraken look: the rise glides the camera up and back onto its eye (${rise && rise.glides} gliding frames of ${rise && rise.frames}), a slam shakes it (${rise && rise.shake}) (${J(rise)})`);
    check(!!calm && calm.rising && calm.cuts >= 1 && calm.pre === 0 && calm.drift <= 2 && calm.shake === 0,
      `kraken look: under reduced motion a cut to the eye (${calm && calm.cuts} cut), the camera still before it (${calm && calm.pre} moving frames) and no glide (${calm && calm.drift} u besides the cut, ≤ 2), no shake (${J(calm)})`);

    // The fight at its busiest: draw calls of real frames.
    const { ctx: fc, page: fp } = await openV({ label: 'kraken-look fight' });
    await fp.evaluate(installFinale);
    const busy = await ev(fp, async () => {
      const G = window.__game;
      const p = T.level(9);
      G.state.nextBomb = Infinity;
      await T.play(1.5, () => (p.speed = 0));
      if (!T.toFight()) return null;
      // (past the rise's banner)
      T.stepUntil(() => false, 6.5, () => {
        p.hp = p.maxHp;
        if (T.k().grabbed) G.kraken.cut(), G.kraken.cut(), G.kraken.cut();
      });
      G.kraken.setHp(T.KR.n2); // (the last stand)
      // until its head is up and 3 or more tentacles are up or warning
      T.stepUntil(() => { const k = T.k(); return !!k.head && k.head.up && k.tentacles.length >= 3; }, 20, () => {
        p.hp = p.maxHp;
        if (T.k().grabbed) G.kraken.cut(), G.kraken.cut(), G.kraken.cut();
      });
      const calls = [];
      // (the rise's banner has had its time: the stepped seconds don't run it down; a last moment lets the frame hide it)
      G.state.bannerTimer = Math.min(G.state.bannerTimer, 0.01);
      G.state.regenShown = true; // (and the level's one-time "Repairing!" tip doesn't take its place in the shot)
      await T.play(1.6, () => {
        p.speed = 0;
        p.hp = p.maxHp;
        calls.push(G.renderInfo.calls);
      });
      G.state.mode = 'paused';
      await T.redraw();
      await T.redraw();
      const settled = G.renderInfo.calls;
      // the Kraken's own draws (its model and rings): the frame without it
      const root = G.scene.getObjectByName('kraken');
      let without = null;
      if (root) {
        root.visible = false;
        await T.redraw();
        await T.redraw();
        without = G.renderInfo.calls;
        root.visible = true;
        await T.redraw();
      }
      const v = G.kraken.view();
      const k = T.k();
      return { model: without === null ? null : settled - without, frames: calls.length, max: Math.max(...calls), min: Math.min(...calls), settled, ships: G.enemies.filter(G.fighting).length, head: !!k.head && k.head.up, tentacles: k.tentacles.length, up: k.up, view: v };
    });
    if (busy) await snap(fp, 'kraken-fight.png');
    check(!!busy && busy.head && busy.tentacles >= 3 && busy.ships === 0 && busy.frames >= 5 && busy.max <= 450 && busy.settled <= 450 && busy.view && busy.view.head && busy.view.tentacles >= 1 && busy.model !== null && busy.model > 0 && busy.model <= 30 + 2 * busy.view.rings,
      `kraken look: the last stand at its busiest (its head up, ${busy && busy.tentacles} tentacles, ${busy && busy.view && busy.view.rings} rings) draws ${busy && busy.min}-${busy && busy.max} calls over ${busy && busy.frames} frames, ${busy && busy.settled} settled (≤ 450); the Kraken itself ${busy && busy.model} (≤ 30 + its rings) (${J(busy)})`);
    // (SPEC3 §14: ≤ 4 warning rings at once; view.rings counts the rings mesh's instances, the foam circles round its
    // head and tentacles included)
    check(!!busy && busy.view && Number.isInteger(busy.view.warnings) && busy.view.warnings <= 4,
      `kraken look: the last stand at its busiest shows ${busy && busy.view && busy.view.warnings} warning rings (≤ 4; ${busy && busy.view && busy.view.rings} rings with the foam circles)`);
    await closeV(fc);
  });
  // The Stage 2 review's Kraken fixes (stepped): the grab's squeeze doesn't flash the screen red twice a second (one
  // flash as it takes hold, SPEC3 §15: ≤ 1 per 3 s); a key held through the dread (its auto-repeat) doesn't skip the
  // rise, a fresh press does; all stop for the dread and the rise (the ship doesn't sail into the rising Kraken), and
  // its head is solid in the fight (your ship slides round it).
  await section('kraken-calm', async () => {
    const { ctx, page: kp } = await openV({ label: 'kraken-calm' });
    await kp.evaluate(installFinale);
    const calm = await ev(kp, () => {
      const G = window.__game;
      const r2 = (v) => Math.round(v * 100) / 100;
      const out = {};
      // 1. a grab left alone for its 4 s: the red flashes of the screen edge and the hull card
      if (!T.toFight()) return null;
      const p = G.player;
      G.kraken.setHp(T.KR.n1 - 10); // (phase 2: it grabs)
      T.stepUntil(() => T.k().grabbed, 45, () => (p.hp = p.maxHp));
      const flashes = [];
      const spies = [];
      for (const [id, cls] of [['edge', 'on'], ['hull-card', 'hurt']]) {
        const el = document.getElementById(id);
        const cl = el.classList;
        const add = cl.add;
        cl.add = function (...a) {
          if (a.includes(cls)) flashes.push({ id, t: r2(G.state.time) });
          return add.apply(this, a);
        };
        spies.push(() => (cl.add = add));
      }
      // (from the step after it took hold: its squeeze)
      const hp0 = p.hp;
      const t0 = G.state.time;
      T.stepUntil(() => !T.k().grabbed, 5);
      const held = r2(G.state.time - t0);
      spies.forEach((f) => f());
      out.grab = { held, lost: r2(hp0 - p.hp), flashes };
      // the flash as it takes hold: a second grab, watched from the step before
      T.stepUntil(() => false, 9, () => (p.hp = p.maxHp));
      const seen = [];
      const el = document.getElementById('edge');
      const add = el.classList.add;
      el.classList.add = function (...a) {
        if (a.includes('on')) seen.push(r2(G.state.time));
        return add.apply(this, a);
      };
      let grabAt = null;
      T.stepUntil(() => T.k().grabbed && grabAt !== null, 45, () => {
        p.hp = p.maxHp;
        if (grabAt === null && T.k().grabbed) grabAt = r2(G.state.time);
      });
      if (grabAt === null && T.k().grabbed) grabAt = r2(G.state.time);
      // (then 0.7 s of its squeeze; a slam of the same attack landing on you may flash too: its times are noted)
      const slams = [];
      const hurt = T.hurtWatch();
      T.stepUntil(() => false, 0.7, () => {
        const d = hurt();
        if (d.slam || d.ink) slams.push(r2(G.state.time));
      });
      el.classList.add = add;
      const after = grabAt === null ? [] : seen.filter((t) => t >= grabAt - 0.01);
      out.takeHold = { grabAt, seen: after, slams, squeezes: after.filter((t) => t > grabAt + 0.05 && !slams.some((u) => Math.abs(u - t) <= 0.02)) };
      T.stepUntil(() => !T.k().grabbed, 5);

      // 2. a steering key held through the dread (auto-repeat about 30 a second) and on into the rise
      T.level(9);
      G.state.nextBomb = Infinity;
      T.key('a', 'KeyA');
      G.kraken.rise({ dread: true });
      let i = 0;
      T.stepUntil(() => T.k().stage === 'rise', 6, () => {
        if (i++ % 4 === 0) T.key('a', 'KeyA', { repeat: true });
      });
      const atRise = { stage: T.k().stage, rising: T.k().rising };
      T.stepUntil(() => false, 1, () => {
        if (i++ % 4 === 0) T.key('a', 'KeyA', { repeat: true });
      });
      out.held = { atRise, after: { stage: T.k().stage, rising: T.k().rising, riseT: r2(T.k().riseT) } };
      T.key('a', 'KeyA', { type: 'keyup' });
      T.key('a', 'KeyA');
      T.key('a', 'KeyA', { type: 'keyup' });
      T.steps(1 / 120);
      out.held.fresh = { stage: T.k().stage, rising: T.k().rising };

      // 3. cruising when the dread comes: all stop; the rise 40 u ahead, never sailed into
      const q = T.level(9);
      G.state.nextBomb = Infinity;
      G.state.sail = 2;
      T.steps(3);
      const cruise = r2(q.speed);
      G.kraken.rise({ dread: true });
      let near = Infinity;
      let riseSpeed = null;
      let maxSpeed = 0;
      let x0 = null;
      let z0 = null;
      T.steps(12, () => {
        const s = T.k();
        if (s.stage === 'rise' && riseSpeed === null) {
          riseSpeed = r2(q.speed);
          x0 = q.x;
          z0 = q.z;
        }
        if (s.stage === 'rise') maxSpeed = Math.max(maxSpeed, q.speed);
        const v = G.kraken.visuals();
        if (s.stage === 'rise' && v.head) near = Math.min(near, Math.hypot(q.x - v.head.x, q.z - v.head.z));
        if (s.stage === 'fight') return false;
      });
      out.rise = { cruise, riseSpeed, maxSpeed: r2(maxSpeed), moved: x0 === null ? null : r2(Math.hypot(q.x - x0, q.z - z0)), near: r2(near), banner: T.banner(), stage: T.k().stage, sail: G.state.sail };
      // after the rise the sails set again
      T.steps(3);
      out.rise.after = r2(q.speed);

      // 4. the fight's last stand (its head always up): full sail straight at the head for 8 s
      if (!T.toFight()) return out;
      G.kraken.setHp(T.KR.n2 - 50); // (the last stand)
      const f = G.player;
      T.stepUntil(() => !!T.k().head && T.k().head.up, 15, () => {
        f.hp = f.maxHp;
        if (T.k().grabbed) G.kraken.cut(), G.kraken.cut(), G.kraken.cut();
      });
      let minD = Infinity;
      G.state.sail = 3;
      T.steps(8, () => {
        f.hp = f.maxHp;
        if (T.k().grabbed) G.kraken.cut(), G.kraken.cut(), G.kraken.cut();
        const h = T.k().head;
        if (!h || !h.up) return;
        f.h = Math.atan2(h.x - f.x, h.z - f.z); // (steering straight at it)
        minD = Math.min(minD, Math.hypot(f.x - h.x, f.z - h.z));
      });
      G.state.sail = 0;
      out.head = { minD: r2(minD), up: !!T.k().head && T.k().head.up };
      return out;
    });
    const g = calm && calm.grab;
    check(!!g && g.held >= 3 && g.lost >= 6 && g.flashes.length === 0,
      `kraken calm: a grab left alone squeezes (${g && g.lost} hp in ${g && g.held} s) without flashing the screen edge or the hull card red (${g && g.flashes.length} flashes, ${J(g && g.flashes.slice(0, 8))})`);
    const th = calm && calm.takeHold;
    check(!!th && th.grabAt !== null && th.seen.length >= 1 && Math.abs(th.seen[0] - th.grabAt) <= 0.02 && th.squeezes.length === 0,
      `kraken calm: one red flash as a tentacle takes hold (at ${th && th.grabAt} s: ${J(th && th.seen)}), none for its squeeze after (${J(th)})`);
    const hk = calm && calm.held;
    check(!!hk && hk.atRise.stage === 'rise' && hk.atRise.rising && hk.after.rising && hk.after.riseT >= 0.9 && hk.fresh.stage === 'fight' && !hk.fresh.rising,
      `kraken calm: a steering key held through the dread (its auto-repeat) doesn't skip the rise (${hk && hk.after.riseT} s in, still rising); a fresh press does (${J(hk)})`);
    const rs = calm && calm.rise;
    check(!!rs && rs.cruise > 5 && rs.riseSpeed !== null && rs.riseSpeed <= 0.5 && rs.maxSpeed <= 0.5 && rs.moved <= 1 && rs.near >= 35 && rs.after > 1,
      `kraken calm: cruising at ${rs && rs.cruise} u/s when the dread comes, the ship is stopped when it rises (${rs && rs.riseSpeed} u/s, moved ${rs && rs.moved} u in the rise), ${rs && rs.near} u from its head at the nearest; the sails set again for the fight (${rs && rs.after} u/s) (${J(rs)})`);
    const hd = calm && calm.head;
    check(!!hd && hd.up && hd.minD >= 8,
      `kraken calm: full sail straight at its head in the last stand, the ship slides round it, never nearer than ${hd && hd.minD} u to its middle (≥ 8: it is solid) (${J(hd)})`);
    await closeV(ctx);
  });

  // The look of those fixes (real frames): the rise's banner keeps off the rising head on a wide screen and a phone,
  // and the dread's banner says "All stop!".
  await section('kraken-calm-look', async () => {
    const rows = [];
    for (const [w, h, touch] of [[1280, 720, false], [844, 390, true], [390, 844, true]]) {
      const { ctx, page: kp } = await openV({ label: `kraken-calm-look ${w}x${h}`, width: w, height: h, touch });
      await kp.evaluate(installFinale);
      const r = await ev(kp, async () => {
        const G = window.__game;
        const THREE = await import('/vendor/three.module.min.js');
        const p = T.level(9);
        G.state.nextBomb = Infinity;
        await T.play(1.0, () => (p.speed = 0));
        G.kraken.rise({ dread: true });
        await T.play(0.5);
        const out = { dread: T.banner(), at: [] };
        T.stepUntil(() => T.k().stage === 'rise', 6);
        const box = (pts) => ({ l: Math.min(...pts.map((q) => q.x)), r: Math.max(...pts.map((q) => q.x)), t: Math.min(...pts.map((q) => q.y)), b: Math.max(...pts.map((q) => q.y)) });
        for (const want of [1, 3, 4.5]) {
          T.stepUntil(() => T.k().riseT >= want - 0.1 || !T.k().rising, 6);
          await T.play(0.1);
          const v = G.kraken.visuals();
          const cam = G.camera;
          cam.updateMatrixWorld();
          const scr = (x, y, z) => {
            const q = new THREE.Vector3(x, y, z).project(cam);
            return { x: ((q.x + 1) / 2) * innerWidth, y: ((1 - q.y) / 2) * innerHeight };
          };
          let head = null;
          if (v.head) {
            // its mantle: a sphere r 6 at y 3 (× 1.1 for the model) as far as it has risen, and the crown's figurehead
            const hy = 3.3 * Math.max(0, v.head.k);
            const pts = [];
            for (const [dx, dy, dz] of [[0, 6.6, 0], [0, 9, 0], [0, -0.5, 0], [6.6, 0, 0], [-6.6, 0, 0], [0, 0, 6.6], [0, 0, -6.6]]) pts.push(scr(v.head.x + dx, hy + dy, v.head.z + dz));
            head = box(pts);
          }
          const b = document.getElementById('banner').getBoundingClientRect();
          out.at.push({ riseT: Math.round(T.k().riseT * 100) / 100, rising: T.k().rising, shown: T.shown('banner'), text: T.banner().slice(0, 18), banner: { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }, head: head && { l: Math.round(head.l), t: Math.round(head.t), r: Math.round(head.r), b: Math.round(head.b) } });
        }
        return out;
      });
      rows.push({ w, h, r });
      await closeV(ctx);
    }
    const hits = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    for (const { w, h, r } of rows) {
      const bad = r.at.filter((a) => !a.shown || !/THE KRAKEN RISES/.test(a.text) || !a.head || hits(a.banner, a.head));
      check(/All stop!/.test(r.dread) && /stirs/i.test(r.dread) && r.at.length === 3 && bad.length === 0,
        `kraken calm look ${w}x${h}: "THE KRAKEN RISES!" keeps off its rising head all through the rise (${J(r.at.map((a) => ({ t: a.riseT, banner: [a.banner.t, a.banner.b], head: a.head && [a.head.t, a.head.b] })))}); the dread says "${r.dread}"`);
    }
  });

  // A grab on a small phone (real frames): the pops (GRABBED!, TENTACLE!, ...) keep off the grab strip, so its "Hold
  // CUT! to cut it loose" stays readable.
  await section('kraken-calm-pops', async () => {
    for (const [w, h] of [[320, 480], [568, 320]]) {
      const { ctx, page: kp } = await openV({ label: `kraken-calm-look ${w}x${h}`, width: w, height: h, touch: true });
      await kp.evaluate(installFinale);
      const g = await ev(kp, async () => {
        const G = window.__game;
        if (!T.toFight()) return null;
        const p = G.player;
        G.kraken.setHp(T.KR.n1 - 5); // (phase 2: it grabs)
        // (stepped until a tentacle's warning is 0.3 s from landing on you, then real frames through the grab)
        T.stepUntil(() => { const k = T.k(); return k.grabbed || k.tentacles.some((t) => t.state === 'warn' && t.grab && t.T - t.t < 0.8); }, 45, () => (p.hp = p.maxHp));
        T.watchPops();
        const overlaps = [];
        let frames = 0;
        let stripFrames = 0;
        await T.play(2.2, () => {
          p.speed = 0;
          p.hp = p.maxHp;
          frames++;
          const strip = document.getElementById('grab-strip');
          if (strip.classList.contains('hidden')) return;
          // (the frame it shows, the pops were placed just before it: they make way from the next one)
          if (++stripFrames === 1) return;
          const s = strip.getBoundingClientRect();
          for (const el of document.querySelectorAll('#pops .pop')) {
            if (el.style.visibility === 'hidden' || getComputedStyle(el).opacity < 0.2) continue;
            for (const line of el.querySelectorAll('.pop-main, .pop-sub')) {
              const b = line.getBoundingClientRect();
              if (b.width < 1) continue;
              if (b.left < s.right && s.left < b.right && b.top < s.bottom && s.top < b.bottom) overlaps.push({ text: line.textContent, pop: [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)], strip: [Math.round(s.left), Math.round(s.top), Math.round(s.right), Math.round(s.bottom)] });
            }
          }
        });
        return { grabbed: T.k().grabbed, frames, stripFrames, pops: T.pops(), overlaps: overlaps.slice(0, 6), n: overlaps.length };
      });
      check(!!g && g.stripFrames >= 5 && g.pops.some((t) => /GRABBED/.test(t)) && g.n === 0,
        `kraken calm look ${w}x${h}: a grab's pops (${J(g && g.pops)}) keep off the grab strip over ${g && g.stripFrames} frames (${g && g.n} overlaps: ${J(g && g.overlaps)})`);
      await closeV(ctx);
    }
  });

  // The Stage 2 review's Voyage III fixes (real frames). A threat off the view gets an arrow at the screen edge it
  // comes from with its word: a lit fire ship (FIRE SHIP!) and a shark winding up (RAM!) coming from behind you on a
  // phone held upright, where the chase camera can't see them (the arrow at the bottom, pointing up at you); nothing
  // when she is in view. The arrows keep off the minimap (a rogue wave from any of 12 bearings), the REPEL BOARDERS!
  // strip and the banner. A hazard's how-to banner (ROGUE WAVE!, Fire ship!) keeps its time: a ship sunk meanwhile
  // says so once it ends.
  await section('seas-cues', async () => {
    const { ctx, page: sp } = await openV({ label: 'seas-cues', width: 390, height: 844, touch: true });
    await sp.evaluate(installFinale);
    const behind = await ev(sp, async () => {
      const G = window.__game;
      const THREE = await import('/vendor/three.module.min.js');
      const W = innerWidth;
      const H = innerHeight;
      const offView = (x, y, z) => {
        const v = new THREE.Vector3(x, y, z).applyMatrix4(G.camera.matrixWorldInverse);
        if (v.z > -1) return true;
        v.applyMatrix4(G.camera.projectionMatrix);
        const sx = ((v.x + 1) / 2) * W;
        const sy = ((1 - v.y) / 2) * H;
        return sx < 0 || sx > W || sy < 0 || sy > H;
      };
      const arrow = (id, word) => T.shown(id) && T.text(id).includes(word);
      // (a threat behind you: more than 6 u back along the way the camera looks, on the sea. Its arrow belongs in the
      // lower half of the screen, pointing up at you: its --turn within 75 deg of 0)
      const fwd = new THREE.Vector3();
      const behindYou = (x, z) => {
        G.camera.getWorldDirection(fwd);
        const l = Math.hypot(fwd.x, fwd.z) || 1;
        return ((x - G.player.x) * fwd.x + (z - G.player.z) * fwd.z) / l < -6;
      };
      const arrowWay = (id) => {
        const el = document.getElementById(id);
        const b = el.getBoundingClientRect();
        const turn = parseFloat(el.style.getPropertyValue('--turn')) || 0;
        return { y: Math.round((b.top + b.bottom) / 2), turn, ok: (b.top + b.bottom) / 2 > H / 2 && Math.min(turn % 360, 360 - (turn % 360)) <= 75 };
      };
      const out = {};
      // a fire ship 36 u off at a bearing (0 ahead, 180 behind), sailing at you while you sail on at 6 u/s
      for (const b of [180, 0]) {
        const p = T.level(8);
        await T.play(0.4, () => (p.speed = 0));
        G.state.sail = 1;
        const a = (b * Math.PI) / 180;
        const fs = T.spawn('fireship', Math.sin(a) * 36, Math.cos(a) * 36, 0);
        fs.h = Math.atan2(p.x - fs.x, p.z - fs.z);
        fs.speed = 6;
        const r = { lit: 0, litOff: 0, shownOff: 0, shownOn: 0, litOn: 0, word: false, behind: 0, wrongWay: [] };
        await T.play(9, () => {
          p.speed = 6;
          p.hp = p.maxHp;
          const lit = G.mechanics3.visuals().fireRings.some((q) => Math.hypot(q.x - fs.x, q.z - fs.z) < 0.01);
          if (!lit) return;
          r.lit++;
          const off = offView(fs.x, 1.5, fs.z);
          const on = arrow('edge-arrow-fire', 'FIRE SHIP!');
          if (off) {
            r.litOff++;
            if (on) r.shownOff++;
            if (on && behindYou(fs.x, fs.z)) {
              r.behind++;
              const way = arrowWay('edge-arrow-fire');
              if (!way.ok && r.wrongWay.length < 4) r.wrongWay.push(way);
            }
          } else {
            r.litOn++;
            if (on) r.shownOn++;
          }
        });
        out[`fire${b}`] = r;
      }
      // a Shark Raider 22 u behind you lining up her charge
      {
        const p = T.level(7);
        await T.play(0.4, () => (p.speed = 0));
        G.state.sail = 1;
        const sh = T.spawn('shark', 0, -22, 0);
        sh.h = Math.atan2(p.x - sh.x, p.z - sh.z);
        sh.speed = 4;
        const r = { wind: 0, windOff: 0, shownOff: 0, behind: 0, wrongWay: [] };
        // (stepped until she starts winding up, then real frames through her wind-up)
        const windup = () => G.mechanics3.visuals().rams.some((q) => q.state === 'windup' && Math.hypot(q.x - sh.x, q.z - sh.z) < 0.01);
        r.waited = T.stepUntil(windup, 20, () => {
          p.hp = p.maxHp;
          sh.reload.port = sh.reload.star = 99;
        });
        await T.play(1.6, () => {
          p.speed = 0;
          p.hp = p.maxHp;
          sh.reload.port = sh.reload.star = 99;
          const w = windup();
          if (!w) return;
          r.wind++;
          if (offView(sh.x, 1.5, sh.z)) {
            r.windOff++;
            const on = arrow('edge-arrow-ram', 'RAM!');
            if (on) r.shownOff++;
            if (on && behindYou(sh.x, sh.z)) {
              r.behind++;
              const way = arrowWay('edge-arrow-ram');
              if (!way.ok && r.wrongWay.length < 4) r.wrongWay.push(way);
            }
          }
        });
        out.ram = r;
      }
      return out;
    });
    const f = behind.fire180;
    check(f.litOff >= 5 && f.shownOff >= f.litOff * 0.9,
      `seas cues: a lit fire ship coming from behind you on a phone (off the view ${f.litOff} of ${f.lit} lit frames) has a FIRE SHIP! arrow at the screen edge (${f.shownOff} of those frames) (${J(f)})`);
    check(f.behind >= 3 && f.wrongWay.length === 0,
      `seas cues: while she is behind you (${f.behind} frames) the FIRE SHIP! arrow is at the bottom of the screen, pointing up at you (${f.wrongWay.length ? 'wrong way: ' + J(f.wrongWay) : 'all'})`);
    const f0 = behind.fire0;
    check(f0.lit >= 5 && f0.litOn >= 5 && f0.shownOn === 0,
      `seas cues: a lit fire ship ahead, in view (${f0.litOn} frames), gets no arrow (${J(f0)})`);
    const rm = behind.ram;
    check(rm.windOff >= 3 && rm.shownOff >= rm.windOff * 0.9,
      `seas cues: a Shark Raider winding up behind you (off the view ${rm.windOff} frames) has a RAM! arrow (${rm.shownOff} of them) (${J(rm)})`);
    check(rm.behind >= 3 && rm.wrongWay.length === 0,
      `seas cues: while the shark winds up behind you (${rm.behind} frames) the RAM! arrow is at the bottom of the screen, pointing up at you (${rm.wrongWay.length ? 'wrong way: ' + J(rm.wrongWay) : 'all'})`);

    // The WAVE! arrow from 12 bearings round your bow keeps off the minimap and the boss bar.
    const spots = await ev(sp, async () => {
      const G = window.__game;
      const R = (el) => {
        if (!el || el.classList.contains('hidden') || !el.getClientRects().length) return null;
        const b = el.getBoundingClientRect();
        return { l: b.left, t: b.top, r: b.right, b: b.bottom };
      };
      const hits = (a, b) => !!a && !!b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      const out = [];
      for (let d = 0; d < 360; d += 30) {
        const p = T.level(8);
        G.mechanics3.wave(p.h + (d * Math.PI) / 180);
        await T.play(0.3, () => (p.speed = 0));
        const a = R(document.getElementById('edge-arrow'));
        const map = R(document.getElementById('minimap'));
        out.push({ d, shown: !!a, map: hits(a, map), a: a && [Math.round(a.l), Math.round(a.t), Math.round(a.r), Math.round(a.b)] });
      }
      return out;
    });
    const onMap = spots.filter((s) => !s.shown || s.map);
    check(spots.length === 12 && onMap.length === 0,
      `seas cues: the WAVE! arrow from 12 bearings round your bow on a phone keeps off the minimap (${onMap.length ? J(onMap) : 'all clear'})`);

    // A hazard's how-to banner keeps its time: a ship sunk 0.5 s into ROGUE WAVE! (and into Fire ship!) waits.
    const hold = await ev(sp, async () => {
      const G = window.__game;
      const out = {};
      for (const kind of ['rogue', 'fire']) {
        const p = T.level(8);
        const a = T.spawn('corsair', 30, 40);
        T.spawn('corsair', -30, 40);
        a.reload.port = a.reload.star = 99;
        await T.play(0.3, () => (p.speed = 0));
        if (kind === 'rogue') G.mechanics3.wave(p.h + Math.PI / 2);
        else {
          const fs = T.spawn('fireship', -16, -16, 0);
          fs.speed = 0;
          // (until she lights her fuse)
          T.stepUntil(() => G.mechanics3.visuals().fireRings.length > 0, 5);
        }
        await T.play(0.5, () => (p.speed = 0));
        const first = T.banner();
        G.damage(a, 9999, a.x, a.z);
        await T.play(0.6, () => (p.speed = 0));
        const during = T.banner();
        await T.play(3.2, () => {
          p.speed = 0;
          p.hp = p.maxHp;
        });
        const after = T.banner();
        out[kind] = { first, during, after };
      }
      return out;
    });
    for (const [kind, word] of [['rogue', 'ROGUE WAVE!'], ['fire', 'Fire ship!']]) {
      const o = hold[kind];
      check(o.first.startsWith(word) && o.during.startsWith(word) && /sunk!/.test(o.after),
        `seas cues: "${word}" keeps the banner while a ship is sunk 0.5 s into it ("${o.during}"), then "${o.after}" (${J(o)})`);
    }
    await closeV(ctx);

    // The REPEL BOARDERS! strip at the top and a rogue wave from ahead: its arrow keeps off the strip (desktop, phone).
    for (const [w, h, touch] of [[1280, 720, false], [390, 844, true]]) {
      const { ctx: bc, page: bp } = await openV({ label: `seas-cues boarders ${w}x${h}`, width: w, height: h, touch });
      const r = await ev(bp, async () => {
        const G = window.__game;
        const R = (el) => {
          if (!el || el.classList.contains('hidden') || !el.getClientRects().length) return null;
          const b = el.getBoundingClientRect();
          return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) };
        };
        const p = T.level(8);
        const raider = T.spawn('corsair', -7, 0);
        await T.play(0.3, () => (p.speed = 0));
        const raided = G.boarding.raid(raider);
        G.mechanics3.wave(p.h);
        const seen = [];
        await T.play(1.5, () => {
          p.speed = 0;
          p.hp = p.maxHp;
          const a = R(document.getElementById('edge-arrow'));
          const s = R(document.getElementById('boarding-strip'));
          const bn = R(document.getElementById('banner'));
          const over = (q) => !!q && a.l < q.r && q.l < a.r && a.t < q.b && q.t < a.b;
          if (a && s) seen.push({ a, s, bn, hit: over(s) || over(bn) });
        });
        return { raided, frames: seen.length, banners: seen.filter((x) => !!x.bn).length, hits: seen.filter((x) => x.hit).length, last: seen[seen.length - 1] || null, strip: T.text('boarding-strip').slice(0, 30) };
      });
      check(r.raided && r.frames >= 3 && r.banners >= 3 && r.hits === 0,
        `seas cues ${w}x${h}: a rogue wave from ahead while raiders board you: its WAVE! arrow keeps off the "${r.strip}" strip and the ROGUE WAVE! banner (${r.hits} of ${r.frames} frames on one, the banner up in ${r.banners}) (${J(r.last)})`);
      await closeV(bc);
    }
  });

  // ------------------------------------------------------------------------------------------------ the journey
  // The title once the Kraken Seas sail (SPEC3 §5.2, §6.6): Voyage III's three cards under their own heading, card 7
  // locked with "Beat the Phantom Galleon"; the save migration (§10.3): progress at 6 with the legend feat (the Phantom
  // taken) opens card 7 at load and saves it, without the feat nothing opens; the Maelstrom's Victory says "Sail on to
  // the Kraken Seas" (with the teaser), the won shipyard sails on to the Turtle Atolls, and Enter starts level 7 with
  // the voyage gold.
  await section('voyage', async () => {
    const title = async (store, label) => {
      const { ctx, page: tp } = await openV({ label, store });
      const r = await tp.evaluate(() => {
        const grid = document.getElementById('level-cards');
        return {
          order: [...grid.children].map((el) => (el.matches('.act-head') ? `H:${el.textContent.trim()}` : el.matches('.level-card') ? `C${el.dataset.level}` : el.tagName)),
          cards: [...grid.querySelectorAll('.level-card')].map((b) => ({
            n: Number(b.dataset.level),
            name: (b.querySelector('.lvl-name') || {}).textContent,
            word: (b.querySelector('.diff-word') || {}).textContent,
            lock: ((b.querySelector('.lvl-lock') || {}).textContent || '').trim(),
            locked: b.getAttribute('aria-disabled') === 'true',
          })),
          unlocked: window.__game.state.unlocked,
          saved: localStorage.getItem('pirates-ahoy-unlocked'),
        };
      });
      await closeV(ctx);
      return r;
    };
    const fresh = await title({ 'pirates-ahoy-tutorial-done': '1' }, 'voyage title');
    const three = fresh.cards.slice(6);
    check(fresh.cards.length === 9 && fresh.order.slice(-4).join(' | ') === 'H:Voyage III · The Kraken Seas | C7 | C8 | C9' &&
      three.map((c) => `${c.name}/${c.word}`).join() === "The Turtle Atolls/Daring,The Cape of Storms/Fearsome,The Kraken's Deep/Mythic" &&
      three.every((c) => c.locked) && three[0].lock === 'Beat the Phantom Galleon' && three[1].lock === 'Locked' && three[2].lock === 'Locked',
      `voyage: the title's cards 7-9 sit under "Voyage III · The Kraken Seas", locked, card 7 reading "${three[0] && three[0].lock}" (${J({ order: fresh.order, three })})`);
    const FEATS = (legend) => JSON.stringify({ captures: 3, boardings: 2, rakes: 1, crits: 0, legend, prizes: {} });
    const mig1 = await title({ 'pirates-ahoy-tutorial-done': '1', 'pirates-ahoy-unlocked': '6', 'pirates-ahoy-feats': FEATS(1) }, 'voyage migration');
    const mig0 = await title({ 'pirates-ahoy-tutorial-done': '1', 'pirates-ahoy-unlocked': '6', 'pirates-ahoy-feats': FEATS(0) }, 'voyage no migration');
    const opened = (r) => r.cards.map((c) => (c.locked ? 'L' : 'P')).join('');
    check(mig1.unlocked === 7 && mig1.saved === '7' && opened(mig1) === 'PPPPPPPLL' && mig1.cards[6].lock === 'Play',
      `voyage: a save from before the Kraken Seas with the Far Seas won (6 open, the legend feat) opens card 7 at load and saves it (${J({ unlocked: mig1.unlocked, saved: mig1.saved, cards: opened(mig1), lock7: mig1.cards[6].lock })})`);
    check(mig0.unlocked === 6 && mig0.saved === '6' && opened(mig0) === 'PPPPPPLLL' && mig0.cards[6].lock === 'Beat the Phantom Galleon',
      `voyage: without the legend feat (the Phantom not taken yet) it stays at 6, card 7 "${mig0.cards[6].lock}" (${J({ unlocked: mig0.unlocked, saved: mig0.saved, cards: opened(mig0) })})`);

    // The Maelstrom won (the Phantom Galleon taken) with 400 gold of voyage plunder so far.
    const { ctx, page: wp } = await openV({ label: 'voyage maelstrom', store: { ...STORE, 'pirates-ahoy-unlocked': '6' } });
    const winL6 = () => ev(wp, async () => {
      const G = window.__game;
      T.level(6);
      G.state.gold = 400;
      G.state.goldAtLevelStart = 400;
      for (let w = 0; w < 6 && G.state.mode === 'playing'; w++) {
        for (const e of G.enemies) {
          if (!G.fighting(e)) continue;
          if (e.type.ghost) {
            e.rise = 0;
            G.capture.take(e); // (she can't be sunk: the last blow is a capture)
          } else G.damage(e, 9999);
        }
        T.steps(1, () => G.state.mode === 'playing');
      }
      T.steps(10, () => G.state.mode === 'playing');
      await T.redraw();
      const { ACT3_TEASER } = await import(new URL('src/voyage.js', location.href).href);
      const panel = document.querySelector('#won-screen .panel') || document.getElementById('won-screen');
      const first = [...panel.querySelectorAll('button')].find((b) => !b.closest('.hidden') && b.getClientRects().length);
      return {
        mode: G.state.mode,
        gold: G.state.gold,
        text: T.text('won-text'),
        teaser: ACT3_TEASER,
        act2: T.shown('act2-btn'),
        act2Text: T.text('act2-btn'),
        first: first && first.id,
        hint: T.shown('won-hint') ? T.text('won-hint') : null,
        unlocked: G.state.unlocked,
        saved: localStorage.getItem('pirates-ahoy-unlocked'),
      };
    });
    const w1 = await winL6();
    check(w1.mode === 'won' && w1.text.endsWith(` ${w1.teaser}`) && w1.act2 && w1.act2Text === 'Sail on to the Kraken Seas' && w1.first === 'act2-btn' && !!w1.hint && /Enter/.test(w1.hint) && w1.unlocked === 7 && w1.saved === '7' && w1.gold > 400,
      `voyage: the Maelstrom's Victory ends with the teaser ("${w1.teaser}"), "${w1.act2Text}" is its first button, a hint says Enter sails on, level 7 opens and is saved (${J(w1)})`);
    const dock = await wp.evaluate(() => {
      const G = window.__game;
      G.dock.open('won');
      const exits = [...document.querySelectorAll('#dock-exits button')].map((b) => b.textContent.trim()).join(' | ');
      return { from: G.dock.from, exits };
    });
    check(dock.exits === 'Set sail for The Turtle Atolls | Back to the title', `voyage: the won shipyard after the Maelstrom sails on: "${dock.exits}"`);
    const w2 = await winL6();
    await wp.keyboard.press('Enter');
    await wp.waitForFunction(() => window.__game.state.mode === 'playing', null, { timeout: 60000 }).catch(() => {});
    const s2 = await wp.evaluate(() => ({ mode: window.__game.state.mode, level: window.__game.state.level, gold: window.__game.state.gold, atStart: window.__game.state.goldAtLevelStart, name: window.__game.LEVELS[window.__game.state.level - 1].env.meta.name }));
    check(w2.mode === 'won' && s2.mode === 'playing' && s2.level === 7 && s2.name === 'The Turtle Atolls' && s2.gold === w2.gold && s2.atStart === w2.gold,
      `voyage: Enter on the Maelstrom's Victory sets sail for the Turtle Atolls with the voyage gold (${J({ ...s2, wonGold: w2.gold })})`);
    await closeV(ctx);
  });

  // ------------------------------------------------------------------------------------------------ bot v3
  // Bot v3 (SPEC3 §13.3, agent 3B's balance bot; the late-game ship of §5.9): one seeded run of each Voyage III level
  // with special shot and one with none (the recipes not owned). Each level is cleared within 900 s of simulated time
  // (a second try allowed: a lost Kraken fight tries again from the Kraken, as a player would), the bot is never stuck
  // (60 s without any ship, wave or Kraken bar changing), the Kraken's fight lasts at most 240 s, and the ship never ends
  // up inside land. (The order L7 < L8 < L9 and the fight's 120-180 s band are Stage 3's 24-seed medians, not CI checks:
  // §5.9.) Each run reseeds Math.random and the combat dice, so it is the same run every time on the same code.
  await section('bot', async () => {
    const { ctx, page: bp } = await openV({ label: 'bot', width: 640, height: 360 });
    const SPECIAL = await bp.evaluate(async () => JSON.parse(JSON.stringify((await import(new URL('src/specials.js', location.href).href)).SPECIAL)));
    await bp.evaluate(() => (window.__game.state.mode = 'paused'));
    const won = (r) => r.result === 'levelDone' || r.result === 'won';
    for (const specials of [true, false]) {
      for (const n of [7, 8, 9]) {
        const tries = [];
        let r = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          const retry = attempt === 2 && r && r.kraken && r.kraken.checkpoint && r.result === 'over' ? 'kraken' : null;
          r = await bp.evaluate(botV3, { n, profile: 'late', specials, strategy: 'circle', seed: 1 + (attempt - 1) * 1000, maxT: 900, SPECIAL, retry });
          tries.push(r);
          if (won(r)) break;
        }
        const last = tries[tries.length - 1];
        const fight = tries.map((x) => x.kraken && x.kraken.fight).filter((x) => x !== null && x !== undefined);
        const sum = tries.map((x) => ({ result: x.result, time: x.time, dmg: x.damageTaken, hpLeft: x.hpLeft, noProgress: Math.round(x.noProgress), stuck: x.stuck, spent: x.spent, left: x.left, kraken: x.kraken && { fight: x.kraken.fight, done: x.kraken.done, hpLeft: x.kraken.hpLeft } }));
        console.log(`      bot L${n} ${specials ? 'specials' : 'no specials'}: ${J(sum)}`);
        const spent = tries.reduce((k, x) => k + (x.spent ? x.spent.fire + x.spent.frost + x.spent.stink : 0), 0);
        check(won(last) && tries.every((x) => x.time <= 900) && (specials ? spent > 0 : spent === 0 && J(tries[0].loads) === '{"fire":0,"frost":0,"stink":0}'),
          `bot: the late-game ship ${specials ? 'with special shot' : 'with no special shot (no recipe owned)'} clears level ${n} within 900 s, a second try allowed (${tries.map((x) => `${x.result} ${x.time} s`).join(' > ')}; ${spent} special loads fired)`);
        check(tries.every((x) => x.noProgress < 60 && x.stuck === 0),
          `bot: level ${n} ${specials ? 'with specials' : 'without'}: never 60 s without progress (longest ${Math.max(...tries.map((x) => Math.round(x.noProgress)))} s), never inside land (${tries.reduce((k, x) => k + x.stuck, 0)} frames)`);
        if (n === 9) {
          check(fight.length > 0 && fight.every((f) => f <= 240) && !!last.kraken && last.kraken.done,
            `bot: the Kraken ${specials ? 'with specials' : 'without'} is driven off, each fight within 240 s (${J(fight)} s)`);
        }
      }
    }
    await closeV(ctx);
  });

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 8).join(' | ') : ''}`);
  await browser.close();
  server.close();
  console.log(`\nvoyage3.cjs: ${passes} passed, ${failures} failed`);
  console.log(failures ? `${failures} check(s) failed` : 'All Voyage III checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
