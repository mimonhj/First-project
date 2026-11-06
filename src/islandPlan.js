// The walkable island's plan (SPEC4 §6): the six districts, their decks and the links between them (every link
// with its kind: 'rope' | 'board' | 'steps'), each plot's pad (the building's own footprint: a walk blocker and a
// camera box from tier 0), the porches, the plot places, signposts, arches, landmarks, hop points, the keep-offs and
// the islanders' paths. Station and path coordinates live here only.
//
// Pure: imports nothing (walk.test, islanders.test and the Node tests load it as a data: URL). Its art is
// districts.js's; sparrow.js merges walkData4() into env.walk (only with v4).
//
// Exports (§11.1): DISTRICTS, DECKS (every deck with its district: platforms with their porch pieces, the garden, the
// islets with their profiles, Fisher's Pier), LINKS (id, kind, from, to, span, today / scenery / long, name), PADS (each
// plot's pad in its plot frame: platform, kind, frame { x, z, ry, y }, the kit offset `off`, x0..z1, top, its world
// rect, its porch pieces and board), PORCHES (every porch piece as a world rect), PLOT_PLACES, SIGNPOSTS, ARCHES,
// LANDMARKS, HOPS, KEEP_OFF, ISLANDER_PATHS (33 loops `isl:<id>` + 'dance'), ANIMAL_SPOTS, WALKWAY, PLATFORMS,
// ISLETS, FISHER_PIER, TODAY_MOVES (today's props sparrow moves with v4, and their blockers), HILL_CAMS;
// walkData4(base, plots4) -> { radius, areas, links, blockers, camBlockers, places, spawn, npcs, doors, paths,
// bridges, hops, districts }; districtAt(x, z) -> id | null; toWorld(platform, lx, lz) -> [x, z].
//
// How it was laid out (1N, Stage 1; docs in SPEC4 §6): each shack platform keeps a walk round its building on porch
// pieces (planks on stilts outside its edges, [side, from, to, depth]); its walk is the deck and its pieces' maximal
// rects inset by WALK_INSET (0.65); every pad is the union over the tiers of the building's footprint and today's
// shack (+ 0.2 u), moved with the plot's kit offset; every link lands square to its deck's edge (run-ins of 0.9 u);
// the islanders' loops follow the walk graph's paths. The design checks (graph, places, porches of 1.6 u at every
// link end and plot place, reachability, steepness, keep-offs, bridge rails clear of decks) live in walk.test's v4
// sections.

function freeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) freeze(v);
  }
  return o;
}
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// §11.1: the walk bands (hw) by link kind, and the porch rules.
export const WALKWAY = freeze({ boardHw: 0.6, boardWidth: 2.0, stepsHw: 0.6, ropeHw: 0.25, ropeMax: 3, ropeLoops: 2, longRopeLoops: 1, porch: 1.6, padPad: 0.2 });
const INSET = 0.65; // sparrow's WALK_INSET: the captain's centre keeps this far from a deck's edge
const RUN = 0.9; // a link runs this far into the decks it joins (as sparrow's bridge({ walk }) does)
const ROPE_HAND = 0.55; // a rope bridge's hand ropes and end posts, either side of its middle
const BOARD_RAIL = 1.0; // a boardwalk's rails and posts

// ---------------------------------------------------------------------------------------- the districts (§6.2)
// Six districts (colour cue, landmark) and their plots.
const DISTRICTS_LIST = [
  { id: 'harbour', name: 'Harbour', colour: 'red, white and blue', landmark: 'the tavern, the lookout tower', plots: [] },
  { id: 'windmill', name: 'Windmill Row', colour: 'mint', landmark: 'the windmill', plots: ['homeA', 'bakery', 'school', 'park', 'market', 'windmill'] },
  { id: 'lantern', name: 'Lantern Lane', colour: 'orange', landmark: "the Music Hall's shell roof", plots: ['homeB', 'forge', 'farm', 'aquarium', 'music', 'museum'] },
  { id: 'lighthouse', name: 'Lighthouse Point', colour: 'teal and gold', landmark: 'the lighthouse', plots: ['homeC', 'homeD', 'homeF', 'fishing', 'lighthouse'] },
  { id: 'beach', name: 'Sunset Beach', colour: 'coral', landmark: "the Treehouse's giant palm", plots: ['homeE', 'grotto'] },
  { id: 'hill', name: 'Lookout Hill', colour: 'meadow green', landmark: "the Observatory's dome", plots: ['homeG', 'observatory'] },
];
const DISTRICTS_NAME = Object.fromEntries(DISTRICTS_LIST.map((d) => [d.id, d.name]));
export const DISTRICTS = freeze(DISTRICTS_LIST);

// ---------------------------------------------------------------------------------------- the platforms
// sparrow.js's platform() calls: id -> [x, z, w, d, ry, y] (+z the platform's front, x across).
export const PLATFORMS = freeze({
  pier: [0, -4.4, 22, 2.6, 0, 1.3],
  plaza: [0, -10.25, 17, 9.1, 0, 1.3],
  tavern: [-6.85, -19.6, 11.8, 9, 0, 1.3],
  tower: [-18.2, -25.4, 7, 7, 0.15, 1.3],
  yard: [16.2, -11.5, 8.4, 9, 0, 1.3],
  s1: [5.2, -21.1, 7, 5.8, -0.06, 1.3],
  s2: [13.4, -23.2, 5.4, 5, 0.12, 1.3],
  s3: [-0.5, -29.5, 6, 5.4, 0.05, 1.6],
  s4: [-7.6, -33.6, 5.6, 5, -0.1, 1.5],
  s5: [9.2, -31.5, 6.4, 5.2, -0.05, 1.8],
  s6: [-26.0, -26.0, 5.6, 5.2, 0.3, 1.3],
  s7: [21.5, -22.5, 5.4, 5, -0.25, 1.3],
  s8: [-24, -9, 5.4, 5, 0.45, 1.3],
  s9: [25, -6, 5, 5, -0.5, 1.3],
  s10: [-17.5, -38, 6, 5.5, 0.1, 1.6],
  s11: [18, -36, 6, 5.5, -0.2, 1.6],
  s12: [2, -40, 7, 5.5, 0, 1.6],
  s13: [-21.5, 2.0, 5.4, 5, 0.55, 1.3],
  s14: [-29, -4.5, 5.2, 5, 0.25, 1.3],
  s15: [-31, -16, 5.6, 5.2, 0.1, 1.3],
  s16: [-17.6, -17.4, 5.4, 5, -0.08, 1.3],
  s17: [29.5, -25, 6, 5.4, -0.35, 1.6],
  s18: [35, -12.5, 5.2, 5, -0.7, 1.3],
});
// the sandy floating garden (sparrow's GARDEN: its sand mound and walk circle)
const GARDEN = { x: -14.4, z: -7.6, r: 3.7, walkR: 2.9, y: 1.45, profile: [[0, 1.6], [2.04, 1.53], [3.15, 1.35]] };

function L2W(f, lx, lz) {
  const c = Math.cos(f[4]);
  const s = Math.sin(f[4]);
  return [f[0] + lx * c + lz * s, f[1] - lx * s + lz * c];
}
function W2L(f, x, z) {
  const c = Math.cos(f[4]);
  const s = Math.sin(f[4]);
  const dx = x - f[0];
  const dz = z - f[1];
  return [dx * c - dz * s, dx * s + dz * c];
}
/** A platform's local (lx, lz) in the world: [x, z]. */
export function toWorld(id, lx, lz) {
  const f = PLATFORMS[id];
  return f ? L2W(f, lx, lz).map(r3) : null;
}
const profY = (P, r) => {
  if (r <= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++) if (r <= P[i][0]) return P[i - 1][1] + ((P[i][1] - P[i - 1][1]) * (r - P[i - 1][0])) / (P[i][0] - P[i - 1][0]);
  return P[P.length - 1][1];
};

// ---------------------------------------------------------------------------------------- the islets (§6.2)
// Sunset Beach, a sand circle, and Lookout Hill, a meadow hill: walk circles following their profiles, inset from
// the shore as the garden's is. Fisher's Pier: a pier on piles from s18's north-east edge out to (47, -13.5).
export const ISLETS = freeze({
  beach: { id: 'beach', x: -38.5, z: -31.5, r: 7.5, walkR: 6.7, profile: [[0, 1.9], [3.5, 1.75], [7.5, 1.3]] },
  hill: { id: 'hill', x: 2, z: -56, r: 11, walkR: 10.2, profile: [[0, 4.4], [3.6, 4.4], [7.6, 2.3], [11, 1.6]] },
});
const BEACH = ISLETS.beach;
const HILL = ISLETS.hill;
export const FISHER_PIER = freeze({ id: 'fisherPier', x0: 36.6, x1: 47, z: -13.5, w: 2.4, y: 1.3 });

// ---------------------------------------------------------------------------------------- the plots
// The tier-0 shack sparrow builds on each shack platform (its SHACKS row: local x, z, w, d, stacked): today's shack
// is every plot's tier 0, so the pad holds it as well (the walk data never changes with the tiers).
const SHACK0 = {
  s2: [0, -0.4, 3.4, 3.0, 0], s3: [0, -0.6, 4.2, 3.4, 1], s4: [0, -0.4, 3.8, 3.2, 0], s5: [0, -0.5, 4.4, 3.4, 1], s6: [0, -0.4, 3.8, 3.2, 0],
  s7: [0, -0.4, 3.6, 3.0, 0], s8: [0, -0.4, 3.4, 3.0, 0], s9: [0, -0.3, 3.2, 3.0, 0], s10: [0, -0.4, 4.2, 3.4, 1], s11: [0, -0.4, 4.2, 3.4, 1],
  s12: [0, -0.4, 5.0, 3.6, 1], s13: [0, -0.5, 3.6, 3.0, 0], s14: [0, -0.4, 3.6, 3.0, 1], s15: [0, -0.4, 4.0, 3.2, 0], s16: [-0.3, -0.5, 3.8, 3.0, 0],
  s17: [0, -0.5, 4.2, 3.4, 1], s18: [0, -0.4, 3.6, 3.0, 0],
};
// (its height: sparrow's own camera box for it, h + 1.8, + a stacked shack's h + 2)
const SHACK0_H = { s2: 4.2, s3: 8.8, s4: 4.4, s5: 8.8, s6: 4.4, s7: 4.3, s8: 4.2, s9: 4.2, s10: 8.6, s11: 8.8, s12: 9.2, s13: 4.3, s14: 8.4, s15: 4.5, s16: 4.4, s17: 8.8, s18: 4.3 };
const shackBox = (pn) => {
  const [lx, lz, w, d, st] = SHACK0[pn];
  // its foot's trim, the ladder up a stacked one's right side, and the lantern by its door (head height)
  return { x0: lx - w / 2 - 0.15, x1: lx + w / 2 + (st ? 0.49 : 0.15), z0: lz - d / 2 - 0.15, z1: lz + d / 2 + 0.51 };
};
// Each building's footprint over its tiers in the plot frame (every vertex above the deck + 0.3) and its top: the ten
// SPEC3 plots as Stage 0 measured them (its PADS less the 0.2), the eleven new ones buildings4.info(id, t).footprint
// over tiers 1-3 (the islets' over 0-3: the Treehouse's palm, the grassy plot, the hilltop and the shore stand from 0).
const FOOT = {
  homeA: [-2.17, 2.39, -2.42, 1.62, 7.32], homeB: [-2.08, 2.49, -2.47, 1.57, 7.32], homeC: [-2.33, 2.24, -2.42, 1.62, 7.32], homeD: [-2.08, 2.49, -2.42, 1.62, 7.32],
  bakery: [-3.13, 2.33, -2.49, 2.55, 5.52], windmill: [-2.63, 1.38, -2.39, 1.01, 5.9], lighthouse: [-1.32, 1.32, -1.72, 1.08, 10.33], market: [-2.8, 2.8, -2.79, 1.67, 7.59],
  school: [-2.45, 2.24, -2.39, 1.19, 6.77], park: [-2.33, 2.55, -2.55, 1.5, 4.13],
  forge: [-1.0, 0.99, -1.9, 0.7, 5.61], music: [-2.59, 1.29, -0.77, 0.79, 4.65], fishing: [-0.7, 1.9, -0.66, 0.7, 3.84], farm: [-2.39, 1.18, -2.14, 0.94, 4.44],
  museum: [-1.17, 2.3, -2.13, 0.85, 6.04], aquarium: [-2.75, 2.9, -0.88, 0.92, 4.53], homeF: [-1.07, 2.4, -1.93, 0.68, 2.82],
  homeE: [-2.08, 1.99, -1.74, 2.0, 10.83], homeG: [-2.04, 2.08, -1.74, 1.86, 5.7], observatory: [-1.74, 1.69, -1.63, 1.84, 8.74], grotto: [-1.76, 1.76, -1.54, 1.33, 5.65],
};

// Each shack platform's plot: off, its kit offset (S0-D3: the plot's kit group moved in its frame, <= 1.0 u, away from
// a scenery bridge's mouth); porch, its porch extensions (planks on stilts outside its edge, S0-D3: the rule): [side,
// from, to, depth] with side 'l' (-x) | 'r' (+x) | 'b' (-z) | 'f' (+z), from..to along that side (local x for f / b,
// local z for l / r; past the corners to wrap round them), depth outwards; board: the "Build me!" board's x on the
// front porch (it faces out, +z; the plot's place stands in front of it).
const SITES = {
  // Windmill Row
  s16: { plot: 'homeA', off: [-1.0, 0], board: 0.4, porch: [['f', -3.7, 3.3, 1.0], ['l', -2.5, 2.5, 1.0], ['r', -1.2, 3.5, 0.6]] },
  s15: { plot: 'market', off: [0, 0], board: 0, porch: [['f', -4.6, 4.6, 1.15], ['l', -3.4, 2.6, 2.2], ['r', -3.2, 2.6, 1.8]] },
  // (park and school: their pads' corners kept 0.55 u (half the band + the captain) off s13S14's band, so a jog held
  // 15° into either rope is never pinned by a corner at the far end)
  s14: { plot: 'park', off: [-0.85, 0], board: -0.4, porch: [['f', -4.5, 2.6, 1.15], ['b', -4.5, 3.9, 1.9], ['l', -4.4, 3.65, 1.9], ['r', -4.4, 1.0, 1.3]] },
  s8: { plot: 'bakery', off: [0.7, 0], board: 0.1, porch: [['f', -2.7, 4.8, 1.9], ['r', -1.0, 4.4, 2.1]] },
  s13: { plot: 'school', off: [0.88, 0.47], board: 0.6, porch: [['f', -4.3, 4.4, 1.7], ['l', -0.6, 2.5, 1.6], ['r', -2.5, 2.5, 1.7]] },
  s6: { plot: 'windmill', off: [0, 0], board: 0, porch: [['f', -4.5, 2.8, 1.0], ['l', -3.4, 2.6, 2.0]] },
  // Lantern Lane
  s3: { plot: 'homeB', off: [0, -0.85], board: 1.1, porch: [['b', -3.0, 4.2, 2.5], ['r', -2.7, 2.7, 1.2]] },
  s4: { plot: 'forge', off: [0, 0], board: 0, porch: [['f', -3.9, 3.9, 1.1], ['l', -2.5, 2.5, 1.1], ['r', -0.4, 2.5, 1.1]] },
  s10: { plot: 'farm', off: [0, 0], board: -0.6, porch: [['f', -3.0, 4.4, 0.8], ['r', -2.75, 2.75, 1.4]] },
  s12: { plot: 'aquarium', off: [0, 0], board: 0.6, porch: [['f', -4.5, 4.7, 1.0], ['b', -4.5, 4.7, 1.4], ['l', -2.75, 2.75, 1.0], ['r', -2.75, 2.75, 1.2]] },
  s5: { plot: 'music', off: [0, 0], board: -0.6, porch: [['f', -4.4, 4.5, 1.0], ['l', -2.6, 2.6, 1.2], ['r', -2.6, 2.6, 1.3]] },
  s11: { plot: 'museum', off: [0, 0], board: 0.6, porch: [['f', -4.1, 4.0, 0.95], ['l', -2.75, 2.75, 1.1], ['r', -0.5, 2.75, 1.0]] },
  // Lighthouse Point
  s2: { plot: 'homeC', off: [0.6, 0], board: 0.9, porch: [['f', -3.7, 3.1, 1.8], ['l', -2.5, 2.5, 1.0], ['r', -2.5, 2.5, 0.4], ['b', -3.7, 0.6, 1.8]] },
  s7: { plot: 'homeD', off: [-0.6, -0.6], board: 0.2, porch: [['f', -2.7, 3.5, 0.9], ['r', 0.3, 2.5, 0.8], ['b', -2.7, 2.7, 0.8]] },
  s17: { plot: 'homeF', off: [1.0, 0], board: 0.6, porch: [['f', -3.0, 3.0, 0.9], ['l', -2.7, 0.35, 1.1], ['r', 0.0, 1.2, 0.85]], lanes: [[-2.0, -0.6, -2.0, 2.3]] },
  s18: { plot: 'lighthouse', off: [0, 0], board: 0, porch: [['f', -3.8, 2.6, 1.05], ['l', -2.5, 2.5, 1.2], ['b', -3.8, 3.2, 1.4]] },
  s9: { plot: 'fishing', off: [0, 0], board: ['l', 0.6], porch: [['l', -3.8, 2.0, 1.3], ['b', -3.8, 2.5, 1.3]] },
};
// today's decks that gain a porch (a walkway outside their edge): behind the tavern, where tavernS3 lands
const TODAY_PORCH = { tavern: [['b', -5.9, 2.85, 1.5]], yard: [['b', -4.2, 1.8, 1.2]] };
// The four islet plots: where their frame stands (its origin the pad's centre at its highest ground point, +z toward
// its porch and board) on Sunset Beach and Lookout Hill.
const ISLET_SITES = {
  homeE: { islet: 'beach', x: -41.2, z: -32.0, ry: 1.3 },
  grotto: { islet: 'beach', x: -39.7, z: -38.0, ry: 0.18 },
  observatory: { islet: 'hill', x: 2, z: -56, ry: 0 },
  homeG: { islet: 'hill', x: 8.5, z: -56, ry: 0 },
};

// ---------------------------------------------------------------------------------------- geometry helpers
const box = (a) => ({ x0: a[0], x1: a[1], z0: a[2], z1: a[3] });
const union = (a, b) => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1) });
const grow = (a, k) => ({ x0: a.x0 - k, x1: a.x1 + k, z0: a.z0 - k, z1: a.z1 + k });
const shift = (a, dx, dz) => ({ x0: a.x0 + dx, x1: a.x1 + dx, z0: a.z0 + dz, z1: a.z1 + dz });
const map4 = (b, fn) => ({ x0: fn(b.x0), x1: fn(b.x1), z0: fn(b.z0), z1: fn(b.z1) });
/** A porch piece's rect in its platform's frame. */
function pieceRect(f, [side, a, b, depth]) {
  const hw = f[2] / 2;
  const hd = f[3] / 2;
  if (side === 'f') return { x0: a, x1: b, z0: hd, z1: hd + depth };
  if (side === 'b') return { x0: a, x1: b, z0: -hd - depth, z1: -hd };
  if (side === 'r') return { x0: hw, x1: hw + depth, z0: a, z1: b };
  return { x0: -hw - depth, x1: -hw, z0: a, z1: b };
}
/** The walk of a union of rects (one frame): every maximal rect inside the union, inset by INSET (the captain's centre
 * keeps INSET from every edge over the water, and crosses freely from one rect to the next). */
function erode(rects) {
  const xs = [...new Set(rects.flatMap((q) => [q.x0, q.x1]))].sort((a, b) => a - b);
  const zs = [...new Set(rects.flatMap((q) => [q.z0, q.z1]))].sort((a, b) => a - b);
  const inU = (x, z) => rects.some((q) => x > q.x0 - 1e-9 && x < q.x1 + 1e-9 && z > q.z0 - 1e-9 && z < q.z1 + 1e-9);
  // a cell (between neighbouring breaks) is filled when its middle is in the union
  const full = (i0, i1, j0, j1) => {
    for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) if (!inU((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2)) return false;
    return true;
  };
  const cand = [];
  for (let i0 = 0; i0 < xs.length; i0++) for (let i1 = i0 + 1; i1 < xs.length; i1++) for (let j0 = 0; j0 < zs.length; j0++) for (let j1 = j0 + 1; j1 < zs.length; j1++) if (full(i0, i1, j0, j1)) cand.push([i0, i1, j0, j1]);
  const max = cand.filter((a) => !cand.some((b) => b !== a && b[0] <= a[0] && b[1] >= a[1] && b[2] <= a[2] && b[3] >= a[3] && (b[0] < a[0] || b[1] > a[1] || b[2] < a[2] || b[3] > a[3])));
  return max
    .map(([i0, i1, j0, j1]) => ({ x0: xs[i0] + INSET, x1: xs[i1] - INSET, z0: zs[j0] + INSET, z1: zs[j1] - INSET }))
    .filter((q) => q.x1 - q.x0 > 0.05 && q.z1 - q.z0 > 0.05);
}
/** A rect in a frame as a walk / blocker rect in the world: { x, z, w, d, ry }. */
function worldRect(f, b) {
  const [x, z] = L2W(f, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
  return { x: r2(x), z: r2(z), w: r2(b.x1 - b.x0), d: r2(b.z1 - b.z0), ry: r3(f[4]) };
}

// ---------------------------------------------------------------------------------------- the sites, computed
const SITE = {};
for (const [pn, S] of Object.entries(SITES)) {
  const f = PLATFORMS[pn];
  const foot = FOOT[S.plot];
  const pad = map4(shift(grow(union(box(foot), shackBox(pn)), WALKWAY.padPad), S.off[0], S.off[1]), r2);
  const plat = { x0: -f[2] / 2, x1: f[2] / 2, z0: -f[3] / 2, z1: f[3] / 2 };
  const pieces = S.porch.map((p) => pieceRect(f, p));
  const deck = [plat, ...pieces];
  const walk = erode(deck);
  SITE[pn] = { pn, plot: S.plot, frame: f, y: f[5], pad, plat, pieces, porch: S.porch, walk, off: S.off, board: S.board, top: Math.max(foot[4], SHACK0_H[pn]) };
}

// ---------------------------------------------------------------------------------------- the links
// An anchor: [deck, side, s] on a platform (its deck's outer edge with its porch pieces: the side's outermost edge at s
// along it), [circle, angle] on the garden, the beach or the hill (degrees in the world's x-z plane: 0 east (+x), 90
// south (+z)), or ['fisherPier', 'w'] the pier's west end. A link is a rope bridge, a boardwalk or the stone steps
// between two anchors; the scenery bridges (art drawn by sparrow at eedb108, never changed) are joined by their own
// curves (sparrow's bridge() ends, copied here).
function deckRects(id) {
  const S = SITE[id];
  const f = PLATFORMS[id];
  if (S) return [S.plat, ...S.pieces];
  const plat = { x0: -f[2] / 2, x1: f[2] / 2, z0: -f[3] / 2, z1: f[3] / 2 };
  return [plat, ...(TODAY_PORCH[id] || []).map((p) => pieceRect(f, p))];
}
function anchor(a) {
  const [id, side, s] = a;
  if (id === 'garden' || ISLETS[id]) {
    const C = id === 'garden' ? GARDEN : ISLETS[id];
    const ang = (side * Math.PI) / 180;
    const r = id === 'garden' ? 3.4 : C.r;
    const x = C.x + Math.cos(ang) * r;
    const z = C.z + Math.sin(ang) * r;
    return { x, z, y: id === 'garden' ? 1.38 : profY(C.profile, r), nx: -Math.cos(ang), nz: -Math.sin(ang), deck: id };
  }
  if (id === 'fisherPier') return { x: FISHER_PIER.x0, z: FISHER_PIER.z, y: FISHER_PIER.y, nx: 1, nz: 0, deck: id };
  const f = PLATFORMS[id];
  const rs = deckRects(id);
  let lx;
  let lz;
  let n;
  const cover = (q) => (side === 'l' || side === 'r' ? s >= q.z0 - 1e-6 && s <= q.z1 + 1e-6 : s >= q.x0 - 1e-6 && s <= q.x1 + 1e-6);
  const hit = rs.filter(cover);
  if (side === 'l') [lx, lz, n] = [Math.min(...hit.map((q) => q.x0)), s, [1, 0]];
  else if (side === 'r') [lx, lz, n] = [Math.max(...hit.map((q) => q.x1)), s, [-1, 0]];
  else if (side === 'b') [lx, lz, n] = [s, Math.min(...hit.map((q) => q.z0)), [0, 1]];
  else [lx, lz, n] = [s, Math.max(...hit.map((q) => q.z1)), [0, -1]];
  const [x, z] = L2W(f, lx, lz);
  const c = Math.cos(f[4]);
  const sn = Math.sin(f[4]);
  return { x, z, y: f[5], nx: n[0] * c + n[1] * sn, nz: -n[0] * sn + n[1] * c, deck: id, local: [lx, lz] };
}
// the seven scenery rope bridges: sparrow's bridge(a, b) ends (deck points; the garden's is a world point)
const SCENERY_ENDS = {
  s1S2: [['s1', 3.5, 0.8], ['s2', -2.7, 1.0]],
  tavernS16: [['tavern', -5.9, 1.5], ['s16', 2.7, 0.4]],
  yardS7: [['yard', 2.5, -4.5], ['s7', -1.2, 2.5]],
  tavernS3: [['tavern', 2.15, -4.5], ['s3', -1.0, 2.7]],
  gardenS13: [[null, -16.45, -4.85, 1.35], ['s13', 2.7, -1.1]],
  s13S14: [['s13', -2.7, -0.8], ['s14', 2.6, 1.2]],
  s7S17: [['s7', 2.7, 0.4], ['s17', -3.0, 0.9]],
};
/** sparrow's sagCurve: n + 1 points from a to b, sagging by sag in the middle. */
function sagCurve(a, b, sag, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - sag * 4 * u * (1 - u), a[2] + (b[2] - a[2]) * u]);
  }
  return out;
}
/** sparrow's bridge(a, b, { walk }) walk points: the sagging curve, run on RUN into both decks along the chord. */
function bridgeWalk(a, b) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const sag = Math.min(0.9, len * 0.09);
  const walk = sagCurve(a, b, sag, Math.max(6, Math.round(len / 0.5)));
  const L = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
  const ux = ((b[0] - a[0]) / L) * RUN;
  const uz = ((b[2] - a[2]) / L) * RUN;
  return [[a[0] - ux, a[1], a[2] - uz], ...walk, [b[0] + ux, b[1], b[2] + uz]];
}
// Where a scenery bridge's walk ends at each end, when its plain run-in (RUN along the chord) would end inside a pad or
// off the deck: a world point to run to instead ('trim': no run-in, the walk ends where the curve is that far from its
// end post: the captain steps off it onto the porch built round it).
const SCENERY_RUN = {
  tavernS3: { a: { trim: 0 } },
  yardS7: { a: { to: ['yard', 1.1, -3.75] } },
  s1S2: { b: { to: ['s2', -2.75, 1.6] } },
  gardenS13: { b: { trim: 0.9 } },
  s13S14: {},
  s17S18x: {},
  s7S17: { b: { to: ['s17', -2.95, -0.5] } },
};
const sceneryEnd = (e) => {
  if (e[0] === null) return [e[1], e[3], e[2]];
  const f = PLATFORMS[e[0]];
  const [x, z] = L2W(f, e[1], e[2]);
  return [x, f[5], z];
};

// The links (§6.2): kind, the two anchors (new links), and for a boardwalk any bend points between them.
const LINK_PLAN = {
  // today's four (sparrow's, unchanged)
  plazaS1: { kind: 'rope', today: true, from: 'plaza', to: 's1', span: 5.17 },
  tavernTower: { kind: 'rope', today: true, from: 'tavern', to: 'tower', span: 3.51 },
  plazaGarden: { kind: 'rope', today: true, from: 'plaza', to: 'garden', span: 4.4 },
  plazaYard: { kind: 'rope', today: true, from: 'plaza', to: 'yard', span: 5.31 },
  // the seven scenery rope bridges made walkable (their art kept; five are long)
  s1S2: { kind: 'rope', scenery: true, from: 's1', to: 's2' },
  tavernS16: { kind: 'rope', scenery: true, from: 'tavern', to: 's16' },
  yardS7: { kind: 'rope', scenery: true, long: true, from: 'yard', to: 's7' },
  tavernS3: { kind: 'rope', scenery: true, long: true, from: 'tavern', to: 's3' },
  gardenS13: { kind: 'rope', scenery: true, long: true, from: 'garden', to: 's13' },
  s13S14: { kind: 'rope', scenery: true, long: true, from: 's13', to: 's14' },
  s7S17: { kind: 'rope', scenery: true, long: true, from: 's7', to: 's17' },
  // new rope bridges (<= 3 u of water)
  towerS6: { kind: 'rope', a: ['tower', 'l', 1.0], b: ['s6', 'r', 3.1] },
  s4S3: { kind: 'rope', a: ['s4', 'r', 1.2], b: ['s3', 'l', -4.75] },
  s2S7: { kind: 'rope', a: ['s2', 'r', 3.0], b: ['s7', 'l', 2.0] },
  yardS9: { kind: 'rope', a: ['yard', 'r', 0.92], b: ['s9', 'l', -1.7] },
  // boardwalks (and the stone steps)
  gardenS8: { kind: 'board', a: ['garden', 180], b: ['s8', 'r', 2.2] },
  s14S15: { kind: 'board', a: ['s14', 'b', 0], b: ['s15', 'f', -1.0] },
  s15S16: { kind: 'board', name: 'Market Walk', a: ['s15', 'r', 1.0], b: ['s16', 'l', 2.9] },
  // (s15S6 runs in at the porch's back end, its band 1 u clear of the market pad's back corner)
  s15S6: { kind: 'board', a: ['s15', 'r', -2.6], b: ['s6', 'l', 2.3] },
  s10S4: { kind: 'board', name: 'the High Walk', a: ['s10', 'r', -0.6], b: ['s4', 'l', -1.5] },
  s3S12: { kind: 'board', name: 'the High Walk', a: ['s3', 'b', -0.5], b: ['s12', 'f', -1.3] },
  s12S5: { kind: 'board', name: 'the High Walk', a: ['s12', 'f', 2.4], b: ['s5', 'l', -1.4] },
  s5S11: { kind: 'board', name: 'the High Walk', a: ['s5', 'r', -0.8], b: ['s11', 'f', -2.9] },
  s10Tower: { kind: 'board', a: ['s10', 'f', -1.2], b: ['tower', 'b', 0.0] },
  s5S2: { kind: 'board', a: ['s5', 'r', 2.0], b: ['s2', 'b', -0.2] },
  s9S18: { kind: 'board', name: 'Lighthouse Walk', a: ['s9', 'b', 0.6], b: ['s18', 'f', -1.6] },
  s17S18: { kind: 'board', a: ['s17', 'f', -1.2], b: ['s18', 'l', -0.8] },
  s11S17: { kind: 'board', name: 'Long Walk', a: ['s11', 'r', 1.6], b: ['s17', 'l', -1.6] },
  s6Beach: { kind: 'board', a: ['s6', 'b', -3.8], b: ['beach', 12.4] },
  s15Beach: { kind: 'board', a: ['s15', 'b', -3.9], b: ['beach', 75] },
  s12Hill: { kind: 'steps', a: ['s12', 'b', 0], b: ['hill', 90] },
};
const LINK_ORDER = Object.keys(LINK_PLAN);

const LINK = {}; // id -> { id, kind, hw, pts, ends: [a, b], art }
for (const id of LINK_ORDER) {
  const P = LINK_PLAN[id];
  if (P.today) continue;
  const hw = P.kind === 'rope' ? WALKWAY.ropeHw : P.kind === 'steps' ? WALKWAY.stepsHw : WALKWAY.boardHw;
  if (P.scenery) {
    const [ea, eb] = SCENERY_ENDS[id];
    const a = sceneryEnd(ea);
    const b = sceneryEnd(eb);
    let pts = bridgeWalk(a, b);
    const ov = SCENERY_RUN[id] || {};
    for (const end of ['a', 'b']) {
      const o = ov[end];
      if (!o) continue;
      if (end === 'b') pts.reverse();
      if (o.to) {
        const f = PLATFORMS[o.to[0]];
        const [x, z] = L2W(f, o.to[1], o.to[2]);
        // (skipping the curve's points within o.cut of its end post: the walk cuts the corner by a wall)
        const e = pts[1];
        pts = pts.slice(1);
        while (o.cut && pts.length > 2 && Math.hypot(pts[0][0] - e[0], pts[0][2] - e[2]) < o.cut) pts.shift();
        pts.unshift([x, f[5], z]);
        if (o.via) {
          // (through the gap between the end posts, clear of a wall right behind them)
          const [vx, vz] = L2W(f, o.via[1], o.via[2]);
          pts.splice(1, 0, [vx, f[5], vz]);
        }
      } else if (o.trim !== undefined) {
        // drop the run-in (and, with trim > 0, the curve's points within trim of the end post)
        const e = pts[1];
        pts = pts.slice(1);
        while (o.trim > 0 && pts.length > 2 && Math.hypot(pts[0][0] - e[0], pts[0][2] - e[2]) < o.trim) pts.shift();
      }
      if (end === 'b') pts.reverse();
    }
    LINK[id] = { id, kind: 'rope', hw, pts, a, b, scenery: true };
    continue;
  }
  const A = anchor(P.a);
  const B = anchor(P.b);
  const a = [A.x, A.y, A.z];
  const b = [B.x, B.y, B.z];
  const L = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
  const ux = (b[0] - a[0]) / L;
  const uz = (b[2] - a[2]) / L;
  const yIn = (C, x, z) => (C.deck === 'garden' ? profY(GARDEN.profile, Math.hypot(x - GARDEN.x, z - GARDEN.z)) : ISLETS[C.deck] ? profY(ISLETS[C.deck].profile, Math.hypot(x - ISLETS[C.deck].x, z - ISLETS[C.deck].z)) : C.y);
  // (the run-ins go straight into each deck, square to its edge)
  const a0 = [a[0] + A.nx * RUN, 0, a[2] + A.nz * RUN];
  const b1 = [b[0] + B.nx * RUN, 0, b[2] + B.nz * RUN];
  a0[1] = yIn(A, a0[0], a0[2]);
  b1[1] = yIn(B, b1[0], b1[2]);
  let mid;
  if (P.kind === 'rope') {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    mid = sagCurve(a, b, Math.min(0.9, len * 0.09), Math.max(6, Math.round(len / 0.5)));
  } else {
    const n = Math.max(1, Math.ceil(L / 1.4));
    mid = [];
    for (let i = 0; i <= n; i++) mid.push([a[0] + (b[0] - a[0]) * (i / n), a[1] + (b[1] - a[1]) * (i / n), a[2] + (b[2] - a[2]) * (i / n)]);
  }
  LINK[id] = { id, kind: P.kind, hw, pts: [a0, ...mid, b1], a, b, span: L, anchors: [A, B] };
}

// ---------------------------------------------------------------------------------------- the keep-offs (§6.2)
// No new deck or link within 2 u of: a moored boat's sway circle, a moored prize's hull envelope (the largest enemy
// hull, 17 x 5.6, at its berth's heading, + 0.5 u of bob), the visiting cutter's hull at any sway (it anchors at (40,
// -21) with v4).
export const KEEP_OFF = freeze([
  { id: 'rowboat1', kind: 'boat', x: -11.2, z: -1.6, r: 1.6 },
  { id: 'rowboat2', kind: 'boat', x: 12.4, z: -2.2, r: 1.6 },
  { id: 'rowboat3', kind: 'boat', x: -39.8, z: -9.4, r: 1.6, moved: [-19.5, -12.5] },
  { id: 'rowboat4', kind: 'boat', x: 7.0, z: -16.6, r: 1.6, moved: [8.4, -16.4] },
  { id: 'rowboat5', kind: 'boat', x: -1.5, z: -15.5, r: 1.6 },
  { id: 'fisherman', kind: 'boat', x: -13.5, z: 7.5, r: 1.5, moved: [-15.2, 4.6] },
  { id: 'barge', kind: 'boat', x: 16.2, z: -4.46, r: 2.14 },
  { id: 'prize1', kind: 'prize', x: 29.5, z: 3.0, w: 6.6, d: 18, ry: Math.PI / 2 - 0.35 },
  { id: 'prize2', kind: 'prize', x: 41.0, z: -3.5, w: 6.6, d: 18, ry: Math.PI / 2 + 0.25 },
  { id: 'cutter', kind: 'cutter', x: 40, z: -21, r: 3.7 },
]);

// ---------------------------------------------------------------------------------------- the islet plots
const ISLET_SITE = {};
for (const [plot, Q] of Object.entries(ISLET_SITES)) {
  const I = ISLETS[Q.islet];
  const foot = FOOT[plot];
  const pad = map4(grow(box(foot), WALKWAY.padPad), r2);
  const f = [Q.x, Q.z, 0, 0, Q.ry];
  // the frame's origin: the pad's centre at the highest ground under the pad
  let y = -Infinity;
  for (const [lx, lz] of [[pad.x0, pad.z0], [pad.x1, pad.z0], [pad.x0, pad.z1], [pad.x1, pad.z1], [0, 0], [(pad.x0 + pad.x1) / 2, (pad.z0 + pad.z1) / 2]]) {
    const [x, z] = L2W(f, lx, lz);
    y = Math.max(y, profY(I.profile, Math.hypot(x - I.x, z - I.z)));
  }
  ISLET_SITE[plot] = { plot, islet: Q.islet, frame: [Q.x, Q.z, 0, 0, Q.ry, r2(y)], y: r2(y), pad, top: foot[4] };
}

// ---------------------------------------------------------------------------------------- the plots' pads (§6.3)
// PADS: every plot's pad in its plot frame (the building's footprint over every tier + 0.2 u: a walk blocker and a
// camera box from tier 0), with its frame ({ x, z, ry, y }: the platform's, or the islet frame), its kit offset and
// porch pieces; world: the pad as a world rect.
const PLOT_NAMES = {
  homeA: 'Tavern Row', homeB: 'Lagoon End', homeC: "Tailor's Lane", homeD: 'Yard Corner', bakery: 'Biscuit Bakery', windmill: 'Powder Windmill', lighthouse: 'Lighthouse', market: 'Market Hall',
  school: 'Sea School', park: 'Flower Park', homeE: 'Treehouse', homeF: 'Houseboat Moorings', homeG: 'Hilltop Villa', forge: "Blacksmith's Forge", fishing: 'Fishing Hut', farm: 'Goat Farm',
  music: 'Music Hall', museum: 'Trophy Museum', observatory: 'Observatory', aquarium: 'Aquarium', grotto: 'Mermaid Grotto',
};
const PLOT_ORDER = ['homeA', 'homeB', 'homeC', 'homeD', 'bakery', 'windmill', 'lighthouse', 'market', 'school', 'park', 'homeE', 'homeF', 'homeG', 'forge', 'fishing', 'farm', 'music', 'museum', 'observatory', 'aquarium', 'grotto'];
const PAD = {};
for (const s of Object.values(SITE)) {
  const f = s.frame;
  PAD[s.plot] = {
    plot: s.plot, platform: s.pn, kind: FOOT[s.plot] && s.plot in { forge: 1, music: 1, fishing: 1, farm: 1, museum: 1, aquarium: 1, homeF: 1 } ? 'new' : 'measured',
    frame: { x: f[0], z: f[1], ry: f[4], y: f[5] }, off: s.off, ...s.pad, top: r2(s.top), world: worldRect(f, s.pad), porch: s.porch, board: s.board,
  };
}
for (const s of Object.values(ISLET_SITE)) {
  const f = s.frame;
  PAD[s.plot] = { plot: s.plot, platform: s.islet, kind: 'islet', frame: { x: f[0], z: f[1], ry: f[4], y: f[5] }, off: [0, 0], ...s.pad, top: r2(s.top), world: worldRect(f, s.pad), porch: [], board: 0 };
}
export const PADS = freeze(Object.fromEntries(PLOT_ORDER.map((id) => [id, PAD[id]])));

// ---------------------------------------------------------------------------------------- the plot places (§6.3, §8.5)
// plot:<id> (r 1.0) on its porch in front of the "Build me!" board; its cam frames the plot.
// (the islet plots' tier-0 boards, buildings4's: [x, z, ry] in the plot frame)
const ISLET_BOARD = { homeE: [1.15, 1.55, -0.2], homeG: [1.05, 1.45, 0], observatory: [0, 1.75, 0], grotto: [-0.9, 1.15, 0.2] };
function plotPlace(id) {
  const P = PAD[id];
  const f = [P.frame.x, P.frame.z, 0, 0, P.frame.ry];
  const B = P.kind === 'islet' ? ['f', ISLET_BOARD[id][0]] : Array.isArray(P.board) ? P.board : ['f', P.board];
  const bx = B[1];
  const at = (d) => (B[0] === 'l' ? [P.x0 - d, bx] : B[0] === 'r' ? [P.x1 + d, bx] : B[0] === 'b' ? [bx, P.z0 - d] : [bx, P.z1 + d]);
  const [x, z] = L2W(f, ...at(0.6));
  // (an islet's board is buildings4's own, on its sand inside the pad)
  const [bxW, bzW] = P.kind === 'islet' ? L2W(f, ISLET_BOARD[id][0], ISLET_BOARD[id][1]) : L2W(f, ...at(-0.1));
  const [cx, cz] = L2W(f, (P.x0 + P.x1) / 2, (P.z0 + P.z1) / 2);
  const face = Math.atan2(bxW - x, bzW - z); // the captain faces the board
  const top = Math.min(P.top, 8);
  const [px, pz] = L2W(f, ...at(6.2).map((v, i) => (i === (B[0] === 'l' || B[0] === 'r' ? 1 : 0) ? v * 0.5 : v)));
  const yG = P.kind === 'islet' ? groundY(x, z) : P.frame.y;
  return {
    id: `plot:${id}`, name: PLOT_NAMES[id], plot: id, x: r2(x), z: r2(z), r: 1.0, face: r3(face),
    board: { x: r2(bxW), z: r2(bzW), ry: r3(P.frame.ry + (P.kind === 'islet' ? ISLET_BOARD[id][2] : B[0] === 'l' ? -Math.PI / 2 : B[0] === 'r' ? Math.PI / 2 : B[0] === 'b' ? Math.PI : 0)), side: B[0] },
    cam: { pos: [r2(px), r2(yG + 2.6 + top * 0.45), r2(pz)], target: [r2(cx), r2(P.frame.y + top * 0.42), r2(cz)] },
  };
}
// the ground under (x, z) on the islets (their profiles), the platforms' decks and the pier, else 1.3
function groundY(x, z) {
  for (const I of Object.values(ISLETS)) {
    const r = Math.hypot(x - I.x, z - I.z);
    if (r <= I.r) return profY(I.profile, r);
  }
  return 1.3;
}
export const PLOT_PLACES = freeze(PLOT_ORDER.map(plotPlace));

// The lookout (§6.7): a place at the tower's ladder foot on the tower raft, >= 2 u from the tavernTower mouth and
// outside the quiz's circle (the tower raft's frame: its ladder up the front, +z).
const LOOKOUT = (() => {
  const f = PLATFORMS.tower;
  const [x, z] = L2W(f, 1.35, 2.45);
  const [lx, lz] = L2W(f, 0, 1.9);
  return { id: 'lookout', name: "Crow's nest", x: r2(x), z: r2(z), r: 1.0, face: r3(Math.atan2(lx - x, lz - z)), ladder: { x: r2(lx), z: r2(lz) } };
})();

// ---------------------------------------------------------------------------------------- the walk (§6.3)
// What sparrow moves of today's props with v4 (by constant offsets; no rand() changes), and the blockers that move
// with them: the tower raft's net-drying rack, from its west edge (where towerS6 lands) to its east edge.
export const TODAY_MOVES = freeze([
  // the tavern's walls: its back wall stands 0.2 u inside today's box (which also kept the walk camera off its eaves),
  // so the captain fits through tavernS3's mouth right behind it (the camera keeps its box)
  { what: 'tavernBack', from: { x: -6.4, z: -21, w: 9.1, d: 5.8, ry: 0.04, h: 8.4 }, to: { x: -6.4, z: -20.9, w: 9.1, d: 5.6, ry: 0.04, h: 8.4 } },
  // the shipyard's plank stack, 1.6 u east along the yard's back: the way round the slipway to the back (where yardS7
  // lands) opens past its west end
  // the crates at the tower raft's back corners go under the tower, between its legs (inside its own blocker), so the
  // way round its back (where s10Tower lands) joins its sides
  { what: 'towerCrates', frame: 'tower', at: [[1.0, -1.1], [1.05, -1.05], [-1.0, -1.1]], from: { x: -16.05, z: -28.25, r: 0.6, h: 1.3 }, to: null },
  { what: 'towerCrate', frame: 'tower', from: { x: -21.15, z: -27.53, r: 0.53, h: 0.75 }, to: null },
  { what: 'yardPlanks', frame: 'yard', at: [-0.8, -3.57], from: { x: 13.8, z: -15.07, w: 3.1, d: 0.5, ry: 0, h: 0.75 }, to: { x: 15.4, z: -15.07, w: 3.1, d: 0.5, ry: 0, h: 0.75 } },
  { what: 'towerNetRack', frame: 'tower', at: [2.75, -0.35], ry: Math.PI / 2, from: { x: -20.81, z: -24.3, w: 0.36, d: 2.75, ry: 0.15, h: 2.2 }, to: (() => {
    const [x, z] = L2W(PLATFORMS.tower, 2.75, -0.35);
    return { x: r2(x), z: r2(z), w: 0.36, d: 2.75, ry: 0.15, h: 2.2 };
  })() },
]);
const pts2 = (pts) => pts.map((q) => [r2(q[0]), r2(q[1]), r2(q[2])]);
/** Every new walk area: the shack platforms' decks with their porches, the islets, Fisher's Pier and its portal. */
function newAreas() {
  const out = [];
  for (const s of Object.values(SITE)) {
    s.walk.forEach((q, k) => {
      const w = worldRect(s.frame, q);
      out.push({ id: k ? `${s.pn}.${k}` : s.pn, kind: 'rect', ...w, y: r2(s.y) });
    });
    // a narrow way along a pad (already on the walk): a thin area of its own, so the walk graph has nodes in it
    (SITES[s.pn].lanes || []).forEach(([x0, z0, x1, z1], k) => {
      const w = worldRect(s.frame, { x0: Math.min(x0, x1) - 0.02, x1: Math.max(x0, x1) + 0.02, z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
      out.push({ id: `${s.pn}-lane${k}`, kind: 'rect', ...w, y: r2(s.y) });
    });
  }
  for (const [id, list] of Object.entries(TODAY_PORCH)) {
    const f = PLATFORMS[id];
    const plat = { x0: -f[2] / 2, x1: f[2] / 2, z0: -f[3] / 2, z1: f[3] / 2 };
    const rs = erode([plat, ...list.map((q) => pieceRect(f, q))]).filter((q) => !(Math.abs(q.x0 - plat.x0 - INSET) < 1e-9 && Math.abs(q.x1 - plat.x1 + INSET) < 1e-9 && Math.abs(q.z0 - plat.z0 - INSET) < 1e-9 && Math.abs(q.z1 - plat.z1 + INSET) < 1e-9));
    rs.forEach((q, k) => out.push({ id: `${id}.${k + 1}`, kind: 'rect', ...worldRect(f, q), y: r2(f[5]) }));
  }
  for (const I of Object.values(ISLETS)) out.push({ id: I.id, kind: 'circle', x: I.x, z: I.z, r: I.walkR, y: I.profile[I.profile.length - 1][1], profile: I.profile.map(([r, y]) => [r2(r), r2(y)]) });
  // a knot at every sharp bend of a new link or a scenery bridge's walk (where its run-in turns square into the
  // deck): a tiny area (inside the link's own band) whose middle the walk graph takes as a node, so a path follows the
  // bend instead of cutting its corner
  for (const id of LINK_ORDER) {
    const L = LINK[id];
    if (!L) continue;
    const P = L.pts;
    for (let i = 1; i + 1 < P.length; i++) {
      const ax = P[i][0] - P[i - 1][0];
      const az = P[i][2] - P[i - 1][2];
      const bx = P[i + 1][0] - P[i][0];
      const bz = P[i + 1][2] - P[i][2];
      const cos = (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz) || 1);
      if (cos < Math.cos((20 * Math.PI) / 180)) out.push({ id: `${id}-k${i}`, kind: 'rect', x: r2(P[i][0]), z: r2(P[i][2]), w: 0.1, d: 0.1, ry: 0, y: r2(P[i][1]) });
    }
  }
  const FP = FISHER_PIER;
  out.push({ id: 'fisherPier', kind: 'rect', x: r2((FP.x0 + FP.x1) / 2), z: FP.z, w: r2(FP.x1 - FP.x0 - 2 * INSET), d: r2(FP.w - 2 * INSET), ry: 0, y: FP.y });
  // the portal from s18's back porch onto the pier
  out.push({ id: 'fisherPier-s18', kind: 'rect', x: r2(FP.x0 + 0.2), z: FP.z, w: 2.6, d: r2(FP.w - 2 * INSET), ry: 0, y: FP.y });
  return out;
}
/** The posts a link adds as obstacles: a rope bridge's end posts as wide as its band leaves room for (r 0 with the
 * walker's 0.3), a boardwalk's rail posts at its ends. */
function linkPosts(L) {
  const out = [];
  const off = L.kind === 'rope' ? ROPE_HAND : BOARD_RAIL;
  const r = Math.max(0, r2(off - L.hw - 0.3));
  if (L.scenery) {
    // sparrow's bridge({ walk }) posts: square to the chord at both end posts
    const [a, b] = [L.a, L.b];
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
    const sx = -(b[2] - a[2]) / len;
    const sz = (b[0] - a[0]) / len;
    for (const e of [a, b]) for (const k of [-1, 1]) out.push({ x: r2(e[0] + sx * off * k), z: r2(e[2] + sz * off * k), r, h: 1.1 });
    return out;
  }
  // a new link's mouth posts stand along its deck's edge, either side of where it lands, where its rails (off either
  // side of its line) meet the edge
  const [a, b] = [L.a, L.b];
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
  const ux = (b[0] - a[0]) / len;
  const uz = (b[2] - a[2]) / len;
  for (const A of L.anchors) {
    const tx = -A.nz;
    const tz = A.nx;
    const s = off / Math.max(0.35, Math.abs(tx * uz - tz * ux));
    for (const k of [-1, 1]) out.push({ x: r2(A.x + tx * s * k), z: r2(A.z + tz * s * k), r, h: 1.1 });
  }
  return out;
}
// today's four walk links' ends (sparrow's: run-in end, mouth, mouth, run-in end)
const TODAY_ENDS = {
  plazaS1: [[5.59, 1.3, -13.9], [5.6, 1.3, -14.8], [5.63, 1.3, -18.17], [5.63, 1.3, -19.07]],
  tavernTower: [[-11.85, 1.3, -23.4], [-12.75, 1.3, -23.4], [-14.46, 1.3, -23.4], [-15.36, 1.3, -23.4]],
  plazaGarden: [[-7.55, 1.3, -8.57], [-8.45, 1.3, -8.55], [-11.05, 1.4, -8.5], [-11.95, 1.4, -8.48]],
  plazaYard: [[7.6, 1.3, -12.69], [8.5, 1.3, -12.65], [12, 1.3, -12.5], [12.9, 1.3, -12.46]],
};
// Every link's posts (the obstacles at its ends), less any that would stand in a link's band (a run-in turning past its
// own end post, or another link landing beside it): there the rope or rail ends at the post before it. districts.js
// draws the new links' end posts here.
export const LINK_POSTS = freeze((() => {
  const out = {};
  const all = LINK_ORDER.filter((id) => LINK[id]);
  const bands = [...all.map((id) => [LINK[id].pts, LINK[id].hw]), ...Object.values(TODAY_ENDS).map((pts) => [pts, WALKWAY.ropeHw])];
  const segD2 = (x, z, pts) => {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const [ax, , az] = pts[i - 1];
      const [bx, , bz] = pts[i];
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return best;
  };
  for (const id of all) out[id] = linkPosts(LINK[id]).filter((q) => bands.every(([pts, hw]) => segD2(q.x, q.z, pts) >= hw + 0.3 + q.r - 0.005));
  return out;
})());
const onSite = (x, z) => Object.values(SITE).some((s) => {
  const [lx, lz] = W2L(s.frame, x, z);
  return Math.abs(lx) <= s.frame[2] / 2 + 0.05 && Math.abs(lz) <= s.frame[3] / 2 + 0.05;
});
// Lookout Hill's mass for the walk camera: upright cylinders stacked under its profile
export const HILL_CAMS = freeze((() => {
  const out = [];
  for (const r of [11, 9.6, 8.4, 7.4, 6.4, 5.4, 4.4, 3.6]) out.push({ x: HILL.x, z: HILL.z, r: r2(r - 0.15), y0: -0.5, y1: r2(profY(HILL.profile, r) - 0.05), hill: true });
  return out;
})());

/**
 * today's env.walk (base) with the plan merged in, for v4 (§6.3): every key of base kept; areas + the shack decks with
 * their porches, the islets, Fisher's Pier and its portal; links + the seven scenery bridges and the plan's new ones;
 * blockers: the shack platforms' old shack boxes swapped for the 17 pads, + the islets' 4 pads and the new links'
 * posts; camBlockers: the ten plot envelopes swapped for all 21 pads' camera boxes (deck - 0.3 to deck + the plot's
 * max height), + the hill; places + the 21 plot places and the lookout; paths + the islanders' loops; and the lists
 * bridges, hops and districts. plots4: island.js's PLOTS4 (each new plot's max height for its camera box).
 */
export function walkData4(base, plots4) {
  const b = base && typeof base === 'object' ? base : {};
  const list = (v) => (Array.isArray(v) ? v : []);
  const H = {};
  for (const p of list(plots4)) if (p && typeof p.id === 'string' && Number.isFinite(p.height)) H[p.id] = p.height;
  const links = [...list(b.links)];
  const have = new Set(links.map((l) => l && l.id));
  const newLinks = [];
  for (const id of LINK_ORDER) {
    const L = LINK[id];
    if (!L || have.has(id)) continue;
    newLinks.push({ id, pts: pts2(L.pts), hw: L.hw });
  }
  const blockers = list(b.blockers)
    .filter((q) => !(q && q.w !== undefined && onSite(q.x, q.z)))
    .map((q) => {
      const m = q && TODAY_MOVES.find((t) => t.from.x === q.x && t.from.z === q.z && t.from.w === q.w && t.from.d === q.d && t.from.r === q.r);
      return m ? (m.to ? { ...m.to } : null) : q;
    })
    .filter(Boolean);
  for (const id of PLOT_ORDER) {
    const P = PAD[id];
    blockers.push({ ...P.world, h: r2(Math.max(P.top, H[id] || 0)), pad: id });
  }
  for (const id of LINK_ORDER) if (LINK_POSTS[id]) for (const q of LINK_POSTS[id]) blockers.push({ ...q });
  const cams = list(b.camBlockers).filter((q) => !(q && typeof q.plot === 'string'));
  for (const id of PLOT_ORDER) {
    const P = PAD[id];
    const h = Math.max(P.top, H[id] || 0);
    const y0 = P.kind === 'islet' ? P.frame.y - 2.4 : P.frame.y - 0.3;
    cams.push({ ...P.world, y0: r2(y0), y1: r2(P.frame.y + h), plot: id });
  }
  cams.push(...HILL_CAMS);
  const places = [...list(b.places), ...PLOT_PLACES.map((p) => ({ ...p })), { ...LOOKOUT }];
  const paths = [...list(b.paths), ...ISLANDER_PATHS.filter((p) => p.kind === 'islander' && p.pts.length).map((p) => ({ id: p.id, kind: 'islander', loop: true, pts: p.pts }))];
  return {
    radius: b.radius,
    areas: [...list(b.areas), ...newAreas()],
    links: [...links, ...newLinks],
    blockers,
    camBlockers: cams,
    places,
    spawn: b.spawn,
    npcs: list(b.npcs),
    doors: list(b.doors),
    paths,
    bridges: LINK_ORDER.map((id) => ({ art: id, link: id, kind: LINK_PLAN[id].kind })),
    hops: HOPS.map((h) => ({ ...h })),
    districts: DISTRICT_SHAPES.map((d) => ({ ...d })),
  };
}

export const PORCHES = freeze([
  ...Object.values(SITE).flatMap((S) => S.porch.map((q, k) => ({ id: `${S.pn}:${k}`, deck: S.pn, side: q[0], from: q[1], to: q[2], depth: q[3], ...worldRect(S.frame, pieceRect(S.frame, q)), y: S.y }))),
  ...Object.entries(TODAY_PORCH).flatMap(([id, list]) => list.map((q, k) => ({ id: `${id}:${k}`, deck: id, side: q[0], from: q[1], to: q[2], depth: q[3], ...worldRect(PLATFORMS[id], pieceRect(PLATFORMS[id], q)), y: PLATFORMS[id][5] }))),
]);
export const LINKS = freeze(LINK_ORDER.map((id) => ({ id, kind: LINK_PLAN[id].kind, from: LINK_PLAN[id].from || (LINK[id] && LINK[id].anchors ? LINK[id].anchors[0].deck : null), to: LINK_PLAN[id].to || (LINK[id] && LINK[id].anchors ? LINK[id].anchors[1].deck : null), span: LINK[id] ? r2(LINK[id].span || 0) : LINK_PLAN[id].span, today: !!LINK_PLAN[id].today, scenery: !!LINK_PLAN[id].scenery, long: !!LINK_PLAN[id].long, ...(LINK_PLAN[id].name ? { name: LINK_PLAN[id].name } : {}) })));

// ---------------------------------------------------------------------------------------- the islanders' loops (§7.1)
// One closed loop a person (ROUTINES' stations in order, each at its index in pts; h: the way it faces there), laid
// along the walk graph's paths at 0.2 u and thinned where the way runs straight: never pausing on a link, within 2 u of
// a link's mouth, in a doorway, inside a place's circle or at the gangplank; >= 1 u from today's walkers' and
// villagers' loops and from Bess and Barnacle; at most one loop over a long scenery bridge, two over a short rope
// bridge, none over today's four. The merfolk's loops lie in the Grotto's rock pool (their rock, then the water).
// 'dance': the Music Hall's dance spots on the plaza (§4.1, tier 3).
const LOOPS = [
  ['finn', [['pierEnd', 0, 1.57], ['market', 7], ['bench', 13, 3.14]], [[46.2, 1.3, -13.5], [38.58, 1.3, -13.73], [36.35, 1.3, -15.61], [34.74, 1.3, -15.96], [32.2, 1.3, -14.07], [31.49, 1.3, -10.82], [26.88, 1.3, -8.56], [24.96, 1.3, -9.27], [26.88, 1.3, -8.56], [31.49, 1.3, -10.82], [32.2, 1.3, -14.07], [34.74, 1.3, -15.96], [36.35, 1.3, -15.61], [39.4, 1.3, -12.95], [46.2, 1.3, -13.5]]],
  ['marina', [['pier', 0, 0], ['stall', 1]], [[43.6, 1.3, -12.95], [40.8, 1.3, -14.05], [43.6, 1.3, -12.95]]],
  ['jib', [['mooring', 0], ['tavernRail', 43]], [[30.68, 1.6, -21.8], [27.27, 1.6, -23.44], [26.78, 1.6, -24.38], [27.33, 1.6, -24.89], [27.56, 1.6, -25.58], [27.25, 1.6, -26.76], [26.93, 1.6, -27], [26.22, 1.6, -25.21], [26.15, 1.5, -25.03], [26.08, 1.43, -24.85], [26.01, 1.41, -24.67], [25.94, 1.31, -24.49], [25.84, 1.26, -24.34], [25.74, 1.26, -24.18], [25.64, 1.17, -24.03], [25.35, 1.08, -23.57], [25.06, 1.04, -23.11], [25.16, 1.04, -23.28], [25.35, 1.07, -23.62], [25.55, 1.15, -23.95], [25.65, 1.15, -24.12], [25.75, 1.24, -24.29], [25.84, 1.26, -24.46], [25.94, 1.35, -24.63], [26.04, 1.41, -24.8], [26.14, 1.41, -24.97], [26.24, 1.56, -25.14], [26.33, 1.6, -25.31], [26.63, 1.6, -25.81], [26.22, 1.6, -25.13], [26.11, 1.47, -24.96], [25.8, 1.28, -24.44], [25.7, 1.26, -24.27], [25.6, 1.18, -24.1], [25.29, 1.08, -23.59], [24.98, 1.04, -23.08], [24.67, 1.05, -22.56], [24.47, 1.09, -22.22], [24.26, 1.18, -21.88], [24.16, 1.18, -21.71], [24.05, 1.28, -21.54], [23.95, 1.3, -21.36], [23.54, 1.3, -20.68], [22.65, 1.3, -19.73], [23.54, 1.3, -20.68], [24.05, 1.3, -21.54], [24.26, 1.18, -21.88], [24.36, 1.18, -22.05], [24.47, 1.11, -22.22], [24.67, 1.06, -22.56], [25.08, 1.04, -23.25], [25.39, 1.07, -23.76], [25.5, 1.14, -23.93], [25.6, 1.15, -24.1], [25.7, 1.23, -24.27], [25.8, 1.26, -24.44], [26.01, 1.4, -24.79], [26.11, 1.41, -24.96], [26.22, 1.55, -25.13], [26.32, 1.6, -25.3], [26.63, 1.6, -25.81], [26.24, 1.6, -25.14], [26.14, 1.48, -24.97], [26.04, 1.41, -24.8], [25.94, 1.41, -24.63], [25.84, 1.29, -24.46], [25.75, 1.26, -24.29], [25.65, 1.19, -24.12], [25.55, 1.15, -23.95], [25.45, 1.15, -23.79], [25.35, 1.09, -23.62], [25.06, 1.04, -23.11], [25.15, 1.04, -23.28], [25.34, 1.07, -23.62], [25.52, 1.15, -23.95], [25.61, 1.15, -24.12], [25.7, 1.23, -24.29], [25.8, 1.26, -24.46], [25.98, 1.4, -24.79], [26.07, 1.41, -24.96], [26.16, 1.54, -25.13], [26.26, 1.6, -25.3], [26.9, 1.6, -26.48], [26.93, 1.6, -27], [27.25, 1.6, -26.76], [27.56, 1.6, -25.58], [27.33, 1.6, -24.89], [26.78, 1.6, -24.38], [27.27, 1.6, -23.44], [30.68, 1.6, -21.8]]],
  ['nell', [['mooring', 0], ['tavernRail', 4]], [[10.6, 1.3, -24.68], [11.12, 1.3, -22.92], [10.86, 1.3, -21.28], [11.38, 1.3, -20.75], [12.76, 1.3, -20.6], [11.38, 1.3, -20.75], [10.86, 1.3, -21.28], [11.02, 1.3, -23.99], [10.6, 1.3, -24.68]]],
  ['barnaby', [['bench', 0, 3.14], ['pier', 1]], [[38, 1.3, -14.05], [42.2, 1.3, -14.05], [38, 1.3, -14.05]]],
  ['wren', [['porch', 0], ['shore', 4]], [[-38.1, 1.8, -33.8], [-38.4, 1.9, -31.45], [-38.7, 1.8, -29.11], [-40.34, 1.75, -28.53], [-43.25, 1.45, -27.5], [-40.34, 1.75, -28.53], [-38.7, 1.8, -29.11], [-38.4, 1.9, -31.45], [-38.1, 1.8, -33.8]]],
  ['kip', [['swing', 0], ['hide', 6]], [[-40.9, 1.75, -29.1], [-39.86, 1.76, -28.6], [-38.19, 1.85, -30.3], [-37.35, 1.85, -31.15], [-36.23, 1.8, -32.28], [-35.42, 1.74, -33.32], [-34.5, 1.58, -34.5], [-35.46, 1.75, -33.27], [-36.78, 1.83, -31.57], [-37.86, 1.84, -30.19], [-38.7, 1.8, -29.11], [-39.86, 1.76, -28.6], [-40.9, 1.75, -29.1]]],
  ['moss', [['swing', 0], ['hide', 4]], [[-39.6, 1.76, -28.4], [-38.48, 1.86, -30.47], [-37.93, 1.88, -31.5], [-36.34, 1.74, -34.42], [-35.6, 1.56, -35.8], [-36.34, 1.74, -34.42], [-37.93, 1.88, -31.5], [-38.48, 1.86, -30.47], [-39.6, 1.76, -28.4]]],
  ['pearl', [['bench', 0], ['whiskers', 4]], [[11, 1.79, -51.5], [9.27, 2.09, -51.33], [7.92, 2.29, -51.19], [6.96, 2.63, -51.1], [6, 2.93, -51], [6.96, 2.63, -51.1], [7.92, 2.29, -51.19], [9.27, 2.09, -51.33], [11, 1.79, -51.5]]],
  ['jack', [['bench', 0], ['view', 4]], [[9.7, 1.93, -50.6], [10.24, 1.97, -51.86], [10.93, 1.96, -53.48], [11.62, 1.88, -55.1], [12, 1.81, -56], [11.62, 1.88, -55.1], [10.93, 1.96, -53.48], [10.24, 1.97, -51.86], [9.7, 1.93, -50.6]]],
  ['lily', [['steps', 0], ['foot', 3]], [[0.4, 4.4, -52.8], [-0.83, 2.36, -49.06], [-0.89, 2.28, -48.87], [-1.5, 1.88, -47], [-0.89, 2.28, -48.87], [-0.83, 2.36, -49.06], [0.4, 4.4, -52.8]]],
  ['tom', [['steps', 0], ['foot', 4]], [[3.6, 4.4, -52.8], [3.98, 3.8, -51.68], [4.87, 2.35, -49.07], [4.93, 2.28, -48.88], [5.5, 1.91, -47.2], [4.93, 2.28, -48.88], [4.87, 2.35, -49.07], [3.98, 3.8, -51.68], [3.6, 4.4, -52.8]]],
  ['ada', [['anvil', 0], ['trough', 1], ['grindstone', 5]], [[-10.25, 1.5, -31.25], [-10.54, 1.5, -33.39], [-10.93, 1.5, -33.01], [-10.28, 1.5, -31.71], [-8.82, 1.5, -30.76], [-5.97, 1.5, -30.82], [-10.25, 1.5, -31.25]]],
  ['ida', [['bellows', 0], ['coal', 2]], [[-9.47, 1.5, -31.02], [-10.28, 1.5, -31.71], [-10.65, 1.5, -32.3], [-10.28, 1.5, -31.71], [-9.47, 1.5, -31.02]]],
  ['bo', [['hay', 0], ['pen', 2], ['fence', 4]], [[-15.95, 1.6, -35.54], [-14.23, 1.6, -35.41], [-13.97, 1.6, -36.85], [-14.23, 1.6, -35.41], [-14.64, 1.6, -35.52], [-15.95, 1.6, -35.54]]],
  ['hettie', [['orchard', 0], ['stall', 25]], [[-14, 1.6, -36.02], [-18.03, 1.6, -35.03], [-18.13, 1.6, -33.86], [-18.15, 1.57, -33.67], [-18.25, 1.53, -32.5], [-18.27, 1.49, -32.31], [-18.37, 1.45, -31.14], [-18.39, 1.42, -30.94], [-18.46, 1.38, -30.16], [-18.49, 1.38, -29.78], [-18.51, 1.34, -29.58], [-18.57, 1.3, -28.8], [-18.63, 1.3, -28.22], [-20.63, 1.3, -27.19], [-20.62, 1.3, -24.02], [-21.75, 1.3, -23.93], [-21.94, 1.23, -23.91], [-22.32, 1.23, -23.88], [-22.69, 1.3, -23.85], [-23.07, 1.3, -23.82], [-28.81, 1.3, -22.05], [-28.85, 1.3, -21.06], [-27.27, 1.3, -18.33], [-27.22, 1.3, -15.37], [-27.62, 1.3, -13.95], [-34.11, 1.3, -12.97], [-27.62, 1.3, -13.95], [-27.22, 1.3, -15.37], [-27.91, 1.3, -19.89], [-28.85, 1.3, -21.06], [-28.81, 1.3, -22.05], [-23.07, 1.3, -23.82], [-22.32, 1.3, -23.88], [-21.94, 1.23, -23.91], [-21.75, 1.23, -23.93], [-21.37, 1.3, -23.96], [-20.62, 1.3, -24.02], [-20.63, 1.3, -27.19], [-18.63, 1.3, -28.22], [-18.52, 1.3, -29.39], [-18.51, 1.34, -29.58], [-18.47, 1.37, -29.97], [-18.4, 1.38, -30.75], [-18.39, 1.42, -30.94], [-18.34, 1.45, -31.53], [-18.28, 1.45, -32.11], [-18.27, 1.49, -32.31], [-18.22, 1.53, -32.89], [-18.16, 1.53, -33.47], [-18.15, 1.57, -33.67], [-18.1, 1.6, -34.25], [-18.03, 1.6, -35.03], [-14, 1.6, -36.02]]],
  ['paz', [['stage', 0], ['tavern', 15]], [[6.67, 1.8, -29.02], [6.1, 1.8, -29.4], [5.44, 1.8, -31.54], [5.51, 1.8, -32.94], [5.24, 1.8, -33.66], [5.1, 1.74, -34.03], [4.9, 1.73, -34.57], [4.63, 1.67, -35.29], [4.49, 1.67, -35.66], [4.49, 1.63, -35.83], [4.48, 1.6, -36.19], [4.47, 1.6, -36.9], [1.31, 1.6, -36.9], [-0.79, 1.6, -35.05], [-0.82, 1.6, -34.04], [1.1, 1.6, -33.58], [-0.82, 1.6, -34.04], [-0.79, 1.6, -35.05], [1.31, 1.6, -36.9], [4.47, 1.6, -36.9], [4.58, 1.6, -35.73], [4.59, 1.65, -35.54], [4.66, 1.67, -34.76], [4.68, 1.71, -34.56], [4.72, 1.73, -34.17], [5.02, 1.73, -33.71], [5.12, 1.77, -33.56], [5.31, 1.8, -33.25], [5.51, 1.8, -32.94], [5.41, 1.8, -30.84], [6.1, 1.8, -29.4], [6.67, 1.8, -29.02]]],
  ['dot', [['stage', 0], ['tavern', 1]], [[10.17, 1.8, -28.85], [11.37, 1.8, -29.05], [10.17, 1.8, -28.85]]],
  ['sid', [['stage', 0], ['tavern', 11]], [[5.76, 1.8, -30.87], [5.37, 1.8, -30.14], [6.1, 1.8, -29.4], [12.89, 1.8, -28.36], [12.81, 1.55, -28.18], [12.73, 1.55, -28], [12.65, 1.38, -27.82], [12.49, 1.3, -27.45], [12.17, 1.3, -26.72], [10.77, 1.3, -25.82], [10.86, 1.3, -21.28], [12.35, 1.3, -19.45], [10.86, 1.3, -21.28], [10.77, 1.3, -25.82], [12.17, 1.3, -26.72], [12.73, 1.3, -28], [12.81, 1.47, -28.18], [12.89, 1.52, -28.36], [12.5, 1.49, -28.42], [12.31, 1.8, -28.45], [6.1, 1.8, -29.4], [5.37, 1.8, -30.14], [5.76, 1.8, -30.87]]],
  ['quill', [['cases', 0], ['steps', 2]], [[19.52, 1.6, -32.94], [14.87, 1.6, -34.27], [14.64, 1.6, -35.05], [14.87, 1.6, -34.27], [19.52, 1.6, -32.94]]],
  ['fern', [['porch', 0], ['corner', 1]], [[14.8, 1.6, -35.83], [15.28, 1.6, -38.18], [14.8, 1.6, -35.83]]],
  ['ollie', [['porch', 0], ['corner', 1]], [[15.06, 1.6, -36.62], [14.82, 1.6, -37.4], [15.06, 1.6, -36.62]]],
  ['stella', [['scope', 0], ['ring', 2]], [[-0.6, 4.4, -56], [-0.59, 4.4, -57.88], [2, 4.4, -59.2], [-0.59, 4.4, -57.88], [-0.6, 4.4, -56]]],
  ['coral', [['pail', 0], ['tanks', 2], ['glass', 5]], [[5.75, 1.6, -40], [6.05, 1.6, -42.77], [4.8, 1.6, -43.2], [-1.06, 1.6, -43.5], [-1.85, 1.6, -42.03], [-1.55, 1.6, -40], [-1.85, 1.6, -38.37], [-1.06, 1.6, -36.9], [6.05, 1.6, -37.63], [5.75, 1.6, -40]]],
  ['pip', [['glass', 0], ['corner', 2]], [[-1.55, 1.6, -41], [-1.85, 1.6, -42.03], [-0.8, 1.6, -43.2], [-1.85, 1.6, -42.03], [-1.55, 1.6, -41]]],
  ['nerissa', [['rock', 0], ['pool', 2]], [[-40.87, 1.95, -38.55], [-39.85, 1.43, -38.4], [-39.25, 1.43, -37.78], [-40.27, 1.43, -37.92], [-40.87, 1.95, -38.55]]],
  ['kai', [['rock', 0], ['pool', 2]], [[-38.8, 1.95, -38.62], [-39.15, 1.43, -38.3], [-39.91, 1.43, -37.5], [-39.57, 1.43, -37.82], [-38.8, 1.95, -38.62]]],
  ['bun', [['oven', 0], ['porch', 3]], [[-20.84, 1.3, -10.67], [-19.23, 1.3, -8.66], [-19.63, 1.3, -7.71], [-21.06, 1.3, -6.55], [-19.63, 1.3, -7.71], [-19.23, 1.3, -8.66], [-20.84, 1.3, -10.67]]],
  ['mo', [['mill', 0], ['porch', 2]], [[-29.59, 1.3, -25.41], [-28.29, 1.3, -22.93], [-27.33, 1.3, -22.87], [-28.29, 1.3, -22.93], [-29.59, 1.3, -25.41]]],
  ['lars', [['lamp', 0], ['porch', 2]], [[34.63, 1.3, -9.42], [31.77, 1.3, -12.43], [31.82, 1.3, -13.22], [31.77, 1.3, -12.43], [34.63, 1.3, -9.42]]],
  ['tam', [['stall', 0], ['store', 3]], [[-28.54, 1.3, -13.53], [-33.9, 1.3, -13.32], [-34.27, 1.3, -14.03], [-34.53, 1.3, -15.14], [-34.27, 1.3, -14.03], [-33.9, 1.3, -13.32], [-28.54, 1.3, -13.53]]],
  ['page', [['desk', 0], ['porch', 2]], [[-22.27, 1.3, 5.46], [-21.86, 1.3, 5.57], [-17.97, 1.3, 3.19], [-21.86, 1.3, 5.57], [-22.27, 1.3, 5.46]]],
  ['rosa', [['beds', 0], ['pump', 5]], [[-32.36, 1.3, -7.15], [-33.47, 1.3, -6.46], [-32.99, 1.3, -4.56], [-32.36, 1.3, -2.1], [-32.16, 1.3, -1.32], [-30.88, 1.3, -1.34], [-32.16, 1.3, -1.32], [-32.36, 1.3, -2.1], [-32.99, 1.3, -4.56], [-33.47, 1.3, -6.46], [-32.36, 1.3, -7.15]]],
  ['dance', [['spot0', 0], ['spot1', 1], ['spot2', 2], ['spot3', 3], ['spot4', 4]], [[-3.5, 1.3, -11.15], [-0.98, 1.3, -10.75], [1.45, 1.3, -11.14], [2.66, 1.3, -12.04], [-0.5, 1.3, -9.25]]],
];
export const ISLANDER_PATHS = freeze(LOOPS.map(([who, st, pts]) => (who === 'dance'
  ? { id: 'dance', kind: 'dance', pts, stations: st.map(([id, i]) => ({ id, i })) }
  : { id: `isl:${who}`, islander: who, kind: 'islander', loop: true, pts, stations: st.map(([id, i, h]) => (h === undefined ? { id, i } : { id, i, h })) })));

// ---------------------------------------------------------------------------------------- the decks and districts
// Every deck by district: sparrow's platforms, the garden, the islets (circles with their profiles) and Fisher's Pier.
const DECK_DISTRICT = {
  pier: 'harbour', plaza: 'harbour', tavern: 'harbour', tower: 'harbour', yard: 'harbour', s1: 'harbour', garden: 'harbour',
  s16: 'windmill', s8: 'windmill', s13: 'windmill', s14: 'windmill', s15: 'windmill', s6: 'windmill',
  s3: 'lantern', s4: 'lantern', s10: 'lantern', s12: 'lantern', s5: 'lantern', s11: 'lantern',
  s2: 'lighthouse', s7: 'lighthouse', s17: 'lighthouse', s9: 'lighthouse', s18: 'lighthouse', fisherPier: 'lighthouse',
  beach: 'beach', hill: 'hill',
};
export const DECKS = freeze([
  ...Object.entries(PLATFORMS).map(([id, f]) => {
    const pieces = (SITE[id] ? SITE[id].porch : TODAY_PORCH[id] || []).map((q) => ({ ...worldRect(f, pieceRect(f, q)), y: f[5] }));
    return { id, district: DECK_DISTRICT[id], kind: SITE[id] ? 'shack' : 'today', x: f[0], z: f[1], w: f[2], d: f[3], ry: f[4], y: f[5], ...(SITE[id] ? { plot: SITE[id].plot } : {}), porches: pieces };
  }),
  { id: 'garden', district: 'harbour', kind: 'today', x: GARDEN.x, z: GARDEN.z, r: GARDEN.r, y: GARDEN.y, profile: GARDEN.profile },
  ...Object.values(ISLETS).map((I) => ({ id: I.id, district: DECK_DISTRICT[I.id], kind: 'islet', x: I.x, z: I.z, r: I.r, y: I.profile[0][1], profile: I.profile })),
  { id: 'fisherPier', district: 'lighthouse', kind: 'pier', x: r2((FISHER_PIER.x0 + FISHER_PIER.x1) / 2), z: FISHER_PIER.z, w: r2(FISHER_PIER.x1 - FISHER_PIER.x0), d: FISHER_PIER.w, ry: 0, y: FISHER_PIER.y },
]);
const inDeck = (D, x, z, m = 0) => {
  if (D.r !== undefined) return Math.hypot(x - D.x, z - D.z) <= D.r + m;
  const rects = [D, ...(D.porches || [])];
  return rects.some((q) => {
    const [lx, lz] = W2L([q.x, q.z, 0, 0, q.ry || 0], x, z);
    return Math.abs(lx) <= q.w / 2 + m && Math.abs(lz) <= q.d / 2 + m;
  });
};
const linkEnds = (id) => {
  const P = LINK_PLAN[id];
  return [P.from || (P.a && P.a[0]), P.to || (P.b && P.b[0])];
};
/** The district of the deck under (x, z) (its porches and the islets' sand included), or of the nearer end of the link
 * under it; null over open water. */
export function districtAt(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  for (const D of DECKS) if (inDeck(D, x, z, 0.05)) return D.district;
  let best = null;
  let bd = Infinity;
  for (const id of LINK_ORDER) {
    const L = LINK[id];
    const pts = L ? L.pts : null;
    if (!pts) continue;
    for (let i = 1; i < pts.length; i++) {
      const [ax, , az] = pts[i - 1];
      const [bx, , bz] = pts[i];
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d <= L.hw + 0.3 && d < bd) {
        bd = d;
        const [e0, e1] = linkEnds(id);
        const u = (i - 1 + t) / (pts.length - 1);
        best = DECK_DISTRICT[u < 0.5 ? e0 : e1] || null;
      }
    }
  }
  return best;
}


// The plan's own idea of the walk (for standing props off it and hop points on it): the shack decks' walk rects, today's
// decks inset as sparrow's are, the garden's, the islets' and the pier's, and every new link's band.
const TODAY_WALK = ['pier', 'plaza', 'tavern', 'tower', 'yard', 's1'].flatMap((id) => {
  const f = PLATFORMS[id];
  const plat = { x0: -f[2] / 2, x1: f[2] / 2, z0: -f[3] / 2, z1: f[3] / 2 };
  return erode([plat, ...(TODAY_PORCH[id] || []).map((q) => pieceRect(f, q))]).map((q) => [f, q]);
});
const SITE_WALK = Object.values(SITE).flatMap((S) => S.walk.map((q) => [S.frame, q]));
const segD = (x, z, pts) => {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, , az] = pts[i - 1];
    const [bx, , bz] = pts[i];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
};
/** How far (x, z) is inside the plan's walk (> 0) or outside it (< 0). */
function walkDepth(x, z) {
  let best = -Infinity;
  for (const [f, q] of [...TODAY_WALK, ...SITE_WALK]) {
    const [lx, lz] = W2L(f, x, z);
    best = Math.max(best, Math.min(lx - q.x0, q.x1 - lx, lz - q.z0, q.z1 - lz));
  }
  for (const C of [{ x: GARDEN.x, z: GARDEN.z, r: GARDEN.walkR }, ...Object.values(ISLETS).map((I) => ({ x: I.x, z: I.z, r: I.walkR }))]) best = Math.max(best, C.r - Math.hypot(x - C.x, z - C.z));
  const FP = FISHER_PIER;
  best = Math.max(best, Math.min(x - FP.x0, FP.x1 - x, FP.w / 2 - Math.abs(z - FP.z)) - INSET);
  for (const id of LINK_ORDER) {
    const L = LINK[id];
    if (L) best = Math.max(best, L.hw - segD(x, z, L.pts));
  }
  for (const T of Object.values(TODAY_ENDS)) best = Math.max(best, WALKWAY.ropeHw - segD(x, z, T));
  return best;
}
const inPad = (x, z, m) => Object.values(PAD).some((P) => {
  const [lx, lz] = W2L([P.frame.x, P.frame.z, 0, 0, P.frame.ry], x, z);
  return lx > P.x0 - m && lx < P.x1 + m && lz > P.z0 - m && lz < P.z1 + m;
});

// The six districts' colours (rails, bunting, arches; never the only cue) and their signposts' words.
const DCOL = { harbour: 0x2f6fd8, windmill: 0x5fcfa8, lantern: 0xf28c28, lighthouse: 0x1fa3a3, beach: 0xff7f6a, hill: 0x6cbf4a };
const WORD = { harbour: 'Harbour', windmill: 'Windmill', lantern: 'Lanterns', lighthouse: 'Lighthouse', beach: 'Beach', hill: 'Hill' };
const ICON = { harbour: 'anchor', windmill: 'windmill', lantern: 'lantern', lighthouse: 'lighthouse', beach: 'palm', hill: 'star' };

// A link's end on a deck: where it lands (on the deck's edge), the way into the deck, the way along its edge.
function linkEnd(id, k) {
  const P = LINK_PLAN[id];
  const L = LINK[id];
  if (L && L.anchors) {
    const A = L.anchors[k];
    return { deck: A.deck, x: A.x, z: A.z, y: A.y, nx: A.nx, nz: A.nz, off: P.kind === 'rope' ? ROPE_HAND : BOARD_RAIL };
  }
  if (!L) {
    // today's four: their walk's mouth post and run-in end (sparrow's, unchanged)
    const T = TODAY_ENDS[id];
    if (!T) return null;
    const [m, e] = k ? [T[2], T[3]] : [T[1], T[0]];
    const len = Math.hypot(e[0] - m[0], e[2] - m[2]) || 1;
    return { deck: linkEnds(id)[k], x: m[0], z: m[2], y: m[1], nx: (e[0] - m[0]) / len, nz: (e[2] - m[2]) / len, off: ROPE_HAND };
  }
  // a scenery bridge: its end post, into the deck along its chord
  const e = k ? L.b : L.a;
  const o = k ? L.a : L.b;
  const len = Math.hypot(e[0] - o[0], e[2] - o[2]) || 1;
  return { deck: linkEnds(id)[k], x: e[0], z: e[2], y: e[1], nx: (e[0] - o[0]) / len, nz: (e[2] - o[2]) / len, off: ROPE_HAND };
}

// Named arches (§6.4) at each new district's way in from the harbour side: over the link's land end, posts either side
// of its rails; walking through `line` shows the toast.
const ARCH_AT = [
  ['windmill', 'WINDMILL ROW', 'towerS6', 1, 'a mint arch hung with little sails'],
  ['lantern', 'LANTERN LANE', 's10Tower', 0, 'an orange arch hung with paper lanterns'],
  ['lighthouse', 'LIGHTHOUSE POINT', 'yardS9', 1, 'a teal and gold arch with a ship\'s bell'],
  ['beach', 'SUNSET BEACH', 's15Beach', 1, 'driftwood and coral shells'],
  ['hill', 'LOOKOUT HILL', 's12Hill', 1, 'a green arch with a star on top'],
];
export const ARCHES = freeze(ARCH_AT.map(([district, words, link, k, look]) => {
  const E = linkEnd(link, k);
  // (at the deck's outer edge: a scenery bridge's end post may stand inside a porch)
  const D = DECKS.find((q) => q.id === E.deck);
  let back = 0;
  while (back < 2 && D && inDeck(D, E.x - E.nx * (back + 0.05), E.z - E.nz * (back + 0.05))) back += 0.05;
  E.x -= E.nx * back;
  E.z -= E.nz * back;
  let half = E.off + 0.3;
  while (half < E.off + 1.2 && [1, -1].some((k) => walkDepth(E.x + E.nx * 0.12 - E.nz * half * k, E.z + E.nz * 0.12 + E.nx * half * k) > -0.45)) half += 0.05;
  const tx = -E.nz;
  const tz = E.nx;
  const x = E.x + E.nx * 0.12;
  const z = E.z + E.nz * 0.12;
  return {
    id: `arch:${district}`, district, name: DISTRICTS_NAME[district], words, look, link, colour: DCOL[district],
    x: r2(x), y: r2(E.y), z: r2(z), ry: r3(Math.atan2(E.nx, E.nz)), w: r2(half * 2), h: 3.1,
    posts: [[r2(x - tx * half), r2(z - tz * half)], [r2(x + tx * half), r2(z + tz * half)]],
    line: [[r2(x - tx * half), r2(z - tz * half)], [r2(x + tx * half), r2(z + tz * half)]],
  };
}));

// Signposts (§6.4) at every junction (a deck where three or more links meet, or where a link leads to another
// district): one beside the end of the link it is read from, with a board per way out (the links leaving the deck
// toward each other district, on the fewest-links route), the district's word, icon and colour.
const DECK_LINKS = {};
for (const id of LINK_ORDER) {
  const [a, b] = linkEnds(id);
  (DECK_LINKS[a] ||= []).push([id, 0, b]);
  (DECK_LINKS[b] ||= []).push([id, 1, a]);
}
function firstLinks(from) {
  // breadth-first over decks: for each district, the link out of `from` that starts the shortest route to it
  const first = { [from]: null };
  const q = [from];
  while (q.length) {
    const d = q.shift();
    for (const [id, , other] of DECK_LINKS[d] || []) {
      if (other in first) continue;
      first[other] = d === from ? id : first[d];
      q.push(other);
    }
  }
  const out = {};
  for (const [deck, id] of Object.entries(first)) {
    const dist = DECK_DISTRICT[deck];
    if (id && dist !== DECK_DISTRICT[from] && !(dist in out)) out[dist] = id;
  }
  return out;
}
const clearOfLinks = (x, z, pad) => LINK_ORDER.every((id) => {
  const L = LINK[id];
  if (!L) return true;
  for (let i = 1; i < L.pts.length; i++) {
    const [ax, , az] = L.pts[i - 1];
    const [bx, , bz] = L.pts[i];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(x - ax - dx * t, z - az - dz * t) < L.hw + pad) return false;
  }
  return true;
});
export const SIGNPOSTS = freeze((() => {
  const out = [];
  for (const deck of Object.keys(DECK_LINKS)) {
    const here = DECK_LINKS[deck];
    const ways = firstLinks(deck);
    const crossing = here.some(([, , other]) => DECK_DISTRICT[other] !== DECK_DISTRICT[deck]);
    if (here.length < 3 && !crossing) continue;
    if (!Object.keys(ways).length) continue;
    // read from the end of the link that leads home (toward the harbour), else the first
    const homeLink = ways.harbour || here[0][0];
    const [hid, hk] = here.find(([id]) => id === homeLink) || here[0];
    const E = linkEnd(hid, hk);
    const D = DECKS.find((q) => q.id === deck);
    let spot = null;
    for (const sx of [0.45, 0.7, 1.0, 1.4, 1.9]) for (const side of [1, -1]) for (const into of [0.12, 0.3, 0.5, -0.1]) {
      if (spot) break;
      const st = E.off + sx;
      const x = E.x + -E.nz * st * side + E.nx * into;
      const z = E.z + E.nx * st * side + E.nz * into;
      if (D && inDeck(D, x, z, -0.08) && walkDepth(x, z) < -0.5 && !inPad(x, z, 0.25)) spot = [x, z];
    }
    if (!spot) continue;
    const arrows = {};
    for (const [dist, id] of Object.entries(ways)) {
      const [k] = here.filter(([lid]) => lid === id).map(([, kk]) => kk);
      const e = linkEnd(id, k);
      (arrows[id] ||= { link: id, h: r3(Math.atan2(-e.nx, -e.nz)), words: [], districts: [] });
      arrows[id].words.push(WORD[dist]);
      arrows[id].districts.push(dist);
    }
    // (two words a board at most: the nearest districts that way)
    const boards = Object.values(arrows).slice(0, 4).map((a) => ({ ...a, words: a.words.slice(0, 2), districts: a.districts.slice(0, 2), icon: ICON[a.districts[0]], colour: DCOL[a.districts[0]] }));
    out.push({ id: `sign:${deck}`, deck, district: DECK_DISTRICT[deck], x: r2(spot[0]), y: r2(E.y), z: r2(spot[1]), boards });
  }
  return out;
})());

// One landmark a direction (§6.4): what you steer by from anywhere on the walk.
export const LANDMARKS = freeze([
  { id: 'lighthouse', dir: 'east', district: 'lighthouse', plot: 'lighthouse', x: PAD.lighthouse.frame.x, z: PAD.lighthouse.frame.z },
  { id: 'windmill', dir: 'west', district: 'windmill', plot: 'windmill', x: PAD.windmill.frame.x, z: PAD.windmill.frame.z },
  { id: 'observatory', dir: 'north', district: 'hill', plot: 'observatory', x: PAD.observatory.frame.x, z: PAD.observatory.frame.z },
  { id: 'palm', dir: 'north-west', district: 'beach', plot: 'homeE', x: PAD.homeE.frame.x, z: PAD.homeE.frame.z },
  { id: 'tavern', dir: 'home', district: 'harbour', what: "the tavern's chimney smoke", x: -6.4, z: -21 },
]);

// Hop points (§8.5): one a district, just inside its arch (the harbour's by Bess on the plaza), on the walk.
const PLACE_SPOTS = [...PLOT_PLACES, LOOKOUT];
const hopAt = (link, k, into) => {
  const E = linkEnd(link, k);
  let x = E.x + E.nx * into;
  let z = E.z + E.nz * into;
  search: for (const s of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.0, -2.0]) for (const d of [into, into - 0.4, into - 0.8, into + 0.4, into + 0.8, into + 1.2]) {
    const qx = E.x + E.nx * d - E.nz * s;
    const qz = E.z + E.nz * d + E.nx * s;
    if (walkDepth(qx, qz) > 0.35 && !inPad(qx, qz, 0.4) && PLACE_SPOTS.every((p) => Math.hypot(qx - p.x, qz - p.z) > p.r + 0.4) && LINK_ORDER.every((id) => !LINK[id] || segD(qx, qz, LINK[id].pts) > LINK[id].hw + 0.4)) {
      [x, z] = [qx, qz];
      break search;
    }
  }
  const D = DECKS.find((q) => q.id === E.deck);
  const y = D && D.profile ? profY(D.profile, Math.hypot(x - D.x, z - D.z)) : E.y;
  return { x: r2(x), y: r2(y), z: r2(z), h: r3(Math.atan2(E.nx, E.nz)) };
};
export const HOPS = freeze([
  { id: 'hop:harbour', district: 'harbour', x: 3.2, y: 1.3, z: -7.4, h: 3.142 },
  { id: 'hop:windmill', district: 'windmill', ...hopAt('gardenS8', 1, 2.1) },
  { id: 'hop:lantern', district: 'lantern', ...hopAt('s4S3', 1, 1.6) },
  { id: 'hop:lighthouse', district: 'lighthouse', ...hopAt('yardS9', 1, 2.0) },
  { id: 'hop:beach', district: 'beach', ...hopAt('s15Beach', 1, 2.4) },
  { id: 'hop:hill', district: 'hill', ...hopAt('s12Hill', 1, 2.4) },
]);

// Each district's outline (the convex hull of its decks, porches and islets, 0.8 u out), colour and arch line.
function hull(P) {
  const p = [...P].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up = [];
  for (const q of p.reverse()) {
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}
const DISTRICT_SHAPES = DISTRICTS_LIST.map((D) => {
  const pts = [];
  for (const q of DECKS.filter((k) => k.district === D.id)) {
    if (q.r !== undefined) for (let i = 0; i < 16; i++) pts.push([q.x + Math.cos((i / 16) * TAU) * (q.r + 0.8), q.z + Math.sin((i / 16) * TAU) * (q.r + 0.8)]);
    else for (const R of [q, ...(q.porches || [])]) for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push(L2W([R.x, R.z, 0, 0, R.ry || 0], u * (R.w / 2 + 0.8), v * (R.d / 2 + 0.8)));
  }
  const arch = ARCHES.find((a) => a.district === D.id);
  return { id: D.id, name: D.name, colour: DCOL[D.id], poly: hull(pts).map(([x, z]) => [r2(x), r2(z)]), arch: arch ? arch.line : null };
});

// Where the animals live (critters.js's SPOTS by name, world { x, y, z, r }), on this layout.
const plotW = (id, lx, lz, dy = 0) => {
  const P = PAD[id];
  const [x, z] = L2W([P.frame.x, P.frame.z, 0, 0, P.frame.ry], P.off[0] + lx, P.off[1] + lz);
  return { x: r2(x), y: r2(P.frame.y + dy), z: r2(z) };
};
export const ANIMAL_SPOTS = freeze({
  tavernRoof: { x: -7.1, y: 10.1, z: -20.62, r: 0.1, along: [2.5, -0.1] },
  harbour: { x: 5.6, y: 1.3, z: -12.6, r: 1.4 },
  palms: { x: -15.3, y: 1.56, z: -6.7, r: 0.8 },
  beach: { x: -35.6, y: r2(profY(BEACH.profile, Math.hypot(-35.6 - BEACH.x, -29.2 - BEACH.z))), z: -29.2, r: 1.6 },
  pier: { x: 42.0, y: 1.3, z: -13.5, r: 1.2, along: [2.5, 0] },
  pen: { ...plotW('farm', -0.6, -0.6), r: 0.9 },
  hill: { x: -4.6, y: r2(profY(HILL.profile, Math.hypot(-4.6 - HILL.x, -52.6 - HILL.z))), z: -52.6, r: 1.6 },
  barnRoof: { ...plotW('farm', -1.3, -1.2, 2.72), r: 0.1 },
  // (the Aquarium's tide pool, buildings4's tidePool at (-1.75, 0) in its frame: tier 3's turtle pool with its sand
  // island; out of plot:aquarium's place circle, where the captain reads the board)
  pool: { ...plotW('aquarium', -1.75, 0, 0.3), r: 0.25, along: [0.3, 0] },
  grotto: { ...plotW('grotto', 0, 0.15, -0.12), r: 0.7 },
});

/** For the design viz. */
export function _debug() {
  const out = { sites: [], islets: [BEACH, HILL], pier: FISHER_PIER, links: Object.values(LINK) };
  for (const s of Object.values(SITE)) {
    const f = s.frame;
    out.sites.push({
      pn: s.pn,
      plot: s.plot,
      pad: worldRect(f, s.pad),
      pieces: s.pieces.map((p) => worldRect(f, p)),
      walk: s.walk.map((p) => worldRect(f, p)),
      strips: { l: r2(s.pad.x0 - s.plat.x0), r: r2(s.plat.x1 - s.pad.x1), b: r2(s.pad.z0 - s.plat.z0), f: r2(s.plat.z1 - s.pad.z1) },
    });
  }
  return out;
}
