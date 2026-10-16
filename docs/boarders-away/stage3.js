export const meta = {
  name: 'boarders-stage3',
  description: 'Stage 3 of the Boarders Away! update: Act II and the walkable town go live, polish from in-game screenshots, the Stage 3 test suites',
  phases: [
    { title: 'Go live', detail: '3A integrator (town wiring, two acts) || 3B balance and levels (WITH_ACT2 = true, Act II bot tuning)' },
    { title: 'Polish', detail: '3D town polish || 3E art fixes, both from in-game screenshots' },
    { title: 'Tests', detail: '3C levels.cjs, town.cjs, the 11.4 assertion changes, package.json' },
    { title: 'Fix-up', detail: '3F fixes whatever the new suites caught, until the whole suite is green' },
  ],
}

const ROOT = '/home/user/First-project'
const SPEC2 = `${ROOT}/docs/boarders-away/SPEC2.md`
const R1 = `${ROOT}/docs/boarders-away/stage1-reports.md`
const R2 = `${ROOT}/docs/boarders-away/stage2-reports.md`
const RF = `${ROOT}/docs/boarders-away/stage2-fix-reports.md`
const SP = '/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/stage3'
const WIRE = '/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/stage2/2C'

const OUT = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files_changed: { type: 'array', items: { type: 'string' } },
    api_notes: { type: 'string' },
    hooks_applied: { type: 'array', items: { type: 'string' }, description: 'hook requests addressed to your files that you applied, or declined with why' },
    hook_requests: { type: 'array', items: { type: 'string' }, description: 'changes you need in files you do not own (file, function, exact change, evidence)' },
    expected_test_changes: { type: 'array', items: { type: 'string' }, description: 'existing checks that now fail BECAUSE the new behaviour is correct (file, check text, why); 3C owns the tests' },
    verification: { type: 'string', description: 'commands run and exact results; never claim unrun checks' },
    screenshots: { type: 'array', items: { type: 'string' } },
    open_issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'files_changed', 'api_notes', 'hooks_applied', 'hook_requests', 'expected_test_changes', 'verification', 'screenshots', 'open_issues'],
}

const COMMON = (id) => `You are agent ${id} in Stage 3 of the "Boarders Away!" update for the browser game Pirates Ahoy! in ${ROOT} (cartoon cel-shaded three.js game, plain ES modules, no build).
READ FIRST: ${SPEC2} section 0, section 10 (Stage 3 rules and YOUR row), the sections your work implements, and the agent reports: ${R1} (Stage 0/1), ${R2} (Stage 2, including 2C's exact Stage 3 wiring recipe for main.js, corrected after review for FLOW-2), ${RF} (the post-review fixes). Every HOOK REQUEST addressed to a file you own: apply it or explain why not in hooks_applied. Read the real code you integrate with; trust the code over the reports.
Player decisions (built as defaults): beating the Molten Maw (level 3) still shows Victory, now with a button to sail on to Act II; raiders who win a fight on your deck steal 25% of that level's plunder (never the chest, never end the run); most cosmetics are free, the fancy ones cost 1,200 gold in total, 4 trophies are earned by feats; the pause menu lets you leave a battle for the shipyard or the main menu (built in Stage 2; keep it working).
Rules: edit ONLY the files your row owns; keep every owned file importable at all times (others test concurrently: main.js imports levels.js -> act2.js -> the env modules on every page; develop risky rewrites as a copy under ${ROOT}/.dock-harness/ and publish atomically with cp to a temp name + mv); never edit vendor/, never add dependencies, never git commit/push/reset/stash/checkout. Keep the recorded music (src/audio.js RECORDED, assets/audio, tests/audio.cjs), the shipyard Buy guard (only a click that bought something holds off a repeat click) and the ECO-2 storage rule (never write the chest without the record that matches it; never paid-for-but-missing) working.
Browser facts: NODE_PATH=/opt/node22/lib/node_modules; Playwright chromium args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']; serve with require('${ROOT}/tests/server.cjs').serve(root); SwiftShader is slow (120 s timeouts; the full npm test takes ~25 min); window.__game is the test API. LOOK at screenshots with the Read tool and iterate on anything visual (at least 3 critique rounds). If a full-suite run fails with timeouts while other agents are rendering (uptime load average > 8), re-run before concluding. Scratch files under ${SP}/${id.split(' ')[0]}/.`

const A = `${COMMON('3A Integrator (acts & town)')}

YOU OWN: src/main.js, index.html, style.css.
YOUR TASK: everything marked "3" in SPEC2 section 9.2 and the flows of sections 5.6 and 7.1: wire townMode into main.js following 2C's validated recipe in ${R2} (section "2C Town", api_notes items 1-16; the diff at ${WIRE}/stage3-main-wiring.diff and wire.py were made against an OLDER main.js, so apply by function anchors, not line numbers; use main's current variable names, e.g. armoryCfg), with the FLOW-2 correction (wardrobe purchases save the look record before taking gold; keep main's own buyArmory). Go ashore / Back to town, the views and key/pointer/camera routing, Esc for the Harbour and All aboard dialogs, context restore in town, setCrewStyle on every openDock and on hull paint, wardrobe persistence, the captain's look at the helm and in the boarding party, level cards in two acts (section 5.6), #act2-btn and the won text, Enter on the won screen, dockExits for Act II. 3B sets WITH_ACT2 = true in levels.js in parallel with you: your code must work with WITH_ACT2 true and false.
Exit check: with WITH_ACT2 as 3B leaves it, the full npm test is green except checks that fail only because the new behaviour is correct (the section 11.4 list, and the shipyard Shift+Tab-to-mute check now meeting #dock-ashore-btn first): list each such check exactly in expected_test_changes (3C updates them). Play it: from the title go to the shipyard, go ashore, walk to Polly's, buy and wear something, visit the tavern, All aboard into the next level; beat level 3 (via window.__game) and sail on into level 4. LOOK at screenshots of each step at 1280x720 and 390x844 touch. Report draw calls in the walk view and at each Act II level start.`

const B = `${COMMON('3B Balance & levels')}

YOU OWN: src/levels.js, src/act2.js, src/mechanics.js, src/combat.js, src/shipTypes.js, src/armory.js and their Node tests tests/combat.test.cjs, tests/mechanics.test.cjs, tests/armory.test.cjs (this stage only).
YOUR TASK: set WITH_ACT2 = true (section 6.1) so the six levels show for everyone; then tune numbers ONLY in their tables (section 6.8 order of knobs) until an Act II bot (write it in your scratch folder exactly as section 11.3 "Act II bot (bot v2)" describes, with the mid-game profile set via G.setShipConfig and G.armory.set) clears levels 4, 5 and 6 each within 900 s simulated (a second try allowed), every level fights back, Maelstrom damage taken > Doubloon Bay, and the existing Act I bot in tests/smoke.cjs still shows volcano > Europe. Every level must stay winnable with the stock ship (Act II expects a few upgrades). Update the Node tests you break (only for deliberate number changes; every worked example in SPEC2 sections 2.1 and 3.3 must still be reproduced, or SPEC2's numbers win). Report the bot results per level (time, damage taken, captures, boardings) before and after tuning.
Exit check: Node suites green; your bot passes; tests/smoke.cjs green except the section 11.4 card/unlock checks (list them in expected_test_changes).
NOTE: a previous attempt at this task was cut off by a container restart. Its work in progress is in the repo (WITH_ACT2 = true in src/levels.js; uncommitted edits to src/mechanics.js, src/combat.js, tests/combat.test.cjs, tests/mechanics.test.cjs: see \`git -C ${ROOT} diff\` for those files) and in ${SP}/3B/ (bot2.js, grid scripts, out-*.txt bot results for stock and mid-game profiles, g*.txt tuning grids; the latest grid g13/C1 tried per-level maxAttackers and wave overrides). Verify that work (re-run the Node suites and your bot) and continue from it rather than starting over. The integrator 3A has already finished and published main.js/index.html/style.css (do not edit them).`

const D = (prev) => `${COMMON('3D Town polish')}

YOU OWN: src/env/sparrow.js, src/walk.js, src/town.js, src/townMode.js, town.css, tests/walk.test.cjs, tests/fixtures/sparrow-walk.json.
The town is now live in the game (3A wired it). YOUR TASK: walk the real game's town (not a harness) as the captain on desktop and phone (keys, stick, tap-to-walk), every place and panel, and fix what the in-game screenshots show: holes or open backs, blockers, camera clipping or occlusion (add walk.camBlockers for the TAILOR arrow board and the welcome sign as 2C requested, then drop town.js's post heuristic), bunting occlusion near Polly's, the portrait walk-view captain size (section 7.3; make him easier to see on a 390x844 phone if a narrower walk FOV keeps the layout checks), Polly cheering on a purchase (env.cheer), and every hook request 3A sends below. Keep the walk data consistent with the fixture (regenerate it from the live env.walk if it changes) and the walk tests green. Draw calls in the walk view <= 450 at 6 spots.
What 3A and 3B did (data):
${prev}`

const E = (prev) => `${COMMON('3E Art fixes')}

YOU OWN: src/people.js, src/ships.js, src/env/doubloon.js, src/env/frost.js, src/env/maelstrom.js, src/boarding.js, src/tags.js, src/pops.js, src/overboard.js, fx.css, src/audio.js.
YOUR TASK: play the real game (levels 1-6 now that Act II is live, a boarding on each level, raiders, a capture, the Maelstrom's lightning under normal and reduced motion) and fix what the in-game screenshots show in your files: readability of ships, tags, pops and the boarding set-piece at 1280x720, 390x844 and 568x320 touch; the Stage 1 open items in ${R1} for your files (e.g. the aurora's blending, sun glitter that reads as sandbars, the Maelstrom's draw calls); audio balance of the new sounds against the recorded music; the pops items left open in ${RF} (the level/'X sunk!' banner and the minimap are not in pops' avoid list yet; pops still overlap on crowded 568x320 volleys). Run the section 12 draw-call audit (every level start, a boarding on each level, the busiest moment of each Act II level) and meet the budgets. Do not change gameplay numbers (3B's tables).
What 3A and 3B did (data):
${prev}`

const C = (prev) => `${COMMON('3C Tests')}

YOU OWN: tests/smoke.cjs, tests/controls.cjs, tests/battle.cjs, tests/levels.cjs (new), tests/town.cjs (new), package.json.
YOUR TASK: SPEC2 sections 11.3 and 11.4 exactly (the 11.4 line numbers are stale; find the checks by their content): tests/levels.cjs (cards in two acts, the Act I finale and sailing on, each Act II mechanic, the Act II bot v2 with its checks, Act II draw calls and screenshots) and tests/town.cjs (go ashore, walking, places, touch, wardrobe, tavern, the captain's look in battle, persistence, layout at the 7 town sizes, draw calls, context loss, mute, screenshots), the 11.4 assertion changes and ONLY the other existing-check changes the agents listed in expected_test_changes below (judge each: change a check only if the new behaviour is the correct one per SPEC2 or the player's decisions), plus a storage-full wardrobe purchase case in the ECO-2 controls check (FLOW-2). package.json "test" in the 11.4 order (keep tests/audio.cjs in it; it was added by another session) with test:<name> scripts. Each new check must fail if its feature breaks: sanity-check several by breaking a COPY of the game served from a temp root (never edit src/). If a check exposes a real bug in src/, do not fix src/: report it in hook_requests with the failing check, its output and the suspected cause. Run the full npm test at the end and report exact counts.
What 3A, 3B, 3D and 3E did (data):
${prev}`

const F = (prev) => `${COMMON('3F Fix-up')}

YOU OWN (this step, alone): every file in the repo except vendor/ (no other agent is running).
YOUR TASK: make the whole suite green with correct behaviour. The test agent 3C reported the bugs its new checks caught and any failures (below, data). For each: decide whether the game or the check is wrong per SPEC2 and the player's decisions; fix the game (preferred) or, only if the check is wrong, the check (explain why). Also apply any hook requests from 3D/3E that nobody owned. Then run the full npm test (cd ${ROOT} && NODE_PATH=/opt/node22/lib/node_modules npm test) until it is green, and report exact counts. If nothing is reported and the suite is already green, just run it once and confirm.
Reports (data):
${prev}`

const brief = (n, r) => r ? `--- ${n} ---\n${r.summary}\nAPI: ${r.api_notes}\nHOOKS APPLIED: ${r.hooks_applied.join(' | ')}\nHOOK REQUESTS: ${r.hook_requests.join(' | ')}\nEXPECTED TEST CHANGES: ${r.expected_test_changes.join(' | ')}\nVERIFIED: ${r.verification}\nOPEN: ${r.open_issues.join(' | ')}` : `--- ${n} --- (failed or skipped; inspect the files)`

phase('Go live')
const [a, b] = await parallel([
  () => agent(A, { label: '3A integrator: town + two acts', phase: 'Go live', schema: OUT }),
  () => agent(B, { label: '3B balance + Act II bot', phase: 'Go live', schema: OUT }),
])
const ab = brief('3A', a) + '\n' + brief('3B', b)
phase('Polish')
const [d, e] = await parallel([
  () => agent(D(ab), { label: '3D town polish', phase: 'Polish', schema: OUT }),
  () => agent(E(ab), { label: '3E art fixes + draw-call audit', phase: 'Polish', schema: OUT }),
])
const abde = ab + '\n' + brief('3D', d) + '\n' + brief('3E', e)
phase('Tests')
const c = await agent(C(abde), { label: '3C tests: levels + town + 11.4', phase: 'Tests', schema: OUT })
phase('Fix-up')
const f = await agent(F(abde + '\n' + brief('3C', c)), { label: '3F fix-up until green', phase: 'Fix-up', schema: OUT })
return { a, b, d, e, c, f }
