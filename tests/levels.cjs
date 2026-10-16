// Act II and the two-act voyage (SPEC2 §11.3, tests/levels.cjs): serves the game, drives it in headless
// Chromium through the window.__game test API (§9.3) and checks
// - the title: six level cards in two act groups (Easy … Legendary, skull pips, "Beat the Molten Maw"), the
//   tagline, and the title's layout at the F01 sizes (no page scroll, Set sail! in view)
// - the Act I finale: beating the Molten Maw still wins (Victory screen), "Sail on to the Far Seas" and Enter
//   start Doubloon Bay with the voyage gold, the won dock's ways out; after the Maelstrom the legend's words
// - each Act II mechanic: Doubloon Bay's treasure convoy (the far gate, escapes, 525 + 150 for a capture),
//   Frostbite Straits' drifting ice floes (sim time, CRUNCH! once per 1.5 s, ice slows a raider), the
//   Maelstrom's current (the §6.3 drift, the eye's 5 hp/s, the Phantom rising, lightning that warns, strikes
//   and keeps to one flash per 3 s, and only a slow tint under reduced motion)
// - the Act II bot (bot v2): a mid-game ship clears levels 4-6, each fights back, the Maelstrom hurts more
//   than Doubloon Bay, never inside land
// - draw calls at each Act II level start (≤ 310) and during a boarding on each (≤ 450); screenshots
//   doubloon.png, frost.png, maelstrom.png
// The simulation is frozen (the real-time loop paused) and driven with G.step(1/120) like smoke.cjs; only the
// draw-call and screenshot parts let real frames run. Run with `npm test` or `npm run test:levels`
// (LEVELS_ONLY=cards,finale,doubloon,frost,maelstrom,bot,draws runs some sections; LEVELS_ROOT serves another
// copy of the game).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('./server.cjs');

const ROOT = process.env.LEVELS_ROOT || path.join(__dirname, '..');
const OUT = process.env.SCREENSHOT_DIR || path.join(ROOT, 'tests', 'screenshots');
const ONLY = (process.env.LEVELS_ONLY || '').split(',').filter(Boolean);
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
const near = (a, b, eps) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= eps;

// ---------------------------------------------------------------------------------------------------------
// In-page helpers (installed after every page load as window.T)
// ---------------------------------------------------------------------------------------------------------
function installHelpers() {
  const G = window.__game;
  const T = {
    // Level n for a frozen-loop scenario: past the fly-in and the grace period, the tutorial done. With
    // clear: land and reefs moved out of the way and the level's own ships parked out of reach (a ship with
    // `rise` > 0 has no AI, fires nothing and is never hit), so they still count as the wave in the fight.
    level(n, { clear = true } = {}) {
      G.state.tutorialDone = true;
      G.newGame(n);
      G.state.intro = 0;
      T.noBanner();
      G.state.combatTime = 30;
      G.state.nextBomb = Infinity; // (lightning only where a test calls it down)
      const p = G.player;
      if (clear) {
        p.speed = 0;
        G.state.sail = 0;
        G.colliders.forEach((c) => (c.x += 5000));
        G.reefs.forEach((r) => (r.x += 5000));
        G.enemies.forEach((e, k) => T.park(e, k));
      }
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
    steps(s, each) {
      const n = Math.round(s * 120);
      for (let i = 0; i < n; i++) {
        if (each && each(i) === false) return i;
        G.step(1 / 120);
      }
      return n;
    },
    wrap: (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2)),
    key(key, code, { type = 'keydown', repeat = false } = {}) {
      window.dispatchEvent(new KeyboardEvent(type, { key, code, repeat, bubbles: true, cancelable: true }));
    },
    // Draw one frame of the paused scene (the HUD, tags and minimap update; no time passes).
    redraw() {
      window.dispatchEvent(new Event('resize'));
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    },
    // The level banner put away (a later banner shows again by itself).
    noBanner() {
      G.state.bannerTimer = 0;
      document.getElementById('banner').classList.add('hidden');
    },
    shown: (id) => {
      const el = document.getElementById(id);
      return !!el && !el.closest('.hidden') && el.getClientRects().length > 0;
    },
    text: (id) => (document.getElementById(id)?.textContent || '').replace(/\s+/g, ' ').trim(),
    // Every enemy still afloat leaves the fight without a sinking (no coins, no sinking gold): it escapes.
    escapeAll() {
      let n = 0;
      for (const e of G.enemies) if (G.fighting(e)) n += (G.capture.escape(e), 1);
      return n;
    },
  };
  window.T = T;
}

// Run `fn` (a function of no free variables, source-serialised) in the page with the game playing for that one
// synchronous stretch (the real loop can't run in between), frozen again afterwards.
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

// ---------------------------------------------------------------------------------------------------------
// The Act II bot (bot v2, SPEC2 §11.3; agent 3B's reference implementation). Runs INSIDE the page:
// page.evaluate(botLevel, { n, profile }). The mid-game profile: shipyard guns 1, shot 2, crew 2, hull 2,
// sails 1, carpenter 1 (G.setShipConfig); tavern boarders 1, cutlass 1 (G.armory.set). It chases galleons
// first, uses chain beyond 18 u on fleeing ships, grape within 16 u on targets above their notch + 2, grapples
// when the preview says capture or the target surrendered, cuts ropes (3 presses), keeps out of r < 30 of the
// vortex and dodges warning rings like lava. Damage taken is the sum of hull drops (repairs not subtracted).
// ---------------------------------------------------------------------------------------------------------
function botLevel(args) {
  const { n, profile = 'mid', maxT = 900 } = args;
  const G = window.__game;
  const wrap = (a) => ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  const hyp = Math.hypot;
  if (profile === 'mid') {
    G.setShipConfig({ up: { guns: 1, shot: 2, crew: 2, hull: 2, sails: 1, carpenter: 1 } });
    G.armory.set({ up: { boarders: 1, cutlass: 1, grapple: 0, gunner: 0 } });
  } else if (profile === 'stock') {
    G.setShipConfig({ up: {} });
    G.armory.set({ up: {} });
  }
  G.state.unlocked = Math.max(G.state.unlocked, G.LEVELS.length);
  G.state.tutorialDone = true;
  G.startLevel(n);
  if (G.state.mode === 'playing') G.togglePause();
  G.state.mode = 'playing';
  const S = G.combat.rules;
  const stats = { level: n, profile, result: null, time: 0, damageTaken: 0, hpLeft: 0, captures: 0, sunk: 0, boardings: 0, raids: 0, cuts: 0, counters: 0, takes: 0, stuck: 0, minVortex: Infinity, escaped: 0, taken: 0, hurtBy: null, left: '' };
  let t = 0;
  let lastHp = G.player.hp;
  let wasActive = false;
  let tick = 0;
  let cutPresses = 0;
  const orbit = { target: null, hp: 0, crew: Infinity, hitAt: 0, flipUntil: -1 };
  const notchOf = (e) => e.strikeAt ?? S.strikeAt(e.crew0);
  const crewOf = (e) => G.combat.crewOf(e);
  while (G.state.mode === 'playing' && t < maxT) {
    tick++;
    const p = G.player;
    const B = G.boarding;
    G.input.left = G.input.right = false;
    // ---- boarding set-pieces
    if (B.active && !wasActive) {
      if (B.kind === 'defend') stats.raids++;
      else if (B.kind === 'counter') stats.counters++;
      else if (B.kind === 'surrender') stats.takes++;
      else stats.boardings++;
      cutPresses = 0;
    }
    wasActive = B.active;
    if (!p.sinking) {
      if (B.active && B.phase === 'threat' && cutPresses < 3 && tick % 3 === 0) {
        G.boardPress();
        cutPresses++;
        if (cutPresses === 3) stats.cuts++;
      }
      // ---- who to go for: galleons first, then the nearest fighting ship; a struck ship close by is taken
      const afloat = G.enemies.filter((e) => e.hp > 0 && !e.sinking && !e.captured && !e.escaped);
      const fighting = afloat.filter((e) => G.fighting(e) && !(e.rise > 0));
      const struck = afloat.filter((e) => e.surrendered);
      const near = (list) => list.slice().sort((a, b) => hyp(a.x - p.x, a.z - p.z) - hyp(b.x - p.x, b.z - p.z))[0] || null;
      let target = near(fighting.filter((e) => e.type.merchant)) || near(fighting);
      const s0 = near(struck);
      if (s0 && (!target || hyp(s0.x - p.x, s0.z - p.z) < 30)) target = s0;
      // ---- grapple when the preview says capture (or she struck); counter-board on capture odds
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
      if (target) {
        const r = G.relative(p, target.x, target.z);
        const toT = Math.atan2(target.x - p.x, target.z - p.z);
        const odds = B.odds(target);
        const wantBoard = odds && (odds.label === 'capture' || odds.label === 'take');
        const fleeing = !!target.type.merchant;
        const crew = crewOf(target);
        const unl = G.combat.unlockedAmmo || ['round'];
        const has = (a) => unl.includes(a);
        if (has('grape') && r.dist < 16 && crew > notchOf(target) + 2 && !target.surrendered) ammo = 'grape';
        else if (has('chain') && r.dist > 18 && fleeing) ammo = 'chain';
        else if (fleeing && target.hp < target.maxHp * 0.5 && has('grape')) ammo = 'grape'; // don't sink the treasure
        else ammo = 'round';
        // Close in to grape range when her crew is the way to take her (the Phantom's ghosts, a galleon's crew);
        // otherwise hold at round-shot range.
        const crewRoute = has('grape') && !target.surrendered && crew > notchOf(target) + 2 && (target.type.ghost || fleeing);
        const pref = ammo === 'grape' || crewRoute ? 12 : 20;
        // intercept: lead a moving target
        const lt = Math.min(3, r.dist / Math.max(4, p.speed + 2));
        const ix = target.x + Math.sin(target.h) * target.speed * lt;
        const iz = target.z + Math.cos(target.h) * target.speed * lt;
        const toI = Math.atan2(ix - p.x, iz - p.z);
        if (wantBoard || target.surrendered) {
          desired = toI;
          sail = 3;
        } else if (r.dist > pref + 6) {
          desired = fleeing ? toI : toT;
          sail = 3;
        } else {
          // Circle her (of the two courses square to her bearing, the one nearer our heading); when she has not
          // been hit for 6 s while close, take the other course for 4 s (a counter-rotating orbit can keep her
          // out of the guns' traverse).
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
          if (t - orbit.hitAt > 6 && r.dist < 28 && !(orbit.flipUntil > t)) {
            orbit.flipUntil = t + 4;
            orbit.hitAt = t;
          }
          const near1 = Math.abs(wrap(a1 - p.h)) < Math.abs(wrap(a2 - p.h));
          desired = near1 !== orbit.flipUntil > t ? a1 : a2;
          const sideOf = Math.sign(wrap(desired - toT));
          if (r.dist > pref + 2) desired -= sideOf * 0.4;
          else if (r.dist < pref - 5) desired += sideOf * 0.4;
          sail = fleeing ? 3 : 2;
        }
      }
      if (G.state.ammo !== ammo) G.combat.setAmmo(ammo);
      // ---- dodge warning rings (lava and lightning)
      for (const b of G.bombs) {
        const db = hyp(p.x - b.tx, p.z - b.tz);
        if (db < (b.radius || 5) + 6) {
          desired = Math.atan2(p.x - b.tx, p.z - b.tz);
          sail = 3;
        }
      }
      // ---- steer round land and reefs (ice floes are reefs too)
      for (const o of [...G.colliders, ...G.reefs]) {
        const ri = G.relative(p, o.x, o.z);
        if (ri.along > -2 && ri.along < 22 && Math.abs(ri.lat) < o.r + 6) desired = p.h + (ri.lat > 0 ? 1.3 : -1.3);
      }
      // ---- keep out of r < 30 of the vortex
      const cur = G.env.current;
      if (cur) {
        const dc = hyp(p.x - cur.x, p.z - cur.z);
        stats.minVortex = Math.min(stats.minVortex, dc);
        const out = Math.atan2(p.x - cur.x, p.z - cur.z);
        if (dc < 36) {
          desired = out;
          sail = 3;
        } else if (dc < 48) {
          const rel = wrap(desired - out);
          if (Math.abs(rel) > Math.PI / 2) desired = out + Math.sign(rel || 1) * (Math.PI / 2);
        }
      }
      if (hyp(p.x, p.z) > G.env.worldRadius - 15) desired = Math.atan2(-p.x, -p.z);
      const diff = wrap(desired - p.h);
      if (diff > 0.05) G.input.left = true;
      else if (diff < -0.05) G.input.right = true;
      G.state.sail = sail;
      // ---- fire whichever side has a fighting ship abeam or in its arc, within the loaded ammo's range
      const range = S.AMMO[G.state.ammo].range;
      for (const side of [1, -1]) {
        const inArc = G.enemies.filter((e) => {
          if (!G.fighting(e)) return false;
          const r2 = G.relative(p, e.x, e.z);
          const abeam = Math.sign(r2.lat) === side && r2.dist < range - 2 && Math.abs(r2.along) < Math.abs(r2.lat) * 0.5;
          return abeam || G.inArc(p, e, side, range);
        });
        if (!inArc.length) continue;
        inArc.sort((a, b) => hyp(a.x - p.x, a.z - p.z) - hyp(b.x - p.x, b.z - p.z));
        const e = inArc[0];
        // never round shot into a treasure galleon under half hull (her gold would sink)
        if (e.type.merchant && G.state.ammo === 'round' && e.hp < e.maxHp * 0.5) continue;
        G.playerFire(side);
      }
      for (const c of G.colliders) if (hyp(c.x - p.x, c.z - p.z) < c.r) stats.stuck++;
    }
    for (let k = 0; k < 6 && G.state.mode === 'playing'; k++) {
      G.step(1 / 120);
      if (G.player.hp < lastHp) stats.damageTaken += lastHp - G.player.hp;
      lastHp = G.player.hp;
    }
    t += 6 / 120;
  }
  G.input.left = G.input.right = false;
  stats.result = G.state.mode === 'playing' ? 'timeout' : G.state.mode;
  stats.time = Math.round(t);
  stats.damageTaken = Math.round(stats.damageTaken);
  stats.hpLeft = Math.round(G.player.hp);
  stats.captures = G.state.captures;
  stats.sunk = G.state.sunk;
  stats.hurtBy = J(G.state.hurtBy);
  stats.left = G.enemies.filter((e) => e.hp > 0 && !e.captured && !e.escaped).map((e) => e.typeName + (e.surrendered ? '(struck)' : '')).join(' ');
  const ms = G.mechanics.state;
  if (ms.convoy) {
    stats.escaped = ms.convoy.escaped;
    stats.taken = ms.convoy.taken;
  }
  stats.minVortex = Number.isFinite(stats.minVortex) ? Math.round(stats.minVortex) : null;
  if (G.state.mode === 'playing') G.state.mode = 'paused';
  return stats;
  function J(v) {
    return JSON.stringify(v);
  }
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
  // A page of the game. store: localStorage records set before the game loads (first load only).
  async function open({ width = 1280, height = 720, touch = false, query = '?quality=low', store = null, label = 'page', reducedMotion = 'no-preference' } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion });
    if (store) {
      await ctx.addInitScript((s) => {
        try {
          if (sessionStorage.getItem('__seeded')) return;
          for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
          sessionStorage.setItem('__seeded', '1');
        } catch {
          // storage blocked
        }
      }, store);
    }
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

  // ------------------------------------------------------------------------------------------------ cards
  await section('cards', async () => {
    const { ctx, page } = await open({ label: 'cards' });
    const read = () => page.evaluate(() => {
      const grid = document.getElementById('level-cards');
      const R = (el) => el.getBoundingClientRect();
      return {
        order: [...grid.children].map((el) => (el.matches('.act-head') ? `H:${el.textContent.trim()}` : el.matches('.level-card') ? `C${el.dataset.level}` : el.tagName)),
        heads: [...grid.querySelectorAll('.act-head')].map((h) => ({ tag: h.tagName, card: h.matches('.level-card'), w: Math.round(R(h).width), top: Math.round(R(h).top) })),
        gridW: Math.round(grid.clientWidth - parseFloat(getComputedStyle(grid).paddingLeft) - parseFloat(getComputedStyle(grid).paddingRight)),
        cards: [...grid.querySelectorAll('.level-card')].map((b) => {
          const pips = b.querySelector('.lvl-pips');
          return {
            n: Number(b.dataset.level),
            locked: b.disabled,
            name: (b.querySelector('.lvl-name') || {}).textContent,
            word: (b.querySelector('.diff-word') || {}).textContent,
            pips: pips && pips.getAttribute('aria-label'),
            role: pips && pips.getAttribute('role'),
            on: b.querySelectorAll('.lvl-pips .skull.on').length,
            all: b.querySelectorAll('.lvl-pips .skull').length,
            lock: ((b.querySelector('.lvl-lock') || {}).textContent || '').trim(),
            top: Math.round(R(b).top),
          };
        }),
        tagline: (document.querySelector('#menu-screen .tagline') || {}).textContent || '',
        meta: (document.querySelector('meta[name="description"]') || {}).content || '',
      };
    });
    const c = await read();
    const WORDS = ['Easy', 'Medium', 'Hard', 'Tricky', 'Tough', 'Legendary'];
    check(c.order.join(' | ') === 'H:Voyage I · The Old World | C1 | C2 | C3 | H:Voyage II · The Far Seas | C4 | C5 | C6',
      `title: six level cards in two act groups, each under its heading (${c.order.join(' | ')})`);
    check(c.heads.length === 2 && c.heads.every((h) => h.tag === 'H3' && !h.card && h.w >= c.gridW - 2),
      `title: the act headings are h3s spanning the grid, not level cards (${J({ heads: c.heads, gridW: c.gridW })})`);
    const rows = c.cards.map((k) => k.top);
    check(rows[0] === rows[1] && rows[1] === rows[2] && rows[3] === rows[4] && rows[4] === rows[5] && rows[3] > rows[0] && c.heads[1].top > rows[0] && c.heads[1].top < rows[3],
      `title: three cards per row at 1280x720, the second act under its own heading (${J({ rows, heads: c.heads.map((h) => h.top) })})`);
    check(c.cards.length === 6 && !c.cards[0].locked && c.cards.slice(1).every((k) => k.locked), `title: only level 1 is unlocked on a fresh profile (${J(c.cards.map((k) => k.locked))})`);
    check(c.cards.map((k) => k.word).join() === WORDS.join(), `title: difficulty labels Easy … Legendary (${c.cards.map((k) => k.word).join(', ')})`);
    check(c.cards.every((k, i) => k.pips === `Difficulty ${i + 1} of 6` && k.role === 'img' && k.on === i + 1 && k.all === 6),
      `title: skull pips "Difficulty N of 6" with N skulls lit (${J(c.cards.map((k) => [k.pips, k.on, k.all]))})`);
    check(c.cards[0].lock === 'Play' && c.cards[3].lock === 'Beat the Molten Maw' && [1, 2, 4, 5].every((i) => c.cards[i].lock === 'Locked'),
      `title: a locked card 4 reads "Beat the Molten Maw", the others "Locked" (${J(c.cards.map((k) => k.lock))})`);
    check(c.cards.slice(3).map((k) => k.name).join() === 'Doubloon Bay,Frostbite Straits,The Maelstrom', `title: Act II is Doubloon Bay, Frostbite Straits, The Maelstrom (${c.cards.map((k) => k.name).join(', ')})`);
    check(/Far Seas/.test(c.tagline) && /Far Seas/.test(c.meta), `title: the tagline and the page description mention the Far Seas ("${c.tagline.trim()}")`);
    // Beating the Act I finale opens card 4 (and only it); Enter on the focused card starts Doubloon Bay.
    await page.evaluate(() => { window.__game.state.unlocked = 4; window.__game.showMenu(); });
    const c4 = await read();
    await page.focus('.level-card.lvl-4');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__game.state.mode === 'playing', null, { timeout: 60000 }).catch(() => {});
    const started = await page.evaluate(() => ({ mode: window.__game.state.mode, level: window.__game.state.level, name: window.__game.env.meta && window.__game.env.meta.name }));
    check(c4.cards.filter((k) => !k.locked).length === 4 && c4.cards[3].lock === 'Play' && c4.cards[4].lock === 'Locked' && started.mode === 'playing' && started.level === 4,
      `title: with Doubloon Bay open its card says Play, and Enter on it sets sail there (${J({ unlocked: c4.cards.map((k) => k.lock), started })})`);
    await ctx.close();

    // The title at the F01 sizes: no page scroll, Set sail! and the Shipyard button in view at the top (the
    // panel may scroll inside); every card can be scrolled to and tapped (44 px, uncovered).
    const titleProbe = () => {
      const out = [];
      const de = document.documentElement;
      if (de.scrollWidth > innerWidth + 1 || de.scrollHeight > innerHeight + 1) out.push(`the page scrolls (${de.scrollWidth}x${de.scrollHeight})`);
      const R = (el) => el.getBoundingClientRect();
      const name = (el) => el.id || String(el.className).split(' ').slice(0, 2).join('.');
      const scroller = [...document.querySelectorAll('#menu-screen *')].find((e) => e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY));
      if (scroller) scroller.scrollTop = 0;
      const seen = (el) => {
        const b = R(el);
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        if (b.left < -0.5 || b.top < -0.5 || b.right > innerWidth + 0.5 || b.bottom > innerHeight + 0.5) return 'off screen';
        if (!(hit === el || el.contains(hit))) return `covered by ${hit && name(hit)}`;
        if (b.width < 44 || b.height < 44) return `only ${Math.round(b.width)}x${Math.round(b.height)}`;
        return null;
      };
      for (const id of ['start-btn', 'menu-dock-btn']) {
        const why = seen(document.getElementById(id));
        if (why) out.push(`#${id} ${why} with the panel at its top`);
      }
      for (const el of document.querySelectorAll('.level-card')) {
        el.scrollIntoView({ block: 'center' });
        const why = seen(el);
        if (why) out.push(`${name(el)} ${why}`);
      }
      if (window.scrollX || window.scrollY) out.push('showing a card scrolled the page');
      if (scroller) scroller.scrollTop = 0;
      return { problems: out, scrolls: scroller ? scroller.scrollHeight - scroller.clientHeight : 0 };
    };
    for (const touch of [true, false]) {
      const { ctx: tctx, page: tp } = await open({ touch, label: touch ? 'title-touch' : 'title', store: { 'pirates-ahoy-unlocked': '6' } });
      const sizes = touch ? [[320, 480], [360, 480], [390, 844], [844, 390], [568, 320], [640, 360]] : [[320, 480], [1280, 720], [568, 320], [640, 360]];
      for (const [w, h] of sizes) {
        await tp.setViewportSize({ width: w, height: h });
        await tp.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [w, h], { timeout: 60000 });
        await frames(tp, 2);
        await tp.evaluate(() => document.getAnimations().forEach((a) => { try { if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch { /* */ } }));
        const r = await tp.evaluate(titleProbe);
        check(r.problems.length === 0, `title ${w}x${h}${touch ? ' touch' : ''}: no page scroll, Set sail! and the Shipyard in view, all 6 cards reachable (panel scrolls ${r.scrolls}px)${r.problems.length ? ' -> ' + r.problems.join('; ') : ''}`);
        // Keyboard: Tab through the cards; each focused card is scrolled into view, not left under the
        // buttons pinned to the panel's foot (§13: a visible focus).
        await tp.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); const sc = [...document.querySelectorAll('#menu-screen *')].find((e) => e.scrollHeight > e.clientHeight + 1); if (sc) sc.scrollTop = 0; });
        const tabbed = [];
        for (let i = 0; i < 12 && tabbed.length < 6; i++) {
          await tp.keyboard.press('Tab');
          const f = await tp.evaluate(() => {
            const el = document.activeElement;
            if (!el || !el.classList.contains('level-card')) return null;
            const b = el.getBoundingClientRect();
            const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
            const ring = getComputedStyle(el).outlineStyle !== 'none';
            return { n: Number(el.dataset.level), seen: (hit === el || el.contains(hit)) && b.top >= 0 && b.bottom <= innerHeight, by: hit && (hit.id || String(hit.className).split(' ')[0]), ring };
          });
          if (f && !tabbed.some((t) => t.n === f.n)) tabbed.push(f);
        }
        const hidden = tabbed.filter((t) => !t.seen || !t.ring).map((t) => `card ${t.n}${t.seen ? '' : ' under ' + t.by}${t.ring ? '' : ' (no focus ring)'}`);
        check(tabbed.length === 6 && hidden.length === 0, `title ${w}x${h}${touch ? ' touch' : ''}: Tab reaches all 6 cards, each in view with a focus ring${hidden.length ? ' -> ' + hidden.join('; ') : ''}${tabbed.length !== 6 ? ` (${tabbed.length} reached)` : ''}`);
      }
      await tctx.close();
    }
  });

  // ----------------------------------------------------------------------------------------------- finale
  await section('finale', async () => {
    const { ctx, page } = await open({ label: 'finale' });
    // Win the Molten Maw (level 3) with 400 gold of voyage plunder so far.
    const winL3 = () => ev(page, async () => {
      const G = window.__game;
      T.level(3);
      G.state.gold = 400;
      G.state.goldAtLevelStart = 400;
      for (let w = 0; w < 4 && G.state.mode === 'playing'; w++) {
        G.enemies.forEach((e) => G.fighting(e) && G.damage(e, 9999));
        T.steps(1, () => G.state.mode === 'playing');
      }
      T.steps(10, () => G.state.mode === 'playing');
      await T.redraw();
      const panel = document.querySelector('#won-screen .panel') || document.getElementById('won-screen');
      const buttons = [...panel.querySelectorAll('button')].filter((b) => !b.closest('.hidden') && b.getClientRects().length);
      return {
        mode: G.state.mode,
        gold: G.state.gold,
        shown: T.shown('won-screen'),
        text: T.text('won-text'),
        want: G.LEVELS[2].finaleText,
        act2: T.shown('act2-btn'),
        act2Text: T.text('act2-btn'),
        first: buttons[0] && buttons[0].id,
        againAlt: document.getElementById('again-btn').classList.contains('alt'),
        hint: T.shown('won-hint') ? T.text('won-hint') : null,
        unlocked: G.state.unlocked,
        savedUnlocked: localStorage.getItem('pirates-ahoy-unlocked'),
        best: Number(localStorage.getItem('pirates-ahoy-best')),
      };
    });
    const w1 = await winL3();
    check(w1.mode === 'won' && w1.shown && w1.text === w1.want && /Far Seas/.test(w1.text), `the Molten Maw is still a finale: Victory screen with its own words ("${w1.text}")`);
    check(w1.act2 && w1.act2Text === 'Sail on to the Far Seas' && w1.first === 'act2-btn' && w1.againAlt && !!w1.hint && /Enter/.test(w1.hint),
      `Victory: "Sail on to the Far Seas" is the first button, Main menu steps back, a hint says Enter sails on (${J({ first: w1.first, text: w1.act2Text, alt: w1.againAlt, hint: w1.hint })})`);
    check(w1.unlocked === 4 && w1.savedUnlocked === '4' && w1.best === w1.gold && w1.gold > 400, `Victory: Doubloon Bay is unlocked and saved, the best plunder saved (${J({ unlocked: w1.unlocked, saved: w1.savedUnlocked, best: w1.best, gold: w1.gold })})`);
    await page.click('#act2-btn');
    const s1 = await page.evaluate(() => ({ mode: window.__game.state.mode, level: window.__game.state.level, gold: window.__game.state.gold, atStart: window.__game.state.goldAtLevelStart, won: !document.getElementById('won-screen').classList.contains('hidden') }));
    check(s1.mode === 'playing' && s1.level === 4 && s1.gold === w1.gold && s1.atStart === w1.gold && !s1.won, `"Sail on to the Far Seas" starts Doubloon Bay with the voyage gold (${J({ ...s1, wonGold: w1.gold })})`);
    const w2 = await winL3();
    await page.keyboard.press('Enter');
    const s2 = await page.evaluate(() => ({ mode: window.__game.state.mode, level: window.__game.state.level, gold: window.__game.state.gold }));
    check(w2.mode === 'won' && s2.mode === 'playing' && s2.level === 4 && s2.gold === w2.gold, `Enter on the Victory screen sails on to Doubloon Bay with the voyage gold (${J({ ...s2, wonGold: w2.gold })})`);
    // The won screen's shipyard: its ways out, the All aboard? dialog's too, and the first one sails on.
    await winL3();
    const dock = await page.evaluate(() => {
      const G = window.__game;
      G.dock.open('won');
      const exits = [...document.querySelectorAll('#dock-exits button')].map((b) => b.textContent.trim()).join(' | ');
      G.dock.ashore();
      G.town.open('ship');
      const aboard = [...document.querySelectorAll('#aboard-exits button')].map((b) => b.textContent.trim()).join(' | ');
      const harbour = (G.town.back(), G.town.api.harbour(), [...document.querySelectorAll('#harbour-exits button')].map((b) => b.textContent.trim()).join(' | '));
      G.town.back();
      return { from: G.dock.from, exits, aboard, harbour, rumour: null };
    });
    const want = 'Set sail for Doubloon Bay | Back to the title';
    check(dock.from === 'won' && dock.exits === want && dock.aboard === want && dock.harbour === want,
      `the won shipyard's ways out read "${want}" in the footer, All aboard? and the Harbour menu (${J(dock)})`);
    await page.evaluate(() => { window.__game.town.open('ship'); });
    await page.click('#aboard-next-btn');
    await page.waitForFunction(() => window.__game.state.mode === 'playing', null, { timeout: 60000 }).catch(() => {});
    const s3 = await page.evaluate(() => ({ mode: window.__game.state.mode, level: window.__game.state.level, town: window.__game.town.active, aboard: !document.getElementById('aboard-dialog').classList.contains('hidden') }));
    check(s3.mode === 'playing' && s3.level === 4 && !s3.aboard, `All aboard? "Set sail for Doubloon Bay" starts level 4 (${J(s3)})`);
    // After the Maelstrom (also a finale): the legend's words, no Sail on, and Enter goes to the title.
    const w6 = await ev(page, async () => {
      const G = window.__game;
      T.level(6);
      const banners = [];
      for (let w = 0; w < 6 && G.state.mode === 'playing'; w++) {
        for (const e of G.enemies) {
          if (!G.fighting(e)) continue;
          if (e.type.ghost) {
            e.rise = 0;
            G.capture.take(e); // she can't be sunk: the last blow is a capture
          } else G.damage(e, 9999);
        }
        T.steps(1, () => {
          if (T.shown('banner')) banners.push(T.text('banner'));
          return G.state.mode === 'playing';
        });
      }
      T.steps(10, () => {
        if (G.state.mode === 'playing' && T.shown('banner')) banners.push(T.text('banner'));
        return G.state.mode === 'playing';
      });
      await T.redraw();
      return {
        mode: G.state.mode,
        level: G.state.level,
        text: T.text('won-text'),
        act2: T.shown('act2-btn'),
        hint: T.shown('won-hint'),
        againAlt: document.getElementById('again-btn').classList.contains('alt'),
        legend: G.feats.legend,
        victory: [...new Set(banners)].filter((b) => /Victory/.test(b)),
      };
    });
    check(w6.mode === 'won' && w6.level === 6 && w6.text === 'The Phantom Galleon is yours! You are the Legend of the Seven Seas.' && !w6.act2 && !w6.hint && !w6.againAlt && w6.legend === 1,
      `after the Maelstrom: the legend's words, no "Sail on", Main menu is the main button again (${J(w6)})`);
    check(w6.victory.some((b) => /The Phantom Galleon is yours!/.test(b) && /The seas are yours/.test(b)), `the Maelstrom's victory banner names the captured Phantom (${J(w6.victory)})`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__game.state.mode !== 'won', null, { timeout: 60000 }).catch(() => {});
    const s6 = await page.evaluate(() => ({ mode: window.__game.state.mode, menu: !document.getElementById('menu-screen').classList.contains('hidden') }));
    check(s6.mode === 'menu' && s6.menu, `Enter after the last level goes to the title (${J(s6)})`);
    await ctx.close();
  });

  // --------------------------------------------------------------------------------------------- doubloon
  await section('doubloon', async () => {
    const { ctx, page } = await open({ label: 'doubloon' });
    // The galleons head for the escape gate farthest from you.
    const run = await ev(page, () => {
      const G = window.__game;
      const p = T.level(4, { clear: false });
      const gates = G.env.escapes;
      const g = G.enemies.find((e) => e.type.merchant);
      const far = gates.slice().sort((a, b) => Math.hypot(b.x - p.x, b.z - p.z) - Math.hypot(a.x - p.x, a.z - p.z))[0];
      const runner = G.mechanics.state.convoy.runners.find((r) => r.type === 'galleon');
      const start = { x: g.x, z: g.z, fromYou: Math.round(Math.hypot(g.x - p.x, g.z - p.z)) };
      // open water (land and sandbars out of the way), her escorts parked, you held still: she cruises off
      G.colliders.forEach((c) => (c.x += 5000));
      G.reefs.forEach((r) => (r.x += 5000));
      G.enemies.filter((e) => e !== g).forEach((e, k) => T.park(e, k));
      const d0 = Math.hypot(g.x - far.x, g.z - far.z);
      T.steps(8, () => {
        p.speed = 0;
      });
      const d1 = Math.hypot(g.x - far.x, g.z - far.z);
      const heading = Math.abs(T.wrap(g.h - Math.atan2(far.x - g.x, far.z - g.z)));
      const r = G.mechanics.state.convoy.runners.find((q) => q.type === 'galleon');
      return { gates: gates.length, farGate: [far.x, far.z], runnerGate: [runner.gateX, runner.gateZ], d0: Math.round(d0), d1: Math.round(d1), speed: +g.speed.toFixed(2), cruise: +(g.type.maxSpeed * 0.7).toFixed(2), heading: +heading.toFixed(3), fleeing: r.fleeing, fromYou: Math.round(Math.hypot(g.x - p.x, g.z - p.z)), start };
    });
    check(run.gates === 2 && near(run.runnerGate[0], run.farGate[0], 1e-6) && near(run.runnerGate[1], run.farGate[1], 1e-6) && run.start.fromYou >= 45,
      `Doubloon Bay: the treasure galleon sets out from a convoy start for the escape gate farthest from you (${J({ gate: run.runnerGate, far: run.farGate, fromYou: run.start.fromYou })})`);
    check(!run.fleeing && near(run.speed, run.cruise, 0.05) && run.d0 - run.d1 > 25 && run.heading < 0.05,
      `Doubloon Bay: unchased she cruises at 0.7 × her top speed straight for that gate (${J({ d0: run.d0, d1: run.d1, speed: run.speed, cruise: run.cruise, heading: run.heading, fromYou: run.fromYou })})`);
    // Chased (you within 35 u) she runs at full speed, zig-zagging ±0.4 rad off her course to the gate.
    const flee = await ev(page, () => {
      const G = window.__game;
      const p = T.level(4, { clear: false });
      const g = G.enemies.find((e) => e.type.merchant);
      G.colliders.forEach((c) => (c.x += 5000));
      G.reefs.forEach((r) => (r.x += 5000));
      G.enemies.filter((e) => e !== g).forEach((e, k) => T.park(e, k));
      g.reload.port = g.reload.star = 99;
      const offs = [];
      const at = [360, 420, 468, 840, 900, 948]; // the end of each leg (she turns at 0.5 rad/s, legs switch every 4 s)
      T.steps(8, (i) => {
        // you 20 u astern of her
        G.place(p, g.x - Math.sin(g.h) * 20, g.z - Math.cos(g.h) * 20, g.h);
        p.speed = 0;
        g.reload.port = g.reload.star = 99;
        if (at.includes(i)) {
          const r = G.mechanics.state.convoy.runners.find((q) => q.type === 'galleon');
          offs.push(+T.wrap(g.h - Math.atan2(r.gateX - g.x, r.gateZ - g.z)).toFixed(2));
        }
      });
      const r = G.mechanics.state.convoy.runners.find((q) => q.type === 'galleon');
      return { fleeing: r.fleeing, speed: +g.speed.toFixed(2), max: g.type.maxSpeed, offs };
    });
    check(flee.fleeing && flee.speed > flee.max * 0.95 && flee.offs.length === 6 && flee.offs.every((o) => Math.abs(Math.abs(o) - 0.4) < 0.12) &&
      flee.offs.slice(0, 3).every((o) => Math.sign(o) === Math.sign(flee.offs[0])) && flee.offs.slice(3).every((o) => Math.sign(o) === -Math.sign(flee.offs[0])),
      `Doubloon Bay: chased within 35 u she runs at full speed, zig-zagging 0.4 rad off her course (${J(flee)})`);
    // A galleon placed in her gate escapes: gone, no gold, no sinking, the objective line counts her.
    const esc = await ev(page, async () => {
      const G = window.__game;
      T.level(4);
      const g = G.enemies.find((e) => e.type.merchant);
      g.rise = 0;
      const r = G.mechanics.state.convoy.runners.find((q) => q.type === 'galleon');
      const before = { gold: G.state.gold, coins: G.coins.length, sunk: G.state.sunk, objective: G.mechanics.objective };
      G.place(g, r.gateX, r.gateZ);
      g.speed = 0;
      let banner = '';
      T.steps(0.2, () => {
        if (!banner && T.shown('banner')) banner = T.text('banner');
      });
      const out = { escaped: !!g.escaped, fighting: G.fighting(g), mech: G.mechanics.state.convoy.escaped, after: { gold: G.state.gold, coins: G.coins.length, sunk: G.state.sunk, objective: G.mechanics.objective }, before, banner };
      T.steps(0.5);
      out.removed = !G.enemies.includes(g);
      return out;
    });
    // (the pill follows within a quarter of a second of play: let the real loop run a few frames)
    esc.pill = await page.evaluate(async () => {
      const G = window.__game;
      G.state.mode = 'playing';
      for (let i = 0; i < 300 && !(T.shown('objective') && T.text('objective') === G.mechanics.objective); i++) await new Promise((r) => requestAnimationFrame(r));
      G.state.mode = 'paused';
      return T.shown('objective') ? T.text('objective') : null;
    });
    check(esc.escaped && !esc.fighting && esc.mech === 1 && esc.removed && esc.after.gold === esc.before.gold && esc.after.coins === esc.before.coins && esc.after.sunk === esc.before.sunk && /escaped with its gold/.test(esc.banner),
      `Doubloon Bay: a galleon in her gate escapes: out of the fight, removed, no gold, no sinking ("${esc.banner}")`);
    check(esc.before.objective === 'Galleons: 0 taken · 0 escaped · 2 to go' && esc.after.objective === 'Galleons: 0 taken · 1 escaped · 1 to go' && esc.pill === esc.after.objective,
      `Doubloon Bay: the objective line counts her ("${esc.before.objective}" -> "${esc.after.objective}"; pill "${esc.pill}")`);
    // Capturing one: 525 gold at once, and 150 more at the level's end (plus the level's and the prize bonus).
    const cap = await ev(page, async () => {
      const G = window.__game;
      T.level(4);
      G.state.gold = 0;
      G.state.goldAtLevelStart = 0;
      const g = G.enemies.find((e) => e.type.merchant);
      g.rise = 0;
      const gold0 = G.state.gold;
      const paid = G.capture.take(g);
      const gained = G.state.gold - gold0;
      const out = { paid, gained, rule: G.combat.rules.captureGold(G.SHIP_TYPES.galleon.gold), objective: G.mechanics.objective, bonusNow: G.mechanics.bonus() };
      // everyone else gets away (no sinking, so no coins): the next wave comes, and then the level is cleared
      for (let w = 0; w < 4 && G.state.mode === 'playing'; w++) {
        T.escapeAll();
        T.steps(1, () => G.state.mode === 'playing');
      }
      T.steps(10, () => G.state.mode === 'playing');
      await T.redraw();
      Object.assign(out, { mode: G.state.mode, gold: G.state.gold, captures: G.state.captures, bonus: G.LEVELS[3].bonus, prize: G.combat.rules.CAPTURE.prizeBonus, summary: T.text('level-summary'), coins: G.coins.length });
      return out;
    });
    const wantEnd = 525 + cap.bonus + cap.prize + 150;
    check(cap.rule === 525 && cap.paid === 525 && cap.gained === 525 && cap.bonusNow === 150 && cap.objective === 'Galleons: 1 taken · 0 escaped · 1 to go',
      `Doubloon Bay: capturing a treasure galleon pays 525 at once and adds 150 to the level's end (${J({ paid: cap.paid, gained: cap.gained, bonus: cap.bonusNow, objective: cap.objective })})`);
    check(cap.mode === 'levelDone' && cap.captures === 1 && cap.gold === wantEnd && /Galleons taken: 1 of 2/.test(cap.summary) && /Treasure bonus: \+150/.test(cap.summary),
      `Doubloon Bay: at the level's end 525 + ${cap.bonus} level bonus + ${cap.prize} prize bonus + 150 treasure bonus = ${cap.gold} gold (want ${wantEnd}; "${cap.summary}")`);
    await ctx.close();
  });

  // ------------------------------------------------------------------------------------------------ frost
  await section('frost', async () => {
    const { ctx, page } = await open({ label: 'frost' });
    // The floes drift with simulated time only, on fixed paths (the same time puts them in the same place).
    const drift = await ev(page, async () => {
      const G = window.__game;
      T.level(5, { clear: false });
      G.enemies.forEach((e, k) => T.park(e, k));
      const ice = () => G.reefs.filter((r) => r.ice).map((r) => ({ x: r.x, z: r.z, r: r.r }));
      const a = ice();
      const t0 = G.state.time;
      G.state.mode = 'paused';
      for (let i = 0; i < 3; i++) await T.redraw();
      const b = ice();
      G.state.mode = 'playing';
      T.steps(2);
      const c = ice();
      const t1 = G.state.time;
      G.env.step(t0, 0);
      const back = ice();
      G.env.step(t1, 0);
      const again = ice();
      const moved = a.map((f, i) => Math.hypot(c[i].x - f.x, c[i].z - f.z));
      const same = (u, v) => u.every((f, i) => Math.abs(f.x - v[i].x) < 1e-9 && Math.abs(f.z - v[i].z) < 1e-9);
      return { n: a.length, still: same(a, b), moved: moved.map((m) => +m.toFixed(2)), back: same(back, a), again: same(again, c), crunchable: G.mechanics.state.floes.count };
    });
    check(drift.n === 8 && drift.crunchable === 8 && drift.still && drift.moved.every((m) => m > 0.8 && m < 3) && drift.back && drift.again,
      `Frostbite Straits: the 8 ice floes stand still while drawn paused, drift 0.6-1.2 u/s with sim time, and the same time puts them back in the same place (${J(drift)})`);
    // A fast ship crunching a floe takes 6, at most once per 1.5 s; a slow one doesn't.
    const crunch = await ev(page, () => {
      const G = window.__game;
      const run = (speed, seconds) => {
        const p = T.level(5);
        G.reefs.forEach((r) => r.ice && (r.x -= 5000)); // (T.level moved every reef away: the ice comes back)
        const f = G.reefs.find((r) => r.ice);
        const hurt0 = (G.state.hurtBy && G.state.hurtBy.ice) || 0;
        const c0 = G.mechanics.state.floes.crunches;
        const hits = [];
        let hp = p.hp;
        T.steps(seconds, () => {
          G.place(p, f.x, f.z, p.h);
          p.speed = speed;
          if (p.hp < hp) hits.push(+G.state.time.toFixed(3));
          hp = p.hp;
        });
        return { crunches: G.mechanics.state.floes.crunches - c0, ice: Math.round((((G.state.hurtBy && G.state.hurtBy.ice) || 0) - hurt0) * 1000) / 1000, hits };
      };
      return { fast: run(8, 3.2), slow: run(5, 3.2) };
    });
    const gaps = crunch.fast.hits.slice(1).map((t, i) => +(t - crunch.fast.hits[i]).toFixed(3));
    check(crunch.fast.crunches === 3 && crunch.fast.ice === 18 && gaps.every((g) => g >= 1.49 && g <= 1.52), `Frostbite Straits: a fast hull in a floe takes 6 per CRUNCH!, once per 1.5 s (${J({ ...crunch.fast, gaps })})`);
    check(crunch.slow.crunches === 0 && crunch.slow.ice === 0, `Frostbite Straits: a hull at 5 u/s pushes through a floe without a crunch (${J(crunch.slow)})`);
    // Ice slows every ship, the shallow raider too (to 0.55 × her top speed).
    const slow = await ev(page, () => {
      const G = window.__game;
      const p = T.level(5);
      G.reefs.forEach((r) => r.ice && (r.x -= 5000));
      const f = G.reefs.find((r) => r.ice);
      const e = G.spawn('raider', p.x + 60, p.z + 60, 0);
      e.rise = 0;
      const open = G.combat.effects(e).speedCap;
      G.place(e, f.x, f.z, 0);
      e.speed = e.type.maxSpeed;
      let top = 0;
      T.steps(1, (i) => {
        G.place(e, f.x, f.z, e.h);
        if (i > 60) top = Math.max(top, e.speed);
      });
      return { open, ice: G.combat.effects(e).speedCap, max: e.type.maxSpeed, top: +top.toFixed(2), shallow: !!e.type.shallow };
    });
    check(slow.shallow && near(slow.open, slow.max, 1e-6) && near(slow.ice, slow.max * 0.55, 1e-6) && slow.top <= slow.ice + 0.05,
      `Frostbite Straits: ice slows a (shallow) raider to 0.55 × her top speed (${J(slow)})`);
    await ctx.close();
  });

  // ------------------------------------------------------------------------------------------- maelstrom
  await section('maelstrom', async () => {
    const { ctx, page } = await open({ label: 'maelstrom' });
    // The current at r 40 (and 76): the §6.3 drift; ghosts ignore it.
    const cur = await ev(page, () => {
      const G = window.__game;
      const p = T.level(6);
      const C = G.env.current;
      const at = (s, d, ang) => G.place(s, C.x + Math.sin(ang) * d, C.z + Math.cos(ang) * d, 0.3);
      const measure = (s, d, ang) => {
        at(s, d, ang);
        s.speed = 0;
        const x0 = s.x;
        const z0 = s.z;
        T.steps(0.1, () => {
          s.speed = 0;
        });
        const vx = (s.x - x0) / 0.1;
        const vz = (s.z - z0) / 0.1;
        // the §6.3 formula at the middle of that short path
        const mx = (s.x + x0) / 2 - C.x;
        const mz = (s.z + z0) / 2 - C.z;
        const m = Math.hypot(mx, mz);
        const k = m < C.r ? 1 - m / C.r : 0;
        const want = m < C.r ? [(-C.pull * k * mx) / m + (C.swirl * k * mz) / m, (-C.pull * k * mz) / m - (C.swirl * k * mx) / m] : [0, 0];
        return { got: [+vx.toFixed(3), +vz.toFixed(3)], want: [+want[0].toFixed(3), +want[1].toFixed(3)], h: +s.h.toFixed(3) };
      };
      const r40 = measure(p, 40, 1.1);
      const r40b = measure(p, 40, -2.3);
      const r76 = measure(p, 76, 0.4);
      // (enemies held without their AI, so only the current moves them)
      const cut = G.spawn('cutter', C.x + 40, C.z, 0);
      cut.rise = 1e6;
      const enemy = measure(cut, 40, 2.0);
      G.place(cut, C.x + 300, C.z);
      const ph = G.spawn('phantom', C.x + 40, C.z, 0);
      ph.rise = 1e6;
      const ghost = measure(ph, 40, 2.0);
      return { C: { r: C.r, pull: C.pull, swirl: C.swirl, eye: C.eye, eyeDps: C.eyeDps }, r40, r40b, r76, enemy, ghost };
    });
    const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= 0.03 * Math.hypot(b[0], b[1]) + 0.01;
    check(cur.C.r === 75 && cur.C.pull === 3.2 && cur.C.swirl === 2.8 && close(cur.r40.got, cur.r40.want) && close(cur.r40b.got, cur.r40b.want) && close(cur.enemy.got, cur.enemy.want) && Math.hypot(...cur.r40.want) > 1.9 && cur.r40.h === 0.3,
      `The Maelstrom: a ship at r 40 (yours, or a pirate) drifts by the §6.3 formula, pulled in and swirled round, her heading untouched (${J({ r40: cur.r40, r40b: cur.r40b, cutter: cur.enemy })})`);
    check(Math.hypot(...cur.r76.got) < 1e-6 && Math.hypot(...cur.ghost.got) < 1e-6, `The Maelstrom: no drift outside r 75, and none for the Phantom (${J({ r76: cur.r76.got, ghost: cur.ghost.got })})`);
    // The eye grinds 5 hp/s (1 every 0.2 s) off any ship but the ghost; the first time, a banner says so.
    const eye = await ev(page, () => {
      const G = window.__game;
      const p = T.level(6);
      const C = G.env.current;
      // three ships in the eye, far enough apart not to touch: you, a cutter and the Phantom
      const spots = [[-4.5, 0], [4.5, 0], [0, -11]];
      const e = G.spawn('cutter', C.x + spots[1][0], C.z + spots[1][1], 0);
      const ph = G.spawn('phantom', C.x + spots[2][0], C.z + spots[2][1], Math.PI / 2);
      e.rise = ph.rise = 0;
      T.noBanner();
      const ships = [p, e, ph];
      const hp = ships.map((s) => s.hp);
      const banners = [];
      T.steps(2, () => {
        ships.forEach((s, i) => {
          G.place(s, C.x + spots[i][0], C.z + spots[i][1], s.h);
          s.speed = 0;
          if (s !== p) s.reload.port = s.reload.star = 99;
        });
        if (T.shown('banner') && !banners.includes(T.text('banner'))) banners.push(T.text('banner'));
      });
      const lost = ships.map((s, i) => +(hp[i] - s.hp).toFixed(3));
      return { you: lost[0], cutter: lost[1], ghost: lost[2], hurtBy: G.state.hurtBy, banners, eyeDamage: G.mechanics.state.current.eyeDamage };
    });
    check(eye.you === 10 && eye.cutter === 10 && eye.ghost === 0 && eye.hurtBy && eye.hurtBy.maelstrom === 10 && eye.banners.some((b) => /maelstrom pulls you in/i.test(b)),
      `The Maelstrom: 2 s in the eye cost you and a cutter 10 hp each (5 hp/s), the Phantom nothing; a banner warns you (${J(eye)})`);
    // The Phantom Galleon rises with the second wave: beside the eye, from the deep, holding fire meanwhile.
    const rise = await ev(page, async () => {
      const G = window.__game;
      const p = T.level(6, { clear: false });
      p.hp = p.maxHp = 1e6;
      G.colliders.forEach((c) => (c.x += 5000));
      let banner = '';
      G.enemies.forEach((e) => G.fighting(e) && G.damage(e, 9999));
      let ph = null;
      T.steps(0.2, () => {
        ph = ph || G.enemies.find((e) => e.type.ghost);
        if (ph && !banner && T.shown('banner')) banner = T.text('banner');
        return !ph;
      });
      ph = G.enemies.find((e) => e.type.ghost);
      if (!ph) return { spawned: false };
      const C = G.env.current;
      const out = { spawned: true, rise0: +ph.rise.toFixed(2), fromEye: +Math.hypot(ph.x - C.x, ph.z - C.z).toFixed(2), banner };
      G.state.mode = 'paused';
      await T.redraw();
      out.y0 = +ph.mesh.position.y.toFixed(2);
      G.state.mode = 'playing';
      // she holds her fire while rising (you right beside her)
      G.place(p, ph.x + Math.cos(ph.h) * 12, ph.z - Math.sin(ph.h) * 12, ph.h);
      const balls0 = G.balls.filter((b) => b.owner !== 'player').length;
      let fired = 0;
      T.steps(2.6, () => {
        p.speed = 0;
        fired = Math.max(fired, G.balls.filter((b) => b.owner !== 'player').length - balls0);
        return ph.rise > 0;
      });
      out.firedRising = fired;
      T.steps(0.6);
      out.rise1 = ph.rise;
      G.state.mode = 'paused';
      await T.redraw();
      out.y1 = +ph.mesh.position.y.toFixed(2);
      return out;
    });
    check(rise.spawned && rise.rise0 > 2.7 && rise.rise0 <= 3 && near(rise.fromEye, 18, 0.5) && /Phantom Galleon rises/.test(rise.banner) && rise.y0 < -4 && rise.firedRising === 0 && rise.rise1 === 0 && rise.y1 > -1.5,
      `The Maelstrom: the Phantom Galleon rises 18 u from the eye with the second wave, from 6 u down to the surface in 3 s, holding her fire meanwhile ("${rise.banner}"; ${J({ ...rise, banner: undefined })})`);
    // Lightning: the level's bombs are lightning; a white-blue ring warns for 1.4-1.6 s, then the bolt strikes it.
    const bolt = await ev(page, async () => {
      const G = window.__game;
      const p = T.level(6);
      const L0 = G.env.lightning;
      G.launchBomb();
      const b = G.bombs[0];
      if (!b) return { launched: false };
      b.tx = p.x;
      b.tz = p.z;
      const out = { launched: true, kind: b.kind, T: +b.T.toFixed(3), ring: !!b.zone && !!b.zone.parent && b.zone.visible !== false, def: G.LEVELS[5].bombs };
      const hp0 = p.hp;
      T.steps(b.T - 0.05, () => {
        p.speed = 0;
      });
      out.before = { hurt: +(hp0 - p.hp).toFixed(3), bombs: G.bombs.length };
      T.steps(0.2, () => {
        p.speed = 0;
      });
      out.after = { hurt: +(hp0 - p.hp).toFixed(3), bombs: G.bombs.length, by: G.state.hurtBy && G.state.hurtBy.lightning };
      G.env.update(9000 + G.state.time, 1 / 60, { camera: G.camera, simTime: G.state.time });
      const L1 = G.env.lightning;
      out.strikes = L1.strikes - L0.strikes;
      out.boltShown = L1.boltVisible;
      return out;
    });
    check(bolt.launched && bolt.kind === 'lightning' && bolt.ring && bolt.T >= bolt.def.warn[0] && bolt.T <= bolt.def.warn[1] && bolt.before.hurt === 0 && bolt.before.bombs === 1,
      `The Maelstrom: lightning first shows its warning ring for ${bolt.T} s (warn ${J(bolt.def && bolt.def.warn)}) and hurts nobody meanwhile (${J(bolt.before)})`);
    check(bolt.after.hurt === bolt.def.damage && bolt.after.by === bolt.def.damage && bolt.after.bombs === 0 && bolt.strikes === 1 && bolt.boltShown === true,
      `The Maelstrom: then it strikes: ${bolt.after.hurt} damage to a ship in the ring and a bolt from the sky (${J({ ...bolt.after, strikes: bolt.strikes, bolt: bolt.boltShown })})`);
    // The sky flash keeps to one per 3 s (photosensitivity, §13): strikes at 0, 1, 2, 3.2 and 4 s.
    const flashes = (pg) => ev(pg, () => {
      const G = window.__game;
      T.level(6);
      G.state.mode = 'paused';
      const env = G.env;
      const L0 = env.lightning;
      const t0 = 5000 + G.state.time;
      const series = [];
      const strikeAt = [0, 1, 2, 3.2, 4];
      let next = 0;
      for (let i = 0; i <= 7 * 60; i++) {
        const t = i / 60;
        while (next < strikeAt.length && strikeAt[next] <= t + 1e-9) {
          env.flash(Math.sin(next) * 30, Math.cos(next) * 30);
          next++;
        }
        env.update(t0 + t, 1 / 60, { camera: G.camera, simTime: G.state.time });
        series.push(env.lightning.overlay);
      }
      const L1 = env.lightning;
      // flashes: the overlay rising from (near) nothing
      const rises = [];
      for (let i = 1; i < series.length; i++) if (series[i] > 0.02 && series[i - 1] <= 0.02) rises.push(+(i / 60).toFixed(3));
      const at = (s) => series[Math.round(s * 60)];
      return { strikes: L1.strikes - L0.strikes, sky: L1.skyFlashes - L0.skyFlashes, max: +Math.max(...series).toFixed(3), rises, sudden: +at(0.05).toFixed(3), gap: L1.gap };
    });
    const fl = await flashes(page);
    const gapsOk = fl.rises.slice(1).every((t, i) => t - fl.rises[i] >= 3 - 1e-6);
    check(fl.strikes >= 4 && fl.sky === 2 && fl.max <= 0.25 && fl.max > 0.15 && gapsOk && fl.rises.length === 2 && fl.sudden > 0.15,
      `The Maelstrom: five strikes in 4 s give 2 sky flashes, at least 3 s apart, never brighter than 0.25 (${J(fl)})`);
    await ctx.close();
    // Under reduced motion there is no flash: a slow, faint sky tint instead.
    const { ctx: rctx, page: rp } = await open({ label: 'maelstrom-reduced', reducedMotion: 'reduce' });
    const calm = await flashes(rp);
    check(calm.max <= 0.1 && calm.sudden < 0.02 && calm.rises.every((t, i) => i === 0 || t - calm.rises[i - 1] >= 3 - 1e-6),
      `The Maelstrom with reduced motion: no flash, only a slow sky tint (peak ${calm.max}, ${calm.sudden} after 0.05 s; ${J(calm)})`);
    await rctx.close();
  });

  // -------------------------------------------------------------------------------------------------- bot
  await section('bot', async () => {
    const { ctx, page } = await open({ label: 'bot' });
    const results = [];
    for (const n of [4, 5, 6]) {
      let r = null;
      const tries = [];
      for (let attempt = 1; attempt <= 2; attempt++) {
        r = await page.evaluate(botLevel, { n, profile: 'mid', maxT: 900 });
        tries.push(r.result);
        if (r.result === 'levelDone' || r.result === 'won') break;
      }
      r.tries = tries.join('>');
      results.push(r);
      console.log('      bot v2:', J(r));
    }
    const won = (r) => r.result === 'levelDone' || r.result === 'won';
    check(results.every((r) => won(r) && r.time <= 900), `Act II bot (mid-game ship): levels 4-6 each cleared within 900 s, a second try allowed (${results.map((r) => `L${r.level} ${r.tries} in ${r.time} s`).join(', ')})`);
    check(results.every((r) => r.damageTaken > 0), `Act II bot: every level fights back (damage taken ${results.map((r) => r.damageTaken).join(' / ')})`);
    check(results[2].damageTaken > results[0].damageTaken, `Act II bot: the Maelstrom hurts more than Doubloon Bay (${results[2].damageTaken} > ${results[0].damageTaken})`);
    check(results.every((r) => r.stuck === 0), `Act II bot: the ship never ends up inside land (${results.map((r) => r.stuck).join(' / ')})`);
    check(results[0].taken > 0 && results[2].captures > 0, `Act II bot: it takes a treasure galleon in Doubloon Bay and captures in the Maelstrom (${J(results.map((r) => ({ level: r.level, captures: r.captures, taken: r.taken, escaped: r.escaped, boardings: r.boardings, raids: r.raids })))})`);
    await ctx.close();
  });

  // ------------------------------------------------------------------------------------------------ draws
  await section('draws', async () => {
    const { ctx, page } = await open({ label: 'draws' });
    // Level starts on a fresh (stock) profile: two frames into the fly-in, and with the chase camera.
    const starts = [];
    for (const n of [4, 5, 6]) {
      await page.evaluate((n) => { window.__game.state.tutorialDone = true; window.__game.newGame(n); }, n);
      await frames(page, 2);
      const fly = await page.evaluate(() => window.__game.renderInfo.calls);
      await ev(page, () => {
        const G = window.__game;
        G.state.intro = 0;
        T.steps(1);
      });
      await page.evaluate(() => T.redraw());
      const chase = await page.evaluate(() => window.__game.renderInfo.calls);
      await page.evaluate(() => T.noBanner());
      await page.evaluate(() => T.redraw());
      await snap(page, ['doubloon.png', 'frost.png', 'maelstrom.png'][n - 4]);
      starts.push({ n, fly, chase });
    }
    check(starts.every((s) => s.fly > 0 && s.fly <= 310 && s.chase > 0 && s.chase <= 310), `draw calls: each Act II level starts within 310, fly-in and chase camera (${starts.map((s) => `L${s.n} ${s.fly}/${s.chase}`).join(', ')})`);
    // A boarding on each Act II level with the rest of the wave alive, played in real frames: the most draw
    // calls in any frame, hooks to result. While the boarding view is on, the boarded ship's tag hides and her
    // sails turn see-through.
    const setups = {
      // a battered treasure galleon beside you, her two cutters close by
      4: () => {
        const G = window.__game;
        const p = T.level(4, { clear: false });
        G.colliders.forEach((c) => (c.x += 5000));
        G.reefs.forEach((r) => (r.x += 5000));
        p.speed = 0;
        G.state.sail = 0;
        const all = G.enemies.filter((e) => G.fighting(e));
        const g = all.find((e) => e.type.merchant);
        const R = (lat, along) => [p.x - Math.cos(p.h) * lat + Math.sin(p.h) * along, p.z + Math.sin(p.h) * lat + Math.cos(p.h) * along];
        G.place(g, ...R(8.5, 0), p.h);
        g.speed = 0;
        G.damage(g, g.maxHp * 0.5);
        G.combat.setCrew(g, 5);
        all.filter((e) => e !== g).forEach((e, k) => { G.place(e, ...R(-14 - 6 * k, 20 + 6 * k), p.h + 2); e.reload.port = e.reload.star = 99; });
        return { kind: 'attack', start: () => G.grapple(), target: g, ships: all.map((e) => e.typeName).join() };
      },
      // a raider boards you, the rest of her wave close by
      5: () => {
        const G = window.__game;
        const p = T.level(5, { clear: false });
        G.colliders.forEach((c) => (c.x += 5000));
        G.reefs.forEach((r) => (r.x += 5000));
        p.speed = 0;
        G.state.sail = 0;
        const all = G.enemies.filter((e) => G.fighting(e));
        const r = all.find((e) => e.typeName === 'raider');
        const R = (lat, along) => [p.x - Math.cos(p.h) * lat + Math.sin(p.h) * along, p.z + Math.sin(p.h) * lat + Math.cos(p.h) * along];
        G.place(r, ...R(-7.5, 0), p.h);
        r.speed = 0;
        all.filter((e) => e !== r).forEach((e, k) => { G.place(e, ...R(16 + 6 * k, 22 + 6 * k), p.h + 2); e.reload.port = e.reload.star = 99; });
        return { kind: 'defend', start: () => ({ ok: G.boarding.raid(r) }), target: r, ships: all.map((e) => e.typeName).join() };
      },
      // the spectral Phantom with her raider alongside
      6: () => {
        const G = window.__game;
        const p = T.level(6, { clear: false });
        G.colliders.forEach((c) => (c.x += 5000));
        p.hp = p.maxHp;
        p.speed = 0;
        G.state.sail = 0;
        G.enemies.forEach((e) => G.fighting(e) && G.damage(e, 9999));
        T.steps(0.5, () => {
          p.speed = 0;
        });
        const all = G.enemies.filter((e) => G.fighting(e));
        const ph = all.find((e) => e.type.ghost);
        // at the level start (out of the current): her beside you, the raider close by
        p.speed = 0;
        G.state.sail = 0;
        const R = (lat, along) => [p.x - Math.cos(p.h) * lat + Math.sin(p.h) * along, p.z + Math.sin(p.h) * lat + Math.cos(p.h) * along];
        ph.rise = 0;
        G.place(ph, ...R(9, 0), p.h);
        ph.speed = 0;
        G.damage(ph, 9999); // spectral: her hull stays at 1
        G.combat.setCrew(ph, 6);
        all.filter((e) => e !== ph).forEach((e, k) => { G.place(e, ...R(-15, 18 + 6 * k), p.h + 2); e.reload.port = e.reload.star = 99; });
        G.state.bannerTimer = 0.001;
        G.state.nextBomb = Infinity;
        return { kind: 'attack', start: () => G.grapple(), target: ph, ships: all.map((e) => e.typeName).join() };
      },
    };
    const boards = [];
    for (const n of [4, 5, 6]) {
      const t0 = Date.now();
      const setup = await ev(page, `(() => { const s = (${setups[n].toString()})(); window.__bt = s.target; const g = s.start(); return { kind: s.kind, ok: !!(g && g.ok), ships: s.ships, label: window.__game.boarding.kind }; })`);
      await page.evaluate(() => {
        const G = window.__game;
        const e = window.__bt;
        const rec = (window.__draws = { max: 0, at: null, frames: 0, by: {}, tagSeen: [], fade: [] });
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
          if (ph === 'brawl') {
            const t = G.tagInfo(e);
            rec.tagSeen.push(!!(t && t.visible));
            const deck = G.boarding.kind === 'defend' ? G.player : e;
            const sails = (deck.mesh.userData.sails || []).map((s) => s.material).flat().filter(Boolean);
            if (sails.length) rec.fade.push(Math.max(...sails.map((m) => (m.transparent ? m.opacity : 1))));
          }
          requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
        G.state.mode = 'playing';
      });
      await page.waitForFunction(() => window.__game.boarding.phase === 'brawl' || !window.__game.boarding.active, null, { timeout: 120000, polling: 20 });
      // 0.8 s into the brawl (the boarding view settled), then on to the result (Space would skip it too)
      await page.waitForFunction(() => window.__game.boarding.module.phaseTime >= 0.8 || window.__game.boarding.phase !== 'brawl', null, { timeout: 120000, polling: 20 });
      if (n === 6) {
        await page.evaluate(() => { window.__game.state.mode = 'paused'; });
        await frames(page, 2);
        await snap(page, 'maelstrom-boarding.png');
        await page.evaluate(() => { window.__game.state.mode = 'playing'; });
      }
      await page.evaluate(() => window.__game.boarding.skip());
      await page.waitForFunction(() => !window.__game.boarding.active, null, { timeout: 120000, polling: 20 });
      await page.evaluate(() => { window.__game.state.mode = 'paused'; });
      const d = await page.evaluate(() => window.__draws);
      boards.push({ n, secs: Math.round((Date.now() - t0) / 1000), ...setup, max: d.max, at: d.at, frames: d.frames, by: d.by, tagHidden: d.tagSeen.length > 0 && d.tagSeen.every((v) => !v), fade: d.fade.length ? +Math.min(...d.fade).toFixed(2) : null });
    }
    console.log(`      boardings: ${J(boards)}`);
    check(boards.every((b) => b.ok && b.frames >= 10 && ['reel', 'swing', 'brawl', 'result'].every((ph) => b.by[ph] > 0) && b.max > 0 && b.max <= 450),
      `draw calls: a boarding on each Act II level with her wave alive stays within 450 in every frame (${boards.map((b) => `L${b.n} ${b.kind} ${b.max} in ${b.at}`).join(', ')})`);
    check(boards.every((b) => b.tagHidden && b.fade !== null && b.fade < 0.5), `boarding view: the boarded ship's tag hides and the sails over the brawl's deck turn see-through (${boards.map((b) => `L${b.n} tag hidden ${b.tagHidden}, sails ${b.fade}`).join('; ')})`);
    await ctx.close();
  });

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 8).join(' | ') : ''}`);
  await browser.close();
  server.close();
  console.log(`\nlevels.cjs: ${passes} passed, ${failures} failed`);
  console.log(failures ? `${failures} check(s) failed` : 'All level checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
