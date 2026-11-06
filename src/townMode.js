// The dock's other views (SPEC2 §7): walking round Sparrow's Floating Island ('town'), Polly's Plumes &
// Trims ('tailor') and The Salty Sparrow ('tavern'), plus the Harbour menu and the All aboard? dialog. With the
// Kraken Seas (ctx.withKraken, SPEC3 §7, §8): Professor Barnacle's Riddle Bell ('quiz', quizPanel.js), Builder
// Bess ('build', the place 'builder', buildPanel.js), the tavern's Powder room and the villagers' greetings.
// DOM and glue live here (styles in town.css); the 3D captain and camera are town.js's; persistence
// stays in main.js (ctx.look.set, ctx.wardrobe.wear/buy, ctx.armory.buy save). The shipyard panel
// itself ('shop') stays main.js's: townMode only swaps it out and back (ctx.hideShipyard/showShipyard).
//
// createTownMode(ctx) → {
//   get view ('shop' | 'town' | 'tailor' | 'tavern' | 'quiz' | 'build'), get active (view !== 'shop'),
//   ashore(), showShop(), open(placeId), back(), close(), refresh(),
//   onKey(e, down) → handled, onPointer(type, e) → handled,
//   update(dt, t) → handlesCamera, onResize(), onContextRestored(),
//   api   // test hooks used by __game.town / __game.wardrobe
// }
// ctx: { scene, camera, canvas, env: () => env, ui: { townScreen, wardrobeScreen, tavernScreen,
//   harbourDialog, aboardDialog, dockScreen, ashoreBtn }, look: { get(), set(look) }, feats: () => feats,
//   wardrobe: { wear(id) → { ok, reason }, buy(id) → { ok, reason } }, purse: () => gold,
//   armory: { config(), buy(id) → bool | { ok, reason } }, hullPaint: () => LOOKS.hull entry,
//   exits: () => [{ action, label }], leaveDock(action), showShipyard(), hideShipyard(), setLens(),
//   openModal(el), closeModal(el), activeModal(), announce(text), audio, isTouch(), reducedMotion(),
//   rumour() → { title, lines, ammo } | null, log() → [string] (extra captain's-log lines),
//   optional: toggleMute(), prizes() → [{ type, flag }], restyleCrew() (dress the cleaning crew on the
//   docked ship in the saved uniform; townMode's own env.setCrewStyle call otherwise) }
// The Kraken Seas (SPEC3 §11.1; read once, at creation): withKraken (boolean, or a function giving one: the
//   places quiz and builder, the Powder room, the Harbour buttons and the four trophies show only when true;
//   without it the town is exactly today's), unlocked() → the highest level reached (1..9),
//   powder: { state() → the powder record, buy(id) → { ok, reason?, rebuilt? } | bool } (main writes the
//     record first and the chest second; reasons 'storage' | 'owned' | 'locked' | 'poor' | 'unknown'),
//   island: { state() → the island record, build(id) → { ok, reason?, cost? } | bool } (the same rule; main
//     doesn't touch the 3D town: townMode's montage does env.setIsland(cfg, { built }) / setRank / setVillagers),
//   quiz: { record(), save(rec, gold, info) → { ok, reason? } | bool } (quizPanel.js's contract),
//   optional: hints() → lifebuoys a quiz round, rebuildShip() (the docked ship again, with a new recipe's keg)
// The Sunset Isles (SPEC4 §5.2, §6.7, §7.4, §8.5, §8.7; read once, at creation; every member optional, and without
// withV4 the town is exactly today's): withV4 (boolean, or a function giving one), setClipping(on) (main: the
//   renderer's local clipping, on in every town view while the construction scene can show, off in the shipyard),
//   island4: { state() → the island4 record, build(id) → { ok, reason?, cost? } } (main writes pirates-ahoy-island4
//     first, then the chest; without it the build panel and the plot boards stay today's ten plots),
//   islanders: { roster() → islanders.roster(island, island4, progress, islandPlan), progress() → { unlocked,
//     captures, kraken, shell } } (the chats' lines and the panel's sale rules; after a build or a Watch again's end
//     townMode hands the new roster to env.setIslanders),
//   guide: { cards() → guide.js guideFor(...)'s cards } (optional: townMode works them out from voyage4 otherwise),
//   voyage4: { state() → the voyage4 record (its `met` and `tips`), tip(bit) → boolean (main marks a one-time tip's
//     bit and saves the record; §8.4's bits 32 talk, 64 the map's "New!", 128 build here) }.
// Views added with the Sunset Isles: 'map' (the Island map, islandMap.js) and 'lookout' (the crow's nest); open('builder',
// { plot }) opens Bess's panel at a plot's row (a plot board, §8.5).
import { createTown } from './town.js';
import { ITEMS, SLOTS, SLOT_NAMES, KRAKEN_ITEMS, V4_ITEMS, itemState, surprise, captainOpts, crewOpts } from './cosmetics.js';
import { ARMORY, armoryMaxTier, armoryNextCost, armoryStatText, parseArmoryConfig } from './armory.js';
import { SPECIAL_IDS, SPECIAL, RECIPES, LOADS, WORDS3, onSale, buyRecipe, parsePowder } from './specials.js';
import { parseIsland, tierOf, perks, rank as islandRank, villagers as islandVillagers, PLOTS, PLOTS4, parseIsland4, perks4, rank4 } from './island.js';
import { createQuizPanel } from './quizPanel.js';
import { createBuildPanel } from './buildPanel.js';
import { createIslandMap } from './islandMap.js';
import * as islandPlan from './islandPlan.js';
import { linesFor, TALK, ISLANDERS } from './islanders.js';
import { guideFor, NOT_MET } from './guide.js';
import { sceneLength, cameraAt } from './buildScene.js';
import { WORDS4 } from './mechanics4.js';
import { parseVoyage4 } from './pools.js';

// The places (the same ids as sparrow's walk.places and the places bar's data-place buttons). The place
// 'builder' opens the view 'build' (SPEC3 §8.3); every other view is named as its place.
const PLACES_TODAY = ['shipyard', 'tailor', 'tavern', 'ship'];
const PLACES_KRAKEN = ['shipyard', 'tailor', 'tavern', 'quiz', 'builder', 'ship'];
const VIEW_OF = { builder: 'build' };
const PLACE_OF = { build: 'builder' };
const PANEL_VIEWS = ['tailor', 'tavern', 'quiz', 'build'];
const INK = 'stroke="#1d1330" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';
const ICONS = {
  shipyard:
    `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><path d="M5 25.5l11.5-11.5" stroke-width="4.6"/><path d="M5 25.5l11.5-11.5" stroke="#c07b3a" stroke-width="2.2"/>` +
    '<path d="M13.4 8.6l5.2-5.2 9.9 9.9-5.2 5.2z" fill="#93a4b8"/><path d="M18.6 3.4l2.4 2.4" fill="none"/></g>' +
    '<path d="M15.6 7.3l4-4" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".8"/></svg>',
  tailor:
    `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><path d="M3.5 19.5c3-1.6 7.6-2.5 12.5-2.5s9.5.9 12.5 2.5c-1.5 3.4-6.6 5.5-12.5 5.5S5 22.9 3.5 19.5z" fill="#2b2433"/>` +
    '<path d="M8 18.4c.5-5.2 3.6-8.4 8-8.4s7.5 3.2 8 8.4" fill="#2b2433"/><path d="M5.5 20.6c3 1.4 6.5 2 10.5 2s7.5-.6 10.5-2" fill="none" stroke="#ffc93c" stroke-width="1.6"/>' +
    '<path d="M17 11.2c2.6-6 8.8-8.4 12.2-6.6-1.3 3.5-5.8 6.6-12.2 6.6z" fill="#e2383d"/><path d="M18.5 10c3-2 6.2-3.6 9-4.4" fill="none" stroke-width="1.2"/></g></svg>',
  tavern:
    `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><path d="M22 13.5h3.4c2 0 3.1 1.4 3.1 3.6v2.6c0 2.2-1.2 3.6-3.2 3.6H22" fill="none" stroke-width="2.4"/>` +
    '<rect x="6" y="10" width="16.5" height="18.5" rx="3" fill="#e0a052"/><path d="M10.5 13.5v11.5M14.3 13.5v11.5M18.1 13.5v11.5" fill="none" stroke-width="1.4"/>' +
    '<path d="M5.2 11.4c-1.4-3 .9-5.8 3.6-5.2C9.6 3.6 12.8 2.8 14.6 4.8c1.9-1.6 5.3-1 6 1.6 2.6-.2 3.6 3 2.2 5z" fill="#fffaf0"/></g></svg>',
  ship:
    `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><path d="M15.5 3v19" fill="none" stroke-width="2.2"/><path d="M16.5 4.5c5 3 7.6 8 7.8 14.5H16.5z" fill="#fffaf0"/>` +
    '<path d="M14.5 7.5c-3.6 2.6-5.4 6.3-5.6 11.5h5.6z" fill="#fffaf0"/><path d="M15.5 3l5-1.4v3z" fill="#e63946"/>' +
    '<path d="M3.5 21.5h25l-3.4 6.2H7.2z" fill="#c07b3a"/></g><path d="M3 29.5c2-1.2 4-1.2 6 0s4 1.2 6 0 4-1.2 6 0 4 1.2 6 0" fill="none" stroke="#1a64a8" stroke-width="1.8" stroke-linecap="round"/></svg>',
  // the Riddle Bell (SPEC3 §7.1: "Quiz", bell icon)
  quiz:
    `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><path d="M16 4.5c-5 0-7.6 3.6-7.6 9.2v6.2L5.6 24.4h20.8l-2.8-4.5v-6.2c0-5.6-2.6-9.2-7.6-9.2z" fill="#ffc93c"/>` +
    '<circle cx="16" cy="27" r="2.6" fill="#c07b3a"/><path d="M14.4 4.6c0-1.6.6-2.4 1.6-2.4s1.6.8 1.6 2.4" fill="none"/></g>' +
    '<path d="M11.4 11.8c.4-2.2 1.6-3.6 3.4-4.2" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".85"/></svg>',
  // Builder Bess (SPEC3 §8.3: "Build", hammer icon): a hammer at a little house, apart from the shipyard's mallet
  builder:
    `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><path d="M4 16.5v11h14v-11" fill="#ffe2b0"/>` +
    '<path d="M1.6 17.2L11 7.4l9.4 9.8z" fill="#e2383d"/><path d="M8.8 27.5v-5.6h4.4v5.6" fill="#8b5a2b"/>' +
    '<path d="M16.6 30l9.6-9.6" stroke-width="4.4"/><path d="M16.6 30l9.6-9.6" stroke="#c07b3a" stroke-width="2.1"/>' +
    '<path d="M24.9 15.8l6.3 6.3-3.1 3.1-6.3-6.3z" fill="#93a4b8"/></g></svg>',
};
// The tavern's Powder room (SPEC3 §2.5): the three recipes, by the shapes their shots have on the ships
const POWDER_ICONS = {
  fire:
    `<svg viewBox="0 0 32 32"><g ${INK}><path d="M16 29c-6 0-9.6-4-9.6-9.2 0-4.4 2.8-7 4.6-10.4.6 2.4 1.8 3.8 3.2 4.4C14 9 16.6 5.2 20.4 3c-.8 4 .6 6.8 2.8 9.4 1.6 1.8 2.6 4.2 2.6 7.2C25.8 25 21.8 29 16 29z" fill="#ff8a1c"/>` +
    '<path d="M16 28c-3 0-4.8-2-4.8-4.6 0-2.4 1.6-3.8 2.6-5.6.4 1.4 1.2 2 2 2.2.2-2 1.2-3.8 3-5-.2 2.6.6 4 1.6 5.4.6 1 1 2 1 3.2 0 2.6-2.2 4.4-5.4 4.4z" fill="#ffd23c"/></g></svg>',
  frost:
    `<svg viewBox="0 0 32 32"><g ${INK} fill="none"><path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13" stroke-width="4.4"/>` +
    '<path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13" stroke="#8fd3ff" stroke-width="2.2"/>' +
    '<path d="M12.6 4.6L16 8l3.4-3.4M12.6 27.4L16 24l3.4 3.4M4.2 13.6l4.6-1.2-1.2-4.6M27.8 18.4l-4.6 1.2 1.2 4.6M7.6 24.4l1.2-4.6-4.6-1.2M24.4 7.6l-1.2 4.6 4.6 1.2" stroke-width="1.8"/></g></svg>',
  stink:
    `<svg viewBox="0 0 32 32"><g ${INK}><path d="M7.4 25.4c-3 0-4.8-2.2-4.8-4.6 0-2.6 2-4.4 4.4-4.6-.2-3.2 2.4-5.8 5.6-5.6 1-2.6 3.4-4.2 6.2-4 3.4.2 5.8 3 5.6 6.4 2.8.2 4.8 2.4 4.8 5.2 0 3.2-2.4 5.2-5.4 5.2z" fill="#8bc34a"/></g>` +
    '<path d="M9.6 20.6c1.4-1.4 3-1.4 4.4 0M17.4 17.6c1.4-1.4 3-1.4 4.4 0" fill="none" stroke="#5a8f2e" stroke-width="1.8" stroke-linecap="round"/>' +
    '<path d="M11 2.6c-1.4 1.4-1.4 2.8 0 4.2M16 1.6c-1.4 1.4-1.4 2.8 0 4.2M21 2.6c-1.4 1.4-1.4 2.8 0 4.2" fill="none" stroke="#5a8f2e" stroke-width="1.6" stroke-linecap="round"/></svg>',
};
const CHEST_SVG =
  '<svg class="chest-ico" viewBox="0 0 32 28" aria-hidden="true" focusable="false"><path d="M3.5 12.5C3.5 6 8 3.5 16 3.5S28.5 6 28.5 12.5z" fill="#c07b3a" />' +
  '<rect x="3.5" y="12.5" width="25" height="12.5" rx="2.5" fill="#8b5a2b" /><path d="M9 3.9v8.6M23 3.9v8.6M9 12.5V25M23 12.5V25" stroke-width="2.6" stroke="#ffc93c" />' +
  '<rect x="12.6" y="10" width="6.8" height="7.6" rx="1.8" fill="#ffc93c" /><circle cx="16" cy="13.4" r="1.2" fill="#1d1330" stroke="none" /></svg>';
// The tavern's crew upgrades (the shipyard's row look)
const ARMORY_ICONS = {
  boarders:
    `<svg viewBox="0 0 32 32"><g ${INK}><circle cx="11" cy="17" r="6.2" fill="#efb488"/><path d="M4.6 15.4c.6-4.8 3.4-7.2 6.6-7.2s5.8 2.4 6.4 6.8c-4.2-1.4-8.8-1.2-13 .4z" fill="#e2383d"/>` +
    '<circle cx="21" cy="17" r="6.2" fill="#c98756"/><path d="M14.6 15.4c.6-4.8 3.4-7.2 6.6-7.2s5.8 2.4 6.4 6.8c-4.2-1.4-8.8-1.2-13 .4z" fill="#2c3e7a"/>' +
    '<path d="M7 27.5c1-3.4 3-5 5-5h8c2 0 4 1.6 5 5z" fill="#2f5fd0"/></g><g fill="#1d1330"><circle cx="9.4" cy="18" r=".9"/><circle cx="12.8" cy="18" r=".9"/><circle cx="19.4" cy="18" r=".9"/><circle cx="22.8" cy="18" r=".9"/></g></svg>',
  cutlass:
    `<svg viewBox="0 0 32 32"><g ${INK}><path d="M7 25.5C13 22 21 13 25.5 3.5c1.2 6.4-3.6 15.4-15.4 24.2z" fill="#dfe6ee"/>` +
    '<path d="M4.4 21.6c2.6 1.4 4.6 3.4 6 6" fill="none" stroke-width="3" stroke="#1d1330"/><path d="M4.4 21.6c2.6 1.4 4.6 3.4 6 6" fill="none" stroke-width="1.4" stroke="#ffc93c"/>' +
    '<path d="M7.2 25.2l-3.6 3.6" stroke-width="3.4"/><path d="M7.2 25.2l-3.6 3.6" stroke="#8b5a2b" stroke-width="1.6"/></g>' +
    '<path d="M22.6 8.4c-2.6 5.4-6.4 10.2-11 13.8" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".85"/></svg>',
  grapple:
    `<svg viewBox="0 0 32 32"><g ${INK} fill="none"><path d="M16 3v16" stroke-width="3.6"/><path d="M16 3v16" stroke="#6c7688" stroke-width="1.8"/>` +
    '<path d="M6 13.5c0 6 4.4 9.5 10 9.5s10-3.5 10-9.5" stroke-width="3.6"/><path d="M6 13.5c0 6 4.4 9.5 10 9.5s10-3.5 10-9.5" stroke="#6c7688" stroke-width="1.8"/>' +
    '<path d="M3.6 15.6l2.4-3.6 2.6 3.4M23.4 15.4l2.6-3.4 2.4 3.6" stroke-width="2"/><circle cx="16" cy="3.6" r="2.2" fill="#ffc93c"/>' +
    '<path d="M16 26c0 2.4 3 3.2 5.4 2.2 2.6-1 4.6-.6 6.6.8" stroke="#c07b3a" stroke-width="2.4"/></g></svg>',
  gunner:
    `<svg viewBox="0 0 32 32"><g ${INK}><circle cx="16" cy="16" r="12" fill="#fffaf0"/><circle cx="16" cy="16" r="8" fill="#e63946"/><circle cx="16" cy="16" r="4" fill="#fffaf0"/>` +
    '<circle cx="16" cy="16" r="1.4" fill="#1d1330"/></g><path d="M23.5 3.5l1.2 3 3-1.2-1.2 3 3 1.2-3 1.2" fill="#ffc93c" stroke="#1d1330" stroke-width="1.4" stroke-linejoin="round"/></svg>',
};
const LOCK_SVG =
  '<svg class="wi-lock" viewBox="0 0 12 14" aria-hidden="true" focusable="false"><path d="M3.2 6V4.4a2.8 2.8 0 0 1 5.6 0V6" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
  '<rect x="1.4" y="6" width="9.2" height="7" rx="1.6" fill="currentColor"/></svg>';
const AMMO_NAMES = { round: 'Round shot', chain: 'Chain shot', grape: 'Grape shot', ...Object.fromEntries(SPECIAL_IDS.map((id) => [id, SPECIAL[id].name])) };
// Act I has no rumours in its level data: the regulars' gossip about those seas.
const OLD_RUMOURS = {
  'Coast of Europe': ['Corsair cutters prowl the bay below the lighthouse.', 'Turn side-on: your cannons fire sideways!'],
  'Bali Islands': ['Prahus skim right over the light coral. Your keel cannot!', 'Chain shot slows the fast ones down.'],
  'The Volcano': ['The Molten Maw is too hot to board: sink her!', 'Grape shot thins a corsair crew for a capture.'],
};
const PROMPT_VERB = { ship: 'All aboard', shipyard: 'Go in', tailor: 'Go in', tavern: 'Go in', quiz: 'Play', builder: 'Build' };
// "...press Enter to go in" (the screen reader's words for the verb)
const VERB_SAY = { ship: 'go aboard', quiz: 'play', builder: 'build' };
const WALK_NAME = { shipyard: 'the shipyard', tailor: 'the tailor', tavern: 'the tavern', ship: 'your ship', quiz: 'the quiz', builder: 'Builder Bess' };
// The Kraken Seas' greetings (SPEC3 §8.4): the villagers, Builder Bess and Professor Barnacle
const VILLAGER_LINES = { house: "Lovely house, Cap'n!", bakery: 'Fresh biscuits today!', kraken: 'The Kraken? Brrr!' };
const THANKS_LINE = 'Thank you, Captain!'; // a new home's villagers, waving from its porch (SPEC3 §8.3)
const NPC_LINES = { bess: ["Fancy a new house, Cap'n?", 'Hammers ready, Captain!'], barnacle: ['A riddle for you, Captain?', 'Ring the bell for a quiz!'] };
const MONTAGE_SECS = { scaffold: 0.4, knocks: 1.2, spring: 0.5, cheer: 0.3 }; // sparrow's env.buildTimes + the cheer
const MODIFIER_KEYS = new Set(['shift', 'control', 'alt', 'meta', 'capslock']);
const BUY_GUARD = 400; // ms: a double-click or a held Enter buys once
const STICK = { radius: 52, dead: 0.15, walk: 0.5, run: 0.9, runAfter: 0.5 };
const TAP = { ms: 250, px: 10 };
const MOVE_KEYS = {
  KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
  w: 'f', arrowup: 'f', s: 'b', arrowdown: 'b', a: 'l', arrowleft: 'l', d: 'r', arrowright: 'r',
};

// ----- the Sunset Isles' town (SPEC4 §5.2, §6.7, §7.4, §8.5, §8.7) -----
// what the captain can do where he stands besides a door (§7.4: a door always wins, then a plot board, a talk, a pet)
const V4_VERB = { board: 'Build', lookout: 'Climb', talk: 'Talk', pet: 'Pet' };
const V4_SAY = { board: 'build here', lookout: 'climb up', talk: 'talk', pet: 'pet' };
const V4_ICONS = {
  // a speech bubble
  talk:
    `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><path d="M5 6.5h22a2.5 2.5 0 0 1 2.5 2.5v11A2.5 2.5 0 0 1 27 22.5H14l-6.5 5v-5H5A2.5 2.5 0 0 1 2.5 20V9A2.5 2.5 0 0 1 5 6.5z" fill="#fffaf0"/></g>` +
    '<g fill="#1d1330"><circle cx="10.5" cy="14.6" r="1.8"/><circle cx="16" cy="14.6" r="1.8"/><circle cx="21.5" cy="14.6" r="1.8"/></g></svg>',
  // a heart in a paw print
  pet:
    `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><ellipse cx="16" cy="21" rx="7.4" ry="6.4" fill="#e8b468"/>` +
    '<circle cx="7.4" cy="13" r="3.1" fill="#e8b468"/><circle cx="12.4" cy="7.6" r="3.1" fill="#e8b468"/><circle cx="19.6" cy="7.6" r="3.1" fill="#e8b468"/><circle cx="24.6" cy="13" r="3.1" fill="#e8b468"/></g>' +
    '<path d="M16 25.4c-3.2-2.2-4.8-3.8-4.8-5.6 0-1.4 1-2.4 2.3-2.4 1.1 0 1.9.6 2.5 1.5.6-.9 1.4-1.5 2.5-1.5 1.3 0 2.3 1 2.3 2.4 0 1.8-1.6 3.4-4.8 5.6z" fill="#e2383d" stroke="#1d1330" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  // the crow's nest on its mast, a spyglass over the rim
  lookout:
    `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><path d="M15 30V12h2.4v18" fill="#c07b3a"/><path d="M7.5 9.5h17l-2.2 7.5H9.7z" fill="#c07b3a"/>` +
    '<path d="M9.5 12.4h13" fill="none"/><path d="M17.6 7.6l9-4.4 1.2 2.4-9 4.4z" fill="#93a4b8"/><path d="M16 1.6v5" fill="none"/><path d="M16 1.6l5 1.6-5 1.6z" fill="#e63946"/></g></svg>',
};
const HOP = { fade: 0.3 }; // s each way: a hop (or the lookout's climb) fades out, the captain moves, it fades back in
const LOOKOUT = { climb: 1.2, idle: 30, turn: 1.1, drag: 0.006 }; // s, s, rad/s held, rad per pixel (§6.7)
const TOAST_SECS = 2; // a district's name under its arch (§8.5)
const PET_SECS = 1.6; // the pet's word and heart over it
const SCENE_FINISH_MAX = 30; // s: a construction scene that never says it ended is finished anyway

const hex = (n) => `#${(n >>> 0).toString(16).padStart(6, '0')}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function createTownMode(ctx = {}) {
  const C = ctx || {};
  const U = C.ui || {};
  // The Kraken Seas (SPEC3 §7, §8, §2.5): read once; false keeps the town exactly as it is today
  let KRAKEN = false;
  try {
    KRAKEN = !!(typeof C.withKraken === 'function' ? C.withKraken() : C.withKraken);
  } catch {
    KRAKEN = false;
  }
  // Sunset Isles (SPEC4 §0.1): read once; false hides the Voyage IV trophies, so the town stays exactly today's
  let V4 = false;
  try {
    V4 = !!(typeof C.withV4 === 'function' ? C.withV4() : C.withV4);
  } catch {
    V4 = false;
  }
  const PLACES = KRAKEN ? PLACES_KRAKEN : PLACES_TODAY;
  const $ = (id, tag = 'div') => document.getElementById(id) || document.createElement(tag);
  const el = {
    town: U.townScreen || $('town-screen', 'section'),
    wardrobe: U.wardrobeScreen || $('wardrobe-screen', 'section'),
    tavern: U.tavernScreen || $('tavern-screen', 'section'),
    harbour: U.harbourDialog || $('harbour-dialog'),
    aboard: U.aboardDialog || $('aboard-dialog'),
    dock: U.dockScreen || $('dock-screen', 'section'),
    ashore: U.ashoreBtn || $('dock-ashore-btn', 'button'),
    chest: $('town-chest', 'p'),
    menuBtn: $('town-menu-btn', 'button'),
    mute: $('town-mute', 'button'),
    prompt: $('town-prompt', 'button'),
    places: $('town-places', 'nav'),
    action: $('town-action', 'button'),
    stick: $('town-joystick'),
    keys: $('town-keys', 'p'),
    live: $('town-live', 'p'),
    wPanel: $('wardrobe-panel'),
    wChest: $('wardrobe-chest', 'p'),
    wTabs: [$('wardrobe-tab-captain', 'button'), $('wardrobe-tab-crew', 'button')],
    wCap: $('wardrobe-captain'),
    wCrew: $('wardrobe-crew'),
    wSurprise: $('wardrobe-surprise-btn', 'button'),
    wBack: $('wardrobe-back-btn', 'button'),
    wLive: $('wardrobe-live', 'p'),
    tPanel: $('tavern-panel'),
    tChest: $('tavern-chest', 'p'),
    tList: $('tavern-up-list', 'ul'),
    pList: $('tavern-powder-list', 'ul'),
    tRumour: $('tavern-rumour', 'section'),
    tLog: $('tavern-log', 'section'),
    tBack: $('tavern-back-btn', 'button'),
    tLive: $('tavern-live', 'p'),
    hWalk: $('harbour-walk-btn', 'button'),
    hPlaces: { shipyard: $('harbour-shipyard-btn', 'button'), tailor: $('harbour-tailor-btn', 'button'), tavern: $('harbour-tavern-btn', 'button') },
    quiz: $('quiz-screen', 'section'),
    qPanel: $('quiz-panel'),
    qLive: $('quiz-live', 'p'),
    build: $('build-screen', 'section'),
    bPanel: $('build-panel'),
    bLive: $('build-live', 'p'),
    hExits: $('harbour-exits'),
    aExits: $('aboard-exits'),
    aStay: $('aboard-stay-btn', 'button'),
  };
  if (KRAKEN) {
    el.hPlaces.quiz = $('harbour-quiz-btn', 'button');
    el.hPlaces.builder = $('harbour-build-btn', 'button');
  }
  if (V4) {
    // (SPEC4 §7.4, §6.7, §8.5, §8.7, §5.2: Stage 0's ids, hidden until used)
    el.talk = $('talk-bubble');
    el.talkName = $('talk-name', 'b');
    el.talkText = $('talk-text', 'p');
    el.talkNext = $('talk-next-btn', 'button');
    el.lookDown = $('lookout-down-btn', 'button');
    el.toast = $('town-toast', 'p');
    el.tGuide = $('tavern-guide', 'section');
    el.hMap = $('harbour-map-btn', 'button');
    el.mapRoot = $('island-map', 'section');
    el.strip = $('build-scene');
  }
  const placeBtns = {};
  for (const b of el.places.querySelectorAll('[data-place]')) placeBtns[b.dataset.place] = b;

  // ---- ctx helpers (every member optional, so a partial ctx never throws) ----
  const call = (fn, ...a) => {
    try {
      return typeof fn === 'function' ? fn(...a) : undefined;
    } catch (err) {
      console.error(err); // eslint-disable-line no-console
      return undefined;
    }
  };
  const envNow = () => call(C.env) || null;
  const lookNow = () => (C.look && call(C.look.get)) || null;
  const featsNow = () => call(C.feats) || null;
  const purseNow = () => {
    const p = call(C.purse);
    return Number.isFinite(p) ? p : 0;
  };
  const armoryNow = () => parseArmoryConfig((C.armory && call(C.armory.config)) || null);
  // the Kraken Seas' records, read through their modules' own rules (never trusted as given)
  const powderNow = () => parsePowder((C.powder && call(C.powder.state && C.powder.state.bind(C.powder))) ?? null);
  const islandNow = () => parseIsland((C.island && call(C.island.state && C.island.state.bind(C.island))) ?? null);
  const unlockedNow = () => {
    const u = call(C.unlocked);
    return Number.isInteger(u) ? Math.max(1, Math.min(99, u)) : 1;
  };
  const touch = () => {
    const t = call(C.isTouch);
    if (typeof t === 'boolean') return t;
    return globalThis.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false;
  };
  const reduced = () => {
    const r = call(C.reducedMotion);
    if (typeof r === 'boolean') return r;
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  };
  const activeModal = () => call(C.activeModal) || null;
  // (the Sunset Isles) the new plots' record, the chats' progress, the voyage4 record, read through their modules
  const BUILD4 = V4 && KRAKEN && !!C.island4 && typeof C.island4.build === 'function'; // the 21-plot panel and boards
  const island4Now = () => parseIsland4((C.island4 && call(C.island4.state && C.island4.state.bind(C.island4))) ?? null);
  const voyage4Now = () => parseVoyage4((C.voyage4 && call(C.voyage4.state && C.voyage4.state.bind(C.voyage4))) ?? null);
  function progressNow() {
    const p = C.islanders && call(C.islanders.progress && C.islanders.progress.bind(C.islanders));
    if (p && typeof p === 'object') return p;
    const f = featsNow() || {};
    const n = (k) => (Number.isFinite(f[k]) ? f[k] : 0);
    return { unlocked: unlockedNow(), captures: n('captures'), kraken: n('kraken'), shell: n('shell') };
  }
  const setClipping = (on) => V4 && call(C.setClipping, !!on);
  const sfx = (name, opts) => C.audio && call(C.audio.play && C.audio.play.bind(C.audio), name, opts);
  const setScene = (name) => C.audio && call(C.audio.setScene && C.audio.setScene.bind(C.audio), name);
  const show = (node, on) => {
    node.classList.toggle('hidden', !on);
    if (!on && node.contains(document.activeElement) && document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };
  const focus = (node) => {
    if (node && node.focus && !activeModal()) node.focus({ preventScroll: true });
  };

  // ---- state ----
  let view = 'shop';
  let town = null;
  let townEnv = null;
  let visited = false; // been ashore this dock visit: the shipyard's button reads "Back to town"
  let spotForTown = 'spawn'; // where "Back to town" puts the captain
  let tab = 'captain';
  let trial = null; // a priced item being tried on
  let lineupOn = false;
  let returnFocus = null; // where focus goes when a dialog closes
  let lastLook = null;
  let lookSig = '';
  let lastFeats = null;
  let lastArmory = '';
  let lastArmoryRef = null;
  let shownPurse = -1;
  let lastPrompt = null;
  let lastBuy = { id: '', at: -Infinity };
  let crewDirty = false; // a uniform chosen at Polly's: the cleaning crew is dressed once, when she closes
  let bought = null; // { slot, id }: the Buy button stays put as "Bought" until the next choice
  const held = new Set(); // movement directions held: f b l r
  let shift = false;
  let stick = null; // { id, x0, y0, mag, over, run }
  let drag = null; // { id, x, y, x0, y0, t0, moved }
  let liveTimer = 0;
  // the Kraken Seas
  const powderRefused = new Set(); // recipes whose record storage refused this visit (the row says why)
  let lastPowder = '';
  let lastPowderRef = null;
  let lastIslandRef = null;
  let lastQuizRef = null;
  let plotFocus = null; // the plot the build view's camera looks at (null: Bess at her easel)
  let montage = null; // { id, t, cfg }: a building going up; the villagers move in and everyone cheers after it
  // the Sunset Isles
  let islandMap = null; // the Island map (view 'map')
  let chat = null; // { id, name, lines, i, anchor: 'them' | { x, z } }: a chat with an islander (#talk-bubble)
  let tapGoal = null; // { kind: 'talk' | 'pet', id | i }: tapped someone farther off: walk up, then talk or pet
  let lookout = null; // { phase: 'up' | 'on' | 'down', t, idle, foot: { x, z, h } }: the crow's nest (view 'lookout')
  let fade = null; // { t, mid(), done, cut }: a hop's (or the climb's) fade: out, the move, back in
  let toastLeft = 0; // s the district toast stays up
  let petLeft = 0; // s the pet's word stays over it
  let petAt = null; // { x, y, z }
  let lastCap = null; // the captain's last spot in the walk view (a district's arch crossed between two frames)
  let tipShown = 0; // §8.4 tips shown this visit (their bits): the prompt says the long words until he walks on
  let tipNow = 0; // the tip bit the prompt shows now
  let mapBadge = false; // the Harbour menu's Island map wears its "New!" badge this visit
  let sceneCam = null; // { id }: the build view frames a construction scene (glide + orbit, SPEC4 §5.2)
  let mapRefreshIn = 0;
  let layersShown = -1; // the town band's layers handed to audio.setTownLayers (-1: none yet)
  let lastIsland4Ref = null;

  // ---------------------------------------------------------------------------------------------
  // Static DOM: icons and labels on the HUD, the wardrobe groups, the tavern rows
  // ---------------------------------------------------------------------------------------------
  const chestHTML = (id) => `${CHEST_SVG}<span><span class="chest-label">Treasure chest: </span><b id="${id}">0</b> gold</span>`;
  el.chest.innerHTML = chestHTML('town-chest-gold');
  el.wChest.innerHTML = chestHTML('wardrobe-chest-gold');
  el.tChest.innerHTML = chestHTML('tavern-chest-gold');
  el.chest.classList.add('dock-chest');
  const chestGold = [el.chest, el.wChest, el.tChest].map((p) => p.querySelector('b'));
  for (const id of PLACES) {
    const b = placeBtns[id];
    if (!b) continue;
    const label = b.textContent.trim() || id;
    b.innerHTML = `${ICONS[id]}<span class="tp-label">${esc(label)}</span>`;
    b.setAttribute('aria-label', id === 'ship' ? 'Walk to your ship and set sail' : `Walk to ${WALK_NAME[id]}`);
    b.classList.add('town-place');
    if (KRAKEN) b.classList.remove('hidden'); // (the Riddle Bell's and Bess's buttons wait, hidden, until then)
  }
  // the six-button bar (SPEC3 §7.1): town.css makes it icon-only, 44 × 44, on phones and short landscape
  if (KRAKEN) el.places.classList.add('six');
  for (const [id, b] of Object.entries(el.hPlaces)) {
    const label = b.textContent.trim();
    b.innerHTML = `${ICONS[id]}<span>${esc(label)}</span>`;
    b.classList.add('harbour-place');
    if (KRAKEN) b.classList.remove('hidden');
  }
  // keyboard help: one unbroken item per action (the Sunset Isles add the Island map's I, SPEC4 §8.1)
  el.keys.innerHTML = [
    ['Walk', ['W', 'A', 'S', 'D']],
    ['Sprint', ['Shift']],
    ['Go in', ['E']],
    ['Camera', ['C']],
    ...(V4 ? [['Island map', ['I']]] : []),
    ['Menu', ['Esc']],
  ]
    .map(([what, ks]) => `<span class="tk">${what} ${ks.map((k) => `<kbd>${k}</kbd>`).join('')}</span>`)
    .join(' ');
  el.action.innerHTML = '<span class="ta-ico" aria-hidden="true"></span><span class="ta-label">Go in</span>';
  el.action.setAttribute('aria-label', 'Go in (walk up to a door first)');
  el.stick.innerHTML = '<div class="town-knob"></div>';
  const knob = el.stick.firstElementChild;
  const bubble = document.createElement('div');
  bubble.className = 'town-bubble hidden';
  bubble.setAttribute('aria-hidden', 'true');
  el.town.appendChild(bubble);
  // (the Kraken Seas, SPEC3 §8.3) "Thank you, Captain!" over a new home's villagers while they wave from its porch, in
  // the build view or the town: its own bubble, first in its screen so the panel draws over it (aria-hidden: #build-live
  // already says who moved in)
  const thanks = KRAKEN ? document.createElement('div') : null;
  if (thanks) {
    thanks.className = 'town-bubble thanks-bubble hidden';
    thanks.setAttribute('aria-hidden', 'true');
    thanks.textContent = THANKS_LINE;
  }
  // (the Sunset Isles) a pet's word and heart over it: its own bubble; the fade a hop and the lookout's climb play under
  // the HUD (driven by update() on the game's clock, a cut under reduced motion); the Harbour menu's Island map
  const petBubble = V4 ? document.createElement('div') : null;
  let fadeEl = null;
  if (V4) {
    petBubble.className = 'town-bubble pet-bubble hidden';
    petBubble.setAttribute('aria-hidden', 'true');
    el.town.appendChild(petBubble);
    fadeEl = document.createElement('div');
    fadeEl.className = 'town-fade';
    fadeEl.setAttribute('aria-hidden', 'true');
    // (inline: a full-screen ink veil, under the town's HUD, never catching a pointer)
    fadeEl.style.cssText = 'position:fixed;inset:0;background:#1d1330;opacity:0;pointer-events:none;display:none;';
    if (el.town.parentNode) el.town.parentNode.insertBefore(fadeEl, el.town);
    el.hMap.classList.remove('hidden');
    el.hMap.addEventListener('click', () => {
      closeDialog(el.harbour, false);
      openMap();
    });
    el.talkNext.addEventListener('click', (e) => {
      nextLine();
      if (pointerClick(e)) el.talkNext.blur();
    });
    el.lookDown.addEventListener('click', () => climbDown());
  }
  // the shipyard's Go ashore / Back to town button
  el.ashore.innerHTML =
    '<svg class="boot" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 3h6v9l5 3.5c1 .7 1.5 1.6 1.5 2.7V20H4.5v-3.5L8 14z" /></svg>' +
    '<span class="ashore-label">Go ashore</span>';
  const ashoreLabel = el.ashore.querySelector('.ashore-label');
  const setAshoreLabel = (text) => {
    if (ashoreLabel.textContent !== text) ashoreLabel.textContent = text;
  };
  el.ashore.classList.remove('hidden');

  // ----- wardrobe -----
  const itemBtns = new Map(); // id -> button
  // the Kraken Seas trophies stay out of the wardrobe and the log until that voyage is in the game
  const hiddenItem = (id) => (!KRAKEN && KRAKEN_ITEMS.includes(id)) || (!V4 && V4_ITEMS.includes(id));
  const groupEls = new Map(); // slot -> { group, buyWrap, buyBtn, why }
  let paintBtn = null;
  function buildWardrobe() {
    for (const [tabName, root] of [['captain', el.wCap], ['crew', el.wCrew]]) {
      root.innerHTML = '';
      root.classList.add('ward-tab');
      if (tabName === 'crew') {
        const p = document.createElement('p');
        p.className = 'ward-note';
        p.textContent = 'Your whole crew wears the uniform: on deck, at the dock and in every boarding party.';
        root.appendChild(p);
      }
      for (const slot of SLOTS[tabName]) {
        const g = document.createElement('div');
        g.className = 'ward-group';
        g.setAttribute('role', 'group');
        g.setAttribute('aria-labelledby', `ward-${slot}-h`);
        g.dataset.slot = slot;
        g.innerHTML =
          `<h3 id="ward-${slot}-h">${esc(SLOT_NAMES[slot] || slot)}</h3>` +
          `<div class="ward-buy hidden"><button type="button" class="btn ward-buy-btn" data-buy-item="" aria-describedby="ward-${slot}-why"></button>` +
          `<span class="up-why" id="ward-${slot}-why"></span></div>` +
          '<div class="ward-items"></div>';
        const items = g.querySelector('.ward-items');
        if (slot === 'shirt') {
          // "Match the ship's paint": a wide button at the top of the shirts
          paintBtn = document.createElement('button');
          paintBtn.type = 'button';
          paintBtn.className = 'ward-paint';
          paintBtn.dataset.item = 'shirt.paint';
          paintBtn.innerHTML = '<span class="chip" aria-hidden="true"></span><span class="wi-name">Match the ship\'s paint</span><span class="wi-state"></span>';
          g.insertBefore(paintBtn, items);
          itemBtns.set('shirt.paint', paintBtn);
        }
        for (const it of Object.values(ITEMS)) {
          if (it.slot !== slot || it.id === 'shirt.paint' || hiddenItem(it.id)) continue;
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'ward-item';
          b.dataset.item = it.id;
          const [c1, c2 = c1] = it.swatch.map(hex);
          const none = it.swatch.length === 1 && it.swatch[0] === 0xe8dcc4;
          b.innerHTML =
            `<span class="chip${none ? ' none' : ''}" style="--c1:${c1};--c2:${c2}" aria-hidden="true"></span>` +
            `<span class="wi-name">${esc(it.name)}</span><span class="wi-state"></span>`;
          items.appendChild(b);
          itemBtns.set(it.id, b);
        }
        root.appendChild(g);
        const buyWrap = g.querySelector('.ward-buy');
        groupEls.set(slot, { group: g, buyWrap, buyBtn: buyWrap.querySelector('button'), why: buyWrap.querySelector('.up-why') });
      }
    }
  }
  buildWardrobe();

  // ----- tavern -----
  function buildTavern() {
    el.tList.innerHTML = '';
    for (const u of ARMORY) {
      const li = document.createElement('li');
      li.className = 'up-row';
      li.dataset.id = u.id;
      li.innerHTML =
        `<span class="up-ico" aria-hidden="true">${ARMORY_ICONS[u.id] || ''}</span>` +
        `<div class="up-head"><h3 class="up-name">${esc(u.name)}</h3><span class="pips" role="img"></span></div>` +
        `<p class="up-stat"><span class="up-statname">${esc(u.stat)}:</span> <span class="up-values"></span></p>` +
        `<p class="up-blurb">${esc(u.blurb)}${u.extra ? ` <span class="up-extra">${esc(u.extra)}</span>` : ''}</p>` +
        '<div class="up-buy">' +
        `<button type="button" class="buy-btn" data-armory="${u.id}" aria-describedby="tav-${u.id}-why"></button>` +
        `<span class="up-why" id="tav-${u.id}-why"></span>` +
        '</div>';
      el.tList.appendChild(li);
    }
    if (!KRAKEN) return;
    // The Powder room (SPEC3 §2.5): Fire, Frost and Stink shot recipes, bought once (outside #tavern-up-list)
    el.pList.innerHTML = '';
    if (!el.pList.previousElementSibling || !el.pList.previousElementSibling.classList.contains('powder-h')) {
      const h = document.createElement('h3');
      h.className = 'tav-h powder-h';
      h.id = 'tavern-powder-h';
      h.textContent = 'Powder room';
      el.pList.before(h);
    }
    el.pList.setAttribute('aria-labelledby', 'tavern-powder-h');
    el.pList.removeAttribute('aria-label');
    for (const id of SPECIAL_IDS) {
      const li = document.createElement('li');
      li.className = 'up-row powder-row';
      li.dataset.powderRow = id;
      li.innerHTML =
        `<span class="up-ico" aria-hidden="true">${POWDER_ICONS[id] || ''}</span>` +
        `<div class="up-head"><h3 class="up-name">${esc(SPECIAL[id].name)}</h3></div>` +
        '<p class="up-stat"><span class="up-values"></span></p>' +
        `<p class="up-blurb">${esc(WORDS3.blurb[id] || '')}</p>` +
        '<div class="up-buy">' +
        `<button type="button" class="buy-btn" data-powder="${id}" aria-describedby="tav-powder-${id}-why"></button>` +
        `<span class="up-why" id="tav-powder-${id}-why"></span>` +
        '</div>';
      el.pList.appendChild(li);
    }
    el.pList.classList.remove('hidden');
  }
  buildTavern();

  // ----- the Riddle Bell's and Builder Bess's panels (SPEC3 §7.3, §8.3; created once, with the Kraken Seas) -----
  let quizPanel = null;
  let buildPanel = null;
  if (KRAKEN) {
    quizPanel = createQuizPanel({
      root: el.quiz,
      ctx: {
        quiz: C.quiz,
        purse: C.purse,
        unlocked: C.unlocked,
        hints: typeof C.hints === 'function' ? C.hints : undefined,
        island: C.island,
        audio: C.audio,
        reducedMotion: reduced,
        back: () => back(),
        react: (what, info) => quizReact(what, info),
      },
    });
    buildPanel = createBuildPanel({
      root: el.build,
      ctx: {
        island: C.island,
        purse: C.purse,
        audio: C.audio,
        reducedMotion: reduced,
        back: () => back(),
        focusPlot: (id) => focusPlot(id),
        celebrate: (id, tier, opts) => celebrate(id, tier, opts),
        skipCelebration: () => skipCelebration(),
        // (the Sunset Isles' panel, SPEC4 §5.2, §8.6: all 21 plots, the construction scene and Watch again; only with
        // the new plots' record in the ctx, else today's panel)
        ...(BUILD4
          ? {
              withV4: true,
              island4: C.island4,
              progress: () => progressNow(),
              replay: (id, tier, opts) => replay(id, tier, opts),
              scene: () => sceneNow(),
            }
          : {}),
      },
    });
  }
  const panelOf = (v) => (v === 'quiz' ? quizPanel : v === 'build' ? buildPanel : null);

  // ----- the Island map (SPEC4 §8.5; created once, with the Sunset Isles): the view 'map' -----
  if (V4) {
    islandMap = createIslandMap({
      root: el.mapRoot,
      ctx: {
        plan: islandPlan,
        walk: () => {
          const env = envNow();
          return env && env.walk ? env.walk : null;
        },
        captain: () => (town ? { x: town.captain.x, z: town.captain.z, h: town.captain.h } : null),
        islanders: () => islandersOut(),
        plots: () => plotTiers(),
        walkTo: (id) => mapWalkTo(id),
        hop: (id) => hopTo(id),
        talk: (id) => startChat(id, { far: true }),
        onClose: (reason) => mapClosed(reason),
        announce: (text) => announce(text, el.live),
        reducedMotion: reduced,
      },
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Announcements (polite, de-duplicated like the shipyard's)
  // ---------------------------------------------------------------------------------------------
  function liveFor() {
    return view === 'tailor' ? el.wLive : view === 'tavern' ? el.tLive : view === 'quiz' ? el.qLive : view === 'build' ? el.bLive : el.live;
  }
  // (the Island map is gone from the screen when its view is left: its own #map-live says what it picks)
  function announce(text, region = liveFor()) {
    if (!text) return;
    region.textContent = region.textContent === text ? `${text} ` : text;
  }

  // ---------------------------------------------------------------------------------------------
  // The town controller (built lazily, once per dock visit)
  // ---------------------------------------------------------------------------------------------
  function ensureTown({ hidden = false } = {}) {
    const env = envNow();
    if (!env || !env.walk) return null;
    if (town && townEnv === env) return town;
    if (town) town.dispose();
    town = createTown({
      scene: C.scene,
      camera: C.camera,
      walkData: env.walk,
      audio: C.audio,
      reducedMotion: reduced,
      env: () => envNow(),
      // (the Sunset Isles: the path graph is built now, at dock open behind the "Rowing to…" toast, never at the first
      // tap-to-walk, SPEC4 §6.6; built ahead of Go ashore, the captain waits out of sight until he steps ashore)
      ...(V4 ? { graph: true, hidden } : {}),
    });
    townEnv = env;
    lastLook = lookNow();
    lookSig = JSON.stringify(lastLook);
    town.setCaptain(captainOpts(lastLook, trial));
    return town;
  }
  /** (the Sunset Isles) The dock has opened, behind the "Rowing to…" toast: the walk's path graph is built (SPEC4 §6.6)
   * and the town band's layers follow the island4 record (§11.1). main calls it from openDock; update() calls it on
   * the first shipyard frame when main does not. With the flag off it does nothing. */
  function prepare() {
    if (!V4 || view !== 'shop') return false;
    syncLayers(true);
    if (town && townEnv === envNow()) return true;
    return !!ensureTown({ hidden: true });
  }
  const hullPaint = () => call(C.hullPaint) || null;
  const lineupOpts = (look) => town.seeds.map((s) => crewOpts(look, s, { kind: 'pirate', seed: s }, hullPaint(), trial));
  function applyLook({ crew = false } = {}) {
    const look = lookNow();
    lastLook = look;
    lookSig = JSON.stringify(look);
    if (town) {
      town.setCaptain(captainOpts(look, trial));
      if (lineupOn) town.setLineup(lineupOpts(look));
    }
    // (the docked ship's cleaning crew isn't in Polly's view: rebuilding its six sailors on every click
    // there would stall the panel, so they are dressed once, when the wardrobe closes)
    if (crew) {
      if (view === 'tailor') crewDirty = true;
      else restyleCrew(look);
    }
    if (view === 'tailor') renderWardrobe();
  }
  function restyleCrew(look = lookNow()) {
    crewDirty = false;
    if (typeof C.restyleCrew === 'function') {
      call(C.restyleCrew);
      return;
    }
    const env = envNow();
    if (!env || typeof env.setCrewStyle !== 'function') return;
    const paint = hullPaint();
    call(env.setCrewStyle, (role, seed, base) => crewOpts(look, seed, base, paint));
  }

  // ---------------------------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------------------------
  function resetLens() {
    if (C.camera && C.camera.clearViewOffset) C.camera.clearViewOffset();
    call(C.setLens);
  }
  function hideAllScreens() {
    for (const s of [el.town, el.wardrobe, el.tavern]) show(s, false);
    if (quizPanel) quizPanel.close();
    if (buildPanel) buildPanel.close();
    bubble.classList.add('hidden');
  }
  function clearInput() {
    held.clear();
    shift = false;
    endStick();
    drag = null;
    if (town) town.setMove({ x: 0, z: 0 });
  }

  /** Shipyard → walking (the Go ashore / Back to town button). */
  function ashore({ swoop = true } = {}) {
    if (view !== 'shop') return false;
    if (!ensureTown()) return false;
    if (C.hideShipyard) call(C.hideShipyard);
    else show(el.dock, false);
    resetLens();
    const first = !visited;
    visited = true;
    town.enter(first ? 'spawn' : spotForTown, { swoopFrom: swoop ? 'camera' : null });
    spotForTown = 'here';
    view = 'town';
    setAshoreLabel('Back to town');
    show(el.town, true);
    clearInput();
    setScene('town');
    if (V4) {
      setClipping(true); // (a construction scene can show in the town views, SPEC4 §5.3)
      syncLayers(true);
      lastCap = null;
    }
    const env = envNow();
    if (C.prizes && env && env.setPrizes) call(env.setPrizes, call(C.prizes) || []);
    cullNow();
    refreshPrompt(true);
    renderChests(true);
    focus(el.town);
    announce(
      first
        ? touch()
          ? "You're ashore. Use the stick or pick a place below."
          : "You're ashore. Walk with W A S D or pick a place below."
        : 'Back in town.',
      el.live
    );
    return true;
  }

  /** Back to the shipyard panel (the town's Shipyard place). */
  function showShop() {
    if (view === 'shop') return false;
    closeDialogs(false);
    if (V4) leaveV4Views();
    leavePanel();
    if (town) town.exit();
    hideAllScreens();
    clearInput();
    view = 'shop';
    const env = envNow();
    if (env && env.cull) call(env.cull.bind(env));
    resetLens();
    setAshoreLabel(visited ? 'Back to town' : 'Go ashore');
    setScene('dock');
    if (V4) setClipping(false);
    if (C.showShipyard) call(C.showShipyard);
    else {
      show(el.dock, true);
      focus(document.getElementById('dock-tab-up'));
    }
    return true;
  }

  /** Open a place: 'shipyard' | 'tailor' | 'tavern' | 'ship' (the All aboard? dialog); with the Kraken Seas also
   * 'quiz' (the Riddle Bell's panel) and 'builder' (Builder Bess's panel, the view 'build'); with the Sunset Isles
   * open('builder', { plot }) opens Bess's panel at that plot's row (a plot board, SPEC4 §8.5). */
  function open(id, opts = null) {
    if (!PLACES.includes(id)) return false;
    if (view === 'shop') {
      if (id === 'shipyard') return true;
      if (!ashore({ swoop: false })) return false;
    }
    if (V4) leaveV4Views();
    if (activeModal() === el.harbour) closeDialog(el.harbour, false);
    if (V4 && id === 'builder' && opts && typeof opts.plot === 'string') return openBuild(opts);
    if (id === 'shipyard') {
      if (view === 'town' && town && town.captain && nearPlace() === 'shipyard') spotForTown = 'shipyard';
      return showShop();
    }
    if (id === 'ship') return openAboard();
    if (id === 'tailor') return openWardrobe();
    if (id === 'quiz') return openQuiz();
    if (id === 'builder') return openBuild();
    return openTavern();
  }

  function nearPlace() {
    if (!town) return null;
    const c = town.captain;
    const np = town.walk.nearestPlace(c.x, c.z);
    return np ? np.place.id : null;
  }

  function enterPanel(id) {
    if (!ensureTown()) return false;
    if (V4) leaveV4Views();
    if (PANEL_VIEWS.includes(view)) leavePanel();
    closeDialogs(false);
    clearInput();
    town.exit();
    town.park(id);
    resetLens();
    show(el.town, false);
    bubble.classList.add('hidden');
    view = VIEW_OF[id] || id;
    return true;
  }

  function openWardrobe() {
    if (view === 'tailor') return true;
    if (!enterPanel('tailor')) return false;
    trial = null;
    bought = null;
    tab = 'captain';
    show(el.wardrobe, true);
    applyLook();
    setTab('captain', true);
    town.setPanel('tailor', el.wPanel, 'captain');
    renderChests(true);
    announce("Polly's Plumes & Trims. Try anything on before you buy.", el.wLive);
    return true;
  }

  function openTavern() {
    if (view === 'tavern') return true;
    if (!enterPanel('tavern')) return false;
    show(el.tavern, true);
    renderTavern();
    renderRumour();
    renderLog();
    if (V4) renderGuide();
    renderChests(true);
    town.setPanel('tavern', el.tPanel, 'captain');
    const body = el.tPanel.querySelector('.dock-body');
    if (body) body.scrollTop = 0;
    focus(el.tPanel.querySelector('.buy-btn') || el.tBack);
    announce('The Salty Sparrow. Train your crew, hear the rumours and read your log.', el.tLive);
    return true;
  }

  // Professor Barnacle's Riddle Bell (SPEC3 §7): the quiz panel beside the bell, the professor and the captain
  function openQuiz() {
    if (view === 'quiz') return true;
    if (!quizPanel || !enterPanel('quiz')) return false;
    quizPanel.open(); // (shows #quiz-screen, pays any owed star gold, focuses the highest open island)
    town.setPanel('quiz', el.qPanel, 'captain');
    renderChests(true);
    return true;
  }
  // Builder Bess (SPEC3 §8.3): the build panel beside Bess and her island plan; a row in focus glides the camera
  // to its plot (focusPlot)
  function openBuild(opts = null) {
    const plot = V4 && opts && typeof opts.plot === 'string' ? opts.plot : null;
    if (view === 'build') {
      // (already in Bess's panel: a plot board's row)
      if (plot && buildPanel) (BUILD4 ? buildPanel.api.open(plot) : buildPanel.api.focus(plot));
      return true;
    }
    if (!buildPanel || !enterPanel('builder')) return false;
    plotFocus = null;
    if (!plot) {
      buildPanel.open(); // (shows #build-screen, focuses the Homes tab)
      town.setPanel('build', el.bPanel, 'captain');
    } else {
      // a plot board (SPEC4 §8.5): Bess's pose first, then the panel at the plot's row, whose focus glides the camera
      // to the plot (a pose set after it would undo the glide)
      town.setPanel('build', el.bPanel, 'captain');
      if (BUILD4) buildPanel.open({ plot });
      else {
        buildPanel.open();
        buildPanel.api.focus(plot);
      }
    }
    renderChests(true);
    return true;
  }

  /** Leave a panel view's 3D set-up and screen (no view change). */
  function leavePanel() {
    if (view === 'tailor') {
      if (trial) revertTrial(false);
      lineupOn = false;
      if (town) town.setLineup(null);
      show(el.wardrobe, false);
      if (crewDirty) restyleCrew(); // the uniform chosen there, on the cleaning crew at last
    } else if (view === 'tavern') show(el.tavern, false);
    else if (view === 'quiz') {
      if (quizPanel) quizPanel.close();
    } else if (view === 'build') {
      if (buildPanel) buildPanel.close(); // (a montage still going is finished: skipCelebration)
      plotFocus = null;
    } else return;
    if (town) town.park(null);
    resetLens();
  }

  /** Back to walking: from a panel (focus on its place in the bar), or from the shipyard. */
  function back() {
    if (view === 'shop') return ashore();
    if (view === 'map') {
      if (islandMap) islandMap.close();
      return true;
    }
    if (view === 'lookout') return climbDown();
    if (PANEL_VIEWS.includes(view)) {
      const id = PLACE_OF[view] || view;
      leavePanel();
      view = 'town';
      town.enter(id);
      show(el.town, true);
      clearInput();
      refreshPrompt(true);
      cullNow();
      focus(placeBtns[id] || el.town);
      announce('Back in town.', el.live);
      return true;
    }
    const m = activeModal();
    if (m === el.harbour || m === el.aboard) {
      closeDialog(m);
      return true;
    }
    return false;
  }

  /** Leaving the dock (any way out): everything put away. */
  function close() {
    closeDialogs(false);
    if (V4) {
      leaveV4Views();
      mapBadge = false;
      tipShown = 0;
      layersShown = -1;
      setClipping(false);
    }
    if (view === 'tailor' && trial) revertTrial(false, true);
    if (montage) finishMontage(); // (the island goes: a building going up stands; villagers set at the next dock)
    plotFocus = null;
    powderRefused.clear();
    trial = null;
    lineupOn = false;
    crewDirty = false; // (the island goes; the next visit dresses its crew from the saved look)
    hideAllScreens();
    clearInput();
    if (town) town.dispose();
    town = null;
    townEnv = null;
    const env = envNow();
    if (env && env.cull) call(env.cull.bind(env));
    view = 'shop';
    visited = false;
    spotForTown = 'spawn';
    lastPrompt = null;
    setAshoreLabel('Go ashore');
  }

  // ---------------------------------------------------------------------------------------------
  // Dialogs: the Harbour menu and All aboard?
  // ---------------------------------------------------------------------------------------------
  function exitButtons(root, prefix, firstPrimary) {
    root.innerHTML = '';
    const exits = call(C.exits) || [];
    exits.forEach((x, i) => {
      if (!x || !x.action) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = i === 0 && firstPrimary ? 'btn' : 'btn alt';
      b.id = `${prefix}-${x.action}-btn`;
      b.dataset.exit = x.action;
      b.textContent = x.label || x.action;
      root.appendChild(b);
    });
  }
  function openDialog(d) {
    clearInput();
    if (town) town.cancelAuto();
    const a = document.activeElement;
    returnFocus = a && a !== document.body && el.town.contains(a) ? a : null;
    if (C.openModal) call(C.openModal, d);
    else {
      show(d, true);
      focus(d.querySelector('button'));
    }
  }
  function openHarbour() {
    if (view !== 'town' || activeModal()) return false;
    exitButtons(el.hExits, 'harbour', false);
    if (V4) {
      endChat();
      // the Island map's one-time "New!" badge (SPEC4 §8.4 tip 64): this dock visit, the first time Voyage IV is open
      if (!mapBadge && tipFirst(WORDS4.tips.map.bit)) {
        mapBadge = true;
        markTip(WORDS4.tips.map.bit);
      }
      const badge = el.hMap.querySelector('.new-badge');
      if (badge) badge.classList.toggle('hidden', !mapBadge);
    }
    openDialog(el.harbour);
    return true;
  }
  function openAboard() {
    if (view !== 'town' || activeModal()) return false;
    exitButtons(el.aExits, 'aboard', true);
    openDialog(el.aboard);
    return true;
  }
  function closeDialog(d, refocus = true) {
    if (d.classList.contains('hidden')) return;
    if (C.closeModal) call(C.closeModal, d);
    else show(d, false);
    if (refocus && view === 'town') {
      const back = returnFocus && returnFocus.isConnected && returnFocus.getClientRects().length ? returnFocus : el.town;
      focus(back);
    }
    returnFocus = null;
  }
  function closeDialogs(refocus) {
    for (const d of [el.harbour, el.aboard]) closeDialog(d, refocus);
  }
  // A mouse or finger press shouldn't leave keyboard focus on ☰ or 🔊 (nor have the Harbour menu hand it back
  // there): Enter and Space at the next door must go in (a keyboard press keeps focus where it was).
  const pointerClick = (e) => !!e && (e.detail > 0 || (typeof e.pointerType === 'string' && !!e.pointerType));
  el.menuBtn.addEventListener('click', (e) => {
    if (pointerClick(e)) el.menuBtn.blur();
    if (V4 && view === 'lookout') climbDown({ now: true }); // (from the crow's nest: down the ladder first)
    openHarbour();
  });
  el.hWalk.addEventListener('click', () => closeDialog(el.harbour));
  for (const [id, b] of Object.entries(el.hPlaces)) {
    b.addEventListener('click', () => {
      closeDialog(el.harbour, false);
      open(id);
    });
  }
  for (const root of [el.hExits, el.aExits]) {
    root.addEventListener('click', (e) => {
      const b = e.target instanceof Element && e.target.closest('[data-exit]');
      if (b) call(C.leaveDock, b.dataset.exit);
    });
  }
  el.aStay.addEventListener('click', () => closeDialog(el.aboard));

  // ---------------------------------------------------------------------------------------------
  // The town HUD
  // ---------------------------------------------------------------------------------------------
  function walkToPlace(id) {
    if (V4 && view === 'lookout') climbDown({ now: true }); // (a place picked from the nest: down the ladder at once)
    if (view !== 'town' || !town) return false;
    if (!PLACES.includes(id)) return false;
    if (nearPlace() === id) return open(id);
    if (town.goTo(id, { open: true })) {
      const p = town.places.find((q) => q.id === id);
      announce(`Walking to ${p ? p.name : WALK_NAME[id]}.`, el.live);
      return true;
    }
    return open(id); // no way to walk there (never on the real island): go straight in
  }
  el.places.addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-place]');
    if (!b) return;
    walkToPlace(b.dataset.place);
    // a mouse or finger press shouldn't leave keyboard focus on the bar (E and Enter then work at the door)
    if (pointerClick(e)) b.blur();
  });
  el.prompt.addEventListener('click', () => interact());
  el.action.addEventListener('click', () => {
    if (!interact()) announce('Walk up to a door to go in.', el.live);
  });
  el.mute.addEventListener('click', (e) => {
    toggleMute();
    if (pointerClick(e)) el.mute.blur();
  });

  function interact() {
    if (view !== 'town' || !town || activeModal()) return false;
    if (!V4) {
      const id = nearPlace();
      if (!id) return false;
      return open(id);
    }
    // (the Sunset Isles: a chat's next line; else the door, the plot board, the lookout, a talk or a pet, SPEC4 §7.4)
    if (fade) return true;
    if (chat) return nextLine();
    const a = actionHere();
    if (!a) return false;
    if (a.kind === 'place') return open(a.id);
    if (a.kind === 'board') return open('builder', { plot: a.plot });
    if (a.kind === 'lookout') return climb();
    if (a.kind === 'talk') return startChat(a.id);
    if (a.kind === 'pet') return petAnimal(a.i);
    return false;
  }

  function toggleMute() {
    if (C.toggleMute) call(C.toggleMute);
    else if (C.audio && C.audio.setMuted) call(C.audio.setMuted.bind(C.audio), !C.audio.muted);
    syncMute(true);
    announce(C.audio && C.audio.muted ? 'Sound off.' : 'Sound on.');
  }
  let mutedShown = null;
  function syncMute(force = false) {
    const m = !!(C.audio && C.audio.muted);
    if (!force && m === mutedShown) return;
    mutedShown = m;
    el.mute.classList.toggle('muted', m);
    el.mute.setAttribute('aria-pressed', String(m));
    el.mute.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
  }

  function refreshPrompt(force = false) {
    if (V4) {
      refreshPrompt4(force);
      return;
    }
    const id = view === 'town' && town && !town.auto ? nearPlace() : null;
    if (!force && id === lastPrompt) return;
    lastPrompt = id;
    const p = id && town ? town.places.find((q) => q.id === id) : null;
    if (!p) {
      noPrompt();
      return;
    }
    placePrompt(id, p, force);
  }
  function noPrompt() {
    // (focus on the prompt as he walks away: onto the town region, not lost to the page)
    if (document.activeElement === el.prompt) focus(el.town);
    show(el.prompt, false);
    el.action.setAttribute('aria-disabled', 'true');
    el.action.setAttribute('aria-label', 'Go in (walk up to a door first)');
    el.action.querySelector('.ta-ico').innerHTML = '';
    el.action.querySelector('.ta-label').textContent = 'Go in';
  }
  function placePrompt(id, p, force) {
    const verb = PROMPT_VERB[id] || 'Go in';
    const say = VERB_SAY[id] || 'go in';
    el.prompt.innerHTML = touch()
      ? `<span class="tp-name">${esc(p.name)}</span><span class="tp-sep" aria-hidden="true"> — </span><span class="tp-key">${verb}</span>`
      : `<span class="tp-name">${esc(p.name)}</span><span class="tp-sep" aria-hidden="true"> — </span><span class="tp-key"><kbd>Enter</kbd><span aria-hidden="true"> &#9166;</span></span>`;
    // its name spelled out (the visible " — " between the two parts is decoration)
    el.prompt.setAttribute('aria-label', touch() ? `${p.name}: ${verb}` : `${p.name}: press Enter to ${say}`);
    show(el.prompt, true);
    el.action.setAttribute('aria-disabled', 'false');
    el.action.setAttribute('aria-label', `${verb}: ${p.name}`);
    el.action.querySelector('.ta-ico').innerHTML = ICONS[id] || '';
    el.action.querySelector('.ta-label').textContent = id === 'ship' ? 'Aboard' : verb;
    if (!force) announce(touch() ? `${p.name}. Tap ${verb}.` : `${p.name}. Press E or Enter to ${say}.`, el.live);
  }
  // (the Sunset Isles) the door's prompt, else a plot board's ("Build here: Treehouse"), the lookout's, a talk ("Talk to
  // Ada") or a pet (SPEC4 §7.4, §8.5, §6.7); the first plot board and the first islander in reach say their one-time
  // tip in the prompt (§8.4) until he walks on
  function refreshPrompt4(force = false) {
    const a = view === 'town' ? actionHere() : null;
    const key = a ? a.key : null;
    if (!force && key === lastPrompt) return;
    if (key !== lastPrompt) tipNow = 0;
    lastPrompt = key;
    if (!a) {
      noPrompt();
      return;
    }
    if (a.kind === 'place') {
      placePrompt(a.id, town.places.find((q) => q.id === a.id), force);
      return;
    }
    const verb = V4_VERB[a.kind];
    const say = V4_SAY[a.kind];
    const long = a.kind === 'board' ? `Build here: ${a.name}` : a.kind === 'talk' ? `Talk to ${a.name}` : a.kind === 'pet' ? `Pet ${a.name}` : a.name;
    const T = a.kind === 'talk' ? WORDS4.tips.talk : a.kind === 'board' ? WORDS4.tips.build : null;
    if (T && !tipNow && tipFirst(T.bit)) {
      tipNow = T.bit;
      markTip(T.bit);
    }
    const tip = T && tipNow === T.bit ? T : null;
    el.prompt.innerHTML = touch()
      ? `<span class="tp-name">${esc(a.name)}</span><span class="tp-sep" aria-hidden="true"> — </span><span class="tp-key">${tip ? esc(tip.touch) : verb}</span>`
      : `<span class="tp-name">${esc(long)}</span><span class="tp-sep" aria-hidden="true"> — </span><span class="tp-key">${tip ? tip.keys : '<kbd>E</kbd>'}</span>`;
    el.prompt.setAttribute('aria-label', touch() ? `${long}: ${verb}` : `${long}: press E to ${say}`);
    show(el.prompt, true);
    el.action.setAttribute('aria-disabled', 'false');
    el.action.setAttribute('aria-label', `${verb}: ${a.name}`);
    el.action.querySelector('.ta-ico').innerHTML = a.kind === 'board' ? ICONS.builder : V4_ICONS[a.kind] || '';
    el.action.querySelector('.ta-label').textContent = verb;
    if (!force) announce(touch() ? `${long}. Tap ${verb}.` : `${long}. Press E to ${say}.`, el.live);
  }

  function renderChests(force = false) {
    const p = purseNow();
    if (!force && p === shownPurse) return;
    const bumped = shownPurse >= 0 && p !== shownPurse;
    shownPurse = p;
    for (const b of chestGold) if (b.textContent !== String(p)) b.textContent = String(p);
    if (bumped) {
      for (const c of [el.wChest, el.tChest]) {
        c.classList.remove('bump');
        void c.offsetWidth;
        c.classList.add('bump');
      }
    }
    if (view === 'tailor') renderWardrobe();
    if (view === 'tavern') renderTavern();
    // (the quiz panel's own chest waits for its coin to land after a round: refreshed on the map and in a round)
    if (view === 'build' && buildPanel) buildPanel.refresh();
    if (view === 'quiz' && quizPanel && quizPanel.api.mode !== 'results') quizPanel.refresh();
  }

  // townsfolk farther than 40 from the lens are hidden, and those right at it (in the panel views,
  // anyone within a few steps of the lens would fill the picture)
  const cullNow = () => {
    const env = envNow();
    if (env && env.cull && C.camera) call(env.cull.bind(env), C.camera.position.x, C.camera.position.z, 40, view === 'town' ? 1.0 : 2.6);
  };

  // speech bubbles over the townsfolk (who: town.js's greeter, { villager?, home?, npc? }, SPEC3 §8.4)
  function greetLine(who = null) {
    const look = lookNow() || { cap: {} };
    const feats = featsNow() || {};
    if (KRAKEN && who && who.npc && NPC_LINES[who.npc]) {
      const say = NPC_LINES[who.npc];
      return say[Math.floor(Math.random() * say.length)];
    }
    const villager = KRAKEN && !!(who && who.villager);
    const lines = villager ? [VILLAGER_LINES.house, VILLAGER_LINES.house, 'Ahoy, Captain!'] : ['Ahoy, Captain!', 'Fair winds, Captain!', "Lovely day for it, Cap'n!"];
    const coat = ITEMS[`coat.${look.cap && look.cap.coat}`];
    if (coat && (coat.price || coat.trophy)) lines.push("Fine coat, Cap'n!", "Fine coat, Cap'n!", "Fine coat, Cap'n!");
    const pet = look.cap && look.cap.pet;
    if (pet === 'octopus') lines.push('Is that a baby kraken?!', 'Is that a baby kraken?!', 'Is that a baby kraken?!');
    else if (pet && pet !== 'none') lines.push('Is that a parrot?!', 'Is that a parrot?!', 'Is that a parrot?!');
    if (feats.captures > 0) lines.push('Heard you took a prize!', 'Heard you took a prize!', 'Heard you took a prize!');
    if (villager) {
      if (tierOf(islandNow(), 'bakery') >= 1) lines.push(VILLAGER_LINES.bakery, VILLAGER_LINES.bakery, VILLAGER_LINES.bakery);
      if (feats.kraken >= 1) lines.push(VILLAGER_LINES.kraken, VILLAGER_LINES.kraken, VILLAGER_LINES.kraken);
    }
    return lines[Math.floor(Math.random() * lines.length)];
  }
  function placeBubble(at, node = bubble) {
    if (!at || !C.camera) {
      node.classList.add('hidden');
      return;
    }
    const cam = C.camera;
    const v = cam.position.clone().set(at.x, at.y, at.z).project(cam);
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1 || v.y > 1.2) {
      node.classList.add('hidden');
      return;
    }
    const x = ((v.x + 1) / 2) * W;
    const y = ((1 - v.y) / 2) * H;
    node.classList.remove('hidden');
    // kept on screen: a speaker near the edge gets the bubble slid in, its tail still pointing at them
    const half = node.offsetWidth / 2;
    const bx = half && W > 2 * half + 16 ? Math.min(Math.max(x, half + 8), W - half - 8) : x;
    const tail = Math.max(-half + 16, Math.min(half - 16, x - bx));
    node.style.setProperty('--tail', `${Math.round(tail)}px`);
    node.style.transform = `translate(${Math.round(bx)}px, ${Math.round(y)}px) translate(-50%, calc(-100% - 12px))`;
  }
  // "Thank you, Captain!" over the porch wavers (sparrow's env.wavers: world { x, top, z } each), above the two of
  // them, while they wave; in the build view (the plot framed beside the panel) or the town
  function placeThanks() {
    if (!thanks) return;
    const env = envNow();
    const host = view === 'build' ? el.build : view === 'town' ? el.town : null;
    let list = null;
    try {
      list = host && env && 'wavers' in env ? env.wavers : null;
    } catch {
      list = null;
    }
    const at = Array.isArray(list) ? list.filter((w) => w && [w.x, w.top, w.z].every(Number.isFinite)) : [];
    if (!at.length) {
      if (!thanks.classList.contains('hidden')) thanks.classList.add('hidden');
      return;
    }
    if (thanks.parentNode !== host) host.insertBefore(thanks, host.firstChild);
    const n = at.length;
    placeBubble({ x: at.reduce((a, w) => a + w.x, 0) / n, y: Math.max(...at.map((w) => w.top)), z: at.reduce((a, w) => a + w.z, 0) / n }, thanks);
  }

  // ---------------------------------------------------------------------------------------------
  // Polly's: the wardrobe panel
  // ---------------------------------------------------------------------------------------------
  function setTab(name, focusTab = true) {
    const next = name === 'crew' ? 'crew' : 'captain';
    bought = null;
    if (next !== tab && trial) revertTrial(true);
    tab = next;
    el.wTabs.forEach((t, i) => {
      const on = (i === 1) === (tab === 'crew');
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    el.wCap.hidden = tab !== 'captain';
    el.wCrew.hidden = tab !== 'crew';
    const body = el.wPanel.querySelector('.dock-body');
    if (body) body.scrollTop = 0;
    if (view === 'tailor' && town) {
      if (tab === 'crew' && !lineupOn) {
        lineupOn = true;
        town.setLineup(lineupOpts(lookNow()));
      }
      town.setPanel('tailor', el.wPanel, tab === 'crew' ? 'lineup' : 'captain');
    }
    renderWardrobe();
    if (focusTab) focus(el.wTabs[tab === 'crew' ? 1 : 0]);
  }
  el.wTabs.forEach((t, i) => {
    t.addEventListener('click', () => setTab(i === 1 ? 'crew' : 'captain'));
    t.addEventListener('keydown', (e) => {
      let j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') j = 1 - i;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = 1;
      if (j < 0) return;
      e.preventDefault();
      e.stopPropagation();
      setTab(j === 1 ? 'crew' : 'captain');
    });
  });

  function renderWardrobe() {
    const look = lookNow();
    const feats = featsNow();
    const purse = purseNow();
    if (!look) return;
    for (const [id, b] of itemBtns) {
      const it = ITEMS[id];
      const st = itemState(look, feats, purse, id);
      if (!st) continue;
      const trying = trial === id;
      // the state line (what is worn shows by aria-pressed and the tick badge)
      const label = trying ? 'Trying on' : st.label;
      const stateEl = b.querySelector('.wi-state');
      if (stateEl.textContent !== label) {
        stateEl.textContent = label;
        if (st.locked) stateEl.insertAdjacentHTML('afterbegin', LOCK_SVG);
      }
      const pressed = st.worn && !(trial && ITEMS[trial].slot === it.slot);
      b.setAttribute('aria-pressed', String(pressed));
      b.setAttribute('aria-disabled', String(st.locked));
      b.classList.toggle('trying', trying);
      b.classList.toggle('locked', st.locked);
      b.classList.toggle('priced', !st.owned && !st.locked);
      b.classList.toggle('poor', !st.owned && !st.locked && !st.affordable);
      if (id === 'shirt.paint') {
        const paint = hullPaint();
        const c1 = paint && Number.isInteger(paint.top) ? hex(paint.top) : hex(it.swatch[0]);
        const c2 = paint && Number.isInteger(paint.bottom) ? hex(paint.bottom) : hex(it.swatch[1] ?? it.swatch[0]);
        const chip = b.querySelector('.chip');
        chip.style.setProperty('--c1', c1);
        chip.style.setProperty('--c2', c2);
      }
    }
    for (const [slot, g] of groupEls) {
      const t = trial && ITEMS[trial].slot === slot ? ITEMS[trial] : null;
      const done = !t && bought && bought.slot === slot ? ITEMS[bought.id] : null;
      show(g.buyWrap, !!(t || done));
      g.buyBtn.classList.toggle('done', !!done);
      if (done) {
        g.buyBtn.dataset.buyItem = '';
        const text = `Bought ${done.name}`;
        if (g.buyBtn.dataset.text !== text) {
          g.buyBtn.dataset.text = text;
          g.buyBtn.innerHTML = `<span class="tick" aria-hidden="true">&#10003;</span><span>Bought ${esc(done.name)}!</span>`;
        }
        g.buyBtn.setAttribute('aria-disabled', 'true');
        g.why.textContent = '';
        continue;
      }
      if (!t) continue;
      const st = itemState(look, feats, purse, t.id);
      const poor = !st.affordable;
      g.buyBtn.dataset.buyItem = t.id;
      const text = `Buy ${t.name} — ${t.price} gold`;
      if (g.buyBtn.dataset.text !== text) {
        g.buyBtn.dataset.text = text;
        g.buyBtn.innerHTML = `<span class="coin" aria-hidden="true"></span><span>Buy ${esc(t.name)} — ${t.price} gold</span>`;
      }
      g.buyBtn.setAttribute('aria-disabled', String(poor));
      g.why.textContent = poor ? `Need ${t.price - purse} more gold` : '';
    }
    el.wSurprise.setAttribute('aria-label', tab === 'crew' ? 'Surprise me! A random free uniform for the crew' : 'Surprise me! A random free look for the captain');
  }

  function revertTrial(say = true, silent = false) {
    const id = trial;
    trial = null;
    if (!id) return;
    if (!silent) applyLook();
    if (say) announce(`The ${ITEMS[id].name.replace(/^the /i, '')} goes back on the rack.`, el.wLive);
  }

  function clickItem(id) {
    const it = ITEMS[id];
    if (!it || view !== 'tailor') return false;
    // the second click of a double-click on Buy lands here: not a new choice
    if (lastBuy.id && performance.now() - lastBuy.at < BUY_GUARD) return false;
    bought = null;
    const look = lookNow();
    const st = itemState(look, featsNow(), purseNow(), id);
    if (!st) return false;
    if (st.locked) {
      announce(`${it.name}: ${st.lockText}.`, el.wLive);
      return false;
    }
    const crew = it.group === 'crew';
    if (st.owned) {
      const hadTrial = trial && ITEMS[trial].slot === it.slot;
      if (hadTrial) trial = null;
      if (st.worn && !hadTrial) {
        announce(`${SLOT_NAMES[it.slot]}: ${it.name}. Already wearing it.`, el.wLive);
        return true;
      }
      const r = C.wardrobe ? call(C.wardrobe.wear, id) : null;
      if (!r || !r.ok) {
        if (hadTrial) applyLook();
        announce(`Can't wear ${it.name} right now.`, el.wLive);
        return false;
      }
      applyLook({ crew });
      if (town) town.cheer(crew ? 'lineup' : 'captain', 1.3);
      announce(`${SLOT_NAMES[it.slot]}: ${it.name}.`, el.wLive);
      return true;
    }
    // a priced item: try it on
    trial = id;
    applyLook();
    // (its Buy row now shows above the group's items and pushes the focused item down: both kept in view,
    // the focused item first when the panel is too short for both)
    const b = itemBtns.get(id);
    if (b && document.activeElement === b) {
      const g = groupEls.get(it.slot);
      if (g && g.buyWrap.scrollIntoView) g.buyWrap.scrollIntoView({ block: 'nearest' });
      if (b.scrollIntoView) b.scrollIntoView({ block: 'nearest' });
    }
    if (town) town.cheer(crew ? 'lineup' : 'captain', 0.9);
    announce(
      st.affordable
        ? `Trying on ${it.name}. Buy it for ${it.price} gold with the Buy button above ${SLOT_NAMES[it.slot]}.`
        : `Trying on ${it.name}. It costs ${it.price} gold: you need ${it.price - purseNow()} more.`,
      el.wLive
    );
    return true;
  }

  function buyTrial(id = trial, e = null) {
    if (!id || view !== 'tailor' || id !== trial) return false;
    const it = ITEMS[id];
    const now = performance.now();
    const at = e && e.timeStamp > 0 && e.timeStamp <= now ? e.timeStamp : now;
    if (lastBuy.id === id && ((e && e.detail > 1) || at - lastBuy.at < BUY_GUARD)) return false;
    const st = itemState(lookNow(), featsNow(), purseNow(), id);
    if (!st.affordable) {
      announce(`${it.name} costs ${it.price} gold. You need ${it.price - purseNow()} more gold.`, el.wLive);
      lastBuy = { id: '', at: -Infinity };
      return false;
    }
    const r = C.wardrobe ? call(C.wardrobe.buy, id) : null;
    if (!r || !r.ok) {
      announce(`Couldn't buy ${it.name}.`, el.wLive);
      lastBuy = { id: '', at: -Infinity };
      return false;
    }
    lastBuy = { id, at: performance.now() };
    trial = null;
    bought = { slot: it.slot, id };
    const crew = it.group === 'crew';
    applyLook({ crew });
    renderChests();
    sfx('coin');
    setTimeout(() => sfx('coin', { pitch: 1.25 }), 110);
    if (town) {
      const c = town.captain;
      const spot = crew && town.lineup.length ? town.lineup[1].position : c.mesh ? c.mesh.position : null;
      if (spot) town.sparkle(spot.x, spot.y + 1.8, spot.z);
      town.cheer('all', 1.6);
    }
    const env = envNow();
    if (env && env.cheer) call(env.cheer.bind(env), 'polly', 1.6);
    announce(`Bought ${it.name}! ${SLOT_NAMES[it.slot]}: ${it.name}.`, el.wLive);
    // (focus stays on the button, which now says "Bought")
    return true;
  }

  function surpriseMe() {
    if (view !== 'tailor') return false;
    bought = null;
    if (trial) revertTrial(false, true);
    const before = lookNow();
    const next = surprise(before, tab, Math.random);
    if (C.look && C.look.set) call(C.look.set, next);
    const after = lookNow() || next;
    const changed = SLOTS[tab].filter((s) => (tab === 'crew' ? before.crew[s] !== after.crew[s] : before.cap[s] !== after.cap[s]));
    applyLook({ crew: tab === 'crew' });
    if (town) town.cheer(tab === 'crew' ? 'lineup' : 'captain', 1.4);
    const rec = tab === 'crew' ? after.crew : after.cap;
    const words = changed.map((s) => `${SLOT_NAMES[s]}: ${ITEMS[`${s}.${rec[s]}`].name}`).join(', ');
    announce(`Surprise! ${words}.`, el.wLive);
    return true;
  }

  for (const root of [el.wCap, el.wCrew]) {
    root.addEventListener('click', (e) => {
      const t = e.target instanceof Element ? e.target : null;
      const buyBtn = t && t.closest('[data-buy-item]');
      if (buyBtn) {
        buyTrial(buyBtn.dataset.buyItem, e);
        return;
      }
      const b = t && t.closest('[data-item]');
      if (b) clickItem(b.dataset.item);
    });
  }
  el.wSurprise.addEventListener('click', () => surpriseMe());
  el.wBack.addEventListener('click', () => back());
  el.tBack.addEventListener('click', () => back());
  // A held Enter or Space presses a button again on every auto-repeat, and the key that opened a panel or a
  // dialog (at a door, at the gangplank) is still held when focus lands on its first button there: one press
  // is one purchase, one choice (a repeat that is cancelled doesn't arm the button, so its key-up won't click).
  for (const p of [el.wPanel, el.tPanel, el.harbour, el.aboard, el.town]) {
    p.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.repeat && e.target instanceof HTMLButtonElement) e.preventDefault();
    });
  }

  // ---------------------------------------------------------------------------------------------
  // The Salty Sparrow: crew upgrades, the rumour board, the captain's log
  // ---------------------------------------------------------------------------------------------
  function renderTavern() {
    const cfg = armoryNow();
    lastArmory = JSON.stringify(cfg);
    const purse = purseNow();
    for (const li of el.tList.children) {
      const id = li.dataset.id;
      const u = ARMORY.find((x) => x.id === id);
      if (!u) continue;
      const tier = cfg.up[id] || 0;
      const max = armoryMaxTier(id);
      const cost = armoryNextCost(cfg, id);
      const pips = li.querySelector('.pips');
      if (pips.children.length !== max) pips.innerHTML = '<i></i>'.repeat(max);
      [...pips.children].forEach((p, i) => p.classList.toggle('on', i < tier));
      pips.setAttribute('aria-label', `Upgraded ${tier} of ${max}`);
      li.querySelector('.up-values').innerHTML =
        cost === null
          ? `<b>${esc(armoryStatText(id, tier))}</b> <span class="up-max">(best)</span>`
          : `<b>${esc(armoryStatText(id, tier))}</b> <span class="arrow" aria-hidden="true">&rarr;</span><span class="sr-only"> next: </span> <b class="up-next">${esc(armoryStatText(id, tier + 1))}</b>`;
      const btn = li.querySelector('.buy-btn');
      const why = li.querySelector('.up-why');
      let reason = '';
      if (cost === null) {
        btn.innerHTML = '<span class="buy-word">Maxed</span>';
        btn.setAttribute('aria-label', `${u.name}: maxed`);
        reason = 'Fully trained';
      } else {
        btn.innerHTML = `<span class="buy-word">Buy</span><span class="buy-cost"><span class="coin" aria-hidden="true"></span>${cost}</span>`;
        btn.setAttribute('aria-label', `Buy ${cost} gold: ${u.name}`);
        if (purse < cost) reason = `Need ${cost - purse} more gold`;
      }
      btn.setAttribute('aria-disabled', String(!!reason));
      btn.classList.toggle('maxed', cost === null);
      why.textContent = reason;
      li.classList.toggle('maxed', cost === null);
      li.classList.toggle('poor', cost !== null && !!reason);
    }
    if (KRAKEN) renderPowder();
  }

  // The Powder room's rows: owned, on sale (Buy), too poor, not on sale yet (and why), or refused by storage
  function renderPowder() {
    const own = powderNow().own;
    const unlocked = unlockedNow();
    const purse = purseNow();
    const extra = perks(islandNow()).extraLoads || 0;
    lastPowder = JSON.stringify(own);
    for (const li of el.pList.children) {
      const id = li.dataset.powderRow;
      if (!SPECIAL_IDS.includes(id)) continue;
      const name = SPECIAL[id].name;
      const price = RECIPES[id].price;
      const owned = own[id] === 1;
      const sale = onSale(id, unlocked);
      const loads = LOADS.base + extra;
      const vals = li.querySelector('.up-values');
      const valHTML = `<b>${loads} loads</b> every level start${extra ? ` <span class="up-extra">(Windmill +${extra})</span>` : ''}`;
      if (vals.innerHTML !== valHTML) vals.innerHTML = valHTML;
      const btn = li.querySelector('.buy-btn');
      const why = li.querySelector('.up-why');
      let reason = '';
      let html;
      if (owned) {
        html = '<span class="tick" aria-hidden="true">&#10003;</span><span class="buy-word">Owned</span>';
        btn.setAttribute('aria-label', `${name} recipe: owned`);
        reason = touch() ? 'Tap Ammo in battle' : `Press ${SPECIAL[id].key} in battle`;
      } else if (!sale) {
        html = `${LOCK_SVG}<span class="buy-word">Soon</span><span class="buy-cost"><span class="coin" aria-hidden="true"></span>${price}</span>`;
        btn.setAttribute('aria-label', `${name} recipe, ${price} gold: not on sale yet`);
        reason = WORDS3.locked(id);
      } else {
        html = `<span class="buy-word">Buy</span><span class="buy-cost"><span class="coin" aria-hidden="true"></span>${price}</span>`;
        btn.setAttribute('aria-label', `Buy ${price} gold: ${name} recipe`);
        if (powderRefused.has(id)) reason = "Couldn't save: your browser's storage is full or switched off";
        else if (purse < price) reason = `Need ${price - purse} more gold`;
      }
      if (btn.dataset.html !== html) {
        btn.dataset.html = html;
        btn.innerHTML = html;
      }
      // (out of reach stays focusable, aria-disabled, with the reason beside it: no hidden traps)
      btn.setAttribute('aria-disabled', String(owned || !!reason));
      btn.classList.toggle('maxed', owned);
      why.textContent = reason;
      li.classList.toggle('maxed', owned);
      li.classList.toggle('locked', !owned && !sale);
      li.classList.toggle('poor', !owned && sale && !!reason);
    }
  }

  /** Buy a recipe in the Powder room: main writes the powder record first and the chest second (SPEC3 §0.1). */
  function buyPowder(id, e = null) {
    if (!KRAKEN || view !== 'tavern' || !SPECIAL_IDS.includes(id)) return false;
    const now = performance.now();
    const at = e && e.timeStamp > 0 && e.timeStamp <= now ? e.timeStamp : now;
    if (lastBuy.id === `powder.${id}` && ((e && e.detail > 1) || at - lastBuy.at < BUY_GUARD)) return false;
    const name = SPECIAL[id].name;
    const price = RECIPES[id].price;
    const pre = buyRecipe(powderNow(), purseNow(), id, unlockedNow());
    const no = (text) => {
      announce(text, el.tLive);
      lastBuy = { id: '', at: -Infinity };
      return false;
    };
    if (!pre.ok) {
      if (pre.reason === 'owned') return no(`You have the ${name} recipe. Its loads refill at every level start.`);
      if (pre.reason === 'locked') return no(`${WORDS3.locked(id)}.`);
      if (pre.reason === 'poor') return no(`The ${name} recipe costs ${price} gold. You need ${price - purseNow()} more gold.`);
      return no(`Couldn't buy the ${name} recipe.`);
    }
    const r = C.powder ? call(C.powder.buy && C.powder.buy.bind(C.powder), id) : undefined;
    const ok = r === true || (r && r.ok === true);
    if (!ok) {
      const reason = r && typeof r === 'object' ? r.reason : r === false ? 'storage' : null;
      if (reason === 'storage') {
        powderRefused.add(id);
        renderTavern();
        return no("Couldn't save: your browser's storage is full or switched off. Nothing was paid.");
      }
      renderTavern();
      return no(`Couldn't buy the ${name} recipe.`);
    }
    powderRefused.delete(id);
    lastBuy = { id: `powder.${id}`, at: performance.now() };
    // the docked ship shows a keg for every recipe owned (ships.js `powder`): built again with the new one
    if (!(r && r.rebuilt)) call(C.rebuildShip);
    renderTavern();
    renderChests();
    renderRumour();
    sfx('coin');
    setTimeout(() => sfx('coin', { pitch: 1.25 }), 110);
    if (town && town.captain.mesh) {
      const p = town.captain.mesh.position;
      town.sparkle(p.x, p.y + 1.9, p.z);
      town.cheer('captain', 1.5);
    }
    const loads = LOADS.base + (perks(islandNow()).extraLoads || 0);
    announce(`Bought the ${name} recipe! ${loads} loads at every level start: ${touch() ? 'tap Ammo' : `press ${SPECIAL[id].key}`} in battle.`, el.tLive);
    return true;
  }

  function buyArmory(id, e = null) {
    if (view !== 'tavern') return false;
    const u = ARMORY.find((x) => x.id === id);
    if (!u) return false;
    const now = performance.now();
    const at = e && e.timeStamp > 0 && e.timeStamp <= now ? e.timeStamp : now;
    if (lastBuy.id === `armory.${id}` && ((e && e.detail > 1) || at - lastBuy.at < BUY_GUARD)) return false;
    const cfg = armoryNow();
    const cost = armoryNextCost(cfg, id);
    if (cost === null) {
      announce(`${u.name} is fully trained.`, el.tLive);
      lastBuy = { id: '', at: -Infinity };
      return false;
    }
    if (purseNow() < cost) {
      announce(`${u.name} costs ${cost} gold. You need ${cost - purseNow()} more gold.`, el.tLive);
      lastBuy = { id: '', at: -Infinity };
      return false;
    }
    const r = C.armory ? call(C.armory.buy, id) : false;
    const ok = r === true || (r && r.ok === true);
    if (!ok) {
      announce(`Couldn't buy ${u.name}.`, el.tLive);
      lastBuy = { id: '', at: -Infinity };
      return false;
    }
    lastBuy = { id: `armory.${id}`, at: performance.now() };
    renderTavern();
    renderChests();
    renderLog();
    sfx('coin');
    setTimeout(() => sfx('coin', { pitch: 1.25 }), 110);
    if (town && town.captain.mesh) {
      const p = town.captain.mesh.position;
      town.sparkle(p.x, p.y + 1.9, p.z);
      town.cheer('captain', 1.5);
    }
    const tier = armoryNow().up[id] || 0;
    announce(`Bought ${u.name}. ${u.stat}: ${armoryStatText(id, tier)}.${id === 'boarders' ? ' New hands join at the next level start.' : ''}`, el.tLive);
    return true;
  }
  el.tList.addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-armory]');
    if (b) buyArmory(b.dataset.armory, e);
  });
  if (KRAKEN) {
    el.pList.addEventListener('click', (e) => {
      const b = e.target instanceof Element && e.target.closest('[data-powder]');
      if (b) buyPowder(b.dataset.powder, e);
    });
  }

  function renderRumour() {
    const r = call(C.rumour) || null;
    const title = r && (r.title || r.name);
    let lines = r && Array.isArray(r.lines) ? r.lines.filter((x) => typeof x === 'string') : [];
    if (!lines.length && title && OLD_RUMOURS[title]) lines = OLD_RUMOURS[title];
    const ammo = r && AMMO_NAMES[r.ammo] ? AMMO_NAMES[r.ammo] : null;
    // the Powder room's tips, once that recipe is owned (SPEC3 §2.2: the only two immunities, said before a fight)
    const own = KRAKEN ? powderNow().own : null;
    const tips = own ? SPECIAL_IDS.filter((id) => own[id] === 1 && WORDS3.powderTip[id]).map((id) => WORDS3.powderTip[id]) : [];
    const tipHTML = tips.map((l) => `<p class="rumour-line rumour-tip">${esc(l)}</p>`).join('');
    el.tRumour.innerHTML =
      '<h3 class="tav-h">Rumour board</h3>' +
      (title
        ? `<div class="rumour-note"><p class="rumour-title">Next voyage: <b>${esc(title)}</b></p>` +
          lines.map((l) => `<p class="rumour-line">${esc(l)}</p>`).join('') +
          (ammo ? `<p class="rumour-ammo">Bring: <b>${esc(ammo)}</b></p>` : '') +
          tipHTML +
          '</div>'
        : `<div class="rumour-note"><p class="rumour-line">No news today. The regulars are arguing about seagulls.</p>${tipHTML}</div>`);
  }

  function renderLog() {
    const f = featsNow() || {};
    const n = (k) => (Number.isFinite(f[k]) ? f[k] : 0);
    const rows = [
      ['Ships captured', n('captures')],
      ['Boardings fought', n('boardings')],
      ['Raking shots', n('rakes')],
      ['Critical hits', n('crits')],
    ];
    const trophies = Object.values(ITEMS).filter((it) => it.trophy && !hiddenItem(it.id));
    const extra = call(C.log);
    el.tLog.innerHTML =
      '<h3 class="tav-h">Captain\'s log</h3>' +
      `<dl class="log-stats">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>` +
      (Array.isArray(extra) && extra.length ? `<ul class="log-extra">${extra.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '') +
      '<h4 class="log-sub">Trophies to win</h4><ul class="log-trophies">' +
      trophies
        .map((it) => {
          const have = Math.min(n(it.trophy.feat), it.trophy.min);
          const won = have >= it.trophy.min;
          return (
            `<li class="${won ? 'won' : ''}"><span class="lt-mark" aria-hidden="true">${won ? '&#10003;' : '&#9733;'}</span>` +
            `<span class="lt-text">${esc(it.name)}: ${have} of ${it.trophy.min} ${esc(it.trophy.unit)}${won ? ' <b>(won!)</b>' : ''}</span></li>`
          );
        })
        .join('') +
      '</ul>';
  }

  // ---------------------------------------------------------------------------------------------
  // The Riddle Bell's and Builder Bess's 3D side (SPEC3 §7.3, §8.3)
  // ---------------------------------------------------------------------------------------------
  // The quiz panel's moments, on the 3D set beside it: the captain cheers a right answer and his new stars (a
  // sparkle over his hat); sparrow's professor rings the bell / Quizzle tilts his head where it can
  // (env.npcReact, a no-op until sparrow has it).
  function quizReact(what, info) {
    if (view !== 'quiz' || !town) return;
    const env = envNow();
    const npc = (who, act, secs) => env && typeof env.npcReact === 'function' && call(env.npcReact.bind(env), who, act, secs);
    const sparkleCap = () => {
      const m = town.captain.mesh;
      if (m) town.sparkle(m.position.x, m.position.y + 2.0, m.position.z);
    };
    if (what === 'right') {
      npc('barnacle', 'ring', 1.6);
      town.cheer('captain', 1.2);
    } else if (what === 'wrong') {
      npc('barnacle', 'tilt', 1.2);
    } else if (what === 'results') {
      const stars = info && Number.isFinite(info.stars) ? info.stars : 0;
      if (stars > 0) {
        npc('barnacle', 'ring', 2);
        town.cheer('captain', 1.8);
        sparkleCap();
      }
    } else if (what === 'open' || what === 'map') {
      town.setPanel('quiz', el.qPanel, 'captain'); // (the bell and the professor beside the panel again)
    }
  }

  // A plot's box (its platform's footprint, as tall as the building that stands there now), for framing it
  function plotBox(info) {
    if (!info || !Number.isFinite(info.x) || !Number.isFinite(info.z)) return null;
    const w = (Number.isFinite(info.w) ? info.w : 4) / 2;
    const d = (Number.isFinite(info.d) ? info.d : 4) / 2;
    const ry = Number.isFinite(info.ry) ? info.ry : 0;
    const y0 = Number.isFinite(info.y) ? info.y : 1.3;
    const H = Number.isFinite(info.height) ? info.height : 6;
    const tier = Number.isInteger(info.tier) ? Math.max(0, Math.min(3, info.tier)) : 0;
    // (as tall as what stands there: today's shack about 4.6 u, then the tiers up to the plot's full height)
    const y1 = y0 + Math.max(3.6, [Math.min(H, 4.6), H * 0.7, H * 0.85, H][tier]);
    const c = Math.cos(ry);
    const sn = Math.sin(ry);
    const out = [];
    for (const [lx, lz] of [[-w, -d], [w, -d], [w, d], [-w, d]]) {
      const x = info.x + lx * c + lz * sn;
      const z = info.z - lx * sn + lz * c;
      out.push([x, y0, z], [x, y1, z]);
    }
    return out;
  }
  /** The build view's camera glides to a plot (sparrow's plotPose), framed beside the panel; a cut under reduced
   * motion. The lens backs off (town.js) where a phone's bottom sheet leaves too little room for it. (The Sunset Isles:
   * while its construction scene runs, the pad, the porch where the people moving in wave and the new building's top
   * are framed too, below the scene's strip on a wide screen, SPEC4 §5.2, §5.3.) */
  function focusPlot(id, { cut = false } = {}) {
    if (view !== 'build' || !town) return false;
    // (the Sunset Isles: while a construction scene plays, the camera stays on its plot, whichever row has focus)
    if (V4 && sceneCam && sceneCam.id !== id && sceneRunning()) return false;
    const env = envNow();
    const pose = env && typeof env.plotPose === 'function' ? call(env.plotPose.bind(env), id) : null;
    if (!pose) return false;
    const list = env.plots;
    const info = Array.isArray(list) ? list.find((q) => q && q.id === id) : null;
    let points = plotBox(info) || [pose.target];
    let top = null;
    if (V4 && sceneCam && sceneCam.id === id) {
      points = points.concat(sceneFrame(id));
      top = el.strip;
    }
    const ok = town.setPanel('build', el.bPanel, { pos: pose.pos, target: pose.target, points, fit: true }, { secs: 0.9, cut, top, keepOrbit: !!top });
    if (ok) plotFocus = id;
    return ok;
  }
  // (the Sunset Isles) what a construction scene asks the camera to keep in view (construction.js info.frame: the pad's
  // middle, the porch, the top; world), as points: the porch's people head-high, the top over the pad
  function sceneFrame(id) {
    const S = sceneNow();
    const F = S && S.id === id && S.info && S.info.frame ? S.info.frame : null;
    if (!F) return [];
    const pt = (v) => (Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every(Number.isFinite) ? v : null);
    const out = [];
    const pad = pt(F.pad);
    const porch = pt(F.porch);
    if (pad) out.push([pad[0], pad[1] - 0.1, pad[2]]);
    if (porch) out.push([porch[0], porch[1] - 0.15, porch[2]], [porch[0], porch[1] + 2.1, porch[2]]);
    if (pad && Number.isFinite(F.top)) out.push([pad[0], F.top + 0.4, pad[2]]);
    return out;
  }
  /** The build montage (buildPanel's celebrate): the building goes up on the 3D island (sparrow's scaffold, knocks
   * and spring), the plaque gets the new rank; the villagers move in and everyone cheers when it stands. With the
   * Sunset Isles' panel (opts given): the plot's own record goes to the town (env.setIsland4 for a new plot, else
   * env.setIsland), whose construction scene plays (SPEC4 §5); its length is the panel's, else today's montage. */
  function celebrate(id, tier, opts = null) {
    if (BUILD4 && opts && typeof opts === 'object') return celebrate4(id, tier, opts);
    const env = envNow();
    const cfg = islandNow();
    if (montage) finishMontage();
    if (view === 'build' && plotFocus !== id) focusPlot(id);
    if (env && typeof env.setIsland === 'function') call(env.setIsland.bind(env), cfg, { built: id });
    if (env && typeof env.setRank === 'function') call(env.setRank.bind(env), islandRank(cfg).name);
    montage = { id, tier, t: 0, cfg };
    return montageSecs(env);
  }
  function montageSecs(env) {
    const T = env && env.buildTimes && typeof env.buildTimes === 'object' ? env.buildTimes : MONTAGE_SECS;
    const secs = (Number.isFinite(T.scaffold) ? T.scaffold : MONTAGE_SECS.scaffold) + (Number.isFinite(T.knocks) ? T.knocks : MONTAGE_SECS.knocks) + (Number.isFinite(T.spring) ? T.spring : MONTAGE_SECS.spring);
    return secs + MONTAGE_SECS.cheer;
  }
  function celebrate4(id, tier, opts) {
    const env = envNow();
    if (montage) finishMontage();
    const cfg = islandNow();
    const cfg4 = island4Now();
    const isNew = PLOTS4.some((p) => p.id === id);
    if (isNew) {
      if (env && typeof env.setIsland4 === 'function') call(env.setIsland4.bind(env), cfg4, { built: id });
    } else if (env && typeof env.setIsland === 'function') call(env.setIsland.bind(env), cfg, { built: id });
    if (env && typeof env.setRank === 'function') {
      const r = call(rank4, cfg, cfg4);
      call(env.setRank.bind(env), (r && r.name) || islandRank(cfg).name);
    }
    if (isNew) syncLayers(); // (the Music Hall's band, SPEC4 §4.1)
    montage = { id, tier, t: 0, cfg, scene: false };
    const S = sceneNow();
    if (S && S.running && S.id === id) {
      montage.scene = true;
      startSceneCam(id);
      return sceneLength(opts.kind, reduced());
    }
    // (no scene: sparrow's SPEC3 montage plays)
    if (view === 'build' && plotFocus !== id) focusPlot(id);
    return montageSecs(env);
  }
  /** Watch again (SPEC4 §5.2): the plot's last tier goes up again; nothing changes, nothing is written. Its length, or
   * 0 when sparrow can't start it (a scene running, the plot unbuilt). */
  function replay(id, tier, opts) {
    const env = envNow();
    if (!env || typeof env.replayBuild !== 'function' || montage) return 0;
    if (!call(env.replayBuild.bind(env), id)) return 0;
    montage = { id, tier, t: 0, cfg: islandNow(), scene: true, replay: true };
    startSceneCam(id);
    return sceneLength(opts && opts.kind, reduced());
  }
  // the build view frames the scene: a glide (0.9 s; a cut under reduced motion) to the plot, then the slow orbit
  function startSceneCam(id) {
    sceneCam = { id };
    if (view === 'build') focusPlot(id);
  }
  function stepSceneCam() {
    if (!sceneCam || !town) return;
    const S = sceneNow();
    if (!S || !S.running) {
      sceneCam = null;
      town.setOrbit(0);
      return;
    }
    if (view !== 'build') return;
    const c = call(cameraAt, S.t, S.kind, reduced());
    town.setOrbit(c && Number.isFinite(c.orbit) ? c.orbit : 0);
  }
  function skipCelebration() {
    const env = envNow();
    if (env && typeof env.finishBuild === 'function') call(env.finishBuild.bind(env));
    // (a construction scene goes on waving for a moment after its skip: it ends when sparrow says so)
    if (!(montage && montage.scene)) finishMontage();
  }
  // The building stands: the new villagers walk out into the town, the plot sparkles, a cheer (once). (After a
  // construction scene the scene had its own cheer and confetti: the new islanders join the town.)
  function finishMontage() {
    const M = montage;
    if (!M) return;
    montage = null;
    const env = envNow();
    const cfg = islandNow();
    if (M.scene) {
      if (sceneCam && town) town.setOrbit(0);
      sceneCam = null;
      if (M.replay) return;
      if (env && typeof env.setVillagers === 'function') call(env.setVillagers.bind(env), islandVillagers(cfg));
      const r = C.islanders && call(C.islanders.roster && C.islanders.roster.bind(C.islanders));
      if (r && env && typeof env.setIslanders === 'function') call(env.setIslanders.bind(env), r, { island4: island4Now() });
      return;
    }
    if (env && typeof env.setVillagers === 'function') call(env.setVillagers.bind(env), islandVillagers(cfg));
    if (view !== 'build') return;
    sfx('cheer');
    if (env && typeof env.npcReact === 'function') call(env.npcReact.bind(env), 'bess', 'cheer', 1.6);
    const info = Array.isArray(env && env.plots) ? env.plots.find((q) => q && q.id === M.id) : null;
    const box = plotBox(info);
    // (over the new building's own top when sparrow knows it, else over the plot's box)
    if (town && box) town.sparkle(info.x, (Number.isFinite(info.top) && info.top > info.y ? info.top : box[1][1]) + 0.4, info.z);
  }
  // sparrow's building still going up (it runs on the game's clock, which a slow frame rate stretches past the build
  // panel's own montage window)
  function montageRunning() {
    const env = envNow();
    if (montage && montage.scene) return sceneRunning();
    return !!(montage && env && env.montage);
  }
  function stepMontage(dt) {
    if (!montage) return;
    montage.t += dt;
    const env = envNow();
    if (montage.scene) {
      // (the construction scene over, or never heard of again: the building stands)
      if (!sceneRunning() || montage.t > SCENE_FINISH_MAX) finishMontage();
      return;
    }
    // (sparrow's own montage over, or none started: the building stands)
    if (!env || !env.montage || montage.t > 12) finishMontage();
  }

  // ---------------------------------------------------------------------------------------------
  // The Sunset Isles ashore (SPEC4 §5.2, §6.7, §7.4, §8.5, §8.7): plot boards, talk and pet, the Island map and hops,
  // district toasts, the lookout, the construction scene's camera, the town band, the Sea Guide. Every env member is
  // read defensively (sparrow's v4 seam; absent: nothing happens), so a partial ctx or env is today's town.
  // ---------------------------------------------------------------------------------------------
  const envGet = (k) => {
    const env = envNow();
    try {
      return env ? env[k] : undefined;
    } catch {
      return undefined; // (a throwing getter counts as missing)
    }
  };
  const folk4 = () => {
    const v = envGet('v4');
    return v && v.folk ? v.folk : null;
  };
  const critters = () => envGet('critters') || null;
  const capNow = () => (town ? { x: town.captain.x, y: town.captain.y, z: town.captain.z, h: town.captain.h } : null);
  function sceneNow() {
    const s = envGet('scene');
    return s && typeof s === 'object' ? s : null;
  }
  const sceneRunning = () => {
    const S = sceneNow();
    return !!(S && S.running);
  };
  // a hop, a ride or the lookout's climb waits for the building to stand (SPEC4 §8.5)
  const busyBuilding = () => sceneRunning() || !!(montage && montageRunning());
  const plotRow = (id) => PLOTS.find((p) => p.id === id) || PLOTS4.find((p) => p.id === id) || null;
  const islanderRow = (id) => ISLANDERS.find((p) => p.id === id) || null;
  function islanderName(id) {
    const r = islanderRow(id);
    return r ? r.name : String(id);
  }
  function animalName(i) {
    const K = critters();
    const list = K ? call(() => K.list) : null;
    const a = Array.isArray(list) ? list[i] : null;
    if (a && typeof a.name === 'string' && a.name) return a.name;
    return a && typeof a.species === 'string' ? `the ${a.species}` : 'the animal';
  }
  function placeNamed(id) {
    const p = town ? town.places.find((q) => q.id === id) : null;
    return p && p.name ? p.name : id;
  }
  // a plot board this town can serve: any of the 21 with the Sunset Isles' panel, today's ten with today's
  const boardOk = (plot) => !!buildPanel && (BUILD4 ? !!plotRow(plot) : PLOTS.some((p) => p.id === plot));
  // the crow's nest (sparrow env.lookout: its place at the ladder's foot, the nest's view), or null
  function lookoutSpot() {
    const L = envGet('lookout');
    if (!L || !Array.isArray(L.nest) || !L.nest.slice(0, 3).every(Number.isFinite)) return null;
    return L;
  }
  // §8.4: a one-time tip not shown yet (voyage4's `tips`); without the record, no tips
  const tipFirst = (bit) => !!(C.voyage4 && typeof C.voyage4.tip === 'function') && !(tipShown & bit) && !(voyage4Now().tips & bit);
  // ...and shown now: main marks its bit and saves the record
  function markTip(bit) {
    tipShown |= bit;
    call(C.voyage4.tip.bind(C.voyage4), bit);
  }

  /** What the captain can do where he stands (§7.4's order: a door, a plot board, the lookout, then a talk, then a
   * pet), or null. */
  function actionHere() {
    if (view !== 'town' || !town || town.auto || fade) return null;
    const id = nearPlace();
    if (id) {
      if (PLACES.includes(id)) return { kind: 'place', id, key: id };
      if (id.startsWith('plot:') && boardOk(id.slice(5))) return { kind: 'board', id, plot: id.slice(5), name: placeNamed(id), key: id };
      if (id === 'lookout' && lookoutSpot()) return { kind: 'lookout', id, name: placeNamed(id), key: id };
    }
    if (chat) return null;
    const c = capNow();
    const F = folk4();
    const who = F ? call(F.talkTarget, c) : null;
    if (typeof who === 'string' && islanderRow(who)) return { kind: 'talk', id: who, name: islanderName(who), key: `talk:${who}` };
    const K = critters();
    const i = K ? call(K.near, c) : null;
    if (Number.isInteger(i)) return { kind: 'pet', i, name: animalName(i), key: `pet:${i}` };
    return null;
  }

  // ----- talk (§7.4): the islander turns and waves; 2–3 lines in #talk-bubble (read by #town-live), Next for more -----
  /** A chat with islander id: from up close, or from the Island map at once (far: it ends when he walks 3 u from where
   * he stood). False if they can't chat now (not out, or a builder). */
  function startChat(id, { far = false } = {}) {
    if (!V4 || !town || view !== 'town' || !islanderRow(id)) return false;
    const F = folk4();
    const c = capNow();
    if (!F || !call(F.face, id, c)) return false;
    if (chat && chat.id !== id) endChat(false);
    const lines = call(linesFor, id, progressNow(), touch());
    if (!Array.isArray(lines) || !lines.length) {
      call(F.face, id, null);
      return false;
    }
    town.cancelAuto();
    tapGoal = null;
    const w = call(F.where, id);
    const near = w && Math.hypot(w.x - c.x, w.z - c.z) <= TALK.reach + 0.5;
    chat = { id, name: islanderName(id), lines: lines.slice(0, TALK.lines), i: 0, anchor: near && !far ? 'them' : { x: c.x, z: c.z } };
    const env = envNow();
    if (env && typeof env.setChat === 'function') call(env.setChat.bind(env), id);
    // he turns to them (from up close)
    if (near) town.talkTo(w.x, w.z, Math.hypot(w.x - c.x, w.z - c.z));
    showLine();
    return true;
  }
  function showLine() {
    if (!chat) return;
    const text = chat.lines[chat.i];
    const last = chat.i >= chat.lines.length - 1;
    el.talkName.textContent = chat.name;
    el.talkText.textContent = text;
    el.talkNext.textContent = last ? 'Bye!' : 'Next';
    el.talkNext.setAttribute('aria-label', last ? `Say goodbye to ${chat.name}` : `Next: what ${chat.name} says next`);
    show(el.talk, true);
    refreshPrompt(true);
    announce(`${chat.name}: ${text}`, el.live);
  }
  function nextLine() {
    if (!chat) return false;
    if (chat.i >= chat.lines.length - 1) {
      endChat();
      return true;
    }
    chat.i++;
    showLine();
    return true;
  }
  function endChat(refresh = true) {
    if (!chat) return;
    const id = chat.id;
    chat = null;
    const F = folk4();
    if (F) call(F.face, id, null);
    const env = envNow();
    if (env && typeof env.setChat === 'function') call(env.setChat.bind(env), null);
    if (el.talk.contains(document.activeElement)) focus(el.town);
    show(el.talk, false);
    if (refresh) refreshPrompt(true);
  }
  function stepChat() {
    if (!chat || !town) return;
    const c = capNow();
    const F = folk4();
    const w = F ? call(F.where, chat.id) : null;
    if (!w) {
      endChat();
      return;
    }
    const at = chat.anchor === 'them' ? w : chat.anchor;
    if (Math.hypot(c.x - at.x, c.z - at.z) > TALK.end) endChat();
  }

  // ----- pet an animal (§7.4): its word and a heart over it (one per 2 s each), its sound (none for a turtle) -----
  function petAnimal(i) {
    const K = critters();
    const r = K ? call(K.react, i) : null;
    if (!r) return false;
    if (typeof r.sound === 'string' && r.sound) sfx(r.sound);
    const word = typeof r.word === 'string' && r.word ? r.word : '♥';
    petBubble.innerHTML = `${esc(word)} <span class="pet-heart">&#9829;</span>`;
    petAt = [r.x, r.y, r.z].every(Number.isFinite) ? { x: r.x, y: r.y + 0.35, z: r.z } : null;
    petLeft = PET_SECS;
    placeBubble(petAt, petBubble);
    announce(`${animalName(i)}: ${word}`, el.live);
    return true;
  }
  function stepPet(dt) {
    if (petLeft <= 0) return;
    petLeft -= dt;
    if (petLeft <= 0 || view !== 'town') {
      petLeft = 0;
      petBubble.classList.add('hidden');
      return;
    }
    placeBubble(petAt, petBubble);
  }

  // ----- a tap on an islander (walk up and talk) or an animal (walk up and pet) -----
  function tapSomeone(nx, ny) {
    if (!town) return false;
    const F = folk4();
    const ppl = F ? call(() => F.people) : null;
    const folkList = Array.isArray(ppl) ? ppl.filter((q) => q && q.drawn && !q.mer && islanderRow(q.id) && islanderRow(q.id).role !== 'builder') : [];
    const K = critters();
    const al = K ? call(() => K.list) : null;
    const animals = Array.isArray(al) ? al.map((a) => (a && a.drawn ? { ...a, y: a.y - 0.2 } : null)) : [];
    const k = town.pickPerson(nx, ny, [...folkList, ...animals]);
    if (k < 0) return false;
    if (k < folkList.length) {
      const q = folkList[k];
      tapGoal = { kind: 'talk', id: q.id };
      if (!town.talkTo(q.x, q.z, 1.1)) tapGoal = null;
      else announce(`Walking to ${islanderName(q.id)}.`, el.live);
    } else {
      const a = animals[k - folkList.length];
      tapGoal = { kind: 'pet', i: a.i };
      if (!town.talkTo(a.x, a.z, 0.9)) tapGoal = null;
    }
    return !!tapGoal;
  }
  function stepTapGoal() {
    if (!tapGoal || !town || town.auto) return;
    const g = tapGoal;
    tapGoal = null;
    const c = capNow();
    if (g.kind === 'talk') {
      const F = folk4();
      const w = F ? call(F.where, g.id) : null;
      if (w && Math.hypot(w.x - c.x, w.z - c.z) <= TALK.reach + 0.6) startChat(g.id);
    } else {
      const K = critters();
      if (K && call(K.near, c) === g.i) petAnimal(g.i);
    }
  }

  // ----- district toasts (§8.5): under a district's arch, its name for 2 s (aria-hidden) and in #town-live -----
  const segCross = (a, b, p, q) => {
    const d = (x0, z0, x1, z1, x2, z2) => (x1 - x0) * (z2 - z0) - (z1 - z0) * (x2 - x0);
    const d1 = d(p[0], p[1], q[0], q[1], a.x, a.z);
    const d2 = d(p[0], p[1], q[0], q[1], b.x, b.z);
    const d3 = d(a.x, a.z, b.x, b.z, p[0], p[1]);
    const d4 = d(a.x, a.z, b.x, b.z, q[0], q[1]);
    return d1 * d2 < 0 && d3 * d4 < 0;
  };
  function stepArches() {
    if (!town) return;
    const c = capNow();
    const prev = lastCap;
    lastCap = { x: c.x, z: c.z };
    if (!prev || Math.hypot(c.x - prev.x, c.z - prev.z) > 3) return; // (a hop is no walk under an arch)
    const W = envGet('walk');
    const list = W && Array.isArray(W.districts) ? W.districts : [];
    for (const D of list) {
      const L = D && Array.isArray(D.arch) && D.arch.length === 2 ? D.arch : null;
      if (!L || !L.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))) continue;
      if (!segCross(prev, c, L[0], L[1])) continue;
      // into the district (the way the arch faces, islandPlan ARCHES' ry), not back out of it
      const A = islandPlan.ARCHES.find((q) => q.district === D.id);
      if (A && Number.isFinite(A.ry) && (c.x - prev.x) * Math.sin(A.ry) + (c.z - prev.z) * Math.cos(A.ry) <= 0) continue;
      showToast(D.id, A && A.words ? A.words : D.name, D.name || D.id);
      break;
    }
  }
  function showToast(district, words, name) {
    el.toast.dataset.district = district;
    el.toast.textContent = words;
    el.toast.classList.remove('hidden');
    // (its pop-in plays again for the next arch)
    el.toast.style.animation = 'none';
    void el.toast.offsetWidth;
    el.toast.style.animation = '';
    toastLeft = TOAST_SECS;
    if (name) announce(name, el.live);
  }
  function stepToast(dt) {
    if (toastLeft <= 0) return;
    toastLeft -= dt;
    if (toastLeft <= 0) {
      toastLeft = 0;
      el.toast.classList.add('hidden');
    }
  }

  // ----- fades: a hop (0.6 s) or the lookout's way up and down; a cut under reduced motion -----
  function startFade(mid, done = null) {
    if (reduced()) {
      mid();
      if (done) done();
      return;
    }
    fade = { t: 0, mid, done, moved: false };
    clearInput();
    fadeEl.style.display = 'block';
    fadeEl.style.opacity = '0';
  }
  function stepFade(dt) {
    if (!fade) return;
    fade.t += dt;
    const T = HOP.fade;
    if (!fade.moved && fade.t >= T) {
      fade.moved = true;
      call(fade.mid);
    }
    const k = fade.t < T ? fade.t / T : Math.max(0, 1 - (fade.t - T) / T);
    fadeEl.style.opacity = String(Math.max(0, Math.min(1, k)).toFixed(3));
    if (fade.t >= 2 * T) finishFade();
  }
  function finishFade() {
    if (!fade) return;
    const F = fade;
    fade = null;
    if (!F.moved) call(F.mid);
    fadeEl.style.opacity = '0';
    fadeEl.style.display = 'none';
    if (F.done) call(F.done);
  }

  // ----- the Island map (§8.5) and hops -----
  function openMap() {
    if (!V4 || !islandMap || !town) return false;
    if (view !== 'town' || activeModal() || fade) return false;
    endChat(false);
    clearInput();
    town.cancelAuto();
    tapGoal = null;
    view = 'map';
    show(el.town, false);
    petBubble.classList.add('hidden');
    islandMap.open();
    mapRefreshIn = 0.5;
    return true;
  }
  function mapClosed() {
    if (view !== 'map') return;
    view = 'town';
    show(el.town, true);
    lastCap = null;
    refreshPrompt(true);
    if (!document.activeElement || document.activeElement === document.body) focus(el.town);
  }
  // the islanders out now, for the map's list: [{ id, name, x, z }]
  function islandersOut() {
    const F = folk4();
    const ppl = F ? call(() => F.people) : null;
    return Array.isArray(ppl) ? ppl.filter((q) => q && q.placed && islanderRow(q.id) && islanderRow(q.id).role !== 'builder').map((q) => ({ id: q.id, name: q.name || islanderName(q.id), x: q.x, z: q.z })) : [];
  }
  // the 21 plots' tiers for the map: [{ id, name, tier, max }]
  function plotTiers() {
    const t = islandNow().t || {};
    const t4 = island4Now().t || {};
    return [...PLOTS.map((p) => ({ id: p.id, name: p.name, tier: t[p.id] | 0, max: 3 })), ...PLOTS4.map((p) => ({ id: p.id, name: p.name, tier: t4[p.id] | 0, max: 3 }))];
  }
  // where a map target is: 'plot:<id>' (its board's place) or 'hop:<district>' (walk.hops)
  function mapTarget(id) {
    if (typeof id !== 'string' || !town) return null;
    if (id.startsWith('plot:')) {
      const p = town.places.find((q) => q.id === id);
      return p ? { x: p.x, z: p.z, h: Number.isFinite(p.face) ? p.face : 0, name: p.name, place: id } : null;
    }
    const W = envGet('walk');
    const hp = W && Array.isArray(W.hops) ? W.hops.find((q) => q && q.id === id) : null;
    if (!hp || !Number.isFinite(hp.x) || !Number.isFinite(hp.z)) return null;
    const D = islandPlan.DISTRICTS.find((d) => d.id === hp.district);
    return { x: hp.x, z: hp.z, h: Number.isFinite(hp.h) ? hp.h : 0, name: D ? D.name : hp.district };
  }
  function mapWalkTo(id) {
    const T = mapTarget(id);
    if (!T || !town || view !== 'town') return false;
    const ok = T.place ? town.goTo(T.place, { open: false }) : town.walkTo(T.x, T.z);
    if (ok) announce(`Walking to ${T.name}.`, el.live);
    return ok;
  }
  /** Hop there (§8.5): refused during a construction scene or with a panel open ("Finish building first!"); else a
   * 0.6 s fade (a cut under reduced motion) and he lands on the place's free, snapped point. */
  function hopTo(id) {
    if (!V4 || !town) return { ok: false, why: "Can't hop from here." };
    if (busyBuilding() || PANEL_VIEWS.includes(view)) return { ok: false, why: 'Finish building first!' };
    if (fade || lookout) return { ok: false, why: "Can't hop right now." };
    const T = mapTarget(id);
    if (!T) return { ok: false, why: "Can't find that place." };
    startFade(
      () => {
        if (!town) return;
        endChat(false);
        const at = town.hop({ x: T.x, z: T.z }, T.h);
        lastCap = null;
        if (at) {
          const env = envNow();
          if (env && typeof env.setCaptain === 'function') call(env.setCaptain.bind(env), at.x, at.z);
        }
      },
      () => {
        refreshPrompt(true);
        announce(`Hopped to ${T.name}.`, el.live);
      },
    );
    return { ok: true };
  }

  // ----- the lookout (§6.7): Climb (E) up to the crow's nest, a panorama; any move key, Esc, Climb down or 30 s idle -----
  function climb() {
    if (!V4 || !town || view !== 'town' || lookout || fade) return false;
    if (busyBuilding()) {
      announce('Finish building first!', el.live);
      return false;
    }
    const L = lookoutSpot();
    if (!L) return false;
    endChat(false);
    clearInput();
    const c = capNow();
    const pl = L.place && Number.isFinite(L.place.x) ? L.place : { x: c.x, z: c.z, face: c.h };
    const foot = town.walk.snap(pl.x, pl.z, 2) || { x: c.x, z: c.z };
    // (sparrow's nest point is the eye, 1.55 over the nest's base; its floor's top is 0.15 over the base)
    const nest = { x: L.nest[0], y: L.nest[1] - 1.55 + 0.15, z: L.nest[2] };
    // looking out over the middle of the island (the walk's bounds), else the nest's own look
    const look = islandYaw(L.nest[0], L.nest[2]) ?? (Array.isArray(L.look) && L.look.every(Number.isFinite) ? Math.atan2(L.look[0] - L.nest[0], L.look[2] - L.nest[2]) : Math.PI);
    lookout = { phase: 'up', t: 0, idle: 0, foot: { x: foot.x, z: foot.z, h: Number.isFinite(pl.face) ? pl.face + Math.PI : c.h } };
    view = 'lookout';
    town.lookout({ foot: lookout.foot, nest, yaw: look, secs: LOOKOUT.climb });
    sfx('step', { volume: 0.7 });
    show(el.lookDown, true);
    // (up there the stick and Go in have nothing to do: Climb down takes their place)
    show(el.stick, false);
    show(el.action, false);
    noPrompt();
    lastPrompt = null;
    focus(el.town);
    announce('Land ho! You can see the whole island. Turn with the arrow keys; press Escape to climb down.', el.live);
    return true;
  }
  // the way from (x, z) to the middle of the walk's areas (the island's bounds), or null
  function islandYaw(x, z) {
    const W = envGet('walk');
    const A = W && Array.isArray(W.areas) ? W.areas.filter((a) => a && Number.isFinite(a.x) && Number.isFinite(a.z)) : [];
    if (!A.length) return null;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const a of A) {
      x0 = Math.min(x0, a.x);
      x1 = Math.max(x1, a.x);
      z0 = Math.min(z0, a.z);
      z1 = Math.max(z1, a.z);
    }
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    return Math.hypot(cx - x, cz - z) > 1 ? Math.atan2(cx - x, cz - z) : null;
  }
  // (tests: __game.town.lookout(true) from anywhere: to the ladder's foot, then up)
  function climbAnywhere() {
    const L = lookoutSpot();
    if (!L || !L.place || !town || view !== 'town' || busyBuilding()) return false;
    if (!town.hop({ x: L.place.x, z: L.place.z }, Number.isFinite(L.place.face) ? L.place.face : 0)) return false;
    return climb();
  }
  /** Down the ladder to its foot (now: at once, as when another view opens). */
  function climbDown({ now = false } = {}) {
    if (!lookout || !town) return false;
    const T = town.nest;
    if (T && T.phase === 'down' && !now) return true;
    town.lookoutDown({ secs: now ? 0 : LOOKOUT.climb });
    if (now || reduced()) endLookout();
    else lookout.phase = 'down';
    return true;
  }
  function endLookout() {
    if (!lookout) return;
    lookout = null;
    if (town && town.nest) town.lookoutDown({ secs: 0 });
    if (el.lookDown.contains(document.activeElement)) focus(el.town);
    show(el.lookDown, false);
    show(el.stick, true);
    show(el.action, true);
    if (view === 'lookout') {
      view = 'town';
      lastCap = null;
      refreshPrompt(true);
    }
  }
  function stepLookout(dt) {
    if (!lookout || !town) return;
    const T = town.nest;
    if (!T) {
      endLookout(); // (down at the foot again)
      return;
    }
    if (T.phase === 'on' && lookout.phase !== 'down') {
      if (lookout.phase === 'up') showToast('harbour', 'LAND HO!', null); // (up in the nest, SPEC4 §6.7; #town-live said it)
      lookout.phase = 'on';
      lookout.idle += dt;
      const dir = (held.has('l') ? 1 : 0) - (held.has('r') ? 1 : 0);
      if (dir) {
        lookout.idle = 0;
        town.lookoutTurn(dir * LOOKOUT.turn * dt);
      }
      if (lookout.idle >= LOOKOUT.idle) climbDown();
    }
  }

  // ----- leaving the town walk (a panel, the shipyard, away): every Sunset Isles view and bubble put away -----
  function leaveV4Views() {
    endChat(false);
    tapGoal = null;
    if (view === 'map' && islandMap) islandMap.close();
    if (lookout || view === 'lookout') {
      if (town && town.nest) town.lookoutDown({ secs: 0 });
      endLookout();
    }
    if (fade) finishFade();
    toastLeft = 0;
    el.toast.classList.add('hidden');
    petLeft = 0;
    petBubble.classList.add('hidden');
  }

  // ----- the town band's layers (§4.1, audio.setTownLayers): the Music Hall's tier, with the island4 record -----
  function syncLayers(force = false) {
    if (!V4 || !C.island4 || !C.audio || typeof C.audio.setTownLayers !== 'function') return;
    let n = 0;
    const p = call(perks4, island4Now());
    if (p && Number.isFinite(p.musicLayers)) n = Math.max(0, Math.min(3, Math.round(p.musicLayers)));
    if (!force && n === layersShown) return;
    layersShown = n;
    call(C.audio.setTownLayers.bind(C.audio), n);
  }

  // ----- the Sea Guide (§8.7): a card per foe kind after the captain's log; unmet Voyage IV kinds a "?" -----
  const GUIDE_ICON = {
    ship: (c) => `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><path d="M15.5 4v17" fill="none" stroke-width="2.2"/><path d="M16.5 5.5c5 3 7.4 7.6 7.6 13.5H16.5z" fill="${c}"/><path d="M14.5 8.5c-3.4 2.6-5 6-5.2 10.5h5.2z" fill="#fffaf0"/><path d="M3.5 21.5h25l-3.4 6H7.2z" fill="#c07b3a"/></g></svg>`,
    kraken: (c) => `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><path d="M9 17c0-6 3-11 7-11s7 5 7 11z" fill="${c}"/><path d="M9 17c-2 4-5 5-6 9M13 17c0 5-2 8-3 11M19 17c0 5 2 8 3 11M23 17c2 4 5 5 6 9" fill="none" stroke="${c}" stroke-width="3.2"/><path d="M9 17c-2 4-5 5-6 9M13 17c0 5-2 8-3 11M19 17c0 5 2 8 3 11M23 17c2 4 5 5 6 9" fill="none"/></g><circle cx="13.4" cy="12.6" r="1.6" fill="#1d1330"/><circle cx="18.6" cy="12.6" r="1.6" fill="#1d1330"/></svg>`,
    jolly: (c) => `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><circle cx="16" cy="12" r="5.4" fill="#a8743f"/><circle cx="16" cy="13.4" r="3" fill="#efc896"/><path d="M4 20h24l-3 6.5H7z" fill="${c}"/><circle cx="24.5" cy="8" r="2.6" fill="#6b4a2b"/></g></svg>`,
    stinger: (c) => GUIDE_ICON.ship(c),
    netsloop: (c) => GUIDE_ICON.ship(c),
    witch: (c) => GUIDE_ICON.ship(c),
    puffer: (c) => `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.8 6.8l2.8 2.8M22.4 22.4l2.8 2.8M6.8 25.2l2.8-2.8M22.4 9.6l2.8-2.8" fill="none"/><circle cx="16" cy="16" r="8.6" fill="${c}"/></g><circle cx="13.4" cy="14" r="1.5" fill="#1d1330"/><circle cx="18.6" cy="14" r="1.5" fill="#1d1330"/></svg>`,
    coilback: (c) => `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><path d="M4 26c4-6 8 2 12-4s8 0 12-6" fill="none" stroke="${c}" stroke-width="4.6"/><path d="M4 26c4-6 8 2 12-4s8 0 12-6" fill="none"/><circle cx="26" cy="9" r="4.2" fill="${c}"/></g><circle cx="27.2" cy="8" r="1.1" fill="#1d1330"/></svg>`,
    fort: (c) => `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><path d="M8 28V10h3v3h3v-3h4v3h3v-3h3v18z" fill="${c}"/><path d="M14 28v-6a2 2 0 0 1 4 0v6" fill="#6b4a2b"/><path d="M2 28h28" fill="none"/></g></svg>`,
    shellback: (c) => `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><ellipse cx="16" cy="19" rx="10" ry="6.5" fill="${c}"/><path d="M6.5 15c-3-1-4.5-4-3.4-7 2.4.4 3.8 2.4 4.4 4.6M25.5 15c3-1 4.5-4 3.4-7-2.4.4-3.8 2.4-4.4 4.6" fill="${c}"/><path d="M8 24l-3 4M12 25l-1.5 4M20 25l1.5 4M24 24l3 4" fill="none"/></g><circle cx="13" cy="15.6" r="1.4" fill="#1d1330"/><circle cx="19" cy="15.6" r="1.4" fill="#1d1330"/></svg>`,
    unknown: () => `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="12" fill="#d9c7a6" stroke="#1d1330" stroke-width="2"/><path d="M12.2 12.6c0-2.6 1.8-4.2 4-4.2s4 1.5 4 3.8c0 3-3.8 3.2-3.8 6.4" fill="none" stroke="#1d1330" stroke-width="2.6" stroke-linecap="round"/><circle cx="16.4" cy="23" r="1.7" fill="#1d1330"/></svg>`,
  };
  function guideCards() {
    const given = C.guide && call(C.guide.cards && C.guide.cards.bind(C.guide));
    if (Array.isArray(given)) return given;
    const f = featsNow() || {};
    const counts = { ...(f.prizes && typeof f.prizes === 'object' ? f.prizes : {}), kraken: Number.isFinite(f.kraken) ? f.kraken : 0 };
    return call(guideFor, voyage4Now().met, unlockedNow(), counts) || [];
  }
  function renderGuide() {
    if (!V4) return;
    const cards = guideCards().filter((c) => c && typeof c.id === 'string');
    el.tGuide.classList.remove('hidden');
    el.tGuide.setAttribute('aria-labelledby', 'tavern-guide-h');
    el.tGuide.removeAttribute('aria-label');
    el.tGuide.innerHTML =
      '<h3 class="tav-h guide-h" id="tavern-guide-h">Sea Guide</h3>' +
      '<ul class="up-list guide-list">' +
      cards
        .map((c) => {
          if (!c.seen) {
            return (
              `<li class="up-row guide-row guide-unseen" data-guide="${esc(c.id)}"><span class="up-ico" aria-hidden="true">${GUIDE_ICON.unknown()}</span>` +
              `<div class="up-head"><h4 class="up-name">?</h4></div><p class="up-stat">${esc(NOT_MET)}</p></li>`
            );
          }
          const ico = (GUIDE_ICON[c.icon] || GUIDE_ICON.ship)(/^#[0-9a-f]{3,6}$/i.test(c.colour || '') ? c.colour : '#c07b3a');
          const beaten = Number.isInteger(c.beaten) && c.beaten > 0 ? ` <span class="up-extra guide-beaten">Beaten &times;${c.beaten}</span>` : '';
          return (
            `<li class="up-row guide-row" data-guide="${esc(c.id)}"><span class="up-ico" aria-hidden="true">${ico}</span>` +
            `<div class="up-head"><h4 class="up-name">${esc(c.name)}</h4></div>` +
            `<p class="up-stat"><span class="up-statname">What it does:</span> ${esc(c.does)}<br><span class="up-statname">How to beat it:</span> ${esc(c.beat)}${beaten}</p></li>`
          );
        })
        .join('') +
      '</ul>';
  }

  // ---------------------------------------------------------------------------------------------
  // Keys and pointers (main routes them here while a town view is up)
  // ---------------------------------------------------------------------------------------------
  function applyMove() {
    if (!town || view !== 'town') return;
    if (stick && stick.mag > 0) return; // the stick wins while held
    let x = 0;
    let z = 0;
    if (held.has('f')) z += 1;
    if (held.has('b')) z -= 1;
    if (held.has('r')) x += 1;
    if (held.has('l')) x -= 1;
    const L = Math.hypot(x, z) || 1;
    town.setMove({ x: x / L, z: z / L, run: shift });
  }
  const buttonFocused = () => {
    const a = document.activeElement;
    return a instanceof HTMLButtonElement && !a.disabled && a.offsetParent !== null;
  };
  // Walking (a key or the stick) with a town HUD button focused (the places bar, ☰, 🔊, the prompt): focus
  // goes back to the town region, so Enter and Space at the next door go in as its prompt says.
  function leaveHudButton() {
    const a = document.activeElement;
    if (view === 'town' && a instanceof HTMLButtonElement && el.town.contains(a)) focus(el.town);
  }

  function onKey(e, down) {
    if (view === 'shop' || !e) return false;
    const k = String(e.key || '').toLowerCase();
    const dir = MOVE_KEYS[e.code] || MOVE_KEYS[k];
    const modal = activeModal();
    if (modal) {
      if (down && (modal === el.harbour || modal === el.aboard) && (k === 'escape' || (k === 'p' && modal === el.harbour))) {
        e.preventDefault();
        if (!e.repeat) closeDialog(modal);
        return true;
      }
      if (!down && dir) held.delete(dir);
      return false; // Tab and the dialog's buttons are main's and the browser's
    }
    // (the Sunset Isles) the Island map takes its keys first (Esc or I closes it; moving does nothing while it's up);
    // the crow's nest turns with ← → and climbs down on any other move key or Esc (SPEC4 §6.7, §8.1)
    if (V4 && view === 'map') {
      if (!down && dir) held.delete(dir);
      return !!(islandMap && islandMap.onKey(e, down));
    }
    if (V4 && view === 'lookout') return lookoutKey(e, down, k, dir);
    // A building still going up after the build panel's own montage window (a slow frame rate): a key only skips it,
    // as during the panel's window (a held key's auto-repeat doesn't)
    if (down && view === 'build' && montageRunning() && !(buildPanel && buildPanel.api.celebrating) && !MODIFIER_KEYS.has(k)) {
      e.preventDefault();
      if (!e.repeat) skipCelebration();
      return true;
    }
    // The quiz and build panels take their keys first (1–4, H, Esc a step back, Enter held once, a key during the
    // montage only skips it): nothing they use reaches the town
    const panelUp = panelOf(view);
    if (panelUp && down && panelUp.active && panelUp.onKey(e, true)) return true;
    if (!down) {
      if (dir) {
        held.delete(dir);
        shift = !!e.shiftKey;
        applyMove();
        return true;
      }
      if (k === 'shift') {
        shift = false;
        applyMove();
        return true;
      }
      return false;
    }
    if (k === 'm') {
      if (!e.repeat) toggleMute();
      return true;
    }
    if (view === 'town') {
      if (V4 && fade && (dir || k === 'e' || k === 'enter' || k === ' ' || k === 'i')) {
        e.preventDefault(); // (mid-hop: he lands first)
        return true;
      }
      if (dir) {
        if (k.startsWith('arrow')) e.preventDefault();
        leaveHudButton();
        held.add(dir);
        shift = !!e.shiftKey;
        applyMove();
        return true;
      }
      if (k === 'shift') {
        shift = true;
        applyMove();
        return true;
      }
      if (k === 'p' || k === 'escape') {
        e.preventDefault();
        // (a chat ends first, SPEC4 §7.4)
        if (!e.repeat) (V4 && chat && k === 'escape' ? endChat() : openHarbour());
        return true;
      }
      if (k === 'c') {
        if (!e.repeat && town) town.recenter();
        return true;
      }
      if (V4 && k === 'i') {
        e.preventDefault();
        if (!e.repeat) openMap();
        return true;
      }
      if (k === 'e' || k === 'enter' || k === ' ') {
        // (E is always the door's; a focused button handles Enter and Space itself)
        if (k !== 'e' && buttonFocused()) return false;
        e.preventDefault();
        if (!e.repeat && !interact() && k === 'e') announce('Walk up to a door to go in.', el.live);
        return true;
      }
      return false;
    }
    // tailor / tavern panels (and the quiz and build panels' Esc, should they not take it)
    if (k === 'escape') {
      e.preventDefault();
      if (!e.repeat) back();
      return true;
    }
    if (view === 'tailor' && dir && (dir === 'l' || dir === 'r')) {
      const inPanel = el.wardrobe.contains(document.activeElement) && document.activeElement !== el.wardrobe;
      if (inPanel) return false; // arrows belong to the focused control (the tabs, scrolling)
      e.preventDefault();
      if (town) town.drag(dir === 'l' ? -45 : 45, 0);
      return true;
    }
    return false;
  }

  function lookoutKey(e, down, k, dir) {
    if (!down) {
      if (dir) held.delete(dir);
      if (k === 'shift') shift = false;
      return !!dir;
    }
    if (k === 'm') {
      if (!e.repeat) toggleMute();
      return true;
    }
    if (dir === 'l' || dir === 'r') {
      if (k.startsWith('arrow')) e.preventDefault();
      held.add(dir);
      if (lookout) lookout.idle = 0;
      return true;
    }
    if (dir || k === 'escape' || k === 'p' || k === 'e' || k === 'enter' || k === ' ') {
      if ((k === 'enter' || k === ' ') && buttonFocused()) return false; // (Climb down focused: its own click)
      e.preventDefault();
      if (!e.repeat) climbDown();
      return true;
    }
    return false;
  }

  function stickMove() {
    if (!town || !stick) return;
    if (stick.mag > 0) town.setMove({ x: stick.ux * stick.mag, z: stick.uz * stick.mag, run: stick.run });
    else applyMove();
  }

  function endStick() {
    if (!stick) return;
    stick = null;
    el.stick.classList.remove('on');
    knob.style.transform = '';
    el.stick.style.left = '';
    el.stick.style.top = '';
    applyMove();
  }

  function onPointer(type, e) {
    if (view === 'shop' || !e || activeModal()) {
      if (type !== 'down') {
        if (stick && e && e.pointerId === stick.id) endStick();
        if (drag && e && e.pointerId === drag.id) drag = null;
      }
      return false;
    }
    if (type === 'down') {
      if (e.pointerType === 'mouse' && e.button !== 0) return false;
      if (V4 && fade) return true; // (mid-hop: he lands first)
      // (a tap on the island skips a building still going up, as any tap does during the build panel's montage)
      if (view === 'build' && montageRunning()) {
        skipCelebration();
        return true;
      }
      const capture = () => {
        try {
          if (C.canvas && C.canvas.setPointerCapture) C.canvas.setPointerCapture(e.pointerId);
        } catch {
          // synthetic events have no capturable pointer
        }
      };
      if (view === 'town' && e.pointerType === 'touch' && !stick && e.clientX < window.innerWidth * 0.45) {
        stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, mag: 0, ux: 0, uz: 0, over: 0, run: false };
        el.stick.style.left = `${Math.round(e.clientX)}px`;
        el.stick.style.top = `${Math.round(e.clientY)}px`;
        el.stick.classList.add('on');
        if (town) town.cancelAuto();
        leaveHudButton();
        capture();
        return true;
      }
      if (drag) return false;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false };
      capture();
      return true;
    }
    if (type === 'move') {
      if (stick && e.pointerId === stick.id) {
        const dx = e.clientX - stick.x0;
        const dy = e.clientY - stick.y0;
        const d = Math.hypot(dx, dy);
        const raw = Math.min(1, d / STICK.radius);
        const k = d > 0 ? Math.min(d, STICK.radius) / d : 0;
        knob.style.transform = `translate(${(dx * k).toFixed(1)}px, ${(dy * k).toFixed(1)}px)`;
        stick.mag = raw <= STICK.dead ? 0 : (raw - STICK.dead) / (1 - STICK.dead);
        stick.ux = d > 0 ? dx / d : 0;
        stick.uz = d > 0 ? -dy / d : 0;
        stickMove();
        return true;
      }
      if (drag && e.pointerId === drag.id) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > TAP.px) drag.moved = true;
        if (drag.moved && town && (view === 'town' || view === 'tailor')) {
          drag.x = e.clientX;
          drag.y = e.clientY;
          town.drag(dx, view === 'town' ? dy : 0);
        } else if (drag.moved && town && V4 && view === 'lookout') {
          // (the crow's nest: a drag turns the panorama)
          drag.x = e.clientX;
          drag.y = e.clientY;
          town.lookoutTurn(dx * LOOKOUT.drag);
          if (lookout) lookout.idle = 0;
        }
        return true;
      }
      return false;
    }
    // up / cancel
    if (stick && e.pointerId === stick.id) {
      endStick();
      return true;
    }
    if (drag && e.pointerId === drag.id) {
      const d = drag;
      drag = null;
      if (type === 'up' && !d.moved && performance.now() - d.t0 <= TAP.ms && view === 'town' && town && C.canvas) {
        const r = C.canvas.getBoundingClientRect();
        const nx = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
        const ny = -(((e.clientY - r.top) / Math.max(1, r.height)) * 2 - 1);
        // (the Sunset Isles: a tap on an islander walks him up to them for a chat; on an animal, to pet it)
        if (V4 && tapSomeone(nx, ny)) return true;
        if (V4 && chat) endChat();
        const p = town.pick(nx, ny);
        if (p) town.walkTo(p.x, p.z);
      }
      return true;
    }
    return false;
  }

  function onBlur() {
    held.clear();
    shift = false;
    endStick();
    drag = null;
    if (town) town.setMove({ x: 0, z: 0 });
  }
  window.addEventListener('blur', onBlur);

  // ---------------------------------------------------------------------------------------------
  // The frame
  // ---------------------------------------------------------------------------------------------
  function watchRecords() {
    const L = lookNow();
    if (L !== lastLook) {
      const sig = JSON.stringify(L);
      lastLook = L;
      if (sig !== lookSig) {
        lookSig = sig;
        if (town) {
          town.setCaptain(captainOpts(L, trial));
          if (lineupOn) town.setLineup(lineupOpts(L));
        }
        if (view === 'tailor') renderWardrobe();
      }
    }
    const F = featsNow();
    if (F !== lastFeats) {
      lastFeats = F;
      if (view === 'tailor') renderWardrobe();
      if (view === 'tavern') {
        renderLog();
        if (V4) renderGuide();
      }
    }
    if (view === 'tavern') {
      const ref = (C.armory && call(C.armory.config)) || null;
      if (ref !== lastArmoryRef) {
        lastArmoryRef = ref;
        if (JSON.stringify(armoryNow()) !== lastArmory) renderTavern();
      }
    }
    if (!KRAKEN) return;
    // the Kraken Seas' records (another tab, a test): the Powder room, the build and quiz panels follow
    if (view === 'tavern') {
      const ref = (C.powder && call(C.powder.state && C.powder.state.bind(C.powder))) || null;
      if (ref !== lastPowderRef) {
        lastPowderRef = ref;
        if (JSON.stringify(powderNow().own) !== lastPowder) {
          renderPowder();
          renderRumour();
        }
      }
    }
    if (view === 'build' && buildPanel) {
      const ref = (C.island && call(C.island.state && C.island.state.bind(C.island))) || null;
      if (ref !== lastIslandRef) {
        lastIslandRef = ref;
        buildPanel.refresh();
      }
    }
    // (the Sunset Isles) the island4 record (a build, another tab): the town band's layers, Bess's panel
    if (BUILD4) {
      const ref = call(C.island4.state && C.island4.state.bind(C.island4)) || null;
      if (ref !== lastIsland4Ref) {
        lastIsland4Ref = ref;
        syncLayers();
        if (view === 'build' && buildPanel) buildPanel.refresh();
      }
    }
    if (view === 'quiz' && quizPanel) {
      const ref = (C.quiz && call(C.quiz.record && C.quiz.record.bind(C.quiz))) || null;
      if (ref !== lastQuizRef) {
        lastQuizRef = ref;
        if (quizPanel.api.mode === 'map') quizPanel.refresh();
      }
    }
  }

  function update(dt, t) {
    syncMute();
    stepMontage(Number.isFinite(dt) ? Math.max(0, dt) : 0);
    if (view === 'shop') {
      if (V4 && !town) prepare(); // (the dock has just opened: the path graph now, SPEC4 §6.6)
      if (town) town.update(dt, t); // the captain idles where he stood
      return false;
    }
    if (!town) return false;
    watchRecords();
    renderChests();
    // the stick held past 0.9 for half a second: sprint
    if (stick) {
      stick.over = stick.mag > STICK.run ? stick.over + dt : 0;
      const run = stick.over >= STICK.runAfter;
      if (run !== stick.run) {
        stick.run = run;
        stickMove();
      }
    }
    const r = town.update(dt, t);
    cullNow();
    if (KRAKEN) placeThanks();
    if (V4) stepV4(Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0);
    if (view === 'town') {
      if (r.arrived && !activeModal()) open(r.arrived);
      if (view === 'town') {
        refreshPrompt();
        if (r.greet) bubble.textContent = greetLine(r.greet);
        // (the Sunset Isles: one bubble at a time, SPEC4 §7.4: a chat keeps the greetings quiet)
        placeBubble(V4 && chat ? null : r.bubble);
      }
    }
    return true;
  }
  // (the Sunset Isles) a frame of the town's new parts
  function stepV4(dt) {
    stepFade(dt);
    stepToast(dt);
    stepPet(dt);
    if (view === 'town') {
      stepChat();
      stepTapGoal();
      stepArches();
    } else if (view === 'lookout') stepLookout(dt);
    else if (view === 'map' && islandMap) {
      mapRefreshIn -= dt;
      if (mapRefreshIn <= 0) {
        mapRefreshIn = 0.5;
        islandMap.refresh();
      }
    } else if (view === 'build' && buildPanel) buildPanel.update();
    stepSceneCam();
  }

  function onResize() {
    if (view === 'tailor' && town) town.setPanel('tailor', el.wPanel, tab === 'crew' ? 'lineup' : 'captain');
    if (view === 'tavern' && town) town.setPanel('tavern', el.tPanel, 'captain');
    if (view === 'quiz' && town) {
      town.setPanel('quiz', el.qPanel, 'captain');
      if (quizPanel) quizPanel.refresh();
    }
    if (view === 'build' && town) {
      if (!plotFocus || !focusPlot(plotFocus, { cut: true })) town.setPanel('build', el.bPanel, 'captain');
      if (buildPanel) buildPanel.refresh();
    }
    if (V4 && view === 'map' && islandMap) islandMap.refresh();
    endStick();
  }

  function onContextRestored() {
    if (view === 'town') focus(el.town);
    else if (view === 'tailor') focus(el.wTabs[tab === 'crew' ? 1 : 0]);
    else if (view === 'tavern') focus(el.tPanel.querySelector('.buy-btn') || el.tBack);
    else if (view === 'quiz' || view === 'build') {
      const p = view === 'quiz' ? el.qPanel : el.bPanel;
      const a = document.activeElement;
      if (!(a instanceof HTMLElement && p.contains(a))) focus([...p.querySelectorAll('button')].find((b) => b.getClientRects().length) || p);
    }
  }

  /** Re-read the look, feats, chest and armory now (after a change made outside the panels). */
  function refresh() {
    lastLook = null;
    lastFeats = null;
    lastArmory = '';
    lastArmoryRef = undefined;
    watchRecords();
    renderChests(true);
    if (view === 'tailor') renderWardrobe();
    if (view === 'tavern') {
      renderTavern();
      renderLog();
      renderRumour();
      if (V4) renderGuide();
    }
    lastPowderRef = undefined;
    lastIslandRef = undefined;
    lastQuizRef = undefined;
    lastIsland4Ref = undefined;
    const p = panelOf(view);
    if (p) p.refresh();
  }

  el.ashore.addEventListener('click', () => {
    if (view === 'shop') ashore();
  });

  // ---------------------------------------------------------------------------------------------
  // Test hooks (__game.town / __game.wardrobe)
  // ---------------------------------------------------------------------------------------------
  const api = {
    get active() {
      return view !== 'shop';
    },
    get view() {
      return view;
    },
    get pos() {
      if (!town) return null;
      const c = town.captain;
      return { x: c.x, y: c.y, z: c.z, h: c.h };
    },
    get place() {
      if (!town) return null;
      return town.parked || nearPlace();
    },
    get walk() {
      const env = envNow();
      return env && env.walk ? env.walk : null;
    },
    get captain() {
      return town ? town.captain.mesh : null;
    },
    get lineup() {
      return town ? town.lineup : [];
    },
    get town() {
      return town;
    },
    get trial() {
      return trial;
    },
    get tab() {
      return tab;
    },
    get auto() {
      return town ? town.auto : null;
    },
    get speed() {
      return town ? town.speed : 0;
    },
    get prompt() {
      return el.prompt.classList.contains('hidden') ? null : el.prompt.textContent;
    },
    setMove(x, z, run = false) {
      if (!town || view !== 'town') return false;
      town.setMove({ x, z, run });
      return true;
    },
    walkTo(x, z) {
      return !!(town && view === 'town' && town.walkTo(x, z));
    },
    goTo: (id) => walkToPlace(id),
    interact: () => interact(),
    open: (id) => open(id),
    back: () => back(),
    ashore: () => ashore(),
    showShop: () => showShop(),
    harbour: () => openHarbour(),
    simulate(seconds, input) {
      if (!town || view !== 'town') return null;
      const r = town.simulate(seconds, input);
      if (r.arrived) open(r.arrived);
      refreshPrompt();
      // (a greeting started meanwhile: its words in the bubble, as update() does, never an empty bubble)
      if (r.greet && view === 'town') bubble.textContent = greetLine(r.greetBy);
      return r;
    },
    wardrobe: {
      tab: (name) => (view === 'tailor' ? (setTab(name, false), true) : false),
      click: (id) => clickItem(id),
      buy: () => buyTrial(),
      surprise: () => surpriseMe(),
      paint: () => clickItem('shirt.paint'),
    },
    tavern: {
      buy: (id) => buyArmory(id),
      powder: (id) => buyPowder(id), // the Powder room (the Kraken Seas)
    },
    // The Kraken Seas: the panels' own test hooks (quizPanel.js / buildPanel.js api), the build view's camera
    get withKraken() {
      return KRAKEN;
    },
    get places() {
      return PLACES.slice();
    },
    get quiz() {
      return quizPanel ? quizPanel.api : null;
    },
    get build() {
      return buildPanel ? buildPanel.api : null;
    },
    get plotFocus() {
      return view === 'build' ? plotFocus : null;
    },
    get montage() {
      return montage ? { id: montage.id, tier: montage.tier, t: montage.t } : null;
    },
    focusPlot: (id) => focusPlot(id),
    greetLine: (who) => greetLine(who),
    // The Sunset Isles (SPEC4 §11.3's __game.town additions; main forwards them): the islanders out and the animals,
    // a chat, a pet, a hop, the Island map, the districts, the lookout, the toast, the scene's camera
    get withV4() {
      return V4;
    },
    get islanders() {
      return V4 ? islandersOut() : [];
    },
    get critters() {
      const K = V4 ? critters() : null;
      const list = K ? call(() => K.list) : null;
      return Array.isArray(list) ? list.filter(Boolean) : [];
    },
    get chat() {
      return chat ? { id: chat.id, name: chat.name, line: chat.lines[chat.i], i: chat.i, lines: chat.lines.length } : null;
    },
    get action() {
      const a = V4 ? actionHere() : null;
      return a ? { kind: a.kind, id: a.id ?? null, i: a.i ?? null, name: a.name ?? null } : null;
    },
    talk: (id) => (V4 && view === 'town' ? startChat(id, { far: true }) : false),
    next: () => nextLine(),
    endTalk: () => (chat ? (endChat(), true) : false),
    pet: (i) => (V4 && view === 'town' ? petAnimal(i) : false),
    hop: (id) => (V4 ? hopTo(id) : { ok: false }),
    map: {
      open: () => (V4 ? openMap() : false),
      close: () => (V4 && view === 'map' && islandMap ? (islandMap.close(), true) : false),
      get active() {
        return V4 && view === 'map';
      },
      get api() {
        return islandMap ? islandMap.api : null;
      },
    },
    districtAt: (x, z) => {
      const env = V4 ? envNow() : null;
      return env && typeof env.districtAt === 'function' ? call(env.districtAt.bind(env), x, z) ?? null : null;
    },
    lookout: (on) => (V4 ? (on ? (view === 'town' && nearPlace() !== 'lookout' && town ? climbAnywhere() : climb()) : climbDown()) : false),
    get lookoutState() {
      return lookout ? { phase: lookout.phase, idle: lookout.idle, ...(town && town.nest ? { yaw: town.nest.yaw } : {}) } : null;
    },
    get toast() {
      return V4 && !el.toast.classList.contains('hidden') ? { district: el.toast.dataset.district || null, text: el.toast.textContent, left: toastLeft } : null;
    },
    get fading() {
      return !!fade;
    },
    get sceneCam() {
      return sceneCam ? { id: sceneCam.id } : null;
    },
    get tips() {
      return tipShown;
    },
    get mapBadge() {
      return mapBadge;
    },
    openBuild: (plot) => open('builder', { plot }),
    prepare: () => prepare(),
  };

  return {
    get view() {
      return view;
    },
    get active() {
      return view !== 'shop';
    },
    ashore,
    showShop,
    open,
    back,
    close,
    refresh,
    onKey,
    onPointer,
    update,
    onResize,
    onContextRestored,
    announce,
    prepare, // (the Sunset Isles: main calls it at dock open, behind the "Rowing to…" toast)
    api,
  };
}
