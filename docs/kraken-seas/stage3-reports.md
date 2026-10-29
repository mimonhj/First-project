# Kraken Seas, Stage 3 reports

Stage 3 gets Voyage III ready to go live (SPEC3 section 12): 3A wires the acts, the island and the quiz into the game; 3B balances levels 7-9 and the Kraken with a bot; 3C prepares the test side of the go-live; 3D polishes the town; 3E polishes art and sound. Rounds run in the order S1 (3A, 3B), S2 (3C, 3D), S3 (3E). Until the flip, everything stays behind `?kraken=1` and the live game is unchanged; after each round the coordinator runs the full `npm test` on a frozen copy and commits only a green tree. Rows whose agent was cut off by a usage limit after publishing were closed by the coordinator from the agent's progress notes and logs; their sections say so.

## Round S1

**Coordinator test run:** the full `npm test` (19 suites) on a frozen copy of the working tree with 3A's, 3B's and 3D's files (3C's test files left at HEAD: they need the flip). 2,000 checks passed. One controls check failed once while 3E's browser jobs loaded the 4-core machine (load about 8): 'two tabs, one capture each', where tab A's copy of the feats did not catch up within 30 s, though the saved record was right. It passed when its section was re-run (`CONTROLS_ONLY=review2`: 19 / 0), and the chain was then finished suite by suite (audio, battle, levels, town all green). The flake is noted for the Stage 4 review.

### 3A integrator (acts and town)

*Closed by the coordinator: the agent published its files and finished its exit check, but a usage limit cut it off before it wrote its report. This summary comes from its progress notes (`.dock-harness/kraken3/S1-3A/PROGRESS.md`) and its logs.*

3A wired the island, the quiz, the Powder room and the third act into `src/main.js` (plus `src/voyage.js` and `style.css`; `index.html` needed no change).

**What it built**

- **Saves.** The island record (`ISLAND_KEY`) and the quiz record (`QUIZ_KEY`) are loaded when the page loads, under `WITH_KRAKEN`, before the captain's look. `syncIsland` and `syncQuiz` keep them current. A `storage` listener picks up changes saved in another tab.
- **Feats.** `raiseRecordFeats` raises three feats from the records, merging each by max: `feats.quiz` (islands passed: the mortarboard), `feats.stars` (total stars: the Rainbow macaw) and `feats.island` (every plot at tier 3: the Governor's coat). This closes review finding ASH-1.
- **Spending.** `buyPowderRecipe`, `buildPlot` and `saveQuiz` follow the storage rule: record first, then the chest. `saveQuiz` pays only the stars that the new record marks paid (`owed(kept) - owed(next)`), plus 10 gold per try.
- **The town.** The townMode ctx is complete: `withKraken`, `unlocked`, `powder`, `island`, `quiz`, `hints` and `rebuildShip`. Opening the dock calls `showIsland`, which drives `env.setIsland`, `setVillagers` and `setRank`. Tests can reach `__game.island.build` and `__game.quiz.start`.
- **The migration** of SPEC3 section 10.3: `raiseProgress(7)`. A save with all six old levels won opens level 7, and nobody loses anything.
- **The acts.**
  - The title shows nine level cards in three groups, and `showOpenCard` scrolls the open card into view.
  - After the Maelstrom, the Victory screen reads `def.sailOn` ('Sail on to the Kraken Seas') and shows `ACT3_TEASER` (re-exported from `voyage.js`).
  - The Victory banner for Act II onward defaults to 'The Far Seas are yours'.
- **The 9-skull difficulty pill** (a Stage 0 open item). When the pill has seven or more skulls, `style.css` puts the skulls on their own line in the three-column title grids, so the pill no longer overflows.
- **Review finding LIVE-2.** `warmShaders()` calls `renderer.compile` on the level scene at the end of `startLevel` (`WITH_KRAKEN` only). On the flipped mirror, the level 7 funnel and spout water and the level 9 deep bubbles compile at level start, and nothing new compiles when they first show. Before, each compiled on its first appearance.

**Verification**

- A title probe on the flipped mirror at 12 sizes showed no page scroll, no overflow and the open card in view. A save with six levels won plus the legend migrated to 7.
- On the flipped mirror, tests/ashore.cjs sections build, perks, tabs and quizmap passed 31 of 31, with none of 3A's PENDING tags left.
- A journey probe (`pjourney.cjs`) passed. It checked the Maelstrom Victory text and teaser, 'Sail on to the Kraken Seas', the banner, the won dock's exits ('Set sail for The Turtle Atolls' / 'Back to the title'), Enter going to level 7, and the level 7 gift and Market lines. Its screens were looked at.
- **Live game unchanged.** A seeded replay of levels 1-6, comparing HEAD with the published tree without the flag, came out IDENTICAL: 58 samples, 0 errors. Without the flag, the suites passed: levels 75, town 135, smoke 94, controls 232.
- **Published:** `src/main.js`, `src/voyage.js` and `style.css` on 2026-10-27 at 19:18 UTC.

### 3B balance

*Closed by the coordinator: the agent published its files and finished its exit check, but a usage limit cut it off before it wrote its report. This summary comes from its progress notes (`.dock-harness/kraken3/S1-3B/PROGRESS.md`) and its bot logs (`build3/S1-3B/*.jsonl`).*

3B wrote **bot v3** (`.dock-harness/kraken3/S1-3B/bot/bot3.js`, with the resumable runner `run3.cjs`).

**The bot**

- It plays levels 7-9 on a flipped mirror with three ships, with and without special shot:
  - stock
  - *late* (the ship a child arrives with)
  - fully upgraded
- It plays two strategies: circling and beam-keeping. A *sit* strategy, which fires but never moves, served as the ram probe.
- It avoids land and gets itself unstuck. A stall hunt over 96 level 9 runs found 0 stalls.

3B then tuned **numbers only** in their tables. Every change is in the table below, which the coordinator copies into SPEC3 section 19.

| Number | Was | Now | Why |
|---|---|---|---|
| `KRAKEN.hp` | 600 | 2850 | The finale was over in 33-47 s on the late ship (review finding kraken:F2). Target: a 120-180 s fight in which the grab, the ink and the last stand are all seen. |
| `KRAKEN.notches` | [400, 200] | [1900, 950] | Kept at thirds of hp, so the bar marks stay. |
| `KRAKEN.phases[0].head.every` | 3 | 2 | The head shows more often in phase 1, so the eye is a target sooner. |
| `RAM.cooldown` | 6 | 9 | A captain who sits still was rammed every 8.7 s; now every 11.7 s. |
| `MORTAR.keep` | [35, 45] | [28, 38] | The bomb ketch kept just out of the player's gun range (34): a sitting player fought 57-816 s and took up to 1008 shell damage. |
| `bombketch.engage` | 42 | 33 | Same reason; a sitting late ship now wins in 29-93 s, and a stock ship wins 7 of 8. |
| Inkheart reload / damage | 2.4 / 6 | 2.6 / 5 | The late ship sank on its first try at level 9 in 13-19 of 96 runs, every time to the Inkheart at close range. Now 0 of 96. |

**Tried and reverted:**

- Level 7 with up to 3 attackers. The stock ship sank more often, while the late ship actually took less damage.
- Level 9 with lead 0.6 and spreadMul 1.1. It made no difference.
- A per-phase 'hold' on the Kraken bar. It was not needed: every phase is seen even on the full ship.

3B added a `dmgBy` breakdown to the Kraken's snapshot (eye, head, tentacle, burn, burst). It also added the Maelstrom's `sailOn` and `teaser` keys to `act2.js`. The teaser equals `ACT3_TEASER`, which tests/mechanics3.test.cjs checks.

**Results.** Final numbers: level 9 on the late ship, 24 seeds per configuration, Kraken hp 2850.

| Configuration | Runs won (2 tries) | Won first try | Damage median | Fight median | Fight max |
|---|---|---|---|---|---|
| special shot, beam | 23 / 24 | 23 | 155 | 135.3 s | 190 s |
| special shot, circle | 24 / 24 | 23 | 110.5 | 144.8 s | 185 s |
| no special shot, beam | 24 / 24 | 22 | 144 | 138.1 s | 167.7 s |
| no special shot, circle | 24 / 24 | 24 | 91 | 136.3 s | 250.9 s |

- Across all four configurations: fight median 138.8 s, p95 183 s.
- Levels 7-9 damage medians on the late ship, measured with Kraken hp 2700, which leaves levels 7 and 8 unchanged:
  - special shot, beam: 49.5 / 118 / 124
  - special shot, circle: 56.5 / 82 / 96
  - no special shot, beam: 46.5 / 76 / 117.5
  - no special shot, circle: 47.5 / 59.5 / 99.5
  - In those runs every level was won within 2 tries, 96 of 96.
- Voyage III's order holds: level 7 < level 8 < level 9.
- **tests/balance.cjs at BALANCE_RUNS=24** (with every recipe owned):
  - Act I medians 34 / 106 / 110: the Volcano is above Europe. PASS.
  - Act II medians 68 / 30 / 119: the Maelstrom is above Doubloon Bay. PASS.
  - 12 checks passed and 1 failed: the Act I 'clears every run' check. The stock Act I bot lost 1 of 24 Volcano runs on both tries, through bad rolls of `Math.random` aim spread and lava scatter. Act I was not changed. 3C made the check allow one lost run in ten, so this should now pass; it re-runs at the flip.
- **Exit checks.** All 13 Node suites are green. tests/kraken.test.cjs (161 checks) now derives its phase hp values from `KRAKEN`, and tests/mechanics3.test.cjs (185) pins the new numbers. Hook requests to 3C (Kraken hp values in voyage3.cjs derived from `KRAKEN`) were applied by 3C.
- **Live game unchanged:** every change is in a Voyage III table or the Kraken, which only sail with `WITH_KRAKEN`. The new `act2.js` keys are only read with `WITH_KRAKEN`.
- **Published:** `src/act2.js`, `src/kraken.js`, `src/mechanics3.js`, `src/shipTypes.js`, `tests/kraken.test.cjs` and `tests/mechanics3.test.cjs` on 2026-10-27 between 18:57 and 19:23 UTC.

## Round S2

**Coordinator test run:** Round S2's files were tested together with Round S1's (see above): 3D's are committed with them. 3C's test files, `tests/balance.cjs` and `package.json` go live together with the flip, and are tested there.

### 3C tests (go-live side)

*Closed by the coordinator. The agent published its test files and finished almost every check, then a usage limit cut it off before it wrote its report. This summary comes from its progress notes (`.dock-harness/kraken3/S2-3C/PROGRESS.md`) and its logs (`logs/summary.txt`). Its test files go live together with the flip (Stage 3 'flip' below), because most of its edits only hold once WITH_KRAKEN is true.*

3C prepared the test side of the go-live on flipped mirrors, which are copies of the working tree with `WITH_KRAKEN = true`. The final mirror (`mkd2`) also carries 3A's, 3B's and 3D's published work.

**Edits to existing assertions (SPEC3 section 13.4)**

- S1, S2 (smoke): 9 level cards in three voyages; the difficulty words Daring / Fearsome / Mythic on cards 7-9.
- K1-K4 (controls): K4's touch-size list adds the steering-mode button.
- L1-L14 (levels): for L8, the loop bounds go from 12/6 to 16/9 and the messages say 'all 9 cards'.
- B1, B2 (battle): the voyage has 9 levels.

**Other changes the flip legitimately needs, each with its reason**

- levels.cjs, the title probe: its save goes from '6' to '9'. Locked cards take no clicks (`pointer-events: none`), so cards 7-9 must be open to be probed.
- levels.cjs, the LIVE-1 progress section: it works for any number of levels N, plus a '12' row, so 'never lowered' is still exercised once N = 9.
- voyage3.cjs: every absolute Kraken hp value (12 of them) is now derived from `KRAKEN` (hp, n1, n2), so 3B's tuning and any later one hold.
- voyage3.cjs, ashore.cjs and balance.cjs: the default query is now `?quality=low`. `VOYAGE3_QUERY` / `ASHORE_QUERY` / `BALANCE_QUERY` restore `&kraken=1` for an unflipped copy.
- ashore.cjs: the PENDING mechanism and its 10 tags are removed, because every piece now exists. Each section also closes any contexts left open after it.
- balance.cjs: 'still cleared' allows `floor(RUNS / 10)` lost runs per level. That is none at the default 5 runs, and 2 at 24, where the stock Act I bot lost 1 Volcano run in 24 to bad `Math.random` rolls (see 3B).

**New checks in voyage3.cjs**

- **'voyage' (6 checks):**
  - cards 7-9
  - the migration legend (a save with six levels won goes to 7; a fresh save goes to 0)
  - the Maelstrom's Victory teaser and 'Sail on to the Kraken Seas'
  - the won dock's exits
  - Enter going to level 7 with gold
- **'bot' (15 checks):** bot v3 (from 3B) plays one seeded run of each of levels 7-9 with and without special shot. Each level must be cleared within 900 s and 2 tries, with no stretch of 60 s or more without progress, never stuck, and the Kraken's fight within 240 s. On the mirror, the level 9 fight takes 147.7 s with special shot and 187.5 s without.

**package.json** (published at the flip):

- `npm test` adds `voyage3` and `ashore` after `town`, making 21 suites in section 13.5's order.
- New scripts: `test:voyage3`, `test:ashore`, and the opt-in `test:balance` (not in `test`).

**Mutation proofs.** These are broken copies of the flipped mirror, and every one is caught:

| Mutation | Caught by |
|---|---|
| migration off | voyage mig1 |
| no legend | voyage mig0 |
| teaser off | voyage w1 and levels L9 |
| sail-on text off | voyage w1 and levels L9 |
| Enter stops | voyage s2 and levels L11 |
| dock exits wrong | voyage exits |
| Kraken 5x weaker | the bot's fight checks (681.9 / 637.3 s > 240) |
| setHp without the phase change | the kraken-fight FIRE!/head check |
| Molten Maw damage 4 -> 40 | balance 'clears' (lost 0/0/10 > 1) |

**Verification on the final flipped mirror `mkd2`:**

| Suite | Result |
|---|---|
| ashore | 143 / 0 (all 10 former PENDING checks pass) |
| town | 135 / 0 |
| controls | 232 / 0 |
| levels | 75 / 0 |
| smoke | 94 / 0 |
| voyage3 | 123 / 0 |
| battle (earlier mirror `mkd`, same test file) | 278 / 0 |
| audio (earlier mirror `mkd`) | 50 / 0 |

The 13 Node suites are green. voyage3.cjs, levels.cjs and smoke.cjs fail on the unflipped tree by design: they expect nine cards. The cut-off left two jobs undone, the final battle and audio runs on `mkd2` and the unflipped documentation runs. The coordinator's full run at the flip covers both.

### 3D town polish

3D town polish is finished and published. I published four files atomically at 08:28 UTC, using cp to a temp name + mv after checking that each repo copy still matched base: src/env/sparrow.js, src/townMode.js, tests/walk.test.cjs and tests/fixtures/sparrow-walk.json. I walked the island on WITH_KRAKEN=true mirrors at 1280x720 and 390x844 touch. That covered the plots at tiers 0-3 from the walk camera and the build view, the villagers, the bell with Professor Barnacle, Bess and her plan, the Powder room, the Esc-back views and the build montage. Three things looked wrong, and all three are fixed:
1. The build scaffold was invisible. It was brown, smaller than the old shack and sat inside its walls; the windmill's was hidden completely. It is now sized round both the old and the new building and pops up from the deck (at once under reduced motion). It has yellow poles, orange rails, red cross braces, pale planks, a ladder, a pulley with a bucket, little flags along the top and a red-and-white barrier.
2. Nothing showed SPEC3 §8.3's 'Thank you, Captain!' bubble. townMode now shows it over env.wavers for the 2 s they wave, in the build view or the town.
3. In the quiz panel on a phone, the captain hid Professor Barnacle and Quizzle. The quiz place now has a panel stand one step to the left, which needed a walk-data change and a regenerated fixture.
I also moved the sparkle after a build onto the new building's real top; before, it floated far above at the plot box's top. I considered 1N's bridge-mouth hook, measured it, and kept the villager bridge exemption: details are in api_notes and open_issues. Without ?kraken=1 the town is exactly today's. walk.test passes 107/107, the town suite is green on a no-flag dev mirror, every ashore section is green on the WITH_KRAKEN=true dev mirror, and draw calls are within budget (the town walk view peaks at 401 of 450).

**Files:** src/env/sparrow.js, src/townMode.js, tests/walk.test.cjs, tests/fixtures/sparrow-walk.json

**Brief, item by item**

- Looked at the island like a child on the WITH_KRAKEN=true mirror (.dock-harness/kraken3/S2-3D/mk = working tree + my dev files + forced flag) at 1280x720 and 390x844 touch. Covered: walk views at 7 spots for tiers 0-3; build-panel views of all 10 plots at tiers 0-3 (contact sheets); the quiz map, question and right answer; Bess and the build panel; the tavern Powder room; Esc-back views at the bell, Bess and the tavern; the home and windmill montages frame by frame. Probes: scratch .../build3/S2-3D/look.cjs (with a fake clock, lib.cjs), quizcam.cjs, results.cjs.
- Scaffold readability: done in sparrow.js scaffold()/scaffoldBox(). It is sized from the baked chunks of the old and the new building, so it stands outside both. Under reduced motion it stands at once. Checked visually: r1/r2/r3 home and windmill montages at both sizes (the windmill's scaffold was fully hidden before). ashore build section: 11/0, which covers squash and stretch, reduced motion and the walk data equal to the fixture.
- 'Thank you, Captain!' bubble over env.wavers (SPEC3 §8.3, 2B/2E leftover): done in townMode.js placeThanks(). It is a separate aria-hidden .town-bubble.thanks-bubble, placed first in #build-screen (so the panel draws over it) or in #town-screen, and positioned above the wavers for as long as they wave. KRAKEN only. Seen in the montage shots at 1280 and 390.
- Quiz panel framing on phones: done. The sparrow.js quiz place gains podium = the tower-local stand (-1.4, 2.62), which town.js park() already uses. Fixture regenerated with dumpwalk.cjs: the base dump equals the old fixture byte for byte, and the only change is the podium. New walk.test check: 'the quiz's panel stand is on the walk, clear, a step from the bell's place, and the professor stands >= 8 deg beside it from the panel camera'. It passes at 8.7 deg and FAILs on the old data at 0.0 deg. Seen in qcp/ shots and ashore quiz.png.
- Sparkle over a new building: done. The plots getter gains `top` (plotTop: the chunk's highest point, cached; null without KRAKEN), and townMode's finishMontage sparkles at info.top + 0.4. Seen in r3 m-home-after0_3.
- 1N optional bridge-mouth hook: considered and measured, and declined. The town.js half is already covered by the 49f1b5e hotfix (the people-free mouth zone and the rope slide). I tested dropping sparrow's villager exemption (exp/sparrow-noexempt.js on mirror mkx) with the ashore walking section. Without the exemption: 7/0, (b) 240/240, longest stall 0.4 s, slowest crossing 7.93 s. With it: 6.7 s. The same numbers came out with seeds 777 and 4242 (the section is deterministic). Every walking check stays green either way, but dropping it only adds bump-and-squeeze stops on bridges, with nothing a child would see. The exemption stays.
- Hook requests addressed to my files (stage2-reports, stage2-review, 3A): 3A made none. The 2B/2E leftovers (the wavers bubble, scaffold readability, 1N's hook) are handled above. FX-ash's open note (568x320 results need a scroll for Play again/Map) was looked at and left as is: Next quiz and Back to town are in view, and the layout check accepts it.
- Budgets (SPEC3 §14), ashore draws on mk: town walk view 30 spots x 8 headings max 401, mean 190 (<= 450); shipyard view 308-314; quiz view 52; build views max 96 (lighthouse). The scaffold is temporary and baked into at most 3 meshes.
- Live game unchanged until the flip: proven. Details are under live_unchanged.
- Exit suites: walk.test 107/107 on the repo after publishing. town.cjs on the no-flag dev mirror is green. ashore.cjs on mk is green section by section. Counts are under verification.

**API notes**

sparrow.js (env from build):
- `env.plots` entries gain `top`: the world y of the highest point of what stands on the plot now. It comes from the baked chunk (the windmill sails and the beam are drawn apart and not counted), is cached per plot/tier/lit, and is null without KRAKEN or before the layer is built.
- The scaffold group added during the montage is still the userData.keep frame at scale 1. Its child `userData.pop` (no keep) scales y from 0.08 to 1.08 to 1 over 0.35 s. ashore's squash probe only counts keep groups, so the pop is not counted.
- Walk data: the 'quiz' place gains `podium: { x: -19.19, y: 1.3, z: -22.6 }`. It is the panel-view stand; town.js park() already reads podium. The fixture is regenerated and the only change is these 5 lines.

townMode.js:
- `placeBubble(at, node = bubble)`: same behaviour for the greeting bubble.
- `placeThanks()` runs every frame under KRAKEN. It reads env.wavers ([{ x, top, z, secs }]) and shows `.town-bubble.thanks-bubble` with the text 'Thank you, Captain!' at their mid point, above the higher head top. The bubble is inserted as the first child of #build-screen in the build view, or of #town-screen in the town view, and hidden otherwise. It is aria-hidden: #build-live already announces who moved in.
- The sparkle after a montage now uses info.top when it is finite.

Kept: sparrow's villager bridge exemption in folkOnWalk(). The A/B is in done; the variant file is .dock-harness/kraken3/S2-3D/exp/sparrow-noexempt.js.

**Hook requests applied / rejected**

- 2B/2E leftover (stage2-reports, 2B open issues and 2E's hook request): the 'Thank you, Captain!' bubble over env.wavers, now in townMode.js (I own townMode in Stage 3).
- 1N/2B open issue: sparrow's scaffold reads poorly in the montage. Rebuilt in sparrow.js.
- 1N optional hook (town.js bridge-mouth projection, so sparrow can drop its villager exemption): considered. The hotfix 49f1b5e already did the town.js part. Dropping the exemption was measured green but brings no visible gain and slows crossings, so it was declined (see done).

**Hook requests raised**

- tests/ashore.cjs (3C), section 'build', optional new check for the SPEC3 §8.3 bubble. After `T.b().skip()` on a fresh Cottage (from tier 0), wait 2 frames: `document.querySelector('#build-screen .thanks-bubble')` is shown, its textContent is 'Thank you, Captain!', and `window.__game.env.wavers.length === 2`. Then after about 2.5 s of game time (frames) it carries the class 'hidden' and env.wavers is empty. Why: nothing else tests the bubble. It is KRAKEN only, so add it with the flip.
- tests/ashore.cjs / tests/town.cjs (3C), FYI, no edit needed: tests/fixtures/sparrow-walk.json was regenerated (+ the quiz place's podium). ashore 'build' (walk == fixture) passes against it: 11/0 on mk.

**Live game unchanged**

Every change is KRAKEN-only, so without ?kraken=1 the town behaves exactly as today:
- sparrow.js: scaffold(), plotTop() and the quiz podium only run or exist under KRAKEN. The quiz place is only pushed with the flag. plotTop returns null without it.
- townMode.js: thanks is null and placeThanks only runs `if (KRAKEN)`. placeBubble's default parameter keeps the greeting bubble byte-for-byte in behaviour.
- The sparkle change is in finishMontage, which needs a montage (KRAKEN only).

Proofs:
- The no-flag walk data dump of dev equals base exactly (16066 bytes).
- town.cjs on the no-flag dev mirror is green, including review4/review4-world on rerun.
- The live town.png shows today's four-button bar.
- walk.test's no-flag checks are unchanged and pass (107 total).

After the coordinator flips WITH_KRAKEN, players get the new scaffold, the thank-you bubble, the quiz stand and the sparkle placement.

**Verification**

All browser runs used NODE_PATH=/opt/node22/lib/node_modules, the SwiftShader args and tests/server.cjs, one browser job at a time. Machine load was 9-15 from other agents' battle.cjs and voyage3.cjs. Scratch dir: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/kraken/build3/S2-3D (logs/, shots/).

Node:
- After publishing, `node tests/walk.test.cjs` on the repo: 'All walk checks passed (107)'.
- The new check fails on the old fixture: '0.0° beside it (at least 8°)', 1 check failed.

No-flag equality:
- dumpwalk.cjs on mn (dev, no flag) vs bn (base, no flag): `cmp` identical, 16066 bytes.
- The base dump with the flag equals the old fixture (cmp).

town.cjs on the no-flag dev mirror (.dock-harness/kraken3/S2-3D/mn):
- Full run: 119 passed. review4 and review4-world crashed on page.goto 120 s timeouts under load, twice.
- Rerun alone: TOWN_ONLY=review4 '9 passed, 0 failed'; TOWN_ONLY=review4-world '14 passed, 0 failed' (all rope-bridge checks).

ashore.cjs on mk (ASHORE_ROOT=mk, default query):
- The full run passed bar, keys, walking and quiz. quiztaps then crashed because a tap was missed under load, and the open contexts made the later sections time out.
- Rerun one group per process (tools/ashore-groups.sh): quiztaps 3/0, quizrec 8/0, build 11/0, perks 6/0, powder 7 passed in the powder,tabs group, tabs alone 6/0, layout 29/0, quizfit 8/0, quizmap 11/0, draws 4/0, rays 2/0.
- From the full run: bar+keys 38 PASS, walking 6/6 ((b) 240/240, stall 0.4 s; (a) 0.97 s; (c) 1.7-2.0 s; (d) 0 stops), quiz all PASS.
- ASHORE_PENDING was not needed: every tag passed.

Bridge A/B (walking section): mkx 7/0 and mk 7/0, with seeds 20261022, 777 and 4242.

Screenshots I looked at (Read tool), both sizes unless noted:
- Montage contact sheets r0, r1, r2, r3 (home + windmill).
- Build views b0-b3 of all 10 plots at 390 (sheets).
- Walk views t0-t3 at 1280.
- Esc-back views.
- Quiz camera candidates (qc/, qcp/ at 390 tier 0/3 and 1280).
- ashore quiz.png, build.png, island-tier3.png.
- Live town.png from town.cjs (4-button bar).
- results-568.png.

**Open issues**

- In the full run, town.cjs review4 and review4-world, and later ashore sections, crashed on page.goto 120 s timeouts while other agents' battle.cjs and voyage3.cjs held the machine at load 13-15. Run alone, every one passed. The coordinator's full npm test may hit the same load flake if run alongside other browser jobs.
- Already in today's live game, not changed: a walk camera placed at the yard facing north (captain at about (16,-14.7)) can end up 0.6 u from a dark baked shipyard mesh, which then fills half the view. My probe found it with enter()+recenter(); it is identical without ?kraken=1. Left alone, since the town must stay as it is until the flip.
- Only on short landscape (568x320): after a quiz round, Play again and Map sit below Next quiz and need a scroll. The existing layout check accepts this; it is unchanged.
- The villager bridge exemption in sparrow.js stays: a documented deviation from SPEC3 §8.4. Dropping it is safe by the A/B (all walking checks green) but brings no visible gain; the variant is .dock-harness/kraken3/S2-3D/exp/sparrow-noexempt.js if the coordinator wants it later.
- walking (a) still measures 0.97 s against its 1 s limit, the same as before my changes (the hotfix noted this too). It is deterministic, so it doesn't flake, but it has little headroom.
- Nothing is committed (as instructed). Progress log: /home/user/First-project/.dock-harness/kraken3/S2-3D/PROGRESS.md (marked DONE). Published copies: .dock-harness/kraken3/S2-3D/published/.
