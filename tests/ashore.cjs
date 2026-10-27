// Ashore with the Kraken Seas (SPEC3 §13.2, tests/ashore.cjs): serves the game with ?kraken=1, drives Sparrow's
// Floating Island in headless Chromium through the real controls and the window.__game test API, and checks
// - bar:     the places bar of six (shipyard, tailor, tavern, quiz, builder, ship) at the 7 town sizes: 44 × 44
//            icon-only buttons with their aria-labels below 760 px wide and on short landscape, between the
//            joystick and the action button, no button under 44 px, no overlap, no page scroll; the Harbour menu
//            lists Quiz and Build
// - keys:    E / Enter at the bell and at Bess open their panels, a places-bar click or tap walks to each place
//            and opens it, the Play / Build action button, Esc goes back, focus returns to the place's button
// - walking: the walking bug with every walker (§0.3) and 8 villagers out (an island record of four Manors):
//            (a) 30 s of random keys, stick drags and taps never leave the captain stuck behind a person for more
//            than 1 s; (b) a held key, a held stick and a tap-to-walk each cross every rope bridge both ways,
//            started at 10 moments of the villagers' rounds; (c) the porter check of 4465587; (d) no villager
//            ever stops on a bridge, in a place circle, a doorway or at the gangplank (sampled over 120 s);
//            villagers wait for the captain (LOOK-2)
// - quiz:    by keyboard only (E, Digit1-4, Tab, Enter, a held Enter, H, Esc): 3 / 4 / 5 right give 1 / 2 / 3
//            stars and the gold of §7.2 once, replays pay nothing, "Good try!" once, a wrong answer shows ✓ on
//            the right one and the fun fact with the soft bonk (no buzzer), the next island opens, #quiz-live
//            texts, the record written before the chest
// - quiztaps: the same by taps on a phone (the places bar, the islands, the answers, Next, the lifebuoy, Leave
//            quiz, Map, Back to town)
// - quizrec: a seeded round is the same round; storage full: the stars shown, no gold, the words, and the owed
//            gold paid exactly once when storage works again (the record refused, or only the chest refused);
//            the record survives a reload; a corrupt -quiz falls back and is rewritten
// - build:   a Cottage for 100 (the record before the chest), the montage (a key skips it; it springs up with
//            squash and stretch, a fade under reduced motion), 2 villagers; a held Enter and a double click build
//            once; storage full refuses at no cost; too poor: aria-disabled, "Need … more gold", focus kept;
//            every plot to tier 3: Pirate Capital, and the Governor's coat at Polly's; the walk data never
//            changes (the fixture)
// - perks:   the Windmill's loads, the School's lifebuoys, the Lighthouse's longer warnings (a lava bomb), the
//            Bakery's patch at reinforcements, the villagers' gift and the Market on the level-cleared card
// - powder:  the tavern's Powder room: three rows outside #tavern-up-list, on sale by progress with the reason,
//            storage full refuses, buying saves -powder before the chest and rebuilds the docked ship, a double
//            click buys once, the rumour board's powder tip
// - tabs:    two tabs: island tiers, quiz stars and recipes bought in one tab show in the other, never go down
// - layout:  the quiz and build panels at the 7 town sizes (no page scroll, 44 px, answers 56 px, 4.5:1)
// - quizfit: at the 7 town sizes every answer of a round shows whole at the top of the quiz panel, unscrolled,
//            ≥ 56 px: rounds on four islands and rounds dealt to hold the bank's longest questions and answers
// - quizmap: the map's notes (owed gold, "Your stars are safe!", why an island is locked) in view with the
//            focused island; the trophies: the ninth island's mortarboard and the 27th star's Rainbow macaw on
//            the results (once), #quiz-live and the map's prize line, after a reload too, and at Polly's
// - draws:   every plot at tier 3 + 8 villagers + Bess and Barnacle: the walk view at 30 spots × 8 headings, the
//            shipyard view, the quiz and build views ≤ 450 draw calls; screenshots quiz.png, build.png,
//            island-tier3.png
// - rays:    from the shipyard showcase poses (the sway's extremes) at the 6 shipyard layout sizes, rays to 12
//            points of the docked ship cross no tier-3 plot envelope
// Walking is stepped with __game.town.simulate() inside one evaluate (the villagers' clock by hand, Math.random
// seeded); keys go through the game's own handlers.
// Run with `node tests/ashore.cjs` (ASHORE_ONLY=bar,keys,walking,quiz,quiztaps,quizrec,build,perks,powder,
// tabs,layout,quizfit,quizmap,draws,rays runs some sections; ASHORE_ROOT serves another copy of the game;
// ASHORE_QUERY replaces "?quality=low&kraken=1"; ASHORE_PENDING=<tags> reports the tagged checks that wait for
// later work as PEND instead of FAIL ("all" for every tagged check): gift, bakery, lighthouse, governor,
// tabs-island, tabs-quiz
// wait for main.js (2A / 3A: the island perks, the Governor's coat feat, the -island / -quiz two-tab merge), and
// quiz-feats too (3A: feats.quiz / feats.stars raised from the quiz record, for Polly's two quiz trophies); mouth
// waits for town.js (a captain wedged beside a rope bridge's mouth by someone on it, 3D).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('./server.cjs');

const ROOT = process.env.ASHORE_ROOT ? path.resolve(process.env.ASHORE_ROOT) : path.join(__dirname, '..');
const OUT = process.env.SCREENSHOT_DIR || path.join(ROOT, 'tests', 'screenshots');
const ONLY = (process.env.ASHORE_ONLY || '').split(',').filter(Boolean);
const PENDING = new Set((process.env.ASHORE_PENDING || '').split(',').filter(Boolean));
const QUERY = process.env.ASHORE_QUERY || '?quality=low&kraken=1';
const FIXTURE = path.join(__dirname, 'fixtures', 'sparrow-walk.json');
const BROWSER_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const SCREENSHOT_TIMEOUT = 120000;

let failures = 0;
let passes = 0;
let pending = 0;
// need: the later work a check waits for (ASHORE_PENDING lists the ones not landed yet)
function check(cond, msg, need = null) {
  if (cond === true) {
    console.log(`PASS  ${msg}`);
    passes++;
  } else if (need && (PENDING.has(need) || PENDING.has('all'))) {
    console.log(`PEND  [${need}] ${msg}`);
    pending++;
  } else {
    console.log(`FAIL  ${need ? `[${need}] ` : ''}${msg}`);
    failures++;
  }
}
const J = (v) => JSON.stringify(v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The game's pure modules (they import nothing), loaded from the served copy as data: URLs for the expected values.
async function load(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
}

// §7.2: the gold for an island's first star and for each later new star (the table, not the module).
const QUIZ_GOLD = [[60, 15], [80, 30], [100, 45], [120, 60], [140, 75], [160, 90], [180, 105], [200, 120], [220, 135]];
const GOOD_TRY = 10;
const PLOT_IDS = ['homeA', 'homeB', 'homeC', 'homeD', 'bakery', 'windmill', 'lighthouse', 'market', 'school', 'park'];
const island = (t = {}) => JSON.stringify({ v: 1, t: Object.fromEntries(PLOT_IDS.map((id) => [id, t[id] ?? 0])) });
const ALL3 = Object.fromEntries(PLOT_IDS.map((id) => [id, 3]));
const MANORS = { homeA: 3, homeB: 3, homeC: 3, homeD: 3 };

// Records for a returning player who reached the Kraken Seas' level 7: the tutorial and every tip done, gold.
const STORE = {
  'pirates-ahoy-unlocked': '7',
  'pirates-ahoy-tutorial-done': '1',
  'pirates-ahoy-tips': '65535',
  'pirates-ahoy-purse': '1000',
};
const TOWN_SIZES = [[320, 480, true], [360, 640, true], [390, 844, true], [844, 390, true], [568, 320, true], [1024, 600, false], [1280, 720, false]];

// ---------------------------------------------------------------------------------------------------------
// In-page helpers (installed after every page load as window.T)
// ---------------------------------------------------------------------------------------------------------
function installHelpers() {
  const G = window.__game;
  // every localStorage write in order (window.__writes), and storage that refuses some keys (window.__block:
  // a key, or '*' for all) as a full or switched-off store does
  if (!window.__storageHooked) {
    window.__storageHooked = true;
    const set0 = Storage.prototype.setItem;
    window.__writes = [];
    window.__block = new Set();
    Storage.prototype.setItem = function (k, v) {
      if (this === window.localStorage && (window.__block.has(k) || window.__block.has('*'))) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      if (this === window.localStorage) window.__writes.push(k);
      return set0.call(this, k, v);
    };
  }
  // every sound the game plays (window.__sfx: names)
  if (!G.audio.__hooked) {
    const play0 = G.audio.play;
    window.__sfx = [];
    G.audio.play = function (name, ...rest) {
      window.__sfx.push(name);
      return play0.call(this, name, ...rest);
    };
    G.audio.__hooked = true;
  }
  const T = {
    town: () => G.town.api.town,
    q: () => G.town.api.quiz,
    // what a tap or click changes (the view, the walk's goal, the quiz's moment): press() waits for it to move
    sig: () => {
      const q = G.town.api.quiz;
      const r = q && q.round;
      const a = G.town.api.auto;
      return JSON.stringify([G.town.view, a && a.place, T.shown('aboard-dialog'), q && q.mode, r && [r.level, r.index, r.removed.length, r.picks.length]]);
    },
    b: () => G.town.api.build,
    pos: () => ({ ...G.town.pos }),
    // put the captain somewhere (snapped onto the walk), facing h, the camera straight behind him
    at(x, z, h) {
      const t = T.town();
      const q = t.walk.snap(x, z, 3) || { x, z };
      t.enter({ x: q.x, z: q.z, h });
      t.recenter();
      G.town.simulate(0.3, { x: 0, z: 0 });
      return T.pos();
    },
    // ashore, in the walk view, at a place's spot (null: the spawn), the town HUD focused
    walkView(place = null) {
      if (G.state.mode !== 'dock') G.dock.open('menu');
      if (G.town.view === 'shop') G.dock.ashore();
      if (G.town.view !== 'town') G.town.back();
      if (G.town.view !== 'town') G.town.back();
      T.town().enter(place || 'spawn');
      G.town.simulate(0.3, { x: 0, z: 0 });
      document.getElementById('town-screen').focus();
      return G.town.view;
    },
    shown: (id) => {
      const el = typeof id === 'string' ? document.getElementById(id) : id;
      return !!el && !el.closest('.hidden') && el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible';
    },
    text: (id) => ((typeof id === 'string' ? document.getElementById(id) : id)?.textContent || '').replace(/\s+/g, ' ').trim(),
    focus: () => {
      const a = document.activeElement;
      if (!a) return null;
      if (a.id) return a.id;
      const d = a.dataset || {};
      if (d.place) return `place:${d.place}`;
      if (d.level !== undefined) return `level:${d.level}`;
      if (d.answer !== undefined) return `answer:${d.answer}`;
      if (d.plot) return `plot:${d.plot}`;
      if (d.powder) return `powder:${d.powder}`;
      if (d.act) return `act:${d.act}`;
      if (d.item) return `item:${d.item}`;
      return a.tagName;
    },
    finish: () => document.getAnimations().forEach((a) => { try { if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch { /* */ } }),
    writes: (keys) => window.__writes.filter((k) => keys.includes(k)),
    clearWrites: () => { window.__writes.length = 0; },
    block: (...keys) => keys.forEach((k) => window.__block.add(k)),
    unblock: () => window.__block.clear(),
    sfx: () => window.__sfx.slice(),
    clearSfx: () => { window.__sfx.length = 0; },
    stored: (k) => localStorage.getItem(k),
    // the quiz panel's island buttons: { level, disabled, words }
    isles: () => [...document.querySelectorAll('#quiz-map [data-level]')].map((b) => ({ level: Number(b.dataset.level), disabled: b.getAttribute('aria-disabled') === 'true', words: T.text(b), why: (b.getAttribute('aria-describedby') && T.text(b.getAttribute('aria-describedby'))) || '' })),
    resultLines: () => [...document.querySelectorAll('#quiz-results .qr-score, #quiz-results .qr-line')].map((p) => T.text(p)),
  };
  window.T = T;
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
  };
  const Q = await load('src/quiz.js');
  const ISL = await load('src/island.js');
  const BANK = await load('src/quizBank.js');
  // A page of the game. store: localStorage records set before the game first loads in this tab (not on a reload);
  // ctx: an existing browser context (a second tab shares its storage); seed: the page's Math.random seeded.
  async function open({ width = 1280, height = 720, touch = false, store = STORE, reduced = false, label = 'page', ctx = null, seed = 0 } = {}) {
    const own = !ctx;
    if (!ctx) {
      ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      if (seed) {
        await ctx.addInitScript((s0) => {
          let a = s0 >>> 0;
          Math.random = () => {
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
          };
        }, seed);
      }
      if (store) {
        await ctx.addInitScript((s) => {
          try {
            if (sessionStorage.getItem('__seeded')) return;
            for (const [k, v] of Object.entries(s)) {
              if (v === null) localStorage.removeItem(k);
              else localStorage.setItem(k, v);
            }
            sessionStorage.setItem('__seeded', '1');
          } catch {
            // storage blocked
          }
        }, store);
      }
    }
    const page = await ctx.newPage();
    if (!own) await page.setViewportSize({ width, height });
    watch(page, label);
    await page.goto(base + QUERY, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__gameReady === true && window.__game && window.__game.env, null, { timeout: 120000 });
    await page.evaluate(installHelpers);
    return { ctx, page };
  }
  async function reload(page) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__gameReady === true && window.__game && window.__game.env, null, { timeout: 120000 });
    await page.evaluate(installHelpers);
  }
  const frames = (page, n = 2) =>
    page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  const snap = async (page, name) => {
    await page.evaluate(() => T.finish());
    await page.screenshot({ path: path.join(OUT, name), timeout: SCREENSHOT_TIMEOUT });
  };
  // Ashore on this page, in the walk view (at a place's spot), the dock opened from the title.
  const walkView = (page, place = null) => page.evaluate((place) => T.walkView(place), place);
  // Walk on (simulated) until a place opens: its view, or the All aboard? dialog.
  const arrive = (page) => page.evaluate(() => {
    const G = window.__game;
    for (let i = 0; i < 80 && G.town.view === 'town' && !T.shown('aboard-dialog'); i++) G.town.simulate(0.5);
    return { view: G.town.view, aboard: T.shown('aboard-dialog'), focus: T.focus() };
  });
  // A click or tap on a control that may never show up (a broken copy): noted in `missed`, not waited on for long.
  // A tap's click comes after its touchend, a moment later on a busy machine: press() then waits (up to 10 s) for
  // what it changes (T.sig) before the test reads the game.
  const missed = [];
  const press = async (pg, sel, how = 'click') => {
    const before = await pg.evaluate(() => T.sig()).catch(() => null);
    const ok = await pg[how](sel, { timeout: 20000 }).then(
      () => true,
      (e) => missed.push(`${sel} (${String(e.message).split('\n')[0].slice(0, 120)})`) && false,
    );
    if (ok && before !== null) await pg.waitForFunction((b) => T.sig() !== b, before, { timeout: 10000, polling: 50 }).catch(() => {});
  };
  const notShown = () => (missed.length ? ' -> never shown: ' + missed.splice(0).join(', ') : '');
  async function section(name, fn) {
    if (ONLY.length && !ONLY.includes(name)) return;
    missed.length = 0;
    console.log(`\n---- ${name}`);
    const t0 = Date.now();
    try {
      await fn();
    } catch (err) {
      check(false, `${name}: the section crashed: ${err && err.stack ? err.stack : err}`);
    }
    console.log(`     (${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  // the town's layout probes (as tests/town.cjs): a control is fine when on screen, ≥ 44 px, uncovered, its label
  // whole; panels: no part outside the panel, nothing overlapping, no sideways scroll; small text ≥ 4.5:1 on a
  // solid plate
  const probes = () => {
    const R = (el) => el.getBoundingClientRect();
    const ov = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const inside = (r, box) => r.left >= box.left - 0.5 && r.top >= box.top - 0.5 && r.right <= box.right + 0.5 && r.bottom <= box.bottom + 0.5;
    const shown = (el) => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible' && !el.closest('.hidden');
    const name = (el) => el.id || el.dataset.place || el.dataset.level || el.dataset.answer || el.dataset.plot || el.dataset.powder || el.dataset.act || (el.className && String(el.className).split(' ')[0]) || el.tagName;
    const text = (n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
    // a label is cut off when a block with text overflows its box, or a run of its text (in an inline span too)
    // sticks out of the control, clipped by it or spilling over (visually hidden labels, 1 px boxes, and badges
    // placed on purpose over the control's edge, absolutely positioned like the answers' ✓, don't count)
    const srOnly = (n, el) => {
      for (let p = n.parentElement; p && p !== el.parentElement; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.display !== 'inline' && (p.clientWidth <= 1 || p.clientHeight <= 1)) return true;
        if (p !== el && (cs.position === 'absolute' || cs.position === 'fixed')) return true;
      }
      return false;
    };
    const textOut = (el) => {
      const box = R(el);
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent.trim() || srOnly(n, el)) continue;
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) {
          const d = { left: box.left - r.left, right: r.right - box.right, top: box.top - r.top, bottom: r.bottom - box.bottom };
          const side = Object.keys(d).find((k) => d[k] > 1.5);
          if (r.width > 0.5 && side) return `"${n.textContent.trim().slice(0, 24)}" ${Math.round(d[side])} px past the ${side}`;
        }
      }
      return null;
    };
    const cut = (el) => {
      const blocks = [el, ...el.querySelectorAll('*')].filter((n) => text(n) && getComputedStyle(n).display !== 'inline' && n.clientWidth > 1 && n.scrollWidth > n.clientWidth + 1);
      const t = textOut(el);
      return blocks.length || t ? [t || `${name(blocks[0])} overflows`] : [];
    };
    const pageScroll = () => {
      const de = document.documentElement;
      return de.scrollWidth > innerWidth + 1 || de.scrollHeight > innerHeight + 1 ? `the page scrolls (${de.scrollWidth}x${de.scrollHeight})` : null;
    };
    const screen = () => ({ left: 0, top: 0, right: innerWidth, bottom: innerHeight });
    function reach(el, out, box = null, scroller = null) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (scroller && !inside(R(el), R(scroller)) && R(el).height <= scroller.clientHeight) {
        scroller.scrollTop += R(el).top - R(scroller).top - (scroller.clientHeight - R(el).height) / 2;
      }
      const r = R(el);
      if (window.scrollX || window.scrollY) out.push(`showing ${name(el)} scrolled the page`);
      if (!inside(r, screen()) || (box && !inside(r, R(box))) || (scroller && !inside(r, R(scroller)))) out.push(`${name(el)} can't be scrolled into view`);
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !(hit === el || el.contains(hit))) out.push(`${name(el)} is covered by ${hit && name(hit)}`);
      if (r.width < 44 || r.height < 44) out.push(`${name(el)} is only ${Math.round(r.width)}x${Math.round(r.height)}`);
      const c = cut(el);
      if (c.length) out.push(`${name(el)}'s label is cut off (${c[0]})`);
    }
    function noOverlap(list, what, out) {
      const rs = list.map(R);
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (ov(rs[i], rs[j]) > 1) out.push(`${what}: ${name(list[i])} and ${name(list[j])} overlap`);
    }
    window.__probe = {
      town() {
        T.finish();
        const out = [];
        const s = pageScroll();
        if (s) out.push(s);
        const TS = document.getElementById('town-screen');
        const parts = ['town-chest', 'town-keys', 'town-menu-btn', 'town-mute', 'town-places', 'town-prompt', 'town-action', 'town-joystick'].map((id) => document.getElementById(id)).filter(shown);
        for (const el of parts) if (!inside(R(el), screen())) out.push(`${name(el)} off screen`);
        noOverlap(parts.filter((el) => el.id !== 'town-menu-btn' && el.id !== 'town-mute').concat([document.querySelector('.town-corner')].filter(shown)), 'HUD', out);
        const controls = [...TS.querySelectorAll('button')].filter(shown);
        for (const el of controls) reach(el, out);
        return { problems: out, controls: controls.map(name) };
      },
      // the places bar: its buttons in order, their sizes, labels, gaps, and room between the stick and the button
      bar() {
        T.finish();
        const bar = document.getElementById('town-places');
        const btns = [...bar.querySelectorAll('[data-place]')].filter(shown);
        const rs = btns.map(R);
        const gaps = rs.slice(1).map((r, i) => +(r.left - rs[i].right).toFixed(1));
        const lab = (b) => b.querySelector('.tp-label');
        const iconOnly = btns.every((b) => !lab(b) || R(lab(b)).width <= 1.5 || !shown(lab(b)));
        const stick = document.getElementById('town-joystick');
        const act = document.getElementById('town-action');
        const hits = [stick, act].filter(shown).filter((el) => ov(R(el), R(bar)) > 1).map((el) => el.id);
        return {
          ids: btns.map((b) => b.dataset.place),
          labels: btns.map((b) => b.getAttribute('aria-label') || ''),
          sizes: rs.map((r) => [+r.width.toFixed(1), +r.height.toFixed(1)]),
          gaps,
          width: +R(bar).width.toFixed(1),
          iconOnly,
          hits,
          stick: shown(stick) ? [Math.round(R(stick).left), Math.round(R(stick).right)] : null,
          act: shown(act) ? [Math.round(R(act).left), Math.round(R(act).right)] : null,
          span: [Math.round(R(bar).left), Math.round(R(bar).right)],
          scroll: pageScroll(),
        };
      },
      panel(panelId) {
        T.finish();
        const out = [];
        const s = pageScroll();
        if (s) out.push(s);
        const P = document.getElementById(panelId);
        const panel = R(P);
        if (!inside(panel, screen())) out.push('panel off screen');
        const parts = ['.dock-head', '.dock-tabs', '.dock-body', '.dock-exits'].map((q) => [q, P.querySelector(q)]).filter(([, e]) => e && shown(e)).map(([q, e]) => [q, R(e)]);
        for (const [q, r] of parts) if (!r.height || !inside(r, panel)) out.push(`${q} outside the panel`);
        for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) if (ov(parts[i][1], parts[j][1]) > 1) out.push(`${parts[i][0]} overlaps ${parts[j][0]}`);
        const body = P.querySelector('.dock-body');
        if (body.scrollWidth > body.clientWidth + 1) out.push(`the panel scrolls sideways (${body.scrollWidth - body.clientWidth} px)`);
        const controls = [...P.querySelectorAll('button')].filter(shown);
        for (const part of ['.dock-head', '.dock-tabs', '.dock-body', '.dock-exits']) noOverlap(controls.filter((b) => b.closest(part)), part, out);
        for (const el of controls) reach(el, out, P, el.closest('.dock-body') ? body : null);
        // quiz answers: at least 56 px tall (SPEC3 §7.3)
        const answers = [...P.querySelectorAll('.quiz-ans')].filter(shown).map((b) => Math.round(R(b).height));
        for (const h of answers) if (h < 56) out.push(`a quiz answer is only ${h} px tall`);
        body.scrollTop = 0;
        return { problems: out, count: controls.length, answers };
      },
      dialog(id) {
        T.finish();
        const out = [];
        const s = pageScroll();
        if (s) out.push(s);
        const D = document.getElementById(id);
        const P = D.querySelector('.panel');
        if (!inside(R(P), screen())) out.push('dialog panel off screen');
        const controls = [...P.querySelectorAll('button')].filter(shown);
        noOverlap(controls, 'buttons', out);
        for (const el of controls) reach(el, out, P, P);
        return { problems: out, count: controls.length };
      },
      contrast(rootSel) {
        T.finish();
        const parse = (c) => { const m = String(c).match(/[\d.]+/g); if (!m || m.length < 3) return null; const n = m.map(Number); return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 }; };
        const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
        const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
        const background = (el) => {
          const layers = [];
          let solid = false;
          for (let n = el; n; n = n.parentElement) {
            const c = parse(getComputedStyle(n).backgroundColor);
            if (c && c.a > 0) { layers.push(c); if (c.a >= 0.999) { solid = true; break; } }
          }
          let acc = { r: 255, g: 255, b: 255, a: 1 };
          for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
          return { acc, solid };
        };
        const out = [];
        let n = 0;
        const root = document.querySelector(rootSel);
        const seen = new Set();
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let t = walker.nextNode(); t; t = walker.nextNode()) {
          const el = t.parentElement;
          if (!t.textContent.trim() || seen.has(el)) continue;
          seen.add(el);
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (r.width <= 1 || r.height <= 1 || cs.visibility !== 'visible' || el.closest('.hidden')) continue;
          let alpha = 1;
          for (let q = el; q && q !== document.documentElement; q = q.parentElement) alpha *= Number(getComputedStyle(q).opacity);
          const stroke = parseFloat(cs.webkitTextStrokeWidth) >= 1.5;
          const c = parse(stroke ? cs.webkitTextStrokeColor : cs.color);
          const { acc: bg, solid } = background(el);
          const fg = over({ ...c, a: c.a * alpha }, bg);
          const la = L(fg);
          const lb = L(bg);
          const ratio = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
          const size = parseFloat(cs.fontSize);
          const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
          n++;
          if (ratio < (large ? 3 : 4.5) || !solid) out.push({ text: t.textContent.trim().slice(0, 22), size, ratio: +ratio.toFixed(2), solid });
        }
        return { n, bad: out };
      },
    };
  };

  // ---------------------------------------------------------------------------------------------------- bar
  // The places bar of six at the 7 town sizes (SPEC3 §7.1), and the Harbour menu's Quiz and Build.
  await section('bar', async () => {
    for (const touch of [true, false]) {
      const { ctx, page } = await open({ touch, width: touch ? 390 : 1280, height: touch ? 844 : 720, label: touch ? 'bar-touch' : 'bar' });
      await page.evaluate(probes);
      await walkView(page);
      for (const [w, h] of TOWN_SIZES.filter((s) => s[2] === touch)) {
        const tag = `${w}x${h}${touch ? ' touch' : ''}`;
        await page.setViewportSize({ width: w, height: h });
        await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [w, h], { timeout: 60000 });
        await walkView(page);
        await frames(page, 2);
        const bar = await page.evaluate(() => window.__probe.bar());
        const compact = w < 760 || (w > h && h <= 560);
        const small = bar.sizes.filter(([bw, bh]) => bw < 44 || bh < 44);
        const sizeOk = compact ? bar.sizes.every(([bw, bh]) => Math.abs(bw - 44) <= 0.6 && Math.abs(bh - 44) <= 0.6) && bar.gaps.every((g) => g <= 4.6) && bar.iconOnly : small.length === 0;
        const labelsOk = bar.labels.length === 6 && bar.labels.every((l) => /^Walk to /.test(l)) && bar.labels[3] === 'Walk to the quiz' && bar.labels[4] === 'Walk to Builder Bess';
        check(bar.ids.join() === 'shipyard,tailor,tavern,quiz,builder,ship' && labelsOk && sizeOk && small.length === 0 && bar.hits.length === 0 && !bar.scroll,
          `bar ${tag}: six places in order (${bar.ids.join(',')}), ${compact ? '44 × 44 icon-only with a 4 px gap' : 'no button under 44 px'} (${bar.sizes.map((s) => s.join('x')).join(' ')}; gaps ${bar.gaps.join(',')}; bar ${bar.width} px), each named ("${bar.labels[3]}", "${bar.labels[4]}"), clear of the stick ${J(bar.stick)} and the action button ${J(bar.act)} (bar ${J(bar.span)})${bar.hits.length ? ' -> overlaps ' + bar.hits.join(',') : ''}${bar.scroll ? ' -> ' + bar.scroll : ''}`);
        // the whole town HUD at the bell and at Bess (the prompt up): on screen, 44 px, nothing overlapping
        for (const at of ['quiz', 'builder']) {
          await walkView(page, at);
          await frames(page, 2);
          const town = await page.evaluate(() => window.__probe.town());
          const tc = await page.evaluate(() => window.__probe.contrast('#town-screen'));
          const prompt = await page.evaluate(() => window.__game.town.api.prompt);
          check(town.problems.length === 0 && tc.bad.length === 0 && /Riddle Bell|Builder Bess/.test(prompt || ''),
            `bar ${tag} at ${at}: the town HUD with the prompt "${prompt}" on screen, ≥ 44 px, nothing overlapping, its ${tc.n} texts 4.5:1${town.problems.length ? ' -> ' + town.problems.join('; ') : ''}${tc.bad.length ? ' -> ' + J(tc.bad) : ''}`);
        }
        // the Harbour menu lists Quiz and Build, on screen and 44 px
        await page.evaluate(() => { T.walkView(); window.__game.town.api.harbour(); });
        const hd = await page.evaluate(() => ({ ...window.__probe.dialog('harbour-dialog'), list: [...document.querySelectorAll('#harbour-dialog button')].filter((b) => T.shown(b)).map((b) => T.text(b)) }));
        check(hd.problems.length === 0 && hd.list.includes('Quiz') && hd.list.includes('Build'), `bar ${tag}: the Harbour menu (${hd.list.join(', ')}) lists Quiz and Build, on screen, ≥ 44 px${hd.problems.length ? ' -> ' + hd.problems.join('; ') : ''}`);
        await page.evaluate(() => window.__game.town.back());
      }
      await ctx.close();
    }
  });

  // --------------------------------------------------------------------------------------------------- keys
  // E / Enter at the bell and at Bess, the places bar to each of the six places, the Harbour menu's buttons,
  // Esc back with focus on the place's button; on a phone: taps and the Play / Build action button.
  await section('keys', async () => {
    const { ctx, page } = await open({ label: 'keys' });
    for (const [place, key, view] of [['quiz', 'e', 'quiz'], ['builder', 'Enter', 'build'], ['quiz', 'Enter', 'quiz'], ['builder', 'e', 'build']]) {
      await walkView(page, place);
      const prompt = await page.evaluate(() => window.__game.town.api.prompt);
      await page.keyboard.press(key === 'e' ? 'e' : 'Enter');
      const a = await page.evaluate(() => ({ view: window.__game.town.view, focus: T.focus(), inPanel: !!document.activeElement.closest('#quiz-panel, #build-panel'), shown: T.shown(window.__game.town.view === 'quiz' ? 'quiz-screen' : 'build-screen') }));
      await frames(page, 2);
      await page.keyboard.press('Escape');
      const b = await page.evaluate(() => ({ view: window.__game.town.view, focus: T.focus(), quiz: T.shown('quiz-screen'), build: T.shown('build-screen') }));
      check(a.view === view && a.inPanel && a.shown && b.view === 'town' && b.focus === `place:${place}` && !b.quiz && !b.build && (place === 'quiz' ? /Riddle Bell/.test(prompt) : /Builder Bess/.test(prompt)),
        `keys: ${key === 'e' ? 'E' : 'Enter'} at ${place} ("${prompt}") opens the ${view} panel, focus inside it (${a.focus}); Esc goes back to the town, focus on its places-bar button (${b.focus})`);
    }
    // The quiz opens on the highest open island; Esc there goes straight back to the town.
    await walkView(page, 'quiz');
    await page.keyboard.press('e');
    const qf = await page.evaluate(() => ({ focus: T.focus(), isles: T.isles(), live: T.text('quiz-live') }));
    check(qf.focus === 'level:0' && qf.isles.length === 9 && !qf.isles[0].disabled && qf.isles.slice(1).every((i) => i.disabled) && qf.isles[1].why === 'Pass Shallow Shoals first' && /Pick a quiz island: 1 of 9 open/.test(qf.live),
      `keys: the quiz map: focus on the open island (${qf.focus}), the other eight locked and described ("${qf.isles[1].why}"); "${qf.live}"`);
    await page.keyboard.press('Escape');
    // the places bar: a click walks to each of the six places and opens it
    const visits = [];
    for (const place of ['shipyard', 'tailor', 'tavern', 'quiz', 'builder', 'ship']) {
      await page.evaluate(() => { T.walkView(); T.at(0.5, -9, Math.PI); }); // (on the plaza, away from every place)
      await press(page, `#town-places [data-place="${place}"]`);
      const auto = await page.evaluate(() => window.__game.town.api.auto && window.__game.town.api.auto.place);
      const r = await arrive(page);
      visits.push({ place, auto, ...r });
      if (r.aboard) await page.keyboard.press('Escape');
      else if (r.view === 'shop') await page.evaluate(() => window.__game.dock.ashore());
      else await page.keyboard.press('Escape');
    }
    const want = { shipyard: 'shop', tailor: 'tailor', tavern: 'tavern', quiz: 'quiz', builder: 'build', ship: 'town' };
    check(!missed.length && visits.every((v) => v.auto === v.place && v.view === want[v.place] && (v.place === 'ship') === v.aboard), `keys: a places-bar click walks to each of the six places and opens it (${visits.map((v) => `${v.place}→${v.aboard ? 'All aboard?' : v.view}${v.auto === v.place ? '' : ` (walked to ${v.auto})`}`).join(', ')})${notShown()}`);
    // back from the panels: focus on the place's button (a click there, then Esc)
    const backs = [];
    for (const place of ['quiz', 'builder']) {
      await walkView(page);
      await press(page, `#town-places [data-place="${place}"]`);
      await arrive(page);
      await sleep(420); // (a click in the 350 ms after a panel opens is the rest of the click that opened it: ignored)
      await press(page, place === 'quiz' ? '#quiz-back-btn' : '#build-back-btn');
      backs.push(await page.evaluate(() => ({ view: window.__game.town.view, focus: T.focus() })));
    }
    check(!missed.length && backs[0].view === 'town' && backs[0].focus === 'place:quiz' && backs[1].view === 'town' && backs[1].focus === 'place:builder', `keys: "Back to town" in the quiz and build panels returns focus to the place's button (${J(backs)})${notShown()}`);
    // the Harbour menu's Quiz and Build buttons open the panels; Esc returns to the town
    const hb = [];
    for (const [btn, view] of [['harbour-quiz-btn', 'quiz'], ['harbour-build-btn', 'build']]) {
      await walkView(page);
      await page.keyboard.press('Escape'); // the Harbour menu
      const shown = await page.evaluate((btn) => T.shown('harbour-dialog') && T.shown(btn), btn);
      await press(page, `#${btn}`);
      const v = await page.evaluate(() => window.__game.town.view);
      await page.keyboard.press('Escape');
      hb.push({ btn, shown, view: v, after: await page.evaluate(() => ({ view: window.__game.town.view, focus: T.focus() })) });
    }
    check(!missed.length && hb.every((r, i) => r.shown && r.view === ['quiz', 'build'][i] && r.after.view === 'town' && r.after.focus === `place:${['quiz', 'builder'][i]}`), `keys: the Harbour menu's Quiz and Build open their panels; Esc back to the town, focus on the place's button (${J(hb)})${notShown()}`);
    await ctx.close();
    // On a phone: a places-bar tap walks there; at the bell and at Bess the action button reads Play / Build and opens.
    const tp = await open({ touch: true, width: 390, height: 844, label: 'keys-touch' });
    const taps = [];
    for (const place of ['quiz', 'builder']) {
      await walkView(tp.page);
      await press(tp.page, `#town-places [data-place="${place}"]`, 'tap');
      const auto = await tp.page.evaluate(() => window.__game.town.api.auto && window.__game.town.api.auto.place);
      const r = await arrive(tp.page);
      await sleep(400);
      await press(tp.page, place === 'quiz' ? '#quiz-back-btn' : '#build-back-btn', 'tap');
      taps.push({ place, auto, view: r.view, back: await tp.page.evaluate(() => ({ view: window.__game.town.view, focus: T.focus() })) });
    }
    check(!missed.length && taps.every((t) => t.auto === t.place && t.view === (t.place === 'quiz' ? 'quiz' : 'build') && t.back.view === 'town' && t.back.focus === `place:${t.place}`), `keys (touch): a places-bar tap walks to the bell and to Bess and opens their panels; Back to town returns focus to the place's button (${J(taps)})${notShown()}`);
    const acts = [];
    for (const place of ['quiz', 'builder']) {
      await walkView(tp.page, place);
      await frames(tp.page, 2);
      const label = await tp.page.evaluate(() => ({ text: T.text('town-action'), aria: document.getElementById('town-action').getAttribute('aria-label'), disabled: document.getElementById('town-action').getAttribute('aria-disabled') }));
      await press(tp.page, '#town-action', 'tap');
      acts.push({ place, ...label, view: await tp.page.evaluate(() => window.__game.town.view) });
      await tp.page.evaluate(() => window.__game.town.back());
    }
    check(!missed.length && /Play/.test(acts[0].text) && acts[0].disabled === 'false' && acts[0].view === 'quiz' && /Build/.test(acts[1].text) && acts[1].disabled === 'false' && acts[1].view === 'build', `keys (touch): the action button reads Play at the bell and Build at Bess, and a tap opens the panel (${J(acts)})${notShown()}`);
    await tp.ctx.close();
  });

  // ------------------------------------------------------------------------------------------------ walking
  // The walking bug with every walker out (SPEC3 §0.3, §8.4, §13.2): four Manors bring 24 villagers, 8 drawn.
  await section('walking', async () => {
    // (one evaluate from the dock opening to the end, the villagers' clock by hand from a fixed moment and the
    // page's Math.random seeded: the real loop never runs in between, so every run samples the same moments)
    const { ctx, page } = await open({ label: 'walking', seed: 20261022, store: { ...STORE, 'pirates-ahoy-unlocked': '3', 'pirates-ahoy-island': island(MANORS) } });
    const W = await page.evaluate(() => {
      const G = window.__game;
      G.dock.open('menu');
      const env = G.env;
      G.dock.ashore();
      G.town.simulate(0.2, { x: 0, z: 0 });
      const setup = { drawn: env.villagers.length, inFolk: env.folk().filter((f) => f.villager).length, npcs: env.folk().filter((f) => f.npc).map((f) => f.npc).sort(), view: G.town.view, links: env.walk.links.map((l) => l.id).sort() };
      const P = { t: 100 };
      // one frame of the town by hand: the walk, then (as townMode's frame does) the townsfolk shown within 40 u
      // of the lens and not right at it (only those shown wait for the captain), then their rounds
      P.step = (dt, inp) => {
        G.town.simulate(dt, inp);
        if (env.cull) env.cull(G.camera.position.x, G.camera.position.z, 40, 1.0);
        P.t += dt;
        env.update(P.t, dt, { simTime: G.state.time, camera: G.camera });
      };
      P.pos = () => ({ ...G.town.pos });
      P.place = (x, z, h) => {
        const tw = G.town.api.town;
        const q = tw.walk.snap(x, z, 1) || { x, z };
        tw.enter({ x: q.x, z: q.z, h });
        tw.recenter();
      };
      P.vill = () => env.villagers.map((v, i) => ({ ...v, index: 'v' + i }));
      // a run across a bridge: mode 'key' | 'stick' (a thumb a little off straight) | 'tap'
      P.cross = (link, dir, mode) => {
        const pts = dir > 0 ? link.pts : [...link.pts].reverse();
        const a = pts[0];
        const b = pts[pts.length - 1];
        const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
        const ux = (b[0] - a[0]) / L;
        const uz = (b[2] - a[2]) / L;
        P.place(a[0] - ux * 0.6, a[2] - uz * 0.6, Math.atan2(ux, uz));
        if (mode === 'tap') G.town.walkTo(b[0] + ux * 1.2, b[2] + uz * 1.2);
        const inp = mode === 'key' ? { x: 0, z: 1 } : mode === 'stick' ? { x: 0.09, z: 0.88 } : { x: 0, z: 0 };
        let along = -1;
        let k = 0;
        let still = 0;
        let stuck = 0;
        let where = null;
        let last = P.pos();
        for (; k < 14 * 30; k++) {
          P.step(1 / 30, inp);
          const c = P.pos();
          along = ((c.x - a[0]) * ux + (c.z - a[2]) * uz) / L;
          const mv = Math.hypot(c.x - last.x, c.z - last.z);
          last = c;
          if (mv < 0.004) still += 1 / 30;
          else still = 0;
          if (still > stuck) {
            stuck = still;
            where = [+c.x.toFixed(2), +c.z.toFixed(2)];
          }
          if (along > 1.02 || G.town.view !== 'town') break;
        }
        P.step(0.2, { x: 0, z: 0 });
        if (G.town.view !== 'town') G.town.back();
        return { ok: along > 1.02, secs: +(k / 30).toFixed(2), stuck: +stuck.toFixed(2), where };
      };
      // (b) every bridge, both ways, by key, stick and tap, at 10 moments of the villagers' rounds
      const runs = [];
      for (let m = 0; m < 10; m++) {
        const sp = env.walk.spawn;
        P.place(sp.x, sp.z, sp.h);
        for (let i = 0; i < 30 * (1.7 + m * 0.9); i++) P.step(1 / 30, { x: 0, z: 0 });
        for (const link of env.walk.links) for (const dir of [1, -1]) for (const mode of ['key', 'stick', 'tap']) runs.push({ m, link: link.id, dir, mode, ...P.cross(link, dir, mode) });
      }
      // (c) the porter check of 4465587: W held from the stalls to the pier, 10 moments
      const porter = [];
      {
        const A = { x: 0.4, z: -10.9 };
        const B = { x: 1.8, z: -5.2 };
        const h = Math.atan2(B.x - A.x, B.z - A.z);
        for (let k = 0; k < 10; k++) {
          for (let i = 0; i < 30; i++) P.step(1 / 30, { x: 0, z: 0 });
          P.place(A.x, A.z, h);
          let reached = null;
          for (let i = 0; i < 9 * 30 && reached === null; i++) {
            P.step(1 / 30, { x: 0, z: 1 });
            const c = P.pos();
            if (Math.hypot(c.x - B.x, c.z - B.z) < 1.2) reached = +(i / 30).toFixed(1);
          }
          porter.push(reached);
          for (let i = 0; i < 37; i++) P.step(1 / 30, { x: 0, z: 0 });
        }
      }
      // (a) 30 s of random keys, stick drags and taps; (d) 120 s of the villagers' rounds sampled
      let rnd;
      {
        let seed = 777;
        const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
        const w = env.walk;
        const onBridge = (x, z) => w.links.some((l) => {
          for (let i = 0; i + 1 < l.pts.length; i++) {
            const [px, , pz] = l.pts[i];
            const [qx, , qz] = l.pts[i + 1];
            const dx = qx - px;
            const dz = qz - pz;
            const u = Math.max(0, Math.min(1, ((x - px) * dx + (z - pz) * dz) / (dx * dx + dz * dz || 1)));
            if (Math.hypot(x - px - dx * u, z - pz - dz * u) < 0.45 && u > 0.12 && u < 0.88) return true;
          }
          return false;
        });
        const spots = (x, z) => {
          const out = [];
          if (onBridge(x, z)) out.push('bridge');
          for (const p of w.places) if (Math.hypot(x - p.x, z - p.z) < p.r + 0.5) out.push('place:' + p.id);
          for (const d of w.doors || []) if (Math.hypot(x - d.x, z - d.z) < 1.0) out.push('door:' + d.id);
          if (Math.hypot(x - w.spawn.x, z - w.spawn.z) < 1.9) out.push('gangplank');
          return out;
        };
        const prev = new Map();
        const stops = [];
        let worst = 0;
        let at = null;
        let waits = 0;
        let stuckNow = 0;
        let inp = { x: 0, z: 0 };
        let until = 0;
        let time = 0;
        let lastC = P.pos();
        const sample = () => {
          const c = P.pos();
          for (const v of P.vill()) {
            const p = prev.get(v.index);
            prev.set(v.index, { x: v.x, z: v.z });
            if (!p) continue;
            if (Math.hypot(v.x - p.x, v.z - p.z) < 0.004) {
              const s = spots(v.x, v.z);
              const nearCap = Math.hypot(v.x - c.x, v.z - c.z) < 1.4;
              if (s.length && !nearCap) stops.push({ v: v.index, at: [+v.x.toFixed(2), +v.z.toFixed(2)], s, t: +time.toFixed(2) });
              else if (s.length) waits++; // (LOOK-2: waiting for the captain, who stands there)
            }
          }
        };
        const sp = w.spawn;
        P.place(sp.x, sp.z, sp.h);
        for (let i = 0; i < 30 * 30; i++) {
          if (time >= until) {
            const r = rand();
            if (r < 0.4) inp = { x: 0, z: 1 };
            else if (r < 0.55) inp = { x: rand() < 0.5 ? 1 : -1, z: 0 };
            else if (r < 0.85) {
              const a = rand() * Math.PI * 2;
              inp = { x: Math.sin(a) * (0.4 + rand() * 0.6), z: Math.cos(a) * (0.4 + rand() * 0.6) };
            } else {
              const c = P.pos();
              const a = rand() * Math.PI * 2;
              G.town.walkTo(c.x + Math.sin(a) * 6, c.z + Math.cos(a) * 6);
              inp = { x: 0, z: 0 };
            }
            until = time + 0.5 + rand();
          }
          P.step(1 / 30, { x: inp.x, z: inp.z });
          time += 1 / 30;
          if (G.town.view !== 'town') G.town.back();
          const c = P.pos();
          const mv = Math.hypot(c.x - lastC.x, c.z - lastC.z);
          lastC = c;
          const pushing = Math.hypot(inp.x, inp.z) > 0.1 || G.town.api.auto;
          const near = env.folk().filter((f) => Math.hypot(f.x - c.x, f.z - c.z) < 1.0);
          if (pushing && mv < 0.004 && near.length) stuckNow += 1 / 30;
          else stuckNow = 0;
          if (stuckNow > worst) {
            worst = stuckNow;
            const who = (f) => (f.villager ? 'villager' : f.npc || 'townsperson');
            at = { t: +time.toFixed(1), at: [+c.x.toFixed(2), +c.z.toFixed(2)], input: G.town.api.auto ? 'tap' : [+inp.x.toFixed(2), +inp.z.toFixed(2)], near: near.map((f) => `${who(f)} ${Math.hypot(f.x - c.x, f.z - c.z).toFixed(2)} u`) };
          }
          sample();
        }
        P.place(sp.x, sp.z, sp.h);
        for (let i = 0; i < 45 * 30; i++) {
          P.step(1 / 30, { x: 0, z: 0 });
          time += 1 / 30;
          sample();
        }
        const tour = ['quiz', 'builder', 'tavern', 'tailor', 'shipyard', 'ship'];
        let ti = 0;
        for (let i = 0; i < 45 * 30; i++) {
          if (!G.town.api.auto && G.town.view === 'town') G.town.goTo(tour[ti++ % tour.length]);
          if (G.town.view !== 'town') G.town.back();
          if (T.shown('aboard-dialog')) G.town.back();
          P.step(1 / 30, { x: 0, z: 0 });
          time += 1 / 30;
          sample();
        }
        rnd = { worst: +worst.toFixed(2), at, waits, sampled: +time.toFixed(1), stops: stops.slice(0, 12), nStops: stops.length };
      }
      // LOOK-2: the captain steps onto a villager's loop where nobody is near (so he is never put inside someone),
      // stands there 30 s: the villagers wait for him, none walks into him
      const look2 = [];
      for (const [name, x, z] of [['plazaNorth', -1.0, -13.67], ['pierWest', -3.8, -4.3], ['tavernTower', -11.75, -19.5]]) {
        const sp = env.walk.spawn;
        P.place(sp.x, sp.z, sp.h);
        let waited = 0;
        while (waited < 600 && P.vill().some((v) => Math.hypot(v.x - x, v.z - z) < 1.6)) {
          P.step(1 / 30, { x: 0, z: 0 });
          waited++;
        }
        P.place(x, z, Math.PI);
        for (let i = 0; i < 30; i++) P.step(1 / 30, { x: 0, z: 0 });
        const p0 = P.pos();
        let min = 9;
        let who = null;
        for (let i = 0; i < 30 * 30; i++) {
          P.step(1 / 30, { x: 0, z: 0 });
          const c = P.pos();
          for (const v of P.vill()) {
            const d = Math.hypot(v.x - c.x, v.z - c.z);
            if (d < min) {
              min = d;
              who = { v: v.index, loop: v.loop, at: [+v.x.toFixed(2), +v.z.toFixed(2)], s: +(i / 30).toFixed(1) };
            }
          }
        }
        const p1 = P.pos();
        look2.push({ name, clearAfter: +(waited / 30).toFixed(1), moved: +Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2), closest: +min.toFixed(2), ...(min < 0.6 ? { who } : {}) });
      }
      return { setup, runs, porter, rnd, look2 };
    });
    const { setup, runs, porter, rnd, look2 } = W;
    check(setup.drawn === 8 && setup.npcs.join() === 'barnacle,bess' && setup.links.join() === 'plazaGarden,plazaS1,plazaYard,tavernTower', `walking: four Manors on the island record: 8 villagers drawn on dock open, Bess and Barnacle in the town, the four rope bridges (${J(setup)})`);
    const bad = runs.filter((r) => !r.ok || r.stuck > 1);
    const worst = Math.max(...runs.map((r) => r.stuck));
    check(runs.length === 240 && bad.length === 0 && worst <= 1, `walking (b): a held key, a held stick and a tap-to-walk cross all four rope bridges both ways at 10 moments, never stalled over 1 s: ${runs.filter((r) => r.ok).length}/${runs.length} across, longest stall ${worst} s, slowest ${Math.max(...runs.map((r) => r.secs))} s${bad.length ? ' -> ' + J(bad.slice(0, 6)) : ''}`, 'mouth');
    check(porter.every((r) => r !== null && r < 6), `walking (c): the porter check: W held from the stalls reaches the pier past the porter every time (${J(porter)} s)`);
    check(rnd.worst <= 1, `walking (a): 30 s of random keys, stick drags and taps: never stuck behind a person for more than 1 s (longest ${rnd.worst} s${rnd.worst > 1 ? ' ' + J(rnd.at) : ''})`);
    check(rnd.sampled >= 120 && rnd.nStops === 0, `walking (d): over ${rnd.sampled} s no villager stops on a bridge, in a place circle, a doorway or at the gangplank (${rnd.nStops} stops${rnd.nStops ? ': ' + J(rnd.stops) : ''}; ${rnd.waits} samples of LOOK-2 waits for the captain there, not counted)`);
    check(look2.every((r) => r.moved < 0.05 && r.closest >= 0.6), `walking: standing on the villagers' loops for 30 s each, they wait for the captain (LOOK-2): never pushed, none closer than 0.6 u (${J(look2)})`);
    await ctx.close();
  });

  // --------------------------------------------------------------------------------------------------- quiz
  // The Riddle Bell by keyboard only (SPEC3 §7, §13.2): rounds on Shallow Shoals and Seagull Sands.
  await section('quiz', async () => {
    const { ctx, page } = await open({ label: 'quiz', store: { ...STORE, 'pirates-ahoy-island': island({ school: 1 }) } });
    await walkView(page, 'quiz');
    await page.keyboard.press('e');
    const opened = await page.evaluate(() => ({ view: window.__game.town.view, focus: T.focus(), purse: window.__game.state.purse }));
    const purse0 = opened.purse;
    // One round by keyboard. plan: for each question 'right' | 'wrong' | 'heldRight' (Tab to the right answer, a
    // held Enter) | 'buoyWrong' (H first, then a wrong answer); next: 'enter' | 'held' (a held Enter on Next).
    async function round(plan, nextHeld = []) {
      const log = [];
      for (let i = 0; i < plan.length; i++) {
        const q = await page.evaluate(() => T.q().round);
        const step = { i, index: q.index, right: q.question.right, n: q.question.options.length, fact: q.question.fact, rightText: q.question.options[q.question.right] };
        await page.evaluate(() => T.clearSfx());
        if (plan[i] === 'heldRight') {
          for (let k = 0; k <= q.question.right; k++) await page.keyboard.press('Tab');
          step.tabbedTo = await page.evaluate(() => T.focus());
          await page.keyboard.down('Enter');
          for (let k = 0; k < 3; k++) await page.keyboard.down('Enter');
          await page.keyboard.up('Enter');
          step.afterHeld = await page.evaluate(() => ({ mode: T.q().mode, index: T.q().round.index, picks: T.q().round.picks }));
        } else if (plan[i] === 'right') {
          await page.keyboard.press(`Digit${q.question.right + 1}`);
        } else {
          if (plan[i] === 'buoyWrong') {
            await page.keyboard.press('h');
            step.buoy = await page.evaluate(() => ({ removed: T.q().round.removed, buoys: T.q().round.buoys, max: T.q().round.buoysMax, live: T.text('quiz-live'), word: T.text(document.querySelector('#quiz-lifebuoy .qb-word')), gone: [...document.querySelectorAll('#quiz-answers .quiz-ans.gone')].map((b) => Number(b.dataset.answer)) }));
          }
          const removed = await page.evaluate(() => T.q().round.removed);
          let w = 0;
          while (w === q.question.right || removed.includes(w)) w++;
          step.pick = w;
          await page.keyboard.press(`Digit${w + 1}`);
        }
        step.after = await page.evaluate(() => {
          const rb = document.querySelector('#quiz-answers .quiz-ans.right');
          return {
            mode: T.q().mode,
            pick: T.q().round.picks[T.q().round.index],
            rightMark: rb ? { answer: Number(rb.dataset.answer), mark: T.text(rb.querySelector('.qa-mark')) } : null,
            say: T.text(document.querySelector('#quiz-feedback .qf-say')),
            fact: T.text(document.querySelector('#quiz-feedback .qf-fact')),
            live: T.text('quiz-live'),
            sfx: T.sfx(),
            focus: T.focus(),
          };
        });
        if (nextHeld.includes(i)) {
          await page.keyboard.down('Enter');
          for (let k = 0; k < 3; k++) await page.keyboard.down('Enter');
          await page.keyboard.up('Enter');
        } else await page.keyboard.press('Enter');
        step.next = await page.evaluate(() => ({ mode: T.q().mode, index: T.q().round ? T.q().round.index : null }));
        log.push(step);
      }
      await frames(page, 2);
      const res = await page.evaluate(() => ({ result: T.q().result, lines: T.resultLines(), live: T.text('quiz-live'), focus: T.focus(), purse: window.__game.state.purse, chest: T.stored('pirates-ahoy-purse'), rec: window.__game.quiz.record, stored: T.stored('pirates-ahoy-quiz'), writes: T.writes(['pirates-ahoy-quiz', 'pirates-ahoy-purse']) }));
      return { log, ...res };
    }
    // Play again / Next quiz on the results by Tab and Enter (focus starts on the first of them)
    async function pressResult(act) {
      for (let k = 0; k < 4; k++) {
        if ((await page.evaluate(() => T.focus())) === `act:${act}`) break;
        await page.keyboard.press('Tab');
      }
      const f = await page.evaluate(() => T.focus());
      await page.keyboard.press('Enter');
      return f;
    }
    await page.evaluate(() => T.clearWrites());
    await page.keyboard.press('Enter'); // the focused island: Shallow Shoals
    const startA = await page.evaluate(() => ({ mode: T.q().mode, level: T.q().round && T.q().round.level, focus: T.focus(), live: T.text('quiz-live'), q: T.q().round && T.q().round.question, buoyShown: T.shown('quiz-lifebuoy'), count: T.text(document.querySelector('#quiz-question .qp-count')) }));
    const wantLive = startA.q ? `Question 1 of 5. ${startA.q.q} Answers: ${startA.q.options.map((o, i) => `${i + 1}, ${o}.`).join(' ')}` : '';
    check(opened.view === 'quiz' && startA.mode === 'question' && startA.level === 0 && startA.count === 'Question 1 of 5' && startA.live === wantLive && startA.buoyShown,
      `quiz: Enter on the focused island starts Shallow Shoals' round: "Question 1 of 5", #quiz-live "${startA.live.slice(0, 90)}…", "Lifebuoy" shown (the Sea School)`);
    // Round A: 3 right (a held Enter on the right answer, a right one by its number, a held Enter on Next, a lifebuoy
    // then a wrong answer, a wrong answer): 1 star, 60 + Good try 10 gold
    const A = await round(['heldRight', 'right', 'right', 'buoyWrong', 'wrong'], [2]);
    const a0 = A.log[0];
    check(a0.tabbedTo === `answer:${a0.right}` && a0.afterHeld.mode === 'answered' && a0.afterHeld.index === 0 && a0.afterHeld.picks.length === 1 && a0.after.focus === 'quiz-next-btn' && a0.next.index === 1,
      `quiz: a held Enter on an answer answers once and doesn't move on (${J(a0.afterHeld)}); focus goes to Next, Enter moves on (${J(a0.next)})`);
    check(A.log[2].next.index === 3 && A.log[2].next.mode === 'question', `quiz: a held Enter on Next moves on once (to question ${A.log[2].next.index + 1})`);
    const right1 = A.log[1];
    check(right1.after.say === 'Right you are!' && right1.after.live === `Right!${right1.fact ? ` ${right1.fact}` : ''}` && right1.after.sfx.includes('bell') && !right1.after.sfx.includes('bonk') && right1.after.rightMark && right1.after.rightMark.answer === right1.right,
      `quiz: a right answer: "${right1.after.say}", the bell (${right1.after.sfx.join(',')}), #quiz-live "${right1.after.live.slice(0, 60)}"`);
    const bw = A.log[3];
    check(bw.buoy && bw.buoy.removed.length === 1 && bw.buoy.removed[0] !== bw.right && bw.buoy.buoys === 0 && bw.buoy.max === 1 && bw.buoy.gone.join() === bw.buoy.removed.join() && bw.buoy.word === 'Lifebuoy (0 left)' && /^Lifebuoy! .+ is gone\. 0 lifebuoys left\.$/.test(bw.buoy.live),
      `quiz: H throws the round's one lifebuoy (Sea School tier 1): a wrong answer goes (${J(bw.buoy)})`);
    const wrong = A.log[4];
    const wantWrongLive = `Not quite. The answer is ${wrong.rightText}.${wrong.fact ? ` ${wrong.fact}` : ''}`;
    check(wrong.after.mode === 'answered' && wrong.after.rightMark && wrong.after.rightMark.answer === wrong.right && wrong.after.rightMark.mark === '✓' && wrong.after.say === `Not quite! It's ${wrong.rightText}.` && wrong.after.fact === `Fun fact: ${wrong.fact}` && wrong.after.live === wantWrongLive && wrong.after.sfx.join() === 'bonk' && bw.after.sfx.filter((n) => n !== 'splash').join() === 'bonk',
      `quiz: a wrong answer shows ✓ on the right one, "${wrong.after.say}", the fun fact, and only the soft bonk (sounds ${J(wrong.after.sfx)}, with a lifebuoy first ${J(bw.after.sfx)}; #quiz-live "${wrong.after.live.slice(0, 70)}")`);
    const goldA = QUIZ_GOLD[0][0] + GOOD_TRY;
    check(A.result.correct === 3 && A.result.stars === 1 && A.purse === purse0 + goldA && A.chest === String(purse0 + goldA) && A.rec.stars[0] === 1 && A.rec.paid[0] === 1 && A.rec.tried[0] === 1 && A.writes.join() === 'pirates-ahoy-quiz,pirates-ahoy-purse' && A.stored === Q.serializeQuiz(Q.parseQuiz(A.stored)),
      `quiz: 3 right → 1 star and ${goldA} gold (60 + Good try 10): ${purse0} → ${A.purse}, the record written before the chest (${A.writes.join(' → ')})`);
    check(A.lines.includes('3 of 5 right: a star!') && A.lines.includes('+60 gold — new star!') && A.lines.includes('+10 gold — Good try!') && A.lines.includes('Seagull Sands is open!') && /^Round over at Shallow Shoals\. 3 of 5 right: a star! \+60 gold: new star! \+10 gold: Good try! Seagull Sands is open!/.test(A.live) && A.focus === 'act:next-quiz',
      `quiz: the results say so (${J(A.lines)}), focus on Next quiz; #quiz-live "${A.live}"`);
    // Round B: 4 right → 2 stars, +15; Round C: 5 right → 3 stars, +15; Round D: 5 right again → nothing
    const fB = await pressResult('again');
    const B = await round(['right', 'right', 'wrong', 'right', 'right']);
    await pressResult('again');
    const C = await round(['right', 'right', 'right', 'right', 'right']);
    await pressResult('again');
    const D = await round(['right', 'right', 'right', 'right', 'right']);
    check(fB === 'act:again' && B.result.stars === 2 && B.purse === A.purse + QUIZ_GOLD[0][1] && B.lines.includes('+15 gold — new star!') && !B.lines.some((l) => /Good try/.test(l)) && C.result.stars === 3 && C.purse === B.purse + QUIZ_GOLD[0][1] && C.lines.includes('5 of 5 right: all three stars!'),
      `quiz: Play again: 4 right → 2 stars (+${B.purse - A.purse}), 5 right → 3 stars (+${C.purse - B.purse}); "Good try!" paid once (${J(B.lines)} ${J(C.lines)})`);
    check(D.result.stars === 3 && D.purse === C.purse && D.result.gold === 0 && D.lines.includes('No new stars this time. Your best here: 3 of 3 stars.') && D.rec.stars[0] === 3 && D.rec.paid[0] === 3,
      `quiz: a replay with all three stars again pays nothing (${C.purse} → ${D.purse}; ${J(D.lines)})`);
    // Esc on the results: the map (Seagull Sands open, focus on it); Seagull Sands with 2 right twice: "So close",
    // Good try once
    await page.keyboard.press('Escape');
    const map = await page.evaluate(() => ({ mode: T.q().mode, focus: T.focus(), isles: T.isles() }));
    check(map.mode === 'map' && !map.isles[1].disabled && map.isles[2].disabled && /3 of 3 stars/.test(map.isles[0].words) && map.focus === 'level:0',
      `quiz: Esc on the results shows the map: Shallow Shoals "${map.isles[0].words}", Seagull Sands open, Turtle Cove locked (focus ${map.focus})`);
    await page.keyboard.press('Tab');
    const f1 = await page.evaluate(() => T.focus());
    await page.keyboard.press('Enter');
    const E = await round(['right', 'wrong', 'right', 'wrong', 'wrong']);
    await pressResult('again');
    const F = await round(['wrong', 'right', 'wrong', 'wrong', 'right']);
    check(f1 === 'level:1' && E.result.level === 1 && E.result.stars === 0 && E.purse === D.purse + GOOD_TRY && E.lines.includes('So close: 2 right! Have another go?') && E.lines.includes('+10 gold — Good try!') && F.purse === E.purse && !F.lines.some((l) => /gold/.test(l)) && F.rec.tried[1] === 1 && F.rec.stars[1] === 0,
      `quiz: Seagull Sands, 2 right: "So close: 2 right! Have another go?", Good try +${E.purse - D.purse} once, nothing the second time (${J(E.lines)} ${J(F.lines)})`);
    // Esc in a round: back to the map, "Your stars are safe"; Esc on the map: the town, focus on the bell's button
    await pressResult('again');
    await page.keyboard.press(`Digit1`);
    await page.keyboard.press('Escape');
    const left = await page.evaluate(() => ({ mode: T.q().mode, note: T.text(document.querySelector('#quiz-map .quiz-note')), live: T.text('quiz-live'), focus: T.focus(), rec: window.__game.quiz.record }));
    await page.keyboard.press('Escape');
    const town = await page.evaluate(() => ({ view: window.__game.town.view, focus: T.focus() }));
    check(left.mode === 'map' && left.note === 'You left the quiz. Your stars are safe!' && left.live === 'You left the quiz. Your stars are safe.' && left.focus === 'level:1' && left.rec.stars.join() === F.rec.stars.join() && town.view === 'town' && town.focus === 'place:quiz',
      `quiz: Esc in a round goes to the map ("${left.note}"), nothing lost; Esc on the map goes back to the town, focus on the bell's button (${J(town)})`);
    // the totals: §7.2's gold exactly once
    const total = (await page.evaluate(() => window.__game.state.purse)) - purse0;
    check(total === 90 + GOOD_TRY + GOOD_TRY, `quiz: in all, Shallow Shoals' 3 stars paid 90 and two islands' Good try 10 each: +${total} gold`);
    await ctx.close();
  });

  // ----------------------------------------------------------------------------------------------- quiztaps
  // The Riddle Bell by taps on a phone (390 × 844): the places bar, an island, the answers, Next, the lifebuoy,
  // Leave quiz, Map, Back to town. (A control that appears under a finger ignores taps for 350 ms.)
  await section('quiztaps', async () => {
    const { ctx, page } = await open({ touch: true, width: 390, height: 844, label: 'quiztaps', store: { ...STORE, 'pirates-ahoy-island': island({ school: 2 }) } });
    await walkView(page);
    const purse0 = await page.evaluate(() => window.__game.state.purse);
    await press(page, '#town-places [data-place="quiz"]', 'tap');
    const r = await arrive(page);
    // (a control that never shows up is noted, not waited on for long: the checks below then say which)
    const tap = async (sel) => {
      await sleep(420);
      await press(page, sel, 'tap');
    };
    await tap('#quiz-map [data-level="0"]');
    const st = await page.evaluate(() => ({ mode: T.q().mode, buoys: T.q().round && T.q().round.buoysMax }));
    // Shallow Shoals: every answer right by a tap, Next by a tap; the lifebuoy by a tap on the first question
    let buoy = null;
    for (let i = 0; i < 5; i++) {
      const q = await page.evaluate(() => T.q().round.question);
      if (i === 0) {
        await tap('#quiz-lifebuoy');
        buoy = await page.evaluate(() => ({ removed: T.q().round.removed, left: T.q().round.buoys }));
      }
      await tap(`#quiz-answers [data-answer="${q.right}"]`);
      await tap('#quiz-next-btn');
    }
    const res = await page.evaluate(() => ({ result: T.q().result, purse: window.__game.state.purse, lines: T.resultLines() }));
    const missed1 = missed.splice(0);
    check(missed1.length === 0 && r.view === 'quiz' && st.mode === 'question' && st.buoys === 2 && buoy.removed.length === 1 && buoy.left === 1 && res.result && res.result.correct === 5 && res.result.stars === 3 && res.purse === purse0 + 90 + GOOD_TRY,
      `quiztaps: a places-bar tap walks to the bell; taps play Shallow Shoals (the lifebuoy ${J(buoy)}, School tier 2: 2 a round): 5 right, 3 stars, +${res.purse - purse0} gold (${J(res.lines)})${missed1.length ? ' -> never shown: ' + missed1.join(', ') : ''}`);
    // Next quiz by a tap, an answer, Leave quiz; Map; Back to town
    await tap('#quiz-results [data-act="next-quiz"]');
    const nq = await page.evaluate(() => T.q().round && T.q().round.level);
    await tap('#quiz-answers [data-answer="0"]');
    await tap('#quiz-leave-btn');
    const lv = await page.evaluate(() => ({ mode: T.q().mode, note: T.text(document.querySelector('#quiz-map .quiz-note')) }));
    await tap('#quiz-back-btn');
    const back = await page.evaluate(() => ({ view: window.__game.town.view, focus: T.focus() }));
    check(missed.length === 0 && nq === 1 && lv.mode === 'map' && /Your stars are safe/.test(lv.note) && back.view === 'town' && back.focus === 'place:quiz', `quiztaps: Next quiz starts Seagull Sands (${nq}); Leave quiz shows the map ("${lv.note}"); Back to town (${J(back)})${missed.length ? ' -> never shown: ' + missed.join(', ') : ''}`);
    await ctx.close();
  });

  // ------------------------------------------------------------------------------------------------ quizrec
  // The quiz record: a seeded round, storage full (the stars kept, the gold owed and paid once), a reload, a
  // corrupt record.
  await section('quizrec', async () => {
    const { ctx, page } = await open({ label: 'quizrec', store: { ...STORE, 'pirates-ahoy-quiz': null } });
    const openQuiz = async () => {
      await walkView(page, 'quiz');
      await page.keyboard.press('e');
    };
    const playApi = (level, nRight, seed) => page.evaluate(([level, nRight, seed]) => {
      const q = T.q();
      if (!q.start(level, seed)) return null;
      for (let i = 0; i < 5; i++) {
        const Qn = q.round.question;
        let pick = Qn.right;
        if (i >= nRight) pick = Qn.right === 0 ? 1 : 0;
        q.answer(pick);
        q.next();
      }
      return { result: q.result, lines: T.resultLines(), purse: window.__game.state.purse, rec: window.__game.quiz.record, stored: T.stored('pirates-ahoy-quiz'), chest: T.stored('pirates-ahoy-purse'), stars: document.querySelector('#quiz-results .qr-stars') && document.querySelector('#quiz-results .qr-stars').getAttribute('aria-label') };
    }, [level, nRight, seed]);
    // a seeded round is the same round (a reload between, the record unchanged)
    await openQuiz();
    const s1 = await page.evaluate(() => { T.q().start(0, 4242); const r = T.q().round.questions.map((q) => `${q.id}:${q.options.join('/')}`); T.q().leave(); return r; });
    await reload(page);
    await openQuiz();
    const s2 = await page.evaluate(() => { T.q().start(0, 4242); const r = T.q().round.questions.map((q) => `${q.id}:${q.options.join('/')}`); T.q().leave(); return r; });
    const s3 = await page.evaluate(() => { T.q().start(0, 777); const r = T.q().round.questions.map((q) => `${q.id}:${q.options.join('/')}`); T.q().leave(); return r; });
    const cats = s1.map((s) => s.split('-')[0]).sort().join();
    check(s1.length === 5 && s1.join('|') === s2.join('|') && s1.join('|') !== s3.join('|') && cats === 'life,pirates,places,sea,sums', `quizrec: a seeded round is the same round after a reload (5 questions, one of each kind: ${cats}); another seed gives another round`);
    // storage refuses the quiz record: the stars show, no gold, the words; the map keeps them for the visit
    const p0 = await page.evaluate(() => window.__game.state.purse);
    await page.evaluate(() => T.block('pirates-ahoy-quiz'));
    const full = await playApi(0, 3, 11);
    const fmap = await page.evaluate(() => { T.q().map(); return T.isles(); });
    check(full && full.result.stars === 1 && full.result.saved === false && full.purse === p0 && full.chest === String(p0) && full.stored === null && full.stars === '1 of 3 stars' && full.lines.includes("Couldn't save your stars, so no gold this time. Your gold waits for you!") && /1 of 3 stars/.test(fmap[0].words) && !fmap[1].disabled,
      `quizrec: storage full: the star shows ("${full && full.stars}"), no gold (${p0} → ${full && full.purse}), "${full && full.lines[1]}"; the map keeps it for the visit and Seagull Sands opens`);
    // storage works again: the owed 60 is paid when the panel opens, once
    await page.evaluate(() => T.unblock());
    await page.keyboard.press('Escape');
    await openQuiz();
    const owed = await page.evaluate(() => ({ purse: window.__game.state.purse, note: T.text(document.querySelector('#quiz-map .quiz-note')), rec: window.__game.quiz.record, stored: JSON.parse(T.stored('pirates-ahoy-quiz') || 'null') }));
    await page.keyboard.press('Escape');
    await openQuiz();
    const again = await page.evaluate(() => window.__game.state.purse);
    check(owed.purse === p0 + QUIZ_GOLD[0][0] && owed.note === `+${QUIZ_GOLD[0][0]} gold for the stars you won last time!` && owed.stored && owed.stored.stars[0] === 1 && owed.stored.paid[0] === 1 && again === owed.purse,
      `quizrec: once storage works, the owed ${QUIZ_GOLD[0][0]} gold is paid when the quiz opens ("${owed.note}"), and only once (${p0} → ${owed.purse} → ${again})`);
    // the unsaved Good try is paid the next time that island's round is finished, once
    const gt1 = await playApi(0, 0, 12);
    const gt2 = await playApi(0, 0, 13);
    check(gt1.purse === again + GOOD_TRY && gt1.lines.includes('+10 gold — Good try!') && gt2.purse === gt1.purse && gt1.rec.tried[0] === 1, `quizrec: the unsaved Good try is paid with the island's next round (+${gt1.purse - again}), then never again (+${gt2.purse - gt1.purse})`);
    // only the chest refused: the record keeps the stars with the gold owed; paid once later
    await page.evaluate(() => { T.q().map(); T.block('pirates-ahoy-purse'); });
    const p1 = await page.evaluate(() => window.__game.state.purse);
    const chest = await playApi(1, 3, 21);
    await page.evaluate(() => T.unblock());
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await openQuiz();
    const paid = await page.evaluate(() => ({ purse: window.__game.state.purse, chest: T.stored('pirates-ahoy-purse'), rec: JSON.parse(T.stored('pirates-ahoy-quiz')) }));
    check(chest.result.saved === false && chest.purse === p1 && chest.lines.includes("Couldn't save your gold this time. It waits for you!") && JSON.parse(chest.stored).stars[1] === 1 && JSON.parse(chest.stored).paid[1] === 0 && paid.purse === p1 + QUIZ_GOLD[1][0] && paid.chest === String(paid.purse) && paid.rec.paid[1] === 1,
      `quizrec: only the chest refused: the star is saved with its gold owed ("${chest.lines[1]}"), then paid once when the quiz opens (${p1} → ${paid.purse})`);
    // the record survives a reload
    const before = await page.evaluate(() => window.__game.quiz.record);
    await reload(page);
    await openQuiz();
    const after = await page.evaluate(() => ({ rec: window.__game.quiz.record, isles: T.isles(), purse: window.__game.state.purse }));
    check(J(after.rec.stars) === J(before.stars) && J(after.rec.paid) === J(before.paid) && J(after.rec.tried) === J(before.tried) && after.purse === paid.purse && /1 of 3 stars/.test(after.isles[0].words) && /1 of 3 stars/.test(after.isles[1].words) && !after.isles[2].disabled,
      `quizrec: the record survives a reload (stars ${J(after.rec.stars)}, paid ${J(after.rec.paid)}; the map shows them)`);
    await ctx.close();
    // a corrupt record falls back to the defaults and is rewritten; a record with junk fields is fixed field by field
    const def = Q.serializeQuiz(Q.defaultQuiz());
    const junk = '{"v":1,"stars":[2,0,3,9,"x",0,0,0,0],"paid":[3,0,0,0,0,0,0,0,0],"tried":[1,0,2,0,0,0,0,0,0],"seen":["life-octopus-hearts","nope","life-octopus-hearts"],"__proto__":{"x":1}}';
    const fixed = Q.serializeQuiz(Q.parseQuiz(junk, BANK.QUESTIONS));
    const res = [];
    for (const raw of ['{"v":1,"stars":[3,', junk]) {
      const c = await open({ label: 'quizrec-corrupt', store: { ...STORE, 'pirates-ahoy-quiz': raw } });
      await walkView(c.page, 'quiz');
      await c.page.keyboard.press('e');
      res.push(await c.page.evaluate(() => ({ stored: T.stored('pirates-ahoy-quiz'), rec: window.__game.quiz.record, isles: T.isles().map((i) => i.disabled ? 'L' : i.words.match(/(\d) of 3 stars|no stars yet/)[0]), view: window.__game.town.view })));
      await c.ctx.close();
    }
    check(res[0].stored === def && res[0].view === 'quiz' && res[0].isles[0] === 'no stars yet' && res[1].stored === fixed && fixed !== junk && J(res[1].rec.stars) === J(JSON.parse(fixed).stars),
      `quizrec: a cut -quiz record falls back to the defaults and is rewritten (${res[0].stored}); junk fields are fixed field by field (${res[1].stored.slice(0, 80)}…; map ${res[1].isles.join(',')})`);
  });

  // -------------------------------------------------------------------------------------------------- build
  // Builder Bess (SPEC3 §8.3): a Cottage, the montage, villagers, the guards, storage full, too poor, the walk data.
  await section('build', async () => {
    const fixture = fs.readFileSync(FIXTURE, 'utf8');
    const { ctx, page } = await open({ label: 'build' });
    await walkView(page, 'builder');
    await page.keyboard.press('e');
    const b0 = await page.evaluate(() => ({ view: window.__game.town.view, purse: window.__game.state.purse, town: T.text('build-town'), rows: T.b().rows.length, walk: JSON.stringify(window.__game.env.walk, null, 1) + '\n' }));
    // Build Cottage at Tavern Row by Enter: the record first, then the chest; the camera frames the plot
    await page.evaluate(() => { T.clearWrites(); T.b().focus('homeA'); });
    await frames(page, 2);
    const btn = await page.evaluate(() => ({ text: T.text(document.querySelector('button[data-plot="homeA"]')), focus: T.focus(), looking: T.b().looking, pf: window.__game.town.api.plotFocus }));
    await page.keyboard.press('Enter');
    const b1 = await page.evaluate(() => ({ purse: window.__game.state.purse, chest: T.stored('pirates-ahoy-purse'), rec: window.__game.island.config, stored: T.stored('pirates-ahoy-island'), writes: T.writes(['pirates-ahoy-island', 'pirates-ahoy-purse']), montage: window.__game.env.montage, celebrating: T.b().celebrating, live: T.text('build-live'), row: T.b().rows.find((r) => r.id === 'homeA'), sfx: T.sfx() }));
    check(b0.view === 'build' && btn.text === 'Build Cottage — 100 gold' && btn.focus === 'plot:homeA' && btn.pf === 'homeA' && b1.purse === b0.purse - 100 && b1.chest === String(b1.purse) && b1.rec.t.homeA === 1 && /"homeA":1/.test(b1.stored) && b1.writes.join() === 'pirates-ahoy-island,pirates-ahoy-purse' && !!b1.montage && b1.celebrating && b1.live === 'Cottage built at Tavern Row. 2 villagers moved in.',
      `build: E at Bess opens the build panel; "${btn.text}" (the camera on ${btn.pf}); Enter builds it: ${b0.purse} → ${b1.purse}, the island record before the chest (${b1.writes.join(' → ')}), the montage runs (${J(b1.montage)}); "${b1.live}"`);
    // any key skips the montage: the Cottage stands, its 2 villagers walk out
    await page.keyboard.press('x');
    await frames(page, 2);
    const b2 = await page.evaluate(() => ({ montage: window.__game.env.montage, celebrating: T.b().celebrating, villagers: window.__game.env.villagers.length, tier: window.__game.env.plots.find((p) => p.id === 'homeA').tier, row: T.b().rows.find((r) => r.id === 'homeA'), view: window.__game.town.view, focus: T.focus() }));
    check(b2.montage === null && !b2.celebrating && b2.villagers === 2 && b2.tier === 1 && b2.row.tier === 'Tier 1 of 3' && b2.row.button === 'Upgrade to Townhouse — 250 gold' && b2.view === 'build',
      `build: a key skips the montage: the Cottage stands (tier ${b2.tier}, "${b2.row.button}"), 2 villagers walk out (${b2.villagers})`);
    // a held Enter builds once (Lagoon End)
    await page.evaluate(() => T.b().focus('homeB'));
    await frames(page, 2);
    await page.keyboard.down('Enter');
    for (let k = 0; k < 4; k++) await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    const held = await page.evaluate(() => ({ purse: window.__game.state.purse, t: window.__game.island.config.t }));
    await page.keyboard.press('x'); // skip that montage
    await frames(page, 2);
    // a double click builds once (Tailor's Lane)
    const dbl = await page.evaluate(() => {
      const b = document.querySelector('button[data-plot="homeC"]');
      const before = window.__game.state.purse;
      b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
      return { before, after: window.__game.state.purse, t: window.__game.island.config.t.homeC };
    });
    check(held.t.homeB === 1 && held.purse === b1.purse - 100 && dbl.before - dbl.after === 100 && dbl.t === 1, `build: a held Enter builds once (Lagoon End tier ${held.t.homeB}, −${b1.purse - held.purse}); a double click builds once (Tailor's Lane tier ${dbl.t}, −${dbl.before - dbl.after})`);
    await page.evaluate(() => T.b().skip());
    // the montage springs up with squash and stretch (it isn't skipped here: it runs to its end)
    await page.evaluate(() => T.b().focus('homeD'));
    await frames(page, 2);
    // (the building that springs up is a group added for the montage: groups that were there before don't count)
    const spring = async (pg) => {
      await pg.evaluate(() => { window.__before = new Set(); window.__game.scene.traverse((o) => { if (o.isGroup) window.__before.add(o.uuid); }); });
      await pg.keyboard.press('Enter');
      return pg.evaluate(async () => {
        const G = window.__game;
        const scales = [];
        const stages = new Set();
        const t0 = performance.now();
        // (game time: the montage needs about 21 frames at least, however slow they come; 120 s at most)
        for (let k = 0; G.env.montage && k < 600 && performance.now() - t0 < 120000; k++) {
          stages.add(G.env.montage.stage);
          G.scene.traverse((o) => { if (o.isGroup && !window.__before.has(o.uuid) && o.userData && o.userData.keep && o.scale.y !== 1) scales.push(+o.scale.y.toFixed(3)); });
          await new Promise((r) => requestAnimationFrame(r));
        }
        return { ended: !G.env.montage, stages: [...stages], squash: scales.length, min: scales.length ? Math.min(...scales) : 1, max: scales.length ? Math.max(...scales) : 1 };
      });
    };
    const sp = await spring(page);
    check(sp.ended && sp.stages.includes('spring') && sp.squash > 0 && sp.min < 0.95 && sp.max > 1.0, `build: left alone, the montage runs to its end: scaffold, then the building springs up with squash and stretch (${J(sp)})`);
    // storage full: refused at no cost
    await page.evaluate(() => { T.block('pirates-ahoy-island'); T.b().focus('bakery'); });
    await frames(page, 2);
    const p2 = await page.evaluate(() => window.__game.state.purse);
    await page.keyboard.press('Enter');
    const sf = await page.evaluate(() => ({ purse: window.__game.state.purse, chest: T.stored('pirates-ahoy-purse'), t: window.__game.island.config.t.bakery, row: T.b().rows.find((r) => r.id === 'bakery'), live: T.text('build-live'), montage: window.__game.env.montage }));
    await page.evaluate(() => T.unblock());
    check(sf.purse === p2 && sf.chest === String(p2) && sf.t === 0 && sf.row.button === "Couldn't save: storage is full or switched off" && sf.live === "Couldn't save: your browser's storage is full or switched off. Nothing was paid." && sf.montage === null,
      `build: storage full: nothing built, nothing paid (${p2} → ${sf.purse}); "${sf.row.button}"; "${sf.live}"`);
    // too poor: aria-disabled, "Need … more gold", Enter does nothing and focus stays (the cheapest builds first,
    // until a plot costs more than the chest holds)
    const target = await page.evaluate((plots) => {
      for (let k = 0; k < 12 && !T.b().rows.some((r) => r.state === 'poor'); k++) {
        const t = window.__game.island.config.t;
        const cheap = plots.filter((p) => t[p.id] < 3).sort((a, b) => a.costs[t[a.id]] - b.costs[t[b.id]])[0];
        T.b().build(cheap.id);
      }
      T.b().skip();
      const row = T.b().rows.find((r) => r.state === 'poor');
      const p = plots.find((q) => q.id === row.id);
      return { id: row.id, cost: p.costs[window.__game.island.config.t[row.id]], purse: window.__game.state.purse, tier: window.__game.island.config.t[row.id] };
    }, ISL.PLOTS.map((p) => ({ id: p.id, costs: p.costs })));
    await page.evaluate((id) => T.b().focus(id), target.id);
    await frames(page, 2);
    await page.keyboard.press('Enter');
    const poor = await page.evaluate((id) => ({ purse: window.__game.state.purse, row: T.b().rows.find((r) => r.id === id), aria: document.querySelector(`button[data-plot="${id}"]`).getAttribute('aria-disabled'), focus: T.focus(), live: T.text('build-live'), t: window.__game.island.config.t[id] }), target.id);
    const need = target.cost - target.purse;
    check(need > 0 && poor.purse === target.purse && poor.t === target.tier && poor.aria === 'true' && poor.row.button === `Need ${need} more gold` && poor.focus === `plot:${target.id}` && poor.live === `${poor.live.split(' costs ')[0]} costs ${target.cost} gold. You need ${need} more gold.`,
      `build: too poor (${target.purse} gold, ${target.id} costs ${target.cost}): "${poor.row.button}", aria-disabled, Enter builds nothing and keeps focus (${poor.focus}); "${poor.live}"`);
    // the walk data never changes with a purchase (the fixture, byte for byte)
    const walk = await page.evaluate(() => JSON.stringify(window.__game.env.walk, null, 1) + '\n');
    check(b0.walk === fixture && walk === fixture, `build: the walk data is the fixture's before and after every purchase (${walk.length} bytes)`);
    await page.keyboard.press('Escape');
    await ctx.close();
    // under reduced motion the building fades in: no squash and stretch
    const rm = await open({ label: 'build-reduced', reduced: true });
    await walkView(rm.page, 'builder');
    await rm.page.keyboard.press('e');
    await rm.page.evaluate(() => T.b().focus('homeA'));
    await frames(rm.page, 2);
    const rsp = await spring(rm.page);
    await frames(rm.page, 3);
    const rv = await rm.page.evaluate(() => ({ villagers: window.__game.env.villagers.length, tier: window.__game.island.config.t.homeA, montage: window.__game.town.api.montage }));
    check(rsp.ended && rsp.squash === 0 && rv.tier === 1 && rv.villagers === 2, `build: under reduced motion the building appears without squash and stretch (${J(rsp)}), its villagers walk out (${J(rv)})`);
    await rm.ctx.close();
    // every plot to tier 3: the Pirate Capital, the Governor's coat at Polly's, 8 villagers drawn
    const all = await open({ label: 'build-all', store: { ...STORE, 'pirates-ahoy-purse': '12000' } });
    await walkView(all.page);
    const coat0 = await all.page.evaluate(() => { window.__game.town.open('tailor'); const b = document.querySelector('[data-item="coat.governor"]'); const r = b && b.getAttribute('aria-disabled'); window.__game.town.back(); return r; });
    await all.page.evaluate(() => window.__game.town.open('builder'));
    const built = await all.page.evaluate(() => {
      const ranks = [];
      for (let k = 0; k < 3; k++) {
        for (const id of ['homeA', 'homeB', 'homeC', 'homeD', 'bakery', 'windmill', 'lighthouse', 'market', 'school', 'park']) {
          T.b().build(id);
          const r = T.text(document.querySelectorAll('#build-town b')[1]);
          if (!ranks.includes(r)) ranks.push(r);
        }
      }
      T.b().skip();
      return { ranks, purse: window.__game.state.purse, rec: window.__game.island.config, rows: T.b().rows.map((r) => `${r.button}|${r.disabled}`), note: T.text('build-note'), live: T.text('build-live') };
    });
    await frames(all.page, 3);
    const after = await all.page.evaluate(() => ({ villagers: window.__game.env.villagers.length, plots: window.__game.env.plots.map((p) => p.tier).join('') }));
    check(Object.values(built.rec.t).every((t) => t === 3) && built.purse === 12000 - 11800 && built.rows.every((r) => r === 'Fully built|true') && /Pirate Capital/.test(built.ranks[built.ranks.length - 1]) && built.ranks.some((r) => /Village/.test(r)) && built.ranks.some((r) => /Harbour Town/.test(r)) && /^Pirate Capital! Every plot is fully built/.test(built.note) && after.villagers === 8 && after.plots === '3333333333',
      `build: every plot to tier 3 for 11,800 gold: "Fully built" everywhere, the ranks ${J(built.ranks)}, "${built.note}", 8 villagers drawn`);
    await all.page.evaluate(() => { window.__game.town.back(); window.__game.town.open('tailor'); });
    const coat1 = await all.page.evaluate(() => { const b = document.querySelector('[data-item="coat.governor"]'); return b && { disabled: b.getAttribute('aria-disabled'), text: T.text(b) }; });
    check(coat0 === 'true' && coat1 && coat1.disabled === 'false', `build: the Governor's coat at Polly's: locked before (${coat0}), unlocked as the Pirate Capital (${J(coat1)})`, 'governor');
    await all.page.evaluate(() => window.__game.town.back());
    // island-tier3.png: the built-up west side (the Bakery, the Flower Park, the School, the Market) from the garden
    await all.page.evaluate(() => { const t = T.town(); t.enter({ ...(t.walk.snap(-14.4, -7.6, 3) || { x: -14.4, z: -7.6 }), h: -Math.PI / 2 - 0.25 }); t.recenter(); window.__game.town.simulate(3, { x: 0, z: 0 }); });
    await frames(all.page, 3);
    await snap(all.page, 'island-tier3.png');
    await all.ctx.close();
  });

  // -------------------------------------------------------------------------------------------------- perks
  // What the buildings do (SPEC3 §8.1): the Windmill's loads, the School's lifebuoys, the Lighthouse's warnings,
  // the Bakery's patch, the villagers' gift and the Market Hall's share on the level-cleared card.
  await section('perks', async () => {
    const t = { homeA: 3, homeB: 3, homeC: 3, homeD: 3, bakery: 2, windmill: 2, lighthouse: 3, market: 2, school: 3, park: 3 };
    const { ctx, page } = await open({ label: 'perks', store: { ...STORE, 'pirates-ahoy-island': island(t), 'pirates-ahoy-powder': '{"v":1,"own":{"fire":1,"frost":1,"stink":0}}' } });
    // the School: 3 lifebuoys a round
    await walkView(page, 'quiz');
    await page.keyboard.press('e');
    const school = await page.evaluate(() => { T.q().start(0, 5); const r = T.q().round; const w = T.text(document.querySelector('#quiz-lifebuoy .qb-word')); T.q().leave(); return { max: r.buoysMax, word: w }; });
    check(school.max === 3 && school.word === 'Lifebuoy (3 left)', `perks: the Sea School at tier 3 gives 3 lifebuoys a quiz round ("${school.word}")`);
    // the Windmill: 4 + 2 loads of each recipe owned at the level start
    const loads = await page.evaluate(() => {
      const G = window.__game;
      G.town.back();
      G.dock.leave(); // (the dock's main way out: the title)
      G.newGame(1);
      G.state.intro = 0;
      G.state.mode = 'playing';
      for (let i = 0; i < 60; i++) G.step(1 / 120);
      G.state.mode = 'paused';
      return G.specials.loads;
    });
    check(loads.fire === 6 && loads.frost === 6 && loads.stink === 0, `perks: the Powder Windmill at tier 2: 6 loads of each recipe owned at a level start (${J(loads)})`);
    // the Lighthouse: every warning 0.9 s longer (a lava bomb)
    const bomb = await page.evaluate(() => {
      const G = window.__game;
      const p = G.player;
      const b = G.launchBomb({ kind: 'lava', tx: p.x + 40, tz: p.z, warn: 2.4 });
      const T0 = b && b.T;
      G.bombs.length = 0;
      return { T: T0 };
    });
    check(Math.abs(bomb.T - 3.3) < 1e-6, `perks: the Lighthouse at tier 3: a lava bomb's 2.4 s warning lasts ${bomb.T} s (+0.9)`, 'lighthouse');
    // the Bakery: the crew patches 55% of the hull when reinforcements arrive
    const patch = await page.evaluate(() => {
      const G = window.__game;
      const p = G.player;
      p.hp = 10;
      G.state.mode = 'playing';
      const wave = G.state.wave;
      G.enemies.forEach((e) => G.damage(e, 9999));
      for (let i = 0; i < 120 * 8 && G.state.wave === wave && G.state.mode === 'playing'; i++) G.step(1 / 120);
      G.state.mode = 'paused';
      return { wave: G.state.wave, hp: p.hp, max: p.maxHp, banner: (document.getElementById('banner') || {}).textContent || '' };
    });
    const wantHp = Math.min(patch.max, 10 + patch.max * 0.55);
    check(patch.wave === 1 && Math.abs(patch.hp - wantHp) < 0.5 && /Your crew patches 55% of the hull/.test(patch.banner), `perks: the Bakery at tier 2: reinforcements arrive and the crew patches 55% of the hull (10 → ${patch.hp.toFixed(1)} of ${patch.max}; "${patch.banner.replace(/\s+/g, ' ').trim()}")`, 'bakery');
    // the level-cleared card: the villagers' gift (24 villagers × 5 × the Flower Park's 2 = 240, the cap) and the
    // Market Hall's 10% of the level's gold, at most 300
    const card = await page.evaluate(() => {
      const G = window.__game;
      G.state.mode = 'playing';
      G.state.gold = G.state.goldAtLevelStart + 9000;
      for (let w = 0; w < 8 && G.state.mode === 'playing'; w++) {
        G.enemies.forEach((e) => G.damage(e, 9999));
        for (let i = 0; i < 120 * 8 && G.state.mode === 'playing' && G.enemies.some((e) => G.fighting(e)) === false; i++) G.step(1 / 120);
      }
      for (let i = 0; i < 120 * 10 && G.state.mode === 'playing'; i++) G.step(1 / 120);
      return { mode: G.state.mode, summary: T.text('level-summary') };
    });
    check(card.mode === 'levelDone' && /Villagers' gift \+240/.test(card.summary) && /Market Hall \+10% \+300/.test(card.summary), `perks: the level-cleared card shows "Villagers' gift +240" and "Market Hall +10% +300" (capped) (${card.mode}: "${card.summary.slice(0, 200)}")`, 'gift');
    await ctx.close();
  });

  // ------------------------------------------------------------------------------------------------- powder
  // The tavern's Powder room (SPEC3 §2.5): three rows, on sale by progress, the storage rule, the docked ship.
  await section('powder', async () => {
    const { ctx, page } = await open({ label: 'powder', store: { ...STORE, 'pirates-ahoy-unlocked': '6', 'pirates-ahoy-purse': '700', 'pirates-ahoy-powder': null } });
    await walkView(page);
    await page.evaluate(() => window.__game.town.open('tavern'));
    const rows = await page.evaluate(() => {
      const list = document.getElementById('tavern-powder-list');
      const up = document.getElementById('tavern-up-list');
      return {
        ids: [...list.querySelectorAll('.powder-row')].map((li) => li.dataset.powderRow),
        outside: !up.contains(list) && !list.contains(up),
        upRows: up.querySelectorAll('.buy-btn').length,
        heading: T.text('tavern-powder-h'),
        rows: [...list.querySelectorAll('.powder-row')].map((li) => ({ id: li.dataset.powderRow, btn: T.text(li.querySelector('.buy-btn')), aria: li.querySelector('.buy-btn').getAttribute('aria-disabled'), label: li.querySelector('.buy-btn').getAttribute('aria-label'), why: T.text(li.querySelector('.up-why')) })),
      };
    });
    const [fire, frost, stink] = rows.rows;
    check(rows.ids.join() === 'fire,frost,stink' && rows.outside && rows.upRows === 4 && /Powder room/.test(rows.heading) && /Buy/.test(fire.btn) && fire.aria === 'false' && /Buy/.test(frost.btn) && /Soon/.test(stink.btn) && stink.aria === 'true' && /^Stink shot goes on sale after /.test(stink.why),
      `powder: the Powder room's three rows (${rows.ids.join(', ')}) sit outside #tavern-up-list (still ${rows.upRows} rows); on sale by progress at level 6: fire "${fire.btn}", frost "${frost.btn}", stink "${stink.btn}" ("${stink.why}")`);
    // storage full: nothing bought, no gold moves
    const ship0 = await page.evaluate(() => { window.__ship0 = window.__game.dock.ship; T.block('pirates-ahoy-powder'); const b = document.querySelector('[data-powder="fire"]'); b.scrollIntoView({ block: 'nearest' }); b.focus(); return window.__game.state.purse; });
    await page.keyboard.press('Enter');
    const sf = await page.evaluate(() => ({ purse: window.__game.state.purse, own: window.__game.specials.powder.own, why: T.text(document.querySelector('[data-powder-row="fire"] .up-why')), live: T.text('tavern-live'), same: window.__game.dock.ship === window.__ship0 }));
    check(sf.purse === ship0 && sf.own.fire === 0 && /^Couldn.t save/.test(sf.why) && /Nothing was paid/.test(sf.live) && sf.same, `powder: storage full: nothing bought, no gold moves ("${sf.why}"; "${sf.live}")`);
    // storage works: Enter buys Fire shot: the powder record first, the chest second; the docked ship gets its keg
    await page.evaluate(() => { T.unblock(); T.clearWrites(); document.querySelector('[data-powder="fire"]').focus(); });
    await page.waitForTimeout(450);
    await page.keyboard.press('Enter');
    const buy = await page.evaluate(() => ({ purse: window.__game.state.purse, chest: T.stored('pirates-ahoy-purse'), stored: T.stored('pirates-ahoy-powder'), writes: T.writes(['pirates-ahoy-powder', 'pirates-ahoy-purse']), rebuilt: window.__game.dock.ship !== window.__ship0, btn: T.text(document.querySelector('[data-powder="fire"]')), why: T.text(document.querySelector('[data-powder-row="fire"] .up-why')), tips: [...document.querySelectorAll('#tavern-rumour .rumour-tip')].map((e) => T.text(e)), live: T.text('tavern-live') }));
    check(buy.purse === ship0 - 300 && buy.chest === String(buy.purse) && buy.stored === '{"v":1,"own":{"fire":1,"frost":0,"stink":0}}' && buy.writes.join() === 'pirates-ahoy-powder,pirates-ahoy-purse' && buy.rebuilt && /Owned/.test(buy.btn) && buy.why === 'Press 4 in battle',
      `powder: Enter buys the Fire shot recipe for 300 (${ship0} → ${buy.purse}): ${buy.stored} written before the chest (${buy.writes.join(' → ')}), the docked ship rebuilt with its keg, "${buy.btn}" / "${buy.why}"; "${buy.live}"`);
    check(buy.tips.includes('Powder tip: The Maw laughs at fire!'), `powder: the rumour board's powder tip once Fire shot is owned (${J(buy.tips)})`);
    // a double click buys once (Frost shot)
    const dbl = await page.evaluate(() => { const b = document.querySelector('[data-powder="frost"]'); const before = window.__game.state.purse; b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 })); return { before, after: window.__game.state.purse, own: window.__game.specials.powder.own, live: T.text('tavern-live') }; });
    // (the second click is swallowed: it neither buys again nor answers "You have the … recipe" over the purchase)
    check(dbl.before - dbl.after === 300 && dbl.own.frost === 1 && dbl.own.fire === 1 && /^Bought the Frost shot recipe/.test(dbl.live), `powder: a double click on Frost shot buys it once (${dbl.before} → ${dbl.after}; "${dbl.live}")`);
    // the recipes survive a reload, the kegs on the docked ship with them
    await reload(page);
    const rl = await page.evaluate(() => { window.__game.dock.open('menu'); return { own: window.__game.specials.powder.own, purse: window.__game.state.purse }; });
    check(rl.own.fire === 1 && rl.own.frost === 1 && rl.own.stink === 0 && rl.purse === dbl.after, `powder: the recipes and the chest survive a reload (${J(rl)})`);
    await ctx.close();
  });

  // --------------------------------------------------------------------------------------------------- tabs
  // Two tabs of the game (one browser, the same storage): what one buys or wins shows in the other and never
  // goes down (SPEC3 §10.2).
  await section('tabs', async () => {
    const { ctx, page: A } = await open({ label: 'tab-A', store: { ...STORE, 'pirates-ahoy-purse': '3000', 'pirates-ahoy-quiz': null, 'pirates-ahoy-island': null, 'pirates-ahoy-powder': null } });
    const { page: B } = await open({ label: 'tab-B', ctx, store: null });
    for (const p of [A, B]) await walkView(p);
    // A builds a Cottage; B sees it, and B's own build keeps A's
    await A.evaluate(() => { window.__game.town.open('builder'); T.b().build('homeA'); T.b().skip(); });
    await frames(B, 3);
    const b1 = await B.evaluate(() => ({ t: window.__game.island.config.t, plot: window.__game.env.plots.find((p) => p.id === 'homeA').tier }));
    await B.evaluate(() => { window.__game.town.open('builder'); T.b().build('homeB'); T.b().skip(); });
    await frames(A, 3);
    const stored = JSON.parse(await A.evaluate(() => T.stored('pirates-ahoy-island')));
    const a1 = await A.evaluate(() => window.__game.island.config.t);
    check(b1.t.homeA === 1 && b1.plot === 1, `tabs: a Cottage built in one tab shows in the other (record ${J(b1.t.homeA)}, the 3D plot at tier ${b1.plot})`, 'tabs-island');
    check(stored.t.homeA === 1 && stored.t.homeB === 1 && a1.homeA === 1 && a1.homeB === 1, `tabs: the other tab's build keeps the first tab's: tiers never go down (saved ${J(stored.t)}, first tab ${J(a1)})`, 'tabs-island');
    // A buys Fire shot; B sees it, and B's Frost keeps A's Fire
    await A.evaluate(() => { window.__game.town.back(); window.__game.town.open('tavern'); window.__game.town.api.tavern.powder('fire'); });
    await frames(B, 3);
    const pb = await B.evaluate(() => { const o = window.__game.specials.powder.own; window.__game.town.back(); window.__game.town.open('tavern'); return { own: o, row: T.text(document.querySelector('[data-powder="fire"]')) }; });
    await B.evaluate(() => window.__game.town.api.tavern.powder('frost'));
    await frames(A, 3);
    const pa = await A.evaluate(() => ({ own: window.__game.specials.powder.own, stored: T.stored('pirates-ahoy-powder') }));
    check(pb.own.fire === 1 && /Owned/.test(pb.row) && pa.own.fire === 1 && pa.own.frost === 1 && pa.stored === '{"v":1,"own":{"fire":1,"frost":1,"stink":0}}', `tabs: a recipe bought in one tab shows in the other ("${pb.row}"), and the other's purchase keeps it (${pa.stored})`);
    // A wins a star; B sees it, and B's round with no right answers keeps it
    await A.evaluate(() => { window.__game.town.back(); window.__game.town.open('quiz'); const q = T.q(); q.start(0, 3); for (let i = 0; i < 5; i++) { q.answer(i < 3 ? q.round.question.right : (q.round.question.right + 1) % q.round.question.options.length); q.next(); } });
    await frames(B, 3);
    const qb = await B.evaluate(() => { window.__game.town.back(); window.__game.town.open('quiz'); return { stars: window.__game.quiz.record.stars, isles: T.isles().slice(0, 2) }; });
    await B.evaluate(() => { const q = T.q(); q.start(0, 4); for (let i = 0; i < 5; i++) { q.answer((q.round.question.right + 1) % q.round.question.options.length); q.next(); } });
    await frames(A, 3);
    const qs = JSON.parse(await A.evaluate(() => T.stored('pirates-ahoy-quiz')));
    check(qb.stars[0] === 1 && /1 of 3 stars/.test(qb.isles[0].words) && !qb.isles[1].disabled, `tabs: a star won in one tab shows in the other (${J(qb.stars)}; ${qb.isles[0].words})`, 'tabs-quiz');
    check(qs.stars[0] === 1 && qs.paid[0] === 1, `tabs: the other tab's round keeps the first tab's star and its gold paid: stars never go down (saved ${J(qs.stars)}, paid ${J(qs.paid)})`, 'tabs-quiz');
    await ctx.close();
  });

  // ------------------------------------------------------------------------------------------------- layout
  // The quiz and build panels at the 7 town sizes (SPEC3 §7.3, §8.3, §15).
  await section('layout', async () => {
    for (const touch of [true, false]) {
      const { ctx, page } = await open({ touch, width: touch ? 390 : 1280, height: touch ? 844 : 720, label: touch ? 'layout-touch' : 'layout', store: { ...STORE, 'pirates-ahoy-purse': '450', 'pirates-ahoy-island': island({ homeA: 3, homeB: 2, homeD: 1, bakery: 2, windmill: 1, market: 3, school: 2 }), 'pirates-ahoy-quiz': JSON.stringify({ v: 1, stars: [3, 2, 1, 0, 0, 0, 0, 0, 0], paid: [3, 2, 1, 0, 0, 0, 0, 0, 0], tried: [1, 1, 1, 0, 0, 0, 0, 0, 0], seen: [] }) } });
      await page.evaluate(probes);
      await walkView(page);
      for (const [w, h] of TOWN_SIZES.filter((s) => s[2] === touch)) {
        const tag = `${w}x${h}${touch ? ' touch' : ''}`;
        await page.setViewportSize({ width: w, height: h });
        await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [w, h], { timeout: 60000 });
        // the quiz: the map, a question (with a lifebuoy thrown), an answer with its fact, the results
        await page.evaluate(() => { T.walkView(); window.__game.town.open('quiz'); });
        await frames(page, 2);
        const qm = await page.evaluate(() => window.__probe.panel('quiz-panel'));
        const qmc = await page.evaluate(() => window.__probe.contrast('#quiz-panel'));
        await page.evaluate(() => { T.q().start(3, 9); T.q().hint(); });
        await frames(page, 2);
        const qq = await page.evaluate(() => window.__probe.panel('quiz-panel'));
        const qqc = await page.evaluate(() => window.__probe.contrast('#quiz-panel'));
        await page.evaluate(() => T.q().answer(T.q().round.question.right === 0 ? 1 : 0));
        await frames(page, 2);
        const qa = await page.evaluate(() => window.__probe.panel('quiz-panel'));
        const qac = await page.evaluate(() => window.__probe.contrast('#quiz-panel'));
        await page.evaluate(() => { for (let i = 0; i < 6 && T.q().mode !== 'results'; i++) { if (T.q().mode === 'question') T.q().answer(T.q().round.question.right); T.q().next(); } });
        await frames(page, 2);
        const qr = await page.evaluate(() => window.__probe.panel('quiz-panel'));
        const qrc = await page.evaluate(() => window.__probe.contrast('#quiz-panel'));
        const qp = [...new Set([...qm.problems.map((p) => `map: ${p}`), ...qq.problems.map((p) => `question: ${p}`), ...qa.problems.map((p) => `answered: ${p}`), ...qr.problems.map((p) => `results: ${p}`)])];
        const qc = [...qmc.bad, ...qqc.bad, ...qac.bad, ...qrc.bad];
        check(qp.length === 0 && qm.count >= 10 && qq.answers.length >= 3 && qq.answers.every((a) => a >= 56), `layout ${tag}: the quiz panel (map ${qm.count}, question ${qq.count}, answered ${qa.count}, results ${qr.count} controls; answers ${qq.answers.join('/')} px tall): no page scroll, every control reachable, ≥ 44 px, nothing overlapping${qp.length ? ' -> ' + qp.join('; ') : ''}`);
        check(qc.length === 0, `layout ${tag}: the quiz panel's texts reach 4.5:1 on solid plates (${qmc.n + qqc.n + qac.n + qrc.n} texts)${qc.length ? ' -> ' + J(qc.slice(0, 6)) : ''}`);
        if (w === 390 || w === 1280) {
          await page.evaluate(() => { T.q().map(); });
          await frames(page, 2);
          await snap(page, `ashore-quiz-map-${w}x${h}.png`);
        }
        // the build panel: both tabs
        await page.evaluate(() => { T.q().map(); T.walkView(); window.__game.town.open('builder'); });
        await frames(page, 2);
        const bh = await page.evaluate(() => window.__probe.panel('build-panel'));
        const bhc = await page.evaluate(() => window.__probe.contrast('#build-panel'));
        await page.evaluate(() => T.b().showTab('amenities'));
        await frames(page, 2);
        const ba = await page.evaluate(() => window.__probe.panel('build-panel'));
        const bac = await page.evaluate(() => window.__probe.contrast('#build-panel'));
        const bp = [...new Set([...bh.problems.map((p) => `homes: ${p}`), ...ba.problems.map((p) => `amenities: ${p}`)])];
        check(bp.length === 0 && bh.count >= 7 && ba.count >= 9, `layout ${tag}: the build panel (homes ${bh.count}, amenities ${ba.count} controls): no page scroll, every control reachable, ≥ 44 px, nothing overlapping${bp.length ? ' -> ' + bp.join('; ') : ''}`);
        check(bhc.bad.length + bac.bad.length === 0, `layout ${tag}: the build panel's texts reach 4.5:1 on solid plates (${bhc.n + bac.n} texts)${bhc.bad.length + bac.bad.length ? ' -> ' + J(bhc.bad.concat(bac.bad).slice(0, 6)) : ''}`);
        if (w === 390 || w === 1280) {
          await page.evaluate(() => T.b().focus('market'));
          await page.waitForFunction(() => !window.__game.town.api.town.panning, null, { timeout: 120000 }).catch(() => {});
          await frames(page, 3);
          await snap(page, `ashore-build-${w}x${h}.png`);
        }
        await page.evaluate(() => window.__game.town.back());
      }
      await ctx.close();
    }
  });

  // ------------------------------------------------------------------------------------------------ quizfit
  // On every town size, every answer of a round shows whole at the top of the quiz panel, unscrolled, ≥ 56 px tall,
  // with no page scroll (SPEC3 §7.3, ASH-2: on the shortest screens the panel squeezes itself until they do). Rounds
  // on four islands, and rounds dealt (with quiz.js makeRound, as the panel deals them) to hold the bank's longest
  // questions and answers, with the Sea School's lifebuoy in the footer. Every round is finished, so the next one's
  // deal depends only on the saved record.
  await section('quizfit', async () => {
    const QS = BANK.QUESTIONS;
    const tall = (e) => e.q.length + 3 * Math.max(e.right.length, ...e.wrong.map((w) => w.length));
    const BAND_LEVEL = { 1: 0, 2: 3, 3: 6 };
    const targets = [1, 2, 3].flatMap((band) => QS.filter((e) => e.band === band && (e.cat !== 'places' || (e.seas || 0) <= 7)).sort((a, b) => tall(b) - tall(a)).slice(0, 3));
    const quizRec = JSON.stringify({ v: 1, stars: [3, 3, 3, 3, 3, 3, 3, 3, 0], paid: [3, 3, 3, 3, 3, 3, 3, 3, 0], tried: [1, 1, 1, 1, 1, 1, 1, 1, 0], seen: [] });
    // one round (island lv, seed) played through by answering right: per question, any answer not whole inside the
    // body at scrollTop 0 (or under 56 px, or covered), and any page scroll
    const play = (page, lv, seed) => page.evaluate(([lv, seed]) => {
      const q = T.q();
      if (!q.start(lv, seed)) return { ids: [], bad: ['the round did not start'] };
      const ids = q.round.questions.map((x) => x.id);
      const bad = [];
      for (let i = 0; i < 5 && q.mode === 'question'; i++) {
        T.finish();
        const body = document.querySelector('#quiz-panel .dock-body');
        body.scrollTop = 0;
        const b = body.getBoundingClientRect();
        const top = b.top + body.clientTop;
        const bottom = Math.min(top + body.clientHeight, innerHeight);
        const answers = [...document.querySelectorAll('#quiz-answers .quiz-ans')].filter((a) => T.shown(a));
        if (answers.length !== q.round.question.options.length) bad.push(`q${i + 1}: ${answers.length} of ${q.round.question.options.length} answers shown`);
        answers.forEach((a, k) => {
          const r = a.getBoundingClientRect();
          const seen = Math.max(0, Math.min(r.bottom, bottom) - Math.max(r.top, top));
          if (r.top < top - 0.5 || r.bottom > bottom + 0.5) bad.push(`q${i + 1} "${q.round.question.q.slice(0, 32)}…": answer ${k + 1} shows ${Math.round(seen)} of ${Math.round(r.height)} px`);
          else if (r.height < 55.5) bad.push(`q${i + 1}: answer ${k + 1} is only ${Math.round(r.height)} px tall`);
          else {
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            if (!hit || !(hit === a || a.contains(hit))) bad.push(`q${i + 1}: answer ${k + 1} is covered`);
          }
        });
        const de = document.documentElement;
        if (de.scrollHeight > innerHeight + 1 || de.scrollWidth > innerWidth + 1) bad.push(`q${i + 1}: the page scrolls (${de.scrollWidth}x${de.scrollHeight})`);
        q.answer(q.round.question.right);
        q.next();
      }
      if (q.mode !== 'results') bad.push(`the round ended in ${q.mode}`);
      q.map();
      return { ids, bad };
    }, [lv, seed]);
    for (const touch of [true, false]) {
      const { ctx, page } = await open({ touch, width: touch ? 390 : 1280, height: touch ? 844 : 720, label: touch ? 'quizfit-touch' : 'quizfit', store: { ...STORE, 'pirates-ahoy-island': island({ school: 3 }), 'pirates-ahoy-quiz': quizRec } });
      await walkView(page);
      await page.evaluate(() => window.__game.town.open('quiz'));
      for (const [w, h] of TOWN_SIZES.filter((s) => s[2] === touch)) {
        const tag = `${w}x${h}${touch ? ' touch' : ''}`;
        await page.setViewportSize({ width: w, height: h });
        await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [w, h], { timeout: 60000 });
        await frames(page, 2);
        const problems = [];
        let rounds = 0;
        let found = 0;
        // the bank's longest: a seed whose round (dealt from the saved record, nothing asked since) holds it
        for (const t of targets) {
          // (the record as at the start, nothing seen: the panel's own list of questions asked is empty after a
          // finished round)
          await page.evaluate((r) => window.__game.quiz.set(JSON.parse(r)), quizRec);
          const lv = BAND_LEVEL[t.band];
          let seed = 0;
          for (let s = 1; s < 20000 && !seed; s++) if (Q.makeRound(QS, lv, s, { unlocked: 7, seen: [], recent: [] }).some((x) => x.id === t.id)) seed = s;
          if (!seed) {
            problems.push(`no round deals ${t.id}`);
            continue;
          }
          const r = await play(page, lv, seed);
          rounds++;
          if (r.ids.includes(t.id)) found++;
          else problems.push(`the round for ${t.id} dealt ${r.ids.join(',')}`);
          problems.push(...r.bad.map((p) => `${t.id} round: ${p}`));
        }
        for (const [lv, seed] of [[0, 21], [3, 22], [6, 23], [8, 24]]) {
          const r = await play(page, lv, seed);
          rounds++;
          problems.push(...r.bad.map((p) => `island ${lv + 1} round: ${p}`));
        }
        check(problems.length === 0 && rounds === targets.length + 4 && found === targets.length, `quizfit ${tag}: every answer of ${rounds} rounds (${found} dealt to hold the bank's longest questions and answers) shows whole at the top of the quiz panel, unscrolled, ≥ 56 px, uncovered; no page scroll${problems.length ? ' -> ' + problems.slice(0, 6).join('; ') + (problems.length > 6 ? ` (+${problems.length - 6} more)` : '') : ''}`);
        if (w === 568 || w === 320) {
          await page.evaluate(() => T.q().start(6, 25));
          await frames(page, 2);
          await snap(page, `ashore-quizfit-${w}x${h}.png`);
          await page.evaluate(() => T.q().leave());
        }
      }
      await ctx.close();
    }
  });

  // ------------------------------------------------------------------------------------------------ quizmap
  // The map's notes stay in view (ASH-3): the owed gold paid, "Your stars are safe!" after Leave quiz, and why an
  // island is locked, each inside the visible part of the panel and on top, with the focused island in view and
  // uncovered (390 × 844 and 568 × 320, touch). The trophies (§7.2, ASH-1): passing the ninth island wins the
  // Professor's mortarboard and the 27th star the Rainbow macaw; the results that complete each set say so once,
  // and #quiz-live reads it; the map's prize line says what was won (after a reload too); Polly has them
  // ([quiz-feats]: main raises feats.quiz / feats.stars from the quiz record, 3A).
  await section('quizmap', async () => {
    const GUARD_MS = 450; // (the panel ignores a tap on a control that appeared less than 350 ms ago)
    const noteSeen = (page) => page.evaluate(() => {
      T.finish();
      const n = document.querySelector('#quiz-map .quiz-note');
      const body = document.querySelector('#quiz-panel .dock-body');
      const b = body.getBoundingClientRect();
      const box = { top: b.top + body.clientTop, bottom: Math.min(b.top + body.clientTop + body.clientHeight, innerHeight) };
      const inView = (el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return r.height > 0 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5 && !!hit && (hit === el || el.contains(hit));
      };
      const f = document.activeElement && document.activeElement.closest ? document.activeElement.closest('#quiz-map [data-level]') : null;
      return { note: n ? T.text(n) : '', noteIn: !!n && inView(n), focus: f ? Number(f.dataset.level) : null, focusIn: !!f && inView(f), scrolled: Math.round(body.scrollTop), live: T.text('quiz-live') };
    });
    const showsNote = (s, text) => s.note === text && s.noteIn && s.focusIn;
    {
      const { ctx, page } = await open({ touch: true, width: 390, height: 844, label: 'quizmap-notes', store: { ...STORE, 'pirates-ahoy-quiz': JSON.stringify({ v: 1, stars: [1, 2, 3, 1, 1, 1, 0, 0, 0], paid: [1, 2, 3, 1, 1, 0, 0, 0, 0], tried: [1, 1, 1, 1, 1, 1, 0, 0, 0], seen: [] }) } });
      await walkView(page);
      await page.evaluate(() => window.__game.town.open('quiz'));
      await frames(page, 2);
      const owed = await noteSeen(page);
      const want = `+${QUIZ_GOLD[5][0]} gold for the stars you won last time!`;
      check(showsNote(owed, want) && owed.focus === 6, `quizmap 390x844: the owed gold's note "${owed.note}" shows in the panel (in view ${owed.noteIn}, body scrolled ${owed.scrolled} px) with the focused island ${owed.focus} in view and uncovered (${owed.focusIn})`);
      for (const [w, h] of [[390, 844], [568, 320]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [w, h], { timeout: 60000 });
        await page.evaluate(() => T.q().start(6, 3));
        await frames(page, 2);
        await page.waitForTimeout(GUARD_MS);
        await page.tap('#quiz-leave-btn', { timeout: 20000 }).catch(() => missed.push('#quiz-leave-btn'));
        await frames(page, 2);
        const left = await noteSeen(page);
        check(showsNote(left, 'You left the quiz. Your stars are safe!') && left.focus === 6 && /Your stars are safe/.test(left.live), `quizmap ${w}x${h}: Leave quiz: "${left.note}" shows in the panel (in view ${left.noteIn}, body scrolled ${left.scrolled} px), Storm Cape focused in view (${left.focusIn})${notShown()}`);
        await page.waitForTimeout(GUARD_MS);
        await page.evaluate(() => document.querySelector('#quiz-map [data-level="7"]').scrollIntoView({ block: 'nearest' }));
        await page.tap('#quiz-map [data-level="7"]', { force: true, timeout: 20000 }).catch(() => missed.push('#quiz-map [data-level="7"]'));
        await frames(page, 2);
        const locked = await noteSeen(page);
        check(showsNote(locked, 'Kraken Quay is locked. Pass Storm Cape first!') && locked.focus === 7 && /Kraken Quay is locked/.test(locked.live), `quizmap ${w}x${h}: a tap on locked Kraken Quay: "${locked.note}" shows in the panel (in view ${locked.noteIn}, body scrolled ${locked.scrolled} px), Kraken Quay focused in view (${locked.focusIn})${notShown()}`);
        if (w === 390) await snap(page, 'ashore-quiz-note-390x844.png');
      }
      await ctx.close();
    }
    {
      const MORTAR = "You won the Professor's mortarboard! Try it on at Polly's.";
      const MACAW = "You won the Rainbow macaw! Try it on at Polly's.";
      const { ctx, page } = await open({ touch: true, width: 390, height: 844, label: 'quizmap-trophies', store: { ...STORE, 'pirates-ahoy-quiz': JSON.stringify({ v: 1, stars: [3, 3, 3, 3, 3, 3, 3, 3, 0], paid: [3, 3, 3, 3, 3, 3, 3, 3, 0], tried: [1, 1, 1, 1, 1, 1, 1, 1, 0], seen: [] }) } });
      const prize = () => page.evaluate(() => [...document.querySelectorAll('#quiz-map .qm-prize')].map((p) => T.text(p)));
      const wardrobe = () => page.evaluate(() => {
        T.walkView();
        window.__game.town.open('tailor');
        const st = (id) => { const b = document.querySelector(`[data-item="${id}"]`); return b ? b.getAttribute('aria-disabled') : 'missing'; };
        const out = { hat: st('hat.mortarboard'), pet: st('pet.rainbow') };
        window.__game.town.back();
        return out;
      });
      // a round on Professor's Peak with `right` right answers: the results' lines and #quiz-live
      const round = (right, seed) => page.evaluate(([right, seed]) => {
        const q = T.q();
        q.start(8, seed);
        for (let i = 0; i < 5 && q.mode === 'question'; i++) {
          const Qn = q.round.question;
          q.answer(i < right ? Qn.right : (Qn.right + 1) % Qn.options.length);
          q.next();
        }
        T.finish();
        return { mode: q.mode, lines: T.resultLines(), live: T.text('quiz-live'), stars: window.__game.quiz.record.stars.join('') };
      }, [right, seed]);
      await walkView(page);
      const w0 = await wardrobe();
      await page.evaluate(() => window.__game.town.open('quiz'));
      const p0 = await prize();
      const r9 = await round(3, 5);
      check(r9.mode === 'results' && r9.lines.includes(MORTAR) && !r9.lines.includes(MACAW) && r9.live.includes(MORTAR), `quizmap: the ninth island passed (stars ${r9.stars}): the results say "${MORTAR}" and #quiz-live reads it (${J(r9.lines)})`);
      await page.evaluate(() => T.q().map());
      const p9 = await prize();
      check(p0.length === 1 && /^Pass all nine for the Professor's mortarboard!$/.test(p0[0]) && p9.join('|') === `${MORTAR}|Win all 27 stars for the Rainbow macaw!`, `quizmap: the map's prize line before (${J(p0)}) and after the ninth island (${J(p9)})`);
      const r27 = await round(5, 6);
      const again = await round(5, 7);
      check(r27.mode === 'results' && r27.stars === '333333333' && r27.lines.includes(MACAW) && !r27.lines.includes(MORTAR) && r27.live.includes(MACAW) && !again.lines.some((l) => /You won/.test(l)), `quizmap: the 27th star: the results say "${MACAW}" and #quiz-live reads it (${J(r27.lines)}); a replay wins nothing again (${J(again.lines)})`);
      await page.evaluate(() => T.q().map());
      await snap(page, 'ashore-quiz-trophies-390x844.png');
      await reload(page);
      await walkView(page);
      await page.evaluate(() => window.__game.town.open('quiz'));
      const p27 = await prize();
      check(p27.join('|') === `${MORTAR}|${MACAW}`, `quizmap: after a reload the map says both trophies were won (${J(p27)})`);
      const w27 = await wardrobe();
      check(w0.hat === 'true' && w0.pet === 'true' && w27.hat === 'false' && w27.pet === 'false', `quizmap: Polly's: the mortarboard and the Rainbow macaw locked before (${J(w0)}), won after the 9 islands and 27 stars and a reload (${J(w27)})`, 'quiz-feats');
      await ctx.close();
    }
  });

  // -------------------------------------------------------------------------------------------------- draws
  // Draw calls with every plot at tier 3, 8 villagers, Bess, Barnacle and two prize ships (SPEC3 §14).
  await section('draws', async () => {
    const { ctx, page } = await open({ label: 'draws', store: { ...STORE, 'pirates-ahoy-island': island(ALL3), 'pirates-ahoy-feats': '{"captures":4,"boardings":4,"rakes":0,"crits":0,"legend":0,"prizes":{"galleon":1,"manowar":2,"cutter":1}}' } });
    const calls = () => page.evaluate(() => window.__game.renderInfo.calls);
    await page.evaluate(() => window.__game.dock.open('menu'));
    await frames(page, 20);
    const yard = [];
    for (let i = 0; i < 12; i++) {
      await frames(page, 6);
      yard.push(await calls());
    }
    const env0 = await page.evaluate(() => ({ villagers: window.__game.env.villagers.length, plots: window.__game.env.plots.map((p) => p.tier).join(''), npcs: window.__game.env.folk().filter((f) => f.npc).length }));
    check(env0.villagers === 8 && env0.plots === '3333333333' && env0.npcs === 2 && Math.max(...yard) <= 450 && Math.min(...yard) > 0, `draws: the shipyard view with every plot at tier 3 (8 villagers, Bess and Barnacle): ${Math.min(...yard)}–${Math.max(...yard)} draw calls ≤ 450`);
    // the walk view: 30 spots × 8 headings
    await page.evaluate(() => window.__game.dock.ashore());
    await frames(page, 10);
    const spots = await page.evaluate(() => {
      const t = window.__game.town.api.town;
      const w = window.__game.env.walk;
      const pts = [];
      const more = [];
      for (const p of w.places || []) pts.push([p.x, p.z]);
      for (const a of w.areas || []) {
        pts.push([a.x, a.z]);
        if (a.kind === 'circle') for (let k = 0; k < 4; k++) more.push([a.x + Math.cos(k * 1.57) * a.r * 0.5, a.z + Math.sin(k * 1.57) * a.r * 0.5]);
        else {
          const c = Math.cos(a.ry || 0);
          const s = Math.sin(a.ry || 0);
          for (const [lx, lz] of [[-0.3, -0.3], [0.3, 0.3], [0.3, -0.3], [-0.3, 0.3]]) {
            const X = lx * (a.w || 0);
            const Z = lz * (a.d || 0);
            more.push([a.x + X * c + Z * s, a.z - X * s + Z * c]);
          }
        }
      }
      for (const l of w.links || []) { const m = l.pts[Math.floor(l.pts.length / 2)]; pts.push([m[0], m[2]]); }
      pts.push(...more);
      const got = [];
      for (const [x, z] of pts) {
        const s = t.walk.snap(x, z, 3);
        if (!s) continue;
        if (got.some((g) => Math.hypot(g[0] - s.x, g[1] - s.z) < 1.8)) continue;
        got.push([s.x, s.z]);
        if (got.length >= 30) break;
      }
      return got;
    });
    // (measured in a 320 × 180 window: the walk camera depends only on the window's shape, so a 16:9 window
    // draws the same as 1280 × 720 at a sixteenth of the pixels; the 8 busiest views are measured again at
    // 1280 × 720)
    const view = async (w, h) => {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [w, h], { timeout: 60000 });
    };
    const look = async ([x, z, h]) => {
      await page.evaluate(([x, z, h]) => { window.__game.town.api.town.enter({ x, z, h }); window.__game.town.simulate(0.6, { x: 0, z: 0 }); }, [x, z, h]);
      await frames(page, 2);
      return calls();
    };
    await view(320, 180);
    const town = [];
    for (const [x, z] of spots) for (let k = 0; k < 8; k++) town.push({ at: [x, z, (k * Math.PI) / 4], calls: await look([x, z, (k * Math.PI) / 4]) });
    await view(1280, 720);
    const busiest = [...town].sort((a, b) => b.calls - a.calls).slice(0, 8);
    const big = [];
    for (const v of busiest) big.push(await look(v.at));
    const small = town.map((v) => v.calls);
    const worst = Math.max(...small, ...big);
    check(spots.length === 30 && town.length === 240 && worst <= 450 && Math.min(...small, ...big) > 0, `draws: the walk view at 30 spots × 8 headings: max ${Math.max(...small)}, mean ${(small.reduce((a, b) => a + b, 0) / small.length).toFixed(0)}; the 8 busiest again at 1280 × 720: ${big.join(', ')} (${busiest.map((v) => v.calls).join(', ')} before); all ≤ 450`);
    // the quiz view (a question), the build view and each plot framed
    await page.evaluate(() => { T.walkView(); window.__game.town.open('quiz'); T.q().start(0, 3); });
    await page.waitForFunction(() => !window.__game.town.api.town.panning, null, { timeout: 120000 }).catch(() => {});
    await frames(page, 3);
    const quiz = await calls();
    await snap(page, 'quiz.png');
    await page.evaluate(() => { T.q().leave(); window.__game.town.back(); window.__game.town.open('builder'); });
    const plots = {};
    for (const id of PLOT_IDS) {
      await page.evaluate((id) => T.b().focus(id), id);
      await page.waitForFunction(() => !window.__game.town.api.town.panning, null, { timeout: 120000 }).catch(() => {});
      await frames(page, 3);
      plots[id] = await calls();
      if (id === 'windmill') await snap(page, 'build.png');
    }
    const pmax = Math.max(...Object.values(plots));
    check(quiz > 0 && quiz <= 450 && pmax <= 450, `draws: the quiz view ${quiz}, the build view framing each plot ${J(plots)} (max ${pmax}), ≤ 450`);
    await ctx.close();
  });

  // --------------------------------------------------------------------------------------------------- rays
  // From the shipyard's showcase poses (the sway's extremes and its middle) at the 6 shipyard layout sizes, the
  // docked ship is never behind a tier-3 plot's envelope (SPEC3 §8.1): rays to 12 points of the ship.
  await section('rays', async () => {
    const { ctx, page } = await open({ label: 'rays', reduced: true, store: { ...STORE, 'pirates-ahoy-island': island(ALL3) } });
    await page.evaluate(() => window.__game.dock.open('menu'));
    const out = [];
    for (const [w, h] of [[320, 480], [390, 844], [844, 390], [568, 320], [1280, 720], [1024, 1366]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [w, h], { timeout: 60000 });
      for (const [key, n] of [['ArrowLeft', 9], ['ArrowRight', 4], ['ArrowRight', 5]]) {
        await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
        for (let i = 0; i < n; i++) await page.keyboard.press(key);
        await frames(page, 2);
        out.push({ size: `${w}x${h}`, ...(await page.evaluate(async () => {
          const THREE = await import('/vendor/three.module.min.js');
          const G = window.__game;
          const cam = G.camera.position.clone();
          const ship = G.dock.ship;
          ship.updateMatrixWorld(true);
          const inv = new THREE.Matrix4().copy(ship.matrixWorld).invert();
          const v = new THREE.Vector3();
          const pts = [];
          ship.traverse((m) => {
            if (!m.isMesh || !m.visible || !m.geometry || !m.geometry.attributes.position) return;
            const pos = m.geometry.attributes.position;
            for (let i = 0; i < pos.count; i += 3) {
              v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
              if (v.y < 0.2) continue;
              pts.push([v.clone(), v.clone().applyMatrix4(inv)]);
            }
          });
          const c = new THREE.Vector3();
          for (const [, l] of pts) c.add(l);
          c.multiplyScalar(1 / Math.max(1, pts.length));
          // 12 points: the ship's furthest points in 12 directions of its own frame (bow, stern, both sides, the top,
          // the four quarters at deck height, bow and stern up high, and the middle of the deck)
          const dirs = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [1, 0.3, 1], [-1, 0.3, 1], [1, 0.3, -1], [-1, 0.3, -1], [0, 1, 1], [0, 1, -1], [0, 0.15, 0.01]];
          const picks = dirs.map(([x, y, z]) => {
            let best = null;
            let bd = -Infinity;
            for (const [wv, l] of pts) {
              const d = (l.x - c.x) * x + (l.y - c.y) * y + (l.z - c.z) * z;
              if (d > bd) { bd = d; best = wv; }
            }
            return best;
          });
          const boxes = G.env.walk.camBlockers.filter((b) => b.plot);
          const hits = [];
          for (const p of picks) {
            if (!p) continue;
            const L = cam.distanceTo(p);
            for (let s = 0; s <= L - 0.3; s += 0.1) {
              const x = cam.x + ((p.x - cam.x) * s) / L;
              const y = cam.y + ((p.y - cam.y) * s) / L;
              const z = cam.z + ((p.z - cam.z) * s) / L;
              for (const b of boxes) {
                if (y < b.y0 || y > b.y1) continue;
                const dx = x - b.x;
                const dz = z - b.z;
                const co = Math.cos(b.ry || 0);
                const si = Math.sin(b.ry || 0);
                const lx = dx * co - dz * si;
                const lz = dx * si + dz * co;
                if (Math.abs(lx) < b.w / 2 && Math.abs(lz) < b.d / 2 && !hits.includes(b.plot)) hits.push(b.plot);
              }
            }
          }
          return { cam: [+cam.x.toFixed(1), +cam.y.toFixed(1), +cam.z.toFixed(1)], points: picks.filter(Boolean).length, boxes: boxes.length, hits };
        })) });
      }
    }
    const bad = out.filter((o) => o.hits.length || o.points !== 12 || o.boxes !== 10);
    const poses = new Set(out.map((o) => o.cam.join()));
    check(out.length === 18 && bad.length === 0 && poses.size >= 3, `rays: from ${poses.size} showcase poses (the sway's two extremes and its middle) at the 6 shipyard sizes, rays to 12 points of the docked ship cross none of the 10 tier-3 plot envelopes${bad.length ? ' -> ' + J(bad) : ''}`);
    await ctx.close();
  });

  console.log(`\nerrors: ${errors.length ? errors.join('\n') : 'none'}`);
  check(errors.length === 0, `no page errors (${errors.length})`);
  await browser.close();
  server.close();
  console.log(`\nashore.cjs: ${passes} passed, ${failures} failed${pending ? `, ${pending} pending (${[...PENDING].join(',')})` : ''}`);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
