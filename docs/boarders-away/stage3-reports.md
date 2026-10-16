# Stage 3 reports (data, written by the build agents; trust the code over these notes)

## 3A Integrator (acts & town)

### Summary

3A (acts & town) is done. The town is wired into the live game, and the title and Victory screens now cover both acts. main.js, index.html and style.css were developed as copies, tested against a full mirror of the repo, and published atomically at 00:27 (cp to a temp name, then mv). The live files are byte-identical to the tested copies.

Town wiring follows 2C's recipe, applied by function anchor to the current main.js (it uses armoryCfg):
- Keys: townMode.onKey runs first in dock mode, right after the Tab trap, so Esc closes the Harbour menu and the All aboard dialog. The shipyard's ←/→ view nudge works only in the 'shop' view. Keyup is routed too.
- Pointers: canvas down and move go to townMode outside the shop view; up, cancel and lost capture go to townMode and also end the dock drag.
- Camera: updateCamera's dock branch is `if (!townMode.update(dt, visualTime)) updateDockCamera(dt)`. resize() calls townMode.onResize().
- Context loss: an open Harbour menu or All aboard dialog is closed when the context is lost, and the recovery text says "The town will be back…". On restore, townMode.onContextRestored() puts focus on #town-screen, or on the open panel's tab.
- Crew looks: restyleCrew() (env.setCrewStyle with crewOpts) runs on every openDock, after hull paint, and after wardrobe changes made through the test API or another tab.
- closeDock calls townMode.close(). dockExitList() feeds the shipyard footer, the Harbour menu and All aboard; their leaveDock calls titleShown(), keeping the FLOW-1 double-click guard.
- nextRumour(): the next level after 'levelDone' or 'won', this level after 'over' or 'quit', otherwise the highest unlocked level.
- Prize ships: the two most valuable captured types fly your flag, through ctx.prizes.
- showShipyard / hideShipyard, the town-mute button kept in sync, and the whole __game test API (town, wardrobe, dock.view, dock.ashore, dock.back, armory, setFeats).
- One-time tip bit 16: the Go ashore button pulses on the first shipyard visit (reduced-motion safe).

Wardrobe persistence (FLOW-2): wardrobeBuy saves the look record first; only after that save succeeds does it take the gold and save the chest. If storage refuses, it returns {ok:false, reason:'storage'} and changes nothing. Main's own buyArmory is kept. Wearing an item saves it, and with storage blocked it still lasts for the visit. I also added syncLook (plus a LOOK_KEY branch in the 'storage' listener), so a write in one tab never drops an item bought in another (the ECO-2 rule across tabs).

Acts (SPEC2 §5.6):
- Level cards in two groups, under the h3.act-head headings "Voyage I · The Old World" and "Voyage II · The Far Seas". Each card shows the difficulty word with skull pips (role=img, aria-label "Difficulty N of M"). Locked cards show "Beat the Molten Maw" on card 4 and "Locked" otherwise.
- With a single act (WITH_ACT2 false) there are no headings and the pips count out of 3.
- Locked cards and the headings take no clicks, so a click there lands on the grid. This keeps the FLOW-1 double-click check passing at the sizes it tests.
- Layouts: three per row on desktop and landscape, one row per card in portrait. If the panel scrolls, Set sail! and Shipyard stay in view at its bottom (sticky). The 1280x720 title fits without scrolling.
- The tagline and meta description mention the Far Seas.
- Victory screen: #won-text comes from def.finaleText. When a level follows, #act2-btn "Sail on to the Far Seas" is first, Main menu becomes a smaller alt button, and a #won-hint line says Enter sails on. Enter on the won screen calls nextLevel(), keeping the voyage gold; after the last level it goes to the title. After level 6 the legend text shows and #act2-btn is hidden.
- The victory banner reads "The Old World is yours" when a level follows the finale.

Play-through, run in the real game at 1280x720 and 390x844 touch, every step passing and every screenshot looked at:
- Title → shipyard (focus on Upgrades, Go ashore shown) → Go ashore (walk view, focus on #town-screen, the live text announces it).
- Places bar → walks to Polly's: try on the plume, Buy (chest 700 → 520, look record and chest saved, worn), navy coat, red-stripe crew (the line-up and all 6 cleaning-crew sailors wear it).
- Back to town → tavern: Long grapples bought (saved, coils on the docked ship).
- All aboard: Esc closes it; Esc opens the Harbour menu and Esc closes it; Back to the title puts the town away.
- After clearing level 1: All aboard offers "Set sail for Bali Islands | Main menu" and starts level 2, with the plumed captain at the helm.
- Level 3 beaten via __game → Victory with Sail on → Enter → level 4 with the voyage gold, then levels 5 and 6 started.
- At least three critique rounds on the visuals: the title at 7 sizes (fixed a 320x480 overflow, the landscape card layout and the fit at 1280x720), and the won-screen button sizes.

### API notes

main.js now does:
- Imports createTownMode, plus wear and buy from cosmetics.js, renamed wearItem and buyItem.
- Adds the helpers restyleCrew(), setLook(next), wardrobeWear(id), wardrobeBuy(id), nextRumour(), prizeShips(), showShipyard(), hideShipyard(), dockExitList(), syncLook() and saveLook(). These sit after updateDockCamera, and createTownMode(ctx) runs there too.

ctx follows 2C's §9.1 shape, with these differences:
- armory.buy is main's own buyArmory (it returns a bool).
- leaveDock is wrapped so a way out to the title calls titleShown().
- prizes is passed (ctx.prizes: the two most valuable types in feats.prizes, with your flag look).
- log returns [].

__game additions:
- wardrobe.wear(id) and wardrobe.buy(id) return {ok, reason}. buy works only in the dock; its reason can be 'storage' or 'closed', besides the cosmetics.js reasons.
- town: the getters active, view, pos, place, walk and captain; the methods setMove, walkTo, goTo, interact, open, back and simulate; and town.api (townMode's own hooks: the wardrobe's tab, click, buy, surprise and paint, tavern.buy, lineup, trial, auto, speed, prompt, town).
- dock.view is 'shop' | 'town' | 'tailor' | 'tavern'. dock.ashore() and dock.back() are added.
- armory.set and armory.buy now also refresh the open tavern panel. setFeats saves a re-sanitized look via saveLook and refreshes the panels.

DOM and CSS:
- New elements: #won-hint (p.hint, hidden), .act-head.act-1 and .act-2, and in each card .lvl-diff > .diff-word + .lvl-pips[role=img] > .skull(.on).
- Locked level cards and act headings have pointer-events: none.
- #menu-screen .menu-actions is sticky at the bottom of the panel.
- #again-btn gets the class 'alt' when #act2-btn shows.
- .dock-ashore.pulse plays the one-time Go ashore pulse; tip bit 16 is saved on the first openDock.

Behaviour notes:
- Enter on 'won' calls nextLevel() when state.level < LEVELS.length, otherwise showMenu().
- The rumour board treats dock.from 'quit' like 'over' (the level to retry).
- On context loss, an open Harbour menu or All aboard dialog is closed rather than reopened.

Draw calls (quality=low; 1280x720 unless noted):
- Shipyard: 311 (239 at 390x844).
- Walk view, two prize ships moored: spawn 117–157, plaza 133, yard 98, tavern area 29, tower 28, garden 66, s1 36, east pier looking at the prizes 236. At 390x844: spawn 142. All within the 450 budget.
- Polly's: 41. Tavern view: 66 (54 at 390x844).
- Level starts, fly-in / chase camera: L1 323/311, L2 265/234, L3 120/181, L4 274/237, L5 272/263, L6 284/243. Every Act II start is within 310 (at 390x844: L4 238, L5 215, L6 214).

Screenshots and probe drivers are in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/stage3/3A/ (play.cjs, edges.cjs, finale.cjs, pointer.cjs, title.cjs, flow1.cjs, draws.cjs, actcalls.cjs, act1only.cjs; sync.sh builds a mirror root; suite.sh runs every suite separately).

### Hooks applied

- 2C → src/main.js: applied items 1–16 of the Stage 3 wiring recipe by function anchor, with the FLOW-2 correction: the look record is saved before any gold is taken, and main's committed buyArmory is kept instead of the recipe's version. Two parts were already in main from Stage 2: item 2 (buildPlayerMesh passes armory.up.grapple) and the look/feats/armory loading. Additions beyond the recipe: syncLook for purchases made in another tab, ctx.prizes, titleShown() on the dock's ways out, and closing an open Harbour menu or All aboard dialog when the WebGL context is lost.
- 1B → src/main.js: applied. env.setCrewStyle((role, seed, base) => crewOpts(look, seed, base, hull paint)) runs on every openDock and after every crew-look change (hull paint, __game.wardrobe, another tab). townMode restyles the crew itself after changes made in its own panels. wardrobe.wear and wardrobe.buy keep the records as specified, with the save-first order. The helm captain and the boarding party were already wired in Stage 2.
- 1I → src/main.js: applied. env.setPrizes runs on entering the town through ctx.prizes: the two most valuable types in feats.prizes, each with the player's LOOKS.flag entry. setCrewStyle runs on openDock and after crew-look changes. setShip is only called when the ship changes (placeDockShip, as before).
- 1D → src/main.js (dock rebuild with armory.grapple): already in buildPlayerMesh. Verified: Long grapples bought at the tavern show 2 coils on the docked ship.
- 1H (optional) → setEnvironment passes reducedMotion into build(): already in place.
- 2D / 2A-1 → emitShipFx (no smoke from the boarded ship from 'hook' on): already applied in the Stage 2 fix pass (SMOKE-HOOK, `boarding.active && boarding.target === s`). Nothing further needed.
- 1E → audio.setScene('town') on going ashore and 'dock' when the shipyard comes back: townMode does both itself, so main needs no change.
- Stage 2 fix report, open issue (put the #banner rect in pops' avoid list): not applied. The verifier asked for the banner to be left alone, it is not a Stage 3 item, and at 568x320 it would also need the touch pads passed in. Left for Stage 4.
- 1F, Stage 1 open issue (the level banner sitting off the left edge in headless screenshots): not reproduced. The level 2, 4 and 6 banners in my 1280x720 and 390x844 screenshots are centred.

### Hook requests

- src/townMode.js / src/town.js (3D), optional: at 1280x720 the walk camera at spawn is cramped. It cranes down over the captain's head and shows mostly pier planks and the rail (shots/1280x720-2-ashore.png, draws-spawn.png). The 390x844 spawn view is fine (390x844t-2-ashore.png). Consider a wider spawn pose or easing the crane-up on wide screens.
- src/env/sparrow.js (3D), optional: from the east pier, the moored galleon prize looks as if it sits slightly above the water (shots/draws-east.png). Worth checking its waterline at the prize berth.

### Expected test changes

- tests/smoke.cjs:115 `cards.length === 3` → `cards.length === 6` ("6 level cards"). Fails now: '3 level cards (…6 cards…)'. §11.4. Caused by WITH_ACT2 = true and the six cards in two acts.
- tests/smoke.cjs:116 and :117: extend to all six cards (`cards.slice(1).every(c => c.locked)`; /Tricky/, /Tough/, /Legendary/ on cards 3–5). Both still pass today because they only look at the first three cards. §11.4.
- tests/smoke.cjs ~496 (the `exits` part of 'the shipyard shows the chest … and the way back'): 'Back to the title' → 'Set sail for Doubloon Bay | Back to the title'. Fails now with exactly that new text. §11.4: after the Molten Maw the dock can sail on to Act II.
- tests/smoke.cjs ~538 (draw-call loop `n <= 3`) → `n <= G.LEVELS.length`. Passes today; §11.4 asks for the change.
- tests/smoke.cjs ~552 (bot loop `n <= G.LEVELS.length`) → `n <= 3`. Fails now: 'bot captain clears every level', because the Act I bot now also plays levels 4–6 and lost level 6 to the Phantom ('over'). §11.4: Act II has its own bot in tests/levels.cjs.
- tests/smoke.cjs ~624 `unlockedCards === 3` → `=== 4`. Fails now: 'all levels unlocked on the menu after winning' (with the bot loop at n <= 3, beating the Molten Maw opens Doubloon Bay). §11.4.
- tests/controls.cjs ~369 'saved data (too large)': `unlocked: 3` → `unlocked: 6`. Fails now: 'levels 6 … 6 cards' (a stored '7' clamps to LEVELS.length = 6). §11.4.
- tests/controls.cjs ~1181 ('keyboard: M mutes and unmutes in the shipyard and says so; Shift+Tab reaches the sound button…'): the first Shift+Tab from the Upgrades tab now reaches #dock-ashore-btn, which sits before the tablist (SPEC2 §7.1). Change: press Shift+Tab once and expect 'dock-ashore-btn', then press it again for 'dock-mute' (2C's proposed fix). Today the test's Enter goes ashore, so the next 7 keyboard checks fail as a cascade: 'Tab goes through every Buy button…', 'Enter on a Buy button buys…', 'holding Enter on Buy buys once…', 'Space on an out-of-reach Buy button…', '→ moves to the Paint tab…', 'Tab reaches all 0 paint swatches…', 'Enter on "Back to the title" leaves the shipyard'. Verified: with that one test change, controls.cjs against my build has 209 PASS, and its only failure is the 'too large' check above.

### Verification

- `node --check src/main.js`: OK. The live main.js, index.html and style.css are byte-identical (cmp) to the copies the mirror runs tested.

Full suite on the live repo, after publishing (suite.sh: each suite run separately, not &&-chained), 00:45–01:24, load average 10–13, WITH_ACT2 = true as 3B left it:
- combat 102, armory 35, cosmetics 70, walk 66, mechanics 120, upgrades 37, server 14: all pass.
- smoke: 90 PASS, 4 FAIL. All four are §11.4 items: the 6-card count, the won-dock exits, the bot over 6 levels, unlocked cards after winning.
- controls: 201 PASS, 9 FAIL. One is §11.4 ('too large'); the other 8 come from the one Shift+Tab cause.
- audio: 50 PASS ('all audio checks passed').
- battle: 153 passed, 0 failed ('All battle checks passed').
- levels.cjs and town.cjs do not exist yet (3C's).

Before publishing, on the mirror root:
- controls.cjs gave the same 9 failures.
- A copy of controls.cjs with only 2C's Shift+Tab change gave 209 PASS, with 1 FAIL ('too large', §11.4).

Probes in the real game (scratchpad 3A), all PASS, no page errors:
- play.cjs, 1280x720 and 390x844 touch: 17 checks each.
- edges.cjs: 12 checks. Shift+Tab reaches Go ashore, then the sound button. W walks 2.85 u in 1 s. M mutes with every sound button in sync. P opens the Harbour menu (modal, Tab trapped) and P closes it. Context loss in town, with the Harbour menu open, and in Polly's all return focus correctly. Esc in a panel goes back to town. The Shipyard place shows the shop with focus on Upgrades and "Back to town". P and Esc do nothing in the shop. Hull paint re-dresses a crew wearing the paint uniform. With storage blocked, wearing works and buying is refused at no cost. A hat bought in one tab stays owned when the other tab wears a coat.
- finale.cjs: the won dock and All aboard both offer 'Set sail for Doubloon Bay | Back to the title', and that exit starts level 4. After level 6: the legend text, no Sail on, Enter goes to the title.
- pointer.cjs: a mouse drag turns the town camera (yaw 3.14 → 2.42); clicking the deck walks 3.29 u; the touch joystick (CDP touch events) walks 4.32 u.
- flow1.cjs: the FLOW-1 second click lands on the card grid at 1280x720, 844x390t, 1024x600, 390x844t and 568x320t.
- act1only.cjs, a mirror with WITH_ACT2 = false: 3 cards, no headings; the Molten Maw ends the voyage and Enter goes to the title.
- title.cjs at 7 sizes: no page scroll anywhere; Set sail! visible at every size; at 1280x720 the panel does not scroll.

Draw calls: see api_notes.

### Open issues

- Expected red until 3C updates the tests: 4 smoke checks and 9 controls checks (listed in expected_test_changes). levels.cjs and town.cjs do not exist yet, so the Act II bot and the town suite have not run against this build.
- smoke's bot loop currently runs over all 6 levels and lost level 6 to the Phantom ('over', 166 damage taken). That loop is due to become n <= 3. Act II balance is 3B's, and its bot (tests/levels.cjs) decides it.
- Level 1's fly-in draw count is 323–325, a little over the §12 'Act I level start ≤ 320'. This was already noted in Stage 2 (2A-1); my changes add nothing to battle scenes. With the chase camera it is 311.
- In a probe that steps the simulation without rendering frames, the final capture's 'CAPTURED! +625 GOLD' pop can still be up when the Victory screen opens (won-legend-1280x720.png). In real play the 2.5 s countdown lets it fade first. finishLevel could call pops.clear() if Stage 4 wants that.
- In portrait, the title panel scrolls inside (by 175 px at 390x844, more on small phones). Set sail! and Shipyard stay pinned at the bottom of the panel, but the key list and the best-plunder/chest line need a scroll to be seen. On 568x320 and 844x390 the second row of cards is partly under the pinned buttons until scrolled.
- On a 390-px-wide phone, 'Sail on to the Far Seas' wraps to two lines on the Victory screen. It is readable and the button stays within its panel.
- Wardrobe purchases are refused (reason 'storage') when storage is blocked or full, per FLOW-2. Wearing still works for the visit.


## 3B Balance & levels

### Summary

3B is finished. WITH_ACT2 is true, so all six levels show for everyone. I tuned Act II until my bot (bot v2, written to §11.3) clears levels 4, 5 and 6 with the mid-game profile, every level fights back, and the Maelstrom always hurts more than Doubloon Bay.

I picked up the earlier attempt's work and checked it before building on it. Its new code in mechanics.js moves a later-wave ship that main.js spawned in water cut off from the player (behind Frostbite Straits' fjord walls) to a spawn point in the player's water. That is needed: about 2 ships per Frostbite Straits run land there. It used to build its water map lazily, which stalled the game for 20–60 ms when the second wave arrived. It now builds the map in init() during the fly-in, in 3–10 ms, and gives the same answer at all ~90,000 probe points.

**Tuning, in §6.8 order**
- Changing lead or spreadMul (accuracy) barely moved damage, because most hits land at close range.
- Changing enemy crew/grit didn't help either. The privateer, raider, Phantom, man-o'-war and cutter are fixed by the §3.3 worked examples. Galleons are captured almost at once and corsairs are sunk in a broadside or two, so their crew numbers don't matter.
- BOARD.slope and RAKE are fixed by §2.1/§3.3.
- That left maxAttackers and the waves. The draw-call budgets (level start ≤ 310, busiest ≤ 450) rule out extra ships: a 4th raider in Frostbite Straits' first wave measured 312 at level start, and 6 ships alive at once measured 461.

**Final values in src/act2.js** (everything else is still the §6.4–6.6 starting value):

| Level | Change |
|---|---|
| L4 Doubloon Bay | Waves `[[galleon, cutter, cutter], [galleon, corsair]]`. The privateer left the second wave: her long broadside duels swung damage from 40 to 160. |
| L5 Frostbite Straits | Waves `[[raider, raider, manowar], [raider, raider, privateer]]`. The man-o'-war and privateer swap waves, so the straits always fight back; the spec waves had runs with 0–5 damage. |
| L6 The Maelstrom | maxAttackers 3; waves `[[corsair, corsair, manowar], [phantom, raider]]`. A raider that never fired is replaced by a man-o'-war; the raider that comes with the Phantom stays. |

**Bot results, mid-game profile** (time, damage taken, captures, boardings, raids; median [min..max])

Before (spec values, 24 runs each):
- L4: 24/24 cleared; 29 s [26..39]; damage 61 [43..156]; captures 2 [2..4]; boardings 2 [2..3]; raids 0
- L5: 24/24; 35 s [25..130]; damage 40 [5..94]; captures 3; boardings 1; raids 1 [0..2]
- L6: 24/24; 38 s [30..100]; damage 73 [0..148]; captures 2; boardings 2; raids 1 [0..1]; some runs took 0 damage
- The Maelstrom out-hurt Doubloon Bay in only 13 of 24 paired runs.

After (72 runs each, all cleared on the first try):
- L4: 27 s [24..33]; damage 43 [26..59]; captures 2 [2..3]; boardings 2 [2..3]; raids 0
- L5: 26 s [24..51]; damage 46 [21..169]; captures 2 [2..5]; boardings 1 [1..3]; raids 0 [0..1]
- L6: 43 s [35..68]; damage 136 [52..225]; captures 3 [2..4]; boardings 2 [1..4]; raids 1 [0..1]
- The Maelstrom out-hurt Doubloon Bay in 72 of 72 paired runs.
- No run took 0 damage, and the ship never ended up inside land.

**Stock ship** (still winnable, second try allowed)
- L4: 24/24 cleared, damage 92 (was 145).
- L5: 24/24, damage 120 (was 96).
- L6: 22/24, 16 of them on the first try (was 16/24 on a single try).

**Act I:** tests/smoke.cjs passes 90 checks. Its Act I bot still finds the Volcano harder than Europe (75 vs 33 damage), and every level fights back. Its 4 failures are all §11.4 checks for 3C.

**Draw calls:** Act II level starts measured 274 / 271 / 297 (spec waves: 274 / 270 / 284). The busiest frames sampled while the bot played, boardings included, were 366 / 404 / 313.

Of the other files you listed, shipTypes.js, armory.js and armory.test.cjs needed no changes.

### API notes

- **levels.js:** `WITH_ACT2 = true`, so `LEVELS` = ACT1 + ACT2_LEVELS (6 levels). The `?act2=1` switch now changes nothing.
- **act2.js:**
  - Level 4 waves `[['galleon','cutter','cutter'],['galleon','corsair']]`.
  - Level 5 waves `[['raider','raider','manowar'],['raider','raider','privateer']]`.
  - Level 6 waves `[['corsair','corsair','manowar'],['phantom','raider']]`, `maxAttackers: 3`, `nextWaveAt: 0`.
  - Everything else is §6.4–6.6. A header comment explains each change.
  - The Phantom still arrives in wave 1 after wave 0 is gone, as in the spec. The convoy keeps one galleon per wave.
- **mechanics.js:**
  - `onSpawn(e, waveIndex ≥ 1)`: a ship main placed in water cut off from the player's start is moved to an `env.enemySpawns` point in the player's water. It prefers ~80 u from the player, at least 40 u away (35 u as a fallback) and 18 u from other ships, and faces the player.
  - Wave 0 and test spawns (`G.spawn`, waveIndex −1) are never moved.
  - `init()` now builds the water map (3–10 ms per level).
  - `state` gains `relocated` (count of ships moved).
  - Settings are in the REACH table.
- **combat.js:** RAIDERS gains `gap: 3, sheer: 4`, the same values as main.js's RAID_GAP / RAID_SHEER. main.js does not read them yet (hook request).
- **Bot v2 (for 3C's tests/levels.cjs):** `/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/stage3/3B/bot2.js`. Export `botLevel({ n, profile: 'mid'|'stock'|'keep', maxT, trace })`; run it with `page.evaluate(botLevel, args)`.
  - Runner: `run.cjs` in the same folder, e.g. `node run.cjs --levels 4,5,6 --trials 24 --tries 2 --profile mid [--knobs JSON]` with `NODE_PATH=/opt/node22/lib/node_modules`.
  - Helpers: `summ.js` (summary), `pstat.js` / `pcmp.js` (P(L6 > L4)), `hurt.js` (damage by source), `layout.cjs` (level-start draw calls), `chasestart.cjs` (chase-camera starts), `BOT=./bot2s.js` (samples the busiest draw calls while playing).
  - Damage taken is the sum of hull drops; repairs are not subtracted.
- Your hp in Doubloon Bay and Frostbite Straits now always drops by at least ~20, and in the Maelstrom by ~50.

### Hooks applied

- APPLIED (2A-2 to src/combat.js): RAID_GAP = 3 and RAID_SHEER = 4 now live in the RAIDERS table as `gap: 3, sheer: 4`, with the expectation added to tests/combat.test.cjs. main.js still uses its own constants; there is a hook request below so main reads them.
- ALREADY APPLIED (1J to src/levels.js, Act I rumours): 2A-1 applied this in Stage 2. I checked levels 1–3: all three have rumour data. No change needed.
- CHECKED (1A note): armory.js armoryStats (critBase, grappleRange, reel) must stay equal to combat.js CRIT.base, BOARD.range and BOARD.reel. tests/armory.test.cjs checks this and passes (35/35). Nothing in those tables changed.

### Hook requests

- src/main.js (Stage 4 integrator; 3A is finished): delete the local `const RAID_GAP = 3;` and `const RAID_SHEER = 4;` (about lines 1499–1501). Use `RAIDERS.gap` in raiderTry (about line 1597: `state.boardCooldown > BOARD.cooldown - RAIDERS.gap`) and `RAIDERS.sheer` in updateEnemy (about line 2586: `e.boardCooldown > RAIDERS.sheer`). Same values, so behaviour does not change; raider balance then lives in one table.
- tests/levels.cjs (3C), Act II bot (§11.3): a reference implementation is at /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/stage3/3B/bot2.js (runner run.cjs). On the published numbers it clears L4/L5/L6 in 72/72 runs on the first try, and the Maelstrom out-hurts Doubloon Bay in 72/72 paired runs (L4 [26..59], L6 [52..225]). Measure damage as the sum of hull drops; repairs between hits would hide most of the Maelstrom's damage if you used final hp. Raking the Phantom's bow with grape can still take her without a scratch (by design), so the Maelstrom's lower damage bound comes from its first wave (the man-o'-war about 22, the corsairs about 40).
- tests/levels.cjs (3C), draw calls: measure the Act II level start with a fresh (stock) profile, as battle.cjs does for Act I. Published L6 start: 297 with the intro camera and 267 with the chase camera on the stock ship; 283 with the chase camera on the mid-game ship. The bot's first sampled frame read 307–313 (mid-game ship, camera still settling just after the start), which is near the 310 budget.
- SPEC2 §6.4–6.6 (Stage 4 / docs): record the tuned values. L4 waves [[galleon, cutter, cutter], [galleon, corsair]]. L5 waves [[raider, raider, manowar], [raider, raider, privateer]]. L6 waves [[corsair, corsair, manowar], [phantom, raider]] with maxAttackers 3. The README levels section (Stage 4) should match.

### Expected test changes

- tests/smoke.cjs about line 115: 'FAIL 3 level cards'. With WITH_ACT2 = true there are 6 cards; §11.4 changes the check to `cards.length === 6` plus the locked-card and Tricky/Tough/Legendary label checks (lines 116–117).
- tests/smoke.cjs about line 496: 'FAIL the shipyard shows the chest (1080 gold) and the way back (Set sail for Doubloon Bay | Back to the title)'. §11.4 changes the expected exits to 'Set sail for Doubloon Bay | Back to the title'.
- tests/smoke.cjs about line 551 (loop) / 616 (check): 'FAIL bot captain clears every level'. The Act I regression bot now loops over 6 levels; it never boards, and the Phantom cannot be sunk, so it loses the Maelstrom twice (it clears levels 1–5). §11.4 limits that loop to `n <= 3`. Its Act I checks pass: Volcano 75 > Europe 33, every level fights back, never inside land.
- tests/smoke.cjs about line 613: 'FAIL all levels unlocked on the menu after winning'. Beating the Molten Maw also opens Doubloon Bay; §11.4 changes this to `unlockedCards === 4`.
- Not run by me: tests/controls.cjs §11.4 'too large' (`unlocked: 6`) and the Shift+Tab step to #dock-ashore-btn (from 3A's and 2C's reports). These come from WITH_ACT2 / 3A's markup, not from my numbers. My tuning breaks no other existing check; battle.cjs runs on levels 1–3, whose numbers are unchanged.

### Verification

- **Node suites** (`cd /home/user/First-project; node tests/<x>.test.cjs`), final run: combat 102 PASS, armory 35, cosmetics 70, walk 66, mechanics 121 (was 120, plus the new init-mapping check), upgrades 37, server all pass. All exit 0.
- **Bot before tuning** (spec values, current code): `node run.cjs --levels 4,5,6 --trials 24 --tries 1 --profile mid` → `re-base-mid.txt`:
  - L4: 24/24, damage 61 [43..156].
  - L5: 24/24, damage 40 [5..94].
  - L6: 24/24, damage 73 [0..148].
  - Maelstrom > Doubloon Bay in 13/24 paired runs.
  - Stock-ship results are from the earlier attempt's `out-all-stock.txt`: L4 23/24, damage 145; L5 24/24, 96; L6 16/24, 133.
- **Tuning:** about 30 grids of 24 runs each (`g14.txt`–`g38.txt`, results in `out-<name>.txt`). Accuracy and crew/grit changes were measured to have little or no effect. More ships per wave were rejected because they broke the draw-call budgets: `layout.cjs` measured a level start of 312 with a 4th raider in L5 and 375 with 5 ships in L6; `BOT=./bot2s.js` sampling measured 461 with 6 ships alive in L5.
- **Bot after tuning, mid-game profile:**
  - `final2-mid.txt` (48 runs, 2 tries allowed) plus `final3-mid.txt` (24 runs, after the mechanics.js speed-up): L4 72/72, L5 72/72, L6 72/72, all on the first try.
  - Damage medians 43 / 46 / 136. Maelstrom > Doubloon Bay in 72/72 paired runs.
  - No run took 0 damage, no time inside land, no page errors.
- **Bot after tuning, stock ship** (`final2-stock.txt`, 24 runs): L4 24/24, L5 24/24, L6 22/24 (16 on the first try).
- **Level-start sanity** (`layout.cjs`, 2 page loads):
  - Draw calls: L4 274, L5 271, L6 297.
  - Every enemy starts at least 54 u from the player, no ship starts in land, and there are at least 9 spawn points per level.
- **Chase-camera starts** (`chasestart.cjs` / `chasestart-mid.cjs`):
  - Published waves: 263 / 269 / 267 with the stock ship, 279 / 285 / 283 with the mid-game ship.
  - Spec waves: 263 / 268 / 245.
- **Busiest frames while the bot played** (`BOT=./bot2s.js`, 6 runs per level, every 0.5 s of simulated time, boardings included): L4 ≤ 366, L5 ≤ 404, L6 ≤ 313. Spec L5 measured 370–375.
- **Water map check** (`reachcmp.cjs`): the old and new builds give 0 differences over 12,256–17,665 points per level. Build time is now 2.6–10 ms at init. The old lazy build measured 20–60 ms at the second wave (`reachtime.cjs`).
- **Smoke:** `node tests/smoke.cjs`, run twice (before and after the mechanics.js speed-up): exit 1, 90 PASS, 4 FAIL. The 4 failures are the §11.4 items in expected_test_changes. 'the volcano is harder than the coast of Europe', 'every level fights back', 'player never ends up inside land' and 'all levels spawn in open water' pass. The last run's log is `smoke-final2.log`.
- **Screenshots:** level starts and mid-fight frames at 1280×720 and 390×844 (`shots.cjs`), reviewed in three rounds. The new ships spawn in open water and the intro text reads '2 × Frost Raider · 1 × Man-o'-War'. The only flaws seen were in my capture method (the intro banner still showing on mid-fight frames, fixed by hiding it) or in files I don't own (camera framing).
- Not run: the full `npm test`, controls.cjs, battle.cjs, audio.cjs (outside my exit check).
- All scratch files named above are in `/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/stage3/3B/`.

### Open issues

- Act I and Act II can't be ordered on one profile, as §6.8 expects. With the mid-game ship the Volcano costs about 105 damage and Doubloon Bay 43. With the stock ship the Volcano costs about 95 on the runs it survives (9/24 runs lost) and Doubloon Bay 92. The spec starting values also had Doubloon Bay (61) below the Volcano with the mid-game ship. Inside Act II the order holds: 43 < 46 < 136 (mid-game ship) and 92 < 120 < 134 (stock ship, plus losses on L6).
- Frostbite Straits sits only just above Doubloon Bay for the mid-game bot (medians 46 vs 43). It can't get more ships: the spec waves already use 370–404 draw calls at the busiest, and one more raider pushes the level start to 312 and the busiest frame to 461.
- Maelstrom level start is close to the 310 budget in one case. The man-o'-war in its first wave costs +13 (intro camera, stock ship: 297 vs 284 with spec waves) and +22 with the chase camera (267 vs 245). The bot's first sampled frame read 307–313 (mid-game ship, camera still settling after the start). If tests/levels.cjs measures the start right after setting the mid-game profile, it could graze 310.
- main.js still uses its own RAID_GAP / RAID_SHEER constants. RAIDERS.gap / sheer exist but are unused until the hook request is applied.
- SPEC2 §6.4–6.6 and the README still show the starting waves. They need updating to the tuned values.
- The mechanics.js code that moves later-wave ships out of cut-off water changes behaviour; §6.3 allows onSpawn to move a ship to open water. It moves about 2 ships per Frostbite Straits run, and 0 on the other levels in the bot runs. Without it, ships spawned behind the fjord walls could never reach the player.
- The stock-ship bot loses the Maelstrom about a third of the time on the first try (16/24 first try, 22/24 with the second). That matches the spec waves' 16/24 first-try rate.


## 3D Town polish

### Summary

I walked the real game's town as the captain on desktop and on phone, and fixed what the screenshots showed. The fixes are published to the live repo atomically (cp to a temp name, then mv) at 09:35, and the live files match the tested dev copies byte for byte.

**How I checked.** I ran four drivers against a mirror of the live repo with my dev files on top:
- walk.cjs visits 18 spots per size. It takes screenshots and reports draw calls, the captain's height on screen, and whether any HUD control covers him or overlaps another control.
- occl.cjs walks 27 routes with the real controller. It raycasts from the camera to the captain's chest and head, and checks whether the lens is touching geometry.
- route.cjs takes shots along the auto-walk.
- play3d.cjs is a full play-through: keys, mouse, stick, taps, every place, every panel, the Harbour menu and All aboard.

I did 3+ critique rounds on 1280x720 and 390x844, plus 6 more sizes.

**Camera clipping and occlusion (sparrow.js, town.js)**
- sparrow.js now exports `walk.camBlockers`. These are camera-only volumes, as 2C asked:
  - the TAILOR arrow board, the display head on top of it and its post;
  - the welcome sign's board, its bird and its two posts;
  - the shipyard sign and its posts;
  - both leaning palm trunks, built segment by segment from palm()'s real trunk line, plus their crowns;
  - the beach umbrella;
  - the tavern's overhang, balcony and eaves over the porch;
  - Polly's awning;
  - the crane jib and the hoist hanging from it.
- The berth blocker is now 16 × 4.8, because the ship's yards reach z ±2.2.
- town.js no longer has the post heuristic. Every camera volume is padded 0.3 on all sides, top included.
- Fixes in the camera itself:
  - **Spawn:** a cut such as stepping ashore now starts from the nearest clear side when something is close behind him. At the gangplank the camera sits beside him looking along the pier at the welcome sign, instead of craning down over his hat (3A's 1280x720 complaint).
  - **Pinned:** when even the shortest boom would leave the lens inside something, the camera swings away at 5 rad/s and the boom may come in to 1.2.
- Audit result at 1280x720, same 16 routes:
  - Captain fully hidden: 22 samples → 1.
  - Lens touching geometry: 15 samples → 6.
  - Over all 27 routes: 2 hidden and 9 touching in about 1,000 samples. All are single frames near flags, ropes and lamp arms.
- The camera inside the pots-stall awning and the camera inside the tavern wall are gone.

**Bunting near Polly's (and the tavern).** The plaza-to-Polly's string hung at walk-camera height and sat in the crew line-up shot. It and the plaza-to-tavern string now run from two new 5.5 m masts at the plaza's south corners up to Polly's roof eaves and the tavern's upper-floor corner. They are now above the walk camera, and the audit no longer finds them in the way. The random stream used to build the town is unchanged. The shipyard view still reads 313 draw calls and 1,449,072 triangles.

**Portrait captain size (§7.3).** The walk-view lens is 60° in portrait; landscape still uses setLens(). On a 390x844 phone the captain is now about 1.7× taller than with the old 90° lens. At 8 sizes, the HUD check finds no control overlapping another, every control at least 44 px, and no page scroll.

Two prompt fixes came out of the same check:
- **Short portrait phones (≤780 px tall):** the prompt moves to the top. Above the stick it hid the captain at 320x480 and 360x640.
- **Short landscape (≤560 px tall):** the prompt also moves to the top, and the chest shows its icon only there. At 568x320 the prompt had hidden him almost completely. The keys legend steps aside while the prompt shows.

**Other fixes**
- `env.cheer('polly'|'snips'|'tailors', s)`: Polly cheers when you buy something.
- The prize ships sit 0.45 deeper in the water (3A's waterline request).
- Speech bubbles stay on screen, with the tail still pointing at the speaker.
- A tap on a corner shut in by props now walks as close as he can get. Before, nothing happened. A flood-fill found about 2.5% of the free deck in such pockets.

**Walk data.** The fixture is regenerated from the live env.walk and matches it. walk.test.cjs has 5 new checks for the camera volumes and passes 71/71.

The open backs flagged in Stage 1 are fixed and none showed up again. I found no holes in any of the screenshots.

### API notes

**env.walk (sparrow.js)**
- New field `camBlockers`, placed between blockers and places. There are 37 entries, each either `{x,z,w,d,ry,y0,y1}` (a box) or `{x,z,r,y0,y1}` (an upright cylinder), in world units. They are for the walk camera only; walk.js ignores them.
- The berth blocker is now `{x:0,z:0,w:16,d:4.8,h:10}` (it was 15 × 3.4).
- Two new mast blockers: `{x:±8.25,z:-14.68,r:0.12,h:5.6}`.
- Fixture totals: blockers 108, places, spawn and the other areas unchanged.

**env.cheer(who='polly'|'snips'|'tailors'|'all', seconds=1.5) → bool**
- Plays 'cheer' on Polly and/or Old Snips for that many seconds (capped at 10).
- townMode already calls `env.cheer('polly', 1.6)` on every wardrobe purchase.

**Other sparrow changes**
- Prize ships sit `PRIZE_SIT` = 0.45 below the wave height.
- The two plaza-corner bunting strings hang from new masts, about 5.5–6.8 u above the sea.
- `walkDebugLines` (`?walkdebug=1`) also draws the camera volumes, in orange.

**town.js camera**
- The post heuristic is gone. The camera's no-go volumes are:
  - tall walk blockers: h ≥ 2, and either r ≥ 0.45 or boxes with both sides ≥ 0.6;
  - every camBlocker.
  - All of them are padded by `CAM.pad` = 0.3 on the sides, the top and the bottom.
- On a cut (enter or a teleport) with the boom short (hit < 0.75), the camera takes the nearest clear yaw, searched in 0.2-rad steps out to ±1.8.
  - At the spawn this gives camera yaw −1.74 while the captain faces π: the camera is beside him and slightly behind, looking along the pier.
- When pinned, it swings to the clear side at 2.2 rad/s, or 5 rad/s if the lens would be inside something. In that case the boom may come in to `CAM.closest` = 1.2.
- Walk-view lens in portrait: `camera.fov = CAM.fovPortrait` (60). In landscape the lens stays setLens()'s value.
- `walkTo(x, z)`:
  - If the snapped target can't be reached, it walks to the nearest reachable graph node within 4 u.
  - It returns true when it found a way, so a tap on a shut-in corner now walks.

**townMode.js and town.css**
- Speech bubbles are kept on screen. The CSS variable `--tail` moves the bubble's tail so it still points at the speaker.
- On touch screens in portrait up to 780 px tall, `#town-prompt` sits at the top: 60 px below the safe-area top, under the chest and the corner buttons.
- In any landscape view up to 560 px tall:
  - the prompt sits at the top, between the chest and the corner buttons (left 150, right 132, 16 px font);
  - the chest label is visually hidden (it is still read out);
  - `#town-keys` takes `visibility: hidden` while the prompt shows.

**Measured draw calls (walk view, quality=low, two prize ships moored)**
- 1280x720, 18 spots: max 413 (the garden, looking across the whole town); spawn 216.
- 390x844: max 273.
- 844x390, 568x320 and 1024x600: max 415.
- Polly's 41–46; crew line-up 53–61; tavern 54–66.
- Shipyard view: 313 calls, 1,449,072 triangles.

**Captain height on screen** (approximate, from a projected 1.95 u figure)
- 1280x720: 187 px.
- 390x844: 171 px; with the old 90° lens it would be 99 px.
- 320x480: 98 px.
- 568x320: 83 px.

### Hooks applied

- 2C → src/env/sparrow.js, walk.camBlockers for the TAILOR arrow board and the welcome sign's board: APPLIED. Both are there, with their posts, the display head and the sparrow too. I also added camera volumes the in-game audit turned up: the shipyard sign, the palms, the umbrella, the tavern overhang/balcony, Polly's awning and the crane jib with its hoist. Then I dropped town.js's thin-post heuristic, as requested.
- 2C → src/env/sparrow.js (optional), env.cheer so Polly cheers on a purchase: APPLIED, as env.cheer(who, seconds). townMode's existing call env.cheer('polly', 1.6) now works; the play-through checks that it fires and returns true.
- 2C → src/env/sparrow.js (optional), raise the bunting from the plaza to Polly's: APPLIED. The string now runs from a 5.5 m mast at the plaza's south-east corner up to Polly's roof eaves. It was also in the crew line-up shot, and now isn't. For the same reason the plaza-to-tavern string got a matching mast.
- 3A → src/townMode.js / src/town.js (optional), the cramped 1280x720 spawn view: APPLIED. A cut with something close behind him now takes the nearest clear side (town.js updateCamera, snap path), so the spawn looks along the pier at the welcome sign. The berth blocker was widened so the camera also keeps off the docked ship's yards.
- 3A → src/env/sparrow.js (optional), the galleon prize sitting high: APPLIED. Prize ships now sit 0.45 deeper (PRIZE_SIT); I picked the value by comparing close-ups at 0, −0.3 and −0.5 (shots/prize-grid.png).
- 2C open issue (portrait walk view: the captain is about 95 px on a 390x844 phone): APPLIED in town.js. The walk-view lens is 60° in portrait. The HUD/captain sweep at 8 sizes found no control overlapping another or under 44 px, and no page scroll. It did find the prompt covering the captain on short phones and short landscape; that is fixed in town.css (prompt moved to the top).

### Hook requests

- tests/town.cjs (3C), the spawn camera: §11.3 says 'captain at spawn, camera behind'. At the gangplank the docked ship is directly behind him, so the camera now starts beside him: yaw ≈ −1.74 while he faces π. Suggested check: the camera is in his back half-plane, i.e. dot((camera − captain) on the ground, his forward) ≤ 0.2. Or check 'behind' after walking onto the plaza and pressing C. Pressing C with the ship right behind him swings the camera aside again within a few frames. That is intended.
- tests/town.cjs (3C), layout: on touch screens in portrait up to 780 px tall, and in any landscape view up to 560 px tall, #town-prompt is at the top of the screen, not above the places bar. In short landscape the chest shows its icon only, and #town-keys is visibility:hidden while the prompt shows. A check that the prompt sits 'above the places bar' must allow this. My probe's overlap test treats visibility:hidden elements as absent.
- tests/town.cjs (3C), optional extra checks:
- - In the portrait walk view, __game.camera.fov === 60.
- - __game.town.walkTo(16.8, -14.9) (a corner of the yard shut in by props) returns true and starts walking. Before this change it returned false.
- - env.cheer('polly', 1) returns true.
- - env.walk.camBlockers is a non-empty array.
- Stage 4 (README / docs): the town's camera-only volumes (walk.camBlockers) and the 60° portrait walk lens are new behaviour worth one line in the town section.

### Expected test changes


### Verification

**Node**
- `node tests/walk.test.cjs` on the live repo after publishing: 'All walk checks passed (71)' (was 66).
- `node --check` passes for sparrow.js, town.js and townMode.js.
- The live files are byte-identical (cmp) to the dev copies that were tested.

**Fixture**
- dumpwalk.cjs against the live repo: JSON.stringify(env.walk, null, 1) plus a newline equals tests/fixtures/sparrow-walk.json ('same as the mirror fixture: true').
- Before any change, the old fixture also matched the old live walk data.

**Existing suites** (fresh mirror = live repo including 3E's published files, plus my dev files)
- tests/controls.cjs: 201 PASS, 9 FAIL. The 9 are exactly 3A's known list: 'saved data (too large)' (§11.4) and the 8 keyboard checks cascading from the Shift+Tab-to-#dock-ashore-btn change.
- tests/smoke.cjs: 90 PASS, 4 FAIL. All four are 3A's known §11.4 items (6 cards, the won-dock exits, the bot over 6 levels, unlocked cards).
- smoke dock checks: 'draw calls at the dock stay within the budget (297 of 450)'; '1450096' triangles, under the 1.5M limit; 40 people, 6 crew.
- An earlier smoke run timed out at line 131 (level 1 fly-in) at load average about 20 while my audits were running. The re-run at lower load passed as above.

**Real-game play-through** (play3d.cjs, all PASS, no page errors)
- On the live repo at 1280x720:
  - Go ashore gives the walk view, with focus on #town-screen.
  - W walks 2.65 u in 1 s; Shift+W sprints 3.76 u from a standstill; ← walks; C puts the camera behind him in the open plaza.
  - A mouse drag turns the camera 0.72 rad; a click on the deck walks there (ends within 0.1 u); a click on a shut-in corner walks to the nearest reachable spot.
  - The places bar walks to Polly's and opens the wardrobe. Buying the plume takes the chest from 700 to 520, the hat is worn, and env.cheer('polly') is called and returns true.
  - Crew tab line-up; tavern; Shipyard place opens the shop, whose button reads 'Back to town'; All aboard?; ☰ opens the Harbour menu.
- The same on the mirror at 1280x720 and at 390x844 touch. On touch, the stick walks 5.0 u and a tap on the deck walks there.

**Draw calls and HUD** (walk.cjs, all 'errors: none')
- Walk view max 413 at 1280x720 (18 spots) and 273 at 390x844 — all within 450.
- HUD/captain sweep at 320x480 (touch and desktop), 360x640t, 390x844t, 568x320 (touch and desktop), 844x390 (touch and desktop), 1024x600 and 1280x720: 'hud-ok' everywhere, and the captain is under no HUD control. This is after the prompt fixes; before them he was under the prompt at 320x480t, 360x640t and 568x320.

**Occlusion audit** (occl.cjs: raycasts every 0.2 s of simulated walking, about 1,000 samples per size)
- Baseline, live code, 16 routes at 1280x720: 22 samples with the captain hidden, 15 with the lens touching geometry. Worst culprits were the TAILOR board (22) and the tavern balcony.
- Final code, 27 routes:
  - 1280x720: 2 hidden, 9 touching.
  - 390x844t: 4 hidden, 9 touching on the version before the masts were raised. Re-audit of the 10 routes near the bunting after raising: 1 hidden, 3 touching, and no bunting hits.
- What remains are single samples near lamp arms, flags and ropes.

**Visual review**
- At least 3 critique rounds of screenshots: base and v1–v3 spot grids, route grids r2/r3, play-throughs p1–p3, final grids f1 at both sizes, the size sweeps sz/sz2/sz3/sz4, showcase before/after, and prize close-ups.
- I looked at each one. The fixes in this report came out of what they showed.

### Open issues

- The town has small pockets that props shut in completely, about 2.5% of the free deck:
- - the strip south of the lookout tower;
- - behind the slipway in the yard;
- - behind Polly's shop;
- - a couple of yard corners.
- A tap there now walks to the nearest reachable spot. The pockets themselves are still unreachable. The east end of the pier past the coil and barrel can be reached with the keys, but the path graph (0.8 grid) misses the narrow gap, so a tap there also uses the fallback. walk.js is unchanged.
- Spawn camera: it now starts beside the captain, with the docked ship's sail filling the left edge at 1280x720. That is a deliberate trade against the old view, which craned down onto his hat. 3C's 'camera behind' check needs the tolerance given in hook_requests.
- Leftover camera hits from the audit: single samples where the captain is hidden or the lens passes within 0.35 of geometry. They come from the other plaza bunting strings (3.4–3.9 u high), lamp arms, the welcome sign's posts and the garden umbrella rim. They are only seen for a moment, and I left them.
- Townsfolk may still walk between the camera and the captain (for example the walker on the plazaS1 bridge, or the dancing kid by the fiddler). Per §7.3 they are culled only within 1.0 u of the lens.
- Draw calls in the garden spot, with the camera looking across the whole town, are 413 at 1280x720 and 415 at the landscape phone sizes. That is within 450 but the closest to the budget. If 3E's or Stage 4's art additions push it over, §12's drop order (prize ships first, then townsfolk beyond 30 u) applies through the cull radius in townMode.cullNow.
- Not run: the full npm test chain, battle.cjs and audio.cjs. I touched no battle code or audio. levels.cjs and town.cjs do not exist yet (3C's).
- Probe drivers in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/stage3/3D/:
- - walk.cjs, occl.cjs, route.cjs, play3d.cjs, prize.cjs, showcase.cjs, whatis.cjs, dumpwalk.cjs (regenerates the fixture from the live env);
- - pockets.mjs and flood.mjs (walk reachability);
- - sync.sh (builds a mirror root);
- - logs: occl-*.log, f1-*.log, p3-*.log, controls-root3.log, smoke-root3.log;
- - a base/ snapshot of the pre-change files.


## 3E Art fixes

### Summary

3E art fixes are published. Nine files were changed in a scratch copy, tested against a full mirror of the repo, then moved into the live repo atomically at 08:28:56 (cp to a temp name + mv): src/ships.js, src/boarding.js, src/tags.js, src/pops.js, src/overboard.js, fx.css, src/env/doubloon.js, src/env/frost.js and src/env/maelstrom.js. people.js and audio.js needed no change. The live files are byte-identical to the tested copies.

I played the real game: level starts 1–6 at 1280×720, 390×844 touch and 568×320 touch; a boarding on every level (attack, a raider boarding you on L5, the Phantom finale on L6, a capture, reduced motion); and the Maelstrom's lightning with and without reduced motion. I made at least three critique rounds on the screenshots. What changed:

1. **Boarding set-piece readability.** In game, the boarding camera sat beyond her deck, so her sails hid your ship and the swing. A cutter's lugsail covered both decks. Now:
   - The sails of the ship whose deck the brawl is on turn see-through (opacity 0.22, ink lines faded with them) while the boarding view is on. They come back as the camera eases out, or at once on clear().
   - The camera was retuned. Desktop: distance 14, elevation 1.0, leaning less toward her deck. Portrait: distance 15, elevation 1.1, a little more astern, framed lower.
   - Both decks, the swing and the brawl now show at 1280×720, 390×844 and 568×320.
   - The boarded ship's floating tag hides while the view is on, so it no longer sits under the boarding strip. boarding.js sets ship.tagHidden and tags.js reads it.
   - Hook requests applied: throwOver(ship, side, opts, { along }) in overboard.js, the Math.random pin removed from boarding.js, and heave() only counts in your own attack's reel.
2. **Tags.** The name now sits on an ink tab joined to the top of the bar card: cream letters on ink. Before, it was pale text floating a bar's height above the card. It reads over sky and sea at every size.
3. **Pops.** They keep off the battle HUD's own pieces, found in the DOM by pops.js itself:
   - The pieces: the level / "X sunk!" banner (a soft obstacle, weight 0.3), the minimap, boss bar, boarding strip, objective pill, hint, gun card and touch pads.
   - "−N CREW" joins the volley's damage pop as its second line.
   - A pop with no clear spot waits up to 0.6 s for room. If none comes, POINT BLANK!, SAILS SHREDDED! and the rake words (the HIT mark's stickers already show them) are dropped; anything else shows where it is least covered. Important pops (crit, capture, gold, bad news) never wait.
   - On screens up to 420 px tall the pops are drawn at the 24 px floor.
4. **Draw calls.**
   - Enemy ships (not the player's, whose material colours the shipyard tests read) bake their plain static toon parts into one vertex-coloured mesh per look. A cutter drops from 42 to 18 calls, a man-o'-war from 52 to 28, a raider from 39 to 12. Close-ups before and after look the same.
   - The Maelstrom's 8 wreckage pieces are now one CPU-moved mesh: 2 calls instead of about 20.
5. **Environments.**
   - In Doubloon Bay and Frostbite Straits the water now mirrors a higher sun on the same bearing. The low sun's wide glitter path of tan or pink dashes no longer looks like the sandbars or ice floes. The sky, sun disc and lighting keep the palette.
   - The aurora is taller and higher, with deeper colours and stronger rays, so it shows over the fjord walls instead of as a thin strip in the gap at the far end. It stays alpha-blended (reason in open_issues).
6. **Audio balance against the recorded music.** Offline renders were measured with K-weighted loudness:
   - Music, in LUFS: menu −28.4, dock −27.8, europe −28.7 and volcano −30.2 (recorded); doubloon −27.7, frost −28.7 and maelstrom −28.1 (synthesised).
   - New effects sit in the same places as the old ones: thunder is +16.0 over the Maelstrom music, the same margin as the lava bombBoom over the volcano music; capture −17.8 against levelClear −15.4; clash, cheer and overboard −22 to −25, like hit at −22.8.
   - The footsteps are soft on purpose (−36.8).
   - Nothing needed changing.

All §12 budgets are met. Before → after:
- **Level starts, 1280×720, fly-in / chase camera:**
  - L1 323/309 → 299/283
  - L2 265/234 → 231/212
  - L3 117/176 → 104/165
  - L4 274/233 → 249/208
  - L5 274/264 → 194/184
  - L6 300/250 → 230/194
- **Busiest boarding on each level** (next wave alongside and battered, peak over every frame of the set-piece): L1 339, L2 315, L3 257, L4 286, L5 238, L6 193 (the Phantom with her raider).
- **Act II scenery alone:** 152 / 57 / 47.

### API notes

**Draw calls** (`?quality=low`, `renderInfo.calls`, both outline passes counted). Probes: `starts.cjs`, `board.cjs`, `breakdown.cjs`, `percall.cjs`, `town.cjs` in the scratch folder.

- **Level start, fly-in / chase camera:**
  - 1280×720: L1 299/283, L2 231/212, L3 104/165, L4 249/208, L5 194/184, L6 230/194
  - 390×844 touch: L1 276/263, L2 211/190, L3 143/144, L4 213/210, L5 189/161, L6 185/158
  - 568×320 touch: L1 299/283, L2 228/210, L3 104/165, L4 249/208, L5 194/184, L6 230/194
  - Before my changes (1280×720): L1 323/309, L2 265/234, L3 117/176, L4 274/233, L5 274/264, L6 300/250
- **Busiest moment with a boarding, 1280×720** (wave rules followed: the next wave is in, one ship of the first wave left where nextWaveAt allows, all battered; peak over every frame, hook to result):
  - L1 339, L2 315, L3 257, L4 286, L5 238, L6 193
  - The L6 figure is the finale: the Phantom boarded with her raider alongside.
  - Before the ship bake: L1 392, L2 417, L3 309, L4 362, L5 343, L6 243
  - The hook phase is always the peak: the chase camera still sees every ship when the boarders appear.
- **Act II scenery alone** (fly-in view): L4 152, L5 57, L6 47 (budget ≤ 220).
- **Per ship model, sound / wrecked, now (before):**
  - cutter 18/22 (42/46), privateer 24/30 (53/57), prahu 15/19 (35/41), junk 36/38 (63/65)
  - corsair 33/39 (46/52), man-o'-war 28/36 (52/62), galleon 24/34 (49/59), raider 12/16 (39/43)
  - phantom 39/43 (65/65), inferno 38/38 (56/56)
- **Town:** shipyard 298 (3A measured 311); east pier looking at two prize ships 163 (3A: 236).

**APIs and behaviour:**
- **ships.js**
  - `buildShip(type)` for every type except 'player' merges the static meshes left by mergeStatic, when their material is a plain opaque toon (no map, no emissive, not transparent, no vertex colours). They become one mesh per kind of look (gradient, side, flatShading, fog, outline parameters), drawn with a shared vertex-colour MeshToonMaterial named 'ship-baked'.
  - Sails, flags, glows, fires, cloth and anything with userData.keep are untouched.
  - userData is unchanged.
  - disposeShip frees the baked geometry; the baked materials are shared and are never disposed.
- **boarding.js**
  - New constants: CAM `land { dist 14, el 1.0, yaw 0.2, lookUp 1.2, toBrawl 0.45 }` and `port { dist 15, el 1.1, yaw 0.35, lookUp 2.8, toBrawl 0.25 }`, plus `SAIL_FADE = 0.22`.
  - While camBlend > 0 the brawl ship's sails (`mesh.userData.sails`) carry transparent copies of their materials: opacity `1 − 0.78 × smooth(camBlend)`, outline alpha the same. The originals come back when camBlend reaches 0, and at once on clear(), release() and dispose(). The copies are cached per material and freed on release() and dispose().
  - The boarded ship gets `ship.tagHidden = true` while the view is on (camBlend > 0.02).
  - heave() only counts in kind 'attack'.
  - goOverboard passes `{ along: z }` and no longer pins Math.random.
- **overboard.js:** `throwOver(ship, side, opts, { along } = null)`. A finite `along` (ship-local z, clamped to ±0.45 × len) picks the spot on the rail; without it the spot is random as before.
- **tags.js:**
  - The name sprite is drawn as an ink tab (38 px Luckiest Guy, cream on #1d1330) and sits at `LABEL_Y = BG_TOP + 0.565`, overlapping the card's top edge.
  - Tags hide when `ship.tagHidden` is set.
  - Still 3 draws per tag (4 while the ghost lags), plus 1 for every pip.
- **pops.js**
  - `createPops(layer, camera, { reducedMotion, avoid, insetTop, furniture = FURNITURE })`.
  - furniture entries are a CSS selector, or `[selector, weight]`, looked up in the layer's document each time limits are read. Hidden pieces have no box and are skipped.
  - The default list: `[['#banner', 0.3], '#minimap', '#boss', '#boarding-strip', '#objective', '#hint', '#hud .hud-bottom .card.guns', '#touch .pad']`. Pass `furniture: []` to opt out.
  - Overlap cost is multiplied by the obstacle's weight, so the banner is a soft obstacle.
  - A 'crew' pop at the same point as the dmg pop just made (still unaged, or waiting in the queue) becomes that pop's second line (CSS `.pop-dmg .pop-sub`).
  - A non-important pop with no clear spot waits up to `ROOM_WAIT = 0.6` s, looking again every 0.05 s. It never pushes out a pop that is showing. After the wait, 'info' and 'rake' pops are dropped; anything else is forced to the least covered spot.
  - `count` is unchanged: pops that are alive.
- **fx.css:** `.pop-dmg .pop-sub` takes the crew colour. Under `@media (max-height: 420px)` every pop is 24 px; dmg 25, crit 32, capture 34 (sub 24), gold 26.
- **doubloon.js / frost.js**
  - Each frame update() copies a "water sun" into the ocean material's `uSunDir`. It is found once with `scene.getObjectByName('ocean')`, and is the palette's bearing at y = 0.62.
  - dispose() puts back the palette's normalized `sunDir`.
  - The palettes themselves are unchanged.
- **frost.js:** the AURORA table is higher (y0 44–66, h 70–86) with deeper colours, five alpha rows and stronger rays. Still 3 meshes, alpha-blended.
- **maelstrom.js:** the wreckage is one vertex-coloured toon mesh named 'maelstrom-wreckage' (frustumCulled false). Each piece's vertices are moved on the CPU; a piece that has sunk into the eye is folded to a point. The motion is the same as before.

**Bench, pops** (50 random volleys per size; the HIT mark primed like the game; counts are volleys with any overlap):
- 1280×720: pop/pop 0, pop/mark 0 (1 with the banner up), pop/HUD 0 (the old pops.js: 41 with the banner up).
- 390×844: everything 0 (old: 12, and 46 with the banner).
- 568×320 without / with the banner:
  - pop/pop 10 / 2 (old 9 / 8)
  - pop/mark 11 / 17 (old 4 / 7)
  - pop/HUD 4 / 34 (old 36 / 47; with the banner, mostly the soft banner)
  - 16–23 % of the secondary words (POINT BLANK!, SAILS SHREDDED!, rake words) are dropped there.

### Hooks applied

- 2B → src/overboard.js: APPLIED. throwOver(ship, side, opts, { along }) places the faller at that ship-local z (clamped to ±0.45 × len); without it the spot is random as before. The Math.random pin in boarding.js goOverboard() is removed; it passes { along: z }.
- 2A-2 → src/boarding.js (optional): APPLIED. heave() only counts in your own attack's reel (kind 'attack'); a surrender or defend reel returns the bonus unchanged.
- 2A-1 → src/tags.js (optional): APPLIED. The name label sits on an ink tab joined to the top of the bar card, with no gap and cream on ink, so it reads over any sky.
- Stage 2 fix report → src/pops.js (the level/'X sunk!' banner and the minimap missing from avoid; overlaps on crowded 568×320 volleys): APPLIED inside pops.js, since I don't own main.js. pops.js finds the banner (a soft obstacle), the minimap, boss bar, boarding strip, objective, hint, gun card and touch pads in the DOM itself. Crew counts merge into the damage pop; pops with no room wait, then redundant words are dropped; short screens use the 24 px floor. 568×320 is better but not clean (open_issues).
- 2D → src/pops.js (pops of one impact overlapping): already fixed by B in the Stage 2 fix pass; the merge and wait above reduce it further.
- 1B/1C → src/people.js (vest, hatBadge, earring, coats, hats, beards, parrot): already in people.js since Stage 1; checked, no change needed.
- 1E open item (audio, not heard by ear): measured the new effects against the recorded and synthesised music; balance is consistent, so audio.js is unchanged (numbers in the summary).
- 1D open item (wrecked ships cost +10 calls): with the enemy bake, every ship is cheaper (cutter 42→18, man-o'-war 52→28), so the busiest scenes have room for the fires.
- 1H open item (Maelstrom draw calls): the wreckage is merged into one dynamic mesh (−18 calls); the L6 start is now 230/194, down from 300/250.
- 1F open item (sun glitter reads as sandbars): fixed in doubloon.js (the water sun); the same fix in frost.js for 1G's pink glint streaks that read as ice floes.
- 1G open item (aurora blending): kept alpha blending, which 1G showed is needed against the pastel dawn sky; made it taller, higher and more saturated so it shows over the fjord walls.

### Hook requests

- style.css (Stage 4 integrator), short landscape touch (max-height 500px, e.g. 568×320, 640×360): the level banner runs under the minimap's left half ('Level 1: Coast of Europe' disappears under it). Evidence: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/stage3/3E/shots2/SHEET-start568.png. Suggested: in that media block give .banner `max-width: calc(100vw - 2 * (var(--mm) + var(--edge) + 16px))`.
- src/scenery.js (Stage 4, optional cleanup): ocean.setPalette could use an optional palette field for the sun the water mirrors, e.g. `uniforms.uSunDir.value.fromArray(P.waterSunDir || P.sunDir).normalize()`. doubloon.js and frost.js could then set `waterSunDir` in their palettes and drop the per-frame uniform write (findOceanSun). Behaviour stays the same.
- src/main.js (Stage 4, optional): pops.clear() in finishLevel, as 3A also noted, so the last capture's pop can't sit over the Victory screen; and pass `furniture: []` to createPops only if the integrator wants main to own the HUD avoid list. The defaults already cover the banner, minimap, boss bar, strip, objective, hint, gun card and touch pads.
- tests/battle.cjs or tests/levels.cjs (3C / Stage 4, optional): a check that during the boarding view the boarded ship's tag is hidden (G.tagInfo(e).visible === false while G.boarding.phase is 'brawl') and her sails' materials are transparent with opacity < 0.5 (e.mesh.userData.sails[0].material); and a pops-vs-HUD check at 390×844 (no pop over #banner or #minimap). My bench is at /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/stage3/3E/bench.cjs with bench/popsbench.html (the real HUD markup).

### Expected test changes


### Verification

**Node syntax check:** `node --check` passes on every changed .js file. The live files equal the tested dev copies (`cmp`).

**Node suites on the live repo after publishing:** combat 102, armory 35, cosmetics 70, walk 66, mechanics 121, upgrades 37 and server 14 all PASS (exit 0).

**Browser suites, mirror root** (`node root/tests/<x>.cjs` with the dev files; BATTLE_ROOT and CONTROLS_ROOT pointed at it):
- battle.cjs: 153 passed, 0 failed.
- smoke.cjs: 90 PASS, 4 FAIL. These are the four §11.4 items 3A/3B already listed: the 6 level cards, the won dock's exits, the bot over 6 levels, cards unlocked after winning.
  - The first attempt timed out at smoke.cjs:131 at load average 23. The rerun at load about 9 gave the result above.
- controls.cjs: 201 PASS, 9 FAIL. These are exactly 3A's expected ones: 'saved data (too large)' plus the 8-check Shift+Tab / #dock-ashore-btn cascade.
- audio.cjs: 50 PASS ('all audio checks passed').

**Browser suites, live repo after publishing (08:28:56), each run separately:**
- battle.cjs: 153 passed, 0 failed.
- smoke.cjs: 90 PASS, the same 4 §11.4 FAILs.
  - The first live run hit a load timeout at smoke.cjs:274 (load 13–16, plus the adaptive-resolution check that only fails under load). The rerun at load about 9 gave the result above.
- controls.cjs: 201 PASS, the same 9 expected FAILs.
- audio.cjs: 50 PASS.

**In-game probes** (scratch folder, 0 page errors in every run):
- `starts.cjs`: L1–L6 at 1280×720, 390×844t and 568×320t.
- `board.cjs`:
  - busy boardings on L1–L5 at 1280×720 and the finale on L6;
  - the L5 raider defence at 1280×720 and 390×844t;
  - the L4 attack at 568×320t;
  - the L1 attack at 390×844t and with reduced motion (camera cut, instant fade, sails restored afterwards);
  - the L6 Phantom.
- `camtune.cjs`: about 40 camera candidates on a cutter, galleon and man-o'-war, desktop and portrait, with and without fading.
- `lightning.cjs`: a real lightning bomb plus a flash, normal and reduced motion. Normal: bolt and glow. Reduced: a 0.10 tint; far bolts are off.
- `volley.cjs`: a point-blank crit volley at 390×844t and 568×320t.
- `envview.cjs`: Doubloon Bay facing the sun (before/after), Frostbite Straits (aurora before/after, glint before/after), the Maelstrom's whirlpool and wreckage.
- `shipview.cjs`: all 10 enemy types close up, live vs baked: the same look.
- `town.cjs`: the shipyard and the east pier with prize ships; the baked galleon and man-o'-war render.
- Audio levels: `audio/run.cjs levels.js`.
- Every contact sheet and key frame was opened with Read. That gave three or more critique rounds, which led to the camera retune, a stronger fade, the portrait framing, the aurora twice, the water sun for Frost after Doubloon, and the tag hide.

Not run: the full chained `npm test` in one go. levels.cjs and town.cjs don't exist yet (3C).

### Open issues

- 568×320 touch is still crowded. With the HUD pieces avoided, pops sit far less often under the touch pads, gun card or minimap (36 → 4 of 50 bench volleys). But pop-over-pop is about the same (10 vs 9) and pop-over-HIT-mark rose (4 → 11), and 16–23 % of secondary words are dropped there. A crit (never delayed) can still overlap the damage pop.
- The banner is drawn above #pops in z-order (#banner comes after #hud). pops.js treats it as a soft obstacle (weight 0.3) so that on short screens pops don't pile into each other instead, so a pop can still end up partly under a 'X sunk!' / 'Counter-board!' banner when there is no room elsewhere.
- Phantom vs man-o'-war ratio: after baking, the man-o'-war costs 28 calls and the Phantom 39 (1.39×, over §12's '≤ 1.3×'). Her see-through ghost cloth and flickering glows can't be baked. In absolute terms she dropped from 65 to 39, well under 1.3 × the old 52.
- Only enemy ships are baked. The player's ship keeps one material per colour (63 calls in battle), because the shipyard tests read its material colours (repaint, barrel colours).
- doubloon.js and frost.js write the ocean's uSunDir uniform themselves (found by the name 'ocean'). That couples them to scenery.js's internals; the hook request offers a palette field instead.
- The aurora stays alpha-blended, not additive as §6.5 says. Additive light vanishes against the pastel dawn sky (1G's finding). It is now taller and more saturated, but still mainly a band of curtains over the far fjord.
- On the Maelstrom's night deck the Phantom brawl figures are dark and small (about 20 px at 1280×720); the faded teal sails help, but they are the hardest boarding to read. Portrait figures are about 20 px everywhere.
- In big-ship boardings (galleon, man-o'-war), your own ship is mostly hidden behind her hull from the brawl view. The brawl on her deck is clear, and your ship shows during hook and reel.
- The captured prize's sails fade back over the camera's 0.6 s ease-out, so for a moment she sails off half see-through.
- Level-start draw calls are taken 2 frames after startLevel, as smoke does; all of them now have at least 30 calls of headroom (Act II ≤ 310, Act I ≤ 320).


## 3C Tests

### Summary

3C is done. The §11.3 suites are written: tests/levels.cjs (68 checks) and tests/town.cjs (114 checks). The §11.4 changes and the agents' expected test changes are applied to smoke.cjs and controls.cjs, and package.json runs the §11.4 order (audio.cjs kept, after controls) with test:levels and test:town.

The full npm test fails, on purpose: levels.cjs has 5 failing checks. They catch a real accessibility bug in style.css, which I don't own: at 320x480, 360x480 and 568x320, Tab moves focus onto level cards 4–6 while they sit hidden under the pinned "Set sail! / Shipyard" row. On a copy of the game, a one-line CSS fix (in hook_requests) turns all 31 card checks green. Because `npm test` stops at the first failing suite, town.cjs did not run in the chain. Run on its own, it passes 114 of 114.

Full run (10:53–11:35, 42 min):
- combat 102, armory 35, cosmetics 70, walk 71, mechanics 121, upgrades 37, server 14: all pass.
- smoke 94, controls 212, audio 50, battle 154: all pass.
- levels 63 PASS, 5 FAIL (only the focus bug above).
- That is 1023 PASS, 5 FAIL in the chain, plus town 114 PASS, 0 FAIL.

**Changes to existing checks** (only the §11.4 ones and the ones the agents listed, plus a few additions):
- **smoke.cjs:**
  - 6 level cards; every card but the first locked; Tricky/Tough/Legendary on cards 4–6.
  - After the Molten Maw the dock's exits read 'Set sail for Doubloon Bay | Back to the title'.
  - The draw-call loop runs over all levels (`n <= LEVELS.length`); the Act I bot over `n <= 3`; `unlockedCards === 4`.
- **controls.cjs:**
  - 'too large' now expects 6 unlocked levels.
  - Shift+Tab from the Upgrades tab reaches #dock-ashore-btn, then #dock-mute (2C's fix).
  - dockLayoutProbe also checks #dock-ashore-btn. It is allowed to sit just outside the panel on compact layouts, but must be on screen, uncovered, at least 44 px, and clear of the tabs, the ways out and the sound button.
  - New FLOW-2 case for a full store at Polly's:
    - The plume purchase is refused with 'storage', both through the API and in the shop.
    - Nothing is paid, and neither the chest nor the look record is written.
    - When room comes back, the look record is saved before the chest. After a reload the item is owned and was paid for once.
- **battle.cjs** (3E's optional request): at 390x844, a stern rake's pops stay off the minimap (tested as a circle) and the "sunk!" banner.

**Break tests:** I broke a copy of the game served from a temp root, one change at a time (src/ was never touched).
- levels: 9 of 9 caught.
- town: 13 of 14 caught. The miss is the double-click guard. Removing only the 400 ms timer, or the timer plus the "Bought" button, doesn't cause a double purchase, because three other layers still stop it. Removing every layer (T2c) was caught.
- controls: the pay-before-save break was caught.
- battle: removing the pops' avoid list was caught.

**Screenshots:** I looked at every required one over three rounds and fixed two problems in my capture method:
- an empty speech bubble left behind by a greeting during the fixed-step walking;
- a tavern shot taken before its panel had slid in.

### API notes

**package.json**
- "test" runs combat → armory → cosmetics → walk → mechanics → upgrades → server → smoke → controls → audio → battle → levels → town.
- That is §11.4's order, with audio.cjs kept after controls.
- There is a `test:<name>` script for every suite, including the new test:levels and test:town.

**tests/levels.cjs** (68 checks; ~4.2 min at load average 4–5)
- `LEVELS_ONLY` picks sections: cards, finale, doubloon, frost, maelstrom, bot, draws.
- `LEVELS_ROOT` serves another copy of the game; `SCREENSHOT_DIR` sets where screenshots go.
- Sections:
  - **cards:**
    - Order: an h3 per act, each spanning the grid, then its 3 cards; three to a row at 1280x720.
    - Lock state and difficulty words; pips 'Difficulty N of 6' with N skulls lit; 'Beat the Molten Maw' / 'Locked'.
    - The Far Seas mentioned in the tagline and the page description; with unlocked = 4, Enter on card 4 sets sail.
    - At the 10 F01 sizes: no page scroll, Set sail! and Shipyard in view, every card reachable, and Tab focuses each card in view.
  - **finale:**
    - Level 3 gives 'won' with def.finaleText; #act2-btn comes first with "Sail on to the Far Seas", Main menu becomes the smaller alt button, and #won-hint shows.
    - Level 4 is unlocked and saved, the best plunder saved.
    - Both the button and Enter start level 4 with the voyage gold.
    - The won-dock footer, All aboard? and the Harbour menu all read 'Set sail for Doubloon Bay | Back to the title', and All aboard's first button sails.
    - After level 6: the legend's words, no Sail on, the Phantom named in the victory banner, legend = 1, Enter goes to the title.
  - **doubloon:**
    - The galleon heads for the far gate at 0.7 × her top speed.
    - Chased, she runs at full speed and zig-zags ±0.4 rad, the sign flipping at 4 s.
    - Escape at the gate: removed, no gold or coins, no sinking, banner shown; the objective line and the #objective pill update.
    - A capture pays 525 at once; at the level's end 525 + 500 + 50 prize + 150 treasure = 1225; the summary lines are checked.
  - **frost:**
    - The floes stand still in paused frames, move 0.6–1.2 u/s with sim time, and env.step(t) is deterministic.
    - CRUNCH! does 6 damage, 3 hits in 3.2 s at 1.5 s apart; none at 5 u/s.
    - Ice caps a shallow raider's speed at 0.55 × her top speed.
  - **maelstrom:**
    - Drift at r 40 matches the §6.3 formula within 3%, for your ship and an enemy; no drift at r 76 or for the Phantom.
    - The eye takes 10 hp in 2 s from you and a cutter, 0 from the Phantom, and the banner warns you.
    - The Phantom rises 18 u from the eye with wave 2: mesh y < −4, then near 0 after 3 s; she does not fire while rising.
    - Lightning: a warning ring lasting def.bombs.warn, then 14 damage and a bolt (env.lightning stats).
    - Strikes at 0, 1, 2, 3.2 and 4 s give 2 sky flashes at least 3 s apart, never above 0.25.
    - With reduced motion, the peak is ≤ 0.1 and only 0.001 after 0.05 s.
  - **bot:**
    - bot v2 is 3B's bot2.js, copied in.
    - Mid-game profile set via G.setShipConfig and G.armory.set; up to 2 tries per level; damage counted as the sum of hull drops.
    - Checks: cleared within 900 s; every level fights back; Maelstrom damage > Doubloon Bay; stuck 0; a galleon taken in Doubloon Bay and a capture in the Maelstrom.
  - **draws:**
    - Act II level starts measured on a stock profile, 2 frames into the fly-in and with the chase camera: all ≤ 310.
    - Then one real-frame boarding per level, with the brawl skipped after 0.8 s:
      - L4: a galleon, with her cutters alive.
      - L5: a raider boards you.
      - L6: the spectral Phantom, with her raider alive.
    - Every frame is recorded and must stay ≤ 450.
    - During the brawl the boarded ship's tag must be hidden, and the sails over the brawl's deck must be at opacity < 0.5.
- Measured:
  - Level starts, fly-in / chase: L4 250/224, L5 194/186, L6 227/203.
  - Boarding peaks: L4 268 (hook), L5 222 (threat), L6 317 (hook).
  - Bot v2 in the npm run: L4 damage 48, L5 49, L6 164; all cleared on the first try.
- Screenshots: doubloon.png, frost.png, maelstrom.png, plus maelstrom-boarding.png.

**tests/town.cjs** (114 checks; ~9 min at load average 8–9, about 6–7 min unloaded)
- `TOWN_ONLY` picks sections: ashore, walk, places, touch, wardrobe, tavern, battle, records, layout, draws. `TOWN_ROOT` serves another copy.
- Walking runs through `__game.town.simulate()` inside a single evaluate. Keys are dispatched as KeyboardEvents to the game's handlers in that same evaluate, so the real loop never moves the captain in between.
- Enter and Space on a focused places-bar button use the real keyboard, because synthetic events don't press buttons.
- Sections:
  - **ashore:**
    - Shift+Tab from the Upgrades tab reaches Go ashore; no captain is built before going ashore.
    - Ashore: the captain at the spawn; the camera in his back half (dot ≤ 0.2, 3D's tolerance); focus on #town-screen (role=region); the exact live text.
    - The town's Shipyard place opens the shop with 'Back to town'; that button walks back out.
  - **walk:**
    - All 8 keys move camera-relative within 0.35 rad, with the camera behind him and turned 0.9 rad.
    - C puts the camera behind him again; jog 3.0, sprint 4.6, ratio 1.53.
    - 30 s of seeded random keys, stick tilts, drags and taps: never off the walk or inside a blocker.
    - Walking into the tavern building stops outside it; a tap on a shut-in corner walks as near as he can get; camBlockers > 0.
  - **places:**
    - Each places-bar button walks to its place and opens it, with focus inside; back in town, focus is on its button (for All aboard?, the town region or the button).
    - A move key cancels the auto-walk.
    - E, Enter and Space go in only when no button is focused.
    - P and Esc open the Harbour menu: modal, labelled, town inert, Tab and Shift+Tab trapped, focus returned. The ☰ button opens it too.
    - All aboard's exits match the shipyard's for all 5 origins, and its next/retry/title/menu buttons behave the same.
  - **touch** (390x844): portrait fov 60; touch wording; joystick (CDP touch events); tap-to-walk; the Go in button; every control ≥ 44 px (after animations finish).
  - **wardrobe:**
    - Free items worn and saved; try-on shows Buy and reverts when leaving the tab or the panel.
    - Buy pays and saves, and Polly's env.cheer returns true.
    - Too poor: Buy aria-disabled, "Need 70 more gold", focus kept.
    - A double-click buys once.
    - The crown stays locked until G.setFeats grants it.
    - Surprise me! changes only free options of the open tab.
    - Red stripes show on the 3 line-up sailors and the 6 cleaning-crew sailors (look and vertex colours); Match the ship's paint uses the royal hull's top colour.
    - The default uniform restores the crew exactly: looks and vertex-colour hashes.
  - **tavern:**
    - Four rows, outside #dock-panel.
    - Boarding party saved together with the chest.
    - Long grapples coils go from 0 to 2.
    - Crew at the next level start goes from 12 to 15.
    - The rumour board for levelDone, over, won and menu.
    - The log counts and trophy progress.
  - **battle:** helm look = captainOpts(look); in the brawl, the captain plus ≥ 1 uniformed sailor (read from the 'boarding-person' groups).
  - **records:**
    - Corrupt look, feats, armory and tips records fall back and are rewritten as serialize(memory).
    - With storage blocked, walking and wearing still work; wardrobe buy and armory buy are refused and nothing is paid.
  - **layout:**
    - 2C's probes, adapted, at 320x480, 360x640, 390x844, 844x390 and 568x320 (touch) and 1024x600, 1280x720 (desktop), resizing one context per input type.
    - Covered: the town HUD with the prompt up, the wardrobe (both tabs, trying on), the tavern, the Harbour menu, All aboard?, and contrast on solid plates.
    - An item taller than its list's scroll padding allows is centred before it is measured.
  - **draws:**
    - 6 walk-view spots with galleon and man-o'-war prize ships moored, measured at 216, 170, 124, 61, 28 and 340.
    - Polly's view 41, the line-up 46, the tavern 66.
    - M mutes and keeps #town-mute and #dock-mute in sync.
    - Context loss in town, with the Harbour menu open, and at Polly's: the recovery text names the town, and focus returns to #town-screen or the Captain tab.
- Screenshots: town.png, tailor.png, tavern.png.

**controls.cjs:** `CONTROLS_ONLY=storage` runs only the new storage-full check at Polly's (function pollyStorage). In a normal run it is called at its place, right after the shipyard's storage-full case.

### Hooks applied

- 2C → tests/controls.cjs (Shift+Tab from the Upgrades tab now reaches #dock-ashore-btn first): APPLIED as proposed. Press once and expect dock-ashore-btn with a visible ring, then again for dock-mute. Also listed by 3A as expected test change ~1181.
- 2C → tests/town.cjs notes (force-click aria-disabled buttons, deterministic walking via simulate, keep rAF alive, render only screenshot frames): APPLIED. Walking uses town.simulate inside one evaluate; aria-disabled buttons are pressed with el.click() or the keyboard; only the measured and screenshotted frames are drawn.
- 2C (FLOW-2) → tests/controls.cjs ECO-2 check: APPLIED. A storage-full purchase case at Polly's: refused with 'storage' (API and shop), nothing spent, nothing written; with room again the look record is saved before the chest, and after a reload the item is owned and paid for once.
- 2D → package.json and battle.cjs (add levels.cjs and town.cjs in the §11.4 order with test:<name>): APPLIED. battle.cjs needed no change for WITH_ACT2.
- 3B → tests/levels.cjs (Act II bot v2, damage as the sum of hull drops, Act II level-start draw calls on a stock profile): APPLIED. botLevel is copied from 3B's bot2.js (trace and boardFight parts removed). Two tries per level. Draw calls are measured on a fresh page at the fly-in and with the chase camera.
- 3A expected test changes: smoke.cjs:115–117 (6 cards, every card but the first locked, Tricky/Tough/Legendary), ~496 (exits 'Set sail for Doubloon Bay | Back to the title'), ~538 (draw-call loop over LEVELS.length), ~552 (bot n <= 3), ~624 (unlockedCards === 4), controls.cjs ~369 (unlocked 6), ~1181 (Shift+Tab): ALL APPLIED. Each matches §11.4 or SPEC2 §7.1, and all pass on the live game.
- 3B expected test changes (the same smoke/controls items): APPLIED, as above.
- 3D → tests/town.cjs spawn camera: APPLIED. The check is 'camera in his back half' (dot ≤ 0.2) after the swoop; C-behind is checked separately in the open plaza.
- 3D → tests/town.cjs layout (the prompt at the top on short phones and short landscape; #town-keys visibility:hidden): APPLIED. There is no 'above the places bar' check, and hidden elements count as absent.
- 3D → tests/town.cjs optional checks (portrait fov 60, walkTo(16.8,-14.9) returns true and walks, env.cheer('polly') returns true, camBlockers non-empty): APPLIED. All four are checks now: fov in touch, walkTo and camBlockers in walk, cheer on the plume purchase in wardrobe.
- 3E → tests/battle.cjs or tests/levels.cjs (optional: tag hidden and sails see-through during the boarding view; pops vs HUD at 390x844): APPLIED. The tag and sails check is in levels.cjs draws, on all three Act II boardings (sails measured on the ship whose deck holds the brawl). The pops-vs-minimap/banner check is in battle.cjs 'touch' at 390x844; the minimap is treated as a circle. The pop-overlap break test was caught.

### Hook requests

- style.css (Stage 4 integrator; 3A's markup), REAL A11Y BUG found by tests/levels.cjs.
- Failing check (5 FAILs): 'title WxH: Tab reaches all 6 cards, each in view with a focus ring'.
  - 320x480 touch: card 4 under menu-dock-btn.
  - 360x480 touch: card 4 under menu-dock-btn.
  - 568x320 touch: card 4 under menu-actions; card 5 under menu-dock-btn; card 6 under menu-actions.
  - 320x480 desktop: card 4 under menu-dock-btn.
  - 568x320 desktop: same as 568x320 touch.
- Cause: #menu-screen .menu-actions is sticky at the bottom of the scrolling #menu-screen .panel. When Tab focuses a card in Voyage II, the browser scrolls it to the nearest edge, which is under the pinned Set sail!/Shipyard row, so the focused card is hidden (focus obscured, §13). Also seen with a real Tab sequence in scratch title-focus.cjs.
- Fix, verified on a copy: add `#menu-screen .panel { scroll-padding-bottom: 92px; }` (the pinned row is about 76 px; I tested `calc(var(--menu-actions-h, 76px) + 16px)`). With it the levels.cjs cards section gives 31 passed, 0 failed. Either measure the row's height into a custom property or use a fixed value matching the tallest pinned row.
- src/townMode.js (Stage 4, optional; test API only): api.simulate() drops the townsfolk greeting text. town.simulate() runs update(), which starts a greeting (env.greet, the bubble anchor), but its result has no `greet` flag, so townMode never sets bubble.textContent = greetLine(). The next real frame then shows an empty white speech bubble. Seen in my first town.png. Real play (frames only) is fine. Suggested fix: town.simulate returns `greet: true` when any step greeted, and api.simulate sets the bubble text the way update() does.

### Expected test changes


### Verification

All commands used NODE_PATH=/opt/node22/lib/node_modules and SwiftShader Chromium. Logs are in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/stage3/3C/.

1. `node --check` passes on tests/levels.cjs, town.cjs, smoke.cjs, controls.cjs and battle.cjs.

2. Full `npm test` on the live repo, 10:53:31–11:35:47, load average 4–9 (npm1.log). Exit 1:
   - combat 102, armory 35, cosmetics 70, walk 71, mechanics 121, upgrades 37, server 14: all PASS.
   - smoke 94 PASS ('All checks passed'); bot L1 32, L2 109, L3 94 damage; all cleared.
   - controls 212 PASS ('All control checks passed').
   - audio 50 PASS.
   - battle 154 PASS, 0 FAIL.
   - levels 63 PASS, 5 FAIL. All five are the focus-obscured title checks (hook_requests); everything else passes, including the bot (L4 damage 48, L5 49, L6 164) and all draw-call checks.
   - Totals: 1023 PASS, 5 FAIL. The && chain stopped before town.cjs.

3. `node tests/town.cjs` on the live repo, 11:11–11:21, alongside the npm run, load 8–9 (town-final.log): 'town.cjs: 114 passed, 0 failed', EXIT 0.

4. Earlier separate runs:
   - smoke.cjs alone: 94 PASS, 'All checks passed' (smoke1.log).
   - controls.cjs alone, before the pollyStorage refactor: 212 PASS (controls1.log).
   - `BATTLE_ONLY=touch node tests/battle.cjs`: 15 passed, 0 failed (bt2.log).

5. CSS fix check: levels.cjs `LEVELS_ONLY=cards`, with LEVELS_ROOT pointed at a copy carrying the one-line scroll-padding-bottom rule: 31 passed, 0 failed.

6. Break tests: `node mutate.cjs` in the scratch folder copies the repo to scratch/mroot, applies one edit, and runs the guarding sections with *_ROOT. The live src/ was never edited.
   - levels, 9/9 caught:
     - L1 no Sail on button
     - L2 nearest gate
     - L3 an escape pays gold
     - L4 convoy bonus 100
     - L5 crunch gap 0.5
     - L6 ice doesn't slow
     - L7 swirl sign flipped
     - L8 flash gap 1 s
     - L9 no lockText
   - town, 13/14 caught:
     - Caught:
       - T1 sprint 3.0
       - T2c all buy guards removed
       - T3 E with a button focused
       - T4 back focus
       - T5 crew not dressed
       - T6 no try-on revert
       - T7 no focus restore after context loss
       - T8 boarders don't add crew
       - T9 default look at the helm
       - T10 tips not rewritten
       - T11 prompt 30 px
       - T12 C points the camera from the front
     - Not caught:
       - T2: BUY_GUARD 0
       - T2b: guard and 'Bought' marker removed

       In both, the purchase is still blocked by e.detail > 1, by trial = null after buying, or by cosmetics refusing an owned item.
   - controls, 1/1 caught: C1 pay before saving the look. Its after-reload chest was 640, the paid-for-but-missing case.
   - battle, 1/1 caught: P1 pops ignore the HUD. 'STERN RAKE ×2!' was 24 px into the minimap.

7. Probes: ashore-geo.cjs, title-geo.cjs, title-focus.cjs, crown.cjs, shapes.cjs.
   - crown.cjs showed the 568x320 'hat.crown can't be scrolled into view' was a probe artifact: the chip is 95 px tall in a 104 px list with 10 px scroll padding. The probe now centres such items.

8. Screenshots read over three critique rounds:
   - doubloon.png, frost.png, maelstrom.png and maelstrom-boarding.png;
   - town.png (twice re-taken: the empty bubble);
   - tailor.png;
   - tavern.png (re-taken once its panel had finished sliding in);
   - the title at 13 sizes; the ashore button at 5 sizes.

### Open issues

- `npm test` exits 1 until the style.css focus-obscured fix lands (hook_requests). The 5 failing levels.cjs checks are a real a11y bug, not test flakiness. Because the chain uses &&, town.cjs does not run in it until then; run alone it passes 114/114.
- Runtime: levels.cjs takes ~4.2 min (draws ~2.2 min of it: three real-frame boardings at 1280x720). town.cjs takes ~9 min at load 8–9 (layout ~100 s, draws ~140 s, places ~75 s), likely ~6–7 min unloaded. That is a little over §11's ~6 min per suite. The full chain is now ~42 min to levels, plus town.
- The double-click guard check (§7.7) can't be broken by removing one layer: buyTrial's 400 ms/e.detail guard, trial = null with the 'Bought' marker, and cosmetics.buy's 'owned' refusal each stop a second purchase. Only removing all of them (break test T2c) made the check fail.
- Levels draw-call peaks seen: L6 boarding 317 in the hook phase (the spectral Phantom with her raider alongside, both in the chase view). That is under 450, but higher than 3E's 193, because my setup keeps the raider close.
- Screenshots in this report were written to scratch (SCREENSHOT_DIR). A plain `npm test` writes the same names to tests/screenshots (git-ignored).


## 3F Fix-up

### Summary

3F fix-up is done. The full `npm test` passes: exit 0, 1142 PASS, 0 FAIL (12:31:10–13:17:52 UTC, load average 3–4.5).

The only failure 3C reported was a real accessibility bug in the game, so I fixed the game and left the check alone. On the title at 320x480, 360x480 and 568x320, Tab moved focus onto Voyage II cards that sat hidden under the pinned "Set sail! / Shipyard" row. That broke §13 (focus must never be hidden).
- **Fix:** main.js `menuPin()` measures the pinned row (its height plus the panel's bottom padding) into `--menu-pin`. Through a ResizeObserver it does this on resize, on panel scroll and on every card render. `#menu-screen .panel` gets `scroll-padding-bottom: calc(var(--menu-pin, 76px) + 24px)`, so a focused card is scrolled to sit fully above the row, focus ring included.
- **Two related problems seen in my screenshots:**
  - The fade above the row partly hid a focused card's ring at the bottom, even at 1280x720. The fade now shows only while the row is lifted off its place (`.menu-actions.pinned`), and while pinned the row covers the panel's bottom padding (`box-shadow 0 24px 0 var(--paper)`), so a card no longer peeks out beneath it.
  - In short landscape the card grid's bottom margin went from 4px to 8px, so the 7px ring is not cut by the row.
- **Result:** levels.cjs cards went from 26 passed / 5 failed to 31 / 0. My probe at 14 sizes, touch and desktop, finds every card visible when focused, with its ring at least 4px clear of the row.

Hook requests from 3D/3E that nobody owned:
- **style.css (3E), banner vs minimap:**
  - Short landscape touch: the level banner now keeps clear of the top-right minimap.
  - Small portrait touch (320x480 and 360x480): the banner now starts below the minimap, the same rule taller phones use. Before, the level title was drawn over the minimap there.
  - Measured before/after on levels 1–6 at 8 sizes: banner/minimap overlaps went from 16 cases to 1. The one left is the 568x320 desktop window, kept on purpose (see open issues). With the first-voyage hint shown, the banner never overlaps it at any F01 size.
- **scenery.js and doubloon.js / frost.js (3E):**
  - The ocean now reads an optional `palette.waterSunDir`. Doubloon Bay and Frostbite Straits set it with `higherSun(sunDir, 0.62)` and no longer write the ocean's uniform every frame or put it back on dispose.
  - Probe: the same vectors as before (L4 [-0.6812, 0.62, 0.3893], L5 [0.5023, 0.62, -0.6027]), now in place from the first frame. Other levels get their own sunDir back.
- **main.js (3E):** `pops.clear()` in `finishLevel()`. A final capture on level 3 shows 0 pops over the Victory screen at 1280x720 and 390x844.

No test file was edited.

### API notes

**main.js**
- New `menuPin()` (a hoisted function declaration), with module-level `menuPinRow` / `menuPinPanel`.
  - It sets `--menu-pin` on `#menu-screen .panel`: the pinned row's height plus the panel's bottom padding, in px.
  - It toggles `.pinned` on `#menu-screen .menu-actions` while the row is lifted above its place in the page (just below the cards).
  - It is called from `renderLevelCards()`, `resize()`, the panel's scroll event and a ResizeObserver on the panel and the row. It returns early while the title is hidden.
- `finishLevel()` now calls `pops.clear()` after hiding the banner and the hint.

**style.css**
- The title panel's scrolling and its pinned row:
  - `#menu-screen .panel { scroll-padding-bottom: calc(var(--menu-pin, 76px) + 24px) }`.
  - `#menu-screen .menu-actions::before` (the fade) has opacity 0, and opacity 1 only with `.pinned`.
  - `.menu-actions.pinned` also gets `box-shadow: 0 24px 0 var(--paper)`.
  - In the short-landscape title block (`max-height: 500px` and landscape), `.level-cards` has margin-bottom 8px (was 4px).
- The level banner:
  - New `@media (max-height:500px) and (orientation:landscape) and (hover:none) and (pointer:coarse)`: `.banner max-width: min(92vw, 760px, calc(100vw - 2 * (var(--mm) + var(--edge) + 16px)))`.
  - New `@media (max-width:640px) and (max-height:500px) and (orientation:portrait) and coarse`: `.banner top: max(24%, calc(var(--edge) + var(--top-h) + var(--mm) + 28px))`.
  - The rule that moves the banner down when both the boss bar and the boarding strip show still wins, as before.
- Measured banner boxes:
  - 568x320 touch: L1 116..452 x 104..186, minimap starts at x 464.
  - 320x480 touch: banner 166..248, minimap ends at 150 (ring 157), tutorial hint starts at 267.

**scenery.js**
- The ocean's `setPalette` uses `P.waterSunDir || P.sunDir` for its `uSunDir`. The sky, clouds and lights still use `sunDir`.

**doubloon.js / frost.js**
- The palettes gain `waterSunDir: higherSun(sunDir, 0.62)`, from a hoisted helper `higherSun([x,,z], y)`. The old `WATER_SUN` constant, `findOceanSun`, the per-frame uniform write and the reset on dispose are removed.
- Rendered values are identical to before.

**Measured during the npm run**
- Dock draw calls 297.
- Act II starts, fly-in / chase: L4 250/224, L5 192/186, L6 227/203.
- Bot v2 damage: L4 38, L5 51, L6 158. All cleared on the first try; the Maelstrom took more damage than Doubloon Bay.

### Hooks applied

- 3C → style.css (focus obscured on the title: Tab to cards 4–6 left them under the pinned Set sail!/Shipyard row): APPLIED. I used a measured value instead of a fixed 92px. main.js menuPin() writes the row's height plus the panel's bottom padding into --menu-pin, and the panel uses scroll-padding-bottom: calc(var(--menu-pin, 76px) + 24px). I also fixed two things the screenshots showed. The row's fade dimmed a focused card's ring, so the fade now shows only while the row is pinned (.pinned). Cards peeked out below the pinned row, so the pinned row now covers the panel's bottom padding. In short landscape the card grid's bottom margin went from 4px to 8px, so the 7px ring is not cut. LEVELS_ONLY=cards: 26/5 became 31/0.
- 3E → style.css (short landscape touch: the level banner runs under the minimap's left half): APPLIED with 3E's formula, in a landscape + coarse-pointer media block. I also fixed the same overlap on small portrait touch phones (320x480, 360x480): the banner now starts below the minimap. Not applied to non-touch short windows: at 568x320 desktop the narrower banner gains a line, and its bottom (188) runs into the first-voyage hint (top 182), which would break controls.cjs F01 'hint overlaps the level banner'.
- 3E → src/scenery.js (optional cleanup, palette field for the sun the water mirrors): APPLIED. ocean.setPalette uses P.waterSunDir || P.sunDir. doubloon.js and frost.js set waterSunDir in their palettes and no longer write the ocean uniform every frame or reset it on dispose. Probe: the same vectors as before, now in place from the first frame; levels 1, 3 and 6 keep their own sunDir.
- 3E → src/main.js (optional, pops.clear() in finishLevel): APPLIED. I did not pass `furniture: []` to createPops: the pops.js defaults already cover the HUD pieces, as 3E suggested.
- 3E → tests/battle.cjs / tests/levels.cjs (boarded ship's tag hidden, sails see-through, pops vs HUD at 390x844): already applied by 3C; nothing to do.
- 3D → tests/town.cjs (spawn camera tolerance, prompt at the top on short screens, fov 60, walkTo on a shut-in corner, env.cheer, camBlockers): already applied by 3C; nothing to do.
- 3D → Stage 4 README/docs (one line on walk.camBlockers and the 60° portrait walk lens): DECLINED for now. README.md has no section for the walkable town yet; SPEC2 §10 gives Stage 4 the README rewrite (levels, Act II, town and battle controls, tavern and tailor tables). It belongs in that town section.

### Hook requests

- Stage 4 (from 3B, not in 3F's 3D/3E scope), src/main.js: delete the local RAID_GAP / RAID_SHEER constants and use RAIDERS.gap in raiderTry and RAIDERS.sheer in updateEnemy. Same values, so behaviour does not change.
- Stage 4 (from 3C, test API only), src/townMode.js: api.simulate() should set the greeting bubble's text when town.simulate() greeted. Today the next real frame can show an empty speech bubble.
- Stage 4 (from 3B), docs: record the tuned Act II waves in SPEC2 §6.4–6.6 and in the README's levels section.

### Expected test changes


### Verification

All commands ran with NODE_PATH=/opt/node22/lib/node_modules. Scratch: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/stage3/3F/

1. **Reproduced the failure.** `LEVELS_ONLY=cards node tests/levels.cjs` on the unchanged repo: 26 passed, 5 failed. The 5 failures are exactly 3C's: 320x480t, 360x480t, 568x320t, 320x480 and 568x320.

2. **After the fix.** The same command: "levels.cjs: 31 passed, 0 failed".

3. **Probes on the live repo, 0 page errors in every run:**
   - **actions.cjs** (title at 14 sizes, touch and desktop; Tab through the cards): every card is visible when focused. In normal flow the gap between a focused card and the row is 8–10px; while the row is pinned it is at least 24px. --menu-pin read 64–87px.
   - **banner.cjs** (levels 1–6 at 8 sizes):
     - Before: the banner overlapped the minimap in 16 of 48 cases.
     - After: 1 case, the 568x320 desktop window, kept on purpose.
     - With the tutorial hint shown at the 8 F01 sizes: the banner never overlaps the hint.
   - **sun.cjs:** the ocean's uSunDir per level is L4 [-0.6812, 0.62, 0.3893], L5 [0.5023, 0.62, -0.6027], L1/L3/L6 = their own sunDir. The value is the same after frames run.
   - **won.cjs:** the Molten Maw captured last; the Victory screen comes up with pops.count 0, at 1280x720 and 390x844.

4. **Syntax.** `node --check` passes on src/main.js, src/scenery.js, src/env/doubloon.js and src/env/frost.js.

5. **Full suite.** `cd /home/user/First-project && NODE_PATH=/opt/node22/lib/node_modules npm test`, 12:31:10–13:17:52 UTC, load average 3.3–4.5, log in npm1.log. EXIT 0. Per suite:
   - combat 102
   - armory 35
   - cosmetics 70
   - walk 71
   - mechanics 121
   - upgrades 37
   - server 14
   - smoke 94 PASS ('All checks passed')
   - controls 212 PASS ('All control checks passed', including F01 layouts and FLOW-1)
   - audio 50 PASS ('all audio checks passed')
   - battle 154 passed, 0 failed
   - levels 68 passed, 0 failed
   - town 114 passed, 0 failed

   Total 1142 PASS, 0 FAIL; no FAIL line anywhere in the log.

   One small edit came after the run had started: I removed a stray blank line in doubloon.js and frost.js (atomic replace, whitespace only), before any suite that loads those levels ran.

### Open issues

- Desktop (non-touch) 568x320 window, pre-existing: the end of the level-1 banner's subtitle touches the ring of the bottom-right minimap. Narrowing the banner there pushes it into the first-voyage hint, which would break the F01 layout check. A fix needs the banner or minimap moved; left for Stage 4.
- Victory text: #won-text comes from the static def.finaleText, so after the Molten Maw is captured (not sunk) it still reads 'The Molten Maw is sunk…'. The victory banner does name a captured boss, as §5.6 asks. This is a wording choice for Stage 4.
- Still pending, addressed to Stage 4: 3B's RAIDERS.gap/sheer change in main.js, 3C's townMode simulate-greet fix (test API only), the SPEC2 §6.4–6.6 and README update for the tuned waves, and 3D's README line on camBlockers and the portrait walk lens.

