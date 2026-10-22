# Kraken Seas, Stage 2 reports

Stage 2 wires the Stage 1 modules into the game, in rounds (SPEC3 section 12; the battle integrator 2A in three parts). Everything stays behind `?kraken=1` until Stage 3. After each round the coordinator runs the full `npm test` and commits only a green tree.

## Round R1

**Coordinator test run:** npm test started 2026-10-22 00:21:45 UTC, after the last change (src/townMode.js 23:42:54): 19 suites, 1,858 checks passed, 0 failed, exit 0.

### 2A-1

2A-1 (battle core) is done and published (src/main.js, index.html, style.css; src/voyage.js needed no change). With ?kraken=1 the battle now has the full special-shot pipeline: loads at every level start, keys 4–6, R cycling, the touch ammo tray, one load spent per side, a fall back to round shot with its hint, and the launch-sound rule. Statuses are applied once per volley and every interaction works (ON FIRE / FROZEN / STINKY, KA-BOOM, FIRE OUT, IMMUNE, Clothes-pegs, CLANG on armour). Fire and the powder keg share one burn. Statuses pause in boardings and clear on strike, capture, escape and flee. Burning ships refuse the grapple (the Board cell reads HOT! n s, the tag shows the hot icon), a stinky crew boards with lower grit, and a stinky raider throws no hooks. Also in place: statusfx sync and clear, the crackle loop on a burning ship, black smoke on a burning ship, no wake on a frozen one, and the boss status badge. Steering has the rudder tiers (TURN_LOW = RUDDER.values[0]), the thumb slide with its needle, the ship's wheel, the Pause ▸ Steering toggle with its New! badge, the settings record, and the helm turning by −playerTurn(). Also done: the shipyard rudder row through SHIPYARD with its storage rule; the powder and settings records via loadRecord, the feats max-merge, tips up to 65535, and the storage listener for these records; buildPlayerMesh passes powder (kegs); the __game specials, turn and settings API. Without ?kraken=1 everything is gated off. A seeded replay of all six levels is bit-identical to HEAD. battle.cjs passed 182/182, controls.cjs 232/232 and smoke.cjs 94/94, all run on a mirror of the published files.

**Files:** src/main.js, index.html, style.css

**Brief, item by item**

- Imports/state: RUDDER, SHIPYARD, MAX_FEATS; POWDER_KEY/SETTINGS_KEY; state.powder and settings via loadRecord (WITH_KRAKEN only; defaults otherwise); state.loads; input.steer; TIP bits 256..32768. Verified by p7-saves (corrupt records fixed and rewritten) and p5 (no flag: records ignored).
- turnRate/playerTurn: TURN_LOW = RUDDER.values[0]; the rudder's turnLow via playerType; input.steer; helm reads −playerTurn() (WITH_KRAKEN; raw keys otherwise). p2: rudder tiers give slow/fast rates 0.49/1.40, 0.735/1.47, 1.001/1.54, 1.288/1.61 (= §3.1); steer(0.5) turns half as fast as a held key.
- speedMul/turnMul/mayFire/speedCap: statusMuls + mechanics.shipMods + a krakenMods() seam (kraken.playerMods(), identity now); decelOf(): a stinky ship coasts to a stop at 2× accel. p1: frost cap ×0.5, stink cap 0, no fire.
- fire(): ammoRow() for range/spread/reload; specials.spendLoad per side when it really fires; outOfSpecial() sets state.ammo='round' directly (no AMMO_SWAP, no click), says 'Out of Fire shot! Round shot loaded.' in the hint and #game-live, and turns a queued special on the other side into round; chain/grape launch sounds only. p2: Space with one load fires 3 fire + 3 round in one step; a queued tap spends a load only when it fires and is dropped by an ammo change.
- ballHit: special balls resolved as round, then specialShot; armourMul(aspect, armour, crit) (1A request) + info.clang; pseudo targets get a beam-on target. p2: Iron Turtle beam hits 6.25 (base 10, ×0.5 after range fall-off), CLANG! pop.
- damage(): applyShotStatus at the end (not on a ship it sank or made strike), once per volley per target through the volley's target record; pops (fire/frost/stink styles, KA-BOOM mod kaboom, IMMUNE info), r.sfx, #game-live via WORDS3.live; the KA-BOOM +15 burst bypasses armour, with a ≤ 0.25 flash at most once per 3 s (soft tint under reduced motion). p1/p8: all statuses, immunities, KA-BOOM, FIRE OUT, pegs.
- updateEffects: stepStatus (allocation-free when there is no status); one shared burn (startBurn/stopBurn via mergeBurn, burnRate/burnFrom; the keg path gives bit-identical results); burns pause on the glued pair (WITH_KRAKEN); every status holds still on the boarding target from hook to result; stink end → Clothes-pegs! pop + live. p8: the stink held at 3.99 s through hook, reel, swing and brawl.
- Statuses cleared on strike (checkSurrender), capture (captureShip), escape (escapeShip) and flee (ctx3.flee → clearStatus); ctx3.douse implemented (douseShip: FIRE OUT!). p8: strike clears status and fire; the prize never burns.
- canGrapple 'hot' (GRAPPLE_WHY.hot = WORDS3.hot); Board cell/pill state 'hot' ('HOT! n s' / 'Hot!' with a flame icon); tag icon 'hot' after white/hook; raiderTry refuses a stinky raider (noBoard). Stinky target: Board aria gains 'Stink, then board!'. p1/p8 verified.
- boardingSides: defender grit × statusMuls().grit (stink 0.75).
- updateHud: #ammo-count ('×4') and the pill ('Fire ×4'), the cell shown once a recipe is owned, the boss's #boss-status badge (data-status, word, --left). The tray: 6 buttons rendered with icon, name and loads; aria-pressed; aria-disabled + described reason + crossed icon; aria-expanded on the pill. p3: tray at 9 sizes (320x480 … 1280x720), 2×3 portrait / 3×2 landscape, 44 px at 320/360x480, 568x320 and 640x360, else 52, 8 px above the act pad, right-aligned, no overlap with fire/steer/sail/act pads, hint or gun card; behaviour: pick, fire tap, tap elsewhere, 3 s idle, never pauses; no recipe owned → pill cycles as today.
- Input: keys 4–6 (WITH_KRAKEN), R cycles ALL_AMMO skipping locked or empty specials, 4 with no loads says 'No Fire shot left this level' (p2); thumb slide r = clamp(r0 + dx/56) after 12 px, needle, pad-middle start (p4); the wheel (132/112/104/96 px by screen size, dead zone 0.1, ±120°, springs back in 0.15 s, at once under reduced motion; arrows visually hidden but kept for AT) (p4); #steer-mode-btn (touch + WITH_KRAKEN, last in #pause-choices, aria-pressed, saved, New! badge once via tips bit 32768) (p4: no panel scroll at 390x844, 360x640, 320x480, 568x320, 844x390; desktop shows no toggle). Help texts gain '4–6 special' and 'slide on them for gentle turns' (WITH_KRAKEN). The hint bubble moves clear of the tray and the wheel (placeHint).
- statusfx: created only WITH_KRAKEN, synced every frame (dt 0 while paused), clear on removeShip, emptied on clearLevelEntities. p1/p6: ≤ 5 calls with all three statuses on screen.
- Saves: tips loadInt max 65535 (p7: 33023 kept); syncFeats max-merges MAX_FEATS (1F request); storage listener: syncPowder (mergePowder, rebuild docked ship) and syncSettings (applySteerMode). p7: two tabs merge recipes upward and take the steering setting.
- buyUpgrade via SHIPYARD_ROWS (WITH_KRAKEN ? SHIPYARD : UPGRADES), tier (up[id] ?? 0)+1, the shipyard's own storage rule; rudder row with a wheel icon; renderDock ?? 0. p5: rudder listed 7th, buying writes up.rudder 1 and banks 120; p7: storage full → the purchase lasts the visit and the gold stays in the saved chest until the ship record saves; no flag → 6 rows and buy('rudder') refused.
- buildPlayerMesh passes powder: state.powder (1H request); setPowder rebuilds the docked ship (p5).
- __game: specials {loads, setLoads, powder, setPowder (validated, saved), status, muls, burn, tray, openTray, closeTray, fx, crate (stub)}, steer(x), turn {input, rate, full}, settings {get, set (validated, saved, applied)}.
- Level start: state.loads = startLoads(powder, windmill tier); special tips (bits 256/512/1024, WORDS3.tips) and their banner (screenshot p1).
- Not in this part (later 2A parts): crates, fire-ship 'immune' grapple, fuse/mortar hooks, RAM tag icon, mechanics3 hazards, the Kraken (rise, grab, playerMods consumers, boss notches), env hazards visuals, spout/geyser sounds, __game.mechanics3.wave/spout, kraken API.

**API notes**

New in main.js (battle core):
- ammoRow(id): combat AMMO row or specials.SPECIAL row (both have range/reloadMul/spreadMul/pad/top). Used by fire(), aimTarget, hitsShip, the tutorial and the HUD ranges.
- ownsRecipe(id) / ownsAnyRecipe(): false unless WITH_KRAKEN. specialReady(id) wraps specials.ammoReady. ammoChoices() is the R list.
- outOfSpecial(id): the §2.5 fallback. It sets state.ammo directly, rewrites queued shots of that special to round (so a queued tap still fires, as round), and puts the hint in the bubble and #game-live.
- Shared burn: ship.burnRate and ship.burnFrom ('keg' | 'fire' | null) join burnTicks/burnAcc. startBurn(s, rate, time, from) uses specials.mergeBurn; stopBurn(s); clearStatus(s) also stops a 'fire' burn but leaves a keg burn going, as today.
- applyShotStatus(s, info, hx, hz) runs at the end of damage() when info.status is set. The once-per-volley flag is volleyTarget(v, s).status. Burst damage goes through damage(s, burst, ..., 'kaboom'), so the burst is never multiplied by armourMul.
- douseShip(e) is ctx3.douse. ctx3.flee only clears the status for now: part 2 must add e.fleeing, the fighting() change and the separateShips skip.
- krakenMods(s) is the seam. It returns { speedMul, turnMul, dps, vx, vz } from kraken.playerMods() for the player once a Kraken exists. Only speedMul and turnMul are applied (in speedCap and turnMul); dps and pull belong to the Kraken part.
- canGrapple() can now answer 'hot'. __game.canGrapple returns it too.
- The tray uses DOM #ammo-tray button[data-tap=tray][data-ammo] (TAP_ACTIONS.tray(btn) → pickFromTray) and sr-only spans #tray-why-<id>. It closes on a document pointerdown in the capture phase outside the tray and the pill, and after 3 s of simulated time (step()).
- Steering DOM: #steer-needle gets --turn (−1..1). #touch-wheel gets an inline SVG and an inline transform. .pad.left.wheel-mode and #hud.wheel-mode mark the wheel mode. #steer-mode-btn holds .steer-label and .new-badge.
- New DOM: #screen-flash (hidden; classes on/soft). New CSS block at the end of style.css: flash, .ammo-count, the hot board state, the tray, the needle, the wheel and the steer-mode toggle, plus one rule that hides #pause-choices .tip on touch screens ≤ 340 px tall while the toggle shows.
- Test API: __game.specials.{muls, burn, tray, openTray, closeTray, fx} and __game.turn {input, rate, full}. settings.set saves and applies.

Deviations and choices:
(1) WITH_KRAKEN gates everything new. The records are not read, keys 4–6 do nothing, and there is no tray, slide, wheel, toggle, help text or statusfx. The helm uses raw keys and the glued-pair burn pause is off. Two changes are not gated: tips accept up to 65535 and syncFeats max-merges. Both behave the same for every real value today.
(2) In portrait the hint bubble sits left of the open tray when there is ≥ 180 px of room; otherwise it is raised above the tray. §6.2 says to raise it, but raising it at 320x480 covered the minimap and banner.
(3) The status pop for IMMUNE! uses style 'info', as §2.7 says. pops.js may drop it on a crowded screen; see hook_requests.
(4) The out-of-loads switch happens when a side fires with 0 loads. After the last load the cell shows "Fire ×0" until then.
(5) The wheel is smaller on short screens (104 px when ≤ 500 tall, 96 when ≤ 340, 112 on small portrait), so the act pad stays clear of the minimap.
(6) Statuses hold still on the boarding target from 'hook' to 'result' (all statuses, not only stink). They can't arise during a boarding: your guns are on the ropes and a burning ship can't be grappled.

**Hook requests applied / rejected**

- 1A ballHit: armourMul(info.aspect, s.type.armour, info.crit). Applied.
- 1A damage(): applyStatus with typeKey, boss and burning; burst bypasses armour; mergeBurn for the shared keg/fire burn; stopBurn; pop/why/sfx used. Applied (applyShotStatus).
- 1A updateEffects / enemy speed / canGrapple / boardingSides / reset on strike, capture, escape and flee: stepStatus (paused for the boarding pair), decel coast, noGrapple → 'hot' with WORDS3.hot, grit, newStatus resets. Applied. Flee: status cleared through ctx3.flee; the rest of flee is part 2.
- 1A fire(), keys 4–6, R, tray: ammoReady words, spendLoad per side, state.ammo='round' directly with WORDS3.out, startLoads at level start. Applied. crateLoad is not applied: crates are part 2.
- 1A saves: powder via loadRecord(parsePowder, serializePowder); storage listener uses mergePowder. Applied (WITH_KRAKEN).
- 1F syncFeats: MAX_FEATS merge by max. Applied.
- 1F TURN_LOW → RUDDER.values[0]; buyUpgrade via SHIPYARD with (up[id] ?? 0)+1; shipyard lists WITH_KRAKEN ? SHIPYARD : UPGRADES. Applied.
- 1H buildPlayerMesh passes powder: state.powder. Applied. 1H fire(): no change needed (projectileMesh handles specials). Confirmed.
- 1I statusfx: createStatusFx(scene, { reducedMotion, seaY }), sync every frame (dt 0 when paused), clear on removal. Applied. The kv.statusShip part is for the Kraken (later part).
- 1I #boss-status: dataset.status, WORDS3.badge word, --left. Applied. Pops use the fire/frost/stink styles and the kaboom mod. Applied. The tagIcon 'ram' is part 2 (mechanics3 rams).
- 1J fire(): audio.play(ammo) limited to chain and grape. Applied. 1J crackle: one loop on the nearest burning ship, set({distance, pan}) each frame, stop when the fire is out. Applied. The spout and geyser sounds and setMusicPhase are part 2/3.
- Stage 0: TURN_LOW → RUDDER.values[0]. Applied.
- 1D: no main.js request in my scope. mergeIsland is for 3A's island record.
- Not applied (later 2A parts): 1B ctx3 members (hold, attacking, boarding, capture, turnRate, explode, surrender), fighting/separateShips fleeing, m3 test hooks, envFrame.hazards, moveShip spin, the onSink exploded coins, updateBombs shell/ink, RAM icon/fireRings/fuse, clear-check kraken gating, fire-ship 'immune'; 1C Kraken ctx; 1K/1L/1M env hazards and crates; 1H fuse/mortar.

**Hook requests raised**

- src/pops.js (2E): add a way to mark a pop as never droppable, e.g. a mod 'keep' that pop() honours by skipping DROPPABLE, for IMMUNE! and CLANG! (style 'info'). Why: §0.1 'no hidden traps': IMMUNE! explains why a shot did nothing, and in crowded synchronous volleys the 'info' style can be dropped. main.js would then call pops.pop(word, x, y, z, 'info', 'keep').
- src/upgrades.js (2E or 3B, the RUDDER row only): the shipyard row reads 'Turning when slow: 35% turn when slow → next: 50% turn when slow' because RUDDER.stat and statText('rudder') repeat each other. Shorten one of them, e.g. RUDDER.stat 'Rudder' or statText → '35%' (the spec gives both texts, so this needs the spec owner's choice). Why: readability for a child.
- src/townMode.js (2B / 3A): after a Powder-room purchase, call the main ctx so the docked ship rebuilds. __game.specials.setPowder already calls rebuildDockShip() in the dock; 3A's ctx.powder.buy should do the same (1H request). Why: the kegs show for the recipes owned.

**Live game unchanged**

Everything new is gated on WITH_KRAKEN (voyage.js: true only with ?kraken=1):
- The powder and settings records are not read; state.powder is the default, so there are no recipes, no loads and no kegs.
- Keys 4–6 do nothing. R and the Ammo pill run exactly as today (no specials in the list, no tray).
- The thumb slide, the wheel and the steer-mode toggle are inert or hidden. The help lists are untouched. statusfx and the crackle loop are never created.
- The helm reads the raw keys. The glued-pair burn pause is off. The shipyard lists UPGRADES only, and buy('rudder') is refused.

Code that runs without the flag gives the same results:
- The keg burn now goes through startBurn/mergeBurn with the same numbers.
- statusMuls, krakenMods and decelOf all return identity when there is no status or Kraken.
- ammoRow returns the same AMMO rows.
- The HUD ammo key and the boss-status key reduce to today's.

DOM and CSS:
- The only new element is #screen-flash, which starts .hidden.
- The new CSS targets hidden or absent elements, plus .pad.left { position: relative }, which moves nothing.
- The tips range now accepts up to 65535 and syncFeats merges legend by max; both behave the same for every value the live game writes.

Proof:
- The seeded 6-level replay is bit-identical to HEAD (58/58).
- battle.cjs, controls.cjs and smoke.cjs are all green with no test edits.
- The p5 no-flag probe passes.
- The live files were checked equal to HEAD before publishing and are byte-identical to the dev copy now. They were published with cp to a temp name and mv.

**Verification**

All browser runs: NODE_PATH=/opt/node22/lib/node_modules, SwiftShader chromium, ?quality=low. They were served from the mirror .dock-harness/kraken2/R1-2A-1/mirror (the live repo with my dev files on top), one suite at a time. The machine load average was 8–10 because 2B was running its own suites.

Existing suites, no test edits:
- tests/battle.cjs (full): 182 passed, 0 failed, 25m20s. This ran on the build before two small aria edits (the stinky-target Board aria and aria-expanded on the pill).
- tests/battle.cjs BATTLE_ONLY=ammo,boarding,touch,phone on the final files: 72 passed, 0 failed.
- tests/controls.cjs (full, final files): 232 passed, 0 failed, 34m07s.
- tests/smoke.cjs (full, final files): 94 passed, 0 failed, 13m13s.

No-flag sameness:
- sameprobe.cjs from Stage 0: a seeded 45 s play of all 6 levels with weaving, sail changes, broadsides and boarding presses.
- The live repo (HEAD main.js) against the dev mirror gave IDENTICAL, 58 of 58 samples bit-equal, 0 page errors.
- p5 without the flag: the shipyard shows 6 rows and buy('rudder') returns false. Recipes stay at 0 even with a stored powder record. Key 4 does nothing. There is no tray, no toggle, no help-text change, and statusfx is null.

My probes (scratch /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build2/R1-2A-1/):
- p1-specials: 19 passed, 1 failed on its last full run (FIRE OUT was dropped by the pop throttle while the probe fired volleys in one synchronous stretch); p8 proves FIRE OUT with frames between shots.
- p2-core: 9/9.
- p3-touch: 12/12. The tray at 9 sizes and its behaviour.
- p4-steer: 23/23. The slide, the wheel at 5 touch sizes, the pause toggle and New! badge with no panel scroll, the desktop pause unchanged.
- p5-dock: 5/5.
- p6-look: 2/2. Statuses and a frozen boss at 1280 and 390; statusfx 5 calls; whole-scene draw calls 249 and 239 on L6 with 3 extra privateers and the Phantom.
- p7-saves: 4/4.
- p8-rules: 4/4.

Screenshots I looked at with Read:
- p1-statuses-1280: Ammo cell "Stink ×3", the special-shot tip.
- p3-tray-390x844, 568x320, 320x480: the tray. At 320x480 it was redone after the hint moved beside the tray.
- p4-pause-568x320: the toggle cut off at first; fixed and re-run.
- p4-wheel-390x844 and 568x320.
- p5-dock-390x844: the rudder row.
- p6-look-1280x720 and 390x844: flames, icicles, plates, the stink cloud, tag badges, the FROZEN boss badge, HOT! on the Board cell and pill.

`node --input-type=module --check` passes on main.js. The full npm test was not run, as instructed.

**Open issues**

- Later 2A parts still to do in main.js: crates (__game.specials.crate), the fire ship's 'immune' grapple, fuse and mortar hooks, the RAM tag icon, the full mechanics3 ctx3 and flee (fleeing flag, fighting(), separateShips), hazards (envFrame.hazards), bomb kinds, spout and geyser sounds, the whole Kraken (rise, grab, krakenMods dps and pull, boss notches, #grab-strip, the checkpoint), and the __game.mechanics3 and kraken hooks.
- The pause dialog's '.tip' line is hidden on touch screens ≤ 340 px tall while the Steering toggle shows, so the panel fits at 568x320. At go-live, 3C's K4 checks will see the toggle; my p4 probe already checks the five touch sizes with no panel scroll.
- In synchronous probes many pops in zero real time hit the pops.js throttle (8 a second, queue 0.4 s), and 'info' pops (IMMUNE!, CLANG!) can be dropped. In real play the volleys are seconds apart. There is a hook request for a never-drop mod.
- The shipyard's rudder row text repeats itself ('Turning when slow: 35% turn when slow'). There is a hook request for upgrades.js; it is a spec-wording choice.
- §6.2 says to raise the hint bubble above the open tray in portrait. I place it beside the tray (left of it) when there is ≥ 180 px of room, because raising it at 320x480 covered the minimap and banner. If the spec owner prefers it raised, change HINT_BESIDE in main.js.
- The machine was loaded (load average 8–10, 2B's suites ran in parallel) but no suite flaked: battle, controls and smoke all passed first time.

### 2B

2B (town integration) is done and published. src/townMode.js and src/town.js were published atomically (cp to a temp name, then mv) and are byte-identical to the dev copies in /home/user/First-project/.dock-harness/kraken2/R1-2B/dev/src.

With ctx.withKraken true, the town gets:
- Six places: shipyard, tailor, tavern, quiz, builder, ship. The bar gets class 'six' so 2E's CSS can make it compact. The Quiz and Build buttons in the bar and the Harbour menu are shown. Prompts at the new places say "Play" and "Build".
- Views 'quiz' and 'build'. They create quizPanel and buildPanel once, with the ctx from their api_notes. Keys go to panel.onKey first. Esc returns to the town with focus on the place's button.
- The build view: focusing a plot glides the camera to sparrow's plotPose, arcing up over the roofs, and frames the plot box beside the panel. Where the free area is too small (a phone's bottom sheet), the lens backs off. Under reduced motion it is a cut.
- The montage: celebrate calls env.setIsland(cfg, { built }) and env.setRank. When the building stands, it calls setVillagers, cheers and sparkles. skipCelebration calls env.finishBuild. A key or tap also skips sparrow's montage if it runs longer than the panel's own wall-clock window, which happens at low frame rates.
- The tavern's Powder room, built with specials.js RECIPES, onSale, buyRecipe and WORDS3. Main's powder.buy writes the record first and the chest second. On success the docked ship is rebuilt through ctx.rebuildShip. The rumour board shows the powder tips.
- Greetings: villagers, Bess and Barnacle have their own lines, and the octopus pet gets "Is that a baby kraken?!".
- town.js applies 1N's subjectBox/panelPose hook for 'quiz' and 'build'.

Without withKraken the town is exactly today's:
- The DOM, cameras, walking and focus are identical to HEAD in 9 states, at 1280x720 and 390x844.
- tests/town.cjs: 130/130 on a copy with HEAD's main.js and the dev files, and 130/130 on the repo with 2A-1's published main.js.

Exit checks:
- Layout at the 7 sizes: 91/0 with the proposed 2E six-button CSS injected. The CSS itself is still 2E's job (see hook requests).
- Key and tap paths: 20/0 at each of the 7 sizes.
- Walking-bug probe with 8 villagers: 240/240 crossings, worst stall 0.4 s, porter check 10/10.
- Draw calls: at most 265, under the 450 budget.

**Files:** src/townMode.js, src/town.js

**Brief, item by item**

- Six places (SPEC3 §7.1/§8.3) with withKraken: done. PLACES = shipyard, tailor, tavern, quiz, builder, ship. The quiz/builder buttons in the bar get icons (a bell; a house with a hammer, so it can't be mistaken for the shipyard's mallet) and aria-labels 'Walk to the quiz' / 'Walk to Builder Bess', and are unhidden. The bar gets class 'six'. #harbour-quiz-btn and #harbour-build-btn are filled and shown. Verified in layout.cjs (bar contents at the 7 sizes) and kbd.cjs (places-bar click/tap walks to each place and opens it; the Harbour Quiz button opens the quiz).
- Views 'quiz' and 'build': done. The panels are created once with root #quiz-screen / #build-screen and the ctx from their api_notes: quiz/purse/unlocked/hints/island/audio/reducedMotion/back/react, and island/purse/audio/reducedMotion/back/focusPlot/celebrate/skipCelebration. open('builder') shows view 'build'. leavePanel/close close the panels. onResize, chest changes and record changes call panel.refresh(); the quiz panel is not refreshed on its results screen, so its coin can land. Verified at 7 sizes by kbd.cjs.
- Keys go to panel.onKey first, after the modal check: done. 1-4, H, Enter, a held Enter, and Esc stepping back (round -> map -> town) all work through main's real window listener. Focus returns to place:quiz / place:builder. kbd.cjs, 7 sizes: answers by number keys, H throws a lifebuoy (Sea School tier 2 gives 2), a held Enter moves on once, 3 stars pay +100 with the record saved before the chest.
- Build montage: done. celebrate -> env.setIsland(cfg, { built }) and env.setRank(rank(cfg).name); it returns buildTimes + 0.3 s = 2.4 s. When sparrow's montage ends, setVillagers(villagers(cfg)), a cheer, a sparkle and env.npcReact('bess', 'cheer') follow. skipCelebration -> env.finishBuild. Added: a key or tap skips sparrow's montage when it outlasts the panel's wall-clock window, which a slow frame rate causes; found by kbd.cjs at 360x640, 844x390 and 1024x600, fixed, and now 20/0 there. Verified: a Cottage built once with a held Enter, a key skips, 2 villagers walk out, storage refused costs nothing.
- focusPlot framing, including portrait (1O 1b hook): done. The camera glides to env.plotPose(id) over 0.9 s, arcing up by min(9, 0.35 x distance) so it doesn't pass through palms. It frames the plot box (footprint x tier height) beside the panel. town.js backs the lens off along its view when even a 75 degree lens can't fit the box (the fit flag). Under reduced motion it is a cut (kbd: 21 u in 2 frames, then still). plots2.cjs at 390x844: all 10 plots framed, 0 glide samples inside any blocker or camera volume. Contact sheet looked at.
- town.js subjectBox/panelPose (1N hook): done. placeOf(view) maps 'build' to 'builder'. The cam-target box is added for 'tavern', 'quiz' and 'build'. Also added: setPanel(view, el, subject, { secs, cut }) accepts a pose subject; the getter `panning`; frameBeside returns need/max/depth.
- Tavern Powder room (1A hook): done. #tavern-powder-list sits outside #tavern-up-list, with a 'Powder room' heading. Each recipe row shows its icon, name, '<n> loads every level start (Windmill +k)' and WORDS3.blurb, plus one .buy-btn[data-powder] that reads: Buy price, Owned ('Press 4 in battle' / 'Tap Ammo in battle'), Soon (with WORDS3.locked as the reason), 'Need N more gold', or storage refused. All are aria-disabled with the reason; a double click buys once. kbd.cjs: storage full means no gold moves; then Enter buys; the record is written before the chest; rebuildShip is called once. town.cjs' tavern checks (4 rows, buys === 4 in #tavern-up-list) are untouched.
- Powder tips on the rumour board: done. WORDS3.powderTip for owned recipes (fire, stink) is shown, including on the 'No news' note. Rumour 'Bring:' also names the special shots. Verified: 'Powder tip: The Maw laughs at fire!' after buying Fire; 'Ghosts can't smell!' after Stink (screenshot).
- Rebuild the docked ship after a recipe purchase (1H hook): done in townMode via the optional ctx.rebuildShip(), skipped when buy() returns { rebuilt: true }. Main's ctx has to provide it (hook request). Verified with the harness main: rebuilds 1.
- Prompts: done. 'Professor Barnacle's Riddle Bell — Play' and 'Builder Bess — Build' (Enter on desktop); screen-reader text 'press Enter to play' / 'to build'. The action button reads Play or Build with the place's icon. Seen at 320x480 and 568x320, where the prompt wraps to 2 lines and fits.
- Villagers' greetings (§8.4, 1G and 1N hooks): done. town.js bubbleAt passes villager/home/npc, and simulate returns greetBy. Villagers say "Lovely house, Cap'n!", 'Fresh biscuits today!' (with a Bakery) and 'The Kraken? Brrr!' (feats.kraken >= 1). Bess and Barnacle have their own lines. The octopus pet gets 'Is that a baby kraken?!' (for any captain wearing it). The words for non-villagers are unchanged.
- KRAKEN_ITEMS kept out of the wardrobe and log unless withKraken: kept. It now reads the same KRAKEN flag.
- Harness with a mock ctx, withKraken true and false: done.
- Mirrors: b0 = HEAD; m0 = HEAD main + dev town files; mk = HEAD main patched with a 3A-like ctx (scratch patchmain.py) + dev files.
- withKraken true: layout.cjs (7 sizes, 91/0), kbd.cjs (7 sizes, 20/0 each), smoke1.cjs and phone1.cjs (screenshots), draws.cjs.
- withKraken false: eq.cjs, all states identical; town.cjs 130/0.
- Walking-bug probe of §13.2 with 8 villagers: done. 1N's bridgeprobe.cjs ran against mk with an island record of four Manors (8 villagers drawn on dock open). 240/240 crossings of the 4 bridges (key, stick and tap, both directions, 10 moments), worst stall 0.4 s, porter 10/10, 30 s of random input worst 0.27 s (bound 1 s), 0 villager stops on bridges, place circles, doors or the gangplank, LOOK-2 moved 0, no page errors. Its 90 s tour opened the quiz and build panels on arrival.
- Existing tests/town.cjs green: done, run at the end on the repo as published, including 2A-1's main.js, index.html and style.css: 130 passed, 0 failed.
- Six-button bar CSS: not done here. town.css belongs to 2E; the exact rules are in hook_requests and were tested by injecting them.

**API notes**

ctx members townMode reads (SPEC3 §11.1; every member optional; withKraken is read once, at creation):
- `withKraken`: a boolean, or a function returning one.
- `unlocked()`: the highest level reached.
- `powder: { state() -> the powder record, buy(id) -> { ok, reason?: 'storage'|'owned'|'locked'|'poor'|'unknown', rebuilt? } | bool }`.
- `island: { state(), build(id) -> { ok, reason?, cost? } | bool }`.
- `quiz: { record(), save(rec, gold, info) }`: quizPanel's contract, passed straight through.
- optional `hints()` and `rebuildShip()`.
townMode parses the records itself with parsePowder and parseIsland.

Views: 'shop' | 'town' | 'tailor' | 'tavern' | 'quiz' | 'build'. The place id is 'builder'; only the view is 'build'.

New test hooks on `townMode.api` (`__game.town.api`):
- `withKraken`, `places`
- `quiz` and `build`: quizPanel.api and buildPanel.api, or null
- `plotFocus`, `montage`, `focusPlot(id)`, `greetLine(who)`
- `tavern.powder(id)`
- `api.town.panning`: a panel camera is still moving. Wait on it, not on the wall clock.

New town.js API:
- `setPanel(view, el, subject, { secs, cut })`. subject may be `{ pos, target, points, fit }`. A glide to a pose arcs up.
- `panelPose` has `fit` for 'quiz', 'build' and pose subjects. The lens backs off along its view when `need > max`.
- `frameBeside` returns `{ ..., need, max, depth }`.
- `getter panning`.
- `simulate()` result gains `greetBy`.
- `update().greet` and `.bubble` carry `villager`, `home` and `npc`.

DOM townMode adds only with withKraken:
- `.six` on #town-places.
- `h3#tavern-powder-h.tav-h.powder-h` before #tavern-powder-list. The list gets aria-labelledby and loses `hidden`.
- Rows `li.up-row.powder-row[data-powder-row]`, each with `.buy-btn[data-powder]` and `.up-why#tav-powder-<id>-why`, plus `.rumour-tip` lines.
- The panels add their own DOM: #quiz-feedback, #build-town and #build-note.

Sparrow env calls, all guarded by typeof: plotPose, plots, setIsland(cfg, { built }), setRank, setVillagers, finishBuild, buildTimes, montage, villagers. env.npcReact(who, what, secs) is called if it exists (it doesn't yet; hook request).

Deviations from SPEC3:
1. Who calls env.setIsland. 1N's hook had main call setIsland({ built }) after a build. Here townMode's montage calls it (celebrate). Main's island.build must not, or the montage never starts because the tier would no longer have changed.
2. A key or tap also skips sparrow's game-time montage after the build panel's 2.4 s wall-clock window.
3. The Bess and Barnacle greeting lines ("Fancy a new house, Cap'n?", "A riddle for you, Captain?", and so on) are my own words; §8.4 names only the villagers' lines.
4. Prompt verbs for the new places are 'Play' and 'Build' instead of 'Go in'.

**Hook requests applied / rejected**

- (1A) townMode Powder room: applied. Uses RECIPES, onSale, buyRecipe (pre-check), WORDS3.blurb, locked and powderTip. Main's buy writes the record first and the chest second, and townMode reports a refusal with no gold moved.
- (1F) KRAKEN_ITEMS hidden unless withKraken: kept (the coordinator's change). It now reads the same once-read flag.
- (1G) greetLine octopus: applied. 'Is that a baby kraken?!' for pet 'octopus'; 'Is that a parrot?!' for other pets.
- (1H) rebuild the docked ship after a recipe purchase: applied in townMode via ctx.rebuildShip. The main side is in hook_requests.
- (1N) townMode greetings from folk() villager/home/npc: applied. town.js passes them through bubbleAt and greetBy.
- (1N) townMode build-view glide to env.plotPose framing the plot box beside the panel: applied, with an arc and the portrait back-off.
- (1N) town.js subjectBox/panelPose for 'quiz' and 'build' with placeById(view === 'build' ? 'builder' : view): applied.
- (1O) create the panels once with their ctx; open('builder') shows 'build'; leaving closes; onResize and chest changes refresh: applied.
- (1O) key handler: panel.onKey first in the 'quiz' and 'build' views; Esc via the panel's ctx.back, with focus returned to the place's button: applied.
- (1O) 3D side: applied. react('right'/'results') makes the captain cheer and sparkle and calls npcReact; 'open' and 'map' frame the bell; focusPlot; celebrate and skipCelebration.
- (1O, Stage 1b) celebrate -> env.setIsland(island.state(), { built: id }) + env.setRank(rank(...).name), returning the montage length; skipCelebration -> env.finishBuild(): applied.
- (1O, Stage 1b) focusPlot portrait framing beside the bottom sheet: applied (fit/back-off in town.js; 10/10 plots framed at 390x844).
- (1N, optional, owner 3D) town.js squeeze-past projected onto the nearest walk.links segment, so sparrow can drop its bridge exemption: rejected this round. It would change walking in the live game, which must stay exactly today's; it is listed as optional for 3D, and the 8-villager bridge probe passes with sparrow's exemption.

**Hook requests raised**

- town.css (2E): add the §7.1 six-button bar. townMode puts class 'six' on #town-places only with withKraken. Tested by injecting exactly these rules (layout.cjs 91/0 at the 7 sizes; the bar is 300 px):
  ```css
  @media (max-width: 759px), (orientation: landscape) and (max-height: 560px) {
    .town-places.six { gap: 4px; padding: 5px; }
    .town-places.six .town-place { width: 44px; min-width: 44px; height: 44px; min-height: 44px; padding: 2px; border-radius: 12px; }
    .town-places.six .town-place svg { width: 28px; height: 28px; margin-top: 0; }
    .town-places.six .town-place .tp-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  }
  ```
  Why: without it, six 56 px buttons overflow 320/360 px portrait and 568x320. The four-button bar is unaffected because the class is absent.
- town.css (2E, optional polish): style the Powder room parts townMode emits.
  - `#tavern-powder-h.powder-h`: a little top margin before the list.
  - `.powder-row.locked`: muted icon, e.g. `.powder-row.locked .up-ico svg { filter: grayscale(.6) }`.
  - `.rumour-tip`: e.g. bold.
  The rows already reuse the `.up-row` and `.buy-btn` styles and pass the 7-size layout and contrast probes as they are.
- src/env/sparrow.js (2E): add `env.npcReact(who, what, seconds)`. Cases:
  - who 'barnacle', what 'ring': the professor points or rings and Quizzle flaps (a right answer, new stars).
  - who 'barnacle', what 'tilt': Quizzle tilts his head (a wrong answer).
  - who 'bess', what 'cheer': Bess cheers when a building stands.
  returns boolean. townMode already calls it, guarded by typeof. Why: §7.3 and the 1O hook ask the 3D set to react, and sparrow's cheer() knows only polly and snips.
- src/env/sparrow.js (2E or 3D, optional): expose the porch wavers' world positions while they wave, e.g. `get wavers() -> [{ x, y, z }]`. Why: so townMode can show the §8.3 'Thank you, Captain!' bubble over them. Nothing shows it today.
- src/main.js (3A, Stage 3; FYI 2A): pass the townMode ctx. A working prototype is scratch patchmain.py. Add to createTownMode({...}):
  - `withKraken: WITH_KRAKEN`
  - `unlocked: () => state.unlocked`
  - `powder: { state: () => state.powder, buy }`. buy: syncSaved(); specials.buyRecipe(state.powder, state.purse, id, state.unlocked); saveRecord('pirates-ahoy-powder') first, returning { ok: false, reason: 'storage' } if it fails; then state.purse -= cost and saveChest(); return { ok: true, cost }.
  - `island: { state: () => islandCfg, build }`. build: same pattern with islandRules.build and 'pirates-ahoy-island'. It must NOT call env.setIsland, setVillagers or setRank: townMode's montage does setIsland(cfg, { built: id }) and setRank at once, and setVillagers when the building stands.
  - `quiz: { record: () => quizRec, save }`. save: 1O's quizPanel contract (record, then chest, then fallback).
  - `rebuildShip: rebuildDockShip`.
  Also in openDock after setEnvironment: if (WITH_KRAKEN) env.setIsland(islandCfg), env.setVillagers(islandRules.villagers(islandCfg)), env.setRank(islandRules.rank(islandCfg).name).
  Why: the town features are wired to exactly this ctx; the harness proves the flow.
- src/main.js (2A/3A, 1H hook restated): buildPlayerMesh must pass `powder: state.powder` to buildShip('player', ...). Why: townMode's rebuildShip after a recipe purchase only shows the new keg if the docked ship is built with the powder record (verified in the harness patch).

**Live game unchanged**

Every new path is behind KRAKEN, read once from ctx.withKraken. Main's townMode ctx has no withKraken, and 2A-1's published main.js leaves the createTownMode ctx unchanged (diffed), so in the live game:
- PLACES is today's four;
- the quiz and builder buttons and the Harbour buttons stay hidden and untouched;
- no `.six` class, no Powder room DOM, no rumour tips;
- the panels are never created (their DOM stays as index.html has it);
- greetLine draws one Math.random from the same lines;
- town.js's new branches run only for 'quiz', 'build' or pose subjects.
The only live-visible change is the octopus-pet greeting, and only for a look that already wears the Baby kraken.

Proof:
- eq.cjs, HEAD vs dev: every town screen and dialog has identical outerHTML; camera position, fov and viewOffset are identical in the tailor, tailor crew and tavern views; the deterministic walk and focus match. At 1280x720 and 390x844 touch.
- tests/town.cjs 130/0, both on the dev copy with HEAD main and on the repo as published.
The new imports (quizPanel.js, buildPanel.js, quizBank.js via quizPanel) touch no DOM at import time.

**Verification**

Browser runs used NODE_PATH=/opt/node22/lib/node_modules, the SwiftShader args, tests/server.cjs serving the repo root, and ?quality=low. Machine load was 3 to 10 (2A-1 running alongside); one browser job ran at a time.

Mirrors in /home/user/First-project/.dock-harness/kraken2/R1-2B: b0 = HEAD; m0 = HEAD main + dev town files; mk = HEAD main patched with a 3A-like ctx (snap/main.k.js, from scratch patchmain.py). Probe scripts are in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build2/R1-2B/.

1. smoke1.cjs (mk, 1280): quiz and build open, plot focus, Cottage montage with 2 villagers, powder buy (record {"v":1,"own":{"fire":1,...}}, chest 2600, rebuilds 1), rumour tip. Errors [].
2. layout.cjs (town.cjs's own probes, both its layout probes and its contrast probe), with the proposed six-button CSS injected: 91 passed, 0 failed. Covers the 7 sizes (touch at 320x480, 360x640, 390x844, 844x390, 568x320; mouse at 1024x600, 1280x720):
   - the town HUD at the spawn, the bell and Bess;
   - the tavern with the Powder room;
   - the Harbour menu, which lists Quiz and Build;
   - the quiz map and a question;
   - the build panel.
   Checked: no page scroll, nothing over 44 px missing, no overlap, contrast at least 4.5:1. Errors [].
3. kbd.cjs, 20 checks, 20/0 at each of the 7 sizes. 320x480, 390x844 and 568x320 passed on v1. The first full run had 3 failures each at 360x640, 844x390 and 1024x600: the 3D montage outlasted the panel's wall-clock window under load. Fixed in v2; those three sizes plus 390x844 and 1280x720 were re-run: 20/0.
4. eq.cjs (b0 vs m0, no kraken, reduced motion so cameras are deterministic): 'ALL STATES IDENTICAL' at 1280x720 mouse and at 390x844 touch. Nine states: shop, town, deterministic walk, tailor, tailor crew, tavern, harbour, aboard, and open('quiz'/'builder') refused. Compared: the outerHTML of every town screen and dialog (minus the random greeting text), camera position/fov/viewOffset, captain position and focus.
5. tests/town.cjs:
   - TOWN_ROOT = a real-file copy (HEAD main + dev town files): 'town.cjs: 130 passed, 0 failed', exit 0.
   - At the end, on the repo as published (with 2A-1's main.js, index.html, style.css): 'town.cjs: 130 passed, 0 failed', exit 0.
6. bridgeprobe.cjs (1N's, mk, island record of four Manors; fromRecord 8, drawn 8): 240/240 across, met 51, worstStuck 0.4 s, porter 10/10, random worst 0.27 s, badStops 0, LOOK-2 moved 0 (closest 0.96 to 1.08), errors [].
7. draws.cjs (1280x720, every plot at tier 3, 8 villagers):
   - town 265, quiz 45, quiz round 45, build 168, tavern 77;
   - plots: homeA 54, homeB 30, homeC 59, homeD 55, bakery 48, windmill 50, lighthouse 61, market 40, school 79, park 75;
   - max 265, under 450.
8. plots2.cjs (390x844 touch): every plot glides from Bess with 0 camera samples inside blockers or camera volumes (max y 10.9 to 16.4). A first layout run had shown market views full of palm fronds: a mid-glide frame taken on the wall clock, with a straight-line glide. Fixed with the arc and the panning getter; probes now wait on panning.
9. node --check passes on both files. Published files are byte-identical to dev (cmp).

Screenshots looked at: s1-*, p1-* (390), layout/six-*, plots/sheet-390 and the raw/fit market pair, c2/* (1280 and 390). Found and fixed:
- the Build icon was a mallet like the shipyard's;
- shack roofs were cropped (plot box heights);
- the market glide crossed the palms.
Not run, as instructed: the full npm test.

**Open issues**

- The six-button bar needs 2E's town.css rules (hook request). Until they land, the six buttons overflow at 320/360 px portrait and 568x320 when withKraken is on. The live game is unaffected.
- The professor ringing the bell and Quizzle's head tilt need sparrow's env.npcReact (hook request). Until then, a right answer and new stars show the captain cheering and a sparkle; a wrong answer has the panel's own Quizzle tilt and the bonk sound only.
- §8.3's 'Thank you, Captain!' bubble over the porch wavers is not shown: sparrow does not expose the wavers' positions (optional hook request). The waving itself is sparrow's and happens.
- Main must not call env.setIsland in island.build, or townMode's montage won't start. Main must provide rebuildShip and pass powder to buildPlayerMesh (hook requests for 3A/2A). The harness prototype of this wiring is scratch patchmain.py.
- Sparrow's scaffold is hard to read in the montage at both sizes. It is sparrow's art (1N listed it as 3D polish).
- Under heavy load the quiz results' coin and the build montage run on different clocks (wall clock vs game time). townMode now lets a key or tap skip a montage that outlasts the panel's window, but the panel's own celebrating flag can end before the 3D building stands.
- 1N's optional town.js bridge-mouth squeeze-past change (owner 3D) was not applied, to keep live walking identical. Sparrow's villager exemption near bridges stays.

## Round R2

**Coordinator test run:** npm test on a snapshot of the round 2 files (identical to the committed ones), started 2026-10-22 05:23:26 UTC: 19 suites, 1,859 checks passed, 0 failed, exit 0. Coordinator change: town.css quiz-sparkle keyframe ends at scale(1) (2D's real bug: 18-24 px of sideways scroll in the quiz panel after a right answer). tests/ashore.cjs is not in npm test yet (3C adds it after 3A); it runs on a patched mirror with ASHORE_ROOT.

### 2E

2E (round 2 module fixer) is finished. I applied all four round-1 hook requests aimed at my files and published each one atomically: (a) a never-droppable 'keep' mod in src/pops.js; (b) statText('rudder', t) in src/upgrades.js now returns just the percentage ('35%'), with 1F's rudder checks in tests/upgrades.test.cjs updated; (c) 2B's six-button places bar (.six), copied exactly, plus the optional Powder room styling in town.css; (d) env.npcReact(who, what, seconds) and the optional `wavers` getter in src/env/sparrow.js. The Riddle Bell now swings for 'ring'. Every change sits behind the Kraken flag or an opt-in, so the live game is unchanged. On the final files all 13 Node suites pass, and so do town.cjs sections places, ashore, draws, layout, touch and review4-world. Each change was also checked the way its Stage 1 owner checks it (probes, harnesses, screenshots); details are under verification. The container restart at 03:45 killed the earlier town run during places. I re-ran it one section at a time and it passed.

**Files:** src/pops.js, src/upgrades.js, tests/upgrades.test.cjs, town.css, src/env/sparrow.js

**Brief, item by item**

- (a) src/pops.js 'keep' mod: DONE and published. pop(text,x,y,z,style,mod): mod may now be up to 3 lower-case words, each adding a pop-<word> class. With 'keep' the pop jumps the queue like an important pop and is never pushed out of the queue. If the rate holds it past QUEUE_AGE it shows late rather than never. With no clear spot it shows least covered, even with style 'info'. When 12 pops are up it is the last one pushed off. Checked with p-pops.cjs (h/pops.html, dev vs base) at 1280x720, 390x844 and 568x320: 18/18. In flood, no-room, 12-up and full-queue cases the keep pops show where base drops them. Without 'keep', frames match base exactly (80 pops, reduced motion too). Also battle.cjs BATTLE_ONLY=hud2,touch,short,phone on a mirror: 44/0. Screenshots pops-keep-* looked at.
- (b) src/upgrades.js: DONE and published. statText('rudder', t) returns '35%' / '50%' / '65%' / '80%', clamped as before. RUDDER.stat stays 'Turning when slow'. In tests/upgrades.test.cjs I changed only 1F's rudder text check and added a row check ('Turning when slow: 35% → 50%', words said once). No pre-Kraken check was touched. upgrades.test 53/53 and cosmetics.test 83/83. Mutation check: the old text fails 2 checks. p-rudder.cjs on a mirror with ?kraken=1 at 1280 and 390: 2/2, and the shipyard row reads 'Turning when slow: 35% → next: 50%' (screenshots looked at).
- (c) town.css: DONE and published. 2B's four .town-places.six rules copied exactly in a @media (max-width: 759px), (orientation: landscape) and (max-height: 560px) block. Powder room styling: .tav-h.powder-h top margin 20px (townMode gives #tavern-powder-h the classes 'tav-h powder-h'), .powder-row.locked .up-ico svg grayscale(0.6) and opacity 0.8, .rumour-tip bold, upright, ink colour. Checks: 2B's layout.cjs on the mk mirror (patched current main.js, ?kraken=1, real town.css, no injected rules) 91/0 at 7 sizes. p-towncss.cjs 20/20: the bar is 300 px, buttons 44x44 at the 5 compact sizes, labels at 1024 and 1280, the bar clears the stick and the action button, and without the flag the bar is pixel-identical to the repo's at 4 sizes. Screenshots bar6-*, powder-*, rumour-* looked at. town.cjs layout section on the final repo: 57/0.
- (d) src/env/sparrow.js: DONE and published. env.npcReact(who, what, seconds) returns a boolean. ('barnacle','ring'): the professor turns to the Riddle Bell and points; the bell, which is now its own 2-mesh chunk on a pivot, swings side to side (at most 0.15 rad, 1.5 swings/s, dying away, still under reduced motion); Quizzle flaps, hops and lifts his beak. ('barnacle','tilt'): Quizzle cocks his head. ('barnacle'|'bess','cheer'): a cheer. It returns false without the Kraken flag or for any other who/what. Default seconds are 1.6 / 1.2 / 1.6, clamped to 0..10. The `wavers` getter returns [{x,y,z,top,secs}] for porch villagers while they wave. Checks: p-sparrow.cjs (1N's h1N harness, dev vs base) 21/21. With the flag, walk equals the fixture (also at tier 3 with 24 villagers). Without it, dev equals base for walk, 40 people, draw calls and pixels. Wavers report 2 people for 2.03 s. 1N's drawprobe (TOWN_ONLY=1, ISLAND=3, ?kraken=1&quality=low): town 30x8 max 401, the same as base and 1N's figure. The shipyard view is +4 calls (the bell's 2 outlined meshes). p-react-mk.cjs on the mk mirror with the real townMode: 20/20 at 1280x720 and 390x844 touch. Screenshots ring/tilt/cheer/mk-* looked at. walk.test 106/106.
- Exit: all 13 Node suites green on the final repo. Each applied request was verified the way its owner would.

**API notes**

pops.js: pop(text, x, y, z, style = 'dmg', mod = ''). mod is a string of up to 3 distinct words, each matching /^[a-z]{1,16}$/; each adds a class pop-<word> (other words are ignored). The word 'keep' marks a refusal word that must be seen: it is queued with the important styles and never pushed out; when stale it still shows (late); with no room it shows least covered; it is the last pushed off the screen at 12 up. A queue holding only keep pops grows by one for a new keep pop and drops any other new pop. Unchanged: return values, rates, every non-keep path (identical to base in the probe). Example: pops.pop(specials.WORDS3.clang, hx, py + 0.2, hz, 'info', 'keep'). The pop element also gets the class pop-keep; fx.css does not style it.
upgrades.js: statText('rudder', t) returns '35%'|'50%'|'65%'|'80%'. RUDDER.stat is still 'Turning when slow'. main.js's row reads 'Turning when slow: 35% → next: 50%' and the purchase announcement reads 'Bought Rudder. Turning when slow: 50%.' This follows the coordinator's choice over SPEC3 §3.1's '50% turn when slow' text.
town.css: .town-places.six rules exactly as 2B gave them (only townMode with withKraken adds .six; the four-button bar is unchanged). .tav-h.powder-h, .powder-row.locked .up-ico svg, .rumour-tip.
sparrow.js (env returned by build): npcReact(who, what, seconds) -> boolean. Cases: 'barnacle' with 'ring' | 'tilt' | 'cheer', and 'bess' with 'cheer'. KRAKEN only (otherwise false). seconds must be finite, is clamped to 0..10, and defaults per reaction. A later reaction replaces an earlier one; 'cheer' clears a ring/tilt and vice versa. Getter wavers -> [{ x, y, z, top, secs }] in world coordinates; top = head top + 0.45, a bubble anchor; secs = how long they keep waving. The array is empty without the Kraken flag or when nobody is waving. The bell is a separate development-layer chunk on a pivot (2 meshes, +4 draw calls in views that see it); it rests at rotation 0 outside a ring. Test hooks used by my probes (scratch only): env.npcReact, env.wavers, and the bell pivot rotation found through the scene. No changes to __game.

**Hook requests applied / rejected**

- APPLIED (a) 2A-1 -> src/pops.js: never-droppable 'keep' mod for IMMUNE!/CLANG! info pops. Applied a little more broadly than asked: beyond skipping DROPPABLE, a keep pop also survives a full queue, staleness and the 12-up limit. Otherwise a keep pop could still vanish through those paths. main.js must still pass 'keep' (see hook_requests).
- APPLIED (b) 2A-1 -> src/upgrades.js: the coordinator's choice. RUDDER.stat stays 'Turning when slow'; statText('rudder', t) returns the bare percentage like the other rows. 1F's rudder text check updated and a row-wording check added in tests/upgrades.test.cjs; pre-Kraken checks untouched.
- APPLIED (c) 2B -> town.css: the six-button bar rules exactly as given, and the optional Powder room styling. Selector .tav-h.powder-h instead of #tavern-powder-h.powder-h: same element, and it avoids an id selector in shared CSS.
- APPLIED (d) 2B -> src/env/sparrow.js: env.npcReact(who, what, seconds) with ring/tilt/cheer, which townMode already calls guarded by typeof. For 'ring' the Riddle Bell itself swings. Also applied the optional `wavers` getter.
- NOT MINE (left for their owners): 2A-1 -> townMode.js powder purchase rebuild (2B/3A); 2B -> main.js townMode ctx (withKraken, unlocked, powder, island, quiz, rebuildShip, setIsland at openDock) for 3A; 2B -> main.js buildPlayerMesh powder (2A/3A). I rejected no request.

**Hook requests raised**

- src/main.js (2A-2 / whoever owns the battle pops in Stage 2), two one-word changes so IMMUNE! and CLANG! use the new 'keep' mod (2A-1's own request; pops.js now honours it). In onArmourHit (line ~2688) change `pops.pop(specials.WORDS3.clang, hx, py + 0.2, hz, 'info');` to `pops.pop(specials.WORDS3.clang, hx, py + 0.2, hz, 'info', 'keep');`. In the status-hit code (line ~2875) change `pops.pop(r.pop, hx, py, hz, style, ev.includes('kaboom') ? 'kaboom' : '');` to `pops.pop(r.pop, hx, py, hz, style, ev.includes('kaboom') ? 'kaboom' : ev.includes('immune') ? 'keep' : '');`. Why: SPEC3 §0.1 'no hidden traps': with style 'info' these words can still be dropped in a crowded volley until main.js passes 'keep'.
- src/townMode.js (2B / 3A, optional, SPEC3 §8.3): show the 'Thank you, Captain!' bubble over env.wavers while it is non-empty (guard with `env && 'wavers' in env`; each entry gives world {x, top, z} as the anchor and secs as the time left). Why: 2B asked for the getter so townMode can show the bubble; sparrow.js now has it, but nothing reads it yet.

**Live game unchanged**

Every change is either opt-in or behind the Kraken flag. pops.js: 'keep' only acts when a caller passes it, and main.js does not yet. Without 'keep', p-pops shows frames identical to base (80 pops, reduced motion too), and battle.cjs hud2/touch/short/phone passes 44/0. upgrades.js: only the rudder row's text changed, and that row is only shown with ?kraken=1 (Stage 1's SHIPYARD gating). Every pre-Kraken upgrades check passes unedited, and cosmetics 83/83. town.css: the six-button rules match only .town-places.six, which townMode adds only with withKraken. p-towncss shows the no-flag bar pixel-identical to the repo's at 4 sizes, and town.cjs layout passes 57/0 at 7 sizes. The Powder and rumour-tip classes are only emitted with the flag. sparrow.js: the bell chunk, npcReact (returns false) and swingBell all run only under KRAKEN, and f.react is never set without it. p-sparrow shows no-flag dev == base for walk data, 40 people, draw calls and pixels. walk.test 106/106, fixture untouched. town.cjs draws, review4-world, ashore, places and touch all pass on the repo without ?kraken=1.

**Verification**

Node, on the final repo files (03:48 UTC): armory 35, combat (pass), cosmetics 83, island (pass), kraken 154, mechanics 121, mechanics3 162, quiz 85, server (pass), settings 16, specials (pass), upgrades 53, walk 106. All exit 0.
town.cjs on the repo (no ?kraken=1, the live game), final files, SCREENSHOT_DIR in scratch, one section per run: places 12 passed / 0 failed; ashore 7/0; draws 5/0 (walk view spawn 216, plaza 170, yard 124, tavern 61, tower 28, garden 338; Polly 41; tavern 66); layout 57/0 (7 sizes); touch 6/0; review4-world 9/0 (rope bridges 48 runs 0 stopped, LOOK-2, squeeze-past 10/10, LOOK-4/5, PERF-1/2/3). Screenshots town.png and tailor.png looked at: the four-button bar is as today.
Earlier in this round, all on the final versions of the files (repo == dev copy, cmp-verified after each restart): p-pops.cjs 18/18 at 1280x720, 390x844 and 568x320; battle.cjs BATTLE_ONLY=hud2,touch,short,phone BATTLE_ROOT=mirror (dev pops) 44 passed, 0 failed; 2B's layout.cjs on the mk mirror with ?kraken=1 and the real town.css 91 passed, 0 failed; p-towncss.cjs 20/20; p-rudder.cjs 2/2; p-sparrow.cjs 21/21; 1N's drawprobe on base vs dev (town 30x8 max 401 both; shipyard 304-309 vs 308-315, the bell's +4; no errors); p-react-mk.cjs 20/20 on the mk mirror (real townMode) at 1280x720 and 390x844 touch. Mutation: the old rudder text fails 2 upgrades checks. In this session I looked again at bar6-390x844, mk-ring-390x844, pops-keep-390x844 and town.png. I did not run the full npm test (the coordinator's job).

**Open issues**

- main.js does not pass 'keep' yet, so IMMUNE!/CLANG! can still be dropped in a crowded volley until 2A-2 applies the hook request.
- Nothing shows the §8.3 'Thank you, Captain!' bubble yet: env.wavers exists but townMode does not read it (hook request to 2B/3A).
- The bell chunk adds 4 draw calls (2 outlined meshes) to views that see the Riddle Bell, with the Kraken flag only. 1N's tier-3 town 30x8 maximum is unchanged at 401.
- I ran town.cjs sections places, ashore, draws, layout, touch and review4-world, not the full town suite (walk, wardrobe, tavern, records, review4 and battle untouched by my files) and not the full npm test; the coordinator runs that after the round.
- Progress log: /home/user/First-project/.dock-harness/kraken2/R2-2E/PROGRESS.md (marked DONE).

### 2D

I finished 2D's brief. tests/ashore.cjs is a new file, published as v8 with cp to a temp name + mv, and only my own runs use it so far.

**Runs on the final files.** I built the mirror .dock-harness/kraken2/R2-2D/mkF at 03:47 from the current tree: HEAD 0602cbe plus 2E's final sparrow.js, town.css, pops.js and upgrades.js. Its main.js is the current one patched with the 3A-like townMode ctx (patchmain2.py). At 05:11 it still matched the repo with 0 differences.
- A single-process run of the published v7 (every section but draws) gave 106 passed, 17 failed, no page errors.
  - 9 of the failures are tagged checks that wait for later work: governor, lighthouse, bakery, gift, tabs-island ×2, tabs-quiz ×2 (all 3A's main.js) and mouth (town.js).
  - 7 are a real town.css bug: after a right answer, the quiz panel scrolls sideways by 18–24 px at all 7 sizes.
  - 1 was a timing flaw in my own suite. The desktop "Back to town" click landed inside the quiz panel's 350 ms tap guard. v8 waits 420 ms first; keys then passed 11/0 twice on mkF.
- draws passed 4/0 on mkF (shipyard 308–315 calls, walk view max 401, quiz view 44, build views max 96; budget 450). Its code has not changed since that run.

**Breaking copies.** I ran 69 mutations, each on a copy of a mirror and never on the repo files.
- 61 failed their expected checks the first time.
- The 8 misses are all resolved: 5 needed two faults (a guard that other code backs up) or my new "never shown" helper; 2 led me to make checks stricter (Frost double click, cut-off build-button labels); and walking (a), which wk-squeeze did not break, fails under wk-stops and wk-look2.
- Every distinct check in the final logs fails in at least one mutation log.

**Two real bugs** (details in open_issues):
1. The quiz sparkle in town.css leaves the panel scrollable sideways after a right answer.
2. A walking wedge at the plaza mouth of the plazaS1 rope bridge stalls the captain for 8.23 s. It is pre-existing and also happens without ?kraken=1.

**Changes to the suite this round:**
- Taps and clicks go through press(): a 20 s wait, then up to 10 s for the tap's effect, because the synthesized click comes after touchend on a busy machine.
- The Frost double-click check also reads the live text, so it catches the "You have the … recipe" message.
- The cut-off-label check also looks at text inside inline spans, and skips badges placed on purpose over a button's edge.

I did not run npm test (the coordinator runs it) and did not edit package.json.

**Files:** tests/ashore.cjs

**Brief, item by item**

- §13.2 ashore suite, all 13 sections (bar, keys, walking, quiz, quiztaps, quizrec, build, perks, powder, tabs, layout, draws, rays): written and published as /home/user/First-project/tests/ashore.cjs (v8, cp to a temp name + mv; byte-identical to .dock-harness/kraken2/R2-2D/dev/ashore.cjs). Verified on mkF, the mirror of the final files, as listed in verification.
- Takes a root option, as asked: ASHORE_ROOT (default: the repo root). Also ASHORE_ONLY (sections), ASHORE_QUERY (default ?quality=low&kraken=1), SCREENSHOT_DIR, and ASHORE_PENDING=<tags>|all, which reports checks waiting for later work as PEND instead of FAIL. After 3A wires the ctx it runs on the repo unchanged.
- Run against 2B's harness design: mirror mk/mkF = a real-file repo copy plus main.js patched with a 3A-like townMode ctx (scratch R2-2D/patchmain2.py, adapted from 2B's patchmain.py to the current main.js). The final run used mkF, built from the final 2E files and checked identical to the repo at 05:11.
- Each check fails on a broken copy: 69 mutations (scratch R2-2D/muts/m1-m4.json, runner mutate.cjs, logs in scratch R2-2D/mut/*.log and logs/mut-m*.log). 61 were caught first time; all 8 first-run misses are resolved (see verification).
- Tagged checks that wait for 3A (governor, lighthouse, bakery, gift, tabs-island, tabs-quiz): proven to pass on the prototype mirror mk3 (patchmain3.py) and to fail on broken copies of it (b-governor, p-lighthouse, p-bakery, p-gift, tb-island, tb-quiz). The [mouth] check passes 240/240 on mkfix (mk + the fixmouth.py prototype) and fails on wk-squeeze.
- Screenshots looked at: quiz.png, build.png and island-tier3.png at 1280x720; the quiz map and build panel at 1280x720 and 390x844 portrait touch. They match what the checks report.
- Not done: the full npm test (the coordinator runs it) and the package.json entry (3C adds the suite to npm test after 3A).

**API notes**

Runs: `node tests/ashore.cjs`, with env ASHORE_ROOT (served copy, default the repo root), ASHORE_ONLY (comma list of sections), ASHORE_QUERY (default '?quality=low&kraken=1'), SCREENSHOT_DIR (default <root>/tests/screenshots), ASHORE_PENDING (tags: gift, bakery, lighthouse, governor, tabs-island, tabs-quiz, mouth, or all).
- Timing on this 4-CPU box (another agent's browser job running at the same time): about 10 min for everything but draws, plus about 9 min for draws.

Game hooks it relies on (2B's api_notes plus the Stage 0/1 __game):
- window.__game.town.{view, open, back, simulate, walkTo, goTo, pos}
- window.__game.town.api.{quiz (mode, round, result, panel, start/answer/next/...), build, auto (place), town (panning, enter), tavern.powder, prompt, harbour, montage, plotFocus}
- window.__game.env.{walk, villagers, folk, plots, montage}
- window.__game.island.config.t, window.__game.quiz.record, window.__game.specials.powder.own
- window.__game.dock.{open, ship, ashore}, window.__game.renderInfo.calls, window.__game.scene
- window.__game.state.{purse, mode, time, wave, intro}, window.__game.audio.play (wrapped to list sounds)

In-page helper window.T: a localStorage.setItem wrapper that records every write and can refuse keys (storage full); T.sig, the state a tap changes (view, walk goal, aboard dialog, quiz mode/level/index/removed/picks), which press() waits on; T.q / T.text / T.shown / T.focus / T.walkView; and the layout probes window.__probe.{town, bar, panel, dialog, contrast}.

What ashore needs from 3A's ctx is what patchmain2.py prototypes:
- withKraken, unlocked
- powder {state, buy}, island {state, build}, quiz {record, save}
- rebuildShip
- env.setIsland / setVillagers / setRank on dock open
- the record written first, then the chest
The tagged checks additionally need the patchmain3.py pieces (see hook_requests).

Deviations from SPEC3 §13.2, and why:
- Walking is hand-stepped with __game.town.simulate in one evaluate, from a fixed clock (P.t=100) with Math.random seeded, and with env.cull run each frame as townMode does. This makes it deterministic: two runs give identical results. Without the cull, hidden villagers never wait for the captain (LOOK-2).
- The walk-view draw sweep (30 spots × 8 headings) is measured at 320x180 (the same 16:9 aspect) for speed; the 8 busiest views are measured again at 1280x720 (max 401 both ways).
- Walking (d) samples env.villagers and counts LOOK-2 waits separately (1N's request).
- Taps and clicks on controls that may never appear go through press(): a 20 s timeout, the failure noted in the check message ("never shown"), then up to 10 s waiting for T.sig to change. Playwright's tap returns before the browser's synthesized click lands.
- The suite waits 420 ms before tapping or clicking a control that just appeared (the panels' 350 ms tap guard).

**Hook requests applied / rejected**

- (1N, stage1-reports 'tests/ashore.cjs') Walking (d) samples villagers through env.villagers, which includes hidden ones, and counts LOOK-2 waits separately instead of as stops. Applied: (d) reports '0 stops; N samples of LOOK-2 waits for the captain there, not counted', and the LOOK-2 check measures the waits on their own.
- The round 1 hook file (build2/r1-hooks.md) and the coordinator notes hold no requests aimed at tests/ashore.cjs, so there was nothing else to apply.

**Hook requests raised**

- town.css (owner now 2E; 3D in Stage 3), @keyframes quiz-sparkle. Change `to { transform: scale(1.15); opacity: 0; }` to `to { transform: scale(1); opacity: 0; }`. Why: after a right answer, the right answer's ::after sparkle (inset -10px, animation fill-mode forwards) stays scaled to 1.15 after it fades out. That leaves 18–24 px of sideways scroll in the quiz panel, so on a phone the panel slides sideways under the child's finger. ashore layout fails at all 7 sizes in the 'answered' state ('the panel scrolls sideways (24 px)' at 390x844 and 1280x720). With the change, layout passes 29/0 (mirror mkcss, log scratch R2-2D/logs/l2css.log). `.quiz-panel .dock-body { overflow-x: hidden }` does not remove the overflow.
- src/town.js (3D in Stage 3; a candidate for a hotfix, since SPEC3 §0.3 says to hotfix a walking bug confirmed live), stepWalk: when the captain walks by hand and has been stuck for 0.25 s, the people-free move is no better, and he stands within 1 u of a rope bridge's mouth pushing onto it (heading within 60° of the bridge), steer him for up to 0.6 s to a point on the bridge's middle line 0.5 u inside the mouth, with cap.pass = 0.8 so he squeezes past anyone there. A working prototype is scratch R2-2D/fixmouth.py (copy in .dock-harness/kraken2/R2-2D/tools/fixmouth.py). Why: the walking bug of §0.3 (see open_issues). ashore walking (b) [mouth] fails without it and passes 240/240 with it (mkfix).
- src/main.js (3A, rows marked 3 in SPEC3 §11.2), needed for ashore's tagged checks. Prototyped in scratch R2-2D/patchmain3.py; on that mirror (mk3) all these checks pass and fail on broken copies. (1) lighthouse: warnBonus() returns islandRules.perks(islandCfg).warnBonus (today `return 0`). (2) bakery: the reinforcement patch uses perks(island).wavePatch instead of WAVE_REPAIR, and the card reads 'Your crew patches N% of the hull'. (3) gift: finishLevel adds the villagers' gift and the Market Hall bonus (capped), with 'Villagers' gift +N' and 'Market Hall +X% +N' lines on the level-cleared card. (4) governor: feats.island is raised when every plot reaches tier 3, so Polly unlocks the Governor's coat. (5) tabs-island / tabs-quiz: the storage listener, and the island build and quiz save, merge -island and -quiz by max before writing, so tiers and stars never go down across two tabs.
- package.json (3C, after 3A): add tests/ashore.cjs to npm test with a test:ashore script. It runs on the repo with ?kraken=1 by default. Until a tagged piece lands, run with ASHORE_PENDING=<its tag>.

**Live game unchanged**

My only file is tests/ashore.cjs. It is new and untracked, it is not in package.json or npm test, and no game page loads it, so nothing reaches the published site; the live game looks and behaves as today, with or without ?kraken=1. All suite runs served mirrors under .dock-harness/kraken2/R2-2D (mk, mk3, mkfix, mkcss, mkF). Mutations broke hard-linked copies of those mirrors, unlinking each edited file before writing it, so neither the mirrors nor the repo were ever written to. git status shows only 2E's files plus tests/ashore.cjs. I made no edits to src/, index.html, the CSS files, vendor/ or package.json, and ran no git commit, push, reset or checkout.

**Verification**

All browser runs used Playwright chromium with swiftshader and tests/server.cjs, one browser job of mine at a time.

**Mirror mkF.** Built 03:47 with scratch R2-2D/mkmirror.sh (HEAD 0602cbe plus 2E's final files: sparrow.js 5ce0c5ae, town.css 3627bf47; main.js ba3c287f patched). Re-checked at 05:11 against git ls-files: 0 differences besides the patched main.js.

**Section runs on mkF:**
| Section | Suite version | Result | Notes |
|---|---|---|---|
| bar | v7 | 29/0 | |
| keys | v3, then v8 | 13/0 with quiztaps (v3); 11/0 twice (v8) | |
| quiztaps | v3 | in the 13/0 above | |
| walking | v3 | 6/1 | only [mouth]: m0 plazaS1 stick, 8.23 s stall |
| quiz | v3 | 15/0 | |
| quizrec | v3 | 8/0 | |
| build | v3 | 10/1 | [governor] |
| perks | v3 | 3/3 | [lighthouse], [bakery], [gift] |
| powder | v4 | 7/0 | |
| tabs | v3 | 2/4 | [tabs-island] ×2, [tabs-quiz] ×2 |
| layout | v7 | 22/7 | the sparkle sideways scroll, 18–24 px |
| rays | v3 | 2/0 | |
| draws | v3 | 4/0 | 528 s |

Each count includes that run's 'no page errors' check.

**Single-process run of the published v7** (ASHORE_ONLY = every section but draws): 'ashore.cjs: 106 passed, 17 failed', errors: none (scratch logs/FINAL.log). The extra failure was the keys desktop 'Back to town' tap-guard timing, fixed in v8.

**Earlier versions on mkF.** v3's quiztaps crashed and keys failed 10/1 on the busy machine (taps landing late). v5's text check flagged the answers' ✓ / 'your pick' badges (absolutely positioned 6–8 px over the top edge on purpose, town.css:855); v7 skips such badges.

**Mutations** (scratch R2-2D/mutate.cjs: cp -al copy of a mirror, unlink-before-write, run the named sections):
- m1 (24 quiz/quiztaps/quizrec/keys): 20 caught. q-held, t-taps, k-view and k-harbour missed, then caught as m3 q-held2, t-taps2, k-view2 and k-harbour2 (two faults, or the never-shown helper).
- m2 (38): 34 caught.
  - b-guard missed (the swallowTap guard backs it up); m3 b-guard2 caught.
  - w-guard missed (the 'owned' check backs it up); the check now also reads #tavern-live and m4 w-guard2 caught it ('You have the Frost shot recipe…').
  - wk-squeeze: its (a) expectation missed (longest 0.83 s), while (b) 127/240 and (c) were caught; (a) fails under wk-stops (1.6 s) and wk-look2 (1.1 s).
  - l-bbtn missed (label clipped inside an inline span); m4 l-bbtn2 caught at all 7 sizes ('Build Cottage — 100 gold' 20–34 px past the left).
- d-heavy (260 extra meshes) failed the 3 draw checks.
- Every one of the 126 distinct check prefixes in the final logs appears as FAIL in at least one mutation log (scratch checks.txt vs mutfails.txt).

**Two bugs reproduced on mirrors:**
- Sparkle: fails on mk and mkF; mkcss (the keyframe fix) passes layout 29/0.
- Mouth wedge: 239/240 on mk and mkF; 240/240 on mkfix.

Screenshots looked at: quiz.png, build.png, island-tier3.png, ashore-quiz-map and ashore-build at 1280x720 and 390x844.

Not run: the full npm test (the coordinator's job).

**Open issues**

- REAL BUG (town.css, quiz panel): after a right answer, the quiz panel has 18–24 px of sideways scroll at all 7 town sizes (320x480 19, 360x640 22, 390x844 24, 844x390 24, 568x320 18, 1024x600 19, 1280x720 24). Cause: .quiz-ans.right::after (inset -10px) runs quiz-sparkle with fill-mode forwards and ends at scale(1.15), opacity 0, so the invisible sparkle keeps overflowing. Evidence: ashore layout 22/7 on mkF (scratch logs/F-layout-v7.log); with the keyframe ending at scale(1), mkcss passes 29/0 (logs/l2css.log). Fix in hook_requests.
- REAL BUG (src/town.js, the §0.3 walking bug), pre-existing and also live without ?kraken=1 (3/720 runs, scratch logs/probe6-nok.log). At the plaza mouth of the plazaS1 rope bridge, a townsperson coming off the bridge stops for the captain (LOOK-2) and pushes him into the corner beside the mouth. He is pinned against the rope with the person 0.62–0.67 u away, so the squeeze-past (cap.pass) never starts, and he creeps at 0.03 u/s. A held stick (0.09, 0.88) stalls 8.23 s and does not cross in 14 s; a held key stalls 3.2 s. Deterministic in ashore walking (b) [mouth] (fixed clock, seeded): 239/240 crossings on mk and mkF, 240/240 with the fixmouth.py prototype (mkfix). Probe logs: scratch logs/probe5.log and probe6-nok.log.
- Until 3A lands the ctx and the §11.2 row-3 pieces, the suite runs only on a patched mirror (scratch R2-2D/mkmirror.sh) and 9 tagged checks fail on it: governor, lighthouse, bakery, gift, tabs-island ×2, tabs-quiz ×2, plus mouth for town.js. Use ASHORE_PENDING=<tags> to report them as PEND. After 3A, run it on the repo and drop the tags as each piece lands.
- Timing: draws takes 9–12 min, and the rest about 10 min on this machine when another browser job runs at the same time. Under that load Playwright taps took up to about 6 s to become actionable, and a tap's click can land after page.tap returns; press() now absorbs both. Expected checks that fail as a 'never shown' control wait up to 30 s each, so a broken copy can take 3–5 min (k-view2: 323 s).
- The mutation proofs ran on mirrors built before 2E's final sparrow.js and pops.js (mk/mk3/mkfix/mkcss, which share the final town.css). The checks themselves were re-verified on mkF, the mirror of the final files.
