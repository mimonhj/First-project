// The Sunset Isles ashore (SPEC4 §13.2, tests/isle4.cjs): serves the game, drives the walkable island of Voyage IV in
// headless Chromium through the real controls and the window.__game test API (§11.3), and checks
// - bar:      the places bar keeps its six buttons at the 7 town sizes (44 px, no overlap, no page scroll); the Harbour
//             menu gains Island map (#harbour-map-btn) and keeps its other buttons
// - map:      I opens the Island map; its list reaches every district, plot and islander by keyboard only and by taps
//             (>= 44 px, #map-live); Walk there; Hop there (a fade, a cut under reduced motion, refused during a scene
//             or with a panel open, lands on free walk, the camera follows); Esc closes and gives focus back
// - boards:   a plot board's prompt ("Build here: …") and E / Enter / a tap open Bess's panel at that plot's row
// - talk:     the prompt priority door > board > talk > pet; E, Enter, a tap; Next; walking away ends it; #town-live;
//             a tap on an islander walks up and chats
// - pet:      petting an animal: its word and a heart, its sound once per 2 s
// - toasts:   walking in under each district's arch: its name for 2 s (#town-toast, aria-hidden) and in #town-live;
//             walking back out says nothing
// - lookout:  Climb, the panorama, down by a move key, Esc, a tap on Climb down and 30 s idle
// - walking:  the walking bug with the crowd at its maximum (21 plots at tier 3, every islander and animal out):
//             (a) 30 s of random keys, stick drags and taps never stuck > 1 s; (b) every new link crossed both ways
//             (rope bridges: key, stick and tap at 10 moments of the islanders' day, the five long ones named;
//             boardwalks and the steps: key and stick at 3 moments, tap at 1); (c) SPEC3's porter check; (d) no
//             islander stops on a link, near a rope bridge's mouth, in a place circle, a doorway or at the gangplank
//             (120 s sampled); LOOK-2 on the islanders' boardwalks; the section's time against its 6 min budget
// - scene:    the construction scene: the record, then the chest, then the scene; the stages in order with their
//             captions and pips; the blueprint; skip by a key, a tap and Skip (one cheer, the key does nothing else);
//             reduced motion's four stills and 5.0 s; leaving mid-scene keeps the building; the double-build guard;
//             Watch again writes nothing (and is refused while a scene runs); a SPEC3 plot uses the scene too; no ink
//             outline above the cut line (a pixel probe on the outline pass's colour); nothing outside the plot
//             clipped (materials and the plaza's pixels); the folded 56 px bar never covers the plot in portrait
// - panel:    four district tabs at the 7 sizes; at 320×480 a built row (with Watch again) no taller than today's;
//             the not-on-sale reasons; storage full refused at no cost; two tabs (island4 tiers merge by the larger);
//             an older tab rewriting the feats (this tab re-derives island4, shell and the new prizes)
// - camera:   from every porch the walk camera is never inside a pad's box and its boom keeps >= 2.5 u; the
//             shipyard showcase ray probe with every plot at tier 3 at the 6 layout sizes
// - draws:    the town walk view <= 450 at 48 spots × 8 headings (and the lookout panorama), the shipyard view
//             <= 450, the build view during a scene <= 450, the dock frame's triangles within §19 S0-D2's caps
//             (beside Stage 0's baselines)
// - shots:    the screenshots district-*.png (one per district, at its hop point) and crowd.png (the busiest view of
//             people); scene-*.png come from the scene section, map.png from map, lookout.png from lookout
//
// HOW TO RUN
//   node tests/isle4.cjs                  every section;   node tests/isle4.cjs walking   (or ISLE4_ONLY=map,talk)
//   ISLE4_ROOT=<dir>    serve another copy of the game (default: this checkout)
//   ISLE4_QUERY=<q>     the page's query (default "?v4=1&quality=low"; ?v4=1 is harmless once WITH_V4 is true)
//   SCREENSHOT_DIR=<d>  where the PNGs go (default <root>/tests/screenshots)
//   ISLE4_SKIP=walk48   (break-a-copy runs only) leave out the draws section's 48 × 8 probe; a skipped part FAILS
// Before Stage 3 the real game does not wire the Sunset Isles town (main.js's townMode ctx: island4, islanders,
// voyage4; env.setIsland4 / env.setIslanders at dock open; the __game.town and __game.island.scene forwards of §11.3;
// __game.island4.set / build; the -island4 storage listener and the feats re-derive of §10.2). Stage 2 ran this suite
// against a harness mirror that adds exactly that wiring to a copy of main.js: .dock-harness/v4/2D/mkmirror.py (in the
// git-ignored harness folder of the build machine) copies the live tree to .dock-harness/v4/2D/mk and patches main.js:
//   python3 .dock-harness/v4/2D/mkmirror.py && ISLE4_ROOT=.dock-harness/v4/2D/mk node tests/isle4.cjs [section]
// After 3A (Stage 3) run it against the game itself: `node tests/isle4.cjs` (no ISLE4_ROOT; ?v4=1 is in the default
// query until 3C/3B flip WITH_V4, and harmless after). 3C adds it to `npm test`. Every section first checks the APIs it
// needs and FAILS, saying which wiring is missing and whose it is, when one is not there: nothing passes silently.
// Sections and their times on SwiftShader (Stage 2, 4 CPUs shared with another agent's runs, load 5-10): bar 46 s,
// map 333 s, boards 87 s, talk 169 s, pet 56 s, toasts 204 s, lookout 191 s, walking 96 s (its own budget: <= 6 min),
// scene 325 s, panel 289 s, camera 57 s, draws 1324 s (the 48 × 8 probe: 392 views), shots 241 s; the whole suite
// about 57 min (up to 27 min for draws alone on a busier machine). The sections can be run apart (or in parallel).
// Waits are on the game's own clocks (frames, the scene's t, the toast's and the lookout's timers), never on the wall
// clock, except where §13.2 names seconds of real input; wall-clock timeouts are only a safety net for a busy machine.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('./server.cjs');

const ROOT = process.env.ISLE4_ROOT ? path.resolve(process.env.ISLE4_ROOT) : path.join(__dirname, '..');
const OUT = process.env.SCREENSHOT_DIR || path.join(ROOT, 'tests', 'screenshots');
const ONLY = [...(process.env.ISLE4_ONLY || '').split(','), ...process.argv.slice(2)].map((s) => s.trim()).filter(Boolean);
const QUERY = process.env.ISLE4_QUERY || '?v4=1&quality=low';
const BROWSER_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const SCREENSHOT_TIMEOUT = 120000;
const LOAD_TIMEOUT = 300000;
// the walking section's budget (§13.2: <= 6 min on SwiftShader, page load included)
const WALK_BUDGET = 360;
// today's (SPEC3's) built row at 320×480 (Tavern Row's Cottage with its button, in px), measured in Stage 2 on the
// flag-off game (eedb108's panel); used once no flag-off page can be served (WITH_V4 true for everyone), else measured live
const TODAY_ROW_320 = 128;

let failures = 0;
let passes = 0;
function check(cond, msg) {
  console.log(`${cond === true ? 'PASS' : 'FAIL'}  ${msg}`);
  if (cond === true) passes++;
  else failures++;
}
// ISLE4_SKIP=walk48 leaves out the slow part named (only for break-a-copy runs of the other checks of a section): a
// skipped part counts as a failure, so a run with anything skipped is never green
const SKIP = (process.env.ISLE4_SKIP || '').split(',').map((s) => s.trim()).filter(Boolean);
function skipped(part, what) {
  if (!SKIP.includes(part)) return false;
  check(false, `${what}: not run (ISLE4_SKIP=${part}; a run with a part skipped is never green)`);
  return true;
}
const J = (v) => JSON.stringify(v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function load(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
}

const SPEC3 = ['homeA', 'homeB', 'homeC', 'homeD', 'bakery', 'windmill', 'lighthouse', 'market', 'school', 'park'];
const NEW = ['homeE', 'homeF', 'homeG', 'forge', 'fishing', 'farm', 'music', 'museum', 'observatory', 'aquarium', 'grotto'];
const island = (t = {}) => JSON.stringify({ v: 1, t: Object.fromEntries(SPEC3.map((id) => [id, t[id] ?? t.all ?? 0])) });
const island4 = (t = {}) => JSON.stringify({ v: 1, t: Object.fromEntries(NEW.map((id) => [id, t[id] ?? t.all ?? 0])) });
const voyage4 = (o = {}) => JSON.stringify({ v: 1, plays: [1, 1, 1], met: 255, won: 1, tips: 65535, prizes: {}, ...o });
const feats = (o = {}) => JSON.stringify({ captures: 12, boardings: 3, rakes: 0, crits: 0, legend: 1, kraken: 1, quiz: 0, stars: 0, island: 30, shell: 1, island4: 33, prizes: {}, ...o });
// A returning player who has sailed Voyage IV: every level open, the tutorial and every tip done, gold
const STORE = {
  'pirates-ahoy-unlocked': '12',
  'pirates-ahoy-tutorial-done': '1',
  'pirates-ahoy-tips': '65535',
  'pirates-ahoy-purse': '5000',
  'pirates-ahoy-voyage4': voyage4(),
  'pirates-ahoy-feats': feats({ island: 0, island4: 0 }),
};
// the crowd at its maximum: all 21 plots at tier 3, the Shellback beaten (the hermit crab), every islander and animal
const FULL = { ...STORE, 'pirates-ahoy-island': island({ all: 3 }), 'pirates-ahoy-island4': island4({ all: 3 }), 'pirates-ahoy-feats': feats() };
const TOWN_SIZES = [[320, 480, true], [360, 640, true], [390, 844, true], [844, 390, true], [568, 320, true], [1024, 600, false], [1280, 720, false]];
const OLD_LINKS = ['plazaS1', 'tavernTower', 'plazaGarden', 'plazaYard'];
const LONG_ROPES = ['yardS7', 'tavernS3', 'gardenS13', 's13S14', 's7S17'];

// ---------------------------------------------------------------------------------------------------------
// In-page helpers (installed after every page load as window.T)
// ---------------------------------------------------------------------------------------------------------
function installHelpers() {
  const G = window.__game;
  if (!window.__storageHooked) {
    window.__storageHooked = true;
    const set0 = Storage.prototype.setItem;
    window.__writes = [];
    window.__block = new Set();
    Storage.prototype.setItem = function (k, v) {
      if (this === window.localStorage && (window.__block.has(k) || window.__block.has('*'))) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      if (this === window.localStorage) {
        const S = window.__game && window.__game.env && window.__game.env.scene;
        window.__writes.push({ k, scene: !!(S && S.running) });
      }
      return set0.call(this, k, v);
    };
  }
  // the game's loop can be held still while a screenshot is taken (the game asks for its next frame by
  // requestAnimationFrame: held, those asks wait; the canvas keeps its last frame), so no game time passes in a slow capture
  if (!window.__rafHooked) {
    window.__rafHooked = true;
    const raf0 = window.requestAnimationFrame.bind(window);
    window.__held = null;
    window.requestAnimationFrame = (cb) => {
      if (window.__held) {
        window.__held.push(cb);
        return 0;
      }
      return raf0(cb);
    };
    window.__holdLoop = (on) => {
      if (on) {
        window.__held = window.__held || [];
        return true;
      }
      const q = window.__held || [];
      window.__held = null;
      for (const cb of q) raf0(cb);
      return q.length;
    };
  }
  if (G.audio && !G.audio.__hooked) {
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
    b: () => G.town.api.build,
    pos: () => ({ ...G.town.pos }),
    // put the captain somewhere (snapped onto the walk), facing h, the camera straight behind him
    at(x, z, h, r = 3) {
      const t = T.town();
      const q = t.walk.snap(x, z, r) || { x, z };
      t.enter({ x: q.x, z: q.z, h });
      t.recenter();
      G.town.simulate(0.3, { x: 0, z: 0 });
      return T.pos();
    },
    // at a place's own spot (its circle's middle, facing the way it faces)
    atPlace(id) {
      const p = G.env.walk.places.find((q) => q.id === id);
      if (!p) return null;
      return T.at(p.x, p.z, Number.isFinite(p.face) ? p.face : 0, 1);
    },
    walkView(place = null) {
      if (G.state.mode !== 'dock') G.dock.open('menu');
      if (G.town.view === 'shop') G.dock.ashore();
      for (let k = 0; k < 3 && G.town.view !== 'town'; k++) G.town.back();
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
      if (d.kind && d.id) return `${d.kind}:${d.id}`;
      if (d.place) return `place:${d.place}`;
      if (d.plot) return `plot:${d.plot}`;
      if (d.watch) return `watch:${d.watch}`;
      return a.tagName;
    },
    finish: () => document.getAnimations().forEach((a) => { try { if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch { /* */ } }),
    writes: (keys) => window.__writes.filter((w) => !keys || keys.includes(w.k)).map((w) => w.k),
    writesFull: () => window.__writes.slice(),
    clearWrites: () => { window.__writes.length = 0; },
    block: (...keys) => keys.forEach((k) => window.__block.add(k)),
    unblock: () => window.__block.clear(),
    sfx: () => window.__sfx.slice(),
    clearSfx: () => { window.__sfx.length = 0; },
    stored: (k) => localStorage.getItem(k),
    // a construction scene (and a skip's wave) run to its end on its own clock (__game.island.scene.advance, §5.4), then
    // a few frames for the panel and the town to let go of it
    endScene: async () => {
      for (let n = 0; n < 400 && G.env.scene && G.env.scene.running; n++) G.island.scene.advance(0.1);
      await T.until(() => !(G.env.scene && G.env.scene.running), 900);
      await T.frames(3);
    },
    frames: (n = 1) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }),
    // wait for cond() on the game's frames (n frames at most; a busy machine only makes it slower, never shorter)
    until: async (cond, n = 600) => {
      for (let k = 0; k < n; k++) {
        if (cond()) return k;
        await new Promise((r) => requestAnimationFrame(r));
      }
      return cond() ? n : -1;
    },
    // a rope bridge (or anything) on screen: world → CSS px
    toScreen(x, y, z) {
      const cam = G.camera;
      cam.updateMatrixWorld();
      const v = { x, y, z };
      const e = cam.matrixWorldInverse.elements;
      const p = cam.projectionMatrix.elements;
      const vx = e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12];
      const vy = e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13];
      const vz = e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14];
      const cx = p[0] * vx + p[4] * vy + p[8] * vz + p[12];
      const cy = p[1] * vx + p[5] * vy + p[9] * vz + p[13];
      const cw = p[3] * vx + p[7] * vy + p[11] * vz + p[15];
      if (cw <= 0) return null;
      return { x: ((cx / cw + 1) / 2) * innerWidth, y: ((1 - cy / cw) / 2) * innerHeight, front: cw > 0 };
    },
    // what this section needs and is missing (the wiring and whose it is); [] when everything is there
    need(what) {
      const out = [];
      const tm = G.town && G.town.api;
      for (const w of what) {
        if (w === 'v4' && !(G.voyage && G.voyage.WITH_V4)) out.push('WITH_V4 is off: serve the game with ?v4=1 (ISLE4_QUERY) until Stage 3 sets it');
        if (w === 'town4' && !(tm && tm.withV4)) out.push("townMode was not built with withV4 (main.js's townMode ctx, 2A)");
        if (w === 'forwards') {
          let r = null;
          try {
            r = G.town.hop('isle4:nowhere');
          } catch (e) {
            r = String(e);
          }
          if (!r || typeof r !== 'object') out.push("__game.town.hop is Stage 0's placeholder (it returns false): main.js must forward __game.town.{islanders, critters, talk, pet, hop, map, districtAt, lookout} to townMode.api (SPEC4 §11.3; 2A's R3 hook)");
          else if (!G.town.map || typeof G.town.map.open !== 'function' || G.town.map.api === undefined) out.push("__game.town.map is Stage 0's placeholder: forward it to townMode.api.map (2A)");
        }
        if (w === 'panel4' && !(tm && tm.build && Array.isArray(tm.build.tabs))) out.push("Bess's panel is today's (no district tabs): main.js's townMode ctx has no island4 { state, build } (3A, Stage 3)");
        if (w === 'islanders' && !(G.env && G.env.v4 && G.env.v4.folk && G.env.v4.folk.people.length)) out.push('nobody lives on the island: main.js must call env.setIslanders(islanders.roster(...)) at dock open and give townMode ctx islanders { roster, progress } (3A, Stage 3)');
        if (w === 'critters' && !(G.env && G.env.critters && G.env.critters.list && G.env.critters.list.length)) out.push('no animals out: env.setIslanders(roster) at dock open hands them to critters.js (3A, Stage 3)');
        if (w === 'island4api') {
          let r = null;
          try {
            r = G.island4 && typeof G.island4.set === 'function' ? G.island4.set(G.island4.config) : null;
          } catch {
            r = null;
          }
          if (!r || typeof r !== 'object') out.push("__game.island4.set is Stage 0's placeholder (it returns null): main.js must validate, save and show the record (SPEC4 §11.3; 2A/3A)");
        }
        if (w === 'island4sync' && !window.__isle4SyncOk) out.push('');
      }
      return out.filter(Boolean);
    },
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
  const ISL = await load('src/island.js');
  const PLAN = await load('src/islandPlan.js');
  const BS = await load('src/buildScene.js');
  const PLOT_NAME = Object.fromEntries([...ISL.PLOTS, ...(ISL.PLOTS4 || [])].map((p) => [p.id, p.name]));

  // A page of the game. store: localStorage set before the game first loads in this tab (not on a reload); ctx: an
  // existing browser context (a second tab shares its storage); seed: the page's Math.random seeded; crowd: the dock
  // opened and every islander built (one a frame, behind the "Rowing to…" toast) before it returns.
  async function open({ width = 1280, height = 720, touch = false, store = STORE, reduced = false, label = 'page', ctx = null, seed = 0, crowd = false, query = QUERY } = {}) {
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
    // (a busy machine can miss the first load: one more try before the section fails)
    for (let tryN = 0; ; tryN++) {
      try {
        await page.goto(base + query, { waitUntil: 'domcontentloaded', timeout: LOAD_TIMEOUT });
        await page.waitForFunction(() => window.__gameReady === true && window.__game && window.__game.env, null, { timeout: LOAD_TIMEOUT });
        break;
      } catch (e) {
        if (tryN >= 1) throw e;
        console.log(`     (${label}: the page did not load (${String(e.message).split('\n')[0]}); once more)`);
      }
    }
    await page.evaluate(installHelpers);
    if (crowd) await built(page);
    return { ctx, page };
  }
  // the dock opened, every islander and builder built (folk4's prepare(), one a frame from dock open)
  async function built(page) {
    await page.evaluate(() => { if (window.__game.state.mode !== 'dock') window.__game.dock.open('menu'); });
    await page.waitForFunction(() => { const v = window.__game.env.v4; return !v || !v.folk || v.folk.pending === 0; }, null, { timeout: LOAD_TIMEOUT, polling: 500 }).catch(() => {});
  }
  const frames = (page, n = 2) => page.evaluate((n) => T.frames(n), n);
  const snap = async (page, name) => {
    await page.evaluate(() => T.finish());
    // (the loop held still for the capture: a slow SwiftShader capture takes no game time, a scene does not run on)
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => { window.__holdLoop(true); r(); })));
    try {
      await page.screenshot({ path: path.join(OUT, name), timeout: SCREENSHOT_TIMEOUT });
    } finally {
      await page.evaluate(() => window.__holdLoop(false)).catch(() => {});
    }
  };
  const walkView = (page, place = null) => page.evaluate((place) => T.walkView(place), place);
  const missed = [];
  const press = async (pg, sel, how = 'click') => {
    const ok = await pg[how](sel, { timeout: 20000 }).then(
      () => true,
      (e) => missed.push(`${sel} (${String(e.message).split('\n')[0].slice(0, 120)})`) && false,
    );
    await pg.evaluate(() => T.frames(2)).catch(() => {});
    return ok;
  };
  const notShown = () => (missed.length ? ' -> never shown: ' + missed.splice(0).join(', ') : '');
  // the section's APIs: each missing one FAILS the section with what is missing and whose it is
  async function needs(page, name, what) {
    const miss = await page.evaluate((w) => T.need(w), what);
    if (miss.length) check(false, `${name}: cannot run: ${miss.join('; ')}`);
    return miss.length === 0;
  }
  const timings = {};
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
    for (const c of browser.contexts()) await c.close().catch(() => {});
    timings[name] = (Date.now() - t0) / 1000;
    console.log(`     (${name}: ${timings[name].toFixed(1)} s)`);
  }
  // the town's layout probes (as tests/town.cjs and tests/ashore.cjs)
  const probes = () => {
    const R = (el) => el.getBoundingClientRect();
    const ov = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const inside = (r, box) => r.left >= box.left - 0.5 && r.top >= box.top - 0.5 && r.right <= box.right + 0.5 && r.bottom <= box.bottom + 0.5;
    const shown = (el) => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible' && !el.closest('.hidden');
    const name = (el) => el.id || (el.dataset && (el.dataset.place || el.dataset.id || el.dataset.plot || el.dataset.watch)) || (el.className && String(el.className.baseVal ?? el.className).split(' ')[0]) || el.tagName;
    const pageScroll = () => {
      const de = document.documentElement;
      return de.scrollWidth > innerWidth + 1 || de.scrollHeight > innerHeight + 1 ? `the page scrolls (${de.scrollWidth}x${de.scrollHeight})` : null;
    };
    const screen = () => ({ left: 0, top: 0, right: innerWidth, bottom: innerHeight });
    const textOut = (el) => {
      const box = R(el);
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent.trim()) continue;
        let hidden = false;
        for (let p = n.parentElement; p && p !== el.parentElement; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if ((cs.display !== 'inline' && (p.clientWidth <= 1 || p.clientHeight <= 1)) || (p !== el && (cs.position === 'absolute' || cs.position === 'fixed'))) hidden = true;
        }
        if (hidden) continue;
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) {
          const d = { left: box.left - r.left, right: r.right - box.right, top: box.top - r.top, bottom: r.bottom - box.bottom };
          const side = Object.keys(d).find((k) => d[k] > 1.5);
          if (r.width > 0.5 && side) return `"${n.textContent.trim().slice(0, 24)}" ${Math.round(d[side])} px past the ${side}`;
        }
      }
      return null;
    };
    function reach(el, out, box = null, scroller = null) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (scroller && !inside(R(el), R(scroller)) && R(el).height <= scroller.clientHeight) scroller.scrollTop += R(el).top - R(scroller).top - (scroller.clientHeight - R(el).height) / 2;
      const r = R(el);
      if (window.scrollX || window.scrollY) out.push(`showing ${name(el)} scrolled the page`);
      if (!inside(r, screen()) || (box && !inside(r, R(box))) || (scroller && !inside(r, R(scroller)))) out.push(`${name(el)} can't be scrolled into view`);
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !(hit === el || el.contains(hit))) out.push(`${name(el)} is covered by ${hit && name(hit)}`);
      // (44 CSS px, to the layout's rounding: a box of 43.9 px is drawn 44 px tall)
      if (Math.round(r.width) < 44 || Math.round(r.height) < 44) out.push(`${name(el)} is only ${r.width.toFixed(1)}x${r.height.toFixed(1)}`);
      const t = textOut(el);
      if (t) out.push(`${name(el)}'s label is cut off (${t})`);
      return r;
    }
    function noOverlap(list, what, out) {
      const rs = list.map(R);
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (ov(rs[i], rs[j]) > 1) out.push(`${what}: ${name(list[i])} and ${name(list[j])} overlap`);
    }
    window.__probe = {
      reach,
      pageScroll,
      bar() {
        T.finish();
        const bar = document.getElementById('town-places');
        const btns = [...bar.querySelectorAll('[data-place]')].filter(shown);
        const rs = btns.map(R);
        const stick = document.getElementById('town-joystick');
        const act = document.getElementById('town-action');
        const hits = [stick, act].filter(shown).filter((el) => ov(R(el), R(bar)) > 1).map((el) => el.id);
        const out = [];
        noOverlap(btns, 'the places bar', out);
        for (const b of btns) if (!inside(R(b), screen())) out.push(`${name(b)} off screen`);
        return { ids: btns.map((b) => b.dataset.place), labels: btns.map((b) => b.getAttribute('aria-label') || ''), sizes: rs.map((r) => [+r.width.toFixed(1), +r.height.toFixed(1)]), hits, problems: out, scroll: pageScroll() };
      },
      dialog(id) {
        T.finish();
        const out = [];
        const s = pageScroll();
        if (s) out.push(s);
        const D = document.getElementById(id);
        const P = D.querySelector('.panel') || D;
        if (!inside(R(P), screen())) out.push('dialog panel off screen');
        const controls = [...P.querySelectorAll('button')].filter(shown);
        noOverlap(controls, 'buttons', out);
        for (const el of controls) reach(el, out, P, P);
        return { problems: out, count: controls.length, list: controls.map((b) => ({ id: b.id, text: (b.innerText || '').replace(/\s+/g, ' ').trim() })) };
      },
      // Bess's panel: the tabs, no page scroll, every control reachable (as tests/ashore.cjs's panel probe)
      panel(panelId) {
        T.finish();
        const out = [];
        const s = pageScroll();
        if (s) out.push(s);
        const P = document.getElementById(panelId);
        if (!inside(R(P), screen())) out.push('panel off screen');
        const body = P.querySelector('.dock-body');
        if (body && body.scrollWidth > body.clientWidth + 1) out.push(`the panel scrolls sideways (${body.scrollWidth - body.clientWidth} px)`);
        const controls = [...P.querySelectorAll('button')].filter(shown);
        for (const el of controls) reach(el, out, P, el.closest('.dock-body') ? body : null);
        if (body) body.scrollTop = 0;
        return { problems: out, count: controls.length };
      },
    };
  };

  // ------------------------------------------------------------------------------------------------------- bar
  // The places bar keeps its six buttons at the 7 town sizes (§8.5, SPEC3 §7.1); the Harbour menu gains Island map.
  await section('bar', async () => {
    for (const touch of [true, false]) {
      const { ctx, page } = await open({ touch, width: touch ? 390 : 1280, height: touch ? 844 : 720, label: touch ? 'bar-touch' : 'bar', store: { ...STORE, 'pirates-ahoy-island4': island4({ forge: 1 }) } });
      if (!(await needs(page, 'bar', ['v4', 'town4']))) return;
      await page.evaluate(probes);
      await walkView(page);
      for (const [w, h] of TOWN_SIZES.filter((s) => s[2] === touch)) {
        const tag = `${w}x${h}${touch ? ' touch' : ''}`;
        await page.setViewportSize({ width: w, height: h });
        await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [w, h], { timeout: 60000 });
        await walkView(page);
        await frames(page, 2);
        const bar = await page.evaluate(() => window.__probe.bar());
        const small = bar.sizes.filter(([bw, bh]) => bw < 44 || bh < 44);
        check(bar.ids.join() === 'shipyard,tailor,tavern,quiz,builder,ship' && small.length === 0 && bar.hits.length === 0 && !bar.problems.length && !bar.scroll,
          `bar ${tag}: still six places in order (${bar.ids.join(',')}), none under 44 px (${bar.sizes.map((s) => s.join('x')).join(' ')}), no overlap${bar.hits.length ? ' -> overlaps ' + bar.hits.join(',') : ''}${bar.problems.length ? ' -> ' + bar.problems.join('; ') : ''}${bar.scroll ? ' -> ' + bar.scroll : ''}`);
        await page.evaluate(() => { T.walkView(); window.__game.town.api.harbour(); });
        await frames(page, 2);
        const hd = await page.evaluate(() => ({ ...window.__probe.dialog('harbour-dialog'), map: T.shown('harbour-map-btn') ? document.getElementById('harbour-map-btn').innerText.replace(/\s+/g, ' ').trim() : null }));
        const ids = hd.list.map((b) => b.id);
        check(hd.problems.length === 0 && hd.map !== null && /Island map/.test(hd.map) && hd.count >= 6 && ['harbour-walk-btn', 'harbour-quiz-btn', 'harbour-build-btn'].every((id) => ids.includes(id)),
          `bar ${tag}: the Harbour menu gains "Island map" (#harbour-map-btn: "${hd.map}") beside its ${hd.count - 1} others (${hd.list.map((b) => b.text).join(' | ')}), all on screen and ≥ 44 px${hd.problems.length ? ' -> ' + hd.problems.join('; ') : ''}`);
        await page.evaluate(() => window.__game.town.back());
      }
      if (!touch) {
        const keys = await page.evaluate(() => T.text('town-keys'));
        check(/Island map\s*I|I\s*Island map|\bI\b.*island map/i.test(keys), `bar: the town's keys line names I for the Island map ("${keys}")`);
      }
      await ctx.close();
    }
  });

  // ------------------------------------------------------------------------------------------------------- map
  // The Island map (§8.5): I, the list by keyboard and by taps, Walk there, Hop there and its refusals, Esc.
  await section('map', async () => {
    const { ctx, page } = await open({ label: 'map', store: FULL, crowd: true });
    if (!(await needs(page, 'map', ['v4', 'town4', 'forwards', 'islanders']))) return;
    await page.evaluate(probes);
    await walkView(page);
    await page.keyboard.press('i');
    await frames(page, 3);
    const m0 = await page.evaluate(() => ({ view: window.__game.town.view, active: window.__game.town.map.active, shown: T.shown('island-map'), town: T.shown('town-screen'), focus: T.focus(), live: T.text('map-live'), here: window.__game.town.map.api.here, scroll: window.__probe.pageScroll() }));
    check(m0.view === 'map' && m0.active && m0.shown && !m0.town && m0.focus === `district:${m0.here}` && m0.here === 'harbour' && /^Island map\. You are in Harbour/.test(m0.live) && !m0.scroll,
      `map: I opens the Island map (view ${m0.view}, the town HUD hidden), focus on the district you are in (${m0.focus}); #map-live "${m0.live}"${m0.scroll ? ' -> ' + m0.scroll : ''}`);
    // every district, plot and islander by keyboard only: Home, then ↓ to the end
    const want = await page.evaluate((plots) => ({ districts: ['harbour', 'windmill', 'lantern', 'lighthouse', 'beach', 'hill'].map((d) => `district:${d}`), plots: plots.map((p) => `plot:${p}`), islanders: window.__game.town.islanders.map((q) => `islander:${q.id}`) }), [...SPEC3, ...NEW]);
    await page.keyboard.press('Home');
    const reached = [];
    for (let k = 0; k < 120; k++) {
      const f = await page.evaluate(() => T.focus());
      if (reached[reached.length - 1] === f) break;
      reached.push(f);
      await page.keyboard.press('ArrowDown');
    }
    const all = [...want.districts, ...want.plots, ...want.islanders];
    const notReached = all.filter((id) => !reached.includes(id));
    const sizes = await page.evaluate(() => [...document.querySelectorAll('#map-list .map-pick')].map((b) => ({ id: `${b.dataset.kind}:${b.dataset.id}`, w: b.offsetWidth, h: b.offsetHeight })).filter((b) => b.w < 44 || b.h < 44));
    check(want.islanders.length >= 30 && notReached.length === 0 && sizes.length === 0,
      `map: by keyboard only (Home, ↓) the list reaches all ${want.districts.length} districts, ${want.plots.length} plots and ${want.islanders.length} islanders out (${reached.length} stops), every button ≥ 44 px${notReached.length ? ' -> not reached: ' + notReached.join(', ') : ''}${sizes.length ? ' -> small: ' + J(sizes.slice(0, 6)) : ''}`);
    await page.keyboard.press('Home');
    await snap(page, 'map.png').catch(() => {});
    // a plot picked by Enter: aria-pressed, #map-live; Tab goes on to Walk there and Hop there
    const goTo = async (target) => {
      // (back into the list from Walk there / Hop there: Shift+Tab, the list being one Tab stop)
      for (let k = 0; k < 6 && !(await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('#map-list'))); k++) await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Home');
      for (let k = 0; k < 120 && (await page.evaluate(() => T.focus())) !== target; k++) await page.keyboard.press('ArrowDown');
      return page.evaluate(() => T.focus());
    };
    await goTo('plot:observatory');
    await page.keyboard.press('Enter');
    await frames(page, 2);
    const pk = await page.evaluate(() => ({ pick: window.__game.town.map.api.pick, pressed: document.querySelector('#map-list [data-kind="plot"][data-id="observatory"]').getAttribute('aria-pressed'), live: T.text('map-live') }));
    await page.keyboard.press('Tab');
    const tab1 = await page.evaluate(() => T.focus());
    await page.keyboard.press('Tab');
    const tab2 = await page.evaluate(() => T.focus());
    check(pk.pick && pk.pick.id === 'observatory' && pk.pressed === 'true' && pk.live === 'Observatory, in Lookout Hill. Walk there or Hop there?' && tab1 === 'map-walk-btn' && tab2 === 'map-hop-btn',
      `map: Enter picks a plot (${J(pk.pick)}, aria-pressed ${pk.pressed}); #map-live "${pk.live}"; Tab goes on to ${tab1}, then ${tab2}`);
    // Hop there by keyboard (Lookout Hill): a fade, he lands on free walk on the hill, the camera follows
    await goTo('district:hill');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const before = await page.evaluate(() => ({ cam: window.__game.camera.position.toArray(), pos: T.pos(), focus: T.focus() }));
    await page.keyboard.press('Enter');
    const hop = await page.evaluate(async () => {
      const G = window.__game;
      const fadeEl = [...document.querySelectorAll('div')].find((d) => d.classList.contains('town-fade')) || null;
      const p0 = T.pos();
      let maxOp = 0;
      let movedAt = null;
      let n = 0;
      const fading0 = G.town.api.fading;
      for (; n < 900; n++) {
        const op = fadeEl ? Number(fadeEl.style.opacity || 0) : 0;
        maxOp = Math.max(maxOp, op);
        const p = T.pos();
        if (movedAt === null && Math.hypot(p.x - p0.x, p.z - p0.z) > 3) movedAt = op;
        if (!G.town.api.fading && n > 0) break;
        await new Promise((r) => requestAnimationFrame(r));
      }
      await T.frames(30);
      const c = T.pos();
      const tw = T.town();
      const cam = G.camera.position;
      return { fading0, frames: n, maxOp, movedAt, view: G.town.view, map: G.town.map.active, at: [+c.x.toFixed(2), +c.z.toFixed(2)], district: G.town.districtAt(c.x, c.z), blocked: tw.walk.blocked(c.x, c.z, 0.3), inside: tw.walk.inside(c.x, c.z), camToCap: +Math.hypot(cam.x - c.x, cam.z - c.z).toFixed(2), cam: cam.toArray(), live: T.text('town-live') };
    });
    const camMoved = Math.hypot(hop.cam[0] - before.cam[0], hop.cam[2] - before.cam[2]);
    check(before.focus === 'map-hop-btn' && hop.fading0 && hop.maxOp >= 0.9 && hop.movedAt !== null && hop.movedAt >= 0.9 && hop.view === 'town' && !hop.map && hop.district === 'hill' && !hop.blocked && hop.inside && hop.camToCap < 9 && camMoved > 20 && /Hopped to Lookout Hill/.test(hop.live),
      `map: Hop there (Enter on ${before.focus}): a fade to dark (peak ${hop.maxOp}, he moved under ${hop.movedAt} of it, ${hop.frames} frames), the map closes, he lands on free walk on the hill (${J(hop.at)}, ${hop.district}, blocked ${hop.blocked}), the camera follows (${hop.camToCap} u behind him, moved ${camMoved.toFixed(1)} u); "${hop.live}"`);
    // Walk there by keyboard (the Hilltop Villa's board, from the hill): he auto-walks there and arrives on free walk
    await page.keyboard.press('i');
    await frames(page, 2);
    await goTo('plot:homeG');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    const wf = await page.evaluate(() => T.focus());
    await page.keyboard.press('Enter');
    const walk = await page.evaluate(() => {
      const G = window.__game;
      const r0 = { view: G.town.view, map: G.town.map.active, auto: G.town.api.auto && G.town.api.auto.place, live: T.text('town-live') };
      let s = 0;
      for (; s < 60 && G.town.api.auto; s += 0.5) G.town.simulate(0.5);
      const c = T.pos();
      const p = G.env.walk.places.find((q) => q.id === 'plot:homeG');
      return { ...r0, secs: s, arrived: !G.town.api.auto, d: +Math.hypot(c.x - p.x, c.z - p.z).toFixed(2), r: p.r, place: G.town.place, blocked: T.town().walk.blocked(c.x, c.z, 0.3) };
    });
    check(wf === 'map-walk-btn' && walk.view === 'town' && !walk.map && walk.auto === 'plot:homeG' && /Walking to Hilltop Villa/.test(walk.live) && walk.arrived && walk.d <= walk.r && walk.place === 'plot:homeG' && !walk.blocked,
      `map: Walk there (Enter on ${wf}): the map closes, he walks to the Hilltop Villa's board (${walk.auto}, "${walk.live}") and arrives in ${walk.secs} s, ${walk.d} u from it, on free walk`);
    // Esc closes the map and gives focus back where it was
    await page.evaluate(() => document.getElementById('town-screen').focus());
    await page.keyboard.press('i');
    await frames(page, 2);
    const inMap = await page.evaluate(() => document.getElementById('island-map').contains(document.activeElement));
    await page.keyboard.press('Escape');
    await frames(page, 2);
    const esc = await page.evaluate(() => ({ view: window.__game.town.view, shown: T.shown('island-map'), focus: T.focus(), harbour: T.shown('harbour-dialog') }));
    check(inMap && esc.view === 'town' && !esc.shown && esc.focus === 'town-screen' && !esc.harbour, `map: Esc closes it (view ${esc.view}) and focus goes back where it was (${esc.focus}), no Harbour menu`);
    // an islander from the list: Talk opens their chat at once
    await page.keyboard.press('i');
    await frames(page, 2);
    const firstIsl = want.islanders[0];
    await goTo(firstIsl);
    await page.keyboard.press('Enter');
    await frames(page, 2);
    const chat = await page.evaluate(() => ({ view: window.__game.town.view, chat: window.__game.town.api.chat, bubble: T.shown('talk-bubble'), live: T.text('town-live') }));
    check(chat.view === 'town' && chat.chat && `islander:${chat.chat.id}` === firstIsl && chat.bubble && chat.live.includes(chat.chat.line), `map: Enter on "${firstIsl}" closes the map and opens their chat at once (${J(chat.chat)}; #town-live "${chat.live}")`);
    await page.keyboard.press('Escape');
    // refused with a panel open (Polly's), then during a construction scene (from the town and from the map)
    const ref = await page.evaluate(async () => {
      const G = window.__game;
      T.walkView();
      G.town.open('tailor');
      const p0 = T.pos();
      const a = G.town.hop('hop:beach');
      const r1 = { r: a, view: G.town.view, moved: Math.hypot(T.pos().x - p0.x, T.pos().z - p0.z) > 0.5 };
      G.town.back();
      G.town.open('builder');
      const w = T.b().watch('forge'); // Watch again: a construction scene
      const running = !!(G.env.scene && G.env.scene.running);
      G.town.back(); // (leaving the panel: the scene ends with its wave; still running)
      const stillRunning = !!(G.env.scene && G.env.scene.running);
      const p1 = T.pos();
      const b = G.town.hop('hop:beach');
      const opened = G.town.map.open();
      G.town.map.api.pickPlace('district', 'beach');
      const c = G.town.map.api.hop();
      const r2 = { watch: w, running, stillRunning, r: b, map: { opened, hop: c, active: G.town.map.active, live: T.text('map-live') }, moved: Math.hypot(T.pos().x - p1.x, T.pos().z - p1.z) > 0.5, fading: G.town.api.fading };
      G.town.map.close();
      const k = await T.until(() => !(G.env.scene && G.env.scene.running), 900);
      const d = G.town.hop('hop:beach');
      await T.until(() => !G.town.api.fading, 900);
      await T.frames(2);
      return { r1, r2, after: { waited: k, r: d, district: G.town.districtAt(T.pos().x, T.pos().z) } };
    });
    check(ref.r1.r && ref.r1.r.ok === false && ref.r1.r.why === 'Finish building first!' && ref.r1.view === 'tailor' && !ref.r1.moved,
      `map: Hop there with a panel open (Polly's) is refused: ${J(ref.r1.r)}, he stays (${ref.r1.view})`);
    check(ref.r2.watch && ref.r2.running && ref.r2.stillRunning && ref.r2.r && ref.r2.r.ok === false && ref.r2.r.why === 'Finish building first!' && ref.r2.map.opened && ref.r2.map.hop === false && ref.r2.map.active && ref.r2.map.live === 'Finish building first!' && !ref.r2.moved && !ref.r2.fading,
      `map: during a construction scene a hop is refused from the town (${J(ref.r2.r)}) and from the map (it stays open: "${ref.r2.map.live}"); nobody moves`);
    check(ref.after.waited >= 0 && ref.after.r && ref.after.r.ok === true && ref.after.district === 'beach', `map: once the building stands the same hop goes (${J(ref.after.r)}, lands on ${ref.after.district})`);
    await ctx.close();
    // reduced motion: a cut (no fade), the camera follows at once
    const rm = await open({ label: 'map-reduced', reduced: true });
    if (await needs(rm.page, 'map (reduced motion)', ['v4', 'town4', 'forwards'])) {
      await walkView(rm.page);
      const cut = await rm.page.evaluate(async () => {
        const G = window.__game;
        const r = G.town.hop('hop:lighthouse');
        const now = { fading: G.town.api.fading, district: G.town.districtAt(T.pos().x, T.pos().z) };
        await T.frames(3);
        const c = T.pos();
        const cam = G.camera.position;
        return { r, now, camToCap: +Math.hypot(cam.x - c.x, cam.z - c.z).toFixed(2), blocked: T.town().walk.blocked(c.x, c.z, 0.3) };
      });
      check(cut.r && cut.r.ok && !cut.now.fading && cut.now.district === 'lighthouse' && !cut.blocked && cut.camToCap < 9, `map (reduced motion): Hop there is a cut: no fade (${cut.now.fading}), he is on Lighthouse Point at once (${cut.now.district}), on free walk, the camera with him (${cut.camToCap} u)`);
    }
    await rm.ctx.close();
    // by taps on a phone: the Harbour menu's Island map, every pick ≥ 44 px and reachable by a tap, Hop there, Talk
    const tp = await open({ touch: true, width: 390, height: 844, label: 'map-touch', store: FULL, crowd: true });
    if (!(await needs(tp.page, 'map (touch)', ['v4', 'town4', 'forwards', 'islanders']))) return;
    await tp.page.evaluate(probes);
    await walkView(tp.page);
    await press(tp.page, '#town-menu-btn', 'tap');
    await press(tp.page, '#harbour-map-btn', 'tap');
    const tm0 = await tp.page.evaluate(() => ({ view: window.__game.town.view, live: T.text('map-live') }));
    const reach = await tp.page.evaluate(() => {
      const out = [];
      const ids = [];
      for (const b of document.querySelectorAll('#map-list .map-pick')) {
        window.__probe.reach(b, out, document.getElementById('island-map'), document.getElementById('map-list').closest('.dock-body') || null);
        ids.push(`${b.dataset.kind}:${b.dataset.id}`);
      }
      return { n: ids.length, problems: out, scroll: window.__probe.pageScroll() };
    });
    check(tm0.view === 'map' && reach.n >= 57 && reach.problems.length === 0 && !reach.scroll, `map (touch): the Harbour menu's Island map opens it ("${tm0.live}"); all ${reach.n} picks can be scrolled into view and tapped, ≥ 44 px, uncovered${reach.problems.length ? ' -> ' + reach.problems.slice(0, 8).join('; ') : ''}${reach.scroll ? ' -> ' + reach.scroll : ''}${notShown()}`);
    await press(tp.page, '#map-list [data-kind="district"][data-id="lantern"]', 'tap');
    const tl = await tp.page.evaluate(() => T.text('map-live'));
    await press(tp.page, '#map-hop-btn', 'tap');
    const th = await tp.page.evaluate(async () => {
      await T.until(() => !window.__game.town.api.fading, 900);
      await T.frames(3);
      return { view: window.__game.town.view, district: window.__game.town.districtAt(T.pos().x, T.pos().z) };
    });
    check(tl === 'Lantern Lane. Walk there or Hop there?' && th.view === 'town' && th.district === 'lantern', `map (touch): a tap on Lantern Lane ("${tl}"), then on Hop there: he lands in ${th.district}${notShown()}`);
    await press(tp.page, '#town-menu-btn', 'tap');
    await press(tp.page, '#harbour-map-btn', 'tap');
    const someone = await tp.page.evaluate(() => { const b = document.querySelector('#map-list [data-kind="islander"]'); b.scrollIntoView({ block: 'center' }); return b.dataset.id; });
    await press(tp.page, `#map-list [data-kind="islander"][data-id="${someone}"]`, 'tap');
    const tc = await tp.page.evaluate(() => ({ view: window.__game.town.view, chat: window.__game.town.api.chat, bubble: T.shown('talk-bubble') }));
    check(tc.view === 'town' && tc.chat && tc.chat.id === someone && tc.bubble, `map (touch): a tap on "Talk to …" (${someone}) opens their chat at once (${J(tc.chat)})${notShown()}`);
    await tp.ctx.close();
  });

  // ---------------------------------------------------------------------------------------------------- boards
  // A plot board (§8.5): at it the prompt reads "Build here: …" and E / Enter / a tap on Build opens Bess's panel at
  // that plot's row (its district tab chosen, the row focused, the camera on the plot).
  await section('boards', async () => {
    const store = { ...STORE, 'pirates-ahoy-island': island({ homeA: 1, school: 2 }), 'pirates-ahoy-island4': island4({ forge: 1, fishing: 2 }) };
    const { ctx, page } = await open({ label: 'boards', store, crowd: true });
    if (!(await needs(page, 'boards', ['v4', 'town4', 'forwards', 'panel4']))) return;
    const tabOf = Object.fromEntries((await page.evaluate(() => window.__game.town.api.build ? window.__game.town.api.build.tabs : [])).flatMap((t) => t.plots.map((p) => [p, t.id])));
    const rows = [];
    for (const [plot, key] of [['forge', 'e'], ['homeA', 'Enter'], ['homeE', 'e'], ['fishing', 'Enter'], ['observatory', 'e'], ['school', 'e']]) {
      await walkView(page);
      const at = await page.evaluate((plot) => { const p = T.atPlace(`plot:${plot}`); window.__game.town.simulate(0.1, { x: 0, z: 0 }); return { p, action: window.__game.town.api.action, prompt: window.__game.town.api.prompt }; }, plot);
      await page.keyboard.press(key);
      await frames(page, 3);
      const r = await page.evaluate(() => {
        const G = window.__game;
        const a = document.activeElement;
        const row = a && a.closest && a.closest('[data-plot]');
        return { view: G.town.view, tab: G.town.api.build && G.town.api.build.tab, focused: row ? row.dataset.plot : T.focus(), looking: G.town.api.build && G.town.api.build.looking, plotFocus: G.town.api.plotFocus, shown: T.shown('build-screen') };
      });
      rows.push({ plot, key, action: at.action && at.action.kind, prompt: at.prompt, ...r });
      await page.keyboard.press('Escape');
      await frames(page, 2);
    }
    const bad = rows.filter((r) => !(r.action === 'board' && new RegExp(`^Build here: ${PLOT_NAME[r.plot].replace(/[.*+?^${}()|[\]\\']/g, '.')}`).test(r.prompt || '') && r.view === 'build' && r.shown && r.tab === tabOf[r.plot] && r.focused === r.plot && r.looking === r.plot));
    check(rows.length === 6 && bad.length === 0, `boards: at each board the prompt reads "Build here: …" and E / Enter opens Bess's panel at its row, its district tab, the camera on it: ${rows.map((r) => `${r.plot} ("${r.prompt}", ${r.key} → ${r.view}/${r.tab}/${r.focused})`).join('; ')}${bad.length ? ' -> ' + J(bad) : ''}`);
    await ctx.close();
    // on a phone the round button reads Build and a tap opens the panel at the row
    const tp = await open({ touch: true, width: 390, height: 844, label: 'boards-touch', store, crowd: true });
    if (!(await needs(tp.page, 'boards (touch)', ['v4', 'town4', 'forwards', 'panel4']))) return;
    const taps = [];
    for (const plot of ['music', 'homeD']) {
      await walkView(tp.page);
      const lab = await tp.page.evaluate((plot) => { T.atPlace(`plot:${plot}`); window.__game.town.simulate(0.1, { x: 0, z: 0 }); return { text: T.text(document.querySelector('#town-action .ta-label') || 'town-action'), aria: document.getElementById('town-action').getAttribute('aria-label') }; }, plot);
      await frames(tp.page, 2);
      await press(tp.page, '#town-action', 'tap');
      await frames(tp.page, 3);
      taps.push({ plot, ...lab, ...(await tp.page.evaluate(() => { const a = document.activeElement; const row = a && a.closest && a.closest('[data-plot]'); return { view: window.__game.town.view, focused: row ? row.dataset.plot : T.focus(), looking: window.__game.town.api.build.looking }; })) });
      await tp.page.evaluate(() => window.__game.town.back());
    }
    check(taps.every((t) => t.text === 'Build' && t.view === 'build' && t.focused === t.plot && t.looking === t.plot), `boards (touch): the round button reads Build at a board and a tap opens the panel at that row (${J(taps)})${notShown()}`);
    await tp.ctx.close();
  });

  // ------------------------------------------------------------------------------------------------------ talk
  // Talk (§7.4): the prompt priority door > board > talk > pet; E, Enter, Next, Esc; walking 3 u away ends it;
  // #town-live; on a phone the Talk button, Next by a tap, and a tap on an islander walks up and chats.
  const TALK_STORE = { ...STORE, 'pirates-ahoy-island': island({ all: 1 }), 'pirates-ahoy-island4': island4({ forge: 2, fishing: 2, music: 3, farm: 2, homeF: 2, museum: 1 }) };
  // stand the captain 1.1 u from a drawn islander standing still, facing them, where talkTarget offers them
  const faceSomeone = async () => {
    for (let tryN = 0; tryN < 8; tryN++) {
      const id = faceOnce();
      if (id) return id;
      await T.frames(25);
    }
    return null;
    function faceOnce() {
    const G = window.__game;
    const F = G.env.v4.folk;
    const c = T.pos();
    const ppl = F.people.filter((q) => q.drawn && !q.mer && !q.moving && !q.chatting).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z));
    const tw = T.town();
    for (const q of ppl) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const s = tw.walk.snap(q.x + Math.sin(a) * 1.1, q.z + Math.cos(a) * 1.1, 0.25);
        if (!s || tw.walk.blocked(s.x, s.z, 0.3)) continue;
        tw.enter({ x: s.x, z: s.z, h: Math.atan2(q.x - s.x, q.z - s.z) });
        tw.recenter();
        if (tw.walk.nearestPlace(s.x, s.z)) continue;
        if (F.talkTarget(G.town.pos) === q.id) {
          G.town.simulate(0.05, { x: 0, z: 0 });
          if (F.talkTarget(G.town.pos) === q.id) return q.id;
        }
      }
    }
    return null;
    }
  };
  await section('talk', async () => {
    const { ctx, page } = await open({ label: 'talk', store: TALK_STORE, crowd: true });
    if (!(await needs(page, 'talk', ['v4', 'town4', 'forwards', 'islanders', 'critters']))) return;
    await walkView(page);
    // the priority (folk4's talkTarget and the animals' near() made to answer yes everywhere, so every kind is in
    // reach at once): a door wins, then a plot board (and the lookout), then a talk, then a pet
    const pri = await page.evaluate(() => {
      const G = window.__game;
      const F = G.env.v4.folk;
      const K = G.env.critters;
      const who = F.people.find((q) => !q.mer && q.placed).id;
      const t0 = F.talkTarget;
      const n0 = K.near;
      F.talkTarget = () => who;
      K.near = () => 0;
      const out = {};
      try {
        const look = (k) => {
          G.town.simulate(0.05, { x: 0, z: 0 });
          return { kind: G.town.api.action && G.town.api.action.kind, prompt: G.town.api.prompt };
        };
        T.atPlace('tavern');
        out.door = look();
        T.atPlace('plot:forge');
        out.board = look();
        T.atPlace('lookout');
        out.lookout = look();
        T.at(3.0, -12.4, 0); // (the plaza, no place in reach)
        out.open = { place: T.town().walk.nearestPlace(T.pos().x, T.pos().z), ...look() };
        F.talkTarget = () => null;
        out.petOnly = look();
      } finally {
        F.talkTarget = t0;
        K.near = n0;
      }
      out.who = who;
      out.name = G.town.api.islanders.find((q) => q.id === who)?.name;
      return out;
    });
    check(pri.door.kind === 'place' && /Salty Sparrow/.test(pri.door.prompt || '') && pri.board.kind === 'board' && /^Build here/.test(pri.board.prompt || '') && pri.lookout.kind === 'lookout' && !pri.open.place && pri.open.kind === 'talk' && (pri.open.prompt || '').includes(`Talk to ${pri.name}`) && pri.petOnly.kind === 'pet',
      `talk: with an islander and an animal in reach everywhere, a door wins ("${pri.door.prompt}"), then a plot board ("${pri.board.prompt}") and the lookout (${pri.lookout.kind}), then the talk ("${pri.open.prompt}"), then the pet (${pri.petOnly.kind}, "${pri.petOnly.prompt}")`);
    // a real islander standing still: the prompt, E opens the chat, E and Enter for the next lines, Esc ends it
    const who = await page.evaluate(faceSomeone);
    const p0 = await page.evaluate(() => ({ action: window.__game.town.api.action, prompt: window.__game.town.api.prompt, label: T.text(document.querySelector('#town-action .ta-label') || 'town-action') }));
    await page.keyboard.press('e');
    await frames(page, 2);
    const c1 = await page.evaluate(() => ({ chat: window.__game.town.api.chat, bubble: T.shown('talk-bubble'), env: window.__game.env.v4.chat, facing: (window.__game.env.v4.folk.people.find((q) => q.id === (window.__game.town.api.chat || {}).id) || {}).chatting, live: T.text('town-live'), name: T.text('talk-name'), text: T.text('talk-text') }));
    check(!!who && p0.action && p0.action.kind === 'talk' && p0.action.id === who && new RegExp(`Talk to ${p0.action.name}`).test(p0.prompt || '') && c1.chat && c1.chat.id === who && c1.bubble && c1.env === who && c1.facing === true && c1.live === `${c1.chat.name}: ${c1.chat.line}` && c1.text === c1.chat.line,
      `talk: near ${who} the prompt reads "${p0.prompt}"; E opens the bubble (${c1.name}: "${c1.text}"), they turn to him (env.setChat ${c1.env}), #town-live "${c1.live}"`);
    await page.keyboard.press('e');
    await frames(page, 2);
    const c2 = await page.evaluate(() => window.__game.town.api.chat);
    await page.keyboard.press('Enter');
    await frames(page, 2);
    const c3 = await page.evaluate(() => window.__game.town.api.chat);
    check(c2 && c2.i === 1 && c2.lines >= 2 && (c2.lines === 2 ? c3 === null : c3 && c3.i === 2), `talk: E shows the next line (${J(c2)}), Enter the next (${J(c3)}): ${c2 ? c2.lines : '?'} lines`);
    if (await page.evaluate(() => !!window.__game.town.api.chat)) await page.keyboard.press('Escape');
    else {
      await page.evaluate(faceSomeone);
      await page.keyboard.press('Enter');
      await frames(page, 2);
      await page.keyboard.press('Escape');
    }
    await frames(page, 2);
    const c4 = await page.evaluate(() => ({ chat: window.__game.town.api.chat, bubble: T.shown('talk-bubble'), env: window.__game.env.v4.chat, view: window.__game.town.view, harbour: T.shown('harbour-dialog') }));
    check(c4.chat === null && !c4.bubble && c4.env === null && c4.view === 'town' && !c4.harbour, `talk: Esc ends the chat (bubble hidden, env.setChat(null)), no Harbour menu (${J(c4)})`);
    // Enter starts a chat too; walking 3 u away ends it
    const who2 = await page.evaluate(faceSomeone);
    await page.keyboard.press('Enter');
    await frames(page, 2);
    const away = await page.evaluate(async () => {
      const G = window.__game;
      const chat0 = G.town.api.chat;
      const w = G.env.v4.folk.where(chat0 ? chat0.id : '');
      const c = T.pos();
      // walk straight away from them (the stick pointing away, camera-relative), a frame at a time
      const tw = T.town();
      let d = 0;
      let k = 0;
      for (; k < 200 && G.town.api.chat; k++) {
        const cy = tw.camera.yaw;
        const h = Math.atan2(c.x - w.x, c.z - w.z);
        const fx = Math.sin(cy);
        const fz = Math.cos(cy);
        G.town.simulate(1 / 15, { x: -fz * Math.sin(h) + fx * Math.cos(h), z: fx * Math.sin(h) + fz * Math.cos(h) });
        await T.frames(1);
        const p = T.pos();
        d = Math.hypot(p.x - w.x, p.z - w.z);
        if (d > 6) break;
      }
      return { started: chat0 && chat0.id, ended: G.town.api.chat === null, d: +d.toFixed(2), bubble: T.shown('talk-bubble') };
    });
    check(!!who2 && away.started === who2 && away.ended && away.d > 2.9 && away.d < 4.5 && !away.bubble, `talk: Enter opens a chat (${away.started}); walking away ends it about 3 u off (${away.d} u)`);
    await ctx.close();
    // on a phone: Talk on the round button, Next by a tap, and a tap on an islander walks up and chats
    const tp = await open({ touch: true, width: 390, height: 844, label: 'talk-touch', store: TALK_STORE, crowd: true });
    if (!(await needs(tp.page, 'talk (touch)', ['v4', 'town4', 'forwards', 'islanders']))) return;
    await walkView(tp.page);
    const tw = await tp.page.evaluate(faceSomeone);
    const lab = await tp.page.evaluate(() => T.text(document.querySelector('#town-action .ta-label') || 'town-action'));
    await press(tp.page, '#town-action', 'tap');
    const t1 = await tp.page.evaluate(() => window.__game.town.api.chat);
    const nb = await tp.page.evaluate(() => { const b = document.getElementById('talk-next-btn'); return b ? { w: b.offsetWidth, h: b.offsetHeight, text: T.text(b) } : null; });
    await press(tp.page, '#talk-next-btn', 'tap');
    const t2 = await tp.page.evaluate(() => window.__game.town.api.chat);
    check(!!tw && lab === 'Talk' && t1 && t1.id === tw && nb && nb.w >= 44 && nb.h >= 44 && ((t2 && t2.i === 1) || (t1.lines === 1 && t2 === null)), `talk (touch): the round button reads ${lab}; a tap opens the chat with ${t1 && t1.id}; Next (${J(nb)}) by a tap shows the next line (${J(t2)})${notShown()}`);
    await tp.page.evaluate(() => window.__game.town.api.endTalk());
    // a tap on an islander standing still a few steps away: he walks up to them and the chat starts
    const tgt = await tp.page.evaluate(async () => {
      const G = window.__game;
      const F = G.env.v4.folk;
      const why = {};
      window.__why = why;
      const tw = T.town();
      let tried = 0;
      for (let round = 0; round < 4 && tried < 14; round++) {
        const c0 = T.pos();
        const ppl = F.people.filter((q) => q.drawn && !q.mer && !q.moving && !q.chatting).sort((a, b) => Math.hypot(a.x - c0.x, a.z - c0.z) - Math.hypot(b.x - c0.x, b.z - c0.z));
        for (const q of ppl.slice(0, 6)) {
          // a free spot 3.5 u from them on the walk (no frames spent looking), facing them, the camera behind
          let spot = null;
          for (let k = 0; k < 12 && !spot; k++) {
            const a = (k / 12) * Math.PI * 2;
            const s = tw.walk.snap(q.x + Math.sin(a) * 3.5, q.z + Math.cos(a) * 3.5, 0.3);
            if (s && !tw.walk.blocked(s.x, s.z, 0.3) && Math.hypot(s.x - q.x, s.z - q.z) > 2.8 && (() => { try { return tw.walk.clear({ x: s.x, z: s.z }, { x: q.x, z: q.z }, 0.3) !== false; } catch { return true; } })()) spot = s;
          }
          if (!spot) {
            why.noSpot = (why.noSpot || 0) + 1;
            continue;
          }
          tried++;
          tw.enter({ x: spot.x, z: spot.z, h: Math.atan2(q.x - spot.x, q.z - spot.z) });
          tw.recenter();
          G.town.simulate(0.4, { x: 0, z: 0 });
          await T.frames(2);
          const w = F.where(q.id);
          if (!w || w.moving || !w.drawn) {
            why.gone = (why.gone || 0) + 1;
            continue;
          }
          const sp = T.toScreen(w.x, w.y + 0.9, w.z);
          if (!sp || sp.x < 30 || sp.x > innerWidth - 30 || sp.y < 80 || sp.y > innerHeight - 220) {
            why.off = (why.off || 0) + 1;
            continue;
          }
          const hit = document.elementFromPoint(sp.x, sp.y);
          if (!hit || hit.tagName !== 'CANVAS') {
            why.covered = (why.covered || 0) + 1;
            why.by = hit ? hit.id || String(hit.className) || hit.tagName : null;
            continue;
          }
          return { id: q.id, x: sp.x, y: sp.y, d: +Math.hypot(T.pos().x - w.x, T.pos().z - w.z).toFixed(2) };
        }
        await T.frames(20);
      }
      return null;
    });
    let tapped = null;
    if (tgt) {
      await tp.page.touchscreen.tap(tgt.x, tgt.y);
      tapped = await tp.page.evaluate(async (id) => {
        const G = window.__game;
        const walked = !!G.town.api.auto;
        const k = await T.until(() => G.town.api.chat && G.town.api.chat.id === id, 1200);
        const w = G.env.v4.folk.where(id);
        const c = T.pos();
        return { walked, frames: k, chat: G.town.api.chat, d: w ? +Math.hypot(c.x - w.x, c.z - w.z).toFixed(2) : null };
      }, tgt.id);
    }
    const why = tgt ? null : await tp.page.evaluate(() => window.__why);
    check(!!tgt && tapped && tapped.walked && tapped.frames >= 0 && tapped.chat && tapped.chat.id === tgt.id && tapped.d <= 2.2, `talk (touch): a tap on ${tgt ? tgt.id : 'an islander (none on screen)'} ${tgt ? tgt.d : '?'} u away walks him up to them (${tapped && tapped.d} u) and the chat starts (${J(tapped && tapped.chat)})${why ? ' -> no islander to tap: ' + J(why) : ''}`);
    await tp.ctx.close();
  });

  // ------------------------------------------------------------------------------------------------------- pet
  // Pet an animal (§7.4): within 1.6 u, E or a tap: its word and a heart over it, its sound (none for a turtle), one per
  // 2 s per animal; nothing else.
  const PET_STORE = { ...STORE, 'pirates-ahoy-island4': island4({ farm: 3, fishing: 2, homeF: 1, forge: 1 }) };
  const nearAnimal = () => {
    const G = window.__game;
    const K = G.env.critters;
    const F = G.env.v4 && G.env.v4.folk;
    const tw = T.town();
    for (const a of K.list) {
      if (!a || !a.drawn || a.moving) continue;
      for (let k = 0; k < 12; k++) {
        const g = (k / 12) * Math.PI * 2;
        const s = tw.walk.snap(a.x + Math.sin(g) * 0.9, a.z + Math.cos(g) * 0.9, 0.3);
        if (!s || tw.walk.blocked(s.x, s.z, 0.3)) continue;
        tw.enter({ x: s.x, z: s.z, h: Math.atan2(a.x - s.x, a.z - s.z) });
        tw.recenter();
        if (K.near(G.town.pos) === a.i && !tw.walk.nearestPlace(s.x, s.z) && !(F && F.talkTarget(G.town.pos))) {
          G.town.simulate(0.05, { x: 0, z: 0 });
          if (K.near(G.town.pos) === a.i) return { i: a.i, name: a.name || a.species, species: a.species };
        }
      }
    }
    return null;
  };
  await section('pet', async () => {
    const { ctx, page } = await open({ label: 'pet', store: PET_STORE, crowd: true });
    if (!(await needs(page, 'pet', ['v4', 'town4', 'forwards', 'critters']))) return;
    await walkView(page);
    let res = null;
    for (let tryN = 0; tryN < 4 && !(res && res.ok); tryN++) {
      const a = await page.evaluate(nearAnimal);
      if (!a) {
        await frames(page, 30);
        continue;
      }
      const pr = await page.evaluate(() => ({ action: window.__game.town.api.action, prompt: window.__game.town.api.prompt }));
      await page.evaluate(() => T.clearSfx());
      await page.keyboard.press('e');
      await frames(page, 2);
      const r1 = await page.evaluate(() => { const b = document.querySelector('.pet-bubble'); return { shown: !!b && T.shown(b), text: b ? T.text(b) : '', live: T.text('town-live'), sfx: T.sfx() }; });
      await page.keyboard.press('e');
      await frames(page, 1);
      const r2 = await page.evaluate(() => ({ sfx: T.sfx(), view: window.__game.town.view }));
      const silent = a.species === 'turtle';
      res = { a, pr, r1, r2, ok: pr.action && pr.action.kind === 'pet' && pr.action.i === a.i && r1.shown && /♥/.test(r1.text) && r1.live.startsWith(`${pr.action.name}:`) && (silent ? r1.sfx.length === 0 : r1.sfx.length === 1) && r2.sfx.length === r1.sfx.length && r2.view === 'town' };
      if (!res.ok) await frames(page, 40);
    }
    check(!!res && res.ok, `pet: by ${res && res.a ? `${res.a.name} (${res.a.species})` : 'an animal (none found standing still)'} the prompt reads "${res && res.pr.prompt}"; E: "${res && res.r1.text}" over it, #town-live "${res && res.r1.live}", its sound ${J(res && res.r1.sfx)}; E again at once plays nothing more (${J(res && res.r2.sfx)})`);
    await ctx.close();
    const tp = await open({ touch: true, width: 390, height: 844, label: 'pet-touch', store: PET_STORE, crowd: true });
    if (!(await needs(tp.page, 'pet (touch)', ['v4', 'town4', 'forwards', 'critters']))) return;
    await walkView(tp.page);
    let tr = null;
    for (let tryN = 0; tryN < 4 && !(tr && tr.ok); tryN++) {
      const a = await tp.page.evaluate(nearAnimal);
      if (!a) {
        await frames(tp.page, 30);
        continue;
      }
      const lab = await tp.page.evaluate(() => T.text(document.querySelector('#town-action .ta-label') || 'town-action'));
      await press(tp.page, '#town-action', 'tap');
      const r = await tp.page.evaluate(() => { const b = document.querySelector('.pet-bubble'); return { shown: !!b && T.shown(b), text: b ? T.text(b) : '' }; });
      tr = { a, lab, ...r, ok: lab === 'Pet' && r.shown && /♥/.test(r.text) };
      if (!tr.ok) await frames(tp.page, 40);
    }
    check(!!tr && tr.ok, `pet (touch): by ${tr && tr.a ? tr.a.name : 'an animal'} the round button reads "${tr && tr.lab}" and a tap pets it ("${tr && tr.text}")${notShown()}`);
    await tp.ctx.close();
  });

  // ---------------------------------------------------------------------------------------------------- toasts
  // District toasts (§6.4, §8.5): walking in under a district's arch shows its name for 2 s (#town-toast, aria-hidden)
  // and says it in #town-live; walking back out under it says nothing.
  await section('toasts', async () => {
    const { ctx, page } = await open({ label: 'toasts' });
    if (!(await needs(page, 'toasts', ['v4', 'town4']))) return;
    await walkView(page);
    const out = [];
    for (const A of PLAN.ARCHES) {
      const r = await page.evaluate(async (A) => {
        const G = window.__game;
        const nx = Math.sin(A.ry);
        const nz = Math.cos(A.ry);
        T.at(A.x - nx * 2.2, A.z - nz * 2.2, A.ry, 1.5);
        document.getElementById('town-live').textContent = '';
        await T.frames(2);
        const ok = G.town.walkTo(A.x + nx * 2.6, A.z + nz * 2.6);
        let seen = null;
        let lastLeft = null;
        let gone = false;
        for (let k = 0; k < 1500; k++) {
          const t = G.town.api.toast;
          if (t && !seen) seen = { ...t, live: T.text('town-live'), aria: document.getElementById('town-toast').getAttribute('aria-hidden'), shown: T.shown('town-toast') };
          if (t) lastLeft = t.left;
          if (seen && !t) {
            gone = true;
            break;
          }
          if (!seen && !G.town.api.auto && k > 30) break;
          await new Promise((res) => requestAnimationFrame(res));
        }
        // walking back out under it: no toast
        await T.until(() => !G.town.api.auto, 600);
        const back = G.town.walkTo(A.x - nx * 2.2, A.z - nz * 2.2);
        let outward = null;
        for (let k = 0; k < 600 && G.town.api.auto; k++) {
          if (G.town.api.toast) outward = G.town.api.toast;
          await new Promise((res) => requestAnimationFrame(res));
        }
        return { id: A.district, ok, back, seen, lastLeft, gone, outward };
      }, A);
      out.push({ A, ...r });
    }
    for (const r of out) {
      const s = r.seen;
      check(r.ok && s && s.district === r.A.district && s.text === r.A.words && s.aria === 'true' && s.shown && s.live === r.A.name && s.left > 1.7 && s.left <= 2.0 && r.gone && r.lastLeft !== null && r.lastLeft < 0.2 && r.back && !r.outward,
        `toasts: in under the ${r.A.name} arch: "${s && s.text}" for 2 s (first ${s && s.left.toFixed(2)} s left, gone at ${r.lastLeft !== null ? r.lastLeft.toFixed(2) : '?'} s), aria-hidden ${s && s.aria}, #town-live "${s && s.live}"; walking back out says nothing (${r.outward ? J(r.outward) : 'no toast'})`);
    }
    await ctx.close();
  });

  // --------------------------------------------------------------------------------------------------- lookout
  // The lookout (§6.7): Climb at the ladder's foot, a 1.2 s climb, the panorama ("Land ho!"), ← → turn it; down by a
  // move key, Esc, a tap on Climb down, or 30 s idle.
  await section('lookout', async () => {
    const { ctx, page } = await open({ label: 'lookout' });
    if (!(await needs(page, 'lookout', ['v4', 'town4', 'forwards']))) return;
    await walkView(page);
    const up = async () => {
      await page.evaluate(() => { T.walkView(); T.atPlace('lookout'); window.__game.town.simulate(0.1, { x: 0, z: 0 }); });
      const pr = await page.evaluate(() => ({ action: window.__game.town.api.action, prompt: window.__game.town.api.prompt, label: T.text(document.querySelector('#town-action .ta-label') || 'town-action'), foot: T.pos() }));
      await page.keyboard.press('e');
      const r = await page.evaluate(async () => {
        const G = window.__game;
        const v0 = G.town.view;
        const ph0 = G.town.api.lookoutState && G.town.api.lookoutState.phase;
        const k = await T.until(() => G.town.api.lookoutState && G.town.api.lookoutState.phase === 'on', 900);
        await T.frames(3);
        const L = G.env.lookout;
        const cam = G.camera.position;
        const db = document.getElementById('lookout-down-btn');
        return { v0, ph0, frames: k, view: G.town.view, toast: G.town.api.toast, live: T.text('town-live'), camY: +cam.y.toFixed(2), nestY: L.nest[1], camFromNest: +Math.hypot(cam.x - L.nest[0], cam.z - L.nest[2]).toFixed(2), down: db ? { shown: T.shown(db), w: db.offsetWidth, h: db.offsetHeight } : null, stick: T.shown('town-joystick'), act: T.shown('town-action') };
      });
      return { pr, ...r };
    };
    const u1 = await up();
    check(u1.pr.action && u1.pr.action.kind === 'lookout' && /Crow's nest/.test(u1.pr.prompt || '') && u1.pr.label === 'Climb' && u1.v0 === 'lookout' && u1.ph0 === 'up' && u1.frames > 0 && u1.view === 'lookout' && u1.toast && u1.toast.text === 'LAND HO!' && /Land ho!/.test(u1.live) && u1.camY > u1.nestY && u1.down && u1.down.shown && u1.down.w >= 44 && u1.down.h >= 44 && !u1.stick && !u1.act,
      `lookout: at the ladder "${u1.pr.prompt}" (${u1.pr.label}); E climbs (${u1.ph0}, ${u1.frames} frames) to the panorama: the camera at y ${u1.camY} over the nest (${u1.nestY}), "${u1.toast && u1.toast.text}", #town-live "${u1.live}"; Climb down ${J(u1.down)}, the stick and Go in hidden`);
    await snap(page, 'lookout.png').catch(() => {});
    // ← turns the view
    const y0 = await page.evaluate(() => window.__game.town.api.lookoutState.yaw);
    await page.keyboard.down('ArrowLeft');
    await frames(page, 15);
    await page.keyboard.up('ArrowLeft');
    const y1 = await page.evaluate(() => ({ yaw: window.__game.town.api.lookoutState.yaw, view: window.__game.town.view }));
    check(Math.abs(y1.yaw - y0) > 0.1 && y1.view === 'lookout', `lookout: a held ← turns the view (yaw ${y0.toFixed(2)} → ${y1.yaw.toFixed(2)}) and stays up`);
    // down by a move key (W)
    await page.keyboard.press('w');
    const d1 = await page.evaluate(async () => {
      const G = window.__game;
      const k = await T.until(() => G.town.view === 'town', 900);
      await T.frames(2);
      return { frames: k, view: G.town.view, place: G.town.place, down: T.shown('lookout-down-btn'), stick: T.shown('town-joystick') || !matchMedia('(pointer: coarse)').matches };
    });
    check(d1.frames > 0 && d1.view === 'town' && d1.place === 'lookout' && !d1.down, `lookout: W climbs down (${d1.frames} frames) to the ladder's foot (${d1.place}), Climb down hidden`);
    // down by Esc
    await up();
    await page.keyboard.press('Escape');
    const d2 = await page.evaluate(async () => { const k = await T.until(() => window.__game.town.view === 'town', 900); return { frames: k, place: window.__game.town.place, harbour: T.shown('harbour-dialog') }; });
    check(d2.frames >= 0 && d2.place === 'lookout' && !d2.harbour, `lookout: Esc climbs down to the ladder's foot (${d2.place}), no Harbour menu`);
    // down by a click on Climb down
    await up();
    await press(page, '#lookout-down-btn');
    const d3 = await page.evaluate(async () => { const k = await T.until(() => window.__game.town.view === 'town', 900); return { frames: k, place: window.__game.town.place }; });
    check(d3.frames >= 0 && d3.place === 'lookout', `lookout: a click on Climb down climbs down (${d3.place})${notShown()}`);
    // 30 s idle (the lookout's own clock): still up at 29 s, down after 30 s (a small window: the frames come faster)
    await up();
    await page.setViewportSize({ width: 320, height: 180 });
    const idle = await page.evaluate(async () => {
      const G = window.__game;
      // (the lookout's idle clock runs on the frames' time, at most 0.1 s a frame: nothing drawn meanwhile, so the
      // 300 frames come quickly)
      G.scene.visible = false;
      let last = 0;
      let at29 = null;
      for (let k = 0; k < 6000 && G.town.view === 'lookout'; k++) {
        const s = G.town.api.lookoutState;
        if (s && s.phase === 'on') last = s.idle;
        if (at29 === null && last >= 29) at29 = G.town.view;
        await new Promise((r) => requestAnimationFrame(r));
      }
      await T.until(() => G.town.view === 'town', 900);
      G.scene.visible = true;
      return { last: +last.toFixed(2), at29, view: G.town.view, place: G.town.place };
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    check(idle.at29 === 'lookout' && idle.last >= 29.9 && idle.last < 31 && idle.view === 'town' && idle.place === 'lookout', `lookout: left alone up there it climbs down after 30 s idle (still up at 29 s; down at ${idle.last} s of its clock) to the ladder's foot (${idle.place})`);
    await ctx.close();
    // on a phone: Climb on the round button, Climb down by a tap
    const tp = await open({ touch: true, width: 390, height: 844, label: 'lookout-touch' });
    if (!(await needs(tp.page, 'lookout (touch)', ['v4', 'town4', 'forwards']))) return;
    await walkView(tp.page);
    await tp.page.evaluate(() => { T.atPlace('lookout'); window.__game.town.simulate(0.1, { x: 0, z: 0 }); });
    const lab = await tp.page.evaluate(() => T.text(document.querySelector('#town-action .ta-label') || 'town-action'));
    await press(tp.page, '#town-action', 'tap');
    const t1 = await tp.page.evaluate(async () => { const k = await T.until(() => window.__game.town.api.lookoutState && window.__game.town.api.lookoutState.phase === 'on', 900); return { frames: k, view: window.__game.town.view }; });
    await press(tp.page, '#lookout-down-btn', 'tap');
    const t2 = await tp.page.evaluate(async () => { const k = await T.until(() => window.__game.town.view === 'town', 900); return { frames: k, place: window.__game.town.place, stick: T.shown('town-joystick'), act: T.shown('town-action') }; });
    check(lab === 'Climb' && t1.frames >= 0 && t1.view === 'lookout' && t2.frames >= 0 && t2.place === 'lookout' && t2.stick && t2.act, `lookout (touch): "${lab}" on the round button, a tap climbs; a tap on Climb down brings him down (${t2.place}), the stick and the round button back${notShown()}`);
    await tp.ctx.close();
  });

  // --------------------------------------------------------------------------------------------------- walking
  // The walking bug with the crowd at its maximum (§6.5, §13.2): every plot at tier 3, every islander and animal out.
  // Stepped inside evaluates (the islanders' clock by hand, Math.random seeded): the real loop never runs in between.
  await section('walking', async () => {
    const t0 = Date.now();
    const { ctx, page } = await open({ label: 'walking', seed: 20261106, store: FULL, crowd: true });
    if (!(await needs(page, 'walking', ['v4', 'town4', 'islanders', 'critters']))) return;
    const setup = await page.evaluate(() => {
      const G = window.__game;
      const env = G.env;
      G.dock.ashore();
      G.town.simulate(0.2, { x: 0, z: 0 });
      const w = env.walk;
      const kinds = Object.fromEntries((w.bridges || []).map((b) => [b.link, b.kind]));
      const kindOf = (l) => kinds[l.id] || (l.hw <= 0.3 ? 'rope' : 'board');
      const P = { t: 100 };
      window.__W = P;
      // one frame of the town by hand (as townMode's frame): the walk, the crowd director from the lens, the rounds
      P.step = (dt, inp) => {
        G.town.simulate(dt, inp);
        env.cull(G.camera.position.x, G.camera.position.z, 40, 1.0);
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
      // a run across a link: mode 'key' | 'stick' (a thumb a little off straight) | 'tap'. He starts on the near deck,
      // 0.6 u short of the link's end there, facing along its first stretch. A held key or stick walks towards the
      // link's next point, read against the camera as it stands when it goes down (town.js keeps that reading while it
      // is held); at each bend of the link it is let go for one frame and pressed again towards the next point, as a
      // child steers along a bent boardwalk. Across: within 0.7 u of the link's far end (0.9 u into the far deck), or past it.
      const TURN_AT = 0.35; // (u from a bend where the child presses the new way: he follows the link, not cutting a corner)
      P.cross = (link, dir, mode) => {
        const pts = dir > 0 ? link.pts : [...link.pts].reverse();
        const a = pts[0];
        const b = pts[pts.length - 1];
        const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
        const ux = (b[0] - a[0]) / L;
        const uz = (b[2] - a[2]) / L;
        let seg = 1;
        while (seg < pts.length - 1 && Math.hypot(pts[seg][0] - a[0], pts[seg][2] - a[2]) < 0.8) seg++;
        const d1 = Math.hypot(pts[seg][0] - a[0], pts[seg][2] - a[2]) || 1;
        const vx = (pts[seg][0] - a[0]) / d1;
        const vz = (pts[seg][2] - a[2]) / d1;
        P.place(a[0] - vx * 0.6, a[2] - vz * 0.6, Math.atan2(vx, vz));
        if (mode === 'tap' && !G.town.walkTo(b[0] + ux * 1.2, b[2] + uz * 1.2)) G.town.walkTo(b[0], b[2]);
        const aim = () => {
          const c = P.pos();
          const want = Math.atan2(pts[seg][0] - c.x, pts[seg][2] - c.z) + (mode === 'stick' ? 0.1 : 0);
          const cy = G.town.api.town.camera.yaw;
          const fx = Math.sin(cy);
          const fz = Math.cos(cy);
          const mag = mode === 'stick' ? 0.885 : 1;
          const wx = Math.sin(want);
          const wz = Math.cos(want);
          return { x: (-fz * wx + fx * wz) * mag, z: (fx * wx + fz * wz) * mag };
        };
        let inp = mode === 'tap' ? { x: 0, z: 0 } : aim();
        let along = -1;
        let k = 0;
        let still = 0;
        let stuck = 0;
        let where = null;
        let last = P.pos();
        let across = false;
        for (; k < 16 * 30; k++) {
          if (mode !== 'tap') {
            const c = P.pos();
            if (seg < pts.length - 1 && Math.hypot(pts[seg][0] - c.x, pts[seg][2] - c.z) < TURN_AT) {
              while (seg < pts.length - 1 && Math.hypot(pts[seg][0] - c.x, pts[seg][2] - c.z) < TURN_AT) seg++;
              P.step(1 / 30, { x: 0, z: 0 }); // (let go for a frame, then pressed again the new way)
              inp = aim();
            }
          }
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
          across = along > 1.02 || Math.hypot(c.x - b[0], c.z - b[2]) <= 0.7;
          if (across || G.town.view !== 'town') break;
        }
        P.step(0.2, { x: 0, z: 0 });
        if (G.town.view !== 'town') G.town.back();
        return { ok: across, secs: +(k / 30).toFixed(2), stuck: +stuck.toFixed(2), where };
      };
      P.links = w.links.map((l) => ({ id: l.id, kind: kindOf(l), hw: l.hw, pts: l.pts }));
      const F = env.v4.folk;
      return {
        view: G.town.view,
        plots: { spec3: Object.values(G.island.config.t).join(''), v4: Object.values(G.island4.config.t).join('') },
        islanders: F.people.length,
        built: F.built,
        walkers: env.folk().filter((f) => f.islander).length,
        animals: env.critters.list.length,
        villagers: env.villagers.length,
        npcs: env.folk().filter((f) => f.npc).map((f) => f.npc).sort(),
        ropes: P.links.filter((l) => l.kind === 'rope').map((l) => l.id),
        boards: P.links.filter((l) => l.kind !== 'rope').map((l) => `${l.id}${l.kind === 'steps' ? ' (steps)' : ''}`),
      };
    });
    const newRopes = setup.ropes.filter((id) => !OLD_LINKS.includes(id));
    check(setup.view === 'town' && setup.plots.spec3 === '3333333333' && setup.plots.v4 === '33333333333' && setup.islanders >= 33 && setup.animals >= 30 && setup.villagers === 8 && setup.npcs.join() === 'barnacle,bess' && newRopes.length === 11 && LONG_ROPES.every((id) => newRopes.includes(id)) && setup.boards.length === 16,
      `walking: the crowd at its maximum: all 21 plots at tier 3 (${setup.plots.spec3}|${setup.plots.v4}), ${setup.islanders} islanders out (${setup.walkers} walking near), ${setup.animals} animals, ${setup.villagers} villagers, Bess and Barnacle; the new links: ${newRopes.length} rope bridges (${newRopes.join(', ')}) and ${setup.boards.length} boardwalks and steps (${setup.boards.join(', ')})`);
    // (b) every new rope bridge both ways by key, stick and tap at 10 moments of the islanders' day (120 s); the
    // boardwalks and the steps by key and stick at 3 moments and by a tap at 1
    const ropeRuns = [];
    const boardRuns = [];
    const tb = Date.now();
    for (let m = 0; m < 10; m++) {
      const r = await page.evaluate(([m, ropes, boards]) => {
        const P = window.__W;
        P.t = 100 + m * 12;
        const sp = window.__game.env.walk.spawn;
        P.place(sp.x, sp.z, sp.h);
        for (let i = 0; i < 30; i++) P.step(1 / 30, { x: 0, z: 0 });
        const out = { rope: [], board: [] };
        for (const l of P.links.filter((q) => ropes.includes(q.id))) for (const dir of [1, -1]) for (const mode of ['key', 'stick', 'tap']) out.rope.push({ m, link: l.id, dir, mode, ...P.cross(l, dir, mode) });
        const modes = m === 0 ? ['key', 'stick', 'tap'] : m === 3 || m === 6 ? ['key', 'stick'] : [];
        for (const l of P.links.filter((q) => boards.includes(q.id))) for (const dir of [1, -1]) for (const mode of modes) out.board.push({ m, link: l.id, dir, mode, ...P.cross(l, dir, mode) });
        return out;
      }, [m, newRopes, setup.boards.map((s) => s.split(' ')[0])]);
      ropeRuns.push(...r.rope);
      boardRuns.push(...r.board);
    }
    const runSecs = (Date.now() - tb) / 1000;
    const summary = (runs, id) => {
      const rs = runs.filter((r) => r.link === id);
      return `${id} ${rs.filter((r) => r.ok && r.stuck <= 1).length}/${rs.length}`;
    };
    const badR = ropeRuns.filter((r) => !r.ok || r.stuck > 1);
    const badB = boardRuns.filter((r) => !r.ok || r.stuck > 1);
    for (const id of LONG_ROPES) {
      const rs = ropeRuns.filter((r) => r.link === id);
      const bad = rs.filter((r) => !r.ok || r.stuck > 1);
      check(rs.length === 60 && bad.length === 0, `walking (b): the long rope bridge ${id}: a held key, a held stick and a tap cross it both ways at 10 moments: ${rs.length - bad.length}/${rs.length} across, longest stall ${Math.max(0, ...rs.map((r) => r.stuck))} s, slowest ${Math.max(0, ...rs.map((r) => r.secs))} s${bad.length ? ' -> ' + J(bad.slice(0, 4)) : ''}`);
    }
    check(ropeRuns.length === newRopes.length * 60 && badR.length === 0, `walking (b): all ${newRopes.length} new rope bridges (the 7 scenery ones and the 4 new), key, stick and tap, both ways, 10 moments: ${ropeRuns.length - badR.length}/${ropeRuns.length} across, never stalled over 1 s (longest ${Math.max(0, ...ropeRuns.map((r) => r.stuck))} s): ${newRopes.map((id) => summary(ropeRuns, id)).join(', ')}${badR.length ? ' -> ' + J(badR.slice(0, 6)) : ''}`);
    check(boardRuns.length === setup.boards.length * 14 && badB.length === 0, `walking (b): the ${setup.boards.length} boardwalks and the steps, key and stick at 3 moments and a tap at 1, both ways: ${boardRuns.length - badB.length}/${boardRuns.length} across, never stalled over 1 s (longest ${Math.max(0, ...boardRuns.map((r) => r.stuck))} s, slowest ${Math.max(0, ...boardRuns.map((r) => r.secs))} s)${badB.length ? ' -> ' + J(badB.slice(0, 6)) : ''}`);
    // (c) SPEC3's porter check (4465587): W held from the stalls reaches the pier past the porter, 10 times
    const porter = await page.evaluate(() => {
      const P = window.__W;
      const A = { x: 0.4, z: -10.9 };
      const B = { x: 1.8, z: -5.2 };
      const h = Math.atan2(B.x - A.x, B.z - A.z);
      const out = [];
      for (let k = 0; k < 10; k++) {
        for (let i = 0; i < 30; i++) P.step(1 / 30, { x: 0, z: 0 });
        P.place(A.x, A.z, h);
        let reached = null;
        for (let i = 0; i < 9 * 30 && reached === null; i++) {
          P.step(1 / 30, { x: 0, z: 1 });
          const c = P.pos();
          if (Math.hypot(c.x - B.x, c.z - B.z) < 1.2) reached = +(i / 30).toFixed(1);
        }
        out.push(reached);
        for (let i = 0; i < 37; i++) P.step(1 / 30, { x: 0, z: 0 });
      }
      return out;
    });
    check(porter.every((r) => r !== null && r < 6), `walking (c): the porter check: W held from the stalls reaches the pier past the porter every time (${J(porter)} s)`);
    // (a) 30 s of random keys, stick drags and taps, from the busy harbour and from Lantern Lane; (d) 120 s of the
    // islanders' (and villagers') rounds sampled: nobody stops on a link, by a rope bridge's mouth, in a place circle,
    // a doorway or at the gangplank
    const rnd = await page.evaluate(() => {
      const G = window.__game;
      const env = G.env;
      const P = window.__W;
      const w = env.walk;
      let seed = 777;
      const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
      // where a stop is not allowed: on a link (between its run-ins), within 2 u of a rope bridge's mouth (islanders),
      // inside a place circle, in a doorway, at the gangplank
      const segD = (x, z, p, q) => {
        const dx = q[0] - p[0];
        const dz = q[2] - p[2];
        const u = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[2]) * dz) / (dx * dx + dz * dz || 1)));
        return { d: Math.hypot(x - p[0] - dx * u, z - p[2] - dz * u), u };
      };
      const LS = P.links.map((l) => {
        const cum = [0];
        for (let i = 1; i < l.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(l.pts[i][0] - l.pts[i - 1][0], l.pts[i][2] - l.pts[i - 1][2]));
        const L = cum[cum.length - 1];
        const at = (s) => {
          for (let i = 1; i < l.pts.length; i++) if (cum[i] >= s) { const k = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1); return [l.pts[i - 1][0] + (l.pts[i][0] - l.pts[i - 1][0]) * k, 0, l.pts[i - 1][2] + (l.pts[i][2] - l.pts[i - 1][2]) * k]; }
          return l.pts[l.pts.length - 1];
        };
        return { ...l, cum, L, mouths: [at(Math.min(0.9, L / 2)), at(Math.max(L - 0.9, L / 2))] };
      });
      const spots = (x, z, islander) => {
        const out = [];
        for (const l of LS) {
          for (let i = 0; i + 1 < l.pts.length; i++) {
            const s = segD(x, z, l.pts[i], l.pts[i + 1]);
            const along = l.cum[i] + s.u * (l.cum[i + 1] - l.cum[i]);
            if (s.d < l.hw + 0.1 && along > 0.9 && along < l.L - 0.9) {
              out.push('link:' + l.id);
              break;
            }
          }
          if (islander && l.kind === 'rope') for (const m of l.mouths) if (Math.hypot(x - m[0], z - m[2]) < 2.0) out.push('mouth:' + l.id);
        }
        for (const p of w.places) if (Math.hypot(x - p.x, z - p.z) < (p.r || 1) + 0.3) out.push('place:' + p.id);
        for (const d of w.doors || []) if (Math.hypot(x - d.x, z - d.z) < 1.0) out.push('door:' + d.id);
        if (Math.hypot(x - w.spawn.x, z - w.spawn.z) < 1.9) out.push('gangplank');
        return [...new Set(out)];
      };
      const prev = new Map();
      const stops = new Map();
      const stillFor = new Map(); // seconds each one has stood still (a stop: at least 0.25 s; less is a turn on the spot)
      const turns = new Map();
      let waits = 0;
      let samples = 0;
      const people = () => [
        ...env.v4.folk.people.filter((q) => !q.mer && q.placed).map((q) => ({ id: 'isl:' + q.id, x: q.x, z: q.z, isl: true, chatting: q.chatting })),
        ...env.villagers.map((v, i) => ({ id: 'v' + i, x: v.x, z: v.z, isl: false })),
      ];
      let time = 0;
      const sample = () => {
        const c = P.pos();
        for (const v of people()) {
          const p = prev.get(v.id);
          prev.set(v.id, { x: v.x, z: v.z });
          if (!p || v.chatting) continue;
          if (Math.hypot(v.x - p.x, v.z - p.z) < 0.004) {
            samples++;
            const st = (stillFor.get(v.id) || 0) + 1 / 30;
            stillFor.set(v.id, st);
            const s = spots(v.x, v.z, v.isl);
            if (!s.length) continue;
            if (Math.hypot(v.x - c.x, v.z - c.z) < 1.4) {
              waits++; // (LOOK-2: waiting for the captain, who stands there)
              continue;
            }
            const key = `${v.id}@${s.join('+')}`;
            const into = st >= 0.25 ? stops : turns;
            const e = into.get(key) || { who: v.id, at: [+v.x.toFixed(2), +v.z.toFixed(2)], s, t: +time.toFixed(1), n: 0 };
            e.n++;
            into.set(key, e);
          } else stillFor.set(v.id, 0);
        }
      };
      const randomRun = (sx, sz, sh) => {
        let worst = 0;
        let at = null;
        let stuckNow = 0;
        let rawNow = 0;
        let rawWorst = 0;
        let inp = { x: 0, z: 0 };
        let until = 0;
        let tt = 0;
        // a chase: the key held towards the nearest person within 6 u (a child runs at the townsfolk), re-aimed every
        // frame at whoever is nearest where they were last seen
        let chase = null;
        const toward = (x, z) => {
          const c = P.pos();
          const want = Math.atan2(x - c.x, z - c.z);
          const cy = G.town.api.town.camera.yaw;
          const fx = Math.sin(cy);
          const fz = Math.cos(cy);
          const wx = Math.sin(want);
          const wz = Math.cos(want);
          return { x: -fz * wx + fx * wz, z: fx * wx + fz * wz };
        };
        let chases = 0;
        P.place(sx, sz, sh);
        let lastC = P.pos();
        for (let i = 0; i < 30 * 30; i++) {
          if (tt >= until) {
            const r = rand();
            chase = null;
            if (r < 0.35) inp = { x: 0, z: 1 };
            else if (r < 0.47) inp = { x: rand() < 0.5 ? 1 : -1, z: 0 };
            else if (r < 0.67) {
              const a = rand() * Math.PI * 2;
              inp = { x: Math.sin(a) * (0.4 + rand() * 0.6), z: Math.cos(a) * (0.4 + rand() * 0.6) };
            } else if (r < 0.87) {
              const c = P.pos();
              const f = env.folk().filter((q) => Number.isFinite(q.x) && Math.hypot(q.x - c.x, q.z - c.z) < 6).sort((p, q) => Math.hypot(p.x - c.x, p.z - c.z) - Math.hypot(q.x - c.x, q.z - c.z))[0];
              if (f) {
                chase = { x: f.x, z: f.z };
                chases++;
                inp = toward(f.x, f.z);
              } else inp = { x: 0, z: 1 };
            } else {
              const c = P.pos();
              const a = rand() * Math.PI * 2;
              G.town.walkTo(c.x + Math.sin(a) * 6, c.z + Math.cos(a) * 6);
              inp = { x: 0, z: 0 };
            }
            until = tt + 0.5 + rand() * (chase ? 2 : 1);
          }
          if (chase) {
            const f = env.folk().filter((q) => Number.isFinite(q.x) && Math.hypot(q.x - chase.x, q.z - chase.z) < 1.5).sort((p, q) => Math.hypot(p.x - chase.x, p.z - chase.z) - Math.hypot(q.x - chase.x, q.z - chase.z))[0];
            if (f) {
              chase = { x: f.x, z: f.z };
              const c = P.pos();
              // (on top of them: keep the key held the same way, through them)
              if (Math.hypot(f.x - c.x, f.z - c.z) > 0.15) inp = toward(f.x, f.z);
            }
          }
          P.step(1 / 30, { x: inp.x, z: inp.z });
          tt += 1 / 30;
          time += 1 / 30;
          if (G.town.view !== 'town') G.town.back();
          const c = P.pos();
          const mv = Math.hypot(c.x - lastC.x, c.z - lastC.z);
          lastC = c;
          const au = G.town.api.auto;
          const pushing = Math.hypot(inp.x, inp.z) > 0.1 || au;
          const near = env.folk().filter((f) => Math.hypot(f.x - c.x, f.z - c.z) < 1.0);
          // stuck behind a person: he goes nowhere, someone is at hand, and the walk itself would let him go the way he
          // is pushed (pressed against a rail or the water's edge with someone standing by is not the walking bug)
          let free = false;
          if (pushing && mv < 0.004 && near.length) {
            let dx = 0;
            let dz = 0;
            if (au && au.pts && au.pts[au.i]) {
              dx = au.pts[au.i].x - c.x;
              dz = au.pts[au.i].z - c.z;
            } else {
              const cy = G.town.api.town.camera.yaw;
              dx = -Math.cos(cy) * inp.x + Math.sin(cy) * inp.z;
              dz = Math.sin(cy) * inp.x + Math.cos(cy) * inp.z;
            }
            const L = Math.hypot(dx, dz) || 1;
            const r = G.town.api.town.walk.move({ x: c.x, z: c.z, y: c.y }, (dx / L) * 0.1, (dz / L) * 0.1, 0.3, []);
            free = Math.hypot(r.x - c.x, r.z - c.z) > 0.05;
          }
          if (pushing && mv < 0.004 && near.length) rawNow += 1 / 30;
          else rawNow = 0;
          rawWorst = Math.max(rawWorst, rawNow);
          if (pushing && mv < 0.004 && near.length && free) stuckNow += 1 / 30;
          else stuckNow = 0;
          if (stuckNow > worst) {
            worst = stuckNow;
            const who = (f) => (f.islander ? 'islander ' + f.islander : f.villager ? 'villager' : f.npc || 'townsperson');
            const au = G.town.api.auto;
            at = { t: +tt.toFixed(1), at: [+c.x.toFixed(2), +c.z.toFixed(2)], input: au ? 'tap' : [+inp.x.toFixed(2), +inp.z.toFixed(2)], auto: au ? { i: au.i, n: au.pts && au.pts.length, to: au.pts && au.pts.length ? [+(+au.pts[au.pts.length - 1].x).toFixed(2), +(+au.pts[au.pts.length - 1].z).toFixed(2)] : null, pass: au.pass, stuck: +(+au.stuck).toFixed(2), repaths: au.repaths } : null, near: near.map((f) => `${who(f)} ${Math.hypot(f.x - c.x, f.z - c.z).toFixed(2)} u`) };
          }
          sample();
        }
        return { worst: +worst.toFixed(2), at, raw: +rawWorst.toFixed(2), chases };
      };
      const sp = w.spawn;
      const harbour = randomRun(sp.x, sp.z, sp.h);
      const lane = randomRun(-2.5, -33.4, 1.62);
      // the rest of an ashore day: standing still, then a tour of the districts by hops and walks
      P.place(sp.x, sp.z, sp.h);
      for (let i = 0; i < 30 * 30; i++) {
        P.step(1 / 30, { x: 0, z: 0 });
        time += 1 / 30;
        sample();
      }
      const tour = ['plot:homeE', 'plot:observatory', 'plot:fishing', 'plot:music', 'plot:park', 'builder'];
      let ti = 0;
      for (let i = 0; i < 30 * 30; i++) {
        if (!G.town.api.auto && G.town.view === 'town') G.town.goTo(tour[ti++ % tour.length]);
        if (G.town.view !== 'town') G.town.back();
        P.step(1 / 30, { x: 0, z: 0 });
        time += 1 / 30;
        sample();
      }
      const list = [...stops.values()].sort((a, b) => b.n - a.n);
      const tl = [...turns.keys()].filter((k) => !stops.has(k)).map((k) => turns.get(k));
      return { harbour, lane, sampled: +time.toFixed(1), samples, waits, stops: list.slice(0, 10), nStops: list.length, turns: tl.slice(0, 10) };
    });
    check(rnd.harbour.worst <= 1 && rnd.lane.worst <= 1, `walking (a): 30 s of random keys (${rnd.harbour.chases} and ${rnd.lane.chases} of them held at the nearest person), stick drags and taps in the harbour and 30 s in Lantern Lane: never stuck behind a person for more than 1 s (longest ${rnd.harbour.worst} s and ${rnd.lane.worst} s; standing still against the walk's edge with someone near: ${rnd.harbour.raw} s and ${rnd.lane.raw} s, not counted${rnd.harbour.worst > 1 ? ' ' + J(rnd.harbour.at) : ''}${rnd.lane.worst > 1 ? ' ' + J(rnd.lane.at) : ''})`);
    check(rnd.sampled >= 120 && rnd.nStops === 0, `walking (d): over ${rnd.sampled} s of their rounds no islander or villager stops (stands still 0.25 s or more) on a link, within 2 u of a rope bridge's mouth (islanders), in a place circle, a doorway or at the gangplank (${rnd.nStops} stops of 0.25 s or more${rnd.nStops ? ': ' + J(rnd.stops) : ''}; ${rnd.samples} still samples, ${rnd.waits} of them LOOK-2 waits for the captain, not counted)`);
    if (rnd.turns.length) console.log(`     (walking (d): momentary standstills there, under 0.25 s (a walker turning back on the spot): ${J(rnd.turns)})`);
    // LOOK-2 on the islanders' boardwalks: he stands on one for 30 s; whoever comes waits for him, nobody walks into him
    const look2 = await page.evaluate(() => {
      const G = window.__game;
      const P = window.__W;
      const out = [];
      for (const id of ['s9S18', 's15S16', 's3S12', 's11S17']) {
        const l = P.links.find((q) => q.id === id);
        if (!l) continue;
        const mid = l.pts[Math.floor(l.pts.length / 2)];
        let waited = 0;
        while (waited < 600 && G.env.v4.folk.people.some((q) => Math.hypot(q.x - mid[0], q.z - mid[2]) < 1.6)) {
          P.step(1 / 30, { x: 0, z: 0 });
          waited++;
        }
        P.place(mid[0], mid[2], 0);
        for (let i = 0; i < 30; i++) P.step(1 / 30, { x: 0, z: 0 });
        const p0 = P.pos();
        let min = 9;
        let who = null;
        let came = new Set();
        for (let i = 0; i < 30 * 30; i++) {
          P.step(1 / 30, { x: 0, z: 0 });
          const c = P.pos();
          for (const q of G.env.v4.folk.people) {
            if (q.mer) continue;
            const d = Math.hypot(q.x - c.x, q.z - c.z);
            if (d < 2.5) came.add(q.id);
            if (d < min) {
              min = d;
              who = { id: q.id, at: [+q.x.toFixed(2), +q.z.toFixed(2)], s: +(i / 30).toFixed(1) };
            }
          }
        }
        const p1 = P.pos();
        out.push({ id, came: [...came], moved: +Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2), closest: +min.toFixed(2), ...(min < 0.6 ? { who } : {}) });
      }
      return out;
    });
    check(look2.length === 4 && look2.every((r) => r.moved < 0.05 && r.closest >= 0.6), `walking: standing 30 s on four islanders' boardwalks, whoever comes waits for him (LOOK-2): never pushed, none closer than 0.6 u (${J(look2)})`);
    await ctx.close();
    const total = (Date.now() - t0) / 1000;
    console.log(`     (walking: ${ropeRuns.length + boardRuns.length} runs in ${runSecs.toFixed(1)} s; the section ${total.toFixed(1)} s of its ${WALK_BUDGET} s budget)`);
    check(total <= WALK_BUDGET, `walking: the section's time ${total.toFixed(1)} s ≤ ${WALK_BUDGET} s (§13.2's 6 min on SwiftShader; ${ropeRuns.length + boardRuns.length} runs took ${runSecs.toFixed(1)} s)`);
  });

  // ----------------------------------------------------------------------------------------------------- scene
  // The construction scene (§5): saves first; the stages, captions, pips and the blueprint; the skips; reduced motion;
  // leaving mid-scene; the double-build guard; Watch again; a SPEC3 plot; the ink and clipping probes; the folded bar.
  const SCENE_STORE = { ...STORE, 'pirates-ahoy-purse': '30000', 'pirates-ahoy-island': island({ homeB: 1, school: 1 }), 'pirates-ahoy-island4': island4({ homeE: 1, music: 1, farm: 2 }) };
  // sample the running scene a frame at a time until it ends (or `until(sample)`): its time, stage, the strip, #build-live
  const watchScene = (stop = null) =>
    (async (stop) => {
      const G = window.__game;
      const S = G.env.v4.scene;
      const out = [];
      const live = [];
      let cheers = 0;
      let sfxSeen = window.__sfx.length;
      for (let k = 0; k < 3000; k++) {
        const s = G.env.scene;
        if (!s || !s.running) break;
        const pips = document.querySelectorAll('#scene-pips .on').length;
        const bp = S.group.getObjectByName('construction:blueprint');
        const row = { t: +s.t.toFixed(3), stage: s.stage, strip: T.text('scene-stage'), pips, skipping: s.skipping, blueprint: !!(bp && bp.visible), cut: s.info ? s.info.cut : null, cam: G.camera.position.toArray().map((v) => +v.toFixed(3)) };
        out.push(row);
        const l = T.text('build-live');
        if (l && live[live.length - 1] !== l) live.push(l);
        for (; sfxSeen < window.__sfx.length; sfxSeen++) if (window.__sfx[sfxSeen] === 'cheer') cheers++;
        if (stop && new Function('r', `return (${stop})(r)`)(row)) return { rows: out, live, cheers, stopped: true };
        await new Promise((r) => requestAnimationFrame(r));
      }
      await T.frames(2);
      const l = T.text('build-live');
      if (l && live[live.length - 1] !== l) live.push(l);
      for (; sfxSeen < window.__sfx.length; sfxSeen++) if (window.__sfx[sfxSeen] === 'cheer') cheers++;
      return { rows: out, live, cheers, stopped: false };
    })(stop);
  // the pixels of the canvas right after the game drew its frame (both passes), and where the cut line falls
  const readFrame = async () => {
    const cv = document.querySelector('canvas');
    const gl = cv.getContext('webgl2') || cv.getContext('webgl');
    return new Promise((res) => requestAnimationFrame(() => {
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      res({ w, h, px });
    }));
  };
  await section('scene', async () => {
    const { ctx, page } = await open({ label: 'scene', store: SCENE_STORE, crowd: true });
    if (!(await needs(page, 'scene', ['v4', 'town4', 'forwards', 'panel4', 'island4api']))) return;
    await page.evaluate(probes);
    // a new building on a new plot (the Forge), from its board: the record, then the chest, then the scene
    await walkView(page);
    await page.evaluate(() => { T.atPlace('plot:forge'); window.__game.town.simulate(0.1, { x: 0, z: 0 }); });
    await page.keyboard.press('e');
    await frames(page, 3);
    await page.evaluate(() => { T.clearWrites(); T.clearSfx(); });
    const purse0 = await page.evaluate(() => window.__game.state.purse);
    await page.keyboard.press('Enter');
    const s0 = await page.evaluate(() => {
      const G = window.__game;
      const s = G.env.scene;
      const fw = G.island.scene;
      const btns = [...document.querySelectorAll('#build-panel button[data-plot]')];
      return {
        writes: T.writesFull().filter((w) => ['pirates-ahoy-island4', 'pirates-ahoy-purse', 'pirates-ahoy-island'].includes(w.k)),
        stored: T.stored('pirates-ahoy-island4'),
        purse: G.state.purse,
        chest: T.stored('pirates-ahoy-purse'),
        env: s && { id: s.id, running: s.running, kind: s.kind, t: s.t },
        fw: { running: fw.running, kind: fw.kind, stage: fw.stage },
        strip: T.shown('build-scene'),
        building: btns.length > 0 && btns.every((b) => /Building…/.test(T.text(b)) && b.getAttribute('aria-disabled') === 'true'),
        nBtns: btns.length,
      };
    });
    const forgeCost = ISL.PLOTS4.find((p) => p.id === 'forge').costs[0];
    check(s0.writes.map((w) => w.k).join() === 'pirates-ahoy-island4,pirates-ahoy-purse' && s0.writes.every((w) => !w.scene) && /"forge":1/.test(s0.stored) && s0.purse === purse0 - forgeCost && s0.chest === String(s0.purse) && s0.env && s0.env.running && s0.env.id === 'forge' && s0.env.kind === 'new',
      `scene: Build at the Forge's row: the island4 record first, then the chest (${s0.writes.map((w) => `${w.k}${w.scene ? ' (scene running!)' : ''}`).join(' → ')}), ${purse0} → ${s0.purse}; only then the scene (${J(s0.env)})`);
    check(s0.fw.running === true && s0.fw.kind === 'new', `scene: __game.island.scene follows sparrow's scene (running ${s0.fw.running}, kind ${s0.fw.kind}, stage ${s0.fw.stage})${s0.fw.running ? '' : " -> __game.island.scene is Stage 0's placeholder: forward it to env.scene (SPEC4 §5.4, §11.3; 2A's R3 hook)"}`);
    check(s0.strip && s0.building, `scene: the strip shows and every Build button reads "Building…" (aria-disabled) while it runs (${s0.nBtns} buttons)`);
    // the stages in order, the strip's name and pips matching stageAt() at the same moment, the captions, the blueprint
    const shots = { foundation: 'scene-foundation.png', walls: 'scene-walls.png', roof: 'scene-roof.png' };
    const run1 = { rows: [], live: [], cheers: 0 };
    for (;;) {
      const part = await page.evaluate(watchScene, `(r) => ${J(Object.keys(shots))}.includes(r.stage) && r.t > 0`);
      run1.rows.push(...part.rows);
      run1.live.push(...part.live.filter((l) => run1.live[run1.live.length - 1] !== l));
      run1.cheers += part.cheers;
      if (!part.stopped) break;
      const st = part.rows[part.rows.length - 1].stage;
      await snap(page, shots[st]).catch(() => {});
      delete shots[st];
    }
    const want = [];
    for (let t = 0; t <= BS.sceneLength('new', false) + 1e-6; t += 0.05) {
      const s = BS.stageAt(t, 'new', false);
      if (want[want.length - 1] !== s.stage) want.push(s.stage);
    }
    const seen = [];
    for (const r of run1.rows) if (seen[seen.length - 1] !== r.stage) seen.push(r.stage);
    // (the strip is drawn by the panel each frame from the scene's time: it may be one frame behind)
    const mism = run1.rows.filter((r, i) => {
      if (i === 0) return false;
      const a = BS.stageAt(r.t, 'new', false);
      const b = BS.stageAt(run1.rows[i - 1].t, 'new', false);
      const ok = (s) => r.strip === s.name && r.pips === s.pips;
      return !ok(a) && !ok(b);
    });
    const caps = run1.live.filter((l) => BS.STAGES.some((s) => s.caption === l));
    const capOrder = caps.map((c) => BS.STAGES.findIndex((s) => s.caption === c));
    const finalLine = run1.live[run1.live.length - 1] || '';
    const bpSeen = run1.rows.filter((r) => r.blueprint).map((r) => r.stage);
    const bpOk = bpSeen.includes('frame') && bpSeen.includes('walls') && !run1.rows.some((r) => r.blueprint && (r.stage === 'finish' || r.stage === 'movingIn'));
    const lastT = run1.rows.length ? run1.rows[run1.rows.length - 1].t : 0;
    check(seen.join() === want.join() && mism.length === 0 && run1.rows.length > 20, `scene: the stages in order (${seen.join(' → ')}), the strip's name and pips matching stageAt() every frame (${run1.rows.length} frames to t ${lastT})${mism.length ? ' -> ' + J(mism.slice(0, 4)) : ''}`);
    check(caps.length >= 4 && capOrder.every((v, i) => i === 0 || v > capOrder[i - 1]) && /^Blacksmith's Forge built!/.test(finalLine) && /Villagers \d+ · /.test(finalLine), `scene: #build-live reads the captions in order (${caps.join(' | ')}) and the last line "${finalLine}"`);
    check(bpOk, `scene: the pale blueprint shows while the frame and the walls go up, and is gone for the finishing touches (seen in ${[...new Set(bpSeen)].join(', ')})`);
    const s1 = await page.evaluate(() => { const a = document.activeElement; const row = a && a.closest && a.closest('[data-plot]'); return { scene: window.__game.env.scene, strip: T.shown('build-scene'), tier: window.__game.island4.config.t.forge, standing: window.__game.env.plots.find((p) => p.id === 'forge').tier, focus: row ? row.dataset.plot : T.focus() }; });
    check(s1.scene === null && !s1.strip && s1.tier === 1 && s1.standing === 1 && s1.focus === 'forge', `scene: at the end the Forge stands (record tier ${s1.tier}, the town's tier ${s1.standing}), the strip is gone and focus is back on its row (${s1.focus})`);
    await snap(page, 'scene-done.png').catch(() => {});
    // a skip by a key: the building stands at once, one cheer, the key does nothing else, the last line only
    // (a scene still waving after a skip swallows the next build: wait for it to end first)
    const idle = () => page.evaluate(() => T.endScene());
    const skipBy = async (how) => {
      await idle();
      await page.evaluate(() => { T.clearSfx(); T.b().focus('forge'); });
      const pre = await page.evaluate(() => ({ purse: window.__game.state.purse, t4: window.__game.island4.config.t.forge }));
      if (how === 'key' || how === 'tap') await page.keyboard.press('Enter');
      else await page.evaluate(() => T.b().build('forge'));
      await page.evaluate(async () => { for (let n = 0; n < 60 && window.__game.env.scene && window.__game.env.scene.t < 2.5; n++) window.__game.island.scene.advance(0.1); await T.frames(2); });
      await page.evaluate(() => { document.getElementById('build-live').textContent = ''; });
      if (how === 'key') await page.keyboard.press('x');
      else if (how === 'tap') await page.mouse.click(640, 200);
      else await press(page, '#scene-skip-btn');
      const at = await page.evaluate(() => ({ skipping: !!(window.__game.env.scene && window.__game.env.scene.skipping), stage: window.__game.env.scene && window.__game.env.scene.stage, t4: window.__game.island4.config.t.forge, standing: window.__game.env.plots.find((p) => p.id === 'forge').tier }));
      const rest = await page.evaluate(watchScene, null);
      const post = await page.evaluate(() => ({ purse: window.__game.state.purse, t4: window.__game.island4.config.t.forge, view: window.__game.town.view, live: T.text('build-live'), focus: T.focus(), cheers: T.sfx().filter((n) => n === 'cheer').length }));
      const caps2 = rest.live.filter((l) => BS.STAGES.some((s) => s.caption === l));
      return { how, pre, at, frames: rest.rows.length, cheers: post.cheers, caps: caps2, post };
    };
    for (const how of ['key', 'tap', 'button']) {
      const r = await skipBy(how);
      check(r.at.skipping && r.at.t4 === r.pre.t4 + 1 && r.at.standing === r.pre.t4 + 1 && r.cheers === 1 && r.caps.length === 0 && r.post.view === 'build' && r.post.purse === r.pre.purse - ISL.PLOTS4.find((p) => p.id === 'forge').costs[r.pre.t4] && r.post.t4 === r.pre.t4 + 1 && /built!/.test(r.post.live),
        `scene: a skip by ${how === 'key' ? 'a key (x)' : how === 'tap' ? 'a tap on the town' : 'the Skip button'}: the Forge stands at tier ${r.at.standing} at once, ${r.cheers} cheer in the ${r.frames}-frame wave, no stage caption after it, the last line "${r.post.live}"; nothing else (view ${r.post.view}, one build: ${r.pre.purse} → ${r.post.purse})${notShown()}`);
      if (how === 'button') break;
      // (back to tier 1 for the next skip: the record set by the test API, then the panel told)
      await page.evaluate(() => { const c = window.__game.island4.config; c.t.forge = 1; window.__game.island4.set(c); });
    }
    // Esc skips, a second Esc leaves the panel (§5.2, §8.1)
    await idle();
    await page.evaluate(() => { const c = window.__game.island4.config; c.t.music = 1; window.__game.island4.set(c); T.b().focus('music'); });
    await page.keyboard.press('Enter');
    await page.evaluate(async () => { for (let n = 0; n < 60 && window.__game.env.scene && window.__game.env.scene.t < 2; n++) window.__game.island.scene.advance(0.1); await T.frames(2); });
    await page.keyboard.press('Escape');
    const e1 = await page.evaluate(() => ({ skipping: !!(window.__game.env.scene && window.__game.env.scene.skipping), view: window.__game.town.view }));
    await page.keyboard.press('Escape');
    const e2 = await page.evaluate(() => ({ view: window.__game.town.view, tier: window.__game.island4.config.t.music }));
    check(e1.skipping && e1.view === 'build' && e2.view === 'town' && e2.tier === 2, `scene: Esc skips (${J(e1)}), a second Esc leaves the panel (${J(e2)})`);
    // leaving the panel mid-scene keeps the building; so does closing the page
    await idle();
    await page.evaluate(() => { window.__game.town.open('builder'); T.b().focus('farm'); });
    await page.keyboard.press('Enter');
    await page.evaluate(async () => { for (let n = 0; n < 60 && window.__game.env.scene && window.__game.env.scene.t < 3; n++) window.__game.island.scene.advance(0.1); await T.frames(2); });
    const lv = await page.evaluate(async () => {
      const G = window.__game;
      G.town.back();
      const view = G.town.view;
      await T.endScene();
      return { view, rec: G.island4.config.t.farm, standing: G.env.plots.find((p) => p.id === 'farm').tier, scene: G.env.scene };
    });
    check(lv.view === 'town' && lv.rec === 3 && lv.standing === 3 && lv.scene === null, `scene: leaving Bess's panel mid-scene keeps the building (the Goat Farm at tier ${lv.standing}, record ${lv.rec})`);
    await idle();
    await page.evaluate(() => { window.__game.town.open('builder'); T.b().focus('homeE'); });
    await page.keyboard.press('Enter');
    await page.evaluate(async () => { for (let n = 0; n < 60 && window.__game.env.scene && window.__game.env.scene.t < 2; n++) window.__game.island.scene.advance(0.1); await T.frames(2); });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: LOAD_TIMEOUT });
    await page.waitForFunction(() => window.__gameReady === true && window.__game && window.__game.env, null, { timeout: LOAD_TIMEOUT });
    await page.evaluate(installHelpers);
    await built(page);
    const cl = await page.evaluate(() => ({ rec: window.__game.island4.config.t.homeE, standing: window.__game.env.plots.find((p) => p.id === 'homeE').tier }));
    check(cl.rec === 2 && cl.standing === 2, `scene: closing the page mid-scene keeps the building (the Treehouse at tier ${cl.standing} after a reload)`);
    await page.evaluate(probes);
    await walkView(page);
    await page.evaluate(() => window.__game.town.open('builder'));
    // the double-build guard: a double click builds once; a held Enter builds once
    const dbl = await page.evaluate(async () => {
      const G = window.__game;
      T.b().focus('observatory');
      const b = document.querySelector('#build-panel button[data-plot="observatory"]');
      const p0 = G.state.purse;
      b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
      const r = { spent: p0 - G.state.purse, tier: G.island4.config.t.observatory };
      await T.endScene();
      return r;
    });
    await page.evaluate(() => T.b().focus('museum'));
    await frames(page, 2);
    const heldP0 = await page.evaluate(() => window.__game.state.purse);
    await page.keyboard.down('Enter');
    for (let k = 0; k < 4; k++) await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    const held = await page.evaluate(async () => { const r = { purse: window.__game.state.purse, tier: window.__game.island4.config.t.museum }; await T.endScene(); return r; });
    const obsCost = ISL.PLOTS4.find((p) => p.id === 'observatory').costs[0];
    const musCost = ISL.PLOTS4.find((p) => p.id === 'museum').costs[0];
    check(dbl.spent === obsCost && dbl.tier === 1 && heldP0 - held.purse === musCost && held.tier === 1, `scene: the double-build guard: a double click builds the Observatory once (−${dbl.spent}, tier ${dbl.tier}); a held Enter builds the Museum once (−${heldP0 - held.purse}, tier ${held.tier})`);
    // Watch again: the plot's last tier going up, writing nothing; its button is disabled while another scene runs
    await idle();
    await frames(page, 3); // (townMode lets go of the last scene on its next frame)
    const wa = await page.evaluate(async () => {
      const G = window.__game;
      const rec0 = [T.stored('pirates-ahoy-island'), T.stored('pirates-ahoy-island4'), T.stored('pirates-ahoy-purse'), T.stored('pirates-ahoy-feats')];
      const p0 = G.state.purse;
      const tier0 = G.island4.config.t.forge;
      T.clearWrites();
      const btn = document.querySelector('#build-panel .b-watch[data-watch="forge"]');
      const label = btn && btn.getAttribute('aria-label');
      const size = btn && [btn.offsetWidth, btn.offsetHeight];
      const row = btn && btn.closest('[data-plot]');
      const main = row && row.querySelector('button[data-plot]');
      btn.click();
      const s = G.env.scene;
      const r = { label, size, mainH: main && main.offsetHeight, running: !!(s && s.running), id: s && s.id, kind: s && s.kind, replay: T.b().scene && T.b().scene.replay };
      await T.endScene();
      const rec1 = [T.stored('pirates-ahoy-island'), T.stored('pirates-ahoy-island4'), T.stored('pirates-ahoy-purse'), T.stored('pirates-ahoy-feats')];
      return { ...r, writes: T.writes(), same: rec0.every((v, i) => v === rec1[i]), purse: G.state.purse - p0, tier0, tier: G.island4.config.t.forge };
    });
    check(wa.label === "Watch the Blacksmith's Forge go up again" && wa.size && wa.size[0] >= 44 && wa.size[1] >= 44 && wa.size[1] <= wa.mainH + 0.5 && wa.running && wa.id === 'forge' && wa.replay === true && wa.writes.length === 0 && wa.same && wa.purse === 0 && wa.tier === wa.tier0 && wa.tier >= 1,
      `scene: Watch again ("${wa.label}", ${wa.size && wa.size.join('x')} beside a ${wa.mainH} px button) replays the Forge's last tier (${wa.kind}) and writes nothing (${wa.writes.length} writes${wa.writes.length ? ': ' + wa.writes.join(', ') : ''}; records ${wa.same ? 'unchanged' : 'CHANGED'}; gold ${wa.purse >= 0 ? '+' : ''}${wa.purse}; tier ${wa.tier})`);
    const busy = await page.evaluate(async () => {
      const G = window.__game;
      T.b().build('aquarium');
      const running = !!(G.env.scene && G.env.scene.running);
      const w = document.querySelector('#build-panel .b-watch[data-watch="forge"]');
      const dis = w && w.getAttribute('aria-disabled');
      const replay = G.env.replayBuild('forge');
      const sceneId = G.env.scene && G.env.scene.id;
      await T.endScene();
      return { running, dis, replay, sceneId };
    });
    check(busy.running && busy.dis === 'true' && busy.replay === false && busy.sceneId === 'aquarium', `scene: while the Aquarium goes up Watch again is refused (aria-disabled ${busy.dis}, replayBuild ${busy.replay}; the scene stays the Aquarium's)`);
    // one of the ten SPEC3 plots uses the scene too (Tavern Row's Cottage): the island record first
    const sp3 = await page.evaluate(() => {
      const G = window.__game;
      T.clearWrites();
      T.b().build('homeA');
      const s = G.env.scene;
      const r = { writes: T.writes(['pirates-ahoy-island', 'pirates-ahoy-island4', 'pirates-ahoy-purse']), running: !!(s && s.running), id: s && s.id, kind: s && s.kind, tier: G.island.config.t.homeA };
      return r;
    });
    check(sp3.writes.join() === 'pirates-ahoy-island,pirates-ahoy-purse' && sp3.running && sp3.id === 'homeA' && sp3.kind === 'new' && sp3.tier === 1, `scene: a SPEC3 plot (Tavern Row) gets the scene too (${sp3.id}, ${sp3.kind}), its own record first (${sp3.writes.join(' → ')})`);
    await idle();
    // no ink outline above the cut line: mid-walls, the scene held still, the camera level with the cut, the new tier's
    // ink drawn in a marker colour: none of it above the cut's row, some below (the walls already up)
    const ink = await page.evaluate(async (readFrameSrc) => {
      const readFrame = new Function(`return (${readFrameSrc})`)();
      const THREE = await import('/vendor/three.module.min.js');
      const G = window.__game;
      T.b().build('homeG');
      for (let n = 0; n < 200 && G.env.scene && !(G.env.scene.stage === 'walls' && G.env.scene.info.stage.k > 0.45); n++) G.island.scene.advance(0.05);
      await T.frames(2);
      const S = G.env.v4.scene;
      const info = S.info;
      const step0 = S.step;
      S.step = () => {}; // (the scene held still for the probe)
      const cut = info.cut;
      const marked = [];
      const clipped = [];
      S.group.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (!m || !m.clippingPlanes || !m.clippingPlanes.length) continue;
          const p = m.clippingPlanes[0];
          if (p.normal.y < -0.99 && Math.abs(p.constant - cut) < 1e-4 && /^construction:(ink|thin|flat|boards|tex)$/.test(m.name) && m.userData.outlineParameters && m.userData.outlineParameters.visible !== false) marked.push(m);
          clipped.push(m);
        }
      });
      // anything else in the town clipped? (only the scene's own clones may carry a plane)
      const stray = [];
      G.scene.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        let inScene = false;
        for (let q = o; q; q = q.parent) if (q === S.group) inScene = true;
        if (inScene) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && m.clippingPlanes && m.clippingPlanes.length) stray.push(`${o.name || o.type}:${m.name || m.type}`);
      });
      const pad = new THREE.Vector3(...info.frame.pad);
      const porch = new THREE.Vector3(...info.frame.porch);
      const dir = porch.clone().sub(pad).setY(0);
      if (dir.length() < 0.1) dir.set(0, 0, 1);
      dir.normalize();
      const dist = 3 + 1.6 * Math.max(2, info.top - info.floor);
      const eye = pad.clone().addScaledVector(dir, dist);
      const prev = G.scene.onBeforeRender;
      let ndcY = null;
      G.scene.onBeforeRender = (r, s, cam) => {
        cam.position.set(eye.x, cut, eye.z);
        cam.lookAt(pad.x, cut, pad.z);
        cam.updateMatrixWorld();
        ndcY = new THREE.Vector3(pad.x, cut, pad.z).project(cam).y;
      };
      await T.frames(3);
      const plain = await readFrame();
      const saved = marked.map((m) => m.userData.outlineParameters);
      for (const m of marked) m.userData.outlineParameters = { ...m.userData.outlineParameters, color: [1, 0, 1] };
      await T.frames(3);
      const mark = await readFrame();
      for (let i = 0; i < marked.length; i++) marked[i].userData.outlineParameters = saved[i];
      G.scene.onBeforeRender = prev;
      S.step = step0;
      const isMk = (px, i) => px[i] > 200 && px[i + 1] < 60 && px[i + 2] > 200;
      const row = Math.round(((ndcY + 1) / 2) * mark.h); // (rows from the bottom)
      let above = 0;
      let below = 0;
      for (let y = 0; y < mark.h; y++) {
        for (let x = 0; x < mark.w; x++) {
          const i = (y * mark.w + x) * 4;
          if (!isMk(mark.px, i) || isMk(plain.px, i)) continue;
          if (y > row + 2) above++;
          else if (y < row - 2) below++;
        }
      }
      await T.endScene();
      return { stage: info.stage.stage, k: +info.stage.k.toFixed(2), cut: +cut.toFixed(2), floor: info.floor, top: info.top, marked: marked.length, clipped: clipped.length, stray, row, h: mark.h, above, below };
    }, readFrame.toString());
    check(ink.marked > 0 && ink.above === 0 && ink.below > 20, `scene: no ink outline above the cut line: mid-walls (${ink.stage} k ${ink.k}, the cut at y ${ink.cut} between ${ink.floor} and ${ink.top}), the new tier's ink (${ink.marked} materials) drawn in a marker colour from a camera level with the cut: ${ink.above} px above its row ${ink.row}/${ink.h}, ${ink.below} px below (the walls already up)`);
    check(ink.clipped > 0 && ink.stray.length === 0, `scene: nothing outside the plot carries a clipping plane while the scene runs (${ink.clipped} clipped materials, all the scene's own)${ink.stray.length ? ' -> ' + ink.stray.slice(0, 6).join(', ') : ''}`);
    // the plaza's pixels during a scene, and the plot's surroundings: the same frame drawn twice at once (no time passes
    // between), with the renderer's local clipping on (as the scene has it) and off: outside the plot not one pixel may
    // change (nothing else carries a plane); on the plot some do (the scene's own cut: the probe sees clipping)
    const clip = await page.evaluate(async () => {
      const G = window.__game;
      let R = null;
      const prev = G.scene.onBeforeRender;
      G.scene.onBeforeRender = (r) => {
        R = r;
      };
      await T.frames(2);
      G.scene.onBeforeRender = prev;
      T.b().build('aquarium');
      for (let n = 0; n < 200 && G.env.scene && G.env.scene.stage !== 'walls'; n++) G.island.scene.advance(0.05);
      await T.frames(2);
      const S = G.env.v4.scene;
      const info = S.info;
      const cam = G.camera;
      const saved = { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov, view: cam.view ? { ...cam.view } : null };
      const gl = R.getContext();
      const shot = (on) => {
        R.localClippingEnabled = on;
        R.render(G.scene, cam);
        const w = gl.drawingBufferWidth;
        const h = gl.drawingBufferHeight;
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return { w, h, px };
      };
      const view = (eye, at) => {
        cam.clearViewOffset();
        cam.fov = 50;
        cam.updateProjectionMatrix();
        cam.position.set(...eye);
        cam.lookAt(...at);
        cam.updateMatrixWorld();
        const on = R.localClippingEnabled;
        const a = shot(true);
        const b = shot(false);
        R.localClippingEnabled = on;
        // the plot's box on screen (its pad's middle, a 3.5 u square round it, from the deck to its top), 6 px more
        const P = info.frame.pad;
        let x0 = Infinity;
        let x1 = -Infinity;
        let y0 = Infinity;
        let y1 = -Infinity;
        for (const dx of [-3.5, 3.5]) for (const dz of [-3.5, 3.5]) for (const y of [info.floor - 0.5, info.top + 1]) {
          const v = { x: P[0] + dx, y, z: P[2] + dz };
          const q = T.toScreen(v.x, v.y, v.z);
          if (!q) continue;
          const sx = (q.x / innerWidth) * a.w;
          const sy = a.h - (q.y / innerHeight) * a.h;
          x0 = Math.min(x0, sx - 6);
          x1 = Math.max(x1, sx + 6);
          y0 = Math.min(y0, sy - 6);
          y1 = Math.max(y1, sy + 6);
        }
        let outside = 0;
        let inside = 0;
        for (let y = 0; y < a.h; y++) {
          for (let x = 0; x < a.w; x++) {
            const i = (y * a.w + x) * 4;
            if (a.px[i] === b.px[i] && a.px[i + 1] === b.px[i + 1] && a.px[i + 2] === b.px[i + 2]) continue;
            if (x >= x0 && x <= x1 && y >= y0 && y <= y1) inside++;
            else outside++;
          }
        }
        return { outside, inside, n: a.w * a.h };
      };
      const plaza = view([1.5, 4.2, -9.5], [-6.2, 3.6, -18.5]);
      const P = info.frame.pad;
      const around = view([P[0] + 9, info.top + 4, P[2] + 9], [P[0], info.floor + 1.5, P[2]]);
      cam.position.copy(saved.pos);
      cam.quaternion.copy(saved.quat);
      cam.fov = saved.fov;
      if (saved.view && saved.view.enabled) cam.setViewOffset(saved.view.fullWidth, saved.view.fullHeight, saved.view.offsetX, saved.view.offsetY, saved.view.width, saved.view.height);
      else cam.clearViewOffset();
      cam.updateProjectionMatrix();
      const cut = info.cut;
      await T.endScene();
      return { plaza, around, cut: +cut.toFixed(2) };
    });
    check(clip.plaza.outside === 0 && clip.around.outside === 0 && clip.around.inside > 0, `scene: nothing outside the plot is clipped: the plaza drawn with local clipping on and off at the same moment differs in ${clip.plaza.outside} of ${clip.plaza.n} pixels; round the Aquarium (the cut at y ${clip.cut}) ${clip.around.outside} pixels outside its box differ and ${clip.around.inside} inside it (the scene's own cut)`);
    await ctx.close();
    // reduced motion: four stills, 5.0 s, the camera cut to its pose and still
    const rm = await open({ label: 'scene-reduced', reduced: true, store: SCENE_STORE, crowd: true });
    if (await needs(rm.page, 'scene (reduced motion)', ['v4', 'town4', 'forwards', 'panel4'])) {
      await walkView(rm.page);
      await rm.page.evaluate(() => { window.__game.town.open('builder'); T.b().focus('forge'); });
      await frames(rm.page, 3);
      await rm.page.keyboard.press('Enter');
      await frames(rm.page, 2);
      const r = await rm.page.evaluate(watchScene, null);
      const stages = [];
      for (const q of r.rows) if (stages[stages.length - 1] !== q.stage) stages.push(q.stage);
      const want4 = [];
      for (let t = 0; t <= 5.0001; t += 0.05) {
        const s = BS.stageAt(t, 'new', true);
        if (want4[want4.length - 1] !== s.stage) want4.push(s.stage);
      }
      const camMoves = r.rows.slice(2).map((q, i) => Math.hypot(q.cam[0] - r.rows[i + 1].cam[0], q.cam[1] - r.rows[i + 1].cam[1], q.cam[2] - r.rows[i + 1].cam[2]));
      const lastT = r.rows.length ? r.rows[r.rows.length - 1].t : 0;
      check(stages.join() === want4.join() && want4.length === 4 && lastT > 4.7 && lastT <= 5.0 + 1e-6 && Math.max(0, ...camMoves) < 0.02,
        `scene (reduced motion): four stills (${stages.join(' → ')}) over ${lastT.toFixed(2)} s of the scene's 5.0 s, the camera still (largest move a frame ${Math.max(0, ...camMoves).toFixed(3)} u: a cut, no glide, no orbit)`);
    }
    await rm.ctx.close();
    // portrait: the panel folds to the 56 px bar and the plot stays in view above it
    const tp = await open({ touch: true, width: 390, height: 844, label: 'scene-phone', store: SCENE_STORE, crowd: true });
    if (!(await needs(tp.page, 'scene (portrait)', ['v4', 'town4', 'forwards', 'panel4']))) return;
    await walkView(tp.page);
    await tp.page.evaluate(() => { window.__game.town.open('builder'); T.b().focus('forge'); });
    await frames(tp.page, 3);
    await tp.page.evaluate(() => T.b().build('forge'));
    const foldPart = (stopT) => tp.page.evaluate(async (stopT) => {
      const G = window.__game;
      const out = [];
      for (let k = 0; k < 3000; k++) {
        const s = G.env.scene;
        if (!s || !s.running || s.skipping || s.t >= stopT) break;
        if (s.t > 1.2 && s.info && s.info.frame) {
          const panel = document.getElementById('build-panel').getBoundingClientRect();
          const strip = document.getElementById('build-scene').getBoundingClientRect();
          const barTop = Math.min(panel.height > 0 ? panel.top : Infinity, strip.height > 0 ? strip.top : Infinity);
          const F = s.info.frame;
          const pts = [[F.pad[0], F.pad[1], F.pad[2]], [F.porch[0], F.porch[1], F.porch[2]], [F.porch[0], F.porch[1] + 2.1, F.porch[2]], [F.pad[0], F.top, F.pad[2]]];
          const sp = pts.map((p) => T.toScreen(p[0], p[1], p[2]));
          const worst = Math.max(...sp.map((q) => (q ? q.y : Infinity)));
          const off = sp.some((q) => !q || q.x < 0 || q.x > innerWidth || q.y < 0);
          out.push({ t: +s.t.toFixed(2), panelH: +panel.height.toFixed(1), stripH: +strip.height.toFixed(1), barTop: +barTop.toFixed(1), worst: +worst.toFixed(1), off, folded: G.town.api.build.folded });
        }
        await new Promise((r) => requestAnimationFrame(r));
      }
      return out;
    }, stopT);
    const fold = await foldPart(4.4);
    await snap(tp.page, 'scene-phone.png').catch(() => {});
    fold.push(...(await foldPart(99)));
    const bad = fold.filter((f) => !f.folded || f.panelH > 56.5 || f.stripH > 56.5 || f.worst >= f.barTop || f.off);
    check(fold.length > 10 && bad.length === 0, `scene (portrait 390×844): the sheet folds to the 56 px bar (${fold.length ? `${Math.max(...fold.map((f) => f.panelH))} / ${Math.max(...fold.map((f) => f.stripH))} px` : '?'}) and the plot stays above it every frame (its lowest point at ${fold.length ? Math.max(...fold.map((f) => f.worst)) : '?'} px, the bar's top at ${fold.length ? Math.min(...fold.map((f) => f.barTop)) : '?'} px; ${fold.length} frames)${bad.length ? ' -> ' + J(bad.slice(0, 4)) : ''}`);
    await tp.ctx.close();
  });

  // ----------------------------------------------------------------------------------------------------- panel
  // Bess's panel with 21 plots (§8.6, §10.2): the four district tabs at the 7 sizes, the 320×480 row height, the
  // not-on-sale reasons, storage full, two tabs, an older tab rewriting the feats.
  await section('panel', async () => {
    const PSTORE = { ...STORE, 'pirates-ahoy-purse': '20000', 'pirates-ahoy-island': island({ homeA: 1, bakery: 2 }), 'pirates-ahoy-island4': island4({ homeE: 1, forge: 1 }) };
    for (const touch of [true, false]) {
      const { ctx, page } = await open({ touch, width: touch ? 390 : 1280, height: touch ? 844 : 720, label: touch ? 'panel-touch' : 'panel', store: PSTORE });
      if (!(await needs(page, 'panel', ['v4', 'town4', 'panel4']))) return;
      await page.evaluate(probes);
      for (const [w, h] of TOWN_SIZES.filter((s) => s[2] === touch)) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [w, h], { timeout: 60000 });
        await walkView(page);
        await page.evaluate(() => window.__game.town.open('builder'));
        await frames(page, 3);
        const r = await page.evaluate(() => {
          T.finish(); // (the sheet's slide-in, done)
          const tl = document.querySelector('#build-panel [role="tablist"]');
          const tabs = [...document.querySelectorAll('#build-panel [role="tab"]')].filter((t) => T.shown(t));
          const out = [];
          for (const t of tabs) window.__probe.reach(t, out, document.getElementById('build-panel'));
          const counts = window.__game.town.api.build.tabs.map((T0) => `${T0.id}:${T0.plots.length}`);
          return { tablist: !!tl, ids: tabs.map((t) => t.id), names: tabs.map((t) => T.text(t)), counts, problems: out, scroll: window.__probe.pageScroll(), panel: window.__probe.panel('build-panel').problems };
        });
        check(r.tablist && r.ids.join() === 'build-tab-windmill,build-tab-lantern,build-tab-lighthouse,build-tab-beach' && r.counts.join() === 'windmill:6,lantern:6,lighthouse:5,beach:4' && r.problems.length === 0 && r.panel.length === 0 && !r.scroll,
          `panel ${w}x${h}${touch ? ' touch' : ''}: the four district tabs (${r.names.join(' | ')}; ${r.counts.join(', ')}) on screen, ≥ 44 px, every control reachable, no page scroll${r.problems.length || r.panel.length ? ' -> ' + [...r.problems, ...r.panel].slice(0, 6).join('; ') : ''}${r.scroll ? ' -> ' + r.scroll : ''}`);
        if (!touch && w === 1280) {
          // ← → Home End move between the tabs
          await page.evaluate(() => document.getElementById('build-tab-windmill').focus());
          const seq = [];
          for (const k of ['ArrowRight', 'ArrowRight', 'End', 'Home', 'ArrowLeft']) {
            await page.keyboard.press(k);
            seq.push(await page.evaluate(() => `${T.focus()}/${window.__game.town.api.build.tab}`));
          }
          check(seq.join() === 'build-tab-lantern/lantern,build-tab-lighthouse/lighthouse,build-tab-beach/beach,build-tab-windmill/windmill,build-tab-beach/beach', `panel: → → End Home ← move between the district tabs (${seq.join(', ')})`);
        }
        if (w === 320) {
          // at 320×480 a built row (with its inline Watch again) is no taller than today's row
          const rh = await page.evaluate(() => {
            T.b().focus('homeA');
            const row = document.querySelector('#build-panel button[data-plot="homeA"]').closest('li, .build-row, [data-plot]:not(button)');
            const watch = row.querySelector('.b-watch');
            const main = row.querySelector('button[data-plot]');
            return { h: row.offsetHeight, watch: !!watch && T.shown(watch), wh: watch ? watch.offsetHeight : 0, mh: main.offsetHeight, ww: watch ? watch.offsetWidth : 0 };
          });
          let today = TODAY_ROW_320;
          let measured = 'Stage 2';
          const off = await open({ touch: true, width: 320, height: 480, label: 'panel-flag-off', query: QUERY.replace(/[?&]v4=1/, '').replace(/^&/, '?') || '?quality=low', store: { ...PSTORE } }).catch(() => null);
          if (off) {
            const t = await off.page.evaluate(() => {
              if (window.__game.voyage.WITH_V4) return null;
              T.walkView();
              window.__game.town.open('builder');
              window.__game.town.api.build.focus('homeA');
              const row = document.querySelector('#build-panel button[data-plot="homeA"]').closest('li, .build-row, [data-plot]:not(button)');
              return row.offsetHeight;
            });
            if (t) {
              today = t;
              measured = 'today, measured now on the flag-off game';
            }
            await off.ctx.close();
          }
          check(rh.watch && rh.h <= today + 0.5 && rh.wh <= rh.mh + 0.5 && rh.ww >= 44 && rh.wh >= 44, `panel 320x480: a built row with Watch again inline (${rh.ww}x${rh.wh} beside a ${rh.mh} px button) is ${rh.h} px tall, no taller than today's row (${today} px, ${measured})`);
        }
        await page.evaluate(() => window.__game.town.back());
      }
      await ctx.close();
    }
    // the not-on-sale reasons (before the Kraken's Deep, no capture yet)
    const early = await open({ label: 'panel-early', store: { ...STORE, 'pirates-ahoy-unlocked': '9', 'pirates-ahoy-feats': feats({ captures: 0, kraken: 0, legend: 0, shell: 0, island: 0, island4: 0 }), 'pirates-ahoy-voyage4': voyage4({ won: 0 }) } });
    if (await needs(early.page, 'panel (not on sale)', ['v4', 'town4', 'panel4'])) {
      await walkView(early.page);
      await early.page.evaluate(() => window.__game.town.open('builder'));
      const ns = await early.page.evaluate(() => {
        const out = {};
        for (const id of ['forge', 'observatory', 'museum', 'aquarium', 'grotto', 'homeE']) {
          const b = document.querySelector(`#build-panel button[data-plot="${id}"]`);
          const row = T.b().rows.find((r) => r.id === id);
          const desc = b.getAttribute('aria-describedby');
          out[id] = { state: row.state, disabled: row.disabled, why: row.why, desc: desc ? desc.split(' ').map((d) => T.text(d)).join(' ') : '' };
        }
        const p0 = window.__game.state.purse;
        T.b().focus('forge');
        return { rows: out, p0 };
      });
      await early.page.keyboard.press('Enter');
      const after = await early.page.evaluate(() => ({ purse: window.__game.state.purse, t: window.__game.island4.config.t.forge, live: T.text('build-live'), scene: !!window.__game.env.scene }));
      const want = { forge: "Opens after The Kraken's Deep", observatory: "Opens after The Kraken's Deep", museum: 'Opens after your first capture', aquarium: 'Opens after Misty Mangroves', grotto: 'Opens after The Sunken Spires' };
      const bad = Object.entries(want).filter(([id, why]) => !(ns.rows[id].disabled && ns.rows[id].why.includes(why) && ns.rows[id].desc.includes(why)));
      check(bad.length === 0 && !ns.rows.homeE.disabled && after.purse === ns.p0 && after.t === 0 && !after.scene && /isn't open yet/.test(after.live), `panel: not on sale: ${Object.entries(want).map(([id, w]) => `${id} "${ns.rows[id].why}"`).join(', ')} (aria-disabled, the reason as its description); Enter on the Forge buys nothing ("${after.live}")${bad.length ? ' -> ' + J(bad.map(([id]) => ns.rows[id])) : ''}`);
    }
    await early.ctx.close();
    // storage full: refused at no cost, for a new plot and a SPEC3 plot
    const full = await open({ label: 'panel-full', store: PSTORE });
    if (await needs(full.page, 'panel (storage full)', ['v4', 'town4', 'panel4'])) {
      await walkView(full.page);
      await full.page.evaluate(() => window.__game.town.open('builder'));
      const sf = await full.page.evaluate(() => {
        const G = window.__game;
        const out = [];
        for (const [id, key] of [['farm', 'pirates-ahoy-island4'], ['school', 'pirates-ahoy-island']]) {
          T.block(key);
          const p0 = G.state.purse;
          const c0 = T.stored('pirates-ahoy-purse');
          const r0 = T.stored(key);
          T.b().build(id);
          const row = T.b().rows.find((r) => r.id === id);
          out.push({ id, purse: G.state.purse - p0, chest: T.stored('pirates-ahoy-purse') === c0, rec: T.stored(key) === r0, scene: !!(G.env.scene && G.env.scene.running), live: T.text('build-live'), button: row.button });
          T.unblock();
        }
        return out;
      });
      check(sf.every((r) => r.purse === 0 && r.chest && r.rec && !r.scene && r.live === "Couldn't save: your browser's storage is full or switched off. Nothing was paid." && /Couldn't save/.test(r.button)), `panel: storage full refuses at no cost, a new plot and a SPEC3 plot alike: ${sf.map((r) => `${r.id}: gold ${r.purse}, no scene, "${r.button}"`).join('; ')}; "${sf[0].live}"`);
    }
    await full.ctx.close();
    // two tabs: each tab's island4 build shows in the other; the merge keeps each plot's larger tier
    const A = await open({ label: 'tab-A', store: { ...PSTORE, 'pirates-ahoy-island4': island4({ forge: 2 }) } });
    const B = await open({ label: 'tab-B', ctx: A.ctx, store: null });
    if ((await needs(A.page, 'panel (two tabs)', ['v4', 'town4', 'panel4'])) && (await needs(B.page, 'panel (two tabs)', ['v4', 'town4', 'panel4']))) {
      for (const p of [A.page, B.page]) await walkView(p);
      const until = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 120000, polling: 250 }).catch(() => {});
      await A.page.evaluate(() => { window.__game.town.open('builder'); T.b().build('homeE'); T.b().skip(); });
      await until(B.page, () => window.__game.island4.config.t.homeE === 1);
      const b1 = await B.page.evaluate(() => ({ t: window.__game.island4.config.t, plot: window.__game.env.plots.find((p) => p.id === 'homeE').tier }));
      // B, still at forge 2 in its own memory? no: B read 2 at load; A raises forge to 3 while B builds the farm
      await A.page.evaluate(() => { T.b().build('forge'); T.b().skip(); });
      await B.page.evaluate(() => { window.__game.town.open('builder'); T.b().build('farm'); T.b().skip(); });
      await until(A.page, () => window.__game.island4.config.t.farm === 1);
      await until(B.page, () => window.__game.island4.config.t.forge === 3);
      const stored = JSON.parse(await A.page.evaluate(() => T.stored('pirates-ahoy-island4')));
      const a1 = await A.page.evaluate(() => window.__game.island4.config.t);
      const b2 = await B.page.evaluate(() => window.__game.island4.config.t);
      check(b1.t.homeE === 1 && b1.plot === 1, `panel (two tabs): the Treehouse built in one tab shows in the other (record ${b1.t.homeE}, the town's tier ${b1.plot})${b1.t.homeE === 1 ? '' : " -> main.js's storage listener does not take -island4 (each tier the larger, SPEC4 §10.2; 3A)"}`);
      check(stored.t.forge === 3 && stored.t.farm === 1 && stored.t.homeE === 1 && a1.forge === 3 && a1.farm === 1 && b2.forge === 3 && b2.farm === 1, `panel (two tabs): island4 tiers merge by the larger, never down (saved ${J(stored.t)}; first tab forge ${a1.forge} farm ${a1.farm}; second tab forge ${b2.forge} farm ${b2.farm})`);
    }
    await A.ctx.close();
    // an older tab (eedb108) rewrites the feats without shell, island4 or the new prizes: this tab re-derives them
    const N = await open({ label: 'tab-new', store: { ...PSTORE, 'pirates-ahoy-island4': island4({ forge: 3, homeE: 2 }), 'pirates-ahoy-voyage4': voyage4({ won: 1, prizes: { stinger: 2, witch: 1 } }), 'pirates-ahoy-feats': feats({ island: 3, island4: 5, shell: 1, prizes: { cutter: 1, stinger: 2, witch: 1 } }) } });
    const O = await open({ label: 'tab-old', ctx: N.ctx, store: null, query: '?quality=low' });
    if (await needs(N.page, 'panel (older tab)', ['v4', 'town4'])) {
      await walkView(N.page);
      const before = await N.page.evaluate(() => window.__game.feats);
      // what eedb108's parseFeats keeps and writes back: no shell, no island4, only the old prize kinds
      await O.page.evaluate(() => {
        const old = JSON.parse(localStorage.getItem('pirates-ahoy-feats'));
        delete old.shell;
        delete old.island4;
        for (const k of ['stinger', 'netsloop', 'witch']) if (old.prizes) delete old.prizes[k];
        localStorage.setItem('pirates-ahoy-feats', JSON.stringify(old));
      });
      await N.page.waitForFunction(() => { const s = JSON.parse(localStorage.getItem('pirates-ahoy-feats')); return s.island4 === 5 && s.shell === 1 && s.prizes && s.prizes.stinger === 2; }, null, { timeout: 120000, polling: 250 }).catch(() => {});
      const after = await N.page.evaluate(() => ({ feats: window.__game.feats, stored: JSON.parse(T.stored('pirates-ahoy-feats')) }));
      check(before.island4 === 5 && after.feats.island4 === 5 && after.feats.shell === 1 && after.feats.prizes.stinger === 2 && after.feats.prizes.witch === 1 && after.stored.island4 === 5 && after.stored.shell === 1 && after.stored.prizes.stinger === 2 && after.stored.prizes.witch === 1,
        `panel (older tab): an older tab rewrites the feats without them; this tab re-derives island4 ${after.stored.island4}, shell ${after.stored.shell} and the new prizes ${J(after.stored.prizes)} and saves them back${after.stored.island4 === 5 ? '' : " -> main.js does not re-derive the feats after a sync (raiseRecordFeats extended, SPEC4 §10.2; 3A)"}`);
      // and at its next load
      await N.page.evaluate(() => { const s = JSON.parse(localStorage.getItem('pirates-ahoy-feats')); delete s.island4; delete s.shell; localStorage.setItem('pirates-ahoy-feats', JSON.stringify(s)); });
      await N.page.reload({ waitUntil: 'domcontentloaded', timeout: LOAD_TIMEOUT });
      await N.page.waitForFunction(() => window.__gameReady === true && window.__game && window.__game.env, null, { timeout: LOAD_TIMEOUT });
      const re = await N.page.evaluate(() => JSON.parse(localStorage.getItem('pirates-ahoy-feats')));
      check(re.island4 === 5 && re.shell === 1, `panel (older tab): at the next load too the feats regain island4 ${re.island4} and shell ${re.shell} from the island4 and voyage4 records`);
    }
    await N.ctx.close();
  });

  // ---------------------------------------------------------------------------------------------------- camera
  // The walk camera on every porch (§6.3, §13.2) and the shipyard showcase ray probe (SPEC3 §8.1) with every plot at 3.
  await section('camera', async () => {
    const { ctx, page } = await open({ label: 'camera', store: FULL, reduced: true });
    if (!(await needs(page, 'camera', ['v4', 'town4']))) return;
    await walkView(page);
    const porch = await page.evaluate(() => {
      const G = window.__game;
      const w = G.env.walk;
      const boxes = w.camBlockers.filter((b) => b.plot || b.pad);
      const tw = T.town();
      const out = [];
      const inBox = (p) => boxes.filter((b) => {
        if (p.y < b.y0 || p.y > b.y1) return false;
        if (b.r) return Math.hypot(p.x - b.x, p.z - b.z) < b.r;
        const dx = p.x - b.x;
        const dz = p.z - b.z;
        const co = Math.cos(b.ry || 0);
        const si = Math.sin(b.ry || 0);
        return Math.abs(dx * co - dz * si) < b.w / 2 && Math.abs(dx * si + dz * co) < b.d / 2;
      }).map((b) => b.plot || b.pad);
      for (const p of w.places.filter((q) => q.id.startsWith('plot:'))) {
        for (let k = 0; k < 8; k++) {
          const h = (k * Math.PI) / 4;
          const s = tw.walk.snap(p.x, p.z, 1) || p;
          tw.enter({ x: s.x, z: s.z, h });
          tw.recenter();
          // he stands there facing h: the camera settles (it swings round to a clear side and lets its boom out at
          // town.js's own pace, 2 /s); the boom read once settled, 3 s on (at 0.8 s it may still be letting out)
          G.town.simulate(0.8, { x: 0, z: 0 });
          const early = tw.camera.boom * (innerHeight > innerWidth ? 7.5 : 6.5);
          G.town.simulate(2.2, { x: 0, z: 0 });
          const cam = G.camera.position;
          const c = T.pos();
          // the boom (town.js: the lens sits boom × dist behind the point it looks at, the captain where he stands; dist
          // 6.5 u on a wide screen); when it is shorter than 2.5 u, what a 2.5 u boom would have put the lens in
          const L = tw.camera.boom * (innerHeight > innerWidth ? 7.5 : 6.5);
          const dx = cam.x - c.x;
          const dy = cam.y - c.y;
          const dz = cam.z - c.z;
          const d = Math.hypot(dx, dy, dz) || 1;
          const at25 = { x: c.x + (dx / d) * 2.5, y: c.y + (dy / d) * 2.5, z: c.z + (dz / d) * 2.5 };
          const inAny = (q) => w.camBlockers.filter((b) => {
            if (q.y < b.y0 || q.y > b.y1) return false;
            if (b.r) return Math.hypot(q.x - b.x, q.z - b.z) < b.r;
            const ex = q.x - b.x;
            const ez = q.z - b.z;
            const co = Math.cos(b.ry || 0);
            const si = Math.sin(b.ry || 0);
            return Math.abs(ex * co - ez * si) < b.w / 2 && Math.abs(ex * si + ez * co) < b.d / 2;
          }).map((b) => b.plot || b.pad || b.moored || b.name || b.kind || `box@${b.x.toFixed(1)},${b.z.toFixed(1)}`);
          out.push({ place: p.id, h: k, boom: +L.toFixed(2), at08: +early.toFixed(2), toCap: +d.toFixed(2), inside: inBox(cam), ...(L < 2.5 ? { at25: inAny(at25) } : {}) });
        }
      }
      return { n: out.length, boxes: boxes.length, minBoom: Math.min(...out.map((o) => o.boom)), min08: Math.min(...out.map((o) => o.at08)), worst: out.filter((o) => o.boom < 2.5 || o.inside.length).slice(0, 8), lowest: [...out].sort((a, b) => a.boom - b.boom).slice(0, 3) };
    });
    check(porch.n === 21 * 8 && porch.boxes === 21 && porch.worst.length === 0, `camera: from all 21 porches at 8 headings the walk camera is never inside a pad's box (${porch.boxes} boxes) and its boom (town.js's boom × dist, once settled) keeps ≥ 2.5 u (shortest ${porch.minBoom} u: ${J(porch.lowest)}; 0.8 s in, while it still swings and lets out, shortest ${porch.min08} u)${porch.worst.length ? ' -> ' + J(porch.worst) : ''}`);
    // the shipyard showcase ray probe
    await page.evaluate(() => window.__game.dock.open('menu'));
    await page.evaluate(() => { if (window.__game.town.view !== 'shop') window.__game.town.api.showShop(); });
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
          const dirs = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [1, 0.3, 1], [-1, 0.3, 1], [1, 0.3, -1], [-1, 0.3, -1], [0, 1, 1], [0, 1, -1], [0, 0.15, 0.01]];
          const picks = dirs.map(([x, y, z]) => {
            let best = null;
            let bd = -Infinity;
            for (const [wv, l] of pts) {
              const d = (l.x - c.x) * x + (l.y - c.y) * y + (l.z - c.z) * z;
              if (d > bd) {
                bd = d;
                best = wv;
              }
            }
            return best;
          });
          const boxes = G.env.walk.camBlockers.filter((b) => b.plot || b.pad);
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
                const id = b.plot || b.pad;
                if (Math.abs(dx * co - dz * si) < b.w / 2 && Math.abs(dx * si + dz * co) < b.d / 2 && !hits.includes(id)) hits.push(id);
              }
            }
          }
          return { cam: [+cam.x.toFixed(1), +cam.y.toFixed(1), +cam.z.toFixed(1)], points: picks.filter(Boolean).length, boxes: boxes.length, hits };
        })) });
      }
    }
    const bad = out.filter((o) => o.hits.length || o.points !== 12 || o.boxes !== 21);
    const poses = new Set(out.map((o) => o.cam.join()));
    check(out.length === 18 && bad.length === 0 && poses.size >= 3, `camera: from ${poses.size} showcase poses at the 6 shipyard sizes, rays to 12 points of the docked ship cross none of the 21 tier-3 pads' boxes${bad.length ? ' -> ' + J(bad) : ''}`);
    await ctx.close();
  });

  // ----------------------------------------------------------------------------------------------------- draws
  // §14.2's budgets with every plot at tier 3, the crowd at its cap and every animal out; the dock frame's triangles
  // (§19 S0-D2); the screenshots.
  await section('draws', async () => {
    const S0 = { fresh: 1479588, built3: 1586020, walk: 401, panorama: 410, shipyard: '308–315' };
    // the dock frame on a fresh save (no plot built): ≤ 1.75 M triangles
    const fr = await open({ label: 'draws-fresh', store: { ...STORE, 'pirates-ahoy-feats': feats({ island: 0, island4: 0, shell: 0 }), 'pirates-ahoy-voyage4': voyage4({ won: 0 }) }, crowd: true });
    let fresh = null;
    if (await needs(fr.page, 'draws (fresh save)', ['v4', 'town4'])) {
      await frames(fr.page, 10);
      fresh = await fr.page.evaluate(async () => {
        const out = [];
        for (let i = 0; i < 6; i++) {
          await T.frames(4);
          out.push(window.__game.renderInfo.triangles);
        }
        return Math.max(...out);
      });
      check(fresh > 0 && fresh <= 1750000, `draws: the dock frame on a fresh save: ${fresh.toLocaleString('en')} triangles ≤ 1.75 M (§19 S0-D2; Stage 0's ${S0.fresh.toLocaleString('en')})`);
    }
    await fr.ctx.close();
    const { ctx, page } = await open({ label: 'draws', store: { ...FULL, 'pirates-ahoy-feats': feats({ prizes: { galleon: 1, manowar: 2, cutter: 1 } }) }, crowd: true });
    if (!(await needs(page, 'draws', ['v4', 'town4', 'forwards', 'islanders', 'critters']))) return;
    const calls = () => page.evaluate(() => window.__game.renderInfo.calls);
    await frames(page, 20);
    const yard = [];
    const tris = [];
    for (let i = 0; i < 12; i++) {
      await frames(page, 6);
      const r = await page.evaluate(() => window.__game.renderInfo);
      yard.push(r.calls);
      tris.push(r.triangles);
    }
    const env0 = await page.evaluate(() => ({ plots: window.__game.env.plots.map((p) => p.tier).join(''), npcs: window.__game.env.folk().filter((f) => f.npc).length, islanders: window.__game.env.v4.folk.people.length, animals: window.__game.env.critters.list.length }));
    check(env0.plots === '333333333333333333333' && Math.max(...yard) <= 450 && Math.min(...yard) > 0, `draws: the shipyard view with all 21 plots at tier 3 (${env0.islanders} islanders and ${env0.animals} animals out, hidden there): ${Math.min(...yard)}–${Math.max(...yard)} draw calls ≤ 450 (Stage 0's ${S0.shipyard})`);
    check(Math.max(...tris) <= 2000000, `draws: the dock frame fully built: ${Math.max(...tris).toLocaleString('en')} triangles ≤ 2.0 M (§19 S0-D2; Stage 0's ${S0.built3.toLocaleString('en')} with the ten SPEC3 plots at tier 3${fresh ? `; fresh save ${fresh.toLocaleString('en')}` : ''})`);
    // the walk view: today's 30 spots (tests/ashore.cjs's, from today's walk) plus the new places, 48 spots × 8 headings
    await page.evaluate(() => window.__game.dock.ashore());
    await frames(page, 10);
    if (!skipped('walk48', 'draws: the town walk view at 48 spots × 8 headings')) {
    const today = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sparrow-walk.json'), 'utf8'));
    const cand = (w) => {
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
      for (const l of w.links || []) {
        const m = l.pts[Math.floor(l.pts.length / 2)];
        pts.push([m[0], m[2]]);
      }
      return [...pts, ...more];
    };
    const spotSet = await page.evaluate(([old, named]) => {
      const G = window.__game;
      const t = G.town.api.town;
      const w = G.env.walk;
      const link = (id) => { const l = w.links.find((q) => q.id === id); return l ? [l.pts[Math.floor(l.pts.length / 2)][0], l.pts[Math.floor(l.pts.length / 2)][2]] : null; };
      const want = [
        ['the hilltop', [2, -51.6]],
        ["the hill's shoulder", [7.4, -50.4]],
        ['Sunset Beach', [-37.18, -26.57]],
        ["Fisher's Pier's end", [46.3, -13.5]],
        ["the Long Walk's middle", link('s11S17')],
        ['the High Walk', link('s3S12')],
        ['the High Walk (east)', link('s12S5')],
        ['Lighthouse Walk', link('s9S18')],
      ];
      const got = [];
      const names = [];
      const add = (x, z, name) => {
        const s = t.walk.snap(x, z, 3);
        if (!s) return false;
        if (got.some((g) => Math.hypot(g[0] - s.x, g[1] - s.z) < 1.8)) return false;
        got.push([+s.x.toFixed(2), +s.z.toFixed(2)]);
        names.push(name);
        return true;
      };
      let n30 = 0;
      for (const [x, z] of old) if (n30 < 30 && add(x, z, 'today')) n30++;
      for (const [name, p] of want) if (p) add(p[0], p[1], name);
      for (const [x, z] of named) {
        if (got.length >= 48) break;
        add(x, z, 'new');
      }
      return { got, names, n30 };
    }, [cand(today), cand(await page.evaluate(() => window.__game.env.walk))]);
    const view = async (w, h) => {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [w, h], { timeout: 60000 });
    };
    const look = async ([x, z, h]) => {
      await page.evaluate(([x, z, h]) => { window.__game.town.api.town.enter({ x, z, h }); window.__game.town.simulate(0.6, { x: 0, z: 0 }); }, [x, z, h]);
      await frames(page, 2);
      return page.evaluate(() => window.__game.renderInfo);
    };
    await view(320, 180);
    const town = [];
    for (const [x, z] of spotSet.got) for (let k = 0; k < 8; k++) { const r = await look([x, z, (k * Math.PI) / 4]); town.push({ at: [x, z, (k * Math.PI) / 4], calls: r.calls, tris: r.triangles }); }
    await view(1280, 720);
    const busiest = [...town].sort((a, b) => b.calls - a.calls).slice(0, 8);
    const big = [];
    for (const v of busiest) big.push((await look(v.at)).calls);
    const small = town.map((v) => v.calls);
    const worst = Math.max(...small, ...big);
    const named = spotSet.names.filter((n) => n !== 'today' && n !== 'new');
    check(spotSet.got.length === 48 && spotSet.n30 === 30 && named.length === 8 && town.length === 384 && worst <= 450 && Math.min(...small, ...big) > 0,
      `draws: the town walk view at 48 spots × 8 headings (today's 30, ${named.join(', ')}, and ${spotSet.got.length - 30 - named.length} more on the new decks; the zip line is not built, §17): max ${Math.max(...small)}, mean ${(small.reduce((a, b) => a + b, 0) / small.length).toFixed(0)}; the 8 busiest again at 1280 × 720: ${big.join(', ')} (${busiest.map((v) => `${v.calls}@${v.at[0]},${v.at[1]}`).join(' ')}); all ≤ 450 (Stage 0's worst ${S0.walk}); triangles up to ${Math.max(...town.map((v) => v.tris)).toLocaleString('en')}`);
    }
    // the lookout panorama, 8 headings
    const pano = await page.evaluate(async () => {
      const G = window.__game;
      if (!G.town.lookout(true)) return null;
      await T.until(() => G.town.api.lookoutState && G.town.api.lookoutState.phase === 'on', 900);
      const out = [];
      for (let k = 0; k < 8; k++) {
        await T.frames(3);
        out.push(G.renderInfo.calls);
        G.town.api.town.lookoutTurn(Math.PI / 4);
      }
      G.town.lookout(false);
      await T.until(() => G.town.view === 'town', 900);
      return out;
    });
    check(!!pano && pano.length === 8 && Math.max(...pano) <= 450, `draws: the lookout panorama at 8 headings: ${pano ? pano.join(', ') : 'no lookout'} ≤ 450 (Stage 0's panorama baseline ${S0.panorama})`);
    // the build view during a construction scene (Watch again on the Forge: tier 2 → 3)
    const sc = await page.evaluate(async () => {
      const G = window.__game;
      T.walkView();
      G.town.open('builder');
      T.b().focus('forge');
      await T.frames(30);
      T.b().watch('forge');
      const out = [];
      for (let k = 0; k < 3000 && G.env.scene && G.env.scene.running; k++) {
        await T.frames(1);
        if (k % 3 === 0) out.push(G.renderInfo.calls);
      }
      G.town.back();
      return out;
    });
    check(sc.length > 10 && Math.max(...sc) <= 450, `draws: the build view during the Forge's scene: ${sc.length ? `${Math.min(...sc)}–${Math.max(...sc)}` : 'no scene'} draw calls ≤ 450 (${sc.length} samples; §5.3 plans ≈ 145)`);
    await ctx.close();
  });

  // ----------------------------------------------------------------------------------------------------- shots
  // the screenshots (§13.2): one per district at its hop point, and the crowd (apart from draws, so they can be
  // taken again quickly: node tests/isle4.cjs shots)
  await section('shots', async () => {
    const { ctx, page } = await open({ label: 'shots', store: { ...FULL, 'pirates-ahoy-feats': feats({ prizes: { galleon: 1, manowar: 2, cutter: 1 } }) }, crowd: true });
    if (!(await needs(page, 'shots', ['v4', 'town4', 'forwards', 'islanders', 'critters']))) return;
    for (const D of ['harbour', 'windmill', 'lantern', 'lighthouse', 'beach', 'hill']) {
      await page.evaluate(async (D) => {
        const G = window.__game;
        T.walkView();
        G.town.hop(`hop:${D}`);
        await T.until(() => !G.town.api.fading, 900);
        G.town.simulate(1.0, { x: 0, z: 0 });
        await T.frames(3);
      }, D);
      await snap(page, `district-${D}.png`).catch(() => {});
    }
    // crowd.png: the busiest view of people (islanders, villagers, Bess and Barnacle, animals) on screen within 16 u,
    // chosen from 6 crowded spots × 8 headings
    const crowdAt = await page.evaluate(async () => {
      const G = window.__game;
      T.walkView();
      const env = G.env;
      const spots = [[0.4, -10.9], [-4.6, -27.6], [-17.4, -15.0], [-14.4, -7.6], [9.5, -24.5], [-20.2, -27.2]];
      let best = null;
      for (const [x, z] of spots) {
        for (let k = 0; k < 8; k++) {
          const h = (k / 8) * Math.PI * 2;
          T.at(x, z, h);
          G.town.simulate(0.5, { x: 0, z: 0 });
          const c = G.camera.position;
          const who = [...env.folk(), ...((env.critters && env.critters.list) || [])].filter((f) => f && Number.isFinite(f.x) && f.drawn !== false && Math.hypot(f.x - c.x, f.z - c.z) < 16);
          let n = 0;
          for (const f of who) {
            const q = T.toScreen(f.x, (f.y || 1.3) + 0.7, f.z);
            if (q && q.x > 0 && q.x < innerWidth && q.y > 60 && q.y < innerHeight - 70) n++;
          }
          if (!best || n > best.n) best = { x, z, h: +h.toFixed(2), n };
        }
      }
      T.at(best.x, best.z, best.h);
      G.town.simulate(1.0, { x: 0, z: 0 });
      await T.frames(3);
      return best;
    });
    await snap(page, 'crowd.png').catch(() => {});
    const crowd = await page.evaluate(() => ({ calls: window.__game.renderInfo.calls, drawn: window.__game.env.v4.drawn ? window.__game.env.v4.drawn.size : null }));
    console.log(`     (crowd.png: ${crowdAt.n} people and animals on screen at (${crowdAt.x}, ${crowdAt.z}) heading ${crowdAt.h}; ${crowd.calls} draw calls, ${crowd.drawn} people drawn)`);
    await ctx.close();
  });

  console.log(`\nerrors: ${errors.length ? errors.join('\n') : 'none'}`);
  check(errors.length === 0, `no page errors (${errors.length})`);
  console.log(`\ntimes: ${Object.entries(timings).map(([k, v]) => `${k} ${v.toFixed(1)} s`).join(', ')}`);
  await browser.close();
  server.close();
  console.log(`\nisle4.cjs: ${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
