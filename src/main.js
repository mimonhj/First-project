import * as THREE from 'three';
import { buildShip, buildIsland, buildHealthBar, setHealthBar, gunOffset, mat, basicMat } from './models.js';

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------
const PIXEL = 3; // render at 1/PIXEL resolution, then scale up with hard edges
const WORLD_R = 130; // radius of the playable sea
const GRAVITY = -20;
const BALL_SPEED = 30;
const BALL_Y = 1.6; // height cannonballs are fired from
const MAX_RANGE = 34;
const DEFAULT_RANGE = 24;
const MAX_TRAVERSE = 0.3; // radians the guns can swivel off the beam
const ENEMY_LEAD = 0.6; // pirate gunners only partly account for your motion
const MAX_STEP = 1 / 120; // physics substep: keeps fast cannonballs from skipping through hulls
const MAX_FRAME_DT = 0.1;
const SAIL_LEVELS = [0, 0.35, 0.7, 1];
const COIN_VALUE = 10;
const LEVEL_BONUS = 50;
const REGEN_DELAY = 5; // seconds without damage before the hull repairs itself
const REGEN_RATE = 2; // hp per second
const ENEMY_GRACE = 3; // seconds at level start before enemies may shoot
const MAX_ATTACKERS = 2; // only this many pirates attack at once; the rest wait their turn
const WAIT_DIST = 50; // distance waiting pirates keep from the player
const MAX_PARTICLES = 700;
const BEST_KEY = 'pixel-pirates-best';

const SHIP_TYPES = {
  player: { hp: 100, len: 9, wid: 3.2, maxSpeed: 12, accel: 4, turn: 1.4, reload: 1.6, guns: 3, dmg: 10, masts: 2, hull: 0x8a5a2b, trim: 0xe0b04a, sail: 0xf4ecd8, flag: 0x2c7be5 },
  sloop: { hp: 40, len: 7, wid: 2.6, maxSpeed: 9, accel: 3, turn: 1.1, reload: 2.8, guns: 2, dmg: 4, masts: 1, hull: 0x5a3a22, trim: 0x2a2a2a, sail: 0x2b2b2b, flag: 0x111111, gold: 3, engage: 20, spread: 0.1 },
  brig: { hp: 75, len: 9, wid: 3.2, maxSpeed: 8, accel: 2.5, turn: 0.85, reload: 2.5, guns: 3, dmg: 5, masts: 2, hull: 0x4a2e1a, trim: 0x8b1e1e, sail: 0x7a1d1d, flag: 0x111111, gold: 5, engage: 22, spread: 0.08 },
  galleon: { hp: 220, len: 13, wid: 4.4, maxSpeed: 6, accel: 2, turn: 0.6, reload: 2.2, guns: 5, dmg: 6, masts: 3, hull: 0x2e1f14, trim: 0xc9a227, sail: 0x1a1a1a, flag: 0xb01010, gold: 12, engage: 24, spread: 0.07 },
};

const LEVELS = [
  { name: 'Calm Waters', ships: ['sloop', 'sloop'] },
  { name: "Smugglers' Cove", ships: ['sloop', 'sloop', 'brig'] },
  { name: 'The Blockade', ships: ['brig', 'brig', 'sloop', 'sloop'] },
  { name: 'Storm Fleet', ships: ['brig', 'brig', 'brig', 'sloop'] },
  { name: "Blackbeard's Galleon", ships: ['galleon', 'sloop', 'sloop'], boss: true },
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

// Ships face (sin h, cos h) in the xz plane; "right" is starboard.
const fwdX = (h) => Math.sin(h);
const fwdZ = (h) => Math.cos(h);
const rightX = (h) => -Math.cos(h);
const rightZ = (h) => Math.sin(h);

function waveHeight(x, z, t) {
  return Math.sin(x * 0.15 + t * 1.2) * 0.35 + Math.cos(z * 0.12 + t * 0.9) * 0.35;
}

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const ui = {
  canvas: $('game'),
  hud: $('hud'),
  hullFill: $('hull-fill'),
  level: $('level'),
  ships: $('ships'),
  gold: $('gold'),
  reloadPort: $('reload-port'),
  reloadStar: $('reload-star'),
  sails: $('sails'),
  minimap: $('minimap'),
  banner: $('banner'),
  menu: $('menu-screen'),
  pause: $('pause-screen'),
  levelDone: $('level-screen'),
  levelSummary: $('level-summary'),
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

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(v) {
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch {
    // Storage blocked: the best score just won't persist.
  }
}

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: false });
} catch (err) {
  show(ui.menu, false);
  show(ui.error, true);
  throw err;
}
renderer.setPixelRatio(1);

const SKY = 0x87cefa;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 70, 190);

const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 400);
camera.position.set(0, 12, -20);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(Math.ceil(w / PIXEL), Math.ceil(h / PIXEL), false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

scene.add(new THREE.HemisphereLight(0xdff3ff, 0x2a4a6a, 1.4));
const sun = new THREE.DirectionalLight(0xfff1d0, 1.8);
sun.position.set(40, 80, 20);
scene.add(sun);
// Fill light from the opposite side so sails seen from behind aren't left in shadow.
const fill = new THREE.DirectionalLight(0xcfe6ff, 0.9);
fill.position.set(-30, 50, -40);
scene.add(fill);

// Low-poly ocean, animated per frame. Flat shading makes each facet a solid colour.
const OCEAN_SIZE = WORLD_R * 2 + 140;
const oceanGeo = new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, 70, 70);
oceanGeo.rotateX(-Math.PI / 2);
const ocean = new THREE.Mesh(oceanGeo, new THREE.MeshLambertMaterial({ color: 0x2a8fd4, flatShading: true }));
scene.add(ocean);
const oceanPos = oceanGeo.attributes.position;

// A ring of rocks marks the edge of the playable sea.
const edgeRng = mulberry32(99);
for (let i = 0; i < 60; i++) {
  const a = (i / 60) * Math.PI * 2;
  const r = WORLD_R + 8 + edgeRng() * 6;
  const s = 2 + edgeRng() * 3;
  const rock = new THREE.Mesh(new THREE.BoxGeometry(s, s * (0.8 + edgeRng()), s), mat(edgeRng() < 0.5 ? 0x7d7d7d : 0x6a6a6a));
  rock.position.set(Math.cos(a) * r, s * 0.3, Math.sin(a) * r);
  rock.rotation.y = edgeRng() * Math.PI;
  scene.add(rock);
}

// Pixel clouds.
const clouds = [];
for (let i = 0; i < 14; i++) {
  const c = new THREE.Group();
  const n = 2 + Math.floor(Math.random() * 3);
  for (let k = 0; k < n; k++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(8 + Math.random() * 8, 3, 6 + Math.random() * 4), basicMat(0xffffff));
    b.position.set(k * 6 - n * 3, Math.random() * 1.5, Math.random() * 3);
    c.add(b);
  }
  const a = Math.random() * Math.PI * 2;
  const d = 40 + Math.random() * 120;
  c.position.set(Math.cos(a) * d, 45 + Math.random() * 15, Math.sin(a) * d);
  scene.add(c);
  clouds.push(c);
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const state = {
  mode: 'menu', // menu | playing | paused | levelDone | over | won
  level: 1,
  gold: 0,
  goldAtLevelStart: 0,
  best: loadBest(),
  time: 0, // time since level start
  sail: 1,
  lastHit: -99,
  clearTimer: 0, // counts down after the last enemy sinks
  deathTimer: 0, // counts down while the player's ship sinks
  shake: 0,
  bannerTimer: 0,
};

const input = { left: false, right: false };
let player = null;
const enemies = [];
const balls = [];
const coins = [];
const islands = [];
const particles = [];

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------
function createShip(typeName, kind, x, z, h) {
  const type = SHIP_TYPES[typeName];
  const mesh = buildShip(type, kind === 'enemy');
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
    mesh,
    bar: null,
    aiSide: Math.random() < 0.5 ? 1 : -1,
  };
  if (kind === 'enemy') {
    ship.bar = buildHealthBar();
    scene.add(ship.bar);
  }
  return ship;
}

function removeShip(s) {
  scene.remove(s.mesh);
  if (s.bar) scene.remove(s.bar);
}

const ballGeo = new THREE.IcosahedronGeometry(0.28, 0);
const coinGeo = new THREE.BoxGeometry(0.9, 0.9, 0.22);
const coinMat = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x6b4a00, flatShading: true });
const particleGeo = new THREE.BoxGeometry(1, 1, 1);

function spawnParticle(color, x, y, z, vx, vy, vz, life, size, grav = GRAVITY, grow = false) {
  if (particles.length >= MAX_PARTICLES) return;
  const mesh = new THREE.Mesh(particleGeo, basicMat(color));
  mesh.position.set(x, y, z);
  mesh.scale.setScalar(size);
  scene.add(mesh);
  particles.push({ mesh, vx, vy, vz, life, max: life, size, grav, grow });
}

function puff(x, y, z, n, color, spread, up, size, life, grav, grow) {
  for (let i = 0; i < n; i++) {
    spawnParticle(
      color,
      x,
      y,
      z,
      (Math.random() - 0.5) * spread,
      Math.random() * up,
      (Math.random() - 0.5) * spread,
      life * (0.7 + Math.random() * 0.6),
      size * (0.7 + Math.random() * 0.6),
      grav,
      grow
    );
  }
}

function clearLevelEntities() {
  for (const e of enemies) removeShip(e);
  if (player) removeShip(player);
  for (const b of balls) scene.remove(b.mesh);
  for (const c of coins) scene.remove(c.mesh);
  for (const i of islands) scene.remove(i.mesh);
  for (const p of particles) scene.remove(p.mesh);
  enemies.length = balls.length = coins.length = islands.length = particles.length = 0;
  player = null;
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------
function placeIslands(level) {
  const rng = mulberry32(level * 7919 + 13);
  const count = 6 + Math.floor(rng() * 4);
  let tries = 0;
  while (islands.length < count && tries++ < 500) {
    const r = 4 + rng() * 5;
    const a = rng() * Math.PI * 2;
    const d = 25 + rng() * (WORLD_R - 35);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (Math.hypot(x, z) < 22 + r) continue; // keep the player's start clear
    if (islands.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 14)) continue; // leave channels between islands
    const mesh = buildIsland(r, rng);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    islands.push({ x, z, r, mesh });
  }
}

function freeSpot(x, z, clearance) {
  return islands.every((i) => Math.hypot(i.x - x, i.z - z) > i.r * 1.15 + clearance);
}

function startLevel(n) {
  clearLevelEntities();
  state.level = n;
  state.time = 0;
  state.sail = 1;
  state.lastHit = -99;
  state.clearTimer = 0;
  state.deathTimer = 0;
  state.shake = 0;
  state.goldAtLevelStart = state.gold;
  input.left = input.right = false;

  placeIslands(n);
  player = createShip('player', 'player', 0, 0, 0);

  const def = LEVELS[n - 1];
  const rng = mulberry32(n * 31 + 5);
  def.ships.forEach((typeName, i) => {
    // Spread enemies around the compass, ahead of the player first.
    let a = (i / def.ships.length) * Math.PI * 2 + rng() * 0.6;
    let d = 60 + rng() * 25;
    let x = Math.sin(a) * d;
    let z = Math.cos(a) * d;
    for (let k = 0; k < 40 && !freeSpot(x, z, 8); k++) {
      a += 0.3;
      d = 55 + rng() * 35;
      x = Math.sin(a) * d;
      z = Math.cos(a) * d;
    }
    const e = createShip(typeName, 'enemy', x, z, Math.atan2(-x, -z));
    enemies.push(e);
  });

  state.mode = 'playing';
  for (const el of [ui.menu, ui.pause, ui.levelDone, ui.over, ui.won]) show(el, false);
  show(ui.hud, true);
  const boss = def.boss ? '<small>Sink the galleon!</small>' : `<small>${def.ships.length} pirate ships</small>`;
  showBanner(`Level ${n}: ${def.name}${boss}`, 3);
  updateHud(true);
}

function newGame() {
  state.gold = 0;
  blurActive();
  startLevel(1);
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
  state.bannerTimer = seconds;
}

function finishLevel() {
  // Sweep up any loot still floating around.
  state.gold += coins.length * COIN_VALUE;
  for (const c of coins) scene.remove(c.mesh);
  coins.length = 0;
  state.gold += LEVEL_BONUS * state.level;
  show(ui.banner, false);

  if (state.level >= LEVELS.length) {
    state.mode = 'won';
    const isBest = state.gold > state.best;
    if (isBest) {
      state.best = state.gold;
      saveBest(state.best);
    }
    ui.wonGold.textContent = state.gold;
    show(ui.wonBest, isBest);
    show(ui.won, true);
  } else {
    state.mode = 'levelDone';
    ui.levelSummary.textContent = `Level bonus +${LEVEL_BONUS * state.level} gold. Total plunder: ${state.gold}. Your hull is repaired for the next fight.`;
    show(ui.levelDone, true);
  }
  updateHud(true);
}

function playerSunk() {
  state.mode = 'over';
  if (state.gold > state.best) {
    state.best = state.gold;
    saveBest(state.best);
  }
  ui.overSummary.textContent = `You reached level ${state.level} with ${state.gold} gold. Retrying restores the gold you had at the start of this level.`;
  show(ui.over, true);
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------
// Vertical launch speed needed for a ball in flight for `t` seconds to come down at deck height.
function launchVy(t) {
  return clamp((0.8 - BALL_Y - 0.5 * GRAVITY * t * t) / t, 1, 11);
}

// Position of `target` relative to `ship`: distance along the bow and to starboard.
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

    const mesh = new THREE.Mesh(ballGeo, basicMat(0x1b1b1b));
    mesh.position.set(x, BALL_Y, z);
    scene.add(mesh);
    balls.push({
      mesh,
      owner: ship.kind,
      dmg: t.dmg,
      x,
      y: BALL_Y,
      z,
      vx: dx * BALL_SPEED + svx,
      vy: launchVy(flight) * (0.97 + Math.random() * 0.06),
      vz: dz * BALL_SPEED + svz,
    });
    puff(x, BALL_Y + 0.3, z, 4, 0xe8e8e8, 2, 2, 0.8, 0.9, 1.5, true);
    spawnParticle(0xffb627, x, BALL_Y + 0.2, z, dx * 4, 0.5, dz * 4, 0.12, 0.9, 0);
  }
  ship.reload[key] = t.reload;
  ship.roll -= side * 0.08;
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

function damage(ship, amount, x, z) {
  if (ship.hp <= 0) return;
  ship.hp -= amount;
  puff(x ?? ship.x, 1.4, z ?? ship.z, 8, 0x7a4a1a, 6, 6, 0.45, 0.8);
  puff(x ?? ship.x, 1.6, z ?? ship.z, 3, 0xffb627, 3, 3, 0.4, 0.3, 0);
  if (ship.kind === 'player') {
    state.lastHit = state.time;
    state.shake = Math.max(state.shake, 0.35);
  }
  if (ship.hp <= 0) {
    ship.hp = 0;
    ship.sinking = 0.001;
    puff(ship.x, 1.5, ship.z, 25, 0xff7b00, 8, 8, 0.6, 1.0);
    if (ship.kind === 'enemy') {
      for (let i = 0; i < ship.type.gold; i++) {
        const a = (i / ship.type.gold) * Math.PI * 2;
        const mesh = new THREE.Mesh(coinGeo, coinMat);
        scene.add(mesh);
        coins.push({ mesh, x: ship.x + Math.cos(a) * 2.5, z: ship.z + Math.sin(a) * 2.5, spin: Math.random() * 6 });
      }
      const left = enemies.filter((e) => e.hp > 0).length;
      if (left > 0) showBanner(`Ship sunk! <small>${left} to go</small>`, 1.8);
    } else {
      state.deathTimer = 2.5;
      showBanner('Abandon ship!', 2.5);
    }
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

function updatePlayer(dt) {
  const p = player;
  if (p.sinking) return;
  const t = p.type;
  const turn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const rate = t.turn * (0.35 + 0.65 * Math.min(1, p.speed / t.maxSpeed));
  p.h = wrapAngle(p.h + turn * rate * dt);
  const target = SAIL_LEVELS[state.sail] * t.maxSpeed;
  p.speed += clamp(target - p.speed, -t.accel * dt, t.accel * dt);

  if (state.time - state.lastHit > REGEN_DELAY && p.hp < p.maxHp) {
    p.hp = Math.min(p.maxHp, p.hp + REGEN_RATE * dt);
  }
}

function updateEnemy(e, dt, attacking) {
  if (e.sinking) return;
  const t = e.type;
  const p = player;
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
    if (attacking && state.time > ENEMY_GRACE && r.dist < MAX_RANGE - 4 && Math.abs(r.along) < Math.abs(r.lat) * 0.45) {
      fire(e, r.lat > 0 ? 1 : -1, p, { spread: t.spread, lead: ENEMY_LEAD, rangeErr: 0.88 + Math.random() * 0.24 });
    }
  }

  // Avoid islands: look ahead and turn away from anything in the way.
  const lookX = e.x + fwdX(e.h) * 14;
  const lookZ = e.z + fwdZ(e.h) * 14;
  for (const i of islands) {
    if (Math.hypot(i.x - lookX, i.z - lookZ) < i.r * 1.15 + 6 || Math.hypot(i.x - e.x, i.z - e.z) < i.r * 1.15 + 6) {
      const r = relative(e, i.x, i.z);
      if (r.along > -2) {
        desired = e.h + (r.lat > 0 ? 1.2 : -1.2);
        targetSpeed = Math.min(targetSpeed, t.maxSpeed * 0.6);
      }
    }
  }
  // Stay inside the sea.
  if (Math.hypot(e.x, e.z) > WORLD_R - 15) desired = Math.atan2(-e.x, -e.z);

  steerToward(e, desired, dt);
  e.speed += clamp(targetSpeed - e.speed, -t.accel * dt, t.accel * dt);
}

function moveShip(s, dt) {
  for (const k of ['port', 'star']) s.reload[k] = Math.max(0, s.reload[k] - dt);
  if (s.sinking) {
    s.sinking += dt;
    s.speed *= 1 - Math.min(1, dt * 1.5);
  }
  s.x += fwdX(s.h) * s.speed * dt;
  s.z += fwdZ(s.h) * s.speed * dt;

  // Islands are solid.
  const hullR = s.type.wid * 0.5 + 0.4;
  for (const i of islands) {
    const dx = s.x - i.x;
    const dz = s.z - i.z;
    const d = Math.hypot(dx, dz);
    const min = i.r * 1.15 + hullR;
    if (d < min && d > 0.0001) {
      s.x = i.x + (dx / d) * min;
      s.z = i.z + (dz / d) * min;
      s.speed *= 1 - Math.min(1, dt * 4);
    }
  }
  // Edge of the world.
  const d = Math.hypot(s.x, s.z);
  if (d > WORLD_R) {
    s.x *= WORLD_R / d;
    s.z *= WORLD_R / d;
    if (s.kind === 'player' && state.bannerTimer <= 0) showBanner('Turn back!<small>Rocks ahead</small>', 1.5);
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
  if (s.hp <= 0 || b.y > 3.5) return false;
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
        damage(s, b.dmg, b.x, b.z);
        gone = true;
        break;
      }
    }
    if (!gone) {
      for (const isl of islands) {
        if (b.y < 2.2 && Math.hypot(b.x - isl.x, b.z - isl.z) < isl.r * 1.05) {
          puff(b.x, b.y, b.z, 6, 0xe8d28a, 4, 4, 0.4, 0.6);
          gone = true;
          break;
        }
      }
    }
    if (!gone && b.y <= 0) {
      puff(b.x, 0.2, b.z, 8, 0xffffff, 3, 7, 0.45, 0.7);
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
    if (!player.sinking && (d < 10 || state.clearTimer > 0)) {
      const pull = (state.clearTimer > 0 ? 30 : 14) * dt;
      c.x += (dx / d) * Math.min(pull, d);
      c.z += (dz / d) * Math.min(pull, d);
    }
    if (!player.sinking && d < 3) {
      state.gold += COIN_VALUE;
      puff(c.x, 1.5, c.z, 6, 0xffd23f, 3, 5, 0.3, 0.5);
      scene.remove(c.mesh);
      coins.splice(i, 1);
    }
  }
}

function step(dt) {
  state.time += dt;
  if (player) updatePlayer(dt);
  // The nearest pirates get the attack slots.
  const attackers = new Set(
    enemies
      .filter((e) => e.hp > 0 && player)
      .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))
      .slice(0, MAX_ATTACKERS)
  );
  for (const e of enemies) updateEnemy(e, dt, attackers.has(e));
  if (player) moveShip(player, dt);
  for (const e of enemies) moveShip(e, dt);
  separateShips();
  updateBalls(dt);
  updateCoins(dt);

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
  if (player && !player.sinking && !enemies.some((e) => e.hp > 0)) {
    state.clearTimer = 2.5;
    showBanner(LEVELS[state.level - 1].boss ? 'The galleon is sunk!' : 'Level cleared!', 2.5);
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

$('start-btn').addEventListener('click', newGame);
$('resume-btn').addEventListener('click', togglePause);
$('next-btn').addEventListener('click', nextLevel);
$('retry-btn').addEventListener('click', retryLevel);
$('newgame-btn').addEventListener('click', newGame);
$('again-btn').addEventListener('click', newGame);
$('pause-btn').addEventListener('click', (e) => {
  togglePause();
  e.currentTarget.blur(); // so Space doesn't re-press the button
});

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
  ui.best.textContent = state.best;
  if (!player) return;
  const hpPct = (player.hp / player.maxHp) * 100;
  setWidth(ui.hullFill, 'hp', hpPct, force);
  const color = hpPct > 50 ? '#4cd964' : hpPct > 25 ? '#ffb627' : '#d7263d';
  if (force || shown.hpColor !== color) ui.hullFill.style.background = shown.hpColor = color;
  setText(ui.level, 'level', `${state.level}/${LEVELS.length}`, force);
  setText(ui.ships, 'ships', enemies.filter((e) => e.hp > 0).length, force);
  setText(ui.gold, 'gold', state.gold, force);
  setText(ui.sails, 'sails', '▮'.repeat(state.sail) + '▯'.repeat(SAIL_LEVELS.length - 1 - state.sail), force);
  const t = player.type;
  setWidth(ui.reloadPort, 'rp', (1 - player.reload.port / t.reload) * 100, force);
  setWidth(ui.reloadStar, 'rs', (1 - player.reload.star / t.reload) * 100, force);
}

// Minimap rotates with the ship so "up" is always the bow.
function drawMinimap() {
  const S = ui.minimap.width;
  const c = S / 2;
  const scale = (S / 2 - 4) / (WORLD_R + 10);
  mm.fillStyle = '#1e6fb0';
  mm.fillRect(0, 0, S, S);
  if (!player) return;
  const toMap = (x, z) => {
    const r = relative(player, x, z);
    return [Math.round(c + r.lat * scale), Math.round(c - r.along * scale)];
  };
  // Edge of the sea.
  const [ox, oy] = toMap(0, 0);
  mm.strokeStyle = '#6a6a6a';
  mm.lineWidth = 3;
  mm.beginPath();
  mm.arc(ox, oy, WORLD_R * scale, 0, Math.PI * 2);
  mm.stroke();
  mm.fillStyle = '#e8d28a';
  for (const i of islands) {
    const [x, y] = toMap(i.x, i.z);
    const r = Math.max(2, Math.round(i.r * scale));
    mm.fillRect(x - r, y - r, r * 2, r * 2);
  }
  mm.fillStyle = '#ffd23f';
  for (const co of coins) {
    const [x, y] = toMap(co.x, co.z);
    mm.fillRect(x - 1, y - 1, 2, 2);
  }
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    let [x, y] = toMap(e.x, e.z);
    x = clamp(x, 3, S - 3);
    y = clamp(y, 3, S - 3);
    mm.fillStyle = e.typeName === 'galleon' ? '#000' : '#d7263d';
    mm.fillRect(x - 3, y - 3, 6, 6);
  }
  // The player: a little arrow pointing up.
  mm.fillStyle = '#fff';
  mm.fillRect(c - 1, c - 5, 3, 3);
  mm.fillRect(c - 2, c - 2, 5, 3);
  mm.fillRect(c - 3, c + 1, 7, 3);
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let visualTime = 0;

function syncShip(s, t) {
  const wy = waveHeight(s.x, s.z, t);
  // Pitch from the slope of the waves along the hull.
  const fx = fwdX(s.h);
  const fz = fwdZ(s.h);
  const ahead = waveHeight(s.x + fx * 2, s.z + fz * 2, t);
  const behind = waveHeight(s.x - fx * 2, s.z - fz * 2, t);
  s.roll *= 0.92;
  const sink = s.sinking ? Math.min(s.sinking, 4) : 0;
  s.mesh.position.set(s.x, wy - 0.3 - sink * 1.4, s.z);
  s.mesh.rotation.set(0, 0, 0);
  s.mesh.rotation.y = s.h;
  s.mesh.rotateX(-(ahead - behind) * 0.12 + sink * 0.1);
  s.mesh.rotateZ(Math.sin(t * 1.3 + s.x) * 0.04 + s.roll + sink * 0.25);
  if (s.sinking && Math.random() < 0.5) {
    spawnParticle(Math.random() < 0.5 ? 0xff7b00 : 0x444444, s.x + (Math.random() - 0.5) * 3, 2 - sink, s.z + (Math.random() - 0.5) * 3, 0, 3, 0, 0.8, 0.7, 0, true);
  }
  if (s.bar) {
    s.bar.visible = s.hp > 0;
    s.bar.position.set(s.x, wy + 4 + s.type.len * 0.42, s.z);
    s.bar.quaternion.copy(camera.quaternion);
    setHealthBar(s.bar, s.hp / s.maxHp);
  }
  // Wake behind moving ships.
  if (s.speed > 2 && !s.sinking && Math.random() < s.speed / 30) {
    const bx = s.x - fx * s.type.len * 0.5;
    const bz = s.z - fz * s.type.len * 0.5;
    spawnParticle(0xffffff, bx + (Math.random() - 0.5) * 2, 0.2, bz + (Math.random() - 0.5) * 2, 0, 0.3, 0, 1.2, 0.5, 0);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      particles.splice(i, 1);
      continue;
    }
    p.vy += p.grav * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    const k = p.life / p.max;
    p.mesh.scale.setScalar(p.grow ? p.size * (1.6 - k * 0.6) * Math.min(1, k * 3) : p.size * k);
  }
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), MAX_FRAME_DT);
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

  // Ocean waves.
  for (let i = 0; i < oceanPos.count; i++) {
    oceanPos.setY(i, waveHeight(oceanPos.getX(i), oceanPos.getZ(i), t));
  }
  oceanPos.needsUpdate = true;

  if (!paused) updateParticles(dt);
  if (player) syncShip(player, t);
  for (const e of enemies) syncShip(e, t);
  for (const b of balls) b.mesh.position.set(b.x, b.y, b.z);
  for (const c of coins) {
    c.mesh.position.set(c.x, waveHeight(c.x, c.z, t) + 0.6, c.z);
    c.mesh.rotation.y = t * 3 + c.spin;
  }
  for (const c of clouds) {
    c.position.x += dt * 1.5;
    if (c.position.x > 200) c.position.x = -200;
  }

  // Camera: a chase cam behind the player, or a slow orbit on the menu.
  if (player) {
    const fx = fwdX(player.h);
    const fz = fwdZ(player.h);
    const tx = player.x - fx * 17;
    const tz = player.z - fz * 17;
    const k = Math.min(1, dt * 3);
    camera.position.x += (tx - camera.position.x) * k;
    camera.position.z += (tz - camera.position.z) * k;
    camera.position.y += (10 - camera.position.y) * k;
    if (state.shake > 0) {
      if (!paused) state.shake = Math.max(0, state.shake - dt);
      camera.position.x += (Math.random() - 0.5) * state.shake;
      camera.position.y += (Math.random() - 0.5) * state.shake;
    }
    camera.lookAt(player.x + fx * 8, 1.5, player.z + fz * 8);
  } else {
    camera.position.set(Math.sin(t * 0.1) * 40, 18, Math.cos(t * 0.1) * 40);
    camera.lookAt(0, 0, 0);
  }

  if (state.mode !== 'menu') {
    updateHud();
    drawMinimap();
  }
  renderer.render(scene, camera);
}

// A decorative ship for the title screen.
const menuShip = buildShip(SHIP_TYPES.galleon, true);
scene.add(menuShip);
const menuIslands = mulberry32(3);
for (let i = 0; i < 3; i++) {
  const isl = buildIsland(5 + i * 2, menuIslands);
  isl.position.set(Math.cos(i * 2.1) * 26, 0, Math.sin(i * 2.1) * 26);
  scene.add(isl);
  islands.push({ x: isl.position.x, z: isl.position.z, r: 5 + i * 2, mesh: isl });
}
const menuAnimate = () => {
  if (state.mode !== 'menu') {
    scene.remove(menuShip);
    return;
  }
  menuShip.position.y = waveHeight(0, 0, visualTime) - 0.3;
  menuShip.rotation.y = visualTime * 0.2;
  menuShip.rotation.z = Math.sin(visualTime * 1.3) * 0.05;
  requestAnimationFrame(menuAnimate);
};
menuAnimate();

updateHud(true);
frame();

// Exposed for automated tests and console tinkering.
window.__game = {
  state,
  input,
  enemies,
  balls,
  coins,
  islands,
  LEVELS,
  SHIP_TYPES,
  get player() {
    return player;
  },
  newGame,
  startLevel,
  nextLevel,
  retryLevel,
  togglePause,
  changeSail,
  playerFire,
  fire,
  damage,
  relative,
  step,
};
