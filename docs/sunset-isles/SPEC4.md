# Pirates Ahoy! — "Voyage IV · The Sunset Isles" update: FINAL build spec (SPEC4)

Repo `/home/user/First-project` (HEAD `eedb108`, the Kraken Seas live with their Stage 4 fixes). Plain ES modules, no
build step, three.js r170 vendored (`import * as THREE from 'three'`). **Never edit `vendor/`, never add npm
dependencies, never fetch anything at runtime, never commit or push** (the coordinator does). Harness pages go in
`/home/user/First-project/.dock-harness/` (git-ignored); screenshots and scratch files go in the session scratchpad.
The previous contracts, `docs/boarders-away/SPEC2.md` and `docs/kraken-seas/SPEC3.md` (as built, with their build
records SPEC2 §17 and SPEC3 §19), still hold unless this file changes them. "SPEC3 §5.7" points there; bare "§5.7"
points here.

Base design: **`design-depth.md`** (the base two of the three judges chose), with the grafts the judges listed from
`design-arcade.md` and `design-spectacle.md`, and every judge `must_fix` item fixed. Appendix B records how the designs
were merged and maps each must-fix to the section that answers it. **Where this file and a design disagree, this file
wins.** Numbers are starting values: each lives in exactly one table in one module (named in §11), so balance changes
touch one place. Stage 3 tunes them with bot v4 (§2.8, §13.3) and records every change in §19.

---------------------------------------------------------------------------------------------------

## 0. Read this first

### 0.1 Conventions every agent must follow (SPEC3 §0.1 unchanged, plus the new rules marked ★)

- Everything in SPEC3 §0.1 holds: ship heading and side conventions; the deterministic `step(dt)` at 1/120 s; visual
  time for visual-only animation; gameplay rolls from `combatRng` (main) or `ctx.rng` (pure modules); `toon()` with ink
  outlines and `noOutline()` (InstancedMesh is never outlined correctly: `noOutline()` or volcano.js's inverted-hull ink
  twin); people ≈ 5 draw calls each; draw calls measured as `__game.renderInfo.calls` two frames after the scene
  settles, `?quality=low`, 1280×720, SwiftShader; pure modules import nothing; every record validated like
  `parseShipConfig` (never throws, field by field, plain integers, size cap, own properties, `__proto__`-safe, rewritten
  when fixed); the one storage rule (the record first, then the chest; a failed record write buys nothing); the
  accessibility floor; the kid rules; **the Kraken is not a ship**.
- ★ **The flag.** Everything new sits behind `WITH_V4` in `src/voyage.js`: `/[?&]v4=1(&|$)/.test(location.search)`
  until Stage 3 sets it to `true`. With it false the game, every saved record **except `pirates-ahoy-feats`** and the
  walk fixture `tests/fixtures/sparrow-walk.json` are byte-for-byte today's (`eedb108`): sparrow's build ctx `v4:
  false` builds today's town exactly, and no new record (`-island4`, `-voyage4`) is read or written. **The one
  exception, accepted as SPEC3 accepted its own four feats:** cosmetics.js is pure and has no flag, so from Stage 1 on
  every build's feats record carries `shell` and `island4` (both 0 until earned), written after `island` and before
  `prizes`; an existing record is rewritten once at its next load (§10.3). Flag-off parity checks compare every
  record but the feats with `eedb108`, and the feats with `eedb108`'s text plus `"shell":0,"island4":0`.
- ★ **Not ships.** Monkey Jollyboats, Puffer Mines, Old Coilback, Rock Forts and the Shellback are **never
  `SHIP_TYPES` keys**. They are **parts** in main's pseudo-target registry (§3.7), as the Kraken is: auto-aim, the
  FIRE! light, ball hits, the minimap, their tags and the portrait framing reach them; capture, surrender, boarding,
  crew pips, overboard sailors, hull holes, `statusAnchors`, prize ships in town and `feats.prizes` never do. Only three
  new kinds are ships: the Sting Sloop, the Net Sloop and the Coral Witch's Barge.
- ★ **Pools are seeded from saved progress, never from `combatRng`.** `startLevel` reseeds
  `combatRng = mulberry32(n * 7919 + 13)` on every start (main.js:1963), so a pool drawn from it would give the same
  waves for ever. The pool seed is `poolSeed(level, plays)` (§3.5) with `plays` saved per level: **Try again replays
  the same waves** (learnable, fair); a new play after a clear draws new ones. On levels 10–12 `combatRng` itself is
  seeded from that seed, so a run is reproducible from `(level, plays)`. All of a level's waves are drawn once, in
  `startLevel`. Every gameplay roll and timer (pool draws, net aims, dives, coconut spots, tides, boss attacks) comes from
  `combatRng` or `ctx.rng` in **simulated** time; nothing gameplay-relevant is gated by the wall clock (smoke.cjs's
  hit-stop flake, SPEC3 §19, is what that costs).
- ★ **Stale-tab rule for records.** A record that an older build (another tab, or a cached copy on the child's iPhone)
  reads must never hold data that build would drop and rewrite. So: the new plots' tiers live in the new
  `pirates-ahoy-island4` (today's `parseIsland` keeps only its 10 ids and main's `loadRecord` rewrites any record that
  differs); the new feats (`shell`, `island4`) and the new `feats.prizes` kinds are **re-derived at load** from the new
  records (an older tab drops them, this build restores them); Voyage IV's tips live in `pirates-ahoy-voyage4` (an
  older tab clamps `pirates-ahoy-tips` to 65,535); `FEAT_MAX.island` stays **30**; `PLOTS` stays the 10 of SPEC3.
- ★ **sparrow.js determinism.** The town's `rand()` draws are consumed in today's order. The seven remaining scenery
  shacks (`s4`, `s5`, `s9`, `s10`, `s11`, `s12`, `s17`) become plots the way SPEC3 §8.1 made ten of them: built with the
  same calls in the same order, only their target group changes (a plot's tier-0 kit). Every new piece of town art
  (districts, porches, boardwalks, islets, signposts, arches, the new buildings, islanders, animals, the construction
  scene) draws from its own named `mulberry32` stream in a new module (§11.1); sparrow.js gets a thin seam.
- ★ **people.js determinism** (SPEC3 §0.1) holds for every new option (hats, tools, `apron`, the mer `tail`, the
  hermit-crab pet): no `rng()` draw unless the option is given; new picks go at the end of `resolveLook`; the 400-seed
  look comparison stays identical.
- ★ **Walk rules.** walk.js stays a 2-D ground plan: blockers have no height (their `h` is ignored for collision) and
  graph nodes dedupe by (x, z). So **there are no stacked walk levels**: no balcony, spiral stair or ladder is a walk
  area. The crow's nest is a *place you climb to* (§6.7), not a deck. Every link keeps each 0.1 u step within `CLIMB`
  (0.35). The child's rule (§6.1): **"planks or sand: you can walk on it"**; a building's own pad is the building.
- ★ **Perk rule.** No new building changes a Voyage I–III battle. Every new perk is gold, a delight, or acts only on
  Voyage IV things (nets, fog, Old Coilback). Levels 1–9 keep their tuning and their tests; the bot order L7 < L8 < L9
  and SPEC3 §19's medians are untouched (nothing they measure changes).
- ★ **Kid rules for Voyage IV** (on top of SPEC3's): every new attack is telegraphed **≥ 1.5 s plus the Lighthouse's
  `warnBonus`** by a **shape, a sound and a word** (never colour alone); at most **6 warning shapes** on screen
  (`WARN.max`: a new one, and its attack, waits for a free slot) and at most **2 boss attacks** telegraphed at once;
  flashes ≤ 0.25 opacity and ≤ one per 3 s; glows and pulses ≤ 1 Hz; **at most one new kind a wave**, and it is
  introduced by a meet card (§3.4); no decoys, no hidden traps; the only player debuff is a **net**: shown by a strip
  with its timer and its words ("TANGLED: half speed, slow turns"), it always lets go within 4 s and is cut by holding,
  never by mashing; **nobody dies on screen** (monkeys swim home, fort gunners row away, creatures swim home with a
  happy wiggle, the Shellback scuttles off to sleep).
- ★ **Phones.** The places bar stays at **6 buttons** (a 7th does not fit 320 px). New targets ≥ 44 px. A part's word
  pops **once per volley** (SPEC3 §19 kraken4:F2, now for every pseudo part), and on portrait phones a target shows at
  most one new word pop per 0.5 s (the rest go to `#game-live` only): the known pop-stacking issue must not grow.

### 0.2 What already exists and is relied on (verified at `eedb108`)

main.js (9,860 lines): `combatRng` (818; reseeded in `startLevel` at 1963; the test API's `combat.seed` at 9345),
`loadInt` (330), `loadProgress` (351, `keepHigher`: progress saved by a build with more levels is clamped in memory
only, never lowered on disk), `loadRecord`/`saveRecord` (428/439), `saveFeats`/`syncFeats` (450/462, `MAX_FEATS` merge
by max), `syncIsland` (509), `raiseRecordFeats` (534), `spawnWave` (1867, reads `def.waves[index]`), `describeWave`
(1910), `startLevel` (1926; `ctx` at 2006, `ctx3` at 2028, `composeMechanics([createMechanics(ids, ctx), m3])` at 2047;
`overboard.prepare(def.waves.flat())` at 2061), `warmShaders` (2105, compile only), `refillLoads` (2121), `finishLevel`
(2169; island lines from 2184; the finale branch at 2207), `raiseProgress` (2259), `playerSunk` (2320), `canGrapple`
+ `GRAPPLE_WHY` (2434/2424), `fleeShip` (2744), the Kraken seam: `createKrakenFor` (2804), `syncKrakenTargets` (2850,
cached wrappers keyed by part id), `stepKraken` (2895), `startDread` (2959), `startRise` (2984), `krakenDrivenOff`
(3027), `retryFromKraken` (3082); `speedMul`/`turnMul` (3122/3129), `inArc` (3148), `mayFire` (3164), `fire` (3176),
`targetsFor` (3286), `aimTarget` (3297), `damagePseudo` (3830), `damage` (3889), `warnBonus` (4072), `islandPerks`
(4078), `launchBomb` (4084), `turnRate`/`playerTurn` (4321/4329), `speedCap` (4342), `updatePlayer` (4356),
`updateEnemy` (4395), `moveShip` (4571), `separateShips` (4624), `hitsShip` (4668), `step` (4968), `KEYMAP` (5520),
`TAP_ACTIONS` (5909), `ACT_NAMES` + `renderLevelCards` (6187/6204), `openDock` (6458), `buildPlot` (7166, the island
record first, then the chest), `showIsland` (7226), `createTownMode` (7263), `updateHud` (7369), `drawMinimap` (7888),
`frame` (9088), `__game.island` (9662).

src/env/sparrow.js (6,700 lines): the walk data (`walkData`, 1674: `areas`, `links`, `blockers`, `camBlockers`,
`places`, `spawn`; `BRIDGE_HW` 0.25, `WALK_INSET` 0.65), `bridge(a, b, { walk })` (1874: a rope bridge's art, and its
walk link only with `walk`), the platforms (1937–1968: pier, plaza, tavern, yard, `s1` Polly's walkable; `s2`–`s18`
scenery), the garden (1991), `SHACKS` (2937), the ten SPEC3 plots' tier-0 kits (`plotList`, 2958), **eleven rope
bridges** of which four are walkable (3296–3308: `plazaS1`, `tavernTower`, `plazaGarden`, `plazaYard`; **seven are
scenery**: `s1S2`, `tavernS16`, `yardS7`, `tavernS3`, `gardenS13`, `s13S14`, `s7S17`), the visiting cutter at (28.5,
−13.5) (3447), the development layer (3527; ≤ 4 meshes, ≤ 6 calls), each plot's camera envelope = **its whole platform
× its tier-3 height** (3832), the montage (4619–4810), `setIsland` (4829), `plotPose` (4887), `person`/`walker`
(4957/4966), villagers (5791–5906, `VILLAGER_CAP` 8), `cull(x, z, radius = 40)` (6256), `PRIZE_BERTHS` (29.5, 3) and
(41, −3.5) (6271), LOOK-2's waiting `setCaptain`/`inTheWay` (6314).

src/walk.js: `CLIMB` 0.35, `SUB` 0.1, obstacles in a spatial hash (`CELL` 2), `graph()` (302: node dedupe and edges
are **O(n²)**: every node against every node, `LINK` 1.75; built **lazily** at the first `path()`; on today's fixture
475 nodes, 2,513 edges, ≈ 56–65 ms, of which `clear()` over the edges is ≈ 38 ms), `path()` A* with string pulling
(`near()` is O(n); A* allocates n-sized arrays per call).
src/town.js: the squeeze-past (`cap.stuck`, `cap.pass`, 334), `walkTo` (410), `setPanel` (1086).
src/townMode.js: `PLACES_KRAKEN` (45), the Harbour menu (`#harbour-walk-btn`, `#harbour-*-btn`), `onKey` (1680; town
keys W A S D / arrows, Shift, M, P / Esc, C, E / Enter / Space: **`I` is free**), `focusPlot` (1594).
src/island.js: `PLOTS` (10), `RANKS`, `GIFT` {5, 240}, `MARKET` {300}, `VILLAGER_CAP` 8, `cleanIsland` keeps known ids
only. src/cosmetics.js: `FEAT_IDS` (9), `MAX_FEATS`, `FEAT_MAX` (`island: 30`), `FEAT_PRIZE_TYPES` (16;
`tests/cosmetics.test.cjs:271` requires it to equal the enemy `SHIP_TYPES`), 8 trophies (`coat.admiral` "Admiral's white
coat" **exists**). src/people.js: 5 kinds, `HATS` (11), `TOOLS` (13), pets `parrot` / `octopus`, `ACTIONS` (23).
src/scenery.js:120: the outline material sync **copies `clippingPlanes`** (and the vendored OutlineEffect.js:352 too).

Measured at `8afd067` (stage4-review, ashore `draws`): the town walk view with every SPEC3 plot at tier 3, 8 villagers,
Bess, Barnacle and 2 prize ships peaks at **401** (30 spots × 8 headings; the busiest 8 re-measured 379–401); the
shipyard view **308–315**; the quiz view 52; the build view ≤ **96**. Battles: L7 peaks 219, L8 236, L9 210, the Kraken
fight 102–161. ashore's "walking (a)" measures **0.97 s** against its 1 s limit.

### 0.3 Before Stage 0 (the coordinator), and the issues this update inherits

1. Confirm the published game (mimonhj.github.io/First-project) serves `eedb108`; re-anchor every `file:line` of §0.2
   and §13.4 by content if the tree has moved, and re-base this file.
2. Known open issues this update must **not make worse** (each has an owner in §12): pop words stacking (§0.1 phones
   rule; 1I/2A); the build panel showing only one row at 320×480, 360×480, 360×640, 568×320 and 640×360 (a built row
   no taller than today's, Watch again inline, and the plot-board shortcut, §8.6; 1R); "walking (a)" at 0.97 s of its 1 s limit (no new routine pauses or crosses
   near the four old bridges' mouths; the limit is never raised; 1Q/2D); first-draw stalls of hazard programs
   (PERF-WARM-FIRSTDRAW was refuted for SwiftShader, but a real first draw costs nothing: every new sea warm-draws, §14;
   2A).
3. The coordinator keeps `docs/kraken-seas/` as it is; this update's reports go in `docs/sunset-isles/`.

---------------------------------------------------------------------------------------------------

## 1. Scope

| The player asked for | What ships |
|---|---|
| "more levels" | **Voyage IV · The Sunset Isles**, three levels after the Kraken's Deep: **10 Misty Mangroves** (Heroic ★10), **11 The Sunken Spires** (Epic ★11), **12 Shellback Shoals** (Ultimate ★12, the new finale), each a new sea with its own look, hazard and music. It opens once level 9 is won; a save that already drove off the Kraken opens level 10 at load (§2.2). Levels 1–9 stay exactly as they are. |
| "wider variance in enemies" | **Seven new kinds that move or attack differently** (§3.1): **Monkey Jollyboats** (a swarm that lobs coconuts), the **Sting Sloop** (hides behind you and dodges your broadside), the **Net Sloop** (throws nets), the **Coral Witch's Barge** (calls puffers and mends pirates), **Puffer Mines** (sea creatures that drift at you and pop), **Old Coilback the Sea Serpent** (dives, then lunges down a lane), **Rock Forts** (stationary guns that sight you with a red line); and the finale, **the Shellback**, the crab-shaped island that wakes up. Four of the seven are not ships (the jollyboat pack, two sea creatures, the forts), and neither is the Shellback. Waves are drawn from **seeded pools** (§3.5): Try again replays the same waves, every new play after a win draws new ones; every new kind arrives alone, announced by a **meet card** with one counter line. |
| "more houses to be build in town" | **Eleven new buildings** on Sparrow's Floating Island (§4): 3 homes (Treehouse, Houseboat Moorings, Hilltop Villa) and 8 amenities (Blacksmith's Forge, Fishing Hut, Goat Farm, Music Hall, Trophy Museum, Observatory, Aquarium, Mermaid Grotto), 3 tiers each, paid from the treasure chest, each with a small perk or delight and its own inhabitants; two new ranks (Grand Port, Jewel of the Seas) and a trophy. |
| "when building them show me the house being build" | **The construction scene** (§5) for every build and upgrade on all 21 plots: the camera frames the plot, three builders push a plank cart in, and the house goes up in stages (foundation, frame, walls rising, roof, paint and finishing touches) over a pale-blue blueprint, with hammering, sawdust and scaffolding, then its inhabitants move in with a suitcase and a pet. 9.4 s for a new building, 7.0 s for an upgrade, skippable with one tap or key, a still-frame version under reduced motion, and a free "Watch again". It replaces the 2.4 s montage. |
| "make the whole island accessible" | **Every deck, platform, beach, hill and pier you can see is walkable** (§6): the 7 scenery rope bridges, all 17 shack platforms round their buildings, 5 new short rope bridges, 16 wide boardwalks, two new islets (**Sunset Beach**, **Lookout Hill**) and **Fisher's Pier**, in six districts on rings, with signposts, named arches and landmarks; the crow's-nest **lookout**; an **Island map** that walks or hops you anywhere (and lets keyboard and screen-reader users reach every district, plot and chat without walking). |
| "make the island with different types of habitants" | **33 named islanders** of many trades and ages (fisherfolk, a sailor couple, a blacksmith and her apprentice, grandparents, kids, a farmer, musicians, a curator, tourists, a stargazer, an aquarist, merfolk, and the amenities' baker, miller, keeper, trader, teacher and gardener) and **7 animal species** (cats, dogs, goats, parrots and an owl, monkeys, crabs, turtles) (§7). Each building brings its own; they walk to work, fish, play, sit and sell on little routines, wave and chat (their lines teach the new counters), and you can pet the animals. A crowd director keeps the town inside its draw-call budget. |

**Never cut** (the minimum this update ships): levels 10–12 with at least 6 new kinds (at least 2 of them sea
creatures), the seeded met-only pools and the meet cards; the Shellback's Fort and Waking phases with the checkpoint;
the staged construction scene with skip and reduced motion, on every plot; every visible deck reachable (the 7
bridges, the platforms, both islets, Fisher's Pier); at least 8 new buildings; islanders with routines and talk (at
least 6 trades or ages and 4 animal species); every record validated, the stale-tab rule and the migration; the budgets
of §14.

**Explicitly out** (rejected by the judges): quests with gold and their record (depth); boarding a fort to turn its gun
(depth); the 0.8 s bullet-time on a first meeting (depth); BatchedMesh animals and far "dolls" (spectacle; BatchedMesh
issues one draw per instance without `WEBGL_multi_draw`, unverified on iOS); stacked walk levels: the tavern balcony,
the crow's-nest ladder or spiral stair as walk areas (arcade, depth); moving land colliders: tide bars that become
land, coil-ring walls, a walking island that is a collider (depth, spectacle); decoys (the Mirage); player debuffs other
than nets ("RUDDER NIP"); combat perks that reach Voyages I–III (extra crew, a reload song, damage multipliers on the
Kraken, extra crates on III, a first-hazard delay); fog that stops all aiming or heals you inside it; a ship boss with
an unlosable duel (arcade's Stormcrown); a 7th places-bar button; **new** rope bridges spanning more than 3 u of water
(the eleven existing rope bridges keep their art, whatever their span, §6.2); new `SHIP_TYPES` for
creatures; new plot tiers in `pirates-ahoy-island`.

---------------------------------------------------------------------------------------------------

## 2. Voyage IV · The Sunset Isles (levels 10–12)

### 2.1 Level definition additions (`src/act4.js`, the SPEC3 §5.1 format)

New optional fields:

- `pool` — the waves to draw, one entry per wave: `{ budget, slots, must, from, attackers? }` (§3.5). `waves` stays, as
  the **fallback** draw (`drawWaves(level, pool, poolSeed(level, 0))`, precomputed into the def), for code and tests
  that read `def.waves`; main plays `levelWaves()` (§11.2), which is `state.waves` on a pool level.
- `mechanics` — ids of `mechanics.js`, `mechanics3.js` and `mechanics4.js` (`MECHANIC4_IDS = ['fog', 'currents',
  'tide']`); main passes `def.mechanics` to all three factories and each keeps the ids it knows (SPEC3 §11.1).
- `boss: 'shellback'` (level 12; the Shellback wakes once the last wave falls, §3.6).
- `rumour.foes` — the kinds the tavern's rumour board shows as named icons for that level; `teaser`, `sailOn`,
  `victoryLine`, `crates` as SPEC3 §5.1.

`src/voyage.js`: `WITH_V4` (§0.1); `LEVELS = WITH_V4 ? [...BASE, ...ACT3_LEVELS', ...ACT4_LEVELS] : today's`, where
`ACT3_LEVELS'` is level 9 with three keys laid over it **by voyage.js** (`sailOn: 'Sail on to the Sunset Isles'`,
`teaser: ACT4_TEASER`, `victoryLine: 'The Kraken Seas are yours'`), so `act3.js` is not touched and with the flag off
level 9 is byte-for-byte today's. `act4.js` imports its three env modules and `pools.js`.

### 2.2 How Voyage IV opens, and the save migration

- Beating level 9 still shows its final Victory, now with the teaser: "The Kraken is driven back to the deep, and the
  Seven Seas are safe! You are the Kraken Tamer! …but on the sunset horizon, an island is snoring." `#act2-btn` reads
  **Sail on to the Sunset Isles** (`Enter` too) and the won dock's ways out read "Set sail for Misty Mangroves | Back to
  the title". (`finishLevel`'s finale branch already raises progress to level 10 once a level follows; its teaser line
  gains `after.act === 4`.)
- The title shows **12 cards in four groups**: `ACT_NAMES[4] = 'Voyage IV · The Sunset Isles'`, heading colour
  `#6b2a55` (≥ 7:1 on parchment: Stage 0 measures it and darkens it if not). Card 10 reads "Drive off the Kraken",
  cards 11–12 "Locked" (A11Y-5: `aria-disabled`, described, `#menu-live` says why). The difficulty pill's text is
  "Difficulty N of 12"; its picture shows N skulls for N ≤ 9 and the compact "☠ ×10" / "☠ ×11" / "☠ ×12" from 10 on
  (twelve skulls don't fit a 320 px card). The open card scrolls into view (SPEC3 §5.2).
- **Migration (at load, once Voyage IV is live):** if `feats.kraken ≥ 1` **and** `unlocked ≥ 9` then
  `raiseProgress(10)`. `pirates-ahoy-unlocked` clamps to `1..12` (`loadProgress` keeps a higher saved value on disk).
  Known edge case, accepted as SPEC3 §5.2 accepted its own: `feats.kraken` is saved the moment the Kraken is driven off,
  and leaving then wins the level (SPEC3 §19 SAVES-2), so the two always agree in practice.
- Beating level 12 shows the final Victory: "The Shellback scuttles off to sleep, and the Sunset Isles are free! You are
  the Admiral of the Twelve Seas!", `#act2-btn` hidden, Enter → the title, `#won-chest` with "The Golden Conch +1,200".

### 2.3 Level 10 — Misty Mangroves (`src/env/mangroves.js`) · Heroic ★10

- **Setting (the thumbnail):** a green-gold dusk in a mangrove maze. Mangrove islets on arching roots (colliders); the
  **Banyan Arch**, a giant mangrove arch over the main channel that you sail under (the landmark and the fly-in's first
  framing); a lantern-lit stilt village with paper lanterns; lily pads with frogs; hanging moss; a monkey temple ruin
  (where the jollyboats live); fireflies (one InstancedMesh ≤ 150, `noOutline`, each glowing at 0.3–0.8 Hz); and slow
  banks of white fog drifting through the channels.
- **Palette:** `skyTop 0x2f4f6f, skyHorizon 0xf2c66b, sunColor 0xffd89a, sunDir [-0.5, 0.3, 0.6], sunIntensity 2.0,
  hemiSky 0xd8e8b8, hemiGround 0x3a4a2a, hemiIntensity 1.25, fogColor 0xc8d8a8, fogNear 90, fogFar 320, waterDeep
  0x1f5a4a, waterShallow 0x5fb08a, waterFoam 0xf4ffe0, waveAmp 0.4, cloudColor 0xffe8c0, cloudShade 0x8a7a6a,
  cloudCount 10`; `worldRadius 145`.
- **Data:** `fogLoops` ≥ 3 (each clear of colliders by the bank's half-length + 4, none within 20 u of `playerStart`),
  4–6 `reefs` (shallows: deep hulls ×0.45, today's `REEF_SLOW`), `crateSpots` ≥ 4, `enemySpawns` ≥ 6 (the smoke layout
  rules), `playerStart` mid-channel.
- **Def:** `pool` (§3.5), `nextWaveAt: 1, maxAttackers: 2, lead: 0.7, spreadMul: 0.9, grace: 4, enemyRake: 1,
  mechanics: ['fog'], crates: 2, bonus: 1800, scene: 'mangroves', lockText: 'Drive off the Kraken'`, `mechanic: 'Fog
  banks hide ships! Monkey Jollyboats throw coconuts: steer out of the brown circles!'`, `rumour: { title: 'Misty
  Mangroves', lines: ['Monkeys in little boats! Grape shot tips them over.', 'A Sting Sloop hides behind you. Turn, or
  chain shot her!'], ammo: 'grape', foes: ['jolly', 'stinger', 'netsloop'] }`.
- **Music** (`mangroves`, synthesised): a bayou waltz on banjo, accordion, jug and washboard, crickets, and frogs on
  beats 2 and 4.

### 2.4 Level 11 — The Sunken Spires (`src/env/spires.js`) · Epic ★11

- **Setting:** turquoise noon over a drowned city: toppled columns and two arches to sail under, gold domes bobbing
  like buoys, glowing coral gardens (pulse ≤ 0.5 Hz), and **King Coral**, a half-sunk stone king's head 18 u tall with a
  coral crown (a collider; the landmark and the first framing). Three coral currents run through the city as bands of
  scrolling white foam arrows with silver fish riding them.
- **Palette:** `skyTop 0x2a7fd8, skyHorizon 0xc8f4ff, sunColor 0xfffbe8, sunDir [0.2, 0.9, 0.3], sunIntensity 2.4,
  hemiSky 0xe0f8ff, hemiGround 0x3a6a7a, hemiIntensity 1.35, fogColor 0xbff0f0, fogNear 140, fogFar 400, waterDeep
  0x0e8aa0, waterShallow 0x5ff0e0, waterFoam 0xffffff, waveAmp 0.5, cloudColor 0xffffff, cloudShade 0xc0d8e8,
  cloudCount 12`; `worldRadius 150`.
- **Data:** `currents` (3 polylines, 8 u wide, never through a collider, none within 15 u of `playerStart`),
  `crateSpots` ≥ 4, `enemySpawns` ≥ 6.
- **Def:** `nextWaveAt: 1, maxAttackers: 2` (3 in wave 3, the pool entry's `attackers`), `lead: 0.7, spreadMul: 0.9,
  grace: 3, enemyRake: 1, mechanics: ['currents'], crates: 2, bonus: 2100, scene: 'spires'`, `mechanic: 'Coral currents
  push you along! Puffer Mines puff when you get close: pop them from far away.'`, `rumour: { title: 'The Sunken
  Spires', lines: ['The Coral Witch calls puffers. Sink her first!', 'Old Coilback gets dizzy after it lunges. Hit its
  head!'], ammo: 'stink', foes: ['puffer', 'witch', 'coilback'] }`.
- **Music** (`spires`): harp and glass marimba over a slow bossa, with whale-song pads.

### 2.5 Level 12 — Shellback Shoals (`src/env/shoals.js`) · Ultimate ★12 · the finale

- **Setting:** a coral-pink sunset over golden sandbanks, giant shells and whale ribs; Rock Forts on sea stacks with red
  flags; and in the middle of the bay **a crab-shaped island with a ruined fort on its back** (the landmark). It is the
  sleeping Shellback: every few seconds a stream of snore bubbles rises beside it (a hint a child can spot).
- **Palette:** `skyTop 0x5a3a8a, skyHorizon 0xffa88a, sunColor 0xffc0a0, sunDir [0.6, 0.2, -0.5], sunIntensity 2.1,
  hemiSky 0xffd8d0, hemiGround 0x4a3a5a, hemiIntensity 1.25, fogColor 0xf0b8b0, fogNear 110, fogFar 360, waterDeep
  0x1a5a8a, waterShallow 0x4fd0c8, waterFoam 0xfff4ec, waveAmp 0.7, cloudColor 0xffd0e0, cloudShade 0x7a5a8a,
  cloudCount 14`; `worldRadius 150`.
- **Data:** `tideBars` (4 sandbars; none on the player start; each one a ship can sail round on both sides),
  `fortSpots` ≥ 3 (sea stacks, colliders, each ≥ 30 u from `playerStart` and ≥ 15 u from the lair), `shellbackLair {
  x, z, r: 12 }` (the sleeping island, a soft keep-off zone, §3.6), `shellbackArena { x, z, r: 70 }` (open water clear
  of every collider by 12 and of every tide bar by 6), `crateSpots` ≥ 4, `enemySpawns` ≥ 6, `setAwake(k)` (sand slides
  off the crab island, k 0..1), `setCalm(k)` (the sky eases to a golden evening with a soft rainbow arc, opacity ≤ 0.35).
- **Def:** `nextWaveAt: 0, maxAttackers: 3, lead: 0.72, spreadMul: 0.88, grace: 3, enemyRake: 1, mechanics: ['tide'],
  boss: 'shellback', crates: 2, bonus: 3000, scene: 'shoals', finale: true, finaleText: 'The Shellback scuttles off to
  sleep, and the Sunset Isles are free! You are the Admiral of the Twelve Seas!', victoryLine: 'The Twelve Seas are
  yours'`, `mechanic: 'Rock Forts fire along their red line: change course! Low tide shows sandbars.'`, `rumour: { title:
  'Shellback Shoals', lines: ['A Rock Fort aims a red line at you. Turn before it goes solid!', 'They say the island in
  the bay… snores.'], ammo: 'frost', foes: ['fort', 'shellback'] }`.
- **Music:** `shoals` (a brass and steel-drum carnival march) until the Shellback wakes, then `shellback` (a 5/4 tuba
  crab-walk with castanet claws and a choir, faster in the Charge).
- **No stacking:** before the wake: the ebb tide, the forts and the pool's ships; from the wake on, **only the
  Shellback** (no tide, no forts, no ships, no crates).

### 2.6 The hazards (one table each; numbers in `mechanics4.js` `FOG`, `CURRENT`, `TIDE`)

**Fog banks (L10, `FOG`)**

| Rule | Number |
|---|---|
| Banks | 3 ellipses, 30 × 18 u, riding `env.fogLoops` at 1.5 u/s (a pure function of the hazard clock) |
| At the start | no bank within 20 u of the player for the first 8 s |
| Hidden | a ship whose centre is inside a bank is hidden from any viewer more than **14 u** away (+ the Observatory's spyglass, 6 / 12 / 18 u): no auto-aim at her, no FIRE! light for her, no tag (her dim silhouette and a lantern still show), a grey "?" on the minimap |
| Your guns | manual broadsides still fire and still hit a hidden ship. When the auto-aim has nothing to aim at only because of fog, the Fire cell reads **FOG!** and the first time the hint says "Hidden in the fog! Fire anyway, or sail closer." (tip bit 1, §8.4) |
| You, hidden | pirates head for your last-seen spot ("Where'd she go?"); no extra healing (today's regen only), so hiding is a breather, not a fortress: a pirate that reaches the spot is within 14 u and sees you again |
| Leaving fog | a "!" pops over the ship (≤ once per ship per 6 s) |
| Never hidden | warning shapes and rings, crates, your own ship (the puffs fade within 8 u of the camera's target), the minimap's own dot; the HUD shows a **HIDDEN** chip while you are inside |
| Looks / sound | ≤ 150 instanced puffs (`noOutline`) and one low disc per bank (≤ 4 calls); a soft foghorn far off; reduced motion: the puffs don't swirl |

**Coral currents (L11, `CURRENT`)**

| Rule | Number |
|---|---|
| Lanes | 3, 8 u wide, from `env.currents` |
| Effect | any ship (and any puffer) whose centre is inside drifts **3 u/s** along the lane (composed `drift`; skipped for the glued boarding pair); no damage. With it: free speed; against it: a crawl |
| Looks | one strip mesh of scrolling foam arrows (`noOutline`), silver fish riding it; arrows on the minimap; "WHEEE!" the first time you ride one |

**Ebb tide (L12, until the Shellback wakes, `TIDE`)**

| Rule | Number |
|---|---|
| When | first at 40 s of combat time, then every 45 s; low for 12 s |
| Warning | **3 s** (+ Lighthouse): a ship's bell (`tidebell`), "LOW TIDE!", pale bubbling water over the 4 `env.tideBars`, their outlines on the minimap; the first time a banner "Low tide! Sandbars slow you down" |
| Effect | while the tide is out each bar is **shallows**, never land: deep hulls (every type without `shallow`) have their speed cap ×0.5 inside ("SHALLOWS!" once per entry), pirates too; no damage, no collider, nothing a ship can be stuck on |
| End | it stops for good when the Shellback wakes (the bars fade in 2 s) |

### 2.7 The finale's place in the voyage

Level 12 is one boss sequence: two pool waves (the Rock Fort's sight line is taught in wave 1), then the crab island
wakes. It is structurally unlike level 9 (no boss ship, then a monster): the scenery itself is the boss, and its Fort
phase tests the sight line the child just learned. §3.6 has the whole sequence.

### 2.8 Difficulty order and the balance guards (checked by bots, §13.3)

- **Profile V4** = SPEC3 §5.9's late-game profile exactly (shipyard guns 1, shot 2, crew 2, hull 2, sails 1, carpenter
  1, rudder 1; tavern boarders 1, cutlass 1, gunner 1; all three recipes; Windmill 1) **with no Voyage IV building**.
- **Within Voyage IV:** bot medians of damage taken L10 ≈ 90 < L11 ≈ 125 < L12 ≈ 190, and L10's median below level 9's
  on the same profile (a breather after the Kraken). The Shellback fight lasts **120–180 s** (median) of simulated time.
  Offline Stage 3 medians over **48 seeds** per level and configuration (with and without special shot; beam-keeping
  and circling), recorded in §19.
- **Never required:** every level 10–12 is cleared by bot v4 with **0 special loads** within two tries, on profile V4,
  in ≥ 95 % of the 48 seeds.
- **Perks never trivialise:** with every Voyage IV building at tier 3 the Shellback's median stays ≥ 90 s and L12's
  damage median ≥ 120.
- **Voyages I–III untouched:** no new perk reaches them (a Node test checks that `perks4()`'s keys are read only on
  `act === 4` paths, §13.1); SPEC3 §19's medians and `npm run test:balance` are not re-tuned.
- **Tuning knobs, in order:** `maxAttackers`, the pool budgets, `lead`, `spreadMul`, the hazard timers, the new kinds'
  timers (telegraphs never below 1.5 s), the Shellback's hp and timers, the kind costs, then the pools' `from` lists.
  Waves stay at ≤ 3 slots and ≤ 4 alive (§3.5).

---------------------------------------------------------------------------------------------------

## 3. The new foes

### 3.1 Every new kind (one table; the numbers live in the module tables of §3.2)

Each kind has one picture, one word and one sound, one colour no other enemy uses, and one counter line (the meet
card's, §3.4). Every telegraph below is the time **before the hit lands**, plus the Lighthouse's `warnBonus` (0.3 / 0.6
/ 0.9 s), and every shape also gets the edge arrow when it is off-screen and joins the portrait framing's must-see group
when it lands within `FRAME.ringReach` of your hull (SPEC3 §19 kraken4:F1).

| Kind (key · colour) | What it is | Numbers | What it does | Telegraph (shape · sound · word) | Counter (the meet-card line) | Model, draw calls | Pool cost · first met |
|---|---|---|---|---|---|---|---|
| **Monkey Jollyboats** (`jolly` · banana yellow and palm green) | a **pack** of 5 little rowboats, each with a cheeky monkey; one wave slot; a pseudo-target pack (`foes4.js`), not a ship | 5 boats × 10 hp; boat 3.2 × 1.4 u; 11 u/s, accel 5, turn 2.2; coconut r 2.2, **3 damage**; 10 gold a boat (coins) | the boats paddle a ring round you at 10–14 u; each lobs a coconut at your predicted spot ± 3 u every 6–8 s (`ctx.rng`), at most 2 in the air per pack; a coconut hits every hull in its ring (pirates too) | a brown dotted ring with a spinning coconut shadow, **1.5 s**; an "ook!" squeak (`coconut`); "COCONUT!" (once per pack per 3 s), "BONK!" on a hit | "Monkey Jollyboats! Grape shot tips them over. Steer out of the brown circles!" Any grape ball that hits a boat tips it over whatever its hp ("SPLOSH!", the monkey swims home); other shot sinks one in 10 hp; a hull that touches a boat tips it (no damage to you) | boats + monkeys: one InstancedMesh + ink twin; coconuts: one InstancedMesh + ink twin; **4 calls** a pack; the pack's tag (1 sprite) | 3 · L10 wave 1 |
| **Sting Sloop** (`stinger` · wasp yellow-and-black stripes) | a fast **kiter** ship (`SHIP_TYPES`, flag `kiter`) | hp 60; 8.5 / 2.6; 14 u/s, accel 4.6, turn 1.7; reload 2.2, 2 × 4; 6 gold → 60 sunk / 145 captured; crew 9 / grit 1.1; engage 26; spread 0.1 | holds a spot 22–30 u off your **stern quarter** (> 135° off your bow), turning beam-on to fire her broadside; once she has been inside one of your loaded broadside arcs for 0.6 s she **dances** away (turn ×1.6 and +2 to her speed cap for 1.2 s; cooldown 5 s) | her shots are ordinary cannon fire (no ship's broadside is telegraphed in this game); the cue is where she is: a gold **BEHIND YOU!** edge arrow while she is within 35 u, > 135° off your bow and off-screen; a "fwap" of sails as she dances | "Sting Sloop! She hides behind you. Turn to get her in your sights, or chain shot her!" A chained or frozen sloop can't dance; dropping your sail makes her overshoot into your arc | ≤ a Man-o'-War's calls (Stage 1 measures; plan ≈ 20) | 3 · L10 wave 2 |
| **Net Sloop** (`netsloop` · bottle green with white nets) | a **control** ship (flag `nets`) | hp 65; 8.5 / 3.0; 10 u/s, accel 3.2, turn 1.3; reload 3.2, 1 × 4; 5 gold → 50 / 125; crew 10 / 1.0; engage 16; spread 0.12 | closes to 14–18 u on your beam and casts a **net** over a fan 18 u long and 50° wide toward you; a hull whose centre is in the fan when it lands is **TANGLED**: speed cap ×0.5, turning ×0.6, for at most **4 s**, no damage; a net drapes over your ship. Cooldown 10 s; **no net within 8 s of any release**; never during a boarding; never while she burns or stinks | the net whirls over her deck and a white **hatched fan** is painted on the water toward you, **1.6 s**; a whirr (`netWhirl`); "NET!" | "Net Sloop! Steer out of the white net. Netted? Hold G to cut free!" (touch: "Hold CUT!"). Cut by holding G / CUT! **0.8 s** (the Forge: 0.6 / 0.45 / 0.3 s) or pressing it 3 times (`RAIDERS.cutTaps`), by any hit of yours on her, or the 4 s timeout; **Fire** on her while the net whirls: "NETS ON FIRE!", no net for 12 s | ≤ a Man-o'-War's calls; the net drape on the player 1 merged mesh (+2 calls while shown) | 3 · L10 wave 3 |
| **Puffer Mines** (`puffer` · orange with brown spots) | **sea creatures**: a **patch** of up to 4 (one wave slot; at most one patch a wave) or the Witch's summons of up to 3 (owned by her, inside her slot); pseudo-targets | 6 hp each; r 0.9; drift 1.4 u/s; pop r 4, **8 damage**; life 40 s; **≤ 6 alive in all**: a wave's patch rises with `min(4, 6 − alive)` (none free: it waits, its slot alive, and rises as soon as one leaves), the Witch's summons with `min(3, 6 − alive)`; 2 gold each (a coin) | each drifts at the nearest hull within 25 u (rides the currents); within 6 u of a hull it **puffs**, then pops: 8 damage to every hull within r 4 (pirates too), and swims home | it swells to twice its size, its spikes slide out and a **spiky ring** (r 4) pulses at 1 Hz, **1.5 s**; a squeaky "PUFF!" (`puff`) | "Puffer Mines! Pop them from far away, before they puff!" Any ball that hits one sends it home safely ("PFFT!"); grape clears a cluster; lure them into pirates. The guns aim at a puffer only with grape loaded or no ship in that arc | one InstancedMesh + ink twin, spikes one InstancedMesh: **3 calls** for all puffers | 2 · L11 wave 1 |
| **The Coral Witch's Barge** (`witch` · coral pink and sea green) | a **summoner and healer** ship (flag `summoner`; boardable; not a boss) | hp 120; 10 / 3.6; 5.5 u/s, accel 1.6, turn 0.7; no guns (`holdFire`); 8 gold → 80 / 185; crew 6 / 0.7; engage 34 | keeps 30–38 u off; every 8 s, in turn: **Summon** `min(3, 6 − alive)` puffers 10–14 u ahead of you (only while fewer than 6 are alive; `foes4.spawn('puffer', x, z, { n, owner: her id })`), or **Song**: every pirate within 18 u of her mends 4 hp/s for 4 s (never above full). When she sinks or is taken, her own puffers swim home (`sendHome(her id)`; a wave's patch stays) | Summon: 3 green bubbling rings where they will rise, **1.8 s**, a conch (`conch`), "PUFFERS!"; Song: a ring of musical notes round her, **1.5 s**, a harp glide (`song`), "SHE'S MENDING!" | "Coral Witch! She calls puffers and mends her fleet. Sink or board her first!" **Stink**: no song or summons for 6 s (`WITCH.stinkQuiet`, a Witch rule on top of `STATUS`; then her clothes-pegs, SPEC3 §2.2); her crew is small, so boarding her is easy (185 gold) | ≤ a Man-o'-War's calls; the witch at the helm (a person, 5) | 4 · L11 wave 2 |
| **Old Coilback, the Sea Serpent** (`coilback` · teal-green with a purple fin and a cream belly) | a **sea creature** (pseudo-target); one wave slot; a grumpy old serpent | bar 450 hp; head (when up) a sphere r 1.6 at y 2.5; 3 humps (when swimming) r 1.2; swims 9 u/s; lunge **12 damage** + a 3 u shove; a scale +150 gold | **swims** 6 s circling you at 22–28 u (humps up) → **dives** 2 s → 3 s **under** (only a bubble trail; untargetable; its tag reads **UNDER WATER**, the FIRE! light stays dark for it) → **rears** 14–16 u off your beam, head up → **lunges** 0.5 s down a lane 4 u wide **from its head to 4 u past your predicted spot** (so the lane always reaches you; at most 30 u long) → **dizzy** 4 s (stars round its head) → swims again | the lane: green-and-white dashes with arrows, **1.6 s**; a rising hiss (`hiss`); "LUNGE!" | "Old Coilback! Steer out of the green lane, then hit its head while it's dizzy!" Head ×1, dizzy head **×2** ("BONK!"), humps ×0.5 ("THUD"); **Frost**: no dive for 8 s and its lane +0.5 s (`COILBACK.frost`); **Stink**: it dives off and doesn't lunge for 6 s (`COILBACK.stink`; both replace `STATUS`'s boss values for the Coilback, §3.2); at 0 it swims home sulking and drops its scale | one 8-segment rigidly skinned SkinnedMesh (the people.js technique, ≤ 2 material groups ×2) + eyes (`noOutline`) + a shadow decal: **≤ 6 calls**; its tag | 5 · L11 wave 3 |
| **Rock Fort** (`fort` · sandstone with a red flag) | a **stationary gun** on a sea stack (`env.fortSpots`); pseudo-target; one wave slot | 220 hp; r 3; range 40 u; **14 damage** to the first hull on its line (pirates too); reload 4 s; 100 gold | within 40 u it **sights** you: a red dotted line from its gun to you follows you for 1.3 s, then **locks** for 0.5 s (the line turns solid with one soft flash ≤ 0.25 and a "click-clack"), then fires along the locked line | the red line: dotted while tracking, solid when locked, **1.8 s** in all; `clack`; "AIM!" when it locks | "Rock Fort! When its red line points at you, change course! Knock it down." Turn or change sail before it locks; at 0 "FORT DOWN!": the wall crumbles and its gunners row away in a little boat; aspect is always beam (no rakes); G: "Too big to board! Knock it down." | rock (env collider) + a little merged stone fort, one gun and a flag: **≤ 6 calls**; the sight line one strip (`noOutline`) | 3 · L12 wave 1 |
| **The Shellback** (`shellback` · coral-red shell, barnacles, stalked eyes) | the **finale**: the crab-shaped island wakes (§3.6); a pseudo-target boss, not a collider | bar 3,000 hp, notches at 2,000 and 1,000; towers 3 × 340; claws 2 × 300 | Fort → Waking → Charge (§3.6) | every attack ≥ 1.8 s: the towers' red lines, a red zigzag-edged claw sector, an orange boulder ring, a charge lane (§3.6) | "THE SHELLBACK WAKES! Knock down its towers!" (+ " Stink shot makes it sneeze!" when Stink is owned) | ≤ 40 calls (§14) | boss · L12 |

Seven new kinds, of which **four are not ships** (the pack, two sea creatures, the forts; the Shellback is not a ship either), and
all seven move or attack differently: a swarm, a kiter, a net, a summoner-healer, drifting mines, a diving lane-lunger and a
stationary sight line.

### 3.2 Where each number lives

| Table (module) | Holds |
|---|---|
| `STINGER`, `NET`, `WITCH` (`mechanics4.js`) | the ships' behaviours of §3.1 (they follow the type flags on any level, so `G.spawn` tests them anywhere) |
| `JOLLY`, `PUFFER`, `COILBACK`, `FORT` (`foes4.js`) | the pseudo foes: hp, sizes, speeds, timers, damage, gold |
| `SHELLBACK` (`shellback.js`) | §3.6 |
| `FOG`, `CURRENT`, `TIDE`, `WARN` (`mechanics4.js`) | §2.6, and `WARN = { max: 6, boss: 2 }` (the only home of the "2 boss attacks at once" cap: the Shellback reads it as `ctx.warn.boss`) |
| `SHIP_TYPES.stinger`, `.netsloop`, `.witch` (`shipTypes.js`) | the three ships' stats (capture gold `gold × 20 + 25`, as for every type; every type passes the existing combat checks: integer crew ≥ 1, hull alone never reaches the notch) |
| `KIND_COST`, `INTRO`, `POOL_RULES`, `PACKS` (`pools.js`) | §3.5 |
| `MEET` (`pools.js`) | `{ card: 3.5, grace: 4, newTag: 10 }` (§3.4) |
| `WORDS4` (`mechanics4.js`) | every new pop, hint and live-region word, so every screen says the same thing (the foes and the Shellback read it through `ctx.tables`) |

The net's cut taps and hold come from `RAIDERS` (combat.js) through `ctx.tables`, and the Forge's shorter hold from
`perks4().cutHold`; statuses on pseudo foes use `STATUS`'s boss values (SPEC3 §5.7.5) through `ctx.tables.STATUS`,
**except** where a foe's own table names its reaction: Old Coilback's Frost (no dive for 8 s, lane +0.5 s) and Stink
(no lunge for 6 s) live in `COILBACK.frost` / `COILBACK.stink` and replace `STATUS` for it; the Witch's 6 s quiet
lives in `WITCH.stinkQuiet` on top of her ordinary ship `STATUS`. Nothing is copied.

### 3.3 Tags, grappling and the guns

- **Tags** (`tags.js`): a pack has one tag that counts its boats ("Monkey Jollyboats ×4", no crew pips); Old Coilback's
  and each fort's tag has a hull bar; puffers have none (their ring is the tell); the Sting, Net and Witch ships have
  ordinary ship tags. A hidden ship in fog has no tag; Coilback under water reads **UNDER WATER**. A kind's first-ever
  appearance wears a gold **NEW** on its tag for 10 s.
- **G on a pseudo target**: jollyboats "Too small to board!", puffers, Old Coilback and the Shellback "You can't board a
  sea monster!", a fort "Too big to board! Knock it down." (`boardWhy`, §3.7). Nothing is grappled.
- **The guns** aim at pseudo targets through `targetsFor()` as at the Kraken (SPEC3 §5.8): beam aspect always, no rake
  ×, no RAKE! cue. A puffer is aimed at only with grape loaded or no ship in that arc (so the guns never waste a
  broadside on a puffer beside a pirate).
- **Their shots and pops hit pirates too** (coconuts, puffer pops, fort lines, Coilback's lunge); pirates `avoid()`
  every warning shape like lava.

### 3.4 Meeting a new kind

The **first time ever** a kind spawns on this save (its bit not yet in `voyage4.met`, §10.1):

- it holds its attacks from its spawn until **4 s after its meet card actually shows** (`MEET.grace`, counted from the
  card, not the spawn: a card that waits behind the 3 s "Reinforcements!" banner extends the hold, so a newcomer never
  attacks before or while its card is first read);
- a **meet card** takes the banner slot for **3.5 s**: its icon, its name and its one counter line (§3.1), also read by
  `#game-live`; a two-note bugle (`newFoe`); its tag wears a gold **NEW** for 10 s; an edge arrow points at it when
  off-screen;
- the met bit is saved at once (the voyage4 record; with storage blocked it lasts for the visit).

Every later appearance shows nothing extra. The pools guarantee **at most one new kind a wave** (§3.5), so two meet
cards never compete. The tavern's **Sea Guide** (§8.7) keeps every met kind's card; the rumour board shows the next
level's possible foes as named icons (`rumour.foes`; unmet ones as "?" silhouettes with their names).

### 3.5 Wave pools: no two voyages the same

`src/pools.js` (pure) draws all of a level's waves at `startLevel`:

```
plays  = voyage4.plays[level − 10]                         // saved; +1 on each clear of that level (§10.2)
seed   = poolSeed(level, plays) = (level × 7919 + 13 + plays × 104729) >>> 0
waves  = drawWaves(level, def.pool, seed)                   // → string[][]; deterministic; never throws
combatRng = mulberry32(seed)                                // levels 10–12 only (1–9 keep n × 7919 + 13)
```

- **Try again** (the whole level, or from the Shellback) replays exactly the same waves; a new play after a clear draws
  new ones, and the cleared card says "The seas will change next time!". Tests pin the seed with `G.v4.seed(s)`.
- **Met-only by construction:** `INTRO` gives each kind the wave that introduces it (its `must`). A wave may draw a
  Voyage IV kind only **after** its introducing wave, and the waves before it can't hold it, so a new kind always
  arrives as its wave's `must`, alone and announced, and the draw never depends on `voyage4.met` (which only drives the
  meet card): Try again stays identical even though the first try met new kinds.
- **A wave** starts from its `must`, then picks by weight (Voyage IV kinds 2, older kinds 1) among the kinds of `from`
  that fit the remaining budget and the rules, until its slots are full. A wave equal (as a set) to the previous one,
  or spending less than its budget − 1, is redrawn, at most 8 times, then the last draw stands.

| Level · wave | Budget | Slots | Must (introduces) | Draws from |
|---|---|---|---|---|
| 10 · 1 | 5 | 2 | `jolly` | corsair, privateer, shark |
| 10 · 2 | 6 | 2 | `stinger` | corsair, privateer, shark, jolly |
| 10 · 3 | 8 | 3 | `netsloop` | corsair, privateer, shark, jolly, stinger |
| 11 · 1 | 6 | 2 | `puffer` | jolly, stinger, netsloop, corsair, privateer, bombketch, ironclad |
| 11 · 2 | 7 | 2 | `witch` | as 11 · 1 + puffer |
| 11 · 3 (`attackers: 3`) | 9 | 3 | `coilback` | as 11 · 2 + witch, shark, skiff |
| 12 · 1 | 8 | 3 | `fort` | jolly, stinger, netsloop, puffer, witch, coilback, corsair, privateer, shark, skiff, bombketch, ironclad |
| 12 · 2 | 9 | 3 | one Voyage IV kind that wave 1 lacked (by weight) | as 12 · 1, no fort |
| 12 · boss | — | — | the Shellback (§3.6) | — |

**Costs** (`KIND_COST`, a pack or patch is one slot): corsair, privateer, shark, skiff, puffer **2**; bombketch, jolly,
stinger, netsloop, fort **3**; ironclad, witch **4**; coilback **5**. The fire ship and Voyage I's cutters, prahus and
junks are not in Voyage IV pools.

**Rules** (`POOL_RULES`, checked by `waveProblems` and a 1,000-seed Node test per level, §13.1): ≤ 3 slots a wave; ≤ 2
of a kind, and **at most one puffer patch a wave**; never in one wave: two Net Sloops, a Witch with a Bomb Ketch, or
more than one of {witch, coilback, fort}; puffers alive ≤ 6 in all (a wave's patch rises with `min(4, 6 − alive)` and
waits, its slot alive, while none is free; a Witch's summons are `min(3, 6 − alive)`); ≤ 4 slots alive at once
(`nextWaveAt` 1 on L10–11 and 0 on L12 keep it); a pack, a patch, and a Witch **together with her summons** each count
as one slot (her puffers are spawned with `owner` = her id, `foes4.slots()` ignores owned puffers, and
`foes4.sendHome(her id)` sends home only hers when she falls, so a summons never raises the count and never takes a
wave's patch with it). `startLevel` draws every wave before wave 0
spawns, so the next wave's meshes prebuild hidden as today (SPEC3 §11.2 PERF-4); the boss checkpoint keeps its level's
waves (it starts after them).

### 3.6 The finale: the Shellback (`src/shellback.js` pure simulation, `src/shellbackView.js` the model)

#### 3.6.1 The sequence

1. **Wave 2 falls** (every ship of it sunk, captured or fled; struck ships are taken as at a level clear; a boarding
   plays out its `result` first): the wake waits, as the Kraken's rise does (SPEC3 §5.7.1).
2. **Dread, 4 s:** the music drops to a drone (with audible harmonics at 80–240 Hz), sand slides off the crab island
   (`setAwake`), bubbles boil round it, banner **"The island… is MOVING!"**; your crew patches the hull as at
   reinforcements (the Bakery's share) and +3 hands come aboard; the tide stops; the crates go; **your special loads
   refill** (SPEC3 §19 SPS-1); the **checkpoint** is taken (session memory only).
3. **The wake, ≤ 6 s, skippable by any key or tap:** the island rises on eight legs, two stalked eyes pop up and blink,
   the fort's bell clangs on its back; the camera pulls up and back; banner **"THE SHELLBACK WAKES!"** with "Knock down
   its towers!" (+ " Stink shot makes it sneeze!" when Stink is owned). Reduced motion: a cut for 1.5 s and back, no
   glide, no shake.
4. **The fight** (§3.6.2). The boss bar reads **THE SHELLBACK** with two notches (`#boss-notches`), its status badge in
   `#boss-status`.
5. **Driven off at 0** (§3.6.4).

#### 3.6.2 Phases (`SHELLBACK`)

| | 1 · The Fort (3,000 → 2,000) | 2 · The Waking (2,000 → 1,000) | 3 · The Charge (1,000 → 0) |
|---|---|---|---|
| Body | stays at its lair, asleep but for its eyes; a soft keep-off ring r 12 | walks after you at **4.5 u/s** (Frost ×0.5), never within its standoff of a hull (§3.6.3) | throws the fort off its back (a big splash, no damage) and walks at **6 u/s**, never within its standoff |
| Targets (×, word) | the fort's **3 towers**, 340 hp each, ×1 (each down: "TOWER DOWN!", its gunners row away); all three down, or the bar at 2,000, starts phase 2 | its **eyes** ×1.5 ("BULLSEYE!"), **2 claws** of 300 hp each (a downed claw droops for 8 s, "OUCH!", and can't sweep), the **shell** ×0.5 ("CLANG!") | eyes ×1.5, **×2 while dizzy** ("BONK!"); claws; shell |
| Attacks | the towers **sight you in turn**, one every 3 s: a Rock Fort's line (1.3 s tracking + 0.5 s locked, **10 damage**), within 50 u | **claw sweep** when you are within 16 u: a **red zigzag-edged sector** r 14, 100°, **1.8 s**, `snip`, "SNIP!": 12 damage and a 4 u push; **boulder** every 9 s: an **orange ring** r 5 at your predicted spot ± 4 u, **2.0 s**, `boulder`, "BOULDER!": 12 damage | **charge** every 10 s: it crouches behind a **lane 7 × 45 u** through your predicted spot, **2.0 s**, `crabCharge`, "CHARGE!", then runs it at 14 u/s: 14 damage and a 4 u shove to each hull in the lane; then **dizzy 4 s**; the sweeps go on; no boulders |
| Specials (`STATUS` boss values through `ctx.tables`) | Fire: the tower hit burns 3 hp/s | Frost: walks ×0.5 and every warning +0.5 s, 2.5 s | Stink: **ACHOO!**, no attack starts for 2 s, then 20 s of clothes-pegs |

- **Kind to a child:** at most **2 attacks telegraphed at once** (`ctx.warn.boss`, i.e. `WARN.boss`; `SHELLBACK` holds
  no copy); **no charge within 6 s of a sweep**; every ring, sector and lane placed in open water; a shape counts toward
  `WARN.max` (§0.1).
- **No stalling (`cutOff`):** if no attack has started for 12 s (you are far off), a boulder falls at your predicted
  spot wherever you are inside the world.
- **Never on land or off the map:** the body walks only inside `env.shellbackArena` and ≥ 12 u from colliders; every
  attack spot is moved to the nearest open water.

#### 3.6.3 Contact rules (it is never a collider)

The Shellback's body is a circle (r 8 awake; the sleeping lair's keep-off ring r 12) that **pushes, never blocks**:

- **The standoff rule** (`SHELLBACK.standoff` 1): the body never steps closer to any hull than r + that hull's
  half-length + 1 u; when its walk would, it stops and turns (it walks round, or waits). So the body never walks onto a
  ship that is standing still.
- **The push** (`SHELLBACK.push` **8 u/s**, always ≥ the body's fastest walk, 6 u/s, + 2 u/s): a ship (yours or a
  pirate's) overlapping it is pushed out along the line from its centre, and the part of its own speed that points
  into the body is taken away while it overlaps (it can always sail out sideways or back; nothing stops it leaving),
  with **no damage** ("BUMP!" at most once per 3 s); the push is turned up to 90° toward open water if straight out
  would meet land or the world's edge.
- **The Charge** is the one exception: a hull in the lane gets its 4 u shove out of the lane at once (with the
  Charge's damage), and the 3.2 s run (45 u at 14 u/s) is exempt from the 1 s rule below.

Only the Charge's lane does damage. A layout test (§13.1) runs scripted players for 600 s in each phase (standing still,
circling, chasing it, hugging the arena's edge, sailing into it at full speed) and checks that, outside a Charge's run,
a ship is never inside the body for more than 1 s, never pushed onto land or beyond `worldRadius − 10`, and always has
a free direction to sail.

#### 3.6.4 Driven off, and the checkpoint

- **Driven off at 0:** "THE SHELLBACK SCUTTLES HOME!" It walks to the arena's edge with a sleepy yawn (`yawn`), settles
  into the sand and closes its eyes (nobody hurt). One soft bloom (≤ 0.25 opacity); `shoals.setCalm()` eases the sky to
  a golden evening with a rainbow arc over 3 s (a cut under reduced motion). **The Golden Conch** bobs up (sail over it,
  or it drifts to you after 4 s): "+1,200 THE GOLDEN CONCH" (`SHELLBACK.conch`, added to `state.gold`, so `finishLevel`
  banks it with the level's plunder; paid on every clear of level 12). A **baby hermit crab** scuttles up the rail onto
  your hat ("It wants to come home with you!"; the `pet.hermit` trophy; it also lives on Sunset Beach from then on).
  `voyage4.won = 1` is written, then feat `shell` = 1 (saved at once). Then the level clears and `finishLevel` shows the
  final Victory. **Leaving once it is driven off** (before the Conch reaches you) wins the level and banks the Conch
  and the plunder (SPEC3 §19 SAVES-2).
- **The checkpoint** (taken at the dread; session memory, never saved): sunk in the fight, the shipwreck screen's first
  button is **Try again from the Shellback** (`#shellback-retry-btn`, `Enter`): `startLevel(12, { fromBoss: true })`
  flies in briefly (any key skips), full hull and crew, **loads refilled**, the plunder from the dread, no waves, the
  short wake (3 s) at full 3,000 hp. The shipyard keeps the checkpoint (reached from the shipwreck card's Visit the dock
  or the pause menu's Shipyard during the fight): its main exit is "Try again from the Shellback", with what you bought
  aboard, and the main menu's leave question says "Next time, Shellback Shoals starts from the beginning" (SPEC3 §19
  SAVES-1). `krakenCheckpoint` becomes `bossCheckpoint { level, boss, gold, goldAtLevelStart }`; the Kraken's checkpoint
  behaves exactly as before.
- **G** with nothing to cut during the fight: "You can't board a sea monster!".
- Tuned by bot v4 to **2–3 minutes** on profile V4 (§2.8). No boarders, no ships and no other hazard join the fight.

### 3.7 The parts registry (main.js's seam, generalising SPEC3 §5.8)

main keeps one registry of pseudo-target sources, `PARTS = [kraken, foes4, shellback]`; each source is pure and has the
shape `{ targets() → [{ id, kind, x, z, r, y0, y1, hp, maxHp, name, hidden }], hits(id, x, y, z) → boolean, hit(id,
info) → { dmg, word } | null, special(id, ammo) → word | null, boardWhy(id) → 'small' | 'monster' | 'fort' }`.

- `syncParts()` (once a step) wraps each raised, unhidden part as a cached pseudo-ship of **today's wrapper shape
  (main.js:2856–2876) plus `src`**: `{ pseudo: true, src, part, partKind, kind, typeName, id, x, z, h: 0, speed: 0, hp,
  maxHp, y0, y1, aimY, type: { len, wid, name }, mesh: { position: { y: 0 }, userData: { deckY } }, status: null }`.
  The `mesh` stand-in, `status`, `y0`/`y1` and `partKind` stay because main reads them for every target (`popHeight`
  reads `s.mesh.position.y` and `deckY`, main.js:3424; the framing and board-pick code at 4797–4838 and 7673). The
  Kraken's wrappers keep `kind: 'kraken'` and `id: kraken-<part>` exactly; the other sources use `kind` = the source's
  kind (`'jolly'`, `'puffer'`, `'coilback'`, `'fort'`, `'shellback'`), `partKind` = the part's kind, `id:
  <src>-<part>`, `type.len`/`wid` = 2r. **One wrapper per part id per spawn**, updated in place (the volley's
  per-target sums need a stable identity). It replaces `syncKrakenTargets`; the Kraken's wrappers come out exactly as
  today.
- `targetsFor(side)` = enemies (not hidden by fog from the player, §2.6) + the wrappers; `aimTarget`, `inArc`,
  `playerFire`, the FIRE! light, the minimap, the chase camera and the portrait framing read it.
- `hitsShip(b, t)` for a wrapper asks `t.src.hits(t.part, b.x, b.y, b.z)`; `damage(t, …)` → `damagePseudo` →
  `t.src.hit(t.part, info)` → the word (once per volley), the summed HIT mark, a special's status once per volley per
  source, then **returns at once** (no hole, no feats, no hit flash, no `'hit'` sound, no surrender). `rakeCue` is null
  and `ballHit` gives `shotResult` a beam-on target, as for the Kraken.
- `canGrapple(t)` for a wrapper returns `t.src.boardWhy(t.part)` with the words of §3.3. `separateShips`, crew pips,
  boarding, capture, `checkSurrender`, overboard sailors and `feats.prizes` never see a wrapper.
- A wave's slots: `spawnWave` places ship kinds with `createShip` as today and pseudo kinds with `foes4.spawn(kind, x,
  z)` (a fort at a free `env.fortSpots` entry, never at an `enemySpawns` point); the clear check counts `fighting()`
  ships **plus** `foes4.slots()`.
- **No `SHIP_TYPES[t]` on a wave entry without a guard** (L10's wave 0 starts with `jolly`): `describeWave` (main.js:1910,
  used by the intro and retry banners at 2092/2096 and the "Reinforcements!" banner) names each entry with
  `foeName(kind)` (`FOE_NAMES[kind]` for a pseudo kind, `SHIP_TYPES[kind].name` otherwise); `spawnWave`'s boss lookup
  (1895) is `wave.find((t) => !isPseudo(t) && SHIP_TYPES[t].boss)`; every "alive" count — the HUD's ships cell and its
  "+pending" (7385–7387, pending = `slotsOf` of the waves still to come), the sunk banner's "N to go" (3970–3975) and the
  clear check — is `fighting()` ships + `foes4.slots()`.

---------------------------------------------------------------------------------------------------

## 4. Building up the island: eleven new buildings

Rules and numbers in **`src/island.js`** (pure; new exports only, `PLOTS` and every SPEC3 function unchanged); the
building art in **`src/env/buildings4.js`**; the plots' places, pads and porches in **`src/islandPlan.js`** (§6); the
panel in **`src/buildPanel.js`**; the scene in §5.

### 4.1 The new plots (`PLOTS4`; one table)

Every plot is a building on a **pad** (its tier-3 footprint + 0.2 u, a walk blocker and a camera box from tier 0, so
the walk data never changes with tiers, §6.3) with a porch in front and a painted **"Build me!" board** on the porch
(the plot's place, `plot:<id>`, §8.5). On a shack platform a new plot's **pad limit is derived from its link mouths**:
the platform's deck less a **1.6 u porch on every side a link reaches** (§6.2's plan: the High Walk, `s4S3` and the
other links land on platform sides) **and on the front** (the board's side), and 0.4 u on the other sides; Stage 0
computes the seven limits from §6.2's link plan and lists them in islandPlan's `PADS` table (with the ten measured SPEC3
pads), so buildings4.js builds within them from the start. Porch extensions (§6.3) are the exception, used only where
those porches would leave a pad limit smaller than 3.0 × 3.0 u. On the islets the pads are listed below. Each tier adds
to the last. Costs are the price of going from tier t to t + 1.

| id · name | Where (district, platform or islet; pad) | Kind | Tier 1 / 2 / 3 (what each adds) | Cost per tier | Perk or delight at tier 1 / 2 / 3 | On sale | Max h | Moves in (people; animals) by tier |
|---|---|---|---|---|---|---|---|---|
| `homeE` **Treehouse** | Sunset Beach, in a giant palm (pad 4.6 × 4.6) | home | Rope Swing House (a hut in the palm and a swing) / Treehouse (a rope ladder, a crow's-nest flag) / Treetop Lodge (twin huts joined by a little rope bridge) | 150 / 350 / 650 | **2 / 4 / 6 villagers** | always | 11 | Granny Wren and Kip (1); Moss (2); Coco the monkey (1), a second monkey and a rope swing (3) |
| `homeF` **Houseboat Moorings** | Lighthouse Point, `s17`, its barge moored alongside in the water | home | Rowboat Home (an upturned rowboat with a door) / Houseboat (a cabin on a barge tied alongside) / Floating Manor (two decks, flower boxes, a figurehead) | 150 / 350 / 650 | **2 / 4 / 6 villagers** | always | 8 | Bosun Jib and Nell (1); Grandpa Barnaby (2); Salty the dog (1) |
| `homeG` **Hilltop Villa** | Lookout Hill, the east shoulder (pad 4.6 × 4.2) | home | Cottage / Villa (a second storey, a balcony) / Domed Villa (a blue dome and a terrace garden) | 150 / 350 / 650 | **2 / 4 / 6 villagers** | always | 9 | Granny Pearl and Grandpa Jack (1); cousins Lily and Tom (2); Whiskers the cat (1) |
| `forge` **Blacksmith's Forge** | Lantern Lane, `s4` | amenity | Anvil (an anvil under a lean-to, a glowing hearth) / Smithy (a brick chimney, a horseshoe sign) / Iron Works (a water wheel and a bellows) | 250 / 550 / 950 | cutting a net takes a **0.6 / 0.45 / 0.3 s** hold (0.8 s without); anvil sparks (≤ 1 Hz glow) | with Voyage IV (`unlocked ≥ 10`) | 8 | Ada the smith (1); Ida the apprentice (2); Bolt the dog (1) |
| `fishing` **Fishing Hut** | Lighthouse Point, `s9` and Fisher's Pier | amenity | Drying Rack / Fishing Hut (a smoke shed) / Fish Market (a giant wooden fish sign, stalls on the pier) | 150 / 350 / 650 | **Fishers' catch: +20 / +40 / +60 gold** each cleared level | always | 7 | Finn the fisher (1); Marina (2); two cats (1, 3); crabs on the pier |
| `farm` **Goat Farm** | Lantern Lane, `s10` | amenity | Goat Pen / Barn (a goat on the roof) / Dairy & Orchard (apple trees, a windpump) | 200 / 450 / 800 | *delight:* **2 / 4 / 6 goats** graze the pen and Lookout Hill; at tier 3 a cheese stall on the market ("Goat's cheese, Captain?") | always | 6 | Farmer Bo (1); Hettie (2) |
| `music` **Music Hall** | Lantern Lane, `s5` | amenity | Fiddler's Stump / Bandstand / Shell Hall (a scallop-shell roof, lanterns) | 200 / 450 / 800 | *delight:* the town tune gains a **fiddle / drum / squeezebox** (`audio.setTownLayers`); at tier 3 the villagers **dance on the plaza** for 8 s every 60 s | always | 8 | Piper Paz (1); Drummer Dot (2); Squeezebox Sid (3) |
| `museum` **Trophy Museum** | Lantern Lane, `s11` | amenity | Curio Shed / Museum (columns, steps) / Grand Gallery (a dome with a gold anchor) | 250 / 500 / 900 | **+15 / +30 / +50 gold for each ship captured** (≤ 200 a level), on the capture pop ("+30 Museum"); *delight:* a bottled model of every ship type you've captured (`feats.prizes`), the Kraken's pearl and the Shellback's shell | after your first capture (`feats.captures ≥ 1`) | 9 | Curator Quill (1); a tour group of two (3); a parrot (1) |
| `observatory` **Observatory** | Lookout Hill, the top (pad 4.6 × 4.6) | amenity | Spyglass Post / Star Tower / Great Dome (turns at 0.05 rad/s) | 300 / 600 / 1,000 | **spyglass:** you see **6 / 12 / 18 u** further into fog; and Old Coilback's bubbles show on the minimap while it is under | with Voyage IV (`unlocked ≥ 10`) | 11 | Stella the stargazer (1); Hoot the owl (1) |
| `aquarium` **Aquarium** | Lantern Lane, `s12` | amenity | Tide Pool / Aquarium (a glass front) / Grand Aquarium (a glass dome, a turtle pool) | 300 / 600 / 1,000 | **+10 / +20 / +30 gold for each Voyage IV creature driven off** (each puffer, Old Coilback, the Shellback; ≤ 150 a level); *delight:* a tank for each creature kind you have beaten | after level 10 (`unlocked ≥ 11`) | 7 | Coral the aquarist (1); a visiting kid (3); two turtles (1, 2) |
| `grotto` **Mermaid Grotto** | Sunset Beach, the shore (a rock pool half in the sea; pad 4.0 × 3.6) | amenity | Rock Pool / Grotto (a shell arch) / Coral Palace (pearl towers) | 200 / 400 / 700 | wrecked on any level, **the merfolk save 10 / 20 / 30 % of your plunder** (≤ 150) for the chest: "The merfolk saved 45 gold!" on the shipwreck card | after level 11 (`unlocked ≥ 12`) | 6 | Nerissa and Kai, merfolk (1); two turtles (2) |

- **Totals:** new homes **3,450**, new amenities **12,550**, new plots **16,000**; with SPEC3's 11,800 the whole island
  costs **27,800** (a Node test sums the table, `totals4()`). The cheapest new building costs 150, so the first visit of
  Voyage IV already changes the island.
- **Villagers and the gift:** the new homes bring 2 / 4 / 6 villagers each (18 more; 42 in all). Their gift is a
  separate cap so SPEC3's pinned numbers hold: `gift4(s, s4) = min(120, round(5 × villagers4 × parkMul))` (the Flower
  Park's multiplier applies), paid like `gift()` on every cleared level and shown in the same line ("Villagers' gift
  +N", N ≤ 360). A home's named islanders (§7) are its villagers out and about; the rest are "at home" (lit windows).
- **On sale:** amenities whose perk needs Voyage IV go on sale with it; a row not yet on sale reads "Opens after The
  Kraken's Deep" (or "…Misty Mangroves", "…The Sunken Spires", "…your first capture"), `aria-disabled`, the reason as
  its description, so new things keep appearing as the child sails on.
- **Every perk shows where it works:** the CUT! bar fills faster and the strip says "Ada's knives: 0.45 s"; "Fishers'
  catch +40" on the cleared card; "+30 Museum" on the capture pop and the card; nearer tags in fog and the bubbles on
  the minimap; "Aquarium +20" over a creature swimming home and on the card; "The merfolk saved 45 gold!" on the
  shipwreck card. No perk changes a Voyage I–III battle (§0.1): the Forge's hold applies to nets only, which exist only
  on Voyage IV; the spyglass to fog and the Coilback; the rest are gold or delight.
- **No two buildings share a perk:** catch (per cleared level), capture gold (per capture), creature gold (per creature)
  and rescue (per wreck) are four different triggers, each with its own cap.

### 4.2 Ranks and the island's growth

- **Rank** (`RANKS4`, with the flag; `RANKS` stays for the flag-off game and SPEC3's tests), by tiers built over all 21
  plots (of **63**): Hamlet 0, Village 5, Town 12, Harbour Town 20, Pirate Capital 30, **Grand Port 45**, **Jewel of
  the Seas 63**. Shown in the panel header and on the plaque under the welcome sign (`setRank`).
- **Trophies:** the Governor's coat stays `feats.island ≥ 30` (the first ten plots; its text becomes "build the first
  ten plots up to tier 3"); new, the **Jewelled tricorn** (`hat.jeweled`, `feats.island4 ≥ 33`, "build every new plot
  up to tier 3"). The island's growth is visible as you sail on (§4.1's "On sale" column): six new plots are on sale
  from the start (the three homes, the Fishing Hut, the Goat Farm and the Music Hall); the Forge and the Observatory
  open with Voyage IV, the Aquarium after level 10, the Mermaid Grotto after level 11 and the Trophy Museum after your
  first capture; and each building brings its people (§7).
- **Feats:** `feats.island` keeps its 0..30 meaning; new `feats.island4` (0..33, the new plots' tiers), re-derived at
  load from `pirates-ahoy-island4` (§10.1).

### 4.3 What each building looks like (art budget)

All built plots bake into the **development layer** (SPEC3 §8.2), now **split into two halves**: the ten SPEC3 plots
(today's layer) and the eleven new ones (a second layer of the same shape), so a rebake touches one half and stays
≤ 40 ms (behind the scene's dust or the "Rowing to…" toast); each half is ≤ 3 outlined meshes + 1 painted-board mesh,
**≤ 6 draw calls**. Animated parts are meshes of their own: the forge's glow, the water wheel, the observatory's dome,
the aquarium's water shimmer, the music notes (instanced), the windpump: **≤ 6** more. Each tier's kit is built in the
plot's frame from the town's own parts and colours (sparrow's art helpers, §11.1), each from a stream of its own (a
building always looks the same whenever it is built), and must fit its pad (§6.3).

---------------------------------------------------------------------------------------------------

## 5. Show me the house being built: the construction scene

The timeline lives in the pure **`src/buildScene.js`** (Node-tested); the 3D scene in **`src/env/construction.js`**
(called by sparrow.js in place of today's montage); the caption strip, keys, taps and camera in townMode.js. It plays
for **every build and upgrade on all 21 plots** (today's ten too: it replaces SPEC3 §8.3's 2.4 s montage).

### 5.1 Before the scene: saves first

Bess's Build button (`E` at a plot's board only opens her panel at that row, §8.5) saves the plot's record first (`pirates-ahoy-island` for the ten SPEC3
plots, `pirates-ahoy-island4` for the new ones), then the chest (§0.1); only then does the scene start. If the record
can't be written nothing is paid, nothing plays, and the row says why. Skipping, leaving the panel, leaving town or
closing the page mid-scene keeps the building. The 400 ms double-build guard stays; while a scene runs every Build
button reads "Building…" (`aria-disabled`).

### 5.2 The stages (`STAGES`, `SCENE` in buildScene.js)

A new building takes **9.4 s**, an upgrade **7.0 s** (its first stage is a scaffold round the old building, and its
reveal starts above the old top once the old roof lifts away), and reduced motion **5.0 s** (4 stills × 1.1 s + 3
crossfades × 0.2 s; `SCENE.reduced` is derived from `still` and `fade` in buildScene.js, never a number of its own).

| # | Stage | New: from–to (s) | Upgrade: from–to (s) | What you see | What you hear | Caption (`#build-live`, the strip) |
|---|---|---|---|---|---|---|
| 0 | **Builders, ho!** | 0–1.0 | 0–0.8 | the camera glides (0.9 s) to frame the pad and the porch; Bess whistles; **Chip** the carpenter (hammer), **Mortar** the mason (a crate) and **Dab** the apprentice (a kid with a paint bucket) push a plank cart in from the nearest walk point (≤ 8 u); the **blueprint** of the new building appears: pale blue, see-through | `whistle`, footsteps, the cart | "Builders on the way!" |
| 1 | **Foundation** / **Scaffold** | 1.0–2.2 | 0.8–1.2 | new: the old shack's roof lifts off and the shack folds flat into the cart ("poof"); six stone blocks drop into a chalk outline, each with a dust puff. Upgrade: a yellow scaffold pops up round the old building and its roof lifts away | `thud` ×6 / `tok` ×2 | "Laying the foundation!" / "Up goes the scaffold!" |
| 2 | **Frame** | 2.2–3.8 | 1.2–2.2 | corner posts pop up one by one, beams snap across, the scaffold rises with a ladder and Chip climbs it | `tok` ×8, knocks | "Putting up the frame!" |
| 3 | **Walls** | 3.8–5.4 | 2.2–3.6 | the walls **rise from the ground**: a cut line sweeps up to the eaves with a **plank band and sawdust** at the working edge; above it the blueprint stays pale and fills with colour as the cut passes | `saw`, knocks | "Raising the walls!" |
| 4 | **Roof** | 5.4–6.6 | 3.6–4.6 | the cut climbs from the eaves to the top in 4 tile bands; the chimney or weathervane pops on last with a little squash | `clack` ×4, `pop` | "Putting on the roof!" |
| 5 | **Finishing touches** | 6.6–7.8 | 4.6–5.6 | Dab's paint sweeps the walls from raw timber to their colours; windows light; flower boxes, the sign and the vane pop in with sparkles; the scaffold folds down; bunting unfurls | `brush`, `chime` ×3 | "Finishing touches!" |
| 6 | **Moving in** | 7.8–9.4 | 5.6–7.0 | the door opens; the new inhabitants step out with a suitcase (or their tools, for an amenity) and their pet, and wave: "Thank you, Captain!"; a confetti puff (≤ 40 bits); the builders and Bess cheer | `door`, `cheer`, `tada` | "Treehouse built! Granny Wren, Kip and Coco moved in." |

- **The strip** (`#build-scene`): a stage pill **"Walls ●●●○○○"** (the stage's name and six pips: shape, not colour),
  and a **Skip ▸▸** `<button>` (44 × 44). On wide screens it sits at the top of the screen; in portrait (≤ 760 px wide)
  the build panel's bottom sheet folds to a **56 px bar** holding the same pill and Skip, and the camera frames the plot
  in the space above it; the strip never covers the plot. The panel comes back after the scene with focus on that row's
  button.
- **The camera:** after the glide, a slow orbit of ±10° round the pad (`plotPose` extended to the new plots; the pose
  keeps clear of every camera box and the prize ships, SPEC3 §8.3). Reduced motion: a cut, no orbit.
- **Skip:** one tap anywhere, any non-modifier key, or Skip: the scene jumps to its end state in 0.3 s (the building
  stands, its inhabitants wave from the porch for 1 s, one cheer). The tap or key that skips does nothing else; held
  keys' auto-repeat doesn't skip; `Esc` skips, a second `Esc` leaves the panel.
- **Reduced motion:** no glide, orbit, squash, flying sawdust or confetti; **four stills** (foundation or scaffold,
  frame, walls and roof, done) each held 1.1 s with 0.2 s crossfades (4 × 1.1 + 3 × 0.2 = **5.0 s**; no fade-in before
  the first still, which starts on a cut), the same sounds and captions; the builders stand at the plot; the inhabitants
  fade in within the last still.
- **`#build-live`** reads the stage captions (≤ one per 1.5 s, de-duplicated) and the last line: "Treehouse built!
  Granny Wren, Kip and Coco moved in. Villagers 28 · Grand Port." A skip reads only the last line.
- **Watch again:** every built row has a **Watch again** button (a 44 × 44 icon button, `aria-label` "Watch the
  Treehouse go up again", **inline at the end of the row's button bar**, the same height as the row's main button, so
  a row is never taller than today's, §8.6) that replays that plot's last tier going up, free and changing nothing (it
  writes nothing); refused while another scene runs.

### 5.3 How it is drawn (`src/env/construction.js`)

- The plot's half of the development layer rebakes **without** that plot (today's `rebuildDev({ [id]: null })`, per
  half). The old tier and the new tier are drawn as **temporary meshes** made from their baked chunks (≤ 4 meshes
  each: ink, thin, flat, boards).
- **The reveal is a clipping plane**, which the outline pass copies (scenery.js:120; OutlineEffect.js:352), so no ink
  outline of an unbuilt wall ever shows. The new tier's temporary meshes use **per-scene clones** of the development
  materials with `clippingPlanes = [cut]`, the cut rising from the pad's floor to its top through stages 3–4;
  `renderer.localClippingEnabled` is true only while the town view is up (townMode sets it on open and off on close
  through its ctx's **`setClipping(on)`**, which main.js adds in Stage 2, §11.2: townMode has no renderer of its own),
  and only the clones carry a plane, so nothing else in the town is ever clipped. For an upgrade, the old tier is drawn
  clipped **below** its eave height while a copy of its roof part (clipped **above** the eave) lifts away and fades.
- **The blueprint ghost:** one flat `noOutline` copy of the new tier's geometry, pale blue (`0x9fd4ff`), opacity 0.3,
  `depthWrite` false, clipped by the opposite plane (only what is still to come shows). It is first on the scene's
  drop order (§14).
- **The paint wipe:** an `onBeforeCompile` colour mix on the clones only (`customProgramCacheKey 'sparrow-dev-scene'`):
  below the height `uPaint` the vertex colour, above it raw timber (`0xd9b07a`). A colour change only; the outline is
  untouched.
- **The plank band and sawdust:** a thin ring of planks (one merged mesh) riding the cut line, and sawdust from the
  town's existing particle pool.
- **Frame posts:** one InstancedMesh with its ink twin (2 calls), popping up one by one. **The scaffold** is today's
  (SPEC3 §19 TOWN-SCAFFOLD). **The cart** is one merged mesh. **The builders** are 3 people (`share: true`, `detail:
  'low'`, 15 calls), built at dock open with the islanders.
- **Warm draw:** the scene's cloned materials (clip plane on, paint wipe on) and the blueprint get a real first draw at
  dock open behind the "Rowing to…" toast, so the first scene never stalls a frame.
- When the scene ends (or is skipped) the new tier joins its half of the layer (≤ 40 ms) and the temporary meshes,
  clones and builders' scene state are disposed (the builders are hidden, not rebuilt).
- **Cost:** today's build view (≤ 96) + the old and new tiers' temporary meshes (≤ 16) + blueprint 1 + posts 2 + plank
  band 1 + cart 2 + builders 15 + the moving-in islanders and pet (≤ 12) ≈ **≤ 145** (§14).

### 5.4 What tests can drive

- `buildScene.js` (Node): `sceneLength(kind, reduced)` → 9.4 / 7.0 / 5.0; `stageAt(t, kind, reduced)` → `{ stage,
  index, k, caption, pips, done }` for every t; `cueAt(t0, t1, kind, reduced)` → the sounds and events between two
  times (each fired exactly once however the frames fall); stage order and contiguity; the captions.
- `__game.island.scene` (browser): `{ get running, get stage, get t, get kind, skip(), advance(dt) }` (`advance` steps
  the scene by dt of scene time, so a frozen-loop test drives it deterministically), plus `__game.island.build(id)` and
  `__game.island4.build(id)` (§11.3).

---------------------------------------------------------------------------------------------------

## 6. The whole island, walkable

The layout is **data** in the pure **`src/islandPlan.js`** (districts, decks, links, pads, porches, signposts, arches,
hop points, islander paths; walk.test loads it in Node); its art is built by **`src/env/districts.js`** with its own
stream (`mulberry32(0x5EA4)`) and baked into the town's static meshes; sparrow.js merges the plan's walk data into
`env.walk` (only with `v4`).

### 6.1 The rule a child can learn

**If it is made of planks or sand, you can walk on it.** Walkable things share one material language: honey planks with
dark gaps, or pale sand, and nothing else in the town uses those tones; every bridge has rope rails and a lantern at
each mouth; stairs and ramps have white step edges. A building stands on its own **pad** (it is the building, like a
roof); boats, roofs, sea rocks, the docked ship, the prize ships and the visiting cutter stay scenery. Today's
"visible-but-unreachable" places all become walkable: the seven scenery rope bridges, the seventeen shack platforms,
and the beaches, hill and pier this update adds.

### 6.2 Districts, decks and links

Lengths are plan values: the **span of water** between the two decks' edges (1N measures the real ones from the art).
**Every link has a `kind`** in islandPlan's `LINKS` (today's four and the seven scenery bridges included, by id):
`'rope'` | `'board'` | `'steps'`, and its walk band follows its kind, not its length:

- **`'board'`** — a boardwalk: 2.0 u of planks between rope rails, walk band `hw` 0.6 (so with the walker radius 0.3
  there are **1.8 u** of walking width and two people pass; SPEC3's squeeze-past still applies). **Every new link that
  spans more than 3 u of water is a boardwalk.**
- **`'steps'`** — the stone steps `s12Hill`: `hw` 0.6, white step edges.
- **`'rope'`** — a rope bridge: 1.05 u planks with hand ropes at ±0.55 u, `BRIDGE_HW` 0.25 (single file; the
  squeeze-past and LOOK-2 apply). **New rope bridges span ≤ 3 u of water** (`WALKWAY.ropeMax`); their links, which run
  0.9 u into each deck, are then ≤ 4.8 u. The eleven existing rope bridges stay rope bridges whatever their span:
  today's four walkable ones (links 3.51–5.31 u: `tavernTower` 3.51, `plazaGarden` 4.40, `plazaS1` 5.17, `plazaYard`
  5.31) are unchanged, and of the seven scenery ones two are short (`tavernS16` 2.55 u of water, `s1S2` 2.83) and **five
  are long**: `s7S17` 4.42, `tavernS3` 4.26, `yardS7` 4.49, `gardenS13` 5.59 and `s13S14` 6.99 u (deck gaps computed
  from sparrow.js's `bridges` endpoints; 1N re-measures them). Boardwalk width is not possible on them without new
  art (their hand ropes are at ±0.55 u, inside a 0.6 band), and §6.3 keeps their art; so instead **at most 1 islander
  loop crosses each of the five long bridges, no loop ever pauses on one or within 2 u of its mouths, and each is a
  named probe of the walking bug (§6.5)**.

Every link runs 0.9 u into the decks it joins (as `bridge({ walk })` does) and keeps every 0.1 u step ≤ `CLIMB`.

| District (colour cue · landmark) | Decks (centre x, z; deck y) | Links (today's scenery bridges made walkable **in bold**; new ones with plan length) | Plots |
|---|---|---|---|
| **Harbour** (red, white and blue · the tavern, the lookout tower) | today's pier, plaza, tavern raft, tower raft, yard, Polly's (`s1`), garden | today's `plazaS1`, `plazaYard`, `plazaGarden`, `tavernTower` | — |
| **Windmill Row** (mint · the windmill) | `s16` (−17.6, −17.4), `s8` (−24, −9), `s13` (−21.5, 2), `s14` (−29, −4.5), `s15` (−31, −16), `s6` (−26, −26); y 1.3 | **`tavernS16`**, **`gardenS13`**, **`s13S14`**; rope `s8S14` 2.0, rope `towerS6` 1.8; boardwalks `gardenS8` 4.4, `s14S15` 6.5, `s15S16` 8.0 ("Market Walk"), `s15S6` 6.0 | homeA, bakery, school, park, market, windmill |
| **Lantern Lane** (orange · the Music Hall's shell roof; lanterns on every post) | `s3` (−0.5, −29.5) y 1.6, `s4` (−7.6, −33.6) y 1.5, `s10` (−17.5, −38) y 1.6, `s12` (2, −40) y 1.6, `s5` (9.2, −31.5) y 1.8, `s11` (18, −36) y 1.6 | **`tavernS3`** (a ramp 1.3 → 1.6); rope `s4S3` 2.5; **the High Walk**, lantern-lit boardwalks `s10S4` 4.9, `s3S12` 5.2, `s12S5` 5.4, `s5S11` 3.8; boardwalks `s10Tower` 6.3, `s5S2` 3.8 | homeB, forge, farm, aquarium, music, museum |
| **Lighthouse Point** (teal and gold · the lighthouse) | `s2` (13.4, −23.2), `s7` (21.5, −22.5), `s17` (29.5, −25) y 1.6, `s9` (25, −6), `s18` (35, −12.5); **Fisher's Pier** (a 2.4 u wide pier from `s18`'s east edge to (47, −13.5), its centreline at **z −13.5**, y 1.3) | **`s1S2`**, **`yardS7`**, **`s7S17`**; rope `s2S7` 2.7, rope `yardS9` 2.2; boardwalks `s9S18` 6.3 ("Lighthouse Walk"), `s17S18` 8.2, `s7S11` 8.5 ("Long Walk"), the pier joined to `s18` by a portal | homeC, homeD, homeF, fishing, lighthouse |
| **Sunset Beach** (coral · the Treehouse's giant palm), a new islet | a sand circle at (−37, −31), r 6, profile `[[0, 1.9], [3, 1.7], [6, 1.3]]` | boardwalks `s6Beach` 4.3 and `s15Beach` 7.4 | homeE, grotto |
| **Lookout Hill** (meadow green · the Observatory's dome, the island's highest point), a new islet | a hill at (2, −54), r 9, profile `[[0, 4.4], [2.5, 4.2], [6, 2.6], [9, 1.6]]` (steepest 0.046 per 0.1 u, inside `CLIMB`); a ring path round the summit's pad, the Villa's pad on the east shoulder with ≥ 1.8 u of path between the two pads and round both | stone steps `s12Hill` 2.3 (y 1.6 → 1.6, white step edges) | homeG, observatory |

So: **7 scenery bridges made walkable, 5 new rope bridges, 16 new boardwalks** (the stone steps counted as one), the
17 shack platforms (`s2`–`s18`; `s1` already), 2 islets and Fisher's Pier; 1N's measured lengths go in §19.

**Never walled in.** Every district except Lookout Hill and Fisher's Pier lies on a **ring** (Windmill Row: tavern →
`s16` → `s15` → `s14` → `s8` → garden → plaza → tavern; Lantern Lane: tavern → `s3` → … → `s11` → `s7` → yard → plaza;
Lighthouse Point: yard → `s7` → `s17` → `s18` → `s9` → yard; Sunset Beach: `s15` → `s6` → beach → `s15`); the hill and
the pier are short **spurs** (one way in, ≤ 12 u from their mouth, wide everywhere, room to turn). The captain can always
walk back the way he came.

**Keep-offs.** No new deck or link comes within 2 u of a moored boat's sway circle (the five moored rowboats, the barge,
and **the fisherman's rowboat swinging at anchor off the garden** at (−15.2, 4.6), sparrow.js:5033–5045, whose sway
circle is its 1.5 u half-length as it turns about its centre), within 2 u of a **moored prize's hull envelope** (the
largest enemy hull, 17 × 5.6 u, at the berth's heading, + 0.5 u of bob; berths (29.5, 3) and (41, −3.5)), or within
2 u of the visiting cutter's hull at any sway. (Measured from the berth points instead, `s18`'s deck and the pier both
sit 7.8 u from berth 2; from the hull envelope `s18` is 3.8 u clear and the pier, at z −13.5, ≈ 4.4 u, so berth 2 does
not move.) **The cutter anchors at (40, −21) under `v4`, unconditionally** (a position constant; no `rand()` change):
at today's (28.5, −13.5) it sits 3.15 u from `s18`'s deck and 4.38 u from the `s9S18` centreline, inside its 3.5 u
half-length + the boardwalk's 1.0 u half-width + 2 u. At (40, −21) it is ≥ 7.2 u from `s18`, the pier and `s17`, and 8.0 u from the
`s17S18` boardwalk; 1N re-runs the shipyard showcase ray probe with it there. A rowboat in the way moves the same way.
islandPlan's `KEEP_OFF` lists every circle and envelope; a Node test checks it.

### 6.3 Platforms, pads and porches (what changes in the walk data, and what never does)

- **Each shack platform `s2`–`s18` becomes a walkable deck** (a walk rect at its height) with its building on a
  **pad**: the plot's **tier-3 footprint + 0.2 u** (measured from its tier-3 chunk in the plot's frame), which is a walk
  **blocker** (a box, as tall as the plot's max height) and a **camera box** (pad × deck − 0.3 .. deck + max height)
  **from tier 0**, so the walk data never changes with tiers (SPEC3 §8.1's promise kept). For the ten SPEC3 plots this
  **replaces** today's platform-wide camera envelope (3832): the captain now stands on the platform beside the pad, so a
  platform-wide box would collapse the walk camera's boom on him. Their tier art is **not** re-authored; the pads come
  from Stage 0's measurement of today's chunks (§12). The seven new shack plots get pad limits derived from their link
  mouths (§4.1, listed in `PADS` by Stage 0), and buildings4.js builds within them.
- **A porch** of ≥ **1.6 u** of deck stays free between the pad and the platform's edge on every side a link reaches,
  and in front of the plot's board (the pad limits of §4.1 build this in). Only where less would be left (a pad limit
  under 3.0 × 3.0 u, or one of the ten measured SPEC3 pads) does the platform gain a **porch extension** (new planks on
  stilts outside its edge, from districts.js): the exception, not the rule. Where a scenery bridge's mouth would land inside a pad, that plot's kit
  group is offset up to 0.6 u away from the mouth in the plot's frame (a group offset: no art change, no `rand()` change).
  A test checks every tier's chunk fits its pad (every vertex above deck + 0.3 inside the pad, 0.05 u tolerance) and
  every mouth lands on free deck.
- **Props on newly walkable decks** (laundry lines, porch folk, barrels, nets, the "Build me!" boards): each is inside
  its pad, or becomes a blocker (barrels, posts, r ≥ their footprint), or a person in `folk()` (porch folk, r 0.35, so
  the captain squeezes past), or is moved onto the pad edge; hanging lines higher than 2.0 u stay (camera boxes if they
  sit in the boom's way). Nothing new is drawn from `rand()`: moved props move by constant offsets.
- **Islets** are sand circles with profiles (the hill's mass also gets stacked camera cylinders matching its profile, so
  the boom never enters it); their plots have pads like the platforms'.
- **Plot places** `plot:<id>` (21; `r` 1.0) on each porch at its board; the place's `cam` frames the plot (§8.5).
- **The seven scenery bridges** gain `{ walk }` with their **existing curves** (their art and `rand()` draws are
  unchanged; only their walk links and the post blockers that `bridge({ walk })` adds are new).

**What `env.walk` gains with `v4`** (and nothing else changes): `areas` + 17 platform decks, the porch extensions, 2
islets, Fisher's Pier and its portal; `links` + 7 + 5 + 16; `blockers` + 21 pads and the new bridges' and boardwalks'
posts; `camBlockers`: the ten platform envelopes become pads, + 11 new pads, + the hill's cylinders; `places` + 21 plot
places + `lookout` (§6.7) + `zip` (§6.8, if built); `paths` (it exists today: 6 `'walker'` and 8 `'villager'`
loops) + the islanders' loops, **appended after today's** with kind `'islander'`; and three new lists: `bridges` (every
rendered bridge's art id, its link id and its `kind`, for the "every bridge mesh is walkable" test), `hops` (one per
district, §8.5) and `districts` (each district's polygon, colour and arch line). `radius`, `spawn`, `npcs` and `doors`
are kept exactly. With `v4` false, `env.walk` is exactly today's (the fixture `sparrow-walk.json` is unchanged); the
`v4` walk is dumped to **`tests/fixtures/sparrow-walk-v4.json`**.

### 6.4 Readable from the walk camera (wayfinding)

1. **Signposts** at every junction (14 or more): an arrow board per way with the district's icon, colour and one word
   ("Beach", "Hill", "Harbour", "Lanterns", "Lighthouse", "Windmill"). Their boards are painted into the town's sign
   texture and baked (+0 calls).
2. **Named arches** at each district's entrance ("LANTERN LANE", hung with paper lanterns; "SUNSET BEACH" of
   driftwood…). Walking under one shows a 2 s toast (`#town-toast`) and says it in `#town-live` ("Lantern Lane").
3. **One landmark per direction:** the lighthouse east, the windmill west, the Observatory's dome north, the
   Treehouse's giant palm north-west; the tavern's chimney smoke means "home".
4. **The High Walk's lanterns** glow even at noon (vertex glow in the bake), so the raised back row reads as one ribbon.
5. **District colours** on rails, bunting and arches (colour is never the only cue: the words and icons carry it).
6. **Camera clearance** is deck + 0.9 everywhere (the hill too); on the hilltop the walk camera's pitch is at least 0.3
   rad, so the view looks out over the town.

### 6.5 The walking bug stays fixed

- Every drawn islander is a `walker()`-shaped person in `folk()` (§7.3; one the crowd director doesn't draw leaves
  `folk()`, §7.2): they **wait** while the captain stands 0–1.0 u ahead
  (LOOK-2) and he **squeezes past** anyone he walks into for 0.25 s (SPEC3 §0.3). No other rule is added.
- Routines **never pause** on a link, within 2 u of a link's mouth, in a doorway, inside a place's circle (plot boards
  included), at the foot of the lookout ladder or the zip-line post, or at the gangplank; **≤ 2 walkers' loops cross any
  short rope bridge and ≤ 1 any of the five long ones** (`yardS7`, `tavernS3`, `gardenS13`, `s13S14`, `s7S17`, §6.2;
  none pauses on them or within 2 u of their mouths); long routes use the boardwalks; workers stand ≥ 1 u off every
  walker path (like Bess and Barnacle).
- **Animals never block:** they are not in `folk()` and have no blocker; one within 1.2 u of the captain hops 1.5 u
  aside (visual only).
- The four old bridges' mouths get no new pauses or new crossing loops beyond today's (ashore's "walking (a)" sits at
  0.97 s of its 1 s limit, and the limit is never raised).
- **Tests** (§13): Node — every area and link reached from the spawn, every rendered bridge has a link, pads blocked,
  porches ≥ 1.6 u, 10,000 random steps, a jog held across every link from both ends at 10 headings, Bess and Barnacle
  and every worker ≥ 1 u off every path, `KEEP_OFF`; browser — a held key, a held stick and a tap-to-walk cross **every
  new link both ways** **with the crowd at its maximum** (every plot at tier 3), sampled as §13.2 isle4 (b) says: all
  three modes at 10 moments of the islanders' rounds on every rope bridge, **the five long scenery bridges by name**
  among them, and on the boardwalks and steps the key and the stick at 3 moments and the tap at 1; never stuck > 1 s
  in 30 s of random input, no islander stopping on a link or in a place circle (sampled over 120 s).

### 6.6 The walk engine (`src/walk.js`)

`graph()` gets a **spatial hash**: nodes dedupe through a 0.2 u grid map and edges are built only between nodes in the
same or neighbouring `LINK`-sized cells. It gives **the same nodes in the same order and the same edges** as today
(edges sorted `[i, j]` with i < j, as today), so every existing walk result is unchanged; a Node test compares the two
on today's fixture and on the `v4` fixture.

The pair loop is not the main cost: `clear()` for every candidate pair within 1.75 u is, and it grows with the number
of edges (today's island: 475 nodes, 2,513 edges, ≈ 56–65 ms, `clear()` alone ≈ 38 ms; a 5× synthetic copy, 2,375
nodes and 12,565 edges, ≈ 213 ms, worst path within one copy 14.8 ms against today's 4.6 ms; measured on the spec
check's machine). So, with identical nodes and edges kept:

- `near()` uses the same spatial hash (it is O(n) today), A* reuses typed arrays sized once per graph instead of
  allocating n-sized arrays on every `path()`, and `clear(a, b)` is memoised per node pair (string pulling asks the
  same pairs again).
- The graph is **built once at dock open, behind the "Rowing to…" toast** (town.js reads `walk.graph` there), never
  lazily at the first tap-to-walk or Walk there, which would stall a frame on the iPhone.
- **Budgets** (on the test machine; Stage 0 records the baseline of today's walk.js on today's fixture and on a
  v4-sized synthetic island, §12): **graph ≤ 300 ms** (built once, behind the toast) and **`path()` ≤ 20 ms** (worst of
  all place pairs) on the v4 fixture. There is no 50 ms target: today's island already takes more.

### 6.7 The lookout (the crow's nest)

The crow's nest is visible planks high above the tower raft, so it is reachable, but not as a walk area (§0.1): a
place **`lookout`** (r 1.0) at the tower's ladder foot on the tower raft, ≥ 2 u from the `tavernTower` mouth and outside
the quiz's circle. `E` (or the Go-in button, which reads **Climb**) plays a 1.2 s climb (a cut under reduced motion) and
opens the view **`lookout`**: the captain stands in the nest, the camera pulls out to a panorama of the whole island
("Land ho!"); ← → (or a drag) turn the view; any move key, `Esc`, a tap on **Climb down** (`#lookout-down-btn`, 44 px)
or 30 s idle climbs down to the ladder foot. Nothing else changes. The panorama is in the draw-call probe (§14).

### 6.8 The zip line (cut first, §17)

A place **`zip`** at a post on Lookout Hill's south-west path: `E` reads "Ride the zip line!" and the captain rides a
rope one way down to the tower raft (≈ 30 u in 5 s, his hat flapping; a 0.6 s fade under reduced motion). Both ends are
on the main walk graph, so it is never the only way back. Like every ride or hop (§8.5) it is refused during a build
scene or with a panel open, ends with `env.setCaptain` and the camera updated, and never leaves the captain inside a
blocker (it lands him on the snapped landing point).

---------------------------------------------------------------------------------------------------

## 7. The islanders: people, sea folk and animals

Who lives where, their looks, routines and lines are data in the pure **`src/islanders.js`**; the people are built and
walked by **`src/env/folk4.js`** (sparrow.js hosts them in `folk()`); the animals by **`src/critters.js`**. Each building
brings its own (from the tier in brackets); today's townsfolk and villagers stay.

### 7.1 Who lives on the island (one table)

Looks are `people.js` options (`share: true`, `detail: 'low'`); new options in **bold** (§11.1). Every `kid` and `old`
look names **`girl: true | false`** (people.js otherwise rolls their gender from the seed, so Granny Wren, Granny Pearl,
Stella and the girls would depend on seed luck, and a bearded grandpa could roll a grandma). Each routine is a loop
of stations over an "ashore day" of 120 s (a pure function of the town clock and the islander's seed); stations use
existing actions. Every line is ≤ 70 characters (it fits a 320 px bubble), and at least one line of each islander who
meets a new foe teaches its counter; a line that names a key has a touch variant (`linesFor(id, progress, touch)`).

| Islander (building, tier) | Trade / age | Look | Routine (stations) | Lines (a hello; a counter or progress line) | Reacts to the captain |
|---|---|---|---|---|---|
| Finn (Fishing Hut, 1) | fisherman, old | `old`, **`souwester`** yellow hat, oilskin coat, `rod` | Fisher's Pier end `fish` 30 s → `carry` a crate along the Lighthouse Walk to the market → bench `sit` 15 s | "Biting today, Cap'n!" · "Puffers ate my bait! Pop them from far away." | waves; turns to face him in a chat |
| Marina (Fishing Hut, 2) | fishwife | `woman`, `kerchief`, blue stripes, **`basket`** | pier `fish` → the market stall `idle` 20 s → back | "Two fish for a doubloon!" · "Coral currents give you free speed." | waves |
| Bosun Jib and Nell (Houseboat, 1) | a sailor couple | `pirate` grey braids, stripes / `woman`, `kerchief` | the mooring `haul` 15 s → tavern rail `lean` 20 s → back | "Fair winds, Captain!" · "A Sting Sloop hides behind you. Turn!" | Jib salutes, Nell waves |
| Grandpa Barnaby (Houseboat, 2) | grandparent | `old`, glasses, `cap`, full beard | a bench on `s17` `sit` 40 s → a slow walk (×0.6) to the pier | "In my day the Kraken was THIS big!" | a slow wave |
| Granny Wren (Treehouse, 1) | grandparent | `old`, shawl (coat), glasses | knits on the Treehouse porch `sit` 50 s → walks the beach | "Mind the coconuts, dearie! Grape tips those monkeys over." | waves her knitting |
| Kip and Moss (Treehouse, 1 / 2) | kids | `kid`, `cap`, bright stripes | tag on the beach `run` → the swing `sit` → hide-and-seek `point` | "Are you a REAL captain?" · "We saw a sea serpent! It gets dizzy!" | run a circle round him, `cheer` |
| Granny Pearl and Grandpa Jack (Villa, 1) | grandparents | `old`, glasses / `old`, `cap`, full beard | the hill path (×0.6) → the Villa's bench `sit` 40 s → feed Whiskers `idle` | "What a view from up here!" · "The Shellback? It's just a big crab, dear." | Jack tips his cap |
| Lily and Tom (Villa, 2) | kids (cousins) | `kid`, `straw` / `kid`, `bandana` | roll a hoop down the hill path `run` → the Observatory steps `point` | "Race you to the top!" | `cheer` |
| Ada (Forge, 1) | blacksmith | `woman`, red `bandana`, dark vest, **`apron`**, `hammer` | anvil `hammer` 20 s → quench `carry` → sharpen `scrub` | "Netted? Hold G and cut it! My knives cut faster." (touch: "Netted? Hold CUT! My knives cut faster.") | a nod, sparks |
| Ida (Forge, 2) | apprentice | `kid`, **`apron`**, `bucket` | the bellows `haul` → `carry` coal | "I'm making horseshoes for seahorses!" | waves |
| Farmer Bo (Goat Farm, 1) | farmer | `man`, `straw`, vest, `bucket` | `carry` hay → `run` after a goat → the fence `sit` | "Meet Nibbles. She eats EVERYTHING." | waves his bucket |
| Hettie (Goat Farm, 2) | farmer | `woman`, `straw`, **`basket`** | the orchard `carry` → the cheese stall `idle` | "Goat's cheese, Captain?" | waves |
| Piper Paz, Drummer Dot, Squeezebox Sid (Music Hall, 1 / 2 / 3) | musicians | `pirate` `fiddle` / `woman` **`drum`** / `old` **`squeezebox`** | play on the hall's stage 30 s (`fiddle`, `hammer` on the drum, `fiddle` with the squeezebox) → a bow `proud` → the tavern | "♪ Heave ho, the Kraken's gone! ♪" | the band strikes up as he passes |
| Curator Quill (Museum, 1) | curator, old | `old`, glasses, `bicorne`, `tape` | `measure` the bottle-ships 20 s → the steps `point` | "Capture a ship and I'll make a model of it!" | a bow |
| Fern and Ollie (Museum, 3) | tourists | `woman`, `straw` / `kid` | round the gallery's porch `point` → `wave` | "Look, a real captain!" | `wave` |
| Stella (Observatory, 1) | stargazer, old | `old` woman, **`startop`**, **`spyglass`** | `point` at the sky 20 s → the hilltop ring path → `measure` | "Fog can't hide from my spyglass!" | waves |
| Coral (Aquarium, 1) | aquarist | `woman`, teal shirt, `bucket` | `carry` to the tanks → `wave` at the turtles → `scrub` the glass | "Hit old Coilback's head while it's dizzy!" | waves |
| Pip (Aquarium, 3) | a visiting kid | `kid`, `cap` | nose to the glass `idle` → `run` | "The puffers here are friendly!" | `cheer` |
| Nerissa and Kai (Mermaid Grotto, 1) | **merfolk** | `woman` / `man` with **`tail: true`** (a lathed tail on the leg bones), a shell top / a kelp sash | sit on a rock in the grotto `sit` → `wave` → dive for 3 s (sink below the water, visual) | "Mind old Coilback in the Spires!" · "The sea is singing today!" | wave from the water |
| Bun, Mo, Lars, Tam, Miss Page, Rosa (today's Bakery, Windmill, Lighthouse, Market, School, Park, 1) | baker, miller, lighthouse keeper, trader, teacher, gardener | `woman` **`toque`** **`apron`** / `man` `cap` / `old` `lantern` / `woman` `crate` / `woman` glasses **`book`** / `woman` `straw` `bucket` | each at its building, with a short walk on its porch | "Fresh biscuits today!" · "Puffs of powder, Captain!" · "My light is on for you." · … | each waves |
| Chip, Mortar and Dab (Builder Bess's crew) | builders | `man` `hammer` / `old` `crate` / `kid` **`apron`** `bucket` | only in the construction scene (§5) | "Let's build!" | cheer at the end |

**33 islanders** (and the three builders); `ISLANDERS` holds at most 40 rows. A home's islanders are its villagers out
and about (§4.1); an amenity's work there. Before a building stands nobody lives in it.

**Animals** (`ANIMALS`; one InstancedMesh + ink twin per species, animated through instance matrices: hop, bob,
waddle, wag, flap, scuttle):

| Species | At most | Where (brought by) | Routine | Near the captain / pet it (`E` or a tap) |
|---|---|---|---|---|
| Cats (ginger, black, calico) | 4 | the fishing hut (2), the Villa (Whiskers), the tavern roof (1, with `v4`) | nap in the sun, stretch, follow Finn | "Purr…" and a heart; rubs round his legs if he stands still |
| Dogs | 3 | the Houseboat (Salty), the Forge (Bolt), the harbour (1, with `v4`) | trot after their owner, sit, chase the kids | "Woof!" and a circle round him |
| Goats | 6 | the Goat Farm's pen and Lookout Hill (2 / 4 / 6), one on the barn roof | graze, climb rocks | "Meeeh!" |
| Birds (parrots, an owl) | 5 | the Museum's parrot, Hoot at the Observatory, 3 tavern parrots (with `v4`) | perch, hop, a short flight every 20 s (the gulls' code) | "Pieces of eight!" (`squawk`) / "Hoo!" |
| Monkeys | 3 | the Treehouse (Coco, then a second), the palms | swing, peel a banana | a giggle (`giggle`) and a cheeky wave |
| Crabs | 7 | Sunset Beach and Fisher's Pier (6, with `v4`), the baby hermit crab after the Shellback (1) | scuttle sideways, dig in | "Click-click!", ducks into its shell |
| Turtles | 4 | the Aquarium's pool (2), the Grotto (2) | crawl to the water and back | a slow blink (turtles are silent: no sound) |

Animals never block (§6.5): no blocker, not in `folk()`, a hop aside within 1.2 u.

### 7.2 The crowd director (one cap for every full-detail person)

- **One cap**, `PEOPLE_DRAWN`, covers **every full-detail person in the town walk view**: townsfolk, villagers,
  islanders, NPCs (Bess, Barnacle), builders and merfolk. Stage 0 measures **P₀**, today's peak count of people drawn in
  the walk view at the probe (the 401-call view), and sets `PEOPLE_DRAWN = P₀ + 2` (starting value 20, recorded in §19).
- `islanders.plan(viewer, people, prev, t)` (pure) picks who is drawn every 0.25 s, **in this priority order, with a
  hard cap of `PEOPLE_DRAWN`**: (1) the islander he is chatting with; (2) everyone within 2 u of the captain; (3)
  everyone within 6 u, nearest first; (4) the nearest in front of the camera within **34 u** (today's townsfolk cull of
  40 u tightens to 34 u under `v4`), with 1.5 u of hysteresis, at most one swap a frame. The cap always wins (the plaza
  can hold more than 20 people within 6 u while the Music Hall's band plays). The rest are "at home" or "at work
  indoors" (lit windows) and keep walking their routines invisibly; **a person not drawn leaves `folk()`** (he can't
  block the captain) and still does LOOK-2's waiting, so nobody hidden can ever be in the captain's way.
- Under `v4`, **`env.cull(x, z, radius, near)` is the director's entry point**: the viewer is the lens at (x, z)
  looking at the captain (`setCaptain`), and `radius` is clamped to `CULL4`. So every caller of `cull()` (townMode's
  frame, and ashore.cjs's hand-driven `P.step`, which calls it directly at :624) runs the director with no change.
- **The shipyard view** hides islanders, builders and animals (as it hides villagers today, SPEC3 §8.4).
- Islanders, builders and merfolk are **built one per frame from dock open** behind the "Rowing to…" toast (never on Go
  ashore), `share: true`, `detail: 'low'` (≤ 4,000 triangles each); the dock frame stays ≤ 1.5 M triangles (the summed
  plan of §14.2).
- **Drop order:** §14.2's (animals beyond five species first, then the people cap back to P₀).

### 7.3 Routines and the walking bug

- Every islander that walks is a `walker()`-shaped entry in `folk()` (r 0.35), so LOOK-2's waiting and the squeeze-past
  cover them (§6.5); one that stands at a station is a `person()` there, ≥ 1 u off every walker path.
- Their loops run along the decks' and boardwalks' centrelines (islandPlan `ISLANDER_PATHS`, the **only** home of
  station and path coordinates); a loop **never pauses** on a link, within 2 u of a mouth, in a doorway, inside a place
  circle (plot boards, the lookout and zip posts included) or at the gangplank; ≤ 2 loops cross any short rope bridge
  and ≤ 1 any of the five long ones (§6.2); two loops on the same boardwalk keep ≥ 0.7 u apart at their centrelines
  (they pass on its 1.8 u). The Music Hall's dance spots on the plaza (tier 3) are stations like any other: outside
  every place circle and the gangplank, ≥ 1 u off every walker path.
- The routines' clock is the town's visual time; a routine is a pure function of it and of the layout passed in
  (`routinePose(id, t, layout)`, `layout` = islandPlan's exports), so a test can set any moment of the day and
  islanders.js stays pure (it imports nothing).

### 7.4 Talk and pet

- Within **1.6 u** of an islander, facing within ±60°, with no door, place or plot board in reach (**a door always
  wins**, then a plot board, then a talk, then a pet), the prompt reads "Talk to Ada (E)" and on touch the round
  Go-in button reads **Talk**. `E`, `Enter` or a tap: the islander turns and waves, and 2–3 lines show in
  **`#talk-bubble`** (read by `#town-live`); `E` / `Enter` / a tap on **Next** (`#talk-next-btn`, 44 px) for the next
  line; walking 3 u away or `Esc` ends it. Lines follow progress and the device (`linesFor(id, progress, touch)`: the
  level reached, the buildings, the Kraken and Shellback feats; a key's touch wording on a touch device).
- **A tap on an islander** walks the captain up to them and starts the chat (as SPEC3 §19 TOWN-TAPNPC does for Bess and
  Barnacle).
- **Pet an animal:** within 1.6 u, `E` or a tap: its word and a heart pop (one per 2 s per animal), its sound (`purr`,
  `woof`, `meh`, `squawk` / `hoot`, `giggle`, `click`; turtles are silent); nothing else.
- **Without walking:** the Island map lists every islander of each district with a **Talk** button that opens their
  chat bubble at once (§8.5); keyboard and screen-reader users never need to walk.
- Today's greetings and the villagers' waves stay (SPEC3 §8.4): one bubble at a time, 20 s per person.

---------------------------------------------------------------------------------------------------

## 8. UI and controls (keyboard and touch, portrait phones first)

### 8.1 Keys (checked against every existing binding; no new battle key, no new act-pad button)

| Where | Key | Action |
|---|---|---|
| Battle, netted | **G** | hold 0.8 s (the Forge: 0.6 / 0.45 / 0.3 s) or press 3 times: cut the net (the raider-cut code path, SPEC3 §5.7.3's grab rules); touch: hold **CUT!** (the Board pill) |
| Battle | **G** at a pseudo target | "Too small to board!" / "You can't board a sea monster!" / "Too big to board! Knock it down." in the hint bubble |
| Battle | any key / tap | skips the Shellback's wake (like the fly-in) and dismisses a meet card early (it never pauses the game) |
| Town | **E** / Enter / Space | the door's or place's action first; then a plot board ("Build here"); then **Talk** to an islander; then pet an animal (§7.4) |
| Town | **I** | the Island map (§8.5); `Esc` closes it |
| Town, the lookout | ← → / drag; any move key, `Esc` | turn the view; climb down |
| Town, a construction scene | any non-modifier key, a tap, **Skip** | skip to the end (§5.2); `Esc` skips, a second `Esc` leaves the panel |
| Build panel | ← → / Home / End on the district tabs; Enter / Space on a row's button; `Esc` | as SPEC3 §6.1 |

Help texts gain "<kbd>I</kbd> island map" in the town's controls line and "Hold <kbd>G</kbd> to cut a net" in the
title's and pause dialog's `.controls` lists (touch: "Hold CUT! to cut a net").

### 8.2 Battle HUD additions (ids created in Stage 0, hidden)

| Element | Where | Content / rules |
|---|---|---|
| `#meet-card` (`#meet-icon`, `#meet-name`, `#meet-line`) | the banner slot (it waits for a showing banner; a banner waits for it) | §3.4; `aria-hidden` (its text goes to `#game-live`); never covers the fire or steering pads; at 320×480 it wraps to two lines |
| `#grab-strip` (reused) | top centre | "NETTED! Hold G to cut it" (touch: "Hold CUT! to cut it") + "TANGLED: half speed, slow turns" + the 4 s release bar; the Board pill reads **CUT!** |
| `#fog-chip` | beside the hull bar | "HIDDEN" (an eye-with-a-slash icon + the word) while you are inside a fog bank |
| the Fire cells | as today | read **FOG!** while the auto-aim has nothing to aim at only because of fog (§2.6) |
| `#edge-arrow` (reused) | screen edge | "WAVE!" (SPEC3), now also **BEHIND YOU!** (gold, the Sting Sloop) and an arrow to any off-screen warning shape within `FRAME.ringReach` |
| `#boss`, `#boss-notches`, `#boss-status` (reused) | top | "THE SHELLBACK", notches at 2/3 and 1/3, its status badge |
| `#shellback-retry-btn` | first button of the shipwreck panel, only after the Shellback's checkpoint | "Try again from the Shellback" |
| `#game-live` | as today | + meet cards, nets, fog ("Hidden in the fog"), the tide, forts ("A Rock Fort is aiming at you"), the Coilback ("Old Coilback dived"), the Shellback's attacks (≤ one per 3 s), de-duplicated |

**Minimap** (`drawMinimap`): fog banks (pale blobs) and "?" ships; currents (arrows); tide bars (dashed outlines while
warned, filled while out); jollyboat packs (small yellow dots), puffers (orange dots with spikes), Old Coilback (a teal
squiggle; under water only with the Observatory: its bubbles), forts (a square) with their line while sighting; the
Shellback (a red crab outline) and its rings, sectors and lanes.

**Tags** (`tags.js`, §3.3): one per pack, fort and Coilback; the NEW badge; UNDER WATER; no new tag kinds for puffers.

**Portrait framing:** every new warning shape whose edge comes within `FRAME.ringReach` (+ half a hull) of your ship,
now or where it will be when it lands, joins the framing's must-see group (SPEC3 §19 kraken4:F1), so on an iPhone held
upright the 1.5 s warning is always on screen.

### 8.3 Title, Victory and shipwreck screens

- The title: §2.2 (four groups, 12 cards, card 10 "Drive off the Kraken", the compact pill from 10, the open card
  scrolled into view). The tagline and the page's meta description keep the words "Far Seas" (levels.cjs:432) and add
  the Sunset Isles. No page scroll at any F01 size (the panel scrolls inside; Set sail! stays pinned).
- Level 9's Victory gains the teaser and "Sail on to the Sunset Isles" (§2.2); level 12's is the final Victory.
- Every cleared level, finales included, shows the island's lines (SPEC3 §6.6) plus the new ones: "Villagers' gift +N"
  (today's gift + `gift4`), "Fishers' catch +40", "Museum +30" (the sum of this level's capture bonuses), "Aquarium
  +20"; and on a pool level "The seas will change next time!". On a finale they go in `#won-chest` above the banked line,
  with "The Golden Conch +1,200" on level 12.
- Shipwreck: `#shellback-retry-btn` first after the checkpoint; with the Mermaid Grotto, "The merfolk saved 45 gold!"
  (and the gold goes to the chest, §10.2).

### 8.4 One-time tips (`pirates-ahoy-voyage4` field `tips`, 0..65535; `pirates-ahoy-tips` is not touched)

| Bit | Trigger | Keyboard / touch text |
|---|---|---|
| 1 | first time the auto-aim has nothing to aim at because of fog | "Hidden in the fog! Fire anyway, or sail closer." |
| 2 | first net | "NETTED! Hold <kbd>G</kbd> to cut it" / "Hold CUT! to cut it" |
| 4 | first Coilback dive | "Old Coilback dived! Watch for its green lane." |
| 8 | first fort sighting | "A red line! Change course before it goes solid." |
| 16 | first low-tide warning | "Low tide! Sandbars slow you down." |
| 32 | first time an islander is in reach | "Press <kbd>E</kbd> to talk" / "Tap Talk" |
| 64 | first dock visit with Voyage IV open | the "New!" badge on the Harbour menu's **Island map** button (not a hint) |
| 128 | first time a plot board is in reach | "Press <kbd>E</kbd> to build here" / "Tap Build" |

### 8.5 Ashore: places, plot boards, the Island map and hops

- **The places bar keeps its six buttons** (Shipyard, Tailor, Tavern, Quiz, Build, Set sail; 44 px icon-only below
  760 px and on short landscape, SPEC3 §7.1). Nothing is added to it.
- **Plot boards:** each plot's place `plot:<id>` on its porch; at it the prompt reads "Build here: Treehouse (E)" and the
  Go-in button **Build**; `E` / Enter / a tap opens Bess's panel **at that plot's row** (`open('builder', { plot: id })`,
  the panel's district tab chosen and the row focused, the camera on the plot). Walking to Bess still works as today.
- **The Island map** (`src/islandMap.js`, the overlay `#island-map`, non-modal like the tavern): `I`, or the Harbour
  menu's new **Island map** button (`#harbour-map-btn`). A parchment SVG drawn from `env.walk` and islandPlan's
  districts (decks, bridges, building icons, district colours and names) with a "You are here" sparrow pin; beside it
  (below it in portrait) a district-grouped list of **≥ 44 px buttons**: each district, each plot ("Treehouse ·
  Tier 2"), each islander there ("Talk to Ada"). A pick of a district or plot offers **Walk there** (the captain
  auto-walks, today's `walkTo` and `goTo`) or **Hop there** (`#map-hop-btn`: a 0.6 s fade, a cut under reduced motion,
  to the district's or plot's hop point, `walk.hops`); a pick of an islander opens their chat bubble at once. Focus
  starts on the district you are in; `Esc` closes and returns focus; `#map-live` announces the pick.
- **Hops and rides** (Hop there, the zip line, the lookout's climb) are refused during a construction scene or with a
  panel open ("Finish building first!"), always land the captain on a free, snapped point of the walk (never inside a
  blocker), and update `env.setCaptain` and the camera (a fresh boom).
- **The Harbour menu** gains **Island map** (`#harbour-map-btn`); its existing buttons are unchanged (its `>= 5`
  buttons check still holds).
- **District toasts:** walking under a district's arch shows its name for 2 s (`#town-toast`, `aria-hidden`) and says it
  in `#town-live`.

### 8.6 Builder Bess's panel with 21 plots (`src/buildPanel.js`)

- With `v4`, the panel's tabs are the **four districts** instead of Homes | Amenities: **Windmill Row** (6 rows),
  **Lantern Lane** (6), **Lighthouse Point** (5), **Beach & Hill** (4) (`role="tablist"`, ←/→/Home/End; ids
  `#build-tab-windmill`, `#build-tab-lantern`, `#build-tab-lighthouse`, `#build-tab-beach` and their panels). Tabs
  don't change a row's height (today's Amenities tab already holds 6 rows), so what keeps the known 320×480 "only one
  row shows" issue from getting worse is the **row height**: a built row is **no taller than today's** at 320×480 (Watch
  again sits inline in the row's button bar, same height, §5.2; a layout check in 1R's exit and isle4.cjs measures it);
  the list scrolls inside the sheet; the plot boards (§8.5) open the right row directly. Without `v4`, the panel is
  exactly today's.
- Each row as SPEC3 §8.3 (icon, name, tier pips + "Tier 2 of 3", Now / Next, one button) plus: the not-on-sale state
  ("Opens after The Kraken's Deep", `aria-disabled`, described), the **building** state (every Build button reads
  "Building…" while a scene runs), and on built rows a **Watch again** icon button (44 × 44, inline at the end of the
  row's button bar, `aria-label` "Watch the Treehouse go up again").
- The header: "Builder Bess · Build the island", the chest, "Villagers 28 · Grand Port" (`rank4`).
- During a scene the sheet folds to the 56 px bar (§5.2) and comes back with focus on the row's button.
- Contrast ≥ 4.5:1, every target ≥ 44 px, no page scroll at the 7 town sizes (SPEC3 §13.2's sizes).

### 8.7 The tavern's Sea Guide

A new section of the tavern's panel, **`#tavern-guide`** ("Sea Guide"), after the captain's log: one card per foe kind
of the whole game (the 16 ship types, the Kraken, and Voyage IV's 7 kinds and the Shellback: `GUIDE` in `guide.js`),
each with its icon, name, "What it does" and "How to beat it" in one line each, and "Beaten ×N" where counted. Unmet
Voyage IV kinds show a "?" silhouette with "Not met yet" (Voyages I–III's kinds count as met once their level is open).
Real headings and lists; read in order by screen readers; no new place.

---------------------------------------------------------------------------------------------------

## 9. Economy (every price in one table in one module; totals checked by Node tests)

| Sink | Total | Module |
|---|---|---|
| Shipyard (SPEC3) | 6,240 | `upgrades.js` |
| Tavern crew upgrades | 4,600 | `armory.js` |
| Powder recipes | 1,100 | `specials.js` |
| Polly's priced items | 1,200 (the two new items are trophies) | `cosmetics.js` |
| The first ten plots | 11,800 | `island.js` `PLOTS` |
| **The eleven new plots** | **16,000** (homes 3,450, amenities 12,550) | `island.js` `PLOTS4` |
| **Everything** | **40,940** | |

| Income | Gold | Notes |
|---|---|---|
| Voyages I–III, first clears | ≈ 15,300–17,600 | SPEC3 §9 |
| **Voyage IV, first clear** | ≈ **9,500–11,000** | bonuses 1,800 + 2,100 + 3,000 = 6,900; the Golden Conch 1,200 (`SHELLBACK.conch`, on every L12 clear); loot and captures ≈ 1,400–2,900 (a pack 50, a fort 100, the Coilback's scale 150, puffers 2 each, a captured Sting Sloop 145, Net Sloop 125, the Witch 185, + today's types in the pools) |
| The quiz, once | 2,700 | SPEC3 |
| Villagers' gift | ≤ 240 + ≤ 120 a cleared level | `gift` + `gift4` |
| Market Hall | ≤ 300 a cleared level | SPEC3 |
| Fishers' catch | ≤ 60 a cleared level | `catchGold` |
| Trophy Museum | ≤ 200 a level | `museumGold` (per capture) |
| Aquarium | ≤ 150 a level | `aquariumGold` (per creature driven off) |
| Mermaid Grotto | ≤ 150 a wreck | `rescue` (10–30 % of the plunder you lose) |
| Replays | a level's loot + bonus each time | e.g. L12 ≈ 5,500 with the Conch |

A child who has played everything up to level 9 has earned about 18,000–20,300 (SPEC3 §9); Voyage IV's first clear adds
about 10,000, so about 28,000–31,000 against 40,940 of sinks: the rest takes **about one replay of Voyage IV** (whose
pools now draw new waves) or several earlier levels. Nothing pays without playing: every new income is per cleared
level, per capture, per creature or per wreck, and capped. Stage 3 measures the real numbers with bot v4 (§19).

---------------------------------------------------------------------------------------------------

## 10. Persistence (localStorage; every new record validated like `parseShipConfig`)

### 10.1 Records

| Key | Format | Validation (module) |
|---|---|---|
| `pirates-ahoy-unlocked` | integer | `loadInt(PROGRESS_KEY, 1, LEVELS.length, 1, true)`: max **12** once Voyage IV is live; the migration of §10.3 |
| `pirates-ahoy-island` | **unchanged** (SPEC3's 10 ids) | `parseIsland` unchanged; this build never writes a new id here |
| `pirates-ahoy-island4` (new) | `{"v":1,"t":{"homeE":0,"homeF":0,"homeG":0,"forge":0,"fishing":0,"farm":0,"music":0,"museum":0,"observatory":0,"aquarium":0,"grotto":0}}` | `parseIsland4` (island.js): ≤ 4 KB, JSON + the plain-integer reviver, tiers clamped to 0..3, known ids only, own properties only, unknown fields dropped, never throws; a record that needed fixing is rewritten |
| `pirates-ahoy-voyage4` (new) | `{"v":1,"plays":[0,0,0],"met":0,"won":0,"tips":0,"prizes":{}}` | `parseVoyage4` (pools.js): ≤ 2 KB; `plays` 3 plain integers 0..9999 (else 0); `met` 0..255 (bits over `V4_KINDS`); `won` 0 or 1; `tips` 0..65535; `prizes` only the keys `stinger`, `netsloop`, `witch`, plain integers 1..9,999 (cosmetics.js's `MAX_PRIZE`, the cap of the `feats.prizes` they restore; zeros left out); never throws |
| `pirates-ahoy-feats` | + `shell` (0..1), `island4` (0..33), written after `island` and before `prizes`; `prizes` keys gain `stinger`, `netsloop`, `witch` | `parseFeats` (cosmetics.js): `FEAT_IDS` + the two, both in `MAX_FEATS` (merged by max); `FEAT_MAX` + `shell: 1, island4: 33`; **`island` stays 30** |
| `pirates-ahoy-look` | accepts the trophies `hat.jeweled` and `pet.hermit` | `sanitizeLook` (cosmetics.js) |

Unchanged: `pirates-ahoy-ship`, `-armory`, `-powder`, `-quiz`, `-settings`, **`-tips`** (max 65,535; Voyage IV's tips
are in `-voyage4`), `-best`, `-purse`, `-tutorial-done`, `-muted`. The Shellback's checkpoint is session memory only.

### 10.2 Writing, storage blocked or full, two tabs, older tabs

- **Builds:** the plot's record first (`-island` for the ten SPEC3 plots, `-island4` for the new ones), the chest
  second (§0.1); if the record can't be written nothing is bought and the panel says why; every build resyncs both
  records and the chest first (`syncSaved`, `syncIsland`, `syncIsland4`). Then the scene (§5.1).
- **A clear of level 10–12:** `plays[level − 10] + 1` is written to `-voyage4` **before** the level's gold is banked; if
  it can't be written, `plays` rises in memory for the visit (the next start of that level this visit draws new waves)
  and the clear banks as usual.
- **Meeting a kind:** its `met` bit is written at once. **The Shellback driven off:** `won = 1` in `-voyage4`, then feat
  `shell` (both at once, before the Conch is banked).
- **Captures of the three new ship types** count in `feats.prizes` (saved with the feats at the level's end, as today)
  and are mirrored into `voyage4.prizes` at the same moment, `-voyage4` first.
- **Gold from the new buildings** (catch, Museum, Aquarium, `gift4`) is added to `state.gold` before the level is banked,
  like the Market and the gift (SPEC3 §8.1). **The Grotto's rescue** is a gift on a wreck: added to the chest and saved
  (`saveChest`); if that can't be saved the card says "Couldn't save the merfolk's gold" and nothing is owed (it was never
  the child's).
- **Re-derived at load and after every sync** (the stale-tab rule): `feats.island4 = max(feats.island4,
  tiersBuilt4(island4))`, `feats.shell = max(feats.shell, voyage4.won)`, and for each new ship type `feats.prizes[t] =
  max(feats.prizes[t], voyage4.prizes[t])`; if any rose, the feats are saved (`raiseRecordFeats`, extended).
- **Storage blocked:** the game starts from the defaults and works for the visit (builds last for the visit with "Couldn't
  save: your browser's storage is full or switched off" and no gold moved, as today). **Storage full:** the same refusals.
- **Two tabs:** the `storage` listener takes `-island4` (each tier the larger), `-voyage4` (`plays` the larger per level,
  `met` and `tips` or-ed, `won` the larger, `prizes` the larger per type) and `-feats` (as today, then the re-derive).
  Tiers, plays, met kinds, progress and feats only ever go up.
- **An older tab or cached build** (`eedb108`) open at the same time:

  | It meets | It does | This build |
  |---|---|---|
  | `-island4`, `-voyage4` | never reads or writes them | untouched |
  | `feats.shell`, `feats.island4`, the three new `prizes` keys | drops them and rewrites the feats | re-derives them at its next load or sync (above) |
  | `unlocked` 10–12 | clamps it to 9 in memory only (`keepHigher`), never lowers it on disk | reads 10–12 |
  | `look` wearing `hat.jeweled` / `pet.hermit` | resets the unknown item to its default and rewrites the look | the trophy stays won (the feat); the child picks it again (accepted, as SPEC3) |
  | `-tips` | unchanged (the new tips are in `-voyage4`) | — |

### 10.3 Migration of existing saves (nobody loses anything)

| Old save | At load |
|---|---|
| `unlocked ≥ 9` and `feats.kraken ≥ 1` (the Kraken driven off) | `raiseProgress(10)`: Voyage IV is open, level 9 is never replayed |
| no `-island4` | every new plot at tier 0 (today's shacks on the seven scenery platforms; boards on the islets); nothing written until a build |
| no `-voyage4` | `plays` 0, nothing met, no tips; written at the first need |
| a feats record without `shell` / `island4` | they read 0 and are raised from the records; the record is rewritten once (in every build from Stage 1, flag on or off: §0.1's one exception) |
| everything else | unchanged; no key is renamed or removed, no gold or progress moves |

---------------------------------------------------------------------------------------------------

## 11. Architecture

### 11.1 Modules (exact exports)

**`src/pools.js`** (new, pure) — §3.5, §10.1

```js
export const V4_KINDS = ['jolly', 'stinger', 'netsloop', 'puffer', 'witch', 'coilback', 'fort', 'shellback']; // met bit 1 << i
export const KIND_COST, INTRO, POOL_RULES, PACKS /* { jolly: 5, puffer: 4 } */, MEET /* { card: 3.5, grace: 4, newTag: 10 } */;
export function poolSeed(level, plays) → uint32
export function drawWaves(level, pool, seed) → string[][]          // every wave of the level; deterministic; never throws
export function waveProblems(level, index, wave, prev, pool) → string[]   // [] when the wave keeps every rule
export function slotsOf(wave) → number, isPseudo(kind) → boolean
export function defaultVoyage4(), parseVoyage4(raw), serializeVoyage4(rec), mergeVoyage4(a, b)
export function notePlay(rec, level) → rec, meet(rec, kind) → { rec, first }, markTip(rec, bit) → rec, notePrize(rec, type) → rec
```

**`src/mechanics4.js`** (new, pure) — §2.6, §3.1 (the ships' behaviours), `WARN`, `WORDS4`

```js
export const MECHANIC4_IDS = ['fog', 'currents', 'tide'];
export const STINGER, NET, WITCH, FOG, CURRENT, TIDE, WARN, WORDS4;
export function createMechanics4(ids, ctx) → {
  init(), onSpawn(e, waveIndex), onCapture(e), onSink(e), onRemove(e), step(dt),
  steer(e, dt) → { h, speed } | null, holdFire(e) → boolean, drift(s) → { vx, vz } | null, avoid() → [{ x, z, r }],
  shipMods(s) → { speedMul, capAdd, turnMul, spin },        // tide shallows on deep hulls, the Sting Sloop's dance
  playerMods() → { speedMul, turnMul, netted: { t, max } | null },
  hidden(target, viewer) → boolean, fogAt(x, z) → boolean,
  cut() → boolean, cutHold(down),                           // the net: RAIDERS.cutTaps / the Forge's hold (ctx.cutHold())
  objective(), minimap(), summary(), bonus(), visuals() → { fog, currents, tide, nets, songs, summons },
  get state, dispose()
}
// ctx = SPEC3's ctx3 (its hold() included) + { warn: { take(kind) → boolean, give(kind), boss }, cutHold() → s,
//   spyglass() → u, summon(kind, x, z, n, owner) (→ foes4.spawn(kind, x, z, { n, owner })), puffersAlive() → n,
//   tables: { RAIDERS, STATUS } }
```

`composeMechanics(parts)` (mechanics3.js, **generalised in Stage 0** from two parts to any number, the SPEC3 §11.1 rules
applied left to right): hooks fan out in order; `steer`: the first non-null; `drift`: summed, null when all are null;
`holdFire`: any; `avoid`, `minimap`, `summary`: concatenated in order; `bonus`: summed; `objective`: the non-null ones
joined with " · " (a's string unchanged when the others are null); `shipMods`: multipliers multiplied, adds added;
`state`: `{ ...a.state, m3: b.state }`, plus `m4: c.state` **only when a third part exists** (non-null), so Act II's
`ids`, `convoy`, `floes`, `current` stay top-level and `m3` stays where battle.cjs and levels.cjs read it, and a call
with a null third part gives today's state exactly (mechanics3.js:1500); `visuals`: `{ ...b.visuals(), ...c.visuals() }`
(b's alone without c); `krakenDue`: b's (a boolean, not merged); `addSlick`: calls b's (a function, not merged);
`hidden`, `fogAt`, `playerMods`, `cut`, `cutHold`: c's (identity when c has none). With two parts, or a null third
part, it returns exactly what it returns today.

**`src/foes4.js`** (new, pure) — the pseudo foes (§3.1)

```js
export const JOLLY, PUFFER, COILBACK, FORT, FOE_NAMES;
export function createFoes4(ctx) → {
  spawn(kind, x, z, opts) → id,            // 'jolly' (a pack), 'puffer' (a patch of min(opts.n ?? 4, 6 − alive); none free:
                                            //   a waiting patch that rises when one leaves), 'coilback', 'fort';
                                            //   opts = { n, owner } (owner: the summoning ship's id, or none for a wave's own)
  step(dt), slots() → n,                    // wave slots alive (a pack, an unowned patch (waiting or not), the Coilback, a fort:
                                            //   one each; owned puffers never count: they live in their owner's slot)
  alive(kind) → n, sendHome(owner),         // sends home only that owner's puffers (the Witch's fall); a wave's patch stays
  targets() → [{ id, kind, x, z, r, y0, y1, hp, maxHp, name, hidden }],
  hits(id, x, y, z) → boolean, hit(id, info) → { dmg, word } | null, special(id, ammo) → word | null,
  boardWhy(id) → 'small' | 'monster' | 'fort',
  tags() → [{ id, name, x, y, z, frac, count, under, isNew }],
  visuals() → { packs, coconuts, puffers, coilback, forts, rings, lanes, lines }, get state, dispose()
}
// ctx: { player() → { x, z, h, speed, len, wid }, ships() → [{ id, x, z, h, len, wid, kind }], damage(target, amount, x, z, source),
//   land(x, z, r) → boolean, world: { x, z, r }, rng(), warnBonus(), warn, pop(text, x, y, z, style), announce(text),
//   sfx(name, x, z), coins(x, z, n), gold(n, why), drift(x, z) → { vx, vz } (currents), isNew(kind) → boolean,
//   hold() → boolean (main's `state.intro > 0 || boarding.truce`, as ctx3's: while true no foe starts a telegraph or runs
//   its attack timers, and the first-meeting grace waits; what is already in the air lands), tables: { STATUS, WORDS4 } }
```

**`src/shellback.js`** (new, pure) — §3.6, the shape of `kraken.js`

```js
export const SHELLBACK;   // §3.6.2 + hp 3000, notches [2000, 1000], towers, claws, body r, push 8 (u/s), standoff 1 (u),
                          //   dread/rise times, cutOff 12, chargeGap 6, conch 1200, words (the 2-at-once cap is ctx.warn.boss)
export function createShellback(ctx) → {
  wake(x, z, { short }), step(dt), targets(), hits(id, x, y, z), hit(id, info) → { dmg, word } | null,
  special(id, ammo) → word | null, boardWhy() → 'monster', push(ship) → { vx, vz } | null, playerMods() → { speedMul, turnMul },
  get bar /* { name, frac, notches } */, get phase, get hp, get rising, get done,
  visuals() → { body, eyes, claws, towers, rings, sectors, lanes, lines }, get state, dispose()
}
// ctx: as kraken.js's (player, damage, land, world, rng, warnBonus, pop, announce, sfx) + { arena: { x, z, r }, lair, warn,
//   ships() (for its pushes and standoff), hold() (as foes4's), tables: { STATUS, FORT } }
```

**`src/island.js`** (extended; additions only — `PLOTS`, `RANKS`, `GIFT`, `MARKET`, `VILLAGER_CAP` and every SPEC3
function unchanged) — §4

```js
export const PLOTS4, RANKS4, GIFT4 /* { perVillager: 5, cap: 120 } */, MUSEUM /* { cap: 200 } */, AQUARIUM /* { cap: 150 } */,
  RESCUE /* { cap: 150 } */;
export function defaultIsland4(), parseIsland4(raw), serializeIsland4(s4), mergeIsland4(a, b)
export function tierOf4(s4, id), nextCost4(s4, id), totals4() → { homes: 3450, amenities: 12550, all: 16000 }
export function plotState4(s4, purse, id, progress) → { tier, cost, affordable, maxed, onSale, why, label, now, next }
export function build4(s4, purse, id, progress) → { ok, island4, cost, reason: 'unknown' | 'maxed' | 'closed' | 'poor' }
export function onSale4(id, progress) → { ok, why }      // progress: { unlocked, captures }
export function perks4(s4) → { cutHold, catchGold, museumGold, spyglass, aquariumGold, rescuePct, musicLayers, goats }
export function villagers4(s4), tiersBuilt4(s4), rank4(s, s4) → { name, tiers, next }, gift4(s, s4)
export function catchGold(s4), museumGold(s4, captures), aquariumGold(s4, creatures), rescue(s4, plunder)
export const PERK4_SCOPE;  // { cutHold: 'v4', spyglass: 'v4', catchGold: 'gold', museumGold: 'gold', aquariumGold: 'gold',
                           //   rescuePct: 'gold', musicLayers: 'delight', goats: 'delight' } (the perk rule, §0.1)
```

**`src/buildScene.js`** (new, pure) — §5: `STAGES` (ids `builders`, `foundation` / `scaffold`, `frame`, `walls`,
`roof`, `finish`, `movingIn`), `SCENE` (`{ new: 9.4, upgrade: 7.0, skip: 0.3, still: 1.1, fade: 0.2, orbit: 10 }`
with `reduced` derived, `4 × still + 3 × fade` = 5.0), `sceneLength(kind, reduced)`, `stageAt(t, kind, reduced) → { stage, index, k,
caption, pips, done }`, `cueAt(t0, t1, kind, reduced) → [{ at, sfx | event }]`.

**`src/islanders.js`** (new, pure) — §7: `ISLANDERS` (≤ 40), `ROUTINES`, `ANIMALS`, `LINES`, `PEOPLE_DRAWN` (Stage 0),
`TALK` (`{ reach: 1.6, face: 60, lines: 3, end: 3 }`), `CULL4` (34); `roster(island, island4, progress, layout) → {
people, animals }`, `routinePose(id, t, layout) → { x, z, h, action, moving }`, `linesFor(id, progress, touch) →
string[]`, `plan(viewer, people, prev, t) → Set<id>` (§7.2's priority order and hard cap). `layout` is islandPlan's
exports (`ISLANDER_PATHS`, `PLOT_PLACES`, `DECKS`), passed in so islanders.js stays pure and station coordinates live
only in islandPlan; every `kid` / `old` look in `ISLANDERS` names `girl`.

**`src/guide.js`** (new, pure) — `GUIDE` (one card per foe kind: `{ id, name, icon, does, beat, from }`),
`guideFor(met, unlocked) → [{ …card, seen }]`.

**`src/islandPlan.js`** (new, pure) — §6: `DISTRICTS`, `DECKS`, `LINKS`, `PADS`, `PORCHES`, `PLOT_PLACES`, `SIGNPOSTS`,
`ARCHES`, `LANDMARKS`, `HOPS`, `KEEP_OFF`, `ISLANDER_PATHS`, `WALKWAY` (`{ boardHw: 0.6, boardWidth: 2.0, stepsHw: 0.6,
ropeHw: 0.25, ropeMax: 3 /* a new rope bridge's span of water */, ropeLoops: 2, longRopeLoops: 1, porch: 1.6, padPad:
0.2 }`); `LINKS` entries carry `kind` (`'rope'` | `'board'` | `'steps'`, today's four and the seven scenery bridges
included); `walkData4(base, plots4) → { radius, areas, links, blockers, camBlockers, places, spawn, npcs, doors, paths,
bridges, hops, districts }` (base: today's `env.walk`, every key of it kept; `plots4`: island.js's `PLOTS4`, passed in
for each plot's max height in its camera box, so islandPlan stays pure; the ten plots' envelopes swapped for pads;
islander loops appended to `paths`); `districtAt(x, z) → id | null`.

**`src/walk.js`** (extended) — the spatial hash in `graph()` and `near()`, memoised `clear()`, A*'s reused typed arrays
(§6.6); its API and results unchanged (`walk.graph` is read once at dock open to build it ahead of the first path).

**`src/act4.js`** (new) — `export const ACT4_LEVELS` (§2.3–2.5), `export const ACT4_TEASER = '…but on the sunset horizon,
an island is snoring.'`; imports the three env modules and `pools.js`.
**`src/voyage.js`** (extended) — `export const WITH_V4, LEVELS, ACT4_TEASER` (§2.1).

**`src/env/mangroves.js`, `spires.js`, `shoals.js`** (new) — SPEC3's env contract (`meta`, `palette`, `build(scene,
ctx)` → `{ worldRadius, colliders, playerStart, enemySpawns, reefs, crateSpots, update(t, dt, ctx), dispose(), group }`)
plus: mangroves `fogLoops`; spires `currents`; shoals `tideBars`, `fortSpots`, `shellbackLair`, `shellbackArena`,
`setAwake(k)`, `setCalm(k)`; each `warmables()` → the hidden objects to warm-draw (§14). Each draws its own hazard
visuals from `update(t, dt, { simTime, camera, hazards })` (`hazards = mechanics.visuals()`).

**`src/foesView.js`** (new, THREE) — `createFoesView(scene, { reducedMotion }) → { prepare() → boolean (one mesh a call),
get ready, update(visuals, t, dt), warmables(), dispose() }`: the jollyboat packs and coconuts, puffers and spikes, Old
Coilback (one 8-segment rigidly skinned SkinnedMesh), the forts, and every new telegraph shape (coconut rings, spiky
rings, the net fan, the lunge lane, the sight line, the witch's summon rings and notes): one InstancedMesh per shape
kind, `noOutline`, so all shapes cost ≤ 6 calls. ≤ 30 calls in the busiest mix (§14).
**`src/shellbackView.js`** (new, THREE) — `createShellbackView(scene, opts) → { prepare, get ready, update(visuals, t,
dt), riseCamera(k) → { pos, look } | null, warmables(), dispose() }`: the body (one rigidly skinned SkinnedMesh, legs
and claws on its bones, ≤ 3 material groups), the fort and towers (merged, breakable in three pieces), eyes (`noOutline`),
a shadow; **≤ 40 calls** (and ≤ 1.3 × a Man-o'-War's, whichever is lower).

**`src/env/districts.js`** (new, THREE) — `buildDistricts(kit, plan) → { statics: Group (baked by sparrow into the town's
meshes), anim: { lanterns }, signs: [painted boards], dispose() }`, from islandPlan, its own stream `mulberry32(0x5EA4)`.
**`src/env/buildings4.js`** (new, THREE) — `kit(id, tier, kitHelpers) → Group` (tiers 1–3 of the eleven new plots, and
tier 0 for the islet plots: a sand outline and the board), `info(id, tier) → { footprint, eave, top, door, porch }`;
one stream per (plot, tier).
**`src/env/construction.js`** (new, THREE) — `createConstruction(ctx) → { start(plot, from, to, { kind, reduced }),
step(dt), skip(), get running, get stage, get t, warm(), dispose() }`; ctx: `{ scene, renderer, chunks(plot, tier),
devMaterials, pad, porch, door, walkPoint, builders, islanders, pose, sfx }` (§5.3).
**`src/env/folk4.js`** (new, THREE) — `createFolk4(kit, { people, walk }) → { set(roster), prepare() → boolean (one
person a call), update(t, dt, captain, drawn), walkers() (folk() entries), talkTarget(captain) → id | null, face(id,
captain), dispose() }`; uses sparrow's `inTheWay` (LOOK-2) through the kit.
**`src/critters.js`** (new, THREE) — `createCritters(scene, { reducedMotion }) → { set(list), update(t, dt, captain),
pick(ray) → i | null, near(captain) → i | null, react(i), visible(on), dispose() }`: one InstancedMesh + ink twin per
species (≤ 14 calls).
**`src/islandMap.js`** (new, DOM) — `createIslandMap({ root, ctx }) → { open(), close(), onKey(e, down) → handled,
refresh(), get active }`; ctx: `{ plan, walk, captain(), islanders(), plots(), walkTo(id), hop(id), talk(id) }`.

**`src/env/sparrow.js`** (extended; a seam) — with `v4`: the seven shacks into plot kits (same draws, same order); the
`kit` of art helpers (frozen: `THREE, add, rbox, cyl, sphere, rope, rod, beam, ink, thin, flat, COL, WALLS, ROOFS,
lantern, shack, sagCurve, bake, inTheWay, stream(seed)`) passed to the new modules; `districts.statics` baked into the
town's meshes; the seven bridges' `{ walk }`; `walkData4` merged into `env.walk`; the dev layer's second half;
`setIsland4(s4, { built })`; the construction scene in place of the montage (`setIsland(cfg, { built })` and
`setIsland4` start it; `finishBuild()` skips it); `setIslanders(roster)`; `folk()` + folk4's walkers; the critters; the
crowd director in place of `cull()`'s radius under `v4`; the cutter's and rowboats' constants (§6.2); `plotPose` for
all 21 plots; `get scene` (the construction state); `districtAt(x, z)`; the `lookout` and `zip` poses. With `v4` false
none of this runs.

**`src/townMode.js`** (extended) — views `'lookout'` and `'map'`; `open('builder', { plot })`; the plot-board, talk and
pet prompts and their priority (§7.4); the scene strip, keys and camera (§5.2); `localClippingEnabled` on in the town
view only (through the ctx's `setClipping(on)`: townMode holds no renderer); hops and rides; district toasts; the Sea
Guide section; the Harbour menu's Island map. ctx gains `setClipping(on)` (main sets `renderer.localClippingEnabled`;
Stage 2, 2A), `withV4`, `island4: { state(), build(id) }`, `islanders: { roster(), progress() }`, `guide: { cards() }`,
`voyage4: { tip(bit) }`.
**`src/town.js`** (extended) — `hop(point, h)`, `ride(path, secs)`, `talkTo(id)` (walk up and face), the lookout's
climb and panorama camera, the scene camera (glide + orbit), the hilltop's minimum pitch.
**`src/buildPanel.js`** (extended) — the district tabs, the not-on-sale and building states, Watch again, the folded bar.

**`src/shipTypes.js`** (Stage 0) — `stinger`, `netsloop`, `witch` (§3.1). **`src/ships.js`** — Stage 0: three
`BUILDERS` lines map the new types to existing builders (`stinger: buildCutter`, `netsloop: buildPrivateer`, `witch:
buildBombKetch`; each builder sizes its hull from the type's `len`/`wid`), because `buildShip` throws for a type with
no builder (ships.js:5650–5653) and a Voyage IV ship can spawn before 1H lands (`?v4=1`, `G.spawn`, the next wave's
prebuild); 1H then replaces those three lines with their models (each ≤ a Man-o'-War's calls), `statusAnchors`, the
net drape on the player (`setNet(mesh, on)`). (The town's prize ships already catch a failed `buildShip`.) **`src/cosmetics.js`** —
`FEAT_IDS` + `shell`, `island4`; `FEAT_MAX` + `shell: 1, island4: 33`; `FEAT_PRIZE_TYPES` + the three types (Stage 0,
with shipTypes.js); trophies `hat.jeweled` "Jewelled tricorn" (`island4 ≥ 33`) and `pet.hermit` "Baby hermit crab"
(`shell ≥ 1`); the Governor's coat's text (§4.2); `enemyCrewOpts` for the three types (Sting: yellow-and-black
stripes, bandanas; Net: green caps, white shirts; the Witch's crew: coral sashes, shell earrings). **`src/people.js`** —
hats `toque`, `souwester`, `startop`, `jeweled`; tools `drum`, `spyglass`, `book`, `basket`, `squeezebox`; `apron: true`;
`tail: true` (merfolk: the legs become a lathed tail with a fin; only `idle`, `sit`, `wave`, `cheer`); pet `hermit` (a
tiny hermit crab on the pet bones, its shell bobbing, a claw wave in `'cheer'`); **`girl: true | false`** for `kid`
and `old` (people.js:167–168 still draws its `chance(0.5)`, then the option replaces the result; a look without it is
unchanged); the determinism rule holds.
**`src/tags.js`** — pseudo tags (§3.3), NEW, UNDER WATER, the pack count. **`src/pops.js`** — styles `foe4` and `shell`;
the per-target word throttle on portrait phones (§0.1). **`src/audio.js`** — scenes `mangroves spires shoals
shellback`; town layers (`setTownLayers(n)`, 0..3); SFX `coconut netWhirl puff conch song hiss clack tidebell snip
boulder crabCharge yawn newFoe whistle thud tok saw pop brush chime door tada purr woof meh squawk hoot giggle click
splash fwap foghorn` (a name that already exists is reused, not redefined; turtles have no sound); every new name in `SFX_NAMES`, `SCENE_NAMES`, `SFX_CAP`, `SFX_GAIN`.
**`src/guide.js`** above; **`town.css`** — the map, the talk bubble, the scene strip and bar, the district tabs, the
lookout button, the toast.

### 11.2 What main.js gets (integration points)

| Where | Change | Stage |
|---|---|---|
| imports / state | `LEVELS`, `WITH_V4`, `ACT4_TEASER` from voyage.js; pools, mechanics4, foes4, shellback, foesView, shellbackView; `state.waves`, `state.netted`, `voyage4Rec`, `island4Cfg`, `bossCheckpoint`; records `-island4`, `-voyage4` via `loadRecord` (only with `WITH_V4`) | 0 (stubs) / 2 |
| `levelWaves()` | every read of `def.waves` goes through it: `spawnWave` (1869), `startLevel`'s banners and `overboard.prepare` types (2061: the drawn waves' ship types), the checkpoint's wave index, `step()`'s wave advance, `queuePrebuild`, the retry banner | 0 (returns `def.waves`) / 2 (`state.waves` on a pool level) |
| `levelSeed(n)` | the `combatRng` seed in `startLevel` (1963): `n × 7919 + 13` on levels 1–9, `poolSeed(n, plays)` on 10–12 (§3.5). `combat.seed(n)` keeps **today's** meaning (it reseeds `combatRng` only until the next `startLevel`, main.js:9344; voyage3.cjs:262 and battle.cjs:74 re-seed after each start). Only the new `v4.seed(s)` persists: it replaces `poolSeed` for every following start of levels 10–12 until `v4.seed(null)` clears it | 0 (identical) / 2 |
| the parts registry | `syncKrakenTargets` → `syncParts()` over `PARTS = [kraken, foes4, shellback]`; `targetsFor`, `hitsShip`, `damagePseudo`, `canGrapple`, `rakeCue`, `ballHit`'s beam-on aspect, `separateShips` (skip) read the wrapper's `src` (§3.7) | 0 (the Kraken only, identical) / 2 |
| `composeMechanics` | `composeMechanics([createMechanics(ids, ctx), createMechanics3(ids, ctx3), createMechanics4(ids, ctx4)])` (instances; the generalised rules of §11.1) | 0 (null `createMechanics4`) / 2 |
| `warnSlots` | `{ take(kind), give(kind), count }` passed as `ctx.warn` to mechanics4, foes4 and the Shellback; main's own `launchBomb` takes a slot on act-4 levels; `max` = `WARN.max` on act 4, ∞ elsewhere | 0 (∞) / 2 |
| `warmDraw(objects)` | renders the given hidden objects once into a 1 × 1 render target **through the view's outline effect, both passes** (the same render path as a frame, scenery.js:266–269: the colour pass and `effect.renderOutline`, whose outline materials are cached per original material), so the outline programs warm too (a real first draw, not only `compile`), at level start behind the fly-in (the env's, foesView's and the boss's `warmables()`) and at dock open (the construction scene's) | 0 (the helper) / 2 |
| `aimTarget`, `inArc`, the FIRE! light, tags, the minimap | `mechanics.hidden(target, player)` (fog) and parts' `hidden` (under water) leave a target out; the Fire cells read FOG! (§2.6) | 2 |
| `speedMul` / `turnMul` / `speedCap` / `updatePlayer` | `mechanics.playerMods()` (the net) and `shipMods(s)` (tide shallows, the dance); the composed `drift` (currents) in `moveShip`; the Shellback's `push` after `separateShips` | 0 (identity) / 2 |
| G / CUT! | a net is cut through the raider-cut path (`mechanics.cut()` / `cutHold(down)`), hold time from `perks4().cutHold`; a pseudo target's `boardWhy` words | 2 |
| `spawnWave` | ship kinds with `createShip`, pseudo kinds with `foes4.spawn` (a fort at a free `env.fortSpots` entry); the meet card and the met bit on a first-ever kind; the clear counts `fighting()` ships + `foes4.slots()` | 2 |
| pseudo kinds in ship paths | `foeName(kind)` (`FOE_NAMES[kind]` or `SHIP_TYPES[kind].name`) in `describeWave` (1910; the intro and retry banners 2092/2096, the "Reinforcements!" banner); `isPseudo` guards `spawnWave`'s boss lookup (1895); every alive count (the HUD's ships cell and "+pending" 7385–7387, the sunk banner's "N to go" 3970–3975, the clear check) = `fighting()` ships + `foes4.slots()`, pending = `slotsOf` (§3.7) | 2 (R1, before any pseudo kind spawns) |
| townMode ctx (clipping) | `setClipping(on)` → `renderer.localClippingEnabled = on` (§5.3), so 2B can switch it with the town view | 2 (R1) |
| `startLevel` | the pool draw and `plays`; `createFoes4`; `createMechanics4`; on level 12 `createShellback` and `shellbackView.prepare()` one mesh a frame during the fly-in and wave 1; `{ fromBoss }` | 2 |
| `step()` | `foes4.step`, the Shellback sequence (`stepShellback`: wave 2 fell → dread → wake → fight → driven off → the Conch, §3.6.1); the clear check waits for `!def.boss \|\| shellback.done` | 2 |
| `finishLevel` | `plays` (the voyage4 record first), the gift4 / catch / Museum / Aquarium lines and gold, "The seas will change next time!", the Conch line, the feat `shell`, the prizes mirror, `ACT4_TEASER` on level 9's Victory, `def.sailOn` | 2 / 3 |
| `playerSunk` | `#shellback-retry-btn` after the checkpoint; the Grotto's rescue (§10.2) | 2 |
| `captureShip` | the Museum's gold on the capture pop ("+30 Museum") and its sum for the card; `voyage4.prizes` for the three new types | 2 |
| `krakenCheckpoint` → `bossCheckpoint` | `{ level, boss, gold, goldAtLevelStart }`; the Kraken's behaviour unchanged; the dock keeps it (SAVES-1); leaving after the drive-off wins (SAVES-2) | 2 (R5) |
| `updateHud` | `#meet-card`, `#fog-chip`, the net strip, the Shellback's boss bar, `#edge-arrow`'s BEHIND YOU! | 2 |
| `drawMinimap` | §8.2 | 2 |
| `frame()` | `foesView.update`, `shellbackView.update`, the wake camera, `shoals.setAwake / setCalm` | 2 |
| saves | `-voyage4`, `-island4`, the re-derive of `shell`, `island4` and the new prizes (`raiseRecordFeats` extended), the storage listener | 2 / 3 |
| acts | `ACT_NAMES[4]`, 12 cards, the compact pill, the migration (§10.3), level 9's teaser and sail-on, level 12's Victory | 3 |
| dock / town | townMode ctx (`withV4`, `island4`, `islanders`, `guide`, `voyage4`; `setClipping` is Stage 2's, above); `buildPlot` for both records (the right record first); `env.setIsland4`, `setIslanders`, the critters and the walk graph's build (§6.6) on dock open; the gift4 line | 3 |

### 11.3 Test API (`window.__game` additions; Stage 0 adds placeholders returning safe defaults)

```js
v4: { get WITH_V4, seed(s) /* persists for later starts of 10–12; seed(null) clears; combat.seed keeps today's meaning */, get waves, get plays, get met, meet(kind), spawn(kind, x, z, opts), get foes /* foes4.state */,
      get warnSlots, net() /* a net lands on you now */, cut(), cutHold(down), fog(x, z) /* hidden there? */, tide(on),
      get mechanics4 /* state */,
      shellback: { wake({ dread }), setHp(n), phase(n), get state, get targets, get checkpoint } },
island4: { get config, set(cfg) /* validated, saved */, build(id) → { ok, reason } },
island: { …today, scene: { get running, get stage, get t, get kind, skip(), advance(dt) } },
town: { …today, get islanders, get critters, talk(id), pet(i), hop(id), map: { open(), close(), get active },
        districtAt(x, z), lookout(on) },
voyage: { get WITH_KRAKEN, get WITH_V4 },
```

---------------------------------------------------------------------------------------------------

## 12. Staged build plan (disjoint file ownership inside every stage)

Rules for every agent (SPEC3 §12, unchanged): read §0 and the sections your files implement; edit **only** your owned
files (create new files only if they are listed for you); test pure modules with Node and visual work in a harness page
under `.dock-harness/` with screenshots at 1280×720 and 390×844 (SwiftShader, `?quality=low`), looked at, not just
taken; report draw calls for anything that renders. A change you need in a file you don't own goes in your final report
as a **hook request** (file, function, exact change) for that file's owner. In Stage 2 the coordinator relays them
within the round to the file's Stage 2 owner: **`main.js`, `index.html`, `style.css`, `voyage.js` → 2A; `townMode.js`,
`town.js` → 2B; every other file → 2E**. **Keep every owned file importable at all times** (`main.js` → `voyage.js` →
`act4.js` → the env modules and `pools.js` load on every page). Nobody edits `vendor/`, adds dependencies, commits or
pushes. A stage ends when its exit check passes; Voyage IV and every new town feature stay behind `?v4=1` (`WITH_V4`)
until Stage 3, so `npm test` stays green at the end of every stage with only the test edits §13.4 assigns to that
stage; the six new Node suites are in `npm test` from Stage 0 (as passing stubs, replaced by their Stage 1 owners), and
**every Stage 1 and Stage 2 exit also runs its own new suite explicitly**. Reports go in
`docs/sunset-isles/stageN-reports.md`.

**The three big shared files have exactly one owner per stage:** `src/main.js` (9,860 lines): Stage 0 → 0, Stage 2 →
2A, Stage 3 → 3A (untouched in Stage 1). `src/env/sparrow.js` (6,700 lines): Stage 0 → 0 (the seam only), Stage 1 →
1N, Stage 2 → 2E, Stage 3 → 3D. `src/townMode.js` (2,147 lines): Stage 2 → 2B, Stage 3 → 3D. Everything new lives in
**new modules** these three call (§11.1), so most agents never touch them.

### Before Stage 0 (the coordinator)

§0.3: confirm the published build, re-anchor the line numbers, open `docs/sunset-isles/`.

### Stage 0 — Scaffolding (1 agent, no behaviour change)

| Agent | Owns | Work | Exit check |
|---|---|---|---|
| **0 Integrator** | `src/main.js`, `index.html`, `style.css`, `town.css`, `fx.css`, `src/voyage.js`, `src/shipTypes.js`, `src/ships.js` (the three new `BUILDERS` lines only), `src/cosmetics.js` (the `FEAT_PRIZE_TYPES` line only), `src/mechanics3.js` (`composeMechanics` only), `src/env/sparrow.js` (the seam only: no art, no `rand()` change), `package.json` (the six new Node suites added to `"test"` in their §13.4 places, and their `test:<name>` scripts); new passing **stub suites** `tests/pools.test.cjs`, `mechanics4.test.cjs`, `foes4.test.cjs`, `shellback.test.cjs`, `islanders.test.cjs`, `walkgraph.test.cjs` (each prints "0 checks (stub)" and exits 0; its Stage 1 owner replaces it); new **stubs** exporting their final §11.1 API as null objects: `src/act4.js` (`ACT4_LEVELS` = three placeholder defs: `env` the stub env, `difficulty` 'Heroic' / 'Epic' / 'Ultimate', `act: 4`, `stars` 10–12, `scene`, `lockText`, `bonus`, `nextWaveAt: 0`, `maxAttackers: 2`, `lead: 0.6`, `spreadMul: 1`, `grace: 3`, `enemyRake: 1`, `mechanics: []`, `waves: [['cutter']]`, `pool: null`, `finale: true` on the third; `ACT4_TEASER`), `src/env/mangroves.js`, `spires.js`, `shoals.js` (valid empty seas: `meta`, the §2 palette, `worldRadius`, a `playerStart`, 6 `enemySpawns` and 4 `crateSpots` on a ring of radius 75, empty `fogLoops` / `currents` / `tideBars` / `fortSpots`, a `shellbackLair` and `shellbackArena`, no-op `setAwake`/`setCalm`, `warmables() → []`), `src/pools.js`, `src/mechanics4.js`, `src/foes4.js`, `src/shellback.js`, `src/foesView.js`, `src/shellbackView.js`, `src/buildScene.js`, `src/islanders.js`, `src/guide.js`, `src/islandPlan.js` (with the **measured `PADS` of the ten SPEC3 plots**, the **pad limits of the seven new shack plots** derived from §6.2's link plan (§4.1) and the islets' listed pads, `LINKS` with each link's `kind`, and the islander path id list), `src/env/districts.js`, `src/env/buildings4.js`, `src/env/construction.js`, `src/env/folk4.js`, `src/critters.js`, `src/islandMap.js` | 1. `voyage.js`: `WITH_V4`, the composed `LEVELS`, level 9's overlay (§2.1). 2. `levelWaves()` and `levelSeed(n)` seams (§11.2; identical results). 3. The parts registry with the Kraken as its only source (`syncParts`, identical wrappers). 4. `composeMechanics(parts)` generalised in full (§11.1; a three-part call with a null third part is identical to today's two). 5. `warnSlots` (∞) and `warmDraw()` (the helper, called by nothing yet). 6. The three ship types (§3.1), the matching `FEAT_PRIZE_TYPES`, and three `BUILDERS` lines in ships.js mapping them to existing builders (`stinger: buildCutter`, `netsloop: buildPrivateer`, `witch: buildBombKetch`) so `buildShip` never throws for them before 1H replaces those lines (§11.1). 7. Every DOM id of Appendix A (hidden); the overlay `#island-map` with class `overlay`, placed before `#recover-screen`. 8. `__game` placeholders (§11.3). 9. sparrow.js: the build ctx gains `v4: WITH_V4`; the frozen `kit` of art helpers (§11.1) handed to the stub modules (which draw nothing and draw no `rand()`); with `v4` the town is still today's. 10. **Measurements**, written to `docs/sunset-isles/stage0-report.md` and into §19 by the coordinator: (a) draw-call baselines at `eedb108` (level starts 1–9, the shipyard view, the town walk view at today's 30 spots × 8 headings, **and the panorama / hill baseline**: a forced whole-island-in-view pose from today's crow's nest and an elevated pose over `s12` at the hilltop's height, 8 headings each, every SPEC3 plot at tier 3; 18 of §14's 48 spots don't exist yet, so these two stand in for them); (b) the walk-view breakdown at the worst view (statics, development layer, animated parts, townsfolk, villagers, NPCs, prize ships, the docked ship, the captain) and **P₀**, the people drawn there, so `PEOPLE_DRAWN = P₀ + 2`; (c) each SPEC3 plot's tier-3 chunk footprint in its plot frame, the free strips to its platform's edges, and where the scenery bridges' mouths land (the ten **pads**); (d) a Man-o'-War's draw calls (the 1.3 × cap); (e) `#6b2a55`'s contrast on parchment; (f) today's **dock-frame triangle count** (as smoke.cjs:511 counts it) for §14.2's triangle sum; (g) `walk.graph()`'s build time and the worst `path()` between places with today's walk.js, on today's fixture and on a v4-sized synthetic island (today's walk data copied to ≈ 2.5× its nodes), for §6.6's budgets | `npm test` green with **no existing test edited** (the six stub suites added); draw calls within ±2 of today on the nine level starts, the shipyard and the town; `?v4=1` shows 12 cards and starts levels 10–12 as stub seas (one cutter each) without errors; `?v4=1` ashore is today's town; the measurements recorded |

### Stage 1 — Foundations (18 agents in parallel; main.js untouched)

Six Stage 1 agents consume another's work: 1N needs 1O's tier kits (pads of the new plots), 1P needs 1D's
`buildScene.js` and 1O's chunks, 1Q needs 1G's new people options and 1D's `islanders.js`, 1R needs 1D's `island.js`
API, 1I needs 1C's `visuals()` shapes, and **1D needs 1N's islandPlan (`ISLANDER_PATHS`, plot places, decks) and the
v4 fixture's link mouths and doorways** for islanders.test's station checks. They build against **mocks of the exact
§11.1 shapes** (the islandPlan stub's pads and path ids, a box chunk, a mock `stageAt`, people options ignored until
they exist, fake visuals), and once the real modules have landed a short **Stage 1b** re-runs 1N's, 1D's, 1P's, 1Q's,
1R's and 1I's exit checks against them (each still edits only its own files; 1D's station checks run on the v4 fixture
after 1N has generated it). **The `v4` walk fixture is generated once, in Stage 1b**, by 1N.

| Agent | Owns | Delivers | Exit check |
|---|---|---|---|
| **1A Pools & record** | `src/pools.js`, `tests/pools.test.cjs` (new) | §3.5; the voyage4 record (§10.1) | Node green; 1,000 seeds per level keep every rule (at most one puffer patch a wave included); the same `(level, plays)` gives the same waves; no unmet kind and at most one new kind a wave; the garbage battery |
| **1B Voyage IV rules** | `src/mechanics4.js`, `src/act4.js`, `tests/mechanics4.test.cjs` (new) | §2.3–2.6 defs and hazards, §3.1's ship behaviours (Sting, Net, Witch), `WARN`, `WORDS4`; the three-part `composeMechanics` checks | Node green with a mock ctx; every telegraph ≥ 1.5 s (+ bonus); nets release ≤ 4 s and never chain; fog never hides the player or a shape; the tide is never a collider; a 7th warning shape waits |
| **1C Foes & the Shellback** | `src/foes4.js`, `src/shellback.js`, `tests/foes4.test.cjs`, `tests/shellback.test.cjs` (new) | §3.1's pseudo foes, §3.6 | Node green; telegraphs ≥ 1.5 s; puffers ≤ 6 alive (patch `min(4, 6 − alive)`, owned summons outside `slots()`, `sendHome(owner)` leaves a wave's patch); `hold()` holds every attack; the Shellback's 2-at-once (`ctx.warn.boss`) and 6 s charge rules; contact never traps or damages, with the standoff, the 8 u/s push and the Charge exemption (600 s × 5 scripted players × 3 phases); never on land; determinism; junk ctx never throws |
| **1D Island rules & islander data** | `src/island.js` (additions only), `src/islanders.js`, `src/buildScene.js`, `src/guide.js`, `tests/island.test.cjs` (new checks appended; no existing check edited), `tests/islanders.test.cjs` (new) | §4.1–4.2 tables and record, §5.2's timeline, §7's data, §8.7's cards | Node green; totals 3,450 / 12,550 / 16,000; every existing island.test check untouched; scene lengths 9.4 / 7.0 / 5.0 (reduced derived from `still` and `fade`); lines ≤ 70 characters, every key-naming line with a touch variant; every `kid` / `old` look names `girl`; the perk-scope list (§13.1); in Stage 1b, the station checks on the v4 fixture |
| **1E Walk engine** | `src/walk.js`, `tests/walkgraph.test.cjs` (new) | §6.6 | the same nodes and edges as the brute force on today's fixture (and every walk.test check passes untouched); `near()` hashed, `clear()` memoised, A*'s arrays reused; graph ≤ 300 ms and worst `path` ≤ 20 ms on a synthetic island of the v4 size (Stage 0's baseline beside them) |
| **1F Looks data** | `src/cosmetics.js`, `tests/cosmetics.test.cjs` (rows C1–C15 of §13.4 + new checks) | `FEAT_IDS`, `FEAT_MAX`, the two trophies, the Governor's coat's text, the three crews' looks | both suites green; the trophy minimums cross-checked (`island4` 33 = the `PLOTS4` tiers) |
| **1G Characters** | `src/people.js` | the §11.1 options (hats, tools, `apron`, `tail`, pet `hermit`, `girl`) | the 400-seed look comparison identical; harness grid of every new option × the actions it uses; ≤ 3 material groups; a mer person only ever sits, waves, idles or cheers |
| **1H Shipwright** | `src/ships.js` | the Sting Sloop, Net Sloop and Witch's Barge (§3.1 looks; they replace Stage 0's three `BUILDERS` stand-ins), `statusAnchors`, the net drape | harness: each model at 3 angles, damage 0–2, flags; draw calls per model ≤ a Man-o'-War's; existing ship and dock tests green |
| **1I Foe art** | `src/foesView.js`, `src/shellbackView.js`, `src/tags.js`, `src/pops.js`, `fx.css` | §3.1 models and telegraph shapes, §3.6 the Shellback (every phase pose, the wake camera), §3.3 tags, the pop throttle | harness from fake `visuals()`; foesView ≤ 30 calls in the busiest mix, the Shellback ≤ 40; pulses ≤ 1 Hz; flashes ≤ 0.25; reduced motion; shapes readable at 390×844 |
| **1J Sound** | `src/audio.js` | §11.1 scenes, town layers, SFX | offline renders of every new name finite, stereo, non-silent; the dread drone has energy above 80 Hz; existing audio checks green |
| **1K Env: Misty Mangroves** | `src/env/mangroves.js` | §2.3 | env alone ≤ 220 calls; the smoke layout rules; `fogLoops` clear; fireflies ≤ 1 Hz; `warmables()` |
| **1L Env: Sunken Spires** | `src/env/spires.js` | §2.4 | as 1K; `currents` clear of colliders and the start |
| **1M Env: Shellback Shoals** | `src/env/shoals.js` | §2.5 | as 1K; the arena clear by 12 of colliders and 6 of tide bars; every bar sail-round; `setAwake` / `setCalm` within §15's caps |
| **1N Town layout** | `src/env/sparrow.js`, `src/islandPlan.js`, `src/env/districts.js`, `tests/walk.test.cjs` (new `v4` sections only; every existing check unchanged), `tests/fixtures/sparrow-walk-v4.json` (new, generated once in 1b) | §6 (districts, pads, porches, the seven bridges, keep-offs, signposts, arches, the lookout and its pose), the seven shacks into plot kits, the dev layer's second half, `setIsland4`, the seams to construction / folk4 / critters, the crowd director in place of `cull()`'s radius, `plotPose` for 21 plots | with `v4` false the town and `sparrow-walk.json` are byte-identical to today's; with `v4`: the §13.1 walk checks green on the v4 fixture; every rendered bridge has a link; every tier fits its pad; the shipyard showcase ray probe (every new building at tier 3) and the walk camera on every porch; the 48 × 8 town probe ≤ 450 with mock people at the cap |
| **1O Buildings** | `src/env/buildings4.js` | §4.1's tier art for the eleven new plots, §4.3 | harness: every plot × tier at 3 angles at 1280×720 and 390×844; each tier fits its pad (islandPlan); ≤ 25k triangles per tier-3 building; the dev layer's half rebake ≤ 40 ms |
| **1P Construction** | `src/env/construction.js` | §5.3 | harness with a mock chunk: every stage new and upgrade, skip, reduced motion; **no ink outline of an unbuilt part** in screenshots at the cut line; the build view ≤ 145 calls added; the warm draw; nothing else in the scene clipped |
| **1Q Islanders & animals view** | `src/env/folk4.js`, `src/critters.js` | §7's people and animals | harness: every islander's look and a whole ashore day; LOOK-2 waiting with a mock captain; no pause on a link or within 2 u of a mouth; animals 2 calls a species and never in `folk()` |
| **1R Panels & map** | `src/buildPanel.js`, `src/islandMap.js`, `town.css` | §8.5 the map, §8.6 the panel, §5.2 the strip and folded bar, the talk bubble's and toast's styles | harness at the 7 town sizes: no page scroll, ≥ 44 px, contrast ≥ 4.5:1, keyboard only, the screen-reader texts; a built row (with Watch again) no taller than today's at 320×480; with `v4` off the panel is today's |

### Stage 2 — Integration (5 agents, in rounds)

| Agent | Owns | Delivers | Exit check |
|---|---|---|---|
| **2A Integrator (battle)** | `src/main.js`, `index.html`, `style.css`, `src/voyage.js` | everything marked "2" in §11.2: the pools and `plays`, the parts registry with `foes4` and the Shellback, the pseudo-kind guards (`foeName`, `isPseudo`, alive counts), `mechanics4` (the three ships, fog, currents, tide, nets), meet cards, warn slots, warm draws, the HUD and minimap, `bossCheckpoint`, the voyage4 writes, the test API, the townMode ctx's `setClipping`; Voyage IV playable with `?v4=1`; applies hook requests on its files within the round | the existing `npm test` green with no test edits; 2C's additions green; levels 10–12 playable to the end with `?v4=1` |
| **2B Town integration** | `src/townMode.js`, `src/town.js` | §5.2's strip, keys and scene camera; `localClippingEnabled` (through ctx `setClipping`); §6.7 the lookout; applies hook requests on townMode.js and town.js within the round; §7.4 talk and pet; §8.5 plot boards, the map, hops, toasts; §8.7 the Sea Guide; §6.8 the zip line (round 6, optional) | a harness with a mock ctx: every view, prompt and key path at the 7 town sizes; the walking-bug probe of §6.5 with the crowd at its maximum; the existing `tests/town.cjs` green |
| **2E Module fixer** | every Stage 1 module 2A and 2B don't own (all of §11.1's new and extended modules, `src/env/sparrow.js`, `src/walk.js`, `src/island.js`, `src/cosmetics.js`, `src/people.js`, `src/ships.js`, `src/tags.js`, `src/pops.js`, `fx.css`, `src/audio.js`, `town.css`, the env modules), their Node tests and the v4 fixture | applies 2A's and 2B's hook requests on its files **during** the stage (the coordinator relays them in rounds; requests on main.js go to 2A, on townMode.js / town.js to 2B) | every Node suite green; each hook request applied with its Stage 1 owner's harness check re-run |
| **2C Battle tests** | `tests/battle.cjs` (new sections only), `tests/voyage4.cjs` (new), `tests/balance.cjs` (new opt-in sections only) | §13.2's battle parts | green against 2A's final work |
| **2D Ashore tests** | `tests/isle4.cjs` (new) | §13.2's island suite against 2B's harness, then the real game with `?v4=1` (after 3A) | green against 2B's work |

**Rounds:** R1 — 2A battle core (registry, pools, foes4, the three ships, nets, meet cards, warn slots, test API) and
2B town (plot boards, the scene strip, talk, pet, the map and hops, toasts, the Sea Guide, the lookout); R2 — 2E and 2D;
R3 — 2A the three seas (fog, currents, tide, forts; 2A **integrates** the env modules and their warm draws in main.js,
and any edit an env module needs goes to 2E as a hook request) and 2C; R4 — 2E; R5 — 2A the Shellback (sequence,
phases, contact, checkpoint, boss bar, the Conch) and 2C; R6 (optional) — 2B the zip line, 2E its hooks.

**Before Stage 3 (the dry run, read-only on the tree):** the coordinator has 3C copy the tree to the scratchpad, force
`WITH_V4 = true` in the copy and run the full suite there; every failing line is listed, and each one not already in
§13.4 becomes a §13.4 row (or a bug for 2A / 2B / 2E) before Stage 3 starts, so 3C's rule "§13.4's edits and only
these" can hold.

### Stage 3 — Go live, balance, polish (5 agents)

| Agent | Owns | Delivers | Exit check |
|---|---|---|---|
| **3A Integrator (acts & town)** | `src/main.js`, `index.html`, `style.css`, `src/voyage.js` | everything marked "3" in §11.2: the townMode ctx (`withV4`, island4 builds with the right record first, islanders, guide, voyage4 tips), `setIsland4` / `setIslanders` / the critters on dock open, the gift4, catch, Museum, Aquarium and rescue lines, the migration, 12 cards in four groups and the compact pill, level 9's teaser and sail-on, level 12's Victory, the rumour board's foes; **sets `WITH_V4 = true`** in the same stage as 3C's test edits | the full suite green (with 3C's edits) |
| **3B Balance** | `src/act4.js`, `src/pools.js` (`KIND_COST`, the levels' budgets), `src/mechanics4.js`, `src/foes4.js`, `src/shellback.js`, `src/shipTypes.js` (the three new types only), `src/island.js` (`PLOTS4` numbers only), and their Node tests | bot v4 (§13.3) runs (3B runs 2C's bot from `tests/balance.cjs` / `tests/voyage4.cjs` as they stand: running is not editing; a bot change it needs is made in a scratchpad copy and handed to 3C as a hook request); tunes numbers only in their tables (§2.8 order) until every guard passes; records the medians in §19 | Node suites green; the §2.8 guards hold; bot results reported |
| **3C Tests** | `tests/smoke.cjs`, `tests/controls.cjs`, `tests/levels.cjs`, `tests/battle.cjs`, `tests/town.cjs`, `tests/voyage3.cjs`, `tests/ashore.cjs`, `tests/voyage4.cjs`, `tests/isle4.cjs`, `tests/balance.cjs`, `package.json` | §13.4's edits exactly; the final new suites; the `npm test` order | the whole suite green; each new check shown to fail on a broken copy |
| **3D Town polish** | `src/env/sparrow.js`, `src/walk.js`, `src/town.js`, `src/townMode.js`, `src/islandPlan.js`, `src/env/districts.js`, `src/env/buildings4.js`, `src/env/construction.js`, `src/env/folk4.js`, `src/critters.js`, `src/islanders.js`, `src/buildScene.js`, `src/guide.js`, `src/buildPanel.js`, `src/islandMap.js`, `town.css`, `tests/walk.test.cjs`, `tests/walkgraph.test.cjs`, `tests/islanders.test.cjs`, the v4 fixture | fixes from in-game screenshots (every district, every plot at every tier, the scene, the crowd, the lookout), hook requests from 3A; the zip line if R6 didn't land it and the cut list allows | walk, islander and town suites green; §14's budgets |
| **3E Art & sound polish** | `src/people.js`, `src/ships.js`, `src/env/mangroves.js`, `spires.js`, `shoals.js`, `src/foesView.js`, `src/shellbackView.js`, `src/tags.js`, `src/pops.js`, `fx.css`, `src/audio.js` | fixes from play-through screenshots and the draw-call audit | §14's budgets met |

### Stage 4 — Review and README (1 integrator + read-only reviewers)

A review in eight dimensions (Voyage IV's balance and fairness; the new foes' readability on a portrait phone; the
Shellback; the construction scene; the walkable island and the walking bug; the islanders and the town's performance;
saves, stale tabs and the migration; accessibility), each finding checked by an independent verifier; fix agents with
disjoint files; the **README** (Voyage IV, the new foes, the pools, the island's districts, buildings, scene and
islanders, saves, tests); this file's §19 build record; `docs/sunset-isles/stage4-review.md`.

### Dependency graph

```
before 0 ─▶ 0 ─▶ everything.
1A ─▶ 1B (act4 imports pools), 2A, 2C      1B ─▶ 2A, 2C      1C ─▶ 1I (1b: visuals), 2A, 2C      1D ─▶ 1P, 1Q, 1R (1b), 2B, 3A
1E ─▶ 1N (graph speed), 2B      1F ─▶ 2A, 3A      1G ─▶ 1Q (1b: looks), 2B      1H ─▶ 2A      1I ─▶ 2A      1J ─▶ 2A, 2B
1K–1M ─▶ 2A (?v4=1)      1N ─▶ 1D (1b: paths, fixture), 2B, 3A      1O ─▶ 1N, 1P (1b: chunks)      1P, 1Q, 1R ─▶ 2B
(1N, 1D, 1P, 1Q, 1R and 1I build on mocks of the §11.1 shapes; Stage 1b re-checks them and 1N generates the v4 fixture)
2A, 2B ─▶ hook requests ─▶ the file's Stage 2 owner (main.js 2A; townMode.js, town.js 2B; the rest 2E; same round)
2A ─▶ 2C final run, 3A, 3B      2B ─▶ 2D, 3A, 3D      2A + 2B ─▶ the dry run (3C, read-only) ─▶ §13.4 ─▶ 3C
```

(1B's `act4.js` imports `pools.js`; until 1A lands it builds against the Stage 0 stub, whose `drawWaves` returns
`[['cutter']]`.)

---------------------------------------------------------------------------------------------------

## 13. Test plan

Browser suites load `?quality=low`, freeze the real-time loop and drive `G.step(1/120)` (SPEC2 §11), seed with
`G.combat.seed()` or `G.v4.seed()`, watch page errors, and stay under about 6 minutes each on SwiftShader (each new
suite is runnable by section, as ashore.cjs is; isle4.cjs's walking section has its own ≤ 6 min budget, and the
existing suites' link loops stay on today's four links, §13.4 A3 / T1). Every new check is shown to fail on a broken copy before it counts.

### 13.1 Node (fast, first in `npm test`)

- **`tests/pools.test.cjs`** (new) — the tables exactly; `poolSeed`; `drawWaves` over **1,000 seeds per level**: each
  wave starts with its `must`, keeps ≤ 3 slots, ≤ 2 of a kind, at most one puffer patch, none of the never-pairs, at most one of {witch, coilback,
  fort}, draws only from its `from` list, **never a kind before its `INTRO` wave**, **at most one new kind**, spends ≥
  budget − 1 in ≥ 95 % of draws, differs from the previous wave as a set unless 8 tries failed; level 12's wave 2 holds a
  Voyage IV kind wave 1 lacked; `nextWaveAt` keeps ≤ 4 slots alive; deterministic (the same seed, the same waves; plays
  + 1 changes at least one wave in ≥ 90 % of seeds); `slotsOf`, `isPseudo`; `parseVoyage4` with the full garbage
  battery of `upgrades.test.cjs` (cut JSON, arrays, `__proto__`, `constructor`, throwing getters and proxies, megabytes,
  deep nesting, `1e1`, `2.0`, `2.5`, `Infinity`, negatives, `null`, digit strings, unknown prize keys); `mergeVoyage4`
  (plays max, met and tips or-ed, won max, prizes max); `notePlay` caps at 9999; `meet` reports the first time once;
  round trips.
- **`tests/mechanics4.test.cjs`** (new) — with a mock ctx: the Sting Sloop holds 22–30 u at > 135° off your bow, dances
  after 0.6 s inside a loaded arc (turn ×1.6, +2, 1.2 s, cooldown 5 s), never while chained or frozen; the net: its
  warning ≥ 1.6 s (+ bonus), only a hull inside the fan is tangled, ×0.5 / ×0.6, always released by 4 s, by 3 taps, by a
  0.8 s hold (and the ctx's shorter Forge hold), by a hit on her; no net within 8 s of any release; none during a
  boarding, while she burns or stinks; Fire on a whirl → no net for 12 s; the Witch alternates, summons only while < 6
  puffers live and then `min(3, 6 − alive)` with her id as `owner`, sings 4 hp/s for 4 s within 18 u never above full,
  stink stops both for 6 s (`WITCH.stinkQuiet`); fog: banks a pure function
  of time, none within 20 u of the start for 8 s, hidden only beyond 14 u (+ the spyglass), never the player from his
  own view, never a shape; currents 3 u/s inside only; the tide's times, a ≥ 3 s warning, shallows ×0.5 on deep hulls
  only, never a collider, stopped by the wake; `WARN`: a 7th shape waits and its attack with it; **`composeMechanics`
  with three parts** gives every two-part result unchanged (Act II's `state.ids`, `.convoy`, `.floes`, `.current`, `m3`,
  `objective()`, summed `drift`) and **with a null third part gives today's state exactly** (no `m4` key), `visuals`
  merged as `{ ...b.visuals(), ...c.visuals() }`, `krakenDue` b's; the act4 levels: every field the Act III levels have, known kinds and ids, bonus and
  stars rising, valid pools, `waves` equal to `drawWaves(level, pool, poolSeed(level, 0))`.
- **`tests/foes4.test.cjs`** (new) — the jollyboats ring at 10–14 u, a coconut every 6–8 s, ≤ 2 in the air, a ≥ 1.5 s
  warning, damage only inside the ring, grape tips any boat, a hull touch tips it, 10 gold a boat; puffers drift only
  within 25 u, puff at 6 u, warn ≥ 1.5 s, pop 8 to every hull within 4 u, a hit sends one home safely, 40 s life, ≤ 6
  alive in every mix (a patch spawned beside a live patch and the Witch's summons rises with `min(4, 6 − alive)`, a full
  sea makes it wait with its slot alive), `slots()` ignores owned puffers, `sendHome(owner)` sends home only that
  owner's and leaves a wave's patch; Old Coilback's cycle times, rearing 14–16 u off, a lane from its head to 4 u past
  the predicted spot (so a player who stands still is always inside it), untargetable while under, a lane warning
  ≥ 1.6 s, damage only inside the lane, dizzy ×2, its Frost / Stink from `COILBACK` and Fire from `ctx.tables`, its
  spots never on land; `hold()` true holds every new telegraph and timer; a fort tracks 1.3 s and locks 0.5 s (≥ 1.8 s),
  fires along the locked line (a ship that moved off it is safe), hits the first hull on the line only, pirates too, 100
  gold; `boardWhy` for each; `tags()`; `slots()`; every warning shape takes a `ctx.warn` slot; determinism (the same seed,
  the same state after 120 s); junk ctx never throws.
- **`tests/shellback.test.cjs`** (new) — the phases at 2,000 and 1,000 (and all towers down → phase 2); every warning ≥
  1.5 s (+ bonus); never more than `ctx.warn.boss` (2) attacks telegraphed at once (a ctx with 1 is obeyed); no charge
  within 6 s of a sweep; a downed claw can't sweep for 8 s; dizzy ×2; specials from `ctx.tables` (altered tables are
  used); `cutOff` at 12 s; `hold()` holds its attacks; **contact**: the body never steps within its standoff of a hull;
  the push is ≥ the body's speed + 2 u/s; 600 s of each phase with 5 scripted players (standing, circling, chasing it,
  hugging the arena's edge, ramming it at full speed): outside a Charge's run, never inside the body for more than 1 s, never pushed onto land or beyond `worldRadius − 10`, always a free
  direction, no damage from a push; the body never leaves the arena; `done` at 0; the Conch's number; determinism; junk
  ctx never throws.
- **`tests/island.test.cjs`** (appended; **no existing check edited**) — `PLOTS4` exactly; `totals4` 3,450 / 12,550 /
  16,000 (and the table summed here); `build4` order and reasons (`unknown`, `maxed`, `closed`, `poor`); `onSale4` at
  each progress; `perks4` at every tier; `villagers4` 2 / 4 / 6 (18 at most); `gift4` ≤ 120 with the park's multiplier;
  Museum ≤ 200, Aquarium ≤ 150, rescue 10 / 20 / 30 % ≤ 150; `rank4` at 0, 29, 30, 44, 45, 62, 63; `parseIsland4` with
  the garbage battery, round trips, `mergeIsland4`; **the perk rule**: `PERK4_SCOPE` labels every `perks4` key `'v4'`,
  `'gold'` or `'delight'`, and none is a battle perk outside Voyage IV.
- **`tests/islanders.test.cjs`** (new) — `ISLANDERS` ≤ 40, unique ids and names, every look emits only options people.js
  accepts (validated against the option lists, as cosmetics.test does), every `kid` / `old` look names `girl`, every
  building's islanders exist only from their tier; lines ≤ 70 characters, every line that names a key has a touch
  variant, and every Voyage IV kind has a counter line somewhere; `routinePose(id, t, layout)` pure, on islandPlan's
  paths (loaded beside it), no station within 2 u of a link mouth, a doorway or inside a place circle (on the v4 fixture,
  in Stage 1b), the dance spots too; ≤ 1 loop over each of the five long scenery bridges; `plan()` **never draws more
  than `PEOPLE_DRAWN`**, and with a crowd larger than the cap within 6 u (a plaza of 30) it keeps the priority order (the
  chat partner, then within 2 u, then within 6 u by distance), holds its hysteresis, swaps ≤ 1 a step; with a crowd
  under the cap it includes everyone within 6 u and the chat partner; `buildScene`: lengths 9.4 / 7.0 / 5.0 (5.0 = 4 ×
  `still` + 3 × `fade`), the stages in order and contiguous, the captions, `cueAt` fires each cue exactly
  once however the frames fall; `guide`: a card for every enemy ship type, the Kraken and every Voyage IV kind, lines ≤ 90
  characters.
- **`tests/walkgraph.test.cjs`** (new) — the spatial-hash `graph()` gives the same nodes (in order) and edges as a
  brute-force copy on `sparrow-walk.json` and on `sparrow-walk-v4.json`, and `path()` the same paths; the graph builds in
  **≤ 300 ms** and `path()` runs in **≤ 20 ms** between any two places (worst of all pairs) on the v4 fixture (§6.6;
  each time printed beside Stage 0's baseline).
- **`tests/walk.test.cjs`** (new `v4` sections on `sparrow-walk-v4.json`; **every existing check unchanged on
  `sparrow-walk.json`**) — the areas and links are exactly today's plus islandPlan's (the v4 counterpart of today's
  :418 "no new walkable area or bridge"); every area and every link's middle reached from the spawn; **every rendered
  bridge (`walk.bridges`) has a walk link**; every pad blocked at 121 points and inside no walk-only gap; every porch ≥
  1.6 u free in front of its board and at every mouth; every link has a `kind` in islandPlan's `LINKS` and its `hw`
  follows its kind (`'rope'` 0.25, `'board'` and `'steps'` 0.6); every **new** `'rope'` link spans ≤ 3 u of water and
  every new link spanning more than 3 u is `'board'`; today's four links are byte-identical to `sparrow-walk.json`'s;
  every step ≤ `CLIMB` along every link and the hill; 10,000 random steps never leave the walk,
  never enter an obstacle, never climb > 0.35; a jog held from each end of every link at 10 headings crosses it; the 21
  plot places on the walk and clear, each reached from the spawn and back to the ship; Bess, Barnacle and every standing
  islander ≥ 1 u from every walker path and islander loop, ≥ 2 u from mouths and doorways; ≤ 2 loops on any short rope
  bridge and ≤ 1 on each of the five long ones, none pausing on them; `KEEP_OFF` respected (the sixth rowboat, the
  prize hull envelopes and the cutter at (40, −21) included); the camera-only volumes: each plot's pad box from deck − 0.3 to deck + its max height; the
  hill's cylinders; the camera's target over every place and porch clear of them.
- **`tests/cosmetics.test.cjs`** (rows C1–C15 + appended) — the two trophies and their feats; `FEAT_MAX.island` still
  30; `island4` 33 equals the `PLOTS4` tier sum (read from island.js as a `data:` URL); the three crews' looks emit only
  accepted options; prizes keep the three new types (and still drop `"kraken"`).
- **Unchanged and must pass as they are:** `mechanics.test`, `mechanics3.test` (the two-part compose is unchanged),
  `kraken.test`, `specials.test`, `combat.test` (the three new ship types pass its per-type loops), `armory.test`,
  `upgrades.test`, `quiz.test`, `settings.test`, `server.test`, every existing `island.test` and `walk.test` check.

### 13.2 Browser suites

**`tests/voyage4.cjs`** (new; Voyage IV live, or `?v4=1` before Stage 3)
- The journey: cards 10–12 under "Voyage IV · The Sunset Isles", card 10 "Drive off the Kraken", the compact pill; the
  migration (`unlocked 9` + `kraken 1` opens card 10 at load; `kraken 0` doesn't); level 9's Victory with the teaser and
  "Sail on to the Sunset Isles"; Enter starts level 10 with the voyage gold; the won dock's exits.
- Each level: the layout rules, `crateSpots`, the env's data (`fogLoops`, `currents`, `tideBars`, `fortSpots`, the lair
  and arena).
- The pools: `G.v4.waves` equals `pools.drawWaves` for the pinned seed; Try again replays the same waves; a clear raises
  `plays` (the voyage4 record written before the gold is banked) and the next start draws differently; the cleared
  card's line.
- Meeting: the meet card once per kind (`met` saved at once), the NEW tag for 10 s, the grace held until 4 s after the
  card shows (a wave-2 newcomer whose card waits behind the "Reinforcements!" banner never attacks before its card has
  shown for 4 s), `#game-live`.
- Each kind through `G.v4.spawn` / `G.spawn` on any level: the coconuts (warning, damage only in the ring, grape tips);
  the Sting Sloop (stern hold, dance, BEHIND YOU!); nets (fan, TANGLED ×0.5 / ×0.6, the strip's words and timer, cut by
  a held G, 3 presses, a held CUT!, released ≤ 4 s, no chain for 8 s); puffers (puff, pop, PFFT!, the guns' grape-only
  aim beside a ship); the Witch (summons ≤ 6, the song, Stink); Old Coilback (UNDER WATER, the FIRE! light dark, the lane,
  dizzy ×2); the fort (track, lock, damage only on the locked line); G's words on every pseudo kind; **no pseudo kind is
  ever captured, boarded, given crew pips or counted in `feats.prizes`**.
- The hazards: fog (hidden beyond 14 u, FOG! on the Fire cells, a manual broadside still hits, never your ship or a
  ring hidden, HIDDEN chip); currents (the drift); the tide (shallows ×0.5, no collider, stops at the wake).
- Kindness: ≤ 6 warning shapes at once in a crowded scene (a 7th waits); at 390×844 portrait a ring landing near the
  hull is on screen when it lands (the framing).
- The finale: wave 2 falls → the dread (loads refilled, the checkpoint) → the wake (skippable by a key; reduced motion
  via `emulateMedia`: no glide, no shake); the phases; ≤ 2 attacks telegraphed; a push never damages; the FIRE! light on
  its parts; G says "sea monster"; driven off → the Conch (+1,200), the hermit crab, `won` then `shell` saved, the final
  Victory text, Enter → the title; sunk in the fight → `#shellback-retry-btn` → the short wake at 3,000 hp with full
  hull, crew and loads and the plunder from the dread; the shipyard keeps the checkpoint and says so (SAVES-1); leaving
  after the drive-off wins and banks (SAVES-2).
- Warm draws: after the fly-in no new program is created at the first fog bank, current, low tide, Coilback dive or the
  wake (the renderer's program count stays constant).
- **Bot v4** (profile V4, §2.8), one seeded run each in CI: levels 10–12 each cleared within 900 s of simulated time
  (a second try allowed) **with specials** and **with none**; never stuck (no 60 s without progress); the Shellback
  fight ≤ 240 s; never inside land. (The 120–180 s band and the order L10 < L11 < L12 are Stage 3's offline 48-seed
  medians, recorded in §19, not CI assertions.)
- Draw calls: each Voyage IV level start ≤ 310; the busiest sampled play ≤ 450; the Shellback fight ≤ 450; the 568×320
  banner check of levels.cjs for levels 10–12; screenshots `mangroves.png`, `spires.png`, `shoals.png`,
  `shellback-wake.png`, `shellback-fight.png`, `foes.png`.

**`tests/isle4.cjs`** (new; the island with `v4`)
- The places bar still has six buttons at the 7 town sizes (no overlap, ≥ 44 px, no page scroll); the Harbour menu
  gains Island map; `I` opens the map; its list reaches every district, plot and islander by keyboard only and by taps
  (≥ 44 px; `#map-live`); Walk there and Hop there (a fade; a cut under reduced motion; refused during a scene or with a
  panel open; lands on free walk; the camera follows); a plot board opens Bess's panel at its row; talk (the prompt
  priority door > board > talk > pet; E, Enter, a tap; Next; walking away ends; `#town-live`); a tap on an islander walks
  up and chats; petting; the district toasts; the lookout (climb, panorama, down by a key, a tap or 30 s idle).
- **The walking bug, every walker, with the crowd at its maximum** (21 plots at tier 3, every islander and animal out):
  (a) 30 s of random keys, stick drags and taps never leave the captain stuck for more than 1 s; (b) **every new link**
  crossed both ways, every run gets across, sampled to fit the time budget: on **every rope bridge** (the 5 new ones and
  the 7 scenery ones, **the five long ones `yardS7`, `tavernS3`, `gardenS13`, `s13S14`, `s7S17` named in the output**) a
  held key, a held stick and a tap-to-walk at all 10 moments of the islanders' day (12 × 2 × 3 × 10 = 720 runs); on the
  16 boardwalks and the steps a held key and a held stick at 3 moments and a tap at 1 (≈ 230 runs); ≈ 950 runs in all
  instead of 1,680; (c) the porter check of SPEC3 still passes; (d) no islander ever stops on a link, inside a place
  circle, in a doorway or at the gangplank (sampled over 120 s). The walking section is its own section of isle4.cjs
  (`node tests/isle4.cjs walking`) with a budget of **≤ 6 min** on SwiftShader; 2D measures it, and if it is over, the
  boardwalks' tap runs drop to one direction first.
- **The construction scene:** a new building (the record, then the chest, then the scene); the stages in order with
  their captions and pips; the blueprint; a skip by a key, a tap and Skip (the building stands, one cheer, the key does
  nothing else); reduced motion: four stills, 5.0 s; leaving or closing mid-scene keeps the building; the double-build
  guard; Watch again writes nothing; one of the ten SPEC3 plots uses the scene too; **no ink outline above the cut
  line** (a pixel probe on the outline pass's colour at the cut, mid-walls); nothing outside the plot clipped (a probe
  of the plaza's pixels before and during the scene); the folded 56 px bar in portrait never covers the plot.
- The panel: four district tabs at the 7 sizes; at 320×480 a built row (with its inline Watch again) is no taller than
  today's row; the not-on-sale reasons; storage full → refused at no cost; two tabs
  (island4 tiers merge by the larger); an older tab rewriting the feats → this tab re-derives `island4`, `shell` and the
  new prizes.
- The camera: from every porch the walk camera never sits inside a pad's box and its boom keeps ≥ 2.5 u (today's porch
  issue, SPEC3 §19, not made worse); the shipyard showcase ray probe with every plot at tier 3 (no pad box covers the
  docked ship from any showcase pose at the 6 layout sizes).
- Draw calls (§14): the town walk view ≤ 450 at **48 spots × 8 headings** (the old 30 spots plus the hilltop, the
  hill's shoulder, Sunset Beach, Fisher's Pier's end, the Long Walk's middle, the High Walk, Lighthouse Walk, the lookout
  panorama and the zip line's top and middle); the shipyard view ≤ 450; the build view during a scene ≤ 450; the dock
  frame ≤ 1.5 M triangles (§14.2's sum, reported beside Stage 0's baseline). Screenshots `district-*.png`, `scene-*.png`, `map.png`, `lookout.png`, `crowd.png`.

**`tests/battle.cjs`** (new sections only) — the parts registry on any level with a spawned pack, patch and fort (aim,
FIRE!, hits, a word once per volley, no capture); nets cut by G and CUT!; on levels 1–9 nothing changes (the warn cap is
∞, no fog, no new kind, `combatRng` seeded as today).

**`tests/balance.cjs`** (opt-in, new sections) — bot v4 over 48 seeds per level and configuration (the §2.8 guards);
the "every Voyage IV building at tier 3" run; the Voyage I–III re-runs exactly as today.

### 13.3 Bot v4

Bot v3 (SPEC3 §13.3) plus: grape on jollyboat packs and puffer patches; chain on a Sting Sloop; turns bow or stern to a
net fan, and holds G to cut a net; Fire on a Net Sloop whose net whirls; Stink on the Witch and on a rearing Coilback;
steers out of every fan, lane, sector, sight line and ring (like lava); keeps a fort's line off itself by changing course
when it tracks; fires at the Coilback's head when it is dizzy; knocks forts down with round shot; against the Shellback
the towers, then the eyes and claws, dodging sweeps and charges; avoids tide shallows while they are out. The
no-specials run sets the powder record to none. Stage 3 runs **48 seeds per level per configuration** offline (profile
V4; with and without special shot; beam-keeping and circling) and records the medians in §19; the suite runs one seeded
run each.

### 13.4 Existing assertions that change — and only these

Anchored at `eedb108` (re-anchored by content before Stage 0, §0.3). Before Stage 3, the dry run of §12 (the whole
suite on a scratch copy with `WITH_V4` forced true) lists every failing line; each one missing here is added here first.

| Row | File:line | Today | Becomes | Stage |
|---|---|---|---|---|
| C1 | `tests/cosmetics.test.cjs:93` | `DEFAULT_FEATS` with 9 counters | + `shell: 0, island4: 0` (after `island`, before `prizes`) | 1F |
| C2 | `tests/cosmetics.test.cjs:94` | `SPEC_FEATS_TEXT` | + `"shell":0,"island4":0` before `"prizes"` | 1F |
| C3 | `tests/cosmetics.test.cjs:95` | `ALL_FEATS` | + `shell: 1, island4: 33` | 1F |
| C4 | `tests/cosmetics.test.cjs:106` | `PERSON_OPTS.hat` list | + `'jeweled'` (the islanders' new hats are not item options) | 1F |
| C5 | `tests/cosmetics.test.cjs:124` | `PERSON_OPTS.pet` list | + `'hermit'` | 1F |
| C6 | `tests/cosmetics.test.cjs:257` | `trophies.length === 8` | `=== 10` | 1F |
| C7 | `tests/cosmetics.test.cjs:269` | `FEAT_IDS` = the nine | + `'shell', 'island4'` | 1F |
| C8 | `tests/cosmetics.test.cjs:66, :73` | `CATALOGUE` trophy maps | hat + `jeweled: ['island4', 33]`; pet + `hermit: ['shell', 1]` | 1F |
| C9 | `tests/cosmetics.test.cjs:465` | the field-by-field fallback literal | + `shell: 0, island4: 0` before `prizes` | 1F |
| C10 | `tests/cosmetics.test.cjs:539–540` | 300 random feats with nine counters | + `shell` (0/1) and `island4` (0..33) from the same `rng()`, after `island` | 1F |
| C11 | `tests/cosmetics.test.cjs:1034` | the Governor's coat's lock text "build every plot up to tier 3" (in the `locks` list) | "build the first ten plots up to tier 3" (the feat and minimum unchanged; :1009, the `NEW` table's name row, is untouched) | 1F |
| C12 | `tests/cosmetics.test.cjs:1039–1044` | "today's 64 items": every id not in `NEW_IDS`, `ids.length === 64 && items === '2705954e'` | the two new trophies (`hat.jeweled`, `pet.hermit`) are left out of "today's items" too (filtered beside `NEW_IDS`), so it stays 64 with the same fingerprints | 1F |
| C13 | `tests/cosmetics.test.cjs:1088` | `serializeFeats` text ending `"island":12,"prizes"` | `…"island":12,"shell":0,"island4":0,"prizes":{…}}` | 1F |
| C14 | `tests/cosmetics.test.cjs:1106` | an old record rewritten with `,"kraken":0,"quiz":0,"stars":0,"island":0,"prizes"` | `,"kraken":0,"quiz":0,"stars":0,"island":0,"shell":0,"island4":0,"prizes"` | 1F |
| C15 | `tests/cosmetics.test.cjs:1113` | `same(K.MAX_FEATS, ['legend','kraken','quiz','stars','island'])` | `[…, 'island', 'shell', 'island4']` (§10.1: both new feats merge by max) | 1F |
| S1 | `tests/smoke.cjs:116` | `cards.length === 9` | `=== 12` ("12 level cards") | 3C |
| S2 | `tests/smoke.cjs:118–119` | Easy … Mythic on cards 0–8 | + `/Heroic/`, `/Epic/`, `/Ultimate/` on cards 9–11 | 3C |
| K1 | `tests/controls.cjs:391` | `'too large'`: `unlocked: '10'` → 9 | `unlocked: '13'` → 12 | 3C |
| L1 | `tests/levels.cjs:418` | `WORDS` of nine | + `'Heroic', 'Epic', 'Ultimate'` | 3C |
| L2 | `tests/levels.cjs:419` | the order string ends `C9` | + ` \| H:Voyage IV · The Sunset Isles \| C10 \| C11 \| C12` | 3C |
| L3 | `tests/levels.cjs:421` | `c.heads.length === 3` | `=== 4` | 3C |
| L4 | `tests/levels.cjs:423–425` | three rows of three | four rows of three, each heading between its rows | 3C |
| L5 | `tests/levels.cjs:427` | `cards.length === 9` | `=== 12` | 3C |
| L6 | `tests/levels.cjs:429` | `"Difficulty N of 9"`, `on === N`, `all === 9` | `"Difficulty N of 12"`; cards 1–9 `on === N`; cards 10–12 the compact pill ("☠ ×N", `on` read from it); `all === 12` | 3C |
| L7 | `tests/levels.cjs:431` | cards 4 and 7's lock texts, `[1, 2, 4, 5, 7, 8]` "Locked" | + card 10 "Drive off the Kraken"; `[1, 2, 4, 5, 7, 8, 10, 11]` "Locked" | 3C |
| L8 | `tests/levels.cjs:433` | `slice(3, 6)` and `slice(6)` names | `slice(6, 9)`, plus `slice(9)` = `Misty Mangroves,The Sunken Spires,Shellback Shoals` | 3C |
| L9 | `tests/levels.cjs:507` | Tab reaches all 9 cards | all 12 | 3C |
| L10 | `tests/levels.cjs:1247` | `'PPPLLLLLL'`, `'PPPPPLLLL'` | `'PPPLLLLLLLLL'`, `'PPPPPLLLLLLL'` | 3C |
| L11 | `tests/levels.cjs:1346, :1386–1387` | LIVE-1: `N === 6 \|\| N === 9`, `a0.levels === 9`, the 9-level tab, `a1.cards === 'PPPPPPPPP'` | `N` ∈ {6, 9, 12}; the "build with more levels" tab is the 12-level one; `a1.cards === 'PPPPPPPPPLLL'` (that store has no `feats.kraken`, so no migration) | 3C |
| L12 | `tests/levels.cjs:1207` | A11Y-5: `locked.length === 6` (cards 4–9) | `=== 9` (cards 4–12; `locked[0].why` and the first three tab stops unchanged) | 3C |
| B1 | `tests/battle.cjs:488` | `levels.n === 9` | `=== 12` | 3C |
| B2 | `tests/battle.cjs:2747` | `count === 9` (`?act2=1`) | `=== 12` | 3C |
| V1 | `tests/voyage3.cjs:701` | `v.n === 9` | `=== 12` | 3C |
| V2 | `tests/voyage3.cjs:2125–2126` | the final Victory text and chest | the text + " " + `ACT4_TEASER`; `#act2-btn` "Sail on to the Sunset Isles" shown | 3C |
| V3 | `tests/voyage3.cjs:2131` | Enter on level 9's Victory goes to the title | Enter starts level 10 (the "last level → title" check moves to level 12 in `voyage4.cjs`) | 3C |
| V4 | `tests/voyage3.cjs:3055–3056` | `three = fresh.cards.slice(6)`, `fresh.cards.length === 9`, `order.slice(-4)` | `slice(6, 9)`, `=== 12`, `order.slice(-8, -4)` for Voyage III | 3C |
| A1 | `tests/ashore.cjs:1163–1171` | the montage: `G.env.montage`, "a key skips the montage"; `b1.live` the built line | the construction scene: `G.island.scene` (`running`, `stage`), "a key skips the scene"; `b1.live` the first caption ("Builders on the way!"), the built line after the skip; the Cottage stands, its villagers walk out | 3C |
| A2 | `tests/ashore.cjs:1191–1213` | left alone the montage runs to its end: scaffold → spring with squash (`min < 0.95`, `max > 1.0`) | left alone the scene runs its stages in order (`foundation` … `movingIn`) in 9.4 s of scene time (advanced with `scene.advance`), the building joins the layer at its end; no squash check | 3C |
| A3 | `tests/ashore.cjs:680, :836, :839` | the walking section's run loop over every `env.walk.links` entry, `setup.links` = today's four, `runs.length === 240` | the loop and `setup.links` filtered by id to today's four (`plazaGarden`, `plazaS1`, `plazaYard`, `tavernTower`), so `runs.length === 240` holds (32 links would make 1,920 runs; the new links are crossed in `isle4.cjs`). `P.step` (:624) is unchanged: under `v4` `env.cull()` runs the crowd director itself (§7.2) | 3C |
| A4 | `tests/ashore.cjs:1179–1189` | `press('x')` skips the montage, then a double click builds Tailor's Lane | after the key, wait until `G.island.scene.running` is false (the skip's 0.3 s; while a scene runs every Build button reads "Building…") before the double click | 3C |
| A5 | `tests/ashore.cjs:1219–1221` | storage full: `sf.montage === null` (`G.env.montage`) | `G.island.scene.running === false` (no scene starts) | 3C |
| A6 | `tests/ashore.cjs:1243–1245` | the walk data is `sparrow-walk.json` byte for byte before and after a purchase | compared with `sparrow-walk-v4.json` when `WITH_V4` (still unchanged by any purchase) | 3C |
| A7 | `tests/ashore.cjs:1249–1257` | reduced motion: `spring()` (reads `G.env.montage`) finds no squash; `town.api.montage`; 2 villagers | the scene under reduced motion run to its end with `scene.advance` (four stills, `sceneLength(kind, true)`), no squash; `G.island.scene` in place of `town.api.montage`; 2 villagers once it ends | 3C |
| A8 | `tests/ashore.cjs:1277–1278` | build-all: `rows.every('Fully built\|true')`, `/^Pirate Capital! Every plot is fully built/` (buildPanel.js:267), `after.plots === '3333333333'` | each build's scene skipped before the next; `rows` and `after.plots` filtered to the ten `PLOTS` ids (`env.plots` lists all 21 under `v4`); the rank check `/Pirate Capital/` in the header (`rank4` at 30 tiers, next Grand Port; the "Every plot is fully built" note waits for all 21) | 3C |
| A9 | `tests/ashore.cjs:1710–1711` | the draws section: `env0.plots === '3333333333'` | the ten `PLOTS` ids' tiers `'3333333333'` (filtered by id) | 3C |
| T1 | `tests/town.cjs:1491, :1764, :1921` | loops over every `env.walk.links` entry | filtered by id to today's four links (the new ones are crossed in `isle4.cjs`), keeping the suite inside its time; :1533's `runs === links × 12` then holds as today | 3C |

**Additions only** (no existing check changes): `island.test.cjs`, `walk.test.cjs` (new `v4` sections; the old ones run
on today's fixture as they are, including :418 "no new walkable area or bridge", :389's ten `PLOTS` and :422–437's
envelopes), `battle.cjs` new sections; `town.cjs` only T1 (its places loop over the four places and the porter check
still pass); the smoke "level layouts are sane" and draw-call loops cover levels 10–12 automatically (they iterate
`LEVELS.length`); `ashore.cjs`'s draws section keeps its 30 × 8 probe (`isle4.cjs` runs 48 × 8); the build section's
`T.b().focus(id)` keeps working because `buildPanel.api.focus(id)` selects that plot's district tab first.

**Unchanged and must pass as they are:** every `mechanics.test.cjs`, `mechanics3.test.cjs` (its compose checks and
level 9's `victoryLine` in act3.js, untouched: voyage.js lays the new keys over level 9), `kraken.test.cjs`,
`specials.test.cjs`, `upgrades.test.cjs`, `armory.test.cjs`, `quiz.test.cjs`, `settings.test.cjs`, `server.test.cjs`,
`audio.cjs` check; `cosmetics.test.cjs:271` (`FEAT_PRIZE_TYPES` equals the enemy `SHIP_TYPES`: both gain the same three
in Stage 0); `island.test.cjs` (`PLOTS` 10, totals 11,800, `GIFT` 240, `RANKS`); the tips value 65,535; the porter
check; the controls.cjs ship battery; the tavern's rows; the Harbour menu's `>= 5` buttons; the smoke dock checks
(`peopleCount` counts every new person; islanders use the light build).

`package.json` `"test"`: `combat, specials, armory, cosmetics, walk, walkgraph, mechanics, mechanics3, mechanics4,
kraken, foes4, shellback, pools, island, islanders, quiz, settings, upgrades, server` (Node) then `smoke, controls,
audio, battle, levels, town, voyage3, ashore, voyage4, isle4` (browser): **29 suites**, with a `test:<name>` script for
each; plus the opt-in `test:balance` (not in `"test"`). Agent 0 adds the six new Node suites (`walkgraph`,
`mechanics4`, `foes4`, `shellback`, `pools`, `islanders`) in these places in Stage 0, as passing stubs their Stage 1
owners replace, so `npm test` gates them from Stage 1 on; 3C adds `voyage4` and `isle4` in Stage 3.

---------------------------------------------------------------------------------------------------

## 14. Performance budgets (draw calls = `renderInfo.calls`, both outline passes, `?quality=low`, 1280×720, stock ship)

### 14.1 Battles

| Scene | Budget | Today | Planned |
|---|---|---|---|
| Voyage IV env alone | ≤ 220 | — | statics merged; fireflies, fog puffs, current arrows, tide bubbles: one mesh or InstancedMesh each |
| Voyage IV level start | ≤ 310 | — | env ≤ 220 + ships + the helm captain + tags |
| Voyage IV busiest (4 slots including a pack and a patch, a boarding, statuses, a hazard, ≤ 6 warning shapes, crates) | **≤ 450** | — | ships ≤ a Man-o'-War's each; a pack 4; puffers 3; Old Coilback ≤ 6; a fort ≤ 6; every telegraph shape ≤ 6 (instanced by kind); fog ≤ 4; the net drape 2; tags +1 each |
| The Shellback fight | **≤ 450** | — | the Shellback ≤ 40 (≤ 1.3 × a Man-o'-War's, whichever is lower); no ships; ≤ 2 attacks × their shapes |
| Levels 1–9 with the update | **= today** (±2) | L7 219, L8 236, L9 210 peaks (stage4-review); level starts re-measured in Stage 0 | nothing new is drawn there (the net drape is hidden; no fog; no tags) |
| Per new ship model | ≤ a Man-o'-War's calls | — | — |

**CPU and stalls:** every Voyage IV sea's hazard and foe materials (fog puffs, current arrows, tide bubbles, every
telegraph shape, the pack, puffers, the Coilback, forts) get a **real first draw** at level start, hidden behind the
fly-in, through the outline effect's both passes so the outlined models' ink programs warm too (`warmDraw`, §11.2), and the Shellback's during the fly-in and wave 1 (prebuilt one mesh a frame, like the
Kraken). The next wave's ship meshes prebuild hidden as today (PERF-4); pseudo kinds are instanced (no build cost).

### 14.2 The town: a summed budget, from measured numbers

The walk view's worst today is **401** (every SPEC3 plot at tier 3, 8 villagers, Bess, Barnacle, 2 prize ships; 30
spots × 8 headings; all of them low vantage points). From the hilltop and the lookout panorama far more of the town is
in view at once, so Stage 0 also measures the **panorama / hill baseline** (today's town from a forced
whole-island-in-view pose at today's crow's nest and an elevated pose over `s12`, §12 Stage 0 item 10(a)). The table
starts from **B = the larger of the two**, with its breakdown and **P₀**; the plan adds:

| Item | Calls added | How |
|---|---|---|
| Today's worst view, **B** | max(401, the panorama / hill baseline) | measured in Stage 0 |
| The new districts' statics (platform decks, porches, 16 boardwalks, 5 rope bridges, the islets, Fisher's Pier, signposts, arches, lanterns) | **+0** (≤ +2 if a bake group splits at 65k vertices) | baked by sparrow into the town's existing ink-weight meshes; ≤ 150k triangles |
| The development layer's second half (11 plots) | **+6** | ≤ 3 outlined meshes × 2 passes; boards in its texture mesh |
| New animated parts (forge glow, water wheel, the dome, aquarium shimmer, music notes, windpump) | **+6** | one mesh or InstancedMesh each |
| Animals | **+14** | 7 species × (InstancedMesh + ink twin) |
| Full-detail people beyond today's peak | **+10** | the one cap `PEOPLE_DRAWN = P₀ + 2` (§7.2) |
| **Worst planned** | **B + 36** (+ 38 if a bake group splits): **437** (439) on B = 401 | ≤ 450; if B + 36 > 450 (a panorama baseline above 414), the drop order's step (4) applies to the panorama and hill views from the start, and Stage 0 records it in §19 |

| Scene | Budget | Plan |
|---|---|---|
| Town walk view, all 21 plots at tier 3, the crowd at its cap, every animal out, Bess, Barnacle, 2 prizes (**48 spots × 8 headings**, including the hilltop, the beach, Fisher's Pier, the Long Walk, the High Walk, the lookout panorama and the zip line) | **≤ 450** | the table above |
| Shipyard view | ≤ 450 | today 308–315 + the second half 6 + animated parts in view ≤ 6 (islanders, builders and animals hidden) ≈ **330** |
| Build view during a construction scene | ≤ 450 | today ≤ 96 + ≈ 49 (§5.3) ≈ **145** |
| The lookout panorama | ≤ 450 | the walk view's table from the panorama baseline (the whole island in view is the table's sum) |
| Quiz view | unchanged (≈ 52) | — |
| Dock frame triangles (as smoke.cjs:511 counts them) | ≤ 1.5 M | a sum, like the draw calls: **today's dock frame** (Stage 0 item 10(f); it already holds the ten SPEC3 plots) + the districts ≤ 150k + the **11** new tier-3 buildings ≤ 25k each (≤ 275k) + the islanders and builders drawn in that frame (the light build, ≤ 4,000 each; 33 islanders + 3 builders ≤ 144k at most, fewer where the shipyard view hides them) + the animals (1Q reports their triangles). If the sum passes 1.5 M, the new buildings' budget drops to 20k each first, then the drop order applies |

**CPU:** both halves of the development layer rebake in ≤ 40 ms each (behind the scene's dust or the "Rowing to…"
toast); islanders and builders are built one per frame from dock open; routines are O(islanders) a frame; animals update
only within 40 u; the walk graph builds once at dock open behind the toast in ≤ 300 ms and a path takes ≤ 20 ms (§6.6;
today's island already takes ≈ 56–65 ms to build, lazily, at the first path).

**Drop order** if a budget is exceeded (each step re-measured): (1) animals beyond five species in view (−4); (2)
`PEOPLE_DRAWN` back to P₀ (−10); (3) the music notes and the aquarium's shimmer (−2); (4) in the lookout panorama and
from the hilltop, islanders and animals beyond 20 u; (5) the construction scene's blueprint (−1, the build view only);
(6) in battle, the fireflies 150 → 75 and the current arrows of the lanes you are not in.

---------------------------------------------------------------------------------------------------

## 15. Accessibility requirements (checked in Stage 4; SPEC2 §13 and SPEC3 §15 hold)

- Every new control is a real `<button>` (or a tab) with a name, a visible focus ring and ≥ 44 × 44 px (Skip, Watch
  again, Next, Climb down, the map's list, the district tabs); states use icon + text + colour; out-of-reach buttons stay
  focusable with `aria-disabled` and a described reason.
- Small text ≥ 4.5:1 (the `--*-text` tokens on paper); pop text ≥ 24 px white with a 3 px ink outline; the meet card's
  text the banner's size.
- **Threats read by shape, sound and word, never colour alone:** a dotted ring (coconut), a spiky ring (puffer), a
  hatched fan (net), a dashed lane with arrows (lunge, charge), a dotted line that turns solid (fort, towers), a
  zigzag-edged sector (claw), a plain ring (boulder), green bubbling rings (summon), a ring of notes (song); each with its
  word and sound (§3.1); `#game-live` says them (≤ one per 1.5 s; boss ≤ one per 3 s).
- **Live regions:** `#game-live`, `#build-live` (the scene's captions), `#town-live` (talk, toasts, the map), `#map-live`,
  `#tavern-live` — polite, de-duplicated like `announce()`.
- **Nobody needs to walk:** every district, plot and islander's chat is in the Island map's list (keyboard and screen
  readers); every plot is in Bess's panel; the places bar and Harbour menu as today. The map, the talk bubble and the
  panels are non-modal, focus their first control on open, `Esc` steps back and focus returns to where it was.
- **No mashing:** a net is cut by holding G or CUT! and always lets go within 4 s; the construction scene skips with
  one tap or key; nothing has a timer the child must beat.
- **`prefers-reduced-motion`:** the Shellback's wake is a cut; no camera glide (the wake, the scene, Hop there, the
  lookout's climb), no orbit, no shake of any kind (claws, charges, lunges, coconuts), no squash or flying sawdust or
  confetti (the scene's four stills), no swirling fog, hops and the zip line are fades.
- **Photosensitivity:** every glow and pulse ≤ 1 Hz (puffer rings 1 Hz, fireflies ≤ 0.8 Hz, coral ≤ 0.5 Hz, the forge's
  glow, anvil sparks); flashes (the fort's lock, the Shellback's bloom) ≤ 0.25 opacity and ≤ one per 3 s; nothing
  strobes.
- **Sound:** the dread drone carries harmonics at 80–240 Hz (phone speakers); every new warning has a sound **and** a
  shape **and** a word; the town tune's layers never drown the SFX (`SFX_GAIN`).
- **Phones:** the places bar keeps six buttons; Talk, Build and Climb share the Go-in button (the door wins); the meet
  card, the strip and the 56 px bar never cover the fire pad, the steering pad or the plot; no new act-pad button.
- Layouts pass at 320×480, 360×480 / 640, 390×844, 568×320, 640×360, 844×390, 1024×600, 1280×720 (the title with 12
  cards; battles with the meet card, the net strip and the fog chip; the town with the map, the talk bubble, the build
  panel's district tabs and the scene's strip or bar).

---------------------------------------------------------------------------------------------------

## 16. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Scope: three seas, seven kinds and a boss, eleven buildings × 3 tiers, six districts, 33 islanders and 7 species, the scene, the map | SPEC3's proven pipeline (seams first, pure modules and env/art modules in parallel, one owner per big file per stage, hook requests, Stage 1b re-checks); building tiers are add-on kits baked into the layer; every pseudo kind instanced; the cut list (§17), cheapest polish first |
| Pools always giving the same waves (combatRng reseeded per start) | the seed comes from saved `plays`, not `combatRng` (§3.5); a Node test proves `plays + 1` changes the waves |
| A new kind arriving unannounced or two at once | `INTRO` order and the `must` slot; a 1,000-seed test; the meet card |
| Creatures leaking into ship code (capture, crew, prizes) | creatures and packs are never `SHIP_TYPES`; the parts registry (§3.7) generalising the Kraken's tested seam; voyage4.cjs asserts nothing pseudo is captured or counted |
| An older tab or cached build erasing new buildings or feats | the stale-tab rule (§0.1): new records only, re-derived feats, `FEAT_MAX.island` 30, tips in the new record (§10.2's table) |
| The construction reveal showing unbuilt ink outlines | clipping planes on per-scene material clones (the outline sync copies them); a pixel probe in isle4.cjs; 1P's screenshots at the cut line |
| Walkable platforms collapsing the walk camera | pads from tier 0 replace the platform-wide envelopes; porches ≥ 1.6 u; the camera probe on every porch; the shipyard ray probe |
| Visible but unreachable places remaining | the "planks or sand" rule; `walk.bridges` lists every rendered bridge and a test requires its link; every area reachable from the spawn |
| More walkers, more deadlocks (the player's first bug) | islanders are `folk()` walkers with LOOK-2 and the squeeze-past; no pauses near mouths; ≤ 2 loops per rope bridge; boardwalks 1.8 u wide; animals never block; crossing tests on every link with the crowd at max; "walking (a)" never loosened |
| Town draw calls | the summed table (§14.2) from Stage 0's measured breakdown; one people cap; instanced animals; statics baked; 48 × 8 probe; a drop order |
| `walk.graph()` slowing on an island twice the size (today's already ≈ 56–65 ms, mostly `clear()`) | the spatial hash in `graph()` and `near()`, memoised `clear()`, reused A* arrays, identical results; the graph built once at dock open behind the toast, never at the first tap; budgets ≤ 300 ms / ≤ 20 ms beside Stage 0's measured baseline (§6.6) |
| The Shellback trapping or squashing the ship | it is never a collider; pushes only, no damage; 600 s scripted-player tests per phase; arena rules |
| Fog as a stalemate | manual fire still hits; no healing inside; pirates seek your last spot; FOG! / HIDDEN words |
| New perks flattening Voyages I–III | the perk rule; `PERK4_SCOPE` test; bots tune Voyage IV with no building and with every perk at max |
| main.js (9,860), sparrow.js (6,700), townMode.js (2,147) as bottlenecks | one owner per stage each; new modules behind thin seams; Stage 0's seams with identical results |
| Test churn | the flag; new records instead of edits; `PLOTS` and `RANKS` kept; two walk fixtures; the exact rows of §13.4 |
| First-draw stalls during a 1.5 s warning | `warmDraw` of every new program at level start and dock open |
| Phones: crowded HUD and pop words | no new buttons; the strip folds; the per-target word throttle; meet cards wait for banners |

---------------------------------------------------------------------------------------------------

## 17. Cut list (cut from the top; each cut leaves a consistent game)

1. The zip line (the hill keeps its steps).
2. Watch again on built rows.
3. The lookout (the crow's nest stays part of the tower, like a roof).
4. The Sea Guide (the meet cards and the rumour board's foes stay).
5. Petting animals (the animals stay).
6. Hop there (Walk there and the map's list stay).
7. The Mermaid Grotto and the merfolk (10 new buildings remain; the Grotto's islet shore stays a beach).
8. The coral currents (level 11 keeps its foes).
9. The ebb tide (level 12 keeps its forts).
10. The Trophy Museum and the Music Hall (8 new buildings remain: 3 homes, Forge, Fishing Hut, Goat Farm, Observatory,
    Aquarium; with the Grotto already cut, the new plots then cost 11,600).
11. The Shellback's Charge phase (two phases, 2,000 hp, one notch at 1,000; the cut keeps the 2–3 minute target by
    re-tuning).
12. Old Coilback (level 11's wave 3 has no new kind and draws as level 11's wave 2; six new kinds remain: jolly,
    stinger, netsloop, puffer, witch, fort — three of them not ships, the puffers a sea creature, and the Shellback a
    second one, so §1's floor of two sea creatures still holds).

(The nets' cut, the meet cards, the construction scene's stages, skip and reduced motion, and every walkable deck are
**never cut**: §1.)

**Never cut:** see §1.

---------------------------------------------------------------------------------------------------

## 18. Defaults the player can change (built unless the player says otherwise)

1. **The finale is a sleepy crab island that wakes up** (the Shellback), driven off, not beaten, and a baby hermit crab
   comes home with you. Or would you rather fight a giant ship?
2. **Try again gives the same waves; after a win the seas change.** Or new waves every try?
3. **A house goes up in about 9 seconds** you can watch or skip. Longer, or shorter?
4. **Some buildings give gold or fun things** (dancing villagers, goats, models of your prizes) rather than battle
   help, so the old levels stay the same. Or stronger battle perks?
5. **Monkeys, puffers, a grumpy sea serpent and a crab island; nobody gets hurt**, they all swim (or scuttle) home. Or
   should beaten foes sink?
6. **The island map lets you hop anywhere**, not only walk. Or walking only?

---------------------------------------------------------------------------------------------------

## 19. Build record (filled in by Stage 0, Stage 3 and Stage 4)

Every place where the build differs from this plan, every measured or tuned number (the Stage 0 baselines, P₀ and
`PEOPLE_DRAWN`, the ten pads, a Man-o'-War's calls; the bot v4 medians) and every review finding that changed something,
with the section it touches, as in SPEC3 §19. Empty until Stage 0.

### Spec check (pre-build)

Every issue was re-checked against this file and the code at `eedb108`; all 37 were confirmed (three only in part, as
noted) and fixed where their numbers live.

- **B1** (rope bridges ≤ 3 u vs the bridges kept) — confirmed: deck gaps from sparrow.js's `bridges` endpoints are
  s1S2 2.83, tavernS16 2.55, yardS7 4.49, tavernS3 4.26, gardenS13 5.59, s13S14 6.99, s7S17 4.42; today's walkable
  links 3.51–5.31. Changed: every link has a `kind` ('rope' | 'board' | 'steps') in islandPlan `LINKS` and its hw
  follows the kind (§6.2, §11.1 `WALKWAY`, §13.1 walk.test); the rule is now "**new** rope bridges span ≤ 3 u of water"
  (§1, §6.2); the five long scenery bridges are named with their spans. Boardwalk width on them is refuted by the art
  (hand ropes at ±0.55 u inside a 0.6 band, and §6.3 keeps their art), so they carry ≤ 1 islander loop, no pauses on or
  near them, and are named walking-bug probes (§6.2, §6.5, §7.3, §13.1, §13.2).
- **B2** (cosmetics.test lines outside C1–C11) — confirmed at :1044, :1088, :1106, :1113; :1009 is the name row.
  Changed: rows C12–C15 added, C11 re-anchored to :1034; 1F owns C1–C15 (§12, §13.1, §13.4).
- **B3** (browser assertions missing from §13.4) — confirmed at every cited line, plus two more found while checking:
  the double click after the key skip (:1179–1189, the skip now takes 0.3 s) and the draws section's
  `env0.plots === '3333333333'` (:1710–1711). Changed: A1 and A3 extended, A4–A9, L12 and T1 added, L11 and V4 extended;
  a pre-Stage 3 dry run with `WITH_V4` forced true lists any other failing line first (§12, §13.4).
- **B4** (walk graph budget) — confirmed: 475 nodes, 2,513 edges, 59–63 ms cold here; the graph is built lazily.
  Changed: hashed `near()`, memoised `clear()`, reused A* arrays; built once at dock open behind the toast; budgets
  graph ≤ 300 ms, path ≤ 20 ms beside a Stage 0 baseline (item 10(g)); identical nodes/edges kept (§0.2, §6.6, §11.1,
  §12 1E, §13.1, §14.2, §16).
- **M1** (no fallback ship model) — confirmed for battle spawns (ships.js:5650–5653); refuted for town prizes
  (`setPrizes` catches the throw). Changed: agent 0 owns the three `BUILDERS` lines (cutter / privateer / bomb-ketch
  builders) until 1H replaces them (§11.1, §12).
- **M2** (puffer counts) — confirmed. Changed: at most one patch a wave; patch `min(4, 6 − alive)` (waits when full);
  summons `min(3, 6 − alive)`; spawn opts `{ n, owner }`; `slots()` ignores owned puffers; `sendHome(owner)` (§3.1,
  §3.5, §11.1, §12 1A/1C, §13.1).
- **M3** (contact test impossible) — confirmed. Changed: `SHELLBACK.standoff` (r + half-length + 1 u), push 8 u/s
  (≥ walk + 2) that also cancels a hull's inward speed, the Charge shoves at once and its 3.2 s run is exempt (§3.6.2,
  §3.6.3, §11.1, §12 1C, §13.1).
- **M4** (islanders.js purity, 1D's checks need 1N) — confirmed. Changed: `routinePose(id, t, layout)`,
  `roster(…, layout)`, `walkData4(base, plots4)`; 1D in Stage 1b, `1N ─▶ 1D (1b)` (§7.3, §11.1, §12).
- **M5** (keep-offs broken) — confirmed (7.80 u, 3.15 u, 4.38 u). Changed: the berth keep-off is measured from the
  largest prize hull's envelope (s18 3.8 u, pier ≈ 4.4 u clear, so berth 2 stays); the pier's centreline moves to
  z −13.5; the cutter's (40, −21) anchor is unconditional, with the showcase probe re-run (§6.2).
- **M6** (wrapper shape) — confirmed (main.js:2856–2876, popHeight :3424). Changed: today's shape + `src`; Kraken ids
  `kraken-<part>`, others `<src>-<part>` (§3.7).
- **M7** (SHIP_TYPES on pseudo kinds) — confirmed (1895, 1910–1916, 3970–3975, 7385–7387). Changed: `foeName`,
  `isPseudo` guard, alive counts with `foes4.slots()`, forts at `env.fortSpots` (§3.7, §11.2, §12 2A).
- **M8** (no renderer for clipping; hook path) — confirmed (no `renderer` in townMode.js / town.js). Changed: ctx
  `setClipping(on)` added by 2A in Stage 2; hook requests go to the file's Stage 2 owner (§5.3, §11.1, §11.2, §12).
- **M9** (plan() cap vs 6 u rule) — confirmed. Changed: priority order with a hard cap; undrawn people leave `folk()`;
  dance spots placed like stations; a crowd-over-cap test; `env.cull()` is the director's entry (§7.2, §7.3, §13.1).
- **M10** (48-spot baseline doesn't exist) — confirmed. Changed: Stage 0 measures 30 × 8 plus a crow's-nest panorama
  and an elevated pose over s12; §14.2 starts from B = the larger (§12 item 10(a), §14.2).
- **M11** (feats not byte-identical with the flag off) — confirmed (FEAT_IDS is unflagged). Changed: §0.1 states the
  one-time feats rewrite as the exception; §10.3 notes it.
- **N1** — confirmed (5.7 s). Stills 1.1 s, fades 0.2 s, `reduced` derived = 5.0 (§5.2, §11.1, §13.1).
- **N2** — confirmed. Crabs at most 7; `giggle` SFX for monkeys; turtles silent (§7.1, §7.4, §11.1).
- **N3** — confirmed. New-shack pad limits derived from link mouths (1.6 u porches on linked sides and the front),
  listed in `PADS` by Stage 0; porch extensions the exception (§4.1, §6.3, §12).
- **N4** — confirmed (6 amenities today). Watch again inline in the button bar; a row-height check at 320×480 (§0.3,
  §5.2, §8.6, §12 1R, §13.2).
- **N5** — confirmed (frost 2.5 s, stink 2 s for a boss). `maxTelegraphs` dropped for `ctx.warn.boss`;
  `COILBACK.frost` / `.stink` and `WITCH.stinkQuiet` named as exceptions to `STATUS` (§3.1, §3.2, §3.6.2, §11.1).
- **N6** — confirmed (MAX_PRIZE 9999). `voyage4.prizes` 1..9,999 (§10.1).
- **N7** — confirmed. The grace is held until 4 s after the card shows (§3.4, §13.2).
- **N8** — confirmed. `linesFor(id, progress, touch)`; Ada's touch line (§7.1, §7.4, §11.1, §13.1).
- **N9** — confirmed. `paths` is appended to (kind 'islander'); walkData4 keeps radius, spawn, npcs, doors; ashore's
  `P.step` needs no edit because `env.cull()` runs the director under `v4` (§6.3, §7.2, §11.1, §13.4 A3).
- **N10** — confirmed (main.js:9344). `combat.seed` keeps today's meaning; only `v4.seed` persists (§11.2, §11.3).
- **N11** — confirmed (mechanics3.js:1500). `m4` only with a third part; `visuals` merged by calls; `krakenDue` and
  `addSlick` b's (§11.1, §13.1).
- **N12** — confirmed. §4.2 reworded to the "On sale" column.
- **N13** — confirmed (sparrow.js:5033–5045). The sixth rowboat is in `KEEP_OFF` (§6.2, §13.1).
- **N14** — confirmed. Agent 0 adds the six Node suites as stubs to `package.json`; every Stage 1/2 exit runs its own
  suite (§12, §13.4).
- **N15** — confirmed (ctx3's `hold`). `hold()` in the foes4 and Shellback ctx (§11.1, §13.1).
- **N16** — confirmed (people.js:167–168). A `girl` option replacing the roll's result; every kid/old islander names it
  (§7.1, §11.1, §12 1G, §13.1).
- **N17** — confirmed. isle4 (b) sampled to ≈ 950 runs in its own ≤ 6 min section; town.cjs's link loops filtered (T1)
  (§6.5, §13 header, §13.2, §13.4).
- **N18** — confirmed (scenery.js:266–269). `warmDraw` renders both passes through the outline effect (§11.2, §14.1).
- **N19** — confirmed, with a correction: the ten SPEC3 plots already count today, so the new buildings add ≤ 275k
  (11 × 25k), not 525k. Stage 0 measures today's dock-frame triangles (item 10(f)); §14.2 sums the plan (§7.2, §13.2,
  §14.2).
- **N20** — confirmed. R3: 2A integrates the env modules, edits go to 2E; 3B runs the bot as it stands and hands bot
  changes to 3C (§12).
- **N21** — confirmed. §5.1 no longer says `E` at a board builds.
- **N22** — confirmed. The Coilback rears 14–16 u off and its lane runs from its head to 4 u past your predicted spot
  (§3.1, §13.1).

### Stage 0 (measurements)

(empty)

### Stage 3 (tuning and go-live)

(empty)

### Stage 4 (review)

(empty)

---------------------------------------------------------------------------------------------------

## Appendix A — DOM ids added in Stage 0 (all start `hidden`)

Battle (`#hud`): `#meet-card` with `#meet-icon`, `#meet-name`, `#meet-line`; `#fog-chip`. Reused with new texts:
`#grab-strip`, `#edge-arrow`, `#boss`, `#boss-notches`, `#boss-status`. Shipwreck panel: `#shellback-retry-btn` (first
button, only after the Shellback's checkpoint).
Town: `#harbour-dialog` gains `#harbour-map-btn` ("Island map", with its one-time "New!" badge); `#town-toast`
(`aria-hidden`); `#talk-bubble` with `#talk-name`, `#talk-text`, `#talk-next-btn`; `#lookout-down-btn` ("Climb down");
`#build-scene` with `#scene-stage`, `#scene-pips`, `#scene-skip-btn`; `#build-screen` gains `#build-tab-windmill`,
`#build-tab-lantern`, `#build-tab-lighthouse`, `#build-tab-beach` and their panels `#build-windmill`, `#build-lantern`,
`#build-lighthouse`, `#build-beach` (shown only with `v4`; today's `#build-tab-homes` / `#build-tab-amenities` stay for
the flag-off panel); `#tavern-screen` gains `#tavern-guide` (after `#tavern-log`).
New overlay (class `overlay`, so it joins the inert `backdrops`; placed before `#recover-screen`): `#island-map` with
`#map-svg`, `#map-list`, `#map-walk-btn`, `#map-hop-btn`, `#map-close-btn`, `#map-live`.

## Appendix B — How the designs were merged

**Base: depth** (two of three judges) — Voyage IV of three levels where every foe asks a question the child can already
answer (each ammo gets a Voyage IV job); the Monkey Jollyboats, the kiting ship, the net ship, the Coral Witch, puffer
mines, Old Coilback and the stationary sight-line fort; the Shellback finale (the crab island that wakes, three phases,
the dizzy spell); the pool seed that keeps Try again identical and moves on after a clear; the warning-shape cap and
the boss's two-at-once and no-charge-after-a-sweep rules; plot places on porches ("Build here"); every perk shown where
it works; amenities on sale with progress; the 11 buildings; the islanders' routines and talk; merfolk; the bot-v4 plan
with offline medians; the pure modules (`pools`, `mechanics4`, `shellback`, `buildScene`).

**From arcade:** kid picture-names and one counter line per kind (the xebec became the **Sting Sloop**, the dhow the
**Net Sloop**, the battery the **Rock Fort**); the meet card with a gold NEW tag; met-only pools with a `must` per wave;
Building Day's **blueprint ghost**, the stage pill "Walls ●●○○", the 56 px phone bar with a 44 px Skip, and the scene
for today's ten plots; boardwalks 1.8 u wide; building pads from tier 0 with a test that every tier fits and porch
extensions where room is short; new districts in their own module and stream; the **Island map** with Walk there / Hop
there under `I` and the Harbour menu (no 7th places-bar button); the islanders' counter-hint lines, tap-to-chat and
petting; the **Music Hall** as a pure delight; the plan skeleton (Stage 0 measures the people budget) and the never-cut
list; InstancedMesh + ink twin per animal species (volcano.js's method).

**From spectacle:** the construction scene's technique and beats (a rising **clipping plane** on per-scene material
clones, the plank band and sawdust, the old roof lifting away, Dab's colour-only paint wipe, the builders' cart, the
move-in with a suitcase and a pet, the caption strip with pips); making the **seven scenery rope bridges** walkable with
their own curves; "planks or sand = walkable"; signposts, named arches with toasts, a landmark per direction, district
colours, rings; the zip line (cut first); the `island4` record and the separate `island4` feat; the dev layer split in
halves; the spatial hash in `walk.graph()`; the crowd director with one cap on full-detail people and the tighter cull;
`islandPlan.js` as pure data; the 4 s grace on a first meeting; a unique colour per foe and a thumbnail landmark per
sea (the Banyan Arch, King Coral, the crab island); "nobody dies on screen"; the "Watch again" button.

**Conflicts resolved:**

| Question | Resolution | Why |
|---|---|---|
| Base design | depth, with the grafts above | judges 1 and 3; judge 2's arcade preferences come in as grafts (readability, records, plan) |
| Creatures as `SHIP_TYPES` with `creature: true` (arcade) or pseudo-targets (depth, spectacle) | pseudo-targets in a parts registry; only three new kinds are ships | all three judges' must-fix: cosmetics.test:271, capture, crew, prizes, and SPEC3's "not a ship" rule |
| Where new plot tiers live | a new `pirates-ahoy-island4` | parseIsland drops unknown ids and loadRecord rewrites: an older tab would erase paid buildings (all three judges) |
| `feats.island` 0..63 (depth, arcade) or 0..30 + a new feat (spectacle) | `island` stays 0..30; new `island4` 0..33, re-derived at load | old tabs clamp and rewrite `FEAT_MAX`; the Governor's coat and its tests stay |
| New tips | in `-voyage4`, not `-tips` | an older tab clamps `-tips` to 65,535 |
| Pool seed: from `combatRng` (arcade), session attempts (spectacle), saved plays (depth) | saved `plays`; Try again = the same waves; `combatRng` seeded from it on 10–12 | `combatRng` is reseeded every start; session counters repeat every session; children learn a wave that beat them |
| Met-only from a saved mask or by construction | by construction (`INTRO`), the mask only drives the meet card | a mask in the draw would change the waves between a first try and Try again |
| Warning-shape cap 8 (depth) or 6 (judge 3) | 6 | the stricter cap satisfies every judge; SPEC3's busiest already allowed ≤ 6 rings |
| First meeting: 0.8 s bullet-time (depth) or 4 s grace (spectacle) | 4 s grace + the card, no bullet-time | a deterministic slow-down would touch the simulation; judges 2 and 3 |
| Shellback: a walking island (a moving collider) | the body is never a collider: soft push, no damage, arena rules, layout tests | judge 2's must-fix (no moving land) and judge 3's contact rules |
| Ebb tide: bars become colliders (depth) | bars become **shallows** (speed ×0.5), never land | no temporary colliders (judge 2) |
| Rock Battery boarded and turned (depth) | not boardable ("Too big to board! Knock it down."); knocked down for 100 gold | a new boarding-a-fort path is cut-first scope (judge 3) |
| Fog: nobody can aim (arcade) / hidden beyond 14 u (depth) | depth's semantics + FOG! / HIDDEN words, no healing inside, never hides shapes or your ship | stalemates and silent misses (judges 1, 2) |
| Platforms: porches as extensions with the envelopes kept (depth, judge 3) or walkable decks round shrunk pads (arcade, spectacle, judges 1–2) | walkable decks round **pads measured from today's tier-3 chunks**, porch extensions where room is short; tier art never re-authored | the seven scenery bridges land on the platforms' edges, so the decks must be walkable for the bridges to be; a platform-wide envelope would collapse the camera on the captain standing there; judge 3's concern (no art churn, camera tested on porches) is kept |
| Stacked walk levels (the crow's-nest ladder, the balcony, a spiral stair) | none; the crow's nest is a **place** (the lookout view) | walk.js is 2-D (judges 1, 2, 3) |
| Animals: BatchedMesh (depth, spectacle) or InstancedMesh per species (arcade) | InstancedMesh + ink twin per species (≤ 14 calls) | BatchedMesh's fallback is one call per instance without `WEBGL_multi_draw`; iOS unverified (judge 2) |
| Far "dolls" (spectacle) | out | a second, unproven people system (judges 2, 3) |
| Quests with gold and a record (depth) | out (talk stays) | adds records and owed gold (judge 3) |
| Combat perks (depth's crew cap, Shanty reloads, Aquarium damage; spectacle's creature damage, first-hazard delay; arcade's crates on III) | perks are gold, delight or Voyage-IV-only; the Music Hall and Goat Farm are delights | levels 1–9 stay as they are (all judges) |
| The finale's shape (arcade's ship + duel; spectacle's Witch then a serpent) | the Shellback alone after two waves | memorable, not a repeat of level 9, one boss (judges 1–3) |
| Boardwalk width 1.2 u (depth) or 1.8 u (arcade) | 1.8 u of walking width (2.0 u planks, `hw` 0.6) | two walkers pass; the walking bug (judges 1–3) |
| Upgrade scene length | 7.0 s (new 9.4 s, reduced 5.0 s) | judge 3: upgrades 5–7 s |
| Gift cap 240 → 360 (depth) | `GIFT` stays 240; a separate `gift4` ≤ 120 | SPEC3's pinned island tests stay untouched |
| A trophy id `coat.admiral` (arcade) | `hat.jeweled` and `pet.hermit` | `coat.admiral` already exists (judge 2) |

**Every judge must-fix, and where it is answered:**

| Must-fix | Section |
|---|---|
| Wave pools must really vary (combatRng reseeded per start); seed from saved plays; Try again replays; tests pin the seed | §0.1, §3.5, §13.1 (pools.test) |
| New plot tiers never in `pirates-ahoy-island`; a new record, record first, merge by max, never-throwing parse | §0.1, §10.1–10.2 |
| `FEAT_MAX.island` stays 30; new counters in new feats re-derived at load; new `feats.prizes` kinds survive an old tab | §0.1, §4.2, §10.1–10.2 |
| The reveal visible to the outline pass: clipping planes on per-scene clones, `localClippingEnabled` in town only; record before the scene; skippable; reduced motion; build view ≤ 450 | §5.1–5.3, §14.2, §13.2 (isle4 pixel probe) |
| No visible-but-unreachable places: the 7 scenery bridges; a test that every bridge mesh has a link and every area is reachable | §6.1–6.3, §13.1 (walk.test v4) |
| Plot camera boxes cover whole platforms: shrink to pads, re-run the shipyard ray probe and the walk-camera checks, regenerate the fixture once | §6.3, §12 (1N, 1b), §13.2 |
| walk.js blockers are 2-D: no stacked decks; stairs as links within `CLIMB` | §0.1, §6.2, §6.7 |
| The walking bug: wide boardwalks, short new rope bridges (the five long scenery ones: ≤ 1 loop, no pauses, named probes), ≤ 2 walkers per bridge, no pauses near mouths, animals never block, a jog across every new link with the crowd at max; "walking (a)" headroom | §0.3, §6.2, §6.5, §7.3, §13.2 |
| Town draw calls as a summed budget from Stage 0's measured breakdown, one people cap, every new vantage point probed, a drop order; the shipyard and build views; the 1.5 M triangle frame | §7.2, §14.2, §12 (Stage 0) |
| No BatchedMesh: InstancedMesh + ink twin per species, measured | §7.1, §14.2 |
| Sea creatures never reach capture, surrender, boarding, crew pips, prizes; a pseudo-target registry generalising `targetsFor()` | §0.1, §3.3, §3.7, §13.2 |
| Levels 1–9 unchanged; no perk silently changes Voyage III; bots with no buildings and with every perk at max; no two buildings share a perk | §0.1, §2.8, §4.1, §13.1 (`PERK4_SCOPE`) |
| Fog: no stalemate, no silent misses, FOG! / HIDDEN, never hides shapes or your ship | §2.6, §8.2 |
| One boss sequence with a checkpoint, 2–3 minutes, ≤ 2 attacks at once; SAVES-1, SAVES-2, SPS-1; portrait framing (kraken4:F1); no repeat of level 9's structure | §2.7, §3.6, §8.2 |
| Every new attack ≥ 1.5 s + Lighthouse with shape, sound and word; ≤ 6 warning shapes; pop words capped on phones; flashes ≤ 0.25, glows ≤ 1 Hz; no decoys; untargetable foes explained on their tag | §0.1, §3.1, §3.3, §15 |
| Warm new programs with a real first draw | §11.2 (`warmDraw`), §14.1, §13.2 |
| Node tests for every pure module, browser suites, bot v4, and the exact existing assertions that change | §13 |
| Phones: six places-bar buttons; Talk shares the Go-in button, the door wins; ≥ 44 px; keyboard and screen readers reach every district, plot and chat without walking | §7.4, §8.5, §15 |
| Determinism: sparrow's `rand()` order and people.js's 400-seed looks unchanged; own streams; flag off byte-identical | §0.1, §6.3, §12 (Stage 0, 1G, 1N) |
| New trophy ids don't collide (`coat.admiral` exists) | §4.2, §11.1 |
| `walk.graph()`'s O(n²): a spatial hash and a timing check | §6.6, §13.1 (walkgraph.test) |
| Walkable platforms: pads checked against every tier; porches ≥ 1.6 u; props on new decks become blockers or move; the ray probe on every new building and islet | §6.3, §13.1, §13.2 |
| The seven remaining scenery shacks into plot kits with identical calls in the same order | §0.1, §11.1 (sparrow), §12 (1N) |
| Finale scope: one boss; no moving land masses or temporary colliders unless proven never to trap | §2.5, §2.6 (tide), §3.6.3 |
| Kid rules: nets release ≤ 4 s, cut by holding; no hidden debuffs (the net's penalty said on the strip); the diving serpent's tag; no decoys | §3.1, §8.2 |
| Teleports and rides fade or cut, are refused during a scene or a panel, update the captain and camera, never inside a blocker | §6.8, §8.5 |
| A staged, file-disjoint plan: Stage 0 seams (flag, registry, three-part compose, pool hook, people cap measured), stubs with final APIs, hook requests, one owner per big file per stage | §12 |
| The build panel scales to 21 rows: district tabs, the plot-board shortcut, ≥ 44 px, contrast; the strip never covers the plot | §5.2, §8.6 |
| Construction and saves: the record (island4) then the chest before the scene; skip / leave / close keeps the building; the 400 ms guard; old-tab clamps don't erase data | §5.1, §10.2 |
| Pools drawn once at `startLevel`, ≤ 3 a wave, ≤ 4 afloat, a swarm one slot; the checkpoint keeps its waves | §3.5 |
| people.js options draw no rng unless given | §0.1, §11.1, §12 (1G) |
| Lay out links and islets clear of moored boats, prize berths and the visiting cutter; re-run the shipyard probe | §6.2 (keep-offs), §13.2 |
| Tune against a realistic ship (SPEC3's late profile, no new building); L10 below L9; 0 special loads within two tries | §2.8, §13.3 |
| At most one new kind per wave; pools never draw an unmet kind | §3.5, §13.1 |
| SPEC3's threat caps: ≤ 3 a wave, ≤ 4 afloat; a pack, or a Witch with her summons, one slot | §3.5 |
| Boss tuned to 120–180 s; boss draw-call cap ≤ 1.3 × a Man-o'-War | §2.8, §11.1 (shellbackView), §14.1 |
| Upgrades after the first build use a short scene (5–7 s) | §5.2 (7.0 s) |
| Cut scope that adds records or code paths first (quests, fort boarding, stacked decks, dolls, the zip line, the guide) | §1 (explicitly out), §17 |
| Determinism of every gameplay roll and timer (combatRng / ctx.rng, simulated time, no wall clock) | §0.1 |
