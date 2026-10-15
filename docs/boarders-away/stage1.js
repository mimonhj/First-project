export const meta = {
  name: 'boarders-stage1',
  description: 'Stage 1 of the Boarders Away! update: foundation modules built in parallel (main.js untouched)',
  phases: [{ title: 'Foundations', detail: 'one agent per module group, disjoint file ownership' }],
}

// args: { group: 'light' | 'heavy', stage0: string (stage 0 report) }
const SPEC2 = '/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/SPEC2.md'
const SP = '/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/stage1'
const GROUP = (args && args.group) || 'light'
const STAGE0 = (args && args.stage0) || '(no stage 0 report)'

const OUT = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files_changed: { type: 'array', items: { type: 'string' } },
    api_notes: { type: 'string', description: 'exact exports delivered; any deviation from SPEC2 and why' },
    hook_requests: { type: 'array', items: { type: 'string' }, description: 'changes needed in files you do not own: file, function, exact change' },
    verification: { type: 'string', description: 'commands run and exact results (Node test counts, draw calls, screenshots looked at). Never claim unrun checks.' },
    screenshots: { type: 'array', items: { type: 'string' } },
    open_issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'files_changed', 'api_notes', 'hook_requests', 'verification', 'screenshots', 'open_issues'],
}

const COMMON = (id) => `You are agent ${id} in Stage 1 of the "Boarders Away!" update for the browser game Pirates Ahoy! in /home/user/First-project (cartoon cel-shaded three.js game, plain ES modules, no build, three.js r170 vendored).
READ FIRST: ${SPEC2} section 0 (conventions), section 10 (Stage 1 rules and YOUR row "${id}"), section 9.1 (exact module APIs) and every section your files implement. Read the existing code your work touches. Stage 0 is done (report, data): ${STAGE0}
Rules (strict): edit ONLY the files your row owns (create only those listed); keep each owned file importable at all times (main.js imports several modules on every page load and other agents test concurrently): write new modules in one go or develop a copy under /home/user/First-project/.dock-harness/ and publish with an atomic mv; never edit vendor/, never add dependencies, never git commit/push/reset/stash/checkout. If you need a change in a file you do not own, put it in hook_requests (file, function, exact change). NOTE: another session added recorded music (src/audio.js RECORDED table, assets/audio/, tests/audio.cjs); keep it intact.
Quality bar: match the existing art (look at src/env/*.js, src/ships.js, src/people.js) and the existing code style. For anything visual, build a harness page in /home/user/First-project/.dock-harness/, render with the game's own renderer from src/scenery.js, screenshot with Playwright (chromium args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'], serve with require('/home/user/First-project/tests/server.cjs').serve(root), 120 s timeouts, NODE_PATH=/opt/node22/lib/node_modules), LOOK at the PNGs with the Read tool and iterate at least 3 critique rounds. Report draw calls for anything that renders. Meet your row's exit check exactly and report the real results. Scratch files go under ${SP}/${id}/.`

const AGENTS = {
  light: [
    { id: '1A Combat rules', extra: 'Implement src/combat.js and tests/combat.test.cjs per sections 2, 3, 3.8, 9.1, 11.1. Every worked example in 2.1 and 3.3 must be reproduced exactly by the tests.' },
    { id: '1B Economy', extra: 'Implement src/armory.js, src/cosmetics.js, tests/armory.test.cjs, tests/cosmetics.test.cjs per sections 4, 7.9, 8, 9.1, 11.1. Garbage-input batteries at least as thorough as tests/upgrades.test.cjs. Records must be validated like parseShipConfig and never throw.' },
    { id: '1J Act II rules', extra: 'Implement src/mechanics.js, src/act2.js, tests/mechanics.test.cjs per sections 6.1, 6.3-6.6, 9.1, 11.1. mechanics.js is pure and import-free; test with a mock ctx.' },
    { id: '1K Feedback', extra: 'Implement src/tags.js, src/pops.js, src/overboard.js and fx.css per sections 2.5, 5.4, 9.1. Harness with 6 fake ships at different distances: crew pips, surrender notch, ghost lag, icons, pops at 3 sizes and with prefers-reduced-motion. Draw-call budget: +1 per tag + 1 for all pips.' },
    { id: '1E Sound', extra: 'Implement the new SFX and scenes of section 9.1 in src/audio.js, additively (do not disturb the recorded-music code another session added). Offline renders (window __audioTest.renderOffline) must be finite, stereo and non-silent for every new name; the existing smoke audio checks and tests/audio.cjs must stay green (run node tests/audio.cjs at the end).' },
  ],
  heavy: [
    { id: '1C Characters', extra: 'Extend src/people.js per sections 7.10, 9.1: captain options, coats with tails, new hats (bicorne, plumed, crown, horned), beards and hair styles, parrot, tools (cutlass, tape, scissors), the 11 new actions, the shared-geometry cache. Existing seeded looks must stay identical: compare userData.look of seeds 1-400 before/after in a harness. Keep townsfolk detail:"low" builds working. Harness grid of looks x actions at 3 zooms.' },
    { id: '1D Shipwright', extra: 'Extend src/ships.js per sections 6.7, 9.1: the new ship models (galleon, raider, phantom), userData deck/yard/helm data, projectileMesh/addHole/clearHoles/setShipDamage/hoistFlag, helm spot, grapple coils by opts.armory.grapple. The existing player model and every existing ship must stay identical (fingerprint check like the earlier shipwright did) and the shipyard gun-port counting test must still find the cannons. Harness: each new ship at 3 angles, damage levels 0-2, mast drop, holes, white/player flags. NOTE: a previous attempt at this task was cut off by a usage limit. Before starting, look for its work in progress (your owned files in src/ and tests/, and harness/dev copies under /home/user/First-project/.dock-harness/ such as 1d/, sw/, 1f/, 1g/, 1h/, 1i/) and continue from it after verifying it, rather than starting over.' },
    { id: '1F Env: Doubloon Bay', extra: 'Replace the stub src/env/doubloon.js with the full level of section 6.4 (keep the module contract of the other env modules). Harness flight from the chase-camera height; env alone <= 220 draw calls; spawns >= 6, open water, >= 35 from the start, inside worldRadius - 16; gates within 125. NOTE: a previous attempt at this task was cut off by a usage limit. Before starting, look for its work in progress (your owned files in src/ and tests/, and harness/dev copies under /home/user/First-project/.dock-harness/ such as 1d/, sw/, 1f/, 1g/, 1h/, 1i/) and continue from it after verifying it, rather than starting over.' },
    { id: '1G Env: Frostbite Straits', extra: 'Replace the stub src/env/frost.js with the full level of section 6.5. Same checks as Doubloon Bay; ice floes deterministic in simTime and never entering colliders. NOTE: a previous attempt at this task was cut off by a usage limit. Before starting, look for its work in progress (your owned files in src/ and tests/, and harness/dev copies under /home/user/First-project/.dock-harness/ such as 1d/, sw/, 1f/, 1g/, 1h/, 1i/) and continue from it after verifying it, rather than starting over.' },
    { id: '1H Env: The Maelstrom', extra: 'Replace the stub src/env/maelstrom.js with the full level of section 6.6. Same checks as Doubloon Bay; flash() respects the photosensitivity caps of section 13. NOTE: a previous attempt at this task was cut off by a usage limit. Before starting, look for its work in progress (your owned files in src/ and tests/, and harness/dev copies under /home/user/First-project/.dock-harness/ such as 1d/, sw/, 1f/, 1g/, 1h/, 1i/) and continue from it after verifying it, rather than starting over.' },
    { id: '1I Town world', extra: 'Extend src/env/sparrow.js and create src/walk.js, tests/walk.test.cjs, tests/fixtures/sparrow-walk.json per sections 7.4, 7.5, 9.1: walk data, places and their new art (Polly\'s shop etc.), setCrewStyle, folk/greet/cull/setPrizes, ?walkdebug lines in a harness. Every place reachable from spawn; walk-view screenshots from 6 spots with no holes or open backs; dock draw calls <= 450 in the shipyard view; existing dock tests green. ALSO fix three residuals from the last shipyard review, in sparrow.js: (a) ART-1-R: with Extra cannons tier 1 + Heavy shot tier 2 the rowboat kid\'s painter (mooring) line runs straight through a gun barrel - route it clear of every barrel for all guns x shot tiers; (b) ART-2: the two deck moppers\' mops must be visible from the showcase camera for upgraded ships too (not only the stock ship), and never sweep through deck props; (c) ART-3: keep the "Welcome to Sparrow\'s Floating Island" sign readable for most of the camera sway even with tier-2 sails. Prove each with a raycast/geometry check across upgrade combos. NOTE: a previous attempt at this task was cut off by a usage limit. Before starting, look for its work in progress (your owned files in src/ and tests/, and harness/dev copies under /home/user/First-project/.dock-harness/ such as 1d/, sw/, 1f/, 1g/, 1h/, 1i/) and continue from it after verifying it, rather than starting over.' },
  ],
}

phase('Foundations')
const list = AGENTS[GROUP] || []
const results = await parallel(list.map((a) => () =>
  agent(`${COMMON(a.id)}\n\nYOUR TASK (${a.id}): ${a.extra}`, { label: a.id, phase: 'Foundations', schema: OUT })))
return { group: GROUP, results: results.map((r, i) => ({ id: list[i].id, result: r })) }
