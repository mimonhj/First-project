// The islanders of Sparrow's Floating Island (SPEC4 §7): 33 named islanders of many trades and ages (and Builder Bess's
// crew of three for the construction scene), the animals, their routines over an "ashore day" of 120 s (a pure
// function of the town clock, the islander's seed and islandPlan's layout), their lines (which teach Voyage IV's
// counters, with touch wording for a line that names a key), and the crowd director's pick of who is drawn: one hard
// cap, PEOPLE_DRAWN, on every full-detail person in the town walk view.
//
// Pure: imports nothing (the Node tests load it as a data: URL). Station and path coordinates live only in
// islandPlan.js, passed in as `layout` ({ ISLANDER_PATHS, PLOT_PLACES, DECKS }); the people are built and walked by
// env/folk4.js, the animals by critters.js.
//
// ISLANDERS (<= 40), ROUTINES, ANIMALS, LINES, PEOPLE_DRAWN, TALK, CULL4 (and DAY, PACE, CROWD, DANCE, PLOT_IDS);
// roster(island, island4, progress, layout) -> { people, animals, builders }, routinePose(id, t, layout) -> { x, y, z, h,
// action, moving, speed, station, k, dive } | null, linesFor(id, progress, touch) -> string[], plan(viewer, people,
// prev, t) -> Set<id>, movesIn(plot, tier) -> { people, animals } (names), danceAt(t, island4) -> 0..1, and for the
// layout's tests routineFit(id, layout) -> { walk, stations, tempo, sigma, length }.
//
// The layout's islander paths (islandPlan ISLANDER_PATHS, one a person, id `isl:<islander>`): { id, islander, kind:
// 'islander', loop: true, pts: [[x, y, z], …] (a closed loop along the decks' and boardwalks' centrelines; the last
// point may repeat the first), stations: [{ id, i (the vertex of pts it stands at), h? (the heading there) }, …] },
// the station ids being the ones the islander's ROUTINES entry names, in its order along the loop. A path entry of
// kind 'dance' holds the Music Hall's dance spots (its stations) on the plaza.

// ---------------------------------------------------------------------------------------- helpers

function freeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v);
  return Object.freeze(o);
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
function own(o, k) {
  try {
    return o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
  } catch {
    return undefined; // a throwing getter or a hostile proxy
  }
}
function list(v) {
  try {
    return Array.isArray(v) ? v : [];
  } catch {
    return []; // a revoked proxy
  }
}

// ---------------------------------------------------------------------------------------- the numbers

/** §7.1: the length of an "ashore day", the loop every routine runs through (s of the town's visual time). */
export const DAY = 120;
// §7.2: P0 + 2, where P0 = 39 is the people drawn today in the town walk view's worst view (the 401-call view at
// eedb108: 30 townsfolk, 7 villagers, Bess and Barnacle; Stage 0, docs/sunset-isles/stage0-report.md; §19 S0-D1).
export const PEOPLE_DRAWN = 41;
// §7.4: talk within 1.6 u, facing within ±60°, 2-3 lines, walking 3 u away ends it.
export const TALK = Object.freeze({ reach: 1.6, face: 60, lines: 3, end: 3 });
// §7.2: the walk view's townsfolk cull under v4 (today's 40 u tightens to 34 u).
export const CULL4 = 34;
/** §7.2: the crowd director's rings round the captain (u), the hysteresis of the far ring (u), the swaps it allows a
 *  step, and how often the town calls it (s). */
export const CROWD = Object.freeze({ near: 2, close: 6, hysteresis: 1.5, swaps: 1, every: 0.25 });
/** Ground speeds (u/s) of the routines' walks: walk, carry, run; 'idle' is a mer person gliding through the water. A
 *  routine's pace multiplies them (0.6: Grandpa Barnaby's slow walk), and so does the age: kids 0.95, old 0.8. */
export const PACE = Object.freeze({ walk: 0.9, carry: 0.7, run: 2.0, idle: 0.6 });
const AGE_PACE = { kid: 0.95, old: 0.8 };
// A loop too long for the day at its pace is walked at most this much briskly (folk4 quickens the stride to match)
// before its stations are cut short.
const BRISK = 1.3;
/** §4.1: with the Music Hall at tier 3 the villagers dance on the plaza for `dur` s every `every` s. */
export const DANCE = Object.freeze({ plot: 'music', tier: 3, every: 60, dur: 8 });
/** The plots of island.js: the ten of the SPEC3 record (pirates-ahoy-island) and the eleven of island4 (§4.1). */
export const PLOT_IDS = Object.freeze({
  island: Object.freeze(['homeA', 'homeB', 'homeC', 'homeD', 'bakery', 'windmill', 'lighthouse', 'market', 'school', 'park']),
  island4: Object.freeze(['homeE', 'homeF', 'homeG', 'forge', 'fishing', 'farm', 'music', 'museum', 'observatory', 'aquarium', 'grotto']),
});

// ---------------------------------------------------------------------------------------- who lives here (§7.1)

// Colours of the looks (people.js takes plain hex integers).
const RED = 0xe2383d;
const YELLOW = 0xf2c230;
const BLUE = 0x2f6fd0;
const NAVY = 0x2c3e7a;
const TEAL = 0x1f9e9a;
const GREY = 0xb8b8b8;
const DARK = 0x3b3442;
const BROWN = 0x6b4528;
const PLUM = 0x8a5bd6;
const ORANGE = 0xff7a1a;
const GREEN = 0x27b35a;

// A row: id, name (the prompt's "Talk to …"), plot and tier (the building they come with: a home's villagers live
// there, an amenity's people work there; before it stands nobody lives in it), role 'home' | 'work' | 'builder', trade,
// look (people.js options: share: true, detail: 'low', a fixed seed; every 'kid' and 'old' names `girl`), react (how
// they greet the captain: an ACTIONS pose, and a mode word folk4 may show: 'face', 'salute', 'slow', 'knitting',
// 'circle', 'tipCap', 'nod', 'band', 'bow', 'water'), path (islandPlan's ISLANDER_PATHS id; builders have none) and
// mer (a mer person: only idles, sits, waves and cheers).
let SEED = 7000;
const P = (id, name, plot, tier, role, trade, look, react, extra = {}) => ({
  id,
  name,
  plot,
  tier,
  role,
  trade,
  look: { ...look, seed: (SEED += 13), share: true, detail: 'low' },
  react,
  path: role === 'builder' ? null : `isl:${id}`,
  mer: look.tail === true,
  ...extra,
});
const wave = { action: 'wave' };
const cheer = { action: 'cheer' };
// (§7.2's light build keeps each under 4,000 triangles: Finn without his seed's glasses, Paz bare-headed and Quill
// clean-shaven, none of them in §7.1's looks; Quill's bicorne, glasses and tape still leave him at 4,210)
export const ISLANDERS = freeze([
  P('finn', 'Finn', 'fishing', 1, 'work', 'fisherman', { kind: 'old', girl: false, hat: 'souwester', shirt: YELLOW, stripes: false, beard: 'full', glasses: false, tool: 'rod' }, { action: 'wave', mode: 'face' }),
  P('marina', 'Marina', 'fishing', 2, 'work', 'fishwife', { kind: 'woman', hat: 'kerchief', shirt: BLUE, stripes: true, shirt2: 0xffffff, tool: 'basket' }, wave),
  P('jib', 'Bosun Jib', 'homeF', 1, 'home', 'sailor', { kind: 'pirate', hat: 'none', beard: 'braids', hair: GREY, stripes: true, shirt: NAVY }, { action: 'wave', mode: 'salute' }),
  P('nell', 'Nell', 'homeF', 1, 'home', 'sailor', { kind: 'woman', hat: 'kerchief', accent: TEAL }, wave),
  P('barnaby', 'Grandpa Barnaby', 'homeF', 2, 'home', 'grandparent', { kind: 'old', girl: false, glasses: true, hat: 'cap', beard: 'full' }, { action: 'wave', mode: 'slow' }),
  P('wren', 'Granny Wren', 'homeE', 1, 'home', 'grandparent', { kind: 'old', girl: true, coat: PLUM, coatTrim: 0xf3e6f0, glasses: true }, { action: 'wave', mode: 'knitting' }),
  P('kip', 'Kip', 'homeE', 1, 'home', 'kid', { kind: 'kid', girl: false, hat: 'cap', stripes: true, shirt: ORANGE }, { action: 'cheer', mode: 'circle' }),
  P('moss', 'Moss', 'homeE', 2, 'home', 'kid', { kind: 'kid', girl: true, hat: 'cap', stripes: true, shirt: GREEN }, { action: 'cheer', mode: 'circle' }),
  P('pearl', 'Granny Pearl', 'homeG', 1, 'home', 'grandparent', { kind: 'old', girl: true, glasses: true }, wave),
  P('jack', 'Grandpa Jack', 'homeG', 1, 'home', 'grandparent', { kind: 'old', girl: false, hat: 'cap', beard: 'full' }, { action: 'wave', mode: 'tipCap' }),
  P('lily', 'Lily', 'homeG', 2, 'home', 'kid', { kind: 'kid', girl: true, hat: 'straw' }, cheer),
  P('tom', 'Tom', 'homeG', 2, 'home', 'kid', { kind: 'kid', girl: false, hat: 'bandana' }, cheer),
  P('ada', 'Ada', 'forge', 1, 'work', 'blacksmith', { kind: 'woman', hat: 'bandana', hatColor: RED, vest: DARK, apron: true, tool: 'hammer' }, { action: 'proud', mode: 'nod' }),
  P('ida', 'Ida', 'forge', 2, 'work', 'apprentice', { kind: 'kid', girl: true, apron: true, tool: 'bucket' }, wave),
  P('bo', 'Farmer Bo', 'farm', 1, 'work', 'farmer', { kind: 'man', hat: 'straw', vest: BROWN, tool: 'bucket' }, wave),
  P('hettie', 'Hettie', 'farm', 2, 'work', 'farmer', { kind: 'woman', hat: 'straw', tool: 'basket' }, wave),
  P('paz', 'Piper Paz', 'music', 1, 'work', 'musician', { kind: 'pirate', hat: 'none', tool: 'fiddle' }, { action: 'fiddle', mode: 'band' }),
  P('dot', 'Drummer Dot', 'music', 2, 'work', 'musician', { kind: 'woman', tool: 'drum' }, { action: 'hammer', mode: 'band' }),
  P('sid', 'Squeezebox Sid', 'music', 3, 'work', 'musician', { kind: 'old', girl: false, tool: 'squeezebox' }, { action: 'fiddle', mode: 'band' }),
  P('quill', 'Curator Quill', 'museum', 1, 'work', 'curator', { kind: 'old', girl: false, glasses: true, hat: 'bicorne', beard: 'none', tool: 'tape' }, { action: 'proud', mode: 'bow' }),
  P('fern', 'Fern', 'museum', 3, 'work', 'tourist', { kind: 'woman', hat: 'straw' }, wave),
  P('ollie', 'Ollie', 'museum', 3, 'work', 'tourist', { kind: 'kid', girl: false }, wave),
  P('stella', 'Stella', 'observatory', 1, 'work', 'stargazer', { kind: 'old', girl: true, hat: 'startop', tool: 'spyglass' }, wave),
  P('coral', 'Coral', 'aquarium', 1, 'work', 'aquarist', { kind: 'woman', shirt: TEAL, tool: 'bucket' }, wave),
  P('pip', 'Pip', 'aquarium', 3, 'work', 'visiting kid', { kind: 'kid', girl: true, hat: 'cap' }, cheer),
  P('nerissa', 'Nerissa', 'grotto', 1, 'work', 'mermaid', { kind: 'woman', tail: true, hat: 'none' }, { action: 'wave', mode: 'water' }),
  P('kai', 'Kai', 'grotto', 1, 'work', 'merman', { kind: 'man', tail: true, hat: 'none' }, { action: 'wave', mode: 'water' }),
  P('bun', 'Bun', 'bakery', 1, 'work', 'baker', { kind: 'woman', hat: 'toque', apron: true }, wave),
  P('mo', 'Mo', 'windmill', 1, 'work', 'miller', { kind: 'man', hat: 'cap' }, wave),
  P('lars', 'Lars', 'lighthouse', 1, 'work', 'lighthouse keeper', { kind: 'old', girl: false, tool: 'lantern' }, wave),
  P('tam', 'Tam', 'market', 1, 'work', 'trader', { kind: 'woman', tool: 'crate' }, wave),
  P('page', 'Miss Page', 'school', 1, 'work', 'teacher', { kind: 'woman', glasses: true, tool: 'book' }, wave),
  P('rosa', 'Rosa', 'park', 1, 'work', 'gardener', { kind: 'woman', hat: 'straw', tool: 'bucket' }, wave),
  // Builder Bess's crew: only in the construction scene (§5), built at dock open with the islanders
  P('chip', 'Chip', null, 0, 'builder', 'carpenter', { kind: 'man', hat: 'cap', tool: 'hammer' }, cheer),
  P('mortar', 'Mortar', null, 0, 'builder', 'mason', { kind: 'old', girl: false, tool: 'crate' }, cheer),
  P('dab', 'Dab', null, 0, 'builder', 'apprentice', { kind: 'kid', girl: true, apron: true, tool: 'bucket' }, cheer),
]);
const BY_ID = new Map(ISLANDERS.map((p) => [p.id, p]));

// ---------------------------------------------------------------------------------------- routines (§7.1, §7.3)

// A routine: pace (× PACE) and its steps, a station then a walk, round the loop: S(station id, …acts) with each act
// [action, seconds] or [action, seconds, { dive: true }] (a mer person sinks below the water, visual), then W(the walk's
// action: 'walk' | 'carry' | 'run', 'idle' for merfolk) to the next station, the last walk back to the first. Over a
// day the walks take what their length needs at their pace, and the stations share the rest of the 120 s (each
// station's first act gets the extra).
const S = (station, ...acts) => ({ station, acts });
const W = (walk) => ({ walk });
const R = (pace, ...steps) => ({ pace, steps });
const musician = (play) => R(1, S('stage', [play, 30], ['proud', 4]), W('walk'), S('tavern', ['idle', 15]), W('walk'));
const mer = () => R(1, S('rock', ['sit', 30], ['wave', 6], ['idle', 3, { dive: true }]), W('idle'), S('pool', ['wave', 6]), W('idle'));
export const ROUTINES = freeze({
  finn: R(1, S('pierEnd', ['fish', 30]), W('carry'), S('market', ['idle', 6]), W('walk'), S('bench', ['sit', 15]), W('walk')),
  marina: R(1, S('pier', ['fish', 25]), W('walk'), S('stall', ['idle', 20]), W('walk')),
  jib: R(1, S('mooring', ['haul', 15]), W('walk'), S('tavernRail', ['lean', 20]), W('walk')),
  nell: R(1, S('mooring', ['haul', 15]), W('walk'), S('tavernRail', ['lean', 20]), W('walk')),
  barnaby: R(0.6, S('bench', ['sit', 40]), W('walk'), S('pier', ['idle', 8]), W('walk')),
  wren: R(1, S('porch', ['sit', 50]), W('walk'), S('shore', ['idle', 6]), W('walk')),
  kip: R(1, S('swing', ['sit', 20]), W('run'), S('hide', ['point', 8]), W('run')),
  moss: R(1, S('swing', ['sit', 20]), W('run'), S('hide', ['point', 8]), W('run')),
  pearl: R(0.6, S('bench', ['sit', 40]), W('walk'), S('whiskers', ['idle', 10]), W('walk')),
  jack: R(0.6, S('bench', ['sit', 40]), W('walk'), S('view', ['idle', 10]), W('walk')),
  lily: R(1, S('steps', ['point', 15]), W('run'), S('foot', ['idle', 4]), W('walk')),
  tom: R(1, S('steps', ['point', 15]), W('run'), S('foot', ['idle', 4]), W('walk')),
  ada: R(1, S('anvil', ['hammer', 20]), W('carry'), S('trough', ['idle', 4]), W('walk'), S('grindstone', ['scrub', 12]), W('walk')),
  ida: R(1, S('bellows', ['haul', 15]), W('carry'), S('coal', ['idle', 5]), W('carry')),
  bo: R(1, S('hay', ['idle', 6]), W('carry'), S('pen', ['idle', 5]), W('run'), S('fence', ['sit', 20]), W('walk')),
  hettie: R(1, S('orchard', ['idle', 10]), W('carry'), S('stall', ['idle', 20]), W('walk')),
  paz: musician('fiddle'),
  dot: musician('hammer'),
  sid: musician('fiddle'),
  quill: R(1, S('cases', ['measure', 20]), W('walk'), S('steps', ['point', 10]), W('walk')),
  fern: R(1, S('porch', ['point', 10], ['wave', 4]), W('walk'), S('corner', ['point', 8]), W('walk')),
  ollie: R(1, S('porch', ['point', 10], ['wave', 4]), W('walk'), S('corner', ['point', 8]), W('walk')),
  stella: R(1, S('scope', ['point', 20]), W('walk'), S('ring', ['measure', 12]), W('walk')),
  coral: R(1, S('pail', ['idle', 4]), W('carry'), S('tanks', ['wave', 6]), W('walk'), S('glass', ['scrub', 15]), W('walk')),
  pip: R(1, S('glass', ['idle', 20]), W('run'), S('corner', ['idle', 4]), W('run')),
  nerissa: mer(),
  kai: mer(),
  bun: R(1, S('oven', ['scrub', 20]), W('walk'), S('porch', ['wave', 5]), W('walk')),
  mo: R(1, S('mill', ['haul', 20]), W('walk'), S('porch', ['wave', 5]), W('walk')),
  lars: R(1, S('lamp', ['idle', 20]), W('walk'), S('porch', ['point', 6]), W('walk')),
  tam: R(1, S('stall', ['idle', 15]), W('carry'), S('store', ['idle', 5]), W('carry')),
  page: R(1, S('desk', ['measure', 20]), W('walk'), S('porch', ['wave', 5]), W('walk')),
  rosa: R(1, S('beds', ['scrub', 15]), W('carry'), S('pump', ['idle', 5]), W('walk')),
});

// ---------------------------------------------------------------------------------------- lines (§7.1, §7.4)

// Each islander's lines, the hello first. A line is a string, or { text, touch (the wording on a touch screen when
// the text names a key), teaches (the Voyage IV kind whose counter it teaches), from (shown once level n is open),
// kraken / shell (once the Kraken / the Shellback has been driven off), captures (after n captures) }. Every line is
// ≤ 70 characters (it fits a 320 px bubble).
const T = (kind, from, text, extra = {}) => ({ text, teaches: kind, from, ...extra });
export const LINES = freeze({
  finn: ["Biting today, Cap'n!", "I've caught every fish in this bay. Twice!", T('puffer', 11, 'Puffers ate my bait! Pop them from far away.')],
  marina: ['Two fish for a doubloon!', 'Fresh from the sea this morning, Captain.', { text: 'Coral currents give you free speed.', from: 11 }],
  jib: ['Fair winds, Captain!', 'Tie a good knot and your boat stays put.', T('stinger', 10, 'A Sting Sloop hides behind you. Turn!')],
  nell: ['Ahoy there, Captain!', 'Our houseboat rocks us to sleep every night.', T('witch', 11, 'The Coral Witch calls puffers. Sink her first!')],
  barnaby: ['In my day the Kraken was THIS big!', 'Sit a while, young Captain. Mind the gulls.', { text: 'You drove off the Kraken? Well, I never!', kraken: true }],
  wren: ['Hello, dearie! Mind your step.', "I'm knitting a scarf for every pirate in town.", T('jolly', 10, 'Mind the coconuts, dearie! Grape tips those monkeys over.')],
  kip: ['Are you a REAL captain?', "Tag! You're it! Bet you can't catch me!", T('coilback', 11, 'We saw a sea serpent! It gets dizzy!')],
  moss: ['Want to play hide-and-seek?', 'I can swing higher than the palm trees!', T('coilback', 11, "Bonk the sea serpent's head while it's dizzy!")],
  pearl: ['What a view from up here!', 'Whiskers caught a crab today. Then it caught her!', T('shellback', 12, "The Shellback? It's just a big crab, dear. Knock its towers down!")],
  jack: ['Lovely day for a sail, Captain!', 'I built this bench myself. It only wobbles a bit.', T('shellback', 12, "Knock down the Shellback's towers first!"), { text: 'You sent the Shellback to bed! Bravo!', shell: true }],
  lily: ['Race you to the top!', 'From the hill you can see the whole island!'],
  tom: ['Bet I can roll my hoop faster than you!', 'Grandpa says the sea goes on for ever.'],
  ada: ['Mind the sparks, Captain!', 'I can mend anything made of iron.', T('netsloop', 10, 'Netted? Hold G and cut it! My knives cut faster.', { touch: 'Netted? Hold CUT! My knives cut faster.' })],
  ida: ["I'm making horseshoes for seahorses!", 'Puff, puff! The bellows make the fire roar.', T('netsloop', 10, 'Steer out of the white nets, Captain!')],
  bo: ['Meet Nibbles. She eats EVERYTHING.', 'Goats love to climb. Even on the barn roof!'],
  hettie: ["Goat's cheese, Captain?", 'Apples from the orchard, fresh and crunchy!'],
  paz: ["♪ Heave ho, the Kraken's gone! ♪", 'Clap along, Captain! One, two, three!'],
  dot: ['Boom, boom! Want a turn on my drum?', "♪ Heave ho, the Kraken's gone! ♪"],
  sid: ["♪ Heave ho, the Kraken's gone! ♪", 'My squeezebox is older than the lighthouse!'],
  quill: ["Capture a ship and I'll make a model of it!", 'Every ship in a bottle has a story.', { text: 'Your captured ships look grand in their bottles!', captures: 1 }],
  fern: ['Look, a real captain!', 'We came all this way to see the Grand Gallery!'],
  ollie: ['Look, a real captain!', "Is that your ship? It's the best one!"],
  stella: ["Fog can't hide from my spyglass!", 'Look up tonight: the stars point the way home.'],
  coral: ['Welcome to the Aquarium, Captain!', "Say hello to the turtles. They're shy!", T('coilback', 11, "Hit old Coilback's head while it's dizzy!")],
  pip: ['The puffers here are friendly!', 'A fish kissed my nose through the glass!', T('puffer', 11, 'Wild puffers pop! Hit them from far away.')],
  nerissa: ['The sea is singing today!', 'We merfolk can hold our breath for an hour!', T('coilback', 11, 'Mind old Coilback! Steer out of its green lane.')],
  kai: ['Ahoy from the water, Captain!', "Pearls grow in the grotto. Shh, it's a secret!", T('coilback', 11, 'Mind old Coilback in the Spires! Hit its dizzy head!')],
  bun: ['Fresh biscuits today!', "Ship's biscuits keep your crew strong, Captain!"],
  mo: ['Puffs of powder, Captain!', 'The windmill grinds the powder for your shots.'],
  lars: ['My light is on for you.', 'My lighthouse gives you extra warning time.', T('fort', 12, "A Rock Fort's red line? Change course, quick!")],
  tam: ['Bargains! Get your bargains here!', 'Gold for the chest every time you win, Captain!'],
  page: ['Good morning, Captain! Ready for a riddle?', 'The Riddle Bell is my favourite bell.'],
  rosa: ['Smell the flowers, Captain!', 'Happy villagers give bigger gifts!'],
  chip: ["Let's build!", 'Measure twice, hammer once!'],
  mortar: ["Let's build!", 'Stone by stone, Captain!'],
  dab: ["Let's build!", 'Which colour shall I paint it?'],
});

// ---------------------------------------------------------------------------------------- animals (§7.1)

// Each species: at most `max` out, its pet word and sound (audio.js SFX; turtles are silent), and who it is: name,
// the building that brings it (plot, tier), or `v4` (out with the Sunset Isles), or `shell` (after the Shellback);
// `at`: where it lives (`plot:<id>` its building's porch, or a spot islandPlan may name in ANIMAL_SPOTS: tavernRoof,
// harbour, palms, beach, pier, pen, hill, barnRoof, pool, grotto); follow: the islander it trots after.
const A = (id, name, cond, at, extra = {}) => ({ id, name, ...cond, at, follow: null, ...extra });
export const ANIMALS = freeze({
  cat: { max: 4, word: 'Purr…', sound: 'purr', moves: ['nap', 'stretch', 'follow'], list: [
    A('sardine', 'Sardine', { plot: 'fishing', tier: 1 }, 'plot:fishing', { colour: 'ginger', follow: 'finn' }),
    A('pickles', 'Pickles', { plot: 'fishing', tier: 3 }, 'pier', { colour: 'black' }),
    A('whiskers', 'Whiskers', { plot: 'homeG', tier: 1 }, 'plot:homeG', { colour: 'calico' }),
    A('mittens', 'Mittens', { v4: true }, 'tavernRoof', { colour: 'ginger' }),
  ] },
  dog: { max: 3, word: 'Woof!', sound: 'woof', moves: ['trot', 'sit', 'chase'], list: [
    A('salty', 'Salty', { plot: 'homeF', tier: 1 }, 'plot:homeF', { follow: 'jib' }),
    A('bolt', 'Bolt', { plot: 'forge', tier: 1 }, 'plot:forge', { follow: 'ada' }),
    A('biscuit', 'Biscuit', { v4: true }, 'harbour'),
  ] },
  goat: { max: 6, word: 'Meeeh!', sound: 'meh', moves: ['graze', 'climb'], list: [
    A('nibbles', 'Nibbles', { plot: 'farm', tier: 1 }, 'pen'),
    A('clover', 'Clover', { plot: 'farm', tier: 1 }, 'pen'),
    A('pepper', 'Pepper', { plot: 'farm', tier: 2 }, 'barnRoof'),
    A('daisy', 'Daisy', { plot: 'farm', tier: 2 }, 'hill'),
    A('buttons', 'Buttons', { plot: 'farm', tier: 3 }, 'hill'),
    A('tansy', 'Tansy', { plot: 'farm', tier: 3 }, 'hill'),
  ] },
  bird: { max: 5, word: 'Pieces of eight!', sound: 'squawk', moves: ['perch', 'hop', 'fly'], list: [
    A('polly', 'Captain Polly', { plot: 'museum', tier: 1 }, 'plot:museum', { bird: 'parrot' }),
    A('hoot', 'Hoot', { plot: 'observatory', tier: 1 }, 'plot:observatory', { bird: 'owl', word: 'Hoo!', sound: 'hoot' }),
    A('ruby', 'Ruby', { v4: true }, 'tavernRoof', { bird: 'parrot' }),
    A('sky', 'Sky', { v4: true }, 'tavernRoof', { bird: 'parrot' }),
    A('mango', 'Mango', { v4: true }, 'tavernRoof', { bird: 'parrot' }),
  ] },
  monkey: { max: 3, word: 'Hee-hee!', sound: 'giggle', moves: ['swing', 'peel'], list: [
    A('coco', 'Coco', { plot: 'homeE', tier: 1 }, 'plot:homeE'),
    A('nutmeg', 'Nutmeg', { plot: 'homeE', tier: 3 }, 'plot:homeE'),
    A('banana', 'Banana', { v4: true }, 'palms'),
  ] },
  crab: { max: 7, word: 'Click-click!', sound: 'click', moves: ['scuttle', 'dig'], list: [
    A('crab1', 'Pinchy', { v4: true }, 'beach'),
    A('crab2', 'Snappy', { v4: true }, 'beach'),
    A('crab3', 'Sandy', { v4: true }, 'beach'),
    A('crab4', 'Rocky', { v4: true }, 'pier'),
    A('crab5', 'Nipper', { v4: true }, 'pier'),
    A('crab6', 'Clicky', { v4: true }, 'pier'),
    A('hermit', 'Baby hermit crab', { shell: true }, 'beach'),
  ] },
  turtle: { max: 4, word: 'Blink…', sound: null, moves: ['crawl'], list: [
    A('shelly', 'Shelly', { plot: 'aquarium', tier: 1 }, 'pool'),
    A('dozy', 'Dozy', { plot: 'aquarium', tier: 2 }, 'pool'),
    A('myrtle', 'Myrtle', { plot: 'grotto', tier: 2 }, 'grotto'),
    A('tuck', 'Tuck', { plot: 'grotto', tier: 2 }, 'grotto'),
  ] },
});

// ---------------------------------------------------------------------------------------- reading the saves

// A plot's tier in a record (an island or island4 record object, or its stored text): a plain integer 0..3, else 0.
function tierIn(rec, id) {
  let r = rec;
  if (typeof r === 'string') {
    if (r.length > 4096) return 0;
    try {
      r = JSON.parse(r);
    } catch {
      return 0;
    }
  }
  const v = own(own(r, 't'), id);
  return typeof v === 'number' && Number.isInteger(v) ? clamp(v, 0, 3) : 0;
}
const tierOfPlot = (island, island4, id) => (PLOT_IDS.island4.includes(id) ? tierIn(island4, id) : PLOT_IDS.island.includes(id) ? tierIn(island, id) : 0);

// progress: { unlocked (the highest level open), captures (feats.captures), kraken (feats.kraken), shell (feats.shell) }.
function readProgress(progress) {
  const num = (v, lo, d) => (fin(v) ? Math.max(lo, Math.floor(v)) : d);
  return {
    unlocked: num(own(progress, 'unlocked'), 1, 1),
    captures: num(own(progress, 'captures'), 0, 0),
    kraken: num(own(progress, 'kraken'), 0, 0),
    shell: num(own(progress, 'shell'), 0, 0),
  };
}

/** Who moves in when `plot` reaches `tier` (§5.2's last caption): their names, people first, then animals. */
export function movesIn(plot, tier) {
  const t = fin(tier) ? Math.floor(tier) : 0;
  const people = ISLANDERS.filter((p) => p.role !== 'builder' && p.plot === plot && p.tier === t).map((p) => p.name);
  const animals = [];
  for (const sp of Object.values(ANIMALS)) for (const a of sp.list) if (a.plot === plot && a.tier === t) animals.push(a.name);
  return { people, animals };
}

const copyLook = (look) => ({ ...look });
function spotOf(layout, at) {
  const spots = own(layout, 'ANIMAL_SPOTS');
  const s = own(spots, at);
  if (s && fin(own(s, 'x')) && fin(own(s, 'z'))) return { x: s.x, y: fin(own(s, 'y')) ? s.y : null, z: s.z };
  if (typeof at === 'string' && at.startsWith('plot:')) {
    for (const p of list(own(layout, 'PLOT_PLACES'))) if (own(p, 'id') === at && fin(own(p, 'x')) && fin(own(p, 'z'))) return { x: p.x, y: null, z: p.z };
  }
  return { x: null, y: null, z: null };
}

/**
 * Who lives on the island now (§7.1), from the buildings standing: island (the SPEC3 record), island4 (the new
 * plots' record), progress ({ unlocked, captures, kraken, shell }) and layout (islandPlan's exports, for where the
 * animals live). { people: the islanders whose building stands at their tier or higher, in ISLANDERS order: { id, name,
 * plot, tier, role, trade, look (a fresh copy), react, path, mer }, animals: [{ id, species, name, at, follow, x, y, z,
 * word, sound, … }] (x / y / z null when the layout doesn't place `at`), builders: Bess's crew (always) }. Junk reads
 * as nothing built. Called with v4 only (the tavern's and harbour's animals are the Sunset Isles').
 */
export function roster(island, island4, progress, layout) {
  const g = readProgress(progress);
  const people = [];
  const builders = [];
  for (const p of ISLANDERS) {
    const row = { id: p.id, name: p.name, plot: p.plot, tier: p.tier, role: p.role, trade: p.trade, look: copyLook(p.look), react: { ...p.react }, path: p.path, mer: p.mer };
    if (p.role === 'builder') builders.push(row);
    else if (tierOfPlot(island, island4, p.plot) >= p.tier) people.push(row);
  }
  const animals = [];
  for (const [species, sp] of Object.entries(ANIMALS)) {
    let n = 0;
    for (const a of sp.list) {
      const out = a.v4 === true || (a.shell === true ? g.shell >= 1 : a.plot ? tierOfPlot(island, island4, a.plot) >= a.tier : false);
      if (!out || n >= sp.max) continue;
      n++;
      animals.push({ id: a.id, species, name: a.name, at: a.at, follow: a.follow, word: a.word || sp.word, sound: a.sound !== undefined ? a.sound : sp.sound, ...(a.colour ? { colour: a.colour } : {}), ...(a.bird ? { bird: a.bird } : {}), ...spotOf(layout, a.at) });
    }
  }
  return { people, animals, builders };
}

/** The Music Hall's plaza dance (§4.1): 0 while nobody dances, else 0..1..0 over its `dur` s every `every` s, once the
 *  Music Hall stands at tier 3 (island4: the new plots' record; t: the town's visual time). */
export function danceAt(t, island4) {
  if (tierIn(island4, DANCE.plot) < DANCE.tier || !fin(t)) return 0;
  const u = ((t % DANCE.every) + DANCE.every) % DANCE.every;
  if (u >= DANCE.dur) return 0;
  return Math.sin((u / DANCE.dur) * Math.PI);
}

// ---------------------------------------------------------------------------------------- routinePose (§7.3)

// A point of a path: [x, y, z], [x, z] or { x, y?, z }.
function pt(q) {
  if (Array.isArray(q)) {
    if (q.length >= 3 && fin(q[0]) && fin(q[2])) return { x: q[0], y: fin(q[1]) ? q[1] : null, z: q[2] };
    if (q.length === 2 && fin(q[0]) && fin(q[1])) return { x: q[0], y: null, z: q[1] };
    return null;
  }
  const x = own(q, 'x');
  const z = own(q, 'z');
  if (!fin(x) || !fin(z)) return null;
  const y = own(q, 'y');
  return { x, y: fin(y) ? y : null, z };
}

// The deck height under (x, z) from layout.DECKS (rects { x, z, w, d, ry?, y } or circles { x, z, r, y }), else 1.3.
function deckY(layout, x, z) {
  for (const d of list(own(layout, 'DECKS'))) {
    const y = own(d, 'y');
    if (!fin(y)) continue;
    const dx = x - own(d, 'x');
    const dz = z - own(d, 'z');
    if (fin(own(d, 'r'))) {
      if (Math.hypot(dx, dz) <= d.r) return y;
    } else if (fin(own(d, 'w')) && fin(own(d, 'd'))) {
      const ry = fin(own(d, 'ry')) ? d.ry : 0;
      const c = Math.cos(ry);
      const s = Math.sin(ry);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (Math.abs(lx) <= d.w / 2 && Math.abs(lz) <= d.d / 2) return y;
    }
  }
  return 1.3;
}

// The geometry of an islander's path, cached per path object and islander (islandPlan's paths are frozen): the
// closed loop, its arc lengths, and each routine station's arc position and heading.
const GEO = new WeakMap();
function geometry(id, path, routine) {
  let byId;
  try {
    byId = GEO.get(path);
    if (byId && byId.has(id)) return byId.get(id);
  } catch {
    return null;
  }
  const raw = list(own(path, 'pts')).map(pt).filter(Boolean);
  if (!raw.length) return null;
  const pts = raw.slice();
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (pts.length > 1 && Math.hypot(a.x - b.x, a.z - b.z) > 1e-6) pts.push({ ...a });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const L = cum[cum.length - 1];
  const want = routine.steps.filter((s) => s.station).map((s) => s.station);
  const given = list(own(path, 'stations'));
  const stations = want.map((sid, k) => {
    let st = given.find((g) => own(g, 'id') === sid);
    if (!st) st = given[k];
    const i = own(st, 'i');
    let s = fin(i) && i >= 0 && i < pts.length ? cum[Math.floor(i)] : (L * k) / want.length;
    if (!fin(i) && st) {
      // a station given as a point: its nearest place on the loop
      const q = pt(own(st, 'at')) || pt(st);
      if (q) s = nearestS(pts, cum, q);
    }
    const h = own(st, 'h');
    return { id: sid, s, h: fin(h) ? h : null };
  });
  const geo = { pts, cum, L, stations };
  try {
    if (!byId) GEO.set(path, (byId = new Map()));
    byId.set(id, geo);
  } catch {
    // an exotic object still works, uncached
  }
  return geo;
}
function nearestS(pts, cum, q) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = pts[i].x;
    const az = pts[i].z;
    const dx = pts[i + 1].x - ax;
    const dz = pts[i + 1].z - az;
    const L2 = dx * dx + dz * dz || 1;
    const u = clamp(((q.x - ax) * dx + (q.z - az) * dz) / L2, 0, 1);
    const d = Math.hypot(q.x - ax - dx * u, q.z - az - dz * u);
    if (d < bd) {
      bd = d;
      best = cum[i] + u * Math.sqrt(L2);
    }
  }
  return best;
}
// The point and heading at arc s of the loop (s wraps).
function at(geo, s) {
  const { pts, cum, L } = geo;
  if (L <= 0 || pts.length < 2) return { x: pts[0].x, y: pts[0].y, z: pts[0].z, h: null };
  const ss = ((s % L) + L) % L;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < ss) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const k = clamp((ss - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]), 0, 1);
  const y = a.y !== null && b.y !== null ? a.y + (b.y - a.y) * k : a.y !== null ? a.y : b.y;
  const h = Math.hypot(b.x - a.x, b.z - a.z) > 1e-9 ? Math.atan2(b.x - a.x, b.z - a.z) : null;
  return { x: a.x + (b.x - a.x) * k, y, z: a.z + (b.z - a.z) * k, h };
}
// The islander's day: each station's acts (stretched) and each walk's length, time and speed, from the geometry.
const DAYS = new WeakMap();
function dayOf(id, geo, routine) {
  if (DAYS.has(geo)) return DAYS.get(geo);
  const p = BY_ID.get(id);
  const kind = p ? p.look.kind : 'man';
  const age = AGE_PACE[kind] || 1;
  const n = geo.stations.length;
  const legs = [];
  let walkT = 0;
  let durT = 0;
  for (let k = 0; k < n; k++) {
    const step = routine.steps[routine.steps.findIndex((s) => s.station === geo.stations[k].id) + 1];
    const action = step && step.walk ? step.walk : null;
    const from = geo.stations[k].s;
    let len = 0;
    if (action) {
      const to = geo.stations[(k + 1) % n].s;
      len = n === 1 ? geo.L : (((to - from) % geo.L) + geo.L) % geo.L;
      if (!fin(len)) len = 0;
    }
    const v = action ? (PACE[action] || PACE.walk) * routine.pace * age : 0;
    const time = len > 0 && v > 0 ? len / v : 0;
    legs.push({ action, len, v, time });
    walkT += time;
  }
  const acts = geo.stations.map((st) => {
    const s = routine.steps.find((x) => x.station === st.id);
    return s.acts.map(([action, dur, opts]) => ({ action, dur, dive: !!(opts && opts.dive) }));
  });
  for (const a of acts) for (const x of a) durT += x.dur;
  // fit the day: stretch the stations (sigma ≥ 1); a loop too long for that first walks briskly (tempo up to
  // BRISK), and only a loop longer still squeezes the stations (down to half) and hurries on
  let tempo = 1;
  let sigma = 1;
  if (durT + walkT <= DAY) sigma = durT > 0 ? (DAY - walkT) / durT : 1;
  else if (DAY - durT > 0 && walkT / (DAY - durT) <= BRISK) tempo = walkT / (DAY - durT);
  else {
    tempo = BRISK;
    sigma = durT > 0 ? Math.max(0.5, (DAY - walkT / BRISK) / durT) : 1;
    tempo = Math.max(BRISK, walkT / Math.max(1e-6, DAY - durT * sigma));
  }
  const plan = [];
  let t = 0;
  for (let k = 0; k < n; k++) {
    const total = acts[k].reduce((m, x) => m + x.dur, 0);
    const extra = total * (sigma - 1);
    acts[k].forEach((x, j) => {
      const d = Math.max(0, x.dur + (j === 0 ? extra : 0));
      plan.push({ kind: 'act', k, t0: t, t1: t + d, ...x });
      t += d;
    });
    const leg = legs[k];
    if (leg.time > 0) {
      const d = leg.time / tempo;
      plan.push({ kind: 'walk', k, t0: t, t1: t + d, action: leg.action, from: geo.stations[k].s, len: leg.len, v: leg.v * tempo });
      t += d;
    }
  }
  const day = { plan, length: t, tempo, sigma, walkT, durT };
  DAYS.set(geo, day);
  return day;
}
function pathOf(id, layout) {
  for (const p of list(own(layout, 'ISLANDER_PATHS'))) if (own(p, 'islander') === id || own(p, 'id') === `isl:${id}`) return p;
  return null;
}

/**
 * Where islander `id` is at town time t (s; the town's visual time, or folk4's per-islander clock when it holds one
 * back while LOOK-2 makes them wait), and what they do (§7.3), on its loop in layout.ISLANDER_PATHS: { x, y, z, h (the
 * heading: rotation.y = atan2(dx, dz)), action (a people.js action), moving (walking, not at a station), speed (u/s
 * while moving: the stride tempo is speed / walkSpeed), station (the station's id while there, else null), k (0..1
 * through the current act or walk), dive (0..1: a mer person's sink below the water) }. A pure function of t, the
 * islander's seed and the layout; the day is DAY s long. null for an unknown islander, a builder, or a layout without
 * the islander's path.
 */
export function routinePose(id, t, layout) {
  try {
    const p = BY_ID.get(id);
    const routine = ROUTINES[id];
    if (!p || !routine) return null;
    const path = pathOf(id, layout);
    if (!path) return null;
    const geo = geometry(id, path, routine);
    if (!geo) return null;
    const day = dayOf(id, geo, routine);
    const phase = ((p.look.seed * 0.6180339887) % 1) * DAY; // each islander starts the day somewhere of its own
    const tt = fin(t) ? t : 0;
    const u = (((tt + phase) % DAY) + DAY) % DAY;
    const span = day.length > 0 ? day.length : DAY;
    const w = (u / DAY) * span;
    let step = day.plan[day.plan.length - 1];
    for (const q of day.plan) {
      if (w < q.t1) {
        step = q;
        break;
      }
    }
    if (!step) {
      const q = at(geo, 0);
      return { x: q.x, y: q.y ?? deckY(layout, q.x, q.z), z: q.z, h: q.h ?? 0, action: 'idle', moving: false, speed: 0, station: null, k: 0, dive: 0 };
    }
    const k = clamp((w - step.t0) / Math.max(1e-9, step.t1 - step.t0), 0, 1);
    if (step.kind === 'walk') {
      const q = at(geo, step.from + step.len * k);
      return { x: q.x, y: q.y ?? deckY(layout, q.x, q.z), z: q.z, h: q.h ?? 0, action: step.action, moving: true, speed: step.v, station: null, k, dive: 0 };
    }
    const st = geo.stations[step.k];
    const q = at(geo, st.s);
    // facing: the station's own heading, else the way the walk in arrived
    const back = at(geo, st.s - 0.05);
    const h = st.h ?? back.h ?? q.h ?? 0;
    const dive = step.dive ? clamp(2.2 * Math.sin(k * Math.PI), 0, 1) : 0;
    return { x: q.x, y: q.y ?? deckY(layout, q.x, q.z), z: q.z, h, action: step.action, moving: false, speed: 0, station: st.id, k, dive };
  } catch {
    return null;
  }
}

/** How a routine's day fits on its loop (for the layout's tests): { walk: s at the natural pace, stations: s as
 *  written, tempo (1: the walks keep their pace; up to 1.3 a brisk walk; more: the loop is too long for the day),
 *  sigma (the stations' stretch: ≥ 1 when they last at least as written), length (u) } | null. */
export function routineFit(id, layout) {
  try {
    const routine = ROUTINES[id];
    const path = routine && pathOf(id, layout);
    const geo = path && geometry(id, path, routine);
    if (!geo) return null;
    const day = dayOf(id, geo, routine);
    return { walk: day.walkT, stations: day.durT, tempo: day.tempo, sigma: day.sigma, length: geo.L };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------- linesFor (§7.4)

const lineOk = (l, g) =>
  (l.from === undefined || g.unlocked >= l.from) && (!l.kraken || g.kraken >= 1) && (!l.shell || g.shell >= 1) && (l.captures === undefined || g.captures >= l.captures);
// The newest news first: the Shellback, then the Kraken, then the latest level's counters, captures, then the rest.
const lineRank = (l) => (l.shell ? 300 : 0) + (l.kraken ? 200 : 0) + (l.from || 0) + (l.captures ? 1 : 0);

/**
 * What islander `id` says when the captain talks to them (§7.4): their hello, then up to TALK.lines − 1 more of the
 * lines their progress has reached, the newest news first (progress: { unlocked, captures, kraken, shell }; junk is a
 * fresh save); touch: a touch screen (a line that names a key gives its touch wording). [] for an unknown islander.
 */
export function linesFor(id, progress, touch) {
  const L = typeof id === 'string' && Object.prototype.hasOwnProperty.call(LINES, id) ? LINES[id] : null;
  if (!L || !L.length) return [];
  const g = readProgress(progress);
  const norm = (l) => (typeof l === 'string' ? { text: l } : l);
  const [hello, ...rest] = L.map(norm);
  const avail = rest.map((l, i) => ({ l, i })).filter(({ l }) => lineOk(l, g));
  avail.sort((a, b) => lineRank(b.l) - lineRank(a.l) || a.i - b.i);
  const say = (l) => (touch === true && l.touch ? l.touch : l.text);
  return [hello, ...avail.map((x) => x.l)].slice(0, TALK.lines).map(say);
}

// ---------------------------------------------------------------------------------------- plan: the crowd director (§7.2)

function readViewer(v) {
  const lens = own(v, 'lens');
  const cap = own(v, 'captain');
  const lx = fin(own(v, 'x')) ? v.x : fin(own(lens, 'x')) ? lens.x : null;
  const lz = fin(own(v, 'z')) ? v.z : fin(own(lens, 'z')) ? lens.z : null;
  let cx = fin(own(v, 'cx')) ? v.cx : fin(own(cap, 'x')) ? cap.x : null;
  let cz = fin(own(v, 'cz')) ? v.cz : fin(own(cap, 'z')) ? cap.z : null;
  if (cx === null || cz === null) {
    cx = lx;
    cz = lz;
  }
  if (cx === null || cz === null) return null;
  const x = lx === null ? cx : lx;
  const z = lz === null ? cz : lz;
  const r = own(v, 'radius');
  const c = own(v, 'cap');
  const chat = own(v, 'chat');
  const fl = Math.hypot(cx - x, cz - z);
  return {
    x,
    z,
    cx,
    cz,
    fx: fl > 1e-6 ? (cx - x) / fl : 0,
    fz: fl > 1e-6 ? (cz - z) / fl : 0,
    radius: fin(r) && r > 0 ? Math.min(r, CULL4) : CULL4,
    cap: fin(c) && c >= 0 ? Math.min(Math.floor(c), PEOPLE_DRAWN) : PEOPLE_DRAWN,
    chat: typeof chat === 'string' || typeof chat === 'number' ? chat : null,
  };
}
function readPrev(prev) {
  const out = new Set();
  try {
    if (prev instanceof Set) for (const id of prev) out.add(id);
    else for (const id of list(prev)) out.add(id);
  } catch {
    // junk: nobody was drawn
  }
  return out;
}

/**
 * The crowd director (§7.2): who is drawn this step, never more than PEOPLE_DRAWN (viewer.cap may lower it: the drop
 * order's step (2)). viewer: { x, z (the lens), cx, cz (the captain; or lens: { x, z }, captain: { x, z }), chat (the
 * id he is talking to), radius (the cull radius, clamped to CULL4), cap }; people: [{ id, x, z, pin? }] (everyone who
 * may be drawn in the walk view: townsfolk, villagers, islanders, NPCs, builders, merfolk; pin: drawn like the chat
 * partner); prev: the last answer (a Set or an array of ids). In this order, until the cap: (1) the chat partner and
 * the pinned; (2) everyone within 2 u of the captain, nearest first; (3) everyone within 6 u, nearest first; (4) the
 * nearest in front of the camera within the cull radius of the lens, with 1.5 u of hysteresis for those drawn last
 * step and at most one swap a step (free places fill at once). The town calls it every CROWD.every s; t is that
 * moment (unused: the answer depends on the positions and prev only). A fresh Set every call.
 */
export function plan(viewer, people, prev, t) {
  const out = new Set();
  const v = readViewer(viewer);
  if (!v) return out;
  const was = readPrev(prev);
  const seen = new Set();
  const crowd = [];
  for (const p of list(people)) {
    const id = own(p, 'id');
    const x = own(p, 'x');
    const z = own(p, 'z');
    if ((typeof id !== 'string' && typeof id !== 'number') || seen.has(id) || !fin(x) || !fin(z)) continue;
    seen.add(id);
    const dc = Math.hypot(x - v.cx, z - v.cz);
    const dl = Math.hypot(x - v.x, z - v.z);
    const front = (x - v.x) * v.fx + (z - v.z) * v.fz >= 0;
    crowd.push({ id, dc, dl, front, pin: own(p, 'pin') === true, was: was.has(id) });
  }
  const byDc = (a, b) => a.dc - b.dc || (String(a.id) < String(b.id) ? -1 : 1);
  const take = (p) => {
    if (out.size < v.cap) out.add(p.id);
  };
  // (1) the chat partner, then the pinned
  for (const p of crowd) if (p.id === v.chat) take(p);
  for (const p of crowd.filter((q) => q.pin).sort(byDc)) take(p);
  // (2) within 2 u, (3) within 6 u: nearest first
  for (const p of crowd.filter((q) => q.dc <= CROWD.near).sort(byDc)) take(p);
  for (const p of crowd.filter((q) => q.dc <= CROWD.close).sort(byDc)) take(p);
  // (4) the nearest in front within the cull radius (1.5 u more, and 1.5 u nearer, for whoever was drawn)
  const room = v.cap - out.size;
  if (room <= 0) return out;
  const H = CROWD.hysteresis;
  const score = (p) => p.dl - (p.was ? H : 0);
  const cand = crowd.filter((p) => !out.has(p.id) && p.front && p.dl <= v.radius + (p.was ? H : 0));
  cand.sort((a, b) => score(a) - score(b) || (String(a.id) < String(b.id) ? -1 : 1));
  const keep = cand.filter((p) => p.was).slice(0, room); // the cap wins over the hysteresis
  const fresh = cand.filter((p) => !p.was);
  const sel = keep.slice();
  while (sel.length < room && fresh.length) sel.push(fresh.shift());
  for (let s = 0; s < CROWD.swaps && fresh.length && keep.length && sel.length >= room; s++) {
    const olds = sel.filter((p) => p.was);
    if (!olds.length) break;
    const worst = olds.reduce((w, p) => (score(p) > score(w) ? p : w));
    if (score(fresh[0]) < score(worst)) {
      sel.splice(sel.indexOf(worst), 1, fresh.shift());
      keep.splice(keep.indexOf(worst), 1);
    } else break;
  }
  for (const p of sel) out.add(p.id);
  return out;
}
