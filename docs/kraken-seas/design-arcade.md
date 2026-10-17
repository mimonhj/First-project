# Pirates Ahoy! — "The Kraken Seas" update: arcade design

Rule of thumb: a child on a phone understands each new thing in three seconds from one picture, one word and one
sound. Few rules, generous rewards, nothing that punishes. Each number lives in one table in one module (as SPEC2).

## 0. What ships

| The player asked for | What they get |
|---|---|
| more levels | **Voyage III · The Kraken Seas**: 7 The Turtle Atolls, 8 The Cape of Storms, 9 The Kraken's Deep |
| special ammo | **Frost shot** (slows), **Fire shot** (burns 6 s), **Stink shot** (can't move or shoot 3 s); recipe bought once at the tavern, limited **loads** refilled every level; bosses shrug them off twice as fast |
| better steering | shipyard upgrade **Big rudder & wheel**; **thumb-drag steering** on the phone pad |
| new enemy ships | **Shark Raider** (rams), **Bomb Ketch** (mortar), **Iron Turtle** (iron sides), **Inkfin Brig**, boss **The Inkheart** |
| more disasters | **Waterspouts** (L7), **Rogue waves** (L8), **Sea geysers** (L9) |
| the Kraken | beat the Inkheart and **the Kraken rises and hunts you**: a shadow that follows, slamming and grabbing tentacles, a big-eyed head; drive it off to win |
| quiz ashore | **Professor Barnacle's Quiz Tower**: 9 quiz islands, 5 questions each, no timer, no lives |
| build the island | **Builder Bess**: 4 homes and 6 amenities, 3 tiers each; homes bring **villagers** and a **gift** after each cleared level; each amenity has one perk |

Two deliberate changes to the defaults: **the Kraken is driven off, not slain** (family tone, same win), and special
ammo is **bought once and refilled every level**, not bought per shot (no hoarding, no shopping chores).

---------------------------------------------------------------------------------------------------

## 1. Special ammo

### 1.1 The three shots (combat.js `AMMO`, `STATUS`)

| | Frost shot | Fire shot | Stink shot |
|---|---|---|---|
| Key / position | `4` | `5` | `6` |
| Hull × (per ball) | 0.6 | 0.7 | 0.2 |
| Range | 28 | 30 | 22 |
| Reload × | 1.1 | 1.1 | 1.2 |
| Spread × / hit pad | 1.1 / 0.4 | 1.0 / 0.4 | 1.5 / 0.8 (top 5) |
| Effect on a hit ship | **FROZEN!** speed ×0.5, turning ×0.6 | **ON FIRE!** 3 hp a second | **STINKY!** stops within 0.5 s, no turning, no firing (a raider's ropes are cut, a ketch's mortar waits) |
| Duration | 5 s; each further hit +2 s, max 8 s | 6 s; a further hit restarts it | 3 s, then **immune 10 s** ("Clothes-pegs!") |
| Bosses (Maw, Phantom, Inkheart, Kraken) | 2.5 s, max 4 s | 3 s | 1.5 s, then immune 20 s |

Crits with specials do ×1.75 with no extra effect.

- Effects don't add up with chain or mast (the smallest multiplier wins, as today); fire and the powder-keg crit
  share one burn (more damage left wins).
- Mid-game ship (4 guns × 12) on the beam at 20 u: round 48; frost 28.8 and she crawls; fire 33.6 + 18 burn; stink
  9.6 and she sits still for 3 s, time to sail round and rake her stern (96). Every special is a trade.

### 1.2 Earning and limits (armory.js `POWDER`, combat.js `LOADS`)

| Rule | Number |
|---|---|
| Recipes, bought once at the tavern's new **Powder** tab, on sale after you clear the Bali Islands (grape first) | Frost 300, Fire 300, Stink 500 gold |
| A **load** = one broadside of one side (any number of guns) | |
| Loads at every level start, for each recipe owned | 2 (+1/+2/+3 with the Windmill, §6) |
| **Powder crates** floating in each level (sail within 3 u) | 2 per level, +1 load of your lowest special (20 gold if you own none) |
| Capturing a ship (loads never carry over) | +1 load of your lowest special |

`Space` fires both sides: each side that fires spends one load; a side with none fires round shot. When the last
load goes: hint "Out of Frost shot! Round shot loaded." Enemies never fire special shot at you.

### 1.3 What you see and hear

- **Frost.** Pale-blue balls trailing flakes; a crisp *ching* and ice shards. A jagged white-blue **ice band** along
  her waterline, icicles under her rails, flakes drifting off. Pop "FROZEN!".
- **Fire.** Balls wrapped in flame; *whoomph*. Cartoon flames on her deck (the wrecked-ship flame fx), dark smoke, a
  soft crackle while she burns. Pop "ON FIRE!".
- **Stink.** A clay **stinkpot** wobbling through the air on a green fume trail; a squelchy *plop* and a comic "blech".
  A puffy **green cloud** sits on her deck with wavy stink lines and two little flies; she stops dead. Pop "STINKY!",
  then "Clothes-pegs!" when her immunity starts.
- **One status icon per name tag** (stink, then frost, then fire) with a ring for time left. The effect is drawn on the
  ship itself, so the icon is a reminder (SPEC2's "status-icon zoo" stays out).
- First load of each: banner "New ammo: Frost shot! Press 4" (touch: "Tap Ammo").

### 1.4 Choosing ammo

- Keyboard: `1`–`6` pick (by key position), `R` cycles through ammo **with loads left**. A locked one says why:
  "Buy Frost shot at the Salty Sparrow".
- Touch: with three ammo or fewer the **Ammo** pill cycles, as today. Once you own a special, a tap opens the
  **ammo tray**: six 52 px round buttons above the act pad (two rows of three below 360 px), each with icon, name and
  loads ("Frost ×2"); empty ones greyed "×0" with a crossed icon. Picking, 3 s or any fire tap closes it; the game
  keeps running.
- The gun panel's Ammo cell shows icon, name and "×2"; screen readers hear "Frost shot loaded, 2 loads left."

---------------------------------------------------------------------------------------------------

## 2. Better steering

### 2.1 Shipyard: Big rudder & wheel (upgrades.js, 7th row)

| Tier | 0 (stock) | 1 | 2 | 3 |
|---|---|---|---|---|
| Turn rate × | 1.0 | 1.15 | 1.3 | 1.45 |
| Turning at a standstill (share of full rate) | 35 % | 50 % | 65 % | 80 % |
| Price | — | 120 | 300 | 550 |
| On the model | — | bigger rudder | gold trim, bigger wheel | brass wheel and compass |

`rate = turn × rudder × (low + (1 − low) × min(1, speed / maxSpeed)) × turnMul` (enemies keep `low = 0.35`;
`playerType` adds `turnLow`). The whole shipyard now costs 6,240 (was 5,270).

### 2.2 Phone: thumb-drag steering

The steering pad keeps ◀ and ▶ (tap or hold = full turn, as today; existing touch tests hold). New: **slide** a
thumb on the pad and the turn follows it: `steer = clamp(start + dx / 56 px, −1, 1)` (`start` ±1 if you first
touched an arrow, else 0; dead zone 6 px). A small **rudder needle** above the pad shows the turn (`aria-hidden`; the
arrows stay the accessible equivalent); letting go straightens. The simulation reads `input.steer` (−1..1); keys and
buttons set ±1, so bots and keyboard steering are unchanged. Tip: "Slide your thumb on the arrows for gentle turns."
(Tap-the-sea-to-steer was considered and left for later: it competes with the fire buttons and needs pathing.)

---------------------------------------------------------------------------------------------------

## 3. New enemy ships (shipTypes.js)

| Type | Name | hp | len | max speed | turn | guns × dmg | reload | gold (sunk / captured) | crew / grit | engage | What it does |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `shark` | Shark Raider | 40 | 8 | 13 | 1.7 | 1 × 4 | 3.0 | 40 / 105 | 8 / 1.0 | 18 | **Rams.** With you ahead of her bow within 25 u: red chevrons ▶▶ on her tag, "RAM!", a 1.2 s wind-up, then a 2 s surge at 16. Contact: you take 10, she takes 8, pushed apart, "CRUNCH!". Cooldown 6 s. Turn away; stink stops her, frost blunts her. |
| `bombketch` | Bomb Ketch | 70 | 9 | 6.5 | 0.8 | 1 × 3 | 3.5 | 70 / 165 | 10 / 0.9 | 42 | **Mortar.** Keeps 35–45 u off; every 6–8 s a shell (fuse sparks, deep *thoomp*) arcs to where you will be: a red ring for its 2.2 s flight, r 4.5, 12 damage to any ship in it. |
| `ironclad` | Iron Turtle | 150 | 11 | 6 | 0.7 | 3 × 6 | 2.8 | 120 / 265 | 16 / 1.3 | 20 | **Iron sides.** Beam hits ×0.5 with a "CLANG!" pop and sparks; rakes do full damage (×2 at her stern). Specials work normally. |
| `inkfin` | Inkfin Brig | 110 | 10.5 | 9.5 | 1.0 | 3 × 6 | 2.4 | 90 / 205 | 16 / 1.4 | 22 | The Kraken Crew's warship: tough, fast, no gimmick. |
| `inkheart` | The Inkheart (boss) | 360 | 17 | 7 | 0.65 | 6 × 6 | 2.4 | 350 / 725 | 26 / 1.6 | 24 | **Kraken's call:** every 20 s she blows a horn and one tentacle rises near you (2 s warning ring, 8 damage, then sinks). Boardable. |

Looks (each ≤ a Man-o'-War's draw calls, the Inkheart ≤ 1.3×): **shark** blue-grey with a painted toothy grin, a
fin-shaped sail and an iron ram; **ketch** a stubby hull with a fat black mortar; **turtle** a riveted green-grey
dome over the deck like a shell, a turtle-head figurehead; **inkfin** and **Inkheart** purple-black, a kraken carved
round the figurehead, a giant painted eye on the sails (the Inkheart: three masts, tattered black sails). Kraken Crew
sailors: purple bandanas, dark teal vests.

---------------------------------------------------------------------------------------------------

## 4. Voyage III · The Kraken Seas (src/act3.js)

Beating the Maelstrom still shows Victory, now with **Sail on to the Kraken Seas** (`Enter`); until then cards 7–9
read "Beat the Phantom Galleon". The title shows nine cards in three groups. Voyage III expects a late-game ship;
each level is harder than the last (Act III bot, §11).

| | 7 · Daring ★7 | 8 · Fearsome ★8 | 9 · Mythic ★9 (finale) |
|---|---|---|---|
| Where | **The Turtle Atolls** (`env/atolls.js`) | **The Cape of Storms** (`env/cape.js`) | **The Kraken's Deep** (`env/deep.js`) |
| Look | South Seas noon: white-sand atolls round turquoise lagoons, palms, an island shaped like a giant turtle, sea turtles paddling, a wreck on a reef | stormy orange-violet sunset: green-and-ochre cliffs, a red-and-white lighthouse, crashing surf, penguins on boulders, whales spouting; swell 0.9 | purple-teal twilight: glowing jellyfish, masts of sunken ships, a whale-skeleton arch, the Kraken Crew's fortress with tentacle-shaped towers |
| Waves | `[shark, shark, corsair]`, `[bombketch, shark, privateer]` | `[ironclad, bombketch, shark]`, `[inkfin, inkfin, ironclad]` | `[inkfin, ironclad, shark]`, `[inkheart, inkfin]`, then the Kraken |
| Knobs (maxAttackers, lead, spreadMul, grace) | 2, 0.65, 0.95, 4 | 3, 0.7, 0.9, 3 | 3, 0.7, 0.9, 3 |
| Hazard | waterspouts (`spouts`) | rogue waves (`rogue`) | sea geysers (bombs `geyser`) until the Kraken rises |
| Bonus | 1,300 | 1,600 | 2,500 |
| Intro line | "Waterspouts! Keep clear of the twisters. Sharks ram: turn away when they charge!" | "Rogue waves! Turn your bow into them. Iron Turtles: hit their bow or stern!" | "The Kraken Crew guards the Deep. Beat their flagship… if you dare." |
| Music (synth) | marimba-and-ukulele calypso | brass storm shanty | low drone and bubbles; a timpani-and-organ Kraken tune |

All three: `enemyRake 1`, 2 powder crates, ≥ 6 `enemySpawns`, `worldRadius` 140–150; the rumour board recommends
frost, stink and fire.

### 4.1 Waterspouts (mechanics.js `SPOUTS`)

| Rule | Number |
|---|---|
| Active at once | 2 in wave 1, 3 in wave 2 |
| Forming (harmless warning) | 3 s (+ Lighthouse): a dark swirl ring (r 6) and a cloud funnel lowering |
| Active, then collapse | 22 s, then 2 s; the next forms 6–9 s later, ≥ 30 u from you |
| Drift | 2.5 u/s, wandering ±0.3 rad/s, turning back from land and the edge |
| Core (r 6) | spins the ship (+2 rad/s), 4 hp a second, flings it outward at 6 u/s; "WHOOSH!" |
| Pull zone (r 14) | 2 u/s toward the core |

Enemies are caught too (they steer clear, but chases drag them in). The funnel is a tall grey-white twisting cone
with a spray skirt (no outline); a whistling wind grows louder as you near one.

### 4.2 Rogue waves (mechanics.js `ROGUE`)

| Rule | Number |
|---|---|
| Every | 14–18 s, one wave at a time |
| Warning | 4 s (+ Lighthouse): a bell, an arrow at the screen edge, a white line on the minimap; the first time "ROGUE WAVE! Turn your bow into it!" |
| The wave | a white-crested ridge 120 u wide, rolling at 16 u/s, starting 70 u from you |
| Bow into it (within 50° of facing it) | "SURFED!", +2 speed for 2 s, no damage |
| Anything else | 10 damage, shoved 6 u along the wave, 1 s wobble (turning ×0.5); "SPLASH!" |

Enemies are hit the same way (bosses turn into it): a good wave softens a whole fleet. No camera bob under reduced
motion.

### 4.3 Sea geysers (L9 `bombs`)

`{ kind: 'geyser', every: [6, 9], spread: 8, radius: 4.5, damage: 10, warn: [1.8, 2.2] }`: a ring of bubbles, then a
white column with a *fwoosh*; a ship inside is tossed (it bobs up 1 m and spins 0.5 rad). They stop when the Kraken
rises.

---------------------------------------------------------------------------------------------------

## 5. The Inkheart and the Kraken (src/kraken.js, src/krakenView.js)

### 5.1 Story beats

1. Wave 2: the Inkheart sails out of the fortress; her horn calls single tentacles (§3).
2. **She is beaten** (sunk or captured): the rest of the Kraken Crew give up and sail off under your flag (captures).
3. **4 s of dread**: a heartbeat, the water darkens, bubbles, a rumble; "THE KRAKEN RISES!"; the hull is patched as at
   reinforcements.
4. The fight. 5. "THE KRAKEN IS DRIVEN OFF!": it sinks in a swirling splash, the sky turns to dawn gold in 3 s, and
   **a baby kraken pops up and climbs aboard** ("It seems to like you!"). Victory: "The Kraken is driven back to the
   deep, and the Seven Seas are safe! You are the Kraken Tamer!"

### 5.2 The beast

| Part | Look | Hit by balls | Damage to the Kraken bar |
|---|---|---|---|
| Shadow | a dark purple blob (r 9) under the water, two glowing yellow eyes, bubbles | no | — |
| Head (when up) | a huge purple mantle with pink spots, big yellow cartoon eyes, angry brows | sphere r 6 | ×1; the glowing **eye** (r 2.5) ×1.5 "BULLSEYE!" |
| Tentacles (≤ 4) | thick purple tentacles with pink suckers | capsule r 1.4, 9 tall | ×1; each has **30 hp**, at 0 it recoils ("OUCH!") and sinks |

One health bar: **"THE KRAKEN" 600 hp** with notches at 66 % and 33 %.

### 5.3 Phases (kraken.js `KRAKEN`)

| | 1 · The Hunt (600 → 400) | 2 · The Fury (400 → 200) | 3 · The Last Stand (200 → 0) |
|---|---|---|---|
| Shadow chases you at | 8 u/s (you outrun it at full sail) | 9.5 u/s | stops; the head stays up where it is |
| Tentacle attack when the shadow is within 14 u | 2 tentacles, every 8 s | 3, every 7 s | 4, every 6 s, around you anywhere in 40 u |
| Warning | 1.8 s: a foam ring (r 4) + bubbles + rising tone | 1.6 s | 1.5 s |
| Slam | 12 damage inside the ring; "SLAM!"; then the tentacle sways 6 s (shoot it!) | same | same |
| Grab | — | the first tentacle of each attack grabs instead if you are in its ring | same |
| Head | surfaces 20 u off your beam every 3rd attack, for 7 s | every 2nd attack, 7 s | always up, eye glows 4 s in every 8 |
| Ink | — | every 12 s an ink patch (r 7, 6 s) where you are heading: speed ×0.6 inside, "INKY!" | — |
| Pull | — | — | 2 u/s toward the head within 50 u |

**Grab:** a tentacle curls round your hull: speed 0, 2 hp a second, up to 4 s. "CUT IT LOOSE!": `G` three times or
held 0.8 s (touch **CUT!**), or shoot that tentacle.

**Special ammo on the Kraken:** frost halves its chase speed and slows its warnings by 0.5 s for 2.5 s; fire burns
the part hit for 3 s; stink makes it **sneeze**: every tentacle snaps under, no attack for 2 s, then immune 20 s.
Grape ×0.5, chain ×0.4.

**Kindness:** every attack is telegraphed by ring, sound and word. Sunk during the Kraken fight? **Try again**
starts at the Kraken's rise (full hull, loads refilled, the plunder so far kept). Expected fight: 2–3 minutes.

**Screenshot, phase 2:** purple twilight; the Sea Biscuit heels to port at full sail. Behind her a dark blob with
two yellow eyes glides under the water. Three foam rings bubble on the sea around her with a rising whine; one is
red-rimmed (the grab). To starboard the Kraken's head bulges from the sea, its eye glowing gold, "BULLSEYE!"
fading. The boss bar reads THE KRAKEN, just past its first notch; the Ammo cell reads "Fire ×1".

---------------------------------------------------------------------------------------------------

## 6. Ashore: Build the island (src/island.js)

### 6.1 Plots and what they become

The island's old stilt shacks become plots (today's shack is tier 0, so a fresh save looks exactly as today, plus a
small "Build me!" board on each plot).

| Plot (platform) | Kind | Tier 1 / 2 / 3 | Price per tier | Perk at tier 1 / 2 / 3 |
|---|---|---|---|---|
| Tavern Row (s16) | home | Cottage / Townhouse / Manor | 100 / 250 / 500 | 2 / 4 / 6 villagers |
| Lagoon End (s3) | home | same | same | same |
| Tailor's Lane (s2) | home | same | same | same |
| Yard Corner (s7) | home | same | same | same |
| **Biscuit Bakery** (s8) | amenity | bakery / big oven / bakery with café | 200 / 450 / 800 | reinforcements patch 45 / 55 / 65 % of the hull (was 35 %) |
| **Powder Windmill** (s6) | amenity | windmill / two sails / grand mill | 250 / 500 / 900 | +1 / +2 / +3 loads of each special shot |
| **Lighthouse** (s18) | amenity | beacon / tower / great light | 200 / 450 / 800 | lightning, geysers, rogue waves and forming spouts warn +0.3 / +0.6 / +0.9 s |
| **Market Hall** (s15) | amenity | stalls / hall / grand bazaar | 250 / 500 / 900 | +5 / +10 / +15 % gold banked per cleared level |
| **Sea School** (s13) | amenity | schoolroom / bell tower / academy | 150 / 350 / 600 | 1 / 2 / 3 **lifebuoy hints** per quiz round |
| **Flower Park** (the garden) | amenity | flower beds / fountain / bandstand | 150 / 350 / 600 | villagers' gift +25 / +50 / +100 % |

All of it costs 11,800 gold, the long goal after the ship; the first cottage costs 100, so the first visit already
changes the island. **Villagers' gift:** each cleared level banks `5 × villagers × park bonus` gold, shown on the
level-cleared card ("Villagers' gift +60"; at most 240).

**Town rank** (tiers built): Hamlet 0, Village 5, Town 12, Harbour Town 20, **Pirate Capital** 30 (wins the
Governor's coat trophy); shown in the panel and on a plaque under the welcome sign.

### 6.2 Builder Bess and the build panel

A new place, **builder**, on the plaza by the welcome sign: Builder Bess (hammer, bandana) beside a painted island
map on an easel. Places bar: Shipyard, Tailor, Tavern, **Quiz**, **Build**, Set sail (icon-only below 480 px, 46 px
each); the Harbour menu lists them too.

`#build-screen`, the tavern's parchment panel: "Builder Bess · Build the island", the chest, "Villagers 12 · Town";
tabs **Homes | Amenities**; each row has icon, name, tier pips ●●○ ("Tier 2 of 3"), what it gives now and next, and a
button: "Build Cottage — 100 gold" / "Upgrade to Townhouse — 250 gold", or `aria-disabled` "Need 30 more gold", or
"Fully built".

Focusing or tapping a row **flies the camera to that plot**, framed beside the panel (`frameBeside`; a cut under
reduced motion). Building: a scaffold pops up in a dust puff, three hammer taps, the building bounces in (0.6 → 1.08
→ 1 over 0.5 s; a fade under reduced motion), confetti, cheers, "Ta-da!". A new home's villagers step out waving:
"Thank you, Captain!". Announced: "Cottage built at Tavern Row. 2 villagers moved in." A double-click builds once
(400 ms guard); the island record is saved before the chest.

### 6.3 Villagers

Up to **8** are drawn (kid, woman, man or old person in their house's colours, `share: true`); the rest are "at
home" (lit windows). They walk loops on the pier, plaza, garden and tavern raft and greet you ("Lovely house,
Cap'n!", "Fresh biscuits today!" with a bakery). They are **soft obstacles like the townsfolk** (in `env.folk()`):
they wait for the captain, and if he walks into one for 0.25 s he squeezes past (the walking-blocked fix applies to
everyone in `folk()`).

Plot art is one extra baked group (about 6 draw calls), rebuilt on each purchase; the shacks it replaces leave the
main bake with the `rand()` draws kept in order. The park's props sit inside a footprint that is a walk blocker from
tier 0 (a low flower bed), so **the walk data never changes with tiers**.

---------------------------------------------------------------------------------------------------

## 7. Ashore: Professor Barnacle's Quiz Tower (src/quiz.js, src/quizBank.js)

### 7.1 The place

A new place, **quiz**, on the lookout tower's raft: Professor Barnacle (old man, mortarboard, a red parrot on his
shoulder, a pointer) at a big chalkboard, framed beside the panel.

### 7.2 Quiz islands

| Quiz | Name | Answers | Questions from | First pass (1 ★) | Each new ★ after |
|---|---|---|---|---|---|
| 1 | Shallow Shoals | 3 | band 1 | 60 | 15 |
| 2 | Seagull Sands | 3 | band 1 | 80 | 30 |
| 3 | Turtle Cove | 3 | band 1 | 100 | 45 |
| 4 | Coral Corner | 3 | band 2 | 120 | 60 |
| 5 | Puffin Point | 3 | band 2 | 140 | 75 |
| 6 | Whale Way | 3 | band 2 | 160 | 90 |
| 7 | Storm Cape | 4 | band 3 | 180 | 105 |
| 8 | Kraken Quay | 4 | band 3 | 200 | 120 |
| 9 | Professor's Peak | 4 | band 3 | 220 | 135 |

- A round is **5 questions**, one per category: **sea** (ships, tides, oceans, sailing words), **life** (sea life),
  **places** (the game's seas: Europe, Bali, volcanoes, the Caribbean, the Arctic, Norway, the South Seas, the
  Cape), **pirates** (history), **sums** (generated).
- 3 right = 1 ★ (pass), 4 = 2 ★, 5 = 3 ★. Quiz *n*+1 opens when quiz *n* has a star. Gold is paid only for stars not
  earned before (all 27 stars: 2,610 gold). Replays reshuffle.
- **Nothing bad happens**: no timer, no lives, all 5 questions every time. A wrong answer is marked "Not quite!" in
  soft grey, the right one gets a ✓, the fun fact shows. Under 3: "So close — 2 right! Have another go?"
- **Lifebuoy hint** (Sea School): removes one wrong answer.
- Trophies: **Professor's mortarboard** (hat, pass all 9) and **Rainbow macaw** (pet, all 27 stars).

### 7.3 Screens (`#quiz-screen`)

1. **Map**: nine islands on a dotted path (3 × 3 on phones), each with name and "★★☆ 2 of 3 stars"; locked ones
   `aria-disabled`, "Pass Turtle Cove first".
2. **Question**: "Question 2 of 5", progress marks (✓ right, • wrong, ○ to come), the question at 22 px, 3–4
   full-width answers ≥ 56 px tall labelled A–D, "Lifebuoy (2 left)", **Leave quiz** ("Your stars are safe.").
3. **Answer**: the parrot squawks "Right you are!" (coin chime) or "Arr, nearly!" (a soft boop, never a buzzer), the
   fact, **Next ▶** focused.
4. **Results**: stars pop in one by one, "+80 gold" flies to the chest; **Next quiz**, **Play again**, **Map**.

All of it is announced in `#quiz-live` (keys in §8).

### 7.4 The question bank (easy to extend)

`src/quizBank.js` is one array of plain objects; adding a question is adding a line:

```js
{ id: 'life-octopus-hearts', cat: 'life', band: 2, q: 'How many hearts does an octopus have?',
  right: 'Three', wrong: ['One', 'Two', 'Eight'], fact: 'Three hearts, and blue blood too!' },
```

`validateBank` (and a Node test) checks: unique ids; known `cat` and `band`; band 3 has 3 wrong answers, others ≥ 2;
no duplicate or empty answers; `q` ≤ 90 characters, answers ≤ 28, `fact` ≤ 120 (they fit a 320 px phone); ≥ **10
per category and band** (120 written at launch). A human checks every fact before it ships.

Sums come from the round's seed: band 1 within 20 ("You have 7 coins and find 5 more. How many now?"); band 2
within 100 and ×2/×5/×10; band 3 times tables to 10 × 10 and exact division ("48 coins shared by 6 pirates?").
Wrong options are near misses (±1, ±2, ±10), never negative.

Samples (checked):

| Band | Question | Right | Wrong |
|---|---|---|---|
| 1 | Which is the biggest ocean? | The Pacific | The Atlantic, The Indian |
| 1 | Facing the bow, the left side of a ship is called… | Port | Starboard, Stern |
| 2 | Bali is an island in which country? | Indonesia | Japan, Brazil |
| 2 | What was Blackbeard's ship called? | Queen Anne's Revenge | The Black Pearl, The Sea Biscuit |
| 3 | The Cape of Good Hope, once the "Cape of Storms", is in… | Africa | South America, Australia, Asia |
| 3 | Clay pots of smelly smoke thrown onto enemy decks were… | Stinkpots | Pongjars, Fumeballs, Smellbombs |
| 3 | The largest animal known ever to have lived is the… | Blue whale | Great white shark, Giant squid, T. rex |

---------------------------------------------------------------------------------------------------

## 8. Controls (additions only)

| Action | Keyboard | Touch |
|---|---|---|
| Pick Frost / Fire / Stink | `4` `5` `6` (`R` cycles) | Ammo → tray |
| Gentle turns | — | slide a thumb on the steering pad |
| Break a Kraken grab | `G` ×3 or hold 0.8 s, or shoot the tentacle | **CUT!** ×3 or hold |
| Quiz: answer / next / hint / leave | `1`–`4` or `A`–`D` / `Enter` / `H` / `Esc` | tap |
| Build; go to the quiz or the builder | `Enter` on Build; places bar, Harbour menu, `E` at the door | tap; places bar, **Go in** |

---------------------------------------------------------------------------------------------------

## 9. Saves (localStorage, each record validated like `parseShipConfig`)

| Key | Change | Validation |
|---|---|---|
| `pirates-ahoy-unlocked` | 1–9 | `loadInt(…, 1, LEVELS.length, 1)` |
| `pirates-ahoy-ship` | `up.rudder` 0–3 | a missing field is 0, so old saves stay valid |
| `pirates-ahoy-armory` | adds `"shot":{"frost":0,"fire":0,"stink":0}` (0/1) | `parseArmoryConfig` |
| `pirates-ahoy-island` (new) | `{"v":1,"t":{"homeA":0,…,"park":0}}`, tiers 0–3 | `parseIsland`: ≤ 4 KB, the `parseShipConfig` rules |
| `pirates-ahoy-quiz` (new) | `{"v":1,"stars":[3,2,0,0,0,0,0,0,0]}` | `parseQuiz`: 9 plain integers 0–3, else 0 |
| `pirates-ahoy-feats` | adds `kraken` 0–1, `quizStars` 0–27, `quizPassed` 0–9, `island` 0–30 | `parseFeats`; prize types gain the new ships |
| `pirates-ahoy-tips` | bits 256–32768 (frost, fire, stink, ram, spout, wave, grab, tray) | `loadInt(…, 0, 65535, 0)` |

Purchases (powder, rudder, buildings): record first, chest second, as today. Quiz rewards: record first, then
chest (if storage refuses, the gold lasts for the visit). Two tabs share island and quiz records through the
`storage` listener; stars and tiers only go up. The Kraken checkpoint is session memory only. Storage blocked:
everything works for the visit from the defaults.

---------------------------------------------------------------------------------------------------

## 10. Modules and APIs

**New, pure (import nothing; Node-tested):**

```js
// src/kraken.js — simulated time only
export const KRAKEN;
export function createKraken(ctx) → {
  rise(x, z), step(dt), hit({ x, y, z, dmg, ammo }) → null | { part: 'head'|'eye'|'tentacle', index, dmg, word },
  cut() → bool, cutHold(down), playerSpeedMul(), get held, drift(ship) → { vx, vz } | null,
  get hp, get phase, get done, get visuals /* shadow, head, tentacles[], ink[] */, get state, dispose()
}   // ctx: { player(), damage(), rng(), time(), land(x, z, r), pop, showBanner, announce, sfx }

// src/island.js
export const PLOTS, RANKS, GIFT;
export function defaultIsland(), parseIsland(raw), serializeIsland(s)
export function nextCost(s, id), build(s, purse, id) → { ok, island, cost, reason: 'unknown'|'maxed'|'poor' }
export function perks(s) → { wavePatch, extraLoads, warnBonus, marketMul, hints, giftMul }
export function villagers(s), rank(s) → { name, tiers, next }, gift(s) → number

// src/quiz.js (takes the bank as an argument) and src/quizBank.js (export const QUESTIONS)
export const QUIZ_LEVELS, CATS;
export function validateBank(bank) → { ok, errors }
export function makeRound(bank, level, seed, { recent = [] }) → [{ id, cat, q, options, right, fact }] × 5
export function sumQuestion(band, rng), stars(correct) → 0..3, hint(question, rng) → index
export function reward(record, level, stars) → { gold, record }
export function defaultQuiz(), parseQuiz(raw), serializeQuiz(rec), openQuizLevels(rec) → n
```

**New, THREE / DOM:** `src/act3.js` (`ACT3_LEVELS`); `src/env/atolls.js`, `cape.js`, `deep.js` (env contract plus
`fx(visuals)` for spouts and the wave, `deep.setDawn(k)`); `src/krakenView.js` (`createKrakenView(scene, {
reducedMotion }) → { update(visuals, t, dt), dispose() }`, ≤ 30 draw calls); `src/quizPanel.js`,
`src/buildPanel.js` (DOM, created by townMode, styles in `town.css`).

**Changed:**

| Module | Change |
|---|---|
| combat.js | `AMMO` frost/fire/stink, `AMMO_IDS` ×6, `STATUS`, `ARMOUR { beam: 0.5 }`, `LOADS`; `shotResult` adds `status`, `armoured`; `ammoUnlocked(id, unlocked, shot)` |
| shipTypes.js | the five types (`ram`, `mortar`, `armour`, `call` fields) |
| mechanics.js | `spouts`, `rogue`, hook `visuals()`, `ctx.warnBonus` |
| upgrades.js / armory.js | `rudder` row and `turnLow` / `POWDER` prices, `shot` field, `buyShot` |
| cosmetics.js / people.js | four trophies and feats / hat `mortarboard`, pet `octopus`, tools `hammer`, `pointer` (existing looks unchanged) |
| ships.js | five models, `projectileMesh` for the specials, `setStatus(group, { frost, fire })`, rudder tiers |
| tags.js / pops.js | status icon + ring, RAM chevrons / styles `frost`, `fire`, `stink`, `kraken` |
| sparrow.js | plots group, `setIsland(state)`, villagers in `folk()`, Bess and Barnacle, places `quiz`, `builder` (walk fixture regenerated) |
| townMode.js / town.js | six places, the tavern's Powder tab, quiz and build views |
| audio.js | SFX `frost fire stink ram mortar spout surf splash horn roar slam grab sneeze build right nearly`; scenes `atolls cape deep kraken` |
| main.js | loads and tray, status effects (stink → `mayFire` false), ram and mortar AI, armour, crates, Kraken glue and checkpoint, perks, `input.steer`, three voyage groups, `#next-act-btn` |

**Test API (`__game`):** `combat.loads`, `setLoads()`, `status(e)`, `crate()`; `kraken: { state, rise(), hit(),
phase, cut() }`; `island: { state, set(), build(id) }`; `quiz: { state, start(n), answer(i) }`; `steer(x)`.

---------------------------------------------------------------------------------------------------

## 11. Tests and budgets

- **Node:** `kraken.test.cjs` (phase changes, timings, slam radius, grab break three ways, sneeze immunity, boss
  halves, determinism, junk); `quiz.test.cjs` (the real bank validates, sums correct, one question per category,
  stars, each star paid once, 2,610 total, garbage battery); `island.test.cjs` (costs, 11,800 total, perks, villagers,
  rank, gift, garbage battery); combat, armory, upgrades (6,240), cosmetics and mechanics extended (rogue: surf at
  49°, 10 damage at 51°).
- **Browser:** `tests/voyage3.cjs`: cards 7–9, each hazard, each new ship (ram 10/8, mortar ring, CLANG ×0.5 and a full
  stern rake), stink stops firing, the Kraken's rise and checkpoint, and an **Act III bot** (late-game ship, all
  powder) clearing 7–9 within 900 s sim each with damage rising 7 < 8 < 9. `battle.cjs`: loads, tray, keys 4–6,
  fallback to round, crates. `town.cjs`: quiz and builder by keys and taps, layouts, and 30 s of random walking
  among 8 villagers that never leaves the captain stuck for more than 1 s.
- **Existing checks that change:** 6 → 9 cards; the progress clamp; the won screen after the Maelstrom; shipyard
  `buys 6 → 7` and its Tab order; the upgrades table and total; places bar 4 → 6; the tips range.

| Scene | Budget (`renderInfo.calls`, `?quality=low`, 1280×720) |
|---|---|
| L7–L9 env alone | ≤ 220 |
| L7–L9 level start | ≤ 310 |
| L7–L9 busiest, with a boarding | ≤ 450 (specials ≤ 2 per ship; stink clouds one InstancedMesh) |
| Kraken fight | ≤ 400 (Kraken ≤ 30) |
| Town walk (8 villagers, 2 NPCs), shipyard view | ≤ 450 (today's max 371, + 56) |

---------------------------------------------------------------------------------------------------

## 12. Accessibility

Real buttons (≥ 44 px; quiz answers ≥ 56 px) with focus rings; state in icon + text, never colour alone (snowflake,
flame and cloud icons differ in shape); small text ≥ 4.5:1; live regions `#game-live`, `#quiz-live`, `#build-live`.
Reduced motion: no shake, fades instead of bounces, camera cuts. Photosensitivity: no new flashes; the Kraken's eye
pulses ≤ 1 Hz. Mashing never required (grabs: hold works). Every place is in the places bar and the Harbour menu.

## 13. Risks

| Risk | Mitigation |
|---|---|
| Scope | SPEC2-style stages (seams and stubs first, then pure modules and envs in parallel); the cut list |
| Specials trivialise fights | 2–5 loads, weaker hull damage, stink immunity, bosses halve |
| Kraken too hard for a child | telegraphs, an outrunnable shadow, the checkpoint, bot-tuned to 2–3 min |
| Draw calls | villagers ≤ 8, culled at 30 u; plots one bake; Kraken ≤ 30 |
| Wrong quiz facts | short facts, a human check per question |
| main.js bottleneck (6,000 lines) | logic in pure modules; one integrator per stage |
| A villager blocks the captain (the reported bug) | villagers are in `env.folk()`, inherit the squeeze-past fix, and are tested |

## 14. Cut list (from the top; each cut leaves a consistent game)

1. The baby kraken climbing aboard (the trophy stays). 2. Villagers' move-in walk and lines. 3. Town rank and
the Governor's coat. 4. Powder crates. 5. Sea geysers. 6. Rainbow macaw. 7. Kraken ink patches. 8. Kraken grab
(slams only). 9. Thumb-drag steering (the rudder stays). 10. Quiz islands 7–9 with 4 answers (all 3). 11. Amenities
down to Bakery, Windmill, Lighthouse, School. 12. Level 8 (its Iron Turtles and Inkfins join level 9's first wave).

**Never cut:** level 9 with the Inkheart and the hunting Kraken; Frost, Fire and Stink with their looks and
loads; the rudder upgrade; six quiz islands; homes with walking villagers and three amenities.
