# Pirates Ahoy! — "The Kraken Seas" update: FINAL build spec (SPEC3)

Repo `/home/user/First-project` (branch `claude/3d-website-game-9b0d9q`, HEAD `4465587`). Plain ES modules, no build step,
three.js r170 vendored (`import * as THREE from 'three'`). **Never edit `vendor/`, never add npm dependencies, never
fetch anything at runtime, never commit or push** (the coordinator does). Harness pages go in
`/home/user/First-project/.dock-harness/` (git-ignored); screenshots and scratch files go in the session scratchpad.
The previous contract, `docs/boarders-away/SPEC2.md` (as built, with its §17 build record), still holds unless this
file changes it. Section references like "SPEC2 §6.3" point there; bare "§6.3" points here.

Base design: **`design-arcade.md`**, with the grafts the three judges listed from `design-depth.md` and
`design-spectacle.md`, and every judge `must_fix` item fixed. Appendix B records how the designs were merged and maps
each must-fix to the section that answers it. **Where this file and a design disagree, this file wins.** Numbers are
starting values: each lives in exactly one table in one module (named in §11), so balance changes touch one place.
Stage 3 tunes them with the bots (§5.9) and records any change in §19.

---------------------------------------------------------------------------------------------------

## 0. Read this first

### 0.1 Conventions every agent must follow (SPEC2 §0.1, unchanged, plus the new rules marked ★)

- Ships: heading `h`, forward `(sin h, cos h)`, starboard `(−cos h, sin h)`; gameplay side **+1 = starboard, −1 =
  port**; ship-local +x is PORT (`localX = −side × halfWidth`).
- Simulation is deterministic and runs only in `step(dt)` (1/120 s substeps). Anything that changes gameplay (statuses,
  hazards, the Kraken, rams, mortars, fire ships, crates, the rise) advances in **simulated** time. Visual-only animation
  uses visual time `t`. ★ Every new hazard position (waterspouts, rogue waves) is a pure function of simulated time and
  seeded data; nothing gameplay-relevant may use `Math.random`.
- ★ **Gameplay rolls** in new code (mortar timing and aim scatter, spout forming spots, rogue-wave directions, crate
  picks, Kraken attack spots and timers, ink-pot scatter) come from `combatRng` (main) or `ctx.rng` (pure modules, fed
  from `combatRng`). Quiz shuffles use the quiz module's own seeded rng. Existing `Math.random` uses (aim spread,
  particles, today's lava/lightning scatter) stay.
- Cel-shaded look: `toon()` materials, ink outlines from the outline pass, `noOutline()` for flat, emissive and UI-ish
  meshes. **InstancedMesh is not outlined correctly**: instanced meshes use `noOutline()` (or the inverted-hull ink
  twin of `src/env/volcano.js`).
- People cost about **5 draw calls** each; ships roughly 2× their mesh count. Draw calls are measured as
  `__game.renderInfo.calls` two animation frames after the scene settles, `?quality=low`, 1280×720, SwiftShader.
- **people.js determinism rule:** every existing `buildPerson(opts)` call keeps exactly today's look; new options consume
  no `rng()` draws unless given; new picks go at the end of `resolveLook`.
- ★ **sparrow.js determinism rule:** the town's `rand()` draws are consumed in today's order. Shacks that become plots
  (§8.1) are still built with the same calls in the same order; only their target group changes.
- Pure modules (`combat.js`, `armory.js`, `cosmetics.js`, `walk.js`, `mechanics.js`, `shipTypes.js`, `upgrades.js`, and
  the new ★ `specials.js`, `mechanics3.js`, `kraken.js`, `island.js`, `quiz.js`, `quizBank.js`, `settings.js`) import
  **nothing**, so Node tests load them as `data:` URLs.
- Every saved record is validated like `parseShipConfig`: never throws, field by field, plain integers only, size cap,
  own properties only, `__proto__`-safe, and a record that needed fixing is rewritten.
- ★ **One storage rule for every new purchase or reward** (the tavern's): the record is written first; if the write
  fails (storage full or blocked) nothing is bought, no gold moves, and the panel says "Couldn't save: your browser's
  storage is full or switched off." With storage blocked the game still runs from the defaults for the visit. A
  **reward** (quiz gold) counts as paid only once the chest is saved too; until then it stays owed (§10.2). The
  **rudder** is the one exception: it is a row of the ship record and keeps the shipyard's own tested rule (§10.2).
- Accessibility floor: real `<button>`s, visible focus ring, ≥ 44×44 CSS px targets (quiz answers ≥ 56 px tall), small
  text ≥ 4.5:1 on paper (`--sea-text`, `--teal-text`, `--gold-text`, `--red-text`), state never shown by colour
  alone, `prefers-reduced-motion` respected, mashing never required.
- ★ **Kid rules** (every new feature is checked against them): one picture, one word and one sound per new thing; every
  threat telegraphed **≥ 1.5 s** by a ring or shape, a sound and a word; nothing permanent is ever lost; no hidden
  traps (any refusal or resistance is explained before or at the moment it happens); nobody dies on screen.
- ★ **The Kraken is not a ship.** It is never a `SHIP_TYPES` key (the tests use `prizes.kraken` as a garbage key that
  must be dropped).

### 0.2 What already exists and is relied on (verified at `4465587`)

main.js (6,077 lines): `steerToward` (2513), `speedCap` (2521), `updatePlayer` (2528; turn formula at 2534),
`launchBomb` (2404; it predicts the player's turn at 2413–2414), `animateHelm` (5455; reads the turn input at 5458),
`aimTarget` (1947), `playerFire` (1975), `rakeCue` (1982), `inArc` (1836), `hitsShip` (2813), `updateBalls` (2832),
`ballHit` (2148), `damage` (2299), `applyCritEffect` (2085), `applySlow` (2104), `updateEffects` (2113, the keg burn),
`speedMul`/`turnMul` (1819/1826, smallest multiplier wins), `mayFire` (1852), `fire` (1863; its ammo sound at 1936),
`canGrapple` +
`GRAPPLE_WHY` (1540/1532), `spawnWave` (1137, `WAVE_REPAIR = 0.35` at 81), `startLevel` (1189), `finishLevel` (1343),
`raiseProgress` (1410), `playerSunk` (1452), `fighting` (1485), `step` (3085; the clear check and the
`'The Old World is yours'` victory line near its end), `setAmmo`/`cycleAmmo` (3220/3241), `KEYMAP` (3555),
`TAP_ACTIONS` (3766), `ACT_NAMES` + `renderLevelCards` (3915/3919), `DOCK_EXITS`/`dockExits` (4048/4049), `openDock`
(4151), `buyUpgrade` (4336), `buyArmory` (4374, record first), `loadRecord`/`saveRecord` (356/367), `syncFeats` (388,
adds counter deltas), the tips record `loadInt(TIPS_KEY, 0, 255, 0)` (652), `drawMinimap` (5254), `frame` (5601).
`LEVELS` comes from `src/levels.js` (Act I + `ACT2_LEVELS`, `WITH_ACT2 = true`).

town.js: the captain **squeezes past** anyone he walks into for 0.25 s (`cap.stuck`, `cap.pass = 0.8`, commit
`4465587`), and town.js reports where he stands through `env.setCaptain`; sparrow.js's walkers on fixed paths **wait**
while he stands 0–1.0 u ahead of them (LOOK-2: sparrow.js `setCaptain`/`inTheWay`, 4162–4180). Walkers follow their
fixed paths and ignore blockers (`walker()`, 3235): only the captain waits for nobody and is waited for.
sparrow.js: `env.folk()` lists the walkers on walkable decks (`walker()`/`person()` builders); shack platforms
`s2`–`s18` are scenery (not walkable); walkable decks are pier, plaza, tavern raft, tower raft, yard, garden and `s1`
(Polly's), joined by the rope bridges `plazaS1`, `plazaYard`, `plazaGarden`, `tavernTower`.

Measured draw calls today (SPEC2 §12, Stage 4): level starts L1 299, L4 274, L5 271, L6 297; busiest Act II play 404
(L5); boardings peak 378; town walk view worst 371 (30 spots × 8 headings); shipyard view 297–341; Polly's 41–46;
tavern 54–66.

### 0.3 Item 0 — the walking bug comes first

The player's first request was "you can't walk when there is another person in the way". It is fixed on the work
branch (`4465587`: walking into someone squeezes past after 0.25 s; the regression check "W held along the porter's
round" passes 10 of 10).

1. **Before Stage 0**, the coordinator confirms the published game (mimonhj.github.io) serves a `src/town.js` that
   contains the squeeze-past (`cap.pass`). If it does not, publish `4465587` as a hotfix at once; it touches only
   `src/town.js` and `tests/town.cjs`. (The build container could not reach github.io to check: the proxy refuses it.)
2. The open phone-battle fixes (target off-screen in portrait, Fire taps lost while reloading, ammo effects invisible)
   touch `main.js` and `style.css`, and may touch `src/tags.js`, `src/pops.js` and `fx.css`; land them before Stage 0
   so Stage 0 starts from their tree. **Then the coordinator re-bases this file** before Stage 0 starts: re-measure the
   §0.2 draw-call baselines (Stage 0's "±2 of today" and §14's "Today" column use the new numbers); re-anchor the §0.2
   line numbers and every §13.4 `file:line` by content; add the fix's tag cues (chain / grape) to §6.4's icon-slot
   priority under the one-icon, one-badge rule; and move §6.5's new tips to the first bits the fix leaves free (with
   `TIPS_KEY`'s maximum raised to match). Two rules hold whatever the fix does: a **queued Fire tap** re-checks its
   target when the guns are ready, spends a special load only when it really fires, and is dropped by any ammo change
   (a key, R or a tray pick) instead of firing the new ammo; and the **portrait framing** of the broadside target reads
   `targetsFor(side)` (so it frames Kraken pseudo-targets too) and yields to `krakenView.riseCamera` during the rise.
3. This update keeps the fix for every new walker (§8.4): villagers are `env.folk()` walkers, so they inherit both the
   squeeze-past and LOOK-2's waiting; Builder Bess and Professor Barnacle stand clear of doors, bridge mouths, place
   circles and the gangplank; regression tests in §13.2 (`ashore.cjs`) prove it with the most villagers out.

---------------------------------------------------------------------------------------------------

## 1. Scope

| The player asked for | What ships |
|---|---|
| 0 · "fix this bug, where you can't walk when there is another person in the way" | §0.3: confirmed live (hotfix if not), kept for every new walker, regression-tested on every bridge with the most villagers out. |
| "more levels" | **Voyage III · The Kraken Seas**, three levels after the Maelstrom: **7 The Turtle Atolls** (Daring ★7), **8 The Cape of Storms** (Fearsome ★8), **9 The Kraken's Deep** (Mythic ★9, the new finale). The Maelstrom's Victory screen gains **Sail on to the Kraken Seas**. A save that already beat the Maelstrom opens level 7 at load (§10.3). |
| "better steering" | **Big rudder & wheel**, a 7th shipyard upgrade (3 tiers): a ship that turns far better when slow, a little better at speed. On phones: **slide your thumb** on the ◀ ▶ pad for gentle turns (the arrows work as today), and an **optional ship's wheel** (Pause ▸ Steering). |
| "different type of ammo … freezing … burning … stink" | **Fire shot** (burns for 6 s), **Frost shot** (slows her), **Stink shot** (she can't move or shoot for 4 s). Each is a recipe bought once at the tavern; its loads refill free at every level start. Bosses shake effects off twice as fast; stink is followed by an immunity window. Drawn on the ship as flames, ice and a green stink cloud. |
| "different types of enemy ships" | **Shark Raider** (rams), **Bomb Ketch** (mortar), **Iron Turtle** (iron sides), **Fire Ship** (explodes; freeze her and she gives up), **Squid Skiff** (boards you), and the Kraken Crew's flagship **The Inkheart** (boss; lobs ink pots). |
| "more natural disasters" | **Waterspouts** (L7), **Rogue waves** (L8), **Sea geysers** (L9, until the Kraken rises). |
| "add kraken to last level, that is hunting you after you beat Kraken crews ship" | Beat the Inkheart and her crew flee; **the Kraken rises and hunts you**: a shadow that follows, tentacles that slam and grab, a big-eyed head. Drive it off (600 hp, three phases) to win the game, a pearl worth 1,000 gold and the **Baby kraken** pet. Every attack is telegraphed; grabs always let go; **Try again from the Kraken** if you sink. |
| "quiz levels when you are ashore" | **Professor Barnacle's Riddle Bell** on the lookout tower raft: **9 quiz islands** in three bands, 5 questions a round (sea, sea life, places, pirates, sums), no timer, no lives, nothing lost; stars pay gold once; two trophies. A one-line-per-question bank, validated in Node. |
| "upgrade the island, add villagers, add houses, amenities" | **Builder Bess** on the plaza: 10 fixed plots on today's shack platforms, **4 homes** (Cottage → Townhouse → Manor) that bring **villagers** who walk the town, and **6 amenities** (Bakery, Powder Windmill, Lighthouse, Market Hall, Sea School, Flower Park), 3 tiers each, each with one small perk you can see. A fresh save's buildings look as today (only small "Build me!" boards are new). |

**Never cut** (the minimum this update ships): item 0; level 9 with the Inkheart and the hunting Kraken (rise, phases
1–2, grab, checkpoint); Fire, Frost and Stink with their looks and loads; the rudder; quiz islands 1–6; homes with walking
villagers and three amenities (Bakery, Windmill, Lighthouse); every record validated; the save migration.

**Explicitly out** (rejected by the judges): ammo made by island buildings or needing workers (depth); kegs bought
one at a time (spectacle); per-ship resistance matrices and combo tables (only two interactions and two immunities
stay); a player reload debuff ("INKED"); tap-the-sea steering; double-tap "Hard over"; the anchor swing (a third act-pad
button); the wheel as the touch default; new walkable rafts, platforms or rope bridges; a villager step-aside rule
(it would contradict the built LOOK-2 waiting); per-answer quiz gold; hurricane wind; jellyfish; "ICED SOLID";
coughing sailors; Kraken ink on the screen.

---------------------------------------------------------------------------------------------------

## 2. Special ammo: Fire, Frost and Stink

Rules and numbers live in **`src/specials.js`** (pure; §11.1). combat.js's `AMMO`/`AMMO_IDS` tables stay exactly as
they are (they are pinned by `tests/combat.test.cjs`); a special ball runs through `shotResult` as round shot and
`specialShot()` then applies its own hull factor and status (§2.6).

### 2.1 The three shots (`SPECIAL`)

| id | Key | Name | On sale at the tavern when | Recipe | Hull × | Range | Reload × | Spread × | Hit pad / top | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| `fire` | `4` | Fire shot | the Volcano is cleared (`unlocked ≥ 4`) | 300 | 0.7 | 30 | 1.1 | 1.0 | 0.4 / 3.8 | `fire` |
| `frost` | `5` | Frost shot | Frostbite Straits is cleared (`unlocked ≥ 6`) | 300 | 0.6 | 28 | 1.1 | 1.1 | 0.4 / 3.8 | `frost` |
| `stink` | `6` | Stink shot | the Maelstrom is cleared (`unlocked ≥ 7`) | 500 | 0.2 | 22 | 1.2 | 1.5 | 0.8 / 5.0 | `stink` |

All three: crew per hit 0; one projectile per gun ("port broadside fires N balls" stays true); a crit does ×1.75 and
pops CRIT! but has **no crit effect**; enemies never fire special shot. The staggered sale dates keep Voyages I and II
close to their tuning (one new toy at a time); a returning player who beat the Maelstrom gets all three on sale at once.

**Worked example** (mid-game ship: 4 guns × 12, beam-on at 20 u, no crit): round 48. Frost 28.8 and she crawls for 5 s.
Fire 33.6 now + 18 burn over 6 s = 51.6, but you can't board her while she burns. Stink 9.6 and she sits still for 4 s:
time to sail round and rake her stern with round shot (96). On an Iron Turtle's beam: round 24, fire 16.8 + 18 = 34.8
(the burn ignores her armour). Every special is a trade, never a straight upgrade.

### 2.2 Statuses (`STATUS`)

Each ship holds **one special status** at a time; a new one replaces the old (§2.3 for the two that interact). A
status is applied **once per volley per target** (the first ball of a volley that hits her applies it; the rest of that
volley only does hull damage), so five guns never stack five statuses.

| Status (pop) | What it does | Lasts | Hit again | Bosses (Molten Maw, Phantom, Inkheart) | Immune |
|---|---|---|---|---|---|
| `fire` **ON FIRE!** | burns **3 hp/s** (1 hp every ⅓ s, source `'fire'`, no tick pops); no hull regen; **can't be grappled** ("Too hot to board!") | 6 s | restarts at 6 s | 3 s | the Molten Maw: **IMMUNE!** "The Maw laughs at fire!" |
| `frost` **FROZEN!** | speed cap ×0.5, turn ×0.6 | 5 s | +2 s, at most 8 s | 2.5 s, at most 4 s | — |
| `stink` **STINKY!** | speed cap 0 (she coasts to a stop at 2× her accel), turn 0, **no firing**, no boarding attempt (a raider's or skiff's biting hooks drop: "Ropes dropped!"), no ram, no mortar shell, her crew fights at **grit ×0.75** in a boarding (the preview shows the better odds: "Stink, then board!"; the stink timer pauses from the grapple to the `result`, §2.4, so those are the odds that resolve) | 4 s | no change | 2 s | the Phantom: **IMMUNE!** "Ghosts can't smell!" |
| after stink: **Clothes-pegs!** | immune to stink | 10 s | — | 20 s | — |

- Speed and turn multipliers join SPEC2 §2.3's rule: the **smallest active multiplier** wins (chain 0.55, mast 0.5,
  frost 0.5 for speed; chain 0.7, rudder 0.25, frost 0.6 for turning; stink is 0).
- **One burn per ship:** Fire and the POWDER KEG crit share one burn timer; the one with more hp left to burn wins
  (keg 2 hp/s × 4 s = 8; fire 3 hp/s × 6 s = 18).
- Immunities are the only two, they are named on the tavern rumour board when the recipe is owned ("Powder tip: The
  Maw laughs at fire!", "Powder tip: Ghosts can't smell!") and the hit pops IMMUNE! (style `info`) with the reason in
  `#game-live`.

### 2.3 The two interactions, and water

| Hit | On a ship that is… | Result | Pop + sound |
|---|---|---|---|
| Fire | stinky | the stink cloud bursts: **+15 damage at once** (ignores armour), stink ends (its immunity window starts), she burns | **KA-BOOM!** + `blast` (flash overlay ≤ 0.25, at most one per 3 s) |
| Frost | burning | the fire goes out, frost takes hold | **FIRE OUT! SSSS!** + `sizzle` |
| a rogue wave (any angle), a waterspout's core | burning | the fire goes out | **FIRE OUT!** |

Every other combination simply replaces the old status (fire on a frozen ship: ON FIRE!; frost on a stinky ship:
FROZEN!, and the stink immunity starts).

### 2.4 Edge cases (all in `specials.js` or the main.js lines that apply it)

- A ship that **strikes, is captured, escapes or flees** loses every status at once (a burn can never sink a prize).
- A burn **pauses** on the two ships glued in a boarding (`swing..result`), and never takes the Phantom below her ghost
  floor of 1 hp (`damage()`'s `minHp`).
- A **stink pauses** on both ships of a boarding from the grapple (`hook`) to the `result`: boarding.js reads the sides
  at the start of `swing` (0.45 s + a 0.8–1.2 s reel after G), so a 4 s (boss 2 s) stink could otherwise run out
  between the "Stink, then board!" preview and the brawl.
- A raider or skiff whose hooks are biting (`threat`) and gets stinky: the hooks drop ("Ropes dropped!"), the same as a
  cut (its cooldown 10 s).
- A frozen ship still drifts with the Maelstrom's current and with waterspout pulls; floes still crunch it.
- A treasure galleon's own hold-fire rule still applies; stink only adds "no firing". A frozen or stinky galleon
  that is already inside her escape gate still escapes (the convoy rule is unchanged); a stinky one simply can't sail
  on toward it.
- A **burning target** shows the existing "too hot" tag icon with the seconds left, the Board cell reads `HOT! 4 s`, and
  pressing G says "Too hot to board! Wait for the fire to go out." The first Fire shot tip says it before you fire
  (§6.5, bit 256), so it is never a hidden trap.
- A stinky boss only coasts and stops firing for its 2 s; bosses never become stink-immune for less than 20 s.
- The **Fire Ship** (§4): fire burns her like any ship; frost **douses** her (§4.2); until she strikes she can't be
  grappled ("Too hot to board! Freeze her first.", §4.2).
- The **Kraken** has its own rules for specials (§5.7.5).

### 2.5 Recipes and loads (`RECIPES`, `LOADS`)

| Rule | Number |
|---|---|
| A recipe is bought once, at the tavern's new **Powder room** list | Fire 300, Frost 300, Stink 500 (1,100 in all) |
| A **load** is one broadside of one side, any number of guns | `Space` fires both sides: each side that fires a special spends one load |
| Loads at every level start, for each recipe owned | **4** (+1 / +2 / +3 with the Powder Windmill, §8.1) |
| **Powder crates** on Voyage III levels (`def.crates`, at `env.crateSpots`) | 2 per level; sail within 3 u: +1 load of the owned special with the fewest loads ("+1 FROST SHOT!"), or +20 gold if you own none |
| Loads carry over? | never: they refill at every level start and at the Kraken checkpoint (nothing to hoard or grind) |
| A side whose loaded special has no loads left | fires **round shot**; hint "Out of Fire shot! Round shot loaded." (and `#game-live`); `state.ammo` becomes `round` **directly** (not through `setAmmo`: no `AMMO_SWAP` reload delay and no `click`), so the other side of a `Space` broadside still fires at once |

So a player with all three recipes has 12–21 special broadsides a level (14–23 on a Voyage III level with its 2 crates;
a level lasts 40–80 broadsides), always shown as "Fire ×4" on the Ammo cell and read as "Fire shot loaded, 4 loads
left".

### 2.6 How a special ball is resolved (main.js `ballHit`, `damage`)

```
base = SPECIAL[b.ammo] ? 'round' : b.ammo
info = shotResult({ ammo: base, ... as today })                // range fall-off, rakes, crit roll, zone
if (SPECIAL[b.ammo]) info = specialShot(info, b.ammo)          // dmg × SPECIAL.hull, critEffect null, crewKill 0, slow false,
                                                               //  status: 'fire' | 'frost' | 'stink'
info.dmg *= armourMul(info.aspect, s.type.armour)              // combat.js: Iron Turtle beam hits ×0.5 ("CLANG!"), rakes ×1
damage(s, info.dmg, x, z, src, info)                           // applies info.status once per volley per target (§2.2)
```

### 2.7 What you see and hear

| | Ball in flight | On the ship (`statusfx.js`, §11.1) | Sound (`audio.js`) |
|---|---|---|---|
| Fire | orange ball wrapped in cartoon flame, ember trail | flames lick up from her two newest holes (shape flicker only, never brightness), black smoke from main's ambient particles, charred sail edges | `ignite` whoomph, a soft `crackle` loop on the nearest burning ship (≤ 2 voices), `sizzle` when put out |
| Frost | pale-blue ball with crystal spikes, snowflake trail | a jagged white-blue icicle fringe under her rails, ice plates bobbing round her hull, her wake stops, flakes drifting off | `freeze`: crystalline pings 2–4 kHz + a "kssh" |
| Stink | a wobbling clay stinkpot on a green fume trail | a puffy lime cloud (`0x8bc34a`, swirls `0x5a8f2e`) on her deck with wavy stink lines and two buzzing flies; she stops dead | `stink`: a wet splorch + trombone slide 220 → 110 Hz, a comic "blech" |

- Her **name tag** shows one status badge (snowflake, flame or stink cloud: different shapes, never colour alone) with a
  ring of 8 dots that go dark as it wears off (§6.4). Bosses show it beside the boss bar (`#boss-status`).
- Pops (pops.js styles `fire`, `frost`, `stink`): ON FIRE!, FROZEN!, STINKY!, Clothes-pegs!, KA-BOOM!, FIRE OUT! SSSS!,
  IMMUNE!, CLANG!: white ≥ 24 px with a 3 px ink outline (SPEC2 rule).
- `#game-live`: "The Iron Turtle is on fire", "The Shark Raider is frozen", "The Bomb Ketch stinks! She can't move".
- Reduced motion: the effects are drawn but don't swirl or bob; the KA-BOOM flash becomes a soft tint.
- Your racked loads: three small kegs by the mainmast in the specials' colours with white icons (1 merged mesh,
  `buildShip('player', { powder })`), shown only for recipes owned.

---------------------------------------------------------------------------------------------------

## 3. Better steering

### 3.1 Big rudder & wheel (`upgrades.js` export `RUDDER`; the shipyard's 7th row)

| Tier | 0 (stock) | 1 | 2 | 3 |
|---|---|---|---|---|
| Turning when slow (`turnLow`, share of the full rate at a standstill) | 35 % | 50 % | 65 % | 80 % |
| Turning at speed (`turn ×`) | ×1.0 | ×1.05 | ×1.1 | ×1.15 |
| Price | — | 120 | 300 | 550 |
| On the model (`buildShip('player', { upgrades })`) | — | a bigger rudder blade | a gold-trimmed bigger wheel | a brass wheel and a compass binnacle |

One turn formula, used by **every** copy (main.js `turnRate(ship, { full })`, Stage 0):

```
turnRate(ship, { full = false } = {}) =
   (full ? type.turn : type.turn × (low + (1 − low) × min(1, speed / maxSpeed))) × turnMul(ship)
   × (ship is the player ? boarding.turnScale : 1)
   low = type.turnLow ?? RUDDER.values[0]   // the player's comes from the rudder; enemies keep tier 0's 0.35
   type.turn = SAIL_TURN[sails] × RUDDER.turnMul[rudder]   // playerType()
```

The copies today are `updatePlayer` (2534, which also multiplies `boarding.turnScale`), `steerToward` (2515, enemies;
its `fullRate` branch, used for escaping and captured ships at 2564 and 2707, becomes `{ full: true }`) and
`launchBomb`'s predicted turn (2414); all three read `turnRate()` and `playerTurn()` (§3.2). Stage 0 gives identical
results for the first two; `launchBomb`'s prediction gains `turnMul` and the boarding lock, a change no test can see (the
player never carries a chain or rudder effect, and the prediction is scattered by `rand` anyway). `animateHelm` (5458)
keeps reading the raw keys (`right − left`, not zeroed by the boarding lock) in Stage 0; from Stage 2 it turns the wheel
by `−playerTurn()`, so the slide, the wheel and a grab show at the helm. Most of the gain is at low speed
(a stock ship at a standstill turns at 0.49 rad/s, tier 3 at 1.29); at full speed the best ship turns at
1.6 × 1.15 = **1.84 rad/s** (today 1.6), so stern rakes stay earned. The shipyard now costs **6,240** in all (5,270 + 970).

**The ship record:** `up.rudder` is a **sparse** field: it is written only when ≥ 1, and a record without it reads as
tier 0. So every existing ship record (and its pinned text in `tests/upgrades.test.cjs` and the `controls.cjs` ship
battery) stays valid byte for byte. `UPGRADES` (the six rows `upgrades.test` pins) is unchanged; the shipyard panel
lists `[...UPGRADES, RUDDER]`. `statText('rudder', t)` → `"50% turn when slow"`.

### 3.2 Touch steering

- **Default, unchanged:** ◀ and ▶ (tap = a nudge, hold = full turn), exactly as today; keys A/D/←/→ ±1. `input.left` and
  `input.right` stay plain booleans for the bots and the existing tests (F07, the click-nudge checks).
- **New, additive — thumb slide:** put a thumb on the steering pad and slide it: the turn follows the thumb.
  `r = clamp(r0 + dx / 56 px, −1, 1)` (turning right is positive; `r0` = −1 if the touch began on ◀, +1 on ▶, 0
  between them), active only once the thumb has moved **12 px** sideways (a plain hold behaves exactly as today).
  While a slide is active main sets `input.steer = −r` (positive = left, like `updatePlayer`'s `turn`); letting go
  clears it (`null`). A small rudder needle above the pad (`#steer-needle`, `aria-hidden`) shows the turn.
- **Opt-in — ship's wheel:** Pause ▸ **Steering: ◀ ▶ buttons / Ship's wheel** (`#steer-mode-btn`, a two-state toggle
  with `aria-pressed`, shown on touch layouts only and only when `WITH_KRAKEN` is true, saved in
  `pirates-ahoy-settings`; it sits last in `#pause-choices`, after the leave group, so the leave question hides it like
  the other choices, and the pause panel still fits with no scroll at every touch size, §13.4 K4). The wheel (`#touch-wheel`, 132 px,
  8 spokes, brass hub) replaces ◀ ▶ in the steering pad: drag sideways, `input.steer = −clamp(dx / 60 px, −1, 1)`, dead
  zone 0.1, it turns `steer × 120°` and springs back in 0.15 s (at once under reduced motion); the helm captain turns
  his wheel by the same amount (`'steer'` with `turn`). The wheel is `aria-hidden` (like the town joystick); the buttons
  stay the accessible default. Introduced by a "New!" badge on the toggle the first time the pause dialog opens on
  touch (tips bit 32768), never by a battle hint; the badge sits inside the button's box and never clips its label.
- `playerTurn()` = `boarding.locked || state.grabbed ? 0 : input.steer ?? (input.left ? 1 : 0) − (input.right ? 1 : 0)`.
  `launchBomb`'s and the mortar's aim prediction use it, so they lead an analogue turn correctly.
- Tap-the-sea steering is **not** added (a stray tap near the fire pad would veer the ship).

---------------------------------------------------------------------------------------------------

## 4. New enemy ships (`shipTypes.js` data, Stage 0; behaviours in `mechanics3.js`, armour in `combat.js`)

### 4.1 Stats

| Key | Name | hp | len / wid | max speed | accel | turn | reload | guns × dmg | gold coins → sunk / captured | crew / grit | engage | spread | Flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `shark` | Shark Raider | 40 | 8 / 2.6 | 13 | 4.5 | 1.7 | 3.0 | 1 × 4 | 4 → 40 / 105 | 8 / 1.0 | 18 | 0.12 | `ram: true` |
| `bombketch` | Bomb Ketch | 70 | 9 / 3.0 | 6.5 | 2.2 | 0.8 | 3.5 | 1 × 3 | 7 → 70 / 165 | 10 / 0.9 | 42 | 0.12 | `mortar: true` |
| `ironclad` | Iron Turtle | 150 | 11 / 4.2 | 6 | 1.8 | 0.7 | 2.8 | 3 × 6 | 12 → 120 / 265 | 16 / 1.3 | 20 | 0.09 | `armour: 0.5` |
| `fireship` | Fire Ship | 30 | 7.5 / 2.6 | 11.5 | 4 | 1.4 | 99 | 0 | 3 → 30 / 85 | 4 / 0.8 | 0 | 0 | `fireship: true` |
| `skiff` | Squid Skiff | 40 | 8 / 2.6 | 13 | 4.5 | 1.7 | 3.0 | 1 × 4 | 5 → 50 / 125 | 10 / 1.1 | 9 | 0.12 | `boarder: true, shallow: true` |
| `inkheart` | The Inkheart | 360 | 17 / 5.6 | 7 | 2 | 0.65 | 2.4 | 6 × 6 | 35 → 350 / 725 | 26 / 1.6 | 24 | 0.07 | `boss: true, flagship: true` |

Capture gold is `gold × 20 + 25` for every type (the combat tests check the formula for all types). The fire ship's
`holdFire` is always true (she has no guns). Every type satisfies the existing combat checks (integer crew ≥ 1; hull
alone never reaches the notch).

### 4.2 Behaviours (`mechanics3.js` tables; they follow the type flag on any level, so `G.spawn` tests them anywhere)

| Ship | Rule | Telegraph (≥ 1.5 s) | Counters |
|---|---|---|---|
| Shark Raider (`RAM`) | when attacking and you are within 25 u and within 0.35 rad of her bow: a **1.5 s wind-up**, then a **2 s surge** at 16 u/s with her heading locked. Hull contact (centre distance < (len_a + len_b) × 0.36): you take `round(10 × min(1, v / 16))`, she takes 8, both pushed apart at 4 u/s for 0.6 s, "CRUNCH!". Cooldown 6 s | red ▶▶ chevrons in her tag's icon slot, "RAM!" pop, `ram` growl | turn away; stink cancels the charge; frost halves the surge (so the hit) |
| Bomb Ketch (`MORTAR`) | keeps 35–45 u off (flees inside 20); every 6–8 s (`ctx.rng`), with you 25–48 u away, lobs a shell at your predicted spot (lead 0.8 of `playerTurn()`'s arc): ring r 4.5, **12 damage** to any ship inside | an orange ring with ticking fuse sparks for **2.2 s** (+ Lighthouse), deep `mortar` thoomp; first time: banner "Mortar shell! Steer out of the orange circle" | close in fast (her single gun is weak); stink pauses her mortar |
| Iron Turtle (`armour: 0.5`) | beam hits ×0.5 with a "CLANG!" pop (once per volley) and sparks; rakes, crits, burns and KA-BOOM do full damage | the CLANG! itself; rumour board | rake her bow or stern; Fire shot |
| Fire Ship (`FIRESHIP`) | sails straight at you (no attack slot needed). Within **30 u** she is **lit**: flames bloom up her rigging and a red danger ring (r 6) circles her; after **1.6 s** lit she is armed. Armed and within 4 u of any hull → **explodes**: 22 damage at her centre falling to 11 at r 6, to **every** ship (pirates too). Sunk while lit → explodes where she is (no coins). Sunk before she is lit → sinks normally (30 gold). **Never grappled until she strikes:** `canGrapple` answers `'immune'` for a fire ship that hasn't struck ("Too hot to board! Freeze her first."; her tag shows the too-hot icon and the Board cell `HOT!`, the burning-ship telegraph), so no boarding ever glues a hull to a live fuse. Her blast hits a glued boarding pair like any bomb; a ship it sinks ends that boarding the existing way (`cancel('sunk')`). **Frost** (any hit): her fuse is out for good, she slows to 3 u/s and **strikes her colours** ("The fire ship gives up!"): grapple her for 85 gold | lit flames + red ring for ≥ 1.6 s before any blast, `fuse` hiss; first time: banner "Fire ship! Sink her or freeze her before she reaches you!" | sink her at range, freeze her, or lure her into her own fleet |
| Squid Skiff | the raider rules (SPEC2 §3.6) unchanged: hooks, cut by G ×3 / hold / a hit, counter-board | "BOARDERS! Cut the ropes!" | as raiders; stink drops her hooks |
| The Inkheart (`INK`) | a boss, boardable. Every 10 s she lobs **2 ink pots** at your predicted spot ±6 u (`ctx.rng`): ring r 4, **8 damage**, and each leaves an **ink slick** (r 7, 6 s; any ship whose centre is inside has its speed cap ×0.6, "INKY!" once per entry; at most 3 slicks) | dark-violet ring with bubbling ink for **1.8 s** (+ Lighthouse), `ink` "pthoo" | keep moving; capture her for 725 |

**When the Inkheart falls** (sunk or captured; `flagship` mechanic, L9): every other fighting enemy **flees**
(`ctx.flee(e)`: out of `fighting()`, turns for the nearest world edge at 7 u/s, removed after 5 s with a foam puff; no
loot, no penalty, no capture, no feat) — banner "The Kraken Crew flee!" — the geysers stop and the ink slicks fade.
Struck ships still afloat are captured as at a level clear (SPEC2 §3.1). Then the Kraken rises (§5.7).

### 4.3 Looks (`ships.js`; each ≤ a Man-o'-War's draw calls, the Inkheart ≤ 1.3×)

- **Shark Raider:** a blue-grey hull with a painted toothy grin at the bow, a fin-shaped sail, an iron ram.
- **Bomb Ketch:** a stubby mustard hull with two short masts and a fat bronze mortar amidships that jumps and puffs a
  smoke ring when it fires; the shell trails fuse sparks.
- **Iron Turtle:** a riveted green-grey dome of hexagon plates over the deck like a shell, a turtle-head figurehead;
  beam hits spark.
- **Fire Ship:** a scruffy tarred sloop piled with barrels; lit, flames climb her rigging (glow particles, shape
  flicker, never brightness).
- **Squid Skiff:** a narrow purple hull with a squid prow and googly eyes (a variant of the raider builder: palette swap,
  new prow; cheap).
- **The Inkheart:** a purple-black three-master, gold scales on her stern castle, a carved kraken wrapping the
  bowsprit, amber eyes on the figurehead, tattered violet sails with a giant painted eye.
- Crews (`enemyCrewOpts`, cosmetics.js): shark — grey bandanas, blue-and-white stripes; ketch — mustard shirts, caps;
  turtle — green coats, caps; fire ship — soot-black shirts, red bandanas; skiff and Inkheart (the Kraken Crew) — purple
  bandanas, dark-teal vests.
- `ships.projectileMesh('fire' | 'frost' | 'stink')`: the flaming ball, the spiky frost ball, the clay stinkpot (cached
  geometry, shared material, like today's three).

---------------------------------------------------------------------------------------------------

## 5. Voyage III · The Kraken Seas (levels 7–9)

### 5.1 Level definition additions (`src/act3.js`, SPEC2 §6.1 format)

New optional fields: `crates` (count, §2.5), `kraken: true` (L9), `sailOn` (the Victory screen's sail-on button text),
`victoryLine` (the Victory banner's small line), `rumour.ammo` may also be `'fire' | 'frost' | 'stink'`.
`mechanics` mixes ids of `mechanics.js` (`MECHANIC_IDS`) and `mechanics3.js` (`MECHANIC3_IDS = ['spouts', 'rogue',
'flagship']`); main splits them. The type behaviours of §4.2 need no id. `act2.js`'s Maelstrom gains `sailOn: 'Sail on to
the Kraken Seas'` and `victoryLine: 'The Far Seas are yours'` (new keys; its pinned fields are untouched); main's defaults
remain `'Sail on to the Far Seas'` and today's lines, so Act I needs no new key (the mechanics test requires Act II to
have every Act I key).

`src/voyage.js` (new) composes the voyage: `LEVELS = WITH_KRAKEN ? [...levels.LEVELS, ...ACT3_LEVELS] : levels.LEVELS`,
with `WITH_KRAKEN = /[?&]kraken=1(&|$)/.test(location.search)` until Stage 3 sets it to `true`. main imports `LEVELS`
from `voyage.js`; `levels.js` keeps its six levels, so `tests/mechanics.test.cjs`'s levels.js checks never change.

### 5.2 How Voyage III opens, and the save migration

- Beating the Maelstrom still shows Victory. The won text is `finaleText` + " " + `ACT3_TEASER` ("…but far to the
  south, something stirs in the deep.") and `#act2-btn` reads **Sail on to the Kraken Seas** (`Enter` too); the dock's
  ways out from that Victory read "Set sail for The Turtle Atolls | Back to the title". The Victory banner's line is the
  level's `victoryLine`.
- Card 7 reads "Beat the Phantom Galleon", cards 8–9 "Locked" (A11Y-5 pattern: `aria-disabled`, described, `#menu-live`
  says why). The title shows nine cards in three groups; `ACT_NAMES[3] = 'Voyage III · The Kraken Seas'` (heading colour
  `#2f2a6e`, ≥ 7:1 on parchment). Pips stay skulls: "Difficulty N of 9".
- On a portrait phone the title panel scrolls inside (as today); when the title shows, the card of the highest open level
  is scrolled into view (`block: 'nearest'`) without taking focus.
- **Migration (at load, once Voyage III is live):** if `feats.legend ≥ 1` **and** `unlocked ≥ 6` then `raiseProgress(7)`
  (the one rule; §10.3 says the same). Nobody replays the Maelstrom. `pirates-ahoy-unlocked` clamps to `1..9`. Known
  edge case, accepted: the legend feat is saved the moment the Phantom is captured, and the escorting raider can still
  sink you before the level clears, so such a save opens level 7 without a cleared Maelstrom (the child beat its boss).
- Beating level 9 shows the final Victory: "The Kraken is driven back to the deep, and the Seven Seas are safe! You are
  the Kraken Tamer!", `#act2-btn` hidden, Enter → the title.

### 5.3 Natural disasters (one table each; numbers in `mechanics3.js` `SPOUTS`, `ROGUE`, and L9's `bombs`)

**Waterspouts (L7, `SPOUTS`)**

| Rule | Number |
|---|---|
| Active at once | 2 during wave 1, 3 during wave 2 |
| Path | each rides a fixed loop from `env.spoutLoops` (`cx + rx·cos(ωt + φ)`, `cz + rz·sin(ωt + φ)`, about 2.5 u/s) that never comes within r + 8 of a collider or the player start |
| Forming | a dark swirl ring (r 6) and a cloud funnel lowering for **3 s** (+ Lighthouse); harmless |
| Life | active 22 s, collapse 2 s; the next forms 6–9 s later (`ctx.rng`) at a loop point ≥ 30 u from you |
| Pull zone, r 14 | drift 2 u/s toward the core (every ship; skipped for the glued boarding pair) |
| Core, r 6 | spins the ship +2 rad/s, **4 hp/s** (1 hp per 0.25 s, source `'spout'`), after 1.5 s inside flings it outward at 6 u/s for 1 s; "WHOOSH!"; puts out fire |
| Pirates | steer clear (`avoid()` circles r 16) but chases can drag them in |
| Looks / sound | three twisting cel bands (white, pale grey, blue-grey, `noOutline`) under a dark cloud disc, a spray skirt, two barrels and a startled fish circling up; a whistling `spout` wind loop that grows as you near one; white swirls on the minimap |

**Rogue waves (L8, `ROGUE`)**

| Rule | Number |
|---|---|
| First wave | 30 s of combat time |
| Then | every 24–32 s (`ctx.rng`), one at a time |
| Warning | **4 s** (+ Lighthouse): the conch-horn tower sounds (`horn`), an arrow at the screen edge, a teal line with an arrow on the minimap; the first time a banner "ROGUE WAVE! Turn your bow or your stern to it!" |
| The wave | a Hokusai-style curling crest 120 u long and 7 u tall, rolling at 16 u/s, starting 70 u (+16 × warn bonus) from you, its direction one of `env.rogueDirs` (`ctx.rng`) aimed through your position |
| Hit test | when the crest passes a ship's centre; the angle `a` between her heading and the wave's travel decides |
| Side-on (50° ≤ a ≤ 130°) | **10 damage**, pushed 6 u along the travel over 0.5 s, 1 s wobble (turn ×0.5), "SPLASH!" |
| Bow into it (a > 130°) | "RODE IT!", no damage |
| Stern to it (a < 50°) | "SURF'S UP!", +2 to the speed cap for 2 s, no damage |
| Everyone | pirates take it the same way (bosses turn bow-in); any wave puts out fire |
| Reduced motion | no camera bob, no shake |

**Sea geysers (L9, `def.bombs`)** — `{ kind: 'geyser', every: [6, 9], spread: 8, radius: 4.5, damage: 10, warn: [1.8,
2.2] }` through the generalised `launchBomb` (§11.2): a ring of bubbles for the warning, then a white water column with a
`fwoosh`; a ship inside bobs up 1 m (visual only). They stop for good when the Inkheart falls.

### 5.4 Level 7 — The Turtle Atolls (`src/env/atolls.js`) · Daring ★7

- **Setting:** South Seas noon: white-sand atolls round turquoise lagoons, leaning palms, an island shaped like a giant
  turtle (a head rock and a shell hill), sea turtles paddling (decor), flamingos on sandbars, a candy-striped lighthouse
  toppled on a coral rock, a stilt village with conch-shell roofs, a wreck on a reef, and a bruise-purple storm wall to the
  east trailing rain curtains (one merged mesh) where the spouts come from.
- **Palette:** `skyTop 0x2f7fe0, skyHorizon 0xbfeff0, sunColor 0xfff4d6, sunDir [0.3, 0.8, 0.4], sunIntensity 2.3,
  hemiSky 0xd8f4ff, hemiGround 0x4a7a8a, hemiIntensity 1.3, fogColor 0xbfe8e8, fogNear 140, fogFar 380, waterDeep 0x0f7f9a,
  waterShallow 0x48e0d0, waterFoam 0xffffff, waveAmp 0.6, cloudColor 0xffffff, cloudShade 0xb8c8e0, cloudCount 12`;
  `worldRadius 145`.
- **Data:** 6–9 sandbars as `reefs` (deep hulls ×0.45), `spoutLoops` ≥ 4, `crateSpots` ≥ 4, `enemySpawns` ≥ 6 (the
  smoke layout rules), `playerStart` mid-lagoon.
- **Def:** `waves: [['shark', 'shark', 'corsair'], ['bombketch', 'shark', 'privateer']], nextWaveAt: 1, maxAttackers: 2,
  lead: 0.65, spreadMul: 0.95, grace: 4, enemyRake: 1, mechanics: ['spouts'], crates: 2, bonus: 1300, scene: 'atolls',
  lockText: 'Beat the Phantom Galleon'`, `mechanic: 'Waterspouts! Keep clear of the twisters. Shark Raiders ram: turn
  away when they charge!'`, `rumour: { title: 'The Turtle Atolls', lines: ['Shark Raiders charge bow first. Turn aside!',
  'Frost shot takes the bite out of a charging shark.'], ammo: 'frost' }`.
- **Music** (`atolls`, synthesised): marimba and ukulele calypso over steel drums; thunder only as sound.

### 5.5 Level 8 — The Cape of Storms (`src/env/cape.js`) · Fearsome ★8

- **Setting:** a stormy orange-violet sunset off a green-and-ochre cape: cliffs with crashing surf, a red-and-white
  lighthouse, a conch-horn tower on a rock (it sounds before each rogue wave), penguins on boulders, whales spouting far
  out, albatrosses; swell 0.9.
- **Palette:** `skyTop 0x4b3a8f, skyHorizon 0xffb38a, sunColor 0xffc89a, sunDir [-0.6, 0.25, 0.5], sunIntensity 2.0,
  hemiSky 0xffd8c0, hemiGround 0x3a4a6a, hemiIntensity 1.2, fogColor 0xe8a8a0, fogNear 110, fogFar 340, waterDeep 0x1b5c8c,
  waterShallow 0x3fc7c9, waterFoam 0xffffff, waveAmp 0.9, cloudColor 0xf0d0e0, cloudShade 0x6a4a7a, cloudCount 16`;
  `worldRadius 150`.
- **Data:** `rogueDirs` (2–4 angles from open sea), `crateSpots` ≥ 4, `enemySpawns` ≥ 6.
- **Def:** `waves: [['ironclad', 'bombketch', 'corsair'], ['fireship', 'ironclad', 'fireship']], nextWaveAt: 1,
  maxAttackers: 3, lead: 0.7, spreadMul: 0.9, grace: 3, enemyRake: 1, mechanics: ['rogue'], crates: 2, bonus: 1600, scene:
  'cape'`, `mechanic: 'Rogue waves! Turn your bow or stern to them. Iron Turtles: hit their bow or stern!'`, `rumour: {
  title: 'The Cape of Storms', lines: ['Iron Turtles shrug off a broadside. Rake them, or set them alight!', 'Freeze a
  fire ship and she gives up.'], ammo: 'fire' }`. (The two rammers never share a level: sharks on L7, fire ships on L8.)
- **Music** (`cape`): a brass storm shanty with concertina and stormy strings.

### 5.6 Level 9 — The Kraken's Deep (`src/env/deep.js`) · Mythic ★9 · the finale

- **Setting:** a moonlit night under a huge low cratered moon; the foam glows cyan (`waterFoam 0x9ff7ff`) so every wake
  and tentacle splash is a trail of light on a phone; wrecks lying on their sides (colliders), a whale-skeleton arch you
  can sail through, glowing jellyfish (decor, one InstancedMesh ≤ 120, `noOutline`, scale pulse ≤ 1 Hz), and the Kraken
  Crew's lair, a sea cave carved like an octopus head with purple torches for eyes.
- **Palette:** `skyTop 0x0f1638, skyHorizon 0x3a3f7a, sunColor 0xcfe0ff, sunDir [0.2, 0.7, -0.5], sunIntensity 1.2,
  hemiSky 0x7a86c8, hemiGround 0x101833, hemiIntensity 1.2, fogColor 0x232a5a, fogNear 70, fogFar 300, waterDeep 0x0b2a4a,
  waterShallow 0x1f8f9a, waterFoam 0x9ff7ff, waveAmp 0.75, cloudColor 0x4a5080, cloudShade 0x232a4a, cloudCount 10`;
  `worldRadius 140`.
- **Data:** `krakenArena: { x, z, r }` (open water, r ≥ 60, clear of colliders by 10), `crateSpots` ≥ 4,
  `enemySpawns` ≥ 6, `setDread(k)` (water darkens, bubbles; k 0..1), `setDawn(k)` (sky eases to dawn gold).
- **Def:** `waves: [['skiff', 'skiff', 'ironclad'], ['inkheart', 'skiff']], nextWaveAt: 0, maxAttackers: 3, lead: 0.7,
  spreadMul: 0.9, grace: 3, enemyRake: 1, mechanics: ['flagship'], bombs: { kind: 'geyser', … §5.3 }, kraken: true,
  crates: 2, bonus: 2500, scene: 'deep', finale: true, finaleText: 'The Kraken is driven back to the deep, and the Seven
  Seas are safe! You are the Kraken Tamer!', victoryLine: 'The seas are yours'`, `mechanic: 'The Kraken Crew guards the
  Deep. Beat their flagship… if you dare!'`, `rumour: { title: "The Kraken's Deep", lines: ["The Inkheart flies the Kraken
  Crew's flag.", 'If the Kraken grabs you, stink shot makes it let go!'], ammo: 'stink' }`.
- **Music:** `deep` (a low cello ostinato, glass harmonica, whale-song glides) until the rise, then `kraken` (a
  descending tuba motif over timpani in 6/8, faster in phase 3).
- **No stacking:** before the rise the hazards are the geysers, the Inkheart's ink and the skiffs' boarding; from the
  rise on there is **only the Kraken** (no geysers, no slicks but the Kraken's own, no boarders, no ships).

### 5.7 The Kraken (`src/kraken.js` pure simulation, `src/krakenView.js` the model)

#### 5.7.1 The sequence

1. **The Inkheart falls** (§4.2): the crew flee, the geysers stop. The rise waits until no boarding is running (a
   boarding of the Inkheart plays out its `result`), struck ships are captured and the fleeing ships are gone (≤ 5 s).
2. **Dread, 4 s:** a heartbeat, the music drops to a drone (40 Hz **plus audible harmonics** at 80, 120, 160 and 240 Hz
   so phone speakers play it), `deep.setDread(1)`, bubbles; your crew patches the hull as at reinforcements (§8.1
   Bakery) and +3 hands come aboard.
3. **The rise, ≤ 6 s, skippable by any key or tap:** bubbles boil up in a ring 30 u round you, the camera pulls up and
   back, a horn `krakenRise` "WHOOOM", 40 u ahead the sea bulges and **one amber eye, as big as your sail, opens and
   blinks** (its glow eases on and off, ≤ 1 Hz). Banner **"THE KRAKEN RISES!"** with one how-to line: "Shoot its tentacles
   and its big eye!" (+ " Stink shot makes it let go!" when Stink is owned). Reduced motion: a cut to the eye for 1.5 s
   and back, no camera glide, no shake. The **checkpoint** is taken here (§5.7.6).
4. **The fight** (§5.7.3). The boss bar reads **THE KRAKEN** with two notches (3 segments).
5. **Driven off at 0:** "THE KRAKEN IS DRIVEN OFF!", it sinks in a swirling splash with a sulky bubbly `gurgle` and an
   ink raspberry, `deep.setDawn()` eases the sky to dawn gold over 3 s (a cut under reduced motion), and **the Kraken's
   Pearl** bobs up (a glowing pearl in a giant shell): sail over it, or it drifts to you after 4 s: "+1,000 THE KRAKEN'S
   PEARL" (`KRAKEN.pearl`, added to `state.gold` when collected, so `finishLevel` banks it with the level's plunder;
   paid on every clear of L9). A **baby kraken** pops up and climbs aboard ("It seems to like you!"; the `pet.octopus`
   trophy). Feat `kraken` = 1 (saved at once). Then the level clears (`clearTimer`) and `finishLevel` shows the final
   Victory.

#### 5.7.2 The beast

| Part | Look | Hit by balls | Damage to the Kraken's bar |
|---|---|---|---|
| Shadow | a dark violet blob (r 9) under the water, two dim yellow eyes, a bubble trail | no | — |
| Head (when up) | a huge plum mantle (`0x4a2f6e`, belly `0x7a4f86`) with pink spots, barnacles and an old figurehead stuck on its crown, two big amber cartoon eyes under cross brows (only one shows at the rise) | sphere r 6 at y 3 | ×1 |
| The eyes | amber, glowing (`noOutline`) | a sphere r 2.5 between them, at the front of the head | ×1.5, pop "BULLSEYE!" |
| Tentacles (≤ 4 up) | thick tapered tentacles with pink suckers and curled tips | capsule r 1.4 from y 0 to 9 | ×1; each has **30 hp** of its own: at 0 it recoils ("OUCH!") and sinks early |

- One bar: **600 hp**, notches at 400 and 200. Hull damage like a ship's: `shotResult` with the ball's own ammo (grape
  0.3, chain 0.4, specials by `SPECIAL.hull`), range fall-off and crits (×1.75, CRIT! only, no crit effects) apply;
  **rakes never** (aspect is ignored; no RAKE! cue on Kraken targets).
- `G` with nothing grabbing you during the fight: "You can't board a sea monster!" in the hint bubble.

#### 5.7.3 Phases (`KRAKEN`)

| | 1 · The Hunt (600 → 400) | 2 · The Fury (400 → 200) | 3 · The Last Stand (200 → 0) |
|---|---|---|---|
| Shadow | chases you at **8 u/s** (a stock ship at full sail, 12 u/s, outruns it) | 9.5 u/s | stops: the head surfaces 25 u off your beam (in open water) and stays up there |
| Attack trigger | the shadow within 14 u of you | same | always |
| Attack | **2** tentacles every **8 s** at your predicted spot ±6 u | **3** every **7 s** | **4** every **6 s**, anywhere within 40 u of you |
| Warning (+ Lighthouse) | **1.8 s**: a violet dashed foam ring (r 4), bubbles, a rising tone, "TENTACLE!" | 1.6 s | 1.5 s |
| Slam | **12 damage** inside the ring, "SLAM!"; the tentacle then sways for **4 s** as a target and sinks (≤ 0.5 s) | same | same |
| Grab | — | the **first** tentacle of each attack grabs instead of slamming if your hull is inside its ring when it lands; its ring is red-rimmed; **no grab within 8 s of any release** | same |
| Head | surfaces 20 u off your beam every 3rd attack, for 7 s | every 2nd attack, 7 s | always up; the eye glows 4 s in every 8 (the weak spot hint) |
| Ink | — | every 12 s it spits an ink blob ahead of your bow (1.8 s ring, 8 damage) that leaves an ink slick (the Inkheart's `INK` numbers, read from `ctx.tables.INK`) | — |
| Pull | — | — | 2 u/s toward the head within 50 u |

- **No stalling (`cutOff`):** in phases 1–2, if no attack has started for **12 s** (you are outrunning it), the
  Kraken dives and surfaces **30 u ahead of your bow** (clamped to open water ≥ 6 u from land and inside
  `worldRadius − 20`) with the normal warning ring, and attacks there. Targets keep coming however the child sails.
- **Never on land or off the map:** the shadow steers round colliders (+6) and keeps inside `worldRadius − 20`; every
  attack spot is moved to the nearest open water.
- **At most 4 tentacles up**, counting swaying, grabbing, recoiling and sinking ones: phase 3's timing (slam at +1.5 s,
  4 s sway, ≤ 0.5 s sink, next slam at +7.5 s) keeps a 1.5 s gap, and an attack that would still raise a fifth first
  retires the oldest (it sinks at once). `krakenView`'s 4 tentacles and §14's "rings ≤ 4" rely on this cap.
- **Grab:** a tentacle curls round your hull: your speed and turn are 0, **2 hp/s**, at most **4 s** — then it always
  lets go. Four ways out, shown on screen ("GRABBED! Hold G to cut it loose" / touch: the Board button reads **CUT!**):
  hold G (or CUT!) for 0.8 s, or press it 3 times (`RAIDERS.cutHold` / `cutTaps`, read from `ctx.tables.RAIDERS`);
  any hit of your shot on that tentacle; a stink hit; or the 4 s timeout. You can still fire while grabbed. Mashing is
  never needed.
- **No grab chains:** a release leaves the ship at speed 0, and from a standstill she covers only 5–6 u in a 1.5 s
  warning. So after any release there is **no grab for 8 s** (`KRAKEN.grabRest`; tentacles only slam), and the first
  attack after a release places every ring ≥ 8 u from your hull. A child is never held twice in a row.

#### 5.7.4 Kind to a child

Every attack is telegraphed for ≥ 1.5 s by a ring, a sound and a word, and announced (throttled, ≤ 1 per 3 s) in
`#game-live` ("Tentacle! Steer away."). The fight is bot-tuned to **2–3 minutes** on the late-game ship (§5.9). No
boarders, no other ships and no other hazards join it.

#### 5.7.5 Special ammo on the Kraken

The Kraken takes statuses as a boss: its durations and rates are `STATUS`'s boss values (fire `dps` for `boss` s, frost
`time × bossMul`, stink `boss` then `bossImmune`), read from `ctx.tables.STATUS` (§11.1), never copied into `KRAKEN`.
Only the Kraken's own effects (chase ×0.5, warning +0.5 s, the sneeze) live in `KRAKEN.specials`.

| Ammo | Effect | Lasts (today's `STATUS` values) |
|---|---|---|
| Frost | the shadow's chase ×0.5 and every warning +0.5 s | 2.5 s |
| Fire | the part hit burns 3 hp/s (to the bar) | 3 s |
| Stink | **ACHOO!** it sneezes: every raised tentacle snaps under (a grab lets go), no new attack starts | 2 s, then immune 20 s ("Clothes-pegs!") |

#### 5.7.6 The checkpoint

Taken at the rise (session memory only, never saved): the plunder at that moment. If you sink during the fight, the
shipwreck screen's first button is **Try again from the Kraken** (`#kraken-retry-btn`, `Enter`): `startLevel(9, {
fromKraken: true })` flies in briefly (any key skips), with a full hull and crew, loads refilled, the plunder from the
rise, no waves, and the Kraken rising at once at full 600 hp (the short rise: 3 s). `state.goldAtLevelStart` keeps the
level's own start, so the plunder from before the rise is banked when the Kraken is driven off (and never banked if the
child leaves). "Try again" (the whole level) and "Main menu" stay.

### 5.8 The Kraken's targets in main.js (the seam)

`kraken.targets()` → `[{ id, kind: 'head' | 'eye' | 'tentacle', x, z, r, y0, y1, hp }]` (raised parts only). main wraps
each as a **pseudo-ship** `{ pseudo: true, part: id, x, z, h: 0, speed: 0, hp, type: { len: 2r, wid: 2r, name: 'The
Kraken' } }` in `targetsFor(side)`, which `aimTarget`, `inArc`, `playerFire`, the FIRE! light, the minimap and the
portrait framing (§0.3) read, so a child's guns aim at the Kraken and the Fire button glows exactly as it does for a
ship.

- **`hp`** is `part.hp > 0 ? part.hp : 0`, so `fighting()` (`e.hp > 0 && …`) is true for a raised part and `inArc` /
  `aimTarget` don't skip it.
- **One wrapper per part id per rise**, cached and updated in place each step (never rebuilt per call): the volley's
  per-target sums (`volleyTarget`, a `Map` keyed by target) need a stable identity.
- `rakeCue` returns null for a pseudo target, and `ballHit` gives `shotResult` a target square to the ball's flight
  (`h` = the ball's heading + π/2, `along` 0), so its aspect is always beam: no rake ×, no rake crit bonus, no RAKE!.
- `hitsShip(b, t)` for a pseudo target asks `kraken.hits(t.part, b.x, b.y, b.z)`.
- `damage(t, …, info)` for a pseudo target calls `kraken.hit(t.part, info)` → `{ dmg, word }`, pops the word, sums
  `dmg` into the volley's HIT marker and **returns at once**: no `hullHit` (no holes on a mesh it doesn't have), no
  feats, no hit flash, no audio `'hit'`, no `checkSurrender`.
- `separateShips`, tags, crew pips and boarding ignore pseudo targets. The boss bar shows `kraken.bar` → `{ name, frac,
  notches: [0.667, 0.333] }`.

### 5.9 Difficulty order and the balance guards (checked by bots)

- **Within Voyage III:** expected damage taken rises L7 < L8 < L9 on the **late-game profile** (shipyard guns 1, shot 2,
  crew 2, hull 2, sails 1, carpenter 1, rudder 1; tavern boarders 1, cutlass 1, gunner 1; all three recipes; Windmill 1).
  Starting targets (bot medians): L7 ≈ 70, L8 ≈ 100, L9 ≈ 170 with the Kraken fight 120–180 s of simulated time.
  These, and the order L7 < L8 < L9, are **offline Stage 3 medians** over 24 seeds (§13.3, recorded in §19); single CI
  runs aren't deterministic (aim spread and lava scatter use `Math.random`), so CI asserts only the one-sided guards of
  §13.2.
- **Never required:** every L7–L9 is cleared by bot v3 with **0 special loads** (recipes not owned) within two tries.
- **Voyages I and II not flattened:** the Act I bot (smoke) and the Act II bot (levels) are re-run with every recipe owned
  and the Windmill at tier 3, using specials; "Volcano > Europe" and "Maelstrom > Doubloon Bay" must still hold (Stage 3
  checks it offline; the opt-in `npm run test:balance` re-runs it, §13.2).
- The order is promised within each voyage (SPEC2 ACT-2), not across voyages.
- **Tuning knobs, in order:** `maxAttackers`, `lead`, `spreadMul`, the hazard timers, `KRAKEN` hp/timers, `LOADS.base`,
  status durations, then wave composition. Waves stay at ≤ 3 ships and ≤ 4 alive at once (no draw-call room, SPEC2 §17).

---------------------------------------------------------------------------------------------------

## 6. Battle UI and controls

### 6.1 Keys (checked against every existing binding: `4`–`6` and `H` are free in battle; nothing else changes)

| Where | Key | Action |
|---|---|---|
| Battle | **4 / 5 / 6** | pick Fire / Frost / Stink (`e.code` `Digit4..6`, `Numpad4..6`, read by main's `ammoKey` regex widened from `[123]` to `[1-6]`; `KEYMAP`, the steering map, is not touched; `e.repeat` ignored). Not owned: hint "Buy Fire shot at the Salty Sparrow" (or "Frost shot goes on sale after Frostbite Straits"); no loads: "No Frost shot left this level" |
| Battle | **R** | cycles round → chain → grape → fire → frost → stink, skipping locked ammo and specials with no loads |
| Battle | **1 / 2 / 3** | unchanged |
| Battle, grabbed by the Kraken | **G** | 3 presses, or held 0.8 s: cut the tentacle (the raider-cut code path) |
| Battle, the rise | any key | skips the rise (like the level fly-in) |
| Battle, the Kraken fight | **G** with nothing grabbing you | hint "You can't board a sea monster!" |
| Town | **E** at the Riddle Bell or Builder Bess | opens the quiz / the build panel (TOWN-1 rules unchanged) |
| Quiz panel, a question showing | **1–4** (`Digit1..4`, `Numpad1..4`) | answer (letter keys are never used: A and D walk) |
| Quiz panel | **Enter** / **H** / **Esc** | Next ▶ / Lifebuoy hint / leave to the map (Esc on the map: back to town) |
| Build panel | **← / →** on the tabs, **Enter / Space** on a row's button, **Esc** | Homes / Amenities, build, back to town |
| Everywhere outside play | held **Enter / Space** | one press is one click (A11Y-2), including the quiz's Next and answers and the Build buttons |

Help texts: the title and pause `.controls` lists gain "<kbd>4</kbd>–<kbd>6</kbd> special ammo"; touch help gains
"Slide on ◀ ▶ for gentle turns".

### 6.2 Touch layout (battle)

```
.touch  grid-template-areas: "sail . act"        (unchanged)
                             "steer . fire";
.pad.act  [ Ammo ]  [ ⚓ Board ]                   (unchanged: no third button)
#ammo-tray   (opens from Ammo once a recipe is owned; ABOVE .pad.act, right-aligned with it)
.pad.left    [ ◀ ][ ▶ ] + #steer-needle            or  #touch-wheel  (Pause ▸ Steering: Ship's wheel)
```

(The steering pad is `.pad.left`, grid area `steer`; the fire pad, `.pad.right`, sits directly under the act pad, so
the tray can't go under it.)

- **Ammo pill:** with no recipe owned it cycles exactly as today (existing tests unchanged). Once a recipe is owned, a tap
  opens **`#ammo-tray`** (`role="group"`, `aria-label="Choose ammo"`): six round buttons (`button[data-ammo]`, each
  icon + name + loads: "Fire ×4"; specials not owned or empty are `aria-disabled` with the reason as their description and
  a crossed icon; the loaded one is `aria-pressed="true"`). **2 columns × 3 rows in portrait, 3 × 2 in landscape**,
  **above** the act pad: the tray's right edge on the act pad's right edge, its bottom 8 px above the act pad's top. It
  may cover the minimap while open (the minimap is not a control). Picking, any fire tap, a tap elsewhere or 3 s idle
  closes it; the game keeps running. The pill always shows the loaded ammo's icon, name and count.
- **Placements** (button size, gap; the F01 probe measures them):

  | Size | Grid | Buttons | Notes |
  |---|---|---|---|
  | 568×320, 640×360 (short landscape) | 3 × 2 | 44 px, 6 px gap (144 × 94 px) | covers the lower part of the top-right minimap |
  | 844×390 | 3 × 2 | 52 px where it clears the top HUD row, else 44 px | as above |
  | 320×480, 360×480 (small portrait) | 2 × 3 | 44 px, 6 px gap (94 × 144 px) | between the minimap and the act pad |
  | 360×640, 390×844, 1024×600, 1280×720 | 2 × 3 portrait / 3 × 2 landscape | 52 px | — |

- **The hint bubble while the tray is open** moves clear of it (`#hud:has(#ammo-tray:not(.hidden)) .hint-bubble`: raised
  above the tray's top in portrait, narrowed to end left of the tray in landscape), and returns when the tray closes.
- **Layout rule:** at every F01 size (320×480, 360×480, 360×640, 390×844, 568×320, 640×360, 844×390, 1024×600,
  1280×720 touch) with the tray **open**, no tray button overlaps the fire pad, the steering pad, the sail pad, the act
  pad, the hint bubble or the gun card, and every button is ≥ 44 px (52 px where it fits).
- **Board pill** gains the states "Hot!" (a burning target, or a fire ship that hasn't struck), "Cut!" (a Kraken grab) and "—" (nothing to board during the
  Kraken fight); the ram warning is on the shark's tag, not on the pill.
- **Steering:** §3.2. The slide needs no new control; the wheel replaces ◀ ▶ only when chosen in the pause dialog.

### 6.3 HUD additions (ids created in Stage 0, hidden)

| Element | Where | Content / rules |
|---|---|---|
| `#ammo-count` | inside `#gun-ammo` after `#ammo-name` | "×4" for a special (empty for round/chain/grape); below 640 px the cell is icon + count only; never widens `.hud-top` |
| `#ammo-tray` | §6.2 | touch only |
| `#steer-needle`, `#touch-wheel` | in `.pad.left` (the steering pad) | touch only, `aria-hidden` |
| `#boss-notches` | inside `#boss` | 2 notch marks at 66.7 % and 33.3 % (the Kraken); hidden for other bosses |
| `#boss-status` | inside `#boss`, left of the name | the boss's status badge (shape + word: "FROZEN"), hidden when none |
| `#grab-strip` (`aria-hidden`) | top centre, under `#boss` | "GRABBED! Hold G to cut it loose" (touch: "Hold CUT! to cut it loose") and a 4 s release bar |
| `#edge-arrow` (`aria-hidden`) | at the screen edge the rogue wave comes from | a teal arrow with "WAVE!" for the warning time |
| `#kraken-retry-btn` | first button of the shipwreck panel, only after a Kraken checkpoint | "Try again from the Kraken" |
| `#steer-mode-btn` | pause dialog, last in `#pause-choices`; touch layouts only (`.touch-only`; display none elsewhere, so the desktop pause Tab-order checks don't change) **and only when `WITH_KRAKEN`** (hidden until go-live, so Stage 2's "no test edits" holds; at go-live the touch pause checks change by row K4) | "Steering: ◀ ▶ buttons" / "Steering: Ship's wheel", `aria-pressed`, a "New!" badge once (inside the button) |
| `#game-live` | as today | + statuses, IMMUNE!/KA-BOOM, out of ammo, crates, hazard and Kraken warnings (≤ one per 1.5 s, de-duplicated; Kraken warnings ≤ one per 3 s) |

Minimap (`drawMinimap`): the Kraken's shadow (violet blob with an eye) and raised parts; tentacle warning rings (violet);
waterspouts (white swirls, forming ones dashed); the rogue wave (a teal line with an arrow); ink slicks (dark blobs);
mortar and ink-pot rings (orange / violet); powder crates (small orange diamonds); fleeing ships hollow.

### 6.4 Enemy tags — `src/tags.js`

- The **icon slot** (right of the name: hook / white flag / too hot) gains the **RAM** chevrons. Priority: white flag >
  RAM > the boarding hook of the current target > too hot (the fire ship that hasn't struck shows too hot). After the
  phone-battle fix lands, its tag cues (chain / grape) join this list at the re-base (§0.3): still one icon per tag.
- A new **status badge** sprite at the left end of the hull bar (snowflake, flame or stink cloud from the same atlas; one
  per tag when shown: +1 draw per tag that shows one) with a **ring of 8 time dots** drawn in the existing pip
  InstancedMesh (`PER_TAG` = 10 pips + 3 today, so 21 per tag: capacity 12 tags × 21 = 252 instances; still 1 draw call
  for every pip and dot of the fleet).
- Tags read `ship.status` (`{ id, t, max, immune }` from `newStatus()`; **`status.id == null` means no status**, no
  badge) and `ship.tagIcon` (`'ram'` added).

### 6.5 One-time tips (`pirates-ahoy-tips` widened to 0..65535)

The first-voyage tutorial and bits 1–128 are unchanged. Tests that seed `'255'` still mean "every old tip seen". Bits
256–16384 can't fire in today's tests (they need a recipe or Voyage III). Bit **32768 does fire** in today's tests once
`WITH_KRAKEN` is true: `controls.cjs` opens the pause dialog on touch at five sizes. It is a badge inside
`#steer-mode-btn`, not a hint, so it adds no button and no bubble; the button itself is row K4 of §13.4. (Bit numbers are
re-based after the phone-battle fix, §0.3.)

| Bit | Trigger | Keyboard / touch text |
|---|---|---|
| 256 | first level start with Fire shot owned | "New: Fire shot burns for 6 s! Press <kbd>4</kbd>. You can't board a burning ship." / "…Tap Ammo." |
| 512 | first level start with Frost shot owned | "New: Frost shot slows ships down! Press <kbd>5</kbd>" / "…Tap Ammo" |
| 1024 | first level start with Stink shot owned | "New: Stink shot! They can't move or shoot for 4 s. Press <kbd>6</kbd>" / "…Tap Ammo" |
| 2048 | first ram wind-up | "RAM! Turn away from her bow!" |
| 4096 | first forming waterspout | "Waterspout! Keep clear of the twister" |
| 8192 | first rogue-wave warning | "ROGUE WAVE! Turn your bow or stern to it" (the banner says it too) |
| 16384 | first Kraken grab | "GRABBED! Hold <kbd>G</kbd> to cut it loose" / "Hold CUT! to cut it loose" |
| 32768 | first pause dialog on touch | the "New!" badge on `#steer-mode-btn` (not a hint) |

### 6.6 Title, Victory and shipwreck screens

- Title: §5.2 (three voyage groups, 9 cards, the open card scrolled into view, migration). The tagline mentions the
  Kraken Seas **and keeps the words "Far Seas"**, as does the page's `meta description` (levels.cjs:432 checks both).
  No page scroll at any F01 size (the panel scrolls inside; Set sail! stays pinned, SPEC2 `menuPin`).
- `#act2-btn` text = `def.sailOn ?? 'Sail on to the Far Seas'`; shown after any finale with a next level.
- The Victory banner's small line = `def.victoryLine ?? (onward ? 'The Old World is yours' : 'The seas are yours')`.
- Every cleared level, finales included, pays the gift and the Market (§8.1). Their lines, "Villagers' gift +60" and
  "Market Hall +10% +85", go in the level-cleared summary (`#level-summary`) or, on a finale (L3, L6, L9: the Victory
  screen, which has no summary), in `#won-chest` above the banked line; L9's `#won-chest` also shows "The Kraken's Pearl
  +1,000".
- Shipwreck during the Kraken fight: `#kraken-retry-btn` first, then the usual buttons.

---------------------------------------------------------------------------------------------------

## 7. Ashore: Professor Barnacle's Riddle Bell (the quiz)

Rules and numbers in **`src/quiz.js`** (pure; takes the bank as an argument); questions in **`src/quizBank.js`** (pure
data); the panel in **`src/quizPanel.js`** (DOM, created by townMode; styles in `town.css`).

### 7.1 The place

A new place **`quiz`** on the lookout tower's raft (already walkable; no new deck): a brass **Riddle Bell** in a timber
frame, a chalkboard easel headed "QUIZ ★", two benches, and **Professor Barnacle** (old man, round spectacles,
mortarboard, long grey beard, a pointer) with **Quizzle**, his green-and-yellow macaw, on his shoulder. Places bar label
"Quiz" (bell icon); Harbour menu `#harbour-quiz-btn`. The panel view `'quiz'` frames the bell and the professor beside
the panel (`frameBeside`, like the tavern). The places bar now holds six buttons (place ids `shipyard`, `tailor`,
`tavern`, `quiz`, `builder`, `ship`; labels Shipyard, Tailor, Tavern, Quiz, Build, Set sail). Today's icon-only phone
buttons are 56 px wide with 6 px gaps (six ≈ 382 px), which fits neither 320 px portrait nor the ≈ 344 px between the
joystick and the action button at 568×320. So the bar's buttons become **44 × 44 px, icon-only, with a 4 px gap** below
760 px wide and on short landscape (`max-height: 560px`): 6 × 44 + 5 × 4 + 16 (padding and border) ≈ 300 px. Each keeps
its `aria-label` ("Walk to the quiz"). The compact rule applies only to the six-button bar (`withKraken`); the
four-button bar stays exactly as today. `ashore.cjs` probes the bar at the 7 town sizes (§13.2).

### 7.2 Quiz islands (`QUIZ_LEVELS`)

| # | Island | Band | Answers | Gold for the first ★ | Gold for each later new ★ | All 3 ★ |
|---|---|---|---|---|---|---|
| 1 | Shallow Shoals | 1 | 3 | 60 | 15 | 90 |
| 2 | Seagull Sands | 1 | 3 | 80 | 30 | 140 |
| 3 | Turtle Cove | 1 | 3 | 100 | 45 | 190 |
| 4 | Coral Corner | 2 | 3 | 120 | 60 | 240 |
| 5 | Puffin Point | 2 | 3 | 140 | 75 | 290 |
| 6 | Whale Way | 2 | 3 | 160 | 90 | 340 |
| 7 | Storm Cape | 3 | 4 | 180 | 105 | 390 |
| 8 | Kraken Quay | 3 | 4 | 200 | 120 | 440 |
| 9 | Professor's Peak | 3 | 4 | 220 | 135 | 490 |

- **A round is 5 questions**, one from each category, asked in a shuffled order: `sea` (ships, tides, oceans, sailing words,
  weather), `life` (sea life), `places` (the game's seas and real geography), `pirates` (child-safe history), `sums`
  (generated). 3 right = ★ (pass), 4 = ★★, 5 = ★★★. Island *n* + 1 opens when island *n* has a star (no battle gating:
  a child who prefers quizzing can play all nine).
- **Gold only for stars not earned before** (all 27 stars: **2,610**), plus a one-time **"Good try!" 10 gold** the first
  time each island's round is finished, whatever the score (90 in all). No other quiz gold, ever: replays reshuffle and pay
  nothing more, so the quiz can't be farmed. Total quiz gold: **2,700**. "Not earned before" means not yet **paid**: a
  star whose gold couldn't be saved stays owed and is paid once, later (§10.2).
- **Nothing bad happens:** no timer, no lives, all 5 questions every time, the round can be left at any time ("Your
  stars are safe"). A wrong answer: a soft marimba `bonk` (never a buzzer), Quizzle tilts his head, "Not quite! It's
  Eight.", a ✓ on the right answer, the fun fact. Under 3 right: "So close: 2 right! Have another go?"
- **Lifebuoy** (the Sea School, §8.1: 1 / 2 / 3 per round): removes one wrong answer (`H`).
- **Trophies** (cosmetics): **Professor's mortarboard** (hat; all 9 islands passed, feat `quiz ≥ 9`) and **Rainbow macaw**
  (pet; all 27 stars, feat `stars ≥ 27`). The captain's log shows the quiz progress.
- **Fairness:** a `places` question with `seas: n` is asked only once `state.unlocked ≥ n` (the child has reached that
  sea); a question answered is not asked again until 60 others have been (the `seen` list, §10.1); within a round no
  question repeats; the answer order comes from the round's seeded rng.

### 7.3 Screens (`#quiz-screen`, the tavern's parchment panel; side panel on wide screens, bottom sheet in portrait)

1. **Map:** nine islands on a dotted path (3 × 3 grid on phones), each a real button with name and "★★☆ 2 of 3 stars";
   locked ones `aria-disabled`, described "Pass Turtle Cove first". Focus starts on the highest open island.
2. **Question:** "Question 2 of 5", progress marks (✓ right, • wrong, ○ to come; shape, not colour), the question at
   ≥ 20 px (22 px when it fits), 3–4 full-width answer buttons **≥ 56 px tall** numbered 1–4, "Lifebuoy (2 left)" when the
   School gives any, **Leave quiz**.
3. **Answer:** right: Professor Barnacle rings the bell (`bell` "DING-DING"), Quizzle flaps and squawks "Right you are!",
   coins sparkle; not quite: as §7.2. The fact shows; **Next ▶** takes focus.
4. **Results:** the stars stamp in one by one (a fade under reduced motion), "+80 gold — new star!" flies to the chest;
   **Next quiz** (when one opens), **Play again**, **Map**.

Everything is announced in `#quiz-live` (polite): the question then "Answers: 1, Eight. 2, Six. 3, Ten."; then "Right!"
or "Not quite. The answer is Eight."; then the result. A held Enter never answers twice (A11Y-2).

### 7.4 The question bank — one line per question

```js
{ id: 'life-octopus-hearts', cat: 'life', band: 2, q: 'How many hearts does an octopus have?',
  right: 'Three', wrong: ['One', 'Two'], fact: 'Three hearts, and blue blood too!' },
```

Fields: `id` (unique, `cat-word`), `cat` ∈ `CATS = ['sea', 'life', 'places', 'pirates']`, `band` 1..3, `q`, `right`,
`wrong` (bands 1–2: ≥ 2; band 3: ≥ 3; the round picks the number its island needs with the seeded rng), `fact`, and for
`places` only `seas` (0 = real geography, else the level number whose sea must be reached). `validateBank(bank)` → `{ ok,
errors }` and a Node test check: unique ids; known `cat` and `band`; enough wrong answers; no empty or duplicate answers;
`right` not among `wrong`; `q` ≤ 90 characters, every answer ≤ 28, `fact` ≤ 120 (they fit a 320 px phone at the panel's
sizes); **≥ 10 questions per category per band** (120 at launch) and ≥ 4 `places` questions with `seas: 0` in each band.
British spelling throughout. Pirate history is kept child-safe: no executions, hangings, gore or cruelty; nothing a
parent would not read aloud.

### 7.5 Starter questions (72, checked; the Stage 1 quiz agent adds 48 more to the same rules)

Every line below passes `validateBank` (checked in Node while writing this spec: longest question 65 characters, answer
26, fact 84).

```js
// ---- sea: ships, tides, oceans, sailing words, weather
{ id: 'sea-port', cat: 'sea', band: 1, q: 'Facing the bow, the left side of a ship is called…', right: 'Port', wrong: ['Starboard', 'Stern'], fact: 'Port is left and starboard is right when you face the bow.' },
{ id: 'sea-bow', cat: 'sea', band: 1, q: 'What is the front of a ship called?', right: 'The bow', wrong: ['The stern', 'The deck'], fact: 'The bow is the front of a ship and the stern is the back.' },
{ id: 'sea-anchor', cat: 'sea', band: 1, q: 'What do sailors drop to stop their ship drifting away?', right: 'An anchor', wrong: ['A sail', 'A mast'], fact: 'An anchor digs into the sea bed and holds the ship in place.' },
{ id: 'sea-compass', cat: 'sea', band: 1, q: 'Which tool shows sailors which way is north?', right: 'A compass', wrong: ['A telescope', 'A bucket'], fact: 'A compass needle is a tiny magnet that turns to point north.' },
{ id: 'sea-biggest-ocean', cat: 'sea', band: 1, q: 'Which is the biggest ocean?', right: 'The Pacific', wrong: ['The Atlantic', 'The Indian'], fact: 'The Pacific is bigger than all the land on Earth put together!' },
{ id: 'sea-drink', cat: 'sea', band: 1, q: "Why can't sailors drink sea water?", right: "It's far too salty", wrong: ["It's too cold", "It's too blue"], fact: 'Salty water makes you thirstier, so ships carried fresh water in barrels.' },
{ id: 'sea-tides', cat: 'sea', band: 2, q: "What pulls the sea's tides in and out?", right: 'The Moon', wrong: ['The wind', 'Big whales'], fact: "The Moon's pull makes the sea rise and fall about twice a day." },
{ id: 'sea-crows-nest', cat: 'sea', band: 2, q: 'What is the lookout platform high up a mast called?', right: "The crow's nest", wrong: ["The gull's perch", "The eagle's eye"], fact: "From the crow's nest a lookout can see much further across the sea." },
{ id: 'sea-galley', cat: 'sea', band: 2, q: "What is a ship's kitchen called?", right: 'The galley', wrong: ['The pantry', 'The hold'], fact: "A ship's cook had to stop the pots sliding about in big waves." },
{ id: 'sea-knots', cat: 'sea', band: 2, q: "Sailors measure a ship's speed in…", right: 'Knots', wrong: ['Fathoms', 'Leagues'], fact: 'Sailors once counted knots on a rope let out behind the ship to measure speed.' },
{ id: 'sea-fathom', cat: 'sea', band: 2, q: 'A fathom measures how deep the water is. About how long is one?', right: 'About 2 metres', wrong: ['About 20 metres', 'About 2 centimetres'], fact: "A fathom is six feet: about the stretch of a sailor's arms." },
{ id: 'sea-equator', cat: 'sea', band: 2, q: 'What is the imaginary line round the middle of the Earth?', right: 'The Equator', wrong: ['The Horizon', 'The Pole Line'], fact: 'Sailors crossing the Equator for the first time often had a fun ceremony.' },
{ id: 'sea-five-oceans', cat: 'sea', band: 3, q: 'How many oceans are there on Earth?', right: 'Five', wrong: ['Three', 'Seven', 'Ten'], fact: 'They are the Pacific, Atlantic, Indian, Southern and Arctic Oceans.' },
{ id: 'sea-trench', cat: 'sea', band: 3, q: 'What is the deepest part of all the oceans?', right: 'The Mariana Trench', wrong: ['The Bermuda Triangle', 'The Great Barrier Reef', 'The Dead Sea'], fact: 'The Mariana Trench in the Pacific is about 11 kilometres deep.' },
{ id: 'sea-tsunami', cat: 'sea', band: 3, q: 'A giant wave caused by an undersea earthquake is called a…', right: 'Tsunami', wrong: ['Typhoon', 'Tornado', 'Monsoon'], fact: 'Out at sea a tsunami can be small. It grows huge as it reaches shallow water.' },
{ id: 'sea-waterspout', cat: 'sea', band: 3, q: 'A whirling column of wind and spray over the sea is a…', right: 'Waterspout', wrong: ['Whirlpool', 'Geyser', 'Rogue wave'], fact: 'A waterspout is like a tornado over water. Sailors steer well clear!' },
{ id: 'sea-lighthouse', cat: 'sea', band: 3, q: 'At night, how can sailors tell one lighthouse from another?', right: 'Each flashes its own way', wrong: ['They are different colours', 'They ring different bells', 'They are all the same'], fact: "Each lighthouse has its own pattern of flashes, written on sailors' charts." },
{ id: 'sea-harrison', cat: 'sea', band: 3, q: "John Harrison's famous sea clock helped sailors work out…", right: 'How far east or west', wrong: ['How deep the sea is', 'When the tide turns', 'Where the fish are'], fact: "Comparing the ship's clock with the Sun showed how far east or west they had sailed." },
// ---- life: sea life
{ id: 'life-octopus-arms', cat: 'life', band: 1, q: 'How many arms does an octopus have?', right: 'Eight', wrong: ['Six', 'Ten'], fact: 'Octopuses can taste things with the suckers on their arms!' },
{ id: 'life-dolphin', cat: 'life', band: 1, q: 'Which of these is a mammal that breathes air?', right: 'A dolphin', wrong: ['A shark', 'A tuna'], fact: 'Dolphins come up to breathe through a blowhole on top of their heads.' },
{ id: 'life-starfish', cat: 'life', band: 1, q: 'How many arms do most starfish have?', right: 'Five', wrong: ['Three', 'Eight'], fact: 'If a starfish loses an arm, it can grow a new one.' },
{ id: 'life-crab', cat: 'life', band: 1, q: 'Which way do crabs usually walk?', right: 'Sideways', wrong: ['Hopping', 'On tiptoe'], fact: "A crab's legs bend best to the side, so sideways is quickest." },
{ id: 'life-penguin', cat: 'life', band: 1, q: "Which bird can't fly but swims really well?", right: 'A penguin', wrong: ['A seagull', 'A puffin'], fact: 'Penguins use their flippers like wings to "fly" under the water.' },
{ id: 'life-blue-whale', cat: 'life', band: 1, q: 'Which is the biggest animal in the sea?', right: 'The blue whale', wrong: ['The great white shark', 'The giant squid'], fact: "A blue whale's heart is about as big as a small car." },
{ id: 'life-octopus-hearts', cat: 'life', band: 2, q: 'How many hearts does an octopus have?', right: 'Three', wrong: ['One', 'Two'], fact: 'Three hearts, and blue blood too!' },
{ id: 'life-seahorse', cat: 'life', band: 2, q: 'Which seahorse parent carries the babies?', right: 'The dad', wrong: ['The mum', 'The grandma'], fact: 'The father seahorse keeps the eggs in a pouch until the babies hatch.' },
{ id: 'life-turtle-nest', cat: 'life', band: 2, q: 'Where do sea turtles lay their eggs?', right: 'On sandy beaches', wrong: ['In seaweed', 'On icebergs'], fact: 'The mother turtle digs a nest in the sand, then swims back to sea.' },
{ id: 'life-shark-skeleton', cat: 'life', band: 2, q: "A shark's skeleton is made of…", right: 'Cartilage', wrong: ['Bone', 'Shell'], fact: 'Cartilage is the bendy stuff in your nose and ears.' },
{ id: 'life-puffin', cat: 'life', band: 2, q: 'Which seabird has a bright stripy beak and dives for fish?', right: 'The puffin', wrong: ['The penguin', 'The pelican'], fact: 'A puffin can carry ten or more little fish in its beak at once.' },
{ id: 'life-coral', cat: 'life', band: 2, q: 'Coral reefs are built by tiny…', right: 'Animals', wrong: ['Plants', 'Pebbles'], fact: 'Coral is made by tiny animals called polyps that build stony homes.' },
{ id: 'life-largest-ever', cat: 'life', band: 3, q: 'The largest animal known ever to have lived is the…', right: 'Blue whale', wrong: ['Great white shark', 'Giant squid', 'T. rex'], fact: 'A blue whale can be longer than two buses end to end.' },
{ id: 'life-whale-shark', cat: 'life', band: 3, q: 'What is the biggest fish in the sea?', right: 'The whale shark', wrong: ['The blue whale', 'The great white shark', 'The sunfish'], fact: 'A blue whale is not a fish! The gentle whale shark eats tiny plankton.' },
{ id: 'life-jellyfish', cat: 'life', band: 3, q: 'Which of these sea creatures has no brain?', right: 'The jellyfish', wrong: ['The dolphin', 'The octopus', 'The shark'], fact: 'Jellyfish have drifted in the oceans for hundreds of millions of years.' },
{ id: 'life-narwhal', cat: 'life', band: 3, q: 'Which whale has a long spiral tusk?', right: 'The narwhal', wrong: ['The orca', 'The humpback', 'The beluga'], fact: "The narwhal's tusk is really a very long tooth." },
{ id: 'life-orca', cat: 'life', band: 3, q: 'The orca is the biggest member of which animal family?', right: 'Dolphins', wrong: ['Sharks', 'Seals', 'Penguins'], fact: 'Orcas live and hunt together in family groups called pods.' },
{ id: 'life-squid-ink', cat: 'life', band: 3, q: 'Why do squid and octopuses squirt ink?', right: 'To hide and escape', wrong: ['To write messages', 'To paint the rocks', 'To glow in the dark'], fact: 'A cloud of ink confuses a hungry hunter while the squid jets away.' },
// ---- places: the game's seas and real geography (seas: the level that must be reached first)
{ id: 'places-island', cat: 'places', band: 1, q: 'What do we call land with water all around it?', right: 'An island', wrong: ['A valley', 'A forest'], fact: "Sparrow's Floating Island is built on rafts, barrels and stilts!", seas: 0 },
{ id: 'places-volcano', cat: 'places', band: 1, q: 'What pours out of an erupting volcano?', right: 'Lava', wrong: ['Lemonade', 'Snow'], fact: 'Lava is melted rock. When it cools it hardens into new land.', seas: 3 },
{ id: 'places-polar-bear', cat: 'places', band: 1, q: 'Which animal lives on the Arctic sea ice?', right: 'The polar bear', wrong: ['The penguin', 'The camel'], fact: 'Polar bears live in the far north and penguins in the far south.', seas: 0 },
{ id: 'places-icebergs', cat: 'places', band: 1, q: 'Where would you find icebergs?', right: 'In cold seas', wrong: ['In hot deserts', 'In rainforests'], fact: 'Icebergs are giant chunks of ice that broke off glaciers into the sea.', seas: 0 },
{ id: 'places-bali', cat: 'places', band: 1, q: 'Bali is an island in which country?', right: 'Indonesia', wrong: ['Japan', 'Brazil'], fact: 'Indonesia is made of more than 17,000 islands!', seas: 2 },
{ id: 'places-europe', cat: 'places', band: 1, q: 'Spain, France and Norway are all countries in…', right: 'Europe', wrong: ['Africa', 'Australia'], fact: 'Europe has a long, twisty coast with many harbours and lighthouses.', seas: 1 },
{ id: 'places-fjords', cat: 'places', band: 2, q: "Norway's long, narrow sea inlets between cliffs are called…", right: 'Fjords', wrong: ['Canals', 'Lagoons'], fact: 'Fjords were carved out by giant glaciers long ago.', seas: 5 },
{ id: 'places-vikings', cat: 'places', band: 2, q: 'The Vikings came from which part of Europe?', right: 'Scandinavia', wrong: ['Italy', 'Greece'], fact: 'Viking longships were long, low and fast, with shields along each side.', seas: 5 },
{ id: 'places-ring-of-fire', cat: 'places', band: 2, q: 'The Ring of Fire is a ring of volcanoes around which ocean?', right: 'The Pacific', wrong: ['The Atlantic', 'The Arctic'], fact: "Most of the world's volcanoes are around the Pacific Ocean.", seas: 3 },
{ id: 'places-doubloon', cat: 'places', band: 2, q: 'What was a doubloon?', right: 'A gold coin', wrong: ['A pirate hat', 'A kind of boat'], fact: 'Doubloons were gold coins made in Spain and its lands long ago.', seas: 4 },
{ id: 'places-terraces', cat: 'places', band: 2, q: 'On Bali, rice grows on steps cut into the hills. They are called…', right: 'Terraces', wrong: ['Ladders', 'Towers'], fact: 'Water trickles down the rice terraces from one step to the next.', seas: 2 },
{ id: 'places-equator-hot', cat: 'places', band: 2, q: 'Where is it usually hottest?', right: 'Near the Equator', wrong: ['Near the North Pole', 'Near the South Pole'], fact: 'The Sun shines most directly on the lands near the Equator.', seas: 0 },
{ id: 'places-good-hope', cat: 'places', band: 3, q: 'The Cape of Good Hope, once called the Cape of Storms, is in…', right: 'Africa', wrong: ['South America', 'Australia', 'Asia'], fact: 'Sailors called it the Cape of Storms because of its huge waves and winds.', seas: 8 },
{ id: 'places-cape-horn', cat: 'places', band: 3, q: 'Cape Horn is at the very southern tip of…', right: 'South America', wrong: ['Africa', 'Australia', 'Asia'], fact: 'Cape Horn has some of the roughest seas in the world.', seas: 8 },
{ id: 'places-maelstrom', cat: 'places', band: 3, q: 'A real maelstrom, a famous whirlpool, swirls off the coast of…', right: 'Norway', wrong: ['Spain', 'Egypt', 'India'], fact: "The Moskstraumen near Norway's Lofoten Islands is one of the strongest whirlpools.", seas: 6 },
{ id: 'places-atoll', cat: 'places', band: 3, q: 'A ring-shaped coral island round a lagoon is called an…', right: 'Atoll', wrong: ['Archipelago', 'Isthmus', 'Estuary'], fact: 'Atolls grow on old volcanoes that slowly sank beneath the sea.', seas: 7 },
{ id: 'places-iceland', cat: 'places', band: 3, q: 'Which country is famous for its volcanoes AND its glaciers?', right: 'Iceland', wrong: ['Egypt', 'Brazil', 'Kenya'], fact: 'Iceland is sometimes called the land of fire and ice.', seas: 3 },
{ id: 'places-komodo', cat: 'places', band: 3, q: 'Which giant lizards live on islands near Bali?', right: 'Komodo dragons', wrong: ['Iguanas', 'Chameleons', 'Gila monsters'], fact: 'Komodo dragons can grow up to about three metres long.', seas: 2 },
// ---- pirates: history (child-safe)
{ id: 'pirates-jolly-roger', cat: 'pirates', band: 1, q: 'What is the famous pirate flag with a skull called?', right: 'The Jolly Roger', wrong: ['The Happy Harry', 'The Grinning Gus'], fact: 'Pirates flew it so other ships would give up without a fight.' },
{ id: 'pirates-ahoy', cat: 'pirates', band: 1, q: "Sailors shout 'Ahoy!' to mean…", right: 'Hello there!', wrong: ['Goodbye!', 'Lunchtime!'], fact: "'Ahoy!' is an old sailors' call to greet another ship." },
{ id: 'pirates-captain', cat: 'pirates', band: 1, q: 'Who is in charge of a pirate ship?', right: 'The captain', wrong: ['The cook', 'The parrot'], fact: 'Many pirate crews voted for their captain, and could vote for a new one!' },
{ id: 'pirates-x', cat: 'pirates', band: 1, q: 'On a treasure map, X marks…', right: 'The spot', wrong: ['The exit', 'The kitchen'], fact: 'Maps of buried treasure are mostly from stories, like Treasure Island.' },
{ id: 'pirates-spyglass', cat: 'pirates', band: 1, q: 'What did pirates look through to see faraway ships?', right: 'A spyglass', wrong: ['A teacup', 'A barrel'], fact: 'A spyglass is a small telescope that slides shut to fit in a pocket.' },
{ id: 'pirates-treasure', cat: 'pirates', band: 1, q: 'Real pirates most often took ships full of…', right: 'Food, cloth and tools', wrong: ['Toys', 'Ice cream'], fact: 'Chests of gold were rare. Food, cloth, tools and medicine were common prizes.' },
{ id: 'pirates-blackbeard-ship', cat: 'pirates', band: 2, q: "What was Blackbeard's ship called?", right: "Queen Anne's Revenge", wrong: ['The Black Pearl', 'The Sea Biscuit'], fact: 'Blackbeard sometimes tucked smoking fuses under his hat to look scary.' },
{ id: 'pirates-pieces-of-eight', cat: 'pirates', band: 2, q: 'What was a piece of eight?', right: 'A silver coin', wrong: ['A slice of cake', 'A small cannon'], fact: 'It was a Spanish silver coin worth eight reales.' },
{ id: 'pirates-stevenson', cat: 'pirates', band: 2, q: 'Who wrote the pirate story Treasure Island?', right: 'Robert Louis Stevenson', wrong: ['Charles Dickens', 'Roald Dahl'], fact: 'Treasure Island gave us Long John Silver and his parrot, Captain Flint.' },
{ id: 'pirates-golden-age', cat: 'pirates', band: 2, q: "The 'Golden Age of Piracy' was about how long ago?", right: 'About 300 years ago', wrong: ['About 30 years ago', 'About 3,000 years ago'], fact: 'It lasted from about 1650 to 1730.' },
{ id: 'pirates-bonny-read', cat: 'pirates', band: 2, q: 'Anne Bonny and Mary Read were famous…', right: 'Pirates', wrong: ['Ship cooks', 'Mermaids'], fact: 'They sailed with Calico Jack around 1720.' },
{ id: 'pirates-biscuit', cat: 'pirates', band: 2, q: 'What was the hard, dry bread sailors ate at sea?', right: "Ship's biscuit", wrong: ['Doughnuts', 'Pancakes'], fact: "Ship's biscuit kept for months: that's how our ship got her name!" },
{ id: 'pirates-stinkpots', cat: 'pirates', band: 3, q: 'Clay pots of smelly smoke thrown onto enemy decks were called…', right: 'Stinkpots', wrong: ['Pongjars', 'Fumeballs', 'Smellbombs'], fact: 'Sailors really did throw stinkpots: the smelly smoke made it hard to fight.' },
{ id: 'pirates-teach', cat: 'pirates', band: 3, q: "Blackbeard's real name is usually given as…", right: 'Edward Teach', wrong: ['Henry Morgan', 'Francis Drake', 'William Kidd'], fact: 'Old records spell it Teach or Thatch. Nobody is quite sure!' },
{ id: 'pirates-privateer', cat: 'pirates', band: 3, q: 'A captain allowed by a king or queen to attack enemy ships was a…', right: 'Privateer', wrong: ['Lighthouse keeper', 'Harbour master', 'Shipwright'], fact: 'Privateers carried a letter of marque: written permission to attack enemy ships.' },
{ id: 'pirates-drake', cat: 'pirates', band: 3, q: 'Which English captain sailed right round the world in the 1500s?', right: 'Francis Drake', wrong: ['Blackbeard', 'Calico Jack', 'Henry Morgan'], fact: 'His ship, the Golden Hind, sailed round the world from 1577 to 1580.' },
{ id: 'pirates-cutlass', cat: 'pirates', band: 3, q: "A pirate's short, curved sword is called a…", right: 'Cutlass', wrong: ['Rapier', 'Lance', 'Trident'], fact: 'A cutlass was short enough to swing between masts and ropes.' },
{ id: 'pirates-articles', cat: 'pirates', band: 3, q: 'Pirate crews wrote down their own rules. What were they called?', right: 'Articles', wrong: ['Logbooks', 'Recipes', 'Sea shanties'], fact: 'Every pirate signed the articles, which said how the treasure was shared.' },
```

The Stage 1 quiz agent also brings `places` to ≥ 4 questions with `seas: 0` in bands 1, 2 and 3 (today 3, 1 and 0), writes
each fact from well-known sources, and keeps the tone kind; the Stage 4 review reads every question.

### 7.6 Generated sums (`sumQuestion(band, rng)`)

| Band | Kinds | Example | Wrong answers |
|---|---|---|---|
| 1 | add and take away within 20 (never below 0) | "You have 7 coins and find 5 more. How many now?" (12) | 2 picked from right ±1, ±2 |
| 2 | add and take away within 100; ×2, ×5, ×10 | "3 chests hold 10 coins each. How many coins?" (30) | 2 from ±1, ±2, ±10 |
| 3 | times tables to 10 × 10; exact sharing | "48 coins shared by 6 pirates. How many each?" (8) | 3 from ±1, ±2, ±10, a swapped-digit number |

Wrong answers are distinct, never the right one, never negative, never 0 for a sharing sum. Themes rotate through coins,
gulls, barrels, cannonballs and parrots.

---------------------------------------------------------------------------------------------------

## 8. Ashore: building up Sparrow's Floating Island

Rules and numbers in **`src/island.js`** (pure); the art and villagers in `src/env/sparrow.js`; the panel in
**`src/buildPanel.js`** (DOM, created by townMode).

### 8.1 Plots (`PLOTS`) — fixed, on today's shack platforms, none walkable

| id | Name | Platform (scenery today) | Kind | Tier 1 / 2 / 3 | Price per tier | Perk at tier 1 / 2 / 3 | Max height (tier 3) |
|---|---|---|---|---|---|---|---|
| `homeA` | Tavern Row | `s16` (−17.6, −17.4) | home | Cottage / Townhouse / Manor | 100 / 250 / 500 | 2 / 4 / 6 villagers | 7 u |
| `homeB` | Lagoon End | `s3` (−0.5, −29.5) | home | same | same | same | 7 u |
| `homeC` | Tailor's Lane | `s2` (13.4, −23.2) | home | same | same | same | 7 u |
| `homeD` | Yard Corner | `s7` (21.5, −22.5) | home | same | same | same | 7 u |
| `bakery` | Biscuit Bakery | `s8` (−24, −9) | amenity | Bread oven / Bakery / Bakery & café | 200 / 450 / 800 | reinforcements patch **45 / 55 / 65 %** of the hull (today 35 %) | 7 u |
| `windmill` | Powder Windmill | `s6` (−26, −26) | amenity | Post mill / Stone mill / Powder mill | 250 / 500 / 900 | **+1 / +2 / +3 loads** of each special at every level start | 10 u (sails) |
| `lighthouse` | Lighthouse | `s18` (35, −12.5) | amenity | Beacon / Tower / Great light | 200 / 450 / 800 | every hazard warning **+0.3 / +0.6 / +0.9 s** (lava, lightning, geysers, mortar shells, ink pots, forming spouts, rogue waves, Kraken attacks) | 12 u |
| `market` | Market Hall | `s15` (−31, −16) | amenity | Stalls / Market hall / Grand bazaar | 250 / 500 / 900 | **+5 / +10 / +15 %** of a cleared level's banked gold, at most 300 a level | 8 u |
| `school` | Sea School | `s13` (−21.5, 2.0) | amenity | Schoolroom / Bell tower / Academy | 150 / 350 / 600 | **1 / 2 / 3 lifebuoy hints** per quiz round | 8 u |
| `park` | Flower Park | `s14` (−29, −4.5) | amenity | Flower beds / Fountain / Bandstand | 150 / 350 / 600 | villagers' gift **+25 / +50 / +100 %** | 5 u |

- **Totals:** homes 3,400; amenities 8,400; the island **11,800** (a Node test sums the table). The first cottage costs
  100, so the very first visit after level 1 already changes the island.
- **Villagers' gift:** each cleared level, finales included, banks `5 × villagers × parkMul` gold (a line on the
  level-cleared card, or in `#won-chest` on a finale, §6.6), at most **240** a level. Villagers: 2 / 4 / 6 per home
  tier, 24 in all.
- **Gift and Market in `finishLevel`:** after the loot sweep, the bonuses and the Pearl, `base = state.gold −
  goldAtLevelStart`; `market = market(island, base)` (≤ 300) and `gift = gift(island)` (≤ 240) are added to
  `state.gold`, then the level's gold is banked as today.
- **Town rank** (`RANKS`, tiers built of 30): Hamlet 0–4, Village 5–11, Town 12–19, Harbour Town 20–29, **Pirate
  Capital** 30 (wins the **Governor's coat** trophy). Shown in the panel header and painted on a plaque under the
  welcome sign.
- **Every perk is visible:** the reinforcements banner says "Your crew patches 55% of the hull"; the Ammo cell shows the
  extra loads; the rings simply last longer; the gift and Market lines show on the level-cleared card; the quiz shows
  "Lifebuoy (2 left)". No perk changes a battle more than these numbers.
- **Readable and stable:** plots are fixed and each has one owner; the town's walk data changes **once** (Stage 1: the
  two new places and their props) and **never with tiers**: each plot's tier-3 envelope (its platform's footprint × max
  height) is a `walk.camBlockers` box from tier 0, and no plot is walkable. A fresh save's buildings look as today
  (tier 0 = today's shack, plus a small painted "Build me!" board baked into the statics). **Accepted cost:** those
  envelopes (up to 12 u tall over a ≈ 2.5 u shack) are camera blockers from tier 0, so the walk camera's boom pulls in
  near a plot as if the tier-3 building stood there; walk-camera views near plots differ from today's even at tier 0.
  Tier-0 comparisons with today therefore use the shipyard showcase poses and fixed town showcase views (the camera
  placed directly, not the walk boom). From every shipyard showcase pose no tier-3 envelope may cover the docked ship
  (a ray probe, §13.2).

### 8.2 What each building looks like (each tier adds to the last)

- **Homes:** a cottage with a wavy roof in the town's pastels and window boxes → a second storey with a balcony → a
  turret and a fish weathervane. Lit windows and chimney smoke for villagers "at home". The platform's laundry line and
  porch folk stay.
- **Biscuit Bakery:** half-timbered with a giant biscuit sign and warm chimney smoke → an awning and tables → a café
  terrace and a pretzel weathervane.
- **Powder Windmill:** a post mill with turning sails → a stone base → a powder shed puffing blue, orange and green smoke
  (the specials' colours).
- **Lighthouse:** a wooden beacon → a red-and-white tower → a tall tower whose soft beam (additive, ≤ 0.25 opacity) turns
  at 0.6 rad/s and never flashes.
- **Market Hall:** two stalls → a canvas hall → a clock tower.
- **Sea School:** a blue schoolroom with a bell cupola → a bell tower → a telescope dome.
- **Flower Park:** flower beds → a fountain → a bandstand and a topiary sea serpent.

**Art budget:** all built plots bake into one **development layer** (vertex colours, one mesh per ink weight, ≤ 3
meshes = **≤ 6 draw calls** with the outline pass drawing each outlined mesh twice), rebaked on a purchase (≤ 40 ms,
hidden behind the dust puff) and at `openDock`; animated parts stay separate
(windmill sails, the lighthouse beam, the fountain, the powder smoke: ≤ 6). Today's shacks on the ten plot platforms move
out of the main bake into this layer at tier 0 (same `rand()` draws in the same order, §0.1), so the main bake's other
props are unchanged.

### 8.3 Builder Bess and the build panel

A new place **`builder`** on the plaza by the welcome sign (walkable already): **Builder Bess** (woman, bandana, the
existing `hammer` tool) beside an easel with a painted island map. Places bar "Build" (hammer icon,
`button[data-place="builder"]`); Harbour menu `#harbour-build-btn`. The place id is **`builder` everywhere** (sparrow's
`walk.places`, townMode's `PLACES`, the places-bar button, the Harbour button's target), because townMode routes a walk
place's id straight into `open()` (E at Bess, the places-bar walk); only the panel **view** is named `'build'`
(`open('builder')` shows view `'build'`).

`#build-screen` (the tavern's parchment panel): header "Builder Bess · Build the island", `#build-chest`, "Villagers 12 ·
Town"; tabs **Homes | Amenities** (`role="tablist"`, ←/→/Home/End); each row (`.up-row`): icon, name, tier pips ●●○ plus
the words "Tier 2 of 3", "Now: …" and "Next: …", and one button (`.buy-btn[data-plot]`):

| State | Button text |
|---|---|
| can build | "Build Cottage — 100 gold" / "Upgrade to Townhouse — 250 gold" |
| too poor | "Need 30 more gold" (`aria-disabled`, focus stays) |
| storage refused | "Couldn't save: storage is full or switched off" (nothing paid) |
| done | "Fully built" |

Focusing or tapping a row glides the camera to that plot, framed beside the panel (`frameBeside`; a cut under reduced
motion). **Building:** the island record is saved first, then the chest (§0.1); a scaffold pops up in a sawdust puff
(0.4 s), four hammer knocks and a saw (1.2 s), the building springs up with squash and stretch (0.6 → 1.08 → 1 over
0.5 s, a rising "boing"), bunting and a cheer (2.4 s, skippable by any key or tap; under reduced motion it fades in with
the sounds). A new home's villagers wave from its porch ("Thank you, Captain!") for 2 s. `#build-live` announces
"Cottage built at Tavern Row. 2 villagers moved in." A double-click or a held Enter builds once (400 ms guard).

### 8.4 Villagers, and the walking-bug rules for every walker

- Up to **8** villagers are drawn (`VILLAGER_CAP`), seeded per home (kid, woman, man or old person in the house's colours,
  `share: true`, `detail: 'low'`); the rest are "at home" (lit windows). They are built when the dock opens (behind the
  "Rowing to…" toast), never on Go ashore.
- They are **`walker()`s in `env.folk()`**, so they get both built rules: they **wait** while the captain stands in their
  way (LOOK-2) and the captain **squeezes past** anyone he walks into for 0.25 s (`4465587`). No other rule is added.
- **Paths:** loops along the deck centrelines of the pier, the plaza, the tavern raft and the garden (crossing
  `plazaGarden` and `tavernTower`); a loop never **pauses** within 2 u of a bridge mouth, inside any place's circle
  (`place.r` + 0.5), in a doorway, at the gangplank foot or on a bridge; at most 2 villagers on any one bridge's loops.
- Builder Bess and Professor Barnacle stand still, outside every place circle but their own, ≥ 2 u from any bridge mouth
  and doorway, and **≥ 1 u from every walker path and villager loop** (walkers follow fixed paths and ignore blockers,
  so they would walk through her); their blockers (r 0.35) never narrow a deck below 1.6 u. A `walk.test` check
  measures both distances.
- Greetings (one bubble at a time, 20 s per person, SPEC2 §7.2): "Lovely house, Cap'n!", "Fresh biscuits today!" (with a
  Bakery), "The Kraken? Brrr!" (after level 9).
- Culling: villagers farther than 30 u from the camera are hidden; drop order when over budget: 8 → 6 → 4 (§14).

---------------------------------------------------------------------------------------------------

## 9. Economy (every price in one table in one module; totals checked by Node tests)

| Sink | Total | Module |
|---|---|---|
| Shipyard (6 upgrades + the rudder) | 5,270 + 970 = **6,240** | `upgrades.js` (`UPGRADES`, `RUDDER`) |
| Tavern crew upgrades | **4,600** (unchanged) | `armory.js` |
| Powder recipes | **1,100** | `specials.js` (`RECIPES`) |
| Polly's priced items | **1,200** (unchanged; the 4 new items are trophies) | `cosmetics.js` |
| The island | **11,800** | `island.js` (`PLOTS`) |
| **Everything** | **24,940** | |

| Income | Gold | Notes |
|---|---|---|
| Voyage I, first clear | 2,485–2,890 | measured (SPEC2 §6.8, stock ship) |
| Voyage II, first clear | ≈ 5,000–5,700 | bonuses 2,200 + two galleons captured (2 × (525 + 150 + 50)) + the Phantom 625 + loot |
| Voyage III, first clear | ≈ 7,800–9,000 | bonuses 5,400 + the Pearl 1,000 (`KRAKEN.pearl`, paid on every L9 clear) + loot and captures ≈ 1,400–2,600 (the Inkheart captured pays 725 instead of 350) |
| The quiz, once | 2,700 | 27 stars + 9 "Good try!" |
| Villagers' gift | ≤ 240 a cleared level | needs homes; capped |
| Market Hall | ≤ 300 a cleared level | capped |
| Replays | a level's loot + bonus each time | e.g. L9 ≈ 4,100 |

A first full voyage plus the quiz banks about **18,000–20,300**: enough for the ship, the tavern, the recipes and about
half the island (or most of everything but the island's top tiers). The rest (about 4,640–6,940 of the 24,940) takes **about one
replay of Voyage III** (≈ 6,800–9,000 with the Pearl, plus the gift and the Market), or several of the earlier, easier
levels. Nothing in the economy pays without playing: quiz gold is once per star, the gift
and the Market are per cleared level, and capped. Stage 3 measures the real numbers with bot v3 and records them in §19.

---------------------------------------------------------------------------------------------------

## 10. Persistence (localStorage; every new record validated like `parseShipConfig`)

### 10.1 Records

| Key | Format | Validation (module) |
|---|---|---|
| `pirates-ahoy-unlocked` | integer | `loadInt(PROGRESS_KEY, 1, LEVELS.length, 1)`: max **9** once Voyage III is live; the migration of §10.3 |
| `pirates-ahoy-ship` | today's `{"up":{…6 tiers…},"look":{…}}` + **sparse** `up.rudder` | `parseShipConfig` reads `up.rudder` (own property, plain integer, clamped 0..3); `serializeShipConfig` writes it **only when ≥ 1**, so a record without it is already canonical and today's records stay byte for byte (§3.1) |
| `pirates-ahoy-powder` (new) | `{"v":1,"own":{"fire":0,"frost":0,"stink":0}}` | `parsePowder` (specials.js): ≤ 4 KB, JSON + the plain-integer reviver, each 0 or 1 (else 0), own properties only, unknown fields dropped, never throws |
| `pirates-ahoy-island` (new) | `{"v":1,"t":{"homeA":0,"homeB":0,"homeC":0,"homeD":0,"bakery":0,"windmill":0,"lighthouse":0,"market":0,"school":0,"park":0}}` | `parseIsland` (island.js): ≤ 4 KB, tiers plain integers clamped to 0..3, known plot ids only |
| `pirates-ahoy-quiz` (new) | `{"v":1,"stars":[0,0,0,0,0,0,0,0,0],"paid":[0,0,0,0,0,0,0,0,0],"tried":[0,0,0,0,0,0,0,0,0],"seen":["life-octopus-hearts"]}` | `parseQuiz(raw, knownIds)` (quiz.js): ≤ 8 KB; `stars` 9 plain integers 0..3, and a star on island *n* counts only if island *n* − 1 has one (else lowered to 0); `paid` 9 plain integers 0..3, each ≤ its `stars` (the stars whose gold is banked); `tried` 0/1 (the "Good try!" gold banked); `seen` known ids only, deduped, at most 60 (oldest dropped) |
| `pirates-ahoy-settings` (new) | `{"v":1,"steer":"buttons"}` | `parseSettings` (settings.js): `'buttons'` or `'wheel'`, else `'buttons'`; ≤ 1 KB |
| `pirates-ahoy-feats` | + `kraken` (0..1), `quiz` (islands passed, 0..9), `stars` (0..27), `island` (tiers built, 0..30), written before `prizes`; `prizes` keys gain the six new types | `parseFeats` (cosmetics.js); `FEAT_IDS` = the five of today + these four |
| `pirates-ahoy-tips` | integer bitmask | `loadInt(TIPS_KEY, 0, 65535, 0)` (bits in §6.5) |

Unchanged: `pirates-ahoy-armory`, `-look` (it accepts the four new trophy ids as known items), `-best`, `-purse`,
`-tutorial-done`, `-muted`. The Kraken checkpoint is session memory only.

### 10.2 Writing, storage blocked or full, two tabs

- **Order:** a recipe purchase or an island build writes its own record first and the chest second (§0.1). If the
  record can't be written, nothing is bought and no gold moves; the panel says why.
- **A quiz reward** pays only gold that is owed: stars above `paid`, and the "Good try!" while `tried` is 0. It writes
  the quiz record (new `stars`, `paid` and `tried` raised) and then the chest; if the chest write fails, the quiz record
  is written back with the new stars but the old `paid` and `tried` (the shipyard's rollback, like `saveChest`), so the
  stars are kept and their gold stays owed. Owed star gold (`stars − paid`) is paid, once, by the next reward or the
  next time the quiz panel opens with storage working; an unsaved "Good try!" is paid the next time that island's round
  is finished. In memory, `paid`/`tried` rise only when both writes succeed, so a star kept "for the visit" never blocks
  its own gold later in the same visit.
- **The rudder** goes through the shipyard's `buyUpgrade`, changed in two places: it looks the id up in `SHIPYARD`
  (not `UPGRADES`), and the new tier is `Math.min(maxTier(id), (shipConfig.up[id] ?? 0) + 1)` (the sparse field reads
  `undefined` at tier 0); upgrades.js's private `upgrade(id)` searches `SHIPYARD`, so `nextCost`, `maxTier` and
  `statText` know `'rudder'`. It keeps the shipyard's own tested storage rule (SPEC2: the ship record first, the chest
  with it; if storage refuses, the purchase lasts for the visit and the gold stays in the saved chest, `unsavedSpend`),
  the one exception to §0.1's rule.
- **Storage blocked** (`localStorage` throws): the game starts from the defaults and works for the visit (today's
  tested rule: nothing is paid for that could not be saved). The quiz is playable: its stars and the islands they open
  last for the visit, with "Couldn't save your stars, so no gold this time" (the gold stays owed, above). The steering
  setting works for the visit.
- **Storage full:** the same refusal for every new purchase or reward; nothing else breaks.
- **Feats** that mirror levels (`legend`, `kraken`, `quiz`, `stars`, `island`) **merge by max**, never by adding deltas
  (main's `syncFeats` treats them apart from the counters); main raises `quiz`, `stars` and `island` from the quiz and
  island records whenever those are saved and at load.
- **Two tabs:** the `storage` listener takes `-powder` (owned only goes up), `-island` (each tier the larger),
  `-quiz` (each island's stars and `paid` the larger, `tried` or-ed, `seen` merged and capped), `-settings` (theirs) and `-feats`
  (as above). Every purchase resyncs before it buys (like `buyArmory`). Stars, tiers, recipes and progress only ever go
  up.

### 10.3 Migration of existing saves (nobody loses anything)

| Old save | At load |
|---|---|
| `pirates-ahoy-unlocked` ≥ 6 and `feats.legend` ≥ 1 (the Phantom captured; §5.2's one rule and its accepted edge case) | `raiseProgress(7)`: Voyage III is open, the Maelstrom is never replayed |
| a ship record without `rudder` | tier 0; the record is already canonical (not rewritten) |
| a feats record without the four new fields | they read 0 (then are raised from the quiz and island records), and the record is rewritten once |
| a tips value | kept; values above 255 are no longer clamped |
| everything else | unchanged; no key is renamed or removed, no gold or progress moves |

---------------------------------------------------------------------------------------------------

## 11. Architecture

### 11.1 Modules (exact exports)

**`src/specials.js`** (new, pure) — §2

```js
export const SPECIAL_IDS = ['fire', 'frost', 'stink'];
export const ALL_AMMO = ['round', 'chain', 'grape', 'fire', 'frost', 'stink'];    // keys 1–6, the R cycle order
export const SPECIAL;   // §2.1 rows: { name, key, hull, crew: 0, rakeCrew: 0, range, reloadMul, spreadMul, pad, top, status }
export const RECIPES;   // { fire: { price: 300, sale: 4 }, frost: { price: 300, sale: 6 }, stink: { price: 500, sale: 7 } }
export const LOADS;     // { base: 4, windmill: [0, 1, 2, 3], crate: 1, crateGold: 20, crateReach: 3 }
export const STATUS;    // { fire: { dps: 3, time: 6, boss: 3 }, frost: { speed: 0.5, turn: 0.6, time: 5, add: 2, max: 8, bossMul: 0.5 },
                        //   stink: { time: 4, boss: 2, immune: 10, bossImmune: 20, grit: 0.75, decel: 2 }, kaboom: { burst: 15 } }
export const IMMUNE;    // { inferno: ['fire'], phantom: ['stink'] } with their words
export const WORDS3;    // every new pop and hint word, so every screen says the same thing
export function isSpecial(id), onSale(id, unlocked) → boolean
export function specialShot(info, id) → info                 // §2.6; never mutates info
export function newStatus() → { id: null, t: 0, max: 0, immune: 0 }
export function applyStatus(st, id, { typeKey, boss }) → { st, events: ['applied'|'extended'|'kaboom'|'fireOut'|'immune'|'pegs'], burst, burn: { rate, time } | null }
export function stepStatus(st, dt) → { st, ended: id | null }
export function statusMuls(st) → { speed, turn, noFire, noBoard, noRam, noMortar, grit, noGrapple }
export function douse(st) → { st, doused }                   // water and frost put out fire
export function startLoads(powder, windmillTier) → { fire, frost, stink }
export function spendLoad(loads, id) → { loads, ok }
export function crateLoad(loads, powder) → { loads, id, gold }
export function defaultPowder(), parsePowder(raw), serializePowder(p)
export function buyRecipe(powder, purse, id, unlocked) → { ok, powder, cost, reason: 'unknown' | 'owned' | 'locked' | 'poor' }
```

**`src/combat.js`** (extended; no existing table or function changes) — `export function armourMul(aspect, armour) →
number` (1 without armour or on a rake, else `armour`). The armour number lives only on the type (`ironclad.armour:
0.5`, §4.1); there is no separate `ARMOUR` table.

**`src/mechanics3.js`** (new, pure) — §4.2, §5.3

```js
export const MECHANIC3_IDS = ['spouts', 'rogue', 'flagship'];
export const SPOUTS, ROGUE, RAM, MORTAR, FIRESHIP, INK, FLEE;      // the tables of §4.2 and §5.3
export function createMechanics3(ids, ctx) → {
  init(), onSpawn(e, waveIndex), onCapture(e), onSink(e), onRemove(e), step(dt),
  steer(e, dt) → { h, speed } | null, holdFire(e) → boolean, drift(s) → { vx, vz } | null, avoid() → [{ x, z, r }],
  shipMods(s) → { speedMul, capAdd, turnMul, spin },       // ink slicks, surf, wobble, spout spin
  objective(), minimap(), summary(), bonus(), visuals() → { spouts, rogue, slicks, rams, fireRings, shells },
  addSlick(x, z), get krakenDue, get state, dispose()
}
export function composeMechanics([a, b]) → the SPEC2 §6.3 hook shape + shipMods/visuals/krakenDue/addSlick
   // a = createMechanics(ids, ctx) and b = createMechanics3(ids, ctx3): two INSTANCES (each factory filters the ids
   //   it knows, so main passes def.mechanics to both). Hooks (init, onSpawn, onCapture, onSink, onRemove, step,
   //   dispose) fan out, a first; steer: a's if non-null, else b's; drift: summed (as createMechanics sums its parts),
   //   null when both are null; holdFire: either; avoid, minimap, summary: a's then b's;
   //   bonus: summed; objective: a's string UNCHANGED when b's is null (b's alone when a's is null, else
   //   "a · b"); shipMods: muls multiplied, adds added (identity when b has none);
   //   state: { ...a.state, m3: b.state }, so ids, convoy, floes and current stay top-level (battle.cjs:2656,
   //   levels.cjs:628–877 read them); visuals, krakenDue, addSlick: b's.
// ctx = SPEC2's mechanics ctx + { launchBomb({ kind, from, tx, tz, radius, damage, warn }), flee(e), explode(x, z, r, dmg, src),
//   status(e) → status, douse(e), playerTurn(), warnBonus(), surrender(e) }
```

The ram, mortar and fire-ship behaviours follow the type flags on every level; `ids` only switches the hazards on.
`composeMechanics` is **implemented in full in Stage 0** (it is not a stub: Stage 0 already routes every level through
it, with `createMechanics3` a null object), and 1B inherits it unchanged.

**`src/kraken.js`** (new, pure) — §5.7

```js
export const KRAKEN;    // §5.7.3 + parts, grab (grabRest 8, restGap 8), specials (chase ×0.5, warn +0.5, sneeze),
                        //   cutOff, dread/rise times, sway 4, sink 0.5, maxUp 4, pearl: 1000
export function createKraken(ctx) → {
  rise(x, z, { short }), step(dt), targets() → [{ id, kind, x, z, r, y0, y1, hp }], hits(id, x, y, z) → boolean,
  hit(id, info) → { dmg, word } | null, special(id, ammo) → word | null,
  cut() → boolean, cutHold(down), playerMods() → { speedMul, turnMul, dps },
  get bar /* { name, frac, notches } */, get phase, get hp, get grabbed, get rising, get done,
  visuals() → { shadow, head, eye, tentacles: [{ x, z, h, t, state }], rings: [{ x, z, r, t, T, grab }] }, get state, dispose()
}
// ctx: { player() → { x, z, h, speed, wid, len }, damage(amount, x, z, source), land(x, z, r) → boolean,
//        world: { x, z, r }, rng(), warnBonus(), inkSlick(x, z), pop(text, x, y, z, style), announce(text), sfx(name, x, z),
//        tables: { STATUS, INK, RAIDERS } }   // main passes specials.js / mechanics3.js / combat.js tables, so the
//        Kraken's status times, ink blob and cut taps/hold are never copied into KRAKEN (kraken.js imports nothing)
```

**`src/island.js`** (new, pure) — §8

```js
export const PLOTS, RANKS, GIFT /* { perVillager: 5, cap: 240 } */, MARKET /* { cap: 300 } */, VILLAGER_CAP /* 8 */;
export function defaultIsland(), parseIsland(raw), serializeIsland(s)
export function tierOf(s, id), nextCost(s, id), totals() → { homes: 3400, amenities: 8400, all: 11800 }
export function plotState(s, purse, id) → { tier, cost, affordable, maxed, label, now, next }
export function build(s, purse, id) → { ok, island, cost, reason: 'unknown' | 'maxed' | 'poor' }
export function perks(s) → { wavePatch, extraLoads, warnBonus, marketPct, hints, giftMul }
export function villagers(s), tiersBuilt(s), rank(s) → { name, tiers, next }, gift(s), market(s, banked)
```

**`src/quiz.js`** (new, pure) + **`src/quizBank.js`** (`export const QUESTIONS`) — §7

```js
export const QUIZ_LEVELS, CATS, ROUND /* 5 */, PASS /* stars at 3, 4, 5 right */, GOOD_TRY /* 10 */, SEEN_MAX /* 60 */;
export function rng(seed) → () => number                  // mulberry32
export function validateBank(bank) → { ok, errors }
export function sumQuestion(band, rng) → { id, cat: 'sums', q, right, wrong, fact }
export function makeRound(bank, level, seed, { unlocked, seen = [], recent = [] }) → [{ id, cat, q, options, right, fact }] × 5
export function stars(correct) → 0..3, hint(question, removed, rng) → index | null
export function reward(rec, level, starsWon) → { gold, rec, newStars, goodTry }   // gold = every owed star (stars above
                                                          //   paid, any island) + Good try; rec has stars raised only
export function markPaid(rec, level, goodTry) → rec       // paid = stars, tried[level] = 1: only after both writes succeed
export function owed(rec) → gold                          // star gold for stars above paid
export function openLevels(rec), passed(rec), totalStars(rec), noteSeen(rec, ids) → rec
export function defaultQuiz(), parseQuiz(raw, knownIds), serializeQuiz(rec)
```

**`src/settings.js`** (new, pure) — `STEER_MODES = ['buttons', 'wheel']`, `defaultSettings()`, `parseSettings(raw)`,
`serializeSettings(s)`.

**`src/upgrades.js`** (extended) — `export const RUDDER` (§3.1: `{ id: 'rudder', name: 'Big rudder & wheel', blurb, stat:
'Turning when slow', values: [0.35, 0.5, 0.65, 0.8], turnMul: [1, 1.05, 1.1, 1.15], costs: [120, 300, 550] }`) and `export
const SHIPYARD = [...UPGRADES, RUDDER]`; the private `upgrade(id)` searches `SHIPYARD`, so `nextCost`, `maxTier`,
`statText` know `'rudder'`; `playerType` sets `turnLow` and multiplies `turn`; the sparse `up.rudder` of §10.1.
`UPGRADES` and `defaultShipConfig()` are unchanged. `RUDDER.values[0]` (0.35) is also every enemy's `turnLow` (main
reads it; no second 0.35).

**`src/cosmetics.js`** (extended) — `FEAT_IDS` + `kraken`, `quiz`, `stars`, `island`; `FEAT_PRIZE_TYPES` + the six types
(Stage 0, with `shipTypes.js`); four trophies: `pet.octopus` "Baby kraken" (`kraken ≥ 1`), `hat.mortarboard` "Professor's
mortarboard" (`quiz ≥ 9`), `pet.rainbow` "Rainbow macaw" (a `parrot` with rainbow `petColor`, `stars ≥ 27`),
`coat.governor` "Governor's coat" (white and gold, `island ≥ 30`); `enemyCrewOpts` for the six types; new palette hexes.
(cosmetics.js imports nothing, so the trophy minimums 9 / 27 / 30 and the feats' caps can't be read from quiz.js or
island.js: a Node test checks they equal `QUIZ_LEVELS.length`, `3 × QUIZ_LEVELS.length` and the sum of the `PLOTS`
tier counts.)

**`src/shipTypes.js`** (Stage 0) — the six types of §4.1.

**`src/act3.js`** (new) — `export const ACT3_LEVELS` (§5.4–5.6), `export const ACT3_TEASER`; imports the three env modules.
**`src/voyage.js`** (new) — `export const WITH_KRAKEN, LEVELS` (§5.1).

**`src/env/atolls.js`, `cape.js`, `deep.js`** (new) — SPEC2's env contract (`meta`, `palette`, `build(scene, ctx)` →
`{ worldRadius, colliders, playerStart, enemySpawns, reefs, update(t, dt, ctx), dispose(), group }`) plus `crateSpots`;
atolls `spoutLoops`; cape `rogueDirs`; deep `krakenArena`, `setDread(k)`, `setDawn(k)`. Each draws its own hazard
visuals from `update(t, dt, { simTime, camera, hazards })` (`hazards = mechanics.visuals()`).

**`src/ships.js`** (extended) — builders `shark`, `bombketch`, `ironclad`, `fireship`, `skiff`, `inkheart`;
`projectileMesh('fire' | 'frost' | 'stink')`; player opts `upgrades.rudder` (rudder, wheel, binnacle) and `powder` (the
keg rack); every ship's `userData.statusAnchors = { rail: [{ x, y, z }], deck: { x, y, z }, holes }` for statusfx;
`userData.fuse` (the fire ship's rigging flames).

**`src/statusfx.js`** (new, THREE) — `createStatusFx(scene, { reducedMotion }) → { sync(ships, t, dt), clear(ship),
dispose() }`: reads `ship.status` and `userData.statusAnchors`; icicles (cones), ice plates, flames, stink puffs, stink
lines and flies as **6 InstancedMeshes with `noOutline`** (≤ 120 / 36 / 48 / 60 / 24 / 16 instances) = ≤ 6 draw calls,
≤ 8 with headroom.

**`src/krakenView.js`** (new, THREE) — `createKrakenView(scene, { reducedMotion, foamColor }) → { prepare() → boolean
(builds one mesh per call, true when ready), get ready, update(visuals, t, dt), riseCamera(k) → { pos, look } | null,
dispose() }`. The body is **one rigidly skinned SkinnedMesh** (the people.js technique, which the outline pass handles;
≤ 3 material groups), up to 4 tapered skinned tentacles, glowing eyes (`noOutline`), a shadow decal: **≤ 30 draw calls**.

**`src/tags.js`** — §6.4. **`src/pops.js`** — styles `fire`, `frost`, `stink`, `kraken`. **`src/people.js`** — hat
`mortarboard`, pet `octopus` (a tiny purple octopus on the pet bone, a slow bob and a tentacle wave in `'cheer'`), tool
`pointer`; the determinism rule holds. **`src/audio.js`** — SFX `ignite crackle sizzle freeze stink blast clang ram mortar
fuse spout horn rogue surf ink krakenRise slam grab gurgle sneeze bell bonk squawk build crate`, scenes `atolls cape deep
kraken quiz` (quiz = the town tune); every new name in `SFX_NAMES`, `SCENE_NAMES`, `SFX_CAP`, `SFX_GAIN`.

**`src/env/sparrow.js`** (extended) — plots in a development layer (§8.2); `setIsland(cfg, { built: id | null })`;
`plotPose(id) → { pos, target }`; `setVillagers(list)`; villagers in `folk()` (§8.4); the places `quiz` and `builder` in
`walk.places` with their `cam` poses; Builder Bess, Professor Barnacle and Quizzle; the bell, chalkboard and easel (baked);
`setRank(name)` (the plaque); the plots' tier-3 envelopes in `walk.camBlockers`.

**`src/townMode.js`** (extended) — `PLACES = ['shipyard', 'tailor', 'tavern', 'quiz', 'builder', 'ship']` (the same ids
as sparrow's `walk.places` and the `data-place` buttons, §8.3); views `'quiz'` and `'build'` (`open('builder')` enters
view `'build'`; it creates the two panels and routes keys, focus and the camera); the tavern's **Powder room** list
(`#tavern-powder-list`, outside `#tavern-up-list`) and the powder tips on the rumour board; the Harbour menu buttons.
ctx gains `withKraken` (the new places, the Powder room and the Harbour buttons show only when it is true),
`powder: { state(), buy(id) }`, `island: { state(), build(id) }`, `quiz: { record(), save(rec, gold) }`, `unlocked()`.

**`src/quizPanel.js`**, **`src/buildPanel.js`** (new, DOM; styles in `town.css`) — `createQuizPanel({ root, ctx })` /
`createBuildPanel({ root, ctx })` → `{ open(), close(), onKey(e, down) → handled, refresh(), get active, api }`.

### 11.2 What main.js gets (integration points)

| Where | Change | Stage |
|---|---|---|
| imports / state | `LEVELS` from `voyage.js`; specials, mechanics3, kraken, krakenView, statusfx, island, quiz, settings; `state.loads`, `state.powder`, `state.grabbed`, `input.steer`, `krakenCheckpoint`; records `powder`, `island`, `quiz`, `settings` via `loadRecord` | 0 (stubs) / 2 |
| `turnRate(ship, { full })`, `playerTurn()` | one helper for the three copies of the turn formula (2414, 2515 with its `fullRate` branch, 2534 with `boarding.turnScale`); `animateHelm` (5458) keeps its raw input until Stage 2, then reads `−playerTurn()` (§3.1) | 0 (identical results but `launchBomb`'s prediction, §3.1) / 2 (`turnLow`, `input.steer`, grab, the helm) |
| `speedMul`, `turnMul`, `mayFire`, `speedCap` | + `statusMuls(ship.status)`, `mechanics.shipMods(s)`, Kraken `playerMods()` | 0 (identity) / 2 |
| `targetsFor(side)` | the one list `aimTarget`, `inArc`, `playerFire`, `rakeCue`, the FIRE! light, the minimap and the portrait framing read: enemies + Kraken pseudo-targets (cached wrappers with `hp`, §5.8) | 0 (enemies only) / 2 |
| `hitsShip`, `damage` | pseudo targets → `kraken.hits` / `kraken.hit`, then `damage` returns at once (§5.8) | 0 (seam) / 2 |
| `fire()` | special ammo: range, spread, reload, `projectileMesh`; spend a load per side; fall back to round with the hint, setting `state.ammo` directly (§2.5); the launch sound: `audio.play(ammo)` stays for chain and grape only, a special ball launches with the round shot's sound (its own SFX, `ignite` / `freeze` / `stink`, play on the hit, so a stink ball never sounds its hit at the gun); a queued Fire tap spends a load only when it fires (§0.3) | 2 |
| `ballHit` | `specialShot`, `armourMul` (§2.6); a pseudo target gets a beam-on `shotResult` (§5.8) | 2 |
| `damage(ship, amount, x, z, source, info?)` | signature kept; applies `info.status` once per volley per target, KA-BOOM / FIRE OUT / IMMUNE pops, CLANG!; statuses cleared on strike, capture, escape, flee | 2 |
| `updateEffects` | `stepStatus`; the shared burn (`burnRate`); burns pause for the glued pair (`swing..result`), stinks from the grapple to the `result` (§2.4) | 2 |
| `canGrapple` | `burning` → "Too hot to board! Wait for the fire to go out."; a fire ship that hasn't struck → `'immune'`, "Too hot to board! Freeze her first." (§4.2); a pseudo target → "You can't board a sea monster!" | 2 |
| `boardingSides` | stinky defender's grit ×0.75 | 2 |
| `launchBomb(spec)` | generalised: `{ kind, from, tx, tz, radius, damage, warn }` (kinds `lava`, `lightning`, `geyser`, `shell`, `ink`, `slam`) + the Lighthouse's `warnBonus`; `launchBomb()` with no spec keeps today's level bombs | 0 (identical) / 2 |
| `updateBombs` | the new kinds (zone colours, ink slicks via `mechanics.addSlick`) | 2 |
| `updatePlayer` | `turnRate`, `playerTurn()`, grab (speed and turn 0, dps), surf, wobble | 2 |
| `updateEnemy` | `mechanics.steer` (composed) for rams, mortars, fire ships, fleeing ships | 2 |
| `moveShip` | composed `drift` (spout pulls, ram push-apart) and `spin` | 2 |
| `separateShips` | skips pseudo targets and fleeing ships | 2 |
| `step()` | `mechanics.step` (composed), `kraken.step`, crates, the L9 sequence (§5.7.1), the clear check waits for `!def.kraken \|\| kraken.done` | 2 |
| `spawnWave` | `WAVE_REPAIR` → `perks.wavePatch`; prebuild the next wave's meshes hidden, one per frame, from 2 s after a wave spawns (fixes PERF-4 for every level) | 2 |
| `startLevel` | loads (`startLoads`), crates, `composeMechanics([createMechanics(ids, ctx), createMechanics3(ids, ctx3)])` (instances, §11.1), the Kraken (L9: `createKraken`, `krakenView.prepare()` one mesh per frame during the fly-in and wave 1), `{ fromKraken }` | 0 (compose) / 2 |
| `finishLevel` | gift and Market (`island.gift/market`, added to `state.gold` before banking, on every cleared level including finales; lines in `#level-summary` or `#won-chest`, §6.6/§8.1), the Pearl line, feats `kraken`, `def.victoryLine`, `def.sailOn`, `ACT3_TEASER` | 2 / 3 |
| `playerSunk` | `#kraken-retry-btn` when a checkpoint exists | 2 |
| `updateHud` | `#ammo-count`, the tray, `#boss-notches`, `#boss-status`, `#grab-strip`, `#edge-arrow` | 2 |
| `drawMinimap` | §6.3 | 2 |
| input | keys 4–6 (the `ammoKey` regex widened to `[1-6]`; `KEYMAP` untouched), R cycle over `ALL_AMMO`, G for grabs, the tray, the thumb slide, the wheel, `#steer-mode-btn`, any key skips the rise | 0 (no-op stubs) / 2 |
| `frame()` | `statusfx.sync`, `krakenView.update`, the rise camera, `deep.setDread/setDawn` | 2 |
| saves | `powder`, `settings`, feats max-merge, tips 65535, the storage listener | 2 / 3 |
| acts | `ACT_NAMES[3]`, nine cards, the open card scrolled into view, migration (§10.3), Victory texts | 3 |
| dock / town | townMode ctx (`powder`, `island`, `quiz`), `env.setIsland` + `setVillagers` in `openDock`, recipe/build persistence (record first), quiz rewards paid by §10.2's owed rule | 3 |
| `buyUpgrade` | looks the id up in `SHIPYARD`; new tier `(shipConfig.up[id] ?? 0) + 1`; the shipyard's own storage rule (§10.2) | 2 |

### 11.3 Test API (`window.__game` additions; Stage 0 adds placeholders returning safe defaults)

```js
specials: { get loads, setLoads(o), get powder, setPowder(p) /* validated, saved */, status(ship), crate(i) },
steer(x) /* sets input.steer like a slide; null clears */, settings: { get, set(s) },
mechanics3: { get state, wave(angle) /* a rogue wave now */, spout(x, z) },
kraken: { get state, rise(), setHp(n), phase(n), get targets, cut(), cutHold(down), get checkpoint },
island: { get config, set(cfg), build(id) → { ok, reason } },
quiz: { get record, set(rec), start(level, seed), answer(i), hint(), next(), get round },
voyage: { get WITH_KRAKEN },
```

---------------------------------------------------------------------------------------------------

## 12. Staged build plan (disjoint file ownership inside every stage)

Rules for every agent (SPEC2 §10, unchanged): read §0 and the sections your files implement; edit **only** your owned
files (create new files only if they are listed for you); test pure modules with Node and visual work in a harness page
under `.dock-harness/` with screenshots at 1280×720 and 390×844 (SwiftShader, `?quality=low`); report draw calls for
anything that renders. A change you need in a file you don't own goes in your final report as a **hook request** (file,
function, exact change) for that file's owner in the next stage (in Stage 2, agent 2E applies them within the stage).
**Keep every owned file importable at all times**
(`main.js` → `voyage.js` → `act3.js` → the env modules load on every page). Nobody edits `vendor/`, adds dependencies,
commits or pushes. A stage ends when its exit check passes; Voyage III and the new town features stay behind
`?kraken=1` (`WITH_KRAKEN`) until Stage 3, so `npm test` stays green at the end of every stage with only the test edits
§13.4 assigns to that stage.

### Before Stage 0 (the coordinator)

Item 0 (§0.3): confirm or publish the walking fix; land the open phone-battle fixes.

### Stage 0 — Scaffolding (1 agent, no behaviour change)

| Agent | Owns | Work | Exit check |
|---|---|---|---|
| **0 Integrator** | `src/main.js`, `index.html`, `style.css`, `town.css`, `fx.css`, `src/shipTypes.js`, `src/cosmetics.js` (the `FEAT_PRIZE_TYPES` line only), new `src/voyage.js`; new **stubs** exporting their final §11.1 API as null objects: `src/act3.js` (`ACT3_LEVELS` = **three placeholder defs**, one per level: `env` = the stub env module, `difficulty` 'Daring' / 'Fearsome' / 'Mythic', `act: 3`, `stars` 7 / 8 / 9, `scene` 'atolls' / 'cape' / 'deep', `lockText`, `bonus`, `nextWaveAt: 0`, `maxAttackers: 2`, `lead: 0.6`, `spreadMul: 1`, `grace: 3`, `enemyRake: 1`, `mechanics: []`, `waves: [['cutter']]`, and `finale: true` on the third; plus `ACT3_TEASER`), `src/env/atolls.js`, `src/env/cape.js`, `src/env/deep.js` (valid empty seas: `meta`, the §5 palette, `worldRadius`, a `playerStart`, 6 `enemySpawns` and 4 `crateSpots` on a ring of radius 75, empty `spoutLoops` / `rogueDirs` / a `krakenArena`), `src/specials.js`, `src/mechanics3.js` (null-object `createMechanics3`, but **`composeMechanics` in full**, §11.1), `src/kraken.js`, `src/krakenView.js`, `src/statusfx.js`, `src/island.js`, `src/quiz.js`, `src/quizBank.js`, `src/settings.js`, `src/quizPanel.js`, `src/buildPanel.js` | 1. `voyage.js`; main imports `LEVELS` from it. 2. `turnRate(ship, { full })` / `playerTurn()` replace the turn formulas of `updatePlayer`, `steerToward` and `launchBomb` (§3.1; the helm keeps its raw input). 3. Seams: `statusMuls` in `speedMul`/`turnMul`/`mayFire` (identity), `targetsFor(side)` (enemies only), pseudo-target branches in `hitsShip`/`damage` (never taken), `composeMechanics([createMechanics(ids, ctx), createMechanics3(ids, ctx3)])` with the §11.1 rules (Act II's `mechanics.state.ids`, `.convoy`, `.floes`, `.current` and `objective()` unchanged). 4. `launchBomb(spec)` generalised (level bombs identical). 5. The six ship types (§4.1) and the matching `FEAT_PRIZE_TYPES`. 6. Every DOM id of Appendix A (hidden), the overlays `#quiz-screen` and `#build-screen` with class `overlay` (which is what puts them in the inert `backdrops` list, main.js:3288) placed **before `#recover-screen`** (so the recovery dialog still paints above them). 7. The `ammoKey` regex widened to `Digit/Numpad[1-6]`, with 4–6 as no-ops, and `TAP_ACTIONS.tray` as a no-op stub (`KEYMAP`, the steering map, is not touched). 8. `__game` placeholders (§11.3). 9. The sparrow build ctx gains `kraken: WITH_KRAKEN` (sparrow ignores it until 1N; with it false the town stays exactly today's). | `npm test` green with **no** test edits; draw calls within ±2 of today (the baselines re-measured after the phone-battle fix, §0.3) on the six level starts, the shipyard and the town; `?kraken=1` shows 9 cards and starts levels 7–9 as stub seas (one cutter each) without errors |

### Stage 1 — Foundations (15 agents in parallel; main.js untouched)

Three Stage 1 agents consume another's work: 1N needs 1G's new people options (Bess, Barnacle), 1I needs 1H's
`userData.statusAnchors`, and 1O needs 1E's `quiz.js` API. The dependents build against **mocks of the exact §11.1
shapes** (people options ignored until they exist, fake `statusAnchors` on test boxes, a mock `quiz.js` with the §11.1
exports), and once 1G, 1H and 1E have landed a short **Stage 1b** re-runs 1N's, 1I's and 1O's exit checks against the
real modules (each still edits only its own files).

| Agent | Owns | Delivers | Exit check |
|---|---|---|---|
| **1A Special ammo** | `src/specials.js`, `src/combat.js` (`armourMul` only), `tests/specials.test.cjs` (new), `tests/combat.test.cjs` (new checks appended; no existing check edited) | §2 rules and tables, §10.1 powder record | Node suites green; §2.1's worked example reproduced exactly |
| **1B Voyage III rules** | `src/mechanics3.js`, `src/act3.js`, `tests/mechanics3.test.cjs` (new) | §4.2 behaviours, §5.3 hazards, §5.4–5.6 level definitions; `composeMechanics` kept exactly as Stage 0 wrote it (§11.1), now covered by Node tests | Node tests of §13.1 green with a mock ctx |
| **1C Kraken rules** | `src/kraken.js`, `tests/kraken.test.cjs` (new) | §5.7 simulation and targets | Node tests green; every warning ≥ 1.5 s; a scripted "fleeing" player still gets an attack within 12 s + warning; never more than 4 tentacles up; a standing player is never grabbed within 8 s of a release |
| **1D Island & settings** | `src/island.js`, `src/settings.js`, `tests/island.test.cjs`, `tests/settings.test.cjs` (new) | §8.1 tables and record, §3.2 setting record | Node tests green; totals 3,400 / 8,400 / 11,800 |
| **1E Quiz** | `src/quiz.js`, `src/quizBank.js`, `tests/quiz.test.cjs` (new) | §7 rules, the 72 questions of §7.5 + 48 more, sums | the bank validates; Node tests green; gold totals 2,610 + 90 |
| **1F Economy & looks data** | `src/upgrades.js`, `tests/upgrades.test.cjs` (new checks appended only), `src/cosmetics.js`, `tests/cosmetics.test.cjs` (rows C1–C10 of §13.4 + new checks) | `RUDDER`, sparse `up.rudder`, `playerType` turning; `FEAT_IDS`, the four trophies, the new faction looks | both suites green; every **existing** `upgrades.test.cjs` check passes untouched |
| **1G Characters** | `src/people.js` | hat `mortarboard`, pet `octopus`, tool `pointer` (§11.1) | the 400-seed look comparison identical; harness grid of the new options × actions; ≤ 3 material groups |
| **1H Shipwright** | `src/ships.js` | the six models (§4.3), the special projectiles, rudder tiers and the keg rack on the player, `statusAnchors`, the fire ship's rigging flames | harness: each model at 3 angles, damage levels 0–2, flags; draw calls per model (≤ a Man-o'-War's, the Inkheart ≤ 1.3×); existing ship and dock tests green |
| **1I Status & Kraken art** | `src/statusfx.js`, `src/krakenView.js`, `src/tags.js`, `src/pops.js`, `fx.css` | §2.7 visuals, §6.4 tag badge and RAM icon, §5.7.2 model, the rise camera, pop styles | harness: 6 fake ships with every status at 3 zooms and under reduced motion; the Kraken in every pose; statusfx ≤ 8 calls, Kraken ≤ 30, tags +1 per badge; the eye's glow ≤ 1 Hz |
| **1J Sound** | `src/audio.js` | §11.1 SFX and scenes; the rise drone with harmonics | offline renders of every new name finite, stereo, non-silent; the drone has energy above 80 Hz; existing audio checks green |
| **1K Env: Turtle Atolls** | `src/env/atolls.js` | §5.4 | env alone ≤ 220 draw calls; the smoke layout rules; spout loops clear of colliders by r + 8; spout visuals from a fake snapshot |
| **1L Env: Cape of Storms** | `src/env/cape.js` | §5.5 | as 1K; the rogue wave drawn from a fake snapshot; `rogueDirs` from open sea |
| **1M Env: Kraken's Deep** | `src/env/deep.js` | §5.6 | as 1K; `krakenArena` clear; `setDread`/`setDawn`; no flash above §15's caps |
| **1N Town world** | `src/env/sparrow.js`, `src/walk.js`, `tests/walk.test.cjs` (row W1 + new checks), `tests/fixtures/sparrow-walk.json` (regenerated **once**, dumped with `kraken: true`) | §8 plots, development layer, villagers, places `quiz` and `builder`, NPCs and props, camBlockers for every tier-3 envelope, `setIsland`, `plotPose`, `setVillagers`, `setRank`; `peopleCount` counts every person sparrow adds. With the build ctx's `kraken` false the town is exactly today's (no new places, NPCs, boards or villagers; the plot layer draws today's shacks) | walk tests green; every place reachable from the spawn; at tier 0 the shipyard showcase poses and fixed town showcase views (camera placed directly, not the walk boom, §8.1) match today's screenshots (only the "Build me!" boards differ); Bess and Barnacle ≥ 1 u from every walker path (§8.4); all plots at tier 3 + 8 villagers: town walk view ≤ 450 at the 30 × 8 probe; existing dock and town tests green |
| **1O Ashore panels** | `src/quizPanel.js`, `src/buildPanel.js`, `town.css` | §7.3 and §8.3 screens against a mock ctx | harness at the 7 town sizes: no page scroll, ≥ 44 px (answers ≥ 56 px), contrast ≥ 4.5:1, keyboard only, screen-reader texts |

### Stage 2 — Integration (5 agents)

| Agent | Owns | Delivers | Exit check |
|---|---|---|---|
| **2A Integrator (battle)** | `src/main.js`, `index.html`, `style.css`, `src/voyage.js` | everything marked "2" in §11.2: specials (loads, tray, keys, pipeline, statuses, interactions), steering (rudder, slide, wheel, setting), the new ships and hazards through `composeMechanics`, armour, crates, the generalised bombs, the Kraken (targets, rise, phases, grab, checkpoint, boss bar, view), prebuilt next waves, the rudder row in the shipyard panel (`WITH_KRAKEN ? SHIPYARD : UPGRADES`) and `buyUpgrade` (§10.2), saves (`powder`, `settings`, feats max-merge, tips 65535), the test API; Voyage III playable with `?kraken=1` | the existing `npm test` green with no test edits; `tests/battle.cjs` additions (2C) green; levels 7–9 playable to the end with `?kraken=1` |
| **2B Town integration** | `src/townMode.js`, `src/town.js` | the six places, views `'quiz'`/`'build'` (creating the two panels), the tavern's Powder room, powder tips on the rumour board, Harbour buttons, prompts, villagers' greetings | a harness with a mock ctx: every place, panel and key path at the 7 town sizes; the walking-bug probe of §13.2 with 8 villagers; the existing `tests/town.cjs` green |
| **2E Module fixer** | every Stage 1 module 2A and 2B don't own: `src/specials.js`, `src/combat.js` (additions only), `src/mechanics3.js`, `src/act3.js`, `src/kraken.js`, `src/island.js`, `src/settings.js`, `src/quiz.js`, `src/quizBank.js`, `src/upgrades.js`, `src/cosmetics.js`, `src/people.js`, `src/ships.js`, `src/statusfx.js`, `src/krakenView.js`, `src/tags.js`, `src/pops.js`, `fx.css`, `src/audio.js`, `src/env/atolls.js`, `cape.js`, `deep.js`, `src/env/sparrow.js`, `src/walk.js`, `src/quizPanel.js`, `src/buildPanel.js`, `town.css`, and their Node tests and the walk fixture | applies 2A's and 2B's hook requests **during** the stage (the coordinator relays them in rounds), so a Stage 1 API defect never blocks a Stage 2 exit; the six-button places bar (§7.1) and the Powder room rows in `town.css` | every Node suite green; each hook request applied with the harness check of its Stage 1 owner re-run |
| **2C Battle tests** | `tests/battle.cjs` (new sections only), `tests/voyage3.cjs` (new), `tests/balance.cjs` (new, opt-in) | §13.2 battle additions, the Voyage III suite against `?kraken=1` and the opt-in Act I/II balance re-runs | green against 2A's final work |
| **2D Ashore tests** | `tests/ashore.cjs` (new) | §13.2 ashore suite against 2B's harness, then the real game with `?kraken=1` (after 3A) | green against 2B's work |

### Stage 3 — Go live, balance, polish (5 agents)

| Agent | Owns | Delivers | Exit check |
|---|---|---|---|
| **3A Integrator (acts & town)** | `src/main.js`, `index.html`, `style.css`, `src/voyage.js` | everything marked "3" in §11.2: the townMode ctx (`withKraken`, recipes, island builds, quiz rewards, record first), `env.setIsland`/`setVillagers` on dock open, gift and Market lines, the migration, nine cards in three groups, Victory texts and `sailOn`; **sets `WITH_KRAKEN = true`** in the same stage as 3C's test edits | full suite green (with 3C's edits) |
| **3B Balance** | `src/act3.js`, `src/act2.js` (the two new Maelstrom keys only), `src/mechanics3.js`, `src/kraken.js`, `src/specials.js`, `src/shipTypes.js` (new types only), `src/island.js`, `src/upgrades.js` (the `RUDDER` row only), and their Node tests | bot v3 (§13.3) runs; tunes numbers only in their tables (§5.9 order) until every guard passes; records medians in §19 | Node suites green; the §5.9 guards hold; bot results reported |
| **3C Tests** | `tests/smoke.cjs`, `tests/controls.cjs`, `tests/levels.cjs`, `tests/battle.cjs`, `tests/town.cjs`, `tests/voyage3.cjs`, `tests/ashore.cjs`, `tests/balance.cjs`, `package.json` | §13.4 edits exactly; the final new suites; the `npm test` order | the whole suite green; each new check shown to fail on a broken copy |
| **3D Town polish** | `src/env/sparrow.js`, `src/walk.js`, `src/town.js`, `src/townMode.js`, `src/quizPanel.js`, `src/buildPanel.js`, `town.css`, `tests/walk.test.cjs`, the fixture | fixes from in-game screenshots (plots at every tier, villagers, the two new places), hook requests from 3A | walk and town suites green; budgets of §14 |
| **3E Art & sound polish** | `src/people.js`, `src/ships.js`, `src/env/atolls.js`, `cape.js`, `deep.js`, `src/statusfx.js`, `src/krakenView.js`, `src/tags.js`, `src/pops.js`, `fx.css`, `src/audio.js` | fixes from play-through screenshots and the draw-call audit | §14 budgets met |

### Stage 4 — Review and README (1 integrator + read-only reviewers)

A review in seven dimensions (specials and balance, the Kraken's fairness, town and walking, quiz content and tone,
saves and progress, accessibility, performance), each finding checked by an independent verifier; fix agents with
disjoint files; the **README** (Voyage III, special ammo, steering, the quiz, the island, saves, tests); this file's
§19 build record.

### Dependency graph

```
before 0 (item 0) ─▶ 0 ─▶ everything.
1A ─▶ 2A, 2C      1B ─▶ 2A, 2C      1C ─▶ 2A, 2C      1D ─▶ 2B, 3A      1E ─▶ 1O (1b), 2B, 3A      1F ─▶ 2A, 3A
1G ─▶ 1N (1b: NPC looks), 2A      1H ─▶ 1I (1b: anchors), 2A      1I ─▶ 2A      1J ─▶ 2A      1K–1M ─▶ 2A (?kraken=1)
1N ─▶ 2B, 3A      1O ─▶ 2B      (1N, 1I, 1O build on mocks of the §11.1 shapes; Stage 1b re-checks them)
2A, 2B ─▶ hook requests ─▶ 2E (same stage)
2A ─▶ 2C final run, 3A, 3B      2B ─▶ 2D, 3A, 3D      2A + 2B ─▶ 3C
```

---------------------------------------------------------------------------------------------------

## 13. Test plan

Browser suites load `?quality=low`, freeze the real-time loop and drive `G.step(1/120)` (SPEC2 §11), seed with
`G.combat.seed()`, watch page errors, and stay under about 6 minutes each on SwiftShader.

### 13.1 Node (fast, first in `npm test`)

- **`tests/specials.test.cjs`** — the tables exactly; `specialShot` for each special (hull factor, no crit effect, no
  crew, the status id); `applyStatus`: once per volley (the caller's job, checked through a helper), refresh/extend/cap
  for each status, bosses halve, the two immunities, KA-BOOM (+15, stink ends, immunity starts, burn starts), FIRE OUT,
  frost on stinky; `stepStatus` timings in simulated steps; `statusMuls` for each; the shared burn (larger remaining hp
  wins); `douse`; loads: start (4 + Windmill), spend per side, fall back, crates (fewest loads first, 20 gold with none);
  `onSale` at `unlocked` 3/4/5/6/7; `buyRecipe` reasons; `parsePowder` with the full garbage battery of
  `upgrades.test.cjs` (cut JSON, arrays, `__proto__`, `constructor`, throwing getters and proxies, megabytes, deep
  nesting, `1e1`, `2.0`, `2.5`, `Infinity`, negatives, `null`, digit strings); `armourMul` (beam 0.5, rakes 1, no armour
  1; the armour value comes from the type, there is no `ARMOUR` table).
- **`tests/mechanics3.test.cjs`** — with a mock ctx: spouts (form after 3 s + warn bonus, life 22 + 2 s, next ≥ 30 u
  away, pull at r 10 and none at r 15, core damage 4 hp/s, spin, fling after 1.5 s, douse); rogue waves (first at 30 s,
  then 24–32 s, warning ≥ 4 s; a = 49° surf, 50°/130° damage 10 and the push, 131° rides; fire put out on all three);
  ram (wind-up 1.5 s before any surge, contact damage scales with speed, cooldown 6 s, stink cancels); mortar (range
  window, interval 6–8 s, ring warn ≥ 2.2 s, stink pauses); fire ship (lit at 30 u, never explodes before 1.6 s lit,
  blast falloff, sunk-while-lit blast, frost → surrender); ink pots and slicks (≤ 3 slicks, speed ×0.6 inside); flagship
  fall → every other fighting ship flees, `krakenDue` once boarding and struck ships are resolved; `composeMechanics`
  rules of §11.1 with a real `createMechanics` instance (`state` keeps `ids`/`convoy`/`floes`/`current` top-level plus
  `m3`; `objective()` returns a's string unchanged when b's is null; drift summed); Act III levels: every field Act II levels have, known types and ids, bonus and stars rise, ≤ 3 ships a
  wave, `nextWaveAt` keeps ≤ 4 alive.
- **`tests/kraken.test.cjs`** — phase thresholds 400/200; chase speeds; attack counts and intervals per phase; every
  warning ≥ 1.5 s (and + warn bonus); slam damage only inside the ring; **never more than 4 tentacles up** (swaying,
  grabbing, recoiling or sinking) over 600 s of each phase; grab only in phases 2–3, only for a hull inside
  the ring, released by each of cut (3 taps), hold 0.8 s, a hit on that tentacle, a stink hit, and **always by 4 s**;
  **a passive (standing) player is never grabbed within 8 s of a release**, and the first rings after a release land
  ≥ 8 u from the hull; the cut taps/hold, status times and ink numbers come from `ctx.tables` (a test passes altered
  tables and sees them used);
  the head schedule; ink every 12 s in phase 2; pull in phase 3; `cutOff` after 12 s idle (an attack 30 u ahead); spots
  never on land or beyond `worldRadius − 20`; targets list only raised parts; hits: eye ×1.5, tentacle part hp 30 →
  recoil; no rake ever; specials (frost, fire, stink sneeze + 20 s immunity); `done` at 0; determinism (same seed, same
  state after 120 s); junk ctx never throws.
- **`tests/island.test.cjs`** — the table; totals 3,400 / 8,400 / 11,800; `build` order and reasons; perks at every tier;
  villagers 2/4/6 per home, 24 max; gift `5 × villagers × parkMul` capped 240; Market capped 300; ranks at 0, 4, 5, 11,
  12, 19, 20, 29, 30; `parseIsland` with the garbage battery; round trips.
- **`tests/quiz.test.cjs`** — the real bank validates; ≥ 10 per category per band; ≥ 4 `places` with `seas: 0` per band;
  `sumQuestion` correct and well-formed for 10,000 seeds per band (right answer correct, wrong answers distinct, never
  negative, never equal to the right one); `makeRound`: 5 questions, one per category, no repeats, `seas` respected for
  `unlocked` 1..9, `seen` avoided while the pool allows, the answer order depends on the seed and the right answer is in
  every position over many seeds; `stars` 0..3; `reward`: gold only for unpaid stars, the 2,610 total, `GOOD_TRY` once
  per island, nothing on replays; owed gold (stars above `paid`) paid once by the next `reward` and never twice after
  `markPaid`; `openLevels`; `parseQuiz` with the garbage battery, the star-chain rule and `paid ≤ stars`; round trips.
- **`tests/settings.test.cjs`** — defaults, both modes, the garbage battery.
- **`tests/combat.test.cjs`** (appended) — `armourMul`; every new ship type passes the existing per-type checks.
- **`tests/upgrades.test.cjs`** (appended) — `RUDDER` table and costs (970), `SHIPYARD` total 6,240, sparse `up.rudder`
  (absent at 0, written at ≥ 1, junk tiers clamped), `playerType` `turnLow` and `turn` at every rudder tier with every
  sails tier, `statText('rudder', t)`.
- **`tests/cosmetics.test.cjs`** (edited per §13.4 + appended) — the four trophies, their feats, the new faction looks
  emit only accepted options; the trophy minimums equal `QUIZ_LEVELS.length` (9), `3 × QUIZ_LEVELS.length` (27) and
  the `PLOTS` tier total (30), read from quiz.js and island.js as `data:` URLs.
- **`tests/walk.test.cjs`** (edited per §13.4 + appended) — the new places reachable from the spawn and each other; every
  camBlocker over a plot envelope; no new walkable area or link; Bess and Barnacle ≥ 1 u from every walker path and
  villager loop, ≥ 2 u from bridge mouths and doorways.

### 13.2 Browser suites

**`tests/battle.cjs`** (new sections, any level, ships spawned with `G.spawn`)
- Special ammo: keys 4–6 by `e.code`, not owned → the reason in the hint; R cycles over owned specials with loads;
  every broadside of a special spends one load per side; `Space` with one load left: one side special, the other round
  in the same step (no `AMMO_SWAP` delay, no click), the "Out of …" hint and `#game-live`; a queued Fire tap spends a
  load only when it fires and is dropped by an ammo change; the touch tray: opens from Ammo only with a recipe owned,
  one tap picks, closes on a fire tap / elsewhere / 3 s, never pauses; the F01 layout probe with the tray **open** at
  the 10 sizes (no overlap with the fire, steer, sail or act pads, the hint or the gun card; the §6.2 placements).
- The fire ship's grapple: refused with "Too hot to board! Freeze her first." and the too-hot tag icon until she
  strikes, then taken for 85 gold.
- Statuses on a spawned privateer: a 3-gun fire volley applies one burn (3 hp/s for 6 s, 18 total, no regen); frost cap
  ×0.5 for 5 s and +2 s per volley to 8; stink: speed to 0, no shot fired for 4 s, then 10 s immune ("Clothes-pegs!");
  KA-BOOM +15; FIRE OUT; bosses half; the Maw IMMUNE to fire, the Phantom to stink; a burning ship refuses the grapple
  with the words, the tag icon and the Board cell `HOT!`; a stinky raider's hooks drop; statuses cleared on strike and
  capture (a burn never sinks a prize); the burn pauses in a boarding; statusfx draws (instance counts) and ≤ 8 calls.
- Iron Turtle: beam ×0.5 with CLANG!, a stern rake full ×2, fire's burn ignores armour.
- Steering: the rudder tiers change the turn rate at speed 0 and at full speed by the table; `input.steer` from a
  synthetic slide (≥ 12 px) turns proportionally, a plain hold still gives ±1, `input.left/right` stay booleans; the
  wheel setting replaces ◀ ▶, is saved, and keyboard steering is unchanged; `launchBomb`'s prediction uses
  `playerTurn()`.
- Audio: offline renders of every new SFX.

**`tests/voyage3.cjs`** (new; Voyage III live)
- Cards 7–9 under "Voyage III · The Kraken Seas"; card 7 "Beat the Phantom Galleon"; the migration (a store with
  `unlocked 6` + `legend 1` opens card 7 at load; `legend 0` doesn't); the Maelstrom's Victory "Sail on to the Kraken
  Seas" and Enter start level 7 with the voyage gold; the dock exits after it.
- Each level: the layout rules, `crateSpots`; L7 spouts (warning, pull, core damage, spin, douse), sharks ram (wind-up ≥
  1.5 s, 10 and 8 damage, CRUNCH!); L8 rogue waves (side-on 10, bow-in none, stern-on surf, fire put out), Iron Turtles,
  fire ships (blast, sunk-while-lit blast, frost → surrender → 85 gold); mortar rings; L9 geysers, the Inkheart's ink
  pots and slicks, skiffs board.
- The finale: the Inkheart's fall → the crew flee (no loot, no feat), geysers stop, the rise after the boarding's
  result; the rise skippable by a key; under reduced motion (`emulateMedia`) no camera glide, no shake; the Kraken's
  targets light FIRE! and the auto-aim fires at them; the boss bar with notches; a grab released by each of the four ways
  and by 4 s at most; G with nothing grabbing says "You can't board a sea monster!"; the cut-off when fleeing; driven
  off → the Pearl (+1,000), the baby kraken, feat `kraken` saved, the final Victory text, Enter → title; sunk in the
  fight → `#kraken-retry-btn` → the rise again with a full hull and the plunder from the rise.
- **Bot v3** (late-game profile, §5.9), one seeded run each in CI: L7–L9 each cleared within 900 s sim (a second try
  allowed) **with specials** and **with none**; never stuck (no 60 s without progress); the Kraken fight ≤ 240 s;
  never inside land. The two-sided band (fight 120–180 s) and the order L7 < L8 < L9 are **not** CI assertions (single
  runs aren't deterministic: aim spread and lava scatter use `Math.random`); they are Stage 3's offline 24-seed medians,
  recorded in §19. **The Act I and Act II bots with every recipe owned and the Windmill at 3** ("Volcano > Europe",
  "Maelstrom > Doubloon Bay") run in an opt-in suite, `npm run test:balance` (`tests/balance.cjs`), not in `npm test`,
  so `voyage3.cjs` stays near the ~6-minute budget.
- Draw calls: each Voyage III level start ≤ 310; the busiest sampled play ≤ 450; the Kraken fight ≤ 450; the 568×320
  banner check of levels.cjs for levels 7–9; screenshots `atolls.png`, `cape.png`, `deep.png`, `kraken-rise.png`,
  `kraken-fight.png`, `statuses.png`.

**`tests/ashore.cjs`** (new)
- Places bar of six (ids `shipyard, tailor, tavern, quiz, builder, ship`; 44 × 44 icon-only with `aria-label`s below
  760 px wide and on short landscape): at the 7 town sizes it fits between the joystick and the action button, no
  button < 44 px, no overlap, no page scroll; the Harbour menu lists Quiz and Build; E / Enter at the bell and at Bess
  open their panels; a places-bar tap walks to each; Esc goes back; focus returns to the place's button.
- **Walking bug, every walker** (§0.3): with 8 villagers out (an island record of four Manors), (a) 30 s of random keys,
  stick drags and taps never leave the captain stuck for more than 1 s; (b) a held key, a held stick and a tap-to-walk
  each cross every walkable bridge (`plazaS1`, `plazaYard`, `plazaGarden`, `tavernTower`) in both directions, started at
  10 moments of the villagers' rounds, every run gets across; (c) the porter check of `4465587` still passes; (d) no
  villager ever stops inside a place circle, a doorway, the gangplank or on a bridge (sampled over 120 s).
- Quiz: by keyboard only (Digit1–4, Enter, H, Esc) and by taps; a seeded round; 3/4/5 right → 1/2/3 stars and the gold
  of §7.2 once; replays pay nothing; "Good try!" once; a wrong answer shows ✓ on the right one and the fact, no buzzer
  (the `bonk` SFX); the next island opens; `#quiz-live` texts; held Enter answers once; storage full → stars shown, no
  gold, the words, and once storage works again the owed gold is paid exactly once; the record survives a reload;
  corrupt `-quiz` falls back and is rewritten.
- Build: build a Cottage (100) → record then chest, the montage (skippable, a fade under reduced motion), 2 villagers;
  poor → `aria-disabled` + "Need … more gold", focus kept; double-click builds once; storage full → refused at no cost;
  every plot to tier 3 → rank Pirate Capital and the Governor's coat unlocked at Polly's; the gift and Market lines on
  the next level-cleared card (capped); the Bakery's patch at reinforcements; the Windmill's loads; the Lighthouse's
  longer warnings (measured on a lava bomb); the School's lifebuoys; the walk fixture unchanged by any purchase.
- Tavern Powder room: the three rows (outside `#tavern-up-list`), on sale by progress with the reason, buying saves
  `-powder` then the chest; the rumour board's powder tips.
- Two tabs: island tiers, quiz stars and recipes bought in one tab show in the other and never go down.
- Layout at the 7 town sizes for the quiz and build panels (no page scroll, ≥ 44 px, answers ≥ 56 px, contrast ≥ 4.5:1);
  draw calls: the town walk with every plot at tier 3 + 8 villagers + both NPCs ≤ 450 at the 30 spots × 8 headings probe,
  the shipyard view ≤ 450 with the development layer, the quiz and build views ≤ 450; from every shipyard showcase pose
  (the sway's extremes at the 6 shipyard layout sizes) rays to 12 points of the docked ship hit no plot envelope with
  every plot at tier 3; screenshots `quiz.png`,
  `build.png`, `island-tier3.png`.

### 13.3 Bot v3

Bot v2 (SPEC2 §11.3) plus: picks Fire on Iron Turtles, Frost on fire ships and charging sharks, Stink on ketches, on a
Kraken grab and before boarding; dodges every warning ring (lava, lightning, geyser, shell, ink, slam) like lava; keeps
> 16 u from spout cores; turns bow-in or stern-on to a warned rogue wave; holds G to cut a grab; shoots Kraken targets.
The no-specials run sets the powder record to none. Stage 3 runs 24 seeds per level per profile offline and records the
medians in §19; the suite runs one seeded run each.

### 13.4 Existing assertions that change — and only these

| Row | File:line (at `4465587`) | Today | Becomes | Stage |
|---|---|---|---|---|
| C1 | `tests/cosmetics.test.cjs:93` | `DEFAULT_FEATS` with 5 counters | + `kraken: 0, quiz: 0, stars: 0, island: 0` (before `prizes`) | 1F |
| C2 | `tests/cosmetics.test.cjs:94` | `SPEC_FEATS_TEXT` | + `"kraken":0,"quiz":0,"stars":0,"island":0` before `"prizes"` | 1F |
| C3 | `tests/cosmetics.test.cjs:95` | `ALL_FEATS` | + `kraken: 1, quiz: 9, stars: 27, island: 30` | 1F |
| C4 | `tests/cosmetics.test.cjs:105` | `PERSON_OPTS.hat` list | + `'mortarboard'` | 1F |
| C5 | `tests/cosmetics.test.cjs:123` | `PERSON_OPTS.pet` list | + `'octopus'` | 1F |
| C6 | `tests/cosmetics.test.cjs:257` | `trophies.length === 4` | `=== 8` | 1F |
| C7 | `tests/cosmetics.test.cjs:269` | `FEAT_IDS` = the five | + `'kraken', 'quiz', 'stars', 'island'` | 1F |
| C8 | `tests/cosmetics.test.cjs:66, :67, :73` | `CATALOGUE` trophy maps: hat `{ crown }`, coat `{ admiral }`, pet `{ golden }` (compared at :232) | hat + `mortarboard: ['quiz', 9]`; coat + `governor: ['island', 30]`; pet + `octopus: ['kraken', 1]`, `rainbow: ['stars', 27]` | 1F |
| C9 | `tests/cosmetics.test.cjs:465` | the field-by-field fallback literal `{ captures: 0, boardings: 4, rakes: 0, crits: 12, legend: 1, prizes: {} }` | + `kraken: 0, quiz: 0, stars: 0, island: 0` before `prizes` | 1F |
| C10 | `tests/cosmetics.test.cjs:539` | the 300 random feats have the five counters | + `kraken` (0/1), `quiz` (0..9), `stars` (0..27), `island` (0..30) from the same `rng()` | 1F |
| W1 | `tests/walk.test.cjs:85` | places `['ship', 'shipyard', 'tailor', 'tavern']` | `[…, 'quiz', 'builder']` (the order sparrow.js emits) | 1N |
| W2 | `tests/fixtures/sparrow-walk.json` | today's walk data | regenerated once from the live `env.walk` | 1N |
| S1 | `tests/smoke.cjs:116` | `cards.length === 6` | `=== 9` ("9 level cards") | 3C |
| S2 | `tests/smoke.cjs:118–119` | Easy … Legendary on cards 0–5 | + `/Daring/`, `/Fearsome/`, `/Mythic/` on cards 6–8 | 3C |
| K1 | `tests/controls.cjs:384` | `'too large'`: `unlocked: '7'` → 6 | `unlocked: '10'` → 9 | 3C |
| K2 | `tests/controls.cjs:1222` | `wantOrder` of six Buy buttons + the exit | `'buy-rudder'` before `'dock-title-btn'` | 3C |
| K3 | `tests/controls.cjs:1453` | `lay.buys === 6` | `=== 7` | 3C |
| K4 | `tests/controls.cjs:1876–1889` (`CHOICES` at :1555) | the pause dialog at the touch sizes lists `resume-btn,quit-dock-btn,quit-menu-btn` | at the five touch sizes: `resume-btn,quit-dock-btn,quit-menu-btn,steer-mode-btn` (the toggle is shown once `WITH_KRAKEN`, §6.3); `CONFIRM` and the desktop sizes unchanged; the layout probe (no panel scroll, 44 px, uncovered) still passes with it | 3C |
| L1 | `tests/levels.cjs:417` | `WORDS` of six | + `'Daring', 'Fearsome', 'Mythic'` | 3C |
| L2 | `tests/levels.cjs:418` | the order string ends `C6` | + ` \| H:Voyage III · The Kraken Seas \| C7 \| C8 \| C9` | 3C |
| L3 | `tests/levels.cjs:420` | `c.heads.length === 2` | `=== 3` | 3C |
| L4 | `tests/levels.cjs:422–423` | two rows of three | three rows of three, each heading between its rows | 3C |
| L5 | `tests/levels.cjs:425` | `cards.length === 6` | `=== 9` | 3C |
| L6 | `tests/levels.cjs:427` | `"Difficulty N of 6"`, `all === 6` | `of 9`, `all === 9` | 3C |
| L7 | `tests/levels.cjs:429` | card 4 "Beat the Molten Maw", `[1, 2, 4, 5]` "Locked" | + card 7 "Beat the Phantom Galleon"; `[1, 2, 4, 5, 7, 8]` "Locked" | 3C |
| L8 | `tests/levels.cjs:502` | Tab reaches all 6 cards | all 9 | 3C |
| L9 | `tests/levels.cjs:608` | after the Maelstrom: the legend text, no `#act2-btn`, no hint, Main menu primary | text = the legend text + " " + `ACT3_TEASER`; `#act2-btn` "Sail on to the Kraken Seas" shown; the hint shown; legend 1 | 3C |
| L10 | `tests/levels.cjs:610` | the Maelstrom's banner `/The seas are yours/` | `/The Far Seas are yours/` | 3C |
| L11 | `tests/levels.cjs:611–614` | Enter after the last level goes to the title | Enter after the Maelstrom starts level 7 (the "last level → title" check moves to L9 in `voyage3.cjs`) | 3C |
| L12 | `tests/levels.cjs:1194` | `locked.length === 3` (cards 4–6) | `=== 6` (cards 4–9); the `tabs.join() === 'card4,card5,card6'` part stays (it presses Tab three times from card 3) | 3C |
| L13 | `tests/levels.cjs:1234` | `'PPPLLL'`, `'PPPPPL'` | `'PPPLLLLLL'`, `'PPPPPLLLL'` | 3C |
| L14 | `tests/levels.cjs:430` | `c.cards.slice(3)` names = `Doubloon Bay,Frostbite Straits,The Maelstrom` | `slice(3, 6)`, plus `slice(6)` = `The Turtle Atolls,The Cape of Storms,The Kraken's Deep` | 3C |
| B1 | `tests/battle.cjs:409` | `levels.n === (levels.act2 ? 6 : 3)` | `levels.n === 9` | 3C |
| B2 | `tests/battle.cjs:2668` | `count === 6` (`?act2=1`) | `=== 9` | 3C |

The title's tagline and page description keep "Far Seas" (§6.6), so `levels.cjs:432` needs no row.

**Additions only** (no existing check changes): `combat.test.cjs`, `upgrades.test.cjs`, `walk.test.cjs` new checks;
`battle.cjs` new sections; `town.cjs` none required (its places loop over four places still passes); the smoke "level
layouts are sane" and draw-call loops cover levels 7–9 automatically (they iterate `LEVELS.length`).

**Unchanged and must pass as they are:** every `mechanics.test.cjs` check (levels.js keeps six levels, the Maelstrom's
pinned fields are untouched), every `upgrades.test.cjs` and `armory.test.cjs` check (the ship and armory records' texts
are untouched), the controls.cjs ship battery (`1272–1300`), the tavern's four rows and `buys === 4` (`town.cjs:805`), the
Harbour menu's `>= 5` buttons, the smoke dock checks (`peopleCount` counts every new person; the new NPCs and villagers
use the light build), the touch steering and F07 checks (no slide below 12 px), the A11Y and TOWN regressions, the porter
check, `server.test.cjs`, `audio.cjs`.

`package.json` `"test"`: `combat, specials, armory, cosmetics, walk, mechanics, mechanics3, kraken, island, quiz,
settings, upgrades, server` (Node) then `smoke, controls, audio, battle, levels, town, voyage3, ashore` (browser): 21
suites, with a `test:<name>` script for each; plus the opt-in `test:balance` (not in `"test"`).

---------------------------------------------------------------------------------------------------

## 14. Performance budgets (draw calls = `renderInfo.calls`, both outline passes, `?quality=low`, 1280×720, stock ship)

| Scene | Budget | Today | Planned additions |
|---|---|---|---|
| Voyage III env alone | ≤ 220 | — | statics merged (`mergeStatic` / vertex-colour bake); rain curtains, jellyfish, foam: one mesh or InstancedMesh each; spouts ≤ 4 meshes each (`noOutline`); the rogue wave ≤ 4 |
| Voyage III level start | ≤ 310 | — | env ≤ 220 + ships + helm captain + tags |
| Voyage III busiest (a wave of 3 + a leftover, a boarding, statuses, hazards, rings, crates) | **≤ 450** | — | ≤ 4 ships alive; statusfx ≤ 8; status badges ≤ 4; warning rings ≤ 6; crates ≤ 2; slicks 1 InstancedMesh |
| The Kraken fight | **≤ 450** | — | the Kraken ≤ 30 (body ≤ 5, 4 tentacles ≤ 16, eyes 2, shadow 1); no other ships; rings ≤ 4 (the 4-tentacle cap of §5.7.3, sinking ones included) |
| Act I/II level starts with the update | ≤ today + 4 | L1 299, L4 274, L5 271, L6 297 (re-measured after the phone-battle fix, §0.3) | the keg rack (recipes owned) and rudder props on the player |
| Town walk view, every plot at tier 3, 8 villagers, Bess, Barnacle, 2 prize ships (30 spots × 8 headings) | **≤ 450** | 371 | development layer ≤ 6 (≤ 3 outlined meshes × 2 passes), animated parts ≤ 6, villagers ≤ 40, NPCs ≤ 10, bell/chalkboard/easel baked → ≈ 433 |
| Shipyard view | ≤ 450 | 297–341 | development layer ≤ 6 + animated ≤ 6; villagers hidden; NPCs + 10 |
| Quiz view / build view | ≤ 450 | — | the captain + Barnacle + Quizzle ≈ 20 / the island framed: the walk view's numbers |
| Per new ship model | ≤ the Man-o'-War's calls (the Inkheart ≤ 1.3×) | — | — |
| Per person | 3 material groups; the light build (`detail: 'low'`, ≤ 4,000 triangles) for villagers and NPCs; the dock frame ≤ 1.5M triangles (smoke check) | — | `share: true` |

CPU: the Kraken model and the next wave's ship meshes are **prebuilt hidden, one mesh per frame** (the Kraken during
L9's fly-in and wave 1; every level's next wave from 2 s after a wave spawns), so the rise and reinforcements never
stall a frame (PERF-4). The development layer rebakes in ≤ 40 ms behind the dust puff or the "Rowing to…" toast;
villagers are built on dock open. statusfx and the tags' dots are instanced (1 call each kind). Pops stay DOM.
**Drop order** if a budget is exceeded: villagers 8 → 6 → 4, spout spray skirts, jellyfish (120 → 60), crate glow rings,
status flies and stink lines, prize ships in town, the windmill's powder smoke, tentacles 4 → 3.

---------------------------------------------------------------------------------------------------

## 15. Accessibility requirements (checked in Stage 4; SPEC2 §13 holds)

- Every new control is a real `<button>` (or a tab) with a name, a visible focus ring and ≥ 44×44 px (quiz answers ≥ 56 px
  tall); states use icon + text + colour; out-of-reach buttons stay focusable with `aria-disabled` and a described reason.
- Small text ≥ 4.5:1 (the `--*-text` tokens on paper); pop text ≥ 24 px white with a 3 px ink outline.
- **Statuses read by shape and word, never colour alone:** snowflake / flame / stink cloud badges, FROZEN! / ON FIRE! /
  STINKY! pops, `#game-live` lines; one badge per tag; the effects are drawn on the ship (no icon zoo).
- Live regions: `#game-live` (battle, ≤ one per 1.5 s; Kraken warnings ≤ one per 3 s), `#quiz-live`, `#build-live`,
  `#town-live`, `#tavern-live` — polite, de-duplicated like `announce()`.
- Panels (quiz, build) are **non-modal** like the tavern, focus on their first control on open, Esc back to town, focus
  returned to the place's button; every place is in the places bar and the Harbour menu (keyboard and screen-reader users
  never need to walk).
- **Mashing is never required:** a Kraken grab is cut by holding G or CUT! for 0.8 s and always lets go within 4 s; the
  quiz has no timer and no lives.
- **Touch:** ◀ ▶ stay the default and the accessible steering; the wheel is opt-in and `aria-hidden`; no tap-the-sea; no
  new act-pad button; the tray never pauses the game and never covers the fire or steering pads.
- **`prefers-reduced-motion`:** the Kraken's rise is a cut; no camera glide (rise, plot focus, Go ashore), no shake of any
  kind (slams, waves, blasts, rams), no hit-stop, no bounce (the build montage fades, the stars fade in), no swirling
  stink or bobbing ice, no camera bob from rogue waves, the wheel snaps back at once.
- **Photosensitivity:** the Kraken's eye and every glow pulse at ≤ 1 Hz; flash overlays (KA-BOOM, the fire ship's blast)
  ≤ 0.25 opacity and ≤ one per 3 s; lightning keeps SPEC2's caps; the lighthouse beam never flashes; nothing strobes.
- **Sound:** no sound only below phone-speaker range (the 40 Hz drone carries harmonics at 80–240 Hz); a wrong quiz answer
  is a soft `bonk`, never a buzzer; every new warning has a sound **and** a visual **and** a word.
- Layouts pass at 320×480, 360×480/640, 390×844, 568×320, 640×360, 844×390, 1024×600, 1280×720 (battle with the tray
  open; the title with nine cards; the town with six places; the quiz and build panels).

---------------------------------------------------------------------------------------------------

## 16. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Scope: three seas, six ship models, the Kraken, ten plots × 3 tiers, two NPCs, villagers, two panels, 120 questions | SPEC2's proven pipeline (seams first, pure modules and envs in parallel, one integrator per stage); building tiers are add-on prop kits on one development layer, not three models each; the skiff is a raider variant; the cut list (§17), cheapest polish first |
| Special ammo flattens Voyages I–II or Voyage III | staggered sale dates; 4 loads a level; weaker hull factors; bosses halve; stink immunity; the bot guards of §5.9 (0-load wins, Act I/II order with specials) |
| The Kraken too hard, too long or stalling | 600 hp; every attack ≥ 1.5 s telegraphed; outrunnable phase 1; the 12 s cut-off; grabs end by 4 s and never chain (8 s grab-free after a release); ≤ 4 tentacles up; the checkpoint; bot-tuned to 2–3 minutes |
| The Kraken isn't a ship (aim, FIRE!, hits, minimap) | `targetsFor()` pseudo-targets (§5.8), seamed in Stage 0, tested by `voyage3.cjs` |
| L9 overload | one hazard set before the rise, nothing but the Kraken after it (§5.6) |
| More walkers, more deadlocks (the reported bug) | villagers use the built LOOK-2 + squeeze-past; path rules (§8.4); `ashore.cjs` crossing every bridge with 8 villagers; no new walkable decks or bridges |
| Town draw calls and readability | fixed plots on today's platforms, one baked layer, height caps, camBlockers from tier 0, the shipyard ray probe, villagers capped and culled |
| main.js (6,077 lines) single-owner bottleneck | rules in pure modules; Stage 0 seams; two integrator roles (battle in Stage 2, acts and town in Stage 3); hook requests |
| Test churn | the go-live flag; sparse `up.rudder`; recipes in their own record; specials outside combat.js's pinned tables; `voyage.js` keeps levels.js at six; the exact list of §13.4 |
| Quiz facts wrong or unkind | short well-known facts, the validator, `seas` gating, the Stage 4 read of every question, child-safe history only |
| Phones: a crowded HUD | the tray on demand only (above the act pad), no new act-pad button, a 44 px icon-only places bar below 760 px and on short landscape, the F01 probe at 10 sizes |
| PERF-4 stutters at the rise or at reinforcements | one-mesh-per-frame prebuilds (§14) |

---------------------------------------------------------------------------------------------------

## 17. Cut list (cut from the top; each cut leaves a consistent game)

1. The baby kraken climbing aboard (the pet trophy stays).
2. Villagers' greetings and move-in waves.
3. The construction montage (the building appears in a dust puff).
4. Town rank, the plaque and the Governor's coat.
5. Powder crates.
6. The wheel steering setting (the thumb slide and the rudder stay).
7. The Kraken's ink spit and slicks in phase 2 (the Inkheart keeps hers).
8. Sea geysers on L9.
9. Quiz islands 7–9 (bands 1–2 stay; the mortarboard needs `quiz ≥ 6`, the Rainbow macaw `stars ≥ 18`; quiz gold
   becomes 1,290 + 60 = 1,350; the bank's band-3 rules go).
10. Amenities down to Bakery, Windmill and Lighthouse (Market, School, Park cut; the School's lifebuoys go).
11. Level 8 entirely: its Iron Turtles join L9's first wave and its fire ships too, in place of a skiff (`['fireship',
    'skiff', 'ironclad']`: ≤ 3 ships, and the two rammers still never share a level); rogue waves go with it; L9 takes
    the fire-ship rumour line; eight cards (§13.4's 9s become 8s).

(The Kraken's grab is **never cut**: §1.)

**Never cut:** see §1.

---------------------------------------------------------------------------------------------------

## 18. Defaults the player can change (built unless the player says otherwise)

1. **The Kraken is driven off, not slain** (same win, a kinder ending, and a baby kraken that likes you). Or should it
   be defeated outright?
2. **Special ammo is a recipe bought once, with loads refilled every level** (no shopping for every shot). Or would you
   rather buy kegs one by one?
3. **Fire shot goes on sale after the Volcano, Frost after Frostbite Straits, Stink after the Maelstrom** (one new toy at a
   time). Or all three earlier?
4. **The quiz has no timer** and pays gold only for new stars. Or an optional hourglass for bonus gold?
5. **The ship's wheel is an option** in the pause menu; the arrows stay the default. Or the wheel by default on phones?

---------------------------------------------------------------------------------------------------

## 19. Build record (filled in by Stage 3 and Stage 4)

Every place where the build differs from this plan, every tuned number (with the bot medians) and every review finding
that changed something, with the section it touches, as in SPEC2 §17. Empty until Stage 3, apart from the pre-build
spec check below.

### Spec check (pre-build)

Each issue was re-checked against this file and the code at `4465587` before any build stage; all were confirmed
except the one part noted under T-LEVELS-UNLISTED.

| Issue | What changed |
|---|---|
| S0-EXIT-ACT3-STUB | §12 Stage 0: the `act3.js` stub exports three placeholder defs (env, difficulty, `act: 3`, stars 7–9, scene, lockText, bonus, the AI fields, `waves: [['cutter']]`), so `?kraken=1` really shows 9 cards and starts 7–9. |
| T-COSMETICS-UNLISTED | §13.4 rows C8 (CATALOGUE trophy maps :66/:67/:73), C9 (fallback literal :465), C10 (random feats :539); 1F owns C1–C10. |
| API-PLACE-ID | One place id, `builder`, in `walk.places`, townMode `PLACES`, `data-place` and the Harbour button; only the view is `'build'` (§7.1, §8.3, §11.1, App. A). |
| T-LEVELS-UNLISTED | Row L14 (levels.cjs:430 `slice(3, 6)` + cards 7–9 names); §6.6: the tagline and meta description keep "Far Seas" (:432 unchanged). **Refuted in part:** the A11Y-5 `tabs` check presses Tab three times from card 3, so it still reads `card4,card5,card6`; L12 notes it stays. |
| T-PAUSE-TOUCH | `#steer-mode-btn` shown only on touch **and** `WITH_KRAKEN`, last in `#pause-choices` (§3.2, §6.3, App. A); row K4 for the touch pause checks at go-live; §6.5's claim corrected (bit 32768 does fire at go-live, as a badge). |
| S0-TURNRATE | `turnRate(ship, { full })` with the `fullRate` branch and the player's `boarding.turnScale`; enemies' `turnLow` = `RUDDER.values[0]`; the helm keeps raw input until Stage 2; `launchBomb`'s prediction change noted (§3.1, §11.2, §12). |
| S0-COMPOSE | `composeMechanics([a, b])` takes instances; `state = { ...a.state, m3: b.state }`, `objective` unchanged when b's is null, drift summed; implemented in full in Stage 0, 1B inherits it (§11.1, §11.2, §12, §13.1). |
| CODE-BUYUPGRADE | `buyUpgrade` looks up `SHIPYARD` and uses `(up[id] ?? 0) + 1`; upgrades.js `upgrade()` searches `SHIPYARD`; the rudder keeps the shipyard's storage rule, named as the one exception (§0.1, §10.2, §11.1, §11.2). |
| KRAKEN-TENTACLE-COUNT | Sway 4 s + sink ≤ 0.5 s; a hard cap of 4 up (oldest retired); kraken.test and 1C exit check it (§5.7.3, §11.1, §13.1, §14). |
| KRAKEN-GRAB-CHAIN | No grab within 8 s of any release; the first rings after a release land ≥ 8 u from the hull; tested (§5.7.3, §13.1, §16). |
| FIRESHIP-BOARD | A fire ship that hasn't struck can't be grappled ("Too hot to board! Freeze her first.", too-hot icon); her blast ends a boarding only by sinking a ship (`cancel('sunk')`) (§2.4, §4.2, §11.2, §13.2). |
| KRAKEN-PSEUDO-HP | Wrapper gains `hp`, cached per part per rise; beam-on `shotResult`; `damage()` returns right after `kraken.hit()` (§5.8, §11.2). |
| PHONE-FIX-REBASE | §0.3 item 2: the coordinator re-bases baselines, line anchors, tag cue priority and tip bits after the fix; queued taps re-check, spend a load only when they fire and drop on an ammo change; portrait framing reads `targetsFor()` and yields to the rise camera (also §6.4, §6.5, §14). The fix itself isn't in the tree, so its file list is stated as "may touch". |
| STAGE2-NO-OWNER | New Stage 2 agent 2E owns every Stage 1 module and `town.css` and applies hook requests within the stage; 1N/1I/1O build on mocks and are re-checked in Stage 1b (§12, graph). |
| LAYOUT-TRAY | The tray sits above the act pad, right-aligned, with per-size placements; the hint bubble moves clear while it is open; the act pad joins the overlap list (§6.2, §13.2). |
| LAYOUT-PLACES-BAR | 44 × 44 icon-only buttons, 4 px gap, below 760 px and on short landscape (≈ 300 px for six), only for the six-button bar; ashore.cjs probes it; 2E owns `town.css` in Stage 2 (§7.1, §13.2, §16). |
| CUTLIST-CONSISTENCY | The grab cut item removed (it is never-cut); item 9 lowers the macaw to 18 stars, the mortarboard to 6, quiz gold to 1,350; the L8 cut sends fire ships to L9's wave 1 (§17). |
| QUIZ-SEAS0-BAND1 | "bands 1, 2 and 3 (today 3, 1 and 0)" (§7.5). |
| FINALE-SUMMARY | Gift and Market paid on every cleared level including finales, lines in `#won-chest` on finales; `KRAKEN.pearl` added to `state.gold` before banking (§5.7.1, §6.6, §8.1, §11.1, §11.2). |
| SPECIAL-FALLBACK-SWAP | The out-of-loads fallback sets `state.ammo = 'round'` directly: no `AMMO_SWAP`, no click (§2.5, §11.2, §13.2). |
| STINK-BOARD-PREVIEW | A stink pauses on both ships from the grapple to the `result` (§2.2, §2.4, §11.2). |
| DUP-NUMBERS | `ARMOUR` table dropped (the type's `armour` is the number); `createKraken` reads `ctx.tables` (`STATUS`, `INK`, `RAIDERS`); `KRAKEN.pearl`; trophy minimums cross-checked by a Node test (§5.7.3, §5.7.5, §11.1, §13.1). |
| TAGS-DOTS | 21 instances per tag (13 + 8), 12 × 21 = 252 (§6.4). |
| ECON-REPLAYS | "about one replay of Voyage III"; "14–23 on a Voyage III level with crates" (§2.5, §9). |
| TIER0-CAMBLOCKERS | The tier-0 camera difference is accepted and documented; tier-0 comparisons use showcase poses and fixed views; §1's line reworded (§1, §8.1, §12 1N). |
| MIGRATION-LEGEND | One rule, `legend ≥ 1 and unlocked ≥ 6`, with the capture-then-sunk edge case accepted (§5.2, §10.3). |
| KEYMAP-STUB | Stage 0 widens the `ammoKey` regex to `[1-6]` (4–6 no-ops) and leaves `KEYMAP` alone (§6.1, §11.2, §12). |
| BOT-FLAKY-SLOW | CI asserts clear / not stuck / fight ≤ 240 s; the 120–180 s band and L7 < L8 < L9 are offline medians; the Act I/II re-runs move to the opt-in `test:balance` (§5.9, §12, §13.2, §13.4). |
| DEVLAYER-CALLS | The development layer is ≤ 6 calls (≤ 3 outlined meshes × 2 passes); the town estimate is ≈ 433 (§8.2, §14). |
| QUIZ-REWARD-LOSS | The quiz record gains `paid`; gold counts as paid only when both writes succeed, else the chest write is rolled back and the gold stays owed; `markPaid`/`owed` in quiz.js; tested (§0.1, §7.2, §10.1, §10.2, §11.1, §13). |
| SMALL-FACTS | (a) `.pad.left`, not `.pad.steer`; (b) LOOK-2's waiting is in sparrow.js; (c) tags treat `status.id == null` as none; (d) Bess and Barnacle ≥ 1 u from every walker path; (e) the class `overlay` makes the new screens inert, the DOM order is for painting; (f) a special ball launches with the round shot's sound (§0.2, §6.2–6.4, §8.4, §11.2, §12, App. A). |

---------------------------------------------------------------------------------------------------

## Appendix A — DOM ids added in Stage 0 (all start `hidden`)

Battle (`#hud`): `#ammo-count` (in `#gun-ammo`), `#ammo-tray` (touch; six `button[data-ammo]`), `#steer-needle` and
`#touch-wheel` (in `.pad.left`, the steering pad), `#boss-notches` and `#boss-status` (in `#boss`), `#grab-strip`,
`#edge-arrow`.
Pause dialog: `#steer-mode-btn` (`.touch-only`, last in `#pause-choices`, shown only when `WITH_KRAKEN`). Shipwreck
panel: `#kraken-retry-btn` (first button).
Town: `#town-places` gains `button[data-place="quiz"]` and `button[data-place="builder"]` (between Tavern and Set sail);
`#harbour-dialog` gains `#harbour-quiz-btn` and `#harbour-build-btn`; `#tavern-screen` gains `#tavern-powder-list` (after
`#tavern-up-list`).
New overlays (class `overlay`, which makes them part of the inert `backdrops`; placed before `#recover-screen` so it
paints above them): `#quiz-screen` with `#quiz-panel`, `#quiz-title`, `#quiz-chest`,
`#quiz-map`, `#quiz-question`, `#quiz-answers`, `#quiz-lifebuoy`, `#quiz-next-btn`, `#quiz-results`, `#quiz-leave-btn`,
`#quiz-back-btn`, `#quiz-live`; `#build-screen` with `#build-panel`, `#build-title`, `#build-chest`, `#build-tab-homes`,
`#build-tab-amenities`, `#build-homes`, `#build-amenities`, `#build-back-btn`, `#build-live`.

## Appendix B — How the designs were merged

**Base: arcade** — Voyage III of three levels with the flagship then the hunting Kraken (driven off, with an outrunnable
phase 1, a checkpoint at the rise and a 2–3 minute fight); special ammo bought once as a recipe with loads refilled
every level; the rudder in the shipyard with a low-speed turning floor; the thumb slide on ◀ ▶; the Shark Raider, Bomb
Ketch and Iron Turtle; waterspouts, rogue waves and geysers; nine quiz islands with stars paid once and a one-line bank;
the island on today's shack platforms (tier 0 = today), four homes and six amenities with one perk each, villagers in
`env.folk()`; the pure modules `kraken.js`, `island.js`, `quiz.js` and the separate `krakenView.js`, `quizPanel.js`,
`buildPanel.js`; the 6,240 / 11,800 / 2,610 sums.

**From depth:** the save migration (legend → level 7); the balance guards (0-load wins, Act I/II order with specials);
the Kraken's parts as ship-like targets for the aim, FIRE!, hits and minimap; KA-BOOM and FIRE OUT; Fire refusing the
grapple ("Too hot to board!"), told before it bites; the fire ship's freeze-to-surrender; the funny immunity lines ("Ghosts
can't smell!"); `seas` gating and the `seen` list in the quiz; `launchBomb` with a source and the Lighthouse's warn
bonus; the title that scrolls to the next card; stink's grit ×0.75 in a boarding; the 1,000 bounty; the progression and
gold-flow thinking (§9).

**From spectacle:** the rise set-piece (the amber eye, the banner with a how-to, skippable, a cut under reduced motion,
its own music); the grab that always lets go with several ways out; `statusfx.js` (instanced, `noOutline`, ≤ 8 calls) and
the effect art and sounds; the rogue-wave answer set (only side-on hurts: RODE IT! / SURF'S UP!); the Fire Ship and the
Squid Skiff; the Kraken Crew fleeing when the flagship falls; the Pearl; the development layer and the construction
montage; the per-tier building art; the Riddle Bell, Quizzle, the ding-ding and the soft bonk; the moonlit glowing-foam
Deep; the warning floor and throttled announcements; the Kraken as one rigidly skinned mesh; the optional wheel; the quiz
record's star-chain rule; prebuilding the Kraken.

**Conflicts resolved:**

| Question | Resolution | Why |
|---|---|---|
| Ammo supply: recipes (arcade), island buildings (depth) or kegs (spectacle)? | recipes + refilled loads, **4** a level (arcade had 2) | no hoarding, no shopping, no worker gating; judge 1 asked for 3–4 broadsides a level |
| When do specials go on sale? | Fire after L3, Frost after L5, Stink after L6 (judge 3) | keeps Voyages I–II near their tuning; judge 1's worry (stink only for three levels) is eased by the migration (this player gets all three at once) and by replays |
| Stink duration | 4 s (depth/spectacle) with arcade's immunity window | "can't move or shoot for a while" must read |
| Quiz consolation gold (judge 1) vs no per-answer gold (judges 2, 3) | no per-answer gold; a one-time "Good try!" 10 gold per island (90 in all) | a child who gets 2 of 5 earns something once; nothing is farmable |
| Villager step-aside rule (judge 1 graft) vs keep the built rule (judge 2 must-fix) | no step-aside rule; the built LOOK-2 waiting + the 0.25 s squeeze-past, path rules for villagers and NPCs, regression tests on every bridge | a second rule would contradict the built, tested one |
| Inkfin Brig | replaced by the Fire Ship (L8) and the Squid Skiff (L9) | no filler ship; the two rammers never share a level |
| The Inkheart's gimmick | ink pots and slicks (not the Kraken's call) | keeps wave 2 independent of the Kraken model; one ink rule for her and the Kraken |
| Kraken hp and attacks | 600 hp, slams 12, grabs ≤ 4 s, no sweep (not spectacle's 900 hp) | judges' fairness must-fix |
| The Kraken's targets: a mechanics hook (depth) or `kraken.targets()` | `kraken.targets()` wrapped by main's `targetsFor()` | kraken.js stays its own pure module (mechanics.js stays untouched) |
| Composing Voyage III's rules | a new `mechanics3.js` + `composeMechanics` (spectacle) | mechanics.js and its tests stay untouched; disjoint Stage 1 owners |
| Rudder record field vs pinned test texts | the rudder is the shipyard's 7th row but its `up.rudder` field is sparse | judge 2: no pinned record text changes; judge 3: top-speed gain capped at ×1.15 |
| Wheel by default (spectacle) | opt-in, with a one-time badge | judges: never silently change the default controls |
| Fire shot and captures | allowed, but a burning ship can't be grappled until the fire is out, said before and when it happens | judge 1: no hidden traps |
| Hurricane wind (depth) | not built; geysers on L9 | L9 is already busy (judge 2's condition) |
| Walkable plots (depth, spectacle) vs none (arcade) | none: all ten plots on today's scenery platforms (the park moved from the walkable garden to `s14`) | judge 3: no new walkable decks; the walk data changes once |
| The go-live gate: `?act3=1` in levels.js (judge 2) | `?kraken=1` / `WITH_KRAKEN` in a new `voyage.js` | levels.js keeps six levels, so mechanics.test's levels.js checks never change |
| Feats for quiz/island trophies | four new feats that merge by max between tabs | cosmetics trophies read feats; adding deltas would overcount |

**Every judge must-fix, and where it is answered:**

| Must-fix | Section |
|---|---|
| The walking bug as its own item, confirmed live, kept for every new walker and NPC, regression-tested on every bridge with the most villagers | §0.3, §8.4, §13.2 (ashore) |
| Existing saves: Voyage III open without replaying L6; old records read tier 0; nothing lost | §5.2, §10.3 |
| The Kraken as a target for auto-aim, FIRE!, hits, the minimap and a boss bar; no rakes; "can't board a sea monster" | §5.7.2, §5.8, §11.2 |
| Kraken fairness: ≤ 600 hp, ≥ 1.5 s telegraphs, grabs auto-release and hold-escape, checkpoint, 2–3 minutes, no stall, not on land or off the map | §5.7.3–5.7.6, §5.9 |
| L9 doesn't stack hazards; the crew flee; no boarders or ships in the Kraken fight; the rise waits for a boarding's result and struck ships | §4.2, §5.6, §5.7.1 |
| Specials never required, don't flatten Voyages I–II, bosses halve, stink immunity, per-level refill, fallback to round, enemies never fire specials, once per volley per target | §2.1–2.5, §5.9, §13.3 |
| A generous visible supply (3–4 broadsides a level, "Fire ×4", spoken) | §2.5, §6.3 |
| Few rules: no worker gating, two interactions, no resistance matrix, no hidden traps | §2.2–2.4, §1 (out) |
| Statuses by shape + word, one badge per tag, drawn on the ship, the tag icon priority | §2.7, §6.4, §15 |
| Status interactions with every existing system (strike, capture, escape, boarding glue, Phantom floor, galleons, raider hooks, current, floes, the keg burn) | §2.4 |
| Touch: no silent default change, no default tap-the-sea, no double-tap triggers, `input.left/right` stay booleans, one analogue `input.steer`, every turn-formula copy updated, the tray one tap from Ammo, no third act-pad button, layouts at every size | §3, §6.2 |
| Draw-call budgets (env ≤ 220, start ≤ 310, busiest ≤ 450, Kraken ≤ 30, town ≤ 450 at full build) and ≤ 4 ships alive; PERF-4 prebuilds | §14, §5.9 |
| Island readability: fixed plots, walk data changed once, camBlockers from tier 0, fresh save as today, not crowding the shipyard, no walk-up buildings (villagers on walkable decks only) | §8.1, §8.4, §12 (1N) |
| Persistence: validated records, record first then chest, one storage rule, two tabs, only up | §0.1, §10 |
| Quiz content and tone: checked facts, child-safe history, British spelling, 320 px fit, 56 px answers, no timer or lives, gentle wrong answers, seeded shuffles, near-miss sums never negative, a validated one-line bank, keys that don't clash with walking | §7 |
| No farmable gold; quiz gold only for new stars; the gift and Market capped per cleared level | §7.2, §8.1, §9 |
| Economy reachable in a sensible number of runs; cheap first build; small visible perks; the totals checked in Node | §8.1, §9, §13.1 |
| Accessibility and photosensitivity (≤ 1 Hz pulses, ≤ 0.25 overlays, reduced motion cuts, audible drone, non-modal panels, live regions) | §15 |
| Architecture: pure Node-tested modules, simulated time, `combatRng`, main.js through Stage 0 seams, file-disjoint stages, the people.js rule | §0.1, §11, §12 |
| Exactly which existing assertions change, nothing else | §13.4 |
| A go-live gate so every stage ends green | §5.1, §12 |
| Scope control and a cost-ordered cut list | §16, §17 |
