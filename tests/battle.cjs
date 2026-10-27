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
// - the Stage 4 review's battle fixes (review4): no camera shake under reduced motion, the boarding sail fade
//   keeps depth (no slate sails), the Phantom's boss bar leads with BOARD HER!, no three.js warnings from the bake
// - a phone held upright (phone): the target of a broadside framed with her tag, also while you turn hard, with
//   pirates on both beams (no swinging to and fro), past an island, into a boarding, and as cuts under reduced
//   motion; a Fire tap while loading queued (fired along the beam with nobody in aim, its ring shown after a
//   "Loading…" cue) or answered with "Loading…"; what each ammo is for (hints, tips), chain's badge and SLOWED!,
//   grape's lost pips blinking red and dark, round shot's bigger hull pops; a desktop window and a phone on its
//   side keep their chase view, even in a running fight
// - the Kraken Seas (SPEC3 §13.2, with ?kraken=1): special shot, the ammo tray, statuses, armour, hot and stinky
//   boarding, the rudder, the thumb slide and the wheel, the records, the rudder row, the new sounds, and the live
//   game unchanged without ?kraken=1 (the kraken-* sections)
// The simulation is frozen (the real-time loop is paused) and driven with G.step(1/120) like smoke.cjs;
// crits are pinned with G.combat.seed() / forceCrit(). Run with `npm test` or `npm run test:battle`
// (BATTLE_ONLY=damage,ammo,review4 runs some sections; BATTLE_ROOT serves another copy of the game).
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
    // nearest pirate in range, and on a narrow screen the battle camera eases in to frame her (its S-curve
    // starts so gently that a frame or two can look still: wait while it is part way). Frozen again
    // afterwards; returns the number of frames.
    async settle(hold, max = 400) {
      const d = G.camera.getWorldDirection(G.camera.position.clone());
      const was = d.clone();
      let still = 0;
      let n = 0;
      const easing = () => !!G.framing && G.framing.w > 0 && G.framing.w < 1;
      G.state.mode = 'playing';
      while (n < max && (still < 3 || easing())) {
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
    // Every real frame from now on (the loop running: G.state.mode = 'playing'), after the game's own update: game
    // time, the battle camera's framing (weight, which of `ships` it frames: -1 none, -2 another; its pose), the
    // camera (position, the yaw of its view), your heading and place, and on screen (CSS px) your hull's box and
    // each of `ships`' hull and tag boxes. `each` runs first every frame (hold ships, keep their guns quiet).
    // T.stop() ends the record and returns the frames.
    record(ships = [], each = null) {
      const V = G.camera.position.constructor;
      const v = new V();
      const d = new V();
      const box = (s) => {
        const L = s.type.len / 2;
        const B = s.type.wid / 2;
        const b = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity, behind: false };
        for (const a of [-L, L]) {
          for (const c of [-B, B]) {
            for (const y of [0, (s.mesh.userData.deckY ?? 1.4) + 0.4]) {
              v.set(s.x + fwdX(s.h) * a + rightX(s.h) * c, s.mesh.position.y + y, s.z + fwdZ(s.h) * a + rightZ(s.h) * c).project(G.camera);
              if (v.z > 1) b.behind = true;
              const x = (v.x * 0.5 + 0.5) * innerWidth;
              const yy = (-v.y * 0.5 + 0.5) * innerHeight;
              b.l = Math.min(b.l, x);
              b.r = Math.max(b.r, x);
              b.t = Math.min(b.t, yy);
              b.b = Math.max(b.b, yy);
            }
          }
        }
        return b;
      };
      const gen = (T.recGen = (T.recGen || 0) + 1);
      T.recFrames = [];
      const loop = () => {
        if (T.recGen !== gen) return;
        if (each) each();
        const f = G.framing;
        G.camera.getWorldDirection(d);
        T.recFrames.push({
          t: G.state.time,
          w: f.w,
          focus: !f.focus ? -1 : ships.includes(f.focus) ? ships.indexOf(f.focus) : -2,
          pose: { ...f.pose },
          cam: G.camera.position.toArray(),
          yaw: Math.atan2(d.x, d.z),
          h: G.player.h,
          px: G.player.x,
          pz: G.player.z,
          mine: box(G.player),
          hulls: ships.map(box),
          tags: ships.map((s) => G.tagRect(s)),
          boarding: G.boarding.active,
        });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },
    stop() {
      T.recGen = (T.recGen || 0) + 1;
      return T.recFrames || [];
    },
    // How much of a box is on screen, 0..1 (0 when it is behind the camera).
    seen(b) {
      if (!b || b.behind) return 0;
      const W = innerWidth;
      const H = innerHeight;
      return (Math.max(0, Math.min(b.r, W) - Math.max(b.l, 0)) / Math.max(1e-6, b.r - b.l)) * (Math.max(0, Math.min(b.b, H) - Math.max(b.t, 0)) / Math.max(1e-6, b.b - b.t));
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
        // the HUD pieces pops keep off (pops.js): the minimap and the level / "X sunk!" banner, while shown
        furniture: Object.fromEntries(['minimap', 'banner'].map((id) => {
          const el = document.getElementById(id);
          const on = el && !el.classList.contains('hidden') && el.getClientRects().length && Number(getComputedStyle(el).opacity) > 0.3;
          return [id, on ? R(el.getBoundingClientRect()) : null];
        })),
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
  const out = { frames: r.frames.length, seen: [], popPop: [], onMark: [], onTop: [], offScreen: [], onMinimap: [], onBanner: [], banner: 0 };
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
    const fur = f.furniture || {};
    if (fur.banner) out.banner++;
    for (const p of ps) {
      // (the minimap is round: a pop over a corner of its box is clear of it)
      if (fur.minimap) {
        const m = fur.minimap;
        const cx = (m.l + m.r) / 2;
        const cy = (m.t + m.b) / 2;
        const rad = (m.r - m.l) / 2;
        const nx = Math.max(p.whole.l, Math.min(cx, p.whole.r));
        const ny = Math.max(p.whole.t, Math.min(cy, p.whole.b));
        const into = rad - Math.hypot(nx - cx, ny - cy);
        if (into > 2) out.onMinimap.push(`${f.t}s "${p.text}" ${Math.round(into)}px into it`);
      }
      if (fur.banner && ov(p.whole, fur.banner)) out.onBanner.push(`${f.t}s "${p.text}" ${ov(p.whole, fur.banner)}px²`);
    }
    for (const p of ps) {
      const card = f.cards.find((c) => ov(p.whole, c));
      if (card) out.onTop.push(`${f.t}s "${p.text}" top ${Math.round(p.whole.t)} over a card down to ${Math.round(card.b)}`);
      if (p.whole.l < -1 || p.whole.r > r.W + 1 || p.whole.t < -1 || p.whole.b > r.H + 1) out.offScreen.push(`${f.t}s "${p.text}"`);
    }
  }
  out.seen = [...seen];
  for (const k of ['popPop', 'onMark', 'onTop', 'offScreen', 'onMinimap', 'onBanner']) if (out[k].length > 6) out[k] = [...out[k].slice(0, 6), `(+${out[k].length - 6} more)`];
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
  async function open({ width = 1280, height = 720, touch = false, query = '?quality=low', store = null, label = 'page', reducedMotion = 'no-preference' } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion });
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

    // Pops on a portrait phone, the camera settled on each ship: a privateer beam-on at 18 u (the AI holds 18-26 u)
    // is framed on screen by the battle camera (phonefix; she used to lie off the right edge, her pop at that edge,
    // UX-8), and the volley's damage pop shows; a point-blank stern rake with a crit: its pops (STERN RAKE ×2!,
    // CRIT! MAST DOWN!, POINT BLANK!, the damage) keep clear of each other and of the SUNK! mark and its stickers
    // (UX-1) all their lives.
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
        settle += await T.settle(hold); // (each ship: the battle camera frames her)
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
      check(phone.abeam.fired && /^HIT ×3/.test(phone.abeam.mark) && Math.abs(phone.abeam.ndcX) < 0.9 && r.seen.some((t) => /^\d+$/.test(t)) && r.offScreen.length === 0,
        `pops 390x844: a privateer abeam at 18 u is on screen, framed by the battle camera (ndc x ${phone.abeam.ndcX}), and the volley's damage pop shows (seen ${J(r.seen)}${r.offScreen.length ? '; off screen: ' + r.offScreen.join(', ') : ''})`);
      const k = popReport(phone.rake);
      check(phone.rake.fired && /^SUNK!/.test(phone.rake.mark) && k.seen.length >= 3 && k.popPop.length === 0 && k.onMark.length === 0 && k.offScreen.length === 0,
        `pops 390x844: a point-blank stern rake with a crit: its ${k.seen.length} pops (${k.seen.join(' / ')}) never cover each other or the "${phone.rake.mark}" mark (${k.frames} frames${k.popPop.length ? '; pop over pop: ' + k.popPop.join(', ') : ''}${k.onMark.length ? '; over the mark: ' + k.onMark.join(', ') : ''})`);
      // ... nor the minimap or the "sunk!" banner (pops.js keeps off the HUD's own pieces, 3E)
      check(k.seen.length >= 3 && k.onMinimap.length === 0 && k.onBanner.length === 0,
        `pops 390x844: the stern rake's pops keep off the minimap and the "sunk!" banner (shown in ${k.banner} of ${k.frames} frames)${k.onMinimap.length ? '; over the minimap: ' + k.onMinimap.join(', ') : ''}${k.onBanner.length ? '; over the banner: ' + k.onBanner.join(', ') : ''}`);
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

  // ------------------------------------------------------------------------------------------------ review4
  // The Stage 4 review's battle fixes (each of these checks failed on ebad6f2): A11Y-1 reduced motion never shakes
  // the camera, LOOK-1 the boarding view's see-through sails keep writing depth, LOOK-3 the spectral Phantom's boss
  // bar keeps BOARD HER! in view on a portrait phone, POL-1 baking enemy ships logs no three.js warnings.
  await section('review4', async () => {
    // A11Y-1: a hull hit, and the Maelstrom's eye grinding the hull (5 hp/s), with reduced motion: no shake at all.
    // (The same on a no-preference page does shake: the check isn't vacuous.)
    const shake = (pg) => ev(pg, () => {
      const G = window.__game;
      const p = T.level(1);
      G.state.shake = 0;
      G.damage(p, 3, p.x + 3, p.z, 'cutter');
      const hit = G.state.shake;
      T.level(6);
      const pl = G.player;
      pl.hp = pl.maxHp = 9999;
      const mm = G.mechanics.minimap();
      const eye = mm.find((m) => m.kind === 'eye') || mm.find((m) => m.kind === 'vortex');
      const hurt0 = G.state.hurtBy.maelstrom || 0;
      G.state.shake = 0;
      let most = 0;
      T.steps(2, () => {
        G.place(pl, eye.x, eye.z, pl.h);
        pl.speed = 0;
        most = Math.max(most, G.state.shake);
      });
      return { hit, eye: !!eye, eyeHurt: (G.state.hurtBy.maelstrom || 0) - hurt0, eyeShake: most, reduce: matchMedia('(prefers-reduced-motion: reduce)').matches };
    });
    const rm = await open({ label: 'review4-reduce', reducedMotion: 'reduce' });
    const calm = await shake(rm.page);
    await rm.ctx.close();
    const np = await open({ label: 'review4-motion' });
    const usual = await shake(np.page);
    await np.ctx.close();
    check(calm.reduce && calm.eye && calm.eyeHurt > 0 && calm.hit === 0 && calm.eyeShake === 0 && usual.hit > 0 && usual.eyeShake > 0,
      `A11Y-1: with reduced motion a hull hit and the Maelstrom's eye never shake the camera (shake ${calm.hit} / ${calm.eyeShake}; without it ${usual.hit} / ${usual.eyeShake}) (${J({ calm, usual })})`);

    // LOOK-1: in the boarding view the boarded ship's sails turn see-through copies that still write depth (without
    // it the ink outline shell behind each sail shows through: slate-black sails).
    const fp = await open({ label: 'review4-fade' });
    const fade = await ev(fp.page, async () => {
      const G = window.__game;
      T.level(1);
      const e = T.spawn('cutter', 8.5);
      G.damage(e, e.maxHp * 0.6);
      G.combat.setCrew(e, 3);
      const g = G.grapple();
      T.steps(8, () => G.boarding.active && G.boarding.phase !== 'brawl');
      const phase = G.boarding.phase;
      await T.live(3); // (the fade is drawn by the boarding view's render, frame by frame)
      const mats = [];
      for (const s of [G.player, e]) {
        for (const m of (s.mesh.userData.sails || []).flatMap((q) => (Array.isArray(q.material) ? q.material : [q.material]))) if (m && m.transparent && m.opacity < 1) mats.push({ ship: s.kind, opacity: +m.opacity.toFixed(2), depthWrite: m.depthWrite });
      }
      G.boarding.resolveNow();
      return { grapple: g.ok, phase, faded: mats.length, depthWrite: [...new Set(mats.map((m) => m.depthWrite))], opacity: [...new Set(mats.map((m) => m.opacity))] };
    });
    await fp.ctx.close();
    check(fade.grapple && fade.faded > 0 && fade.depthWrite.length === 1 && fade.depthWrite[0] === true,
      `LOOK-1: the boarding view's see-through sails (${fade.faded} materials) keep writing depth, so their ink outline stays hidden (${J(fade)})`);

    // LOOK-3: the spectral Phantom on a 390x844 phone: the boss bar's narrow name line leads with BOARD HER!, which is
    // all in view (the ellipsis cuts her name instead).
    const ph = await open({ width: 390, height: 844, touch: true, label: 'review4-phone' });
    const bar = await ev(ph.page, async () => {
      const G = window.__game;
      T.level(6);
      const e = T.spawn('phantom', 14, 10);
      G.damage(e, 9999);
      T.steps(0.2);
      G.state.mode = 'paused';
      await T.redraw();
      const el = document.getElementById('boss-name');
      const text = el.textContent;
      const at = text.indexOf('BOARD HER!');
      let end = null;
      if (at >= 0) {
        const tn = [...el.childNodes].find((c) => c.nodeType === 3);
        const rg = document.createRange();
        rg.setStart(tn, at);
        rg.setEnd(tn, at + 'BOARD HER!'.length);
        end = Math.round(rg.getBoundingClientRect().right);
      }
      const r = el.getBoundingClientRect();
      return { spectral: !!e.spectral, text, at, end, edge: Math.round(r.left + el.clientWidth), cut: el.scrollWidth > el.clientWidth };
    });
    await ph.ctx.close();
    check(bar.spectral && bar.at === 0 && bar.end !== null && bar.end <= bar.edge, `LOOK-3: at 390x844 the spectral Phantom's boss bar reads "${bar.text}" with BOARD HER! first and in view (ends at ${bar.end}, the line at ${bar.edge}${bar.cut ? ', her name cut' : ''})`);

    // POL-1: a level start bakes the enemy ships' colours; three.js logs no warning about it (it did, for an option
    // MeshToonMaterial doesn't have: flatShading).
    const wp = await open({ label: 'review4-warn' });
    const warns = [];
    wp.page.on('console', (m) => m.type() === 'warning' && warns.push(m.text()));
    const baked = await ev(wp.page, async () => {
      const G = window.__game;
      for (const n of [1, 4]) T.level(n);
      await T.redraw();
      let n = 0;
      G.scene.traverse((o) => { if (o.material && o.material.name === 'ship-baked') n++; });
      return n;
    });
    await frames(wp.page, 2);
    await wp.page.waitForTimeout(300); // (console messages reach the test a moment later)
    await wp.ctx.close();
    const three = warns.filter((w) => /THREE|flatShading/.test(w));
    check(baked > 0 && three.length === 0, `POL-1: baking the enemy ships (${baked} baked meshes) logs no three.js warnings${three.length ? ': ' + J(three.slice(0, 3)) : ''}`);
  });

  // ------------------------------------------------ a phone held upright: ammo you can see working (phonefix)
  // A player's report from a 390x844 portrait phone: "what does round, chain and grape do? in game it wasn't doing
  // anything". The target of a broadside, 15 paces off the beam, sat off the side of the screen (her, her tag and
  // the effect on her); a Fire tap while that side was loading (as right after a tap on Ammo) did nothing; nothing
  // said what each ammo is for, and chain's slow and grape's lost sailors didn't show on her.
  await section('phone', async () => {
    // (Every tip seen but the two new-ammo ones, so only those show.)
    const { ctx, page: pp } = await open({ width: 390, height: 844, touch: true, label: 'phone', store: { 'pirates-ahoy-unlocked': '3', 'pirates-ahoy-tutorial-done': '1', 'pirates-ahoy-tips': String(255 & ~6) } });
    // The first-time tips and banners say what the new ammo does.
    const fresh = await ev(pp, async () => {
      const G = window.__game;
      const out = {};
      for (const id of ['chain', 'grape']) {
        T.level(1);
        T.steps(1 / 120);
        G.state.mode = 'paused';
        await T.redraw();
        out[id] = { hint: T.shown('hint') ? T.text('hint') : '', banner: T.text('banner') };
        G.state.mode = 'playing';
      }
      return out;
    });
    check(fresh.chain.hint === 'New: chain shot! It slows ships down. Tap Ammo' && /^New ammo: Chain shot!It slows ships down/.test(fresh.chain.banner) &&
      fresh.grape.hint === 'New: grape shot! It knocks out their crew. Tap Ammo' && /^New ammo: Grape shot!It knocks out their crew/.test(fresh.grape.banner),
      `phone: the first-time tips and banners say what the new ammo does (${J(fresh)})`);

    // Each tap on the Ammo pill says in the hint bubble what that shot is for, with its icon; the pill keeps its icon
    // and its name says it too.
    const hints = await ev(pp, async () => {
      const G = window.__game;
      T.level(1);
      const pill = document.getElementById('touch-ammo');
      const out = [];
      for (let i = 0; i < 3; i++) {
        pill.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 3, pointerType: 'touch', isPrimary: true }));
        G.state.mode = 'paused';
        await T.redraw();
        const h = document.getElementById('hint');
        out.push({ ammo: G.combat.ammo, hint: T.shown('hint') ? T.text('hint') : '', icon: !!h.querySelector('.hint-ammo .ammo-ico svg'), pillIcon: !!pill.querySelector('.ammo-ico svg'), aria: pill.getAttribute('aria-label') });
        G.state.mode = 'playing';
      }
      return out;
    });
    const wantHints = { chain: 'Chain shot: slows her down', grape: 'Grape shot: knocks out her crew', round: 'Round shot: smashes her hull' };
    check(hints.map((h) => h.ammo).join() === 'chain,grape,round' && hints.every((h) => h.hint === wantHints[h.ammo] && h.icon && h.pillIcon && h.aria.includes(wantHints[h.ammo].split(': ')[1])),
      `phone: each tap on Ammo says what the shot does, with its icon ("${hints.map((h) => h.hint).join('" / "')}"; ${J(hints.map((h) => h.aria))})`);

    // The target of a broadside is framed: a privateer 15 paces off the starboard beam, a real tap on Fire ▶. Within
    // 1.5 s of play (from the shot) her hull and her name tag are wholly on screen and clear of the HUD (top cards,
    // minimap, pads, gun card), and stay so while the volley's pops play; the camera eases there (no jump cut).
    await ev(pp, () => {
      const G = window.__game;
      const p = T.level(1);
      const e = T.spawn('privateer', 15, 0, 0);
      e.reload.port = e.reload.star = 99;
      p.reload.port = p.reload.star = 0;
      G.state.bannerTimer = 0.001; // (the level banner goes)
      const hold = T.pinner(p, e);
      hold();
      const V = G.camera.position.constructor;
      const R = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && !el.classList.contains('hidden') ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null;
      };
      const hud = () => [...document.querySelectorAll('#hud .hud-top > *'), document.getElementById('minimap'), ...document.querySelectorAll('#touch .pad'), document.querySelector('#hud .card.guns')].map(R).filter(Boolean);
      // her hull on screen: the corners of her hull (waterline and deck) projected
      const hullBox = () => {
        const L = e.type.len / 2;
        const B = e.type.wid / 2;
        const box = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
        for (const a of [-L, L]) for (const c of [-B, B]) for (const y of [0, (e.mesh.userData.deckY ?? 1.4) + 0.4]) {
          const v = new V(e.x + Math.sin(e.h) * a - Math.cos(e.h) * c, e.mesh.position.y + y, e.z + Math.cos(e.h) * a + Math.sin(e.h) * c).project(G.camera);
          const x = (v.x * 0.5 + 0.5) * innerWidth;
          const yy = (-v.y * 0.5 + 0.5) * innerHeight;
          box.l = Math.min(box.l, x);
          box.r = Math.max(box.r, x);
          box.t = Math.min(box.t, yy);
          box.b = Math.max(box.b, yy);
        }
        return box;
      };
      window.__e = e;
      window.__hold = true;
      window.__frames = [];
      const loop = () => {
        if (!window.__hold) return;
        hold();
        window.__frames.push({ t: G.state.time, cam: G.camera.position.toArray(), w: (G.framing ? G.framing.w : 0), focus: (G.framing ? G.framing.focus : null) === e, hull: hullBox(), tag: (G.tagRect ? G.tagRect(e) : null), hud: hud() });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await pp.evaluate(() => { window.__game.state.mode = 'playing'; });
    await pp.tap('[data-tap="fireStar"]');
    const fired = await pp.evaluate(() => {
      const p = window.__game.player;
      window.__tf = window.__game.state.time - (p.reloadMax.star - p.reload.star); // when the guns went off
      return p.reload.star > 0;
    });
    await pp.waitForFunction(() => window.__game.state.time >= window.__tf + 2.2, null, { timeout: 120000, polling: 50 });
    const view = await pp.evaluate(() => {
      const G = window.__game;
      window.__hold = false;
      G.state.mode = 'paused';
      const W = innerWidth;
      const H = innerHeight;
      const ov = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
      const clear = (box, hud) => box && box.l >= 0 && box.t >= 0 && box.r <= W && box.b <= H && hud.every((h) => ov(box, h) < 1);
      const fs = window.__frames.filter((f) => f.t >= window.__tf);
      const at = fs.find((f) => f.t >= window.__tf + 1.5);
      const after = fs.filter((f) => f.t >= window.__tf + 1.5);
      let speed = 0;
      for (let i = 1; i < window.__frames.length; i++) {
        const a = window.__frames[i - 1];
        const b = window.__frames[i];
        const dt = b.t - a.t;
        if (dt > 1e-4) speed = Math.max(speed, Math.hypot(b.cam[0] - a.cam[0], b.cam[1] - a.cam[1], b.cam[2] - a.cam[2]) / dt);
      }
      const r = (b) => (b ? Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v)])) : null);
      return {
        frames: fs.length,
        t: at ? Math.round((at.t - window.__tf) * 100) / 100 : null,
        hull: at && r(at.hull),
        tag: at && r(at.tag),
        w: at && Math.round(at.w * 100) / 100,
        focus: at && at.focus,
        ok: !!at && clear(at.hull, at.hud) && clear(at.tag, at.hud),
        stays: after.length > 0 && after.every((f) => clear(f.hull, f.hud) && clear(f.tag, f.hud)),
        speed: Math.round(speed * 10) / 10,
        hp: Math.round(window.__e.hp),
      };
    });
    check(fired && view.ok && view.stays && view.focus && view.hp < 80,
      `phone 390x844: a privateer 15 paces off the beam that you fire at (a tap on Fire ▶) is wholly on screen with her tag, clear of the HUD, ${view.t} s after the shot and after (hull ${J(view.hull)}, tag ${J(view.tag)}, framing ${view.w}; ${view.frames} frames)`);
    check(view.speed > 0 && view.speed < 45, `phone 390x844: the camera eases to that view, no jump cut (fastest ${view.speed} u/s)`);
    await snap(pp, 'phone-framed.png');
    // ... and eases back to the chase view once nobody is in reach.
    const back = await ev(pp, async () => {
      const G = window.__game;
      G.capture.escape(window.__e);
      G.state.mode = 'playing';
      const t0 = G.state.time;
      while (G.state.time - t0 < 3.2 && (G.framing ? G.framing.w : 0) > 0) await new Promise((res) => requestAnimationFrame(res));
      return { w: (G.framing ? G.framing.w : 0), focus: (G.framing ? G.framing.focus : null), t: Math.round((G.state.time - t0) * 100) / 100 };
    });
    check(back.w === 0 && back.focus === null, `phone 390x844: with nobody in reach the camera goes back to the chase view (${J(back)})`);

    // While you turn hard with her framed (the skeptic's A2): a privateer 16 paces off the starboard beam sailing a
    // straight course beside you; a real tap on Fire ▶, then hard to starboard (D held) for 2.7 s and hard to port
    // (A held) for 3 s. Your ship stays at least 80 % on screen in every frame and about its size (0.5-1.6 times
    // what the chase view shows: the zoom doesn't pump in and out), and while she is framed 1-2 s after the shot
    // her hull and her tag are wholly on screen.
    const chaseH = await ev(pp, async () => {
      const G = window.__game;
      const p = T.level(1);
      G.state.bannerTimer = 0.001;
      const hold = T.pinner(p);
      await T.settle(hold);
      T.record([], hold);
      G.state.mode = 'playing';
      for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
      G.state.mode = 'paused';
      const fs = T.stop();
      return fs.reduce((a, f) => a + (f.mine.b - f.mine.t), 0) / Math.max(1, fs.length); // your hull's height, chase view
    });
    await ev(pp, () => {
      const G = window.__game;
      const p = G.player;
      const e = T.spawn('privateer', 16, 0, 0);
      const h = e.h;
      p.reload.port = p.reload.star = 0;
      window.__turnE = e;
      T.record([e], () => {
        p.speed = 8;
        e.speed = 8;
        e.h = h;
        e.reload.port = e.reload.star = 99;
      });
    });
    await pp.evaluate(() => { window.__game.state.mode = 'playing'; }); // (ev freezes the loop again: run it)
    await pp.tap('[data-tap="fireStar"]');
    const tTurn = await pp.evaluate(() => window.__game.state.time);
    const afterTurn = (dt) => pp.waitForFunction((t) => window.__game.state.time >= t, tTurn + dt, { timeout: 120000, polling: 20 });
    await afterTurn(0.3);
    await pp.keyboard.down('d');
    await afterTurn(3.0);
    await pp.keyboard.up('d');
    await pp.keyboard.down('a');
    await afterTurn(6.0);
    await pp.keyboard.up('a');
    const turn = await pp.evaluate(({ t0, chaseH }) => {
      const G = window.__game;
      G.state.mode = 'paused';
      const fs = T.stop();
      const r2 = (x) => Math.round(x * 100) / 100;
      const zoom = fs.map((f) => (f.mine.b - f.mine.t) / chaseH);
      const her = fs.filter((f) => f.t >= t0 + 1 && f.t <= t0 + 2 && f.w >= 0.999 && f.focus === 0);
      const herOk = her.filter((f) => T.seen(f.hulls[0]) >= 0.999 && f.tags[0] && T.seen(f.tags[0]) >= 0.999);
      let turned = 0;
      for (let i = 1; i < fs.length; i++) turned += Math.abs(T.wrap(fs[i].h - fs[i - 1].h));
      G.capture.escape(window.__turnE);
      return { frames: fs.length, mine: r2(Math.min(...fs.map((f) => T.seen(f.mine)))), zoom: [r2(Math.min(...zoom)), r2(Math.max(...zoom))], her: her.length, herOk: herOk.length, turned: r2(turned), chaseH: Math.round(chaseH) };
    }, { t0: tTurn, chaseH });
    check(turn.frames >= 30 && turn.turned > 2 && turn.mine >= 0.8 && turn.zoom[0] >= 0.5 && turn.zoom[1] <= 1.6 && turn.her >= 3 && turn.herOk === turn.her,
      `phone 390x844, turning hard with her framed (Fire ▶, then D 2.7 s and A 3 s): your ship stays at least 80 % on screen (${turn.mine}) at ${turn.zoom.join('-')} x its chase-view size, and her hull and tag are wholly on screen while she is framed 1-2 s after the shot (${turn.herOk} of ${turn.her} frames) (${J(turn)})`);

    // Targets on both beams (A5): pirates 15 paces off each beam, held; real taps on Fire ▶, ◀ Fire and Fire ▶ 2 s
    // apart. The view doesn't swing to and fro between them (once the framing is in, the view turns less than
    // 0.6 rad in all about your ship), and 1.5 s after each shot the ship it was fired at is wholly on screen.
    const twoBeams = async (page) => {
      await ev(page, () => {
        const G = window.__game;
        const p = T.level(1);
        G.state.bannerTimer = 0.001;
        const a = T.spawn('privateer', 15, 0, 0);
        const b = T.spawn('privateer', -15, 0, 0);
        a.maxHp = a.hp = b.maxHp = b.hp = 999;
        p.reload.port = p.reload.star = 0;
        window.__two = [a, b];
        T.record([a, b], T.pinner(p, a, b));
      });
      await page.evaluate(() => { window.__game.state.mode = 'playing'; });
      const shots = [];
      for (const [sel, idx] of [['fireStar', 0], ['firePort', 1], ['fireStar', 0]]) {
        await page.tap(`[data-tap="${sel}"]`);
        const t = await page.evaluate(() => window.__game.state.time);
        shots.push({ t, idx });
        await page.waitForFunction((tt) => window.__game.state.time >= tt, t + 2, { timeout: 120000, polling: 20 });
      }
      return page.evaluate((shots) => {
        const G = window.__game;
        G.state.mode = 'paused';
        const fs = T.stop();
        // how far the view turns about your (still) ship once the framing is first fully in
        let travel = 0;
        const in0 = fs.findIndex((f) => f.w >= 0.999);
        for (let i = Math.max(1, in0 + 1); in0 >= 0 && i < fs.length; i++) travel += Math.abs(T.wrap(fs[i].yaw - fs[i].h - (fs[i - 1].yaw - fs[i - 1].h)));
        const seen = shots.map((s) => {
          const f = fs.find((x) => x.t >= s.t + 1.5);
          return f ? Math.round(T.seen(f.hulls[s.idx]) * 100) / 100 : null;
        });
        // reduced motion: the weight is 0 or 1, and the view moves (relative to your ship) only in cuts
        const weights = [...new Set(fs.map((f) => Math.round(f.w * 1000) / 1000))];
        const cuts = [];
        for (let i = 1; i < fs.length; i++) {
          const a = fs[i - 1];
          const b = fs[i];
          const moved = b.w > 0 && Object.keys(b.pose).some((k) => Math.abs(b.pose[k] - a.pose[k]) > 1e-9);
          if (b.w !== a.w || moved) cuts.push(b.t);
        }
        const gaps = cuts.slice(1).map((t, k) => Math.round((t - cuts[k]) * 100) / 100);
        for (const s of window.__two) G.capture.escape(s);
        return { frames: fs.length, framed: fs.filter((f) => f.w >= 0.999).length, travel: Math.round(travel * 100) / 100, seen, weights: weights.slice(0, 8), cuts: cuts.length, gaps };
      }, shots);
    };
    const two = await twoBeams(pp);
    check(two.framed > 10 && two.travel < 0.6 && two.seen.every((x) => x === 1),
      `phone 390x844, pirates on both beams fired at in turn: the view doesn't swing between them (its turn changes ${two.travel} rad in all) and each ship fired at is on screen 1.5 s after the shot (${J(two.seen)}) (${J(two)})`);

    // Boarding from the framed view (A6): a privateer 11 paces off the starboard beam, framed after a real tap on
    // Fire ▶, then a tap on Board. Close by the framing hardly turns, so the hand-over to the boarding view swings
    // about as far as from the chase view: at most 2.4 rad in its first 1.2 s and never faster than 5 rad/s.
    await ev(pp, () => {
      const G = window.__game;
      const p = T.level(1);
      G.state.bannerTimer = 0.001;
      const e = T.spawn('privateer', 11, 0, 0);
      G.combat.setCrew('player', 12);
      p.reload.port = p.reload.star = 0;
      window.__boardE = e;
      const hold = T.pinner(p, e);
      T.record([e], () => {
        if (!G.boarding.active) hold();
      });
    });
    await pp.evaluate(() => { window.__game.state.mode = 'playing'; });
    await pp.tap('[data-tap="fireStar"]');
    const tFired = await pp.evaluate(() => window.__game.state.time);
    await pp.waitForFunction((t) => window.__game.state.time >= t, tFired + 1.4, { timeout: 120000, polling: 20 });
    await pp.tap('#touch-board');
    await pp.waitForFunction(() => window.__game.boarding.active, null, { timeout: 60000, polling: 20 });
    const tBoard = await pp.evaluate(() => window.__game.state.time);
    await pp.waitForFunction((t) => window.__game.state.time >= t, tBoard + 1.3, { timeout: 120000, polling: 20 });
    const hand = await pp.evaluate(() => {
      const G = window.__game;
      const fs = T.stop();
      G.state.mode = 'paused';
      const i0 = fs.findIndex((f) => f.boarding);
      let sweep = 0;
      let peak = 0;
      for (let i = Math.max(1, i0); i0 >= 0 && i < fs.length && fs[i].t <= fs[i0].t + 1.2; i++) {
        const dt = fs[i].t - fs[i - 1].t;
        if (dt < 1e-3) continue;
        const d = Math.abs(T.wrap(fs[i].yaw - fs[i - 1].yaw));
        sweep += d;
        peak = Math.max(peak, d / dt);
      }
      const framedAt = i0 > 0 ? fs[i0 - 1].w : null;
      G.boarding.cancel('test');
      G.capture.escape(window.__boardE);
      return { framedAt: framedAt === null ? null : Math.round(framedAt * 100) / 100, sweep: Math.round(sweep * 100) / 100, peak: Math.round(peak * 100) / 100 };
    });
    check(hand.framedAt === 1 && hand.sweep <= 2.4 && hand.peak <= 5,
      `phone 390x844: boarding a ship the camera frames 11 paces off the beam, the hand-over to the boarding view swings ${hand.sweep} rad in its first 1.2 s, at most ${hand.peak} rad/s (${J(hand)})`);

    // Land between the framing view and your ship (A4): sailing past an island that lies 9 paces off your port side
    // with a privateer 15 paces off the starboard beam, a real tap on Fire ▶. The framing doesn't swing over the island
    // (it is not turned, or not used, while the island is in the way), so the camera never dives in at your rigging:
    // it stays at least 12 paces behind your ship, your ship wholly on screen.
    const isle = await ev(pp, () => {
      const G = window.__game;
      G.state.tutorialDone = true;
      G.newGame(2);
      G.state.intro = 0;
      G.state.bannerTimer = 0.001;
      G.state.combatTime = 30;
      const p = G.player;
      G.enemies.forEach((e, k) => T.park(e, k));
      const cols = G.colliders;
      const wet = (x, z, pad = 2) => cols.every((c) => Math.hypot(x - c.x, z - c.z) > c.r + pad) && (!G.env.heightAt || G.env.heightAt(x, z) < -0.5);
      const ps = G.env.playerStart;
      let best = null;
      const isles = cols.filter((c) => c.r >= 5 && c.h >= 4).sort((a, b) => Math.hypot(a.x - ps.x, a.z - ps.z) - Math.hypot(b.x - ps.x, b.z - ps.z));
      for (const c of isles) {
        for (let b = 0; b < Math.PI * 2 && !best; b += 0.15) {
          const px = c.x + Math.cos(b) * (c.r + 9);
          const pz = c.z + Math.sin(b) * (c.r + 9);
          // heading along the shore with the island to port (port, (cos h, -sin h), points at it)
          const h = Math.atan2(-(c.z - pz), c.x - px);
          let ok = wet(px, pz, 3);
          for (let k = 0; k <= 45 && ok; k += 3) ok = wet(px - Math.cos(h) * k, pz + Math.sin(h) * k);
          for (let k = -14; k <= 30 && ok; k += 3) ok = wet(px + Math.sin(h) * k, pz + Math.cos(h) * k) && wet(px + Math.sin(h) * k - Math.cos(h) * 15, pz + Math.cos(h) * k + Math.sin(h) * 15);
          if (ok) best = { x: px - Math.sin(h) * 12, z: pz - Math.cos(h) * 12, h };
        }
        if (best) break;
      }
      if (!best) return null;
      G.place(p, best.x, best.z, best.h);
      p.speed = 0;
      window.__isle = best;
      return best;
    });
    let land = null;
    if (isle) {
      await ev(pp, async () => {
        const G = window.__game;
        const p = G.player;
        const b = window.__isle;
        const hold = () => {
          p.h = b.h;
          p.speed = 0;
        };
        await T.settle(hold); // (the camera settles behind your ship, nobody about)
        const e = T.spawn('privateer', 15, 0, 0);
        p.reload.port = p.reload.star = 0;
        window.__isleE = e;
        T.record([e], () => {
          p.h = e.h = b.h;
          p.speed = e.speed = 6;
          e.reload.port = e.reload.star = 99;
        });
      });
      await pp.evaluate(() => { window.__game.state.mode = 'playing'; });
      await pp.tap('[data-tap="fireStar"]');
      const tIsle = await pp.evaluate(() => window.__game.state.time);
      await pp.waitForFunction((t) => window.__game.state.time >= t, tIsle + 4, { timeout: 120000, polling: 20 });
      land = await pp.evaluate(() => {
        const G = window.__game;
        G.state.mode = 'paused';
        const fs = T.stop();
        G.capture.escape(window.__isleE);
        return {
          frames: fs.length,
          near: Math.round(Math.min(...fs.map((f) => Math.hypot(f.cam[0] - f.px, f.cam[2] - f.pz))) * 10) / 10,
          mine: Math.round(Math.min(...fs.map((f) => T.seen(f.mine))) * 100) / 100,
          framed: fs.filter((f) => f.w >= 0.999).length,
        };
      });
    }
    check(!!land && land.frames >= 20 && land.near >= 12 && land.mine === 1,
      `phone 390x844, an island 9 paces off your port side and her off the starboard beam: the camera never dives in at your rigging (it stays ${land && land.near} paces from your ship, your ship ${land && land.mine} on screen) (${J({ isle, land })})`);

    // Ammo then Fire straight away (taps as events, the simulation stepped): the Fire tap during the half-second swap
    // queues one shot, which goes off the moment the new shot is in, with the new ammo, exactly once.
    const queue = await ev(pp, () => {
      const G = window.__game;
      const p = T.level(1);
      const e = T.spawn('privateer', 15, 0, 0);
      e.reload.port = e.reload.star = 99;
      p.reload.port = p.reload.star = 0;
      const hold = T.pinner(p, e);
      hold();
      const tap = (sel) => document.querySelector(sel).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 4, pointerType: 'touch', isPrimary: true }));
      const seen = new Map(); // volley id -> { at, n, ammo }
      const t0 = G.state.time;
      const watch = () => {
        for (const b of G.balls) {
          if (b.owner !== 'player') continue;
          const v = seen.get(b.volley) || { at: Math.round((G.state.time - t0) * 1000) / 1000, n: 0, ammo: b.ammo, balls: new Set() };
          v.balls.add(b);
          seen.set(b.volley, v);
        }
      };
      tap('#touch-ammo');
      tap('[data-tap="fireStar"]');
      const btn = document.querySelector('[data-tap="fireStar"]');
      const now = { ammo: G.combat.ammo, queued: (G.fireQueue ? G.fireQueue.star : false), balls: G.balls.filter((b) => b.owner === 'player').length, ring: btn.classList.contains('queued') && document.getElementById('gun-star').classList.contains('queued') };
      T.steps(3, () => { hold(); watch(); });
      const vs = [...seen.values()].map((v) => ({ at: v.at, n: v.balls.size, ammo: v.ammo }));
      return { now, vs, guns: p.type.guns, swap: G.combat.rules.AMMO_SWAP, left: (G.fireQueue ? G.fireQueue.star : false), ring: btn.classList.contains('queued') };
    });
    check(queue.now.ammo === 'chain' && queue.now.queued && queue.now.ring && queue.now.balls === 0 && queue.vs.length === 1 && Math.abs(queue.vs[0].at - queue.swap) <= SUB + 1e-6 && queue.vs[0].n === queue.guns && queue.vs[0].ammo === 'chain' && !queue.left && !queue.ring,
      `phone: Ammo then Fire straight away queues the shot (the button shows it) and fires it once, with chain shot, the moment the ${queue.swap} s swap ends (${J(queue)})`);

    // The same with real taps while the game runs: one volley of the new shot, about half a second later.
    await ev(pp, () => {
      const G = window.__game;
      const p = T.level(1);
      G.combat.setAmmo('chain'); // (the next tap goes to grape)
      const e = T.spawn('privateer', 15, 0, 0);
      e.reload.port = e.reload.star = 99;
      p.reload.port = p.reload.star = 0;
      const hold = T.pinner(p, e);
      hold();
      window.__vols = new Map();
      // when each button was pressed (game time)
      window.__tapT = {};
      for (const [id, sel] of [['ammo', '#touch-ammo'], ['fire', '[data-tap="fireStar"]']]) {
        document.querySelector(sel).addEventListener('pointerdown', () => { if (window.__tapT[id] == null) window.__tapT[id] = G.state.time; }, { capture: true });
      }
      window.__hold = true;
      const loop = () => {
        if (!window.__hold) return;
        hold();
        for (const b of G.balls) if (b.owner === 'player' && !window.__vols.has(b.volley)) window.__vols.set(b.volley, { t: G.state.time, ammo: b.ammo });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await pp.evaluate(() => { window.__game.state.mode = 'playing'; });
    await pp.tap('#touch-ammo');
    await pp.tap('[data-tap="fireStar"]');
    await pp.waitForFunction(() => window.__tapT.fire != null && window.__game.state.time >= window.__tapT.fire + 1.5, null, { timeout: 120000, polling: 50 });
    const realTaps = await pp.evaluate(() => {
      const G = window.__game;
      window.__hold = false;
      G.state.mode = 'paused';
      const t = window.__tapT;
      // (the shot is due when the swap ends, or at once if the Fire tap came after that)
      const due = Math.max(t.ammo + G.combat.rules.AMMO_SWAP, t.fire);
      return { ammo: G.combat.ammo, fireTap: Math.round((t.fire - t.ammo) * 1000) / 1000, vols: [...window.__vols.values()].map((v) => ({ after: Math.round((v.t - t.ammo) * 1000) / 1000, late: Math.round((v.t - due) * 1000) / 1000, ammo: v.ammo })) };
    });
    check(realTaps.ammo === 'grape' && realTaps.vols.length === 1 && realTaps.vols[0].ammo === 'grape' && realTaps.vols[0].after >= 0.5 - SUB - 1e-6 && realTaps.vols[0].late <= 0.12,
      `phone: real taps on Ammo then Fire ▶ fire one volley of the new shot as soon as it is in (${J(realTaps)})`);

    // A queued shot is dropped when the ammo changes again, when the game pauses, and when that side has nobody to shoot.
    const dropped = await ev(pp, () => {
      const G = window.__game;
      const tap = (sel) => document.querySelector(sel).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 6, pointerType: 'touch', isPrimary: true }));
      const out = {};
      for (const how of ['ammo', 'pause']) {
        const p = T.level(1);
        const e = T.spawn('privateer', 15, 0, 0);
        e.reload.port = e.reload.star = 99;
        p.reload.port = p.reload.star = 0.3;
        const hold = T.pinner(p, e);
        hold();
        tap('[data-tap="fireStar"]');
        const queued = (G.fireQueue ? G.fireQueue.star : false);
        if (how === 'ammo') tap('#touch-ammo');
        if (how === 'pause') {
          G.togglePause();
          G.togglePause();
        }
        let shots = 0;
        T.steps(1.5, () => {
          hold();
          shots += G.balls.filter((b) => b.owner === 'player').length;
        });
        out[how] = { queued, shots, left: (G.fireQueue ? G.fireQueue.star : false), mode: G.state.mode };
      }
      return out;
    });
    check(Object.values(dropped).every((d) => d.queued && d.shots === 0 && !d.left && d.mode === 'playing'),
      `phone: a queued shot never goes off after the ammo changes again or a pause (${J(dropped)})`);
    // With nobody in that side's aim the queued shot still goes off the moment the guns are loaded, along the beam,
    // just as a tap then would (B2: it used to vanish without a word): nobody about at all, and a pirate 22 paces
    // ahead and 7 to starboard, outside that side's arc.
    const noAim = await ev(pp, () => {
      const G = window.__game;
      const tap = (sel) => document.querySelector(sel).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true }));
      const out = {};
      for (const how of ['nobody', 'ahead']) {
        const p = T.level(1);
        const e = how === 'ahead' ? T.spawn('privateer', 7, 22, 0) : null;
        if (e) e.reload.port = e.reload.star = 99;
        p.reload.port = 0;
        p.reload.star = 0.3;
        const hold = e ? T.pinner(p, e) : T.pinner(p);
        hold();
        tap('[data-tap="fireStar"]');
        const queued = G.fireQueue.star;
        const vols = new Map();
        T.steps(1.5, () => {
          hold();
          for (const b of G.balls) if (b.owner === 'player' && !vols.has(b.volley)) vols.set(b.volley, Math.round(G.state.time * 1000) / 1000);
        });
        out[how] = { queued, volleys: vols.size, left: G.fireQueue.star };
        if (e) G.capture.escape(e);
      }
      return out;
    });
    check(Object.values(noAim).every((d) => d.queued && d.volleys === 1 && !d.left),
      `phone: a Fire tap queued with nobody in that side's aim still fires once the guns are loaded, along the beam (${J(noAim)})`);

    // A tap with a long reload left fires nothing, now or later, and says so: the button and that side's reload bar
    // flash "Loading…" (screen readers hear it once, not on every tap).
    const long = await ev(pp, async () => {
      const G = window.__game;
      const p = T.level(1);
      const e = T.spawn('privateer', 15, 0, 0);
      e.reload.port = e.reload.star = 99;
      const hold = T.pinner(p, e);
      hold();
      p.reload.port = 0;
      p.reload.star = 1.5;
      p.reloadMax.star = 1.6;
      T.watchLive();
      await T.liveQuiet();
      G.state.mode = 'playing';
      const tap = (sel) => document.querySelector(sel).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 8, pointerType: 'touch', isPrimary: true }));
      tap('[data-tap="fireStar"]');
      const btn = document.querySelector('[data-tap="fireStar"]');
      const gun = document.getElementById('gun-star');
      const out = {
        queued: (G.fireQueue ? G.fireQueue.star : false),
        balls: G.balls.filter((b) => b.owner === 'player').length,
        btn: btn.classList.contains('loading') && getComputedStyle(btn, '::before').content,
        bar: gun.classList.contains('loading') && getComputedStyle(gun, '::before').content,
      };
      T.steps(0.3, hold);
      tap('[data-tap="fireStar"]'); // again: shown again, not read out again
      let shots = 0;
      T.steps(1.5, () => {
        hold();
        shots += G.balls.filter((b) => b.owner === 'player').length;
      });
      out.shots = shots;
      out.star = Math.round(p.reload.star * 1000) / 1000;
      await T.liveQuiet();
      out.live = T.liveLog();
      return out;
    });
    check(!long.queued && long.balls === 0 && long.shots === 0 && long.btn === '"Loading…"' && long.bar === '"Loading…"' && long.live.filter((t) => t === 'Starboard guns still loading.').length === 1,
      `phone: a Fire tap with 1.5 s of reload left fires nothing, now or later, flashes "Loading…" on the button and the reload bar and is read out once (${J(long)})`);

    // After a "Loading…" cue the class goes again once its 0.9 s have played, and a later tap that queues the shot
    // shows the white ring on that side's reload bar (B1: the cue's last frame used to hide it for good).
    const ring = await ev(pp, async () => {
      const G = window.__game;
      const p = T.level(1);
      const e = T.spawn('privateer', 15, 0, 0);
      e.reload.port = e.reload.star = 99;
      const hold = T.pinner(p, e);
      hold();
      const tap = () => document.querySelector('[data-tap="fireStar"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', isPrimary: true }));
      const btn = document.querySelector('[data-tap="fireStar"]');
      const gun = document.getElementById('gun-star');
      const bar = gun.querySelector('.bar');
      p.reload.port = 0;
      p.reload.star = 2;
      p.reloadMax.star = 2;
      G.state.mode = 'playing';
      tap();
      G.state.mode = 'paused';
      const cue = gun.classList.contains('loading') && btn.classList.contains('loading');
      await new Promise((r) => setTimeout(r, 1200));
      const gone = !gun.classList.contains('loading') && !btn.classList.contains('loading');
      p.reload.star = 0.5;
      G.state.mode = 'playing';
      tap();
      G.state.mode = 'paused';
      await T.redraw();
      const out = { cue, gone, queued: G.fireQueue.star, barShadow: getComputedStyle(bar).boxShadow, btnShadow: getComputedStyle(btn).boxShadow };
      G.state.mode = 'playing';
      T.steps(0.7, hold);
      G.state.mode = 'paused';
      return out;
    });
    check(ring.cue && ring.gone && ring.queued && /rgb\(255, 255, 255\)/.test(ring.barShadow) && /rgb\(255, 255, 255\)/.test(ring.btnShadow),
      `phone: after a "Loading…" cue a queued tap still shows the white ring on the reload bar and the Fire button (${J(ring)})`);

    // Chain shot shows on her: the first slowing hit pops SLOWED! and her tag gets the chain badge, whose timer bar
    // shrinks as the slow wears off; a hit while she is slowed only adds time (SAILS SHREDDED!); the badge goes when
    // the slow does.
    const chain = await ev(pp, async () => {
      const G = window.__game;
      const p = T.level(1);
      G.combat.setAmmo('chain');
      const e = T.spawn('privateer', 15, 0, 0);
      e.reload.port = e.reload.star = 99;
      const hold = T.pinner(p, e);
      hold();
      const before = G.tagInfo(e);
      const s1 = await T.salvo(e, { side: 1, crit: 'none', seed: 3, seconds: 1, hold });
      const tag1 = G.tagInfo(e);
      const left1 = G.combat.effects(e).slow;
      const full1 = G.combat.effects(e).slowFull;
      G.state.mode = 'playing';
      T.steps(2, hold);
      G.state.mode = 'paused';
      await T.redraw();
      const tag2 = G.tagInfo(e);
      // (the first volley's words play out first: frozen steps don't age them)
      G.state.mode = 'playing';
      for (let i = 0; i < 200 && G.pops.count > 0; i++) {
        await new Promise((res) => requestAnimationFrame(res));
        hold();
      }
      G.state.mode = 'paused';
      const s2 = await T.salvo(e, { side: 1, crit: 'none', seed: 4, seconds: 1, hold });
      const tag3 = G.tagInfo(e);
      G.state.mode = 'playing';
      T.steps(11, hold);
      G.state.mode = 'paused';
      await T.redraw();
      const tag4 = G.tagInfo(e);
      const seen = (r) => [...new Set(r.frames.flatMap((f) => f.pops.filter((q) => q.shown && q.o > 0.3).map((q) => q.text)))];
      return { before: before.slow, s1: seen(s1), slow1: tag1.slow, left1: Math.round(left1 * 1000) / 1000, full1, slow2: tag2.slow, s2: seen(s2), slow3: tag3.slow, slow4: tag4.slow, speed4: G.combat.effects(e).speedMul };
    });
    check(chain.before === null && chain.s1.includes('SLOWED!') && !chain.s1.includes('SAILS SHREDDED!') && chain.slow1 > 0.7 && chain.slow1 <= 1 && near(chain.slow1, chain.left1 / chain.full1, 0.01) && chain.slow2 < chain.slow1 - 0.15,
      `chain shot (phone): the first slowing volley pops SLOWED! and her tag shows the chain badge, its timer shrinking as the slow wears off (${J(chain)})`);
    check(chain.s2.includes('SAILS SHREDDED!') && !chain.s2.includes('SLOWED!') && chain.slow3 > chain.slow2 && chain.slow4 === null && chain.speed4 === 1,
      `chain shot (phone): a volley on a ship already slowed says SAILS SHREDDED! and refills the timer; the badge goes with the slow (${J({ s2: chain.s2, slow3: chain.slow3, slow4: chain.slow4 })})`);

    // Grape shot shows on her: the pips of the sailors just lost flash on her tag (for about 1.4 s) and "−3 CREW" pops.
    const grape = await ev(pp, async () => {
      const G = window.__game;
      const p = T.level(1);
      G.combat.setAmmo('grape');
      G.combat.forceCrit('none');
      const e = T.spawn('privateer', 15, 0, 0);
      e.reload.port = e.reload.star = 99;
      const hold = T.pinner(p, e);
      hold();
      p.reload.star = 0;
      const crew0 = G.combat.crewOf(e);
      G.playerFire(1);
      T.steps(0.9, hold);
      G.combat.forceCrit(null);
      const crew1 = G.combat.crewOf(e);
      const pops = [...document.querySelectorAll('#pops .pop')].filter((s) => s.style.display !== 'none').map((s) => s.textContent);
      G.state.mode = 'paused';
      await T.redraw();
      const t1 = G.tagInfo(e);
      G.state.mode = 'playing';
      const t0 = G.state.time;
      const lostColors = new Set(); // the colours the lost pips (the last three) show while they flash
      while (G.state.time - t0 < 1.6) {
        await new Promise((res) => requestAnimationFrame(res));
        hold();
        const ti = G.tagInfo(e);
        if (ti.flash > 0 && ti.colors) for (const c of ti.colors.slice(7)) lostColors.add(c);
      }
      G.state.mode = 'paused';
      const t2 = G.tagInfo(e);
      return { crew0, crew1, pops, flash1: t1.flash, pips1: t1.pips, flash2: t2.flash, pips2: t2.pips, lostColors: [...lostColors] };
    });
    check(grape.crew0 - grape.crew1 === 3 && grape.flash1 === 3 && grape.pips1 === 7.5 && grape.flash2 === 0 && grape.pips2 === 7.5 && grape.pops.some((t) => /−3 CREW/.test(t)),
      `grape shot (phone): her tag flashes the 3 pips of the sailors just lost, then shows them gone, and "−3 CREW" pops (${J(grape)})`);
    // (C1) They blink red and the dark of a lost pip, both "gone": never white or the cream of a sailor aboard.
    check(grape.lostColors.includes('ff3b2f') && grape.lostColors.includes('4a3b5c') && grape.lostColors.every((c) => c === 'ff3b2f' || c === '4a3b5c'),
      `grape shot (phone): the lost pips blink red and dark, never white or cream (${J(grape.lostColors)})`);

    // Round shot is the hull smasher: its damage pops bigger than chain or grape shot's.
    const sizes = await ev(pp, () => {
      const G = window.__game;
      const out = {};
      for (const id of ['round', 'chain']) {
        const p = T.level(1);
        G.combat.setAmmo(id);
        G.combat.forceCrit('none');
        const e = T.spawn('privateer', 15, 0, 0);
        e.reload.port = e.reload.star = 99;
        const hold = T.pinner(p, e);
        hold();
        p.reload.star = 0;
        G.playerFire(1);
        const hm = document.getElementById('hitmark');
        hm.classList.remove('popped');
        T.steps(1.2, () => {
          hold();
          return !hm.classList.contains('popped');
        });
        G.combat.forceCrit(null);
        const pop = [...document.querySelectorAll('#pops .pop.pop-dmg')].find((s) => s.style.display !== 'none');
        out[id] = pop ? { cls: pop.className, size: parseFloat(getComputedStyle(pop).fontSize), text: pop.querySelector('.pop-main').textContent } : null;
      }
      return out;
    });
    check(sizes.round && sizes.chain && /pop-round/.test(sizes.round.cls) && !/pop-round/.test(sizes.chain.cls) && sizes.round.size > sizes.chain.size * 1.15,
      `round shot (phone): its hull damage pops bigger than chain shot's (${J(sizes)})`);
    await ctx.close();

    // Reduced motion (A3, SPEC2 §13: camera cuts instead of swoops or eases): the same pirates on both beams fired at
    // in turn. The framing's weight is only ever 0 or 1, the framing view holds still relative to your ship between
    // cuts, and cuts come at least 1.5 s apart.
    const { ctx: rctx, page: rp } = await open({ width: 390, height: 844, touch: true, label: 'phone-rm', reducedMotion: 'reduce', store: { 'pirates-ahoy-unlocked': '3', 'pirates-ahoy-tutorial-done': '1', 'pirates-ahoy-tips': '255' } });
    const rm = await twoBeams(rp);
    check(rm.framed > 10 && rm.weights.every((w) => w === 0 || w === 1) && rm.cuts >= 1 && rm.gaps.every((g) => g >= 1.5 - 0.01) && rm.seen.every((x) => x === 1),
      `phone 390x844, reduced motion: the camera cuts to and from the framing view (weights ${J(rm.weights)}), holds still between cuts, ${rm.cuts} cut(s) at least 1.5 s apart (${J(rm.gaps)}), and each ship fired at is on screen 1.5 s after the shot (${J(rm.seen)})`);
    await rctx.close();

    // Wide screens keep the chase view, even in a running fight (A1): a desktop window (1280x720) and a phone on its
    // side (844x390), a privateer sailing 16 paces off your port beam (where the framing used to take over), you
    // firing both broadsides by key and turning hard to port and back. The framing never comes in (its weight is 0
    // in every frame) and your ship stays wholly on screen.
    const wideFight = async (page) => {
      await ev(page, () => {
        const G = window.__game;
        const p = T.level(1);
        G.state.bannerTimer = 0.001;
        const e = T.spawn('privateer', -16, 0, 0);
        const h = e.h;
        p.reload.port = p.reload.star = 0;
        window.__wideE = e;
        T.record([e], () => {
          p.speed = 8;
          e.speed = 8;
          e.h = h;
          e.reload.port = e.reload.star = 99;
        });
      });
      const t0 = await page.evaluate(() => {
        window.__game.state.mode = 'playing';
        return window.__game.state.time;
      });
      const until = (dt) => page.waitForFunction((t) => window.__game.state.time >= t, t0 + dt, { timeout: 120000, polling: 20 });
      await page.keyboard.press('q');
      await until(0.3);
      await page.keyboard.down('a');
      await until(2.5);
      await page.keyboard.up('a');
      await page.keyboard.press('e');
      await page.keyboard.down('d');
      await until(5);
      await page.keyboard.up('d');
      return page.evaluate(() => {
        const G = window.__game;
        G.state.mode = 'paused';
        const fs = T.stop();
        let turned = 0;
        for (let i = 1; i < fs.length; i++) turned += Math.abs(T.wrap(fs[i].h - fs[i - 1].h));
        G.capture.escape(window.__wideE);
        return { frames: fs.length, w: Math.max(...fs.map((f) => f.w)), focus: fs.some((f) => f.focus !== -1), mine: Math.round(Math.min(...fs.map((f) => T.seen(f.mine))) * 100) / 100, turned: Math.round(turned * 100) / 100 };
      });
    };

    // A desktop window (1280x720) keeps its chase view: it shows the same privateer already, and the battle camera
    // never frames on a wide screen; R / 1-3 say what the shot does in the hint bubble too.
    const { ctx: dctx, page: dp } = await open({ label: 'phone-desk', store: { 'pirates-ahoy-unlocked': '3', 'pirates-ahoy-tutorial-done': '1', 'pirates-ahoy-tips': '255' } });
    const desk = await ev(dp, async () => {
      const G = window.__game;
      const p = T.level(1);
      const e = T.spawn('privateer', 15, 0, 0);
      e.reload.port = e.reload.star = 99;
      const hold = T.pinner(p, e);
      hold();
      const frames = await T.settle(hold);
      const tag = (G.tagRect ? G.tagRect(e) : null);
      const out = { frames, w: (G.framing ? G.framing.w : 0), focus: (G.framing ? G.framing.focus : null) === e, need: (G.framing ? G.framing.need : null), tag: tag && Object.fromEntries(Object.entries(tag).map(([k, v]) => [k, Math.round(v)])) };
      G.state.mode = 'playing';
      T.key('2', 'Digit2');
      G.state.mode = 'paused';
      await T.redraw();
      out.hint = T.shown('hint') ? T.text('hint') : '';
      return out;
    });
    check(!desk.focus && desk.w === 0 && !desk.need && desk.tag && desk.tag.l >= 0 && desk.tag.r <= 1280 && desk.tag.t >= 0 && desk.hint === 'Chain shot: slows her down',
      `desktop 1280x720: the chase view already shows a privateer 15 paces off the beam with her tag, and the camera stays as it was (nothing framed); 2 says "${desk.hint}" (${J(desk)})`);
    const deskFight = await wideFight(dp);
    await dctx.close();
    const { ctx: lctx, page: lp } = await open({ width: 844, height: 390, touch: true, label: 'phone-side', store: { 'pirates-ahoy-unlocked': '3', 'pirates-ahoy-tutorial-done': '1', 'pirates-ahoy-tips': '255' } });
    const sideFight = await wideFight(lp);
    await lctx.close();
    for (const [where, r] of [['desktop 1280x720', deskFight], ['phone on its side 844x390', sideFight]]) {
      check(r.frames >= 20 && r.turned > 1.5 && r.w === 0 && !r.focus && r.mine === 1,
        `${where}, a running fight with her 16 paces off the port beam and hard turns both ways: the camera keeps its chase view (framing weight ${r.w} at most) and your ship stays wholly on screen (${r.mine}) (${J(r)})`);
    }
  });

  // =========================================================================================================
  // The Kraken Seas (SPEC3 §13.2's battle additions), with ?kraken=1 until Voyage III sails for everyone:
  // special shot (keys 4-6, loads, R, Space with the last load, a queued tap, the launch sound, ranges and
  // reloads), the touch ammo tray and its layout, statuses and their interactions, the bosses' halves and the
  // two immunities, hot and stinky boarding, the Iron Turtle's armour, the rudder tiers, the thumb slide and the
  // ship's wheel, the steering setting, the powder / settings / tips / feats records, the shipyard's rudder row,
  // the new sounds, and the live game (no ?kraken=1) unchanged. BATTLE_ONLY=kraken-ammo,kraken-status,... runs
  // some of them.
  // =========================================================================================================
  const KQ = '?quality=low&kraken=1';
  const OWN = (fire, frost, stink) => JSON.stringify({ v: 1, own: { fire, frost, stink } });
  const OWN_ALL = OWN(1, 1, 1);
  const KSTORE = { 'pirates-ahoy-unlocked': '7', 'pirates-ahoy-tutorial-done': '1', 'pirates-ahoy-tips': '65535', 'pirates-ahoy-powder': OWN_ALL };
  // In-page helpers for these sections (window.K, beside window.T).
  function installKraken() {
    const G = window.__game;
    const K = {
      // Every pop spawned from now on, read with K.pops() ("ON FIRE!", "FIRE OUT! SSSS!") or K.popList ({ text: its
      // big line, sub: its second line, cls: its classes }).
      watchPops() {
        K.popList = [];
        if (K.popObs) K.popObs.disconnect();
        K.popObs = new MutationObserver(K.popRecords);
        K.popObs.observe(document.getElementById('pops'), { childList: true, subtree: true });
      },
      popRecords(recs) {
        const fresh = [];
        for (const r of recs) {
          const el = r.target;
          if (r.type !== 'childList' || !el.classList) continue;
          const pop = el.closest('.pop');
          const text = [...r.addedNodes].map((n) => n.textContent).join('');
          if (el.classList.contains('pop-main')) {
            const e = { el: pop, text, sub: '', cls: '' };
            K.popList.push(e);
            fresh.push(e);
          } else if (el.classList.contains('pop-sub') && text) {
            for (let i = K.popList.length - 1; i >= 0; i--) {
              if (K.popList[i].el === pop) {
                K.popList[i].sub = text;
                break;
              }
            }
          }
        }
        for (const e of fresh) e.cls = e.el ? e.el.className : '';
      },
      // (the records not delivered yet: a pop spawned in this same synchronous stretch)
      popsNow() {
        if (K.popObs) K.popRecords(K.popObs.takeRecords());
        return K.popList || [];
      },
      pops: () => K.popsNow().map((p) => (p.sub ? `${p.text} ${p.sub}` : p.text)),
      // Every sound played from now on (the names given to audio.play), read with K.sounds.
      spySounds() {
        if (!K.sounds) {
          K.sounds = [];
          const a = G.audio;
          const play = a.play;
          a.play = function (name, ...rest) {
            K.sounds.push(name);
            return play.call(this, name, ...rest);
          };
        }
        K.sounds.length = 0;
      },
      // Real frames (the loop running) for `seconds` of play, `hold` keeping the ships where they are each frame:
      // the pops' rate (8 a second) fills up again, and the HUD, the tags and statusfx catch up. The mode is put back.
      async play(seconds = 1.2, hold = () => {}) {
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
      hint: () => (T.shown('hint') ? T.text('hint') : ''),
      // One key pressed and let go (the game's own handlers); the ammo loaded afterwards.
      press(key, code, o = {}) {
        T.key(key, code, o);
        T.key(key, code, { type: 'keyup' });
        return G.combat.ammo;
      },
      // The balls a call fires (their ammo, and the side each flies out on: -1 port, +1 starboard).
      shots(fn) {
        const before = new Set(G.balls);
        fn();
        const p = G.player;
        return G.balls.filter((b) => !before.has(b)).map((b) => ({ ammo: b.ammo, side: Math.sign(G.relative(p, b.ox, b.oz).lat) }));
      },
      // A broadside from `side` at `e` with the target NOT held (she sails as she will; her guns stay quiet), stepped
      // until every ball of it is down. Returns her hits from the shot log.
      fireAt(e, side = 1) {
        const p = G.player;
        G.combat.clearLog();
        p.reload.port = p.reload.star = 0;
        p.speed = 0;
        G.playerFire(side);
        let n = 0;
        while (G.balls.some((b) => b.owner === 'player') && n < 600) {
          e.reload.port = e.reload.star = 99;
          G.step(1 / 120);
          n++;
        }
        return G.combat.log.filter((l) => l.owner === 'player' && l.targetId === e.id);
      },
    };
    window.K = K;
  }
  // A page of the game with the Kraken Seas (?kraken=1), the helpers installed. store: the records before it loads
  // (by default: levels 1-7 open, the tutorial and every tip seen, all three recipes owned).
  async function openK({ store = KSTORE, ...o } = {}) {
    const r = await open({ query: KQ, store, ...o });
    KLABEL.set(r.page, o.label || 'page');
    await r.page.evaluate(installKraken);
    return r;
  }
  // Leaving a page: audio.js downloads every recording in the background from page load, so a reload or a closed tab
  // can abort one still on its way, and the page being left says so ("audio: no recording for music:volcano
  // (music-volcano.mp3), using the synthesised sound: TypeError: Failed to fetch"), which watch() counts as a page
  // error. leaving() forgives exactly that warning, from the pages being reloaded or closed, and only while they are
  // being left (a reload: until the new page commits, which comes after the old page's last warning); every other
  // audio warning stays an error. KLABEL: each page's watch() label.
  const KLABEL = new WeakMap();
  const FETCH_ABORT = /^audio: no recording for (?:music|amb|sfx):[\w-]+ \([\w.-]+\), using the synthesised sound: TypeError: Failed to fetch$/;
  const kAborts = [];
  async function leaving(pages, go) {
    const labels = pages.map((p) => KLABEL.get(p)).filter(Boolean);
    const n0 = errors.length;
    let n1 = null;
    const navs = pages.map((p) => {
      const f = (fr) => {
        if (n1 === null && fr === p.mainFrame()) n1 = errors.length;
      };
      p.on('framenavigated', f);
      return [p, f];
    });
    try {
      await go();
    } finally {
      for (const [p, f] of navs) p.off('framenavigated', f);
    }
    for (let i = (n1 === null ? errors.length : n1) - 1; i >= n0; i--) {
      const label = labels.find((l) => errors[i].startsWith(`${l}: `));
      if (!label || !FETCH_ABORT.test(errors[i].slice(label.length + 2))) continue;
      kAborts.push(errors.splice(i, 1)[0]);
      console.log(`     (${label}: left while a recording was still downloading; its aborted fetch is not a page error)`);
    }
  }
  const closeK = (c) => leaving(c.pages(), () => c.close());
  async function reloadK(p) {
    await leaving([p], () => p.reload({ waitUntil: 'domcontentloaded', timeout: 120000 }));
    await p.waitForFunction(() => window.__gameReady === true && window.__game && window.__game.env, null, { timeout: 120000 });
    await p.evaluate(installHelpers);
  }
  const r2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);

  // ------------------------------------------------------------------------------- kraken: special shot (keys)
  await section('kraken-ammo', async () => {
    const { ctx, page: kp } = await openK({ label: 'kraken-ammo' });
    // Every level start loads 4 of each special shot whose recipe you own (the Windmill adds none at tier 0), none of
    // one you don't; loads never carry over (spent ones come back at the next level start).
    const loads = await ev(kp, () => {
      const G = window.__game;
      G.specials.setPowder({ v: 1, own: { fire: 1, frost: 0, stink: 1 } });
      T.level(1);
      const one = G.specials.loads;
      G.specials.setLoads({ fire: 0, frost: 0, stink: 1 });
      G.specials.setPowder({ v: 1, own: { fire: 1, frost: 1, stink: 1 } });
      T.level(2);
      return { one, all: G.specials.loads, saved: localStorage.getItem('pirates-ahoy-powder') };
    });
    check(J(loads.one) === '{"fire":4,"frost":0,"stink":4}' && J(loads.all) === '{"fire":4,"frost":4,"stink":4}' && loads.saved === OWN_ALL,
      `kraken ammo: every level start loads 4 of each special shot whose recipe you own and none of one you don't; spent loads come back at the next level (${J(loads)})`);

    // Keys 4 / 5 / 6 by the physical key (e.code: an AZERTY "(" is Digit5), the numpad too; a held key's repeat
    // does nothing; 1 by its code goes back to round shot. Each pick says what the shot does and the loads left;
    // the Ammo cell reads "Stink" "×4".
    const keys = await ev(kp, async () => {
      const G = window.__game;
      T.level(1);
      G.combat.setAmmo('round');
      const seq = [];
      const hints = [];
      const press = (key, code, o) => {
        seq.push(K.press(key, code, o));
        hints.push(K.hint());
      };
      press('4', 'Digit4');
      press('(', 'Digit5');
      press('6', 'Numpad6');
      press('4', 'Digit4', { repeat: true });
      G.state.mode = 'paused';
      await T.redraw();
      const cell = { name: T.text('ammo-name'), count: T.text('ammo-count'), shown: T.shown('ammo-count'), state: document.getElementById('gun-ammo').dataset.ammo };
      G.state.mode = 'playing';
      press('&', 'Digit1');
      G.state.mode = 'paused';
      await T.redraw();
      cell.round = { name: T.text('ammo-name'), count: T.shown('ammo-count') };
      return { seq, hints, cell };
    });
    check(keys.seq.join() === 'fire,frost,stink,stink,round' && /^Fire shot: .*4 loads left$/.test(keys.hints[0]) && /^Frost shot: .*4 loads left$/.test(keys.hints[1]) && /^Stink shot: .*4 loads left$/.test(keys.hints[2]),
      `kraken ammo: 4 / 5 (an AZERTY "(") / numpad 6 load Fire, Frost and Stink shot by the key's code, a held key's repeat does nothing, 1 goes back to round; each says what it does and the loads left (${J(keys.seq)} ${J(keys.hints.slice(0, 3))})`);
    check(keys.cell.name === 'Stink' && keys.cell.count === '×4' && keys.cell.shown && keys.cell.state === 'stink' && keys.cell.round.name === 'Round' && keys.cell.round.count === false,
      `kraken ammo: the Ammo cell reads "Stink" "×4" (no count for round shot) (${J(keys.cell)})`);

    // Not owned, not on sale yet, none left: the key loads nothing and the hint says why.
    const why = await ev(kp, () => {
      const G = window.__game;
      G.specials.setPowder({ v: 1, own: { fire: 1, frost: 0, stink: 0 } });
      T.level(1);
      G.combat.setAmmo('round');
      const out = {};
      const press = (key, code) => ({ ammo: K.press(key, code), hint: K.hint() });
      out.notOwned = press('5', 'Digit5');
      G.state.unlocked = 6; // (the Maelstrom not beaten yet)
      out.locked = press('6', 'Digit6');
      G.state.unlocked = 7;
      G.specials.setLoads({ fire: 0, frost: 0, stink: 0 });
      out.empty = press('4', 'Digit4');
      G.specials.setPowder({ v: 1, own: { fire: 1, frost: 1, stink: 1 } });
      return out;
    });
    check(why.notOwned.ammo === 'round' && why.notOwned.hint === 'Buy Frost shot at the Salty Sparrow' && why.locked.ammo === 'round' && why.locked.hint === 'Stink shot goes on sale after the Maelstrom' && why.empty.ammo === 'round' && why.empty.hint === 'No Fire shot left this level',
      `kraken ammo: a recipe not owned, not on sale or out of loads loads nothing and says why (${J(why)})`);

    // R: round -> chain -> grape -> the specials you own with loads left -> round.
    const cyc = await ev(kp, () => {
      const G = window.__game;
      G.specials.setPowder({ v: 1, own: { fire: 1, frost: 0, stink: 1 } });
      T.level(1);
      G.specials.setLoads({ fire: 2, frost: 0, stink: 0 });
      G.combat.setAmmo('round');
      const some = [];
      for (let i = 0; i < 5; i++) some.push(K.press('r', 'KeyR'));
      G.specials.setPowder({ v: 1, own: { fire: 1, frost: 1, stink: 1 } });
      G.specials.setLoads({ fire: 4, frost: 4, stink: 4 });
      G.combat.setAmmo('round');
      const all = [];
      for (let i = 0; i < 6; i++) all.push(K.press('r', 'KeyR'));
      return { some, all };
    });
    check(cyc.some.join() === 'chain,grape,fire,round,chain' && cyc.all.join() === 'chain,grape,fire,frost,stink,round',
      `kraken ammo: R cycles round, chain, grape and the special shots you own with loads left (Frost not owned, Stink empty: ${cyc.some.join(', ')}; all three: ${cyc.all.join(', ')})`);

    // Every broadside of a special spends one load per side: Q one, Space two.
    const spend = await ev(kp, () => {
      const G = window.__game;
      const p = T.level(1);
      G.combat.setAmmo('fire');
      p.reload.port = p.reload.star = 0;
      const q = K.shots(() => K.press('q', 'KeyQ'));
      const afterQ = G.specials.loads.fire;
      p.reload.port = p.reload.star = 0;
      const space = K.shots(() => K.press(' ', 'Space'));
      const out = { guns: p.type.guns, q, afterQ, space, afterSpace: G.specials.loads.fire };
      T.steps(2.5);
      return out;
    });
    check(spend.q.length === spend.guns && spend.q.every((b) => b.ammo === 'fire' && b.side === -1) && spend.afterQ === 3 && spend.space.length === 2 * spend.guns && spend.space.every((b) => b.ammo === 'fire') && spend.afterSpace === 1,
      `kraken ammo: a broadside of ${spend.guns} Fire balls spends one load (4 -> ${spend.afterQ}), Space's two broadsides two (-> ${spend.afterSpace})`);

    // Space with one load left: one side fires it, the other round shot in the same step, loaded at once (no
    // 0.5 s swap, no click); "Out of Fire shot! Round shot loaded." in the hint and #game-live.
    await kp.evaluate(() => T.watchLive());
    await kp.evaluate(() => T.liveQuiet());
    const last = await ev(kp, () => {
      const G = window.__game;
      const p = T.level(1);
      G.combat.setAmmo('fire');
      G.specials.setLoads({ fire: 1, frost: 4, stink: 4 });
      p.reload.port = p.reload.star = 0;
      K.spySounds();
      const t0 = G.state.time;
      const balls = K.shots(() => K.press(' ', 'Space'));
      return {
        port: [...new Set(balls.filter((b) => b.side < 0).map((b) => b.ammo))].join(),
        star: [...new Set(balls.filter((b) => b.side > 0).map((b) => b.ammo))].join(),
        n: balls.length,
        sameStep: G.state.time === t0,
        reload: { port: p.reload.port, star: p.reload.star, base: p.type.reload, fireMul: 1.1 },
        ammo: G.combat.ammo,
        loads: G.specials.loads.fire,
        sounds: K.sounds.slice(),
        hint: K.hint(),
      };
    });
    await kp.evaluate(() => T.liveQuiet());
    last.live = await kp.evaluate(() => T.liveLog());
    check(last.port === 'fire' && last.star === 'round' && last.n === 6 && last.sameStep && near(last.reload.star, last.reload.base, 1e-9) && near(last.reload.port, last.reload.base * 1.1, 1e-9) && last.ammo === 'round' && last.loads === 0 && !last.sounds.includes('click'),
      `kraken ammo: Space with one Fire load left fires it to port and round shot to starboard in the same step, loaded at once (reload ${r2(last.reload.star)} s, no swap, no click) (${J(last)})`);
    check(last.hint === 'Out of Fire shot! Round shot loaded.' && last.live.includes('Out of Fire shot! Round shot loaded.'),
      `kraken ammo: out of Fire shot, the hint and #game-live say "Out of Fire shot! Round shot loaded." (${J({ hint: last.hint, live: last.live })})`);

    // A Fire press while the guns load is queued: it spends a load only when it fires, and an ammo change (a key or
    // R) drops it, spending nothing.
    const queued = await ev(kp, () => {
      const G = window.__game;
      const p = T.level(1);
      G.specials.setLoads({ fire: 4, frost: 4, stink: 4 });
      G.combat.setAmmo('frost');
      p.reload.port = 2;
      p.reload.star = 0.3;
      K.press('e', 'KeyE');
      const out = { queued: G.fireQueue.star, loadsQueued: G.specials.loads.frost };
      const balls = K.shots(() => T.steps(0.4));
      out.fired = balls.map((b) => b.ammo).join();
      out.loadsFired = G.specials.loads.frost;
      p.reload.star = 0.3;
      K.press('e', 'KeyE');
      out.queued2 = G.fireQueue.star;
      K.press('6', 'Digit6'); // stink: the queued Frost shot is dropped
      out.byKey = { ammo: G.combat.ammo, balls: K.shots(() => T.steps(1)).length, loads: G.specials.loads };
      p.reload.star = 0.3;
      K.press('e', 'KeyE');
      out.queued3 = G.fireQueue.star;
      K.press('r', 'KeyR'); // stink -> round
      out.byR = { ammo: G.combat.ammo, balls: K.shots(() => T.steps(1)).length, loads: G.specials.loads };
      return out;
    });
    check(queued.queued && queued.loadsQueued === 4 && /^frost(,frost)*$/.test(queued.fired) && queued.loadsFired === 3,
      `kraken ammo: a Fire press while the guns load is queued without spending a load, and spends one when it fires (${J({ q: queued.queued, before: queued.loadsQueued, fired: queued.fired, after: queued.loadsFired })})`);
    check(queued.queued2 && queued.byKey.ammo === 'stink' && queued.byKey.balls === 0 && J(queued.byKey.loads) === '{"fire":4,"frost":3,"stink":4}' && queued.queued3 && queued.byR.ammo === 'round' && queued.byR.balls === 0 && J(queued.byR.loads) === '{"fire":4,"frost":3,"stink":4}',
      `kraken ammo: an ammo change (6, then R) drops a queued shot: nothing fires and no load is spent (${J({ byKey: queued.byKey, byR: queued.byR })})`);

    // The launch sound: a special ball goes off with the round shot's bang alone (its own sound plays where it hits);
    // chain shot still whirrs at the gun.
    const bang = await ev(kp, () => {
      const G = window.__game;
      const p = T.level(1);
      G.specials.setLoads({ fire: 4, frost: 4, stink: 4 });
      const out = {};
      for (const id of ['fire', 'frost', 'stink', 'chain']) {
        G.combat.setAmmo(id);
        p.reload.port = 0;
        K.spySounds();
        G.playerFire(-1);
        out[id] = K.sounds.slice();
      }
      T.steps(2.5);
      return out;
    });
    check(['fire', 'frost', 'stink'].every((id) => J(bang[id]) === '["cannon"]') && J(bang.chain) === '["cannon","chain"]',
      `kraken ammo: a special broadside launches with the cannon's bang alone (its own sound waits for the hit); chain shot still whirrs (${J(bang)})`);

    // Each special's range clamps its flight (Fire 30, Frost 28, Stink 22, against round shot's 34) and its reload
    // is the ship's × 1.1 / 1.1 / 1.2. (Aim spread and the launch's ±3 % are pinned: Math.random() = 0.5.)
    const reach = await ev(kp, () => {
      const G = window.__game;
      const p = T.level(1);
      G.specials.setLoads({ fire: 4, frost: 4, stink: 4 });
      const far = T.spawn('privateer', 60, 0, 0);
      const hold = T.pinner(p, far); // (she would sail into the shot's path)
      const out = {};
      const random = Math.random;
      try {
        for (const id of ['round', 'fire', 'frost', 'stink']) {
          G.combat.setAmmo(id);
          p.reload.star = 0;
          const before = new Set(G.balls);
          Math.random = () => 0.5;
          G.fire(p, 1, far);
          Math.random = random;
          const mine = G.balls.filter((b) => !before.has(b));
          out[id] = { reload: Math.round((p.reload.star / p.type.reload) * 1000) / 1000, n: mine.length, max: 0 };
          let max = 0;
          T.steps(2.5, () => {
            hold();
            for (const b of mine) max = Math.max(max, Math.hypot(b.x - b.ox, b.z - b.oz));
          });
          out[id].max = Math.round(max * 100) / 100;
        }
      } finally {
        Math.random = random;
      }
      G.capture.escape(far);
      return out;
    });
    // (a ball splashes down a little past the point its range ends its flight: from the gun deck to the sea, as
    // round shot does)
    const RANGE = { round: [34, 1], fire: [30, 1.1], frost: [28, 1.1], stink: [22, 1.2] };
    const past = (id) => r2(reach[id].max - RANGE[id][0]);
    check(Object.entries(RANGE).every(([id, [, mul]]) => reach[id].n === 3 && past(id) >= 0.5 && past(id) <= 3 && reach[id].reload === mul),
      `kraken ammo: Fire, Frost and Stink shot fly 30 / 28 / 22 u (round shot 34), each splashing down ${['round', 'fire', 'frost', 'stink'].map(past).join(' / ')} u past it, and reload in 1.1 / 1.1 / 1.2 × the ship's time (${J(reach)})`);
    await closeK(ctx);
  });

  // ------------------------------------------------------------------------------- kraken: statuses on a ship
  // A page for the statuses' sections: window.__setup(type, lat, ammo) puts a ship `lat` off your starboard beam with
  // the shot loaded, the loads topped up and the pops' rate filled up again (real frames with both ships held), and
  // watches the pops and sounds from then on.
  async function statusPage(label) {
    const r = await openK({ label });
    const setup = `(async (type, lat, ammo) => {
      const G = window.__game;
      const p = T.level(1);
      G.specials.setLoads({ fire: 9, frost: 9, stink: 9 });
      G.combat.setAmmo(ammo);
      G.combat.forceCrit('none');
      const e = T.spawn(type, lat, 0, 0);
      await K.play(1.1, T.pinner(p, e));
      K.watchPops();
      K.spySounds();
      return e;
    })`;
    await r.page.evaluate((s) => { window.__setup = eval(s); }, setup);
    await r.page.evaluate(() => T.watchLive());
    return r;
  }
  await section('kraken-status', async () => {
    const { ctx, page: kp } = await statusPage('kraken-status');
    const liveQuiet = () => kp.evaluate(() => T.liveQuiet());

    // Fire: a 3-gun volley puts one burn on her: 3 hp/s for 6 s, 18 in all (each ball 0.7 × round shot); ON FIRE!
    // once, the ignite whoomph once, read out.
    await liveQuiet();
    const fire = await ev(kp, async () => {
      const G = window.__game;
      const e = await window.__setup('privateer', 18, 'fire');
      const p = G.player;
      const hp0 = e.hp;
      const v = T.volley(e, { seconds: 0.8 });
      const hull = v.hits.reduce((a, l) => a + l.dmg, 0);
      const at = v.hits.length ? v.hits[0].t : 0;
      const out = { guns: p.type.guns, hits: v.hits.map((l) => [l.dmg, l.rangeMul, l.crit]), st: G.specials.status(e), since: G.state.time - at, burn: G.specials.burn(e) };
      out.ignite = K.sounds.filter((s) => s === 'ignite').length;
      out.onFire = K.pops().filter((t) => t === 'ON FIRE!').length;
      // the rest of it, held still: what has burnt, every half second since the hit
      const hold = T.pinner(p, e);
      const burnt = [];
      let endAt = null;
      T.steps(6.6, () => {
        hold();
        const since = G.state.time - at;
        if (Math.abs(since * 2 - Math.round(since * 2)) < 0.5 / 120) burnt.push([Math.round(since * 100) / 100, Math.round((hp0 - hull - e.hp) * 1000) / 1000]);
        if (endAt === null && G.specials.status(e).id === null) endAt = G.state.time;
      });
      out.burnt = burnt;
      out.total = Math.round((hp0 - hull - e.hp) * 1000) / 1000;
      out.lasted = endAt === null ? null : Math.round((endAt - at) * 100) / 100;
      out.after = G.specials.burn(e);
      G.capture.escape(e);
      return out;
    });
    await liveQuiet();
    fire.live = await kp.evaluate(() => T.liveLog());
    const steady = fire.burnt.every(([t, b]) => b >= Math.min(18, 3 * t) - 1.0001 && b <= Math.min(18, 3 * t) + 1e-9);
    check(fire.hits.length === 3 && fire.hits.every(([d, m, c]) => near(d, 7 * m, 1e-9) && !c) && fire.st.id === 'fire' && fire.st.max === 6 && near(fire.st.t + fire.since, 6, 0.02) && fire.burn.rate === 3 && fire.burn.from === 'fire',
      `kraken status: a 3-gun Fire volley hits for 0.7 × round shot a ball and sets her ON FIRE for 6 s at 3 hp/s (${J({ hits: fire.hits, st: fire.st, since: r2(fire.since), burn: fire.burn })})`);
    check(fire.total === 18 && steady && near(fire.lasted, 6, 0.02) && fire.after.ticks === 0 && fire.onFire === 1 && fire.ignite === 1 && fire.live.includes('The Privateer Brig is on fire'),
      `kraken status: one burn for the whole volley: 18 hp over 6 s, 1 hp at a time (${J(fire.burnt.filter((x, i) => i % 2 === 0))}); ON FIRE! ×${fire.onFire}, ignite ×${fire.ignite}, read out (${J(fire.live)})`);

    // Frost: half her speed cap and 0.6 of her turning for 5 s; each volley adds 2 s, at most 8; then she is free.
    const frost = await ev(kp, async () => {
      const G = window.__game;
      const e = await window.__setup('privateer', 18, 'frost');
      const p = G.player;
      const out = { cap0: G.combat.effects(e).speedCap, vol: [] };
      for (let k = 0; k < 5; k++) {
        e.hp = e.hpLow = e.maxHp; // (five volleys would sink her)
        const v = T.volley(e, { seconds: 0.6 });
        const st = G.specials.status(e);
        out.vol.push({ n: v.hits.length, at: v.hits.length ? v.hits[0].t : null, left: st.t + (G.state.time - (v.hits.length ? v.hits[0].t : 0)), max: st.max, id: st.id });
        if (k === 0) out.fx = G.combat.effects(e);
      }
      const hold = T.pinner(p, e);
      let endAt = null;
      T.steps(8.5, () => {
        hold();
        if (endAt === null && G.specials.status(e).id === null) endAt = G.state.time;
      });
      out.lasted = endAt === null ? null : endAt - out.vol[4].at;
      out.fxAfter = G.combat.effects(e);
      out.frozen = K.pops().filter((t) => t === 'FROZEN!').length;
      out.freeze = K.sounds.filter((s) => s === 'freeze').length;
      G.capture.escape(e);
      return out;
    });
    // what each volley should leave: 5 s, then + 2 s on what was left at its hit, at most 8
    let want = 5;
    const frostOk = frost.vol.every((v, k) => {
      if (k > 0) want = Math.min(8, want - (v.at - frost.vol[k - 1].at) + 2);
      return v.n === 3 && v.id === 'frost' && near(v.left, want, 0.02);
    });
    check(frostOk && frost.vol.some((v) => near(v.left, 8, 0.02)) && frost.vol[0].max === 5 && frost.fx.speedMul === 0.5 && frost.fx.turnMul === 0.6 && near(frost.fx.speedCap, frost.cap0 * 0.5, 1e-9),
      `kraken status: FROZEN halves her speed cap and turns her at 0.6 for 5 s; each volley adds 2 s, at most 8 (${J(frost.vol.map((v) => r2(v.left)))}, ${J({ speedMul: frost.fx.speedMul, turnMul: frost.fx.turnMul, cap: r2(frost.fx.speedCap), cap0: r2(frost.cap0) })})`);
    check(near(frost.lasted, 8, 0.03) && frost.fxAfter.speedMul === 1 && frost.fxAfter.turnMul === 1 && frost.frozen >= 1 && frost.freeze === 5,
      `kraken status: the frost wears off when its time is up (${r2(frost.lasted)} s after the last volley), FROZEN! pops, a freeze sound for each volley (${J({ after: frost.fxAfter.speedMul, pops: frost.frozen, sounds: frost.freeze })})`);

    // Stink: she coasts to a stop at 2 × her accel, never turns and fires nothing for 4 s (her guns loaded, you on
    // her beam); then 10 s of clothes-pegs (a stink then: "Clothes-pegs!", no status), then it takes again.
    await liveQuiet();
    const stink = await ev(kp, async () => {
      const G = window.__game;
      const e = await window.__setup('privateer', 18, 'stink');
      const p = G.player;
      e.speed = 6;
      const hits = K.fireAt(e, 1);
      const at = hits.length ? hits[0].t : 0;
      const out = { n: hits.length, st: G.specials.status(e), since: G.state.time - at, muls: G.specials.muls(e), cap: G.combat.effects(e).speedCap, accel: e.type.accel, stinky: K.pops().filter((t) => t === 'STINKY!').length, sound: K.sounds.filter((s) => s === 'stink').length };
      const h1 = e.h;
      let turned = 0;
      let drop = 0;
      let last = e.speed;
      let stopped = null;
      e.reload.port = e.reload.star = 0;
      out.speed0 = e.speed;
      out.tryFire = G.fire(e, -1, p);
      T.steps(3.9 - out.since, () => {
        p.speed = 0;
        p.reload.port = p.reload.star = 99;
        turned = Math.max(turned, Math.abs(T.wrap(e.h - h1)));
        drop = Math.max(drop, last - e.speed);
        last = e.speed;
        if (stopped === null && e.speed <= 1e-9) stopped = G.state.time - at;
      });
      out.turned = turned;
      out.drop = drop;
      out.stopped = stopped;
      out.reloads = { ...e.reload };
      out.still = G.specials.status(e).id;
      T.steps(0.25, () => (p.reload.port = p.reload.star = 99));
      out.after = G.specials.status(e);
      e.reload.port = e.reload.star = 0;
      out.firesAgain = G.fire(e, -1, p);
      // a stink inside the clothes-peg window
      G.place(e, p.x - Math.cos(p.h) * 18, p.z + Math.sin(p.h) * 18, p.h);
      K.watchPops();
      const v2 = T.volley(e, { seconds: 0.8 });
      out.pegged = { n: v2.hits.length, st: G.specials.status(e), pops: K.pops().filter((t) => /Clothes-pegs/.test(t)).length };
      // 10 s after the stink ran out it takes again
      const hold = T.pinner(p, e);
      T.steps(Math.max(0, out.after.immune - 0.8) + 0.3, hold); // (the volley took 0.8 s of it)
      const v3 = T.volley(e, { seconds: 0.8 });
      out.again = { n: v3.hits.length, st: G.specials.status(e) };
      G.capture.escape(e);
      return out;
    });
    await liveQuiet();
    stink.live = await kp.evaluate(() => T.liveLog());
    check(stink.n >= 1 && stink.st.id === 'stink' && stink.st.max === 4 && stink.cap === 0 && stink.muls.noFire === true && stink.tryFire === false && stink.reloads.port === 0 && stink.reloads.star === 0 && stink.turned === 0 && stink.still === 'stink',
      `kraken status: STINKY: her speed cap is 0, she can't turn and fires nothing for 4 s with her guns loaded and you on her beam (${J({ st: stink.st, cap: stink.cap, tryFire: stink.tryFire, reloads: stink.reloads, turned: stink.turned })})`);
    check(stink.speed0 > 0.5 && near(stink.drop, (2 * stink.accel) / 120, 1e-9) && stink.stopped !== null && stink.stopped <= stink.speed0 / (2 * stink.accel) + stink.since + 0.02,
      `kraken status: a stinky ship coasts to a stop at 2 × her accel (${r2(stink.speed0)} u/s, ${(stink.drop * 120).toFixed(2)} u/s², stopped ${r2(stink.stopped)} s after the hit)`);
    check(stink.after.id === null && near(stink.after.immune, 10, 0.3) && stink.firesAgain === true && stink.pegged.n >= 1 && stink.pegged.st.id === null && stink.pegged.pops >= 1 && stink.again.n >= 1 && stink.again.st.id === 'stink',
      `kraken status: after 4 s she sails and fires again, with 10 s of clothes-pegs ("Clothes-pegs!" and no stink then); after them a stink takes again (${J({ after: stink.after, pegged: stink.pegged, again: stink.again.st.id })})`);
    check(stink.stinky === 1 && stink.sound === 1 && stink.live.includes("The Privateer Brig stinks! She can't move"),
      `kraken status: STINKY! pops once, the stink sound plays once, and it is read out (${J({ pops: stink.stinky, sounds: stink.sound, live: stink.live })})`);

    // Fire on a stinky ship: KA-BOOM! +15 at once (on top of the hull hits), the stink ends (clothes-pegs start) and
    // she burns; a soft flash, the blast sound.
    await liveQuiet();
    const boom = await ev(kp, async () => {
      const G = window.__game;
      const e = await window.__setup('privateer', 18, 'stink');
      T.volley(e, { seconds: 0.8 });
      const before = G.specials.status(e).id;
      G.combat.setAmmo('fire');
      K.watchPops();
      K.spySounds();
      const hp0 = e.hp;
      const v = T.volley(e, { seconds: 0.8 });
      const hull = v.hits.reduce((a, l) => a + l.dmg, 0);
      const flash = document.getElementById('screen-flash');
      const out = { before, n: v.hits.length, st: G.specials.status(e), ticks: e.burnTicks, lost: hp0 - e.hp, hull, flash: !flash.classList.contains('hidden') && flash.classList.contains('on'), kaboom: K.popsNow().filter((p) => p.text === 'KA-BOOM!').map((p) => p.cls), blast: K.sounds.filter((s) => s === 'blast').length };
      out.extra = Math.round((out.lost - hull - (18 - out.ticks)) * 1000) / 1000;
      G.capture.escape(e);
      return out;
    });
    await liveQuiet();
    boom.live = await kp.evaluate(() => T.liveLog());
    check(boom.before === 'stink' && boom.n >= 1 && boom.extra === 15 && boom.st.id === 'fire' && near(boom.st.immune, 10, 0.5) && boom.flash && boom.kaboom.length === 1 && /pop-kaboom/.test(boom.kaboom[0]) && boom.blast === 1 && boom.live.some((l) => /KA-BOOM! The Privateer Brig's stink cloud blew up/.test(l)),
      `kraken status: Fire on a stinky ship: KA-BOOM! +${boom.extra} at once, the stink ends with clothes-pegs on and she burns; a flash, the blast, read out (${J(boom)})`);

    // Frost on a burning ship: FIRE OUT! SSSS!, the fire is out (no more burn) and the frost takes hold.
    const out = await ev(kp, async () => {
      const G = window.__game;
      const e = await window.__setup('privateer', 18, 'fire');
      const p = G.player;
      T.volley(e, { seconds: 0.8 });
      const before = { id: G.specials.status(e).id, ticks: e.burnTicks };
      G.combat.setAmmo('frost');
      K.watchPops();
      K.spySounds();
      const v = T.volley(e, { seconds: 0.8 });
      const r = { before, n: v.hits.length, st: G.specials.status(e).id, ticks: e.burnTicks, pops: K.pops().filter((t) => /FIRE OUT/.test(t)), sizzle: K.sounds.filter((s) => s === 'sizzle').length };
      const hp = e.hp;
      T.steps(2, T.pinner(p, e));
      r.burntAfter = hp - e.hp;
      G.capture.escape(e);
      return r;
    });
    check(out.before.id === 'fire' && out.before.ticks > 0 && out.n >= 1 && out.st === 'frost' && out.ticks === 0 && out.burntAfter === 0 && J(out.pops) === '["FIRE OUT! SSSS!"]' && out.sizzle === 1,
      `kraken status: Frost on a burning ship: FIRE OUT! SSSS!, the sizzle, the burn stops and she is frozen (${J(out)})`);

    await closeK(ctx);
  });

  // ------------------------------------------------------------------------ kraken: bosses and the immunities
  await section('kraken-bosses', async () => {
    const { ctx, page: kp } = await statusPage('kraken-bosses');
    const liveQuiet = () => kp.evaluate(() => T.liveQuiet());
    // Bosses shake a status off twice as fast (frost 2.5 s + 1 a volley, at most 4; fire 3 s; stink 2 s, then 20 s
    // of clothes-pegs); the Molten Maw is immune to fire, the Phantom to stink: IMMUNE! and why, read out.
    const boss = await ev(kp, async () => {
      const G = window.__game;
      const out = {};
      let e = await window.__setup('inkheart', 22, 'frost');
      const vol = [];
      for (let k = 0; k < 6; k++) {
        const v = T.volley(e, { seconds: 0.6 });
        const at = v.hits.length ? v.hits[0].t : 0;
        const st = G.specials.status(e);
        vol.push({ n: v.hits.length, at, left: st.t + (G.state.time - at), max: st.max, id: st.id });
      }
      out.frost = vol;
      G.state.mode = 'paused';
      await T.redraw();
      const bs = document.getElementById('boss-status');
      out.badge = { shown: T.shown('boss-status'), status: bs.dataset.status, text: bs.textContent.replace(/\s+/g, ' ').trim(), left: Number(bs.style.getPropertyValue('--left')) };
      G.state.mode = 'playing';
      G.capture.escape(e);
      e = await window.__setup('phantom', 22, 'fire');
      const hp0 = e.hp;
      const v = T.volley(e, { seconds: 0.8 });
      const hull = v.hits.reduce((a, l) => a + l.dmg, 0);
      const at = v.hits.length ? v.hits[0].t : 0;
      out.fire = { n: v.hits.length, st: G.specials.status(e), since: G.state.time - at };
      T.steps(3.5, T.pinner(G.player, e));
      out.fire.total = Math.round((hp0 - hull - e.hp) * 1000) / 1000;
      out.fire.after = G.specials.status(e).id;
      G.capture.escape(e);
      e = await window.__setup('inferno', 22, 'stink');
      const v2 = T.volley(e, { seconds: 0.8 });
      const at2 = v2.hits.length ? v2.hits[0].t : 0;
      out.stink = { n: v2.hits.length, st: G.specials.status(e), since: G.state.time - at2 };
      T.steps(2, T.pinner(G.player, e));
      out.stink.after = G.specials.status(e);
      G.capture.escape(e);
      return out;
    });
    let bwant = 2.5;
    const bossFrost = boss.frost.every((v, k) => {
      if (k > 0) bwant = Math.min(4, bwant - (v.at - boss.frost[k - 1].at) + 1);
      return v.n >= 1 && v.id === 'frost' && near(v.left, bwant, 0.02);
    });
    check(bossFrost && boss.frost.some((v) => near(v.left, 4, 0.02)) && boss.frost[0].max === 2.5,
      `kraken status: a boss (the Inkheart) stays FROZEN 2.5 s, + 1 s a volley, at most 4 (${J(boss.frost.map((v) => r2(v.left)))})`);
    check(boss.badge.shown && boss.badge.status === 'frost' && boss.badge.text === 'FROZEN' && boss.badge.left > 0 && boss.badge.left <= 1,
      `kraken status: the boss bar shows her status badge: shape and word (${J(boss.badge)})`);
    check(boss.fire.n >= 1 && boss.fire.st.id === 'fire' && boss.fire.st.max === 3 && near(boss.fire.st.t + boss.fire.since, 3, 0.02) && boss.fire.total === 9 && boss.fire.after === null,
      `kraken status: a boss (the Phantom) burns for 3 s: 9 hp (${J(boss.fire)})`);
    check(boss.stink.n >= 1 && boss.stink.st.id === 'stink' && boss.stink.st.max === 2 && near(boss.stink.st.t + boss.stink.since, 2, 0.02) && boss.stink.after.id === null && near(boss.stink.after.immune, 20 - boss.stink.since, 0.05),
      `kraken status: a boss (the Molten Maw) stinks for 2 s, then 20 s of clothes-pegs (${J(boss.stink)})`);
    await liveQuiet();
    const immune = await ev(kp, async () => {
      const G = window.__game;
      const out = {};
      let e = await window.__setup('inferno', 22, 'fire');
      let v = T.volley(e, { seconds: 0.8 });
      out.maw = { n: v.hits.length, st: G.specials.status(e), ticks: e.burnTicks, pops: K.popsNow().filter((p) => p.text === 'IMMUNE!').map((p) => p.cls) };
      G.capture.escape(e);
      return out;
    });
    await liveQuiet();
    immune.mawLive = await kp.evaluate(() => T.liveLog());
    const immune2 = await ev(kp, async () => {
      const G = window.__game;
      const e = await window.__setup('phantom', 22, 'stink');
      const v = T.volley(e, { seconds: 0.8 });
      const r = { n: v.hits.length, st: G.specials.status(e), pops: K.popsNow().filter((p) => p.text === 'IMMUNE!').map((p) => p.cls) };
      G.capture.escape(e);
      return r;
    });
    await liveQuiet();
    immune2.live = await kp.evaluate(() => T.liveLog());
    check(immune.maw.n >= 1 && immune.maw.st.id === null && immune.maw.ticks === 0 && immune.maw.pops.length === 1 && /pop-keep/.test(immune.maw.pops[0]) && immune.mawLive.includes('The Maw laughs at fire!'),
      `kraken status: the Molten Maw shrugs off Fire shot: no burn, IMMUNE! (never dropped from a busy screen) and "The Maw laughs at fire!" (${J(immune.maw)} ${J(immune.mawLive)})`);
    check(immune2.n >= 1 && immune2.st.id === null && immune2.pops.length === 1 && /pop-keep/.test(immune2.pops[0]) && immune2.live.includes("Ghosts can't smell!"),
      `kraken status: the Phantom Galleon shrugs off Stink shot: IMMUNE! and "Ghosts can't smell!" (${J(immune2)})`);

    await closeK(ctx);
  });

  // --------------------------------------------------------------------- kraken: what the statuses look like
  await section('kraken-look', async () => {
    const { ctx, page: kp } = await statusPage('kraken-look');
    // What it looks like: flames, ice and the stink cloud on three ships at once (statusfx: at most 8 draw calls),
    // their tags' status badges with the time dots, and all of it gone when the ships are.
    const look = await ev(kp, async () => {
      const G = window.__game;
      const p = T.level(1);
      G.specials.setLoads({ fire: 9, frost: 9, stink: 9 });
      G.combat.forceCrit('none');
      // each gets her shot alone on your starboard beam (the others parked ahead, out of the line of fire), then the
      // three are shown together
      const spots = [[-9, 21, 0.9], [2, 29, -0.5], [10, 21, -1.2]]; // (ahead, where the chase camera sees them)
      const ships = ['fire', 'frost', 'stink'].map((id, k) => [id, T.spawn(k === 1 ? 'corsair' : 'privateer', 18, 60 + 20 * k, 0)]);
      for (const [id, e] of ships) {
        G.combat.setAmmo(id);
        T.place(e, 18, 0, 0);
        T.volley(e, { seconds: 0.8 });
        T.place(e, 18, 60, 0);
      }
      ships.forEach(([, e], k) => T.place(e, ...spots[k]));
      const hold = T.pinner(p, ...ships.map(([, e]) => e));
      G.state.bannerTimer = 0;
      await K.play(0.6, hold);
      G.state.mode = 'paused';
      document.getElementById('banner').classList.add('hidden'); // (the level's banner would hide them in the picture)
      await T.redraw();
      const out = { fx: G.specials.fx(), tags: ships.map(([id, e]) => ({ want: id, st: G.specials.status(e).id, tag: (G.tagInfo(e) || {}).status })) };
      window.__lookShips = ships.map(([, e]) => e);
      return out;
    });
    await snap(kp, 'kraken-statuses.png');
    const gone = await ev(kp, async () => {
      const G = window.__game;
      for (const e of window.__lookShips) G.capture.escape(e);
      await K.play(0.5);
      G.state.mode = 'paused';
      await T.redraw();
      return G.specials.fx();
    });
    const f = look.fx || {};
    check(f.flames > 0 && f.chars >= 0 && f.icicles > 0 && f.plates > 0 && f.puffs > 0 && f.lines > 0 && f.calls >= 3 && f.calls <= 8 && gone && gone.calls === 0 && gone.flames === 0 && gone.icicles === 0 && gone.puffs === 0,
      `kraken status: statusfx draws flames, ice and the stink cloud on three ships in ${f.calls} draw calls (≤ 8), and nothing once they are gone (${J({ look: look.fx, gone })})`);
    check(look.tags.every((t) => t.st === t.want && t.tag && t.tag.id === t.want && t.tag.dots >= 1 && t.tag.dots <= 8),
      `kraken status: each tag shows her status badge with its ring of time dots (${J(look.tags)})`);
    await closeK(ctx);
  });

  // ------------------------------------------------------------------------------- kraken: the Iron Turtle's armour
  await section('kraken-armour', async () => {
    const { ctx, page: kp } = await openK({ label: 'kraken-armour' });
    // Beam hits × 0.5 with CLANG! (once a volley) and its clang; a stern rake full × 2; a crit full × 1.75; a Fire
    // shot's ball × 0.7 × 0.5 but her burn in full (18), and KA-BOOM's +15 in full.
    const arm = await ev(kp, async () => {
      const G = window.__game;
      const out = {};
      const shoot = async (turn, ammo, crit) => {
        const p = T.level(1);
        G.specials.setLoads({ fire: 9, frost: 9, stink: 9 });
        G.combat.setAmmo(ammo);
        const e = T.spawn('ironclad', 18, 0, turn);
        await K.play(1.1, T.pinner(p, e));
        K.watchPops();
        K.spySounds();
        G.combat.forceCrit(crit);
        const v = T.volley(e, { seconds: 0.8 });
        G.combat.forceCrit('none');
        return { e, v, r: { hits: v.hits.map((l) => [l.dmg, l.rangeMul, l.aspect, l.crit]), dhp: v.dhp, clang: K.popsNow().filter((p) => p.text === 'CLANG!').length, keep: K.popsNow().filter((p) => p.text === 'CLANG!').every((p) => /pop-keep/.test(p.cls)), clangSfx: K.sounds.filter((s) => s === 'clang').length } };
      };
      out.beam = (await shoot(0, 'round', 'none')).r;
      out.stern = (await shoot(-Math.PI / 2, 'round', 'none')).r;
      out.crit = (await shoot(0, 'round', 'crit')).r;
      const f = await shoot(0, 'fire', 'none');
      const hull = f.v.hits.reduce((a, l) => a + l.dmg, 0);
      const hp0 = f.e.hp + f.v.dhp;
      T.steps(6.5, T.pinner(G.player, f.e));
      out.fire = { ...f.r, burn: Math.round((hp0 - hull - f.e.hp) * 1000) / 1000 };
      const s = await shoot(0, 'stink', 'none');
      G.combat.setAmmo('fire');
      const hp1 = s.e.hp;
      const k = T.volley(s.e, { seconds: 0.8 });
      const hull2 = k.hits.reduce((a, l) => a + l.dmg, 0);
      out.kaboom = { hits: k.hits.map((l) => [l.dmg, l.rangeMul]), extra: Math.round((hp1 - s.e.hp - hull2 - (18 - s.e.burnTicks)) * 1000) / 1000, st: G.specials.status(s.e).id };
      return out;
    });
    const each = (r, f) => r.hits.length === 3 && r.hits.every(([d, m]) => near(d, f * m, 1e-9));
    check(each(arm.beam, 5) && arm.beam.hits.every((h) => h[2] === null) && arm.beam.clang === 1 && arm.beam.keep && arm.beam.clangSfx === 1,
      `kraken armour: an Iron Turtle takes beam hits at half (10 -> 5 a ball), CLANG! once a volley (never dropped from a busy screen) and its clang (${J(arm.beam)})`);
    check(each(arm.stern, 20) && arm.stern.hits.every((h) => h[2] === 'stern') && arm.stern.clang === 0 && each(arm.crit, 17.5) && arm.crit.clang === 0,
      `kraken armour: a stern rake hits her in full (× 2 = 20 a ball) and so does a crit (× 1.75), no CLANG! (${J({ stern: arm.stern, crit: arm.crit })})`);
    check(each(arm.fire, 3.5) && arm.fire.burn === 18 && arm.kaboom.extra === 15 && arm.kaboom.st === 'fire',
      `kraken armour: a Fire ball is halved on her beam (3.5) but her burn is not (18 hp), nor KA-BOOM's +15 (${J({ fire: arm.fire, kaboom: arm.kaboom })})`);
    await closeK(ctx);
  });

  // ------------------------------------------------------------------------- kraken: hot and stinky boarding
  await section('kraken-board', async () => {
    const { ctx, page: kp } = await openK({ label: 'kraken-board' });
    // A burning ship can't be boarded: G says "Too hot to board! Wait for the fire to go out.", her tag shows the
    // too-hot icon, the Board cell "HOT! n s" (n: the seconds of fire left) and the touch pill "Hot!"; once the fire
    // is out she can be.
    const hot = await ev(kp, async () => {
      const G = window.__game;
      const p = T.level(1);
      G.specials.setLoads({ fire: 9, frost: 9, stink: 9 });
      G.combat.setAmmo('fire');
      G.combat.forceCrit('none');
      const e = T.spawn('privateer', 9, 0, 0);
      const hold = T.pinner(p, e);
      T.volley(e, { seconds: 0.8 });
      const out = { st: G.specials.status(e), why: G.canGrapple(e) };
      K.press('g', 'KeyG');
      out.hint = K.hint();
      out.active = G.boarding.active;
      await K.play(0.05, hold); // (the HUD as it is drawn in play)
      out.n = Math.ceil(G.specials.status(e).t - 1e-9);
      out.cell = T.text('board-tag');
      out.pill = T.text('touch-board');
      out.aria = document.getElementById('touch-board').getAttribute('aria-label');
      out.icon = (G.tagInfo(e) || {}).icon;
      T.steps(6.2, hold);
      out.after = { st: G.specials.status(e).id, why: G.canGrapple(e) };
      await K.play(0.05, hold);
      out.after.cell = T.text('board-tag');
      out.after.icon = (G.tagInfo(e) || {}).icon;
      G.capture.escape(e);
      return out;
    });
    check(hot.st.id === 'fire' && hot.why === 'hot' && hot.hint === 'Too hot to board! Wait for the fire to go out.' && !hot.active,
      `kraken board: G on a burning ship says "${hot.hint}" and throws no hooks (canGrapple: ${hot.why})`);
    check(hot.cell === `HOT! ${hot.n} s` && hot.pill === 'Hot!' && new RegExp(`too hot to board, she burns for ${hot.n} more seconds`).test(hot.aria) && hot.icon === 'hot',
      `kraken board: while she burns the Board cell reads "${hot.cell}", the touch pill "${hot.pill}" ("${hot.aria}") and her tag shows the too-hot icon (${hot.icon})`);
    check(hot.after.st === null && hot.after.why === null && !/HOT/.test(hot.after.cell) && hot.after.icon !== 'hot',
      `kraken board: once her fire is out she can be boarded again (${J(hot.after)})`);

    // A stinky crew fights at grit × 0.75: the odds shown get better ("Stink, then board!"), and those are the odds
    // that resolve: the stink holds still from the grapple to the result.
    const stinky = await ev(kp, async () => {
      const G = window.__game;
      const p = T.level(1);
      G.specials.setLoads({ fire: 9, frost: 9, stink: 9 });
      G.combat.setAmmo('stink');
      G.combat.forceCrit('none');
      const e = T.spawn('privateer', 9, 0, 0);
      G.combat.setCrew(e, 3); // (a crew she will lose to: the boarding ends in a capture)
      T.volley(e, { seconds: 0.8 });
      const st = G.specials.status(e);
      const odds = G.boarding.odds(e);
      const saved = e.status;
      e.status = { id: null, t: 0, max: 0, immune: 0 };
      const plain = G.boarding.odds(e);
      e.status = saved;
      await K.play(0.05, T.pinner(p, e));
      const aria = document.getElementById('touch-board').getAttribute('aria-label');
      const t0 = G.specials.status(e).t;
      K.press('g', 'KeyG');
      const seen = [];
      let n = 0;
      while (G.boarding.active && n < 120 * 10) {
        G.step(1 / 120);
        n++;
        const ph = G.boarding.phase;
        if (ph && G.boarding.active && !e.captured) seen.push([ph, Math.round(G.specials.status(e).t * 1e6) / 1e6]);
      }
      const phases = [...new Set(seen.map((s) => s[0]))];
      const held = [...new Set(seen.map((s) => s[1]))];
      return { st, R: odds.R, plainR: plain.R, label: odds.label, aria, t0: Math.round(t0 * 1e6) / 1e6, phases, held, captured: e.captured, after: G.specials.status(e).id };
    });
    check(stinky.st.id === 'stink' && stinky.R > stinky.plainR && near(stinky.R / stinky.plainR, 4 / 3, 0.02) && /Stink, then board!/.test(stinky.aria),
      `kraken board: a stinky crew fights at × 0.75 grit: the odds shown get better (R ${r2(stinky.plainR)} -> ${r2(stinky.R)}) and the Board button says "Stink, then board!" (${stinky.aria})`);
    check(['hook', 'reel', 'swing', 'brawl'].every((ph) => stinky.phases.includes(ph)) && stinky.held.length === 1 && stinky.held[0] === stinky.t0 && stinky.captured && stinky.after === null,
      `kraken board: the stink holds still (${stinky.held.join(', ')} s left) through ${stinky.phases.join(', ')}, and is gone once she is captured (${J({ t0: stinky.t0, captured: stinky.captured })})`);

    // A fire ship that hasn't struck can't be boarded (her fuse could blow with the hulls glued together): "Too hot to
    // board! Freeze her first.", the too-hot icon on her tag, the Board cell HOT!. Frost puts her fuse out for good and
    // she strikes; then she is taken for 85 gold.
    const fireship = await ev(kp, async () => {
      const G = window.__game;
      const p = T.level(1);
      G.specials.setLoads({ fire: 9, frost: 9, stink: 9 });
      G.combat.forceCrit('none');
      G.combat.setAmmo('frost');
      const e = T.spawn('fireship', 12, 0, 0);
      const hold = T.pinner(p, e);
      await K.play(0.3, hold);
      const out = { why: G.canGrapple(e) };
      K.press('g', 'KeyG');
      out.hint = K.hint();
      out.active = G.boarding.active;
      await K.play(0.05, hold);
      out.cell = T.text('board-tag');
      out.pill = T.text('touch-board');
      out.icon = (G.tagInfo(e) || {}).icon;
      T.volley(e, { seconds: 0.8 });
      out.struck = { surrendered: e.surrendered, st: G.specials.status(e).id, hp: e.hp > 0 };
      out.after = G.canGrapple(e);
      const gold = G.state.gold;
      K.press('g', 'KeyG');
      out.boarding = G.boarding.kind;
      let n = 0;
      while (G.boarding.active && n < 120 * 10) {
        G.step(1 / 120);
        n++;
      }
      out.captured = e.captured;
      out.gold = G.state.gold - gold;
      return out;
    });
    check(fireship.why === 'immune' && fireship.hint === 'Too hot to board! Freeze her first.' && !fireship.active && /^HOT!/.test(fireship.cell) && fireship.pill === 'Hot!' && fireship.icon === 'hot',
      `kraken board: a fire ship can't be boarded until she strikes: "${fireship.hint}", the Board cell "${fireship.cell}", the pill "${fireship.pill}", her tag's too-hot icon (${fireship.icon})`);
    check(fireship.struck.surrendered && fireship.struck.hp && fireship.after === null && fireship.boarding === 'surrender' && fireship.captured && fireship.gold === 85,
      `kraken board: frozen, the fire ship strikes her colours and is taken for 85 gold (${J(fireship)})`);

    // A raider in reach throws its hooks; a stinky one doesn't. One whose hooks already bite drops them when a stink
    // ball hits her (as a cut: 10 s before she tries again).
    const raid = await ev(kp, async () => {
      const G = window.__game;
      const p = T.level(1);
      G.specials.setLoads({ fire: 9, frost: 9, stink: 9 });
      G.combat.forceCrit('none');
      const out = {};
      const tryHooks = (r, s) => {
        G.place(r, p.x - Math.cos(p.h) * 7, p.z + Math.sin(p.h) * 7, p.h);
        r.boardCooldown = 0;
        G.state.boardCooldown = 0;
        let hooked = false;
        T.steps(s, () => {
          p.speed = 0;
          if (G.boarding.active && G.boarding.target === r) hooked = true;
          return !hooked;
        });
        return hooked;
      };
      const plain = T.spawn('raider', 7, 0, 0);
      out.plain = tryHooks(plain, 3.5);
      G.boarding.cancel();
      G.capture.escape(plain);
      const r = T.spawn('raider', 14, 0, 0);
      G.combat.setAmmo('stink');
      T.volley(r, { seconds: 0.8 });
      out.st = G.specials.status(r).id;
      out.stinky = tryHooks(r, 3.0);
      G.boarding.cancel();
      G.capture.escape(r);
      // hooks biting, then a stink ball
      const b = T.spawn('raider', 8, 0, 0);
      b.boardCooldown = 0;
      G.state.boardCooldown = 0;
      out.raid = G.boarding.raid(b);
      T.steps(2, () => G.boarding.phase !== 'threat');
      out.phase = G.boarding.phase;
      K.watchPops();
      p.reload.port = p.reload.star = 0;
      G.combat.setAmmo('stink');
      p.reload.port = p.reload.star = 0;
      out.fired = G.fire(p, 1, b);
      T.steps(1, () => G.balls.some((x) => x.owner === 'player'));
      out.after = { active: G.boarding.active, cut: (G.boarding.last || {}).cut, cooldown: Math.round(b.boardCooldown * 10) / 10, st: G.specials.status(b).id, pops: K.pops().filter((t) => /rope/i.test(t)) };
      G.capture.escape(b);
      return out;
    });
    check(raid.plain === true && raid.st === 'stink' && raid.stinky === false,
      `kraken board: a raider 7 paces off throws her hooks; a stinky one doesn't (${J({ plain: raid.plain, st: raid.st, stinky: raid.stinky })})`);
    check(raid.raid && raid.phase === 'threat' && raid.fired && !raid.after.active && raid.after.cut === 'hit' && raid.after.cooldown >= 9.5 && raid.after.cooldown <= 10 && raid.after.st === 'stink' && raid.after.pops.length >= 1,
      `kraken board: a raider whose hooks bite drops them when a stink ball hits her, 10 s before she tries again (${J(raid.after)})`);

    // Every status goes when she strikes (her fire too: a burn never sinks a prize), is captured or escapes.
    const clear = await ev(kp, async () => {
      const G = window.__game;
      const p = T.level(1);
      G.specials.setLoads({ fire: 9, frost: 9, stink: 9 });
      G.combat.forceCrit('none');
      G.combat.setAmmo('fire');
      const e = T.spawn('privateer', 18, 0, 0);
      T.volley(e, { seconds: 0.8 });
      const out = { before: { st: G.specials.status(e).id, ticks: e.burnTicks } };
      G.capture.strike(e);
      out.struck = { surrendered: e.surrendered, st: G.specials.status(e).id, ticks: e.burnTicks, from: G.specials.burn(e).from };
      const hp = e.hp;
      T.steps(3, T.pinner(p, e));
      out.struck.burnt = hp - e.hp;
      G.capture.take(e);
      out.taken = { captured: e.captured, st: G.specials.status(e).id };
      const f = T.spawn('privateer', 18, 0, 0);
      G.combat.setAmmo('frost');
      T.volley(f, { seconds: 0.8 });
      out.frozen = G.specials.status(f).id;
      G.capture.escape(f);
      out.escaped = { escaped: f.escaped, st: G.specials.status(f).id, speedMul: G.combat.effects(f).speedMul };
      return out;
    });
    check(clear.before.st === 'fire' && clear.before.ticks > 0 && clear.struck.surrendered && clear.struck.st === null && clear.struck.ticks === 0 && clear.struck.burnt === 0 && clear.taken.captured && clear.taken.st === null && clear.frozen === 'frost' && clear.escaped.escaped && clear.escaped.st === null,
      `kraken board: her status goes when she strikes (her fire too: no more hull lost), when she is captured and when she escapes (${J(clear)})`);

    // A burn (here a POWDER KEG crit's) holds still on the two ships glued in a boarding (swing to result).
    const glued = await ev(kp, async () => {
      const G = window.__game;
      const p = T.level(1);
      G.combat.setAmmo('round');
      const e = T.spawn('privateer', 9, 0, 0);
      const guns = p.type.guns;
      p.type.guns = 1;
      G.combat.forceCrit('keg');
      T.volley(e, { seconds: 0.6 });
      G.combat.forceCrit('none');
      p.type.guns = guns;
      const out = { burn: G.specials.burn(e) };
      K.press('g', 'KeyG');
      const seen = [];
      let n = 0;
      while (G.boarding.active && n < 120 * 10) {
        G.step(1 / 120);
        n++;
        if (G.boarding.active) seen.push([G.boarding.phase, e.burnTicks]);
      }
      const glue = seen.filter(([ph]) => ['swing', 'brawl', 'result'].includes(ph)).map((s) => s[1]);
      const loose = seen.filter(([ph]) => ['hook', 'reel'].includes(ph)).map((s) => s[1]);
      out.glue = [...new Set(glue)];
      out.loose = [loose[0], loose[loose.length - 1]];
      out.phases = [...new Set(seen.map((s) => s[0]))];
      return out;
    });
    check(glued.burn.from === 'keg' && glued.burn.ticks > 0 && glued.phases.includes('swing') && glued.phases.includes('result') && glued.glue.length === 1 && glued.loose[0] > glued.loose[1],
      `kraken board: a burn ticks on while the hooks fly and she is reeled in, and holds still while the ships are glued (swing to result: ${glued.glue.join(', ')} hp left) (${J(glued)})`);
    await closeK(ctx);
  });

  // ---------------------------------------------------------------- kraken: the rudder, the slide and the wheel
  await section('kraken-steer', async () => {
    const { ctx, page: kp } = await openK({ label: 'kraken-steer' });
    // The Big rudder & wheel (§3.1): a stock ship turns at 35 % of her full rate at a standstill (0.49 rad/s); tiers
    // 1-3 at 50 / 65 / 80 % (tier 3: 1.29 rad/s), and × 1.05 / 1.1 / 1.15 at full speed. The ship record carries
    // the tier only from 1 up.
    const tiers = await ev(kp, () => {
      const G = window.__game;
      const rows = [];
      for (const t of [0, 1, 2, 3]) {
        const cfg = G.shipConfig;
        if (t) cfg.up.rudder = t;
        else delete cfg.up.rudder;
        G.setShipConfig(cfg);
        const p = T.level(1);
        p.speed = 0;
        const slow = G.turn.rate;
        const h0 = p.h;
        G.input.left = true; // a held A for 1 s at a standstill
        T.steps(1);
        G.input.left = false;
        const turned = Math.abs(T.wrap(p.h - h0));
        p.speed = p.type.maxSpeed;
        rows.push({ t, slow, fast: G.turn.rate, turned, saved: localStorage.getItem('pirates-ahoy-ship') });
      }
      const cfg = G.shipConfig;
      delete cfg.up.rudder;
      G.setShipConfig(cfg);
      return rows;
    });
    const MUL = [1, 1.05, 1.1, 1.15];
    const LOW = [0.35, 0.5, 0.65, 0.8];
    const base = tiers[0].fast;
    check(tiers.every((r, t) => near(r.fast, base * MUL[t], 1e-9) && near(r.slow, base * MUL[t] * LOW[t], 1e-9) && near(r.turned, r.slow, 1e-6)) && near(tiers[0].slow, 0.49, 0.002) && near(tiers[3].slow, 1.288, 0.002),
      `kraken steer: the rudder tiers turn her at ${tiers.map((r) => r2(r.slow)).join(' / ')} rad/s at a standstill and ${tiers.map((r) => r2(r.fast)).join(' / ')} at full speed (35 / 50 / 65 / 80 %; × 1 / 1.05 / 1.1 / 1.15)`);
    check(!/rudder/.test(tiers[0].saved) && tiers.slice(1).every((r) => new RegExp(`"rudder":${r.t}\\}`).test(r.saved)),
      `kraken steer: the ship record names the rudder only from tier 1 up (${J(tiers.map((r) => r.saved))})`);

    // input.steer (a slide or the wheel) turns in proportion and wins over a held key while it lasts; the keys and
    // buttons still give ±1 and input.left / input.right stay plain booleans.
    const steer = await ev(kp, () => {
      const G = window.__game;
      const p = T.level(1);
      p.speed = 0;
      const turnFor = (fn) => {
        const h0 = p.h;
        fn(true);
        T.steps(1);
        fn(false);
        return T.wrap(p.h - h0);
      };
      const full = turnFor((on) => (G.input.left = on));
      const half = turnFor((on) => G.steer(on ? 0.5 : null));
      const right = turnFor((on) => G.steer(on ? -0.25 : null));
      G.input.left = true;
      G.steer(-0.3);
      const both = G.turn.input;
      G.steer(null);
      const keys = G.turn.input;
      G.input.left = false;
      return { full, half, right, both, keys, bools: typeof G.input.left === 'boolean' && typeof G.input.right === 'boolean' };
    });
    check(steer.full > 0.4 && near(steer.half / steer.full, 0.5, 1e-6) && near(steer.right / steer.full, -0.25, 1e-6) && near(steer.both, -0.3, 1e-9) && steer.keys === 1 && steer.bools,
      `kraken steer: input.steer 0.5 turns her half as fast as a held key, -0.25 a quarter the other way, and it wins over a held key while it lasts (${J(steer)})`);

    // A lava bomb is lobbed where you will be, following your turn now (playerTurn(): a slide too). Math.random
    // pinned to 0: the warning's shortest, no scatter.
    const bomb = await ev(kp, () => {
      const G = window.__game;
      const p = T.level(3);
      p.speed = 8;
      const out = {};
      const random = Math.random;
      try {
        Math.random = () => 0;
        for (const [name, set] of [['straight', () => {}], ['slide', () => G.steer(0.5)], ['key', () => (G.input.left = true)]]) {
          set();
          const w = G.turn.input * G.turn.rate;
          const b = G.launchBomb();
          const tt = b.T * 0.6;
          let px;
          let pz;
          if (Math.abs(w) < 1e-4) {
            px = p.x + Math.sin(p.h) * p.speed * tt;
            pz = p.z + Math.cos(p.h) * p.speed * tt;
          } else {
            px = p.x + (p.speed / w) * (Math.cos(p.h) - Math.cos(p.h + w * tt));
            pz = p.z + (p.speed / w) * (Math.sin(p.h + w * tt) - Math.sin(p.h));
          }
          out[name] = { w: Math.round(w * 1e4) / 1e4, miss: Math.round(Math.hypot(b.tx - px, b.tz - pz) * 1e6) / 1e6 };
          G.steer(null);
          G.input.left = false;
        }
      } finally {
        Math.random = random;
      }
      T.level(1); // (its bombs go with it)
      return out;
    });
    check(bomb.straight.w === 0 && bomb.slide.w > 0 && near(bomb.key.w, 2 * bomb.slide.w, 1e-3) && Object.values(bomb).every((b) => b.miss < 1e-6),
      `kraken steer: a lava bomb lands where your turn takes you, a thumb slide's half turn too (${J(bomb)})`);
    await closeK(ctx);

    // On a phone: slide a thumb on the steering pad. A plain hold (or a wobble under 12 px) is a full turn as before;
    // past 12 px the turn follows the thumb (r = r0 + dx / 56), the rudder needle shows it, letting go ends it.
    const { ctx: tctx, page: tp } = await openK({ width: 390, height: 844, touch: true, label: 'kraken-steer touch' });
    const slide = await ev(tp, () => {
      const G = window.__game;
      T.level(1);
      const pad = document.querySelector('#touch .pad.left');
      const L = pad.querySelector('[data-hold="left"]');
      const R = pad.querySelector('[data-hold="right"]');
      const at = (el) => {
        const b = el.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      };
      const ptr = (el, type, x, y, id) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }));
      const needle = () => ({ shown: T.shown('steer-needle'), turn: document.getElementById('steer-needle').style.getPropertyValue('--turn') });
      const out = {};
      const a = at(L);
      ptr(L, 'pointerdown', a.x, a.y, 11);
      out.hold = { input: G.turn.input, steer: G.input.steer, left: G.input.left };
      ptr(L, 'pointermove', a.x + 8, a.y, 11);
      out.small = { input: G.turn.input, steer: G.input.steer };
      ptr(L, 'pointermove', a.x + 28, a.y, 11);
      out.slide = { input: G.turn.input, steer: G.input.steer, left: G.input.left, needle: needle() };
      ptr(L, 'pointermove', a.x + 300, a.y, 11);
      out.far = G.input.steer;
      ptr(L, 'pointerup', a.x + 300, a.y, 11);
      out.up = { steer: G.input.steer, left: G.input.left, input: G.turn.input, needle: needle() };
      const b = at(R);
      ptr(R, 'pointerdown', b.x, b.y, 12);
      ptr(R, 'pointermove', b.x - 42, b.y, 12);
      out.fromRight = G.input.steer;
      ptr(R, 'pointerup', b.x - 42, b.y, 12);
      const m = { x: (a.x + b.x) / 2, y: a.y };
      ptr(pad, 'pointerdown', m.x, m.y, 13);
      ptr(pad, 'pointermove', m.x - 14, m.y, 13);
      out.middle = G.input.steer;
      ptr(pad, 'pointerup', m.x - 14, m.y, 13);
      out.afterMiddle = G.input.steer;
      return out;
    });
    check(slide.hold.input === 1 && slide.hold.steer === null && slide.hold.left === true && slide.small.input === 1 && slide.small.steer === null,
      `kraken steer: a thumb held on ◀ (or wobbling under 12 px) turns her fully, as before (${J({ hold: slide.hold, small: slide.small })})`);
    check(near(slide.slide.steer, 0.5, 1e-9) && near(slide.slide.input, 0.5, 1e-9) && slide.slide.left === true && slide.slide.needle.shown && slide.slide.needle.turn === '-0.5' && slide.far === -1 && slide.up.steer === null && slide.up.left === false && slide.up.input === 0 && !slide.up.needle.shown,
      `kraken steer: sliding 28 px right from ◀ eases the turn to half (steer ${slide.slide.steer}, the needle at ${slide.slide.needle.turn}), further turns right (${slide.far}), letting go ends it (${J(slide.up)})`);
    check(near(slide.fromRight, -0.25, 1e-9) && near(slide.middle, 0.25, 1e-9) && slide.afterMiddle === null,
      `kraken steer: from ▶ 42 px left is a quarter turn right (${slide.fromRight}); a thumb landing between the arrows slides from the middle (${slide.middle})`);

    // The ship's wheel (the setting): it replaces ◀ ▶; drag it sideways (60 px a full turn, a 0.1 dead zone; it turns
    // 120° at most and springs back); the keys steer as before. The setting is saved and comes back at the next visit.
    const wheel = await ev(tp, async () => {
      const G = window.__game;
      T.level(1);
      const set = G.settings.set({ v: 1, steer: 'wheel' });
      const saved = localStorage.getItem('pirates-ahoy-settings');
      G.state.mode = 'paused';
      await T.redraw();
      G.state.mode = 'playing';
      const w = document.getElementById('touch-wheel');
      const L = document.querySelector('[data-hold="left"]');
      const box = w.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const ptr = (type, x) => w.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 21, pointerType: 'touch', isPrimary: true, clientX: x, clientY: cy }));
      const out = { set: set.steer, saved, shown: T.shown('touch-wheel'), size: Math.round(box.width), arrows: Math.round(L.getBoundingClientRect().width) };
      ptr('pointerdown', cx);
      ptr('pointermove', cx + 3);
      out.dead = G.input.steer;
      ptr('pointermove', cx + 30);
      out.half = { steer: G.input.steer, input: G.turn.input, rot: w.style.transform };
      ptr('pointermove', cx - 90);
      out.full = { steer: G.input.steer, rot: w.style.transform };
      ptr('pointerup', cx - 90);
      out.up = { steer: G.input.steer, rot: w.style.transform, spring: /0\.15s/.test(w.style.transition) };
      T.key('a', 'KeyA');
      out.key = { left: G.input.left, input: G.turn.input };
      T.key('a', 'KeyA', { type: 'keyup' });
      out.keyUp = { left: G.input.left, input: G.turn.input };
      return out;
    });
    check(wheel.set === 'wheel' && wheel.saved === '{"v":1,"steer":"wheel"}' && wheel.shown && wheel.size >= 96 && wheel.arrows <= 1,
      `kraken steer: the wheel setting is saved and the ship's wheel (${wheel.size} px) takes the arrows' place (${J({ saved: wheel.saved, arrows: wheel.arrows })})`);
    check(wheel.dead === 0 && near(wheel.half.steer, -0.5, 1e-9) && near(wheel.half.input, -0.5, 1e-9) && wheel.half.rot === 'rotate(60deg)' && wheel.full.steer === 1 && wheel.full.rot === 'rotate(-120deg)' && wheel.up.steer === null && wheel.up.rot === 'rotate(0deg)' && wheel.up.spring,
      `kraken steer: the wheel: a 3 px nudge is in the dead zone, 30 px right is a half turn right (60°), 90 px left a full turn left (-120°, at most), and it springs back when let go (${J({ dead: wheel.dead, half: wheel.half, full: wheel.full, up: wheel.up })})`);
    check(wheel.key.left === true && wheel.key.input === 1 && wheel.keyUp.left === false && wheel.keyUp.input === 0,
      `kraken steer: with the wheel shown the keys steer as before (${J({ key: wheel.key, up: wheel.keyUp })})`);
    await reloadK(tp);
    const again = await ev(tp, async () => {
      const G = window.__game;
      T.level(1);
      G.state.mode = 'paused';
      await T.redraw();
      return { steer: G.settings.get().steer, wheel: T.shown('touch-wheel') };
    });
    check(again.steer === 'wheel' && again.wheel, `kraken steer: the next visit starts with the ship's wheel (${J(again)})`);
    await closeK(tctx);

    // Pause ▸ Steering on a phone, at the five touch sizes: the toggle is the last choice, at least 44 px, with its
    // New! badge inside it the first time; the panel doesn't scroll. A tap saves the wheel and the wheel shows when
    // you resume; the hint bubble keeps clear of it. On a desktop there is no toggle.
    for (const [w, h] of [[390, 844], [360, 640], [320, 480], [568, 320], [844, 390]]) {
      const { ctx: pc, page: pp } = await openK({ width: w, height: h, touch: true, label: `kraken-steer ${w}x${h}`, store: { ...KSTORE, 'pirates-ahoy-tips': '255' } });
      await ev(pp, () => {
        T.level(1);
        window.__game.togglePause();
      });
      await frames(pp, 2);
      const pz = await pp.evaluate(() => {
        const btn = document.getElementById('steer-mode-btn');
        const panel = document.querySelector('#pause-screen .panel');
        const R = (el) => {
          const b = el.getBoundingClientRect();
          return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height };
        };
        const choices = [...document.querySelectorAll('#pause-choices button')].filter((b) => b.offsetParent).map((b) => b.id);
        const badge = btn.querySelector('.new-badge');
        const box = R(btn);
        const hit = document.elementFromPoint(box.l + box.w / 2, box.t + box.h / 2);
        return { choices, box, badge: badge && !badge.classList.contains('hidden') && badge.getClientRects().length ? R(badge) : null, pressed: btn.getAttribute('aria-pressed'), scroll: panel.scrollHeight > panel.clientHeight + 1, H: innerHeight, uncovered: !!hit && (hit === btn || btn.contains(hit)), tip: !!(window.__game.tips & 32768) };
      });
      check(pz.choices.join() === 'resume-btn,quit-dock-btn,quit-menu-btn,steer-mode-btn' && pz.box.h >= 44 && pz.box.b <= pz.H && pz.uncovered && !pz.scroll && pz.badge && pz.badge.l >= pz.box.l && pz.badge.r <= pz.box.r && pz.badge.t >= pz.box.t && pz.badge.b <= pz.box.b && pz.tip && pz.pressed === 'false',
        `kraken steer ${w}x${h}: Pause lists Steering last (${Math.round(pz.box.w)}x${Math.round(pz.box.h)} px, uncovered), its New! badge inside it the first time, no panel scroll (${J({ choices: pz.choices, badge: !!pz.badge, scroll: pz.scroll, tip: pz.tip })})`);
      await pp.tap('#steer-mode-btn');
      const set = await pp.evaluate(() => {
        const btn = document.getElementById('steer-mode-btn');
        return { saved: localStorage.getItem('pirates-ahoy-settings'), text: btn.textContent.replace(/\s+/g, ' '), pressed: btn.getAttribute('aria-pressed'), focus: document.activeElement && document.activeElement.id };
      });
      const resumed = await ev(pp, async () => {
        const G = window.__game;
        G.togglePause();
        G.state.mode = 'playing';
        G.combat.setAmmo('round');
        G.state.unlocked = 7;
        G.combat.setAmmo('chain'); // (says what chain shot does in the hint bubble)
        G.state.mode = 'paused';
        await T.redraw();
        const r = document.getElementById('hint').getBoundingClientRect();
        const pads = [...document.querySelectorAll('#touch .pad')].map((p) => p.getBoundingClientRect()).filter((p) => p.width && p.height);
        const wheel = document.getElementById('touch-wheel').getBoundingClientRect();
        const hits = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
        return { wheel: T.shown('touch-wheel'), hint: T.shown('hint'), clear: !pads.some((p) => hits(r, p)) && !hits(r, wheel) };
      });
      check(set.saved === '{"v":1,"steer":"wheel"}' && /Steering: Ship.s wheel/.test(set.text) && set.pressed === 'true' && set.focus === 'steer-mode-btn' && resumed.wheel && resumed.hint && resumed.clear,
        `kraken steer ${w}x${h}: a tap on the toggle saves the ship's wheel (aria-pressed, focus kept); resumed, the wheel shows and the hint bubble keeps clear of it (${J({ set, resumed })})`);
      await closeK(pc);
    }
    const { ctx: dc, page: dp } = await openK({ label: 'kraken-steer desktop', store: { ...KSTORE, 'pirates-ahoy-tips': '255', 'pirates-ahoy-settings': '{"v":1,"steer":"wheel"}' } });
    const desk = await ev(dp, () => {
      T.level(1);
      window.__game.togglePause();
      return { choices: [...document.querySelectorAll('#pause-choices button')].filter((b) => b.offsetParent).map((b) => b.id), tip: !!(window.__game.tips & 32768), wheel: T.shown('touch-wheel') };
    });
    check(desk.choices.join() === 'resume-btn,quit-dock-btn,quit-menu-btn' && !desk.tip && !desk.wheel,
      `kraken steer: a desktop's pause has no Steering toggle (nor its badge), and no wheel shows (${J(desk)})`);
    await closeK(dc);
  });

  // -------------------------------------------------------------------------------- kraken: the touch ammo tray
  await section('kraken-tray', async () => {
    // Tap a button the way a finger does (pointerdown, then pointerup: the game acts on the press).
    const tapIn = `(el) => {
      for (const type of ['pointerdown', 'pointerup']) el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 31, pointerType: 'touch', isPrimary: true }));
    }`;
    // With no recipe owned the Ammo pill cycles exactly as today (no tray).
    const { ctx: nc, page: np } = await openK({ width: 390, height: 844, touch: true, label: 'kraken-tray none', store: { ...KSTORE, 'pirates-ahoy-powder': OWN(0, 0, 0) } });
    await ev(np, () => T.level(1));
    await np.evaluate(() => { window.__game.state.mode = 'playing'; });
    await np.tap('#touch-ammo');
    const none = await np.evaluate(() => {
      const G = window.__game;
      G.state.mode = 'paused';
      return { ammo: G.combat.ammo, tray: G.specials.tray, shown: T.shown('ammo-tray'), expanded: document.getElementById('touch-ammo').getAttribute('aria-expanded') };
    });
    check(none.ammo === 'chain' && !none.tray.open && !none.tray.wanted && !none.shown && none.expanded === null,
      `kraken tray: with no recipe owned a tap on Ammo cycles to the next shot as today, no tray (${J(none)})`);
    await closeK(nc);

    // Fire and Frost owned (Stink on sale, not bought): a tap on Ammo opens the tray (the game runs on); six buttons
    // in the R order, "Fire ×4", the loaded one pressed, Stink disabled with its reason (a tap says it, the tray
    // stays); a tap on Frost loads it and closes the tray.
    const { ctx: tc, page: tp } = await openK({ width: 390, height: 844, touch: true, label: 'kraken-tray', store: { ...KSTORE, 'pirates-ahoy-powder': OWN(1, 1, 0) } });
    await ev(tp, () => T.level(1));
    await tp.evaluate((s) => { window.__tap = eval(s); }, tapIn);
    await tp.evaluate(() => { window.__game.state.mode = 'playing'; });
    const t0 = await tp.evaluate(() => window.__game.state.time);
    await tp.tap('#touch-ammo');
    const opened = await tp.evaluate((t0) => {
      const G = window.__game;
      G.state.mode = 'paused';
      const btns = [...document.querySelectorAll('#ammo-tray button[data-ammo]')];
      const why = (b) => {
        const id = b.getAttribute('aria-describedby');
        return id ? (document.getElementById(id) || {}).textContent || '' : '';
      };
      return {
        open: G.specials.tray.open,
        shown: T.shown('ammo-tray'),
        ran: G.state.time > t0,
        expanded: document.getElementById('touch-ammo').getAttribute('aria-expanded'),
        group: [document.getElementById('ammo-tray').getAttribute('role'), document.getElementById('ammo-tray').getAttribute('aria-label')],
        rows: btns.map((b) => ({ id: b.dataset.ammo, text: b.textContent.replace(/\s+/g, ' ').trim(), label: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed'), disabled: b.getAttribute('aria-disabled'), why: why(b), off: b.classList.contains('off') })),
      };
    }, t0);
    const row = (id) => opened.rows.find((r) => r.id === id) || {};
    check(opened.open && opened.shown && opened.ran && opened.expanded === 'true' && opened.group.join() === 'group,Choose ammo' && opened.rows.map((r) => r.id).join() === 'round,chain,grape,fire,frost,stink',
      `kraken tray: once a recipe is owned a tap on Ammo opens the tray ("Choose ammo", six shots in the R order) and the game runs on (${J({ open: opened.open, expanded: opened.expanded, group: opened.group, ids: opened.rows.map((r) => r.id) })})`);
    check(row('round').pressed === 'true' && row('fire').text === 'Fire ×4' && row('fire').label === 'Fire shot, 4 loads left' && row('fire').disabled === 'false' && row('stink').disabled === 'true' && row('stink').why === 'Buy Stink shot at the Salty Sparrow' && row('stink').off,
      `kraken tray: the loaded shot is pressed, "Fire ×4" ("Fire shot, 4 loads left"), and Stink shot not bought is disabled with its reason and a crossed icon (${J([row('round'), row('fire'), row('stink')])})`);
    const pick = await ev(tp, () => {
      const tap = window.__tap;
      const G = window.__game;
      const out = {};
      // (a frame of the paused game in between closed it: open it again, as the Ammo pill does)
      if (!G.specials.tray.open) tap(document.getElementById('touch-ammo'));
      tap(document.querySelector('#ammo-tray [data-ammo="stink"]'));
      out.stink = { open: G.specials.tray.open, ammo: G.combat.ammo, hint: K.hint() };
      tap(document.querySelector('#ammo-tray [data-ammo="frost"]'));
      out.frost = { open: G.specials.tray.open, ammo: G.combat.ammo, mode: G.state.mode, pill: T.text('touch-ammo') };
      return out;
    });
    await tp.evaluate(() => T.redraw());
    pick.frost.pill = await tp.evaluate(() => T.text('touch-ammo'));
    check(pick.stink.open && pick.stink.ammo === 'round' && pick.stink.hint === 'Buy Stink shot at the Salty Sparrow' && !pick.frost.open && pick.frost.ammo === 'frost' && pick.frost.mode === 'playing' && pick.frost.pill === 'Frost ×4',
      `kraken tray: a tap on a disabled shot says why and keeps the tray open; a tap on Frost loads it and closes the tray, the pill reads "${pick.frost.pill}" (${J(pick)})`);

    // It closes on a fire tap, on a tap anywhere else, and after 3 s of play without a pick; it never pauses. A tray
    // pick drops a queued Fire tap (no load spent).
    const closes = await ev(tp, () => {
      const tap = window.__tap;
      const G = window.__game;
      const p = G.player;
      const pill = document.getElementById('touch-ammo');
      const out = {};
      tap(pill);
      out.reopened = { open: G.specials.tray.open, pressed: document.querySelector('#ammo-tray [data-ammo="frost"]').getAttribute('aria-pressed') };
      p.reload.port = p.reload.star = 0;
      tap(document.querySelector('[data-tap="firePort"]'));
      out.fire = !G.specials.tray.open;
      // (a Fire button worked by the keyboard or a switch: a plain click, no pointer down, closes it too)
      out.fireClick = ['firePort', 'fireStar'].map((side) => {
        tap(pill);
        p.reload.port = p.reload.star = 0;
        document.querySelector(`[data-tap="${side}"]`).click();
        return !G.specials.tray.open;
      });
      tap(pill);
      tap(document.querySelector('[data-tap="sailUp"]'));
      out.elsewhere = !G.specials.tray.open;
      tap(pill);
      const t = G.state.time;
      T.steps(2.9);
      out.at29 = G.specials.tray.open;
      T.steps(0.2);
      out.at31 = G.specials.tray.open;
      out.mode = G.state.mode;
      out.ran = Math.round((G.state.time - t) * 100) / 100;
      // a queued Fire tap, then a pick from the tray
      G.specials.setLoads({ fire: 4, frost: 4, stink: 0 });
      G.combat.setAmmo('frost');
      p.reload.port = 5;
      p.reload.star = 0.3;
      tap(document.querySelector('[data-tap="fireStar"]'));
      out.queued = G.fireQueue.star;
      tap(pill);
      tap(document.querySelector('#ammo-tray [data-ammo="round"]'));
      out.picked = G.combat.ammo;
      out.balls = K.shots(() => T.steps(1)).length;
      out.dropped = !G.fireQueue.star;
      out.loads = G.specials.loads.frost;
      return out;
    });
    check(closes.reopened.open && closes.reopened.pressed === 'true' && closes.fire && closes.fireClick.every(Boolean) && closes.elsewhere && closes.at29 && !closes.at31 && closes.mode === 'playing' && closes.ran === 3.1,
      `kraken tray: the loaded shot shows pressed; a fire tap (or a plain click on Fire) closes the tray, so does a tap elsewhere and 3 s of play without a pick; it never pauses (${J(closes)})`);
    check(closes.queued && closes.picked === 'round' && closes.dropped && closes.balls === 0 && closes.loads === 4,
      `kraken tray: a pick from the tray drops a Fire tap queued while the guns load: nothing fires, no load is spent (${J({ queued: closes.queued, picked: closes.picked, balls: closes.balls, loads: closes.loads })})`);
    await closeK(tc);

    // The layout with the tray open at the touch sizes (§6.2): 2 × 3 in portrait, 3 × 2 in landscape, right-aligned
    // with the act pad and 8 px above it, 44 px buttons on small and short screens, 52 px elsewhere (844x390: 52
    // where it clears the top HUD row, else 44); no tray button over the fire, steering, sail or act pad, the hint
    // bubble or the gun card; no page scroll.
    const trayProbe = () => {
      const R = (el) => {
        if (!el || !el.getClientRects().length) return null;
        const b = el.getBoundingClientRect();
        return b.width && b.height ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null;
      };
      const tray = [...document.querySelectorAll('#ammo-tray button[data-ammo]')].map(R);
      const others = {
        fire: R(document.querySelector('#touch .pad.right')),
        steer: R(document.querySelector('#touch .pad.left')),
        sail: R(document.querySelector('#touch .pad.mid')),
        act: R(document.querySelector('#touch .pad.act')),
        hint: R(document.getElementById('hint')),
        guns: R(document.querySelector('#hud .hud-bottom .card.guns')),
        top: R(document.querySelector('#hud .hud-top')),
      };
      const hit = (a, b) => !!(a && b && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5);
      const over = Object.keys(others).filter((k) => tray.some((t) => hit(t, others[k])));
      const all = tray.filter(Boolean).reduce((a, t) => ({ l: Math.min(a.l, t.l), t: Math.min(a.t, t.t), r: Math.max(a.r, t.r), b: Math.max(a.b, t.b) }), { l: 1e9, t: 1e9, r: -1e9, b: -1e9 });
      return {
        n: tray.filter(Boolean).length,
        sizes: [...new Set(tray.filter(Boolean).map((t) => Math.round(Math.min(t.r - t.l, t.b - t.t))))],
        cols: new Set(tray.filter(Boolean).map((t) => Math.round(t.l))).size,
        rows: new Set(tray.filter(Boolean).map((t) => Math.round(t.t))).size,
        gap: others.act ? Math.round(others.act.t - all.b) : null,
        right: others.act ? Math.round(others.act.r - all.r) : null,
        over,
        hint: !!others.hint,
        scroll: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1,
      };
    };
    for (const [w, h] of [[320, 480], [360, 480], [360, 640], [390, 844], [568, 320], [640, 360], [844, 390], [1024, 600], [1280, 720]]) {
      const { ctx: lc, page: lp } = await openK({ width: w, height: h, touch: true, label: `kraken-tray ${w}x${h}` });
      const r = await ev(lp, async (probe) => {
        const G = window.__game;
        T.level(1);
        G.combat.setAmmo('round');
        const open = G.specials.openTray();
        G.combat.setAmmo('chain'); // (its hint shows while the tray is open)
        await K.play(0.05); // (drawn in play: a paused game closes the tray)
        return { open, ...eval(`(${probe})`)() };
      }, trayProbe.toString());
      const small = (w <= 360 && h === 480) || h <= 360;
      const sizeOk = w === 844 && h === 390 ? r.sizes.length === 1 && [44, 52].includes(r.sizes[0]) : J(r.sizes) === J([small ? 44 : 52]);
      const portrait = h > w;
      check(r.open && r.n === 6 && sizeOk && r.cols === (portrait ? 2 : 3) && r.rows === (portrait ? 3 : 2) && r.gap === 8 && r.right === 0 && r.over.length === 0 && r.hint && !r.scroll,
        `kraken tray ${w}x${h}: the open tray is ${r.cols} × ${r.rows} of ${J(r.sizes)} px buttons, 8 px above the act pad and right-aligned with it, over nothing it mustn't cover (${J(r)})`);
      if (w === 390) {
        // (drawn in play: a paused game closes the tray)
        await lp.evaluate(() => {
          window.__game.state.mode = 'playing';
          window.__game.specials.openTray();
          window.__game.combat.setAmmo('grape'); // (the hint beside the open tray)
        });
        await snap(lp, 'kraken-tray-390x844.png');
        await lp.evaluate(() => { window.__game.state.mode = 'paused'; });
      }
      await closeK(lc);
    }
  });

  // ---------------------------------------------------------------------------- kraken: the records it saves
  await section('kraken-saves', async () => {
    // At load a record that needed fixing is rewritten in its clean form (the powder record: each recipe 0 or 1,
    // unknown fields dropped; the steering setting), and the tips record keeps bits above 255.
    const junk = {
      'pirates-ahoy-unlocked': '7',
      'pirates-ahoy-tutorial-done': '1',
      'pirates-ahoy-powder': '{"v":7,"own":{"frost":2,"stink":1,"junk":1},"x":1}',
      'pirates-ahoy-settings': '{"steer":"wheel","v":3,"extra":true}',
      'pirates-ahoy-tips': '33023',
    };
    const { ctx, page: sp } = await openK({ label: 'kraken-saves', store: junk });
    const rec = await sp.evaluate(() => {
      const G = window.__game;
      return { powder: localStorage.getItem('pirates-ahoy-powder'), settings: localStorage.getItem('pirates-ahoy-settings'), tips: G.tips, rawTips: localStorage.getItem('pirates-ahoy-tips'), mem: G.specials.powder, steer: G.settings.get().steer };
    });
    check(rec.powder === OWN(0, 0, 1) && J(rec.mem) === rec.powder && rec.settings === '{"v":1,"steer":"wheel"}' && rec.steer === 'wheel' && rec.tips === 33023 && rec.rawTips === '33023',
      `kraken saves: at load the powder and settings records are fixed and rewritten clean, and the tips keep bits above 255 (${J(rec)})`);
    // Garbage given to setPowder / settings.set is refused field by field, never thrown.
    const set = await sp.evaluate(() => {
      const G = window.__game;
      const out = {};
      for (const [k, v] of [['array', [1, 1, 1]], ['proto', JSON.parse('{"__proto__":{"own":{"fire":1}},"own":{"stink":1}}')], ['string', '{"v":1,"own":{"fire":1,"frost":1,"stink":1}}'], ['float', { v: 1, own: { fire: 1.5, frost: 1, stink: -1 } }], ['null', null]]) {
        try {
          out[k] = J(G.specials.setPowder(v).own);
        } catch (e) {
          out[k] = `threw ${e.message}`;
        }
      }
      function J(o) {
        return JSON.stringify(o);
      }
      out.settings = [G.settings.set({ steer: 'tiller' }).steer, G.settings.set('{"v":1,"steer":"wheel"}').steer, G.settings.set(null).steer];
      G.specials.setPowder({ v: 1, own: { fire: 1, frost: 0, stink: 0 } });
      G.settings.set({ v: 1, steer: 'wheel' });
      return out;
    });
    check(set.array === '{"fire":0,"frost":0,"stink":0}' && set.proto === '{"fire":0,"frost":0,"stink":1}' && set.string === '{"fire":1,"frost":1,"stink":1}' && set.float === '{"fire":0,"frost":1,"stink":0}' && set.null === '{"fire":0,"frost":0,"stink":0}' && J(set.settings) === '["buttons","wheel","buttons"]',
      `kraken saves: setPowder and settings.set keep only what is valid, field by field, and never throw (${J(set)})`);

    // Two tabs: a recipe bought in the other tab shows here and none is ever lost; the steering setting follows the
    // other tab; feats that mirror progress (legend) merge by the larger, the counters as saved.
    const other = await ctx.newPage();
    watch(other, 'kraken-saves tab B');
    KLABEL.set(other, 'kraken-saves tab B');
    await other.goto(base + KQ, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await other.waitForFunction(() => window.__gameReady === true && window.__game && window.__game.env, null, { timeout: 120000 });
    await sp.evaluate(() => window.__game.setFeats({ captures: 2, legend: 0 }));
    await other.evaluate(() => {
      const G = window.__game;
      G.specials.setPowder({ v: 1, own: { fire: 0, frost: 1, stink: 1 } });
      G.settings.set({ v: 1, steer: 'buttons' });
      const f = JSON.parse(localStorage.getItem('pirates-ahoy-feats'));
      f.legend = 1;
      f.captures = 5;
      localStorage.setItem('pirates-ahoy-feats', JSON.stringify(f));
    });
    await sp.waitForFunction(() => window.__game.specials.powder.own.frost === 1 && window.__game.settings.get().steer === 'buttons' && window.__game.feats.legend === 1, null, { timeout: 10000 }).catch(() => {});
    const tabs = await sp.evaluate(() => ({ own: window.__game.specials.powder.own, steer: window.__game.settings.get().steer, feats: window.__game.feats, saved: localStorage.getItem('pirates-ahoy-powder') }));
    check(J(tabs.own) === '{"fire":1,"frost":1,"stink":1}' && tabs.steer === 'buttons' && tabs.feats.legend === 1 && tabs.feats.captures === 5,
      `kraken saves: two tabs: the recipes merge upward (Fire kept here), the steering setting follows the other tab, legend merges by the larger (${J({ own: tabs.own, steer: tabs.steer, legend: tabs.feats.legend, captures: tabs.feats.captures })})`);
    await closeK(ctx);

    // With storage switched off the game runs from the defaults, and the steering setting works for the visit.
    const { ctx: bc, page: bp } = await (async () => {
      const c = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      await c.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
      });
      const p = await c.newPage();
      watch(p, 'kraken-saves blocked');
      KLABEL.set(p, 'kraken-saves blocked');
      await p.goto(base + KQ, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await p.waitForFunction(() => window.__gameReady === true && window.__game && window.__game.env, null, { timeout: 120000 });
      await p.evaluate(installHelpers);
      await p.evaluate(installKraken);
      return { ctx: c, page: p };
    })();
    const blocked = await ev(bp, async () => {
      const G = window.__game;
      G.state.tutorialDone = true;
      T.level(1);
      const out = { powder: G.specials.powder.own, loads: G.specials.loads };
      out.set = G.settings.set({ v: 1, steer: 'wheel' }).steer;
      G.state.mode = 'paused';
      await T.redraw();
      out.wheel = T.shown('touch-wheel');
      out.own = G.specials.setPowder({ v: 1, own: { fire: 1, frost: 0, stink: 0 } }).own;
      return out;
    });
    check(J(blocked.powder) === '{"fire":0,"frost":0,"stink":0}' && J(blocked.loads) === '{"fire":0,"frost":0,"stink":0}' && blocked.set === 'wheel' && blocked.wheel && blocked.own.fire === 1,
      `kraken saves: with storage switched off it starts from the defaults (no recipes), and the ship's wheel works for the visit (${J(blocked)})`);
    await closeK(bc);
  });

  // ------------------------------------------------------------------------- kraken: the shipyard's rudder row
  await section('kraken-dock', async () => {
    // The shipyard's 7th row, Big rudder & wheel: three tiers for 120 / 300 / 550 (970 in all), each saved in the
    // ship record (up.rudder 1..3) with the chest; "Turning when slow: 35% → next: 50%".
    const { ctx, page: dp } = await openK({ label: 'kraken-dock', store: { ...KSTORE, 'pirates-ahoy-purse': '2000' } });
    const buy = await dp.evaluate(() => {
      const G = window.__game;
      G.dock.open('menu');
      const rows = [...document.querySelectorAll('#dock-up-list .up-row')].map((li) => li.dataset.id);
      const text = () => (document.querySelector('#dock-up-list .up-row[data-id="rudder"]') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim();
      const out = { rows, t0: text(), buys: [] };
      for (let k = 0; k < 4; k++) {
        const before = G.state.purse;
        const ok = G.dock.buy('rudder');
        out.buys.push({ ok, cost: before - G.state.purse, tier: G.shipConfig.up.rudder ?? 0, saved: localStorage.getItem('pirates-ahoy-ship'), chest: localStorage.getItem('pirates-ahoy-purse'), text: text() });
      }
      // the docked ship is rebuilt when the recipes change (her powder kegs)
      const ship = G.dock.ship;
      G.specials.setPowder({ v: 1, own: { fire: 1, frost: 1, stink: 0 } });
      out.rebuilt = G.dock.ship !== ship;
      return out;
    });
    await dp.evaluate(() => {
      const row = document.querySelector('#dock-up-list .up-row[data-id="rudder"]');
      if (row) row.scrollIntoView({ block: 'center' });
    });
    await frames(dp, 3);
    await snap(dp, 'kraken-dock-rudder.png');
    const costs = buy.buys.map((b) => b.cost);
    check(buy.rows.join() === 'guns,shot,crew,hull,sails,carpenter,rudder' && /Turning when slow: 35% → next: 50%/.test(buy.t0) && /120/.test(buy.t0),
      `kraken dock: the shipyard lists the Big rudder & wheel 7th: "${buy.t0}"`);
    check(J(costs) === '[120,300,550,0]' && buy.buys.map((b) => b.ok).join() === 'true,true,true,false' && buy.buys.map((b) => b.tier).join() === '1,2,3,3' && buy.buys.slice(0, 3).every((b, k) => new RegExp(`"rudder":${k + 1}\\}`).test(b.saved)) && J(buy.buys.map((b) => b.chest)) === '["1880","1580","1030","1030"]',
      `kraken dock: its three tiers cost 120 / 300 / 550, each saved in the ship record with the chest; a fourth is refused (${J(buy.buys.map((b) => ({ ok: b.ok, cost: b.cost, tier: b.tier, chest: b.chest })))})`);
    check(/80%/.test(buy.buys[2].text) && !/next/.test(buy.buys[2].text) && /Turning when slow: 50% → next: 65%/.test(buy.buys[0].text) && buy.rebuilt,
      `kraken dock: the row follows the tiers ("${buy.buys[0].text}" … "${buy.buys[2].text}"); the docked ship is rebuilt with her powder kegs when the recipes change (${buy.rebuilt})`);
    await closeK(ctx);

    // Storage full when the ship record is written: the rudder is yours for the visit and its gold stays in the saved
    // chest until the ship record saves (the shipyard's own rule, SPEC3 §10.2).
    const { ctx: fc, page: fp } = await openK({ label: 'kraken-dock full', store: { 'pirates-ahoy-purse': '500', 'pirates-ahoy-unlocked': '3' } });
    const full = await fp.evaluate(() => {
      const G = window.__game;
      G.dock.open('menu');
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === 'pirates-ahoy-ship') throw new DOMException('full', 'QuotaExceededError');
        return real.call(this, k, v);
      };
      let out;
      try {
        const ok = G.dock.buy('rudder');
        out = { ok, purse: G.state.purse, chest: localStorage.getItem('pirates-ahoy-purse'), tier: G.shipConfig.up.rudder, ship: localStorage.getItem('pirates-ahoy-ship') };
      } finally {
        Storage.prototype.setItem = real;
      }
      G.dock.paint('hull', 'royal');
      out.after = { chest: localStorage.getItem('pirates-ahoy-purse'), ship: localStorage.getItem('pirates-ahoy-ship') };
      return out;
    });
    check(full.ok && full.purse === 380 && full.chest === '500' && full.tier === 1 && !/rudder/.test(full.ship || '') && full.after.chest === '380' && /"rudder":1/.test(full.after.ship || ''),
      `kraken dock: storage full: the rudder lasts the visit and its gold stays in the saved chest until the ship record saves (${J(full)})`);
    await closeK(fc);
  });

  // ---------------------------------------------------------------------------------- kraken: the new sounds
  await section('kraken-audio', async () => {
    // Offline renders of every Kraken Seas sound (special shot, the new ships, Voyage III's hazards, the Kraken, the
    // Riddle Bell, building, crates): finite, stereo, not silent, never over full scale.
    const KRAKEN_SFX = ['ignite', 'crackle', 'sizzle', 'freeze', 'stink', 'blast', 'clang', 'ram', 'mortar', 'fuse', 'spout', 'horn', 'rogue', 'surf', 'ink', 'krakenRise', 'slam', 'grab', 'gurgle', 'sneeze', 'bell', 'bonk', 'squawk', 'build', 'crate', 'tentacle', 'geyser'];
    const { ctx, page: ap } = await openK({ label: 'kraken-audio' });
    const sound = await ap.evaluate(async (names) => {
      const M = await import('/src/audio.js');
      const out = { missing: names.filter((n) => !M.SFX_NAMES.includes(n)), bad: [], peaks: {} };
      for (const sfx of names) {
        if (out.missing.includes(sfx)) continue;
        const r = await M.__audioTest.renderOffline({ sfx, seconds: 1.5, music: false, ambience: false });
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
    }, KRAKEN_SFX);
    check(sound.missing.length === 0 && sound.bad.length === 0,
      `kraken audio: offline renders of the ${KRAKEN_SFX.length} Kraken Seas sounds are finite, stereo and not silent (${sound.bad.length ? 'bad: ' + sound.bad.join(', ') : J(sound.peaks)}${sound.missing.length ? '; missing: ' + sound.missing : ''})`);
    await closeK(ctx);
  });

  // -------------------------------------------------------- kraken: the live game (no ?kraken=1) unchanged
  await section('kraken-live', async () => {
    // Until Voyage III sails for everyone (voyage.js WITH_KRAKEN), a page without ?kraken=1 is today's game, even with
    // the new records already stored: six levels, no recipes or loads (the powder and settings records are neither
    // read nor rewritten), keys 4-6 do nothing, R cycles round, chain and grape, the help lists and the pause dialog
    // as today, the Ammo pill cycles (no tray), a thumb slide is a plain hold, no wheel, no statusfx, and the shipyard
    // has its six rows.
    const store = { 'pirates-ahoy-unlocked': '6', 'pirates-ahoy-tutorial-done': '1', 'pirates-ahoy-tips': '255', 'pirates-ahoy-powder': OWN_ALL, 'pirates-ahoy-settings': '{"v":1,"steer":"wheel"}', 'pirates-ahoy-purse': '2000' };
    const { ctx, page: lp } = await open({ label: 'kraken-live', store });
    KLABEL.set(lp, 'kraken-live');
    if (await lp.evaluate(() => window.__game.voyage.WITH_KRAKEN)) {
      console.log('     (Voyage III sails for everyone now: no hidden Kraken Seas to check)');
      await closeK(ctx);
      return;
    }
    const desk = await ev(lp, () => {
      const G = window.__game;
      const out = { levels: G.LEVELS.length, powder: G.specials.powder.own, steer: G.settings.get().steer, stored: [localStorage.getItem('pirates-ahoy-powder'), localStorage.getItem('pirates-ahoy-settings')] };
      out.help = [...document.querySelectorAll('ul.controls')].map((u) => u.textContent).join(' | ');
      T.level(3);
      out.loads = G.specials.loads;
      G.combat.setAmmo('round');
      const keys = [];
      for (const [k, c] of [['4', 'Digit4'], ['5', 'Digit5'], ['6', 'Numpad6']]) {
        T.key(k, c);
        T.key(k, c, { type: 'keyup' });
        keys.push(G.combat.ammo + (T.shown('hint') ? ':' + T.text('hint') : ''));
      }
      out.keys = keys;
      out.r = [];
      for (let i = 0; i < 4; i++) {
        T.key('r', 'KeyR');
        T.key('r', 'KeyR', { type: 'keyup' });
        out.r.push(G.combat.ammo);
      }
      out.fx = G.specials.fx();
      out.tray = G.specials.tray;
      out.flash = T.shown('screen-flash');
      G.togglePause();
      out.pause = [...document.querySelectorAll('#pause-choices button')].filter((b) => b.offsetParent).map((b) => b.id);
      G.togglePause();
      return out;
    });
    const shop = await lp.evaluate(() => {
      const G = window.__game;
      G.dock.open('menu');
      const rows = [...document.querySelectorAll('#dock-up-list .up-row')].map((li) => li.dataset.id);
      const before = G.state.purse;
      const ok = G.dock.buy('rudder');
      return { rows, ok, spent: before - G.state.purse, ship: localStorage.getItem('pirates-ahoy-ship'), tips: G.tips };
    });
    check(desk.levels === 6 && J(desk.powder) === '{"fire":0,"frost":0,"stink":0}' && J(desk.loads) === '{"fire":0,"frost":0,"stink":0}' && desk.steer === 'buttons' && desk.stored[0] === OWN_ALL && desk.stored[1] === '{"v":1,"steer":"wheel"}',
      `kraken live: without ?kraken=1 there are six levels and the stored powder and steering records are neither read nor rewritten (${J({ levels: desk.levels, powder: desk.powder, loads: desk.loads, steer: desk.steer, stored: desk.stored })})`);
    check(J(desk.keys) === '["round","round","round"]' && desk.r.join() === 'chain,grape,round,chain' && !/special|slide/.test(desk.help) && desk.fx === null && !desk.tray.wanted && !desk.tray.open && !desk.flash && desk.pause.join() === 'resume-btn,quit-dock-btn,quit-menu-btn',
      `kraken live: keys 4-6 do nothing, R cycles round, chain and grape, the help lists and the pause dialog are today's, no statusfx (${J({ keys: desk.keys, r: desk.r, fx: desk.fx, tray: desk.tray, pause: desk.pause })})`);
    check(shop.rows.join() === 'guns,shot,crew,hull,sails,carpenter' && shop.ok === false && shop.spent === 0 && !/rudder/.test(shop.ship || '') && shop.tips === 255,
      `kraken live: the shipyard has its six rows and no rudder for sale (${J(shop)})`);
    await closeK(ctx);

    const { ctx: tc, page: tp } = await open({ width: 390, height: 844, touch: true, label: 'kraken-live touch', store });
    KLABEL.set(tp, 'kraken-live touch');
    const touch = await ev(tp, async () => {
      const G = window.__game;
      T.level(3);
      G.combat.setAmmo('round');
      const tap = (el) => {
        for (const type of ['pointerdown', 'pointerup']) el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 41, pointerType: 'touch', isPrimary: true }));
      };
      const pill = document.getElementById('touch-ammo');
      tap(pill);
      const out = { ammo: G.combat.ammo, tray: G.specials.tray.open, expanded: pill.getAttribute('aria-expanded'), trayShown: T.shown('ammo-tray') };
      const L = document.querySelector('[data-hold="left"]');
      const b = L.getBoundingClientRect();
      const ptr = (type, x) => L.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 42, pointerType: 'touch', isPrimary: true, clientX: x, clientY: b.top + b.height / 2 }));
      ptr('pointerdown', b.left + b.width / 2);
      ptr('pointermove', b.left + b.width / 2 + 40);
      out.slide = { steer: G.input.steer, input: G.turn.input, needle: T.shown('steer-needle') };
      ptr('pointerup', b.left + b.width / 2 + 40);
      G.state.mode = 'paused';
      await T.redraw();
      out.wheel = T.shown('touch-wheel');
      out.arrows = Math.round(L.getBoundingClientRect().width);
      G.state.mode = 'playing';
      G.togglePause();
      out.pause = [...document.querySelectorAll('#pause-choices button')].filter((x) => x.offsetParent).map((x) => x.id);
      out.toggle = T.shown('steer-mode-btn');
      G.togglePause();
      out.help = [...document.querySelectorAll('ul.controls')].map((u) => u.textContent).join(' | ');
      out.tips = G.tips;
      return out;
    });
    check(touch.ammo === 'chain' && !touch.tray && !touch.trayShown && touch.expanded === null && touch.slide.steer === null && touch.slide.input === 1 && !touch.slide.needle && !touch.wheel && touch.arrows >= 44,
      `kraken live: on a phone the Ammo pill cycles (no tray), a thumb slide on ◀ is a plain hold, and the arrows stay (no wheel, though one is stored) (${J({ ammo: touch.ammo, tray: touch.tray, slide: touch.slide, wheel: touch.wheel, arrows: touch.arrows })})`);
    check(touch.pause.join() === 'resume-btn,quit-dock-btn,quit-menu-btn' && !touch.toggle && !/special|slide/.test(touch.help) && touch.tips === 255,
      `kraken live: on a phone the pause dialog has no Steering toggle (nor its New! badge) and the help is today's (${J({ pause: touch.pause, toggle: touch.toggle, tips: touch.tips })})`);
    await closeK(tc);
  });

  // ------------------------------------------------------------------- kraken: no Kraken in the live game
  // Until Voyage III sails for everyone, a page without ?kraken=1 has no Kraken anywhere: on the last level (the
  // Maelstrom, a finale with a boss) the Kraken's test hooks find none (no state, rise() refused, no targets, no
  // checkpoint), the boss bar shows no notches and no grab strip, the shipwreck card has no "Try again from the
  // Kraken" (Enter tries the level again), and the Victory card has no Pearl line.
  await section('kraken-finale-live', async () => {
    const store = { 'pirates-ahoy-unlocked': '6', 'pirates-ahoy-tutorial-done': '1', 'pirates-ahoy-tips': '255' };
    const { ctx, page: lp } = await open({ label: 'kraken-finale-live', store });
    KLABEL.set(lp, 'kraken-finale-live');
    if (await lp.evaluate(() => window.__game.voyage.WITH_KRAKEN)) {
      console.log('     (Voyage III sails for everyone now: no hidden Kraken to check)');
      await closeK(ctx);
      return;
    }
    const live = await ev(lp, async () => {
      const G = window.__game;
      const out = { levels: G.LEVELS.length };
      const p = T.level(G.LEVELS.length);
      const boss = T.spawn('phantom', 24, 10);
      boss.reload.port = boss.reload.star = 99;
      out.kraken = { state: G.kraken.state, rise: G.kraken.rise(), targets: G.kraken.targets.length, checkpoint: G.kraken.checkpoint };
      G.state.mode = 'paused';
      await T.redraw();
      G.state.mode = 'playing';
      out.hud = { boss: T.shown('boss'), notches: T.shown('boss-notches'), strip: T.shown('grab-strip') };
      // sunk: the shipwreck card
      G.damage(p, 99999, p.x, p.z, 'phantom');
      T.steps(6, () => G.state.mode === 'playing');
      out.over = { mode: G.state.mode, retry: T.shown('kraken-retry-btn'), buttons: [...document.querySelectorAll('#over-screen .panel button')].filter((b) => b.offsetParent).map((b) => b.id) };
      // cleared: the Victory card (every ship of every wave sunk)
      T.level(G.LEVELS.length);
      G.state.mode = 'playing';
      for (let i = 0; i < 120 * 90 && G.state.mode === 'playing'; i++) {
        // (the Phantom Galleon only strikes to a boarding: she sails off instead)
        for (const e of G.enemies) if (G.fighting(e)) (e.type.ghost ? G.capture.escape(e) : G.damage(e, 99999));
        G.player.hp = G.player.maxHp;
        G.step(1 / 120);
      }
      out.won = { mode: G.state.mode, chest: T.text('won-chest'), text: T.text('won-text') };
      return out;
    });
    check(live.levels === 6 && live.kraken.state === null && live.kraken.rise === false && live.kraken.targets === 0 && live.kraken.checkpoint === null && live.hud.boss && !live.hud.notches && !live.hud.strip,
      `kraken finale live: no Kraken on the last of ${live.levels} levels: no state, rise() refused, no targets, no checkpoint; the Phantom's boss bar has no notches, no grab strip (${J({ kraken: live.kraken, hud: live.hud })})`);
    check(live.over.mode === 'over' && !live.over.retry && live.over.buttons[0] === 'retry-btn',
      `kraken finale live: the shipwreck card has no "Try again from the Kraken"; "Try again" comes first (${J(live.over)})`);
    check(live.won.mode === 'won' && !/Pearl/.test(live.won.chest) && !/Kraken/.test(live.won.text),
      `kraken finale live: the Victory card has no Pearl line ("${live.won.chest}") (${J(live.won)})`);
    await lp.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    await closeK(ctx);
  });

  // -------------------------------------------------------- kraken: two fingers on the steering (Stage 2 review)
  // A phone flat on a table, two thumbs drumming ◀ ▶: a thumb sliding on ◀ while a second finger lands on ▶, lifted in
  // either order, leaves no turn behind, its slide goes on as it was, and the arrows steer again afterwards (a second
  // touch never takes the slide over). A second hand on the ship's wheel doesn't snap it to the middle or take it over.
  // With the wheel, the help lists and the first voyage's level banner say "drag the wheel", not the arrows.
  await section('kraken-thumbs', async () => {
    const { ctx, page: tp } = await openK({ width: 390, height: 844, touch: true, label: 'kraken-thumbs' });
    const two = await ev(tp, () => {
      const G = window.__game;
      T.level(1);
      const pad = document.querySelector('#touch .pad.left');
      const L = pad.querySelector('[data-hold="left"]');
      const R = pad.querySelector('[data-hold="right"]');
      const at = (el) => {
        const b = el.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      };
      const ptr = (el, type, x, y, id, primary) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: primary, clientX: x, clientY: y }));
      const r2 = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
      const read = () => ({ steer: r2(G.input.steer), input: r2(G.turn.input), needle: T.shown('steer-needle') });
      const a = at(L);
      const b = at(R);
      const out = {};
      let id = 40;
      for (const first of ['slider', 'second']) {
        const A = ++id;
        const B = ++id;
        const C = ++id;
        ptr(L, 'pointerdown', a.x, a.y, A, true);
        ptr(L, 'pointermove', a.x + 15, a.y, A, true); // (a thumb's wobble past 12 px: a slide)
        const sliding = read();
        ptr(R, 'pointerdown', b.x, b.y, B, false);
        const both = read();
        ptr(L, 'pointermove', a.x + 28, a.y, A, true);
        const still = read();
        let mid;
        if (first === 'slider') {
          ptr(L, 'pointerup', a.x + 28, a.y, A, true);
          mid = read();
          ptr(R, 'pointerup', b.x, b.y, B, false);
        } else {
          ptr(R, 'pointerup', b.x, b.y, B, false);
          mid = read();
          ptr(L, 'pointerup', a.x + 28, a.y, A, true);
        }
        const up = read();
        G.step(1 / 120);
        ptr(R, 'pointerdown', b.x, b.y, C, true);
        const right = read();
        ptr(R, 'pointerup', b.x, b.y, C, true);
        out[first] = { sliding, both, still, mid, up, right, after: read() };
      }
      // a second finger landing between the arrows while a thumb slides
      ptr(L, 'pointerdown', a.x, a.y, 61, true);
      ptr(L, 'pointermove', a.x + 15, a.y, 61, true);
      const m = { x: (a.x + b.x) / 2, y: a.y };
      ptr(pad, 'pointerdown', m.x, m.y, 62, false);
      ptr(pad, 'pointermove', m.x + 40, m.y, 62, false);
      const gap = read();
      ptr(pad, 'pointerup', m.x + 40, m.y, 62, false);
      ptr(L, 'pointerup', a.x + 15, a.y, 61, true);
      out.gap = { during: gap, up: read() };
      return out;
    });
    for (const k of ['slider', 'second']) {
      const o = two[k];
      check(near(o.sliding.steer, 0.732, 1e-3) && near(o.both.steer, 0.732, 1e-3) && near(o.still.steer, 0.5, 1e-9) && o.still.needle && (k === 'slider' ? o.mid.steer === null && o.mid.input === -1 : near(o.mid.steer, 0.5, 1e-9)) && o.up.steer === null && o.up.input === 0 && !o.up.needle && o.right.steer === null && o.right.input === -1 && o.after.input === 0,
        `kraken thumbs: a thumb sliding on ◀ and a second finger on ▶ (${k === 'slider' ? 'the sliding thumb' : 'the second finger'} lifted first): the slide goes on as it was (${o.still.steer}), lifting both leaves no turn (${J(o.up)}), and ▶ held afterwards turns right (${o.right.input}) (${J(o)})`);
    }
    check(near(two.gap.during.steer, 0.732, 1e-3) && two.gap.up.steer === null && two.gap.up.input === 0 && !two.gap.up.needle,
      `kraken thumbs: a second finger sliding between the arrows doesn't take the slide over, and nothing is left when both lift (${J(two.gap)})`);

    // The ship's wheel: one hand holds it at a 0.8 turn, a second hand touches it.
    const wheel = await ev(tp, async () => {
      const G = window.__game;
      T.level(1);
      G.settings.set({ v: 1, steer: 'wheel' });
      G.state.mode = 'paused';
      await T.redraw();
      G.state.mode = 'playing';
      const w = document.getElementById('touch-wheel');
      const box = w.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const ptr = (type, x, id, primary) => w.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: primary, clientX: x, clientY: cy }));
      const read = () => ({ steer: G.input.steer === null ? null : Math.round(G.input.steer * 1000) / 1000, rot: w.style.transform });
      ptr('pointerdown', cx, 71, true);
      ptr('pointermove', cx + 48, 71, true);
      const held = read();
      ptr('pointerdown', cx - 20, 72, false);
      const second = read();
      ptr('pointermove', cx + 30, 71, true);
      const turned = read();
      ptr('pointerup', cx - 20, 72, false);
      const secondUp = read();
      ptr('pointerup', cx + 30, 71, true);
      const up = read();
      return { held, second, turned, secondUp, up };
    });
    check(wheel.held.steer === -0.8 && wheel.second.steer === -0.8 && wheel.turned.steer === -0.5 && wheel.turned.rot === 'rotate(60deg)' && wheel.secondUp.steer === -0.5 && wheel.up.steer === null && wheel.up.rot === 'rotate(0deg)',
      `kraken thumbs: a second hand on the ship's wheel doesn't snap it to the middle (${wheel.second.steer}) or take it over: the first hand still turns it (${wheel.turned.steer}) after the second lets go (${J(wheel)})`);

    // The help: the pause dialog's and the title's touch help, and the first voyage's level banner.
    const help = await ev(tp, async () => {
      const G = window.__game;
      const line = (sel) => (document.querySelector(`${sel} ul.controls.touch-help li`)?.textContent || '').replace(/\s+/g, ' ').trim();
      const read = () => {
        G.state.tutorialDone = false;
        G.newGame(1);
        const banner = T.text('banner');
        G.state.tutorialDone = true;
        return { pause: line('#pause-screen'), menu: line('#menu-screen'), banner };
      };
      const out = {};
      G.settings.set({ v: 1, steer: 'wheel' });
      out.wheel = read();
      G.settings.set({ v: 1, steer: 'buttons' });
      out.arrows = read();
      T.level(1);
      return out;
    });
    check(/drag it sideways to steer/.test(help.wheel.pause) && /Ship.s wheel/.test(help.wheel.pause) && !/[◀▶]|slide/.test(help.wheel.pause) && help.wheel.menu === help.wheel.pause && /Drag the ship.s wheel to steer/.test(help.wheel.banner) && !/Hold ◀/.test(help.wheel.banner),
      `kraken thumbs: with the ship's wheel the touch help reads "${help.wheel.pause}" and the first voyage's banner "${help.wheel.banner}" (no arrows) (${J(help.wheel)})`);
    check(help.arrows.pause === '◀▶ steer · slide on them for gentle turns' && help.arrows.menu === help.arrows.pause && /Hold ◀ ▶ to steer/.test(help.arrows.banner),
      `kraken thumbs: back on the arrows, the help reads "${help.arrows.pause}" again and the banner "Hold ◀ ▶ to steer" (${J(help.arrows)})`);
    await closeK(ctx);
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
