import * as THREE from 'three';
import { SHIP_TYPES, gunOffset } from './shipTypes.js';
import { buildShip, animateShip, disposeShip, projectileMesh, addHole, clearHoles, setShipDamage, hoistFlag } from './ships.js';
import { createRenderer, createOcean, createSky, createClouds, createLights, applyPalette } from './scenery.js';
import { toon, noOutline, gradientMap } from './style.js';
import { createAudio } from './audio.js';
import { buildPerson, animatePerson, disposePerson, releaseSharedPeople } from './people.js';
import * as sparrow from './env/sparrow.js';
import { LEVELS } from './levels.js';
// "Boarders Away!" (SPEC2): the combat rules, the tavern upgrades, the looks and feats records, the enemy
// name tags, the pop words and the sailors that go overboard.
import * as combat from './combat.js';
import {
  AMMO,
  AMMO_IDS,
  AMMO_SWAP,
  CRIT,
  EFFECTS,
  STATES,
  CREW,
  BOARD,
  RAIDERS,
  CAPTURE,
  WORDS,
  mulberry32,
  shotResult,
  ammoUnlocked,
  captureGold,
  plunderGold,
} from './combat.js';
import { parseArmoryConfig, serializeArmoryConfig, armoryStats, armoryNextCost } from './armory.js';
import {
  parseLook,
  serializeLook,
  sanitizeLook,
  parseFeats,
  serializeFeats,
  FEAT_IDS,
  captainOpts,
  crewOpts,
  enemyCrewOpts,
  wear as wearItem,
  buy as buyItem,
} from './cosmetics.js';
import { createTags } from './tags.js';
import { createPops } from './pops.js';
import { createOverboard } from './overboard.js';
import { createBoarding } from './boarding.js';
import { createMechanics } from './mechanics.js';
// The dock's other views: walking round the island, Polly's wardrobe and the tavern (townMode.js, town.js).
import { createTownMode } from './townMode.js';
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
const ICE_SLOW = 0.55; // speed multiplier for every ship on an ice floe (Frostbite Straits)
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
const ARMORY_KEY = 'pirates-ahoy-armory'; // the tavern's crew upgrades (see armory.js)
const LOOK_KEY = 'pirates-ahoy-look'; // the captain's and the crew's looks (see cosmetics.js)
const FEATS_KEY = 'pirates-ahoy-feats'; // captures, boardings, rakes, crits... (trophies, see cosmetics.js)
const TIPS_KEY = 'pirates-ahoy-tips'; // one-time battle tips already shown (bitmask, see showTip())
const HELM_SCALE = 1.1; // the captain at the helm: his hands meet the Sea Biscuit's wheel at this scale (people.js WHEEL)
const LIST_BATTERED = 0.04; // radians a battered ship lists toward the side with more hits
const LIST_WRECKED = 0.09;
const WRECK_SIT = 0.15; // a wreck sits this much lower in the water
const AMMO_NAMES = { round: 'Round', chain: 'Chain', grape: 'Grape' };
// Ammo icons (gun card and the touch Ammo pill): round shot, two half-balls on a chain, a bunch of grape shot.
const AMMO_SVG = 'viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
const AMMO_INK = 'stroke="#1d1330" stroke-width="2" stroke-linejoin="round"';
const AMMO_ICONS = {
  round: `<svg ${AMMO_SVG}><circle cx="12" cy="12.5" r="8" fill="#3a3443" ${AMMO_INK}/><circle cx="9.2" cy="9.6" r="2.2" fill="#fff" opacity=".75"/></svg>`,
  chain:
    `<svg ${AMMO_SVG}><path d="M7.5 12.5h9" stroke="#1d1330" stroke-width="4.4" stroke-linecap="round"/><path d="M7.5 12.5h9" stroke="#b9b2c4" stroke-width="1.8" stroke-dasharray="2.2 1.4"/>` +
    `<path d="M7.5 6.6a5.9 5.9 0 0 0 0 11.8z" fill="#3a3443" ${AMMO_INK}/><path d="M16.5 6.6a5.9 5.9 0 0 1 0 11.8z" fill="#3a3443" ${AMMO_INK}/></svg>`,
  grape:
    `<svg ${AMMO_SVG}><g fill="#3a3443" ${AMMO_INK}><circle cx="8" cy="15.6" r="3.6"/><circle cx="16" cy="15.6" r="3.6"/><circle cx="12" cy="18.6" r="3.6"/>` +
    '<circle cx="8.4" cy="8.6" r="3.6"/><circle cx="15.6" cy="8.6" r="3.6"/><circle cx="12" cy="12" r="3.6"/></g></svg>',
};
// One-time battle tips (bits of TIPS_KEY, SPEC2 §5.5).
const TIP = { board: 1, chain: 2, grape: 4, raiders: 8, ashore: 16, rake: 32, counter: 64, surrender: 128 };
// Why an ammo can't be loaded yet (hint bubble), and the level that unlocks it.
const AMMO_LOCKED = { chain: 'Chain shot unlocks after the Coast of Europe', grape: 'Grape shot unlocks after the Bali Islands' };

// The levels (environment, enemy waves, difficulty knobs, audio scene, finale) live in levels.js.
// Beating a finale level wins the voyage (the Victory screen); so does beating the last level.
const isFinale = (n) => !!LEVELS[n - 1]?.finale || n >= LEVELS.length;

// ---------------------------------------------------------------------------
// Helpers (mulberry32, the seeded random numbers, comes from combat.js)
// ---------------------------------------------------------------------------
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
  menuLive: $('menu-live'),
  pause: $('pause-screen'),
  pauseChoices: $('pause-choices'),
  pauseConfirm: $('pause-confirm'),
  quitDock: $('quit-dock-btn'),
  quitMenu: $('quit-menu-btn'),
  leavePrompt: $('leave-prompt'),
  leaveQ: $('leave-q'),
  leaveWhy: $('leave-why'),
  leaveNo: $('leave-no-btn'),
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
  dockAshore: $('dock-ashore-btn'),
  townScreen: $('town-screen'),
  townMute: $('town-mute'),
  wardrobeScreen: $('wardrobe-screen'),
  tavernScreen: $('tavern-screen'),
  harbourDialog: $('harbour-dialog'),
  aboardDialog: $('aboard-dialog'),
  wonText: $('won-text'),
  wonHint: $('won-hint'),
  act2Btn: $('act2-btn'),
  againBtn: $('again-btn'),
  crewChip: $('crew-chip'),
  crewNum: document.querySelector('#crew-chip .crew-num') || document.createElement('b'),
  firePort: document.querySelector('#gun-port .fire-tag') || document.createElement('span'),
  fireStar: document.querySelector('#gun-star .fire-tag') || document.createElement('span'),
  ammoIcon: document.querySelector('#gun-ammo .ammo-ico') || document.createElement('span'),
  gunAmmo: $('gun-ammo'),
  ammoName: $('ammo-name'),
  gunBoard: $('gun-board'),
  boardTag: $('board-tag'),
  touchAct: document.querySelector('.touch .pad.act') || document.createElement('div'),
  touchAmmo: $('touch-ammo'),
  touchBoard: $('touch-board'),
  bossCrew: $('boss-crew'),
  bossCrewFill: $('boss-crew-fill'),
  objective: $('objective'),
  boardingStrip: $('boarding-strip'),
  pops: $('pops'),
  gameLive: $('game-live'),
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
// Feats counted in battle (rakes, crits, captures...) are saved at the end of a level, on pause, when the
// page is hidden and when leaving to the menu or the dock (not on every shot). Another tab may have saved
// its own counts since: this tab's new counts go on top of those (syncFeats), never over them.
function saveFeats() {
  if (!featsDirty) return;
  syncFeats();
  if (saveRecord(FEATS_KEY, serializeFeats, feats)) {
    featsSaved = parseFeats(feats);
    featsDirty = false;
  }
}
// The saved feats changed in another tab since this one last read or wrote them: take them, plus what this
// tab has counted and not saved yet (its feats minus what was saved when it last read or wrote them).
function syncFeats() {
  const raw = readRaw(FEATS_KEY);
  if (raw === null) return false;
  const saved = parseFeats(raw);
  if (serializeFeats(saved) === serializeFeats(featsSaved)) return false;
  const next = parseFeats(saved);
  const more = (a, b) => Math.max(0, (Number(a) || 0) - (Number(b) || 0));
  for (const id of FEAT_IDS) next[id] = (next[id] || 0) + more(feats[id], featsSaved[id]);
  const mine = feats.prizes || {};
  const base = featsSaved.prizes || {};
  next.prizes = { ...(next.prizes || {}) };
  for (const type of Object.keys(mine)) {
    const n = more(mine[type], base[type]);
    if (n) next.prizes[type] = (next.prizes[type] || 0) + n;
  }
  feats = parseFeats(next); // (validated: legend stays 0 or 1, every counter in range)
  featsSaved = saved;
  return true;
}
// The tavern's record changed in another tab: take it (a purchase there must not be undone here).
function syncArmory() {
  const raw = readRaw(ARMORY_KEY);
  if (raw === null || raw === serializeArmoryConfig(armoryCfg)) return false;
  const next = parseArmoryConfig(raw);
  if (serializeArmoryConfig(next) === serializeArmoryConfig(armoryCfg)) return false;
  armoryCfg = next;
  return true;
}
// The look record (Polly's) changed in another tab: take it, so that a write here never drops an item
// bought there. (This tab only changes its own look after saving it, so the saved record already holds
// every item this tab bought.) Returns whether the look changed.
function syncLook() {
  const raw = readRaw(LOOK_KEY);
  if (raw === null || raw === lookSeen) return false;
  lookSeen = raw;
  const next = sanitizeLook(parseLook(raw), feats);
  if (serializeLook(next) === serializeLook(look)) return false;
  look = next;
  return true;
}
// Save a look (a validated record); the in-memory look is the caller's to set.
function saveLook(next) {
  if (!saveRecord(LOOK_KEY, serializeLook, next)) return false;
  lookSeen = serializeLook(next);
  return true;
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
  for (const btn of [ui.muteBtn, ui.menuMute, ui.dockMute, ui.townMute]) {
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
  topInset = 0; // the HUD's top row is measured again (hudTopInset)
  townMode.onResize(); // Polly's and the tavern frame their subject beside the panel again
  menuPin(); // the title's pinned Set sail! row may have changed height
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
// The "Boarders Away!" records (each validated by its module; a record that needed fixing is rewritten).
// Feats first: a trophy worn in the look must have been earned.
let feats = loadRecord(FEATS_KEY, parseFeats, serializeFeats);
let featsDirty = false; // counted this voyage, not saved yet (see saveFeats())
let featsSaved = parseFeats(feats); // the feats as this tab last read or wrote them (see syncFeats())
let look = loadRecord(LOOK_KEY, parseLook, serializeLook);
{
  const clean = sanitizeLook(look, feats);
  if (serializeLook(clean) !== serializeLook(look)) saveRecord(LOOK_KEY, serializeLook, clean);
  look = clean;
}
let lookSeen = readRaw(LOOK_KEY); // the look record as this tab last read or wrote it (see syncLook)
let armoryCfg = loadRecord(ARMORY_KEY, parseArmoryConfig, serializeArmoryConfig); // the tavern's crew upgrades
let tips = loadInt(TIPS_KEY, 0, 255, 0); // one-time tips already shown (SPEC2 §5.5)
// Gameplay dice for hits (crits), reseeded at every level start so a level plays out the same way.
let combatRng = mulberry32(1 * 7919 + 13);
let forcedCrit = null; // tests: null | 'none' | 'crit' | 'rudder' | 'mast' | 'keg' | 'routed'
const shotLog = []; // the last 40 hits (tests: __game.combat.log)
let nextShipId = 1;

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
  // "Boarders Away!"
  ammo: 'round', // loaded in both broadsides (round | chain | grape), back to round at every level start
  crew: 12, // your hands aboard (full at every level start)
  crewMax: 12, // from the tavern's Boarding party upgrade
  critBase: CRIT.base[0], // your crit chance before rakes and point blank (Master gunner)
  hitStop: { left: 0, lastAt: -Infinity }, // a crit freezes the frame for a moment (real seconds)
  flash: { text: '', until: 0 }, // a short message in the hint bubble (why that key did nothing), in simulated time
  tip: { text: '', until: 0 }, // a one-time tip showing in the hint bubble
  ammoTipDue: 0, // bits of the new-ammo tips to show once the fly-in is over
  // Boarding and captures (SPEC2 §3)
  boardCooldown: 0, // seconds until your grapples are coiled again (after any boarding)
  grappleRange: 14, // from the tavern (Long grapples), set at every level start
  reelTime: 1.2,
  blade: 1, // Cutlass drills
  captures: 0, // ships captured this level (prize bonus at the level's end)
  plundered: 0, // gold raiders grabbed this level
  lastCaptureAt: -Infinity,
  lastBossCaptured: '',
  waveHorn: null, // { at, pitch }: the reinforcements' horn, waiting for a capture fanfare to end
  counterBanner: false, // the "Counter-board!" banner is up (it goes when the window closes)
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
// Floating name tags (hull bar, crew pips) above enemy ships, pop words over the view and the
// sailors who go overboard: see tags.js, pops.js and overboard.js.
// ---------------------------------------------------------------------------
const tags = createTags(scene);
// (reducedMotion is declared further down: the lambda reads it when a pop appears.) Pops keep clear of the
// HIT ×N / SUNK! mark (hitmarkRects) and stay below the top HUD row (hudTopInset).
const pops = createPops(ui.pops, camera, {
  reducedMotion: () => reducedMotion(),
  avoid: () => hitmarkRects(),
  insetTop: () => hudTopInset(),
});
const overboardCtx = {
  foam,
  sfx: (name, x, z) => audio.play(name, sfxAt(x, z)),
  heightAt: (x, z, t) => ocean.heightAt(x, z, t),
};
let overboard = createOverboard(scene, overboardCtx);
// Off to the title screen or the dock: the battle's prebuilt people (hidden, but still in the scene) are
// let go, so they don't weigh on those scenes; the next level prebuilds its own.
function releaseBattlePeople() {
  overboard.dispose();
  overboard = createOverboard(scene, overboardCtx);
  boarding.release();
  mechanics.dispose(); // the level's twist ends with the level
  mechanics = createMechanics([], {});
  releaseSharedPeople(); // their shared geometry too, once nobody wears that look any more
  lastLevelStarted = 0;
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
  // Long grapples show as coiled grapnels on the rail (in battle and at the shipyard).
  return buildShip('player', { type, look: shipConfig.look, upgrades: shipConfig.up, armory: { grapple: armoryCfg.up.grapple } });
}

function createShip(typeName, kind, x, z, h) {
  const isPlayer = kind === 'player' && typeName === 'player';
  const type = isPlayer ? playerStats() : SHIP_TYPES[typeName];
  const mesh = isPlayer ? buildPlayerMesh(type) : buildShip(typeName);
  const crew0 = isPlayer ? 0 : Math.max(0, Math.floor(type.crew || 0));
  const ship = {
    id: nextShipId++,
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
    reloadMax: { port: type.reload, star: type.reload }, // the reload a side's last shot set (HUD bars)
    sinking: 0, // > 0 while sinking (seconds since it started)
    roll: 0,
    onReef: false,
    reefIce: false, // the reef it is on is ice (slows every hull)
    mesh,
    tag: null,
    tagY: tagHeight(typeName, mesh),
    flash: 0,
    wakeAcc: 0,
    sprayAcc: 0,
    smokeAcc: 0,
    fxAcc: 0, // battered / wrecked smoke and keg fire, per simulated second
    pinned: 0,
    escapeUntil: 0,
    escapeH: 0,
    // ---- crew (SPEC2 §3.1; the player's crew is state.crew)
    crew0, // full complement
    killed: 0, // lost to grape, crits and boardings
    hpLow: type.hp, // the lowest hull she has had (repairs never bring sailors back)
    crewShown: crew0, // what her tag's pips show (a boarding ticks them down one by one)
    strikeAt: combat.strikeAt(crew0), // the surrender notch
    tagIcon: null, // 'capture' | 'fight' | 'risky' | 'white' | 'hot' | 'cooldown' | null (see tags.js)
    tagCool: 0,
    tagPulse: false, // her tag's hull bar throbs (wrecked)
    surrendered: false,
    captured: false,
    escaped: false,
    removeAt: Infinity,
    boardCooldown: 0,
    // ---- damage (SPEC2 §2.3, §2.4)
    effects: { slow: 0, slowTurn: 0, mast: 0, rudder: 0, burn: 0 }, // seconds left (chain shot, crit effects)
    burnAcc: 0, // seconds towards the next keg-fire tick
    burnTicks: 0, // keg-fire ticks (1 hp each) still to come
    lastEffectAt: -Infinity, // simulated time of her last new crit effect (one per CRIT.effectGap)
    hitsBySide: { port: 0, star: 0 }, // hull hits on each side: she lists toward the side with more
    firstHole: null, // { z, y, side } of her first hole: the battered smoke rises from it
    list: 0, // eased list angle (radians, + = toward starboard)
    rise: 0, // > 0: rising from the deep (the Phantom), the hull sits lower
    captain: null, // the player's captain at the helm (people.js)
  };
  scene.add(mesh);
  if (isPlayer) addHelmCaptain(ship);
  // The boss has its own HUD bar, so it gets no floating tag (tags.add returns null for it).
  if (kind === 'enemy') ship.tag = tags.add(ship);
  return ship;
}

// Your captain at the helm of the Sea Biscuit, in the looks from Polly's (a child of the ship's model).
function addHelmCaptain(ship) {
  const h = ship.mesh.userData.helm;
  if (!h) return;
  let person = null;
  try {
    person = buildPerson({ ...captainOpts(look), scale: HELM_SCALE });
  } catch (err) {
    console.warn('captain at the helm:', err);
    return;
  }
  person.position.set(h.x, h.y, h.z);
  person.rotation.y = h.h;
  person.name = 'helm-captain';
  ship.mesh.add(person);
  ship.captain = person;
  helm.point = -1;
  helm.cheer = -1;
}
// What the helm captain does: 'point' after a broadside, 'cheer' on SUNK! / CAPTURED!, else steer.
const helm = { point: -1, cheer: -1, hidden: false };
function hideHelm(on) {
  helm.hidden = !!on;
  if (player && player.captain) player.captain.visible = !helm.hidden;
}

function removeShip(s) {
  // The captain is ours (people.js), not part of the ship model: off the ship before it is disposed.
  if (s.captain) {
    if (s.captain.parent) s.captain.parent.remove(s.captain);
    disposePerson(s.captain);
    s.captain = null;
  }
  tags.remove(s);
  s.tag = null;
  overboard.clearSurrender(s);
  if (s.kind === 'enemy') mechanics.onRemove(s);
  disposeShip(s.mesh);
}

const coinGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.2, 20);
const coinMat = toon(0xffc93c, { emissive: 0x6b4a00, emissiveIntensity: 0.5 });
const bombGeo = new THREE.IcosahedronGeometry(1.1, 1);
const bombMat = toon(0x3a2a2a, { emissive: 0xff5a1f, emissiveIntensity: 0.9 });

// Danger zone of a lava bomb or a lightning strike: a thick ring (plus a ghost copy that shows through
// anything in front of it, like your own sails) and a filling disc that shows the time to impact.
// Lava is red; lightning is white-blue. Drawn for BOMB_RADIUS and scaled to the level's radius.
const zoneRingGeo = new THREE.RingGeometry(BOMB_RADIUS - 1.6, BOMB_RADIUS, 48).rotateX(-Math.PI / 2);
const zoneDiscGeo = new THREE.CircleGeometry(BOMB_RADIUS, 48).rotateX(-Math.PI / 2);
function zoneMaterials(ring, disc) {
  return {
    ring: noOutline(new THREE.MeshBasicMaterial({ color: ring, transparent: true, opacity: 0.8, depthWrite: false })),
    ghost: noOutline(new THREE.MeshBasicMaterial({ color: ring, transparent: true, opacity: 0.35, depthWrite: false, depthFunc: THREE.GreaterDepth })),
    disc: noOutline(new THREE.MeshBasicMaterial({ color: disc, transparent: true, opacity: 0.3, depthWrite: false })),
  };
}
const ZONE_MATS = { lava: zoneMaterials(0xff3b1f, 0xff5a1f), lightning: zoneMaterials(0xe8f6ff, 0x8fd0ff) };
function buildZone(kind = 'lava', radius = BOMB_RADIUS) {
  const M = ZONE_MATS[kind] || ZONE_MATS.lava;
  const g = new THREE.Group();
  const ring = new THREE.Mesh(zoneRingGeo, M.ring);
  const ghost = new THREE.Mesh(zoneRingGeo, M.ghost);
  const disc = new THREE.Mesh(zoneDiscGeo, M.disc);
  ring.renderOrder = ghost.renderOrder = disc.renderOrder = 5;
  g.add(disc, ring, ghost);
  g.scale.setScalar(radius / BOMB_RADIUS);
  g.userData.disc = disc;
  return g;
}

function removeBomb(b) {
  if (b.mesh) scene.remove(b.mesh);
  scene.remove(b.zone);
  if (b.whistle) b.whistle.stop();
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
  boarding.clear();
  boardView = null;
  for (const e of enemies) removeShip(e);
  if (player) removeShip(player);
  clearProjectiles();
  for (const c of coins) scene.remove(c.mesh);
  enemies.length = coins.length = 0;
  volleys.clear();
  player = null;
  clearParticles();
  overboard.clear();
  pops.clear();
  state.hitStop.left = 0;
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
  env = mod.build(scene, { rng: mulberry32(seed), reducedMotion: reducedMotion() });
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
  const fresh = [];
  wave.forEach((typeName, i) => {
    const s = spots[i];
    const px = player ? player.x : 0;
    const pz = player ? player.z : 0;
    const e = createShip(typeName, 'enemy', s.x, s.z, Math.atan2(px - s.x, pz - s.z));
    enemies.push(e);
    fresh.push(e);
  });
  state.wave = index;
  let hands = 0;
  if (index > 0 && player && !player.sinking) {
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * WAVE_REPAIR);
    // Fresh hands come aboard with the reinforcements (never above the full crew).
    const before = state.crew;
    state.crew = clamp(state.crew + CREW.waveRefill, 1, state.crewMax);
    hands = state.crew - before;
  }
  if (index > 0) {
    const boss = wave.find((t) => SHIP_TYPES[t].boss);
    // (Right after a capture its fanfare plays out first: the horn waits, SPEC2 §9.1 audio.)
    const pitch = boss ? 0.8 : 1;
    if (state.time - state.lastCaptureAt < 1.5) state.waveHorn = { at: state.lastCaptureAt + 1.5, pitch };
    else audio.play('wave', { pitch });
    const label = boss ? `${SHIP_TYPES[boss].name} appears!` : 'Reinforcements!';
    const crewLine = hands > 0 ? ` &middot; ${hands} more ${hands === 1 ? 'hand' : 'hands'} aboard` : '';
    showBanner(`${label}<small>${describeWave(wave)}</small><small>Your crew patches the hull${crewLine}</small>`, 3);
  }
  // The level's mechanics may place a new ship (a galleon at a convoy start, the Phantom rising beside the
  // eye, with her own banner): after the banner above, so theirs wins.
  for (const e of fresh) mechanics.onSpawn(e, index);
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

let lastLevelStarted = 0;
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
  // People built with share: true (overboard sailors, boarding parties) belong to one level's looks.
  if (n !== lastLevelStarted) releaseSharedPeople();
  lastLevelStarted = n;
  // The same level always rolls the same crits (tests pin them with __game.combat.seed()).
  combatRng = mulberry32(n * 7919 + 13);
  // Round shot loaded, every hand aboard (the tavern's Boarding party decides how many).
  const stats = armoryStats(armoryCfg);
  state.ammo = 'round';
  state.crewMax = stats.crew;
  state.crew = stats.crew;
  state.critBase = stats.critBase;
  // Boarding: the tavern's Long grapples and Cutlass drills, nothing captured or plundered yet.
  state.grappleRange = stats.grappleRange;
  state.reelTime = stats.reel;
  state.blade = stats.blade;
  state.boardCooldown = 0;
  state.captures = 0;
  state.plundered = 0;
  state.lastCaptureAt = -Infinity;
  state.lastBossCaptured = '';
  state.waveHorn = null;
  state.counterBanner = false;
  topInset = 0; // (the HUD's top row is measured again once it shows)
  state.hitStop.left = 0;
  state.flash = { text: '', until: 0 };
  state.tip = { text: '', until: 0 };
  // New ammo this voyage: say so once the fly-in is over (one-time tips, SPEC2 §5.5).
  state.ammoTipDue = (ammoUnlocked('chain', state.unlocked) ? TIP.chain : 0) | (ammoUnlocked('grape', state.unlocked) ? TIP.grape : 0);
  state.ammoTipDue &= ~tips;
  shown.ammo = null;

  loadEnvironment(n);
  const def = LEVELS[n - 1];
  const ps = env.playerStart;
  player = createShip('player', 'player', ps.x, ps.z, ps.h);
  state.nextBomb = def.bombs ? def.grace + rand(...def.bombs.every) : Infinity;
  // The level's mechanics exist before its first wave, so wave 0 meets onSpawn (SPEC2 §6.3).
  mechanics.dispose();
  mechanics = createMechanics(def.mechanics || [], {
    env: () => env,
    player: () => player,
    enemies,
    // (a ship the boarding holds, reel to result, is not running anywhere: a galleon can't escape mid-brawl)
    fighting: (e) => fighting(e) && !boarding.suspends(e),
    relative,
    damage,
    escape: escapeShip,
    pop: (text, x, y, z, style) => pops.pop(text, x, y, z, style),
    showBanner,
    announce: gameAnnounce,
    sfx: (name, x, z) => audio.play(name, sfxAt(x, z)),
    rng: () => combatRng(),
    time: () => state.time,
    def,
    types: SHIP_TYPES,
  });
  spawnWave(0);
  mechanics.init();
  // Sailors of this level's ships, ready to go overboard (built one per frame during the fly-in).
  const types = [...new Set(def.waves.flat())];
  overboard.prepare(types.flatMap((t) => [enemyCrewOpts(t, 1), enemyCrewOpts(t, 2)]));
  // Your boarding party (captain and four hands in your looks) and, where raiders sail, their boarders:
  // built one per frame during the fly-in (boarding.js).
  const paint = LOOKS.hull.find((l) => l.id === shipConfig.look.hull);
  boarding.prepare({
    captain: { ...captainOpts(look), tool: 'cutlass' },
    crew: [1, 2, 3, 4].map((seed) => ({ ...crewOpts(look, seed, { kind: 'pirate', seed }, paint), tool: 'cutlass' })),
    raiders: types.some((t) => SHIP_TYPES[t] && SHIP_TYPES[t].boarder) ? [1, 2, 3, 4].map((seed) => enemyCrewOpts('raider', seed)) : null,
  });
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
    // (A level whose mechanic names a key has touch wording too: def.mechanicTouch.)
    const sub = firstVoyage ? controlsLine() : (isTouch() && def.mechanicTouch) || def.mechanic || m.subtitle;
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

// Camera shake (a hull hit, a bomb or a bolt close by, a rake): updateCamera jitters the view by state.shake,
// easing it off. Never under reduced motion (SPEC2 §13), so the hit is never scheduled there.
function shakeCamera(amount) {
  if (!reducedMotion()) state.shake = Math.max(state.shake, amount);
}

function blurActive() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

function showBanner(html, seconds) {
  ui.banner.innerHTML = html;
  show(ui.banner, true);
  retrigger(ui.banner, 'popped');
  state.bannerTimer = seconds;
}

function finishLevel() {
  boarding.cancel('level');
  clearProjectiles();
  // Sweep up any loot still floating around.
  state.gold += coins.length * COIN_VALUE;
  for (const c of coins) scene.remove(c.mesh);
  coins.length = 0;
  const def = LEVELS[state.level - 1];
  // Bonuses: the level's own, +50 for every prize taken (SPEC2 §3.7), and the mechanic's (galleons taken).
  const prize = state.captures * CAPTURE.prizeBonus;
  const mech = Math.max(0, Math.round(Number(mechanics.bonus()) || 0));
  const mechLines = (mechanics.summary() || []).filter((l) => typeof l === 'string' && l);
  state.gold += def.bonus + prize + mech;
  show(ui.banner, false);
  show(ui.hint, false);
  pops.clear(); // (a last "CAPTURED! +625 GOLD" still rising must not sit over the end screen)
  // This level's earnings (loot and bonus) go into the treasure chest for the shipyard.
  // (Gold from an attempt that is lost is never banked: a retry restores the voyage gold.)
  bankGold(state.gold - state.goldAtLevelStart);
  saveFeats();
  const banked =
    `Banked <b>+${state.banked}</b> gold &middot; Treasure chest: <b>${state.purse}</b> gold`;

  if (isFinale(state.level)) {
    state.mode = 'won';
    // A finale with more voyage after it (Act II) opens the next level too.
    if (state.level < LEVELS.length) raiseProgress(state.level + 1);
    const isBest = raiseBest(state.gold);
    ui.wonGold.textContent = state.gold;
    ui.wonChest.innerHTML = banked;
    show(ui.wonBest, isBest);
    // The finale's own words; with more voyage after it (the Molten Maw opens the Far Seas) the first button
    // sails on, gold and all (Enter does the same), and the main menu steps back.
    const after = LEVELS[state.level];
    if (def.finaleText) ui.wonText.textContent = def.finaleText;
    ui.act2Btn.textContent = after && (after.act || 1) !== (def.act || 1) ? 'Sail on to the Far Seas' : after ? `Sail on to ${after.env.meta.name}` : '';
    show(ui.act2Btn, !!after);
    show(ui.wonHint, !!after);
    ui.againBtn.classList.toggle('alt', !!after);
    show(ui.won, true);
  } else {
    state.mode = 'levelDone';
    raiseProgress(state.level + 1);
    const next = LEVELS[state.level].env.meta;
    ui.levelTitle.textContent = `${def.env.meta.name} cleared!`;
    // "Ships sunk: 3 · Captured: 2 · Level bonus: +500 gold", the prize and mechanic bonuses, the plunder.
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const extra = [];
    if (prize) extra.push(`Prize bonus: <b>+${prize}</b> gold`);
    for (const line of mechLines) extra.push(esc(line));
    if (mech) extra.push(`Treasure bonus: <b>+${mech}</b> gold`);
    if (state.plundered) extra.push(`Raiders grabbed: <b>${state.plundered}</b> gold`);
    ui.levelSummary.innerHTML =
      `Ships sunk: <b>${state.sunk}</b> &middot; Captured: <b>${state.captures}</b> &middot; Level bonus: <b>+${def.bonus}</b> gold<br>` +
      (extra.length ? `${extra.join(' &middot; ')}<br>` : '') +
      `Total plunder: <b>${state.gold}</b> gold` +
      `<small class="chest-line">${banked}</small>`;
    ui.nextBtn.textContent = `Sail to ${next.name}`;
    show(ui.levelDone, true);
  }
  renderLevelCards();
  updateHud(true);
}

// Progress (the levels open) and the best voyage only ever go up, in this tab and across tabs: a save takes the
// larger of this tab's value and the saved one, so a tab opened earlier can never re-lock a level (or lower
// the best) that another tab saved. The 'storage' listener raises this tab's values as soon as another saves.
function raiseProgress(to) {
  const saved = loadInt(PROGRESS_KEY, 1, LEVELS.length, 1);
  state.unlocked = clamp(Math.max(state.unlocked, saved, Math.round(Number(to)) || 1), 1, LEVELS.length);
  if (state.unlocked > saved) saveNumber(PROGRESS_KEY, state.unlocked);
}
// Returns whether `gold` beats every best so far (this tab's and the saved one).
function raiseBest(gold) {
  const saved = loadInt(BEST_KEY, 0, MAX_GOLD, 0);
  const before = Math.max(state.best, saved);
  const g = clamp(Math.round(Number(gold)) || 0, 0, MAX_GOLD);
  state.best = Math.max(before, g);
  if (state.best > saved) saveNumber(BEST_KEY, state.best);
  return g > before;
}
// Another tab saved progress or a best (or cleared storage): take the larger values, writing nothing. Returns
// whether either changed here.
function syncProgress() {
  const unlocked = Math.max(state.unlocked, loadInt(PROGRESS_KEY, 1, LEVELS.length, 1));
  const best = Math.max(state.best, loadInt(BEST_KEY, 0, MAX_GOLD, 0));
  const changed = unlocked !== state.unlocked || best !== state.best;
  state.unlocked = unlocked;
  state.best = best;
  return changed;
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
  raiseBest(state.gold);
  showMenu();
}

function playerSunk() {
  boarding.cancel('player');
  state.mode = 'over';
  clearProjectiles();
  saveFeats();
  show(ui.hint, false);
  audio.play('defeat');
  raiseBest(state.gold);
  const meta = LEVELS[state.level - 1].env.meta;
  const worst = Object.entries(state.hurtBy).sort((a, b) => b[1] - a[1])[0];
  let tip = '';
  if (worst && worst[0] === 'lava') tip = 'Tip: lava lands inside the red circles. Steer out of them!';
  else if (worst && worst[0] === 'lightning') tip = 'Tip: lightning strikes inside the white circles. Steer out of them!';
  else if (worst && worst[0] === 'maelstrom') tip = 'Tip: keep clear of the whirlpool\'s eye. Sail across the current, not into it!';
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

// Still in the fight: afloat, and not captured, escaped or surrendered.
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

// ---------------------------------------------------------------------------
// Boarding (SPEC2 §3). The set-piece itself (hooks, reel, swing, brawl, the camera) lives in boarding.js;
// main decides who may board whom, shows the odds, and applies the results: crew, hull, gold, captures.
// ---------------------------------------------------------------------------
const boarding = createBoarding({
  scene,
  player: () => player,
  sfx: (name, x, z, extra) => audio.play(name, sfxAt(x, z, extra)),
  particles: { puff, foam, spawnParticle },
  reducedMotion: () => reducedMotion(),
  hideHelm,
  enemyCrewOpts,
  pops,
  overboard: () => overboard, // main rebuilds the pool in releaseBattlePeople()
  time: () => state.time,
});
// The level's twist (Act II: the treasure convoy, drifting floes, the maelstrom), see mechanics.js.
// A level without mechanics gets an instance that does nothing.
let mechanics = createMechanics([], {});
// Raider pacing lives in combat.js RAIDERS: gap (after any boarding, the breather before the next raider throws
// its hooks, on top of its own cooldown) and sheer (a beaten-off raider circles wide until its own boarding
// cooldown is down to this, then closes in again).

// The two sides of a boarding, fresh (boarding.js asks for them again at the start of 'swing'):
// { crew, crew0, blade | grit, hpFrac } for you and for her.
function boardingSides(e, kind) {
  const me = { crew: state.crew, crew0: state.crewMax, blade: state.blade, hpFrac: player ? player.hp / player.maxHp : 1 };
  const foe = { crew: crewOf(e), crew0: e.crew0, grit: e.type.grit ?? 1, hpFrac: e.hp / e.maxHp };
  return kind === 'defend' ? { att: foe, def: me, attIsPlayer: false } : { att: me, def: foe, attIsPlayer: true };
}

// Why G can't board a ship (SPEC2 §3.2): the first rule that fails. null: she can be boarded.
const GRAPPLE_WHY = {
  busy: 'Busy!',
  none: 'Nothing to board!',
  immune: 'Too hot to board!',
  range: 'Get closer!',
  cooldown: 'Hooks coiling…',
  crew: 'Not enough hands!',
};
function canGrapple(e) {
  if (state.mode !== 'playing' || state.intro > 0 || state.clearTimer > 0 || state.deathTimer > 0) return 'busy';
  if (!player || player.sinking || player.hp <= 0 || boarding.active) return 'busy';
  if (!e || e.kind !== 'enemy' || e.hp <= 0 || e.sinking || e.captured || e.escaped || e.rise > 0) return 'none';
  if (!fighting(e) && !e.surrendered) return 'none';
  if (e.type.boardable === false) return 'immune';
  if (Math.hypot(e.x - player.x, e.z - player.z) > state.grappleRange + BOARD.lenFactor * e.type.len) return 'range';
  if (state.boardCooldown > 0) return 'cooldown';
  if (!e.surrendered && state.crew < CREW.minToBoard) return 'crew';
  return null;
}
// The odds of boarding her now, with no heave: resolveBoarding's numbers + label
// ('take' a struck ship, 'capture', 'fight' or 'risky'). This is exactly what boarding.js will resolve.
function boardOdds(e, kind = e.surrendered ? 'surrender' : 'attack') {
  return boarding.odds(boardingSides(e, kind === 'counter' ? 'attack' : kind), { kind, surrendered: !!e.surrendered });
}
const LABEL_RANK = { take: 4, capture: 3, fight: 2, risky: 1 };
// The ship G would board: of those that can be boarded, the one with the best odds, then the nearest.
// Without one: the nearest ship still afloat and why she can't be boarded (`reason`).
function boardPick() {
  if (!player) return { target: null, odds: null, label: null, reason: 'busy', near: null };
  let best = null;
  let near = null;
  for (const e of enemies) {
    if (e.hp <= 0 || e.sinking || e.captured || e.escaped) continue;
    const d = Math.hypot(e.x - player.x, e.z - player.z);
    const why = canGrapple(e);
    if (why === null) {
      const odds = boardOdds(e);
      const rank = LABEL_RANK[odds.label] || 0;
      if (!best || rank > best.rank || (rank === best.rank && d < best.d)) best = { e, odds, rank, d };
    } else if (!near || d < near.d) near = { e, why, d };
  }
  if (best) return { target: best.e, odds: best.odds, label: best.odds.label, reason: null, near: best.e };
  return { target: null, odds: null, label: null, reason: near ? near.why : 'none', near: near ? near.e : null };
}
// Throw the grapples at the best ship in reach (SPEC2 §3.2). { ok, reason } (reason: why not).
function grapple() {
  const pick = boardPick();
  const e = pick.target;
  if (!e) return { ok: false, reason: pick.reason };
  const kind = e.surrendered ? 'surrender' : 'attack';
  const ok = boarding.start({ kind, enemy: e, reel: state.reelTime, getSides: () => boardingSides(e, 'attack') });
  return ok ? { ok: true, reason: null, kind, label: pick.label } : { ok: false, reason: 'busy' };
}
// G / the Board button, by what is going on: heave in your reel, cut the raiders' ropes, skip the brawl,
// counter-board in the window, else grapple (or say why not in the hint bubble).
function boardPress() {
  if (state.mode !== 'playing' || !player || player.sinking) return false;
  if (boarding.active) {
    const ph = boarding.phase;
    if (ph === 'reel' && boarding.kind === 'attack') {
      boarding.heave();
      return true;
    }
    if (ph === 'threat') {
      boarding.cut();
      return true;
    }
    if (ph === 'brawl') return boarding.skip();
    return false;
  }
  if (state.intro > 0) return false; // the key fast-forwards the fly-in instead
  const ct = boarding.counterTarget;
  if (ct && state.clearTimer <= 0 && state.deathTimer <= 0) {
    return boarding.start({ kind: 'counter', enemy: ct, getSides: () => boardingSides(ct, 'counter') });
  }
  const r = grapple();
  if (!r.ok && GRAPPLE_WHY[r.reason]) flashHint(GRAPPLE_WHY[r.reason], 2);
  return r.ok;
}
// A raider in an attack slot throws its hooks at you when it can (SPEC2 §3.6). Returns whether it did.
function raiderTry(e, dist) {
  if (!e.type.boarder || boarding.active || e.boardCooldown > 0 || !fighting(e) || e.sinking) return false;
  if (!player || player.sinking || state.clearTimer > 0 || state.deathTimer > 0 || state.intro > 0) return false;
  const def = LEVELS[state.level - 1];
  if (state.combatTime <= def.grace || dist > RAIDERS.reach || crewOf(e) < RAIDERS.minCrew) return false;
  if (state.boardCooldown > BOARD.cooldown - RAIDERS.gap) return false; // a breather after any boarding
  return boarding.start({ kind: 'defend', enemy: e, getSides: () => boardingSides(e, 'defend') });
}
const theName = (name) => (/^The /.test(name) ? name : `The ${name}`);
const theNameLower = (name) => theName(name).replace(/^The /, 'the ');
const hands = (n) => `${n} ${n === 1 ? 'hand' : 'hands'}`;

// SPEC2 §3.4 "Applying a result": the defender's hull damage first, then her `killed` so that her crew is
// exactly what the fight left (the boarding's own hull damage never thins it further); your crew too.
boarding.onResult((r) => {
  const e = r.enemy;
  if (!e || !player) return;
  if (r.kind === 'defend') {
    if (r.playerHullDmg > 0) {
      player.hp = Math.max(1, player.hp - r.playerHullDmg);
      state.lastHit = state.time;
      state.hurtBy[e.typeName] = (state.hurtBy[e.typeName] || 0) + r.playerHullDmg;
      retrigger(ui.hullCard, 'hurt');
    }
    // (the loss, not the crew left: hands that came aboard with reinforcements during the fight stay)
    state.crew = clamp(state.crew - r.playerCrewLost, 1, state.crewMax);
    e.killed += r.result.attLoss;
  } else {
    e.hp = Math.max(1, e.hp - r.enemyHullDmg);
    e.hpLow = Math.min(e.hpLow, e.hp);
    e.killed = Math.max(0, crewOf({ ...e, killed: 0 }) - r.enemyCrewLeft);
    state.crew = clamp(state.crew - r.playerCrewLost, 1, state.crewMax);
  }
  if (r.captured) {
    // boarding.js shows the CAPTURED! pop and the shower of gold
    captureShip(e, r.kind === 'defend' ? 'raider' : 'boarded', r.gold);
  } else if (r.overrun) {
    // They win the fight on your deck: a quarter of this level's plunder goes with them (never the chest).
    const n = plunderGold(state.gold - state.goldAtLevelStart);
    if (n > 0) {
      state.gold -= n;
      state.plundered += n;
      pops.pop(`−${n} gold`, player.x, popHeight(player) + 1.6, player.z, 'bad');
    }
    gameAnnounce(`Overrun! The raiders ${n > 0 ? `grabbed ${n} gold and ` : ''}cast off. You lost ${hands(r.playerCrewLost)}.`);
  } else if (r.held) {
    audio.play('cheer', { volume: 0.8 });
    gameAnnounce(`Boarders driven back! You lost ${hands(r.playerCrewLost)}.`);
  } else {
    gameAnnounce(`Driven back from ${theNameLower(e.type.name)}! You lost ${hands(r.playerCrewLost)}.`);
  }
});
boarding.onPhase((ev) => {
  const e = ev.enemy;
  if (!e) return;
  // "Close enough to board!" has done its job once hooks fly (and G means something else now).
  // ("She struck her colours! Grapple her" too.)
  if ((ev.phase === 'hook' || ev.phase === 'threat') && (state.tip.bit === TIP.board || state.tip.bit === TIP.surrender)) state.tip.until = 0;
  if (ev.phase === 'reel' && ev.kind === 'defend') {
    // too late to cut: they're coming aboard
    if (state.tip.bit === TIP.raiders) state.tip.until = 0;
    if (state.bannerTimer > 0.3) state.bannerTimer = 0.3;
  }
  if (ev.phase === 'hook') {
    gameAnnounce(`Grappling ${theNameLower(e.type.name)}!`);
  } else if (ev.phase === 'threat') {
    const touch = isTouch();
    showBanner(`Boarders!<small>${touch ? 'Tap <b>CUT!</b> 3 times or hold it' : 'Cut the ropes: <kbd>G</kbd> 3 times or hold it'}</small>`, RAIDERS.threat);
    // (The first time, the tip in the hint bubble, a live region too, says it: not read twice.)
    if (!showTip(TIP.raiders, 'Boarders! Press <kbd>G</kbd> 3 times (or hold it) to cut the ropes', 'Tap <b>CUT!</b> 3 times or hold it', RAIDERS.threat + 1)) {
      gameAnnounce(`Boarders! ${theName(e.type.name)} is grappling you. Cut the ropes: ${touch ? 'tap Cut three times or hold it' : 'press G three times or hold it'}.`);
    }
  } else if (ev.phase === 'brawl') {
    feats.boardings++;
    featsDirty = true;
  }
});
boarding.onCut(() => {
  if (state.bannerTimer > 0.3) state.bannerTimer = 0.3; // "Boarders!" goes
  if (state.tip.bit === TIP.raiders) state.tip.until = 0; // and so does "cut the ropes"
  gameAnnounce('Ropes cut!');
});
boarding.onEnd((ev) => {
  state.boardCooldown = BOARD.cooldown;
  if (state.tip.bit === TIP.raiders) state.tip.until = 0;
  // Shots that thinned her crew while she was being boarded were not checked then (the boarding decided):
  // a boarding that ends in play without taking her checks now whether she strikes. (Not when it is called
  // off because the level ends or your ship goes down.)
  if (ev.enemy && (ev.reason === 'done' || ev.reason === 'broke' || ev.reason === 'cut')) checkSurrender(ev.enemy);
  if (ev.reason === 'broke' && ev.kind !== 'defend') gameAnnounce('She broke free!');
  // A held defence: her lines are still on for a moment. Board her back! (Not if she has just struck.)
  if (ev.reason === 'done' && ev.counterTarget && boarding.counterTarget === ev.counterTarget && state.clearTimer <= 0) {
    const touch = isTouch();
    showBanner(`Counter-board!<small>${touch ? 'Tap <b>Again!</b> to board them back' : 'Press <kbd>G</kbd> to board them back'}</small>`, RAIDERS.counterWindow);
    state.counterBanner = true;
    if (!showTip(TIP.counter, 'Counter-board! Press <kbd>G</kbd>', 'Tap <b>Again!</b> to board them back', RAIDERS.counterWindow)) {
      gameAnnounce(`Counter-board! ${touch ? 'Tap Again' : 'Press G'} to board them back.`);
    }
  }
});

// A ship strikes her colours at the surrender notch (SPEC2 §3.1): white flag, two sailors with their hands up,
// no more shooting; she drifts until you grapple her (or the level ends: she is yours anyway).
function checkSurrender(ship) {
  if (!ship || ship.kind !== 'enemy' || ship.surrendered || ship.captured || ship.escaped || ship.hp <= 0 || ship.sinking) return false;
  if (ship.type.boardable === false || crewOf(ship) > ship.strikeAt) return false;
  if (boarding.active && boarding.target === ship) return false; // the boarding's result decides
  ship.surrendered = true;
  ship.spectral = false;
  try {
    hoistFlag(ship.mesh, 'white');
  } catch (err) {
    console.warn('white flag:', err);
  }
  overboard.showSurrender(ship, [enemyCrewOpts(ship.typeName, 1), enemyCrewOpts(ship.typeName, 2)]);
  const name = theName(ship.type.name);
  // (A struck ship in reach is the one the Board button takes: it reads "Take!" then.)
  const tipped = showTip(
    TIP.surrender,
    'She struck her colours! Grapple her to take her: <kbd>G</kbd>',
    canGrapple(ship) === null ? 'She struck her colours! Tap <b>Take!</b> to take her' : 'She struck her colours! Sail close, then tap <b>Take!</b>'
  );
  if (ship.type.ghost) {
    audio.play('ghost', sfxAt(ship.x, ship.z));
    showBanner(`The ghost crew is banished!<small>Take ${name.replace(/^The /, 'the ')} for ${captureGold(ship.type.gold)} gold</small>`, 2.8);
    gameAnnounce('The ghost crew is banished! Grapple the Phantom Galleon to take her.');
  } else {
    showBanner(`${name} strikes her colours!<small>Take her for ${captureGold(ship.type.gold)} gold</small>`, 2.2);
    // (The first time, the tip in the hint bubble, a live region too, says it: not read twice.)
    if (!tipped) gameAnnounce(`${name} strikes her colours. Grapple her to take her.`);
  }
  return true;
}

// She is yours (SPEC2 §3.7): the gold at once, hull and hands back, your flag up, and a prize crew sails her
// off to the nearest edge of the sea (removed after CAPTURE.sailAway s). how: 'boarded' | 'raider' | 'auto'.
function captureShip(e, how = 'boarded', gold = captureGold(e.type.gold)) {
  if (!e || e.captured || e.escaped || e.hp <= 0 || e.sinking) return 0;
  e.captured = true;
  e.surrendered = false;
  e.spectral = false;
  // The prize crew puts out a burning powder keg: nothing hurts a ship under your flag (she can't sink).
  e.burnTicks = 0;
  e.burnAcc = 0;
  e.effects.burn = 0;
  overboard.clearSurrender(e);
  try {
    hoistFlag(e.mesh, 'player', LOOKS.flag.find((l) => l.id === shipConfig.look.flag) || null);
  } catch (err) {
    console.warn('prize flag:', err);
  }
  state.gold += gold;
  state.captures++;
  state.lastCaptureAt = state.time;
  if (player && !player.sinking) {
    player.hp = Math.min(player.maxHp, player.hp + CAPTURE.hull);
    state.crew = clamp(state.crew + CAPTURE.crew, 1, state.crewMax);
  }
  feats.captures++;
  feats.prizes = feats.prizes || {};
  feats.prizes[e.typeName] = (feats.prizes[e.typeName] || 0) + 1;
  if (e.type.ghost) feats.legend = 1;
  featsDirty = true;
  saveFeats();
  mechanics.onCapture(e);
  e.removeAt = state.time + CAPTURE.sailAway;
  e.speed = Math.min(e.speed, 2);
  if (e.type.boss) state.lastBossCaptured = e.type.name;
  helm.cheer = visualTime + 1.5;
  audio.play('capture');
  audio.play('cheer', { volume: 0.9 });
  // (A boarding shows its own CAPTURED! pop and the gold; a struck ship taken at the level's end gets one here.)
  if (how === 'auto') pops.pop(`CAPTURED!\n+${gold} gold`, e.x, popHeight(e) + 0.8, e.z, 'capture');
  const name = how === 'raider' ? 'The raider is yours' : `${theName(e.type.name)} is yours`;
  gameAnnounce(`${name}! Captured for ${gold} gold.`);
  return gold;
}

// A ship got away (a treasure galleon through its escape gate): out of the fight, gone in a puff of spray.
function escapeShip(e) {
  if (!e || e.escaped || e.captured || e.hp <= 0 || e.sinking) return;
  e.escaped = true;
  e.surrendered = false;
  overboard.clearSurrender(e);
  e.removeAt = state.time;
  foam(e.x, 0.6, e.z, 22, 9, 7, 0.8, 1.1);
}

// The ammo a ship fires: the player's loaded shot; everyone else always fires round shot.
function ammoOf(ship) {
  return ship.kind === 'player' ? state.ammo : 'round';
}

// An enemy's fighting crew now (SPEC2 §3.1): hull damage thins it (by half at most), grape, crits and
// boardings kill sailors outright. (The player's crew is state.crew.)
function crewOf(s) {
  return combat.crewNow({ crew0: s.crew0, hpLow: s.hpLow, maxHp: s.maxHp, killed: s.killed });
}

// The Phantom while her ghost crew stands: round and chain shot do half, and her hull never drops below 1.
function ghostActive(s) {
  return !!s.type.ghost && !s.surrendered && !s.captured && crewOf(s) > s.strikeAt;
}


// Effects of chain shot and crits (SPEC2 §2.3). They don't add up: the smallest active multiplier wins,
// for speed (chain 0.55, mast down 0.5) and for turning (chain 0.7, rudder smashed 0.25).
function speedMul(s) {
  const f = s.effects;
  let m = 1;
  if (f.slow > 0) m = Math.min(m, EFFECTS.chain.speed);
  if (f.mast > 0) m = Math.min(m, EFFECTS.mast.speed);
  return m;
}
function turnMul(s) {
  const f = s.effects;
  let m = 1;
  if (f.slowTurn > 0) m = Math.min(m, EFFECTS.chain.turn);
  if (f.rudder > 0) m = Math.min(m, EFFECTS.rudder.turn);
  return m;
}

// Is `e` inside the firing arc on `side` of `ship` (within `range`), taking its motion into account?
// (The same intercept that fire() solves, from the ship's centre.)
function inArc(ship, e, side, range = MAX_RANGE) {
  if (!fighting(e)) return false;
  const rvx = fwdX(e.h) * e.speed - fwdX(ship.h) * ship.speed;
  const rvz = fwdZ(e.h) * e.speed - fwdZ(ship.h) * ship.speed;
  const px = e.x - ship.x;
  const pz = e.z - ship.z;
  let t = Math.hypot(px, pz) / BALL_SPEED;
  for (let k = 0; k < 3; k++) t = Math.hypot(px + rvx * t, pz + rvz * t) / BALL_SPEED;
  const r = relative(ship, e.x + rvx * t, e.z + rvz * t);
  if (Math.sign(r.lat) !== side || r.dist > range + 2) return false;
  return Math.atan2(Math.abs(r.along), Math.abs(r.lat)) - Math.atan2(e.type.len / 2, r.dist) <= MAX_TRAVERSE;
}

// Who may fire now: your gun crews are on the ropes during a boarding (except while raiders' hooks bite,
// SPEC2 §3.6); a struck, captured or escaped ship, the ship being boarded and everyone during the truce
// hold their fire.
function mayFire(ship) {
  if (ship.kind === 'player') return !boarding.active || (boarding.kind === 'defend' && boarding.phase === 'threat');
  if (ship.surrendered || ship.captured || ship.escaped || boarding.truce || boarding.target === ship) return false;
  return !mechanics.holdFire(ship); // e.g. a treasure galleon only fires at a player abeam and close
}

// side: +1 starboard (right), -1 port (left). Returns true if it fired.
// With a target, each gun leads it: it aims where the target will be when the
// ball arrives (scaled by `lead`), within a small swivel arc either side of the beam.
// rangeErr scales the flight time to make enemy gunners imperfect. The loaded ammo (SPEC2 §2.2) sets
// the range, the spread and the reload; every gun fires one projectile whatever the ammo.
function fire(ship, side, target = null, { spread = 0.02, lead = 1, rangeErr = 1 } = {}) {
  const key = side > 0 ? 'star' : 'port';
  if (ship.reload[key] > 0 || ship.sinking || ship.hp <= 0) return false;
  if (!mayFire(ship)) return false;
  const t = ship.type;
  const ammo = ammoOf(ship);
  const A = AMMO[ammo];
  const maxFlight = A.range / BALL_SPEED;
  const fx = fwdX(ship.h);
  const fz = fwdZ(ship.h);
  const beam = ship.h - (side * Math.PI) / 2; // angle of the beam on that side
  const svx = fx * ship.speed;
  const svz = fz * ship.speed;
  let volley = 0;
  if (ship.kind === 'player') {
    volley = ++volleyId;
    volleys.set(volley, { side, hits: 0, sunk: false, left: t.guns, targets: new Map(), tags: new Set() });
  }
  for (let i = 0; i < t.guns; i++) {
    const along = gunOffset(t, i);
    const x = ship.x + fx * along + rightX(ship.h) * side * (t.wid / 2 + 0.4);
    const z = ship.z + fz * along + rightZ(ship.h) * side * (t.wid / 2 + 0.4);

    let a = beam;
    let flight = Math.min(DEFAULT_RANGE / BALL_SPEED, maxFlight);
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
      flight = clamp(flight * rangeErr, 6 / BALL_SPEED, maxFlight);
    }
    a += (Math.random() - 0.5) * spread * A.spreadMul * 2;
    const dx = Math.sin(a);
    const dz = Math.cos(a);

    // Shared geometry and material (ships.js): removed from the scene when the ball is gone, never disposed.
    const mesh = projectileMesh(ammo);
    mesh.position.set(x, BALL_Y, z);
    scene.add(mesh);
    balls.push({
      mesh,
      owner: ship.kind,
      src: ship.typeName,
      volley,
      dmg: t.dmg,
      ammo,
      ox: x, // the muzzle: range fall-off is measured from here
      oz: z,
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
  const volume = Math.min(1, 0.55 + 0.12 * t.guns);
  audio.play('cannon', sfxAt(sx, sz, { volume }));
  // Chain shot whirrs and grape shot rattles on top of the bang.
  if (ammo !== 'round') audio.play(ammo, sfxAt(sx, sz, { volume }));
  const reload = t.reload * A.reloadMul;
  ship.reload[key] = reload;
  ship.reloadMax[key] = reload;
  ship.roll -= side * 0.09;
  if (ship.kind === 'player') helm.point = visualTime + 0.6; // "Fire!"
  return true;
}

// What a side's guns would aim at (the loaded ammo's range): the nearest enemy inside that side's
// firing arc (inArc: true), failing that the nearest one roughly abeam.
function aimTarget(side) {
  const range = AMMO[state.ammo].range;
  let aim = null;
  let bestDist = Infinity;
  let fallback = null;
  let fallbackDist = Infinity;
  for (const e of enemies) {
    if (!fighting(e)) continue;
    const r = relative(player, e.x, e.z);
    if (inArc(player, e, side, range)) {
      if (r.dist < bestDist) {
        bestDist = r.dist;
        aim = e;
      }
      continue;
    }
    if (Math.sign(r.lat) !== side || r.dist > range + 4) continue;
    if (Math.abs(r.along) > Math.abs(r.lat) * 1.2 + e.type.len / 2) continue;
    if (r.dist < fallbackDist) {
      fallbackDist = r.dist;
      fallback = e;
    }
  }
  return { target: aim ?? fallback, inArc: !!aim };
}

// The player's guns aim at the nearest enemy inside that side's firing arc, or
// failing that the nearest one roughly abeam.
function playerFire(side) {
  if (state.mode !== 'playing' || !player || player.sinking) return false;
  return fire(player, side, aimTarget(side).target);
}

// The RAKE! cue: does the target in that side's arc show you her stern or her bow (the beam lies within
// about 37° of her keel)? 'stern' | 'bow' | null.
function rakeCue(side) {
  if (!player) return null;
  const { target, inArc: aimed } = aimTarget(side);
  if (!target || !aimed) return null;
  const c = rightX(player.h) * side * fwdX(target.h) + rightZ(player.h) * side * fwdZ(target.h);
  if (Math.abs(c) < combat.RAKE.cos) return null;
  return c > 0 ? 'stern' : 'bow'; // the shot would fly the way she faces: in over her stern
}

// Where pop words over a ship start: a little above her deck.
function popHeight(s) {
  return s.mesh.position.y + (s.mesh.userData.deckY ?? 1.2) + 2.2;
}

// Hitmark stickers (fx.css), in this order.
const STICKERS = [
  [/^RAKE/, 'rake'],
  [/^CRIT/, 'crit'],
  [/^POINT BLANK/, 'blank'],
  [/^CAPTURED/, 'captured'],
];
// The HIT ×N / SUNK! mark: its text and stickers, on the side the volley was fired from.
function fillHitmark(text, tags, side, sunk) {
  ui.hitmark.textContent = text;
  const labels = [...(tags || [])].sort(
    (a, b) => STICKERS.findIndex(([re]) => re.test(a)) - STICKERS.findIndex(([re]) => re.test(b))
  );
  if (labels.length) {
    const box = document.createElement('span');
    box.className = 'hm-tags';
    for (const label of labels) {
      const tag = document.createElement('span');
      const kind = STICKERS.find(([re]) => re.test(label));
      tag.className = `hm-tag${kind ? ` ${kind[1]}` : ''}`;
      tag.textContent = label;
      box.appendChild(tag);
    }
    ui.hitmark.appendChild(box);
  }
  ui.hitmark.className = `hitmark ${side > 0 ? 'right' : 'left'}${sunk ? ' sunk' : ''}`;
}
// Where the mark is (or is about to be), for the pops to keep clear of: until (performance.now() ms).
const hitmarkState = { until: -Infinity };
// A volley's first ball hits: its pops (RAKE, CRIT!, POINT BLANK...) come now, the mark only when the volley
// is done. Unless a mark is still showing, set it up now, unseen, where it will pop ("HIT ×n" for the balls
// still flying, the stickers this ball earns), so those pops are placed clear of it too.
function primeHitmark(v, tags) {
  const now = performance.now();
  if (now < hitmarkState.until) return;
  fillHitmark(`HIT ×${Math.max(1, v.left)}`, tags, v.side, false); // (no 'popped': it stays invisible)
  hitmarkState.until = now + 1500; // the volley pops it well before (or a level change drops it)
}
// The mark's box on screen, in CSS pixels, while it shows (or is primed): its layout box (offsetLeft/Top:
// a fixed element's place in the viewport, which its pop-in transform doesn't move; pops.js counts the box
// 10% bigger for that pop-in), taller by the rise it makes while it is still clearly visible (the
// `hitmark` keyframes). pops.js keeps pops off it (`avoid`).
function hitmarkRects() {
  if (performance.now() >= hitmarkState.until || typeof DOMRect !== 'function') return [];
  const el = ui.hitmark;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  if (!w || !h) return [];
  const rise = 12;
  return [new DOMRect(el.offsetLeft, el.offsetTop - rise, w, h + rise)];
}
// The bottom of the top HUD row (hull, pirates, gold, buttons) in CSS pixels: pops stay below it
// (pops.js `insetTop`). Measured once per layout (resize() forgets it), only while the HUD shows.
let topInset = 0;
function hudTopInset() {
  if (!topInset) {
    const row = ui.hud.querySelector?.('.hud-top');
    const r = row ? row.getBoundingClientRect() : null;
    if (r && r.height > 0) topInset = Math.ceil(r.bottom) + 4; // (+ the cards' drop shadow)
  }
  return topInset;
}
// A player volley finished: HIT!/SUNK! flashes on the side it was fired from with what the volley did
// ("RAKE ×2", "CRIT!", "POINT BLANK"), then the summed damage (and crew lost) pops over each ship it hit,
// placed clear of that mark.
function volleyDone(v) {
  if (v.hits) {
    fillHitmark(v.sunk ? 'SUNK!' : v.hits > 1 ? `HIT ×${v.hits}` : 'HIT!', v.tags, v.side, v.sunk);
    retrigger(ui.hitmark, 'popped');
    hitmarkState.until = performance.now() + 700; // (the hitmark animation's length, style.css)
  }
  for (const T of (v.targets || new Map()).values()) {
    if (T.dmg > 0) pops.pop(String(Math.round(T.dmg)), T.x, T.y, T.z, 'dmg');
    if (T.crew > 0) pops.pop(`−${T.crew} CREW`, T.x, T.y, T.z, 'crew');
  }
}

// The volley's running total on one target (pops and stickers are summed per volley, SPEC2 §2.5).
function volleyTarget(v, s) {
  let T = v.targets.get(s);
  if (!T) {
    T = { dmg: 0, crew: 0, rake: false, crit: false, blank: false, chain: false, overboard: false, x: s.x, y: 0, z: s.z };
    v.targets.set(s, T);
  }
  return T;
}

// A crit's effect (SPEC2 §2.3), at most one new effect per target every CRIT.effectGap seconds (a crit
// inside the gap still hits ×1.75); bosses keep effects for half as long. Returns the effect applied.
function applyCritEffect(s, id) {
  if (!id || state.time - s.lastEffectAt < CRIT.effectGap) return null;
  s.lastEffectAt = state.time;
  const k = s.type.boss ? CRIT.bossDuration : 1;
  const f = s.effects;
  if (id === 'rudder') f.rudder = Math.max(f.rudder, EFFECTS.rudder.time * k);
  else if (id === 'mast') {
    f.mast = Math.max(f.mast, EFFECTS.mast.time * k);
    setShipDamage(s.mesh, { mast: true }); // her top sail comes down for the time
  } else if (id === 'keg') {
    f.burn = EFFECTS.keg.time * k;
    s.burnTicks = Math.round(EFFECTS.keg.dps * f.burn); // 1 hp every 1/dps seconds
    s.burnAcc = 0;
  }
  // 'routed': its extra kills are counted with the shot's own
  return id;
}

// Chain shot tears her rigging: slower and clumsier for a while (each hit adds, up to the maximum).
function applySlow(s) {
  const k = s.type.boss ? CRIT.bossDuration : 1;
  const c = EFFECTS.chain;
  const f = s.effects;
  f.slow = Math.min(c.max * k, Math.max(0, f.slow) + c.time * k);
  f.slowTurn = f.slow;
}

// Effects wear off; a powder keg burns 1 hp at a time (simulated time).
function updateEffects(s, dt) {
  const f = s.effects;
  if (f.slow > 0) f.slow = Math.max(0, f.slow - dt);
  if (f.slowTurn > 0) f.slowTurn = Math.max(0, f.slowTurn - dt);
  if (f.rudder > 0) f.rudder = Math.max(0, f.rudder - dt);
  if (f.mast > 0) {
    f.mast = Math.max(0, f.mast - dt);
    if (f.mast === 0) setShipDamage(s.mesh, { mast: false });
  }
  if (s.burnTicks > 0) {
    f.burn = Math.max(0, f.burn - dt);
    s.burnAcc += dt;
    const every = 1 / EFFECTS.keg.dps;
    while (s.burnTicks > 0 && s.burnAcc >= every - 1e-9) {
      s.burnAcc -= every;
      s.burnTicks--;
      if (s.hp > 0 && !s.sinking) damage(s, 1, s.x, s.z, 'fire');
    }
    if (s.burnTicks <= 0) {
      f.burn = 0;
      s.burnAcc = 0;
    }
  }
}

// A crit freezes the frame for a moment (hit-stop), at most once per CRIT.hitStop.gap; never with reduced motion.
function hitStop() {
  if (reducedMotion()) return;
  const now = performance.now() / 1000;
  if (now - state.hitStop.lastAt < CRIT.hitStop.gap) return;
  state.hitStop.lastAt = now;
  state.hitStop.left = CRIT.hitStop.time;
}

// What a ball does when it hits a ship (combat.js decides the numbers).
function ballHit(b, s) {
  const def = LEVELS[state.level - 1];
  const r = relative(s, b.x, b.z);
  const mine = b.owner === 'player';
  const dist = Math.hypot(b.x - b.ox, b.z - b.oz);
  const info = shotResult({
    ammo: b.ammo,
    base: b.dmg,
    dist,
    vx: b.vx,
    vz: b.vz,
    target: { h: s.h, len: s.type.len, ghost: ghostActive(s), boss: !!s.type.boss },
    along: r.along,
    shooter: mine ? { player: true, critBase: state.critBase } : { player: false, enemyRake: def.enemyRake ?? 1 },
    rng: combatRng,
    force: mine ? forcedCrit : null,
  });
  info.owner = b.owner;
  info.ammo = b.ammo;
  info.volley = b.volley;
  info.y = b.y;
  info.dist = dist;
  return info;
}

function logShot(b, s, info) {
  shotLog.push({
    t: Math.round(state.time * 1000) / 1000,
    owner: b.owner,
    shooter: b.src,
    target: s.kind === 'player' ? 'player' : s.typeName,
    targetId: s.id,
    ammo: info.ammo,
    x: b.x,
    y: b.y,
    z: b.z,
    dist: info.dist,
    dmg: info.dmg,
    rangeMul: info.rangeMul,
    aspect: info.aspect,
    aspectMul: info.aspectMul,
    pointBlank: info.pointBlank,
    crit: info.crit,
    critEffect: info.critEffect,
    effect: info.applied ?? null, // the crit effect that took hold (null inside the effect gap)
    zone: info.zone,
    crewKill: info.crewKill,
    killed: info.killed ?? 0, // sailors it really killed
    slow: info.slow,
    tags: info.tags,
    hp: s.hp,
  });
  if (shotLog.length > 40) shotLog.splice(0, shotLog.length - 40);
}

// The hull side a ball hit: a hole, crew lost, and the player's own shots say what they did.
function hullHit(ship, hx, hz, amount, info, effect) {
  const r = relative(ship, hx, hz);
  const side = r.lat > 0 ? 1 : -1;
  // A splintered hole where it hit (placed analytically on the hull side by ships.js).
  const hy = (info.y ?? 1.2) - ship.mesh.position.y;
  addHole(ship.mesh, { z: r.along, y: hy, side });
  if (!ship.firstHole) ship.firstHole = { z: r.along, y: clamp(hy, 0.5, 2.5), side };
  ship.hitsBySide[side > 0 ? 'star' : 'port']++;
  // Sailors lost: grape (1 a ball, 2 on a rake) and CREW ROUTED! (+2). Only enemies lose crew to shots.
  let killed = 0;
  if (ship.kind === 'enemy') {
    const kills = (info.crewKill || 0) + (effect === 'routed' ? EFFECTS.routed.crew : 0);
    if (kills > 0) {
      const before = crewOf(ship);
      ship.killed += kills;
      killed = before - crewOf(ship);
      if (killed > 0) checkSurrender(ship);
    }
  }
  info.killed = killed;
  if (info.owner !== 'player') return;
  // ---- the player's shots: pops, stickers, feats
  const v = info.volley ? volleys.get(info.volley) : null;
  const T = v ? volleyTarget(v, ship) : null;
  const py = popHeight(ship);
  if (T) {
    T.dmg += amount;
    T.crew += killed;
    T.x = hx;
    T.y = py;
    T.z = hz;
    for (const tag of info.tags) v.tags.add(tag);
  } else {
    // a hit outside a volley pops at once
    pops.pop(String(Math.round(amount)), hx, py, hz, 'dmg');
    if (killed > 0) pops.pop(`−${killed} CREW`, hx, py, hz, 'crew');
  }
  if (info.aspect) {
    feats.rakes++;
    featsDirty = true;
    if (!T || !T.rake) {
      if (T) T.rake = true;
      pops.pop(info.aspect === 'stern' ? WORDS.stern : WORDS.bow, hx, py + 0.4, hz, 'rake');
      audio.play('rake', sfxAt(hx, hz));
      shakeCamera(0.15);
      splinters(hx, hz, 9); // a double burst down her length
    }
  }
  if (info.crit) {
    feats.crits++;
    featsDirty = true;
    // One CRIT! word per volley and target (with the effect's line when one took hold), a star burst per crit.
    if (!T || !T.crit || effect) {
      if (T) T.crit = true;
      pops.pop(effect ? `CRIT! ${WORDS[effect]}` : WORDS.crit, hx, py + 0.8, hz, 'crit');
      audio.play('crit', sfxAt(hx, hz));
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      spawnParticle('glow', i % 2 ? 0xfff2a8 : 0xffd23f, hx, 2.2, hz, Math.cos(a) * 7, rand(1, 4), Math.sin(a) * 7, 0.35, 0.4, 0);
    }
    hitStop();
  }
  if (info.pointBlank && (!T || !T.blank)) {
    if (T) T.blank = true;
    pops.pop(WORDS.pointBlank, hx, py - 0.6, hz, 'info');
  }
  if (info.slow) {
    // shredded sailcloth flutters down
    for (let i = 0; i < 12; i++) {
      const c = [0xfff4d6, 0xf2e2bd, 0xe8d3a8, 0xffffff][i % 4];
      spawnParticle('puff', c, hx + rand(-1.5, 1.5), rand(3, 6), hz + rand(-1.5, 1.5), rand(-3, 3), rand(1, 4), rand(-3, 3), rand(1.2, 1.8), rand(0.28, 0.45), GRAVITY * 0.12, false, true);
    }
    if (!T || !T.chain) {
      if (T) T.chain = true;
      pops.pop(WORDS.chain, hx, py - 0.2, hz, 'info');
    }
  }
  // Grape sweeps a sailor over the side (one per volley per ship).
  if (killed > 0 && info.ammo === 'grape' && (!T || !T.overboard)) {
    if (T) T.overboard = true;
    overboard.throwOver(ship, side, enemyCrewOpts(ship.typeName, 1 + (ship.killed % 2)));
  }
}

// Flat little planks flying off the hull.
function splinters(hx, hz, n = 7) {
  for (let i = 0; i < n; i++) {
    spawnParticle('puff', 0x8b5a2b, hx, 1.4, hz, rand(-3.5, 3.5), rand(2, 7), rand(-3.5, 3.5), rand(0.6, 1.1), rand(0.22, 0.32), GRAVITY, false, true);
  }
}

// Hurt a ship. Tests call damage(e, 9999). `info` (a shot's result from combat.js, see ballHit) adds what
// the shot did: crew lost, a crit's effect, chain shot's slow, a hole, the pops. source 'fire' is a
// powder keg burning (quiet: no splinters, no sound).
function damage(ship, amount, x, z, source = 'other', info = null) {
  if (ship.hp <= 0) return;
  if (ship.kind === 'player' && state.clearTimer > 0) return; // the level is already won
  const hx = x ?? ship.x;
  const hz = z ?? ship.z;
  const quiet = source === 'fire';
  let amt = amount;
  let effect = null;
  if (info) {
    if (info.crit) effect = applyCritEffect(ship, info.critEffect);
    if (effect === 'keg') amt += EFFECTS.keg.burst * (info.ghostMul ?? 1); // the keg blows at once
    if (info.slow) applySlow(ship);
    info.applied = effect;
  }
  const ghost = ghostActive(ship);
  ship.hp -= amt;
  // The Phantom Galleon is never sunk: her ghost crew holds her together (SPEC2 §6.6); at 1 hp she turns
  // spectral and only grape and cutlasses can beat her.
  if (ship.type.ghost && !ship.captured && ship.hp < 1) {
    ship.hp = 1;
    if (ghost && !ship.spectral) {
      ship.spectral = true;
      audio.play('ghost', sfxAt(ship.x, ship.z));
      showBanner(`${ship.type.name} turns spectral!<small>Round shot can't sink her: grape her crew and board her!</small>`, 2.8);
      gameAnnounce(`${ship.type.name} turns spectral. Thin her ghost crew with grape shot, then board her.`);
    }
  }
  ship.hpLow = Math.min(ship.hpLow, Math.max(0, ship.hp));
  if (quiet) {
    ship.flash = Math.max(ship.flash, 0.1);
  } else {
    ship.flash = 0.3;
    splinters(hx, hz);
    puff(hx, 1.6, hz, 3, 0xffb627, 3, 3, 0.5, 0.3, 0, false, 'glow');
    audio.play('hit', sfxAt(hx, hz));
  }
  if (info) hullHit(ship, hx, hz, amt, info, effect);
  // Hull damage thins her crew too (SPEC2 §3.1): at the notch she strikes at once, whatever hurt her
  // (a keg burning, a floe, lava; checkSurrender skips a ship being boarded and one going down).
  if (ship.kind === 'enemy') checkSurrender(ship);
  if (ship.kind === 'player') {
    state.hurtBy[source] = (state.hurtBy[source] || 0) + amt;
    state.lastHit = state.time;
    shakeCamera(0.4);
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
      helm.cheer = visualTime + 1.5;
      overboard.clearSurrender(ship);
      mechanics.onSink(ship);
      // A ship drops her gold once: any of her coins still afloat from an earlier sinking go first (a ship
      // only sinks twice when a test puts her back afloat; point-blank broadsides now sink a cutter outright).
      for (let i = coins.length - 1; i >= 0; i--) {
        if (coins[i].from === ship.id) {
          scene.remove(coins[i].mesh);
          coins.splice(i, 1);
        }
      }
      for (let i = 0; i < ship.type.gold; i++) {
        const a = (i / ship.type.gold) * Math.PI * 2;
        const mesh = new THREE.Mesh(coinGeo, coinMat);
        scene.add(mesh);
        coins.push({ mesh, x: ship.x + Math.cos(a) * 2.5, z: ship.z + Math.sin(a) * 2.5, spin: Math.random() * 6, from: ship.id });
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
// Bombs (SPEC2 §6.2), by the level's def.bombs.kind: 'lava' (lobbed from the volcano, a whistle and a red
// circle) or 'lightning' (no projectile: a white-blue circle for `warn` s, then a bolt from the sky).
// Radius, damage and warning time come from def.bombs (defaults: the volcano's numbers).
// ---------------------------------------------------------------------------
function bombSpec(def) {
  const B = def.bombs || {};
  const kind = B.kind === 'lightning' ? 'lightning' : 'lava';
  const warn = Array.isArray(B.warn) && B.warn.length === 2 ? B.warn : [2.4, 3.2];
  return { kind, radius: B.radius ?? BOMB_RADIUS, damage: B.damage ?? BOMB_DAMAGE, warn, spread: B.spread ?? 9 };
}
function launchBomb() {
  if (!player || player.sinking || !env) return;
  const def = LEVELS[state.level - 1];
  if (!def.bombs) return;
  const spec = bombSpec(def);
  const v = env.volcano;
  if (spec.kind === 'lava' && !v) return;
  const T = rand(...spec.warn);
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
  const d = Math.random() * spec.spread;
  const tx = px + Math.cos(a) * d;
  const tz = pz + Math.sin(a) * d;
  const zone = buildZone(spec.kind, spec.radius);
  scene.add(zone);
  if (spec.kind === 'lightning') {
    bombs.push({ kind: 'lightning', mesh: null, zone, tx, tz, t: 0, T, radius: spec.radius, damage: spec.damage, whistle: null });
    if (!state.bombWarned) {
      state.bombWarned = true;
      showBanner('Lightning!<small>Steer out of the white circle</small>', 2.5);
    }
    return;
  }
  const mesh = new THREE.Mesh(bombGeo, bombMat);
  scene.add(mesh);
  const whistle = audio.play('bombWhistle', sfxAt(tx, tz, { duration: T }));
  bombs.push({ kind: 'lava', mesh, zone, sx: v.x, sy: v.craterY, sz: v.z, tx, tz, t: 0, T, H: 30 + Math.random() * 15, radius: spec.radius, damage: spec.damage, whistle });
  if (!state.bombWarned) {
    state.bombWarned = true;
    showBanner('Lava bomb!<small>Steer out of the red circle</small>', 2.5);
  }
}

function bombPos(b, u) {
  if (b.kind === 'lightning') return { x: b.tx, y: 0, z: b.tz };
  return {
    x: b.sx + (b.tx - b.sx) * u,
    y: b.sy * (1 - u) + 4 * b.H * u * (1 - u),
    z: b.sz + (b.tz - b.sz) * u,
  };
}

// `frozen`: the boarding truce holds every bomb and warning where it is.
function updateBombs(dt, frozen = false) {
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i];
    if (frozen) continue;
    b.t += dt;
    const u = b.t / b.T;
    if (u < 1) {
      if (b.kind === 'lightning') {
        // static crackling inside the circle as the strike nears
        if (Math.random() < dt * 14 * u) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * b.radius;
          spawnParticle('glow', Math.random() < 0.5 ? 0xe8f6ff : 0x8fd0ff, b.tx + Math.cos(a) * r, 0.6, b.tz + Math.sin(a) * r, 0, rand(1, 3), 0, 0.25, 0.3, 0);
        }
      } else if (Math.random() < dt * 20) {
        const p = bombPos(b, u);
        spawnParticle('glow', Math.random() < 0.5 ? 0xff7b1c : 0xffd23f, p.x, p.y, p.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), 0.5, 0.5, 0);
        spawnParticle('puff', 0x8a7f8e, p.x, p.y, p.z, rand(-0.5, 0.5), 1, rand(-0.5, 0.5), 1.0, 0.5, 0, true, false, true);
      }
      continue;
    }
    // Impact.
    const radius = b.radius ?? BOMB_RADIUS;
    const dmg = b.damage ?? BOMB_DAMAGE;
    const source = b.kind === 'lightning' ? 'lightning' : 'lava';
    if (b.kind === 'lightning') {
      if (env && env.flash) env.flash(b.tx, b.tz); // the bolt and the sky flash (photosensitivity caps in the env)
      audio.play('thunder', sfxAt(b.tx, b.tz));
      foam(b.tx, 0.5, b.tz, 14, 7, 10, 0.6, 0.9);
      puff(b.tx, 1, b.tz, 12, 0xe8f6ff, 7, 9, 0.5, 0.5, GRAVITY, false, 'glow');
    } else {
      b.whistle.stop(0.03);
      audio.play('bombBoom', sfxAt(b.tx, b.tz));
      foam(b.tx, 0.5, b.tz, 16, 8, 12, 0.7, 1.0);
      puff(b.tx, 1, b.tz, 10, 0xff7b1c, 7, 9, 0.6, 0.7, GRAVITY, false, 'glow');
      puff(b.tx, 1, b.tz, 6, foamColor, 5, 4, 0.9, 1.4, 2, true, 'glow'); // steam
    }
    const ships = player ? [player, ...enemies] : enemies;
    for (const s of ships) {
      if (s.hp <= 0 || s.captured || s.escaped) continue;
      const d = Math.hypot(s.x - b.tx, s.z - b.tz);
      const reach = radius + s.type.wid * 0.4;
      if (d < reach) damage(s, Math.round(dmg * (1 - (0.5 * d) / reach)), b.tx, b.tz, source);
    }
    if (player && Math.hypot(player.x - b.tx, player.z - b.tz) < 25) shakeCamera(0.5);
    removeBomb(b);
    bombs.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
function steerToward(ship, desired, dt, fullRate = false) {
  const t = ship.type;
  const rate = (fullRate ? t.turn : t.turn * (0.35 + 0.65 * Math.min(1, ship.speed / t.maxSpeed))) * turnMul(ship);
  const diff = wrapAngle(desired - ship.h);
  ship.h = wrapAngle(ship.h + clamp(diff, -rate * dt, rate * dt));
}

// Top speed now: reefs slow deep hulls (ice slows every hull), then chain shot and a dropped mast.
function speedCap(s) {
  let cap = s.type.maxSpeed;
  if (s.onReef && s.reefIce) cap *= ICE_SLOW;
  else if (s.onReef && !s.type.shallow) cap *= REEF_SLOW;
  return cap * speedMul(s);
}

function updatePlayer(dt) {
  const p = player;
  if (p.sinking) return;
  const t = p.type;
  // No steering while the ships are glued together in a boarding (SPEC2 §3.4).
  const turn = boarding.locked ? 0 : (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const rate = t.turn * (0.35 + 0.65 * Math.min(1, p.speed / t.maxSpeed)) * turnMul(p) * boarding.turnScale;
  p.h = wrapAngle(p.h + turn * rate * dt);
  const target = Math.min(SAIL_LEVELS[state.sail] * speedCap(p), boarding.speedCap);
  p.speed += clamp(target - p.speed, -t.accel * 1.5 * dt, t.accel * dt);

  // (No repairs while a boarding is on: every hand is on the ropes or fighting.)
  if (state.time - state.lastHit > (t.regenDelay ?? REGEN_DELAY) && p.hp < p.maxHp && !boarding.active) {
    p.hp = Math.min(p.maxHp, p.hp + (t.regen ?? REGEN_RATE) * dt);
    if (!state.regenShown && state.bannerTimer <= 0 && state.clearTimer <= 0) {
      state.regenShown = true;
      showBanner('Repairing!<small>Out of the fight, your crew patches the hull</small>', 2.2);
    }
    // Hull back to full: the holes are patched too.
    if (p.hp >= p.maxHp) {
      clearHoles(p.mesh);
      p.firstHole = null;
      p.hitsBySide.port = p.hitsBySide.star = 0;
    }
  }
}

function updateEnemy(e, dt, attacking) {
  if (e.sinking || e.escaped) return;
  if (boarding.suspends(e)) return; // grappled: the boarding hauls her in and holds her alongside
  const t = e.type;
  if (e.captured) {
    // A prize crew sails her off under your flag: clear of you first, then straight out to the nearest
    // edge of the sea.
    const p = player;
    const away = p && Math.hypot(e.x - p.x, e.z - p.z) < 16 ? Math.atan2(e.x - p.x, e.z - p.z) : Math.atan2(e.x, e.z);
    steerToward(e, away, dt, true);
    e.speed += clamp(CAPTURE.sailSpeed - e.speed, -t.accel * 1.5 * dt, t.accel * dt);
    return;
  }
  if (e.rise > 0) {
    // (Rising from the deep: she surfaces where she is, then sails.)
    e.speed = 0;
    return;
  }
  if (e.surrendered) {
    // Struck: nobody at the helm. She keeps her heading and drifts (at most 1.5 u/s).
    e.speed += clamp(Math.min(1.2, speedCap(e)) - e.speed, -t.accel * 1.5 * dt, t.accel * dt);
    return;
  }
  const p = player;
  const def = LEVELS[state.level - 1];
  let desired = e.h;
  let targetSpeed = t.maxSpeed * 0.6;
  // A level mechanic may sail her instead (a treasure galleon running for her escape gate).
  const steered = mechanics.steer(e, dt);
  if (steered) {
    desired = steered.h;
    targetSpeed = steered.speed;
  }

  if (p && !p.sinking) {
    const r = relative(e, p.x, p.z);
    const toPlayer = Math.atan2(p.x - e.x, p.z - e.z);
    if (steered) {
      // (the mechanic decides)
    } else if (!attacking) {
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
    } else if (t.boarder && e.boardCooldown > RAIDERS.sheer && boarding.counterTarget !== e) {
      // A raider whose ropes were just cut (or who was beaten off) sheers away and circles wide for a while.
      // (Not while her lines are still on you in the counter-board window: she holds alongside for it.)
      const a1 = wrapAngle(toPlayer + Math.PI / 2);
      const a2 = wrapAngle(toPlayer - Math.PI / 2);
      desired = Math.abs(wrapAngle(a1 - e.h)) < Math.abs(wrapAngle(a2 - e.h)) ? a1 : a2;
      const sideOfPlayer = Math.sign(wrapAngle(desired - toPlayer));
      if (r.dist < 22) desired += sideOfPlayer * 0.7;
      targetSpeed = t.maxSpeed * 0.75;
    } else if (t.boarder) {
      // Raiders (SPEC2 §3.6) don't circle: they run in for a spot RAIDERS.beside off your beam, on the side
      // they are already on, and match your course there to throw their hooks.
      const pr = relative(p, e.x, e.z);
      const side = pr.lat >= 0 ? 1 : -1;
      const tx = p.x + rightX(p.h) * side * RAIDERS.beside + fwdX(p.h) * p.speed * 0.5;
      const tz = p.z + rightZ(p.h) * side * RAIDERS.beside + fwdZ(p.h) * p.speed * 0.5;
      const gap = Math.hypot(tx - e.x, tz - e.z);
      const toSpot = Math.atan2(tx - e.x, tz - e.z);
      // close in on the spot; alongside, sail your course
      const k = clamp((gap - 2) / 6, 0, 1);
      desired = wrapAngle(p.h + wrapAngle(toSpot - p.h) * k);
      targetSpeed = clamp(p.speed + gap * 0.9, 2, t.maxSpeed);
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

    // Fire when the player is roughly abeam and in range (mayFire() asks the mechanics and the boarding).
    if ((attacking || steered) && state.combatTime > def.grace && r.dist < MAX_RANGE - 4 && Math.abs(r.along) < Math.abs(r.lat) * 0.45) {
      fire(e, r.lat > 0 ? 1 : -1, p, { spread: t.spread * def.spreadMul, lead: def.lead, rangeErr: rand(0.88, 1.12) });
    }
    // A raider alongside throws its hooks.
    if (attacking && t.boarder) raiderTry(e, r.dist);
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
  for (const o of mechanics.avoid()) avoid(o, t.wid + 2); // e.g. the maelstrom's eye
  for (const o of enemies) {
    if (o === e || o.sinking || o.captured || o.escaped) continue;
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
  // (Grappled ships are moved by the boarding: it hauls her in and then sails the glued pair.)
  if (!boarding.moves(s)) {
    s.x += fwdX(s.h) * s.speed * dt;
    s.z += fwdZ(s.h) * s.speed * dt;
    // A level's current (the maelstrom) carries every ship along.
    const d = mechanics.drift(s);
    if (d) {
      s.x += d.vx * dt;
      s.z += d.vz * dt;
    }
  }
  resolveLand(s, dt);

  // Reefs slow deep hulls; ice floes slow every hull.
  const wasOnReef = s.onReef;
  const reef = reefs.find((r) => Math.hypot(s.x - r.x, s.z - r.z) < r.r);
  s.onReef = !!reef;
  s.reefIce = !!(reef && reef.ice);
  const slowed = s.onReef && (s.reefIce || !s.type.shallow);
  if (s.onReef && !wasOnReef && !s.sinking && (s.kind === 'player' || slowed)) audio.play('reef', sfxAt(s.x, s.z));
  if (s.kind === 'player' && s.onReef && !wasOnReef && !s.sinking && state.bannerTimer <= 0) {
    if (s.reefIce) showBanner('Ice floe!<small>The ice slows every ship down</small>', 1.6);
    else showBanner('Scraping the reef!<small>Shallow water slows you down</small>', 1.6);
  }
  if (slowed) s.speed = Math.min(s.speed, s.type.maxSpeed * (s.reefIce ? ICE_SLOW : REEF_SLOW) + 0.5);
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
  // (Prizes sailing off and escaped ships no longer collide.)
  const all = enemies.filter((e) => e.sinking < 1.5 && !e.captured && !e.escaped);
  if (player) all.push(player);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      if ((a === player && boarding.apart(b)) || (b === player && boarding.apart(a))) continue;
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

// Does ball b hit ship s? Each ammo has its own reach (chain shot also tears through the sails, AMMO.top);
// balls pass through ships that are out of the fight (struck, captured, escaped).
function hitsShip(b, s) {
  if (s.hp <= 0 || s.captured || s.surrendered || s.escaped || s.rise > 0) return false;
  const A = AMMO[b.ammo] || AMMO.round;
  if (b.y > A.top) return false;
  const r = relative(s, b.x, b.z);
  return Math.abs(r.along) < s.type.len / 2 + A.pad && Math.abs(r.lat) < s.type.wid / 2 + A.pad;
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
        const info = ballHit(b, s);
        // the volley's first hit: the HIT mark is set up first, so this ball's pops keep clear of it
        const vol = b.volley ? volleys.get(b.volley) : null;
        if (vol && !vol.hits) primeHitmark(vol, info.tags);
        damage(s, info.dmg, b.x, b.z, b.src, info);
        logShot(b, s, info);
        // A cannonball into the raider whose hooks are biting cuts her lines (SPEC2 §3.6).
        if (b.owner === 'player' && boarding.kind === 'defend' && boarding.phase === 'threat' && boarding.target === s) boarding.cut('hit');
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
  // Battered (grey wisps from her first hole), wrecked (dark smoke) and a burning powder keg (fire at the bow).
  const frac = s.hp / s.maxHp;
  // (No smoke from the ship being boarded, from the hooks on: it would drift over the swing and the brawl.)
  const brawlDeck = boarding.active && boarding.target === s;
  const smoke = brawlDeck ? 0 : frac < STATES.wrecked ? 5 : frac < STATES.battered ? 3 : 0;
  const burning = s.burnTicks > 0;
  if (smoke || burning) {
    s.fxAcc += dt * (smoke + (burning ? 16 : 0));
    const lift = s.mesh.position.y;
    while (s.fxAcc >= 1) {
      s.fxAcc -= 1;
      if (burning && Math.random() * (smoke + 16) < 16) {
        // the keg fire: flames licking up from the bow deck, with dark smoke
        const along = s.type.len * 0.28 + rand(-0.6, 0.6);
        const across = rand(-0.5, 0.5) * s.type.wid * 0.5;
        const px = s.x + fx * along + rightX(s.h) * across;
        const pz = s.z + fz * along + rightZ(s.h) * across;
        const deck = lift + (s.mesh.userData.deckY ?? 1.2) + 0.2;
        if (Math.random() < 0.72) {
          spawnParticle('glow', Math.random() < 0.5 ? 0xff7b1c : 0xffd23f, px, deck, pz, rand(-0.4, 0.4), rand(2.5, 4.5), rand(-0.4, 0.4), rand(0.35, 0.6), rand(0.45, 0.75), 0, false, false, true);
        } else {
          spawnParticle('puff', 0x3e3846, px, deck + 0.6, pz, rand(-0.3, 0.3), rand(2, 3), rand(-0.3, 0.3), rand(1.2, 1.7), rand(0.5, 0.75), 0, true, false, true);
        }
        continue;
      }
      // smoke wisps from the oldest hole (or amidships), grey when battered, dark when wrecked
      const h = s.firstHole;
      const along = h ? h.z : rand(-0.2, 0.2) * s.type.len;
      const across = h ? h.side * s.type.wid * 0.45 : rand(-0.3, 0.3) * s.type.wid;
      const px = s.x + fx * along + rightX(s.h) * across;
      const pz = s.z + fz * along + rightZ(s.h) * across;
      const py = lift + (h ? h.y : (s.mesh.userData.deckY ?? 1.2)) + 0.2;
      const color = smoke >= 5 ? 0x2e2836 : 0xa8a2b4; // (smoke lightens as it rises: wrecked starts near ink)
      spawnParticle('puff', color, px, py, pz, rand(-0.4, 0.4), rand(1.4, 2.2), rand(-0.4, 0.4), rand(1.3, 1.9), rand(0.45, 0.7), 0, true, false, true);
    }
  } else s.fxAcc = 0;
  // The spectral Phantom: green wisps rise off her deck.
  if (s.spectral && !s.captured) {
    s.ghostAcc = (s.ghostAcc || 0) + dt * 6;
    while (s.ghostAcc >= 1) {
      s.ghostAcc -= 1;
      const along = rand(-0.4, 0.4) * s.type.len;
      const across = rand(-0.4, 0.4) * s.type.wid;
      const deck = s.mesh.position.y + (s.mesh.userData.deckY ?? 1.8) + 0.3;
      spawnParticle('glow', Math.random() < 0.5 ? 0x7dffb8 : 0xc8ffe2, s.x + fx * along + rightX(s.h) * across, deck, s.z + fz * along + rightZ(s.h) * across, rand(-0.3, 0.3), rand(1.2, 2.4), rand(-0.3, 0.3), rand(0.8, 1.3), rand(0.25, 0.45), 0, false, false, true);
    }
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

// The hint bubble above the gun card: the first-voyage tutorial (level 1, until it is done), else the
// one-time tips (SPEC2 §5.5); a short "why that did nothing" message (flashHint) shows over either.
function updateHints(dt) {
  let text = '';
  if (player && !player.sinking && state.intro <= 0) {
    if (!state.tutorialDone && state.level === 1) text = tutorialHint(dt);
    else text = tipText();
  }
  if (state.time < state.flash.until && player && !player.sinking) text = state.flash.text;
  const h = state.hint;
  if (text && h.text !== text) ui.hint.innerHTML = text;
  h.text = text;
  show(ui.hint, !!text);
}

// First-voyage hints (level 1 only).
function tutorialHint(dt) {
  const h = state.hint;
  h.t += dt;
  const touch = isTouch();
  const range = AMMO[state.ammo].range;
  let text = '';
  if (h.step === 0) {
    text = touch ? 'Hold &#9664; &#9654; to steer &middot; tap <b>+ Sail</b> for speed' : 'Steer with <kbd>A</kbd> <kbd>D</kbd> &middot; more sail with <kbd>W</kbd>';
    if (h.t > 7) h.step = 1;
  } else if (h.step === 1) {
    if (h.hits > 0) {
      h.step = 2;
      h.t = 0;
    } else {
      const port = enemies.some((e) => inArc(player, e, -1, range));
      const star = enemies.some((e) => inArc(player, e, 1, range));
      const near = enemies.some((e) => fighting(e) && Math.hypot(e.x - player.x, e.z - player.z) < range);
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
  return text;
}

// One-time tips (bits of TIPS_KEY, SPEC2 §5.5), one at a time in the hint bubble, never during the
// first-voyage tutorial. Returns whether it shows (false: shown before, or not now).
function showTip(bit, keys, touch = keys, seconds = 6) {
  if (tips & bit) return false;
  if (!state.tutorialDone && state.level === 1) return false;
  if (state.time < state.tip.until) return false;
  tips |= bit;
  saveNumber(TIPS_KEY, tips);
  state.tip = { text: isTouch() ? touch : keys, until: state.time + seconds, bit };
  return true;
}
function tipText() {
  // New ammo this voyage: once the level's banner has gone.
  if (state.ammoTipDue && state.bannerTimer <= 0 && state.time >= state.tip.until && !boarding.active) newAmmoTip();
  return state.time < state.tip.until ? state.tip.text : '';
}
function newAmmoTip() {
  const id = state.ammoTipDue & TIP.chain ? 'chain' : 'grape';
  state.ammoTipDue &= ~TIP[id];
  const key = id === 'chain' ? 2 : 3;
  const ok = showTip(
    TIP[id],
    id === 'chain' ? 'New: chain shot slows ships! <kbd>2</kbd> or <kbd>R</kbd>' : 'New: grape shot clears decks! <kbd>3</kbd>',
    id === 'chain' ? 'New: chain shot! Tap <b>Ammo</b>' : 'New: grape shot! Tap <b>Ammo</b>',
    7
  );
  if (!ok) return;
  const touch = isTouch();
  showBanner(`New ammo: ${AMMO_NAMES[id]} shot!<small>${touch ? 'Tap Ammo' : `Press <kbd>${key}</kbd>`}</small>`, 2.6);
  // (Screen readers hear the tip: the hint bubble is a live region. Not read twice in other words.)
}

// A short message in the hint bubble (why that key did nothing), for `seconds` of play.
function flashHint(text, seconds = 2) {
  state.flash = { text, until: state.time + seconds };
  if (state.mode !== 'playing' || !player) return;
  ui.hint.innerHTML = text;
  state.hint.text = text;
  show(ui.hint, true);
}

function step(dt) {
  state.time += dt;
  if (state.intro > 0) state.intro = Math.max(0, state.intro - dt * state.introRate);
  else state.combatTime += dt;
  state.edgeCooldown = Math.max(0, state.edgeCooldown - dt);
  const def = LEVELS[state.level - 1];
  // Gameplay motion of the environment itself (drifting ice floes), in simulated time.
  if (env && env.step) env.step(state.time, dt);
  // Chain-shot slows and crit effects wear off; a burning powder keg ticks (SPEC2 §2.3).
  if (player) updateEffects(player, dt);
  for (const e of enemies) {
    updateEffects(e, dt);
    if (e.rise > 0) e.rise = Math.max(0, e.rise - dt); // rising from the deep (syncShip lowers her meanwhile)
    if (e.boardCooldown > 0) e.boardCooldown = Math.max(0, e.boardCooldown - dt); // a raider's hooks coiling
  }
  state.boardCooldown = Math.max(0, state.boardCooldown - dt); // your grapples coiling (SPEC2 §3.4)
  // The boarding truce (swing..result): bombs and lightning wait (their timers are pushed back).
  const truce = boarding.truce;
  if (truce) state.nextBomb += dt;
  if (player) updatePlayer(dt);
  // The nearest pirates get the attack slots (ships escaping from land, and treasure galleons, don't count).
  const attackers = new Set(
    enemies
      .filter((e) => fighting(e) && !e.type.merchant && player && e.escapeUntil <= state.time)
      .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))
      .slice(0, def.maxAttackers)
  );
  for (const e of enemies) updateEnemy(e, dt, attackers.has(e));
  // The boarding set-piece (simulated time): phases, the reel, the glued pair (it moves those two ships).
  boarding.step(dt);
  // The counter-board window has closed (or a counter-board started, or she sank or struck): its banner and
  // tip go with it, so "Press G" never shows when G can't board her back.
  if (state.counterBanner && !boarding.counterTarget) {
    state.counterBanner = false;
    if (state.bannerTimer > 0.3 && /^Counter-board!/.test(ui.banner.textContent)) state.bannerTimer = 0.3;
    if (state.tip.bit === TIP.counter) state.tip.until = 0;
  }
  if (player) moveShip(player, dt);
  for (const e of enemies) moveShip(e, dt);
  mechanics.step(dt); // floes crunch, the maelstrom's eye grinds, galleons slip through their gates
  separateShips(dt);
  updateBalls(dt);
  updateCoins(dt);
  updateBombs(dt, truce);
  if (player) emitShipFx(player, dt);
  for (const e of enemies) emitShipFx(e, dt);
  updateHints(dt);

  // The horn of reinforcements waits for a capture's fanfare to finish (stingers don't stack).
  if (state.waveHorn && state.time >= state.waveHorn.at) {
    audio.play('wave', { pitch: state.waveHorn.pitch });
    state.waveHorn = null;
  }

  // Remove fully sunk enemies, prizes that have sailed off (a puff of gold) and ships that escaped.
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.sinking > 4 || state.time >= e.removeAt) {
      if (e.captured && !e.sinking) {
        for (let k = 0; k < 14; k++) {
          spawnParticle('glow', k % 2 ? 0xffe27a : 0xffffff, e.x + rand(-2, 2), rand(1, 4), e.z + rand(-2, 2), rand(-2, 2), rand(1, 4), rand(-2, 2), rand(0.4, 0.8), rand(0.3, 0.6), 0);
        }
        foam(e.x, 0.5, e.z, 10, 6, 4, 0.7, 0.9);
      }
      removeShip(e);
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
    // Ships that struck their colours and were never boarded are yours anyway (SPEC2 §3.1).
    let taken = 0;
    for (const e of enemies) {
      if (e.surrendered && !e.captured && e.hp > 0 && !e.sinking) {
        if (boarding.active && boarding.target === e) boarding.cancel('level');
        captureShip(e, 'auto');
        taken++;
      }
    }
    const won = isFinale(state.level);
    audio.play(won ? 'victory' : 'levelClear');
    const bossLine = state.lastBossCaptured
      ? `<small>${theName(state.lastBossCaptured)} is yours!</small>`
      : state.lastBossSunk
        ? `<small>${state.lastBossSunk} is sunk!</small>`
        : '';
    const struckLine = taken ? `<small>${taken === 1 ? 'The surrendered ship is yours!' : 'The surrendered ships are yours!'}</small>` : '';
    const onward = won && state.level < LEVELS.length; // a finale with the Far Seas still to come
    showBanner(
      won
        ? `Victory!${bossLine}${struckLine}<small>${onward ? 'The Old World is yours' : 'The seas are yours'}</small>`
        : `Level cleared!${bossLine}${struckLine}<small>Grab the loot</small>`,
      2.5
    );
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

// Ammo unlocked with the voyage's progress (chain after the Coast of Europe, grape after Bali).
function unlockedAmmo() {
  return AMMO_IDS.filter((id) => ammoUnlocked(id, state.unlocked));
}
// Load another shot in both broadsides: the gun crews need at least AMMO_SWAP seconds to change it.
// A locked one says why in the hint bubble. Returns whether that ammo is loaded now.
function setAmmo(id) {
  if (!AMMO_IDS.includes(id)) return false;
  if (!ammoUnlocked(id, state.unlocked)) {
    flashHint(AMMO_LOCKED[id], 2);
    return false;
  }
  if (state.ammo === id) return true;
  state.ammo = id;
  if (player) {
    for (const k of ['port', 'star']) {
      if (player.reload[k] < AMMO_SWAP) {
        player.reload[k] = AMMO_SWAP;
        player.reloadMax[k] = AMMO_SWAP;
      }
    }
  }
  audio.play('click', { pitch: id === 'round' ? 0.85 : id === 'chain' ? 1 : 1.15 });
  gameAnnounce(`${AMMO_NAMES[id]} shot loaded.`);
  return true;
}
// R / the touch Ammo pill: the next unlocked ammo.
function cycleAmmo() {
  const list = unlockedAmmo();
  if (list.length < 2) {
    flashHint(AMMO_LOCKED.chain, 2);
    return state.ammo;
  }
  setAmmo(list[(list.indexOf(state.ammo) + 1) % list.length]);
  return state.ammo;
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
  boarding.cutHold(false); // a held G (or Board) is let go too
  saveFeats();
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
    openPause();
  } else if (state.mode === 'paused') {
    if (dockSoon) return; // Leave was pressed: on the way to the shipyard
    closeModal(ui.pause);
    resumeGame();
  }
}

// The pause dialog offers Resume (first, focused) and a way to leave this battle: for the shipyard or for
// the title. Leaving can't be undone, so it asks once, in the same dialog: the question takes the place of
// the choices and focus moves to it (screen readers read it); Leave goes, Keep fighting (or Escape) comes
// back to the choices with focus on the button that asked. P still resumes the game from either step.
// step: 'choose' | 'confirm' | 'leaving' (Leave pressed; the shipyard opens two frames later); to: 'dock' | 'menu'.
const pauseUi = { step: 'choose', to: null, askedAt: -Infinity };
function openPause() {
  showPauseChoices();
  openModal(ui.pause); // focus on Resume
}
function showPauseChoices(focus = null) {
  pauseUi.step = 'choose';
  pauseUi.to = null;
  show(ui.pauseConfirm, false);
  show(ui.pauseChoices, true);
  if (focus) focus.focus({ preventScroll: true });
}
function askLeave(to) {
  if (activeModal() !== ui.pause || state.mode !== 'paused' || dockSoon) return;
  pauseUi.step = 'confirm';
  pauseUi.to = to;
  pauseUi.askedAt = performance.now();
  ui.leaveWhy.textContent = '';
  // "Level cleared!" is counting down: the level is won, and leaving banks it (see leaveBattle).
  const won = state.clearTimer > 0;
  ui.leaveNo.textContent = won ? 'Stay' : 'Keep fighting';
  if (won) {
    ui.leaveQ.textContent = to === 'dock' ? 'Level cleared! On to the shipyard?' : 'Level cleared! Back to the main menu?';
    const b = document.createElement('b');
    b.textContent = `${levelWinnings()} gold`;
    ui.leaveWhy.append('This level is won: its ', b, ' of plunder and bonuses goes into your treasure chest', state.level < LEVELS.length ? ' and the next level opens.' : '.');
    show(ui.pauseConfirm, true);
    show(ui.pauseChoices, false);
    ui.leavePrompt.focus({ preventScroll: true });
    return;
  }
  ui.leaveQ.textContent = to === 'dock' ? 'Leave the battle for the shipyard?' : 'Leave the battle for the main menu?';
  // "The 120 gold plundered in this level won't be banked." (it goes as it does in a shipwreck)
  const lost = Math.max(0, Math.round(state.gold - state.goldAtLevelStart));
  if (lost > 0) {
    const b = document.createElement('b');
    b.textContent = `${lost} gold`;
    ui.leaveWhy.append('The ', b, " plundered in this level won't be banked.");
  } else {
    ui.leaveWhy.append('Nothing plundered in this level yet.');
  }
  ui.leaveWhy.append(' Your treasure chest, upgrades and unlocked levels stay.');
  show(ui.pauseConfirm, true);
  show(ui.pauseChoices, false);
  ui.leavePrompt.focus({ preventScroll: true });
}
function confirmLeave(e) {
  if (activeModal() !== ui.pause || pauseUi.step !== 'confirm' || state.mode !== 'paused') return;
  // The second click of a double-click (or a double tap) on Shipyard / Main menu lands here: not an answer.
  if (e && e.detail > 0 && (e.detail > 1 || performance.now() - pauseUi.askedAt < 350)) return;
  // Decided: the shipyard opens two frames from now (nothing in the dialog undoes that in between).
  pauseUi.step = 'leaving';
  leaveBattle(pauseUi.to);
}
function cancelLeave() {
  if (pauseUi.step !== 'confirm') return;
  showPauseChoices(pauseUi.to === 'menu' ? ui.quitMenu : ui.quitDock);
}

// Leave the battle in play (paused, or through the test API): for the shipyard ('dock'; its ways out are a
// shipwreck's: try this level again, or the title) or for the title ('menu': the voyage ends there). This
// level's plunder goes as in a shipwreck (see abandonLevel). From a button the dock opens two frames later
// (openDockSoon); `now` opens it at once.
function leaveBattle(to, now = false) {
  if (state.mode !== 'paused' && state.mode !== 'playing') return false;
  if (to !== 'dock' && to !== 'menu') return false;
  // "Level cleared!" is counting down: the level is won. It is finished first, as when the countdown ends
  // (plunder, loot afloat and bonuses banked, the next level opened), and left as from the level-cleared
  // screen: the shipyard with its ways on (sail on, or the title), or the title.
  if (state.clearTimer > 0) {
    state.clearTimer = 0;
    finishLevel(); // mode 'levelDone' ('won' after a finale), that screen up behind the pause dialog
    if (to === 'menu') {
      exitVoyage();
      titleShown();
      return true;
    }
    show(ui.levelDone, false); // the shipyard takes its place
    show(ui.won, false);
    if (now) return openDock('levelDone');
    openDockSoon('levelDone');
    return true;
  }
  if (to === 'dock') {
    if (now) return openDock('quit');
    openDockSoon('quit');
    return true;
  }
  abandonLevel();
  showMenu();
  titleShown();
  return true;
}
// What finishing this level banks (finishLevel): the plunder so far, the loot still afloat and the bonuses.
function levelWinnings() {
  const def = LEVELS[state.level - 1];
  const mech = Math.max(0, Math.round(Number(mechanics.bonus()) || 0));
  const loot = state.gold - state.goldAtLevelStart + coins.length * COIN_VALUE;
  return Math.max(0, Math.round(loot + def.bonus + state.captures * CAPTURE.prizeBonus + mech));
}
// This level's unbanked plunder is dropped exactly as in a shipwreck: the voyage's gold goes back to what it
// was when the level started (a retry starts from there), the treasure chest is untouched (nothing of this
// level was banked) and the best voyage counts that gold. Everything of the battle itself (ships, shots,
// bombs, a boarding, tags, pops, sailors overboard, the helm captain, the level's mechanics) is cleared by
// the caller: openDock or showMenu (clearLevelEntities + releaseBattlePeople).
function abandonLevel() {
  clearSteering();
  boarding.cutHold(false);
  state.gold = state.goldAtLevelStart;
  raiseBest(state.gold);
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
  // Ashore, the Harbour menu or All aboard? closes (focus goes back to the town when the view returns).
  if (activeModal() === ui.harbourDialog || activeModal() === ui.aboardDialog) closeModal(modal);
  ui.recoverTitle.textContent = 'Graphics paused';
  const what =
    state.mode === 'dock'
      ? townMode.active
        ? 'The town will be back in a moment; your treasure chest and your ship are safe.'
        : 'The shipyard will be back in a moment; your treasure chest and your ship are safe.'
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
    // It was paused before: stay paused (back at the choices). Not if Leave has taken the game to the shipyard
    // or the title meanwhile: there is no battle to pause any more.
    if (recovery.pauseWasOpen && state.mode === 'paused') openPause();
    else if (state.mode === 'dock' && townMode.active) townMode.onContextRestored(); // the town HUD or the open panel
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
  // A held Enter or Space auto-repeats. Outside play (the title, the end screens, a dialog, the shipyard and the
  // town) a repeat never clicks the button that has focus: the first press may have put it there, on the next
  // screen (All aboard?'s first exit, a place's button after "Back to town"). One press is one click.
  if ((k === 'enter' || k === ' ') && e.repeat && (state.mode !== 'playing' || open) && document.activeElement instanceof HTMLButtonElement) {
    e.preventDefault();
    return;
  }
  // Ashore (walking, Polly's, the tavern, the Harbour menu and All aboard?) townMode decides: it walks,
  // opens places, and Escape closes its dialogs (the dock's own P / Escape do nothing).
  if (state.mode === 'dock' && townMode.onKey(e, true)) return;
  // At the shipyard the panel's buttons (and the browser) handle the keys: P, Escape and a bare
  // Enter do nothing, arrows scroll the panel. With nothing focused, ←/→ (or A/D) turn the view.
  if (state.mode === 'dock' && !open) {
    if (k === 'm') {
      if (!e.repeat) {
        toggleMute();
        announce(audio.muted ? 'Sound off.' : 'Sound on.');
      }
    } else if (KEYMAP[k] && townMode.view === 'shop' && !ui.dock.contains(document.activeElement)) {
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
    else if (state.mode === 'won') {
      // After a finale with more voyage to come (the Molten Maw): sail on, as the first button does.
      if (state.level < LEVELS.length) nextLevel();
      else showMenu();
    }
    else if (state.mode === 'levelDone') nextLevel();
    else if (state.mode === 'over') retryLevel();
    else if (boarding.phase === 'brawl') boarding.skip();
    else skipIntro();
    return;
  }
  if (k === 'm') {
    if (!e.repeat) toggleMute();
    return;
  }
  // Escape on "Leave the battle?" goes back to the pause choices (P resumes the game, as always).
  if (k === 'escape' && open === ui.pause && pauseUi.step === 'confirm') {
    if (!e.repeat) cancelLeave();
    return;
  }
  if (k === 'p' || k === 'escape') {
    if (!e.repeat) togglePause();
    return;
  }
  if (state.mode !== 'playing') return;
  skipIntro();
  // Ammo: R cycles, 1 / 2 / 3 pick (by physical key, so AZERTY works).
  const ammoKey = /^(?:Digit|Numpad)([123])$/.exec(e.code || '');
  if (KEYMAP[k]) steerPress(KEYMAP[k], keySource(e));
  else if (!e.repeat && (k === 'w' || k === 'arrowup')) changeSail(1);
  else if (!e.repeat && (k === 's' || k === 'arrowdown')) changeSail(-1);
  else if (k === 'r') {
    if (!e.repeat) cycleAmmo();
  } else if (k === 'g') {
    // Board (SPEC2 §5.1): grapple, heave, cut the raiders' ropes (3 presses, or hold it), counter-board,
    // skip the brawl. Holding G during a raider's threat cuts the ropes after RAIDERS.cutHold s.
    if (!e.repeat) boardPress();
    boarding.cutHold(true);
  } else if (ammoKey) {
    if (!e.repeat) setAmmo(AMMO_IDS[Number(ammoKey[1]) - 1]);
  }
  // Holding a fire key keeps firing whenever the guns reload.
  else if (k === 'q' || k === 'j') playerFire(-1);
  else if (k === 'e' || k === 'l') playerFire(1);
  else if (k === ' ') {
    // (No gun crew fires during a boarding; Space skips the brawl instead.)
    if (boarding.phase === 'brawl') {
      if (!e.repeat) boarding.skip();
    } else {
      playerFire(-1);
      playerFire(1);
    }
  }
});

window.addEventListener('keyup', (e) => {
  if (state.mode === 'dock') townMode.onKey(e, false); // (a walking key let go)
  if (e.key.toLowerCase() === 'g' || e.code === 'KeyG') boarding.cutHold(false);
  const src = keySource(e);
  for (const dir of ['left', 'right']) if (steerSources[dir].has(src)) steerRelease(dir, src);
});

// Keys released while the window is unfocused never send keyup: forget everything held.
window.addEventListener('blur', () => {
  clearSteering();
  boarding.cutHold(false);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearSteering();
    saveFeats();
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
  // The act pad: cycle the ammo; Board (grapple / heave / cut, wired with the boarding set-piece).
  ammo: () => {
    if (state.mode === 'playing') cycleAmmo();
  },
  board: () => {
    if (state.mode === 'playing') boardPress();
  },
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
    // A held Enter clicks again on every auto-repeat: one press is one sail step (one grapple, one heave).
    // (Fire buttons keep repeating, like a held fire key.)
    if (e.key === 'Enter' && e.repeat && (btn.dataset.tap.startsWith('sail') || btn.dataset.tap === 'board')) e.preventDefault();
  });
}
// Hold-to-cut on the Board button (SPEC2 §5.2): while a raider's hooks bite, holding it for RAIDERS.cutHold s
// cuts the ropes (a tap still counts as one of the three cuts). Pointer capture: sliding off still lets go.
{
  const btn = ui.touchBoard;
  const release = () => boarding.cutHold(false);
  btn.addEventListener('pointerdown', (e) => {
    try {
      btn.setPointerCapture(e.pointerId);
    } catch {
      // synthetic events have no capturable pointer
    }
    boarding.cutHold(true);
  });
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('lostpointercapture', release);
}

$('start-btn').addEventListener('click', (e) => {
  if (!titleClickTooSoon(e)) newGame(1);
});
$('resume-btn').addEventListener('click', togglePause);
// Leave this battle (pause dialog): ask first, then go.
ui.quitDock.addEventListener('click', () => askLeave('dock'));
ui.quitMenu.addEventListener('click', () => askLeave('menu'));
$('leave-yes-btn').addEventListener('click', confirmLeave);
$('leave-no-btn').addEventListener('click', cancelLeave);
$('next-btn').addEventListener('click', nextLevel);
ui.act2Btn.addEventListener('click', nextLevel); // "Sail on to the Far Seas" (the won screen, when a level follows)
$('retry-btn').addEventListener('click', retryLevel);
$('menu-btn').addEventListener('click', () => {
  showMenu();
  titleShown();
});
$('again-btn').addEventListener('click', () => {
  showMenu();
  titleShown();
});
$('exit-btn').addEventListener('click', () => {
  exitVoyage();
  titleShown();
});
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

// The chest, the ship, the tavern record or the feats changed in another tab of the game: show it here too.
window.addEventListener('storage', (e) => {
  const any = e.key === null; // (storage cleared)
  const counted = (any || e.key === FEATS_KEY) && syncFeats(); // counted there: added to what this tab counted
  const grapple = armoryCfg.up.grapple;
  const armory = (any || e.key === ARMORY_KEY) && syncArmory(); // bought at the tavern there
  const chest = (any || e.key === PURSE_KEY || e.key === SHIP_KEY) && syncSaved();
  const dressed = (any || e.key === LOOK_KEY) && syncLook(); // bought or worn at Polly's there
  // A level opened (or a best voyage) there: never lower here, and the title's cards show it.
  if ((any || e.key === PROGRESS_KEY || e.key === BEST_KEY) && syncProgress() && state.mode === 'menu') renderLevelCards();
  if (state.mode === 'dock' && (counted || dressed)) townMode.refresh(); // (the wardrobe, the log, the captain)
  if (state.mode === 'dock' && dressed) restyleCrew();
  if (!armory && !chest) return;
  if (state.mode === 'dock') {
    if (chest || armoryCfg.up.grapple !== grapple) rebuildDockShip(); // (of the tavern's goods only grapples show)
    renderDock();
    townMode.refresh();
  } else if (state.mode === 'menu') {
    renderLevelCards();
    menuShip();
  }
});

// A button that leads to the title (Leave, Main menu) may be double-clicked or double-tapped: its second
// click lands on whatever the title has there (Set sail! or a level card) and must not start a voyage.
// A pointer click on those counts only when it was made (its timeStamp: when the press happened, however
// long a slow device took to build the title and handle it) at least half a second after a button brought
// the title up; a double-click's second click never counts. Keyboard and assistive-technology clicks
// (detail 0) always act.
let titleShownAt = -Infinity;
function titleShown() {
  if (state.mode === 'menu') titleShownAt = performance.now();
}
function titleClickTooSoon(e) {
  if (!e || !(e.detail > 0)) return false;
  if (e.detail > 1) return true;
  const now = performance.now();
  const at = Number.isFinite(e.timeStamp) && e.timeStamp > 0 && e.timeStamp <= now + 1000 ? e.timeStamp : now;
  return at - titleShownAt < 500;
}

// Level select cards on the title screen, one group per act (SPEC2 §5.6): a heading spanning the grid, then
// that act's cards. Each card: number, name, difficulty word and skull pips ("Difficulty 4 of 6"), and Play
// or why it is locked ("Beat the Molten Maw"). With a single act there are no headings.
const ACT_NAMES = { 1: 'Voyage I · The Old World', 2: 'Voyage II · The Far Seas' };
const SKULL_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 1.6C4.6 1.6 2.2 3.9 2.2 6.9c0 1.8.8 3.2 2.1 4v1.9c0 .8.6 1.4 1.4 1.4h4.6c.8 0 1.4-.6 1.4-1.4v-1.9c1.3-.8 2.1-2.2 2.1-4 0-3-2.4-5.3-5.8-5.3z"/>' +
  '<circle class="eye" cx="5.8" cy="7.3" r="1.55"/><circle class="eye" cx="10.2" cy="7.3" r="1.55"/><path class="eye" d="M7.2 10.4h1.6l-.8-1.3z"/></svg>';
function renderLevelCards() {
  ui.best.textContent = state.best;
  ui.menuChest.textContent = state.purse;
  // (a re-render, e.g. for progress made in another tab, keeps focus on the same card)
  const had = ui.levelCards.contains(document.activeElement) ? document.activeElement.dataset.level : null;
  ui.levelCards.innerHTML = '';
  const acts = new Set(LEVELS.map((d) => d.act || 1));
  const maxStars = Math.max(LEVELS.length, ...LEVELS.map((d) => d.stars || 0));
  let act = null;
  LEVELS.forEach((def, i) => {
    const n = i + 1;
    if (acts.size > 1 && (def.act || 1) !== act) {
      act = def.act || 1;
      const h = document.createElement('h3');
      h.className = `act-head act-${act}`;
      h.textContent = ACT_NAMES[act] || `Voyage ${act}`;
      ui.levelCards.appendChild(h);
    }
    const locked = n > state.unlocked;
    const stars = clamp(Math.round(def.stars || n), 1, maxStars);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `level-card lvl-${n}${locked ? ' locked' : ''}`;
    btn.dataset.level = n;
    // A locked card stays focusable (Tab and screen readers reach it, SPEC2 §13): aria-disabled, and its lock
    // text ("Beat the Molten Maw") is its description rather than part of its name.
    if (locked) {
      btn.setAttribute('aria-disabled', 'true');
      btn.setAttribute('aria-describedby', `lvl-${n}-why`);
    }
    const pips = Array.from({ length: maxStars }, (_, k) => `<span class="skull${k < stars ? ' on' : ''}">${SKULL_SVG}</span>`).join('');
    btn.innerHTML =
      `<span class="lvl-num">${n}</span>` +
      `<span class="lvl-name">${def.env.meta.name}</span>` +
      `<span class="lvl-diff" title="Difficulty"><span class="diff-word">${def.difficulty}</span>` +
      `<span class="lvl-pips" role="img" aria-label="Difficulty ${stars} of ${maxStars}">${pips}</span></span>` +
      (locked ? `<span class="lvl-lock" id="lvl-${n}-why" aria-hidden="true">${def.lockText || 'Locked'}</span>` : '<span class="lvl-lock">Play</span>');
    btn.addEventListener('click', (e) => {
      // A locked level never starts: Enter, Space or an assistive click on its card says why instead.
      if (n > state.unlocked) {
        lockedCard(btn, n);
        return;
      }
      if (!titleClickTooSoon(e)) newGame(n);
    });
    ui.levelCards.appendChild(btn);
  });
  if (had) {
    const again = ui.levelCards.querySelector(`.level-card[data-level="${had}"]`);
    if (again) again.focus({ preventScroll: true });
  }
  menuPin();
}
// A locked card pressed: its lock text flashes and is read out ("Doubloon Bay is locked. Beat the Molten Maw.").
function lockedCard(btn, n) {
  const def = LEVELS[n - 1];
  const prev = LEVELS[n - 2];
  const pill = btn.querySelector('.lvl-lock');
  if (pill) retrigger(pill, 'refused');
  const why = def.lockText || (prev ? `Clear ${prev.env.meta.name} first` : 'Locked');
  const text = `${def.env.meta.name} is locked. ${why}.`;
  ui.menuLive.textContent = ui.menuLive.textContent === text ? `${text} ` : text;
}

// When the title panel has to scroll, its Set sail! row stays pinned to the panel's foot (style.css). So that it
// never hides what has focus (§13), the row's height plus the panel's bottom padding goes into --menu-pin, which
// the panel's scroll-padding-bottom reads: a card that Tab (or a screen reader) focuses is scrolled to just
// above the row, ring and all. The fade above the row shows only while cards pass beneath it ('pinned'), so it
// never dims a card's focus ring when the row sits in its own place below the cards.
const menuPinRow = ui.menu.querySelector('.menu-actions');
const menuPinPanel = menuPinRow && menuPinRow.closest('.panel');
function menuPin() {
  const row = menuPinRow;
  const panel = menuPinPanel;
  if (!row || !panel || !row.getClientRects().length) return; // (the title is hidden)
  const pad = parseFloat(getComputedStyle(panel).paddingBottom) || 0;
  panel.style.setProperty('--menu-pin', `${Math.ceil(row.offsetHeight + pad)}px`);
  // Pinned: the row is lifted above its place in the flow (just below the cards and their bottom margin).
  const prev = row.previousElementSibling;
  const flowTop = prev ? prev.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(prev).marginBottom) || 0) : -Infinity;
  row.classList.toggle('pinned', row.getBoundingClientRect().top < flowTop - 0.5);
}
if (menuPinPanel) {
  menuPinPanel.addEventListener('scroll', menuPin, { passive: true });
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => menuPin());
    ro.observe(menuPinPanel);
    ro.observe(menuPinRow);
  }
}

function showMenu() {
  if (activeModal() && !state.contextLost) closeModal(modal);
  blurActive();
  saveFeats();
  closeDock();
  clearLevelEntities();
  releaseBattlePeople();
  for (const el of [ui.pause, ui.levelDone, ui.over, ui.won, ui.dock, ui.hud, ui.banner, ui.boss, ui.hint]) show(el, false);
  state.mode = 'menu';
  audio.stopAll();
  audio.setMusicVolume(1); // (from the pause dialog the music was turned down)
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
// Where the dock was opened from: the title, the level-cleared, shipwrecked or victory screen, or 'quit' (the
// pause dialog's Shipyard: the battle was left before its end, see leaveBattle()).
const DOCK_FROM = ['menu', 'levelDone', 'over', 'won', 'quit'];
// Ways out of the dock, by where the player came from; the first one is the main action. A battle left from
// the pause dialog ends like a shipwreck: try the level again, or go back to the title.
const DOCK_EXITS = { levelDone: ['next', 'menu'], over: ['retry', 'menu'], quit: ['retry', 'menu'], menu: ['title'], won: ['title'] };
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

// Big battle events for screen readers (#game-live: new ammo, ammo loaded, captures, boardings...), at most
// one every 1.5 s: a message that comes sooner waits (the newest one wins), a repeat is read again.
const gameLive = { at: -Infinity, pending: '' };
function gameAnnounce(text) {
  const now = performance.now();
  if (now - gameLive.at < 1500) {
    gameLive.pending = text;
    return;
  }
  gameLive.at = now;
  gameLive.pending = '';
  ui.gameLive.textContent = ui.gameLive.textContent === text ? `${text}\u00a0` : text;
}
function flushGameAnnounce() {
  if (gameLive.pending && performance.now() - gameLive.at >= 1500) gameAnnounce(gameLive.pending);
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
  // 'quit' leaves a battle in play (or paused); with no battle there is nothing to leave. Unnamed, a battle
  // in play is left ('quit') and an end screen or the title is where the dock was opened from.
  const inBattle = state.mode === 'playing' || state.mode === 'paused';
  if (from === 'quit' && !inBattle) from = undefined;
  if (!DOCK_FROM.includes(from)) from = inBattle ? 'quit' : DOCK_FROM.includes(state.mode) ? state.mode : 'menu';
  if (from === 'levelDone' && isFinale(state.level)) from = 'won';
  if (activeModal() && !state.contextLost) closeModal(modal);
  blurActive();
  if (from === 'quit') abandonLevel(); // this level's plunder goes, as in a shipwreck
  saveFeats();
  clearLevelEntities();
  releaseBattlePeople();
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
  // The prize ships moored off the town are built here, behind the "Rowing to…" transition, not in the frame the
  // first Go ashore swoops in (sparrow keeps them hidden until the town view; ashore keeps ships of the same kind).
  if (env.setPrizes) env.setPrizes(prizeShips());
  dock.sup = null;
  placeDockShip(buildPlayerMesh());
  restyleCrew(); // the cleaning crew in the uniform from Polly's (the default one leaves them as they are)
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
  // The first visit since the town opened: the Go ashore button pulses once (one-time tip, SPEC2 §5.5).
  ui.dockAshore.classList.remove('pulse');
  if (!(tips & TIP.ashore)) {
    tips |= TIP.ashore;
    saveNumber(TIPS_KEY, tips);
    retrigger(ui.dockAshore, 'pulse');
  }
  return true;
}

// Tidy up the dock scene (the caller loads whatever comes next). Safe to call any time.
function closeDock() {
  if (!dock.open) return;
  townMode.close(); // the captain, the crew line-up and the town's screens and dialogs (before the island goes)
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

// A tavern upgrade (SPEC2 §4), paid from the treasure chest; it counts from the next level start. The
// upgrade's record is saved first and the chest only after it: if storage refuses the record, nothing is
// bought (no gold is ever spent on an upgrade that would be lost). (The tavern panel comes with the town.)
function buyArmory(id) {
  // Another tab may have banked gold or bought at the tavern: start from what is saved (see syncArmory).
  const grapple = armoryCfg.up.grapple;
  const synced = syncSaved();
  const armoryChanged = syncArmory();
  if ((synced || armoryChanged) && state.mode === 'dock') {
    if (synced || armoryCfg.up.grapple !== grapple) rebuildDockShip();
    renderDock();
  }
  const cost = armoryNextCost(armoryCfg, id);
  if (cost === null) return false;
  if (state.purse < cost) return false;
  const next = parseArmoryConfig(armoryCfg);
  next.up[id] += 1;
  if (!saveRecord(ARMORY_KEY, serializeArmoryConfig, next)) return false;
  armoryCfg = parseArmoryConfig(next);
  state.purse -= cost;
  saveChest();
  if (state.mode === 'dock') {
    // Only Long grapples change the ship (their coils on the rail); a full rebuild is a long stall.
    if (id === 'grapple') rebuildDockShip();
    renderDock();
  }
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
    if (part === 'hull') restyleCrew(); // a crew in "Match the ship's paint" follows the hull
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
    if (!b) return;
    leaveDock(b.dataset.exit);
    titleShown(); // (back at the title: see titleClickTooSoon)
  });
}

// The ways out of the dock with their labels: the shipyard's footer, the Harbour menu and All aboard?.
function dockExitList() {
  const next = state.level < LEVELS.length ? LEVELS[state.level].env.meta.name : '';
  const here = LEVELS[state.level - 1].env.meta.name;
  const label = {
    next: `Set sail for ${next}`,
    retry: `Try again: ${here}`,
    menu: 'Main menu',
    title: 'Back to the title',
  };
  return dockExits(dock.from).map((action) => ({ action, label: label[action] }));
}
function renderDockExits() {
  ui.dockExits.innerHTML = '';
  dockExitList().forEach(({ action, label }, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = i === 0 ? 'btn' : 'btn alt';
    b.id = `dock-${action}-btn`;
    b.dataset.exit = action;
    b.textContent = label;
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
  // Ashore the canvas walks (tap), turns the camera (drag) or holds the touch stick: townMode's.
  if (state.mode === 'dock' && townMode.active) {
    townMode.onPointer('down', e);
    return;
  }
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
  if (state.mode === 'dock' && townMode.active) {
    townMode.onPointer('move', e);
    return;
  }
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
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  ui.canvas.addEventListener(type, (e) => {
    if (state.mode === 'dock') townMode.onPointer(type === 'pointerup' ? 'up' : 'cancel', e);
    endDockDrag(e);
  });
}

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
// Ashore on Sparrow's Floating Island (SPEC2 §7): walking round the town, Polly's Plumes & Trims and The
// Salty Sparrow live in townMode.js (screens, dialogs, keys, the camera) and town.js (the captain). The
// saved records stay here: the look (Polly's), the tavern's record (buyArmory) and the chest.
// ---------------------------------------------------------------------------
const hullPaintNow = () => LOOKS.hull.find((l) => l.id === shipConfig.look.hull) || LOOKS.hull[0];
// Dress the cleaning crew on the docked ship in the uniform from Polly's (the default uniform leaves each
// sailor exactly as he was).
function restyleCrew() {
  if (!env || typeof env.setCrewStyle !== 'function') return;
  const paint = hullPaintNow();
  env.setCrewStyle((role, seed, base) => crewOpts(look, seed, base, paint));
}
// A whole new look (Surprise me!, or the feats changed): validated, a trophy not earned comes off, and
// saved. Items bought in another tab meanwhile stay owned.
function setLook(next) {
  syncLook();
  const L = parseLook(next);
  look = sanitizeLook(parseLook({ ...L, own: [...look.own, ...L.own] }), feats);
  saveLook(look);
}
// Wear an item at Polly's (free or owned): saved (if storage refuses, it is worn for this visit).
function wardrobeWear(id) {
  syncLook();
  const r = wearItem(look, feats, id);
  if (!r.ok) return { ok: false, reason: r.reason };
  look = r.look;
  saveLook(look);
  return { ok: true, reason: null };
}
// Buy an item at Polly's: paid from the treasure chest, owned and worn. The look record is saved first and
// the chest only after it: if storage refuses the record, nothing is bought (gold is never spent on an item
// that would be lost; SPEC2 §8, the shipyard's rule).
function wardrobeBuy(id) {
  if (state.mode !== 'dock') return { ok: false, reason: 'closed' };
  if (syncSaved()) {
    // gold banked (or the ship changed) in another tab: show that first
    rebuildDockShip();
    renderDock();
  }
  syncLook(); // items bought in another tab
  const r = buyItem(look, state.purse, id);
  if (!r.ok) return { ok: false, reason: r.reason };
  if (!saveLook(r.look)) return { ok: false, reason: 'storage' };
  look = r.look;
  state.purse -= r.cost;
  saveChest();
  return { ok: true, reason: null };
}
// The tavern's rumour board: the next level after a cleared one, the level to retry after a wreck (or a
// battle left early), else the highest unlocked one. null past the last level.
function nextRumour() {
  const from = dock.from;
  const n = from === 'levelDone' || from === 'won' ? state.level + 1 : from === 'over' || from === 'quit' ? state.level : state.unlocked;
  const def = LEVELS[n - 1];
  if (!def) return null;
  const r = def.rumour || null;
  return { level: n, title: def.env.meta.name, lines: (r && Array.isArray(r.lines) && r.lines) || [], ammo: (r && r.ammo) || null };
}
// Prize ships moored off the town: the two most valuable kinds you have captured, flying your flag.
function prizeShips() {
  const flag = LOOKS.flag.find((l) => l.id === shipConfig.look.flag) || null;
  const won = Object.entries((feats && feats.prizes) || {}).filter(([type, n]) => n > 0 && SHIP_TYPES[type] && type !== 'player');
  won.sort((a, b) => (SHIP_TYPES[b[0]].gold || 0) - (SHIP_TYPES[a[0]].gold || 0) || b[1] - a[1]);
  return won.slice(0, 2).map(([type]) => ({ type, flag }));
}
function hideShipyard() {
  endDockDrag();
  show(ui.dock, false);
}
// Back to the shipyard panel (the town's Shipyard place): the showcase framing is worked out again and
// focus goes to the Upgrades tab.
function showShipyard() {
  show(ui.dock, true);
  dockLayout = null;
  dock.idle = 99; // sway straight away
  renderDock();
  setDockTab('up', false);
  if (!activeModal()) dockTab('up').focus({ preventScroll: true });
}
const townMode = createTownMode({
  scene,
  camera,
  canvas: ui.canvas,
  env: () => env,
  ui: {
    townScreen: ui.townScreen,
    wardrobeScreen: ui.wardrobeScreen,
    tavernScreen: ui.tavernScreen,
    harbourDialog: ui.harbourDialog,
    aboardDialog: ui.aboardDialog,
    dockScreen: ui.dock,
    ashoreBtn: ui.dockAshore,
  },
  look: { get: () => look, set: setLook },
  feats: () => feats,
  wardrobe: { wear: wardrobeWear, buy: wardrobeBuy },
  purse: () => state.purse,
  armory: { config: () => armoryCfg, buy: (id) => buyArmory(id) },
  hullPaint: hullPaintNow,
  exits: dockExitList,
  // (an exit to the title: its double-click must not start a voyage there, see titleClickTooSoon)
  leaveDock: (action) => {
    const ok = leaveDock(action);
    titleShown();
    return ok;
  },
  showShipyard,
  hideShipyard,
  setLens,
  openModal,
  closeModal,
  activeModal,
  announce,
  audio,
  isTouch,
  reducedMotion: () => reducedMotion(),
  rumour: nextRumour,
  log: () => [],
  toggleMute,
  prizes: prizeShips,
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
  // Reload bars: what is left of the reload the side's last shot (or an ammo change) set.
  const rp = player.reloadMax.port || player.type.reload;
  const rs = player.reloadMax.star || player.type.reload;
  setWidth(ui.reloadPort, 'rp', (1 - player.reload.port / rp) * 100, force);
  setWidth(ui.reloadStar, 'rs', (1 - player.reload.star / rs) * 100, force);
  // Gun lights: loaded, and a pirate inside that side's firing arc (for the loaded ammo's range).
  // (Your gun crews are on the ropes during a boarding: no FIRE! light then, SPEC2 §3.4.)
  const live = !player.sinking && state.mode === 'playing' && mayFire(player);
  const range = AMMO[state.ammo].range;
  const portIn = live && enemies.some((e) => inArc(player, e, -1, range));
  const starIn = live && enemies.some((e) => inArc(player, e, 1, range));
  setClass(ui.gunPort, 'gp', 'ready', live && player.reload.port === 0, force);
  setClass(ui.gunStar, 'gs', 'ready', live && player.reload.star === 0, force);
  setClass(ui.gunPort, 'gp', 'target', portIn, force);
  setClass(ui.gunStar, 'gs', 'target', starIn, force);
  // RAKE! instead of FIRE! when that side's target shows you her stern or bow.
  const rakeP = portIn ? rakeCue(-1) : null;
  const rakeS = starIn ? rakeCue(1) : null;
  setClass(ui.gunPort, 'gp', 'rake', !!rakeP, force);
  setClass(ui.gunStar, 'gs', 'rake', !!rakeS, force);
  setText(ui.firePort, 'fireP', rakeP ? 'RAKE!' : 'FIRE!', force);
  setText(ui.fireStar, 'fireS', rakeS ? 'RAKE!' : 'FIRE!', force);
  const rake = (rakeP && player.reload.port === 0 ? rakeP : null) || (rakeS && player.reload.star === 0 ? rakeS : null);
  if (rake && !(tips & TIP.rake)) {
    showTip(
      TIP.rake,
      rake === 'stern'
        ? 'Her stern is open! A shot down her length hits twice as hard'
        : 'Her bow is open! A shot down her length hits half again as hard'
    );
  }

  // Crew aboard (crossed cutlasses): it bumps when it changes (a brawl ticks it down one by one).
  const crewNow = Math.round(boarding.crewShown(player) ?? state.crew);
  const crewKey = `${crewNow}/${state.crewMax}`;
  if (force || shown.crew !== crewKey) {
    show(ui.crewChip, true);
    ui.crewNum.textContent = String(crewNow);
    ui.crewChip.setAttribute('aria-label', `Crew ${crewNow} of ${state.crewMax}`);
    if (!force && shown.crew !== undefined) retrigger(ui.crewChip, 'bump');
    shown.crew = crewKey;
  }

  // The Board cell and button (always there in play: a stable layout; see updateBoardHud()).
  if (force || !shown.boardOn) {
    show(ui.gunBoard, true);
    show(ui.touchBoard, true);
    shown.boardOn = true;
  }
  // The loaded ammo: the gun-card cell (keyboard) and the touch Ammo pill, once chain shot is unlocked.
  const choice = unlockedAmmo().length > 1;
  if (force || shown.ammoOn !== choice) {
    show(ui.gunAmmo, choice);
    show(ui.touchAmmo, choice);
    shown.ammoOn = choice;
  }
  const actOn = !ui.touchAmmo.classList.contains('hidden') || !ui.touchBoard.classList.contains('hidden');
  if (force || shown.actOn !== actOn) {
    show(ui.touchAct, actOn);
    shown.actOn = actOn;
  }
  if (force || shown.ammo !== state.ammo) {
    const name = AMMO_NAMES[state.ammo];
    ui.ammoName.textContent = name;
    ui.gunAmmo.dataset.ammo = state.ammo;
    ui.ammoIcon.innerHTML = AMMO_ICONS[state.ammo];
    ui.touchAmmo.dataset.ammo = state.ammo;
    ui.touchAmmo.innerHTML = `<span class="ammo-ico" aria-hidden="true">${AMMO_ICONS[state.ammo]}</span><span class="ammo-word">${name}</span>`;
    ui.touchAmmo.setAttribute('aria-label', `Ammo: ${name.toLowerCase()} shot. Change ammo`);
    if (shown.ammo !== undefined && shown.ammo !== null && !force) {
      retrigger(ui.gunAmmo, 'bump');
      retrigger(ui.touchAmmo, 'bump');
    }
    shown.ammo = state.ammo;
  }

  updateBoardHud(force, dt);

  const boss = enemies.find((e) => e.type.boss && e.hp > 0 && !e.captured && !e.escaped);
  if (force || shown.boss !== !!boss) {
    show(ui.boss, !!boss);
    shown.boss = !!boss;
  }
  if (boss) {
    // The Phantom Galleon, spectral (or struck): only a boarding takes her (SPEC2 §5.3).
    const boardHer = boss.type.ghost && (boss.spectral || boss.surrendered);
    // The order first, so a narrow bar's ellipsis cuts her name, never the order (portrait phones).
    setText(ui.bossName, 'bossName', boardHer ? `BOARD HER! — ${boss.type.name}` : boss.type.name, force);
    setWidth(ui.bossFill, 'bossHp', (boss.hp / boss.maxHp) * 100, force);
    // The boss's crew: 10 pips with the surrender notch (SPEC2 §5.3).
    const c0 = boss.crew0 || 0;
    show(ui.bossCrew, c0 > 0);
    if (c0 > 0) {
      const pct = String(Math.round((1000 * crewOf(boss)) / c0) / 10);
      if (force || shown.bossCrew !== pct) {
        ui.bossCrew.style.setProperty('--crew', pct);
        shown.bossCrew = pct;
      }
      const notch = `${Math.round((1000 * boss.strikeAt) / c0) / 10}%`;
      if (force || shown.bossNotch !== notch) {
        ui.bossCrew.style.setProperty('--notch', notch);
        shown.bossNotch = notch;
      }
    }
  }
}

// ---- Board (G, the touch Board button): what it does now and the odds (SPEC2 §5.2, §5.3), the boarding
// strip during a set-piece, and the level's objective pill.
const BOARD_SVG = 'viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
const BOARD_INK = 'stroke="#1d1330" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
// Icon + word + colour for every state (never colour alone).
const BOARD_ICONS = {
  // a grapnel: ring, shaft and three curved prongs
  hook:
    `<svg ${BOARD_SVG}><g fill="none" ${BOARD_INK}><circle cx="12" cy="4.2" r="2.2"/><path d="M12 6.4v13.2"/>` +
    '<path d="M4.6 12.4c.4 4.4 3.4 7.2 7.4 7.2s7-2.8 7.4-7.2"/><path d="M4.6 12.4l-1.4 2.2M4.6 12.4l2.4.9M19.4 12.4l1.4 2.2M19.4 12.4l-2.4.9"/></g></svg>',
  // CAPTURE!: a green ring with a tick
  capture:
    `<svg ${BOARD_SVG}><circle cx="12" cy="12" r="9.2" fill="#2fbf8f" ${BOARD_INK}/><path d="M7.4 12.4l3.1 3.1 6-6.4" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  // FIGHT!: crossed cutlasses on gold
  fight:
    `<svg ${BOARD_SVG}><circle cx="12" cy="12" r="9.2" fill="#ffc93c" ${BOARD_INK}/>` +
    `<g fill="none" ${BOARD_INK}><path d="M7 6.5l9.4 10M17 6.5l-9.4 10"/><path d="M14.6 17.8l3.2-3M9.4 17.8l-3.2-3"/></g></svg>`,
  // RISKY!: a red ring with "!"
  risky:
    `<svg ${BOARD_SVG}><circle cx="12" cy="12" r="9.2" fill="#e63946" ${BOARD_INK}/><path d="M12 6.8v6.4" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="12" cy="17" r="1.7" fill="#fff"/></svg>`,
  // TAKE HER!: a white flag
  take:
    `<svg ${BOARD_SVG}><g ${BOARD_INK}><path d="M6 3v18" fill="none"/><path d="M6.6 4.2c3.6-1.6 6.4 1.6 11.6 0v8.4c-5.2 1.6-8-1.6-11.6 0z" fill="#fff"/></g></svg>`,
  // CUT!: an axe
  cut:
    `<svg ${BOARD_SVG}><g ${BOARD_INK}><path d="M15 9L5.2 20.4" fill="none" stroke-width="3"/><path d="M15 9L5.2 20.4" fill="none" stroke="#d9a066" stroke-width="1.2"/>` +
    '<path d="M11.6 6.6c2.2-3.4 6-4.6 9.4-3.8.4 3.6-1 7.2-4.4 9.4z" fill="#e63946"/></g></svg>',
  // HEAVE!: two arrows hauling in
  heave:
    `<svg ${BOARD_SVG}><g fill="none" ${BOARD_INK} stroke-width="2.4"><path d="M4 12h12M11 7l5 5-5 5"/><path d="M19.5 5v14"/></g></svg>`,
  // SKIP: fast forward
  skip: `<svg ${BOARD_SVG}><g fill="#fff4d6" ${BOARD_INK}><path d="M4 6l7.5 6L4 18zM12 6l7.5 6L12 18z"/></g></svg>`,
};
BOARD_ICONS.again = BOARD_ICONS.fight;
BOARD_ICONS.idle = BOARD_ICONS.busy = BOARD_ICONS.cool = BOARD_ICONS.hook;
const BOARD_WORD = { take: 'Take!', capture: 'Take!', fight: 'Fight', risky: 'Risky' };
// "capture likely, about 1 hand lost" (aria-labels).
function oddsWords(o) {
  if (!o) return '';
  if (o.label === 'take') return 'she has struck her colours, no fight';
  const n = o.attLoss;
  const lost = n > 0 ? `about ${hands(n)} lost` : 'no hands lost';
  const what = { capture: 'capture likely', fight: "a fair fight, but she won't strike yet", risky: 'risky' }[o.label] || '';
  return `${what}, ${lost}`;
}
let boardView = null; // this frame's grapple pick (frame() works it out once; the HUD and the tags read it)
// What G / the Board button does right now.
function boardButtonState() {
  if (!player || player.sinking) return { key: 'off', state: 'idle', tag: '—', word: 'Board', aria: 'Board', disabled: true };
  if (boarding.active) {
    const ph = boarding.phase;
    if (ph === 'threat') {
      return { key: 'cut', state: 'cut', tag: 'CUT!', word: 'Cut!', aria: "Cut the boarders' ropes: tap three times or hold", disabled: false };
    }
    if (ph === 'reel' && boarding.kind === 'attack') {
      return { key: 'heave', state: 'heave', tag: 'HEAVE!', word: 'Heave!', aria: 'Heave: haul her in harder', disabled: false };
    }
    if (ph === 'brawl') return { key: 'skip', state: 'skip', tag: 'SKIP', word: 'Skip', aria: 'Skip to the end of the fight', disabled: false };
    return { key: 'busy', state: 'busy', tag: '—', word: 'Board', aria: 'Board: a boarding is under way', disabled: true };
  }
  const ct = boarding.counterTarget;
  if (ct) {
    const o = boardOdds(ct, 'counter');
    // (the icon and colour of the odds, as for any boarding: a green tick, gold cutlasses or a red "!")
    const odds = BOARD_ICONS[o.label] && o.label !== 'take' ? o.label : 'fight';
    return { key: `again${o.label}${o.attLoss}`, state: odds, tag: `AGAIN! −${o.attLoss}`, word: 'Again!', aria: `Counter-board ${theNameLower(ct.type.name)}: ${oddsWords(o)}`, disabled: false };
  }
  const pick = boardView || boardPick();
  if (pick.target) {
    const o = pick.odds;
    const label = pick.label;
    const tag = label === 'take' ? WORDS.take : `${WORDS[label]} −${o.attLoss}`;
    return {
      key: `t${label}${o.attLoss}${pick.target.id}`,
      state: label,
      tag,
      word: BOARD_WORD[label] || 'Board',
      aria: `Board ${theNameLower(pick.target.type.name)}: ${oddsWords(o)}`,
      disabled: false,
    };
  }
  if (state.boardCooldown > 0) {
    const n = Math.ceil(state.boardCooldown);
    return { key: `cool${n}`, state: 'cool', tag: `${n} s`, word: `${n} s`, aria: `Board: hooks coiling, ${n} ${n === 1 ? 'second' : 'seconds'}`, disabled: true };
  }
  const why = GRAPPLE_WHY[pick.reason] || GRAPPLE_WHY.none;
  return { key: `idle${pick.reason}`, state: 'idle', tag: '—', word: 'Board', aria: `Board: ${why.replace(/[!…]+$/, '').toLowerCase()}`, disabled: true };
}

// The boarding strip (top centre, during a set-piece): the phase, "⚔ 12 vs 9 ☠", the tug-of-war of the two
// sides' strength and the heave (or rope-cutting) pips.
const strip = (() => {
  const el = ui.boardingStrip;
  el.innerHTML =
    '<div class="bs-title"></div>' +
    '<div class="bs-row"><span class="bs-side bs-us"><svg class="bs-ico" viewBox="0 0 24 24"><path d="M5 4l12 13M19 4L7 17M4.5 16.5l3 3M19.5 16.5l-3 3"/></svg><b></b></span>' +
    '<span class="bs-tug"><span class="bs-tug-fill"></span></span>' +
    '<span class="bs-side bs-them"><b></b><svg class="bs-ico" viewBox="0 0 24 24"><path d="M12 3.5c-4.4 0-7.5 3-7.5 7 0 2.4 1.2 4.2 3 5.2V19h9v-3.3c1.8-1 3-2.8 3-5.2 0-4-3.1-7-7.5-7z"/><circle cx="9.2" cy="11" r="1.7"/><circle cx="14.8" cy="11" r="1.7"/></svg></span></div>' +
    '<div class="bs-pips"><i></i><i></i><i></i><i></i><i></i></div>';
  const q = (sel) => el.querySelector(sel) || document.createElement('span');
  return { el, title: q('.bs-title'), us: q('.bs-us b'), them: q('.bs-them b'), fill: q('.bs-tug-fill'), pips: q('.bs-pips'), pip: [...el.querySelectorAll('.bs-pips i')] };
})();
function stripTitle() {
  const ph = boarding.phase;
  const kind = boarding.kind;
  if (ph === 'hook') return kind === 'surrender' ? 'Take her!' : 'Grapple!';
  if (ph === 'threat') return 'Cut the ropes!';
  if (ph === 'reel') return kind === 'defend' ? 'Repel boarders!' : kind === 'surrender' ? 'Take her!' : 'Heave!';
  if (ph === 'swing') return kind === 'defend' ? 'Repel boarders!' : 'Charge!';
  if (ph === 'brawl') return 'Fight!';
  const L = boarding.last || {};
  if (L.captured) return kind === 'defend' ? 'Raider taken!' : 'Captured!';
  if (L.overrun) return 'Overrun!';
  if (L.held) return 'Repelled!';
  return 'Driven back!';
}
function updateBoardHud(force, dt) {
  const b = boardButtonState();
  if (force || shown.board !== b.key) {
    shown.board = b.key;
    const icon = BOARD_ICONS[b.state] || BOARD_ICONS.hook;
    ui.boardTag.innerHTML = `<span class="board-ico">${icon}</span><span class="board-word"></span>`;
    ui.boardTag.querySelector('.board-word').textContent = b.tag;
    ui.boardTag.dataset.state = b.state;
    ui.gunBoard.dataset.state = b.state;
    ui.touchBoard.innerHTML = `<span class="board-ico" aria-hidden="true">${icon}</span><span class="board-word"></span>`;
    ui.touchBoard.querySelector('.board-word').textContent = b.word;
    ui.touchBoard.dataset.state = b.state;
    ui.touchBoard.setAttribute('aria-label', b.aria);
    ui.touchBoard.setAttribute('aria-disabled', String(!!b.disabled));
    if (!force && /^t|^again|^cut/.test(b.key)) {
      retrigger(ui.touchBoard, 'bump');
      retrigger(ui.gunBoard, 'bump');
    }
  }
  // First boardable ship in reach: a one-time tip.
  if (boardView && boardView.target && state.intro <= 0 && !(tips & TIP.board)) {
    showTip(TIP.board, 'Close enough to board! Press <kbd>G</kbd>', `Close enough to board! Tap <b>${BOARD_WORD[boardView.label] || 'Board'}</b>`);
  }

  // The boarding strip (not in 'result': the outcome pops over the decks then).
  const on = boarding.active && boarding.phase !== 'result';
  if (force || shown.strip !== on) {
    show(strip.el, on);
    shown.strip = on;
  }
  if (on) {
    const e = boarding.target;
    setText(strip.title, 'bsTitle', stripTitle(), force);
    const us = Math.max(0, Math.round(boarding.crewShown(player) ?? state.crew));
    const them = e ? Math.max(0, Math.round(boarding.crewShown(e) ?? crewOf(e))) : 0;
    setText(strip.us, 'bsUs', String(us), force);
    setText(strip.them, 'bsThem', String(them), force);
    // the two sides' strength: your share of P×M against D (with the heaves so far)
    let share = 0.5;
    const L = boarding.last;
    const r = L && L.result ? L.result : e ? boarding.odds(boardingSides(e, boarding.kind === 'defend' ? 'defend' : 'attack'), { kind: boarding.kind, heave: boarding.heaveBonus, surrendered: boarding.kind === 'surrender' }) : null;
    if (r) {
      const R = Number.isFinite(r.R) ? Math.max(0, r.R) : 99;
      share = boarding.kind === 'defend' ? 1 / (1 + R) : R / (1 + R);
    }
    setWidth(strip.fill, 'bsFill', clamp(share, 0.04, 0.96) * 100, force);
    // pips: heaves during your reel (5 max), rope cuts while the raiders' hooks bite (3)
    const ph = boarding.phase;
    let mode = '';
    let filled = 0;
    if (ph === 'reel' && boarding.kind === 'attack') {
      mode = 'heave';
      filled = Math.min(5, boarding.heaves);
    } else if (ph === 'threat') {
      mode = 'cut';
      filled = Math.min(3, Math.floor(boarding.cutProgress * 3 + 1e-6));
    }
    const pipKey = `${mode}${filled}`;
    if (force || shown.bsPips !== pipKey) {
      shown.bsPips = pipKey;
      strip.pips.className = `bs-pips${mode ? ` ${mode}` : ''}`;
      strip.pip.forEach((p, i) => {
        p.className = i < filled ? 'on' : '';
        p.style.display = mode === 'cut' && i >= 3 ? 'none' : '';
      });
    }
  }

  // The level's goal (Act II), at most 4 times a second.
  shown.objT = (shown.objT ?? 1) + dt;
  if (force || shown.objT >= 0.25) {
    shown.objT = 0;
    const text = String(mechanics.objective() || '');
    if (force || shown.objective !== text) {
      ui.objective.textContent = text;
      show(ui.objective, !!text);
      shown.objective = text;
    }
  }
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
  // The level's own marks first (SPEC2 §9.2): the maelstrom's rings and eye, ice floes, escape gates.
  const marks = mechanics.minimap() || [];
  for (const m of marks) {
    const [x, y] = toMap(m.x, m.z);
    const r = Math.max(2, (m.r || 0) * scale);
    mm.beginPath();
    if (m.kind === 'vortex') {
      mm.strokeStyle = 'rgba(216, 242, 255, 0.55)';
      mm.lineWidth = 1.5;
      for (const f of [1, 0.72, 0.46]) {
        mm.beginPath();
        mm.arc(x, y, r * f, 0, Math.PI * 2);
        mm.stroke();
      }
    } else if (m.kind === 'eye') {
      mm.fillStyle = '#123050';
      mm.arc(x, y, Math.max(3, r), 0, Math.PI * 2);
      mm.fill();
    }
  }
  for (const r of reefs) {
    const [x, y] = toMap(r.x, r.z);
    mm.fillStyle = r.ice ? '#e8f7ff' : '#7fe0d6'; // ice floes pale, reefs and sandbars teal
    mm.beginPath();
    mm.arc(x, y, Math.max(2, r.r * scale), 0, Math.PI * 2);
    mm.fill();
  }
  for (const m of marks) {
    if (m.kind !== 'gate') continue;
    // An escape gate: a green ring (a treasure galleon is running for it).
    const [x, y] = toMap(m.x, m.z);
    mm.strokeStyle = '#1d1330';
    mm.lineWidth = 4;
    mm.beginPath();
    mm.arc(x, y, Math.max(4, (m.r || 10) * scale), 0, Math.PI * 2);
    mm.stroke();
    mm.strokeStyle = '#3ee08f';
    mm.lineWidth = 2;
    mm.stroke();
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
  mm.lineWidth = 2;
  for (const b of bombs) {
    const [x, y] = toMap(b.tx, b.tz);
    mm.strokeStyle = b.kind === 'lightning' ? '#e8f6ff' : '#ff3b1f';
    mm.beginPath();
    mm.arc(x, y, Math.max(3, (b.radius ?? BOMB_RADIUS) * scale), 0, Math.PI * 2);
    mm.stroke();
  }
  mm.fillStyle = '#ffc93c';
  for (const co of coins) {
    const [x, y] = toMap(co.x, co.z);
    mm.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  for (const e of enemies) {
    // Ships still fighting (red, the boss orange) and struck ones (white: board them to take them).
    const struck = e.surrendered && e.hp > 0 && !e.captured && !e.escaped && !e.sinking;
    if (!fighting(e) && !struck) continue;
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
    const fill = struck ? '#ffffff' : e.type.merchant ? '#ffc93c' : e.type.boss ? '#ff9f1c' : '#e63946';
    mm.fillStyle = '#1d1330';
    mm.beginPath();
    if (e.type.merchant) mm.rect(x - r - 1.5, y - r - 1.5, 2 * r + 3, 2 * r + 3); // treasure galleons: gold squares
    else mm.arc(x, y, r + 1.5, 0, Math.PI * 2);
    mm.fill();
    mm.fillStyle = fill;
    mm.beginPath();
    if (e.type.merchant) mm.rect(x - r, y - r, 2 * r, 2 * r);
    else mm.arc(x, y, r, 0, Math.PI * 2);
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
  // Visible damage (SPEC2 §2.4): battered below 60 % (slack sails, a slight list), wrecked below 30 %
  // (deck fire, a drooping sail, a heavier list, sitting lower). She lists toward the side with more hits.
  const frac = s.hp / s.maxHp;
  const level = s.sinking ? s.mesh.userData.damageLevel ?? 0 : frac < STATES.wrecked ? 2 : frac < STATES.battered ? 1 : 0;
  setShipDamage(s.mesh, { level }); // nothing to do when it hasn't changed
  const lean = level === 2 ? LIST_WRECKED : level === 1 ? LIST_BATTERED : 0;
  const listTo = lean * (s.hitsBySide.star >= s.hitsBySide.port ? 1 : -1);
  s.list += (listTo - s.list) * 0.05;
  const low = (level === 2 ? WRECK_SIT : 0) + (s.rise > 0 ? 2 * s.rise : 0); // a Phantom rising: 6 u down at rise 3
  s.mesh.position.set(s.x, wy - sink * 1.5 - low, s.z);
  s.mesh.rotation.set(0, 0, 0);
  s.mesh.rotation.y = s.h;
  s.mesh.rotateX(Math.atan2(behind - ahead, half * 2) * 0.8 + sink * 0.1);
  s.mesh.rotateZ(Math.atan2(port - star, side * 2) * 0.6 + s.roll + sink * 0.28 + s.list);
  animateShip(s.mesh, t, s.sinking ? 0 : s.speed / s.type.maxSpeed);
  // The spectral Phantom (SPEC2 §6.6): her ghost-green lights blaze and throb.
  if (s.spectral && s.mesh.userData.glows) {
    const k = 1.9 + 0.5 * Math.sin(t * 4.2);
    for (const g of s.mesh.userData.glows) g.material.emissiveIntensity *= k;
  }
}

// What each enemy's tag shows this frame (tags.js draws it): crew pips (a brawl ticks them down one by one)
// and the surrender notch, the hull bar throbbing on a wreck, and an icon: a white flag when struck, the
// odds on the ship G would board (green tick / gold cutlasses / red "!"), the hook recharging after a boarding.
function updateTagState(e) {
  e.crewShown = boarding.crewShown(e) ?? crewOf(e);
  e.strikeAt = combat.strikeAt(e.crew0);
  e.tagPulse = e.hp > 0 && e.hp / e.maxHp < STATES.wrecked;
  let icon = e.surrendered ? 'white' : null;
  const v = boardView;
  if (!icon && !boarding.active) {
    if (boarding.counterTarget === e) icon = boardOdds(e, 'counter').label;
    else if (v && v.target === e && v.label !== 'take') icon = v.label;
    else if (v && !v.target && v.reason === 'cooldown' && v.near === e) {
      icon = 'cooldown';
      e.tagCool = clamp(state.boardCooldown / BOARD.cooldown, 0, 1);
    }
  }
  e.tagIcon = icon;
}

// The captain at the helm steers with your turn input, points "Fire!" after a broadside and cheers a sinking.
function animateHelm(t, dt) {
  const c = player && player.captain;
  if (!c || !c.visible) return;
  const want = player.sinking ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
  helm.turn = (helm.turn ?? 0) + (want - (helm.turn ?? 0)) * Math.min(1, dt * 7);
  if (t < helm.cheer) animatePerson(c, t, 'cheer');
  else if (t < helm.point) animatePerson(c, t, 'point');
  else animatePerson(c, t, 'steer', { turn: helm.turn });
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
    // A boarding takes the camera to a raised view over the two decks (boarding.js eases it in and out).
    const bc = boarding.camera(camera.aspect, { pos: camera.position, look: camLook });
    if (bc) {
      camera.position.lerp(bc.pos, bc.blend);
      camLook.lerp(bc.look, bc.blend);
    }
    // No shake while the decks are glued, nor ever under reduced motion (SPEC2 §13: the hull flash and the edge
    // vignette carry the hit).
    if (state.shake > 0 && !paused && (boarding.locked || reducedMotion())) state.shake = 0;
    if (state.shake > 0 && !paused) {
      state.shake = Math.max(0, state.shake - dt);
      camera.position.x += (Math.random() - 0.5) * state.shake;
      camera.position.y += (Math.random() - 0.5) * state.shake;
    }
    camera.lookAt(camLook);
  } else if (state.mode === 'dock' && dock.ship) {
    // Ashore townMode drives the camera (walking, Polly's mirror, the tavern porch); else the showcase sway.
    if (!townMode.update(dt, visualTime)) updateDockCamera(dt);
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
  let dt = Math.min(rawDt, MAX_FRAME_DT);
  audio.update(dt);
  const paused = state.mode === 'paused';
  // Hit-stop: a crit slows the whole frame to a crawl for a moment (real time).
  if (state.hitStop.left > 0 && !paused) {
    state.hitStop.left -= rawDt;
    dt *= CRIT.hitStop.scale;
  }
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
  // The ship G would board now (tags, the Board cell and button read it).
  if (!paused) boardView = state.mode === 'playing' && player && !player.sinking ? boardPick() : null;
  for (const e of enemies) {
    if (!paused) e.flash = Math.max(0, e.flash - dt);
    syncShip(e, t);
    updateTagState(e);
  }
  animateHelm(t, paused ? 0 : dt);
  // The boarding's visuals (grapnels, ropes, swings, the brawl): after every ship is placed, before the camera.
  boarding.render(t, paused ? 0 : dt);
  for (const b of balls) b.mesh.position.set(b.x, b.y, b.z);
  for (const c of coins) {
    c.mesh.position.set(c.x, ocean.heightAt(c.x, c.z, t) + 0.8, c.z);
    c.mesh.rotation.set(Math.PI / 2, 0, t * 3 + c.spin);
  }
  for (const b of bombs) {
    const u = Math.min(1, b.t / b.T);
    const p = bombPos(b, u);
    if (b.mesh) {
      b.mesh.position.set(p.x, p.y, p.z);
      b.mesh.rotation.set(t * 3, t * 2, 0);
    }
    b.zone.position.set(b.tx, ocean.heightAt(b.tx, b.tz, t) + 0.25, b.tz);
    b.zone.userData.disc.scale.setScalar(Math.max(0.05, u));
  }
  for (const M of Object.values(ZONE_MATS)) {
    M.ring.opacity = 0.65 + 0.25 * Math.sin(t * 12);
    M.disc.opacity = 0.25 + 0.1 * Math.sin(t * 12);
  }

  updateCamera(dt, paused);
  camera.updateMatrixWorld();
  // After the ships and the camera have moved: name tags, sailors going overboard, pop words.
  tags.update(enemies, camera, t, paused ? 0 : dt);
  overboard.update(t, paused ? 0 : dt);
  pops.update(paused ? 0 : dt);
  flushGameAnnounce();

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
// The battle's live region is visually hidden (sr-only) but must not be display:none, or nothing is read.
show(ui.gameLive, true);
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
  // Leave the battle in play for 'dock' (the shipyard, opened at once) or 'menu' (the title), as the pause
  // dialog's Shipyard / Main menu and Leave do: this level's plunder is dropped as in a shipwreck.
  leaveBattle: (to) => leaveBattle(to, true),
  // The pause dialog's step: 'choose' (Resume, Shipyard, Main menu), 'confirm' ("Leave the battle?") or
  // 'leaving', and where to ('dock' | 'menu').
  get pauseStep() {
    return { step: pauseUi.step, to: pauseUi.to };
  },
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
  // ---- "Boarders Away!" test API (SPEC2 §9.3).
  combat: {
    rules: combat, // the combat.js module (tables and formulas)
    get ammo() {
      return state.ammo;
    },
    // Load an ammo now (false, with the reason in the hint bubble, when it is still locked).
    setAmmo: (id) => setAmmo(id),
    cycleAmmo: () => cycleAmmo(),
    get unlockedAmmo() {
      return unlockedAmmo();
    },
    // Reseed the crit dice (each level start reseeds them with level × 7919 + 13).
    seed(n) {
      combatRng = mulberry32(Number(n) || 0);
    },
    // Every player shot from now on: null (roll the dice) | 'none' | 'crit' | 'rudder' | 'mast' | 'keg' | 'routed'.
    forceCrit(kind = null) {
      forcedCrit = ['none', 'crit', 'rudder', 'mast', 'keg', 'routed'].includes(kind) ? kind : null;
      return forcedCrit;
    },
    // The last 40 hits: what combat.js made of each ball (see logShot()).
    get log() {
      return shotLog.map((r) => ({ ...r, tags: [...r.tags] }));
    },
    clearLog() {
      shotLog.length = 0;
    },
    // Set a ship's crew: an enemy's killed count so that crewNow is n (at most what her hull leaves her),
    // or your own hands (ship = the player or 'player'; 1..crewMax). Returns the crew now.
    setCrew(ship, n) {
      const k = Math.max(0, Math.floor(Number(n) || 0));
      if (ship === 'player' || ship === player) {
        state.crew = clamp(k, 1, state.crewMax);
        return state.crew;
      }
      if (!ship || ship.kind !== 'enemy') return null;
      ship.killed = 0;
      ship.killed = Math.max(0, crewOf(ship) - k);
      checkSurrender(ship);
      return crewOf(ship);
    },
    crewOf: (ship) => (ship && ship.kind === 'enemy' ? crewOf(ship) : state.crew),
    // A ship's effects (seconds left) and the multipliers they put on her speed cap and turning.
    effects: (ship) => (ship ? { ...ship.effects, burnTicks: ship.burnTicks, speedMul: speedMul(ship), turnMul: turnMul(ship), speedCap: speedCap(ship) } : null),
    rakeCue: (side) => rakeCue(side),
    get hitStop() {
      return { ...state.hitStop };
    },
  },
  // Tags (tags.js): what a ship's tag shows, with the crew pips read back from the pip InstancedMesh.
  tagInfo: (ship) => tags.read(ship),
  get pops() {
    return { count: pops.count };
  },
  get overboard() {
    return { active: overboard.active, surrendering: overboard.surrendering };
  },
  tip: (bit) => !!(tips & bit),
  // Boarding (SPEC2 §9.3). grapple(): throw the hooks at the best ship in reach, or say why not.
  grapple: () => grapple(),
  // Why G can't board this ship now (null: it can): 'busy' | 'none' | 'immune' | 'range' | 'cooldown' | 'crew'.
  canGrapple: (e) => canGrapple(e),
  boardPress: () => boardPress(),
  boarding: {
    get active() {
      return boarding.active;
    },
    get phase() {
      return boarding.phase;
    },
    get kind() {
      return boarding.kind;
    },
    get target() {
      return boarding.target;
    },
    get truce() {
      return boarding.truce;
    },
    get locked() {
      return boarding.locked;
    },
    get heave() {
      return boarding.heaveBonus;
    },
    get heaves() {
      return boarding.heaves;
    },
    get last() {
      return boarding.last;
    },
    get cooldown() {
      return state.boardCooldown;
    },
    get counterTarget() {
      return boarding.counterTarget;
    },
    get counterLeft() {
      return boarding.counterLeft;
    },
    get cutProgress() {
      return boarding.cutProgress;
    },
    // The ship G would board now and its odds ({ target, odds, label, reason, near }).
    pick: () => boardPick(),
    // The preview for boarding this ship now: resolveBoarding's numbers + label (no heave); kind defaults
    // to what G would do ('surrender' for a struck ship), or pass 'defend' for a raider boarding you.
    odds: (e, kind) => {
      if (!e || !player) return null;
      const k = kind || (e.surrendered ? 'surrender' : 'attack');
      return k === 'defend' ? boarding.odds(boardingSides(e, 'defend'), { kind: 'defend' }) : boardOdds(e, k);
    },
    // A raider boards you now (tests): starts the 'defend' set-piece if a boarding can start.
    raid: (e) => (e && player ? boarding.start({ kind: 'defend', enemy: e, getSides: () => boardingSides(e, 'defend') }) : false),
    heavePress: () => boarding.heave(),
    cut: (how) => boarding.cut(how),
    cutHold: (down) => boarding.cutHold(!!down),
    skip: () => boarding.skip(),
    cancel: (reason) => boarding.cancel(reason),
    resolveNow: () => boarding.resolveNow(),
    get figures() {
      return boarding.figures;
    },
    module: boarding,
  },
  // Captures and surrenders (tests): strike her colours now, capture her now (gold and all), let her escape.
  capture: {
    strike(e) {
      if (!e || e.kind !== 'enemy') return false;
      e.killed = 0;
      e.killed = Math.max(0, crewOf(e) - e.strikeAt);
      return checkSurrender(e);
    },
    take: (e) => captureShip(e, 'auto'),
    escape: (e) => escapeShip(e),
    get count() {
      return state.captures;
    },
    get plundered() {
      return state.plundered;
    },
  },
  get crew() {
    return { crew: state.crew, max: state.crewMax };
  },
  // Put an enemy of any type on the sea (tests): it joins the fight like a wave's ship.
  spawn(typeName, x, z, h) {
    if (!SHIP_TYPES[typeName] || typeName === 'player' || !player) return null;
    const px = Number.isFinite(x) ? x : player.x + 30;
    const pz = Number.isFinite(z) ? z : player.z;
    const e = createShip(typeName, 'enemy', px, pz, Number.isFinite(h) ? h : Math.atan2(player.x - px, player.z - pz));
    enemies.push(e);
    mechanics.onSpawn(e, -1); // a galleon gets its gate, a Phantom rises (where the test put her)
    return e;
  },
  mechanics: {
    get state() {
      return mechanics.state;
    },
    get objective() {
      return mechanics.objective();
    },
    minimap: () => mechanics.minimap(),
    summary: () => mechanics.summary(),
    bonus: () => mechanics.bonus(),
  },
  armory: {
    get config() {
      return parseArmoryConfig(armoryCfg); // a copy
    },
    // Validated and saved; the crew and the crit chance change at the next level start.
    set(cfg) {
      const grapple = armoryCfg.up.grapple;
      armoryCfg = parseArmoryConfig(cfg);
      saveRecord(ARMORY_KEY, serializeArmoryConfig, armoryCfg);
      if (state.mode === 'dock' && armoryCfg.up.grapple !== grapple) rebuildDockShip(); // (only grapples show)
      townMode.refresh();
      return parseArmoryConfig(armoryCfg);
    },
    buy(id) {
      const ok = buyArmory(id);
      townMode.refresh();
      return ok;
    },
    get stats() {
      return armoryStats(armoryCfg);
    },
  },
  get feats() {
    return parseFeats(feats); // a copy
  },
  // Validated and saved; a worn trophy the new feats have not earned goes back to its default.
  setFeats(f) {
    feats = parseFeats(f);
    // (these feats replace the saved ones, whatever another tab saved: no merging here)
    featsDirty = !saveRecord(FEATS_KEY, serializeFeats, feats);
    if (!featsDirty) featsSaved = parseFeats(feats);
    const clean = sanitizeLook(look, feats);
    if (serializeLook(clean) !== serializeLook(look)) {
      look = clean;
      saveLook(look);
      if (state.mode === 'dock') restyleCrew();
    }
    townMode.refresh(); // (Polly's trophies, the captain's log)
    return parseFeats(feats);
  },
  get look() {
    return parseLook(look); // a copy
  },
  get tips() {
    return tips;
  },
  // The captain at the helm of the Sea Biscuit (people.js person) and what he is doing.
  get helm() {
    const c = player && player.captain;
    return c ? { person: c, visible: c.visible, look: c.userData.look, point: helm.point, cheer: helm.cheer } : null;
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
  // Polly's (SPEC2 §7.7): wear(id) a free or owned item, buy(id) a priced one from the treasure chest (in the
  // dock); both save the look ({ ok, reason }). The open wardrobe and the captain follow.
  wardrobe: {
    wear(id) {
      const r = wardrobeWear(id);
      if (r.ok && state.mode === 'dock') restyleCrew();
      townMode.refresh();
      return r;
    },
    buy(id) {
      const r = wardrobeBuy(id);
      if (r.ok && state.mode === 'dock') restyleCrew();
      townMode.refresh();
      return r;
    },
  },
  // Ashore (SPEC2 §7, townMode.js): the view, the captain and his walk, and the places.
  town: {
    get active() {
      return state.mode === 'dock' && townMode.active;
    },
    get view() {
      return state.mode === 'dock' ? townMode.view : null;
    },
    get pos() {
      return townMode.api.pos;
    },
    get place() {
      return townMode.api.place;
    },
    get walk() {
      return townMode.api.walk;
    },
    get captain() {
      return townMode.api.captain;
    },
    setMove: (x, z, run) => townMode.api.setMove(x, z, run),
    walkTo: (x, z) => townMode.api.walkTo(x, z),
    goTo: (id) => townMode.api.goTo(id),
    interact: () => townMode.api.interact(),
    open: (id) => state.mode === 'dock' && townMode.api.open(id),
    back: () => state.mode === 'dock' && townMode.api.back(),
    simulate: (seconds, input) => townMode.api.simulate(seconds, input),
    // townMode's own test hooks (the wardrobe's tabs and Buy, the tavern, the line-up, the Harbour menu).
    get api() {
      return townMode.api;
    },
  },
  // The shipyard: open('menu' | 'levelDone' | 'over' | 'won' | 'quit'), at once (the buttons wait two frames);
  // 'quit' leaves the battle in play as the pause dialog's Shipyard does (this level's plunder is dropped as
  // in a shipwreck; ways out: 'retry', 'menu'). leave(['next' | 'retry' | 'menu' | 'title']; default: the main
  // way out for where it was opened from), buy(upgrade id), paint(part, look id).
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
    // Which dock view is showing: 'shop' (the shipyard) | 'town' | 'tailor' | 'tavern'.
    get view() {
      return state.mode === 'dock' ? townMode.view : null;
    },
    // Go ashore from the shipyard (as its Go ashore button does); back(): from a panel to the town, or from the
    // shipyard back to the town.
    ashore: () => state.mode === 'dock' && townMode.ashore(),
    back: () => state.mode === 'dock' && townMode.back(),
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
