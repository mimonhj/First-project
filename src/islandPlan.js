// The walkable island's plan (SPEC4 §6): the six districts, their decks and the links between them (every link
// with its kind: 'rope' | 'board' | 'steps'), each plot's pad (the building's own footprint: a walk blocker and a
// camera box from tier 0), the porches, the plot places, signposts, arches, landmarks, hop points, the keep-offs and
// the islanders' paths. Station and path coordinates live here only.
//
// Pure: imports nothing (walk.test, islanders.test and the Node tests load it as a data: URL). Its art is
// districts.js's; sparrow.js merges walkData4() into env.walk (only with v4).
//
// DISTRICTS, DECKS, LINKS, PADS, PORCHES, PLOT_PLACES, SIGNPOSTS, ARCHES, LANDMARKS, HOPS, KEEP_OFF, ISLANDER_PATHS,
// WALKWAY; walkData4(base, plots4) -> { radius, areas, links, blockers, camBlockers, places, spawn, npcs, doors,
// paths, bridges, hops, districts }; districtAt(x, z) -> id | null
//
// STAGE 0 SCAFFOLD: the final API, holding what Stage 0 measured and derived (SPEC4 §12 Stage 0):
// - PADS: the ten SPEC3 plots' pads, measured at eedb108 from their baked tier-1..3 chunks (every vertex above the
//   deck + 0.3, in the plot's frame: its platform's, +z its front, x across), + 0.2 u; with the free strips left to
//   the platform's edges (negative: the pad hangs over that edge) and where the scenery bridges' walk mouths (0.9 u
//   in from the bridge's end) land in that frame. The seven new shack plots' pad limits, derived from §6.2's link
//   plan: the deck less a 1.6 u porch on the front (the board's side) and on every side a link reaches, 0.4 u on the
//   others (a link reaches the side the line from the deck's centre to the other deck leaves through; s7S17 lands
//   where its scenery bridge ends); porchExtension marks a limit under 3.0 x 3.0 u. The four islet pads of §4.1
//   (their size; 1N places them). docs/sunset-isles/stage0-report.md has the numbers and how they were measured.
// - LINKS: every link with its kind (today's four, the seven scenery bridges, the five new rope bridges, the sixteen
//   boardwalks and steps of §6.2), its decks, its plan span of water.
// - ISLANDER_PATHS: one path id per islander of §7.1 (no points yet).
// Everything else is empty and walkData4() adds nothing. Stage 1 (1N) writes the plan.

function freeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v);
  return Object.freeze(o);
}

// §11.1: the walk bands (hw) by link kind, and the porch rules.
export const WALKWAY = freeze({ boardHw: 0.6, boardWidth: 2.0, stepsHw: 0.6, ropeHw: 0.25, ropeMax: 3, ropeLoops: 2, longRopeLoops: 1, porch: 1.6, padPad: 0.2 });

// §6.2: the six districts (colour cue, landmark) and their plots.
export const DISTRICTS = freeze([
  { id: 'harbour', name: 'Harbour', colour: 'red, white and blue', landmark: 'the tavern, the lookout tower', plots: [] },
  { id: 'windmill', name: 'Windmill Row', colour: 'mint', landmark: 'the windmill', plots: ['homeA', 'bakery', 'school', 'park', 'market', 'windmill'] },
  { id: 'lantern', name: 'Lantern Lane', colour: 'orange', landmark: "the Music Hall's shell roof", plots: ['homeB', 'forge', 'farm', 'aquarium', 'music', 'museum'] },
  { id: 'lighthouse', name: 'Lighthouse Point', colour: 'teal and gold', landmark: 'the lighthouse', plots: ['homeC', 'homeD', 'homeF', 'fishing', 'lighthouse'] },
  { id: 'beach', name: 'Sunset Beach', colour: 'coral', landmark: "the Treehouse's giant palm", plots: ['homeE', 'grotto'] },
  { id: 'hill', name: 'Lookout Hill', colour: 'meadow green', landmark: "the Observatory's dome", plots: ['homeG', 'observatory'] },
]);

// §6.2: the decks the plan adds or makes walkable (the platforms as sparrow.js builds them; the islets and the pier
// as planned). Stage 1 completes it (Harbour's decks are today's walk areas).
export const DECKS = freeze([]);

// §6.2: every link, by id, with its kind and its plan span of water (u; the scenery bridges' spans are the deck gaps
// from sparrow.js's bridge ends, today's four their walk links' lengths). today: walkable at eedb108; scenery: a
// rope bridge drawn at eedb108 without a walk link.
const L = (id, kind, from, to, span, extra = {}) => ({ id, kind, from, to, span, today: false, scenery: false, ...extra });
export const LINKS = freeze([
  // today's four walkable rope bridges (unchanged)
  L('plazaS1', 'rope', 'plaza', 's1', 5.17, { today: true }),
  L('tavernTower', 'rope', 'tavern', 'tower', 3.51, { today: true }),
  L('plazaGarden', 'rope', 'plaza', 'garden', 4.4, { today: true }),
  L('plazaYard', 'rope', 'plaza', 'yard', 5.31, { today: true }),
  // the seven scenery rope bridges made walkable (their art kept; five are long: at most one islander loop each)
  L('s1S2', 'rope', 's1', 's2', 2.83, { scenery: true }),
  L('tavernS16', 'rope', 'tavern', 's16', 2.55, { scenery: true }),
  L('yardS7', 'rope', 'yard', 's7', 4.49, { scenery: true, long: true }),
  L('tavernS3', 'rope', 'tavern', 's3', 4.26, { scenery: true, long: true }),
  L('gardenS13', 'rope', 'garden', 's13', 5.59, { scenery: true, long: true }),
  L('s13S14', 'rope', 's13', 's14', 6.99, { scenery: true, long: true }),
  L('s7S17', 'rope', 's7', 's17', 4.42, { scenery: true, long: true }),
  // five new rope bridges (<= 3 u of water)
  L('s8S14', 'rope', 's8', 's14', 2.0),
  L('towerS6', 'rope', 'tower', 's6', 1.8),
  L('s4S3', 'rope', 's4', 's3', 2.5),
  L('s2S7', 'rope', 's2', 's7', 2.7),
  L('yardS9', 'rope', 'yard', 's9', 2.2),
  // sixteen boardwalks (the stone steps counted as one)
  L('gardenS8', 'board', 'garden', 's8', 4.4),
  L('s14S15', 'board', 's14', 's15', 6.5),
  L('s15S16', 'board', 's15', 's16', 8.0, { name: 'Market Walk' }),
  L('s15S6', 'board', 's15', 's6', 6.0),
  L('s10S4', 'board', 's10', 's4', 4.9, { name: 'the High Walk' }),
  L('s3S12', 'board', 's3', 's12', 5.2, { name: 'the High Walk' }),
  L('s12S5', 'board', 's12', 's5', 5.4, { name: 'the High Walk' }),
  L('s5S11', 'board', 's5', 's11', 3.8, { name: 'the High Walk' }),
  L('s10Tower', 'board', 's10', 'tower', 6.3),
  L('s5S2', 'board', 's5', 's2', 3.8),
  L('s9S18', 'board', 's9', 's18', 6.3, { name: 'Lighthouse Walk' }),
  L('s17S18', 'board', 's17', 's18', 8.2),
  L('s7S11', 'board', 's7', 's11', 8.5, { name: 'Long Walk' }),
  L('s6Beach', 'board', 's6', 'beach', 4.3),
  L('s15Beach', 'board', 's15', 'beach', 7.4),
  L('s12Hill', 'steps', 's12', 'hill', 2.3),
]);

// Each plot's pad in its plot frame (see the header): measured (the ten SPEC3 plots), limit (the seven new shack
// plots: their buildings fit inside), islet (§4.1's sizes; 1N places them).
export const PADS = freeze({
  homeA: { platform: 's16', kind: 'measured', x0: -2.37, x1: 2.59, z0: -2.62, z1: 1.82, top: 7.32, strips: { left: 0.33, right: 0.11, back: -0.12, front: 0.68 }, mouths: [{ bridge: 'tavernS16', at: [1.97, 0.92], inPad: true }] },
  homeB: { platform: 's3', kind: 'measured', x0: -2.28, x1: 2.69, z0: -2.67, z1: 1.77, top: 7.32, strips: { left: 0.72, right: 0.31, back: 0.03, front: 0.93 }, mouths: [{ bridge: 'tavernS3', at: [-0.27, 2.18], inPad: false }] },
  homeC: { platform: 's2', kind: 'measured', x0: -2.53, x1: 2.44, z0: -2.62, z1: 1.82, top: 7.32, strips: { left: 0.17, right: 0.26, back: -0.12, front: 0.68 }, mouths: [{ bridge: 's1S2', at: [-1.94, 0.52], inPad: true }] },
  homeD: { platform: 's7', kind: 'measured', x0: -2.28, x1: 2.69, z0: -2.62, z1: 1.82, top: 7.32, strips: { left: 0.42, right: 0.01, back: -0.12, front: 0.68 }, mouths: [{ bridge: 'yardS7', at: [-1.22, 1.6], inPad: true }, { bridge: 's7S17', at: [2.42, 1.26], inPad: true }] },
  bakery: { platform: 's8', kind: 'measured', x0: -3.33, x1: 2.53, z0: -2.69, z1: 2.75, top: 5.52, strips: { left: -0.63, right: 0.17, back: -0.19, front: -0.25 }, mouths: [] },
  windmill: { platform: 's6', kind: 'measured', x0: -2.83, x1: 1.58, z0: -2.59, z1: 1.21, top: 5.9, strips: { left: -0.03, right: 1.22, back: 0.01, front: 1.39 }, mouths: [] },
  lighthouse: { platform: 's18', kind: 'measured', x0: -1.52, x1: 1.52, z0: -1.92, z1: 1.28, top: 10.33, strips: { left: 1.08, right: 1.08, back: 0.58, front: 1.22 }, mouths: [] },
  market: { platform: 's15', kind: 'measured', x0: -3, x1: 3, z0: -2.99, z1: 1.87, top: 7.59, strips: { left: -0.2, right: -0.2, back: -0.39, front: 0.73 }, mouths: [] },
  school: { platform: 's13', kind: 'measured', x0: -2.65, x1: 2.44, z0: -2.59, z1: 1.39, top: 6.77, strips: { left: 0.05, right: 0.26, back: -0.09, front: 1.11 }, mouths: [{ bridge: 'gardenS13', at: [1.87, -0.76], inPad: true }, { bridge: 's13S14', at: [-2.94, 0.07], inPad: false, onDeck: false, overEdge: 0.24 }] },
  park: { platform: 's14', kind: 'measured', x0: -2.53, x1: 2.75, z0: -2.75, z1: 1.7, top: 4.13, strips: { left: 0.07, right: -0.15, back: -0.25, front: 0.8 }, mouths: [{ bridge: 's13S14', at: [2.57, 0.3], inPad: true, edge: 0.03 }] },
  forge: { platform: 's4', kind: 'limit', x0: -1.2, x1: 1.2, z0: -2.1, z1: 0.9, porched: { front: ['front (board)'], right: ['s4S3'], left: ['s10S4'] }, porchExtension: true },
  music: { platform: 's5', kind: 'limit', x0: -2.8, x1: 1.6, z0: -1, z1: 1, porched: { front: ['front (board)', 's5S2'], back: ['s12S5'], right: ['s5S11'] }, porchExtension: true },
  fishing: { platform: 's9', kind: 'limit', x0: -0.9, x1: 2.1, z0: -0.9, z1: 0.9, porched: { front: ['front (board)'], left: ['yardS9'], back: ['s9S18'] }, porchExtension: true },
  farm: { platform: 's10', kind: 'limit', x0: -2.6, x1: 1.4, z0: -2.35, z1: 1.15, porched: { front: ['front (board)', 's10Tower'], right: ['s10S4'] }, porchExtension: false },
  museum: { platform: 's11', kind: 'limit', x0: -1.4, x1: 2.6, z0: -2.35, z1: 1.15, porched: { front: ['front (board)', 's7S11'], left: ['s5S11'] }, porchExtension: false },
  aquarium: { platform: 's12', kind: 'limit', x0: -3.1, x1: 3.1, z0: -1.15, z1: 1.15, porched: { front: ['front (board)', 's3S12', 's12S5'], back: ['s12Hill'] }, porchExtension: true },
  homeF: { platform: 's17', kind: 'limit', x0: -1.4, x1: 2.6, z0: -2.3, z1: 1.1, porched: { front: ['front (board)', 's17S18'], left: ['s7S17'] }, porchExtension: false },
  homeE: { platform: 'beach', kind: 'islet', w: 4.6, d: 4.6 },
  homeG: { platform: 'hill', kind: 'islet', w: 4.6, d: 4.2 },
  observatory: { platform: 'hill', kind: 'islet', w: 4.6, d: 4.6 },
  grotto: { platform: 'beach', kind: 'islet', w: 4.0, d: 3.6 },
});

export const PORCHES = freeze([]);
export const PLOT_PLACES = freeze([]);
export const SIGNPOSTS = freeze([]);
export const ARCHES = freeze([]);
export const LANDMARKS = freeze([]);
export const HOPS = freeze([]);
export const KEEP_OFF = freeze([]);

// §7.1: one loop per islander (ids `isl:<islander>`), in the order of §7.1's table; Stage 1 gives them their points
// and stations.
const ISLANDER_IDS = ['finn', 'marina', 'jib', 'nell', 'barnaby', 'wren', 'kip', 'moss', 'pearl', 'jack', 'lily', 'tom', 'ada', 'ida', 'bo', 'hettie', 'paz', 'dot', 'sid', 'quill', 'fern', 'ollie', 'stella', 'coral', 'pip', 'nerissa', 'kai', 'bun', 'mo', 'lars', 'tam', 'page', 'rosa'];
export const ISLANDER_PATHS = freeze(ISLANDER_IDS.map((who) => ({ id: `isl:${who}`, islander: who, kind: 'islander', pts: [], stations: [] })));

/** today's env.walk (base) with the plan's walk merged in, for v4 (§6.3). Stage 0: base's keys, nothing added. */
export function walkData4(base, plots4) {
  const b = base && typeof base === 'object' ? base : {};
  const list = (v) => (Array.isArray(v) ? [...v] : []);
  return {
    radius: b.radius,
    areas: list(b.areas),
    links: list(b.links),
    blockers: list(b.blockers),
    camBlockers: list(b.camBlockers),
    places: list(b.places),
    spawn: b.spawn,
    npcs: list(b.npcs),
    doors: list(b.doors),
    paths: list(b.paths),
    bridges: [],
    hops: [],
    districts: [],
  };
}

/** The district at (x, z), or null. Stage 0: null. */
export function districtAt(x, z) {
  return null;
}
