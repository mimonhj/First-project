export const meta = {
  name: 'voyage4-design',
  description: 'Design the next Pirates Ahoy! update (more levels with varied enemies, more houses with a visible build, the whole island walkable, varied inhabitants): 3 designs, 3 judges, a build spec, a skeptic check',
  phases: [
    { title: 'Design', detail: 'three independent designs from different angles' },
    { title: 'Judge', detail: 'three judges score all three' },
    { title: 'Spec', detail: 'merge into SPEC4 with a staged, file-disjoint build plan' },
    { title: 'Check', detail: 'a skeptical engineer checks SPEC4 against the code; an editor fixes it' },
  ],
}

const ROOT = '/home/user/First-project'
const SP = '/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/v4'
const SPEC = `${SP}/SPEC4.md`

const REQUEST = `The player's request (their words; a child plays the published game on an iPhone held upright at mimonhj.github.io/First-project):
"Add more levels with wider variance in enemies and more houses to be build in town, when building them show me the house being build and also make the whole island accessible and make the island with different types of habitants"`

const DEFAULTS = `Defaults the coordinator has chosen (design to them unless you show a clearly better way, and say so):
- MORE LEVELS = a fourth voyage, "Voyage IV", of 3 new levels (10, 11, 12) after the Kraken's Deep, each in a new sea with its own look, hazards and music; it opens once level 9 is won (old saves that already won level 9 get level 10, nobody loses anything). Level 12 is the new finale with a memorable boss. Levels 1-9 stay exactly as they are (their balance and tests hold).
- WIDER VARIANCE IN ENEMIES = at least 6 new enemy kinds whose BEHAVIOURS differ (not stat variants of existing ships): e.g. different movement (fast flankers, kiters, swarms, ships that hide/submerge/teleport), different attacks (ramming, boarding, nets, fire, area denial, summoning), at least two that are not ships (sea creatures). New levels mix them in varied waves drawn from a pool so no two runs feel the same (seeded from the level start, so tests stay deterministic), and each new kind is introduced readably (a name banner, a telegraph, a counter the child can learn). Respect SPEC3's kid rules (every threat telegraphed >= 1.5 s, nothing permanent lost).
- MORE HOUSES = at least 8 new buildable buildings on Sparrow's Floating Island (homes in different styles and new amenities, e.g. fishing hut, blacksmith, treehouse, library, observatory, aquarium, farm, music stand, museum of trophies...), each with tiers, costs from the treasure chest, a small perk or delight, and a place in the island's growth/rank; on new plots in newly opened parts of the island where needed.
- SHOW ME THE HOUSE BEING BUILT = a construction scene the child watches when they build or upgrade: the camera frames the plot, builders (villagers) arrive, and the house goes up in visible stages (e.g. foundation, frame, walls, roof, finishing touches) with hammering, sawdust, scaffolding and workers, about 6-10 s, skippable with one tap/key, a reduced-motion version, then the new inhabitants move in. Today there is a short 'montage' with a scaffold pop (townMode.js / sparrow.js): replace or extend it.
- MAKE THE WHOLE ISLAND ACCESSIBLE = the captain can walk to every part of the island he can see (every deck, platform, beach, hill, garden, pier and the new districts), connected by walkways, stairs, ramps or bridges; no visible-but-unreachable areas; never walled in (today's walking rules and tests: walk.js, sparrow.js walkData areas/links/blockers, tests/walk.test.cjs, the rope-bridge and walking-bug checks in tests/town.cjs and tests/ashore.cjs).
- DIFFERENT TYPES OF INHABITANTS = varied islanders: people of different trades and ages (fisherfolk, bakers, a blacksmith, children, grandparents, merchants, musicians, sailors...) and animals (cats, dogs, parrots, goats, monkeys, crabs, turtles...), maybe sea folk by the shore; each building brings its own inhabitants; they have little routines (walk to work, fish, play, sit, sell) and react to the captain (wave, speech bubbles, a short chat); distinct looks built with people.js; capped for performance.
- Everything new sits behind a flag (like SPEC3's WITH_KRAKEN in src/voyage.js) until go-live; persistence is validated, never throws, and keeps the storage rule (record first, then the chest); migration so nobody loses progress; phones (portrait, touch) and desktops (keyboard) both work; the accessibility bar (keyboard, screen readers, contrast >= 4.5:1, 44 px targets, reduced motion, flashes <= 1 Hz) and the draw-call budgets (the town walk view <= 450 calls; battles per SPEC3 section 14) hold.`

const CONTEXT = `The game: Pirates Ahoy!, a cartoon cel-shaded three.js r170 browser game in ${ROOT} (plain ES modules, no build step, vendored three.js, NO new dependencies, no network at runtime). It just shipped the "Kraken Seas" update. READ: ${ROOT}/README.md (what the game is today), ${ROOT}/docs/kraken-seas/SPEC3.md (the last update's spec: section 0 conventions and kid rules, 11 architecture and module APIs, 12 staged build plan, 13 tests, 14 performance budgets, 15 accessibility, 19 the build record of what was actually built), ${ROOT}/docs/kraken-seas/stage3-reports.md and stage4-review.md (what exists and its known open issues), and the code you design against: src/main.js (game loop, waves, enemy AI, damage, HUD), src/voyage.js, src/levels.js, src/act2.js, src/act3.js, src/shipTypes.js, src/mechanics.js, src/mechanics3.js, src/kraken.js, src/ships.js, src/people.js, src/specials.js, src/combat.js, src/env/*.js (one module per sea; sparrow.js is the island town, about 6,700 lines, with walkData areas/links/blockers/places), src/walk.js, src/town.js, src/townMode.js, src/island.js (PLOTS, tiers, perks, villagers, ranks), src/buildPanel.js, src/quiz.js, src/audio.js, and the tests (tests/*.cjs; npm test = 21 suites, about 2,300 checks, slow SwiftShader browser suites). Respect the draw-call budgets, the deterministic simulation rules, the test API window.__game, the module boundaries, and the kid rules.`

const DESIGN_OUT = `Write your design as a single Markdown file at the path given, 3000-6000 words, concrete enough to build from: exact numbers in tables (each new level's waves and hazards, each new enemy kind's stats, behaviour, telegraph and counter, each new building's costs, tiers, perks and inhabitants, the construction scene's stages and timings, the island's new walkable layout, the inhabitant kinds with their looks, routines and lines), what the player sees and hears (described like screenshots), controls on keyboard and touch, UI screens and their states, how it is saved and migrated, which modules it adds or changes (with their APIs), performance (draw calls: how many islanders and buildings fit the town budget, instancing/merging), risks, and what to cut first if time runs short. Then return a short summary.`

const LENSES = [
  { key: 'arcade', who: 'a designer of bright, instantly readable games for children and families', angle: 'Make every new enemy obvious and fun to beat within seconds on a phone, the building scene a joy to watch, the island a delightful place to explore with charming inhabitants; keep systems simple and the numbers few.' },
  { key: 'depth', who: 'a systems designer who loves variety, replayability and meaningful choices', angle: 'Give the new enemies real tactical variety (counters, combinations, wave pools), the new buildings and inhabitants real interplay with the economy and the battles (perks, routines, small quests), and a progression across all twelve levels, without bloat.' },
  { key: 'spectacle', who: 'an art-and-feel director for cartoon 3D games', angle: 'Make the new seas, the new enemies (including sea creatures), the construction scene and the bigger, fully walkable island memorable set-pieces in the existing cel-shaded style, within the draw-call budgets; describe every visual and sound, and how the island stays readable from the walk camera.' },
]

const SCORE = {
  type: 'object',
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          design: { type: 'string', enum: ['arcade', 'depth', 'spectacle'] },
          fun: { type: 'integer', minimum: 1, maximum: 10 },
          fits_request: { type: 'integer', minimum: 1, maximum: 10, description: 'covers every item of the player request well' },
          clarity_for_kids: { type: 'integer', minimum: 1, maximum: 10 },
          buildability: { type: 'integer', minimum: 1, maximum: 10, description: 'fits the codebase, budgets, tests; staged build risk' },
          strengths: { type: 'array', items: { type: 'string' } },
          weaknesses: { type: 'array', items: { type: 'string' } },
        },
        required: ['design', 'fun', 'fits_request', 'clarity_for_kids', 'buildability', 'strengths', 'weaknesses'],
      },
    },
    recommend_base: { type: 'string', enum: ['arcade', 'depth', 'spectacle'] },
    grafts: { type: 'array', items: { type: 'string' }, description: 'specific ideas to take from the other designs into the base' },
    must_fix: { type: 'array', items: { type: 'string' }, description: 'problems any final spec must avoid' },
  },
  required: ['scores', 'recommend_base', 'grafts', 'must_fix'],
}

const JUDGES = [
  { key: 'player', lens: 'a 9-year-old player and their parent playing on a phone: is it fun, clear, fair, exciting, and does it give them everything they asked for (more levels, much more varied enemies, more houses, watching the house being built, the whole island walkable, different kinds of inhabitants)?' },
  { key: 'engineer', lens: 'the lead engineer of this codebase: can it be built well in staged, file-disjoint steps with tests, within the draw-call and performance budgets (especially the town with more buildings and inhabitants, and sparrow.js/walk.js changes for the whole island), without breaking what exists?' },
  { key: 'producer', lens: 'a game producer: scope, risk, balance, pacing across twelve levels, and what to cut first.' },
]

const ISSUES = {
  type: 'object',
  properties: {
    issues: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, section: { type: 'string' },
      problem: { type: 'string' }, evidence: { type: 'string', description: 'quotes from the spec and/or the code, or arithmetic' }, fix: { type: 'string' },
    }, required: ['id', 'severity', 'section', 'problem', 'evidence', 'fix'] } },
    checked: { type: 'string' },
  },
  required: ['issues', 'checked'],
}

phase('Design')
const designs = await parallel(LENSES.map((L) => () =>
  agent(`${CONTEXT}\n\n${REQUEST}\n\n${DEFAULTS}\n\nYou are ${L.who}. ${L.angle}\nRead-only: never edit files in the repo; never git commit/push.\n${DESIGN_OUT}\nYour file: ${SP}/design-${L.key}.md`,
    { label: `design:${L.key}`, phase: 'Design' })))
log(`designs written: ${designs.filter(Boolean).length} of 3`)

phase('Judge')
const judged = await parallel(JUDGES.map((J) => () =>
  agent(`${CONTEXT}\n\n${REQUEST}\n\n${DEFAULTS}\n\nThree designers wrote competing designs for this update: ${SP}/design-arcade.md, ${SP}/design-depth.md, ${SP}/design-spectacle.md. Read all three in full (and enough of the code to judge them). Judge them as ${J.lens} Score each design, recommend which one to use as the base, list the specific ideas worth grafting from the others, and the problems the final spec must avoid. Read-only: never edit files; never git commit/push.`,
    { label: `judge:${J.key}`, phase: 'Judge', schema: SCORE })))

phase('Spec')
const spec = await agent(`${CONTEXT}\n\n${REQUEST}\n\n${DEFAULTS}\n\nThree designs: ${SP}/design-arcade.md, ${SP}/design-depth.md, ${SP}/design-spectacle.md. Three judges' verdicts (data):\n${JSON.stringify(judged.filter(Boolean), null, 1)}\n\nWrite the FINAL build spec, ${SPEC}, in the same form and rigour as ${ROOT}/docs/kraken-seas/SPEC3.md (read it closely and mirror its structure and conventions, including its section 0 kid rules and storage rule, its single-source number tables, its staged build plan with disjoint file ownership and exit checks per row, its test plan listing the exact existing assertions that change, its performance and accessibility sections, its cut list, its defaults section and an empty build record section 19). Cover: scope; Voyage IV's three levels (seas, hazards, music, waves drawn from pools, the finale boss); every new enemy kind in ONE table (behaviour, stats, telegraph, counter, model and draw calls) and how each is introduced; the new buildings in ONE table (plot, costs, tiers, perks, inhabitants) plus the island's growth/ranks; the construction scene (stages, timings, camera, builders, sound, skip, reduced motion, what tests can drive); the whole-island walkable layout (new districts, connections, walkData changes, the never-walled-in and reachability guarantees and how they are tested); the inhabitant kinds in ONE table (look via people.js, routines, lines, reactions, caps) and how they keep the town within its draw-call budget; UI and controls (keyboard + touch, portrait phones); persistence (new/changed records, validation, migration so nobody loses progress); architecture (exact new/changed module APIs and the main.js integration points; a feature flag until go-live); the STAGED BUILD PLAN (Stage 0 scaffolding with no behaviour change; Stage 1 foundations in parallel; Stage 2 integration in rounds; Stage 3 go-live, balance with a bot, polish, test suites; Stage 4 review/README) with disjoint file ownership inside every stage and an exit check per row (note: sparrow.js, main.js and townMode.js are large shared files: plan their ownership carefully, e.g. one owner per stage or new modules that they call); the test plan; performance budgets; accessibility; risks; a cut list; and an appendix on how the designs were merged. Base it on the judges' recommended base with their grafts, and fix every must_fix item. Then return a 300-word summary of the final design for the player.`,
  { label: 'spec writer', phase: 'Spec' })

phase('Check')
const c = await agent(`You are a skeptical lead engineer reviewing a build spec BEFORE 20+ agents build from it: ${SPEC} (the next update of the browser game Pirates Ahoy! in ${ROOT}; the previous update's spec ${ROOT}/docs/kraken-seas/SPEC3.md and its build record (section 19) show the house style and what was built). ${REQUEST}\nRead SPEC4 in full and the code it integrates with (src/main.js, voyage.js, levels.js, act3.js, shipTypes.js, mechanics3.js, ships.js, people.js, island.js, env/sparrow.js, walk.js, town.js, townMode.js, buildPanel.js, audio.js, tests/*.cjs, package.json). Find what would make the build fail or the game wrong: arithmetic that doesn't add up (prices, totals, gold, hit points, timings, draw calls), the same number defined in two places, a file owned by two agents in the same stage, an agent needing a file it doesn't own with no hook path, APIs used by one section and defined differently in another, existing code facts the spec gets wrong (function/field names, test files, current behaviour), Stage 0 'no behaviour change' items that would change behaviour, exit checks that cannot pass, existing test assertions that would change without being listed, gaps (an item of the player's request not fully specified: more levels, wider enemy variance, more houses, watching the house being built, the whole island walkable, different kinds of inhabitants), performance risks (the town walk view's 450-call budget with more buildings and islanders), and anything unsafe or frustrating for a child on a phone. Read-only: never edit files.`, { label: 'spec critic', phase: 'Check', schema: ISSUES })
const e = await agent(`You are the spec editor. Fix ${SPEC} for every issue below that you confirm (re-check each against the spec and the code in ${ROOT}; skip any you can refute, saying why). Keep the spec's structure; fix numbers at their single source table and everywhere they are quoted; add a short "Spec check (pre-build)" list to section 19 naming each issue id and what changed. Edit ONLY ${SPEC}. Return the list of changes and a final 300-word plain-language summary of the update for the player.\nIssues (data):\n${JSON.stringify(c, null, 1)}`, { label: 'spec editor', phase: 'Check' })
return { designs, judged, spec, check: c, edit: e }
