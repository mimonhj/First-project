// Builder Bess's panel (SPEC3 §8.3) in #build-screen: the Homes and Amenities tabs, a row per plot with its
// tier pips, "Now" and "Next", and one Build button. Non-modal like the tavern; styles in town.css.
// townMode.js creates it for its view 'build' (opened by the place `builder`).
//
// createBuildPanel({ root, ctx }) → { open(opts), close(), onKey(e, down) → handled, refresh(), update(), get active, api }
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
//
// The Sunset Isles (SPEC4 §5.2, §8.5, §8.6; only when ctx.withV4 is true, or a function answering true, when the
// panel is made: without it everything above is exactly today's). Then:
//   - the tabs are the four districts, Windmill Row | Lantern Lane | Lighthouse Point | Beach & Hill (#build-tab-
//     windmill / -lantern / -lighthouse / -beach and their lists #build-windmill …; the rows of each from islandPlan's
//     DISTRICTS, read at run time), with all 21 plots: the ten SPEC3 plots and island.js's PLOTS4;
//   - a new plot's row reads plotState4 (its record is island4, its sale progress ctx.progress()); a row not yet on
//     sale shows its reason ("Opens after The Kraken's Deep") with a lock, aria-disabled, the reason as its
//     description; while a construction scene runs every Build button reads "Building…" (aria-disabled);
//   - a built row has a Watch again button (44 px, inline at the end of its button bar, as tall as the row's main
//     button: a built row is never taller than today's) that replays its last tier going up, free, writing nothing;
//   - the header says "Villagers 28 · Grand Port" (island.js villagers + villagers4, rank4 of all 21 plots, of 63);
//   - open({ plot }) (a plot board, §8.5) opens on that plot's district with its row's button focused (the camera
//     glides there, through focusPlot);
//   - a build or a Watch again plays the construction scene: the strip (#build-scene: the stage pill "Walls ●●●○○○"
//     and Skip) shows, at the top of the free view on wide screens; on a phone (portrait, or ≤ 760 px wide) the sheet
//     folds to a 56 px bar holding the pill and Skip (town.css: #build-screen.scene-on), so the camera frames the plot
//     above it; #build-live reads the stage captions (≤ one per 1.5 s of scene time, the latest kept) and the last line
//     ("Treehouse built! Granny Wren, Kip and Coco moved in. Villagers 28 · Grand Port."; a skip reads only that);
//     any non-modifier key, a tap anywhere or Skip skips it (Esc skips; a second Esc leaves); when it ends the sheet
//     comes back with focus on the row's button.
//   ctx additions (all optional):
//     withV4                       true | () → boolean: the Sunset Isles' panel
//     island4: { state() → the island4 record, build(id) → { ok, reason?, cost? } }   main's: writes
//       pirates-ahoy-island4 first, then the chest; reasons 'storage' | 'poor' | 'maxed' | 'closed' | 'unknown'
//     progress() → { unlocked, captures, kraken, shell }   what is on sale (island.js onSale4)
//     celebrate(id, tier, { kind: 'new' | 'upgrade', v4, replay: false }) → seconds   starts the scene (townMode:
//       env.setIsland / env.setIsland4 with { built: id }); 0 or nothing: no scene (the last line is read at once)
//     replay(id, tier, { kind, v4 }) → seconds   Watch again: the plot's last tier goes up again; writes nothing
//     scene() → { running, t } | null   the scene now (sparrow's env.scene): t in scene seconds. While it answers
//       running the panel shows the strip; once it has answered running, null or not running ends it. Without it (or
//       while it has never answered running: a montage plays instead) the panel keeps its own clock to the length
//       celebrate gave.
//     skipCelebration()            skips the scene (as the montage today)
//   update(): the strip follows the scene (townMode calls it every frame in the build view; the panel also runs its
//     own animation frame while a scene shows, so it never needs to be called).
import * as I from './island.js';
import * as PLAN from './islandPlan.js';
import * as SCENE from './buildScene.js';
import * as FOLK from './islanders.js';

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
const svg = (body, extra = '') => `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g ${INK}>${body}</g>${extra}</svg>`;
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
  // The Sunset Isles' eleven (SPEC4 §4.1), in the same hand
  homeE: svg(
    // the Treehouse: a hut on a platform in a giant palm
    '<path d="M14.2 30c1.3-4.4 1.6-9 .8-13.6h3.2c.8 4.6.5 9.2-.8 13.6z" fill="#a8743f"/>' +
      '<path d="M8 15.4c-3.2-.6-5.6.6-6.4 3.2 2.6.2 4.8-.8 6.4-3.2zM24 15.4c3.2-.6 5.6.6 6.4 3.2-2.6.2-4.8-.8-6.4-3.2z" fill="#5cbf60"/>' +
      '<rect x="6.5" y="14" width="19" height="3" rx="1.2" fill="#8b5a2b"/><path d="M9.5 14V8.8h13V14" fill="#ffe2b0"/>' +
      '<path d="M7.4 9.4L16 3.4l8.6 6z" fill="#e2383d"/><path d="M14.4 14v-3.2h3.2V14" fill="#8b5a2b"/>',
  ),
  homeF: svg(
    // the Houseboat: a cabin on a barge on the water
    '<path d="M8.5 18.6v-6h15v6" fill="#ffe2b0"/><path d="M6.8 13L16 7.2l9.2 5.8z" fill="#2fae6f"/>' +
      '<rect x="11" y="14.2" width="3.4" height="3" rx=".6" fill="#8fd3ff"/><path d="M18 18.6v-4h3v4" fill="#8b5a2b"/>' +
      '<path d="M3 18.6h26l-3.4 6.6H6.4z" fill="#c07b3a"/>',
    '<path d="M2.5 28.4c2.4 1.4 4.8 1.4 7 0 2.4 1.4 4.8 1.4 7 0 2.4 1.4 4.8 1.4 7 0 2.4 1.4 4.8 1.4 6.5 0" fill="none" stroke="#1a64a8" stroke-width="2" stroke-linecap="round"/>',
  ),
  homeG: svg(
    // the Hilltop Villa: a villa with a blue dome on a green hill
    '<path d="M1.8 29.5c3.4-5.6 8.4-8.4 14.2-8.4s10.8 2.8 14.2 8.4z" fill="#6cbf4a"/>' +
      '<rect x="8.5" y="12.5" width="15" height="10" fill="#fffaf0"/><path d="M10 12.5a6 6 0 0 1 12 0z" fill="#2f86d0"/>' +
      '<path d="M16 6.5V4" fill="none"/><path d="M14.2 22.5v-4.4a1.8 1.8 0 0 1 3.6 0v4.4" fill="#8b5a2b"/>' +
      '<rect x="10.4" y="15" width="2.6" height="2.6" rx=".5" fill="#8fd3ff"/><rect x="19" y="15" width="2.6" height="2.6" rx=".5" fill="#8fd3ff"/>',
  ),
  forge: svg(
    // the Forge: an anvil, a hammer and two sparks
    '<path d="M5 13.2h17.5c0 2.4 2 3.4 5.5 3.6v1.8c-3.2.2-5.4 1-6.4 2.8h-8.4c-1.2-2.2-3.8-3.6-8.2-4z" fill="#6b7080"/>' +
      '<path d="M11.4 21.4h8.6l1.8 6.6H9.6z" fill="#454a58"/><path d="M19.4 4.2l6.4 6.4-2.6 2.6-6.4-6.4z" fill="#8b5a2b"/>' +
      '<path d="M14.6 7.8L23 5" fill="none" stroke-width="2.8"/>',
    '<path d="M8.2 7.2l1.6 2.2M5.6 9.6l2.4.8M11.4 5.6l.2 2.6" stroke="#ffb20f" stroke-width="2" stroke-linecap="round"/>',
  ),
  fishing: svg(
    // the Fishing Hut: a fish on a line
    '<path d="M16 2.6v6.6" fill="none"/><path d="M16 9.2c0 2-1.8 2.8-3 1.8" fill="none"/>' +
      '<path d="M4 19.4c4.4-6.4 13.6-7.2 19.6 0-6 7.2-15.2 6.4-19.6 0z" fill="#8fd3ff"/><path d="M23.4 19.4l6-5.2v10.4z" fill="#2f86d0"/>' +
      '<path d="M15.2 13.6c1.6 3.4 1.6 8 0 11.6" fill="none" stroke-width="1.6"/>',
    '<circle cx="9.6" cy="18.4" r="1.4" fill="#1d1330"/>',
  ),
  farm: svg(
    // the Goat Farm: a red barn with its hay door
    '<path d="M4.5 28.5V14.6L16 6.2l11.5 8.4v13.9z" fill="#e2383d"/><path d="M2.6 15.6L16 5.4l13.4 10.2" fill="none" stroke-width="2.6"/>' +
      '<rect x="11" y="18.4" width="10" height="10.1" fill="#fffaf0"/><path d="M11 18.4l10 10.1M21 18.4L11 28.5" fill="none"/>' +
      '<path d="M13.6 11.6h4.8v4h-4.8z" fill="#ffc93c"/>',
  ),
  music: svg(
    // the Music Hall: two notes on a shell stage
    '<path d="M3.5 28.4c1.6-4.4 6.8-7 12.5-7s10.9 2.6 12.5 7z" fill="#ffb7c8"/>' +
      '<path d="M12.6 19.4V6.8l11-2.8v12.4" fill="none" stroke-width="2.6"/><path d="M12.6 9.4l11-2.8" fill="none" stroke-width="2.6"/>' +
      '<ellipse cx="9.8" cy="19.6" rx="3.2" ry="2.4" fill="#ffc93c" transform="rotate(-18 9.8 19.6)"/>' +
      '<ellipse cx="20.8" cy="16.6" rx="3.2" ry="2.4" fill="#ffc93c" transform="rotate(-18 20.8 16.6)"/>',
  ),
  museum: svg(
    // the Trophy Museum: columns under a pediment
    '<path d="M3.5 11.6L16 4l12.5 7.6z" fill="#ffc93c"/><rect x="4" y="11.6" width="24" height="2.6" fill="#fffaf0"/>' +
      '<path d="M6.6 14.2h3v10h-3zM12 14.2h3v10h-3zM17 14.2h3v10h-3zM22.4 14.2h3v10h-3z" fill="#fffaf0"/>' +
      '<rect x="3" y="24.2" width="26" height="4" rx="1" fill="#d9c7a6"/>',
  ),
  observatory: svg(
    // the Observatory: a dome with its telescope and a star
    '<rect x="6.5" y="19" width="19" height="9.5" fill="#fffaf0"/><path d="M5.5 19.4a10.5 10.5 0 0 1 21 0z" fill="#8a5cc7"/>' +
      '<path d="M15.6 12.4l9.4-6.2 1.8 2.6-9.4 6.2z" fill="#6b7080"/><path d="M14.2 28.5v-4.2h3.6v4.2" fill="#8b5a2b"/>',
    '<path d="M7.6 3.2l.9 2 2.1.3-1.6 1.4.4 2.1-1.8-1.1-1.9 1.1.5-2.1-1.6-1.4 2.1-.3z" fill="#ffc93c" stroke="#1d1330" stroke-width="1.2" stroke-linejoin="round"/>',
  ),
  aquarium: svg(
    // the Aquarium: a glass tank with a fish and bubbles
    '<rect x="3.5" y="8" width="25" height="19" rx="3.4" fill="#bfe8ff"/><path d="M3.5 13.4c3.4 1.4 6.4 1.4 8.4 0 2.4 1.4 5.6 1.4 8.2 0 2.4 1.4 5.4 1.4 8.4 0V24a3 3 0 0 1-3 3h-19a3 3 0 0 1-3-3z" fill="#5fb8ec"/>' +
      '<path d="M9 20.2c2.6-3.2 7.4-3.4 10.4 0-3 3.4-7.8 3.2-10.4 0zM19.4 20.2l3.4-2.6v5.2z" fill="#ff9b3d"/>',
    '<circle cx="22.4" cy="12.6" r="1.4" fill="#fff" stroke="#1d1330" stroke-width="1.1"/><circle cx="25.2" cy="10" r="1" fill="#fff" stroke="#1d1330" stroke-width="1"/>',
  ),
  grotto: svg(
    // the Mermaid Grotto: a scallop shell with a pearl
    '<path d="M16 28.2L3.6 14.6C3.6 8 9.2 3.6 16 3.6S28.4 8 28.4 14.6z" fill="#ff8fb1"/>' +
      '<path d="M16 28.2V4M16 28.2L9.4 5.6M16 28.2l6.6-22.6M16 28.2L5 9.6M16 28.2l11-18.6" fill="none" stroke-width="1.5"/>' +
      '<circle cx="16" cy="25.4" r="3.2" fill="#fffaf0"/>',
  ),
};
/** The plots' pictures (32 × 32 SVG markup, aria-hidden), for the Island map too. */
export const PLOT_ICONS = Object.freeze({ ...ICONS });
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

// ---- the Sunset Isles (v4) ----
// The district tabs (SPEC4 §8.6; index.html's ids) and the districts each one holds (islandPlan's DISTRICTS ids).
const TABS4 = [
  { id: 'windmill', districts: ['windmill'], name: 'Windmill Row' },
  { id: 'lantern', districts: ['lantern'], name: 'Lantern Lane' },
  { id: 'lighthouse', districts: ['lighthouse'], name: 'Lighthouse Point' },
  { id: 'beach', districts: ['beach', 'hill'], name: 'Beach & Hill' },
];
// (where a plot goes when islandPlan's DISTRICTS doesn't list it: SPEC4 §6.2's districts)
const TAB_OF = { homeA: 'windmill', bakery: 'windmill', school: 'windmill', park: 'windmill', market: 'windmill', windmill: 'windmill', homeB: 'lantern', homeC: 'lighthouse', homeD: 'lighthouse', lighthouse: 'lighthouse' };
const TAB_ICONS = {
  windmill: ICONS.windmill,
  lantern: svg(
    '<path d="M16 2.6v3.6" fill="none"/><rect x="12" y="5.8" width="8" height="3.2" rx="1" fill="#8b5a2b"/>' +
      '<path d="M16 9c-6.4 0-9.4 3.4-9.4 8.2S9.6 25.6 16 25.6s9.4-3.6 9.4-8.4S22.4 9 16 9z" fill="#f28c28"/>' +
      '<path d="M16 9c-2.4 2-3.4 4.8-3.4 8.2s1 6.4 3.4 8.4M16 9c2.4 2 3.4 4.8 3.4 8.2s-1 6.4-3.4 8.4" fill="none" stroke-width="1.5"/>' +
      '<rect x="12" y="25.4" width="8" height="3.2" rx="1" fill="#8b5a2b"/>',
  ),
  lighthouse: ICONS.lighthouse,
  beach: svg(
    // a palm on its sandy islet, a star over the hill
    '<path d="M3 28.6c3-3 8-4.4 13-4.4s10 1.4 13 4.4z" fill="#f6d68b"/><path d="M14.6 25.2c.8-4.6.4-9.6-1.4-14h2.8c1.8 4.4 2.2 9.4 1.4 14z" fill="#a8743f"/>' +
      '<path d="M14.6 11.2c-3-3.6-7-4.4-10.6-2.4 3.4.8 6.4 1.8 10.6 2.4zM14.6 11.2c1.2-4.4 4.6-6.4 8.6-5.8-2.8 2-5.2 3.8-8.6 5.8zM14.6 11.2c4.4-1.2 8.2.4 10.2 3.8-3.2-.6-6.4-1.8-10.2-3.8z" fill="#5cbf60"/>',
    '<path d="M25.6 3.4l.9 2 2.1.3-1.6 1.4.4 2.1-1.8-1.1-1.9 1.1.5-2.1-1.6-1.4 2.1-.3z" fill="#ffc93c" stroke="#1d1330" stroke-width="1.2" stroke-linejoin="round"/>',
  ),
};
// Watch again: a round arrow about a little house
const WATCH_SVG =
  '<svg class="b-watch-ico" viewBox="0 0 32 32" aria-hidden="true" focusable="false">' +
  '<path d="M26 16.4A10 10 0 1 1 22.8 9" fill="none" stroke="#1d1330" stroke-width="3.2" stroke-linecap="round"/>' +
  '<path d="M19.4 3.8l7 4.6-7.4 3.6z" fill="#1d1330" stroke="#1d1330" stroke-width="1.4" stroke-linejoin="round"/>' +
  '<path d="M11.4 22.2v-5.4L16 12.8l4.6 4v5.4z" fill="#ffe2b0" stroke="#1d1330" stroke-width="1.8" stroke-linejoin="round"/>' +
  '<path d="M14.8 22.2v-2.8h2.4v2.8" fill="#8b5a2b" stroke="#1d1330" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const LOCK_SVG =
  '<svg class="b-lock" viewBox="0 0 18 22" aria-hidden="true" focusable="false"><path d="M4.6 10.2V7.4a4.4 4.4 0 0 1 8.8 0v2.8" fill="none" stroke="currentColor" stroke-width="2.6"/>' +
  '<rect x="2" y="10" width="14" height="10.6" rx="2.6" fill="currentColor"/></svg>';
const HAMMER_SVG =
  '<svg class="b-hammer" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4.2 20.4l9.4-9.4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' +
  '<path d="M11.4 3.8l2.4-.6 7.4 7.4-1.6 1.6-2-2-3.8 3.8-3.4-3.4 3.8-3.8z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
const SKIP_SVG =
  '<svg class="ss-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.5 5.5l8 6.5-8 6.5zM12.5 5.5l8 6.5-8 6.5z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
// A phone's bottom sheet folds to the 56 px bar during a scene (town.css has the same query)
const FOLD_MQ = '(orientation: portrait), (max-width: 760px)';
const CAPTION_GAP = 1.5; // s of scene time between two of the strip's captions (SPEC4 §5.2)
// What a new plot's tier gives, as a sentence (the last line of its scene)
const LAYER_SAY = ['', 'A fiddle joins the town tune.', 'A drum joins the fiddle in the town tune.', 'The whole band plays, and the villagers dance!'];
const PERK4_SAY = {
  cutHold: (v) => `Cutting a net now takes a ${v} s hold.`,
  catchGold: (v) => `Fishers' catch: +${v} gold every cleared level.`,
  goats: (v) => `${plural(v, 'goat')} graze the pen.`,
  musicLayers: (v) => LAYER_SAY[v] || '',
  museumGold: (v) => `+${v} gold for each ship you capture.`,
  spyglass: (v) => `You can see ${v} u further into fog.`,
  aquariumGold: (v) => `+${v} gold for each sea creature you drive off.`,
  rescuePct: (v) => `If you are wrecked, the merfolk save ${v}% of your plunder.`,
};

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
  // The Sunset Isles' panel (fixed when the panel is made)
  const V4 = C.withV4 === true || (typeof C.withV4 === 'function' && call(C.withV4) === true);
  const PLOTS_V4 = V4 ? [...(Array.isArray(I.PLOTS) ? I.PLOTS : []).map((p) => ({ ...p, v4: false })), ...(Array.isArray(I.PLOTS4) ? I.PLOTS4 : []).map((p) => ({ ...p, v4: true }))] : null;
  const plots = () => (V4 ? PLOTS_V4 : Array.isArray(I.PLOTS) ? I.PLOTS : []);
  const plotOf = (id) => plots().find((p) => p.id === id) || null;
  const islandNow = () => {
    const raw = C.island ? call(C.island.state && C.island.state.bind(C.island)) : undefined;
    return typeof I.parseIsland === 'function' ? I.parseIsland(raw ?? null) : raw || null;
  };
  const island4Now = () => {
    const raw = C.island4 ? call(C.island4.state && C.island4.state.bind(C.island4)) : undefined;
    return typeof I.parseIsland4 === 'function' ? I.parseIsland4(raw ?? null) : raw || null;
  };
  const progressNow = () => {
    const p = call(C.progress);
    return p && typeof p === 'object' ? p : {};
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
  // (v4) a new plot's state from island.js plotState4, checked the same way; a SPEC3 plot's as above, always on sale
  function stateOf4(cfg, cfg4, gold, prog, p) {
    if (!p.v4) return { ...stateOf(cfg, gold, p), onSale: true, why: '' };
    const s = typeof I.plotState4 === 'function' ? call(I.plotState4, cfg4, gold, p.id, prog) : null;
    const max = Array.isArray(p.costs) ? p.costs.length : 3;
    let tier = s && Number.isInteger(s.tier) ? s.tier : cfg4 && cfg4.t && Number.isInteger(cfg4.t[p.id]) ? cfg4.t[p.id] : 0;
    tier = Math.max(0, Math.min(max, tier));
    const maxed = tier >= max;
    const cost = maxed ? null : s && Number.isFinite(s.cost) ? s.cost : p.costs[tier];
    const onSale = maxed || !s || s.onSale !== false;
    const why = !onSale && s && typeof s.why === 'string' ? s.why : '';
    const affordable = !maxed && onSale && (s && typeof s.affordable === 'boolean' ? s.affordable : gold >= cost);
    const word = (k, own) => (s && typeof s[k] === 'string' && s[k] ? s[k] : own());
    const label = word('label', () => {
      if (maxed) return 'Fully built';
      if (!onSale) return why || 'Not open yet';
      if (!affordable) return `Need ${cost - gold} more gold`;
      return `${tier === 0 ? `Build ${tierName(p, 1)}` : `Upgrade to ${tierName(p, tier + 1)}`} — ${cost} gold`;
    });
    const nowWords = word('now', () => (tier ? tierName(p, tier) : p.tier0 || 'a little shack'));
    const nextWords = word('next', () => (maxed ? 'all done!' : tierName(p, tier + 1)));
    return { tier, max, cost, maxed, affordable, onSale, why, label, now: nowWords, next: nextWords };
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
  // (v4) the rank over all 21 plots: island.js rank4 / RANKS4
  function rankOf4(cfg, cfg4) {
    const ranks = Array.isArray(I.RANKS4) ? I.RANKS4 : [];
    const r = typeof I.rank4 === 'function' ? call(I.rank4, cfg, cfg4) : null;
    let tiers = r && Number.isInteger(r.tiers) ? r.tiers : null;
    if (tiers === null) tiers = plots().reduce((n, p) => n + (((p.v4 ? cfg4 : cfg) || { t: {} }).t[p.id] | 0), 0);
    let k = 0;
    for (let j = 0; j < ranks.length; j++) if (tiers >= ranks[j].from) k = j;
    const name = (r && typeof r.name === 'string' && r.name) || (ranks[k] && ranks[k].name) || '';
    const next = ranks[k + 1] || null;
    return { name, tiers, next, all: plots().reduce((n, p) => n + (Array.isArray(p.costs) ? p.costs.length : 3), 0) };
  }
  const villagersOf = (cfg) => {
    const v = typeof I.villagers === 'function' ? call(I.villagers, cfg) : null;
    return Number.isInteger(v) ? v : 0;
  };
  const villagersOf4 = (cfg, cfg4) => {
    const v = typeof I.villagers4 === 'function' ? call(I.villagers4, cfg4) : null;
    return villagersOf(cfg) + (Number.isInteger(v) ? v : 0);
  };

  // ---- state ----
  let active = false;
  let tab = V4 ? TABS4[0].id : 'home';
  let lastBuild = { id: '', at: -Infinity };
  let celebrateUntil = 0;
  let swallowUntil = 0; // the tap that skipped the montage does nothing else
  let swallowed = null; // the key event that skipped it (main routes it here too)
  let glidedTo = null;
  const refused = new Set(); // plots whose build storage refused (until the next try)
  // (v4) the construction scene showing now: { id, tier, kind, replay, secs, startedAt, skipped, seen, lastIndex,
  // capT, pending, final, reduced, raf }
  let scene = null;

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
  // (v4) the district tabs and their lists, and the scene's strip
  const tabs4 = V4 ? TABS4.map((T) => ({ ...T, tab: $(`build-tab-${T.id}`, 'button'), list: $(`build-${T.id}`, 'ul'), plots: [] })) : [];
  const strip = V4 ? { root: $('build-scene'), stage: $('scene-stage', 'span'), pips: $('scene-pips', 'span'), skip: $('scene-skip-btn', 'button') } : null;
  const tabOfPlot = (id) => {
    const T = tabs4.find((q) => q.plots.includes(id));
    return T ? T.id : TABS4[0].id;
  };
  function makeRow(p, list) {
    const li = document.createElement('li');
    li.className = 'up-row build-row';
    li.dataset.plot = p.id;
    const ids = ['name', 'tier', 'now', 'next'].map((k) => `build-${k}-${p.id}`);
    if (V4) ids.push(`build-why-${p.id}`);
    li.innerHTML =
      `<span class="up-ico" aria-hidden="true">${ICONS[p.id] || ICONS.homeA}</span>` +
      '<span class="pips b-pips" aria-hidden="true"></span>' +
      `<div class="up-head"><h3 class="up-name" id="${ids[0]}">${esc(p.name)}</h3>` +
      `<span class="b-tier-word" id="${ids[1]}"></span></div>` +
      `<p class="b-line b-now" id="${ids[2]}"><span class="b-label">Now:</span> <span class="b-text"></span></p>` +
      `<p class="b-line b-next" id="${ids[3]}"><span class="b-label">Next:</span> <span class="b-text"></span></p>` +
      `<div class="b-buy"><button type="button" class="buy-btn b-btn" data-plot="${p.id}" aria-describedby="${ids.join(' ')}"></button>` +
      (V4 ? `<button type="button" class="b-watch hidden" data-watch="${p.id}" aria-label="${esc(watchLabel(p, 1))}">${WATCH_SVG}</button>` : '') +
      '</div>' +
      (V4 ? `<span class="sr-only b-why" id="${ids[4]}"></span>` : '');
    list.appendChild(li);
    rows.set(p.id, {
      li,
      btn: li.querySelector('.b-btn'),
      watch: V4 ? li.querySelector('.b-watch') : null,
      why: V4 ? li.querySelector('.b-why') : null,
      pips: li.querySelector('.pips'),
      tier: li.querySelector('.b-tier-word'),
      now: li.querySelector('.b-now .b-text'),
      next: li.querySelector('.b-next .b-text'),
      sig: '',
    });
  }
  if (!V4) {
    for (const kind of ['home', 'amenity']) {
      const list = el.lists[kind];
      list.innerHTML = '';
      for (const p of plots().filter((q) => q.kind === kind)) makeRow(p, list);
    }
  } else {
    // the district tabs instead of Homes | Amenities (today's two stay in the page, hidden and empty)
    for (const t of el.tabs) {
      t.classList.add('hidden');
      t.tabIndex = -1;
    }
    for (const L of Object.values(el.lists)) {
      L.innerHTML = '';
      L.hidden = true;
    }
    const strip0 = el.panel.querySelector('.dock-tabs');
    if (strip0) strip0.classList.add('four');
    const districts = Array.isArray(PLAN.DISTRICTS) ? PLAN.DISTRICTS : [];
    const placed = new Set();
    for (const T of tabs4) {
      for (const d of T.districts) {
        const D = districts.find((q) => q && q.id === d);
        for (const id of D && Array.isArray(D.plots) ? D.plots : []) if (plotOf(id) && !placed.has(id)) T.plots.push(id), placed.add(id);
      }
    }
    for (const p of plots()) {
      if (placed.has(p.id)) continue;
      const tabId = p.v4 ? (p.district === 'hill' ? 'beach' : p.district) : TAB_OF[p.id];
      (tabs4.find((q) => q.id === tabId) || tabs4[0]).plots.push(p.id);
    }
    for (const T of tabs4) {
      T.tab.classList.remove('hidden');
      T.tab.innerHTML = `<span class="bt4-ico" aria-hidden="true">${TAB_ICONS[T.id] || ''}</span><span class="bt4-name">${esc(T.tab.textContent.trim() || T.name)}</span>`;
      T.list.innerHTML = '';
      T.list.dataset.district = T.id;
      for (const id of T.plots) makeRow(plotOf(id), T.list);
    }
    for (const r of rows.values()) r.li.dataset.district = tabOfPlot(r.li.dataset.plot);
    strip.skip.innerHTML = `<span class="ss-word">Skip</span>${SKIP_SVG}`;
    strip.skip.setAttribute('aria-label', 'Skip');
    strip.pips.innerHTML = '<i></i>'.repeat(SCENE.PIPS || 6);
  }
  function watchLabel(p, tier) {
    // "Watch the Treehouse go up again" (a SPEC3 home: "Watch the Townhouse at Tavern Row go up again")
    if (!p.v4 && p.kind === 'home') return `Watch the ${tierName(p, Math.max(1, tier)) || 'house'} at ${p.name} go up again`;
    return `Watch the ${p.name} go up again`;
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
  function renderTown4(cfg, cfg4) {
    const r = rankOf4(cfg, cfg4);
    const v = villagersOf4(cfg, cfg4);
    town.innerHTML = `${TOWN_SVG}<span><span class="bt-word">Villagers </span><b>${v}</b> · <b>${esc(r.name)}</b></span><span class="sr-only"> (the town's rank: ${r.tiers} of ${r.all} builds)</span>`;
    if (!r.next) note.innerHTML = `<b>${esc(r.name)}!</b> Every plot is fully built. Polly has the Jewelled tricorn for you!`;
    else {
      const left = r.next.from - r.tiers;
      note.innerHTML = r.tiers === 0 ? `What shall we build, Cap'n? <b>${plural(left, 'more build')}</b> and Sparrow's is a ${esc(r.next.name)}!` : `<b>${plural(left, 'more build')}</b> and your island becomes a ${esc(r.next.name)}!`;
    }
  }
  // "Upgrade to Treehouse — 350 gold" with its tier's name in a span of its own (narrow built rows show
  // "Upgrade — 350 gold", the Next line naming the tier; the button's name keeps every word)
  function labelHtml(label) {
    const m = /^(Build|Upgrade to) (.+) — (\d+ gold)$/.exec(label);
    if (!m) return esc(label);
    const verb = m[1] === 'Build' ? 'Build' : 'Upgrade';
    const tn = m[1] === 'Build' ? ` ${m[2]}` : ` to ${m[2]}`;
    return `${verb}<span class="b-tn">${esc(tn)}</span> — ${esc(m[3])}`;
  }
  function renderRows() {
    const cfg = islandNow();
    const gold = purse();
    if (V4) return renderRows4(cfg, gold);
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
  function renderRows4(cfg, gold) {
    const cfg4 = island4Now();
    const prog = progressNow();
    const busy = !!scene;
    for (const p of plots()) {
      const row = rows.get(p.id);
      if (!row) continue;
      const st = stateOf4(cfg, cfg4, gold, prog, p);
      const isRefused = refused.has(p.id) && !st.maxed;
      const sig = `${st.tier}|${st.cost}|${st.affordable}|${st.onSale}|${st.why}|${isRefused}|${busy}|${st.label}|${st.now}|${st.next}`;
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
      } else if (!st.onSale) {
        state = 'closed';
        b.innerHTML = `${LOCK_SVG}<span class="b-word">${esc(st.label)}</span>`;
      } else if (busy) {
        state = 'busy';
        b.innerHTML = `${HAMMER_SVG}<span class="b-word">Building…</span>`;
      } else if (isRefused) {
        state = 'refused';
        b.innerHTML = '<span class="b-word">Couldn\'t save: storage is full or switched off</span>';
      } else if (!st.affordable) {
        state = 'poor';
        b.innerHTML = `<span class="b-word">${labelHtml(st.label)}</span>`;
      } else {
        state = 'can';
        b.innerHTML = `<span class="coin" aria-hidden="true"></span><span class="b-word">${labelHtml(st.label)}</span>`;
      }
      b.dataset.state = state;
      b.setAttribute('aria-disabled', String(state === 'done' || state === 'poor' || state === 'closed' || state === 'busy'));
      if (row.why) row.why.textContent = state === 'closed' ? ` Not open yet: ${st.why || st.label}.` : '';
      const built = st.tier >= 1;
      if (row.watch) {
        row.watch.classList.toggle('hidden', !built);
        row.watch.setAttribute('aria-label', watchLabel(p, st.tier));
        row.watch.setAttribute('aria-disabled', String(busy));
      }
      row.li.classList.toggle('built', built);
      row.li.classList.toggle('maxed', st.maxed);
      row.li.classList.toggle('poor', state === 'poor');
      row.li.classList.toggle('refused', state === 'refused');
      row.li.classList.toggle('closed', state === 'closed');
      row.li.classList.toggle('busy', state === 'busy');
    }
    renderTown4(cfg, cfg4);
  }
  function render() {
    renderChest();
    renderRows();
  }

  // ---------------------------------------------------------------------------------------------
  // Tabs (←/→/Home/End, like the shipyard's and Polly's)
  // ---------------------------------------------------------------------------------------------
  function setTab(name, focusTab = true) {
    if (V4) return setTab4(name, focusTab);
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
  function setTab4(name, focusTab = true) {
    const T = tabs4.find((q) => q.id === name || q.districts.includes(name)) || tabs4[0];
    tab = T.id;
    for (const q of tabs4) {
      const on = q === T;
      q.tab.setAttribute('aria-selected', String(on));
      q.tab.tabIndex = on ? 0 : -1;
      q.list.hidden = !on;
    }
    el.body.scrollTop = 0;
    if (focusTab) focus(T.tab);
  }
  if (!V4) {
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
  } else {
    tabs4.forEach((T, i) => {
      T.tab.addEventListener('click', () => {
        if (!swallowTap()) setTab(T.id);
      });
      T.tab.addEventListener('keydown', (e) => {
        const n = tabs4.length;
        let j = -1;
        if (e.key === 'ArrowRight') j = (i + 1) % n;
        else if (e.key === 'ArrowLeft') j = (i + n - 1) % n;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = n - 1;
        if (j < 0 || celebrating()) return;
        e.preventDefault();
        e.stopPropagation();
        setTab(tabs4[j].id);
      });
    });
  }

  // ---------------------------------------------------------------------------------------------
  // The camera follows the row in focus, or the row tapped
  // ---------------------------------------------------------------------------------------------
  function glide(id) {
    if (!active || !id || id === glidedTo) return;
    glidedTo = id;
    for (const [k, r] of rows) r.li.classList.toggle('looking', k === id);
    call(C.focusPlot, id);
  }
  for (const list of V4 ? tabs4.map((T) => T.list) : Object.values(el.lists)) {
    list.addEventListener('focusin', (e) => {
      const li = e.target instanceof Element && e.target.closest('.build-row');
      if (li) glide(li.dataset.plot);
    });
    list.addEventListener('click', (e) => {
      if (!(e.target instanceof Element)) return;
      const w = V4 && e.target.closest('.b-watch');
      if (w) {
        watch(w.dataset.watch, e);
        return;
      }
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
  const celebrating = () => (V4 ? !!scene && sceneNow().running : now() < celebrateUntil);
  function skip() {
    if (V4) return skipScene();
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
    if (V4) return build4(p, row, at);
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

  // (v4) a build on any of the 21 plots: the right record first (main's island.build or island4.build), then the
  // construction scene
  function build4(p, row, at) {
    const id = p.id;
    const before = islandNow();
    const before4 = island4Now();
    const gold = purse();
    const prog = progressNow();
    const st = stateOf4(before, before4, gold, prog, p);
    if (st.maxed) {
      announce(`${p.name} is fully built.`);
      return false;
    }
    if (!st.onSale) {
      announce(`${p.name} isn't open yet: ${st.why || st.label}.`);
      return false;
    }
    if (!st.affordable) {
      announce(`${tierName(p, st.tier + 1)} costs ${st.cost} gold. You need ${st.cost - gold} more gold.`);
      return false;
    }
    const rankBefore = rankOf4(before, before4).name;
    const villagersBefore = villagersOf4(before, before4);
    const rec = p.v4 ? C.island4 : C.island;
    const r = rec ? call(rec.build && rec.build.bind(rec), id) : undefined;
    const ok = r === true || (r && r.ok === true);
    if (!ok) {
      const reason = r && typeof r === 'object' ? r.reason : 'storage';
      if (reason === 'poor' || reason === 'maxed' || reason === 'unknown' || reason === 'closed') {
        render();
        announce(
          reason === 'maxed' ? `${p.name} is fully built.` : reason === 'poor' ? `You need more gold for ${tierName(p, st.tier + 1)}.` : reason === 'closed' ? `${p.name} isn't open yet: ${st.why || st.label}.` : `Couldn't build at ${p.name}.`,
        );
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
    const after4 = island4Now();
    const tier = stateOf4(after, after4, purse(), progressNow(), p).tier;
    render();
    bumpChest();
    sfx('coin');
    // the last line: what went up, who moved in, what it gives, the town now
    let say = builtLine(p, tier);
    if (!p.v4 && p.kind === 'home') {
      const moved = villagersOf4(after, after4) - villagersBefore;
      if (moved > 0) say += ` ${plural(moved, tier > 1 ? 'more villager' : 'villager')} moved in.`;
    }
    const rk = rankOf4(after, after4);
    if (rk.name && rk.name !== rankBefore) say += ` Your island is now a ${rk.name}!`;
    say += ` Villagers ${villagersOf4(after, after4)} · ${rk.name}.`;
    const kind = tier <= 1 ? 'new' : 'upgrade';
    const secs = call(C.celebrate, id, tier, { kind, v4: !!p.v4, replay: false });
    if (Number.isFinite(secs) && secs > 0) startScene(id, tier, kind, false, secs, say);
    else announce(say);
    return true;
  }
  // "Treehouse built! Granny Wren, Kip and Coco moved in." (buildScene.js builtLine; islanders.js movesIn) and, for an
  // amenity, what it gives; a SPEC3 plot as today ("Townhouse built at Tavern Row.")
  function builtLine(p, tier) {
    if (!p.v4) {
      const name = tierName(p, tier);
      if (p.kind === 'home') return `${name} built at ${p.name}.`;
      const perk = perkOf(p, tier);
      return `${name} built at ${p.name}!${perk && perk.words[1] ? ` ${perk.words[1]}` : ''}`;
    }
    const m = typeof FOLK.movesIn === 'function' ? call(FOLK.movesIn, p.id, tier) : null;
    const movers = m ? [...(Array.isArray(m.people) ? m.people : []), ...(Array.isArray(m.animals) ? m.animals : [])] : [];
    let say = typeof SCENE.builtLine === 'function' ? call(SCENE.builtLine, p.name, movers) || `${p.name} built!` : `${p.name} built!`;
    const key = p.perk ? Object.keys(p.perk)[0] : null;
    if (key && PERK4_SAY[key] && Array.isArray(p.perk[key])) {
      const words = PERK4_SAY[key](p.perk[key][tier - 1]);
      if (words) say += ` ${words}`;
    }
    return say;
  }

  // ---------------------------------------------------------------------------------------------
  // (v4) Watch again, and the construction scene's strip
  // ---------------------------------------------------------------------------------------------
  function watch(id, e = null) {
    if (!active || !V4) return false;
    if (swallowTap()) return false;
    const p = plotOf(id);
    const row = rows.get(id);
    if (!p || !row) return false;
    const st = stateOf4(islandNow(), island4Now(), purse(), progressNow(), p);
    if (st.tier < 1) return false;
    const kind = st.tier === 1 ? 'new' : 'upgrade';
    const secs = call(C.replay, id, st.tier, { kind, v4: !!p.v4 });
    if (!(Number.isFinite(secs) && secs > 0)) {
      announce(`Bess can't show the ${p.name} going up right now.`);
      return false;
    }
    const rk = rankOf4(islandNow(), island4Now());
    startScene(id, st.tier, kind, true, secs, `${builtLine(p, st.tier)} Villagers ${villagersOf4(islandNow(), island4Now())} · ${rk.name}.`);
    return true;
  }
  // The scene now: the townMode / sparrow scene while it answers running, else the panel's own clock (a montage)
  function sceneNow() {
    const S = scene;
    if (!S) return { running: false, t: 0 };
    const wall = (now() - S.startedAt) / 1000;
    const s = typeof C.scene === 'function' ? call(C.scene) : undefined;
    if (s && typeof s === 'object' && s.running === true) {
      S.seen = true;
      return { running: true, t: Number.isFinite(s.t) ? Math.max(0, s.t) : wall };
    }
    if (S.seen || S.skipped) return { running: false, t: S.secs };
    return { running: wall < S.secs, t: Math.min(wall, S.secs) };
  }
  const folded = () => !!scene && (globalThis.matchMedia?.(FOLD_MQ).matches ?? false);
  function startScene(id, tier, kind, replay, secs, final) {
    if (scene) endScene(false);
    scene = { id, tier, kind, replay, secs, startedAt: now(), skipped: false, seen: false, lastIndex: -1, capT: -Infinity, pending: null, final, reduced: reduced(), raf: 0 };
    el.root.classList.add('scene-on');
    strip.root.classList.remove('hidden');
    window.addEventListener('pointerdown', onTapSkip, true);
    render(); // every Build button: "Building…"
    tick();
    if (!scene) return;
    // (on a phone the rows fold away: Skip takes the focus; on a wide screen it stays on the row's button)
    if (folded() || (document.activeElement && !el.root.contains(document.activeElement))) focus(strip.skip);
    loop();
  }
  function loop() {
    if (!scene || typeof globalThis.requestAnimationFrame !== 'function') return;
    cancelAnimationFrame(scene.raf);
    scene.raf = requestAnimationFrame(() => {
      tick();
      loop();
    });
  }
  function caption(text, t) {
    if (!text || !scene) return;
    if (t - scene.capT >= CAPTION_GAP) {
      scene.capT = t;
      scene.pending = null;
      announce(text);
    } else scene.pending = text;
  }
  function tick() {
    const S = scene;
    if (!S) return;
    const s = sceneNow();
    if (!s.running) {
      endScene(true);
      return;
    }
    const st = typeof SCENE.stageAt === 'function' ? call(SCENE.stageAt, s.t, S.kind, S.reduced) : null;
    if (st) {
      const sig = `${st.name}|${st.pips}`;
      if (sig !== S.sig) {
        S.sig = sig;
        strip.stage.textContent = st.name;
        [...strip.pips.children].forEach((pip, k) => pip.classList.toggle('on', k < st.pips));
        strip.root.dataset.stage = st.stage;
      }
      if (st.index !== S.lastIndex) {
        S.lastIndex = st.index;
        if (!S.skipped) caption(st.caption, s.t);
      }
    }
    if (S.pending && !S.skipped && s.t - S.capT >= CAPTION_GAP) caption(S.pending, s.t);
  }
  function skipScene() {
    const S = scene;
    if (!S || !sceneNow().running) return false;
    if (!S.skipped) {
      S.skipped = true;
      S.pending = null;
      call(C.skipCelebration);
    }
    tick();
    return true;
  }
  // The scene is over: the sheet comes back, the last line is read, focus returns to the row's button
  function endScene(say = true) {
    const S = scene;
    if (!S) return;
    scene = null;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(S.raf);
    window.removeEventListener('pointerdown', onTapSkip, true);
    el.root.classList.remove('scene-on');
    strip.root.classList.add('hidden');
    delete strip.root.dataset.stage;
    if (!active) return;
    render();
    if (say) announce(S.final);
    const row = rows.get(S.id);
    const a = document.activeElement;
    if (row && (!a || a === document.body || el.root.contains(a))) {
      if (tabOfPlot(S.id) !== tab) setTab(tabOfPlot(S.id), false);
      focus(row.btn);
    }
  }
  if (V4) {
    strip.skip.addEventListener('click', () => {
      // (the tap that skipped it already went through onTapSkip; a keyboard press lands here)
      if (scene && !scene.skipped) skip();
    });
    strip.root.addEventListener('keydown', (e) => {
      if (!active || !scene) return;
      if (MODIFIERS.has(String(e.key || '').toLowerCase())) return;
      e.preventDefault();
      e.stopPropagation();
      swallowed = e;
      if (escLeaves(e)) return;
      if (!e.repeat) skip();
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Keys
  // ---------------------------------------------------------------------------------------------
  const MODIFIERS = new Set(['shift', 'control', 'alt', 'meta', 'capslock']);
  // (v4) Esc skips the scene and a second Esc leaves the panel (SPEC4 §5.2), also during a skipped scene's wave,
  // while every other key is still swallowed; a held Esc's auto-repeat never leaves
  function escLeaves(e) {
    if (!scene || !scene.skipped || String(e.key || '').toLowerCase() !== 'escape') return false;
    if (!e.repeat) call(C.back);
    return true;
  }
  // Inside the panel: a held Enter or Space never presses twice; during the montage a key only skips it.
  el.panel.addEventListener('keydown', (e) => {
    if (!active) return;
    if (celebrating() && !MODIFIERS.has(String(e.key || '').toLowerCase())) {
      // (a held key's auto-repeat is the same press that built: it doesn't skip the montage)
      e.preventDefault();
      e.stopPropagation();
      swallowed = e;
      if (escLeaves(e)) return;
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
      if (escLeaves(e)) return true;
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
  function open(opts = null) {
    const plot = V4 && opts && typeof opts === 'object' && typeof opts.plot === 'string' && rows.has(opts.plot) ? opts.plot : null;
    if (active) {
      if (plot && !celebrating()) jumpTo(plot);
      return true;
    }
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
    if (!V4) {
      setTab('home', true);
      const cfg = islandNow();
      const r = rankOf(cfg);
      announce(`Builder Bess. Build homes and amenities on the island. Villagers: ${villagersOf(cfg)}. Your island is a ${r.name}.`);
      return true;
    }
    const cfg = islandNow();
    const cfg4 = island4Now();
    const r = rankOf4(cfg, cfg4);
    if (plot) jumpTo(plot);
    else setTab(TABS4[0].id, true);
    const at = plot ? ` ${plotOf(plot).name}, in ${(tabs4.find((q) => q.id === tab) || tabs4[0]).name}.` : '';
    announce(`Builder Bess. Build homes and amenities in four districts. Villagers: ${villagersOf4(cfg, cfg4)}. Your island is a ${r.name}.${at}`);
    return true;
  }
  // (v4) a plot board: its district's tab, its row's button focused (the camera glides there)
  function jumpTo(id) {
    const r = rows.get(id);
    if (!r) return false;
    setTab(tabOfPlot(id), false);
    focus(r.btn);
    if (r.li.scrollIntoView) r.li.scrollIntoView({ block: 'nearest' });
    glide(id);
    return true;
  }
  function close() {
    if (!active) return;
    skip();
    if (V4) endScene(false);
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
    if (V4 && scene) tick();
  }
  function update() {
    if (active && V4 && scene) tick();
  }

  // ---------------------------------------------------------------------------------------------
  // Test hooks (__game.island / the ashore suite route here through townMode)
  // ---------------------------------------------------------------------------------------------
  const api = {
    showTab: (name) => {
      if (!active) return false;
      if (V4) setTab(name, false);
      else setTab(name === 'amenities' || name === 'amenity' ? 'amenity' : 'home', false);
      return true;
    },
    build: (id) => {
      if (celebrating()) skip();
      if (V4 && scene) endScene(true);
      swallowUntil = 0;
      lastBuild = { id: '', at: -Infinity };
      return build(id);
    },
    focus: (id) => {
      const r = rows.get(id);
      if (!active || !r) return false;
      if (V4) setTab(tabOfPlot(id), false);
      else setTab(plotOf(id).kind, false);
      focus(r.btn);
      return true;
    },
    skip: () => skip(),
    get celebrating() {
      return active && celebrating();
    },
    get tab() {
      if (V4) return tab;
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
        ...(V4 ? { tab: tabOfPlot(id), watch: !!r.watch && !r.watch.classList.contains('hidden'), why: r.why ? r.why.textContent.trim() : '' } : {}),
      }));
    },
    get panel() {
      return el.panel;
    },
  };
  if (V4) {
    // (property descriptors, so the getters stay getters)
    const more = {
      watch: (id) => {
        if (celebrating()) skip();
        if (scene) endScene(true);
        swallowUntil = 0;
        return watch(id);
      },
      open: (id) => (active ? jumpTo(id) : false),
      get tabs() {
        return tabs4.map((T) => ({ id: T.id, plots: [...T.plots], selected: T.id === tab }));
      },
      get scene() {
        if (!scene) return null;
        const s = sceneNow();
        return { id: scene.id, tier: scene.tier, kind: scene.kind, replay: scene.replay, running: s.running, t: s.t, stage: strip.stage.textContent, pips: [...strip.pips.children].filter((q) => q.classList.contains('on')).length, skipped: scene.skipped };
      },
      get folded() {
        return folded();
      },
      tick: () => tick(),
    };
    Object.defineProperties(api, Object.getOwnPropertyDescriptors(more));
  }

  return {
    open,
    close,
    onKey,
    refresh,
    update,
    get active() {
      return active;
    },
    api,
  };
}
