export const meta = {
  name: 'boarders-stage2',
  description: 'Stage 2 of the Boarders Away! update: battle systems wired into the game, boarding set-piece, town controller, battle tests',
  phases: [
    { title: 'Build', detail: '2A integrator (main/index/style/levels), 2B boarding.js, 2C town.js/townMode.js/town.css in parallel' },
    { title: 'Battle tests', detail: '2D tests/battle.cjs + package.json against the final 2A/2B work' },
  ],
}

const SPEC2 = '/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/SPEC2.md'
const SP = '/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/stage2'
const REPORTS = '/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/stage1-reports.md'

const OUT = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files_changed: { type: 'array', items: { type: 'string' } },
    api_notes: { type: 'string' },
    hooks_applied: { type: 'array', items: { type: 'string' }, description: 'which Stage 1 hook requests you applied (and which you declined, with why)' },
    hook_requests: { type: 'array', items: { type: 'string' }, description: 'changes you need in files you do not own' },
    verification: { type: 'string', description: 'commands run and exact results; never claim unrun checks' },
    screenshots: { type: 'array', items: { type: 'string' } },
    open_issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'files_changed', 'api_notes', 'hooks_applied', 'hook_requests', 'verification', 'screenshots', 'open_issues'],
}

const COMMON = (id) => `You are agent ${id} in Stage 2 of the "Boarders Away!" update for the browser game Pirates Ahoy! in /home/user/First-project (cartoon cel-shaded three.js game, plain ES modules, no build).
READ FIRST: ${SPEC2} section 0, section 10 (Stage 2 rules and YOUR row "${id}"), sections 9.1-9.3 and every section your files implement; then ${REPORTS} (what Stage 0 and Stage 1 delivered, their deviations from SPEC2, and every HOOK REQUEST addressed to files you own in this stage: apply them or explain why not in hooks_applied). Read the real code of every module you integrate with; trust the code over the reports.
Rules: edit ONLY the files your row owns; keep every owned file importable at all times (others test concurrently; develop risky rewrites as a copy under /home/user/First-project/.dock-harness/ and publish atomically); never edit vendor/, never add dependencies, never git commit/push/reset/stash/checkout. Keep the recorded-music code (src/audio.js RECORDED, assets/audio, tests/audio.cjs) working. Shipyard buttons open the dock two frames after a click (openDockSoon); tests must wait for state.mode==='dock'.
Browser facts: NODE_PATH=/opt/node22/lib/node_modules; Playwright chromium args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']; serve with require('/home/user/First-project/tests/server.cjs').serve(root); SwiftShader is slow (120 s timeouts); LOOK at screenshots with the Read tool and iterate on anything visual. If a full-suite run fails with timeouts while other agents are rendering (load average > 8), re-run before concluding. Scratch files under ${SP}/${id}/.`

const A = `${COMMON('2A Integrator (battle)')}

YOUR TASK: everything marked "2" in SPEC2 section 9.2, in src/main.js, index.html, style.css and src/levels.js: the damage pipeline through combat.js (aspect/range/ammo/crit, effects with the effect gap and boss half-durations, keg burn, chain slow, visible damage via ships.js setShipDamage/addHole), ammo switching (keys + touch, unlock rules), crew (player crew in the HUD, enemy crew via combat.crewNow), the new tags/pops/overboard wired in place of buildTag/setTag, hitmark, tips, the captain at the helm, boarding wired to the boarding.js API (works with whatever 2B has published; final behaviour once 2B lands), raiders boarding you, capture/surrender economy, bombs by kind, the mechanics.js hooks so Act II is playable with ?act2=1 (levels 4-6 from act2.js with the new env modules and ship models), persistence of armory/look/feats/tips via loadRecord/saveRecord, and the window.__game test API of section 9.3 for real. Unhide #game-live when used.
Exit check: the EXISTING npm test (cd /home/user/First-project && NODE_PATH=/opt/node22/lib/node_modules npm test) is green with no test edits (only 2D edits tests in this stage; the stage-0 docked() waits already exist); levels 1-3 play with the new systems (play them via window.__game and look at screenshots of a raking shot, a crit, a boarding and a capture); ?act2=1 starts levels 4, 5 and 6 without errors. Report draw calls per level and in a boarding (budget section 12).`

const B = `${COMMON('2B Boarding')}

YOUR TASK: src/boarding.js per SPEC2 sections 3.4-3.6 and 9.1: the attack / defend / counter / surrender timelines, grapple glue and reel, the visuals (hooks, lines, crew swinging across built from people.js with the captain leading, brawl dust and stars, defenders tumbling overboard via the overboard API), the camera pose, prebuild/lazy build, using combat.js resolveBoarding/boardingOdds/previewLabel (see the 1A hook request for the exact calls). Harness page with two real ships (ships.js) on the game's renderer: attack, defend (cut by taps / hold / hit, and fought off), counter, surrender; screenshots of each phase at 1280x720 and 390x844; at most 45 extra draw calls at the peak. Make it a satisfying, readable cartoon set-piece: LOOK at the screenshots and iterate.`

const C = `${COMMON('2C Town')}

YOUR TASK: src/town.js, src/townMode.js and town.css per SPEC2 sections 7.1-7.3 and 7.6-7.8: the captain controller using walk.js rules on sparrow's env.walk data, the town camera, keyboard + on-screen joystick + tap-to-walk, the places bar, the interaction prompt, the Harbour menu, the All aboard dialog, Polly's wardrobe (try-on, Surprise me!, crew line-up, Match the ship's paint; prices/ownership from cosmetics.js) and the tavern (armory.js upgrades, rumour board, captain's log). Build and test in a harness page with sparrow + people + cosmetics + armory and a mock ctx (main.js wiring is Stage 3): walking with keys/stick/taps, every place, every panel at the 7 town sizes (no page scroll, touch targets >= 44 px, contrast >= 4.5:1, keyboard and screen-reader usable), walk-view draw calls <= 450 at 6 spots. LOOK at the screenshots: walking the floating town as the captain must feel charming and easy.`

const D = (built) => `${COMMON('2D Battle tests')}

YOUR TASK: tests/battle.cjs (new) and package.json per SPEC2 sections 10 (row 2D), 11.2 and 11.4 order: the battle suite against the section 9.3 API (deterministic via G.combat.seed()/forceCrit(), frozen loop + G.step like smoke.cjs): rake/range/ammo/crit numbers in play, visible damage, crew pips and surrender notch, grapple range/cooldown, boarding odds preview and resolution (attack, defend by taps/hold/hit, counter, surrender, capture gold), raiders, ammo unlocks and swap time, tags/pops/overboard presence, persistence of the new records, Act II levels start with ?act2=1, and draw-call budgets. package.json: npm test runs the five new Node suites first (upgrades, combat, armory, cosmetics, mechanics, walk), then the existing ones, then battle.cjs, plus test:<name> scripts for each. Each new check must fail if the feature it guards breaks (sanity-check a few by temporarily breaking a copy). Run the full npm test at the end and report exact counts.
What 2A/2B/2C built (data): ${built}`

phase('Build')
const [a, b, c] = await parallel([
  () => agent(A, { label: '2A integrator (battle)', phase: 'Build', schema: OUT }),
  () => agent(B, { label: '2B boarding set-piece', phase: 'Build', schema: OUT }),
  () => agent(C, { label: '2C town controller + panels', phase: 'Build', schema: OUT }),
])
const brief = (n, r) => r ? `--- ${n} ---\n${r.summary}\nAPI: ${r.api_notes}\nVERIFIED: ${r.verification}\nOPEN: ${r.open_issues.join(' | ')}\nHOOK REQUESTS: ${r.hook_requests.join(' | ')}` : `--- ${n} --- (failed; inspect the files)`
phase('Battle tests')
const d = await agent(D(brief('2A', a) + '\n' + brief('2B', b) + '\n' + brief('2C', c)), { label: '2D battle tests', phase: 'Battle tests', schema: OUT })
return { a, b, c, d }
