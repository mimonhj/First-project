# Kraken Seas, Stage 4 review

A review of the live update (commit `8afd067`, `WITH_KRAKEN = true`) in the seven dimensions of SPEC3 §12. Each reviewer played and probed a frozen copy at 390x844 (touch) and 1280x720. Every finding then went to an independent skeptic, who tried to refute it from scratch on a fresh copy. The fixes were made by three agents with disjoint files (FX-main, FX-balance, FX-town), each with a regression check that fails on `8afd067` and passes after the fix. SPEC3 §19 "Stage 4 (review)" lists every change. The reviewers' and skeptics' notes, scripts, logs and screenshots are in the session scratchpad (`kraken/review4/`).

## Summary

| Finding | Reviewer | Skeptic | Title | Outcome |
|---|---|---|---|---|
| SPS-1 | major | real, major | Special loads are not refilled when the Kraken rises, yet the rise banner tells the child to use Stink shot | Fixed: loads refill at the rise (main.js `refillLoads()`); voyage3 `kraken-fix4`. |
| SPS-2 | minor | refuted | Fire shot is never better than round shot against the Iron Turtle it is sold as the counter for | Refuted: as SPEC3 §2.2 and §4.2 say. No change. |
| SPS-3 | minor | real, minor | On a stock ship level 9 is a wall: the Inkheart sinks you on half of first tries, and the Kraken fight then lasts over 5 minutes | Tip added (main.js `playerSunk`: no Extra cannons or no Heavy shot -> "Extra cannons and Heavy shot from the shipyard will help."); no numbers changed (bot evidence in SPEC3 §19); voyage3 `kraken-fix4`. |
| kraken4:F1 | major | real, major | In the Last Stand on a portrait phone, the red grab rings and slam rings are mostly off the right edge of the screen for their whole 1.5 s warning | Fixed: rings near your ship join the framing's must-see group (main.js `collectFrameRings`, `FRAME.ringReach` 8 u); voyage3 `kraken-frame`. |
| kraken4:F2 | minor | real, minor | BULLSEYE! pops once per cannonball, so every broadside at the eye stacks up to four BULLSEYE! words over the eye or the ship | Fixed: the part's word pops once per volley (main.js `damagePseudo`); voyage3 `kraken-fix4`. |
| kraken4:F3 | minor | refuted | With a weaker ship or at full sail, the Kraken fight drags to 4-7 minutes with little danger (3B's 140 s median comes from a much sharper bot) | Refuted: within spec at the default sail. No change. |
| QUIZ-1 | minor | real, minor | The professor's 'Not quite! It's X.' line is ungrammatical for many bank answers ('It's It's far too salty.', 'It's Hello there!.', 'It's To hide and escape.') | Fixed: "Not quite! The answer is: X" (quizPanel.js `wrongLine`); ashore `quiz` checks every bank answer. |
| QUIZ-2 | polish | real, polish | A perfect first round is captioned '+10 gold — Good try!' right under '5 of 5 right: all three stars!' | Fixed: "Good try!" only after a round with no star (quizPanel.js `renderResults`); ashore `quiztaps`. |
| TOWN-TAPNPC | minor | real, minor | Tapping Builder Bess (or Professor Barnacle) does not take the captain to them: he walks past Bess, or into her, and no Build/Play prompt appears | Fixed: a tap on Bess or Barnacle walks into their place (town.js `pick`); town `kraken4`. |
| SAVES-1 | major | real, major | After a wreck at the Kraken, going to the dock silently drops the Kraken checkpoint. The dock's "Try again: The Kraken's Deep" restarts all of level 9 (waves and the Inkheart). | Fixed: the shipyard keeps the checkpoint (shipwreck card and pause menu routes), its exit reads "Try again from the Kraken", and the leave question is honest (main.js `krakenRetryHere`); voyage3 `kraken-fix4`. |
| SAVES-2 | polish | real, polish | Leaving in the ~4.5 s after the Kraken is driven off, before the Pearl reaches you, drops the Pearl's 1,000 gold and all of level 9's plunder | Fixed: leaving once the Kraken is driven off wins the level and banks the Pearl (main.js `takePearl`); voyage3 `kraken-fix4`. |
| A11Y4-1 | minor | real, minor | On small portrait phones, the level banner's text is drawn over the open ammo tray, so neither can be read | Fixed: the banner moves left of the open tray on short portrait screens (style.css); battle `kraken-tray`. |
| PERF-WARM-FIRSTDRAW | minor | refuted | The shader warm-up compiles each program but leaves its first draw for later, so the first waterspout, the first ink slick and the dread bubbles still stall the frame they appear in (this is the cause of the long frames at the dread, queued item c) | Refuted: SwiftShader-only, nothing reaches a child. No change. |

## Special shot and balance

**What the reviewer checked and found fine**

I reviewed a frozen copy of 8afd067 in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/specialshot/tree. Notes, scripts and results are in that review4/specialshot folder: NOTES.md, scripts/, out/, shots/. I ran one browser job at a time.

What I checked and found fine:

- **Code.** specials.js against SPEC3 §2 (statuses, interactions, immunities, loads, crates, record validation), and main.js fire(), outOfSpecial, ballHit, damage, applyShotStatus, burn/douse, the crates and the tray. mechanics3 (fire ship giveUp on frost; stink pauses ram, mortar and gun clocks), the Kraken specials, and townMode's Powder room and buy flow (record first, then the chest). battle.cjs kraken-* and voyage3 'specials' already cover each status, KA-BOOM, FIRE OUT, IMMUNE, CLANG, HOT!, stink plus boarding grit and pause, the fire-ship strike, a raider dropping its hooks, and the out-of-loads fallback, so I did not redo those.
- **Readability.** I looked at three ships on fire, frozen and stinky, balls in flight, the HOT! pill, tag badges and the Powder room, at 390x844 touch and 1280x720 (shots/look-*.png, shots/powder-*.png). Everything reads; no new issue beyond the known pop stacking.
- **Act I/II not made trivial.** Same bot run with and without every recipe, windmill 3 (7 loads each), 8 runs per level (out/act12.jsonl). Median damage with / without special shot: L1 37/23.5, L2 48.5/40.5, L3 54/51.5, L4 66.5/43.5, L5 25/49, L6 125.5/140.5. No runs were lost. Special shot makes L5 easier and L1-L4 harder (Fire in place of round shot slows kills); the Volcano and Maelstrom stay the hardest of their voyages.
- **Voyage III on late and light ships.** 3B's late-ship numbers hold. The light ship clears L9 30 of 32 times within two tries.

Known items not re-reported: smoke Act I bot flake, FLOW-5, dread frame spike, 3E pops and tentacles.

Tiny polish I left out: the hint 'Fire shot: ... 8 loads left' stays up for 2.6 s while the pill already reads '×7'. The 'Ropes dropped!' word is unused, but any hit already cuts the hooks.

### SPS-1: Special loads are not refilled when the Kraken rises, yet the rise banner tells the child to use Stink shot

*Reviewer: major. Skeptic: real, major. Outcome: Fixed: loads refill at the rise (main.js `refillLoads()`); voyage3 `kraken-fix4`.*

**Repro.** Own Stink shot and play level 9. Use your Stink loads on the skiffs or the Inkheart (Space with Stink loaded spends 2 loads a press), then sink the Inkheart. When THE KRAKEN RISES! appears, open the Ammo tray or press 6. Then let the Kraken sink you and pick 'Try again from the Kraken'.

**Evidence.** scripts/p_refill.js (frozen 8afd067, stepped): loads {fire:1, frost:0, stink:0} before the Inkheart falls are still {1,0,0} at the rise and in the fight. The banner reads 'THE KRAKEN RISES! Shoot its tentacles and its big eye! Stink shot makes it let go!' (the howStink line is added whenever Stink is OWNED, not when it is loaded). Key 6 gives 'No Stink shot left this level'. Screenshot at 390x844: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/specialshot/shots/refill-phone-rise-tray.png shows the banner over a tray where 'Stink ×0' and 'Frost ×0' are crossed out. A retry from the Kraken goes through startLevel, which does refill the loads. So sinking in the fight gives a child more Stink than surviving into it. SPEC3 §2.5 says loads 'refill at every level start and at the Kraken checkpoint (nothing to hoard or grind)', and the checkpoint is taken at the rise (§5.7.1 step 3). The L9 rumour ('If the Kraken grabs you, stink shot makes it let go!', 'Bring: Stink shot') pushes the child to spend Stink before the Kraken arrives. In bot runs Stink accounts for about half of all grab releases (late ship: 46 sneezes in 101 grabs), so the loads matter.

**Skeptic.** Reproduced from scratch on a fresh archive of 8afd067 (scripts/p_refill.js in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/specials-verify/). I spent Stink the way a child would, with key 6 and then Space twice, on the wave-2 skiff and the Inkheart. Loads went 4 -> 2 -> 0. Then I sank the Inkheart. At the dread and at the rise, loads were still {fire 4, frost 4, stink 0}. The rise banner and #game-live both said 'THE KRAKEN RISES! Shoot its tentacles and its big eye! Stink shot makes it let go!'. Pressing 6 in the fight gave the hint 'No Stink shot left this level'. Then I let the ship sink in the fight and clicked 'Try again from the Kraken': loads came back as {4,4,4}. So sinking gives a child more Stink than surviving does. I looked at both screenshots. shots/refill-phone-rise.png (390x844, touch) shows the banner with the 'STINK x0' pill just under it. shots/refill-desk-rise.png (1280x720) shows 'Stink x0' in red in the HUD under the same banner. Spec: §2.5 says loads 'refill at every level start and at the Kraken checkpoint (nothing to hoard or grind)', and §5.7.1 step 3 and §5.7.6 say the checkpoint is taken at the rise. There is one caveat. §5.7.6 and design-depth.md:250 can also be read as 'refilled on the retry', which the game already does, so the spec wording is ambiguous. The harm to the child holds under either reading. The game itself pushes a child to use up Stink before the rise: the boarding preview says 'Stink, then board!' on L9's skiffs, and the L9 rumour says 'Bring: Stink shot'. Then at the climax the banner gives an instruction the child cannot follow. It is also the hoarding the spec set out to prevent. Major is right: the child is confused and treated unfairly at the final boss.

### SPS-2: Fire shot is never better than round shot against the Iron Turtle it is sold as the counter for

*Reviewer: minor. Skeptic: refuted. Outcome: Refuted: as SPEC3 §2.2 and §4.2 say. No change.*

**Repro.** Level 8, late-game ship, an Iron Turtle held beam-on at 20 u. Sink her with round shot only, then with Fire shot only, then with one Fire volley followed by round shot.

**Evidence.** scripts/p_turtle.js (seeded, 3 seeds each), time to sink a 150 hp Iron Turtle. Late ship: round 5.4 s; Fire only 7.1-8.5 s; one Fire volley then round 6.0 s; Stink then Fire (KA-BOOM) 6.7-7.9 s. Stock ship: round 12.6 s; Fire 15.4 s; one Fire volley then round 11.7-13.2 s. Against a Corsair, Fire is 2-4x slower (the intended trade). Cause: a re-hit only restarts the 6 s burn, so sustained Fire does 0.7x hull per ball (still halved by armour), reloads 1.1x slower, and adds a flat 3 hp/s. That is less than round shot's beam damage for any upgraded ship. This breaks SPEC3 §4.2 ('Iron Turtle ... Counters: rake her bow or stern; Fire shot'), the §2.1 worked example (which compares one volley only) and the L8 rumour board ('Iron Turtles shrug off a broadside. Rake them, or set them alight!', 'Bring: Fire shot'). In real play the cost is small because a level has only 4-5 loads: a bot v3 A/B on L8 (late ship, 12 seeds x 2 strategies, out/L8fire.jsonl) shows Turtle damage taken of 53 vs 57 and 49.5 vs 47.5. So the main harm is that the advertised counter gives the child no help.

**Skeptic.** The numbers reproduce exactly (scripts/p_turtle.js, Iron Turtle beam-on at 20 u, starboard side only, seeds 1-3). Late ship: round 5.4 s; Fire only 7.1-8.5 s; one Fire volley then round 6.0 s; Fire only when she is not burning 6.0 s. Stock ship: 12.6 / 15.4 / 11.7-13.2 / 12.9 s. The cause is that the player reloads in 1.2-1.5 s, so every Fire re-hit restarts the 6 s burn, and a 150 hp Turtle is sunk before a burn can finish. But this is what SPEC3 says, not a deviation from it. §4.2: 'beam hits x0.5 ... rakes, crits, burns and KA-BOOM do full damage' (a Fire ball is a beam hit). §2.2: a fire 'hit again: restarts at 6 s'. The §2.1 worked example compares one volley (fire 16.8 + 18 = 34.8 vs round 24), and the game does exactly that. One Fire volley still out-damages round: at t = 6 s on the stock ship it had dealt 80 hp vs 73. A level gives only 4-5 loads, so the practical difference is at most about 1 s per Turtle. The finding's own L8 bot A/B (53 vs 57, 49.5 vs 47.5) is within noise. A child who follows 'set them alight!' sees ON FIRE and the Turtle sinks about as fast as with round shot: nothing confusing, unfair or visible to a parent. The proposed fix (Fire skips armour) contradicts §4.2's table, would need L8 re-tuned, and is a design change, not a Stage 4 bug.

### SPS-3: On a stock ship level 9 is a wall: the Inkheart sinks you on half of first tries, and the Kraken fight then lasts over 5 minutes

*Reviewer: minor. Skeptic: real, minor. Outcome: Tip added (main.js `playerSunk`: no Extra cannons or no Heavy shot -> "Extra cannons and Heavy shot from the shipyard will help."); no numbers changed (bot evidence in SPEC3 §19); voyage3 `kraken-fix4`.*

**Repro.** Bot v3 (tests/voyage3.cjs botV3, final numbers at 8afd067), stock ship (no upgrades), level 9, seeds 1-8, with and without special shot, circle and beam strategies.

**Evidence.** out/stockL9.jsonl (32 runs): 16/32 first tries lost. Beam strategy loses 13/16 first tries and 7/16 runs on both tries (with specials 3/8, without 4/8); circle strategy 0/16 lost on both. Every loss came 40-75 s in, before the Kraken: the Inkheart did 65-164 damage on top of the Iron Turtle's 30-117, within 15-45 s of wave 2 arriving at 22-32 s. For comparison, stock L7 and L8 (64 runs, out/stock78_light9.jsonl) lose 3/64 first tries and 0 on both. When the stock ship gets through, the Kraken fight lasts 255-386 s (median about 313 s) against the 2-3 minute target of §5.7.4 (the late ship takes about 139 s), and the whole level runs 336-474 s. A light ship with 720 gold of upgrades (guns 1, shot 1, crew 1, hull 1) mostly fixes it: 6/32 first tries lost, 2/32 on both, fight 140-233 s. So this hurts a child who spent their Voyage I-II gold on the island or cosmetics. 3B tuned L9 only on the late profile and never measured stock with the final numbers (its stock rows predate the Inkheart change).

**Skeptic.** Reproduced with tests/voyage3.cjs botV3, unmodified, on a fresh 8afd067 tree (scripts/bots.cjs, out/bots1.jsonl). Stock ship on L9: 10/20 first tries lost and 8/20 lost on both tries. By strategy: beam with specials 6/8 and 5/8; beam without specials 3/8 and 2/8; circle with specials 1/4 and 1/4. Every loss came 30-89 s in, mostly to the Inkheart (83-144 damage) plus the Iron Turtle. When the stock ship got through, the Kraken fight lasted 245-343 s. Controls: late ship, L9 beam with specials, 0/8 lost, fights 143-209 s (matches §19). Stock ship L8 beam, 0/6 lost. A 'light' ship with 720 gold of upgrades (guns 1, shot 1, crew 1, hull 1; out/bots2.jsonl) on L9 beam: 2/16 first tries lost, 0/16 lost on both, fights 149-243 s. Per-seed results differ from the other reviewer's (the bot depends on the order runs are made in), but the totals agree. The problem is real but narrow. It only affects a child who reaches level 9 with less than about 720 gold of shipyard upgrades, and Voyage I alone pays about 2,500-2,900 gold. SPEC3 makes no promise for a stock ship: §5.9 targets the late profile, and 'never required' is about special shot. Tries are unlimited, each loss comes within about a minute, and the shipwreck card already has 'Visit the dock'. Minor is right.

## The Kraken's fairness and spectacle

**What the reviewer checked and found fine**

I reviewed the frozen tree at 8afd067 (/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/kraken-fairness/tree). Probes are in its scripts/ folder, screenshots in shots/ (I looked at the contact sheets sheet*.png), logs in logs/, and the running log is NOTES.md.

**Played and looked at, 390x844 touch and 1280x720:**
- **Dread:** the banner and "All stop" show, and the ship stops.
- **Rise:** at 390 the camera pulls up and the amber eye is visible at k 0.55-0.8. The banner includes the Stink line. Under reduced motion it cuts to the eye mid-rise.
- **Rise, small blemish:** at the very end of the rise the head is dead ahead behind your own sails. This is minor and I did not report it.
- **Hunt and Fury at Cruising, 390:** the rings that hit the hull were at least half visible for 1.1-1.9 s of 1.8 / 1.6 s. Your own ship hid them for only 0-0.5 s.
- **Hunt at full sail:** the rings land beside or behind as you pass them, so you dodge them by default, and the swaying tentacles are mostly behind the camera. 3E's known 'behind your own sails' issue is mild by these numbers: no worse than described.
- **Grab:** the red-rimmed grab ring shows, and the grab strip 'GRABBED! Hold CUT! to cut it loose' shows with its bar and the CUT! button.
- **Ink:** the INK! ring shows.
- **Last Stand eye:** the glow eases 4 s in every 8, and the pulses stay at or under 1 Hz.
- **End sequence:** 'THE KRAKEN IS DRIVEN OFF!', the baby kraken pops, the dawn, the Pearl (+1,000, gold 1234→2234, it drifts to you in about 5 s), feat kraken=1, and the Victory card with the Pearl line all work.
- **Pearl pop:** it is 447 px wide only during its 0.2 s pop-in (359 px at rest), so I did not report it.

**Fairness checks:**
- Every warning was at least 1.5 s in every bot run (minWarn 1.5, 1.8 / 1.6 / 1.5 by phase).
- Flashes: the edge and hull card flash once per grab or slam (for example at 4.6, 11.6 and 30.2 s). The 2 Hz grab flash is fixed.
- Retry from the checkpoint at 390: the shipwreck card's first button is 'Try again from the Kraken' (308x77). It brings back the gold from the rise (the plunder after it is lost), a full hull, the short 3 s rise and the Kraken at full bar.
- The Kraken never sank any bot. 3B's lost level 9 tries were all to the Inkheart before the rise.
- A struggling stock-ship child still wins: 6 of 6, lowest hull 28-75/120.
- TENTACLE! warnings were not dropped by the pop rate limit (3 of 3 shown).

**Artefacts, not findings:**
- The stacks of 10 BULLSEYE! seen in stepped runs: pops don't age while the game is stepped without frames.
- 'Repairing! Out of the fight' in the middle of the fight: regenShown fires once per page load, so it only appeared because my probes jumped straight into level 9.
- One odd camera shot: the camera lagged after a stepped stretch.

**Noted but not reported:**
- deep.js krakenArena is defined but never used, so the fight happens wherever the Inkheart fell. In one trace it ran near the rocks at the world edge, but I could only show the bot getting stuck there, not a child.
- A stock ship with my bot sank 6 of 6 times to the Ironclad / Inkheart before the Kraken. That is the seas part of the level, and my bot is weak at ship fights.
- I did not re-report the known Stage 4 items (a)-(d), except where F1 and F2 show the issues are worse than described.

### kraken4:F1: In the Last Stand on a portrait phone, the red grab rings and slam rings are mostly off the right edge of the screen for their whole 1.5 s warning

*Reviewer: major. Skeptic: real, major. Outcome: Fixed: rings near your ship join the framing's must-see group (main.js `collectFrameRings`, `FRAME.ringReach` 8 u); voyage3 `kraken-frame`.*

**Repro.** Level 9, 390x844 touch, phase 3 (G.kraken.rise(); G.kraken.skip(); G.kraken.phase(3)), late ship at the default Cruising sail, with a child-like bot steering and firing. Probe: cd /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/kraken-fairness/scripts && NODE_PATH=/opt/node22/lib/node_modules PHASE=3 ATTACKS=6 SHOTS=6 SAIL=2 node occl.cjs. It steps between attacks and renders real frames from 1.2 s before each attack until the rings land. For each warning ring, sampler.js projects its centre and 8 rim points every frame and counts the time at least 5 of the 9 are on screen and not under the ship or the HUD. Run it again with SIZE=1280x720 for the contrast. live.cjs (PHASE=3, frames only) gives the same result.

**Evidence.** In the Last Stand the head stays up 25 u off your beam (port). In portrait, the framing locks onto it: G.framing gives focus 'kraken-eye' or 'kraken-head', w=1, yaw -0.9 rad. The view swings toward the head and the ship sits at the right edge. The first ring of each attack is the one that can grab you, and it lands at your predicted spot on the far (starboard) side, lat +4 to +10.

Time each grab ring was at least half visible, out of its ~1.55 s warning:
- 390x844, occl run: 0.71, 0.44, 0.2, 0 and 0 s. The two rings that actually grabbed the ship got 0.2 s and 0 s.
- 390x844, live run b: 0, 0, 0.5, 0.1, 0.75, 0.5 and 0.3 s, so the median over the 12 grab rings of both runs is about 0.3 s.
- 1280x720, same seed: the framing is off and the rings got 1.11, 1.22, 1.56 and 1.55 s, with 1.56 and 1.55 s for the two that grabbed. live-1280-p3-b gives 1.08-1.5 s.
- In the Hunt and the Fury at 390 (no head framing), the rings that hit the hull got 1.14-1.88 s.

Screenshots (all under /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/kraken-fairness/shots/):
- sheetO3.png (occl-390-p3-s2-a0..a5.png): the head is huge on the left and the ship is at the right edge. Only a red dashed arc shows at the edge (a0-a2), or no ring at all (a3-a5). Only the TENTACLE! word shows, at the edge.
- sheetL3b.png, third panel: the red grab ring is under the Round and Fire▶ buttons.
- sheetO3-1280.png: at 1280 the same rings are whole and clear.

The Fury banner tells the child 'Steer out of the red rings', but in the Last Stand they cannot see them. This breaks the kid rule that every threat is telegraphed for at least 1.5 s by a ring, a sound and a word. edgeCues() has arrows only for the rogue wave, the fire ship and RAM!, not for the Kraken's rings.

This is not 3E's known Hunt issue (tentacles behind your own sails). It has a different cause, and it is worse than 3E's note that 'the warning rings and words still show'.

**Skeptic.** I reproduced this from scratch on a fresh copy of 8afd067 with my own probe and my own bot (/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/kraken-verify/scripts/ringvis.cjs). It renders real frames only, with no stepping. The setup is the Last Stand (phase 3), the late ship at Cruising; the bot keeps the head abeam at about 22 u, fires when lit and dodges. For each warning ring it projects the centre and 8 rim points and counts game seconds with at least 5 of the 9 on screen.

Cause: at 390x844 the portrait framing locks onto the eye or head for almost the whole phase (focus kraken-eye/head, w=1, yaw ±0.9). The ship is pushed to the screen edge on the side away from the head. predict() in kraken.js is straight-line, so for a child circling the head the first (grab) ring lands outside the turn, on the far side of the ship, which is off-screen.

Grab rings at least half on screen, out of a 1.5 s warning:
- 390, seed 7: 0, 0.73, 0.6, 1.51, 0.6 and 1.1 s.
- 390, seed 11 (head to starboard, so the rings go off the LEFT edge): 0, 0, 0 and 1.5 s.
- 1280x720, same seed 7 and the same rings: framing off for the whole run, 1.13-1.5 s.

Screenshots (/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/kraken-verify/shots/):
- rv-390-p3-s2-near-d1-f1-k7-g1.png: the red grab ring is fully off-screen and only TENTACLE! shows at the edge.
- g2-g4: only a red arc shows at the right edge.
- rv-1280-p3-s2-near-d1-f1-k7-g1.png: the same ring, whole and clear.

Severity holds at major because it breaks the starred kid rule (every threat telegraphed >= 1.5 s by a ring), on the target device, in the finale. Two caveats, slightly weaker than the claim:
- Part of the arc usually stays visible at the edge, along with the word and the sound.
- A circling ship is often missed by these rings: my two 390 runs took 0 damage over 10 attacks. In the reviewer's live and occl logs, 3-4 of 17 grab rings were on the hull at landing, with 0-0.6 s half-visible.

This is not the known 3E Hunt issue (d).

### kraken4:F2: BULLSEYE! pops once per cannonball, so every broadside at the eye stacks up to four BULLSEYE! words over the eye or the ship

*Reviewer: minor. Skeptic: real, minor. Outcome: Fixed: the part's word pops once per volley (main.js `damagePseudo`); voyage3 `kraken-fix4`.*

**Repro.** Level 9, 390x844 touch, Last Stand (G.kraken.phase(3)), late ship with 4 guns a side. Fire broadsides at the eye; the bot does this. Probe: cd /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/kraken-fairness/scripts && NODE_PATH=/opt/node22/lib/node_modules FRAMES=220 node pops.cjs. It renders frames only and logs every pop shown with a MutationObserver on #pops.

**Evidence.** pops.cjs over 220 real frames (20 s of game time):
- BULLSEYE! came in bursts of [4, 2, 2, 1, 4, 4]: 17 BULLSEYE! words against 12 damage numbers.
- Up to 4 BULLSEYE! words were on screen at once.
- A BULLSEYE! sat on the eye (the weak spot the child is told to shoot) in 12 of the 220 frames.
- TENTACLE! still showed for 3 of 3 attacks, so warnings were not dropped in this sample.

Screenshots (in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/kraken-fairness/shots/):
- sheetL3.png, panel 3: four BULLSEYE! words stacked over the Kraken's face.
- sheetL3.png, panel 6: during a grab, BULLSEYE!×4 + GRABBED! + 86 cover the ship and the tentacle.
- sheet1280A.png, panel 6: two BULLSEYE! pops overlap into 'BULLSEYE!YE!' at 1280.

This is the main source of the known 'pop words stacking during a grab' issue (d). It is worse than described: it happens on every eye volley through the whole Last Stand, not only during a grab.

**Skeptic.** Confirmed in code and live. main.js:3803 damagePseudo() runs pops.pop(r.word, …) for every ball, and kraken.hit() returns BULLSEYE! for every eye hit. Ships do it differently: their words (rake) are gated once per volley through volleyTarget (T.rake), per SPEC2 §2.5 'pops summed per volley', and the Kraken's own status word is already gated the same way (T.status). So the per-ball BULLSEYE! is inconsistent with the rest of the game.

Live probe (ringvis.cjs POPS=1, 390x844, Last Stand, 220 real frames; MutationObserver on #pops):
- BULLSEYE! births per eye volley: [4, 1, 2 (+CRIT!), 2, 2, 1], with one damage number per volley.
- Up to 4 visible at once, and at least 2 visible in 79 frames.

Screenshots (/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/kraken-verify/shots/):
- pv-390-p3-s2-near-d1-f1-k7-g1.png: four giant BULLSEYE! words cover the head, the eye and the ship.
- g2: four BULLSEYE! words plus CRIT! around the head.

TENTACLE! was not dropped in this sample. Minor is right: it is clutter over the weak spot and the ship, it is not blocking, and it is a distinct cause from known issue (d).

### kraken4:F3: With a weaker ship or at full sail, the Kraken fight drags to 4-7 minutes with little danger (3B's 140 s median comes from a much sharper bot)

*Reviewer: minor. Skeptic: refuted. Outcome: Refuted: within spec at the default sail. No change.*

**Repro.** Kraken only (G.kraken.rise({dread:true})), stepped, with a child-like bot: it fires a side once its FIRE! light has been lit 0.4 s, keeps the Kraken abeam, and dodges 70% of rings after 0.8 s. Probe: cd /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/kraken-fairness/scripts && NODE_PATH=/opt/node22/lib/node_modules PROFILE=late RUNS=6 node fair.cjs. Variations: PROFILE=stock; BOT='{"sail":2}' (Cruising, the level-start default); BOT='{"aim":"wander"}' (circling). MOD='K.cutOff.idle=8;return 1' tries a fix in the page.

**Evidence.** Fight lengths (logs in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/kraken-fairness/logs/, fair-*.jsonl and exp-*.jsonl):
- Late ship (SPEC3 §5.9 profile):
  - Cruising, instant fire: 142-159 s. This matches 3B.
  - Full sail, the child bot: 186-240 s (median 228). It outruns the shadow, so there are 3-6 cut-offs and the Hunt alone lasts 60-107 s.
  - Whole level 9: 206-281 s, plus one 597 s outlier where the bot stuck on rocks.
- Stock ship:
  - Cruising: 312-445 s (median 348). The child bot took 180-300 slam damage, and the lowest hull was 37-86/120.
  - Full sail: 370-429 s (median 408; the Hunt alone 157-203 s).
  - A more careless child (notices 40% of rings): 277-334 s, lowest hull 28-75/120, never sunk.
- Across all runs, FIRE! is lit only 21-28% of the fight, with up to 12-16 s at a stretch unlit.
- The Kraken never sank a bot. 3B's lost level 9 tries all sank to the Inkheart before the rise, so the checkpoint is rarely needed.
- The spec's 2-3 minutes was met only by 3B's bot, which fires both sides the instant anything is roughly abeam.

Experiments (medians; late full-sail / late circling / stock full-sail):
- cutOff.idle 8: 199 / 116 / 285 s. Stock at Cruising: 348→258 s. Late at Cruising with instant fire: 146→121 s.
- hp 2200: 167 / 97 / 323 s.
- Both: 149 / 90 / 253 s, but circling then drops below 120 s.

**Skeptic.** The numbers reproduce, but at the default sail the spec promise holds, and the long cases are either intended or not reachable. I ran an independent stepped sim with my own child-like bot: 0.4 s fire delay, notices 70% of rings, dodges after 0.8 s, taps CUT! (fightlen.cjs; logs/fl-late.jsonl and fl-stock.jsonl).

Late-game ship:
- At the default Cruising sail: 130-171 s (median ~142 s; 8 seeds). This is inside SPEC3 §5.7.4/§5.9's '2-3 minutes on the late-game ship'.
- At full sail: 191-274 s (median ~224 s, about 3.7 min, not 4-7). That is because the Hunt is meant to be outrunnable (§5.7.3) and the 12 s cut-off keeps targets coming (2-7 cut-offs, no stall).

Stock ship:
- Cruising: 261-310 s.
- Full sail: 362-547 s.
- But the reviewer's own whole-level-9 stock runs reached the Kraken 0 of 6 times. SPEC3 §5.9 uses the late-game profile as the L9 reference, so a stock ship in the Kraken fight is not a case a child realistically hits.

Other checks:
- Danger is low by design ('kind to a child'). No sinks; late-ship lowest hull 126-163/165.
- FIRE! lit 22-37% of the fight matches the claim, and is what a chase phase looks like.
- SPEC3 §19 deliberately raised hp from 600 to 2850 to lengthen the fight, and records a bot max of 250.9 s.

No spec promise is broken and no child is stuck. Cutting idle to 8 s would add pressure for exactly the weaker children it is meant to help.

## Quiz content and tone

**What the reviewer checked and found fine**

Content: I read all 120 bank questions in src/quizBank.js (10 per category per band; validateBank ok; at least 4 places questions with seas: 0 in every band) and fact-checked each question, right answer and fun fact. I found no factual errors: Harrison and longitude, the 1.83 m fathom, the Pacific's area against all land, Everest's marine fossils, Kidd's cache on Gardiners Island NY, the Golden Hind 1577-1580, Panama 1914, Zheng Yi Sao 1808/1810, starfish eye spots, and the rest. Every question has exactly one right answer and plausible wrong ones. The articles before '…' agree with every option (the atoll options all start with a vowel). Spelling is British throughout, and the tone is kind; pirate history has no executions or cruelty. The 'seas' gates match the level names (Coast of Europe 1, Bali 2, Volcano 3, Doubloon Bay 4, Frostbite 5, Maelstrom 6, Atolls 7, Cape 8). Sums: 600,000 generated questions across the three bands (sums.mjs) had 0 problems: ranges per SPEC3 section 7.6, wrong answers distinct, never negative, never 0 for sharing, every count at least 2 so nouns stay plural, longest question 67 characters. The right answer's position is evenly spread over 3,000 rounds. Rules and payouts: there is no timer anywhere in quiz.js or quizPanel.js (only sound and coin-flight timeouts). Lifebuoys come from the Sea School (1/2/3 a round); they always leave two answers, a greyed button gives its reason, and a third tap says 'you can do it'. Stars and gold are paid once. Phone round: 3 right paid 60 + Good try 10 (1000 to 1070). Owed gold is paid once on open (+160, note in view). Storm Cape 5/5 paid 390 + 10. Each round's payout appeared once in the gold line, and the quiz record was written before the chest. Replay with nothing new pays nothing; leaving a round keeps the stars ('Your stars are safe!' in view). I played at 390x844 touch (map, question, lifebuoy, wrong, right, results, leave, a 4-answer band-3 round, owed gold) and at 1280x720 keyboard only (E, Enter, digits, H, Enter on Next, Esc to results/map/town). There were no page errors, and I looked at all 19 screenshots in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/quiz/shots/. The professor's NPC lines and the results copy ('So close: 2 right! Have another go?', 'No new stars this time. Your best here…') read well. Notes are in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/quiz/NOTES.md.

### QUIZ-1: The professor's 'Not quite! It's X.' line is ungrammatical for many bank answers ('It's It's far too salty.', 'It's Hello there!.', 'It's To hide and escape.')

*Reviewer: minor. Skeptic: real, minor. Outcome: Fixed: "Not quite! The answer is: X" (quizPanel.js `wrongLine`); ashore `quiz` checks every bank answer.*

**Repro.** Frozen tree 8afd067 at 1280x720, keyboard only. Store unlocked 7. Go ashore, walk to the quiz and press E. Run window.__game.quiz.start(0, 3), answer the first 3 questions right with their digit keys and Enter, then give a wrong answer to question 4 (sea-drink, 'Why can't sailors drink sea water?'). Then run start(0, 12) and answer question 1 (pirates-ahoy) wrong. Probe: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/quiz/probes/desk.cjs. On a 390x844 touch phone the same template showed 'Not quite! It's With gills.' (probes/phone.cjs).

**Evidence.** The visible line (.qf-say) reads 'Not quite! It's It's far too salty.' in shots/d1280-sea-drink-wrong.png and 'Not quite! It's Hello there!.' in shots/d1280-pirates-ahoy-wrong.png. #quiz-live reads 'Not quite. The answer is Hello there!. ...'. The template `It's ${right}.` comes from SPEC3 section 7.2's 'Not quite! It's Eight.', which suits sums but not the bank's phrase answers. A Node pass over all 120 bank answers (/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/quiz/bank.mjs) found 69 that read badly. About 25 are plainly ungrammatical: 'It's It's far too salty.', 'It's Hello there!.', 'It's To hide and escape.', 'It's A new one moves in.', 'It's Puffs up like a ball.', 'It's How far east or west.', 'It's Half their brain at a time.', 'It's With gills.', 'It's In a harbour.', 'It's Up.', 'It's Yes.'. The other 44 have a capital article in mid-sentence ('It's The bow.', 'It's A compass.'). A child sees this line on every wrong answer, and a parent reading it aloud will trip over it. Everything else about a wrong answer is gentle as promised: the bonk only (no buzzer), a ✓ on the right answer, the fun fact, Next takes focus, and nothing is lost.

**Skeptic.** I reproduced this on a fresh copy of 8afd067. On a 390x844 touch phone (probes/phone.cjs, fresh record, Shallow Shoals seed 3), I tapped a wrong answer on question 4, sea-drink. .qf-say read "Not quite! It's It's far too salty." and #quiz-live read "Not quite. The answer is It's far too salty. ...". The sound was the bonk only. On a 1280x720 keyboard (probes/desk.cjs, walked to the quiz and pressed E; seed 12, question 1, pirates-ahoy) it read "Not quite! It's Hello there!." and the live text was "...The answer is Hello there!. ...". The line is clearly visible in Quizzle's speech box in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/quiz-verify/shots/p390-sea-drink-wrong.png and /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/quiz-verify/shots/d1280-pirates-ahoy-wrong.png. My own Node pass over all 120 bank answers (/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/quiz-verify/scripts/bank.mjs) agrees with the reviewer. About 25 lines are plainly ungrammatical: the 'It's It's' and 'Hello there!.' cases; verb-phrase answers such as 'Puffs up like a ball', 'A new one moves in', 'To hide and escape' and 'How far east or west'; and plurals such as 'It's Dolphins.' and 'It's Galleons.'. Many more put a capital article mid-sentence ('It's The bow.'). sea-drink and pirates-ahoy are band-1 questions, so a child meets them in the very first quizzes. This is not a probe artefact: the template at quizPanel.js:529 runs on every wrong answer whatever the seed. It is also not intended. The SPEC3 §7.2 example "It's Eight." was written for sums, and it clashes with the spec's own §7.5 starter bank (sea-drink and pirates-ahoy are SPEC3 lines 855 and 908). None of the stage reports list it. Minor is the right severity: the wording is wrong and a parent reading aloud will trip over it, but the child is not stuck, scared or losing anything. Everything else about a wrong answer works as promised: the bonk only, a ✓ on the right answer, the fun fact, Next takes focus, and gold and stars are unchanged.

### QUIZ-2: A perfect first round is captioned '+10 gold — Good try!' right under '5 of 5 right: all three stars!'

*Reviewer: polish. Skeptic: real, polish. Outcome: Fixed: "Good try!" only after a round with no star (quizPanel.js `renderResults`); ashore `quiztaps`.*

**Repro.** 390x844 touch. Store unlocked 7, quiz stars [1,1,1,1,1,1,0,0,0] with tried 1 on the first six islands. Open the quiz, run window.__game.quiz.start(6, 23) (Storm Cape) and tap all five right answers. Probe: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/quiz/probes/band3.cjs

**Evidence.** shots/b390-results-3stars.png reads '5 of 5 right: all three stars!', then '+390 gold — three new stars!', then '+10 gold — Good try!'. #quiz-live says the same. The gold is right (1160 to 1560, paid once, record written before the chest), but 'Good try!' is what we say after a miss. Right after a perfect score it reads as faint praise to a child. SPEC3 section 7.2 names the bonus 'Good try!' and pays it 'whatever the score'. The amount is not wrong, only the label.

**Skeptic.** I reproduced this on a fresh copy of 8afd067, with Read checks of each screenshot. On a 390x844 touch phone (probes/phone.cjs), the first round at Seagull Sands with 5 of 5 tapped right showed "5 of 5 right: all three stars!", then "+140 gold — three new stars!", then "+10 gold — Good try!", then "Turtle Cove is open!" (/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/quiz-verify/shots/p390-results-first-round-5of5.png). On a 1280x720 keyboard, the first round at Storm Cape (record with islands 1-6 tried, start(6, 23)) went 5 of 5 and showed "+390 gold — three new stars!" and "+10 gold — Good try!" (/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/quiz-verify/shots/d1280-stormcape-5of5.png). #quiz-live says the same. The gold is correct: purse 1000 to 1400 and 1085 to 1235, the record written before the chest, and the bonus paid only once. Only the label is wrong. A child who quizzes well meets this on most first rounds, since band-1 islands are easy. The spec names the one-time bonus "Good try!" and pays it whatever the score, so the gold rule is intended. The results-line wording is the implementation's choice, though: §7.3 only shows "+80 gold — new star!". The §19 rationale ("a child who gets 2 of 5 earns something once") shows the name was meant as a consolation. Faint praise right after a perfect score is a small mixed message, nothing worse, so polish is the right severity.

## Town and walking

**What the reviewer checked and found fine**

Frozen tree 8afd067 in scratchpad/kraken/review4/town/tree; NOTES.md, scripts/, logs/ and shots/ are next to it. Every screenshot was looked at.

- **Six-places bar and walk view at 9 sizes.** The 7 town sizes, plus 360x480 and 640x360 from §15, all with touch below 1024. Bar, prompt, joystick and action button are fine everywhere. Shots: sheet-p2-*, p3-*, sheet-p3-*.
- **Build panel at those sizes.** Only one row shows at 320x480, 360x480, 360x640, 568x320 and 640x360; the next row peeks in. This is the known "rows need a scroll" issue, not re-reported.
- **Bess and plots at tier 3 from the build view.** All 10 plots are framed above the sheet at 390 and left of the panel at 1280 (sheet-p8-*). The lighthouse has a prize ship's sail in front of it; already known.
- **Build montage at 390 (homeA) and 1280 (homeC).** The scaffold, the sawdust puffs, the cottage springing up, 'Thank you, Captain!' over the two wavers for about 2 s, Bess's cheer and #build-live 'Cottage built at … 2 villagers moved in.' all work (sheet-p5-*).
- **Walking bug.**
  - p4b: 10 seeds x 60 s of random keys, sticks and taps with 8 villagers, Bess and Barnacle out. Each stuck frame was classified as person or wall; the longest stop caused by a person was 0.37 s, so squeeze-past works. Pushes into walls lasted up to 11.6 s, which is normal.
  - p4: goTo every place from 8 random spots x 6 seeds, 288 runs. All arrived, the slowest in 19.9 s.
- **Villager loops** (p12). They keep clear of the 21 standing townsfolk (closest 0.72 u), of props, and of the other walkers' paths.
- **Greetings** (p9, 114 greetings). Villagers say 'Lovely house, Cap'n!', 'Fresh biscuits today!' (with a Bakery), 'The Kraken? Brrr!' (after the Kraken) and 'Ahoy'. Bess has her own two lines.
- **Polly's trophies** at 390. When locked, the row reads 'Locked: <how to win it>' with aria-disabled. When won, it reads 'Trophy won' and can be worn; the captain shows all three trophies in the panel and in the town.
- **Powder room** at 390. Rows show the Windmill extra loads. Real Tab focus scrolls only .dock-body (p7). The broken layout in my first Powder shot was my own scrollIntoView, not the game.
- **Tap-to-walk** (p10, 28,512 grid taps). About 5.5% of taps on a visible deck land more than 2.5 u away. A copy with WITH_KRAKEN=false gives 1,472 such taps against 1,568 live, caused by the same plaza awnings, shipyard sign and yard blocker. That makes it pre-existing; the plots' invisible tier-3 envelopes add only 18 taps.
- **Camera.**
  - The close-up on the west pier at 390 is identical in the no-Kraken copy: pre-existing, caused by the docked ship's blocker.
  - The rank plaque, the 'Build me!' boards and the build-view glides look fine.
- **Polish not filed:**
  - Bess still says 'Fancy a new house?' at Pirate Capital.
  - The shipyard (hammer) and Build (house with hammer) icons look alike.
  - The montage has no bunting after the building springs up, though §8.3 promises it; the scaffold has flags.

No page errors in any run.

### TOWN-TAPNPC: Tapping Builder Bess (or Professor Barnacle) does not take the captain to them: he walks past Bess, or into her, and no Build/Play prompt appears

*Reviewer: minor. Skeptic: real, minor. Outcome: Fixed: a tap on Bess or Barnacle walks into their place (town.js `pick`); town `kraken4`.*

**Repro.** 390x844 touch, the save at level 7 (tests' STORE), walk view. Stand at (0.6,-4.6) facing Bess (h = PI+0.35), the 'The Sea Biscuit - All aboard' prompt showing. Do a real touchscreen tap on Bess's body at (263,195). Do the same from the south-west, at (-3.5,-6.0) with h 2.5, tapping (232,366). Then __game.town.walkTo(Bess's own spot -1.4,-8.5), as a tap on her feet does. Then walkTo the professor's spot (-17.3,-23.72).

**Evidence.** scripts/p14_tapreal.cjs, logs/p14.jsonl: a tap on her body sends the ray through her to the deck behind her. Auto-walk to (-2.28,-10.03): the captain stops at (-2.2,-9.96), 1.67 u past Bess, and __game.town.place is null. From the south-west he stops at (-0.23,-9.79), 1.74 u past her, place again null. Both after-shots show no 'Builder Bess - Build' pill, only the greyed 'Go in' button (shots/p14-from-pier-after.png, shots/p14-from-sw-after.png, sheet shots/sheet-p14.png). A tap on her feet puts him 0.11 u from her and she disappears inside him (logs/p13.jsonl, shots/p13-390-tapbess.png). The same tap on Professor Barnacle leaves the captain 0.65 u from him but 1.85 u from the bell's place (r 1.3), so the Play prompt does not show. Bess and Barnacle are the only places whose landmark is a person rather than a building, and a child taps the character to 'talk to' them. Building and shop places catch the tap through their camBlocked box, which walks him up to the door. The places bar's Build/Quiz buttons still work, so this costs a detour, not progress.

**Skeptic.** I reproduced this on a fresh copy of 8afd067 with real touchscreen taps at 390x844 (touch, isMobile) and mouse clicks at 1280x720. Logs: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/town-verify/logs/v1.jsonl and v2.jsonl. Screenshots are in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/town-verify/shots/.

Tapping Bess's body: pick() ignores people, so the ray goes through her to the deck behind. The captain walks past her and stops with town.place null, the prompt hidden and 'Go in' greyed.
- From the pier (0.6,-4.6), tap (266,144): he stops 3.06 u past her. The same click at 1280 gives 3.02 u.
- From the plaza (1.6,-6.2), tap (195,268): 2.22 u past her. Bess's bubble says 'Hammers ready, Captain!' but no Build prompt appears (v1-phone-plaza-bess-chest-after.png).
- From the south-west: 3.49 u past her.
The reviewer's 1.67 and 1.74 u came from taps lower on her body. The behaviour is the same.

Tapping Bess's feet: he ends 0.01-0.14 u from her and she disappears inside him (v1-phone-pier-bess-feet-after.png). The Build prompt does show here, but only just: he is 1.20-1.30 u from the place centre and the circle's radius is 1.3.

Control: building taps do work, through the camBlocked march. A tap on the tavern ends 0.56 u from its place and a tap on Polly's ends 1.48 u (radius 1.6), both with the prompt shown (v2-phone-tavern-wall-after.png). So the difference between buildings and the two NPCs is real.

Professor Barnacle is weaker than reported. A real tap on him from in front of the bell leaves the captain 1.33 u from the quiz place (radius 1.3), so there is no Play prompt while the professor says 'Ring the bell for a quiz!' right beside him (v1-phone-near-barnacle-chest-after.png). A tap on his feet ends 1.29 u away and the prompt does show. So it is a coin-flip at the edge of the circle, not the 1.85 u reported. That figure came from a walkTo() started on the plaza, not from a tap.

This is not a spec break. SPEC2 §7 says 'a tapped point just walks there'. But a child taps the lady with the hammer, the captain marches past her, and the button he needs is not there. The places bar's Build and Quiz buttons, and a second tap, still work, so it costs a detour, not progress. Minor is right.

The finding's 'simpler alternative' (snap walkTo targets within 1.5 u of an NPC) does not fix the main case, because body taps land 2.2-3.5 u past Bess.

## Saves and progress

**What the reviewer checked and found fine**

All work ran on a frozen 8afd067 copy: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/saves/tree. Notes are in .../saves/NOTES.md, logs in .../saves/logs, screenshots (all looked at) in .../saves/shots. No browser errors in any run.

(1) Upgrading an old save: fine.
- Built the save with 09005bd's own serializers (scripts/oldsave.mjs): six levels won, legend 1, purse 1234, best 4321, armory, ship tiers and paint, look with the crown worn and a bought bicorne, tips 255.
- At load the only key that changed is pirates-ahoy-unlocked, 6 to 7. Purse, ship, armory, look and the crown trophy are kept. The ship record has no rudder and is not rewritten.
- Title at 390x844 (shots/mig-v1-390-title.png): 3 voyage heads, 9 cards, card 7 'Play' and in view, cards 8 and 9 Locked. The tavern shows all 3 recipes on sale; the quiz has island 1 open; Builder Bess is fine.
- A feats record without the four new fields is rewritten once with them at 0.
- legend 0 does not migrate; card 7 reads 'Beat the Phantom Galleon'.
- The Phantom can't be sunk (main.js ~3870), so the legend rule covers everyone who won the Maelstrom.

(2) Junk values: fine.
- Node fuzz (scripts/fuzz.mjs) of all 8 parsers: 3000 random plus hostile inputs each, including 5 MB strings, 200k-deep JSON and __proto__/constructor tricks. Nothing throws, every result is idempotent, nothing is polluted, and mergePowder/mergeIsland/mergeQuiz never lower anything.
- Browser at 390, every key set at once (trunc, empty, huge 450 KB, hostile __proto__, wrong types, deep nesting, maxed / unlocked 99). Each record falls back field by field and is rewritten. Title, tavern, quiz, builder and a level start all work.
- With maxed values, unlocked 99 stays saved and shows 9 cards. The largest real quiz record is 1163 bytes, well under its 8 KB cap.

(3) Two tabs at 390 (scripts/tabs.cjs): fine.
- Recipe paid once (5000 to 4700). Tab B already shows 'Owned' and a tap answers 'You have the Fire shot recipe…'.
- Tab B's build panel refreshes to 'Upgrade to Townhouse — 250' and charges tier 2.
- Quiz: tab A gets +60 +10; tab B gets 'No new stars this time', +0.
- Saved values match memory in both tabs.

(4) Storage:
- Full (setItem throws, scripts/full.cjs): recipe and build are refused with "Couldn't save… Nothing was paid." Quiz stars are kept for the visit with the kind line, and the owed +60 is paid once when storage works again. The rudder follows the shipyard rule and is saved later. Steering works for the visit. After a reload everything is consistent: 3000 − 120 + 60 = 2940.
- Blocked (localStorage getter throws, scripts/blocked.cjs): the visit works, a level win banks gold in memory, a build is refused, and the quiz map says '90 gold is waiting for your stars…'.

(5) Leaving and retrying:
- Kraken retry then win banks correctly: +3677, Pearl included. feats.kraken is saved the moment the Kraken is driven off.
- Leaving mid-level warns about the plunder.
- Closing the tab mid-fight loses only the in-session checkpoint and the level's plunder, as specified. Feats are saved on visibilitychange.

### SAVES-1: After a wreck at the Kraken, going to the dock silently drops the Kraken checkpoint. The dock's "Try again: The Kraken's Deep" restarts all of level 9 (waves and the Inkheart).

*Reviewer: major. Skeptic: real, major. Outcome: Fixed: the shipyard keeps the checkpoint (shipwreck card and pause menu routes), its exit reads "Try again from the Kraken", and the leave question is honest (main.js `krakenRetryHere`); voyage3 `kraken-fix4`.*

**Repro.** 1. Save with unlocked 9 (purse 500). Play level 9 until the Kraken rises and the fight starts. The checkpoint is {level 9, gold 777, goldAtLevelStart 600}. 2. Get sunk in the fight. The Shipwrecked card shows 'Try again from the Kraken', 'Try again', 'Visit the dock' and 'Main menu'. Its text says 'Try again from the Kraken with the plunder you had when it rose, or the whole level.' Nothing warns that the dock gives up the Kraken. 3. Tap 'Visit the dock'. Buying a hull upgrade here is the natural thing to do after losing. 4. Tap the dock's main button 'Try again: The Kraken's Deep'. The town's All aboard? uses the same exit list, so it does the same. Result: level 9 restarts at wave 0 with 2 Squid Skiffs and an Iron Turtle, then the Inkheart. The plunder falls back to the level start (600). The checkpoint is gone. Script: scratchpad/kraken/review4/saves/scripts/kflow.cjs dock (390x844 touch and 1280x720).

**Evidence.** /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/saves/logs/kflow.log. In the dock the checkpoint is still held: {"from":"over","cp":{"level":9,"gold":777,"goldAtLevelStart":600},"btns":["dock-retry-btn: Try again: The Kraken's Deep","dock-menu-btn: Main menu"]}. After the hull buy and leave('retry'): {"wave":0,"stage":null,"enemies":["skiff","skiff","ironclad"],"cp":null,"gold":600,"banner":"Try again!2 × Squid Skiff · 1 × Iron Turtle"}. Same at 1280. Screenshots (all looked at), in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/saves/shots/: kflow-390-wreck.png (no warning on the card), kflow-390-dock.png and kflow-1280-dock.png (footer 'Try again: The Kraken's Deep'), kflow-390-dock-retry.png ('TRY AGAIN! 2 × Squid Skiff · 1 × Iron Turtle', gold 600). Why it matters: the part before the Kraken is where children sink. SPEC3 §19 says every early level-9 loss went to the Inkheart, and the special-shot reviewer's stock-ship bot lost its first L9 try 16 of 32 times, all before the Kraken. A child who goes to upgrade after losing to the Kraken is quietly sent back through that part. This breaks the §0.1 kid rule 'no hidden traps (any refusal or resistance is explained before or at the moment it happens)' and §5.7.6's promise of a retry from the Kraken.

**Skeptic.** I reproduced this from scratch on a fresh copy of 8afd067 (saves-verify/tree), using real taps rather than API exits. I did it at 390x844 (touch, isMobile) and at 1280x720, and reached the Kraken the way a child would. Storage was seeded with unlocked 9 and purse 500. Steps: tap card 9 on the title, sink wave 0 (2 Squid Skiffs and an Iron Turtle), sink the Inkheart wave, 4.0 s of dread, then the rise. The checkpoint was {level 9, gold 177, goldAtLevelStart 0}. Then the fight, and the ship sinks. The Shipwrecked card shows 'Try again from the Kraken', 'Try again', 'Visit the dock' and 'Main menu'. Its text says 'Try again from the Kraken with the plunder you had when it rose, or the whole level' and nothing warns about the dock. I tapped 'Visit the dock'. The dock opens from 'over' with the checkpoint still held. Its footer offers 'Try again: The Kraken's Deep' and 'Main menu'. I tapped Buy on the hull row (chest 500 to 380, saved), then the footer's main button. The result was {wave 0, kraken stage null, enemies [skiff, skiff, ironclad], cp null, gold 0}, with the banner 'Try again! 2 x Squid Skiff · 1 x Iron Turtle'. The Kraken retry hook afterwards returns false, so once the dock opens nothing can bring the checkpoint back. The code agrees: DOCK_EXITS.over = ['retry','menu'] and leaveDock('retry') calls retryLevel(). That calls startLevel(n, {retry}), which runs `else krakenCheckpoint = null` at main.js 1955-1957. retryFromKraken (3049) refuses unless state.mode === 'over'. The town's All aboard? and the Harbour menu use the same dockExitList. SPEC3 §5.7.6 never says that visiting the dock gives up the checkpoint. The level name in the label ('The Kraken's Deep') even reads like 'try the Kraken again'. That breaks §0.1's 'no hidden traps' rule. It costs the child the whole pre-Kraken part of level 9 (the waves and the Inkheart), which §19 says is where children sink, and it happens right after the most natural move after losing: going to buy an upgrade. No saved progress is lost (chest, upgrades and unlock are intact), so this is not a blocker. Major is right, because a child is treated unfairly without being told. Fix check: I patched a copy (saves-verify/tree-fix, 4 changed lines in main.js) and ran the same tap flow at 390. The footer then reads 'Try again from the Kraken'. Tapping it gives {stage 'retry', cp kept, gold 177, 0 enemies, banner 'Try again! The Kraken rises!'}, and the bought hull tier applies (maxHp 140 = upgrades.js tier 1). The label fits the 390 footer. Evidence: logs/v-dock-390.log, logs/v-dock-1280.log, logs/v-dock-390-tree-fix.log. Screenshots, all looked at, in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/saves-verify/shots/: v-390-wreck.png, v-390-dock.png, v-390-dock-retry.png, v-1280-wreck.png, v-1280-dock.png, v-1280-dock-retry.png, v-tree-fix-390-dock.png, v-tree-fix-390-dock-retry.png.

### SAVES-2: Leaving in the ~4.5 s after the Kraken is driven off, before the Pearl reaches you, drops the Pearl's 1,000 gold and all of level 9's plunder

*Reviewer: polish. Skeptic: real, polish. Outcome: Fixed: leaving once the Kraken is driven off wins the level and banks the Pearl (main.js `takePearl`); voyage3 `kraken-fix4`.*

**Repro.** Level 9, Kraken driven off (stage 'gone', banner 'Grab the Kraken's Pearl!'). Within the 4.3–4.85 s before the Pearl drifts to the ship, pause, then Main menu, then Leave. The dialog reads 'Leave the battle for the main menu? The N gold plundered in this level won't be banked.' The chest does not change and there is no Victory screen. The kraken feat was already saved. Compare the 2.5 s clear countdown that follows: the same dialog there says 'Level cleared! ... goes into your treasure chest' and finishLevel() banks it. Script: scripts/kflow.cjs gone.

**Evidence.** logs/kflow.log, part 'gone': goneFor 4.85 s; leave during 'gone' gives {"mode":"menu","purse0":4177,"purse":4177,"stored":"4177","feats":"...\"kraken\":1..."}. The same fight finished normally banks +3677, Pearl included ({"banked":3677,"wonChest":"The Kraken's Pearl +1,000Banked +3677 gold"}). The window is short and the dialog warns, so this is low priority.

**Skeptic.** Reproduced on a fresh copy at 1280x720 by the same natural route to the fight, with real taps for the leave. I set the Kraken's hp to 0 and it was driven off: stage 'gone', banner 'THE KRAKEN IS DRIVEN OFF! Grab the Kraken's Pearl!', feats.kraken = 1 saved at once. 1.5 s into 'gone' (Pearl not taken, pearlGold 0, clearTimer 0) I tapped #pause-btn, then #quit-menu-btn. The dialog read 'Leave the battle for the main menu?' and 'The 227 gold plundered in this level won't be banked. Your treasure chest, upgrades and unlocked levels stay.' Its no-button says 'Keep fighting', though nothing is left to fight. Leave took me to the title with the purse unchanged (500 in memory and in storage). So the 1,000-gold Pearl and the level's plunder were not banked, and there was no Victory screen. The code agrees: askLeave (5285) and leaveBattle (5336) only treat state.clearTimer > 0 as won, and clearTimer starts only after kraken.over, once the Pearl is taken (5025). This is real but low priority, so polish is right. The window is a few seconds, and longer only if the ship is far from the Pearl, because the Pearl starts drifting 5.5 s after it rises. Leaving takes two deliberate taps. The dialog says plainly what will be lost. Nothing permanent goes: the kraken feat is saved and the level can be replayed. It is arguably what the spec says, since §5.7.1 has the level clear when the Pearl is taken; what is wrong is the dialog wording and a small unfairness, not a broken promise. The pause dialog's Shipyard leave ('dock' via openDock('quit')) behaves the same way. Evidence: logs/v-gone-1280.log. Screenshots, looked at, in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/saves-verify/shots/: v-1280-gone.png, v-1280-gone-leave.png.

## Accessibility

**What the reviewer checked and found fine**

I reviewed a frozen copy of 8afd067 at scratchpad/kraken/review4/accessibility/tree with probes p1–p13 in scratchpad/kraken/review4/accessibility/scripts. Notes are in NOTES.md and screenshots in shots/; I looked at each one.

Title (9 cards, 390x844 touch and 1280x720):
- Tab order is logical, with a 4 px teal focus ring.
- The highest open card is scrolled into view at load.
- No page scroll and no clipped text at all 9 sizes.
- Cards 7–9 use the same white-name-on-gradient style as cards 1–6. The help lists gained '4–6 special' and 'slide on them for gentle turns'.

Battle HUD (touch):
- The tray has 6 buttons, 52 px (44 px on short screens), never overlapping the fire, steer, sail or act pads, the hint or the gun card at any of the 9 sizes.
- Tray buttons are named ('Fire shot, 4 loads left'), use aria-pressed, and aria-disabled with a reason; the Ammo pill carries aria-expanded. Text contrast is 15–16:1.
- The pause dialog's Steering toggle is 267x48 with aria-pressed and a focus ring; the panel needs no scroll.
- In wheel mode the arrows stay in the page visually hidden; the wheel is aria-hidden.

Kraken fight:
- The grab strip text and the CUT! button (66x44, with hold-to-cut through pointer capture) are correct, and the boss badge words are correct.
- #game-live lines arrive in order: stirs, RISES + how-to, furious, grabbed + hold G/CUT!, free.
- Red hit flashes (screen edge and hull card) during 60 s of each of the 3 phases are at least 1.4 s apart, and the grab squeeze is quiet. KA-BOOM is ≤ 0.25 opacity and at most once per 3 s.
- Under reduced motion the rise is a cut. Voyage III rings throb at 0.8 Hz; eye and glows are ≤ 1 Hz. The camera height is constant (no wave bob), and shake and hit-stop are off under reduced motion.
- An ARIA lint (focusables inside aria-hidden, unnamed buttons, broken idrefs, duplicate ids) is clean on the title, the fight with the tray open, and pause.

Over and Victory screens:
- Shipwreck with 'Try again from the Kraken' and the L9 Victory fit without page scroll at all sizes.
- The L6 Victory with the teaser fits at 320x480, 568x320 and 390x844.
- Focus stays on body there, as before this update; Enter works.

Ashore, by keyboard only, at 1280x720 and at 390x844 with reduced motion:
- Quiz: the places bar opens it with focus on island 1. Digit keys answer, Enter goes to Next, Esc returns to the map, Esc again returns to town with focus back on the place button. #quiz-live reads the question and answers, the feedback and the result.
- Build: arrow keys switch the tabs, Enter builds, #build-live speaks, and focus stays on the row.
- Esc from the Harbour-menu path and the E-at-the-place path returns focus correctly.
- Harbour menu (with Quiz and Build) and the Powder room (aria-disabled reasons, 'Press 4' or 'Tap Ammo' wording) pass at 7 town sizes with no scroll, no clipping, and nothing under 44 px. Keyboard focus scrolling in the tavern stays inside its body.
- Every new text-colour pair is ≥ 5.2:1.

Not reported:
- Already-known issues: pops stacking during a grab, the 568x320 results scroll, the retry label wrapping.
- Problems that were already there before this update: menu-mute at 34–40 px, the sail pills at 52x34 on 320x480, focus left on body on the end screens.
- The tray's 10–11 px labels (they come with an icon, and the count is repeated on the pill).
- The #game-live rule that keeps only the newest pending line, which is already there from Stage 2.

### A11Y4-1: On small portrait phones, the level banner's text is drawn over the open ammo tray, so neither can be read

*Reviewer: minor. Skeptic: real, minor. Outcome: Fixed: the banner moves left of the open tray on short portrait screens (style.css); battle `kraken-tray`.*

**Repro.** Use a touch phone at 320x480, 360x480 or 360x640 in portrait, with any special-shot recipe owned. Start level 7 the normal way: G.newGame(7), then let the fly-in finish on real frames. While the 4.5 s level banner is still up, tap Ammo to open the tray. This is when the one-time 'New: Fire shot ... Tap Ammo' tip tells a child to tap it. The same thing happens with the hazard how-to banners that hold their time (ROGUE WAVE!, Fire ship!, Mortar shell!) and with the Kraken's phase banners. Probe: scratchpad/kraken/review4/accessibility/scripts/p8-banner-tray.cjs, run with HOLD=1 so the banner stays up long enough to measure on SwiftShader.

**Evidence.** #banner comes after #hud in the DOM and both have z-index auto, so the banner's white text is painted on top of the tray buttons. Taps still reach the tray (elementFromPoint hits the tray button at 25 of 25 points), so it is only a reading problem. Banner text overlapping each tray button, in px2:
- 320x480: Round 1601, Chain 1163, Grape 1284, Fire 198. Banner box [13,166,307,248], tray box [218,164,312,308].
- 360x480: Round 1601, Chain 436, Grape 969.
- 360x640: Round 1819, Chain 271. Banner box [14,183,346,306], tray box [242,262,352,430].
- Landscape is only slightly affected: 568x320 Round 291, 844x390 Round 35.
- 390x844 (the child's iPhone): 0.
Screenshots: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/accessibility/shots/banner-tray-320x480t-L7.png and banner-tray-360x640t-L7.png. In them, 'Shark', 'charge!' and 'Corsair' sit across the ROUND, CHAIN and GRAPE labels. The same overlap shows with the Kraken rise and phase banners in fight-320x480t.png and fight-360x640t.png. SPEC3 §6.2's layout rule moves only the hint bubble clear of the open tray and leaves out the banner. So the level's safety line ('Shark Raiders ram: turn away when they charge!') and the tray labels block each other on small phones, against §0.1 'readable on a phone' and §15's layouts at 320x480 and 360x480/640 with the tray open.

**Skeptic.** I reproduced this on a fresh copy of 8afd067 (tree at /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/a11y-verify/tree) in the normal flow, without freezing any timers. Setup: touch and isMobile, G.newGame(7), and a real page.tap on #touch-ammo during the fly-in. A fresh tap skips the fly-in, so the 4.5 s level banner still has about 3.7 s left while the tray is open. The tray closes on a pick or after 3 s idle.

Overlap of banner text boxes with tray buttons:
- 360x640: Round 1819 of its 2704 px2, Chain 271. Banner [14,183,346,306], tray [242,262,352,430]. Shot: a11y-verify/shots/v2-level-360x640t.png, where 'Shark' covers Round's icon, 'Corsair' covers its label and 'charge!' covers Chain's icon.
- 320x480: every banner overlaps, because the banner top (166) sits level with the tray top (164). Even the short one-time banner 'New ammo: Fire shot! ... Tap Ammo' covers Round by 968 of 1936 px2 and Chain by 299. Shot: v1-tip-320x480t.png.
- 375x667, 360x800 and 390x844 (the child's iPhone): 0 px2 for the level banner, the ammo-tip banner and the Kraken rise banner.

The overlap is real at sizes SPEC3 §15 lists (320x480, 360x480/640 'battle with the tray open'). Some of the claims are overstated or wrong:
(1) 'Neither can be read' is overstated. The banner paints on top, so its outlined text stays readable. What gets hidden is the top row of the tray (Round, Chain, and at 320x480 also Grape and Fire), for 3 s at most.
(2) The 'New: Fire shot ... Tap Ammo' tip does not show while the level banner is up. tipText() waits for bannerTimer <= 0 (main.js ~L4891). It comes with its own 2-line banner, and that one overlaps the tray only at 320x480.
(3) The Kraken overlap in fight-360x640t.png is a probe composite. A grab strip moved the banner down to 228 px while the rise banner was showing. In a real rise at 360x640 the banner ends at y=256, 6 px above the tray (tray top 262), so 0 overlap.

Taps are not affected (the banner is pointer-events:none), the child's 390x844 phone is clear, and the overlap lasts at most 3 s. So this is minor, not major. SPEC3 §6.2's layout rule does not list the banner, so it is a readability gap rather than a broken written promise.

## Performance and robustness

**What the reviewer checked and found fine**

All files are under /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/perf/ (NOTES.md, scripts/, logs/, shots/). I tested a frozen copy of 8afd067 on SwiftShader, one browser job at a time.

Draw calls (§14, ?quality=low, 1280x720), sampled from real frames while bot v3 played:
- Level 7 peaks at 219: 3 spouts and 2 crates, with 2 ships fighting.
- Level 8 peaks at 236, with 4 ships fighting.
- Level 9 peaks at 210, during a boarding brawl.
- The Kraken fight runs 102-161 (median 135).
- The full journey at 390x844 touch peaked at 205.
- tests/ashore.cjs, section 'draws' only, run on the frozen copy: shipyard 308-315, walk view with every plot at tier 3 at most 401 (the 8 busiest views re-measured at 1280: 379-401), quiz view 52, build view at most 96.
All are within the 450 budgets.

Memory (renderer.info, plus scene object counts and JS heap after a forced garbage collection; logs/p4-*.out):
- 10 restarts of each of levels 7, 8 and 9: each restart sank ships, made holes and brought in the next wave. Geometries, textures, programs and scene objects stayed flat. Level 7: 68 / 9 / 29 / 478. Level 8: 73 / 13 / 32 / 440.
- Level 9 with the Kraken: I alternated an ordinary retry with sinking in the fight and using "Try again from the Kraken". Geometries alternated 93 / 87, textures 14 / 13, heap 58-66 MB, with no growth.
- 10 trips from a level 7 battle to the shipyard, ashore (build view, tavern), back to the shipyard and back to sea: at sea 67-68 geometries / 9 textures, in town 127-129 / 53, flat. The JS heap grew by +0.27 MB per trip, which is negligible.

Console and page errors: none. I checked:
- a full journey at 390x844 touch with taps: title, level 7, shipyard, ashore, a quiz round, building homeA, level 8, level 9, the Kraken, Victory;
- the 1280 bot runs of levels 7, 8 and 9;
- the memory loops;
- the context-loss probe.
I looked at every screenshot (contact sheets sheet-j390-a/b, sheet-play-end, sheet-ctx390, sheet-ashore).

The dread's long frame: the cause and a tested fix are in the finding above. The Kraken model is prebuilt and warm-drawn during the fly-in as designed, and the rise does not stall (startRise takes 5 ms).

WebGL context lost and restored during the Kraken fight, during the dread, on level 7 with a spout, and ashore: the recovery card shows, Continue resumes play, and the scene redraws as before. The only messages are three.js's generic 'object does not belong to this context' warnings.

JS time per frame in the busiest scenes (last stand, level 7 with spouts and 4 ships, level 8 rogue wave): median 4-10 ms on this loaded machine. These are wall-clock readings, so I didn't judge smoothness from them.

### PERF-WARM-FIRSTDRAW: The shader warm-up compiles each program but leaves its first draw for later, so the first waterspout, the first ink slick and the dread bubbles still stall the frame they appear in (this is the cause of the long frames at the dread, queued item c)

*Reviewer: minor. Skeptic: refuted. Outcome: Refuted: SwiftShader-only, nothing reaches a child. No change.*

**Repro.** Frozen tree at 8afd067, ?quality=low, 1280x720, SwiftShader. I wrapped the renderer's renderBufferDirect to time every draw call and to record each program's first draw (scripts/p2_firstdraw.cjs, scripts/p3_play.cjs). (1) Level 9 the real way: T.toInkheart(), sink the Inkheart, step until her skiff has almost fled, then switch to real frames. (2) Bot v3 (the late ship) playing levels 7, 8 and 9 with a real frame every 0.5 to 1 s of game time. For timings I used a copy of the tree with per-phase timers added (scripts/patch_perf.py): it times startDread, removeShip, startRise, step, the colour pass and the outline pass.

**Evidence.** At the dread, main.js itself does almost nothing: startDread takes 2 ms, removing the fleeing skiff 0 ms, startRise 5 ms and the simulation step 5 ms. The Kraken model is already built (kView.ready is true before the dread) and its warm-up draw happens during the fly-in. The whole cost sits in one draw call, the first draw of deep.js's 'deep-bubbles' ShaderMaterial: renderBufferDirect blocks for 1354 ms (logs/firstdraw-real.json). That program was already compiled by warmShaders, and the program count stays at 37. On the timed copy the frame after the dread spends 1280 ms in the colour pass, and the next frame arrives 16 ms later (logs/dread-real-f0.json). Over 5 frames the average is still about 0.5 s, the normal pace. So this is a blocking round trip to the GPU, not CPU work. The same thing happens when the test API raises the Kraken (G.kraken.rise({dread:true})): removeShip takes 0 to 1 ms for each of the 5 ships, and the stall is again the bubbles' first draw, 1690 ms in the colour pass (logs/dread-api-f0.json). Why it happens: three.js r170 checks the link status and reads uniform and attribute locations lazily, at a program's first use (getUniforms/getAttributes, which call getProgramParameter). renderer.compile() leaves that step to the first draw. The same stall hits Voyage III hazards in real play: on level 7 the first waterspout blocks on 'atolls-spout-water' for 3809 ms and on 'atolls-funnel' for 3057 ms (logs/p3-7.out). On level 9 the first ink slick blocks on 'deep-slicks' for 3365 ms, and the dread bubbles for 875 ms (logs/p3-9.out). So §19 WARM-SHADERS / LIVE-2 holds in the narrow sense: no program compiles at those moments. But the stall it meant to remove is still there, and it lands on threat warnings (a spout forming, an ink blob landing) and on the dread. On an iPhone this would be a short hitch rather than seconds (my inference: it was measured only on SwiftShader). Already in Act I/II and not new: 'ship:hole' becomes a new program at the first hole (3E noted this).

**Skeptic.** I reproduced the symptom from scratch on a fresh 8afd067 copy (/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/review4/perf-verify/tree, ?quality=low, SwiftShader). At the dread, the first draw of deep-bubbles blocks for 1394-1579 ms at 1280x720 and 758 ms at 390x844 touch. The frame after it arrives in 6-19 ms. The cause the finding gives, though, is wrong, and nothing here would reach a child.

(1) Isolation, scripts/p1_iso.cjs, logs/iso-L9.json and iso-L7.json. I ran 8 real frames, paused, waited 4 s and called gl.finish (0 ms). Then I timed the first-use step on its own (getUniforms/getAttributes) for every program warmShaders compiled but nothing had drawn yet: deep-bubbles 1.8 ms, deep-slicks 0.9 ms, atolls-funnel 1.4 ms, CartoonCloud 2.2 ms, every other program 0-1 ms. The step three.js r170 does lazily is cheap.

(2) Control, scripts/p2_dread.cjs, logs/dread-plain-1280.json, dread-finish-1280.json and dread-plain-390.json. In ordinary frames where nothing new is drawn, I made one plain synchronous GL query at the 40th draw. gl.getProgramInfoLog on the ocean's program blocked 1126, 1330 and 1176 ms. gl.getError() blocked 956, 1001 and 750 ms. The signature is the same as the bubbles' (one long frame, then frames of 6-36 ms). On L7 (scripts/p3_spout.cjs, logs/spout-L7b.json), getError blocked 1116 and 482 ms, and the funnel's real first draw blocked 673 ms; an earlier run gave 168 ms when it came right after a drain.

So on SwiftShader, any synchronous query in the middle of a frame waits for the frames the main thread has already queued (it runs ahead, then catches up). The size of the block depends on how much work is queued at that moment, not on the shader. That explains the 3-4 s on L7 in the reviewer's bot runs. The pace over the window doesn't change: the next frames take 6-36 ms. This is queued item (c), and it is a probe-environment artefact.

On a phone, at most about one frame of work is queued, and the links finished long before (at level start, seconds to minutes earlier). The cost is a few sync round trips: at worst one ~16-33 ms frame at the first spout or the dread. That doesn't affect the 1.5 s telegraphs, which run on game time, and a child would not notice it.

The spec promise §19 WARM-SHADERS (no program compiles when the spout or bubbles first appear) holds: the program count stays constant.

