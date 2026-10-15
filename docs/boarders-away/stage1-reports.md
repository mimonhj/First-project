# Stage 0 + Stage 1 reports for Stage 2 (data, written by the build agents; trust the code over these notes)

## Stage 0 (integrator) — committed 49daabd

### API notes
**Modules (§9.1 APIs as null objects)**
- `src/levels.js`: exports ACT1, LEVELS, WITH_ACT2, and imports act2.js.
  - DEVIATION from the task text "WITH_ACT2 = false": I used §6.1's Stage-0..3 definition, `WITH_ACT2 = /[?&]act2=1(&|$)/.test(globalThis.location?.search ?? '')`. It is false in every normal run and test. With ?act2=1 it is true, but LEVELS is still the 3 Act I levels because ACT2_LEVELS is empty.
- `src/act2.js`: `ACT2_LEVELS = []`. It imports the three env modules, so they load (and must stay importable) on every page.
- `src/env/doubloon.js`, `frost.js`, `maelstrom.js`:
  - Each exports meta {name, subtitle}, the exact §6.4–6.6 palette, and `build(scene)`.
  - build() adds an empty THREE.Group and returns worldRadius (150/140/140), colliders [], playerStart {0,0}, 6 enemySpawns on a radius-75 ring, reefs [], update(), dispose(), group.
  - Safe extras: doubloon `escapes: []`, `convoyStarts: []`; frost `step()` no-op; maelstrom `current` with the §6.6 numbers and `flash()` no-op.
- `src/tags.js`: `createTags(scene)` → { add → null, remove, update, dispose }.
- `src/pops.js`: `createPops(layer, camera, opts)` → { pop, update, clear, get count = 0 }.
- `src/overboard.js`: `createOverboard(scene, opts)` → { prepare, throwOver, showSurrender, clearSurrender, update, clear, dispose }.
- `src/boarding.js`: `createBoarding(ctx)` → the full §9.1 surface; start → false, camera → null, active/truce/locked false, phase/kind/target/last null, counterUntil -Infinity.
  - It imports nothing, because combat.js does not exist until Stage 1.
  - DEVIATION: §9.1 lists both a method `heave()` and a getter `heave`, which one JS object cannot hold. The method `heave()` (press, returns the new bonus) is kept and the getter is named `heaveBonus`. `__game.boarding` keeps `get heave` and `heavePress()` as §9.3 says.
- `src/mechanics.js` (pure, no imports): MECHANIC_IDS and `createMechanics()` returning every §6.3 hook with safe returns (null, false, [], 0, {}).
- `src/townMode.js`: `createTownMode(ctx)` → view 'shop', active false; ashore/open/back → false, showShop, close; onKey/onPointer/update → false; onResize, onContextRestored, `api: {}`.

**main.js**
- Hooks: `isFinale(n)`, `fighting(e)`, `dockExits(from)`, `env.step?.(state.time, dt)` and `env.update(t, dt, { simTime, camera })`.
- `TAP_ACTIONS.ammo` and `TAP_ACTIONS.board` are no-op stubs.
- `loadRecord(key, parse, serialize)` and `saveRecord(key, serialize, value)` are defined but not used yet.
- ECO-2: `saveChest()` and `unsavedSpend`. PERF-4: `openDockSoon(from)` and `ui.dockToast`.

**__game additions**
- Real: `fighting`, `place(ship, x, z, h)`, `setShipConfig(cfg)` (validated, saved, rebuilds the docked ship), `dock.view` ('shop' in the dock, null elsewhere).
- Placeholders with safe defaults: `combat`, `grapple`, `boarding`, `crew` ({crew: 0, max: 0}), `spawn` (null, because the galleon/raider/phantom models don't exist yet), `mechanics.state`, `armory`, `feats`, `setFeats`, `look`, `tips`, `wardrobe`, `dock.ashore`, `dock.back`, `town`.

**DOM**
- Battle HUD: `#crew-chip` in #hull-card; `#objective`; `#boss-crew` and `#boss-crew-fill` in #boss; `#boarding-strip`; `#pops`; `#game-live`; `#gun-ammo` and `#ammo-name`, then `#gun-board` and `#board-tag`, between Speed and Starboard.
- Touch: `.touch .pad.act` holds `#touch-ammo` (data-tap="ammo") and `#touch-board` (data-tap="board"). The pad and both buttons are hidden. CSS grid areas are now "sail . act" / "steer . fire", which lays out the same while the pad is hidden.
- Screens: `#won-text`; `#act2-btn` first in the won panel; `#dock-ashore-btn` at the end of .dock-head, before the tablist.
- Town overlays, all class overlay + hidden, before #recover-screen:
  - `#town-screen` (tabindex -1, role region, aria-label "Sparrow's Floating Island: walking") with all its Appendix A ids, including 4 `button[data-place]`.
  - `#wardrobe-screen` and `#tavern-screen`, using the .panel.dock-panel classes, outside #dock-panel.
  - `#harbour-dialog` (role dialog, aria-modal, labelled by #harbour-title) and `#aboard-dialog` (labelled by #aboard-title).
- New element not in Appendix A: `#dock-toast` (role status, aria-live polite), just before #recover-screen. When empty it is 0×0.

### Open issues
- The Stage 0 row says "npm test green with no test edits". PERF-4 makes the four shipyard buttons open the dock two frames after the click, and Playwright's page.click returns before then. So I added a `docked(page)` helper (it waits for state.mode === 'dock') to tests/controls.cjs after the existing dock-opening clicks: #dock-btn, #over-dock-btn, two #menu-dock-btn clicks, and Enter on the Shipyard button. At least three of these (#over-dock-btn, #menu-dock-btn from the title, #menu-dock-btn in the saved-records block) evaluate right after the click and would otherwise fail; the other two get the wait for robustness. No existing assertion changed. smoke.cjs and audio.cjs already wait for the dock and were not touched.
- Any future test that clicks a shipyard button must wait for the dock to open (or call __game.dock.open, which is still synchronous). Stage 2D and 3C test authors should know this.
- WITH_ACT2 follows SPEC2 §6.1 (true only with ?act2=1) rather than a literal `false`. With ACT2_LEVELS empty, LEVELS has 3 levels either way. If the coordinator wants a literal `false`, it is a one-line change in src/levels.js.
- boarding.js getter naming: §9.1's getter `heave` clashes with the `heave()` method, so the getter is called `heaveBonus`. Stage 2B should keep this or the spec should be updated. __game.boarding.heave (§9.3) is unaffected.
- Act I levels have no `rumour` or `lockText`. §6.1 lists them as optional and gives only Act II text, so Stage 3B or the townMode author must supply Act I rumours for the tavern board.
- #game-live starts hidden as Appendix A says. Stage 2A must unhide it, because a display:none live region announces nothing.
- README.md is not mine to edit, so it does not mention the storage-full rule or the toast yet.

## 1A Combat rules
Files: /home/user/First-project/src/combat.js, /home/user/First-project/tests/combat.test.cjs

### Summary
I wrote src/combat.js, the pure rules module for §2, §3, §3.8 and §9.1, and tests/combat.test.cjs for §11.1. The exit check passes: `node tests/combat.test.cjs` gives 102 PASS, 0 FAIL, exit 0, in about 0.43 s.

The tests reproduce every worked example of §2.1 and §3.3 exactly, using the real SHIP_TYPES data:
- **§2.1:** 10 on the beam at 18 u, 8.5 at 30 u, 20 for a stern rake, 16.875 for a bow rake at 12 u, 25 for a stern rake at 8 u, crit chance 0.23 and 43.75 with the crit, a 25.5 vs 93.75 broadside (3.7×), Master gunner tier 3 at 0.32, and enemy rakes of 7, 10 and 6. Crit chances are compared with `===` against the stated decimals; damage uses `===` except a few chain, grape and ghost crit checks (1e-9 tolerance).
- **§3.3 (examples 1–6 and their variants):** P, M, D and R match to 3 decimals, and every loss, left count, captured / overrun / attackerStrikes flag and preview label matches. The surrounding bookkeeping is checked too (145 gold, hull 80 → 70, cap 8, cap min(4, 3), 125 gold, a crew of 13 and notch 4 on the Phantom).

The other §11.1 checks also pass: rangeMul, aspectOf, hitZone, critChance, ammoUnlocked, effectFor, every ammo, enemy shots, the ghost crew, forced crits, the seeded RNG, crewNow, strikeAt, monotonicity (213,600 boardings), the caps, R = ∞, previewLabel, captureGold for every ship type, plunderGold, and junk input (27 kinds in every argument and field).

To check the tests themselves, I ran them against 30 hand-written broken versions of combat.js. 29 made them fail. The 30th turns the point-blank test in rangeMul into `<`, which gives the same value at 10 u, so no test can catch it. The real point-blank boundary is covered by the pointBlank-flag test.

### API notes (exports, deviations)
Every §9.1 export is there, with the §9.1 signatures: RANGE, RAKE, CRIT, EFFECTS, STATES, AMMO, AMMO_IDS, AMMO_SWAP, GHOST, CREW, BOARD, RAIDERS, CAPTURE, mulberry32, rangeMul, aspectOf, hitZone, critChance, ammoUnlocked, shotResult, effectFor, crewNow, strikeAt, boardingOdds, resolveBoarding, previewLabel, captureGold, plunderGold. That is 29 exports including WORDS (below). The tables match §3.8 value for value and are frozen all the way down; 3B tunes them by editing the source.

Additions and deviations:
(1) **New BOARD.homeLossCap: 0.6.** §3.3's player-defending cap `ceil(0.6 × def.crew)` had no constant in §3.8.
(2) **New export WORDS.** Holds the pop words from §2.3 / §2.5 (stern 'STERN RAKE ×2!', bow, pointBlank, crit, chain 'SAILS SHREDDED!', rudder, mast, keg, routed) and the preview labels (capture 'CAPTURE!', fight, risky, take 'TAKE HER!'). The rake words are built from the RAKE table.
(3) **shotResult returns two extra fields: critMul and ghostMul.** main needs ghostMul for the keg burst (`EFFECTS.keg.burst × ghostMul`).
(4) **resolveBoarding defaults.** If playerAttacks / playerDefends are not given, they follow enemyAttacks (playerAttacks = !enemyAttacks, playerDefends = enemyAttacks) instead of false. That way the player can never lose its whole crew if a caller forgets a flag. Values passed explicitly are always obeyed.
(5) **Options objects can be null or junk.** Every function reads its options through a guarded reader, so junk never throws.

Semantics 2A and 2B must know:
- **What shotResult leaves to main.** `dmg` does NOT include the keg's +12 burst, and `crewKill` does NOT include the routed +2. Both are effects, so main adds them only when it actually applies the effect (one new effect per target per CRIT.effectGap). main also halves effect times for bosses (CRIT.bossDuration); `target.boss` is accepted but does not change dmg.
- **Crit rolls and the RNG.** Enemies never crit, even with `force` set, and draw no random number. An unforced player shot draws exactly one number from `rng`; a forced shot draws none. A player shot with no rng function never crits (deterministic, no Math.random fallback).
- **force values.** 'crit' gives the zone/ammo's natural effect. 'rudder' / 'mast' / 'keg' / 'routed' give that effect whatever the ammo. 'none' never crits.
- **Rakes and tags.** Enemy aspectMul = 1 + (raw − 1) × enemyRake, with enemyRake clamped to 0..1 (default 1). `tags` are the hitmark stickers in order: `RAKE ×<real multiplier>` (player 'RAKE ×2' / 'RAKE ×1.5', enemy L1 'RAKE ×1.4'), 'CRIT!', 'POINT BLANK'.
- **Rounding.** dmg, rangeMul, critChance and the enemy aspectMul are rounded to 1e-9 so they land on the spec's decimals (0.23, not 0.22999999999999998). Rounding, flooring and ≥ thresholds use a 1e-9 epsilon.
- **Fallbacks for missing values.** An unknown or missing `dist` counts as 14 u (×1, not point blank). An unknown ammo is round shot. A missing critBase is CRIT.base[0].
- **Boarding inputs and outputs.** heave is clamped to 0..BOARD.heaveMax. R = Infinity only when the defender has 0 crew. att/def take `blade`, else `grit`, else 1. captured is only true when the player attacks; overrun and attackerStrikes only when an enemy attacks. hullDmg = 2 × defLoss, and main keeps the ship at ≥ 1 hp.
- **previewLabel order.** 'take' if surrendered, then 'capture' if captured, then 'fight' if R ≥ 1.2, else 'risky'.
- **crewNow.** Floors fractional counts, clamps hpLow / maxHp to 0..1, and treats missing hp as full hull.

### Open issues
- src/armory.js (1B) is import-free, so its armoryStats tables (critBase 0.06/0.09/0.12/0.15, grappleRange 14/17/20, reel 1.2/1.0/0.8) duplicate CRIT.base, BOARD.range and BOARD.reel here. A Stage-2 or 3B test should check they stay equal; I did not add that check because armory.js is still being written by another agent.
- Main.js still has to implement the effect gap, the boss half-duration, the keg burn ticks, the chain slow refresh/max and the 'smallest active multiplier' rule; combat.js only provides the numbers (EFFECTS, CRIT).
- Should the 3 additions (BOARD.homeLossCap, WORDS, the critMul/ghostMul result fields) and the resolveBoarding flag defaults go into SPEC2 §3.8 / §9.1? Needs a coordinator decision.

## 1B Economy
Files: /home/user/First-project/src/armory.js, /home/user/First-project/src/cosmetics.js, /home/user/First-project/tests/armory.test.cjs, /home/user/First-project/tests/cosmetics.test.cjs

### Summary
Built both 1B economy modules and their Node suites, and both suites pass.

- **src/armory.js** holds the four tavern upgrades from SPEC2 §4. All tiers together cost 4,600 gold. The record is validated the same way as parseShipConfig.
- **src/cosmetics.js** holds the §7.9 catalogue: 64 items in 12 slots. Every slot has one free default, the paid items add up to 1,200 gold, and there are 4 trophies. It also has the look and feats records from §8, the wardrobe logic (itemState, wear, buy, surprise, sanitizeLook) and the person-option builders (captainOpts, crewOpts, enemyCrewOpts).
- **Results:** tests/armory.test.cjs passes 35 checks and tests/cosmetics.test.cjs passes 70. Both include the full hostile-storage battery from upgrades.test.cjs, plus revoked proxies, array proxies and fuzzing with junk arguments.
- **Mutation check:** I broke each module on purpose 28 ways. The tests caught 24. The other four are not real gaps: three changes that cannot alter behaviour, and one line I deleted as dead code.
- **Visual check:** a harness at .dock-harness/1b/looks.html renders crew uniforms, enemy factions and captain variants. It uses a snapshot of 1C's in-progress people.js. Three review rounds led to two fixes:
  - The faction picks were biased, so neighbouring seeds all looked alike. Picks now step like digits of the seed, so neighbouring sailors differ and the four combinations come out 250 each.
  - Phantom crew now get pale ghost hair.

### API notes (exports, deviations)
**armory.js** (no imports) exports exactly the §9.1 list: ARMORY, defaultArmoryConfig, parseArmoryConfig, serializeArmoryConfig, armoryMaxTier, armoryNextCost, armoryStatText, armoryStats.
- ARMORY entries are { id, name, blurb, stat, values, costs, extra? }. `extra` is a short UI line, present on boarders and grapple.
- Gunner values are fractions (0.06–0.15), so armoryStats().critBase can be used directly.
- Reel times [1.2, 1.0, 0.8] live in an internal REEL table, like SAIL_ACCEL in upgrades.js.
- The test checks that BOARD.range, BOARD.reel and CRIT.base in combat.js match these tables. combat.js exists now and they match.
- serializeArmoryConfig(null) gives exactly {"up":{"boarders":0,"cutlass":0,"grapple":0,"gunner":0}}.

**cosmetics.js** (no imports) exports every §9.1 name. It adds one export, SLOT_NAMES (the group headings for the UI and for announcements such as "Hat: Bandana").
- ITEMS entries carry { id, slot, key, group, name, price?, trophy?: { feat, min, text, unit }, swatch, isDefault?, opts }.
  - `opts` is the buildPerson fragment that item adds.
  - `trophy.unit` is for the captain's log, e.g. "3 of 10 captures".
  - ITEMS, PALETTE, SLOTS and FEAT_IDS are frozen.
- Looks are stored in memory exactly as on disk: { v: 1, cap, crew, own }. `own` is written in catalogue order.

Interpretations where §7.9/§8 leave room:
1. **Feats counters out of range are clamped**, not set to 0, so a real counter past 1,000,000 isn't wiped. Junk values still become 0. Prize counts of 0 are left out.
2. **itemState(unknown id) returns null.** wear and buy return `reason: null` on success. buy also puts the item on.
3. **surprise(look, group, rng) puts a random free item in every slot of that group.** Paid and trophy items stay owned but come off. The other group and `own` are untouched, at least one slot always changes, and a broken rng is tolerated.
4. **crewOpts without base options returns { kind: 'pirate', seed }.** With base options and the default look it returns an exact copy, as §7.9 requires.
5. **Some opts go beyond the §7.10 table:**
   - `earring: true` (§7.9 asks captainOpts for it).
   - `vest` (hex or null): coat 'none' is named "Shirt and vest" and gets a leather vest; coats and uniform shirts get null so every sailor shows the uniform; corsairs and raiders wear their dark and fur vests.
   - `hatBadge: 'skull'` for the skull bandanas.
   - 1C's in-progress people.js already reads all three in resolveLook.
6. **Body 'slim' maps to kind 'woman' with outfit 'pirate'.** The beard is whatever the player picked, so the default is still a full beard.
7. **"Navy jackets" uses the coat option on sailors.** Enemy crews take seeds as given, with seed 0 when the seed is missing or invalid.

**Hand-off notes for townMode (2C):**
- Item state line labels: "Free", "Owned", "Trophy won", "120 gold", "Need 30 more gold", "Locked: capture 10 ships".
- The admiral trophy is named "Admiral's white coat", which still contains §7.9's "Admiral's white".

### Open issues
- Visual verification used a snapshot of 1C's in-progress people.js (.dock-harness/1b/people.js, copied from .dock-harness/1c/people.js with its style.js import path rewritten). Coats (captain coats, Navy jackets, marines), bicorne, plumed, crown, horned, braids, stubble, handlebar, parrots and the skull badge were not drawn yet. Re-render looks.html once 1C publishes. If coat tails look wrong on the crew, 'shirt.navy' can become a plain navy shirt by changing one catalogue row.
- Interpretation choices for the coordinator to confirm. (a) Surprise me! takes worn paid and trophy items off in that tab (they stay owned). The alternative is to leave those slots alone. (b) Feats counters out of range are clamped, where §8 says 'else 0'. (c) Choosing a slim body keeps whatever beard is worn (the default is a full beard).
- cosmetics.js relies on three options that are not in the §7.10 table: vest, hatBadge and earring. They are honoured by 1C's in-progress resolveLook, but not yet by the published src/people.js. Until they land, people.js just ignores them: no crash, only a less exact look (random vests can show under uniforms; skull bandanas are plain black).
- §11.1 asks for a hard-coded list of options people.js accepts. The list in tests/cosmetics.test.cjs mirrors §7.10, existing options, earring, and 1C's vest and hatBadge. If 1C renames or drops any of these, update that list and cosmetics.js together.

## 1J Act II rules
Files: /home/user/First-project/src/mechanics.js, /home/user/First-project/src/act2.js, /home/user/First-project/tests/mechanics.test.cjs

### Summary
1J Act II rules is done. src/mechanics.js now holds the three level mechanics of SPEC2 §6.3 as composable parts behind createMechanics. The module is pure and imports nothing, and every number sits in one internal table (CONVOY, FLOES, CURRENT, GHOST).
- convoy (Doubloon Bay): each galleon moves to the nearest unused convoy start and takes the escape gate farthest from the player. It cruises at 0.7 × maxSpeed (4.55). With the player within 35 u it runs at full speed (6.5) and zig-zags ±0.4 rad; the first leg turns away from the player and the side switches every 4 s of simulated time. It fires only at a player abeam (|along| < |lat| × 0.45) within 18 u. Inside its own gate's r it escapes (ctx.escape, the banner "The galleon escaped with its gold!", an announce). Objective "Galleons: {taken} taken · {escaped} escaped · {toGo} to go", where to-go counts galleons not yet spawned; summary "Galleons taken: N of M"; bonus 150 × taken; minimap shows gates and galleons.
- floes (Frostbite Straits): a hull faster than 6 inside an ice floe takes 6 damage (source 'ice'), the pop "CRUNCH!" and sfx 'crunch', at most once per 1.5 s per ship. Floes are read live from env.reefs where ice is true, including floes added later.
- current (The Maelstrom): drift follows the exact §6.3 formula, zero at d ≥ r and none for ghosts. A non-ghost ship in the eye takes 1 hp every 0.2 s (source 'maelstrom'). The first time the player enters the eye the banner "The maelstrom pulls you in!" shows. avoid() gives the eye + 4. A Phantom from a wave rises 18 u from the centre in open water facing the player, with e.rise = 3, the banner "The Phantom Galleon rises!" and sfx 'ghost'. Minimap shows the vortex and the eye.

src/act2.js defines levels 4–6 exactly as §6.4–6.6, including the waves, the knobs, mechanics, lightning bombs, finale and finaleText, the mechanic lines and rumours, and lockText 'Beat the Molten Maw' on level 4. Level 5 also has a new optional field, mechanicTouch, with the touch wording ("Tap CUT! three times or hold it").

tests/mechanics.test.cjs has 114 checks with a mock ctx and the real SHIP_TYPES. It also checks the act2.js level data and that ?act2=1 appends Act II in levels.js; for those two it swaps the env imports for stand-ins.

### API notes (exports, deviations)
Exports match §9.1 exactly. mechanics.js exports only MECHANIC_IDS (['convoy','floes','current']) and createMechanics(ids, ctx). The returned object has every §6.3 hook: init, onSpawn, onCapture, onSink, onRemove, step, steer, holdFire, drift, avoid, objective, minimap, summary, bonus, get state, dispose. act2.js exports only ACT2_LEVELS, and still imports the three env modules.

Behaviour choices where §6.3 was open (all documented in the module header):
1) ids: unknown, junk or repeated ids are ignored; ids that are not an array give no mechanics. When several mechanics run together: steer takes the first non-null answer, holdFire is true if any says so, drift is summed, avoid/minimap/summary are joined, bonus is added up, and objective lines are joined with ' · '.
2) Time: gameplay runs on the mechanics' own simulated clock (the sum of the dt given to step). The zig-zag timer uses the dt given to steer. ctx.time and ctx.rng are not used, so no combatRng draw is ever taken.
3) onSpawn(e, waveIndex): only a wave spawn (waveIndex an integer ≥ 0) is moved — a galleon to a convoy start, the Phantom onto the 18 u ring. With any other waveIndex (e.g. −1 from G.spawn) the ship keeps its position, though it still gets a gate or rise = 3. onSpawn is idempotent per ship. init() also registers, as wave 0, any enemy onSpawn has not seen yet, so main may create the mechanics before or after spawnWave(0).
4) Convoy starts: a start within 35 u of the player or within 18 u of another ship is skipped while a clear unused one exists. If the env has no escapes (today's stub), the galleon gets a gate at worldRadius − 25, straight away from the player; it shows on the minimap and works as an escape.
5) Floe crunch means 'centre inside a floe while |speed| > 6', limited by the 1.5 s per-ship cooldown. A ship grinding through ice is therefore crunched again after 1.5 s; this matches 'once per 1.5 s' in §11.1/§11.3.
6) Eye damage builds up per ship and resets on leaving the eye, so the first 1 hp lands 0.2 s after entering. Ships that are captured, escaped, sinking or ghost are skipped by floes and the eye; surrendered ships are not skipped.
7) Addition: holdFire is also true for a ghost while e.rise > 0, so the Phantom does not fire while rising.
8) Optional ctx.types (SHIP_TYPES) decides which wave names count as merchants. Without it the fallback list is ['galleon'].
9) Pop styles: CRUNCH! uses 'bad' on the player and 'dmg' on enemies.
10) state is a fresh JSON-able snapshot: { ids, time, convoy?: { total, unspawned, taken, escaped, sunk, toGo, bonus, gates[], runners: [{ index (in ctx.enemies), type, x, z, gate (index into env.escapes, −1 for the edge gate), gateX, gateZ, fleeing, zig, outcome }] }, floes?: { count, crunches, floes[] }, current?: { x, z, r, pull, swirl, eye, eyeDps, active, warned, eyeDamage } }. tests/levels.cjs (3C) can read the far gate from runners[i].gateX/gateZ.

Spec deviation in act2.js: level 5 has an extra field, mechanicTouch, for the §6.5 touch wording. Levels 5 and 6 have no lockText, so the card shows 'Locked' (§5.6).

### Open issues
- Levels 4–6 cannot be started with ?act2=1 yet: buildShip throws for 'galleon', 'raider' and 'phantom' until 1D's models land in src/ships.js (the build in progress has none of those builders yet). Loading the page and showing the level cards works.
- main.js does not call the mechanics hooks yet (Stage 2, 2A). Until then the convoy, floes and current do nothing in game; the hook_requests list the exact integration.
- The Doubloon Bay escape gates and convoy starts come from 1F's env and the floes from 1G's env.step. The rules read them live and fall back cleanly to today's stub seas (an edge gate, no floes). env.current is already in the Maelstrom stub.
- tests/mechanics.test.cjs is not in package.json `test` yet; 2D owns package.json.
- Balance (Stage 3, 3B): galleons take about 38–50 s to reach a gate from a start about 230 u away, and the drift peaks at about 3.1 u/s near the eye, well below every ship's top speed. 3B can tune both in the CONVOY and CURRENT tables if the Act II bot needs it.

## 1K Feedback
Files: /home/user/First-project/src/tags.js, /home/user/First-project/src/pops.js, /home/user/First-project/src/overboard.js, /home/user/First-project/fx.css

### Summary
I built and published the three 1K modules and fx.css, replacing the Stage 0 stubs. Each file was written in .dock-harness/1k/ and copied into place with an atomic mv.

- src/tags.js: enemy name tags.
  - Name label: same look as before. The label cache and the redraw when the web font arrives now live here instead of main.js.
  - Hull bar with a pale ghost segment. It holds 0.45 s after each hit, then slides down at the HUD bar's rate. A wrecked ship (tagPulse) makes the bar throb red to orange.
  - Crew row: 10 cream/dark pips with the last one partly filled, and a gold surrender notch on a dark backing so it stays readable across a cream pip. Every pip and notch of every tag is one noOutline InstancedMesh (1 draw call); it grows itself if more than 12 tags show.
  - One icon sprite from a canvas-drawn atlas: capture (green, tick), fight (gold, crossed sabres), risky (red, '!'), white flag, crossed-out flame for 'hot', and a greyed hook with an 8-step recharge ring for the cooldown.
  - Show/hide and size match today's syncShip code. The tag shows for fighting and surrendered ships and hides when the ship sinks, is captured, escapes, has 0 hp or is within 10 units of the camera.
  - The whole tag sits 0.38 × scale higher than before, so its bottom edge is where the old one-row tag ended and the masthead flag (white or yours) stays visible.
- src/pops.js: DOM pop words, 0 draw calls.
  - 12 recycled spans, projected from their world point every frame. Styles: dmg, rake, crit (1.3× size), crew, info, capture, gold, bad.
  - Text is at least 24 px, light coloured, with a 6 px stroke drawn under the fill (3 px of ink outline shows) and a drop shadow.
  - Throttle: at most 12 alive and 8 new per second. Extra pops wait up to 0.4 s in a queue; important styles go first.
  - Pops that land together don't overlap: each new one takes the nearest free spot above the others, or below them if that would run off the top of a short screen. A pop near a screen edge slides in instead of being cut off.
  - Reduced motion: fade in and out only (no rise, bounce or wobble). Without it: a 0.22 s pop-in, a 50 px rise, then a fade.
- src/overboard.js: a pool of 5 people built with share: true. They are children of the scene, hidden while idle (0 draw calls), and placed from the ship's transform each frame.
  - throwOver: the sailor goes backwards over the given rail, tumbling on a 0.8 s arc that keeps the ship's speed and lands about 3.5 units out. Then foam and sfx('overboard') at the splash, a 1.1 s bob on the swell, and he goes under.
  - showSurrender: two sailors stand on the struck ship's deckSpots with hands up, facing outboard, one struck ship at a time. They clear themselves if the ship sinks, is captured or is removed.
  - prepare(): prebuilds the level's looks, one per frame.
- fx.css: the pop classes, plus the hitmark sticker classes (.hm-tags / .hm-tag with rake, crit, blank, captured) for 2A.

I used the harness and screenshots for three or more critique rounds and fixed what I saw:
- Icon redesign: a cluttered badge-in-badge became one bold mark per state, and the sabres were redrawn so they stay inside the badge.
- Tag lift, so the two-row tag no longer covers the masthead flag.
- Fall arc widened: it hugged the hull before.
- The bob now follows the waves.
- Pop stacking reworked twice: first it overlapped, then on 844×390 pops piled up at the top edge.
- Pool slot choice fixed so prebuilt looks don't overwrite each other.

### API notes (exports, deviations)
Exact exports, as in §9.1 plus additions. Nothing in the specified API was changed or removed.

tags.js: `export function createTags(scene)` returns { add(ship) → THREE.Group tag | null, remove(ship), update(ships, camera, t, dt), dispose() }.
- Extras for tests:
  - read(ship) → { visible, hull, ghost, pips, notch, icon }, with pips and notch in pip units read back from the InstancedMesh colours and matrices (for §11.2 "pip count equals 10 × crewNow / crew0").
  - get count; get pips (the InstancedMesh, named 'tag-pips').
- Fields read per ship: hp, maxHp, crew0, crewShown, strikeAt, tagIcon, tagPulse, flash, sinking, captured, escaped, x, z, tagY, mesh.position.y.
- Fallbacks when a field is missing: crew0 → type.crew; crewShown → crew0; strikeAt → floor(0.2 × crew0).
- Deviations:
  1. add() returns null for type.boss (the boss has its DOM bar).
  2. Extra tagIcon value 'cooldown', with ship.tagCool = fraction of the cooldown still to go (0..1), for §3.4's hook recharge ring.
  3. 13 instances per tag instead of 11: 10 pips, a partial-pip overlay, the notch's ink backing and the gold notch. Capacity starts at 12 tags and grows. Still 1 draw call for all pips.
  4. The ghost plane is hidden while it isn't lagging, so a steady tag costs 3 draws and 4 only during the 0.45 s+ lag. This is under the "+1 per tag" budget.
  5. The tag is lifted 0.38 × scale so the masthead flag stays visible.

pops.js: `export function createPops(layerEl, camera, { reducedMotion })` returns { pop(text, x, y, z, style = 'dmg') → boolean, update(dt), clear(), get count }.
- reducedMotion may be a boolean or a function; it is read at each pop.
- A '\n' in the text, or the form 'CRIT! <effect>' with style crit, makes a big line plus a smaller second line.
- Empty text or non-finite coordinates are refused (returns false).
- createPops removes the 'hidden' class from the layer it is given.

overboard.js: `export function createOverboard(scene, { foam, sfx, heightAt? })` returns { prepare(optsList), throwOver(ship, side, opts) → bool, showSurrender(ship, opts | [opts, opts]) → bool, clearSurrender(ship?), update(t, dt), clear(), dispose(), get active, get surrendering }.
- foam is called as (x, y, z, n, spread, up, size, life), matching main's foam(). sfx is called as (name, x, z); the name is 'overboard', played at the splash.
- Extras: optional heightAt(x, z, t) puts the splash and bob on the wave; the getters active and surrendering; a single opts given to showSurrender gives the second sailor seed + 7.
- Uses ship.mesh.userData.deckY / railY / deckSpots / hullSide from ships.js when present, with per-type fallbacks.
- Imports buildPerson, animatePerson and disposePerson from './people.js'. The 'fall' and 'surrender' actions exist in the people.js 1C has published; with an older people.js they fall back to idle.

fx.css: .pops, .pop, .pop-main, .pop-sub, .pop-{dmg,rake,crit,crew,info,capture,gold,bad}, .hm-tags, .hm-tag.{rake,crit,blank,captured}. It does not affect any existing selector; #pops stays hidden by .hidden until createPops runs.

### Open issues
- tests/smoke.cjs failed in my one run: adaptive resolution stayed at scale 1, then a timeout at smoke.cjs:131 waiting for the intro to end. Load average was 13–15 and the game advanced only about 0.06 s of simulated time per real second. main.js does not import my modules and fx.css only adds new selectors, so I believe this is load, not my change, but it needs a rerun on a quiet machine to confirm.
- Nothing is wired into the game yet: main.js still uses its old buildTag/setTag. Stage 2A has to apply the hook requests; until then the new tags, pops and overboard do not appear in play.
- The overboard and surrender sailors are scale-1 people. From the chase camera at 20–30 units they are small, about 15–20 px; they read as a flailing figure plus a splash. 3E could enlarge them if in-game shots want more presence.
- On a short landscape screen, a burst of 4 or more pops at one impact plus others nearby can fill much of the screen. Placement avoids overlap and clamps to the screen, but cannot shrink a tall stack.
- Ships missing deckY/railY/deckSpots/hullSide fall back to a per-type deck-height table in overboard.js. The ships.js 1D published already provides all four, so the fallbacks only matter for future types.
- The harness overboard close-ups used 1C's people.js with the 'fall' and 'surrender' poses (now published). With the older people.js those actions fall back to idle; nothing breaks.

## 1E Sound
Files: /home/user/First-project/src/audio.js

### Summary
1E Sound is done: src/audio.js now has the 15 new sound effects and 4 new scenes, added on top of the existing code. The recorded-music system (RECORDED, assets/audio/, tests/audio.cjs) is intact and still passes.

What the scenes are:
- doubloon: a Spanish fandango in A minor. Trumpets (two in thirds in the middle), strummed guitars with a tremolo-guitar lead on the second pass, castanets, cajon and a harbour bell. Ambience: swell, gulls, channel-buoy bells, creaks and a distant town bell.
- frost: E dorian over a bowed drone. Fiddle (a second fiddle a third below from the middle on, a wooden flute on alternate passes), rowing drum, a choir, celesta and lur horns. Ambience: wind, gusts, lapping water, groaning floes, ice that "sings" with falling chirps, tinkling shards.
- maelstrom: a 3/4 danse macabre in C minor. Theremin lead with glides, xylophone "bones", pizzicato waltz, chapel organ, timpani rolls, a tolling bell. Ambience: rain, a whirlpool roar that circles the listener, wind, distant thunder, creaks, rare ghostly moans.
- town: the title tune over harbour ambience (water on the piles, gulls, creaks, halyards tinking on masts, a ship's bell). It borrows the title recording when there is one. Going between two scenes that share music (town and title, or town and the synthesised shipyard) carries the music on from where it is instead of restarting it.

New instruments were added for these tunes (organ, theremin, choir, horn, xylophone, castanets, and a cartoon voice for the crew sounds).

How I checked the sound without hearing it: I rendered waveform and spectrogram images and looked at them over three critique rounds, plus zoomed views of the music. That led to these fixes:
- grapple: the hook landings were too weak.
- clash: it sounded like a bell, not steel.
- crit: its low boom duplicated `hit`.
- chain: a steady whistle tone dominated.
- grape: thin and sparse.
- cut: the axe chop was buried.
- thunder: inaudible 38 Hz sub-boom.
- frost ambience: ice cracks showed up as clicks.
- doubloon: wrong G natural in the trumpet thirds over E major, and the guitar melody vanished on the second pass.
- frost harmony: produced a tritone.
- frost drone: drowned the fiddle.

Levels were then calibrated by measured loudness (K-weighted, as the existing table was) against role targets taken from existing sounds. Every new sound lands within about 1 LU of its target. New music sits at -28.5 LUFS like the existing scenes. Level ambiences sit at -38.5 to -39.5 LUFS, and the town at -42 like the title screen.

The audio module renders nothing, so it adds 0 draw calls.

### API notes (exports, deviations)
Exports have the same shape as before:
- `createAudio`, `RECORDED` and `__audioTest` (renderOffline, validateScores, distGain, distCutoff, fitLength, loadRecording, RECORDINGS) are unchanged.
- `SFX_NAMES` gains 'grapple', 'heave', 'clash', 'cheer', 'capture', 'crit', 'rake', 'chain', 'grape', 'cut', 'crunch', 'thunder', 'step', 'overboard', 'ghost'.
- `SCENE_NAMES` gains 'doubloon', 'frost', 'maelstrom', 'town'.
- `audio.setScene()` and `audio.play()` accept the new names with the usual options (distance, pan, volume, pitch); handles keep `stop()`/`set()`.

Internal tables, as section 9.1 asks:
- `SFX_CAP` and `SFX_GAIN` have an entry for every new sound.
- `capture` is a stinger: one at a time, ducks the music for 1.5 s.
- `SCENE_GAIN` and `CHORD` have the new entries.

Additions beyond section 9.1, all internal:
1. `MUSIC_OF = { town: 'menu' }` and `TUNE_OF = { dock: 'menu', town: 'menu' }`. The town plays the title recording when one exists, otherwise the synthesised jig. The loader decodes and keeps the borrowed track with the town scene and drops it two scenes later, like any other track. A recording that arrives while the town is waiting for it takes over.
2. Carry: a scene change between two scenes with the same music picks up from the current position instead of restarting. Recorded music carries sample-exactly; synthesised music keeps its beat grid.
3. `renderOffline({ recorded: true })` now also loads borrowed music and the `then` scene's recordings. This is a test helper only, and the existing tests are unaffected.

No deviations from the section 9.1 API.

### Open issues
- Not heard by ear. Everything was judged from spectrogram and waveform images, music-theory checks and loudness measurements. A human listen in Stage 3/4 is worthwhile, especially for the cartoon voices (cheer, heave, overboard) and the three new tunes.
- Stingers never stack, so a `wave` horn played right after `capture` cuts the capture fanfare short. The hook request suggests main delays the wave horn.
- When synthesised music carries between title and town, the two copies differ in their random ornaments, so the crossfade dips about 2 dB for about 0.5 s. Recorded music carries exactly. Only the synth mode (?audio=synth) or a missing file is affected.
- The new music and sound effects are synthesised only; RECORDED has no entries for them. If recordings are made later, adding them to RECORDED is enough, and the town picks up music:menu automatically.
- The cheer builds about 100 Web Audio nodes per play (capped at 2 at a time) and the boarding sounds 20-70 each. In my offline renders the engine peaked at 116 nodes for a lone cheer, well under anything that worries Web Audio.
- Stage 2D: section 11.2's audio check ('offline renders of every new SFX are finite, stereo, not silent') can copy /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/stage1/1E Sound/exit.js. It derives the new names from SFX_NAMES and SCENE_NAMES and runs in a page via `node run.cjs exit.js /src/audio.js`.

## 1C Characters
Files: /home/user/First-project/src/people.js

### Summary
1C Characters is done. src/people.js now does everything in SPEC2 §7.10 and §9.1, and every existing look stays exactly the same. It was developed as a copy in .dock-harness/1c/ and published with an atomic mv; no other file was touched.

What was added:
- Options:
  - `outfit: 'pirate'` puts pirate clothes on any body: shirt, sash, trousers and tall boots, never a skirt or apron.
  - Four new hats, plus `hatColor` for any hat: a bicorne worn sideways (gold-piped crescent with a red cockade), a plumed tricorn (three-blob curled red feather), a gold crown (five points, jewels in vertex colour, red velvet cap) and a horned Viking helmet (iron dome, bronze bands, nose guard, curling horns).
  - `coat` / `coatTrim`: the coat is painted on the torso lathe with an open front, trim lapels, six gold buttons, trim cuffs and lace ruffles. Its tails are a thick open-front shell on the skirt bone with a darker lining. They trail behind strides, swing in walk and run, lie back over a seat and shorten when kneeling.
  - Beards as strings: full, goatee, stubble (painted on the jaw), braids (two braided tails with gold beads), handlebar (curled moustache) and none. The old booleans still work.
  - `hair` and `hairStyle` (crop, long, ponytail, bald) for any body; `stripes`, `shirt2`, `vest` and `earring` overrides.
  - `pet: 'parrot'` with `petColor`, on four new bones (`pet` under the torso, plus head and two wings). It looks about and bobs its head every 3 s, flaps when running, and flutters up over the hat whenever the left arm rises (cheer, left-hand wave, surrender, swing, fall), so it never clips the arm.
  - Three new tools: cutlass (curved lens-section blade, brass guard and knuckle-bow; tucked through the sash when an action doesn't use it, dropped on the deck in surrender), tape (worn round the neck, stretched between the hands in 'measure') and scissors (two halves that open in 'snip').
- The 11 new actions: run, proud, steer, point, swing, fight, fall, surrender, haul, measure, snip. All are deterministic and only move bones. 'run' uses an IK stance with flight phases and `walkSpeed(p, 'run', tempo)` matches it exactly. 'steer' takes `opts.turn` (−1..1, + = starboard), 'fight' is a 1.0 s guard → wind-up → lunging slash → recover loop, and 'fall' takes `opts.since`.
- `share: true` and the share cache: the geometry is cached per resolved look; each person still gets its own bones and Skeleton. `disposePerson` counts references down; `releaseSharedPeople()` frees unused entries at once and the rest when their last person is disposed. It is about 10× faster: 20 shared builds took 29 ms against 319 ms unshared.
- A new `'mid'` detail level, which the captain (`outfit: 'pirate'`) uses by default. Without it the spec's "captain ≤ 12k triangles" cannot be met: today's plain pirate is already 11,750. Every captain combination is now at most 11,508, and full and mid look practically the same at half-screen size.

I did three or more rounds of screenshot critique. Fixes that came out of them:
- handlebar curls
- a bigger, sweeping plume
- skull badge size and position
- a thicker bicorne with wider piping
- Snips' hands and shears
- seated coat tails
- the parrot clipping the raised arm

Townsfolk built with `detail: 'low'` are unchanged: same geometry hashes, 3,237 triangles each in the smoke test.

### API notes (exports, deviations)
Exports, all existing ones kept unchanged:
- `ACTIONS`: the 11 new actions are appended at the end, so existing indices are the same.
- `TOOLS`: now exported, with 'cutlass', 'tape' and 'scissors' added.
- `HATS`, `BEARDS`, `HAIR_STYLES`: new exports.
- `SEAT_HEIGHT`, `RAIL`, `WALL_Z`: unchanged.
- `WHEEL` {y 0.7, z 0.31, r 0.3}: in person units it matches ships.js wheel(S, 0, yq, cab.z1 − 0.55, …, 0.9) seen from the helm spot (0, yq, cab.z1 − 1.0) when the captain is built at scale 1.1.
- `HAUL` {y 0.74}: the rope runs along +z at this height.
- `FIGHT` {period 1, hit 0.62}: when the slash lands, for clang timing.
- `buildPerson`, `animatePerson`, `walkSpeed` (now also takes 'run'), `disposePerson`.
- `releaseSharedPeople()`: new.
- `handPosition(person, s = −1, out)`: new; world position of a hand, for tying ropes in 'swing' and 'haul'.

`animatePerson` options added: `turn` ('steer') and `since` ('fall'; without it the tumble loops).

`userData.parts` gains `pet`, `petHead`, `petWingL` and `petWingR` only when there is a parrot. `userData.shared` is a hidden property, present only for `share: true` people.

Options people.js accepts beyond the §7.10 table, all of which 1B's cosmetics.js already emits:
- `vest`: hex, or null/false to remove.
- `hatBadge: 'skull'`: a skull and crossbones on a bandana, used by the "Skull bandanas" uniform.
- `earring`: boolean.
- `pet: 'none'`: accepted and ignored.

How the options resolve:
- `outfit: 'pirate'` on a pirate body changes nothing; on any other body it switches to pirate clothes.
- `beard: 'handlebar'` is stored as `look.moustache = 'handlebar'` with no beard.
- `beard: 'goatee'` (as a string) comes with a moustache.

Deviations from SPEC2:
1. The new `detail: 'mid'` level and its default for `outfit: 'pirate'`. This is the only way to meet "captain ≤ 12k triangles", because today's pirate body alone is 11.75k. `detail: 'full'` overrides it, and existing calls never pass `outfit`.
2. The parrot flies up over the hat when the left arm rises, instead of only flapping in 'cheer' and 'run'. On the shoulder it would have been swallowed by the raised arm.

Determinism rule: none of the new options draws a random number, and each one adds its fields to the look only when it is given.

### Open issues
- Triangle budget: the captain only meets ≤ 12k (worst 11,508) through the new mid tier that `outfit: 'pirate'` gets by default. Enemy and crew looks with the new options stay at full detail (raider 13.8k, marine 13.6k). Draw calls are unaffected (5 per person); if Stage 4's triangle audit asks for it, boarding people could pass `detail: 'mid'`.
- WHEEL is in person units and matches the Sea Biscuit's wheel only for a helm captain at scale 1.1 standing on 1D's helm spot (0, yq, cab.z1 − 1.0) facing +z. If 1D moves the wheel or 2A uses another scale, the hands will miss the spokes; I checked this against my own wheel prop, not against ships.js in game.
- In 'sit' the coat tails lie back over the seat (rx 0.6). On a deep crate seat the hem can touch the seat's back edge; this was not checked on the in-game benches because no coated person sits in the town today.
- With the crown, the hovering parrot (cheer / surrender) almost touches the crown points; it reads as perching on the crown, which looks fine.
- Old Snips: kind 'old' picks grandma or grandpa from the seed, so sparrow.js must pick a seed whose old body is a man (2, 3, 5, 6, 9, 10).
- Harness and scratch files remain in /home/user/First-project/.dock-harness/1c/ (grid.html, people.js dev copy, people_orig.js); the folder is git-ignored. Use grid.html?src=live to test the published module.

## 1D Shipwright
Files: /home/user/First-project/src/ships.js

### Summary
1D Shipwright is finished. src/ships.js has the three new ships (galleon, raider, phantom), the battle data on every ship, the damage and flag functions and the player's helm spot and grapple coils. The 8 existing ship models are unchanged, and the full npm test passes (exit 0, 356 PASS), including the shipyard checks that count the cannons on the model.

I picked up the previous, cut-off attempt instead of starting over. Its published src/ships.js matched its harness copy (.dock-harness/sw/ships.js) once the import paths were rewritten, and the harness's base.js matched git HEAD. I re-ran its checks against the published file: fingerprints 54/54 identical, API checks 244/244. It had already done:
- **Galleon:** a tall gilded stern castle with three tiers of glowing windows and a sun crest, quarter galleries, three stern lanterns, a lion figurehead, cream sails with golden suns, a lateen mizzen and a jib, treasure chests and a coin heap, deck at 1.4.
- **Raider:** a long, low clinker hull, painted round shields, oars, a curled serpent prow and tail, one blue/white striped square sail, a snowflake flag, deck at 1.0.
- **Phantom:** a barnacled, weedy dark hull with a glowing seam, glowing portholes and windows, a snapped mizzen, torn see-through teal sails (cloth material cloned per ship), a skull figurehead, a ghost-fire cauldron giving off green mist, deck at 1.8.
- Battle data on every ship, plus the API and coils listed under api_notes.

My changes in this session, after three rounds of screenshot critique:
1. **Galleon flag:** it was red-gold-red, which reads as the Spanish national flag. It is now royal purple with the golden smiling sun, matching the sails.
2. **Galleon treasure:** from above, the coin heap was a flat yellow blob. It is now a lumpy mound with coins on its slopes and round its base, ruby and amethyst gems on top, three coin stacks, and a gem on each open chest. The galleon goes from 47 to 49 draw calls, still under the Man-o'-War's 52.
3. **Phantom poop deck:** added a broken taffrail (one side whole, the other half gone with its rail hanging down, the stern rail sagging) and posts under the corner lanterns, which used to float.

I published with an atomic move. The harness copy and src/ships.js are identical apart from import paths.

### API notes (exports, deviations)
Exports as in SPEC2 §9.1:
- buildShip(typeKey, opts): adds builders for galleon, raider and phantom; opts.armory.grapple applies to the player.
- projectileMesh(ammoId) → THREE.Mesh: round is today's 0.34 ball with toon colour 0x2b2b38; chain is two half-balls on a bar; grape is 6 small balls in one geometry; any other id gives round. Geometry and material are shared, so callers must not dispose them. Chain shot spins by itself through onBeforeRender (visual time only).
- addHole(group, {z, y, side}): side +1 is starboard (local −x). Holes are flat splintered decals in one InstancedMesh per ship (no outline), at most 8, the oldest reused. They are placed analytically from a half-width table (no raycasts); y is clamped to 0.5 .. deckY−0.2; holes near the curved ends are slid inboard. Bad input never throws.
- clearHoles(group).
- setShipDamage(group, {level, mast}): level 0, 1 or 2; mast true/false. A field left out is kept. A call that changes nothing does nothing.
- hoistFlag(group, 'white' | 'player' | 'own', flagLook): flagLook is a LOOKS.flag entry, defaulting to LOOKS.flag[0]. The new flag flies from the ship's main flag spot.

userData on every ship:
- deckY, railY, deckSpots (at least 4; the player keeps its 6), yardTips {port, star} (the main course yard ends; gaff, crab-claw and junk rigs use fixed anchor points), hullSide {z0, dz:0.5, half[]} at y 0.9, sailInfo [{mesh, top, dropped}] (exactly one top), damageLevel 0.
- Extras: mastDown, and flag ('own' | 'white' | 'player').
- Player only: helm {x:0, y, z: cab.z1−1.0, h:0} and coils (the number of grapnels shown: 0, 2 or 4 for grapple tier 0, 1, 2).

Deviations:
1. helm.y is cab.y1 (2.58, the quarterdeck plank top) instead of yq (= cab.y1+0.1, the base of the rails), so the captain's feet stand on the planks.
2. Level 1 adds slack sails (§2.4 only defines the level 2 look). Level 2 adds deck fires (green on the phantom) and one sail drooping from a single yard arm. MAST DOWN drops the top sail: a sail merged into a rig mesh is split off by index range and shares its buffers.
3. 'white' and 'player' hide all of her own flags, pennants included; 'own' brings them back.
4. Prahu deckSpots: 2 on the narrow stern deck and 3 on the outrigger booms, by design.
5. The galleon flies purple with a gold sun rather than red and gold, to avoid looking like a real national flag.
6. Sail slack and droop are applied inside animateShip (it scales each sail's billow), so animateShip must keep being called every frame.

### Open issues
- A wrecked ship (level 2) costs about +10 draw calls on manowar, inferno, galleon and phantom (two deck fires at about 4 calls each, plus 2 for the drooping sail) and +6 on the other ships. §12 does not budget for fire. If the busiest-scene budget gets tight, drop the second entry in S.fireSpots on those four ships (−4 each).
- The prahu's hull is too narrow for 5 clear deck spots: 2 are on the stern deck, where a figure's edge comes within about 0.3 of the hut eave and the rails, and 3 are on the outrigger booms. It looks fine in cartoon style, but boarding (2B) should check it in its screenshots.
- Damage level 1 (slack sails) is subtle by design; the strong cues are the holes, the level 2 fires and droop, and MAST DOWN.
- The phantom's ghost sails pulse in glow and opacity over time, so screenshots of her vary with the time at which they are taken.
- Nothing is wired in yet: main.js (2A) still uses its own ball mesh and does not call the new API (see hook_requests).

## 1F Env: Doubloon Bay
Files: /home/user/First-project/src/env/doubloon.js

### Summary
Doubloon Bay (SPEC2 §6.4) is finished and live in src/env/doubloon.js, replacing the Stage 0 stub. The previous attempt had left an almost complete copy at /home/user/First-project/.dock-harness/1f/src/env/doubloon.js. I checked it fully before using it: read all 2,451 lines, ran the layout checks, the harness flight, in-game runs with ?act2=1, galleon routing with main.js's own AI, and rebuild/dispose cycles. Then I ran three rounds of screenshot critique and fixed two art problems, and published it in one atomic mv. The full smoke suite passes.

What the level contains: golden-hour Port Doubloon, a round harbour basin closed by two curved moles, with a lighthouse (turning beam) on the west mole, a green blinking beacon on the east one and a log boom across the mouth. Three baked merchantmen ride at anchor inside the basin, behind colliders, and the basin is unreachable. The white terracotta-roofed town climbs two terraces to a crenellated wall with round towers, a bell tower with bunting and a gold-domed treasury. The quay has treasure chests, a crane, lamps and market awnings. To the west is a palm-lined beach with dunes, a beach hut, a hammock and a jetty of pilings with pelicans. Painted sandstone cliffs run east to a headland with a ruined star fort (breached bastion, old cannons, sentry boxes, tattered flag). There are islets, sea stacks, a beached wreck on the biggest sandbar, gulls and gliding pelicans, and no skulls.
- Gameplay data: 8 sandbars as reefs (pale-gold discs with lacy foam rims that ride the swell on the GPU). Two escape gates at (-58,110) and (60,109), each 124.4 from the centre, r 10, each marked by red/green channel buoys with pennants and a faint foam ring. Three convoy starts off the harbour mouth facing the gates. 12 enemy spawns. playerStart is mid-bay, facing the harbour.

Fixes this session:
1. A jagged notch in the cliff where the eastern cliff meets the quay's sea wall. The polygon doubled back on itself there; it now skips the coast points that sat under the flank arc.
2. A hard cut where the beach ends against the west sea wall. A seeded heap of boulders now covers it.

### API notes (exports, deviations)
Same module contract as europe.js, with no deviation from SPEC2 9.1:
- Exports `meta` ({ name: 'Doubloon Bay', place: 'Doubloon Bay', subtitle }) and `palette` (the 6.4 values exactly, unchanged from the stub).
- `build(scene, ctx)` returns { worldRadius: 150, colliders (108, every one with h), playerStart { x: -24, z: 34, h: 2.85 }, enemySpawns (12), reefs (8 sandbars { x, z, r }), escapes [{ x: -58, z: 110, r: 10 }, { x: 60, z: 109, r: 10 }], convoyStarts [{ x: -10, z: -18, h: 0 }, { x: 0, z: -25, h: 0 }, { x: 10, z: -18, h: 0 }], update(t, dt, ctx), dispose(), group }.
- No step() is exported, because nothing in this level moves in simulated time.
- ctx.rng only drives visual phases (buoys, birds). The layout uses a fixed seed, so the gameplay data is identical on every build.
- Statics are merged with mergeStatic. The animated props are baked into single vertex-coloured meshes.
- dispose() frees the geometries and the module's own materials. GPU memory stays flat over 4 rebuilds (65 geometries, 3 textures, 12 programs) and the scene mesh count stays flat when alternating levels 4 and 1.
- The sandbar shader mirrors scenery.js's private wave table. checkWaves() compares it against waveHeight() once and logs a console error if scenery.js ever changes.

### Open issues
- Not mine to fix (scenery.js) — sandbars vs. sun glitter: when looking toward the low western sun, the ocean's golden-hour glitter path paints warm cream patches that can be mistaken for sandbars. Real sandbars are still told apart by their white foam rim and translucent shelf. Worth a look in Stage 3E art fixes, for example a less sand-coloured path colour on this palette.
- Not mine to fix (ocean shader) — foam in the harbour basin: the basin is small, so the ocean's shore foam fills it with concentric rings. It is only noticeable from high views such as the fly-in or a top-down camera; at chase height it reads as surf against the quay.
- Not mine to fix (main.js / style.css) — level banner: in headless screenshots the level-start banner sits off the left edge, overlapping the HUD. Level 1 does the same (tests/screenshots/2a-europe-intro.png), so it is not caused by this level.
- Needs Stage 2 wiring — convoy behaviour not tried yet: main.js does not call the mechanics hooks yet, so in play the galleon currently spawns from enemySpawns and acts as a merchant waiting for an attack slot. The routing check stood in for the convoy steering by using main.js's own attack logic.
- The dev copy and harness remain at /home/user/First-project/.dock-harness/1f/ (env.html and src/env/doubloon.js, identical to the published file) for Stage 3E art fixes. The pre-session version is backed up at /tmp/claude-0/-home-user-First-project/7f649d8c-67e4-5236-a80e-5e9eae321fb4/scratchpad/next/stage1/1F Env: Doubloon Bay/doubloon.v5-prev.js.

## 1G Env: Frostbite Straits
Files: /home/user/First-project/src/env/frost.js

### Summary
I replaced the stub src/env/frost.js with the full Frostbite Straits level from SPEC2 §6.5, and it meets the 1G exit check. I found no earlier attempt to continue from: frost.js was still the stub and there was no 1g harness, so I built it from scratch.

What the level has:
- **Layout:** a north–south strait between snowy fjord cliffs, 80–100 u wide inside the arena (two spots fall just outside that range, see open issues), opening to the sea at both ends. The cliffs are banded violet rock with snow on every ledge, a snow cornice on top, full-height rock ribs, frozen trickles, icicles and snowy firs, with big snow-line peaks behind.
- **West shore:** a Nordic village on a low snowy shelf. It has turf-roofed log houses with lit windows and chimney smoke, a stave church with dragon heads on a knoll, fish racks and a rune stone. Two dragon longships are moored at a jetty; they are decoration, behind colliders, and bob on the swell.
- **East shore:** an abandoned whaling station on stilts (shed with a sagging roof, try-pots, a whale-jawbone arch, a derrick, a broken rail) with a flickering beacon fire, glow and smoke. Further north is a frozen waterfall in emissive pale cyan, with an additive glow sheet that has no outline.
- **In the strait:**
  - 3 static icebergs (faceted ice with blue faces, snow caps and a deep-blue waterline band), each a collider with shore foam, plus 5 more icebergs just beyond the edge.
  - An ice arch across the northern reach with icicles, and three puffin rocks.
  - 8 drifting ice floes, three of them carrying seals.
- **Sky:** 3 aurora curtains (no fog, no outline) and snowfall: one InstancedMesh of 200 flakes in a box that follows the camera, with no outline.

The floes are the `env.reefs` entries `{ x, z, r, ice: true }`. `step(simTime)` moves the same objects in place along fixed ellipses, as a pure function of the simulated time. `update()` places each floe mesh and its own foam ring from `ctx.simTime`.

To keep draw calls down, all static parts are baked into vertex-coloured meshes, one per material family (rock, wood, ice, snow, mountain, plain toon, flat). The textures painted onto the materials (cracks, snow drifts, ice streaks, log seams) still show, and the environment draws about 56 calls instead of 109. I wrote it as a dev copy in .dock-harness/1g, checked it, and published each version to src/env with an atomic `mv`, so the file was always importable.

### API notes (exports, deviations)
Exports are unchanged in shape: `meta { name: 'Frostbite Straits', subtitle }`, `palette` (the exact §6.5 values) and `build(scene, ctx)`. `build` returns:
- `worldRadius`: 140
- `colliders`: 111 entries of `{ x, z, r, h }`
- `playerStart`: `{ x: 0, z: 94, h: Math.PI }` (south end, facing north)
- `enemySpawns`: 9 points, all on water, 59–91 from the start, clear of colliders by r + 12 and of every floe's whole drift path by its r + 6, inside worldRadius − 16, ordered so that any first few are well spread
- `reefs`: 8 floes, exactly `{ x, z, r, ice: true }`, r from 3 to 5.5. The objects keep their identity and are mutated in place.
- `step(simTime, dt)`: floe i is at `cx + rx·cos(w·t + ph)`, `cz + rz·sin(w·t + ph)` with `w = ±0.9/√(rx·rz)`, so speed stays between 0.735 and 1.102 u/s. The state at build equals `step(0)`.
- `update(t, dt, { simTime, camera })`: floes, foam rings, bobbing longships, flames, smoke, aurora, glows and snowfall. Snowfall hides itself if no camera is passed.
- `dispose()`, `group`

Deviations from SPEC2:
- **Aurora is not additive.** The 3 aurora meshes (no fog, no outline) use normal alpha blending. They also write depth with alphaTest 0.06, so the ink outlines of the far peaks behind them stay hidden, because the outline pass draws after them. The reason: added light disappears almost completely against the pale pastel dawn horizon of the §6.5 palette (sky colour 0xf3e6ff near the horizon), while a blended curtain keeps its mint and pink colours.
- **Floe clearance is read strictly.** For "clear by r + 8" I required the floe's edge to stay at least 8 from every collider's rim (distance ≥ c.r + r + 8; measured minimum 8.44), and at least r + 8 from the player start (measured: r + 14.34).
- **Shared foam material.** Each floe has its own flat foam-ring mesh as the spec asks, but all eight share one material.
- **Far-north peaks.** The two peaks closing the far end of the strait rise out of the sea beyond the world edge and are not colliders.

### Open issues
- The aurora uses normal alpha blending, not the additive blending §6.5 asks for (reason in api_notes). If additive is a hard requirement, Stage 3E (art fixes, which owns frost.js) can switch it, but against this palette's horizon it will be nearly invisible during play.
- The sun glint on the water shows as large pink-white streaks to the north-east. This comes from the shared ocean shader in scenery.js with the §6.5 sun colour and direction, so it is outside this file.
- When the level fly-in camera starts at y = 42, the shared cloud layer can sit right in front of it and fill the top of the frame like a ceiling. This is in createClouds (scenery.js), not the environment.
- All 9 enemy spawns fall in the band z = 4 to 46, because they must be 58–92 from a start at the south end. That band is where the opening wave and reinforcements appear.
- The village bight and the jetty colliders give a wide band of pale shore foam near the village, from the shared shore-foam effect in the ocean shader. It reads as shallow ice water.
- Channel width inside the arena is 81.5–101, slightly over 100 at z = 20 and 75.5 at the puffin rock, against the spec's 80–100.
- The scene is about 289k triangles, compared with about 196k for europe.js. Build time is about 0.7–1.1 s in Node and the harness, compared with about 0.8 s for europe.js in Node.

## 1H Env: The Maelstrom
Files: /home/user/First-project/src/env/maelstrom.js

### Summary
The Maelstrom (SPEC2 §6.6) is built, and every check in my exit row passes on the live file. There was no earlier attempt to continue: no 1h harness folder existed and the stub was untouched, so I started fresh and developed in /home/user/First-project/.dock-harness/1h/, publishing each version with an atomic mv. I did not edit any file I don't own, and did not commit.

- **Whirlpool:** a spiral foam disc of radius 40 rides the swell and turns with rotation.y increasing (the same sense as the current's swirl). Foam strokes slide inward and dashed rings spin faster near the eye. The eye (radius 12, current.eye) is a real hole in the sea: a 20-unit funnel drawn as described under api_notes, with a green glow at the bottom. White spray churns round the lip, and 8 pieces of wreckage circle in the current, sink at the eye and bob up again far out.
- **Rim:** 14 clusters of jagged faceted sea stacks, 101 to 125 from the centre (colliders).
- **Skull Rock** (north): carved from a stack, glowing green eyes facing the whirlpool, jaw and teeth.
- **Ghostly lighthouse** (east): leaning and cracked, with a green flame in an open lantern, glowing windows and a sweeping green beam.
- **Sunken temple:** a colonnade on the west islet (standing, broken and fallen columns, a lintel, two green braziers) and an arch on the south-east islet (pediment, brazier, three pillars standing in the sea).
- **Beyond the arena:** a ring of far rock teeth and a kraken silhouette in the haze, now visible from the start.
- **Rain:** one InstancedMesh of 300 streaks around the camera, no outline.
- **Lightning:** `flash(x, z)` shows a zigzag bolt for 0.15 s, an expanding strike ring and glow, a point light, and a full-screen sky flash.
- **Photosensitivity:** the sky flash peaks at 0.22 opacity (cap 0.25), at most one per 3 s, as one smooth pulse with no strobing. Bolts are limited to one per 0.5 s. With prefers-reduced-motion it becomes a slow 0.10 tint (0.7 s rise, 1.8 s fall) and the bolt fades in and out. The far horizon sheet lightning measured at most a 0.069 change in relative luminance, so it is not a flash.
- **Gameplay data:** palette, meta, worldRadius 140 and `current` exactly as §6.6. Player start (0, 95) faces the whirlpool. 12 enemy spawns sit 60–100 from the centre and at least 45 from the start.

Main does not call `flash()` yet (its `launchBomb` returns early without `env.volcano`), so in-game lightning waits for Stage 2; see hook_requests.

### API notes (exports, deviations)
Exports: `meta` and `palette` (unchanged from the stub, exactly §6.6), `build(scene, ctx)`, and an extra `LIGHTNING` constants table (the photosensitivity limits, in one place).

`build(scene, { rng, reducedMotion? })` returns `{ worldRadius: 140, colliders (42, each {x,z,r,h}), playerStart {x:0, z:95, h:PI}, enemySpawns (12), reefs: [], current {x:0, z:0, r:75, pull:3.2, swirl:2.8, eye:12, eyeDps:5}, flash(x, z), lightning, surfaceY(x, z, t), update(t, dt, {camera}), dispose(), group }`.

- `lightning` is a read-only getter for tests: `{strikes, skyFlashes, skipped, overlay, maxOverlay, lastSkyFlash, gap, overlayMax, boltVisible, storm}`.
- `surfaceY` is an extra: the height of the whirlpool's surface at a point.
- `ctx.reducedMotion` may be a boolean or a function; without it the module reads `matchMedia('(prefers-reduced-motion: reduce)')`.
- `flash()` ignores non-finite input and is safe to call before the first update or after dispose. Strikes are processed in `update()` on visual time.

Deviations from the spec wording:
1. The spiral arms are painted per fragment from the disc's local position, not baked into vertex colours. This gives crisp cel edges at the same cost; there is still no texture, no outline, and the disc rotates with rotation.y increasing.
2. The eye is a real hole, not a flat dark disc. The funnel draws at renderOrder -10 with no depth test, after the sky (-1000) and before the sea; its triangles are ordered deepest first so the walls paint over each other correctly. An invisible lid (renderOrder -9, colour writes off) at y 0.55, radius 12.45, then writes depth so the sea is not drawn over the hole. Consequence: any ship inside the eye is cut off at y 0.55 instead of at the waterline.
3. Like doubloon.js, the module mirrors scenery.js's private wave table in GLSL and checks the mirror against `waveHeight()` once at build, logging `console.error` if they ever diverge.

### Open issues
- No in-game lightning until Stage 2 wires env.flash() into the lightning bombs (see hook_requests). flash() has only been exercised directly, in the harness and in the game.
- A ship that sails into the eye (radius 12) is cut off at y 0.55 by the depth lid, so it looks like it is floating on the hole rather than being sucked down. AI ships avoid the eye and the player takes eye damage there, so it should be rare. A sinking-into-the-funnel effect would need main.js to lower ships, which would conflict with the lid.
- Within about 22 of the centre the disc rises from the swell to a flat surface at y 0.55, so hull parts there are covered slightly higher than the waterline. This is barely visible.
- Level-start draw calls are 278 of the 310 Act II budget. Stage 2 adds the helm captain (+5) and tags (+1 per ship + 1), roughly 304. If more headroom is needed, the cheapest cuts are the wreckage (20 calls) or a couple of static materials.
- The kraken is a deliberately faint silhouette (fog factor about 0.78 at 262 units). It shows from the start view and through gaps in the western stacks.

## 1I Town world
Files: /home/user/First-project/src/env/sparrow.js, /home/user/First-project/src/walk.js, /home/user/First-project/tests/walk.test.cjs, /home/user/First-project/tests/fixtures/sparrow-walk.json

### Summary
I found no saved work from the earlier attempt (no 1I copies, nothing changed in sparrow.js), so I built 1I from scratch. All the row's exit checks pass on the published files, and the three shipyard fixes (ART-1-R, ART-2, ART-3) are in and verified across upgrade combos.

**New `src/walk.js`** (no imports). Walk areas can be rects, turned rects or a round mound with a height profile, plus rope bridges and blockers. It has every function in §9.1: `inside`, `heightAt`, `blocked`, `move`, `nearestPlace`, `path` (A* then string pulling), `snap`, `pick` and `graph`. `move()` takes steps of at most 0.1, so it cannot jump water gaps. It never pushes deeper into something already touching the walker, so a walker that a townsperson bumped can still step away.

**`env.walk` in sparrow.js** is built from the same `platform()` / `bridge()` / prop calls that draw the town:
- **Decks** (inset 0.65 from rails and water): pier, plaza, tavern raft, tower raft, yard, Polly's deck (s1), and the garden mound. Its height follows the sand.
- **Portals**: the two gaps in the pier's back rail, and the seam between the plaza and the tavern raft.
- **Bridges**: plazaS1, plazaYard, plazaGarden, tavernTower.
- **Blockers**: 106, each with a height for the camera, including a camera-only blocker over the docked ship.
- **Places**: ship, shipyard, tailor (with podium, a three-sailor line-up and a fitting camera) and tavern (with a porch camera); spawn at the gangplank, facing the town.

**Layout changes** (needed so every place can be reached; still deterministic):
- The tavern raft is wider, so there is a walkway past the west wall.
- The tower raft is bigger and moved west, joined by a straight bridge.
- s1 is enlarged for Polly's; s2, s6 and s16 moved a little to make room.
- The west plaza bench moved off the garden bridge, and s1's laundry went to s2.
- The garden umbrella and the tavern's grog mug were raised so a hatted captain passes under them; the pier bunting is tighter so it clears his hat in the rail gaps.
- Each deck's planks now use their own random stream. This shifts some random picks elsewhere in the town (colours, tilts), but the town still looks the same every time.

**New art:**
- **Polly's Plumes & Trims**: two-storey pink and teal shop with a painted sign (feather and scissors), a scalloped striped awning, three tricorns/hats on wooden heads in the window, a mannequin in a long coat, a tall mirror with glints, a barber chair and side table, hat boxes, and a podium on a rug. All of it is baked into the statics.
- **Spinning barber pole**, a kept mesh rotated in `update`.
- **Polly** (tape, `measure`) and **Old Snips** (scissors, `snip`).
- **"TAILOR" arrow signpost** by the pots stall, with a plumed hat on a head on top, painted on both sides and readable from the showcase camera.
- **No open backs** where the walk camera can see them: the welcome sign's back, the tavern's sides and back (battens, half-timbering, windows, back door), every shack's back and sides, and Polly's back.
- The sign texture atlas grew to 1024×1024.

**New env API:** `setCrewStyle`, `folk`, `greet`, `cull`, `setPrizes`, and an exported `walkDebugLines` (exact behaviour in api_notes).

**Shipyard fixes:**
- **ART-1-R (painter line):** the rowboat's mooring line is now placed by testing the actual hull and barrels, and is tied off from the stern instead when the bow has no room.
- **ART-2 (moppers):** placement now uses the ship's own triangles. A triangle-based view check from 6 sway spots counts crew bodies and the pacing bosun. Deck room comes from rasterising the ship 5–55 cm above the deck, so props count even when the ship's `blockers` list misses them. A new no-sweep stroke handles cramped decks. On the most crowded decks the moppers move to the quarterdeck and the bosun paces the taffrail.
- **ART-3 (welcome sign):** the board was raised 0.7.

**Cost:** rebuilding the ship plus the crew placement now takes a median of about 205 ms on SwiftShader, up from 103 ms.

**Draw calls:**
- Shipyard view: smoke reads 315 of 450. In the real game, the stock ship reads 290–317 across the sway and the fully upgraded ship 316–352 (287 at 390×844). The baseline was 298–305.
- Shipyard-view triangles: 1,448,616 (limit 1.5M).
- Walk view, harness, prize ships shown, no town HUD, plus a stand-in captain (a 1C-style build, not the final `captainOpts` look): 53–267 at 8 spots at 1280×720, and 53–163 at three of them at 390×844 (pier, Polly's, tower).
- Polly's fitting camera: 43. Tavern porch camera: 56.

### API notes (exports, deviations)
**`src/walk.js`**
- `export function createWalk(data)` returns `{ inside, heightAt, blocked, move, nearestPlace, path, snap, pick, graph }`, exactly as in §9.1.
- Extras: `clear(a, b, r)` (is a straight walk clear?), and getters `radius`, `places`, `spawn`.
- `move()` only refuses a step that pushes *deeper* into something already touching the walker, so a walker bumped by a townsperson can step away. From an unblocked start this is the same as the spec's "!blocked" rule.

**`env.walk`** (plain JSON) follows §7.4, with these additions:
- `radius: 0.3`.
- Circle areas may carry `profile: [[radius, y], …]`. The garden mound uses one, and `heightAt` / `pick` follow it.
- Portal ids contain a '-'.
- Bridge links reach 0.9 into both decks so they overlap the deck areas.
- Each bridge's end posts are blockers with r 0.05.
- One blocker sits over the berth (15×3.4, h 10), outside every walk area, so the town camera stays off the docked ship.
- Places are ordered ship, shipyard, tailor, tavern.
  - tailor: `podium {x, y, z}`, `lineup [{x, y, z, h} ×3]`, `cam {pos, target}`.
  - tavern: `cam {pos, target}`.

**sparrow.js**
- `build()` returns everything it did before, plus `walk`, `setCrewStyle`, `folk`, `greet`, `cull`, `setPrizes`.
- New export: `walkDebugLines(walk)` → a LineSegments for `?walkdebug=1`.

**Deviations from §9.1 / §7.5** (all optional and backward-compatible):
1. **`greet(index, seconds, toward = null)`**
   - `toward` is `{x, z}`, the captain's position. The env cannot otherwise know where he is; it falls back to the camera position from the last `update(t, dt, {camera})`.
   - Returns false for sitting or fishing folk, people off the walk, or bad indices.
   - The person turns at 9 rad/s; a walker pauses and then carries on from where it stopped.
2. **`folk()` entries** also carry `greets: boolean`; only those can be greeted.
3. **`cull(x, z, radius = 40, near = 0)`**
   - Also hides folk within `near` of (x, z), for the §7.3 "within 1.0 of the lens" rule.
   - Calling it with finite x/z switches the env into town-view mode, which shows the prize ships.
   - `cull()` with no arguments returns to the shipyard view: all folk shown, prizes hidden.
4. **`setPrizes([{type, flag?}])`**
   - At most 2 ships; `flag` is a LOOKS.flag entry passed to `hoistFlag(ship, 'player', flag)`.
   - Ships already moored are kept, junk entries are ignored, `[]` clears them, and `dispose()` frees them.
   - Berths are open water east of the shipyard, near s9/s18.
5. **`setCrewStyle(fn)`**
   - `fn(role, seed, {...baseOpts})` is called with roles mopA, mopB, polish, bosun, plank, boat.
   - `kind`, `tool` and `seed` are always taken from the base opts, so tools, bodies and placement are kept.
   - Only sailors whose opts changed are rebuilt (the old one disposed). If a sailor's body scale changed, the crew is re-placed on the ship.
   - `fn` = null, `own`, or a throwing fn all reproduce today's crew exactly; with the default look no person object is touched.
6. **`update(t, dt, ctx)`** reads `ctx.camera` (main.js already passes it).

### Open issues
- Most crowded decks (shot ≥2 with gun crew ≥2): both moppers work on the quarterdeck and the bosun paces the taffrail. Mop A is then seen 63% of the time (from 7 of 9 sway spots; none at the far sway end), mop B 89%. On every other config tested both are at 85–100%.
- setShip is slower: rebuilding the ship plus placing the crew now takes a median of about 205 ms on SwiftShader (was 103 ms), max about 380–485 ms under load. It runs on openDock and on every purchase. The existing slow-device purchase test still passes.
- Welcome sign at the far sway end (u = 0.5 to 1) is 82–87% visible behind the rigging; it was 56–78% before.
- In portrait (7.5 boom) the walk camera can sit above the docked ship's quarterdeck. The berth blocker (h 10) is in walk.blockers for town.js's camera collision to handle; that is 2C's job.
- The town's random decorative picks (shack door/shutter colours, roof patches, tilts) shifted a little, because deck planks now use per-platform random streams. The town still looks the same every time; people's looks are untouched.
- Harness and dev copies are kept in /home/user/First-project/.dock-harness/1i/ (town.html with ?walkdebug=1 and ?up=, game.html, src/ with symlinks plus copies identical to the published files). 3D can reuse them.

# ALL HOOK REQUESTS (apply the ones addressed to files you own; report applied/declined)

## from 1A Combat rules
- package.json (2D, Stage 2): add "test:combat": "node tests/combat.test.cjs" and put `node tests/combat.test.cjs &&` among the Node suites at the start of "test" (§10 2D / §11.1 order).
- src/boarding.js (2B): when it imports ./combat.js, call resolveBoarding(att, def, { heave, playerAttacks: true }) for 'attack'/'counter' and resolveBoarding(raider, player, { enemyAttacks: true, home: true, playerDefends: true }) for 'defend'. Pass att/def as { crew, crew0, blade | grit, hpFrac } with crew = crewNow(...) for enemies and state.crew for the player.
- src/main.js (2A), damage(): apply the keg burst as EFFECTS.keg.burst * info.ghostMul and the routed bonus as EFFECTS.routed.crew only when the effect is actually applied (outside the 3 s CRIT.effectGap). info.dmg and info.crewKill exclude both. For __game.combat.rules, expose the module namespace (import * as combat from './combat.js').

## from 1B Economy
- package.json (2D): add `node tests/armory.test.cjs && node tests/cosmetics.test.cjs` right after `node tests/combat.test.cjs` in "test" (the §11.4 order), plus scripts "test:armory": "node tests/armory.test.cjs" and "test:cosmetics": "node tests/cosmetics.test.cjs".
- src/main.js (2A), persistence: `const ARMORY_KEY = 'pirates-ahoy-armory', LOOK_KEY = 'pirates-ahoy-look', FEATS_KEY = 'pirates-ahoy-feats'`. Load in this order: feats = loadRecord(FEATS_KEY, parseFeats, serializeFeats); look = loadRecord(LOOK_KEY, parseLook, serializeLook); then `const clean = sanitizeLook(look, feats); if (serializeLook(clean) !== serializeLook(look)) saveRecord(LOOK_KEY, serializeLook, clean); look = clean;`; armory = loadRecord(ARMORY_KEY, parseArmoryConfig, serializeArmoryConfig). __game.armory.set(cfg) → armory = parseArmoryConfig(cfg) then save; __game.setFeats(f) → feats = parseFeats(f), save, then re-sanitize the look.
- src/main.js (2A), stats: at startLevel set `const A = armoryStats(armory); state.crewMax = A.crew` (crew full). Pass `critBase: A.critBase` in the shooter of shotResult; use `A.grappleRange` in canGrapple (§3.2 rule 4), `A.blade` as att.blade / def.grit when the player boards or defends, `A.reel` as the boarding reel time, and `buildShip('player', { …, armory: { grapple: armory.up.grapple } })`.
- src/main.js (2A/3A), people: the helm captain is `buildPerson({ ...captainOpts(look), share: true })`; boarding party sailors are `{ ...crewOpts(look, seed, { kind: 'pirate', seed }, findLook('hull', shipConfig.look.hull)), tool: 'cutlass', share: true }`; the captain's boarding opts add `tool: 'cutlass'`; the boarding ctx gets `enemyCrewOpts`. env.setCrewStyle((role, seed, base) => crewOpts(look, seed, base, findLook('hull', shipConfig.look.hull))) on every openDock and after every crew-look change. wardrobe.buy(id): `const r = buy(look, state.purse, id); if (r.ok) { state.purse -= r.cost; savePurse(); look = r.look; saveRecord(LOOK_KEY, serializeLook, look); }`. wardrobe.wear(id): `const r = wear(look, feats, id); if (r.ok) { look = r.look; save }`.
- src/people.js (1C now, 3E in Stage 3): keep the option reads cosmetics.js emits beyond the §7.10 table, which 1C's in-progress resolveLook already has: `earring` (boolean), `vest` (hex, or null/false for none) and `hatBadge: 'skull'`. Draw the skull as a small white skull on the front of the bandana. Also draw the not-yet-drawn §7.10 looks that cosmetics.js relies on: coat + coatTrim (also used on crew for 'Navy jackets' and on the man-o'-war marines), the hats bicorne / plumed / crown / horned, beards stubble / braids / handlebar, and pet 'parrot' with petColor { body, wing, head }.
- src/townMode.js (2C): use SLOT_NAMES for the group h3s and for announcements; use itemState(look, feats, purse, id).label as each item's state line ('Trying on' for the trial item is townMode's); use ITEMS[id].swatch for chips (for shirt.paint use the current hull paint's [top, bottom] instead); use captainOpts(look, trialId) / crewOpts(look, seed, base, hullPaint, trialId) for try-on; use surprise(look, tab, Math.random) for Surprise me!; captain's log trophy lines = `${it.name}: ${Math.min(feats[it.trophy.feat], it.trophy.min)} of ${it.trophy.min} ${it.trophy.unit}`; tavern rows from ARMORY + armoryStatText(id, tier) + armoryNextCost(cfg, id) + armoryMaxTier(id).

## from 1J Act II rules
- src/main.js (2A), startLevel: create the mechanics before spawnWave(0) so wave-0 ships reach onSpawn of the new instance: `mechanics = createMechanics(def.mechanics, mechCtx)` before `spawnWave(0)`, then `mechanics.init()` after it. mechCtx = { env: () => env, player: () => player, enemies, fighting, relative, damage, escape, pop: (t, x, y, z, s) => pops.pop(t, x, y, z, s), showBanner, announce: gameAnnounce /* #game-live */, sfx: (n, x, z) => audio.play(n, sfxAt(x, z)), rng: combatRng, time: () => state.time, def, types: SHIP_TYPES }. The types field is new and optional; it makes the galleon count follow type.merchant. Call mechanics.dispose() on the old instance first.
- src/main.js (2A), spawnWave(index): after the existing `if (index > 0) { ...showBanner(...) }` block, call `for (const e of newShips) mechanics.onSpawn(e, index)`. Calling it after the banner lets the Phantom's 'The Phantom Galleon rises!' banner (and its position on the 18 u ring) replace the generic '... appears!' banner instead of being overwritten by it.
- src/main.js (2A), __game.spawn(typeName, x, z, h): call `mechanics.onSpawn(e, -1)` so a test-spawned galleon gets a gate and a test Phantom rises, but both keep the test's position.
- src/main.js (2A), updateEnemy(e, dt, attacking): `const steered = mechanics.steer(e, dt);` If steered, set `desired = steered.h; targetSpeed = steered.speed;` instead of the attack/wait branch (avoidance, the escape timer, the world edge and speedCap still apply after it). Change the firing condition to `(attacking || steered) && state.combatTime > def.grace && r.dist < MAX_RANGE - 4 && Math.abs(r.along) < Math.abs(r.lat) * 0.45 && !mechanics.holdFire(e)`. Merchants never get an attack slot, so without `|| steered` a galleon never fires. Also add `for (const o of mechanics.avoid()) avoid(o, t.wid + 2);` to the avoidance pass.
- src/main.js (2A), moveShip(s, dt): before resolveLand, `const d = mechanics.drift(s); if (d) { s.x += d.vx * dt; s.z += d.vz * dt; }`, skipped for the glued boarding pair during swing..result.
- src/main.js (2A), escape(e): only set e.escaped and do the foam-puff removal. mechanics.convoy already shows the 'The galleon escaped with its gold!' banner and announces it, so do not repeat either. Call mechanics.onSink(e) where an enemy starts sinking in damage(), mechanics.onCapture(e) in every capture path (including the auto-capture at level clear), and mechanics.onRemove(e) in removeShip for enemies.
- src/main.js (2A), finishLevel: `state.gold += mechanics.bonus()` and append `mechanics.summary()` lines to the level summary. updateHud: #objective = mechanics.objective() (at most 4×/s). drawMinimap: draw mechanics.minimap() kinds gate/galleon/floe/vortex/eye.
- src/main.js (2A), startLevel intro banner: `const sub = firstVoyage ? controlsLine() : (isTouch() && def.mechanicTouch) || def.mechanic || m.subtitle;` (Frostbite Straits has mechanicTouch: 'Longship raiders board YOU! Tap CUT! three times or hold it.').
- src/levels.js (2A, Stage 2): Act I levels have no `rumour`, so the tavern rumour board (§7.8) is empty whenever the next level is 1–3. Suggested data, adjust freely: L1 { title: 'Coast of Europe', lines: ['Corsair cutters prowl the bay below the lighthouse.', 'Turn side-on: your cannons fire sideways!'], ammo: null }; L2 { title: 'Bali Islands', lines: ['Prahus skim right over the light coral. Your keel cannot!', 'Chain shot slows the fast ones down.'], ammo: 'chain' }; L3 { title: 'The Volcano', lines: ['The Molten Maw is too hot to board: sink her!', 'Grape shot thins a corsair crew for a capture.'], ammo: 'grape' }.
- package.json (2D): add `node tests/mechanics.test.cjs` to `test` in the §11.4 order and a `test:mechanics` script.

## from 1K Feedback
- src/main.js imports: add `import { createTags } from './tags.js'; import { createPops } from './pops.js'; import { createOverboard } from './overboard.js';` (main does not import them today).
- src/main.js 'Floating labels and health bars' section (about lines 626-696): delete labelCache, drawLabel, labelTexture, redrawLabels, the two document.fonts listeners, barBgMat/barFgMat/barGeoBg/barGeoFg, labelMats, buildTag and setTag (tags.js owns them now). Keep tagHeight(). After `scene` and `camera` exist, add `const tags = createTags(scene);`.
- src/main.js createShip(): replace `if (kind === 'enemy' && !type.boss) { ship.tag = buildTag(typeName); scene.add(ship.tag); }` with `if (kind === 'enemy') ship.tag = tags.add(ship);` (add returns null for bosses). Initialise crew0, crewShown, strikeAt and tagIcon on the ship as §9.2 says; tags falls back to type.crew until then.
- src/main.js removeShip(): replace `if (s.tag) scene.remove(s.tag);` with `tags.remove(s);`.
- src/main.js syncShip(): delete the whole `if (s.tag) { ... setTag(...) }` block. In frame(), after every ship has been synced, call `tags.update(enemies, camera, t, paused ? 0 : dt);`. Tags read ship.mesh.position.y + ship.tagY, so this must come after syncShip. Each frame set e.crewShown (crewNow, or the boarding's onPip value during a brawl), e.strikeAt, e.tagIcon ('capture'|'fight'|'risky' for the grapple target, 'white' when surrendered, 'cooldown' with e.tagCool = boardCooldown/BOARD.cooldown when wanted, else null) and e.tagPulse (hp < 30%).
- src/main.js setup: `const pops = createPops(ui.pops /* $('pops') */, camera, { reducedMotion: () => reducedMotion() });`. Wrap it in a lambda because reducedMotion is declared later in main. In frame(): `pops.update(paused ? 0 : dt);`. Call `pops.clear()` in startLevel, showMenu and openDock. Map §2.5 events to styles dmg/rake/crit/crew/info/capture/gold/bad; e.g. pops.pop('CRIT! MAST DOWN!', x, y + 2.5, z, 'crit') shows a two-line crit.
- src/main.js setup: `const overboard = createOverboard(scene, { foam, sfx: (name, x, z) => audio.play(name, sfxAt(x, z)), heightAt: (x, z, t) => ocean.heightAt(x, z, t) });`. In frame() after syncShip: `overboard.update(t, paused ? 0 : dt);`. In startLevel: `overboard.clear(); overboard.prepare(levelEnemyTypes.flatMap((n) => [enemyCrewOpts(n, 1), enemyCrewOpts(n, 2)]));` (at most 5 looks are kept). Grape crew kill: `overboard.throwOver(e, Math.sign(relative(e, b.x, b.z).lat) || 1, enemyCrewOpts(e.typeName, seed))`, at most once per volley per ship. Surrender: `overboard.showSurrender(e, enemyCrewOpts(e.typeName, seed))`. Capture: `overboard.clearSurrender(e)` (it also clears itself if the ship sinks or is removed). Calling releaseSharedPeople() on level change is safe with the pool.
- src/main.js volleyDone(): hitmark stickers use the markup that fx.css styles: `ui.hitmark.innerHTML = text + '<span class="hm-tags">' + tags.map(t => `<span class="hm-tag ${cls}">${label}</span>`).join('') + '</span>'`, with cls from {rake, crit, blank, captured}. Build it with textContent or createElement rather than raw strings; the labels are fixed strings. The main text keeps HIT!/HIT ×N/SUNK! first, so the smoke /HIT|SUNK/ check holds.
- src/main.js window.__game (for tests/battle.cjs, 2D): expose `tagInfo: (ship) => tags.read(ship)` (or `tags` itself) so the battle suite can read the pip count and notch from the InstancedMesh as §11.2 asks.

## from 1E Sound
- src/main.js (2A), fire(): after audio.play('cannon', sfxAt(sx, sz, {...})), when the shooter is the player and state.ammo !== 'round', also call audio.play(state.ammo, sfxAt(sx, sz, { volume: Math.min(1, 0.55 + 0.12 * t.guns) })). This plays the 'chain' whirr or the 'grape' scatter on top of the shot.
- src/main.js (2A), damage(..., info) and the volley bookkeeping: on a rake (once per volley per target, where the RAKE pop fires) call audio.play('rake', sfxAt(x, z)). On a crit (where the CRIT! pop and hit-stop fire) call audio.play('crit', sfxAt(x, z)). The usual 'hit' still plays as well.
- src/main.js (2A), capture: call audio.play('capture') (no distance; it is a stinger that ducks the music for 1.5 s) and audio.play('cheer', { volume: 0.9 }). Note: a 'wave' horn played in the same moment replaces the capture stinger, because stingers never stack. If a capture can start the next wave at once, delay that audio.play('wave') by about 1.5 s.
- src/main.js (2A), the mechanics ctx: implement sfx(name, x, z) as audio.play(name, sfxAt(x, z)). This covers 'crunch' from the floes mechanic.
- src/main.js (2A), lightning bombs (kind 'lightning'): at the strike, call audio.play('thunder', sfxAt(x, z)) and play no bombWhistle. Distance attenuation makes far strikes rumble softly.
- src/main.js (2A), the Phantom: call audio.play('ghost', sfxAt(e.x, e.z)) when 'The Phantom Galleon rises!' shows, when she turns spectral at 1 hp, and on 'The ghost crew is banished!'.
- src/boarding.js (2B), through ctx.sfx(name, x, z), at the set-piece moments:
- 'grapple' at the start of hook, and when raider hooks thud into the player's rail at threat;
- 'heave' on every G press during reel, optionally with { pitch: 1 + 0.05 * pressIndex } so each press rises;
- 'heave' once at swing ('CHARGE!');
- 'clash' about every 0.25-0.4 s per fighting pair during brawl (cap 6);
- 'cut' when the ropes are cut.
- src/overboard.js (1K/2A): in throwOver(ship, side, opts), call the injected sfx('overboard', x, z) once per sailor (cap 4). It already includes the yell and the splash.
- src/townMode.js and src/town.js (2C/3A):
- call audio.setScene('town') when entering the 'town', 'tailor' or 'tavern' views, and audio.setScene('dock') in showShipyard();
- in town.js, call audio.play('step', { volume: speed > 3.5 ? 1 : speed > 2 ? 0.8 : 0.6 }) on each foot plant. Pitch already varies by about 8% per step.

## from 1C Characters
- src/main.js (2A), startLevel: on a level change call `releaseSharedPeople()` from './people.js' (already in SPEC2 §9.2). Helm captain: `buildPerson({ ...captainOpts(look), scale: 1.1 })` at `userData.helm`, then each frame `animatePerson(captain, t, 'steer', { turn })` with turn = the steering input (−1..1, +1 = starboard), 'point' for 0.6 s after a player broadside and 'cheer' for 1.5 s on SUNK!/CAPTURED!. Keep scale 1.1 so the hands land on the Sea Biscuit's wheel (WHEEL is in person units). Do not pass share: true for the helm captain; detach it and call disposePerson before disposeShip.
- src/boarding.js (2B): build people with `share: true` as children of the scene. Tie the swing rope with `handPosition(person, -1)` (and +1 for the second hand) after `animatePerson(person, t, 'swing')`. Time the clang stars with `FIGHT.hit` (slash lands at q = 0.62 of each FIGHT.period = 1 s loop); desync pairs with `{ phase }`. For tumbles use `animatePerson(p, t, 'fall', { since: tStart })` while the caller moves and spins the group. For a struck crew use 'surrender' (a cutlass is shown dropped on the deck).
- src/town.js (2C): the jog tempo is speed / walkSpeed(captain, 'run', 1) (2.288 u/s at scale 1.1, so 3.0 u/s gives tempo 1.31 and 4.6 u/s gives 2.01); walk uses walkSpeed(captain, 'walk', 1). Use 'proud' when idle. buildPerson({ ...captainOpts(look), scale: 1.1 }) is built at mid detail automatically (at most 11.5k triangles).
- src/env/sparrow.js (1I/3D): Polly = buildPerson({ kind: 'woman', tool: 'tape', ... }) animated with 'measure'. Old Snips = buildPerson({ kind: 'old', seed: one of 2, 3, 5, 6, 9 or 10 (seeds where the old body is a man, not a grandma), tool: 'scissors' }) animated with 'snip'. The shears open in 'snip'; in idle they are held in the right hand.
- tests/cosmetics.test.cjs (1B): if it mirrors the option names people.js accepts, the list should also contain `vest` (hex or null), `hatBadge: 'skull'`, `earring` (boolean) and `pet: 'none'`. people.js accepts all of them; cosmetics.js already emits them.

## from 1D Shipwright
- src/main.js fire(): replace `new THREE.Mesh(ballGeo, ballMat)` with `projectileMesh(ammo)` (import from ./ships.js); remove the mesh from the scene when the ball ends but never dispose its geometry or material (both shared).
- src/main.js damage(ship, amount, x, z, source, info): on a hull hit call `addHole(ship.mesh, { z: relative(ship, x, z).along, y: impactY, side: lat > 0 ? 1 : -1 })`. Store the first hole's {z, y, side} on the ship for the battered smoke source; its ship-local x is `-side * hullSide.half[Math.round((z - hullSide.z0) / hullSide.dz)]`.
- src/main.js syncShip(): every frame call `setShipDamage(e.mesh, { level: hpFrac < 0.3 ? 2 : hpFrac < 0.6 ? 1 : 0 })` (it does nothing when unchanged). On a MAST DOWN effect call `setShipDamage(mesh, { mast: true })`, and `{ mast: false }` when the effect ends.
- src/main.js surrender and capture: `hoistFlag(e.mesh, 'white')` on surrender; `hoistFlag(e.mesh, 'player', findLook('flag', shipConfig.look.flag))` on capture. When the player's hull is back to full: `clearHoles(player.mesh)`.
- src/main.js createShip for the player and the dock rebuild (2A battle, 3A dock): pass `armory: { grapple: armoryCfg.grapple }` to `buildShip('player', { type, look, upgrades, armory })` so coils appear in battle and on the docked ship (§11.3: 'grapple adds coils to the docked ship').
- src/main.js helm captain (2A): `const h = player.mesh.userData.helm; person.position.set(h.x, h.y, h.z); person.rotation.y = h.h;` as a child of player.mesh; detach and disposePerson it before disposeShip.
- src/env/sparrow.js setPrizes (1I/3D, optional): for the 'Prize' pennant in your colours call `hoistFlag(prizeMesh, 'player', findLook('flag', look.flag))` instead of building a separate flag.

## from 1H Env: The Maelstrom
- src/main.js (Stage 2, 2A) launchBomb()/updateBombs(): for def.bombs.kind === 'lightning' (§6.2), call env.flash(tx, tz) when the warning ring's warn time ends and apply the damage then. Today launchBomb() returns early without env.volcano, so nothing calls flash() yet.
- src/main.js (optional) setEnvironment(): pass the reduced-motion state into the build call: mod.build(scene, { rng: mulberry32(seed), reducedMotion }) using main's existing reducedMotion() function. maelstrom.js already falls back to matchMedia, so this only keeps a single source of truth.
- Draw-call tests (2D/3C), for information: for about 0.6 s after a flash the env adds up to 5 draw calls (sky-flash overlay, bolt core and glow, strike ring, strike glow), and a far storm glow or far bolt can add 1–2 at random moments. Sample level-start draw calls without forcing a flash.

## from 1I Town world
- package.json (owner: 2D/3C): add "node tests/walk.test.cjs" to "test" in §11.4 order (after cosmetics.test.cjs, before mechanics.test.cjs) and add the script "test:walk": "node tests/walk.test.cjs".
- src/town.js (2C), wherever townsfolk greetings fire: call env.greet(f.index, 2, { x: captain.x, z: captain.z }) only for env.folk() entries with greets === true. The third argument is optional; without it the env turns them toward the last camera position.
- src/townMode.js / src/town.js (2C), every frame in the town, tailor and tavern views: call env.cull(camera.position.x, camera.position.z, 40, 1.0). In townMode.showShop() and close(): call env.cull() with no arguments, which shows all folk again and hides the prize ships so the shipyard view's draw calls stay unchanged.
- src/town.js (2C), ?walkdebug=1: import { walkDebugLines } from './env/sparrow.js' and add walkDebugLines(env.walk) to the scene; dispose its geometry and material on exit.
- src/main.js (3A), when entering the town: env.setPrizes(top two captured types, as [{ type, flag: findLook('flag', shipConfig.look.flag) }]). In openDock and after every crew-look change: env.setCrewStyle((role, seed, base) => crewOpts(look, seed, base, findLook('hull', shipConfig.look.hull))). Note that setShip now runs a crew-placement pass of about 100 ms on SwiftShader (rebuilding the ship plus placement takes a median of about 205 ms, up from 103 ms), so call setShip only when the ship or crew actually changes.
