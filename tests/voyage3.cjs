// Voyage III suite (SPEC3 §13.2, tests/voyage3.cjs): the Kraken Seas, levels 7-9, served with ?kraken=1 until
// Voyage III sails for everyone (then the query is harmless). Drives the game in headless Chromium through the
// window.__game test API with the real-time loop frozen (G.step(1/120)), like battle.cjs:
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
// Run with `node tests/voyage3.cjs` (VOYAGE3_ONLY=levels,starts runs some sections; VOYAGE3_ROOT serves another
// copy of the game; SCREENSHOT_DIR puts the screenshots elsewhere).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('./server.cjs');

const ROOT = process.env.VOYAGE3_ROOT || path.join(__dirname, '..');
const OUT = process.env.SCREENSHOT_DIR || path.join(ROOT, 'tests', 'screenshots');
const ONLY = (process.env.VOYAGE3_ONLY || '').split(',').filter(Boolean);
const QUERY = '?quality=low&kraken=1';
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

  const { page } = await open({ label: 'voyage3' });

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
    check(v.kraken === true && v.n === 9, `voyage: with ?kraken=1 the voyage has nine levels (${J({ kraken: v.kraken, n: v.n })})`);
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
