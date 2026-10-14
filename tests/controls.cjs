// Focused browser regressions for controls, dialogs, saved data, layout and renderer loss:
// - small-screen layout: every HUD control on screen, a readable hint, no overlapping controls
// - touch sail/fire buttons work by tap (exactly once), Enter, Space and native click
// - steering: overlapping key bindings, keyboard-held and pointer-held on-screen buttons
// - the pause dialog keeps focus, makes the HUD inert and hands focus back to the game
// - saved best score / progress / tutorial records are validated
// - losing the WebGL context pauses the fight and waits for the player after it comes back
// - the shipyard on Sparrow's Floating Island: the level-cleared choices, banking into the treasure
//   chest, the docked ship and its working crew, buying and painting, the ways out, saved records,
//   keyboard use, and the panel's layout and contrast on small and large screens
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
    return out;
  };
  // Finish the pop-in animations (not the endless bobbing) so boxes are measured at rest.
  const settle = (page) => page.evaluate(() => document.getAnimations().forEach((a) => { if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); }));
  // The first-voyage hint shows while the 'Level 1' banner is still up (6 s), so both are on
  // screen together; the banner is held so a slow software renderer still measures them together.
  for (const [w, h, touch] of [
    [320, 480, true], [360, 480, true], [320, 480, false], [390, 844, true], [844, 390, true], [1280, 720, false],
    [568, 320, true], [640, 360, true], [568, 320, false], [640, 360, false],
  ]) {
    const { ctx, page } = await open({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    await startPlaying(page);
    await page.evaluate(() => { window.__game.state.bannerTimer = 1e9; });
    await page.waitForFunction(() => !document.getElementById('hint').classList.contains('hidden'), null, { timeout: 120000 }).catch(() => {});
    await settle(page);
    const problems = await page.evaluate(layoutProbe);
    check(problems.length === 0, `layout ${w}x${h}${touch ? ' touch' : ''}: controls on screen, readable hint, nothing overlaps${problems.length ? ' -> ' + problems.join('; ') : ''}`);
    await ctx.close();
  }

  // The boss bar on small portrait phones: the full name fits and it stays clear of the minimap.
  for (const [w, h] of [[320, 480], [360, 480]]) {
    const { ctx, page } = await open({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    await page.evaluate(() => {
      const G = window.__game;
      G.newGame(3);
      G.state.intro = 0;
      G.enemies.forEach((e) => G.damage(e, 9999));
      // Step until the boss wave arrives; the HUD shows its bar on the next drawn frame.
      for (let i = 0; i < 120 * 20 && !G.enemies.some((e) => e.type.boss); i++) G.step(1 / 120);
    });
    await page.waitForFunction(() => !document.getElementById('boss').classList.contains('hidden'), null, { timeout: 60000 }).catch(() => {});
    await settle(page);
    const boss = await page.evaluate(() => {
      const shown = () => !document.getElementById('boss').classList.contains('hidden');
      const name = document.getElementById('boss-name') || document.querySelector('.boss-name');
      const b = document.getElementById('boss').getBoundingClientRect();
      const m = document.getElementById('minimap').getBoundingClientRect();
      const overlap = Math.max(0, Math.min(b.right, m.right) - Math.max(b.left, m.left)) * Math.max(0, Math.min(b.bottom, m.bottom) - Math.max(b.top, m.top));
      return { shown: shown(), text: name.textContent, fits: name.scrollWidth <= name.clientWidth + 1, width: Math.round(b.width), overlap };
    });
    check(boss.shown && boss.fits && boss.overlap === 0, `layout ${w}x${h} touch: the boss bar shows its whole name and clears the minimap (${JSON.stringify(boss)})`);
    await ctx.close();
  }

  // ------------------------------------------------------------------ F04 small-text contrast
  // Computed colour (with opacity) against the parchment card colour; 4.5:1 for small text,
  // 3:1 only for large text (24px, or 18.66px bold). Limited to the HUD/menu labels checked here.
  // The Fire labels are white on their own red fill, so they are measured against that fill.
  const contrastProbe = () => {
    const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    const paper = parse(getComputedStyle(document.documentElement).getPropertyValue('--paper').trim().replace(/^#(..)(..)(..)$/, (_, r, g, b) => `rgb(${parseInt(r, 16)},${parseInt(g, 16)},${parseInt(b, 16)})`));
    const out = [];
    const onFill = ['.fire-tag', '.touch button.fire', '.touch-help b.fire'];
    for (const sel of ['.sails', '.tip', '.gold .value', '.new-best', '.label', '.steer-alt', '.best', '.hint-bubble b', ...onFill]) {
      for (const el of document.querySelectorAll(sel)) {
        const cs = getComputedStyle(el);
        const bg = onFill.includes(sel) ? parse(cs.backgroundColor) : paper;
        let alpha = parse(cs.color).a;
        for (let n = el; n && n !== document.documentElement; n = n.parentElement) alpha *= Number(getComputedStyle(n).opacity);
        const c = parse(cs.color);
        const eff = { r: c.r * alpha + bg.r * (1 - alpha), g: c.g * alpha + bg.g * (1 - alpha), b: c.b * alpha + bg.b * (1 - alpha) };
        const la = L(eff), lb = L(bg);
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
    // Touch hints name the button to press in red ('tap + Sail'): measure them once fully shown.
    if (touch) {
      await page.waitForFunction(() => document.querySelector('#hint:not(.hidden) b'), null, { timeout: 120000 }).catch(() => {});
      await settle(page);
    }
    const hud = await page.evaluate(contrastProbe);
    const all = [...menu, ...hud];
    const bad = all.filter((r) => r.ratio < r.need);
    const seen = [...new Set(all.map((r) => r.sel))].join(', ');
    const needed = touch ? ['.hint-bubble b', '.touch button.fire'] : ['.sails'];
    check(all.length > 0 && bad.length === 0 && needed.every((sel) => all.some((r) => r.sel === sel)), `contrast ${w}x${h}: small text on parchment is at least 4.5:1 (${seen})${bad.length ? ' -> ' + JSON.stringify(bad) : ''}`);
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

    // A touch that slides off − Sail acts once (on touch-down) and no click follows; Enter
    // pressed straight after still works (the click's own origin decides, not a time window).
    await page.evaluate(() => { window.__game.state.sail = 3; });
    await page.focus('[data-tap="sailDown"]');
    const cdp = await ctx.newCDPSession(page);
    const box = await page.locator('[data-tap="sailDown"]').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + 120, y: cy - 200 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const afterSlide = await sail();
    await page.keyboard.press('Enter');
    check(afterSlide === 2 && (await sail()) === 1, `touch: a slid-off touch acts once and Enter right after still works (3 -> ${afterSlide} -> ${await sail()})`);
    // Holding Enter on a sail button steps the sails once, not on every key auto-repeat.
    await page.evaluate(() => { window.__game.state.sail = 3; });
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    check((await sail()) === 2, `touch: holding Enter on − Sail lowers the sails one step (3 -> ${await sail()})`);
    // A tap on ▶ steering, then an assistive-technology click soon after: the click still nudges.
    await page.evaluate(() => document.activeElement.blur());
    await page.tap('[data-hold="right"]');
    const assisted = await page.evaluate(() => { document.querySelector('[data-hold="right"]').click(); return window.__game.input.right; });
    check(assisted === true, 'touch: a native click straight after a tap on ▶ steering still nudges');
    // Two clicks 200 ms apart: the second nudge gets its own full length.
    const twice = await page.evaluate(async () => {
      const b = document.querySelector('[data-hold="right"]');
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      await wait(1000); // well clear of the tap above and its nudge
      b.click();
      await wait(200);
      b.click();
      await wait(250); // 450 ms after the first click, 250 ms after the second
      const mid = window.__game.input.right;
      await wait(400);
      return { mid, end: window.__game.input.right };
    });
    check(twice.mid === true && twice.end === false, `touch: a second click on ▶ steering gets its own nudge (${JSON.stringify(twice)})`);
    // Enter and Space held together on ◀ steering: letting go of one keeps steering.
    await page.focus('[data-hold="left"]');
    await page.keyboard.down('Enter');
    await page.keyboard.down(' ');
    await page.keyboard.up(' ');
    const enterStill = await left();
    await page.keyboard.up('Enter');
    check(enterStill === true && (await left()) === false, 'touch: releasing Space while Enter still holds ◀ steering keeps turning');
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
    // A modifier or layout switch mid-hold changes e.key (Option+A gives 'å' on a Mac): the keyup
    // of the same physical key still releases it.
    const modKey = await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA' }));
      const held = window.__game.input.left;
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'å', code: 'KeyA', altKey: true }));
      return { held, after: window.__game.input.left };
    });
    check(modKey.held === true && modKey.after === false, `steering: the key's release counts even if a modifier changed its character (${JSON.stringify(modKey)})`);
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

      // Lost, restored, lost again before Continue, restored: still waiting for Continue.
      const loseRestore = async (lose) => {
        await page.evaluate((lose) => (lose ? window.__loseExt.loseContext() : window.__loseExt.restoreContext()), lose);
        await page.waitForFunction((lost) => window.__game.state.contextLost === lost, lose, { timeout: 30000 }).catch(() => {});
      };
      await loseRestore(true);
      await loseRestore(false);
      await loseRestore(true);
      await loseRestore(false);
      await frames(page, 3);
      const twice = await page.evaluate(() => ({
        mode: window.__game.state.mode,
        dialog: !document.getElementById('recover-screen').classList.contains('hidden'),
        button: !document.getElementById('recover-btn').classList.contains('hidden'),
        focus: document.activeElement && document.activeElement.id,
        hudInert: document.getElementById('hud').inert,
      }));
      check(twice.mode === 'paused' && twice.dialog && twice.button && twice.focus === 'recover-btn' && twice.hudInert, `context lost twice before Continue: still paused, Continue still offered (${JSON.stringify(twice)})`);
      await page.keyboard.press('Enter');
      check((await page.evaluate(() => window.__game.state.mode)) === 'playing', 'context lost twice: Enter on Continue resumes');

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

      // On the level-cleared and shipwrecked screens the recovery dialog is on top: the end
      // screen behind it can't be used while the view is gone, and is back unchanged afterwards.
      for (const [name, mode, button] of [['level cleared', 'levelDone', 'next-btn'], ['shipwrecked', 'over', 'retry-btn']]) {
        await page.evaluate((mode) => {
          const G = window.__game;
          G.newGame(1);
          G.state.intro = 0;
          if (mode === 'over') G.damage(G.player, 9999);
          for (let i = 0; i < 120 * 30 && G.state.mode === 'playing'; i++) {
            // Level cleared: sink every pirate as it arrives (later waves included).
            if (mode === 'levelDone') for (const e of G.enemies) if (e.hp > 0) G.damage(e, 9999);
            G.step(1 / 120);
          }
        }, mode);
        await page.evaluate(() => window.__loseExt.loseContext());
        await page.waitForFunction(() => window.__game.state.contextLost === true, null, { timeout: 30000 }).catch(() => {});
        const covered = await page.evaluate((button) => {
          const top = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
          const b = document.getElementById(button).getBoundingClientRect();
          const atButton = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          return { mode: window.__game.state.mode, top: top && top.closest('.overlay')?.id, atButton: atButton && atButton.closest('.overlay')?.id, inert: document.getElementById(button).closest('.overlay').inert };
        }, button);
        await page.keyboard.press('Enter');
        const b = await page.locator('#' + button).boundingBox();
        await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
        const stillThere = await page.evaluate(() => window.__game.state.mode);
        check(covered.mode === mode && covered.top === 'recover-screen' && covered.atButton === 'recover-screen' && covered.inert && stillThere === mode, `context lost on the ${name} screen: the recovery dialog is on top and the screen behind can't be used (${JSON.stringify({ ...covered, afterEnterAndClick: stillThere })})`);
        await page.evaluate(() => window.__loseExt.restoreContext());
        await page.waitForFunction(() => window.__game.state.contextLost === false, null, { timeout: 30000 }).catch(() => {});
        const back = await page.evaluate((button) => ({
          mode: window.__game.state.mode,
          recover: !document.getElementById('recover-screen').classList.contains('hidden'),
          inert: document.getElementById(button).closest('.overlay').inert,
        }), button);
        await page.keyboard.press('Enter');
        const next = await page.evaluate(() => window.__game.state.mode);
        check(back.mode === mode && !back.recover && !back.inert && next === 'playing', `context restored on the ${name} screen: it is usable again and Enter carries on (${JSON.stringify({ ...back, afterEnter: next })})`);
      }

      // A voyage started while the view is gone (only possible through the test API: the dialog
      // blocks the UI) also waits for Continue when the view comes back.
      await page.evaluate(() => window.__loseExt.loseContext());
      await page.waitForFunction(() => window.__game.state.contextLost === true, null, { timeout: 30000 }).catch(() => {});
      await page.evaluate(() => window.__game.newGame(2));
      await page.evaluate(() => window.__loseExt.restoreContext());
      await page.waitForFunction(() => window.__game.state.contextLost === false, null, { timeout: 30000 }).catch(() => {});
      await frames(page, 3);
      const started = await page.evaluate(() => ({
        mode: window.__game.state.mode,
        recover: !document.getElementById('recover-screen').classList.contains('hidden'),
        button: !document.getElementById('recover-btn').classList.contains('hidden'),
      }));
      check(started.mode === 'paused' && started.recover && started.button, `context restored: a voyage started while the view was gone waits for Continue (${JSON.stringify(started)})`);
      await page.click('#recover-btn');

      // At the shipyard (opened from the title, so there is no voyage): the dialog talks about the
      // shipyard, and focus comes back to the Buy button the player was on.
      await page.evaluate(() => { window.__game.showMenu(); window.__game.dock.open('menu'); });
      await page.focus('[data-buy="shot"]');
      await loseRestore(true);
      const dockLost = await page.evaluate(() => document.getElementById('recover-msg').textContent);
      await loseRestore(false);
      await frames(page, 2);
      const dockBack = await page.evaluate(() => ({ mode: window.__game.state.mode, focus: document.activeElement && document.activeElement.dataset.buy, recover: !document.getElementById('recover-screen').classList.contains('hidden') }));
      check(/shipyard/.test(dockLost) && !/voyage/.test(dockLost) && dockBack.mode === 'dock' && !dockBack.recover && dockBack.focus === 'shot', `context lost at the shipyard: the dialog talks about the shipyard, and focus returns to the Buy button the player was on (${JSON.stringify({ msg: dockLost, ...dockBack })})`);
      // Lost in the same moment new scenery is built (the context is gone a little before the
      // browser's 'webglcontextlost' event says so): no errors, and the shipyard draws again.
      const errs0 = errors.length;
      await page.evaluate(() => {
        window.__game.showMenu();
        window.__game.dock.open('menu');
        window.__loseExt.loseContext();
      });
      await page.waitForFunction(() => window.__game.state.contextLost === true, null, { timeout: 30000 }).catch(() => {});
      await frames(page, 2);
      await loseRestore(false);
      await frames(page, 3);
      const drawn = await page.evaluate(() => ({ mode: window.__game.state.mode, calls: window.__game.renderInfo.calls }));
      check(errors.length === errs0 && drawn.mode === 'dock' && drawn.calls > 0, `context lost while the shipyard is being built: no errors, and it draws again after the restore (${JSON.stringify({ ...drawn, errors: errors.slice(errs0) })})`);
    }
    await ctx.close();
  }

  // ------------------------------------------------------------------ Shipyard & Sparrow's Floating Island
  // Page-side helpers for the shipyard checks, installed with page.evaluate(dockHelpers).
  const dockHelpers = () => {
    const G = window.__game;
    const isPerson = (o) => !!(o.userData && o.userData.keep && o.userData.kind);
    const people = (root) => {
      const out = [];
      if (root) root.traverse((o) => { if (isPerson(o)) out.push(o); });
      return out;
    };
    const within = (o, root) => { for (let n = o; n; n = n.parent) if (n === root) return true; return false; };
    // A ship's own meshes: not the people aboard, nor whatever carries them (their plank and rowboat).
    const shipParts = (ship) => {
      const top = (o) => { let n = o; while (n.parent && n.parent !== ship) n = n.parent; return n; };
      const crew = new Set(people(ship).map(top));
      const out = [];
      ship.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && !crew.has(top(o))) out.push(o); });
      return out;
    };
    const colours = (ship) => {
      const set = new Set();
      for (const m of shipParts(ship)) for (const mat of [].concat(m.material)) if (mat && mat.color) set.add(mat.color.getHex());
      return [...set];
    };
    // Cannons on one side (1 = starboard), counted on the model itself: at gun height (0.8 above
    // the waterline) a barrel sticks out of the hull by more than half a unit, compared with the
    // hull just below the ports; the hull's curve, iron bands, patches and armour stay well inside that.
    const gunPorts = async (ship, side = 1) => {
      const THREE = await import('/vendor/three.module.min.js');
      ship.updateMatrixWorld(true);
      const parts = shipParts(ship);
      const rc = new THREE.Raycaster();
      const reach = (y, z) => {
        rc.set(new THREE.Vector3(side * 5, y, z).applyMatrix4(ship.matrixWorld), new THREE.Vector3(-side, 0, 0).transformDirection(ship.matrixWorld));
        rc.far = 10;
        const hit = rc.intersectObjects(parts, false)[0];
        return hit ? 5 - hit.distance : null;
      };
      let runs = 0;
      let width = 0;
      for (let z = -6; z <= 6.001; z += 0.04) {
        const gun = reach(0.8, z);
        const hull = reach(0.45, z);
        width = gun !== null && hull !== null && gun - hull > 0.5 ? width + 1 : 0;
        if (width === 3) runs++; // at least 0.12 wide
      }
      return runs;
    };
    // Every person's pose: where they stand and how their joints are turned.
    const poses = () => people(G.scene).map((p) => {
      const parts = p.userData.parts || {};
      const v = [p.position.x, p.position.y, p.position.z, p.rotation.y];
      for (const k of ['hips', 'torso', 'head', 'armL', 'armR', 'legL', 'legR', 'tool']) {
        const b = parts[k];
        if (b) v.push(b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      }
      return { id: p.uuid, crew: !!G.dock.ship && within(p, G.dock.ship), v };
    });
    const moved = (before) => {
      const then = new Map(before.map((p) => [p.id, p.v]));
      const now = poses();
      const diff = (a, b) => (a.length !== b.length ? Infinity : Math.max(...a.map((x, i) => Math.abs(x - b[i]))));
      const count = (list) => list.filter((p) => then.has(p.id) && diff(then.get(p.id), p.v) > 1e-3).length;
      const crew = now.filter((p) => p.crew);
      const folk = now.filter((p) => !p.crew);
      return { crew: crew.length, crewMoved: count(crew), folk: folk.length, folkMoved: count(folk) };
    };
    // The upgrade rows as the panel shows them.
    const rows = () => [...document.querySelectorAll('#dock-up-list .up-row')].map((r) => {
      const b = r.querySelector('.buy-btn');
      const why = document.getElementById(b.getAttribute('aria-describedby') || '');
      return {
        id: r.dataset.id,
        disabled: b.disabled || b.getAttribute('aria-disabled') === 'true',
        why: why ? why.textContent.trim() : '',
        label: b.getAttribute('aria-label') || b.textContent.trim(),
        pips: r.querySelector('.pips').getAttribute('aria-label'),
        stat: r.querySelector('.up-values').textContent.replace(/\s+/g, ' ').trim(),
      };
    });
    const exits = () => [...document.querySelectorAll('#dock-exits button')].map((b) => b.textContent.trim());
    const shown = (id) => { const e = document.getElementById(id); return !!e && !e.closest('.hidden') && e.getClientRects().length > 0; };
    window.__dockTest = { people, within, shipParts, colours, gunPorts, poses, moved, rows, exits, shown };
  };
  // The focused control: does it show a focus ring, and can it be seen (not scrolled away or covered)?
  const focusProbe = () => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    let visible = r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5;
    const body = el.closest('.dock-body');
    if (body) { const b = body.getBoundingClientRect(); visible = visible && r.top >= b.top - 1 && r.bottom <= b.bottom + 1; }
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const id = el.id || (el.dataset.buy ? `buy-${el.dataset.buy}` : el.dataset.look ? `swatch-${el.dataset.part}-${el.dataset.look}` : el.className);
    return { id, ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2, visible: visible && !!hit && (hit === el || el.contains(hit)), inDock: !!el.closest('#dock-screen') };
  };
  // Shipyard panel layout: no page scroll, every control reachable, big enough and uncovered.
  const dockLayoutProbe = () => {
    const W = innerWidth;
    const H = innerHeight;
    const R = (el) => el.getBoundingClientRect();
    const ov = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const inside = (r, box) => r.left >= box.left - 0.5 && r.top >= box.top - 0.5 && r.right <= box.right + 0.5 && r.bottom <= box.bottom + 0.5;
    const screen = { left: 0, top: 0, right: W, bottom: H };
    const out = [];
    const de = document.documentElement;
    if (de.scrollWidth > W + 1 || de.scrollHeight > H + 1) out.push(`the page scrolls (${de.scrollWidth}x${de.scrollHeight})`);
    const panelEl = document.getElementById('dock-panel');
    const panel = R(panelEl);
    if (!inside(panel, screen)) out.push('panel off screen');
    const parts = ['.dock-head', '.dock-tabs', '.dock-body', '#dock-exits'].map((s) => [s, R(panelEl.querySelector(s))]);
    for (const [s, r] of parts) if (!r.height || !inside(r, panel)) out.push(`${s} outside the panel`);
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) if (ov(parts[i][1], parts[j][1]) > 1) out.push(`${parts[i][0]} overlaps ${parts[j][0]}`);
    const body = panelEl.querySelector('.dock-body');
    if (body.scrollWidth > body.clientWidth + 1) out.push('the panel scrolls sideways');
    const name = (el) => el.id || (el.dataset.buy ? `Buy ${el.dataset.buy}` : el.dataset.look ? `swatch ${el.dataset.part} ${el.dataset.look}` : el.className);
    // A control is fine if it is on screen (after scrolling the panel to it), big enough to tap,
    // its label isn't cut off and nothing covers it.
    const reach = (el) => {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = R(el);
      if (window.scrollX || window.scrollY) out.push(`showing ${name(el)} scrolled the page`);
      if (!inside(r, screen) || !inside(r, panel) || (el.closest('.dock-body') && !inside(r, R(body)))) out.push(`${name(el)} can't be scrolled into view`);
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !(hit === el || el.contains(hit))) out.push(`${name(el)} is covered by ${hit && (hit.id || hit.className)}`);
      if (r.width < 44 || r.height < 44) out.push(`${name(el)} is only ${Math.round(r.width)}x${Math.round(r.height)}`);
      const text = (n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
      const cut = [el, ...el.querySelectorAll('*')].filter((n) => text(n) && getComputedStyle(n).display !== 'inline' && n.scrollWidth > n.clientWidth + 1);
      if (cut.length) out.push(`${name(el)}'s label is cut off`);
    };
    const noOverlap = (list, what) => {
      const rs = list.map(R);
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (ov(rs[i], rs[j]) > 1) out.push(`${what} ${name(list[i])} and ${name(list[j])} overlap`);
    };
    const exits = [...panelEl.querySelectorAll('#dock-exits button')];
    noOverlap(exits, 'exit buttons');
    for (const el of [...panelEl.querySelectorAll('[role="tab"]'), ...exits]) reach(el);
    const buys = [...panelEl.querySelectorAll('.buy-btn')];
    noOverlap([...panelEl.querySelectorAll('.up-row')], 'upgrade rows');
    for (const el of buys) reach(el);
    panelEl.querySelector('#dock-tab-paint').click();
    const swatches = [...panelEl.querySelectorAll('.swatch')];
    noOverlap(swatches, 'swatches');
    for (const el of swatches) reach(el);
    panelEl.querySelector('#dock-tab-up').click();
    body.scrollTop = 0;
    return { problems: out, exits: exits.length, buys: buys.length, swatches: swatches.length };
  };
  // Small text in the shipyard panel (every visible text, both tabs) against what is behind it.
  // Outlined display text (-webkit-text-stroke) is measured by its outline colour.
  const dockContrastProbe = (rootSel) => {
    const parse = (c) => { const m = String(c).match(/[\d.]+/g); if (!m || m.length < 3) return null; const n = m.map(Number); return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 }; };
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    const background = (el) => {
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0) { layers.push(c); if (c.a >= 0.999) break; }
      }
      let acc = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
      return acc;
    };
    const out = [];
    const root = document.querySelector(rootSel);
    const seen = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const el = t.parentElement;
      if (!t.textContent.trim() || seen.has(el)) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width <= 1 || r.height <= 1 || cs.visibility !== 'visible') continue; // hidden, or only for screen readers
      let alpha = 1;
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) alpha *= Number(getComputedStyle(n).opacity);
      const stroke = parseFloat(cs.webkitTextStrokeWidth) >= 1.5;
      const c = parse(stroke ? cs.webkitTextStrokeColor : cs.color);
      const bg = background(el);
      const fg = over({ ...c, a: c.a * alpha }, bg);
      const la = L(fg);
      const lb = L(bg);
      const ratio = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      out.push({ text: t.textContent.trim().slice(0, 22), size, ratio: +ratio.toFixed(2), need: large ? 3 : 4.5 });
    }
    return out;
  };
  // Sinks every pirate as it arrives (later waves too) until the level is cleared.
  const clearLevel = (page) => page.evaluate(() => {
    const G = window.__game;
    G.state.intro = 0;
    for (let i = 0; i < 120 * 30 && G.state.mode === 'playing'; i++) {
      for (const e of G.enemies) if (e.hp > 0) G.damage(e, 9999);
      G.step(1 / 120);
    }
    return G.state.mode;
  });
  // Put gold in the chest (as if earlier levels were cleared) and wait for the panel to show it.
  const setPurse = async (page, n) => {
    await page.evaluate((n) => { window.__game.state.purse = n; }, n);
    await page.waitForFunction((n) => !window.__dockTest.shown('dock-screen') || document.getElementById('dock-chest-gold').textContent === String(n), n, { timeout: 60000 }).catch(() => {});
  };
  const dockState = (page) => page.evaluate(() => {
    const G = window.__game;
    const T = window.__dockTest;
    return { mode: G.state.mode, from: G.dock.from, exits: T.exits(), focus: document.activeElement && document.activeElement.id, panel: T.shown('dock-screen'), hud: T.shown('hud'), purse: G.state.purse };
  });

  // Level cleared -> treasure chest -> the dock: buy, paint, sail on with the new ship; shipwrecked
  // -> dock -> try again; title -> dock -> title; quitting the voyage from the level-cleared screen.
  {
    const { ctx, page } = await open();
    await page.evaluate(dockHelpers);
    const title = await page.evaluate(() => ({ purse: window.__game.state.purse, chest: document.getElementById('menu-chest').textContent, button: window.__dockTest.shown('menu-dock-btn') }));
    check(title.purse === 0 && title.chest === '0' && title.button, `shipyard: the title screen has a Shipyard button and shows the empty treasure chest (${JSON.stringify(title)})`);

    // Level 1 cleared: the level's earnings go into the chest, on top of what is already there.
    await page.click('#start-btn');
    await page.evaluate(() => { window.__game.state.purse = 40; });
    const cleared1 = await clearLevel(page);
    const bank1 = await page.evaluate(() => {
      const G = window.__game;
      return { gold: G.state.gold, start: G.state.goldAtLevelStart, purse: G.state.purse, banked: G.state.banked, saved: localStorage.getItem('pirates-ahoy-purse'), summary: document.getElementById('level-summary').textContent.replace(/\s+/g, ' ') };
    });
    const earned1 = bank1.gold - bank1.start;
    check(cleared1 === 'levelDone' && earned1 >= 100 && bank1.purse === 40 + earned1 && bank1.banked === earned1 && bank1.saved === String(bank1.purse), `shipyard: clearing a level banks exactly its ${earned1} gold (loot and bonus) into the chest and saves it (40 -> ${bank1.purse}, saved "${bank1.saved}")`);
    check(bank1.summary.includes(`Banked +${earned1} gold`) && bank1.summary.includes(`Treasure chest: ${bank1.purse} gold`), `shipyard: the level-cleared summary says what was banked and the chest total ("${bank1.summary}")`);
    const next1 = await page.evaluate(() => window.__game.LEVELS[1].env.meta.name);
    const choices = await page.evaluate(() => [...document.querySelectorAll('#level-screen button')].filter((b) => b.getClientRects().length && !b.closest('.hidden')).map((b) => ({ id: b.id, text: b.textContent.trim(), h: b.getBoundingClientRect().height })));
    check(
      choices.map((c) => c.id).join() === 'next-btn,dock-btn,exit-btn' && choices[0].text === `Sail to ${next1}` && choices[1].text === "Visit Sparrow's Floating Island" && choices[2].text === 'Main menu' && choices.every((c) => c.h >= 44),
      `shipyard: after a level the captain can sail on, visit the dock or go to the main menu (${choices.map((c) => c.text).join(' | ')})`,
    );
    const chestLine = await page.evaluate(dockContrastProbe, '#level-screen .chest-line');
    check(chestLine.length >= 2 && chestLine.every((r) => r.ratio >= r.need), `shipyard: the chest line on the level-cleared card has at least 4.5:1 contrast (${chestLine.map((r) => `"${r.text}" ${r.ratio}`).join(', ')})`);

    // The dock.
    await page.click('#dock-btn');
    await frames(page, 2);
    const d = await page.evaluate(() => {
      const G = window.__game;
      const T = window.__dockTest;
      const s = G.dock.ship;
      const b = G.env.berth;
      return {
        mode: G.state.mode, from: G.dock.from, focus: document.activeElement && document.activeElement.id,
        panel: T.shown('dock-screen'), hud: T.shown('hud'), cleared: T.shown('level-screen'),
        title: document.getElementById('dock-title').textContent.trim(), chest: document.getElementById('dock-chest').textContent.replace(/\s+/g, ' ').trim(),
        count: G.env.peopleCount, inScene: T.people(G.scene).length, crew: T.people(s).length,
        atBerth: !!s && s.parent === G.scene && Math.hypot(s.position.x - b.x, s.position.z - b.z) < 0.01,
      };
    });
    check(d.mode === 'dock' && d.from === 'levelDone' && d.panel && !d.hud && !d.cleared && d.focus === 'dock-tab-up' && d.title === "Sparrow's Floating Island", `shipyard: "Visit Sparrow's Floating Island" opens the dock panel (no HUD), focus on the Upgrades tab (${JSON.stringify({ mode: d.mode, from: d.from, focus: d.focus, title: d.title })})`);
    check(d.chest === `Treasure chest: ${bank1.purse} gold`, `shipyard: the panel shows the chest ("${d.chest}")`);
    check(d.atBerth && d.count >= 20 && d.inScene === d.count && d.crew >= 5, `shipyard: the ship lies at the berth of Sparrow's Floating Island with ${d.crew} crew aboard, ${d.inScene} people in all (the island reports ${d.count})`);
    check(JSON.stringify(await page.evaluate(() => window.__dockTest.exits())) === JSON.stringify([`Set sail for ${next1}`, 'Main menu']), `shipyard: from the level-cleared screen the ways out are "Set sail for ${next1}" and "Main menu"`);
    // The crew and the townsfolk are animated (their poses change from frame to frame).
    await page.evaluate(() => { window.__pose0 = window.__dockTest.poses(); });
    await page.waitForFunction(() => { const m = window.__dockTest.moved(window.__pose0); return m.crewMoved === m.crew && m.folkMoved >= Math.min(15, m.folk); }, null, { timeout: 60000, polling: 200 }).catch(() => {});
    const moving = await page.evaluate(() => window.__dockTest.moved(window.__pose0));
    check(moving.crew >= 5 && moving.crewMoved === moving.crew && moving.folk >= 15 && moving.folkMoved >= 15, `shipyard: the cleaning crew is at work (${moving.crewMoved} of ${moving.crew} moving) and the town is busy (${moving.folkMoved} of ${moving.folk} townsfolk moving)`);
    const ports0 = await page.evaluate(() => window.__dockTest.gunPorts(window.__game.dock.ship));
    check(ports0 === 3, `shipyard: the stock ship shows 3 cannons a side (${ports0} counted on the model)`);

    // Too poor: the Buy button is disabled with the reason, and clicking it anyway buys nothing.
    await setPurse(page, 250);
    const poor = await page.evaluate(() => window.__dockTest.rows());
    const gunsRow = poor.find((r) => r.id === 'guns');
    check(gunsRow.disabled && gunsRow.why === 'Need 50 more gold' && poor.filter((r) => r.id !== 'guns').every((r) => !r.disabled && r.why === ''), `shipyard: with 250 gold, Extra cannons (300) is disabled with "${gunsRow.why}"; the cheaper upgrades are not (${poor.map((r) => `${r.id}${r.disabled ? ' disabled' : ''}`).join(', ')})`);
    const uuid0 = await page.evaluate(() => window.__game.dock.ship.uuid);
    await page.click('.up-row[data-id="guns"] .buy-btn', { force: true });
    const refused = await page.evaluate(() => ({ purse: window.__game.state.purse, tier: window.__game.shipConfig.up.guns, uuid: window.__game.dock.ship.uuid, api: window.__game.dock.buy('guns'), live: document.getElementById('dock-live').textContent.trim() }));
    check(refused.purse === 250 && refused.tier === 0 && refused.uuid === uuid0 && refused.api === false && /50 more gold/.test(refused.live), `shipyard: clicking it anyway buys nothing and says why ("${refused.live}")`);

    // Buying: gold out of the chest, saved, the ship rebuilt with more cannons, the crew moved over.
    await setPurse(page, 1000);
    await page.click('.up-row[data-id="guns"] .buy-btn');
    const bought = await page.evaluate(async (uuid0) => {
      const G = window.__game;
      const T = window.__dockTest;
      let old = null;
      G.scene.traverse((o) => { if (o.uuid === uuid0) old = o; });
      return {
        purse: G.state.purse, savedPurse: localStorage.getItem('pirates-ahoy-purse'), tier: G.shipConfig.up.guns, saved: JSON.parse(localStorage.getItem('pirates-ahoy-ship') || 'null'),
        rebuilt: G.dock.ship.uuid !== uuid0, oldGone: !old, crew: T.people(G.dock.ship).length, ports: await T.gunPorts(G.dock.ship),
        focus: document.activeElement && document.activeElement.dataset.buy, live: document.getElementById('dock-live').textContent.trim(), row: T.rows().find((r) => r.id === 'guns'),
      };
    }, uuid0);
    check(bought.purse === 700 && bought.savedPurse === '700' && bought.tier === 1 && bought.saved && bought.saved.up.guns === 1, `shipyard: buying Extra cannons takes 300 gold (1000 -> ${bought.purse}) and saves the chest ("${bought.savedPurse}") and the ship (guns tier ${bought.saved && bought.saved.up.guns})`);
    check(bought.rebuilt && bought.oldGone && bought.crew === d.crew && bought.ports === 4, `shipyard: the ship is rebuilt with ${bought.ports} cannons a side, the old model is gone and the ${bought.crew} crew are aboard the new one`);
    check(bought.focus === 'guns' && /^Bought Extra cannons/.test(bought.live) && bought.row.pips === 'Upgraded 1 of 2' && /^4 guns → .*5 guns$/.test(bought.row.stat), `shipyard: focus stays on the Buy button, the purchase is announced ("${bought.live}") and the row shows ${bought.row.pips}, ${bought.row.stat}`);
    await page.click('.up-row[data-id="guns"] .buy-btn');
    const maxed = await page.evaluate(async () => {
      const G = window.__game;
      return { purse: G.state.purse, tier: G.shipConfig.up.guns, ports: await window.__dockTest.gunPorts(G.dock.ship), row: window.__dockTest.rows().find((r) => r.id === 'guns') };
    });
    const maxedApi = await page.evaluate(() => window.__game.dock.buy('guns'));
    const afterApi = await page.evaluate(() => window.__game.state.purse);
    check(maxed.purse === 0 && maxed.tier === 2 && maxed.ports === 5 && maxed.row.disabled && maxed.row.why === 'Fully upgraded' && /maxed/i.test(maxed.row.label) && maxedApi === false && afterApi === 0, `shipyard: the second tier (700) gives 5 cannons a side; then the button is disabled with "${maxed.row.why}" and nothing more can be bought`);
    // A double-click buys one tier, not two.
    await setPurse(page, 600);
    await page.dblclick('.up-row[data-id="shot"] .buy-btn');
    await frames(page, 1);
    const dbl = await page.evaluate(() => ({ tier: window.__game.shipConfig.up.shot, purse: window.__game.state.purse }));
    check(dbl.tier === 1 && dbl.purse === 450, `shipyard: a double-click on Buy buys one tier (${JSON.stringify(dbl)})`);

    // Paint: free, saved, the chosen swatch is pressed and the docked ship takes the colours.
    const royal = await page.evaluate(async () => (await import('/src/upgrades.js')).findLook('hull', 'royal').bottom);
    const colours0 = await page.evaluate(() => window.__dockTest.colours(window.__game.dock.ship));
    await page.click('#dock-tab-paint');
    for (const [part, id] of [['hull', 'royal'], ['sails', 'crimson'], ['flag', 'jolly']]) await page.click(`.swatch[data-part="${part}"][data-look="${id}"]`);
    const paint = await page.evaluate(() => {
      const G = window.__game;
      const pressed = {};
      for (const b of document.querySelectorAll('.swatch')) if (b.getAttribute('aria-pressed') === 'true') (pressed[b.dataset.part] = pressed[b.dataset.part] || []).push(b.dataset.look);
      return { pressed, look: G.shipConfig.look, saved: JSON.parse(localStorage.getItem('pirates-ahoy-ship')).look, purse: G.state.purse, colours: window.__dockTest.colours(G.dock.ship), tab: document.getElementById('dock-tab-paint').getAttribute('aria-selected') };
    });
    const wantLook = { hull: 'royal', sails: 'crimson', flag: 'jolly' };
    check(paint.tab === 'true' && JSON.stringify(paint.pressed) === '{"hull":["royal"],"sails":["crimson"],"flag":["jolly"]}' && JSON.stringify(paint.saved) === JSON.stringify(wantLook) && JSON.stringify(paint.look) === JSON.stringify(wantLook) && paint.purse === 450, `shipyard: paint is free, saved, and exactly one swatch per part is pressed (${JSON.stringify(paint.pressed)}, chest ${paint.purse})`);
    check(!colours0.includes(royal) && paint.colours.includes(royal), 'shipyard: the docked ship is repainted (its hull takes the Royal Blue paint)');

    // Set sail: the next level is played with the new ship; spending never touched the voyage's plunder.
    await page.click('#dock-next-btn');
    const l2 = await page.evaluate(async (royal) => {
      const G = window.__game;
      const T = window.__dockTest;
      const p = G.player;
      G.state.intro = 0;
      p.reload.port = 0;
      const n0 = G.balls.length;
      G.playerFire(-1);
      return {
        mode: G.state.mode, level: G.state.level, guns: p.type.guns, fired: G.balls.length - n0, ports: [await T.gunPorts(p.mesh, 1), await T.gunPorts(p.mesh, -1)],
        royal: T.colours(p.mesh).includes(royal), gold: G.state.gold, start: G.state.goldAtLevelStart, dock: T.shown('dock-screen'), hud: T.shown('hud'), view: !!(G.camera.view && G.camera.view.enabled),
      };
    }, royal);
    check(l2.mode === 'playing' && l2.level === 2 && !l2.dock && l2.hud && !l2.view, `shipyard: "Set sail for ${next1}" starts level 2 and puts the HUD and the normal camera back (${JSON.stringify({ mode: l2.mode, level: l2.level, dock: l2.dock, viewOffset: l2.view })})`);
    check(l2.guns === 5 && l2.fired === 5 && l2.ports.join() === '5,5' && l2.royal, `shipyard: the new ship sails on: ${l2.fired} balls a broadside, ${l2.ports.join(' / ')} cannons on the model, royal blue hull`);
    check(l2.gold === bank1.gold && l2.start === bank1.gold, `shipyard: spending the chest never reduces the voyage's plunder (${bank1.gold} -> ${l2.gold})`);

    // Level 2 cleared: only level 2's earnings are banked; Enter still sails on.
    const purse2 = await page.evaluate(() => window.__game.state.purse);
    await clearLevel(page);
    const bank2 = await page.evaluate(() => ({ mode: window.__game.state.mode, gold: window.__game.state.gold, start: window.__game.state.goldAtLevelStart, purse: window.__game.state.purse }));
    const earned2 = bank2.gold - bank2.start;
    check(bank2.mode === 'levelDone' && bank2.start === bank1.gold && earned2 > 0 && bank2.purse === purse2 + earned2, `shipyard: the next level banks only its own ${earned2} gold (chest ${purse2} -> ${bank2.purse}; voyage plunder ${bank2.gold})`);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('Enter');
    const l3 = await page.evaluate(() => ({ mode: window.__game.state.mode, level: window.__game.state.level, purse: window.__game.state.purse }));
    check(l3.mode === 'playing' && l3.level === 3 && l3.purse === bank2.purse, `shipyard: Enter on the level-cleared screen still sails on (level ${l3.level}, chest unchanged)`);

    // Shipwrecked: the lost attempt's gold is not banked; the dock leads back to trying again.
    const over = await page.evaluate(() => {
      const G = window.__game;
      const purse = G.state.purse;
      G.state.intro = 0;
      G.state.gold += 77; // loot from this attempt, lost with the ship
      G.damage(G.player, 9999);
      for (let i = 0; i < 120 * 10 && G.state.mode === 'playing'; i++) G.step(1 / 120);
      return { mode: G.state.mode, purse, after: G.state.purse, buttons: [...document.querySelectorAll('#over-screen button')].filter((b) => b.getClientRects().length).map((b) => b.id) };
    });
    check(over.mode === 'over' && over.after === over.purse && over.buttons.join() === 'retry-btn,over-dock-btn,menu-btn', `shipyard: shipwrecked: nothing is banked, and "Visit the dock" sits between Try again and Main menu (${over.buttons.join(', ')})`);
    await page.click('#over-dock-btn');
    const here3 = await page.evaluate(() => window.__game.LEVELS[2].env.meta.name);
    const fromOver = await dockState(page);
    check(fromOver.mode === 'dock' && fromOver.from === 'over' && JSON.stringify(fromOver.exits) === JSON.stringify([`Try again: ${here3}`, 'Main menu']), `shipyard: from the shipwrecked screen the ways out are ${fromOver.exits.map((e) => `"${e}"`).join(' and ')}`);
    await page.click('#dock-retry-btn');
    const retried = await page.evaluate(() => ({ mode: window.__game.state.mode, level: window.__game.state.level, intro: window.__game.state.intro, gold: window.__game.state.gold, start: window.__game.state.goldAtLevelStart, dock: window.__dockTest.shown('dock-screen') }));
    check(retried.mode === 'playing' && retried.level === 3 && retried.intro === 0 && retried.gold === retried.start && retried.gold === bank2.gold && !retried.dock, `shipyard: "Try again" retries level 3 with the gold from its start (${JSON.stringify(retried)})`);

    // From the title: one way out, back to the title. Keys that pause or sail on do nothing here.
    await page.evaluate(() => window.__game.showMenu());
    await page.click('#menu-dock-btn');
    const fromTitle = await dockState(page);
    check(fromTitle.mode === 'dock' && fromTitle.from === 'menu' && JSON.stringify(fromTitle.exits) === '["Back to the title"]', `shipyard: from the title the only way out is "Back to the title" (${fromTitle.exits.join(' | ')})`);
    const keep = () => page.evaluate(() => ({ mode: window.__game.state.mode, purse: window.__game.state.purse, cfg: JSON.stringify(window.__game.shipConfig), balls: window.__game.balls.length, level: window.__game.state.level, pause: window.__dockTest.shown('pause-screen'), dock: window.__dockTest.shown('dock-screen'), hud: window.__dockTest.shown('hud') }));
    const k0 = await keep();
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    for (const key of ['p', 'Escape', 'Enter', ' ']) await page.keyboard.press(key);
    await page.focus('#dock-tab-up');
    for (const key of ['p', 'Escape']) await page.keyboard.press(key);
    await frames(page, 1);
    const k1 = await keep();
    check(JSON.stringify(k1) === JSON.stringify(k0) && k1.mode === 'dock' && k1.dock && !k1.pause && !k1.hud, `shipyard: P, Escape, Enter and Space do nothing in the dock (${JSON.stringify(k1)})`);
    await page.click('#dock-title-btn');
    const back = await page.evaluate(() => ({ mode: window.__game.state.mode, menu: window.__dockTest.shown('menu-screen'), dock: window.__dockTest.shown('dock-screen'), chest: document.getElementById('menu-chest').textContent, purse: window.__game.state.purse }));
    check(back.mode === 'menu' && back.menu && !back.dock && back.chest === String(back.purse), `shipyard: "Back to the title" returns to the title, which shows the chest (${JSON.stringify(back)})`);

    // Quitting the voyage after a level: back to the title, keeping progress, the chest and the best score.
    await page.evaluate(() => { window.__game.newGame(1); });
    await clearLevel(page);
    // (A lower best score first, so this voyage's plunder must become the new best.)
    const quitFrom = await page.evaluate(() => {
      window.__game.state.best = 10;
      localStorage.setItem('pirates-ahoy-best', '10');
      return { gold: window.__game.state.gold, purse: window.__game.state.purse };
    });
    await page.click('#exit-btn');
    const quit = await page.evaluate(() => ({ mode: window.__game.state.mode, best: window.__game.state.best, unlocked: window.__game.state.unlocked, purse: window.__game.state.purse, savedBest: localStorage.getItem('pirates-ahoy-best'), menu: window.__dockTest.shown('menu-screen') }));
    check(quit.mode === 'menu' && quit.menu && quit.purse === quitFrom.purse && quit.unlocked === 3 && quit.best === quitFrom.gold && quit.savedBest === String(quitFrom.gold), `shipyard: "Main menu" after a level ends the voyage, keeping progress, the chest and the best score (${JSON.stringify(quit)})`);
    await ctx.close();
  }

  // A slow device: each purchase (the ship's rebuild) holds the page up for longer than a double-click
  // lasts, so the second click is only handled long after it happened. It still buys just once.
  {
    const { ctx, page } = await open();
    await page.evaluate(dockHelpers);
    await page.evaluate(() => {
      const G = window.__game;
      G.state.purse = 2000;
      G.dock.open('menu');
      // 700 ms of work after every click on a Buy button, as a rebuild takes on a slow phone.
      let buy = false;
      document.addEventListener('click', (e) => { buy = e.target instanceof Element && !!e.target.closest('[data-buy]'); }, true);
      document.addEventListener('click', () => {
        if (!buy) return;
        const end = performance.now() + 700;
        while (performance.now() < end);
      });
    });
    await frames(page, 1);
    const tiers = () => page.evaluate(() => ({ hull: window.__game.shipConfig.up.hull, crew: window.__game.shipConfig.up.crew, purse: window.__game.state.purse }));
    await page.dblclick('.up-row[data-id="hull"] .buy-btn');
    await frames(page, 1);
    const slowDbl = await tiers();
    check(slowDbl.hull === 1 && slowDbl.purse === 1880, `shipyard (slow device): a double-click on Buy buys one tier (${JSON.stringify(slowDbl)})`);
    // Two separate clicks 150 ms apart, the second arriving while the first purchase is still under way.
    const cdp = await ctx.newCDPSession(page);
    const box = await page.locator('.up-row[data-id="crew"] .buy-btn').boundingBox();
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const press = () => Promise.all(['mousePressed', 'mouseReleased'].map((type) => cdp.send('Input.dispatchMouseEvent', { type, ...at, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 })));
    await page.mouse.move(at.x, at.y);
    await new Promise((r) => setTimeout(r, 800));
    const first = press();
    await new Promise((r) => setTimeout(r, 150));
    await Promise.all([first, press()]);
    await frames(page, 1);
    const slowQuick = await tiers();
    check(slowQuick.crew === 1 && slowQuick.purse === 1730, `shipyard (slow device): a second click that comes while the purchase is still under way buys nothing more (${JSON.stringify(slowQuick)})`);
    // Buying again on purpose, once the purchase is done, still works.
    await new Promise((r) => setTimeout(r, 900));
    await page.click('.up-row[data-id="crew"] .buy-btn');
    await frames(page, 1);
    const again = await tiers();
    check(again.crew === 2 && again.purse === 1380, `shipyard (slow device): a click after the purchase has finished buys the next tier (${JSON.stringify(again)})`);
    await ctx.close();
  }

  // The hull scrubber's plank, its ropes and his bucket (and the rest of the crew's props) stay clear of
  // the gun barrels, which grow in number (Extra cannons) and size (Heavy shot) with the upgrades.
  {
    const { ctx, page } = await open();
    await page.evaluate(() => window.__game.dock.open('menu'));
    const clash = await page.evaluate(async () => {
      const THREE = await import('/vendor/three.module.min.js');
      const G = window.__game;
      const { buildShip, disposeShip } = await import('/src/ships.js');
      const { playerType, parseShipConfig } = await import('/src/upgrades.js');
      const { SHIP_TYPES } = await import('/src/shipTypes.js');
      const BARREL = new Set([0x2d2a33, 0xd0903f]); // iron, and bronze for heavy shot
      const out = [];
      for (let guns = 0; guns <= 2; guns++) {
        for (let shot = 0; shot <= 3; shot++) {
          const cfg = parseShipConfig(JSON.stringify({ up: { guns, shot } }));
          const mesh = buildShip('player', { type: playerType(SHIP_TYPES.player, cfg), look: cfg.look, upgrades: cfg.up });
          G.env.setShip(mesh); // the crew boards this ship (ship-local, so it needn't be at the berth)
          mesh.updateMatrixWorld(true);
          const crew = mesh.children.find((o) => o.name === 'sparrow-crew');
          const inCrew = (o) => { for (let n = o; n; n = n.parent) if (n === crew) return true; return false; };
          const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
          const m = new THREE.Matrix4();
          const v = new THREE.Vector3();
          // Barrel boxes: barrel-coloured vertices out past the camera-side hull at gun height, grouped by z.
          const pts = [];
          mesh.traverse((o) => {
            if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || inCrew(o)) return;
            const mats = [].concat(o.material);
            const g = o.geometry;
            const idx = g.index;
            m.multiplyMatrices(inv, o.matrixWorld);
            for (const gr of g.groups.length ? g.groups : [{ start: 0, count: idx ? idx.count : g.attributes.position.count, materialIndex: 0 }]) {
              const mat = mats[gr.materialIndex] || mats[0];
              if (!mat || !mat.color || !BARREL.has(mat.color.getHex())) continue;
              for (let k = gr.start; k < gr.start + gr.count; k++) {
                v.fromBufferAttribute(g.attributes.position, idx ? idx.getX(k) : k).applyMatrix4(m);
                if (v.x < -1.2 && v.y > 0.4 && v.y < 1.25) pts.push([v.x, v.y, v.z]);
              }
            }
          });
          pts.sort((a, b) => a[2] - b[2]);
          const boxes = [];
          for (const p of pts) {
            const b = boxes[boxes.length - 1];
            if (b && p[2] - b.max[2] < 0.3) for (let i = 0; i < 3; i++) { b.min[i] = Math.min(b.min[i], p[i]); b.max[i] = Math.max(b.max[i], p[i]); }
            else boxes.push({ min: [...p], max: [...p] });
          }
          // The crew's props (not the people, not the bubbles) inside a barrel box.
          let inside = 0;
          crew.traverse((o) => {
            if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) return;
            const pos = o.geometry.attributes.position;
            m.multiplyMatrices(inv, o.matrixWorld);
            for (let i = 0; i < pos.count; i++) {
              v.fromBufferAttribute(pos, i).applyMatrix4(m);
              if (boxes.some((b) => [0, 1, 2].every((k) => v.getComponent(k) > b.min[k] + 0.005 && v.getComponent(k) < b.max[k] - 0.005))) inside++;
            }
          });
          out.push({ guns: 3 + guns, shot, barrels: boxes.length, inside });
          G.env.setShip(null); // the crew off before the ship is disposed
          disposeShip(mesh);
        }
      }
      G.env.setShip(G.dock.ship); // the crew goes back to the docked ship
      return out;
    });
    const bad = clash.filter((c) => c.inside > 0 || c.barrels !== c.guns);
    check(clash.length === 12 && bad.length === 0, `shipyard: the hull scrubber's plank, ropes and bucket stay clear of the gun barrels with 3 to 5 guns a side and every heavy-shot tier${bad.length ? ' -> ' + JSON.stringify(bad) : ''}`);
    await ctx.close();
  }

  // Keyboard only: Tab reaches the tabs, every Buy button, the swatches and the ways out, each with a
  // visible focus ring and scrolled into view; Enter and Space buy (once), arrows switch tabs.
  {
    const { ctx, page } = await open();
    await page.evaluate(dockHelpers);
    await page.evaluate(() => { window.__game.state.purse = 500; });
    let titleFocus = null;
    for (let i = 0; i < 25 && !(titleFocus && titleFocus.id === 'menu-dock-btn'); i++) {
      await page.keyboard.press('Tab');
      titleFocus = await page.evaluate(focusProbe);
    }
    check(!!titleFocus && titleFocus.id === 'menu-dock-btn' && titleFocus.ring && titleFocus.visible, `keyboard: Tab reaches the Shipyard button on the title screen, with a focus ring (${JSON.stringify(titleFocus)})`);
    await page.keyboard.press('Enter');
    await frames(page, 2);
    const first = await page.evaluate(focusProbe);
    const mode = await page.evaluate(() => window.__game.state.mode);
    check(mode === 'dock' && first && first.id === 'dock-tab-up' && first.ring && first.visible, `keyboard: Enter opens the shipyard with focus on the Upgrades tab (${JSON.stringify(first)})`);
    // M toggles the sound here too, says so, and the sound button shows it; Shift+Tab reaches that button.
    const sound = [];
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('m');
      sound.push(await page.evaluate(() => ({ muted: window.__game.audio.muted, pressed: document.getElementById('dock-mute').getAttribute('aria-pressed'), live: document.getElementById('dock-live').textContent.trim() })));
    }
    await page.keyboard.press('Shift+Tab');
    const muteFocus = await page.evaluate(focusProbe);
    await page.keyboard.press('Enter');
    const byButton = await page.evaluate(() => ({ muted: window.__game.audio.muted, focus: document.activeElement && document.activeElement.id }));
    await page.keyboard.press('Space');
    const byButton2 = await page.evaluate(() => window.__game.audio.muted);
    check(
      JSON.stringify(sound) === JSON.stringify([{ muted: true, pressed: 'true', live: 'Sound off.' }, { muted: false, pressed: 'false', live: 'Sound on.' }]) &&
        muteFocus && muteFocus.id === 'dock-mute' && muteFocus.ring && muteFocus.visible && byButton.muted && byButton.focus === 'dock-mute' && byButton2 === false,
      `keyboard: M mutes and unmutes in the shipyard and says so; Shift+Tab reaches the sound button, which Enter and Space toggle (${JSON.stringify({ sound, muteFocus, byButton, byButton2 })})`,
    );
    await page.focus('#dock-tab-up');
    const order = [];
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(focusProbe);
      if (!f || !f.inDock) break;
      order.push(f);
    }
    const wantOrder = ['buy-guns', 'buy-shot', 'buy-crew', 'buy-hull', 'buy-sails', 'buy-carpenter', 'dock-title-btn'];
    const unseen = order.filter((f) => !f.ring || !f.visible).map((f) => f.id);
    check(order.map((f) => f.id).join() === wantOrder.join() && unseen.length === 0, `keyboard: Tab goes through every Buy button to the way out, each with a visible focus ring (${order.map((f) => f.id).join(' > ')}${unseen.length ? '; not visible: ' + unseen.join(', ') : ''})`);

    await page.focus('#dock-tab-up');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await frames(page, 1);
    const k1 = await page.evaluate(() => ({ guns: window.__game.shipConfig.up.guns, purse: window.__game.state.purse }));
    const f1 = await page.evaluate(focusProbe);
    check(k1.guns === 1 && k1.purse === 200 && f1 && f1.id === 'buy-guns' && f1.visible, `keyboard: Enter on a Buy button buys, and focus stays on it (${JSON.stringify({ ...k1, focus: f1 && f1.id })})`);
    await page.keyboard.press('Tab');
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    await frames(page, 1);
    const k2 = await page.evaluate(() => ({ shot: window.__game.shipConfig.up.shot, purse: window.__game.state.purse }));
    check(k2.shot === 1 && k2.purse === 50, `keyboard: holding Enter on Buy buys once, not on every key repeat (${JSON.stringify(k2)})`);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    const k3 = await page.evaluate(() => ({ crew: window.__game.shipConfig.up.crew, purse: window.__game.state.purse, live: document.getElementById('dock-live').textContent.trim(), focus: document.activeElement.dataset.buy }));
    check(k3.crew === 0 && k3.purse === 50 && /100 more gold/.test(k3.live) && k3.focus === 'crew', `keyboard: Space on an out-of-reach Buy button only says why ("${k3.live}")`);
    await page.focus('#dock-tab-up');
    await page.keyboard.press('ArrowRight');
    const tab = await page.evaluate(() => ({ focus: document.activeElement.id, selected: document.getElementById('dock-tab-paint').getAttribute('aria-selected'), up: document.getElementById('dock-up').hidden, paint: document.getElementById('dock-paint').hidden }));
    check(tab.focus === 'dock-tab-paint' && tab.selected === 'true' && tab.up && !tab.paint, `keyboard: → moves to the Paint tab and shows it (${JSON.stringify(tab)})`);
    const swatches = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(focusProbe);
      if (!f || !f.inDock) break;
      swatches.push(f);
      if (f.id === 'swatch-hull-royal') {
        await page.keyboard.press('Enter');
        swatches.push({ ...f, id: `painted ${await page.evaluate(() => window.__game.shipConfig.look.hull)}` });
      }
      if (f.id === 'dock-title-btn') break;
    }
    const sw = swatches.filter((f) => f.id.startsWith('swatch-'));
    const swBad = swatches.filter((f) => !f.ring || !f.visible).map((f) => f.id);
    check(sw.length === 16 && swatches.some((f) => f.id === 'painted royal') && swatches[swatches.length - 1].id === 'dock-title-btn' && swBad.length === 0, `keyboard: Tab reaches all ${sw.length} paint swatches (Enter paints) and then the way out, each with a visible focus ring${swBad.length ? '; not visible: ' + swBad.join(', ') : ''}`);
    await page.keyboard.press('Enter');
    check((await page.evaluate(() => window.__game.state.mode)) === 'menu', 'keyboard: Enter on "Back to the title" leaves the shipyard');
    await ctx.close();
  }

  // Saved shipyard records (the chest and the ship) are validated like the other records.
  {
    const { ctx, page } = await open();
    const DEF = { up: { guns: 0, shot: 0, crew: 0, hull: 0, sails: 0, carpenter: 0 }, look: { hull: 'honey', sails: 'cream', flag: 'pennant' } };
    const cfg = (up = {}, look = {}) => ({ up: { ...DEF.up, ...up }, look: { ...DEF.look, ...look } });
    // Can this browser tell JSON number literals like 1e1 or 2.0 from plain integers?
    const literals = await page.evaluate(() => { let s = false; JSON.parse('1', (k, v, c) => { s = !!(c && typeof c.source === 'string'); return v; }); return s; });
    const cases = [
      { name: 'garbage', purse: 'lots', ship: 'garbage{', wantPurse: 0, want: DEF },
      { name: 'Infinity / a JSON array', purse: 'Infinity', ship: '[]', wantPurse: 0, want: DEF },
      { name: 'negative / bad tiers and paint', purse: '-5', ship: JSON.stringify({ up: { guns: '1e1', shot: 2.5, crew: -3, hull: 99, sails: null, carpenter: '2' }, look: { hull: 'nope', sails: 'crimson', flag: {} } }), wantPurse: 0, want: cfg({ hull: 3, carpenter: 2 }, { sails: 'crimson' }) },
      { name: 'fractional / number literals', purse: '12.5', ship: '{"up":{"guns":1e1,"shot":2.0,"crew":"3"},"look":{"flag":"jolly"}}', wantPurse: 0, want: literals ? cfg({ crew: 3 }, { flag: 'jolly' }) : cfg({ guns: 2, shot: 2, crew: 3 }, { flag: 'jolly' }) },
      { name: 'too large / prototype tricks', purse: '99999999', ship: '{"__proto__":{"up":{"guns":2}},"up":{"guns":1,"constructor":5},"look":{"hull":"__proto__"},"gold":1}', wantPurse: 1000000, want: cfg({ guns: 1 }) },
      { name: 'empty', purse: '', ship: '', wantPurse: 0, want: DEF },
      { name: 'valid records', purse: '420', ship: JSON.stringify(cfg({ guns: 2, sails: 1 }, { hull: 'plum', sails: 'sky', flag: 'gold' })), wantPurse: 420, want: cfg({ guns: 2, sails: 1 }, { hull: 'plum', sails: 'sky', flag: 'gold' }) },
    ];
    for (const c of cases) {
      await page.evaluate((c) => {
        localStorage.clear();
        localStorage.setItem('pirates-ahoy-purse', c.purse);
        localStorage.setItem('pirates-ahoy-ship', c.ship);
      }, c);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__gameReady === true, null, { timeout: 120000 });
      const r = await page.evaluate(() => ({
        purse: window.__game.state.purse,
        cfg: window.__game.shipConfig,
        storedPurse: localStorage.getItem('pirates-ahoy-purse'),
        storedShip: localStorage.getItem('pirates-ahoy-ship'),
        chest: document.getElementById('menu-chest').textContent,
        polluted: ({}).up !== undefined || ({}).guns !== undefined,
      }));
      const ok = r.purse === c.wantPurse && JSON.stringify(r.cfg) === JSON.stringify(c.want) && r.storedPurse === String(c.wantPurse) && r.storedShip === JSON.stringify(c.want) && r.chest === String(c.wantPurse) && !r.polluted;
      check(ok, `saved shipyard records (${c.name}): chest ${r.purse}, ship ${JSON.stringify(r.cfg)}, rewritten as "${r.storedPurse}" / ${r.storedShip}`);
    }
    // The last (valid) records are what the shipyard and the next voyage use.
    await page.evaluate(dockHelpers);
    await page.click('#menu-dock-btn');
    const used = await page.evaluate(async () => {
      const G = window.__game;
      const T = window.__dockTest;
      const plum = (await import('/src/upgrades.js')).findLook('hull', 'plum').bottom;
      return { mode: G.state.mode, guns: T.rows().find((r) => r.id === 'guns').pips, sails: T.rows().find((r) => r.id === 'sails').pips, ports: await T.gunPorts(G.dock.ship), plum: T.colours(G.dock.ship).includes(plum), pressed: [...document.querySelectorAll('.swatch[aria-pressed="true"]')].map((b) => b.dataset.look).join() };
    });
    check(used.mode === 'dock' && used.guns === 'Upgraded 2 of 2' && used.sails === 'Upgraded 1 of 2' && used.ports === 5 && used.plum && used.pressed === 'plum,sky,gold', `saved shipyard records: the shipyard shows the saved ship (${JSON.stringify(used)})`);
    await ctx.close();

    // Storage blocked: the shipyard still works for this visit.
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
    await bp.evaluate(dockHelpers);
    await bp.click('#menu-dock-btn');
    await setPurse(bp, 500);
    await bp.click('.up-row[data-id="guns"] .buy-btn');
    await bp.click('#dock-tab-paint');
    await bp.click('.swatch[data-part="hull"][data-look="royal"]');
    const mem = await bp.evaluate(() => ({ mode: window.__game.state.mode, purse: window.__game.state.purse, cfg: window.__game.shipConfig }));
    await bp.click('#dock-title-btn');
    const left = await bp.evaluate(() => window.__game.state.mode);
    check(mem.mode === 'dock' && mem.purse === 200 && mem.cfg.up.guns === 1 && mem.cfg.look.hull === 'royal' && left === 'menu', `saved shipyard records: with storage blocked, buying and painting still work for the visit (${JSON.stringify({ purse: mem.purse, guns: mem.cfg.up.guns, hull: mem.cfg.look.hull })})`);
    await blocked.close();
  }

  // Layout and contrast of the shipyard panel on small and large screens.
  // 1024x1366 is a portrait tablet (iPad Pro 12.9") wider than the bottom sheet's 620px cap.
  for (const [w, h, touch] of [[320, 480, true], [390, 844, true], [844, 390, true], [568, 320, true], [1280, 720, false], [1024, 1366, true]]) {
    const { ctx, page } = await open({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    await page.evaluate(dockHelpers);
    // From the level-cleared screen (two ways out: the widest footer), with a maxed upgrade, some
    // affordable and some out of reach, so every kind of row shows.
    await page.evaluate(() => {
      const G = window.__game;
      G.state.purse = 550;
      G.dock.open('levelDone');
      G.dock.buy('sails');
      G.dock.buy('sails');
      G.state.purse = 140;
    });
    await page.waitForFunction(() => document.getElementById('dock-chest-gold').textContent === '140', null, { timeout: 60000 }).catch(() => {});
    await settle(page);
    const lay = await page.evaluate(dockLayoutProbe);
    check(lay.problems.length === 0 && lay.exits === 2 && lay.buys === 6 && lay.swatches === 16, `shipyard layout ${w}x${h}${touch ? ' touch' : ''}: no page scroll, the ways out, tabs, every Buy button and swatch on screen (or scrolled to inside the panel), 44px targets, nothing overlapping${lay.problems.length ? ' -> ' + lay.problems.join('; ') : ''}`);
    // The ship is framed in the free space beside (or above) the panel: no part of it above the
    // water lies under the panel or off screen, and it is not tiny.
    const frame = await page.evaluate(async () => {
      const THREE = await import('/vendor/three.module.min.js');
      const G = window.__game;
      const p = document.getElementById('dock-panel').getBoundingClientRect();
      const mb = document.getElementById('dock-mute').getBoundingClientRect();
      const v = new THREE.Vector3();
      let n = 0;
      let under = 0;
      let off = 0;
      let underMute = 0;
      let x0 = Infinity;
      let x1 = -Infinity;
      G.dock.ship.updateMatrixWorld(true);
      for (const m of window.__dockTest.shipParts(G.dock.ship)) {
        const pos = m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 2) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          if (v.y < 0.05) continue; // under water
          v.project(G.camera);
          const x = ((v.x + 1) / 2) * innerWidth;
          const y = ((1 - v.y) / 2) * innerHeight;
          n++;
          if (x > p.left && x < p.right && y > p.top && y < p.bottom) under++;
          if (x > mb.left && x < mb.right && y > mb.top && y < mb.bottom) underMute++;
          if (x < 0 || x > innerWidth || y < 0 || y > innerHeight) off++;
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
        }
      }
      const L = G.dock.layout;
      return { points: n, underPanel: under, underMute, offScreen: off, fill: L ? +((x1 - x0) / L.fw).toFixed(2) : 0, free: L && [L.fx, L.fy, L.fw, L.fh].map(Math.round) };
    });
    check(frame.points > 1000 && frame.underPanel === 0 && frame.underMute === 0 && frame.offScreen === 0 && frame.fill > 0.5, `shipyard layout ${w}x${h}: the ship is framed in the free space beside the panel (${JSON.stringify(frame)})`);
    // The sound button: on screen in a corner of the view, clear of the panel, a 44px target that toggles the sound.
    const mute = await page.evaluate(() => {
      const b = document.getElementById('dock-mute');
      const r = b.getBoundingClientRect();
      const p = document.getElementById('dock-panel').getBoundingClientRect();
      const ov = Math.max(0, Math.min(r.right, p.right) - Math.max(r.left, p.left)) * Math.max(0, Math.min(r.bottom, p.bottom) - Math.max(r.top, p.top));
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { size: [r.width, r.height].map(Math.round), onScreen: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, overPanel: ov, uncovered: !!hit && b.contains(hit), muted: window.__game.audio.muted };
    });
    if (touch) await page.tap('#dock-mute');
    else await page.click('#dock-mute');
    const toggled = await page.evaluate(() => ({ muted: window.__game.audio.muted, pressed: document.getElementById('dock-mute').getAttribute('aria-pressed'), label: document.getElementById('dock-mute').getAttribute('aria-label') }));
    check(mute.onScreen && mute.uncovered && mute.overPanel === 0 && mute.size[0] >= 44 && mute.size[1] >= 44 && !mute.muted && toggled.muted && toggled.pressed === 'true' && toggled.label === 'Unmute sound', `shipyard layout ${w}x${h}${touch ? ' touch' : ''}: a ${mute.size.join('x')} sound button on screen beside the panel ${touch ? 'taps' : 'clicks'} the sound off (${JSON.stringify({ ...mute, after: toggled })})`);
    const contrast = [...(await page.evaluate(dockContrastProbe, '#dock-panel'))];
    await page.evaluate(() => document.getElementById('dock-tab-paint').click());
    contrast.push(...(await page.evaluate(dockContrastProbe, '#dock-panel')));
    const bad = contrast.filter((r) => r.ratio < r.need);
    check(contrast.length >= 30 && bad.length === 0, `shipyard contrast ${w}x${h}: all ${contrast.length} texts in the panel reach 4.5:1 (3:1 for large text; lowest ${Math.min(...contrast.map((r) => r.ratio))})${bad.length ? ' -> ' + JSON.stringify(bad) : ''}`);
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
