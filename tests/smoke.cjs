// End-to-end test: serves the game, drives it in headless Chromium and checks
// rendering, controls, combat, loot, level flow and that the levels are winnable.
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
const thaw = (page) => page.evaluate(() => {
  const G = window.__game;
  if (G.state.mode === 'paused') G.togglePause();
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

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const url = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/fonts\.g/.test(m.text()) && errors.push(m.text()));

  await page.goto(url);
  await page.waitForFunction(() => window.__game);
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, '1-menu.png') });
  check(await page.isVisible('#menu-screen'), 'title screen is shown');
  check((await g(page, 'state.mode')) === 'menu', 'game starts in menu mode');

  // Pixel look: the drawing buffer is a third of the window size.
  const size = await page.evaluate(() => [document.getElementById('game').width, document.getElementById('game').height]);
  check(size[0] === Math.ceil(1280 / 3) && size[1] === Math.ceil(720 / 3), `renders at low resolution for the pixel look (${size})`);

  // Something is actually drawn (analyse a real screenshot, WebGL clears its buffer).
  const shot = (await page.screenshot()).toString('base64');
  const colours = await page.evaluate(async (b64) => {
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
  check(colours > 20, `scene renders with varied colours (${colours} colour buckets)`);

  // ---- Start level 1.
  await page.click('#start-btn');
  check((await g(page, 'state.mode')) === 'playing', 'clicking Set sail starts the game');
  check((await g(page, 'state.level')) === 1, 'starts at level 1');
  check((await g(page, 'enemies.length')) === 2, 'level 1 has 2 enemy ships');
  check((await g(page, 'islands.length')) >= 6, 'islands are placed');
  check(await page.isVisible('.hud-top'), 'HUD is visible');
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, '2-level-start.png') });

  // Nothing spawns inside an island.
  const overlapsIsland = await page.evaluate(() => {
    const G = window.__game;
    const ships = [G.player, ...G.enemies];
    return ships.filter((s) => G.islands.some((i) => Math.hypot(i.x - s.x, i.z - s.z) < i.r * 1.15)).length;
  });
  check(overlapsIsland === 0, 'no ship spawns inside an island');

  // ---- Sails.
  await page.keyboard.press('w');
  await page.keyboard.press('w');
  await page.keyboard.press('w');
  check((await g(page, 'state.sail')) === 3, 'W raises sails and clamps at full');
  await page.keyboard.press('s');
  check((await g(page, 'state.sail')) === 2, 'S lowers sails');
  const z0 = await g(page, 'player.z');
  await sleep(800);
  check((await g(page, 'player.z')) > z0 + 1, 'ship sails forward');

  // ---- Steering: A turns left (heading increases), D turns right.
  let h0 = await g(page, 'player.h');
  await page.keyboard.down('a');
  await sleep(400);
  await page.keyboard.up('a');
  const h1 = await g(page, 'player.h');
  check(h1 > h0 + 0.1, `A turns to port (${h0.toFixed(2)} -> ${h1.toFixed(2)})`);
  await page.keyboard.down('ArrowRight');
  await sleep(400);
  await page.keyboard.up('ArrowRight');
  check((await g(page, 'player.h')) < h1 - 0.1, 'ArrowRight turns to starboard');
  check((await g(page, 'input.left')) === false && (await g(page, 'input.right')) === false, 'releasing keys stops turning');

  // Turning left must actually move the ship to the left of the screen:
  // port side is world +x when heading 0, which is screen-left for the chase camera.
  const sideCheck = await page.evaluate(() => {
    const G = window.__game;
    const p = G.player;
    p.h = 0;
    const r = G.relative(p, p.x + 5, p.z);
    return r.lat;
  });
  check(sideCheck < 0, 'world +x counts as port (left) at heading 0');

  // ---- Firing and reloading.
  await freeze(page);
  const fired = await page.evaluate(() => {
    const G = window.__game;
    G.state.mode = 'playing';
    const before = G.balls.length;
    const ok1 = G.playerFire(-1);
    const after1 = G.balls.length;
    const ok2 = G.playerFire(-1); // still reloading
    const ok3 = G.playerFire(1); // other side is loaded
    G.state.mode = 'paused';
    return { ok1, ok2, ok3, added: after1 - before, guns: G.SHIP_TYPES.player.guns };
  });
  check(fired.ok1 && fired.added === fired.guns, `port broadside fires ${fired.added} balls`);
  check(!fired.ok2, 'cannot fire the same side while reloading');
  check(fired.ok3, 'the other side fires independently');
  await simulate(page, 2);
  check((await g(page, 'balls.length')) === 0, 'cannonballs splash down and are removed');
  check((await g(page, 'player.reload.port')) === 0, 'guns reload');

  // ---- Hitting an enemy with auto-ranging guns at several distances.
  for (const dist of [10, 18, 26, 32]) {
    const res = await page.evaluate((dist) => {
      const G = window.__game;
      const p = G.player;
      const e = G.enemies[0];
      p.x = 0; p.z = 0; p.h = 0; p.speed = 0;
      p.reload.star = 0;
      G.islands.forEach((i) => (i.x += 1000)); // nothing in the way
      G.enemies.forEach((o, k) => { o.x = 300 + k * 20; o.z = 0; }); // only one target in range
      e.x = -dist; e.z = 0; e.h = 0; e.speed = 0; e.hp = e.maxHp; e.sinking = 0;
      const hp0 = e.hp;
      G.state.mode = 'playing';
      G.playerFire(1); // starboard = -x at heading 0
      // Hold both ships still while the balls fly.
      for (let i = 0; i < 240; i++) {
        e.x = -dist; e.z = 0; e.speed = 0; p.speed = 0; p.x = 0; p.z = 0;
        G.step(1 / 120);
      }
      G.islands.forEach((i) => (i.x -= 1000));
      G.state.mode = 'paused';
      return hp0 - e.hp;
    }, dist);
    check(res > 0, `starboard broadside hits an enemy ${dist} units away (${res} damage)`);
  }

  // ---- Sinking an enemy drops gold, collecting it adds to the total.
  const loot = await page.evaluate(() => {
    const G = window.__game;
    const e = G.enemies[0];
    const gold0 = G.state.gold;
    G.damage(e, 999);
    const coins = G.coins.length;
    // Sail over the loot.
    G.player.x = e.x; G.player.z = e.z;
    G.state.mode = 'playing';
    for (let i = 0; i < 240; i++) G.step(1 / 120);
    G.state.mode = 'paused';
    return { coins, gained: G.state.gold - gold0, left: G.coins.length, expected: G.SHIP_TYPES[e.typeName].gold * 10 };
  });
  check(loot.coins > 0, `sunk ship drops ${loot.coins} coins`);
  check(loot.gained === loot.expected && loot.left === 0, `collecting the loot adds ${loot.gained} gold`);
  await simulate(page, 4.5);
  check((await g(page, 'enemies.length')) === 1, 'sunk ship is removed after sinking');

  // ---- Clearing the level.
  await page.evaluate(() => window.__game.damage(window.__game.enemies[0], 999));
  const mode = await simulate(page, 8);
  check(mode === 'levelDone', 'sinking every ship clears the level');
  check(await page.isVisible('#level-screen'), 'level-cleared screen is shown');
  await page.screenshot({ path: path.join(OUT, '3-level-cleared.png') });
  const goldAfterL1 = await g(page, 'state.gold');
  check(goldAfterL1 >= 50, `level bonus awarded (gold ${goldAfterL1})`);

  await page.keyboard.press('Enter');
  check((await g(page, 'state.level')) === 2 && (await g(page, 'state.mode')) === 'playing', 'Enter starts level 2');
  check((await g(page, 'enemies.length')) === 3, 'level 2 has 3 ships');
  check((await g(page, 'player.hp')) === 100, 'hull is repaired between levels');
  check(!(await page.isVisible('#level-screen')), 'level screen hidden after continuing');

  // ---- Pause.
  await page.keyboard.press('p');
  check((await g(page, 'state.mode')) === 'paused' && (await page.isVisible('#pause-screen')), 'P pauses');
  const pz = await g(page, 'player.z');
  await sleep(300);
  check((await g(page, 'player.z')) === pz, 'world is frozen while paused');
  await page.keyboard.press('q');
  check((await g(page, 'balls.length')) === 0, 'cannot fire while paused');
  await page.keyboard.press('Escape');
  check((await g(page, 'state.mode')) === 'playing', 'Escape resumes');
  await page.click('#pause-btn');
  await page.click('#resume-btn');
  await page.keyboard.press('Space');
  check((await g(page, 'state.mode')) === 'playing', 'Space after Resume fires instead of toggling pause');

  // ---- Enemy AI shoots back and can sink the player.
  await freeze(page);
  const aiHit = await page.evaluate(() => {
    const G = window.__game;
    const p = G.player;
    p.x = 0; p.z = 0; p.h = 0; p.speed = 0; p.hp = 100;
    G.islands.forEach((i) => (i.x += 1000));
    G.enemies.forEach((e, k) => { e.x = 300 + k * 20; e.z = 0; }); // park the others far away
    const e = G.enemies[0];
    e.x = 18; e.z = 0; e.h = 0; e.speed = 0;
    G.state.mode = 'playing';
    G.state.time = 10; // past the start-of-level grace period
    for (let i = 0; i < 120 * 12 && p.hp === 100; i++) G.step(1 / 120);
    G.islands.forEach((i) => (i.x -= 1000));
    G.state.mode = 'paused';
    return 100 - p.hp;
  });
  check(aiHit > 0, `enemy AI turns broadside and hits the player (${aiHit} damage)`);

  const goldAtStart = await g(page, 'state.goldAtLevelStart');
  await page.evaluate(() => {
    window.__game.state.gold += 123;
    window.__game.damage(window.__game.player, 999);
  });
  const deadMode = await simulate(page, 4);
  check(deadMode === 'over', 'player sinking ends in game over');
  check(await page.isVisible('#over-screen'), 'game-over screen shown');
  await page.screenshot({ path: path.join(OUT, '4-game-over.png') });
  await page.keyboard.press('Enter');
  check((await g(page, 'state.level')) === 2 && (await g(page, 'state.mode')) === 'playing', 'Enter retries the same level');
  check((await g(page, 'state.gold')) === goldAtStart, 'retry restores gold from the start of the level');
  check((await g(page, 'enemies.length')) === 3 && (await g(page, 'player.hp')) === 100, 'retry resets ships and hull');

  // ---- Boss level layout.
  await page.evaluate(() => window.__game.startLevel(5));
  const boss = await page.evaluate(() => window.__game.enemies.map((e) => e.typeName));
  check(boss.includes('galleon'), `level 5 has the boss galleon (${boss.join(', ')})`);
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, '5-boss.png') });

  // ---- Winning the final level.
  await freeze(page);
  await page.evaluate(() => window.__game.enemies.forEach((e) => window.__game.damage(e, 9999)));
  check((await simulate(page, 8)) === 'won', 'clearing level 5 wins the game');
  check(await page.isVisible('#won-screen'), 'victory screen shown');
  const best = await page.evaluate(() => Number(localStorage.getItem('pixel-pirates-best')));
  check(best > 0 && best === (await g(page, 'state.gold')), `best plunder saved (${best})`);

  // ---- Every level spawns cleanly.
  const layouts = await page.evaluate(() => {
    const G = window.__game;
    const out = [];
    for (let n = 1; n <= G.LEVELS.length; n++) {
      G.startLevel(n);
      const ships = [G.player, ...G.enemies];
      const bad = ships.filter((s) => G.islands.some((i) => Math.hypot(i.x - s.x, i.z - s.z) < i.r * 1.15 + 2)).length;
      const minEnemyDist = Math.min(...G.enemies.map((e) => Math.hypot(e.x, e.z)));
      out.push({ n, ships: G.enemies.length, expected: G.LEVELS[n - 1].ships.length, bad, minEnemyDist: Math.round(minEnemyDist) });
    }
    G.togglePause();
    return out;
  });
  check(layouts.every((l) => l.bad === 0 && l.ships === l.expected && l.minEnemyDist > 40),
    `all 5 levels spawn correctly ${JSON.stringify(layouts.map((l) => [l.n, l.ships, l.minEnemyDist]))}`);

  // ---- A bot captain plays every level with simulated controls.
  // Proves the levels can be won, the AI fights back, and nothing gets stuck in islands.
  const bot = await page.evaluate(() => {
    const G = window.__game;
    const wrap = (a) => ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
    const results = [];
    for (let n = 1; n <= G.LEVELS.length; n++) {
      G.startLevel(n);
      G.togglePause();
      G.state.mode = 'playing';
      let t = 0;
      let damageTaken = 0;
      let stuck = 0;
      let lastHp = G.player.hp;
      while (G.state.mode === 'playing' && t < 600) {
        const p = G.player;
        const live = G.enemies.filter((e) => e.hp > 0);
        G.input.left = G.input.right = false;
        if (live.length && !p.sinking) {
          live.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
          const e = live[0];
          const r = G.relative(p, e.x, e.z);
          const toE = Math.atan2(e.x - p.x, e.z - p.z);
          let desired;
          if (r.dist > 24) desired = toE;
          else {
            const a1 = toE + Math.PI / 2, a2 = toE - Math.PI / 2;
            desired = Math.abs(wrap(a1 - p.h)) < Math.abs(wrap(a2 - p.h)) ? a1 : a2;
          }
          // Steer around islands.
          for (const i of G.islands) {
            const ri = G.relative(p, i.x, i.z);
            if (ri.along > -2 && ri.along < 20 && Math.abs(ri.lat) < i.r * 1.15 + 5) desired = p.h + (ri.lat > 0 ? 1.3 : -1.3);
          }
          if (Math.hypot(p.x, p.z) > 115) desired = Math.atan2(-p.x, -p.z);
          const diff = wrap(desired - p.h);
          if (diff > 0.05) G.input.left = true;
          else if (diff < -0.05) G.input.right = true;
          G.state.sail = r.dist > 30 ? 3 : 2;
          // Fire whichever side bears.
          for (const e2 of live) {
            const r2 = G.relative(p, e2.x, e2.z);
            if (r2.dist < 32 && Math.abs(r2.along) < Math.abs(r2.lat) * 0.5) G.playerFire(Math.sign(r2.lat));
          }
          for (const i of G.islands) if (Math.hypot(i.x - p.x, i.z - p.z) < i.r * 1.15) stuck++;
        }
        for (let k = 0; k < 6 && G.state.mode === 'playing'; k++) {
          G.step(1 / 120);
          // Count damage taken (ignoring regeneration).
          if (G.player.hp < lastHp) damageTaken += lastHp - G.player.hp;
          lastHp = G.player.hp;
        }
        t += 6 / 120;
      }
      results.push({ level: n, result: G.state.mode, enemyHpLeft: G.enemies.filter((e) => e.hp > 0).map((e) => e.typeName + ':' + Math.round(e.hp)).join(' '), time: Math.round(t), hpLeft: Math.round(G.player.hp), damageTaken: Math.round(damageTaken), stuck });
      if (G.state.mode === 'paused' || G.state.mode === 'playing') G.state.mode = 'paused';
    }
    return results;
  });
  for (const r of bot) console.log('      bot:', JSON.stringify(r));
  check(bot.every((r) => r.result === 'levelDone' || r.result === 'won'), 'bot captain clears every level');
  check(bot.some((r) => r.damageTaken > 0), 'enemies deal damage during real battles');
  check(bot.every((r) => r.stuck === 0), 'player never ends up inside an island');

  // ---- Mobile: touch controls.
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  mobile.on('pageerror', (e) => errors.push(e.message));
  await mobile.goto(url);
  await mobile.waitForFunction(() => window.__game);
  await mobile.tap('#start-btn');
  check((await g(mobile, 'state.mode')) === 'playing', 'mobile: tap Set sail starts');
  check(await mobile.isVisible('#touch'), 'mobile: touch controls are shown');
  await mobile.tap('[data-tap="sailUp"]');
  check((await g(mobile, 'state.sail')) === 2, 'mobile: + raises sails');
  await mobile.tap('[data-tap="fireStar"]');
  check((await g(mobile, 'player.reload.star')) > 0, 'mobile: fire button fires');
  const mh = await g(mobile, 'player.h');
  const box = await mobile.locator('[data-hold="left"]').boundingBox();
  await mobile.evaluate(() => {
    const b = document.querySelector('[data-hold="left"]');
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
  });
  await sleep(500);
  await mobile.evaluate(() => {
    const b = document.querySelector('[data-hold="left"]');
    b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }));
  });
  check(box && (await g(mobile, 'player.h')) > mh + 0.05 && !(await g(mobile, 'input.left')), 'mobile: holding the turn button steers');
  await sleep(600);
  await mobile.screenshot({ path: path.join(OUT, '6-mobile.png') });

  check(!(await page.isVisible('#touch')), 'desktop: touch controls hidden');

  await page.setViewportSize({ width: 800, height: 900 });
  await sleep(200);
  const resized = await page.evaluate(() => document.getElementById('game').width);
  check(resized === Math.ceil(800 / 3), 'canvas resizes with the window');

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
