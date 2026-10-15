export const meta = {
  name: 'boarders-stage0',
  description: 'Stage 0 of the Boarders Away! update: scaffolding with no behaviour change (plus two small shipyard residual fixes)',
  phases: [{ title: 'Scaffold', detail: 'one integrator: levels.js, hooks, ship data, DOM ids, stub modules, test API placeholders' }],
}

const SPEC2 = '/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/SPEC2.md'
const SP = '/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/stage0'

const OUT = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files_changed: { type: 'array', items: { type: 'string' } },
    api_notes: { type: 'string', description: 'exact stub APIs, ids, hooks created; any deviation from SPEC2 and why' },
    verification: { type: 'string', description: 'commands run and exact results (pass counts, draw calls before/after). Never claim unrun checks.' },
    open_issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'files_changed', 'api_notes', 'verification', 'open_issues'],
}

phase('Scaffold')
const r = await agent(`You are the Stage 0 integrator for the "Boarders Away!" update of the browser game Pirates Ahoy! in /home/user/First-project (cartoon three.js game, plain ES modules, no build).
Read ${SPEC2} sections 0, 9, 10 (Stage 0 row), Appendix A, and every section the Stage 0 row references (5.2, 5.3, 5.6, 6.1, 6.4-6.7, 7.1, 9.1, 9.2, 9.3), plus the current code (src/main.js, index.html, style.css, src/shipTypes.js, tests/*.cjs, package.json). NOTE: another session recently added recorded music (src/audio.js, assets/audio/, tests/audio.cjs, scene 'dock'); keep it working and do not edit src/audio.js.
Do EXACTLY the Stage 0 row of SPEC2 section 10: move LEVELS to src/levels.js (ACT1, LEVELS, WITH_ACT2 = false), fighting(e), dockExits(from), env.step/env.update hooks, the new ship-type data in shipTypes.js (data only), every new DOM element/overlay/id (placed before #recover-screen, hidden), fx.css/town.css links, the stub modules with their FINAL APIs from 9.1 as safe null objects (src/act2.js, src/env/doubloon.js, src/env/frost.js, src/env/maelstrom.js as valid empty seas, src/tags.js, src/pops.js, src/overboard.js, src/boarding.js, src/mechanics.js, src/townMode.js), TAP_ACTIONS stubs, loadRecord/saveRecord, and the window.__game placeholders of 9.3. NO behaviour change: the game must look and play exactly as before.
Also fix two small residuals from the last review of the shipyard (allowed exceptions to "no behaviour change"; keep them minimal):
 (1) ECO-2: when storage is full (setItem throws only for writes that grow storage), a purchase must never lose gold: after a failed ship-record save the chest must not be written either, AND a later successful chest save (e.g. banking after a level) must not silently drop an upgrade that was bought but not saved. Pick a consistent rule (e.g. keep both in memory for the visit and retry saving both together; never write the chest without the ship record that matches it) and add a check to tests/controls.cjs that fills localStorage to quota after load, buys, banks, reloads, and asserts gold + upgrades are consistent (never paid-for-but-missing).
 (2) PERF-4: opening the shipyard freezes the page for 1-3 s with no feedback. When the player opens it from a button (title, level cleared, shipwrecked, victory), first show a small "Rowing to Sparrow's Floating Island..." toast/overlay (accessible: role=status), let it paint (two requestAnimationFrame ticks), then run the existing synchronous openDock. window.__game.dock.open must stay synchronous for tests. Add a check that the status text appears before the dock opens.
Rules: own only the files the Stage 0 row lists plus tests/controls.cjs for the two new residual checks; never edit vendor/, never add dependencies, never git commit/push/reset/stash/checkout. Keep every file importable at all times.
Exit check (mandatory): cd /home/user/First-project && NODE_PATH=/opt/node22/lib/node_modules npm test must be green (the existing assertions unchanged except your two added checks), and draw calls per level (smoke prints them) within +-2 of before (record the before numbers first). Browser facts: Playwright chromium with ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'], serve via tests/server.cjs, SwiftShader is slow (120 s timeouts). Scratch files go under ${SP}/. Report honestly.`, { label: 'stage 0 integrator', phase: 'Scaffold', schema: OUT })
return r
