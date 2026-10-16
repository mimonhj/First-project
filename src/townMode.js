// The dock's other views (SPEC2 §7): walking round Sparrow's Floating Island ('town'), Polly's Plumes &
// Trims ('tailor') and The Salty Sparrow ('tavern'), plus the Harbour menu and the All aboard? dialog.
// DOM and glue live here (styles in town.css); the 3D captain and camera are town.js's; persistence
// stays in main.js (ctx.look.set, ctx.wardrobe.wear/buy, ctx.armory.buy save). The shipyard panel
// itself ('shop') stays main.js's: townMode only swaps it out and back (ctx.hideShipyard/showShipyard).
//
// createTownMode(ctx) → {
//   get view ('shop' | 'town' | 'tailor' | 'tavern'), get active (view !== 'shop'),
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
//   optional: toggleMute(), prizes() → [{ type, flag }] }
import { createTown } from './town.js';
import { ITEMS, SLOTS, SLOT_NAMES, itemState, surprise, captainOpts, crewOpts } from './cosmetics.js';
import { ARMORY, armoryMaxTier, armoryNextCost, armoryStatText, parseArmoryConfig } from './armory.js';

const PLACES = ['shipyard', 'tailor', 'tavern', 'ship'];
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
const AMMO_NAMES = { round: 'Round shot', chain: 'Chain shot', grape: 'Grape shot' };
// Act I has no rumours in its level data: the regulars' gossip about those seas.
const OLD_RUMOURS = {
  'Coast of Europe': ['Corsair cutters prowl the bay below the lighthouse.', 'Turn side-on: your cannons fire sideways!'],
  'Bali Islands': ['Prahus skim right over the light coral. Your keel cannot!', 'Chain shot slows the fast ones down.'],
  'The Volcano': ['The Molten Maw is too hot to board: sink her!', 'Grape shot thins a corsair crew for a capture.'],
};
const PROMPT_VERB = { ship: 'All aboard', shipyard: 'Go in', tailor: 'Go in', tavern: 'Go in' };
const WALK_NAME = { shipyard: 'the shipyard', tailor: 'the tailor', tavern: 'the tavern', ship: 'your ship' };
const BUY_GUARD = 400; // ms: a double-click or a held Enter buys once
const STICK = { radius: 52, dead: 0.15, walk: 0.5, run: 0.9, runAfter: 0.5 };
const TAP = { ms: 250, px: 10 };
const MOVE_KEYS = {
  KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
  w: 'f', arrowup: 'f', s: 'b', arrowdown: 'b', a: 'l', arrowleft: 'l', d: 'r', arrowright: 'r',
};

const hex = (n) => `#${(n >>> 0).toString(16).padStart(6, '0')}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function createTownMode(ctx = {}) {
  const C = ctx || {};
  const U = C.ui || {};
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
    tRumour: $('tavern-rumour', 'section'),
    tLog: $('tavern-log', 'section'),
    tBack: $('tavern-back-btn', 'button'),
    tLive: $('tavern-live', 'p'),
    hWalk: $('harbour-walk-btn', 'button'),
    hPlaces: { shipyard: $('harbour-shipyard-btn', 'button'), tailor: $('harbour-tailor-btn', 'button'), tavern: $('harbour-tavern-btn', 'button') },
    hExits: $('harbour-exits'),
    aExits: $('aboard-exits'),
    aStay: $('aboard-stay-btn', 'button'),
  };
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
  let bought = null; // { slot, id }: the Buy button stays put as "Bought" until the next choice
  const held = new Set(); // movement directions held: f b l r
  let shift = false;
  let stick = null; // { id, x0, y0, mag, over, run }
  let drag = null; // { id, x, y, x0, y0, t0, moved }
  let liveTimer = 0;

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
  }
  for (const [id, b] of Object.entries(el.hPlaces)) {
    const label = b.textContent.trim();
    b.innerHTML = `${ICONS[id]}<span>${esc(label)}</span>`;
    b.classList.add('harbour-place');
  }
  // keyboard help: one unbroken item per action
  el.keys.innerHTML = [
    ['Walk', ['W', 'A', 'S', 'D']],
    ['Sprint', ['Shift']],
    ['Go in', ['E']],
    ['Camera', ['C']],
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
          if (it.slot !== slot || it.id === 'shirt.paint') continue;
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
  }
  buildTavern();

  // ---------------------------------------------------------------------------------------------
  // Announcements (polite, de-duplicated like the shipyard's)
  // ---------------------------------------------------------------------------------------------
  function liveFor() {
    return view === 'tailor' ? el.wLive : view === 'tavern' ? el.tLive : el.live;
  }
  function announce(text, region = liveFor()) {
    if (!text) return;
    region.textContent = region.textContent === text ? `${text} ` : text;
  }

  // ---------------------------------------------------------------------------------------------
  // The town controller (built lazily, once per dock visit)
  // ---------------------------------------------------------------------------------------------
  function ensureTown() {
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
    });
    townEnv = env;
    lastLook = lookNow();
    lookSig = JSON.stringify(lastLook);
    town.setCaptain(captainOpts(lastLook, trial));
    return town;
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
    if (crew) restyleCrew(look);
    if (view === 'tailor') renderWardrobe();
  }
  function restyleCrew(look = lookNow()) {
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
    if (C.showShipyard) call(C.showShipyard);
    else {
      show(el.dock, true);
      focus(document.getElementById('dock-tab-up'));
    }
    return true;
  }

  /** Open a place: 'shipyard' | 'tailor' | 'tavern' | 'ship' (the All aboard? dialog). */
  function open(id) {
    if (!PLACES.includes(id)) return false;
    if (view === 'shop') {
      if (id === 'shipyard') return true;
      if (!ashore({ swoop: false })) return false;
    }
    if (activeModal() === el.harbour) closeDialog(el.harbour, false);
    if (id === 'shipyard') {
      if (view === 'town' && town && town.captain && nearPlace() === 'shipyard') spotForTown = 'shipyard';
      return showShop();
    }
    if (id === 'ship') return openAboard();
    if (id === 'tailor') return openWardrobe();
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
    if (view === 'tailor' || view === 'tavern') leavePanel();
    closeDialogs(false);
    clearInput();
    town.exit();
    town.park(id);
    resetLens();
    show(el.town, false);
    bubble.classList.add('hidden');
    view = id;
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
    renderChests(true);
    town.setPanel('tavern', el.tPanel, 'captain');
    const body = el.tPanel.querySelector('.dock-body');
    if (body) body.scrollTop = 0;
    focus(el.tPanel.querySelector('.buy-btn') || el.tBack);
    announce('The Salty Sparrow. Train your crew, hear the rumours and read your log.', el.tLive);
    return true;
  }

  /** Leave a panel view's 3D set-up and screen (no view change). */
  function leavePanel() {
    if (view === 'tailor') {
      if (trial) revertTrial(false);
      lineupOn = false;
      if (town) town.setLineup(null);
      show(el.wardrobe, false);
    } else if (view === 'tavern') show(el.tavern, false);
    else return;
    if (town) town.park(null);
    resetLens();
  }

  /** Back to walking: from a panel (focus on its place in the bar), or from the shipyard. */
  function back() {
    if (view === 'shop') return ashore();
    if (view === 'tailor' || view === 'tavern') {
      const id = view;
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
    if (view === 'tailor' && trial) revertTrial(false, true);
    trial = null;
    lineupOn = false;
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
  el.menuBtn.addEventListener('click', () => openHarbour());
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
    if (e.detail > 0 || (typeof e.pointerType === 'string' && e.pointerType)) b.blur();
  });
  el.prompt.addEventListener('click', () => interact());
  el.action.addEventListener('click', () => {
    if (!interact()) announce('Walk up to a door to go in.', el.live);
  });
  el.mute.addEventListener('click', () => toggleMute());

  function interact() {
    if (view !== 'town' || !town || activeModal()) return false;
    const id = nearPlace();
    if (!id) return false;
    return open(id);
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
    const id = view === 'town' && town && !town.auto ? nearPlace() : null;
    if (!force && id === lastPrompt) return;
    lastPrompt = id;
    const p = id && town ? town.places.find((q) => q.id === id) : null;
    if (!p) {
      show(el.prompt, false);
      el.action.setAttribute('aria-disabled', 'true');
      el.action.setAttribute('aria-label', 'Go in (walk up to a door first)');
      el.action.querySelector('.ta-ico').innerHTML = '';
      el.action.querySelector('.ta-label').textContent = 'Go in';
      return;
    }
    const verb = PROMPT_VERB[id] || 'Go in';
    el.prompt.innerHTML = touch()
      ? `<span class="tp-name">${esc(p.name)}</span><span class="tp-sep" aria-hidden="true"> — </span><span class="tp-key">${verb}</span>`
      : `<span class="tp-name">${esc(p.name)}</span><span class="tp-sep" aria-hidden="true"> — </span><span class="tp-key"><kbd>Enter</kbd><span aria-hidden="true"> &#9166;</span></span>`;
    show(el.prompt, true);
    el.action.setAttribute('aria-disabled', 'false');
    el.action.setAttribute('aria-label', `${verb}: ${p.name}`);
    el.action.querySelector('.ta-ico').innerHTML = ICONS[id] || '';
    el.action.querySelector('.ta-label').textContent = id === 'ship' ? 'Aboard' : verb;
    if (!force) announce(touch() ? `${p.name}. Tap ${verb}.` : `${p.name}. Press E or Enter to ${verb === 'All aboard' ? 'go aboard' : 'go in'}.`, el.live);
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
  }

  // townsfolk farther than 40 from the lens are hidden, and those right at it (in the panel views,
  // anyone within a few steps of the lens would fill the picture)
  const cullNow = () => {
    const env = envNow();
    if (env && env.cull && C.camera) call(env.cull.bind(env), C.camera.position.x, C.camera.position.z, 40, view === 'town' ? 1.0 : 2.6);
  };

  // speech bubbles over the townsfolk
  function greetLine() {
    const look = lookNow() || { cap: {} };
    const feats = featsNow() || {};
    const lines = ['Ahoy, Captain!', 'Fair winds, Captain!', "Lovely day for it, Cap'n!"];
    const coat = ITEMS[`coat.${look.cap && look.cap.coat}`];
    if (coat && (coat.price || coat.trophy)) lines.push("Fine coat, Cap'n!", "Fine coat, Cap'n!", "Fine coat, Cap'n!");
    if (look.cap && look.cap.pet && look.cap.pet !== 'none') lines.push('Is that a parrot?!', 'Is that a parrot?!', 'Is that a parrot?!');
    if (feats.captures > 0) lines.push('Heard you took a prize!', 'Heard you took a prize!', 'Heard you took a prize!');
    return lines[Math.floor(Math.random() * lines.length)];
  }
  function placeBubble(at) {
    if (!at || !C.camera) {
      bubble.classList.add('hidden');
      return;
    }
    const cam = C.camera;
    const v = cam.position.clone().set(at.x, at.y, at.z).project(cam);
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1 || v.y > 1.2) {
      bubble.classList.add('hidden');
      return;
    }
    const x = ((v.x + 1) / 2) * W;
    const y = ((1 - v.y) / 2) * H;
    bubble.classList.remove('hidden');
    // kept on screen: a speaker near the edge gets the bubble slid in, its tail still pointing at them
    const half = bubble.offsetWidth / 2;
    const bx = half && W > 2 * half + 16 ? Math.min(Math.max(x, half + 8), W - half - 8) : x;
    const tail = Math.max(-half + 16, Math.min(half - 16, x - bx));
    bubble.style.setProperty('--tail', `${Math.round(tail)}px`);
    bubble.style.transform = `translate(${Math.round(bx)}px, ${Math.round(y)}px) translate(-50%, calc(-100% - 12px))`;
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
  // a held Enter clicks again on every auto-repeat: one press is one purchase (or one choice)
  for (const p of [el.wPanel, el.tPanel]) {
    p.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.repeat && e.target instanceof HTMLButtonElement) e.preventDefault();
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

  function renderRumour() {
    const r = call(C.rumour) || null;
    const title = r && (r.title || r.name);
    let lines = r && Array.isArray(r.lines) ? r.lines.filter((x) => typeof x === 'string') : [];
    if (!lines.length && title && OLD_RUMOURS[title]) lines = OLD_RUMOURS[title];
    const ammo = r && AMMO_NAMES[r.ammo] ? AMMO_NAMES[r.ammo] : null;
    el.tRumour.innerHTML =
      '<h3 class="tav-h">Rumour board</h3>' +
      (title
        ? `<div class="rumour-note"><p class="rumour-title">Next voyage: <b>${esc(title)}</b></p>` +
          lines.map((l) => `<p class="rumour-line">${esc(l)}</p>`).join('') +
          (ammo ? `<p class="rumour-ammo">Bring: <b>${esc(ammo)}</b></p>` : '') +
          '</div>'
        : '<div class="rumour-note"><p class="rumour-line">No news today. The regulars are arguing about seagulls.</p></div>');
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
    const trophies = Object.values(ITEMS).filter((it) => it.trophy);
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
      if (dir) {
        if (k.startsWith('arrow')) e.preventDefault();
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
        if (!e.repeat) openHarbour();
        return true;
      }
      if (k === 'c') {
        if (!e.repeat && town) town.recenter();
        return true;
      }
      if (k === 'e' || k === 'enter' || k === ' ') {
        if (buttonFocused()) return false; // the focused button handles Enter/Space itself
        e.preventDefault();
        if (!e.repeat && !interact() && k === 'e') announce('Walk up to a door to go in.', el.live);
        return true;
      }
      return false;
    }
    // tailor / tavern panels
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
        if (drag.moved && town && view !== 'tavern') {
          drag.x = e.clientX;
          drag.y = e.clientY;
          town.drag(dx, view === 'town' ? dy : 0);
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
      if (view === 'tavern') renderLog();
    }
    if (view === 'tavern') {
      const ref = (C.armory && call(C.armory.config)) || null;
      if (ref !== lastArmoryRef) {
        lastArmoryRef = ref;
        if (JSON.stringify(armoryNow()) !== lastArmory) renderTavern();
      }
    }
  }

  function update(dt, t) {
    syncMute();
    if (view === 'shop') {
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
    if (view === 'town') {
      if (r.arrived && !activeModal()) open(r.arrived);
      if (view === 'town') {
        refreshPrompt();
        if (r.greet) bubble.textContent = greetLine();
        placeBubble(r.bubble);
      }
    }
    return true;
  }

  function onResize() {
    if (view === 'tailor' && town) town.setPanel('tailor', el.wPanel, tab === 'crew' ? 'lineup' : 'captain');
    if (view === 'tavern' && town) town.setPanel('tavern', el.tPanel, 'captain');
    endStick();
  }

  function onContextRestored() {
    if (view === 'town') focus(el.town);
    else if (view === 'tailor') focus(el.wTabs[tab === 'crew' ? 1 : 0]);
    else if (view === 'tavern') focus(el.tPanel.querySelector('.buy-btn') || el.tBack);
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
    }
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
    },
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
    api,
  };
}
