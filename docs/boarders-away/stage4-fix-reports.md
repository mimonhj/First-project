# Stage 4 fix reports (data, written by the fix agents; trust the code)

## T: town files

Agent T fixed all 12 assigned town findings (TOWN-1 to TOWN-4, A11Y-3, A11Y-4, A11Y-6, PERF-3, LOOK-2, LOOK-4, LOOK-5) and the Stage 3 leftover: simulate() now fills in the greeting bubble's text. Two extra changes were needed. First, a held walking key keeps the direction it started with when the camera swings round on its own; without this, W held from some bridge ends still veered into the rope. Second, an auto-walk only cuts a corner when the straight way on is walkable. Without that, a places-bar walk could get stuck at the plaza end of the yard bridge, at (7.90,-12.43); this bug is also in ebad6f2. The changes are in src/townMode.js, src/town.js, src/walk.js, src/env/sparrow.js, tests/walk.test.cjs and tests/fixtures/sparrow-walk.json (regenerated from the live env.walk; it matches byte for byte). town.css needed no change. Each file was published with a copy under /home/user/First-project/.dock-harness/T4/, then cp to a temp name and mv into place. Results on the published repo, which also has G's published main.js and other files: node tests/walk.test.cjs passes 74 of 74. node tests/town.cjs passes 109 and fails 5, and all 5 failures are checks that assert the old behaviour (listed under behaviour_changes). Walk-view draw calls are at most 338 at the 6 spots and at most 243 along the shipyard to tavern walk.

### Fixed

- TOWN-1: townMode.onKey: E always goes in at a door; only Enter and Space are left to a focused button (`if (k !== 'e' && buttonFocused()) return false`). New leaveHudButton() runs on a walking key in the town view and when the touch stick starts: if a town-HUD button has focus (places bar, ☰, 🔊, prompt), focus moves to #town-screen. ☰ and 🔊 are blurred after mouse or finger clicks (new pointerClick(e) helper, also used by the places bar). ☰ is blurred before openHarbour, so Keep walking returns focus to #town-screen, not to ☰. Confirmed with the verifier's verify-town/v1.cjs on my copy: after Esc focus is place:tailor; after holding W it is town-screen; E at the tavern door opens the tavern; after a mouse click on 🔊, E at the door goes in and Enter does not unmute. My townchk.cjs: ☰ clicked, then Keep walking by mouse, gives focus town-screen, and Enter at the door opens the tavern with the purse unchanged. E with place:tavern focused opens the tavern. The stick moves focus from place:tavern to town-screen.
- TOWN-2: The panel repeat guard now covers Enter and Space: `(e.key === 'Enter' || e.key === ' ') && e.repeat && target is a button` → preventDefault. It is on the wardrobe and tavern panels, the Harbour and All aboard dialogs, and #town-screen (so a held Enter on Back to town doesn't reopen the panel). Confirmed with verify-town/v2.cjs at the tavern door: Space with 0, 1 or 3 repeats, Enter with 3 and E with 3 all leave purse 1000 and armory null, with focus on armory:boarders. A single press still opens the tavern.
- TOWN-4: Covered by the same guard on el.aboard and el.harbour. Confirmed with verify-town/v2.cjs at the ship: held Enter (1 repeat) or held Space (3 repeats), from levelDone and from menu, gives {mode:'dock', aboard:true, focus on the first exit}. The dialog stays open and the level doesn't start.
- TOWN-3: (1) sparrow.js bridge(): the rope-post blockers now get r = max(0, hw − BRIDGE_HW − radius) = 0, so there is no 0.05 lip at the band edge. (2) walk.move: when a step is blocked it tries the x-only step, the z-only step and the step turned ±15/30/45/60° (shortened by the cosine), best projection first, so a walker slides along a slanting rope and round a round post. (3) town.js stepWalk, beyond the verifier's fix: a held walking input keeps the camera yaw from when it started (`hold`), so the cramped-camera swing or the follow swing no longer re-aims W. A drag or C still turns it, and turning the input more than 0.35 rad re-reads the camera. This was needed for the land ends where the verifier saw the camera swing turn him 60–70° off. (4) town.js auto-walk: a waypoint within 0.25 is skipped only if walk.clear() to the next one is true. corner.cjs: from (7.9045,-12.4263), ebad6f2 and the pre-fix code stop after 1.3 s; now he reaches the tavern in 7.2 s. Proof: bridges.cjs, fixed 1/60 steps with folk stubbed, all 8 land ends, starting 0 or 0.5 back at 0° and ±5°: 48 of 48 cross in 1.3–2.1 s. On ebad6f2, 67 of 72 runs stop. The 5 runs that still stop all start 1.5 back, where the start snaps off the bridge line or into a deck corner. brkeys.cjs, real keys in the real loop with nothing stubbed (C pressed, W held), at 1280x720 and 390x844: all 8 land ends cross. plazaYard< needed a longer limit under load: 59 s. New walk.test checks: no lip anywhere along the band edges; a jog held from each land end crosses straight, 5° or 15° off (40 of 40, slowest 1.8 s); sliding round a round post. All three fail on the old walk.js and fixture.
- A11Y-3: clickItem, priced branch: after applyLook, if the item has focus, the group's Buy row and then the item are scrolled into view (block 'nearest'). Confirmed with verify-a11y/tryon.cjs: the focused item stays fully visible after try-on: 93/93 px at 1280x720, 80/80 at 390x844 touch, 44/44 at 568x320 touch (before the fix: 32/80 and 20/44).
- A11Y-4: refreshPrompt, hide branch: if the prompt has focus, focus moves to #town-screen before the prompt is hidden. Confirmed with verify-a11y/prompt.cjs: 'focus after the prompt hid: town-screen' (was BODY).
- A11Y-6: refreshPrompt sets the prompt's aria-label: touch '<name>: <verb>', desktop '<name>: press Enter to go in / go aboard'. Confirmed with verify-a11y/promptname.cjs (CDP AX tree): 'The Sea Biscuit: All aboard' on touch, 'The Sea Biscuit: press Enter to go aboard' on desktop.
- PERF-3: townMode.applyLook: while Polly's is open, a crew change only sets crewDirty. leavePanel (tailor) runs restyleCrew() once when the wardrobe closes; close() clears the flag because the island goes. restyleCrew uses an optional ctx.restyleCrew callback if main passes one; main doesn't pass one today, so townMode's own env.setCrewStyle call runs. Confirmed with verify-robust/perf3.cjs: no setCrewStyle call during crew item or Surprise me! clicks (crewStyle undefined). townchk.cjs: 4 crew clicks make 0 setCrewStyle calls and leave the six cleaning-crew shirts unchanged; back() makes 1 call and the crew wears the last pick.
- LOOK-2: town.js tellEnv(): each frame while walking it calls env.setCaptain(cap.x, cap.z), and setCaptain(null) when parked, inactive, on exit or dispose. sparrow.js adds setCaptain and inTheWay(f): the captain is ahead of the walker by 0 to 1.0 along its facing, less than 0.7 to the side, and more than 0.6 away. A walker in that case waits: f.off -= dt, the pose is recomputed, the walker idles. A walker already overlapping him walks on out, so he can't trap one inside him. walkers2.cjs (town stepped in-page for 60 s): closest approach of the porter (folk 10) and the bandana pirate (folk 11) goes from 0.10 and 0.19 on ebad6f2 to 0.94 and 1.02. stress.cjs (36 places-bar walks with live townsfolk): 0 failures, slowest 14.5 s (ebad6f2: 0 failures, slowest 11.7 s).
- LOOK-4: sparrow.js STALLS loop adds camBox(g, 0, 0.45, 3.0, 2.4, 0, 2.0, 2.9) over each stall: world y 3.3 to 4.2, reaching a little in front of the awning, so the walk camera cranes over the stripes. aw.cjs (frame share of the awning tops during places-bar walks to the tavern, 1280x720): worst 23.3% with 0.87–1.03 s over 15% on ebad6f2, against 13.6% at most and 0 s over 15% now. At 390x844 it is at most 7.1%. One walk along the plaza (pots stall) still reaches about 16% for 0.17 s, as it did before. A wider box (w 3.4) cut the worst to 8.7% but brought the camera closer on average (3.85 against 4.5 u), so I kept 3.0. Screenshots: shots/aw-final-*.png, aw-C-*.png and ws-pub-shipyard-tavern-{d,m}-*.png in my scratch dir.
- LOOK-5: sparrow.js plaza-tavern block: 3 boards (rbox, thin plank and wood3 tones) laid across the 0.3 seam from x -8.44 to -1.01, 0.64 deep, top at deck height + 0.015, added to statics so they are baked (no extra draw calls). seam.cjs: downward rays at z -14.95 for x -8 to -1.2 now hit at y 1.305–1.315 (before: nothing). Screenshots seam-new-{west,east,north,south}-{d,m}.png show a plank strip where open water showed.
- 3C leftover: simulate greeting: town.simulate() returns greet:true if any step started a greeting. townMode api.simulate then sets the bubble's text with greetLine(), as update() does. townchk.cjs: simulate next to a greeter gives {greet:true, text:'Ahoy, Captain!'}.

### Not fixed


### Behaviour changes

- tests/town.cjs places, 'at Polly's door E, Enter and Space go in, but not while a button has focus': old: E with a places-bar button focused does nothing. New: E always goes in (withButton.view 'tailor', auto null). Enter and Space with a places-bar button focused still press that button (auto 'tavern'). Update the check so E goes in. Note the check's next step calls T.town().enter('tailor') while the tailor view is open, so call G.town.back() first.
- tests/town.cjs places, 'the ☰ button opens the Harbour menu ...; Keep walking closes it, focus back on ☰': old: after a mouse page.click on ☰ and then Keep walking, focus is on ☰. New: ☰ is blurred after a pointer click, so focus lands on #town-screen ({open:false, focus:'town-screen'}). Opening ☰ from the keyboard (focus() plus Enter) still returns focus to ☰.
- tests/town.cjs wardrobe, 'red stripes for the crew dress ... all 6 sailors cleaning the docked ship', 'Match the ship's paint dresses the crew ...' and 'back to the default uniform the cleaning crew is exactly as before': old: the docked ship's cleaning crew is rebuilt on every crew click while Polly's is open. New (PERF-3): it is dressed once, when the wardrobe closes (back(), the Shipyard place, or another panel opening). Read T.crew() after G.town.back(), then reopen with G.town.open('tailor') and G.town.api.wardrobe.tab('crew'). The line-up still changes on every click.
- Walking: a held walking key or stick input keeps the world direction it started with. The camera swinging by itself (follow, or out of a cramped corner) no longer re-aims it; a drag or C still turns it, and so does changing the input by more than about 20°. town.cjs's walk checks still pass.
- Townsfolk on fixed paths stop and idle while the captain stands in their way (LOOK-2). Folk positions over time differ from before.
- walk.move slides blocked steps (rotated ±15–60° and along an axis), so walkers get round posts and along ropes. The rope-post blockers in env.walk and the fixture now have r 0 (was 0.05). env.walk.camBlockers has 3 more entries (37 → 40, one per market stall).
- Auto-walk (tap-to-walk, places bar) skips a nearby waypoint only when the straight way to the next one is clear. It can no longer stop at the plaza end of the yard bridge.
- A held Enter or Space on any town-HUD button, in the wardrobe or tavern panel, or in the Harbour or All aboard dialog is cancelled on its auto-repeats (single presses unchanged).
- #town-prompt now has an aria-label ('<name>: press Enter to go in / go aboard', or '<name>: <verb>' on touch). Its textContent is unchanged.
- town.simulate() and __game.town.simulate() results gain a boolean greet field.

### Verification

Commands (NODE_PATH=/opt/node22/lib/node_modules; scratch is /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/fix4/T):
- cd /home/user/First-project && node tests/walk.test.cjs: 'All walk checks passed (74)' on the published repo. The 3 new bridge/post checks fail on ebad6f2's walk.js and fixture (checked in scratch/oldchk).
- SCREENSHOT_DIR=<scratch>/townshots node tests/town.cjs on the published repo, which includes G's published main.js and other files: 'town.cjs: 109 passed, 5 failed'. The 5 failures are the checks listed in behaviour_changes. Draw calls: walk view spawn 216, plaza 170, yard 124, tavern 61, tower 28, garden 338; Polly's 41 (line-up 46), tavern 66.
- Reviewer and verifier probes: verify-town/v1.cjs and v2.cjs, and verify-a11y/tryon.cjs, prompt.cjs, promptname.cjs, run against my scratch copy, whose townMode.js is byte-identical to the published one; verify-robust/perf3.cjs on the same copy. Results are quoted per finding in 'fixed'.
- My probes, run against both the scratch copy and the published repo (ebad6f2 exported with git archive to <scratch>/old for comparison): bridges.cjs (sim, 48 of 48 land-end crossings at 0/0.5 back), brkeys.cjs (real keys, all 8 land ends cross at 1280x720 and 390x844, screenshots brk-*.png), corner.cjs (bridge-mouth stall fixed), stuck7.cjs (14 of 14 shipyard to tavern walks arrive, against 1 failure in 12 before the corner fix), stress.cjs (0 of 36 failed), walkers2.cjs, aw.cjs, seam.cjs, camlog.cjs, walkshots.cjs (draw calls 51–243 along the shipyard to tavern walk), townchk.cjs, dumpwalk.cjs (fixture equals the live env.walk).
- I looked at these screenshots: aw-final-spawn-tavern-d, aw-C-*-d/m, ws-pub-shipyard-tavern-d-2/5/6 and m-3/6, seam-new-west/east/north-d and west-m, brk-new-plazaS1f-d/m, tavernTowerf-d, plazaYardr-m, plazaGardenr-d. The awning no longer fills the view at the tavern door, the seam plank shows, and the bridge crossings look normal.
I did not run the full npm test.

### Open issues

- Cramped camera spots: the plazaS1 plaza end (pots stall plus TAILOR signpost) and the tavern door (balcony) still have a low, close camera. This was already so on ebad6f2; with and without the new stall box it looks the same at the bridge end.
- Plaza walk along the stall row: an awning can still fill about 15–16% of the frame for about 0.17 s at the default camera height. This was already so on ebad6f2 and is not changed by camBlockers.
- Deck-corner pockets beside a bridge mouth: in the probe, W held 1.5 u back and 5° off can stop where a deck rect's edge meets the band. Examples: the tilted tower raft's corner near (-14.97,-23.01), and the plaza edge beside the plazaYard mouth. Starts at the land end or 0.5 back all cross; a magnet toward the bridge's middle line was not added.
- With frozen townsfolk (tests that use simulate without env.update), the captain squeezes past a waiting walker through auto.pass, as before.
- Test agent: the probes in the scratch dir (townchk.cjs, corner.cjs, bridges.cjs, walkers2.cjs, aw.cjs, seam.cjs) can be turned into deterministic regression checks; each says what it checks at the top.


## G: game files

All nine findings I own are fixed (A11Y-1, A11Y-2, A11Y-5, ACT-3, PERF-1, PERF-2, POL-1, LOOK-1, LOOK-3), along with the three Stage 3 leftovers: the Victory text, the banner at 568x320 desktop, and RAIDERS.gap/sheer. I worked on copies in /home/user/First-project/.dock-harness/fix4G/root and published them to the live repo at 19:23:59 UTC. Each file was copied to a temp name and then moved into place. The live files match those copies byte for byte. I changed six files: src/main.js, index.html, style.css, src/levels.js, src/ships.js and src/boarding.js. src/act2.js needed no change. Every reviewer or verifier probe I re-ran now shows the fixed behaviour. I looked at every screenshot: the boarding sails fading in, during the brawl, easing out and after a capture; a raider boarding on L5; the boss bar at 390x844; the Victory screen after capturing the Molten Maw at 1280x720 and 390x844; and the banners for L1-L6 at 568x320 and 640x360. The full suite on the live repo passes except checks that read locked level cards through `disabled`, and town.cjs failures that come from T4's concurrent townMode changes. Run on my mirror (HEAD plus only my files), town.cjs passes 114 of 114.

### Fixed

- A11Y-1: main.js: a new shakeCamera(amount) sets state.shake only when reducedMotion() is false. The rake kick, the hull hit in damage() and the bombs/lightning within 25 u all call it. As a backstop for any other path, updateCamera now zeroes the shake when `boarding.locked || reducedMotion()`. Confirmed with rmshake.cjs (copied to fix4/G/a11y, run on the mirror). With reduced motion, holding the ship in the Maelstrom eye gives maxShake 0, 0 of 40 frames shaking, camera maxDy 0.000 (18 eye hits), and a hull hit leaves shake at 0. Without reduced motion nothing changes: 0.331, 36 of 40 frames, hull hit 0.4.
- A11Y-2: main.js window keydown: before townMode.onKey, a repeated Enter or Space on a focused button is now swallowed with preventDefault and return, whenever play is not running (state.mode !== 'playing') or a dialog is open. This is wider than the dock only, on purpose: a held key also crosses screens from the shipyard to the title. A swallowed repeat Space never arms the button, so its key-up does not click either. heldenter.cjs: from 'menu' and from 'levelDone', after one repeat All aboard? stays open with focus on aboard-title-btn / aboard-next-btn, still in dock mode. heldenter2.cjs: on Polly's and the tavern's Back to town, a repeat leaves you in the town view with focus on the place's button. The TOWN-2 probe p3c-tavern.cjs, holding Space or Enter with 3 repeats at the tavern door, buys nothing (purse 1000, armory null).
- A11Y-5: main.js renderLevelCards: a locked card is no longer `disabled`. It gets aria-disabled="true" and aria-describedby pointing to its lock pill (id lvl-N-why, aria-hidden so the reason is not read twice). The click handler checks `n > state.unlocked` and calls the new lockedCard(), so a locked level never starts. lockedCard() flashes the pill (class 'refused') and writes "Doubloon Bay is locked. Beat the Molten Maw." into a new #menu-live region (index.html). Focus stays on the same card when the cards re-render. style.css: a lock-refused keyframe swaps ink and paper, and the press-down :active effect skips locked cards. Confirmed with titleax.cjs and a new locked.cjs at 1280x720 and 390x844t. Tab order is now mute > cards 1-6 > Set sail! > Shipyard. The accessibility tree reads name '4 Doubloon Bay TRICKY Difficulty 4 of 6', description 'Beat the Molten Maw', disabled=true, focusable=true. Enter, Space, click() and a pointer press on a locked card all leave mode 'menu'. Enter on card 2 starts level 2. Screenshots locked-1280.png and flash.png.
- ACT-3: main.js: new raiseProgress(to), raiseBest(gold) and syncProgress(). Both finishLevel branches, exitVoyage, playerSunk and abandonLevel now save the larger of this tab's value, the stored value and the new one, and write only when it is higher. raiseBest returns whether the gold is a new best, which drives the New best! line. The 'storage' listener now handles PROGRESS_KEY, BEST_KEY and storage clears through syncProgress(). It raises the in-memory values without writing anything and re-renders the cards on the title. v3-twotabs.cjs: after tab A's storage events, tab B shows unlocked 5 and card 4 'Play'. B then wins L3 and the saved value stays '5'. After a reload B is still at 5.
- PERF-1: main.js buyArmory now rebuilds the docked ship only for id 'grapple'. The resync at the start rebuilds only if another tab changed the chest or ship, or the grapple tier. __game.armory.set and the storage listener rebuild only when up.grapple changed (the listener also when the chest or ship changed). perf1.cjs in the tavern: boarders, cutlass and gunner take 4-5 ms wall time and 4-6 ms thread time (before: 218-488 ms). Grapple still rebuilds (695 ms), so its coils appear.
- PERF-2: main.js openDock calls env.setPrizes(prizeShips()) right after setEnvironment(sparrow), behind the 'Rowing to…' transition. sparrow keeps the ships hidden until the town view, and the ashore call keeps ships of the same kind. perf2b.cjs with two prizes: first Go ashore takes 53, 15 and 15 ms on visits 1-3 (thread 35, 14, 16; before 210, 159, 311). With no prizes it takes 33, 22 and 15 ms. prizevis.cjs: the prizes are hidden in the shipyard view and visible at their berths (30,3) and (41,-3) in the town view.
- POL-1: ships.js bakeColours: dropped the `flatShading` key from the MeshToonMaterial constructor, which does not support it. warn.cjs: 0 console warnings after load and after the L1 start. Of 137 toon meshes, none is flat-shaded, so nothing looks different.
- LOOK-1: boarding.js fadeMat: removed `c.depthWrite = false`, so the faded sail copy keeps writing depth and hides the outline shell behind it. A comment explains why. v1.cjs (real boarding of the L4 galleon, sail-box stats). Before boarding: meanL 142.6, 20% dark. Hook phase at opacity 0.92: meanL 130.9, 31% dark (was 61 / 77%). Brawl at 0.22: 119.1 / 25%. Ease-out at 0.80 as the captured prize sails off: 134.9 / 26% (was 70 / 72%). Four seconds later: 140.7. Screenshots fix-1fadein, fix-2brawl, fix-3easeout and fix-4after show see-through cream sails with the sun emblem, never slate. p2.cjs on L5: during the raider threat your own sails stay cream.
- LOOK-3: main.js updateHud: the spectral boss bar now reads `BOARD HER! — The Phantom Galleon`, so the ellipsis cuts the name, never the instruction. v3.cjs: at 390x844 it shows 'BOARD HER! — THE PHANTOM G…' (screenshot boss-390x844.png). It is cut the same way at 360x740 and 320x568, and fits in full at 844x390 and 1280x720.
- VICTORY-TEXT (Stage 3 leftover): levels.js: the Molten Maw finaleText now reads 'The Molten Maw is beaten, and so is every pirate fleet of the Old World. But sailors whisper of the Far Seas…', which is true whether she was sunk or captured. The index.html default #won-text is neutral too. The Phantom's text ('is yours') was already right, since only a boarding takes her. I did not add a separate captured-text key: mechanics.test.cjs checks that Act II levels carry every Act I field, so a new key would break it. won.cjs (capture the Molten Maw, real countdown): the banner reads 'Victory!The Molten Maw is yours!The Old World is yours', won-text is the new line, and 'Sail on to the Far Seas' shows. Screenshots won-1280x720.png and won-390x844.png.
- BANNER-568x320 (Stage 3 leftover): style.css: new media query for short, narrow desktop windows (max-height 500px, max-width 760px, landscape, with hover or a fine pointer). The banner is centred in the free space left of the minimap (`left: calc(50% - (var(--mm) + 8px)/2)`) and its max-width is that space. banner.cjs at 568x320 desktop: L1-L6 all clear of the ring (before, L1, L4, L5 and L6 overlapped). At 640x360 L4 is now clear too. With the tutorial hint at all 10 F01 sizes, the hint and banner are clear everywhere: at 568x320 the banner bottom is 170 and the hint top 180. The controls.cjs F01 layout checks pass at 568x320 and 640x360.
- RAIDERS.gap/sheer (3B hook): main.js: removed the local RAID_GAP/RAID_SHEER; raiderTry uses RAIDERS.gap and updateEnemy uses RAIDERS.sheer. combat.js has gap 3, sheer 4, the same values, so difficulty does not change and I did not re-run 3B's bot (the brief only asks for it on a difficulty change). battle.cjs passes 154 of 154.

### Not fixed


### Behaviour changes

- tests/smoke.cjs:114-116 'only level 1 is unlocked at first' reads `locked: e.disabled`. Locked cards are now aria-disabled, not disabled, so read `e.getAttribute('aria-disabled') === 'true'`.
- tests/smoke.cjs:625 'all levels unlocked on the menu after winning' counts `!e.disabled` and now gets 6 instead of 4. Count cards without aria-disabled="true" (or without .locked).
- tests/levels.cjs:399 (`locked: b.disabled`) makes two checks fail: 'title: only level 1 is unlocked on a fresh profile' and 'title: with Doubloon Bay open its card says Play, and Enter on it sets sail there'. Read aria-disabled instead.
- tests/controls.cjs:402 'saved data (…)' counts `!b.disabled`, so 9 cases fail ('6 cards'). Count cards without aria-disabled.
- tests/controls.cjs:2162 'leave during "Level cleared!" for the main menu' counts `!b.disabled` (6, expected 2). Count cards without aria-disabled.
- tests/controls.cjs FLOW-5 'two tabs at the tavern' failed once under load 12-17 (B paid from a stale 1000 purse: 850 instead of 650). It passed in a later full controls run at load ~5. The cause is a race in the test: B waits only for A's armory record, and A's purse record can arrive 0.5-2 s later under load. HEAD has the same window: my flow5.cjs saw B's purse still at 1000 after the armory arrived on both HEAD and live. B's storage handler used to stall ~0.3 s on an unneeded ship rebuild (PERF-1), which hid the race. Suggested test fix: in B also wait for `localStorage.getItem('pirates-ahoy-purse') === '800'` before buying.
- The Phantom's boss bar now reads 'BOARD HER! — The Phantom Galleon' (was 'The Phantom Galleon — BOARD HER!'). battle.cjs only checks /BOARD HER!/ and passes.
- The Molten Maw's finaleText (levels.js) and the default #won-text (index.html) no longer say she is sunk. levels.cjs compares against G.LEVELS[2].finaleText plus /Far Seas/ and passes.
- Locked level cards 4-6 are now reachable with Tab and have a description. The levels.cjs cards and focus-obscured checks pass.
- A repeated Enter or Space on a focused button is ignored on every non-playing screen, not only in the dock. No existing check depends on the old behaviour.

### Verification

All commands ran with NODE_PATH=/opt/node22/lib/node_modules. Probes are in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/fix4/G/ (subfolders a11y, look, progress, robust, town, won), run against the mirror /home/user/First-project/.dock-harness/fix4G/root (HEAD plus my changes; my files are byte-identical to live).

Probes:
- rmshake.cjs: reduce gives maxShake 0, 0 of 40 frames, maxDy 0.000; no-preference gives 0.331, 36 of 40.
- heldenter.cjs and heldenter2.cjs: a repeat does not act (outputs in the fixed list).
- p3c-tavern.cjs: no purchase on held Space or Enter.
- titleax.cjs and locked.cjs: locked cards focusable, aria-disabled, described, never start.
- flash.cjs: the refused pill flashes ink on paper.
- v3-twotabs.cjs: saved progress stays 5.
- perf1.cjs: 4-5 ms per non-grapple buy; grapple 695 ms.
- perf2b.cjs: ashore 15-53 ms with 2 prizes.
- prizevis.cjs: prizes hidden in the shipyard view, at their berths in town.
- warn.cjs: 0 warnings.
- v1.cjs: sail meanL 130.9 (hook) and 134.9 (ease-out); was 61 and 70.
- p2.cjs (SIZES=d LV=5): own sails cream.
- v3.cjs: 'BOARD HER! — The Phantom Galleon'.
- won.cjs: Victory text after capture.
- banner.cjs: all clear at 568x320 and 640x360 desktop; with TUT=1 at 10 sizes the hint is clear.

Node suites on the mirror: combat 102, armory 35, cosmetics 70, walk 71, mechanics 121, upgrades 37, server: all pass. `node --check` passes on main.js, ships.js, boarding.js and levels.js.

Full suite on live, run one suite after another by runall.sh, 19:24-20:44 UTC at load 10-17 (logs in fix4/G/npm/):
- combat 102, armory 35, cosmetics 70, walk 71, mechanics 121, upgrades 37, server 14: all exit 0.
- smoke exit 1: 91 PASS, 3 FAIL. One was 'adaptive resolution kicks in' (scale 1), which is load-only: adapt.cjs failed identically on a HEAD copy and live under the same load.
- controls exit 1: 201 PASS, 11 FAIL.
- audio: 50 PASS.
- battle: 154 passed, 0 failed.
- levels: 66 passed, 2 failed.
- town: 109 passed, 5 failed (T4's townMode changes; see open issues).

Re-runs on live at load ~5:
- smoke (smoke2.log): exit 1, only the 2 disabled-card checks fail; 'adaptive resolution' passes (scale 0.85).
- controls (controls2.log): 202 PASS, 10 FAIL, all disabled-card checks; FLOW-5 passes.

town.cjs on the mirror (HEAD plus only my files, mirror-town.log): 114 passed, 0 failed.

Every remaining failure is in the behaviour_changes list or comes from T4's townMode changes.

### Open issues

- town.cjs on live fails 5 checks that come from T4's concurrent townMode.js changes, not from mine (on HEAD plus only my files it passes 114 of 114). T4's PERF-3 change dresses the cleaning crew only when Polly's closes, which fails 3 wardrobe crew checks. The TOWN-1 change to E, Enter and focus on ☰ fails 'at Polly's door E, Enter and Space…' and 'the ☰ button opens the Harbour menu… focus back on ☰'. The test agent should reconcile these with T4's report.
- townMode.js (T4) now accepts an optional ctx.restyleCrew(). main.js does not pass it; townMode's fallback env.setCrewStyle does the same thing. I left it alone because nothing asked for it.
- Docs agent: SPEC2 line 557 still quotes the old Molten Maw finaleText ('…is sunk…'); it should read 'The Molten Maw is beaten, and so is every pirate fleet of the Old World. But sailors whisper of the Far Seas…'.
- Docs agent: SPEC2 §13 and the README can mention that locked level cards are aria-disabled with a described reason, and that the title has a #menu-live region.
- At 568x320 and 640x360 desktop the level banner now sits a little left of centre, in the space beside the minimap. With no tutorial, the L1 and L5 banners gain a line (bottom 186). A one-time tip bubble that came up while those banners still show could touch them; L4 and L6 already reached 186 before this change. The new-ammo tip waits for the banner to go.
- Under heavy machine load (load 12+), smoke.cjs 'adaptive resolution kicks in' fails identically on HEAD and on live, because frame-time windows never fill. It is load-sensitive, not a regression.


## C: regression checks

I added 26 regression checks covering every Stage 4 finding and the three Stage 3 leftovers: 15 in tests/town.cjs (two new sections, review4 and review4-world), 5 in tests/levels.cjs (review4) and 4 in tests/battle.cjs (review4). Each one fails on ebad6f2 (exported to scratch and served through TOWN_ROOT, LEVELS_ROOT and BATTLE_ROOT) and passes on the current tree. Two of the town checks I updated (E at Polly's door, the ☰ focus) also fail on ebad6f2, as further proof for TOWN-1. TEST-1 is done: the wardrobe check now waits 450 ms past the 400 ms purchase guard before the next item click. On a fast-frame copy of the current tree it passes 13 of 13; without the wait it crashes at the bicorne Buy button (6 passed, 1 failed), which is the reviewer's failure. I updated every check listed in behaviour_changes and changed no src file. The full npm test does not pass: it stopped at controls.cjs with 2 failures. They are an intermittent flake in the existing shipyard 'slow device' check, which also fails on ebad6f2, so it is not a Stage 4 regression. That check is not in behaviour_changes, so I left it alone; details are under open issues. All the suites npm test never reached pass when run on their own.

### Fixed

- TEST-1: tests/town.cjs wardrobe: added pastBuyGuard() (450 ms of wall clock, longer than BUY_GUARD's 400 ms) before the bicorne click after the plume purchase, and before the crown click after the black-coat double-click. Proof: on a copy of the current tree that skips view.render (scratch fix4/C/fastnew, the reviewer's method), TOWN_ONLY=wardrobe gives 13 passed, 0 failed. The same test without the wait (tdir/town-noguard.cjs) crashes with 'page.focus: Timeout 30000ms exceeded' at the bicorne Buy button (6 passed, 1 failed). With normal rendering it passes 13 of 13 on both trees.
- TOWN-1: New town.cjs review4 check 'TOWN-1: ...'. A walking key with place:tavern, ☰ or 🔊 focused must move focus to town-screen. E with a places-bar button focused must go in. After a mouse click on 🔊, or on ☰ then Keep walking, Enter at the tavern door must open the tavern, the sound stays muted, the Harbour menu stays closed, and the purse is unchanged. On ebad6f2 it fails: focus stays on all three buttons, E gives view 'town', after the 🔊 click focus is 'town-mute' and Enter unmutes (muted false), and after ☰ focus is 'town-menu-btn' and Enter reopens the Harbour menu. The two updated places checks (E at Polly's door, ☰ focus) also fail there.
- TOWN-2: New check 'TOWN-2': Space, then Enter, held at the tavern door (a down plus 3 repeat downs, then up) must open the tavern with focus on armory:boarders and leave the purse and the armory record unchanged. On ebad6f2 it fails: the held Space buys Boarding party (purse 1000 to 800, armory {boarders:1}).
- TOWN-3: New review4-world check 'TOWN-3'. W is held from both land ends of every rope bridge, starting on the bridge or 0.5 before it, on the bridge line or ±5° off, with the camera squared behind and the townsfolk set aside: 48 runs at fixed 1/60 steps, all must cross. A places-bar walk from (7.9045,-12.4263) to the tavern must arrive. Now: 48 of 48 cross (slowest 2.1 s), and the corner walk reaches the tavern in 7.2 s. On ebad6f2: 45 of 48 stop (plazaS1 at 4-15%), and the corner walk stalls after 1.3 s at (7.9,-12.43).
- TOWN-4: New check 'TOWN-4': Enter, then Space, held at the gangplank after a cleared level must leave mode 'dock' with All aboard? open and focus on aboard-next-btn. On ebad6f2 it fails: {mode:'playing', level:2, aboard:false} for both keys.
- A11Y-1: New battle.cjs review4 check 'A11Y-1' (the page opened with reducedMotion 'reduce'): G.damage on the player, then 2 s held in the Maelstrom's eye with G.step, must give state.shake 0 throughout. The same run on a no-preference page must shake (control). On ebad6f2 it fails: hit 0.4 and eye 0.4 under reduce.
- A11Y-2: New check 'A11Y-2': Enter held (one repeat) on wardrobe-back-btn and on tavern-back-btn must leave view 'town' with focus on place:tailor or place:tavern, and no walk started after a simulate of 0.5 s. On ebad6f2 it fails: the panel reopens (view tailor / tavern).
- A11Y-3: New check 'A11Y-3' at 390x844 touch: Polly's Red parrot is focused and scrolled to the list's foot (scrollIntoView block 'end'), then Enter. The item must stay fully visible inside .dock-body and the trial must be pet.parrot. Now 80 of 80 px. On ebad6f2: 32 of 80 px.
- A11Y-4: New check 'A11Y-4': with focus on #town-prompt at the tavern door, the captain is moved off with T.at (no key). Focus must land on town-screen. On ebad6f2 it fails: focus is 'BODY'.
- A11Y-5: Two new levels.cjs review4 checks. (1) Locked cards 4-6 are not disabled, have aria-disabled 'true' and tabIndex 0, and are described by their lock text. The CDP AX node is focusable with description 'Beat the Molten Maw', and Tab from card 3 goes card4, card5, card6. (2) Enter, Space or click() on a locked card leaves mode 'menu' and #menu-live says 'Doubloon Bay is locked. Beat the Molten Maw.' On ebad6f2 both fail: the cards are disabled with no aria-disabled, Tab goes start-btn, menu-dock-btn, BODY, and the presses start a level (mode 'playing').
- A11Y-6: New check 'A11Y-6' reads the CDP computed accessible name of #town-prompt. It must be 'The Sea Biscuit: press Enter to go aboard' and 'The Salty Sparrow: press Enter to go in' on desktop, and 'The Sea Biscuit: All aboard' on 390x844 touch. On ebad6f2 it fails: 'The Sea Biscuit Enter', 'The Salty Sparrow Enter' and 'The Sea BiscuitAll aboard'.
- ACT-3: New levels.cjs check 'ACT-3' with two pages in one context. Tab A wins L3, then L4, which saves 5. Tab B, on the title throughout, must show unlocked 5 and cards PPPPPL. B then wins L3 and the saved value must stay '5'. On ebad6f2 it fails: B stays PPPLLL and its win saves '4'.
- PERF-1: New check 'PERF-1' in the tavern: after G.armory.buy of boarders, cutlass and gunner, G.dock.ship must be the same object. After grapple it must be a new ship with coils > 0. On ebad6f2 it fails: the ship is rebuilt on every buy.
- PERF-2: New check 'PERF-2' with feats prizes {galleon, manowar}: right after G.dock.open('menu') the env group must hold both prize ships, hidden, and after Go ashore the same objects must be there. On ebad6f2 it fails: before is [] and the ships are only built at ashore.
- PERF-3: New check 'PERF-3': env.setCrewStyle is wrapped, then 4 crew item clicks at Polly's. There must be 0 calls while the wardrobe is open, exactly 1 at back(), and all 6 cleaning sailors must wear the line-up's last shirt. On ebad6f2 it fails: 4 calls during the clicks.
- POL-1: New battle.cjs check 'POL-1': a fresh page starts L1 and L4, which bakes 6 meshes. No console warning may match /THREE|flatShading/. On ebad6f2 it fails with 3 warnings: "THREE.Material: 'flatShading' is not a property of THREE.MeshToonMaterial."
- LOOK-1: New battle.cjs check 'LOOK-1': board a cutter on L1 and step to the brawl, then run 3 real frames (the fade is drawn in boarding.render). Every see-through sail material copy must keep depthWrite true. Now 4 materials, all true. On ebad6f2: depthWrite false.
- LOOK-2: New check 'LOOK-2': the captain stands on the porter's route (1.45,-6.6) and on the stroller's route (-6.6,-5.9). For 60 s, G.town.simulate(1/30) and env.update are stepped by hand, and the closest any townsperson comes must be over 0.5 u. Now 1.01 and 0.86 u. On ebad6f2: 0.05 and 0.14 u.
- LOOK-3: New battle.cjs check 'LOOK-3' at 390x844 touch: the Phantom on L6 is made spectral. #boss-name must start with 'BOARD HER!' and the Range around it must end inside the line's visible width. Now: 'BOARD HER! — The Phantom Galleon', ending at 101 of 266. On ebad6f2: 'The Phantom Galleon — BOARD HER!', with BOARD HER! ending at 290, past the 266 edge.
- LOOK-4: New check 'LOOK-4': places-bar walks to the tavern from the spawn, Polly's and the shipyard at 1280x720, stepped at 1/30 with the townsfolk set aside so every run is identical. The fruit stall's awning (the projected and clipped top quad) must cover under 18% of the view and over 15% for at most 0.2 s, and no awning may reach 20%. Now: fruit 12% and 0 s, any awning at most 16% (identical over two runs). On ebad6f2: fruit 23%, over 15% for 0.8-0.9 s.
- LOOK-5: New check 'LOOK-5': rays down at z -14.95 for x -8, -6, -4, -3, -2 and -1.2 must hit a visible mesh at y 1.31 ± 0.05. Now 1.305-1.315 everywhere. On ebad6f2: no hit at any of the six.
- VICTORY-TEXT (Stage 3 leftover): New levels.cjs check: capture the Molten Maw on L3 (G.capture.take) and run to the Victory screen. #won-text and the page's default words must not match /sunk|bottom of the sea/, the text must name the Molten Maw and the Far Seas, and the banner must say 'Molten Maw is yours'. On ebad6f2 it fails: 'The Molten Maw is sunk and every pirate fleet of the Old World is at the bottom of the sea…', and the default text says sunk too.
- BANNER-568x320 (Stage 3 leftover): New levels.cjs check at 568x320 desktop: levels 1-6 are started and frozen (mode 'paused', so the banner stays up) and animations finished. Each banner box must clear the minimap box expanded by 7 px for its ring. Now all 6 are clear. On ebad6f2, L1, L4, L5 and L6 overlap (for example L4 banner r 545 b 186 against minimap l 464 t 148).
- SIMULATE-GREET (Stage 3 leftover): New check: teleport next to each greeter in turn and call G.town.simulate(1). The result must have greet:true and .town-bubble must have the words. Now the first greeter gives greet:true and the text 'Ahoy, Captain!'. On ebad6f2: no greet field and an empty bubble for all 12 greeters tried.

### Not fixed

- None of the Stage 4 findings is unfixed: every new check passes on the current tree and fails on ebad6f2.
- Not fixed, outside my brief: tests/controls.cjs 'shipyard (slow device): a second click that comes while the purchase is still under way buys nothing more' and '...a click after the purchase has finished buys the next tier' fail intermittently. This makes npm test exit 1. The check is not in behaviour_changes, so I didn't change it (see open issues for the cause and a one-line fix).

### Behaviour changes

- tests/town.cjs places, 'at Polly's door E, Enter and Space go in…': old, E with a places-bar button focused does nothing. New, E goes in (withButton.view 'tailor', auto null), while Enter and Space still press the focused button (auto 'tavern'). Back out with G.town.back() before the next step. The new behaviour is correct: no button handles E, and the live text says 'Press E or Enter to go in' (TOWN-1).
- tests/town.cjs places, the ☰ check: old, focus returns to ☰ after a mouse click on ☰ and Keep walking. New, focus goes to town-screen after a mouse click. I added a keyboard path (focus ☰, Enter, Esc), which still returns focus to ☰. Correct: a mouse press shouldn't leave keyboard focus where Enter at the next door would reopen the menu (TOWN-1).
- tests/town.cjs wardrobe, the red stripes, Match the ship's paint and default-uniform checks: the cleaning crew is now read after G.town.back(), then the wardrobe is reopened with G.town.open('tailor') and wardrobe.tab('crew'). The line-up is still read while Polly's is open. Correct: PERF-3 dresses the crew once, when the wardrobe closes.
- tests/town.cjs wardrobe (TEST-1): a 450 ms wait after each purchase before the next item click. No game behaviour change.
- tests/smoke.cjs:115 'only level 1 is unlocked at first' and :626 'all levels unlocked on the menu after winning': locked now means aria-disabled='true', and unlocked cards are counted as those without it. Correct per A11Y-5 and SPEC2 §13 (locked cards stay focusable).
- tests/levels.cjs:399 (cards): locked is read from aria-disabled. This fixes 'title: only level 1 is unlocked on a fresh profile' and 'with Doubloon Bay open its card says Play…'.
- tests/controls.cjs:402 'saved data (…)' and :2162 'leave during "Level cleared!" for the main menu': cards are counted by aria-disabled !== 'true'.
- tests/controls.cjs FLOW-5 'two tabs at the tavern': B now waits for both A's armory record and pirates-ahoy-purse === '800' before it buys. This removes the race G described: A saves the armory first and the chest after, and B could pay from a stale 1000.
- battle.cjs open() takes a reducedMotion option, default 'no-preference', so existing sections are unchanged. New sections: town.cjs review4 and review4-world, levels.cjs review4, battle.cjs review4. The *_ONLY lists in the suite headers name them.

### Verification

All runs used NODE_PATH=/opt/node22/lib/node_modules. Logs are in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/fix4/C/logs/.

The old tree: git -C /home/user/First-project archive ebad6f2 | tar -x -C <scratch>/fix4/C/old. The current test files were served against it with C/runold.sh.

New checks on ebad6f2:
- town.cjs (TOWN_ROOT=old TOWN_ONLY=places,wardrobe,review4,review4-world): 22 passed, 17 failed. The 17 are all 15 new checks plus the 2 updated TOWN-1 checks (E at Polly's door, ☰ focus). Wardrobe passes 13 of 13 there.
- levels.cjs (LEVELS_ROOT=old LEVELS_ONLY=review4): all 5 new checks FAIL; only 'no page errors' passes.
- battle.cjs (BATTLE_ROOT=old BATTLE_ONLY=review4): all 4 new checks FAIL (1 passed, 4 failed).
- After my last LOOK-4 and TOWN-3 message edit I re-ran review4-world on old: 1 passed, 7 failed. TOWN-3 shows 45 of 48 stopped, LOOK-4 fruit 23%.

New checks on the current tree:
- town review4 + review4-world: 16 passed, 0 failed.
- levels review4: 6 of 6.
- battle review4: 5 of 5.
- review4-world after the LOOK-4 edit, twice: 8 passed, 0 failed both times, with identical LOOK-4 numbers.
- Updated places + wardrobe sections: 24 passed, 0 failed.

TEST-1 on fastnew (current tree with render skipped): updated test 13 passed, 0 failed; no-wait variant 6 passed, 1 failed (bicorne page.focus timeout).

Full `cd /home/user/First-project && NODE_PATH=/opt/node22/lib/node_modules npm test`, 21:39:58-22:01:29 UTC, exit 1:
- combat: 'All combat checks passed (102)'
- armory: 35
- cosmetics: 70
- walk: 74
- mechanics: 121
- upgrades: 37
- server: 14 PASS ('All server checks passed')
- smoke: 94 PASS, 0 FAIL ('All checks passed'; adaptive resolution passed at scale 0.85)
- controls: 210 PASS, 2 FAIL ('2 check(s) failed'), both shipyard (slow device). npm stopped here, since the suites are chained with &&.

The suites after it, one after another (C/runrest.sh, 22:02-22:55 UTC, load 2-9):
- controls: 210 PASS, 2 FAIL, the same two.
- audio: 50 PASS ('all audio checks passed').
- battle: 'battle.cjs: 158 passed, 0 failed' (154 + 4 new).
- levels: 'levels.cjs: 73 passed, 0 failed' (68 + 5 new).
- town: 'town.cjs: 129 passed, 0 failed' (114 + 15 new).

Final town.cjs after the last edit: 'town.cjs: 129 passed, 0 failed'. No src, index.html, css or docs file changed during my runs (checked with find -newer).

### Open issues

- npm test exits 1 because of an intermittent flake in the existing controls.cjs check 'shipyard (slow device)' (tests/controls.cjs:1056-1098). It is not a Stage 4 regression. Cause, caught with a logging runner (fix4/C/tdir/slowblock-log.cjs): page.locator('.up-row[data-id="crew"] .buy-btn').boundingBox() returns {y:-24.3,height:50} when the shipyard list has been scrolled (Playwright's dblclick on Hull scrolls it to the top). Both CDP presses at y 0.69 then land on #game, nothing is bought (crew 0), and the next check also fails (crew 1 instead of 2). The verbatim block fails on ebad6f2 too: 3 of 14 runs there against 7 of 14 on the current tree, which isn't significant. It failed in both of my full controls runs, passed in G's two and in 4 instrumented runs. Suggested fix, not applied because it isn't in behaviour_changes: add `await page.locator('.up-row[data-id="crew"] .buy-btn').scrollIntoViewIfNeeded();` before the boundingBox() call at tests/controls.cjs:1082.
- LOOK-4 is only partly met by design: on the walks from Polly's or the shipyard to the tavern, the pots stall's awning along the plaza still reaches 16% of the view for about 0.07-0.4 s, depending on where the townsfolk stand. T lists this as an open issue that ebad6f2 shares. The new check bounds every awning under 20% and holds the fruit stall to under 18% and at most 0.2 s over 15%, with the townsfolk set aside.
- My TOWN-3 check covers starts on the bridge or 0.5 before it, as T's fix claims. Starts 1.5 back can still stop in deck-corner pockets (T's open issue), so they aren't asserted.
- tests/walk.test.cjs and tests/fixtures/sparrow-walk.json are T's (74 checks, passing); I didn't touch them.


## W: README and SPEC2

The three documents are updated to match the game as it is now: the top-level README, SPEC2.md and the build plan's README (Stage 4 marked done). I checked them against the code; I edited no code and no tests. README.md now covers the six levels in two voyages and how Voyage II opens: beating the Molten Maw opens it, and a save from before the update replays the Molten Maw once. It also covers the battle changes (range, rakes, crits and their effects, ammo with R and 1–3, crew and surrender, boarding with G or the Board button, raiders with cut, counter-board and the 25% plunder rule, a capture-gold table for every ship) and the pause menu's Leave this battle. The town section has walking, places, Polly's catalogue table generated from cosmetics.js ITEMS, the tavern table from armory.js ARMORY, the rumour board, the captain's log and All aboard. There are battle, town and shipyard controls tables, a Saves section listing all 10 localStorage records with what happens when storage is blocked or full and across two tabs, an updated Code list, and all 13 test suites in package.json order with what each covers and how to run one alone or by section. SPEC2.md gets an 'As built' note at the top, **Built:** notes in the sections that changed, and a new §17 that lists every decision and deviation with its finding id, plus a short list of known issues that were accepted.

### Fixed

- W-README: README.md rewritten in its existing plain style. Every number was checked against the code: a node script (scratchpad next/W/check.mjs) compared the capture/sink gold table with combat.captureGold and SHIP_TYPES, and the AMMO, EFFECTS, CRIT, RAIDERS, BOARD and CREW values: 0 mismatches. The wardrobe tables were generated from cosmetics.js ITEMS by gen.mjs and match row for row. The tavern table matches armory.js ARMORY: same values and prices, but the stat-text layout is mine, not armoryStatText's. Keys come from main.js's window keydown and townMode.onKey (MOVE_KEYS, E/Enter/Space, C, P/Esc, M). Storage behaviour comes from loadInt, loadRecord, saveChest, buyArmory, wardrobeBuy/Wear and the storage listener, and audio.js has MUTE_KEY. The test descriptions come from each suite's header, the section() names and the *_ONLY / *_ROOT / WALK_SRC env switches.
- SPEC2-6.4-6.6: Tuned Act II waves recorded from act2.js: L4 [[galleon,cutter,cutter],[galleon,corsair]]; L5 [[raider,raider,manowar],[raider,raider,privateer]] plus mechanicTouch; L6 [[corsair,corsair,manowar],[phantom,raider]] with maxAttackers 3. Each has the reason and the bot results. The §6.3 onSpawn relocation and the §6.1 mechanicTouch field are added.
- ACT-2: §6.8 now states the decision: difficulty order is promised within each act. Act I is measured on the stock ship and Act II on the mid-game ship, and the first level of an act may be easier than the previous finale. A table gives the reviewer's and verifier's bot damage medians, and the note says why retuning was rejected.
- DRAW-1: §12: the level-start budget is for the stock ship. A fully upgraded ship reads about 324 (stock 299; 317 and 341–342 before the update). Added a table of Stage 4 draw-call measurements for level starts, boardings, Act II play, the town's 6 spots, Polly's and the tavern.
- TOWN-1: Key wording updated in §5.1 (E always goes in; Enter and Space only when no button has focus; walking moves focus to #town-screen), §7.6 (prompt) and §11.3 (town tests, including ☰ focus after a mouse click).
- 3D: §7.3 records walk.camBlockers: 40 entries, padded 0.3, tall-blocker rule, LOOK-4 stall boxes. Also the spawn camera beside the captain, the cramped-camera tilt and swing (rates checked in town.js), and the 60° portrait walk lens. §7.4 gets the camBlockers format and live walk-data counts; §7.6 the prompt at the top on short screens; §7.5 env.cheer.
- SPEC2-other: Other deviations named in the T and G reports, recorded in place and in §17. T's: TOWN-2/TOWN-4 held-key guards, TOWN-3 walk.move slide plus post r 0 plus held-direction hold plus auto-walk corner rule, LOOK-2 env.setCaptain and waiting walkers, LOOK-5 seam planks, A11Y-3/4/6, PERF-3, simulate greet. G's: A11Y-1, A11Y-2, A11Y-5 with #menu-live (Appendix A too), ACT-3 in §8, PERF-1/PERF-2, LOOK-1, LOOK-3 boss bar text, POL-1, the Molten Maw finaleText and default #won-text, the banner at 568x320, and BOARD.homeLossCap / RAIDERS.gap / RAIDERS.sheer / WORDS in §3.8. Also the extended town.js / walk.js / sparrow / townMode ctx APIs in §9.1, the 13-suite npm test chain and the Stage 4 test-facing behaviour changes in §11.4, Stage 4 as it actually ran in §10, nothing cut (§15), and the open questions built with their defaults (§16).
- W-docs-README: docs/boarders-away/README.md: Stage 4 marked done with a one-paragraph summary: 24 confirmed findings, 20 fixed in code, ACT-2 and DRAW-1 made decisions, PERF-4 accepted, TEST-1 handed to the test agent. The SPEC2 row now points to the Built notes and §17.

### Not fixed


### Behaviour changes


### Verification

- `node /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/W/gen.mjs` loads src/cosmetics.js and src/armory.js. It printed the wardrobe and tavern tables, paid total 1200 and armory total 4600.
- A shell loop compared the README's catalogue rows with gen.mjs output: all 12 wardrobe rows matched exactly. The 4 tavern rows differ only in layout (my "12 → 15 → 18 → 22 hands" against armoryStatText's "12 hands → 15 hands → …"); I checked their values and prices against ARMORY by hand.
- `node /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/W/check.mjs` compared the README capture/sink table with combat.captureGold and SHIP_TYPES: 10 rows ok, bad 0. It also printed the AMMO, EFFECTS, CRIT, RAIDERS, BOARD, CREW and CAPTURE values, which I compared with the README text.
- `node -e` over tests/fixtures/sparrow-walk.json: areas 10, links 4, blockers 108, camBlockers 40, the 4 places, spawn {0.6,-4.25,3.142}.
- I grepped every key, label and hint string I quote in main.js, townMode.js, town.js, walk.js, mechanics.js, index.html and audio.js.
- I scanned added lines for accidental Markdown list or heading markers and fixed one: a line starting with '+ 0.015' in SPEC2 §7.4.
- `git status` shows I changed only the 3 doc files. The other modified files belong to the T, G and test agents.
- I ran no test suites; the work is documentation only.

### Open issues

- The test agent (C4) is still updating the tests while I write. The README and SPEC2 §11.4 describe what the suites cover and which existing checks must follow the Stage 4 behaviour (aria-disabled cards, E at doors, PERF-3 crew timing, TEST-1 wait). They make no claim about pass counts. If C4 adds new sections or *_ONLY names, the README test list needs one more pass.
- The README's full-run time (about 80 minutes, smoke and controls the longest) is worked out from the modification times of G's per-suite logs. Those logs came from a run on a heavily loaded machine (load 10–17).
- SPEC2 §12 quotes draw-call numbers from several probes (reviewer, verifier, 3B, 3D, T). The shipyard view is given as a 297–341 range across those probes, since they measured under different conditions.

