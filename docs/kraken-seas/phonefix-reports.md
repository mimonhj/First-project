# Phone battle fix reports (data)

## First pass

All four phone fixes are in the repo; nothing is committed. Every browser suite I ran passes, and the new checks fail on the old code. The ammo rules themselves were fine; the problem was that a phone player couldn't see them working.

A. Camera (src/main.js, framing code next to updateCamera). When a ship is the target of a broadside (the one either side would aim at, a volley in flight, or the ship you just hit) and the normal chase view would leave her hull, tag or pops off screen or under the HUD, the camera eases to a view that shows her and your ship together. On a tall screen it also turns toward her side and tilts down a little more. It pans and pulls back only as far as needed, steering still turns it with your ship, and it eases back once nobody is in reach.
- Smoothness: the ease is an S-curve of about 1 s that starts and ends at rest, and turning is capped at 1.6 rad/s. With reduced motion it turns less, pulls back more and takes 1.4 s.
- It doesn't chase a sinking ship down, and it gives up while land would sit between it and your ship (that was squeezing the camera into your own rigging).
- It only steps in when the chase view, once settled, would miss her, so 1280x720 and 844x390 keep their chase view.
- Pops now keep off the framed ship's tag.

B. Fire while loading. Fire taps and keys go through a new fireInput. If that side is loaded within 0.6 s, one shot is queued and fires the moment it is loaded; the button and the reload bar show a white ring meanwhile. The queued shot is dropped if the ammo changes again, on pause or leaving the level, during a boarding, or if that side still has no target 0.3 s after loading.
- A longer wait turns the Fire button ink with "Loading…" across it and shows a "Loading…" pill over that side's reload bar, with a soft low click. Screen readers hear it once per reload.
- Space gives one combined cue, and only when neither side fired. A held key's repeats stay silent.
- The window.__game.playerFire test hook (used by the test bots) is unchanged.

C. Effects on the target (tags.js, pops.js, fx.css, main.js).
- Chain: a chain-shot badge on the tag with a sky-blue timer bar that shrinks as the slow wears off, a "SLOWED!" pop on the first slowing hit ("SAILS SHREDDED!" on later hits), and a short, choppy wake while slowed.
- Grape: the pips of the sailors just lost flash red and white and stand taller for 1.4 s (steady red with reduced motion); the "−N CREW" pop stays.
- Round: its hull-damage pop is bigger (36 px vs 28 px on the phone).
- Tags are drawn bigger on small screens (at least 92 px wide, up to 1.7x).

D. What each ammo is for. Changing ammo shows the ammo's icon and "Round shot: smashes her hull", "Chain shot: slows her down" or "Grape shot: knocks out her crew" in the hint bubble. The first-time tips and banners say it too ("New: chain shot! It slows ships down. Tap Ammo"). The Ammo pill keeps its icon, and its aria-label and the Ammo cell's tooltip include the purpose.

Tests: a new `phone` section in tests/battle.cjs (14 checks), a new phoneFraming block in tests/controls.cjs (15 checks; `CONTROLS_ONLY=phone` runs only it), and a few new test hooks on window.__game (tagRect, framing, fireQueue).

### Verification

I developed in /home/user/First-project/.dock-harness/phonefix and published with cp to a temp name + mv, after checking with git that none of the 8 target files had changed in the repo since the copy (the only new commit was docs/kraken-seas). Final runs on the published repo, NODE_PATH=/opt/node22/lib/node_modules:
- node tests/battle.cjs: 172 passed, 0 failed. An earlier final run, before the T.settle fix, was 171 passed, 1 failed (the flaky crit-pop check).
- node tests/controls.cjs: 227 passed, 0 failed (212 existing + 15 new).
- node tests/smoke.cjs: 94 passed, 0 failed.
- node tests/levels.cjs: 73 passed, 0 failed.
- node tests/audio.cjs: 50 passed, 0 failed.
- node tests/town.cjs: 130 passed, 0 failed.
- Node suites: combat 102, armory 35, cosmetics 70, walk 74, mechanics 121, upgrades 37, server.test 14 checks, all passed.
- I did not run `npm test` as one chained command; every suite in it was run separately as above.

New checks on the old code (dev copy's tests with BATTLE_ROOT / CONTROLS_ROOT pointing at the unmodified repo):
- battle `phone`: 13 failed, 2 passed. The 2 are "no page errors" and "the camera goes back to the chase view", which passes trivially because the old camera never moves.
- controls phoneFraming: 15 failed. Old 390x844 hull box was x 354-561 on a 390-wide screen, tag not drawn on screen.

Fixed-code numbers:
- 390x844: target hull x 192-333, tag 214-358 x 206-255, 1.52 s after the shot.
- 360x640, 320x480, 568x320, 844x390 and 390x844 port side: all clear of the HUD at about 1.5 s; desktop framing weight stays 0.
- Natural play (play-probe at 390x844, level 2, AI ships, autopilot, real taps): peak camera speed relative to the ship about 31 u/s, mid-ramp.

Screenshots I looked at: the coordinator's 12 ammo/*.png; my before/after framing probes at 6 sizes; reduced-motion 390x844 and 320x480; the queue/Loading shot plus a zoom on the chain badge; 5 natural-play frames ×2 runs; the tests/screenshots/phone-frame-*.png set and phone-framed.png.

## Skeptic

{
 "findings": [
  {
   "id": "A1",
   "severity": "blocker",
   "title": "Desktop and landscape phones: in real play the framing camera turns on most of the time and loses both ships for seconds",
   "scenario": "1280x720 with the keyboard, level 4, and 844x390 touch, level 2. AI ships, hard turns, firing when a pirate is abeam. The fixer said these sizes keep their chase view (framing weight 0). In real play the weight is above 0 in 319 of 419 frames on desktop and 402 of 422 frames on the landscape phone. While you turn, the solved view climbs to 45-74 u high and 50-100 u away. For seconds at a time it shows less than half of your ship and less than half of the framed ship. The old build always keeps your ship in view.",
   "evidence": "Probe outputs. desk-L4.json (natural play, 1280x720, level 4): your ship under 50% on screen for 6.46 s of 40 s, with 4.86-7.08 s fully off screen. Neither ship half visible for 3.45 s. At t=5.16 the camera is 72.5 u away horizontally and 58 u high. dturn-new.json vs dturn-old.json (the same scripted galleon turn at 1280x720): new build, your ship under 50% for 4.74 s, including 9.15-12.07 s fully off; neither ship visible for 3.54 s; top camera speed 440 u/s. Old build: your ship always on screen; top camera speed 20.7 u/s. land-L2.json vs oldland-L2.json (844x390): your ship under 50% for 6.05 s (7 spans, minimum 0%) vs 1.5 s in the old build. The camera jumps from 51.6 to 101.5 u away in one 0.1 s frame at t=31.58 (602 u/s). swd.json: even with both ships held still, port-side privateers at 1280x720 (lat -24 to -8) get framing weight 1, so the claim that desktop stays at 0 is wrong. Screenshots: frames frozen at the bad moment, shots/frz-desk3.png (1280x720: only your mast tip shows above the HUD bar, framed galleon not on screen) and shots/frz-land.png (844x390: your ship 0% on screen, camera y 47.8, no framed ship readable). Also shots/desk-L4-1-1.4.png and shots/land-L2-0-0.6.png. All under /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/ammo/verify/.",
   "fix": "Likely causes in src/main.js. solveFraming pans without limit when not every constraint can be met (shiftAxis then returns the middle of an empty span, and that offset is applied over 4 rounds). framingPoints silently drops points behind the scratch camera (pt() returns), so a solution can ignore her or your ship. Your hull may sit up to NDC -1.6, i.e. off the bottom. Suggested fix: clamp the pan and camera height (for example pan up to about 0.5 x the chase distance, height up to about 1.5 x CHASE_UP). Require at least 80% of your own hull on screen and above the bottom HUD. Count a point behind the camera as a miss, not a skip. If the solution fails these checks, fall back to the chase view. Consider turning framing on only when tall > 0 (narrow portrait), or only after the need has lasted about 0.5 s. Add a natural-play test (AI ships, hard turns) at 1280x720 and 844x390 that checks your own ship stays at least 80% on screen."
  },
  {
   "id": "A2",
   "severity": "major",
   "title": "Portrait 390x844: while you turn hard the framed target still slides off screen, and your own ship drifts to the edges with the zoom pumping in and out",
   "scenario": "The player's own device: 390x844 touch, levels 2, 4 and 6. Fire at a pirate abeam, then keep steering hard, as players do to bring guns to bear. When the ship is not turning, the framing works. When it turns faster than 0.3 rad/s, the target's hull or tag is cut off in the 1-2 s after the shot, your own ship is pushed partly off the left or right edge, and the camera keeps re-zooming.",
   "evidence": "cover.cjs over 5 portrait runs (nat-L2, nat2-L2, nat2-L4, nat3-L6, turn-new). Shots while turning: 1 of 7 had hull and tag wholly on screen 1.0-2.0 s after the shot. Shots while not turning: 16 of 24. Hull only: new build 21 of 31 vs old build 0 of 32, so this is still a big improvement. nat3-L6.json, shot at 7.37 s: framing weight 1 for about 1 s, yet her hull is at x -100..70 and her tag at -103..11. shots/nat3-L6-0-0.6.png shows CRIT!/48 at the left edge with no ship. Her side flipped from port to starboard while framing.side stayed the same. nat2-L4.json 7.0-7.7 s: your ship only 29-65% on screen (x 348-494). turn-new.json vs turn-old.json: your hull's height on screen ranges 52-250 px vs 127-143 px. Camera yaw relative to the ship: 95th percentile 1.59 vs 0.41 rad/s. Top camera speed 89 vs 20.7 u/s. Screenshots: shots/sheet-turn-new.png vs shots/sheet-turn-old.png, shots/nat2-L4-1-1.4.png (your ship half off the right edge, galleon tag cut on the left). All under /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/ammo/verify/.",
   "fix": "Re-read framing.side every frame, with a little hysteresis; today it only changes when the focus changes or framing is off. Apply the A1 clamps, including keeping your own hull on screen. While the ship is turning fast, hold the zoom and pan, ease only the yaw offset, and limit how fast the distance can change. Add a portrait natural-play check: real taps, held turns, and the target's hull and tag on screen 1-2 s after each shot."
  },
  {
   "id": "A3",
   "severity": "major",
   "title": "Reduced motion: the framing camera still swoops and orbits instead of cutting (SPEC2 \u00a713)",
   "scenario": "390x844 with prefers-reduced-motion on. One pirate 15 u off each beam. Fire starboard, then port, then starboard. Each switch still sweeps the camera smoothly around your ship. SPEC2 \u00a713 says that under reduced motion the camera cuts instead of swooping or easing.",
   "evidence": "Output of swing.cjs run with reduced motion (tag swing-rm). Each side switch eases the camera's yaw relative to the ship from +0.60 to -0.28 rad over about 1.5 s, at up to 1.5 rad/s, 4.56 rad of sweep in 24 s. Without reduced motion (swing-new) it is 1.6 rad per switch at up to 2 rad/s. The fixer listed this as an open decision.",
   "fix": "Under reduced motion, snap the framing weight and the solution (no S-curve, no 1.6 rad/s turn), and keep the chase yaw by pulling back only, or cut to the framed view once per target. Otherwise change SPEC2 \u00a713 deliberately. Add a reduced-motion check that the camera never moves continuously faster than the ship."
  },
  {
   "id": "A4",
   "severity": "minor",
   "title": "Near islands the camera still dives into your own rigging for about half a second",
   "scenario": "390x844, level 2 (Bali islands), with a target framed while sailing past an island. The framing view's longer boom crosses land and the camera snaps in close behind your sails. The fixer reported this as fixed ('gives up while land would sit between it and your ship').",
   "evidence": "nat2-L2.json at t=29.35: the camera's horizontal distance to your ship drops from 14.5 to 5.0 u in one 0.1 s frame. Your hull goes from 175 to 512 px tall (box x -147..383, y 537..1048), then eases out over about 0.8 s. shots/nat2-L2-3-1.4.png shows the mast, sail and pennant filling the lower left. shots/nat2-L2-2-0.6.png: your ship half hidden behind palm fronds at the left edge. land-L2.json at t=16.0: 26 to 5 u. All under /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/ammo/verify/.",
   "fix": "The land check `boomClear(camPos2) < 0.97` only sets `landed` for later frames, while collideCamera shortens the boom at once (`target < boom ? target`). Check boomClear on the candidate framing position before blending it in, and shorten its distance or drop it if blocked. Ease the boom in rather than snapping when the block comes from the framing view."
  },
  {
   "id": "A5",
   "severity": "minor",
   "title": "Alternating port and starboard fire swings the view about 90\u00b0 every time, even when both ships are already in view",
   "scenario": "390x844, one pirate 15 u off each beam. Fire starboard, port, starboard, port. Every switch orbits the camera about 1.6 rad around your ship, although both pirates are visible in either framing.",
   "evidence": "Output of swing.cjs (tag swing-new). Camera yaw relative to the ship swings between +0.96 and -0.64 rad on each switch, at up to 2 rad/s, 8.1 rad of swinging in 19 s. shots/sheet-swing.png (under /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/ammo/verify/) shows both enemies on screen in both poses.",
   "fix": "When the other side's target already fits in the current framing, keep the current yaw. Or frame both targets with no yaw toward a side. Add hysteresis before switching the focus side."
  },
  {
   "id": "B1",
   "severity": "minor",
   "title": "After one 'Loading\u2026' cue, that side's reload bar never shows the queued white ring again",
   "scenario": "390x844. Tap Fire \u25b6 while it has 2 s of reload left ('Loading\u2026' plays). Later, tap Fire \u25b6 with 0.5 s left: the shot is queued and the button gets its ring, but the starboard reload bar does not. The `loading` class stays on .gun, and its loading-bar animation (fill-mode both, last keyframe box-shadow: none) overrides `.gun.queued .bar` for the rest of the session.",
   "evidence": "ring.cjs output. Before any Loading cue: barShadow is 'rgb(255,255,255) 0 0 0 3px, rgb(29,19,48) 0 0 0 5px'. After one: barShadow is 'rgba(0,0,0,0) 0 0 0 0 ...' while fireQueue.star is true and the gun class is 'gun star target loading queued'. Screenshot: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/ammo/verify/shots/ring-cmp.png (left with the ring, right without).",
   "fix": "Remove the `loading` class on animationend in gunsLoading/retrigger, or don't let loading-bar keep box-shadow: none (use fill-mode backwards or none). Or set `.gun.queued .bar { animation: none; }` with the ring."
  },
  {
   "id": "B2",
   "severity": "minor",
   "title": "A queued Fire tap silently disappears when no ship is in that side's aim",
   "scenario": "390x844. One pirate 22 u ahead and 7 u to starboard, outside aimTarget's arc. A Fire \u25b6 tap once the guns are loaded fires the broadside, as before. A tap 0.5 s before loading shows the white ring for about 0.8 s, then serviceFireQueue drops it with nothing fired and no cue. A child tapping a little early sees nothing happen, which is the original complaint in a smaller window.",
   "evidence": "q-queue.json, 'noArc' case. The loaded tap gives a volley at 24.106. The early tap is queued (ring true, reload 0.3) at 24.206. 1.5 s later the queue is empty and there is still only the 24.106 volley. Screenshot: /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/ammo/verify/shots/q-noarc-queued.png.",
   "fix": "When the guns load, fire the queued shot like an immediate tap would (fire(player, side, null) along the beam), or show a 'No target' cue instead of dropping it silently."
  },
  {
   "id": "A6",
   "severity": "polish",
   "title": "Starting a boarding from the framed view swings the camera further and faster than before",
   "scenario": "390x844. Fire at a privateer 11 u off the beam (framed), then tap Board. The boarding camera's orbit now starts from the yawed framing pose.",
   "evidence": "board-new.json vs board-old.json, both ships held still. In the first 1.2 s of the boarding the camera yaw sweeps 2.18 rad at up to 6.6 rad/s (top camera speed 116.6 u/s). The old build sweeps 1.38 rad at up to 4.1 rad/s (93 u/s). Screenshot: shots/sheet-board3.png under /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/ammo/verify/.",
   "fix": "Give boarding.camera() the chase pose, without framing, as its 'from' pose, or ease the framing weight to 0 before the boarding orbit starts."
  },
  {
   "id": "B3",
   "severity": "polish",
   "title": "'Loading\u2026' on the Fire button is clipped on small buttons",
   "scenario": "The 12 px 'Loading\u2026' label inside the round Fire button. 320x480 (52 px button) and 844x390 (56 px) show 'OADING..', with the L and the dots cut by the round rim. At 360x640 (62 px) the L touches the rim. At 390x844 (66 px) it fits.",
   "evidence": "loadcue.cjs with the animations frozen at 0.35 s. Screenshots under /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/ammo/verify/shots/: z-load-320x480.png, z-load-844x390.png, z-load-360x640.png, z-load-390x844.png.",
   "fix": "Below about 64 px use a smaller font (10 px) or tighter letter-spacing, put 'Load-ing\u2026' on two lines, or show a short word or hourglass icon. The reload-bar pill already says 'Loading\u2026'."
  },
  {
   "id": "C1",
   "severity": "polish",
   "title": "In the grape pip flash, the 'off' blink is white and looks like a sailor still aboard",
   "scenario": "390x844, grape volley, crew 12 to 9. The lost pips blink between red (#ff3b2f) and white (#ffffff). The white phase is almost the same as the cream of pips aboard (#fff4d6). About half the time the lost pips read as 'still aboard' (only slightly taller).",
   "evidence": "shots/z-ammo-grape-0.7.png under /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/ammo/verify/: the two lost pips at the right show as white. The flash itself works: flash.cjs reports flash=3 for about 1.35 s, in both normal and reduced motion.",
   "fix": "Blink between red and the dark 'lost' pip colour (or ink) instead of white, so both phases read as 'gone'."
  }
 ],
 "sound": "All work was on copies in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/ammo/verify/ (game = fixed build, old = git HEAD). The probes there are lib.cjs, natural.cjs, turn.cjs, sweep.cjs, queue.cjs, loadcue.cjs, ammo.cjs, swing.cjs, board.cjs, freeze.cjs, calls.cjs, hint.cjs, tip.cjs, ring.cjs and flash.cjs. They use real taps on the on-screen buttons and keyboard steering, because CDP touch can't hold one finger down while another taps. No page errors in any run.\n\nWhat works:\n- **Framing, ships held still:** at 390x844 and 320x480, a privateer at 11 spots is framed 1.6 s after a chain volley fired with a real tap. The spots cover both sides, 8-28 u away, and ahead or behind the beam. Her hull and tag (chain badge included) are wholly on screen and clear of the HUD every time (sw390.json, sw320.json, sheet-sw390.png, sheet-sw320.png). The coordinator's round/chain/grape scenario is fixed: she is framed with her tag at 0.7 and 1.3 s (sheet-ammo.png).\n- **Natural portrait play:** hull fully on screen 1-2 s after the shot for 21 of 31 shots, vs 0 of 32 in the old build.\n- **Ammo effects:** chain gives 'SLOWED!' and a badge with a timer bar (0.86, 0.73, 0.60 at 0.7, 1.3, 2.6 s). Grape gives '\u22122 CREW'/'\u22123 CREW' and 3 pips flashing for about 1.35 s, steady under reduced motion. Round's damage pop is bigger.\n- **Fire queue (all real taps):** a queued shot is cleared by the pause button and nothing fires after resuming. It is dropped when the target sinks, when you grapple, and when the target strikes and is captured. Queued during a raider threat, it fires during the threat (allowed) and cuts the ropes. A double tap gives one volley plus 'Loading\u2026' and 'Starboard guns still loading.' Ammo then Fire straight away gives one chain volley 0.3 s later. Holding keys on desktop gave 18 volleys in 40 s with no doubles.\n- **Loading pill:** the pill over the reload bar is readable at 390x844, 360x640, 320x480, 844x390 and 1280x720.\n- **Ammo hints:** 'Round shot: smashes her hull', 'Chain shot: slows her down' and 'Grape shot: knocks out her crew' fit the bubble at 320x480, 360x640, 568x320 and 844x390. The aria-labels include what each ammo does. The first-time tip and banner read 'New: chain shot! It slows ships down. Tap Ammo'.\n- **Draw calls:** 148 with no ship slowed, 150 with 4 slowed ships held still (old build 156-169 in the same scene).\n- **Boarding and raider set-pieces:** they still run and the framing gives way to the boarding camera."
}

## Second pass

I checked all nine of the skeptic's findings again, and all were real. They are fixed and published to /home/user/First-project (copied to temp names, then moved into place), and the full `npm test` passes. Nothing is committed.

For the user's question: round shot is the hull smasher (×1 hull damage). Chain shot does ×0.4 damage but slows her to 55 % speed and 70 % turning for 6 s a hit, up to 10 s. Grape does ×0.3 damage and kills a sailor per ball (2 on a rake). Those rules already worked; what was broken was being able to see them on a portrait phone.

What changed in this pass (src/main.js, src/tags.js, style.css, the two test files; pops.js, fx.css and index.html stay as the first pass left them):

**Camera**
- **A1:** framing now only happens on screens taller than wide (aspect < 1). Desktop and phones on their side keep the old chase view in every frame.
- **New solver:** the first pass's iterative pan/zoom solver is replaced by an exact one. It handles points behind the camera and has hard limits on pan and distance. Your own hull must stay wholly on screen above the controls. It falls back to the chase view when nothing fits, and frames only ships within 30 u, not round toward the stern.
- **A2 (hard turns):** how far the view turns toward her depends on her bearing (0.62 of it, at most 0.9 rad). Her side is re-read every frame. The look point is kept in world axes, so your turning no longer drags it. Zoom-out and zoom-in speeds are capped. The chase→framing blend is an orbit, not a straight line, which keeps your ship in view.
- **A3:** under reduced motion it now cuts in and out, holds still relative to your ship, and re-cuts only when she slips out, at least 1.5 s apart (SPEC2 §13).
- **A4:** land is checked with a 3 u margin, both now and 0.8 s ahead. If the view would cross an island, it uses an unturned view, then the reversed one, or gives up for 1.2 s.
- **A5:** with targets on both beams, the view keeps its turn unless the other side's view is at least 20 % closer.
- **A6:** close in (10–18 u), the view turns less toward her, so the hand-over into a boarding swings about as much as from the chase view.

**Fire queue and effects**
- **B1:** the "Loading…" class is removed after 0.9 s, and the queued ring wins over the cue.
- **B2:** a queued shot fires the moment the guns are loaded, exactly as a tap would, along the beam if nobody is in aim.
- **B3:** "Loading…" uses 11 / 10.5 / 10 px on the 62 / 56 / 52 px Fire buttons, so it fits inside the circle.
- **C1:** lost pips now blink red and the dark "lost" colour, never white.

Measured on the final build:
- **Natural portrait play (390x844):** level 2 had 13 of 16 shots with the target fully on screen 1–2 s after the shot (149/159 framed frames). Level 6 had 8 of 10 (76/90). Your own ship never dropped below 100 % on screen while framed.
- **Hard circling (the skeptic's turn probe):** 11 of 11 framed frames OK. Top camera speed went from 108 to 73 u/s.
- **Boarding hand-over:** 1.98 rad at up to 4.43 rad/s. The pre-first-pass chase view is 2.00 rad at 4.09 rad/s; the first pass was 2.99 at 6.64.

### Changed checks

- tests/battle.cjs 'phone' section: 'a queued shot never goes off after the ammo changes again, a pause, or with nobody on that side' -> 'a queued shot never goes off after the ammo changes again or a pause' (the 'nobody' case removed), plus a new check that with nobody in that side's aim (nobody about, or a pirate 22 ahead / 7 starboard outside the arc) the queued shot fires once along the beam. Why: finding B2. A tap queued a moment early should do what a tap does once loaded; dropping it silently reproduced the original 'Fire does nothing' complaint.
- tests/battle.cjs 'phone' desktop check: `desk.focus && desk.w === 0 && !desk.need` -> `!desk.focus && desk.w === 0 && !desk.need`. Why: finding A1. Wide screens no longer track a framing target at all, rather than tracking one and not needing to frame her.
- tests/controls.cjs phoneFraming at 568x320 and 844x390 touch, and 1280x720: 'wholly on screen with her tag, clear of the HUD' (landscape relied on the framing camera) -> 'a screen wider than tall keeps its chase view (framing weight 0), and the privateer you fire at is on screen in it (hull wholly on screen)'. The separate desktop 'keeps its chase view' check is folded into it, so it counts one fewer. Why: finding A1. Framing on wide screens was the blocker (it lost both ships in real play). In the landscape chase view her hull is on screen, but her tag sits under the top HUD row, as in the game before the first pass.

### Verification

Full suite from the published repo: `cd /home/user/First-project && NODE_PATH=/opt/node22/lib/node_modules npm test`, exit code 0, no FAIL lines. Per suite: combat 102, armory 35, cosmetics 70, walk 74, mechanics 121, upgrades 37, server 14 (all passed), smoke 94 passed / 0 failed, controls 232 / 0, audio 50 / 0, battle 182 / 0, levels 73 / 0, town 130 / 0.

Before publishing, on the dev copy: battle.cjs 182/0, controls.cjs 232/0; BATTLE_ONLY=phone 25/0; CONTROLS_ONLY=phone 21/0.

New checks run against the first-pass build (/tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/ammo/verify/game, md5 matches the first pass's main.js, tags.js and style.css):
- BATTLE_ROOT=… BATTLE_ONLY=phone: 14 passed, 11 failed, each for its intended reason. Turn test zoom 0.35–1.31 and own ship 0.92 on screen; both-beams swing 4.05 rad; boarding 3 rad at 6.7 rad/s; island: own ship 0.8 on screen; queued shot with nobody in aim gives 0 volleys; ring hidden after a Loading cue; no pip colours; reduced-motion weights fractional with 24 cuts; desktop and 844x390 fights reach framing weight 1 (own ship below 1 on screen); desktop framing target set.
- CONTROLS_ROOT=… CONTROLS_ONLY=phone: 5 failed. 568x320 and 844x390 framed (weight 1); "Loading…" 57.3 px wide in the 52 and 56 px buttons (room 51.1 / 55.2).

Probes (in /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/p2/: natural, turn, swing, board, land and sweep probes at 390x844, 360x640, 320x480, 568x320, 844x390 and 1280x720) gave the numbers in the summary. Also: desktop level-4 natural play had framing weight 0 in all 423 frames with your ship 100 % on screen; reduced-motion both-beams run had weight only 0 or 1 and 5 cuts at least 3.5 s apart.

Screenshots looked at: the coordinator's chain-700.png; the skeptic's sheet-ammo, sheet-turn-new/old and z-load zooms; my sheets sheet-sw390, sheet-sw320, sheet-swc, sheet-tp, sheet-turn2, turn2-05, sheet-swing2, sheet-land3/4/5, land4-04, sheet-lf and sheet-suite (the suite's phone-framed and phone-frame-*.png).

### Open issues

- Phones on their side (568x320, 844x390) now keep the old chase view. Her hull is on screen there, but the tag of a ship 15 u abeam sits under the top HUD row. That is how the game was before the first pass; landscape framing was dropped because it caused finding A1.
- README.md is not mine to edit and still doesn't describe portrait framing, the Fire queue (fires along the beam when nobody is in aim), the Loading cue, the chain badge, SLOWED!, the blinking lost pips or the ammo hint texts.
- When the framed ship changes (several pirates near, or a ship on the other side kept in the same turn), the new target can be partly off screen for about 0.2–0.5 s while the camera pans to her. In natural play: level 2, 149 of 159 framed frames fully OK; level 6, 76 of 90.
- Reduced motion now follows SPEC2 §13 (cuts, never eases), but in a fight with targets on both beams it can cut every 1.5–2.5 s.
- With a far target framed while you turn hard, the camera sits 30–45 u away. Its turn rate is at most the chase view's, but its position moves faster: up to about 70–90 u/s, against about 21 u/s for the chase view.
- The framing ignores the hint bubble (it comes and goes), so the bubble can briefly cover part of your own ship after an ammo change, as in the chase view. The land check uses only terrain height and colliders, not foliage.
- With pirates on both beams, the ship you fire at may be framed from the other side: she is in front of your ship and bigger, with her tag still on screen.
- The dev copy is left at /home/user/First-project/.dock-harness/phonefix2 (gitignored) and is identical to the published files. Nothing is committed.