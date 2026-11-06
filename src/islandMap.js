// The Island map (SPEC4 §8.5): a non-modal overlay (#island-map, opened with I or the Harbour menu's Island map
// button) with a parchment map of Sparrow's Floating Island drawn from the walk data and islandPlan's districts, a
// "You are here" pin, and a district-grouped list of >= 44 px buttons: each district, each plot and each islander
// there; a pick offers Walk there or Hop there (a plot or a district) or opens a chat (an islander). Keyboard and
// screen-reader users reach every district, plot and chat without walking.
//
// createIslandMap({ root, ctx }) -> { open(), close(), onKey(e, down) -> handled, refresh(), get active }
// ctx: { plan, walk, captain(), islanders(), plots(), walkTo(id), hop(id), talk(id) }
//
// root: the #island-map section (ids looked up inside it, then in the document; a missing one is replaced by a
//   detached element, so a partial page never throws).
// ctx (every member optional; a throwing member counts as missing):
//   plan          islandPlan.js's exports (DISTRICTS, DECKS, PADS, PLOT_PLACES, HOPS, ARCHES, districtAt, walkData4…);
//                 this module's own import of islandPlan.js when missing
//   walk          env.walk (or a function giving it): areas, links (pts, hw), blockers (a pad's: `pad`), places, hops,
//                 districts (poly, colour); without it the map draws islandPlan's decks and links only
//   captain() -> { x, z, h }                         where the "You are here" pin goes, and the district you are in
//   islanders() -> [{ id, name, x, z, district? }]   the islanders out now ("Talk to Ada"; their district: theirs, or
//                 where they stand, islandPlan districtAt)
//   plots() -> [{ id, name?, tier, max? }]           the 21 plots' tiers ("Treehouse · Tier 2"; without it no tiers)
//   walkTo(id) -> boolean   the captain auto-walks there: 'plot:<id>' (the plot board's place) or 'hop:<district>'
//                 (the district's hop point, walk.hops). Called after the map has closed (onClose ran).
//   hop(id) -> { ok, why } | boolean   Hop there (a 0.6 s fade, a cut under reduced motion) to the same ids; called
//                 with the map still open: refused ({ ok: false, why: "Finish building first!" }) it stays open and
//                 says why; done, the map closes
//   talk(id) -> boolean     an islander's chat bubble, at once (called after the map has closed)
//   onClose(reason)         the map closed itself ('esc' | 'close' | 'walk' | 'hop' | 'talk'): townMode leaves its view 'map'
//   announce(text)          said in #town-live after the map has closed (a walk that found no way)
//   reducedMotion() -> boolean
// Keys (onKey, while open): Esc (or I) closes and returns focus where it was; in the list ↑ ↓ Home End move between
//   the places (one Tab stop: Tab goes on to Walk there), Enter / Space pick; movement keys do nothing while it's open.
//   #map-live says each pick.
import * as PLAN0 from './islandPlan.js';
import { PLOT_ICONS } from './buildPanel.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const r2 = (v) => Math.round(v * 100) / 100;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const DEG = 180 / Math.PI;
const SMALL = 3.2; // px per world unit below which the map is "small" (a phone's 300 px map): smaller names, a plain pin
// The districts' colours (islandPlan's; never the only cue: names, icons and places say it too) and their tints
const DCOL = { harbour: '#2f6fd8', windmill: '#5fcfa8', lantern: '#f28c28', lighthouse: '#1fa3a3', beach: '#ff7f6a', hill: '#6cbf4a' };
const DTINT = { harbour: '#cfe0fb', windmill: '#c9f2e4', lantern: '#ffdcb8', lighthouse: '#bfeaea', beach: '#ffd6cf', hill: '#d5efc6' };
const hex = (n) => (fin(n) ? `#${Math.max(0, Math.min(0xffffff, Math.round(n))).toString(16).padStart(6, '0')}` : null);
// Movement keys (swallowed while the map is up: the captain stays put)
const MOVE = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'c', 'e', 'p', 'm']);
// a speech bubble (Talk to …)
const TALK_SVG =
  '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M5 7.5h22a2.5 2.5 0 0 1 2.5 2.5v11A2.5 2.5 0 0 1 27 23.5H14l-6.5 5v-5H5A2.5 2.5 0 0 1 2.5 21V10A2.5 2.5 0 0 1 5 7.5z" fill="#fff" stroke="#1d1330" stroke-width="2" stroke-linejoin="round"/>' +
  '<circle cx="10.5" cy="15.6" r="1.8" fill="#1d1330"/><circle cx="16" cy="15.6" r="1.8" fill="#1d1330"/><circle cx="21.5" cy="15.6" r="1.8" fill="#1d1330"/></svg>';
// the harbour's places on the map (32 × 32 glyphs, ink on paper): a mug of grog, an anchor, a tricorn, a bell, a hammer
const G_INK = 'stroke="#1d1330" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"';
const PLACE_GLYPH = {
  tavern: `<g ${G_INK}><path d="M8 9h13v16a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z" fill="#c07b3a"/><path d="M21 12h3a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-3" fill="none"/><path d="M7 9c0-3 2.6-4.6 5-3.6 1.4-2 5-2 6.4.2 2.6-.6 4 1.4 3.6 3.4z" fill="#fffaf0"/></g>`,
  shipyard: `<g ${G_INK} fill="none"><circle cx="16" cy="7" r="2.8" fill="#ffc93c"/><path d="M16 10v17M10.5 14.5h11M6.5 19.5c0 4.6 4.2 7.6 9.5 7.6s9.5-3 9.5-7.6" stroke-width="3"/></g>`,
  tailor: `<g ${G_INK}><path d="M3.5 19c3.4-6 8-9.6 12.5-9.6S25.1 13 28.5 19c-4 2.6-8.2 3.4-12.5 3.4S7.5 21.6 3.5 19z" fill="#2c2440"/><path d="M8 18.4c2.6 1.2 5.2 1.6 8 1.6s5.4-.4 8-1.6" fill="none" stroke="#ffc93c" stroke-width="2"/></g>`,
  quiz: `<g ${G_INK}><path d="M16 5c-5 0-7.4 3.6-7.4 9v5l-2.8 4.4h20.4l-2.8-4.4v-5C23.4 8.6 21 5 16 5z" fill="#ffc93c"/><circle cx="16" cy="26.4" r="2.4" fill="#c07b3a"/></g>`,
  builder: `<g ${G_INK}><path d="M6 26.6l11-11" fill="none" stroke-width="3.6"/><path d="M14.4 5l3-.8 8.6 8.6-2 2-2.4-2.4-4.4 4.4-4-4 4.4-4.4z" fill="#8b5a2b"/></g>`,
};
// the district's own little picture (its landmark)
const DIST_SVG = {
  harbour: '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g stroke="#1d1330" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><circle cx="16" cy="7" r="3" fill="#ffc93c"/><path d="M16 10v17M10 15h12" fill="none" stroke-width="2.6"/><path d="M6 19c0 5 4.4 8.4 10 8.4S26 24 26 19" fill="none" stroke-width="2.6"/><path d="M3.6 20.4L6 17l2.6 3.2zM23.4 20.2L26 17l2.4 3.4z" fill="#1d1330"/></g></svg>',
};

export function createIslandMap({ root = null, ctx = null } = {}) {
  const C = ctx && typeof ctx === 'object' ? ctx : {};
  const R = root || (typeof document !== 'undefined' ? document.getElementById('island-map') : null) || document.createElement('section');
  const $ = (id, tag = 'div') => (R.querySelector && R.querySelector(`#${id}`)) || document.getElementById(id) || (tag === 'svg' ? document.createElementNS(SVGNS, 'svg') : document.createElement(tag));
  const el = {
    root: R,
    panel: (R.querySelector && R.querySelector('.dock-panel')) || R,
    title: $('map-title', 'h2'),
    svg: $('map-svg', 'svg'),
    list: $('map-list'),
    walk: $('map-walk-btn', 'button'),
    hop: $('map-hop-btn', 'button'),
    close: $('map-close-btn', 'button'),
    live: $('map-live', 'p'),
  };
  el.exits = (el.panel.querySelector && el.panel.querySelector('.dock-exits')) || el.panel;

  // ---- ctx helpers ----
  const call = (fn, ...a) => {
    try {
      return typeof fn === 'function' ? fn(...a) : undefined;
    } catch (err) {
      console.error(err); // eslint-disable-line no-console
      return undefined;
    }
  };
  const arr = (v) => (Array.isArray(v) ? v : []);
  const plan = () => (C.plan && typeof C.plan === 'object' ? C.plan : PLAN0);
  const walkNow = () => {
    const w = typeof C.walk === 'function' ? call(C.walk) : C.walk;
    return w && typeof w === 'object' ? w : null;
  };
  const reduced = () => {
    const r = call(C.reducedMotion);
    if (typeof r === 'boolean') return r;
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  };
  function announce(text) {
    if (!text) return;
    el.live.textContent = el.live.textContent === text ? `${text} ` : text;
  }
  const focus = (node) => {
    if (node && node.focus) node.focus({ preventScroll: false });
  };

  // ---- the plan's facts (read at run time) ----
  function districts() {
    const P = plan();
    const list = arr(P.DISTRICTS).filter((d) => d && typeof d.id === 'string');
    return list.length ? list : Object.keys(DCOL).map((id) => ({ id, name: id, plots: [] }));
  }
  const districtName = (id) => (districts().find((d) => d.id === id) || { name: id }).name;
  function districtAt(x, z) {
    const P = plan();
    if (!fin(x) || !fin(z) || typeof P.districtAt !== 'function') return null;
    const d = call(P.districtAt, x, z);
    return typeof d === 'string' ? d : null;
  }
  function captain() {
    const c = call(C.captain);
    return c && fin(c.x) && fin(c.z) ? { x: c.x, z: c.z, h: fin(c.h) ? c.h : 0 } : null;
  }
  // every plot: its name, its district, its tier (ctx.plots()), its pad (walk's blocker, else islandPlan's PADS)
  function plotsNow() {
    const P = plan();
    const given = arr(call(C.plots));
    const byId = new Map(given.filter((q) => q && typeof q.id === 'string').map((q) => [q.id, q]));
    const places = arr(P.PLOT_PLACES);
    const w = walkNow();
    const padOf = (id) => {
      const b = w ? arr(w.blockers).find((q) => q && q.pad === id) : null;
      if (b && fin(b.x) && fin(b.z) && fin(b.w) && fin(b.d)) return { x: b.x, z: b.z, w: b.w, d: b.d, ry: fin(b.ry) ? b.ry : 0 };
      const pd = P.PADS && P.PADS[id] && P.PADS[id].world;
      return pd && fin(pd.x) ? { x: pd.x, z: pd.z, w: pd.w, d: pd.d, ry: pd.ry || 0 } : null;
    };
    const out = [];
    for (const D of districts()) {
      for (const id of arr(D.plots)) {
        const g = byId.get(id) || {};
        const pl = places.find((q) => q && q.plot === id) || null;
        const name = (typeof g.name === 'string' && g.name) || (pl && pl.name) || id;
        const max = Number.isInteger(g.max) ? g.max : 3;
        const tier = Number.isInteger(g.tier) ? Math.max(0, Math.min(max, g.tier)) : null;
        out.push({ id, name, district: D.id, tier, max, pad: padOf(id), place: pl ? `plot:${id}` : null });
      }
    }
    return out;
  }
  function islandersNow() {
    const out = [];
    for (const q of arr(call(C.islanders))) {
      if (!q || typeof q.id !== 'string' || typeof q.name !== 'string') continue;
      const d = (typeof q.district === 'string' && q.district) || districtAt(q.x, q.z);
      out.push({ id: q.id, name: q.name, x: fin(q.x) ? q.x : null, z: fin(q.z) ? q.z : null, district: d });
    }
    return out;
  }
  function hopOf(district) {
    const w = walkNow();
    const list = [...arr(w && w.hops), ...arr(plan().HOPS)];
    return list.find((h) => h && h.district === district) || null;
  }

  // ---- state ----
  let active = false;
  let opener = null; // the element focused before open (focus returns there)
  let pick = null; // { kind: 'district' | 'plot', id, name }
  let here = null; // the district the captain is in
  let shown = { plots: [], islanders: [] };
  let vb = { x: 0, z: 0, w: 100, h: 80 };
  let lastSig = '';
  let marks = []; // the harbour's tavern and ship (boxes the names keep off)

  // ---------------------------------------------------------------------------------------------
  // Static DOM: the footer's picked line, the list's live hint
  // ---------------------------------------------------------------------------------------------
  let picked = el.exits.querySelector ? el.exits.querySelector('.map-picked') : null;
  if (!picked) {
    picked = document.createElement('p');
    picked.className = 'map-picked';
    picked.id = 'map-picked';
    el.exits.insertBefore(picked, el.exits.firstChild);
  }
  let where = el.panel.querySelector ? el.panel.querySelector('.map-where') : null;
  if (!where) {
    where = document.createElement('p');
    where.className = 'map-where';
    if (el.title.parentNode === el.panel) el.panel.insertBefore(where, el.title.nextSibling);
  }
  el.panel.classList.add('map-panel');
  el.list.setAttribute('role', 'group');
  el.list.setAttribute('aria-label', 'Places on the island');
  for (const b of [el.walk, el.hop]) b.setAttribute('aria-describedby', 'map-picked');
  // (Close: its word, or on the narrowest phones a cross with the word kept for screen readers)
  el.close.innerHTML = '<svg class="mc-x" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4.5 4.5l11 11M15.5 4.5l-11 11" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg><span class="mc-word">Close</span>';

  // ---------------------------------------------------------------------------------------------
  // The map (SVG): sea, districts, decks and bridges, buildings, islanders, names, the pin
  // ---------------------------------------------------------------------------------------------
  const iconSymbols = () =>
    Object.entries(PLOT_ICONS)
      .map(([id, s]) => String(s).replace(/^<svg[^>]*>/, `<symbol id="mi-${id}" viewBox="0 0 32 32">`).replace(/<\/svg>\s*$/, '</symbol>'))
      .join('');
  function bounds(decks, links) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    const add = (x, z, r = 0) => {
      if (!fin(x) || !fin(z)) return;
      x0 = Math.min(x0, x - r);
      x1 = Math.max(x1, x + r);
      z0 = Math.min(z0, z - r);
      z1 = Math.max(z1, z + r);
    };
    for (const D of decks) add(D.x, D.z, D.r !== undefined ? D.r : Math.hypot(D.w || 0, D.d || 0) / 2);
    for (const L of links) for (const p of arr(L.pts)) add(p[0], p[2]);
    if (!fin(x0)) return { x: -50, z: -70, w: 100, h: 80 };
    const m = 3;
    return { x: r2(x0 - m), z: r2(z0 - m - 2), w: r2(x1 - x0 + 2 * m), h: r2(z1 - z0 + 2 * m + 2) };
  }
  // A rect { x, z, w, d, ry } in the map: translate, then the world's yaw (SVG y is the world's z, so rotate by −ry)
  const rectAt = (q, cls, extra = '') =>
    `<rect class="${cls}" x="${r2(-q.w / 2)}" y="${r2(-q.d / 2)}" width="${r2(q.w)}" height="${r2(q.d)}" ${extra} transform="translate(${r2(q.x)} ${r2(q.z)}) rotate(${r2(-(q.ry || 0) * DEG)})"/>`;
  function deckList() {
    const P = plan();
    const decks = arr(P.DECKS).filter((D) => D && fin(D.x) && fin(D.z));
    if (decks.length) return decks;
    // (no plan: the walk areas, which sit a little inside the decks)
    const w = walkNow();
    return arr(w && w.areas).filter((a) => a && fin(a.x) && fin(a.z)).map((a) => (a.kind === 'circle' ? { id: a.id, x: a.x, z: a.z, r: a.r + 0.65 } : { id: a.id, x: a.x, z: a.z, w: a.w + 1.3, d: a.d + 1.3, ry: a.ry || 0 }));
  }
  function linkList() {
    const w = walkNow();
    const links = arr(w && w.links).filter((L) => L && Array.isArray(L.pts) && L.pts.length > 1);
    const kinds = new Map(arr(plan().LINKS).map((L) => [L.id, L.kind]));
    return links.map((L) => ({ id: L.id, pts: L.pts, hw: fin(L.hw) ? L.hw : 0.3, kind: kinds.get(L.id) || (L.hw > 0.4 ? 'board' : 'rope') }));
  }
  function shapes() {
    const w = walkNow();
    let list = arr(w && w.districts);
    if (!list.length && typeof plan().walkData4 === 'function') list = arr((call(plan().walkData4, {}, []) || {}).districts);
    return list.filter((d) => d && typeof d.id === 'string' && Array.isArray(d.poly) && d.poly.length > 2);
  }
  function drawStatic() {
    const decks = deckList();
    const links = linkList();
    vb = bounds(decks, links);
    const parts = [];
    parts.push(`<defs>${iconSymbols()}<pattern id="map-waves" width="8" height="5" patternUnits="userSpaceOnUse"><path d="M0.6 3.2c1.2-1.3 2.4-1.3 3.4 0s2.2 1.3 3.4 0" fill="none" stroke="#7fb2c6" stroke-width="0.32" stroke-linecap="round"/></pattern></defs>`);
    // the sea: parchment washed with blue, and its little waves
    parts.push(`<rect class="mp-paper" x="${vb.x}" y="${vb.z}" width="${vb.w}" height="${vb.h}" rx="2.4"/>`);
    parts.push(`<rect class="mp-sea" x="${r2(vb.x + 1)}" y="${r2(vb.z + 1)}" width="${r2(vb.w - 2)}" height="${r2(vb.h - 2)}" rx="1.8"/>`);
    parts.push(`<rect x="${r2(vb.x + 1)}" y="${r2(vb.z + 1)}" width="${r2(vb.w - 2)}" height="${r2(vb.h - 2)}" rx="1.8" fill="url(#map-waves)" opacity="0.55"/>`);
    // the districts: tinted outlines
    parts.push('<g class="mp-districts">');
    for (const S of shapes()) {
      const col = DCOL[S.id] || hex(S.colour) || '#888';
      parts.push(`<polygon class="mp-dist" data-district="${esc(S.id)}" points="${S.poly.map((p) => `${r2(p[0])},${r2(p[1])}`).join(' ')}" fill="${DTINT[S.id] || col}" stroke="${col}"/>`);
    }
    parts.push('</g>');
    // the bridges and boardwalks under the decks
    parts.push('<g class="mp-links">');
    for (const L of links) {
      const d = `M${L.pts.map((p) => `${r2(p[0])} ${r2(p[2])}`).join('L')}`;
      if (L.kind === 'rope') parts.push(`<path class="mp-rope" d="${d}"/>`);
      else parts.push(`<path class="mp-board-edge" d="${d}" stroke-width="${r2(L.hw * 2 + 0.7)}"/><path class="mp-board" d="${d}" stroke-width="${r2(L.hw * 2 + 0.2)}"/>`);
    }
    parts.push('</g>');
    // the decks, their porches, the islets and the pier
    parts.push('<g class="mp-decks">');
    for (const D of decks) {
      if (D.r !== undefined) {
        const cls = D.id === 'hill' ? 'mp-hill' : 'mp-sand';
        parts.push(`<circle class="${cls}" cx="${r2(D.x)}" cy="${r2(D.z)}" r="${r2(D.r)}"/>`);
        if (D.id === 'hill') parts.push(`<circle class="mp-hilltop" cx="${r2(D.x)}" cy="${r2(D.z)}" r="${r2(D.r * 0.42)}"/>`);
        continue;
      }
      for (const q of arr(D.porches)) if (fin(q.x) && fin(q.w)) parts.push(rectAt(q, 'mp-porch'));
      parts.push(rectAt(D, 'mp-deck', 'rx="0.35"'));
    }
    parts.push('</g>');
    // the harbour's own: the tavern and the ship
    const w = walkNow();
    const place = (id) => arr(w && w.places).find((p) => p && p.id === id);
    const ship = place('ship');
    parts.push('<g class="mp-marks">');
    marks = [];
    // the harbour's places (the places bar's): the tavern, the shipyard, the tailor, the quiz bell and Bess
    for (const [id, glyph] of Object.entries(PLACE_GLYPH)) {
      const p = place(id);
      if (!p || !fin(p.x) || !fin(p.z)) continue;
      marks.push([p.x - 2.2, p.z - 2.2, p.x + 2.2, p.z + 2.2]);
      parts.push(`<g class="mp-place" transform="translate(${r2(p.x)} ${r2(p.z)})"><circle r="2.1" fill="#fffaf0" stroke="#1d1330" stroke-width="0.3"/><g transform="scale(0.11) translate(-16 -16)">${glyph}</g></g>`);
    }
    if (ship && fin(ship.x)) marks.push([ship.x - 3.6, ship.z - 2.6, ship.x + 3.6, ship.z + 4.4]);
    if (ship && fin(ship.x))
      parts.push(
        `<g transform="translate(${r2(ship.x)} ${r2(ship.z + 2.6)})"><path d="M-3.6 -0.6h7.2l-1.4 2.2h-4.4z" fill="#c07b3a" stroke="#1d1330" stroke-width="0.32" stroke-linejoin="round"/><path d="M0 -0.6v-4.4" stroke="#1d1330" stroke-width="0.32"/><path d="M0.2 -4.8l2.8 2.4h-2.8z" fill="#fffaf0" stroke="#1d1330" stroke-width="0.28" stroke-linejoin="round"/></g>`,
      );
    parts.push('</g>');
    // the live layers: buildings, islanders, names, the pick, the pin
    parts.push('<g class="mp-plots"></g><g class="mp-people"></g><g class="mp-pick"></g><g class="mp-names"></g><g class="mp-pin"></g>');
    // a compass rose (north is up)
    const cx = r2(vb.x + vb.w - 5.2);
    const cz = r2(vb.z + 8.2);
    parts.push(
      `<g class="mp-compass" transform="translate(${cx} ${cz})"><circle r="3.6" fill="#fffaf0" stroke="#1d1330" stroke-width="0.3"/><path d="M0 -3.1L1 0H-1z" fill="#e2383d" stroke="#1d1330" stroke-width="0.22" stroke-linejoin="round"/><path d="M0 3.1L1 0H-1z" fill="#fff" stroke="#1d1330" stroke-width="0.22" stroke-linejoin="round"/><text class="mp-n" y="-4.3" text-anchor="middle">N</text></g>`,
    );
    el.svg.setAttribute('viewBox', `${vb.x} ${vb.z} ${vb.w} ${vb.h}`);
    el.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    el.svg.innerHTML = parts.join('');
    el.svg.style.setProperty('--map-aspect', `${vb.w} / ${vb.h}`);
  }
  const layer = (cls) => (el.svg.querySelector ? el.svg.querySelector(`.${cls}`) : null);
  // px per world unit on screen now
  function scale() {
    const r = el.svg.getBoundingClientRect ? el.svg.getBoundingClientRect() : null;
    if (!r || !r.width || !r.height) return 4;
    return Math.min(r.width / vb.w, r.height / vb.h);
  }
  function labelPoint(S) {
    // the district's name: at the middle of its outline (the harbour's toward the plaza)
    let x = 0;
    let z = 0;
    for (const p of S.poly) {
      x += p[0];
      z += p[1];
    }
    x /= S.poly.length;
    z /= S.poly.length;
    if (S.id === 'harbour') z += 4;
    return [x, z];
  }
  function drawLive() {
    const k = scale();
    const px = (n) => r2(n / k); // n screen px in world units
    // buildings: built (tier >= 1) in the district's tint with their picture, else a dashed "Build me!" plot
    const P = layer('mp-plots');
    if (P) {
      const parts = [];
      for (const q of shown.plots) {
        if (!q.pad) continue;
        const built = q.tier !== null && q.tier >= 1;
        const s = Math.max(Math.min(q.pad.w, q.pad.d) * 1.05, px(18));
        parts.push(`<g class="mp-plot${built ? ' built' : ''}" data-plot="${esc(q.id)}">`);
        parts.push(rectAt(q.pad, 'mp-pad', `rx="0.5" fill="${built ? DTINT[q.district] || '#fff' : '#fffaf0'}"`));
        parts.push(`<use href="#mi-${esc(q.id)}" x="${r2(q.pad.x - s / 2)}" y="${r2(q.pad.z - s / 2)}" width="${r2(s)}" height="${r2(s)}"${built ? '' : ' opacity="0.5"'}/>`);
        parts.push('</g>');
      }
      P.innerHTML = parts.join('');
    }
    // islanders: little dots
    const Q = layer('mp-people');
    if (Q) Q.innerHTML = shown.islanders.filter((q) => fin(q.x) && fin(q.z)).map((q) => `<circle class="mp-folk" cx="${r2(q.x)}" cy="${r2(q.z)}" r="${px(4)}" stroke-width="${px(1.5)}"/>`).join('');
    // the districts' names (about 14 px on screen, on two lines where the map is small), each placed near its
    // district's middle where it covers the fewest buildings and stays on the map
    const N = layer('mp-names');
    if (N) {
      const fs = Math.max(1.6, Math.min(5.2, px(k < SMALL ? 11 : k < 5 ? 13 : 15)));
      const boxes = []; // what a name keeps off: the buildings, the harbour's marks, the pin, the names placed
      for (const q of shown.plots) {
        if (!q.pad) continue;
        const c = Math.abs(Math.cos(q.pad.ry || 0));
        const sn = Math.abs(Math.sin(q.pad.ry || 0));
        const hw = Math.max((q.pad.w * c + q.pad.d * sn) / 2, px(9));
        const hd = Math.max((q.pad.w * sn + q.pad.d * c) / 2, px(9));
        boxes.push([q.pad.x - hw, q.pad.z - hd, q.pad.x + hw, q.pad.z + hd]);
      }
      for (const m of marks) boxes.push(m);
      const cap = captain();
      if (cap) boxes.push(k < SMALL ? [cap.x - px(12), cap.z - px(30), cap.x + px(12), cap.z + px(2)] : [cap.x - px(46), cap.z - px(52), cap.x + px(46), cap.z + px(2)]);
      const inner = [vb.x + 1.2, vb.z + 1.2, vb.x + vb.w - 1.2, vb.z + vb.h - 1.2];
      const ovl = (A, B) => Math.max(0, Math.min(A[2], B[2]) - Math.max(A[0], B[0])) * Math.max(0, Math.min(A[3], B[3]) - Math.max(A[1], B[1]));
      const area = (A) => (A[2] - A[0]) * (A[3] - A[1]);
      const parts = [];
      for (const S of shapes()) {
        const [x0, z0] = labelPoint(S);
        const name = districtName(S.id);
        const words = String(name).split(' ');
        const two = words.length > 1 && name.length * fs * 0.62 > 30;
        const lines = two ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [name];
        const hw = (Math.max(...lines.map((t) => t.length)) * fs * 0.6) / 2 + fs * 0.2;
        const hh = (lines.length * fs * 1.05) / 2 + fs * 0.1;
        let best = null;
        for (const dz of [0, -3, 3, -6, 6, -9, 9, -12, 12, -15, 15]) {
          for (const dx of [0, -3, 3, -6, 6, -9, 9, -12, 12, -15, 15]) {
            const x = x0 + dx;
            const z = z0 + dz;
            const B = [x - hw, z - hh, x + hw, z + hh];
            let cost = Math.hypot(dx, dz) * 0.6;
            for (const O of boxes) cost += ovl(B, O) * 4;
            cost += (area(B) - ovl(B, inner)) * 60;
            if (!best || cost < best.cost) best = { x, z, B, cost };
          }
        }
        boxes.push(best.B);
        const y0 = best.z - hh + fs * 0.1 + fs * 0.82;
        parts.push(
          `<text class="mp-name" data-district="${esc(S.id)}" x="${r2(best.x)}" y="${r2(y0)}" font-size="${r2(fs)}" stroke-width="${r2(fs * 0.32)}" text-anchor="middle">` +
            lines.map((t, i) => `<tspan x="${r2(best.x)}" dy="${i ? r2(fs * 1.05) : 0}">${esc(t)}</tspan>`).join('') +
            '</text>',
        );
      }
      N.innerHTML = parts.join('');
    }
    drawPick(k);
    drawPin(k);
  }
  function drawPick(k = scale()) {
    const G = layer('mp-pick');
    if (!G) return;
    if (!pick) {
      G.innerHTML = '';
      return;
    }
    const px = (n) => r2(n / k);
    if (pick.kind === 'plot') {
      const q = shown.plots.find((p) => p.id === pick.id);
      if (!q || !q.pad) return (G.innerHTML = '');
      const R0 = Math.hypot(q.pad.w, q.pad.d) / 2 + px(6);
      G.innerHTML = `<circle class="mp-ring-ink" cx="${r2(q.pad.x)}" cy="${r2(q.pad.z)}" r="${r2(R0)}" stroke-width="${px(7)}"/><circle class="mp-ring" cx="${r2(q.pad.x)}" cy="${r2(q.pad.z)}" r="${r2(R0)}" stroke-width="${px(4)}"/>`;
    } else {
      const S = shapes().find((s) => s.id === pick.id);
      if (!S) return (G.innerHTML = '');
      const pts = S.poly.map((p) => `${r2(p[0])},${r2(p[1])}`).join(' ');
      G.innerHTML = `<polygon class="mp-ring-ink" points="${pts}" stroke-width="${px(7)}"/><polygon class="mp-ring" points="${pts}" stroke-width="${px(4)}"/>`;
    }
  }
  // "You are here": a red pin with a sparrow, a constant size on screen
  function drawPin(k = scale()) {
    const G = layer('mp-pin');
    if (!G) return;
    const c = captain();
    if (!c) {
      G.innerHTML = '';
      return;
    }
    const small = k < SMALL;
    const s = r2((small ? 0.8 : 1) / k); // 1 screen px (a small map: a smaller pin, its words in the header's chip)
    G.innerHTML =
      `<g transform="translate(${r2(c.x)} ${r2(c.z)}) scale(${s})">` +
      '<ellipse cx="0" cy="0" rx="9" ry="3.6" fill="#1d1330" opacity="0.28"/>' +
      '<path d="M0 0C-3-6-12-12-12-21a12 12 0 0 1 24 0C12-12 3-6 0 0z" fill="#e2383d" stroke="#1d1330" stroke-width="2.6" stroke-linejoin="round"/>' +
      '<circle cx="0" cy="-21" r="7.6" fill="#fffaf0" stroke="#1d1330" stroke-width="1.8"/>' +
      // the sparrow: body, head, tail
      '<path d="M-5 -19.6c1.6-3.6 6.2-4.2 8.6-1.4l2.6-.8-1.6 2c-.4 3-3.4 4.6-6.6 3.6l-4 1.4 1.8-2.6z" fill="#8b5a2b" stroke="#1d1330" stroke-width="1.1" stroke-linejoin="round"/>' +
      '<circle cx="2.2" cy="-21.6" r="0.9" fill="#1d1330"/>' +
      (small
        ? ''
        : '<g transform="translate(0 -44)"><rect x="-46" y="-11" width="92" height="19" rx="9.5" fill="#fffaf0" stroke="#1d1330" stroke-width="2.4"/>' +
          '<text class="mp-here" x="0" y="3.6" text-anchor="middle" font-size="12">You are here</text></g>') +
      '</g>';
  }

  // ---------------------------------------------------------------------------------------------
  // The list: a group per district (its button, then its plots and islanders)
  // ---------------------------------------------------------------------------------------------
  let picks = []; // the list's buttons in order (one Tab stop: roving tabindex)
  function renderList() {
    const groups = [];
    for (const D of districts()) {
      const plots = shown.plots.filter((q) => q.district === D.id);
      const folk = shown.islanders.filter((q) => q.district === D.id);
      const isHere = D.id === here;
      let h = `<div class="map-group" data-district="${esc(D.id)}">`;
      h += `<h3 class="map-dname" id="map-d-${esc(D.id)}"><button type="button" class="map-pick map-district" data-kind="district" data-id="${esc(D.id)}" aria-pressed="false">`;
      h += `<span class="mp-chip" aria-hidden="true"></span><span class="mp-name">${esc(D.name)}</span>`;
      if (isHere) h += '<span class="sr-only">, </span><span class="mp-here-tag">You are here</span>';
      h += '</button></h3>';
      if (plots.length || folk.length) {
        h += '<ul class="map-items">';
        for (const q of plots) {
          const tier = q.tier === null ? '' : `Tier ${q.tier}`;
          h += `<li><button type="button" class="map-pick map-plot${q.tier ? ' built' : ''}" data-kind="plot" data-id="${esc(q.id)}" aria-pressed="false">`;
          h += `<span class="mp-ico" aria-hidden="true">${PLOT_ICONS[q.id] || ''}</span><span class="mp-name">${esc(q.name)}</span>`;
          if (tier) h += `<span class="sr-only"> · </span><span class="mp-tier">${tier}</span>`;
          h += '</button></li>';
        }
        for (const q of folk) {
          h += `<li><button type="button" class="map-pick map-talk" data-kind="islander" data-id="${esc(q.id)}">`;
          h += `<span class="mp-ico" aria-hidden="true">${TALK_SVG}</span><span class="mp-name">Talk to ${esc(q.name)}</span></button></li>`;
        }
        h += '</ul>';
      }
      h += '</div>';
      groups.push(h);
    }
    el.list.innerHTML = groups.join('');
    picks = [...el.list.querySelectorAll('.map-pick')];
    for (const b of picks) {
      const D = b.dataset.kind === 'district' ? b.dataset.id : b.closest('.map-group') && b.closest('.map-group').dataset.district;
      b.style.setProperty('--dc', DCOL[D] || '#fff');
      b.style.setProperty('--dt', DTINT[D] || '#fff');
    }
    markPick();
    rove(picks.find((b) => b.dataset.kind === 'district' && b.dataset.id === here) || picks[0] || null);
  }
  function rove(btn) {
    for (const b of picks) b.tabIndex = b === btn ? 0 : -1;
  }
  function markPick() {
    for (const b of picks) if (b.dataset.kind !== 'islander') b.setAttribute('aria-pressed', String(!!pick && b.dataset.kind === pick.kind && b.dataset.id === pick.id));
    const off = !pick;
    for (const b of [el.walk, el.hop]) b.setAttribute('aria-disabled', String(off));
    picked.innerHTML = pick ? `<span class="mpk-label">To:</span> <b>${esc(pick.name)}</b>` : 'Pick a place, then <b>Walk there</b> or <b>Hop there</b>.';
  }
  function setPick(kind, id) {
    if (kind === 'district') pick = { kind, id, name: districtName(id) };
    else if (kind === 'plot') {
      const q = shown.plots.find((p) => p.id === id);
      pick = q ? { kind, id, name: q.name } : null;
    } else pick = null;
    markPick();
    drawPick();
    if (pick) announce(`${pick.name}${pick.kind === 'district' ? '' : `, in ${districtName((shown.plots.find((p) => p.id === id) || {}).district)}`}. Walk there or Hop there?`);
  }
  el.list.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest('.map-pick') : null;
    if (!b || !active) return;
    rove(b);
    if (b.dataset.kind === 'islander') return talkTo(b.dataset.id);
    setPick(b.dataset.kind, b.dataset.id);
  });
  el.list.addEventListener('keydown', (e) => {
    if (!active) return;
    const i = picks.indexOf(e.target);
    if (i < 0) return;
    let j = -1;
    if (e.key === 'ArrowDown') j = Math.min(picks.length - 1, i + 1);
    else if (e.key === 'ArrowUp') j = Math.max(0, i - 1);
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = picks.length - 1;
    if (j < 0) return;
    e.preventDefault();
    e.stopPropagation();
    rove(picks[j]);
    focus(picks[j]);
  });
  el.list.addEventListener('focusin', (e) => {
    const b = e.target instanceof Element ? e.target.closest('.map-pick') : null;
    if (b) rove(b);
  });
  // a tap on the map picks a building or a district too
  el.svg.addEventListener('click', (e) => {
    if (!active || !(e.target instanceof Element)) return;
    const g = e.target.closest('.mp-plot');
    if (g) {
      setPick('plot', g.dataset.plot);
      const b = picks.find((q) => q.dataset.kind === 'plot' && q.dataset.id === g.dataset.plot);
      if (b) (rove(b), b.scrollIntoView && b.scrollIntoView({ block: 'nearest' }));
      return;
    }
    const d = e.target.closest('.mp-dist');
    if (d) {
      setPick('district', d.dataset.district);
      const b = picks.find((q) => q.dataset.kind === 'district' && q.dataset.id === d.dataset.district);
      if (b) (rove(b), b.scrollIntoView && b.scrollIntoView({ block: 'nearest' }));
    }
  });

  // ---------------------------------------------------------------------------------------------
  // Walk there, Hop there, Talk, Close
  // ---------------------------------------------------------------------------------------------
  const targetOf = (P) => (P.kind === 'plot' ? `plot:${P.id}` : (hopOf(P.id) && hopOf(P.id).id) || `hop:${P.id}`);
  function walkThere() {
    if (!active) return false;
    if (!pick) {
      announce('Pick a district or a plot first.');
      return false;
    }
    const P = pick;
    close('walk');
    const ok = call(C.walkTo, targetOf(P));
    if (ok === false) call(C.announce, `Can't find the way to ${P.name} from here.`);
    return ok !== false;
  }
  function hopThere() {
    if (!active) return false;
    if (!pick) {
      announce('Pick a district or a plot first.');
      return false;
    }
    const P = pick;
    const r = call(C.hop, targetOf(P));
    const ok = r === true || (r && typeof r === 'object' && r.ok === true);
    if (!ok) {
      const why = r && typeof r === 'object' && typeof r.why === 'string' && r.why ? r.why : `Can't hop to ${P.name} right now.`;
      announce(why);
      return false;
    }
    close('hop');
    return true;
  }
  function talkTo(id) {
    const q = shown.islanders.find((p) => p.id === id);
    if (!q) return false;
    close('talk');
    call(C.talk, id);
    return true;
  }
  el.walk.addEventListener('click', () => walkThere());
  el.hop.addEventListener('click', () => hopThere());
  el.close.addEventListener('click', () => close('close'));

  // ---------------------------------------------------------------------------------------------
  // Keys
  // ---------------------------------------------------------------------------------------------
  function onKey(e, down) {
    if (!active || !e) return false;
    const k = String(e.key || '').toLowerCase();
    if (!down) return MOVE.has(k);
    if (k === 'escape' || k === 'i') {
      e.preventDefault();
      if (!e.repeat) close('esc');
      return true;
    }
    // (the list's arrows are its own; everything that would walk the captain does nothing while the map is up)
    if (MOVE.has(k)) {
      if (!(e.target instanceof Element && el.root.contains(e.target))) e.preventDefault();
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------------------------
  // Open, close, refresh
  // ---------------------------------------------------------------------------------------------
  function gather() {
    shown = { plots: plotsNow(), islanders: islandersNow() };
    const c = captain();
    here = c ? districtAt(c.x, c.z) : null;
  }
  function renderWhere() {
    where.innerHTML = here ? `<span class="mw-pin" aria-hidden="true"></span>You are in <b>${esc(districtName(here))}</b>` : '';
    where.hidden = !here;
    where.style.setProperty('--dc', DCOL[here] || '#fff');
  }
  function liveSig() {
    const c = captain();
    return JSON.stringify([c && [r2(c.x), r2(c.z)], shown.plots.map((q) => q.tier), shown.islanders.map((q) => [q.id, q.district]), here]);
  }
  function open() {
    if (active) return true;
    active = true;
    opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    pick = null;
    el.root.classList.remove('hidden');
    gather();
    drawStatic();
    renderList();
    drawLive();
    lastSig = liveSig();
    el.svg.setAttribute('aria-label', `Map of Sparrow's Floating Island${here ? `. You are in ${districtName(here)}` : ''}.`);
    renderWhere();
    globalThis.addEventListener?.('resize', onResize);
    const first = picks.find((b) => b.tabIndex === 0) || el.close;
    focus(first);
    if (first && first.scrollIntoView) first.scrollIntoView({ block: 'nearest' });
    announce(`Island map.${here ? ` You are in ${districtName(here)}.` : ''} Pick a place with the arrow keys, then Walk there or Hop there.`);
    return true;
  }
  function close(reason = 'close') {
    if (!active) return;
    active = false;
    globalThis.removeEventListener?.('resize', onResize);
    el.root.classList.add('hidden');
    const back = opener && opener.isConnected && opener.getClientRects().length ? opener : null;
    opener = null;
    if (el.root.contains(document.activeElement) && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    call(C.onClose, reason);
    if (back && !(document.activeElement && document.activeElement !== document.body)) focus(back);
  }
  function refresh() {
    if (!active) return;
    const focused = document.activeElement;
    const keep = focused && picks.includes(focused) ? [focused.dataset.kind, focused.dataset.id] : null;
    gather();
    const sig = liveSig();
    if (sig !== lastSig) {
      lastSig = sig;
      renderList();
      if (keep) {
        const b = picks.find((q) => q.dataset.kind === keep[0] && q.dataset.id === keep[1]);
        if (b) (rove(b), focus(b));
      }
      el.svg.setAttribute('aria-label', `Map of Sparrow's Floating Island${here ? `. You are in ${districtName(here)}` : ''}.`);
      renderWhere();
    }
    drawLive();
  }
  let resizeRaf = 0;
  function onResize() {
    if (!active) return;
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => active && drawLive());
  }

  return {
    open,
    close: () => close('close'),
    onKey,
    refresh,
    get active() {
      return active;
    },
    // (test hooks)
    api: {
      get pick() {
        return pick ? { ...pick } : null;
      },
      pickPlace: (kind, id) => (active ? (setPick(kind, id), !!pick) : false),
      walk: () => walkThere(),
      hop: () => hopThere(),
      talk: (id) => (active ? talkTo(id) : false),
      get here() {
        return here;
      },
      get items() {
        return picks.map((b) => ({ kind: b.dataset.kind, id: b.dataset.id, name: b.textContent.replace(/\s+/g, ' ').trim(), pressed: b.getAttribute('aria-pressed') === 'true' }));
      },
      get reduced() {
        return reduced();
      },
    },
  };
}
