import * as THREE from 'three';
import { SHIP_TYPES, gunOffset } from './shipTypes.js';
import { buildShip, animateShip, disposeShip } from './ships.js';
import { createRenderer, createOcean, createSky, createClouds, createLights, applyPalette } from './scenery.js';
import { toon, noOutline, gradientMap } from './style.js';
import { createAudio } from './audio.js';
import { animatePerson } from './people.js';
import * as sparrow from './env/sparrow.js';
import { LEVELS } from './levels.js';
import {
  UPGRADES,
  LOOKS,
  defaultShipConfig,
  parseShipConfig,
  serializeShipConfig,
  maxTier,
  nextCost,
  playerType,
  statText,
} from './upgrades.js';

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
const SAIL_NAMES = ['Stopped', 'Slow', 'Cruising', 'Full sail'];
const COIN_VALUE = 10;
const REGEN_DELAY = 5; // seconds without damage before the hull repairs itself (ships without their own value)
const REGEN_RATE = 2; // hp per second (ships without their own value; the player's comes from the carpenter upgrade)
const WAIT_DIST = 50; // distance waiting pirates keep from the player
const WAVE_REPAIR = 0.35; // fraction of the hull your crew patches when reinforcements arrive
const REEF_SLOW = 0.45; // speed multiplier for deep-hulled ships on a reef
const BOMB_RADIUS = 5; // lava bomb blast radius
const BOMB_DAMAGE = 16;
const PARTICLE_CAP = 600;
const AMBIENT_CAP = PARTICLE_CAP - 150; // wakes and smoke leave room for combat effects
const INTRO_TIME = 3.6; // seconds of the camera fly-in at the start of a level
const CHASE_BACK = 17; // chase camera: distance behind the ship
const CHASE_UP = 10; // chase camera: height
const CHASE_AHEAD = 8; // chase camera: look this far ahead of the ship
const BEST_KEY = 'pirates-ahoy-best';
const PROGRESS_KEY = 'pirates-ahoy-unlocked';
const TUTOR_KEY = 'pirates-ahoy-tutorial-done';
const PURSE_KEY = 'pirates-ahoy-purse'; // the treasure chest: banked gold to spend at the shipyard
const SHIP_KEY = 'pirates-ahoy-ship'; // the player's upgrades and paint (see upgrades.js)

// The levels (environment, enemy waves, difficulty knobs, audio scene, finale) live in levels.js.
// Beating a finale level wins the voyage (the Victory screen); so does beating the last level.
const isFinale = (n) => !!LEVELS[n - 1]?.finale || n >= LEVELS.length;

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

const isTouch = () => window.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false;

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
// Optional elements fall back to a detached div, so a missing one never breaks the game.
const $ = (id) => document.getElementById(id) || document.createElement('div');
const ui = {
  canvas: $('game'),
  hud: $('hud'),
  hullCard: $('hull-card'),
  hullFill: $('hull-fill'),
  hullGhost: $('hull-ghost'),
  levelName: $('level-name'),
  ships: $('ships'),
  gold: $('gold'),
  reloadPort: $('reload-port'),
  reloadStar: $('reload-star'),
  gunPort: $('gun-port'),
  gunStar: $('gun-star'),
  sails: $('sails'),
  minimap: $('minimap'),
  boss: $('boss'),
  bossName: $('boss-name'),
  bossFill: $('boss-fill'),
  banner: $('banner'),
  hint: $('hint'),
  edge: $('edge'),
  hitmark: $('hitmark'),
  muteBtn: $('mute-btn'),
  menuMute: $('menu-mute'),
  dockMute: $('dock-mute'),
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
  wonChest: $('won-chest'),
  best: $('best'),
  menuChest: $('menu-chest'),
  dock: $('dock-screen'),
  dockPanel: $('dock-panel'),
  dockChest: $('dock-chest'),
  dockChestGold: $('dock-chest-gold'),
  dockTabs: [...document.querySelectorAll('#dock-screen [role="tab"]')],
  dockUpList: $('dock-up-list'),
  dockPaint: $('dock-paint-groups'),
  dockExits: $('dock-exits'),
  dockLive: $('dock-live'),
  dockToast: $('dock-toast'),
  error: $('error-screen'),
  recover: $('recover-screen'),
  recoverTitle: $('recover-title'),
  recoverMsg: $('recover-msg'),
  recoverBtn: $('recover-btn'),
};
const mm = ui.minimap.getContext ? ui.minimap.getContext('2d') : null;

function show(el, visible) {
  el.classList.toggle('hidden', !visible);
  // A hidden button must not keep keyboard focus (it would swallow Enter/Space).
  if (!visible && el.contains(document.activeElement) && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

// Restart a CSS animation class on an element.
function retrigger(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// Saved records are plain decimal integers in [min, max]. Anything else (missing, garbage, NaN,
// Infinity, negative, fractional, absurdly large) falls back to `fallback`; integers outside the
// range are clamped (e.g. progress saved by a version with more levels). Bad records are rewritten.
const MAX_GOLD = 1_000_000;
function loadInt(key, min, max, fallback) {
  let raw;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return fallback; // storage blocked
  }
  if (raw === null) return fallback;
  const text = raw.trim();
  let value = fallback;
  if (/^-?\d{1,16}$/.test(text)) {
    const n = Number(text);
    if (Number.isSafeInteger(n)) value = clamp(n, min, max);
  }
  if (String(value) !== raw) saveNumber(key, value);
  return value;
}

// The chest and ship records as this tab last read or wrote them (see syncSaved).
const seen = { [PURSE_KEY]: null, [SHIP_KEY]: null };
function readRaw(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked
  }
}

function saveNumber(key, v) {
  try {
    localStorage.setItem(key, String(v));
    if (key in seen) seen[key] = String(v);
    return true;
  } catch {
    return false; // storage blocked or full: progress just won't persist
  }
}

// The ship's upgrades and paint. parseShipConfig() validates field by field (bad tiers or unknown
// paints fall back to the defaults) and never throws; a record that needed fixing is rewritten.
function loadShipConfig() {
  let raw;
  try {
    raw = localStorage.getItem(SHIP_KEY);
  } catch {
    return defaultShipConfig(); // storage blocked
  }
  const config = parseShipConfig(raw);
  if (raw !== null && serializeShipConfig(config) !== raw) saveShipConfig(config);
  return config;
}

function saveShipConfig(config) {
  try {
    const text = serializeShipConfig(config);
    localStorage.setItem(SHIP_KEY, text);
    seen[SHIP_KEY] = text;
    return true;
  } catch {
    return false; // storage blocked or full: the shipyard work just won't persist
  }
}

// The saved chest never pays for an upgrade the saved ship record doesn't have. When storage is full
// (a write that grows it fails) a purchase still lasts for this visit, but its gold stays in the saved
// chest: `unsavedSpend` is that gold. Every later save of the chest tries the ship record again first,
// and the two are only saved without that gold together.
let unsavedSpend = 0;
function saveChest() {
  if (unsavedSpend > 0) {
    const before = readRaw(SHIP_KEY);
    if (saveShipConfig(shipConfig)) {
      if (saveNumber(PURSE_KEY, state.purse)) {
        unsavedSpend = 0;
        return true;
      }
      // The chest couldn't follow: put the ship record back the way it was.
      try {
        if (before === null) localStorage.removeItem(SHIP_KEY);
        else localStorage.setItem(SHIP_KEY, before);
        seen[SHIP_KEY] = before;
      } catch {
        // storage blocked
      }
    }
  }
  return saveNumber(PURSE_KEY, clamp(state.purse + unsavedSpend, 0, MAX_GOLD));
}

// Generic saved record (validated by its module, like the ship record): `parse(raw)` never throws and
// gives the defaults for a missing record; a record that needed fixing is rewritten.
function loadRecord(key, parse, serialize) {
  let raw;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return parse(null); // storage blocked: defaults for this visit
  }
  const value = parse(raw);
  if (raw !== null && serialize(value) !== raw) saveRecord(key, serialize, value);
  return value;
}
function saveRecord(key, serialize, value) {
  try {
    localStorage.setItem(key, serialize(value));
    return true;
  } catch {
    return false; // storage blocked or full: it just won't persist
  }
}

// Another tab of the game may have banked gold or changed the ship since this one last read or
// wrote them: take those records before changing anything, so neither tab undoes the other's work.
// (Upgrades bought here but not saved yet stay paid for out of the chest the other tab saved; if the
// other tab saved a ship record, that one is taken and their gold goes back.) Returns whether anything changed.
function syncSaved() {
  let changed = false;
  const rawPurse = readRaw(PURSE_KEY);
  if (rawPurse !== null && rawPurse !== seen[PURSE_KEY]) {
    const purse = clamp(loadInt(PURSE_KEY, 0, MAX_GOLD, state.purse + unsavedSpend) - unsavedSpend, 0, MAX_GOLD);
    seen[PURSE_KEY] = readRaw(PURSE_KEY);
    changed = purse !== state.purse;
    state.purse = purse;
  }
  const rawShip = readRaw(SHIP_KEY);
  if (rawShip !== null && rawShip !== seen[SHIP_KEY]) {
    seen[SHIP_KEY] = rawShip;
    const config = parseShipConfig(rawShip);
    if (serializeShipConfig(config) !== serializeShipConfig(shipConfig)) {
      shipConfig = config;
      changed = true;
    }
    if (unsavedSpend > 0) {
      state.purse = clamp(state.purse + unsavedSpend, 0, MAX_GOLD);
      unsavedSpend = 0;
      changed = true;
    }
  }
  return changed;
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

// ---------------------------------------------------------------------------
// Sound (recorded music where there is some, everything else synthesised: see audio.js)
// ---------------------------------------------------------------------------
const audio = createAudio();
// Browsers only start audio from a user gesture. Capture phase, so it runs before the button/key handlers.
for (const type of ['pointerdown', 'keydown', 'touchend']) {
  window.addEventListener(type, () => audio.unlock(), { capture: true, passive: true });
}
// Menu buttons click (the on-screen sail/fire buttons have their own sounds).
document.addEventListener('click', (e) => {
  if (e.target instanceof Element && e.target.closest('button:not([data-hold]):not([data-tap])')) audio.play('click');
});

// Where a sound is for the listener: distance from the player's ship (from the camera when there is no
// ship) and stereo pan from the camera's right-hand direction, so screen-right sounds come from the right.
function sfxAt(x, z, extra) {
  const lx = player ? player.x : camera.position.x;
  const lz = player ? player.z : camera.position.z;
  const dx = x - lx;
  const dz = z - lz;
  const d = Math.hypot(dx, dz);
  const e = camera.matrixWorld.elements; // column 0 = camera right vector (world space)
  const pan = d > 1 ? clamp((dx * e[0] + dz * e[2]) / (Math.hypot(e[0], e[2]) * d || 1), -1, 1) * 0.8 : 0;
  return extra ? { distance: d, pan, ...extra } : { distance: d, pan };
}

function updateMuteButtons() {
  for (const btn of [ui.muteBtn, ui.menuMute, ui.dockMute]) {
    btn.classList.toggle('muted', audio.muted);
    btn.setAttribute('aria-pressed', String(audio.muted));
    btn.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
  }
}
function toggleMute() {
  audio.setMuted(!audio.muted);
  updateMuteButtons();
}

// ---------------------------------------------------------------------------
// Adaptive resolution: if frames are slow, render fewer pixels (the HUD stays sharp).
// Each step down must prove it helped, otherwise it is undone: a frame-rate cap
// (30 Hz power saving, vsync) or a CPU limit is not fixed by fewer pixels.
// ?quality=high keeps full resolution, ?quality=low starts at the lowest step.
// ---------------------------------------------------------------------------
const QUALITY_STEPS = [1, 0.85, 0.7, 0.55, 0.45];
const qualityParam = new URLSearchParams(location.search).get('quality');
const perf = {
  level: qualityParam === 'low' ? QUALITY_STEPS.length - 1 : 0,
  fixed: qualityParam === 'high' || qualityParam === 'low',
  frames: 0,
  time: 0,
  settle: 2,
  best: Infinity, // fastest window average seen (about the display's refresh period)
  pending: 0, // average that triggered the last step down, until we know whether it helped
  floor: 0, // frame time we learned resolution can't improve
  upHold: 6, // seconds of steady frames needed before trying a higher resolution
  probing: false, // the last change was a step up
  typical: 0, // smoothed recent frame time, to tell a one-off hitch from a slow device
};
let pausedDrawn = false;

function resetPerfWindow(settle) {
  perf.frames = 0;
  perf.time = 0;
  perf.settle = Math.max(perf.settle, settle);
}

function resize() {
  view.setSize(window.innerWidth, window.innerHeight);
  const q = QUALITY_STEPS[perf.level];
  if (q < 1) {
    view.renderer.setPixelRatio(view.renderer.getPixelRatio() * q);
    view.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }
  setLens();
  pausedDrawn = false;
  menuLayout = null;
  dockLayout = null;
}

// The game's normal lens for the window (the shipyard view sets its own, see dockFraming()).
function setLens() {
  camera.aspect = window.innerWidth / window.innerHeight;
  // Keep enough sideways view on portrait screens to see a broadside target.
  const minFov = (2 * Math.atan(Math.tan((35 * Math.PI) / 180) / camera.aspect) * 180) / Math.PI;
  camera.fov = clamp(minFov, 55, 90);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// Called every frame with the real (unclamped) frame time.
function trackPerformance(rawDt) {
  if (perf.fixed || document.hidden || state.mode === 'paused') return;
  // A lone long frame (level load, GC) is a hitch, not slowness. On a slow device every
  // frame is long, so compare against the recent typical frame time.
  const prev = perf.typical;
  perf.typical = prev ? prev * 0.9 + Math.min(rawDt, 2) * 0.1 : Math.min(rawDt, 0.25);
  if (rawDt > 0.25 && prev && rawDt > prev * 4) {
    resetPerfWindow(0.5);
    return;
  }
  if (perf.settle > 0) {
    perf.settle -= rawDt; // ignore shader compiles and level loads
    return;
  }
  perf.frames++;
  perf.time += rawDt;
  if (perf.time < 2 || perf.frames < 20) return;
  const avg = perf.time / perf.frames;
  perf.best = Math.min(perf.best, avg);
  const max = QUALITY_STEPS.length - 1;
  let change = 0; // +1 = lower resolution, -1 = higher
  if (perf.pending) {
    if (avg > perf.pending * 0.9) {
      change = -1; // fewer pixels didn't help: undo and remember this frame time
      perf.floor = perf.pending;
    }
    perf.pending = 0;
    perf.probing = false;
  } else if (perf.level < max && avg > 1 / 38 && (!perf.floor || avg > perf.floor * 1.2)) {
    change = 1;
    perf.pending = avg;
    if (perf.probing) perf.upHold = Math.min(120, perf.upHold * 2); // the last step up didn't hold
    perf.probing = false;
  } else if (perf.level > 0 && avg <= perf.best * 1.12 && avg < 1 / 40) {
    if (perf.time < perf.upHold) return; // need a long steady window before trying higher
    change = -1;
    perf.probing = true;
  } else if (perf.time < 5) {
    return;
  } else if (perf.probing) {
    perf.probing = false;
    perf.upHold = 6; // the step up held
  }
  if (change) {
    perf.level = clamp(perf.level + change, 0, max);
    resize();
  }
  perf.frames = 0;
  perf.time = 0;
  perf.settle = 0.5;
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
let shipConfig = loadShipConfig(); // upgrades bought and paint chosen at the shipyard

const state = {
  mode: 'menu', // menu | playing | paused | levelDone | over | won | dock
  level: 1,
  wave: 0,
  gold: 0,
  goldAtLevelStart: 0,
  sunk: 0, // ships sunk this level
  best: loadInt(BEST_KEY, 0, MAX_GOLD, 0),
  purse: loadInt(PURSE_KEY, 0, MAX_GOLD, 0), // the treasure chest: gold banked from cleared levels
  banked: 0, // gold banked when the last level was cleared
  unlocked: loadInt(PROGRESS_KEY, 1, LEVELS.length, 1),
  tutorialDone: loadInt(TUTOR_KEY, 0, 1, 0) === 1,
  time: 0, // simulated seconds since level start
  combatTime: 0, // simulated seconds since the fly-in ended
  sail: 2,
  lastHit: -99,
  clearTimer: 0, // counts down after the last enemy sinks
  deathTimer: 0, // counts down while the player's ship sinks
  nextBomb: 0,
  bombWarned: false,
  shake: 0,
  bannerTimer: 0,
  contextLost: false, // the WebGL context is gone (see onContextLost)
  intro: 0, // seconds left of the level fly-in
  introRate: 1, // > 1 while the player skips the fly-in
  hurtBy: {}, // damage the player took this level, by source
  lastBossSunk: '',
  regenShown: false,
  edgeCooldown: 0,
  ghostHold: 0,
  ghostPct: 100,
  hint: { step: 0, t: 0, offBeam: 0, hits: 0, text: '' },
};
seen[PURSE_KEY] = readRaw(PURSE_KEY);
seen[SHIP_KEY] = readRaw(SHIP_KEY);

const input = { left: false, right: false };
let player = null;
let env = null; // the current level environment (see src/env/*.js)
let foamColor = 0xffffff;
const enemies = [];
const balls = [];
const coins = [];
const colliders = []; // [{x, z, r, h}] from the environment
const reefs = []; // [{x, z, r}]
const bombs = [];
const volleys = new Map(); // player broadsides in flight: id -> {side, hits, sunk, left}
let volleyId = 0;

// ---------------------------------------------------------------------------
// Particles: two instanced pools (lit puffs and unlit glows/foam), no outlines.
// ---------------------------------------------------------------------------
const particleGeo = new THREE.IcosahedronGeometry(1, 2);
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
const smokeLight = new THREE.Color(0xeeeaf2);
const dummy = new THREE.Object3D();

function spawnParticle(kind, color, x, y, z, vx, vy, vz, life, size, grav = GRAVITY, grow = false, flat = false, ambient = false) {
  const pool = pools[kind];
  if (pool.items.length >= (ambient ? AMBIENT_CAP : PARTICLE_CAP)) return;
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

// Unlit white-water spray, tinted to match the level's foam.
function foam(x, y, z, n, spread, up, size, life) {
  puff(x, y, z, n, foamColor, spread, up, size, life, GRAVITY, false, 'glow');
}

function updateParticles(dt) {
  const cx = camera.position.x;
  const cy = camera.position.y;
  const cz = camera.position.z;
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
      let s = p.grow ? p.size * (1.7 - f * 0.7) * Math.min(1, f * 4) : p.size * Math.min(1, f * 1.5);
      // Shrink puffs right in front of the lens instead of filling the screen with them.
      const near = Math.hypot(p.x - cx, p.y - cy, p.z - cz);
      if (near < 8) s *= clamp((near - 2.5) / 5.5, 0, 1);
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rot, p.rot * 0.7, 0);
      dummy.scale.set(s, p.flat ? s * 0.3 : s, s);
      dummy.updateMatrix();
      pool.mesh.setMatrixAt(k, dummy.matrix);
      tmpColor.setHex(p.color);
      if (p.grow) tmpColor.lerp(smokeLight, (1 - f) * 0.6); // smoke thins and lightens as it rises
      pool.mesh.setColorAt(k, tmpColor);
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
function drawLabel(canvas, text) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '40px "Luckiest Guy", "Fredoka", "Comic Sans MS", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#1d1330';
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2 + 2);
  ctx.fillStyle = '#fff4d6';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
}
function labelTexture(typeName) {
  let entry = labelCache.get(typeName);
  if (!entry) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 80;
    const text = SHIP_TYPES[typeName].name;
    drawLabel(canvas, text);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    entry = { canvas, tex, text };
    labelCache.set(typeName, entry);
  }
  return entry.tex;
}
// Re-draw labels once the cartoon font has loaded (fonts load late, without blocking the page).
function redrawLabels() {
  for (const e of labelCache.values()) {
    drawLabel(e.canvas, e.text);
    e.tex.needsUpdate = true;
  }
}
document.fonts?.ready.then(redrawLabels);
document.fonts?.addEventListener?.('loadingdone', redrawLabels);

const barBgMat = noOutline(new THREE.MeshBasicMaterial({ color: 0x1d1330, fog: false }));
const barFgMat = noOutline(new THREE.MeshBasicMaterial({ color: 0xe63946, fog: false }));
const barGeoBg = new THREE.PlaneGeometry(4.4, 0.75);
const barGeoFg = new THREE.PlaneGeometry(4, 0.4);
const labelMats = new Map();
function buildTag(typeName) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(barGeoBg, barBgMat);
  const fg = new THREE.Mesh(barGeoFg, barFgMat);
  fg.position.z = 0.01;
  // Only the glyph pixels write depth, so the outline pass can't smear ink over the name.
  let mat = labelMats.get(typeName);
  if (!mat) {
    mat = new THREE.SpriteMaterial({ map: labelTexture(typeName), fog: false, depthWrite: true, alphaTest: 0.4 });
    labelMats.set(typeName, mat);
  }
  const label = new THREE.Sprite(mat);
  label.scale.set(8, 1.25, 1);
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

// Height of the tallest part of each ship type (masts and flags), measured once.
const tagHeights = {};
function tagHeight(typeName, mesh) {
  if (tagHeights[typeName] == null) tagHeights[typeName] = new THREE.Box3().setFromObject(mesh, true).max.y + 1.2;
  return tagHeights[typeName];
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------
// The player's ship with the upgrades bought at the shipyard: gameplay stats and model.
function playerStats() {
  return playerType(SHIP_TYPES.player, shipConfig);
}
function buildPlayerMesh(type = playerStats()) {
  return buildShip('player', { type, look: shipConfig.look, upgrades: shipConfig.up });
}

function createShip(typeName, kind, x, z, h) {
  const isPlayer = kind === 'player' && typeName === 'player';
  const type = isPlayer ? playerStats() : SHIP_TYPES[typeName];
  const mesh = isPlayer ? buildPlayerMesh(type) : buildShip(typeName);
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
    tagY: tagHeight(typeName, mesh),
    flash: 0,
    wakeAcc: 0,
    sprayAcc: 0,
    smokeAcc: 0,
    pinned: 0,
    escapeUntil: 0,
    escapeH: 0,
  };
  scene.add(mesh);
  // The boss has its own HUD bar, so it gets no floating tag.
  if (kind === 'enemy' && !type.boss) {
    ship.tag = buildTag(typeName);
    scene.add(ship.tag);
  }
  return ship;
}

function removeShip(s) {
  disposeShip(s.mesh);
  if (s.tag) scene.remove(s.tag);
}

const ballGeo = new THREE.SphereGeometry(0.34, 12, 8);
const ballMat = toon(0x2b2b38);
const coinGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.2, 20);
const coinMat = toon(0xffc93c, { emissive: 0x6b4a00, emissiveIntensity: 0.5 });
const bombGeo = new THREE.IcosahedronGeometry(1.1, 1);
const bombMat = toon(0x3a2a2a, { emissive: 0xff5a1f, emissiveIntensity: 0.9 });

// Lava bomb danger zone: a thick ring (plus a ghost copy that shows through anything in
// front of it, like your own sails) and a filling disc that shows the time to impact.
const zoneRingGeo = new THREE.RingGeometry(BOMB_RADIUS - 1.6, BOMB_RADIUS, 48).rotateX(-Math.PI / 2);
const zoneDiscGeo = new THREE.CircleGeometry(BOMB_RADIUS, 48).rotateX(-Math.PI / 2);
const zoneRingMat = noOutline(new THREE.MeshBasicMaterial({ color: 0xff3b1f, transparent: true, opacity: 0.8, depthWrite: false }));
const zoneGhostMat = noOutline(
  new THREE.MeshBasicMaterial({ color: 0xff3b1f, transparent: true, opacity: 0.35, depthWrite: false, depthFunc: THREE.GreaterDepth })
);
const zoneDiscMat = noOutline(new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.3, depthWrite: false }));
function buildZone() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(zoneRingGeo, zoneRingMat);
  const ghost = new THREE.Mesh(zoneRingGeo, zoneGhostMat);
  const disc = new THREE.Mesh(zoneDiscGeo, zoneDiscMat);
  ring.renderOrder = ghost.renderOrder = disc.renderOrder = 5;
  g.add(disc, ring, ghost);
  g.userData.disc = disc;
  return g;
}

function removeBomb(b) {
  scene.remove(b.mesh);
  scene.remove(b.zone);
  b.whistle.stop();
}

function clearProjectiles(enemyOnly = false) {
  for (let i = balls.length - 1; i >= 0; i--) {
    if (enemyOnly && balls[i].owner === 'player') continue;
    scene.remove(balls[i].mesh);
    balls.splice(i, 1);
  }
  for (const b of bombs) removeBomb(b);
  bombs.length = 0;
}

function clearLevelEntities() {
  for (const e of enemies) removeShip(e);
  if (player) removeShip(player);
  clearProjectiles();
  for (const c of coins) scene.remove(c.mesh);
  enemies.length = coins.length = 0;
  volleys.clear();
  player = null;
  clearParticles();
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------
function loadEnvironment(n) {
  setEnvironment(LEVELS[n - 1].env, n * 7919 + 13);
}

// Build an environment module (a level, or Sparrow's Floating Island for the shipyard).
function setEnvironment(mod, seed) {
  if (env) env.dispose();
  env = mod.build(scene, { rng: mulberry32(seed) });
  colliders.length = 0;
  for (const c of env.colliders) colliders.push({ h: 3, ...c });
  reefs.length = 0;
  if (env.reefs) reefs.push(...env.reefs);
  ocean.setFoam(colliders);
  applyPalette(scene, mod.palette, { ocean, sky, clouds, lights });
  foamColor = mod.palette.waterFoam ?? 0xffffff;
  // A new scene costs differently (the shipyard's crowd barely gains from fewer pixels, a level does):
  // forget what the last one taught the adaptive resolution.
  perf.floor = 0;
  perf.pending = 0;
  perf.probing = false;
  resetPerfWindow(1.5);
}

// "the Coast of Europe", "the Bali Islands", "the Volcano".
function placeName(meta) {
  return meta.place ?? `the ${meta.name.replace(/^The /, '')}`;
}

function freeSpot(x, z, clearance) {
  return colliders.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + clearance);
}

const frustum = new THREE.Frustum();
const projScreen = new THREE.Matrix4();
const spawnSphere = new THREE.Sphere();

// Pick spawn points for a wave. The opening wave uses the environment's spread-out
// points. Reinforcements appear 65-100 units away, preferably off-screen on a flank.
function pickSpawns(count, index) {
  const px = player ? player.x : env.playerStart.x;
  const pz = player ? player.z : env.playerStart.z;
  const used = [];
  const spaced = (s) =>
    used.every((u) => Math.hypot(u.x - s.x, u.z - s.z) > 18) &&
    enemies.every((e) => e.hp <= 0 || Math.hypot(e.x - s.x, e.z - s.z) > 18);
  const inReef = (s) => reefs.some((r) => Math.hypot(r.x - s.x, r.z - s.z) < r.r + 4);
  const valid = (s) => Math.hypot(s.x, s.z) < env.worldRadius - 16 && freeSpot(s.x, s.z, 12) && !inReef(s);

  if (index === 0 || !player) {
    const candidates = env.enemySpawns.filter((s) => freeSpot(s.x, s.z, 6));
    for (const minPlayer of [55, 40, 25, 0]) {
      for (const s of candidates) {
        if (used.length >= count) break;
        if (!used.includes(s) && Math.hypot(s.x - px, s.z - pz) >= minPlayer && spaced(s)) used.push(s);
      }
    }
  } else {
    camera.updateMatrixWorld();
    projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreen);
    const candidates = [...env.enemySpawns];
    for (let a = 0; a < 36; a++) {
      for (const d of [65, 80, 95]) {
        const ang = (a / 36) * Math.PI * 2;
        candidates.push({ x: px + Math.sin(ang) * d, z: pz + Math.cos(ang) * d });
      }
    }
    const scored = candidates
      .filter(valid)
      .map((s) => {
        const r = relative(player, s.x, s.z);
        const off = Math.abs(Math.atan2(r.lat, r.along)); // 0 = dead ahead, PI = astern
        const visible = frustum.intersectsSphere(spawnSphere.set(new THREE.Vector3(s.x, 2, s.z), 8));
        let score = 0;
        if (!visible) score += 10;
        if (off > Math.PI / 2 && off < (5 * Math.PI) / 6) score += 4; // the flanks
        if (r.dist >= 65 && r.dist <= 100) score += 3;
        return { s, score: score - Math.abs(r.dist - 80) * 0.02 + Math.random() * 0.5 };
      })
      .sort((a, b) => b.score - a.score);
    for (const { s } of scored) {
      if (used.length >= count) break;
      if (spaced(s)) used.push(s);
    }
  }
  // Fall back to reusing points (offset) if nothing else fits.
  const pool = env.enemySpawns.filter((s) => freeSpot(s.x, s.z, 6));
  while (used.length < count) {
    const s = pool[used.length % pool.length];
    used.push({ x: s.x + rand(-6, 6), z: s.z + rand(-6, 6) });
  }
  return used;
}

function spawnWave(index) {
  const def = LEVELS[state.level - 1];
  const wave = def.waves[index];
  const spots = pickSpawns(wave.length, index);
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
    audio.play('wave', { pitch: boss ? 0.8 : 1 });
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

function controlsLine() {
  return isTouch()
    ? 'Hold &#9664; &#9654; to steer &middot; + &minus; for sails &middot; Fire buttons shoot sideways'
    : 'Steer <kbd>A</kbd><kbd>D</kbd> &middot; Sails <kbd>W</kbd><kbd>S</kbd> &middot; Fire <kbd>Q</kbd> / <kbd>E</kbd>. Cannons fire sideways!';
}

function startLevel(n, { retry = false } = {}) {
  if (activeModal() && !state.contextLost) closeModal(modal);
  closeDock();
  clearLevelEntities();
  if (menuShipMesh) {
    disposeShip(menuShipMesh);
    menuShipMesh = null;
  }
  camera.clearViewOffset();
  state.level = n;
  state.wave = 0;
  state.time = 0;
  state.combatTime = 0;
  state.sail = 2;
  state.sunk = 0;
  state.hurtBy = {};
  state.lastHit = -99;
  state.clearTimer = 0;
  state.deathTimer = 0;
  state.shake = 0;
  state.lastBossSunk = '';
  state.ghostHold = 0;
  state.ghostPct = 100;
  state.hint = { step: 0, t: 0, offBeam: 0, hits: 0, text: '' };
  if (!retry) state.bombWarned = false;
  state.goldAtLevelStart = state.gold;
  clearSteering();

  loadEnvironment(n);
  const def = LEVELS[n - 1];
  const ps = env.playerStart;
  player = createShip('player', 'player', ps.x, ps.z, ps.h);
  state.nextBomb = def.bombs ? def.grace + rand(...def.bombs.every) : Infinity;
  spawnWave(0);
  snapCamera();
  state.intro = retry ? 0 : INTRO_TIME;
  state.introRate = 1;

  state.mode = 'playing';
  pausedDrawn = false;
  for (const el of [ui.menu, ui.pause, ui.levelDone, ui.over, ui.won, ui.dock]) show(el, false);
  show(ui.hud, true);
  show(ui.hint, false);
  audio.setScene(def.scene);
  if (!retry) audio.play('wave');
  const m = def.env.meta;
  const firstVoyage = n === 1 && !state.tutorialDone;
  if (retry) {
    showBanner(`Try again!<small>${describeWave(def.waves[0])}</small>`, 2);
  } else {
    const sub = firstVoyage ? controlsLine() : def.mechanic ?? m.subtitle;
    showBanner(`Level ${n}: ${m.name}<small>${sub}</small><small>${describeWave(def.waves[0])}</small>`, firstVoyage ? 6 : 4.5);
  }
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
  startLevel(state.level, { retry: true });
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
  retrigger(ui.banner, 'pop');
  state.bannerTimer = seconds;
}

function finishLevel() {
  clearProjectiles();
  // Sweep up any loot still floating around.
  state.gold += coins.length * COIN_VALUE;
  for (const c of coins) scene.remove(c.mesh);
  coins.length = 0;
  const def = LEVELS[state.level - 1];
  state.gold += def.bonus;
  show(ui.banner, false);
  show(ui.hint, false);
  // This level's earnings (loot and bonus) go into the treasure chest for the shipyard.
  // (Gold from an attempt that is lost is never banked: a retry restores the voyage gold.)
  bankGold(state.gold - state.goldAtLevelStart);
  const banked =
    `Banked <b>+${state.banked}</b> gold &middot; Treasure chest: <b>${state.purse}</b> gold`;

  if (isFinale(state.level)) {
    state.mode = 'won';
    const isBest = state.gold > state.best;
    if (isBest) {
      state.best = state.gold;
      saveNumber(BEST_KEY, state.best);
    }
    ui.wonGold.textContent = state.gold;
    ui.wonChest.innerHTML = banked;
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
      `Total plunder: <b>${state.gold}</b> gold` +
      `<small class="chest-line">${banked}</small>`;
    ui.nextBtn.textContent = `Sail to ${next.name}`;
    show(ui.levelDone, true);
  }
  renderLevelCards();
  updateHud(true);
}

// Put gold into the treasure chest (and save it).
function bankGold(amount) {
  const n = Math.max(0, Math.round(Number(amount) || 0));
  syncSaved();
  const before = state.purse;
  state.purse = clamp(state.purse + n, 0, MAX_GOLD);
  state.banked = state.purse - before;
  saveChest();
}

// Leave the voyage between levels for the title screen: progress and the chest are already
// saved; the plunder so far counts for the best score, as it does when the ship is sunk.
function exitVoyage() {
  if (state.gold > state.best) {
    state.best = state.gold;
    saveNumber(BEST_KEY, state.best);
  }
  showMenu();
}

function playerSunk() {
  state.mode = 'over';
  clearProjectiles();
  show(ui.hint, false);
  audio.play('defeat');
  if (state.gold > state.best) {
    state.best = state.gold;
    saveNumber(BEST_KEY, state.best);
  }
  const meta = LEVELS[state.level - 1].env.meta;
  const worst = Object.entries(state.hurtBy).sort((a, b) => b[1] - a[1])[0];
  let tip = '';
  if (worst && worst[0] === 'lava') tip = 'Tip: lava lands inside the red circles. Steer out of them!';
  else if (worst && SHIP_TYPES[worst[0]]) {
    tip = `Tip: the ${SHIP_TYPES[worst[0]].name.replace(/^The /, '')} did the most damage. Keep moving, and fire when the FIRE! light is on.`;
  }
  ui.overSummary.innerHTML =
    `${SHIP_TYPES.player.name} went down near ${placeName(meta)}.` +
    (tip ? `<br>${tip}` : '') +
    '<br><small>Trying again restores the gold you had when the level started.</small>';
  show(ui.over, true);
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------
// Vertical launch speed needed for a ball in flight for `t` seconds to come down at deck height.
function launchVy(t) {
  return clamp((0.8 - BALL_Y - 0.5 * GRAVITY * t * t) / t, 1, 11);
}

// Still in the fight: afloat, and not captured, escaped or surrendered (those arrive with boarding).
function fighting(e) {
  return e.hp > 0 && !e.captured && !e.escaped && !e.surrendered;
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

// Is `e` inside the firing arc on `side` of `ship`, taking its motion into account?
// (The same intercept that fire() solves, from the ship's centre.)
function inArc(ship, e, side) {
  if (!fighting(e)) return false;
  const rvx = fwdX(e.h) * e.speed - fwdX(ship.h) * ship.speed;
  const rvz = fwdZ(e.h) * e.speed - fwdZ(ship.h) * ship.speed;
  const px = e.x - ship.x;
  const pz = e.z - ship.z;
  let t = Math.hypot(px, pz) / BALL_SPEED;
  for (let k = 0; k < 3; k++) t = Math.hypot(px + rvx * t, pz + rvz * t) / BALL_SPEED;
  const r = relative(ship, e.x + rvx * t, e.z + rvz * t);
  if (Math.sign(r.lat) !== side || r.dist > MAX_RANGE + 2) return false;
  return Math.atan2(Math.abs(r.along), Math.abs(r.lat)) - Math.atan2(e.type.len / 2, r.dist) <= MAX_TRAVERSE;
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
  let volley = 0;
  if (ship.kind === 'player') {
    volley = ++volleyId;
    volleys.set(volley, { side, hits: 0, sunk: false, left: t.guns });
  }
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
      volley,
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
  const sx = ship.x + rightX(ship.h) * side * t.wid * 0.5;
  const sz = ship.z + rightZ(ship.h) * side * t.wid * 0.5;
  audio.play('cannon', sfxAt(sx, sz, { volume: Math.min(1, 0.55 + 0.12 * t.guns) }));
  ship.reload[key] = t.reload;
  ship.roll -= side * 0.09;
  return true;
}

// The player's guns aim at the nearest enemy inside that side's firing arc, or
// failing that the nearest one roughly abeam.
function playerFire(side) {
  if (state.mode !== 'playing' || !player || player.sinking) return false;
  let aim = null;
  let bestDist = Infinity;
  let fallback = null;
  let fallbackDist = Infinity;
  for (const e of enemies) {
    if (!fighting(e)) continue;
    const r = relative(player, e.x, e.z);
    if (inArc(player, e, side)) {
      if (r.dist < bestDist) {
        bestDist = r.dist;
        aim = e;
      }
      continue;
    }
    if (Math.sign(r.lat) !== side || r.dist > MAX_RANGE + 4) continue;
    if (Math.abs(r.along) > Math.abs(r.lat) * 1.2 + e.type.len / 2) continue;
    if (r.dist < fallbackDist) {
      fallbackDist = r.dist;
      fallback = e;
    }
  }
  return fire(player, side, aim ?? fallback);
}

// A player volley finished: flash HIT!/SUNK! on the side it was fired from.
function volleyDone(v) {
  if (!v.hits) return;
  ui.hitmark.textContent = v.sunk ? 'SUNK!' : v.hits > 1 ? `HIT ×${v.hits}` : 'HIT!';
  ui.hitmark.className = `hitmark ${v.side > 0 ? 'right' : 'left'}${v.sunk ? ' sunk' : ''}`;
  retrigger(ui.hitmark, 'pop');
}

function damage(ship, amount, x, z, source = 'other') {
  if (ship.hp <= 0) return;
  if (ship.kind === 'player' && state.clearTimer > 0) return; // the level is already won
  ship.hp -= amount;
  ship.flash = 0.3;
  const hx = x ?? ship.x;
  const hz = z ?? ship.z;
  for (let i = 0; i < 7; i++) {
    // Flat little planks flying off the hull.
    spawnParticle('puff', 0x8b5a2b, hx, 1.4, hz, rand(-3.5, 3.5), rand(2, 7), rand(-3.5, 3.5), rand(0.6, 1.1), rand(0.22, 0.32), GRAVITY, false, true);
  }
  puff(hx, 1.6, hz, 3, 0xffb627, 3, 3, 0.5, 0.3, 0, false, 'glow');
  audio.play('hit', sfxAt(hx, hz));
  if (ship.kind === 'player') {
    state.hurtBy[source] = (state.hurtBy[source] || 0) + amount;
    state.lastHit = state.time;
    state.shake = Math.max(state.shake, 0.4);
    state.ghostHold = 0.45;
    retrigger(ui.hullCard, 'hurt');
    if (state.edgeCooldown <= 0) {
      const r = relative(player, hx, hz);
      ui.edge.className = `edge ${r.lat > 0 ? 'right' : 'left'}${source === 'lava' ? ' lava' : ''}`;
      retrigger(ui.edge, 'on');
      state.edgeCooldown = 0.25;
    }
  }
  if (ship.hp <= 0) {
    ship.hp = 0;
    ship.sinking = 0.001;
    audio.play('sink', sfxAt(ship.x, ship.z));
    puff(ship.x, 2, ship.z, 18, 0xff7b1c, 8, 9, 0.7, 1.0, GRAVITY, false, 'glow');
    puff(ship.x, 2, ship.z, 10, 0x6e6878, 6, 5, 1.2, 1.6, 1.5, true);
    if (ship.kind === 'enemy') {
      state.sunk++;
      for (let i = 0; i < ship.type.gold; i++) {
        const a = (i / ship.type.gold) * Math.PI * 2;
        const mesh = new THREE.Mesh(coinGeo, coinMat);
        scene.add(mesh);
        coins.push({ mesh, x: ship.x + Math.cos(a) * 2.5, z: ship.z + Math.sin(a) * 2.5, spin: Math.random() * 6 });
      }
      const left = enemies.filter(fighting).length;
      const def = LEVELS[state.level - 1];
      const moreWaves = state.wave < def.waves.length - 1;
      if (left > 0 || moreWaves) {
        const title = ship.type.boss ? `${ship.type.name} is sunk!` : `${ship.type.name} sunk!`;
        showBanner(`${title}${left ? `<small>${left} to go</small>` : ''}`, 1.8);
      } else if (ship.type.boss) {
        state.lastBossSunk = ship.type.name; // named in the victory banner
      }
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
  // Aim where the player will be, following the current turn, with some scatter so you can dodge.
  const turn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const w = turn * player.type.turn * (0.35 + 0.65 * Math.min(1, player.speed / player.type.maxSpeed));
  const tt = T * rand(0.6, 1.0);
  let px;
  let pz;
  if (Math.abs(w) < 1e-4) {
    px = player.x + fwdX(player.h) * player.speed * tt;
    pz = player.z + fwdZ(player.h) * player.speed * tt;
  } else {
    // Heading h' = h + w t; forward (sin h', cos h') integrated over t.
    px = player.x + (player.speed / w) * (Math.cos(player.h) - Math.cos(player.h + w * tt));
    pz = player.z + (player.speed / w) * (Math.sin(player.h + w * tt) - Math.sin(player.h));
  }
  const a = Math.random() * Math.PI * 2;
  const d = Math.random() * def.bombs.spread;
  const tx = px + Math.cos(a) * d;
  const tz = pz + Math.sin(a) * d;
  const mesh = new THREE.Mesh(bombGeo, bombMat);
  const zone = buildZone();
  scene.add(mesh, zone);
  const whistle = audio.play('bombWhistle', sfxAt(tx, tz, { duration: T }));
  bombs.push({ mesh, zone, sx: v.x, sy: v.craterY, sz: v.z, tx, tz, t: 0, T, H: 30 + Math.random() * 15, whistle });
  if (!state.bombWarned) {
    state.bombWarned = true;
    showBanner('Lava bomb!<small>Steer out of the red circle</small>', 2.5);
  }
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
      if (Math.random() < dt * 20) {
        const p = bombPos(b, u);
        spawnParticle('glow', Math.random() < 0.5 ? 0xff7b1c : 0xffd23f, p.x, p.y, p.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), 0.5, 0.5, 0);
        spawnParticle('puff', 0x8a7f8e, p.x, p.y, p.z, rand(-0.5, 0.5), 1, rand(-0.5, 0.5), 1.0, 0.5, 0, true, false, true);
      }
      continue;
    }
    // Impact.
    b.whistle.stop(0.03);
    audio.play('bombBoom', sfxAt(b.tx, b.tz));
    foam(b.tx, 0.5, b.tz, 16, 8, 12, 0.7, 1.0);
    puff(b.tx, 1, b.tz, 10, 0xff7b1c, 7, 9, 0.6, 0.7, GRAVITY, false, 'glow');
    puff(b.tx, 1, b.tz, 6, foamColor, 5, 4, 0.9, 1.4, 2, true, 'glow'); // steam
    const ships = player ? [player, ...enemies] : enemies;
    for (const s of ships) {
      if (s.hp <= 0) continue;
      const d = Math.hypot(s.x - b.tx, s.z - b.tz);
      const reach = BOMB_RADIUS + s.type.wid * 0.4;
      if (d < reach) damage(s, Math.round(BOMB_DAMAGE * (1 - (0.5 * d) / reach)), b.tx, b.tz, 'lava');
    }
    if (player && Math.hypot(player.x - b.tx, player.z - b.tz) < 25) state.shake = Math.max(state.shake, 0.5);
    removeBomb(b);
    bombs.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
function steerToward(ship, desired, dt, fullRate = false) {
  const t = ship.type;
  const rate = fullRate ? t.turn : t.turn * (0.35 + 0.65 * Math.min(1, ship.speed / t.maxSpeed));
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

  if (state.time - state.lastHit > (t.regenDelay ?? REGEN_DELAY) && p.hp < p.maxHp) {
    p.hp = Math.min(p.maxHp, p.hp + (t.regen ?? REGEN_RATE) * dt);
    if (!state.regenShown && state.bannerTimer <= 0 && state.clearTimer <= 0) {
      state.regenShown = true;
      showBanner('Repairing!<small>Out of the fight, your crew patches the hull</small>', 2.2);
    }
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
    if (attacking && state.combatTime > def.grace && r.dist < MAX_RANGE - 4 && Math.abs(r.along) < Math.abs(r.lat) * 0.45) {
      fire(e, r.lat > 0 ? 1 : -1, p, { spread: t.spread * def.spreadMul, lead: def.lead, rangeErr: rand(0.88, 1.12) });
    }
  }

  // Avoid obstacles: the nearest one in the way (land, reefs for deep hulls, other
  // pirates ahead) decides which way to turn.
  const look = Math.min(40, 10 + t.len + t.maxSpeed / t.turn);
  const lookX = e.x + fwdX(e.h) * look;
  const lookZ = e.z + fwdZ(e.h) * look;
  let nearest = null;
  let nearestGap = Infinity;
  const avoid = (o, margin) => {
    if (Math.hypot(o.x - lookX, o.z - lookZ) < o.r + margin || Math.hypot(o.x - e.x, o.z - e.z) < o.r + margin) {
      const r = relative(e, o.x, o.z);
      if (r.along > -2 && r.dist - o.r < nearestGap) {
        nearestGap = r.dist - o.r;
        nearest = r;
      }
    }
  };
  if (!t.shallow) for (const reef of reefs) avoid(reef, 2);
  for (const c of colliders) avoid(c, t.wid + 5);
  for (const o of enemies) {
    if (o === e || o.sinking) continue;
    const r = relative(e, o.x, o.z);
    if (r.along > 0 && r.along < t.len + 6 && Math.abs(r.lat) < (t.wid + o.type.wid) * 0.5 + 2 && r.along < nearestGap) {
      nearestGap = r.along;
      nearest = r;
    }
  }
  if (nearest) {
    desired = e.h + (nearest.lat > 0 ? 1.2 : -1.2);
    targetSpeed = Math.min(targetSpeed, t.maxSpeed * 0.6);
  }

  // Safety net: pinned against land and barely moving for a second -> steer straight out.
  let ax = 0;
  let az = 0;
  let touching = false;
  for (const c of colliders) {
    const dx = e.x - c.x;
    const dz = e.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d < c.r + t.wid * 0.5 + 1 && d > 0.001) {
      touching = true;
      ax += dx / d;
      az += dz / d;
    }
  }
  e.pinned = touching && e.speed < 1.5 ? e.pinned + dt : 0;
  if (e.pinned > 1 && (ax || az)) {
    e.escapeH = Math.atan2(ax, az);
    e.escapeUntil = state.time + 1.5;
    e.pinned = 0;
  }
  const escaping = e.escapeUntil > state.time;
  if (escaping) {
    desired = e.escapeH;
    targetSpeed = t.maxSpeed;
  }
  // Stay inside the sea.
  if (Math.hypot(e.x, e.z) > env.worldRadius - 15) desired = Math.atan2(-e.x, -e.z);

  steerToward(e, desired, dt, escaping);
  targetSpeed = Math.min(targetSpeed, speedCap(e));
  e.speed += clamp(targetSpeed - e.speed, -t.accel * 1.5 * dt, t.accel * dt);
}

// Push a ship out of any land it overlaps.
function resolveLand(s, dt) {
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
}

function moveShip(s, dt) {
  for (const k of ['port', 'star']) s.reload[k] = Math.max(0, s.reload[k] - dt);
  if (s.sinking) {
    s.sinking += dt;
    s.speed *= 1 - Math.min(1, dt * 1.5);
  }
  s.x += fwdX(s.h) * s.speed * dt;
  s.z += fwdZ(s.h) * s.speed * dt;
  resolveLand(s, dt);

  // Reefs slow deep hulls.
  const wasOnReef = s.onReef;
  s.onReef = reefs.some((r) => Math.hypot(s.x - r.x, s.z - r.z) < r.r);
  if (s.onReef && !wasOnReef && !s.sinking && (s.kind === 'player' || !s.type.shallow)) audio.play('reef', sfxAt(s.x, s.z));
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
function separateShips(dt) {
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
      if (d >= min || d <= 0.0001) continue;
      const push = (min - d) / 2;
      a.x -= (dx / d) * push;
      a.z -= (dz / d) * push;
      b.x += (dx / d) * push;
      b.z += (dz / d) * push;
      // Ramming: the player's bow shoves a pirate aside instead of pinning it in place.
      const pl = a.kind === 'player' ? a : b.kind === 'player' ? b : null;
      if (pl) {
        const other = pl === a ? b : a;
        const r = relative(pl, other.x, other.z);
        if (r.along > 0 && Math.abs(r.lat) < r.along) {
          const side = r.lat >= 0 ? 1 : -1;
          other.x += rightX(pl.h) * side * 0.08;
          other.z += rightZ(pl.h) * side * 0.08;
          pl.speed *= 0.985;
          resolveLand(other, dt);
        }
      } else if (fwdX(a.h) * fwdX(b.h) + fwdZ(a.h) * fwdZ(b.h) < -0.3) {
        // Two pirates meeting head-on both give way to starboard and slide past.
        a.x += rightX(a.h) * 0.03;
        a.z += rightZ(a.h) * 0.03;
        b.x += rightX(b.h) * 0.03;
        b.z += rightZ(b.h) * 0.03;
      }
    }
  }
}

function hitsShip(b, s) {
  if (s.hp <= 0 || b.y > 3.8) return false;
  const r = relative(s, b.x, b.z);
  return Math.abs(r.along) < s.type.len / 2 + 0.3 && Math.abs(r.lat) < s.type.wid / 2 + 0.3;
}

function ballGone(b) {
  scene.remove(b.mesh);
  if (!b.volley) return;
  const v = volleys.get(b.volley);
  if (!v) return;
  if (--v.left <= 0) {
    volleys.delete(b.volley);
    volleyDone(v);
  }
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
        if (b.volley && volleys.has(b.volley)) {
          const v = volleys.get(b.volley);
          v.hits++;
          if (s.hp <= 0) v.sunk = true;
          state.hint.hits++;
        }
        gone = true;
        break;
      }
    }
    if (!gone) {
      for (const c of colliders) {
        if (b.y < c.h && Math.hypot(b.x - c.x, b.z - c.z) < c.r) {
          audio.play('hit', sfxAt(b.x, b.z, { pitch: 0.6, volume: 0.5 }));
          puff(b.x, b.y, b.z, 6, 0xd8c08a, 4, 4, 0.45, 0.6);
          gone = true;
          break;
        }
      }
    }
    if (!gone && b.y <= 0) {
      audio.play('splash', sfxAt(b.x, b.z));
      foam(b.x, 0.2, b.z, 7, 3, 7, 0.5, 0.7);
      spawnParticle('glow', foamColor, b.x, 0.15, b.z, 0, 0, 0, 0.6, 1.4, 0, true, true);
      gone = true;
    }
    if (gone) {
      ballGone(b);
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
      audio.play('coin', { pitch: 0.95 + Math.random() * 0.15 });
      puff(c.x, 1.5, c.z, 5, 0xffd23f, 3, 5, 0.3, 0.5, GRAVITY, false, 'glow');
      scene.remove(c.mesh);
      coins.splice(i, 1);
    }
  }
}

// Wakes, bow spray and sinking smoke, emitted per simulated second (not per frame).
function emitShipFx(s, dt) {
  const fx = fwdX(s.h);
  const fz = fwdZ(s.h);
  const wy = ocean.heightAt(s.x, s.z, visualTime);
  if (s.sinking) {
    s.smokeAcc += dt * 30;
    const sink = Math.min(s.sinking, 4);
    while (s.smokeAcc >= 1) {
      s.smokeAcc -= 1;
      if (Math.random() < 0.5) {
        spawnParticle('glow', Math.random() < 0.5 ? 0xff7b1c : 0xffd23f, s.x + rand(-2, 2), 2 - sink, s.z + rand(-2, 2), 0, 3, 0, 0.6, 0.6, 0, false, false, true);
      } else {
        spawnParticle('puff', 0x6e6878, s.x + rand(-2, 2), 2.5 - sink, s.z + rand(-2, 2), 0, 2.5, 0, 1.4, 0.8, 0, true, false, true);
      }
    }
    return;
  }
  if (s.speed > 2) {
    s.wakeAcc += dt * 60 * (s.speed / 18);
    while (s.wakeAcc >= 1) {
      s.wakeAcc -= 1;
      const bx = s.x - fx * s.type.len * 0.5;
      const bz = s.z - fz * s.type.len * 0.5;
      spawnParticle('glow', foamColor, bx + rand(-1, 1), wy + 0.1, bz + rand(-1, 1), 0, 0.2, 0, 1.4, rand(0.5, 0.9), 0, true, true, true);
    }
  }
  if (s.speed > 6) {
    s.sprayAcc += dt * 15;
    while (s.sprayAcc >= 1) {
      s.sprayAcc -= 1;
      const bx = s.x + fx * s.type.len * 0.5;
      const bz = s.z + fz * s.type.len * 0.5;
      spawnParticle('glow', foamColor, bx, wy + 0.3, bz, rightX(s.h) * rand(-3, 3), 2, rightZ(s.h) * rand(-3, 3), 0.5, 0.35, GRAVITY * 0.5, false, false, true);
    }
  }
}

// First-voyage hints in a bubble above the gun card (level 1 only).
function updateHints(dt) {
  if (state.tutorialDone || state.level !== 1 || !player || player.sinking || state.intro > 0) {
    show(ui.hint, false);
    return;
  }
  const h = state.hint;
  h.t += dt;
  const touch = isTouch();
  let text = '';
  if (h.step === 0) {
    text = touch ? 'Hold &#9664; &#9654; to steer &middot; tap <b>+ Sail</b> for speed' : 'Steer with <kbd>A</kbd> <kbd>D</kbd> &middot; more sail with <kbd>W</kbd>';
    if (h.t > 7) h.step = 1;
  } else if (h.step === 1) {
    if (h.hits > 0) {
      h.step = 2;
      h.t = 0;
    } else {
      const port = enemies.some((e) => inArc(player, e, -1));
      const star = enemies.some((e) => inArc(player, e, 1));
      const near = enemies.some((e) => fighting(e) && Math.hypot(e.x - player.x, e.z - player.z) < MAX_RANGE);
      h.offBeam = near && !port && !star ? h.offBeam + dt : 0;
      if (port || star) {
        const side = port ? 'port (left)' : 'starboard (right)';
        const key = touch ? (port ? 'tap <b>&#9664; Fire</b>' : 'tap <b>Fire &#9654;</b>') : port ? 'press <kbd>Q</kbd>' : 'press <kbd>E</kbd>';
        text = `Pirate to ${side}! ${key}`;
      } else if (h.offBeam > 3) {
        text = 'Turn side-on! Cannons only fire left and right.';
      }
    }
  } else if (h.step === 2) {
    text = 'Nice shot, Captain! Sink them all!';
    if (h.t > 2.5) {
      state.tutorialDone = true;
      saveNumber(TUTOR_KEY, 1);
    }
  }
  if (text && h.text !== text) ui.hint.innerHTML = text;
  h.text = text;
  show(ui.hint, !!text);
}

function step(dt) {
  state.time += dt;
  if (state.intro > 0) state.intro = Math.max(0, state.intro - dt * state.introRate);
  else state.combatTime += dt;
  state.edgeCooldown = Math.max(0, state.edgeCooldown - dt);
  const def = LEVELS[state.level - 1];
  // Gameplay motion of the environment itself (drifting ice floes), in simulated time.
  if (env && env.step) env.step(state.time, dt);
  if (player) updatePlayer(dt);
  // The nearest pirates get the attack slots (ships escaping from land, and treasure galleons, don't count).
  const attackers = new Set(
    enemies
      .filter((e) => fighting(e) && !e.type.merchant && player && e.escapeUntil <= state.time)
      .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))
      .slice(0, def.maxAttackers)
  );
  for (const e of enemies) updateEnemy(e, dt, attackers.has(e));
  if (player) moveShip(player, dt);
  for (const e of enemies) moveShip(e, dt);
  separateShips(dt);
  updateBalls(dt);
  updateCoins(dt);
  updateBombs(dt);
  if (player) emitShipFx(player, dt);
  for (const e of enemies) emitShipFx(e, dt);
  updateHints(dt);

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

  if (def.bombs && state.combatTime >= state.nextBomb) {
    launchBomb();
    state.nextBomb = state.combatTime + rand(...def.bombs.every);
  }

  const alive = enemies.filter(fighting).length;
  if (state.wave < def.waves.length - 1 && alive <= def.nextWaveAt) {
    spawnWave(state.wave + 1);
  } else if (alive === 0 && state.wave === def.waves.length - 1) {
    state.clearTimer = 2.5;
    clearProjectiles(true); // enemy shots and lava still in the air fizzle out
    const won = isFinale(state.level);
    audio.play(won ? 'victory' : 'levelClear');
    const boss = state.lastBossSunk ? `<small>${state.lastBossSunk} is sunk!</small>` : '';
    showBanner(won ? `Victory!${boss}<small>The seas are yours</small>` : `Level cleared!${boss}<small>Grab the loot</small>`, 2.5);
  }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
function changeSail(d) {
  if (state.mode !== 'playing' || !player || player.sinking) return;
  const before = state.sail;
  state.sail = clamp(state.sail + d, 0, SAIL_LEVELS.length - 1);
  if (state.sail !== before) audio.play(d > 0 ? 'sailUp' : 'sailDown');
}

// ---------------------------------------------------------------------------
// Steering: each direction stays on while ANY of its sources is held (each key,
// each touch pointer, a keyboard-held on-screen button), so releasing one binding
// never cancels another. `input.left/right` stay plain booleans for the bot/tests.
// ---------------------------------------------------------------------------
const steerSources = { left: new Set(), right: new Set() };
const holdButtons = [...document.querySelectorAll('[data-hold]')];

function steerPress(dir, source) {
  steerSources[dir].add(source);
  input[dir] = true;
  syncHoldButtons();
}
function steerRelease(dir, source) {
  steerSources[dir].delete(source);
  input[dir] = steerSources[dir].size > 0;
  syncHoldButtons();
}
function clearSteering() {
  steerSources.left.clear();
  steerSources.right.clear();
  input.left = input.right = false;
  syncHoldButtons();
}
// An on-screen steering button looks pressed while one of its own sources is active.
function syncHoldButtons() {
  for (const btn of holdButtons) {
    const dir = btn.dataset.hold;
    const pressed = [...steerSources[dir]].some((src) => src.startsWith('btn:'));
    btn.classList.toggle('active', pressed);
  }
}

// ---------------------------------------------------------------------------
// Modal dialogs (pause, graphics recovery): focus moves into the dialog, the HUD
// behind it is inert, Tab cycles inside it, and focus returns to the game on close.
// ---------------------------------------------------------------------------
let modal = null;
// Everything a dialog can sit on top of (the error screen stays usable whatever happens).
const backdrops = [ui.hud, ...document.querySelectorAll('.overlay:not(.error)')];
function setBackgroundInert(on) {
  for (const el of backdrops) el.inert = on && el !== modal;
}
// The open dialog, if it is still showing (a level change or menu may have hidden it).
function activeModal() {
  if (modal && modal.classList.contains('hidden')) {
    modal = null;
    setBackgroundInert(false);
  }
  return modal;
}
function focusables(el) {
  return [...el.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')].filter(
    (b) => !b.disabled && b.offsetParent !== null
  );
}
function focusInto(el) {
  const target = focusables(el)[0] || el.querySelector('[tabindex="-1"]') || el;
  if (target.focus) target.focus({ preventScroll: true });
}
function openModal(el) {
  show(el, true);
  modal = el;
  setBackgroundInert(true);
  focusInto(el);
}
function closeModal(el) {
  show(el, false);
  if (modal === el) modal = null;
  if (!modal) setBackgroundInert(false);
  // Back to the page itself, so game keys work at once (Space fires, not a stale button).
  if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
}

// ---------------------------------------------------------------------------
// Pause
// ---------------------------------------------------------------------------
function pauseGame() {
  state.mode = 'paused';
  clearSteering();
  audio.stopAll(0.2);
  audio.setMusicVolume(0.35);
}
function resumeGame() {
  state.mode = 'playing';
  audio.setMusicVolume(1);
}

function togglePause() {
  // While the graphics are being recovered, that dialog decides when play continues.
  if (activeModal() === ui.recover) {
    if (!state.contextLost) continueAfterRecovery();
    return;
  }
  if (state.mode === 'playing') {
    pauseGame();
    openModal(ui.pause);
  } else if (state.mode === 'paused') {
    closeModal(ui.pause);
    resumeGame();
  }
}

// ---------------------------------------------------------------------------
// WebGL context loss: the 3D view is gone (driver reset, GPU memory pressure, too
// many tabs). Stop the fight so nothing can hit you while you can't see, say so,
// and only carry on when the player says so after the graphics come back.
// ---------------------------------------------------------------------------
const recovery = { resume: false, pauseWasOpen: false, focus: null };
function onContextLost() {
  state.contextLost = true;
  pausedDrawn = false;
  clearSteering();
  // Lost again before the player pressed Continue: keep what the first loss recorded.
  if (activeModal() !== ui.recover) {
    recovery.pauseWasOpen = activeModal() === ui.pause;
    recovery.resume = state.mode === 'playing';
    // At the shipyard, focus goes back where it was (a Buy button, a swatch) when the view returns.
    recovery.focus = state.mode === 'dock' && ui.dock.contains(document.activeElement) ? document.activeElement : null;
  }
  if (state.mode === 'playing') pauseGame();
  if (activeModal() === ui.pause) closeModal(ui.pause);
  ui.recoverTitle.textContent = 'Graphics paused';
  const what =
    state.mode === 'dock'
      ? 'The shipyard will be back in a moment; your treasure chest and your ship are safe.'
      : state.mode === 'menu'
        ? 'Your progress is safe.'
        : 'The voyage is paused and your progress is safe.';
  ui.recoverMsg.textContent = `Your device reset the 3D graphics. ${what} Waiting for the graphics to come back…`;
  show(ui.recoverBtn, false);
  openModal(ui.recover);
}
function onContextRestored() {
  state.contextLost = false;
  pausedDrawn = false;
  resize();
  // A voyage in play when the view returns (one started while it was gone, too) waits for Continue.
  if (state.mode === 'playing') {
    pauseGame();
    recovery.resume = true;
  }
  if (recovery.resume) {
    // The player was mid-fight: wait for them to choose to continue.
    ui.recoverTitle.textContent = 'Graphics restored';
    ui.recoverMsg.textContent = 'The view is back. Your ship is waiting right where you left it.';
    show(ui.recoverBtn, true);
    focusInto(ui.recover);
  } else {
    closeModal(ui.recover);
    if (recovery.pauseWasOpen) openModal(ui.pause); // it was paused before: stay paused
    else if (state.mode === 'dock') {
      // back to the shipyard panel, where the player was if that control is still there
      const f = recovery.focus;
      const back = f && f.isConnected && ui.dock.contains(f) && f.getClientRects().length > 0 ? f : dockTab(dock.tab);
      back.focus({ preventScroll: f !== back });
    }
    recovery.focus = null;
  }
}
function continueAfterRecovery() {
  if (state.contextLost) return;
  closeModal(ui.recover);
  if (recovery.resume && state.mode === 'paused') resumeGame();
  recovery.resume = false;
}
ui.canvas.addEventListener('webglcontextlost', onContextLost);
ui.canvas.addEventListener('webglcontextrestored', onContextRestored);
ui.recoverBtn.addEventListener('click', continueAfterRecovery);

// Any input during the fly-in fast-forwards it to the chase camera.
function skipIntro() {
  if (state.mode === 'playing' && state.intro > 0.5) state.introRate = Math.max(state.introRate, state.intro / 0.5);
}

const KEYMAP = {
  a: 'left', arrowleft: 'left',
  d: 'right', arrowright: 'right',
};
// A held steering key is tracked by its physical key (e.code), so its keyup releases it even
// if a modifier or layout switch changed e.key in between (Option+A on a Mac reports 'å').
const keySource = (e) => `key:${e.code || e.key.toLowerCase()}`;

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  // Keep keyboard focus inside an open dialog.
  const open = activeModal();
  if (k === 'tab' && open) {
    e.preventDefault();
    const list = focusables(open);
    if (!list.length) {
      focusInto(open);
      return;
    }
    const i = list.indexOf(document.activeElement);
    const next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : (i + 1) % list.length;
    list[next].focus();
    return;
  }
  // At the shipyard the panel's buttons (and the browser) handle the keys: P, Escape and a bare
  // Enter do nothing, arrows scroll the panel. With nothing focused, ←/→ (or A/D) turn the view.
  if (state.mode === 'dock' && !open) {
    if (k === 'm') {
      if (!e.repeat) {
        toggleMute();
        announce(audio.muted ? 'Sound off.' : 'Sound on.');
      }
    } else if (KEYMAP[k] && !ui.dock.contains(document.activeElement)) {
      e.preventDefault();
      nudgeDockView(KEYMAP[k] === 'left' ? -1 : 1);
    }
    return;
  }
  // Outside play (menus, dialogs), a focused button handles Enter/Space itself.
  const focused = document.activeElement;
  if (
    (k === 'enter' || k === ' ') &&
    (state.mode !== 'playing' || open) &&
    focused instanceof HTMLButtonElement &&
    !focused.disabled &&
    focused.offsetParent
  ) {
    return;
  }
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();

  if (k === 'enter' || (k === ' ' && state.mode === 'menu')) {
    if (e.repeat || open) return;
    if (state.mode === 'menu') newGame();
    else if (state.mode === 'won') showMenu();
    else if (state.mode === 'levelDone') nextLevel();
    else if (state.mode === 'over') retryLevel();
    else skipIntro();
    return;
  }
  if (k === 'm') {
    if (!e.repeat) toggleMute();
    return;
  }
  if (k === 'p' || k === 'escape') {
    if (!e.repeat) togglePause();
    return;
  }
  if (state.mode !== 'playing') return;
  skipIntro();
  if (KEYMAP[k]) steerPress(KEYMAP[k], keySource(e));
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
  const src = keySource(e);
  for (const dir of ['left', 'right']) if (steerSources[dir].has(src)) steerRelease(dir, src);
});

// Keys released while the window is unfocused never send keyup: forget everything held.
window.addEventListener('blur', clearSteering);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearSteering();
    if (state.mode === 'playing') togglePause();
  } else {
    resetPerfWindow(1);
    clock.getDelta(); // drop the time spent hidden
    pausedDrawn = false;
  }
});

// Is this click the end of a touch/mouse press that pointerdown already acted on?
// Where click is a PointerEvent (Chromium-based browsers, for example), its pointerType is
// 'touch', 'mouse' or 'pen' for a real press and '' for Enter/Space, assistive technology and
// el.click(). That is decided by the click itself, so a slow frame between pointerup and click
// can't fool it. Where click is a plain MouseEvent: a click right after a pointerup.
function clickFromPointer(e, pointerUpAt) {
  if (typeof e.pointerType === 'string') return e.pointerType !== '';
  return performance.now() - pointerUpAt < 600;
}

// On-screen steering buttons: held by touch/mouse (pointer capture, so sliding off
// still releases them), by Enter/Space while focused, or nudged by a plain click
// (assistive technology, scripted clicks).
for (const btn of holdButtons) {
  const dir = btn.dataset.hold;
  const press = (src) => {
    if (state.mode !== 'playing') return;
    skipIntro();
    steerPress(dir, src);
  };
  let pointerUpAt = -Infinity;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try {
      btn.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events have no capturable pointer; release still works.
    }
    press(`btn:ptr${e.pointerId}`);
  });
  const releasePointer = (e) => {
    pointerUpAt = performance.now();
    steerRelease(dir, `btn:ptr${e.pointerId}`);
  };
  btn.addEventListener('pointerup', releasePointer);
  btn.addEventListener('pointercancel', releasePointer);
  btn.addEventListener('lostpointercapture', releasePointer);
  // Enter and Space are separate sources: releasing one while the other is held keeps steering.
  btn.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); // no synthetic click on top of the hold
    e.stopPropagation(); // and not the global Enter/Space shortcuts
    if (!e.repeat) press(`btn:key:${e.key}`);
  });
  btn.addEventListener('keyup', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    steerRelease(dir, `btn:key:${e.key}`);
  });
  btn.addEventListener('blur', () => {
    steerRelease(dir, 'btn:key:Enter');
    steerRelease(dir, 'btn:key: ');
  });
  let nudges = 0;
  btn.addEventListener('click', (e) => {
    if (clickFromPointer(e, pointerUpAt)) return; // the click that ends a tap/hold: already handled
    const src = `btn:click${++nudges}`; // each click gets its own full nudge
    press(src);
    setTimeout(() => steerRelease(dir, src), 350);
  });
}

// On-screen sail and fire buttons. A tap acts on touch-down (no click delay in a
// fight) and the click that follows its release is skipped, so one tap = one action.
// Keyboard, assistive technology and scripted clicks arrive as plain clicks and act.
// (Click `detail` can't tell them apart: Chrome reports 0 for some tap clicks too.)
const TAP_ACTIONS = {
  sailUp: () => changeSail(1),
  sailDown: () => changeSail(-1),
  firePort: () => playerFire(-1),
  fireStar: () => playerFire(1),
  // The act pad (hidden until the boarding update wires these up: cycle ammo; grapple / heave / cut).
  ammo: () => {},
  board: () => {},
};
for (const btn of document.querySelectorAll('[data-tap]')) {
  const act = () => {
    skipIntro();
    TAP_ACTIONS[btn.dataset.tap]();
  };
  let pointerActed = false;
  let pointerUpAt = -Infinity;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault(); // keep focus and selection where they are
    pointerActed = true;
    act();
  });
  btn.addEventListener('pointerup', () => {
    pointerUpAt = performance.now();
  });
  btn.addEventListener('pointercancel', () => {
    pointerActed = false; // no click will follow
  });
  btn.addEventListener('click', (e) => {
    if (pointerActed && clickFromPointer(e, pointerUpAt)) {
      pointerActed = false; // this tap's own click
      return;
    }
    pointerActed = false;
    act();
  });
  // Enter/Space on a focused button activate it (native click), not the global shortcuts.
  btn.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.stopPropagation();
    // A held Enter clicks again on every auto-repeat: one press is one sail step.
    // (Fire buttons keep repeating, like a held fire key.)
    if (e.key === 'Enter' && e.repeat && btn.dataset.tap.startsWith('sail')) e.preventDefault();
  });
}

$('start-btn').addEventListener('click', () => newGame(1));
$('resume-btn').addEventListener('click', togglePause);
$('next-btn').addEventListener('click', nextLevel);
$('retry-btn').addEventListener('click', retryLevel);
$('menu-btn').addEventListener('click', showMenu);
$('again-btn').addEventListener('click', showMenu);
$('exit-btn').addEventListener('click', exitVoyage);
$('dock-btn').addEventListener('click', () => openDockSoon('levelDone'));
$('over-dock-btn').addEventListener('click', () => openDockSoon('over'));
$('won-dock-btn').addEventListener('click', () => openDockSoon('won'));
$('menu-dock-btn').addEventListener('click', () => openDockSoon('menu'));
for (const btn of [$('pause-btn'), ui.muteBtn, ui.menuMute]) {
  btn.addEventListener('click', (e) => {
    const target = e.currentTarget;
    target.blur(); // so Space doesn't re-press the button
    if (target === ui.muteBtn || target === ui.menuMute) toggleMute();
    else togglePause();
  });
}
// The shipyard's sound button keeps focus (the dock leaves Space and Enter to the focused button).
ui.dockMute.addEventListener('click', toggleMute);

// The chest or the ship changed in another tab of the game: show it here too.
window.addEventListener('storage', (e) => {
  if (e.key !== null && e.key !== PURSE_KEY && e.key !== SHIP_KEY) return;
  if (!syncSaved()) return;
  if (state.mode === 'dock') {
    rebuildDockShip();
    renderDock();
  } else if (state.mode === 'menu') {
    renderLevelCards();
    menuShip();
  }
});

// Level select cards on the title screen.
function renderLevelCards() {
  ui.best.textContent = state.best;
  ui.menuChest.textContent = state.purse;
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
      `<span class="lvl-diff" title="Difficulty" aria-label="Difficulty: ${def.difficulty}">${def.difficulty}</span>` +
      `<span class="lvl-lock">${locked ? 'Locked' : 'Play'}</span>`;
    btn.addEventListener('click', () => newGame(n));
    ui.levelCards.appendChild(btn);
  });
}

function showMenu() {
  if (activeModal() && !state.contextLost) closeModal(modal);
  blurActive();
  closeDock();
  clearLevelEntities();
  for (const el of [ui.pause, ui.levelDone, ui.over, ui.won, ui.dock, ui.hud, ui.banner, ui.boss, ui.hint]) show(el, false);
  state.mode = 'menu';
  audio.stopAll();
  audio.setScene('menu');
  loadEnvironment(1);
  menuShip();
  renderLevelCards();
  show(ui.menu, true);
  menuLayout = null;
}

// A ship bobbing in the harbour behind the title screen, framed beside the menu panel.
let menuShipMesh = null;
let menuLayout = null; // cached panel position, recomputed after resize
function menuShip() {
  if (menuShipMesh) disposeShip(menuShipMesh);
  menuShipMesh = buildPlayerMesh();
  scene.add(menuShipMesh);
}

// ---------------------------------------------------------------------------
// The shipyard on Sparrow's Floating Island. The ship lies at its berth while a crew scrubs it,
// the camera sways slowly around it (drag the view, or ←/→, to turn it) and the panel sells
// upgrades (paid from the treasure chest) and paint (free). Every change rebuilds the ship.
// ---------------------------------------------------------------------------
const DOCK_FROM = ['menu', 'levelDone', 'over', 'won'];
// Ways out of the dock, by where the player came from; the first one is the main action.
const DOCK_EXITS = { levelDone: ['next', 'menu'], over: ['retry', 'menu'], menu: ['title'], won: ['title'] };
function dockExits(from) {
  // After a finale with more voyage to come (Act II), the dock can also sail on to the next level.
  if (from === 'won') return state.level < LEVELS.length ? ['next', 'title'] : DOCK_EXITS.won;
  return DOCK_EXITS[from] || DOCK_EXITS.menu;
}
const PAINT_PARTS = [
  ['hull', 'Hull paint'],
  ['sails', 'Sails'],
  ['flag', 'Flag'],
];
const dock = {
  open: false,
  from: 'menu',
  ship: null,
  sup: null, // support points of every docked ship so far (frames the view, see measureDockShip())
  tab: 'up',
  built: false,
  a: 0, // orbit angle of the camera
  phase: 0, // auto-sway phase
  idle: 0, // seconds since the player last turned the view
  drag: null, // { id, x } while a pointer drags the view
  shownPurse: -1, // chest total the panel shows
  cheerUntil: 0, // the crew aboard cheers a new upgrade until this (visual) time
  cheering: [],
  lastBuy: { id: '', at: -Infinity },
};
let dockLayout = null; // framing beside the panel, recomputed after resize

// Small cartoon icons for the upgrade rows (ink outlines like the 3D art).
const INK_SVG = 'stroke="#1d1330" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';
const UP_ICONS = {
  guns:
    `<svg viewBox="0 0 32 32"><g ${INK_SVG}><path d="M4.5 18.5l17-7.6c2.6-1.1 4.9-.4 5.6 1.3.7 1.7-.4 3.8-3 5L8 24z" fill="#4a4458"/>` +
    '<path d="M24.5 11.6c1.4.4 2.4 1.8 2.6 3.2" fill="none"/><rect x="5" y="20" width="15" height="5.5" rx="2" fill="#b0703a"/>' +
    '<circle cx="8.6" cy="25.6" r="3.4" fill="#e0a052"/><circle cx="17.4" cy="25.6" r="3.4" fill="#e0a052"/></g>' +
    '<circle cx="8.6" cy="25.6" r="1" fill="#1d1330"/><circle cx="17.4" cy="25.6" r="1" fill="#1d1330"/></svg>',
  shot:
    `<svg viewBox="0 0 32 32"><g ${INK_SVG} fill="#3a3443"><circle cx="10" cy="22" r="6"/><circle cx="22" cy="22" r="6"/><circle cx="16" cy="12" r="6"/></g>` +
    '<g fill="#fff" opacity=".75"><circle cx="8" cy="19.6" r="1.6"/><circle cx="20" cy="19.6" r="1.6"/><circle cx="14" cy="9.6" r="1.6"/></g></svg>',
  crew:
    `<svg viewBox="0 0 32 32"><g ${INK_SVG}><path d="M24.5 3.5L13 18" fill="none" stroke-width="2.6"/><rect x="21.6" y="1.6" width="5" height="5" rx="2.2" fill="#f2e6c8" transform="rotate(38 24.1 4.1)"/>` +
    '<path d="M8 9.5h14c1.6 3.3 1.6 15.7 0 19H8c-1.6-3.3-1.6-15.7 0-19z" fill="#c07b3a"/><path d="M7.1 14h15.8M7.1 24h15.8" fill="none"/>' +
    '<rect x="11.5" y="16.6" width="7" height="5" rx="1.4" fill="#fff4d6"/></g><path d="M13.6 18.1h2.8M13.6 20h2" stroke="#1d1330" stroke-width="1.4"/></svg>',
  hull:
    `<svg viewBox="0 0 32 32"><g ${INK_SVG}><path d="M16 3.5l10.5 4v8.3c0 6.4-4.3 10.4-10.5 12.7C9.8 26.2 5.5 22.2 5.5 15.8V7.5z" fill="#93a4b8"/>` +
    '<path d="M5.6 13.4h20.8v4.4H5.6z" fill="#5d6b7d"/></g><g fill="#1d1330"><circle cx="10" cy="15.6" r="1.1"/><circle cx="16" cy="15.6" r="1.1"/><circle cx="22" cy="15.6" r="1.1"/></g>' +
    '<path d="M11 7.6l4-1.4" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/></svg>',
  sails:
    `<svg viewBox="0 0 32 32"><g ${INK_SVG}><path d="M9 2.5v27" fill="none" stroke-width="2.4"/><path d="M9.5 3.5l8 3-8 3z" fill="#e63946"/>` +
    '<path d="M10 10.5c7 0 13 1.4 16.5 2.4-1.5 4.6-1.5 9.2 0 13.8C23 27.5 17 28.5 10 28.5z" fill="#fff4d6"/>' +
    '<path d="M10 25c6 0 11.5-.6 15.6-1.6l.9 3.3C23 27.6 17 28.5 10 28.5z" fill="#e63946"/></g></svg>',
  carpenter:
    `<svg viewBox="0 0 32 32"><g ${INK_SVG}><rect x="3.5" y="21" width="25" height="6.5" rx="2" fill="#d9a066"/>` +
    '<path d="M9 24.2h4M17 24.2h6" fill="none" stroke-width="1.4"/><path d="M21.5 6.5L11 19" fill="none" stroke-width="3.6" stroke="#1d1330"/>' +
    '<path d="M21.5 6.5L11 19" fill="none" stroke-width="1.6" stroke="#e0a052"/><path d="M15.8 5.2l5.6-3.2 6 6.8-4.4 4.4z" fill="#6c7688"/></g></svg>',
};

function hexColor(n) {
  return `#${(n >>> 0).toString(16).padStart(6, '0')}`;
}

// Polite live region for shipyard news (purchases, paint, why a Buy button is out of reach).
function announce(text) {
  // A repeated message is changed slightly so screen readers read it again.
  ui.dockLive.textContent = ui.dockLive.textContent === text ? `${text} ` : text;
}

// Building the island and the ship holds the page up for a moment (seconds on a slow device). From a
// button, first say where we're going and let that be drawn (two animation frames), then open the dock.
// The test API's dock.open() opens it at once.
let dockSoon = 0;
function openDockSoon(from) {
  if (state.mode === 'dock' || dockSoon) return;
  const mode = state.mode;
  ui.dockToast.textContent = "Rowing to Sparrow's Floating Island…";
  dockSoon = requestAnimationFrame(() => {
    dockSoon = requestAnimationFrame(() => {
      dockSoon = 0;
      // Only if the player is still where they pressed the button (not sailing on or back at the title).
      if (state.mode === mode) openDock(from);
      ui.dockToast.textContent = '';
    });
  });
}

function openDock(from) {
  if (state.mode === 'dock') return true;
  if (!DOCK_FROM.includes(from)) from = DOCK_FROM.includes(state.mode) ? state.mode : 'menu';
  if (from === 'levelDone' && isFinale(state.level)) from = 'won';
  if (activeModal() && !state.contextLost) closeModal(modal);
  blurActive();
  clearLevelEntities();
  if (menuShipMesh) {
    disposeShip(menuShipMesh);
    menuShipMesh = null;
  }
  clearSteering();
  for (const el of [ui.menu, ui.pause, ui.levelDone, ui.over, ui.won, ui.hud, ui.banner, ui.boss, ui.hint]) show(el, false);
  state.bannerTimer = 0;
  state.shake = 0;
  state.mode = 'dock';
  dock.from = from;
  dock.open = true;
  pausedDrawn = false;

  setEnvironment(sparrow, 77);
  dock.sup = null;
  placeDockShip(buildPlayerMesh());
  dock.a = env.view.yaw;
  dock.phase = 0;
  dock.idle = 99; // start swaying straight away
  dock.drag = null;
  audio.stopAll();
  audio.setMusicVolume(1);
  audio.setScene('dock');

  buildDockPanel();
  renderDockExits();
  setDockTab('up', false);
  renderDock();
  ui.dockLive.textContent = '';
  show(ui.dock, true);
  document.body.classList.add('docked');
  dockLayout = null;
  // Keyboard focus starts on the Upgrades tab (unless the graphics-recovery dialog is up).
  if (!activeModal()) dockTab('up').focus({ preventScroll: true });
  return true;
}

// Tidy up the dock scene (the caller loads whatever comes next). Safe to call any time.
function closeDock() {
  if (!dock.open) return;
  dock.open = false;
  dock.cheering = [];
  dock.cheerUntil = 0;
  endDockDrag();
  // Take the cleaning crew off the ship before it is disposed (the environment owns them).
  if (env && env.setShip) env.setShip(null);
  if (dock.ship) disposeShip(dock.ship);
  dock.ship = null;
  show(ui.dock, false);
  document.body.classList.remove('docked', 'dragging');
  camera.clearViewOffset();
  setLens();
  dockLayout = null;
}

function leaveDock(action) {
  if (state.mode !== 'dock') return false;
  const exits = dockExits(dock.from);
  if (action === undefined) action = exits[0];
  if (action === 'menu' && !exits.includes('menu')) action = 'title';
  if (!exits.includes(action)) return false;
  if (action === 'next') nextLevel();
  else if (action === 'retry') retryLevel();
  else if (action === 'menu') exitVoyage();
  else showMenu();
  return true;
}

// Put a freshly built ship at the berth (replacing and disposing the old one) with the crew aboard.
function placeDockShip(mesh) {
  const old = dock.ship;
  dock.ship = mesh;
  scene.add(mesh);
  poseDockShip(visualTime);
  if (env.setShip) env.setShip(mesh); // moves the crew over from the old ship
  measureDockShip(mesh); // with the crew (and their rowboat and plank) aboard
  if (old) disposeShip(old);
}

// The view is framed on the ship's support points: for each of a fixed set of directions, the point
// (ship-local, above the water) that reaches furthest that way, over every ship docked so far. That
// hugs the real shape (a bounding box leaves a lot of empty sea around a ship), the framing never
// jumps on a paint change and it only widens when an upgrade makes the ship bigger.
const FRAME_DIRS = new Float64Array(64 * 3);
for (let i = 0, n = 64; i < n; i++) {
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(1 - y * y);
  const a = i * Math.PI * (3 - Math.sqrt(5));
  FRAME_DIRS.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
}
const fitInv = new THREE.Matrix4();
const fitM = new THREE.Matrix4();
const fitBox = new THREE.Box3();
function measureDockShip(mesh) {
  const n = FRAME_DIRS.length / 3;
  if (!dock.sup) dock.sup = { d: new Float64Array(n).fill(-Infinity), pts: new Float64Array(n * 3) };
  const { d, pts } = dock.sup;
  let grew = false;
  const take = (x, y, z) => {
    if (y < -0.1) return; // under water
    for (let k = 0; k < n; k++) {
      const s = FRAME_DIRS[k * 3] * x + FRAME_DIRS[k * 3 + 1] * y + FRAME_DIRS[k * 3 + 2] * z;
      if (s > d[k] + 1e-4) {
        d[k] = s;
        pts[k * 3] = x;
        pts[k * 3 + 1] = y;
        pts[k * 3 + 2] = z;
        grew = true;
      }
    }
  };
  mesh.updateMatrixWorld(true);
  fitInv.copy(mesh.matrixWorld).invert();
  mesh.traverseVisible((o) => {
    const g = o.isMesh && !o.isInstancedMesh ? o.geometry : null;
    const pos = g && g.attributes.position;
    if (!pos) return;
    const e = fitM.multiplyMatrices(fitInv, o.matrixWorld).elements;
    if (o.isSkinnedMesh) {
      // A crew member: the corners of the (bind pose) bounds are close enough.
      if (!g.boundingBox) g.computeBoundingBox();
      fitBox.copy(g.boundingBox);
      for (let c = 0; c < 8; c++) {
        const x = c & 1 ? fitBox.max.x : fitBox.min.x;
        const y = c & 2 ? fitBox.max.y : fitBox.min.y;
        const z = c & 4 ? fitBox.max.z : fitBox.min.z;
        take(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
      }
      return;
    }
    const a = pos.array;
    const st = pos.isInterleavedBufferAttribute ? pos.data.stride : pos.itemSize;
    const off = pos.isInterleavedBufferAttribute ? pos.offset : 0;
    for (let i = 0; i < pos.count; i++) {
      const j = i * st + off;
      const x = a[j];
      const y = a[j + 1];
      const z = a[j + 2];
      take(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
    }
  });
  if (grew) dockLayout = null;
}

function rebuildDockShip() {
  if (dock.ship) placeDockShip(buildPlayerMesh());
}

// Moored: it rises and falls with the water and rolls a little.
function poseDockShip(t) {
  const s = dock.ship;
  const b = env.berth;
  s.position.set(b.x, ocean.heightAt(b.x, b.z, t), b.z);
  s.rotation.set(0, b.h, 0);
  s.rotateX(Math.sin(t * 0.7 + 1.3) * 0.008);
  s.rotateZ(Math.sin(t * 1.05) * 0.02);
  animateShip(s, t, 0.12);
}

function buyUpgrade(id) {
  if (state.mode !== 'dock') return false;
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) return false;
  if (syncSaved()) {
    // changed in another tab: show that ship first
    rebuildDockShip();
    renderDock();
  }
  const cost = nextCost(shipConfig, id);
  if (cost === null) {
    announce(`${u.name} is fully upgraded.`);
    return false;
  }
  if (state.purse < cost) {
    announce(`${u.name} costs ${cost} gold. You need ${cost - state.purse} more gold.`);
    return false;
  }
  state.purse -= cost;
  shipConfig.up[id] = Math.min(maxTier(id), shipConfig.up[id] + 1);
  // The ship's record first, the chest only together with it: if storage is full, the purchase lasts
  // for this visit and the gold is still in the saved chest, rather than spent on nothing (saveChest()).
  unsavedSpend += cost;
  saveChest();
  rebuildDockShip();
  renderDock();
  retrigger(ui.dockChest, 'bump');
  audio.play('coin');
  setTimeout(() => audio.play('coin', { pitch: 1.25 }), 110);
  celebrate(true);
  const tier = shipConfig.up[id];
  announce(`Bought ${u.name}. ${u.stat}: ${statText(id, tier)}.`);
  return true;
}

function setPaint(part, id) {
  if (state.mode !== 'dock' || !PAINT_PARTS.some(([p]) => p === part)) return false;
  const look = LOOKS[part].find((l) => l.id === id);
  if (!look) return false;
  if (syncSaved() && shipConfig.look[part] === id) rebuildDockShip(); // changed in another tab
  if (shipConfig.look[part] !== id) {
    shipConfig.look[part] = id;
    // An upgrade bought while storage was full rides along in this record: save the chest with it.
    if (unsavedSpend > 0) saveChest();
    else saveShipConfig(shipConfig);
    rebuildDockShip();
    celebrate(false);
  }
  renderDock();
  announce(`${PAINT_PARTS.find(([p]) => p === part)[1]}: ${look.name}.`);
  return true;
}

// A shower of gold sparkles over the deck, and for a purchase a cheer from the crew aboard.
function celebrate(big) {
  const s = dock.ship;
  if (!s) return;
  const n = big ? 16 : 7;
  puff(s.position.x, 3, s.position.z, n, 0xffd23f, 7, 9, 0.2, 0.9, GRAVITY * 0.45, false, 'glow');
  puff(s.position.x, 3, s.position.z, Math.round(n / 2), 0xffffff, 6, 8, 0.15, 0.8, GRAVITY * 0.45, false, 'glow');
  if (!big) return;
  // The crew aboard throws their arms (and mops) in the air for a moment.
  dock.cheering = [];
  s.traverse((o) => {
    if (o.userData && o.userData.keep && o.userData.kind) dock.cheering.push(o);
  });
  dock.cheerUntil = visualTime + 1.6;
}

// ---- Panel ----
function dockTab(name) {
  return ui.dockTabs.find((t) => t.dataset.tab === name) || ui.dockTabs[0];
}

function setDockTab(name, focus = true) {
  dock.tab = name === 'paint' ? 'paint' : 'up';
  for (const t of ui.dockTabs) {
    const on = t.dataset.tab === dock.tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    const panel = document.getElementById(t.getAttribute('aria-controls'));
    if (panel) panel.hidden = !on;
  }
  const body = ui.dockPanel.querySelector('.dock-body');
  if (body) body.scrollTop = 0;
  if (focus) dockTab(dock.tab).focus({ preventScroll: true });
}

function buildDockPanel() {
  if (dock.built) return;
  dock.built = true;
  for (const u of UPGRADES) {
    const li = document.createElement('li');
    li.className = 'up-row';
    li.dataset.id = u.id;
    li.innerHTML =
      `<span class="up-ico" aria-hidden="true">${UP_ICONS[u.id] || ''}</span>` +
      `<div class="up-head"><h3 class="up-name">${u.name}</h3><span class="pips" role="img"></span></div>` +
      `<p class="up-stat"><span class="up-statname">${u.stat}:</span> <span class="up-values"></span></p>` +
      `<p class="up-blurb">${u.blurb}</p>` +
      '<div class="up-buy">' +
      `<button type="button" class="buy-btn" data-buy="${u.id}" aria-describedby="up-${u.id}-why"></button>` +
      `<span class="up-why" id="up-${u.id}-why"></span>` +
      '</div>';
    ui.dockUpList.appendChild(li);
  }
  for (const [part, title] of PAINT_PARTS) {
    const group = document.createElement('div');
    group.className = 'paint-group';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-labelledby', `paint-${part}-h`);
    group.innerHTML = `<h3 id="paint-${part}-h">${title}</h3><div class="swatches"></div>`;
    const row = group.querySelector('.swatches');
    for (const look of LOOKS[part]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `swatch sw-${part}`;
      b.dataset.part = part;
      b.dataset.look = look.id;
      const [c1, c2 = c1] = look.swatch.map(hexColor);
      b.innerHTML = `<span class="chip" style="--c1:${c1};--c2:${c2}" aria-hidden="true"></span><span class="sw-name">${look.name}</span>`;
      row.appendChild(b);
    }
    ui.dockPaint.appendChild(group);
  }
  ui.dockUpList.addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-buy]');
    if (!b) return;
    // A double-click (or double-tap) is one purchase, not two. A purchase rebuilds the ship, which
    // can hold up a slow device for longer than a double-click lasts, so the second click is often
    // handled well after it happened: it is the second click of a multi-click (detail 2), and its
    // input time (timeStamp) falls before the first purchase finished. Keyboard clicks have detail 0.
    // Only a click that bought something holds off the next one: after a refused click (too little
    // gold) the next click buys as soon as the chest can pay.
    const id = b.dataset.buy;
    const now = performance.now();
    const at = e.timeStamp > 0 && e.timeStamp <= now ? e.timeStamp : now;
    if (dock.lastBuy.id === id && (e.detail > 1 || at - dock.lastBuy.at < 400)) return;
    // from when this purchase finished
    dock.lastBuy = buyUpgrade(id) ? { id, at: performance.now() } : { id: '', at: -Infinity };
  });
  // A held Enter clicks again on every auto-repeat: one press is one purchase (or one paint).
  ui.dockPanel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.repeat && e.target instanceof HTMLButtonElement) e.preventDefault();
  });
  ui.dockPaint.addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-look]');
    if (b) setPaint(b.dataset.part, b.dataset.look);
  });
  for (const t of ui.dockTabs) {
    t.addEventListener('click', () => setDockTab(t.dataset.tab));
    // Tabs: ←/→ (and Home/End) move between them, as in any tab list.
    t.addEventListener('keydown', (e) => {
      const i = ui.dockTabs.indexOf(t);
      const n = ui.dockTabs.length;
      let j = -1;
      if (e.key === 'ArrowRight') j = (i + 1) % n;
      else if (e.key === 'ArrowLeft') j = (i - 1 + n) % n;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = n - 1;
      if (j < 0) return;
      e.preventDefault();
      e.stopPropagation();
      setDockTab(ui.dockTabs[j].dataset.tab);
    });
  }
  ui.dockExits.addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-exit]');
    if (b) leaveDock(b.dataset.exit);
  });
}

function renderDockExits() {
  const next = state.level < LEVELS.length ? LEVELS[state.level].env.meta.name : '';
  const here = LEVELS[state.level - 1].env.meta.name;
  const label = {
    next: `Set sail for ${next}`,
    retry: `Try again: ${here}`,
    menu: 'Main menu',
    title: 'Back to the title',
  };
  ui.dockExits.innerHTML = '';
  dockExits(dock.from).forEach((action, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = i === 0 ? 'btn' : 'btn alt';
    b.id = `dock-${action}-btn`;
    b.dataset.exit = action;
    b.textContent = label[action];
    ui.dockExits.appendChild(b);
  });
}

// Bring the panel up to date with the chest and the ship (the rows are built once, so focus stays put).
function renderDock() {
  dock.shownPurse = state.purse;
  const gold = String(state.purse);
  if (ui.dockChestGold.textContent !== gold) ui.dockChestGold.textContent = gold;
  for (const li of ui.dockUpList.children) {
    const id = li.dataset.id;
    const u = UPGRADES.find((x) => x.id === id);
    const tier = shipConfig.up[id];
    const max = maxTier(id);
    const cost = nextCost(shipConfig, id);
    const pips = li.querySelector('.pips');
    pips.innerHTML = '<i></i>'.repeat(max);
    [...pips.children].forEach((p, i) => p.classList.toggle('on', i < tier));
    pips.setAttribute('aria-label', `Upgraded ${tier} of ${max}`);
    li.querySelector('.up-values').innerHTML =
      cost === null
        ? `<b>${statText(id, tier)}</b> <span class="up-max">(best)</span>`
        : `<b>${statText(id, tier)}</b> <span class="arrow" aria-hidden="true">&rarr;</span><span class="sr-only"> next: </span> <b class="up-next">${statText(id, tier + 1)}</b>`;
    const btn = li.querySelector('.buy-btn');
    const why = li.querySelector('.up-why');
    let reason = '';
    if (cost === null) {
      btn.innerHTML = '<span class="buy-word">Maxed</span>';
      btn.setAttribute('aria-label', `${u.name}: maxed`);
      reason = 'Fully upgraded';
    } else {
      btn.innerHTML = `<span class="buy-word">Buy</span><span class="buy-cost"><span class="coin" aria-hidden="true"></span>${cost}</span>`;
      btn.setAttribute('aria-label', `Buy ${cost} gold: ${u.name}`); // starts with what the button says (Buy 300)
      if (state.purse < cost) reason = `Need ${cost - state.purse} more gold`;
    }
    // Out-of-reach buttons stay focusable (aria-disabled) so focus never drops out of the panel
    // after a purchase, and the reason is read with the button.
    btn.setAttribute('aria-disabled', String(!!reason));
    btn.classList.toggle('maxed', cost === null);
    why.textContent = reason;
    li.classList.toggle('maxed', cost === null);
    li.classList.toggle('poor', cost !== null && !!reason);
  }
  for (const b of ui.dockPaint.querySelectorAll('[data-look]')) {
    b.setAttribute('aria-pressed', String(shipConfig.look[b.dataset.part] === b.dataset.look));
  }
}

// ---- View: a slow sway across the allowed angles; drag (or ←/→) to turn it ----
function resumeDockSway() {
  const v = env.view;
  const u = clamp((dock.a - v.yaw) / (v.yawRange || 1), -1, 1);
  // Carry on from here, heading back toward the middle first.
  dock.phase = u > 0 ? Math.PI - Math.asin(u) : Math.asin(u);
  dock.idle = 0;
}

function nudgeDockView(dir) {
  if (state.mode !== 'dock' || !env.view) return;
  const v = env.view;
  dock.a = clamp(dock.a + dir * Math.max(0.06, v.yawRange * 0.25), v.yaw - v.yawRange, v.yaw + v.yawRange);
  resumeDockSway();
}

function endDockDrag(e) {
  if (!dock.drag || (e && e.pointerId !== dock.drag.id)) return;
  dock.drag = null;
  document.body.classList.remove('dragging');
  if (state.mode === 'dock') resumeDockSway();
}

ui.canvas.addEventListener('pointerdown', (e) => {
  if (state.mode !== 'dock' || dock.drag || activeModal()) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  dock.drag = { id: e.pointerId, x: e.clientX };
  try {
    ui.canvas.setPointerCapture(e.pointerId);
  } catch {
    // Synthetic events have no capturable pointer.
  }
  document.body.classList.add('dragging');
});
ui.canvas.addEventListener('pointermove', (e) => {
  const d = dock.drag;
  if (!d || e.pointerId !== d.id || state.mode !== 'dock') return;
  const v = env.view;
  const dx = e.clientX - d.x;
  d.x = e.clientX;
  // Dragging across the whole free area sweeps a bit more than the allowed range.
  const width = Math.max(240, dockLayout ? dockLayout.fw : window.innerWidth);
  dock.a = clamp(dock.a - (dx / width) * v.yawRange * 2.4, v.yaw - v.yawRange, v.yaw + v.yawRange);
  dock.idle = 0;
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) ui.canvas.addEventListener(type, endDockDrag);

// Frame the ship in the free space beside the panel (above it when the panel is a bottom sheet):
// the camera's full frame is that free area, the canvas shows it plus what lies under the panel.
const fitT = new THREE.Vector3();
const fitP = new THREE.Vector3();
const fitF = new THREE.Vector3();
const fitR = new THREE.Vector3();
const fitU = new THREE.Vector3();
const fitD = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
function dockFraming() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  // Layout box of the panel, without the transform of its slide-in animation.
  const p = ui.dockPanel;
  const r = { left: p.offsetLeft, top: p.offsetTop, width: p.offsetWidth, height: p.offsetHeight };
  r.right = r.left + r.width;
  let fx = 0;
  let fy = 0;
  let fw = W;
  let fh = H;
  // Same test as the stylesheet, which makes the panel a bottom sheet on every portrait screen
  // (capped at 620px wide, so on a wide portrait screen it doesn't span the width).
  const sheet = window.matchMedia?.('(orientation: portrait)').matches ?? r.width > W * 0.7;
  if (r.width && r.height) {
    if (sheet) fh = clamp(r.top, H * 0.25, H);
    else if (r.left > W * 0.3) fw = clamp(r.left, W * 0.3, W);
    else {
      fx = r.right;
      fw = W - r.right;
    }
  }
  // How far the ship reaches from the view axis (tangents), over every angle the camera can take.
  const v = env.view;
  const b = env.berth;
  const sup = dock.sup;
  fitT.set(v.target[0], v.target[1], v.target[2]);
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  const ch = Math.cos(b.h);
  const sh = Math.sin(b.h);
  for (let i = 0; i <= 6 && sup; i++) {
    const a = v.yaw - v.yawRange + (2 * v.yawRange * i) / 6;
    fitP.set(fitT.x + Math.sin(a) * v.dist, fitT.y + v.height, fitT.z + Math.cos(a) * v.dist);
    fitF.subVectors(fitT, fitP).normalize();
    fitR.crossVectors(fitF, WORLD_UP).normalize();
    fitU.crossVectors(fitR, fitF);
    for (let k = 0; k < sup.d.length; k++) {
      if (sup.d[k] === -Infinity) continue;
      const lx = sup.pts[k * 3];
      const ly = sup.pts[k * 3 + 1];
      const lz = sup.pts[k * 3 + 2];
      fitD.set(b.x + lx * ch + lz * sh - fitP.x, ly - fitP.y, b.z - lx * sh + lz * ch - fitP.z);
      const z = fitD.dot(fitF);
      if (z < 0.5) continue;
      const x = fitD.dot(fitR) / z;
      const y = fitD.dot(fitU) / z;
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
    }
  }
  const aspect = fw / fh;
  let tanV = Math.tan((50 * Math.PI) / 360);
  let cx = 0;
  let cy = 0;
  if (xMax > xMin && yMax > yMin) {
    // The ship (at its widest angle) fills most of the free area, centred in it by a lens shift,
    // big enough to watch the crew at work; the town shows around and behind it. Big views
    // leave a little more room around it than a phone does.
    const k = clamp((Math.min(fw, fh * 1.4) - 340) / 460, 0, 1);
    const fillX = 0.92 - 0.12 * k;
    const fillY = 0.88 - 0.1 * k;
    tanV = Math.max((yMax - yMin) / 2 / fillY, (xMax - xMin) / 2 / (aspect * fillX));
    tanV = clamp(tanV, Math.tan((22 * Math.PI) / 360), Math.tan((80 * Math.PI) / 360));
    cx = (xMax + xMin) / 2;
    // Spare height goes mostly above the ship, where the town rises behind it, not to empty sea.
    const slack = Math.max(0, 2 * tanV - (yMax - yMin));
    cy = yMax + 0.62 * slack - tanV;
  }
  camera.fov = (Math.atan(tanV) * 360) / Math.PI;
  const offX = (cx / (tanV * aspect)) * (fw / 2) - fx;
  const offY = -(cy / tanV) * (fh / 2) - fy;
  camera.setViewOffset(fw, fh, offX, offY, W, H); // also sets camera.aspect = fw / fh
  dockLayout = { fx, fy, fw, fh, sheet };
}

const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
const reducedMotion = () => !!reducedMotionQuery?.matches;

function updateDockCamera(dt) {
  const v = env.view;
  if (!dockLayout) dockFraming();
  if (!dock.drag) {
    dock.idle += dt;
    // The slow sway is decoration: not for players who asked for less motion.
    if (dock.idle > 2.5 && !reducedMotion()) {
      const ramp = Math.min(1, (dock.idle - 2.5) / 2); // ease back into the sway
      dock.phase += dt * 0.14 * ramp;
      dock.a = v.yaw + v.yawRange * Math.sin(dock.phase);
    }
  }
  dock.a = clamp(dock.a, v.yaw - v.yawRange, v.yaw + v.yawRange);
  const [tx, ty, tz] = v.target;
  camera.position.set(tx + Math.sin(dock.a) * v.dist, ty + v.height, tz + Math.cos(dock.a) * v.dist);
  camera.lookAt(tx, ty, tz);
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
function setClass(el, key, cls, on, force) {
  const k = key + cls;
  if (force || shown[k] !== on) {
    el.classList.toggle(cls, on);
    shown[k] = on;
  }
}

function updateHud(force = false, dt = 0) {
  if (!player) return;
  const hpPct = (player.hp / player.maxHp) * 100;
  setWidth(ui.hullFill, 'hp', hpPct, force);
  // The pale "ghost" segment lingers after a hit so you can see how much it took.
  if (state.ghostHold > 0) state.ghostHold = Math.max(0, state.ghostHold - dt);
  else state.ghostPct += (hpPct - state.ghostPct) * Math.min(1, dt * 4);
  if (state.ghostPct < hpPct || force) state.ghostPct = hpPct;
  setWidth(ui.hullGhost, 'ghost', state.ghostPct, force);
  const cls = hpPct > 50 ? 'good' : hpPct > 25 ? 'warn' : 'bad';
  if (force || shown.hpCls !== cls) {
    ui.hullFill.className = `fill ${cls}`;
    shown.hpCls = cls;
  }
  const def = LEVELS[state.level - 1];
  setText(ui.levelName, 'level', `${state.level}. ${def.env.meta.name}`, force);
  const alive = enemies.filter(fighting).length;
  const pending = def.waves.slice(state.wave + 1).reduce((n, w) => n + w.length, 0);
  setText(ui.ships, 'ships', pending ? `${alive} +${pending}` : `${alive}`, force);
  setText(ui.gold, 'gold', state.gold, force);
  setText(ui.sails, 'sails', `${SAIL_NAMES[state.sail]} ${'▮'.repeat(state.sail)}${'▯'.repeat(3 - state.sail)}`, force);
  const t = player.type;
  setWidth(ui.reloadPort, 'rp', (1 - player.reload.port / t.reload) * 100, force);
  setWidth(ui.reloadStar, 'rs', (1 - player.reload.star / t.reload) * 100, force);
  // Gun lights: loaded, and a pirate inside that side's firing arc.
  const live = !player.sinking && state.mode === 'playing';
  setClass(ui.gunPort, 'gp', 'ready', live && player.reload.port === 0, force);
  setClass(ui.gunStar, 'gs', 'ready', live && player.reload.star === 0, force);
  setClass(ui.gunPort, 'gp', 'target', live && enemies.some((e) => inArc(player, e, -1)), force);
  setClass(ui.gunStar, 'gs', 'target', live && enemies.some((e) => inArc(player, e, 1)), force);

  const boss = enemies.find((e) => e.type.boss && e.hp > 0 && !e.captured && !e.escaped);
  if (force || shown.boss !== !!boss) {
    show(ui.boss, !!boss);
    shown.boss = !!boss;
    if (boss) ui.bossName.textContent = boss.type.name;
  }
  if (boss) setWidth(ui.bossFill, 'bossHp', (boss.hp / boss.maxHp) * 100, force);
}

// Minimap rotates with the ship so "up" is always the bow.
function drawMinimap() {
  if (!mm) return;
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
  mm.strokeStyle = '#ff3b1f';
  mm.lineWidth = 2;
  for (const b of bombs) {
    const [x, y] = toMap(b.tx, b.tz);
    mm.beginPath();
    mm.arc(x, y, Math.max(3, BOMB_RADIUS * scale), 0, Math.PI * 2);
    mm.stroke();
  }
  mm.fillStyle = '#ffc93c';
  for (const co of coins) {
    const [x, y] = toMap(co.x, co.z);
    mm.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  for (const e of enemies) {
    if (!fighting(e)) continue;
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
// What env.update(t, dt, ctx) gets besides the visual time: the simulated time (moving obstacles are
// placed by it) and the camera.
const envFrame = { simTime: 0, camera };

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

  if (s.tag) {
    s.tag.position.set(s.x, wy + s.tagY, s.z);
    // Keep the tag about the same size on screen, and hide it right in front of the lens.
    const d = s.tag.position.distanceTo(camera.position);
    s.tag.visible = s.hp > 0 && d > 10;
    const pulse = s.flash > 0 ? 1 + s.flash : 1;
    s.tag.scale.setScalar(clamp(d / 30, 0.6, 2.6) * pulse);
    s.tag.quaternion.copy(camera.quaternion);
    setTag(s.tag, s.hp / s.maxHp);
  }
}

const chasePos = new THREE.Vector3(); // where the chase camera wants to be (smoothed)
const camLook = new THREE.Vector3();
const camFar = new THREE.Vector3();
const camStart = new THREE.Vector3();
const camFinal = new THREE.Vector3();
let boom = 1; // fraction of the chase boom kept clear of land (camera collision)
let camSide = 0; // sideways look shift toward a nearby pirate

// Place the chase camera straight behind the player.
function snapCamera() {
  if (!player) return;
  chasePos.set(player.x - fwdX(player.h) * CHASE_BACK, CHASE_UP, player.z - fwdZ(player.h) * CHASE_BACK);
  camera.position.copy(chasePos);
  camera.lookAt(player.x + fwdX(player.h) * CHASE_AHEAD, 1.5, player.z + fwdZ(player.h) * CHASE_AHEAD);
  boom = 1;
  camSide = 0;
}

// Shorten the boom from the ship to the camera so it never ends up inside land.
function collideCamera(dt) {
  const px = player.x;
  const pz = player.z;
  const py = 3;
  let hit = 1;
  const N = 24;
  for (let i = 1; i <= N; i++) {
    const f = i / N;
    const x = px + (chasePos.x - px) * f;
    const y = py + (chasePos.y - py) * f;
    const z = pz + (chasePos.z - pz) * f;
    let blocked = env.heightAt ? env.heightAt(x, z) + 1.5 > y : false;
    if (!blocked) {
      for (const c of colliders) {
        if (c.h > y - 0.5 && Math.hypot(x - c.x, z - c.z) < c.r + 1) {
          blocked = true;
          break;
        }
      }
    }
    if (blocked) {
      hit = f;
      break;
    }
  }
  const len = Math.hypot(chasePos.x - px, chasePos.z - pz) || 1;
  const target = hit < 1 ? Math.max(5 / len, hit - 1 / len) : 1;
  boom = target < boom ? target : boom + (target - boom) * Math.min(1, dt * 2);
  camFinal.set(px + (chasePos.x - px) * boom, py + (chasePos.y - py) * boom + (1 - boom) * 5, pz + (chasePos.z - pz) * boom);
}

function updateCamera(dt, paused) {
  if (player) {
    const fx = fwdX(player.h);
    const fz = fwdZ(player.h);
    const k = Math.min(1, dt * 3);
    chasePos.x += (player.x - fx * CHASE_BACK - chasePos.x) * k;
    chasePos.z += (player.z - fz * CHASE_BACK - chasePos.z) * k;
    chasePos.y += (CHASE_UP - chasePos.y) * k;
    collideCamera(dt);
    camera.position.copy(camFinal);

    // Ease the view sideways toward the nearest pirate in range, so a broadside target stays on screen.
    let want = 0;
    let best = MAX_RANGE + 10;
    for (const e of enemies) {
      if (!fighting(e)) continue;
      const r = relative(player, e.x, e.z);
      if (r.dist < best) {
        best = r.dist;
        want = Math.sign(r.lat) * 9 * clamp(1 - Math.abs(r.along) / 30, 0, 1) * Math.min(1, camera.aspect);
      }
    }
    camSide += (want - camSide) * Math.min(1, dt * 2);
    camLook.set(
      player.x + fx * CHASE_AHEAD + rightX(player.h) * camSide,
      1.5,
      player.z + fz * CHASE_AHEAD + rightZ(player.h) * camSide
    );

    if (state.intro > 0) {
      // Level fly-in: start high above and behind, looking out over the level, then swoop down.
      const u = 1 - state.intro / INTRO_TIME;
      const e = u * u * (3 - 2 * u);
      const v = env.volcano;
      if (v) camFar.set(v.x, v.craterY * 0.75, v.z);
      else camFar.set(player.x + fx * 70, 4, player.z + fz * 70);
      camStart.set(player.x - fx * 48, 42, player.z - fz * 48);
      camera.position.lerpVectors(camStart, camFinal, e);
      camLook.lerpVectors(camFar, camLook, e);
    }
    if (state.shake > 0 && !paused) {
      state.shake = Math.max(0, state.shake - dt);
      camera.position.x += (Math.random() - 0.5) * state.shake;
      camera.position.y += (Math.random() - 0.5) * state.shake;
    }
    camera.lookAt(camLook);
  } else if (state.mode === 'dock' && dock.ship) {
    updateDockCamera(dt);
  } else if (env) {
    const ps = env.playerStart;
    // Frame the title-screen ship in the free margin beside the menu panel.
    if (!menuLayout) {
      const panel = ui.menu.querySelector?.('.panel');
      const pr = panel ? panel.getBoundingClientRect() : { left: 0 };
      menuLayout = { left: pr.left, fits: pr.left >= 0.38 * window.innerHeight };
      if (menuLayout.fits) {
        const W = window.innerWidth;
        const H = window.innerHeight;
        camera.setViewOffset(W, H, W / 2 - pr.left / 2, 0, W, H);
      } else {
        camera.clearViewOffset();
      }
    }
    if (menuShipMesh) {
      menuShipMesh.visible = menuLayout.fits;
      menuShipMesh.position.set(ps.x, ocean.heightAt(ps.x, ps.z, visualTime), ps.z);
      menuShipMesh.rotation.set(Math.sin(visualTime * 0.9) * 0.03, ps.h + 0.6, Math.sin(visualTime * 1.3) * 0.05);
      animateShip(menuShipMesh, visualTime, 0.4);
    }
    const a = visualTime * 0.08;
    camera.position.set(ps.x + Math.sin(a) * 26, 9, ps.z + Math.cos(a) * 26);
    camera.lookAt(ps.x, 3, ps.z);
  }
}

const gl = view.renderer.getContext();
function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta();
  // Nothing can be drawn; the game is paused (see onContextLost). The context can be gone a moment
  // before the 'webglcontextlost' event says so: don't build shaders on a dead context then.
  if (state.contextLost || gl.isContextLost()) return;
  trackPerformance(rawDt);
  const dt = Math.min(rawDt, MAX_FRAME_DT);
  audio.update(dt);
  const paused = state.mode === 'paused';
  // While paused the picture doesn't change: draw it once, then idle.
  if (!paused) pausedDrawn = false;
  else if (pausedDrawn) return;

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
  if (state.mode === 'dock' && dock.ship) {
    poseDockShip(t);
    if (dock.shownPurse !== state.purse) renderDock(); // the chest changed behind the panel's back
  }
  for (const e of enemies) {
    if (!paused) e.flash = Math.max(0, e.flash - dt);
    syncShip(e, t);
  }
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
    b.zone.position.set(b.tx, ocean.heightAt(b.tx, b.tz, t) + 0.25, b.tz);
    b.zone.userData.disc.scale.setScalar(Math.max(0.05, u));
  }
  zoneRingMat.opacity = 0.65 + 0.25 * Math.sin(t * 12);
  zoneDiscMat.opacity = 0.25 + 0.1 * Math.sin(t * 12);

  updateCamera(dt, paused);

  const focusX = player ? player.x : camera.position.x;
  const focusZ = player ? player.z : camera.position.z;
  ocean.update(t, focusX, focusZ);
  sky.update(camera);
  clouds.update(paused ? 0 : dt, focusX, focusZ);
  if (env && !paused) {
    envFrame.simTime = state.time;
    env.update(t, dt, envFrame);
  }
  if (state.mode === 'dock' && t < dock.cheerUntil) for (const p of dock.cheering) animatePerson(p, t, 'cheer');

  if (state.mode !== 'menu' && state.mode !== 'dock') {
    updateHud(false, paused ? 0 : dt);
    drawMinimap();
  }
  view.renderer.info.reset();
  view.render(scene, camera);
  if (paused) pausedDrawn = true;
}

resize();
updateMuteButtons();
showMenu();
frame();
window.__gameReady = true;

// Exposed for automated tests and console tinkering.
window.__game = {
  state,
  audio,
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
  inArc,
  damage,
  relative,
  launchBomb,
  step,
  // Still in the fight (afloat, not captured, escaped or surrendered).
  fighting,
  // Put a ship somewhere (tests): position, and heading when given.
  place(ship, x, z, h) {
    if (!ship) return;
    ship.x = x;
    ship.z = z;
    if (h !== undefined) ship.h = h;
  },
  // ---- "Boarders Away!" test API (SPEC2 §9.3): placeholders with safe defaults until the systems land.
  combat: {
    rules: {},
    get ammo() {
      return 'round';
    },
    setAmmo: () => false,
    cycleAmmo: () => 'round',
    get unlockedAmmo() {
      return ['round'];
    },
    seed: () => {},
    forceCrit: () => {},
    get log() {
      return [];
    },
    setCrew: () => false,
  },
  grapple: () => ({ ok: false, reason: 'none' }),
  boarding: {
    get active() {
      return false;
    },
    get phase() {
      return null;
    },
    get kind() {
      return null;
    },
    get target() {
      return null;
    },
    get heave() {
      return 0;
    },
    get last() {
      return null;
    },
    odds: () => null,
    heavePress: () => 0,
    cut: () => false,
    cutHold: () => {},
    skip: () => {},
    resolveNow: () => false,
  },
  get crew() {
    return { crew: 0, max: 0 };
  },
  spawn: () => null,
  mechanics: {
    get state() {
      return {};
    },
  },
  armory: {
    get config() {
      return null;
    },
    set: () => false,
    buy: () => false,
  },
  get feats() {
    return null;
  },
  setFeats: () => false,
  get look() {
    return null;
  },
  get tips() {
    return 0;
  },
  // Validated and saved; the player's ship is rebuilt at the next level (and at once in the shipyard).
  setShipConfig(cfg) {
    shipConfig = parseShipConfig(cfg);
    // (Upgrades bought but not saved are replaced: their gold, still in the saved chest, comes back.)
    state.purse = clamp(state.purse + unsavedSpend, 0, MAX_GOLD);
    unsavedSpend = 0;
    saveShipConfig(shipConfig);
    if (state.mode === 'dock') {
      rebuildDockShip();
      renderDock();
    }
    return parseShipConfig(shipConfig);
  },
  wardrobe: {
    wear: () => ({ ok: false, reason: 'unknown' }),
    buy: () => ({ ok: false, reason: 'unknown' }),
  },
  town: {
    get active() {
      return false;
    },
    get view() {
      return null;
    },
    get pos() {
      return null;
    },
    get place() {
      return null;
    },
    get walk() {
      return null;
    },
    get captain() {
      return null;
    },
    setMove: () => {},
    walkTo: () => false,
    goTo: () => false,
    interact: () => false,
    open: () => false,
    back: () => false,
    simulate: () => {},
  },
  // The shipyard: open('menu' | 'levelDone' | 'over' | 'won'), leave(['next' | 'retry' | 'menu' | 'title'];
  // default: the main way out for where it was opened from), buy(upgrade id), paint(part, look id).
  dock: {
    open: (from) => openDock(from),
    leave: (action) => leaveDock(action),
    buy: (id) => buyUpgrade(id),
    paint: (part, id) => setPaint(part, id),
    get from() {
      return state.mode === 'dock' ? dock.from : null;
    },
    get ship() {
      return dock.ship;
    },
    // Where the ship is framed: the free area beside (or above) the panel, in CSS pixels.
    get layout() {
      return dockLayout ? { ...dockLayout, fov: camera.fov, angle: dock.a } : null;
    },
    // Which dock view is showing (only the shipyard until the town arrives).
    get view() {
      return state.mode === 'dock' ? 'shop' : null;
    },
    ashore: () => false,
    back: () => false,
  },
  camera,
  scene,
  get shipConfig() {
    return parseShipConfig(shipConfig); // a copy
  },
  get renderInfo() {
    return { ...view.renderer.info.render };
  },
  get quality() {
    return { level: perf.level, scale: QUALITY_STEPS[perf.level], pixelRatio: view.renderer.getPixelRatio() };
  },
};
