# Pirates Ahoy! — "Voyage IV: The Sunset Isles" — depth design

Every new foe asks a new question, answered by something the child already owns: a shot, a turn of the wheel, a
building. Waves come from a pool, so a replay is a new puzzle. Each new building does one small, visible thing and brings
islanders who live little lives on decks the captain can finally reach. Numbers are starting values, each in one table
in one module (SPEC3 §0.1).

**Where I differ from the coordinator's defaults:**
1. **The pool seed moves on when a level is cleared, not on every try:** "Try again" replays the same waves, so a child
   can learn them; a replay for gold draws new ones. Tests pin the seed.
2. **A Rock Battery can be boarded and turned** on the pirates: 100 gold for sinking it, or an ally gun.
3. **Islanders are drawn by nearness:** 40 in the data, the 10 nearest drawn; every animal in one `BatchedMesh` (2 calls).
4. **New amenities go on sale with progress**, like the recipes; homes from the start. **The gift cap rises 240 → 360.**
5. **"Accessible" means porches:** each stilt platform gets a 1.8 u porch; buildings, camera envelopes and the `rand()`
   order stay as built. Long gaps get 1.2 u boardwalks; rope bridges stay ≤ 3 u.

---

## 1. Progression across twelve levels

| Lvl | Sea | New problem | Answer the child owns | Island step it invites |
|---|---|---|---|---|
| 1–3 | Europe, Bali, Volcano | cutters; reefs; lava, the Maw | round, chain, grape; Fire recipe | Cottage, Bakery, School, **Goat Farm** (after L3) |
| 4–6 | Doubloon, Frostbite, Maelstrom | runners, raiders, the Phantom | boarding, cutting ropes; Frost, Stink | Market, **Museum** (first capture), **Forge** (after L5), **Shanty Stage** (after L6) |
| 7–9 | Atolls, Cape, Deep | rams, turtles, fire ships, the Kraken | Frost, rakes, Fire, Stink | Lighthouse; **Observatory** (after L9) |
| 10 | **Misty Mangroves** | monkey swarms, a kiting xebec, nets, fog | grape, chain, cutting nets, hiding in fog | Forge, Observatory; **Aquarium** opens after |
| 11 | **Sunken Spires** | a healer-summoner, puffer mines, the Sea Serpent, currents | Stink, grape, dodging lanes | Aquarium; **Mermaid Grotto** opens after |
| 12 | **Shellback Shoals** | forts, then the Shellback | board forts; everything | Shanty Stage, Museum |

Each ammo gains a Voyage IV job: chain → Xebec, grape → jollyboats and puffers, Fire → nets and claws, Frost → serpent and
crab, Stink → witch and serpent.

---

## 2. Voyage IV · The Sunset Isles (levels 10–12)

**Opening.** Winning level 9 still shows Victory, with the teaser "…and on the sunset horizon, an island begins to
walk." and the button **Sail on to the Sunset Isles** (`Enter`). Card 10 reads "Drive off the Kraken"; cards 11–12
"Locked". **Migration:** if `feats.kraken ≥ 1` and `unlocked ≥ 9`, `raiseProgress(10)` at load. `unlocked` clamps to
1..12. Twelve title cards in four groups; `ACT_NAMES[4]` = "Voyage IV · The Sunset Isles" (`#6b2a55`, ≥ 7:1 on
parchment); from 10 skulls the pill reads "☠ ×10" ("Difficulty 10 of 12").

| | L10 Misty Mangroves · **Heroic** ★10 | L11 Sunken Spires · **Epic** ★11 | L12 Shellback Shoals · **Ultimate** ★12 (finale) |
|---|---|---|---|
| Looks like | green-gold dusk, mangroves on arching roots, fireflies (1 InstancedMesh ≤ 150), a lantern-lit stilt village | turquoise noon over a drowned city: columns, arches to sail under, a half-sunk stone face, glowing coral | coral-pink sunset, golden sandbanks, giant shells, whale ribs, and a crab-shaped island with a ruined fort (the sleeping boss) |
| Hazard | **fog banks** (§2.1); shallows (`reefs`, deep hulls ×0.5) | **coral currents** (§2.2) | **ebb tide** (§2.3); forts |
| Music (synth) | bayou waltz: banjo, accordion, jug, washboard, crickets | harp and glass marimba, slow bossa, whale-song pads | brass and steel-drum carnival march; the boss: a 5/4 tuba crab-walk with castanet claws and choir |
| Waves | 3 pool draws, `nextWaveAt 1`, `maxAttackers 2` | 3 draws, `maxAttackers` 2 (3 in wave 3) | 2 draws, then the Shellback (§5) |
| Bonus · crates | 1,800 · 2 | 2,100 · 2 | 3,000 + the Golden Conch 1,200 every win · 2 (none in the boss fight) |

### 2.1 Fog banks (L10, `mechanics4.js` `FOG`)

- **Banks:** 3 ellipses, 30 × 18 u, riding `env.fogLoops` at 1.5 u/s (a pure function of the hazard clock).
- **Hidden:** a ship in a bank is hidden from ships over **14 u** away (+ the Observatory's `spyglass`): no auto-aim, no
  FIRE! light, no tag, only a dim silhouette with a lantern and a grey "?" on the minimap. Manual broadsides still fly.
- **You, hidden:** pirates head for your last-seen spot ("Where'd she go?") while the carpenter mends you: hiding is a real
  choice. No damage, so no telegraph; a ship leaving fog pops "!". Drawn as ≤ 60 instanced puffs and a fog disc; inside,
  a white vignette and "HIDDEN".

### 2.2 Coral currents (L11, `CURRENT`)

Three 8 u lanes from `env.currents`. Any ship inside drifts **3 u/s** along the lane (composed `drift`), shown by scrolling
foam arrows (1 call): free speed one way, a crawl the other. Puffers ride them too. No damage.

### 2.3 Ebb tide (L12, until the boss wakes, `TIDE`)

The tide goes out at 40 s, then every 45 s, for 12 s. **Warning 3 s:** a bell, "LOW TIDE!", and pale bubbling water
over the four `env.tideBars`. While the tide is out, a bar is a collider. A ship caught on one is lifted off at 2 u/s
("STUCK!", 1.5 s, no damage), pirates too.

---

## 3. The new foes

Seven new kinds: four ships, a fort and two sea creatures, each moving or attacking in a way no older foe does.

### 3.1 Stats (ships in `shipTypes.js`; creatures in `beasts.js`, never `SHIP_TYPES` keys)

| Key | Name | hp | len/wid | speed | accel | turn | reload | guns × dmg | gold → sunk / captured | crew / grit | engage |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `jolly` | Monkey Jollyboats (pack of 5) | 10 each | 3.2/1.4 | 11 | 5 | 2.2 | — | coconut lob | 10 a boat; can't board | 2 / 0.6 | 12 |
| `xebec` | Corsair Xebec | 70 | 9.5/2.8 | 14 | 4.2 | 1.6 | 2.2 | 2 × 4 | 60 / 145 | 9 / 1.1 | 26 |
| `dhow` | Netcaster Dhow | 60 | 8.5/3.0 | 10 | 3.2 | 1.3 | 3.2 | 1 × 4 | 50 / 125 | 10 / 1.0 | 16 |
| `witch` | The Coral Witch's Barge | 110 | 10/3.6 | 5.5 | 1.6 | 0.7 | — | 0 | 80 / 185 | 6 / 0.7 | 34 |
| `battery` | Rock Battery (anchored) | 220 | 6/6 | 0 | — | turret 0.6 | 4.0 | 1 × 14 | 100 / 225 | 12 / 1.2 | 40 |
| creature | Puffer Mine | 6 | r 0.9 | 1.4 | — | — | — | pops for 8 | 0 | — | — |
| creature | Old Coilback, the Sea Serpent | 450 | head + 3 humps | 9 | — | — | — | lunge 12 | a scale, 150 | — | — |

Capture gold stays `gold × 20 + 25`. The pack, puffers and serpent can't be boarded ("Too small to board!", "You can't
board a sea monster!").

### 3.2 Behaviour, telegraph, counter

| Foe | What it does | Telegraph (≥ 1.5 s, + Lighthouse) | How to beat it |
|---|---|---|---|
| **Monkey Jollyboats** (swarm) | 5 boats ring you at 10–14 u; each lobs a coconut at your predicted spot ± 3 every 6–8 s: r 2.2, **3 damage**, "BONK!" (≤ 3 rings at once) | brown dotted ring and a spinning shadow, **1.5 s**, "ook!" | **Grape:** a grape ball tips a jollyboat over (the monkeys swim home), so a grape broadside tips 2–3. A round ball sinks one |
| **Corsair Xebec** (kiter) | Holds 22–30 u in your stern quarter (> 135° off your bow), firing her bow guns; 0.6 s in a loaded arc of yours and she **dances** away (turn ×1.6 for 1.2 s; 5 s cooldown) | a gold "BEHIND YOU!" edge arrow; a "fwap" of sails as she dances | **Chain:** a slowed xebec can't dance. Or **drop sail** so she overshoots into your arc |
| **Netcaster Dhow** (control) | Closes to 14–18 u on your beam and casts a net over a fan 18 u long and 50° wide: **TANGLED!** Speed ×0.5 and turning ×0.6 for 4 s. 10 s cooldown; never during a boarding | the net whirling over her bow, a white hatched fan, a whirr and "NET!", **1.6 s** | turn bow or stern to her. **Cut:** hold `G`/CUT! 0.8 s (less with the Forge) or tap 3×. **Fire** on her mid-whirl: "NETS ON FIRE!", no cast for 12 s |
| **Coral Witch's Barge** (summoner, healer) | No guns; keeps 30–38 u off. Every 7 s in turn: **Summon** 3 puffers 10–14 u ahead of you, or **Song**: pirates within 18 u mend 4 hp/s for 4 s | Summon: green bubbling rings, **1.8 s**. Song: her conch and a ring of notes, **1.5 s**, "She's mending her fleet!" | **Stink:** no song or summons for 6 s. **Board her** (an easy 185). Her puffers deflate when she falls |
| **Puffer Mine** (creature, area denial) | Drifts at the nearest hull within 25 u; within 6 u it puffs, then pops: **8 damage** to every hull within r 4, pirates too. Deflates after 40 s; ≤ 6 alive | swells, spikes out, a spiky ring pulsing at 1 Hz, a squeaky "PUFF!", **1.5 s** | any ball pops it ("pfft!"); grape clears clusters; lure them into pirates. Gunners aim at puffers only with grape loaded or no ship in the arc |
| **Old Coilback** (creature, submerge + lane) | **swims** 6 s circling at 22–28 u → **dives** 2 s → 3 s **under** (a bubble trail) → **rears** 16–20 u off your beam → **lunges** 0.5 s down a lane 4 × 18 u: **12 damage**, a 3 u shove → **dizzy** 4 s | green-white dashes with arrows through your predicted spot, a rising hiss, "LUNGE!", **1.6 s** | steer out of the lane; hit the **head** while it's dizzy (×2, "BONK!"). **Frost:** no dive for 8 s and the lane +0.5 s. **Stink:** it dives off and doesn't lunge for 6 s. At 0 hp it swims off sulking and drops its scale |
| **Rock Battery** (stationary) | A fort on a rock (`env.batterySpots`). Within 40 u it **sights** you: tracks 1.3 s, locks 0.5 s, then fires along the line: **14 damage** to the first hull on it, pirates too. Reload 4 s | a red dotted line that turns solid with one flash and a "click-clack", **1.8 s** | change course or speed before it locks. Sink it, or **board it** (14 u from its rock): "FORT TAKEN! Its gun is yours!", and it sights pirates with a blue line |

**Tags:** a pack has one tag counting its boats ("Monkey Jollyboats ×4", no crew pips); the serpent's tag has an hp bar;
puffers have none (their ring is enough).

**Combinations the pools allow on purpose** (and their answers): net + serpent (Fire the dhow, or cut); witch + Iron
Turtle (Stink her, then rake); xebec + jollyboats (grape on the turn); puffers + a current (leave the lane); battery +
fog (hide, close in, board).

**Never in one wave:** shark + fire ship, witch + bomb ketch, two dhows, or more than one serpent, witch or battery. **At
most 8 warning shapes at once**; a new one, and its attack, wait for a free slot.

**Introductions.** A kind's first appearance (the `voyage4.seen` bits) brings 0.8 s of bullet-time (none under reduced
motion) and a **NEW FOE!** card, read by `#game-live`: icon, name and two lines ("Netcaster Dhow — throws nets that slow
you. Turn away, or hold G to cut free!"). Its first telegraph holds the how-to banner; the rumour board and the
**Bestiary** keep them.

---

## 4. Wave pools: no two voyages the same

`src/pools.js` (pure) draws a level's waves at `startLevel`: `seed = poolSeed(level, plays[level])`; `waves =
drawWaves(def.pool, seed)`. `plays` rises by 1 on each clear. On levels 10–12, `combatRng` is seeded from the same
seed, so tests replay exactly. Levels 1–9 are untouched.

**Threat costs** (a pack is one slot): corsair, privateer, shark, fireship, skiff **2**; bombketch, jolly, xebec, dhow,
battery **3**; ironclad, witch **4**; serpent **5**.

**A wave** starts from its `must` kinds, then picks by weight (new kinds 2, old 1) among kinds that fit the remaining
budget and the rules until its slots are full; a repeat of the previous wave is redrawn (≤ 8 times).

| Level · wave | Budget | Slots | Must | Pool |
|---|---|---|---|---|
| 10 · 1 / 2 / 3 | 5 / 6 / 8 | 2 / 2 / 3 | jolly / xebec / dhow | corsair, privateer, shark, jolly, xebec (+ dhow from wave 2) |
| 11 · 1 / 2 / 3 | 6 / 7 / 9 | 2 / 2 / 3 | witch / serpent / two Voyage IV kinds | corsair, privateer, xebec, dhow, jolly, ironclad (+ witch, bombketch from wave 2; all of III and IV but fireship and battery in wave 3) |
| 12 · 1 / 2 | 8 / 9 | 3 / 3 | battery / a Voyage IV kind wave 1 lacked | every kind (no battery in wave 2) |

**Guards:** ≤ 4 slots alive (puffers don't count); a Node test checks every rule over 1,000 seeds per level; bot v4 wins
≥ 95 % of 48 seeds per level within two tries. The cleared card says "The seas will change next time!"

---

## 5. The finale: The Shellback

L12's crab-shaped island is a giant hermit crab asleep under the Crab Corsairs' fort. When wave 2 falls it **breathes**
(a 4 s dread, sliding sand, "The island… is MOVING!"), then two stalked eyes open: "THE SHELLBACK WAKES! Knock down its
towers!" (any key or tap skips). `src/shellback.js` is pure and shaped like `kraken.js`; `src/shellbackView.js` draws it
in ≤ 45 calls. Its boss bar holds **3,000 hp in three parts**:

| | The Fort (3,000 → 2,000) | The Waking (2,000 → 1,000) | The Charge (1,000 → 0) |
|---|---|---|---|
| Body | asleep | walks after you at 4.5 u/s (Frost ×0.5) | throws its fort off; walks at 6 u/s |
| Targets | 3 towers, 340 hp each; all down (or 2,000 reached) wakes it | eyes ×1.5; 2 claws of 300 hp (a downed claw drops for 8 s, "OUCH!"); shell ×0.5 ("CLANG!") | eyes ×2 while dizzy; claws; shell |
| Attacks | the towers sight you in turn every 3 s (the battery's line, **1.8 s**, 10 damage) | **claw sweep** within 16 u: a red zigzag-edged sector, r 14 and 100°, **1.8 s**, 12 damage and a 4 u push, "SNIP!"; **boulder** every 9 s: an orange ring of r 5, **2.0 s**, 12 damage | **charge** every 10 s: it crouches behind a lane 7 × 45 u, **2.0 s**, "CHARGE!", runs it at 14 u/s (14 damage and a shove), then is **dizzy** for 4 s; the sweeps go on |
| Specials | Fire burns a tower 3 hp/s | Frost: slower, warnings +0.5 s for 2.5 s | Stink: "ACHOO!", no attack for 2 s (then 20 s of pegs) |

**Kind to a child:** at most 2 attacks telegraphed at once; no charge within 6 s of a sweep; a session-only checkpoint
at the dread (**Try again from the Shellback**, full hull, crew and loads: SPS-1's lesson); tuned to 2–3 minutes.

**Driven off:** "THE SHELLBACK SCUTTLES HOME!" The **Golden Conch** (1,200) is banked even if you leave now (as SAVES-2);
a **baby hermit crab** climbs onto the captain's hat (a pet trophy). Victory: "The Shellback scuttles off to sleep, and
the Sunset Isles are free! You are the Admiral of the Twelve Seas!"

---

## 6. The whole island, walkable

Today only the pier, plaza, tavern and tower rafts, yard, Polly's (`s1`) and garden are walkable; `s2`–`s18` are in
plain view but out of reach. With `WITH_V4`, **every deck, platform, beach, hill and pier the camera sees** is walkable
(boats, roofs and the docked ship stay scenery).

**Porches:** each of `s2`–`s18` gains a 1.8 u porch at its own height on the side its walkway reaches, with rails, a
lantern and the "Build me!" board. The building and its tier-3 camera envelope are unchanged; its footprint is a blocker
as tall as the envelope. Each porch holds a **plot place** `{ id: 'plot:<id>' }`: `E` there opens Bess's panel at that
row ("Build here").

**Links** (lengths in u): boardwalks are flat with rails, hw 0.6; rope bridges keep today's hw 0.25 and are ≤ 3 u.

| Ward | Links |
|---|---|
| West (Windmill Row) | boardwalks `gardenS8` 4.4, `s8S13` 6.3, `s14S15` 6.5, `s15S16` 8.0, `s6S15` 6.0, `s6Beach` 4.3 (to Sunset Beach); rope bridges `s8S14` 2.0, `tavernS16` 2.2, `towerS6` 1.8 |
| North (Lagoon Lane) | boardwalks `tavernS4` 7.0 (2 steps up 0.2), `s1S3` 3.7 (ramp up 0.3), `s3S12` 5.2, `s4S10` 4.9, `s10Tower` 6.3, `s12S5` 5.4, `s5S11` 3.8, `s5S2` 3.8; stone steps `s12Hill` 2.3 (up 0.4, to Lookout Hill); rope bridge `s4S3` 2.5 |
| East (Lighthouse Point) | boardwalks `yardS2` 4.8, `s7S11` 8.5, `s17S18` 8.2, `s18S9` 6.3; rope bridges `s1S2` 2.1, `s2S7` 2.7, `s7S17` 2.8, `yardS9` 2.2 |

**New areas:** 17 porches; **Sunset Beach**, a circle at (−37, −31), r 6, sand mound 1.3 → 1.9; **Lookout Hill**, a circle
at (2, −51), r 6.5, profile `[[0, 4.4], [2, 4.2], [4.5, 2.6], [6.5, 1.6]]` (a winding stone path; steepest step 0.064 per
0.1 u, inside `CLIMB`); **Fisher's Pier**, 2.4 × 10 east of s18 to (47, −12.5), ≥ 8 u from the prize berths; the
**slipway**, a ramp from the yard to y 0.6; the **crow's nest**, a spiral stair `towerStair` (r 1.6, 1.5 turns, hw 0.35)
to a circle of r 0.9 at y 7.1, where the camera pulls out to a panorama ("Land ho!") until a move key comes back down.

**Never walled in:** three rings (west, north-west, east), so no long dead ends; islanders on walkways are `folk()`
walkers (LOOK-2's waiting and the squeeze-past); loops stay ≥ 0.7 u apart, never pause on a bridge or within 2 u of a
mouth, ≤ 2 per rope bridge; workers stand ≥ 1 u off every path, like Bess; animals are never obstacles (they scatter
within 1 u).

**Keyboard and screen readers:** the Harbour menu's new **Walk to…** lists the five districts (Old Town, West, North,
East, Sunset Beach & Lookout Hill), the crow's nest and quest-givers; the captain auto-walks there.

---

## 7. Eleven new buildings

Eleven new plots join today's 10, each with 3 tiers, one perk key, a delight and its own inhabitants.

| Plot (`id`) | Where | Tiers 1 / 2 / 3 | Cost per tier | Perk at 1 / 2 / 3 | On sale | Moves in |
|---|---|---|---|---|---|---|
| **Treehouse** (`homeE`, home) | Sunset Beach, in a giant palm | Rope swing / Treehouse / Treetop castle | 150 / 350 / 650 | 2 / 4 / 6 villagers | always | kids, a parent, a monkey |
| **Houseboat Moorings** (`homeF`, home) | s17 | Rowboat home / Houseboat / Floating manor | 150 / 350 / 650 | 2 / 4 / 6 | always | a fisher couple, a kid, a dog, grandpa |
| **Hilltop Villa** (`homeG`, home) | Lookout Hill shoulder | Cottage / Villa / Domed villa | 150 / 350 / 650 | 2 / 4 / 6 | always | Granny Pearl and her cat, Grandpa Jack, cousins |
| **Blacksmith's Forge** (`forge`) | s4 | Anvil / Smithy / Iron works | 250 / 550 / 950 | cutting ropes, nets, grabs: hold 0.6 / 0.45 / 0.3 s (from 0.8); grapples coil 5 / 4.5 / 4 s (from 6) | after L5 | Ada the smith, an apprentice, a dog |
| **Fishing Hut** (`fishing`) | s9 + Fisher's Pier | Drying rack / Fishing hut / Fish market | 150 / 350 / 650 | the catch pays +20 / +40 / +60 gold a cleared level | always | Finn and Marina, crabs |
| **Goat Farm** (`farm`) | s10 | Pen / Barn / Dairy | 200 / 450 / 800 | +1 / +2 / +3 hands at every level start (crew cap 22 → 25) | after L3 | Farmer Bo, 4 goats, a dog |
| **Shanty Stage** (`shanty`) | s5 | Barrel stage / Bandstand / Music hall | 200 / 450 / 800 | reloads 5 / 10 / 15 % faster for 10 s after each reinforcement and boss phase ("The crew sings!") | after L6 | a fiddler, a drummer, a singer |
| **Trophy Museum** (`museum`) | s11 | Curio shed / Museum / Grand gallery | 250 / 500 / 900 | +15 / +30 / +50 gold for each ship captured | first capture | Curator Quill, a parrot |
| **Observatory** (`observatory`) | Lookout Hill top | Spyglass post / Star tower / Great dome | 300 / 600 / 1,000 | `spyglass`: see 6 / 12 / 18 u further into fog; a dived serpent's bubbles show on the minimap | after L9 | Stella the stargazer, an owl |
| **Aquarium** (`aquarium`) | s12 | Tide pool / Aquarium / Grand aquarium | 300 / 600 / 1,000 | +5 / +10 / +15 % damage to sea creatures (puffers, Coilback, the Shellback, the Kraken), "WEAK SPOT!" | after L10 | Coral the aquarist, a sea turtle |
| **Mermaid Grotto** (`grotto`) | Sunset Beach shore | Rock pool / Grotto / Coral palace | 200 / 400 / 700 | wrecked, the merfolk save 10 / 20 / 30 % of the level's plunder (≤ 150) for the chest | after L11 | Nerissa and Kai (merfolk), 2 turtles |

**Every perk shows where it works:** a faster CUT! bar, "Fishers' catch +40" on the cleared card, +2 on the crew card,
notes over the guns, "+30 Museum" on the capture pop, nearer fogged tags, "WEAK SPOT!" pops, "The merfolk saved…" on the
wreck card. **Delights:** anvil sparks, goats on the barn roof, the band striking up as you pass, a bottled model of every
ship type you've captured (`feats.prizes`), merfolk waving from the rocks.

**Totals and ranks:** new homes 3,450, new amenities 12,550, the island 11,800 → **27,800**. Over 63 tiers, today's
ranks stay (Pirate Capital 30 keeps the Governor's coat, its text now "build 30 tiers on the island"), plus **Grand Port
45** and **Jewel of the Seas 63** (the **Jewelled tricorn**). `feats.island` 0..63; `GIFT.cap` 240 → 360.

---

## 8. Show me the house being built

The 2.4 s scaffold pop becomes a **construction scene** for every build and upgrade. The timeline lives in the pure
`src/buildScene.js`, the stage art in sparrow.js, and the bar in townMode.

| # | Stage | Time (s) | What you see | What you hear |
|---|---|---|---|---|
| 0 | Frame | 0–0.8 | the camera glides to a ¾ view; the plot fills about 45 % (portrait: the upper half) | Bess's whistle |
| 1 | Builders arrive | 0.8–2.0 | **Hammer Hank** (cap, hammer) and **Sawdust Sue** (bandana, plank) walk in from the nearest walkway point (≤ 8 u) with a timber cart; the household follows, "Let's build!" | footsteps, a cart |
| 2 | Foundation | 2.0–3.2 | the old shack folds flat and slides away; stone piles rise in 3 knocks, in sawdust puffs | thunk ×3 |
| 3 | Frame & scaffold | 3.2–4.6 | 6 posts pop up 0.15 s apart, then yellow scaffold, a ladder and Sue climbing it | hammer ×4, a saw |
| 4 | Walls | 4.6–5.8 | the walls rise from the bottom (a reveal height); windows pop in | quicker hammering |
| 5 | Roof | 5.8–6.8 | tiles cascade in 3 rows; the chimney or vane drops on with a little squash | a tile clatter |
| 6 | Finishing | 6.8–7.6 | paint sweeps over bare wood; flowers, a spinning sign; the scaffold drops | a brush swish, a bell |
| 7 | Moving in | 7.6–9.0 | bunting; the inhabitants and their animal carry bundles in; the lights come on; "Thank you, Captain!" | fanfare, cheer |

- **Upgrades** skip stage 2 and build only what the tier adds: 7.0 s. **Skip:** any key or tap jumps to the end state in
  0.3 s (and does nothing else).
- **Reduced motion:** a cut to the plot, then the stages crossfade in 0.6 s each (3.0 s in all). No squash, no flying
  sawdust, no glide; the builders stand at the plot.
- **The screen:** the panel folds into a slim bar, "Building the Cottage… [Skip ▸▸]" (44 × 44); `#build-live` reads
  "Foundation…", "Walls…", "Roof…", "Finished! 2 villagers moved in." (≤ 1 per 1.5 s); then the panel returns with focus
  on the row's button.
- **How it's built:** tier builders tag meshes `userData.stage` 2–6; for the scene, `devChunk` splits the tier into ≤ 15
  temporary meshes (≤ 30 calls) drawn with `sparrow-dev-reveal` (the dev material + a `uReveal` uniform); then the tier
  joins the baked layer as today (≤ 40 ms). Records are saved **before** the scene, so closing the page keeps the house.

---

## 9. Islanders: people, animals and sea folk

`src/folk.js` (pure) holds ≤ 40 named islanders, their routines (pure functions of the town clock and a seed: loops of
stations with people.js actions), lines and quests. `src/islanders.js` draws the 10 nearest (`DRAWN_CAP`, within 24 u,
≤ 1 rebind a frame), all prebuilt hidden one a frame from dock open (`share: true`, `detail: 'low'`). Today's townsfolk
and villager loops are untouched.

| Islander (building) | Look (people.js) | Routine (about 60 s) | A line |
|---|---|---|---|
| Finn and Marina, fisherfolk (Hut, Houseboats) | man / woman, straw hat / kerchief, blue stripes, `rod` | the pier → `fish` 25 s → `carry` a crate to the market | "Biting today, Cap'n!" · "Puffers ate my bait!" (after L11) |
| Ada the smith (Forge) | woman, dark vest, red bandana, `hammer` | `hammer` 20 s → `carry` (quench) → `scrub` (sharpen) | "A sharp knife cuts any net!" |
| Treehouse kids ×2–4 | `kid`, caps, bright stripes | chase (`run`) → swing (`sit`) → hide-and-seek (`point`) | "Are you a REAL captain?" · "We saw a sea serpent!" |
| Granny Pearl, Grandpa Jack (Villa) | `old`, glasses; shawl / cap and full beard | the hill path → bench (`sit`) → feeding cats (`idle`) | "In my day the Kraken was THIS big!" |
| Stella (Observatory) | woman, plum coat, `pointer` | `point` at the sky → hilltop walk → `measure` | "Fog can't hide from my spyglass!" |
| Coral (Aquarium) | woman, teal shirt, `bucket` | `carry` to the tanks → `wave` at the turtle | "Puffers puff when you get close!" |
| Farmer Bo (Farm) | man, straw hat, vest, `bucket` | `carry` hay → `run` after a goat → `sit` on the fence | "Meet Nibbles. She eats EVERYTHING." |
| The Shanty Band (Stage) | a man with a `fiddle`, a woman singing (`cheer`) | play 30 s → `proud` (a bow) → to the tavern | "♪ Heave ho, the Kraken's gone! ♪" |
| Curator Quill (Museum) | `old`, glasses, bicorne, `tape` | `measure` the bottle-ships → `proud` | "Captured another? Bring me a bottle!" |
| Nerissa and Kai (Grotto) | new kind `'mer'`: a lathed tail on the leg bones, a shell top or a kelp sash | `sit` on a rock → `wave` → dive for 3 s | "Mind old Coilback!" |
| Today's amenities: a worker each | baker (cap, apron), miller, keeper Lars (`lantern`), teacher, gardener | at their stations | "Fresh biscuits!" |

**Talk.** Within 1.6 u, facing within ±60°: "Talk to Ada (E)" (touch: the round button reads **Talk**; a door or plot
place wins). The islander turns and waves; 2–3 lines show in `#talk-bubble` (read by `#town-live`), and change with
progress (level, buildings, quests, the Kraken and Shellback feats).

**Animals** are drawn by `src/critters.js`: **one `BatchedMesh`** (toon, vertex colours) plus an inverted-hull ink twin.
That is 2 calls in all for ≤ 120 instances. They animate through instance matrices (hop, bob, waddle, wag, flap).

| Species | Max | Where | Routine | Near the captain |
|---|---|---|---|---|
| Cats (ginger, black, calico) | 4 | villa, bakery roof, plaza | sleep, stretch, hop down | "mrrow", a heart, follow 3 steps |
| Dogs | 3 | tavern, farm, houseboats | trot after their owner, sit | "Woof!", run a circle round him |
| Goats | 4 | farm, hill | graze, climb the barn roof | "Meeeh!" |
| Parrots, an owl | 5 | museum, tavern, palms, observatory | fly between perches (the gulls' code) | "Pieces of eight!" |
| Monkeys | 2 | treehouse, palms | swing, peel a banana | giggle |
| Crabs | 8 | beaches, Fisher's Pier | scuttle sideways | dig into the sand |
| Turtles | 3 | beach, grotto, aquarium pool | swim, crawl ashore | pull their head in |

**Quests** each need their building and send the child somewhere newly reachable (record first; unsaved gold stays owed).

| Quest | Giver | Do | Reward |
|---|---|---|---|
| Whiskers | Granny Pearl | her cat is on the crow's nest; `E` picks him up and he follows you back | 50 gold + **Ship's cat** pet trophy |
| Bait | Finn | carry the bait bucket from the market stall to the pier end | 30 |
| Anchor | Ada | fetch the old anchor from the slipway | 40 |
| Shells | the Treehouse kids | find 3 sparkling shells on Sunset Beach | 30; the kids cheer at the dock |

---

## 10. Saves and migration

| Key | Format | Validation |
|---|---|---|
| `pirates-ahoy-unlocked` | integer | `loadInt(…, 1, 12, 1)` with `WITH_V4` |
| `pirates-ahoy-island` | today's 10 tiers + **sparse** new ids (written only when ≥ 1, like `up.rudder`) | `parseIsland`; a save with no new tier stays byte for byte |
| `pirates-ahoy-voyage4` (new) | `{"v":1,"plays":[0,0,0],"seen":0}` | `parseVoyage4` (pools.js): plays 0..9999; seen 0..255 (7 kinds + the Shellback); ≤ 1 KB |
| `pirates-ahoy-folk` (new) | `{"v":1,"q":{"whiskers":0,"bait":0,"anchor":0,"shells":0},"owed":0}` | `parseFolk` (folk.js): quest 0 new, 1 taken, 2 paid, 3 done with gold owed; owed 0..200 |
| `pirates-ahoy-feats` | + `shell` 0..1; `island` 0..63; `prizes` + xebec, dhow, witch, battery | `parseFeats`; `shell` merges by max |
| `pirates-ahoy-look` | accepts the trophies `pet.hermit`, `pet.cat`, `hat.jeweled` | `sanitizeLook` |
| `pirates-ahoy-tips` | bitmask | `TIPS_MAX` 65535 → 16,777,215 (6 new tips) |

Every record follows SPEC3 §0.1 (never throws, field by field, plain integers, a size cap, rewritten when fixed). Builds
and quest rewards write their record, then the chest; a failed record buys nothing. `plays` is written at a clear before
banking. Two tabs: `-voyage4` merges by max and union, `-folk` by each quest's larger state. **Migration:** `feats.kraken
≥ 1` opens level 10; everything new reads as its default; no key is renamed, and no gold or progress moves.

---

## 11. Screens and controls

| Action | Keyboard | Touch |
|---|---|---|
| Cut a net (or ropes, a grab) | hold `G` 0.8 s (less with the Forge) or press it 3 times | hold or tap **CUT!** |
| Skip a NEW FOE! card or the Shellback's rise | any key | a tap |
| Talk to an islander | `E` near them; `E`/`Enter` next; `Esc` ends | **Talk** |
| Build at a plot's porch | `E` at its board | **Build** |
| Skip the construction scene | any key | a tap, or **Skip ▸▸** |
| Walk to a district | Harbour menu ▸ **Walk to…** | the same |

**Screens:**
- **Rumour board:** the next level's possible foes as named icons.
- **Captain's log ▸ Bestiary** (`role="tabpanel"`): all 25 foes (the Kraken and Shellback too); seen ones with icon,
  "What it does", "How to beat it", "Beaten ×N"; unseen ones as "???" silhouettes.
- **Bess:** Homes 7 rows, Amenities 14, under district subheadings; "New!" badges; not-yet-on-sale rows read "Opens after
  The Kraken's Deep" (`aria-disabled`, reason described); a new **building** state (the slim bar).
- **Cleared card:** "Fishers' catch +40". **Wreck card:** "The merfolk saved 45 gold!" and **Try again from the
  Shellback**.

---

## 12. Modules and APIs (behind `WITH_V4` in `voyage.js`; `?v4=1` until go-live)

New pure modules (they import nothing; Node tests them):

```js
// act4.js        ACT4_LEVELS (SPEC3 §5.1 format + pool, mechanics ['fog'|'currents'|'tide'], boss: 'shellback'), ACT4_TEASER
// pools.js       KIND_COST, POOL_RULES; poolSeed(level, plays); drawWaves(pool, seed) → string[][]; validWave(wave, pool, prev);
//                parseVoyage4 / serializeVoyage4 / mergeVoyage4
// mechanics4.js  MECHANIC4_IDS; JOLLY, XEBEC, NET, WITCH, PUFFER, BATTERY, FOG, CURRENT, TIDE;
//                createMechanics4(ids, ctx) → SPEC2 §6.3 hooks + hidden(ship, viewer), cut(down), visuals(), state
// beasts.js      SERPENT; createBeasts(ctx) → { spawn(kind, x, z), step, targets(), hits(part, x, y, z), hit(part, info), bars(), visuals(), state }
// shellback.js   createShellback(ctx) → kraken.js's shape + { phase, conch, checkpoint }
// folk.js        ISLANDERS, ROUTINES, LINES, QUESTS, DRAWN_CAP; routineAt(islander, t); linesFor(islander, progress);
//                questStep(rec, id, event) → { rec, reward }; parseFolk / serializeFolk
// buildScene.js  STAGES; sceneLength(tier, reduced); stageAt(t, tier, reduced) → { stage, k, caption }
```

**New three.js modules:** `env/mangroves.js`, `env/spires.js`, `env/shoals.js` (the SPEC3 env shape + `fogLoops`,
`currents`, `batterySpots`, `tideBars`, `shellbackLair`); `beastsView.js` (the serpent as one 8-segment SkinnedMesh;
jollyboats and puffers instanced with ink twins; the fan, lane and sight-line telegraphs); `shellbackView.js`;
`islanders.js` (`createIslanders({ root, env }) → { set(pop), update(t, cam, captain), drawn, talkTarget(captain) }`);
`critters.js` (`createCritters({ root }) → { set(spots), update(t, captain) }`).

**Changed modules:** `island.js` (11 rows with `era: 4` and `opens`; `plotsFor(withV4)`; perk keys `cutTime`,
`catchGold`, `extraCrew`, `shanty`, `prizeBonus`, `spyglass`, `beastMul`, `rescuePct`; `catch()`, `rescue(base)`; 2 ranks;
the gift cap); `shipTypes.js` (5 types); `ships.js` (4 models ≤ 26 calls each, the fort); `people.js` (`'mer'`, a baker's
cap, an apron, pets `'hermit'` and `'cat'`, drawing no `rng()` unless given); `cosmetics.js` (3 trophies, 4 prize types);
`sparrow.js` (porches, islets, links, `plot:*` places, stage tags, the reveal material, builders; hosts islanders and
critters); `town.js` (talk, panorama, Walk to…); `townMode.js` (scene bar, talk, quests, Bestiary); `buildPanel.js`
(subheadings, locked rows, `celebrate` → 9.0 s); `audio.js` (4 scenes, about 20 SFX); `walk.js` unchanged.

**main.js seams:** `targetsFor()` reads a **parts registry** `[kraken, beasts, shellback]` (`hitsShip` and `damage` route
pseudo targets by owner); `composeMechanics` takes three parts; `spawnWave` reads the drawn waves; `canGrapple` gains "Too
small to board!"; `finishLevel` adds the catch and `playerSunk` the rescue; aim skips puffers unless grape is loaded or no
ship is in the arc; the cut handler reads `cutTime`.

**Test API:** `__game.v4 { seed(n), waves, spawn(kind, x, z), net(), serpent.cycle(stage), tide(on), shellback { rise(),
phase(n), setHp(n), state, checkpoint } }`, `__game.folk { drawn, talk(id), quest(id, e), record, set(r) }`,
`__game.island.scene { stage, skip() }`.

---

## 13. Balance and tests

**V4 profile** (about 7,200 gold): SPEC3's late profile plus guns 2, shot 3, hull 3, sails 2 and carpenter 2, with the
Forge and the Aquarium at tier 1. **Bot v4** plays every counter (grape on packs and puffers, chain on the xebec, Fire on
a whirling dhow, Stink on the witch and a rearing serpent), steers out of fans, lanes, sectors and sight lines, hides in
fog below 40 % hull and boards batteries. **Offline medians** over 48 seeds: damage taken L10 ≈ 90 < L11 ≈ 125 < L12 ≈
190; the Shellback fight 120–180 s; every level cleared with **0 special loads** within two tries.

**Tuning knobs, in order:** `maxAttackers`, budgets, telegraph times, Shellback hp, kind costs.

**Suites:**
- **Node (+4):** `pools.test` (rules over 1,000 seeds, determinism, junk records), `mechanics4.test` (numbers, every
  telegraph ≥ 1.5 s, the net cut, the witch's puffers deflating, fog, currents, tide), `beasts.test` (serpent cycle,
  Shellback phases, checkpoint), `folk.test` (routines, lines, quests, record).
- **Browser (+2):**
  - `voyage4.cjs`: 12 cards, the migration, L10–12 start within budget, NEW FOE! cards, boarding a battery, the
    Shellback through to the Conch, the checkpoint, a bot section;
  - `isle4.cjs`: every area and link reached from the spawn ("no deck is an island"); a jog across every new bridge
    with 10 islanders drawn; 10,000 random steps; the scene's stages, skip, reduced motion and captions; talk and
    quests; town draw calls at 45 spots × 8 headings; two tabs.
- `npm test` goes to 27 suites.

**Existing checks that change** (re-anchored by content): `walk.test:418` "no new walkable area or bridge" → "every
platform's porch is reached from the spawn"; `:91` gains the 21 `plot:*` places after `builder` and `:461` counts the
islanders' loops; the walk fixture is regenerated once; `island.test` totals 3,400 →
6,850, 8,400 → 20,950, 11,800 → 27,800, and the gift cap; `cosmetics.test` trophies 8 → 11, `FEAT_IDS` + `shell`,
`FEAT_MAX.island` 63; `levels`, `smoke`, `battle` 9 cards → 12, with L9's `Enter` sailing on to level 10; `controls`'s
too-large case `'13'` → 12; `ashore` and `town` read `sceneLength()` instead of the 2.4 s montage.

---

## 14. Performance

| Scene | Budget | Plan |
|---|---|---|
| Voyage IV env alone | ≤ 220 | statics merged; fireflies, fog, arrows and tide bars one mesh or InstancedMesh each |
| Level start | ≤ 310 | env + ≤ 3 ships + the helm captain + tags |
| Busiest (4 slots, a boarding, 6 puffers, 8 warning shapes, fog) | **≤ 450** | a jolly pack 3 calls in all; puffers 3; the serpent ≤ 6; ships ≤ 26 each |
| The Shellback fight | **≤ 450** | the Shellback ≤ 45 (a skinned body, 3 baked fort meshes, towers, claws, eyes); no other ships |
| **Town walk view** (21 plots at tier 3, 10 islanders, 2 merfolk, all animals; 45 spots × 8 headings) | **≤ 450** | today's 401 − 40 (villagers) + islanders 50 + merfolk 10 + critters 2 + animated parts ≤ 6 (forge glow, dome, aquarium water, notes, grotto pool) + islet statics ≤ 4 = **≈ 433** |
| Build view during a scene | ≤ 450 | the walk view + ≤ 30 stage meshes + 2 builders |
| Dock frame triangles | ≤ 1.5 M | porches and walkways add about 70k |

**CPU:** islanders prebuild one a frame from dock open, the Shellback during wave 2; the walk graph grows from about 10
areas to 32, `path()` under 5 ms.

**Drop order:** islanders 10 → 8 → 6, merfolk 2 → 0, fireflies, current arrows, critters 120 → 60, the panorama.

---

## 15. Accessibility

- **Warnings:** every new warning has a shape, a sound and a word, never colour alone: a hatched fan, a dashed lane with
  arrows, a dotted line that turns solid, a zigzag-edged sector, a spiky ring, a dotted ring.
- **Flashes ≤ 1 Hz:** the fort's lock flashes once; a puffer's ring pulses once a second.
- **Reduced motion:** no bullet-time, glides or shakes; a static fog vignette; a crossfaded construction scene.
- **No mashing:** nets are cut by holding, and every net lets go within 4 s.
- **Controls and text:** real `<button>`s ≥ 44 × 44 with a focus ring; small text on the `--*-text` tokens (≥ 4.5:1);
  NEW FOE! ≥ 24 px with an ink outline, read (like scene captions) through the polite live regions. Talk and the Bestiary
  are non-modal; `Esc` goes back.
- **No walking needed:** every district is in **Walk to…**, and every plot in Bess's panel.
- **Layouts** pass at SPEC3's ten sizes.

---

## 16. Risks

| Risk | Mitigation |
|---|---|
| Scope | pure modules first; buildings as add-on prop kits on the existing layer; the cut list |
| Pool draws vary in difficulty | budgets, rules, a 1,000-seed test, 48-seed bots; a stuck child keeps the same waves |
| A busier town walls the captain in | wide boardwalks, short rope bridges, rings, LOOK-2, the squeeze-past, jog tests |
| Town draw calls | 10 people drawn by nearness, animals in 2 calls, porches baked, the drop order |
| BatchedMesh with the ink outline | the inverted-hull twin (volcano.js's method); fallback: one InstancedMesh pair per species (16 calls) |
| main.js (9,860 lines), one owner | rules in pure modules; the parts registry and three-part compose seamed first |
| Slower SwiftShader suites | two new browser suites, runnable by section; bots offline |

---

## 17. Cut list (from the top; each cut leaves a consistent game)

1. Quests (talk stays).
2. The crow's-nest climb (the tower is listed as scenery).
3. The Mermaid Grotto and the merfolk.
4. The Bestiary tab (the NEW FOE! cards stay).
5. The ebb tide.
6. The coral currents.
7. The Shanty Stage and the Trophy Museum (8 new buildings remain).
8. Turning a battery by boarding it.
9. The builders walking in (they appear at the plot).
10. The Shellback's Charge phase (it becomes two phases, 2,000 hp).

**Never cut:** levels 10–12 with ≥ 6 new foe kinds and seeded pools; the Shellback's Fort and Waking phases with the
checkpoint; the staged construction scene with skip and reduced motion; every platform reachable by porch; ≥ 8 new
buildings; varied islanders (≥ 6 trades or ages, 4 animal species) with routines and talk; validated records and the
migration.
