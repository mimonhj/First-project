# Voyage IV: "The Dragon's Cradle". Art and feel design (spectacle)

This design covers Voyage IV, the new foes, the construction scene, and the bigger, fully walkable island with its islanders. SPEC3's rules all hold (kid rules, storage, determinism, module boundaries, §14–§15 budgets). Everything new sits behind **`WITH_V4`** in `src/voyage.js` (`?v4=1` until go-live); with it off, the game is today's.

I follow the coordinator's defaults with three changes:
1. **Islanders far from the camera are drawn as "dolls"**, and every animal is drawn through one `BatchedMesh`. Without this the town walk view cannot hold 450 draw calls (§11).
2. **The new plots' tiers go in a new record, `pirates-ahoy-island4`.** Today's `parseIsland` drops unknown plot ids and rewrites the record, so a stale tab would erase them.
3. **The bridges that are only scenery today become walkable.** These seven rope bridges are the biggest "I can see it but can't go there" problem now.

## 1. The look

The cel-shaded style stays. **Colour temperature tells the story:**
- Level 10 is pink-gold **dawn**.
- Level 11 is violet-orange **dusk**.
- Level 12 is a teal **storm** that breaks into a **rainbow sunrise** when the spell ends.

Each sea has one landmark a child can recognise from a thumbnail: the stone King's head, the crocodile rock, the spiral-shell spires. Each new foe has one colour no other enemy uses: hornet yellow-black, net green, keg red, brass, pearl, coral pink.

---

## 2. Voyage IV: three new seas

### 2.1 How it opens

- Beating the Kraken shows Victory, now ending "…but a dragon's song drifts from the far south." `#act2-btn` reads **Sail on to the Dragon's Cradle**.
- On the title screen, card 10 reads "Drive off the Kraken". Cards 11 and 12 read "Locked".
- The title shows 12 cards in four groups. The fourth heading is "Voyage IV · The Dragon's Cradle" in `#5a2a6e`, at least 7:1 on parchment.
- From 10 skulls up, the difficulty pill shows one skull and a number ("☠ 10").
- **Migration:** if `feats.kraken ≥ 1` and `unlocked ≥ 9`, then `raiseProgress(10)`. `PROGRESS_KEY` clamps to 1..12. Levels 1–9 are unchanged.

### 2.2 The levels

Each wave has **fixed kinds plus picks from a pool**, rolled at `startLevel` by `mulberry32(n·7919 + 13 + 104729·attempt)`. `attempt` counts this session's starts of the level and is never saved. Tests pin the roll with `__game.v4.seed(s)`. The roll also picks the spawn arc (bow, pincer or astern). Main reads the rolled `state.waves` wherever it reads `def.waves` today.

**A pool only draws kinds already met (`guide.met`), so a new kind always arrives fixed and announced.**

| Lvl | Sea | Word | Wave 1 | Wave 2 | maxAtk | lead / spread | grace | Hazard | bonus |
|---|---|---|---|---|---|---|---|---|---|
| 10 | **The Drowned Kingdom** | Heroic ★10 | `trawler` + 2 of [hornet, hornet, corsair, shark] | `keglayer`, `puffer` + 1 of [trawler, hornet, ironclad, bombketch] | 3 | 0.7 / 0.9 | 4 | Tide lanes | 2000 |
| 11 | **The Firefly Bayou** | Epic ★11 | `divebell` + 2 of [hornet, trawler, puffer, skiff] | `turtlefort`, `mirage` + 1 of [divebell, keglayer, hornet] | 3 | 0.72 / 0.9 | 3 | Log-gators; lily shallows (`reefs`, ×0.5) | 2400 |
| 12 | **The Dragon's Cradle** (finale) | Ultimate ★12 | `mirage` + 2 of [divebell, hornet, keglayer, trawler, manta] | `witch` + 1 of [hornet, mirage, trawler], plus her summons | 3 | 0.72 / 0.88 | 3 | Spell gates until the Witch falls, then **the Storm Serpent** | 3200 |

Every level has 2 crates. `nextWaveAt` is 1 on levels 10 and 11, and 0 on level 12. The rumour board's ammo: L10 Chain ("Chain shot slows a Hornet"), L11 Frost ("Frost keeps a Diving Bell up top"), L12 Grape ("Grape pops puffers by the dozen").

### 2.3 What the child sees

**L10, The Drowned Kingdom.**
- **Palette:** sky `0x6f8fe0` → horizon `0xffc9b0`, a low east sun `0xffe2c0`, water `0x1a8fa8` / `0x7ff0de`, fog `0xf8d8d0` 120–360, world radius 150.
- **Fly-in:** the camera skims glassy turquoise shallows. Gold-and-blue mosaic medallions show beneath (one merged decal, `noOutline`, opacity 0.55).
- **King Coral and Queen Pearl**, two stone heads 18 u tall with coral crowns, rise from the sea. They are colliders and the first framing.
- Toppled columns form a causeway with two arches you can sail through. Gold dome-tops bob like buoys, and a drowned bell tower leans 20°.
- **Tide lanes** are bands 14 u wide of scrolling white foam chevrons (one strip mesh each, `noOutline`), with silver fish riding them.
- **Music `drowned`:** a sunken waltz. Harp and celesta over a soft tuba, a mandolin tremolo, and a bell every 8 bars.

**L11, The Firefly Bayou.**
- **Palette:** sky `0x3b2a6e` → horizon `0xff9a5a` with a huge low sun, water `0x23453a` / `0x5f9a6a`, fog `0x8a6a8a` 70–280, world radius 140.
- Mangrove roots arch over two channels you can sail through. Moss hangs and sways (one morph mesh).
- Raft-sized lily pads with pink flowers mark the shallows.
- The landmark is a rock shaped like a sleeping crocodile. Stilt shacks glow with lanterns, and a paddle-steamer wreck lies on a mudbank.
- **200 fireflies** (one InstancedMesh) each glow at 0.3–0.8 Hz, never faster than 1 Hz.
- **Music `bayou`:** a banjo-and-washboard jig with harmonica and jug bass. Frogs croak on beats 2 and 4.

**L12, The Dragon's Cradle.**
- **Palette:** sky `0x173a4a` → horizon `0x7a5aa8`, water `0x0f4a5a` / `0x2fc0b0`, fog `0x3a5a6a` 90–320, world radius 150.
- **`setDawn(k)`** eases it to a rainbow sunrise: horizon `0xffd0a0`, and a soft rainbow arc (opacity ≤ 0.35). After the win, every wake's foam turns rainbow.
- Five colossal **spiral-shell spires** (25–40 u) ring the arena. Crystal-coral arches glow cyan and magenta, pulsing at most 0.5 Hz.
- **The Coral Witch's palace** sits on a reef: brain coral and shells, with jellyfish lanterns.
- **Music:** `cradle` is a sea-witch tango (bandoneón, pizzicato strings, a celesta spell motif). `serpent` is a heroic 5/4 march (horns, taiko, choir) that turns major, with harp glissandi, when the spell breaks.

### 2.4 Hazards (`mechanics4.js`; the Lighthouse's `warnBonus` adds to every warning)

| Hazard | Rule | Telegraph | Counter |
|---|---|---|---|
| **Tide lanes** (L10) | 2 lanes (3 in wave 2), 170 u long. A ship whose centre is in a lane drifts 3.5 u/s along it ("WHEEE!" the first time). Every 24 s a lane **surges** to 6 u/s for 4 s. | Lanes are always visible. Before a surge: 2.0 s of brighter chevrons, a bell (`tidebell`), "SURGE!" | Ride them to chase or flee; cross bow-first. |
| **Log-gators** (L11) | 6 mossy logs drift on loops at 0.5 u/s. A ship within 9 u wakes one. **1.6 s** later it snaps: 8 damage to every hull in its ring (r 4), pirates included ("CHOMP!"). Then it sinks, and comes back asleep 15 s later, at least 30 u from you. | Yellow eyes pop up, a ripple ring forms ahead of the snout, a creak and "grr" (`gatorWake`), "SNAP!" | Leave the ring; lure pirates past; a shot wakes a log early ("Rise and shine!"). |
| **Spell gates** (L12) | 3 pylon pairs 18–24 u apart. Every 9–12 s (`ctx.rng`) a pair arcs for 1.2 s: 8 damage, once, to any hull crossing the 2 u band ("ZAPPED!"). The gates stop when the Witch falls. | **1.8 s**: the crystals brighten in steps (never flashing), a dotted line of sparks runs between them, a rising hum (`gateHum`), "ZAP!" | Wait, or slip through between arcs. |

---

## 3. The new foes

### 3.1 Ships (`shipTypes.js`; models at most a Man-o'-War's draw calls, bosses at most 1.3×)

Capture gold is `gold × 20 + 25`, as for every other type.

| Key | Name | hp | len/wid | speed / accel / turn | reload, guns × dmg | gold | crew / grit | engage | Flag |
|---|---|---|---|---|---|---|---|---|---|
| `hornet` | Hornet Sloop | 38 | 7 / 2.4 | 14 / 5 / 1.9 | 2.2, 1 × 4 (stern chaser) | 4 | 7 / 1.0 | 14 | `flank` |
| `trawler` | Net Trawler | 85 | 10 / 3.4 | 8 / 2.4 / 0.9 | 3.0, 2 × 4 | 8 | 12 / 1.0 | 20 | `nets` |
| `keglayer` | Keg Layer | 70 | 9 / 3.0 | 9.5 / 3 / 1.1 | 3.0, 1 × 4 | 7 | 10 / 0.9 | 26 | `kegs` |
| `divebell` | Diving Bell | 90 | 9 / 3.0 | 7 up, 9 under / 3 / 1.2 | 2.6, 2 × 6 | 9 | 10 / 1.2 | 14 | `dive` |
| `mirage` | Mirage Brigantine | 75 | 10 / 3.2 | 10 / 3.2 / 1.2 | 2.6, 3 × 4 | 9 | 12 / 1.0 | 22 | `blink` |
| `turtlefort` | Turtle Fort (mini-boss) | 260 | 15 / 7 | 4.5 / 1.5 / 0.5 | 2.4, 4 × 5, both sides | 22 | 18 / 1.3 | 22 | `shell`, `boss` |
| `witch` | The Coral Witch (boss) | 380 | 16 / 5.4 | 6.5 / 2 / 0.6 | 2.8, 5 × 5 | 35 | 24 / 1.5 | 26 | `boss`, `summoner`, `flagship` |

### 3.2 Sea creatures (not ships)

Like the Kraken, these are never `SHIP_TYPES` keys; they are pseudo-targets through `targetsFor()`. Nobody dies on screen: a beaten creature **swims home**.

| Creature | Parts and hp | Moves | Gold |
|---|---|---|---|
| Puffer Swarm (`puffer`) | 8 puffers × 8 hp | a school that follows you at 9 u/s | 2 each |
| Leaping Mantas (`manta`) | 2 × 40 hp | glide under the water at 14 u/s, as shadows | 15 each |

### 3.3 Behaviour, telegraph (every one ≥ 1.5 s: shape, sound and word), counter, look

| Foe | Behaviour | Telegraph | Counter | Look |
|---|---|---|---|---|
| **Hornet Sloop** (flanker) | Circles to your stern quarter, 12–16 u off; never in your broadside arc for more than 2 s. Her stern-chaser hit is "RUDDER NIP!": your turning ×0.6 for 3 s. | A yellow STING! icon in her tag, a yellow cone painted behind you, a rising `buzz` | Chain shot; slow down so she overshoots; rake her as she crosses | Black hull, yellow-black striped lateen sails, iron stinger bowsprit, zig-zag wake |
| **Net Trawler** (kiter, nets) | Keeps 16–22 u off. Every 7 s she throws an 8 × 8 u net at your predicted spot. Caught is "NETTED!": speed cap ×0.35 for 3 s. | 1.8 s: a green dashed square with orange floats at its corners, a creak and whoosh (`net`), "NET!" | Steer out; hold G or CUT! 0.8 s (or tap 3×); Fire on her burns her nets for 10 s; Stink drops the next one | Bottle-green hull, two net booms like insect arms, a swinging crane |
| **Keg Layer** (area denial) | Runs ahead and drops a "boom keg" every 4 s (at most 6, each lasting 20 s), armed 2 s after landing. Touching one: 10 damage to any ship ("KA-BLAM!"). A cannonball pops a keg safely ("POP!", +2 gold). | Each keg's red ring (r 3) pulses at 0.8 Hz from the moment it lands, with a fizzing `fuse`; the first keg gets a banner | Shoot the kegs; steer round them; lure pirates in | Stubby red lugger, stern chute, barrels with grumpy faces |
| **Diving Bell** (submerges) | Up 7 s (firing); dives over 2 s; under 6 s (periscope and V-wake only, untargetable, tag "DIVING"). Surfaces 12–16 u off your beam and fires 1 s later. | 1.8 s: a ring of rising bubbles, a `gurgle`, "BUBBLES!" | Leave the bubble ring, then broadside her; **Frost keeps her up 5 s**; she can be boarded only while surfaced | A round brass submarine like a diver's helmet, three porthole eyes, a periscope, a snorkel mast flying a tiny Jolly Roger; she surfaces with "BLOOP!" |
| **Mirage Brigantine** (teleports) | Every 12 s she blinks to a spot at least 14 u from you. After the first blink she leaves **one** decoy, which takes no damage; a hit pops it ("Just a mirage!"). | 1.5 s: a sparkle ring at the destination (and on the minimap), a glass-chime `blink`, "BLINK!"; the decoy's tag reads "Mirage?" with no crew dots | Watch the ring; shoot the one with crew dots; Stink stops her blinking for 8 s | Mother-of-pearl hull (pink → lilac → mint), gauze sails, crystal figurehead; she fades over 1.5 s, never flickers |
| **Turtle Fort** (L11 mini-boss) | Every 20 s it goes **SHELL UP**: ×0.25 damage for 5 s while the fort keeps firing. Capture it, or grape its crew to the notch: the pirates leap onto a raft and the turtle is **freed** ("Free at last!", 465 gold) | 2 s: its eyes squeeze shut, the shell rim glows gold, a deep `shell` hrrmph, "SHELL UP!" | Fire between shells; grape the crew; Stink makes it sneeze (no shell for 10 s) | A smiling green turtle with a skinned head and flippers, carrying a wooden fort with 4 cannon towers and a ladder |
| **Puffer Swarm** | A puffer within 5 u inflates, then bursts its spikes (r 3) for 3 damage, at most 4 at once. Then it swims off for 4 s and returns. A hit sends it home for good ("PFFT!"). | 1.5 s: it swells to double size, its spikes slide out, a yellow ring, a squeaky `puff`, "PUFF!" | Grape (each ball sends one home); turn away; Stink scatters them for 4 s | Round, yellow-orange and spotted, with big eyes; they swim home with a happy wiggle |
| **Leaping Mantas** | Every 7 s one leaps across your bow and lands ahead: 9 damage and a 4 u shove ("SPLASH!"). After 40 damage or 3 leaps it swims home. | 1.6 s: a dark oval shadow grows inside a ring (r 5), a rising `manta` whoosh, "SPLASH ZONE!" | Turn as the shadow grows; hit it in the air for ×2 ("BELLY FLOP!") | Deep blue, a white belly, a cheerful face |
| **The Coral Witch** (L12 boss, summoner) | Every 14 s she summons a puffer swarm or 2 mantas (one group alive at a time). When she falls, the summons swim home, her crew flee (SPEC3 `FLEE`) and the gates go dark. She can be captured for 805 gold. | 2 s: a purple spiral round her barge, a blaring `conch`, "SHE'S CALLING!" | Focus the barge; grape her crew | A coral-crusted barge with a conch throne and a green cauldron; the Witch (people.js) wears purple, has sea-green hair and a shell crown |

### 3.4 The finale: Tempesta, the Storm Serpent (`serpent.js` pure, `serpentView.js` THREE)

**The rise.** The sea hushes for 3 s ("Something coils below…") while the crew patches the hull, as at reinforcements.
- A ring of crystal humps breaks the water, 40 u across.
- A frilled head, three times the Sea Biscuit's height, rears up with a roar that sounds hurt, not cruel.
- The camera takes a low hero shot from your stern (a cut under reduced motion).
- Banner: "THE STORM SERPENT! Crack the crystals on her coils!" Any key or tap skips the rise.

**The beast.** She is storm-violet with silver-tipped scales, a sail-like frill, dragon whiskers and big, sad eyes. The spell is three cyan crystals on her humps and a crystal crown. Her body is **one rigidly skinned 14-bone chain** (the people.js technique), and a travelling sine arcs the coils through the water. The view costs at most 34 calls.

| | **The Coils** (2700 → 1350) | **The Spell** (1350 → 0) |
|---|---|---|
| Moves | Circles you at 26–34 u, swimming 9 u/s | Head up 25 u off your beam. She dives every 15 s; a bubble trail shows where she will rise, 2 s ahead |
| Targets | Crystals (450 each, ×1.5 "CRACK!"); body ×0.4; head ×1 | Crown ×1.5; head ×1 |
| Attacks | **Tail sweep** every 8 s: a curved foam arc for 1.8 s, then 10 damage and a shove. **Coil ring** every 22 s: a foam circle (r 16) with a sparkle-lined gap at least 8 u wide that is always open; 2.5 s later the coils stand as walls for 5 s | **Storm breath** every 9 s: her throat glows 1.8 s, a 40° cone 24 u long is painted on the water, then 12 damage. Tail sweeps continue |
| Specials | Frost: swim ×0.5, warnings +0.5 s. Fire: crystals burn 3 hp/s. Stink: "ACHOO!", 2 s with no attack, and her head drops low | Same |

**The ending.** The crown cracks. The screen gets one soft white bloom (opacity ≤ 0.25). "THE SPELL IS BROKEN!"
- Over 2 s her scales ripple from violet to **rainbow**, and the sky turns to sunrise.
- She nuzzles your bow and purrs (`serpentPurr`). A pearly egg hatches **Pip**, a baby sea dragon, onto your bowsprit ("Pip wants to come home with you!").
- The Witch's hoard pays 1,200 gold on every L12 win.
- Victory: "Tempesta is free, and the Dragon's Cradle sings again! You are the Dragon Friend!"
- The checkpoint **Try again from the Serpent** reuses SPEC3 §5.7.6.
- Target fight length: a 2–3 min median for bot v4 on a tier-2/3 ship.

### 3.5 Meeting a new foe

The first time a kind spawns on this save:
- it gets **grace 4 s** (no attack);
- a **NEW FOE!** card shows for 3.5 s: its silhouette icon, its name and one counter line ("Net Trawler: steer out of the green square, or hold G to cut the net!");
- an edge arrow points at it if it is off-screen;
- a two-note bugle plays (`newFoe`).

The tavern's captain's log gains a **Spotter's Guide**: a card for each kind met, with its icon, what it does and how to beat it, and "?" silhouettes for kinds not met yet.

### 3.6 Battle budgets (SPEC3 §14 method)

| Scene | Budget | How |
|---|---|---|
| V4 sea alone | ≤ 220 | merged statics; lanes 1 mesh each; fireflies 1; gate arcs 3 + sparks 1 |
| Level start | ≤ 310 | |
| Busiest (4 ships, a swarm, 6 kegs, 6 gators, rings) | ≤ 450 | kegs and rings 3; the swarm 3; gators 4 (instanced body and jaw, with ink twins); mantas ≤ 4 each |
| Serpent fight | ≤ 450 | the serpent ≤ 34; no ships |

---

## 4. The whole island, walkable

### 4.1 The rule a child can learn

**If it is made of planks or sand, you can walk on it.**
- Roofs, sea rocks, hulls, rowboats, prize ships and the visiting cutter stay scenery.
- Today seven visible rope bridges can't be walked: `s1S2`, `tavernS16`, `yardS7`, `tavernS3`, `gardenS13`, `s13S14`, `s7S17`. They gain `{ walk }`; their curves already exist.
- Every shack platform gets a front **porch** walk area. The building stands on a fixed **pad** at the back: the tier-3 footprint, a blocker from tier 0 on. So the walk data still never changes with tiers (SPEC3 §8.1).

### 4.2 Districts

The island grows from about 66 × 42 u to 92 × 58 u. **Every district is on at least one loop**, so the captain can always walk back the way he came, or round the other side, and is never walled in.

| District (colour cue) | Decks: x, z; deck y | Walk links | Landmark |
|---|---|---|---|
| **Harbour**, today (red-white-blue) | pier, plaza, tavern and tower rafts, yard, Polly's, garden | — | tavern, lookout tower |
| **Windward Row** (mint) | s16 (−17.6, −17.4), s8 (−24, −9), s14 (−29, −4.5), s13 (−21.5, 2), s15 (−31, −16), s6 (−26, −26); y 1.3 | `tavernS16`, `gardenS13`, `s13S14` made walkable; new: `s16S8` rope 6 u, `s8S14` plank 2.5 u, `s14S15` "Market Walk" 6 u, `s15S6` 5 u, `s6Tower` rope 3.5 u | windmill |
| **Lantern Lane**, the back row (orange) | s3 (−0.5, −29.5), s4 (−7.6, −33.6), s10 (−17.5, −38), s12 (2, −40), s5 (9.2, −31.5), s11 (18, −36); y 1.5–1.8 | `tavernS3` made walkable (a ramp 1.3 → 1.6); **the High Walk**, a planked stilt boardwalk with a lantern post every 4 u, `s10–s4–s3–s12–s5–s11`; `s5S2` 5 u | library clock |
| **Shipwright's Point** (teal-gold) | s2 (13.4, −23.2), s7 (21.5, −22.5), s17 (29.5, −25), s9 (25, −6), s18 (35, −12.5) | `s1S2`, `yardS7`, `s7S17` made walkable; new: `s2S7` 3 u, `yardS9` 3 u, `s9S18` "Lighthouse Walk" 6 u, `s11S17` "Long Bridge" with a mid-span float at (24, −31) r 1.6, where a fiddler plays | lighthouse beam |
| **Shell Beach**, a new islet (coral) | a sand mound at (43, −24), r 8, profile [[0, 1.45], [5, 1.2], [8, 0.95]] | `s18Beach` boardwalk 6 u, `s17Beach` rope 6 u | whale-bone arch, 7 u |
| **Sparrow Hill**, a new islet (meadow green) | a hill at (−36, −38), r 10, profile [[0, 6.0], [3, 5.6], [6, 3.6], [8.5, 1.8], [10, 1.3]]; a ring path round the summit pad | `s6Hill`, a stone causeway with 3 flights of steps (9 u, 1.3 → 1.8); `s10Hill` rope 8 u; a switchback stair link; **the zip line** | the observatory dome, ≈ 14 u, the island's highest point |

**Notes for builders:**
- The hill's mass is a stack of camBlocker cylinders, so the boom never enters it. Each slope step stays within `CLIMB`.
- **`walk.graph()` gets a spatial hash for its edges**: today's pairwise loop is O(n²), and n roughly doubles.
- **The zip line** is a place: `E` reads "Ride the zip line!" It runs one way, summit → tower raft, 22 u in 4 s, his hat flapping. Under reduced motion it is a fade. Both ends are on the main graph, so it is never the only way back.

### 4.3 Readable from the walk camera

1. **One material language.** Walkable means honey planks with dark gaps, or pale sand, and nothing else uses those tones. Every bridge has rope rails and a lantern at each mouth. Stairs and ramps have white step edges.
2. **Signposts** at all 14 new junctions: arrow boards with the district's icon, colour and one word ("Beach", "Hill", "Harbour"). They are baked, so they cost 0 calls.
3. **Arches** at each district's entrance carry its name ("LANTERN LANE", hung with paper lanterns). Walking under one shows a 2 s toast and says it in `#town-live`.
4. **Five landmarks**, one per direction: lighthouse east, windmill west, observatory north-west, library clock north, whale-bone arch north-east. The tavern's chimney smoke means "home".
5. **The High Walk's lanterns** glow even at noon (vertex glow), so the raised back row reads as one ribbon.
6. **Camera clearance** is deck + 0.9 everywhere, including the hill. On the summit the pitch is at least 0.3, so the view looks over the town.
7. **The Harbour menu** gains **Walk to…**, which auto-walks to any of the six districts, and a painted **Island map** (DOM SVG) with a "You are here" sparrow and tappable district names. Keyboard and screen-reader users never have to walk.

---

## 5. The islanders

### 5.1 People (people.js, `share: true`, `detail: 'low'`)

New options follow the determinism rule: no `rng()` draws unless given, and appended at the end of `resolveLook`.
- **Hats:** `chef`, `souwester`, `sunhat`, `startop`.
- **Tools:** `net`, `basket`, `book`, `tongs`, `drum`, `spyglass`.
- **Body:** `apron: true`.

Routines reuse the existing actions. Each islander has a loop in a 120 s "ashore day".

| Islander (building) | Look | Routine | Lines |
|---|---|---|---|
| Finn the fisher (Fishing Hut) | old man, yellow sou'wester and oilskin | fishes off s9 (`fish`); carries a `basket` to market; dozes (`sit`) | "Fish are biting, Cap'n!" · "Saw a log wink at me once." |
| Ada the smith (Smithy) | woman, `apron`, soot cheeks | hammers at the anvil (sparks); dunks iron (steam) | "Sharp as a shark's tooth!" |
| Miss Page (Library) | woman, glasses, `book` | reads on the steps; carries books (`carry`) | "Shh! …Oh, ahoy, Captain!" |
| Prof. Starling (Observatory) | old woman, `startop`, `spyglass` | points at the sky; paces the summit | "Barnacle is my little brother." |
| Hettie Hay (Farm) | woman, `sunhat` | carries hay; leans on the fence | "Mind the goats: they nibble hats!" |
| Coral the keeper (Aquarium) | sea-green shirt, shell necklace, `bucket` | feeds the tanks; wades in the pools | "The puffers here are friendly!" |
| Sir Dustin (Museum) | old man, monocle, feather duster | dusts the trophies (`scrub`) | "Do NOT touch the Kraken's pearl." |
| The Shanty Band ×3 (Stage) | `fiddle`, `drum`, a singer | a 16 s set, then an 8 s bow | "♪ Yo ho, heave ho! ♪" |
| Granny Wren and the kids (Treehouse) | an old woman and 2 kids | the kids play tag (`run`); Granny knits (`sit`) | "Are you a REAL pirate?" |
| Bosun Jib and friends (Wreck House) | pirates with grey braids | lean on the rail telling tales | "In my day the Kraken was THIS big!" |
| Beachcombers (Shell House) | a kid and a man in `straw` hats | build sandcastles; stroll the tide line | "Found a shell shaped like your hat!" |

### 5.2 Animals (`critters.js`)

| Animal | Where | Behaviour | Reaction to the captain |
|---|---|---|---|
| Cats (tabby, black, calico) | harbour, fishing hut, library | curl on barrels; stalk gulls; follow Finn | "Purr…"; rub round his legs if he stands still |
| Dogs (spotted pup, shaggy sea-dog) | harbour, treehouse | chase the kids; dig on the beach | wag; one soft "Woof!" |
| Parrots (red, green, blue) | Wreck House, market | perch, hop, short flights | "Pieces of eight!" (`squawk`) |
| Goats (white, brown) | Sparrow Hill (one on the farm roof) | graze; climb rocks | "Meh-eh!" |
| Monkeys | treehouse | swing on a rope; peel bananas | chatter, a cheeky wave |
| Crabs | Shell Beach | scuttle sideways | duck into their shells |
| Sea turtles | beach, aquarium pool | crawl to the water; hatchlings at the Shell House at tier 3 | blink |
| Pip the sea dragon (after L12) | aquarium pool, pier | loops round the pier | splash and chirp |

### 5.3 Rules that keep the walking bug fixed

- Islanders are `walker()`s or `person()`s in `env.folk()`. They inherit LOOK-2's waiting and the 0.25 s squeeze-past.
- Their paths keep SPEC3 §8.4's rules: no pause within 2 u of a mouth, door, place circle or the gangplank, and at most 2 walkers on a bridge loop.
- **Animals never block.** If the captain comes within 1.2 u, the animal hops 1.5 u aside (visual only).
- **Talk:** near an islander, with no door prompt showing, `E` or the Go-in button (which reads **Talk**) makes them turn, wave and say 2–3 lines. `E` or a tap advances; walking away ends the chat. A door always wins over a chat.

### 5.4 The crowd director (`islanders.js`, pure)

- `roster(island, island4, feats, seed)` lists every islander and animal, with its look, home, workplace and routine.
- `plan(captain, list, t)` decides who is drawn, nearest first:
  - **full** detail: at most 12 islanders, within 28 u;
  - **dolls**: at most 16, within 45 u. A doll is a merged static silhouette (2 poses), batched with the animals and bobbing along its path;
  - the rest are indoors (lit windows).
- One cap covers every full-detail person in view: townsfolk, villagers, islanders and NPCs. It is P₀ + 2, where Stage 0 measures P₀ as today's peak at the 30 × 8 probe.
- Under V4 the townsfolk cull radius drops from 40 to 34 u.

---

## 6. The new buildings (`island.js` `PLOTS4`; record `pirates-ahoy-island4`)

| id | Tiers 1 / 2 / 3, and how each looks (each adds to the last) | Plot | Costs | Perk at tier 1 / 2 / 3 | Max h |
|---|---|---|---|---|---|
| `treehouse` (home) | Rope Swing House (a banyan and swing) / Tree Hut (rope ladder) / Treetop Lodge (twin huts, a rope bridge, a crow's-nest flag) | Sparrow Hill east (−31, −41) | 150 / 350 / 650 | 2 / 4 / 6 villagers | 11 |
| `wreckhouse` (home) | Upturned Hull (a door cut in) / Two-Deck Wreck / Admiral's Wreck (figurehead porch, mast flying laundry) | s17 | 150 / 350 / 650 | 2 / 4 / 6 villagers | 8 |
| `shellhouse` (home) | Shell Hut (pink conch) / Spiral Shell / Pearl Palace (scallop balcony) | Shell Beach (46, −20) | 150 / 350 / 650 | 2 / 4 / 6 villagers | 8 |
| `fishing` | Fishing Shack / Smokehouse (smoke) / Fish Market (a giant wooden fish sign) | s9 | 250 / 550 / 950 | a net holds you 2.5 / 2 / 1.5 s (3 s without) | 7 |
| `smithy` | Forge (orange glow) / Smithy (brick chimney) / Iron Works (water wheel) | s4 | 250 / 550 / 950 | cutting ropes, nets, tentacles and coils takes a 0.65 / 0.5 / 0.4 s hold (0.8 s without) | 8 |
| `library` | Reading Nook / Library (columns) / Grand Library (clock tower; the hands move each minute) | s12 | 250 / 550 / 950 | minimap shows crates / + hazards from the start / + 1 crate a level | 12 |
| `observatory` | Star Telescope / Observatory (white dome) / Star Dome (turns at 0.05 rad/s) | Hill summit | 250 / 550 / 950 | a level's first hazard holds off 5 / 10 / 15 s ("The stars say: calm seas!") | 8 |
| `aquarium` | Rock Pool / Aquarium (glass front) / Grand Aquarium (glass dome, turtle pool) | Shell Beach (41, −30) | 250 / 550 / 950 | sea creatures (puffers, mantas, gators, the Serpent) do −10 / −20 / −30 % damage | 7 |
| `stage` | Busker's Box / Shanty Stage / Opera Pier (scallop shell, lanterns) | s11 | 250 / 550 / 950 | boarding strength ×1.05 / 1.10 / 1.15 ("The crew sings!") | 7 |
| `museum` | Trophy Shed / Museum / Grand Museum (a pearl on the dome) | s5 | 250 / 550 / 950 | capture gold +5 / +10 / +15 % | 9 |
| `farm` | Goat Pen / Barn / Orchard Farm | Hill west (−42, −35) | 250 / 550 / 950 | +1 / +2 / +3 crew at level start (at most the tavern's cap + 3) | 6 |

Each building brings the islanders and animals in §5.

**Totals:** homes 3,450 and amenities 14,000, so **17,450** for the new plots. A first clear of Voyage IV banks about 10,000–12,500.

**Ranks** go by tiers built across all 21 plots:
- Grand Port at 45, then **Legend Isle** at 63. Legend Isle wins the **Harbour Master's coat** (sea-blue with gold anchors).
- The feat `island` keeps today's meaning (0..30), so the Governor's coat is unchanged. A new feat `island4` counts 0..33.

**The Museum shows your feats:** a figurehead for each captured type (from `feats.prizes`), the Kraken's pearl, and Tempesta's scale.

---

## 7. Show me the house being built: the construction scene (`construction.js`)

### 7.1 Beats: a new building takes 9.4 s; an upgrade takes 7.6 s

| # | Stage | Starts | Lasts | What you see | Sounds |
|---|---|---|---|---|---|
| 0 | **Builders, ho!** | 0.0 | 1.0 | The camera glides (0.9 s) to frame the tier-3 envelope and the porch. Bess whistles. **Chip** the carpenter (`hammer`), **Mortar** the mason (`crate`) and **Dab** the apprentice (a kid with a paint `bucket`) push a plank cart in from the porch | `whistle`, footsteps, cart |
| 1 | **Foundation** | 1.0 | 1.2 | From tier 0, the shack's roof lifts away. Six stone blocks drop into a chalk outline, each with a dust puff | `thud` ×6 |
| 2 | **Frame** | 2.2 | 1.6 | Corner posts pop up one by one, beams snap across, the scaffold rises with a ladder, and Chip climbs it | `tok` ×8, knocks |
| 3 | **Walls** | 3.8 | 1.6 | The walls **rise from the ground**: a clip plane sweeps up to the eaves, with a plank band and sawdust puffs at the working edge | `saw`, knocks |
| 4 | **Roof** | 5.4 | 1.2 | The reveal climbs from the eaves to the top in 4 tile bands; the chimney pops on last | `clack` ×4, `pop` |
| 5 | **Finishing touches** | 6.6 | 1.2 | Dab's paint sweeps the walls from raw timber to their colours. Windows light. Boxes, sign and weathervane pop in with sparkles. The scaffold folds down and bunting unfurls (the bunting Stage 4 found missing) | `brush`, `chime` ×3 |
| 6 | **Moving in** | 7.8 | 1.6 | The door opens. The new islanders step out with a suitcase and the cat or goat, and wave: "Thank you, Captain!" A confetti puff (≤ 40 bits); Bess cheers | `door`, `cheer`, `tada` |

- **Upgrades** replace stage 1 with a 0.4 s scaffold round the old building. Stages 2–4 reveal only what rises above the old top, after the old roof lifts away.
- **`#build-live`** announces twice: "Building the Treehouse…", then "Treehouse built! Granny Wren, Kip, Moss and a monkey moved in."

### 7.2 Controls and states

- **Skip:** one tap or any non-modifier key jumps to the end. The building stands and the islanders wave from the porch for 1.0 s. The tap or key that skips does nothing else.
- **Caption strip:** at the top, 44 px tall: the stage name, six pips and a **Skip** `<button>` (44 × 44).
- **Phones:** in portrait, the panel's bottom sheet shrinks to the caption strip during the scene, then returns.
- **Camera:** an orbit of ±10° over the scene.
- **Reduced motion:** no glide, orbit, squash or flying confetti. Four stills (foundation, frame, walls and roof, done) cross-fade every 1.2 s with the same sounds, about 5 s in all.
- **Storage:** the record is saved **before** the scene (record first, then the chest). Closing the page mid-scene keeps the building.

### 7.3 Drawing it

- The dev layer rebakes without the plot (today's `rebuildDev({ [id]: null })`). The old and new tiers are drawn as temporary meshes from their baked chunks (≤ 5 calls each).
- The new tier gets a rising `clippingPlanes` plane: OutlineEffect already copies it, and `localClippingEnabled` is on in the town only. The plank band and sawdust at the clip line hide the hollow cut.
- The paint wipe is an `onBeforeCompile` mix of raw timber and the vertex colour below `uPaint`.
- Frame posts: an InstancedMesh with an ink twin (2 calls). The scaffold is today's. The builders are 3 people (15 calls).
- Peak cost: today's build view (≤ 96) plus about 40.

---

## 8. Controls

| Action | Keyboard | Touch |
|---|---|---|
| Cut a net, rope, tentacle or coil | hold `G` (0.8 s, less with a Smithy), or tap 3× | hold **CUT!** |
| Talk to an islander | `E` | **Talk** (the Go-in button) |
| Ride the zip line | `E` at the post | **Go** |
| Walk to a district | Harbour menu (`P`/`Esc`) → Walk to… | ☰ → Walk to…, or the map |
| Skip a rise, a fly-in or the construction scene | any key | tap (or **Skip**) |

No new battle keys or act-pad buttons; the places bar keeps six.

---

## 9. Saves and migration

| Key | Format | Rules |
|---|---|---|
| `pirates-ahoy-unlocked` | integer | 1..12; `kraken ≥ 1 && unlocked ≥ 9` → 10 |
| `pirates-ahoy-island4` (new) | `{"v":1,"t":{11 ids}}` | `parseIsland4`: ≤ 4 KB, plain integers 0..3, known ids only, never throws, rewritten when it needed fixing; two tabs take the larger tier |
| `pirates-ahoy-guide` (new) | `{"v":1,"met":0}` | a bitmask over `GUIDE_KINDS`; only ever goes up; tabs merge with OR |
| `pirates-ahoy-feats` | + `dragon` (0..1), `island4` (0..33) | merged by max |
| `pirates-ahoy-look` | accepts `pet.seadragon` (`dragon ≥ 1`) and `coat.harbour` (63 tiers) | trophies |

Purchases write `island4` first, then the chest, or nothing moves ("Couldn't save…"). The Serpent's checkpoint is never saved.

---

## 10. Modules and APIs

| Module | Kind | API |
|---|---|---|
| `src/voyage.js` | changed | `WITH_V4`; `LEVELS` gains `ACT4_LEVELS`; `ACT4_TEASER` |
| `src/act4.js` | new | `ACT4_LEVELS` (§2.2, plus `pools: [{ fixed, pick, from }]`) |
| `src/mechanics4.js` | new, pure | the tables `TIDES GATORS GATES FLANK NETS KEGS DIVE BLINK SHELL SUMMON PUFFER MANTA`; `rollWaves(def, rng, met)`; `createMechanics4(ids, ctx)` → the SPEC3 hook shape + `creatures()`, `hold()`, `visuals()`; `composeMechanics` takes a third instance |
| `src/serpent.js`, `src/serpentView.js` | new | `SERPENT`; `createSerpent(ctx)` with the Kraken's shape; `createSerpentView(scene, opts) → { prepare, update, riseCamera, dispose }` |
| `src/creatures.js` | new, THREE | instanced views of puffers, mantas, gators and kegs |
| `src/env/drowned.js`, `bayou.js`, `cradle.js` | new | the env contract + `tideLanes`, `gatorLoops`, `gatePairs`, `serpentArena`, `setDawn` |
| `src/ships.js` | extended | builders for the seven ship keys; `statusAnchors` |
| `src/island.js` | extended | `PLOTS4`, `RANKS4`, `defaultIsland4/parseIsland4/serializeIsland4`, `build4`, `perks4(s) → { netTime, cutHold, mapLevel, calm, creatureMul, boardMul, captureMul, crewAdd }` |
| `src/islandPlan.js` | new, pure | `DISTRICTS`, decks, links, profiles, signposts, islander paths (Node walk tests load it) |
| `src/env/sparrowDistricts.js` | new, THREE | `buildDistricts(helpers) → { walk, bakeInto, anim, dispose }`, with its **own** rng (`mulberry32(0x5EA4)`), so sparrow's `rand()` order is untouched |
| `src/buildings4.js` | new, THREE | `kit(id, tier) → Group`, `stageInfo(id, tier) → { footprint, eave, top, door, porch }` |
| `src/construction.js` | new, THREE | `createConstruction(ctx) → { start(plot, from, to, { reduced }), step(dt), skip(), get running, get stage, dispose() }` |
| `src/islanders.js` | new, pure | `ISLANDERS`, `LINES`, `roster()`, `plan()`, `routinePose(i, t)` |
| `src/critters.js` | new, THREE | `createCritters(scene, opts) → { set(list), update(t, dt, captain), dispose() }`: one `BatchedMesh` plus an inverted-hull ink twin (2 calls); fallback one InstancedMesh per species |
| `src/people.js` | extended | the §5.1 options |
| `src/env/sparrow.js` | seam | calls `buildDistricts`; the 7 bridges' `walk`; porches; `PLOTS4`; `setIsland4`; islanders in `folk()` |
| `src/townMode.js`, `src/buildPanel.js` | extended | the construction view; Talk; Walk to… and the map; the panel grouped by district, with a **Show me** on each row |
| `src/audio.js` | extended | scenes `drowned bayou cradle serpent`; SFX `buzz net fuse gurgle blink shell puff manta conch gatorWake gateHum tidebell newFoe serpentRoar serpentPurr whistle thud tok clack brush chime door tada zip woof meh purr` |
| `__game.v4` | test API | `seed(s)`, `waves`, `guide`, `island4 { get, set, build(id) }`, `serpent` (like `kraken`), `construction { stage, skip() }`, `crowd.plan` |

---

## 11. Town draw calls (`?quality=low`, 1280×720; the probe grows to 60 spots × 8 headings)

| Item | Calls | How |
|---|---|---|
| Today's worst: every old plot at tier 3, 8 villagers | 401 | measured in Stage 4 |
| The new districts' statics (decks, High Walk, bridges, hill, beach, signs, arches) | +0 | merged into the town bake (check the 1.5M-triangle frame) |
| The development layer, 21 plots | +6 | split into old and new halves so a rebake stays ≤ 40 ms |
| Animated parts (dome, water wheel, clock, forge glow, aquarium bubbles) | +6 | |
| Animals and dolls | +2 | one BatchedMesh plus its ink twin |
| Full-detail people beyond today's peak | +10 | the P₀ + 2 cap |
| **Worst planned** | **425** | ≤ 450. The shipyard view hides islanders and dolls: about 330 |

**Drop order:** dolls 16 → 8; full islanders 12 → 8; the band; the water wheel and clock; fireflies 200 → 100.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| A town view over 450 | the crowd cap; batched critters; the 60 × 8 probe before art polish |
| `walk.graph()` slowing down | the spatial hash; a Node timing check under 50 ms |
| Walkers deadlocking on new bridges | §5.3; `ashore.cjs` crosses every bridge with the most islanders out |
| The decoy confusing a child | at most one, a "?" tag, no crew dots |
| The BatchedMesh ink twin failing on SwiftShader | per-species InstancedMesh (+12), in budget with dolls at 8 |
| sparrow.js (6,700 lines) as a bottleneck | new art in three new modules behind a thin seam |

## 13. Cut first (each cut leaves a consistent game)

1. The Mirage decoy.
2. The zip line.
3. The Island map (Walk to… stays).
4. Talk chats (bubbles stay).
5. The Farm and the Stage (9 new buildings remain).
6. Dolls.
7. The Coil ring.
8. Mantas (the Witch summons puffers only).
9. The scene's orbit and confetti.

**Never cut:** the walkable bridges and porches, every 1.5 s telegraph, the construction stages, the NEW FOE! cards.
