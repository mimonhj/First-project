export const meta = {
  name: 'boarders-stage2',
  description: 'Stage 2 of the Boarders Away! update: battle systems wired into the game, boarding set-piece, town controller, battle tests',
  phases: [
    { title: 'Build', detail: 'battle: 2A-1 combat core with 2B boarding.js in parallel; town: 2C town.js/townMode.js/town.css' },
    { title: 'Wire', detail: '2A-2 boarding, raiders, capture, bombs, Act II hooks, against the finished boarding.js' },
    { title: 'Leave battle', detail: '2A-3 pause menu: resume, or leave the level for the shipyard or the main menu' },
    { title: 'Battle tests', detail: '2D tests/battle.cjs + package.json against the final 2A/2B work' },
  ],
}

// args: { part: 'battle' | 'town' }
//  battle: (2A-1 || 2B) -> 2A-2 -> 2A-3 -> 2D        town: 2C
const PART = (args && args.part) || 'battle'
const SPEC2 = '/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/SPEC2.md'
const SP = '/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/stage2'
const REPORTS = '/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/stage1-reports.md'

const OUT = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files_changed: { type: 'array', items: { type: 'string' } },
    api_notes: { type: 'string' },
    hooks_applied: { type: 'array', items: { type: 'string' }, description: 'which Stage 1 hook requests you applied (and which you declined or left to the other 2A agent, with why)' },
    hook_requests: { type: 'array', items: { type: 'string' }, description: 'changes you need in files you do not own' },
    verification: { type: 'string', description: 'commands run and exact results; never claim unrun checks' },
    screenshots: { type: 'array', items: { type: 'string' } },
    open_issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'files_changed', 'api_notes', 'hooks_applied', 'hook_requests', 'verification', 'screenshots', 'open_issues'],
}

const COMMON = (id) => `You are agent ${id} in Stage 2 of the "Boarders Away!" update for the browser game Pirates Ahoy! in /home/user/First-project (cartoon cel-shaded three.js game, plain ES modules, no build).
READ FIRST: ${SPEC2} section 0, section 10 (Stage 2 rules and the Stage 2 table), sections 9.1-9.3 and every section your work implements; then ${REPORTS} (what Stage 0 and Stage 1 delivered, their deviations from SPEC2, and every HOOK REQUEST addressed to files you own in this stage: apply the ones in your scope or explain why not in hooks_applied). Read the real code of every module you integrate with; trust the code over the reports.
Rules: edit ONLY the files your task owns; keep every owned file importable at all times (others test concurrently: main.js imports levels.js -> act2.js -> the env modules on every page; develop risky rewrites as a copy under /home/user/First-project/.dock-harness/ and publish atomically with cp to a temp name + mv); never edit vendor/, never add dependencies, never git commit/push/reset/stash/checkout. Keep the recorded-music code (src/audio.js RECORDED, assets/audio, tests/audio.cjs) working. Shipyard buttons open the dock two frames after a click (openDockSoon); tests wait for state.mode==='dock'. The shipyard Buy click guard in main.js was just fixed (commit 0aaca07): only a click that bought something holds off a repeat click; keep that behaviour.
Browser facts: NODE_PATH=/opt/node22/lib/node_modules; Playwright chromium args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']; serve with require('/home/user/First-project/tests/server.cjs').serve(root); SwiftShader is slow (120 s timeouts; the full npm test takes about 15 minutes); LOOK at screenshots with the Read tool and iterate on anything visual (at least 3 critique rounds for each new visual). If a full-suite run fails with timeouts while other agents are rendering (check uptime; load average > 8), re-run before concluding. Scratch files under ${SP}/${id.split(' ')[0]}/.`

const A1 = `${COMMON('2A-1 Combat core')}

YOU OWN (this step): src/main.js, index.html, style.css, src/levels.js. Another agent (2B) is writing src/boarding.js at the same time; a later agent (2A-2) will wire boarding, raiders, capture/surrender, bombs by kind and the Act II mechanics into main.js after you. Leave those for 2A-2 (keep the existing stub calls working) and leave clean seams for them.
YOUR TASK: the combat core of SPEC2 section 9.2 (the rows marked "2"), in main.js/index.html/style.css/levels.js:
- imports and state: combat, armory, cosmetics, tags, pops, overboard; state.ammo, crew, crewMax, hitStop; armory, look, feats, tips (loaded/saved via loadRecord/saveRecord with the 1B parsers); combatRng = mulberry32 reseeded in startLevel (n x 7919 + 13).
- fighting(e) everywhere the table says; createShip fields (crew0, killed, hpLow, crewShown, effects, lastEffectAt, hitsBySide, reloadMax, rise ...) and removeShip cleanup; the captain at the helm of the player ship (people.js) and his disposal.
- fire()/inArc()/playerFire with ammo (range clamp, spread, reloadMax, projectileMesh, ball ammo/ox/oz), the RAKE! cue; hitsShip per ammo; updateBalls -> combat shotResult -> damage(s, dmg, x, z, src, info) with the signature kept (tests call damage(e, 9999)).
- damage(): crew kills, effects with the 3 s effect gap and boss half-durations, keg burn, chain slow, holes and setShipDamage thresholds (ships.js), pops, volley tags, hit-stop, overboard tumbles; volleyDone hitmark + stickers + summed pop; feats.
- updatePlayer/speedCap/steerToward effect multipliers; syncShip list/sit-lower/rise/setShipDamage; tags via tags.add/update/remove replacing buildTag/setTag; pops and overboard updates in frame(); hit-stop dt scaling.
- HUD of section 5.3 (ammo selector with keys 1-3 and R, touch #touch-ammo, crew in the HUD, reload bars with reloadMax, target/preview), tips, drawMinimap additions that do not depend on Act II.
- the window.__game test API of section 9.3 for everything above (combat.seed/forceCrit, ammo, crew, effects ...); keep every existing __game member working.
- ALSO check: in headless screenshots the level-start banner sits partly off the left edge of the screen; find out whether it is real (it may be a pre-existing CSS animation start position) and fix it if it is.
Exit check: the EXISTING npm test (cd /home/user/First-project && NODE_PATH=/opt/node22/lib/node_modules npm test) green with no test edits; levels 1-3 play with the new damage system: drive them via window.__game and LOOK at screenshots of a raking shot, a crit with its pop, chain shot slowing a ship, a keg burn, visible damage levels and holes, crew pips going down and the ammo HUD at 1280x720 and 390x844. Report draw calls per level (budget section 12).`

const B = `${COMMON('2B Boarding')}

YOU OWN: src/boarding.js only. Two other agents edit main.js (2A-1 now, 2A-2 after you finish and will wire your module into the game), so publish the final API exactly as SPEC2 9.1 says and document every deviation in api_notes.
YOUR TASK: src/boarding.js per SPEC2 sections 3.4-3.6 and 9.1: the attack / defend / counter / surrender timelines, grapple glue and reel, the visuals (hooks, lines, crew swinging across built from people.js with the captain leading, brawl dust and stars, defenders tumbling overboard via the overboard API), the camera pose, prebuild/lazy build, using combat.js resolveBoarding/boardingOdds/previewLabel (see the 1A hook request in the reports for the exact calls). Harness page with two real ships (ships.js) on the game's renderer: attack, defend (cut by taps / hold / hit, and fought off), counter, surrender; screenshots of each phase at 1280x720 and 390x844; at most 45 extra draw calls at the peak. Make it a satisfying, readable cartoon set-piece: LOOK at the screenshots and iterate. Also write the exact wiring 2A-2 needs (which main.js calls, in which function, with which ctx members) at the top of api_notes.`

const A2 = (prev) => `${COMMON('2A-2 Boarding & Act II wiring')}

YOU OWN (this step): src/main.js, index.html, style.css, src/levels.js. The combat core is already wired by 2A-1 and src/boarding.js is finished by 2B (reports below, data). Build on their work; do not undo it.
YOUR TASK: the rest of SPEC2 section 9.2 (rows marked "2"): boarding wired to the real boarding.js API (G key and #touch-board, the odds preview, fire() refusals during boarding and truce, updateEnemy skipping the target during reel..result, moveShip skipping the glued pair, separateShips, boarding.step/render, camera override from boarding.camera(), hold-to-cut listeners, Space/Enter skip in brawl, the counter-board window), raiders boarding you (raider AI + boarding attempts; a won fight on your deck steals 25% of this level's plunder, never the chest, never ends the run), surrender and capture economy (surrendered drift, captured ships sailing for the edge and removal at removeAt, capture gold, auto-capture of surrendered ships at level clear, summary lines in finishLevel), bombs generalised by kind (section 6.2), the mechanics.js hooks (createMechanics in startLevel, steer/avoid in updateEnemy, drift in moveShip, onSpawn in spawnWave with +3 crew on reinforcements, onSink in damage, step, holdFire in fire, bonuses in finishLevel), the minimap additions for Act II, and the remaining window.__game test API of section 9.3 (boarding, mechanics, raiders, capture). With ?act2=1, levels 4, 5 and 6 (act2.js with the new env modules and ship models) must start and play without errors. Apply every remaining Stage 1 hook request for your files that 2A-1 did not (see their hooks_applied below) and list each in hooks_applied.
Exit check: the EXISTING npm test green with no test edits; levels 1-3 play with boarding: LOOK at screenshots of an attack boarding (reel, swing, brawl, result), a raider boarding you being cut loose, a surrender and a capture sailing away; ?act2=1 starts levels 4, 5 and 6 without console errors (screenshots of each). Report draw calls per level and at the peak of a boarding (budget section 12).

What 2A-1 and 2B built (data):
${prev}`

const A3 = (prev) => `${COMMON('2A-3 Leave the battle')}

YOU OWN (this step): src/main.js, index.html, style.css, and tests/controls.cjs (only to add the new checks below; keep every existing assertion). 2A-1 and 2A-2 finished the battle wiring (reports below, data); build on it, do not undo it.
THE PLAYER ASKED FOR THIS: "add an option to cancel the level and come back to main screen or to shipyard, it will be choice when you press the resume button". Today the pause dialog (#pause-screen, opened by the II button, P or Esc) offers only Resume. Make it a choice:
- Resume (stays the first, focused, main action) plus a "Leave this battle" group with two buttons: Shipyard and Main menu.
- Leaving is not undoable, so either button first asks once, inside the same dialog: e.g. "Leave the battle? The N gold plundered in this level won't be banked. Your treasure chest, upgrades and unlocked levels stay." with "Leave" and "Keep fighting" (Keep fighting / Esc goes back to the pause choices with focus on the button that was pressed; P still resumes the game).
- Leaving drops this level's unbanked plunder exactly like a shipwreck does (state.gold back to goldAtLevelStart; the chest is untouched; best voyage score from that value), and clears everything of the battle (projectiles, bombs, a boarding in progress or a raider on your deck, tags, pops, overboard figures, the helm captain, mechanics state) with no stray sounds.
- Shipyard: go through openDockSoon with a new origin (e.g. 'quit') whose exits are like a shipwreck's: try this level again, or back to the title (reuse the existing exit labels and dockExits()). Update DOCK_FROM, dockExits and the __game.dock API comment; window.__game.dock.open must stay synchronous.
- Main menu: back to the title screen (the voyage ends there, as the existing menu exit does).
- Accessibility and layout: the dialog keeps its focus trap and labelling; the confirm text is announced (role=status or moves focus to the confirm prompt); every button >= 44 px; no page scroll and nothing clipped at every layout size the controls tests already check (incl. 568x320 landscape touch and 390x844); contrast >= 4.5:1. Touch players reach it from the II button. The graphics-recovery dialog keeps priority over the pause dialog.
- Add checks to tests/controls.cjs: the pause dialog shows Resume, Shipyard and Main menu; Keep fighting returns to the choices; leaving to the shipyard opens the dock with the try-again and title exits, the chest unchanged and the level's plunder not banked; try again restarts the same level; leaving to the main menu shows the title with the chest unchanged; keyboard-only path; leaving during a boarding leaves nothing behind (scene object count back to a fresh level's); layouts at the small sizes. Each check must fail if its feature breaks.
Exit check: the full npm test green (only your added checks are new); LOOK at screenshots of the pause dialog and its confirm step at 1280x720, 390x844 and 568x320, and make them look like part of the game (same panel style).

What 2A-1, 2B and 2A-2 built (data):
${prev}`

const C = `${COMMON('2C Town')}

YOU OWN: src/town.js (new), src/townMode.js, town.css. main.js wiring is Stage 3; do not touch main.js (another agent edits it now).
YOUR TASK: src/town.js, src/townMode.js and town.css per SPEC2 sections 7.1-7.3 and 7.6-7.8: the captain controller using walk.js rules on sparrow's env.walk data, the town camera, keyboard + on-screen joystick + tap-to-walk, the places bar, the interaction prompt, the Harbour menu, the All aboard dialog, Polly's wardrobe (try-on, Surprise me!, crew line-up, Match the ship's paint; prices/ownership from cosmetics.js) and the tavern (armory.js upgrades, rumour board, captain's log). Build and test in a harness page with sparrow + people + cosmetics + armory and a mock ctx: walking with keys/stick/taps, every place, every panel at the 7 town sizes (no page scroll, touch targets >= 44 px, contrast >= 4.5:1, keyboard and screen-reader usable), walk-view draw calls <= 450 at 6 spots. LOOK at the screenshots: walking the floating town as the captain must feel charming and easy. In api_notes write the exact wiring Stage 3 needs in main.js (calls, ctx members, key/pointer routing).`

const D = (built) => `${COMMON('2D Battle tests')}

YOU OWN: tests/battle.cjs (new) and package.json.
YOUR TASK: tests/battle.cjs per SPEC2 sections 10 (row 2D), 11.2 and 11.4 order: the battle suite against the section 9.3 API (deterministic via G.combat.seed()/forceCrit(), frozen loop + G.step like smoke.cjs): rake/range/ammo/crit numbers in play, visible damage, crew pips and surrender notch, grapple range/cooldown, boarding odds preview and resolution (attack, defend by taps/hold/hit, counter, surrender, capture gold), raiders (the 25% plunder rule), ammo unlocks and swap time, tags/pops/overboard presence, persistence of the new records, Act II levels start with ?act2=1, and draw-call budgets. package.json: npm test runs the new Node suites first (upgrades, combat, armory, cosmetics, mechanics, walk), then the existing ones, then battle.cjs, plus test:<name> scripts for each. Each new check must fail if the feature it guards breaks: sanity-check several by temporarily breaking a COPY of the code (serve a patched copy from a temp root, never edit src/). If a check exposes a real bug in src/, do not fix src/: report it in hook_requests with the failing check and the evidence. Run the full npm test at the end and report exact counts.
What 2A-1, 2B, 2A-2 and 2A-3 built (data): ${built}\nAlso cover the pause dialog's leave-the-battle choice in battle.cjs only where controls.cjs does not (e.g. leaving mid-boarding with a raider aboard).`

const brief = (n, r) => r ? `--- ${n} ---\n${r.summary}\nAPI: ${r.api_notes}\nHOOKS APPLIED: ${r.hooks_applied.join(' | ')}\nVERIFIED: ${r.verification}\nOPEN: ${r.open_issues.join(' | ')}\nHOOK REQUESTS: ${r.hook_requests.join(' | ')}` : `--- ${n} --- (failed or skipped; inspect the files)`

if (PART === 'town') {
  phase('Build')
  const c = await agent(C, { label: '2C town controller + panels', phase: 'Build', schema: OUT })
  return { c }
}

phase('Build')
const [a1, b] = await parallel([
  () => agent(A1, { label: '2A-1 combat core', phase: 'Build', schema: OUT }),
  () => agent(B, { label: '2B boarding set-piece', phase: 'Build', schema: OUT }),
])
phase('Wire')
const a2 = await agent(A2(brief('2A-1', a1) + '\n' + brief('2B', b)), { label: '2A-2 boarding + Act II wiring', phase: 'Wire', schema: OUT })
phase('Leave battle')
const a3 = await agent(A3(brief('2A-1', a1) + '\n' + brief('2B', b) + '\n' + brief('2A-2', a2)), { label: '2A-3 pause: leave the battle', phase: 'Leave battle', schema: OUT })
phase('Battle tests')
const d = await agent(D(brief('2A-1', a1) + '\n' + brief('2B', b) + '\n' + brief('2A-2', a2) + '\n' + brief('2A-3', a3)), { label: '2D battle tests', phase: 'Battle tests', schema: OUT })
return { a1, b, a2, a3, d }
