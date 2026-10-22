// Balance suite (SPEC3 §5.9, §13.2; opt-in: `npm run test:balance`, not part of `npm test`): Voyages I and II are not
// flattened by the Kraken Seas' new toys. The Act I bot (smoke.cjs's captain) and the Act II bot (levels.cjs's bot v2,
// a mid-game ship) sail again with every recipe owned and the Powder Windmill at tier 3 (7 loads of each special shot
// at every level start), firing special shot (Stink before a boarding, Frost on a fleeing galleon, Fire instead of
// round shot on the rest), served with ?kraken=1 until Voyage III sails for everyone. Each level is still cleared and
// fights back, the ship never ends up inside land, and the order of each voyage holds: the Volcano hurts more than
// the Coast of Europe, the Maelstrom more than Doubloon Bay, by the median damage taken over BALANCE_RUNS runs of each
// level (default 5: aim spread and the volcano's lava scatter roll Math.random, so single runs scatter; the bots get a
// second try at a level, as a player would).
// Run with `node tests/balance.cjs` (BALANCE_ONLY=act1,act2 runs one bot; BALANCE_RUNS=n; BALANCE_ROOT serves another
// copy of the game).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('./server.cjs');

const ROOT = process.env.BALANCE_ROOT || path.join(__dirname, '..');
const ONLY = (process.env.BALANCE_ONLY || '').split(',').filter(Boolean);
const QUERY = '?quality=low&kraken=1';
const BROWSER_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

let failures = 0;
let passes = 0;
function check(cond, msg) {
  console.log(`${cond === true ? 'PASS' : 'FAIL'}  ${msg}`);
  if (cond === true) passes++;
  else failures++;
}
const J = (v) => JSON.stringify(v);

// ---------------------------------------------------------------------------------------------------------
// The Act I bot (smoke.cjs's captain, the stock ship) with special shot. Runs INSIDE the page:
// page.evaluate(botAct1, { n, SPECIAL }). It sails at the nearest pirate, turns side-on within 24 u, fires whichever
// side has her abeam, dodges lava and steers round land; with special shot it loads Stink on a pirate within 20 u
// that isn't stinky yet, else Fire on one that isn't burning (never on the Molten Maw, who laughs at it), else round.
// ---------------------------------------------------------------------------------------------------------
function botAct1(args) {
  const { n, maxT = 900, SPECIAL = {} } = args;
  const G = window.__game;
  const S = G.combat.rules;
  const wrap = (a) => ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  G.specials.setPowder({ v: 1, own: { fire: 1, frost: 1, stink: 1 } });
  G.island.set({ v: 1, t: { windmill: 3 } });
  G.state.tutorialDone = true;
  G.startLevel(n);
  if (G.state.mode === 'playing') G.togglePause();
  G.state.mode = 'playing';
  const loads = G.specials.loads;
  let t = 0;
  let damageTaken = 0;
  let stuck = 0;
  let lastHp = G.player.hp;
  while (G.state.mode === 'playing' && t < maxT) {
    const p = G.player;
    const live = G.enemies.filter((e) => e.hp > 0);
    G.input.left = G.input.right = false;
    if (!p.sinking) {
      let desired = p.h;
      let sail = 2;
      let ammo = 'round';
      if (live.length) {
        live.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
        const e = live[0];
        const r = G.relative(p, e.x, e.z);
        const toE = Math.atan2(e.x - p.x, e.z - p.z);
        if (r.dist > 24) desired = toE;
        else {
          const a1 = toE + Math.PI / 2;
          const a2 = toE - Math.PI / 2;
          desired = Math.abs(wrap(a1 - p.h)) < Math.abs(wrap(a2 - p.h)) ? a1 : a2;
        }
        sail = r.dist > 30 ? 3 : 2;
        const L = G.specials.loads;
        const st = e.status && e.status.id;
        if (L.stink > 0 && st !== 'stink' && st !== 'fire' && r.dist < 20 && !(e.status && e.status.immune > 0)) ammo = 'stink';
        else if (L.fire > 0 && st !== 'fire' && e.typeName !== 'inferno' && r.dist < 28) ammo = 'fire';
      }
      if (G.state.ammo !== ammo) G.combat.setAmmo(ammo);
      // Dodge lava bombs aimed near us.
      for (const b of G.bombs) {
        const rb = G.relative(p, b.tx, b.tz);
        if (rb.dist < 11) {
          desired = Math.atan2(p.x - b.tx, p.z - b.tz);
          sail = 3;
        }
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
      const range = (S.AMMO[G.state.ammo] || SPECIAL[G.state.ammo] || S.AMMO.round).range;
      for (const e2 of live) {
        const r2 = G.relative(p, e2.x, e2.z);
        if (r2.dist < Math.min(32, range + 2) && Math.abs(r2.along) < Math.abs(r2.lat) * 0.5) G.playerFire(Math.sign(r2.lat));
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
  G.input.left = G.input.right = false;
  const left = G.specials.loads;
  const out = {
    level: n,
    result: G.state.mode === 'playing' ? 'timeout' : G.state.mode,
    time: Math.round(t),
    damageTaken: Math.round(damageTaken),
    hpLeft: Math.round(G.player.hp),
    stuck,
    loads,
    spent: { fire: loads.fire - left.fire, frost: loads.frost - left.frost, stink: loads.stink - left.stink },
    hurtBy: JSON.stringify(G.state.hurtBy),
    left: G.enemies.filter((e) => e.hp > 0).map((e) => e.typeName).join(' '),
  };
  if (G.state.mode === 'playing') G.state.mode = 'paused';
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// The Act II bot: tests/levels.cjs's bot v2 (SPEC2 §11.3, agent 3B's reference implementation), copied as it is but
// for the special shot it loads (marked "Special shot") and the range it reads for one. page.evaluate(botLevel,
// { n, profile, maxT, specials, SPECIAL }).
// ---------------------------------------------------------------------------------------------------------
function botLevel(args) {
  const { n, profile = 'mid', maxT = 900, specials = true, SPECIAL = {} } = args;
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
  // Every recipe owned and the Powder Windmill at tier 3: 7 loads of each special shot at every level start.
  if (specials) {
    G.specials.setPowder({ v: 1, own: { fire: 1, frost: 1, stink: 1 } });
    G.island.set({ v: 1, t: { windmill: 3 } });
  } else G.specials.setPowder({ v: 1, own: { fire: 0, frost: 0, stink: 0 } });
  G.state.unlocked = Math.max(G.state.unlocked, G.LEVELS.length);
  G.state.tutorialDone = true;
  G.startLevel(n);
  if (G.state.mode === 'playing') G.togglePause();
  G.state.mode = 'playing';
  const S = G.combat.rules;
  const stats = { level: n, profile, loads: null, spent: null, result: null, time: 0, damageTaken: 0, hpLeft: 0, captures: 0, sunk: 0, boardings: 0, raids: 0, cuts: 0, counters: 0, takes: 0, stuck: 0, minVortex: Infinity, escaped: 0, taken: 0, hurtBy: null, left: '' };
  let t = 0;
  let lastHp = G.player.hp;
  let wasActive = false;
  let tick = 0;
  let cutPresses = 0;
  const orbit = { target: null, hp: 0, crew: Infinity, hitAt: 0, flipUntil: -1 };
  const notchOf = (e) => e.strikeAt ?? S.strikeAt(e.crew0);
  const crewOf = (e) => G.combat.crewOf(e);
  stats.loads = G.specials.loads;
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
        // Special shot (bot v3's picks for Voyages I and II): Stink before a boarding (the odds get better), Frost on a
        // fleeing galleon, Fire instead of round shot on anything not to be boarded (a burning ship can't be), never
        // on the Molten Maw (immune) or the Phantom (her ghosts).
        if (specials && !target.surrendered) {
          const L = G.specials.loads;
          const st = target.status && target.status.id;
          if (wantBoard && L.stink > 0 && st !== 'stink' && !(target.status && target.status.immune > 0) && !target.type.ghost && r.dist < 20) ammo = 'stink';
          else if (!wantBoard && fleeing && L.frost > 0 && st !== 'frost' && r.dist < 26) ammo = 'frost';
          else if (!wantBoard && !fleeing && ammo === 'round' && L.fire > 0 && st !== 'fire' && target.typeName !== 'inferno' && !target.type.ghost && r.dist < 28) ammo = 'fire';
        }
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
      const range = (S.AMMO[G.state.ammo] || SPECIAL[G.state.ammo] || S.AMMO.round).range;
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
  const left = G.specials.loads;
  stats.spent = { fire: stats.loads.fire - left.fire, frost: stats.loads.frost - left.frost, stink: stats.loads.stink - left.stink };
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
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ args: BROWSER_ARGS });
  const errors = [];
  async function open(label) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('pirates-ahoy-unlocked', '6');
        localStorage.setItem('pirates-ahoy-tutorial-done', '1');
        localStorage.setItem('pirates-ahoy-tips', '65535');
        localStorage.setItem('pirates-ahoy-powder', '{"v":1,"own":{"fire":1,"frost":1,"stink":1}}');
      } catch {
        // storage blocked
      }
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text()) && errors.push(`${label}: ${m.text()}`));
    await page.goto(base + QUERY, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__gameReady === true && window.__game && window.__game.env, null, { timeout: 120000 });
    const SPECIAL = await page.evaluate(async () => JSON.parse(JSON.stringify((await import('/src/specials.js')).SPECIAL)));
    return { ctx, page, SPECIAL };
  }
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
  const won = (r) => r.result === 'levelDone' || r.result === 'won';
  const spentAny = (r) => r.spent.fire + r.spent.frost + r.spent.stink > 0;
  async function play(page, fn, args) {
    let r = null;
    const tries = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
      r = await page.evaluate(fn, args);
      tries.push(r.result === 'timeout' ? `timeout(${r.left})` : r.result);
      if (won(r)) break;
    }
    r.tries = tries.join('>');
    console.log('      bot:', J(r));
    return r;
  }

  const median = (xs) => {
    const a = xs.slice().sort((x, y) => x - y);
    return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
  };
  // Each level sailed RUNS times (BALANCE_RUNS, default 5): every run must clear it (a second try allowed), and the
  // order compares the median damage taken (one run can invert it: on 6 single runs of Voyage II with specials,
  // 1 had the Maelstrom at 66 against Doubloon Bay's 76; their medians were 127 and 66).
  const RUNS = Math.max(1, Math.floor(Number(process.env.BALANCE_RUNS) || 5));
  async function voyage(tag, levels, fn, args, { easy, hard, limit = Infinity }) {
    const { ctx, page, SPECIAL } = await open(tag);
    const runs = levels.map(() => []);
    for (let k = 0; k < RUNS; k++) for (let i = 0; i < levels.length; i++) runs[i].push(await play(page, fn, { ...args, n: levels[i], SPECIAL }));
    const all = runs.flat();
    const dmg = runs.map((rs) => rs.map((r) => r.damageTaken));
    const med = dmg.map(median);
    const L = (i) => `L${levels[i]}`;
    console.log(`      ${tag}: damage taken by level ${dmg.map((d, i) => `${L(i)} [${d.join(', ')}] median ${med[i]}`).join('; ')}`);
    check(all.every((r) => J(r.loads) === '{"fire":7,"frost":7,"stink":7}'), `${tag}: with every recipe and the Powder Windmill at 3, each level starts with 7 loads of each special shot (${J([...new Set(all.map((r) => J(r.loads)))])})`);
    check(all.every((r) => won(r) && r.time <= limit), `${tag}: the bot with special shot clears ${L(0)}-${levels[levels.length - 1]} on each of ${RUNS} runs${Number.isFinite(limit) ? ` within ${limit} s` : ''}, a second try allowed (${runs.map((rs, i) => `${L(i)} ${rs.map((r) => `${r.tries} ${r.time} s`).join(', ')}`).join('; ')})`);
    check(all.every(spentAny), `${tag}: it fires special shot on every run of every level (${runs.map((rs, i) => `${L(i)} ${rs.map((r) => r.spent.fire + r.spent.frost + r.spent.stink).join('/')}`).join('; ')} loads)`);
    check(med.every((m) => m > 0), `${tag}: every level still fights back (median damage taken ${med.join(' / ')})`);
    check(med[2] > med[0], `${tag}: ${hard} still hurts more than ${easy} (median damage taken ${med[2]} > ${med[0]})`);
    check(all.every((r) => r.stuck === 0), `${tag}: the ship never ends up inside land (${all.reduce((n, r) => n + r.stuck, 0)} frames inside)`);
    await ctx.close();
  }

  // ---------------------------------------------------------------------------------------- Voyage I (Act I)
  await section('act1', () => voyage('act1', [1, 2, 3], botAct1, {}, { easy: 'the Coast of Europe', hard: 'the Volcano' }));

  // --------------------------------------------------------------------------------------- Voyage II (Act II)
  await section('act2', () => voyage('act2', [4, 5, 6], botLevel, { profile: 'mid', maxT: 900, specials: true }, { easy: 'Doubloon Bay', hard: 'the Maelstrom', limit: 900 }));

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 8).join(' | ') : ''}`);
  await browser.close();
  server.close();
  console.log(`\nbalance.cjs: ${passes} passed, ${failures} failed`);
  console.log(failures ? `${failures} check(s) failed` : 'All balance checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
