import * as THREE from 'three';
import { SHIP_TYPES, gunOffset } from './shipTypes.js';
import { buildShip, animateShip, disposeShip } from './ships.js';
import { createRenderer, createOcean, createSky, createClouds, createLights, applyPalette } from './scenery.js';
import { toon, noOutline, gradientMap } from './style.js';
import * as europe from './env/europe.js';
import * as bali from './env/bali.js';
import * as volcano from './env/volcano.js';

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------
const GRAVITY = -20;
const BALL_SPEED = 30;
const BALL_Y = 1.6; // height cannonballs are fired from
const MAX_RANGE = 34;
const DEFAULT_RANGE = 24;
const MAX_TRAVERSE = 0.3; // radians the guns can swivel off the beam
const MAX_STEP = 1 / 120; // physics substep: keeps fast cannonballs from skipping through hulls
const MAX_FRAME_DT = 0.1;
const SAIL_LEVELS = [0, 0.35, 0.7, 1];
const COIN_VALUE = 10;
const REGEN_DELAY = 5; // seconds without damage before the hull repairs itself
const REGEN_RATE = 2; // hp per second
const WAIT_DIST = 50; // distance waiting pirates keep from the player
const WAVE_REPAIR = 0.35; // fraction of the hull your crew patches when reinforcements arrive
const REEF_SLOW = 0.45; // speed multiplier for deep-hulled ships on a reef
const BOMB_RADIUS = 5; // lava bomb blast radius
const BOMB_DAMAGE = 16;
const PARTICLE_CAP = 600;
const INTRO_TIME = 3.6; // seconds of the camera fly-in at the start of a level
const CHASE_BACK = 17; // chase camera: distance behind the ship
const CHASE_UP = 10; // chase camera: height
const CHASE_AHEAD = 8; // chase camera: look this far ahead of the ship
const BEST_KEY = 'pirates-ahoy-best';
const PROGRESS_KEY = 'pirates-ahoy-unlocked';

// Each level: its environment, enemy waves (the next wave sails in once
// `nextWaveAt` or fewer ships of the current one are left) and difficulty knobs.
const LEVELS = [
  {
    env: europe,
    stars: 1,
    waves: [['cutter', 'cutter'], ['privateer', 'cutter']],
    nextWaveAt: 0,
    maxAttackers: 2, // pirates allowed to attack at once
    lead: 0.3, // how well enemy gunners lead your motion (0..1)
    spreadMul: 1.5, // enemy aim error multiplier
    grace: 5, // seconds before enemies may open fire
    bonus: 100,
  },
  {
    env: bali,
    stars: 2,
    waves: [['prahu', 'prahu', 'prahu'], ['junk', 'junk', 'prahu']],
    nextWaveAt: 1,
    maxAttackers: 2,
    lead: 0.55,
    spreadMul: 1.0,
    grace: 4,
    bonus: 200,
  },
  {
    env: volcano,
    stars: 3,
    waves: [['corsair', 'corsair', 'manowar'], ['inferno', 'corsair']],
    nextWaveAt: 0,
    maxAttackers: 2,
    lead: 0.6,
    spreadMul: 1.0,
    grace: 3,
    bombs: { every: [4.5, 7.5], spread: 9 }, // lava bombs from the volcano
    bonus: 400,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wrapAngle(a) {
  return ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

// Ships face (sin h, cos h) in the xz plane; "right" is starboard.
const fwdX = (h) => Math.sin(h);
const fwdZ = (h) => Math.cos(h);
const rightX = (h) => -Math.cos(h);
const rightZ = (h) => Math.sin(h);

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const ui = {
  canvas: $('game'),
  hud: $('hud'),
  hullFill: $('hull-fill'),
  levelName: $('level-name'),
  ships: $('ships'),
  gold: $('gold'),
  reloadPort: $('reload-port'),
  reloadStar: $('reload-star'),
  sails: $('sails'),
  minimap: $('minimap'),
  boss: $('boss'),
  bossName: $('boss-name'),
  bossFill: $('boss-fill'),
  banner: $('banner'),
  menu: $('menu-screen'),
  levelCards: $('level-cards'),
  pause: $('pause-screen'),
  levelDone: $('level-screen'),
  levelTitle: $('level-title'),
  levelSummary: $('level-summary'),
  nextBtn: $('next-btn'),
  over: $('over-screen'),
  overSummary: $('over-summary'),
  won: $('won-screen'),
  wonGold: $('won-gold'),
  wonBest: $('won-best'),
  best: $('best'),
  error: $('error-screen'),
};
const mm = ui.minimap.getContext('2d');

function show(el, visible) {
  el.classList.toggle('hidden', !visible);
}

function loadNumber(key) {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function saveNumber(key, v) {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    // Storage blocked: progress just won't persist.
  }
}

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------
let view;
try {
  view = createRenderer(ui.canvas);
} catch (err) {
  show(ui.menu, false);
  show(ui.error, true);
  throw err;
}

// The outline effect renders the scene twice; count both passes per frame.
view.renderer.info.autoReset = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 900);
camera.position.set(0, 12, -20);

const ocean = createOcean(scene);
const sky = createSky(scene);
const clouds = createClouds(scene);
const lights = createLights(scene);

// Adaptive resolution: if frames are slow, render fewer pixels (the HUD stays sharp).
// ?quality=high keeps full resolution, ?quality=low starts at the lowest step.
const QUALITY_STEPS = [1, 0.85, 0.7, 0.55, 0.45];
const qualityParam = new URLSearchParams(location.search).get('quality');
const perf = {
  level: qualityParam === 'low' ? QUALITY_STEPS.length - 1 : 0,
  fixed: qualityParam === 'high' || qualityParam === 'low',
  frames: 0,
  time: 0,
  settle: 2,
};

function resize() {
  view.setSize(window.innerWidth, window.innerHeight);
  const q = QUALITY_STEPS[perf.level];
  if (q < 1) {
    view.renderer.setPixelRatio(view.renderer.getPixelRatio() * q);
    view.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

// Called every frame with the real (unclamped) frame time.
function trackPerformance(rawDt) {
  if (perf.fixed || document.hidden || state.mode === 'paused') return;
  if (perf.settle > 0) {
    perf.settle -= rawDt; // ignore shader compiles and level loads
    return;
  }
  perf.frames++;
  perf.time += rawDt;
  if (perf.time < 2 || perf.frames < 20) return;
  const avg = perf.time / perf.frames;
  if (avg > 1 / 38 && perf.level < QUALITY_STEPS.length - 1) {
    perf.level++;
    resize();
  } else if (avg < 1 / 75 && perf.level > 0 && perf.time > 5) {
    perf.level--;
    resize();
  } else if (perf.time < 5) {
    return; // keep collecting before deciding to step back up
  }
  perf.frames = 0;
  perf.time = 0;
  perf.settle = 0.5;
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const state = {
  mode: 'menu', // menu | playing | paused | levelDone | over | won
  level: 1,
  wave: 0,
  gold: 0,
  goldAtLevelStart: 0,
  sunk: 0, // ships sunk this level
  best: loadNumber(BEST_KEY),
  unlocked: Math.max(1, loadNumber(PROGRESS_KEY)),
  time: 0, // simulated seconds since level start
  sail: 1,
  lastHit: -99,
  clearTimer: 0, // counts down after the last enemy sinks
  deathTimer: 0, // counts down while the player's ship sinks
  nextBomb: 0,
  shake: 0,
  bannerTimer: 0,
  intro: 0, // seconds left of the level fly-in
  hurtBy: {}, // damage the player took this level, by source
};

const input = { left: false, right: false };
let player = null;
let env = null; // the current level environment (see src/env/*.js)
const enemies = [];
const balls = [];
const coins = [];
const colliders = []; // [{x, z, r, h}] from the environment
const reefs = []; // [{x, z, r}]
const bombs = [];

// ---------------------------------------------------------------------------
// Particles: two instanced pools (lit puffs and glowing sparks), no outlines.
// ---------------------------------------------------------------------------
const particleGeo = new THREE.IcosahedronGeometry(1, 1);
function makePool(material) {
  const mesh = new THREE.InstancedMesh(particleGeo, material, PARTICLE_CAP);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color());
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, items: [] };
}
const pools = {
  puff: makePool(noOutline(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(3) }))),
  glow: makePool(noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff }))),
};
const tmpColor = new THREE.Color();
const dummy = new THREE.Object3D();

function spawnParticle(kind, color, x, y, z, vx, vy, vz, life, size, grav = GRAVITY, grow = false, flat = false) {
  const pool = pools[kind];
  if (pool.items.length >= PARTICLE_CAP) return;
  pool.items.push({ color, x, y, z, vx, vy, vz, life, max: life, size, grav, grow, flat, rot: Math.random() * 6 });
}

function puff(x, y, z, n, color, spread, up, size, life, grav = GRAVITY, grow = false, kind = 'puff') {
  for (let i = 0; i < n; i++) {
    spawnParticle(
      kind,
      color,
      x,
      y,
      z,
      (Math.random() - 0.5) * spread,
      Math.random() * up,
      (Math.random() - 0.5) * spread,
      life * rand(0.7, 1.3),
      size * rand(0.7, 1.3),
      grav,
      grow
    );
  }
}

function updateParticles(dt) {
  for (const pool of Object.values(pools)) {
    const items = pool.items;
    let k = 0;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const f = p.life / p.max;
      const s = p.grow ? p.size * (1.7 - f * 0.7) * Math.min(1, f * 4) : p.size * Math.min(1, f * 1.5);
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rot, p.rot * 0.7, 0);
      dummy.scale.set(s, p.flat ? s * 0.3 : s, s);
      dummy.updateMatrix();
      pool.mesh.setMatrixAt(k, dummy.matrix);
      pool.mesh.setColorAt(k, tmpColor.setHex(p.color));
      items[k++] = p;
    }
    items.length = k;
    pool.mesh.count = k;
    pool.mesh.instanceMatrix.needsUpdate = true;
    if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
  }
}

function clearParticles() {
  for (const pool of Object.values(pools)) {
    pool.items.length = 0;
    pool.mesh.count = 0;
  }
}

// ---------------------------------------------------------------------------
// Floating labels and health bars above enemy ships
// ---------------------------------------------------------------------------
const labelCache = new Map();
function drawLabel(canvas, text, boss) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${boss ? 46 : 40}px "Luckiest Guy", "Fredoka", "Comic Sans MS", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#1d1330';
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2 + 2);
  ctx.fillStyle = boss ? '#ff9f1c' : '#fff4d6';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
}
function labelTexture(typeName) {
  let entry = labelCache.get(typeName);
  if (!entry) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 80;
    const t = SHIP_TYPES[typeName];
    drawLabel(canvas, t.name, t.boss);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    entry = { canvas, tex, text: t.name, boss: !!t.boss };
    labelCache.set(typeName, entry);
  }
  return entry.tex;
}
// Re-draw labels once the cartoon font has loaded.
document.fonts?.ready.then(() => {
  for (const e of labelCache.values()) {
    drawLabel(e.canvas, e.text, e.boss);
    e.tex.needsUpdate = true;
  }
});

const barBgMat = noOutline(new THREE.MeshBasicMaterial({ color: 0x1d1330, fog: false }));
const barFgMat = noOutline(new THREE.MeshBasicMaterial({ color: 0xe63946, fog: false }));
const barGeoBg = new THREE.PlaneGeometry(4.4, 0.75);
const barGeoFg = new THREE.PlaneGeometry(4, 0.4);
function buildTag(typeName) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(barGeoBg, barBgMat);
  const fg = new THREE.Mesh(barGeoFg, barFgMat);
  fg.position.z = 0.01;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(typeName), fog: false, depthWrite: false }));
  const big = SHIP_TYPES[typeName].boss ? 1.25 : 1;
  label.scale.set(8 * big, 1.25 * big, 1);
  label.position.y = 1.3;
  g.add(bg, fg, label);
  g.userData.fg = fg;
  return g;
}
function setTag(tag, ratio) {
  const r = clamp(ratio, 0.001, 1);
  tag.userData.fg.scale.x = r;
  tag.userData.fg.position.x = -(1 - r) * 2;
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------
function createShip(typeName, kind, x, z, h) {
  const type = SHIP_TYPES[typeName];
  const mesh = buildShip(typeName);
  scene.add(mesh);
  const ship = {
    kind,
    typeName,
    type,
    x,
    z,
    h,
    speed: 0,
    hp: type.hp,
    maxHp: type.hp,
    reload: { port: 0, star: 0 },
    sinking: 0, // > 0 while sinking (seconds since it started)
    roll: 0,
    onReef: false,
    mesh,
    tag: null,
  };
  if (kind === 'enemy') {
    ship.tag = buildTag(typeName);
    scene.add(ship.tag);
  }
  return ship;
}

function removeShip(s) {
  disposeShip(s.mesh);
  if (s.tag) {
    scene.remove(s.tag);
    s.tag.children[2].material.dispose();
  }
}

const ballGeo = new THREE.SphereGeometry(0.34, 12, 8);
const ballMat = toon(0x2b2b38);
const coinGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.2, 20);
const coinMat = toon(0xffc93c, { emissive: 0x6b4a00, emissiveIntensity: 0.5 });
const bombGeo = new THREE.IcosahedronGeometry(1.1, 1);
const bombMat = toon(0x3a2a2a, { emissive: 0xff5a1f, emissiveIntensity: 0.9 });
const ringGeo = new THREE.RingGeometry(BOMB_RADIUS - 1, BOMB_RADIUS, 40);
ringGeo.rotateX(-Math.PI / 2);
const ringMat = noOutline(new THREE.MeshBasicMaterial({ color: 0xff3b1f, transparent: true, opacity: 0.6, depthWrite: false }));

function clearLevelEntities() {
  for (const e of enemies) removeShip(e);
  if (player) removeShip(player);
  for (const b of balls) scene.remove(b.mesh);
  for (const c of coins) scene.remove(c.mesh);
  for (const b of bombs) {
    scene.remove(b.mesh);
    scene.remove(b.ring);
  }
  enemies.length = balls.length = coins.length = bombs.length = 0;
  player = null;
  clearParticles();
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------
function loadEnvironment(n) {
  if (env) env.dispose();
  const def = LEVELS[n - 1];
  env = def.env.build(scene, { rng: mulberry32(n * 7919 + 13) });
  colliders.length = 0;
  for (const c of env.colliders) colliders.push({ h: 3, ...c });
  reefs.length = 0;
  if (env.reefs) reefs.push(...env.reefs);
  ocean.setFoam(colliders);
  applyPalette(scene, def.env.palette, { ocean, sky, clouds, lights });
}

function freeSpot(x, z, clearance) {
  return colliders.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + clearance);
}

// Pick spawn points for a wave: far enough from the player and from other
// pirates, preferring the environment's ordering (which is spread out).
function pickSpawns(count) {
  const used = [];
  const px = player ? player.x : env.playerStart.x;
  const pz = player ? player.z : env.playerStart.z;
  const candidates = env.enemySpawns.filter((s) => freeSpot(s.x, s.z, 6));
  const ok = (s, minPlayer) =>
    Math.hypot(s.x - px, s.z - pz) >= minPlayer &&
    used.every((u) => Math.hypot(u.x - s.x, u.z - s.z) > 18) &&
    enemies.every((e) => e.hp <= 0 || Math.hypot(e.x - s.x, e.z - s.z) > 18);
  for (const minPlayer of [55, 40, 25, 0]) {
    for (const s of candidates) {
      if (used.length >= count) break;
      if (!used.includes(s) && ok(s, minPlayer)) used.push(s);
    }
  }
  // Fall back to reusing points (offset) if the environment ran short.
  while (used.length < count) {
    const s = candidates[used.length % candidates.length];
    used.push({ x: s.x + rand(-6, 6), z: s.z + rand(-6, 6) });
  }
  return used;
}

function spawnWave(index) {
  const def = LEVELS[state.level - 1];
  const wave = def.waves[index];
  const spots = pickSpawns(wave.length);
  wave.forEach((typeName, i) => {
    const s = spots[i];
    const px = player ? player.x : 0;
    const pz = player ? player.z : 0;
    enemies.push(createShip(typeName, 'enemy', s.x, s.z, Math.atan2(px - s.x, pz - s.z)));
  });
  state.wave = index;
  if (index > 0 && player && !player.sinking) {
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * WAVE_REPAIR);
  }
  if (index > 0) {
    const boss = wave.find((t) => SHIP_TYPES[t].boss);
    const label = boss ? `${SHIP_TYPES[boss].name} appears!` : 'Reinforcements!';
    showBanner(`${label}<small>${describeWave(wave)}</small><small>Your crew patches the hull</small>`, 3);
  }
}

function describeWave(wave) {
  const counts = {};
  for (const t of wave) counts[t] = (counts[t] || 0) + 1;
  return Object.entries(counts)
    .map(([t, n]) => `${n} &times; ${SHIP_TYPES[t].name}`)
    .join(' &middot; ');
}

function startLevel(n) {
  clearLevelEntities();
  if (menuShipMesh) {
    disposeShip(menuShipMesh);
    menuShipMesh = null;
  }
  state.level = n;
  state.wave = 0;
  state.time = 0;
  state.sail = 1;
  state.sunk = 0;
  state.hurtBy = {};
  state.lastHit = -99;
  state.clearTimer = 0;
  state.deathTimer = 0;
  state.shake = 0;
  state.goldAtLevelStart = state.gold;
  input.left = input.right = false;

  loadEnvironment(n);
  const def = LEVELS[n - 1];
  const ps = env.playerStart;
  player = createShip('player', 'player', ps.x, ps.z, ps.h);
  state.nextBomb = def.bombs ? def.grace + rand(...def.bombs.every) : Infinity;
  spawnWave(0);
  snapCamera();
  state.intro = INTRO_TIME;
  perf.settle = 1.5;

  state.mode = 'playing';
  for (const el of [ui.menu, ui.pause, ui.levelDone, ui.over, ui.won]) show(el, false);
  show(ui.hud, true);
  const m = def.env.meta;
  showBanner(`Level ${n}: ${m.name}<small>${m.subtitle}</small><small>${describeWave(def.waves[0])}</small>`, 4);
  updateHud(true);
}

function newGame(level = 1) {
  state.gold = 0;
  blurActive();
  startLevel(level);
}

function retryLevel() {
  state.gold = state.goldAtLevelStart;
  blurActive();
  startLevel(state.level);
}

function nextLevel() {
  blurActive();
  if (state.level >= LEVELS.length) return;
  startLevel(state.level + 1);
}

function blurActive() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

function showBanner(html, seconds) {
  ui.banner.innerHTML = html;
  show(ui.banner, true);
  // Restart the pop-in animation.
  ui.banner.classList.remove('pop');
  void ui.banner.offsetWidth;
  ui.banner.classList.add('pop');
  state.bannerTimer = seconds;
}

function finishLevel() {
  // Sweep up any loot still floating around.
  state.gold += coins.length * COIN_VALUE;
  for (const c of coins) scene.remove(c.mesh);
  coins.length = 0;
  const def = LEVELS[state.level - 1];
  state.gold += def.bonus;
  show(ui.banner, false);

  if (state.level >= LEVELS.length) {
    state.mode = 'won';
    const isBest = state.gold > state.best;
    if (isBest) {
      state.best = state.gold;
      saveNumber(BEST_KEY, state.best);
    }
    ui.wonGold.textContent = state.gold;
    show(ui.wonBest, isBest);
    show(ui.won, true);
  } else {
    state.mode = 'levelDone';
    if (state.level + 1 > state.unlocked) {
      state.unlocked = state.level + 1;
      saveNumber(PROGRESS_KEY, state.unlocked);
    }
    const next = LEVELS[state.level].env.meta;
    ui.levelTitle.textContent = `${def.env.meta.name} cleared!`;
    ui.levelSummary.innerHTML =
      `Ships sunk: <b>${state.sunk}</b> &middot; Level bonus: <b>+${def.bonus}</b> gold<br>` +
      `Total plunder: <b>${state.gold}</b> gold`;
    ui.nextBtn.textContent = `Sail to ${next.name}`;
    show(ui.levelDone, true);
  }
  renderLevelCards();
  updateHud(true);
}

function playerSunk() {
  state.mode = 'over';
  if (state.gold > state.best) {
    state.best = state.gold;
    saveNumber(BEST_KEY, state.best);
  }
  ui.overSummary.innerHTML = `The ${SHIP_TYPES.player.name} went down off the ${LEVELS[state.level - 1].env.meta.name}.<br>Retrying restores the gold you had when the level started.`;
  show(ui.over, true);
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------
// Vertical launch speed needed for a ball in flight for `t` seconds to come down at deck height.
function launchVy(t) {
  return clamp((0.8 - BALL_Y - 0.5 * GRAVITY * t * t) / t, 1, 11);
}

// Position of a point relative to `ship`: distance along the bow and to starboard.
function relative(ship, tx, tz) {
  const dx = tx - ship.x;
  const dz = tz - ship.z;
  return {
    along: dx * fwdX(ship.h) + dz * fwdZ(ship.h),
    lat: dx * rightX(ship.h) + dz * rightZ(ship.h),
    dist: Math.hypot(dx, dz),
  };
}

// side: +1 starboard (right), -1 port (left). Returns true if it fired.
// With a target, each gun leads it: it aims where the target will be when the
// ball arrives (scaled by `lead`), within a small swivel arc either side of the beam.
// rangeErr scales the flight time to make enemy gunners imperfect.
function fire(ship, side, target = null, { spread = 0.02, lead = 1, rangeErr = 1 } = {}) {
  const key = side > 0 ? 'star' : 'port';
  if (ship.reload[key] > 0 || ship.sinking || ship.hp <= 0) return false;
  const t = ship.type;
  const fx = fwdX(ship.h);
  const fz = fwdZ(ship.h);
  const beam = ship.h - (side * Math.PI) / 2; // angle of the beam on that side
  const svx = fx * ship.speed;
  const svz = fz * ship.speed;
  for (let i = 0; i < t.guns; i++) {
    const along = gunOffset(t, i);
    const x = ship.x + fx * along + rightX(ship.h) * side * (t.wid / 2 + 0.4);
    const z = ship.z + fz * along + rightZ(ship.h) * side * (t.wid / 2 + 0.4);

    let a = beam;
    let flight = DEFAULT_RANGE / BALL_SPEED;
    if (target) {
      // Solve the intercept in the shooter's frame (balls inherit the ship's velocity).
      const rvx = (fwdX(target.h) * target.speed - svx) * lead;
      const rvz = (fwdZ(target.h) * target.speed - svz) * lead;
      const px = target.x - x;
      const pz = target.z - z;
      flight = Math.hypot(px, pz) / BALL_SPEED;
      for (let k = 0; k < 3; k++) {
        flight = Math.hypot(px + rvx * flight, pz + rvz * flight) / BALL_SPEED;
      }
      const qa = Math.atan2(px + rvx * flight, pz + rvz * flight);
      a = beam + clamp(wrapAngle(qa - beam), -MAX_TRAVERSE, MAX_TRAVERSE);
      flight = clamp(flight * rangeErr, 6 / BALL_SPEED, MAX_RANGE / BALL_SPEED);
    }
    a += (Math.random() - 0.5) * spread * 2;
    const dx = Math.sin(a);
    const dz = Math.cos(a);

    const mesh = new THREE.Mesh(ballGeo, ballMat);
    mesh.position.set(x, BALL_Y, z);
    scene.add(mesh);
    balls.push({
      mesh,
      owner: ship.kind,
      src: ship.typeName,
      dmg: t.dmg,
      x,
      y: BALL_Y,
      z,
      vx: dx * BALL_SPEED + svx,
      vy: launchVy(flight) * rand(0.97, 1.03),
      vz: dz * BALL_SPEED + svz,
    });
    // Cartoon muzzle blast: a fiery flash and a big puff of smoke.
    puff(x + dx * 0.6, BALL_Y + 0.3, z + dz * 0.6, 4, 0xf4f1ea, 2.5, 1.8, 0.75, 1.0, 1.2, true);
    spawnParticle('glow', 0xffd23f, x + dx * 0.4, BALL_Y + 0.2, z + dz * 0.4, dx * 5, 0.6, dz * 5, 0.14, 0.75, 0);
    spawnParticle('glow', 0xff7b1c, x + dx * 0.8, BALL_Y + 0.2, z + dz * 0.8, dx * 7, 0.4, dz * 7, 0.12, 0.55, 0);
  }
  ship.reload[key] = t.reload;
  ship.roll -= side * 0.09;
  return true;
}

// The player's guns auto-range on the nearest enemy roughly abeam on that side.
function playerFire(side) {
  if (state.mode !== 'playing' || !player || player.sinking) return false;
  let aim = null;
  let bestDist = Infinity;
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    const r = relative(player, e.x, e.z);
    if (Math.sign(r.lat) !== side || r.dist > MAX_RANGE + 4) continue;
    if (Math.abs(r.along) > Math.abs(r.lat) * 1.2 + e.type.len / 2) continue;
    if (r.dist < bestDist) {
      bestDist = r.dist;
      aim = e;
    }
  }
  return fire(player, side, aim);
}

function damage(ship, amount, x, z, source = 'other') {
  if (ship.hp <= 0) return;
  ship.hp -= amount;
  if (ship.kind === 'player') state.hurtBy[source] = (state.hurtBy[source] || 0) + amount;
  const hx = x ?? ship.x;
  const hz = z ?? ship.z;
  puff(hx, 1.4, hz, 7, 0x8b5a2b, 7, 7, 0.4, 0.9); // wood splinters
  puff(hx, 1.6, hz, 3, 0xffb627, 3, 3, 0.5, 0.3, 0, false, 'glow');
  if (ship.kind === 'player') {
    state.lastHit = state.time;
    state.shake = Math.max(state.shake, 0.4);
  }
  if (ship.hp <= 0) {
    ship.hp = 0;
    ship.sinking = 0.001;
    puff(ship.x, 2, ship.z, 18, 0xff7b1c, 8, 9, 0.7, 1.0, GRAVITY, false, 'glow');
    puff(ship.x, 2, ship.z, 10, 0x4a4050, 6, 5, 1.2, 1.6, 1.5, true);
    if (ship.kind === 'enemy') {
      state.sunk++;
      for (let i = 0; i < ship.type.gold; i++) {
        const a = (i / ship.type.gold) * Math.PI * 2;
        const mesh = new THREE.Mesh(coinGeo, coinMat);
        scene.add(mesh);
        coins.push({ mesh, x: ship.x + Math.cos(a) * 2.5, z: ship.z + Math.sin(a) * 2.5, spin: Math.random() * 6 });
      }
      const left = enemies.filter((e) => e.hp > 0).length;
      const def = LEVELS[state.level - 1];
      const moreWaves = state.wave < def.waves.length - 1;
      if (ship.type.boss) showBanner(`${ship.type.name} is sunk!`, 2.5);
      else if (left > 0 || moreWaves) showBanner(`${ship.type.name} sunk!${left ? `<small>${left} to go</small>` : ''}`, 1.8);
    } else {
      state.deathTimer = 2.5;
      showBanner('Abandon ship!', 2.5);
    }
  }
}

// ---------------------------------------------------------------------------
// Lava bombs (volcano level)
// ---------------------------------------------------------------------------
function launchBomb() {
  const v = env.volcano;
  if (!v || !player || player.sinking) return;
  const def = LEVELS[state.level - 1];
  const T = rand(2.4, 3.2);
  // Aim roughly where the player will be, with some scatter so you can dodge.
  const lead = T * 0.8;
  const a = Math.random() * Math.PI * 2;
  const d = Math.random() * def.bombs.spread;
  const tx = player.x + fwdX(player.h) * player.speed * lead + Math.cos(a) * d;
  const tz = player.z + fwdZ(player.h) * player.speed * lead + Math.sin(a) * d;
  const mesh = new THREE.Mesh(bombGeo, bombMat);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  scene.add(mesh, ring);
  bombs.push({ mesh, ring, sx: v.x, sy: v.craterY, sz: v.z, tx, tz, t: 0, T, H: 30 + Math.random() * 15 });
}

function bombPos(b, u) {
  return {
    x: b.sx + (b.tx - b.sx) * u,
    y: b.sy * (1 - u) + 4 * b.H * u * (1 - u),
    z: b.sz + (b.tz - b.sz) * u,
  };
}

function updateBombs(dt) {
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i];
    b.t += dt;
    const u = b.t / b.T;
    if (u < 1) {
      if (Math.random() < dt * 30) {
        const p = bombPos(b, u);
        spawnParticle('glow', Math.random() < 0.5 ? 0xff7b1c : 0xffd23f, p.x, p.y, p.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), 0.5, 0.5, 0);
        spawnParticle('puff', 0x3d3440, p.x, p.y, p.z, rand(-0.5, 0.5), 1, rand(-0.5, 0.5), 1.2, 0.7, 0, true);
      }
      continue;
    }
    // Impact.
    puff(b.tx, 0.5, b.tz, 16, 0xffffff, 8, 12, 0.7, 1.0);
    puff(b.tx, 1, b.tz, 10, 0xff7b1c, 7, 9, 0.6, 0.7, GRAVITY, false, 'glow');
    puff(b.tx, 1, b.tz, 8, 0xe8e4f0, 5, 4, 1.3, 1.6, 2, true);
    const ships = player ? [player, ...enemies] : enemies;
    for (const s of ships) {
      if (s.hp <= 0) continue;
      const d = Math.hypot(s.x - b.tx, s.z - b.tz);
      const reach = BOMB_RADIUS + s.type.wid * 0.4;
      if (d < reach) damage(s, Math.round(BOMB_DAMAGE * (1 - (0.5 * d) / reach)), b.tx, b.tz, 'lava');
    }
    if (player && Math.hypot(player.x - b.tx, player.z - b.tz) < 25) state.shake = Math.max(state.shake, 0.5);
    scene.remove(b.mesh);
    scene.remove(b.ring);
    bombs.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
function steerToward(ship, desired, dt) {
  const t = ship.type;
  const rate = t.turn * (0.35 + 0.65 * Math.min(1, ship.speed / t.maxSpeed));
  const diff = wrapAngle(desired - ship.h);
  ship.h = wrapAngle(ship.h + clamp(diff, -rate * dt, rate * dt));
}

function speedCap(s) {
  return s.onReef && !s.type.shallow ? s.type.maxSpeed * REEF_SLOW : s.type.maxSpeed;
}

function updatePlayer(dt) {
  const p = player;
  if (p.sinking) return;
  const t = p.type;
  const turn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const rate = t.turn * (0.35 + 0.65 * Math.min(1, p.speed / t.maxSpeed));
  p.h = wrapAngle(p.h + turn * rate * dt);
  const target = SAIL_LEVELS[state.sail] * speedCap(p);
  p.speed += clamp(target - p.speed, -t.accel * 1.5 * dt, t.accel * dt);

  if (state.time - state.lastHit > REGEN_DELAY && p.hp < p.maxHp) {
    p.hp = Math.min(p.maxHp, p.hp + REGEN_RATE * dt);
  }
}

function updateEnemy(e, dt, attacking) {
  if (e.sinking) return;
  const t = e.type;
  const p = player;
  const def = LEVELS[state.level - 1];
  let desired = e.h;
  let targetSpeed = t.maxSpeed * 0.6;

  if (p && !p.sinking) {
    const r = relative(e, p.x, p.z);
    const toPlayer = Math.atan2(p.x - e.x, p.z - e.z);
    if (!attacking) {
      // Waiting for a free attack slot: circle at a distance, out of gun range.
      const a1 = wrapAngle(toPlayer + Math.PI / 2);
      const a2 = wrapAngle(toPlayer - Math.PI / 2);
      desired = Math.abs(wrapAngle(a1 - e.h)) < Math.abs(wrapAngle(a2 - e.h)) ? a1 : a2;
      const sideOfPlayer = Math.sign(wrapAngle(desired - toPlayer));
      if (r.dist < WAIT_DIST - 5) desired += sideOfPlayer * 0.8;
      else if (r.dist > WAIT_DIST + 10) desired = toPlayer;
      targetSpeed = t.maxSpeed * 0.5;
    } else if (r.dist > t.engage + 8) {
      desired = toPlayer;
      targetSpeed = t.maxSpeed;
    } else {
      // Circle the player, keeping a broadside pointed at them.
      const a1 = wrapAngle(toPlayer + Math.PI / 2);
      const a2 = wrapAngle(toPlayer - Math.PI / 2);
      desired = Math.abs(wrapAngle(a1 - e.h)) < Math.abs(wrapAngle(a2 - e.h)) ? a1 : a2;
      // Drift in or out to hold the preferred distance.
      const sideOfPlayer = Math.sign(wrapAngle(desired - toPlayer));
      if (r.dist < t.engage - 6) desired += sideOfPlayer * 0.5;
      else if (r.dist > t.engage + 2) desired -= sideOfPlayer * 0.4;
    }

    // Fire when the player is roughly abeam and in range.
    if (attacking && state.time > def.grace && r.dist < MAX_RANGE - 4 && Math.abs(r.along) < Math.abs(r.lat) * 0.45) {
      fire(e, r.lat > 0 ? 1 : -1, p, { spread: t.spread * def.spreadMul, lead: def.lead, rangeErr: rand(0.88, 1.12) });
    }
  }

  // Avoid land (and reefs, for deep hulls): look ahead and turn away from anything in the way.
  const look = 10 + t.len;
  const lookX = e.x + fwdX(e.h) * look;
  const lookZ = e.z + fwdZ(e.h) * look;
  const avoid = (o, margin) => {
    if (Math.hypot(o.x - lookX, o.z - lookZ) < o.r + margin || Math.hypot(o.x - e.x, o.z - e.z) < o.r + margin) {
      const r = relative(e, o.x, o.z);
      if (r.along > -2) {
        desired = e.h + (r.lat > 0 ? 1.2 : -1.2);
        targetSpeed = Math.min(targetSpeed, t.maxSpeed * 0.6);
      }
    }
  };
  if (!t.shallow) for (const reef of reefs) avoid(reef, 2);
  for (const c of colliders) avoid(c, t.wid + 5);
  // Stay inside the sea.
  if (Math.hypot(e.x, e.z) > env.worldRadius - 15) desired = Math.atan2(-e.x, -e.z);

  steerToward(e, desired, dt);
  targetSpeed = Math.min(targetSpeed, speedCap(e));
  e.speed += clamp(targetSpeed - e.speed, -t.accel * 1.5 * dt, t.accel * dt);
}

function moveShip(s, dt) {
  for (const k of ['port', 'star']) s.reload[k] = Math.max(0, s.reload[k] - dt);
  if (s.sinking) {
    s.sinking += dt;
    s.speed *= 1 - Math.min(1, dt * 1.5);
  }
  s.x += fwdX(s.h) * s.speed * dt;
  s.z += fwdZ(s.h) * s.speed * dt;

  // Land is solid.
  const hullR = s.type.wid * 0.5 + 0.4;
  for (const c of colliders) {
    const dx = s.x - c.x;
    const dz = s.z - c.z;
    const d = Math.hypot(dx, dz);
    const min = c.r + hullR;
    if (d < min && d > 0.0001) {
      s.x = c.x + (dx / d) * min;
      s.z = c.z + (dz / d) * min;
      s.speed *= 1 - Math.min(1, dt * 4);
    }
  }
  // Reefs slow deep hulls.
  const wasOnReef = s.onReef;
  s.onReef = reefs.some((r) => Math.hypot(s.x - r.x, s.z - r.z) < r.r);
  if (s.kind === 'player' && s.onReef && !wasOnReef && !s.sinking && state.bannerTimer <= 0) {
    showBanner('Scraping the reef!<small>Shallow water slows you down</small>', 1.6);
  }
  if (s.onReef && !s.type.shallow) s.speed = Math.min(s.speed, s.type.maxSpeed * REEF_SLOW + 0.5);
  // Edge of the world.
  const d = Math.hypot(s.x, s.z);
  if (d > env.worldRadius) {
    s.x *= env.worldRadius / d;
    s.z *= env.worldRadius / d;
    if (s.kind === 'player' && state.bannerTimer <= 0) showBanner('Turn back!<small>There be nothing but sea serpents out there</small>', 1.5);
  }
}

// Ships bump each other instead of overlapping.
function separateShips() {
  const all = enemies.filter((e) => e.sinking < 1.5);
  if (player) all.push(player);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      const min = (a.type.len + b.type.len) * 0.36;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d < min && d > 0.0001) {
        const push = (min - d) / 2;
        a.x -= (dx / d) * push;
        a.z -= (dz / d) * push;
        b.x += (dx / d) * push;
        b.z += (dz / d) * push;
      }
    }
  }
}

function hitsShip(b, s) {
  if (s.hp <= 0 || b.y > 3.8) return false;
  const r = relative(s, b.x, b.z);
  return Math.abs(r.along) < s.type.len / 2 + 0.3 && Math.abs(r.lat) < s.type.wid / 2 + 0.3;
}

function updateBalls(dt) {
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    b.vy += GRAVITY * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    let gone = false;

    const targets = b.owner === 'player' ? enemies : player ? [player] : [];
    for (const s of targets) {
      if (hitsShip(b, s)) {
        damage(s, b.dmg, b.x, b.z, b.src);
        gone = true;
        break;
      }
    }
    if (!gone) {
      for (const c of colliders) {
        if (b.y < c.h && Math.hypot(b.x - c.x, b.z - c.z) < c.r) {
          puff(b.x, b.y, b.z, 6, 0xd8c08a, 4, 4, 0.45, 0.6);
          gone = true;
          break;
        }
      }
    }
    if (!gone && b.y <= 0) {
      puff(b.x, 0.2, b.z, 7, 0xffffff, 3, 7, 0.5, 0.7);
      spawnParticle('puff', 0xffffff, b.x, 0.15, b.z, 0, 0, 0, 0.6, 1.4, 0, true, true);
      gone = true;
    }
    if (gone) {
      scene.remove(b.mesh);
      balls.splice(i, 1);
    }
  }
}

function updateCoins(dt) {
  if (!player) return;
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    const dx = player.x - c.x;
    const dz = player.z - c.z;
    const d = Math.hypot(dx, dz);
    if (!player.sinking && d > 0.001 && (d < 10 || state.clearTimer > 0)) {
      const pull = (state.clearTimer > 0 ? 30 : 14) * dt;
      c.x += (dx / d) * Math.min(pull, d);
      c.z += (dz / d) * Math.min(pull, d);
    }
    if (!player.sinking && d < 3) {
      state.gold += COIN_VALUE;
      puff(c.x, 1.5, c.z, 5, 0xffd23f, 3, 5, 0.3, 0.5, GRAVITY, false, 'glow');
      scene.remove(c.mesh);
      coins.splice(i, 1);
    }
  }
}

function step(dt) {
  state.time += dt;
  const def = LEVELS[state.level - 1];
  if (player) updatePlayer(dt);
  // The nearest pirates get the attack slots.
  const attackers = new Set(
    enemies
      .filter((e) => e.hp > 0 && player)
      .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))
      .slice(0, def.maxAttackers)
  );
  for (const e of enemies) updateEnemy(e, dt, attackers.has(e));
  if (player) moveShip(player, dt);
  for (const e of enemies) moveShip(e, dt);
  separateShips();
  updateBalls(dt);
  updateCoins(dt);
  updateBombs(dt);

  // Remove fully sunk enemies.
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].sinking > 4) {
      removeShip(enemies[i]);
      enemies.splice(i, 1);
    }
  }

  if (state.deathTimer > 0) {
    state.deathTimer -= dt;
    if (state.deathTimer <= 0) playerSunk();
    return;
  }
  if (state.clearTimer > 0) {
    state.clearTimer -= dt;
    if (state.clearTimer <= 0) finishLevel();
    return;
  }
  if (!player || player.sinking) return;

  if (def.bombs && state.time >= state.nextBomb) {
    launchBomb();
    state.nextBomb = state.time + rand(...def.bombs.every);
  }

  const alive = enemies.filter((e) => e.hp > 0).length;
  if (state.wave < def.waves.length - 1 && alive <= def.nextWaveAt) {
    spawnWave(state.wave + 1);
  } else if (alive === 0 && state.wave === def.waves.length - 1) {
    state.clearTimer = 2.5;
    showBanner(state.level === LEVELS.length ? 'Victory!<small>The seas are yours</small>' : 'Level cleared!<small>Grab the loot</small>', 2.5);
  }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
function changeSail(d) {
  if (state.mode !== 'playing' || !player || player.sinking) return;
  state.sail = clamp(state.sail + d, 0, SAIL_LEVELS.length - 1);
}

function togglePause() {
  if (state.mode === 'playing') {
    state.mode = 'paused';
    input.left = input.right = false;
    show(ui.pause, true);
  } else if (state.mode === 'paused') {
    state.mode = 'playing';
    show(ui.pause, false);
  }
}

const KEYMAP = {
  a: 'left', arrowleft: 'left',
  d: 'right', arrowright: 'right',
};

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();

  if (k === 'enter' || (k === ' ' && state.mode === 'menu')) {
    if (e.repeat) return;
    if (state.mode === 'menu' || state.mode === 'won') newGame();
    else if (state.mode === 'levelDone') nextLevel();
    else if (state.mode === 'over') retryLevel();
    return;
  }
  if (k === 'p' || k === 'escape') {
    togglePause();
    return;
  }
  if (state.mode !== 'playing') return;
  if (KEYMAP[k]) input[KEYMAP[k]] = true;
  else if (!e.repeat && (k === 'w' || k === 'arrowup')) changeSail(1);
  else if (!e.repeat && (k === 's' || k === 'arrowdown')) changeSail(-1);
  // Holding a fire key keeps firing whenever the guns reload.
  else if (k === 'q' || k === 'j') playerFire(-1);
  else if (k === 'e' || k === 'l') playerFire(1);
  else if (k === ' ') {
    playerFire(-1);
    playerFire(1);
  }
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (KEYMAP[k]) input[KEYMAP[k]] = false;
});

// Releasing keys while the window is unfocused would otherwise leave the ship turning forever.
window.addEventListener('blur', () => {
  input.left = input.right = false;
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.mode === 'playing') togglePause();
});

// Touch buttons.
for (const btn of document.querySelectorAll('[data-hold]')) {
  const key = btn.dataset.hold;
  const on = (e) => {
    e.preventDefault();
    if (state.mode !== 'playing') return;
    input[key] = true;
    btn.classList.add('active');
  };
  const off = () => {
    input[key] = false;
    btn.classList.remove('active');
  };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointercancel', off);
  btn.addEventListener('pointerleave', off);
}
const TAP_ACTIONS = {
  sailUp: () => changeSail(1),
  sailDown: () => changeSail(-1),
  firePort: () => playerFire(-1),
  fireStar: () => playerFire(1),
};
for (const btn of document.querySelectorAll('[data-tap]')) {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    TAP_ACTIONS[btn.dataset.tap]();
  });
}

$('start-btn').addEventListener('click', () => newGame(1));
$('resume-btn').addEventListener('click', togglePause);
$('next-btn').addEventListener('click', nextLevel);
$('retry-btn').addEventListener('click', retryLevel);
$('menu-btn').addEventListener('click', showMenu);
$('again-btn').addEventListener('click', showMenu);
$('pause-btn').addEventListener('click', (e) => {
  togglePause();
  e.currentTarget.blur(); // so Space doesn't re-press the button
});

// Level select cards on the title screen.
function renderLevelCards() {
  ui.best.textContent = state.best;
  ui.levelCards.innerHTML = '';
  LEVELS.forEach((def, i) => {
    const n = i + 1;
    const locked = n > state.unlocked;
    const btn = document.createElement('button');
    btn.className = `level-card lvl-${n}${locked ? ' locked' : ''}`;
    btn.disabled = locked;
    btn.dataset.level = n;
    btn.innerHTML =
      `<span class="lvl-num">${n}</span>` +
      `<span class="lvl-name">${def.env.meta.name}</span>` +
      `<span class="lvl-stars">${'★'.repeat(def.stars)}${'☆'.repeat(3 - def.stars)}</span>` +
      `<span class="lvl-lock">${locked ? 'Locked' : 'Play'}</span>`;
    btn.addEventListener('click', () => newGame(n));
    ui.levelCards.appendChild(btn);
  });
}

function showMenu() {
  blurActive();
  clearLevelEntities();
  for (const el of [ui.pause, ui.levelDone, ui.over, ui.won, ui.hud, ui.banner, ui.boss]) show(el, false);
  state.mode = 'menu';
  loadEnvironment(1);
  menuShip();
  renderLevelCards();
  show(ui.menu, true);
}

// A ship bobbing in the harbour behind the title screen.
let menuShipMesh = null;
function menuShip() {
  if (menuShipMesh) disposeShip(menuShipMesh);
  menuShipMesh = buildShip('player');
  scene.add(menuShipMesh);
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
const shown = {};
function setText(el, key, value, force) {
  if (force || shown[key] !== value) {
    el.textContent = value;
    shown[key] = value;
  }
}
function setWidth(el, key, pct, force) {
  const v = Math.round(pct);
  if (force || shown[key] !== v) {
    el.style.width = v + '%';
    shown[key] = v;
  }
}

function updateHud(force = false) {
  if (!player) return;
  const hpPct = (player.hp / player.maxHp) * 100;
  setWidth(ui.hullFill, 'hp', hpPct, force);
  const cls = hpPct > 50 ? 'good' : hpPct > 25 ? 'warn' : 'bad';
  if (force || shown.hpCls !== cls) {
    ui.hullFill.className = `fill ${cls}`;
    shown.hpCls = cls;
  }
  setText(ui.levelName, 'level', `${state.level}. ${LEVELS[state.level - 1].env.meta.name}`, force);
  const def = LEVELS[state.level - 1];
  const pending = def.waves.slice(state.wave + 1).reduce((n, w) => n + w.length, 0);
  setText(ui.ships, 'ships', enemies.filter((e) => e.hp > 0).length + pending, force);
  setText(ui.gold, 'gold', state.gold, force);
  setText(ui.sails, 'sails', ['Anchored', 'Half sail', 'Most sail', 'Full sail'][state.sail], force);
  const t = player.type;
  setWidth(ui.reloadPort, 'rp', (1 - player.reload.port / t.reload) * 100, force);
  setWidth(ui.reloadStar, 'rs', (1 - player.reload.star / t.reload) * 100, force);

  const boss = enemies.find((e) => e.type.boss && e.hp > 0);
  if (force || shown.boss !== !!boss) {
    show(ui.boss, !!boss);
    shown.boss = !!boss;
    if (boss) ui.bossName.textContent = boss.type.name;
  }
  if (boss) setWidth(ui.bossFill, 'bossHp', (boss.hp / boss.maxHp) * 100, force);
}

// Minimap rotates with the ship so "up" is always the bow.
function drawMinimap() {
  const S = ui.minimap.width;
  const c = S / 2;
  mm.clearRect(0, 0, S, S);
  mm.save();
  mm.beginPath();
  mm.arc(c, c, c - 2, 0, Math.PI * 2);
  mm.clip();
  mm.fillStyle = '#2f8fd8';
  mm.fillRect(0, 0, S, S);
  if (!player || !env) {
    mm.restore();
    return;
  }
  const R = env.worldRadius;
  const scale = (S / 2 - 6) / (R * 0.75);
  const toMap = (x, z) => {
    const r = relative(player, x, z);
    return [c + r.lat * scale, c - r.along * scale];
  };
  // Beyond the edge of the sea.
  const [ox, oy] = toMap(0, 0);
  mm.fillStyle = '#1b5c95';
  mm.beginPath();
  mm.rect(0, 0, S, S);
  mm.arc(ox, oy, R * scale, 0, Math.PI * 2, true);
  mm.fill();
  mm.fillStyle = '#7fe0d6';
  for (const r of reefs) {
    const [x, y] = toMap(r.x, r.z);
    mm.beginPath();
    mm.arc(x, y, Math.max(2, r.r * scale), 0, Math.PI * 2);
    mm.fill();
  }
  mm.fillStyle = '#f2d98a';
  for (const col of colliders) {
    const [x, y] = toMap(col.x, col.z);
    mm.beginPath();
    mm.arc(x, y, Math.max(1.5, col.r * scale), 0, Math.PI * 2);
    mm.fill();
  }
  if (env.volcano) {
    const [x, y] = toMap(env.volcano.x, env.volcano.z);
    mm.fillStyle = '#ff5a1f';
    mm.beginPath();
    mm.arc(x, y, 4, 0, Math.PI * 2);
    mm.fill();
  }
  mm.fillStyle = '#ff3b1f';
  for (const b of bombs) {
    const [x, y] = toMap(b.tx, b.tz);
    mm.fillRect(x - 2, y - 2, 4, 4);
  }
  mm.fillStyle = '#ffc93c';
  for (const co of coins) {
    const [x, y] = toMap(co.x, co.z);
    mm.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    let [x, y] = toMap(e.x, e.z);
    // Pin off-map enemies to the rim so you can always find them.
    const dx = x - c;
    const dy = y - c;
    const dl = Math.hypot(dx, dy);
    if (dl > c - 7) {
      x = c + (dx / dl) * (c - 7);
      y = c + (dy / dl) * (c - 7);
    }
    const r = e.type.boss ? 6 : 4;
    mm.fillStyle = '#1d1330';
    mm.beginPath();
    mm.arc(x, y, r + 1.5, 0, Math.PI * 2);
    mm.fill();
    mm.fillStyle = e.type.boss ? '#ff9f1c' : '#e63946';
    mm.beginPath();
    mm.arc(x, y, r, 0, Math.PI * 2);
    mm.fill();
  }
  // The player: a little arrow pointing up.
  mm.fillStyle = '#fff4d6';
  mm.strokeStyle = '#1d1330';
  mm.lineWidth = 2;
  mm.beginPath();
  mm.moveTo(c, c - 7);
  mm.lineTo(c + 5, c + 5);
  mm.lineTo(c, c + 2);
  mm.lineTo(c - 5, c + 5);
  mm.closePath();
  mm.fill();
  mm.stroke();
  mm.restore();
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let visualTime = 0;

function syncShip(s, t) {
  const wy = ocean.heightAt(s.x, s.z, t);
  // Pitch and roll from the slope of the waves under the hull.
  const fx = fwdX(s.h);
  const fz = fwdZ(s.h);
  const half = s.type.len * 0.35;
  const ahead = ocean.heightAt(s.x + fx * half, s.z + fz * half, t);
  const behind = ocean.heightAt(s.x - fx * half, s.z - fz * half, t);
  const side = s.type.wid * 0.5;
  const port = ocean.heightAt(s.x - rightX(s.h) * side, s.z - rightZ(s.h) * side, t);
  const star = ocean.heightAt(s.x + rightX(s.h) * side, s.z + rightZ(s.h) * side, t);
  s.roll *= 0.92;
  const sink = s.sinking ? Math.min(s.sinking, 4) : 0;
  s.mesh.position.set(s.x, wy - sink * 1.5, s.z);
  s.mesh.rotation.set(0, 0, 0);
  s.mesh.rotation.y = s.h;
  s.mesh.rotateX(Math.atan2(behind - ahead, half * 2) * 0.8 + sink * 0.1);
  s.mesh.rotateZ(Math.atan2(port - star, side * 2) * 0.6 + s.roll + sink * 0.28);
  animateShip(s.mesh, t, s.sinking ? 0 : s.speed / s.type.maxSpeed);

  if (s.sinking && Math.random() < 0.5) {
    spawnParticle('glow', Math.random() < 0.5 ? 0xff7b1c : 0xffd23f, s.x + rand(-2, 2), 2 - sink, s.z + rand(-2, 2), 0, 3, 0, 0.6, 0.6, 0);
    spawnParticle('puff', 0x4a4050, s.x + rand(-2, 2), 2.5 - sink, s.z + rand(-2, 2), 0, 2.5, 0, 1.4, 0.9, 0, true);
  }
  if (s.tag) {
    s.tag.visible = s.hp > 0;
    s.tag.position.set(s.x, wy + 4.5 + s.type.len * 0.55, s.z);
    s.tag.quaternion.copy(camera.quaternion);
    setTag(s.tag, s.hp / s.maxHp);
  }
  // Foamy wake behind moving ships.
  if (s.speed > 2 && !s.sinking && Math.random() < s.speed / 18) {
    const bx = s.x - fx * s.type.len * 0.5;
    const bz = s.z - fz * s.type.len * 0.5;
    spawnParticle('puff', 0xffffff, bx + rand(-1, 1), wy + 0.1, bz + rand(-1, 1), 0, 0.2, 0, 1.4, rand(0.5, 0.9), 0, true, true);
  }
  // Bow spray.
  if (s.speed > 6 && !s.sinking && Math.random() < 0.25) {
    const bx = s.x + fx * s.type.len * 0.5;
    const bz = s.z + fz * s.type.len * 0.5;
    spawnParticle('puff', 0xffffff, bx, wy + 0.3, bz, rightX(s.h) * rand(-3, 3), 2, rightZ(s.h) * rand(-3, 3), 0.5, 0.35, GRAVITY * 0.5);
  }
}

const chasePos = new THREE.Vector3(); // where the chase camera wants to be (smoothed)
const camLook = new THREE.Vector3();
const camFar = new THREE.Vector3();
const camStart = new THREE.Vector3();

// Place the chase camera straight behind the player.
function snapCamera() {
  if (!player) return;
  chasePos.set(player.x - fwdX(player.h) * CHASE_BACK, CHASE_UP, player.z - fwdZ(player.h) * CHASE_BACK);
  camera.position.copy(chasePos);
  camera.lookAt(player.x + fwdX(player.h) * CHASE_AHEAD, 1.5, player.z + fwdZ(player.h) * CHASE_AHEAD);
}

function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta();
  trackPerformance(rawDt);
  const dt = Math.min(rawDt, MAX_FRAME_DT);
  const paused = state.mode === 'paused';
  if (!paused) visualTime += dt;
  const t = visualTime;

  if (state.mode === 'playing') {
    let remaining = dt;
    while (remaining > 1e-6 && state.mode === 'playing') {
      const h = Math.min(MAX_STEP, remaining);
      step(h);
      remaining -= h;
    }
  }

  if (state.bannerTimer > 0 && !paused) {
    state.bannerTimer -= dt;
    if (state.bannerTimer <= 0) show(ui.banner, false);
  }

  if (!paused) updateParticles(dt);
  if (player) syncShip(player, t);
  for (const e of enemies) syncShip(e, t);
  for (const b of balls) b.mesh.position.set(b.x, b.y, b.z);
  for (const c of coins) {
    c.mesh.position.set(c.x, ocean.heightAt(c.x, c.z, t) + 0.8, c.z);
    c.mesh.rotation.set(Math.PI / 2, 0, t * 3 + c.spin);
  }
  for (const b of bombs) {
    const u = Math.min(1, b.t / b.T);
    const p = bombPos(b, u);
    b.mesh.position.set(p.x, p.y, p.z);
    b.mesh.rotation.set(t * 3, t * 2, 0);
    b.ring.position.set(b.tx, ocean.heightAt(b.tx, b.tz, t) + 0.25, b.tz);
    b.ring.scale.setScalar(0.35 + 0.65 * u);
  }
  ringMat.opacity = 0.45 + 0.3 * Math.sin(t * 12);

  // Camera: a chase cam behind the player, or a slow orbit on the menu.
  let fx = 0;
  let fz = 0;
  if (player) {
    fx = fwdX(player.h);
    fz = fwdZ(player.h);
    const k = Math.min(1, dt * 3);
    chasePos.x += (player.x - fx * CHASE_BACK - chasePos.x) * k;
    chasePos.z += (player.z - fz * CHASE_BACK - chasePos.z) * k;
    chasePos.y += (CHASE_UP - chasePos.y) * k;
    camera.position.copy(chasePos);
    camLook.set(player.x + fx * CHASE_AHEAD, 1.5, player.z + fz * CHASE_AHEAD);
    if (state.intro > 0) {
      // Level fly-in: start high above and behind, looking out over the level, then swoop down.
      if (!paused) state.intro = Math.max(0, state.intro - dt);
      const u = 1 - state.intro / INTRO_TIME;
      const e = u * u * (3 - 2 * u);
      const v = env.volcano;
      if (v) camFar.set(v.x, v.craterY * 0.75, v.z);
      else camFar.set(player.x + fx * 70, 4, player.z + fz * 70);
      camStart.set(player.x - fx * 48, 42, player.z - fz * 48);
      camera.position.lerpVectors(camStart, chasePos, e);
      camLook.lerpVectors(camFar, camLook, e);
    }
    if (state.shake > 0) {
      if (!paused) state.shake = Math.max(0, state.shake - dt);
      camera.position.x += (Math.random() - 0.5) * state.shake;
      camera.position.y += (Math.random() - 0.5) * state.shake;
    }
    camera.lookAt(camLook);
  } else if (env) {
    const ps = env.playerStart;
    if (menuShipMesh) {
      menuShipMesh.position.set(ps.x, ocean.heightAt(ps.x, ps.z, t), ps.z);
      menuShipMesh.rotation.set(Math.sin(t * 0.9) * 0.03, ps.h + 0.6, Math.sin(t * 1.3) * 0.05);
      animateShip(menuShipMesh, t, 0.4);
    }
    const a = t * 0.08;
    camera.position.set(ps.x + Math.sin(a) * 26, 9, ps.z + Math.cos(a) * 26);
    camera.lookAt(ps.x, 3, ps.z);
  }

  const focusX = player ? player.x : camera.position.x;
  const focusZ = player ? player.z : camera.position.z;
  ocean.update(t, focusX, focusZ);
  sky.update(camera);
  clouds.update(paused ? 0 : dt, focusX, focusZ);
  if (env && !paused) env.update(t, dt);

  if (state.mode !== 'menu') {
    updateHud();
    drawMinimap();
  }
  view.renderer.info.reset();
  view.render(scene, camera);
}

showMenu();
frame();

// Exposed for automated tests and console tinkering.
window.__game = {
  state,
  input,
  enemies,
  balls,
  coins,
  colliders,
  reefs,
  bombs,
  LEVELS,
  SHIP_TYPES,
  get player() {
    return player;
  },
  get env() {
    return env;
  },
  newGame,
  startLevel,
  nextLevel,
  retryLevel,
  showMenu,
  togglePause,
  changeSail,
  playerFire,
  fire,
  damage,
  relative,
  launchBomb,
  step,
  get renderInfo() {
    return { ...view.renderer.info.render };
  },
  get quality() {
    return { level: perf.level, scale: QUALITY_STEPS[perf.level], pixelRatio: view.renderer.getPixelRatio() };
  },
};
