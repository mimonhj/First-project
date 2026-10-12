// End-to-end test: serves the game, drives it in headless Chromium and checks
// rendering, controls, combat, waves, hazards, level flow and that every level is winnable.
// Run with `npm test` (needs the `playwright` package and a Chromium build).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.SCREENSHOT_DIR || path.join(ROOT, 'tests', 'screenshots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

let failures = 0;
function check(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const g = (page, expr) => page.evaluate(`window.__game.${expr}`);

// Freeze the real-time loop so the test can drive the simulation deterministically.
const freeze = (page) => page.evaluate(() => {
  const G = window.__game;
  if (G.state.mode === 'playing') G.togglePause();
});
// Step the simulation `seconds` while the page is frozen.
const simulate = (page, seconds) =>
  page.evaluate((seconds) => {
    const G = window.__game;
    G.state.mode = 'playing';
    for (let i = 0; i < seconds * 120 && G.state.mode === 'playing'; i++) G.step(1 / 120);
    const mode = G.state.mode;
    if (mode === 'playing') G.state.mode = 'paused';
    return mode;
  }, seconds);
// Wait (in real time) until the game's own clock has advanced `seconds`.
// Software WebGL can be slow, so wall-clock waits are not reliable.
const waitSim = (page, seconds) =>
  page.waitForFunction((target) => window.__game.state.time >= target, seconds, { timeout: 120000, polling: 50 })
    .catch(() => {})
    .then(() => {});
const simTime = (page) => page.evaluate(() => window.__game.state.time);
// Sink every live enemy, then let waves/timers play out.
const sinkAll = (page) => page.evaluate(() => window.__game.enemies.forEach((e) => window.__game.damage(e, 9999)));

async function shotColours(page) {
  const shot = (await page.screenshot()).toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 64; c.height = 36;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 64, 36);
    const d = ctx.getImageData(0, 0, 64, 36).data;
    const set = new Set();
    for (let i = 0; i < d.length; i += 4) set.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
    return set.size;
  }, shot);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const url = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const errors = [];
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  };
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  watch(page);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.env, null, { timeout: 120000 });
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, '1-menu.png') });
  check(await page.isVisible('#menu-screen'), 'title screen is shown');
  check((await g(page, 'state.mode')) === 'menu', 'game starts in menu mode');

  // Full-resolution rendering (no more pixel upscaling).
  const size = await page.evaluate(() => [document.getElementById('game').width, document.getElementById('game').height]);
  check(size[0] >= 1280 && size[1] >= 720, `renders at full resolution (${size})`);
  // Slow (software) rendering should make the game lower its internal resolution.
  await page.waitForFunction(() => window.__game.quality.level > 0, null, { timeout: 120000 }).catch(() => {});
  const q = await g(page, 'quality');
  check(q.level > 0 && q.scale < 1, `adaptive resolution kicks in on a slow renderer (scale ${q.scale})`);
  const colours = await shotColours(page);
  check(colours > 40, `title scene renders with rich colour (${colours} colour buckets)`);

  // Level select: 3 cards, only the first unlocked on a fresh profile.
  const cards = await page.$$eval('.level-card', (els) => els.map((e) => ({ text: e.textContent, locked: e.disabled })));
  check(cards.length === 3, `3 level cards (${cards.map((c) => c.text.replace(/\s+/g, ' ')).join(' | ')})`);
  check(!cards[0].locked && cards[1].locked && cards[2].locked, 'only level 1 is unlocked at first');
  check(/Easy/.test(cards[0].text) && /Medium/.test(cards[1].text) && /Hard/.test(cards[2].text), 'level cards show the difficulty');
  check(await page.evaluate(() => window.__gameReady === true), 'startup sets the ready flag');

  // ---- Level 1.
  await page.click('#start-btn');
  check((await g(page, 'state.mode')) === 'playing', 'Set sail starts the game');
  check((await g(page, 'state.level')) === 1, 'starts at level 1');
  const l1 = await page.evaluate(() => ({ name: window.__game.env && window.__game.LEVELS[0].env.meta.name, enemies: window.__game.enemies.map((e) => e.typeName), colliders: window.__game.colliders.length }));
  check(/Europe/i.test(l1.name), `level 1 is the coast of Europe (${l1.name})`);
  check(l1.enemies.join() === 'cutter,cutter', `level 1 opens with corsair cutters (${l1.enemies})`);
  check(l1.colliders > 3, `level 1 has land to steer around (${l1.colliders} colliders)`);
  check(await page.isVisible('.hud-top'), 'HUD is visible');
  check((await g(page, 'state.sail')) === 2, 'the voyage starts at cruising speed');
  // On a fresh profile, level 1 shows control hints once the fly-in is over.
  await page.waitForFunction(() => window.__game.state.intro === 0, null, { timeout: 120000 });
  await page.waitForFunction(() => !document.getElementById('hint').classList.contains('hidden'), null, { timeout: 60000 }).catch(() => {});
  check(/Steer/i.test(await page.textContent('#hint')), `first-voyage hint is shown ("${(await page.textContent('#hint')).trim()}")`);
  await page.screenshot({ path: path.join(OUT, '2a-europe-intro.png') });
  await page.waitForFunction(() => window.__game.state.intro === 0, null, { timeout: 120000 });
  await page.screenshot({ path: path.join(OUT, '2-europe.png') });

  // ---- Sails and steering.
  await page.keyboard.press('w');
  await page.keyboard.press('w');
  await page.keyboard.press('w');
  check((await g(page, 'state.sail')) === 3, 'W raises sails and clamps at full');
  await page.keyboard.press('s');
  check((await g(page, 'state.sail')) === 2, 'S lowers sails');
  const p0 = await page.evaluate(() => [window.__game.player.x, window.__game.player.z]);
  await waitSim(page, (await simTime(page)) + 1);
  const p1 = await page.evaluate(() => [window.__game.player.x, window.__game.player.z]);
  check(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 1, 'ship sails forward');
  const h0 = await g(page, 'player.h');
  await page.keyboard.down('a');
  await waitSim(page, (await simTime(page)) + 0.4);
  await page.keyboard.up('a');
  const h1 = await g(page, 'player.h');
  const turned = (a, b) => ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  check(turned(h0, h1) > 0.1, `A turns to port (${h0.toFixed(2)} -> ${h1.toFixed(2)})`);
  await page.keyboard.down('ArrowRight');
  await waitSim(page, (await simTime(page)) + 0.4);
  await page.keyboard.up('ArrowRight');
  check(turned(h1, await g(page, 'player.h')) < -0.1, 'ArrowRight turns to starboard');

  // ---- Firing and reloading.
  await freeze(page);
  const fired = await page.evaluate(() => {
    const G = window.__game;
    G.state.mode = 'playing';
    const before = G.balls.length;
    const ok1 = G.playerFire(-1);
    const added = G.balls.length - before;
    const ok2 = G.playerFire(-1);
    const ok3 = G.playerFire(1);
    G.state.mode = 'paused';
    return { ok1, ok2, ok3, added, guns: G.SHIP_TYPES.player.guns };
  });
  check(fired.ok1 && fired.added === fired.guns, `port broadside fires ${fired.added} balls`);
  check(!fired.ok2 && fired.ok3, 'each side reloads independently');
  await simulate(page, 2.5);
  check((await page.evaluate(() => window.__game.balls.filter((b) => b.owner === 'player').length)) === 0, 'cannonballs splash down and are removed');

  // ---- Hits at several ranges (only one target, land moved out of the way).
  for (const dist of [10, 18, 26, 32]) {
    const res = await page.evaluate((dist) => {
      const G = window.__game;
      const p = G.player;
      p.x = 0; p.z = 0; p.h = 0; p.speed = 0; p.reload.star = 0;
      G.colliders.forEach((c) => (c.x += 5000));
      G.enemies.forEach((o, k) => { o.x = 60 + k * 20; o.z = 60; });
      const e = G.enemies[0];
      e.x = -dist; e.z = 0; e.h = 0; e.speed = 0; e.hp = e.maxHp; e.sinking = 0;
      const hp0 = e.hp;
      G.state.mode = 'playing';
      G.playerFire(1);
      for (let i = 0; i < 240; i++) {
        e.x = -dist; e.z = 0; e.speed = 0; p.speed = 0; p.x = 0; p.z = 0;
        G.step(1 / 120);
      }
      G.colliders.forEach((c) => (c.x -= 5000));
      G.state.mode = 'paused';
      return hp0 - e.hp;
    }, dist);
    check(res > 0, `broadside hits an enemy ${dist} units away (${res} damage)`);
  }

  // ---- Feedback: the starboard gun lights up when a pirate is in its arc, and hits pop a marker.
  const feedback = await page.evaluate(() => {
    const G = window.__game;
    const p = G.player;
    p.x = 0; p.z = 0; p.h = 0; p.speed = 0; p.reload.star = 0;
    G.colliders.forEach((c) => (c.x += 5000));
    G.enemies.forEach((o, k) => { o.x = 60 + k * 20; o.z = 60; });
    const e = G.enemies[0];
    e.x = -18; e.z = 0; e.h = 0; e.speed = 0; e.hp = e.maxHp; e.sinking = 0;
    return { inArc: G.inArc(p, e, 1), wrongSide: G.inArc(p, e, -1) };
  });
  await page.evaluate(() => { window.__game.state.mode = 'playing'; });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const gunLit = await page.evaluate(() => document.getElementById('gun-star').classList.contains('target'));
  await freeze(page);
  check(feedback.inArc && !feedback.wrongSide && gunLit, 'the starboard gun lights up when a pirate is in its firing arc');
  await page.evaluate(() => {
    const G = window.__game;
    const p = G.player;
    const e = G.enemies[0];
    G.state.mode = 'playing';
    G.playerFire(1);
    for (let i = 0; i < 240; i++) { e.x = -18; e.z = 0; e.speed = 0; p.speed = 0; p.x = 0; p.z = 0; G.step(1 / 120); }
    G.colliders.forEach((c) => (c.x -= 5000));
    G.state.mode = 'paused';
  });
  const mark = await page.evaluate(() => ({ text: document.getElementById('hitmark').textContent, cls: document.getElementById('hitmark').className }));
  check(/HIT|SUNK/.test(mark.text) && /pop/.test(mark.cls) && /right/.test(mark.cls), `a hit pops a marker on the firing side ("${mark.text}", ${mark.cls})`);

  // ---- Sinking drops gold; collecting it adds to the total.
  const loot = await page.evaluate(() => {
    const G = window.__game;
    const e = G.enemies[0];
    const gold0 = G.state.gold;
    G.damage(e, 9999);
    const coins = G.coins.length;
    G.player.x = e.x; G.player.z = e.z;
    G.state.mode = 'playing';
    for (let i = 0; i < 240; i++) G.step(1 / 120);
    G.state.mode = 'paused';
    return { coins, gained: G.state.gold - gold0, expected: G.SHIP_TYPES[e.typeName].gold * 10 };
  });
  check(loot.coins > 0 && loot.gained === loot.expected, `sunk ship drops ${loot.coins} coins worth ${loot.gained} gold`);

  // ---- Waves: sinking the first wave brings the second.
  await sinkAll(page);
  await simulate(page, 0.5);
  const wave2 = await page.evaluate(() => ({ wave: window.__game.state.wave, ships: window.__game.enemies.filter((e) => e.hp > 0).map((e) => e.typeName) }));
  check(wave2.wave === 1 && wave2.ships.includes('privateer'), `second wave sails in (${wave2.ships})`);
  await sinkAll(page);
  await page.evaluate(() => {
    const G = window.__game;
    G.state.mode = 'playing';
    for (let i = 0; i < 12; i++) G.step(1 / 120); // let the clear timer start
    G.damage(G.player, 9999); // a late enemy shot
    G.state.mode = 'paused';
  });
  check((await g(page, 'player.hp')) > 0, 'a late shot cannot sink you once the level is won');
  check((await simulate(page, 8)) === 'levelDone', 'sinking the last wave clears the level');
  check(await page.isVisible('#level-screen'), 'level-cleared screen is shown');
  check(/Bali/.test(await page.textContent('#next-btn')), 'next button names the next destination');
  await page.screenshot({ path: path.join(OUT, '3-level-cleared.png') });
  check(Number(await page.evaluate(() => localStorage.getItem('pirates-ahoy-unlocked'))) === 2, 'level 2 is unlocked and saved');

  // ---- Level 2: Bali.
  await page.keyboard.press('Enter');
  const l2 = await page.evaluate(() => ({ level: window.__game.state.level, name: window.__game.LEVELS[1].env.meta.name, enemies: window.__game.enemies.map((e) => e.typeName), reefs: window.__game.reefs.length, hp: window.__game.player.hp }));
  check(l2.level === 2 && /Bali/i.test(l2.name), `Enter sails to level 2 (${l2.name})`);
  check(l2.enemies.join() === 'prahu,prahu,prahu', `Bali opens with prahu raiders (${l2.enemies})`);
  check(l2.reefs > 0, `Bali has coral reefs (${l2.reefs})`);
  check(l2.hp === 120, 'hull is repaired between levels');
  await page.waitForFunction(() => window.__game.state.intro === 0, null, { timeout: 120000 });
  await page.screenshot({ path: path.join(OUT, '4-bali.png') });

  // Reefs slow deep hulls but not the shallow-draft prahus.
  await freeze(page);
  const reef = await page.evaluate(() => {
    const G = window.__game;
    const r = G.reefs[0];
    const p = G.player;
    const e = G.enemies[0];
    G.enemies.slice(1).forEach((o) => { o.x = 300; o.z = 300; });
    G.colliders.forEach((c) => (c.x += 5000));
    G.state.mode = 'playing';
    G.state.sail = 3;
    let pMax = 0, eMax = 0;
    for (let i = 0; i < 120 * 3; i++) {
      p.x = r.x; p.z = r.z; e.x = r.x + 2; e.z = r.z + 2;
      G.step(1 / 120);
      pMax = Math.max(pMax, p.speed);
      eMax = Math.max(eMax, e.speed);
    }
    G.colliders.forEach((c) => (c.x -= 5000));
    G.state.mode = 'paused';
    return { pMax, eMax, cap: G.SHIP_TYPES.player.maxSpeed };
  });
  check(reef.pMax < reef.cap * 0.6, `reef slows the Sea Biscuit (top speed ${reef.pMax.toFixed(1)} of ${reef.cap})`);
  check(reef.eMax > reef.pMax + 1, `prahus skim over reefs (${reef.eMax.toFixed(1)})`);

  // ---- Pause.
  await page.evaluate(() => { window.__game.state.mode = 'playing'; });
  await page.keyboard.press('p');
  check((await g(page, 'state.mode')) === 'paused' && (await page.isVisible('#pause-screen')), 'P pauses');
  const pz = await g(page, 'player.z');
  await sleep(300);
  check((await g(page, 'player.z')) === pz, 'world is frozen while paused');
  await page.keyboard.press('Escape');
  check((await g(page, 'state.mode')) === 'playing', 'Escape resumes');
  await page.keyboard.down('p');
  await page.evaluate(() => {
    // Simulate key auto-repeat while P is held.
    for (let i = 0; i < 5; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', repeat: true }));
  });
  await page.keyboard.up('p');
  check((await g(page, 'state.mode')) === 'paused', 'holding P pauses once instead of flickering');
  await page.keyboard.press('p');
  const muted0 = await page.evaluate(() => window.__game.audio.muted);
  await page.keyboard.press('m');
  const muted1 = await page.evaluate(() => ({ m: window.__game.audio.muted, stored: localStorage.getItem('pirates-ahoy-muted'), btn: document.getElementById('mute-btn').classList.contains('muted') }));
  check(muted1.m === !muted0 && muted1.btn, `M toggles sound and the mute button (${JSON.stringify(muted1)})`);
  await page.keyboard.press('m');
  check(await page.evaluate(() => { try { const G = window.__game; for (const n of ['cannon', 'splash', 'hit', 'coin', 'bombBoom']) G.audio.play(n, { distance: 10, pan: 0.5 }); G.audio.play('bombWhistle').stop(); return true; } catch (e) { return String(e); } }), 'sound effects play without errors');
  await page.click('#pause-btn');
  await page.click('#resume-btn');
  await page.keyboard.press('Space');
  check((await g(page, 'state.mode')) === 'playing', 'Space after Resume fires instead of toggling pause');

  // ---- Enemy AI shoots back.
  await freeze(page);
  const aiHit = await page.evaluate(() => {
    const G = window.__game;
    const p = G.player;
    p.x = 0; p.z = 0; p.h = 0; p.speed = 0; p.hp = p.maxHp;
    G.colliders.forEach((c) => (c.x += 5000));
    G.reefs.forEach((r) => (r.x += 5000));
    G.enemies.forEach((e, k) => { e.x = 300 + k * 20; e.z = 0; });
    const e = G.enemies[0];
    e.x = 18; e.z = 0; e.h = 0; e.speed = 0;
    G.state.mode = 'playing';
    G.state.intro = 0;
    G.state.combatTime = 10; // past the start-of-level grace period
    for (let i = 0; i < 120 * 12 && p.hp === p.maxHp; i++) G.step(1 / 120);
    G.colliders.forEach((c) => (c.x -= 5000));
    G.reefs.forEach((r) => (r.x -= 5000));
    G.state.mode = 'paused';
    return p.maxHp - p.hp;
  });
  check(aiHit > 0, `enemy AI brings its guns to bear and hits (${aiHit} damage)`);

  // ---- Death and retry.
  const goldAtStart = await g(page, 'state.goldAtLevelStart');
  await page.evaluate(() => {
    window.__game.state.gold += 123;
    window.__game.damage(window.__game.player, 9999);
  });
  check((await simulate(page, 4)) === 'over', 'sinking ends in the shipwrecked screen');
  check(await page.isVisible('#over-screen'), 'game-over screen shown');
  await page.keyboard.press('Enter');
  check((await g(page, 'state.level')) === 2 && (await g(page, 'state.mode')) === 'playing', 'Enter retries the same level');
  check((await g(page, 'state.intro')) === 0, 'retrying skips the camera fly-in');
  check((await g(page, 'state.gold')) === goldAtStart, 'retry restores gold from the start of the level');

  // ---- Level 3: the volcano, lava bombs and the boss.
  await page.evaluate(() => window.__game.startLevel(3));
  const l3 = await page.evaluate(() => ({ name: window.__game.LEVELS[2].env.meta.name, volcano: window.__game.env.volcano, enemies: window.__game.enemies.map((e) => e.typeName) }));
  check(/Volcano/i.test(l3.name) && l3.volcano && l3.volcano.craterY > 10, `level 3 is the volcano (${l3.name}, crater at ${l3.volcano && Math.round(l3.volcano.craterY)})`);
  check(!l3.enemies.includes('inferno'), `the boss waits for the second wave (${l3.enemies})`);
  await waitSim(page, 1.2);
  await page.screenshot({ path: path.join(OUT, '5a-volcano-intro.png') });
  await page.waitForFunction(() => window.__game.state.intro === 0, null, { timeout: 120000 });
  await page.screenshot({ path: path.join(OUT, '5-volcano.png') });

  await freeze(page);
  const bomb = await page.evaluate(() => {
    const G = window.__game;
    const p = G.player;
    p.speed = 0; p.hp = p.maxHp;
    G.state.sail = 0; // hold still under the bomb
    G.enemies.forEach((e) => { e.x = 300; e.z = 300; });
    G.launchBomb();
    const b = G.bombs[0];
    b.tx = p.x; b.tz = p.z; // a direct hit
    G.state.mode = 'playing';
    G.state.nextBomb = Infinity;
    for (let i = 0; i < 120 * 4 && G.bombs.length; i++) G.step(1 / 120);
    G.state.mode = 'paused';
    return { launched: !!b, dmg: p.maxHp - p.hp, left: G.bombs.length };
  });
  check(bomb.launched && bomb.dmg > 0 && bomb.left === 0, `lava bombs fly from the volcano and hurt (${bomb.dmg} damage)`);

  const hpBeforeWave2 = await page.evaluate(() => {
    const G = window.__game;
    G.player.hp = 50;
    G.enemies.forEach((e) => G.damage(e, 9999));
    return G.player.hp;
  });
  await simulate(page, 0.5);
  const repaired = await g(page, 'player.hp');
  check(repaired > hpBeforeWave2 + 30, `the crew patches the hull when reinforcements arrive (${hpBeforeWave2} -> ${Math.round(repaired)})`);
  const boss = await page.evaluate(() => window.__game.enemies.filter((e) => e.hp > 0).map((e) => e.typeName));
  check(boss.includes('inferno'), `The Molten Maw arrives with the second wave (${boss})`);
  await page.evaluate(() => {
    const G = window.__game;
    const b = G.enemies.find((e) => e.typeName === 'inferno');
    G.player.x = b.x - 30; G.player.z = b.z; G.player.h = Math.PI / 2;
    G.state.mode = 'playing';
  });
  await page.waitForSelector('#boss', { state: 'visible', timeout: 60000 }).catch(() => {});
  check(await page.isVisible('#boss'), 'boss health bar is shown');
  await page.screenshot({ path: path.join(OUT, '6-boss.png') });
  await freeze(page);
  await sinkAll(page);
  check((await simulate(page, 8)) === 'won', 'sinking the boss fleet wins the game');
  check(await page.isVisible('#won-screen'), 'victory screen shown');
  const best = await page.evaluate(() => Number(localStorage.getItem('pirates-ahoy-best')));
  check(best > 0 && best === (await g(page, 'state.gold')), `best plunder saved (${best})`);

  // ---- Level layouts are sane.
  const layouts = await page.evaluate(() => {
    const G = window.__game;
    const out = [];
    for (let n = 1; n <= G.LEVELS.length; n++) {
      G.startLevel(n);
      const env = G.env;
      const hull = (s) => s.type.wid * 0.5 + 0.4;
      const ships = [G.player, ...G.enemies];
      const blocked = ships.filter((s) => G.colliders.some((c) => Math.hypot(c.x - s.x, c.z - s.z) < c.r + hull(s))).length;
      const outside = env.enemySpawns.filter((s) => Math.hypot(s.x, s.z) > env.worldRadius).length;
      const spawnsInLand = env.enemySpawns.filter((s) => G.colliders.some((c) => Math.hypot(c.x - s.x, c.z - s.z) < c.r + 4)).length;
      const minEnemyDist = Math.min(...G.enemies.map((e) => Math.hypot(e.x - G.player.x, e.z - G.player.z)));
      out.push({ n, spawns: env.enemySpawns.length, blocked, outside, spawnsInLand, minEnemyDist: Math.round(minEnemyDist), worldRadius: env.worldRadius });
    }
    G.togglePause();
    return out;
  });
  check(layouts.every((l) => l.spawns >= 6 && l.blocked === 0 && l.outside === 0 && l.spawnsInLand === 0 && l.minEnemyDist > 35),
    `all levels spawn in open water ${JSON.stringify(layouts)}`);

  // Draw calls stay reasonable on every level.
  const calls = [];
  for (let n = 1; n <= 3; n++) {
    await page.evaluate((n) => { window.__game.startLevel(n); }, n);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    calls.push(await page.evaluate(() => window.__game.renderInfo.calls));
  }
  check(calls.every((c) => c > 0 && c < 1600), `draw calls per frame are reasonable (${calls.join(', ')})`);
  await freeze(page);

  // ---- A bot captain plays every level with simulated controls.
  const bot = await page.evaluate(() => {
    const G = window.__game;
    const wrap = (a) => ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
    const results = [];
    for (let n = 1; n <= G.LEVELS.length; n++) {
      G.startLevel(n);
      G.togglePause();
      G.state.mode = 'playing';
      let t = 0, damageTaken = 0, stuck = 0, lastHp = G.player.hp;
      while (G.state.mode === 'playing' && t < 900) {
        const p = G.player;
        const live = G.enemies.filter((e) => e.hp > 0);
        G.input.left = G.input.right = false;
        if (!p.sinking) {
          let desired = p.h;
          let sail = 2;
          if (live.length) {
            live.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
            const e = live[0];
            const r = G.relative(p, e.x, e.z);
            const toE = Math.atan2(e.x - p.x, e.z - p.z);
            if (r.dist > 24) desired = toE;
            else {
              const a1 = toE + Math.PI / 2, a2 = toE - Math.PI / 2;
              desired = Math.abs(wrap(a1 - p.h)) < Math.abs(wrap(a2 - p.h)) ? a1 : a2;
            }
            sail = r.dist > 30 ? 3 : 2;
          }
          // Dodge lava bombs aimed near us.
          for (const b of G.bombs) {
            const rb = G.relative(p, b.tx, b.tz);
            if (rb.dist < 11) { desired = Math.atan2(p.x - b.tx, p.z - b.tz); sail = 3; }
          }
          // Steer around land and reefs.
          for (const o of [...G.colliders, ...G.reefs]) {
            const ri = G.relative(p, o.x, o.z);
            if (ri.along > -2 && ri.along < 22 && Math.abs(ri.lat) < o.r + 6) desired = p.h + (ri.lat > 0 ? 1.3 : -1.3);
          }
          if (Math.hypot(p.x, p.z) > G.env.worldRadius - 15) desired = Math.atan2(-p.x, -p.z);
          const diff = wrap(desired - p.h);
          if (diff > 0.05) G.input.left = true;
          else if (diff < -0.05) G.input.right = true;
          G.state.sail = sail;
          for (const e2 of live) {
            const r2 = G.relative(p, e2.x, e2.z);
            if (r2.dist < 32 && Math.abs(r2.along) < Math.abs(r2.lat) * 0.5) G.playerFire(Math.sign(r2.lat));
          }
          for (const c of G.colliders) if (Math.hypot(c.x - p.x, c.z - p.z) < c.r) stuck++;
        }
        for (let k = 0; k < 6 && G.state.mode === 'playing'; k++) {
          G.step(1 / 120);
          if (G.player.hp < lastHp) damageTaken += lastHp - G.player.hp;
          lastHp = G.player.hp;
        }
        t += 6 / 120;
      }
      results.push({ level: n, hurtBy: JSON.stringify(G.state.hurtBy), result: G.state.mode, time: Math.round(t), hpLeft: Math.round(G.player.hp), damageTaken: Math.round(damageTaken), stuck, left: G.enemies.filter((e) => e.hp > 0).map((e) => e.typeName).join(' ') });
      if (G.state.mode === 'playing') G.state.mode = 'paused';
    }
    return results;
  });
  for (const r of bot) console.log('      bot:', JSON.stringify(r));
  check(bot.every((r) => r.result === 'levelDone' || r.result === 'won'), 'bot captain clears every level');
  check(bot.every((r) => r.damageTaken > 0), 'every level fights back');
  check(bot[2].damageTaken > bot[0].damageTaken, 'the volcano is harder than the coast of Europe');
  check(bot.every((r) => r.stuck === 0), 'player never ends up inside land');

  // ---- Main menu again; mobile touch controls.
  await page.evaluate(() => window.__game.showMenu());
  const unlockedCards = await page.$$eval('.level-card', (els) => els.filter((e) => !e.disabled).length);
  check(unlockedCards === 3, 'all levels unlocked on the menu after winning');
  // Keyboard users: Enter on a focused level card starts that level (not the default level 1).
  await page.focus('.level-card.lvl-3');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.state.mode === 'playing', null, { timeout: 60000 }).catch(() => {});
  check((await g(page, 'state.level')) === 3, 'Enter on a focused level card starts that level');
  await page.evaluate(() => window.__game.showMenu());
  check(!(await page.isVisible('#touch')), 'desktop: touch controls hidden');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  watch(mobile);
  await mobile.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await mobile.waitForFunction(() => window.__game && window.__game.env, null, { timeout: 120000 });
  await mobile.tap('#start-btn');
  check((await g(mobile, 'state.mode')) === 'playing', 'mobile: tap Set sail starts');
  check(await mobile.isVisible('#touch'), 'mobile: touch controls are shown');
  await mobile.tap('[data-tap="sailUp"]');
  check((await g(mobile, 'state.sail')) === 2, 'mobile: + raises sails');
  await mobile.tap('[data-tap="fireStar"]');
  check((await g(mobile, 'player.reload.star')) > 0, 'mobile: fire button fires');
  const mh = await g(mobile, 'player.h');
  await mobile.evaluate(() => document.querySelector('[data-hold="left"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })));
  await waitSim(mobile, (await simTime(mobile)) + 0.5);
  await mobile.evaluate(() => document.querySelector('[data-hold="left"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' })));
  const mh2 = await g(mobile, 'player.h');
  const mTurn = ((((mh2 - mh + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  check(mTurn > 0.05 && !(await g(mobile, 'input.left')), `mobile: holding the turn button steers (${mTurn.toFixed(2)} rad)`);
  await sleep(1500);
  await mobile.screenshot({ path: path.join(OUT, '7-mobile.png') });

  await page.setViewportSize({ width: 800, height: 900 });
  await page.waitForFunction(() => window.innerWidth === 800, null, { timeout: 60000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const resized = await page.evaluate(() => ({ w: document.getElementById('game').width, pr: window.__game.quality.pixelRatio }));
  check(resized.w === Math.round(800 * resized.pr), `canvas resizes with the window (${resized.w}px at pixel ratio ${resized.pr.toFixed(2)})`);

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
