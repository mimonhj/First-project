# Pirates Ahoy! — "The Storm Isles" update: arcade design

A child holding an iPhone upright should understand each new thing in three seconds from **one picture, one word and one
sound**. Few rules, generous rewards, nothing lost. Each number lives in one table in one module. Everything new is
behind **`WITH_STORM`** in `src/voyage.js` (`?storm=1` until go-live). With it off, the game, the walk fixture and
every record are byte-for-byte today's.

## 0. What ships

| Asked for | Answer |
|---|---|
| more levels | **Voyage IV · The Storm Isles**: 10 Windward Isles, 11 Lantern Mangroves, 12 Thunder Crown (finale), after level 9 |
| wider variance in enemies | 7 kinds that move or attack differently: **Kite Runner** (weaves across your bow), **Net Sloop** (nets), **Barrel Bobber** (mines), **Mist Junk** (teleports), and the creatures **Swordfish School** (dashing swarm), **Sea Serpent** (dives), **Puffer Pod** (burst). Boss: **The Stormcrown**. Later waves are drawn from a seeded pool |
| more houses | 10 new plots (3 home styles, 7 amenities), 3 tiers each |
| show me the house being built | **Building Day**: a 10 s scene with builders, foundation, walls, roof, finishing touches over a blueprint, then the new inhabitants move in; skippable; a reduced-motion version |
| whole island accessible | every platform, today's 11 rope bridges, 16 new links, a crow's-nest ladder, balcony stairs and two new islets are walkable; an **Island map** walks or hops you anywhere |
| different inhabitants | 14 named trades with routines and chats; 8 animal kinds; Marina the mermaid |

**Where I depart from the defaults:**
1. Creatures are `SHIP_TYPES` with `creature: true` (never captured), so aiming, tags and `G.spawn` work unchanged.
2. The finale is a galleon whose weapons visibly break, then a boarding duel: a contrast with the Kraken.
3. New plots and Voyage IV progress get their own records, safe from stale tabs.
4. Some buildings give a delight instead of a combat perk.

---------------------------------------------------------------------------------------------------

## 1. Voyage IV (`src/act4.js`, the SPEC3 §5.1 format + `pool`, `boss`)

Tuned for SPEC3's late-game profile plus one tier. Bots clear every level with 0 special loads within two tries.

| | 10 · The Windward Isles | 11 · The Lantern Mangroves | 12 · The Thunder Crown |
|---|---|---|---|
| Stars | Heroic ★10 | Epic ★11 | Ultimate ★12, finale |
| Screenshot | breezy morning; chalk sea stacks with windmills; 12 festival kites on strings; a waterfall; flying fish over whitecaps | violet-gold twilight; mangrove islets, stilt huts with paper lanterns, lily pads with frogs, fireflies, a sunken stone face; drifting fog banks | crown-shaped sea stacks under a thunderhead; violet lightning inside the clouds; the Storm King's fortress with a brass lightning rod; 4 storm-rod buoys; rain curtains; after the win, a sunset and a double rainbow |
| skyTop, horizon, waterDeep, shallow, foam, waveAmp | 3a9cff, e4f7ff, 1b6fd1, 4fd6ee, ffffff, 0.8 | 3b2a6e, ffb86b, 14505a, 3fae8a, fff3c4, 0.45 | 1c2440, 5a6a9a, 10304a, 2f7f9a, e8f4ff, 0.95 |
| fog near/far, worldRadius | 150/400, 150 | 90/320, 145 | 80/310, 150 |
| Hazard (§4) | gusts | fog banks | storm rods (wave 1) |
| Wave 1, fixed | kite, school, corsair | mist, puffer, kite | bobber + 2 from the pool (budget 5) |
| Wave 2 | pool, must netter, budget 6 | pool, must serpent, budget 7 | stormcrown |
| Wave 3 | pool, budget 7 | pool, budget 8 | — |
| Pool kinds | kite school netter corsair shark privateer bombketch | kite school netter mist puffer serpent skiff ironclad | kite netter school mist puffer serpent shark ironclad |
| nextWaveAt, maxAttackers, lead, spreadMul, grace | 1, 2, 0.7, 0.9, 3 | 1, 2, 0.7, 0.9, 3 | 0, 3, 0.75, 0.85, 3 |
| crates, bonus | 2, 1,800 | 2, 2,100 | 2, 3,000 + treasure 1,200 |
| Music | `windward`: 6/8 jig, tin whistle, accordion, claps | `mangroves`: banjo-marimba groove, frog croaks | `thunder`: brass shanty march, timpani; boss `stormcrown` |
| Env data | `gustDirs` | `fogLoops` ≥ 3 | `rodSpots` (4), `stormArena`, `setCalm(k)` |

**Level banners:**
- L10: "Gusts! Lower your sails when the wind comes. Kite Runners hide off your bow: turn!"
- L11: "Fog banks! Nobody can aim inside the fog. The Sea Serpent comes up beside you: be ready!"
- L12: "Keep clear of the storm rods… then face the Stormcrown!"

**Opening.** With the flag, level 9's Victory gains `sailOn: 'Sail on to the Storm Isles'` and the line "…but on the far
horizon, thunder rumbles." The title shows 12 cards in four groups (`ACT_NAMES[4]`, heading `#123a4a`). Card 10 reads
"Drive off the Kraken". **At load:** `feats.kraken ≥ 1` and `unlocked ≥ 9` → `raiseProgress(10)`.

**L12 victory:** "The storm breaks! Captain Thunderbeard bows: you are the Storm Admiral of the Seven Seas!"

---------------------------------------------------------------------------------------------------

## 2. New enemies

### 2.1 Stats (`shipTypes.js`)

Capture gold is gold × 20 + 25. A creature has no crew pips, never surrenders and pays gold × 10 when "driven off":
it swims away, and pearls bob up.

| Key | Name | hp | len/wid | speed, accel, turn | reload, guns × dmg | gold | crew/grit | engage | Flags |
|---|---|---|---|---|---|---|---|---|---|
| `kite` | Kite Runner | 45 | 8/2.6 | 14, 5, 1.9 | 1.6, 2 × 2 | 5 | 8/1.0 | 18 | kiter |
| `netter` | Net Sloop | 60 | 8.5/2.8 | 10, 3.4, 1.3 | 3.0, 1 × 3 | 6 | 10/1.0 | 18 | nets |
| `bobber` | Barrel Bobber | 90 | 10/3.6 | 7, 2, 0.8 | 3.2, 2 × 3 | 8 | 12/0.9 | 30 | mines |
| `mist` | Mist Junk | 80 | 10/3.4 | 8, 2.6, 1.0 | 2.6, 2 × 5 | 9 | 12/1.1 | 22 | blink |
| `school` | Swordfish School | 40 | 6/4 | 15, 8, 2.4 | — | 4 | 1/1 | — | creature, dash |
| `serpent` | Sea Serpent | 140 | 14/2.2 | 10, 4, 1.4 | — | 14 | 1/1 | — | creature, dive |
| `puffer` | Puffer Pod | 36 | 6/6 | 3, 1, 0.6 | — | 3 | 1/1 | — | creature, puff |
| `stormcrown` | The Stormcrown | 460 | 19/6.2 | 6.5, 1.8, 0.55 | 2.8, 6 × 5 | 40 | 30/1.7 | 26 | boss, parts, yields |

### 2.2 Behaviours (`mechanics4.js`; they follow the flags on any level)

Every warning lasts ≥ 1.5 s, plus the Lighthouse's bonus.

| Kind | What it does | Telegraph | Counter (the meet-card line) |
|---|---|---|---|
| Kite Runner | Weaves across your bow 16–20 u ahead every 4 s, firing when you're abeam of her; circles if you're below 3 u/s | a big striped kite on her mast | "She hides off your bow. **Turn** to get her in your sights!" (Chain or Frost: she can't keep up) |
| Net Sloop | Every 10 s at 12–22 u, a net at your predicted spot: inside, speed ×0.3 and turning ×0.5 for 4 s, no damage; no net for 8 s after a release | a white net ring (r 4) spins over the spot for **1.6 s**, a whirr, "NET!" | "Steer out of the white ring! Netted? **Hold G** to cut it." (Stink pauses her nets) |
| Barrel Bobber | Loops across your course 26–34 u off, dropping a barrel every 5 s (≤ 8 afloat, 25 s each). Touching an armed one: **10 damage** within r 4, pirates too. A hit pops it ("POP!") | arms **1.5 s** after the drop: fuse lantern, fizz, red ring (r 4), minimap dot | "**Shoot** her barrels or steer round them!" |
| Mist Junk | Every 9–12 s she vanishes and reappears 22–28 u away on your other side; she can't be hit while gone and doesn't fire for 1 s after | 6 paper lanterns swirl at the spot for **1.6 s**, a chime, "POOF!" | "Watch the **lanterns**: she pops out there!" (Stink stops it; Frost delays it 4 s) |
| Swordfish School | 5 fish (8 hp each) circle at 25–35 u; every 7 s they dash at 26 u/s along a lane through your predicted spot: 2 damage a fish | a dashed white lane (3 × 50 u) with fins, **1.6 s**, a swish, "ZIP!" | "**Steer off** the white lane!" (each grape ball that hits takes a fish; Stink: no dash for 4 s) |
| Sea Serpent | A shadow under water that **can't be hit**. Every 8–10 s it surfaces 10–14 u off your loaded beam for 6 s, then **bites** (cone 10 u, 50°): 10 damage | a bubble ring (r 5) **1.8 s**, "SERPENT!"; the bite: a red cone **1.5 s**, "CHOMP!" | "**Fire when it's up**, then leave the red cone!" (Frost keeps it up; Stink: it dives without biting) |
| Puffer Pod | 3 puffers (12 hp each) drift to you at 3 u/s. Within 10 u they burst: **8 damage** within r 6, then rest for 5 s. A hit pops a puffer | they swell red with spikes; a ring (r 6) **1.6 s**, "PUFF!" | "Shoot it **from far away**!" (Fire pops all three; Frost: no burst) |

### 2.3 Meeting a kind, and looks

The **first time ever** a kind spawns (bit in `storm.met`), a **meet card** (icon, name, counter line) takes the
banner slot for 3.5 s and `#game-live`; its tag wears a gold **NEW** for 10 s. Pools only draw met kinds (plus
`must`). Off-screen lanes, rings and nets get today's edge arrow.

**Looks** (`ships.js`; creatures in new `seafolk.js`; each ≤ a Man-o'-War's calls):

| Kind | Look |
|---|---|
| Kite Runner | a teal cutter towing a striped kite |
| Net Sloop | a green sloop with a net boom |
| Barrel Bobber | a barge of red skull barrels |
| Mist Junk | a lavender junk strung with lanterns |
| Swordfish School | 5 silver swordfish, instanced |
| Sea Serpent | a friendly horned head and 3 humps (≤ 8 calls) |
| Puffer Pod | yellow puffers, instanced |
| The Stormcrown | a four-master with lightning-bolt sails and her own thundercloud (≤ 1.4× a Man-o'-War) |

---------------------------------------------------------------------------------------------------

## 3. Wave pools (`src/pool.js`, pure)

`POOL_COST`: cutter 1 and puffer 1; kite, school, netter, shark, corsair, privateer and skiff 2; mist, bobber,
bombketch and ironclad 3; serpent 4. `drawWave(spec, rng, { met, prev })` and `levelWaves(def, seed, met)` work like
this:

1. Take `must` and the fixed entries first.
2. Pick weighted at random (Voyage IV kinds weigh 2, older kinds 1) among met kinds that fit the remaining budget, up
   to 3 ships.
3. At most 2 of a kind; at most 1 serpent, 1 netter and 1 bobber.
4. Redraw (up to 8 times) if the wave equals the previous one as a set or spends less than budget − 1.
5. The seed comes from `combatRng` once in `startLevel`, and all waves are drawn then, so prebuilds work. **Try again**
   draws afresh; the boss checkpoint keeps its waves. Tests pin the seed with `G.combat.seed(s)` and read
   `G.storm.waves`.

A school or a pod counts as one ship, so SPEC3's ≤ 3 a wave and ≤ 4 afloat still hold.

---------------------------------------------------------------------------------------------------

## 4. Hazards (`mechanics4.js`; pure functions of simulated time and `ctx.rng`)

| | Gusts (L10) | Fog banks (L11) | Storm rods (L12, wave 1 only) |
|---|---|---|---|
| When | first at 25 s, then every 16–22 s | 3 banks (r 12–16) of puffy white clouds riding `fogLoops` at 1.2 u/s | every 6–8 s, at the rod nearest you within 45 u |
| Warning | **2.0 s**: wind streaks race toward you, petals fly, the kites tug, a whistle, "GUST! Lower your sails!", a WIND edge arrow (reduced motion: static arrows) | none needed: slow and plainly visible | **1.8 s**: the rod's ring (r 7) crackles, sparks climb it, a buzz, "ZAP!" |
| Effect | 1.2 s. Sails over 1/3: pushed 7 u and turned up to 0.6 rad, "WHOOSH!" (no damage). Sails reefed: "HOLD FAST!". Stern to it: +3 speed for 3 s, "WIND IN YOUR SAILS!". Pirates are pushed too | a ship inside **can't aim or be aimed at**; balls already flying still hit. Its tag reads "In the fog"; you mend +1 hp/s inside; the Fire cells read **FOG!** | 12 damage within r 7 to every ship; flash ≤ 0.25 opacity, ≤ 1 per 3 s |
| Fairness | no damage | no bank near the start for 8 s; the serpent surfaces only outside fog | stops when the Stormcrown arrives (no stacking) |

---------------------------------------------------------------------------------------------------

## 5. The finale: The Stormcrown

She **arrives** with three drum booms, sailing out of the fortress gate under her thundercloud: "THE STORMCROWN!" Any
key skips the 3 s camera. Your special loads refill here (the checkpoint).

| Weapon (90 hp, gold glow, a mini bar under the boss bar) | Attack | Telegraph | Knocked out |
|---|---|---|---|
| Thunder Drum, amidships | every 9 s, lightning at your predicted spot: r 5, 12 damage | three booms, a white-violet ring **1.8 s** | "DRUM SMASHED!" +100 gold |
| Dragon Chaser, bow | every 10 s if you're ahead of her bow ±35° within 30 u: a fire lane 26 × 5 u, 10 damage | glowing jaws, an orange lane **1.8 s**, a roar | "DRAGON SNUFFED!" +100 |
| Stern Mortar | every 8 s, the Bomb Ketch's shell: r 4.5, 12 damage | an orange ring **2.2 s** | "MORTAR CRACKED!" +100 |

- **Hitting her.** A ball's damage comes off her hull and off the weapon in the third it hits (bow, middle, stern).
  Knocking weapons out is optional; it only makes her gentler.
- **Summons.** At 66 % and 33 % hull, one Kite Runner joins her ("Thunderbeard calls a Kite Runner!").
- **Attack spacing.** Attacks never land within 1.5 s of each other.
- **She yields.** Her hull stops at 1: "THE STORMCROWN STRIKES! BOARD HER!" Her guns stop and your crew is topped up.
  Grapple her for the **duel** with Thunderbeard: three clashes, his cutlass spins away, he bows (6 s, always won,
  skippable). The storm parts into a double rainbow and his chest (1,200 gold) drifts to you.
- **Checkpoint.** Sunk after she arrives: **Try again from the Stormcrown** (full hull, loads, the plunder you had at
  her arrival). Session memory only.
- **Rewards.** The **Storm Crown** hat at Polly's, the Stormcrown moored in town, and `storm.won = 1`.
- **Length.** Bots tune the fight to 120–180 s.

---------------------------------------------------------------------------------------------------

## 6. Battle controls and HUD

There are no new keys or buttons.
- **Netted:** hold `G` 0.8 s or press it 3 times; on touch, hold **CUT!** (the Board button). `#grab-strip` reads
  "NETTED! Hold G to cut it" with a timer bar, and a net drapes over the ship.
- **Gusts:** reef with `S` or `−`.
- **New tags:** a serpent under water reads "Under water" (the FIRE! light stays dark for it); a smashed weapon gets a
  cross *and* the word "Smashed".
- **Level-cleared card:** new lines "Aquarium +40", "Museum +15% +60" and "Goat Farm +40". With the Fishing Hut, the
  reinforcements banner says "4 more hands aboard".

---------------------------------------------------------------------------------------------------

## 7. The whole island, walkable

| District | Walkable decks | Links (new in bold) |
|---|---|---|
| Harbour | pier, plaza, tavern, tower, yard, Polly's, garden; **tavern balcony**, **crow's nest** | today's 4; **balcony stairs** (2.06 u up over 3.2 u); **lookout ladder** (`climb`, 5.8 u over 1.9 u) |
| Old Row | s2, s3, s7, s16, s17 | today's s1S2, tavernS3, yardS7, tavernS16, s7S17, made walkable |
| Garden Point | s8, s13, s14, s15, s6 | gardenS13 and s13S14 made walkable; **garden–s8, s8–s14, s8–s15, s15–s6**; **s6–tower gangway** (1.6 u) |
| Lantern Lane (new) | s10, s4, s12, s5, s11 | **tower–s10 and s3–s12 boardwalks**; **s10–s4, s4–s3, s12–s5, s5–s11, s5–s2** |
| Shipwright's Reach | s9, s18 | **yard–s9, s9–s18** |
| Goat Hill (new islet) | mound at (−39, −32), r 6.2, profile `[[0,3.6],[3.2,3.6],[4.8,2.2],[6,1.5]]` | **s6–hill** |
| Sunny Sands (new islet) | beach at (−36, 7), r 7, profile `[[0,1.9],[4,1.7],[6.4,1.45]]`; aquarium pier `s20` (6 × 5) at (−30.5, 13) | **s14–sands**; a portal to the pier |

**Rules** (walk.js only passes a `climb` flag through):
- **Plot platforms.** Each becomes a walk rect with a **building pad**: a blocker from tier 0, the tier-3 footprint
  + 0.2, so the walk data never changes with tiers. A test checks every tier's chunk fits its pad. Where less than
  1.6 u of porch would be left, the platform gains a 1.6 u porch extension.
- **Widths.** Rope bridges keep `BRIDGE_HW`. The boardwalks are 1.8 u wide, so two people can pass.
- **Climbs.** The captain plays `climb` on them; walkers and animals never take them.
- **Unreachable:** only boats, roofs and the sea. A walk test reaches every platform, both islets, the balcony and
  the crow's nest from the spawn.
- **Never walled in.** Today's squeeze-past (0.25 s) and LOOK-2 waiting cover every walker. Routines never pause on a
  rope bridge, within 2 u of a mouth or a ladder foot, in a doorway or in a place circle. At most 2 routines share a
  rope bridge; long routes use the boardwalks.
- **Determinism.** Today's `rand()` order is untouched; every new piece draws from its own named `mulberry32` stream.
- **Ownership:** new `src/env/isles4.js`, called by sparrow.js.

**Island map** (`src/islandMap.js`): `I` or the Harbour menu (a 7th places-bar button won't fit 320 px).
- It shows a parchment SVG drawn from `env.walk`, with building icons and a "You are here" pin.
- Beside it, a district-grouped list of ≥ 44 px buttons.
- A pick offers **Walk there** or **Hop there**: a 0.6 s fade, a cut under reduced motion.

**Sea Guide** (`src/guidePanel.js` + pure `src/guide.js`). It opens at the Museum's door or from the Harbour menu.
- It has a card for each of the 25 enemy kinds (24 ship types and the Kraken): icon, name, what she does, how to beat her.
- Unmet kinds show a grey "Not met yet" silhouette.

---------------------------------------------------------------------------------------------------

## 8. Ten new buildings (`island.js` `PLOTS4`)

Prices: **homes 120 / 300 / 600**, **amenities 200 / 450 / 850**. Every tier-0 perk is today's number.

| id | Name, place | Tiers 1 / 2 / 3 | Perk or *delight* by tier | Brings (tier 1, then 2, then 3) |
|---|---|---|---|---|
| `homeE` | Barrel House, s4 | Barrel hut / Barrel stack / Barrel castle | 2 / 4 / 6 villagers | the Bosun sailor family; Anchor the dog; a sailor kid |
| `homeF` | Shell Cottage, s10 | Shell hut / Conch cottage / Pearl palace | 2 / 4 / 6 villagers | shell-collectors; 2 porch crabs; **Marina the mermaid** on her rock |
| `homeG` | Treehouse, Sunny Sands | Tree hut / Treehouse / Treetop lodge | 2 / 4 / 6 villagers | kids and grandparents; Coco the monkey; a 2nd monkey and a rope swing |
| `fishing` | Fishing Hut, s9 | Fishing hut / Smokehouse / Fish market | reinforcements bring +1 / +2 / +3 hands | Finn the fisher; Pearl the fishwife; 2 cats |
| `forge` | Blacksmith's Forge, s11 | Anvil / Forge / Iron works | nets hold 3 / 2.5 / 2 s (4 s) | Smithy Sam; Ida the apprentice; Bolt the dog |
| `aquarium` | Aquarium, s20 | Rock pool / Aquarium / Grand aquarium | +10 / 20 / 30 gold a creature driven off; *a tank for each creature kind you've beaten* | Keeper Kai; 2 visitors; 2 turtles |
| `observatory` | Observatory, s17 | Spyglass / Star dome / Great telescope | +1 / 2 / 3 powder crates on Voyage III–IV levels (≤ 5) | Stella the stargazer; Hoot the owl; an apprentice |
| `music` | Music Hall, s5 | Fiddler's stump / Music stand / Shanty hall | *the town tune gains fiddle / drum / squeezebox; at tier 3 villagers dance on the plaza every 60 s* | Piper Paz; Drummer Dot; Squeezebox Sid |
| `farm` | Goat Farm, Goat Hill | Veg patch / Goat farm / Orchard | +20 / 40 / 60 gold a cleared level | Farmer Fern with 2 / 4 / 6 goats |
| `museum` | Captain's Museum, s12 | Trophy shelf / Trophy hall / Grand museum | +5 / 10 / 15 % capture gold (≤ 200 a level); *the Sea Guide; models of ships you've captured* | Curator Quill; a tour group; the statue garden |

Max heights: 7 u, except the treehouse and museum 9, forge 8, observatory 11 and farm 6.

- **Totals:** new homes 3,060, amenities 10,500, all new 13,560. The whole island costs **25,360**, with 60 tiers and
  42 villagers. The villagers' gift keeps its 240 cap.
- **Ranks:** today's five, plus **Grand Port** at 45 tiers and **Jewel of the Seas** at 60, which wins the
  **Admiral's coat**. The Governor's coat stays at 30.
- **Art:** each tier adds to the last, all baked into the one development layer. Tier 3 is a barrel castle, a pearl
  palace, a lodge with a zip line, a fish market, an iron works with a water wheel, an aquarium dome, a telescope
  turning at 0.1 rad/s, a shell-shaped hall, an orchard with a windpump, and a museum dome with a gold anchor.

---------------------------------------------------------------------------------------------------

## 9. Building Day

**Start:** Bess's button saves `island4`, then the chest, then plays the scene.

**Framing.**
- The camera glides 0.6 s to the plot (today's `focusPlot`), then eases ±10° around it.
- On phones the bottom sheet folds to a 56 px bar: "Building the Barrel House…" and a 44 px **Skip ▶▶**.
- A stage pill at the top reads "Walls ●●○○".

| Stage | First build / upgrade | What you see | Sound | Words |
|---|---|---|---|---|
| Builders arrive | 0.6–1.6 / 0.6–1.4 s | Bess's crew hop off a rowboat at the nearest walk point: **Hammer Hal** (hammer), **Tilly** (saw), **Pip** (planks). On a first build, the old shack wobbles and goes "poof" | footsteps, poof | "Builders on the way!" |
| Foundation | 1.6–3.0 / — | stones and beams pop in row by row | thunks | "Laying the foundation!" |
| Walls | 3.0–5.2 / 1.4–3.6 s | the scaffold rises; the walls grow up; builders hammer from the plank nearest the top; sawdust puffs | hammer rhythm, saw | "Raising the walls!" |
| Roof | 5.2–6.8 / 3.6–5.2 s | a pulley hoists tiles; the roof grows | clatter | "Putting on the roof!" |
| Finishing touches | 6.8–8.0 / 5.2–6.4 s | the scaffold sinks in a puff; paint confetti; flowers, flags and bunting; windows light; the chimney puffs | sparkle, jingle | "Finishing touches!" |
| Move in | 8.0–10.0 / 6.4–8.0 s | the inhabitants walk up from the nearest bridge with a crate or a rod, their pet trotting behind, and wave: "Thank you, Captain!"; the builders cheer | cheer, stinger | "Bosun Bo and Nell moved in!" |

- **Blueprint.** What's still to come shows as a pale-blue see-through blueprint (one flat `noOutline` mesh,
  opacity 0.3) that each stage fills with colour.
- **How it's built.** No clipping planes (the outline pass may ignore them). The baked chunk's triangles are split by
  centroid height into 4 slices (15 %, 60 %, 90 %, the rest plus `finish` props); each grows `scale.y` 0 → 1 in its
  stage, then all rebakes into the layer (≤ 40 ms).
- **Skip.** Any key, tap, `Esc` or Skip jumps to the end with one cheer; a second `Esc` leaves.
- **Reduced motion.** Four held frames (1.2 s, 0.3 s crossfades), same words and sounds; inhabitants fade in. 6 s.
- **`#build-live`** reads each stage once, then "Barrel House built. 2 villagers moved in. Villagers 26 · Grand Port."
- **Today's ten plots** use this scene too, replacing the 2.4 s montage.

---------------------------------------------------------------------------------------------------

## 10. Inhabitants (`src/islanders.js`, pure)

New people.js options draw no `rng()` unless given, so the 400-seed comparison holds:
- hats `toque` and `starhat`;
- tools `saw`, `drum` and `spyglass`;
- `tail: true`, a mermaid who only sits;
- the action `climb`.

| Trade | Look | Routine (stops are actions) | Line |
|---|---|---|---|
| Fisherfolk | old/man, straw hat, rod, yellow coat | pier edge `fish` 20 s → hut `carry` 6 s → bench `sit` 10 s | "Swordfish swim in a line. Step aside!" |
| Merchant | woman, kerchief, crate | stall `wave`/`idle` 15 s → plaza → back | "Two fish for a doubloon!" |
| Blacksmith | man, bald, beard, dark vest, hammer | anvil `hammer` 15 s → barrel `idle` 4 s | "Netted? Hold G and cut it!" |
| Baker | woman, `toque` | oven → plaza `carry` → back | "Fresh biscuits today!" |
| Musician | pirate, fiddle or `drum` | hall `fiddle` 30 s → tavern `sit` | "Hear that? A new shanty!" |
| Sailor | pirate, stripes, bandana | pier `haul` 12 s → tavern rail `lean` | "Fair winds, Captain!" |
| Kid | kid | beach tag, fetch with the dog, `cheer` at the band | "Race you to the beach!" |
| Grandparent | old, glasses | benches `sit` 30 s, a slow walk (×0.6) | "In my day the Kraken was THIS big!" |
| Stargazer | old woman, `starhat`, `spyglass` | telescope `point` 20 s → bench | "The serpent pops up beside you!" |
| Farmer | woman, straw hat, basket | barn → pen → orchard `carry` | "Meeh! That's 'hello' in Goat." |
| Curator | old man, glasses, pointer | steps `point` 15 s → statues | "Every capture gets a model here!" |
| Keeper | woman, cap, bucket | tanks `fish` → pier | "Shoot puffers from far away!" |
| Marina (sea folk) | woman, `tail`, teal and pearl | her rock off Sunny Sands: `sit`, `wave` | "The sea is singing today!" |

- **Names** come from fixed lists per trade (Finn, Pearl, Sam, Paz, Stella, Fern…), picked by plot and index. Today's
  four homes gain trades too.
- **Chat.** Within 1.6 u of an islander with no door prompt, the prompt reads "Talk to Finn" and the round button
  **Talk**. `E`, `Enter` or a tap shows up to 3 lines in a bubble, read by `#town-live`. A tap on an islander walks you
  up to them and starts the chat. Lines follow your progress. Today's waves and greetings stay.

**Animals** (`src/critters.js`: one InstancedMesh per species + its ink twin = 2 calls). They hop, waddle and squash
like wind-up toys, and never block anyone. `E` or a tap pets one.

| Animal (cap) | Where | Routine | Pet it |
|---|---|---|---|
| Cat (4) | Fishing Hut, tavern roof | naps; follows the fisher | "Purr…" ♥ |
| Dog (3) | Barrel House, Forge | heels its owner; fetch with kids | "Woof!" |
| Goat (6) | Goat Hill | grazes; one on the barn roof | "Meeeh!" |
| Monkey (3) | Treehouse, palms | swings between trees | "Ooh-ooh!" |
| Crab (8) | Sunny Sands | sideways dashes | "Click-click!" |
| Turtle (4) | Sunny Sands | crawls from the surf and back | a slow blink |
| Parrot / owl (6) | plaza, Observatory | hops; flies every 20 s | "Squawk!" |
| Dolphin (3) | the bay | leaps every 6–10 s | — |

**Caps:**
- `VILLAGER_CAP` 8 → **12** walking; the rest are at home.
- `TRADE_CAP` **14** at work.
- `PEOPLE_DRAWN` **24**: each 0.25 s, the nearest 24 people in front of the camera within 40 u are shown, with 1.5 u
  hysteresis. Anyone within 6 u of the captain, and anyone he's chatting with, is always shown. Stage 0 sets the final
  number from the measured walk-view breakdown.
- Islanders are built one per frame at dock open.

---------------------------------------------------------------------------------------------------

## 11. Saves and migration

| Key | Format | Notes |
|---|---|---|
| `pirates-ahoy-island4` (new) | `{"v":1,"t":{"homeE":0,…,"museum":0}}` | `parseIsland4`: ≤ 4 KB, plain integers 0..3, known ids, own properties, never throws |
| `pirates-ahoy-storm` (new) | `{"v":1,"reached":0,"won":0,"met":0,"aq":0,"tips":0}` | `parseStorm` (`src/stormRecord.js`): ≤ 1 KB; `reached` 0 or 10..12; `met` a 31-bit mask over `GUIDE_KINDS`; `aq` 0..7 |
| `pirates-ahoy-unlocked` | 1..12 | Voyage IV access = max(`unlocked`, `storm.reached`), so an old tab clamping it to 9 changes nothing |
| `pirates-ahoy-feats` | + `storm`; `island` up to 60 | merged by max, and re-derived from their records at load |
| `pirates-ahoy-look` | + `hat.stormcrown`, `coat.admiral` | trophies |

- **The storage rule:** a build writes `island4` first, then the chest; if the record can't be written, nothing is paid.
- **Two tabs:** the larger tier wins; masks are or-ed.
- **Migration:**
  - The Kraken driven off and level 9 open → level 10 open, `storm.reached = 10`.
  - `met` is seeded with every kind below your progress.
  - No old key changes a byte.

---------------------------------------------------------------------------------------------------

## 12. Modules and APIs

```js
// mechanics4.js (pure)
export const MECHANIC4_IDS = ['gusts', 'fog', 'rods', 'stormcrown'];
export const KITE, NET, MINES, BLINK, DASH, DIVE, PUFF, GUSTS, FOG, RODS, STORMCROWN, WORDS4;
export function createMechanics4(ids, ctx) → { ...SPEC3 hooks, targetable(e), playerMods() → { speedMul, turnMul, netted },
  cut(), cutHold(down), parts(e), hitPart(e, third, dmg) → word | null, yielded(e), barrels(), popBarrel(i), visuals() }
// composeMechanics([a, b, c]): c's state under `m4`, steer a‖b‖c, targetable = all agree, visuals { ...b, ...c }
// island.js (old calls unchanged; s4 defaults to the empty island4)
export const PLOTS4; export function parseIsland4, serializeIsland4, mergeIsland4, plotState4, build4, totals4, perks4(s4);
export function villagers(s, s4), tiersBuilt(s, s4), rank(s, s4), gift(s, s4);
// islanders.js (pure)
export const TRADES, ANIMALS, NAMES, VILLAGER_CAP, TRADE_CAP, PEOPLE_DRAWN;
export function islandersFor(s, s4, progress), animalsFor(s, s4), chatLines(id, progress);
// pool.js, guide.js, stormRecord.js (pure); act4.js; env/windward.js, mangroves.js, thunder.js
// seafolk.js: buildCreature(type), animateCreature(mesh, state, t)   (ships.js buildShip delegates to it)
// critters.js: createCritters(scene, opts) → { set(list), update(t, dt), pick(ray), react(i), dispose() }
// env/isles4.js (districts, islets, plot art kits); env/buildScene.js: { start(plot, from, to), step(dt), skip(), stage }
// islandMap.js, guidePanel.js: create…({ root, ctx }) → { open, close, onKey, refresh, active }
```

**Changed files:** `main.js` (pools, meet cards, `targetable`, nets, part hits, the Stormcrown, 12 cards, migration,
records), `voyage.js`, `act3.js`, `shipTypes.js`, `ships.js` (5 models, the net drape), `cosmetics.js`, `people.js`,
`tags.js`, `pops.js`, `audio.js` (4 scenes, town-band layers, about 30 SFX), `sparrow.js`, `town.js` (climb, Talk,
hop), `townMode.js`, `buildPanel.js` (20 rows), `index.html` and the CSS.

**`__game` additions:**
- `G.storm` `{ waves, met, meet(k), parts, yielded, netted, fog(x, z), gust, checkpoint }`
- `G.island4`
- `G.town.islanders`, `G.town.critters`, `G.town.chat(id)`, `G.town.hop(id)`
- `G.town.buildScene` `{ stage, t, skip() }`

---------------------------------------------------------------------------------------------------

## 13. Performance (`renderInfo.calls`, `?quality=low`, 1280×720)

| Scene | Budget | Plan |
|---|---|---|
| Voyage IV env / level start | ≤ 220 / ≤ 310 | merged statics; one instanced mesh per decor kind |
| Busiest play, the Stormcrown fight | **≤ 450** | ≤ 4 afloat; barrels, schools, pods 2 calls each; rings ≤ 6 |
| Act I–II / III starts | unchanged / ≤ 310 | only Observatory crates (+2 calls each) on III |
| Town walk view: 20 plots at tier 3, everyone out (**48 spots × 8 headings**) | **≤ 450** | new decks baked into today's meshes (+0 calls, ≤ 120k triangles); layer ≤ 6; animated parts ≤ 9; critters ≤ 16; people ≤ 24 × 5 |
| Building Day | ≤ 450 | build view (≤ 96 today) + slices ≤ 24 + blueprint 1 + builders 20 |
| CPU | ≤ 1.5 ms a frame | routes precomputed; critters updated within 40 u |

**Drop order:** dolphins; fireflies 120 → 60; people drawn 24 → 20 → 16; flying parrots; the blueprint.

---------------------------------------------------------------------------------------------------

## 14. Accessibility

- **Threats.** Shape, word and sound, ≥ 1.5 s ahead; never colour alone.
- **Without walking.** Every place, building and the Sea Guide can be reached from the map and the Harbour menu.
- **Live regions.** Chats, stages and meet cards are read politely.
- **No mashing.** A net always lets go within 4 s and is cut by holding `G`. The duel can't be lost.
- **Reduced motion:** held build frames, static gust arrows, no orbit or glide, no hopping.
- **Light.** Flashes ≤ 0.25 opacity and ≤ 1 per 3 s; glows ≤ 1 Hz.
- **Layouts.** Targets ≥ 44 px, text ≥ 4.5:1, at SPEC3's ten sizes.

---------------------------------------------------------------------------------------------------

## 15. Tests and stages

| Suite | Checks |
|---|---|
| `mechanics4.test.cjs` | telegraphs ≥ 1.5 s; nets never chain; the serpent surfaces on the loaded beam; fog, gusts, rods; the Stormcrown's parts and yield; pool rules over 10,000 seeds, deterministic |
| `island.test.cjs` (appended) | totals 3,060 / 10,500 / 13,560; the parse battery; old calls unchanged |
| `islanders.test.cjs`, `storm.test.cjs` | caps, unique names, lines ≤ 70 characters; the record |
| `walk.test.cjs` (`storm: true` fixture) | every deck reached; climbs; bridges crossed both ways; pads fit every tier |
| `voyage4.cjs` | cards, migration, levels 10–12, meet cards once, each kind via `G.spawn`, nets, fog, the duel, the checkpoint, draws |
| `isles4.cjs` | every district walked with everyone out; Building Day stages, skip and reduced motion; chats; map hop; 48 × 8 draws; two tabs |

- **Existing suites** pass untouched with the flag off. At go-live, edits are listed exactly, as SPEC3 §13.4 did:
  9 → 12 levels, L9's sail-on, walk.test's "no plot walkable", and the trophy cross-check (Governor's coat at the
  old plots' 30 tiers).
- **Stages:**
  - **0:** flag, stubs and seams, with the people budget measured.
  - **1:** modules in parallel.
  - **2:** integration.
  - **3:** go-live and bot balance (L10 < L11 < L12; the boss 120–180 s).
  - **4:** review and README.

---------------------------------------------------------------------------------------------------

## 16. Risks

| Risk | Mitigation |
|---|---|
| Town draw calls | baked statics; instanced critters; a measured people cap; the 48 × 8 probe |
| The walking bug on new bridges | squeeze-past and LOOK-2; wide boardwalks; crossings tested with everyone out |
| sparrow.js has one owner | new districts in `isles4.js`, the scene in `buildScene.js`, animals in `critters.js` |
| 7 new kinds overwhelm a child | one fixed meet wave per level; meet cards; pools draw met kinds only; the Sea Guide |
| Creature flags leak into ship code | one `isCreature()` helper; grapple and capture tests per creature |
| Outline artefacts in the build scene | slices and scaling, no clipping; a `noOutline` blueprint |
| Stale tabs | new keys; `storm.reached`; feats re-derived |
| Finale too hard or too long | optional weapons, attack spacing, 2 summons at most, checkpoint, bots |

---------------------------------------------------------------------------------------------------

## 17. Cut list (from the top; each leaves a consistent game)

1. Dolphins and the owl.
2. Chats beyond one line.
3. The Music Hall's tune layers (the dancing stays).
4. Hop there (Walk there stays).
5. The Sea Guide (meet cards stay).
6. The crow's-nest ladder and the balcony stairs.
7. The Museum and the Music Hall (8 buildings remain, totalling 10,560).
8. Puffer Pod (6 kinds remain; L11's wave-1 slot becomes a Net Sloop).
9. Level 11 (Mist Junk and the Serpent join L12's pool; fog goes).

**Never cut:**
- levels 10 and 12 with the Stormcrown's weapons, yield and duel;
- at least 6 new kinds with meet cards, and seeded pools;
- at least 8 buildings with Building Day (stages, skip, reduced motion);
- every visible deck walkable;
- named trades with routines, and at least 4 animal species;
- the records, migration and storage rule;
- the budgets.
