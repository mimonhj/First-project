// Focused browser regressions for controls, dialogs, saved data, layout and renderer loss:
// - small-screen layout: every HUD control on screen, a readable hint, no overlapping controls
// - touch sail/fire buttons work by tap (exactly once), Enter, Space and native click
// - steering: overlapping key bindings, keyboard-held and pointer-held on-screen buttons
// - the pause dialog keeps focus, makes the HUD inert and hands focus back to the game
// - saved best score / progress / tutorial records are validated
// - losing the WebGL context pauses the fight and waits for the player after it comes back
const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('./server.cjs');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(cond, msg) {
  console.log(`${cond === true ? 'PASS' : 'FAIL'}  ${msg}`);
  if (cond !== true) failures++;
}

const BROWSER_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

(async () => {
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ args: BROWSER_ARGS });
  const errors = [];

  async function open(opts = {}, query = '?quality=low') {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...opts });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + query, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__gameReady === true, null, { timeout: 120000 });
    return { ctx, page };
  }
  const frames = (page, n = 2) =>
    page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  const startPlaying = (page, level = 1) =>
    page.evaluate((level) => {
      const G = window.__game;
      G.newGame(level);
      G.state.intro = 0;
      // Park the pirates far away so they don't interfere with control checks.
      G.enemies.forEach((e, k) => { e.x = 400 + k * 30; e.z = 400; e.speed = 0; });
    }, level);

  // ------------------------------------------------------------------ F01 layout
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
    }
    if (guns && !inView(guns)) out.push('gun card off screen');
    pads.forEach((b, i) => { if (!inView(b)) out.push(`touch button ${i} off screen`); if (guns && ov(b, guns)) out.push(`touch button ${i} covers the gun card`); });
    for (let i = 0; i < pads.length; i++) for (let j = i + 1; j < pads.length; j++) if (ov(pads[i], pads[j])) out.push(`touch buttons ${i}/${j} overlap`);
    return out;
  };
  for (const [w, h, touch] of [[320, 480, true], [360, 480, true], [320, 480, false], [390, 844, true], [844, 390, true], [1280, 720, false]]) {
    const { ctx, page } = await open({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    await startPlaying(page);
    await page.waitForFunction(() => !document.getElementById('hint').classList.contains('hidden'), null, { timeout: 120000 }).catch(() => {});
    const problems = await page.evaluate(layoutProbe);
    check(problems.length === 0, `layout ${w}x${h}${touch ? ' touch' : ''}: controls on screen, readable hint, nothing overlaps${problems.length ? ' -> ' + problems.join('; ') : ''}`);
    await ctx.close();
  }

  // ------------------------------------------------------------------ F04 small-text contrast
  // Computed colour (with opacity) against the parchment card colour; 4.5:1 for small text,
  // 3:1 only for large text (24px, or 18.66px bold). Limited to the HUD/menu labels checked here.
  const contrastProbe = () => {
    const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    const paper = parse(getComputedStyle(document.documentElement).getPropertyValue('--paper').trim().replace(/^#(..)(..)(..)$/, (_, r, g, b) => `rgb(${parseInt(r, 16)},${parseInt(g, 16)},${parseInt(b, 16)})`));
    const out = [];
    for (const sel of ['.sails', '.tip', '.gold .value', '.new-best', '.label', '.steer-alt', '.best']) {
      for (const el of document.querySelectorAll(sel)) {
        const cs = getComputedStyle(el);
        let alpha = parse(cs.color).a;
        for (let n = el; n && n !== document.documentElement; n = n.parentElement) alpha *= Number(getComputedStyle(n).opacity);
        const c = parse(cs.color);
        const eff = { r: c.r * alpha + paper.r * (1 - alpha), g: c.g * alpha + paper.g * (1 - alpha), b: c.b * alpha + paper.b * (1 - alpha) };
        const la = L(eff), lb = L(paper);
        const ratio = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
        const size = parseFloat(cs.fontSize);
        const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
        out.push({ sel, size, ratio: +ratio.toFixed(2), need: large ? 3 : 4.5 });
      }
    }
    return out;
  };
  for (const [w, h, touch] of [[1280, 720, false], [390, 844, true], [844, 390, true]]) {
    const { ctx, page } = await open({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    const menu = await page.evaluate(contrastProbe);
    await startPlaying(page);
    const hud = await page.evaluate(contrastProbe);
    const all = [...menu, ...hud];
    const bad = all.filter((r) => r.ratio < r.need);
    const seen = [...new Set(all.map((r) => r.sel))].join(', ');
    check(all.length > 0 && bad.length === 0, `contrast ${w}x${h}: small text on parchment is at least 4.5:1 (${seen})${bad.length ? ' -> ' + JSON.stringify(bad) : ''}`);
    await ctx.close();
  }

  // ------------------------------------------------------------------ F02 touch buttons
  {
    const { ctx, page } = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await startPlaying(page);
    const sail = () => page.evaluate(() => window.__game.state.sail);
    const reload = () => page.evaluate(() => ({ ...window.__game.player.reload }));
    check((await sail()) === 2, 'touch: voyage starts at cruising speed');
    await page.focus('[data-tap="sailDown"]');
    await page.keyboard.press('Enter');
    check((await sail()) === 1, 'touch: Enter on the focused − Sail button lowers the sails');
    await page.evaluate(() => document.querySelector('[data-tap="sailDown"]').click());
    check((await sail()) === 0, 'touch: a native click (assistive tech) on − Sail lowers the sails');
    await page.tap('[data-tap="sailUp"]');
    check((await sail()) === 1, 'touch: one tap on + Sail raises the sails exactly once');
    await page.focus('[data-tap="sailUp"]');
    await page.keyboard.press('Space');
    const afterSpace = await reload();
    check((await sail()) === 2 && afterSpace.port === 0 && afterSpace.star === 0, 'touch: Space on the focused + Sail button raises the sails and fires nothing');
    await page.focus('[data-tap="fireStar"]');
    await page.keyboard.press('Space');
    const fired = await reload();
    check(fired.star > 0 && fired.port === 0, 'touch: Space on the focused Fire ▶ button fires only the starboard guns');
    await page.evaluate(() => { const p = window.__game.player; p.reload.port = p.reload.star = 0; });
    await page.tap('[data-tap="firePort"]');
    const tapFire = await reload();
    check(tapFire.port > 0 && tapFire.star === 0, 'touch: tapping ◀ Fire fires the port guns');

    // Held steering buttons.
    const left = () => page.evaluate(() => window.__game.input.left);
    await page.focus('[data-hold="left"]');
    await page.keyboard.down('Enter');
    await frames(page, 3);
    const heldByKey = await left();
    await page.keyboard.up('Enter');
    check(heldByKey === true && (await left()) === false, 'touch: Enter held on the ◀ steering button steers until released');
    await page.keyboard.down(' ');
    const heldBySpace = await left();
    await page.keyboard.up(' ');
    const r2 = await reload();
    check(heldBySpace === true && (await left()) === false, 'touch: Space held on the ◀ steering button steers until released');
    check(r2.port === tapFire.port || r2.port <= tapFire.port, 'touch: Space on a steering button does not fire the cannons');
    await page.evaluate(() => document.activeElement.blur());
    await page.tap('[data-hold="left"]');
    check((await left()) === false, 'touch: a quick tap on ◀ steering does not leave it stuck on');
    const stuck = await page.evaluate(() => {
      const b = document.querySelector('[data-hold="left"]');
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, pointerType: 'touch' }));
      const on = window.__game.input.left;
      b.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 7, pointerType: 'touch' }));
      return { on, after: window.__game.input.left };
    });
    check(stuck.on === true && stuck.after === false, 'touch: a cancelled touch (e.g. a system gesture) releases the steering');
    const nudge = await page.evaluate(() => { document.querySelector('[data-hold="right"]').click(); return window.__game.input.right; });
    await page.waitForFunction(() => window.__game.input.right === false, null, { timeout: 10000 }).catch(() => {});
    check(nudge === true && (await page.evaluate(() => window.__game.input.right)) === false, 'touch: a native click on ▶ steering gives a short nudge');
    // Global shortcuts still work when no on-screen button has focus.
    await page.evaluate(() => { document.activeElement.blur(); const p = window.__game.player; p.reload.port = p.reload.star = 0; });
    await page.keyboard.press('Space');
    const both = await reload();
    check(both.port > 0 && both.star > 0, 'Space with nothing focused still fires both broadsides');
    await ctx.close();
  }

  // ------------------------------------------------------------------ F07 overlapping steering keys
  {
    const { ctx, page } = await open();
    await startPlaying(page);
    const inp = () => page.evaluate(() => ({ ...window.__game.input }));
    await page.keyboard.down('a');
    await page.keyboard.down('ArrowLeft');
    await page.keyboard.up('a');
    check((await inp()).left === true, 'steering: releasing A while ← is still held keeps turning left');
    await page.keyboard.down('d');
    let i = await inp();
    check(i.left === true && i.right === true, 'steering: left and right are tracked independently');
    await page.keyboard.up('d');
    i = await inp();
    check(i.left === true && i.right === false, 'steering: releasing D stops only the right turn');
    await page.keyboard.up('ArrowLeft');
    check((await inp()).left === false, 'steering: releasing the last left key stops turning');
    await page.keyboard.down('a');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    check((await inp()).left === false, 'steering: losing window focus releases held keys');
    await page.keyboard.up('a');
    await page.keyboard.down('ArrowRight');
    await page.keyboard.press('p');
    check((await inp()).right === false, 'steering: pausing releases held keys');
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('p');
    await ctx.close();
  }

  // ------------------------------------------------------------------ F05 pause dialog focus
  {
    const { ctx, page } = await open();
    await startPlaying(page);
    const active = () => page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName));
    await page.keyboard.press('p');
    check((await page.evaluate(() => window.__game.state.mode)) === 'paused', 'pause: P pauses');
    const dlg = await page.evaluate(() => {
      const d = document.getElementById('pause-screen');
      return { role: d.getAttribute('role'), modal: d.getAttribute('aria-modal'), label: document.getElementById(d.getAttribute('aria-labelledby'))?.textContent, hudInert: document.getElementById('hud').inert };
    });
    check(dlg.role === 'dialog' && dlg.modal === 'true' && dlg.label === 'Paused' && dlg.hudInert === true, `pause: a labelled modal dialog with the HUD inert behind it (${JSON.stringify(dlg)})`);
    check((await active()) === 'resume-btn', 'pause: focus moves to Resume');
    const seen = [];
    for (let k = 0; k < 4; k++) {
      await page.keyboard.press('Tab');
      seen.push(await active());
    }
    for (let k = 0; k < 2; k++) {
      await page.keyboard.press('Shift+Tab');
      seen.push(await active());
    }
    check(seen.every((id) => id === 'resume-btn'), `pause: Tab and Shift+Tab stay inside the dialog (${seen.join(', ')})`);
    await page.keyboard.press('p');
    const closed = await page.evaluate(() => ({ mode: window.__game.state.mode, focus: document.activeElement === document.body, inert: document.getElementById('hud').inert }));
    check(closed.mode === 'playing' && closed.focus && closed.inert === false, `pause: P resumes and hands focus back to the game (${JSON.stringify(closed)})`);
    await page.evaluate(() => { const p = window.__game.player; p.reload.port = p.reload.star = 0; });
    await page.keyboard.press('Space');
    check((await page.evaluate(() => window.__game.player.reload.star)) > 0, 'pause: Space fires after resuming');
    await page.click('#pause-btn');
    check((await active()) === 'resume-btn', 'pause: reopening with the II button focuses Resume again');
    await page.keyboard.press('Escape');
    check((await page.evaluate(() => window.__game.state.mode)) === 'playing', 'pause: Escape closes it');
    await page.keyboard.press('p');
    await page.keyboard.press('Enter');
    check((await page.evaluate(() => window.__game.state.mode)) === 'playing', 'pause: Enter on the focused Resume button resumes');
    await ctx.close();
  }

  // ------------------------------------------------------------------ F06 saved records
  {
    const cases = [
      { name: 'nothing saved', set: {}, best: 0, unlocked: 1, tutorial: false },
      { name: 'valid records', set: { best: '350', unlocked: '2', tutorial: '1' }, best: 350, unlocked: 2, tutorial: true },
      { name: 'Infinity', set: { best: 'Infinity', unlocked: 'Infinity', tutorial: 'Infinity' }, best: 0, unlocked: 1, tutorial: false },
      { name: 'NaN', set: { best: 'NaN', unlocked: 'NaN' }, best: 0, unlocked: 1, tutorial: false },
      { name: 'garbage', set: { best: 'lots', unlocked: '<b>3</b>', tutorial: 'yes' }, best: 0, unlocked: 1, tutorial: false },
      { name: 'negative', set: { best: '-50', unlocked: '-2' }, best: 0, unlocked: 1, tutorial: false },
      { name: 'fractional', set: { best: '12.5', unlocked: '2.5' }, best: 0, unlocked: 1, tutorial: false },
      { name: 'exponent / huge', set: { best: '1e400', unlocked: '99999999999999999999' }, best: 0, unlocked: 1, tutorial: false },
      { name: 'too large', set: { best: '5000000', unlocked: '7' }, best: 1000000, unlocked: 3, tutorial: false },
      { name: 'zero progress', set: { unlocked: '0' }, best: 0, unlocked: 1, tutorial: false },
    ];
    const { ctx, page } = await open();
    for (const c of cases) {
      await page.evaluate((set) => {
        localStorage.clear();
        if (set.best !== undefined) localStorage.setItem('pirates-ahoy-best', set.best);
        if (set.unlocked !== undefined) localStorage.setItem('pirates-ahoy-unlocked', set.unlocked);
        if (set.tutorial !== undefined) localStorage.setItem('pirates-ahoy-tutorial-done', set.tutorial);
      }, c.set);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__gameReady === true, null, { timeout: 120000 });
      const r = await page.evaluate(() => ({
        best: window.__game.state.best,
        unlocked: window.__game.state.unlocked,
        tutorial: window.__game.state.tutorialDone,
        shown: document.getElementById('best').textContent,
        cards: [...document.querySelectorAll('.level-card')].filter((b) => !b.disabled).length,
        stored: localStorage.getItem('pirates-ahoy-best'),
      }));
      const ok = r.best === c.best && r.unlocked === c.unlocked && r.tutorial === c.tutorial && r.shown === String(c.best) && r.cards === c.unlocked;
      const normalised = c.set.best === undefined || r.stored === String(c.best);
      check(ok && normalised, `saved data (${c.name}): best ${r.best}, levels ${r.unlocked}, tutorial ${r.tutorial}, shown "${r.shown}", ${r.cards} cards, stored best ${r.stored}`);
    }
    // A finished voyage replaces a corrupt best score, and it survives a reload.
    await page.evaluate(() => localStorage.setItem('pirates-ahoy-best', 'Infinity'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__gameReady === true, null, { timeout: 120000 });
    const won = await page.evaluate(() => {
      const G = window.__game;
      G.newGame(3);
      G.togglePause();
      G.state.gold = 500;
      G.enemies.forEach((e) => G.damage(e, 9999));
      G.state.mode = 'playing';
      for (let i = 0; i < 120 * 10 && G.state.mode === 'playing'; i++) G.step(1 / 120);
      return { mode: G.state.mode, gold: G.state.gold };
    });
    // The boss wave follows; sink it too.
    const final = await page.evaluate(() => {
      const G = window.__game;
      if (G.state.mode === 'paused' || G.state.mode === 'playing') {
        G.enemies.forEach((e) => G.damage(e, 9999));
        G.state.mode = 'playing';
        for (let i = 0; i < 120 * 10 && G.state.mode === 'playing'; i++) G.step(1 / 120);
      }
      return { mode: G.state.mode, best: G.state.best, gold: G.state.gold };
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__gameReady === true, null, { timeout: 120000 });
    const reloaded = await page.evaluate(() => window.__game.state.best);
    check(won.gold >= 500 && final.mode === 'won' && final.best === final.gold && reloaded === final.gold, `a finished voyage replaces a corrupt best score and survives reload (${final.best} -> ${reloaded})`);
    await ctx.close();

    // Storage blocked entirely (privacy settings): the game still starts with defaults.
    const blocked = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await blocked.addInitScript(() => {
      const deny = () => { throw new DOMException('denied', 'SecurityError'); };
      Storage.prototype.getItem = deny;
      Storage.prototype.setItem = deny;
    });
    const bp = await blocked.newPage();
    bp.on('pageerror', (e) => errors.push(e.message));
    await bp.goto(base + '?quality=low', { waitUntil: 'domcontentloaded' });
    await bp.waitForFunction(() => window.__gameReady === true, null, { timeout: 120000 });
    const d = await bp.evaluate(() => ({ best: window.__game.state.best, unlocked: window.__game.state.unlocked }));
    check(d.best === 0 && d.unlocked === 1, 'saved data: with storage blocked the game starts with defaults');
    await blocked.close();
  }

  // ------------------------------------------------------------------ F03 WebGL context loss
  {
    const { ctx, page } = await open();
    const ext = await page.evaluate(() => !!document.getElementById('game').getContext('webgl2')?.getExtension('WEBGL_lose_context'));
    if (!ext) {
      console.log('SKIP  WEBGL_lose_context is not available in this browser; context-loss checks were not run');
    } else {
      // A live encounter: a pirate beam-on at close range, past the grace period.
      await page.evaluate(() => {
        const G = window.__game;
        G.newGame(1);
        G.state.intro = 0;
        G.state.combatTime = 30;
        const p = G.player;
        p.x = 0; p.z = 0; p.h = 0; p.speed = 0; p.hp = p.maxHp;
        G.state.sail = 0;
        G.colliders.forEach((c) => (c.x += 5000));
        G.enemies.forEach((e, k) => { e.x = 300 + k * 20; e.z = 300; });
        const e = G.enemies[0];
        e.x = 18; e.z = 0; e.h = 0; e.speed = 0;
      });
      // Keep the extension object: a lost context no longer hands it out.
      await page.evaluate(() => {
        window.__loseExt = document.getElementById('game').getContext('webgl2').getExtension('WEBGL_lose_context');
        window.__loseExt.loseContext();
      });
      await page.waitForFunction(() => window.__game.state.contextLost === true, null, { timeout: 30000 }).catch(() => {});
      const lost = await page.evaluate(() => ({
        mode: window.__game.state.mode,
        time: window.__game.state.time,
        hp: window.__game.player.hp,
        dialog: !document.getElementById('recover-screen').classList.contains('hidden'),
        title: document.getElementById('recover-title').textContent,
        button: !document.getElementById('recover-btn').classList.contains('hidden'),
      }));
      check(lost.mode === 'paused' && lost.dialog && lost.title === 'Graphics paused' && !lost.button, `context lost: the fight pauses and says so (${JSON.stringify(lost)})`);
      await page.waitForTimeout(3000);
      const during = await page.evaluate(() => ({ time: window.__game.state.time, hp: window.__game.player.hp, balls: window.__game.balls.length }));
      check(during.time === lost.time && during.hp === lost.hp, `context lost: no time passes and no damage is taken while the view is gone (hp ${lost.hp} -> ${during.hp})`);
      await page.keyboard.press('p');
      check((await page.evaluate(() => window.__game.state.mode)) === 'paused', 'context lost: P cannot resume while the graphics are gone');
      await page.evaluate(() => window.__loseExt.restoreContext());
      await page.waitForFunction(() => window.__game.state.contextLost === false, null, { timeout: 30000 }).catch(() => {});
      await frames(page, 3);
      const restored = await page.evaluate(() => ({
        mode: window.__game.state.mode,
        button: !document.getElementById('recover-btn').classList.contains('hidden'),
        focus: document.activeElement && document.activeElement.id,
        title: document.getElementById('recover-title').textContent,
      }));
      check(restored.mode === 'paused' && restored.button && restored.focus === 'recover-btn' && restored.title === 'Graphics restored', `context restored: still paused, waiting for the player (${JSON.stringify(restored)})`);
      await page.click('#recover-btn');
      await frames(page, 3);
      const resumed = await page.evaluate(() => ({ mode: window.__game.state.mode, calls: window.__game.renderInfo.calls, dialog: !document.getElementById('recover-screen').classList.contains('hidden') }));
      check(resumed.mode === 'playing' && !resumed.dialog && resumed.calls > 0, `context restored: Continue resumes and the scene draws again (${resumed.calls} draw calls)`);

      // A game the player had paused stays paused through a loss and restore.
      await page.keyboard.press('p');
      await page.evaluate(() => window.__loseExt.loseContext());
      await page.waitForFunction(() => window.__game.state.contextLost === true, null, { timeout: 30000 }).catch(() => {});
      await page.evaluate(() => window.__loseExt.restoreContext());
      await page.waitForFunction(() => window.__game.state.contextLost === false, null, { timeout: 30000 }).catch(() => {});
      const manual = await page.evaluate(() => ({
        mode: window.__game.state.mode,
        pause: !document.getElementById('pause-screen').classList.contains('hidden'),
        recover: !document.getElementById('recover-screen').classList.contains('hidden'),
      }));
      check(manual.mode === 'paused' && manual.pause && !manual.recover, `context restored: a manually paused game stays paused (${JSON.stringify(manual)})`);
    }
    await ctx.close();
  }

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll control checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
