# Kraken Seas Stage 0 report (data, written by the build agent; trust the code)

## 0 Integrator

Stage 0 (row "0 Integrator") is done and live in the repo. Nothing is committed. The full npm test passed: 1214 checks, 0 failures, exit 0, 51.5 min, no test edits. The draw-call baselines were re-measured on 933395c and are unchanged after Stage 0. A seeded play-through of all six levels gives bit-identical results on 933395c and on the new tree. With ?kraken=1 the title shows 9 cards in 3 groups, and levels 7–9 start as stub seas with one Corsair Cutter each. They play through to Level cleared / Victory with no page errors or warnings.

What was built:
- voyage.js: main.js now imports LEVELS from here instead of levels.js.
- turnRate(ship, { full }) and playerTurn() replace the three copies of the turn formula (updatePlayer, steerToward, launchBomb's prediction).
- Seams that change nothing yet: statusMuls and mechanics.shipMods in speedMul, turnMul, mayFire and speedCap; targetsFor(side), which returns the enemies only; pseudo-target branches in hitsShip and damage (never taken).
- composeMechanics is written in full (§11.1), and startLevel routes every level through it with createMechanics3 as a null object.
- launchBomb(spec) handles lava, lightning, geyser, shell, ink and slam; today's level bombs are identical.
- The six new ship types and the matching FEAT_PRIZE_TYPES line.
- Every Appendix A DOM id, hidden. #quiz-screen and #build-screen are class overlay and come before #recover-screen.
- The ammo keys now accept Digit/Numpad 1–6; 4–6 do nothing. TAP_ACTIONS.tray is a no-op stub.
- All the §11.3 __game placeholders, and the sparrow build ctx gets kraken: WITH_KRAKEN.
- Stubs with their final §11.1 API: act3.js (three placeholder levels plus ACT3_TEASER), env/atolls.js, cape.js and deep.js (open seas with the §5 palettes, 6 enemy spawns and 4 crate spots on a ring of radius 75), specials, mechanics3, kraken, krakenView, statusfx, island, quiz, quizBank, settings, quizPanel, buildPanel.

How it was developed: in a mirror at .dock-harness/kraken/0/dev, then published with cp to a temp name + mv. I checked first that the repo's index.html, style.css and main.js had not changed since HEAD.

### API notes

EXPORTS (all as §11.1; every pure module imports nothing, checked by grep and by loading each as a data: URL in Node)
- voyage.js: WITH_KRAKEN = /[?&]kraken=1(&|$)/.test(location.search); LEVELS = WITH_KRAKEN ? [...levels.LEVELS, ...ACT3_LEVELS] : levels.LEVELS (the same array as levels.js when off).
- act3.js: ACT3_LEVELS and ACT3_TEASER.
  - Three placeholder defs, each with: env (its stub module), difficulty Daring/Fearsome/Mythic, act 3, stars 7/8/9, scene atolls/cape/deep, nextWaveAt 0, maxAttackers 2, lead 0.6, spreadMul 1, grace 3, enemyRake 1, mechanics [], waves [['cutter']].
  - Bonus 1300/1600/2500 (§5.4–5.6).
  - lockText 'Beat the Phantom Galleon' on level 7 only, so 8 and 9 read 'Locked' as §5.2 says.
  - Level 9 also has finale: true and finaleText from §5.6.
- env/atolls.js, cape.js, deep.js:
  - meta and the §5 palette.
  - build(scene, ctx) returns worldRadius 145/150/140, colliders [], playerStart {0,0,0}, 6 enemySpawns and 4 crateSpots on a ring of radius 75, reefs [], update(), dispose(), group (an empty THREE.Group).
  - Extras: atolls spoutLoops []; cape rogueDirs []; deep krakenArena {0,0,60}, setDread() and setDawn() (no-ops).
- specials.js:
  - Tables (§2 values): SPECIAL_IDS, ALL_AMMO, SPECIAL, RECIPES, LOADS, STATUS, IMMUNE ({ inferno: ['fire'], phantom: ['stink'] }; their words are in WORDS3.immune), WORDS3.
  - Functions: isSpecial, onSale (false), specialShot (returns the info unchanged), newStatus ({id:null,t:0,max:0,immune:0}), applyStatus, stepStatus, statusMuls (a shared frozen identity), douse, startLoads (all 0), spendLoad, crateLoad, defaultPowder, parsePowder (always the default), serializePowder, buyRecipe (never ok).
- mechanics3.js:
  - MECHANIC3_IDS and the tables SPOUTS, ROGUE, RAM, MORTAR, FIRESHIP, INK, FLEE (SPEC starting values).
  - createMechanics3(ids, ctx): a null object that keeps only its own ids; shipMods returns a frozen identity; visuals() is empty; krakenDue is false.
  - composeMechanics([a, b]): fully written to the §11.1 rules. state is { ...a.state, m3: b.state }. objective returns a's string unchanged when b's is null. drift is summed, null when both are null. shipMods multiplies the muls and adds the adds. visuals, krakenDue and addSlick come from b. It never throws on junk.
  - Checked against real createMechanics instances (none, convoy, floes, current, spouts, current+flagship) and against fake parts: 29/29 in the scratch compose.test.cjs.
- kraken.js: KRAKEN table (hp 600, notches, pearl 1000, the phases …) and createKraken(ctx), a Kraken that never rises (targets [], bar null).
- krakenView.js: createKrakenView (prepare() and ready are true; riseCamera returns null).
- statusfx.js: createStatusFx, whose sync, clear and dispose do nothing.
- island.js:
  - PLOTS (§8.1, with x/z, tiers, costs, perks, height), RANKS, GIFT, MARKET, VILLAGER_CAP.
  - totals() gives 3400 / 8400 / 11800.
  - perks() returns today's numbers (wavePatch 0.35).
  - Everything else is tier 0 or not ok.
- quiz.js:
  - QUIZ_LEVELS (§7.2 rows { name, band, answers, first, later }), CATS, ROUND, PASS, GOOD_TRY, SEEN_MAX.
  - rng is mulberry32. stars() is real.
  - validateBank returns { ok: false } until 1E writes it. Everything else returns defaults.
- quizBank.js: QUESTIONS = [].
- settings.js: STEER_MODES, defaultSettings, parseSettings (always the default), serializeSettings.
- quizPanel.js and buildPanel.js: { open, close, onKey, refresh, active: false, api: {} }.
- shipTypes.js: shark, bombketch, ironclad, fireship, skiff, inkheart with the §4.1 stats and flags. The fire ship has guns 0, dmg 0, reload 99, engage 0 and spread 0.

MAIN.JS (identical results everywhere; proved by the seeded bit-identical replay below)
- Imports:
  - LEVELS and WITH_KRAKEN from voyage.js.
  - Namespace imports of specials, mechanics3, kraken (as krakenRules), krakenView, statusfx (as statusFx), island (as islandRules), quiz (as quizRules), settings (as settingsRules). A missing export in a module still being built therefore never stops the game from linking.
- New state:
  - state.loads, state.powder, state.grabbed; input.steer = null.
  - let kraken = null; let krakenCheckpoint = null.
  - In-memory settings, islandCfg and quizRec.
  - ship.status = newStatus() on every ship.
- turnRate(ship, { full }) = (full ? turn : turn × (low + (1 − low) × min(1, speed / max))) × turnMul, × boarding.turnScale for the player. low = type.turnLow ?? TURN_LOW (0.35); 1 − 0.35 === 0.65 exactly in JS.
- playerTurn() = boarding.locked || state.grabbed ? 0 : input.steer ?? left − right.
- launchBomb uses playerTurn() × turnRate(player). This was bit-identical in every replay.
- speedMul and turnMul fold in statusMuls(s.status) by the smallest-wins rule. turnMul also multiplies mechanics.shipMods(s).turnMul. mayFire refuses on statusMuls.noFire. speedCap = (cap + capAdd) × speedMul × shipMods.speedMul.
- targetsFor(side) returns the live `enemies` array. It is read by aimTarget, the FIRE! light, the tutorial, the minimap, the camera's side-look, framingLive and the player's balls in updateBalls. rakeCue returns null for a pseudo target.
- Pseudo branches: hitsShip → kraken.hits(...). damage → damagePseudo, which pops the word, adds the damage to the volley's target and returns.
- startLevel builds ctx and ctx3 = { ...ctx, launchBomb(spec), flee, explode, status, douse, playerTurn, warnBonus, surrender }, then calls composeMechanics([createMechanics(ids, ctx), createMechanics3(ids, ctx3)]). The menu, releaseBattlePeople and module init use the composed null instance (noMechanics()).
- launchBomb(spec):
  - With no spec it keeps today's path and the same Math.random order.
  - With a spec { kind, from, tx, tz, radius, damage, warn | [a, b], T? } it calls placeBomb.
  - It now returns the bomb (null if none); it used to return undefined.
  - BOMB_KINDS lists the six kinds. warnBonus() returns 0.
  - The new kinds land with a splash placeholder and their own damage source. The lava whistle is now guarded.
- Test API placeholders (§11.3):
  - specials: loads, setLoads, powder, setPowder (validated, not saved), status, crate (returns null).
  - steer(x) sets input.steer to a value clamped to −1..1, or null. clearSteering also resets input.steer.
  - settings.get / settings.set; mechanics3.state (= mechanics.state.m3), wave, spout.
  - kraken: state, rise, setHp, phase, targets, cut, cutHold, checkpoint.
  - island: config, set, build (returns { ok: false, reason: 'closed' }).
  - quiz: record, set, start, answer, hint, next, round.
  - voyage.WITH_KRAKEN.
- TAP_ACTIONS handlers now receive the button (TAP_ACTIONS[tap](btn)); tray is a no-op.
- setEnvironment(mod, seed, extra) spreads `extra` into the build ctx. openDock passes { kraken: WITH_KRAKEN }.
- ACT_NAMES[3] = 'Voyage III · The Kraken Seas'.

INDEX.HTML / STYLE.CSS
- Appendix A ids, all hidden, placed as listed:
  - #boss-status before #boss-name; #boss-notches inside the boss bar.
  - #grab-strip and #edge-arrow after #boarding-strip.
  - #ammo-count after #ammo-name.
  - #steer-needle and #touch-wheel in .pad.left.
  - #ammo-tray after .pad.act inside #touch, with six button[data-tap=tray][data-ammo].
  - #steer-mode-btn (.touch-only) as the last child of #pause-choices; #kraken-retry-btn as the first button of the shipwreck panel.
  - Town places quiz and builder between Tavern and Set sail; #harbour-quiz-btn and #harbour-build-btn; #tavern-powder-list after #tavern-up-list.
  - #quiz-screen and #build-screen are 'overlay town quiz' / 'overlay town build' sections, with the tavern's panel skeleton holding every listed id, placed before #recover-screen.
- style.css additions:
  - A .touch-only rule that hides it wherever isTouch() is false: @media (hover: hover), (pointer: fine), (pointer: none).
  - .act-head.act-3 #2f2a6e and .lvl-7/8/9 card gradients. These show only with ?kraken=1.

DEVIATIONS (and why)
1. The pirates-ahoy-powder, -island, -quiz and -settings records are NOT loaded with loadRecord in Stage 0. The stub parsers would rewrite a stored record with defaults, and Stage 0 must not touch storage. Stage 2 and 3 load them; until then they are in-memory defaults.
2. TURN_LOW = 0.35 is a local constant, because upgrades.js has no RUDDER until 1F. 2A should switch it to RUDDER.values[0] (§3.1: no second 0.35).
3. playerTurn already reads input.steer and state.grabbed (null / false in Stage 0, so nothing changes), and G.steer actually sets input.steer. The test hook can therefore drive it.
4. ACT_NAMES[3] and the Voyage III card colours are §11.2 Stage 3 items. I added them early so the ?kraken=1 preview is legible; without the flag nothing changes. The 9-pip layout is left to Stage 3 (see open issues).
5. The overlay skeletons carry the 'town' class and the tavern's dock-panel / dock-head / dock-tabs / up-list markup, so 1O builds on the house style.
6. G.launchBomb() now returns the bomb (no test reads its return value).

### Hook requests

- docs/kraken-seas/SPEC3.md §0.2 'Measured draw calls today' and §14's 'Today' column (coordinator, re-base): replace the pre-fix numbers with the ones re-measured on 933395c with the same method (?quality=low, 1280x720, SwiftShader; newGame(n), intro 0, 1 s stepped, frozen, 2 frames).
  - Level starts: L1 290, L2 211, L3 169, L4 235, L5 189, L6 202.
  - Shipyard view (from the title, 12 samples over the sway): 286–292.
  - Town walk view (30 spots x 8 headings, 2 prize ships): max 349, min 28, mean 159.8.
  - Why: the old numbers (299/274/271/297, town 371, shipyard 297–341) were measured differently and can't be compared. The probe is /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/0/drawprobe.cjs.
- style.css, owned by 3A in Stage 3 (it is the title-card layout of 'nine cards in three groups'): when LEVELS has 9 levels, maxStars is 9. The difficulty pill (word + 9 skulls) is then wider than a card in the 3-column grid at 1280x720, so cards 3, 6 and 9 are cut off at the panel's right edge (seen with ?kraken=1).
  - Fix: shrink the skulls / gap, or let the pill wrap, when the grid has 9 pips. Re-check every F01 size for no page scroll (§6.6).
  - 390x844 (one column) is fine.

### Verification

All runs used NODE_PATH=/opt/node22/lib/node_modules, SwiftShader args, ?quality=low.

1. Full suite: cd /home/user/First-project && npm test on the published tree.
   - Exit 0 in 51m31s; 1214 PASS lines, 0 FAIL; no test file edited.
   - Node: combat 102, armory 35, cosmetics 70, walk 74, mechanics 121, upgrades 37, server 14.
   - Browser: smoke 94, controls 232, audio 50, battle 182, levels 73, town 130.
   - Log: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build/0/npmtest.log
   - The Node suites were also run right after the shipTypes / FEAT_PRIZE_TYPES change, all green.

2. Draw calls with drawprobe.cjs, same probe, run on a git-archive copy of HEAD (base) and on the Stage 0 tree (dev == the published src):
   - Six level starts: base 290, 211, 169, 235, 189, 202; Stage 0 the same numbers exactly.
   - Shipyard view (12 samples): base 286–292; Stage 0 286–292, the same sequence.
   - Town walk view, 30 spots x 8 headings = 240 samples:
     - Base: max 349, min 28, sum 38348. Stage 0: max 349, min 28, sum 38361.
     - Single samples differ by up to ±7, and so do two base runs against each other (base vs base: max |diff| 7, sums 38348 / 38343). That is townsfolk walking in real time, not a change.
   - Within ±2 on every aggregate. No page errors in any run.

3. Seeded replay (sameprobe.cjs), comparing HEAD with the repo:
   - Math.random replaced by mulberry32(12345); every level played 45 s frozen and stepped, with weaving turns, sail changes, broadsides every 0.75 s and boarding presses. Snapshots every 5 s.
   - Level 1 still in play (wave 1, 85 gold, hp 109); level 3 (lava bombs) hp 12; level 6 shipwrecked.
   - Result: IDENTICAL, 57 of 57 snapshots bit-equal; 0 page errors on either.

4. s0probe.cjs on the published repo: 19 PASS, 0 FAIL.
   - No flag: 6 levels, 6 cards in 2 groups, WITH_KRAKEN false.
   - Every Appendix A id exists, none shows, all in the listed places.
   - ?kraken=1 at 1280x720 and 390x844 (touch):
     - 9 cards in 3 groups, 'Difficulty 9 of 9'.
     - Levels 7, 8 and 9 each start with one cutter, 6 spawns, 4 crate spots, the enemy at 75 u.
     - Draw calls 3 s in: 95/97/90 (1280) and 93/95/90 (390).
     - Sinking the cutter: level 7 → 'The Turtle Atolls cleared!' / 'Sail to The Cape of Storms'; level 8 → cleared; level 9 → Victory with the Kraken Tamer text and no sail-on button.
     - No page errors or console warnings.
   - Seams:
     - G.steer(0.5) turns a stopped ship 0.2450 rad in 1 s (half of 1.4 × 0.35); steer(null) stops it.
     - launchBomb(spec) for geyser, shell, ink, slam, lava and lightning: 6 placed, all landed.
     - The placeholders return safe defaults.
     - Keys 2 → chain, 4/5/Numpad6 do nothing, 3 → grape, 1 → round.
   - An earlier run caught a crash (a lava spec bomb with no volcano had no whistle). It was fixed by guarding the whistle, then re-run green.

5. compose.test.cjs (scratch): 29/29. The composed state equals a.state + m3 for none / convoy / floes / current / spouts / current+flagship; objective, bonus, minimap, summary, avoid, drift, holdFire and steer equal a's; the fake-part rules hold; junk never throws.

6. Screenshots, viewed with Read:
   - The title with ?kraken=1 at 1280x720 and 390x844, three critique rounds:
     - Round 1: cards 7–9 were white with unreadable white names.
     - Round 2: added the three sea gradients. The Atolls name was still low-contrast on a pale sky.
     - Round 3: deepened that sky. Readable now.
     - The 9-pip overflow at 1280 remains; it is a hook request for Stage 3.
   - The no-flag title (unchanged).
   - Level 7 at 1280 and 390, level 8 at 390, level 9 at 1280 and 390: each palette reads correctly (turquoise noon, stormy sunset, moonlit sea with cyan foam).
   - The level 9 Victory at 390.

### Open issues

- With ?kraken=1, the 9-skull difficulty pill overflows the 3-column title grid at 1280x720 (cards 3, 6 and 9 clipped). Stage 3 layout work; see the hook request.
- The SPEC3 §0.2 and §14 baselines in the doc still show the old numbers; the re-measured ones are in the hook request. My probe's method gives lower level-start numbers than the SPEC's old ones (for example L1 290 vs 299), so Stage 3 and 4 budget checks should use the same probe.
- The new storage records (-powder, -island, -quiz, -settings) are not read or written in Stage 0, deliberately. 2A and 3A must load them with loadRecord once the Stage 1 parsers land.
- The ctx3 members flee, explode, douse and surrender are no-ops, warnBonus() returns 0, and the new bomb kinds land as a plain splash. 2A fills them in (§11.2).
- TURN_LOW (0.35) in main.js should become upgrades.js RUDDER.values[0] once 1F exports RUDDER (2A).
- Ship models for shark, bombketch, ironclad, fireship, skiff and inkheart don't exist yet. ships.js buildShip throws for them, so G.spawn of those types fails until 1H lands, and a feats record with prizes of those types would break the town's prize ships. Neither can happen in normal play in Stage 0 (the ?kraken=1 stub levels use cutters only).