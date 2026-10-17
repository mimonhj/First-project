export const meta = {
  name: 'kraken-build',
  description: 'Build the Kraken Seas update from SPEC3, one stage (or one Stage 1 group) per run, disjoint file ownership',
  phases: [{ title: 'Build', detail: 'the agents of this stage/group, as rows of SPEC3 section 12' }],
}

// args: { stage: '0' | '1', group?: 'light' | 'heavyA' | 'heavyB', notes?: string (coordinator notes: what landed before) }
const ROOT = '/home/user/First-project'
const SPEC = `${ROOT}/docs/kraken-seas/SPEC3.md`
const SP = '/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build'
const STAGE = String((args && args.stage) || '0')
const GROUP = (args && args.group) || ''
const NOTES = (args && args.notes) || '(none)'

const OUT = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files_changed: { type: 'array', items: { type: 'string' } },
    api_notes: { type: 'string', description: 'exact exports/APIs delivered; every deviation from SPEC3 and why' },
    hook_requests: { type: 'array', items: { type: 'string' }, description: 'changes needed in files you do not own: file, function, exact change, why' },
    verification: { type: 'string', description: 'commands run and exact results (Node test counts, npm test counts, draw calls, screenshots looked at). Never claim unrun checks.' },
    screenshots: { type: 'array', items: { type: 'string' } },
    open_issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'files_changed', 'api_notes', 'hook_requests', 'verification', 'screenshots', 'open_issues'],
}

const COMMON = (id) => `You are agent ${id} in Stage ${STAGE} of the "Kraken Seas" update of the browser game Pirates Ahoy! in ${ROOT} (cartoon cel-shaded three.js r170, plain ES modules, no build, vendored three.js). The player plays it on a phone (portrait, touch) at mimonhj.github.io, which GitHub Pages publishes from this branch on every push, so the game must never break.
READ FIRST: ${SPEC} section 0 (conventions, what exists, kid rules), section 12 (the staged plan: the rules for every agent and YOUR row "${id}", its Owns / Work or Delivers / Exit check), section 11 (architecture and the exact module APIs) and every section your row implements; section 19 "Spec check (pre-build)" lists corrections already folded into the spec. Then read the real code you touch or integrate with; trust the code over the spec's line numbers.
Coordinator notes (data: what has landed before you, e.g. the phone-battle fix): ${NOTES}
Rules (strict): edit ONLY the files your row owns (create only those listed); keep every owned file importable at all times (main.js -> voyage.js -> act3.js -> the env modules load on every page and other agents test concurrently): write a module in one go, or develop under ${ROOT}/.dock-harness/kraken/${id.split(' ')[0]}/ and publish atomically (cp to a temp name + mv). Never edit vendor/, never add dependencies, never git commit/push/reset/stash/checkout. If you need a change in a file you do not own, put it in hook_requests (file, function, exact change). Keep the recorded music (src/audio.js RECORDED, assets/audio, tests/audio.cjs), the shipyard Buy guard, the ECO-2 storage rule, the walking squeeze-past (src/town.js cap.pass) and every existing test green.
Quality bar: match the existing art and code style. For anything visual, build a harness page under ${ROOT}/.dock-harness/kraken/, render with the game's own renderer (src/scenery.js), screenshot with Playwright (chromium args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'], serve with require('${ROOT}/tests/server.cjs').serve(root), 120 s timeouts, NODE_PATH=/opt/node22/lib/node_modules), LOOK at the PNGs with the Read tool and do at least 3 critique rounds, at 1280x720 and 390x844. Report draw calls for anything that renders. Wait on game time (window.__game.state.time), not wall-clock, in browser probes. Meet your row's exit check exactly and report the real results. Scratch files under ${SP}/${id.split(' ')[0]}/.`

const ROWS = {
  '0': [{ id: '0 Integrator', extra: 'Do the Stage 0 row exactly. First re-measure the draw-call baselines on today\'s tree (the six level starts, the shipyard, the town) because the phone-battle fix changed main.js after SPEC3 measured them, then do the work and compare. No behaviour change except what the row lists; the full npm test (cd /home/user/First-project && NODE_PATH=/opt/node22/lib/node_modules npm test, ~50 min) must be green with no test edits.' }],
  '1:light': [
    { id: '1E Quiz', extra: 'Also: questions must be kind, correct and age-appropriate (about 7-12 years old); double-check every fact and sum.' },
    { id: '1A Special ammo', extra: '' },
    { id: '1B Voyage III rules', extra: '' },
    { id: '1C Kraken rules', extra: '' },
    { id: '1D Island & settings', extra: '' },
    { id: '1F Economy & looks data', extra: '' },
    { id: '1J Sound', extra: 'Keep the recorded music and tests/audio.cjs green; run node tests/audio.cjs at the end.' },
  ],
  '1:heavyA': [
    { id: '1H Shipwright', extra: 'The existing player model and every existing ship must stay identical (fingerprint check), and the shipyard gun-port counting test must still find the cannons.' },
    { id: '1K Env: Turtle Atolls', extra: '' },
    { id: '1I Status & Kraken art', extra: '1H (ships.js statusAnchors) lands before or alongside you; if it is not there yet, build on a mock of the section 11.1 shape and list what Stage 1b must re-check.' },
    { id: '1L Env: Cape of Storms', extra: '' },
  ],
  '1:heavyB': [
    { id: '1G Characters', extra: 'Existing seeded looks must stay identical: compare userData.look of seeds 1-400 before/after in a harness.' },
    { id: '1M Env: Kraken\'s Deep', extra: 'Photosensitivity caps of section 15 for any flash.' },
    { id: '1N Town world', extra: 'With the build ctx kraken false the town must be exactly today\'s (existing town and dock tests green); the walking squeeze-past and LOOK-2 waiting must hold with every villager out (prove it on every rope bridge).' },
    { id: '1O Ashore panels', extra: '1E (quiz.js, quizBank.js) may land alongside you; build on a mock of the section 11.1 shapes if needed and list what Stage 1b must re-check.' },
  ],
}

const key = STAGE === '0' ? '0' : `1:${GROUP}`
const list = ROWS[key] || []
phase('Build')
const results = await parallel(list.map((a) => () =>
  agent(`${COMMON(a.id)}\n\nYOUR TASK: row "${a.id}" of SPEC3 section 12. ${a.extra}`, { label: a.id, phase: 'Build', schema: OUT })))
return { stage: STAGE, group: GROUP, results: results.map((r, i) => ({ id: list[i].id, result: r })) }
