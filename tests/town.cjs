// The walkable town (SPEC2 §11.3, tests/town.cjs): serves the game, drives Sparrow's Floating Island in headless
// Chromium through the real controls and the window.__game test API (§9.3), and checks
// - going ashore from the shipyard (the captain at the spawn, the camera behind him, focus and the live text),
//   Shift+Tab to the Go ashore button, the town's Shipyard place back to the shop ("Back to town")
// - walking: WASD and the arrows camera-relative, Shift sprints, 30 s of random keys and taps never leave the
//   walk, the tavern building blocks
// - the places: each places-bar button walks there and opens it, a move key cancels the auto-walk, E opens a
//   place (Enter / Space too, when no button is focused), P / Esc open the Harbour menu (a labelled modal, Tab
//   trapped, focus returned, Esc closes), All aboard? offers and does what the shipyard's ways out do
// - touch: the stick, tap-to-walk, the Go in button, 44 px controls, the portrait walk lens
// - Polly's wardrobe: wearing, try-on and its revert, buying (saved, worn), too poor (aria-disabled, the reason,
//   focus kept), a double-click buys once, trophies, Surprise me!, Match the ship's paint, the cleaning crew
// - the tavern: Boarding party raises the crew at the next level, Long grapples coil on the rail, the rumour
//   board, the captain's log; the captain's look at the helm and in the boarding party
// - saved records: corrupt look / feats / armory / tips fall back and are rewritten; storage blocked still works
// - layout at the 7 town sizes (town HUD, wardrobe, tavern, dialogs: no page scroll, nothing overlapping,
//   44 px, small text 4.5:1), draw calls in the walk view at 6 spots and at Polly's, a lost graphics context,
//   M mutes; screenshots town.png, tailor.png, tavern.png
// - the Stage 4 review's fixes (review4, review4-world): E at a door and focus off the HUD buttons, held Enter /
//   Space (tavern door, gangplank, Back to town), the prompt's focus and name, try-on scrolling, simulate()'s
//   greeting; the rope bridges, walkers waiting for the captain, the market awnings, the seam planks, and what
//   tavern buys, Go ashore and Polly's crew clicks rebuild
// Walking is stepped with __game.town.simulate() (fixed steps, no rendering) inside one evaluate, so the real
// loop never moves the captain in between; keys go through the game's own handlers. Run with `npm test` or
// `npm run test:town` (TOWN_ONLY=ashore,walk,places,touch,wardrobe,tavern,records,layout,draws,review4,review4-world
// runs some sections; TOWN_ROOT serves another copy of the game).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('./server.cjs');

const ROOT = process.env.TOWN_ROOT || path.join(__dirname, '..');
const OUT = process.env.SCREENSHOT_DIR || path.join(ROOT, 'tests', 'screenshots');
const ONLY = (process.env.TOWN_ONLY || '').split(',').filter(Boolean);
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

// Records for a returning player: the tutorial and the one-time tips done, gold in the chest.
const RETURNING = {
  'pirates-ahoy-unlocked': '3',
  'pirates-ahoy-tutorial-done': '1',
  'pirates-ahoy-tips': '255',
  'pirates-ahoy-purse': '1000',
};

// ---------------------------------------------------------------------------------------------------------
// In-page helpers (installed after every page load as window.T)
// ---------------------------------------------------------------------------------------------------------
function installHelpers() {
  const G = window.__game;
  const T = {
    town: () => G.town.api.town,
    walk: () => G.town.api.town.walk,
    key(key, code, { type = 'keydown', shift = false, repeat = false } = {}) {
      const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : window;
      target.dispatchEvent(new KeyboardEvent(type, { key, code, shiftKey: shift, repeat, bubbles: true, cancelable: true }));
    },
    down: (key, code, shift = false) => T.key(key, code, { shift }),
    up: (key, code, shift = false) => T.key(key, code, { type: 'keyup', shift }),
    // where the camera looks, flat on the ground (a unit vector)
    camFwd() {
      const d = G.camera.getWorldDirection(new G.camera.position.constructor());
      const L = Math.hypot(d.x, d.z) || 1;
      return { x: d.x / L, z: d.z / L };
    },
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
    shown: (id) => {
      const el = typeof id === 'string' ? document.getElementById(id) : id;
      return !!el && !el.closest('.hidden') && el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible';
    },
    text: (id) => (document.getElementById(id)?.textContent || '').replace(/\s+/g, ' ').trim(),
    focus: () => {
      const a = document.activeElement;
      return a ? a.id || (a.dataset && (a.dataset.place ? `place:${a.dataset.place}` : a.dataset.item ? `item:${a.dataset.item}` : a.dataset.armory ? `armory:${a.dataset.armory}` : a.dataset.buyItem !== undefined ? `buy:${a.dataset.buyItem}` : '')) || a.tagName : null;
    },
    finish: () => document.getAnimations().forEach((a) => { try { if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch { /* */ } }),
    // the six sailors cleaning the docked ship
    crew() {
      const rig = G.scene.getObjectByName('sparrow-crew');
      return rig ? rig.children.filter((c) => c.userData && c.userData.kind) : [];
    },
    // a person's vertex colours: a hash, and whether one of them is the colour `hex` (sRGB hex -> linear)
    colours(person, hex = null) {
      const body = person.getObjectByName('person-body');
      const col = body && body.geometry.attributes.color;
      if (!col) return { hash: 0, has: false };
      let h = 0;
      for (let i = 0; i < col.array.length; i++) h = (h * 31 + Math.round(col.array[i] * 1000)) | 0;
      let has = false;
      if (hex !== null) {
        const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
        const want = [lin((hex >> 16) & 255), lin((hex >> 8) & 255), lin(hex & 255)];
        const raw = [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
        for (let i = 0; i < col.count && !has; i++) {
          const v = [col.getX(i), col.getY(i), col.getZ(i)];
          if (v.every((x, k) => Math.abs(x - want[k]) < 0.01) || v.every((x, k) => Math.abs(x - raw[k]) < 0.01)) has = true;
        }
      }
      return { hash: h, has };
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
    p.on('console', (m) => m.type() === 'warning' && /^audio:/.test(m.text()) && errors.push(`${label}: ${m.text()}`));
  };
  // A page of the game. store: localStorage records set before the game first loads (not on a reload);
  // init: a script run before the game on every load (e.g. storage blocked).
  async function open({ width = 1280, height = 720, touch = false, query = '?quality=low', store = RETURNING, init = null, label = 'page' } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
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
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage();
    watch(page, label);
    await page.goto(base + query, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__gameReady === true && window.__game && window.__game.env, null, { timeout: 120000 });
    await page.evaluate(installHelpers);
    return { ctx, page };
  }
  const frames = (page, n = 2) =>
    page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  const snap = async (page, name) => {
    await page.evaluate(() => T.finish());
    await page.screenshot({ path: path.join(OUT, name), timeout: SCREENSHOT_TIMEOUT });
  };
  // Walk on (simulated) until the place opens: its view, or the All aboard? dialog.
  const arrive = (page) => page.evaluate(() => {
    const G = window.__game;
    for (let i = 0; i < 80 && G.town.view === 'town' && !T.shown('aboard-dialog'); i++) G.town.simulate(0.5);
    return { view: G.town.view, aboard: T.shown('aboard-dialog'), focus: T.focus() };
  });
  // Ashore on this page, if not yet (a section run on its own).
  const ensureTown = (pg) => pg.evaluate(() => {
    const G = window.__game;
    if (G.state.mode !== 'dock') G.dock.open('menu');
    if (G.town.view !== 'town') {
      if (G.town.view === 'shop') G.dock.ashore();
      else G.town.back();
    }
    return G.town.view;
  });
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

  // --------------------------------------------------------------------------------------------- ashore
  // (one desktop page for going ashore, walking, the places and the dialogs)
  const desk = (ONLY.length === 0 || ['ashore', 'walk', 'places'].some((s) => ONLY.includes(s))) ? await open({ label: 'desktop' }) : null;
  const page = desk && desk.page;

  await section('ashore', async () => {
    await page.click('#menu-dock-btn');
    await page.waitForFunction(() => window.__game.state.mode === 'dock' && document.activeElement && document.activeElement.id === 'dock-tab-up', null, { timeout: 120000 }).catch(() => {});
    const shop = await page.evaluate(() => ({ view: window.__game.dock.view, focus: T.focus(), captain: window.__game.town.captain, label: T.text('dock-ashore-btn'), people: window.__game.env.peopleCount }));
    await page.keyboard.press('Shift+Tab');
    const toBtn = await page.evaluate(() => ({ focus: T.focus(), ring: getComputedStyle(document.activeElement).outlineStyle !== 'none' }));
    check(shop.view === 'shop' && shop.focus === 'dock-tab-up' && shop.captain === null && shop.label === 'Go ashore' && toBtn.focus === 'dock-ashore-btn' && toBtn.ring,
      `the dock opens on the shipyard (no captain built yet); Shift+Tab from the Upgrades tab reaches "Go ashore" (${J({ shop, toBtn })})`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__game.town.view === 'town', null, { timeout: 60000 }).catch(() => {});
    const t = await page.evaluate(() => {
      const G = window.__game;
      const r = { view: G.town.view, mode: G.state.mode, focus: T.focus(), live: T.text('town-live'), town: T.shown('town-screen'), dock: T.shown('dock-screen'), role: document.getElementById('town-screen').getAttribute('role'), label: document.getElementById('town-screen').getAttribute('aria-label') };
      const spawn = G.town.walk.spawn;
      r.pos = T.pos();
      r.spawn = spawn;
      r.captain = !!G.town.captain;
      // the camera once it has settled (the swoop from the shipyard view is over)
      G.town.simulate(0.8, { x: 0, z: 0 });
      G.camera.updateMatrixWorld();
      const c = G.camera.position;
      const p = T.pos();
      const fwd = { x: Math.sin(p.h), z: Math.cos(p.h) };
      const dx = c.x - p.x;
      const dz = c.z - p.z;
      const L = Math.hypot(dx, dz) || 1;
      r.behind = +((dx * fwd.x + dz * fwd.z) / L).toFixed(3);
      r.camDist = +L.toFixed(2);
      return r;
    });
    check(t.view === 'town' && t.mode === 'dock' && t.town && !t.dock && t.captain && Math.hypot(t.pos.x - t.spawn.x, t.pos.z - t.spawn.z) < 0.05 && Math.abs(Math.atan2(Math.sin(t.pos.h - t.spawn.h), Math.cos(t.pos.h - t.spawn.h))) < 0.05,
      `Go ashore: the walk view, the captain built and standing at the spawn facing the town (${J({ view: t.view, pos: t.pos, spawn: t.spawn })})`);
    // (at the gangplank the docked ship is right behind him, so the camera starts beside him, in his back half)
    check(t.behind <= 0.2 && t.camDist > 1, `Go ashore: the camera sits behind the captain (in his back half: ${t.behind} ≤ 0.2 along his facing)`);
    check(t.focus === 'town-screen' && t.role === 'region' && /walking/i.test(t.label || '') && t.live === "You're ashore. Walk with W A S D or pick a place below.",
      `Go ashore: focus on the town HUD region, and it says so ("${t.live}")`);
    // The town's Shipyard place: back to the shop, its button now reads "Back to town", focus on Upgrades.
    await page.evaluate(() => window.__game.town.open('shipyard'));
    const back = await page.evaluate(() => ({ view: window.__game.dock.view, label: T.text('dock-ashore-btn'), focus: T.focus(), town: T.shown('town-screen'), dock: T.shown('dock-screen') }));
    check(back.view === 'shop' && /Back to town/.test(back.label) && back.focus === 'dock-tab-up' && back.dock && !back.town, `the town's Shipyard place opens the shop, its button reading "Back to town" (${J(back)})`);
    await page.click('#dock-ashore-btn');
    await page.waitForFunction(() => window.__game.town.view === 'town', null, { timeout: 60000 }).catch(() => {});
    const again = await page.evaluate(() => ({ view: window.__game.town.view, live: T.text('town-live'), focus: T.focus() }));
    check(again.view === 'town' && again.focus === 'town-screen' && /Back in town/.test(again.live), `"Back to town" walks back out (${J(again)})`);
  });

  // ----------------------------------------------------------------------------------------------- walk
  await section('walk', async () => {
    await ensureTown(page);
    // WASD and the arrows move relative to the camera (the camera straight behind, then turned by a drag).
    const moves = await page.evaluate(() => {
      const G = window.__game;
      const out = [];
      const keys = [['w', 'KeyW', 0], ['ArrowUp', 'ArrowUp', 0], ['d', 'KeyD', -Math.PI / 2], ['ArrowRight', 'ArrowRight', -Math.PI / 2], ['s', 'KeyS', Math.PI], ['ArrowDown', 'ArrowDown', Math.PI], ['a', 'KeyA', Math.PI / 2], ['ArrowLeft', 'ArrowLeft', Math.PI / 2]];
      for (const yawTurn of [0, 0.9]) {
        for (const [key, code, rel] of keys) {
          document.getElementById('town-screen').focus();
          T.at(0.5, -10.2, Math.PI);
          if (yawTurn) T.town().drag(yawTurn / 0.006, 0);
          G.town.simulate(0.05, null);
          const f = T.camFwd();
          // the direction the key should walk: the camera's forward turned by rel (left of forward is +rel)
          const want = { x: f.x * Math.cos(rel) + f.z * Math.sin(rel), z: -f.x * Math.sin(rel) + f.z * Math.cos(rel) };
          const a = T.pos();
          T.down(key, code);
          G.town.simulate(0.6, null);
          T.up(key, code);
          const b = T.pos();
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const d = Math.hypot(dx, dz) || 1e-9;
          out.push({ key, yaw: yawTurn, dist: +d.toFixed(2), err: +Math.acos(Math.max(-1, Math.min(1, (dx * want.x + dz * want.z) / d))).toFixed(2) });
        }
      }
      G.town.simulate(0.3, { x: 0, z: 0 });
      return out;
    });
    const badMove = moves.filter((m) => m.dist < 0.8 || m.err > 0.35);
    check(moves.length === 16 && badMove.length === 0, `walking: W/↑ forward, S/↓ back, A/← left, D/→ right of the camera's view, with the camera behind him or turned (${badMove.length ? 'bad: ' + J(badMove) : moves.map((m) => `${m.key}${m.yaw ? '↻' : ''} ${m.dist}u/${m.err}rad`).join(', ')})`);
    // C puts the camera straight behind him again after a drag turned it.
    const cKey = await page.evaluate(() => {
      const G = window.__game;
      T.at(0.5, -9, 2.2);
      T.town().drag(150, 0);
      G.town.simulate(0.1, { x: 0, z: 0 });
      const dragged = T.town().camera.yaw;
      document.getElementById('town-screen').focus();
      T.down('c', 'KeyC');
      T.up('c', 'KeyC');
      G.town.simulate(0.05, { x: 0, z: 0 });
      G.camera.updateMatrixWorld();
      const p = T.pos();
      const c = G.camera.position;
      const L = Math.hypot(c.x - p.x, c.z - p.z) || 1;
      return { h: +p.h.toFixed(3), dragged: +dragged.toFixed(3), yaw: +T.town().camera.yaw.toFixed(3), behind: +(((c.x - p.x) * Math.sin(p.h) + (c.z - p.z) * Math.cos(p.h)) / L).toFixed(3) };
    });
    const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    check(Math.abs(wrapA(cKey.dragged - cKey.h)) > 0.5 && Math.abs(wrapA(cKey.yaw - cKey.h)) < 0.05 && cKey.behind < -0.9, `walking: C puts the camera straight behind him after a drag turned it (${J(cKey)})`);
    // Shift sprints: steady speeds about 4.6 against a 3.0 jog.
    const speeds = await page.evaluate(() => {
      const G = window.__game;
      const run = (shift) => {
        T.at(0.5, -6.8, Math.PI);
        T.down('w', 'KeyW', shift);
        if (shift) T.down('Shift', 'ShiftLeft', true);
        G.town.simulate(0.4, null);
        const a = T.pos();
        G.town.simulate(0.5, null);
        const b = T.pos();
        if (shift) T.up('Shift', 'ShiftLeft', false);
        T.up('w', 'KeyW', false);
        G.town.simulate(0.3, { x: 0, z: 0 });
        return Math.hypot(b.x - a.x, b.z - a.z) / 0.5;
      };
      return { jog: +run(false).toFixed(2), sprint: +run(true).toFixed(2) };
    });
    const ratio = speeds.sprint / speeds.jog;
    check(Math.abs(speeds.jog - 3.0) < 0.15 && Math.abs(speeds.sprint - 4.6) < 0.2 && Math.abs(ratio - 4.6 / 3.0) < 0.1, `walking: a jog at ${speeds.jog} u/s, Shift sprints at ${speeds.sprint} u/s (ratio ${ratio.toFixed(2)}, want ≈ ${(4.6 / 3).toFixed(2)})`);
    // 30 s of random keys and taps (seeded): never off the walk, never inside a blocker.
    const rnd = await page.evaluate(() => {
      const G = window.__game;
      const t = T.town();
      const W = t.walk;
      let s = 12345;
      const rng = () => {
        s = (s + 0x6d2b79f5) | 0;
        let q = Math.imul(s ^ (s >>> 15), 1 | s);
        q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q;
        return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
      };
      T.at(0.5, -9, Math.PI);
      const areas = W.graph.nodes;
      let off = 0;
      let inBlock = 0;
      let taps = 0;
      let walked = 0;
      let last = T.pos();
      const seen = new Set();
      for (let f = 0; f < 30 * 60; f++) {
        if (f % 30 === 0) {
          const r = rng();
          if (r < 0.25) {
            // a tap somewhere on the island
            const n = areas[Math.floor(rng() * areas.length)];
            if (t.walkTo(n.x + (rng() - 0.5) * 4, n.z + (rng() - 0.5) * 4)) taps++;
          } else {
            const a = rng() * Math.PI * 2;
            G.town.setMove(Math.sin(a), Math.cos(a), rng() < 0.3);
          }
          if (rng() < 0.2) t.drag((rng() - 0.5) * 300, 0);
        }
        G.town.simulate(1 / 60, null);
        const p = T.pos();
        walked += Math.hypot(p.x - last.x, p.z - last.z);
        last = p;
        seen.add(`${Math.round(p.x / 3)},${Math.round(p.z / 3)}`);
        if (!W.inside(p.x, p.z)) off++;
        if (W.blocked(p.x, p.z, 0.29)) inBlock++;
      }
      G.town.setMove(0, 0, false);
      t.cancelAuto();
      return { frames: 1800, off, inBlock, taps, walked: Math.round(walked), cells: seen.size };
    });
    check(rnd.off === 0 && rnd.inBlock === 0 && rnd.walked > 40 && rnd.taps > 3 && rnd.cells >= 8,
      `walking: 30 s of random keys, stick tilts and taps never leave the walk or enter a blocker (${J(rnd)})`);
    // A tap on a corner shut in by props walks him as near as he can get (3D); the walk camera has its own
    // no-go volumes (signs, palms, awnings) besides the walk's blockers.
    const corner = await page.evaluate(() => {
      const t = T.town();
      T.at(0.5, -9, Math.PI);
      const ok = t.walkTo(16.8, -14.9);
      const a = t.auto;
      t.cancelAuto();
      return { ok, to: a && a.to, camBlockers: (window.__game.town.walk.camBlockers || []).length };
    });
    check(corner.ok && !!corner.to && Math.hypot(corner.to.x - 16.8, corner.to.z + 14.9) < 4 && corner.camBlockers > 0, `walking: a tap on a yard corner shut in by props walks to the nearest reachable spot; the camera keeps off ${corner.camBlockers} camera-only volumes (${J(corner)})`);
    // The tavern building blocks: from its door, walking straight at it stops at its wall.
    const wall = await page.evaluate(() => {
      const G = window.__game;
      const W = T.walk();
      const door = G.town.walk.places.find((p) => p.id === 'tavern');
      // the tavern building: the biggest walk blocker by the door
      const boxes = G.town.walk.blockers.filter((b) => b.w !== undefined && Math.hypot(b.x - door.x, b.z - door.z) < 9).sort((a, b) => b.w * b.d - a.w * a.d);
      const bld = boxes[0];
      if (!bld) return null;
      const h = Math.atan2(bld.x - door.x, bld.z - door.z);
      T.at(door.x, door.z, h);
      const a = T.pos();
      T.down('w', 'KeyW');
      G.town.simulate(3, null);
      T.up('w', 'KeyW');
      G.town.simulate(0.3, null);
      const b = T.pos();
      return { bld: { x: bld.x, z: bld.z, w: bld.w, d: bld.d, h: bld.h }, moved: +Math.hypot(b.x - a.x, b.z - a.z).toFixed(2), inside: W.blocked(b.x, b.z, 0), clear: !W.blocked(b.x, b.z, 0.29), toCentre0: +Math.hypot(a.x - bld.x, a.z - bld.z).toFixed(2), toCentre1: +Math.hypot(b.x - bld.x, b.z - bld.z).toFixed(2) };
    });
    check(!!wall && wall.bld.h >= 3 && !wall.inside && wall.clear && wall.moved < 8 && wall.toCentre1 > Math.min(wall.bld.w, wall.bld.d) / 2,
      `walking: the tavern building blocks: 3 s of W at it stop outside its walls (${J(wall)})`);
  });

  // --------------------------------------------------------------------------------------------- places
  await section('places', async () => {
    await ensureTown(page);
    // Each places-bar button walks there and opens the place; back in town, focus returns to its button.
    const results = [];
    for (const id of ['tailor', 'tavern', 'shipyard', 'ship']) {
      await page.evaluate(() => { T.at(0.5, -9, Math.PI); document.getElementById('town-screen').focus(); });
      await page.click(`#town-places [data-place="${id}"]`);
      const auto = await page.evaluate(() => window.__game.town.api.auto);
      const r = await arrive(page);
      const place = await page.evaluate(() => window.__game.town.pos);
      let back = null;
      if (id === 'tailor' || id === 'tavern') {
        await page.keyboard.press('Escape');
        back = await page.evaluate(() => ({ view: window.__game.town.view, focus: T.focus() }));
      } else if (id === 'shipyard') {
        await page.click('#dock-ashore-btn');
        await page.waitForFunction(() => window.__game.town.view === 'town', null, { timeout: 60000 }).catch(() => {});
        back = await page.evaluate(() => ({ view: window.__game.town.view, focus: T.focus() }));
      } else {
        await page.click('#aboard-stay-btn');
        back = await page.evaluate(() => ({ view: window.__game.town.view, focus: T.focus(), open: T.shown('aboard-dialog') }));
      }
      results.push({ id, auto: auto && auto.place, ...r, back, at: [+place.x.toFixed(1), +place.z.toFixed(1)] });
    }
    const want = { tailor: ['tailor', 'wardrobe-tab-captain'], tavern: ['tavern', 'armory:boarders'], shipyard: ['shop', 'dock-tab-up'], ship: ['town', 'aboard-'] };
    for (const r of results) {
      const [view, focus] = want[r.id];
      const opened = r.view === view && (r.id !== 'ship' || r.aboard) && (r.focus || '').startsWith(focus);
      // (a click on the bar doesn't leave focus there, so closing All aboard? hands it back to the town region)
      const backOk = r.id === 'shipyard' ? r.back.view === 'town' : r.id === 'ship' ? r.back.view === 'town' && !r.back.open && ['town-screen', 'place:ship'].includes(r.back.focus) : r.back.view === 'town' && r.back.focus === `place:${r.id}`;
      check(r.auto === r.id && opened && backOk, `places bar: "${r.id}" walks there and opens it, focus in it; back in town focus is on its button (${J(r)})`);
    }
    // A move key cancels the auto-walk.
    const cancel = await page.evaluate(() => {
      const G = window.__game;
      T.at(0.5, -9, Math.PI);
      document.querySelector('#town-places [data-place="tavern"]').click();
      G.town.simulate(0.5, null);
      const before = G.town.api.auto;
      document.getElementById('town-screen').focus();
      T.down('s', 'KeyS');
      G.town.simulate(0.2, null);
      T.up('s', 'KeyS');
      const after = G.town.api.auto;
      G.town.simulate(2, null);
      return { before: before && before.place, after, view: G.town.view };
    });
    check(cancel.before === 'tavern' && cancel.after === null && cancel.view === 'town', `a move key cancels the walk to a place (${J(cancel)})`);
    // E at a door always goes in; Enter and Space go in when no button is focused (a focused button takes them).
    const keys = [];
    for (const key of ['e', 'Enter', ' ']) {
      // a button focused (the Tavern one in the places bar): E is still the door's (no button handles E), so
      // he goes in; Enter and Space are the button's (they press it, so he sets off for the tavern)
      await page.evaluate(() => {
        T.town().enter('tailor');
        window.__game.town.simulate(0.2, { x: 0, z: 0 });
        document.querySelector('#town-places [data-place="tavern"]').focus();
      });
      await page.keyboard.press(key === ' ' ? 'Space' : key);
      const withButton = await page.evaluate(() => ({ view: window.__game.town.view, auto: window.__game.town.api.auto && window.__game.town.api.auto.place }));
      // nothing focused but the town HUD region: the door opens
      const prompt = await page.evaluate(() => {
        // (E went into Polly's above: back out to the town first)
        if (window.__game.town.view !== 'town') window.__game.town.back();
        T.town().cancelAuto();
        T.town().enter('tailor');
        window.__game.town.simulate(0.2, { x: 0, z: 0 });
        document.getElementById('town-screen').focus();
        return window.__game.town.api.prompt;
      });
      await page.keyboard.press(key === ' ' ? 'Space' : key);
      const free = await page.evaluate(() => {
        const v = window.__game.town.view;
        if (v !== 'town') window.__game.town.back();
        return v;
      });
      keys.push({ key: key === ' ' ? 'Space' : key, withButton, prompt, free });
    }
    check(keys.every((k) => k.free === 'tailor' && /Polly/.test(k.prompt || '')) && keys[0].withButton.view === 'tailor' && keys[0].withButton.auto === null && keys.slice(1).every((k) => k.withButton.view === 'town' && k.withButton.auto === 'tavern'),
      `at Polly's door E, Enter and Space go in; E even with a places-bar button focused, while Enter and Space press the focused button instead (${J(keys)})`);
    // P / Esc: the Harbour menu, a labelled modal dialog; Tab stays inside; Esc (or P) closes it and focus returns.
    const harbour = [];
    for (const [key, code, close] of [['p', 'KeyP', 'p'], ['Escape', 'Escape', 'Escape']]) {
      await page.evaluate(() => { T.at(0.5, -9, Math.PI); document.querySelector('#town-places [data-place="shipyard"]').blur(); document.getElementById('town-screen').focus(); });
      await page.keyboard.press(key);
      const d = await page.evaluate(() => {
        const dlg = document.getElementById('harbour-dialog');
        const lab = document.getElementById(dlg.getAttribute('aria-labelledby') || '');
        return { open: T.shown('harbour-dialog'), role: dlg.getAttribute('role'), modal: dlg.getAttribute('aria-modal'), label: lab ? lab.textContent.trim() : null, focus: T.focus(), inDialog: dlg.contains(document.activeElement), townInert: document.getElementById('town-screen').inert, buttons: [...dlg.querySelectorAll('button')].filter((b) => T.shown(b)).map((b) => b.id || b.textContent.trim()) };
      });
      const tabs = [];
      for (let i = 0; i < d.buttons.length + 2; i++) {
        await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab');
        tabs.push(await page.evaluate(() => document.getElementById('harbour-dialog').contains(document.activeElement)));
      }
      await page.keyboard.press(close);
      const after = await page.evaluate(() => ({ open: T.shown('harbour-dialog'), focus: T.focus(), townInert: document.getElementById('town-screen').inert, view: window.__game.town.view }));
      harbour.push({ key, ...d, trapped: tabs.every(Boolean), after });
    }
    for (const h of harbour) {
      check(h.open && h.role === 'dialog' && h.modal === 'true' && !!h.label && h.inDialog && h.townInert && h.trapped && h.buttons.length >= 5 && /harbour-walk-btn/.test(h.buttons.join()) && !h.after.open && !h.after.townInert && h.after.focus === 'town-screen' && h.after.view === 'town',
        `${h.key === 'p' ? 'P' : 'Esc'} opens the Harbour menu ("${h.label}": a modal dialog, focus inside, the town inert, Tab trapped) and ${h.key === 'p' ? 'P' : 'Esc'} closes it, focus back on the town (${J(h)})`);
    }
    // The ☰ button opens it too; Keep walking closes it. Clicked with the mouse, ☰ keeps no focus, so focus goes
    // back to the town region (Enter at the next door goes in); opened from the keyboard, focus returns to ☰.
    await page.click('#town-menu-btn');
    const viaBtn = await page.evaluate(() => ({ open: T.shown('harbour-dialog'), places: ['harbour-shipyard-btn', 'harbour-tailor-btn', 'harbour-tavern-btn'].every((id) => T.shown(id)), exits: [...document.querySelectorAll('#harbour-exits button')].map((b) => b.textContent.trim()) }));
    await page.click('#harbour-walk-btn');
    const viaBtn2 = await page.evaluate(() => ({ open: T.shown('harbour-dialog'), focus: T.focus() }));
    await page.focus('#town-menu-btn');
    await page.keyboard.press('Enter');
    const viaKey = await page.evaluate(() => ({ open: T.shown('harbour-dialog'), inDialog: document.getElementById('harbour-dialog').contains(document.activeElement) }));
    await page.keyboard.press('Escape');
    const viaKey2 = await page.evaluate(() => ({ open: T.shown('harbour-dialog'), focus: T.focus() }));
    check(viaBtn.open && viaBtn.places && viaBtn.exits.join() === 'Back to the title' && !viaBtn2.open && viaBtn2.focus === 'town-screen' && viaKey.open && viaKey.inDialog && !viaKey2.open && viaKey2.focus === 'town-menu-btn',
      `the ☰ button opens the Harbour menu (Keep walking, Shipyard, Tailor, Tavern, the ways out); closed again, focus goes to the town after a mouse click on ☰, back to ☰ after Enter on it (${J({ viaBtn, viaBtn2, viaKey, viaKey2 })})`);
    await page.evaluate(() => document.getElementById('town-screen').focus());
    // All aboard? offers the shipyard's ways out for every way the dock was opened, and does what they do.
    const exits = await page.evaluate(() => {
      const G = window.__game;
      const out = [];
      const list = (sel) => [...document.querySelectorAll(sel)].map((b) => `${b.dataset.exit}:${b.textContent.trim()}`).join(' | ');
      for (const [from, level] of [['menu', 1], ['levelDone', 1], ['over', 2], ['quit', 2], ['won', 3]]) {
        G.showMenu();
        G.state.level = level;
        G.dock.open(from);
        const shop = list('#dock-exits button');
        G.dock.ashore();
        G.town.open('ship');
        const aboard = list('#aboard-exits button');
        out.push({ from, shop, aboard, stay: T.shown('aboard-stay-btn') });
        G.town.back();
      }
      return out;
    });
    check(exits.every((e) => e.shop && e.shop === e.aboard && e.stay), `All aboard? lists the shipyard's ways out for each origin, and Stay ashore (${exits.map((e) => `${e.from}: ${e.aboard}`).join('; ')})`);
    const doIt = [];
    for (const [from, level, action] of [['levelDone', 1, 'next'], ['over', 2, 'retry'], ['menu', 1, 'title'], ['levelDone', 2, 'menu']]) {
      await page.evaluate(([from, level]) => {
        const G = window.__game;
        G.showMenu();
        G.state.level = level;
        G.dock.open(from);
        G.dock.ashore();
        G.town.open('ship');
      }, [from, level]);
      await page.click(`#aboard-${action}-btn`);
      await page.waitForFunction(() => window.__game.state.mode !== 'dock', null, { timeout: 60000 }).catch(() => {});
      doIt.push({ from, action, ...(await page.evaluate(() => ({ mode: window.__game.state.mode, level: window.__game.state.level, town: window.__game.town.active, townShown: T.shown('town-screen'), aboard: T.shown('aboard-dialog'), captain: window.__game.town.captain }))) });
    }
    const wantDo = { next: (r) => r.mode === 'playing' && r.level === 2, retry: (r) => r.mode === 'playing' && r.level === 2, title: (r) => r.mode === 'menu', menu: (r) => r.mode === 'menu' };
    check(doIt.every((r) => wantDo[r.action](r) && !r.townShown && !r.aboard && r.captain === null), `All aboard?'s ways out do what the shipyard's do: sail on, try again, the title, the main menu; the town put away (${J(doIt)})`);
  });
  if (desk) await desk.ctx.close();

  // ---------------------------------------------------------------------------------------------- touch
  await section('touch', async () => {
    const { ctx, page: tp } = await open({ width: 390, height: 844, touch: true, label: 'touch' });
    await tp.evaluate(() => window.__game.dock.open('menu'));
    await tp.tap('#dock-ashore-btn');
    await tp.waitForFunction(() => window.__game.town.view === 'town', null, { timeout: 60000 }).catch(() => {});
    await frames(tp, 3);
    const first = await tp.evaluate(() => ({ view: window.__game.town.view, fov: window.__game.camera.fov, live: T.text('town-live'), keys: T.shown('town-keys'), stickHidden: document.getElementById('town-joystick').getAttribute('aria-hidden'), labels: [...document.querySelectorAll('#town-places [data-place]')].map((b) => b.getAttribute('aria-label')) }));
    check(first.view === 'town' && first.fov === 60 && !first.keys && first.stickHidden === 'true' && /use the stick/i.test(first.live) && first.labels.includes('Walk to the tailor'),
      `touch: ashore with the portrait walk lens (fov ${first.fov}), touch wording, no keys legend, the stick hidden from screen readers (${J(first)})`);
    // the stick: a thumb pressed in the left of the screen and pushed up walks him
    const cdp = await ctx.newCDPSession(tp);
    const tpts = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    const p0 = await tp.evaluate(() => { T.at(0.5, -9, Math.PI); return T.pos(); });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tpts(70, 520) });
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tpts(70, 520 - i * 12) });
    const stick = await tp.evaluate(() => {
      const on = document.getElementById('town-joystick').classList.contains('on');
      window.__game.town.simulate(1, null);
      return { on, p: T.pos() };
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const stopped = await tp.evaluate(() => { const a = T.pos(); window.__game.town.simulate(0.5, null); const b = T.pos(); return { off: !document.getElementById('town-joystick').classList.contains('on'), drift: Math.hypot(b.x - a.x, b.z - a.z) }; });
    const sd = Math.hypot(stick.p.x - p0.x, stick.p.z - p0.z);
    check(stick.on && sd > 1.5 && stopped.off && stopped.drift < 0.3, `touch: the stick appears under the thumb and walks him (${sd.toFixed(2)} u in 1 s); letting go stops him (${J(stopped)})`);
    // tap-to-walk: a tap on the deck a few steps ahead walks there
    const tgt = await tp.evaluate(() => {
      const G = window.__game;
      T.at(0.5, -7.2, Math.PI);
      G.camera.updateMatrixWorld();
      const c = T.pos();
      const W = T.walk();
      const yaw = T.town().camera.yaw;
      for (const d of [4, 3, 5]) {
        for (let a = -0.6; a <= 0.6; a += 0.2) {
          const x = c.x + Math.sin(yaw + a) * d;
          const z = c.z + Math.cos(yaw + a) * d;
          if (!W.inside(x, z) || W.blocked(x, z, 0.4)) continue;
          const v = G.camera.position.clone().set(x, W.heightAt(x, z), z).project(G.camera);
          if (Math.abs(v.x) < 0.6 && v.y > -0.3 && v.y < 0.5) return { x, z, sx: ((v.x + 1) / 2) * innerWidth, sy: ((1 - v.y) / 2) * innerHeight };
        }
      }
      return null;
    });
    let tap = null;
    if (tgt) {
      await tp.touchscreen.tap(tgt.sx, tgt.sy);
      tap = await tp.evaluate(() => { const a = window.__game.town.api.auto; window.__game.town.simulate(3, null); return { auto: a, p: T.pos() }; });
    }
    check(!!tgt && !!tap.auto && Math.hypot(tap.p.x - tgt.x, tap.p.z - tgt.z) < 0.8, `touch: a tap on the deck walks him there (${J({ tgt, tap })})`);
    // the Go in button: disabled away from a door, opens the place at one
    const act = await tp.evaluate(() => {
      const G = window.__game;
      T.at(0.5, -9, Math.PI);
      const away = document.getElementById('town-action').getAttribute('aria-disabled');
      T.town().enter('tavern');
      G.town.simulate(0.2, { x: 0, z: 0 });
      return { away, door: document.getElementById('town-action').getAttribute('aria-disabled'), label: document.getElementById('town-action').getAttribute('aria-label'), prompt: G.town.api.prompt };
    });
    await frames(tp, 2);
    await tp.tap('#town-action');
    const opened = await tp.evaluate(() => window.__game.town.view);
    check(act.away === 'true' && act.door === 'false' && /Salty Sparrow/.test(act.label || '') && opened === 'tavern', `touch: the Go in button is disabled away from a door and opens the tavern at its door (${J({ ...act, opened })})`);
    await tp.evaluate(() => window.__game.town.back());
    // every town control at least 44 px
    const sizes = await tp.evaluate(() => T.finish() || [...document.querySelectorAll('#town-screen button')].filter((b) => T.shown(b)).map((b) => { const r = b.getBoundingClientRect(); return { id: b.id || b.dataset.place, w: Math.round(r.width), h: Math.round(r.height) }; }));
    const small = sizes.filter((s) => s.w < 44 || s.h < 44);
    check(sizes.length >= 7 && small.length === 0, `touch: every town control is at least 44 px (${sizes.map((s) => `${s.id} ${s.w}x${s.h}`).join(', ')})`);
    await ctx.close();
  });

  // ------------------------------------------------------------------------------------------- wardrobe
  await section('wardrobe', async () => {
    const { ctx, page: wp } = await open({ label: 'wardrobe', store: { ...RETURNING, 'pirates-ahoy-purse': '1000' } });
    // Polly's ignores an item click less than BUY_GUARD (400 ms) after a purchase (the second click of a double-click
    // on Buy). Called after a purchase, before the next item click: 450 ms of wall clock (page time runs with it),
    // so the check doesn't depend on how slow the frames in between happen to be.
    const pastBuyGuard = () => wp.waitForTimeout(450);
    // the cleaning crew with the default uniform, before anything is worn
    const crew0 = await wp.evaluate(() => {
      const G = window.__game;
      G.dock.open('menu');
      return T.crew().map((p) => ({ look: JSON.stringify(p.userData.look), hash: T.colours(p).hash }));
    });
    await wp.evaluate(() => { window.__game.dock.ashore(); window.__game.town.open('tailor'); });
    await frames(wp, 2);
    const opened = await wp.evaluate(() => ({ view: window.__game.town.view, focus: T.focus(), shown: T.shown('wardrobe-screen'), inDock: !!document.getElementById('wardrobe-panel').closest('#dock-panel'), tabs: [...document.querySelectorAll('#wardrobe-panel [role="tab"]')].map((t) => t.textContent.trim()) }));
    check(opened.view === 'tailor' && opened.shown && opened.focus === 'wardrobe-tab-captain' && !opened.inDock && opened.tabs.join() === 'Captain,Crew', `Polly's: the wardrobe opens (outside the shipyard panel) with focus on its Captain tab (${J(opened)})`);
    // Wearing a free item: worn at once, the captain rebuilt, saved.
    await wp.click('#wardrobe-captain [data-item="hat.bandana"]');
    const wore = await wp.evaluate(async () => {
      const G = window.__game;
      const Cm = await import('/src/cosmetics.js');
      const saved = JSON.parse(localStorage.getItem('pirates-ahoy-look') || 'null');
      return { hat: G.look.cap.hat, captain: G.town.captain.userData.look.hat, want: Cm.captainOpts(G.look).hat, saved: saved && saved.cap.hat, pressed: document.querySelector('[data-item="hat.bandana"]').getAttribute('aria-pressed'), live: T.text('wardrobe-live'), purse: G.state.purse };
    });
    check(wore.hat === 'bandana' && wore.captain === wore.want && wore.captain === 'bandana' && wore.saved === 'bandana' && wore.pressed === 'true' && /Bandana/.test(wore.live) && wore.purse === 1000,
      `wardrobe: a free hat is worn at once (the captain rebuilt in it), pressed, announced and saved in pirates-ahoy-look, free of charge (${J(wore)})`);
    // Try-on of a priced item: the Buy button, the captain wears it; leaving the tab (or the panel) puts it back.
    await wp.click('#wardrobe-captain [data-item="hat.plume"]');
    const trying = await wp.evaluate(() => {
      const G = window.__game;
      const b = document.querySelector('[data-buy-item="hat.plume"]');
      return { trial: G.town.api.trial, buy: b && T.shown(b) ? b.textContent.trim() : null, captain: G.town.captain.userData.look.hat, owned: G.look.own.includes('hat.plume'), state: document.querySelector('[data-item="hat.plume"] .wi-state').textContent.trim(), purse: G.state.purse };
    });
    await wp.click('#wardrobe-tab-crew');
    const leftTab = await wp.evaluate(() => ({ trial: window.__game.town.api.trial, captain: window.__game.town.captain.userData.look.hat, live: T.text('wardrobe-live') }));
    await wp.click('#wardrobe-tab-captain');
    await wp.click('#wardrobe-captain [data-item="hat.plume"]');
    await wp.click('#wardrobe-back-btn');
    const leftPanel = await wp.evaluate(() => ({ view: window.__game.town.view, captain: window.__game.town.captain.userData.look.hat, hat: window.__game.look.cap.hat, purse: window.__game.state.purse }));
    check(trying.trial === 'hat.plume' && /^Buy Cavalier.s plume — 180 gold$/.test(trying.buy || '') && trying.captain === 'plumed' && !trying.owned && trying.state === 'Trying on' && trying.purse === 1000,
      `wardrobe: trying on the plume shows "Buy … — 180 gold" and the captain wears it, nothing paid (${J(trying)})`);
    check(leftTab.trial === null && leftTab.captain === 'bandana' && /back on the rack/.test(leftTab.live) && leftPanel.captain === 'bandana' && leftPanel.hat === 'bandana' && leftPanel.purse === 1000,
      `wardrobe: leaving the tab, or the shop, without buying puts the plume back on the rack (${J({ leftTab, leftPanel })})`);
    // Buying: the chest pays, the item is owned, worn and saved (the look first, then the chest).
    await wp.evaluate(() => window.__game.town.open('tailor'));
    await wp.click('#wardrobe-captain [data-item="hat.plume"]');
    await wp.evaluate(() => {
      // Polly cheers a purchase (env.cheer)
      const env = window.__game.env;
      const cheer = env.cheer;
      window.__cheers = [];
      env.cheer = function (...a) { const r = cheer.apply(this, a); window.__cheers.push([a[0], r]); return r; };
    });
    await wp.click('[data-buy-item="hat.plume"]');
    const bought = await wp.evaluate(() => {
      const G = window.__game;
      const saved = JSON.parse(localStorage.getItem('pirates-ahoy-look'));
      return {
        cheers: window.__cheers, purse: G.state.purse, savedPurse: localStorage.getItem('pirates-ahoy-purse'), hat: G.look.cap.hat, own: G.look.own, savedOwn: saved.own, savedHat: saved.cap.hat, captain: G.town.captain.userData.look.hat, chest: T.text('wardrobe-chest'), live: T.text('wardrobe-live'), btn: T.text('wardrobe-captain').includes('Bought') };
    });
    check(bought.purse === 820 && bought.savedPurse === '820' && bought.hat === 'plume' && bought.own.includes('hat.plume') && bought.savedOwn.includes('hat.plume') && bought.savedHat === 'plume' && bought.captain === 'plumed' && /820/.test(bought.chest) && /Bought/.test(bought.live) && bought.cheers.some((c) => c[0] === 'polly' && c[1] === true),
      `wardrobe: Buy pays 180 from the treasure chest, owns, wears and saves the plume, and Polly cheers (${J(bought)})`);
    // Too poor: the Buy button is aria-disabled with the reason; pressing it buys nothing and keeps focus.
    await wp.evaluate(() => { window.__game.state.purse = 50; });
    await frames(wp, 2);
    // (an item click within 400 ms of a purchase is the tail of a double-click and is ignored, src/townMode.js
    // BUY_GUARD: wait it out, however fast the frames above were)
    await pastBuyGuard();
    await wp.click('#wardrobe-captain [data-item="hat.bicorne"]');
    await frames(wp, 2);
    await wp.focus('[data-buy-item="hat.bicorne"]');
    await wp.keyboard.press('Enter');
    const poor = await wp.evaluate(() => {
      const b = document.querySelector('[data-buy-item="hat.bicorne"]');
      const g = b.closest('[role="group"]') || b.parentElement;
      return { disabled: b.getAttribute('aria-disabled'), why: g.textContent.includes('Need 70 more gold'), focus: T.focus(), purse: window.__game.state.purse, own: window.__game.look.own.includes('hat.bicorne'), live: T.text('wardrobe-live'), item: document.querySelector('[data-item="hat.bicorne"] .wi-state').textContent.trim() };
    });
    check(poor.disabled === 'true' && poor.why && poor.focus === 'buy:hat.bicorne' && poor.purse === 50 && !poor.own && /70 more gold/.test(poor.live),
      `wardrobe: too poor for the bicorne: Buy is aria-disabled with "Need 70 more gold", pressing it buys nothing and keeps focus (${J(poor)})`);
    // A double-click on Buy buys once.
    await wp.evaluate(() => { window.__game.state.purse = 500; });
    await frames(wp, 2);
    await wp.click('#wardrobe-captain [data-item="coat.black"]');
    await wp.dblclick('[data-buy-item="coat.black"]');
    await frames(wp, 2);
    const dbl = await wp.evaluate(() => ({ purse: window.__game.state.purse, own: window.__game.look.own.filter((x) => x === 'coat.black').length, coat: window.__game.look.cap.coat, others: window.__game.look.own }));
    check(dbl.purse === 440 && dbl.own === 1 && dbl.coat === 'black', `wardrobe: a double-click on Buy buys the black coat once (60 gold: 500 -> ${dbl.purse}; ${J(dbl)})`);
    // Trophies: locked (focusable, aria-disabled, the unlock text) until the feats earn them.
    const crown0 = await wp.evaluate(() => {
      const b = document.querySelector('[data-item="hat.crown"]');
      b.click();
      return { disabled: b.getAttribute('aria-disabled'), tabbable: b.tabIndex >= 0 && !b.disabled, state: b.textContent.replace(/\s+/g, ' ').trim(), hat: window.__game.look.cap.hat };
    });
    await wp.evaluate(() => { window.__game.setFeats({ captures: 0, boardings: 0, rakes: 0, crits: 0, legend: 1, prizes: {} }); });
    await frames(wp, 2);
    await pastBuyGuard(); // (the black coat was just bought)
    await wp.click('#wardrobe-captain [data-item="hat.crown"]');
    const crown1 = await wp.evaluate(() => ({ disabled: document.querySelector('[data-item="hat.crown"]').getAttribute('aria-disabled'), hat: window.__game.look.cap.hat, captain: window.__game.town.captain.userData.look.hat, purse: window.__game.state.purse }));
    check(crown0.disabled === 'true' && crown0.tabbable && /Locked/i.test(crown0.state) && crown0.hat === 'plume' && crown1.disabled === 'false' && crown1.hat === 'crown' && crown1.captain === 'crown' && crown1.purse === 440,
      `wardrobe: the Pirate King's crown stays locked (focusable, aria-disabled, "${crown0.state}") until G.setFeats grants the legend, then it is worn free (${J({ crown0, crown1 })})`);
    // Surprise me! changes free options of the open tab only.
    const surprise = await wp.evaluate(async () => {
      const G = window.__game;
      const Cm = await import('/src/cosmetics.js');
      const out = [];
      for (const tab of ['captain', 'crew']) {
        G.town.api.wardrobe.tab(tab);
        for (let i = 0; i < 4; i++) {
          const before = G.look;
          const purse = G.state.purse;
          document.getElementById('wardrobe-surprise-btn').click();
          const after = G.look;
          const group = tab === 'captain' ? 'cap' : 'crew';
          const other = tab === 'captain' ? 'crew' : 'cap';
          const changed = Object.keys(after[group]).filter((s) => after[group][s] !== before[group][s]);
          const notFree = changed.map((s) => `${s}.${after[group][s]}`).filter((id) => { const it = Cm.ITEMS[id]; return !it || it.price || it.trophy; });
          out.push({ tab, changed: changed.length, notFree, otherSame: JSON.stringify(after[other]) === JSON.stringify(before[other]), ownSame: JSON.stringify(after.own) === JSON.stringify(before.own), purse: G.state.purse === purse });
        }
      }
      G.town.api.wardrobe.tab('captain');
      return out;
    });
    check(surprise.every((s) => s.notFree.length === 0 && s.otherSame && s.ownSame && s.purse) && surprise.filter((s) => s.tab === 'captain').some((s) => s.changed > 0) && surprise.filter((s) => s.tab === 'crew').some((s) => s.changed > 0),
      `wardrobe: Surprise me! changes only free options, and only of the open tab (${J(surprise)})`);
    // The crew: a uniform shows on the line-up at once, and on the cleaning crew once Polly's closes (they are
    // dressed then, not rebuilt on every click there: PERF-3); Match the ship's paint follows the hull; the default
    // uniform leaves the cleaning crew exactly as before.
    const uniform = await wp.evaluate(async () => {
      const G = window.__game;
      const Cm = await import('/src/cosmetics.js');
      const reopen = () => { G.town.open('tailor'); G.town.api.wardrobe.tab('crew'); };
      G.town.api.wardrobe.tab('crew');
      const out = {};
      const red = Cm.crewOpts({ ...G.look, crew: { ...G.look.crew, shirt: 'red' } }, 1, {}, null).shirt;
      document.querySelector('[data-item="shirt.red"]').click();
      const lineupRed = G.town.api.lineup.map((p) => p.userData.look.shirt === red);
      G.town.back();
      out.red = { shirt: G.look.crew.shirt, hex: red, crew: T.crew().map((p) => p.userData.look.shirt === red && T.colours(p, red).has), lineup: lineupRed };
      reopen();
      // (a new hull paint first: the uniform follows it)
      G.dock.paint('hull', 'royal');
      document.querySelector('[data-item="shirt.paint"]').click();
      const { LOOKS } = await import('/src/upgrades.js');
      const royal = LOOKS.hull.find((l) => l.id === 'royal');
      const lineupPaint = G.town.api.lineup.map((p) => p.userData.look.shirt);
      G.town.back();
      out.paint = { shirt: G.look.crew.shirt, top: royal.top, crew: T.crew().map((p) => p.userData.look.shirt), lineup: lineupPaint, colours: T.crew().every((p) => T.colours(p, royal.top).has) };
      reopen();
      // the default uniform (Surprise me! above may have changed the headgear and sashes too)
      for (const id of ['shirt.own', 'head.mixed', 'sash.own']) document.querySelector(`[data-item="${id}"]`).click();
      G.town.back();
      out.own = { shirt: G.look.crew.shirt, crew: T.crew().map((p) => ({ look: JSON.stringify(p.userData.look), hash: T.colours(p).hash })) };
      return out;
    });
    check(uniform.red.shirt === 'red' && uniform.red.crew.length === 6 && uniform.red.crew.every(Boolean) && uniform.red.lineup.length === 3 && uniform.red.lineup.every(Boolean),
      `wardrobe: red stripes for the crew dress the 3-sailor line-up, and all 6 sailors cleaning the docked ship once Polly's closes (their vertex colours hold the shirt colour) (${J(uniform.red)})`);
    check(uniform.paint.shirt === 'paint' && uniform.paint.crew.length === 6 && [...uniform.paint.crew, ...uniform.paint.lineup].every((x) => x === uniform.paint.top) && uniform.paint.colours,
      `wardrobe: Match the ship's paint dresses the crew in the hull paint's colour (royal blue & gold: ${uniform.paint.top.toString(16)}) (${J(uniform.paint)})`);
    const crewDiff = uniform.own.crew.map((c, i) => (c.look === crew0[i].look && c.hash === crew0[i].hash ? null : { i, look: c.look === crew0[i].look, colours: c.hash === crew0[i].hash })).filter(Boolean);
    check(uniform.own.shirt === 'own' && uniform.own.crew.length === 6 && crew0.length === 6 && crewDiff.length === 0,
      `wardrobe: back to the default uniform the cleaning crew is exactly as before any change (looks and vertex colours of all ${crew0.length})${crewDiff.length ? ' -> ' + J(crewDiff) : ''}`);
    await ctx.close();
  });

  // --------------------------------------------------------------------------------------------- tavern
  await section('tavern', async () => {
    const { ctx, page: vp } = await open({ label: 'tavern', store: { ...RETURNING, 'pirates-ahoy-purse': '2000' } });
    // the hands a level starts with before any training
    const crew0 = await vp.evaluate(() => { const G = window.__game; G.newGame(1); const c = G.crew.max; G.showMenu(); return c; });
    await vp.evaluate(() => { const G = window.__game; G.dock.open('menu'); G.dock.ashore(); G.town.open('tavern'); });
    await frames(vp, 2);
    const panel = await vp.evaluate(() => ({
      view: window.__game.town.view,
      rows: [...document.querySelectorAll('#tavern-up-list .up-row')].map((r) => r.dataset.id),
      buys: [...document.querySelectorAll('#tavern-up-list .buy-btn[data-armory]')].length,
      inDock: !!document.getElementById('tavern-panel').closest('#dock-panel'),
      coils: window.__game.dock.ship.userData.coils,
    }));
    const cost = async (id) => vp.evaluate(async (id) => { const A = await import('/src/armory.js'); return A.armoryNextCost(window.__game.armory.config, id); }, id);
    const c1 = await cost('boarders');
    await vp.click('#tavern-up-list [data-armory="boarders"]');
    const b1 = await vp.evaluate(() => ({ purse: window.__game.state.purse, cfg: window.__game.armory.config.up, saved: JSON.parse(localStorage.getItem('pirates-ahoy-armory') || 'null'), savedPurse: localStorage.getItem('pirates-ahoy-purse'), live: T.text('tavern-live') }));
    check(panel.view === 'tavern' && panel.rows.join() === 'boarders,cutlass,grapple,gunner' && panel.buys === 4 && !panel.inDock && b1.purse === 2000 - c1 && b1.cfg.boarders === 1 && b1.saved && b1.saved.up.boarders === 1 && b1.savedPurse === String(2000 - c1) && /Bought/.test(b1.live),
      `tavern: the four crew rows (outside the shipyard panel); Boarding party bought for ${c1} gold, saved with the chest (${J({ panel, b1 })})`);
    const c2 = await cost('grapple');
    await vp.click('#tavern-up-list [data-armory="grapple"]');
    await frames(vp, 2);
    const g1 = await vp.evaluate(() => ({ coils: window.__game.dock.ship.userData.coils, tier: window.__game.armory.config.up.grapple, purse: window.__game.state.purse }));
    check(panel.coils === 0 && g1.tier === 1 && g1.coils > 0 && g1.purse === 2000 - c1 - c2, `tavern: Long grapples puts coiled grapnels on the docked ship's rail (${panel.coils} -> ${g1.coils} coils)`);
    // the crew at the next level start
    const crew1 = await vp.evaluate(async () => {
      const A = await import('/src/armory.js');
      const G = window.__game;
      const want = A.armoryStats(G.armory.config).crew;
      G.dock.leave('title');
      G.newGame(1);
      const r = { max: G.crew.max, crew: G.crew.crew, want };
      G.showMenu();
      return r;
    });
    check(crew1.max === crew1.want && crew1.max > crew0 && crew1.crew === crew1.max, `tavern: Boarding party raises the crew at the next level start (${crew0} -> ${crew1.max} hands)`);
    // the rumour board names the next voyage: after a cleared level the next, after a wreck the same, else the highest open
    const rumours = await vp.evaluate(() => {
      const G = window.__game;
      const out = [];
      for (const [from, level, unlocked] of [['levelDone', 1, 2], ['over', 5, 5], ['won', 3, 4], ['menu', 1, 2]]) {
        G.showMenu();
        G.state.level = level;
        G.state.unlocked = unlocked;
        G.dock.open(from);
        G.dock.ashore();
        G.town.open('tavern');
        out.push({ from, level, text: T.text('tavern-rumour') });
        G.town.back();
      }
      G.showMenu();
      return out;
    });
    const L4 = await vp.evaluate(() => window.__game.LEVELS[3].rumour);
    const wantR = { levelDone: 'Bali Islands', over: 'Frostbite Straits', won: 'Doubloon Bay', menu: 'Bali Islands' };
    check(rumours.every((r) => r.text.includes(`Next voyage: ${wantR[r.from]}`)) && rumours[2].text.includes(L4.lines[0]) && /Bring: Chain shot/i.test(rumours[2].text),
      `tavern: the rumour board names the next voyage (${rumours.map((r) => `${r.from} L${r.level}: "${r.text.slice(0, 90)}"`).join('; ')})`);
    // the captain's log counts the feats and the trophies still to win
    const log = await vp.evaluate(() => {
      const G = window.__game;
      G.dock.open('menu');
      G.dock.ashore();
      G.town.open('tavern');
      G.setFeats({ captures: 3, boardings: 5, rakes: 41, crits: 12, legend: 0, prizes: { privateer: 2, galleon: 1 } });
      return { dd: [...document.querySelectorAll('#tavern-log dd')].map((d) => d.textContent.trim()), text: T.text('tavern-log') };
    });
    check(log.dd.slice(0, 4).join() === '3,5,41,12' && /Admiral.s white coat: 3 of 10 captures/.test(log.text) && /Golden parrot: 41 of 50/.test(log.text),
      `tavern: the captain's log counts captures, boardings, rakes and crits, and the trophies to win ("${log.text.slice(0, 200)}")`);
    await frames(vp, 3);
    await snap(vp, 'tavern.png');
    await ctx.close();
  });

  // --------------------------------------------------------------------------------------------- battle
  await section('battle', async () => {
    const { ctx, page: bp } = await open({ label: 'battle' });
    // dressed at Polly's: a bandana and the navy coat, the crew in red stripes and bandanas
    const dressed = await bp.evaluate(() => {
      const G = window.__game;
      G.dock.open('menu');
      return ['hat.bandana', 'coat.navy', 'shirt.red', 'head.bandanas'].map((id) => G.wardrobe.wear(id).ok);
    });
    const look = await bp.evaluate(async () => {
      const G = window.__game;
      const Cm = await import('/src/cosmetics.js');
      G.dock.leave('title');
      G.state.tutorialDone = true;
      G.newGame(1);
      G.state.intro = 0;
      G.state.combatTime = 30;
      const p = G.player;
      p.speed = 0;
      G.state.sail = 0;
      G.colliders.forEach((c) => (c.x += 5000));
      G.enemies.forEach((e, k) => { e.rise = 1e6; e.x = 400 + k * 30; e.z = 400; });
      const cap = Cm.captainOpts(G.look);
      const sailor = Cm.crewOpts(G.look, 1, {}, null);
      const helm = G.helm ? { hat: G.helm.look.hat, coat: G.helm.look.coat, visible: G.helm.visible } : null;
      // board a battered cutter beside you
      const e = G.spawn('cutter', p.x - Math.cos(p.h) * 8.5, p.z + Math.sin(p.h) * 8.5, p.h);
      e.speed = 0;
      e.rise = 0;
      G.damage(e, e.maxHp * 0.6);
      G.combat.setCrew(e, 3);
      G.state.mode = 'playing';
      const g = G.grapple();
      const seen = [];
      for (let i = 0; i < 120 * 8 && G.boarding.active && G.boarding.phase !== 'brawl'; i++) G.step(1 / 120);
      for (let i = 0; i < 30 && G.boarding.active; i++) G.step(1 / 120);
      G.scene.traverse((o) => {
        if (o.name !== 'boarding-person' || !o.visible) return;
        o.traverse((q) => { if (q.userData && q.userData.look && q.userData.kind) seen.push({ hat: q.userData.look.hat, coat: q.userData.look.coat, shirt: q.userData.look.shirt, stripes: q.userData.look.stripes }); });
      });
      const phase = G.boarding.phase;
      G.boarding.resolveNow();
      G.state.mode = 'paused';
      return { cap: { hat: cap.hat, coat: cap.coat }, sailor: { hat: sailor.hat, shirt: sailor.shirt }, helm, grapple: g.ok, phase, seen };
    });
    const capInParty = look.seen.filter((s) => s.hat === look.cap.hat && s.coat === look.cap.coat).length;
    const crewInParty = look.seen.filter((s) => s.shirt === look.sailor.shirt && s.hat === look.sailor.hat).length;
    check(dressed.every(Boolean) && look.helm && look.helm.hat === look.cap.hat && look.helm.coat === look.cap.coat && look.helm.visible,
      `the captain's look at the helm in battle: ${look.cap.hat} and the navy coat (${J(look.helm)})`);
    check(look.grapple && look.phase === 'brawl' && capInParty === 1 && crewInParty >= 1, `the captain and his uniformed sailors (red stripes, bandanas) in the boarding party (${J({ phase: look.phase, capInParty, crewInParty, party: look.seen })})`);
    await ctx.close();
  });

  // -------------------------------------------------------------------------------------------- records
  await section('records', async () => {
    // Corrupt records: each falls back to valid values and is rewritten; the town still works.
    const corrupt = {
      ...RETURNING,
      'pirates-ahoy-look': '{"v":1,"cap":{"hat":"crown","coat":"gold","beard":7,"__proto__":{"pet":"parrot"}},"crew":"x","own":["hat.crown","hat.bicorne","nope"',
      'pirates-ahoy-feats': '{"captures":-5,"boardings":"9","rakes":1e9,"crits":2.5,"legend":3,"prizes":{"kraken":4,"galleon":"2"}}',
      'pirates-ahoy-armory': '{"up":{"boarders":99,"cutlass":"1","grapple":1.5,"gunner":-1,"cannons":2}}',
      'pirates-ahoy-tips': 'lots',
    };
    const { ctx, page: rp } = await open({ label: 'records', store: corrupt });
    const rec = await rp.evaluate(async () => {
      const G = window.__game;
      const Cm = await import('/src/cosmetics.js');
      const A = await import('/src/armory.js');
      const raw = (k) => localStorage.getItem(k);
      return {
        look: { mem: Cm.serializeLook(G.look), saved: raw('pirates-ahoy-look'), def: Cm.serializeLook(Cm.defaultLook()) },
        feats: { mem: Cm.serializeFeats(G.feats), saved: raw('pirates-ahoy-feats'), feats: G.feats },
        armory: { mem: A.serializeArmoryConfig(G.armory.config), saved: raw('pirates-ahoy-armory'), up: G.armory.config.up, max: A.armoryMaxTier('boarders') },
        tips: { mem: G.tips, saved: raw('pirates-ahoy-tips') },
      };
    });
    const town = await rp.evaluate(() => {
      const G = window.__game;
      G.dock.open('menu');
      G.dock.ashore();
      const a = T.pos();
      T.down('w', 'KeyW');
      G.town.simulate(0.5, null);
      T.up('w', 'KeyW');
      return { view: G.town.view, moved: Math.hypot(T.pos().x - a.x, T.pos().z - a.z) > 0.5, wear: G.wardrobe.wear('hat.straw').ok };
    });
    check(rec.look.saved === rec.look.mem && rec.look.mem === rec.look.def, `saved records: a cut pirates-ahoy-look falls back to the default look and is rewritten (${rec.look.saved})`);
    const F = rec.feats.feats;
    check(rec.feats.saved === rec.feats.mem && rec.feats.saved !== corrupt['pirates-ahoy-feats'] && F.captures === 0 && [F.captures, F.boardings, F.rakes, F.crits].every((v) => Number.isInteger(v) && v >= 0 && v <= 1e6) && (F.legend === 0 || F.legend === 1) && !('kraken' in (F.prizes || {})),
      `saved records: a hostile pirates-ahoy-feats is cleaned field by field and rewritten (${rec.feats.saved})`);
    const U = rec.armory.up;
    check(rec.armory.saved === rec.armory.mem && rec.armory.saved !== corrupt['pirates-ahoy-armory'] && U.boarders === rec.armory.max && U.grapple === 0 && U.gunner === 0 && !('cannons' in U),
      `saved records: a hostile pirates-ahoy-armory is clamped field by field and rewritten (${rec.armory.saved})`);
    check(rec.tips.mem === 0 && rec.tips.saved === '0', `saved records: a garbage pirates-ahoy-tips falls back to 0 and is rewritten (${J(rec.tips)})`);
    check(town.view === 'town' && town.moved && town.wear, `saved records: after the repairs the town works: ashore, walking, wearing (${J(town)})`);
    await ctx.close();
    // Storage blocked: the visit works with defaults; wearing lasts for the visit, nothing is paid for that
    // could not be saved.
    const deny = () => {
      const no = () => { throw new DOMException('denied', 'SecurityError'); };
      Storage.prototype.getItem = no;
      Storage.prototype.setItem = no;
      Storage.prototype.removeItem = no;
    };
    const { ctx: bctx, page: blk } = await open({ label: 'blocked', store: null, init: deny });
    const blocked = await blk.evaluate(() => {
      const G = window.__game;
      G.state.purse = 500;
      G.dock.open('menu');
      G.dock.ashore();
      const a = T.pos();
      T.down('w', 'KeyW');
      G.town.simulate(0.5, null);
      T.up('w', 'KeyW');
      const moved = Math.hypot(T.pos().x - a.x, T.pos().z - a.z);
      const wear = G.wardrobe.wear('hat.straw');
      G.town.open('tailor');
      const buy = G.wardrobe.buy('hat.plume');
      const purseAfterBuy = G.state.purse;
      G.town.back();
      G.town.open('tavern');
      const arm = G.armory.buy('boarders');
      return { view: G.town.view, moved: +moved.toFixed(2), wear, hat: G.look.cap.hat, captain: G.town.captain.userData.look.hat, buy, purseAfterBuy, arm, purse: G.state.purse, boarders: G.armory.config.up.boarders };
    });
    check(blocked.view === 'tavern' && blocked.moved > 0.5 && blocked.wear.ok && blocked.hat === 'straw' && blocked.captain === 'straw' && blocked.buy.ok === false && blocked.buy.reason === 'storage' && blocked.purseAfterBuy === 500 && blocked.arm === false && blocked.purse === 500 && blocked.boarders === 0,
      `storage blocked: walking and wearing work for the visit; Polly's and the tavern sell nothing that couldn't be saved, and nothing is paid (${J(blocked)})`);
    await bctx.close();
  });

  // --------------------------------------------------------------------------------------------- layout
  await section('layout', async () => {
    const probes = () => {
      const R = (el) => el.getBoundingClientRect();
      const ov = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const inside = (r, box) => r.left >= box.left - 0.5 && r.top >= box.top - 0.5 && r.right <= box.right + 0.5 && r.bottom <= box.bottom + 0.5;
      const shown = (el) => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible' && !el.closest('.hidden');
      const name = (el) => el.id || el.dataset.place || el.dataset.item || el.dataset.armory || el.dataset.exit || (el.className && String(el.className).split(' ')[0]) || el.tagName;
      const text = (n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
      const cut = (el) => [el, ...el.querySelectorAll('*')].filter((n) => text(n) && getComputedStyle(n).display !== 'inline' && n.clientWidth > 1 && n.scrollWidth > n.clientWidth + 1);
      const pageScroll = () => {
        const de = document.documentElement;
        return de.scrollWidth > innerWidth + 1 || de.scrollHeight > innerHeight + 1 ? `the page scrolls (${de.scrollWidth}x${de.scrollHeight})` : null;
      };
      const screen = () => ({ left: 0, top: 0, right: innerWidth, bottom: innerHeight });
      // a control is fine when on screen (after scrolling its panel to it), ≥ 44 px, uncovered, its label whole
      function reach(el, out, box = null, scroller = null) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        // (an item taller than the list's scroll padding allows is shown whole by centring it, as a finger would)
        if (scroller && !inside(R(el), R(scroller)) && R(el).height <= scroller.clientHeight) {
          scroller.scrollTop += R(el).top - R(scroller).top - (scroller.clientHeight - R(el).height) / 2;
        }
        const r = R(el);
        if (window.scrollX || window.scrollY) out.push(`showing ${name(el)} scrolled the page`);
        if (!inside(r, screen()) || (box && !inside(r, R(box))) || (scroller && !inside(r, R(scroller)))) out.push(`${name(el)} can't be scrolled into view`);
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!hit || !(hit === el || el.contains(hit))) out.push(`${name(el)} is covered by ${hit && name(hit)}`);
        if (r.width < 44 || r.height < 44) out.push(`${name(el)} is only ${Math.round(r.width)}x${Math.round(r.height)}`);
        if (cut(el).length) out.push(`${name(el)}'s label is cut off`);
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
          if (body.scrollWidth > body.clientWidth + 1) out.push('the panel scrolls sideways');
          const controls = [...P.querySelectorAll('button')].filter(shown);
          for (const part of ['.dock-head', '.dock-tabs', '.dock-body', '.dock-exits']) noOverlap(controls.filter((b) => b.closest(part)), part, out);
          for (const el of controls) reach(el, out, P, el.closest('.dock-body') ? body : null);
          body.scrollTop = 0;
          return { problems: out, count: controls.length };
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
        // small text against what is behind it (texts over the 3D view must sit on a solid plate)
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
    const SIZES = [[320, 480, true], [360, 640, true], [390, 844, true], [844, 390, true], [568, 320, true], [1024, 600, false], [1280, 720, false]];
    for (const touch of [true, false]) {
      const { ctx, page: lp } = await open({ touch, width: touch ? 390 : 1280, height: touch ? 844 : 720, label: touch ? 'layout-touch' : 'layout' });
      await lp.evaluate(probes);
      await lp.evaluate(() => { window.__game.dock.open('menu'); window.__game.dock.ashore(); });
      for (const [w, h] of SIZES.filter((s) => s[2] === touch)) {
        const tag = `${w}x${h}${touch ? ' touch' : ''}`;
        await lp.setViewportSize({ width: w, height: h });
        await lp.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [w, h], { timeout: 60000 });
        // the town HUD with the prompt up (at Polly's door)
        await lp.evaluate(() => { const G = window.__game; if (G.town.view !== 'town') G.town.back(); T.town().enter('tailor'); G.town.simulate(0.2, { x: 0, z: 0 }); });
        await frames(lp, 2);
        const town = await lp.evaluate(() => window.__probe.town());
        const tc = await lp.evaluate(() => window.__probe.contrast('#town-screen'));
        check(town.problems.length === 0, `layout ${tag}: town HUD (${town.controls.join(', ')}) on screen, ≥ 44 px, nothing overlapping, no page scroll${town.problems.length ? ' -> ' + town.problems.join('; ') : ''}`);
        check(tc.n >= 5 && tc.bad.length === 0, `layout ${tag}: the town HUD's ${tc.n} texts reach 4.5:1 on solid plates${tc.bad.length ? ' -> ' + J(tc.bad) : ''}`);
        // the wardrobe: both tabs, with a try-on
        await lp.evaluate(() => { const G = window.__game; G.town.open('tailor'); G.town.api.wardrobe.click('hat.plume'); });
        await frames(lp, 2);
        const w1 = await lp.evaluate(() => window.__probe.panel('wardrobe-panel'));
        const wc1 = await lp.evaluate(() => window.__probe.contrast('#wardrobe-panel'));
        await lp.evaluate(() => { const G = window.__game; G.town.api.wardrobe.tab('crew'); G.town.api.wardrobe.click('shirt.navy'); });
        await frames(lp, 2);
        const w2 = await lp.evaluate(() => window.__probe.panel('wardrobe-panel'));
        const wc2 = await lp.evaluate(() => window.__probe.contrast('#wardrobe-panel'));
        const wp = [...new Set(w1.problems.concat(w2.problems))];
        check(wp.length === 0 && w1.count > 10 && w2.count > 5, `layout ${tag}: wardrobe (${w1.count} + ${w2.count} controls, both tabs, trying on) reachable, ≥ 44 px, nothing overlapping${wp.length ? ' -> ' + wp.join('; ') : ''}`);
        check(wc1.bad.length + wc2.bad.length === 0, `layout ${tag}: the wardrobe's ${wc1.n + wc2.n} texts reach 4.5:1${wc1.bad.length + wc2.bad.length ? ' -> ' + J(wc1.bad.concat(wc2.bad)) : ''}`);
        // the tavern
        await lp.evaluate(() => { const G = window.__game; G.town.back(); G.town.open('tavern'); });
        await frames(lp, 2);
        const tv = await lp.evaluate(() => window.__probe.panel('tavern-panel'));
        const tvc = await lp.evaluate(() => window.__probe.contrast('#tavern-panel'));
        check(tv.problems.length === 0 && tv.count >= 5, `layout ${tag}: tavern (${tv.count} controls) reachable, ≥ 44 px, nothing overlapping${tv.problems.length ? ' -> ' + tv.problems.join('; ') : ''}`);
        check(tvc.bad.length === 0, `layout ${tag}: the tavern's ${tvc.n} texts reach 4.5:1${tvc.bad.length ? ' -> ' + J(tvc.bad) : ''}`);
        // the Harbour menu and All aboard?
        await lp.evaluate(() => { const G = window.__game; G.town.back(); T.town().enter({ x: 0.5, z: -9, h: Math.PI }); G.town.simulate(0.1, { x: 0, z: 0 }); G.town.api.harbour(); });
        const hd = await lp.evaluate(() => window.__probe.dialog('harbour-dialog'));
        const hdc = await lp.evaluate(() => window.__probe.contrast('#harbour-dialog'));
        await lp.evaluate(() => { const G = window.__game; G.town.back(); G.town.open('ship'); });
        const ad = await lp.evaluate(() => window.__probe.dialog('aboard-dialog'));
        const adc = await lp.evaluate(() => window.__probe.contrast('#aboard-dialog'));
        await lp.evaluate(() => window.__game.town.back());
        const dp = hd.problems.concat(ad.problems);
        check(dp.length === 0 && hd.count >= 5 && ad.count >= 2, `layout ${tag}: the Harbour menu (${hd.count}) and All aboard? (${ad.count}) on screen, ≥ 44 px, nothing overlapping${dp.length ? ' -> ' + dp.join('; ') : ''}`);
        check(hdc.bad.length + adc.bad.length === 0, `layout ${tag}: the dialogs' texts reach 4.5:1${hdc.bad.length + adc.bad.length ? ' -> ' + J(hdc.bad.concat(adc.bad)) : ''}`);
      }
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------------------------------------- draws
  await section('draws', async () => {
    // Two prize ships moored off the town (the most the town shows).
    const { ctx, page: dp } = await open({ label: 'draws', store: { ...RETURNING, 'pirates-ahoy-feats': '{"captures":4,"boardings":4,"rakes":0,"crits":0,"legend":0,"prizes":{"galleon":1,"manowar":2,"cutter":1}}' } });
    await dp.evaluate(() => { window.__game.dock.open('menu'); window.__game.dock.ashore(); });
    const SPOTS = [['spawn', null], ['plaza', 0.5, -7.2, Math.PI], ['yard', 15.6, -9.9, 2.59], ['tavern', -6.25, -17.15, Math.PI], ['tower', -15.5, -27.2, Math.PI], ['garden', -14.4, -7.6, Math.PI / 2]];
    const calls = [];
    for (const [name, x, z, h] of SPOTS) {
      await dp.evaluate(([x, z, h]) => {
        const t = T.town();
        if (x === null) t.enter('spawn');
        else t.enter({ ...(t.walk.snap(x, z, 3) || { x, z }), h });
        window.__game.town.simulate(0.6, { x: 0, z: 0 });
      }, [x, z, h]);
      await frames(dp, 3);
      calls.push({ name, calls: await dp.evaluate(() => window.__game.renderInfo.calls) });
    }
    // town.png: the captain on the plaza, the town ahead (a greeting started by the fixed-step walk has run out)
    await dp.evaluate(() => { const t = T.town(); t.enter({ ...(t.walk.snap(0.5, -7.6, 3) || { x: 0.5, z: -7.6 }), h: Math.PI - 0.35 }); t.recenter(); window.__game.town.simulate(3, { x: 0, z: 0 }); });
    await frames(dp, 3);
    await snap(dp, 'town.png');
    // (the two most valuable captured kinds are moored off the east arm in the walk view)
    const prizes = await dp.evaluate(() => {
      const out = [];
      window.__game.env.group.traverse((o) => { if (o.userData && (o.userData.type === 'galleon' || o.userData.type === 'manowar') && o.visible) out.push(o.userData.type); });
      return out.sort();
    });
    check(prizes.join() === 'galleon,manowar' && calls.every((c) => c.calls > 0 && c.calls <= 450), `draw calls: the walk view stays within 450 at 6 spots (${calls.map((c) => `${c.name} ${c.calls}`).join(', ')}; prize ships moored: ${prizes.join(', ')})`);
    // Polly's view (the captain on the podium, then the crew line-up) and the tavern's.
    await dp.evaluate(() => { const G = window.__game; G.town.open('tailor'); G.town.api.wardrobe.click('hat.plume'); });
    await frames(dp, 3);
    const polly = await dp.evaluate(() => window.__game.renderInfo.calls);
    await snap(dp, 'tailor.png');
    await dp.evaluate(() => window.__game.town.api.wardrobe.tab('crew'));
    await dp.waitForFunction(() => window.__game.town.api.lineup.length === 3, null, { timeout: 60000 }).catch(() => {});
    await frames(dp, 3);
    const lineup = await dp.evaluate(() => window.__game.renderInfo.calls);
    await dp.evaluate(() => { const G = window.__game; G.town.back(); G.town.open('tavern'); });
    await frames(dp, 3);
    const tavern = await dp.evaluate(() => window.__game.renderInfo.calls);
    check([polly, lineup, tavern].every((c) => c > 0 && c <= 450), `draw calls: Polly's view ${polly} (line-up ${lineup}) and the tavern's ${tavern}, within 450`);
    // M mutes in town, and every sound button follows.
    await dp.evaluate(() => { const G = window.__game; G.town.back(); document.getElementById('town-screen').focus(); });
    const m0 = await dp.evaluate(() => window.__game.audio.muted);
    await dp.keyboard.press('m');
    const m1 = await dp.evaluate(() => ({ muted: window.__game.audio.muted, town: document.getElementById('town-mute').getAttribute('aria-pressed'), dock: document.getElementById('dock-mute').getAttribute('aria-pressed') }));
    await dp.keyboard.press('m');
    const m2 = await dp.evaluate(() => ({ muted: window.__game.audio.muted, town: document.getElementById('town-mute').getAttribute('aria-pressed') }));
    check(!m0 && m1.muted && m1.town === 'true' && m1.dock === 'true' && !m2.muted && m2.town === 'false', `M mutes and unmutes in town, the town's sound button in step (${J({ m1, m2 })})`);
    // A lost graphics context in town: it says the town will be back, then focus returns to the town HUD (an
    // open Harbour menu is closed); in Polly's, to the wardrobe's tab.
    const ext = await dp.evaluate(() => { const e = document.getElementById('game').getContext('webgl2')?.getExtension('WEBGL_lose_context'); window.__loseExt = e; return !!e; });
    if (!ext) console.log('SKIP  WEBGL_lose_context is not available; the town context-loss checks were not run');
    else {
      const lose = async (lost) => {
        await dp.evaluate((lost) => (lost ? window.__loseExt.loseContext() : window.__loseExt.restoreContext()), lost);
        await dp.waitForFunction((lost) => window.__game.state.contextLost === lost, lost, { timeout: 30000 }).catch(() => {});
        await frames(dp, 3);
      };
      const out = [];
      for (const where of ['town', 'harbour', 'tailor']) {
        await dp.evaluate((where) => {
          const G = window.__game;
          if (G.town.view !== 'town') G.town.back();
          if (where === 'harbour') G.town.api.harbour();
          if (where === 'tailor') G.town.open('tailor');
          if (where === 'town') document.getElementById('town-screen').focus();
        }, where);
        await lose(true);
        const lost = await dp.evaluate(() => ({ shown: T.shown('recover-screen'), msg: T.text('recover-msg') || T.text('recover-screen') }));
        await lose(false);
        const back = await dp.evaluate(() => ({ view: window.__game.town.view, focus: T.focus(), recover: T.shown('recover-screen'), harbour: T.shown('harbour-dialog'), mode: window.__game.state.mode }));
        out.push({ where, lost, back });
      }
      const wantFocus = { town: 'town-screen', harbour: 'town-screen', tailor: 'wardrobe-tab-captain' };
      check(out.every((o) => o.lost.shown && /town/i.test(o.lost.msg) && !o.back.recover && !o.back.harbour && o.back.mode === 'dock' && o.back.focus === wantFocus[o.where] && o.back.view === (o.where === 'tailor' ? 'tailor' : 'town')),
        `a lost graphics context in town says the town will be back; restored, focus returns to the town HUD (the Harbour menu closed) or to Polly's tab (${J(out)})`);
    }
    await ctx.close();
  });

  // -------------------------------------------------------------------------------------------- review4
  // The Stage 4 review's town fixes, met the way a player meets them (each of these checks failed on ebad6f2):
  // TOWN-1 E at a door and focus off the HUD buttons, TOWN-2 a held Space at the tavern door, TOWN-4 a held Enter
  // or Space at the gangplank, A11Y-2 a held Enter on "Back to town", A11Y-3 a try-on keeps the focused item in
  // view, A11Y-4 the prompt hiding under focus, A11Y-6 the prompt's accessible name, and simulate()'s greeting
  // words (a Stage 3 leftover). Held keys are Playwright's: a second keydown of a held key is a repeat.
  await section('review4', async () => {
    const { ctx, page: kp } = await open({ label: 'review4' });
    const cdp = await ctx.newCDPSession(kp);
    // the accessible name Chromium computes for an element (CDP accessibility tree)
    const axName = async (session, sel) => {
      const { root } = await session.send('DOM.getDocument', { depth: 0 });
      const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
      if (!nodeId) return null;
      const { nodes } = await session.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
      return nodes[0] && nodes[0].name ? nodes[0].name.value : null;
    };
    // a fresh visit to the town (from the title), the captain out of a place's door, focus on the town region
    const atDoor = (id, from = 'menu') => kp.evaluate(([id, from]) => {
      const G = window.__game;
      G.showMenu();
      G.state.level = 1;
      G.dock.open(from);
      G.dock.ashore();
      T.town().enter(id);
      G.town.simulate(0.2, { x: 0, z: 0 });
      document.getElementById('town-screen').focus();
      return { prompt: G.town.api.prompt, purse: G.state.purse, armory: localStorage.getItem('pirates-ahoy-armory'), muted: G.audio.muted };
    }, [id, from]);
    const now = () => kp.evaluate(() => ({ mode: window.__game.state.mode, level: window.__game.state.level, view: window.__game.town.view, focus: T.focus(), auto: window.__game.town.api.auto && window.__game.town.api.auto.place, purse: window.__game.state.purse, armory: localStorage.getItem('pirates-ahoy-armory'), muted: window.__game.audio.muted, harbour: T.shown('harbour-dialog'), aboard: T.shown('aboard-dialog') }));

    // TOWN-1: E goes in whatever has focus; a walking key takes focus off a town HUD button; a mouse click on 🔊 or ☰
    // leaves no focus there, so Enter at the next door goes in (not a second press of that button).
    await atDoor('spawn');
    const walkOff = await kp.evaluate(() => {
      const G = window.__game;
      const out = [];
      for (const id of ['place:tavern', 'town-menu-btn', 'town-mute']) {
        T.at(0.5, -9, Math.PI);
        (id.startsWith('place:') ? document.querySelector(`#town-places [data-place="${id.slice(6)}"]`) : document.getElementById(id)).focus();
        const before = T.focus();
        T.down('w', 'KeyW');
        G.town.simulate(0.2, null);
        T.up('w', 'KeyW');
        G.town.simulate(0.1, { x: 0, z: 0 });
        out.push({ before, after: T.focus() });
      }
      return out;
    });
    await atDoor('tavern');
    await kp.evaluate(() => document.querySelector('#town-places [data-place="tailor"]').focus());
    await kp.keyboard.press('e');
    const eKey = await now();
    const m0 = await atDoor('tavern');
    await kp.click('#town-mute');
    const m1 = await now();
    await kp.keyboard.press('Enter');
    const m2 = await now();
    await kp.evaluate(() => { if (window.__game.audio.muted) document.getElementById('town-mute').click(); });
    const h0 = await atDoor('tavern');
    await kp.click('#town-menu-btn');
    await kp.click('#harbour-walk-btn');
    const h1 = await now();
    await kp.keyboard.press('Enter');
    const h2 = await now();
    check(walkOff.every((w) => w.before !== 'town-screen' && w.after === 'town-screen') && eKey.view === 'tavern' &&
      !m0.muted && m1.muted && m1.focus !== 'town-mute' && m2.view === 'tavern' && m2.muted === true &&
      !h1.harbour && h1.focus === 'town-screen' && h2.view === 'tavern' && !h2.harbour && h2.purse === h0.purse,
      `TOWN-1: a walking key moves focus off the places bar, ☰ and 🔊 to the town; E goes in with a places-bar button focused; after a mouse click on 🔊, or on ☰ then Keep walking, Enter at the tavern door goes in (not unmuting, not the Harbour menu again) (${J({ walkOff, eKey: eKey.view, m1: { focus: m1.focus, muted: m1.muted }, m2: { view: m2.view, muted: m2.muted }, h1: { open: h1.harbour, focus: h1.focus }, h2: { view: h2.view, harbour: h2.harbour, purse: h2.purse } })})`);

    // TOWN-2: Space (or Enter) held at the tavern door opens the tavern once and buys nothing: its auto-repeat lands
    // on the first Buy button and is ignored.
    const held = [];
    for (const key of [' ', 'Enter']) {
      const d = await atDoor('tavern');
      await kp.keyboard.down(key);
      for (let i = 0; i < 3; i++) await kp.keyboard.down(key);
      await kp.keyboard.up(key);
      await frames(kp, 2);
      const a = await now();
      held.push({ key: key === ' ' ? 'Space' : key, prompt: d.prompt, view: a.view, focus: a.focus, purse: [d.purse, a.purse], armory: a.armory });
    }
    check(held.every((h) => /Salty Sparrow/.test(h.prompt || '') && h.view === 'tavern' && h.focus === 'armory:boarders' && h.purse[0] === h.purse[1] && h.armory === null),
      `TOWN-2: Space or Enter held at the tavern door opens the tavern and buys nothing (the purse and the armory unchanged) (${J(held)})`);

    // TOWN-4: Enter or Space held at the gangplank opens All aboard? and stays there (the repeat doesn't press its
    // first way out: after a cleared level that would set sail for level 2).
    const aboard = [];
    for (const key of ['Enter', ' ']) {
      const d = await atDoor('spawn', 'levelDone');
      await kp.keyboard.down(key);
      for (let i = 0; i < 3; i++) await kp.keyboard.down(key);
      await kp.keyboard.up(key);
      await frames(kp, 4); // (the dock's ways out act two frames after their press)
      const a = await now();
      aboard.push({ key: key === ' ' ? 'Space' : key, prompt: d.prompt, mode: a.mode, level: a.level, aboard: a.aboard, focus: a.focus });
      await kp.evaluate(() => { if (T.shown('aboard-dialog')) document.getElementById('aboard-stay-btn').click(); });
    }
    check(aboard.every((a) => /Sea Biscuit/.test(a.prompt || '') && a.mode === 'dock' && a.aboard && /^aboard-/.test(a.focus || '')),
      `TOWN-4: Enter or Space held at the gangplank (after a cleared level) opens All aboard? and waits there, nothing set off (${J(aboard)})`);

    // A11Y-2: Enter held on "Back to town" in Polly's or the tavern: back in town once, focus on that place's button,
    // and the repeat doesn't press it (he'd walk straight back in).
    const backs = [];
    for (const place of ['tailor', 'tavern']) {
      await atDoor('spawn');
      await kp.evaluate((place) => window.__game.town.open(place), place);
      await frames(kp, 2);
      await kp.evaluate((place) => document.getElementById(place === 'tailor' ? 'wardrobe-back-btn' : 'tavern-back-btn').focus(), place);
      await kp.keyboard.down('Enter');
      await kp.keyboard.down('Enter');
      await kp.keyboard.up('Enter');
      const r = await kp.evaluate(() => {
        const G = window.__game;
        if (G.town.view === 'town') G.town.simulate(0.5, null); // (a walk the repeat may have started)
        return { view: G.town.view, focus: T.focus(), auto: G.town.api.auto && G.town.api.auto.place };
      });
      backs.push({ place, ...r });
    }
    check(backs.every((b) => b.view === 'town' && b.focus === `place:${b.place}` && !b.auto),
      `A11Y-2: Enter held on "Back to town" in Polly's and the tavern goes back to town once, focus on the place's button (${J(backs)})`);

    // A11Y-4: the prompt has focus and he walks away from the door: focus goes to the town region, not the page.
    await atDoor('tavern');
    const a4 = await kp.evaluate(() => {
      const G = window.__game;
      const prompt = G.town.api.prompt;
      document.getElementById('town-prompt').focus();
      const on = T.focus();
      T.at(0.5, -9, Math.PI); // (moved off without a key: the prompt hides while it has focus)
      return { prompt, on, gone: G.town.api.prompt, after: T.focus() };
    });
    check(!!a4.prompt && a4.on === 'town-prompt' && a4.gone === null && a4.after === 'town-screen', `A11Y-4: the prompt hiding under focus hands focus to the town region (${J(a4)})`);

    // A11Y-6: the prompt's accessible name reads as words ("The Sea Biscuit: press Enter to go aboard"), on touch too.
    const names = {};
    await atDoor('spawn');
    names.ship = await axName(cdp, '#town-prompt');
    await atDoor('tavern');
    names.tavern = await axName(cdp, '#town-prompt');
    const touch = await open({ width: 390, height: 844, touch: true, label: 'review4-touch' });
    const tcdp = await touch.ctx.newCDPSession(touch.page);
    await touch.page.evaluate(() => { const G = window.__game; G.dock.open('menu'); G.dock.ashore(); G.town.simulate(0.2, { x: 0, z: 0 }); });
    names.touchShip = await axName(tcdp, '#town-prompt');
    check(names.ship === 'The Sea Biscuit: press Enter to go aboard' && names.tavern === 'The Salty Sparrow: press Enter to go in' && names.touchShip === 'The Sea Biscuit: All aboard',
      `A11Y-6: the town prompt's accessible name is a phrase, not its parts run together (${J(names)})`);

    // A11Y-3: on a phone, a keyboard try-on of a priced item at the foot of Polly's list keeps that item in view
    // (the Buy row that appears above the group's items no longer pushes it under the panel's edge).
    const tp = touch.page;
    await tp.evaluate(() => window.__game.town.open('tailor'));
    await frames(tp, 2);
    const vis = () => tp.evaluate(() => {
      T.finish();
      const body = document.querySelector('#wardrobe-panel .dock-body');
      const item = document.querySelector('#wardrobe-captain [data-item="pet.parrot"]');
      const r = item.getBoundingClientRect();
      const b = body.getBoundingClientRect();
      return { shown: Math.round(Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top))), of: Math.round(r.height), focus: T.focus(), trial: window.__game.town.api.trial };
    });
    await tp.evaluate(() => {
      T.finish();
      const item = document.querySelector('#wardrobe-captain [data-item="pet.parrot"]');
      item.focus({ preventScroll: true });
      item.scrollIntoView({ block: 'end' }); // (where Tab leaves an item it reaches going down: at the list's foot)
    });
    const before = await vis();
    await tp.keyboard.press('Enter');
    await frames(tp, 2);
    const after = await vis();
    check(before.shown === before.of && before.focus === 'item:pet.parrot' && after.trial === 'pet.parrot' && after.focus === 'item:pet.parrot' && after.shown >= after.of - 1,
      `A11Y-3: at 390x844 touch, Enter on the Red parrot at the foot of Polly's list tries it on and the focused item stays in view (${after.shown} of ${after.of} px; ${J({ before, after })})`);
    await touch.ctx.close();

    // Stage 3 leftover: simulate() next to a greeter: it says so (greet) and the bubble has the greeting's words.
    await atDoor('spawn');
    const greet = await kp.evaluate(() => {
      const G = window.__game;
      const t = T.town();
      const tries = [];
      for (const f of G.env.folk().filter((q) => q.greets)) {
        const s = t.walk.snap(f.x + 1.2, f.z, 1.5);
        if (!s) continue;
        t.enter({ x: s.x, z: s.z, h: 0 });
        const r = G.town.simulate(1, { x: 0, z: 0 });
        const b = document.querySelector('#town-screen .town-bubble');
        tries.push({ folk: f.index, greet: r && r.greet, text: b ? b.textContent.trim() : null });
        if ((r && r.greet) || tries.length >= 12) break;
      }
      return tries;
    });
    const g = greet[greet.length - 1] || {};
    check(g.greet === true && !!g.text, `simulate() beside a townsperson who greets: the result says greet, and the bubble has the words ("${g.text}"; ${J(greet)})`);
    await ctx.close();
  });

  // -------------------------------------------------------------------------------------- review4-world
  // The Stage 4 review's fixes to the island and its costs (each of these checks failed on ebad6f2): TOWN-3 W held
  // across every rope bridge, a few degrees off its line, and a places-bar walk from a bridge mouth; LOOK-2 walkers
  // wait for the captain; LOOK-4 the market awnings out of the walk camera's face; LOOK-5 planks over the plaza /
  // tavern seam; PERF-1 tavern buys rebuild the docked ship only for grapples; PERF-2 the prize ships built when the
  // dock opens; PERF-3 Polly's crew clicks don't rebuild the cleaning crew. Stepped in-page (G.town.simulate and,
  // for the townsfolk, env.update by hand), so the real loop never moves anything in between.
  await section('review4-world', async () => {
    const feats = '{"captures":2,"boardings":0,"rakes":0,"crits":0,"legend":0,"prizes":{"galleon":1,"manowar":1}}';
    const { ctx, page: wp } = await open({ label: 'review4-world', store: { ...RETURNING, 'pirates-ahoy-purse': '5000', 'pirates-ahoy-feats': feats } });

    // PERF-2: the moored prize ships are built when the dock opens (hidden in the shipyard view), and Go ashore
    // shows the same ships rather than building them then.
    const prizes = await wp.evaluate(() => {
      const G = window.__game;
      const ships = () => {
        const out = [];
        G.env.group.traverse((o) => { if (o.userData && Array.isArray(o.userData.sails) && (o.userData.type === 'galleon' || o.userData.type === 'manowar') && o !== G.dock.ship) out.push(o); });
        return out;
      };
      G.dock.open('menu');
      const before = ships();
      const shown = before.map((o) => o.visible);
      G.dock.ashore();
      G.town.simulate(0.2, { x: 0, z: 0 });
      const after = ships();
      return { before: before.map((o) => o.userData.type).sort(), shownInShipyard: shown, after: after.map((o) => o.userData.type).sort(), same: after.length === before.length && after.every((o) => before.includes(o)) };
    });
    check(prizes.before.join() === 'galleon,manowar' && prizes.shownInShipyard.every((v) => v === false) && prizes.same,
      `PERF-2: the two prize ships are built (hidden) when the dock opens, and Go ashore moors those same ships (${J(prizes)})`);

    // TOWN-3: W held from each land end of each rope bridge (on it, or half a unit before it), the camera squared
    // behind him, heading on the bridge's line or 5° off: he gets across every time (the townsfolk set aside).
    const bridges = await wp.evaluate(() => {
      const G = window.__game;
      const t = T.town();
      const env = G.env;
      const folk = env.folk;
      env.folk = () => [];
      const stops = [];
      let runs = 0;
      let slowest = 0;
      try {
        for (const link of env.walk.links) {
          for (const dir of [1, -1]) {
            const pts = dir === 1 ? link.pts : [...link.pts].reverse();
            const a = pts[0];
            const b = pts[pts.length - 1];
            const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
            const ux = (b[0] - a[0]) / L;
            const uz = (b[2] - a[2]) / L;
            for (const back of [0, 0.5]) {
              for (const off of [0, 5, -5]) {
                const st = t.walk.snap(a[0] - ux * back, a[2] - uz * back, 0.5) || { x: a[0], z: a[2] };
                t.enter({ x: st.x, z: st.z, h: Math.atan2(ux, uz) + (off * Math.PI) / 180 });
                t.recenter();
                let k = 0;
                let along = 0;
                for (; k < 600; k++) {
                  G.town.simulate(1 / 60, { x: 0, z: 1 });
                  const c = t.captain;
                  along = ((c.x - a[0]) * ux + (c.z - a[2]) * uz) / L;
                  if (along > 1.02 || G.town.view !== 'town') break;
                }
                G.town.simulate(0.1, { x: 0, z: 0 });
                runs++;
                if (along > 1.02) slowest = Math.max(slowest, k / 60);
                else stops.push(`${link.id}${dir > 0 ? '>' : '<'} ${back} back ${off}°: stopped at ${Math.round(along * 100)}%`);
                if (G.town.view !== 'town') G.town.back();
              }
            }
          }
        }
        // a places-bar walk to the tavern from the plaza end of the yard bridge (it used to stall at the corner)
        t.enter({ x: 7.9045, z: -12.4263, h: -0.81 });
        G.town.goTo('tavern');
        let i = 0;
        for (; i < 900 && G.town.view === 'town' && G.town.api.auto; i++) G.town.simulate(1 / 30);
        var corner = { view: G.town.view, seconds: +(i / 30).toFixed(1), at: [+G.town.pos.x.toFixed(2), +G.town.pos.z.toFixed(2)] };
        if (G.town.view !== 'town') G.town.back();
      } finally {
        env.folk = folk;
      }
      return { links: env.walk.links.length, runs, stops, slowest: +slowest.toFixed(2), corner };
    });
    check(bridges.links >= 4 && bridges.runs === bridges.links * 12 && bridges.stops.length === 0 && bridges.corner.view === 'tavern',
      `TOWN-3: W held across every rope bridge from both ends, on the line or 5° off, gets across (${bridges.runs} runs, ${bridges.stops.length} stopped, slowest crossing ${bridges.slowest} s); the places-bar walk from the yard bridge's plaza end reaches the tavern (${J({ stops: bridges.stops.slice(0, 8), corner: bridges.corner })})`);

    // LOOK-2: the captain stands on a walker's round (the porter's, the bandana stroller's): over a minute, nobody
    // walks through him. (The town and the townsfolk stepped together by hand, 1/30 s at a time.)
    const walkers = await wp.evaluate(async () => {
      const G = window.__game;
      const env = G.env;
      // the visual clock the real loop gives env.update: one frame's, then on from there by hand
      let t = null;
      const upd = env.update;
      env.update = function (tt, ...rest) {
        t = tt;
        return upd.call(this, tt, ...rest);
      };
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      env.update = upd;
      if (!Number.isFinite(t)) t = 100;
      const step = (dt) => {
        G.town.simulate(dt, { x: 0, z: 0 });
        t += dt;
        env.update(t, dt, { simTime: G.state.time, camera: G.camera });
      };
      const out = [];
      for (const [name, x, z] of [['porter', 1.45, -6.6], ['stroller', -6.6, -5.9]]) {
        const p0 = T.at(x, z, Math.PI);
        for (let i = 0; i < 30; i++) step(1 / 30);
        let min = { d: 9 };
        for (let i = 0; i < 60 * 30; i++) {
          step(1 / 30);
          const c = T.pos();
          for (const q of env.folk()) {
            const d = Math.hypot(q.x - c.x, q.z - c.z);
            if (d < min.d) min = { d: +d.toFixed(2), folk: q.index, t: +(i / 30).toFixed(1) };
          }
        }
        const p1 = T.pos();
        out.push({ name, at: [+p0.x.toFixed(2), +p0.z.toFixed(2)], moved: +Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2), closest: min });
      }
      return out;
    });
    check(walkers.every((w) => w.moved < 0.2 && w.closest.d > 0.5),
      `LOOK-2: standing on a townsperson's round for a minute, nobody walks through the captain (closest ${walkers.map((w) => `${w.name} ${w.closest.d} u`).join(', ')}; bodies touch at 0.65) (${J(walkers)})`);

    // LOOK-4: the places-bar walks to the tavern (from the spawn, Polly's and the shipyard) at 1280x720: the fruit
    // stall's awning by the tavern door (it filled the lower right quarter as he reached the door) stays under 18% of
    // the view and over 15% for at most 0.2 s; no market awning ever fills a fifth of it. (The townsfolk set aside, as
    // above: the walk, and so the camera, is then the same every run.)
    const awnings = await wp.evaluate(async () => {
      const THREE = await import('three');
      const G = window.__game;
      const t = T.town();
      // an awning's top: 2.7 wide, 1.6 deep, tilted 0.28 rad, its centre 2.42 above the deck (1.3) and 0.25 in
      // front of the stall (src/env/sparrow.js STALLS, at z -12.4)
      const quad = (sx) => {
        const y = 1.3 + 2.42;
        const c = Math.cos(0.28) * 0.8;
        const s = Math.sin(0.28) * 0.8;
        const z = -12.4 + 0.25;
        return [[sx - 1.35, y + s, z - c], [sx + 1.35, y + s, z - c], [sx + 1.35, y - s, z + c], [sx - 1.35, y - s, z + c]].map((p) => new THREE.Vector3(...p));
      };
      // the share of the screen a projected quad covers (clipped to the view)
      const share = (poly) => {
        for (const [inside, tOf] of [[(p) => p.x >= -1, (a, b) => (-1 - a.x) / (b.x - a.x)], [(p) => p.x <= 1, (a, b) => (1 - a.x) / (b.x - a.x)], [(p) => p.y >= -1, (a, b) => (-1 - a.y) / (b.y - a.y)], [(p) => p.y <= 1, (a, b) => (1 - a.y) / (b.y - a.y)]]) {
          const res = [];
          for (let i = 0; i < poly.length; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            if (inside(a)) res.push(a);
            if (inside(a) !== inside(b)) {
              const k = tOf(a, b);
              res.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
            }
          }
          poly = res;
          if (!poly.length) return 0;
        }
        let A = 0;
        for (let i = 0; i < poly.length; i++) A += poly[i].x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * poly[i].y;
        return Math.abs(A) / 8;
      };
      const out = [];
      const folk = G.env.folk;
      G.env.folk = () => [];
      try {
        for (const from of ['spawn', 'tailor', 'shipyard']) {
          if (G.town.view !== 'town') G.town.back();
          t.enter(from);
          t.recenter();
          G.town.simulate(0.6, { x: 0, z: 0 });
          G.town.goTo('tavern');
          let worst = 0;
          let fruit = 0;
          let fruitOver = 0;
          let i = 0;
          for (; i < 900 && G.town.view === 'town'; i++) {
            G.town.simulate(1 / 30);
            const cam = G.camera;
            cam.updateMatrixWorld();
            for (const sx of [-3.2, 0.6, 4.4]) {
              const q = quad(sx);
              if (q.some((v) => v.clone().applyMatrix4(cam.matrixWorldInverse).z > -0.05)) continue; // (behind the lens)
              const f = share(q.map((v) => v.clone().project(cam)).map((p) => ({ x: p.x, y: p.y })));
              worst = Math.max(worst, f);
              if (sx === -3.2) {
                fruit = Math.max(fruit, f);
                if (f > 0.15) fruitOver += 1 / 30;
              }
            }
          }
          out.push({ from, view: G.town.view, seconds: +(i / 30).toFixed(1), fruit: +fruit.toFixed(3), fruitOver15: +fruitOver.toFixed(2), anyAwning: +worst.toFixed(3) });
          if (G.town.view !== 'town') G.town.back();
        }
      } finally {
        G.env.folk = folk;
      }
      return out;
    });
    check(awnings.every((a) => a.view === 'tavern' && a.fruit < 0.18 && a.fruitOver15 <= 0.2 && a.anyAwning < 0.2),
      `LOOK-4: on the places-bar walks to the tavern the fruit stall's awning stays out of the walk camera's face (at most ${awnings.map((a) => `${a.from} ${Math.round(a.fruit * 100)}%`).join(', ')} of the view; any awning at most ${Math.round(Math.max(...awnings.map((a) => a.anyAwning)) * 100)}%) (${J(awnings)})`);

    // LOOK-5: the 0.3 u seam between the plaza and the tavern raft, under the walkway, is boarded over.
    const seam = await wp.evaluate(async () => {
      const THREE = await import('three');
      const G = window.__game;
      T.at(0.5, -9, Math.PI); // (the captain out of the way)
      G.scene.updateMatrixWorld(true);
      const ray = new THREE.Raycaster();
      const out = [];
      for (const x of [-8, -6, -4, -3, -2, -1.2]) {
        ray.set(new THREE.Vector3(x, 3, -14.95), new THREE.Vector3(0, -1, 0));
        ray.far = 2.2;
        const hit = ray.intersectObjects(G.scene.children, true).find((q) => q.object.isMesh && q.object.visible);
        out.push({ x, y: hit ? +hit.point.y.toFixed(3) : null });
      }
      return out;
    });
    check(seam.every((s) => s.y !== null && Math.abs(s.y - 1.31) < 0.05), `LOOK-5: planks under the plaza-tavern walkway: a ray down the seam at z -14.95 meets a deck at about 1.31 everywhere (${J(seam)})`);

    // PERF-3: at Polly's, crew items restyle the line-up only; the six cleaning sailors on the docked ship are dressed
    // once, when the wardrobe closes, in the last pick.
    const crew = await wp.evaluate(() => {
      const G = window.__game;
      if (G.town.view !== 'town') G.town.back();
      const env = G.env;
      const f = env.setCrewStyle;
      let calls = 0;
      env.setCrewStyle = function (...a) {
        calls++;
        return f.apply(this, a);
      };
      try {
        G.town.open('tailor');
        G.town.api.wardrobe.tab('crew');
        for (const id of ['shirt.red', 'sash.gold', 'head.caps', 'shirt.blue']) document.querySelector(`#wardrobe-crew [data-item="${id}"]`).click();
        const during = { calls, lineup: G.town.api.lineup.map((p) => p.userData.look.shirt), want: G.look.crew.shirt };
        G.town.back();
        return { during, closed: calls, crew: T.crew().map((p) => p.userData.look.shirt), lineupWant: during.lineup[0] };
      } finally {
        env.setCrewStyle = f;
      }
    });
    check(crew.during.calls === 0 && crew.during.want === 'blue' && crew.closed === 1 && crew.crew.length === 6 && crew.crew.every((s) => s === crew.lineupWant),
      `PERF-3: four crew clicks at Polly's dress the line-up but don't rebuild the cleaning crew (${crew.during.calls} rebuilds); closing the wardrobe dresses them once, in the last pick (${J(crew)})`);

    // PERF-1: at the tavern, Boarding party, Cutlass drills and Master gunner leave the docked ship as it is (no
    // rebuild: a third of a second's freeze each); Long grapples rebuild it, for their coils on the rail.
    const tavern = await wp.evaluate(() => {
      const G = window.__game;
      if (G.town.view !== 'town') G.town.back();
      G.town.open('tavern');
      const ship0 = G.dock.ship;
      const out = [];
      for (const id of ['boarders', 'cutlass', 'gunner', 'grapple']) {
        const ok = G.armory.buy(id);
        out.push({ id, ok, same: G.dock.ship === ship0 });
      }
      return { buys: out, coils: G.dock.ship.userData.coils };
    });
    check(tavern.buys.every((b) => b.ok && b.same === (b.id !== 'grapple')) && tavern.coils > 0,
      `PERF-1: tavern buys rebuild the docked ship only for Long grapples (their coils: ${tavern.coils}) (${J(tavern.buys)})`);
    await ctx.close();
  });

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 8).join(' | ') : ''}`);
  await browser.close();
  server.close();
  console.log(`\ntown.cjs: ${passes} passed, ${failures} failed`);
  console.log(failures ? `${failures} check(s) failed` : 'All town checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
