// Builder Bess's panel (SPEC3 §8.3) in #build-screen: the Homes and Amenities tabs, a row per plot with its
// tier pips, "Now" and "Next", and one Build button. Non-modal like the tavern; styles in town.css.
// townMode.js creates it for its view 'build' (opened by the place `builder`).
//
// createBuildPanel({ root, ctx }) → { open(), close(), onKey(e, down) → handled, refresh(), get active, api }
//
// root: the #build-screen section (ids are looked up inside it, then in the document; a missing one is replaced
//   by a detached element, so a partial page never throws).
// ctx (every member optional; a throwing member counts as missing):
//   island: { state() → the island record, build(id) → { ok, reason?, cost? } | boolean }
//     build() is main's: it re-reads the records, writes the island record first and the chest second
//     (SPEC3 §0.1, §10.2) and answers { ok: false, reason: 'storage' } when storage refuses (nothing paid),
//     'poor' / 'maxed' / 'unknown' as island.js build() does.
//   purse() → gold, audio: { play(name, opts) }, reducedMotion() → boolean,
//   back() → leave the panel for the town (townMode.back(); Back to town, and Esc),
//   focusPlot(id) → glide the camera to a plot, framed beside the panel (a cut under reduced motion),
//   celebrate(id, tier) → seconds: the building montage (scaffold, knocks, the building springs up, bunting
//     and a cheer; a fade under reduced motion), and the new home's villagers waving; default 2.4 s,
//   skipCelebration() → end the montage now (any key or tap skips it; that key or tap does nothing else).
// Keys (onKey, while the panel is up): Esc back to town; ←/→/Home/End on the tabs (their own listeners);
// Enter and Space press the focused button (the browser's own); a held one, or a double click, builds once.
import * as I from './island.js';

const INK = 'stroke="#1d1330" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';
const CHEST_SVG =
  '<svg class="chest-ico" viewBox="0 0 32 28" aria-hidden="true" focusable="false"><path d="M3.5 12.5C3.5 6 8 3.5 16 3.5S28.5 6 28.5 12.5z" fill="#c07b3a" />' +
  '<rect x="3.5" y="12.5" width="25" height="12.5" rx="2.5" fill="#8b5a2b" /><path d="M9 3.9v8.6M23 3.9v8.6M9 12.5V25M23 12.5V25" stroke-width="2.6" stroke="#ffc93c" />' +
  '<rect x="12.6" y="10" width="6.8" height="7.6" rx="1.8" fill="#ffc93c" /><circle cx="16" cy="13.4" r="1.2" fill="#1d1330" stroke="none" /></svg>';
const house = (roof, wall = '#ffe2b0') =>
  `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}>` +
  `<path d="M6.5 15.5v12.5h19V15.5" fill="${wall}"/>` +
  `<path d="M3.5 16.5L16 5l12.5 11.5c-1.4 1-2.8 1-4.2 0-1.4 1-2.8 1-4.2 0-1.4 1-2.8 1-4.1 0-1.4 1-2.8 1-4.2 0-1.4 1-2.8 1-4.3 0z" fill="${roof}"/>` +
  '<path d="M13.4 28v-6.2a2.6 2.6 0 0 1 5.2 0V28" fill="#8b5a2b"/><rect x="20.2" y="19" width="3.6" height="3.6" rx=".6" fill="#8fd3ff"/>' +
  '<path d="M21.5 9.4V6h3v6.2" fill="#c07b3a"/></g></svg>';
const ICONS = {
  homeA: house('#e2383d'),
  homeB: house('#2f86d0'),
  homeC: house('#8a5cc7'),
  homeD: house('#2fae6f'),
  bakery:
    `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><circle cx="16" cy="16" r="11.5" fill="#e8b468"/>` +
    '<circle cx="16" cy="16" r="8.4" fill="none" stroke="#b9822f" stroke-width="1.4" stroke-dasharray="2 2.4"/></g>' +
    '<g fill="#8b5a2b"><circle cx="12" cy="12.6" r="1.3"/><circle cx="20" cy="12.6" r="1.3"/><circle cx="16" cy="16" r="1.3"/><circle cx="12" cy="19.4" r="1.3"/><circle cx="20" cy="19.4" r="1.3"/></g></svg>',
  windmill:
    `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><path d="M11.5 29l2-14h5l2 14z" fill="#d9c7a6"/>` +
    '<path d="M16 13.5L7 4.5l-2.4 2.4 9 9zM16 13.5l9-9 2.4 2.4-9 9zM16 13.5l-9 9 2.4 2.4 9-9zM16 13.5l9 9-2.4 2.4-9-9z" fill="#fffaf0"/>' +
    '<circle cx="16" cy="13.5" r="2" fill="#c07b3a"/><path d="M14.6 29v-4.4h2.8V29" fill="#8b5a2b"/></g></svg>',
  lighthouse:
    `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><path d="M11 29l2.4-17h5.2L21 29z" fill="#fffaf0"/>` +
    '<path d="M12.4 21.4h7.2l.8 5.4h-8.8zM13.2 14.6h5.6l.5 3.6h-6.6z" fill="#e2383d"/><rect x="12.6" y="7" width="6.8" height="5" rx="1" fill="#ffc93c"/>' +
    '<path d="M11.4 7L16 3.2 20.6 7z" fill="#e2383d"/></g><path d="M23 8.4l5-1.8M23 10.6l5 1.4M9 8.4L4 6.6M9 10.6L4 12" stroke="#ffb20f" stroke-width="1.8" stroke-linecap="round"/></svg>',
  market:
    `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><path d="M6.5 15v13h19V15" fill="#fffaf0"/>` +
    '<path d="M4 9.5h24l-1.4 6c-1.4 1.2-3 1.2-4.4 0-1.4 1.2-3 1.2-4.4 0-1.4 1.2-3 1.2-4.4 0-1.4 1.2-3 1.2-4.4 0-1.4 1.2-3 1.2-4.4 0z" fill="#ffc93c"/>' +
    '<path d="M8.8 9.5l-.6 6.6M13.2 9.5l-.2 6.6M18.8 9.5l.2 6.6M23.2 9.5l.6 6.6" fill="none" stroke="#e2383d" stroke-width="2.4"/>' +
    '<path d="M10 22.5h12" fill="none"/><circle cx="12.4" cy="20.4" r="2" fill="#e2383d"/><circle cx="17" cy="20.4" r="2" fill="#5cbf60"/><circle cx="21" cy="20.6" r="1.8" fill="#ffb20f"/></g></svg>',
  school:
    `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><path d="M16 4.5c-5 0-7.6 3.6-7.6 9.2v6.2L5.6 24.4h20.8l-2.8-4.5v-6.2c0-5.6-2.6-9.2-7.6-9.2z" fill="#ffc93c"/>` +
    '<circle cx="16" cy="27" r="2.6" fill="#c07b3a"/><path d="M14.4 4.6c0-1.6.6-2.4 1.6-2.4s1.6.8 1.6 2.4" fill="none"/></g>' +
    '<path d="M11.4 11.8c.4-2.2 1.6-3.6 3.4-4.2" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".85"/></svg>',
  park:
    `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}><path d="M16 17.5v11" fill="none" stroke-width="2.4"/>` +
    '<path d="M16 23c-1-3.6-4.6-5-7.6-4 1 3.4 4.4 4.8 7.6 4zM16 25c1-3.2 4.2-4.6 7-3.8-1 3.2-4 4.6-7 3.8z" fill="#5cbf60"/>' +
    '<circle cx="16" cy="6.6" r="3.6" fill="#ff8fb1"/><circle cx="21.6" cy="10.8" r="3.6" fill="#ff8fb1"/><circle cx="19.6" cy="17" r="3.6" fill="#ff8fb1"/>' +
    '<circle cx="12.4" cy="17" r="3.6" fill="#ff8fb1"/><circle cx="10.4" cy="10.8" r="3.6" fill="#ff8fb1"/><circle cx="16" cy="12.2" r="3.4" fill="#ffc93c"/></g></svg>',
};
// Two villagers (the town line: "Villagers 8 · Hamlet"; on the smallest screens the picture stands for the word)
const TOWN_SVG =
  `<svg class="bt-ico" viewBox="0 0 32 28" aria-hidden="true" focusable="false"><g ${INK}>` +
  '<path d="M14.6 26c0-4.9 3.2-8.4 7.2-8.4s7.2 3.5 7.2 8.4z" fill="#e2383d"/><circle cx="21.8" cy="11" r="4.4" fill="#e8b48a"/>' +
  '<path d="M2.8 26c0-5.4 3.6-9.2 8-9.2s8 3.8 8 9.2z" fill="#2f86d0"/><circle cx="10.8" cy="9.6" r="4.9" fill="#ffd6b0"/>' +
  '<path d="M6 8.4c.8-3.4 3-5 5.6-4.8 2.4.2 4 1.8 4.2 4.4-2.4-.4-4.6-1.2-6.4-2.6-.8 1.4-2 2.4-3.4 3z" fill="#8b5a2b"/></g></svg>';

const BUILD_GUARD = 400; // ms: a double click or a held Enter builds once
const MONTAGE = 2.4; // s, when ctx.celebrate gives no length

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const now = () => (globalThis.performance ? performance.now() : Date.now());
const pct = (v) => Math.round(v * 100);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// What a tier gives, short (the row's Now / Next) and as a sentence (the announcement).
const PERK = {
  villagers: (v) => [plural(v, 'villager'), null],
  wavePatch: (v) => [`crew patches ${pct(v)}% of the hull`, `Your crew patches ${pct(v)}% of the hull.`],
  extraLoads: (v) => [`+${v} of each special shot`, `+${plural(v, 'load')} of each special shot at every level start.`],
  warnBonus: (v) => [`warnings ${v} s longer`, `Every warning lasts ${v} s longer.`],
  marketPct: (v) => [`+${v}% of a level's gold`, `+${v}% of each cleared level's gold (up to 300).`],
  hints: (v) => [`${plural(v, 'lifebuoy')} a quiz`, `${plural(v, 'lifebuoy')} in every quiz round.`],
  giftMul: (v) => [`villagers' gift +${Math.round((v - 1) * 100)}%`, `The villagers' gift is ${Math.round((v - 1) * 100)}% bigger.`],
};
function perkOf(p, tier) {
  if (!p || !p.perk || tier < 1) return null;
  for (const [key, list] of Object.entries(p.perk)) {
    if (PERK[key] && Array.isArray(list) && list[tier - 1] !== undefined) return { key, value: list[tier - 1], words: PERK[key](list[tier - 1]) };
  }
  return null;
}
const tierName = (p, tier) => (tier >= 1 && p.tiers && p.tiers[tier - 1]) || '';

export function createBuildPanel({ root = null, ctx = null } = {}) {
  const C = ctx && typeof ctx === 'object' ? ctx : {};
  const R = root || (typeof document !== 'undefined' ? document.getElementById('build-screen') : null) || document.createElement('section');
  const $ = (id, tag = 'div') => (R.querySelector && R.querySelector(`#${id}`)) || document.getElementById(id) || document.createElement(tag);
  const el = {
    root: R,
    panel: $('build-panel'),
    chest: $('build-chest', 'p'),
    tabs: [$('build-tab-homes', 'button'), $('build-tab-amenities', 'button')],
    lists: { home: $('build-homes', 'ul'), amenity: $('build-amenities', 'ul') },
    back: $('build-back-btn', 'button'),
    live: $('build-live', 'p'),
  };
  el.head = el.panel.querySelector('.dock-head') || document.createElement('header');
  el.body = el.panel.querySelector('.dock-body') || el.panel;

  // ---- ctx helpers ----
  const call = (fn, ...a) => {
    try {
      return typeof fn === 'function' ? fn(...a) : undefined;
    } catch (err) {
      console.error(err); // eslint-disable-line no-console
      return undefined;
    }
  };
  const plots = () => (Array.isArray(I.PLOTS) ? I.PLOTS : []);
  const plotOf = (id) => plots().find((p) => p.id === id) || null;
  const islandNow = () => {
    const raw = C.island ? call(C.island.state && C.island.state.bind(C.island)) : undefined;
    return typeof I.parseIsland === 'function' ? I.parseIsland(raw ?? null) : raw || null;
  };
  // whole gold in the chest, counted as island.js plotState / build count it (junk or below 0 is an empty chest)
  const purse = () => {
    const p = call(C.purse);
    return Number.isFinite(p) ? Math.max(0, Math.floor(p)) : 0;
  };
  const reduced = () => {
    const r = call(C.reducedMotion);
    if (typeof r === 'boolean') return r;
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  };
  const sfx = (name, opts) => C.audio && call(C.audio.play && C.audio.play.bind(C.audio), name, opts);
  const focus = (node) => {
    if (node && node.focus) node.focus({ preventScroll: false });
  };
  function announce(text) {
    if (!text) return;
    el.live.textContent = el.live.textContent === text ? `${text} ` : text;
  }
  // A plot's state from island.js plotState (tier, cost, affordable and its words: the button's label, Now and
  // Next, so every screen says what island.js says), checked field by field; the panel's own words only stand in
  // for a field plotState doesn't give.
  function stateOf(cfg, gold, p) {
    const s = typeof I.plotState === 'function' ? call(I.plotState, cfg, gold, p.id) : null;
    const max = Array.isArray(p.costs) ? p.costs.length : 3;
    let tier = s && Number.isInteger(s.tier) ? s.tier : cfg && cfg.t && Number.isInteger(cfg.t[p.id]) ? cfg.t[p.id] : 0;
    tier = Math.max(0, Math.min(max, tier));
    const maxed = tier >= max;
    const cost = maxed ? null : s && Number.isFinite(s.cost) ? s.cost : p.costs[tier];
    const affordable = !maxed && (s && typeof s.affordable === 'boolean' ? s.affordable : gold >= cost);
    const word = (k, own) => (s && typeof s[k] === 'string' && s[k] ? s[k] : own());
    const label = word('label', () => {
      if (maxed) return 'Fully built';
      if (!affordable) return `Need ${cost - gold} more gold`;
      return `${tier === 0 ? `Build ${tierName(p, 1)}` : `Upgrade to ${tierName(p, tier + 1)}`} — ${cost} gold`;
    });
    const tierWords = (t) => {
      const perk = perkOf(p, t);
      return `${tierName(p, t)}${perk ? ` · ${perk.words[0]}` : ''}`;
    };
    const nowWords = word('now', () => (tier ? tierWords(tier) : 'a little shack'));
    const nextWords = word('next', () => (maxed ? 'all done!' : tierWords(tier + 1)));
    return { tier, max, cost, maxed, affordable, label, now: nowWords, next: nextWords };
  }
  function rankOf(cfg) {
    const ranks = Array.isArray(I.RANKS) ? I.RANKS : [];
    let tiers = typeof I.tiersBuilt === 'function' ? call(I.tiersBuilt, cfg) : null;
    if (!Number.isInteger(tiers)) tiers = plots().reduce((n, p) => n + ((cfg && cfg.t && cfg.t[p.id]) | 0), 0);
    let k = 0;
    for (let j = 0; j < ranks.length; j++) if (tiers >= ranks[j].from) k = j;
    const r = typeof I.rank === 'function' ? call(I.rank, cfg) : null;
    const name = (r && typeof r.name === 'string' && r.name) || (ranks[k] && ranks[k].name) || '';
    const next = ranks[k + 1] || null;
    return { name, tiers, next, all: plots().reduce((n, p) => n + (Array.isArray(p.costs) ? p.costs.length : 3), 0) };
  }
  const villagersOf = (cfg) => {
    const v = typeof I.villagers === 'function' ? call(I.villagers, cfg) : null;
    return Number.isInteger(v) ? v : 0;
  };

  // ---- state ----
  let active = false;
  let tab = 'home';
  let lastBuild = { id: '', at: -Infinity };
  let celebrateUntil = 0;
  let swallowUntil = 0; // the tap that skipped the montage does nothing else
  let swallowed = null; // the key event that skipped it (main routes it here too)
  let glidedTo = null;
  const refused = new Set(); // plots whose build storage refused (until the next try)

  // ---------------------------------------------------------------------------------------------
  // Static DOM
  // ---------------------------------------------------------------------------------------------
  el.chest.innerHTML = `${CHEST_SVG}<span><span class="chest-label">Treasure chest: </span><b id="build-chest-gold">0</b> gold</span>`;
  el.chest.classList.add('dock-chest');
  const chestGold = el.chest.querySelector('b');
  let town = el.head.querySelector('#build-town');
  if (!town) {
    town = document.createElement('p');
    town.id = 'build-town';
    town.className = 'build-town';
    el.head.appendChild(town);
  }
  let note = el.body.querySelector('#build-note');
  if (!note) {
    note = document.createElement('p');
    note.id = 'build-note';
    note.className = 'build-note';
    el.body.insertBefore(note, el.body.firstChild);
  }
  el.panel.classList.add('build-panel');
  const rows = new Map(); // id -> { li, btn, ... }
  for (const kind of ['home', 'amenity']) {
    const list = el.lists[kind];
    list.innerHTML = '';
    for (const p of plots().filter((q) => q.kind === kind)) {
      const li = document.createElement('li');
      li.className = 'up-row build-row';
      li.dataset.plot = p.id;
      const ids = ['name', 'tier', 'now', 'next'].map((k) => `build-${k}-${p.id}`);
      li.innerHTML =
        `<span class="up-ico" aria-hidden="true">${ICONS[p.id] || ICONS.homeA}</span>` +
        '<span class="pips b-pips" aria-hidden="true"></span>' +
        `<div class="up-head"><h3 class="up-name" id="${ids[0]}">${esc(p.name)}</h3>` +
        `<span class="b-tier-word" id="${ids[1]}"></span></div>` +
        `<p class="b-line b-now" id="${ids[2]}"><span class="b-label">Now:</span> <span class="b-text"></span></p>` +
        `<p class="b-line b-next" id="${ids[3]}"><span class="b-label">Next:</span> <span class="b-text"></span></p>` +
        `<div class="b-buy"><button type="button" class="buy-btn b-btn" data-plot="${p.id}" aria-describedby="${ids.join(' ')}"></button></div>`;
      list.appendChild(li);
      rows.set(p.id, {
        li,
        btn: li.querySelector('.b-btn'),
        pips: li.querySelector('.pips'),
        tier: li.querySelector('.b-tier-word'),
        now: li.querySelector('.b-now .b-text'),
        next: li.querySelector('.b-next .b-text'),
        sig: '',
      });
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------------------------
  function renderChest() {
    chestGold.textContent = String(purse());
  }
  function bumpChest() {
    el.chest.classList.remove('bump');
    void el.chest.offsetWidth;
    el.chest.classList.add('bump');
  }
  function renderTown(cfg) {
    const r = rankOf(cfg);
    const v = villagersOf(cfg);
    town.innerHTML = `${TOWN_SVG}<span><span class="bt-word">Villagers </span><b>${v}</b> · <b>${esc(r.name)}</b></span><span class="sr-only"> (the town's rank: ${r.tiers} of ${r.all} builds)</span>`;
    if (!r.next) note.innerHTML = `<b>Pirate Capital!</b> Every plot is fully built. Polly has the Governor's coat for you!`;
    else {
      const left = r.next.from - r.tiers;
      note.innerHTML = r.tiers === 0 ? `What shall we build, Cap'n? <b>${plural(left, 'more build')}</b> and Sparrow's is a ${esc(r.next.name)}!` : `<b>${plural(left, 'more build')}</b> and your island becomes a ${esc(r.next.name)}!`;
    }
  }
  function renderRows() {
    const cfg = islandNow();
    const gold = purse();
    for (const p of plots()) {
      const row = rows.get(p.id);
      if (!row) continue;
      const st = stateOf(cfg, gold, p);
      const isRefused = refused.has(p.id) && !st.maxed;
      const sig = `${st.tier}|${st.cost}|${st.affordable}|${isRefused}|${st.label}|${st.now}|${st.next}`;
      if (sig === row.sig) continue;
      row.sig = sig;
      if (row.pips.children.length !== st.max) row.pips.innerHTML = '<i></i>'.repeat(st.max);
      [...row.pips.children].forEach((pip, k) => pip.classList.toggle('on', k < st.tier));
      row.tier.textContent = `Tier ${st.tier} of ${st.max}`;
      row.now.textContent = st.now;
      row.next.textContent = st.next;
      const b = row.btn;
      let state;
      if (st.maxed) {
        state = 'done';
        b.innerHTML = `<span class="tick" aria-hidden="true">&#10003;</span><span class="b-word">${esc(st.label)}</span>`;
      } else if (isRefused) {
        state = 'refused';
        b.innerHTML = '<span class="b-word">Couldn\'t save: storage is full or switched off</span>';
      } else if (!st.affordable) {
        state = 'poor';
        b.innerHTML = `<span class="b-word">${esc(st.label)}</span>`;
      } else {
        state = 'can';
        b.innerHTML = `<span class="coin" aria-hidden="true"></span><span class="b-word">${esc(st.label)}</span>`;
      }
      b.dataset.state = state;
      b.setAttribute('aria-disabled', String(state === 'done' || state === 'poor'));
      row.li.classList.toggle('maxed', st.maxed);
      row.li.classList.toggle('poor', state === 'poor');
      row.li.classList.toggle('refused', state === 'refused');
    }
    renderTown(cfg);
  }
  function render() {
    renderChest();
    renderRows();
  }

  // ---------------------------------------------------------------------------------------------
  // Tabs (←/→/Home/End, like the shipyard's and Polly's)
  // ---------------------------------------------------------------------------------------------
  function setTab(name, focusTab = true) {
    tab = name === 'amenity' ? 'amenity' : 'home';
    el.tabs.forEach((t, i) => {
      const on = (i === 1) === (tab === 'amenity');
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    el.lists.home.hidden = tab !== 'home';
    el.lists.amenity.hidden = tab !== 'amenity';
    el.body.scrollTop = 0;
    if (focusTab) focus(el.tabs[tab === 'amenity' ? 1 : 0]);
  }
  el.tabs.forEach((t, i) => {
    t.addEventListener('click', () => {
      if (!swallowTap()) setTab(i === 1 ? 'amenity' : 'home');
    });
    t.addEventListener('keydown', (e) => {
      let j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') j = 1 - i;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = 1;
      if (j < 0 || celebrating()) return;
      e.preventDefault();
      e.stopPropagation();
      setTab(j === 1 ? 'amenity' : 'home');
    });
  });

  // ---------------------------------------------------------------------------------------------
  // The camera follows the row in focus, or the row tapped
  // ---------------------------------------------------------------------------------------------
  function glide(id) {
    if (!active || !id || id === glidedTo) return;
    glidedTo = id;
    for (const [k, r] of rows) r.li.classList.toggle('looking', k === id);
    call(C.focusPlot, id);
  }
  for (const list of Object.values(el.lists)) {
    list.addEventListener('focusin', (e) => {
      const li = e.target instanceof Element && e.target.closest('.build-row');
      if (li) glide(li.dataset.plot);
    });
    list.addEventListener('click', (e) => {
      if (!(e.target instanceof Element)) return;
      const b = e.target.closest('.b-btn');
      if (b) {
        build(b.dataset.plot, e);
        return;
      }
      const li = e.target.closest('.build-row');
      if (li && !swallowTap()) glide(li.dataset.plot);
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Building, and the montage that any key or tap skips
  // ---------------------------------------------------------------------------------------------
  const celebrating = () => now() < celebrateUntil;
  function skip() {
    if (!celebrating()) return false;
    celebrateUntil = 0;
    window.removeEventListener('pointerdown', onTapSkip, true);
    call(C.skipCelebration);
    return true;
  }
  function onTapSkip() {
    if (skip()) swallowUntil = now() + 600;
  }
  function swallowTap() {
    if (celebrating()) {
      skip();
      return true;
    }
    return now() < swallowUntil;
  }

  function build(id, e = null) {
    if (!active) return false;
    if (swallowTap()) return false;
    const p = plotOf(id);
    const row = rows.get(id);
    if (!p || !row) return false;
    const t = now();
    const at = e && e.timeStamp > 0 && e.timeStamp <= t ? e.timeStamp : t;
    if (lastBuild.id === id && ((e && e.detail > 1) || at - lastBuild.at < BUILD_GUARD)) return false;
    const before = islandNow();
    const gold = purse();
    const st = stateOf(before, gold, p);
    if (st.maxed) {
      announce(`${p.name} is fully built.`);
      return false;
    }
    if (!st.affordable) {
      announce(`${tierName(p, st.tier + 1)} costs ${st.cost} gold. You need ${st.cost - gold} more gold.`);
      return false;
    }
    const rankBefore = rankOf(before).name;
    const villagersBefore = villagersOf(before);
    const r = C.island ? call(C.island.build && C.island.build.bind(C.island), id) : undefined;
    const ok = r === true || (r && r.ok === true);
    if (!ok) {
      const reason = r && typeof r === 'object' ? r.reason : 'storage';
      if (reason === 'poor' || reason === 'maxed' || reason === 'unknown') {
        render();
        announce(reason === 'maxed' ? `${p.name} is fully built.` : reason === 'poor' ? `You need more gold for ${tierName(p, st.tier + 1)}.` : `Couldn't build at ${p.name}.`);
      } else {
        refused.add(id);
        render();
        announce("Couldn't save: your browser's storage is full or switched off. Nothing was paid.");
      }
      return false;
    }
    lastBuild = { id, at: now() };
    refused.delete(id);
    const after = islandNow();
    const tier = stateOf(after, purse(), p).tier;
    render();
    bumpChest();
    sfx('coin');
    sfx('build');
    // the montage: its own length, skippable
    const secs = call(C.celebrate, id, tier);
    const len = Number.isFinite(secs) && secs >= 0 ? secs : MONTAGE;
    if (len > 0) {
      celebrateUntil = now() + len * 1000;
      window.addEventListener('pointerdown', onTapSkip, true);
    }
    // what changed, in words
    const name = tierName(p, tier);
    let say;
    if (p.kind === 'home') {
      const moved = villagersOf(after) - villagersBefore;
      say = `${name} built at ${p.name}.${moved > 0 ? ` ${plural(moved, tier > 1 ? 'more villager' : 'villager')} moved in.` : ''}`;
    } else {
      const perk = perkOf(p, tier);
      say = `${name} built at ${p.name}!${perk && perk.words[1] ? ` ${perk.words[1]}` : ''}`;
    }
    const rankAfter = rankOf(after).name;
    if (rankAfter && rankAfter !== rankBefore) say += ` Your island is now a ${rankAfter}!`;
    announce(say);
    return true;
  }

  // ---------------------------------------------------------------------------------------------
  // Keys
  // ---------------------------------------------------------------------------------------------
  const MODIFIERS = new Set(['shift', 'control', 'alt', 'meta', 'capslock']);
  // Inside the panel: a held Enter or Space never presses twice; during the montage a key only skips it.
  el.panel.addEventListener('keydown', (e) => {
    if (!active) return;
    if (celebrating() && !MODIFIERS.has(String(e.key || '').toLowerCase())) {
      // (a held key's auto-repeat is the same press that built: it doesn't skip the montage)
      e.preventDefault();
      e.stopPropagation();
      swallowed = e;
      if (!e.repeat) skip();
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.repeat && e.target instanceof HTMLButtonElement) e.preventDefault();
  });
  function onKey(e, down) {
    if (!active || !e || !down) return false;
    if (e === swallowed) return true;
    const k = String(e.key || '').toLowerCase();
    if (celebrating() && !MODIFIERS.has(k)) {
      e.preventDefault();
      if (!e.repeat) skip();
      return true;
    }
    if (k === 'escape') {
      e.preventDefault();
      if (!e.repeat) call(C.back);
      return true;
    }
    if ((k === 'enter' || k === ' ') && e.repeat) {
      e.preventDefault();
      return true;
    }
    return false;
  }

  el.back.addEventListener('click', () => {
    if (!swallowTap()) call(C.back);
  });

  // ---------------------------------------------------------------------------------------------
  // Open, close, refresh
  // ---------------------------------------------------------------------------------------------
  function open() {
    if (active) return true;
    active = true;
    glidedTo = null;
    refused.clear();
    lastBuild = { id: '', at: -Infinity };
    for (const r of rows.values()) {
      r.sig = '';
      r.li.classList.remove('looking');
    }
    el.root.classList.remove('hidden');
    render();
    setTab('home', true);
    const cfg = islandNow();
    const r = rankOf(cfg);
    announce(`Builder Bess. Build homes and amenities on the island. Villagers: ${villagersOf(cfg)}. Your island is a ${r.name}.`);
    return true;
  }
  function close() {
    if (!active) return;
    skip();
    active = false;
    celebrateUntil = 0;
    window.removeEventListener('pointerdown', onTapSkip, true);
    el.root.classList.add('hidden');
    if (el.root.contains(document.activeElement) && document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }
  function refresh() {
    if (!active) return;
    for (const r of rows.values()) r.sig = '';
    render();
  }

  // ---------------------------------------------------------------------------------------------
  // Test hooks (__game.island / the ashore suite route here through townMode)
  // ---------------------------------------------------------------------------------------------
  const api = {
    showTab: (name) => (active ? (setTab(name === 'amenities' || name === 'amenity' ? 'amenity' : 'home', false), true) : false),
    build: (id) => {
      if (celebrating()) skip();
      swallowUntil = 0;
      lastBuild = { id: '', at: -Infinity };
      return build(id);
    },
    focus: (id) => {
      const r = rows.get(id);
      if (!active || !r) return false;
      setTab(plotOf(id).kind, false);
      focus(r.btn);
      return true;
    },
    skip: () => skip(),
    get celebrating() {
      return active && celebrating();
    },
    get tab() {
      return tab === 'amenity' ? 'amenities' : 'homes';
    },
    get looking() {
      return glidedTo;
    },
    get rows() {
      return [...rows.entries()].map(([id, r]) => ({
        id,
        tier: r.tier.textContent,
        now: r.now.textContent,
        next: r.next.textContent,
        button: (r.btn.querySelector('.b-word') || r.btn).textContent.trim(), // the button's name (the ✓ is aria-hidden)
        state: r.btn.dataset.state || '',
        disabled: r.btn.getAttribute('aria-disabled') === 'true',
      }));
    },
    get panel() {
      return el.panel;
    },
  };

  return {
    open,
    close,
    onKey,
    refresh,
    get active() {
      return active;
    },
    api,
  };
}
