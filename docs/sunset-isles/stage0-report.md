# Sunset Isles Stage 0 report (data, written by the build agent; trust the code)

## 0 Integrator

Stage 0 (row "0 Integrator", items 1–10) is done and published in the working tree; nothing is committed. The
measurements of item 10 were taken first, on an untouched copy of the tree (`git ls-files` of HEAD 4877453, whose
code is eedb108's), and the draw calls were measured again after the work with the same probes: every level start,
the shipyard view and the town walk view are within ±2 of the baseline (most are identical; see "Before and after").
A seeded play of levels 1–9 and of a Kraken fight gives bit-identical results before and after. With `?v4=1` the
title shows 12 cards in four groups, levels 10–12 start as stub seas with one Corsair Cutter each (and clear), there
are no console errors or warnings, and ashore is today's town (its walk data equals `tests/fixtures/sparrow-walk.json`
byte for byte). The full `npm test` result is at the end of this report.

How it was developed: in a mirror at `.dock-harness/v4/0/dev` (copied from the repo), checked there (Node suites, a
`?v4=1` probe, a warm-draw probe, a seeded replay), then published file by file with `cp` to a temporary name in the
same directory and `mv` (new modules first, their importers last). Before publishing I checked that none of the owned
files had changed in the repo since the base copy.

### What was built (items 1–9)

1. **`src/voyage.js`**: `WITH_V4 = /[?&]v4=1(&|$)/.test(location.search)` (guarded for a missing `location`);
   `LEVELS = WITH_V4 ? [...levels.js, ...ACT3_LEVELS', ...ACT4_LEVELS] : today's expression`, where `ACT3_LEVELS'` is
   act3.js's array with level 9 replaced by `{ ...level9, sailOn: 'Sail on to the Sunset Isles', teaser: ACT4_TEASER,
   victoryLine: 'The Kraken Seas are yours' }` (act3.js untouched; with the flag off level 9 is the same object as
   today). Exports `WITH_KRAKEN, WITH_V4, LEVELS, ACT3_TEASER, ACT4_TEASER`.
2. **`levelWaves(def)` and `levelSeed(n)`** in main.js. `levelWaves` returns `state.waves` on a level with a `pool` and
   a drawn `state.waves`, else `def.waves`; every read of a level's waves goes through it (`queuePrebuild`, `spawnWave`,
   `startLevel`'s retry state, overboard types and both banners, `stepKraken`'s last-wave test, the sunk banner, the
   wave advance and clear check in `step()`, the HUD's "+pending", `__game.kraken.rise`). `levelSeed(n)` is
   `n × 7919 + 13` and seeds `combatRng` in `startLevel`. `state.waves`/`state.netted` are reset at every start. In
   Stage 0 no level has a pool, so both return exactly what main used before.
3. **The parts registry** (§3.7): `PARTS = [{ id: 'kraken', get: () => kraken, parts: krakenParts, list: krakenList,
   wrap, place }]`, `syncParts()` in place of `syncKrakenTargets()`, `partSrc(w)` (a wrapper's source while that source
   is still in play), `pseudoBoardWhy(e)`. `targetsFor` concatenates every source's list; `hitsShip`, `damagePseudo`
   (hit, special, the once-per-volley key) and `canGrapple` go through the wrapper's `src`. The Kraken's wrappers are
   today's shape with `src` added as the last key; `GRAPPLE_WHY` gains `small` ("Too small to board!") and `fort`
   ("Too big to board! Knock it down."), which nothing returns yet (the Kraken has no `boardWhy`: a sea monster).
4. **`composeMechanics(parts)`** (mechanics3.js) generalised to any number of parts with §11.1's rules, left to right;
   with two parts or a null third part it returns exactly what it did (no `m4` key). main now calls it with
   `[createMechanics(ids, ctx), m3, null]`. New composed methods `hidden`, `fogAt`, `playerMods`, `cut`, `cutHold`
   (c's, identity without c). `mechanics3.test` passes unchanged (185) and a scratch check of the three-part rules
   passes (12 checks, `m/compose3.mjs`).
5. **`warnSlots`** (`{ max, boss, count, take(kind), give(kind), reset(def) }`, max and boss ∞ in Stage 0, reset at every
   level start) and **`warmDraw(objects)`** (called by nothing yet; tested, see below).
6. **The three ship types** in shipTypes.js (§3.1's numbers): `stinger` "Sting Sloop" (hp 60, 8.5 × 2.6, 14 u/s, accel
   4.6, turn 1.7, reload 2.2, 2 × 4, gold 6, engage 26, spread 0.1, crew 9, grit 1.1, `kiter`), `netsloop` "Net Sloop"
   (hp 65, 8.5 × 3.0, 10, 3.2, 1.3, reload 3.2, 1 × 4, gold 5, engage 16, spread 0.12, crew 10, grit 1.0, `nets`), `witch`
   "Coral Witch's Barge" (hp 120, 10 × 3.6, 5.5, 1.6, 0.7, no guns: guns 0, dmg 0, reload 99, spread 0 as the fire
   ship's; gold 8, engage 34, crew 6, grit 0.7, `summoner`). Capture gold 145 / 125 / 185 (gold × 20 + 25), sunk 60 /
   50 / 80. `FEAT_PRIZE_TYPES` gains the three (cosmetics.test:271 holds). ships.js `BUILDERS`: `stinger: buildCutter,
   netsloop: buildPrivateer, witch: buildBombKetch` (they spawn and fight with `G.spawn`).
7. **Every Appendix A id**, hidden: in `#hud` `#meet-card` (`#meet-icon`, `#meet-name`, `#meet-line`, aria-hidden) and
   `#fog-chip` after `#edge-arrow`; `#shellback-retry-btn` first in the shipwreck panel (before `#kraken-retry-btn`); in
   `#town-screen` `#talk-bubble` (`#talk-name`, `#talk-text`, `#talk-next-btn`), `#lookout-down-btn`, `#town-toast`
   (aria-hidden); `#harbour-map-btn` "Island map" (with a hidden "New!" badge); `#tavern-guide` after `#tavern-log`;
   `#build-scene` (`#scene-stage`, `#scene-pips`, `#scene-skip-btn`) as the first child of `#build-screen`; the four
   district tabs and their `ul` panels after today's two; and the overlay `#island-map` (class `overlay town
   island-map`) with `#map-svg`, `#map-list`, `#map-walk-btn`, `#map-hop-btn`, `#map-close-btn`, `#map-live`, placed
   just before `#recover-screen`. Every test that counts buttons filters hidden ones (checked by grep), and the
   `?v4=1` probe found no page scroll.
8. **`__game` placeholders** (§11.3): `voyage.WITH_V4`; `v4 { WITH_V4, seed(s) (stored for Stage 2), waves (a copy of
   `levelWaves()`), plays [0, 0, 0], met 0, meet() false, spawn() null, foes null, warnSlots { count, max, boss }, net()
   false, cut() false, cutHold(), fog(x, z) (the composed `fogAt`: false), tide() false, mechanics4 (state.m4: null),
   shellback { wake() false, setHp() null, phase() null, state null, targets [], checkpoint } }`; `island4 { config null,
   set() null, build() { ok: false, reason: 'closed' } }`; `island.scene { running false, stage null, t 0, kind null,
   skip() false, advance() false }`; `town.islanders [], critters [], talk() false, pet() false, hop() false, map { open()
   false, close() false, active false }, districtAt() null, lookout() false`.
9. **sparrow.js's seam**: the build ctx gains `v4: WITH_V4` (`openDock`), `const V4 = KRAKEN && ctx.v4 === true`, the
   frozen `kit` (`THREE, add, rbox, cyl, sphere, rope, rod, beam, ink, thin, flat, COL, WALLS, ROOFS, lantern, shack,
   sagCurve, bake, inTheWay, stream(seed) → mulberry32(seed)`), built after `inTheWay`; with `V4` it is handed to
   `buildDistricts(kit, islandPlan)`, `createFolk4(kit, { people: [], walk })` and `createCritters(root, {
   reducedMotion })` (each call guarded), and their `dispose()` runs in the town's `dispose()`. The stubs draw nothing
   and draw no `rand()`; with `?v4=1` the town is today's (the walk data and the people count are identical).

**New stubs with their final §11.1 API** (each says "STAGE 0 SCAFFOLD" in its header and what its Stage 1 owner does):
`src/act4.js` (three placeholder defs, below; `ACT4_TEASER`), `src/env/mangroves.js`, `spires.js`, `shoals.js` (the §2
palettes and world radii 145 / 150 / 150, start at the origin facing +z, 6 enemy spawns and 4 crate spots on a ring of
radius 75, empty `fogLoops` / `currents` / `tideBars` / `fortSpots`, shoals' `shellbackLair { 0, 40, r 12 }` and
`shellbackArena { 0, 40, r 70 }`, no-op `setAwake` / `setCalm`, `warmables() → []`), `src/pools.js` (the §3.5 tables
`KIND_COST`, `INTRO`, `POOL_RULES`, `PACKS`, `MEET`; `V4_KINDS`; `poolSeed` exact; `drawWaves → [['cutter']]`;
`waveProblems → []`; `slotsOf`, `isPseudo`; the record functions keep the default record), `src/mechanics4.js`
(`MECHANIC4_IDS`, `WARN { max: 6, boss: 2 }`, empty `STINGER NET WITCH FOG CURRENT TIDE WORDS4`, a null
`createMechanics4` that keeps its own ids), `src/foes4.js` (`FOE_NAMES`, empty tables, a null `createFoes4`),
`src/shellback.js` (`SHELLBACK { hp 3000, notches, conch 1200 }`, a Shellback that never wakes), `src/foesView.js`,
`src/shellbackView.js`, `src/buildScene.js` (`STAGES`, `SCENE` with `reduced` derived = 5.0, `sceneLength` exact,
`stageAt` the first stage, `cueAt → []`), `src/islanders.js` (`PEOPLE_DRAWN = 41`, `TALK`, `CULL4 34`, nobody),
`src/guide.js`, `src/islandPlan.js` (below), `src/env/districts.js`, `buildings4.js`, `construction.js`, `folk4.js`,
`src/critters.js`, `src/islandMap.js`. The pure ones import nothing (each loads as a `data:` URL in Node). The six
stub suites print "0 checks (stub)" and exit 0, and sit in `npm test` in §13.4's places with their `test:<name>`
scripts (27 suites in `"test"` now).

`ACT4_LEVELS`: env, difficulty Heroic / Epic / Ultimate, act 4, stars 10 / 11 / 12, scene mangroves / spires / shoals,
`waves = drawWaves(level, null, poolSeed(level, 0))` = `[['cutter']]`, `pool: null`, `nextWaveAt 0, maxAttackers 2,
lead 0.6, spreadMul 1, grace 3, enemyRake 1, mechanics []`, bonus 1800 / 2100 / 3000, `lockText 'Drive off the
Kraken'` on level 10 only (so 11 and 12 read "Locked", §2.2), and on level 12 `finale: true`, §2.5's `finaleText` and
`victoryLine: 'The Twelve Seas are yours'`.

`src/islandPlan.js` holds what Stage 0 measured and derived: `PADS` (21 entries: the ten measured pads, the seven new
shack plots' pad limits, the four islet pads of §4.1), `LINKS` (32: today's four, the seven scenery bridges with their
spans and `long` on the five long ones, the five new rope bridges, the sixteen boardwalks and steps, each with its
`kind`), `DISTRICTS` (six, with their plots), `WALKWAY` (§11.1), `ISLANDER_PATHS` (33 ids `isl:<islander>` in §7.1's
order, no points). The other lists are empty, `walkData4(base)` returns base's keys (copies) plus empty `bridges`,
`hops`, `districts`, and `districtAt` returns null.

### The measurements (item 10)

All draw calls are `__game.renderInfo.calls` (both outline passes), `?quality=low`, 1280 × 720, headless Chromium
with SwiftShader, read two frames after the scene settles. Each draw was also attributed to the object drawn: the
probe wraps `renderer.renderBufferDirect` (taken from `scene.onBeforeRender`) and records the change in
`info.render.calls` per object, so a view's total splits by category and the people drawn can be counted; the
attributed total equals `renderInfo.calls` in every one of the 240 town views. Probes (scratchpad `v4/build/0/m/`):
`m10.cjs` (a, b, d, f), `levelseed.cjs` (a, seeded), `pads.cjs` + `padcalc.cjs` (c), `walktime.mjs` (g). Data:
`base1.json`, `base2.json` (two runs on the untouched copy), `dev1.json` + `dev2pano.json` (the published tree).

#### (a) Draw-call baselines at eedb108

**Level starts 1–9.** `newGame(n)`, intro 0, 1 s stepped (120 × `step(1/120)`), paused, a resize, two frames.
Spawn points are jittered with `Math.random`, so a start's count moves a little from run to run; the seeded probe
(`Math.random` replaced by mulberry32(12345) in an init script, then the same steps, and "settled" = 2 s more stepped by
hand) gives exact numbers.

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| base run 1 | 290 | 211 | 169 | 235 | 189 | 202 | 99 | 116 | 143 |
| base run 2 | 290 | 211 | 167 | 235 | 190 | 202 | 99 | 116 | 140 |
| seeded, start (base) | 290 | 211 | 164 | 238 | 186 | 204 | 108 | 121 | 140 |
| seeded, settled 2 s later (base) | 292 | 213 | 170 | 238 | 191 | 213 | 110 | 121 | 156 |

(Levels 7–9 start low because the camera looks at open sea at the start; their battle peaks, L7 219, L8 236, L9 210,
are stage4-review's.)

**The shipyard view** (ashore.cjs's draws records: unlocked 7, every SPEC3 plot at tier 3, 8 villagers, two prizes;
opened from the title, 20 frames, then 12 samples six frames apart over the sway): **308–315** (both base runs).
Busiest sample, by category: docked ship 58, its crew 35, townsfolk 150 (30 people), Bess and Barnacle 10, statics 9,
the development layer 13, animated parts 34, the visiting cutter 2, sea and sky 4.

**The town walk view, 30 spots × 8 headings** (ashore.cjs's spots and records; `town.enter({x, z, h})`, `simulate(0.6)`,
two frames; at 1280 × 720 for all 240 views, then the 8 busiest three more times): base run 1 max **401**, min 40, sum
45,694 (mean 190.4); run 2 max 401, min 40, sum 45,725. The 8 busiest, re-measured three times: 401, 399, 393, 385,
380, 384, 379, 379 / 401, 394, 393, 385, 380, 384, 374, 374 / 401, 394, 393, 385, 375, 377, 374, 374 (the same in every
run). Single views move by up to 5 calls between two runs of the same tree (15 of 240 views by more than 2) because the
townsfolk walk in real time.

**The panorama / hill baseline** (8 headings each, the camera forced in `scene.onBeforeRender` after the town's own
update, the townsfolk culled round the lens as the walk view culls them (40 u, 1 u)). Measured twice: right after
going ashore (the captain at the spawn, in view from the nest; `SECTIONS=pano`), and after the 30 × 8 sweep (the
captain left at the last spot):

| Pose | How | Calls by heading (0, 45, … 315°), just ashore | Max just ashore | Max after the sweep |
|---|---|---|---|---|
| nest | in today's crow's nest: the tower raft's centre (−18.2, −25.4), its floor (deck 1.3 + 5.8 + 0.3) + 1.6, looking 0.3 rad down | 223, 410, 272, 38, 29, 31, 31, 46 | **410** | 395 / 398 |
| nestHigh | the lookout's panorama pulled out: 8 u over the nest's floor (above its roof and vane), 0.45 rad down | 238, 400, 292, 30, 28, 29, 29, 55 | 400 | 398 |
| hill | over s12 at the hilltop walk camera's height (4.4 + 3.73 = 8.13), at s12's front edge (2, −36) so the lens is not inside its shack, 0.4 rad down | 355, 224, 78, 28, 28, 28, 55, 250 | 355 | 353 |
| hilltop | the walk camera of a captain standing on the planned hilltop (2, 4.4, −54): 5.99 u behind him, 3.73 u over his feet, 0.4 rad down | 227, 193, 33, 27, 27, 27, 32, 146 | 227 | 224 |

(A first "hill" pose exactly over s12's centre put the lens inside s12's two-storey shack; it is dropped.) The nest's
410 (heading 45°, over the plaza and the harbour) is the walk view's 401 plus the captain (5) and more sea and sky (12
vs 2). So **B = max(401, 410) = 410**, and §14.2's worst planned B + 36 = **446** (448 if a bake group splits) ≤ 450:
inside the budget, with 4 calls to spare. The hill and hilltop views draw far less than the walk view today (the
townsfolk cull of 40 u leaves the town's people out from up there).

#### (b) The walk view's breakdown at the worst view, P₀ and PEOPLE_DRAWN

The worst view is (−13.6, −23.4) heading π/4 (on the tavern raft by the tower bridge, looking north-east over the
plaza and the harbour), 401 calls, the same in all three runs:

| Category | Calls | |
|---|---|---|
| townsfolk | 150 | 30 people (5 calls each) |
| villagers | 35 | 7 |
| NPCs (Bess, Barnacle) | 10 | 2 |
| the docked ship | 58 | |
| its cleaning crew | 35 | 7 sailors aboard |
| the prize ships | 38 | 2 |
| the visiting cutter | 18 | |
| animated parts (boats, gulls, smoke, flags, crane, vane) | 34 | |
| statics (the baked town) | 9 | |
| the development layer | 7 | its baked meshes and the windmill's sails |
| the captain | 5 | |
| sea, sky, clouds | 2 | |
| **total** | **401** | |

**P₀ = 39**: the people drawn there (30 townsfolk, 7 villagers, Bess and Barnacle; the captain and the crew aboard are
not counted). 39 is also the most people drawn in any of the 264 views (also at (−14.4, −7.6) heading 3π/4: 29 + 8 +
2). So **`PEOPLE_DRAWN = P₀ + 2 = 41`** (written into islanders.js), not the spec's starting value 20: today's walk view
already draws 30 of the 36 townsfolk at its worst. Under one cap of 41, islanders get at most two people more than
today in the busiest views unless the director's 34 u cull (§7.2) drops townsfolk there; §14.2's "+10" holds either way.

#### (c) The ten pads, their strips and the scenery bridges' mouths; the seven new pad limits

Measured on a harness mirror of the untouched tree whose sparrow.js also returns its internals (`plotList`,
`plotChunk`, `plats`, `dev`, `bridges`): every plot's chunk at tiers 0–3 (homes lit and dark), every vertex
transformed into the plot's frame (its platform's group: +z its front, x across), the footprint = the bounds of the
vertices above deck + 0.3; the pad = the union of tiers 1–3 (= tier 3 for all ten) + 0.2. Free strips = from the pad to
the platform's edge (negative: the pad hangs over the edge). A scenery bridge's mouth = its walk curve's end moved 0.9
u past the end post along the chord (as `bridge({ walk })` would; for s13S14 that points out of s13, along its left
edge, not into the deck: see open issue 3). All in u, plot frame.

| Plot | Platform (deck w × d) | Tier-3 footprint x0..x1, z0..z1 (height) | Pad (+0.2): x0..x1, z0..z1 (w × d) | Free strips left / right / back / front | Tier 0 fits the pad | Scenery bridge mouths (plot frame) |
|---|---|---|---|---|---|---|
| homeA | s16 (5.4 × 5) | −2.17..2.39, −2.42..1.62 (7.32) | −2.37..2.59, −2.62..1.82 (4.96 × 4.44) | 0.33 / 0.11 / −0.12 / 0.68 | no | tavernS16 (1.97, 0.92) **inside the pad** |
| homeB | s3 (6 × 5.4) | −2.08..2.49, −2.47..1.57 (7.32) | −2.28..2.69, −2.67..1.77 (4.97 × 4.44) | 0.72 / 0.31 / 0.03 / 0.93 | no | tavernS3 (−0.27, 2.18) free deck |
| homeC | s2 (5.4 × 5) | −2.33..2.24, −2.42..1.62 (7.32) | −2.53..2.44, −2.62..1.82 (4.97 × 4.44) | 0.17 / 0.26 / −0.12 / 0.68 | no | s1S2 (−1.94, 0.52) **inside the pad** |
| homeD | s7 (5.4 × 5) | −2.08..2.49, −2.42..1.62 (7.32) | −2.28..2.69, −2.62..1.82 (4.97 × 4.44) | 0.42 / 0.01 / −0.12 / 0.68 | no | yardS7 (−1.22, 1.60) **inside**; s7S17 (2.42, 1.26) **inside** |
| bakery | s8 (5.4 × 5) | −3.13..2.33, −2.49..2.55 (5.52) | −3.33..2.53, −2.69..2.75 (5.86 × 5.44) | −0.63 / 0.17 / −0.19 / −0.25 | yes | — |
| windmill | s6 (5.6 × 5.2) | −2.63..1.38, −2.39..1.01 (5.9) | −2.83..1.58, −2.59..1.21 (4.41 × 3.8) | −0.03 / 1.22 / 0.01 / 1.39 | no | — |
| lighthouse | s18 (5.2 × 5) | −1.32..1.32, −1.72..1.08 (10.33) | −1.52..1.52, −1.92..1.28 (3.04 × 3.2) | 1.08 / 1.08 / 0.58 / 1.22 | no | — |
| market | s15 (5.6 × 5.2) | −2.80..2.80, −2.79..1.67 (7.59) | −3.00..3.00, −2.99..1.87 (6 × 4.86) | −0.20 / −0.20 / −0.39 / 0.73 | no | — |
| school | s13 (5.4 × 5) | −2.45..2.24, −2.39..1.19 (6.77) | −2.65..2.44, −2.59..1.39 (5.09 × 3.98) | 0.05 / 0.26 / −0.09 / 1.11 | no | gardenS13 (1.87, −0.76) **inside**; s13S14 (−2.94, 0.07) **off the deck** (0.24 u past the left edge; review S0-STUB-1) |
| park | s14 (5.2 × 5) | −2.33..2.55, −2.55..1.50 (4.13) | −2.53..2.75, −2.75..1.70 (5.28 × 4.45) | 0.07 / −0.15 / −0.25 / 0.80 | no | s13S14 (2.57, 0.30) **inside the pad** (and on the deck's rim, 0.03 u in) |

Tier 0 (today's shack, its porch clutter and the "Build me!" board) covers nearly the whole platform on every plot
(e.g. homeA −2.64..2.36 × −2.60..2.26), so only the bakery's tier 0 fits its pad. The animated parts are drawn apart:
the windmill's sails (hub (0, 5.85, 0.69), swept radius 3.66 u: they reach x ±2.92 at z 0.58..1.08, outside the pad's
x range), the lighthouse's beam (a light, swept 14.3 u, not a solid), the park's jet (inside its pad).

What this means for §6.3 (for 1N, 1O and 1P): **no SPEC3 platform keeps a 1.6 u porch beside its pad.** The widest
strip on any linked side is 0.72 u (homeB's left) and the fronts have 0.68–1.39 u; four pads hang over their platform's
edge (bakery, market and park on three sides, windmill on one). So the "porch extension" of §6.3 is needed on all ten
SPEC3 plots, not as an exception. And **six scenery-bridge mouths land inside a pad** (homeA, homeC, homeD twice, the
school, the park); the kit offset that would leave each mouth 0.3 u outside its pad is −0.92 u (homeA, along x), +0.89
(homeC), −0.52 along z (homeD's yardS7) and −0.57 along x (homeD's s7S17, the opposite way to yardS7's), −0.87 (school),
−0.48 (park): three of them exceed §6.3's 0.6 u limit, and homeD needs two directions. 1N will have to move those
bridges' walk mouths along the deck edge or extend the porch round them (the bridge art and its `rand()` draws stay).

**The seven new shack plots' pad limits** (§4.1's rule: the deck less a 1.6 u porch on the front, the board's side,
and on every side a §6.2 link reaches, 0.4 u on the other sides; a link reaches the side through which the line from
this deck's centre to the other deck's centre leaves the rect; s7S17 lands where its scenery bridge ends, local (−3.0,
0.9) on s17; the hill counted at (2, −54)):

| Plot | Platform (deck w × d, ry) | Porched sides (1.6 u) | Pad limit x0..x1, z0..z1 | w × d | Porch extension (under 3.0 × 3.0) |
|---|---|---|---|---|---|
| forge | s4 (5.6 × 5, −0.1) | front (board); right: s4S3; left: s10S4 | −1.20..1.20, −2.10..0.90 | 2.4 × 3.0 | **yes** |
| music | s5 (6.4 × 5.2, −0.05) | front: board, s5S2; back: s12S5; right: s5S11 | −2.80..1.60, −1.00..1.00 | 4.4 × 2.0 | **yes** |
| fishing | s9 (5 × 5, −0.5) | front (board); left: yardS9; back: s9S18 | −0.90..2.10, −0.90..0.90 | 3.0 × 1.8 | **yes** |
| farm | s10 (6 × 5.5, 0.1) | front: board, s10Tower; right: s10S4 | −2.60..1.40, −2.35..1.15 | 4.0 × 3.5 | no |
| museum | s11 (6 × 5.5, −0.2) | front: board, s7S11; left: s5S11 | −1.40..2.60, −2.35..1.15 | 4.0 × 3.5 | no |
| aquarium | s12 (7 × 5.5, 0) | front: board, s3S12, s12S5; back: s12Hill | −3.10..3.10, −1.15..1.15 | 6.2 × 2.3 | **yes** |
| homeF | s17 (6 × 5.4, −0.35) | front: board, s17S18; left: s7S17 | −1.40..2.60, −2.30..1.10 | 4.0 × 3.4 | no |

Four of the seven limits fall under 3.0 × 3.0 u (porch extensions again the rule rather than the exception, §4.1).
The islet pads stay §4.1's: Treehouse 4.6 × 4.6, Hilltop Villa 4.6 × 4.2, Observatory 4.6 × 4.6, Mermaid Grotto 4.0 ×
3.6. All 21 are in islandPlan's `PADS` (with each measured pad's strips and mouths, each limit's porched sides).

The scenery bridges' chord lengths from their end points (§19 B1's deck gaps): s1S2 2.83, tavernS16 2.55, yardS7 4.49,
tavernS3 4.26, gardenS13 5.59, s13S14 6.99, s7S17 4.42 (all as B1 says).

#### (d) A Man-o'-War's draw calls

**26 calls** (12 meshes, both passes), attributed to her ship group: spawned on level 1 26 u ahead of you, broadside on,
0.5 s stepped, paused, three frames; the other ships moved 4000 u away. **1.3 × 26 = 33.8**, so the Shellback's cap is
**33 calls** (§11.1: ≤ 40 and ≤ 1.3 × a Man-o'-War's, whichever is lower), and every new ship model ≤ 26. For
comparison: Corsair Cutter 18, Privateer Brig 24, Bomb Ketch 25, Treasure Galleon 24 (the three stand-ins: Sting Sloop
18, Net Sloop 24, Coral Witch 25).

#### (e) `#6b2a55` on the parchment

**9.18 : 1** on `--paper` (#fff4d6), **8.29 : 1** on `--paper-2` (#ffe7b0) (WCAG relative luminance), ≥ 7 : 1: not
darkened. In the browser with `?v4=1` the heading's computed colour is rgb(107, 42, 85) on the title panel's rgb(255,
244, 214).

#### (f) The dock frame's triangles (as smoke.cjs:511 counts them)

The shipyard view 1.5 s after it opens, two frames, `renderInfo.triangles` (both passes), max of 6 samples:
**1,479,588** with smoke's records (a fresh save: no plot built, 36 townsfolk at 3,291 triangles each) and
**1,586,020** with every SPEC3 plot at tier 3 and 8 villagers (44 people). The second is already over §14.2's 1.5 M
cap, and the first leaves 20k of headroom; so §14.2's summed plan (today + districts ≤ 150k + 11 × 25k + islanders ≤
144k + animals) cannot fit 1.5 M as written, even with the 20k-a-building fallback. See open issues.

#### (g) The walk graph with today's walk.js

Node 22, this machine (4 CPUs shared with another agent). Cold = the first `graph` of a fresh process (5 processes);
warm = repeats in one process. `clear()`'s share from an instrumented copy (calls timed while `graph()` builds).

| | Nodes | Edges | graph(), cold | graph(), warm (median) | clear() in graph() | Worst path() between places |
|---|---|---|---|---|---|---|
| today's fixture | 475 | 2,513 | 55.7–62.8 ms (median 60.5) | 28.3 ms | 18.8 of 30.2 ms, 2,729 calls | shipyard → quiz: 2.70 ms (best of 3), 5.09 ms worst single run, 2.85 ms cold; mean 1.04 ms over 30 pairs |
| v4-sized synthetic | 1,179 (2.48×) | 6,156 | 108.7–137.0 ms (median 116.4) | 61.1 ms | 35.9 of 65.4 ms, 6,684 calls | 2.60 ms (best of 3), 3.65 ms worst single run, 3.38 ms cold; 132 pairs |

The synthetic island is today's walk data twice and 20 % of it a third time (areas, links and places; every blocker),
300 u apart, so no edge joins two copies and a path stays within one copy (A* never crosses; `near()` and the
n-sized arrays still scale with all nodes). Both budgets of §6.6 (graph ≤ 300 ms, path ≤ 20 ms) already hold for
today's walk.js on this island; a connected v4 island will have longer paths than these.

### Before and after (the same probes on the published tree)

- **Level starts** (unseeded, run 3 on the new tree): 290, 209, 167, 235, 190, 202, 99, 116, 140: each within the two
  base runs' range ±2. **Seeded**: start 290, 211, 164, 238, 186, 204, 108, 121, 140 and settled 292, 213, 170, 238,
  191, 213, 110, 123, 156: every start identical to the base; settled identical but level 8 (+2).
- **The shipyard view**: 308–315 (the same range; samples identical to the base runs' but one sway sample, 312 vs 314).
- **The town walk view**: max 401, min 35, sum 45,710 (base 45,694 and 45,725); the 8 busiest re-measured: the same 24
  numbers as both base runs; single views differ from a base run by at most 5 (13–18 of 240 by more than 2), exactly as
  much as the two base runs differ from each other (max 5, 15 views). The worst view's breakdown and P₀ are the same.
- **Panorama / hill**: just ashore, all 32 views identical to the base (nest 410, nestHigh 400, hill 355, hilltop
  227 at their worst); after the sweep (run 3) nest 395, hill 352 (the old over-s12 pose), within the base runs' 395–398
  and 350–353.
- **A Man-o'-War** 26, the stand-ins 18 / 24 / 25, the dock triangles 1,479,588 / 1,586,020: identical.
- **A seeded replay** (`sameprobe4.cjs`: `Math.random` seeded, every level 1–9 played 45 s frozen and stepped with
  weaving, sail changes, broadsides and boarding presses, then a 60 s Kraken fight on level 9 with `G.kraken.rise()`,
  broadsides, cuts and `canGrapple` on every wrapper, snapshots every 5 s / 2.5 s incl. `mechanics.state`, the Kraken's
  state and wrappers): base vs the dev mirror and base vs the published tree: **IDENTICAL, 111 of 111 snapshots, 0
  page errors** both times. In the Kraken segment the Kraken is in its fight (its bar 2,850 → 2,707 from your
  broadsides through the registry), two wrappers are up and `canGrapple` on each says "monster".

### `?v4=1` and the flag off (`m/v4check.cjs`; screenshots looked at)

Flag off: 9 cards in 3 groups, `WITH_V4` false, level 9 without teaser or sailOn, every v4 placeholder answers safely,
the three new types spawn with stand-in models, no console errors or warnings, ashore's walk data = the fixture.
`?v4=1` at 1280 × 720 and 390 × 844: 12 cards in four groups ("Voyage IV · The Sunset Isles" in #6b2a55), names and
difficulty words right, no page scroll; levels 10, 11, 12 each start in their palette's stub sea with one Corsair
Cutter (94–97 calls), and level 10 clears when its cutter sinks; ashore is today's town; no errors. Screenshots (in the
scratchpad `v4/build/0/shots-repo/`, taken before the card-colour fix below; `m/cards-r1..r3-*.png` show the cards
before and after): `v4-title-1280x720.png`, `v4-title-390x844(-voyage4).png`,
`v4-level10/11/12-*.png`, `v4-ashore-*.png`, `off-title.png`. Looked at: the fourth heading reads clearly in plum; the
12-skull pills fit (they wrap under the word at 1280 × 720 as the 9-skull ones do; one line at 390 × 844); each stub
sea shows its palette (green-gold dusk, turquoise noon, coral sunset) with the cutter ahead and the banner naming the
level; the town ashore is today's. Three critique rounds of the act-4 cards (a CSS-only harness page with the
game's style.css, `.dock-harness/v4/0/cards.html`, at 1280 × 720 and 390 × 844): round 1 found "The Sunken Spires" in
white on a near-white cyan horizon (#c8f4ff) and "Misty Mangroves" weak on bright gold; round 2 deepened the two
horizon stops (#7ccdf0, #d9a95a, like level 7's); round 3 checked the published colours at both sizes (every name and
pill reads; the one-column phone cards keep their 12-skull pill on one line).

### `warmDraw` (checked on a harness mirror that exposes it, `m/warmtest.cjs`)

A hidden mesh (in a hidden group) with a material whose program no other mesh uses: shown without a warm draw, its
first real frame builds a program (22 → 23); warm-drawn first, `warmDraw` builds it (23 → 24) and the first real frame
then builds none (24 → 24); visibility, layers and frustum culling are put back. The same probe on a variant that
draws into a 1 × 1 render target, as §11.2 words it, builds two programs (25) and the first real frame still builds a
third (26): a render target compiles the linear-output variant, not the canvas's sRGB one. Hence the deviation below.

### Deviations from SPEC4 (and why)

1. **`warmDraw` draws to the canvas through a 1 × 1 scissor, not into a 1 × 1 render target** (§11.2, §14.1): three.js
   r170 builds a different program for a render target (linear output) than for the canvas (sRGB), so a render-target
   warm draw does not warm the program the frame uses (measured above). Only the given objects and the scene's lights
   are drawn (a camera layer of their own), both passes go through `view.render`, and the next frame paints over the
   pixel.
2. **The voyage4 and island4 records are not loaded in Stage 0** (§11.2 lists `-island4`, `-voyage4` via `loadRecord`
   with `WITH_V4` at stage "0 (stubs) / 2"): the stub parsers would rewrite a stored record with their default. They are
   in-memory defaults (`voyage4Rec = defaultVoyage4()`, `island4Cfg` from `islandRules.defaultIsland4` when 1D adds it,
   else null) until Stage 2 loads them. (SPEC3's Stage 0 made the same call.)
3. **`ACT_NAMES[4] = 'Voyage IV · The Sunset Isles'`, the `.act-head.act-4` colour and the `.lvl-10..12` card colours
   are added now** (§11.2 puts "acts" in Stage 3) so the `?v4=1` preview is legible; with the flag off no act-4 card
   exists, so nothing changes. The compact "☠ ×10" pill, "Difficulty N of 12" and the migration stay Stage 3's.
4. **`#build-scene` sits inside `#build-screen`** (Appendix A names the ids, not the parent), `#fog-chip` and
   `#meet-card` are direct children of `#hud` after `#edge-arrow` (not inside the hull card or `.hud-top`, so no HUD
   layout test meets them), and the map is a `section` with class `overlay town island-map` (`town` so it lets
   pointer events through like the tavern, non-modal per §8.5).
5. **`GRAPPLE_WHY.small` and `.fort` are literal words in main.js** for now (WORDS4 is empty until 1B); 2A can point
   them at `WORDS4` in Stage 2.
6. **The level-start, panorama and hill probes are my own definitions** (§12 item 10(a) names them, not their exact
   poses): see the tables for each pose. The first "hill" pose (exactly over s12's centre) was inside s12's shack and
   is replaced by s12's front edge; the "hilltop" pose is added because it is the view the hill will actually give.
7. `pools.js`'s `poolSeed`, `slotsOf`, `isPseudo` and buildScene.js's `sceneLength` are already exact (they are one line
   each); `drawWaves` returns `[['cutter']]` as §12's note says. The stubs' tables hold the numbers the spec states
   outright (`KIND_COST`, `INTRO`, `POOL_RULES`, `PACKS`, `MEET`, `WARN`, `SCENE`, `TALK`, `CULL4`, `WALKWAY`, the
   Shellback's hp, notches and conch); the other tables are empty frozen objects for their Stage 1 owners.

### Hook requests

None for Stage 0's own work (every file it needed is owned). Notes for later owners are under open issues.

### Open issues (for the coordinator and the Stage 1 owners)

1. **PEOPLE_DRAWN is 41, not 20** (P₀ = 39, measured). §7.2 and §14.2 (the +10) stay consistent with it, but 1D's
   crowd tests and 1Q's crowd should plan for a cap of 41 that today's townsfolk already nearly fill in the busiest
   views (30 townsfolk + 7 villagers + 2 NPCs there).
2. **The dock frame is already over 1.5 M triangles** with every SPEC3 plot at tier 3 (1,586,020), and at 1,479,588 with
   a fresh save; §14.2's triangle plan cannot reach ≤ 1.5 M by trimming new buildings alone. A decision is needed
   (raise the cap with a measured reason, light builds for the crew, lower-poly tier-3 chunks, or count only the colour
   pass); smoke.cjs:511 checks the fresh save only, so it still passes today.
3. **Pads vs porches** (§6.3, §4.1): none of the ten SPEC3 platforms has a 1.6 u strip beside its pad, four pads hang
   over their platform's edge, six scenery mouths land inside pads and three of them need more than the 0.6 u kit
   offset; four of the seven new pad limits are under 3.0 × 3.0. Porch extensions are the rule for 1N, not the
   exception.
   Found in the coordinator's review (S0-STUB-1): s13S14's plain run-in on s13 points out of the deck along its left
   edge (0.24 u over the water), and its curve's first 1.77 u cross the school pad's back-left corner, so its s13 end
   meets no walk area; the school, like homeD, has two scenery mouths pulling opposite ways (gardenS13's offset
   would push the pad over s13S14's end). Ruled in SPEC4 §19 S0-D3.
4. **The Shellback's cap is 33 calls** (1.3 × 26), lower than the 40 its own line names (§11.1, §14.1): for 1I.
5. **The development layer draws 7 calls in the walk view** (6 for the baked meshes + the windmill's sails), the
   number to use for §14.2's "second half" estimate.
6. The published build could not be checked from this container (github.io is blocked by the proxy), as the
   coordinator noted.

### For SPEC4 §19 "Stage 0 (measurements)" (the coordinator writes it)

- Draw calls at eedb108 (`?quality=low`, 1280 × 720, SwiftShader, both passes): level starts L1–L9 290, 211, 167–169,
  235, 189–190, 202, 99, 116, 140–143 (seeded: 290, 211, 164, 238, 186, 204, 108, 121, 140); the shipyard view
  308–315; the town walk view at 30 spots × 8 headings max **401**, min 40, mean 190; the panorama from today's crow's
  nest **410**, pulled out 400, over s12 at the hilltop's height 355, the hilltop walk view 224–227; so **B = 410**,
  B + 36 = 446 ≤ 450. All the same within ±2 after Stage 0.
- The worst walk view (−13.6, −23.4, π/4) = townsfolk 150, villagers 35, NPCs 10, docked ship 58, its crew 35, prize
  ships 38, visiting cutter 18, animated parts 34, statics 9, development layer 7, captain 5, sea and sky 2. **P₀ = 39,
  `PEOPLE_DRAWN` = 41** (spec's starting value was 20).
- The ten pads, their strips and the mouths: the table under (c); the seven new pad limits: forge 2.4 × 3.0, music 4.4 ×
  2.0, fishing 3.0 × 1.8, farm 4.0 × 3.5, museum 4.0 × 3.5, aquarium 6.2 × 2.3, homeF 4.0 × 3.4 (forge, music, fishing and
  aquarium under 3.0 × 3.0); islandPlan `PADS` holds them all.
- A Man-o'-War: **26 calls**; 1.3 × = 33.8, so the Shellback ≤ 33.
- `#6b2a55` on the parchment: 9.18 : 1 (8.29 : 1 on `--paper-2`), kept.
- The dock frame: 1,479,588 triangles (fresh save, smoke's) and 1,586,020 (every SPEC3 plot at tier 3).
- The walk graph with today's walk.js: today's fixture 475 nodes, 2,513 edges, cold 55.7–62.8 ms, worst place-to-place
  path 2.7 ms (5.1 ms worst single run); a 2.48× synthetic island 1,179 nodes, 6,156 edges, cold 108.7–137.0 ms, worst
  path 2.6 ms (3.7 ms).

### Verification

The coordinator ran every suite on frozen copies of the tree (`git ls-files -co --exclude-standard`, `.dock-harness/` left out), one suite at a time, in `package.json` order, with `NODE_PATH=/opt/node22/lib/node_modules`. The build agent's own end-of-row `npm test` was cut off by a container restart, so these runs are the exit check.

1. **First copy (the tree as the agent published it), 2026-11-04 23:31 to 2026-11-05 01:07 UTC.** 26 of 27 suites passed:
   - combat 107, specials 110, armory 35, cosmetics 83, walk 107, mechanics 121, mechanics3 185, kraken 161, island 52, quiz 85, settings 16, upgrades 53, server, smoke, controls and audio passed.
   - battle passed 281, levels 75, town 137 and ashore 145, with 0 failures in each.
   - The six stubs (walkgraph, mechanics4, foes4, shellback, pools, islanders) each printed "0 checks (stub)" and exited 0.
   - voyage3 had 126 passed and 6 failed: kraken fight phases 2 and 3, ink, the phase banners, and kraken grab "a hit on the tentacle holding you" and "a stink hit".
2. **Cause of the six failures (review finding MAIN-1).** `partSrc` returned null for a hand-made `{ pseudo, part }` target with no `src`, which is what `tests/voyage3.cjs` passes to `G.damage`. Fixed in `src/main.js`: such a target is the Kraken's, as before SPEC4 (`w.src ?? (w.pseudo ? kraken : null)`).
   - The same review corrected the s13S14 mouth data (S0-STUB-1) in `src/islandPlan.js`.
   - The review refuted S0-STUB-2 and S0-STUB-3.
3. **Second copy (with both fixes), 2026-11-05 01:07 to 01:22 UTC.** All 19 Node suites passed again, and voyage3 passed 132 with 0 failures. It was re-run alone because it is the only suite that builds pseudo targets by hand, and `islandPlan.js` is read only by the v4 stubs. The browser suites that passed on the first copy do not touch either change.
4. **The published site.** It cannot be fetched from the build container (the proxy answers 403), so it was not checked live.
