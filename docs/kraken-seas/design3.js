export const meta = {
  name: 'kraken-design',
  description: 'Design the next Pirates Ahoy! update (new levels and enemies, special ammo, steering, disasters, the Kraken, quizzes ashore, building up the island): 3 designs, 3 judges, one build spec',
  phases: [
    { title: 'Design', detail: 'three independent designs from different angles' },
    { title: 'Judge', detail: 'three judges score all three' },
    { title: 'Spec', detail: 'merge into SPEC3 with a staged, file-disjoint build plan' },
  ],
}

const ROOT = '/home/user/First-project'
const SP = '/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken'

const REQUEST = `The player's request (their words, from a phone; they play the published game at mimonhj.github.io):
"Also add more levels and more customisation: better steering, different type of ammo, meaning you can have the freezing effect-they slow down, the burning-taking damage for longer after hit, stink-it poisons enemy ships and they can't move or shoot for a while… Also add different types of enemy ships, more natural disasters, add kraken to last level, that is hunting you after you beat Kraken crews ship. Add quiz levels when you are a shore, also add the function to upgrade the island, add villagers, add houses, amenities…"`

const DEFAULTS = `Defaults the coordinator has chosen (the player can still change them; design to them unless you show a clearly better way, and say so):
- More levels = a third voyage, "Voyage III", of 3 new levels (7, 8, 9) after the Maelstrom; level 9 is the last level: first the Kraken Crew's flagship (a boss ship), and once she is beaten the Kraken itself rises and hunts the player until it is driven off or slain. Beating it wins the game.
- Special ammo (freezing: the target slows; burning: damage over time for longer after the hit; stink: poisoned ships can't move or shoot for a while) joins round/chain/grape. Special ammo must not make the game trivial: decide how it is earned/bought, limited and balanced (bosses resist), and how it reads on screen (ice, flames, green stink clouds, cartoon-clear).
- "Better steering" = something the player can buy/customise that makes the ship turn better (and consider whether the touch steering itself should improve; the player is on a phone).
- Quiz ashore: a family-friendly multiple-choice quiz place in the town, in "levels" of rising difficulty, rewarding gold/trophies/cosmetics; questions about the sea, sea life, geography of the game's places, pirate history and simple sums; English; a question bank that is easy to extend; no penalty that feels bad for a child.
- Building up the island: build plots on Sparrow's Floating Island where the player builds houses (villagers move in and walk about) and amenities (e.g. bakery, school, lighthouse, garden, market, windmill...), paid from the treasure chest, upgraded in tiers, each with a small gameplay perk; the island must stay readable and within the draw-call budget.
- Everything persists in localStorage like today's records (validated, never throws, storage blocked/full rules as today), works on phones (touch, portrait) and desktops (keyboard), and keeps the existing accessibility bar (keyboard, screen readers, contrast, reduced motion, photosensitivity).`

const CONTEXT = `The game: Pirates Ahoy!, a cartoon cel-shaded three.js r170 browser game in ${ROOT} (plain ES modules, no build step, vendored three.js, NO new dependencies, no network at runtime). READ: ${ROOT}/README.md (what the game is today), ${ROOT}/docs/boarders-away/SPEC2.md (the last update's spec: sections 0 conventions, 9 architecture and module APIs, 10 staged build plan, 11 tests, 12 performance budgets, 13 accessibility, 17 as-built decisions), and skim the code you design against: src/main.js (the game loop, damage(), fire(), HUD), src/combat.js, src/armory.js, src/cosmetics.js, src/upgrades.js, src/shipTypes.js, src/levels.js, src/act2.js, src/mechanics.js (Act II level mechanics), src/ships.js, src/people.js, src/boarding.js, src/env/*.js (one module per sea; sparrow.js is the island town), src/town.js, src/townMode.js, src/walk.js, and the tests (tests/*.cjs, run with npm test; ~1170 checks). Respect the draw-call budgets (§12), the deterministic simulation rules (§0), the test API window.__game, and the module boundaries.`

const DESIGN_OUT = `Write your design as a single Markdown file at the path given, 2500-5000 words, concrete enough to build from: exact numbers in tables (ammo effects and durations, prices, tiers, enemy stats, disaster timings, Kraken phases and hit points, quiz rewards, building costs and perks), what the player sees and hears (described like screenshots), controls on keyboard and touch, UI screens and their states, how it is saved, which modules it adds or changes (with their APIs), risks, and what to cut first if time runs short. Then return a short summary.`

const LENSES = [
  { key: 'arcade', who: 'a designer of bright, instantly readable arcade games for children and families', angle: 'Make every new thing obvious and delightful within seconds on a phone: big readable effects, short sessions, generous rewards, nothing confusing or frustrating; keep systems simple and the numbers few.' },
  { key: 'depth', who: 'a systems designer who loves replayable progression and meaningful choices', angle: 'Give the new ammo, steering, enemies, disasters, the island economy and the quizzes real interplay and choices (counters, synergies, trade-offs), a progression curve across all nine levels, and long-term goals, without bloat.' },
  { key: 'spectacle', who: 'an art-and-feel director for cartoon 3D games', angle: 'Make the Kraken hunt, the new seas and disasters, the special-ammo effects and the growing island memorable set-pieces that look great in the existing cel-shaded style and stay within the draw-call budgets; describe every visual and sound.' },
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
  { key: 'player', lens: 'a 9-year-old player and their parent playing on a phone: is it fun, clear, fair, exciting, and does it give them everything they asked for?' },
  { key: 'engineer', lens: 'the lead engineer of this codebase: can it be built well in staged, file-disjoint steps with tests, within the draw-call and performance budgets, without breaking what exists?' },
  { key: 'producer', lens: 'a game producer: scope, risk, balance, pacing across nine levels, and what to cut first.' },
]

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
const spec = await agent(`${CONTEXT}\n\n${REQUEST}\n\n${DEFAULTS}\n\nThree designs: ${SP}/design-arcade.md, ${SP}/design-depth.md, ${SP}/design-spectacle.md. Three judges' verdicts (data):\n${JSON.stringify(judged.filter(Boolean), null, 1)}\n\nWrite the FINAL build spec, ${SP}/SPEC3.md, in the same form and rigour as ${ROOT}/docs/boarders-away/SPEC2.md (read it closely and mirror its structure): section 0 conventions; scope; every system with exact numbers in ONE table each (special ammo, steering, new enemy types, disasters per level, the three Voyage III levels, the Kraken Crew's flagship and the Kraken hunt phases, quiz levels with the question-bank format and at least 60 starter questions across the topics and difficulties, island building plots/houses/villagers/amenities with costs, tiers and perks); UI and controls (keyboard + touch, phones in portrait); persistence (new records, validation, storage blocked/full, migration of existing saves so nobody loses progress); architecture with exact new/changed module APIs and the main.js integration points; a STAGED BUILD PLAN with disjoint file ownership per agent inside every stage (Stage 0 scaffolding with no behaviour change; Stage 1 foundations in parallel; Stage 2 integration; Stage 3 go-live, balance with a bot, polish, test suites; Stage 4 review/README), each row with its exit check; the test plan (new suites and the exact existing assertions that change); performance budgets; accessibility (incl. photosensitivity for lightning/ink/explosions and reduced motion for the Kraken); risks; a cut list. Base it on the judges' recommended base with their grafts, fix every must_fix item, and record in an appendix how the designs were merged. Then return a 300-word summary of the final design for the player.`,
  { label: 'spec writer', phase: 'Spec' })
return { designs, judged, spec }
