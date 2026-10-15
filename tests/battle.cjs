// Battle suite for "Boarders Away!" (SPEC2 §11.2): serves the game, drives it in headless Chromium and checks
// the new battle systems through the window.__game test API (§9.3):
// - damage variety: rakes, range fall-off, crits and their effects, enemy rakes scaled per level
// - ammo: locked until unlocked, R / 1-3 / the touch pill, swap time, chain slows, grape kills crew, ranges
// - crew: thinned by the hull (half at most), tag pips and the surrender notch, surrender, auto-capture,
//   reinforcements, a full crew at every level
// - boarding: refusals, G and the Board pill, phases and timings, truce, odds = outcome, capture gold,
//   surrender capture, context loss, pause, the glued pair, reduced motion
// - raiders, the Phantom Galleon, HUD and layout, audio, draw calls, saved records, Act II (?act2=1), and
//   leaving the battle from the pause dialog in the middle of a raid
// The simulation is frozen (the real-time loop is paused) and driven with G.step(1/120) like smoke.cjs;
// crits are pinned with G.combat.seed() / forceCrit(). Run with `npm test` or `npm run test:battle`
// (BATTLE_ONLY=damage,ammo runs some sections; BATTLE_ROOT serves another copy of the game).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('./server.cjs');

const ROOT = process.env.BATTLE_ROOT || path.join(__dirname, '..');
const OUT = process.env.SCREENSHOT_DIR || path.join(ROOT, 'tests', 'screenshots');
const ONLY = (process.env.BATTLE_ONLY || '').split(',').filter(Boolean);
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
const SUB = 1 / 120; // one simulation substep

// ---------------------------------------------------------------------------------------------------------
// In-page helpers (installed after every page load as window.T)
// ---------------------------------------------------------------------------------------------------------
function installHelpers() {
  const G = window.__game;
  const fwdX = Math.sin;
  const fwdZ = Math.cos;
  const rightX = (h) => -Math.cos(h);
  const rightZ = (h) => Math.sin(h);
  const T = {
    // Level n for a frozen-loop scenario: the player stopped at the level's start (where the camera is),
    // land and reefs moved out of the way, past the grace period. The level's own ships are parked out of
    // reach on the far side of the sea (a ship with `rise` > 0 has no AI, fires nothing and is never hit),
    // so they still count as the wave in the fight.
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
      G.enemies.forEach((e, k) => T.park(e, k));
      G.state.combatTime = 30;
      G.combat.forceCrit(null);
      G.combat.seed(1);
      G.combat.clearLog();
      return p;
    },
    park(e, k = 0) {
      const ps = G.env.playerStart;
      const d = Math.hypot(ps.x, ps.z) || 1;
      const R = G.env.worldRadius - 6;
      e.rise = 1e6;
      e.x = (-ps.x / d) * R + (ps.z / d) * 9 * k;
      e.z = (-ps.z / d) * R - (ps.x / d) * 9 * k;
      e.speed = 0;
    },
    // A new enemy `lat` off the player's beam (+ starboard), `along` ahead, heading the player's + `turn`
    // (-PI/2 to starboard of you: a shot from your starboard battery enters over her stern).
    spawn(type, lat, along = 0, turn = 0) {
      const p = G.player;
      const e = G.spawn(type, p.x + rightX(p.h) * lat + fwdX(p.h) * along, p.z + rightZ(p.h) * lat + fwdZ(p.h) * along, p.h + turn);
      e.speed = 0;
      e.rise = 0;
      return e;
    },
    // Move a ship to `lat` off the player's beam, `along` ahead, heading the player's + `turn`.
    place(e, lat, along = 0, turn = 0) {
      const p = G.player;
      G.place(e, p.x + rightX(p.h) * lat + fwdX(p.h) * along, p.z + rightZ(p.h) * lat + fwdZ(p.h) * along, p.h + turn);
      e.speed = 0;
    },
    wrap: (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2)),
    // G pressed and let go (the game's own key handler).
    g() {
      T.key('g', 'KeyG');
      T.key('g', 'KeyG', { type: 'keyup' });
    },
    steps(s, each) {
      const n = Math.round(s * 120);
      for (let i = 0; i < n; i++) {
        G.step(1 / 120);
        if (each && each(i) === false) return i + 1;
      }
      return n;
    },
    // Hold ships where they are (stopped; enemies don't fire) while stepping.
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
    // Fire at `e` (a player broadside by default) and run `seconds` with both ships held still. Returns the
    // player's hits on her from the shot log, her hull and crew lost.
    volley(e, { side = 1, seconds = 2, fire = null } = {}) {
      const p = G.player;
      G.combat.clearLog();
      p.reload.port = p.reload.star = 0;
      const hold = T.pinner(p, e);
      hold();
      const hp0 = e.hp;
      const killed0 = e.killed;
      const ok = fire ? fire() : G.playerFire(side);
      T.steps(seconds, hold);
      const hits = G.combat.log.filter((l) => l.owner === 'player' && l.targetId === e.id);
      return { ok, hits, dhp: hp0 - e.hp, dkilled: e.killed - killed0, t: G.state.time };
    },
    key(key, code, { type = 'keydown', repeat = false } = {}) {
      window.dispatchEvent(new KeyboardEvent(type, { key, code, repeat, bubbles: true, cancelable: true }));
    },
    // Draw one frame of the paused scene (the HUD, tags and minimap update; no time passes).
    redraw() {
      window.dispatchEvent(new Event('resize'));
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    },
    // Let the real loop run for n frames (a little simulated time passes), then freeze again.
    async live(n = 2) {
      G.state.mode = 'playing';
      for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r));
      G.state.mode = 'paused';
    },
    shown: (id) => {
      const el = document.getElementById(id);
      return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0;
    },
    text: (id) => (document.getElementById(id)?.textContent || '').replace(/\s+/g, ' ').trim(),
    // The colour of a ship's dot on the minimap ([r, g, b] at its centre).
    mapColor(e) {
      const c = document.getElementById('minimap');
      const S = c.width;
      const scale = (S / 2 - 6) / (G.env.worldRadius * 0.75);
      const r = G.relative(G.player, e.x, e.z);
      const d = c.getContext('2d').getImageData(Math.round(S / 2 + r.lat * scale), Math.round(S / 2 - r.along * scale), 1, 1).data;
      return [d[0], d[1], d[2]];
    },
    // A seeded stand-in for Math.random (mulberry32): a volley's aim spread is then the same on every run.
    seeded(seed) {
      let s = seed | 0;
      return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    // Real frames (calling `hold` every frame) until the chase camera stops turning: it eases toward the
    // nearest pirate in range. Frozen again afterwards; returns the number of frames.
    async settle(hold, max = 400) {
      const d = G.camera.getWorldDirection(G.camera.position.clone());
      const was = d.clone();
      let still = 0;
      let n = 0;
      G.state.mode = 'playing';
      while (n < max && still < 3) {
        await new Promise((r) => requestAnimationFrame(r));
        hold();
        n++;
        G.camera.getWorldDirection(d);
        still = d.angleTo(was) < 2e-4 ? still + 1 : 0;
        was.copy(d);
      }
      G.state.mode = 'paused';
      return n;
    },
    // What a real frame shows of the pops ('#pops .pop': text, shown, opacity, the box of the big line and of
    // the whole word) and the bottom of the top HUD row (boxes as { l, t, r, b } in CSS px).
    popFrame() {
      const R = (r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
      const top = document.querySelector('#hud .hud-top');
      return {
        pops: [...document.querySelectorAll('#pops .pop')]
          .filter((s) => s.style.display !== 'none')
          .map((s) => ({ text: s.textContent, shown: s.style.visibility !== 'hidden', o: Number(s.style.opacity), main: R(s.querySelector('.pop-main').getBoundingClientRect()), whole: R(s.getBoundingClientRect()) })),
        top: top.getBoundingClientRect().bottom,
        cards: [...top.children].map((c) => R(c.getBoundingClientRect())).filter((c) => c.r > c.l),
      };
    },
    // One broadside at `e` from `side` (aim seeded, crit forced), with `hold` keeping the ships where they are:
    // frozen while the balls fly, until the volley is done (its HIT mark pops and the volley's pops appear),
    // then real frames until `seconds` of play have passed. The mark's animation is driven by the battle's clock
    // as the pops are (a slow renderer's frame can take longer than the play it shows). Each frame: T.popFrame()
    // and the mark (opacity, text and the box of its text). Frozen again afterwards.
    async salvo(e, { side = 1, crit = 'none', seed = 1, seconds = 1.8, hold = () => {} } = {}) {
      const p = G.player;
      const hm = document.getElementById('hitmark');
      G.state.mode = 'playing'; // (one synchronous stretch: no frame runs while the balls fly)
      hold();
      hm.classList.remove('popped');
      G.combat.forceCrit(crit);
      p.reload.port = p.reload.star = 0;
      const random = Math.random;
      Math.random = T.seeded(seed);
      let fired = false;
      let steps = 0;
      try {
        fired = G.playerFire(side);
        while (steps < 600 && !hm.classList.contains('popped')) {
          G.step(1 / 120);
          hold();
          steps++;
        }
      } finally {
        Math.random = random;
        G.combat.forceCrit(null);
      }
      const t0 = G.state.time;
      const anims = document.getAnimations().filter((a) => a.effect && a.effect.target === hm);
      anims.forEach((a) => {
        a.pause();
        a.currentTime = 0;
      });
      const mark = () => {
        const tn = [...hm.childNodes].find((c) => c.nodeType === 3);
        let box = null;
        if (tn) {
          const rg = document.createRange();
          rg.selectNodeContents(tn);
          const r = rg.getBoundingClientRect();
          box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
        }
        return { o: Number(getComputedStyle(hm).opacity), text: hm.textContent, box };
      };
      const frames = [];
      while (G.state.time - t0 < seconds && frames.length < 400) {
        await new Promise((r) => requestAnimationFrame(r));
        hold();
        anims.forEach((a) => (a.currentTime = Math.min(a.effect.getComputedTiming().endTime, (G.state.time - t0) * 1000)));
        frames.push({ t: Math.round((G.state.time - t0) * 1000) / 1000, ...T.popFrame(), hm: mark() });
      }
      G.state.mode = 'paused';
      anims.forEach((a) => a.finish());
      return { fired, steps, mark: hm.textContent, frames, W: innerWidth, H: innerHeight };
    },
    // Everything written to #game-live from now on (text and performance.now()), read with T.liveLog().
    watchLive() {
      const el = document.getElementById('game-live');
      if (!window.__liveLog) {
        window.__liveLog = { list: [], at: -Infinity };
        new MutationObserver(() => {
          window.__liveLog.list.push(el.textContent);
          window.__liveLog.at = performance.now();
        }).observe(el, { childList: true, characterData: true, subtree: true });
      }
      window.__liveLog.list.length = 0;
      window.__liveLog.at = performance.now(); // (something may have been said just before)
    },
    liveLog: () => window.__liveLog.list.slice(),
    // #game-live speaks at most once per 1.5 s (a newer line waits, and is written by a later frame): wait until
    // it has been quiet that long, so the next line is written at once.
    // (Frozen meanwhile: nothing moves on.)
    async liveQuiet() {
      const mode = G.state.mode;
      G.state.mode = 'paused';
      const quiet = async () => {
        while (performance.now() - window.__liveLog.at < 1600) await new Promise((r) => setTimeout(r, 100));
      };
      await quiet();
      await T.redraw(); // (a line still waiting is written now)
      await quiet();
      G.state.mode = mode;
    },
  };
  window.T = T;
}

// What the frames of a T.salvo() (or of T.popFrame()s with a `hm`) show: the pops seen (opacity over `o`),
// pairs of pops whose big lines overlap, pops over the HIT mark's text (while the mark shows), pops reaching
// into the top HUD row's cards, and pops sticking out of the screen.
function popReport(r, o = 0.3) {
  const ov = (a, b) => {
    const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
    const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    return w > 2 && h > 2 ? Math.round(w * h) : 0;
  };
  const out = { frames: r.frames.length, seen: [], popPop: [], onMark: [], onTop: [], offScreen: [] };
  const seen = new Set();
  for (const f of r.frames) {
    const ps = f.pops.filter((p) => p.shown && p.o > o);
    ps.forEach((p) => seen.add(p.text));
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ov(ps[i].main, ps[j].main);
        if (a) out.popPop.push(`${f.t}s ${ps[i].text}/${ps[j].text} ${a}px²`);
      }
    }
    if (f.hm && f.hm.o > o && f.hm.box) {
      for (const p of ps) {
        const a = ov(p.whole, f.hm.box);
        if (a) out.onMark.push(`${f.t}s "${p.text}" on "${f.hm.text}" ${a}px²`);
      }
    }
    for (const p of ps) {
      const card = f.cards.find((c) => ov(p.whole, c));
      if (card) out.onTop.push(`${f.t}s "${p.text}" top ${Math.round(p.whole.t)} over a card down to ${Math.round(card.b)}`);
      if (p.whole.l < -1 || p.whole.r > r.W + 1 || p.whole.t < -1 || p.whole.b > r.H + 1) out.offScreen.push(`${f.t}s "${p.text}"`);
    }
  }
  out.seen = [...seen];
  for (const k of ['popPop', 'onMark', 'onTop', 'offScreen']) if (out[k].length > 6) out[k] = [...out[k].slice(0, 6), `(+${out[k].length - 6} more)`];
  return out;
}

// Run `fn` (a function of no free variables, source-serialised) in the page with the game playing for that
// one synchronous stretch (the real loop can't run in between), frozen again afterwards.
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
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ args: BROWSER_ARGS });
  const errors = [];
  const watch = (p, label) => {
    p.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
    p.on('console', (m) => m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text()) && errors.push(`${label}: ${m.text()}`));
    p.on('console', (m) => m.type() === 'warning' && /^audio:/.test(m.text()) && errors.push(`${label}: ${m.text()}`));
  };
  // A page of the game. store: localStorage records set before the game loads.
  async function open({ width = 1280, height = 720, touch = false, query = '?quality=low', store = null, label = 'page' } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    if (store) await ctx.addInitScript((s) => { try { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); } catch {} }, store);
    const page = await ctx.newPage();
    watch(page, label);
    await page.goto(base + query, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__gameReady === true && window.__game && window.__game.env, null, { timeout: 120000 });
    await page.evaluate(installHelpers);
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

  const main = await open({ label: 'desktop' });
  const page = main.page;

  // ------------------------------------------------------------------------------------------------ damage
  await section('damage', async () => {
    // (Act II joins the voyage once levels.js sets WITH_ACT2; until then only with ?act2=1, see 'act2')
    const levels = await page.evaluate(async () => ({ n: window.__game.LEVELS.length, act2: (await import('/src/levels.js')).WITH_ACT2 }));
    check(levels.n === (levels.act2 ? 6 : 3), `the voyage has ${levels.n} levels (Act II ${levels.act2 ? 'on' : 'only with ?act2=1'})`);
    // Same centre distance (24 u: every ball's travel is in the flat 14-24 band), crits off: beam-on, stern-on
    // (her keel lies along the shot, which enters over her stern) and bow-on.
    const aspect = await ev(page, () => {
      const G = window.__game;
      T.level(1);
      G.combat.forceCrit('none');
      const out = {};
      for (const [name, h] of [['beam', 0], ['stern', -Math.PI / 2], ['bow', Math.PI / 2]]) {
        const e = T.spawn('privateer', 24, 0, h);
        const v = T.volley(e);
        out[name] = v.hits.map((l) => ({ dmg: l.dmg, rangeMul: l.rangeMul, aspect: l.aspect, aspectMul: l.aspectMul, crit: l.crit, dist: Math.round(l.dist * 100) / 100 }));
        out[name + 'Hp'] = v.dhp;
        G.capture.escape(e);
      }
      return out;
    });
    // (aim spread is random: compared ball by ball, and each hull loss is the sum of its balls)
    const per = (k) => aspect[k].map((h) => h.dmg);
    const sum = (k) => per(k).reduce((a, b) => a + b, 0);
    const flat = ['beam', 'stern', 'bow'].every((k) => aspect[k].length >= 2 && aspect[k].every((h) => h.rangeMul === 1 && h.crit === false) && aspect[k + 'Hp'] === sum(k));
    check(flat && per('beam').every((d) => d === 10) && aspect.beam.every((h) => h.aspect === null && h.aspectMul === 1), `beam-on at 24 u: each ball does 10 (${J(aspect.beam)})`);
    check(flat && per('stern').every((d) => d === 2 * 10) && aspect.stern.every((h) => h.aspect === 'stern' && h.aspectMul === 2), `stern-on at the same range: each ball does 2.0x the beam-on damage (hull -${aspect.sternHp} vs -${aspect.beamHp}) (${J(aspect.stern)})`);
    check(flat && per('bow').every((d) => d === 1.5 * 10) && aspect.bow.every((h) => h.aspect === 'bow' && h.aspectMul === 1.5), `bow-on at the same range: each ball does 1.5x the beam-on damage (hull -${aspect.bowHp} vs -${aspect.beamHp}) (${J(aspect.bow)})`);

    // Range fall-off by the ball's travel from the muzzle (G.combat.log.dist): 8 / 18 / 30 u -> 1.25 / 1.0 / 0.85.
    // Her centre goes where the first ball travelled `want` units (one adjusting shot).
    const ranges = await ev(page, () => {
      const G = window.__game;
      T.level(1);
      G.combat.forceCrit('none');
      const rangeMul = G.combat.rules.rangeMul;
      const out = [];
      for (const want of [8, 18, 30]) {
        let cd = want + 4;
        let v = null;
        for (let k = 0; k < 3; k++) {
          const e = T.spawn('privateer', cd, 0, 0);
          v = T.volley(e);
          G.capture.escape(e);
          const d = v.hits[0] ? v.hits[0].dist : null;
          if (d === null || Math.abs(d - want) <= 0.3) break;
          cd += want - d;
        }
        out.push({ want, hits: v.hits.map((l) => ({ dist: l.dist, rangeMul: l.rangeMul, dmg: l.dmg, pointBlank: l.pointBlank, formula: rangeMul(l.dist) })) });
      }
      return out;
    });
    for (const r of ranges) {
      const expect = { 8: 1.25, 18: 1, 30: 0.85 }[r.want];
      const h = r.hits;
      // (aim spread makes the balls' travel differ a little; the one nearest the wanted distance is read)
      const best = [...h].sort((a, b) => Math.abs(a.dist - r.want) - Math.abs(b.dist - r.want))[0];
      const ok =
        h.length >= 2 &&
        h.every((x) => Math.abs(x.dist - r.want) <= 0.8 && near(x.rangeMul, x.formula, 1e-9) && near(x.dmg, 10 * x.rangeMul, 1e-9) && x.pointBlank === (x.dist <= 10)) &&
        Math.abs(best.dist - r.want) <= 0.3 && Math.abs(best.rangeMul - expect) <= 0.0076 &&
        (r.want === 30 || h.every((x) => x.rangeMul === expect));
      check(ok, `range multiplier at ${r.want} u of travel is ${expect}${r.want === 8 ? ' (POINT BLANK)' : ''}: ${J(h.map((x) => [Math.round(x.dist * 100) / 100, x.rangeMul, x.dmg]))}`);
    }

    // Forced crits and their effects (SPEC2 §2.3), one fresh privateer beam-on at 20 u for each.
    const crits = await ev(page, () => {
      const G = window.__game;
      T.level(1);
      const out = {};
      const fx = (e) => G.combat.effects(e);
      // rudder: turn x0.25 for 6 s; one new effect per 3 s (the volley's other crits still hit x1.75)
      {
        const e = T.spawn('privateer', 20, 0, 0);
        G.combat.forceCrit('rudder');
        const v = T.volley(e, { seconds: 1.5 });
        const since = G.state.time - v.hits[0].t;
        out.rudder = { hits: v.hits.map((l) => ({ crit: l.crit, effect: l.effect, dmg: l.dmg, rangeMul: l.rangeMul })), turnMul: fx(e).turnMul, speedMul: fx(e).speedMul, left: fx(e).rudder, since };
        G.combat.forceCrit('none');
        T.steps(6 - since - 0.05, T.pinner(G.player, e));
        out.rudder.before = fx(e).turnMul;
        T.steps(0.1, T.pinner(G.player, e));
        out.rudder.after = fx(e).turnMul;
        G.capture.escape(e);
      }
      // mast down: speed cap x0.5 for 8 s and her top sail drops
      {
        const e = T.spawn('privateer', 20, 0, 0);
        G.combat.forceCrit('mast');
        const v = T.volley(e, { seconds: 1.5 });
        const since = G.state.time - v.hits[0].t;
        out.mast = { effect: v.hits[0].effect, speedMul: fx(e).speedMul, cap: fx(e).speedCap, max: e.type.maxSpeed, mastDown: !!e.mesh.userData.mastDown, turnMul: fx(e).turnMul };
        G.combat.forceCrit('none');
        T.steps(8 - since + 0.05, T.pinner(G.player, e));
        out.mast.after = { speedMul: fx(e).speedMul, mastDown: !!e.mesh.userData.mastDown };
        G.capture.escape(e);
      }
      // powder keg: +12 at once, then 1 hp every 0.5 s for 4 s (8 ticks)
      {
        const e = T.spawn('privateer', 20, 0, 0);
        G.combat.forceCrit('keg');
        const hp0 = e.hp;
        const v = T.volley(e, { seconds: 1.2 });
        const sum = v.hits.reduce((n, l) => n + l.dmg, 0);
        const since = G.state.time - v.hits[0].t;
        out.keg = { effect: v.hits[0].effect, sum, drop: hp0 - e.hp, ticks0: fx(e).burnTicks, since, early: Math.floor(since / 0.5 + 1e-6) };
        G.combat.forceCrit('none');
        const hp1 = e.hp;
        T.steps(4.2 - since, T.pinner(G.player, e));
        out.keg.burned = hp1 - e.hp;
        out.keg.ticks = fx(e).burnTicks;
        G.capture.escape(e);
      }
      // crew routed: +2 crew killed (round shot kills nobody by itself)
      {
        const e = T.spawn('privateer', 20, 0, 0);
        G.combat.forceCrit('routed');
        const v = T.volley(e, { seconds: 1.5 });
        out.routed = { effect: v.hits[0].effect, killed: e.killed, logKilled: v.hits.map((l) => l.killed), crew: G.combat.crewOf(e), formula: G.combat.rules.crewNow({ crew0: 12, hpLow: e.hpLow, maxHp: 80, killed: 2 }) };
        G.capture.escape(e);
      }
      G.combat.forceCrit(null);
      return out;
    });
    const R = crits.rudder;
    check(
      R.hits.length >= 2 && R.hits.every((h) => h.crit && near(h.dmg, 17.5, 1e-9)) && R.hits[0].effect === 'rudder' && R.hits.slice(1).every((h) => h.effect === null) &&
        R.turnMul === 0.25 && R.speedMul === 1 && near(R.left, 6 - R.since, 0.02),
      `a forced crit hits x1.75 and RUDDER SMASHED cuts her turning to x0.25 for 6 s; the volley's other crits add no effect (one per 3 s) (${J(R)})`
    );
    check(R.before === 0.25 && R.after === 1, `the smashed rudder mends after 6 s (turn x${R.before} -> x${R.after})`);
    const M = crits.mast;
    check(M.effect === 'mast' && M.speedMul === 0.5 && near(M.cap, M.max * 0.5, 1e-9) && M.mastDown && M.turnMul === 1 && M.after.speedMul === 1 && !M.after.mastDown,
      `MAST DOWN halves her speed cap and drops her top sail for 8 s (${J(M)})`);
    const K = crits.keg;
    // (by the end of the volley the fire has already burned `early` ticks)
    check(K.effect === 'keg' && near(K.drop - K.early, K.sum + 12, 1e-9) && K.ticks0 === 8 - K.early && K.early + K.burned === 8 && K.ticks === 0,
      `POWDER KEG: +12 at once (hull -${K.drop - K.early} = ${K.sum} + 12), then burns 1 hp every 0.5 s for 4 s (${K.early + K.burned} ticks) (${J(K)})`);
    const C = crits.routed;
    check(C.effect === 'routed' && C.killed === 2 && C.logKilled[0] === 2 && C.crew === C.formula, `CREW ROUTED kills 2 of her crew (${J(C)})`);

    // Enemy shots never crit and rake by the level's enemyRake: a privateer's stern rake on you on level 1 is x1.4.
    const enemyRake = await ev(page, () => {
      const G = window.__game;
      const p = T.level(1);
      p.h = -Math.PI / 2; // your stern faces the privateer
      const e = T.spawn('privateer', 0, 0, 0);
      G.place(e, p.x + 20, p.z, 0); // east of you; her starboard battery faces you
      e.reload.port = e.reload.star = 0;
      G.combat.clearLog();
      G.combat.forceCrit('crit'); // never applies to enemy shots
      const fired = G.fire(e, 1, p);
      const hold = T.pinner(p);
      T.steps(1.6, () => { hold(); e.x = p.x + 20; e.z = p.z; e.h = 0; e.speed = 0; });
      G.combat.forceCrit(null);
      const hits = G.combat.log.filter((l) => l.owner === 'enemy' && l.target === 'player');
      return { fired, enemyRake: G.LEVELS[0].enemyRake, hits: hits.map((l) => ({ aspect: l.aspect, aspectMul: l.aspectMul, crit: l.crit, dmg: l.dmg, rangeMul: l.rangeMul })) };
    });
    const eh = enemyRake.hits;
    check(enemyRake.fired && eh.length >= 2 && eh.every((h) => h.aspect === 'stern' && h.aspectMul === 1.4 && h.crit === false && near(h.dmg, 5 * h.rangeMul * 1.4, 1e-9)),
      `an enemy's stern rake on you on level 1 is x1.4 (enemyRake ${enemyRake.enemyRake}) and never crits (${J(eh)})`);
  });

  // -------------------------------------------------------------------------------------------------- ammo
  await section('ammo', async () => {
    // Real key presses (the loop runs for a moment; every ship is parked or stopped).
    const press = async (key) => {
      await page.evaluate(() => { window.__game.state.mode = 'playing'; });
      await page.keyboard.press(key);
      return page.evaluate(() => {
        const G = window.__game;
        G.state.mode = 'paused';
        return { ammo: G.combat.ammo, hint: T.shown('hint') ? T.text('hint') : '' };
      });
    };
    // A fresh profile: only round shot.
    const fresh = await ev(page, () => {
      const G = window.__game;
      G.state.unlocked = 1;
      T.level(1);
      return { unlocked: G.combat.unlockedAmmo, chain: G.combat.setAmmo('chain'), ammo: G.combat.ammo };
    });
    await page.evaluate(() => T.redraw());
    const cells = await page.evaluate(() => ({ gun: !document.getElementById('gun-ammo').classList.contains('hidden'), pill: !document.getElementById('touch-ammo').classList.contains('hidden') }));
    const k2 = await press('2');
    const k3 = await press('3');
    const kR = await press('r');
    check(J(fresh.unlocked) === '["round"]' && fresh.chain === false && fresh.ammo === 'round' && !cells.gun && !cells.pill,
      `ammo: a fresh profile has only round shot and no ammo cell or pill (${J({ ...fresh, ...cells })})`);
    check(k2.ammo === 'round' && /Chain shot unlocks after the Coast of Europe/.test(k2.hint) && k3.ammo === 'round' && /Grape shot unlocks after the Bali Islands/.test(k3.hint) && kR.ammo === 'round' && /Chain shot unlocks/.test(kR.hint),
      `ammo: 2, 3 and R are ignored while locked and the hint says why ("${k2.hint}" / "${k3.hint}" / "${kR.hint}")`);
    // Unlocked with the voyage's progress (chain after level 1, grape after level 2).
    const two = await ev(page, () => {
      const G = window.__game;
      G.state.unlocked = 2;
      return G.combat.unlockedAmmo;
    });
    const unlocked = await ev(page, () => {
      const G = window.__game;
      G.state.unlocked = 3;
      T.level(1);
      return G.combat.unlockedAmmo;
    });
    await page.evaluate(() => T.redraw());
    const cells3 = await page.evaluate(() => ({ gun: T.shown('gun-ammo'), name: T.text('ammo-name'), pill: !document.getElementById('touch-ammo').classList.contains('hidden') }));
    check(J(two) === '["round","chain"]' && J(unlocked) === '["round","chain","grape"]' && cells3.gun && cells3.pill && cells3.name === 'Round',
      `ammo: chain unlocks at level 2, grape at level 3, and the Ammo cell and pill appear (${J({ two, unlocked, ...cells3 })})`);
    const seq = [];
    for (const key of ['r', 'r', 'r', '3', '1', '2', 'Numpad3', 'Numpad1']) seq.push((await press(key)).ammo);
    check(seq.join() === 'chain,grape,round,grape,round,chain,grape,round', `ammo: R cycles Round -> Chain -> Grape -> Round; 1 / 2 / 3 and the numpad pick (${seq.join(', ')})`);
    await ev(page, () => window.__game.combat.setAmmo('grape'));
    await page.evaluate(() => T.redraw());
    const named = await page.evaluate(() => ({ name: T.text('ammo-name'), state: document.getElementById('gun-ammo').dataset.ammo }));
    check(named.name === 'Grape' && named.state === 'grape', `ammo: the Ammo cell names the loaded shot (${J(named)})`);

    // Swapping takes the gun crews AMMO_SWAP (0.5) s: each side's reload becomes at least that.
    const swap = await ev(page, () => {
      const G = window.__game;
      const p = G.player;
      G.combat.setAmmo('round');
      p.reload.port = 0;
      p.reload.star = 2;
      const ok = G.combat.setAmmo('chain');
      return { ok, port: p.reload.port, star: p.reload.star, portMax: p.reloadMax.port, swap: G.combat.rules.AMMO_SWAP };
    });
    check(swap.ok && swap.swap === 0.5 && swap.port === 0.5 && swap.portMax === 0.5 && swap.star === 2, `ammo: a swap sets each side's reload to at least 0.5 s (${J(swap)})`);

    // Every ammo: one projectile per gun ("port broadside fires N balls"), each carrying its ammo.
    const counts = await ev(page, () => {
      const G = window.__game;
      const p = G.player;
      const out = {};
      for (const id of ['round', 'chain', 'grape']) {
        G.combat.setAmmo(id);
        p.reload.port = 0;
        const before = new Set(G.balls);
        const ok = G.playerFire(-1);
        const added = G.balls.filter((b) => !before.has(b));
        out[id] = { ok, n: added.length, ammo: [...new Set(added.map((b) => b.ammo))].join() };
      }
      T.steps(2.5);
      return { guns: p.type.guns, out };
    });
    check(Object.entries(counts.out).every(([id, r]) => r.ok && r.n === counts.guns && r.ammo === id), `ammo: a port broadside fires ${counts.guns} projectiles for every ammo (${J(counts.out)})`);

    // Ranges: fired at a target far beyond reach, no projectile flies further than its ammo's range
    // (round 34, chain 26, grape 20; it splashes down a little past that point).
    const ranges = await ev(page, () => {
      const G = window.__game;
      const p = G.player;
      const far = T.spawn('privateer', 60, 0, 0);
      const out = {};
      for (const id of ['round', 'chain', 'grape']) {
        G.combat.setAmmo(id);
        p.reload.star = 0;
        const before = new Set(G.balls);
        G.fire(p, 1, far);
        const mine = G.balls.filter((b) => !before.has(b));
        let max = 0;
        T.steps(2.5, () => {
          for (const b of mine) max = Math.max(max, Math.hypot(b.x - b.ox, b.z - b.oz));
        });
        out[id] = { range: G.combat.rules.AMMO[id].range, max: Math.round(max * 100) / 100, n: mine.length };
      }
      G.capture.escape(far);
      return out;
    });
    check(Object.values(ranges).every((r) => r.n > 0 && r.max >= r.range - 2 && r.max <= r.range + 5) && ranges.chain.max < ranges.round.max - 5 && ranges.grape.max < ranges.chain.max - 3,
      `ammo: each shot's flight is clamped to its range (${J(ranges)})`);

    // Chain shot: hull x0.4; one hit slows her to 55 % of her speed cap and 70 % of her turning for 6 s;
    // more hits never make it last more than 10 s.
    const chain = await ev(page, () => {
      const G = window.__game;
      const p = G.player;
      G.combat.forceCrit('none');
      G.combat.setAmmo('chain');
      const e = T.spawn('privateer', 20, 0, 0);
      const guns = p.type.guns;
      p.type.guns = 1; // a single ball
      const v1 = T.volley(e, { seconds: 1.5 });
      p.type.guns = guns;
      const fx = G.combat.effects(e);
      const since = G.state.time - v1.hits[0].t;
      const one = { hits: v1.hits.length, dmg: v1.hits[0].dmg, rangeMul: v1.hits[0].rangeMul, slow: v1.hits[0].slow, left: fx.slow, since, speedMul: fx.speedMul, turnMul: fx.turnMul, cap: fx.speedCap, max: e.type.maxSpeed };
      // her own sailing while slowed: let her AI run (no firing)
      e.reload.port = e.reload.star = 99;
      let top = 0;
      T.steps(3, () => { top = Math.max(top, e.speed); e.reload.port = e.reload.star = 99; p.x = 0; p.z = 0; p.speed = 0; });
      one.top = Math.round(top * 1000) / 1000;
      T.steps(6 - since - 3 - 0.05, () => { e.reload.port = e.reload.star = 99; });
      one.before = G.combat.effects(e).speedMul;
      T.steps(0.1);
      one.after = G.combat.effects(e).speedMul;
      G.capture.escape(e);
      // a full chain broadside
      const e2 = T.spawn('privateer', 20, 0, 0);
      const v3 = T.volley(e2, { seconds: 1.5 });
      const many = { hits: v3.hits.length, left: G.combat.effects(e2).slow, since: G.state.time - v3.hits[v3.hits.length - 1].t };
      G.capture.escape(e2);
      G.combat.forceCrit(null);
      G.combat.setAmmo('round');
      return { one, many };
    });
    const c1 = chain.one;
    check(c1.hits === 1 && near(c1.dmg, 4 * c1.rangeMul, 1e-9) && c1.slow === true && near(c1.left, 6 - c1.since, 0.02) && c1.speedMul === 0.55 && c1.turnMul === 0.7 && near(c1.cap, c1.max * 0.55, 1e-9) && c1.top <= c1.cap + 1e-6 && c1.top > 0,
      `chain shot: x0.4 hull; one hit slows her to 55 % of her speed cap (and her turning to 70 %) for 6 s; she sails no faster (${J(c1)})`);
    check(c1.before === 0.55 && c1.after === 1, `chain shot: the slow wears off after 6 s (x${c1.before} -> x${c1.after})`);
    check(chain.many.hits >= 2 && chain.many.left <= 10 && chain.many.left >= 6 - chain.many.since - 0.02, `chain shot: a full broadside slows her for at most 10 s (${J(chain.many)})`);

    // Grape: 1 crew per ball (2 on a rake), x0.3 hull; one sailor tumbles overboard per volley.
    const grape = await ev(page, () => {
      const G = window.__game;
      G.combat.forceCrit('none');
      G.combat.setAmmo('grape');
      const e = T.spawn('privateer', 16, 0, 0);
      const ob0 = G.overboard.active;
      const v = T.volley(e, { seconds: 0.9 });
      const ob = G.overboard.active - ob0;
      const beam = { hits: v.hits.length, dist: v.hits.map((l) => Math.round(l.dist * 10) / 10), killed: v.dkilled, logKilled: v.hits.map((l) => l.killed), dhp: v.dhp, hpPct: v.dhp / e.maxHp, crew: G.combat.crewOf(e), overboard: ob };
      G.capture.escape(e);
      const e2 = T.spawn('privateer', 16, 0, -Math.PI / 2);
      const v2 = T.volley(e2, { seconds: 1.2 });
      const rake = { hits: v2.hits.length, killed: v2.dkilled, aspect: v2.hits.map((l) => l.aspect).join() };
      G.capture.escape(e2);
      G.combat.forceCrit(null);
      G.combat.setAmmo('round');
      return { beam, rake, guns: G.player.type.guns };
    });
    const gb = grape.beam;
    check(gb.hits === grape.guns && gb.killed === grape.guns && gb.logKilled.every((k) => k === 1) && gb.dist.every((d) => d <= 20) && gb.hpPct <= 0.15 && gb.overboard === 1,
      `grape shot: a full broadside at <= 20 u kills ${grape.guns} crew (1 a ball), barely dents the hull (-${gb.dhp}) and throws one sailor overboard (${J(gb)})`);
    check(grape.rake.hits >= 2 && grape.rake.killed === 2 * grape.rake.hits && /^stern(,stern)*$/.test(grape.rake.aspect), `grape shot: down her length each ball kills 2 (${J(grape.rake)})`);
  });

  // -------------------------------------------------------------------------------------------------- crew
  await section('crew', async () => {
    // Hull damage thins her crew (by half at most); repairs never bring sailors back (hpLow).
    const hull = await ev(page, () => {
      const G = window.__game;
      T.level(1);
      const e = T.spawn('privateer', 30, 0, 0);
      const out = { full: G.combat.crewOf(e) };
      G.damage(e, 40);
      out.half = G.combat.crewOf(e);
      G.damage(e, 39);
      out.one = G.combat.crewOf(e);
      e.hp = e.maxHp;
      out.repaired = G.combat.crewOf(e);
      out.fighting = G.fighting(e);
      G.capture.escape(e);
      return out;
    });
    check(hull.full === 12 && hull.half === 9 && hull.one === 7 && hull.one >= 6 && hull.repaired === 7 && hull.fighting,
      `crew: a privateer's 12 hands thin with her hull (40 hp: 9, 1 hp: 7, never below half) and repairs don't bring them back (${J(hull)})`);
    // Her tag: 10 x crewNow / crew0 pips (the last one partly filled) and the surrender notch at 10 x strikeAt / crew0,
    // read back from the pip InstancedMesh.
    const pips = await ev(page, async () => {
      const G = window.__game;
      T.level(1);
      const e = T.spawn('cutter', 22, 8, 0);
      G.damage(e, e.maxHp / 2); // 8 hands -> 6
      const out = { thinned: G.combat.crewOf(e) };
      G.state.mode = 'paused';
      for (const n of [5, 3]) {
        G.combat.setCrew(e, n);
        await T.redraw();
        out[n] = { crew: G.combat.crewOf(e), tag: G.tagInfo(e) };
      }
      out.crew0 = e.crew0;
      out.strikeAt = e.strikeAt;
      G.capture.escape(e);
      return out;
    });
    const pipOk = (n) => pips[n].crew === n && pips[n].tag && pips[n].tag.visible && near(pips[n].tag.pips, (10 * n) / pips.crew0, 0.002) && near(pips[n].tag.notch, (10 * pips.strikeAt) / pips.crew0, 0.002) && near(pips[n].tag.hull, 0.5, 0.01);
    check(pips.thinned === 6 && pipOk(5) && pipOk(3), `crew: her tag shows 10 x crew / crew0 pips and the surrender notch (cutter, 8 hands, notch ${pips.strikeAt}: ${J(pips)})`);

    // Grape her down to the notch: she strikes her colours (white flag, hands up, out of the fight), shots pass
    // through her, and she shows white on the minimap.
    const struck = await ev(page, async () => {
      const G = window.__game;
      G.state.unlocked = 3;
      T.level(1);
      G.combat.forceCrit('none');
      const e = T.spawn('privateer', 14, 0, 0);
      G.state.mode = 'paused';
      await T.redraw();
      G.state.mode = 'playing';
      const before = { map: T.mapColor(e), fighting: G.fighting(e) };
      G.combat.setAmmo('grape');
      let volleys = 0;
      while (!e.surrendered && volleys < 8) {
        T.volley(e, { seconds: 1 });
        volleys++;
      }
      const out = { before, volleys, surrendered: e.surrendered, crew: G.combat.crewOf(e), strikeAt: e.strikeAt, fighting: G.fighting(e), flag: e.mesh.userData.flag, handsUp: G.overboard.surrendering === e, banner: T.text('banner') };
      G.combat.setAmmo('round');
      const v = T.volley(e, { seconds: 1.5 });
      out.through = { hits: v.hits.length, dhp: v.dhp };
      G.state.mode = 'paused';
      await T.redraw();
      out.icon = e.tagIcon;
      out.tagIcon = G.tagInfo(e) && G.tagInfo(e).icon;
      out.map = T.mapColor(e);
      G.combat.forceCrit(null);
      return out;
    });
    check(struck.surrendered && struck.crew <= struck.strikeAt && !struck.fighting && struck.flag === 'white' && struck.handsUp && /strikes her colours/.test(struck.banner) && struck.icon === 'white' && struck.tagIcon === 'white',
      `crew: grape to the notch -> she strikes her colours: white flag, two hands up, out of the fight, a white flag on her tag (${J({ ...struck, before: undefined, map: undefined })})`);
    check(struck.through.hits === 0 && struck.through.dhp === 0, `crew: cannonballs pass through a struck ship (${J(struck.through)})`);
    check(J(struck.before.map) === J([230, 57, 70]) && J(struck.map) === J([255, 255, 255]), `crew: her minimap dot turns from red to white (${J(struck.before.map)} -> ${J(struck.map)})`);
    // Reinforcements bring 3 hands; when the level is cleared she is yours anyway.
    const clear = await ev(page, () => {
      const G = window.__game;
      const e = G.enemies.find((x) => x.surrendered);
      G.combat.setCrew('player', 5);
      for (const x of G.enemies) if (x !== e) G.damage(x, 9999);
      T.steps(0.2);
      const out = { wave: G.state.wave, crew: G.crew.crew, gold0: G.state.gold };
      for (const x of G.enemies) if (x !== e && G.fighting(x)) G.damage(x, 9999);
      T.steps(0.2);
      out.captured = e.captured;
      out.gold = G.state.gold - out.gold0;
      out.banner = T.text('banner');
      T.steps(3);
      out.mode = G.state.mode;
      out.summary = T.text('level-summary');
      return out;
    });
    check(clear.wave === 1 && clear.crew === 8, `crew: reinforcements bring 3 more hands (5 -> ${clear.crew})`);
    check(clear.captured && clear.gold >= 145 && /surrendered ship is yours/.test(clear.banner) && clear.mode === 'levelDone' && /Captured: 1\b/.test(clear.summary) && /Prize bonus: \+50 gold/.test(clear.summary),
      `crew: when the level is cleared the struck ship is captured automatically and counted (${J(clear)})`);
    // A full crew at every level start (retry included).
    const full = await ev(page, () => {
      const G = window.__game;
      G.startLevel(2);
      const a = G.crew;
      G.combat.setCrew('player', 4);
      const b = G.crew.crew;
      G.retryLevel();
      const c = G.crew;
      return { a, b, c };
    });
    check(full.a.crew === 12 && full.a.max === 12 && full.b === 4 && full.c.crew === 12, `crew: every hand is aboard at a new level and at a retry (${J(full)})`);
  });

  // ---------------------------------------------------------------------------------------------- boarding
  await section('boarding', async () => {
    // Why G can't board (SPEC2 §3.2), each reason on its own.
    const why = await ev(page, () => {
      const G = window.__game;
      T.level(1);
      const e = T.spawn('privateer', 30, 0, 0);
      const out = { range: [G.canGrapple(e), G.grapple().reason] };
      T.key('g', 'KeyG');
      T.key('g', 'KeyG', { type: 'keyup' });
      out.hint = T.shown('hint') ? T.text('hint') : '';
      // the reach: grappleRange 14 + 0.25 x her length 9.5 = 16.375 u, centre to centre
      T.place(e, 16.6);
      out.outside = G.canGrapple(e);
      T.place(e, 16.2);
      out.inside = G.canGrapple(e);
      G.state.boardCooldown = 3;
      out.cooldown = [G.canGrapple(e), G.grapple().reason];
      G.state.boardCooldown = 0;
      G.combat.setCrew('player', 2);
      out.crew = [G.canGrapple(e), G.grapple().reason];
      G.combat.setCrew('player', 12);
      G.state.intro = 2;
      out.intro = G.canGrapple(e);
      G.state.intro = 0;
      out.ok = G.grapple();
      out.busy = [G.canGrapple(e), G.boarding.active];
      G.boarding.cancel('test');
      G.capture.escape(e);
      return out;
    });
    check(why.range.join() === 'range,range' && /Get closer!/.test(why.hint), `boarding: out of reach -> "range", and G says "Get closer!" (${J(why.range)}, "${why.hint}")`);
    check(why.outside === 'range' && why.inside === null, `boarding: the reach is 14 + 0.25 x her length, centre to centre (16.6 u: ${why.outside}, 16.2 u: ${why.inside})`);
    check(why.cooldown.join() === 'cooldown,cooldown' && why.crew.join() === 'crew,crew' && why.intro === 'busy' && why.ok.ok && why.busy.join() === 'busy,true',
      `boarding: hooks coiling -> cooldown, 2 hands -> crew, the fly-in or a boarding under way -> busy (${J(why)})`);
    const immune = await ev(page, () => {
      const G = window.__game;
      T.level(3);
      const e = T.spawn('inferno', 9, 0, 0);
      const out = { why: G.canGrapple(e), g: G.grapple().reason, active: G.boarding.active };
      G.capture.escape(e);
      return out;
    });
    check(immune.why === 'immune' && immune.g === 'immune' && !immune.active, `boarding: the Molten Maw is too hot to board (${J(immune)})`);

    // Soften her up (SPEC2 §3.3 example 1): a privateer battered to 32 hp, boarded with G and three heaves.
    const att = await ev(page, () => {
      const G = window.__game;
      const p = T.level(1);
      const e = T.spawn('privateer', 8.5, 0, 0);
      G.damage(e, 48);
      // a third ship abeam on your other side, guns loaded: she may not fire during the truce
      const other = T.spawn('privateer', -22, 0, 0);
      const rules = G.combat.rules;
      const odds0 = G.boarding.odds(e);
      const side0 = { att: { crew: 12, crew0: 12, blade: 1, hpFrac: p.hp / p.maxHp }, def: { crew: G.combat.crewOf(e), crew0: 12, grit: 1.1, hpFrac: e.hp / e.maxHp } };
      const plain = rules.resolveBoarding(side0.att, side0.def, { heave: 0, playerAttacks: true });
      const gold0 = G.state.gold;
      const hooks = [];
      const off = G.boarding.module.onPhase((ev) => hooks.push(ev.phase));
      const t0 = G.state.time;
      T.g();
      const out = { active: G.boarding.active, kind: G.boarding.kind, target: G.boarding.target === e, odds0: { label: odds0.label, attLoss: odds0.attLoss, defLoss: odds0.defLoss, R: odds0.R }, plain: { attLoss: plain.attLoss, defLoss: plain.defLoss, R: plain.R } };
      const phases = [['hook', 0]];
      let last = 'hook';
      let presses = 0;
      let truceBalls = 0;
      let truceSteps = 0;
      let swing = null;
      let sides = null;
      const lats = [];
      const seen = new Set(G.balls);
      let hpAtSwing = 0;
      T.steps(5.2, () => {
        const ph = G.boarding.phase;
        // keep the other ship abeam, her guns loaded during the truce
        T.place(other, -22, 0, 0);
        other.reload.port = other.reload.star = G.boarding.truce ? 0 : 99;
        if (ph !== last) {
          phases.push([ph, Math.round((G.state.time - t0) * 1e6) / 1e6]);
          last = ph;
          if (ph === 'swing') {
            const r = G.relative(p, e.x, e.z);
            swing = { lat: r.lat, along: r.along, dh: T.wrap(e.h - p.h) };
            hpAtSwing = e.hp;
            sides = { att: { crew: G.crew.crew, crew0: 12, blade: 1, hpFrac: p.hp / p.maxHp }, def: { crew: G.combat.crewOf(e), crew0: 12, grit: 1.1, hpFrac: e.hp / e.maxHp } };
          }
        }
        if (ph === 'reel' && presses < 3) {
          T.g();
          presses++;
          if (presses === 3) {
            // held keys auto-repeat: ignored
            T.key('g', 'KeyG', { repeat: true });
            T.key('g', 'KeyG', { repeat: true });
            T.key('g', 'KeyG', { type: 'keyup' });
          }
        }
        if (G.boarding.truce) {
          truceSteps++;
          for (const b of G.balls) if (!seen.has(b)) { seen.add(b); if (b.owner !== 'player') truceBalls++; }
        } else for (const b of G.balls) seen.add(b);
        if (ph === 'brawl') lats.push(G.relative(p, e.x, e.z).lat);
      });
      off();
      const L = G.boarding.last;
      const expect = rules.resolveBoarding(sides.att, sides.def, { heave: 0.12, playerAttacks: true });
      Object.assign(out, {
        phases,
        hooks: hooks.filter((x) => x === 'hook').length,
        heave: G.boarding.heave,
        heaves: G.boarding.heaves,
        swing,
        slot: (p.type.wid + e.type.wid) / 2 + 0.7,
        brawlLat: lats.length ? [Math.min(...lats), Math.max(...lats)] : null,
        truceSteps,
        truceBalls,
        result: { defLoss: L.result.defLoss, attLoss: L.result.attLoss, R: L.result.R, captured: L.captured, heave: L.heave },
        expect: { defLoss: expect.defLoss, attLoss: expect.attLoss, R: expect.R, captured: expect.captured },
        hpAtSwing,
        hp: e.hp,
        gold: G.state.gold - gold0,
        crew: G.crew.crew,
        captured: e.captured,
        fighting: G.fighting(e),
        mode: G.state.mode,
      });
      // after the truce the other ship (loaded once) fires again
      other.reload.port = other.reload.star = 0;
      T.steps(5.1, () => T.place(other, -22, 0, 0));
      out.removed = !G.enemies.includes(e);
      out.otherFired = G.balls.some((b) => b.owner === 'enemy' && !seen.has(b)) || G.combat.log.some((l) => l.owner === 'enemy');
      G.capture.escape(other);
      return out;
    });
    const at = Object.fromEntries(att.phases.map(([ph, t]) => [ph ?? 'end', t]));
    const dur = (a, b) => at[b] - at[a];
    check(att.active && att.kind === 'attack' && att.target && att.hooks === 1, `boarding: G grapples the privateer in reach (one press, one grapple) (${J({ active: att.active, kind: att.kind, hooks: att.hooks })})`);
    check(att.odds0.label === 'capture' && att.odds0.attLoss === 1 && att.odds0.defLoss === att.plain.defLoss && near(att.odds0.R, att.plain.R, 1e-9) && near(att.plain.R, 1.939, 0.0005),
      `boarding: the preview is CAPTURE! -1 for a privateer battered to 40 % (R ${att.plain.R.toFixed(3)}) (${J(att.odds0)})`);
    const order = att.phases.map(([ph]) => ph ?? 'end').join();
    check(order === 'hook,reel,swing,brawl,result,end' && near(dur('hook', 'reel'), 0.45, SUB) && near(dur('reel', 'swing'), 1.2, SUB) && near(dur('swing', 'brawl'), 0.7, SUB) && near(dur('brawl', 'result'), 2.0, SUB) && near(dur('result', 'end'), 0.65, SUB),
      `boarding: hook 0.45 -> reel 1.2 -> swing 0.7 -> brawl 2.0 -> result 0.65 s, each within a substep (${J(att.phases)})`);
    check(near(att.heave, 0.12, 1e-9) && att.heaves === 3, `boarding: three G presses in the reel heave +0.12; held-key repeats don't count (${att.heave}, ${att.heaves} heaves)`);
    const sw = att.swing || {};
    check(sw.lat !== undefined && near(Math.abs(sw.lat), att.slot, 0.05) && Math.abs(sw.along) < 0.3 && Math.abs(Math.sin(sw.dh)) < 0.02,
      `boarding: the reel brings her alongside and parallel (lat ${sw.lat && sw.lat.toFixed(2)} of ${att.slot.toFixed(2)}, along ${sw.along && sw.along.toFixed(2)}, heading off by ${sw.dh && sw.dh.toFixed(3)})`);
    check(att.brawlLat && Math.abs(att.brawlLat[0]) > att.slot - 0.06 && att.brawlLat[1] - att.brawlLat[0] < 0.05, `boarding: nothing pushes the glued pair apart during the brawl (lat ${J(att.brawlLat)})`);
    check(att.truceSteps > 300 && att.truceBalls === 0 && att.otherFired, `boarding: no enemy fires during the truce (${att.truceSteps} steps; the loaded ship abeam fired ${att.truceBalls} balls, and fires again after it: ${att.otherFired})`);
    check(att.result.defLoss === att.expect.defLoss && att.result.attLoss === att.expect.attLoss && near(att.result.R, att.expect.R, 1e-9) && att.result.captured === att.expect.captured && near(att.result.heave, 0.12, 1e-9),
      `boarding: the outcome is the odds for the same sides with the heaves made (${J(att.result)} = ${J(att.expect)})`);
    check(att.hp === att.hpAtSwing - 2 * att.result.defLoss, `boarding: her hull drops by 2 x defLoss (${att.hpAtSwing} -> ${att.hp})`);
    check(att.captured && !att.fighting && att.gold === 145 && att.crew === 12, `boarding: captured for exactly 145 gold, out of the fight, crew 12 - 1 + 2 (capped) (${J({ gold: att.gold, crew: att.crew, captured: att.captured })})`);
    check(att.removed, 'boarding: the prize sails off and is gone 5 s after the capture');
    await page.waitForTimeout(1600);
    await page.evaluate(() => T.redraw());
    const live = await page.evaluate(() => T.text('game-live'));
    check(/The Privateer Brig is yours! Captured for 145 gold/.test(live), `#game-live announces the capture ("${live}")`);
    // Sinking the same ship only drops 6 coins (60 gold).
    const sink = await ev(page, () => {
      const G = window.__game;
      T.level(1);
      const e = T.spawn('privateer', 20, 0, 0);
      G.damage(e, 9999);
      return G.coins.filter((c) => c.from === e.id).length * 10;
    });
    check(sink === 60, `boarding: sinking a privateer drops ${sink} gold, capturing her pays 145`);
    // The last ship of a wave captured: the next wave still comes.
    const waves = await ev(page, () => {
      const G = window.__game;
      T.level(1);
      const [a, b] = G.enemies;
      a.rise = 0;
      T.place(a, 8, 0, 0);
      G.damage(a, 23); // 12 hp left: CAPTURE!
      G.damage(b, 9999);
      const label = G.boarding.pick().label;
      G.grapple();
      T.steps(5.2);
      const out = { label, captured: a.captured, wave: G.state.wave, ships: G.enemies.filter((e) => G.fighting(e)).map((e) => e.typeName).join() };
      return out;
    });
    check(waves.label === 'capture' && waves.captured && waves.wave === 1 && /privateer/.test(waves.ships), `boarding: capturing the last ship of a wave brings the next wave (${J(waves)})`);
    // A struck ship is taken without a fight: hook -> reel -> result, no truce, no losses (TAKE HER!).
    const take = await ev(page, () => {
      const G = window.__game;
      T.level(1);
      const e = T.spawn('cutter', 20, 0, 0);
      e.speed = 5;
      G.capture.strike(e);
      T.steps(3);
      const drift = e.speed;
      T.place(e, 8, 0, 0);
      const pick = G.boarding.pick().label;
      const gold0 = G.state.gold;
      G.combat.setCrew('player', 10);
      G.grapple();
      const phases = [];
      let truce = false;
      let last = null;
      T.steps(3, () => {
        if (G.boarding.phase !== last) phases.push((last = G.boarding.phase) ?? 'end');
        truce = truce || G.boarding.truce;
      });
      return { drift, pick, phases: phases.join(), truce, captured: e.captured, gold: G.state.gold - gold0, crew: G.crew.crew };
    });
    check(take.drift <= 1.5 && take.pick === 'take' && take.phases === 'hook,reel,result,end' && !take.truce && take.captured && take.gold === 85 && take.crew === 12,
      `boarding: a struck cutter drifts (${take.drift.toFixed(2)} u/s); TAKE HER! takes her without a fight: hook, reel, result, 85 gold, +2 hands (${J(take)})`);
    // The truce holds bombs too (level 3: a lava bomb launched as the swing starts waits; the next launch is pushed back).
    const bombs = await ev(page, () => {
      const G = window.__game;
      T.level(3);
      const e = T.spawn('corsair', 8.5, 0, 0);
      G.damage(e, 30);
      G.grapple();
      T.steps(3, () => G.boarding.phase !== 'swing');
      G.launchBomb();
      const b = G.bombs[G.bombs.length - 1];
      const next0 = G.state.nextBomb;
      const c0 = G.state.combatTime;
      let truce = 0;
      T.steps(4, () => { if (G.boarding.truce) truce++; });
      return { launched: !!b, inAir: G.bombs.includes(b), t: b && b.t, truceSteps: truce, pushed: G.state.nextBomb - next0, elapsed: G.state.combatTime - c0, phase: G.boarding.phase };
    });
    // (the step that ends the truce still began inside it: one substep of slack)
    check(bombs.launched && bombs.inAir && bombs.truceSteps > 300 && near(bombs.t, (4 * 120 - bombs.truceSteps) / 120, SUB + 1e-6) && near(bombs.pushed, bombs.truceSteps / 120, SUB + 1e-6),
      `boarding: no bomb advances during the truce: the bomb's clock ran only outside it, the next launch is pushed back by the truce (${J(bombs)})`);
  });

  // ----------------------------------------------------------------- boarding with the real loop (pause, loss)
  await section('boarding-live', async () => {
    // A boarding run to the start of its brawl (frozen there).
    const toBrawl = () => ev(page, () => {
      const G = window.__game;
      T.level(1);
      const e = T.spawn('privateer', 8.5, 0, 0);
      G.damage(e, 48);
      G.grapple();
      T.steps(4, () => G.boarding.phase !== 'brawl');
      return { phase: G.boarding.phase, pt: G.boarding.module.phaseTime };
    });
    const read = () => page.evaluate(() => {
      const G = window.__game;
      return { mode: G.state.mode, phase: G.boarding.phase, pt: G.boarding.module.phaseTime, time: G.state.time, pause: T.shown('pause-screen'), recover: T.shown('recover-screen'), button: T.shown('recover-btn') };
    });
    // Esc pauses mid-brawl (nothing moves on), Esc again carries on with the same brawl.
    await toBrawl();
    await page.evaluate(() => { window.__game.state.mode = 'playing'; });
    await page.keyboard.press('Escape');
    const p1 = await read();
    await page.waitForTimeout(700);
    const p2 = await read();
    await page.keyboard.press('Escape');
    const p3 = await page.evaluate(() => {
      const G = window.__game;
      const r = { mode: G.state.mode, phase: G.boarding.phase, active: G.boarding.active, pause: T.shown('pause-screen') };
      G.state.mode = 'paused';
      return r;
    });
    check(p1.mode === 'paused' && p1.pause && p1.phase === 'brawl' && p2.pt === p1.pt && p2.time === p1.time && p3.mode === 'playing' && p3.active && !p3.pause,
      `boarding: Esc pauses mid-brawl (the fight waits) and Esc again carries on with it (${J({ p1, p2: { pt: p2.pt }, p3 })})`);

    // Losing the WebGL context mid-brawl pauses it; after the restore, Continue picks it up at the same phase.
    const ext = await page.evaluate(() => !!document.getElementById('game').getContext('webgl2')?.getExtension('WEBGL_lose_context'));
    if (!ext) {
      console.log('SKIP  WEBGL_lose_context is not available: the context-loss boarding check was not run');
    } else {
      const start = await toBrawl();
      await page.evaluate(() => {
        window.__loseExt = document.getElementById('game').getContext('webgl2').getExtension('WEBGL_lose_context');
        window.__game.state.mode = 'playing';
        window.__loseExt.loseContext();
      });
      await page.waitForFunction(() => window.__game.state.contextLost === true, null, { timeout: 30000 }).catch(() => {});
      const lost = await read();
      await page.waitForTimeout(1500);
      const held = await read();
      await page.evaluate(() => window.__loseExt.restoreContext());
      await page.waitForFunction(() => window.__game.state.contextLost === false, null, { timeout: 30000 }).catch(() => {});
      await frames(page, 3);
      const back = await read();
      await page.click('#recover-btn');
      const resumed = await page.evaluate(() => {
        const G = window.__game;
        const r = { mode: G.state.mode, phase: G.boarding.phase, pt: G.boarding.module.phaseTime, active: G.boarding.active };
        G.state.mode = 'paused';
        return r;
      });
      const finished = await ev(page, () => {
        const G = window.__game;
        T.steps(3);
        return { active: G.boarding.active, reason: G.boarding.last && G.boarding.last.reason };
      });
      check(start.phase === 'brawl' && lost.mode === 'paused' && lost.recover && lost.phase === 'brawl' && held.pt === lost.pt && held.time === lost.time,
        `boarding: losing the graphics mid-brawl pauses the fight right there (${J({ lost, held: { pt: held.pt, time: held.time } })})`);
      check(back.mode === 'paused' && back.button && back.phase === 'brawl' && resumed.mode === 'playing' && resumed.active && (resumed.phase === 'result' || (resumed.phase === 'brawl' && resumed.pt >= lost.pt)) && finished.reason === 'done',
        `boarding: after the restore Continue resumes the same boarding (${J({ back: { mode: back.mode, phase: back.phase, button: back.button }, resumed, finished })})`);
    }

    // Reduced motion: the camera cuts to the boarding view (no eased in-between poses); without it, it eases.
    const camera = (rm) => ev(page, async (rm) => {
      const G = window.__game;
      T.level(1);
      const e = T.spawn('privateer', 8.5, 0, 0);
      G.damage(e, 48);
      // a couple of frames of the chase view first
      G.state.mode = 'paused';
      await T.redraw();
      const chase = G.camera.position.clone();
      G.state.mode = 'playing';
      G.grapple();
      const out = { rm, poses: [] };
      for (let i = 0; i < 4; i++) {
        G.state.mode = 'playing';
        await new Promise((r) => requestAnimationFrame(r)); // the game's frame runs first in this tick
        G.state.mode = 'paused';
        const want = G.boarding.module.camera(G.camera.aspect);
        out.poses.push({ phase: G.boarding.phase, off: want ? Math.round(G.camera.position.distanceTo(want.pos) * 1000) / 1000 : null, jump: Math.round(G.camera.position.distanceTo(chase) * 100) / 100 });
      }
      G.boarding.cancel('test');
      return out;
    }, rm);
    const eased = await camera(false);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const cut = await camera(true);
    // and no camera kick on a rake, no hit-stop on a crit
    const calm = await ev(page, () => {
      const G = window.__game;
      T.level(1);
      G.state.shake = 0;
      G.combat.forceCrit('crit');
      const e = T.spawn('privateer', 20, 0, -Math.PI / 2);
      const v = T.volley(e, { seconds: 1.2 });
      G.combat.forceCrit(null);
      return { rake: v.hits.some((l) => l.aspect === 'stern'), crit: v.hits.some((l) => l.crit), shake: G.state.shake, hitStop: G.combat.hitStop.left };
    });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const calm0 = await ev(page, () => {
      const G = window.__game;
      T.level(1);
      G.state.shake = 0;
      G.combat.forceCrit('crit');
      const e = T.spawn('privateer', 20, 0, -Math.PI / 2);
      const v = T.volley(e, { seconds: 1.2 });
      G.combat.forceCrit(null);
      return { shake: G.state.shake, hitStop: G.combat.hitStop.left };
    });
    check(eased.poses[0].off > 0.5 && eased.poses.every((p) => p.off !== null), `boarding camera without reduced motion eases in (first frame ${eased.poses[0].off} u short of the boarding view)`);
    check(cut.poses.every((p) => p.off !== null && p.off < 0.01) && cut.poses[0].jump > 3, `boarding camera with reduced motion cuts straight to the boarding view (no in-between poses) (${J(cut.poses)})`);
    check(calm.rake && calm.crit && calm.shake === 0 && calm.hitStop === 0 && (calm0.shake > 0 || calm0.hitStop > 0), `reduced motion: no camera kick on a rake and no hit-stop on a crit (${J({ calm, without: calm0 })})`);
  });

  // ----------------------------------------------------------------------------------------------- raiders
  await section('raiders', async () => {
    // A raider alongside throws its hooks by itself once the level's grace period is over (not before).
    const ai = await ev(page, () => {
      const G = window.__game;
      T.level(1);
      const e = T.spawn('raider', 8, 0, 0);
      G.state.combatTime = 0; // level 1: 5 s of grace
      const hold = T.pinner(G.player);
      T.steps(3, () => { hold(); return !G.boarding.active; });
      const early = { active: G.boarding.active, combat: Math.round(G.state.combatTime * 100) / 100 };
      T.steps(6, () => { hold(); return !G.boarding.active; });
      const out = { early, active: G.boarding.active, kind: G.boarding.kind, phase: G.boarding.phase, target: G.boarding.target === e, combat: Math.round(G.state.combatTime * 100) / 100 };
      G.boarding.cancel('test');
      return out;
    });
    check(!ai.early.active && ai.active && ai.kind === 'defend' && ai.phase === 'threat' && ai.target && ai.combat > 5, `raiders: a raider alongside hooks you by itself, but not during the grace period (${J(ai)})`);

    const cut = await ev(page, () => {
      const G = window.__game;
      T.level(1);
      const hows = [];
      G.boarding.module.onCut((ev) => hows.push(ev.how));
      const out = {};
      // three G presses
      const e1 = T.spawn('raider', 7.5, 0, 0);
      out.raid = G.boarding.raid(e1);
      out.phase = G.boarding.phase;
      T.steps(0.3);
      T.g();
      T.g();
      out.two = G.boarding.active;
      T.g();
      out.taps = { active: G.boarding.active, reason: G.boarding.last && G.boarding.last.reason, cooldown: e1.boardCooldown };
      G.capture.escape(e1);
      G.state.boardCooldown = 0;
      // holding G 0.8 s (the first press also counts as one cut)
      const e2 = T.spawn('raider', -7.5, 0, 0);
      G.boarding.raid(e2);
      T.key('g', 'KeyG');
      const n = T.steps(2, () => G.boarding.active);
      T.key('g', 'KeyG', { type: 'keyup' });
      out.hold = { t: Math.round((n / 120) * 1000) / 1000, reason: G.boarding.last && G.boarding.last.reason };
      G.capture.escape(e2);
      G.state.boardCooldown = 0;
      // let go after 0.5 s: no cut, the raiders come aboard
      const e3 = T.spawn('raider', 7.5, 0, 0);
      G.boarding.raid(e3);
      T.key('g', 'KeyG');
      T.steps(0.5);
      T.key('g', 'KeyG', { type: 'keyup' });
      T.steps(0.5);
      out.short = { active: G.boarding.active, phase: G.boarding.phase };
      T.steps(1, () => G.boarding.phase !== 'reel');
      out.short.next = G.boarding.phase;
      G.boarding.cancel('test');
      G.capture.escape(e3);
      G.state.boardCooldown = 0;
      // a cannonball into her
      const e4 = T.spawn('raider', 7.5, 0, 0);
      G.boarding.raid(e4);
      T.steps(0.2);
      const p = G.player;
      p.reload.port = p.reload.star = 0;
      out.fired = G.fire(p, 1, e4);
      T.steps(1.2, () => G.boarding.active);
      out.hit = { reason: G.boarding.last && G.boarding.last.reason, active: G.boarding.active };
      out.hows = hows;
      G.capture.escape(e4);
      return out;
    });
    check(cut.raid && cut.phase === 'threat' && cut.two === true && !cut.taps.active && cut.taps.reason === 'cut' && cut.taps.cooldown === 10,
      `raiders: pressing G three times cuts the ropes; the raider's hooks coil for 10 s (${J(cut.taps)})`);
    check(cut.hold.reason === 'cut' && near(cut.hold.t, 0.8, SUB + 1e-6), `raiders: holding G for 0.8 s cuts the ropes (${J(cut.hold)})`);
    check(cut.short.active && cut.short.phase === 'threat' && cut.short.next === 'reel', `raiders: letting go of G after 0.5 s cuts nothing; they come aboard (${J(cut.short)})`);
    check(cut.fired && cut.hit.reason === 'cut' && !cut.hit.active && J(cut.hows) === J(['taps', 'hold', 'hit']), `raiders: a cannonball into the raider cuts the ropes too (${J({ ...cut.hit, hows: cut.hows })})`);

    // Defence holds (SPEC2 §3.3 example 3): you lose 4 and 8 hull, the raider 5; then the counter-board window.
    const held = await ev(page, () => {
      const G = window.__game;
      const p = T.level(1);
      const e = T.spawn('raider', 7.5, 0, 0);
      const odds = G.boarding.odds(e, 'defend');
      const hp0 = p.hp;
      G.boarding.raid(e);
      T.steps(6, () => G.boarding.active);
      const L = G.boarding.last;
      const out = { odds: { attLoss: odds.attLoss, defLoss: odds.defLoss, overrun: odds.overrun }, held: L.held, result: { attLoss: L.result.attLoss, defLoss: L.result.defLoss }, crew: G.crew.crew, hull: hp0 - p.hp, raider: G.combat.crewOf(e), window: G.boarding.counterTarget === e, left: G.boarding.counterLeft };
      T.steps(1);
      out.counter = G.boardPress();
      out.kind = G.boarding.kind;
      T.steps(4, () => G.boarding.active);
      out.counterEnd = G.boarding.last && { kind: G.boarding.last.kind, reason: G.boarding.last.reason };
      G.capture.escape(e);
      return out;
    });
    check(held.held && held.crew === 8 && held.hull === 8 && held.raider === 7 && held.result.defLoss === held.odds.defLoss && held.result.attLoss === held.odds.attLoss && !held.odds.overrun,
      `raiders: the defence holds as the odds said (example 3): you lose 4 hands and 8 hull, the raider 5 (${J(held)})`);
    check(held.window && near(held.left, 3, 0.02) && held.counter === true && held.kind === 'counter' && held.counterEnd && held.counterEnd.kind === 'counter' && held.counterEnd.reason === 'done',
      `raiders: a held defence opens the 3 s counter-board window and G boards them back (${J({ left: held.left, kind: held.kind, end: held.counterEnd })})`);
    const closes = await ev(page, () => {
      const G = window.__game;
      T.level(1);
      const e = T.spawn('raider', 7.5, 0, 0);
      G.boarding.raid(e);
      T.steps(6, () => G.boarding.active);
      const open = G.boarding.counterTarget === e;
      // (held alongside: a raider that sails off more than 12 u casts off her lines sooner)
      const hold = T.pinner(e);
      T.place(e, 7.5, 0, 0);
      T.steps(2.9, hold);
      const still = G.boarding.counterTarget === e;
      T.steps(0.2, hold);
      const out = { open, still, closed: G.boarding.counterTarget === null, press: G.boardPress(), active: G.boarding.active };
      G.capture.escape(e);
      return out;
    });
    check(closes.open && closes.still && closes.closed && closes.press === false && !closes.active, `raiders: the counter-board window closes after 3 s (${J(closes)})`);
    // Overrun (example 4): 5 hands at 30 % hull; they grab 25 % of this level's plunder (never the chest).
    const overrun = await ev(page, () => {
      const G = window.__game;
      const p = T.level(1);
      G.state.gold = G.state.goldAtLevelStart + 400;
      const purse = G.state.purse;
      G.combat.setCrew('player', 5);
      p.hp = p.maxHp * 0.3;
      const e = T.spawn('raider', 7.5, 0, 0);
      G.boarding.raid(e);
      T.steps(6, () => G.boarding.active);
      const L = G.boarding.last;
      const out = { overrun: L.overrun, crew: G.crew.crew, raider: G.combat.crewOf(e), plundered: G.capture.plundered, levelGold: G.state.gold - G.state.goldAtLevelStart, purse: G.state.purse - purse, afloat: p.hp > 0 && !p.sinking, mode: G.state.mode };
      G.capture.escape(e);
      return out;
    });
    check(overrun.overrun && overrun.crew === 2 && overrun.raider === 11 && overrun.plundered === 100 && overrun.levelGold === 300 && overrun.purse === 0 && overrun.afloat && overrun.mode === 'playing',
      `raiders: overrun (example 4): you lose 3, the raider 1, they grab 100 of the 400 gold plundered, the chest and the voyage are safe (${J(overrun)})`);
    // A raider beaten to its notch is yours (Boarding party 2 + Cutlass drills 1).
    const taken = await ev(page, () => {
      const G = window.__game;
      G.armory.set({ up: { boarders: 2, cutlass: 1, grapple: 0, gunner: 0 } });
      T.level(1);
      const crew = G.crew;
      const e = T.spawn('raider', 7.5, 0, 0);
      const gold0 = G.state.gold;
      G.boarding.raid(e);
      T.steps(6, () => G.boarding.active);
      const L = G.boarding.last;
      const out = { crew, captured: e.captured, raiderStrikes: L.raiderStrikes, lost: 18 - (G.crew.crew - 2), gold: G.state.gold - gold0 };
      G.armory.set({ up: { boarders: 0, cutlass: 0, grapple: 0, gunner: 0 } });
      return out;
    });
    check(taken.crew.max === 18 && taken.captured && taken.raiderStrikes && taken.lost === 3 && taken.gold === 125, `raiders: beaten to her notch, the raider is captured for 125 gold (${J(taken)})`);
  });

  // ----------------------------------------------------------------------------------------------- phantom
  await section('phantom', async () => {
    const ph = await ev(page, async () => {
      const G = window.__game;
      G.state.unlocked = 3;
      T.level(1);
      G.combat.forceCrit('none');
      const e = T.spawn('phantom', 22, 0, 0);
      const out = { rise: e.rise };
      e.rise = 0;
      const v = T.volley(e);
      out.round = v.hits.map((l) => ({ dmg: l.dmg, rangeMul: l.rangeMul, aspectMul: l.aspectMul }));
      G.damage(e, 9999);
      G.damage(e, 9999);
      out.floor = { hp: e.hp, sinking: e.sinking, spectral: !!e.spectral, fighting: G.fighting(e) };
      G.state.mode = 'paused';
      await T.redraw();
      out.boss = T.text('boss-name');
      G.state.mode = 'playing';
      out.crew = G.combat.crewOf(e);
      out.strikeAt = e.strikeAt;
      // grape thins her ghost crew (grape is not halved)
      G.combat.setAmmo('grape');
      T.place(e, 14, 0, 0);
      let n = 0;
      const grape = [];
      while (!e.surrendered && n < 10) {
        grape.push(...T.volley(e, { seconds: 1 }).hits.map((l) => Math.round((l.dmg / l.rangeMul) * 1000) / 1000));
        n++;
      }
      G.combat.setAmmo('round');
      Object.assign(out, { volleys: n, grape: [...new Set(grape)], surrendered: e.surrendered, crewLeft: G.combat.crewOf(e), banner: T.text('banner') });
      T.place(e, 9, 0, 0);
      out.pick = G.boarding.pick().label;
      const gold0 = G.state.gold;
      G.grapple();
      T.steps(3, () => G.boarding.active);
      Object.assign(out, { captured: e.captured, gold: G.state.gold - gold0, legend: G.feats.legend, saved: JSON.parse(localStorage.getItem('pirates-ahoy-feats') || '{}').legend });
      G.combat.forceCrit(null);
      return out;
    });
    check(ph.round.length >= 2 && ph.round.every((h) => near(h.dmg, 10 * h.rangeMul * 0.5, 1e-9) && h.aspectMul === 1), `phantom: round shot does half while her ghost crew stands (${J(ph.round)})`);
    check(ph.floor.hp === 1 && !ph.floor.sinking && ph.floor.spectral && ph.floor.fighting && /BOARD HER!/.test(ph.boss) && ph.crew === 13 && ph.strikeAt === 4,
      `phantom: her hull never drops below 1; she turns spectral and the boss bar says "BOARD HER!" (${J({ ...ph.floor, boss: ph.boss, crew: ph.crew })})`);
    check(ph.surrendered && ph.crewLeft <= 4 && J(ph.grape) === '[3]' && /ghost crew is banished/.test(ph.banner), `phantom: grape (full strength) thins her ghost crew to the notch and they are banished (${J({ volleys: ph.volleys, grape: ph.grape, crew: ph.crewLeft, banner: ph.banner })})`);
    check(ph.pick === 'take' && ph.captured && ph.gold === 625 && ph.legend === 1 && ph.saved === 1, `phantom: a grapple takes her for 625 gold and the legend feat, saved (${J({ pick: ph.pick, gold: ph.gold, legend: ph.legend, saved: ph.saved })})`);
  });

  // --------------------------------------------------------------------------------------------------- hud
  await section('hud', async () => {
    // The crew chip in the hull card.
    const chip = await ev(page, async () => {
      const G = window.__game;
      T.level(1);
      G.state.mode = 'paused';
      await T.redraw();
      const el = document.getElementById('crew-chip');
      const a = { shown: T.shown('crew-chip'), text: T.text('crew-chip'), label: el.getAttribute('aria-label') };
      G.combat.setCrew('player', 9);
      await T.redraw();
      const b = { text: T.text('crew-chip'), label: el.getAttribute('aria-label') };
      const card = document.getElementById('hull-card').getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { a, b, inside: r.left >= card.left - 0.5 && r.right <= card.right + 0.5 && r.top >= card.top - 0.5 && r.bottom <= card.bottom + 0.5 };
    });
    check(chip.a.shown && chip.a.text === '12' && chip.a.label === 'Crew 12 of 12' && chip.b.text === '9' && chip.b.label === 'Crew 9 of 12' && chip.inside,
      `HUD: the crew chip in the hull card shows your hands ("${chip.a.text}", "${chip.a.label}" -> "${chip.b.text}", "${chip.b.label}")`);

    // The Board cell, the touch pill's word and label, and the odds icon on her tag: capture / fight / risky.
    const board = await ev(page, async ({}) => {
      const G = window.__game;
      const out = {};
      for (const [name, type, lat, hp] of [['capture', 'privateer', 8.5, 32], ['fight', 'manowar', 9.5, 32], ['risky', 'privateer', 8.5, 80]]) {
        T.level(1);
        const e = T.spawn(type, lat, 0, 0);
        G.damage(e, e.maxHp - hp);
        e.reload.port = e.reload.star = 99;
        await T.live(3);
        const pill = document.getElementById('touch-board');
        out[name] = { tag: T.text('board-tag'), state: document.getElementById('gun-board').dataset.state, word: T.text('touch-board'), aria: pill.getAttribute('aria-label'), disabled: pill.getAttribute('aria-disabled'), icon: G.tagInfo(e) && G.tagInfo(e).icon, odds: G.boarding.odds(e).label };
        G.capture.escape(e);
      }
      return out;
    }, {});
    check(board.capture.tag === 'CAPTURE! −1' && board.capture.state === 'capture' && board.capture.word === 'Take!' && board.capture.aria === 'Board the Privateer Brig: capture likely, about 1 hand lost' && board.capture.disabled === 'false' && board.capture.icon === 'capture',
      `HUD: a battered privateer in reach reads CAPTURE! −1 (Board cell, "Take!" pill, a green tick on her tag) (${J(board.capture)})`);
    check(board.fight.tag === 'FIGHT! −3' && board.fight.state === 'fight' && board.fight.word === 'Fight' && board.fight.icon === 'fight' && /^Board the Man-o'-War: /.test(board.fight.aria),
      `HUD: a man-o'-war at 20 % reads FIGHT! −3 (gold cutlasses) (${J(board.fight)})`);
    check(board.risky.tag === 'RISKY! −4' && board.risky.state === 'risky' && board.risky.word === 'Risky' && board.risky.icon === 'risky' && /risky, about 4 hands lost$/.test(board.risky.aria),
      `HUD: a privateer at full hull reads RISKY! −4 (red "!") (${J(board.risky)})`);

    // RAKE! instead of FIRE! when that side's target shows you her stern (FIRE! when she is beam-on).
    const rake = await ev(page, async () => {
      const G = window.__game;
      const out = {};
      for (const [name, turn] of [['stern', -Math.PI / 2], ['beam', 0]]) {
        T.level(1);
        const e = T.spawn('privateer', 18, 6, turn);
        e.reload.port = e.reload.star = 99;
        await T.live(3);
        const cell = document.getElementById('gun-star');
        out[name] = { cue: G.combat.rakeCue(1), tag: cell.querySelector('.fire-tag').textContent, rake: cell.classList.contains('rake'), target: cell.classList.contains('target') };
        G.capture.escape(e);
      }
      return out;
    });
    check(rake.stern.cue === 'stern' && rake.stern.tag === 'RAKE!' && rake.stern.rake && rake.stern.target && rake.beam.cue === null && rake.beam.tag === 'FIRE!' && !rake.beam.rake && rake.beam.target,
      `HUD: the starboard cell reads RAKE! when the target in its arc shows her stern, FIRE! when she is beam-on (${J(rake)})`);

    // A pop at the impact: the volley's summed damage over the ship it hit.
    const pop = await ev(page, async () => {
      const G = window.__game;
      T.level(1);
      G.combat.forceCrit('none');
      const e = T.spawn('privateer', 18, 8, 0);
      const v = T.volley(e, { seconds: 1.2 });
      G.combat.forceCrit(null);
      e.reload.port = e.reload.star = 99;
      await T.live(3); // (pops fade in over real frames)
      const spans = [...document.querySelectorAll('#pops .pop')].filter((s) => getComputedStyle(s).display !== 'none' && s.getClientRects().length && Number(getComputedStyle(s).opacity) > 0);
      const want = String(Math.round(v.dhp));
      const hit = spans.find((s) => s.textContent.trim() === want);
      const r = hit && hit.getBoundingClientRect();
      const p = new G.camera.position.constructor(e.x, e.mesh.position.y + 3, e.z).project(G.camera);
      return { count: G.pops.count, want, texts: spans.map((s) => s.textContent.trim()), cls: hit && hit.className, box: r && { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }, ship: { x: Math.round(((p.x + 1) / 2) * innerWidth), y: Math.round(((1 - p.y) / 2) * innerHeight) } };
    });
    check(pop.count > 0 && pop.box && /pop-dmg/.test(pop.cls) && Math.abs(pop.box.x - pop.ship.x) < 200 && Math.abs(pop.box.y - pop.ship.y) < 250 && pop.box.x > 0 && pop.box.x < 1280 && pop.box.y > 0 && pop.box.y < 720,
      `HUD: a pop with the volley's damage ("${pop.want}") appears over the ship it hit (${J(pop)})`);

    // The boarding strip shows during a set-piece (not in its result, not otherwise).
    const strip = await ev(page, async () => {
      const G = window.__game;
      T.level(1);
      const e = T.spawn('privateer', 8.5, 0, 0);
      G.damage(e, 48);
      G.state.mode = 'paused';
      await T.redraw();
      const out = { idle: T.shown('boarding-strip') };
      G.state.mode = 'playing';
      G.grapple();
      for (const ph of ['hook', 'reel', 'swing', 'brawl', 'result']) {
        T.steps(3, () => G.boarding.phase !== ph);
        G.state.mode = 'paused';
        await T.redraw();
        const el = document.getElementById('boarding-strip');
        out[ph] = { shown: T.shown('boarding-strip'), title: (el.querySelector('.bs-title') || {}).textContent, us: (el.querySelector('.bs-us b') || {}).textContent, them: (el.querySelector('.bs-them b') || {}).textContent, hidden: el.getAttribute('aria-hidden') };
        G.state.mode = 'playing';
      }
      return out;
    });
    check(!strip.idle && ['hook', 'reel', 'swing', 'brawl'].every((ph) => strip[ph].shown && strip[ph].hidden === 'true') && strip.hook.title === 'Grapple!' && strip.reel.title === 'Heave!' && strip.reel.us === '12' && strip.reel.them === '9' && !strip.result.shown,
      `HUD: the boarding strip shows "⚔ 12 vs 9 ☠" during the set-piece (${['hook', 'reel', 'swing', 'brawl'].map((ph) => strip[ph].title).join(' / ')}), not in its result (${J({ idle: strip.idle, result: strip.result.shown })})`);
  });

  // ------------------------------------------------------------------------------------------------- audio
  await section('audio', async () => {
    const NEW_SFX = ['grapple', 'heave', 'clash', 'cheer', 'capture', 'crit', 'rake', 'chain', 'grape', 'cut', 'crunch', 'thunder', 'step', 'overboard', 'ghost'];
    const sound = await page.evaluate(async (names) => {
      const M = await import('/src/audio.js');
      const out = { missing: names.filter((n) => !M.SFX_NAMES.includes(n)), bad: [], peaks: {} };
      for (const sfx of names) {
        const r = await M.__audioTest.renderOffline({ sfx, seconds: 1, music: false, ambience: false });
        let peak = 0;
        let finite = true;
        const loud = [0, 0];
        r.channels.forEach((ch, c) => {
          for (const v of ch) {
            if (!Number.isFinite(v)) finite = false;
            else {
              const a = Math.abs(v);
              if (a > peak) peak = a;
              if (a > 1e-3 && c < 2) loud[c]++;
            }
          }
        });
        out.peaks[sfx] = Math.round(peak * 1000) / 1000;
        if (!finite || r.channels.length !== 2 || peak <= 0.01 || peak > 1 || !loud[0] || !loud[1]) out.bad.push(`${sfx} (${r.channels.length} ch, peak ${peak}, finite ${finite})`);
      }
      return out;
    }, NEW_SFX);
    check(sound.missing.length === 0 && sound.bad.length === 0, `audio: offline renders of the ${NEW_SFX.length} new sounds are finite, stereo and not silent (${sound.bad.length ? 'bad: ' + sound.bad.join(', ') : J(sound.peaks)}${sound.missing.length ? '; missing: ' + sound.missing : ''})`);
  });

  // ----------------------------------------------------------------------------------------- saved records
  await section('records', async () => {
    const rec = await ev(page, () => {
      const G = window.__game;
      const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
      G.setFeats({});
      T.level(1);
      // rakes and crits are counted at once, saved on pause
      G.combat.forceCrit('crit');
      const e = T.spawn('privateer', 20, 0, -Math.PI / 2);
      const v = T.volley(e, { seconds: 1.2 });
      G.combat.forceCrit(null);
      const out = { hits: v.hits.length, counted: { rakes: G.feats.rakes, crits: G.feats.crits }, before: read('pirates-ahoy-feats') };
      G.togglePause(); // pausing saves them
      out.paused = read('pirates-ahoy-feats');
      G.togglePause();
      document.getElementById('pause-screen').classList.add('hidden');
      G.capture.escape(e);
      // a boarding that reaches its brawl and a capture: saved at once
      const p = G.spawn('privateer', 0, 0, 0);
      T.place(p, 8.5);
      G.damage(p, 48);
      G.grapple();
      T.steps(6, () => G.boarding.active);
      out.captured = p.captured;
      out.after = read('pirates-ahoy-feats');
      // the surrender tip (bit 128) is shown once and saved
      const c = T.spawn('cutter', 18, 0, 0);
      G.capture.strike(c);
      out.tips = { mem: G.tips, saved: Number(localStorage.getItem('pirates-ahoy-tips')), tip: G.tip(128), hint: T.shown('hint') ? T.text('hint') : '' };
      return out;
    });
    check(rec.hits >= 2 && rec.counted.rakes === rec.hits && rec.counted.crits === rec.hits && rec.before && rec.before.rakes === 0 && rec.paused && rec.paused.rakes === rec.hits && rec.paused.crits === rec.hits,
      `saved records: rakes and crits are counted per ball and saved when the game pauses (${J({ counted: rec.counted, before: rec.before && rec.before.rakes, saved: rec.paused && [rec.paused.rakes, rec.paused.crits] })})`);
    check(rec.captured && rec.after && rec.after.captures === 1 && rec.after.boardings === 1 && rec.after.prizes && J(rec.after.prizes) === '{"privateer":1}', `saved records: a capture saves captures, boardings and prizes at once (${J(rec.after)})`);
    check(rec.tips.tip && rec.tips.mem === rec.tips.saved && (rec.tips.saved & 128) === 128, `saved records: the one-time tips are a saved bitmask (${J(rec.tips)})`);
    // The tavern record decides the crew, crit chance and grapples at the next level start.
    const arm = await ev(page, () => {
      const G = window.__game;
      const cfg = G.armory.set({ up: { boarders: 1, cutlass: 2, grapple: 1, gunner: 3 } });
      const saved = localStorage.getItem('pirates-ahoy-armory');
      T.level(1);
      const out = { cfg, saved, crew: G.crew, critBase: G.state.critBase, reach: G.state.grappleRange, reel: G.state.reelTime, blade: G.state.blade, coils: G.player.mesh.userData.coils };
      G.armory.set({ up: { boarders: 0, cutlass: 0, grapple: 0, gunner: 0 } });
      T.level(1);
      out.reset = { crew: G.crew.max, critBase: G.state.critBase, coils: G.player.mesh.userData.coils };
      return out;
    });
    check(arm.saved === '{"up":{"boarders":1,"cutlass":2,"grapple":1,"gunner":3}}' && arm.crew.max === 15 && arm.crew.crew === 15 && arm.critBase === 0.15 && arm.reach === 17 && arm.reel === 1 && arm.blade === 1.4 && arm.coils === 2 &&
      arm.reset.crew === 12 && arm.reset.critBase === 0.06 && arm.reset.coils === 0,
      `saved records: the tavern record is saved and sets crew 15, crit 15 %, 17-pace grapples (1.0 s reel, 2 coils on the rail) and cutlass x1.4 at the next level (${J(arm)})`);
    // Broken records are replaced by valid ones when the game loads (and rewritten).
    const bad = await open({
      label: 'records',
      store: {
        'pirates-ahoy-feats': '{"captures":"lots","rakes":-4,"crits":12,"prizes":{"kraken":3,"cutter":2.5,"galleon":2}}',
        'pirates-ahoy-armory': '{"up":{"boarders":9,"gunner":2.5,"cutlass":1}}',
        'pirates-ahoy-look': 'not json at all',
        'pirates-ahoy-tips': '7.5',
      },
    });
    const fixed = await bad.page.evaluate(async () => {
      const G = window.__game;
      const C = await import('/src/cosmetics.js');
      const A = await import('/src/armory.js');
      const raw = (k) => localStorage.getItem(k);
      G.newGame(1);
      G.state.mode = 'paused';
      return {
        feats: G.feats,
        featsSaved: raw('pirates-ahoy-feats') === C.serializeFeats(G.feats),
        armory: G.armory.config,
        armorySaved: raw('pirates-ahoy-armory') === A.serializeArmoryConfig(G.armory.config),
        crew: G.crew.max,
        look: raw('pirates-ahoy-look') === C.serializeLook(C.defaultLook()) && C.serializeLook(G.look) === C.serializeLook(C.defaultLook()),
        tips: [G.tips, raw('pirates-ahoy-tips')],
      };
    });
    await bad.ctx.close();
    check(fixed.feats.captures === 0 && fixed.feats.rakes === 0 && fixed.feats.crits === 12 && J(fixed.feats.prizes) === '{"galleon":2}' && fixed.featsSaved && fixed.armory.up.boarders === 3 && fixed.armory.up.gunner === 0 && fixed.armory.up.cutlass === 1 && fixed.armorySaved && fixed.crew === 22 && fixed.look && fixed.tips[0] === 0 && fixed.tips[1] === '0',
      `saved records: broken feats, tavern, look and tips records load as valid values and are rewritten (${J(fixed)})`);
  });

  // ---------------------------------------------------------------------------- draw calls and screenshots
  await section('draws', async () => {
    // Level starts with the chase camera (SPEC2 §12: <= 320 for Act I).
    const starts = [];
    for (let n = 1; n <= 3; n++) {
      await ev(page, (n) => {
        const G = window.__game;
        G.state.tutorialDone = true;
        G.newGame(n);
        G.state.intro = 0;
        T.steps(1);
      }, n);
      await page.evaluate(() => T.redraw());
      starts.push(await page.evaluate(() => window.__game.renderInfo.calls));
    }
    console.log(`      level starts (chase camera): ${starts.join(', ')} draw calls`);
    // Level 1, wave 2 alive: board the privateer with the cutter on screen, hulls battered and wrecked.
    const setup = await ev(page, () => {
      const G = window.__game;
      G.state.tutorialDone = true;
      G.newGame(1);
      G.state.intro = 0;
      G.colliders.forEach((c) => (c.x += 5000));
      for (const e of G.enemies) G.damage(e, 9999);
      T.steps(5);
      const p = G.player;
      p.speed = 0;
      G.state.sail = 0;
      const alive = G.enemies.filter((e) => G.fighting(e));
      const priv = alive.find((e) => e.typeName === 'privateer');
      const cut = alive.find((e) => e.typeName === 'cutter');
      T.place(priv, 8.5, 0, 0);
      G.damage(priv, 48);
      T.place(cut, -10, 22, 2);
      G.damage(cut, 26); // wrecked
      cut.reload.port = cut.reload.star = 99;
      p.hp = p.maxHp * 0.25; // wrecked: deck fire on yours too
      G.state.combatTime = 0; // the cutter holds fire a little longer
      G.state.bannerTimer = 0.001; // the reinforcements' banner goes
      const g = G.grapple();
      return { ok: g.ok, wave: G.state.wave, ships: alive.map((e) => e.typeName).join() };
    });
    // Play it in real time; screenshots at the swing and in the brawl (two frames after it starts). Every frame
    // drawn while the boarding lasts is counted, from the hooks (the chase view, the busiest) to the result.
    await page.evaluate(() => {
      const G = window.__game;
      const rec = (window.__draws = { max: 0, at: null, frames: 0, by: {} });
      const f = () => {
        if (!G.boarding.active) return;
        const c = G.renderInfo.calls;
        const ph = G.boarding.phase;
        rec.frames++;
        rec.by[ph] = Math.max(rec.by[ph] || 0, c);
        if (c > rec.max) {
          rec.max = c;
          rec.at = ph;
        }
        requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    await page.evaluate(() => { window.__game.state.mode = 'playing'; });
    await page.waitForFunction(() => (window.__game.boarding.phase === 'swing' && window.__game.boarding.module.phaseTime >= 0.3) || window.__game.boarding.phase === 'brawl' || !window.__game.boarding.active, null, { timeout: 120000, polling: 10 });
    await page.evaluate(() => { window.__game.state.mode = 'paused'; });
    await frames(page, 2);
    await snap(page, 'boarding-swing.png');
    await page.evaluate(() => { window.__game.state.mode = 'playing'; });
    await page.waitForFunction(() => window.__game.boarding.phase === 'brawl' || !window.__game.boarding.active, null, { timeout: 120000, polling: 10 });
    await frames(page, 2);
    const brawl = await page.evaluate(() => {
      const G = window.__game;
      const r = { phase: G.boarding.phase, calls: G.renderInfo.calls, figures: G.boarding.figures, ships: G.enemies.filter((e) => G.fighting(e)).length };
      return r;
    });
    await page.waitForFunction(() => window.__game.boarding.module.phaseTime >= 0.8 || window.__game.boarding.phase !== 'brawl', null, { timeout: 120000, polling: 10 });
    await page.evaluate(() => { window.__game.state.mode = 'paused'; });
    await frames(page, 2);
    await snap(page, 'boarding-brawl.png');
    check(setup.ok && setup.wave === 1 && brawl.phase === 'brawl' && brawl.figures > 0 && brawl.calls > 0 && brawl.calls <= 450,
      `draw calls: a boarding on level 1 with wave 2 alive stays within 450 two frames into the brawl (${brawl.calls}; ${J({ ...setup, ...brawl })})`);
    // ... and on every frame of the whole set-piece, hooks to result (the chase view of the hook is the peak).
    await page.evaluate(() => { window.__game.state.mode = 'playing'; });
    await page.waitForFunction(() => !window.__game.boarding.active, null, { timeout: 120000, polling: 10 });
    await page.evaluate(() => { window.__game.state.mode = 'paused'; });
    const draws = await page.evaluate(() => window.__draws);
    check(draws.frames >= 10 && ['hook', 'reel', 'swing', 'brawl', 'result'].every((ph) => draws.by[ph] > 0) && draws.max > 0 && draws.max <= 450,
      `draw calls: the most in any frame of that boarding, hooks to result, is ${draws.max} (in its ${draws.at}), within 450 (${draws.frames} frames; most by phase ${J(draws.by)})`);
    check(starts.every((c) => c > 0 && c <= 320), `draw calls: each Act I level starts within 320 with the chase camera (${starts.join(', ')})`);
    // Damage states: battered and wrecked hulls with holes, smoke and a deck fire.
    const states = await ev(page, () => {
      const G = window.__game;
      const p = T.level(1);
      G.combat.forceCrit('none');
      // battered (under 60 %): holes from a broadside, grey smoke, slack sails
      const a = T.spawn('privateer', 16, 8, 0);
      T.volley(a, { seconds: 1.2 });
      G.damage(a, a.hp - a.maxHp * 0.48);
      // wrecked (under 30 %): holes, dark smoke, a deck fire, a drooping sail
      const b = T.spawn('corsair', -16, 8, 0);
      T.volley(b, { side: -1, seconds: 1.2 });
      G.damage(b, b.hp - b.maxHp * 0.2);
      G.combat.forceCrit(null);
      p.hp = p.maxHp * 0.5;
      G.state.regenShown = true; // no "Repairing!" banner over the picture
      G.state.lastHit = G.state.time;
      const hold = T.pinner(p, a, b);
      T.steps(1.5, hold);
      G.state.bannerTimer = 0.001;
      window.__damaged = [a, b];
      // holes where the balls hit: on her side that faced your guns (ship-local +x is port)
      const holes = (s) => {
        const H = s.mesh.getObjectByName('holes');
        const out = [];
        for (let i = 0; H && i < H.count; i++) {
          const m = new G.camera.matrix.constructor();
          H.getMatrixAt(i, m);
          out.push(Math.sign(m.elements[12]));
        }
        return out;
      };
      return { hits: [a.hitsBySide, b.hitsBySide], holes: [holes(a), holes(b)], hp: [a.hp / a.maxHp, b.hp / b.maxHp] };
    });
    await page.evaluate(() => T.live(6));
    await page.waitForTimeout(1200); // the hit marker fades
    await page.evaluate(() => T.redraw());
    await snap(page, 'damage-states.png');
    Object.assign(states, await page.evaluate(() => ({ a: window.__damaged[0].mesh.userData.damageLevel, b: window.__damaged[1].mesh.userData.damageLevel, list: window.__damaged.map((s) => Math.round(s.list * 10000) / 10000) })));
    check(states.a === 1 && states.b === 2, `visible damage: a battered and a wrecked hull show their damage levels (${J({ a: states.a, b: states.b, hp: states.hp })})`);
    const sideOk = (i) => {
      const h = states.hits[i];
      const holes = states.holes[i];
      return h.port + h.star > 0 && holes.length === h.port + h.star && holes.filter((x) => x === 1).length === h.port && holes.filter((x) => x === -1).length === h.star;
    };
    check(sideOk(0) && sideOk(1) && states.hits[0].port > states.hits[0].star && states.hits[1].star > states.hits[1].port,
      `visible damage: each hit leaves a hole on the side it struck (${J({ hits: states.hits, holes: states.holes })})`);
    check(states.list[0] < 0 && states.list[1] > 0 && Math.abs(states.list[1]) > Math.abs(states.list[0]), `visible damage: she lists toward the side with more hits, a wreck more (${J(states.list)})`);
    // Your own holes are patched when the carpenter has the hull full again.
    const patched = await ev(page, () => {
      const G = window.__game;
      const p = T.level(1);
      const e = T.spawn('privateer', 18, 0, 0);
      e.reload.port = e.reload.star = 0;
      const fired = G.fire(e, -1, p);
      const hold = T.pinner(p, e);
      T.steps(1.5, hold);
      const H = () => (p.mesh.getObjectByName('holes') || { count: 0 }).count;
      const out = { fired, hurt: p.maxHp - p.hp, holes: H(), first: !!p.firstHole };
      G.capture.escape(e);
      T.steps(30, () => p.hp < p.maxHp);
      T.steps(0.1);
      Object.assign(out, { full: p.hp === p.maxHp, after: H(), firstAfter: p.firstHole });
      return out;
    });
    check(patched.fired && patched.hurt > 0 && patched.holes > 0 && patched.first && patched.full && patched.after === 0 && patched.firstAfter === null,
      `visible damage: your hull's holes are patched once it is full again (${J(patched)})`);
  });

  // ------------------------------------------------- leaving the battle from the pause dialog during a raid
  // (controls.cjs covers leaving mid-brawl and with raiders on deck; these are the raider's threat with G held,
  // and the counter-board window.)
  await section('leave', async () => {
    const setup = await ev(page, () => {
      const G = window.__game;
      T.level(1);
      G.state.gold = G.state.goldAtLevelStart + 80;
      const e = T.spawn('raider', 7.5, 0, 0);
      G.boarding.raid(e);
      T.steps(0.2);
      return { phase: G.boarding.phase, purse: G.state.purse, gold0: G.state.goldAtLevelStart };
    });
    await page.evaluate(() => { window.__game.state.mode = 'playing'; });
    await page.keyboard.down('g'); // one cut, and the hold starts
    const held = await page.evaluate(() => ({ cut: window.__game.boarding.cutProgress, phase: window.__game.boarding.phase }));
    await page.keyboard.press('p');
    await page.click('#quit-dock-btn');
    await page.waitForTimeout(400);
    await page.click('#leave-yes-btn');
    await page.waitForFunction(() => window.__game.state.mode === 'dock', null, { timeout: 120000 }).catch(() => {});
    await page.keyboard.up('g');
    const dock = await page.evaluate(() => {
      const G = window.__game;
      return {
        mode: G.state.mode,
        from: G.dock.from,
        active: G.boarding.active,
        counter: G.boarding.counterTarget !== null,
        figures: G.boarding.figures,
        overboard: G.overboard.active,
        enemies: G.enemies.length,
        gold: G.state.gold,
        purse: G.state.purse,
        exits: [...document.querySelectorAll('#dock-exits button')].map((b) => b.textContent.trim()).join(' | '),
      };
    });
    check(setup.phase === 'threat' && held.phase === 'threat' && held.cut > 0 && dock.mode === 'dock' && dock.from === 'quit' && !dock.active && dock.counter === false && dock.figures === 0 && dock.overboard === 0 && dock.enemies === 0 &&
      dock.gold === setup.gold0 && dock.purse === setup.purse && /^Try again/.test(dock.exits),
      `leave the battle: from the pause dialog with the raiders' hooks in and G held, Shipyard -> Leave goes to the shipyard with nothing of the raid left and this level's plunder dropped (${J({ setup, held, dock })})`);
    // Try again: a new raid starts clean (no hold left over, no cut carried over).
    await page.evaluate(() => { window.__game.dock.leave('retry'); });
    const again = await ev(page, () => {
      const G = window.__game;
      const p = G.player;
      G.state.intro = 0;
      G.colliders.forEach((c) => (c.x += 5000));
      G.enemies.forEach((e, k) => T.park(e, k));
      G.state.combatTime = 30;
      p.speed = 0;
      G.state.sail = 0;
      const e = T.spawn('raider', 7.5, 0, 0);
      const raid = G.boarding.raid(e);
      const cut0 = G.boarding.cutProgress;
      T.steps(1);
      const out = { mode: G.state.mode, level: G.state.level, raid, cut0, after1s: { active: G.boarding.active, phase: G.boarding.phase, reason: G.boarding.last ? G.boarding.last.reason : null } };
      T.g();
      T.g();
      T.g();
      out.taps = { active: G.boarding.active, reason: G.boarding.last && G.boarding.last.reason };
      G.capture.escape(e);
      return out;
    });
    check(again.mode === 'playing' && again.level === 1 && again.raid && again.cut0 === 0 && again.after1s.active && again.after1s.phase === 'threat' && !again.taps.active && again.taps.reason === 'cut',
      `leave the battle: after Try again a new raid starts clean: nothing cut, no hold left over, three G presses cut it (${J(again)})`);
    // The counter-board window open -> Main menu: the next voyage has no counter-board waiting.
    const win = await ev(page, () => {
      const G = window.__game;
      T.level(1);
      const e = T.spawn('raider', 7.5, 0, 0);
      G.boarding.raid(e);
      T.steps(6, () => G.boarding.active);
      return { open: G.boarding.counterTarget === e };
    });
    await page.evaluate(() => { window.__game.state.mode = 'playing'; });
    await page.keyboard.press('p');
    await page.click('#quit-menu-btn');
    await page.waitForTimeout(400);
    await page.click('#leave-yes-btn');
    await page.waitForFunction(() => window.__game.state.mode === 'menu', null, { timeout: 60000 }).catch(() => {});
    const menu = await page.evaluate(() => {
      const G = window.__game;
      return { mode: G.state.mode, counter: G.boarding.counterTarget !== null, figures: G.boarding.figures, player: !!G.player, enemies: G.enemies.length };
    });
    const next = await ev(page, () => {
      const G = window.__game;
      T.level(1);
      const out = { counter: G.boarding.counterTarget !== null, press: G.boardPress(), active: G.boarding.active, kind: G.boarding.kind };
      return out;
    });
    check(win.open && menu.mode === 'menu' && menu.counter === false && menu.figures === 0 && !menu.player && menu.enemies === 0 && next.counter === false && next.press === false && !next.active,
      `leave the battle: with the counter-board window open, Main menu -> Leave ends it; the next voyage has no counter-board waiting (${J({ win, menu, next })})`);
  });

  // ------------------------------------------- prizes, surrender and crew after a boarding (Stage 2 review)
  await section('rules2', async () => {
    // A powder keg still burning when she is taken goes out (BAT-1): the usual soften-then-board play, a close
    // broadside and G at once; a ball crits her keg while the hooks fly, and the brawl is skipped.
    const keg = await ev(page, () => {
      const G = window.__game;
      const p = T.level(1);
      const e = T.spawn('privateer', 12, 0, 0);
      e.hp = 70;
      e.hpLow = 70;
      G.combat.forceCrit('keg'); // (the volley's first ball only)
      p.reload.port = p.reload.star = 0;
      const fired = G.playerFire(1);
      const g = G.boardPress();
      const gold0 = G.state.gold;
      const sunk0 = G.state.sunk;
      let kegIn = null;
      let burning = 0;
      let at = null;
      T.steps(8, () => {
        if (G.combat.log.length) {
          if (kegIn === null) kegIn = G.combat.log.some((l) => l.effect === 'keg') ? G.boarding.phase : 'none';
          G.combat.forceCrit('none');
        }
        if (G.boarding.phase === 'brawl') G.boarding.skip();
        if (!at && e.captured) at = { hp: e.hp, burnTicks: G.combat.effects(e).burnTicks, burningBefore: burning, gold: G.state.gold - gold0 };
        if (!e.captured) burning = G.combat.effects(e).burnTicks;
      });
      G.combat.forceCrit(null);
      const L = G.boarding.last;
      return { fired, g, kegIn, at, last: L && { reason: L.reason, captured: L.captured }, after: { hp: e.hp, sinking: !!e.sinking, sunk: G.state.sunk - sunk0, gold: G.state.gold - gold0, coins: G.coins.filter((c) => c.from === e.id).length } };
    });
    check(keg.fired && keg.g && keg.kegIn === 'hook' && keg.at && keg.at.burningBefore > 0 && keg.at.burnTicks === 0 && keg.last && keg.last.reason === 'done' && keg.last.captured &&
      keg.after.hp === keg.at.hp && !keg.after.sinking && keg.after.sunk === 0 && keg.after.gold === 145 && keg.after.coins === 0,
      `prizes: a powder keg still burning when she is boarded and taken goes out: the prize never sinks under your flag, nor pays sinking coins on top of the 145 (${J(keg)})`);
    // ... and a struck ship still burning, taken at the level's end (G.capture.take: the 'auto' capture).
    const auto = await ev(page, () => {
      const G = window.__game;
      T.level(1);
      const e = T.spawn('cutter', 20, 0, 0);
      e.hp = 5;
      e.hpLow = 5;
      e.effects.burn = 4;
      e.burnTicks = 8; // what a keg crit leaves: 1 hp every 0.5 s for 4 s
      e.burnAcc = 0;
      G.capture.strike(e);
      const sunk0 = G.state.sunk;
      const gold = G.capture.take(e);
      T.steps(4.5);
      return { gold, captured: e.captured, hp: e.hp, sinking: !!e.sinking, burnTicks: G.combat.effects(e).burnTicks, sunk: G.state.sunk - sunk0 };
    });
    check(auto.gold === 85 && auto.captured && auto.hp === 5 && !auto.sinking && auto.burnTicks === 0 && auto.sunk === 0,
      `prizes: a struck cutter taken while her keg burns keeps her 5 hp and doesn't sink (${J(auto)})`);

    // She strikes as soon as her crew is at the notch, whatever thinned it (BAT-2): grape has left a privateer 4
    // hands at full hull (notch 2), then one round-shot broadside thins her crew with her hull.
    const thin = await ev(page, () => {
      const G = window.__game;
      const p = T.level(1);
      G.combat.forceCrit('none');
      const e = T.spawn('privateer', 18, 0, 0);
      G.combat.setCrew(e, 4);
      const before = { crew: G.combat.crewOf(e), notch: e.strikeAt, surrendered: e.surrendered };
      const v = T.volley(e, { seconds: 2 });
      const after = { hp: e.hp, killed: v.dkilled, crew: G.combat.crewOf(e), surrendered: e.surrendered, fighting: G.fighting(e), flag: e.mesh.userData.flag };
      // and she shoots no more: loaded, nothing holding her
      e.reload.port = e.reload.star = 0;
      G.combat.clearLog();
      const hp0 = p.hp;
      T.steps(3);
      after.hitsOnYou = G.combat.log.filter((l) => l.owner === 'enemy').length;
      after.hurt = hp0 - p.hp;
      G.combat.forceCrit(null);
      G.capture.escape(e);
      return { before, hits: v.hits.length, after };
    });
    check(thin.before.crew === 4 && !thin.before.surrendered && thin.hits >= 2 && thin.after.killed === 0 && thin.after.crew <= thin.before.notch && thin.after.surrendered && !thin.after.fighting &&
      thin.after.flag === 'white' && thin.after.hitsOnYou === 0 && thin.after.hurt === 0,
      `surrender: round shot that thins her crew to the notch through her hull makes her strike at once, and she fires no more (${J(thin)})`);
    // A raider thinned to her notch while her hooks bite (the boarding decides then): when the ropes are cut
    // she is checked again, and strikes.
    const cut = await ev(page, () => {
      const G = window.__game;
      T.level(1);
      const e = T.spawn('raider', 7.5, 0, 0);
      const raid = G.boarding.raid(e);
      T.steps(0.3);
      const crew = G.combat.setCrew(e, e.strikeAt);
      const during = { phase: G.boarding.phase, surrendered: e.surrendered };
      G.boarding.cut('hit');
      T.steps(0.1);
      const out = { raid, crew, notch: e.strikeAt, during, reason: G.boarding.last && G.boarding.last.reason, surrendered: e.surrendered, fighting: G.fighting(e), counter: G.boarding.counterTarget !== null };
      G.capture.escape(e);
      return out;
    });
    check(cut.raid && cut.during.phase === 'threat' && !cut.during.surrendered && cut.reason === 'cut' && cut.surrendered && !cut.fighting && !cut.counter,
      `surrender: a raider thinned to her notch during her threat strikes once her ropes are cut (${J(cut)})`);

    // Reinforcements that come aboard while your party is across are kept (BAT-3 / BRD-4): Bali Islands, 8
    // hands; the rest of the wave goes down in the brawl, so the next wave's +3 hands arrive mid-fight. The
    // result takes the fight's losses off the crew you have then. An attack (captured) and a defence.
    const refill = await ev(page, () => {
      const G = window.__game;
      const out = {};
      for (const kind of ['attack', 'defend']) {
        T.level(2);
        G.combat.setCrew('player', 8);
        const e = kind === 'attack' ? T.spawn('cutter', 8.5, 0, 0) : T.spawn('raider', 7.5, 0, 0);
        if (kind === 'attack') {
          G.damage(e, e.maxHp - 14); // CAPTURE!
          G.grapple();
        } else G.boarding.raid(e);
        const others = G.enemies.filter((x) => x !== e);
        let res = null;
        const off = G.boarding.module.onResult((r) => (res = { lost: r.playerCrewLost, captured: !!r.captured }));
        T.steps(8, () => G.boarding.phase !== 'brawl');
        const before = { crew: G.crew.crew, wave: G.state.wave, phase: G.boarding.phase };
        others.forEach((x) => {
          x.rise = 0;
          G.damage(x, 9999);
        });
        T.steps(0.1);
        const mid = { crew: G.crew.crew, wave: G.state.wave, phase: G.boarding.phase };
        T.steps(4, () => G.boarding.active);
        off();
        const max = G.crew.max;
        const want = res && Math.min(max, Math.max(1, mid.crew - res.lost) + (res.captured ? 2 : 0));
        out[kind] = { before, mid, res, crew: G.crew.crew, want, max };
        G.capture.escape(e);
      }
      return out;
    });
    for (const kind of ['attack', 'defend']) {
      const r = refill[kind];
      check(r.before.phase === 'brawl' && r.before.crew === 8 && r.mid.phase === 'brawl' && r.mid.wave === 1 && r.mid.crew === 11 && r.res && r.crew === r.want,
        `crew: the 3 hands of reinforcements that arrive mid-brawl are kept when the ${kind === 'attack' ? 'boarding' : 'defence'} is decided (8 -> 11 mid-fight, -${r.res && r.res.lost}${r.res && r.res.captured ? ' +2' : ''} -> ${r.crew}) (${J(r)})`);
    }
  });

  // --------------------------------------------------- boarding: the counter-board window, leaving, smoke
  await section('boarding2', async () => {
    // The counter-board window (BRD-1) with the raider's AI running (nothing holds her; she boarded you by
    // herself): it lasts its full 3 s whatever your speed, she stays within reach, and when it closes its banner goes too.
    const win = await ev(page, () => {
      const G = window.__game;
      const out = {};
      const raid = (sail) => {
        const p = T.level(1);
        G.state.sail = sail;
        p.speed = [0, 4, 7][sail];
        const e = T.spawn('raider', 7.5, 0, 0);
        e.speed = p.speed;
        T.steps(10, () => !G.boarding.active); // she throws her own hooks
        const kind = G.boarding.kind;
        T.steps(8, () => G.boarding.active); // no cut: the defence holds
        const L = G.boarding.last;
        return { p, e, start: { kind, held: !!(L && L.held), open: G.boarding.counterTarget === e, banner: T.text('banner'), timer: G.state.bannerTimer } };
      };
      for (const sail of [0, 2]) {
        const { p, e, start } = raid(sail);
        const t0 = G.state.time;
        let closed = null;
        let far = 0;
        T.steps(3.5, () => {
          far = Math.max(far, Math.hypot(e.x - p.x, e.z - p.z));
          if (!G.boarding.counterTarget) {
            closed = Math.round((G.state.time - t0) * 1000) / 1000;
            return false;
          }
        });
        out[`sail${sail}`] = { ...start, closed, far: Math.round(far * 10) / 10, timerAfter: G.state.bannerTimer };
        G.capture.escape(e);
      }
      // G 2.2 s into the window: the counter-board starts, and the window's banner goes
      {
        const { e, start } = raid(0);
        T.steps(2.2);
        const open = G.boarding.counterTarget === e;
        T.g();
        T.steps(1 / 120);
        out.late = { ...start, open, active: G.boarding.active, kind: G.boarding.kind, hint: T.shown('hint') ? T.text('hint') : '', banner: T.text('banner'), timerAfter: G.state.bannerTimer };
        G.boarding.cancel('test');
        G.capture.escape(e);
      }
      return out;
    });
    for (const sail of [0, 2]) {
      const r = win[`sail${sail}`];
      check(r.kind === 'defend' && r.held && r.open && /^Counter-board!/.test(r.banner) && r.closed !== null && near(r.closed, 3, 0.02) && r.far < 12 && r.timerAfter <= 0.3 + 1e-9,
        `counter-board: at sail ${sail}, with her AI running, the window stays open its full 3 s (closed after ${r.closed} s; she stayed within ${r.far} u) and its banner goes when it closes (${J(r)})`);
    }
    check(win.late.held && win.late.open && win.late.active && win.late.kind === 'counter' && (!/^Counter-board!/.test(win.late.banner) || win.late.timerAfter <= 0.3 + 1e-9),
      `counter-board: G 2.2 s into the window still boards her back, and the "Counter-board!" banner goes (${J(win.late)})`);

    // Leaving mid-boarding through the pause dialog leaves no rope behind (BRD-3): in the swing (to the main
    // menu) and in the brawl (to the shipyard); P, the button, Enter, Tab to Leave, Enter.
    for (const [to, after] of [['menu', 0.62], ['dock', 1.0]]) {
      const before = await ev(page, async (after) => {
        const G = window.__game;
        T.level(1);
        const e = T.spawn('privateer', 8.5, 0, 0);
        G.damage(e, 48);
        G.grapple();
        let swingAt = null;
        T.steps(6, () => {
          if (G.boarding.phase === 'swing' && swingAt === null) swingAt = G.state.time;
          if (swingAt !== null && G.state.time - swingAt >= after - 1e-9) return false;
        });
        G.state.mode = 'paused';
        await T.redraw();
        return { phase: G.boarding.phase, rig: G.scene.getObjectByName('boarding-rig').visible };
      }, after);
      await page.evaluate(() => { window.__game.state.mode = 'playing'; });
      await page.keyboard.press('p');
      await page.focus(to === 'menu' ? '#quit-menu-btn' : '#quit-dock-btn');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await page.waitForFunction((to) => window.__game.state.mode === to, to, { timeout: 60000 }).catch(() => {});
      await frames(page, 3);
      const left = await page.evaluate(() => {
        const G = window.__game;
        const rig = G.scene.getObjectByName('boarding-rig');
        return { mode: G.state.mode, active: G.boarding.active, figures: G.boarding.figures, rig: rig.visible };
      });
      if (left.mode === 'dock') await page.evaluate(() => window.__game.dock.leave('menu'));
      check(before.rig && left.mode === to && !left.active && left.figures === 0 && left.rig === false,
        `leave the battle mid-boarding (${before.phase}, ${after} s after the swing began) for the ${to === 'menu' ? 'main menu' : 'shipyard'}: no rope is left hanging there (${J({ before, left })})`);
    }

    // No smoke from the ship being boarded, from the hooks on (it would drift over the swing and the brawl): a
    // wrecked privateer smokes until the hooks fly (the emitter of her hull smoke, e.fxAcc, stays idle after).
    const smoke = await ev(page, () => {
      const G = window.__game;
      T.level(1);
      const e = T.spawn('privateer', 8.5, 0, 0);
      G.damage(e, 60); // 25 %: wrecked, dark smoke
      const hold = T.pinner(G.player, e);
      let before = 0;
      T.steps(0.5, () => {
        hold();
        if (e.fxAcc > 0) before++;
      });
      const g = G.grapple().ok;
      const phases = [];
      const smoky = {};
      T.steps(6, () => {
        const ph = G.boarding.phase;
        if (!G.boarding.active) return false;
        if (phases[phases.length - 1] !== ph) phases.push(ph);
        if (e.fxAcc > 0) smoky[ph] = (smoky[ph] || 0) + 1;
      });
      return { hull: e.hp / e.maxHp, before, burning: e.burnTicks, g, phases: phases.join(), smoky };
    });
    check(smoke.before > 30 && smoke.burning === 0 && smoke.g && /^hook,reel,swing,brawl/.test(smoke.phases) && Object.keys(smoke.smoky).length === 0,
      `boarding: a wrecked ship smokes until the hooks fly, then not at all while she is boarded (steps with her smoke emitter running, by phase: ${J(smoke.smoky)}; ${J(smoke)})`);
  });

  // ---------------------------------------------------------- pops and the HIT mark, the Board cell (desktop)
  await section('hud2', async () => {
    // The volley's damage pop keeps clear of the HIT ×N mark (UX-1): a cutter at 20 u, beam-on (the range the AI
    // holds), the chase camera settled on her; then a privateer at 22 u. Every frame while both show.
    const desk = await ev(page, async () => {
      const G = window.__game;
      const p = T.level(1);
      const out = {};
      let settle = 0;
      for (const [type, lat, seed] of [['cutter', 20, 1], ['privateer', 22, 2]]) {
        const e = T.spawn(type, lat, 0, 0);
        e.reload.port = e.reload.star = 99;
        const hold = T.pinner(p, e);
        hold();
        if (!settle) settle = await T.settle(hold);
        out[`${type}${lat}`] = await T.salvo(e, { side: 1, crit: 'none', seed, hold });
        G.capture.escape(e);
        G.state.mode = 'playing';
        T.steps(0.1);
      }
      out.settle = settle;
      return out;
    });
    for (const k of ['cutter20', 'privateer22']) {
      const r = popReport(desk[k]);
      check(desk[k].fired && /^HIT ×3/.test(desk[k].mark) && r.seen.some((t) => /^\d+$/.test(t)) && r.onMark.length === 0 && r.popPop.length === 0 && r.offScreen.length === 0,
        `pops 1280x720: the damage pop of a broadside at a ${k.replace(/\d+/, ' at $& u')} keeps clear of the "${desk[k].mark}" mark all the time both show (${r.frames} frames; seen ${J(r.seen)}${r.onMark.length ? '; over the mark: ' + r.onMark.join(', ') : ''}${r.popPop.length ? '; pop over pop: ' + r.popPop.join(', ') : ''})`);
    }
    console.log(`      (camera settled in ${desk.settle} frames)`);

    // The Board cell in the counter-board window shows the odds (UX-4), as for any boarding: SPEC2 §3.3 example 3
    // leaves the counter-board risky, about 2 hands lost.
    const cell = await ev(page, async () => {
      const G = window.__game;
      T.level(1);
      const e = T.spawn('raider', 7.5, 0, 0);
      G.boarding.raid(e);
      T.steps(6, () => G.boarding.active);
      const odds = G.boarding.odds(e, 'counter');
      G.state.mode = 'paused';
      await T.redraw();
      const gb = document.getElementById('gun-board');
      const out = { open: G.boarding.counterTarget === e, odds: { label: odds.label, attLoss: odds.attLoss }, state: gb.dataset.state, tag: T.text('board-tag') };
      G.boarding.cancel('test');
      G.capture.escape(e);
      return out;
    });
    check(cell.open && cell.odds.label === 'risky' && cell.state === 'risky' && cell.tag === `AGAIN! −${cell.odds.attLoss}`,
      `HUD: in the counter-board window the Board cell shows its odds: "${cell.tag}" in the red risky state, not a gold "again" (${J(cell)})`);

    // Reduced motion: switching ammo doesn't bump the Ammo cell's value (UX-7).
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const bump = await ev(page, async () => {
      const G = window.__game;
      G.state.unlocked = 3;
      T.level(1);
      G.state.mode = 'paused';
      await T.redraw();
      G.state.mode = 'playing';
      const set = G.combat.setAmmo('chain');
      G.state.mode = 'paused';
      await T.redraw();
      const val = document.querySelector('#gun-ammo .ammo-val');
      return { set, bumped: document.getElementById('gun-ammo').classList.contains('bump'), running: val.getAnimations().filter((a) => a.playState === 'running').map((a) => a.animationName) };
    });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const bumpOn = await ev(page, async () => {
      const G = window.__game;
      G.combat.setAmmo('round');
      G.state.mode = 'paused';
      await T.redraw();
      return document.querySelector('#gun-ammo .ammo-val').getAnimations().map((a) => a.animationName);
    });
    check(bump.set && bump.bumped && bump.running.length === 0 && bumpOn.includes('chip-bump'),
      `reduced motion: switching ammo doesn't bump the Ammo cell (running: ${J(bump.running)}; without reduced motion: ${J(bumpOn)})`);
  });

  await page.close();
  await main.ctx.close();

  // ------------------------------------------------------------------------------------------------- touch
  await section('touch', async () => {
    const { ctx, page: tp } = await open({ width: 390, height: 844, touch: true, label: 'touch', store: { 'pirates-ahoy-unlocked': '3', 'pirates-ahoy-tutorial-done': '1', 'pirates-ahoy-tips': '255' } });
    const hooks = () => tp.evaluate(() => window.__hooks || 0);
    await tp.evaluate(() => {
      window.__hooks = 0;
      window.__game.boarding.module.onPhase((ev) => { if (ev.phase === 'hook') window.__hooks++; });
    });
    // a battered cutter `lat` off your beam (frozen), the Board pill drawn
    const setup = (lat) => ev(tp, async (lat) => {
      const G = window.__game;
      T.level(1);
      const e = T.spawn('cutter', lat, 0, 0);
      G.damage(e, 23);
      e.reload.port = e.reload.star = 99;
      window.__hooks = 0;
      await T.live(3);
      const b = document.getElementById('touch-board');
      const r = b.getBoundingClientRect();
      return { word: T.text('touch-board'), aria: b.getAttribute('aria-label'), disabled: b.getAttribute('aria-disabled'), shown: T.shown('touch-board'), w: Math.round(r.width), h: Math.round(r.height) };
    }, lat);
    const tapPlaying = async (sel, opts) => {
      await tp.evaluate(() => { window.__game.state.mode = 'playing'; });
      await tp.tap(sel, opts);
      return tp.evaluate(async () => {
        const G = window.__game;
        G.state.mode = 'paused';
        await T.redraw();
        return { active: G.boarding.active, kind: G.boarding.kind, hint: T.shown('hint') ? T.text('hint') : '', ammo: G.combat.ammo, pill: T.text('touch-ammo') };
      });
    };
    const far = await setup(30);
    const farTap = await tapPlaying('#touch-board', { force: true });
    check(far.shown && far.disabled === 'true' && /get closer/.test(far.aria) && far.h >= 44 && far.w >= 44 && !farTap.active && /Get closer!/.test(farTap.hint) && (await hooks()) === 0,
      `touch: out of reach the Board pill is aria-disabled, says why, and a tap shows the reason (${J({ far, hint: farTap.hint })})`);
    const inReach = await setup(8);
    const tapped = await tapPlaying('#touch-board');
    await tp.waitForTimeout(300);
    check(inReach.disabled === 'false' && inReach.word === 'Take!' && /^Board the Corsair Cutter: capture likely/.test(inReach.aria) && tapped.active && tapped.kind === 'attack' && (await hooks()) === 1,
      `touch: one tap on "Take!" is exactly one grapple (${J({ inReach, hooks: await hooks() })})`);
    // In the reel each tap is one heave (the click that follows a tap is not a second press).
    await ev(tp, () => window.T.steps(1, () => window.__game.boarding.phase !== 'reel'));
    const heave1 = await tapPlaying('#touch-board');
    const heaves1 = await tp.evaluate(() => ({ heaves: window.__game.boarding.heaves, phase: window.__game.boarding.phase, word: T.text('touch-board') }));
    check(heave1.active && heaves1.phase === 'reel' && heaves1.heaves === 1 && heaves1.word === 'Heave!', `touch: in the reel the pill reads "Heave!" and one tap is exactly one heave (${J(heaves1)})`);
    for (const key of ['Enter', ' ']) {
      await setup(8);
      await tp.focus('#touch-board');
      await tp.evaluate(() => { window.__game.state.mode = 'playing'; });
      await tp.keyboard.press(key);
      const r = await tp.evaluate(() => {
        const G = window.__game;
        G.state.mode = 'paused';
        return { active: G.boarding.active, hooks: window.__hooks };
      });
      await ev(tp, () => window.T.steps(1, () => window.__game.boarding.phase !== 'reel'));
      await tp.evaluate(() => { window.__game.state.mode = 'playing'; });
      await tp.keyboard.press(key);
      r.heaves = await tp.evaluate(() => {
        const G = window.__game;
        G.state.mode = 'paused';
        return G.boarding.heaves;
      });
      check(r.active && r.hooks === 1 && r.heaves === 1, `touch: ${key === ' ' ? 'Space' : 'Enter'} on the focused Board pill grapples once, then heaves once (${J(r)})`);
    }
    // The Ammo pill cycles Round -> Chain -> Grape -> Round.
    await setup(30);
    const ammo = [];
    for (let i = 0; i < 3; i++) ammo.push(await tapPlaying('#touch-ammo'));
    check(ammo.map((a) => a.ammo).join() === 'chain,grape,round' && ammo.map((a) => a.pill).join() === 'Chain,Grape,Round', `touch: the Ammo pill cycles the shot (${ammo.map((a) => `${a.ammo}/${a.pill}`).join(', ')})`);
    // Holding the CUT! pill for 0.8 s cuts the raiders' ropes.
    const hold = await ev(tp, async () => {
      const G = window.__game;
      T.level(1);
      const e = T.spawn('raider', 7.5, 0, 0);
      G.boarding.raid(e);
      G.state.mode = 'paused';
      await T.redraw();
      const b = document.getElementById('touch-board');
      const word = T.text('touch-board');
      G.state.mode = 'playing';
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true }));
      const n = T.steps(2, () => G.boarding.active);
      b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true }));
      return { word, t: Math.round((n / 120) * 1000) / 1000, reason: G.boarding.last && G.boarding.last.reason };
    });
    check(hold.word === 'Cut!' && hold.reason === 'cut' && near(hold.t, 0.8, SUB + 1e-6), `touch: holding the CUT! pill for 0.8 s cuts the ropes (${J(hold)})`);
    // The touch fire button glows gold with RAKE! when that side's target shows her stern.
    const glow = await ev(tp, async () => {
      const G = window.__game;
      T.level(1);
      const e = T.spawn('privateer', 18, 6, -Math.PI / 2);
      e.reload.port = e.reload.star = 99;
      await T.live(3);
      const btn = document.querySelector('[data-tap="fireStar"]');
      return { after: getComputedStyle(btn, '::after').content, shadow: getComputedStyle(btn).boxShadow };
    });
    check(glow.after === '"RAKE!"' && /255, 201, 60/.test(glow.shadow), `touch: the Fire button glows gold with RAKE! when her stern is open (${J(glow)})`);

    // Pops on a portrait phone, the chase camera settled: a privateer beam-on at 18 u (the AI holds 18-26 u) lies
    // off the right edge of the view, and the volley's damage pop still shows, at that edge (UX-8); a point-blank
    // stern rake with a crit: its pops (STERN RAKE ×2!, CRIT! MAST DOWN!, POINT BLANK!, the damage) keep clear of
    // each other and of the SUNK! mark and its stickers (UX-1) all their lives.
    const phone = await ev(tp, async () => {
      const G = window.__game;
      const p = T.level(1);
      const out = {};
      let settle = 0;
      for (const [name, type, lat, turn, crit] of [['abeam', 'privateer', 18, 0, 'none'], ['rake', 'cutter', 9, -Math.PI / 2, 'mast']]) {
        const e = T.spawn(type, lat, 0, turn);
        e.reload.port = e.reload.star = 99;
        const hold = T.pinner(p, e);
        hold();
        if (!settle) settle = await T.settle(hold);
        const ndc = new G.camera.position.constructor(e.x, 1, e.z).project(G.camera);
        out[name] = await T.salvo(e, { side: 1, crit, seed: 1, hold });
        out[name].ndcX = Math.round(ndc.x * 100) / 100;
        G.capture.escape(e);
        G.state.mode = 'playing';
        T.steps(0.1);
      }
      out.settle = settle;
      return out;
    });
    {
      const r = popReport(phone.abeam);
      check(phone.abeam.fired && /^HIT ×3/.test(phone.abeam.mark) && phone.abeam.ndcX > 1 && r.seen.some((t) => /^\d+$/.test(t)) && r.offScreen.length === 0,
        `pops 390x844: a privateer abeam at 18 u is off the right edge of the view (ndc x ${phone.abeam.ndcX}), and the volley's damage pop shows at that edge (seen ${J(r.seen)}${r.offScreen.length ? '; off screen: ' + r.offScreen.join(', ') : ''})`);
      const k = popReport(phone.rake);
      check(phone.rake.fired && /^SUNK!/.test(phone.rake.mark) && k.seen.length >= 3 && k.popPop.length === 0 && k.onMark.length === 0 && k.offScreen.length === 0,
        `pops 390x844: a point-blank stern rake with a crit: its ${k.seen.length} pops (${k.seen.join(' / ')}) never cover each other or the "${phone.rake.mark}" mark (${k.frames} frames${k.popPop.length ? '; pop over pop: ' + k.popPop.join(', ') : ''}${k.onMark.length ? '; over the mark: ' + k.onMark.join(', ') : ''})`);
      console.log(`      (camera settled in ${phone.settle} frames)`);
    }

    // The raiders' threat is read out with the touch words (UX-5); in the counter-board window the Board pill shows
    // the odds (UX-4: SPEC2 §3.3 example 3 leaves it risky).
    const raidT = await ev(tp, async () => {
      const G = window.__game;
      T.watchLive();
      await T.liveQuiet();
      T.level(1);
      const e = T.spawn('raider', 7.5, 0, 0);
      G.boarding.raid(e);
      T.steps(0.1);
      G.state.mode = 'paused';
      await T.redraw();
      const threat = { phase: G.boarding.phase, banner: T.text('banner') };
      await T.liveQuiet();
      threat.live = T.liveLog();
      G.state.mode = 'playing';
      T.steps(6, () => G.boarding.active);
      const odds = G.boarding.odds(e, 'counter');
      G.state.mode = 'paused';
      await T.redraw();
      const tb = document.getElementById('touch-board');
      const pill = { open: G.boarding.counterTarget === e, label: odds.label, attLoss: odds.attLoss, state: tb.dataset.state, word: T.text('touch-board'), aria: tb.getAttribute('aria-label') };
      G.state.mode = 'playing';
      G.boarding.cancel('test');
      G.capture.escape(e);
      return { threat, pill };
    });
    check(raidT.threat.phase === 'threat' && /Tap CUT!/.test(raidT.threat.banner) && raidT.threat.live.some((t) => /^Boarders! .*tap Cut three times or hold it/.test(t)) && !raidT.threat.live.some((t) => /press G/i.test(t)),
      `touch: the raiders' threat is read out with the touch words ("tap Cut", never "press G") (${J(raidT.threat)})`);
    check(raidT.pill.open && raidT.pill.label === 'risky' && raidT.pill.state === 'risky' && raidT.pill.word === 'Again!' && /risky, about 2 hands lost$/.test(raidT.pill.aria),
      `touch: in the counter-board window the "Again!" pill shows the odds (red risky state, not a gold "again") (${J(raidT.pill)})`);

    // Reduced motion: switching ammo doesn't bump the Ammo pill's icon (UX-7).
    await tp.emulateMedia({ reducedMotion: 'reduce' });
    const bumpT = await ev(tp, async () => {
      const G = window.__game;
      T.level(1);
      G.state.mode = 'paused';
      await T.redraw();
      G.state.mode = 'playing';
      const set = G.combat.setAmmo('chain');
      G.state.mode = 'paused';
      await T.redraw();
      const ico = document.querySelector('#touch-ammo .ammo-ico');
      return { set, bumped: document.getElementById('touch-ammo').classList.contains('bump'), running: ico.getAnimations().filter((a) => a.playState === 'running').map((a) => a.animationName) };
    });
    await tp.emulateMedia({ reducedMotion: 'no-preference' });
    const bumpTOn = await ev(tp, async () => {
      const G = window.__game;
      G.combat.setAmmo('round');
      G.state.mode = 'paused';
      await T.redraw();
      return document.querySelector('#touch-ammo .ammo-ico').getAnimations().map((a) => a.animationName);
    });
    check(bumpT.set && bumpT.bumped && bumpT.running.length === 0 && bumpTOn.includes('chip-bump'),
      `touch, reduced motion: switching ammo doesn't bump the Ammo pill (running: ${J(bumpT.running)}; without reduced motion: ${J(bumpTOn)})`);
    await ctx.close();
  });

  // ---------------------------------------------------- first-time tips on touch, and what is read out
  // A fresh profile's tips (new ammo, board, raiders, counter-board, surrender) on a phone: each tip names the button
  // as it reads then (UX-6), and an event whose tip shows is not read out a second time in other words on #game-live
  // (UX-9: the hint bubble is a live region too).
  await section('tips', async () => {
    const { ctx, page: fp } = await open({ width: 390, height: 844, touch: true, label: 'tips', store: { 'pirates-ahoy-unlocked': '3', 'pirates-ahoy-tutorial-done': '1', 'pirates-ahoy-tips': '52' } });
    const r = await ev(fp, async () => {
      const G = window.__game;
      const out = {};
      const hint = () => (T.shown('hint') ? T.text('hint') : '');
      let mark = 0;
      const said = () => {
        const list = T.liveLog().slice(mark);
        mark += list.length;
        return list;
      };
      T.watchLive();
      await T.liveQuiet();
      // new ammo: chain shot, once the level's banner has gone (T.level: gone)
      T.level(1);
      T.steps(1 / 120);
      G.state.mode = 'paused';
      await T.redraw();
      out.ammo = { banner: T.text('banner'), hint: hint() };
      await T.liveQuiet();
      out.ammo.live = said();
      // the first ship in reach
      G.state.mode = 'playing';
      T.level(1);
      const e = T.spawn('privateer', 9, 0, 0);
      e.reload.port = e.reload.star = 99;
      G.damage(e, e.maxHp * 0.6);
      await T.live(4);
      out.board = { hint: hint(), word: T.text('touch-board'), state: document.getElementById('touch-board').dataset.state };
      G.state.mode = 'playing';
      G.capture.escape(e);
      await T.liveQuiet();
      said();
      // raiders hook you
      G.state.mode = 'playing';
      T.level(1);
      const r = T.spawn('raider', 7.5, 0, 0);
      G.boarding.raid(r);
      T.steps(0.1);
      G.state.mode = 'paused';
      await T.redraw();
      out.threat = { phase: G.boarding.phase, hint: hint() };
      await T.liveQuiet();
      out.threat.live = said();
      // ... and are driven back: the counter-board window
      G.state.mode = 'playing';
      T.steps(6, () => G.boarding.active);
      G.state.mode = 'paused';
      await T.redraw();
      out.counter = { open: G.boarding.counterTarget === r, hint: hint() };
      await T.liveQuiet();
      out.counter.live = said();
      G.state.mode = 'playing';
      G.boarding.cancel('test');
      G.capture.escape(r);
      // a cutter in reach strikes her colours
      T.level(1);
      const c = T.spawn('cutter', 9, 0, 0);
      c.reload.port = c.reload.star = 99;
      G.capture.strike(c);
      await T.live(3);
      out.surrender = { struck: c.surrendered, hint: hint(), word: T.text('touch-board') };
      await T.liveQuiet();
      out.surrender.live = said();
      return out;
    });
    check(/^New ammo: Chain shot!/.test(r.ammo.banner) && /^New: chain shot!/.test(r.ammo.hint) && !r.ammo.live.some((t) => /new ammo/i.test(t)),
      `tips (touch): new ammo shows a banner and a tip, and is not read out again on #game-live (${J(r.ammo)})`);
    check(['Take!', 'Fight', 'Risky'].includes(r.board.word) && r.board.hint === `Close enough to board! Tap ${r.board.word}`,
      `tips (touch): the first ship in reach: the tip names the Board pill as it reads ("${r.board.hint}", pill "${r.board.word}")`);
    check(r.threat.phase === 'threat' && /CUT!/.test(r.threat.hint) && !r.threat.live.some((t) => /grappling you/.test(t)),
      `tips (touch): raiders' threat: the tip says it, #game-live doesn't say it again (${J(r.threat)})`);
    check(r.counter.open && /Again!/.test(r.counter.hint) && !r.counter.live.some((t) => /Counter-board/.test(t)),
      `tips (touch): counter-board: the tip says it, #game-live doesn't say it again (${J(r.counter)})`);
    check(r.surrender.struck && r.surrender.word === 'Take!' && r.surrender.hint === 'She struck her colours! Tap Take! to take her' && !r.surrender.live.some((t) => /strikes her colours/.test(t)),
      `tips (touch): a struck ship in reach: the tip names the "Take!" pill, and #game-live doesn't say it again (${J(r.surrender)})`);
    await ctx.close();
  });

  // ------------------------------------------------------------ pops below the top HUD row on a short phone
  await section('short', async () => {
    // At 568x320 a capture's pops (CHARGE! in the swing, CAPTURED! +145 gold) stay below the top HUD row, so the
    // new gold total can be read (UX-10). Every real frame from the swing to the end.
    const { ctx, page: sp } = await open({ width: 568, height: 320, touch: true, label: 'short', store: { 'pirates-ahoy-unlocked': '3', 'pirates-ahoy-tutorial-done': '1', 'pirates-ahoy-tips': '255' } });
    const r = await ev(sp, async () => {
      const G = window.__game;
      T.level(1);
      const e = T.spawn('privateer', 8.5, 0, 0);
      G.damage(e, 48);
      e.reload.port = e.reload.star = 99;
      G.grapple();
      T.steps(2, () => G.boarding.phase !== 'swing');
      const frames = [];
      const t0 = G.state.time;
      G.state.mode = 'playing';
      while (G.boarding.active && frames.length < 400) {
        await new Promise((res) => requestAnimationFrame(res));
        frames.push({ t: Math.round((G.state.time - t0) * 1000) / 1000, ...T.popFrame() });
      }
      G.state.mode = 'paused';
      return { captured: e.captured, frames, W: innerWidth, H: innerHeight };
    });
    const rep = popReport(r);
    check(r.captured && rep.seen.includes('CHARGE!') && rep.seen.some((t) => /^CAPTURED!/.test(t)) && rep.onTop.length === 0 && rep.offScreen.length === 0,
      `pops 568x320: a capture's pops (${rep.seen.join(' / ')}) stay below the top HUD row all the way (${rep.frames} frames${rep.onTop.length ? '; over it: ' + rep.onTop.join(', ') : ''}${rep.offScreen.length ? '; off screen: ' + rep.offScreen.join(', ') : ''})`);
    await ctx.close();
  });

  // ------------------------------------------------------------------------------------------------ layout
  await section('layout', async () => {
    // The F01 layout probe of controls.cjs, with chain shot unlocked: the act pad (touch) and the Ammo and
    // Board cells (keyboard) are on screen.
    const layoutProbe = () => {
      const R = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return b.width && b.height ? b : null; };
      const W = innerWidth, H = innerHeight;
      const inView = (b) => b.left >= -0.5 && b.top >= -0.5 && b.right <= W + 0.5 && b.bottom <= H + 0.5;
      const ov = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const out = [];
      const hud = document.querySelector('.hud-top');
      if (hud.scrollWidth > hud.clientWidth + 1) out.push(`HUD row overflows ${hud.scrollWidth}>${hud.clientWidth}`);
      for (const id of ['pause-btn', 'mute-btn']) { const b = R(document.getElementById(id)); if (!b || !inView(b)) out.push(`#${id} off screen`); }
      [...document.querySelectorAll('.hud-top > *')].map(R).filter(Boolean).forEach((b, i) => { if (!inView(b)) out.push(`HUD card ${i} off screen`); });
      const hint = R(document.getElementById('hint'));
      const banner = R(document.getElementById('banner'));
      const guns = R(document.querySelector('.guns'));
      const mm = R(document.getElementById('minimap'));
      const pads = [...document.querySelectorAll('.touch button')].map(R).filter(Boolean);
      if (!hint) out.push('hint not shown');
      else {
        if (hint.width < Math.min(200, W * 0.6)) out.push(`hint only ${Math.round(hint.width)}px wide`);
        if (hint.height > 110) out.push(`hint ${Math.round(hint.height)}px tall`);
        if (!inView(hint)) out.push('hint off screen');
        if (guns && ov(hint, guns)) out.push('hint covers the gun card');
        if (mm && ov(hint, mm)) out.push('hint covers the minimap');
        if (pads.some((b) => ov(hint, b))) out.push('hint covers a touch button');
        if (banner && ov(hint, banner)) out.push(`hint overlaps the level banner (${Math.round(ov(hint, banner))}px²)`);
      }
      if (!banner) out.push('level banner not shown');
      if (guns && !inView(guns)) out.push('gun card off screen');
      pads.forEach((b, i) => { if (!inView(b)) out.push(`touch button ${i} off screen`); if (guns && ov(b, guns)) out.push(`touch button ${i} covers the gun card`); });
      for (let i = 0; i < pads.length; i++) for (let j = i + 1; j < pads.length; j++) if (ov(pads[i], pads[j])) out.push(`touch buttons ${i}/${j} overlap`);
      const cells = [...document.querySelectorAll('.guns .gun')].map(R).filter(Boolean);
      for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) if (ov(cells[i], cells[j]) > 1) out.push(`gun cells ${i}/${j} overlap`);
      const touchUi = getComputedStyle(document.getElementById('touch')).display !== 'none';
      const act = ['touch-ammo', 'touch-board'].map((id) => R(document.getElementById(id)));
      const cellsNew = ['gun-ammo', 'gun-board'].map((id) => R(document.getElementById(id)));
      if (touchUi && act.some((b) => !b || b.height < 43.5 || b.width < 43.5)) out.push(`act pad pills missing or under 44 px (${act.map((b) => b && `${Math.round(b.width)}x${Math.round(b.height)}`)})`);
      if (!touchUi && cellsNew.some((b) => !b)) out.push('Ammo / Board cells not shown');
      return { out, touchUi };
    };
    const settle = (p) => p.evaluate(() => document.getAnimations().forEach((a) => { if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); }));
    for (const [w, h, touch] of [
      [320, 480, true], [360, 480, true], [320, 480, false], [390, 844, true], [844, 390, true], [1280, 720, false],
      [568, 320, true], [640, 360, true], [568, 320, false], [640, 360, false],
    ]) {
      const { ctx, page: lp } = await open({ width: w, height: h, touch, label: `layout ${w}x${h}`, store: { 'pirates-ahoy-unlocked': '3' } });
      await lp.evaluate(() => {
        const G = window.__game;
        G.newGame(1);
        G.state.intro = 0;
        G.enemies.forEach((e, k) => { e.x = 400 + k * 30; e.z = 400; e.speed = 0; });
        G.state.bannerTimer = 1e9;
      });
      await lp.waitForFunction(() => !document.getElementById('hint').classList.contains('hidden'), null, { timeout: 120000 }).catch(() => {});
      await settle(lp);
      const r = await lp.evaluate(layoutProbe);
      check(r.out.length === 0, `layout ${w}x${h}${touch ? ' touch' : ''} with chain shot unlocked: ${r.touchUi ? 'the act pad' : 'the Ammo and Board cells'} fit, nothing overlaps${r.out.length ? ' -> ' + r.out.join('; ') : ''}`);
      await ctx.close();
    }
    // Contrast of the new small texts (4.5:1; 3:1 for large text) in each Board state.
    const contrastProbe = (sels) => {
      const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
      const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
      const paperHex = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
      const paper = { r: parseInt(paperHex.slice(1, 3), 16), g: parseInt(paperHex.slice(3, 5), 16), b: parseInt(paperHex.slice(5, 7), 16), a: 1 };
      const bgOf = (el) => {
        for (let n = el; n && n !== document.body; n = n.parentElement) {
          const c = parse(getComputedStyle(n).backgroundColor);
          if (c.a >= 0.5) return c;
        }
        return paper;
      };
      const out = [];
      for (const sel of sels) {
        for (const el of document.querySelectorAll(sel)) {
          if (!el.getClientRects().length || !el.textContent.trim()) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          const bg = bgOf(el);
          let alpha = parse(cs.color).a;
          for (let n = el; n && n !== document.documentElement; n = n.parentElement) alpha *= Number(getComputedStyle(n).opacity);
          const c = parse(cs.color);
          const eff = { r: c.r * alpha + bg.r * (1 - alpha), g: c.g * alpha + bg.g * (1 - alpha), b: c.b * alpha + bg.b * (1 - alpha) };
          const la = L(eff);
          const lb = L(bg);
          const ratio = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
          const size = parseFloat(cs.fontSize);
          const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
          out.push({ sel, text: el.textContent.trim().slice(0, 16), ratio: Math.round(ratio * 100) / 100, need: large ? 3 : 4.5 });
        }
      }
      return out;
    };
    for (const [w, h, touch, sels] of [
      [1280, 720, false, ['.crew-chip .crew-num', '.gun.ammo .label', '#ammo-name', '.gun.board .label', '#board-tag .board-word']],
      [390, 844, true, ['.crew-chip .crew-num', '#touch-ammo .ammo-word', '#touch-board .board-word']],
    ]) {
      const { ctx, page: cp } = await open({ width: w, height: h, touch, label: `contrast ${w}x${h}`, store: { 'pirates-ahoy-unlocked': '3', 'pirates-ahoy-tutorial-done': '1', 'pirates-ahoy-tips': '255' } });
      const all = [];
      for (const [type, lat, hp] of [['privateer', 30, 80], ['privateer', 8.5, 32], ['manowar', 9.5, 32], ['privateer', 8.5, 80]]) {
        await ev(cp, async ([type, lat, hp]) => {
          const G = window.__game;
          T.level(1);
          const e = T.spawn(type, lat, 0, 0);
          G.damage(e, e.maxHp - hp);
          e.reload.port = e.reload.star = 99;
          await T.live(3);
        }, [type, lat, hp]);
        await settle(cp);
        const state = await cp.evaluate(() => document.getElementById('touch-board').dataset.state);
        for (const r of await cp.evaluate(contrastProbe, sels)) all.push({ ...r, state });
      }
      const bad = all.filter((r) => r.ratio < r.need);
      const states = [...new Set(all.map((r) => r.state))].join(', ');
      check(all.length >= sels.length * 3 && bad.length === 0, `contrast ${w}x${h}${touch ? ' touch' : ''}: the crew, ammo and board texts reach 4.5:1 in every Board state (${states}; ${all.length} texts, lowest ${Math.min(...all.map((r) => r.ratio))})${bad.length ? ' -> ' + J(bad) : ''}`);
      await ctx.close();
    }
  });

  // ------------------------------------------------------------------------------------------------ act II
  await section('act2', async () => {
    const { ctx, page: ap } = await open({ label: 'act2', query: '?quality=low&act2=1' });
    const before = errors.length;
    const levels = [];
    for (const n of [4, 5, 6]) {
      levels.push(await ev(ap, async (n) => {
        const G = window.__game;
        G.state.tutorialDone = true;
        G.state.unlocked = 6;
        G.newGame(n);
        const def = G.LEVELS[n - 1];
        const out = { n, name: def.env.meta.name, level: G.state.level, wave0: G.enemies.map((e) => e.typeName).join(), want: def.waves[0].join(), ids: (G.mechanics.state.ids || []).join(), objective: G.mechanics.objective || '' };
        G.state.intro = 0;
        T.steps(4);
        out.mode = G.state.mode;
        out.time = Math.round(G.state.time);
        G.state.mode = 'paused';
        await T.redraw();
        out.calls = G.renderInfo.calls;
        return out;
      }, n));
    }
    const count = await ap.evaluate(() => window.__game.LEVELS.length);
    check(count === 6, `Act II: ?act2=1 adds levels 4-6 (${count} levels)`);
    const want = { 4: ['Doubloon Bay', 'convoy'], 5: ['Frostbite Straits', 'floes'], 6: ['The Maelstrom', 'current'] };
    for (const l of levels) {
      check(l.name === want[l.n][0] && l.level === l.n && l.wave0 === l.want && l.ids === want[l.n][1] && l.mode === 'playing' && l.time === 4 && l.calls > 0 && (l.n !== 4 || /^Galleons:/.test(l.objective)),
        `Act II: level ${l.n} (${l.name}) starts with ?act2=1 and plays (${J(l)})`);
    }
    // A treasure galleon grappled a few units short of her escape gate (BRD-2): you beside her, both heading for the
    // gate, so the glued pair drifts into it during the brawl. She is held by the boarding: no escape from under you.
    const galleon = await ev(ap, () => {
      const G = window.__game;
      const out = [];
      for (const [gap, speed, sail, hers] of [[3, 3, 0, 3], [5, 3, 0, 3], [6, 7, 2, 4.5]]) {
        const p = T.level(4);
        // her gate: the one farthest from you when she comes
        const gate = G.mechanics.minimap().filter((m) => m.kind === 'gate').sort((a, b) => Math.hypot(b.x - p.x, b.z - p.z) - Math.hypot(a.x - p.x, a.z - p.z))[0];
        const e = G.spawn('galleon', p.x + 30, p.z, 0);
        const h = Math.atan2(gate.x - p.x, gate.z - p.z);
        const dist = gate.r + gap;
        const px = gate.x - Math.sin(h) * dist;
        const pz = gate.z - Math.cos(h) * dist;
        G.place(p, px + Math.cos(h) * 4.25, pz - Math.sin(h) * 4.25, h);
        p.speed = speed;
        G.state.sail = sail;
        G.place(e, px - Math.cos(h) * 4.25, pz + Math.sin(h) * 4.25, h);
        e.rise = 0;
        e.speed = hers;
        G.damage(e, e.hp * 0.6);
        G.combat.setCrew(e, 6);
        const ends = [];
        const off = G.boarding.module.onEnd((ev) => ends.push(`${ev.reason}@${ev.phase}`));
        const label = G.boarding.pick().label;
        const g = G.grapple().ok;
        let near = Infinity;
        T.steps(7, () => {
          near = Math.min(near, Math.hypot(e.x - gate.x, e.z - gate.z));
          return G.boarding.active;
        });
        off();
        out.push({ gap, speed, label, g, ends: ends.join(), escaped: !!e.escaped, captured: !!e.captured, near: Math.round(near * 10) / 10, gateR: gate.r });
      }
      return out;
    });
    for (const r of galleon) {
      check(r.g && r.label === 'capture' && r.ends === 'done@result' && r.captured && !r.escaped && r.near < r.gateR,
        `Act II: a galleon grappled ${r.gap} u outside her gate (you at ${r.speed} u/s) is carried into it (${r.near} u from its centre, radius ${r.gateR}) without escaping: the boarding ends with her captured (${J(r)})`);
    }
    check(errors.length === before, `Act II: no page errors on levels 4-6${errors.length > before ? ': ' + errors.slice(before).join(' | ') : ''}`);
    await ctx.close();
  });

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 8).join(' | ') : ''}`);
  await browser.close();
  server.close();
  console.log(`\nbattle.cjs: ${passes} passed, ${failures} failed`);
  console.log(failures ? `${failures} check(s) failed` : 'All battle checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
