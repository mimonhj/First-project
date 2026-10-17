# Pirates Ahoy! — "Kraken!" update — design (angle: spectacle and feel)

Designed against `README.md`, SPEC2 §0, §9–§13, §17 and the code. Every SPEC2 convention holds: deterministic
`step(dt)`, gameplay rolls from `combatRng`, pure modules import nothing, records validated like `parseShipConfig`,
`toon()` + ink outlines, InstancedMesh only with `noOutline()`, mashing never required, nothing flashes.

**Pillars.** (1) Everything new reads at a glance on a 390×844 phone: shape, colour, icon *and* word. (2) Every threat
is telegraphed ≥ 1.4 s. (3) Cartoon, never grim: nobody dies on screen. (4) The island visibly grows with every coin.

**Where I differ from the defaults.** The Kraken is **driven off** (bar to 0, it flees sulking), never slain. When the
Ink Queen falls her remaining crew **flee**, so the hunt is one-on-one (readable, within budget). Special ammo is a
**stock of kegs** (1 keg = 1 broadside of one side). Stink **can't be chained**. The quiz lives at the **lookout
tower**; building plots are **fixed**, so walk data changes once.

## 1. Voyage III · The Deep Unknown (levels 7–9)

Beating the Maelstrom shows Victory with **Sail on to Voyage III** (as the Molten Maw does for Voyage II). The title
gets a third card group under a painted curling tentacle: "Daring ★7", "Fearsome ★8", "Mythic ★9" (skull + number,
not 9 pips); locked text "Beat the Phantom".

| # | Sea (env module) | Look | Waves | Disaster | Bonus |
|---|---|---|---|---|---|
| 7 | **Squall Keys** (`env/squall.js`) | turquoise shallows, white sandbar keys, a towering bruise-purple storm wall | `[ketch, corsair, privateer]`, `[fireship, fireship, manowar]` | waterspouts | 1,200 |
| 8 | **The Drowned City** (`env/drowned.js`) | marble ruins half-sunk in violet-gold dusk, a colossal sea-queen statue | `[ironback, ketch, corsair]`, `[ironback, fireship, manowar]` | rogue waves | 1,500 |
| 9 | **The Kraken's Deep** (`env/deep.js`) | moonlit night, glowing water, wreck graveyard, whale-skeleton arch | `[skiff, skiff, ironback]`, `[inkqueen, skiff]`, then **the Kraken** | jellyfish, the Kraken | 2,000 + Pearl 1,000 |

`src/act3.js` (SPEC2 §6.1 format): `enemyRake 1`, `nextWaveAt 1`, `maxAttackers 3`, `grace 3`, `lead` 0.7/0.72/0.75,
`spreadMul` 0.9/0.88/0.85, `mechanics` `['spouts','ships3']`, `['rogue','ships3']`, `['jellies','ships3','kraken']`, L9
`finale`. Tuned with the Act II bot on a late-game ship (shipyard and armory tier 2); order within the act (§6.8).

**Squall Keys.** Water so clear you see sand ripples; keys with leaning palms and three pink flamingos on sandbars
(reefs); a candy-striped lighthouse toppled on a coral rock; a stilt village with conch-shell roofs. The east is one
giant anvil cloud (merged mesh, pink on top, slate beneath) trailing rain curtains; soft sun shafts in the west
(additive, ≤ 0.2). Palette `skyTop 0x3a4f7a, skyHorizon 0xbfe8d8, sunColor 0xfff0c8, sunIntensity 2.1, fogColor
0xb8d8d0, waterDeep 0x0f7f9a, waterShallow 0x48e0d0, waveAmp 0.7`, `worldRadius 145`. Music: calypso steel drums over
storm toms; thunder is sound only.

**The Drowned City.** A low gold sun behind an aqueduct of white arches (collider); columns in the shallows, broken
domes, a dolphin mosaic glowing under the water (decal). A colossal sea queen, sunk to her waist, holds up a warm
lantern; a conch-horn tower beside her sounds before each rogue wave. Palette `skyTop 0x4b3a8f, skyHorizon 0xffb38a,
sunColor 0xffc89a, sunIntensity 2.0, fogColor 0xe8a8a0, waterDeep 0x1b5c8c, waterShallow 0x3fc7c9, waveAmp 0.65`.
Music: harp and lyre arpeggios, wordless choir, frame drum.

**The Kraken's Deep.** Night under a huge low cratered moon. The foam glows cyan (`waterFoam 0x9ff7ff`), so every wake
is a trail of light. Wrecks lie on their sides (colliders); a whale's ribcage arches over a channel you can sail
through; the Kraken Crew's lair is a sea cave carved like an octopus head, purple torches for eyes. Palette `skyTop
0x0f1638, skyHorizon 0x3a3f7a, sunColor 0xcfe0ff, sunIntensity 1.2, fogColor 0x232a5a, waterDeep 0x0b2a4a, waterShallow
0x1f8f9a, waveAmp 0.75`. Music: low cello ostinato, glass harmonica, whale-song glides.

## 2. Natural disasters

Positions advance in simulated time (env `step(simTime)` like the floes, or `mechanics3` state); visuals read a
snapshot. The Lighthouse lengthens every warning (§8). Minimap: spouts as white swirls, the wave as a teal line with an
arrow, jellies as pink dots.

| Disaster | Warning | Timing | Effect | Counter-play |
|---|---|---|---|---|
| **Waterspout** (L7) | 3 s: spiral foam dimple, funnel lowers | 2 alive, 30 s each on fixed loops at 2.5 u/s; a new one 6 s after one ropes out | r 9: pulled in (`3.5·k`, `k = 1 − d/9`), spun +1.8·k rad/s; core r 2.5: 3 hp per 0.5 s; douses fire | keep clear; drag pirates in |
| **Rogue wave** (L8) | 6 s: conch horn, shore foam draws back, gulls scatter, edge arrow | first at 40 s, then every 30–40 s; crosses at 16 u/s | **beam-on** (50°–130° off its travel): 14 dmg, pushed 8 u, turn ×0.25 for 2 s; **bow in**: "RODE IT!"; **stern-on**: "SURF'S UP!" ×1.5 speed 3 s; douses fire | bow or stern to it |
| **Jellyfish** (L9) | always visible | 5 patches r 6–9 drifting 0.6 u/s | speed ×0.7, 1 hp per 0.5 s, "STING!" ≤ 1/s | steer round |

*Waterspout*: three twisted cel bands (white, pale grey, blue-grey) spinning into a dark cloud disc, a white spray skirt,
two barrels and a startled fish orbiting up; a 3D wind loop. *Rogue wave*: a Hokusai-style curl 140 u wide, 7 u tall,
deep teal with a white lip of foam "claws"; horn, a 4 s roar, a crash as it passes (no shake under reduced motion).
*Jellies*: translucent pink and teal bells (one InstancedMesh ≤ 120, `noOutline`) pulsing ≤ 1 Hz in scale only.

## 3. New enemy ships (`shipTypes.js`; `ships.js` models ≤ a Man-o'-War's draw calls, boss ≤ 1.3×)

| Key | Name | hp | len/wid | speed | turn | reload | guns × dmg | gold | crew/grit | Behaviour |
|---|---|---|---|---|---|---|---|---|---|---|
| `ketch` | Bomb Ketch | 55 | 8.5/3.0 | 8 | 1.0 | 5.5 | mortar shell 14 dmg r 4.5 | 7 | 9/1.0 | keeps 30–38 u off; lobs at your predicted spot, orange ring, warn 2.2 s, range 40 |
| `fireship` | Fire Ship | 30 | 7.5/2.6 | 11.5 | 1.4 | — | blast 24 dmg r 6 | 3 | 4/0.8 | `boardable: false`; lit at 30 u, rams you, explodes within 4 u (sunk within 6 u: half) |
| `ironback` | Ironback | 150 | 11/4.2 | 6.5 | 0.8 | 2.6 | 3 × 6 | 12 | 16/1.3 | armour: beam hits ×0.5 ("CLANG!"), rakes and burns full |
| `skiff` | Squid Skiff | 40 | 8/2.6 | 13 | 1.7 | 3.0 | 1 × 4 | 5 | 10/1.1 | `boarder`, `shallow` (raider rules) |
| `inkqueen` | The Ink Queen | 380 | 17/5.6 | 6.5 | 0.6 | 2.6 | 6 × 6 | 35 | 26/1.5 | `boss`, boardable (725 gold); 2 ink blobs every 9 s, warn 1.8 s, 8 dmg + INKED |

**INKED** (player only): reload ×1.4 for 4 s; ink splats on your deck and an ink-pot icon on the hull card, never on the
screen. *Bomb Ketch*: stubby mustard hull, a fat bronze mortar that jumps with a "THOOMP" and a smoke ring; the shell
trails fuse sparks, its ring ticks (lava is red and whistles). *Fire Ship*: a scruffy sloop piled with tar barrels;
lit, flames bloom up the rigging and a jolly boat pulls away ("Fire ship! Sink her before she reaches you!"); the blast
is an orange fireball, a smoke ring and embers, "KA-BOOM!". *Ironback*: a turtle ship roofed in spiked hexagonal plates,
a dragon-head prow puffing yellow smoke; beam hits spark. *Squid Skiff*: narrow purple hull, a squid prow with googly
eyes. *Ink Queen*: purple-black galleon with gold scales, a carved kraken wrapping the bowsprit, amber eyes, violet
sails. Kraken Crew sailors wear octopus hats and purple-and-black stripes.

## 4. Level 9 finale: the Ink Queen, then the Kraken hunts you

**The Queen falls** (sunk or captured): "The Ink Queen is beaten!"; the other Kraken Crew ships strike and row off the
map ("The Kraken Crew abandon ship!", no loot, no penalty). A captured Queen sails away under your flag untouched.

**The rise (7 s; any key skips).** 0–1.5 s: the music drops to a 40 Hz drone beating against 41 Hz; the sky eases to
deep violet over 3 s; the glowing foam dims. 1.5–4 s: bubbles boil up in a ring 30 u round you, the camera pulls up and
back. 4 s: a low horn "WHOOOM"; 40 u ahead the sea bulges and one amber eye, big as your sail, opens and blinks. Banner
**"THE KRAKEN RISES!"** — "It's hunting you! Shoot its tentacles and head. Stink shot makes it let go!" 7 s: it sinks;
the boss bar **THE KRAKEN** appears in 3 segments; the Kraken theme starts (a descending D–C♯–A tuba motif over timpani
in 6/8, faster in phase 3). Reduced motion: a cut to the eye and back. Minimap: a violet blob with an eye.

**The model** (`src/kraken.js`): one SkinnedMesh body (plum `0x4a2f6e`, belly `0x7a4f86`, ≤ 3 groups) with barnacles and
an old figurehead stuck on its crown, amber eyes (glow, `noOutline`), ≤ 4 tapered skinned tentacles (pink suckers
below, curled tips). Submerged it is a violet shadow decal with a bubble trail. A tentacle bursts up in a foam collar;
a slam lifts it to 8 u, holds 0.3 s and smacks down in a splash ring: "SLAM!".

| Phase | hp | Movement | Attacks (simulated s) |
|---|---|---|---|
| 1 · The Hunt | 900 → 600 | submerged, circles you at r 22, 8.5 u/s (a stock ship at full sail just outruns it) | every 6.5 s: 2 slams at your predicted spot ±6 u, violet dashed ring r 4.5, warn 1.6, 16 dmg; tentacles stay up 5 s as targets |
| 2 · The Eye | 600 → 300 | plus: head surfaces 26–30 u off your beam, 8 s of every 14 | head up: ink spit every 3 s, black-violet ring, warn 1.8, 10 dmg + INKED; slams every 7 s |
| 3 · The Fury | 300 → 0 | surfaces mid-arena and whirls the sea (`pull 1.6, swirl 2.2, r 50`); head up 10 s of 14 | slams every 5 s; **sweep** every 12 s: a 30 × 4 u stripe across your bow, warn 2.0, 20 dmg |

**Grab.** A raised tentacle within 6 u of your hull for 2.5 s wraps your ship: "GRABBED!", speed 0, 3 hp/s, the hull
creaks and heels 0.1 rad. Four ways out: **cut** (`G` ×3 or hold 0.8 s; touch **CUT!**, the raider rules), 40 damage
to that tentacle, a stink hit, or it lets go after 6 s (no soft-lock).

**Hits.** Balls hit raised tentacles (capsule r 1.6, top 9) and the head (sphere r 4.5); `aimTarget` and the FIRE! lights
count them. Tentacle ×1, head ×1.5; range and crits apply, rakes don't. Frost: swim ×0.5 and attack timers ×1.5 for 3 s.
Fire: 1.5 hp/s for 4 s. Stink: the tentacle withdraws ("PEE-YEW!") and the next attack waits 3 s; on the head
"ACHOO!", it dives early; once per 10 s. `G` with nothing grabbed: "You can't board a sea monster!".

**Driven off** at 0: "THE KRAKEN FLEES!" — a buzzy ink raspberry, a sulky gurgle of bubbles, and a giant glowing pearl
bobs up (sail over it, or it drifts to you after 4 s): "+1,000 THE KRAKEN'S PEARL". Victory: "The Kraken flees to the
deepest deep! You are the Terror of the Seven Seas." Trophies: pet **Baby kraken** (a tiny purple octopus on the
shoulder) and hat **Ink Queen's tricorne** (capture her).

**Kind to a child.** Sinking during the hunt offers **Try again from the Kraken** (first button on the shipwreck card):
full hull and crew, the gold and kegs you had at the rise. Session only.

## 5. Special ammo: Frost, Fire and Stink

| Ammo | Key | Unlock (`unlocked ≥`) | Hull × | Range | Reload × | On hit (once per volley per ship) | Time (bosses ×0.5) |
|---|---|---|---|---|---|---|---|
| **Frost** | `4` | 6 (Frostbite Straits) | 0.5 | 28 | 1.1 | **FROZEN!** speed ×0.5, turn ×0.5, her reload ×1.5; 3 frost volleys within 6 s → **ICED SOLID!** speed ×0.1, turn 0 for 3 s (never bosses) | 5 s a volley, max 8 |
| **Fire** | `5` | 4 (the Volcano) | 0.6 | 30 | 1.15 | **ABLAZE!** 3 hp/s (1 hp per ⅓ s, no tick pops), refreshed not stacked; no repairs while burning; ignores armour | 8 s |
| **Stink** | `6` | 7 (the Maelstrom) | 0.3 | 22 | 1.25 | **STINKED!** can't sail (drifts to a stop at 2× decel) or fire, then 3 s groggy (speed ×0.6), then 10 s immune ("Nose pegs on!") | 4 s |

One special status per ship (the newest replaces the old); frost puts out fire ("SIZZLE!" and steam); spouts and rogue
waves douse fire. Statuses join SPEC2's smallest-multiplier rule. Enemies still fire round shot only.

**Earning and limits.** A keg = one broadside of one side (`Space` uses two). Carry ≤ 5 of each (Windmill +1/+2/+3).
Bought in the shipyard's new **Magazine** tab: one row per special (icon, "Aboard 2 of 5", **Buy a keg — 40 gold**, or
"Need 15 more gold" / "Rack full" / "Locked: beat Frostbite Straits"); Frost 40, Fire 50, Stink 60 gold (Windmill
−10/−20/−30 %, rounded to 5); each purchase rolls a keg up the gangplank into the rack. A sunk or captured pirate drops a
floating keg 20 % of the time (`combatRng`): a bobbing barrel in its colour with a glowing ring; sail within 3 u: "+1
FROST SHOT!". A lost or abandoned attempt restores the level-start stock (the gold rule). An empty side falls back to
Round ("Out of fire shot!").

**What you see and hear.**
- *Frost*: pale-blue balls with crystal spikes; ice shards and snow on impact. A frozen ship grows an icicle fringe
  along both rails (one merged inked mesh scaled to `len`), 6 ice plates bob round her (one shared InstancedMesh,
  `noOutline`, ≤ 36), her wake stops; iced solid adds a translucent ice collar. Crystalline pings and a "kssh".
- *Fire*: orange balls with an ember trail; flames lick from her two newest holes (glow particles), black smoke,
  charred sail edges; flames flicker in shape, never in brightness. A "whoomph", a crackle loop, a hiss when doused.
- *Stink*: tumbling clay pots with a green wisp; "SPLOT!" — lumpy lime clouds (`0x8bc34a`, swirls `0x5a8f2e`), wavy
  stink lines, buzzing flies, two sailors coughing at the rail (new `'cough'` action, overboard pool). A wet splorch, a
  trombone "wah-wahhh", coughs.
- Her tag shows the status icon (snowflake, flame, cloud with wavy lines) in a ring that empties as it wears off; pops
  "FROZEN!", "ICED SOLID!", "ABLAZE!", "STINKED!", "SIZZLE!" (white, 3 px ink, ≥ 24 px); `#game-live` "Corsair frozen".
  Your kegs (blue, orange, green barrels with white icons) stand racked by the mainmast (≤ 3 merged meshes).

**Controls.** `R` cycles ammo you have (skipping locked and empty), `1`–`6` pick by key position; the gun card shows
"Frost ×3". Touch: tapping **Ammo** still cycles; **hold 0.4 s for the ammo fan**: up to 6 chips (≥ 48 px, icon, name,
count) above the pill; tap one or outside. Locked ammo says why ("Stink shot unlocks after the Maelstrom").

## 6. Better steering

**Helm** (new `helm` row in `upgrades.js`). A slow ship turns at only 35 % of its rate today; the helm raises that floor.

| Tier | Name | Turn floor at low speed | Turn × | Price | On the model |
|---|---|---|---|---|---|
| 0 | Ship's wheel | 0.35 | 1.0 | — | — |
| 1 | Brass-bound wheel | 0.5 | 1.05 | 150 | brass rim and spokes |
| 2 | Balanced rudder | 0.65 | 1.1 | 350 | a carved rudder with a gilded fish tail |
| 3 | Racing helm | 0.8 | 1.2 | 650 | a double wheel and a jib on a longer bowsprit |

**Touch wheel** (`#touch-wheel`, left pad; pause-menu setting **Steering: Wheel / Buttons**, saved). A 132 px cartoon
wheel (8 spokes, brass hub). Drag sideways: turn input `clamp(dx / 60 px, −1, 1)`, dead zone 0.1 — **analog**, so a
small drag is a small correction (◀ ▶ are all-or-nothing). It turns `input × 120°` and springs back in 0.15 s (instantly
under reduced motion); the helm captain turns his wheel the same amount (`'steer'` takes `turn` −1..1). Default
**Wheel** on touch; **Buttons** is exactly today's ◀ ▶ (existing touch tests set it) and the accessible equivalent (the
wheel is `aria-hidden` like the town joystick).

**Anchor swing** (cut-able). `Shift` + `A`/`D` or arrows; touch **⚓ Swing**, a third act-pad button. The anchor splashes
off the bow on a chain and the ship pivots at 2.6 rad/s for 0.9 s (≈ 135°), speed to 40 %, cooldown 8 s (a ring round
the button refills). A white foam fan sprays from the stern, the hull heels 0.15 rad; chain rattle, splash, "Heave!".

## 7. Ashore: the Riddle Bell (quiz)

The lookout tower raft becomes **The Riddle Bell**: a brass bell in a timber frame, a chalkboard easel painted with a
parrot, two benches. Host **Professor Barnacle** (old man, round spectacles, mortarboard, long grey beard, a pointer)
and **Quizzle**, a big green-and-yellow macaw on a perch. The places bar gains **Quiz** (bell) and **Build** (hammer);
six buttons fit icon-only at 320 px.

| Round | Title | Qs | Answers | Topics | Pass | First clear | ★★★ first time |
|---|---|---|---|---|---|---|---|
| 1 | Deckhand | 5 | 3 | sea, sea life, sums to 10 | 3 | 40 | +20 |
| 2 | Lookout | 5 | 3 | the game's places, sums to 20 | 3 | 60 | +30 |
| 3 | Navigator | 5 | 3 | compass, maps, real geography | 3 | 80 | +40 |
| 4 | Quartermaster | 5 | 4 | pirate history, × to 5 | 3 | 120 | +60 |
| 5 | First Mate | 6 | 4 | weather and sea (waterspouts, tsunamis), × to 10 | 4 | 160 | +80 |
| 6 | Captain | 6 | 4 | everything, two-step sums | 4 | 240 | +120 |

Pass = ★, all but one right = ★★, all = ★★★. Every right answer also pays **2 gold**, always (School ×2/×3/×4), so a
missed round still earns; bonuses pay once. Round n+1 opens when n is passed. Trophy hat **Professor's mortarboard**:
★★★ on all six. No timer, no lives, nothing lost.

**Bank** (`src/quiz.js`): `{ id: 'life-octopus-arms', tier: 1, topic: 'life', q: 'How many arms does an octopus have?',
a: ['8', '6', '10'], fact: 'Octopuses can taste with their suckers!' }` — the right answer is `a[0]` in the data,
shuffled per run by a seeded rng. ≥ 20 per tier at launch plus generated sums ("5 chests with 6 coins in each: how many
coins?"); a run skips the ids of that round's last two runs. A Node lint: unique ids, 3–4 distinct answers, tier 1–6,
fact ≤ 140 characters, ≥ 15 per tier. Sample: "What was a piece of eight?" (a silver coin / a slice of cake / a small
cannon).

**Screens** (`#quiz-screen`, a parchment panel like the tavern's, the camera framed beside it on the bell): *Rounds* (6
rows: title, "★★☆ 2 of 3 stars", **Play** or "Pass Lookout first") → *Question* ("Question 2 of 5", text ≥ 20 px,
answers ≥ 56 px with badges A–D, **Ask Quizzle** when the School gives hints) → *Answered*: right, the Professor rings
the bell ("DING-DING"), Quizzle flaps and squawks "Right you are!", coins sparkle; not quite, a soft marimba "bonk",
Quizzle tilts his head ("Not quite! It's 8."), a ✓ on the right answer and the fact under it; **Next** takes focus →
*Result*: stars stamp on one by one, confetti from the crow's nest (fade under reduced motion), a short fanfare, gold;
**Play again** / **Back to rounds**. Keys `1`–`4` or `A`–`D` (only while a question shows), `Enter`, `Esc`.
`#quiz-live` reads the question and answers, then "Right!" or "The answer is 8."

## 8. Building up Sparrow's Floating Island

**Plots.** Ten fixed plots ring the walkable town, each a raft on a short rope bridge: four house plots (**Sparrow Row**,
west of the garden) and six amenity plots (the Lighthouse on the far east point, the Windmill on the breezy north
raft), clear of the shipyard framing. Walk data is **static**: a small front deck (≈ 3 × 2 u) is walkable, the
footprint behind it is a blocker from day one, a camera-only box covers the tier-3 envelope (`walk.camBlockers`). An
empty plot: planks, a sawhorse and a flag sign "Build here!".

| Plot | Tiers | Costs | Perk per tier | Villagers needed |
|---|---|---|---|---|
| House ×4 | Cottage / Townhouse / Painted manor | 100 / 250 / 500 | 2 / 3 / 4 villagers; each pays 2 gold per level cleared | — |
| Bakery | Bread oven / Bakery / Grand bakery | 150 / 350 / 700 | +1 / +2 / +3 hands at every level start | 0 / 4 / 8 |
| School | Schoolroom / School / Academy | 120 / 300 / 600 | quiz hints 1 / 2 / 3 per run, quiz gold ×2 / ×3 / ×4 | 0 / 4 / 8 |
| Lighthouse | Beacon / Lighthouse / Great light | 200 / 450 / 900 | every warning ring and horn +0.3 / +0.5 / +0.8 s | 2 / 6 / 12 |
| Garden | Flower beds / Herb garden / Greenhouse | 100 / 250 / 500 | +1 / +2 / +3 free kegs per level cleared (your lowest unlocked, never over the max) | 0 / 4 / 8 |
| Market | Stalls / Market hall / Clock-tower market | 150 / 400 / 800 | +5 / +10 / +15 % gold from loot and captures | 2 / 6 / 12 |
| Windmill | Post mill / Stone mill / Powder mill | 150 / 350 / 700 | kegs −10 / −20 / −30 %, carry +1 / +2 / +3 | 0 / 6 / 12 |

Everything: 10,340 gold (houses 3,400, amenities 6,940); population tops out at 16.

**The buildings** (each tier adds to the last): *houses* — a cottage with a wavy roof in the town's pastels → a second
storey with window boxes → a turret, balcony and fish weathervane. *Bakery* — half-timbered, a giant loaf sign, warm
chimney smoke → awning and tables → a pretzel weathervane. *School* — blue schoolhouse with a bell cupola → a globe on
the roof → a telescope dome. *Lighthouse* — wooden beacon → red-and-white tower → tall tower whose soft beam (additive,
≤ 0.25) turns at 0.6 rad/s, never flashing. *Garden* — flower beds → herbs and a scarecrow → a greenhouse and a topiary
sea serpent. *Market* — two stalls → a canvas hall → a clock tower. *Windmill* — a post mill with turning sails → stone
base → a powder shed puffing blue, orange and green smoke.

**The montage** (2.4 s, skippable): scaffolding pops up in sawdust (0.4 s), four hammer knocks and a saw (1.2 s), the
building springs up with squash and stretch (0.6 → 1.08 → 1, a rising "boing", 0.5 s), bunting, confetti, a cheer.
Reduced motion: it fades in with the sounds.

**Villagers** (`man`, `woman`, `kid`, `old`, seeded per plot) step out of their door with a cheer and walk loops between
their plot, the plaza and the amenities (walker paths that wait for the captain). Greetings know the island: "The new
bakery smells grand, Cap'n!". At most **8 are out at once** (`share: true`, culled beyond 30 u); the rest are "at
home": lit windows, chimney smoke.

**Panel** (`#build-screen`, "The Harbourmaster's plans"; **Mrs Mallow** at a plans table on the plaza): header
"Villagers 6 of 16 · Treasure chest 1,240 gold"; groups Houses and Amenities; rows with icon, name and tier, "Now: +2
hands at every level start · Next: +3", pips, and **Build — 150 gold** / **Upgrade — 350 gold** / "Need 120 more gold" /
"Needs 6 villagers (you have 4)" / "Fully built" (`aria-disabled` with reasons). Focusing a row glides the camera to the
plot (`frameBeside`; a cut under reduced motion). Saved record first, chest second.

**Art budget.** All built plots bake into one "development layer" (vertex colours, one mesh per ink weight, ≤ 3),
rebaked on a purchase (≤ 40 ms) and at dock open; animated parts separate (windmill sails, beam, fountain; ≤ 6).

## 9. Saves (`loadRecord`-validated: never throw, plain integers, size caps, own properties, rewritten when fixed)

| Key | Shape | Rules |
|---|---|---|
| `pirates-ahoy-unlocked` | integer | max 9 |
| `pirates-ahoy-ship` | + `up.helm` | 0..3; missing → 0 |
| `pirates-ahoy-magazine` (new) | `{"v":1,"frost":2,"fire":0,"stink":5}` | 0..carry max |
| `pirates-ahoy-island` (new) | `{"v":1,"t":{"house1":2,…,"windmill":0}}` | known plots, 0..3; a tier its villager need forbids is lowered |
| `pirates-ahoy-quiz` (new) | `{"v":1,"stars":[3,2,0,0,0,0],"runs":[4,1,0,0,0,0]}` | stars 0..3, only after the round before has stars |
| `pirates-ahoy-settings` (new) | `{"v":1,"steer":"wheel"}` | `wheel` / `buttons`, else the device default |
| `pirates-ahoy-feats` | + `kraken`, `inkqueen` (0..1) | `FEAT_PRIZE_TYPES` + ketch, ironback, skiff, inkqueen |

Two tabs sync the new records through the `storage` listener. Blocked: defaults for the visit. Full: a keg, building or
quiz reward whose record can't be written is refused and costs nothing.

## 10. Modules and APIs

**New, pure (Node-tested):**
- `src/magazine.js` — `KEGS`, `CARRY = 5`, `defaultMagazine/parseMagazine/serializeMagazine`, `kegPrice(id, perks)`,
  `buyKeg(mag, purse, id, perks) → { ok, mag, cost, reason }`.
- `src/island.js` — `PLOTS`, `defaultIsland/parseIsland/serializeIsland`, `population(cfg)`, `plotState(cfg, purse, id)
  → { tier, cost, affordable, needs, label, perkNow, perkNext }`, `build(cfg, purse, id) → { ok, cfg, cost, reason }`,
  `islandPerks(cfg) → { crewBonus, lootMul, warnBonus, kegDiscount, kegCarry, freeKegs, quizHints, quizGoldMul, tax }`.
- `src/quiz.js` — `ROUNDS`, `QUESTIONS`, `sumQuestion(tier, rng)`, `makeRun(round, seed, recent)`, `scoreRun(round,
  right) → { stars, passed }`, `reward(rec, round, right, perks) → { gold, rec }`, `defaultQuiz/parseQuiz/serializeQuiz`.
- `src/mechanics3.js` — `createMechanics3(ids, ctx)`: SPEC2's hooks plus `targets() → [{ id, kind, x, z, r, top }]`,
  `hitTarget(id, info) → { dmg, pop }`, `grab()`, `bossBar() → { name, frac, segments }`, `visual()` (snapshot for the
  art), `retryPoint()`. Ids `spouts`, `rogue`, `jellies`, `ships3` (mortar, fireship, armour, the crew's flight),
  `kraken`; numbers in tables `SPOUTS`, `ROGUE`, `JELLIES`, `KETCH`, `FIRESHIP`, `KRAKEN`. ctx adds `bomb({ x, z, from,
  kind: 'shell'|'ink'|'slam'|'sweep', radius, damage, warn })` and `status(ship, id, s)`. main composes the two sets
  (hooks fan out; first non-null `steer`/`drift`; objectives joined).

**Extended, pure:** `combat.js` (`AMMO` frost/fire/stink rows, `STATUS`, `ARMOR.beam 0.5`, `shotResult().status`);
`upgrades.js` (`helm`, `turnFloor`); `shipTypes.js` (§3); `cosmetics.js` (pet `kraken`, hats `inkqueen`, `mortarboard`;
feats; Kraken Crew looks); `levels.js` (Acts I–III).

**New, three.js:** `src/act3.js`; `src/env/squall.js`, `drowned.js`, `deep.js` (env contract + `step`, hazard data,
`update(t, dt, { simTime, camera, hazard })`); `src/kraken.js` — `createKraken(scene, ctx) → { prepare(), sync(snap, t,
dt), camera(), dispose() }`, prebuilt hidden during the fly-in; `src/statusfx.js` — `createStatusFx(scene, ctx) →
{ sync(ships, t, dt), clear(ship), dispose() }`; `src/islandArt.js` — `buildPlot(id, tier, seed) → Group`.

**Extended:** `ships.js` (5 builders, helm and keg-rack opts); `people.js` (hats `octo`, `mortarboard`, pet `kraken`,
`glasses`, `'cough'`; determinism rule kept); `env/sparrow.js` (plots in `walk`, `setIsland(cfg)`, `playBuild(id)`,
`setVillagers(list)`, the Riddle Bell, Mrs Mallow); `townMode.js` + `town.css` (views `'quiz'`, `'build'`); `audio.js`;
`main.js` (kegs and statuses, analog `input.turn`, wheel, anchor, Magazine tab, composed mechanics, Kraken targets in
`updateBalls`/`aimTarget`, segmented boss bar, retry from the Kraken, island perks, records, Voyage III cards).

**Test API:** `specials { get kegs, setKegs, status(ship) }`, `hazards { get state, wave(), spout(x, z) }`, `kraken
{ get state, rise(), setHp(n), phase(n) }`, `island { get config, set, build(id) }`, `quiz { get record, start(round,
seed), answer(i), get run }`, `settings { get, set }`. **Tests:** Node for the four pure modules (tables, garbage
battery, bank lint, Kraken timers, the grab's four ways out); browser for specials, Voyage III and its bot, the rise and
retry, Quiz and Build, the wheel, and draw calls.

## 11. Sound cue sheet (synthesised first; recordings may replace them later)

New `SFX_NAMES`: `freeze` (high sine pings 2–4 kHz + "kssh"), `thaw` (glassy clinks), `ignite` (low-passed noise
swell), `crackle` (band-passed clicks 40/s, loop, ≤ 2 voices), `sizzle` (hiss), `stink` (wet splorch + trombone slide
220 → 110 Hz), `cough`, `mortar` (60 Hz "THOOMP"), `fuse` (ticking), `blast` (long low boom), `clang` (inharmonic FM,
0.25 s), `spout` (wind loop), `horn` (two-note conch), `rogue` (4 s swell and crash), `sting` (900 Hz "bzzt" 60 ms),
`krakenRise` (40/41 Hz beating drone), `krakenHorn` (growling brass blat), `slam` (noise burst + 50 Hz thump), `ink`
("pthoo" + plop), `grab` (wooden creak), `gurgle` (falling bubble blips + raspberry), `anchor` (chain clicks slowing from
12/s + splash), `bell` (FM "ding-ding"), `bonk` (soft low marimba), `squawk`, `build` (knocks, saw, "boing" 200 → 600 Hz).
New scenes `squall`, `drowned`, `deep`, `kraken`; the quiz and building keep the town music.

## 12. Budgets and accessibility

| Scene (`renderInfo.calls`, `?quality=low`, 1280×720) | Budget | Planned |
|---|---|---|
| Act III env alone / level start | ≤ 220 / ≤ 310 | statics merged; spouts ≤ 4 meshes each; wave ≤ 4; jellies 1; moon 1 |
| Act III busiest (boarding, statuses, disaster) | ≤ 450 | statusfx ≤ 8; keg drops ≤ 3 |
| Kraken hunt | ≤ 450 | Kraken ≤ 30 (body 5, 4 tentacles × 3, eyes, shadow); warning rings ≤ 4 |
| Town walk, every plot tier 3, 8 villagers | ≤ 450 | today's worst 371 + layer ≤ 3 + kept ≤ 6 + villagers ≤ 40 |

The shipyard view shows the layer only (villagers hidden); quiz and build panels add ≈ 15 (three NPCs). The Kraken and
the next wave prebuild one mesh per frame during the fly-in; the layer rebakes behind the "Rowing to…" toast. Over
budget, drop: villagers to 6, jellies to 60, keg-drop rings, tentacles to 3.

Accessibility (SPEC2 §13 plus): no quiz timer; every status, hazard and attack has an icon and a word (violet dashed
ring + tentacle, orange ring + fuse, wave arrow); warnings announced, throttled ("Tentacle! Steer away."); nothing
flashes; reduced motion: no shake, cuts instead of the rise and plot glides; new controls are buttons ≥ 44 px. No key
clashes: `4`–`6` and `Shift` are free in battle; `E` stays "go in" ashore.

## 13. Risks

- **Specials trivialise fights** → 5 kegs of each, bosses ×0.5, stink immunity, frost and fire cancel; the bot uses kegs.
- **The Kraken too hard for a child** → telegraphs ≥ 1.6 s, an outrunnable hunt, grab auto-release, retry from the Kraken.
- **Draw calls** in the hunt and the grown town → §12 budgets in tests, one baked layer, the villager cap.
- **`main.js` (6,077 lines)** → logic lives in `mechanics3`, `statusfx`, `kraken`, `island`, `quiz`, `magazine`.
- **Test churn** → `UPGRADES` (+helm), shipyard tabs (+Magazine), 6 places, 9 cards, the Maelstrom sails on, the wheel
  default on touch: listed for the test agent like SPEC2 §11.4. Plots are static, so the walk fixture changes once.
- **Wrong or unkind quiz facts** → a checked bank, well-known history only, wrong answers never mock.

## 14. Cut list (from the top; each leaves a consistent game)

1. Island-aware greetings. 2. Anchor swing. 3. Construction montage (the boing stays). 4. Floating keg drops.
5. Coughing sailors. 6. Jellyfish. 7. ICED SOLID. 8. Kraken phase 3 (two phases, 600 hp). 9. The touch ammo fan.
10. Quiz rounds 5–6 and the mortarboard. 11. Amenities down to Bakery, Lighthouse, Market, with two house plots.
12. Level 8 (its ironbacks join L9's first wave).

**Never cut:** Squall Keys and the Kraken's Deep; the Ink Queen and the Kraken hunt with its rise, phases 1–2, grab and
retry; Frost, Fire and Stink with their looks; the helm and the touch wheel; quiz rounds 1–4; houses with villagers and
three amenities; every record validated.
