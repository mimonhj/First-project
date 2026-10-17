# Pirates Ahoy! — "The Kraken's Wake" update: depth design

The aim: every new toy answers a new problem, and every coin meets a choice. The new ammo counters the new enemies.
The island makes the ammo. The quiz helps pay for the island. The disasters reward good steering. The Kraken tests it
all. Numbers are starting values, and each lives in one table in one module (SPEC2 §0).

**Where I change the coordinator's defaults:**
- **Island buildings make the special ammo, free at every level start.** You don't buy it per shot. This ties ammo to
  the island, can't be farmed, and needs no new shop.
- **Steering is a tavern crew upgrade (the Helmsman), plus free touch aids** (tap the sea to set a course, and an
  optional ship's wheel). This leaves the shipyard's six tested upgrade cards alone.
- **The Kraken is driven off, not slain.** Its bar is "fury". Just as hard, and kinder.
- **Each amenity has a fixed site.** You don't place them yourself, which keeps the island readable and the draw
  calls predictable.
- **Old saves:** the `legend` feat (the Phantom captured) opens level 7 at load.

The "walled in by a townsperson" fix (task #64) must hold for the new walkers too. Villagers add walkers, so they
also get a step-aside rule (§6.5).

---

## 1. Progression across the nine levels

| Lvl | Sea · label | New threat | New answer | Bonus | Banked on a first clear* | Typical island step |
|---|---|---|---|---|---|---|
| 1 | Europe · Easy | cutters | round | 100 | 650 | School 80, a Cottage 60 |
| 2 | Bali · Medium | prahus, reefs | chain | 200 | 850 | Bakery, Lighthouse |
| 3 | Volcano · Hard | lava, Molten Maw | grape | 400 | 1,200 | Market opens |
| 4 | Doubloon Bay · Tricky | fleeing galleons | **Fire shot** (Forge opens) | 500 | 2,000 | Forge. Fire stops captures, so it's a trap here |
| 5 | Frostbite · Tough | raiders, floes | fire | 700 | 1,500 | Ice House opens |
| 6 | Maelstrom · Legendary | Phantom, lightning | **Frost shot** | 1,000 | 2,200 | Stink Shed opens |
| 7 | Sunken City · Daring | **fireships, Iron Turtle, waterspouts** | **Stinkpots** | 1,300 | 1,900 | ammo buildings to tier 2 |
| 8 | Cape Horn · Fearsome | **bomb ketches, Squid Skiffs, rogue waves** | Helmsman, Lighthouse | 1,600 | 2,400 | Lighthouse, Bakery |
| 9 | Kraken's Deep · Mythic | **Ink Queen, then the Kraken; hurricane wind** | everything | 2,500 + 1,000 bounty | 4,300 | — |

\*Without the island tithe. One pass through all nine banks about 17,000. Buying everything costs 24,660: ship
5,270, tavern 5,750, Polly's 1,200 and the island 12,440. So a first pass buys about two thirds. The rest is the long
game: about two more runs of Voyage III, plus 1,120 from the quiz.

**Long-term goals** (shown with progress in the captain's log): drive off the Kraken (trophy pet **Inky the baby
octopus**); capture the Ink Queen (**Ink-black sashes** for the crew); make the island a **Pirate Capital**
(**Governor's hat**); earn 9 and then 18 quiz stars (**Bookworm parrot**, then the **Quizmaster's mortarboard**).

**Difficulty**: the order is promised within each voyage (SPEC2 ACT-2). Voyage III is measured by bot v3 on a
"late-game" profile costing about 4,000:
- shipyard: guns 1, shot 2, crew 2, hull 2, sails 1, carpenter 1
- tavern: boarders 1, cutlass 1, gunner 1, helm 1
- island: Forge, Ice House, Stink Shed, Bakery and Lighthouse at tier 1, with 5 villagers

Target median damage: L7 ≈ 70, L8 ≈ 100, L9 ≈ 170. **Every level must also be winnable with 0 special charges**
(bot v3 with no specials, within two tries). Special ammo helps; it is never required.

---

## 2. Special ammo: Fire shot, Frost shot, Stinkpots

### 2.1 Supply and limits

| Ammo | Made by | Opens after | Charges per level at tier 1 / 2 / 3 |
|---|---|---|---|
| Fire shot | Forge | L3 cleared | 2 / 3 / 4 |
| Frost shot | Ice House | L5 cleared | 2 / 3 / 4 |
| Stinkpots | Stink Shed | L6 cleared | 2 / 3 / 4 |

**One charge fires one side's broadside.** Picking a special loads both sides. Each side that fires it uses a charge,
then reloads with your last basic ammo. So `Space` uses two charges. With one charge left, the first side to fire
takes it and the other side drops back to basic ammo ("Out of Fire shot!").

Lockers refill at every level start, and at the Kraken checkpoint. Nothing carries over, so there is nothing to hoard
or grind. A level lasts 40–80 broadsides; at most 12 of them can be special.

### 2.2 Numbers (`combat.js`: new `AMMO` rows and a `STATUS` table)

Each special applies its status **once per volley per target**.

| Ammo | Hull × | Range | Reload × | Spread × | Pad / top | Status |
|---|---|---|---|---|---|---|
| Fire | 0.6 | 30 | 1.1 | 1.1 | 0.3 / 3.8 | **Ablaze**: 4 hp/s for 6 s (a new hit restarts it). Can't be grappled ("Too hot to board!"), no repairs |
| Frost | 0.5 | 30 | 1.15 | 1.1 | 0.4 / 4.5 | **Frozen**: speed ×0.6, turn ×0.6, her reload ×1.5. Lasts 6 s; each hit adds, up to 9 s. **Brittle**: round shot ×1.25 on her ("SHATTER!") |
| Stink | 0.2 | 22 | 1.3 | 1.8 | 0.8 / 6 (lobbed) | **Poisoned**: speed cap 0 (she coasts to a stop) and no firing, 4 s. Then **queasy** 4 s: reload ×1.5, spread ×2. Her grit ×0.75 in a boarding while poisoned or queasy. Then immune 10 s ("Holding their noses!") |

Speed and turn still use the smallest active multiplier (SPEC2 §2.3). Specials can crit for ×1.75, with no extra crit
effect.

### 2.3 Combos ("the newest element wins, and stink burns")

| Hit | On a ship that is… | Result | Pop |
|---|---|---|---|
| Frost | ablaze | fire out, frost takes hold | `FIRE OUT! SSSS!` |
| Fire | frozen | ice melts, fire takes hold | `THAWED!` |
| Fire | poisoned or queasy | the cloud explodes: **+15** at once, stink ends, fire takes hold | `KA-BOOM!` |
| Round | frozen | ×1.25 | `SHATTER!` |
| Grapple | poisoned or queasy | her crew at grit ×0.75 | better odds preview |
| Grapple | ablaze | refused | "Too hot to board!" |

Each style of play has a cost:
- **Sink** (Fire; Stink then Fire for the boom): you lose the capture gold.
- **Capture** (Stink, board, the Market): needs crew and cutlasses.
- **Survive** (Frost, Helmsman, Lighthouse): safe but slow.

### 2.4 Resistances

Values multiply the effect's duration; bosses also apply their 0.5.

| Ship | Fire | Frost | Stink | Rumour-board hint |
|---|---|---|---|---|
| Ember Corsair | ×0.5 | 1 | 1 | "Ember crews are half fireproof." |
| Molten Maw | immune | ×1.5 | 1 | "Frost makes the Maw hiss!" |
| Frost Raider | 1 | ×0.5 | 1 | "Raiders laugh at the cold." |
| Phantom | ×0.5 | 1 | immune | "Ghosts can't smell!" |
| Fireship | immune | **doused** (§4) | 1 | "Freeze a fireship and she's harmless." |
| Iron Turtle | burn ignores armour | armour cracks to ×0.75 | 1 | "Fire cooks a turtle in her shell." |
| Bomb Ketch | 1 | 1 | mortar stops | "Stink a ketch and her mortar falls silent." |
| Squid Skiff | 1 | 1 | ×0.5 | "The Kraken Crew are used to fishy smells." |

Pops: an immune ship shows `IMMUNE!`, a resistant one `RESISTS!`. Bosses are never stopped by stink; they only get
queasy, for 3 s.

### 2.5 On screen and in the ears

- **Fire**: the ball glows orange with an ember trail. On a hit, cartoon flames lick her deck (the wrecked-ship flame
  fx, driven by a status flag), with black smoke and a crackle loop (the nearest burning ship only). Pop `ABLAZE!`
  in orange.
- **Frost**: a pale crystal ball with sparkles. On a hit her hull frosts pale blue in 0.3 s (a tint uniform),
  icicles hang from her rail (one lazily built mesh per type), her sails stiffen white and stop fluttering, and you
  hear a "kshhk" crackle. Pop `FROZEN!`.
- **Stink**: a wobbling green clay pot with a cork, trailing puffs. On a hit it SPLOTCHes: a green cartoon cloud of
  8–12 ink-rimmed puffs circles her masts, wavy stink lines rise, her sails hang slack, and you hear a squelchy bloop
  and a comic groan. Pop `STINK! POISONED!`.
- **Name tag**: one status glyph (flame, snowflake or cloud: a shape, not just a colour) with a draining ring; only
  the newest shows. The ship shows the rest, so there is no icon zoo. `#game-live` says "The Iron Turtle is ablaze".
- **Reduced motion**: effects are drawn but don't swirl. Nothing flashes.

### 2.6 Picking ammo

Keyboard:
- `R` cycles the ammo you have, skipping empty lockers.
- `1`–`3` pick the basic ammo; `4`–`6` pick Fire, Frost and Stink (by `e.code`).

Touch:
- The **Ammo** pill opens an **ammo strip**: 48 px pills, each with an icon, a name and a count ("Fire 3"). It opens
  above the pill in portrait.
- Empty lockers are `aria-disabled` and say why ("No Fire shot left. The Forge makes 2 per level").
- A pick, a tap elsewhere, or 4 s with no touch closes the strip.

HUD: the gun card reads "Fire 3/4", and each side's reload bar carries the glyph of what that side has loaded.

---

## 3. Better steering

**The Helmsman** (tavern, `armory.js` id `helm`). The turn rate changes from `turn × (0.35 + 0.65·v/vmax)` to
`turn × helmMul × (floor + (1 − floor)·v/vmax)`:

| Tier | Card | helmMul | floor | Price | On the model |
|---|---|---|---|---|---|
| 1 | Old Jonah at the wheel | 1.1 | 0.5 | 150 | bigger brass wheel |
| 2 | Balanced rudder | 1.2 | 0.65 | 350 | bronze rudder |
| 3 | Sweeps and a sharp eye | 1.3 | 0.8 | 650 | oars racked on the rails + **Hard over** |

- **Hard over**: double-tap a steer key or ◀ ▶ within 0.3 s for 1 s of turning at ×1.6, then a 6 s cool-down. Pop
  `HARD A-PORT!`. It is a bonus, never needed.
- The tavern's total goes from 4,600 to 5,750.

**Touch aids** (free; saved in `pirates-ahoy-settings`):
- **Tap the sea to steer** (on by default; a click works on desktop). Today a battle tap on the canvas does nothing.
  - A tap drops a small buoy (it fades after 3 s) and draws a dashed course line from your bow.
  - The ship turns toward the buoy at full rate, then holds that heading once within 10 u. Any steer input cancels it.
  - It is simulated: `state.course` is steered in `updatePlayer`.
- **Ship's wheel** (optional, Pause ▸ Steering: Buttons / Ship's wheel): the left pad becomes a 140 px wheel. Drag
  it ±90° for analogue turning (−1..1); it springs back to centre. Keyboard turning is unchanged, so the existing
  steering tests and bots stay exact.

---

## 4. New enemy ships (`shipTypes.js`)

| Key | Name | hp | len | Speed | Turn | Reload | Guns × dmg | Gold | Engage | Crew / grit | Rule |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `fireship` | Fireship | 30 | 7 | 11 | 1.1 | — | 0 | 2 | 0 | 4 / 0.8 | rams; **explodes** within 4 u of any hull: 22 damage in r 7, and those hit burn 2 hp/s for 5 s. Sunk, she explodes where she is. **Frost douses her**: speed cap 3, no blast, she can be grappled (65 gold) |
| `turtle` | Iron Turtle | 200 | 12 | 5.5 | 0.6 | 2.8 | 3 × 6 | 14 | 20 | 18 / 1.3 | **armour** ×0.5 on hull hits, except stern rakes (her stern is open) |
| `ketch` | Bomb Ketch | 70 | 9 | 8 | 0.9 | 6 | 1 × 3 | 8 | 44 | 10 / 1.0 | **mortar**: a shell 28–55 u away every 6 s (ring r 4.5, 14 damage, warning 2.2–2.8 s); keeps 40–48 u off and flees inside 30 |
| `skiff` | Squid Skiff | 28 | 6.5 | 12 | 1.8 | 2.5 | 1 × 3 | 3 | 8 | 8 / 1.0 | boards you like a raider, from 12 u; at most 2 alive |
| `inkqueen` | The Ink Queen | 360 | 17 | 6.5 | 0.6 | 2.6 | 6 × 5 | 34 | 24 | 26 / 1.6 | **boss**: bow hits ×0.5; an **ink slick** every 14 s (r 9, 8 s, ×0.6 speed); calls 2 skiffs at half hull; capture 705 gold + `inkqueen` feat |

**Models**, each within the Man-o'-War's draw calls (the Ink Queen within 1.3×):
- **Fireship**: a tarred hulk heaped with barrels, flames along the gunwale, red sails.
- **Iron Turtle**: a riveted hexagon-plated dome, oar banks, a dragon-head bow.
- **Bomb Ketch**: two masts, and a squat mortar that puffs a smoke ring when it fires.
- **Squid Skiff**: a purple hull and a tentacle figurehead.
- **The Ink Queen**: black and purple, with a squid figurehead hugging her bow and a giant kraken eye on her sails.

The fireship and ketch AI work through the existing `mechanics.steer`/`holdFire` hooks, as mechanic ids.

---

## 5. Voyage III · The Kraken's Wake (`src/act3.js`, the SPEC2 §6.1 format)

### 5.1 Levels

| | L7 The Sunken City | L8 Cape Horn | L9 The Kraken's Deep (finale) |
|---|---|---|---|
| Look | a turquoise lagoon over sunken temples, toppled statue heads, coral, a purple squall | grey-green swells, sunset cliffs, a lonely lighthouse, albatrosses, penguins | violet dusk, glowing blue water, a ring of wrecks, a whale-skeleton islet |
| Waves | `[fireship, corsair, fireship]`, `[turtle, corsair, fireship]` | `[ketch, ketch, corsair]`, `[turtle, ketch, skiff, skiff]` | `[skiff, skiff, turtle]`, `[inkqueen, ketch]`, then the Kraken |
| nextWaveAt / maxAttackers | 1 / 2 | 1 / 3 | 0 / 3 |
| lead / spread / grace | 0.7 / 0.9 / 4 | 0.72 / 0.88 / 3 | 0.75 / 0.85 / 3 |
| mechanics | spouts, fireships | rogue, mortars | wind, mortars, kraken; lightning every 7–10 s until the Kraken rises |
| Bonus | 1,300 | 1,600 | 2,500 + 1,000 |
| Rumour ammo | frost | stink | stink |

**How it opens:** the Maelstrom's Victory screen gets **Sail on to the Kraken's Wake** (`Enter` too). Card 7 reads
"Beat the Phantom Galleon". `pirates-ahoy-unlocked` clamps at 9. The title shows three voyage groups of three
compact cards. On portrait phones it scrolls, and the next card to play scrolls into view.

### 5.2 Disasters (simulated time; the Lighthouse adds to every warning)

| Disaster | Lvl | Timing / warning | Effect | Counter |
|---|---|---|---|---|
| **Waterspouts** ×2 | 7 | always visible; wander at 3.5 u/s on fixed Lissajous paths; swirl on the minimap | inside 12 u: drawn in at 2.5 u/s. Core r 5: 4 hp/s, spins you +1.5 rad/s, flings you out after 2 s at 8 u/s. Balls within 6 u of a core are bent off course | steer wide. Frozen or poisoned pirates drift in, but healthy ones steer clear |
| **Rogue waves** | 8 | every 22–30 s a 120 u crest crosses the map at 14 u/s; foghorn, edge arrow and minimap line 4 s ahead | bow-on (≤ 35°): safe, `CLIMB IT!`. Stern-on: surf, ×1.4 speed for 3 s, 4 damage. Side-on: 14 damage, pushed 10 u, guns silent 2 s. **Puts out every fire** | turn into it (the Helmsman, Hard over); catch side-on pirates with a broadside |
| **Hurricane wind** | 9 | the direction shifts every 25 s (eased over 3 s); minimap arrow, water streaks | every ship but the Kraken drifts 2.2 u/s downwind; speed cap ×1.15 running with it, ×0.85 into it | choose your approach angle |

Lightning and mortar rings keep the SPEC2 §13 caps.

### 5.3 The finale

When the Ink Queen is sunk or captured, the other pirates flee (`escape()`). The camera pulls back (a cut under
reduced motion). The glowing water bulges, and a purple-pink head rises with googly yellow eyes, cross eyebrows and a
grumbly roar. Banner: **"THE KRAKEN RISES! Drive it back to the deep!"**. The boss bar becomes **The Kraken: fury**,
600 in three segments: Hunt, Ink and Whirl.

| Phase | Behaviour | Numbers |
|---|---|---|
| **Hunt** 600→400 | Hunts you underwater: a dark shadow, a bubble trail, and a red minimap swirl inside 60 u. Inside 18 u it surfaces (a bubble ring r 7 and a rumble for 1.5 s): **two tentacles**, 6 u off each beam | 9 u/s; each tentacle 40 hp, **grabs after 3 s**, up 8 s, then 6 s of hunting |
| **Ink** 400→200 | 2 skiffs join once. The **head** surfaces 26 u abeam for 9 s and spits ink, then a tentacle pair | 10 u/s; an ink blob every 3 s (ring r 5, 1.6 s warning; 10 damage, then you are *inked*: speed ×0.6 for 3 s, black splats on your sails) |
| **Whirl** 200→0 | Circles you at r 30 (0.25 rad/s) with its own whirlpool. **Tentacle slams**; the head surfaces every 12 s for 5 s | current r 40, pull 2.0, swirl 2.4; a slam every 4 s (r 6, 1.6 s warning, 16 damage) |

- **Grabbed**: your speed and turn are 0, and you take 4 hp/s. Break free by doing 20 more damage to that tentacle,
  by **cutting** it (the raider controls: `G` ×3, hold 0.8 s, or **CUT!**), or with a stinkpot.
- **Damage to the Kraken**:
  - every hit lowers fury; the head takes ×1.5 (`BULLSEYE!`)
  - grape ×1.5 on tentacles; chain ×0.5 ("No sails to tear!")
  - range fall-off and crits apply, rakes don't
- **Ammo against the Kraken**:
  - **Fire**: the tentacle lets go, and the Kraken burns 4 hp/s for 3 s.
  - **Frost**: it hunts at ×0.6 for 3 s, and grab timers pause 2 s.
  - **Stink**: if surfaced, it dives and retreats 45 u (−20 fury, "It hates that smell!"), then ignores stink for 20 s.
- **At 0 fury**: it sinks with a sulky face and swims off. Victory: "The Kraken is driven back to the deep! You are
  the Pirate Legend of all the Seas." You get the 1,000 bounty and the `kraken` feat.
- **Checkpoint**: if you sink while the Kraken is up, the shipwreck screen's first button is **Try again from the
  Kraken**. You get a full hull, crew and lockers, the plunder you had when it rose, and the Kraken at full fury. The
  checkpoint is kept in memory only.

---

## 6. Building up Sparrow's Floating Island

### 6.1 Plots, prices and perks

**Houses** go on the 8 shack platforms you can see but not reach (`s4 s5 s6 s8 s9 s10 s11 s12`). Their patched
shacks visibly improve:

| House tier | Price | Villagers | Look |
|---|---|---|---|
| Cottage | 60 | 1 | fresh paint, window boxes |
| Townhouse | 150 | 2 | two storeys, a balcony |
| Villa | 300 | 3 | tiled roof, garden, weathervane |

**Amenities** go on the 7 stilt platforms that already have bridges from the walk (`s2 s3 s7 s13 s14 s16 s17`), plus
the floating garden. Those platforms and bridges become walkable. An empty plot shows scaffolding and a sign, "To be
built: The Bakery".

| Amenity | Site | Opens | Tier 1 / 2 / 3 price | Perk at tier 1 / 2 / 3 |
|---|---|---|---|---|
| Forge | s7, by the yard | L3 cleared | 200 / 400 / 700 | Fire shot 2 / 3 / 4 a level |
| Ice House | s17 | L5 cleared | 200 / 400 / 700 | Frost shot 2 / 3 / 4 |
| Stink Shed | s14, far west, "downwind!" | L6 cleared | 200 / 400 / 700 | Stinkpots 2 / 3 / 4 |
| Lighthouse | s13, on the sea front | L1 cleared | 150 / 300 / 600 | every hazard warning +0.3 / +0.6 / +1.0 s |
| Bakery | s3, by the tavern | L1 cleared | 120 / 280 / 500 | reinforcements +1 / +2 / +3 hands and +5 / +10 / +15 % hull patched |
| Market | s2, by Polly's | L2 cleared | 150 / 350 / 650 | capture gold ×1.1 / ×1.2 / ×1.3 |
| School | s16 | always | 80 / 200 / 400 | quiz 50:50 ×1 / ×2 / ×3 a round; at tier 3 star gold ×1.5 |
| Garden | the garden | always | 80 / 200 / 400 | tithe +2 / +4 / +6 per villager |

### 6.2 The link: villagers work the amenities

- **Each house tier brings one villager; each amenity tier needs one worker.** The panel shows "Villagers 5 · 3 at
  work". Eight Villas give 24 villagers, exactly enough to staff all eight amenities at tier 3. The choice is the
  order you build in.
- **Island tithe**: every cleared level pays 5 gold per villager, plus the Garden's bonus. It is its own line on the
  level card. At most that is 264 gold a level; a Cottage pays for itself in about ten levels.
- **Rank**, from building tiers out of 48:

  | Rank | Tiers |
  |---|---|
  | Shack Town | 0–7 |
  | Fishing Village | 8–17 |
  | Harbour Town | 18–29 |
  | Pirate Port | 30–41 |
  | **Pirate Capital** (Governor's hat) | 42–48 |

  A banner under the welcome sign names the rank.
- **Totals**: houses 4,080, amenities 8,360, the island 12,440.

### 6.3 The Builder's Hut

**Where**: Bosun Bricks (hard hat, hammer) keeps a hut on the plaza by the welcome sign, with a painted island map on
an easel. Walking up to a plot shows its prompt ("Bakery, level 2: reinforcements bring 2 more hands"). `E` opens the
panel at that plot.

**Portrait phone layout**:
- Top 45 %: the island seen from high above. Each plot has a numbered floating sign; the selected plot has a gold
  ring.
- Bottom sheet: "Chest 1,240 · Villagers 5 (3 at work) · Fishing Village".
- Two tabs, **Houses** and **Amenities**. Each card shows tier pips (●●○, plus the text "level 2 of 3"), the perk
  now, the next perk, and one button.
- Picking a card glides the camera to its plot (a cut under reduced motion).

| Button state | Text |
|---|---|
| can build | "Build the Forge — 200 gold" / "Upgrade to Townhouse — 150 gold" |
| poor | "Need 40 more gold" (`aria-disabled`) |
| no worker | "Needs 1 more villager: build or upgrade a house" (jumps to Houses) |
| locked | "Opens after you clear the Volcano" |
| maxed | "Finished!" |

**Buying**:
- A dust puff hides the scaffold for 0.6 s, with hammer and saw sounds. The building pops in with a squash and
  stretch (no bounce under reduced motion), and villagers cheer.
- The live region says "Bakery built. Reinforcements bring 1 more hand."
- The record is saved before the chest. A double-click or a held Enter buys once.

### 6.4 Villagers

New villagers row in to the pier and walk the existing paths. Up to 6 extra people show (`share: true`, culled
beyond 40 u); the rest are "at work". They greet you about their buildings ("Fresh bread for your crew, Cap'n!").

### 6.5 Step-aside rule (on top of fix #64)

- A villager who has been in the captain's way for 0.3 s steps 0.8 u aside onto walkable deck.
- If there is no room (on a bridge), they go back to the end they came from.
- They never wait because the captain is near.
- The captain squeezes past anyone after 0.5 s of pushing ("Pardon me!").

---

## 7. The Old Sea Dog's Quiz

**Place**: the lookout-tower raft (walkable, with no place yet). A white-bearded old sailor with a peg leg sits by a
chalkboard headed "QUIZ ★". His parrot, Professor, wears a tiny mortarboard. The tavern tune plays.

| # | Rank | Choices | Adds | Opens | Gold for star 1 / 2 / 3 |
|---|---|---|---|---|---|
| 1 | Cabin Hand | 3 | the sea, sea life, sums to 20 | always | 20 / 20 / 30 |
| 2 | Deckhand | 3 | the game's seas 1–3, sums to 100 | quiz 1 ★ | 30 / 30 / 40 |
| 3 | Bosun | 3 | pirate history, take-aways | quiz 2 ★ | 40 / 40 / 60 |
| 4 | Navigator | 4 | compass, tides, weather, ×2–×5 | quiz 3 ★ + L4 open | 60 / 60 / 80 |
| 5 | First Mate | 4 | seas 4–6, world geography, ×6–×12 | quiz 4 ★ + L6 open | 80 / 80 / 100 |
| 6 | Captain | 4 | everything, seas 7–9, money sums | quiz 5 ★ + L7 open | 100 / 100 / 150 |

**Rounds and rewards**:
- A round is **5 questions with no timer**: 3 right is ★, 4 is ★★, 5 is ★★★.
- With fewer than 3 right: "Good try! Have another go." Nothing is lost.
- **Gold only for new stars**: 1,120 in all for 18 stars, ×1.5 after School tier 3. Replays count toward the 9- and
  18-star trophies. That rewards learning, not grinding.

**Wrong answers are gentle**: the ✗ comes with "Not quite!", the right answer gets a ✓, and a fun fact follows. The
sound is a soft "bonk", never a buzzer. **50:50** (from the School) removes 1 wrong answer, or 2 when there are 4
choices.

**Fairness**: questions about the game's seas only ask about seas you have reached. An answered question waits for
60 others before it comes back. Answers are shuffled with a seeded rng.

**Bank** (`src/quizBank.js`, one line each; `a[0]` is the right answer):
`{ id: 'life-001', cat: 'life', lvl: 1, q: 'How many arms does an octopus have?', a: ['8','6','10'], fact: 'And three hearts!', seas: 0 }`.
Categories: `sea`, `life`, `places`, `history` and `sums`. `makeSum(lvl, rng)` makes the sums: adding to 20, then to
100, taking away, times tables, then money ("3 chests of 25 gold"). Its wrong answers are near misses (±1, ±10, swapped
digits). There are at least 25 written questions per quiz level. Samples:

| Lvl | Question | Answer (wrong ones) |
|---|---|---|
| 1 | Which side of a ship is port, looking forward? | Left (Right, The back) |
| 1 | Which is a mammal? | Dolphin (Shark, Tuna) |
| 2 | Where do prahus sail right over the coral? | Bali Islands (Coast of Europe, The Volcano) |
| 3 | What was Blackbeard's real name? | Edward Teach (Francis Drake, Henry Morgan) |
| 4 | What pulls the tides in and out? | The Moon (The wind, Whales, Ships) |
| 5 | Which seahorse parent carries the babies? | The dad (The mum, Both, Neither) |
| 5 | Pirates threw clay pots of smelly smoke. Called? | Stinkpots (Puffers, Fizzers, Ponglets) |
| 6 | Cape Horn is at the tip of… | South America (Africa, Australia, Asia) |
| 6 | Who first wrote about sunken Atlantis? | Plato (Shakespeare, Columbus, Blackbeard) |

**Panel states**:
1. Level list: stars shown as "★★☆" plus the words "2 of 3"; a locked card says why.
2. Question: "Question 2 of 5", at least 20 px; numbered answer buttons 56 px tall; **50:50 (1 left)**.
3. Feedback: ✓ / ✗, the fact, **Next ▸**.
4. Result: the stars, "+30 gold — new star!", then **Play again**, **Next quiz** or **Back to town**.

**Keys**: `1`–`4` answer, `H` is 50:50, `Enter` is next, `Esc` goes to town. A screen reader hears the question, then
the choices; results are announced. No confetti under reduced motion.

---

## 8. Modules and APIs

```js
// combat.js (pure, extended)
AMMO.fire|frost|stink (+ special, maker);  AMMO_IDS = ['round','chain','grape','fire','frost','stink'];
export const STATUS, RESIST, COMBOS;
export function applyStatus(cur, ammo, { typeKey, boss, now }) → { status, events, burst }
export function statusMuls(status, boss) → { speed, turn, reload, spread, grit, noMove, noFire, noBoard, brittle }
// shotResult: target.armour / target.status → armourMul, brittle

// island.js (new, pure)
export const HOUSES, AMENITIES, RANKS, TITHE;
export function defaultIsland(), parseIsland(raw), serializeIsland(cfg), build(cfg, id)
export function islandStats(cfg) → { villagers, workers, charges, warnBonus, waveCrew, waveHull, captureMul,
                                     lifelines, quizGoldMul, tithe, points, rank, rankName }
export function buildState(cfg, purse, unlocked, id) → { ok, cost, reason: 'locked'|'poor'|'workers'|'max', label }

// quiz.js (new, pure) + quizBank.js (data)
export const QUIZ_LEVELS;  export function makeSum(lvl, rng), drawRound(lvl, rng, { unlocked, seen }),
  grade(answers, round) → { right, stars }, reward(rec, lvl, stars, mul) → { gold, rec }, parseQuiz, serializeQuiz

// mechanics.js: ids spouts, rogue, wind, fireships, mortars, kraken. ctx + launchBomb({ kind, from, tx, tz, radius,
//   damage, warn }), setStatus, explode(x, z, r, dmg), warnBonus(), rng. Hooks + targets() → ship-like Kraken parts,
//   hit(id, info), boss() → { name, frac, segments }, grabbed(), checkpoint()/restore()
// armory.js + helm;  cosmetics.js + 5 trophies, feats kraken/inkqueen/quiz/island;  settings.js (new, pure);  act3.js (new)
```

**Rendering and screen modules**:
- `kraken.js` (new): `createKraken(scene, opts) → { prepare, sync(state), update, dispose }`, at most 40 draw calls.
  The head is at most 10. Each tentacle is one tube mesh bent on the CPU, plus its ink twin (2 calls).
- New seas `env/sunken.js`, `horn.js` and `deep.js`: they add `spouts`, `rogue` edges, `windFx` and `flash`.
- `ships.js`: 5 builders, `setShipStatus(group, flags)`, the new projectiles, and helm props.
- `sparrow.js`:
  - `setIsland(cfg)` re-bakes two groups, `houses` and `plots`, in at most 40 ms while the dust hides it.
  - `setVillagers(n)`, `plotPose(id)`.
  - Places `build` and `quiz`; the plot platforms join the walk (the fixture is regenerated).
- New panels `islandMode.js` and `quizMode.js` (DOM, `island.css`). townMode gives them the views `'build'` and
  `'quiz'`.
- Smaller changes: `tags.js` (the glyph), `pops.js` (`fire`, `frost` and `stink` styles), `people.js` (the two NPCs,
  pets `octo` and `bookworm`, hats `mortarboard` and `governor`; determinism kept).

**main.js** (rules stay in the modules):

| Code | Change |
|---|---|
| `fire`, ammo keys, the touch strip | per-side loaded ammo and charges |
| `ballHit`, `damage` | `applyStatus`, armour, combos, and Kraken parts |
| `speedMul`, `turnMul`, `mayFire`, `canGrapple` | `statusMuls` |
| `updatePlayer` | the helm formula, Hard over, the course, the wheel, the grab, wind drift |
| `aimTarget`, `inArc`, `hitsShip` | `mechanics.targets()` |
| `launchBomb` | from a source, plus `warnBonus` |
| `spawnWave`, `finishLevel` | Bakery, Market, tithe, the checkpoint; the legend migration at load |

---

## 9. Saves, sound, controls

| Key | Shape | Rules |
|---|---|---|
| `pirates-ahoy-island` (new) | `{"v":1,"b":{"house1":2,"forge":1}}` | tiers clamped; unknown ids dropped; ≤ 4 KB |
| `pirates-ahoy-quiz` (new) | `{"v":1,"stars":[3,2,0,0,0,0],"seen":["life-001"]}` | stars 0–3; `seen` holds known ids, deduped, ≤ 60 |
| `pirates-ahoy-settings` (new) | `{"v":1,"steer":"buttons","tap":1}` | unknown values → defaults |
| armory / feats | + `helm`; + `kraken`, `inkqueen`, `quiz` (0–18), `island` (0–48) | feats only go up |
| unlocked / tips | clamp 1–9 / 0–65535 | `legend` → 7; new tip bits from 256 up |

Every record is validated like `parseShipConfig`: it never throws, and a record that needed fixing is rewritten.
Purchases save the record before the chest. Two tabs sync. With storage blocked the game works for the visit. With
storage full, a building whose record can't be saved is refused, and a quiz star is shown but marked "Couldn't save".

**Sound**:
- New sounds: `fireShot crackle sizzle freeze shatter stinkPot boom fireshipBlast mortar spout foghorn waveCrash
  tentacle krakenRoar inkSplat build quizRight quizWrong hardOver`.
- New synthesised scenes: `sunken` (steel drums and harp), `horn` (concertina and stormy strings), `kraken` (deep
  brass and choir, epic but friendly), `quiz` (the tavern tune).

| Action | Keyboard | Touch |
|---|---|---|
| Special ammo | `4` `5` `6`, or `R` | Ammo ▸ strip |
| Hard over | double-tap a steer key | double-tap ◀ ▶ |
| Set course | click the sea | tap the sea |
| Cut a tentacle | `G` ×3 or hold | **CUT!** ×3 or hold |
| Quiz | `1`–`4`, `H`, `Enter` | tap |

**Places bar**: six short labels, Yard · Tailor · Tavern · Build · Quiz · Sail. That is 6 × 44 px at 320 wide. Below
340 px it shows icons, each with an `aria-label`.

---

## 10. Tests, budgets, accessibility

**Node**:
- `combat.test`: every row of §2.2–2.4.
- `island.test` (new):
  - the totals (4,080 / 8,360) and workers = villagers at full
  - the unlocks, every perk at every tier, the `buildState` reasons
  - the hostile-storage battery
- `quiz.test` (new):
  - every question: 3–4 unique choices, the answer among them, a known category, a unique id; at least 25 per level
  - `makeSum` correct for 10,000 seeds
  - no repeats within a round, and `unlocked` respected
  - gold only for new stars
  - the battery
- `mechanics.test`: spouts, rogue-wave angles, wind, fireship blasts, mortar ranges, every Kraken phase, grab and
  cut, the stink retreat, the checkpoint.
- `armory.test`: `helm` and the new total.
- `cosmetics.test`: the trophies.

**Browser**:
- `battle.cjs` *ammo2*: charges, falling back to basic, `Space` costs two, the strip at 10 sizes, combo pops,
  `IMMUNE!`, glyphs, live text.
- `levels.cjs` *voyage3*: 9 cards, the legend migration, the mechanics, the Kraken phases via `G.kraken`, the
  checkpoint, bot v3 with and without specials, and draw calls.
- `town.cjs` *build*, *quiz*: keyboard only, touch, 7 layouts, contrast, villagers stepping aside, walking every plot.
- `controls.cjs`: tap-to-steer, the wheel, Hard over.

**Existing checks that change, and only these**: the card count 6→9; `unlocked` clamps to 9; after L6 the dock exits
and `#act2-btn`; the armory total; `FEAT_IDS` and prize types; the tips clamp; the walk fixture, and the places count
4→6.

**Test API**: `G.combat.setCharges`, `G.status`, `G.island`, `G.quiz`, `G.kraken`, `G.steer`, `G.settings`.

| Draw calls (`?quality=low`, stock ship) | Budget | Plan |
|---|---|---|
| Voyage III env alone / level start | ≤ 220 / ≤ 310 | merged statics; streaks one InstancedMesh ≤ 120 |
| L9 busiest (Kraken + 2 skiffs) | ≤ 450 | Kraken ≤ 40 |
| Status visuals | +≤ 6 | icicles only on frozen ships; existing flames; particle clouds |
| Town walk view | ≤ 450 (today 371) | 2 baked groups +≤ 10; villagers +≤ 30; NPCs +10 |

If a budget is exceeded, drop in this order: villagers 6→3, icicles (keep the tint), spout spray, wind streaks.

**Accessibility**:
- Every new control is a real `<button>`, at least 44 px. Out-of-reach buttons are `aria-disabled` with a reason.
- Small text is at least 4.5:1. Statuses show by shape and text, not colour alone.
- New live regions: `#island-live`, `#quiz-live`.
- No quiz timer. Mashing is never needed (tentacles can be cut by holding).
- Under reduced motion: no shake, the Kraken's rise is a cut, nothing bounces.
- The fireship-blast overlay is at most 0.25 opacity, and nothing strobes.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Specials flatten Acts I–II | limited charges; they open at L3/L5/L6; fire blocks captures. Re-run the Act II bot with Forge 3 + Ice House 3: the Maelstrom must still out-hurt Doubloon Bay |
| The Kraken isn't a ship | its parts are ship-like targets (`x z h len hp`); `damage()` sends them to `mechanics.hit` |
| main.js (6,077 lines) is a bottleneck | rules in pure modules; Stage 0 seams (statusMuls, targets, launchBomb from a source, 9 levels with stub seas) |
| More walkers, more deadlocks | keep fix #64 working; the step-aside rule; a regression check on every bridge |
| Town draw calls | baked groups, a villager cap, culling |
| 320 px phones | compact cards and a scrolling title; icon places below 340 px; the existing layout probes |
| Wrong quiz facts | each fact checked against two sources; British spelling; `seas` gating |

## 12. Cut list (from the top; each cut leaves a whole game)

1. The ship's wheel setting.
2. Hard over.
3. Villager greeting lines.
4. The ink slick.
5. Wind on L9.
6. Quiz levels 5–6.
7. School 50:50.
8. The Whirl phase (it becomes a faster Ink).
9. The Garden and tithe.
10. Squid Skiffs (Frost Raiders stand in).
11. House tiers 2–3.
12. The Kraken checkpoint.

**Never cut**:
- Fire, Frost and Stink with their visuals, limits and combos.
- L7–L9 with the fireship, the Iron Turtle and the bomb ketch.
- The Ink Queen, then the Kraken hunt.
- Waterspouts and rogue waves.
- Houses, visible villagers and the ammo buildings.
- At least 3 quiz levels.
- Helmsman tiers 1–2 and tap-to-steer.
- Saves.

## 13. Build stages

| Stage | Who | Work | Exit |
|---|---|---|---|
| 0 | 1 agent | main.js seams, stub `act3.js`, DOM ids, loaders, test API stubs | green with no test edits |
| 1 | in parallel | combat specials, island.js, quiz and its bank, mechanics, 3 seas, ships, kraken.js, sparrow (plots, villagers, walk), people and cosmetics, audio, tags and pops | — |
| 2 | — | battle integration and its tests | — |
| 3 | — | build and quiz panels, places, Voyage III goes live, bot v3 tuning, the §10 test changes | — |
| 4 | — | review, draw-call and accessibility audits, README | — |

## 14. Questions for the player (defaults are built)

1. Drive the Kraken off (default), or defeat it outright?
2. Special ammo refills free from your buildings (default), or you buy each shot?
3. No quiz timer (default), or an optional hourglass for bonus gold?
